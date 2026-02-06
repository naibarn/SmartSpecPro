/**
 * Tests for time unit migration (seconds -> milliseconds)
 * and project version upgrade (1.0 -> 2.0).
 */
import { describe, it, expect } from "vitest";
import {
  createEmptyProject,
  migrateProjectV1ToV2,
  formatTimeMs,
  calculateProjectDurationMs,
} from "../videoEditor";

describe("Time Unit Migration", () => {
  it("migrateProjectV1ToV2 converts all seconds fields to milliseconds", () => {
    const v1 = createEmptyProject("Test");
    // Add a track with a clip that has seconds-based fields
    v1.timeline.tracks[0].clips.push({
      id: "clip-1",
      assetId: "asset-1",
      trackId: "track-v1",
      startTime: 5.5,
      duration: 10.0,
      trimIn: 1.0,
      trimOut: 9.0,
      volume: 1.0,
      speed: 1.0,
      effects: [],
      transitions: { fadeIn: 0.5, fadeOut: 0.3 },
    });
    v1.settings.duration = 15.5;

    const v2 = migrateProjectV1ToV2(v1);

    expect(v2.version).toBe("2.0");
    // settings.durationMs should be 15500
    expect(v2.settings.durationMs).toBe(15500);
    // clip fields should be converted
    const clip = v2.timeline.tracks[0].clips[0];
    expect(clip.startMs).toBe(5500);
    expect(clip.durationMs).toBe(10000);
    expect(clip.inMs).toBe(1000);
    expect(clip.outMs).toBe(9000);
    expect(clip.transitions?.fadeInMs).toBe(500);
    expect(clip.transitions?.fadeOutMs).toBe(300);
  });

  it("migrateProjectV1ToV2 sets version to 2.0", () => {
    const v1 = createEmptyProject("V1 Project");
    expect(v1.version).toBe("1.0");

    const v2 = migrateProjectV1ToV2(v1);
    expect(v2.version).toBe("2.0");
  });

  it("migrateProjectV1ToV2 is idempotent on v2.0 projects", () => {
    const v1 = createEmptyProject("Test");
    v1.timeline.tracks[0].clips.push({
      id: "clip-1",
      assetId: "asset-1",
      trackId: "track-v1",
      startTime: 2.0,
      duration: 5.0,
      trimIn: 0,
      trimOut: 5.0,
      volume: 1.0,
      speed: 1.0,
      effects: [],
    });

    const v2 = migrateProjectV1ToV2(v1);
    const v2Again = migrateProjectV1ToV2(v2);

    // Should be identical — no double conversion
    expect(v2Again.version).toBe("2.0");
    const clip = v2Again.timeline.tracks[0].clips[0];
    expect(clip.startMs).toBe(2000);
    expect(clip.durationMs).toBe(5000);
  });

  it("formatTimeMs displays milliseconds in MM:SS.CC format", () => {
    expect(formatTimeMs(0)).toBe("0:00.00");
    expect(formatTimeMs(65500)).toBe("1:05.50");
    expect(formatTimeMs(1000)).toBe("0:01.00");
    expect(formatTimeMs(3661000)).toBe("1:01:01.00");
    expect(formatTimeMs(500)).toBe("0:00.50");
  });

  it("calculateProjectDurationMs computes from ms-based clips", () => {
    const v1 = createEmptyProject("Test");
    const v2 = migrateProjectV1ToV2(v1);

    // Add clips manually as v2 format
    v2.timeline.tracks[0].clips.push({
      id: "clip-1",
      assetId: "a1",
      trackId: "track-v1",
      startMs: 0,
      durationMs: 5000,
      inMs: 0,
      outMs: 5000,
      volume: 1.0,
      speed: 1.0,
      effects: [],
    } as any);
    v2.timeline.tracks[0].clips.push({
      id: "clip-2",
      assetId: "a2",
      trackId: "track-v1",
      startMs: 5000,
      durationMs: 3000,
      inMs: 0,
      outMs: 3000,
      volume: 1.0,
      speed: 1.0,
      effects: [],
    } as any);

    expect(calculateProjectDurationMs(v2.timeline)).toBe(8000);
  });
});
