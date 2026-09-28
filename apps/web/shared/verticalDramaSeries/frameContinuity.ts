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

/** Vision evidence for device-mediated presence shots. Kept separate from
 * scene continuity because a correct room/lighting match does not prove that
 * the physical handset is facing the correct direction. */
export const deviceOrientationAnalysisSchema = z.object({
  physical_handset_view: z.enum(["rear", "front", "unclear", "not_applicable"]).optional(),
  rear_camera_visible: z.boolean().optional(),
  physical_display_visible: z.boolean().optional(),
  floating_call_screen_present: z.boolean().optional(),
  remote_body_outside_device: z.boolean().optional(),
  notes: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
}).passthrough();

export type DeviceOrientationAnalysis = z.infer<typeof deviceOrientationAnalysisSchema>;

export type FrameContinuityQcIssue = {
  issueId:
  | "scene_location_mismatch"
  | "scene_lighting_mismatch"
  | "scene_wardrobe_mismatch"
  | "scene_prop_missing"
  | "scene_axis_flip"
  | "device_orientation_mismatch"
  | "device_orientation_unavailable"
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
  deviceOrientation?: DeviceOrientationAnalysis,
  deviceOrientationRequired = false,
): FrameContinuityQcEvaluation {
  const issues: FrameContinuityQcIssue[] = [];
  if (!analysis) {
    issues.push({
      issueId: "scene_qc_unavailable",
      severity: "warning",
      message: "Scene continuity analysis was unavailable; no render was blocked.",
    });
  }
  if (analysis && analysis.location_match !== "match") {
    issues.push({
      issueId: "scene_location_mismatch",
      severity: "warning",
      message: analysis.location_match === "different_place"
        ? "The frame appears to be a different place from the scene anchor."
        : "The frame has minor location drift from the scene anchor.",
      evidence: analysis.notes.join(" ").slice(0, 500) || undefined,
    });
  }
  if (analysis && analysis.lighting_match !== "match") {
    issues.push({
      issueId: "scene_lighting_mismatch",
      severity: "warning",
      message: analysis.lighting_match === "different_time"
        ? "The frame appears to use a different time-of-day lighting state."
        : "The frame has minor lighting drift from the scene anchor.",
    });
  }
  const changedWardrobe = analysis?.wardrobe_match.filter(item => item.verdict === "changed") ?? [];
  if (changedWardrobe.length > 0) {
    issues.push({
      issueId: "scene_wardrobe_mismatch",
      severity: "warning",
      message: `Wardrobe drift detected for ${changedWardrobe.map(item => item.character).join(", ")}.`,
    });
  }
  for (const prop of analysis?.prop_persistence.filter(item => item.expected && !item.present) ?? []) {
    issues.push({
      issueId: "scene_prop_missing",
      severity: "warning",
      message: `Expected scene prop is missing: ${prop.name}.`,
    });
  }
  if (analysis && !analysis.staging_axis_ok) {
    issues.push({
      issueId: "scene_axis_flip",
      severity: "warning",
      message: "The staging axis appears to flip relative to the scene anchor.",
    });
  }
  if (deviceOrientationRequired) {
    if (!deviceOrientation || deviceOrientation.physical_handset_view === "not_applicable") {
      issues.push({
        issueId: "device_orientation_unavailable",
        severity: "warning",
        message: "ไม่สามารถยืนยันได้ว่าโทรศัพท์หันด้านหลังและเห็นกล้องหลังหรือไม่",
        evidence: deviceOrientation?.notes.join(" ").slice(0, 500) || undefined,
      });
    } else if (
      deviceOrientation.physical_handset_view !== "rear" ||
      deviceOrientation.rear_camera_visible === false ||
      deviceOrientation.physical_display_visible === true ||
      deviceOrientation.floating_call_screen_present === false ||
      deviceOrientation.remote_body_outside_device === true
    ) {
      issues.push({
        issueId: "device_orientation_mismatch",
        severity: "warning",
        message: "ทิศทางโทรศัพท์ไม่ตรงกับกติกา: ต้องเห็นด้านหลังและกล้องหลัง ส่วนหน้าจอจริงต้องหันเข้าหาผู้ถือ",
        evidence: deviceOrientation.notes.join(" ").slice(0, 500) || undefined,
      });
    }
  }
  return {
    passed: true,
    score: Math.max(0, Math.min(1, 1 - issues.length * 0.1)),
    issues,
  };
}
