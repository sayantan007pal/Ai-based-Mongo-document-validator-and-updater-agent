import { CodingQuestion } from '../models/CodingQuestion';
import { ValidationError } from '../models/ValidationError';

/**
 * Generate AI correction prompt
 */
export function generateCorrectionPrompt(
  document: CodingQuestion,
  validationErrors: ValidationError[]
): string {
  return `You are a data correction specialist. Your task is to fix a coding question document that has validation errors.

## CRITICAL REQUIREMENTS:
1. Return ONLY valid JSON - no markdown, no explanations, no code blocks
2. PRESERVE the _id field EXACTLY as provided: "${document._id}"
3. PRESERVE the question_id field EXACTLY as provided: "${document.question_id || document._id}"
4. NEVER remove or modify _id or question_id fields
5. Fix ALL validation errors listed below
6. Ensure test cases use stdin/stdout format (NOT variable assignment format)
7. All 5 programming languages (c, cpp, java, javascript, python) must have non-empty code
8. difficulty must be EXACTLY one of: "Easy", "Medium", or "Hard"
9. slug must be lowercase-with-hyphens

## VALIDATION ERRORS TO FIX:
${validationErrors.map((err, idx) => `${idx + 1}. Field: "${err.field}" - ${err.message}`).join('\n')}

## SCHEMA DEFINITION:
{
  "_id": "MongoDB ObjectId (PRESERVE EXACTLY)",
  "question_id": "string (PRESERVE EXACTLY)",
  "title": "string (required)",
  "difficulty": "Easy" | "Medium" | "Hard" (literal type, case-sensitive),
  "slug": "lowercase-with-hyphens",
  "topic_tags": ["string"] (array, min 1 item),
  "content": "string (plain text, no markdown)",
  "constraints": ["string"] (array, min 1 item),
  "testCases": [
    {
      "id": number,
      "input": "string (stdin format: e.g., '5\\n1 2 3 4 5')",
      "expectedOutput": "string (stdout format: e.g., '15')",
      "description": "string",
      "original_input": "string",
      "original_output": "string"
    }
  ],
  "starterCode": {
    "c": "string (non-empty)",
    "cpp": "string (non-empty)",
    "java": "string (non-empty)",
    "javascript": "string (non-empty)",
    "python": "string (non-empty)"
  },
  "solutionCode": {
    "c": "string (non-empty)",
    "cpp": "string (non-empty)",
    "java": "string (non-empty)",
    "javascript": "string (non-empty)",
    "python": "string (non-empty)"
  },
  "inputFormat": "string (should contain code blocks with \`\`\`)",
  "outputFormat": "string (descriptive text)"
}

## TEST CASE FORMAT REQUIREMENTS:
- Input must be in stdin format (line-by-line input as user would type)
- Expected output must be in stdout format (what program prints to console)
- WRONG: "input": "nums = [3,5]", "expectedOutput": "[3,5]"
- CORRECT: "input": "2\\n3 5", "expectedOutput": "8"

## ORIGINAL DOCUMENT:
${JSON.stringify(document, null, 2)}

## YOUR TASK:
Fix all validation errors in the document above. Return the corrected document as pure JSON (no markdown, no explanations).

CRITICAL REMINDER:
- Your response MUST include "_id": "${document._id}"
- Your response MUST include "question_id": "${document.question_id || document._id}"
- Do NOT omit these fields under any circumstances

RESPOND WITH ONLY THE CORRECTED JSON DOCUMENT:`;
}

/**
 * Parse AI response and extract JSON
 */
export function parseAIResponse(response: string): CodingQuestion {
  try {
    // Remove markdown code blocks if present
    let cleaned = response.trim();

    // Remove ```json and ``` markers
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    // Parse JSON
    const parsed = JSON.parse(cleaned);

    return parsed as CodingQuestion;
  } catch (error) {
    throw new Error(`Failed to parse AI response: ${(error as Error).message}`);
  }
}
