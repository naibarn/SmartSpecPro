import { describe, it, expect } from "vitest";
import { buildVerificationPolicyEvidence, resolveVerificationPolicyForRiskClass } from "../verificationPolicy";

describe("verificationPolicy", () => {
  it("maps critical work to human approval", () => {
    const policy = resolveVerificationPolicyForRiskClass("critical");

    expect(policy).toEqual(expect.objectContaining({
      riskClass: "critical",
      reviewerPersona: "human_approval",
      requiresHumanApproval: true,
    }));
  });

  it("builds evidence payloads that can be stored in work item events", () => {
    const policy = resolveVerificationPolicyForRiskClass("high", { requiresHumanApproval: false });
    const evidence = buildVerificationPolicyEvidence(policy, {
      routeSurface: "skill",
      routeRiskTier: "high",
    });

    expect(evidence).toEqual(expect.objectContaining({
      riskClass: "high",
      reviewerPersona: "safety_policy",
      routeSurface: "skill",
      routeRiskTier: "high",
    }));
  });
});
