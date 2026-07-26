import { describe, expect, it } from "vitest";

import {
  buildCheckpointApprovalMutation,
  mutateStagedCheckpointMetadata,
  projectStagedCheckpoints,
  stagedMetadataStateDigest,
} from "../marketplaceAutoReviewStagedCheckpointOperations";
import {
  buildNineShotStoryboardFixture,
  buildStagedCheckpointFixture,
} from "@shared/marketplaceAutoReview/stagedFixtures";

describe("Feature 141 checkpoint metadata operations", () => {
  it("builds a safe checkpoint projection without raw prompt fields", () => {
    const projection = projectStagedCheckpoints([buildStagedCheckpointFixture()]);
    expect(projection[0]).toMatchObject({
      checkpointId: "cp_story_1",
      kind: "story_plan",
      consumed: false,
    });
    expect("prompt" in projection[0]).toBe(false);
  });

  it("rejects stale metadata mutations before changing checkpoints", () => {
    const metadata = buildNineShotStoryboardFixture();
    const result = mutateStagedCheckpointMetadata({
      metadata,
      checkpointId: "cp_story_1",
      expectedStateDigest: "stale",
      operationId: "op_1",
      mutation: {
        type: "reject",
        reasonCode: "needs_edit",
      },
    });
    expect(result).toEqual({ ok: false, reasonCode: "staged_state_drift" });
    expect(metadata.stagedSequentialStoryboard.reviewCheckpoints[0].state).toBe(
      "awaiting"
    );
  });

  it("persists the operation and next digest for an exact approval", () => {
    const metadata = buildNineShotStoryboardFixture();
    const result = mutateStagedCheckpointMetadata({
      metadata,
      checkpointId: "cp_story_1",
      expectedStateDigest: stagedMetadataStateDigest(metadata),
      operationId: "op_story_1",
      mutation: buildCheckpointApprovalMutation({
        expected: {
          revision: 1,
          contentHash: "hash_story_1",
          model: "story-model",
          provider: "openrouter",
          safetyVerdict: "pass",
          referenceManifestHash: "hash_refs_1",
          estimatedCredits: 1,
        },
        userId: 42,
        approvedAt: "2026-07-26T00:00:00.000Z",
      }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.checkpoint.state).toBe("approved");
      expect(result.operation.operationId).toBe("op_story_1");
      expect(result.operation.stateDigest).not.toBe(
        stagedMetadataStateDigest(metadata)
      );
    }
  });
});
