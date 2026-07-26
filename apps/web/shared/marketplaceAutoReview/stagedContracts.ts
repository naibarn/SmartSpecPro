import { z } from "zod";

export const STAGED_PLANNING_ARCHITECTURE = "staged_two_skill_v2" as const;
export const STAGED_PLANNING_ARCHITECTURE_VERSION = 1 as const;
export const STAGED_HUMAN_APPROVAL_POLICY =
  "all_checkpoints_required" as const;

export const STAGED_CHECKPOINT_KINDS = [
  "story_plan",
  "image_prompt",
  "image_result",
  "video_prompt",
  "audio_plan",
  "final_assembly",
] as const;

export const STAGED_CHECKPOINT_STATES = [
  "not_ready",
  "awaiting",
  "approved",
  "rejected",
  "superseded",
] as const;

export const STAGED_SAFE_REASON_CODES = [
  "invalid_checkpoint",
  "checkpoint_not_ready",
  "checkpoint_not_awaiting",
  "checkpoint_rejected",
  "checkpoint_superseded",
  "checkpoint_consumed",
  "checkpoint_hash_mismatch",
  "checkpoint_revision_mismatch",
  "checkpoint_model_mismatch",
  "checkpoint_provider_mismatch",
  "checkpoint_reference_mismatch",
  "checkpoint_safety_mismatch",
  "checkpoint_cost_mismatch",
  "staged_state_drift",
  "staged_wrong_architecture",
  "staged_unauthorized",
  "staged_cancelled",
  "staged_invalid_idempotency",
  "staged_invalid_shot_contract",
] as const;

export const HumanApprovalCheckpointV1Schema = z
  .object({
    checkpointId: z.string().min(1),
    kind: z.enum(STAGED_CHECKPOINT_KINDS),
    scope: z.enum(["run", "shot"]),
    shotId: z.number().int().positive().nullable(),
    state: z.enum(STAGED_CHECKPOINT_STATES),
    revision: z.number().int().positive(),
    contentHash: z.string().min(1),
    approvedHash: z.string().min(1).nullable(),
    approvedByUserId: z.number().int().positive().nullable(),
    approvedAt: z.string().datetime().nullable(),
    consumedAt: z.string().datetime().nullable(),
    consumedByOperationId: z.string().min(1).nullable(),
    rejectionReasonCode: z.string().min(1).nullable(),
    estimatedCredits: z.number().finite().nonnegative().nullable(),
    approvedModel: z.string().min(1).nullable(),
    approvedProvider: z.string().min(1).nullable(),
    approvedSafetyVerdict: z.string().min(1).nullable(),
    approvedReferenceManifestHash: z.string().min(1).nullable(),
  })
  .superRefine((value, context) => {
    const isShotCheckpoint =
      value.kind === "image_prompt" ||
      value.kind === "image_result" ||
      value.kind === "video_prompt";
    if (isShotCheckpoint && (value.scope !== "shot" || value.shotId === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shotId"],
        message: "shot checkpoints require shot scope and shotId",
      });
    }
    if (!isShotCheckpoint && (value.scope !== "run" || value.shotId !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope"],
        message: "run checkpoints require run scope and no shotId",
      });
    }
  });

export const StagedShotStateV1Schema = z.object({
  shotId: z.number().int().positive(),
  revision: z.number().int().positive(),
  state: z.string().min(1),
  storySummary: z.string().min(1),
  dialogue: z.string(),
  imagePromptHash: z.string().min(1).nullable(),
  imageArtifactHash: z.string().min(1).nullable(),
  videoPromptHash: z.string().min(1).nullable(),
  videoArtifactHash: z.string().min(1).nullable(),
});

export const StagedSequentialStoryboardStateV1Schema = z.object({
  storyPlanStatus: z.enum(["not_ready", "awaiting", "approved", "redraft_queued"]),
  planRevision: z.number().int().positive(),
  storyPlanHash: z.string().min(1).nullable(),
  referenceManifestHash: z.string().min(1).nullable(),
  shots: z.array(StagedShotStateV1Schema).length(9),
  reviewCheckpoints: z.array(HumanApprovalCheckpointV1Schema),
});

