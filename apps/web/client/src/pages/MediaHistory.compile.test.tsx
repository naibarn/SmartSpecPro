import { describe, expect, it } from "vitest";
import MediaHistory, {
  buildFallbackApiUrl,
  canAddTaskToGallery,
  getVideoEditorLibraryItemIdForTask,
  parseMediaHistoryQueryState,
  resolveMediaHistoryGalleryAspectRatio,
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

  it("does not duplicate a provider base path when Kie stores an absolute endpoint path", () => {
    expect(
      buildFallbackApiUrl(
        "kie_ai",
        "/api/v1/jobs/createTask",
        "https://api.kie.ai/api/v1"
      )
    ).toBe("https://api.kie.ai/api/v1/jobs/createTask");
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

  it("exposes Add to Gallery only to admins with completed media results", () => {
    expect(
      canAddTaskToGallery({ status: "completed", resultUrl: "/api/storage/files/gallery/1" }, true),
    ).toBe(true);
    expect(
      canAddTaskToGallery({ status: "completed", resultUrl: "/api/storage/files/gallery/1" }, false),
    ).toBe(false);
    expect(
      canAddTaskToGallery({ status: "processing", resultUrl: "/api/storage/files/gallery/1" }, true),
    ).toBe(false);
    expect(canAddTaskToGallery({ status: "completed" }, true)).toBe(false);
  });

  it("resolves Gallery orientation from media dimensions before defaults", () => {
    expect(
      resolveMediaHistoryGalleryAspectRatio({
        mediaType: "image",
        parameters: { aspectRatio: "1:1" },
        resultData: { width: 1080, height: 1920 },
      }),
    ).toBe("9:16");
    expect(
      resolveMediaHistoryGalleryAspectRatio({
        mediaType: "image",
        parameters: { aspectRatio: "9:16" },
        resultData: undefined,
      }),
    ).toBe("9:16");
    expect(
      resolveMediaHistoryGalleryAspectRatio({
        mediaType: "video",
        parameters: undefined,
        resultData: undefined,
      }),
    ).toBe("16:9");
  });
});
