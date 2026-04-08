import AdmZip from "adm-zip";
import { marked } from "marked";
import { getAppRuntimeConfig } from "./appRuntimeConfig";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOCX_MAIN_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const PDF_MIME_TYPE = "application/pdf";

type MarkdownBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "list-item"; text: string; ordered: boolean; index: number }
  | { kind: "code"; text: string }
  | { kind: "rule" }
  | { kind: "table"; rows: string[] };

export type MarkdownExportFormat = "html" | "txt" | "docx" | "pdf";

export interface MarkdownExportArtifact {
  fileName: string;
  mimeType: string;
  dataBase64: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "") || "document";
}

function stripKnownExtension(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*?)(?:\.[^.]+)?$/);
  return sanitizeFilenamePart(match?.[1] || trimmed || "document");
}

export function getMarkdownExportFileName(title: string | undefined, extension: string): string {
  const base = stripKnownExtension(title || "document");
  return `${base}.${extension}`;
}

function renderInlineText(tokens: unknown): string {
  if (!Array.isArray(tokens)) {
    return "";
  }

  let result = "";

  for (const token of tokens as Array<Record<string, unknown>>) {
    const type = String(token?.type || "");

    if (type === "text" || type === "codespan" || type === "escape") {
      result += String(token.text || token.raw || "");
      continue;
    }

    if (type === "br") {
      result += "\n";
      continue;
    }

    if (type === "link") {
      const text = renderInlineText(token.tokens) || String(token.text || "");
      const href = String(token.href || "").trim();
      if (href && text && href !== text) {
        result += `${text} (${href})`;
      } else {
        result += text || href;
      }
      continue;
    }

    if (type === "image") {
      result += String(token.text || token.alt || "image");
      continue;
    }

    if (type === "html") {
      result += String(token.raw || token.text || "").replace(/<[^>]+>/g, "");
      continue;
    }

    if (Array.isArray(token.tokens)) {
      result += renderInlineText(token.tokens);
      continue;
    }

    if (typeof token.text === "string") {
      result += token.text;
      continue;
    }

    if (typeof token.raw === "string") {
      result += token.raw;
    }
  }

  return result.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ");
}

function collectBlocks(tokens: unknown): MarkdownBlock[] {
  if (!Array.isArray(tokens)) {
    return [];
  }

  const blocks: MarkdownBlock[] = [];

  for (const token of tokens as Array<Record<string, unknown>>) {
    const type = String(token?.type || "");

    if (!type || type === "space" || type === "def") {
      continue;
    }

    if (type === "heading") {
      blocks.push({
        kind: "heading",
        level: Number(token.depth || 1),
        text: renderInlineText(token.tokens) || String(token.text || ""),
      });
      continue;
    }

    if (type === "paragraph") {
      const text = renderInlineText(token.tokens) || String(token.text || "");
      if (text.trim()) {
        blocks.push({ kind: "paragraph", text: text.trim() });
      }
      continue;
    }

    if (type === "blockquote") {
      const text = renderInlineText(token.tokens) || String(token.text || "");
      if (text.trim()) {
        blocks.push({ kind: "quote", text: text.trim() });
      }
      continue;
    }

    if (type === "code") {
      const text = String(token.text || "");
      if (text.trim() || text === "") {
        blocks.push({ kind: "code", text });
      }
      continue;
    }

    if (type === "list") {
      const ordered = Boolean(token.ordered);
      const start = Number(token.start || 1) || 1;
      const items = Array.isArray(token.items) ? token.items : [];

      items.forEach((item: any, index: number) => {
        const text = renderInlineText(item?.tokens) || String(item?.text || "");
        if (text.trim()) {
          blocks.push({
            kind: "list-item",
            text: text.trim(),
            ordered,
            index: start + index,
          });
        }
      });
      continue;
    }

    if (type === "table") {
      const rows: string[] = [];
      const header = Array.isArray(token.header) ? token.header : [];
      const bodyRows = Array.isArray(token.rows) ? token.rows : [];

      const headerText = header
        .map((cell: any) => renderInlineText(cell?.tokens) || String(cell?.text || ""))
        .map((text) => text.trim())
        .filter(Boolean)
        .join(" | ");
      if (headerText) {
        rows.push(headerText);
      }

      for (const row of bodyRows as any[]) {
        const rowText = Array.isArray(row)
          ? row
              .map((cell: any) => renderInlineText(cell?.tokens) || String(cell?.text || ""))
              .map((text) => text.trim())
              .filter(Boolean)
              .join(" | ")
          : "";
        if (rowText) {
          rows.push(rowText);
        }
      }

      if (rows.length > 0) {
        blocks.push({ kind: "table", rows });
      }
      continue;
    }

    if (type === "hr") {
      blocks.push({ kind: "rule" });
      continue;
    }

    if (Array.isArray(token.tokens)) {
      blocks.push(...collectBlocks(token.tokens));
      continue;
    }

    const text = renderInlineText(token.tokens) || String(token.text || token.raw || "");
    if (text.trim()) {
      blocks.push({ kind: "paragraph", text: text.trim() });
    }
  }

  return blocks;
}

function extractMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const tokens = marked.lexer(markdown, { gfm: true });
  return collectBlocks(tokens);
}

export function buildMarkdownHtmlDocument(markdown: string): string {
  const rendered = marked.parse(markdown, { async: false }) as string;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Markdown Export</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #0f172a;
      background: #f8fafc;
      line-height: 1.7;
    }
    main {
      max-width: 840px;
      margin: 0 auto;
      padding: 40px 24px 56px;
      background: white;
      min-height: 100vh;
      box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.12);
    }
    h1, h2, h3, h4, h5, h6 { line-height: 1.2; margin: 1.25em 0 0.6em; }
    p, ul, ol, blockquote, pre, table { margin: 0 0 1rem; }
    pre {
      overflow: auto;
      padding: 1rem;
      border-radius: 0.75rem;
      background: #0f172a;
      color: #e2e8f0;
    }
    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.95em;
    }
    pre code { color: inherit; }
    blockquote {
      padding: 0.75rem 1rem;
      border-left: 4px solid #cbd5e1;
      background: #f8fafc;
      color: #334155;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 0.5rem 0.65rem;
      text-align: left;
      vertical-align: top;
    }
    img { max-width: 100%; height: auto; }
    a { color: #0369a1; }
  </style>
</head>
<body>
  <main>
    ${rendered}
  </main>
</body>
</html>`;
}

function renderDocxParagraph(block: MarkdownBlock): string {
  if (block.kind === "rule") {
    return `<w:p><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">---</w:t></w:r></w:p>`;
  }

  if (block.kind === "code") {
    return block.text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => `<w:p><w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${escapeXml(line.length > 0 ? line : " ")}</w:t></w:r></w:p>`)
      .join("");
  }

  if (block.kind === "heading") {
    const sizeMap: Record<number, number> = { 1: 32, 2: 28, 3: 26, 4: 24, 5: 22, 6: 20 };
    return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="${sizeMap[block.level] || 24}"/><w:szCs w:val="${sizeMap[block.level] || 24}"/></w:rPr><w:t xml:space="preserve">${escapeXml(block.text)}</w:t></w:r></w:p>`;
  }

  if (block.kind === "quote") {
    return `<w:p><w:pPr><w:ind w:left="720"/><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(`> ${block.text}`)}</w:t></w:r></w:p>`;
  }

  if (block.kind === "list-item") {
    const prefix = block.ordered ? `${block.index}. ` : "- ";
    return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(prefix + block.text)}</w:t></w:r></w:p>`;
  }

  if (block.kind === "table") {
    return block.rows
      .map((row) => `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(row)}</w:t></w:r></w:p>`)
      .join("");
  }

  return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(block.text)}</w:t></w:r></w:p>`;
}

export function buildMarkdownDocxDocumentXml(markdown: string): string {
  const blocks = extractMarkdownBlocks(markdown);
  const body = blocks.map((block) => renderDocxParagraph(block)).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function buildMarkdownDocxPackage(markdown: string): Buffer {
  const documentXml = buildMarkdownDocxDocumentXml(markdown);
  const zip = new AdmZip();
  zip.addFile(
    "[Content_Types].xml",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="${DOCX_MAIN_CONTENT_TYPE}"/>
</Types>`, "utf8"),
  );
  zip.addFile(
    "_rels/.rels",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`, "utf8"),
  );
  zip.addFile("word/document.xml", Buffer.from(documentXml, "utf8"));
  return zip.toBuffer();
}

export function buildMarkdownPlainText(markdown: string): string {
  const blocks = extractMarkdownBlocks(markdown);
  const lines: string[] = [];

  for (const block of blocks) {
    if (block.kind === "heading") {
      lines.push(`${"#".repeat(Math.max(block.level, 1))} ${block.text}`);
      lines.push("");
      continue;
    }
    if (block.kind === "quote") {
      lines.push(`> ${block.text}`);
      lines.push("");
      continue;
    }
    if (block.kind === "list-item") {
      const prefix = block.ordered ? `${block.index}. ` : "- ";
      lines.push(`${prefix}${block.text}`);
      lines.push("");
      continue;
    }
    if (block.kind === "code") {
      lines.push("```");
      lines.push(block.text);
      lines.push("```");
      lines.push("");
      continue;
    }
    if (block.kind === "table") {
      lines.push(...block.rows);
      lines.push("");
      continue;
    }
    if (block.kind === "rule") {
      lines.push("---");
      lines.push("");
      continue;
    }
    lines.push(block.text);
    lines.push("");
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

