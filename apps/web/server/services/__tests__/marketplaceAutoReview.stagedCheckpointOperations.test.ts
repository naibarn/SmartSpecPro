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

  /**
   * Gap fix (marketplace-two-character-conversation UI/UX audit): QC
   * warnings from `assessStagedPlanAdherence` were being written to the
   * `marketplaceAutoReviewStages` table via `upsertStage`, but the staged
   * UI's actual data source (`getStagedAutoReviewCheckpointState`) reads
   * `checkpoints: projectStagedCheckpoints(reviewCheckpoints)`, which never
   * touched that table — the warnings were computed correctly but reached a
   * sink nobody read. Fixed by adding `adherenceWarnings` directly onto the
   * checkpoint object (`buildStagedCheckpoint`), so it now flows through
   * this exact projection function into the client-visible payload.
   */
  it("passes adherenceWarnings through the safe projection when present, and omits it when absent", () => {
    const withWarnings = projectStagedCheckpoints([
      buildStagedCheckpointFixture({
        adherenceWarnings: ["staged_tone_not_adhered", "staged_conversation_turns_missing"],
      }),
    ]);
    expect(withWarnings[0].adherenceWarnings).toEqual([
      "staged_tone_not_adhered",
      "staged_conversation_turns_missing",
    ]);

    const withoutWarnings = projectStagedCheckpoints([buildStagedCheckpointFixture()]);
    expect(withoutWarnings[0].adherenceWarnings).toBeUndefined();
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
