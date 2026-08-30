import { describe, expect, it } from "vitest";
import MediaHistory, {
  buildFallbackApiUrl,
  canAddTaskToGallery,
  getVideoEditorLibraryItemIdForTask,
  MEDIA_HISTORY_TASK_GC_TIME_MS,
  MEDIA_HISTORY_TASK_REVALIDATE_ON_MOUNT,
  MEDIA_HISTORY_TASK_REFETCH_ON_WINDOW_FOCUS,
  MEDIA_HISTORY_TASK_STALE_TIME_MS,
  parseMediaHistoryQueryState,
  resolveMediaHistoryGalleryAspectRatio,
  resolveMediaHistoryGalleryTitle,
} from "./MediaHistory";

describe("MediaHistory module", () => {
  it("imports successfully", () => {
    expect(typeof MediaHistory).toBe("function");
  });

  it("uses a short list cache with immediate mount revalidation policy", () => {
    expect(MEDIA_HISTORY_TASK_STALE_TIME_MS).toBe(30_000);
    expect(MEDIA_HISTORY_TASK_GC_TIME_MS).toBe(15 * 60_000);
    expect(MEDIA_HISTORY_TASK_REVALIDATE_ON_MOUNT).toBe("always");
    expect(MEDIA_HISTORY_TASK_REFETCH_ON_WINDOW_FOCUS).toBe(false);
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
      canAddTaskToGallery(
        {
          mediaType: "image",
          status: "completed",
          resultUrl: "/api/storage/files/gallery/1",
        },
        true,
      ),
    ).toBe(true);
    expect(
      canAddTaskToGallery(
        {
          mediaType: "image",
          status: "completed",
          resultUrl: "/api/storage/files/gallery/1",
        },
        false,
      ),
    ).toBe(false);
    expect(
      canAddTaskToGallery(
        {
          mediaType: "image",
          status: "processing",
          resultUrl: "/api/storage/files/gallery/1",
        },
        true,
      ),
    ).toBe(false);
    expect(
      canAddTaskToGallery(
        { mediaType: "image", status: "completed" },
        true,
      ),
    ).toBe(false);
    expect(
      canAddTaskToGallery(
        {
          mediaType: "audio",
          status: "completed",
          resultUrl: "/api/storage/files/gallery/1",
        },
        true,
      ),
    ).toBe(false);
  });

  it("builds a searchable Gallery title from Vertical Drama metadata", () => {
    expect(
      resolveMediaHistoryGalleryTitle({
        mediaType: "video",
        prompt: "remotion_render_mp4",
        parameters: {
          extra_params: {
            __media_series_title: "คาเฟ่รักในเวทีพิเศษ",
            __media_episode_number: 29,
            __media_shot_number: 1,
          },
        },
        resultData: undefined,
      }),
    ).toBe("คาเฟ่รักในเวทีพิเศษ ตอนที่ 29-1");
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
