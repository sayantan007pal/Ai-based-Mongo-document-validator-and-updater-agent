import * as dotenv from 'dotenv';

// Load environment variables FIRST
dotenv.config();

import * as fs from 'fs';
import { MongoDBService } from './services/MongoDBService';
import { loadMongoDBConfig } from './config/mongodb.config';
import { DataTransformer } from './utils/DataTransformer';
import { SchemaValidator } from './validators/SchemaValidator';
import { logger } from './utils/Logger';
import { CodingQuestion } from './models/CodingQuestion';

/**
 * Main script to import data from missing.json into MongoDB
 * Steps:
 * 1. Read missing.json file
 * 2. Transform data to match schema
 * 3. Validate transformed data
 * 4. Delete all existing documents from collection
 * 5. Insert validated documents
 * 6. Verify insertion
 */
class DataImporter {
  private mongoService: MongoDBService;
  private validator: SchemaValidator;
  private missingJsonPath: string;

  constructor(missingJsonPath: string) {
    this.mongoService = new MongoDBService(loadMongoDBConfig());
    // Skip custom validations for import - we just need schema compliance
    this.validator = new SchemaValidator({ skipCustomValidations: true });
    this.missingJsonPath = missingJsonPath;
  }

  /**
   * Step 1: Read missing.json file
   */
  private readMissingJson(): any[] {
    logger.info('Reading missing.json file', { path: this.missingJsonPath });

    try {
      const fileContent = fs.readFileSync(this.missingJsonPath, 'utf-8');
      const data = JSON.parse(fileContent);

      if (!Array.isArray(data)) {
        throw new Error('missing.json must contain an array of documents');
      }

      logger.info('Successfully read missing.json', {
        totalDocuments: data.length,
      });

      return data;
    } catch (error) {
      logger.error('Failed to read missing.json', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Step 2 & 3: Transform and validate data
   */
  private transformAndValidate(rawDocuments: any[]): {
    valid: CodingQuestion[];
    invalid: number;
  } {
    logger.info('Starting data transformation and validation');

    // Transform all documents
    const transformed = DataTransformer.transformAll(rawDocuments);

    logger.info('Validating transformed documents', {
      count: transformed.length,
    });

    // Validate each transformed document
    const validDocuments: CodingQuestion[] = [];
    let invalidCount = 0;

    transformed.forEach((doc, index) => {
      const result = this.validator.validate(doc);

      if (result.isValid) {
        validDocuments.push(doc);
      } else {
        invalidCount++;
        logger.warn('Document failed validation', {
          index,
          title: doc.title,
          errorCount: result.errors.length,
          errors: result.errors.slice(0, 5), // Log first 5 errors
        });
      }
    });

    const summary = this.validator.getBatchSummary(
      transformed.map(doc => this.validator.validate(doc))
    );

    logger.info('Validation complete', {
      total: transformed.length,
      valid: validDocuments.length,
      invalid: invalidCount,
      validationRate: `${((validDocuments.length / transformed.length) * 100).toFixed(2)}%`,
    });

    // Log summary
    logger.info('Validation summary', summary);

    return {
      valid: validDocuments,
      invalid: invalidCount,
    };
  }

  /**
   * Step 4: Delete all existing documents from collection
   */
  private async deleteExistingDocuments(): Promise<void> {
    logger.info('Deleting all existing documents from collection');

    try {
      const collection = this.mongoService.getCollection();
      const countBefore = await this.mongoService.getDocumentCount();

      logger.info('Documents before deletion', { count: countBefore });

      if (countBefore === 0) {
        logger.info('Collection is already empty, skipping deletion');
        return;
      }

      const result = await collection.deleteMany({});

      logger.info('Successfully deleted all documents', {
        deletedCount: result.deletedCount,
        acknowledged: result.acknowledged,
      });

      // Verify deletion
      const countAfter = await this.mongoService.getDocumentCount();
      if (countAfter !== 0) {
        throw new Error(`Deletion verification failed. Expected 0 documents, found ${countAfter}`);
      }

      logger.info('Deletion verified - collection is now empty');
    } catch (error) {
      logger.error('Failed to delete existing documents', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Step 5: Insert validated documents
   */
  private async insertDocuments(documents: CodingQuestion[]): Promise<void> {
    logger.info('Inserting validated documents', {
      count: documents.length,
    });

    try {
      const collection = this.mongoService.getCollection();

      // Insert in batches for better performance
      const batchSize = 100;
      let insertedCount = 0;

      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        const result = await collection.insertMany(batch as any);

        insertedCount += result.insertedCount;

        logger.info('Batch inserted', {
          batchNumber: Math.floor(i / batchSize) + 1,
          batchSize: batch.length,
          insertedInBatch: result.insertedCount,
          totalInserted: insertedCount,
        });
      }

      logger.info('All documents inserted successfully', {
        totalInserted: insertedCount,
      });

      // Verify insertion
      const finalCount = await this.mongoService.getDocumentCount();
      if (finalCount !== insertedCount) {
        throw new Error(`Insertion verification failed. Expected ${insertedCount} documents, found ${finalCount}`);
      }

      logger.info('Insertion verified', {
        expectedCount: insertedCount,
        actualCount: finalCount,
      });
    } catch (error) {
      logger.error('Failed to insert documents', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Step 6: Verify inserted documents pass schema validation
   */
  private async verifyInsertedDocuments(): Promise<void> {
    logger.info('Verifying inserted documents against schema');

    try {
      const collection = this.mongoService.getCollection();

      // Sample some documents for verification
      const sampleSize = 10;
      const documents = await collection.find({}).limit(sampleSize).toArray();

      logger.info('Retrieved sample documents for verification', {
        sampleSize: documents.length,
      });

      let validCount = 0;
      let invalidCount = 0;

      documents.forEach((doc, index) => {
        const result = this.validator.validate(doc as any);

        if (result.isValid) {
          validCount++;
        } else {
          invalidCount++;
          logger.error('Sample document failed validation', {
            index,
            documentId: doc._id,
            errors: result.errors,
          });
        }
      });

      if (invalidCount > 0) {
        throw new Error(`${invalidCount} out of ${sampleSize} sample documents failed validation`);
      }

      logger.info('All sample documents passed validation', {
        sampleSize: validCount,
      });
    } catch (error) {
      logger.error('Document verification failed', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Run the complete import process
   */
  async run(): Promise<void> {
    try {
      logger.info('='.repeat(80));
      logger.info('Starting Data Import Process');
      logger.info('='.repeat(80));

      // Connect to MongoDB
      await this.mongoService.connect();

      // Step 1: Read missing.json
      const rawDocuments = this.readMissingJson();

      // Step 2 & 3: Transform and validate
      const { valid, invalid } = this.transformAndValidate(rawDocuments);

      if (valid.length === 0) {
        throw new Error('No valid documents to import after transformation');
      }

      logger.info('Proceeding with import', {
        validDocuments: valid.length,
        invalidDocuments: invalid,
      });

      // Step 4: Delete existing documents
      await this.deleteExistingDocuments();

      // Step 5: Insert validated documents
      await this.insertDocuments(valid);

      // Step 6: Verify inserted documents
      await this.verifyInsertedDocuments();

      logger.info('='.repeat(80));
      logger.info('Data Import Process Completed Successfully');
      logger.info('='.repeat(80));
      logger.info('Summary', {
        sourceFile: this.missingJsonPath,
        totalDocumentsRead: rawDocuments.length,
        validDocuments: valid.length,
        invalidDocuments: invalid,
        documentsInserted: valid.length,
      });

      // Disconnect
      await this.mongoService.disconnect();

      process.exit(0);
    } catch (error) {
      logger.error('Data import process failed', {
        error: (error as Error).message,
        stack: (error as Error).stack,
      });

      // Disconnect on error
      try {
        await this.mongoService.disconnect();
      } catch (disconnectError) {
        logger.error('Failed to disconnect after error', {
          error: (disconnectError as Error).message,
        });
      }

      process.exit(1);
    }
  }
}

// Main execution
const missingJsonPath = process.argv[2] || '/Users/sayantanpal100/Desktop/Coding question updater agent/missing.json';
const config = loadMongoDBConfig();

logger.info('Data Importer Starting', {
  missingJsonPath,
  mongodbUri: config.uri,
  database: config.database,
  collection: config.collection,
});

const importer = new DataImporter(missingJsonPath);
importer.run();
