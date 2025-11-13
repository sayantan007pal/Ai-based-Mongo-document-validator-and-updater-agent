# Architecture Documentation

## System Overview

The Coding Question Validator is a robust, production-ready system designed to validate and auto-correct MongoDB documents using AI. It follows a queue-based architecture with clear separation of concerns.

## Core Components

### 1. Configuration Layer (`src/config/`)

**Purpose**: Centralized configuration management with validation

**Components**:
- `index.ts` - Main config loader and validator
- `mongodb.config.ts` - MongoDB connection settings
- `queue.config.ts` - AWS SQS settings
- `ai.config.ts` - OpenAI API settings

**Design Principles**:
- Environment-based configuration
- Fail-fast validation using Zod
- Type-safe configuration objects
- Clear error messages for misconfiguration

**Example Flow**:
```
.env file → loadConfig() → validateConfig() → Config object
```

### 2. Data Models (`src/models/`)

**Purpose**: Type definitions and schemas

**Components**:
- `CodingQuestion.ts` - Main document schema with Zod validation
- `ValidationError.ts` - Error types and factory methods
- `QueueMessage.ts` - Queue message structure

**Key Features**:
- Runtime validation using Zod
- Type safety with TypeScript
- Custom validation logic
- Reusable error creation

**Validation Hierarchy**:
```
Document → Zod Schema → Custom Validators → ValidationResult
```

### 3. Validators (`src/validators/`)

**Purpose**: Document validation logic

**Components**:
- `SchemaValidator.ts` - Main validation orchestrator

**Validation Process**:
1. Zod schema validation (structure, types)
2. Custom business logic validation
3. Error collection and formatting
4. Batch validation support

**Validation Flow**:
```
Document → validateWithZod() → performCustomValidations() → ValidationResult
```

### 4. Services (`src/services/`)

**Purpose**: Business logic and external integrations

#### MongoDBService
- **Responsibility**: Database operations
- **Key Methods**:
  - `connect()` - Establish connection
  - `fetchDocumentsBatch()` - Stream documents
  - `updateDocument()` - Safe update (no upsert)
  - `healthCheck()` - Connection status

**Safety Features**:
- Connection pooling
- Timeout handling
- No accidental document creation
- Transaction support ready

#### QueueService
- **Responsibility**: Job queue management using AWS SQS
- **Key Methods**:
  - `sendMessage()` - Queue document for processing
  - `receiveMessages()` - Poll messages from queue
  - `deleteMessage()` - Remove processed message
  - `getStats()` - Monitor queue metrics

**Features**:
- Long polling for efficiency
- Visibility timeout management
- Message persistence
- Configurable concurrency
- Supports LocalStack for development

#### AIProcessorService
- **Responsibility**: AI-powered document correction using OpenAI
- **Key Methods**:
  - `correctDocument()` - Send to OpenAI GPT API
  - `testConnection()` - Verify API access
  - `processBatch()` - Process multiple documents efficiently

**Process**:
1. Generate correction prompt
2. Call OpenAI Chat Completions API
3. Parse JSON response
4. Preserve critical fields (_id, question_id)

**Features**:
- Support for multiple GPT models
- Streaming response handling
- Token usage tracking
- Structured output parsing

#### UpdaterService
- **Responsibility**: Safe document updates
- **Key Methods**:
  - `updateDocument()` - Validate and update
  - `updateBatch()` - Bulk updates

**Safety Checks**:
1. Validate corrected document
2. Verify document exists
3. Update with retry logic
4. Log all operations

#### ScannerService
- **Responsibility**: Document scanning and queueing
- **Key Methods**:
  - `scanAndQueue()` - Main scanning process
  - `scanDocument()` - Single document scan

**Process**:
1. Fetch documents in batches
2. Validate each document
3. Backup invalid documents
4. Queue for processing
5. Track statistics

### 5. Utilities (`src/utils/`)

**Purpose**: Reusable helper functions

#### Logger
- Winston-based logging
- Multiple transports (console, file)
- Structured logging
- Log rotation

#### BackupManager
- JSON file backups
- Timestamped filenames
- Metadata storage
- Backup statistics

#### RetryHelper
- Configurable retry logic
- Exponential backoff
- Error callbacks
- Type-safe execution

### 6. Prompts (`src/prompts/`)

**Purpose**: AI prompt templates

#### correction-prompt.ts
- Generates detailed correction prompts
- Includes schema definition
- Lists validation errors
- Emphasizes format requirements
- Parses AI responses

## Data Flow

