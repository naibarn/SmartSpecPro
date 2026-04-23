import { describe, expect, it } from "vitest";

import { describeTeamReviewVerdict } from "../agentRuntime/teamReviewRuntime";

describe("team run repair loop", () => {
  it("describes a repair request when review issues are present", () => {
    const verdict = describeTeamReviewVerdict({
      pass: false,
      recommendation: "Revise the opening",
      issues: ["Need stronger hook"],
      repairInstructions: "Rewrite the opening with a clearer hook",
    });

    expect(verdict.verdict).toBe("needs_repair");
    expect(verdict.issues).toContain("Need stronger hook");
  });
});
