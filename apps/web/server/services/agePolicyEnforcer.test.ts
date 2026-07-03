import { describe, expect, it } from "vitest";

import { buildProviderAgePolicyInstruction, enforceAgePolicy } from "./agePolicyEnforcer";

describe("agePolicyEnforcer", () => {
  it("blocks chat before provider dispatch for unknown users in enforce mode", () => {
    const result = enforceAgePolicy({
      actor: { actorKind: "human_user", dateOfBirth: null, countryCode: "US", tenantId: "t1" },
      surface: "chat",
      action: "submit_prompt",
      flags: { ageSafetyPolicyEnabled: true },
      now: new Date("2026-07-02T00:00:00.000Z"),
    });
    expect(result.decision.allowed).toBe(false);
    expect(result.response?.code).toBe("safety_profile_required");
  });

  it("builds provider instructions without raw profile data", () => {
    const result = enforceAgePolicy({
      actor: { actorKind: "human_user", dateOfBirth: "2000-01-01", countryCode: "US", tenantId: "t1" },
      surface: "chat",
      action: "submit_prompt",
      flags: { ageSafetyPolicyEnabled: true, ageSafetyObserveMode: true },
      now: new Date("2026-07-02T00:00:00.000Z"),
    });
    const instruction = buildProviderAgePolicyInstruction(result.decision);
    expect(instruction).toContain("Effective age band");
    expect(instruction).not.toContain("2000-01-01");
    expect(instruction).not.toContain("US");
  });
});
