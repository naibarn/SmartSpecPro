import { describe, expect, it } from "vitest";
import {
  buildGeminiOmniProviderExtraParams,
  GEMINI_OMNI_VOICE_PRESETS,
  getGeminiOmniVoicePreset,
  isGeminiOmniVoicePresetId,
  normalizeGeminiOmniVideoList,
  validateGeminiOmniProductionNodeCapability,
  validateGeminiOmniVideoInput,
} from "./geminiOmni";

describe("geminiOmni shared contract", () => {
  it("normalizes provider video_list and preserves Kie ends spelling", () => {
    expect(normalizeGeminiOmniVideoList([
      { videoUrl: "https://cdn.example.com/in.mp4", startTime: 1, end: 3 },
    ])).toEqual([
      { url: "https://cdn.example.com/in.mp4", start: 1, ends: 3 },
    ]);
  });

  it("accepts a valid mixed-reference video request under the seven-unit limit", () => {
    const result = validateGeminiOmniVideoInput({
      prompt: "Cinematic product demo",
      imageUrls: ["https://cdn.example.com/a.png", "/api/storage/files/chat/uploads/ref-b.png"],
      videoList: [{ url: "/uploads/source.mp4", durationSeconds: 24 }],
      characterIds: ["char_1", "char_2"],
      audioIds: ["audio_1"],
      duration: "10s",
      resolution: "4K",
    });

    expect(result.ok).toBe(true);
    expect(result.normalized).toMatchObject({
      duration: "10",
      resolution: "4K",
      referenceUnitCount: 6,
      hasSourceVideo: true,
      pricingPresenceLabel: "with-video",
      pricingDurationKey: "10s",
    });
  });

  it("accepts case-insensitive 4K resolution aliases without reporting unsupported resolution", () => {
    const result = validateGeminiOmniVideoInput({
      prompt: "Cinematic product demo",
      duration: "4s",
      resolution: "4k",
    });

    expect(result.ok).toBe(true);
    expect(result.normalized.resolution).toBe("4K");
  });

  it("rejects unsupported resolutions instead of silently defaulting the request", () => {
    const result = validateGeminiOmniVideoInput({
      prompt: "Cinematic product demo",
      duration: "4s",
      resolution: "2K",
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("unsupported_resolution");
    expect(result.normalized.resolution).toBe("1080p");
  });

  it("rejects over-quota references and multiple source videos before credits are reserved", () => {
    const result = validateGeminiOmniVideoInput({
      prompt: "Over quota",
      imageUrls: [
        "https://cdn.example.com/1.png",
        "https://cdn.example.com/2.png",
        "https://cdn.example.com/3.png",
        "https://cdn.example.com/4.png",
      ],
      videoList: [
        "https://cdn.example.com/a.mp4",
        "https://cdn.example.com/b.mp4",
      ],
      characterIds: ["char1"],
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "too_many_videos",
      "reference_unit_limit",
    ]));
  });

  it("builds provider extra params without exposing UI-only labels", () => {
    expect(buildGeminiOmniProviderExtraParams({
      prompt: "Shot",
      imageUrls: ["https://cdn.example.com/a.png"],
      videoList: [{ url: "https://cdn.example.com/source.mp4", start: 1, end: 7, durationSeconds: 20 }],
      duration: 4,
      resolution: "1080p",
    })).toMatchObject({
      image_urls: ["https://cdn.example.com/a.png"],
      video_list: [{ url: "https://cdn.example.com/source.mp4", start: 1, ends: 7 }],
      duration: "4",
      resolution: "1080p",
      gemini_omni_contract_version: "1.0.0",
    });
  });

  it("rejects invalid source video duration and trim windows", () => {
    const tooLong = validateGeminiOmniVideoInput({
      prompt: "Shot",
      videoList: [{ url: "https://cdn.example.com/source.mp4", durationSeconds: 31 }],
      duration: 4,
      resolution: "1080p",
    });
    const invalidTrim = validateGeminiOmniVideoInput({
      prompt: "Shot",
      videoList: [{ url: "https://cdn.example.com/source.mp4", start: 2, ends: 14 }],
      duration: 4,
      resolution: "1080p",
    });

    expect(tooLong.issues.map((issue) => issue.code)).toContain("source_video_too_long");
    expect(invalidTrim.issues.map((issue) => issue.code)).toContain("invalid_video_trim");
  });

  it("rejects unsafe local media URLs while allowing tenant upload paths", () => {
    const result = validateGeminiOmniVideoInput({
      prompt: "Shot",
      imageUrls: ["/uploads/ref.png"],
      videoList: [{ url: "http://localhost:3000/source.mp4" }],
      duration: 4,
      resolution: "1080p",
    });

    expect(result.issues.map((issue) => issue.code)).toContain("invalid_video_url");
  });

  it("exposes Kie Gemini Omni voice presets as a validated shared contract", () => {
    expect(GEMINI_OMNI_VOICE_PRESETS.length).toBe(30);
    expect(isGeminiOmniVoicePresetId("achernar")).toBe(true);
    expect(isGeminiOmniVoicePresetId("narrator_main")).toBe(false);
    expect(getGeminiOmniVoicePreset("zephyr")).toMatchObject({
      id: "zephyr",
      gender: "female",
      tone: "bright",
    });
    expect(GEMINI_OMNI_VOICE_PRESETS.every((preset) => preset.description.length >= 80)).toBe(true);
  });

  it("validates production node references through the same Gemini Omni provider limits", () => {
    const result = validateGeminiOmniProductionNodeCapability({
      prompt: "Cinematic marketplace demo",
      duration: "8s",
      resolution: "1080p",
      references: [
        { kind: "product_image", url: "https://cdn.example.com/product.png", providerPayloadKey: "image_urls" },
        { kind: "reference_image", url: "https://cdn.example.com/scene.png", providerPayloadKey: "image_urls" },
        { kind: "source_video", url: "https://cdn.example.com/source.mp4", providerPayloadKey: "video_list" },
        { kind: "character_asset", assetId: "char_1", providerPayloadKey: "character_ids" },
        { kind: "audio_asset", assetId: "audio_1", providerPayloadKey: "audio_ids" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.normalized).toMatchObject({
      imageUrls: ["https://cdn.example.com/product.png", "https://cdn.example.com/scene.png"],
      characterIds: ["char_1"],
      audioIds: ["audio_1"],
      hasSourceVideo: true,
      referenceUnitCount: 5,
    });
  });
});
