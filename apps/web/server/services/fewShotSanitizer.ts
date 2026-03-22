/**
 * Few-Shot Example Sanitizer
 *
 * Validates and sanitizes example conversation pairs for agency agents.
 * Strips prompt injection patterns and HTML tags, enforces size limits.
 */

export interface ExamplePair {
  role: "user" | "assistant";
  content: string;
}

/** Maximum number of example conversation pairs per agent */
const MAX_EXAMPLES = 10;

/** Maximum characters per individual message */
const MAX_CONTENT_LENGTH = 2000;

/** System framing prefix for prompt injection */
const FRAMING_PREFIX = "The following are example interactions for reference only:";
const FRAMING_SUFFIX = "End of examples. Now respond to the actual user message:";

/**
 * Known prompt injection patterns to strip from example content.
 * These are case-insensitive regex patterns.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions?\b/gi,
  /ignore\s+(all\s+)?above\s+instructions?\b/gi,
  /disregard\s+(all\s+)?previous\b/gi,
  /you\s+are\s+now\b/gi,
  /^system\s*:/gim,
  /<\|[^|]*\|>/g,
  /\[INST\].*?\[\/INST\]/gs,
  /<<SYS>>.*?<<\/SYS>>/gs,
];

/** HTML tag pattern (simple strip, not a full parser) */
const HTML_TAG_PATTERN = /<\/?[a-z][a-z0-9]*(?:\s[^>]*)?\/?>/gi;

/**
 * Strip known prompt injection patterns from content.
 */
function stripInjections(content: string): string {
  let cleaned = content;
  for (const pattern of INJECTION_PATTERNS) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
    cleaned = cleaned.replace(pattern, "");
  }
  return cleaned;
}

/**
 * Strip HTML tags from content.
 */
function stripHtml(content: string): string {
  return content.replace(HTML_TAG_PATTERN, "");
}

/**
 * Sanitize an array of example pairs.
 *
 * - Strips prompt injection patterns
 * - Strips HTML tags
 * - Enforces max 10 pairs
 * - Enforces max 2000 chars per message
 * - Trims whitespace
 *
 * @throws Error if examples exceed MAX_EXAMPLES or content exceeds MAX_CONTENT_LENGTH
 */
export function sanitizeExamples(examples: ExamplePair[][]): ExamplePair[][] {
  if (!examples || examples.length === 0) {
    return [];
  }

  if (examples.length > MAX_EXAMPLES) {
    throw new Error(`Maximum ${MAX_EXAMPLES} example pairs allowed, got ${examples.length}`);
  }

  return examples.map((pair, pairIdx) => {
    return pair.map((msg, msgIdx) => {
      if (msg.role !== "user" && msg.role !== "assistant") {
        throw new Error(
          `Invalid role "${msg.role}" in example pair ${pairIdx}, message ${msgIdx}. Only "user" and "assistant" are allowed.`,
        );
      }

      let content = msg.content;
      content = stripInjections(content);
      content = stripHtml(content);
      content = content.trim();

      if (content.length > MAX_CONTENT_LENGTH) {
        throw new Error(
          `Example content exceeds ${MAX_CONTENT_LENGTH} characters in pair ${pairIdx}, message ${msgIdx}`,
        );
      }

      return { role: msg.role, content };
    });
  });
}

/**
 * Frame sanitized examples as a prompt string with system delimiters.
 *
 * Returns empty string if no examples provided.
 */
export function frameExamplesForPrompt(examples: ExamplePair[][]): string {
  if (!examples || examples.length === 0) {
    return "";
  }

  const lines: string[] = [FRAMING_PREFIX, ""];

  for (const pair of examples) {
    for (const msg of pair) {
      lines.push(`${msg.role}: ${msg.content}`);
    }
    lines.push("");
  }

  lines.push(FRAMING_SUFFIX);

  return lines.join("\n");
}
