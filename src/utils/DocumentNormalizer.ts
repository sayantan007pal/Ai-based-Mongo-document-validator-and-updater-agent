import { logger } from './Logger';

/**
 * Document Normalizer - Pre-processes documents to fix common issues before validation
 */
export class DocumentNormalizer {
  /**
   * Normalize a coding question document
   */
  static normalize(document: any): any {
    const normalized = { ...document };

    try {
      // Normalize difficulty (case-insensitive to proper case)
      normalized.difficulty = this.normalizeDifficulty(normalized.difficulty);

      // Normalize slug (ensure lowercase-with-hyphens)
      if (normalized.title && !normalized.slug) {
        normalized.slug = this.generateSlug(normalized.title);
      } else if (normalized.slug) {
        normalized.slug = this.normalizeSlug(normalized.slug);
      }

      // Remove MongoDB _id from nested objects (clean up)
      if (normalized.testCases && Array.isArray(normalized.testCases)) {
        normalized.testCases = normalized.testCases.map((tc: any) => {
          const { _id, ...rest } = tc;
          return rest;
        });
      }

      // Ensure question_id exists (use _id if missing)
      if (!normalized.question_id && normalized._id) {
        normalized.question_id = normalized._id.toString();
      }

      // Clean up extra whitespace in strings
      if (normalized.content) {
        normalized.content = normalized.content.trim();
      }

      // Ensure arrays exist (don't send null/undefined)
      if (!normalized.topic_tags || !Array.isArray(normalized.topic_tags)) {
        normalized.topic_tags = [];
      }
      if (!normalized.constraints || !Array.isArray(normalized.constraints)) {
        normalized.constraints = [];
      }
      if (!normalized.testCases || !Array.isArray(normalized.testCases)) {
        normalized.testCases = [];
      }

      logger.debug('Document normalized', {
        questionId: normalized.question_id,
        changes: this.getChanges(document, normalized),
      });

      return normalized;
    } catch (error) {
      logger.error('Failed to normalize document', {
        error: (error as Error).message,
      });
      return document; // Return original if normalization fails
    }
  }

  /**
   * Normalize difficulty to proper case
   */
  private static normalizeDifficulty(difficulty: any): string {
    if (typeof difficulty !== 'string') {
      return 'Medium'; // Default
    }

    const lower = difficulty.toLowerCase();
    switch (lower) {
      case 'easy':
        return 'Easy';
      case 'medium':
        return 'Medium';
      case 'hard':
        return 'Hard';
      default:
        return difficulty; // Keep as-is if unrecognized
    }
  }

  /**
   * Generate slug from title
   */
  private static generateSlug(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Normalize existing slug
   */
  private static normalizeSlug(slug: string): string {
    return slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '') // Remove invalid chars
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Get list of changes made during normalization
   */
  private static getChanges(original: any, normalized: any): string[] {
    const changes: string[] = [];

    if (original.difficulty !== normalized.difficulty) {
      changes.push(`difficulty: ${original.difficulty} → ${normalized.difficulty}`);
    }
    if (original.slug !== normalized.slug) {
      changes.push(`slug: ${original.slug} → ${normalized.slug}`);
    }
    if (!original.question_id && normalized.question_id) {
      changes.push(`question_id: added from _id`);
    }

    return changes;
  }

  /**
   * Validate that normalization didn't break critical fields
   */
  static validateNormalization(original: any, normalized: any): boolean {
    try {
      // Ensure _id is preserved
      if (original._id && normalized._id?.toString() !== original._id?.toString()) {
        logger.error('Normalization broke _id field');
        return false;
      }

      // Ensure question_id is preserved
      if (original.question_id && normalized.question_id !== original.question_id) {
        logger.error('Normalization broke question_id field');
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Failed to validate normalization', {
        error: (error as Error).message,
      });
      return false;
    }
  }
}
