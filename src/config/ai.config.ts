import { z } from 'zod';

/**
 * AI Configuration Schema for OpenAI
 */
export const AIConfigSchema = z.object({
  provider: z.enum(['openai']),
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().min(1, 'Model name is required'),
  maxTokens: z.number().int().positive().default(4000),
  temperature: z.number().min(0).max(2).default(0.1),
});

export type AIConfig = z.infer<typeof AIConfigSchema>;

/**
 * Load AI configuration from environment
 */
export function loadAIConfig(): AIConfig {
  return AIConfigSchema.parse({
    provider: process.env.AI_PROVIDER || 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL || 'gpt-5.1-2025-11-13',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '4000', 10),
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.1'),
  });
}
