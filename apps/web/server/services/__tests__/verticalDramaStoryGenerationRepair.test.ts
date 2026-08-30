import { describe, expect, it } from "vitest";
import { planStoryGenerationRepair } from "../verticalDramaStoryGenerationRepair";
import type { StoryGenerationRunContract, StoryValidationReport } from "../verticalDramaStoryGenerationContracts";

const contract = { budget: { maxRepairAttempts: 2 } } as StoryGenerationRunContract;
const report = {
  repairRound: 0,
  impactedEpisodes: [2],
  findings: [{ code: "plan.alignment_drift", severity: "structural", blocking: true, requiresApproval: true, targetPaths: ["/episodes/2"], preservePaths: ["/plan"] }],
} as StoryValidationReport;

describe("vertical drama story generation repair planner", () => {
  it("requires approval for structural findings and preserves the plan", () => {
    const plan = planStoryGenerationRepair({ contract, report });
    expect(plan.nextStatus).toBe("awaiting_approval");
    expect(plan.targetEpisodes).toEqual([2]);
    expect(plan.impactClosureEpisodes).toEqual([2]);
    expect(plan.preservePaths).toContain("/plan");
  });

  it("closes a local repair over admitted neighboring episodes", () => {
    const plan = planStoryGenerationRepair({
      contract: { budget: { maxRepairAttempts: 2 }, targetEpisodes: [1, 2, 3] } as StoryGenerationRunContract,
      report: { ...report, impactedEpisodes: [2], findings: [{ ...report.findings[0], code: "continuity.boundary_break", severity: "major", requiresApproval: false }] } as StoryValidationReport,
    });
    expect(plan.targetEpisodes).toEqual([1, 2, 3]);
    expect(plan.impactExpansionRequired).toBe(false);
  });
});
