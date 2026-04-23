function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/u, "");
}

function stripCodeFences(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, " ");
}

function stripInlineMarkdown(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUniqueValues(
  values: Array<string | null | undefined>
): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) {
      continue;
    }

    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    next.push(normalized);
  }

  return next;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMatchSnippet(
  text: string,
  query?: string | null
): string | null {
  const tokens = normalizeUniqueValues(
    (query ?? "")
      .match(/[A-Za-z0-9/_-]+/g)
      ?.filter(token => token.length >= 2) ?? []
  );

  if (!text || tokens.length === 0) {
    return null;
  }

  const lowered = text.toLowerCase();
  let matchedIndex = -1;
  let matchedToken = "";

  for (const token of tokens) {
    const index = lowered.indexOf(token.toLowerCase());
    if (index !== -1 && (matchedIndex === -1 || index < matchedIndex)) {
      matchedIndex = index;
      matchedToken = token;
    }
  }

  if (matchedIndex === -1) {
    return null;
  }

  const start = Math.max(0, matchedIndex - 80);
  const end = Math.min(
    text.length,
    matchedIndex + Math.max(matchedToken.length, 24) + 80
  );

  return `${start > 0 ? "... " : ""}${text.slice(start, end).trim()}${
    end < text.length ? " ..." : ""
  }`;
}

export function extractKnowledgePreview(markdown: string): {
  summary: string | null;
  headings: string[];
  matchedSnippet: string | null;
} {
  return extractKnowledgePreviewWithQuery(markdown);
}

export function extractKnowledgePreviewWithQuery(
  markdown: string,
  options?: { query?: string | null }
): {
  summary: string | null;
  headings: string[];
  matchedSnippet: string | null;
} {
  const normalized = stripFrontmatter(stripCodeFences(markdown ?? ""));
  const headings = Array.from(normalized.matchAll(/^#{1,6}\s+(.+)$/gm), match =>
    stripInlineMarkdown(match[1] ?? "")
  )
    .filter(Boolean)
    .slice(0, 4);

  const paragraphBlocks = normalized
    .split(/\n\s*\n/g)
    .map(block => block.trim())
    .filter(Boolean);
  const summaryBlock = paragraphBlocks.find(block => {
    if (/^#{1,6}\s/.test(block)) {
      return false;
    }

    const cleaned = stripInlineMarkdown(block);
    return (
      cleaned.length >= 24 &&
      !cleaned.startsWith("aliases ") &&
      !cleaned.startsWith("tags ")
    );
  });
  const summary = summaryBlock
    ? stripInlineMarkdown(summaryBlock)
    : (headings[0] ?? null);
  const cleanedText = stripInlineMarkdown(normalized);
  const matchedSnippet = extractMatchSnippet(cleanedText, options?.query);

  return {
    summary: summary ? summary.slice(0, 220) : null,
    headings,
    matchedSnippet,
  };
}

export function getKnowledgeHighlightSegments(
  text: string,
  query?: string | null
): Array<{ text: string; highlighted: boolean }> {
  if (!text) {
    return [];
  }

  const tokens = normalizeUniqueValues(
    (query ?? "")
      .match(/[A-Za-z0-9/_-]+/g)
      ?.filter(token => token.length >= 2) ?? []
  );

  if (tokens.length === 0) {
    return [{ text, highlighted: false }];
  }

  const pattern = new RegExp(`(${tokens.map(escapeRegex).join("|")})`, "giu");
  return text
    .split(pattern)
    .filter(Boolean)
    .map(segment => ({
      text: segment,
      highlighted: tokens.some(
        token => token.toLowerCase() === segment.toLowerCase()
      ),
    }));
}

export { stripFrontmatter };
