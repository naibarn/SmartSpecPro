import { marked } from "marked";

type MarkdownBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "list-item"; text: string; ordered: boolean; index: number }
  | { kind: "code"; text: string }
  | { kind: "rule" }
  | { kind: "table"; rows: string[] };

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOCX_MAIN_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const ZIP_UTF8_FLAG = 0x0800;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

function writeU16(value: number): Uint8Array {
  const out = new Uint8Array(2);
  const view = new DataView(out.buffer);
  view.setUint16(0, value, true);
  return out;
}

function writeU32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  const view = new DataView(out.buffer);
  view.setUint32(0, value >>> 0, true);
  return out;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
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

function extractInlineText(node: ParentNode): string {
  let result = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      result += child.textContent ?? "";
      return;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const el = child as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === "br") {
      result += "\n";
      return;
    }

    if (tag === "a") {
      const text = extractInlineText(el).trim();
      const href = el.getAttribute("href")?.trim();
      if (href && text && href !== text) {
        result += `${text} (${href})`;
      } else {
        result += text || href || "";
      }
      return;
    }

    if (tag === "img") {
      result += el.getAttribute("alt")?.trim() || "image";
      return;
    }

    result += extractInlineText(el);
  });

  return result
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ");
}

function collectBlocksFromElement(element: Element): MarkdownBlock[] {
  const tag = element.tagName.toLowerCase();

  if (/^h[1-6]$/.test(tag)) {
    return [{
      kind: "heading",
      level: Number(tag.slice(1)),
      text: extractInlineText(element).trim(),
    }];
  }

  if (tag === "p") {
    const text = extractInlineText(element).trim();
    return text ? [{ kind: "paragraph", text }] : [];
  }

  if (tag === "blockquote") {
    const text = extractInlineText(element).trim();
    return text ? [{ kind: "quote", text }] : [];
  }

  if (tag === "pre") {
    const codeEl = element.querySelector("code");
    const text = (codeEl?.textContent ?? element.textContent ?? "").replace(/\r\n/g, "\n").replace(/\n+$/g, "");
    return text ? [{ kind: "code", text }] : [];
  }

  if (tag === "ul" || tag === "ol") {
    return Array.from(element.children).flatMap((child, index) => {
      if (child.tagName.toLowerCase() !== "li") {
        return collectBlocksFromElement(child);
      }
      const text = extractInlineText(child).trim();
      return text ? [{
        kind: "list-item",
        text,
        ordered: tag === "ol",
        index: index + 1,
      }] : [];
    });
  }

  if (tag === "table") {
    const rows = Array.from(element.querySelectorAll("tr")).map((row) => {
      return Array.from(row.querySelectorAll("th,td"))
        .map((cell) => extractInlineText(cell).trim())
        .filter(Boolean)
        .join(" | ");
    }).filter(Boolean);
    return rows.length > 0 ? [{ kind: "table", rows }] : [];
  }

  if (tag === "hr") {
    return [{ kind: "rule" }];
  }

  if (["div", "section", "article", "main", "body"].includes(tag)) {
    return Array.from(element.children).flatMap((child) => collectBlocksFromElement(child));
  }

  const text = extractInlineText(element).trim();
  return text ? [{ kind: "paragraph", text }] : [];
}

function extractMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const rendered = marked.parse(markdown, { async: false }) as string;
  if (typeof document === "undefined") {
    return rendered
      .split(/\n{2,}/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text) => ({ kind: "paragraph" as const, text }));
  }

  const parsed = new DOMParser().parseFromString(`<body>${rendered}</body>`, "text/html");
  return Array.from(parsed.body.children).flatMap((child) => collectBlocksFromElement(child));
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

