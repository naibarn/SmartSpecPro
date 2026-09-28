import { describe, expect, it } from "vitest";
import { buildVerticalDramaStoryAssuranceRequest, verifyVerticalDramaStoryAgentHash } from "../verticalDramaStoryGenerationAgentAdapter";
import type { StoryGenerationRunContract } from "../verticalDramaStoryGenerationContracts";

const contract = {
  contractId: "contract-1", attemptId: "attempt-1", contractHash: "a".repeat(64),
  evidencePolicy: { requiredKinds: ["draft"], maxEpisodes: 3 },
  outputContract: { format: "story-v1" },
  budget: { maxTurns: 2, maxToolCalls: 4, maxParallelAgents: 1, maxRepairAttempts: 1, maxWallClockMs: 1000, maxContextBytes: 4000, maxOutputBytes: 4000, maxEstimatedCredits: 3 },
  rulePackIds: ["structure-v1"], sideEffectPolicy: { allowedSideEffects: ["artifact_write"], mode: "standard" },
} as StoryGenerationRunContract;

describe("vertical drama story agent adapter", () => {
  it("maps the domain contract to the existing Feature 151 assurance schema", () => {
    const request = buildVerticalDramaStoryAssuranceRequest(contract);
    expect(request.taskKind).toBe("structured_generation");
    expect(request.contractHash).toBe(contract.contractHash);
    expect(request.rulePackIds).toContain("vertical-drama-plan-alignment-v1");
  });

  it("rejects an agent result bound to another contract", () => {
    expect(() => verifyVerticalDramaStoryAgentHash(contract, "b".repeat(64))).toThrow("CONTRACT_HASH_MISMATCH");
  });
});
