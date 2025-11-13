#!/usr/bin/env node

import { loadConfig, validateConfig } from './config';
import { Logger } from './utils/Logger';
import { MongoDBService } from './services/MongoDBService';
import { QueueService } from './services/QueueService';
import { AIProcessorService } from './services/AIProcessorService';
import { UpdaterService } from './services/UpdaterService';
import { SchemaValidator } from './validators/SchemaValidator';
import { QueueMessage } from './models/QueueMessage';

/**
 * Consumer CLI - Processes queue and updates documents
 */
async function main() {
  let mongoService: MongoDBService | null = null;
  let queueService: QueueService | null = null;

  try {
    console.log('='.repeat(60));
    console.log('CODING QUESTION VALIDATOR - CONSUMER');
    console.log('='.repeat(60));

    // Load configuration
    const config = loadConfig();
    validateConfig(config);

    // Initialize logger
    const logger = Logger.initialize(config.app.logLevel);
    logger.info('Configuration loaded successfully');

    // Initialize MongoDB service
    logger.info('Connecting to MongoDB...');
    mongoService = new MongoDBService(config.mongodb);
    await mongoService.connect();

    // Initialize queue service
    logger.info('Connecting to queue...');
    queueService = new QueueService(config.queue);

    // Get initial queue stats
    const queueStats = await queueService.getStats();
    logger.info('Initial queue status', queueStats);

    // Initialize AI processor
    logger.info('Initializing AI processor...');
    const aiProcessor = new AIProcessorService(config.ai);

    // Test AI connection
    const aiConnected = await aiProcessor.testConnection();
    if (!aiConnected) {
      throw new Error('Failed to connect to AI service');
    }
    logger.info('AI service connection verified');

    // Initialize updater service
    const updaterService = new UpdaterService(
      mongoService,
      config.queue.retryMaxAttempts,
      config.queue.retryDelayMs
    );

    // Initialize validator
    const validator = new SchemaValidator();

    // Statistics
    let processedCount = 0;
    let successCount = 0;
    let failureCount = 0;

    // Create worker
    logger.info('Starting worker...', {
      concurrency: config.queue.concurrency,
    });

    queueService.createWorker(async (message: QueueMessage) => {
      const startTime = Date.now();
      const { documentId, failedDocument, validationErrors, retryCount } = message;

      logger.info('Processing message', {
        documentId,
        questionId: failedDocument.question_id,
        errorCount: validationErrors.length,
        retryCount,
      });

      try {
        // Step 1: Call AI to correct document
        logger.info('Calling AI to correct document', { documentId });
        const correctedDocument = await aiProcessor.correctDocument(
          failedDocument,
          validationErrors
        );

        // Step 2: Validate AI-corrected document
        logger.info('Validating AI-corrected document', { documentId });
        const validationResult = validator.validate(correctedDocument);

        if (!validationResult.isValid) {
          logger.error('AI-corrected document still has validation errors', {
            documentId,
            errorCount: validationResult.errors.length,
            errors: validationResult.errors,
          });

          // Throw error to trigger retry
          throw new Error(
            `AI correction failed: ${validationResult.errors.length} validation errors remain`
          );
        }

        logger.info('AI-corrected document passed validation', { documentId });

        // Step 3: Update document in MongoDB
        logger.info('Updating document in MongoDB', { documentId });
        const updated = await updaterService.updateDocument(documentId, correctedDocument);

        if (!updated) {
          throw new Error('Failed to update document in MongoDB');
        }

        // Success
        const duration = Date.now() - startTime;
        successCount++;
        processedCount++;

        logger.info('Message processed successfully', {
          documentId,
          questionId: correctedDocument.question_id,
          durationMs: duration,
          successCount,
          failureCount,
        });
      } catch (error) {
        failureCount++;
        processedCount++;

        logger.error('Message processing failed', {
          documentId,
          error: (error as Error).message,
          stack: (error as Error).stack,
        });

        // Re-throw to let SQS handle retry
        throw error;
      }
    });

    // Log statistics periodically
    setInterval(async () => {
      if (!queueService) return;
      const stats = await queueService.getStats();
      logger.info('Worker statistics', {
        processed: processedCount,
        successful: successCount,
        failed: failureCount,
        queue: stats,
      });
    }, 30000); // Every 30 seconds

    logger.info('Worker is running. Press Ctrl+C to stop.');

    // Keep process alive
    await new Promise(() => {}); // Never resolves
  } catch (error) {
    console.error('Fatal error:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  }
}

// Handle process signals for graceful shutdown
let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  console.log('Waiting for current jobs to complete...');

  // Give workers time to finish current jobs
  setTimeout(() => {
    console.log('Shutdown complete');
    process.exit(0);
  }, 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Run main
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
