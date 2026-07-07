import { describe, expect, it } from "vitest";
import {
  CREATE_SERIES_FIELD_LIMITS,
  clampToCreateSeriesLimit,
} from "./createSeriesFieldLimits";

describe("clampToCreateSeriesLimit", () => {
  it("returns undefined for empty/whitespace-only input", () => {
    expect(clampToCreateSeriesLimit(undefined, "tone")).toBeUndefined();
    expect(clampToCreateSeriesLimit("", "tone")).toBeUndefined();
    expect(clampToCreateSeriesLimit("   ", "tone")).toBeUndefined();
  });

  it("returns the trimmed value unchanged when within the limit", () => {
    expect(clampToCreateSeriesLimit("  Warm comedy  ", "tone")).toBe("Warm comedy");
  });

  it("clamps a too-long tone string to at most the field limit, with a clean word-boundary cut", () => {
    const longTone =
      "A warm, chaotic, fast-paced Thai neighborhood service comedy with recurring customer " +
      "misunderstandings, heartfelt staff loyalty, and a dash of romantic tension that builds " +
      "gently across the whole season arc";
    expect(longTone.length).toBeGreaterThan(CREATE_SERIES_FIELD_LIMITS.tone);

    const result = clampToCreateSeriesLimit(longTone, "tone");
    expect(result).toBeDefined();
    expect(result!.length).toBeLessThanOrEqual(CREATE_SERIES_FIELD_LIMITS.tone);
    // Clean cut: must not end mid-word (no trailing partial word merged with next).
    expect(longTone.startsWith(result!)).toBe(true);
    expect(result!.endsWith(" ")).toBe(false);
  });

  it("clamps a too-long title/genre string to at most the field limit", () => {
    const longTitle = "ร้านก๋วยเตี๋ยว".repeat(20);
    expect(longTitle.length).toBeGreaterThan(CREATE_SERIES_FIELD_LIMITS.genre);

    const result = clampToCreateSeriesLimit(longTitle, "genre");
    expect(result).toBeDefined();
    expect(result!.length).toBeLessThanOrEqual(CREATE_SERIES_FIELD_LIMITS.genre);
  });

  it("hard-cuts when there is no reasonable word boundary (e.g. one long unbroken token)", () => {
    const longToken = "x".repeat(CREATE_SERIES_FIELD_LIMITS.tone + 50);
    const result = clampToCreateSeriesLimit(longToken, "tone");
    expect(result!.length).toBe(CREATE_SERIES_FIELD_LIMITS.tone);
  });
});
