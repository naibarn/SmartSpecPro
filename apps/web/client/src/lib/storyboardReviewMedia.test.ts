import { describe, expect, it } from "vitest";
import {
  extractStoryboardMediaUrl,
  getStoryboardReviewMediaState,
  isUsableStoryboardMediaUrl,
  normalizeStoryboardMediaUrl,
} from "./storyboardReviewMedia";

describe("storyboard review media URL extraction", () => {
  it("accepts internal storage URLs used by generated audio tasks", () => {
    expect(isUsableStoryboardMediaUrl("/api/storage/files/audio/generated/1/task.mp3")).toBe(true);
    expect(extractStoryboardMediaUrl({
      status: "completed",
      mediaType: "audio",
      resultUrl: "/api/storage/files/audio/generated/1/task.mp3",
    }, "audio")).toBe("/api/storage/files/audio/generated/1/task.mp3");
  });

  it("extracts audio URLs from nested provider payloads and ignores thumbnails", () => {
    expect(extractStoryboardMediaUrl({
      resultData: {
        thumbnail_url: "/api/storage/files/images/thumb.png",
        response: {
          audios: [
            { url: "/api/storage/files/audio/generated/1/dialogue.mp3" },
          ],
        },
      },
    }, "audio")).toBe("/api/storage/files/audio/generated/1/dialogue.mp3");
  });

  it("extracts audio URLs from JSON encoded resultJson", () => {
    expect(extractStoryboardMediaUrl({
      resultData: {
        resultJson: JSON.stringify({
          taskResult: {
            audios: [{ audioUrl: "https://cdn.example.com/dialogue.mp3" }],
          },
        }),
      },
    }, "audio")).toBe("https://cdn.example.com/dialogue.mp3");
  });

  it("keeps voice and video extraction separated", () => {
    const payload = {
      audio_url: "/api/storage/files/audio/generated/1/voice.mp3",
      video_url: "/api/storage/files/videos/generated/1/clip.mp4",
    };

    expect(extractStoryboardMediaUrl(payload, "audio")).toBe("/api/storage/files/audio/generated/1/voice.mp3");
    expect(extractStoryboardMediaUrl(payload, "video")).toBe("/api/storage/files/videos/generated/1/clip.mp4");
  });

  it("normalizes relative generated audio paths to the storage proxy route", () => {
    expect(normalizeStoryboardMediaUrl("tenant-1/audio/generated/7/task.mp3")).toBe("/api/storage/files/audio/generated/7/task.mp3");
  });

  it("prefers a ready R2 artifact over a stale provider result URL", () => {
    expect(extractStoryboardMediaUrl({
      resultUrl: "https://provider.example/expired.mp4",
      artifacts: [{
        outputIndex: 0,
        r2Status: "ready",
        r2Url: "/api/storage/files/media-studio/clip.mp4",
        providerStatus: "expired",
        availabilityStatus: "ready",
      }],
    }, "video")).toBe("/api/storage/files/media-studio/clip.mp4");
  });

  it("does not revive an expired provider URL", () => {
    const item = {
      resultUrl: "https://provider.example/expired.mp4",
      artifacts: [{
        outputIndex: 0,
        r2Status: "failed",
        providerStatus: "expired",
        availabilityStatus: "provider_expired",
      }],
    };
    expect(extractStoryboardMediaUrl(item, "video")).toBeNull();
    expect(getStoryboardReviewMediaState(item, true)?.tone).toBe("expired");
  });
});