export async function renderPdfFromHtml(html: string): Promise<Buffer> {
  const runtime = await getAppRuntimeConfig();
  const pythonBackendUrl = runtime.pythonBackendUrl;
  const proxyToken = runtime.proxyToken;

  if (!proxyToken) {
    throw new Error("SMARTSPEC proxy token is not configured");
  }

  const response = await fetch(`${pythonBackendUrl}/api/internal/library/render-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-proxy-token": proxyToken,
    },
    body: JSON.stringify({ html }),
  });

  if (!response.ok) {
    throw new Error(`PDF render failed with status ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function buildMarkdownPdfHtml(markdown: string, title?: string): string {
  const safeTitle = escapeHtml(title || "Markdown Export");
  const rendered = marked.parse(markdown, { async: false }) as string;
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    body {
      margin: 0;
      color: #111827;
      font-family: "Inter", "Segoe UI", Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.6;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    main {
      max-width: 840px;
      margin: 0 auto;
    }
    h1, h2, h3, h4, h5, h6 { line-height: 1.2; margin: 1.1em 0 0.5em; }
    p, ul, ol, blockquote, pre, table { margin: 0 0 0.9em; }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      padding: 0.9em 1em;
      border: 1px solid #dbe4f0;
      border-radius: 10px;
      background: #f8fafc;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 11pt;
    }
    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.95em;
    }
    blockquote {
      padding: 0.7em 1em;
      border-left: 4px solid #cbd5e1;
      background: #f8fafc;
      color: #334155;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 0.45em 0.6em;
      text-align: left;
      vertical-align: top;
    }
    a { color: #0f766e; word-break: break-word; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <main>
    ${rendered}
  </main>
</body>
</html>`;
}

export async function exportMarkdownArtifact(params: {
  markdown: string;
  title?: string;
  format: MarkdownExportFormat;
}): Promise<MarkdownExportArtifact> {
  const fileName = getMarkdownExportFileName(params.title, params.format === "txt" ? "txt" : params.format);

  if (params.format === "html") {
    const html = buildMarkdownHtmlDocument(params.markdown);
    return {
      fileName,
      mimeType: "text/html;charset=utf-8",
      dataBase64: Buffer.from(html, "utf8").toString("base64"),
    };
  }

  if (params.format === "txt") {
    const text = buildMarkdownPlainText(params.markdown);
    return {
      fileName,
      mimeType: "text/plain;charset=utf-8",
      dataBase64: Buffer.from(text, "utf8").toString("base64"),
    };
  }

  if (params.format === "docx") {
    const bytes = buildMarkdownDocxPackage(params.markdown);
    return {
      fileName,
      mimeType: DOCX_MIME_TYPE,
      dataBase64: bytes.toString("base64"),
    };
  }

  const printableHtml = buildMarkdownPdfHtml(params.markdown, params.title);
  const pdfBytes = await renderPdfFromHtml(printableHtml);
  return {
    fileName,
    mimeType: PDF_MIME_TYPE,
    dataBase64: pdfBytes.toString("base64"),
  };
}
