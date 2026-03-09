import { describe, expect, it } from "vitest";

import {
  applyMediaMotionEasing,
  computeMediaMotionFrame,
  computeMediaMotionPlaybackProgress,
  computeMediaMotionTimelineFrame,
  hasActiveMediaMotion,
  normalizeMediaMotion,
  serializeMediaMotion,
} from "./mediaMotion";

describe("presentation media motion helpers", () => {
  it("normalizes missing motion to a safe no-op default", () => {
    expect(normalizeMediaMotion(undefined)).toEqual({
      intro: {
        preset: "none",
        intensity: 0.6,
        easing: "ease-in-out",
        timingMode: "duration",
        durationMs: 3000,
      },
      outro: {
        preset: "none",
        intensity: 0.6,
        easing: "ease-in-out",
        timingMode: "duration",
        durationMs: 3000,
      },
    });
  });

  it("reports active motion for non-none presets", () => {
    expect(hasActiveMediaMotion({ preset: "zoom-in" })).toBe(true);
    expect(hasActiveMediaMotion({ preset: "none" })).toBe(false);
    expect(hasActiveMediaMotion({
      intro: { preset: "none" },
      outro: { preset: "pan-left" },
    })).toBe(true);
  });

  it("normalizes unknown presets and invalid easing to safe inactive defaults", () => {
    expect(normalizeMediaMotion({
      preset: "garbage" as any,
      intensity: Number.NaN,
      easing: "weird" as any,
    })).toEqual({
      intro: {
        preset: "none",
        intensity: 0.6,
        easing: "ease-in-out",
        timingMode: "duration",
        durationMs: 3000,
      },
      outro: {
        preset: "none",
        intensity: 0.6,
        easing: "ease-in-out",
        timingMode: "duration",
        durationMs: 3000,
      },
    });
    expect(hasActiveMediaMotion({ preset: "garbage" as any, easing: "linear" })).toBe(false);
  });

  it("caps legacy playback progress to a fixed animation window for long slides", () => {
    expect(computeMediaMotionPlaybackProgress(1000, 10_000)).toBeCloseTo(1 / 3, 3);
    expect(computeMediaMotionPlaybackProgress(3000, 10_000)).toBe(1);
    expect(computeMediaMotionPlaybackProgress(1000, 2000)).toBeCloseTo(0.5, 3);
  });

  it("normalizes intro/outro segment timing fields", () => {
    expect(normalizeMediaMotion({
      intro: {
        preset: "zoom-in",
        timingMode: "until-slide-end",
      },
      outro: {
        preset: "pan-right",
        durationMs: 2000,
      },
    })).toEqual({
      intro: {
        preset: "zoom-in",
        intensity: 0.6,
        easing: "ease-in-out",
        timingMode: "until-slide-end",
        durationMs: 3000,
      },
      outro: {
        preset: "pan-right",
        intensity: 0.6,
        easing: "ease-in-out",
        timingMode: "duration",
        durationMs: 2000,
      },
    });
  });

  it("serializes inactive intro/outro motion back to undefined", () => {
    expect(serializeMediaMotion(normalizeMediaMotion(undefined))).toBeUndefined();
  });

  it("computes a stable zoom-in frame", () => {
    const frame = computeMediaMotionFrame(
      { preset: "zoom-in", intensity: 1, easing: "linear" },
      0.5,
    );

    expect(frame.scaleMultiplier).toBeCloseTo(1.09);
    expect(frame.translateXPercent).toBe(0);
    expect(frame.translateYPercent).toBe(0);
  });

  it("computes a stable zoom-out frame", () => {
    const frame = computeMediaMotionFrame(
      { preset: "zoom-out", intensity: 1, easing: "linear" },
      0.25,
    );

    expect(frame.scaleMultiplier).toBeCloseTo(1.135);
    expect(frame.translateXPercent).toBe(0);
    expect(frame.translateYPercent).toBe(0);
  });

  it("computes pan presets across multiple directions", () => {
    expect(computeMediaMotionFrame(
      { preset: "pan-left", intensity: 1, easing: "linear" },
      0.5,
    ).translateXPercent).toBeCloseTo(-6);
    expect(computeMediaMotionFrame(
      { preset: "pan-right", intensity: 1, easing: "linear" },
      0.5,
    ).translateXPercent).toBeCloseTo(6);
    expect(computeMediaMotionFrame(
      { preset: "pan-up", intensity: 1, easing: "linear" },
      0.5,
    ).translateYPercent).toBeCloseTo(-6);
    expect(computeMediaMotionFrame(
      { preset: "pan-down", intensity: 1, easing: "linear" },
      0.5,
    ).translateYPercent).toBeCloseTo(6);
  });

  it("adds deterministic overscan for pan presets including diagonal paths", () => {
    const cardinal = computeMediaMotionFrame(
      { preset: "pan-right", intensity: 1, easing: "linear" },
      0.5,
    );
    const diagonal = computeMediaMotionFrame(
      { preset: "pan-up-right", intensity: 1, easing: "linear" },
      0.5,
    );

    expect(cardinal.scaleMultiplier).toBeGreaterThan(1);
    expect(diagonal.scaleMultiplier).toBeGreaterThan(cardinal.scaleMultiplier);
    expect(diagonal.translateXPercent).toBeCloseTo(6);
    expect(diagonal.translateYPercent).toBeCloseTo(-6);
  });

  it("clamps progress before applying easing", () => {
    expect(applyMediaMotionEasing({ preset: "zoom-in", easing: "linear" }, -5)).toBe(0);
    expect(applyMediaMotionEasing({ preset: "zoom-in", easing: "linear" }, 5)).toBe(1);
  });

  it("computes intro motion over a custom duration window", () => {
    const frame = computeMediaMotionTimelineFrame(
      {
        intro: {
          preset: "zoom-in",
          intensity: 1,
          easing: "linear",
          timingMode: "duration",
          durationMs: 2000,
        },
      },
      1000,
      10_000,
    );

    expect(frame.scaleMultiplier).toBeCloseTo(1.09);
    expect(frame.translateXPercent).toBe(0);
  });

  it("computes outro motion in the last configured seconds of the slide", () => {
    const beforeWindow = computeMediaMotionTimelineFrame(
      {
        outro: {
          preset: "pan-left",
          intensity: 1,
          easing: "linear",
          timingMode: "duration",
          durationMs: 2000,
        },
      },
      7000,
      10_000,
    );
    const inWindow = computeMediaMotionTimelineFrame(
      {
        outro: {
          preset: "pan-left",
          intensity: 1,
          easing: "linear",
          timingMode: "duration",
          durationMs: 2000,
        },
      },
      9000,
      10_000,
    );

    expect(beforeWindow.translateXPercent).toBe(0);
    expect(inWindow.translateXPercent).toBeCloseTo(-6);
  });

  it("combines intro and outro motion on the same element timeline", () => {
    const frame = computeMediaMotionTimelineFrame(
      {
        intro: {
          preset: "zoom-in",
          intensity: 1,
          easing: "linear",
          timingMode: "duration",
          durationMs: 2000,
        },
        outro: {
          preset: "pan-right",
          intensity: 1,
          easing: "linear",
          timingMode: "duration",
          durationMs: 2000,
        },
      },
      9000,
      10_000,
    );

    expect(frame.scaleMultiplier).toBeGreaterThan(1.17);
    expect(frame.translateXPercent).toBeCloseTo(6);
  });
});
