import { describe, expect, it } from "vitest";

import { describeTeamReviewVerdict } from "../agentRuntime/teamReviewRuntime";

describe("team OpenAI Agents repair loop", () => {
  it("marks a failed review with issues as needs_repair", () => {
    const verdict = describeTeamReviewVerdict({
      pass: false,
      recommendation: "Rewrite the opening",
      issues: ["Need stronger hook"],
      repairInstructions: "Add a clearer opening",
    });

    expect(verdict.verdict).toBe("needs_repair");
    expect(verdict.issues).toEqual(["Need stronger hook"]);
    expect(verdict.repairInstructions).toBe("Add a clearer opening");
  });
});
