import { describe, expect, it } from "vitest";

import { summarizeTeamPlanSteps } from "../agentRuntime/teamPlanRuntime";

describe("team run plan lock", () => {
  it("retains locked step metadata in the projected plan summary", () => {
    const steps = summarizeTeamPlanSteps([
      {
        stepKey: "locked-step",
        title: "Locked Step",
        status: "planned",
        ownerPersona: "Owner",
        ownerMemberId: "owner-1",
        reviewerPersona: "Reviewer",
        reviewerMemberId: "reviewer-1",
        deliverable: "Deliverable",
        objective: "Objective",
        verificationMethod: "review",
        retryRule: "retry",
        evidenceRequirements: [],
        qualityCriteria: [],
        reviewChecklist: [],
        notes: null,
        stepLinks: [],
        attemptIds: [],
        latestAttemptId: null,
        openFindingCount: 0,
        resolvedFindingCount: 0,
      } as any,
    ]);

    expect(steps[0]).toMatchObject({
      stepKey: "locked-step",
      ownerMemberId: "owner-1",
      reviewerMemberId: "reviewer-1",
    });
  });
});
