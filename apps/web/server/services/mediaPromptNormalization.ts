const MARKDOWN_FENCED_BLOCK_PATTERN = /^\s*```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```\s*$/;
const MARKDOWN_FENCED_BLOCK_GLOBAL_PATTERN = /```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```/g;
const MARKDOWN_FENCE_LINE_PATTERN = /^\s*```[a-zA-Z0-9_-]*\s*$/gm;
const LEADING_JSON_LABEL_PATTERN = /^json\s*\n([\s\S]*)$/i;

export function normalizeMediaPrompt(prompt: unknown): string {
  if (typeof prompt !== "string") {
    if (prompt === null || prompt === undefined) {
      return "";
    }
    return String(prompt).trim();
  }

  let normalized = prompt.replace(/\r\n/g, "\n").trim();
  // Unwrap markdown fenced blocks such as ```json ... ``` to keep plain text/JSON only.
  for (let i = 0; i < 2; i += 1) {
    const match = normalized.match(MARKDOWN_FENCED_BLOCK_PATTERN);
    if (!match) {
      break;
    }
    normalized = (match[1] ?? "").trim();
  }

  // If fenced blocks were embedded with extra text, unwrap each block in-place.
  normalized = normalized.replace(MARKDOWN_FENCED_BLOCK_GLOBAL_PATTERN, (_block, inner: string) => inner.trim());
  // Remove leftover fence-only lines from malformed outputs.
  normalized = normalized.replace(MARKDOWN_FENCE_LINE_PATTERN, "").trim();

  // Handle malformed outputs like "json\\n{...}" after fence removal.
  const jsonLabelMatch = normalized.match(LEADING_JSON_LABEL_PATTERN);
  if (jsonLabelMatch) {
    const candidate = (jsonLabelMatch[1] ?? "").trim();
    if (candidate.startsWith("{") || candidate.startsWith("[")) {
      normalized = candidate;
    }
  }

  return normalized;
}
