/**
 * Feature 142 — section-08: credit-integrity builders for Video Intelligence.
 *
 * The feature charges nothing today (AD-7) — every LLM call this feature
 * makes is charged exactly once by `callLLMStructured` itself, and this
 * router/executor pair never calls `deductCredits` (locked by an fs source
 * guard in `videoIntelligenceNonDuplicationGuards.test.ts`). These two
 * builders exist so that the FIRST charge anyone ever adds to this feature is
 * correct by construction instead of repeating a mistake this repo has
 * already made once.
 *
 * Deviation note: `server/services/creditService.ts` has no
 * `clampCreditTraceId` export today (the spec's platform-code table lists it
 * as pre-existing, but it does not exist in this checkout). This module
 * implements the equivalent clamp itself — `CREDIT_TRACE_ID_MAX_LENGTH` +
 * the truncation in `buildVideoIntelligenceCreditContext` — since §4.2's
 * contract for this file is self-contained and does not actually import that
 * symbol.
 */
import type { VideoIntelligenceStage } from "./videoProjectStageEstimator";

/** Max length of `creditTransactions.traceId`. The column is `varchar(32)`;
 *  a longer id previously caused a Postgres `22001` (value too long for
 *  type) that killed a live render (spec §9.4 rule 6). */
export const CREDIT_TRACE_ID_MAX_LENGTH = 32;

/**
 * `vi:<jobId>:<stage>` — BullMQ can redeliver a succeeded job, and
 * `deductCredits` returns the ORIGINAL transaction for a repeated
 * idempotency key instead of charging twice (spec §9.4 rule 5). Throws on a
 * blank `jobId`/`stage`: a silently-empty key would make every charge for
 * every job collide on the same key.
 */
export function buildVideoIntelligenceIdempotencyKey(
  jobId: string,
  stage: VideoIntelligenceStage,
): string {
  const trimmedJobId = typeof jobId === "string" ? jobId.trim() : "";
  const trimmedStage = typeof stage === "string" ? stage.trim() : "";
  if (!trimmedJobId) {
    throw new Error("buildVideoIntelligenceIdempotencyKey: jobId must not be blank");
  }
  if (!trimmedStage) {
    throw new Error("buildVideoIntelligenceIdempotencyKey: stage must not be blank");
  }
  return `vi:${trimmedJobId}:${trimmedStage}`;
}

/**
 * Everything a future credit call needs, shaped so the `varchar(32)` column
 * can never overflow: `traceId` is clamped to `CREDIT_TRACE_ID_MAX_LENGTH`,
 * and ALL rich context goes into `metadata`, which is unbounded JSON.
 *
 * 🔴 Secret-safety: `metadata` carries ids, stage names, model NAMES and
 * numbers only — never prompt text, never catalog credentials, never
 * decrypted values.
 */
export function buildVideoIntelligenceCreditContext(args: {
  jobId: string;
  stage: VideoIntelligenceStage;
  traceId: string;
  projectId: number;
  modelId: string | null;
}): {
  idempotencyKey: string;
  traceId: string;
  metadata: Record<string, unknown>;
} {
  const idempotencyKey = buildVideoIntelligenceIdempotencyKey(args.jobId, args.stage);
  const rawTraceId = typeof args.traceId === "string" ? args.traceId : "";
  const traceId = rawTraceId.slice(0, CREDIT_TRACE_ID_MAX_LENGTH);

  return {
    idempotencyKey,
    traceId,
    metadata: {
      jobId: args.jobId,
      stage: args.stage,
      projectId: args.projectId,
      modelId: args.modelId,
    },
  };
}
