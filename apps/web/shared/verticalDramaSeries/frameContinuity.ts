/** Browser-safe Feature 137/138 frame-continuity contracts and evaluation. */

import { z } from "zod";

export const sceneContinuityAnalysisSchema = z.object({
  location_match: z.enum(["match", "minor_drift", "different_place"]),
  lighting_match: z.enum(["match", "minor_drift", "different_time"]),
  wardrobe_match: z.array(
    z.object({
      character: z.string().trim().min(1).max(200),
      verdict: z.enum(["match", "changed"]),
    }).passthrough(),
  ).max(20),
  prop_persistence: z.array(
    z.object({
      name: z.string().trim().min(1).max(200),
      expected: z.boolean(),
      present: z.boolean(),
    }).passthrough(),
  ).max(40),
  staging_axis_ok: z.boolean(),
  notes: z.array(z.string().trim().min(1).max(500)).max(20),
});

export type SceneContinuityAnalysis = z.infer<typeof sceneContinuityAnalysisSchema>;

export type FrameContinuityQcIssue = {
  issueId:
  | "scene_location_mismatch"
  | "scene_lighting_mismatch"
  | "scene_wardrobe_mismatch"
  | "scene_prop_missing"
  | "scene_axis_flip"
  | "scene_qc_unavailable";
  severity: "warning";
  message: string;
  evidence?: string;
};

export type FrameContinuityQcEvaluation = {
  passed: true;
  score: number;
  issues: FrameContinuityQcIssue[];
};

/** Deterministic, fail-open mapping from a vision result to warning badges. */
export function evaluateSceneContinuityAnalysis(
  analysis: SceneContinuityAnalysis | undefined,
): FrameContinuityQcEvaluation {
  if (!analysis) {
    return {
      passed: true,
      score: 1,
      issues: [{
        issueId: "scene_qc_unavailable",
        severity: "warning",
        message: "Scene continuity analysis was unavailable; no render was blocked.",
      }],
    };
  }
  const issues: FrameContinuityQcIssue[] = [];
  if (analysis.location_match !== "match") {
    issues.push({
      issueId: "scene_location_mismatch",
      severity: "warning",
      message: analysis.location_match === "different_place"
        ? "The frame appears to be a different place from the scene anchor."
        : "The frame has minor location drift from the scene anchor.",
      evidence: analysis.notes.join(" ").slice(0, 500) || undefined,
    });
  }
  if (analysis.lighting_match !== "match") {
    issues.push({
      issueId: "scene_lighting_mismatch",
      severity: "warning",
      message: analysis.lighting_match === "different_time"
        ? "The frame appears to use a different time-of-day lighting state."
        : "The frame has minor lighting drift from the scene anchor.",
    });
  }
  const changedWardrobe = analysis.wardrobe_match.filter(item => item.verdict === "changed");
  if (changedWardrobe.length > 0) {
    issues.push({
      issueId: "scene_wardrobe_mismatch",
      severity: "warning",
      message: `Wardrobe drift detected for ${changedWardrobe.map(item => item.character).join(", ")}.`,
    });
  }
  for (const prop of analysis.prop_persistence.filter(item => item.expected && !item.present)) {
    issues.push({
      issueId: "scene_prop_missing",
      severity: "warning",
      message: `Expected scene prop is missing: ${prop.name}.`,
    });
  }
  if (!analysis.staging_axis_ok) {
    issues.push({
      issueId: "scene_axis_flip",
      severity: "warning",
      message: "The staging axis appears to flip relative to the scene anchor.",
    });
  }
  return {
    passed: true,
    score: Math.max(0, Math.min(1, 1 - issues.length * 0.1)),
    issues,
  };
}