### Scanner Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Scanner CLI Started                                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Initialize Services                                      │
│    - Load config                                            │
│    - Connect to MongoDB                                     │
│    - Connect to Redis                                       │
│    - Initialize BackupManager                               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Fetch Documents (batch stream)                           │
│    for await (batch of documents) {                         │
│      process batch                                          │
│    }                                                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. For Each Document in Batch                               │
│    ┌──────────────────────────────────────────────┐       │
│    │ Validate Document                              │       │
│    └──────────────────┬─────────────────────────────┘       │
│                       │                                     │
│         ┌─────────────┴─────────────┐                      │
│         ▼                           ▼                      │
│    ┌─────────┐                ┌──────────┐               │
│    │ Valid   │                │ Invalid  │               │
│    │ (skip)  │                │          │               │
│    └─────────┘                └────┬─────┘               │
│                                     │                      │
│                                     ▼                      │
│                            ┌─────────────────┐            │
│                            │ 5. Save Backup  │            │
│                            └────────┬────────┘            │
│                                     │                      │
│                                     ▼                      │
│                            ┌─────────────────┐            │
│                            │ 6. Queue Job    │            │
│                            └─────────────────┘            │
└─────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Log Statistics                                           │
│    - Total scanned                                          │
│    - Valid count                                            │
│    - Invalid count                                          │
│    - Queued count                                           │
└─────────────────────────────────────────────────────────────┘
```

### Consumer Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Consumer CLI Started                                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Initialize Services                                      │
│    - Load config                                            │
│    - Connect to MongoDB                                     │
│    - Connect to Redis                                       │
│    - Initialize AI Processor                                │
│    - Test AI connection                                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Create Worker (BullMQ)                                   │
│    - Set concurrency                                        │
│    - Set retry options                                      │
│    - Register job processor                                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Wait for Jobs (continuous loop)                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Job Received                                             │
│    ┌──────────────────────────────────────────────┐       │
│    │ Extract: documentId, failedDocument, errors  │       │
│    └──────────────────┬───────────────────────────┘       │
│                       │                                     │
│                       ▼                                     │
│    ┌──────────────────────────────────────────────┐       │
│    │ 6. Call AI Processor (OpenAI)                │       │
│    │    - Generate prompt with errors             │       │
│    │    - Call GPT API                            │       │
│    │    - Parse JSON response                     │       │
│    └──────────────────┬───────────────────────────┘       │
│                       │                                     │
│                       ▼                                     │
│    ┌──────────────────────────────────────────────┐       │
│    │ 7. Validate AI Response                      │       │
│    │    - Run through SchemaValidator             │       │
│    └──────────────────┬───────────────────────────┘       │
│                       │                                     │
│         ┌─────────────┴─────────────┐                      │
│         ▼                           ▼                      │
│    ┌─────────┐                ┌──────────┐               │
│    │ Invalid │                │  Valid   │               │
│    │ (retry) │                │          │               │
│    └─────────┘                └────┬─────┘               │
│                                     │                      │
│                                     ▼                      │
│                            ┌─────────────────┐            │
│                            │ 8. Update DB    │            │
│                            │  (no upsert)    │            │
│                            └────────┬────────┘            │
│                                     │                      │
│         ┌───────────────────────────┴───────────┐         │
│         ▼                                       ▼         │
│    ┌─────────┐                            ┌─────────┐    │
│    │ Failed  │                            │ Success │    │
│    │ (retry) │                            │  (done) │    │
│    └─────────┘                            └─────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Database Safety

### Critical: No Duplicate Documents

**Problem**: Traditional `updateOne` with `upsert: true` can create duplicates

**Solution**: Use `findOneAndReplace` with `upsert: false`

```typescript
// ❌ WRONG - Can create duplicates
await collection.updateOne(
  { _id: documentId },
  { $set: correctedDocument },
  { upsert: true }  // DANGER!
);

// ✅ CORRECT - Safe update
await collection.findOneAndReplace(
  { _id: new ObjectId(documentId) },
  correctedDocument,
  { upsert: false }  // Never creates new documents
);
```

**Additional Safety**:
1. Verify document exists before update
2. Log all update operations
3. Validate before and after update
4. Use ObjectId for exact matching

## Error Handling Strategy

### Levels of Error Handling

1. **Configuration Level**
   - Fail fast on invalid config
   - Clear error messages
   - No runtime surprises

2. **Connection Level**
   - Retry connections with backoff
   - Health checks
   - Graceful degradation

3. **Processing Level**
   - Try/catch on all async operations
   - Structured error logging
   - Error context preservation

4. **Job Level**
   - BullMQ automatic retries
   - Exponential backoff
   - Failed job queue

### Error Recovery

```
Error Detected
    │
    ▼
