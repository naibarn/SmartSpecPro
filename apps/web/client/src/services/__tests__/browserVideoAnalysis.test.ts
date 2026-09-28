import { describe, expect, it } from "vitest";
import {
  mapMediaPipeKeypoints,
  analysisWindowDurationMs,
  probeBrowserVideoAnalysis,
  resolveAnalysisWindow,
} from "../browserVideoAnalysis";

describe("browser video analysis contract", () => {
  it("reports a deterministic capability profile and maps five face points", () => {
    const profile = probeBrowserVideoAnalysis();
    expect(profile.capabilityFingerprint).toContain(profile.modelFingerprint);
    const evidence = mapMediaPipeKeypoints(
      [
        { x: 0.4, y: 0.4 },
        { x: 0.6, y: 0.4 },
        { x: 0.5, y: 0.5 },
        { x: 0.5, y: 0.6 },
      ],
      { x: 0.5, y: 0.5 },
      0.9,
      "face-1",
      1000,
      { x: 0.35, y: 0.3, width: 0.3, height: 0.4 }
    );
    expect(Object.keys(evidence.points)).toHaveLength(5);
    expect(evidence.trackId).toBe("face-1");
  });

  it("clamps trim analysis to source time and returns a clip-relative window", () => {
    expect(resolveAnalysisWindow(30_000, 4_000, 10_000)).toEqual({
      startTimeMs: 4_000,
      endTimeMs: 10_000,
    });
    expect(resolveAnalysisWindow(30_000, -2_000, 40_000)).toEqual({
      startTimeMs: 0,
      endTimeMs: 30_000,
    });
  });

  it("keeps camera-plan duration in the same source-relative coordinate as evidence", () => {
    expect(analysisWindowDurationMs({ startTimeMs: 4_000, endTimeMs: 10_000 })).toBe(6_000);
  });
});
