/**
 * Feature 142 — section-08: real observability for Video Intelligence.
 *
 * Sections 01–07 built the feature; three of the four `spec.md` §11 alert
 * signals had no emitter (see this section's spec §1.1). This module is the
 * single choke point for all four:
 *
 *  - `queue_registered` / `queue_registration_missing` — a boot self-check
 *    for the BullMQ queue+worker registration `videoIntelligenceJobs.ts`
 *    already logs as a plain `console.log` line.
 *  - `stage_job_stuck_queued` — the orphan sweep's own findings, reported
 *    instead of healed silently.
 *  - `structured_output_violation` — every structured-output contract
 *    failure (not just a revocation), the numerator of the schema-failure
 *    rate.
 *  - `recommended_model_revoked` — owned by
 *    `videoIntelligenceModelResolver.ts`; listed here only so the alert
 *    contract lives in one place. This module never emits it itself.
 *
 * All four ride ONE audit event type (`"video_project_stage"`,
 * discriminated by `metadata.event`) so a single query covers them. These
 * strings ARE the alert contract — renaming one breaks the sensor and any
 * dashboard query keyed on it (spec §8 trap #3).
 *
 * EVERY exported function swallows its own errors. Observability must never
 * be able to fail a stage — the recorded failure mode elsewhere in this repo
 * is a reporting call throwing inside a `catch` block and masking the real
 * error (spec §8 trap #5).
 *
 * In-process only: this module has no Redis/DB of its own. It is a bounded,
 * allocation-light rollup (counters + a fixed-size ring of recent
 * timestamps, never a growing array of events) that a single web process
 * keeps in memory. The `videoIntelligenceHealth` sensor additionally reads a
 * bounded tail of the audit JSONL so a signal emitted by a DIFFERENT web
 * instance still counts — this module's own in-process state is a fast path,
 * not the only path.
 */
import { auditLogger, type AuditEventType } from "./auditLogger";

/** All four VI observability signals ride ONE audit event type so a single
 *  query covers them: eventType "video_project_stage", discriminated by
 *  metadata.event. These strings ARE the alert contract — renaming one
 *  breaks the sensor and any dashboard query keyed on it. */
export const VI_OBSERVABILITY_EVENTS = {
  queueRegistered: "queue_registered",
  queueRegistrationMissing: "queue_registration_missing",
  stageJobStuckQueued: "stage_job_stuck_queued",
  structuredOutputViolation: "structured_output_violation",
  /** Owned by section-02 (`videoIntelligenceModelResolver.ts`); listed here
   *  so the alert contract lives in one place. This module never emits it. */
  recommendedModelRevoked: "recommended_model_revoked",
} as const;

/** How long after `armVideoIntelligenceRegistrationCheck()` the self-check
 *  fires. If registration has not been marked by then, the ABSENCE of the
 *  boot log becomes a positive audit event an alert can key on (spec §11,
 *  last row). */
export const VI_REGISTRATION_CHECK_DELAY_MS = 60_000;

/** Rolling window for the schema-failure rate's numerator/denominator. */
const SCHEMA_FAILURE_RATE_WINDOW_MS = 15 * 60 * 1000;

/** Bounded ring sizes — this module must never hold a growing array. */
const MAX_TRACKED_SCHEMA_FAILURE_TIMESTAMPS = 500;
const MAX_TRACKED_STAGE_RUN_TIMESTAMPS = 500;
/** Cap on the reported job-id list so a mass outage cannot bloat the audit
 *  row (spec §5.6). */
const MAX_REPORTED_STUCK_QUEUED_JOB_IDS = 50;

type LogAuditFn = (entry: Record<string, unknown>) => void;

function defaultLogAudit(entry: Record<string, unknown>): void {
  auditLogger.log(entry as unknown as Parameters<typeof auditLogger.log>[0]);
}

/* -------------------------------------------------------------------------- */
/* In-process state                                                          */
/* -------------------------------------------------------------------------- */

let queueRegistered = false;
let registeredAt: string | null = null;
let registrationCheckFired = false;
let registrationCheckTimer: ReturnType<typeof setTimeout> | null = null;

let stuckQueuedJobIds: string[] = [];
let lastSweepAt: string | null = null;

let schemaFailureTimestampsMs: number[] = [];
let stageRunTimestampsMs: number[] = [];

let lastRevokedModelId: string | null = null;
let lastRevokedAt: string | null = null;

/** Test-only reset — production code never calls this; the module is a
 *  process-lifetime singleton. */