Log Error with Context
    │
    ▼
Determine if Retryable
    │
    ├─── Yes ──→ Retry with Backoff
    │                   │
    │                   ├─── Success ──→ Continue
    │                   └─── Fail ──→ Max Retries?
    │                                      │
    │                                      ├─── Yes ──→ Move to Failed Queue
    │                                      └─── No ──→ Retry Again
    │
    └─── No ──→ Log Fatal Error & Skip
```

## Scalability Considerations

### Horizontal Scaling

**Scanner**:
- Run multiple scanner instances with different batch ranges
- Use MongoDB cursor isolation

**Consumer**:
- Run multiple consumer instances
- BullMQ handles job distribution
- Concurrency controlled per instance

### Vertical Scaling

**Batch Size**:
- Increase for more throughput
- Monitor memory usage

**Concurrency**:
- Increase for faster processing
- Respect API rate limits

### Bottlenecks

1. **MongoDB Read**: Use indexes on _id
2. **AI API**: Rate limits (adjust concurrency)
3. **Redis**: Memory limits (configure expiration)
4. **Network**: Use connection pooling

## Monitoring Points

### Key Metrics

1. **Scanner**:
   - Documents scanned/sec
   - Validation error rate
   - Backup success rate

2. **Queue**:
   - Queue depth
   - Processing rate
   - Failed job count

3. **Consumer**:
   - Jobs processed/min
   - AI response time
   - Update success rate

4. **Database**:
   - Connection pool usage
   - Query execution time
   - Update operation count

### Log Levels

- **ERROR**: Failed operations, critical issues
- **WARN**: Retries, missing data
- **INFO**: Lifecycle events, statistics
- **DEBUG**: Detailed execution flow

## Testing Strategy

### Unit Tests

```typescript
// Validator tests
describe('SchemaValidator', () => {
  it('should reject invalid difficulty', () => {
    const result = validator.validate({ difficulty: 'easy' });
    expect(result.isValid).toBe(false);
  });
});

// Service tests
describe('MongoDBService', () => {
  it('should not create new document on update', async () => {
    const count = await collection.countDocuments();
    await service.updateDocument(id, doc);
    const newCount = await collection.countDocuments();
    expect(newCount).toBe(count);
  });
});
```

### Integration Tests

```typescript
describe('End-to-End', () => {
  it('should scan, queue, process, and update', async () => {
    // Run scanner
    await scannerService.scanAndQueue();

    // Process queue
    const job = await queue.getNextJob();
    await processor(job);

    // Verify update
    const updated = await mongo.findById(documentId);
    expect(updated).toMatchSchema();
  });
});
```

## Security Considerations

### API Key Security
- Never log API keys
- Use environment variables
- Rotate keys regularly
- Monitor API usage

### Database Security
- Use authentication
- Least privilege access
- Enable TLS/SSL
- Audit trail

### Data Safety
- Backup before modification
- Validate before update
- Preserve critical fields
- Log all changes

## Performance Optimization

### Database
```typescript
// Use lean queries (no Mongoose overhead)
collection.find({}).lean();

// Batch operations
const bulk = collection.initializeUnorderedBulkOp();
// ... add operations
await bulk.execute();

// Index on _id (exists by default)
// Add indexes for custom queries
```

### Queue
```typescript
// Optimize job options
{
  removeOnComplete: 1000,  // Keep last 1000
  removeOnFail: 5000,      // Keep last 5000 failed
}

// Use job priorities
queue.add(data, { priority: 1 });  // Higher priority
```

### AI Processing
```typescript
// Minimize prompt size
// Use efficient models
// Cache similar corrections (future enhancement)
```

## Future Enhancements

1. **Caching Layer**
   - Cache AI corrections for similar errors
   - Redis-based cache

2. **Batch AI Processing**
   - Send multiple documents in one API call
   - Reduce API costs

3. **Real-time Dashboard**
   - WebSocket-based monitoring
   - Queue statistics visualization

4. **Custom Validation Rules**
   - Plugin system for validators
   - Domain-specific rules

5. **Rollback Capability**
   - Track changes
   - Restore from backups
   - Audit trail

6. **Performance Metrics**
   - Prometheus integration
   - Grafana dashboards
   - Alert system

## Conclusion

This architecture provides:
- ✅ Separation of concerns
- ✅ Type safety
- ✅ Testability
- ✅ Scalability
- ✅ Reliability
- ✅ Maintainability

Each component has a single, well-defined responsibility and can be tested and scaled independently.
