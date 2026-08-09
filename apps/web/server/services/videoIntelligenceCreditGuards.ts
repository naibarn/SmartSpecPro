/**
 * Feature 142 — section-08: credit-integrity builders for Video Intelligence.
 *
 * implementation-progress.md gap #2 (CLOSED): the header note below used to
 * claim "the feature charges nothing today" — that stopped being true the
 * moment `routers/videoProjects.ts`'s narration-TTS charge
 * (`synthesizeProjectNarration`'s `deductCredits` call) started building its
 * idempotency key/context through this module instead of calling
 * `deductCredits` with no key at all. Every OTHER LLM call this feature makes
 * is still charged exactly once by `callLLMStructured` itself, and
 * `videoIntelligenceNonDuplicationGuards.test.ts`'s "no Video Intelligence
 * SERVICE imports deductCredits" guard still holds — it explicitly excludes
 * `routers/videoProjects.ts` (see that test's own "is EXCLUDED from this
 * guard" case), which is the only file that ever calls `deductCredits` for
 * this feature. These two builders exist so that every charge this feature
 * adds is correct by construction instead of repeating a mistake this repo
 * has already made once.
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
 *
 * `stage` additionally accepts `"narration"` (gap #2 fix) — the narration TTS
 * charge in `routers/videoProjects.ts` is a synchronous mutation, not a
 * BullMQ job, so it has no real `jobId`; its caller passes a deterministic
 * stand-in built from request-invariant data instead (see that call site's
 * own comment for exactly what it does and does not dedupe).
 */
export function buildVideoIntelligenceIdempotencyKey(
  jobId: string,
  stage: VideoIntelligenceStage | "narration",
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
  stage: VideoIntelligenceStage | "narration";
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
