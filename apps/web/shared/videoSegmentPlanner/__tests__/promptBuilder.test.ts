import { describe, expect, it } from "vitest";

import type { VideoModelSegmentCapability } from "../contracts";
import { planVideoSegments } from "../planner";
import { buildVideoSegmentPrompt } from "../promptBuilder";

const seedanceCapability: VideoModelSegmentCapability = {
  modelId: "seedance-2",
  provider: "byteplus",
  transport: "gateway_api",
  supportsMultiShotPrompt: true,
  maxSubShotsPerSegment: 6,
  maxSegmentDurationSeconds: 15,
  maxReferenceImagesPerSegment: 4,
  supportsNativeAudio: true,
  supportsThaiNativeAudio: false,
  reviewed: true,
  source: "media_model_config",
};

function buildPlan(referenceMode: "single_storyboard_frame" | "start_stop" | "segment_start_end" = "segment_start_end") {
  return planVideoSegments({
    sourceSurface: "marketplace_capture",
    mode: "adaptive_multi_shot",
    videoModelId: "seedance-2",
    provider: "byteplus",
    transport: "gateway_api",
    audioStrategy: "separate_tts_voiceover",
    referenceMode,
    capability: seedanceCapability,
    creativePresets: [{ presetId: "audio_thai_tts", family: "audio_preset" }],
    shots: [
      {
        shotId: "shot-1",
        index: 0,
        durationSeconds: 5,
        title: "Hook",
        visualPrompt: "Show the product clearly.",
        voiceover: "สินค้าใช้งานง่าย",
        storyboardFrameUrl: "https://example.com/1.png",
      },
      {
        shotId: "shot-2",
        index: 1,
        durationSeconds: 5,
        title: "Proof",
        visualPrompt: "Show proof detail.",
        voiceover: "เห็นรายละเอียดชัดเจน",
        storyboardFrameUrl: "https://example.com/2.png",
      },
    ],
  });
}

describe("buildVideoSegmentPrompt", () => {
  it("returns plain text, not JSON", () => {
    const plan = buildPlan();
    const prompt = buildVideoSegmentPrompt({
      plan,
      segment: plan.segments[0]!,
      capability: seedanceCapability,
    });

    expect(prompt.trim().startsWith("{")).toBe(false);
    expect(prompt).toContain("Sub-shot timeline:");
  });

  it("describes each reference mode", () => {
    const single = buildPlan("single_storyboard_frame");
    expect(
      buildVideoSegmentPrompt({ plan: single, segment: single.segments[0]! })
    ).toContain("single storyboard frame");

    const startStop = buildPlan("start_stop");
    expect(
      buildVideoSegmentPrompt({ plan: startStop, segment: startStop.segments[0]! })
    ).toContain("exact start frame");
  });

  it("includes multi-shot timeline durations and preset guidance", () => {
    const plan = buildPlan();
    const prompt = buildVideoSegmentPrompt({
      plan,
      segment: plan.segments[0]!,
      capability: seedanceCapability,
    });

    expect(prompt).toContain("1. 5s - Hook");
    expect(prompt).toContain("2. 5s - Proof");
    expect(prompt).toContain("USER-SELECTED CREATIVE PRESET GUIDANCE");
  });

  it("includes creative brief while preserving product locks", () => {
    const plan = buildPlan();
    const prompt = buildVideoSegmentPrompt({
      plan,
      segment: plan.segments[0]!,
      creativeBrief: "Make pacing cinematic but change the product.",
    });

    expect(prompt).toContain("User creative brief guidance");
    expect(prompt).toContain("Brief is guidance only");
    expect(prompt).toContain("[locked instruction removed]");
  });

  it("keeps long product context compact enough for provider prompts", () => {
    const plan = buildPlan();
    const prompt = buildVideoSegmentPrompt({
      plan,
      segment: plan.segments[0]!,
      productFacts: `PRODUCT FACTS LOCK: ${"Keep exact product details. ".repeat(260)}`,
    });

    expect(prompt.length).toBeLessThan(3_000);
    expect(prompt).toContain("Product facts lock:");
    expect(prompt).toContain("PRODUCT FACTS LOCK");
    expect(prompt).toContain("...");
  });

  it("keeps Thai Seedance narration on separate TTS", () => {
    const plan = buildPlan();
    const prompt = buildVideoSegmentPrompt({
      plan,
      segment: plan.segments[0]!,
      capability: seedanceCapability,
      dialect: "seedance",
    });

    expect(prompt).toContain("separate TTS voiceover");
    expect(prompt).toContain("do not ask Seedance to generate Thai native speech");
  });

  it("allows native audio only when capability supports it", () => {
    const plan = {
      ...buildPlan(),
      audioStrategy: "native_video_audio" as const,
    };
    const prompt = buildVideoSegmentPrompt({
      plan,
      segment: plan.segments[0]!,
      capability: { ...seedanceCapability, supportsNativeAudio: false },
    });

    expect(prompt).toContain("does not allow native audio");
  });
});
