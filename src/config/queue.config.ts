import { z } from 'zod';

/**
 * Queue Configuration Schema for AWS SQS
 */
export const QueueConfigSchema = z.object({
  queueUrl: z.string().url('Valid SQS queue URL is required'),
  region: z.string().min(1, 'AWS region is required').default('us-east-1'),
  endpoint: z.string().url().optional(), // For LocalStack
  concurrency: z.number().int().positive().default(5),
  retryMaxAttempts: z.number().int().positive().default(3),
  retryDelayMs: z.number().int().positive().default(5000),
  visibilityTimeout: z.number().int().positive().default(300), // 5 minutes
  waitTimeSeconds: z.number().int().min(0).max(20).default(20), // Long polling
  maxNumberOfMessages: z.number().int().min(1).max(10).default(1),
});

export type QueueConfig = z.infer<typeof QueueConfigSchema>;

/**
 * Load Queue configuration from environment
 */
export function loadQueueConfig(): QueueConfig {
  return QueueConfigSchema.parse({
    queueUrl: process.env.SQS_QUEUE_URL,
    region: process.env.SQS_REGION || 'us-east-1',
    endpoint: process.env.SQS_ENDPOINT,
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
    retryMaxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS || '3', 10),
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '5000', 10),
    visibilityTimeout: parseInt(process.env.SQS_VISIBILITY_TIMEOUT || '300', 10),
    waitTimeSeconds: parseInt(process.env.SQS_WAIT_TIME_SECONDS || '20', 10),
    maxNumberOfMessages: parseInt(process.env.SQS_MAX_MESSAGES || '1', 10),
  });
}
