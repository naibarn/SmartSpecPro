import { describe, expect, it } from "vitest";
import {
  buildMediaStudioCommonPayload,
  resolveMediaStudioGenerationAspectRatio,
  syncMediaStudioAspectRatioAliases,
} from "./mediaStudioPayload";

describe("Media Studio aspect-ratio synchronization", () => {
  it("keeps the visible studio ratio authoritative over a stale hidden skill default", () => {
    expect(resolveMediaStudioGenerationAspectRatio({
      studioAspectRatio: "9:16",
    })).toBe("9:16");
  });

  it("allows the explicit specialized resolver result for Veo storyboard generation", () => {
    expect(resolveMediaStudioGenerationAspectRatio({
      studioAspectRatio: "auto",
      specializedAspectRatio: "16:9",
    })).toBe("16:9");
  });

  it("updates existing hidden aliases without manufacturing absent fields", () => {
    expect(syncMediaStudioAspectRatioAliases({
      aspectRatio: "16:9",
      aspect_ratio: "16:9",
      request: "portrait cover",
    }, "9:16")).toEqual({
      aspectRatio: "9:16",
      aspect_ratio: "9:16",
      request: "portrait cover",
    });
    expect(syncMediaStudioAspectRatioAliases({ request: "portrait cover" }, "9:16"))
      .toEqual({ request: "portrait cover" });
  });
});

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

  it("marks payloads as coming from Media Studio", () => {
    const payload = buildMediaStudioCommonPayload({
      prompt: "A polished brand campaign visual",
      aspectRatio: "9:16",
      referenceImages: [],
    });

    expect(payload.originSurface).toBe("media_studio");
  });

  it("preserves the native transparent-background provider input", () => {
    const payload = buildMediaStudioCommonPayload({
      prompt: "A product cutout",
      model: "gpt-image-2-text-to-image",
      aspectRatio: "1:1",
      referenceImages: [],
      extraParams: { background: "transparent" },
    });

    expect(payload.extraParams).toEqual({ background: "transparent" });
  });
});
