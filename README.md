# Coding Question Validator

A production-ready MongoDB schema validation and auto-correction system for coding questions. This system scans documents, validates them against a strict schema, backs up invalid documents, and uses AI (OpenAI GPT) to automatically correct and update them.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Schema Definition](#schema-definition)
- [How It Works](#how-it-works)
- [CLI Commands](#cli-commands)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Safety Features](#safety-features)
- [Development](#development)

## Overview

This system provides automated validation and correction of coding question documents stored in MongoDB. It:

1. **Scans** MongoDB documents in batches
2. **Validates** against a strict TypeScript schema using Zod
3. **Backs up** invalid documents to JSON files
4. **Queues** invalid documents using AWS SQS
5. **Processes** documents with OpenAI GPT for intelligent correction
6. **Updates** existing documents (NEVER creates new ones)
7. **Handles** errors gracefully with exponential backoff retry

## Features

### Core Capabilities

- ✅ Strict schema validation with 10+ validation rules
- ✅ Automatic backup before any modifications
- ✅ AI-powered document correction using OpenAI GPT API
- ✅ Queue-based processing with AWS SQS
- ✅ Batch processing for efficiency
- ✅ Comprehensive logging with Winston
- ✅ Zero data loss - never creates duplicate documents
- ✅ Production-ready error handling

### Validation Rules

1. All required fields exist
2. Correct data types for all fields
3. Difficulty is exactly "Easy", "Medium", or "Hard"
4. Slug is lowercase-with-hyphens format
5. All 5 programming languages have code
6. Test cases use stdin/stdout format (not variable assignment)
7. inputFormat contains code blocks
8. No extra fields beyond schema
9. Arrays are not empty
10. All nested fields validated

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         SCANNER CLI                              │
│  - Fetches documents in batches                                 │
│  - Validates against schema                                     │
│  - Backs up invalid documents                                   │
│  - Publishes to SQS queue                                       │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AWS SQS QUEUE                               │
│  - Manages job queue                                            │
│  - Handles retries with configurable backoff                    │
│  - Tracks message states (in-flight, processed, failed)         │
│  - Supports long polling for efficiency                         │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                        CONSUMER CLI                              │
│  - Polls messages from SQS                                      │
│  - Calls OpenAI for correction                                  │
│  - Validates AI response                                        │
│  - Updates MongoDB (ONLY existing docs)                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      DATA FLOW DIAGRAM                           │
│                                                                  │
│  MongoDB → Scanner → Validator → BackupManager → SQS Queue      │
│                                      │                           │
│                                      ▼                           │
│                                   Consumer                       │
│                                      │                           │
│                   ┌──────────────────┴──────────────────┐       │
│                   ▼                                      ▼       │
│              AI Processor                          Validator     │
│              (OpenAI GPT)                                │       │
│                   │                                      │       │
│                   └──────────────────┬──────────────────┘       │
│                                      ▼                           │
│                                  Updater                         │
│                                      │                           │
│                                      ▼                           │
│                                  MongoDB                         │
│                           (findOneAndReplace)                    │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Required Services

1. **MongoDB Replica Set** (required for transactions)
   ```bash
   # Example connection string:
   mongodb://localhost:27017,localhost:27018,localhost:27019/recruitment?replicaSet=rs0
   ```

2. **AWS SQS or LocalStack** (for queue management)
   ```bash
   # For LocalStack development:
   docker run -d -p 4566:4566 localstack/localstack
   
   # Create queue:
   aws --endpoint-url=https://localhost.localstack.cloud:4566 sqs create-queue \
     --queue-name coding_question_updater_queue --region ap-south-1
   ```

3. **Node.js** (v18 or higher)
   ```bash
   node --version  # Should be >= 18
   ```

4. **OpenAI API Key**
   - Sign up at https://platform.openai.com/
   - Generate API key from API keys section

### System Requirements

- RAM: Minimum 2GB available
- Disk: Enough space for backups (estimate ~1KB per document)
- Network: Stable connection for AI API calls

## Installation

### 1. Clone and Install

```bash
cd coding-question-validator
npm install
```

### 2. Build TypeScript

```bash
npm run build
```

### 3. Create Directories

```bash
mkdir -p failed_questions logs
```

## Configuration

### 1. Create .env file

```bash
cp .env.example .env
```

### 2. Edit .env with your settings

```env
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017,localhost:27018,localhost:27019/recruitment?replicaSet=rs0
MONGODB_DATABASE=recruitment
MONGODB_COLLECTION=coding_questions

# AWS SQS Configuration
SQS_QUEUE_URL=https://localhost.localstack.cloud:4566/000000000000/coding_question_updater_queue
SQS_REGION=ap-south-1
SQS_ENDPOINT=https://localhost.localstack.cloud:4566  # Optional, for LocalStack only
QUEUE_CONCURRENCY=5

# AI Configuration (OpenAI)
AI_PROVIDER=openai
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx  # Your actual API key
AI_MODEL=gpt-4-turbo-preview
AI_MAX_TOKENS=4000
AI_TEMPERATURE=0.1

# Application Configuration
BATCH_SIZE=100
BACKUP_DIR=./failed_questions
LOG_LEVEL=info
RETRY_MAX_ATTEMPTS=3
RETRY_DELAY_MS=5000
```

### 3. Validate Configuration

The system validates configuration on startup and will show clear error messages for any issues.

## Usage

### Basic Workflow

```bash
# Step 1: Run scanner to find and queue invalid documents
npm run scanner

# Step 2: In another terminal, run consumer to process queue
npm run consumer
```

### Development Mode

```bash
# Run scanner with ts-node (development)
npm run scanner

# Run consumer with ts-node (development)
npm run consumer
```

### Production Mode

```bash
# Build first
npm run build

# Run scanner (production)
npm run start:scanner

# Run consumer (production)
npm run start:consumer
```

## Schema Definition

### Complete Schema

```typescript
interface CodingQuestion {
  _id?: ObjectId;           // MongoDB ObjectId
  question_id: string;      // Unique identifier
  title: string;            // Question title
  difficulty: 'Easy' | 'Medium' | 'Hard';  // Exact match required
  slug: string;             // lowercase-with-hyphens
  topic_tags: string[];     // At least 1 tag
  content: string;          // Plain text description
  constraints: string[];    // At least 1 constraint
  testCases: TestCase[];    // At least 1 test case
  starterCode: LanguageCode;  // All 5 languages required
  solutionCode: LanguageCode; // All 5 languages required
  inputFormat: string;      // Must contain ```
  outputFormat: string;     // Descriptive text
}

interface TestCase {
  id: number;
  input: string;            // stdin format: "5\n1 2 3 4 5"
  expectedOutput: string;   // stdout format: "15"
  description: string;
  original_input: string;
  original_output: string;
}

interface LanguageCode {
  c: string;                // Non-empty
  cpp: string;              // Non-empty
  java: string;             // Non-empty
  javascript: string;       // Non-empty
  python: string;           // Non-empty
}
```

### Key Requirements

- **Test Cases**: Must use stdin/stdout format
  - ❌ Wrong: `"input": "nums = [3,5]"`
  - ✅ Correct: `"input": "2\n3 5"`

- **Difficulty**: Case-sensitive literal types
  - ❌ Wrong: `"easy"`, `"EASY"`, `"medium"`
  - ✅ Correct: `"Easy"`, `"Medium"`, `"Hard"`

- **Slug**: Lowercase with hyphens
  - ❌ Wrong: `"Two Sum"`, `"two_sum"`, `"TwoSum"`
  - ✅ Correct: `"two-sum"`

## How It Works

### Scanner Process

1. **Connect** to MongoDB and Redis
2. **Fetch** documents in batches (default 100)
3. **Validate** each document using Zod schema
4. **For invalid documents**:
   - Save backup to `./failed_questions/[timestamp]_[question_id].json`
   - Publish message to queue with validation errors
5. **Log** statistics (total, valid, invalid, queued)

### Consumer Process

1. **Listen** to queue for new jobs
2. **For each job**:
   - Extract document and validation errors
   - Call Claude AI with correction prompt
   - Parse and validate AI response
   - If valid: Update MongoDB using `findOneAndReplace`
   - If invalid: Retry (up to 3 times with exponential backoff)
3. **Track** statistics (processed, successful, failed)

### AI Correction Prompt

The system generates a detailed prompt that includes:
- All validation errors
- Complete schema definition
- Original document
- Format requirements
- Instructions for stdin/stdout format

Example prompt structure:
```
You are a data correction specialist...

## VALIDATION ERRORS TO FIX:
1. Field: "difficulty" - Must be exactly "Easy", "Medium", or "Hard"
2. Field: "testCases[0].input" - Should be in stdin format

## SCHEMA DEFINITION:
{ ... }

## ORIGINAL DOCUMENT:
{ ... }

## YOUR TASK:
Fix all validation errors. Return ONLY JSON.
```

## CLI Commands

### Scanner

```bash
npm run scanner
```

**Output:**
```
============================================================
CODING QUESTION VALIDATOR - SCANNER
============================================================
Configuration loaded successfully
Connecting to MongoDB...
Successfully connected to MongoDB
Starting scan...
Total documents to scan: 150
Scan progress: 50/150 (33.33%)
...
============================================================
SCAN COMPLETED
============================================================
Statistics: {
  totalScanned: 150,
  validDocuments: 120,
  invalidDocuments: 30,
  backedUp: 30,
  queued: 30,
  errors: 0,
  durationSeconds: 45.23
}
```

### Consumer

```bash
npm run consumer
```

**Output:**
```
============================================================
CODING QUESTION VALIDATOR - CONSUMER
============================================================
Configuration loaded successfully
Connecting to MongoDB...
AI service connection verified
Starting worker...
Worker is running. Press Ctrl+C to stop.

Processing job: { jobId: 'abc123', documentId: '...' }
AI-corrected document passed validation
Document updated successfully
Job completed successfully

Worker statistics: {
  processed: 10,
  successful: 9,
  failed: 1
}
```

## Monitoring

### Log Files

Logs are written to:
- `./logs/error.log` - Errors only
- `./logs/combined.log` - All log levels

### Queue Statistics

Check queue status:
```typescript
import { QueueService } from './services/QueueService';

const stats = await queueService.getStats();
// {
//   waiting: 10,
//   active: 5,
//   completed: 100,
//   failed: 2,
//   delayed: 0
// }
```

### Backup Files

Backups are saved to: `./failed_questions/[ISO-timestamp]_[question_id].json`

Example filename: `2024-01-15T10-30-00-000Z_Q12345.json`

Structure:
```json
{
  "metadata": {
    "backupTime": "2024-01-15T10:30:00Z",
    "documentId": "507f1f77bcf86cd799439011",
    "validationErrors": [...]
  },
  "originalDocument": {...}
}
```

## Troubleshooting

### Common Issues

#### 1. MongoDB Connection Failed

**Error:** `Failed to connect to MongoDB`

**Solutions:**
- Verify MongoDB is running: `mongosh`
- Check replica set is initialized
- Verify connection string in `.env`
- Check network/firewall settings

### Issue: AWS SQS Connection Failed

**Error:** `Unable to connect to SQS`

**Solutions:**
- Verify SQS queue exists
- Check AWS credentials (if using real AWS)
- For LocalStack: Ensure LocalStack is running: `docker ps | grep localstack`
- Check queue URL in `.env`
- Verify region settings

#### 3. AI API Key Invalid

**Error:** `Invalid API key`

**Solutions:**
- Verify API key in `.env` is correct
- Check API key has not expired or reached quota
- Ensure no extra spaces in `.env` file
- Key should start with `sk-proj-` for OpenAI

#### 4. Document Not Found Error

**Error:** `Document with ID ... not found`

**Solutions:**
- Document may have been deleted
- Check if correct database/collection
- Verify ObjectId format is valid

#### 5. Validation Still Failing After AI Correction

**Behavior:** Job retries multiple times and eventually fails

**Solutions:**
- Check AI model version (try latest)
- Review validation errors in logs
- Increase `AI_MAX_TOKENS` if responses are truncated
- Check if validation rules are too strict

### Debug Mode

Enable debug logging:
```env
LOG_LEVEL=debug
```

This will show:
- Detailed validation errors
- AI prompts and responses
- Database queries
- Queue operations

## Safety Features

### 1. No Duplicate Documents

The system uses `findOneAndReplace` with `upsert: false`:
```typescript
await collection.findOneAndReplace(
  { _id: new ObjectId(documentId) },
  correctedDocument,
  { upsert: false }  // NEVER creates new documents
);
```

### 2. Backup Before Modification

Every invalid document is backed up before being queued for correction.

### 3. Validation Before Update

AI-corrected documents are re-validated before updating MongoDB. If validation fails, the update is skipped and job retries.

### 4. Retry Mechanism

Failed jobs retry up to 3 times with exponential backoff (5s, 10s, 20s).

### 5. Preserving Critical Fields

The system always preserves:
- `_id` (MongoDB ObjectId)
- `question_id` (Unique identifier)

### 6. Transaction Safety

MongoDB operations use safe write concerns and error handling.

## Development

### Project Structure

```
coding-question-validator/
├── src/
│   ├── config/          # Configuration loaders
│   ├── models/          # TypeScript interfaces
│   ├── validators/      # Schema validation logic
│   ├── services/        # Core services
│   ├── utils/           # Utility functions
│   ├── prompts/         # AI prompt templates
│   ├── scanner.ts       # Scanner CLI
│   ├── consumer.ts      # Consumer CLI
│   └── index.ts         # Main exports
├── logs/                # Log files
├── failed_questions/    # Backup directory
├── package.json
├── tsconfig.json
└── .env
```

### Adding Custom Validations

Edit `src/validators/SchemaValidator.ts`:

```typescript
private performCustomValidations(document: CodingQuestion): ValidationError[] {
  const errors: ValidationError[] = [];

  // Add your custom validation
  if (document.title.length < 5) {
    errors.push(ValidationErrorFactory.invalidValue(
      'title',
      'Title must be at least 5 characters'
    ));
  }

  return errors;
}
```

### Running Tests

```bash
# Add test framework
npm install --save-dev jest @types/jest ts-jest

# Run tests
npm test
```

### Code Quality

```bash
# Format code
npm install --save-dev prettier
npx prettier --write "src/**/*.ts"

# Lint code
npm install --save-dev eslint
npx eslint "src/**/*.ts"
```

## Performance Considerations

### Batch Size

Default: 100 documents per batch

- **Increase** for better throughput (if RAM available)
- **Decrease** for lower memory usage

```env
BATCH_SIZE=50  # Lower for limited RAM
BATCH_SIZE=200 # Higher for better performance
```

### Queue Concurrency

Default: 5 concurrent jobs

- **Increase** for faster processing (if API rate limits allow)
- **Decrease** to reduce API costs

```env
QUEUE_CONCURRENCY=10  # Process 10 jobs simultaneously
```

### API Rate Limits

OpenAI API has rate limits. If hitting limits:
- Decrease `QUEUE_CONCURRENCY`
- Add delays between jobs
- Upgrade API tier or check usage limits

## License

MIT

## Support

For issues or questions:
1. Check [Troubleshooting](#troubleshooting) section
2. Review logs in `./logs/`
3. Check backup files for original data
4. Verify configuration in `.env`

## Changelog

### v1.0.0 (Current)
- AWS SQS queue integration
- OpenAI GPT-4 integration
- MongoDB validation and correction
- AI-powered document fixing
- Batch processing with concurrency control
- Comprehensive logging
- Backup system
