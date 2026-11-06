import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

import { chromium } from "@playwright/test";

import type { VerticalDramaBookDocument } from "../../shared/verticalDramaSeries/bookDocument";

export type BookImageBytes = { mediaAssetId: number; checksum: string; renderChecksum?: string; mimeType: string; bytes: Buffer };
export type BookRenderInput = { document: VerticalDramaBookDocument; images: BookImageBytes[] };

const MAX_BOOK_RENDER_BYTES = 100 * 1024 * 1024;

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function imageExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase().split(";")[0].trim();
  if (normalized === "image/jpeg" || normalized === "image/jpg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/gif") return "gif";
  throw new Error("BOOK_IMAGE_MIME_UNSUPPORTED");
}

function imageIndex(input: BookRenderInput): Map<number, BookImageBytes> {
  const result = new Map<number, BookImageBytes>();
  let byteCount = 0;
  for (const image of input.images) {
    if (!Number.isSafeInteger(image.mediaAssetId) || !/^[a-f0-9]{64}$/.test(image.checksum) || !image.bytes.length) throw new Error("BOOK_IMAGE_RECORD_INVALID");
    const actual = createHash("sha256").update(image.bytes).digest("hex");
    if (actual !== (image.renderChecksum ?? image.checksum).toLowerCase()) throw new Error("BOOK_IMAGE_CHECKSUM_MISMATCH");
    imageExtension(image.mimeType);
    byteCount += image.bytes.length;
    if (byteCount > MAX_BOOK_RENDER_BYTES) throw new Error("BOOK_IMAGE_BATCH_TOO_LARGE");
    result.set(image.mediaAssetId, image);
  }
  return result;
}

