import { describe, expect, it } from "vitest";
import { buildMediaStudioCommonPayload } from "./mediaStudioPayload";

describe("buildMediaStudioCommonPayload", () => {
  it("keeps referenceImageUrls even when extra params include model-specific image fields", () => {
    const payload = buildMediaStudioCommonPayload({
      prompt: "A scenic mountain lake",
      model: "google-nano-banana-pro",
      aspectRatio: "1:1",
      referenceImages: [
        { url: "https://cdn.example.com/ref-1.jpg" },
        { url: "https://cdn.example.com/ref-2.jpg" },
      ],
      extraParams: {
        image_urls: ["https://cdn.example.com/ref-1.jpg"],
        image_input: ["https://cdn.example.com/ref-1.jpg"],
      },
    });

    expect(payload.referenceImageUrls).toEqual([
      "https://cdn.example.com/ref-1.jpg",
      "https://cdn.example.com/ref-2.jpg",
    ]);
    expect(payload.extraParams).toMatchObject({
      image_urls: ["https://cdn.example.com/ref-1.jpg"],
      image_input: ["https://cdn.example.com/ref-1.jpg"],
    });
  });

  it("omits referenceImageUrls when no reference images are provided", () => {
    const payload = buildMediaStudioCommonPayload({
      prompt: "A clean product shot",
      aspectRatio: "16:9",
      referenceImages: [],
    });

    expect(payload.referenceImageUrls).toBeUndefined();
  });

  it("includes referenceVideoUrls when reference videos are provided", () => {
    const payload = buildMediaStudioCommonPayload({
      prompt: "A cinematic motion edit",
      aspectRatio: "16:9",
      referenceImages: [],
      referenceVideos: [
        { url: "https://cdn.example.com/ref-video-1.mp4" },
        { url: "https://cdn.example.com/ref-video-2.mp4" },
      ],
    });

    expect(payload.referenceVideoUrls).toEqual([
      "https://cdn.example.com/ref-video-1.mp4",
      "https://cdn.example.com/ref-video-2.mp4",
    ]);
  });
});
