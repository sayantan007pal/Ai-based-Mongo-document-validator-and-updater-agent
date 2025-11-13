import { MongoClient, Db, Collection, Document, ObjectId } from 'mongodb';
import { MongoDBConfig } from '../config/mongodb.config';
import { logger } from '../utils/Logger';
import { CodingQuestion } from '../models/CodingQuestion';

/**
 * MongoDB Service for database operations
 */
export class MongoDBService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private collection: Collection<Document> | null = null;
  private config: MongoDBConfig;

  constructor(config: MongoDBConfig) {
    this.config = config;
  }

  /**
   * Connect to MongoDB
   */
  async connect(): Promise<void> {
    try {
      logger.info('Connecting to MongoDB...', {
        database: this.config.database,
        collection: this.config.collection,
      });

      this.client = new MongoClient(this.config.uri, {
        maxPoolSize: 10,
        minPoolSize: 2,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 30000,
      });

      await this.client.connect();

      // Verify connection
      await this.client.db('admin').command({ ping: 1 });

      this.db = this.client.db(this.config.database);
      this.collection = this.db.collection(this.config.collection);

      logger.info('Successfully connected to MongoDB', {
        database: this.config.database,
        collection: this.config.collection,
      });
    } catch (error) {
      logger.error('Failed to connect to MongoDB', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
        logger.info('Disconnected from MongoDB');
      }
    } catch (error) {
      logger.error('Error disconnecting from MongoDB', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Get collection instance
   */
  getCollection(): Collection<Document> {
    if (!this.collection) {
      throw new Error('Not connected to MongoDB. Call connect() first.');
    }
    return this.collection;
  }

  /**
   * Fetch documents in batches
   */
  async *fetchDocumentsBatch(batchSize: number): AsyncGenerator<Document[], void, unknown> {
    const collection = this.getCollection();

    try {
      const cursor = collection.find({});
      let batch: Document[] = [];
      let skippedCount = 0;

      // We need to iterate manually to handle UTF-8 errors
      while (await cursor.hasNext()) {
        try {
          const doc = await cursor.next();
          if (doc) {
            batch.push(doc);

            if (batch.length >= batchSize) {
              yield batch;
              batch = [];
            }
          }
        } catch (docError: any) {
          // Handle invalid UTF-8 or other BSON errors for individual documents
          if (docError.message?.includes('Invalid UTF-8') || docError.name === 'BSONError') {
            skippedCount++;
            logger.warn('Skipping document with BSON/UTF-8 error', {
              error: docError.message,
              skippedCount,
            });
            // Continue to next document
            continue;
          } else {
            // Re-throw other errors
            throw docError;
          }
        }
      }

      // Yield remaining documents
      if (batch.length > 0) {
        yield batch;
      }

      logger.info('Completed fetching all documents', {
        skippedCorruptedDocs: skippedCount,
      });
    } catch (error) {
      logger.error('Error fetching documents', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Get total document count
   */
  async getDocumentCount(): Promise<number> {
    const collection = this.getCollection();
    try {
      const count = await collection.countDocuments();
      logger.debug('Document count retrieved', { count });
      return count;
    } catch (error) {
      logger.error('Error getting document count', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Find document by ID
   */
  async findById(documentId: string): Promise<Document | null> {
    const collection = this.getCollection();
    try {
      const doc = await collection.findOne({ _id: new ObjectId(documentId) });
      return doc;
    } catch (error) {
      logger.error('Error finding document by ID', {
        documentId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Update document by ID - CRITICAL: NEVER creates new documents
   */
  async updateDocument(documentId: string, correctedDocument: CodingQuestion): Promise<boolean> {
    const collection = this.getCollection();

    try {
      logger.info('Attempting to update document', {
        documentId,
        questionId: correctedDocument.question_id,
      });

      // Remove _id from the corrected document to avoid immutable field error
      const { _id, ...documentWithoutId } = correctedDocument as any;

      // Use findOneAndReplace with upsert: false to ensure NO new documents are created
      const result = await collection.findOneAndReplace(
        { _id: new ObjectId(documentId) },
        documentWithoutId,
        {
          upsert: false, // CRITICAL: Never create new documents
          returnDocument: 'after',
        }
      );

      if (!result) {
        logger.error('Document not found for update (no document created)', {
          documentId,
        });
        return false;
      }

      logger.info('Document updated successfully', {
        documentId,
        questionId: correctedDocument.question_id,
      });

      return true;
    } catch (error) {
      logger.error('Failed to update document', {
        documentId,
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      throw error;
    }
  }

  /**
   * Check if collection is empty
   */
  async isEmpty(): Promise<boolean> {
    const count = await this.getDocumentCount();
    return count === 0;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.client) {
        return false;
      }
      await this.client.db('admin').command({ ping: 1 });
      return true;
    } catch (error) {
      logger.error('Health check failed', {
        error: (error as Error).message,
      });
      return false;
    }
  }
}
