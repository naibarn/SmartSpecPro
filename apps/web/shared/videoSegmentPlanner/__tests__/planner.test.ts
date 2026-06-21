import { describe, expect, it } from "vitest";

import { planVideoSegments } from "../planner";
import type { VideoModelSegmentCapability, VideoSegmentPlannerShot } from "../contracts";

function shots(count: number): VideoSegmentPlannerShot[] {
  return Array.from({ length: count }, (_, index) => ({
    shotId: `shot-${index + 1}`,
    index,
    durationSeconds: 3,
    storyboardFrameUrl: `https://example.com/${index + 1}.png`,
  }));
}

const multiCapability: VideoModelSegmentCapability = {
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

describe("planVideoSegments", () => {
  it("creates one segment per shot in per-shot mode", () => {
    const plan = planVideoSegments({
      sourceSurface: "marketplace_capture",
      mode: "per_shot",
      videoModelId: "veo-3.1-lite",
      transport: "gateway_api",
      audioStrategy: "silent",
      referenceMode: "single_storyboard_frame",
      shots: shots(3),
    });

    expect(plan.segments).toHaveLength(3);
    expect(plan.segments.map((segment) => segment.shotIds)).toEqual([
      ["shot-1"],
      ["shot-2"],
      ["shot-3"],
    ]);
  });

  it("groups adjacent shots adaptively within capability limits", () => {
    const plan = planVideoSegments({
      sourceSurface: "marketplace_capture",
      mode: "adaptive_multi_shot",
      videoModelId: "seedance-2",
      transport: "gateway_api",
      audioStrategy: "separate_tts_voiceover",
      referenceMode: "segment_start_end",
      capability: multiCapability,
      shots: shots(9),
    });

    expect(plan.effectiveMode).toBe("adaptive_multi_shot");
    expect(plan.segments.map((segment) => segment.shotIds)).toEqual([
      ["shot-1", "shot-2", "shot-3"],
      ["shot-4", "shot-5", "shot-6"],
      ["shot-7", "shot-8", "shot-9"],
    ]);
  });

  it("clamps manual groups to maxSubShotsPerSegment and duration", () => {
    const plan = planVideoSegments({
      sourceSurface: "marketplace_capture",
      mode: "manual_group_size",
      manualGroupSize: 9,
      videoModelId: "seedance-2",
      transport: "gateway_api",
      audioStrategy: "separate_tts_voiceover",
      referenceMode: "segment_start_end",
      capability: multiCapability,
      shots: shots(9),
    });

    expect(plan.segments.every((segment) => segment.shotIds.length <= 5)).toBe(
      true
    );
  });

  it("falls back to per-shot when multi-shot is unsupported", () => {
    const plan = planVideoSegments({
      sourceSurface: "marketplace_capture",
      mode: "compact_multi_shot",
      videoModelId: "unknown",
      transport: "gateway_api",
      audioStrategy: "silent",
      referenceMode: "single_storyboard_frame",
      shots: shots(2),
    });

    expect(plan.effectiveMode).toBe("per_shot");
    expect(plan.fallbackReason).toBe("selected_model_does_not_support_multi_shot");
    expect(plan.warnings[0]?.code).toBe("multi_shot_not_supported");
  });

  it("creates deterministic segment IDs and plan hash", () => {
    const input = {
      sourceSurface: "marketplace_capture" as const,
      mode: "per_shot" as const,
      videoModelId: "veo-3.1-lite",
      transport: "gateway_api" as const,
      audioStrategy: "silent" as const,
      referenceMode: "single_storyboard_frame" as const,
      shots: shots(2),
    };

    expect(planVideoSegments(input)).toEqual(planVideoSegments(input));
  });
});
