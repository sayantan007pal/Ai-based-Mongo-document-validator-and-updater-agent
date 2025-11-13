import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  ChangeMessageVisibilityCommand,
  Message,
} from '@aws-sdk/client-sqs';
import { QueueConfig } from '../config/queue.config';
import { QueueMessage, QueueStats } from '../models/QueueMessage';
import { logger } from '../utils/Logger';

/**
 * Queue Service using AWS SQS
 */
export class QueueService {
  private client: SQSClient;
  private config: QueueConfig;
  private isPolling: boolean = false;
  private pollingInterval?: NodeJS.Timeout;
  private messageHandlers: Map<string, (message: QueueMessage) => Promise<void>> = new Map();

  constructor(config: QueueConfig) {
    this.config = config;

    // Create SQS client
    const clientConfig: any = {
      region: config.region,
    };

    // Add endpoint for LocalStack
    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
      // For LocalStack, we need to set credentials
      clientConfig.credentials = {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      };
    }

    this.client = new SQSClient(clientConfig);

    logger.info('SQS Queue service initialized', {
      queueUrl: config.queueUrl,
      region: config.region,
      endpoint: config.endpoint,
    });
  }

  /**
   * Add job to queue
   */
  async addJob(message: QueueMessage, options?: { delaySeconds?: number }): Promise<string> {
    try {
      const command = new SendMessageCommand({
        QueueUrl: this.config.queueUrl,
        MessageBody: JSON.stringify(message),
        DelaySeconds: options?.delaySeconds || 0,
        MessageAttributes: {
          documentId: {
            DataType: 'String',
            StringValue: message.documentId,
          },
          questionId: {
            DataType: 'String',
            StringValue: message.failedDocument.question_id || 'unknown',
          },
          attemptNumber: {
            DataType: 'Number',
            StringValue: '0',
          },
        },
      });

      const response = await this.client.send(command);

      logger.info('Message sent to SQS', {
        messageId: response.MessageId,
        documentId: message.documentId,
        questionId: message.failedDocument.question_id,
      });

      return response.MessageId || 'unknown';
    } catch (error) {
      logger.error('Failed to send message to SQS', {
        documentId: message.documentId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Create worker to process jobs
   * For SQS, this starts a polling loop
   */
  createWorker(processor: (message: QueueMessage) => Promise<void>): void {
    const workerId = Date.now().toString();
    this.messageHandlers.set(workerId, processor);

    if (!this.isPolling) {
      this.startPolling();
    }

    logger.info('Worker created', {
      workerId,
      concurrency: this.config.concurrency,
    });
  }

  /**
   * Start polling for messages
   */
  private async startPolling(): Promise<void> {
    if (this.isPolling) {
      logger.warn('Polling already started');
      return;
    }

    this.isPolling = true;
    logger.info('Starting SQS polling');

    // Poll continuously
    this.pollMessages();
  }

  /**
   * Poll for messages from SQS
   */
  private async pollMessages(): Promise<void> {
    if (!this.isPolling) {
      return;
    }

    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: this.config.queueUrl,
        MaxNumberOfMessages: this.config.maxNumberOfMessages,
        WaitTimeSeconds: this.config.waitTimeSeconds,
        VisibilityTimeout: this.config.visibilityTimeout,
        MessageAttributeNames: ['All'],
        AttributeNames: ['All'],
      });

      const response = await this.client.send(command);

      if (response.Messages && response.Messages.length > 0) {
        logger.debug('Received messages from SQS', {
          count: response.Messages.length,
        });

        // Process messages concurrently (up to concurrency limit)
        const processingPromises = response.Messages.map((message) =>
          this.processMessage(message)
        );

        await Promise.allSettled(processingPromises);
      }
    } catch (error) {
      logger.error('Error polling messages from SQS', {
        error: (error as Error).message,
      });
    }

    // Continue polling
    if (this.isPolling) {
      setImmediate(() => this.pollMessages());
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(sqsMessage: Message): Promise<void> {
    if (!sqsMessage.Body || !sqsMessage.ReceiptHandle) {
      logger.warn('Received message without body or receipt handle');
      return;
    }

    let queueMessage: QueueMessage;
    const receiptHandle = sqsMessage.ReceiptHandle;

    try {
      queueMessage = JSON.parse(sqsMessage.Body);
    } catch (error) {
      logger.error('Failed to parse message body', {
        error: (error as Error).message,
        messageId: sqsMessage.MessageId,
      });
      // Delete invalid message
      await this.deleteMessage(receiptHandle);
      return;
    }

    const attemptNumber = parseInt(
      sqsMessage.Attributes?.ApproximateReceiveCount || '1',
      10
    );

    logger.info('Processing message', {
      messageId: sqsMessage.MessageId,
      documentId: queueMessage.documentId,
      attemptNumber,
    });

    try {
      // Call all registered message handlers
      for (const [workerId, handler] of this.messageHandlers) {
        try {
          await handler(queueMessage);
        } catch (error) {
          logger.error('Message handler failed', {
            workerId,
            messageId: sqsMessage.MessageId,
            documentId: queueMessage.documentId,
            error: (error as Error).message,
          });
          throw error; // Rethrow to trigger retry logic
        }
      }

      // Delete message on success
      await this.deleteMessage(receiptHandle);

      logger.info('Message processed successfully', {
        messageId: sqsMessage.MessageId,
        documentId: queueMessage.documentId,
      });
    } catch (error) {
      logger.error('Failed to process message', {
        messageId: sqsMessage.MessageId,
        documentId: queueMessage.documentId,
        attemptNumber,
        error: (error as Error).message,
      });

      // Check if we've exceeded max attempts
      if (attemptNumber >= this.config.retryMaxAttempts) {
        logger.error('Max retry attempts reached, deleting message', {
          messageId: sqsMessage.MessageId,
          documentId: queueMessage.documentId,
          attempts: attemptNumber,
        });
        await this.deleteMessage(receiptHandle);
      } else {
        // Change visibility timeout to implement exponential backoff
        const backoffDelay = Math.min(
          this.config.retryDelayMs * Math.pow(2, attemptNumber - 1) / 1000,
          this.config.visibilityTimeout
        );

        logger.info('Retrying message with backoff', {
          messageId: sqsMessage.MessageId,
          documentId: queueMessage.documentId,
          attemptNumber,
          backoffSeconds: backoffDelay,
        });

        await this.changeMessageVisibility(receiptHandle, Math.floor(backoffDelay));
      }
    }
  }

  /**
   * Delete message from queue
   */
  private async deleteMessage(receiptHandle: string): Promise<void> {
    try {
      const command = new DeleteMessageCommand({
        QueueUrl: this.config.queueUrl,
        ReceiptHandle: receiptHandle,
      });

      await this.client.send(command);
    } catch (error) {
      logger.error('Failed to delete message', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Change message visibility timeout
   */
  private async changeMessageVisibility(
    receiptHandle: string,
    visibilityTimeout: number
  ): Promise<void> {
    try {
      const command = new ChangeMessageVisibilityCommand({
        QueueUrl: this.config.queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: visibilityTimeout,
      });

      await this.client.send(command);
    } catch (error) {
      logger.error('Failed to change message visibility', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<QueueStats> {
    try {
      const command = new GetQueueAttributesCommand({
        QueueUrl: this.config.queueUrl,
        AttributeNames: [
          'ApproximateNumberOfMessages',
          'ApproximateNumberOfMessagesNotVisible',
          'ApproximateNumberOfMessagesDelayed',
        ],
      });

      const response = await this.client.send(command);
      const attrs = response.Attributes || {};

      return {
        waiting: parseInt(attrs.ApproximateNumberOfMessages || '0', 10),
        active: parseInt(attrs.ApproximateNumberOfMessagesNotVisible || '0', 10),
        completed: 0, // SQS doesn't track completed messages
        failed: 0, // SQS doesn't track failed messages directly
        delayed: parseInt(attrs.ApproximateNumberOfMessagesDelayed || '0', 10),
      };
    } catch (error) {
      logger.error('Failed to get queue stats', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Pause queue processing
   */
  async pause(): Promise<void> {
    this.isPolling = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
    logger.info('Queue polling paused');
  }

  /**
   * Resume queue processing
   */
  async resume(): Promise<void> {
    if (!this.isPolling) {
      this.startPolling();
      logger.info('Queue polling resumed');
    }
  }

  /**
   * Close queue service
   */
  async close(): Promise<void> {
    try {
      this.isPolling = false;
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
      }
      this.messageHandlers.clear();
      this.client.destroy();
      logger.info('Queue service closed');
    } catch (error) {
      logger.error('Error closing queue service', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Clean old jobs (no-op for SQS, as it has built-in message retention)
   */
  async clean(grace: number = 86400000): Promise<void> {
    logger.info('Clean operation not needed for SQS (automatic retention)', {
      gracePeriodMs: grace,
    });
  }

  /**
   * Get job by ID (not supported in SQS)
   */
  async getJob(jobId: string): Promise<any> {
    logger.warn('getJob not supported in SQS', { jobId });
    return undefined;
  }
}
