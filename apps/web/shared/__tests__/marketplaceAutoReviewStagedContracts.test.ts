import { describe, expect, it } from "vitest";

import {
  HumanApprovalCheckpointV1Schema,
  StagedCheckpointApprovalExpectationV1Schema,
  StagedSequentialStoryboardMetadataV1Schema,
  buildStagedApprovalIdempotencyKey,
  isCheckpointApprovalMatch,
  validateNineShotContract,
} from "../marketplaceAutoReview/stagedContracts";
import {
  buildNineShotStoryboardFixture,
  buildStagedCheckpointFixture,
} from "../marketplaceAutoReview/stagedFixtures";

describe("Feature 141 staged contracts", () => {
  it("validates the mandatory checkpoint record shape", () => {
    const checkpoint = buildStagedCheckpointFixture();
    expect(HumanApprovalCheckpointV1Schema.parse(checkpoint)).toEqual(checkpoint);
    expect(checkpoint.kind).toBe("story_plan");
    expect(checkpoint.state).toBe("awaiting");
  });

  it("represents all checkpoint stages without a second state machine", () => {
    const fixture = buildNineShotStoryboardFixture();
    const parsed = StagedSequentialStoryboardMetadataV1Schema.parse(fixture);
    expect(parsed.humanApprovalPolicy).toBe("all_checkpoints_required");
    expect(parsed.stagedSequentialStoryboard.reviewCheckpoints).toHaveLength(1);
  });

  it("rejects a shot checkpoint that is missing shot scope", () => {
    expect(() =>
      HumanApprovalCheckpointV1Schema.parse(
        buildStagedCheckpointFixture({
          kind: "image_prompt",
          scope: "run",
          shotId: null,
        })
      )
    ).toThrow("shot checkpoints require shot scope and shotId");
  });

  it("requires exactly nine ten-second shots", () => {
    const result = validateNineShotContract(
      Array.from({ length: 9 }, (_, index) => ({
        shotId: index + 1,
        durationSeconds: 10,
      }))
    );
    expect(result).toEqual({ valid: true, reasonCodes: [] });
  });

  it("rejects malformed shot count or duration", () => {
    const result = validateNineShotContract([
      ...Array.from({ length: 8 }, (_, index) => ({
        shotId: index + 1,
        durationSeconds: 10,
      })),
      { shotId: 9, durationSeconds: 8 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.reasonCodes).toContain("staged_invalid_shot_contract");
  });

  it("matches an approval only for the exact revision and spend inputs", () => {
    const checkpoint = buildStagedCheckpointFixture({
      kind: "image_prompt",
      scope: "shot",
      shotId: 1,
      state: "approved",
      contentHash: "hash_prompt_1",
      approvedHash: "hash_prompt_1",
      approvedByUserId: 42,
      approvedAt: "2026-07-26T00:00:00.000Z",
      approvedModel: "gpt-image-2",
      approvedProvider: "openai",
      approvedSafetyVerdict: "pass",
      approvedReferenceManifestHash: "hash_refs_1",
      estimatedCredits: 10,
    });
    const expected = StagedCheckpointApprovalExpectationV1Schema.parse({
      revision: 1,
      contentHash: "hash_prompt_1",
      model: "gpt-image-2",
      provider: "openai",
      safetyVerdict: "pass",
      referenceManifestHash: "hash_refs_1",
      estimatedCredits: 10,
    });

    expect(isCheckpointApprovalMatch(checkpoint, expected)).toBe(true);
    expect(
      isCheckpointApprovalMatch(checkpoint, { ...expected, estimatedCredits: 11 })
    ).toBe(false);
  });

  it("does not reuse one-use consumption evidence", () => {
    const checkpoint = buildStagedCheckpointFixture({
      state: "approved",
      approvedHash: "hash_1",
      consumedAt: "2026-07-26T00:00:00.000Z",
      consumedByOperationId: "op_1",
    });
    const expected = {
      revision: 1,
      contentHash: "hash_1",
      model: "model",
      provider: "provider",
      safetyVerdict: "pass",
      referenceManifestHash: "refs",
      estimatedCredits: 0,
    };
    expect(isCheckpointApprovalMatch(checkpoint, expected)).toBe(false);
  });

  it("builds deterministic approval idempotency keys", () => {
    expect(
      buildStagedApprovalIdempotencyKey({
        runId: "run_1",
        checkpointId: "cp_1",
        revision: 2,
        contentHash: "hash_2",
      })
    ).toBe("run_1:cp_1:2:hash_2");
  });
});
