#!/usr/bin/env node

import { loadConfig, validateConfig } from './config';
import { Logger } from './utils/Logger';
import { MongoDBService } from './services/MongoDBService';
import { QueueService } from './services/QueueService';
import { BackupManager } from './utils/BackupManager';
import { ScannerService } from './services/ScannerService';

/**
 * Scanner CLI - Scans MongoDB and queues invalid documents
 */
async function main() {
  let mongoService: MongoDBService | null = null;
  let queueService: QueueService | null = null;

  try {
    console.log('='.repeat(60));
    console.log('CODING QUESTION VALIDATOR - SCANNER');
    console.log('='.repeat(60));

    // Load configuration
    const config = loadConfig();
    validateConfig(config);

    // Initialize logger
    const logger = Logger.initialize(config.app.logLevel);
    logger.info('Configuration loaded successfully');

    // Initialize backup manager
    const backupManager = new BackupManager(config.app.backupDir);
    await backupManager.initialize();

    // Initialize MongoDB service
    logger.info('Connecting to MongoDB...');
    mongoService = new MongoDBService(config.mongodb);
    await mongoService.connect();

    // Check if collection is empty
    const isEmpty = await mongoService.isEmpty();
    if (isEmpty) {
      logger.warn('Collection is empty. Nothing to scan.');
      process.exit(0);
    }

    // Initialize queue service
    logger.info('Connecting to queue...');
    queueService = new QueueService(config.queue);

    // Get queue stats before scan
    const queueStatsBefore = await queueService.getStats();
    logger.info('Queue status before scan', queueStatsBefore);

    // Initialize scanner service
    const scannerService = new ScannerService(
      mongoService,
      queueService,
      backupManager,
      config.app.batchSize
    );

    // Run scan
    logger.info('Starting scan...');
    const stats = await scannerService.scanAndQueue();
    logger.info('Scan statistics', stats);

    // Get queue stats after scan
    const queueStatsAfter = await queueService.getStats();
    logger.info('Queue status after scan', queueStatsAfter);

    // Display backup stats
    const backupStats = await backupManager.getStats();
    logger.info('Backup statistics', backupStats);

    // Success
    logger.info('Scan completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  } finally {
    // Cleanup
    if (mongoService) {
      await mongoService.disconnect().catch(console.error);
    }
    if (queueService) {
      await queueService.close().catch(console.error);
    }
  }
}

// Handle process signals
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM. Shutting down gracefully...');
  process.exit(0);
});

// Run main
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
