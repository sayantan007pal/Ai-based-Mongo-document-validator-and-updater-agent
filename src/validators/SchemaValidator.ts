import { ZodError } from 'zod';
import {
  CodingQuestion,
  CodingQuestionSchema,
  CodingQuestionValidator,
} from '../models/CodingQuestion';
import {
  ValidationError,
  ValidationErrorFactory,
  ValidationResult,
} from '../models/ValidationError';
import { logger } from '../utils/Logger';

/**
 * Schema Validator for Coding Questions
 */
export class SchemaValidator {
  private skipCustomValidations: boolean;

  constructor(options: { skipCustomValidations?: boolean } = {}) {
    this.skipCustomValidations = options.skipCustomValidations || false;
  }

  /**
   * Validate a coding question document
   */
  validate(document: any): ValidationResult {
    const errors: ValidationError[] = [];
    let documentId: string | undefined;

    try {
      // Extract document ID for tracking
      if (document._id) {
        documentId = document._id.toString();
      }

      // Step 1: Validate against Zod schema
      const zodErrors = this.validateWithZod(document);
      errors.push(...zodErrors);

      // If Zod validation passed, perform custom validations (unless skipped)
      if (zodErrors.length === 0 && !this.skipCustomValidations) {
        const customErrors = this.performCustomValidations(document);
        errors.push(...customErrors);
      }

      const isValid = errors.length === 0;

      if (!isValid) {
        logger.debug('Validation failed for document', {
          documentId,
          errorCount: errors.length,
        });
      }

      return {
        isValid,
        errors,
        documentId,
      };
    } catch (error) {
      logger.error('Validation error', {
        documentId,
        error: (error as Error).message,
      });

      // Return critical error
      return {
        isValid: false,
        errors: [
          ValidationErrorFactory.invalidValue(
            'document',
            `Critical validation error: ${(error as Error).message}`
          ),
        ],
        documentId,
      };
    }
  }

  /**
   * Validate using Zod schema
   */
  private validateWithZod(document: any): ValidationError[] {
    const errors: ValidationError[] = [];

    try {
      CodingQuestionSchema.parse(document);
    } catch (error) {
      if (error instanceof ZodError) {
        // Convert Zod errors to ValidationError format
        error.errors.forEach((zodError) => {
          const field = zodError.path.join('.');
          const message = zodError.message;

          switch (zodError.code) {
            case 'invalid_type':
              errors.push(
                ValidationErrorFactory.invalidType(
                  field,
                  zodError.expected,
                  zodError.received
                )
              );
              break;
            case 'invalid_enum_value':
              errors.push(
                ValidationErrorFactory.invalidValue(
                  field,
                  `Must be one of: ${zodError.options.join(', ')}`,
                  zodError.received
                )
              );
              break;
            case 'too_small':
              if (zodError.type === 'array') {
                errors.push(ValidationErrorFactory.emptyArray(field));
              } else {
                errors.push(ValidationErrorFactory.invalidValue(field, message));
              }
              break;
            case 'invalid_string':
              errors.push(ValidationErrorFactory.invalidFormat(field, message));
              break;
            case 'unrecognized_keys':
              zodError.keys.forEach((key) => {
                errors.push(ValidationErrorFactory.extraField(`${field}.${key}`));
              });
              break;
            default:
              errors.push(ValidationErrorFactory.invalidValue(field, message));
          }
        });
      } else {
        throw error;
      }
    }

    return errors;
  }

  /**
   * Perform custom validations beyond Zod schema
   */
  private performCustomValidations(document: CodingQuestion): ValidationError[] {
    const errors: ValidationError[] = [];

    try {
      // Use custom validator from CodingQuestion model
      const customErrors = CodingQuestionValidator.performCustomValidations(document);

      // Convert string errors to ValidationError objects
      customErrors.forEach((errorMsg) => {
        if (errorMsg.includes('Test case')) {
          errors.push(ValidationErrorFactory.invalidFormat('testCases', errorMsg));
        } else if (errorMsg.includes('inputFormat')) {
          errors.push(ValidationErrorFactory.invalidFormat('inputFormat', errorMsg));
        } else {
          errors.push(ValidationErrorFactory.constraintViolation('document', errorMsg));
        }
      });
    } catch (error) {
      logger.error('Custom validation error', {
        error: (error as Error).message,
      });
    }

    return errors;
  }

  /**
   * Validate multiple documents
   */
  validateBatch(documents: any[]): ValidationResult[] {
    return documents.map((doc) => this.validate(doc));
  }

  /**
   * Get validation summary for a batch
   */
  getBatchSummary(results: ValidationResult[]): {
    total: number;
    valid: number;
    invalid: number;
    errorsByField: Record<string, number>;
  } {
    const summary = {
      total: results.length,
      valid: results.filter((r) => r.isValid).length,
      invalid: results.filter((r) => !r.isValid).length,
      errorsByField: {} as Record<string, number>,
    };

    // Count errors by field
    results.forEach((result) => {
      result.errors.forEach((error) => {
        const field = error.field;
        summary.errorsByField[field] = (summary.errorsByField[field] || 0) + 1;
      });
    });

    return summary;
  }
}