export const StagedPlanReviewEnvelopeV1Schema = z.object({
  required: z.literal(true),
  status: z.enum(["awaiting", "redraft_queued", "approved"]),
  planRevision: z.number().int().positive(),
  approvedRevision: z.number().int().positive().nullable(),
  redraftCount: z.number().int().nonnegative(),
  lastOperationId: z.string().min(1).nullable(),
});

export const StagedSequentialStoryboardMetadataV1Schema = z.object({
  planningArchitecture: z.literal(STAGED_PLANNING_ARCHITECTURE),
  planningArchitectureVersion: z.literal(STAGED_PLANNING_ARCHITECTURE_VERSION),
  humanApprovalPolicy: z.literal(STAGED_HUMAN_APPROVAL_POLICY),
  planReview: StagedPlanReviewEnvelopeV1Schema,
  stagedSequentialStoryboard: StagedSequentialStoryboardStateV1Schema,
});

export const StagedOperationRequestV1Schema = z.object({
  runId: z.string().min(1),
  checkpointId: z.string().min(1).nullable().optional(),
  shotId: z.number().int().positive().nullable().optional(),
  expectedRevision: z.number().int().positive().nullable().optional(),
  stateDigest: z.string().min(1).nullable().optional(),
  idempotencyKey: z.string().min(8).max(200),
});

export const StagedCheckpointApprovalExpectationV1Schema = z.object({
  revision: z.number().int().positive(),
  contentHash: z.string().min(1),
  model: z.string().min(1),
  provider: z.string().min(1),
  safetyVerdict: z.string().min(1),
  referenceManifestHash: z.string().min(1),
  estimatedCredits: z.number().finite().nonnegative(),
});

export type StagedCheckpointKind = (typeof STAGED_CHECKPOINT_KINDS)[number];
export type StagedCheckpointState = (typeof STAGED_CHECKPOINT_STATES)[number];
export type StagedSafeReasonCode = (typeof STAGED_SAFE_REASON_CODES)[number];
export type HumanApprovalCheckpointV1 = z.infer<
  typeof HumanApprovalCheckpointV1Schema
>;
export type StagedSequentialStoryboardStateV1 = z.infer<
  typeof StagedSequentialStoryboardStateV1Schema
>;
export type StagedSequentialStoryboardMetadataV1 = z.infer<
  typeof StagedSequentialStoryboardMetadataV1Schema
>;
export type StagedOperationRequestV1 = z.infer<
  typeof StagedOperationRequestV1Schema
>;
export type StagedCheckpointApprovalExpectationV1 = z.infer<
  typeof StagedCheckpointApprovalExpectationV1Schema
>;

export function isCheckpointApprovalMatch(
  checkpoint: HumanApprovalCheckpointV1,
  expected: StagedCheckpointApprovalExpectationV1
): boolean {
  if (checkpoint.state !== "approved") return false;
  if (checkpoint.consumedAt || checkpoint.consumedByOperationId) return false;
  return (
    checkpoint.revision === expected.revision &&
    checkpoint.contentHash === expected.contentHash &&
    checkpoint.approvedHash === expected.contentHash &&
    checkpoint.approvedModel === expected.model &&
    checkpoint.approvedProvider === expected.provider &&
    checkpoint.approvedSafetyVerdict === expected.safetyVerdict &&
    checkpoint.approvedReferenceManifestHash ===
      expected.referenceManifestHash &&
    checkpoint.estimatedCredits === expected.estimatedCredits &&
    checkpoint.approvedByUserId !== null &&
    checkpoint.approvedAt !== null
  );
}

export function validateNineShotContract(
  shots: Array<{ durationSeconds?: number; shotId?: number }>
): { valid: boolean; reasonCodes: StagedSafeReasonCode[] } {
  const valid =
    shots.length === 9 &&
    shots.every(
      (shot, index) =>
        shot.shotId === index + 1 && shot.durationSeconds === 10
    );
  return valid
    ? { valid: true, reasonCodes: [] }
    : { valid: false, reasonCodes: ["staged_invalid_shot_contract"] };
}

export function buildStagedApprovalIdempotencyKey(input: {
  runId: string;
  checkpointId: string;
  revision: number;
  contentHash: string;
}): string {
  return `${input.runId}:${input.checkpointId}:${input.revision}:${input.contentHash}`;
}
