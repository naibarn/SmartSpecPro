/**
 * Feature 142 — section-04: the persisted QA ledger (shared, pure).
 *
 * `video_projects.qaLedger` (jsonb — already exists on the table, section-05
 * of Feature 133, previously unused) stores every quality-review round ever
 * run for a project. This module is the ONLY place the merge/trim logic
 * lives; `server/services/videoProjectRepo.ts`'s `appendQaLedgerEntry` is the
 * only caller that touches Postgres — this file has no I/O of its own.
 *
 * `review`'s shape is declared STRUCTURALLY here rather than imported from
 * `server/services/videoProjectQualityLoop.ts` — `shared/` must never carry a
 * runtime dependency on `server/` (section-04 spec §6.1). Keep this type
 * assignment-compatible with `VideoProjectReview` if that type ever changes.
 */

/** Structural mirror of `VideoProjectReview["issues"][number]`
 *  (`server/services/videoProjectQualityLoop.ts`). Kept here only so
 *  `QaLedgerReview` has no runtime import into `server/`. */
export type QaLedgerReviewIssue = {
  dimension: string;
  severity: "low" | "medium" | "high";
  message: string;
  repairStage?: string;
};

/** Structural mirror of `VideoProjectReview` — see this file's header. */
export type QaLedgerReview = {
  score: number;
  scorecard: Record<string, number>;
  issues: QaLedgerReviewIssue[];
  repairInstructions?: Array<{ stage: string; instruction: string }>;
};

/** One persisted review round. Written to `video_projects.qaLedger` (jsonb). */
export type QaLedgerEntry = {
  /** ISO timestamp. */
  at: string;
  /** 1-based round index within the loop run that produced this entry. */
  round: number;
  /** Document revision this review judged. */
  revision: number;
  review: QaLedgerReview;
  /** REPORTED by `callLLMStructured` — never charged by this feature. */
  creditsUsed: number;
  /** Model actually served (may differ from the requested id on a provider
   *  fallback). */
  modelId: string | null;
  /** Joins this review to its `providerUsageLog` row. */
  traceId: string;
};

/** Column shape. The Drizzle `$type` is `Record<string, unknown>`, so the
 *  ledger is always an object wrapper, never a bare array. */
export type QaLedger = { entries: QaLedgerEntry[]; totalCount: number };

/** Max entries physically retained; older ones drop while `totalCount` keeps
 *  counting every review ever recorded. Bounds unbounded jsonb growth on a
 *  long-lived project. */
export const QA_LEDGER_MAX_ENTRIES = 50;

/**
 * Normalises whatever is currently stored in `video_projects.qaLedger` into
 * a well-formed `QaLedger`. Tolerates `null`, a legacy bare array, or any
 * other malformed/non-object value by treating it as an empty ledger rather
 * than throwing — a corrupt ledger must never block a review that was
 * already paid for from being recorded.
 */
function normalizeExistingLedger(existing: unknown): QaLedger {
  if (
    existing !== null &&
    typeof existing === "object" &&
    !Array.isArray(existing) &&
    Array.isArray((existing as { entries?: unknown }).entries)
  ) {
    const candidate = existing as { entries: unknown[]; totalCount?: unknown };
    const totalCount =
      typeof candidate.totalCount === "number" && Number.isFinite(candidate.totalCount)
        ? candidate.totalCount
        : candidate.entries.length;
    return { entries: candidate.entries as QaLedgerEntry[], totalCount };
  }
  // null, a legacy bare array, or any other malformed/non-object value.
  return { entries: [], totalCount: 0 };
}

/**
 * PURE. Appends `entry` to whatever ledger is already stored, retaining only
 * the newest `QA_LEDGER_MAX_ENTRIES` entries while `totalCount` keeps
 * counting every review ever recorded (never trimmed). Never mutates
 * `existing` — always returns a new object/array.
 */
/**
 * ADDITIVE (Feature 142, section-06) — read-only normalisation, exported so a
 * caller (the `quality_repair` executor) can read the newest stored review
 * without duplicating `normalizeExistingLedger`'s tolerant-parsing rules.
 * Never writes; safe to call on a value that was never written by this
 * module.
 */
export function readQaLedger(existing: unknown): QaLedger {
  return normalizeExistingLedger(existing);
}

export function mergeQaLedger(existing: unknown, entry: QaLedgerEntry): QaLedger {
  const normalized = normalizeExistingLedger(existing);
  const nextEntries = [...normalized.entries, entry];
  const trimmedEntries =
    nextEntries.length > QA_LEDGER_MAX_ENTRIES
      ? nextEntries.slice(nextEntries.length - QA_LEDGER_MAX_ENTRIES)
      : nextEntries;

  return { entries: trimmedEntries, totalCount: normalized.totalCount + 1 };
}