function imagePath(image: BookImageBytes): string {
  return `images/asset-${image.mediaAssetId}.${imageExtension(image.mimeType)}`;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createEpubZip(entries: Array<{ name: string; bytes: Buffer; stored?: boolean }>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const method = entry.stored ? 0 : 8;
    const body = entry.stored ? entry.bytes : deflateRawSync(entry.bytes, { level: 6 });
    const checksum = crc32(entry.bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(33, 12);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(entry.bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, name, body);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt16LE(0, 12);
    directory.writeUInt16LE(33, 14);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(body.length, 20);
    directory.writeUInt32LE(entry.bytes.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt16LE(0, 30);
    directory.writeUInt16LE(0, 32);
    directory.writeUInt16LE(0, 34);
    directory.writeUInt16LE(0, 36);
    directory.writeUInt32LE(0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + body.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...local, centralBytes, end]);
}

function inlineTextBlock(block: Record<string, any>): string {
  const text = xml(String(block.text ?? "")).replaceAll("\n", "<br/>\n");
  if (block.type === "heading") return `<h${block.level}>${text}</h${block.level}>`;
  if (block.type === "dialogue") return `<p class="dialogue">${block.speaker ? `<strong>${xml(String(block.speaker))}:</strong> ` : ""}${text}</p>`;
  if (block.type === "quote") return `<blockquote><p>${text}</p></blockquote>`;
  if (block.type === "scene_break") return `<hr class="scene-break"/>`;
  return `<p>${text}</p>`;
}

function chapterXhtml(chapter: VerticalDramaBookDocument["chapters"][number], images: Map<number, BookImageBytes>, language: string): string {
  const body = chapter.blocks.map(block => {
    if (block.type !== "illustration") return inlineTextBlock(block as Record<string, any>);
    const image = images.get(block.mediaAssetId);
    if (!image || image.checksum !== block.mediaChecksum) throw new Error("BOOK_EXPORT_IMAGE_MISSING");
    const alt = block.decorative ? "" : xml(block.altText);
    return `<figure><img src="${xml(imagePath(image))}" alt="${alt}"/>${block.caption ? `<figcaption>${xml(block.caption)}</figcaption>` : ""}</figure>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xml(language)}"><head><title>${xml(chapter.title)}</title><link rel="stylesheet" type="text/css" href="styles/book.css"/></head><body><section epub:type="chapter"><h1>${xml(chapter.title)}</h1>${body}</section></body></html>`;
}

export function buildVerticalDramaBookEpub(input: BookRenderInput): Buffer {
  const images = imageIndex(input);
  const { document } = input;
  if (document.metadata.coverMediaAssetId) {
    const cover = images.get(document.metadata.coverMediaAssetId);
    if (!cover || cover.checksum !== document.metadata.coverChecksum) throw new Error("BOOK_EXPORT_COVER_MISSING");
  }
  const zipEntries: Array<{ name: string; bytes: Buffer; stored?: boolean }> = [
    { name: "mimetype", bytes: Buffer.from("application/epub+zip", "utf8"), stored: true },
    { name: "META-INF/container.xml", bytes: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`) },
    { name: "OEBPS/styles/book.css", bytes: Buffer.from("body{line-height:1.65}figure{margin:1em 0;text-align:center}figure img{max-width:100%;height:auto}figcaption{font-size:0.9em;text-align:center}.dialogue{margin-inline-start:1em}.scene-break{text-align:center;border:0}.scene-break:after{content:'* * *'}") },
  ];
  const add = (name: string, value: string | Buffer) => zipEntries.push({ name, bytes: Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8") });

  const manifest: string[] = ['<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>', '<item id="css" href="styles/book.css" media-type="text/css"/>'];
  const spine: string[] = [];
  const toc: string[] = [];
  document.chapters.forEach((chapter, index) => {
    const id = `chapter-${index + 1}`;
    const href = `chapter-${index + 1}.xhtml`;
    const chapterHtml = chapterXhtml(chapter, images, document.metadata.language);
    add(`OEBPS/${href}`, chapterHtml);
    manifest.push(`<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${id}"/>`);
    toc.push(`<li><a href="${href}">${xml(chapter.title)}</a></li>`);
  });

  if (document.metadata.coverMediaAssetId) {
    const cover = images.get(document.metadata.coverMediaAssetId);
    if (!cover || cover.checksum !== document.metadata.coverChecksum) throw new Error("BOOK_EXPORT_COVER_MISSING");
    const path = imagePath(cover);
    manifest.push(`<item id="cover-image" href="${xml(path)}" media-type="${xml(cover.mimeType === "image/jpg" ? "image/jpeg" : cover.mimeType)}" properties="cover-image"/>`);
    add(`OEBPS/${path}`, cover.bytes);
    add("OEBPS/cover.xhtml", `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${xml(document.metadata.language)}"><head><title>${xml(document.metadata.title)}</title></head><body><section><img src="${xml(path)}" alt="${xml(document.metadata.coverAltText ?? "")}"/></section></body></html>`);
    manifest.push('<item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>');
    spine.unshift('<itemref idref="cover-page"/>');
    toc.unshift('<li><a href="cover.xhtml">Cover</a></li>');
  }
  if (document.metadata.copyrightText?.trim()) {
    add("OEBPS/copyright.xhtml", `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${xml(document.metadata.language)}"><head><title>Copyright</title></head><body><section><h1>Copyright</h1><p>${xml(document.metadata.copyrightText)}</p></section></body></html>`);
    manifest.push('<item id="copyright-page" href="copyright.xhtml" media-type="application/xhtml+xml"/>');
    const coverSpineIndex = document.metadata.coverMediaAssetId ? 1 : 0;
    spine.splice(coverSpineIndex, 0, '<itemref idref="copyright-page"/>');
    toc.unshift('<li><a href="copyright.xhtml">Copyright</a></li>');
  }
  for (const image of images.values()) {
    const path = imagePath(image);
    if (!manifest.some(item => item.includes(`href="${xml(path)}"`))) {
      add(`OEBPS/${path}`, image.bytes);
      manifest.push(`<item id="image-${image.mediaAssetId}" href="${xml(path)}" media-type="${xml(image.mimeType === "image/jpg" ? "image/jpeg" : image.mimeType)}"/>`);
    }
  }

  const title = xml(document.metadata.title);
  const nav = `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xml(document.metadata.language)}"><head><title>Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${toc.join("")}</ol></nav></body></html>`;
  add("OEBPS/nav.xhtml", nav);
  const idDigest = createHash("sha256").update(`${title}:${document.source.sourceFingerprint}`).digest("hex").slice(0, 32);
  const uuid = `${idDigest.slice(0, 8)}-${idDigest.slice(8, 12)}-${idDigest.slice(12, 16)}-${idDigest.slice(16, 20)}-${idDigest.slice(20)}`;
  const opf = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${xml(document.metadata.language)}" prefix="schema: http://schema.org/"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:${uuid}</dc:identifier><dc:title>${title}</dc:title><dc:creator>${xml(document.metadata.author)}</dc:creator><dc:language>${xml(document.metadata.language)}</dc:language>${document.metadata.description ? `<dc:description>${xml(document.metadata.description)}</dc:description>` : ""}<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta><meta property="schema:accessMode">textual</meta><meta property="schema:accessMode">visual</meta><meta property="schema:accessibilityFeature">alternativeText</meta><meta property="schema:accessibilitySummary">Text is selectable and illustrations include author-provided alternative text.</meta></metadata><manifest>${manifest.join("")}</manifest><spine>${spine.join("")}</spine></package>`;
  add("OEBPS/package.opf", opf);
  return createEpubZip(zipEntries);
}

export function buildVerticalDramaBookPrintHtml(input: BookRenderInput): string {
  const images = imageIndex(input);
  const { document } = input;
  const cover = document.metadata.coverMediaAssetId ? images.get(document.metadata.coverMediaAssetId) : undefined;
  if (document.metadata.coverMediaAssetId && (!cover || cover.checksum !== document.metadata.coverChecksum)) throw new Error("BOOK_EXPORT_COVER_MISSING");
  const chapters = document.chapters.map((chapter, index) => {
    const blocks = chapter.blocks.map(block => {
      if (block.type !== "illustration") return inlineTextBlock(block as Record<string, any>);
      const image = images.get(block.mediaAssetId);
      if (!image || image.checksum !== block.mediaChecksum) throw new Error("BOOK_EXPORT_IMAGE_MISSING");
      const dataUrl = `data:${image.mimeType};base64,${image.bytes.toString("base64")}`;
      return `<figure><img src="${dataUrl}" alt="${block.decorative ? "" : xml(block.altText)}"/>${block.caption ? `<figcaption>${xml(block.caption)}</figcaption>` : ""}</figure>`;
    }).join("");
    return `<section id="chapter-${index + 1}" class="chapter"><h1>${xml(chapter.title)}</h1>${blocks}</section>`;
  }).join("");
  const coverHtml = cover ? `<section class="cover"><img src="data:${cover.mimeType};base64,${cover.bytes.toString("base64")}" alt="${xml(document.metadata.coverAltText ?? "")}"/><h1>${xml(document.metadata.title)}</h1>${document.metadata.subtitle ? `<p>${xml(document.metadata.subtitle)}</p>` : ""}<p>${xml(document.metadata.author)}</p></section>` : `<section class="cover"><h1>${xml(document.metadata.title)}</h1>${document.metadata.subtitle ? `<p>${xml(document.metadata.subtitle)}</p>` : ""}<p>${xml(document.metadata.author)}</p></section>`;
  const copyrightHtml = document.metadata.copyrightText?.trim() ? `<section class="copyright"><h1>Copyright</h1><p>${xml(document.metadata.copyrightText)}</p></section>` : "";
  const toc = document.chapters.map((chapter, index) => `<li><a href="#chapter-${index + 1}">${xml(chapter.title)}</a></li>`).join("");
  return `<!doctype html><html lang="${xml(document.metadata.language)}"><head><meta charset="utf-8"/><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none';"/><title>${xml(document.metadata.title)}</title><style>@page{size:A5;margin:18mm 16mm}body{font-family:"Noto Sans Thai","Th Sarabun New",sans-serif;color:#171717;line-height:1.7}h1{font-size:1.5rem;break-after:avoid}p,blockquote{orphans:2;widows:2}figure{margin:1.4em 0;text-align:center;break-inside:avoid}figure img{max-width:100%;max-height:180mm;height:auto;object-fit:contain}figcaption{font-size:.9em}.cover{page-break-after:always;text-align:center}.cover img{width:100%;max-height:220mm;object-fit:contain}.copyright{page-break-after:always}.toc{page-break-after:always}.chapter{page-break-before:always}a{color:inherit;text-decoration:none}.dialogue{margin-left:1em}.scene-break{text-align:center;border:0}.scene-break:after{content:'* * *'}</style></head><body>${coverHtml}${copyrightHtml}<section class="toc"><h1>Contents</h1><ol>${toc}</ol></section>${chapters}</body></html>`;
}

export async function renderVerticalDramaBookPdf(input: BookRenderInput): Promise<Buffer> {
  const html = buildVerticalDramaBookPrintHtml(input);
  const browser = await chromium.launch({ headless: true }).catch(() => {
    throw new Error("BOOK_PDF_BROWSER_UNAVAILABLE");
  });
  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    const bytes = await page.pdf({ format: "A5", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, tagged: true } as any);
    if (bytes.byteLength < 500 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("BOOK_PDF_OUTPUT_INVALID");
    const text = extractPdfTextWithPoppler(bytes);
    if (!text.trim() || !input.document.chapters.every(chapter => text.includes(chapter.title))) throw new Error("BOOK_PDF_TEXT_VALIDATION_FAILED");
    const pdfInfo = await readPdfInfo(bytes);
    if (pdfInfo.pages < 1 || (pdfInfo.title && pdfInfo.title !== input.document.metadata.title)) throw new Error("BOOK_PDF_METADATA_VALIDATION_FAILED");
    return bytes;
  } finally {
    await browser.close();
  }
}

function extractPdfTextWithPoppler(bytes: Buffer): string {
  try {
    return execFileSync(process.env.PDFTOTEXT_COMMAND || "pdftotext", ["-layout", "-", "-"], { input: bytes, encoding: "utf8", timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
  } catch {
    throw new Error("BOOK_PDF_TEXT_VALIDATOR_UNAVAILABLE");
  }
}

async function readPdfInfo(bytes: Buffer): Promise<{ pages: number; title: string | null }> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "book-pdf-check-"));
  const file = path.join(tempDir, "book.pdf");
  try {
    await writeFile(file, bytes, { mode: 0o600, flag: "wx" });
    const output = execFileSync(process.env.PDFINFO_COMMAND || "pdfinfo", [file], { encoding: "utf8", timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
    const pages = Number(output.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
    const title = output.match(/^Title:\s*(.*)$/m)?.[1]?.trim() || null;
    return { pages, title };
  } catch {
    throw new Error("BOOK_PDF_METADATA_VALIDATOR_UNAVAILABLE");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function validateVerticalDramaBookEpub(bytes: Buffer): Promise<Record<string, unknown>> {
  if (bytes.byteLength < 100 || bytes.byteLength > MAX_BOOK_RENDER_BYTES) throw new Error("BOOK_EPUB_SIZE_INVALID");
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "book-epub-check-"));
  const file = path.join(tempDir, "book.epub");
  try {
    await writeFile(file, bytes, { mode: 0o600, flag: "wx" });
    const command = process.env.EPUBCHECK_COMMAND || "epubcheck";
    const output = execFileSync(command, [file], { encoding: "utf8", timeout: 90_000, maxBuffer: 4 * 1024 * 1024 });
    return { validator: "epubcheck", status: "passed", summary: output.slice(-8000) };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT") throw new Error("BOOK_EPUBCHECK_UNAVAILABLE");
    throw new Error("BOOK_EPUBCHECK_FAILED");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
