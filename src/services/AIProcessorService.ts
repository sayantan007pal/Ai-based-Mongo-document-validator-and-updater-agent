import OpenAI from 'openai';
import { AIConfig } from '../config/ai.config';
import { CodingQuestion } from '../models/CodingQuestion';
import { ValidationError } from '../models/ValidationError';
import { logger } from '../utils/Logger';
import { generateComprehensiveCorrectionPrompt, parseComprehensiveAIResponse } from '../prompts/comprehensive-correction-prompt';

/**
 * AI Processor Service using OpenAI API with comprehensive solution generation
 */
export class AIProcessorService {
  private client: OpenAI;
  private config: AIConfig;
  private readonly MAX_RETRIES_FOR_LENGTH = 3;
  private readonly TOKEN_PROGRESSION = [100000, 150000, 200000]; // Progressive token limits

  constructor(config: AIConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
  }

  /**
   * Process and correct a document using AI with retry logic for length errors
   */
  async correctDocument(
    document: CodingQuestion,
    validationErrors: ValidationError[]
  ): Promise<CodingQuestion> {
    let lastError: Error | null = null;

    // Try with progressive token limits if length error occurs
    for (let attempt = 0; attempt < this.MAX_RETRIES_FOR_LENGTH; attempt++) {
      try {
        const maxTokens = this.TOKEN_PROGRESSION[attempt] || this.config.maxTokens;

        logger.info('Processing document with AI', {
          documentId: document._id?.toString(),
          questionId: document.question_id,
          errorCount: validationErrors.length,
          attempt: attempt + 1,
          maxTokens,
        });

        // Generate comprehensive prompt
        const prompt = generateComprehensiveCorrectionPrompt(document, validationErrors);

        // Call OpenAI API
        const response = await this.client.chat.completions.create({
          model: this.config.model,
          max_completion_tokens: maxTokens,
          temperature: this.config.temperature,
          messages: [
            {
              role: 'system',
              content: 'You are a professional coding assistant that fixes and enhances coding question documents with complete, working solutions in five programming languages.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
        });

        // Log response details for debugging
        logger.debug('OpenAI API response received', {
          questionId: document.question_id,
          finishReason: response.choices[0]?.finish_reason,
          hasContent: !!response.choices[0]?.message?.content,
          choicesCount: response.choices?.length,
          attempt: attempt + 1,
        });

        const finishReason = response.choices[0]?.finish_reason;

        // Check for length error
        if (finishReason === 'length') {
          logger.warn('AI response truncated due to length', {
            questionId: document.question_id,
            attempt: attempt + 1,
            maxTokensUsed: maxTokens,
            willRetry: attempt < this.MAX_RETRIES_FOR_LENGTH - 1,
          });

          if (attempt < this.MAX_RETRIES_FOR_LENGTH - 1) {
            // Retry with higher token limit
            lastError = new Error(`Response truncated (length error), retrying with higher token limit`);
            continue;
          } else {
            // Final attempt failed
            throw new Error(`Response truncated after ${this.MAX_RETRIES_FOR_LENGTH} attempts with max tokens: ${maxTokens}`);
          }
        }

        // Extract text response
        const aiResponse = response.choices[0]?.message?.content;
        if (!aiResponse) {
          // Log full response for debugging
          logger.error('No content in AI response - full response details', {
            questionId: document.question_id,
            finishReason,
            refusal: response.choices[0]?.message?.refusal,
            responseId: response.id,
            model: response.model,
          });
          throw new Error(`No content in AI response. Finish reason: ${finishReason}`);
        }

        logger.debug('AI response received', {
          questionId: document.question_id,
          responseLength: aiResponse.length,
          attempt: attempt + 1,
        });

        // Parse response using comprehensive parser
        const correctedDocument = parseComprehensiveAIResponse(aiResponse);

        // Ensure _id is preserved
        if (document._id) {
          correctedDocument._id = document._id;
        }

        // Ensure question_id is preserved - critical field
        if (document.question_id) {
          correctedDocument.question_id = document.question_id;
        } else if (document._id) {
          correctedDocument.question_id = document._id.toString();
        }

        // If AI somehow removed question_id, restore it
        if (!correctedDocument.question_id && document.question_id) {
          correctedDocument.question_id = document.question_id;
        }

        logger.info('Document corrected successfully by AI', {
          questionId: correctedDocument.question_id,
          attempt: attempt + 1,
        });

        return correctedDocument;
      } catch (error) {
        lastError = error as Error;

        // If it's a length error and we can retry, continue
        if (lastError.message.includes('length') && attempt < this.MAX_RETRIES_FOR_LENGTH - 1) {
          logger.warn('Retrying with higher token limit', {
            questionId: document.question_id,
            attempt: attempt + 1,
            error: lastError.message,
          });
          continue;
        }

        // If it's not a length error or we've exhausted retries, throw
        logger.error('AI processing failed', {
          questionId: document.question_id,
          attempt: attempt + 1,
          error: lastError.message,
          stack: lastError.stack,
        });
        throw lastError;
      }
    }

    // Should never reach here, but just in case
    throw lastError || new Error('AI processing failed after all retry attempts');
  }

  /**
   * Test AI connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        max_completion_tokens: 100,
        messages: [
          {
            role: 'user',
            content: 'Respond with "OK" if you can read this.',
          },
        ],
      });

      const hasOK = response.choices[0]?.message?.content?.includes('OK');

      logger.info('AI connection test', { success: hasOK });
      return !!hasOK;
    } catch (error) {
      logger.error('AI connection test failed', {
        error: (error as Error).message,
      });
      return false;
    }
  }
}
