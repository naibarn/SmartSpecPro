import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { verticalDramaBookDocumentSchema } from "../../shared/verticalDramaSeries/bookDocument";
import { buildVerticalDramaBookEpub, buildVerticalDramaBookPrintHtml } from "./verticalDramaBookRenderers";
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