export function __resetVideoIntelligenceObservabilityStateForTests(): void {
  queueRegistered = false;
  registeredAt = null;
  registrationCheckFired = false;
  if (registrationCheckTimer) {
    clearTimeout(registrationCheckTimer);
    registrationCheckTimer = null;
  }
  stuckQueuedJobIds = [];
  lastSweepAt = null;
  schemaFailureTimestampsMs = [];
  stageRunTimestampsMs = [];
  lastRevokedModelId = null;
  lastRevokedAt = null;
}

function pruneWindow(timestampsMs: number[], nowMs: number, windowMs: number): number[] {
  return timestampsMs.filter(ts => nowMs - ts <= windowMs);
}

function pushBounded(timestampsMs: number[], value: number, maxLength: number): number[] {
  const next = [...timestampsMs, value];
  if (next.length > maxLength) {
    return next.slice(next.length - maxLength);
  }
  return next;
}

/* -------------------------------------------------------------------------- */
/* Registration signal                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Called by `videoIntelligenceJobs.ts` immediately after it logs
 * `"[video_intelligence_jobs] queue + worker registered"`. Emits
 * `queue_registered` and disarms the self-check. Never throws.
 */
export function markVideoIntelligenceQueueRegistered(
  detail?: { workerConcurrency?: number },
  deps?: { logAudit?: LogAuditFn; now?: () => number },
): void {
  try {
    const now = deps?.now ?? Date.now;
    queueRegistered = true;
    registeredAt = new Date(now()).toISOString();
    clearVideoIntelligenceRegistrationCheck();

    const logAudit = deps?.logAudit ?? defaultLogAudit;
    logAudit({
      eventType: "video_project_stage" as AuditEventType,
      traceId: null,
      userId: null,
      metadata: {
        stage: "video_intelligence_jobs",
        phase: "finish",
        event: VI_OBSERVABILITY_EVENTS.queueRegistered,
        workerConcurrency: detail?.workerConcurrency ?? null,
      },
    });
  } catch {
    // Observability must never be able to fail a stage or startup.
  }
}

/**
 * Arms the one-shot self-check. Called BEFORE (and regardless of) BullMQ
 * init succeeding — it matters most when BullMQ is broken. The timer is
 * `.unref()`ed so it never holds the process (or a test) open.
 */
export function armVideoIntelligenceRegistrationCheck(deps?: {
  now?: () => number;
  /** Test-only seam — production always uses the default audit logger. */
  logAudit?: LogAuditFn;
}): void {
  try {
    if (registrationCheckTimer) return;
    const now = deps?.now ?? Date.now;
    const logAudit = deps?.logAudit ?? defaultLogAudit;
    registrationCheckTimer = setTimeout(() => {
      try {
        registrationCheckFired = true;
        if (!queueRegistered) {
          logAudit({
            eventType: "video_project_stage" as AuditEventType,
            traceId: null,
            userId: null,
            metadata: {
              stage: "video_intelligence_jobs",
              phase: "finish",
              event: VI_OBSERVABILITY_EVENTS.queueRegistrationMissing,
              checkedAt: new Date(now()).toISOString(),
            },
          });
        }
      } catch {
        // Observability must never be able to fail a stage or startup.
      }
    }, VI_REGISTRATION_CHECK_DELAY_MS);
    registrationCheckTimer.unref?.();
  } catch {
    // Observability must never be able to fail a stage or startup.
  }
}

export function clearVideoIntelligenceRegistrationCheck(): void {
  try {
    if (registrationCheckTimer) {
      clearTimeout(registrationCheckTimer);
      registrationCheckTimer = null;
    }
  } catch {
    // Observability must never be able to fail a stage or startup.
  }
}

/* -------------------------------------------------------------------------- */
/* Sweep findings                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Reported by the orphan sweep once per tick. Emits `stage_job_stuck_queued`
 * ONLY when `stuckQueued` is non-empty — a clean sweep must generate no
 * alert noise (spec §8 trap #6).
 */
export function reportVideoIntelligenceSweepFindings(
  findings: { requeued: string[]; failed: string[]; stuckQueued: string[] },
  deps?: { logAudit?: LogAuditFn; now?: () => number },
): void {
  try {
    const now = deps?.now ?? Date.now;
    lastSweepAt = new Date(now()).toISOString();
    const stuckQueued = Array.isArray(findings.stuckQueued) ? findings.stuckQueued : [];
    stuckQueuedJobIds = stuckQueued.slice(0, MAX_REPORTED_STUCK_QUEUED_JOB_IDS);

    if (stuckQueued.length === 0) return;

    const logAudit = deps?.logAudit ?? defaultLogAudit;
    logAudit({
      eventType: "video_project_stage" as AuditEventType,
      traceId: null,
      userId: null,
      metadata: {
        stage: "video_intelligence_jobs",
        phase: "finish",
        event: VI_OBSERVABILITY_EVENTS.stageJobStuckQueued,
        jobIds: stuckQueuedJobIds,
        totalStuck: stuckQueued.length,
      },
    });
  } catch {
    // Observability must never be able to fail the sweep.
  }
}

