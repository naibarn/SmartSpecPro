import { describe, expect, it } from "vitest";

import {
  estimateRepeatedPathCount,
  evaluateRunForLearning,
  transitionProposal,
} from "../orchestratorLearningService";

describe("orchestratorLearningService", () => {
  it("generates workpack and workflow proposals from repeated successful runs", () => {
    const result = evaluateRunForLearning({
      runId: "run-1",
      objective: "Launch campaign",
      successCount: 3,
      repeatedPathCount: 3,
      exceptionSummaries: ["media retry loop"],
      evidenceRefs: ["artifact-1"],
      finalArtifacts: ["deck.pdf"],
      generatedAt: "2026-04-21T00:00:00.000Z",
    });

    expect(result.workpackCandidates).toHaveLength(1);
    expect(result.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionType: "workpack_candidate" }),
        expect.objectContaining({
          actionType: "skill_improvement",
          metadata: expect.objectContaining({
            followUpAction: "improve_owned_skill",
          }),
        }),
        expect.objectContaining({ actionType: "workflow_refinement" }),
      ]),
    );
  });

  it("counts repeated path history by prior run instead of proposal count", () => {
    expect(
      estimateRepeatedPathCount({
        objective: "Launch campaign",
        completedRun: true,
        existingProposals: [
          {
            id: "proposal-1",
            state: "triaged",
            actionType: "skill_improvement",
            title: "Skill improvement for Launch campaign",
            summary: "",
            confidence: 0.7,
            dedupeKey: "a",
            evidenceRefs: [],
            recommendedApprovalPath: "skill_studio_review",
            relatedRunId: "run-1",
            createdAt: "2026-04-21T00:00:00.000Z",
            updatedAt: "2026-04-21T00:00:00.000Z",
            metadata: {
              learningObjective: "Launch campaign",
            },
          },
          {
            id: "proposal-2",
            state: "triaged",
            actionType: "workflow_refinement",
            title: "Workflow refinement for Launch campaign",
            summary: "",
            confidence: 0.7,
            dedupeKey: "b",
            evidenceRefs: [],
            recommendedApprovalPath: "admin_review",
            relatedRunId: "run-1",
            createdAt: "2026-04-21T00:00:00.000Z",
            updatedAt: "2026-04-21T00:00:00.000Z",
            metadata: {
              learningObjective: "Launch campaign",
            },
          },
          {
            id: "proposal-3",
            state: "triaged",
            actionType: "skill_improvement",
            title: "Skill improvement for Launch campaign",
            summary: "",
            confidence: 0.8,
            dedupeKey: "c",
            evidenceRefs: [],
            recommendedApprovalPath: "skill_studio_review",
            relatedRunId: "run-2",
            createdAt: "2026-04-22T00:00:00.000Z",
            updatedAt: "2026-04-22T00:00:00.000Z",
            metadata: {
              learningObjective: "Launch campaign",
            },
          },
        ],
      }),
    ).toBe(3);
  });

  it("counts deduped duplicate run ids toward repeated-path history", () => {
    expect(
      estimateRepeatedPathCount({
        objective: "Launch campaign",
        completedRun: true,
        existingProposals: [
          {
            id: "proposal-1",
            state: "deduped",
            actionType: "skill_improvement",
            title: "Skill improvement for Launch campaign",
            summary: "",
            confidence: 0.7,
            dedupeKey: "a",
            evidenceRefs: [],
            recommendedApprovalPath: "skill_studio_review",
            relatedRunId: "run-1",
            createdAt: "2026-04-21T00:00:00.000Z",
            updatedAt: "2026-04-21T00:00:00.000Z",
            metadata: {
              learningObjective: "Launch campaign",
              duplicateRunIds: ["run-2", "run-3"],
            },
          },
        ],
      }),
    ).toBe(4);
  });

  it("enforces the proposal lifecycle before proposals become terminal", () => {
    const result = evaluateRunForLearning({
      runId: "run-1",
      objective: "Launch campaign",
      successCount: 3,
      repeatedPathCount: 3,
      evidenceRefs: ["artifact-1"],
    });
    const triaged = transitionProposal({
      proposal: result.proposals[0]!,
      nextState: "triaged",
      actorUserId: 1,
      reason: "queued",
    });
    const accepted = transitionProposal({
      proposal: triaged,
      nextState: "accepted",
      actorUserId: 1,
      reason: "accepted",
    });
    const scheduled = transitionProposal({
      proposal: accepted,
      nextState: "scheduled",
      actorUserId: 1,
      reason: "scheduled",
    });
    const applied = transitionProposal({
      proposal: scheduled,
      nextState: "applied",
      actorUserId: 1,
      reason: "applied",
    });

    expect(() =>
      transitionProposal({
        proposal: applied,
        nextState: "triaged",
        actorUserId: 1,
        reason: "reopen",
      }),
    ).toThrow("LEARNING_PROPOSAL_INVALID_TRANSITION:applied->triaged");
  });

  it("blocks skipping directly from generated to applied", () => {
    const result = evaluateRunForLearning({
      runId: "run-1",
      objective: "Launch campaign",
      successCount: 1,
      repeatedPathCount: 1,
      evidenceRefs: ["artifact-1"],
    });

    expect(() =>
      transitionProposal({
        proposal: result.proposals[0]!,
        nextState: "applied",
        actorUserId: 1,
        reason: "skip",
      }),
    ).toThrow("LEARNING_PROPOSAL_INVALID_TRANSITION:generated->applied");
  });
});
