/**
 * OpenAI service for natural language to command translation
 * 
 * This service calls the python-backend LLM proxy instead of calling
 * OpenAI directly. This ensures:
 * - Authentication is enforced
 * - Credits are tracked and deducted
 * - Rate limiting is applied
 * - No API keys are exposed in the desktop app
 */

import { chatCompletions } from "./llmOpenAI";

interface TranslationResult {
  command: string;
  workflow: string;
  args: Record<string, any>;
  confidence: number;
}

const SYSTEM_PROMPT = `You are a command translator for SmartSpec Pro, a workflow automation tool.

Your task is to translate natural language requests into structured workflow commands.

Available workflows:
- generate_spec: Generate specification documents
- validate_spec: Validate existing specifications
- analyze_requirements: Analyze requirements
- create_test_cases: Create test cases from specs

Response format (JSON only):
{
  "workflow": "workflow_name",
  "args": {
    "arg1": "value1",
    "arg2": "value2"
  },
  "confidence": 0.0-1.0
}

Examples:

User: "Generate a spec for user authentication"
Response:
{
  "workflow": "generate_spec",
  "args": {
    "topic": "user authentication",
    "format": "markdown"
  },
  "confidence": 0.95
}

User: "Validate the API spec in specs/api.yaml"
Response:
{
  "workflow": "validate_spec",
  "args": {
    "spec_path": "specs/api.yaml"
  },
  "confidence": 0.98
}

Rules:
1. Always respond with valid JSON
2. Use confidence 0.7+ for clear requests
3. Use confidence < 0.7 for ambiguous requests
4. Include all necessary arguments
5. Use reasonable defaults when needed`;

/**
 * Translate natural language to workflow command using LLM
 * 
 * Calls python-backend which handles:
 * - Authentication
 * - Credit deduction
 * - Rate limiting
 * - LLM provider routing
 */
export async function translateToCommand(
  naturalLanguage: string
): Promise<TranslationResult> {
  try {
    const response = await chatCompletions({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: naturalLanguage }
      ],
      temperature: 0.3,
      max_tokens: 200
    });

    const content = response.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("No response from LLM");
    }

    // Parse JSON response
    const result = JSON.parse(content);

    return {
      command: formatCommand(result.workflow, result.args),
      workflow: result.workflow,
      args: result.args,
      confidence: result.confidence
    };
  } catch (error) {
    console.error("Translation error:", error);
    
    // Fallback to local parsing for basic commands
    return fallbackTranslation(naturalLanguage);
  }
}

/**
 * Format workflow and args into command string
 */
function formatCommand(workflow: string, args: Record<string, any>): string {
  const argStr = Object.entries(args)
    .map(([key, value]) => `--${key} "${value}"`)
    .join(" ");
  return `${workflow} ${argStr}`;
}

/**
 * Fallback translation when LLM is unavailable
 * Uses simple pattern matching for basic commands
 */
function fallbackTranslation(input: string): TranslationResult {
  const lower = input.toLowerCase();
  
  // Generate spec
  if (lower.includes("generate") || lower.includes("create spec")) {
    const topic = extractTopic(input);
    return {
      command: `generate_spec --topic "${topic}" --format markdown`,
      workflow: "generate_spec",
      args: {
        topic,
        format: "markdown"
      },
      confidence: 0.6 // Lower confidence for fallback
    };
  }
  
  // Validate spec
  if (lower.includes("validate")) {
    const path = extractPath(input) || "spec.yaml";
    return {
      command: `validate_spec --spec-path "${path}"`,
      workflow: "validate_spec",
      args: {
        spec_path: path
      },
      confidence: 0.6
    };
  }
  
  // Analyze requirements
  if (lower.includes("analyze") || lower.includes("requirements")) {
    const source = extractPath(input) || "requirements.txt";
    return {
      command: `analyze_requirements --source "${source}"`,
      workflow: "analyze_requirements",
      args: {
        source
      },
      confidence: 0.6
    };
  }
  
  // Create test cases
  if (lower.includes("test") || lower.includes("test case")) {
    const spec = extractPath(input) || "spec.yaml";
    return {
      command: `create_test_cases --spec "${spec}"`,
      workflow: "create_test_cases",
      args: {
        spec
      },
      confidence: 0.6
    };
  }
  
  // Default fallback
  return {
    command: `generate_spec --topic "${input}" --format markdown`,
    workflow: "generate_spec",
    args: {
      topic: input,
      format: "markdown"
    },
    confidence: 0.3
  };
}

/**
 * Extract topic from natural language
 */
function extractTopic(input: string): string {
  // Remove common words
  const cleaned = input
    .toLowerCase()
    .replace(/generate|create|spec|for|a|an|the/g, "")
    .trim();
  
  return cleaned || "general specification";
}

/**
 * Extract file path from natural language
 */
function extractPath(input: string): string | null {
  // Look for file paths (e.g., "specs/api.yaml", "requirements.txt")
  const pathMatch = input.match(/[\w\-./]+\.(yaml|yml|txt|md|json)/i);
  if (pathMatch) {
    return pathMatch[0];
  }
  
  // Look for quoted strings
  const quotedMatch = input.match(/"([^"]+)"|'([^']+)'/);
  if (quotedMatch) {
    return quotedMatch[1] || quotedMatch[2];
  }
  
  return null;
}
