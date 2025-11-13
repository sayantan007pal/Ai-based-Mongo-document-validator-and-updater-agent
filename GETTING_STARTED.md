# Getting Started - Coding Question Validator

## Quick Start (5 Minutes)

### 1. Install Dependencies
```bash
cd coding-question-validator
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env and set:
# - MONGODB_URI (your MongoDB connection string)
# - OPENAI_API_KEY (your OpenAI API key)
# - SQS_QUEUE_URL (your SQS queue URL or LocalStack URL)
```

### 3. Build
```bash
npm run build
```

### 4. Run
```bash
# Terminal 1: Start consumer
npm run consumer

# Terminal 2: Run scanner
npm run scanner
```

## What Happens Next?

1. **Scanner** scans all documents in MongoDB
2. Invalid documents are **backed up** to `./failed_questions/`
3. Invalid documents are **queued** for processing
4. **Consumer** processes queue using Claude AI
5. Corrected documents are **validated** again
6. Valid corrections are **updated** in MongoDB
7. All operations are **logged** to `./logs/`

## Monitoring

```bash
# Watch logs in real-time
tail -f logs/combined.log

# Check queue status
redis-cli LLEN bull:question-validation-queue:waiting

# View backups
ls -lh failed_questions/
```

## Need Help?

- **Setup Issues**: See [SETUP_GUIDE.md](SETUP_GUIDE.md)
- **Usage Questions**: See [README.md](README.md)
- **Architecture**: See [ARCHITECTURE.md](ARCHITECTURE.md)
- **Deployment**: See [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)

## Common Issues

### "Cannot connect to MongoDB"
```bash
# Check MongoDB is running
mongosh --eval "db.adminCommand('ping')"

# Initialize replica set if needed
mongosh --eval "rs.initiate()"
```

### "Redis connection refused"
```bash
# Start LocalStack for SQS
docker run -d -p 4566:4566 localstack/localstack

# Or configure real AWS SQS in .env
```

### "Invalid API key"
- Check `.env` file has correct API key
- Ensure no extra spaces or quotes
- Key should start with `sk-proj-` (OpenAI)

## Directory Structure

```
coding-question-validator/
├── src/              # TypeScript source code
├── logs/             # Application logs
├── failed_questions/ # Document backups
├── .env             # Your configuration (create from .env.example)
└── package.json     # Dependencies
```

## Next Steps

1. ✅ Run scanner to identify invalid documents
2. ✅ Review backups in `failed_questions/`
3. ✅ Start consumer to process queue
4. ✅ Monitor logs for errors
5. ✅ Verify updates in MongoDB

## Safety Features

✓ **No Duplicate Documents** - Uses safe update operations  
✓ **Automatic Backups** - All invalid documents backed up  
✓ **Validation** - Documents validated before and after correction  
✓ **Retry Logic** - Failed jobs automatically retry  
✓ **Comprehensive Logging** - All operations logged  

Happy validating! 🚀
