/**
 * Telegram Message Rendering
 *
 * Converts markdown/plain text to Telegram-safe HTML format.
 * Splits long messages at the 4096-character Telegram limit.
 *
 * Telegram supports: <b>, <i>, <u>, <s>, <code>, <pre>, <a>, <tg-spoiler>
 * All other HTML is stripped or causes errors.
 */

const TELEGRAM_MAX_LENGTH = 4096;
const CODE_BLOCK_MAX_LENGTH = 2000;

/** Escape HTML special characters in text. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Convert markdown formatting to Telegram HTML.
 * Uses regex-based conversion (no full parser needed for LLM output).
 */
function markdownToTelegramHtml(content: string): string {
  // 1. Extract code blocks to protect them from other transformations
  const codeBlocks: string[] = [];
  let processed = content.replace(
    /```(?:\w*)\n?([\s\S]*?)```/g,
    (_match, code: string) => {
      let trimmed = code.trim();
      if (trimmed.length > CODE_BLOCK_MAX_LENGTH) {
        trimmed = trimmed.slice(0, CODE_BLOCK_MAX_LENGTH) + "\n... (truncated)";
      }
      const idx = codeBlocks.length;
      codeBlocks.push(`<pre>${escapeHtml(trimmed)}</pre>`);
      return `\x00CODEBLOCK_${idx}\x00`;
    },
  );

  // 2. Strip unsupported markdown elements

  // Remove footnote definitions: [^1]: ...
  processed = processed.replace(/^\[\^\d+\]:\s*.+$/gm, "");
  // Remove footnote references: [^1]
  processed = processed.replace(/\[\^\d+\]/g, "");

  // Remove horizontal rules
  processed = processed.replace(/^[-*]{3,}\s*$/gm, "");

  // Convert images to text: ![alt](url) → [Image: alt]
  processed = processed.replace(
    /!\[([^\]]*)\]\([^)]+\)/g,
    (_m, alt: string) => (alt ? `[Image: ${alt}]` : ""),
  );

  // Convert tables: strip separator rows, convert data rows to plain text
  processed = processed.replace(/^\|[-:\s|]+\|$/gm, ""); // Remove separator rows
  processed = processed.replace(/^\|(.+)\|$/gm, (_m, row: string) => {
    return row
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean)
      .join(" | ");
  });

  // Convert headers: strip # prefix, store as placeholders (protect from escaping)
  const headerBlocks: string[] = [];
  processed = processed.replace(/^#{1,6}\s+(.+)$/gm, (_m, text: string) => {
    const idx = headerBlocks.length;
    headerBlocks.push(text);
    return `\x00HEADER_${idx}\x00`;
  });

  // 3. Escape HTML in non-code text (but not our placeholders)
  processed = processed.replace(
    /(?:\x00(?:CODEBLOCK|HEADER)_\d+\x00)|[^]+?(?=\x00(?:CODEBLOCK|HEADER)_\d+\x00|$)/g,
    (segment) => {
      if (segment.startsWith("\x00")) return segment;
      return escapeHtml(segment);
    },
  );

  // Re-insert headers as bold HTML
  processed = processed.replace(
    /\x00HEADER_(\d+)\x00/g,
    (_m, idx: string) => `<b>${escapeHtml(headerBlocks[parseInt(idx, 10)])}</b>`,
  );

  // 4. Convert inline formatting

  // Inline code: `code` → <code>code</code> (must be before bold/italic)
  processed = processed.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold: **text** or __text__
  processed = processed.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  processed = processed.replace(/__(.+?)__/g, "<b>$1</b>");

  // Italic: *text* or _text_ (not inside words)
  processed = processed.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, "<i>$1</i>");
  processed = processed.replace(/(?<!\w)_([^_]+?)_(?!\w)/g, "<i>$1</i>");

  // 5. Convert links: [text](url) → <a href="url">text</a>
  processed = processed.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>',
  );

  // 6. Re-insert processed code blocks
  processed = processed.replace(
    /\x00CODEBLOCK_(\d+)\x00/g,
    (_m, idx: string) => codeBlocks[parseInt(idx, 10)],
  );

  return processed.trim();
}

/**
 * Split a rendered HTML string into chunks of <= 4096 chars.
 * Splits at paragraph boundaries first, then sentence boundaries.
 */
function splitMessage(html: string, webUrl?: string): string[] {
  if (html.length <= TELEGRAM_MAX_LENGTH) return [html];

  const paragraphs = html.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length === 0) {
      if (para.length > TELEGRAM_MAX_LENGTH) {
        // Single paragraph exceeds limit — split at sentence boundaries
        chunks.push(...splitLongParagraph(para));
      } else {
        current = para;
      }
    } else if (current.length + 2 + para.length <= TELEGRAM_MAX_LENGTH) {
      current += "\n\n" + para;
    } else {
      chunks.push(current);
      if (para.length > TELEGRAM_MAX_LENGTH) {
        chunks.push(...splitLongParagraph(para));
        current = "";
      } else {
        current = para;
      }
    }
  }

  if (current) {
    chunks.push(current);
  }

  // Add chunk numbering and web URL
  if (chunks.length > 1) {
    const total = chunks.length;
    for (let i = 1; i < total; i++) {
      chunks[i] = `[${i + 1}/${total}] ${chunks[i]}`;
    }
    if (webUrl) {
      chunks[total - 1] += `\n\n<a href="${webUrl}">View full message in web app</a>`;
    }
  }

  return chunks;
}

/** Split a single paragraph that exceeds 4096 chars. */
function splitLongParagraph(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > TELEGRAM_MAX_LENGTH) {
    // Try to split at sentence boundary (. followed by space)
    let splitAt = -1;
    const searchEnd = Math.min(remaining.length, TELEGRAM_MAX_LENGTH);
    const searchRegion = remaining.slice(0, searchEnd);

    // Find last sentence boundary
    const sentenceEnd = searchRegion.lastIndexOf(". ");
    if (sentenceEnd > TELEGRAM_MAX_LENGTH * 0.3) {
      splitAt = sentenceEnd + 1; // Include the period
    }

    // Try newline boundary
    if (splitAt === -1) {
      const nlEnd = searchRegion.lastIndexOf("\n");
      if (nlEnd > TELEGRAM_MAX_LENGTH * 0.3) {
        splitAt = nlEnd;
      }
    }

    // Hard split as last resort
    if (splitAt === -1) {
      splitAt = TELEGRAM_MAX_LENGTH;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * Converts markdown/plain text message content to Telegram-safe HTML.
 * Returns an array of strings, each <= 4096 characters (Telegram's limit).
 *
 * @param content - Raw message content (may contain markdown)
 * @param webUrl - Optional URL for "view full message" link when content is truncated
 * @returns Array of HTML-formatted strings ready for Telegram's parse_mode=HTML
 */
export function renderForTelegram(content: string, webUrl?: string): string[] {
  if (!content) return [""];
  const html = markdownToTelegramHtml(content);
  return splitMessage(html, webUrl);
}
