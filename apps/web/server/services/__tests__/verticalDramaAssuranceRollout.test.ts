import { describe, expect, it } from "vitest";
import { evaluateVerticalDramaAssuranceRelease } from "../verticalDramaAssuranceReleaseControl";

const baseFlags = {
  verticalDramaAssuranceShadow: false,
  verticalDramaDraftQcOrchestraActive: false,
  verticalDramaPromptQcOrchestraActive: false,
  verticalDramaStoryAssuranceActive: false,
  verticalDramaAssuranceKillSwitch: false,
  openAiAgentsRuntimeForceRollback: false,
  openAiAgentsRuntimeEnabled: true,
  openAiAgentsRuntimeSkillShadow: true,
  openAiAgentsRuntimeSkillActive: true,
};

const evidence = {
  releaseId: "r1", evidenceReleaseId: "r1", implementationGate: "pass" as const, productionGate: "pass" as const, cohortAllowed: true,
  dependencies: { draftQc: true, promptMedia: true, storySeason: true },
};

describe("Vertical Drama assurance rollout", () => {
  it("keeps kill switch and missing evidence fail-closed", () => {
    expect(evaluateVerticalDramaAssuranceRelease({ taskFamily: "draft_qc", flags: { ...baseFlags, verticalDramaAssuranceKillSwitch: true, verticalDramaDraftQcOrchestraActive: true }, evidence }).reason).toBe("kill_switch");
    expect(evaluateVerticalDramaAssuranceRelease({ taskFamily: "draft_qc", flags: { ...baseFlags, verticalDramaDraftQcOrchestraActive: true }, evidence: null }).reason).toBe("evidence_missing");
  });

  it("allows shadow independently but active only after exact evidence", () => {
    expect(evaluateVerticalDramaAssuranceRelease({ taskFamily: "prompt_media", flags: { ...baseFlags, verticalDramaAssuranceShadow: true, openAiAgentsRuntimeSkillActive: false }, evidence: null }).mode).toBe("agent_shadow");
    expect(evaluateVerticalDramaAssuranceRelease({ taskFamily: "prompt_media", flags: { ...baseFlags, verticalDramaPromptQcOrchestraActive: true }, evidence }).mode).toBe("agent_active");
  });
});
