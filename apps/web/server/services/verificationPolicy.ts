export type VerificationRiskClass = "low" | "medium" | "high" | "critical";
export type ReviewerPersona =
  | "technical_reviewer"
  | "qa_validator"
  | "domain_persona"
  | "safety_policy"
  | "human_approval";

export interface VerificationPolicy {
  riskClass: VerificationRiskClass;
  reviewerPersona: ReviewerPersona;
  verificationMethod: "review" | "test_and_review" | "safety_review" | "human_approval";
  maxRepairLoops: number;
  requiresHumanApproval: boolean;
  evidenceRequirements: string[];
  escalationTriggers: string[];
}

function normalizeRiskClass(value: unknown): VerificationRiskClass {
  if (value === "low" || value === "medium" || value === "high" || value === "critical") {
    return value;
  }
  return "medium";
}

export function resolveVerificationPolicyForRiskClass(
  riskClass: unknown,
  overrides?: {
    requiresHumanApproval?: boolean;
    verificationMethod?: VerificationPolicy["verificationMethod"];
  },
): VerificationPolicy {
  const normalizedRisk = normalizeRiskClass(riskClass);
  switch (normalizedRisk) {
    case "low":
      return {
        riskClass: normalizedRisk,
        reviewerPersona: "domain_persona",
        verificationMethod: overrides?.verificationMethod ?? "review",
        maxRepairLoops: 2,
        requiresHumanApproval: overrides?.requiresHumanApproval ?? false,
        evidenceRequirements: ["peer review note", "source or output evidence"],
        escalationTriggers: ["repeat failure", "policy breach"],
      };
    case "medium":
      return {
        riskClass: normalizedRisk,
        reviewerPersona: "qa_validator",
        verificationMethod: overrides?.verificationMethod ?? "test_and_review",
        maxRepairLoops: 3,
        requiresHumanApproval: overrides?.requiresHumanApproval ?? false,
        evidenceRequirements: ["test result", "review note", "artifact link"],
        escalationTriggers: ["test failure after repair", "evidence missing"],
      };
    case "high":
      return {
        riskClass: normalizedRisk,
        reviewerPersona: "safety_policy",
        verificationMethod: overrides?.verificationMethod ?? "safety_review",
        maxRepairLoops: 4,
        requiresHumanApproval: overrides?.requiresHumanApproval ?? false,
        evidenceRequirements: ["validation evidence", "risk review", "artifact link"],
        escalationTriggers: ["unsafe output", "policy-gated action", "repair loop exhausted"],
      };
    case "critical":
    default:
      return {
        riskClass: "critical",
        reviewerPersona: "human_approval",
        verificationMethod: overrides?.verificationMethod ?? "human_approval",
        maxRepairLoops: 1,
        requiresHumanApproval: overrides?.requiresHumanApproval ?? true,
        evidenceRequirements: ["human approval", "safety review", "artifact link"],
        escalationTriggers: ["irreversible action", "safety-critical action", "policy-gated step"],
      };
  }
}

export function buildVerificationPolicyEvidence(policy: VerificationPolicy, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    riskClass: policy.riskClass,
    reviewerPersona: policy.reviewerPersona,
    verificationMethod: policy.verificationMethod,
    maxRepairLoops: policy.maxRepairLoops,
    requiresHumanApproval: policy.requiresHumanApproval,
    evidenceRequirements: policy.evidenceRequirements,
    escalationTriggers: policy.escalationTriggers,
    ...(extra ?? {}),
  };
}

