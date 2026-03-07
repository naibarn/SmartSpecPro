import { describe, expect, it } from "vitest";
import {
  fitSlidesToProjectAudioDuration,
  resolveProjectAudioPlayableDurationMs,
} from "./presentationTiming";

describe("resolveProjectAudioPlayableDurationMs", () => {
  it("uses explicit trim end when available", () => {
    expect(resolveProjectAudioPlayableDurationMs(
      { startAtMs: 2_000, endAtMs: 11_500 },
      20_000,
    )).toBe(9_500);
  });

  it("falls back to source duration when trim end is not set", () => {
    expect(resolveProjectAudioPlayableDurationMs(
      { startAtMs: 1_000, endAtMs: null },
      8_500,
    )).toBe(7_500);
  });

  it("returns null when trimmed range is invalid", () => {
    expect(resolveProjectAudioPlayableDurationMs(
      { startAtMs: 6_000, endAtMs: 2_000 },
      20_000,
    )).toBeNull();
    expect(resolveProjectAudioPlayableDurationMs(
      { startAtMs: 10_000, endAtMs: null },
      8_000,
    )).toBeNull();
  });
});

describe("fitSlidesToProjectAudioDuration", () => {
  it("distributes durations across non-video slides to match target total", () => {
    const result = fitSlidesToProjectAudioDuration({
      targetAudioDurationMs: 10_000,
      slides: [
        { slideId: 1, currentDurationMs: 3_000, hasVideo: false, videoDurationMs: null },
        { slideId: 2, currentDurationMs: 3_000, hasVideo: false, videoDurationMs: null },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.durationBySlideId.get(1)).toBe(5_000);
    expect(result.durationBySlideId.get(2)).toBe(5_000);
  });

  it("locks video slides and adjusts only the remaining slides", () => {
    const result = fitSlidesToProjectAudioDuration({
      targetAudioDurationMs: 14_000,
      slides: [
        { slideId: 1, currentDurationMs: 3_000, hasVideo: true, videoDurationMs: 8_000 },
        { slideId: 2, currentDurationMs: 3_000, hasVideo: false, videoDurationMs: null },
        { slideId: 3, currentDurationMs: 3_000, hasVideo: false, videoDurationMs: null },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lockedVideoSlideIds).toEqual([1]);
    expect(result.durationBySlideId.get(1)).toBe(8_000);
    expect(result.durationBySlideId.get(2)).toBe(3_000);
    expect(result.durationBySlideId.get(3)).toBe(3_000);
  });

  it("fails when a video slide duration cannot be resolved", () => {
    const result = fitSlidesToProjectAudioDuration({
      targetAudioDurationMs: 10_000,
      slides: [
        { slideId: 1, currentDurationMs: 3_000, hasVideo: true, videoDurationMs: null },
        { slideId: 2, currentDurationMs: 3_000, hasVideo: false, videoDurationMs: null },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      code: "video_duration_unknown",
      slideIds: [1],
    });
  });

  it("fails when locked video total is longer than project audio", () => {
    const result = fitSlidesToProjectAudioDuration({
      targetAudioDurationMs: 5_000,
      slides: [
        { slideId: 1, currentDurationMs: 3_000, hasVideo: true, videoDurationMs: 8_000 },
        { slideId: 2, currentDurationMs: 3_000, hasVideo: false, videoDurationMs: null },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      code: "target_shorter_than_locked_slides",
      lockedDurationMs: 8_000,
    });
  });

  it("fails when target cannot fit adjustable slide bounds", () => {
    const result = fitSlidesToProjectAudioDuration({
      targetAudioDurationMs: 10_000,
      minSlideDurationMs: 250,
      maxSlideDurationMs: 1_000,
      slides: [
        { slideId: 1, currentDurationMs: 400, hasVideo: true, videoDurationMs: 400 },
        { slideId: 2, currentDurationMs: 500, hasVideo: false, videoDurationMs: null },
        { slideId: 3, currentDurationMs: 500, hasVideo: false, videoDurationMs: null },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      code: "target_outside_adjustable_range",
      minAdjustableDurationMs: 500,
      maxAdjustableDurationMs: 2_000,
    });
  });

  it("supports decks with only locked video slides when total already matches", () => {
    const result = fitSlidesToProjectAudioDuration({
      targetAudioDurationMs: 12_000,
      slides: [
        { slideId: 1, currentDurationMs: 6_000, hasVideo: true, videoDurationMs: 5_000 },
        { slideId: 2, currentDurationMs: 6_000, hasVideo: true, videoDurationMs: 4_000 },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.durationBySlideId.get(1)).toBe(6_000);
    expect(result.durationBySlideId.get(2)).toBe(6_000);
  });
});
