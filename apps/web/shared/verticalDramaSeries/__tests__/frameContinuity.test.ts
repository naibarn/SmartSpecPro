import { describe, expect, it } from "vitest";
import {
  evaluateSceneContinuityAnalysis,
  sceneContinuityAnalysisSchema,
} from "../frameContinuity";

describe("frame continuity QC contract", () => {
  it("normalizes all continuity drift into advisory warnings", () => {
    const result = evaluateSceneContinuityAnalysis({
      location_match: "different_place",
      lighting_match: "different_time",
      wardrobe_match: [{ character: "A", verdict: "changed" }],
      prop_persistence: [{ name: "lamp", expected: true, present: false }],
      staging_axis_ok: false,
      notes: ["visible mismatch"],
    });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(0.5);
    expect(result.issues.map(issue => issue.issueId)).toEqual([
      "scene_location_mismatch",
      "scene_lighting_mismatch",
      "scene_wardrobe_mismatch",
      "scene_prop_missing",
      "scene_axis_flip",
    ]);
    expect(result.issues.every(issue => issue.severity === "warning")).toBe(true);
  });

  it("fails open when the vision response is unavailable", () => {
    expect(evaluateSceneContinuityAnalysis(undefined)).toEqual({
      passed: true,
      score: 1,
      issues: [expect.objectContaining({ issueId: "scene_qc_unavailable" })],
    });
  });

  it("accepts the strict scene-continuity response shape", () => {
    expect(sceneContinuityAnalysisSchema.safeParse({
      location_match: "match",
      lighting_match: "minor_drift",
      wardrobe_match: [],
      prop_persistence: [],
      staging_axis_ok: true,
      notes: [],
    }).success).toBe(true);
  });
});
