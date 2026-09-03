import { describe, expect, it } from "vitest";
import type { DragEvent } from "react";
import {
  isUsableImageUrl,
  readDroppedMediaFiles,
  readDroppedMediaInput,
  mergeRecentUploadedImages,
  normalizeMediaHistoryImageItems,
  normalizeRecentUploadedImageItems,
} from "./ImageSourcePicker";

describe("isUsableImageUrl", () => {
  it("accepts authenticated storage proxy URLs", () => {
    expect(
      isUsableImageUrl("/api/storage/files/chat/uploads/tenant/7/image.png"),
    ).toBe(true);
  });

  it("rejects unsupported URL schemes", () => {
    expect(isUsableImageUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("readDroppedMediaInput", () => {
  it("accepts OS audio files and library video URLs", () => {
    const audio = new File(["audio"], "voice.mp3", { type: "audio/mpeg" });
    const audioResult = readDroppedMediaInput({
      dataTransfer: { files: [audio], getData: () => "" },
    } as unknown as DragEvent);
    expect(audioResult.input).toMatchObject({ kind: "file", mediaType: "audio" });

    const videoResult = readDroppedMediaInput({
      dataTransfer: {
        files: [],
        getData: (type: string) => type.includes("media-type") ? "video" : "https://cdn.example.com/library-item",
      },
    } as unknown as DragEvent);
    expect(videoResult.input).toEqual({ kind: "url", mediaType: "video", url: "https://cdn.example.com/library-item" });
  });
});

describe("readDroppedMediaFiles", () => {
  it("preserves multiple mixed image, video, and audio files", () => {
    const files = [
      new File(["image"], "frame.png", { type: "image/png" }),
      new File(["video"], "motion.mp4", { type: "video/mp4" }),
      new File(["audio"], "voice.mp3", { type: "audio/mpeg" }),
    ];
    const result = readDroppedMediaFiles(files);
    expect(result.error).toBeNull();
    expect(result.inputs.map(input => input.mediaType)).toEqual([
      "image",
      "video",
      "audio",
    ]);
  });
});

describe("normalizeMediaHistoryImageItems", () => {
  it("extracts completed generated image URLs from media history tasks", () => {
    const items = normalizeMediaHistoryImageItems([
      {
        id: "task-1",
        status: "completed",
        mediaType: "image",
        resultUrl: "/api/storage/files/images/generated/1/task-1.png",
        resultData: {
          thumbnail_url: "/api/storage/files/images/thumbnails/task-1.jpg",
        },
        prompt: "Hero product shot",
        model: "gpt-image-2",
      },
      {
        id: "task-2",
        status: "processing",
        mediaType: "image",
        resultUrl: "/api/storage/files/images/generated/1/task-2.png",
      },
      {
        id: "task-3",
        status: "completed",
        mediaType: "video",
        resultUrl: "/api/storage/files/videos/generated/1/task-3.mp4",
      },
    ]);

    expect(items).toEqual([
      {
        key: "history-task-1",
        url: "/api/storage/files/images/generated/1/task-1.png",
        thumbnailUrl: "/api/storage/files/images/thumbnails/task-1.jpg",
        title: "Hero product shot",
      },
    ]);
  });

  it("finds nested provider result URLs and filters by search query", () => {
    const items = normalizeMediaHistoryImageItems(
      [
        {
          id: "task-4",
          status: "completed",
          mediaType: "image",
          resultData: {
            response: {
              images: [
                {
                  imageUrl: "https://cdn.example.com/generated/lipstick.png",
                },
              ],
            },
          },
          prompt: "Luxury lipstick frame",
        },
      ],
      "lipstick",
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.url).toBe("https://cdn.example.com/generated/lipstick.png");
  });
});

describe("recent uploaded image helpers", () => {
  it("keeps uploaded images newest-first and deduped", () => {
    const records = mergeRecentUploadedImages(
      [
        {
          url: "/uploads/old.png",
          title: "old.png",
          createdAt: 100,
        },
        {
          url: "/uploads/reused.png",
          title: "reused.png",
          createdAt: 50,
        },
      ],
      ["/uploads/reused.png", "/uploads/new.png"],
      200,
    );

    expect(records.map((record) => record.url)).toEqual([
      "/uploads/reused.png",
      "/uploads/new.png",
      "/uploads/old.png",
    ]);
  });

  it("normalizes recent upload records for picker display", () => {
    const items = normalizeRecentUploadedImageItems([
      {
        url: "/uploads/reference-product.png",
        createdAt: 100,
      },
    ]);

    expect(items).toEqual([
      {
        key: "recent-upload-/uploads/reference-product.png",
        url: "/uploads/reference-product.png",
        thumbnailUrl: "/uploads/reference-product.png",
        title: "reference-product.png",
      },
    ]);
  });
});
