import { describe, expect, it } from "vitest";

import {
  assertStagedProviderSpendAllowed,
  buildStagedOperationEnvelope,
  isShotScopedCheckpointKind,
  transitionStagedCheckpoint,
  updateStagedCheckpointById,
} from "../marketplaceAutoReviewStagedCheckpointService";
import { buildStagedCheckpointFixture } from "@shared/marketplaceAutoReview/stagedFixtures";

const expected = {
  revision: 1,
  contentHash: "hash_prompt_1",
  model: "gpt-image-2",
  provider: "openai",
  safetyVerdict: "pass",
  referenceManifestHash: "refs_1",
  estimatedCredits: 10,
};

describe("Feature 141 checkpoint state and spend guard", () => {
  it("approves only an awaiting checkpoint at the expected revision/hash", () => {
    const checkpoint = buildStagedCheckpointFixture({
      checkpointId: "cp_image_prompt_1",
      kind: "image_prompt",
      scope: "shot",
      shotId: 1,
      contentHash: "hash_prompt_1",
    });
    const result = transitionStagedCheckpoint(checkpoint, {
      type: "approve",
      expected,
      userId: 42,
      approvedAt: "2026-07-26T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.checkpoint.state).toBe("approved");
      expect(result.checkpoint.approvedHash).toBe("hash_prompt_1");
      expect(result.checkpoint.approvedByUserId).toBe(42);
    }
  });

  it("rejects stale approval and never mutates the original checkpoint", () => {
    const checkpoint = buildStagedCheckpointFixture({
      contentHash: "hash_current",
    });
    const result = transitionStagedCheckpoint(checkpoint, {
      type: "approve",
      expected: { ...expected, contentHash: "hash_old" },
      userId: 42,
      approvedAt: "2026-07-26T00:00:00.000Z",
    });
    expect(result).toEqual({
      ok: false,
      reasonCode: "checkpoint_hash_mismatch",
    });
    expect(checkpoint.state).toBe("awaiting");
  });

  it("rejects provider spend until the exact approval exists", () => {
    const awaiting = buildStagedCheckpointFixture({
      contentHash: "hash_prompt_1",
    });
    expect(assertStagedProviderSpendAllowed(awaiting, expected)).toEqual({
      ok: false,
      reasonCode: "checkpoint_not_ready",
    });

    const approved = transitionStagedCheckpoint(awaiting, {
      type: "approve",
      expected,
      userId: 42,
      approvedAt: "2026-07-26T00:00:00.000Z",
    });
    expect(approved.ok).toBe(true);
    if (approved.ok) {
      expect(
        assertStagedProviderSpendAllowed(approved.checkpoint, expected).ok
      ).toBe(true);
    }
  });

  it("consumes approval once and blocks a second provider task", () => {
    const checkpoint = buildStagedCheckpointFixture({
      contentHash: "hash_prompt_1",
    });
    const approved = transitionStagedCheckpoint(checkpoint, {
      type: "approve",
      expected,
      userId: 42,
      approvedAt: "2026-07-26T00:00:00.000Z",
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    const consumed = transitionStagedCheckpoint(approved.checkpoint, {
      type: "consume",
      operationId: "op_image_1",
      consumedAt: "2026-07-26T00:00:01.000Z",
    });
    expect(consumed.ok).toBe(true);
    if (!consumed.ok) return;
    expect(consumed.checkpoint.consumedByOperationId).toBe("op_image_1");
    expect(
      assertStagedProviderSpendAllowed(consumed.checkpoint, expected)
    ).toEqual({
      ok: false,
      reasonCode: "checkpoint_consumed",
    });
  });

  it("updates only the requested shot checkpoint", () => {
    const checkpoints = [
      buildStagedCheckpointFixture({
        checkpointId: "cp_image_prompt_1",
        kind: "image_prompt",
        scope: "shot",
        shotId: 1,
        contentHash: "hash_prompt_1",
      }),
      buildStagedCheckpointFixture({
        checkpointId: "cp_image_prompt_2",
        kind: "image_prompt",
        scope: "shot",
        shotId: 2,
        contentHash: "hash_prompt_2",
      }),
    ];
    const result = updateStagedCheckpointById(
      checkpoints,
      "cp_image_prompt_1",
      {
        type: "approve",
        expected,
        userId: 42,
        approvedAt: "2026-07-26T00:00:00.000Z",
      }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.checkpoints[0].state).toBe("approved");
      expect(result.checkpoints[1].state).toBe("awaiting");
    }
  });

  it("identifies shot-scoped checkpoint kinds and returns operation envelopes", () => {
    expect(isShotScopedCheckpointKind("image_prompt")).toBe(true);
    expect(isShotScopedCheckpointKind("video_result")).toBe(true);
    expect(isShotScopedCheckpointKind("story_plan")).toBe(false);
    expect(
      buildStagedOperationEnvelope({
        operationId: "op_1",
        runId: "run_1",
        stateDigest: "digest_1",
        planRevision: 2,
      })
    ).toMatchObject({ operationId: "op_1", status: "queued", planRevision: 2 });
  });
});
