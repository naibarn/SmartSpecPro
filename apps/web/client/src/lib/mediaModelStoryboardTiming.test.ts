import { describe, expect, it } from "vitest";

import { resolveStoryboardClipDurationSeconds } from "./mediaModelStoryboardTiming";

describe("resolveStoryboardClipDurationSeconds", () => {
  it("uses storyboardClipDurationSeconds from model config before selected duration", () => {
    expect(resolveStoryboardClipDurationSeconds({
      model: { configJson: { storyboardClipDurationSeconds: 10 }, durations: [5] },
      selectedDurationSeconds: 8,
    })).toBe(10);
  });

  it("supports string JSON config and snake_case keys", () => {
    expect(resolveStoryboardClipDurationSeconds({
      model: { configJson: JSON.stringify({ storyboard_clip_duration_seconds: "8" }) },
    })).toBe(8);
  });

  it("uses maxDuration as a legacy model config fallback", () => {
    expect(resolveStoryboardClipDurationSeconds({
      model: { configJson: { maxDuration: 8 } },
    })).toBe(8);
  });

  it("falls back to selected duration, supported durations, then explicit fallback", () => {
    expect(resolveStoryboardClipDurationSeconds({
      model: { durations: [6, 8] },
      selectedDurationSeconds: 12,
      fallbackSeconds: 7,
    })).toBe(12);
    expect(resolveStoryboardClipDurationSeconds({
      model: { durations: [6, 8] },
      fallbackSeconds: 7,
    })).toBe(6);
    expect(resolveStoryboardClipDurationSeconds({
      fallbackSeconds: 7,
    })).toBe(7);
  });
});
