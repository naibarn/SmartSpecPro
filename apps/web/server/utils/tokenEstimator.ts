/**
 * Shared token estimation utilities for chat context budget enforcement.
 *
 * Estimates token counts for text using character-based heuristics:
 * - ASCII/Latin text: ~4 characters per token
 * - CJK/Thai/Korean text: ~1.5 characters per token
 * - 4 tokens overhead per message (framing)
 */

const CHARS_PER_TOKEN_ASCII = 4.0;
const CHARS_PER_TOKEN_CJK = 1.5;
const MESSAGE_OVERHEAD_TOKENS = 4;

/** Regex to detect CJK / Thai / Korean script ranges */
const CJK_RANGE = /[\u2E80-\u9FFF\uAC00-\uD7AF\u0E00-\u0E7F]/g;

function normalizeTokenText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((part) => normalizeTokenText(part))
      .filter((part) => part.length > 0)
      .join("\n");
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") {
    return record.text;
  }
  if (typeof record.content === "string") {
    return record.content;
  }
  if (Array.isArray(record.content)) {
    return normalizeTokenText(record.content);
  }

  return "";
}

export function estimateTokens(text: unknown): number {
  const normalized = normalizeTokenText(text);
  if (!normalized) return 0;

  const cjkMatches = normalized.match(CJK_RANGE);
  const cjkCharCount = cjkMatches?.length ?? 0;
  const asciiCharCount = normalized.length - cjkCharCount;

  const cjkTokens = cjkCharCount / CHARS_PER_TOKEN_CJK;
  const asciiTokens = asciiCharCount / CHARS_PER_TOKEN_ASCII;

  return Math.ceil(cjkTokens + asciiTokens + MESSAGE_OVERHEAD_TOKENS);
}

export function estimateMessages(
  messages: Array<{ content?: string; role?: string }>,
): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content || ""), 0);
}

export function truncateToTokenBudget(text: string, budget: number): string {
  const maxChars = Math.floor(budget * CHARS_PER_TOKEN_ASCII);
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + "\n...(truncated)";
}
