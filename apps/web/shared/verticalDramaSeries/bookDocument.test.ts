import { describe, expect, it } from "vitest";
import { verticalDramaBookDocumentSchema } from "./bookDocument";

const hash = "a".repeat(64);
const base = {
  schemaVersion: 1 as const,
  metadata: { title: "เล่มหนึ่ง", author: "ผู้เขียน", language: "th" },
  source: { seriesId: 1, sourceFingerprint: hash, episodeIds: [3] },
  chapters: [{ id: "chapter-1", title: "ตอนแรก", sourceEpisodeIds: [3], blocks: [
    { id: "paragraph-1", type: "paragraph" as const, text: "ข้อความภาษาไทย", sourceRefs: [{ episodeId: 3, locator: "episode:3/scene:1", sourceHash: hash }] },
  ] }],
};

describe("vertical drama Book Document", () => {
  it("accepts typed Thai prose with stable provenance", () => {
    expect(verticalDramaBookDocumentSchema.parse(base).metadata.language).toBe("th");
  });

  it("rejects duplicate block IDs and informative illustrations without alt text", () => {
    const duplicate = structuredClone(base);
    duplicate.chapters[0].blocks.push({ ...duplicate.chapters[0].blocks[0] });
    expect(verticalDramaBookDocumentSchema.safeParse(duplicate).success).toBe(false);

    const noAlt = structuredClone(base);
    noAlt.chapters[0].blocks = [{
      id: "image-1", type: "illustration", mediaAssetId: 9, mediaChecksum: hash,
      placement: "inline", altText: "", decorative: false, sourceRefs: [],
    }];
    expect(verticalDramaBookDocumentSchema.safeParse(noAlt).success).toBe(false);
  });

  it("rejects arbitrary HTML block types and remote image URLs", () => {
    const unsafe = structuredClone(base) as any;
    unsafe.chapters[0].blocks = [{ id: "html-1", type: "html", html: "<script>" }];
    expect(verticalDramaBookDocumentSchema.safeParse(unsafe).success).toBe(false);
  });

  it("requires a pinned checksum and alternative text when a cover is selected", () => {
    const invalidCover = structuredClone(base);
    invalidCover.metadata = { ...invalidCover.metadata, coverMediaAssetId: 99, coverChecksum: hash, coverAltText: "" };
    expect(verticalDramaBookDocumentSchema.safeParse(invalidCover).success).toBe(false);
  });
});
