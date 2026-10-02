import type { EmergencyTriageAdvisory } from "./triage";

export type EmergencyCaseReviewKind = "verification" | "reassessment" | "no_response";

export function requiredEmergencyCaseReviews(advisory: EmergencyTriageAdvisory): readonly EmergencyCaseReviewKind[] {
  const required: EmergencyCaseReviewKind[] = [];
  if (advisory.verificationRequired) required.push("verification");
  if (advisory.reassessmentRequired) required.push("reassessment");
  return required;
}
