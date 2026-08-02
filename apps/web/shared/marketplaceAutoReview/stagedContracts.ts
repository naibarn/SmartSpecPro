import { z } from "zod";

export const STAGED_PLANNING_ARCHITECTURE = "staged_two_skill_v2" as const;
export const STAGED_PLANNING_ARCHITECTURE_VERSION = 1 as const;
export const STAGED_HUMAN_APPROVAL_POLICY = "all_checkpoints_required" as const;

export const STAGED_CHECKPOINT_KINDS = [
  "story_plan",
  "image_prompt",
  "image_result",
  "video_prompt",
  "video_result",
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
  "staged_video_duration_fitted_to_model",
  "staged_tone_not_adhered",
  "staged_structure_beat_missing",
  "staged_conversation_turns_missing",
  // P1 (marketplace-staged-skill-first-restore): non-blocking validator
  // warning when a compiled image prompt doesn't reference every expected
  // @ImageN character tag. Never triggers a TS code-append — see
  // `handleImageProvider`'s validator comment.
  "staged_prompt_reference_mapping_incomplete",
  // P2 (marketplace-staged-skill-first-restore): a shot's skill-authored
  // prompt attempt failed (or returned empty) and the bounded deterministic
  // fallback (`compileStagedImagePrompt`) was used instead.
  "staged_prompt_skill_fallback",
  // W1 (marketplace-flexible-shots-and-creation-casting): the story-arc plan
  // is LLM-judgment when cast is present or shotCount="auto" (see
  // `generateStagedStoryArcPlanWithLLM`), and the LLM attempt failed or
  // returned an invalid shot contract, so the bounded deterministic fallback
  // (`buildStagedStoryArcPlan`) was used instead.
  "staged_story_skill_fallback",
  // marketplace-staged-remotion-final-render: the Remotion render-queue
  // submission (`submitStagedRemotionFinalRender`) failed or the feature was
  // disabled, so the run fell back to the legacy Python renderer for this
  // final render instead of blocking the run.
  "staged_remotion_render_fallback",
  // marketplace-staged-remotion-final-render: a `remotion_render_video`
  // worker job that this staged run submitted itself failed — surfaced on
  // the "render" stage's `blocked_needs_user` statusDetail, retryable.
  "staged_remotion_render_failed",
  // worker-app-remotion-render-video §P3: the `remotion_render_video` worker
  // job this staged run submitted sat `queued` (never claimed by a Lane B
  // worker-app) past the queued TTL, so the run fell back to the legacy
  // renderer instead of waiting indefinitely for an offline fleet.
  "staged_remotion_worker_unavailable",
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
    // Additive, optional. Fail-open QC warnings from
    // `assessStagedPlanAdherence` (tone/structure/conversation-turns
    // adherence for the story_plan checkpoint) — informational only, never
    // blocks approval. Absent on every checkpoint kind other than
    // `story_plan`, and absent/empty when nothing was flagged, so existing
    // persisted checkpoints keep validating unchanged.
    adherenceWarnings: z.array(z.string()).optional(),
  })
  .passthrough()
  .superRefine((value, context) => {
    const isShotCheckpoint =
      value.kind === "image_prompt" ||
      value.kind === "image_result" ||
      value.kind === "video_prompt" ||
      value.kind === "video_result";
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

// Additive: a single turn in a two-person conversation shot. Kept structurally
// independent from `StagedDialogueTurn` in `marketplaceAutoReviewStoryArcPlanner.ts`
// (shared/ must not import from server/) but shape-compatible with it.
export const StagedDialogueTurnV1Schema = z.object({
  castId: z.string().min(1),
  speakerName: z.string().min(1),
  line: z.string(),
});

/** What a SUPPORTING character does in one shot — `action` required, `line`
 *  optional (the inverse of a dialogue turn). See
 *  `planning/marketplace-four-character-cast/plan.md` §3: a supporting
 *  character in frame must serve the story, never just stand there. */
export const StagedSupportingBeatV1Schema = z.object({
  castId: z.string().min(1),
  action: z.string().min(1),
  line: z.string().optional(),
});

/** One cast member's per-shot look override — see `castLooks` below. */
export const StagedCastLookV1Schema = z.object({
  url: z.string().min(1),
  portraitAssetId: z.string().optional(),
  /** The VD variant row this look came from, so the switcher can show which
   *  option is currently active without re-matching on URL. */
  vdCharacterId: z.string().optional(),
  variantLabel: z.string().optional(),
});

export const StagedShotStateV1Schema = z
  .object({
    shotId: z.number().int().positive(),
    revision: z.number().int().positive(),
    state: z.string().min(1),
    storySummary: z.string().min(1),
    dialogue: z.string(),
    // Additive (opt-in): populated only when the shot is part of a
    // two-person conversation. Absent for every existing solo/product-only
    // run, so previously-persisted rows keep validating unchanged.
    dialogueTurns: z.array(StagedDialogueTurnV1Schema).optional(),
    // Which cast members are IN this shot. Historically written as the whole
    // cast for every shot; from the 4-character roster
    // (`planning/marketplace-four-character-cast/plan.md` P1) it is a real
    // per-shot subset and it drives which character reference images the
    // shot's start frame receives. Absent = "everyone", the legacy meaning.
    castInShot: z.array(z.string().min(1)).optional(),
    // Per-shot LOOK override, keyed by castId
    // (`planning/marketplace-four-character-cast/plan.md` §4): swaps which
    // image represents that person in THIS shot only. A look is an outfit, not
    // a person, so it never consumes a roster slot. Absent for every existing
    // run.
    castLooks: z.record(StagedCastLookV1Schema).optional(),
    supportingBeats: z.array(StagedSupportingBeatV1Schema).optional(),
    imagePromptHash: z.string().min(1).nullable(),
    imageArtifactHash: z.string().min(1).nullable(),
    videoPromptHash: z.string().min(1).nullable(),
    videoArtifactHash: z.string().min(1).nullable(),
  })
  .passthrough();

export const StagedSequentialStoryboardStateV1Schema = z
  .object({
    storyPlanStatus: z.enum([
      "not_ready",
      "awaiting",
      "approved",
      "redraft_queued",
    ]),
    planRevision: z.number().int().positive(),
    storyPlanHash: z.string().min(1).nullable(),
    referenceManifestHash: z.string().min(1).nullable(),
    // Additive (feature/marketplace-flexible-shots): staged runs may now use
    // 1..30 shots (fixed N chosen by the user, or model-decided within
    // 7..30 when shotCount="auto"). Old 9-shot runs still validate.
    shots: z.array(StagedShotStateV1Schema).min(1).max(30),
    reviewCheckpoints: z.array(HumanApprovalCheckpointV1Schema),
  })
  .passthrough();

export const StagedPlanReviewEnvelopeV1Schema = z
  .object({
    required: z.literal(true),
    status: z.enum(["awaiting", "redraft_queued", "approved"]),
    planRevision: z.number().int().positive(),
    approvedRevision: z.number().int().positive().nullable(),
    redraftCount: z.number().int().nonnegative(),
    lastOperationId: z.string().min(1).nullable(),
  })
  .passthrough();

export const StagedSequentialStoryboardMetadataV1Schema = z
  .object({
    planningArchitecture: z.literal(STAGED_PLANNING_ARCHITECTURE),
    planningArchitectureVersion: z.literal(
      STAGED_PLANNING_ARCHITECTURE_VERSION
    ),
    humanApprovalPolicy: z.literal(STAGED_HUMAN_APPROVAL_POLICY),
    planReview: StagedPlanReviewEnvelopeV1Schema,
    stagedSequentialStoryboard: StagedSequentialStoryboardStateV1Schema,
  })
  .passthrough();

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
export type StagedDialogueTurnV1 = z.infer<typeof StagedDialogueTurnV1Schema>;

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

// Duration is model-flexible (Veo 3.1 Lite only supports 8s; seedance/kling
// support up to ~30s on newer model releases) so we accept an integer range
// instead of a literal 10. The pipeline layer is responsible for snapping the
// requested duration to whatever the selected model supports and recording
// `staged_video_duration_fitted_to_model` when it does.
const STAGED_SHOT_DURATION_MIN_SECONDS = 4;
const STAGED_SHOT_DURATION_MAX_SECONDS = 30;
const STAGED_SHOT_COUNT_MIN = 1;
const STAGED_SHOT_COUNT_MAX = 30;

// Additive (feature/marketplace-flexible-shots): generalized shot-contract
// validator. When `expectedCount` is supplied, the shot array must contain
// exactly that many shots (ids 1..expectedCount). When omitted, any count in
// [1, 30] is accepted (ids must still be 1..N unique ascending) — this is the
// "auto" case where the LLM decided the shot count.
export function validateStagedShotContract(
  shots: Array<{ durationSeconds?: number; shotId?: number }>,
  options?: { expectedCount?: number }
): { valid: boolean; reasonCodes: StagedSafeReasonCode[] } {
  const expectedCount = options?.expectedCount;
  const countValid =
    typeof expectedCount === "number"
      ? shots.length === expectedCount
      : shots.length >= STAGED_SHOT_COUNT_MIN &&
        shots.length <= STAGED_SHOT_COUNT_MAX;
  const valid =
    countValid &&
    shots.every(
      (shot, index) =>
        shot.shotId === index + 1 &&
        typeof shot.durationSeconds === "number" &&
        Number.isInteger(shot.durationSeconds) &&
        shot.durationSeconds >= STAGED_SHOT_DURATION_MIN_SECONDS &&
        shot.durationSeconds <= STAGED_SHOT_DURATION_MAX_SECONDS
    );
  return valid
    ? { valid: true, reasonCodes: [] }
    : { valid: false, reasonCodes: ["staged_invalid_shot_contract"] };
}

/**
 * @deprecated Use `validateStagedShotContract(shots, { expectedCount: 9 })`
 * directly for new call sites. Kept as a thin wrapper so existing importers
 * (and their tests) that assumed a fixed 9-shot contract keep working
 * unchanged.
 */
export function validateNineShotContract(
  shots: Array<{ durationSeconds?: number; shotId?: number }>
): { valid: boolean; reasonCodes: StagedSafeReasonCode[] } {
  return validateStagedShotContract(shots, { expectedCount: 9 });
}

export function buildStagedApprovalIdempotencyKey(input: {
  runId: string;
  checkpointId: string;
  revision: number;
  contentHash: string;
}): string {
  return `${input.runId}:${input.checkpointId}:${input.revision}:${input.contentHash}`;
}
