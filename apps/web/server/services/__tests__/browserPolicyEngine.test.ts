import { describe, expect, it } from "vitest";

import { evaluateBrowserPolicy } from "../browserPolicyEngine";

const entitlement = {
  tenantId: "tenant-1",
  workflowId: 7,
  workflowName: "QA",
  allowedCapabilities: ["navigate", "upload_file", "extract_data"],
  forbiddenCapabilities: ["download_file"],
  allowedDataClasses: ["public", "internal"],
  config: {
    approvalTtlSeconds: 300,
    maxExtractedRecords: 100,
    maxExternalSends: 2,
    maxOriginTransitions: 3,
  },
} as const;

describe("browser policy engine", () => {
  it("returns only the dedicated browser-policy decision enum values", () => {
    const decision = evaluateBrowserPolicy(
      {
        tenantId: "tenant-1",
        workflowId: 7,
        actionType: "navigate",
        requiredCapabilities: ["navigate"],
        evidence: { actionDigest: "digest" },
      },
      { entitlement: entitlement as any },
    );

    expect([
      "allow",
      "allow_with_redaction",
      "require_approval",
      "deny",
      "escalate_for_review",
    ]).toContain(decision.decision);
  });

  it("requires approval for low-confidence non-read actions", () => {
    const decision = evaluateBrowserPolicy(
      {
        tenantId: "tenant-1",
        workflowId: 7,
        actionType: "fill",
        requiredCapabilities: ["navigate"],
        classifierConfidenceOverride: 0.4,
        evidence: { actionDigest: "digest" },
      },
      { entitlement: entitlement as any },
    );

    expect(decision.decision).toBe("require_approval");
    expect(decision.reasonCodes).toContain("low_classifier_confidence");
  });

  it("denies forbidden capabilities", () => {
    const decision = evaluateBrowserPolicy(
      {
        tenantId: "tenant-1",
        workflowId: 7,
        actionType: "download",
        requiredCapabilities: ["download_file"],
        evidence: { actionDigest: "digest" },
      },
      { entitlement: entitlement as any },
    );

    expect(decision.decision).toBe("deny");
    expect(decision.reasonCodes).toContain("forbidden_capability");
  });

  it("denies restricted transfers from sensitive pages", () => {
    const decision = evaluateBrowserPolicy(
      {
        tenantId: "tenant-1",
        workflowId: 7,
        actionType: "external_send",
        requiredCapabilities: ["extract_data"],
        transfersExternally: true,
        dataClasses: ["restricted"],
        evidence: { actionDigest: "digest" },
      },
      { entitlement: entitlement as any },
    );

    expect(decision.decision).toBe("deny");
    expect(decision.reasonCodes).toContain("restricted_transfer");
  });
});
