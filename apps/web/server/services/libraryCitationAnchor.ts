import { createHash } from "node:crypto";

export interface LibraryCitationAnchor {
  documentId: number;
  revision: string;
  digest: string;
  lineStart: number;
  lineEnd: number;
  quoteHash: string;
}

export function normalizeCanonicalMarkdown(markdown: string): string {
  return markdown.replace(/\r\n?/g, "\n");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function canonicalMarkdownRevision(digest: string): string {
  return `sha256:${digest}`;
}

function queryTerms(query: string): string[] {
  return [...new Set(
    (query.normalize("NFC").toLocaleLowerCase().match(/[\p{L}\p{N}_./:-]+/gu) ?? [])
      .filter(term => term.length > 1),
  )];
}

export function createLibraryCitationAnchor(params: {
  documentId: number;
  query: string;
  markdown: string;
  digest?: string;
}): LibraryCitationAnchor | null {
  const markdown = normalizeCanonicalMarkdown(params.markdown);
  const lines = markdown.split("\n");
  if (params.digest && sha256(markdown) !== params.digest) return null;
  const terms = queryTerms(params.query);
  if (terms.length === 0 || lines.length === 0) return null;

  let best: { start: number; end: number; matched: number } | null = null;
  for (let start = 0; start < lines.length; start += 1) {
    const window = lines.slice(start, Math.min(lines.length, start + 5))
      .join("\n")
      .normalize("NFC")
      .toLocaleLowerCase();
    const matched = terms.filter(term => window.includes(term)).length;
    if (!best || matched > best.matched) {
      best = { start, end: Math.min(lines.length, start + 5), matched };
    }
  }

  if (!best || best.matched < Math.max(1, Math.ceil(terms.length * 0.6))) {
    return null;
  }

  // Trim the candidate window to its first and last lines containing a query term.
  const matchingLines = lines
    .slice(best.start, best.end)
    .map((line, offset) => ({ line: line.normalize("NFC").toLocaleLowerCase(), index: best!.start + offset }))
    .filter(candidate => terms.some(term => candidate.line.includes(term)));
  if (matchingLines.length === 0) return null;
  const lineStart = matchingLines[0].index + 1;
  const lineEnd = matchingLines[matchingLines.length - 1].index + 1;
  const quote = lines.slice(lineStart - 1, lineEnd).join("\n");
  const digest = params.digest ?? sha256(markdown);

  return {
    documentId: params.documentId,
    revision: canonicalMarkdownRevision(digest),
    digest,
    lineStart,
    lineEnd,
    quoteHash: sha256(quote),
  };
}

export function encodeLibraryCitationAnchor(anchor: LibraryCitationAnchor): string {
  return Buffer.from(JSON.stringify({ v: 1, ...anchor }), "utf8").toString("base64url");
}

export function buildLibraryCitationAnchorUri(anchor: LibraryCitationAnchor): string {
  const params = new URLSearchParams({
    scope: "my_library",
    sort: "updated_desc",
    mode: "editor",
    doc: String(anchor.documentId),
    cite: encodeLibraryCitationAnchor(anchor),
  });
  return `/document-management?${params.toString()}`;
}

export function verifyLibraryCitationAnchor(
  anchor: LibraryCitationAnchor,
  canonicalMarkdown: string,
): boolean {
  if (
    !Number.isInteger(anchor.documentId) || anchor.documentId <= 0 ||
    !/^[a-f0-9]{64}$/.test(anchor.digest) ||
    anchor.revision !== canonicalMarkdownRevision(anchor.digest) ||
    !Number.isInteger(anchor.lineStart) || !Number.isInteger(anchor.lineEnd) ||
    anchor.lineStart < 1 || anchor.lineEnd < anchor.lineStart ||
    !/^[a-f0-9]{64}$/.test(anchor.quoteHash)
  ) return false;

  const markdown = normalizeCanonicalMarkdown(canonicalMarkdown);
  if (sha256(markdown) !== anchor.digest) return false;
  const lines = markdown.split("\n");
  if (anchor.lineEnd > lines.length) return false;
  const quote = lines.slice(anchor.lineStart - 1, anchor.lineEnd).join("\n");
  return sha256(quote) === anchor.quoteHash;
}
