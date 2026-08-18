import { describe, expect, it } from "vitest";
import {
  isUsableImageUrl,
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
