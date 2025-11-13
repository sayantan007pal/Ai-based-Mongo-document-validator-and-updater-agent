import OpenAI from 'openai';
import { AIConfig } from '../config/ai.config';
import { CodingQuestion } from '../models/CodingQuestion';
import { ValidationError } from '../models/ValidationError';
import { logger } from '../utils/Logger';
import { generateCorrectionPrompt, parseAIResponse } from '../prompts/correction-prompt';

/**
 * AI Processor Service using OpenAI API
 */
export class AIProcessorService {
  private client: OpenAI;
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
  }

  /**
   * Process and correct a document using AI
   */
  async correctDocument(
    document: CodingQuestion,
    validationErrors: ValidationError[]
  ): Promise<CodingQuestion> {
    try {
      logger.info('Processing document with AI', {
        documentId: document._id?.toString(),
        questionId: document.question_id,
        errorCount: validationErrors.length,
      });

      // Generate prompt
      const prompt = generateCorrectionPrompt(document, validationErrors);

      // Call OpenAI API
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        max_completion_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that corrects and validates coding question documents according to specific schema requirements.',
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
      });

      // Extract text response
      const aiResponse = response.choices[0]?.message?.content;
      if (!aiResponse) {
        // Log full response for debugging
        logger.error('No content in AI response - full response details', {
          questionId: document.question_id,
          finishReason: response.choices[0]?.finish_reason,
          refusal: response.choices[0]?.message?.refusal,
          responseId: response.id,
          model: response.model,
        });
        throw new Error(`No content in AI response. Finish reason: ${response.choices[0]?.finish_reason}`);
      }

      logger.debug('AI response received', {
        questionId: document.question_id,
        responseLength: aiResponse.length,
      });

      // Parse response
      const correctedDocument = parseAIResponse(aiResponse);

      // Ensure _id is preserved
      if (document._id) {
        correctedDocument._id = document._id;
      }

      // Ensure question_id is preserved - critical field
      // Use original question_id, or if missing, use _id as question_id
      if (document.question_id) {
        correctedDocument.question_id = document.question_id;
      } else if (document._id) {
        // If original document didn't have question_id, use _id
        correctedDocument.question_id = document._id.toString();
      }

      // If AI somehow removed question_id, restore it
      if (!correctedDocument.question_id && document.question_id) {
        correctedDocument.question_id = document.question_id;
      }

      logger.info('Document corrected successfully by AI', {
        questionId: correctedDocument.question_id,
      });

      return correctedDocument;
    } catch (error) {
      logger.error('AI processing failed', {
        questionId: document.question_id,
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      throw error;
    }
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
