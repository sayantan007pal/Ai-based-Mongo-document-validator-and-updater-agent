import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import { DataTransformer } from './utils/DataTransformer';
import { SchemaValidator } from './validators/SchemaValidator';

const missingJsonPath = '/Users/sayantanpal100/Desktop/Coding question updater agent/missing.json';
const rawData = JSON.parse(fs.readFileSync(missingJsonPath, 'utf-8'));

console.log(`Total documents in missing.json: ${rawData.length}\n`);

const transformed = DataTransformer.transformAll(rawData);
console.log(`Successfully transformed: ${transformed.length}\n`);

const validator = new SchemaValidator({ skipCustomValidations: true });
let validCount = 0;
let invalidCount = 0;

const errorSummary: { [key: string]: number } = {};

transformed.forEach((doc, index) => {
  const result = validator.validate(doc);

  if (result.isValid) {
    validCount++;
  } else {
    invalidCount++;

    // Collect error types
    result.errors.forEach(error => {
      const key = `${error.field}: ${error.message}`;
      errorSummary[key] = (errorSummary[key] || 0) + 1;
    });

    // Print first 3 failures in detail
    if (invalidCount <= 3) {
      console.log(`\n=== Document ${index} FAILED: "${doc.title}" ===`);
      console.log('Errors:');
      result.errors.forEach(err => {
        console.log(`  - ${err.field}: ${err.message}`);
      });
      console.log('Document:', JSON.stringify(doc, null, 2).substring(0, 500));
    }
  }
});

console.log(`\n${'='.repeat(80)}`);
console.log(`SUMMARY`);
console.log(`${'='.repeat(80)}`);
console.log(`Valid: ${validCount}`);
console.log(`Invalid: ${invalidCount}`);
console.log(`\nError Frequency:`);
Object.entries(errorSummary)
  .sort((a, b) => b[1] - a[1])
  .forEach(([error, count]) => {
    console.log(`  ${count}x - ${error}`);
  });
