import { describe, expect, it } from "vitest";

import {
  buildVideoEditorLibraryAssetFromItem,
  parseVideoEditorLibraryItemId,
} from "./videoEditorLibraryHandoff";

describe("videoEditorLibraryHandoff", () => {
  it("parses a positive libraryItemId from the Video Editor query", () => {
    expect(parseVideoEditorLibraryItemId("?libraryItemId=42")).toBe(42);
    expect(parseVideoEditorLibraryItemId("/video-editor?libraryItemId=42")).toBe(42);
    expect(parseVideoEditorLibraryItemId("?libraryItemId=0")).toBeNull();
    expect(parseVideoEditorLibraryItemId("?libraryItemId=abc")).toBeNull();
    expect(parseVideoEditorLibraryItemId("?libraryItemId=1abc")).toBeNull();
    expect(parseVideoEditorLibraryItemId("?projectId=42")).toBeNull();
  });

  it("maps a HyperFrames library video into a normal Video Editor asset", () => {
    const asset = buildVideoEditorLibraryAssetFromItem({
      id: 7,
      title: "HyperFrames Marketplace Auto Review video",
      item_type: "video",
      source: "marketplace_auto_review_hyperframes_render",
      source_url: "https://cdn.example.test/hyperframes/final.mp4",
      thumbnail_url: "https://cdn.example.test/hyperframes/thumb.jpg",
      created_at: "2026-06-04T00:00:00.000Z",
      metadata: {
        duration_seconds: 12.5,
        productId: "product_1",
        runId: "mar_1",
        renderJobId: "hf_1",
      },
    });

    expect(asset).toMatchObject({
      id: "library-7",
      type: "video",
      title: "HyperFrames Marketplace Auto Review video",
      duration: 12.5,
      url: "https://cdn.example.test/hyperframes/final.mp4",
      thumbnailUrl: "https://cdn.example.test/hyperframes/thumb.jpg",
      format: "mp4",
      model: "marketplace_auto_review_hyperframes_render",
      generationExtraParams: {
        source: "marketplace_auto_review_hyperframes_render",
        libraryItemId: 7,
        productId: "product_1",
        runId: "mar_1",
        renderJobId: "hf_1",
      },
    });
    expect(asset?.createdAt.toISOString()).toBe("2026-06-04T00:00:00.000Z");
  });

  it("falls back to item_id when id is not a strict numeric library id", () => {
    expect(
      buildVideoEditorLibraryAssetFromItem({
        id: "1abc",
        item_id: "7",
        item_type: "video",
        source_url: "https://cdn.example.test/final.mp4",
      })?.id
    ).toBe("library-7");
  });

  it("preserves Marketplace Auto Review context from Library metadata aliases", () => {
    const asset = buildVideoEditorLibraryAssetFromItem({
      id: 9,
      item_type: "video",
      source_url: "https://cdn.example.test/final.mp4",
      metadata: {
        marketplace_product_id: "product_9",
        production_run_id: "mar_9",
      },
    });

    expect(asset?.generationExtraParams).toMatchObject({
      productId: "product_9",
      runId: "mar_9",
    });
  });

  it("rejects unsupported library items that cannot be placed on the timeline", () => {
    expect(
      buildVideoEditorLibraryAssetFromItem({
        id: 1,
        item_type: "image",
        source_url: "https://cdn.example.test/image.png",
      })
    ).toBeNull();
    expect(
      buildVideoEditorLibraryAssetFromItem({
        id: 1,
        item_type: "video",
      })
    ).toBeNull();
  });
});
