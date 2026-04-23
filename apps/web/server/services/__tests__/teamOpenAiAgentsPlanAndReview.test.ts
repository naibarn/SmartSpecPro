import { describe, expect, it } from "vitest";
import { summarizeTeamPlanSteps, countTeamPlanStepLinks } from "../agentRuntime/teamPlanRuntime";
import { describeTeamReviewVerdict } from "../agentRuntime/teamReviewRuntime";

describe("team plan/review runtime helpers", () => {
  it("summarizes the locked plan and review verdicts without losing assignments", () => {
    const summary = summarizeTeamPlanSteps([
      {
        stepKey: "step-1",
        title: "Research",
        status: "planned",
        ownerPersona: "Researcher",
        ownerMemberId: "member-1",
        reviewerPersona: "Reviewer",
        reviewerMemberId: "member-2",
        deliverable: "Research brief",
        objective: null,
        verificationMethod: null,
        retryRule: null,
        evidenceRequirements: [],
        qualityCriteria: [],
        reviewChecklist: [],
        notes: null,
        stepLinks: [{ linkType: "plan_summary" } as any],
        attemptIds: [],
        latestAttemptId: null,
        openFindingCount: 0,
        resolvedFindingCount: 0,
      } as any,
    ]);

    expect(summary).toHaveLength(1);
    expect(summary[0].ownerMemberId).toBe("member-1");
    expect(countTeamPlanStepLinks(summary as any)).toBe(1);

    expect(
      describeTeamReviewVerdict({
        pass: false,
        issues: ["Missing evidence"],
        recommendation: "Add a citation block",
      }),
    ).toEqual({
      verdict: "needs_repair",
      note: "Add a citation block",
      issues: ["Missing evidence"],
      repairInstructions: null,
    });
  });
});

