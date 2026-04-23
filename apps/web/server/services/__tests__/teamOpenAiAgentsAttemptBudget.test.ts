import { describe, expect, it } from "vitest";
import { computeTeamAttemptBudget } from "../agentRuntime/teamAttemptBudget";

describe("computeTeamAttemptBudget", () => {
  it("flags a capped run that cannot cover the guaranteed minimum attempts", () => {
    const result = computeTeamAttemptBudget({
      mandatoryStepCount: 4,
      repairAllowancePerStep: 1,
      reviewAllowancePerStep: 1,
      globalCap: 8,
    });

    expect(result.minimumGuaranteedAttempts).toBe(12);
    expect(result.isCapSufficient).toBe(false);
    expect(result.terminalReason).toBe("plan_incomplete_cap_reached");
  });

  it("returns budget_exhausted when the cap is zero", () => {
    const result = computeTeamAttemptBudget({
      mandatoryStepCount: 4,
      repairAllowancePerStep: 1,
      globalCap: 0,
    });

    expect(result.terminalReason).toBe("budget_exhausted");
  });
});

