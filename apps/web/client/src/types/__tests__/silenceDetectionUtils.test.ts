/**
 * Tests for silence detection utility functions:
 * - applyBufferToRegions()
 * - dbToPercent()
 */
import { describe, it, expect } from "vitest";
import {
  applyBufferToRegions,
  dbToPercent,
  type SilentRegion,
} from "../videoEditor";

function makeRegion(overrides: Partial<SilentRegion> = {}): SilentRegion {
  return {
    id: "r1",
    trackId: "track-a1",
    startTime: 2.0,
    endTime: 8.0,
    duration: 6.0,
    adjustedStartTime: 2.0,
    adjustedEndTime: 8.0,
    adjustedDuration: 6.0,
    selected: true,
    averageDb: -45,
    skipped: false,
    ...overrides,
  };
}

describe("applyBufferToRegions", () => {
  it("returns adjusted times when buffer is applied (start + buffer, end - buffer)", () => {
    const regions = [makeRegion()];
    const result = applyBufferToRegions(regions, 0.5);

    expect(result[0].adjustedStartTime).toBe(2.5);
    expect(result[0].adjustedEndTime).toBe(7.5);
    expect(result[0].adjustedDuration).toBe(5.0);
    expect(result[0].skipped).toBe(false);
  });

  it("marks region as skipped when buffer makes adjustedEnd <= adjustedStart", () => {
    const regions = [
      makeRegion({ startTime: 5.0, endTime: 5.4, duration: 0.4 }),
    ];
    const result = applyBufferToRegions(regions, 0.3);

    expect(result[0].skipped).toBe(true);
  });

  it("sets adjustedDuration to 0 for skipped regions", () => {
    const regions = [
      makeRegion({ startTime: 5.0, endTime: 5.4, duration: 0.4 }),
    ];
    const result = applyBufferToRegions(regions, 0.3);

    expect(result[0].adjustedDuration).toBe(0);
  });

  it("handles buffer of 0 (no change to original times)", () => {
    const regions = [
      makeRegion({ startTime: 3.0, endTime: 7.0, duration: 4.0 }),
    ];
    const result = applyBufferToRegions(regions, 0);

    expect(result[0].adjustedStartTime).toBe(3.0);
    expect(result[0].adjustedEndTime).toBe(7.0);
    expect(result[0].adjustedDuration).toBe(4.0);
    expect(result[0].skipped).toBe(false);
  });

  it("handles buffer larger than half the region duration - region is skipped", () => {
    const regions = [
      makeRegion({ startTime: 10.0, endTime: 12.0, duration: 2.0 }),
    ];
    const result = applyBufferToRegions(regions, 1.5);

    expect(result[0].skipped).toBe(true);
    expect(result[0].adjustedDuration).toBe(0);
  });

  it("processes multiple regions independently", () => {
    const regions = [
      makeRegion({
        id: "r1",
        startTime: 2.0,
        endTime: 8.0,
        duration: 6.0,
      }),
      makeRegion({
        id: "r2",
        startTime: 10.0,
        endTime: 10.4,
        duration: 0.4,
      }),
    ];
    const result = applyBufferToRegions(regions, 0.5);

    expect(result[0].skipped).toBe(false);
    expect(result[0].adjustedDuration).toBe(5.0);
    expect(result[1].skipped).toBe(true);
    expect(result[1].adjustedDuration).toBe(0);
  });

  it("preserves original startTime/endTime/duration fields", () => {
    const regions = [makeRegion()];
    const result = applyBufferToRegions(regions, 0.5);

    expect(result[0].startTime).toBe(2.0);
    expect(result[0].endTime).toBe(8.0);
    expect(result[0].duration).toBe(6.0);
  });

  it("handles empty regions array - returns empty array", () => {
    const result = applyBufferToRegions([], 0.5);
    expect(result).toEqual([]);
  });

  it("returns new object references (does not mutate input)", () => {
    const regions = [makeRegion()];
    const result = applyBufferToRegions(regions, 0.5);

    expect(result).not.toBe(regions);
    expect(result[0]).not.toBe(regions[0]);
    expect(regions[0].adjustedStartTime).toBe(2.0);
  });

  it("marks region as skipped when buffer equals exactly half the duration", () => {
    const regions = [
      makeRegion({ startTime: 4.0, endTime: 6.0, duration: 2.0 }),
    ];
    const result = applyBufferToRegions(regions, 1.0);

    expect(result[0].skipped).toBe(true);
    expect(result[0].adjustedDuration).toBe(0);
  });

  it("clamps negative buffer to 0", () => {
    const regions = [makeRegion()];
    const result = applyBufferToRegions(regions, -1.0);

    expect(result[0].adjustedStartTime).toBe(2.0);
    expect(result[0].adjustedEndTime).toBe(8.0);
  });

  it("adjustedStartTime is never negative even when buffer exceeds startTime", () => {
    // startTime + buffer is always >= 0 when both are >= 0,
    // but the clamp protects against edge cases
    const regions = [
      makeRegion({ startTime: 0.0, endTime: 5.0, duration: 5.0 }),
    ];
    const result = applyBufferToRegions(regions, 0.5);

    expect(result[0].adjustedStartTime).toBeGreaterThanOrEqual(0);
    expect(result[0].adjustedStartTime).toBe(0.5);
    expect(result[0].adjustedEndTime).toBe(4.5);
  });
});

describe("dbToPercent", () => {
  it("-60dB maps to 0%", () => {
    expect(dbToPercent(-60)).toBe(0);
  });

  it("-10dB maps to 100%", () => {
    expect(dbToPercent(-10)).toBe(100);
  });

  it("-35dB maps to 50%", () => {
    expect(dbToPercent(-35)).toBe(50);
  });

  it("values outside range still compute (no clamping)", () => {
    expect(dbToPercent(-70)).toBeLessThan(0);
    expect(dbToPercent(0)).toBeGreaterThan(100);
  });
});
