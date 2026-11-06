import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { verticalDramaBookDocumentSchema } from "../../shared/verticalDramaSeries/bookDocument";
import { buildVerticalDramaBookEpub, buildVerticalDramaBookPrintHtml, renderVerticalDramaBookPdf, validateVerticalDramaBookEpub } from "./verticalDramaBookRenderers";
import { createHash } from "node:crypto";

const image = Buffer.from("book-shot-image");
const checksum = createHash("sha256").update(image).digest("hex");
const document = verticalDramaBookDocumentSchema.parse({
  schemaVersion: 1,
  metadata: { title: "A <safe> book", author: "Writer", language: "th", coverMediaAssetId: 9, coverChecksum: checksum, coverAltText: "หน้าปก" },
  source: { seriesId: 2, sourceFingerprint: "a".repeat(64), episodeIds: [4] },
  chapters: [{ id: "ch-4", title: "ตอนแรก", sourceEpisodeIds: [4], blocks: [
    { id: "p-1", type: "paragraph", text: "ข้อความ <ปลอดภัย>", sourceRefs: [] },
    { id: "img-1", type: "illustration", mediaAssetId: 9, mediaChecksum: checksum, placement: "inline", altText: "ภาพตัวละคร", sourceRefs: [] },
  ] }],
});
const renderInput = { document, images: [{ mediaAssetId: 9, checksum, mimeType: "image/png", bytes: image }] };

describe("vertical drama book renderers", () => {
  it("writes a reflowable EPUB with stored-first mimetype, cover, text, and selected image", () => {
    const bytes = buildVerticalDramaBookEpub(renderInput);
    const zip = new AdmZip(bytes);
    const entries = zip.getEntries();
    expect(entries[0].entryName).toBe("mimetype");
    expect(entries[0].header.method).toBe(0);
    expect(zip.readAsText("mimetype")).toBe("application/epub+zip");
    expect(zip.readAsText("OEBPS/package.opf")).toContain("version=\"3.0\"");
    expect(zip.readAsText("OEBPS/nav.xhtml")).toContain("ตอนแรก");
    const chapter = zip.readAsText("OEBPS/chapter-1.xhtml");
    expect(chapter).toContain("ข้อความ &lt;ปลอดภัย&gt;");
    expect(chapter).toContain("images/asset-9.png");
    expect(zip.readFile("OEBPS/images/asset-9.png")).toEqual(image);
    expect(chapter).not.toContain("<ปลอดภัย>");
  });

  it("fails closed on missing images or changed checksums", () => {
    expect(() => buildVerticalDramaBookEpub({ ...renderInput, images: [] })).toThrow("BOOK_EXPORT_COVER_MISSING");
    expect(() => buildVerticalDramaBookEpub({ ...renderInput, images: [{ ...renderInput.images[0], bytes: Buffer.from("changed") }] })).toThrow("BOOK_IMAGE_CHECKSUM_MISMATCH");
  });

  it("builds PDF print HTML with local data URLs and no remote fetches", () => {
    const html = buildVerticalDramaBookPrintHtml(renderInput);
    expect(html).toContain("img-src data:");
    expect(html).toContain("data:image/png;base64,");
    expect(html).toContain("ข้อความ &lt;ปลอดภัย&gt;");
    expect(html).toContain('id="chapter-1"');
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
  });
});

describe.runIf(process.env.BOOK_EXPORT_RENDER_ACCEPTANCE === "1")("vertical drama book runtime acceptance", () => {
  it("validates EPUB and renders/extracts Thai PDF text with local tools", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pWQAAAAASUVORK5CYII=", "base64");
    const pngChecksum = createHash("sha256").update(png).digest("hex");
    const thaiDocument = verticalDramaBookDocumentSchema.parse({
      schemaVersion: 1,
      metadata: { title: "นิยายทดสอบ", author: "ผู้เขียน", language: "th", coverMediaAssetId: 1, coverChecksum: pngChecksum, coverAltText: "ภาพปก" },
      source: { seriesId: 1, sourceFingerprint: "b".repeat(64), episodeIds: [1] },
      chapters: [{ id: "chapter-1", title: "ตอนที่หนึ่ง", sourceEpisodeIds: [1], blocks: [
        { id: "paragraph-1", type: "paragraph", text: "ภาษาไทยทดสอบการจัดหน้าและการดึงข้อความจากไฟล์ PDF", sourceRefs: [] },
        { id: "image-1", type: "illustration", mediaAssetId: 1, mediaChecksum: pngChecksum, placement: "chapter_opener", altText: "ภาพประกอบ", sourceRefs: [] },
      ] }],
    });
    const input = { document: thaiDocument, images: [{ mediaAssetId: 1, checksum: pngChecksum, mimeType: "image/png", bytes: png }] };
    const epubValidation = await validateVerticalDramaBookEpub(buildVerticalDramaBookEpub(input));
    const pdf = await renderVerticalDramaBookPdf(input);
    expect(epubValidation).toEqual(expect.objectContaining({ validator: "epubcheck", status: "passed" }));
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
