import { describe, expect, it } from "vitest";

import { computeTeamAttemptBudget } from "../agentRuntime/teamAttemptBudget";

describe("team run completion gate", () => {
  it("requires enough attempts before completion", () => {
    const result = computeTeamAttemptBudget({
      mandatoryStepCount: 2,
      repairAllowancePerStep: 1,
      reviewAllowancePerStep: 1,
      globalCap: 5,
    });

    expect(result.isCapSufficient).toBe(false);
    expect(result.terminalReason).toBe("plan_incomplete_cap_reached");
  });
});
