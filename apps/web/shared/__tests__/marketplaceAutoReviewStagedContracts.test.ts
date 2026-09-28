import { describe, expect, it } from "vitest";

import {
  HumanApprovalCheckpointV1Schema,
  StagedCheckpointApprovalExpectationV1Schema,
  StagedSequentialStoryboardMetadataV1Schema,
  buildStagedApprovalIdempotencyKey,
  isCheckpointApprovalMatch,
  validateNineShotContract,
  validateStagedShotContract,
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
    // durationSeconds:2 is below the accepted range (4..30) — this asserts
    // the "malformed duration" half of the contract, independent of the
    // exact bounds (which are covered in dedicated range tests below).
    const result = validateNineShotContract([
      ...Array.from({ length: 8 }, (_, index) => ({
        shotId: index + 1,
        durationSeconds: 10,
      })),
      { shotId: 9, durationSeconds: 2 },
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

  /**
   * `planning/marketplace-flexible-shots-and-creation-casting/plan.md` W1:
   * `validateNineShotContract` is now a thin deprecated wrapper around
   * `validateStagedShotContract(shots, { expectedCount: 9 })` — it must
   * still enforce exactly 9 for existing callers/persisted runs.
   */
  it("validateNineShotContract wrapper still enforces exactly 9 shots", () => {
    const sevenShots = validateNineShotContract(
      Array.from({ length: 7 }, (_, index) => ({
        shotId: index + 1,
        durationSeconds: 10,
      }))
    );
    expect(sevenShots.valid).toBe(false);
    expect(sevenShots.reasonCodes).toContain("staged_invalid_shot_contract");
  });

  it("validateStagedShotContract with expectedCount enforces an exact fixed count", () => {
    const seven = validateStagedShotContract(
      Array.from({ length: 7 }, (_, index) => ({
        shotId: index + 1,
        durationSeconds: 10,
      })),
      { expectedCount: 7 }
    );
    expect(seven).toEqual({ valid: true, reasonCodes: [] });

    const wrongCount = validateStagedShotContract(
      Array.from({ length: 8 }, (_, index) => ({
        shotId: index + 1,
        durationSeconds: 10,
      })),
      { expectedCount: 7 }
    );
    expect(wrongCount.valid).toBe(false);
  });

  it("validateStagedShotContract without expectedCount accepts any count in 1..30 (the 'auto' case)", () => {
    const thirty = validateStagedShotContract(
      Array.from({ length: 30 }, (_, index) => ({
        shotId: index + 1,
        durationSeconds: 30,
      }))
    );
    expect(thirty).toEqual({ valid: true, reasonCodes: [] });

    const one = validateStagedShotContract([{ shotId: 1, durationSeconds: 4 }]);
    expect(one).toEqual({ valid: true, reasonCodes: [] });

    const tooMany = validateStagedShotContract(
      Array.from({ length: 31 }, (_, index) => ({
        shotId: index + 1,
        durationSeconds: 10,
      }))
    );
    expect(tooMany.valid).toBe(false);
  });

  it("validateStagedShotContract rejects duration outside the extended 4..30s range", () => {
    const tooLong = validateStagedShotContract([
      { shotId: 1, durationSeconds: 31 },
    ]);
    expect(tooLong.valid).toBe(false);

    const tooShort = validateStagedShotContract([
      { shotId: 1, durationSeconds: 3 },
    ]);
    expect(tooShort.valid).toBe(false);
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
