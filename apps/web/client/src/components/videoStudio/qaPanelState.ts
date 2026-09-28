/**
 * Feature 142, section-07 — pure QA-panel state derivation. Zero React,
 * zero trpc: every input this module reads is `unknown`-shaped at runtime
 * (Redis job records, jsonb ledger round-trips) and every function here
 * normalises defensively instead of throwing, so a malformed value never
 * crashes the panel — it degrades to "empty"/"absent" instead.
 *
 * Precedent for a pure-logic sibling of a stateful panel:
 * `createDefaultDocument.ts` (+ its own test) in this same folder.
 */
import { readQaLedger, type QaLedgerEntry, type QaLedgerReview } from "@shared/videoIntelligence/qaLedger";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

/**
 * Client-side alias. This file must never import `server/` — the review
 * shape lives structurally in `shared/videoIntelligence/qaLedger.ts` as
 * `QaLedgerReview`, kept assignment-compatible with the server's
 * `VideoProjectReview` (see that file's header for the rationale).
 */
export type VideoProjectReview = QaLedgerReview;

export type StagePanelStatus = "loading" | "empty" | "running" | "success" | "error";

export type QaReviewView = {
  status: StagePanelStatus;
  /** Newest ledger entry, or the just-finished job's review. */
  latest: QaLedgerEntry | null;
  /** Previous entry, for the before/after delta the interview requires. */
  previous: QaLedgerEntry | null;
  /** TRUE when the document moved on since `latest` was produced. */
  isStale: boolean;
  staleReason: "revision_changed" | "unsaved_changes" | null;
  /** Actual credits reported by the finished job record, if any. */
  actualCreditsUsed: number | null;
  /** TRUE when the job terminated `failed` — credits may still have been spent. */
  failedButPossiblyBilled: boolean;
  errorMessage: string | null;
};

type NormalizedJobStatus = {
  status: "queued" | "running" | "succeeded" | "failed";
  error: string | null;
  result: unknown;
};

/** Defensive normalisation — `jobStatus` is `unknown` at the call site
 *  (a Redis-round-tripped job record). Never throws. */
function normalizeJobStatus(jobStatus: unknown): NormalizedJobStatus | null {
  if (!jobStatus || typeof jobStatus !== "object") return null;
  const candidate = jobStatus as Record<string, unknown>;
  const status = candidate.status;
  if (
    status !== "queued" &&
    status !== "running" &&
    status !== "succeeded" &&
    status !== "failed"
  ) {
    return null;
  }
  return {
    status,
    error: typeof candidate.error === "string" ? candidate.error : null,
    result: "result" in candidate ? candidate.result : undefined,
  };
}

function readActualCreditsUsed(result: unknown): number | null {
  if (!result || typeof result !== "object") return null;
  const candidate = (result as Record<string, unknown>).creditsUsed;
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

/**
 * PURE. `jobStatus` / `qaLedger` are `unknown`-shaped at runtime (Redis and
 * jsonb round-trips) — normalise defensively, never throw.
 *
 * Staleness rule (exact): `isStale` is true when either
 * `latest.revision !== projectRevision` (-> "revision_changed") OR
 * `hasUnsavedChanges === true` (-> "unsaved_changes"); `revision_changed`
 * wins when both hold. A stale review is still returned as `latest` — never
 * hidden, never presented as current.
 */
export function deriveQaReviewView(args: {
  qaLedger: unknown;
  projectRevision: number;
  hasUnsavedChanges: boolean;
  jobStatus: unknown;
}): QaReviewView {
  const ledger = readQaLedger(args.qaLedger);
  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const latest = entries.length > 0 ? entries[entries.length - 1] : null;
  const previous = entries.length > 1 ? entries[entries.length - 2] : null;

  const job = normalizeJobStatus(args.jobStatus);

  let status: StagePanelStatus;
  let errorMessage: string | null = null;
  let actualCreditsUsed: number | null = null;
  let failedButPossiblyBilled = false;

  if (job && (job.status === "queued" || job.status === "running")) {
    status = "running";
  } else if (job && job.status === "failed") {
    status = "error";
    errorMessage = job.error;
    // A provider call that succeeded and then failed schema validation is
    // already billed by `callLLMStructured` — never imply a failed stage
    // was free (spec §7 trap #4).
    failedButPossiblyBilled = true;
  } else if (latest) {
    status = "success";
    if (job && job.status === "succeeded") {
      actualCreditsUsed = readActualCreditsUsed(job.result);
    }
  } else {
    status = "empty";
  }

  let staleReason: "revision_changed" | "unsaved_changes" | null = null;
  if (latest) {
    if (latest.revision !== args.projectRevision) {
      staleReason = "revision_changed";
    } else if (args.hasUnsavedChanges) {
      staleReason = "unsaved_changes";
    }
  }

  return {
    status,
    latest,
    previous,
    isStale: staleReason !== null,
    staleReason,
    actualCreditsUsed,
    failedButPossiblyBilled,
    errorMessage,
  };
}

const SEVERITY_ORDER = ["high", "medium", "low", "unknown"] as const;
type IssueSeverityGroup = (typeof SEVERITY_ORDER)[number];

/** PURE. Ordered high -> medium -> low; unknown severities sort last, never
 *  dropped. Empty groups are omitted from the result. */
export function groupIssuesBySeverity(
  review: Pick<VideoProjectReview, "issues">,
): Array<{ severity: IssueSeverityGroup; issues: VideoProjectReview["issues"] }> {
  const buckets: Record<IssueSeverityGroup, VideoProjectReview["issues"]> = {
    high: [],
    medium: [],
    low: [],
    unknown: [],
  };

  for (const issue of review.issues ?? []) {
    const severity = issue?.severity as string | undefined;
    if (severity === "high" || severity === "medium" || severity === "low") {
      buckets[severity].push(issue);
    } else {
      buckets.unknown.push(issue);
    }
  }

  return SEVERITY_ORDER.filter(severity => buckets[severity].length > 0).map(severity => ({
    severity,
    issues: buckets[severity],
  }));
}

/**
 * PURE. Primary source is the finished job's `blocksFinalRender`. When no
 * job result is present, falls back to an ADVISORY check on the local
 * document (`claims[].status` in {prohibited, unsupported}) — labelled in
 * the UI as derived from the document, never presented as the server
 * verdict.
 */
export function deriveClaimBlock(args: {
  document: VideoProjectDocument;
  jobResult: unknown;
}): { blocked: boolean; source: "job" | "document"; offendingClaimCount: number } {
  const offendingClaims = args.document.claims.filter(
    claim => claim.status === "prohibited" || claim.status === "unsupported",
  );

  if (
    args.jobResult &&
    typeof args.jobResult === "object" &&
    typeof (args.jobResult as Record<string, unknown>).blocksFinalRender === "boolean"
  ) {
    return {
      blocked: (args.jobResult as Record<string, unknown>).blocksFinalRender as boolean,
      source: "job",
      offendingClaimCount: offendingClaims.length,
    };
  }

  return {
    blocked: offendingClaims.length > 0,
    source: "document",
    offendingClaimCount: offendingClaims.length,
  };
}

/** Zero-cost repair stages consume no LLM call (plan §7.1). */
export const ZERO_COST_REPAIR_STAGES = ["captions", "scenes", "motion"] as const;
export const LLM_REPAIR_STAGES = ["content", "narration", "claims"] as const;

export function isZeroCostRepairStage(stage: string): boolean {
  return (ZERO_COST_REPAIR_STAGES as readonly string[]).includes(stage);
}