function buildMarkdownDocxPackage(markdown: string): Uint8Array {
  const documentXml = buildMarkdownDocxDocumentXml(markdown);
  const entries = [
    {
      name: "[Content_Types].xml",
      data: utf8Bytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="${DOCX_MAIN_CONTENT_TYPE}"/>
</Types>`),
    },
    {
      name: "_rels/.rels",
      data: utf8Bytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`),
    },
    {
      name: "word/document.xml",
      data: utf8Bytes(documentXml),
    },
  ];

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = utf8Bytes(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const localHeader = concatBytes([
      writeU32(0x04034b50),
      writeU16(20),
      writeU16(ZIP_UTF8_FLAG),
      writeU16(0),
      writeU16(0),
      writeU16(0),
      writeU32(crc),
      writeU32(data.length),
      writeU32(data.length),
      writeU16(nameBytes.length),
      writeU16(0),
      nameBytes,
    ]);
    localParts.push(localHeader, data);

    const centralHeader = concatBytes([
      writeU32(0x02014b50),
      writeU16(20),
      writeU16(20),
      writeU16(ZIP_UTF8_FLAG),
      writeU16(0),
      writeU16(0),
      writeU16(0),
      writeU32(crc),
      writeU32(data.length),
      writeU32(data.length),
      writeU16(nameBytes.length),
      writeU16(0),
      writeU16(0),
      writeU16(0),
      writeU32(0),
      writeU32(offset),
      nameBytes,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirectory = concatBytes(centralParts);
  const eocd = concatBytes([
    writeU32(0x06054b50),
    writeU16(0),
    writeU16(0),
    writeU16(entries.length),
    writeU16(entries.length),
    writeU32(centralDirectory.length),
    writeU32(offset),
    writeU16(0),
  ]);

  return concatBytes([...localParts, centralDirectory, eocd]);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function buildPrintableDocument(markdown: string, title?: string): string {
  const safeTitle = escapeXml(title || "Markdown Export");
  return buildMarkdownHtmlDocument(markdown).replace(
    "<title>Markdown Export</title>",
    `<title>${safeTitle}</title>`,
  );
}

export function downloadMarkdownSource(markdown: string, title?: string): void {
  downloadBlob(
    new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    getMarkdownExportFileName(title, "md"),
  );
}

export function exportMarkdownAsHtml(markdown: string, title?: string): void {
  downloadBlob(
    new Blob([buildMarkdownHtmlDocument(markdown)], { type: "text/html;charset=utf-8" }),
    getMarkdownExportFileName(title, "html"),
  );
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

export function exportMarkdownAsPlainText(markdown: string, title?: string): void {
  const text = buildMarkdownPlainText(markdown);
  downloadBlob(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
    getMarkdownExportFileName(title, "txt"),
  );
}

export function exportMarkdownAsDocx(markdown: string, title?: string): void {
  const bytes = buildMarkdownDocxPackage(markdown);
  downloadBlob(
    new Blob([bytesToArrayBuffer(bytes)], { type: DOCX_MIME_TYPE }),
    getMarkdownExportFileName(title, "docx"),
  );
}

export function exportMarkdownAsPdf(markdown: string, title?: string): void {
  const popup = window.open("", "_blank", "width=1024,height=768");
  if (!popup) {
    throw new Error("PDF export blocked by the browser");
  }

  popup.document.open();
  popup.document.write(buildPrintableDocument(markdown, title));
  popup.document.close();
  popup.focus();

  const triggerPrint = () => {
    try {
      popup.focus();
      popup.print();
    } catch {
      // Ignore print failures - the printable page is still available.
    }
  };

  if (popup.document.readyState === "complete") {
    window.setTimeout(triggerPrint, 250);
    return;
  }

  popup.addEventListener("load", () => {
    window.setTimeout(triggerPrint, 250);
  }, { once: true });
}

export function getMarkdownExportDescription(): string {
  return "ดาวน์โหลดคือไฟล์ .md ต้นฉบับ ส่วนส่งออกจะแปลงเป็น HTML, ข้อความล้วน, DOCX, หรือ PDF.";
}