/* -------------------------------------------------------------------------- */
/* Schema-failure signal                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Emitted for EVERY structured-output contract failure, revoked or not —
 * this is the numerator of the schema-failure-rate alert (spec §11 row 3).
 * Distinct from section-02's `recommended_model_revoked`, which stays
 * revocation-only.
 */
export function reportVideoIntelligenceSchemaFailure(
  args: { stage: string; modelId: string | null; traceId: string; issuePathCount: number },
  deps?: { logAudit?: LogAuditFn; now?: () => number },
): void {
  try {
    const now = deps?.now ?? Date.now;
    const nowMs = now();
    schemaFailureTimestampsMs = pushBounded(
      pruneWindow(schemaFailureTimestampsMs, nowMs, SCHEMA_FAILURE_RATE_WINDOW_MS),
      nowMs,
      MAX_TRACKED_SCHEMA_FAILURE_TIMESTAMPS,
    );

    const logAudit = deps?.logAudit ?? defaultLogAudit;
    logAudit({
      eventType: "video_project_stage" as AuditEventType,
      traceId: args.traceId,
      userId: null,
      metadata: {
        stage: args.stage,
        phase: "finish",
        event: VI_OBSERVABILITY_EVENTS.structuredOutputViolation,
        modelId: args.modelId,
        issuePathCount: args.issuePathCount,
      },
    });
  } catch {
    // Observability must never be able to fail a stage.
  }
}

/**
 * Counts a stage run so the schema-failure RATE has an honest denominator.
 * Called from the executor's finish path (both success and failure). Never
 * throws.
 */
export function recordVideoIntelligenceStageRun(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for a
  // future per-stage breakdown; today the denominator is feature-wide.
  stage: string,
  deps?: { now?: () => number },
): void {
  try {
    const now = deps?.now ?? Date.now;
    const nowMs = now();
    stageRunTimestampsMs = pushBounded(
      pruneWindow(stageRunTimestampsMs, nowMs, SCHEMA_FAILURE_RATE_WINDOW_MS),
      nowMs,
      MAX_TRACKED_STAGE_RUN_TIMESTAMPS,
    );
  } catch {
    // Observability must never be able to fail a stage.
  }
}

/* -------------------------------------------------------------------------- */
/* Rollup                                                                     */
/* -------------------------------------------------------------------------- */

/** In-process rollup the sensor reads. Bounded, allocation-light. */
export function getVideoIntelligenceObservabilityState(deps?: { now?: () => number }): {
  queueRegistered: boolean;
  registeredAt: string | null;
  registrationCheckFired: boolean;
  stuckQueuedJobIds: string[];
  lastSweepAt: string | null;
  schemaFailuresLast15Min: number;
  stageRunsLast15Min: number;
  lastRevokedModelId: string | null;
  lastRevokedAt: string | null;
} {
  try {
    const now = deps?.now ?? Date.now;
    const nowMs = now();
    const schemaFailuresLast15Min = pruneWindow(
      schemaFailureTimestampsMs,
      nowMs,
      SCHEMA_FAILURE_RATE_WINDOW_MS,
    ).length;
    const stageRunsLast15Min = pruneWindow(
      stageRunTimestampsMs,
      nowMs,
      SCHEMA_FAILURE_RATE_WINDOW_MS,
    ).length;

    return {
      queueRegistered,
      registeredAt,
      registrationCheckFired,
      stuckQueuedJobIds: [...stuckQueuedJobIds],
      lastSweepAt,
      schemaFailuresLast15Min,
      stageRunsLast15Min,
      lastRevokedModelId,
      lastRevokedAt,
    };
  } catch {
    // Observability must never throw — return a safe, empty rollup.
    return {
      queueRegistered: false,
      registeredAt: null,
      registrationCheckFired: false,
      stuckQueuedJobIds: [],
      lastSweepAt: null,
      schemaFailuresLast15Min: 0,
      stageRunsLast15Min: 0,
      lastRevokedModelId: null,
      lastRevokedAt: null,
    };
  }
}
