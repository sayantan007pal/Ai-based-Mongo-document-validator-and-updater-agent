import { CodingQuestion } from '../models/CodingQuestion';
import { ValidationError } from '../models/ValidationError';

/**
 * Generate comprehensive AI correction prompt with full solution generation
 * Based on the requirement to generate complete, working solutions with main+helper+formatter structure
 */
export function generateComprehensiveCorrectionPrompt(
  document: CodingQuestion,
  validationErrors: ValidationError[]
): string {
  const errorSummary = validationErrors
    .map((err, idx) => `${idx + 1}. Field: "${err.field}" - ${err.message}`)
    .join('\n');

  return `You are a professional coding assistant and data formatter that fixes and enhances algorithmic problem documents into standardized JSON with fully working solutions in five programming languages.

## YOUR TASK
Fix the provided coding question document that has validation errors and ensure it meets ALL requirements below. Generate complete, correct, and optimized solutions for all five languages: Python, JavaScript, Java, C++, and C.

## CRITICAL REQUIREMENTS
1. **PRESERVE IDENTITY**: Keep _id and question_id fields EXACTLY as provided
2. **FIX ALL ERRORS**: Address every validation error listed below
3. **COMPLETE SOLUTIONS**: Generate fully working code with proper structure for all 5 languages
4. **VALID JSON ONLY**: Output ONE valid JSON object only - no markdown, no explanations, no comments
5. **EXACT SCHEMA MATCH**: Follow the target schema precisely

---

## VALIDATION ERRORS TO FIX
${errorSummary}

---

## TARGET JSON SCHEMA
{
  "_id": "${document._id}" // PRESERVE EXACTLY - DO NOT CHANGE,
  "question_id": "${document.question_id || document._id}" // PRESERVE EXACTLY - DO NOT CHANGE,
  "title": "<question title>",
  "difficulty": "<Easy | Medium | Hard>",  // EXACT case required
  "slug": "<url-friendly-title>",  // lowercase-with-hyphens only
  "topic_tags": ["<list of relevant topics>"],  // min 1 item
  "content": "<full problem statement in plain text (no markdown)>",
  "constraints": ["<list of constraints>"],  // min 1 item
  "testCases": [
    {
      "id": <integer>,
      "input": "<exact stdin input>",  // stdin format: "5\\n1 2 3 4 5"
      "expectedOutput": "<exact stdout output>",  // stdout format: "15"
      "description": "<brief reasoning or empty string>",
      "original_input": "<original phrasing if provided>",
      "original_output": "<original phrasing if provided>"
    }
  ],
  "starterCode": {
    "c": "<c starter code template>",
    "cpp": "<cpp starter code template>",
    "java": "<java starter code template>",
    "javascript": "<javascript starter code template>",
    "python": "<python starter code template>"
  },
  "solutionCode": {
    "c": "<complete, correct C solution>",
    "cpp": "<complete, correct C++ solution>",
    "java": "<complete, correct Java solution>",
    "javascript": "<complete, correct JavaScript solution>",
    "python": "<complete, correct Python solution>"
  },
  "inputFormat": "<description with code blocks using triple backticks>",
  "outputFormat": "<description of expected output>"
}

---

## TRANSFORMATION RULES
1. **Preserve Identity**: NEVER modify _id or question_id fields
2. **Normalize Formatting**: Remove Markdown, HTML, or LaTeX syntax from content
3. **Generate Slug**: Convert title to lowercase-with-hyphens (e.g., "Two Sum" → "two-sum")
4. **Correct Difficulty**: Must be EXACTLY "Easy", "Medium", or "Hard" (case-sensitive)
5. **Validate Constraints**: Ensure all constraints are listed; infer reasonable ones if missing
6. **Create Valid Examples**: Generate at least 2-3 test cases with correct stdin/stdout format
7. **Complete Code Templates**: Provide starter code for all five languages
8. **Full Solutions Required**: Generate complete, working solutions for all five languages

---

## SOLUTION GENERATION RULES

Each language solution **MUST follow this three-part structure**:

### Structure Pattern:
1. **Main Function**: Handles input reading and output printing
2. **Helper/Solver Function**: Performs the core computation (called from main)
3. **Output Formatter**: Ensures printed output exactly matches expected format

### Python Example Structure:
\`\`\`python
def solve_problem(param1, param2):
    """Core logic function"""
    # Implementation here
    return result

def format_output(result):
    """Format the result for output"""
    return str(result)

def main():
    # Read input
    param1 = input().strip()
    param2 = list(map(int, input().split()))

    # Solve
    result = solve_problem(param1, param2)

    # Output
    print(format_output(result))

if __name__ == "__main__":
    main()
\`\`\`

### JavaScript Example Structure:
\`\`\`javascript
function solveProblem(param1, param2) {
    // Core logic
    return result;
}

function formatOutput(result) {
    return String(result);
}

function main() {
    const fs = require('fs');
    const input = fs.readFileSync(0, 'utf8').trim().split('\\n');

    // Parse input
    const param1 = input[0];
    const param2 = input[1].split(' ').map(Number);

    // Solve
    const result = solveProblem(param1, param2);

    // Output
    console.log(formatOutput(result));
}

main();
\`\`\`

### Java Example Structure:
\`\`\`java
import java.util.*;

public class Solution {
    public static ResultType solveProblem(ParamType1 param1, ParamType2 param2) {
        // Core logic
        return result;
    }

    public static String formatOutput(ResultType result) {
        return String.valueOf(result);
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);

        // Read input
        ParamType1 param1 = sc.nextLine();
        ParamType2 param2 = // parse input

        // Solve
        ResultType result = solveProblem(param1, param2);

        // Output
        System.out.println(formatOutput(result));

        sc.close();
    }
}
\`\`\`

### C++ Example Structure:
\`\`\`cpp
#include <iostream>
#include <vector>
using namespace std;

ResultType solveProblem(ParamType1 param1, ParamType2 param2) {
    // Core logic
    return result;
}

string formatOutput(ResultType result) {
    return to_string(result);
}

int main() {
    // Read input
    ParamType1 param1;
    cin >> param1;

    // Solve
    ResultType result = solveProblem(param1, param2);

    // Output
    cout << formatOutput(result) << endl;

    return 0;
}
\`\`\`

### C Example Structure:
\`\`\`c
#include <stdio.h>
#include <stdlib.h>

ResultType solveProblem(ParamType1 param1, ParamType2 param2) {
    // Core logic
    return result;
}

void formatOutput(ResultType result) {
    printf("%d\\n", result);  // Adjust format specifier as needed
}

int main() {
    // Read input
    ParamType1 param1;
    scanf("%d", &param1);

    // Solve
    ResultType result = solveProblem(param1, param2);

    // Output
    formatOutput(result);

    return 0;
}
\`\`\`

---

## LANGUAGE-SPECIFIC I/O REQUIREMENTS
- **Python**: Use input() for reading, print() for output
- **JavaScript**: Use fs.readFileSync(0, 'utf8') for stdin, console.log() for output
- **Java**: Use Scanner for input, System.out.println() for output
- **C++**: Use cin for input, cout for output
- **C**: Use scanf for input, printf for output

**Ensure I/O format EXACTLY matches test case examples**

---

## TEST CASE FORMAT (CRITICAL)

✅ **Correct stdin/stdout format:**
\`\`\`json
{
  "input": "5\\n1 2 3 4 5",
  "expectedOutput": "15"
}
\`\`\`

❌ **Incorrect format (DO NOT USE):**
\`\`\`json
{
  "input": "Input: 5 1 2 3 4 5",
  "expectedOutput": "The answer is 15"
}
\`\`\`

❌ **Variable assignment format (DO NOT USE):**
\`\`\`json
{
  "input": "nums = [1,2,3,4,5]",
  "expectedOutput": "[15]"
}
\`\`\`

---

## INPUT/OUTPUT FORMAT SECTIONS

The \`inputFormat\` and \`outputFormat\` fields must be descriptive and include code blocks:

**Example inputFormat:**
\`\`\`
The first line contains an integer n.
The second line contains n space-separated integers.

\`\`\`
n
a1 a2 a3 ... an
\`\`\`
\`\`\`

**Example outputFormat:**
\`\`\`
Print a single integer representing the sum of all elements.
\`\`\`

- Use **triple backticks (\\\`\\\`\\\`)** for code blocks
- Use **bullet points starting with "- "** for lists
- Keep consistent spacing and line breaks

---

## ORIGINAL DOCUMENT TO FIX
${JSON.stringify(document, null, 2)}

---

## OUTPUT INSTRUCTIONS

Return **ONLY** the corrected JSON object following the schema above.

**Requirements:**
1. Include ALL fields from the schema
2. Fix ALL validation errors listed at the top
3. Generate COMPLETE solutions for all 5 languages with main+helper+formatter structure
4. Use proper stdin/stdout format for all test cases
5. Ensure difficulty is exactly "Easy", "Medium", or "Hard"
6. Ensure slug is lowercase-with-hyphens
7. Include inputFormat and outputFormat with code blocks (triple backticks)
8. **PRESERVE** _id: "${document._id}"
9. **PRESERVE** question_id: "${document.question_id || document._id}"

**CRITICAL**: Your response must be PURE JSON only - no markdown code blocks, no explanations, no extra text. Start with { and end with }.`;
}

/**
 * Parse AI response (same as before)
 */
export function parseComprehensiveAIResponse(response: string): CodingQuestion {
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
