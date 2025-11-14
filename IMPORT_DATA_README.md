# Data Import Guide

This guide explains how to import data from `missing.json` into the MongoDB `coding_questions` collection while ensuring all documents pass schema validation.

## Overview

The import process performs the following steps automatically:

1. **Read** - Loads data from `missing.json`
2. **Transform** - Converts raw documents to match the strict schema requirements
3. **Validate** - Ensures all transformed documents pass schema validation
4. **Delete** - Removes all existing documents from the `coding_questions` collection
5. **Insert** - Inserts validated documents into the collection
6. **Verify** - Confirms inserted documents pass schema validation

## Prerequisites

### 1. MongoDB Running
Ensure MongoDB replica set is running at:
```
mongodb://localhost:27017,localhost:27018,localhost:27019/recruitment?replicaSet=rs0
```

### 2. Environment Configuration
Verify `.env` file contains:
```env
MONGODB_URI=mongodb://localhost:27017,localhost:27018,localhost:27019/recruitment?replicaSet=rs0
MONGODB_DATABASE=recruitment
MONGODB_COLLECTION=coding_questions
```

### 3. Dependencies Installed
```bash
npm install
```

## Running the Import

### Option 1: Using npm script (Recommended)
```bash
npm run import
```

### Option 2: Using ts-node directly
```bash
ts-node src/importData.ts
```

### Option 3: Custom file path
```bash
npm run import -- /path/to/your/data.json
```

or

```bash
ts-node src/importData.ts /path/to/your/data.json
```

## What Happens During Import

### Data Transformation

The transformer automatically handles these incompatibilities:

#### Field Mappings:
- `tags` → `topic_tags`
- Generates `question_id` from slug or title
- Adds `solutionCode` (placeholder implementations)

#### Data Type Conversions:
- `difficulty`: "easy" → "Easy", "medium" → "Medium", "hard" → "Hard"
- `constraints`: String → Array (split by newlines)
- Test case `id`: String → Number

#### Test Case Enhancements:
- Adds `description` field (if missing)
- Adds `original_input` (copy of input)
- Adds `original_output` (copy of expectedOutput)
- Removes MongoDB `_id` fields from test cases

#### Format Validation:
- Wraps `inputFormat` with code blocks (```) if missing
- Generates default `outputFormat` if missing
- Ensures `slug` is lowercase with hyphens

#### Field Removal:
Extra fields are automatically removed to pass strict mode:
- `hints`
- `accepted`, `submitted`, `acceptedRate`
- `timeInMinutes`
- `version`
- `createdAt`, `updatedAt`, `__v`
- `invalidReason`, `assignedTo`

### Validation

Each document is validated against:

1. **Zod Schema** - Type checking and required fields
2. **Custom Validators** - Business logic rules:
   - Test cases must use stdin/stdout format
   - `inputFormat` must contain code blocks
   - All 5 languages required in `starterCode` and `solutionCode`
   - Arrays must not be empty

### Database Operations

1. **Delete**: Uses `deleteMany({})` to clear collection
2. **Insert**: Batch inserts in groups of 100 documents
3. **Verify**: Samples 10 documents to confirm validation

## Expected Output

### Success Log Example:
```
[INFO] Data Importer Starting
[INFO] Reading missing.json file
[INFO] Successfully read missing.json - totalDocuments: 150
[INFO] Starting document transformation
[INFO] Document transformation complete - successful: 150, failed: 0
[INFO] Validating transformed documents
[INFO] Validation complete - valid: 148, invalid: 2
[INFO] Deleting all existing documents from collection
[INFO] Documents before deletion - count: 1250
[INFO] Successfully deleted all documents - deletedCount: 1250
[INFO] Insertion verified - expectedCount: 148, actualCount: 148
[INFO] All sample documents passed validation
[INFO] Data Import Process Completed Successfully
```

### Summary Information:
- Total documents read from `missing.json`
- Valid documents after transformation
- Invalid documents (with error details)
- Documents successfully inserted
- Verification results

## Troubleshooting

### Error: "MongoDB connection failed"
- Verify MongoDB replica set is running
- Check connection string in `.env`
- Ensure network connectivity to localhost:27017-27019

### Error: "No valid documents to import"
- Check transformation logs for specific validation errors
- Review `missing.json` format and structure
- Ensure required fields exist in source data

### Error: "Deletion verification failed"
- Collection may have active operations
- Check MongoDB logs for issues
- Verify user has delete permissions

### Error: "Document failed validation"
- Review specific validation errors in logs
- Check for missing required fields
- Verify data types match schema requirements

## Schema Requirements

Every document must have:

### Required Fields:
- `question_id`: string
- `title`: string
- `difficulty`: "Easy" | "Medium" | "Hard" (exact case)
- `slug`: lowercase-with-hyphens format
- `topic_tags`: array of strings (min 1)
- `content`: string
- `constraints`: array of strings (min 1)
- `testCases`: array of test case objects (min 1)
- `starterCode`: object with c, cpp, java, javascript, python
- `solutionCode`: object with c, cpp, java, javascript, python
- `inputFormat`: string with code blocks
- `outputFormat`: string

### Test Case Requirements:
- `id`: positive integer
- `input`: non-empty string
- `expectedOutput`: non-empty string
- `description`: non-empty string
- `original_input`: string
- `original_output`: string

## Files Created

1. `src/utils/DataTransformer.ts` - Transforms raw data to schema format
2. `src/importData.ts` - Main orchestration script

## Safety Features

- **No Accidental Inserts**: The script explicitly deletes all documents before inserting
- **Validation First**: Only validated documents are inserted
- **Batch Operations**: Efficient batch processing for large datasets
- **Detailed Logging**: Complete audit trail of all operations
- **Error Recovery**: Graceful handling of transformation failures
- **Verification**: Post-insert validation ensures data integrity

## Post-Import Verification

After import completes, verify the data:

```bash
# Connect to MongoDB
mongosh "mongodb://localhost:27017/recruitment?replicaSet=rs0"

# Check document count
db.coding_questions.countDocuments()

# Sample a document
db.coding_questions.findOne()

# Verify all have required fields
db.coding_questions.findOne({ question_id: { $exists: false } })
// Should return null
```

## Next Steps

After successful import:
1. Run the schema validator to verify all documents
2. Start the scanner to process questions
3. Monitor logs for any validation issues
4. Use the AI correction system for remaining invalid documents
