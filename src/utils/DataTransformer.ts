import { CodingQuestion, LanguageCode, TestCase } from '../models/CodingQuestion';
import { logger } from './Logger';

/**
 * Data Transformer - Converts missing.json documents to valid schema format
 */
export class DataTransformer {
  /**
   * Transform a raw document from missing.json to valid CodingQuestion format
   */
  static transformDocument(rawDoc: any, index: number): CodingQuestion | null {
    try {
      // Generate question_id from slug or title
      const questionId = rawDoc.slug || this.generateSlug(rawDoc.title);

      // Transform difficulty - capitalize first letter
      const difficulty = this.normalizeDifficulty(rawDoc.difficulty);

      // Transform tags field name
      const topicTags = rawDoc.tags || rawDoc.topic_tags || [];

      // Transform constraints - convert string to array if needed
      const constraints = this.normalizeConstraints(rawDoc.constraints);

      // Transform test cases
      const testCases = this.transformTestCases(rawDoc.testCases || []);

      // Generate or validate slug
      const slug = rawDoc.slug || this.generateSlug(rawDoc.title);

      // Ensure starterCode has all 5 languages
      const starterCode = this.ensureAllLanguages(rawDoc.starterCode, 'starter');

      // Generate solutionCode if missing (placeholder implementations)
      const solutionCode = this.generateSolutionCode(starterCode);

      // Ensure inputFormat has code blocks
      const inputFormat = this.normalizeInputFormat(rawDoc.inputFormat);

      // Ensure outputFormat exists
      const outputFormat = rawDoc.outputFormat || 'Output format not specified';

      // Build the transformed document
      const transformed: CodingQuestion = {
        question_id: questionId,
        title: rawDoc.title,
        difficulty: difficulty as 'Easy' | 'Medium' | 'Hard',
        slug: slug,
        topic_tags: topicTags,
        content: rawDoc.content,
        constraints: constraints,
        testCases: testCases,
        starterCode: starterCode,
        solutionCode: solutionCode,
        inputFormat: inputFormat,
        outputFormat: outputFormat,
      };

      return transformed;
    } catch (error) {
      logger.error('Failed to transform document', {
        index,
        title: rawDoc.title,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Normalize difficulty to proper enum case (Easy, Medium, Hard)
   */
  private static normalizeDifficulty(difficulty: string): string {
    if (!difficulty) return 'Medium';

    const normalized = difficulty.toLowerCase();
    if (normalized === 'easy') return 'Easy';
    if (normalized === 'medium') return 'Medium';
    if (normalized === 'hard') return 'Hard';

    // Default to Medium if unrecognized
    return 'Medium';
  }

  /**
   * Convert constraints to array format if it's a string
   */
  private static normalizeConstraints(constraints: any): string[] {
    if (Array.isArray(constraints)) {
      return constraints.filter(c => typeof c === 'string' && c.trim().length > 0);
    }

    if (typeof constraints === 'string') {
      // Split by newlines and filter empty lines
      return constraints
        .split('\n')
        .map(c => c.trim())
        .filter(c => c.length > 0);
    }

    // Default constraint if none provided
    return ['No constraints specified'];
  }

  /**
   * Transform test cases to match schema
   */
  private static transformTestCases(rawTestCases: any[]): TestCase[] {
    if (!Array.isArray(rawTestCases) || rawTestCases.length === 0) {
      // Return a default test case if none provided
      return [{
        id: 1,
        input: '0\n',
        expectedOutput: '0\n',
        description: 'Default test case',
        original_input: '0',
        original_output: '0',
      }];
    }

    return rawTestCases.map((tc, index) => {
      // Convert id to number if it's a string
      const id = typeof tc.id === 'string' ? parseInt(tc.id, 10) || (index + 1) : (tc.id || index + 1);

      // Ensure input and output have proper format
      const input = tc.input || '0\n';
      const expectedOutput = tc.expectedOutput || '0\n';

      return {
        id: id,
        input: input,
        expectedOutput: expectedOutput,
        description: tc.description || `Test case ${id}`,
        original_input: tc.original_input || input,
        original_output: tc.original_output || expectedOutput,
      };
    });
  }

  /**
   * Ensure all 5 required languages are present in code object
   */
  private static ensureAllLanguages(codeObj: any, type: 'starter' | 'solution'): LanguageCode {
    const defaultStarterTemplates: LanguageCode = {
      c: '#include <stdio.h>\n\nint main() {\n    // Write your code here\n    return 0;\n}\n',
      cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // Write your code here\n    return 0;\n}\n',
      java: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // Write your code here\n    }\n}\n',
      javascript: 'function solve() {\n    // Write your code here\n}\n\nsolve();\n',
      python: 'def solve():\n    # Write your code here\n    pass\n\nsolve()\n',
    };

    const defaultSolutionTemplates: LanguageCode = {
      c: '// Solution code to be implemented\n',
      cpp: '// Solution code to be implemented\n',
      java: '// Solution code to be implemented\n',
      javascript: '// Solution code to be implemented\n',
      python: '# Solution code to be implemented\n',
    };

    const defaults = type === 'starter' ? defaultStarterTemplates : defaultSolutionTemplates;

    if (!codeObj || typeof codeObj !== 'object') {
      return defaults;
    }

    return {
      c: codeObj.c || defaults.c,
      cpp: codeObj.cpp || defaults.cpp,
      java: codeObj.java || defaults.java,
      javascript: codeObj.javascript || defaults.javascript,
      python: codeObj.python || defaults.python,
    };
  }

  /**
   * Generate solution code from starter code (with placeholder implementations)
   */
  private static generateSolutionCode(starterCode: LanguageCode): LanguageCode {
    // For now, use starter code as solution code (will need AI correction later)
    return starterCode;
  }

  /**
   * Ensure inputFormat has proper formatting with code blocks
   */
  private static normalizeInputFormat(inputFormat: string | undefined): string {
    if (!inputFormat || inputFormat.trim().length === 0) {
      return '```\nInput format not specified\n```';
    }

    // If it doesn't have code blocks, wrap it
    if (!inputFormat.includes('```')) {
      return '```\n' + inputFormat + '\n```';
    }

    return inputFormat;
  }

  /**
   * Generate a URL-friendly slug from title
   */
  private static generateSlug(title: string): string {
    if (!title) return 'untitled-question';

    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Transform all documents from missing.json
   */
  static transformAll(rawDocuments: any[]): CodingQuestion[] {
    logger.info('Starting document transformation', {
      totalDocuments: rawDocuments.length,
    });

    const transformed: CodingQuestion[] = [];
    const failed: number[] = [];

    rawDocuments.forEach((doc, index) => {
      const result = this.transformDocument(doc, index);
      if (result) {
        transformed.push(result);
      } else {
        failed.push(index);
      }
    });

    logger.info('Document transformation complete', {
      successful: transformed.length,
      failed: failed.length,
      failedIndices: failed.slice(0, 10), // Log first 10 failures
    });

    return transformed;
  }
}
