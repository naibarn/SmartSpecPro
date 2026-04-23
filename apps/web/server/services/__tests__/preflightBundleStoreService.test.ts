import { describe, expect, it } from "vitest";

import type { WorkOrchestratorStoredState } from "../preflightBundleStoreService";
import { applyLearningProposalUpdates } from "../preflightBundleStoreService";

function makeStoredState(
  overrides: Partial<WorkOrchestratorStoredState> = {},
): WorkOrchestratorStoredState {
  return {
    version: "work-orchestrator-json.v1",
    currentPreflightBundleId: null,
    preflightBundles: [],
    learningProposals: [],
    persistenceDecision: {
      storageMode: "json_metadata",
      rolloutStage: "preview_beta",
      decisionLogRef:
        "specs/feature/105-work-os-team-orchestrator-unified-automation/decision-log.md#17",
      recordedAt: "2026-04-22T00:00:00.000Z",
    },
    lastUpdatedAt: "2026-04-22T00:00:00.000Z",
    ...overrides,
  };
}

describe("preflightBundleStoreService", () => {
  it("dedupes matching learning proposals into a single canonical record", () => {
    const state = makeStoredState();

    const firstProposal = {
      id: "proposal-1",
      state: "generated" as const,
      actionType: "skill_improvement" as const,
      title: "Skill improvement for Launch campaign",
      summary: "Capture the strongest reusable prompt.",
      confidence: 0.7,
      dedupeKey: "dedupe-1",
      evidenceRefs: ["source:case"],
      recommendedApprovalPath: "skill_studio_review",
      relatedRunId: "run-1",
      createdAt: "2026-04-22T01:00:00.000Z",
      updatedAt: "2026-04-22T01:00:00.000Z",
      metadata: {
        learningObjective: "Launch campaign",
      },
    };
    const duplicateProposal = {
      ...firstProposal,
      id: "proposal-2",
      confidence: 0.85,
      evidenceRefs: ["source:case", "artifact:deck"],
      relatedRunId: "run-2",
      createdAt: "2026-04-22T02:00:00.000Z",
      updatedAt: "2026-04-22T02:00:00.000Z",
    };

    const result = applyLearningProposalUpdates({
      state,
      proposals: [firstProposal, duplicateProposal],
    });

    expect(result.state.learningProposals).toHaveLength(1);
    expect(result.state.learningProposals[0]).toEqual(
      expect.objectContaining({
        id: "proposal-1",
        state: "deduped",
        confidence: 0.85,
        evidenceRefs: ["source:case", "artifact:deck"],
      }),
    );
    expect(result.state.learningProposals[0]?.metadata).toEqual(
      expect.objectContaining({
        duplicateCount: 1,
        duplicateRunIds: ["run-1", "run-2"],
        lastDedupedProposalId: "proposal-2",
      }),
    );
    expect(result.proposals[1]).toEqual(result.state.learningProposals[0]);
  });
});
