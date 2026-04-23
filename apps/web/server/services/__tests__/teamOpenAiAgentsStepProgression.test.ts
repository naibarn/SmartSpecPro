import { describe, expect, it } from "vitest";

import { summarizeTeamPlanSteps } from "../agentRuntime/teamPlanRuntime";

describe("team OpenAI Agents step progression", () => {
  it("keeps step order and attempt links stable", () => {
    const steps = summarizeTeamPlanSteps([
      {
        stepKey: "research",
        title: "Research",
        status: "planned",
        ownerPersona: "Researcher",
        ownerMemberId: "member-1",
        reviewerPersona: "Reviewer",
        reviewerMemberId: "member-2",
        deliverable: "Brief",
        objective: null,
        verificationMethod: null,
        retryRule: null,
        evidenceRequirements: [],
        qualityCriteria: [],
        reviewChecklist: [],
        notes: null,
        stepLinks: [],
        attemptIds: ["attempt-1"],
        latestAttemptId: "attempt-1",
        openFindingCount: 0,
        resolvedFindingCount: 0,
      } as any,
    ]);

    expect(steps[0]?.stepKey).toBe("research");
    expect(steps[0]?.attemptIds).toEqual(["attempt-1"]);
  });
});
