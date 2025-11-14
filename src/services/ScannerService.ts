import { MongoDBService } from './MongoDBService';
import { QueueService } from './QueueService';
import { SchemaValidator } from '../validators/SchemaValidator';
import { BackupManager } from '../utils/BackupManager';
import { DocumentNormalizer } from '../utils/DocumentNormalizer';
import { logger } from '../utils/Logger';
import { QueueMessage } from '../models/QueueMessage';
import { CodingQuestion } from '../models/CodingQuestion';

/**
 * Scanner statistics
 */
interface ScanStats {
  totalScanned: number;
  validDocuments: number;
  invalidDocuments: number;
  backedUp: number;
  queued: number;
  errors: number;
  skippedCorrupted: number;
  startTime: Date;
  endTime?: Date;
}

/**
 * Scanner Service - Scans documents and queues invalid ones
 */
export class ScannerService {
  private mongoService: MongoDBService;
  private queueService: QueueService;
  private validator: SchemaValidator;
  private backupManager: BackupManager;
  private batchSize: number;

  constructor(
    mongoService: MongoDBService,
    queueService: QueueService,
    backupManager: BackupManager,
    batchSize: number = 100
  ) {
    this.mongoService = mongoService;
    this.queueService = queueService;
    this.validator = new SchemaValidator();
    this.backupManager = backupManager;
    this.batchSize = batchSize;
  }

  /**
   * Scan all documents and queue invalid ones
   */
  async scanAndQueue(): Promise<ScanStats> {
    const stats: ScanStats = {
      totalScanned: 0,
      validDocuments: 0,
      invalidDocuments: 0,
      backedUp: 0,
      queued: 0,
      errors: 0,
      skippedCorrupted: 0,
      startTime: new Date(),
    };

    try {
      logger.info('Starting document scan', { batchSize: this.batchSize });

      // Get total count for progress tracking
      const totalDocs = await this.mongoService.getDocumentCount();
      logger.info('Total documents to scan', { count: totalDocs });

      // Fetch and process documents in batches
      const batchGenerator = this.mongoService.fetchDocumentsBatch(this.batchSize);

      for await (const batch of batchGenerator) {
        await this.processBatch(batch, stats);

        // Log progress
        const progress = ((stats.totalScanned / totalDocs) * 100).toFixed(2);
        logger.info('Scan progress', {
          scanned: stats.totalScanned,
          total: totalDocs,
          progress: `${progress}%`,
          valid: stats.validDocuments,
          invalid: stats.invalidDocuments,
        });
      }

      stats.endTime = new Date();
      this.logFinalStats(stats);

      return stats;
    } catch (error) {
      stats.endTime = new Date();
      logger.error('Scan failed', {
        error: (error as Error).message,
        stats,
      });
      throw error;
    }
  }

  /**
   * Process a batch of documents
   */
  private async processBatch(batch: any[], stats: ScanStats): Promise<void> {
    for (const doc of batch) {
      stats.totalScanned++;

      try {
        // Step 1: Normalize document before validation
        const normalized = DocumentNormalizer.normalize(doc);

        // Validate normalization didn't break critical fields
        if (!DocumentNormalizer.validateNormalization(doc, normalized)) {
          logger.error('Normalization validation failed', {
            documentId: doc._id?.toString(),
          });
          stats.errors++;
          continue;
        }

        // Step 2: Validate normalized document
        const validationResult = this.validator.validate(normalized);

        if (validationResult.isValid) {
          stats.validDocuments++;
          logger.debug('Document is valid', {
            questionId: normalized.question_id,
            documentId: validationResult.documentId,
          });
        } else {
          stats.invalidDocuments++;
          // Use normalized document for backup and queue
          await this.handleInvalidDocument(normalized, validationResult.errors, stats);
        }
      } catch (error) {
        stats.errors++;
        logger.error('Error processing document', {
          documentId: doc._id?.toString(),
          questionId: doc.question_id,
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Handle invalid document - backup and queue
   */
  private async handleInvalidDocument(
    doc: any,
    validationErrors: any[],
    stats: ScanStats
  ): Promise<void> {
    try {
      const documentId = doc._id?.toString() || 'unknown';
      const questionId = doc.question_id || 'unknown';

      logger.info('Invalid document found', {
        documentId,
        questionId,
        errorCount: validationErrors.length,
      });

      // Step 1: Backup document
      try {
        await this.backupManager.saveBackup(doc as CodingQuestion, validationErrors);
        stats.backedUp++;
        logger.debug('Document backed up', { documentId, questionId });
      } catch (backupError) {
        logger.error('Failed to backup document', {
          documentId,
          error: (backupError as Error).message,
        });
        // Continue to queue even if backup fails
      }

      // Step 2: Queue for AI processing
      try {
        const queueMessage: QueueMessage = {
          documentId,
          failedDocument: doc as CodingQuestion,
          validationErrors,
          timestamp: new Date().toISOString(),
          retryCount: 0,
        };

        await this.queueService.addJob(queueMessage);
        stats.queued++;
        logger.debug('Document queued', { documentId, questionId });
      } catch (queueError) {
        logger.error('Failed to queue document', {
          documentId,
          error: (queueError as Error).message,
        });
        stats.errors++;
      }
    } catch (error) {
      logger.error('Error handling invalid document', {
        error: (error as Error).message,
      });
      stats.errors++;
    }
  }

  /**
   * Log final statistics
   */
  private logFinalStats(stats: ScanStats): void {
    const duration = stats.endTime
      ? (stats.endTime.getTime() - stats.startTime.getTime()) / 1000
      : 0;

    logger.info('='.repeat(60));
    logger.info('SCAN COMPLETED');
    logger.info('='.repeat(60));
    logger.info('Statistics:', {
      totalScanned: stats.totalScanned,
      validDocuments: stats.validDocuments,
      invalidDocuments: stats.invalidDocuments,
      backedUp: stats.backedUp,
      queued: stats.queued,
      errors: stats.errors,
      skippedCorrupted: stats.skippedCorrupted,
      durationSeconds: duration.toFixed(2),
      docsPerSecond: (stats.totalScanned / duration).toFixed(2),
    });
    logger.info('='.repeat(60));
  }

  /**
   * Scan specific document by ID
   */
  async scanDocument(documentId: string): Promise<boolean> {
    try {
      const doc = await this.mongoService.findById(documentId);
      if (!doc) {
        logger.error('Document not found', { documentId });
        return false;
      }

      const validationResult = this.validator.validate(doc);
      return validationResult.isValid;
    } catch (error) {
      logger.error('Error scanning document', {
        documentId,
        error: (error as Error).message,
      });
      return false;
    }
  }
}
