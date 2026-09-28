import { describe, expect, it } from "vitest";
import {
  evaluateEconomicPolicy,
  allocateRevenue,
} from "../economicPolicyService";

describe("economicPolicyService", () => {
  it("applies deny precedence from tenant to provider and redacts explanations", () => {
    const result = evaluateEconomicPolicy({
      policyVersion: "policy-1",
      tenant: { allowed: true },
      project: { allowed: true },
      user: { allowed: true },
      agent: { allowed: false, reason: "secret internal rule" },
      workflow: { allowed: true },
      provider: { allowed: true, name: "provider-a" },
    });
    expect(result).toMatchObject({
      decision: "denied",
      reasonCode: "AGENT_POLICY_DENIED",
      policyVersion: "policy-1",
    });
    expect(result.explanation).not.toContain("secret");
  });

  it("returns approval-required for a policy checkpoint", () => {
    expect(
      evaluateEconomicPolicy({
        policyVersion: "policy-1",
        tenant: { allowed: true },
        project: { allowed: true },
        user: { allowed: true },
        agent: { allowed: true },
        workflow: { allowed: true, approvalRequired: true },
        provider: { allowed: true, name: "provider-a" },
      })
    ).toMatchObject({
      decision: "approval_required",
      reasonCode: "WORKFLOW_APPROVAL_REQUIRED",
    });
  });

  it("allocates immutable revenue in one currency and rejects split overflow", () => {
    expect(
      allocateRevenue({
        grossMinorUnits: 1000,
        currency: "USD",
        publisherShareBps: 7000,
        platformShareBps: 3000,
      })
    ).toEqual({
      currency: "USD",
      publisherMinorUnits: 700,
      platformMinorUnits: 300,
      eligible: true,
    });
    expect(() =>
      allocateRevenue({
        grossMinorUnits: 1000,
        currency: "USD",
        publisherShareBps: 7001,
        platformShareBps: 3000,
      })
    ).toThrow(/REVENUE_SPLIT_INVALID/);
  });
});
