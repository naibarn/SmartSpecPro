import { describe, expect, it } from "vitest";
import MediaHistory, {
  buildFallbackApiUrl,
  getVideoEditorLibraryItemIdForTask,
  parseMediaHistoryQueryState,
} from "./MediaHistory";

describe("MediaHistory module", () => {
  it("imports successfully", () => {
    expect(typeof MediaHistory).toBe("function");
  });

  it("builds Magnific fallback URLs from the Magnific base URL", () => {
    expect(
      buildFallbackApiUrl("magnific", "/v1/ai/text-to-image/nano-banana-pro")
    ).toBe("https://api.magnific.com/v1/ai/text-to-image/nano-banana-pro");
  });

  it("does not fall back to Kie.ai for unknown explicit providers", () => {
    expect(buildFallbackApiUrl("unknown-provider", "/v1/jobs/status")).toBeUndefined();
  });

  it("parses source and media type filters from route queries", () => {
    expect(
      parseMediaHistoryQueryState(
        "/media-history?source=marketplace_auto_review_hyperframes_render&type=video&productId=product_1&runId=mar_1"
      )
    ).toEqual({
      mediaType: "video",
      source: "marketplace_auto_review_hyperframes_render",
      productId: "product_1",
      runId: "mar_1",
    });
    expect(parseMediaHistoryQueryState("?source=&type=unsupported")).toEqual({
      mediaType: "all",
      source: undefined,
      productId: undefined,
      runId: undefined,
    });
    expect(
      parseMediaHistoryQueryState(
        "/media-history?type=video&productId=product_1&runId=mar_1"
      )
    ).toEqual({
      mediaType: "video",
      source: undefined,
      productId: "product_1",
      runId: "mar_1",
    });
  });

  it("exposes a Video Editor handoff only for video tasks with a Library item", () => {
    expect(
      getVideoEditorLibraryItemIdForTask({ mediaType: "video" }, { itemId: 42 })
    ).toBe(42);
    expect(
      getVideoEditorLibraryItemIdForTask({ mediaType: "image" }, { itemId: 42 })
    ).toBeNull();
    expect(
      getVideoEditorLibraryItemIdForTask({ mediaType: "video" }, { itemId: 0 })
    ).toBeNull();
  });
});
