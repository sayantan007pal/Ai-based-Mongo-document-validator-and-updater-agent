/**
 * Main entry point for the Coding Question Validator system
 *
 * This module exports all major components for programmatic use.
 * For CLI usage, use scanner.ts and consumer.ts directly.
 */

// Configuration
export { loadConfig, validateConfig, Config } from './config';
export { MongoDBConfig } from './config/mongodb.config';
export { QueueConfig } from './config/queue.config';
export { AIConfig } from './config/ai.config';

// Models
export {
  CodingQuestion,
  TestCase,
  LanguageCode,
  Difficulty,
  CodingQuestionValidator,
} from './models/CodingQuestion';
export {
  ValidationError,
  ValidationErrorCode,
  ValidationResult,
  ValidationErrorFactory,
} from './models/ValidationError';
export {
  QueueMessage,
  QueueJobOptions,
  QueueStats,
  ProcessingResult,
} from './models/QueueMessage';

// Services
export { MongoDBService } from './services/MongoDBService';
export { QueueService } from './services/QueueService';
export { AIProcessorService } from './services/AIProcessorService';
export { UpdaterService } from './services/UpdaterService';
export { ScannerService } from './services/ScannerService';

// Validators
export { SchemaValidator } from './validators/SchemaValidator';

// Utils
export { Logger, logger } from './utils/Logger';
export { RetryHelper, RetryOptions } from './utils/RetryHelper';
export { BackupManager } from './utils/BackupManager';
export { FailureReportManager, FailureEntry } from './utils/FailureReportManager';
export { DocumentNormalizer } from './utils/DocumentNormalizer';

// Prompts
export { generateCorrectionPrompt, parseAIResponse } from './prompts/correction-prompt';
export { generateComprehensiveCorrectionPrompt, parseComprehensiveAIResponse } from './prompts/comprehensive-correction-prompt';

/**
 * Version information
 */
export const VERSION = '1.0.0';

/**
 * System information
 */
export const SYSTEM_INFO = {
  name: 'Coding Question Validator',
  version: VERSION,
  description: 'MongoDB schema validation and auto-correction system',
};
