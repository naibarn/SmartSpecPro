export type EmergencySeverity = "unknown" | "low" | "moderate" | "high" | "critical";
export type EmergencyHazardCategory = "natural" | "structural" | "infrastructure" | "fire" | "hazardous_material" | "medical" | "accident" | "security" | "civil_crowd" | "unknown" | "multi_hazard";

export interface EmergencyTriageInput {
  hazardCategory: EmergencyHazardCategory;
  severity: EmergencySeverity;
  observedAt?: string | null;
  now?: Date;
}

export interface EmergencyTriageAdvisory {
  readonly advisoryOnly: true;
  readonly priority: "routine" | "prompt" | "urgent" | "immediate_human_review";
  readonly verificationRequired: boolean;
  readonly reassessmentRequired: boolean;
  readonly publicPublicationAllowed: false;
  readonly automatedDispatchAllowed: false;
  readonly basis: readonly string[];
}

/** Deterministic routing advice only. It cannot publish, dispatch, deny aid, or close a case. */
export function evaluateEmergencyTriage(input: EmergencyTriageInput): EmergencyTriageAdvisory {
  const basis: string[] = [];
  const priority = input.severity === "critical" ? "immediate_human_review"
    : input.severity === "high" ? "urgent"
      : input.severity === "moderate" ? "prompt" : "routine";
  if (input.severity === "critical" || input.severity === "high") basis.push(`severity:${input.severity}`);
  const verificationRequired = input.hazardCategory === "unknown" || input.hazardCategory === "multi_hazard" || input.severity === "unknown";
  if (verificationRequired) basis.push("verification_required");
  let reassessmentRequired = false;
  if (input.observedAt) {
    const observed = Date.parse(input.observedAt);
    const now = (input.now ?? new Date()).getTime();
    reassessmentRequired = !Number.isFinite(observed) || observed > now || now - observed > 6 * 60 * 60_000;
    if (reassessmentRequired) basis.push("observation_stale_or_invalid");
  }
  return {
    advisoryOnly: true,
    priority,
    verificationRequired,
    reassessmentRequired,
    publicPublicationAllowed: false,
    automatedDispatchAllowed: false,
    basis,
  };
}
