/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 12 §5.2. Observability event catalog, sanitizer, JSONL/DB
 * dual-write emitters, dedupe bookkeeping, the per-mode comparison metrics
 * recorder, and the loop-effect audit seam production implementation.
 *
 * Deliberately kept OUT of `marketplaceAutoReviewService.ts` (SVC): SVC is
 * ~27k lines with concurrent editors, and this module must be importable by
 * tests without dragging the whole service graph in. It imports only
 * `auditLogger`, `getDb`, `drizzle/schema` (for the dual-write), and node
 * `crypto`.
 *
 * Hard invariants (spec §1/§8, repeated here because they gate T11):
 *   1. No numeric GA threshold anywhere in this module. This records facts
 *      (counts, denominators, rates) only; humans pin pass/fail numbers at
 *      the pilot review.
 *   2. Zero behavior change. Every emit path is try/catch-wrapped and never
 *      throws, blocks, retries, or alters an accept/repair decision.
 *   3. No content leakage: ids, hashes, lengths, counts, codes only — never
 *      prompts, dialogue, image URLs, or base64. `sanitizeMarketplaceAutoReviewAuditMetadata`
 *      runs INSIDE the emitter so a careless call site cannot leak.
 */
import crypto from "node:crypto";
import { auditLogger, type AuditEventType } from "./auditLogger";
import { getDb } from "../db";
import { apiAuditEvents } from "../../drizzle/schema";

/* -------------------------------------------------------------------------- */
/* 1. Event catalog (frozen — renames require updating the SVC call sites,   */
/*    the GA runbook, and T1)                                                */
/* -------------------------------------------------------------------------- */

export const MARKETPLACE_AUTO_REVIEW_AUDIT_EVENTS = [
  "sequential_skill_plan_round",
  "sequential_prompt_degraded_fallback",
  "final_image_prompt_over_provider_budget",
  "final_video_prompt_over_provider_budget",
  "sequential_reference_angles_trimmed",
  "marketplace_review_evidence_guard_occurrence",
  "marketplace_review_mode_metrics",
] as const satisfies readonly AuditEventType[];

export type MarketplaceAutoReviewAuditEventName =
  (typeof MARKETPLACE_AUTO_REVIEW_AUDIT_EVENTS)[number];

const MARKETPLACE_AUTO_REVIEW_AUDIT_EVENT_SET: ReadonlySet<string> = new Set(
  MARKETPLACE_AUTO_REVIEW_AUDIT_EVENTS
);

export function isMarketplaceAutoReviewAuditEventName(
  value: string
): value is MarketplaceAutoReviewAuditEventName {
  return MARKETPLACE_AUTO_REVIEW_AUDIT_EVENT_SET.has(value);
}

export type MarketplaceAutoReviewAuditContext = {
  runId: string;
  tenantId?: string | null;
  userId?: number | null;
  productId?: string | null;
  frameStrategy:
    | "storyboard_3x3_split"
    | "video_shot_start_stop"
    | "sequential_shot_storyboard";
  stageKey?: string | null;
};

/* -------------------------------------------------------------------------- */
/* 2. Trace id                                                                */
/* -------------------------------------------------------------------------- */

/**
 * sha256(runId|event|key).slice(0,32) — the SAME id is used for the JSONL
 * line and the `api_audit_events` row so the two surfaces join.
 * `api_audit_events.traceId` is `varchar(32)`; the SVC media trace-id format
 * (`marketplace-auto-review-image:<runId>:<unitId>:<n>`) does not fit, so
 * every emit path in this module goes through this derivation instead of a
 * raw copy.
 */
export function buildMarketplaceAutoReviewAuditTraceId(
  context: MarketplaceAutoReviewAuditContext,
  event: string,
  key?: string
): string {
  const seed = [context.runId ?? "", event, key ?? ""].join("|");
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

/* -------------------------------------------------------------------------- */
/* 3. Payload sanitizer (secret/PII rules, CLAUDE.md verbatim)                */
/* -------------------------------------------------------------------------- */

const CONTENT_BEARING_EXACT_KEYS = new Set([
  "url",
  "resulturl",
  "referenceimageurls",
  "imageurl",
  "thumbnailurl",
  "prompt",
  "prompttext",
  "dialogue",
]);

const MAX_SANITIZE_STRING_LENGTH = 300;
const MAX_SANITIZE_ARRAY_LENGTH = 50;
const MAX_SANITIZE_DEPTH = 6;
const URL_SUBSTRING_PATTERN = /https?:\/\/\S+/gi;

function isContentBearingKey(key: string): boolean {
  const normalized = key.toLowerCase();
  if (CONTENT_BEARING_EXACT_KEYS.has(normalized)) return true;
  return normalized.includes("base64");
}

/** Never emitted at all — no hash, no length, nothing. PII, not content. */
function isDropOnlyKey(key: string): boolean {
  return key.toLowerCase().includes("email");
}

function hashForAudit(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function redactUrlSubstrings(value: string): string {
  return value.replace(URL_SUBSTRING_PATTERN, "[URL_REDACTED]");
}

function sanitizeSurvivingString(value: string): string {
  const redacted = redactUrlSubstrings(value);
  if (redacted.length <= MAX_SANITIZE_STRING_LENGTH) return redacted;
  return `${redacted.slice(0, MAX_SANITIZE_STRING_LENGTH)}…[TRUNCATED ${redacted.length} chars]`;
}

function sanitizeContentBearingValue(
  key: string,
  value: unknown,
  result: Record<string, unknown>
): void {
  if (typeof value === "string" && value) {
    result[`${key}Hash`] = hashForAudit(value);
    result[`${key}LengthChars`] = value.length;
    return;
  }
  if (Array.isArray(value)) {
    const strings = value.filter(
      (item): item is string => typeof item === "string" && item.length > 0
    );
    if (strings.length > 0) {
      result[`${key}Hash`] = hashForAudit(strings.join("|"));
      result[`${key}Count`] = strings.length;
    } else if (value.length > 0) {
      result[`${key}Count`] = value.length;
    }
    return;
  }
  // Non-string, non-array content value (object/number/boolean/null): drop —
  // no meaningful hash/length can be derived without risking a leak.
}

function sanitizeAny(value: unknown, depth: number): unknown {
  if (depth > MAX_SANITIZE_DEPTH) return "[DEPTH_EXCEEDED]";
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return sanitizeSurvivingString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const capped =
      value.length > MAX_SANITIZE_ARRAY_LENGTH
        ? value.slice(0, MAX_SANITIZE_ARRAY_LENGTH)
        : value;
    return capped.map(item => sanitizeAny(item, depth + 1));
  }
  if (typeof value === "object") {
    return sanitizeObject(value as Record<string, unknown>, depth);
  }
  // functions, symbols, bigint, etc. — never serialize.
  return undefined;
}

function sanitizeObject(
  obj: Record<string, unknown>,
  depth: number
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(obj)) {
    if (raw === undefined) continue;
    if (isDropOnlyKey(key)) continue;
    if (isContentBearingKey(key)) {
      sanitizeContentBearingValue(key, raw, result);
      continue;
    }
    const sanitized = sanitizeAny(raw, depth + 1);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

/**
 * Drops URLs/prompt text/base64/email, hashes what it drops (as
 * `<key>Hash`/`<key>LengthChars` or `<key>Count`), truncates surviving
 * strings, caps arrays, and — as a final defense-in-depth pass — strips any
 * `http(s)://` substring that reaches a value through a key this function
 * does not otherwise recognize as content-bearing.
 */
export function sanitizeMarketplaceAutoReviewAuditMetadata(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  try {
    return sanitizeObject(metadata ?? {}, 0);
  } catch (error) {
    console.warn(
      "[marketplaceAutoReviewObservability] sanitizeMarketplaceAutoReviewAuditMetadata failed",
      error
    );
    return {};
  }
}

/* -------------------------------------------------------------------------- */
/* 4. Emitters (JSONL always; DB dual-write for the two safety/GA events)     */
/* -------------------------------------------------------------------------- */

/**
 * JSONL only. Sync. NEVER throws — wrapped in try/catch, logs a
 * `console.warn` on failure and returns normally either way.
 */
export function emitMarketplaceAutoReviewAuditEvent(params: {
  event: MarketplaceAutoReviewAuditEventName;
  context: MarketplaceAutoReviewAuditContext;
  metadata: Record<string, unknown>;
  dedupeKey?: string;
}): void {
  try {
    const traceId = buildMarketplaceAutoReviewAuditTraceId(
      params.context,
      params.event,
      params.dedupeKey
    );
    const envelope = {
      runId: params.context.runId ?? null,
      tenantId: params.context.tenantId ?? null,
      productId: params.context.productId ?? null,
      frameStrategy: params.context.frameStrategy ?? null,
      stageKey: params.context.stageKey ?? null,
      ...params.metadata,
    };
    const sanitized = sanitizeMarketplaceAutoReviewAuditMetadata(envelope);
    auditLogger.log({
      traceId,
      eventType: params.event,
      userId: params.context.userId ?? null,
      tenantId: params.context.tenantId ?? null,
      metadata: sanitized,
    });
  } catch (error) {
    console.warn(
      "[marketplaceAutoReviewObservability] emitMarketplaceAutoReviewAuditEvent failed",
      error
    );
  }
}

/**
 * `api_audit_events` dual-write for the two safety/GA-relevant events.
 * Best-effort; awaited but never rethrows (mirrors
 * `recordVerticalDramaSystemFailureAuditEvent`'s two-independent-try/catch
 * precedent — the JSONL line above is written regardless of this outcome).
 */
export async function recordMarketplaceAutoReviewAuditEventRow(params: {
  event: "marketplace_review_evidence_guard_occurrence" | "marketplace_review_mode_metrics";
  context: MarketplaceAutoReviewAuditContext;
  metadata: Record<string, unknown>;
  traceId: string;
}): Promise<void> {
  try {
    const envelope = {
      runId: params.context.runId ?? null,
      tenantId: params.context.tenantId ?? null,
      productId: params.context.productId ?? null,
      frameStrategy: params.context.frameStrategy ?? null,
      stageKey: params.context.stageKey ?? null,
      ...params.metadata,
    };
    const sanitized = sanitizeMarketplaceAutoReviewAuditMetadata(envelope);
    const db = getDb();
    await db.insert(apiAuditEvents).values({
      traceId: params.traceId,
      eventType: params.event,
      userId: params.context.userId ?? null,
      statusCode: 200,
      metadata: sanitized,
    });
  } catch (error) {
    console.warn(
      "[marketplaceAutoReviewObservability] recordMarketplaceAutoReviewAuditEventRow failed",
      error
    );
  }
}

/* -------------------------------------------------------------------------- */
/* 5. Dedupe bookkeeping (resume-safe, bounded state)                        */
/* -------------------------------------------------------------------------- */

export type MarketplaceAutoReviewObservabilityState = {
  metricsVersion: 1;
  /** Bounded (cap 200, FIFO drop). */
  emittedEventKeys: string[];
  modeMetrics?: MarketplaceAutoReviewModeMetrics;
};

const EMITTED_EVENT_KEY_CAP = 200;

/**
 * PURE. `null` ⇒ already emitted (skip). Non-null ⇒ emit, then persist the
 * returned state (caller's responsibility — this function never touches
 * metadata/DB itself).
 */
export function claimMarketplaceAutoReviewAuditEventKey(
  state: MarketplaceAutoReviewObservabilityState | undefined,
  dedupeKey: string
): MarketplaceAutoReviewObservabilityState | null {
  const current: MarketplaceAutoReviewObservabilityState = state ?? {
    metricsVersion: 1,
    emittedEventKeys: [],
  };
  const existingKeys = Array.isArray(current.emittedEventKeys)
    ? current.emittedEventKeys
    : [];
  if (existingKeys.includes(dedupeKey)) return null;
  const nextKeys = [...existingKeys, dedupeKey];
  const bounded =
    nextKeys.length > EMITTED_EVENT_KEY_CAP
      ? nextKeys.slice(nextKeys.length - EMITTED_EVENT_KEY_CAP)
      : nextKeys;
  return { ...current, emittedEventKeys: bounded };
}

/* -------------------------------------------------------------------------- */
/* 6. Per-event pure payload builders                                        */
/* -------------------------------------------------------------------------- */

const SEQUENTIAL_ROUND_SCORE_DIMENSIONS = [
  "evidence_accuracy",
  "product_consistency",
  "narrative_quality",
  "dialogue_continuity",
  "visual_feasibility",
  "compliance_safety",
  "prompt_completeness",
  "length_compliance",
] as const;

/** Mirrors the skill config candidate-count ceiling (spec §16.4 default 3). */
const SEQUENTIAL_ROUND_CANDIDATE_COUNT_CEILING = 3;

/**
 * §5.5 — after each persisted loop round. Missing/NaN score dimensions are
 * omitted (never coerced to 0); `candidateCount` is capped at the skill
 * config ceiling.
 */
export function buildSequentialSkillPlanRoundEventPayload(input: {
  context: MarketplaceAutoReviewAuditContext;
  round: number;
  raw: Record<string, unknown>;
}): Record<string, unknown> {
  const scores: Record<string, number> = {};
  for (const dimension of SEQUENTIAL_ROUND_SCORE_DIMENSIONS) {
    const value = input.raw[dimension];
    if (typeof value === "number" && Number.isFinite(value)) {
      scores[dimension] = value;
    }
  }
  const candidates = Array.isArray(input.raw.candidates)
    ? input.raw.candidates
    : [];
  return {
    runId: input.context.runId ?? null,
    frameStrategy: input.context.frameStrategy,
    round: input.round,
    model: typeof input.raw.model === "string" ? input.raw.model : null,
    totalScore:
      typeof input.raw.totalScore === "number" &&
      Number.isFinite(input.raw.totalScore)
        ? input.raw.totalScore
        : null,
    scores,
    candidateCount: Math.min(
      candidates.length,
      SEQUENTIAL_ROUND_CANDIDATE_COUNT_CEILING
    ),
    retained: input.raw.retained === true,
    disqualifiers: Array.isArray(input.raw.disqualifiers)
      ? input.raw.disqualifiers.filter(
          (item): item is string => typeof item === "string"
        )
      : [],
    durationMs:
      typeof input.raw.durationMs === "number" &&
      Number.isFinite(input.raw.durationMs)
        ? input.raw.durationMs
        : null,
    degraded: false,
  };
}

/** Default prompt count for a Feature 136 sequential pack (spec-wide: 9 shots). */
const SEQUENTIAL_STORYBOARD_PROMPT_COUNT_FOR_OBSERVABILITY = 9;

/**
 * §5.5 — every loop round failed structurally. `retryHistorySummary` carries
 * error CLASSES only (the runner's own `status` discriminator, e.g.
 * `"invocation_failed"` / `"contract_violation"`) — never the raw `error`
 * message or `reasons[]`, which may echo partial model output.
 */
export function buildSequentialPromptDegradedFallbackEventPayload(input: {
  context: MarketplaceAutoReviewAuditContext;
  raw: Record<string, unknown>;
}): Record<string, unknown> {
  const retryHistory = Array.isArray(input.raw.retryHistory)
    ? (input.raw.retryHistory as Record<string, unknown>[])
    : [];
  const retryHistorySummary = retryHistory
    .map(entry => {
      const round = typeof entry.round === "number" ? entry.round : null;
      if (round === null) return null;
      const errorClass =
        typeof entry.status === "string" && entry.status
          ? entry.status
          : "unknown";
      return { round, errorClass };
    })
    .filter(
      (entry): entry is { round: number; errorClass: string } => entry !== null
    );
  return {
    runId: input.context.runId ?? null,
    frameStrategy: input.context.frameStrategy,
    reason:
      typeof input.raw.reason === "string" && input.raw.reason
        ? input.raw.reason
        : "structural_validation_exhausted",
    roundsAttempted: retryHistory.length,
    retryHistorySummary,
    promptCount:
      typeof input.raw.promptCount === "number"
        ? input.raw.promptCount
        : SEQUENTIAL_STORYBOARD_PROMPT_COUNT_FOR_OBSERVABILITY,
  };
}

/**
 * §5.5 — the over-budget optimizer wrapper (image and video). `stillOverBudget`
 * is derived from the already-present lengths (never fabricated); `promptHash`
 * is passed through only if the caller already computed one (this builder
 * never sees prompt text, so it cannot compute a hash itself).
 */
export function buildFinalPromptOverBudgetEventPayload(input: {
  context: MarketplaceAutoReviewAuditContext;
  raw: Record<string, unknown>;
}): Record<string, unknown> {
  const optimizedLengthChars =
    typeof input.raw.optimizedLengthChars === "number"
      ? input.raw.optimizedLengthChars
      : null;
  const maxOutputChars =
    typeof input.raw.maxOutputChars === "number"
      ? input.raw.maxOutputChars
      : null;
  return {
    runId: input.context.runId ?? null,
    frameStrategy: input.context.frameStrategy,
    promptKind:
      typeof input.raw.promptKind === "string" ? input.raw.promptKind : null,
    sourceLengthChars:
      typeof input.raw.sourceLengthChars === "number"
        ? input.raw.sourceLengthChars
        : null,
    optimizedLengthChars,
    maxOutputChars,
    rewriteAttempt:
      typeof input.raw.attempt === "number" ? input.raw.attempt : null,
    stillOverBudget:
      optimizedLengthChars !== null && maxOutputChars !== null
        ? optimizedLengthChars > maxOutputChars
        : null,
    promptHash:
      typeof input.raw.promptHash === "string" ? input.raw.promptHash : null,
    shotId: typeof input.raw.shotId === "string" ? input.raw.shotId : null,
    unitId: typeof input.raw.unitId === "string" ? input.raw.unitId : null,
  };
}

/** §5.5/T7 — capacity trim in the resolver plan. `ref` is an opaque asset ref, never a URL. */
export function buildSequentialReferenceAnglesTrimmedEventPayload(input: {
  context: MarketplaceAutoReviewAuditContext;
  modelCap: number;
  attachedAngleCount: number;
  trimmedAngles: ReadonlyArray<{ ref: string; angleLabel?: string | null }>;
  reservedRoles?: readonly string[];
}): Record<string, unknown> {
  return {
    runId: input.context.runId ?? null,
    frameStrategy: input.context.frameStrategy,
    modelCap: input.modelCap,
    attachedAngleCount: input.attachedAngleCount,
    trimmedAngles: input.trimmedAngles.map(entry => ({
      ref: entry.ref,
      angleLabel: entry.angleLabel ?? null,
    })),
    reservedRoles: Array.isArray(input.reservedRoles)
      ? input.reservedRoles
      : [],
  };
}

/** Deterministic once-per-run-per-signature dedupe key (T7). */
export function buildSequentialReferenceAnglesTrimmedDedupeKey(input: {
  modelCap: number;
  trimmedAngles: ReadonlyArray<{ ref: string }>;
}): string {
  const refs = input.trimmedAngles
    .map(entry => entry.ref)
    .slice()
    .sort()
    .join(",");
  return `angles_trimmed:${input.modelCap}:${refs}`;
}

/** The four codes the guardian/assembly guard package may report (section-07). */
export const MARKETPLACE_AUTO_REVIEW_EVIDENCE_GUARD_OCCURRENCE_CODES = [
  "guardian_presence_missing",
  "guardian_directive_missing",
  "assembly_content_unverified",
  "assembly_demo_unverified",
] as const;
export type MarketplaceAutoReviewEvidenceGuardOccurrenceCode =
  (typeof MARKETPLACE_AUTO_REVIEW_EVIDENCE_GUARD_OCCURRENCE_CODES)[number];

const EVIDENCE_GUARD_OCCURRENCE_CODE_SET: ReadonlySet<string> = new Set(
  MARKETPLACE_AUTO_REVIEW_EVIDENCE_GUARD_OCCURRENCE_CODES
);

/**
 * T8 — `null` when the code is unrecognized or the guard is off (no throw,
 * no emit either way; the caller no-ops on `null`).
 */
export function buildEvidenceGuardOccurrenceEventPayload(input: {
  context: MarketplaceAutoReviewAuditContext;
  code: string;
  shotId: string;
  stage: "qa" | "preflight";
  repairAttempt?: number | null;
  guardEnabled: boolean;
}): Record<string, unknown> | null {
  if (!input.guardEnabled) return null;
  if (!EVIDENCE_GUARD_OCCURRENCE_CODE_SET.has(input.code)) return null;
  return {
    runId: input.context.runId ?? null,
    frameStrategy: input.context.frameStrategy,
    code: input.code,
    shotId: input.shotId ?? null,
    stage: input.stage,
    repairAttempt:
      typeof input.repairAttempt === "number" ? input.repairAttempt : 0,
    guardEnabled: true,
  };
}

/* -------------------------------------------------------------------------- */
/* 7. Loop-effect seam production implementation                             */
/* -------------------------------------------------------------------------- */

/**
 * Production implementation of section-04's
 * `SequentialStoryboardLoopEffects.emitAudit`. Dispatches the loop runner's
 * three self-emitted events (round / degraded-fallback / over-budget) to the
 * shaped, sanitized, catalog-checked emitter. Any event name outside the
 * frozen catalog — or any error while shaping/emitting — is swallowed;
 * this function never throws and never blocks the caller.
 */
export function buildSequentialLoopAuditEffect(
  context: MarketplaceAutoReviewAuditContext
): (event: string, payload: Record<string, unknown>) => void {
  return (event: string, payload: Record<string, unknown>): void => {
    try {
      if (!isMarketplaceAutoReviewAuditEventName(event)) return;
      const raw = payload ?? {};
      switch (event) {
        case "sequential_skill_plan_round": {
          const round = Number(raw.round);
          if (!Number.isFinite(round)) return;
          const shaped = buildSequentialSkillPlanRoundEventPayload({
            context,
            round,
            raw,
          });
          emitMarketplaceAutoReviewAuditEvent({
            event,
            context,
            metadata: shaped,
            dedupeKey: `round:${round}`,
          });
          return;
        }
        case "sequential_prompt_degraded_fallback": {
          const shaped = buildSequentialPromptDegradedFallbackEventPayload({
            context,
            raw,
          });
          emitMarketplaceAutoReviewAuditEvent({
            event,
            context,
            metadata: shaped,
            dedupeKey: "degraded_fallback",
          });
          return;
        }
        case "final_image_prompt_over_provider_budget":
        case "final_video_prompt_over_provider_budget": {
          const shaped = buildFinalPromptOverBudgetEventPayload({
            context,
            raw,
          });
          emitMarketplaceAutoReviewAuditEvent({
            event,
            context,
            metadata: shaped,
          });
          return;
        }
        default:
          // sequential_reference_angles_trimmed / evidence-guard occurrence /
          // mode-metrics are emitted from SVC directly (it owns metadata +
          // dedupe-state persistence) — this loop-effect seam has no
          // metadata write access, so it is not the right place for them.
          return;
      }
    } catch (error) {
      console.warn(
        "[marketplaceAutoReviewObservability] buildSequentialLoopAuditEffect failed",
        error
      );
    }
  };
}

/* -------------------------------------------------------------------------- */
/* 8. Combined emit+DB helpers for the two dual-write events (SVC call sites) */
/* -------------------------------------------------------------------------- */

/** Thin SVC call-site helper (§5.5 guard-occurrence row). Never throws. */
export async function recordMarketplaceAutoReviewEvidenceGuardOccurrence(params: {
  context: MarketplaceAutoReviewAuditContext;
  code: string;
  shotId: string;
  stage: "qa" | "preflight";
  repairAttempt?: number | null;
  guardEnabled: boolean;
}): Promise<void> {
  const payload = buildEvidenceGuardOccurrenceEventPayload(params);
  if (!payload) return;
  const dedupeKey = `guard:${params.code}:${params.shotId}:${params.repairAttempt ?? 0}`;
  const traceId = buildMarketplaceAutoReviewAuditTraceId(
    params.context,
    "marketplace_review_evidence_guard_occurrence",
    dedupeKey
  );
  emitMarketplaceAutoReviewAuditEvent({
    event: "marketplace_review_evidence_guard_occurrence",
    context: params.context,
    metadata: payload,
    dedupeKey,
  });
  await recordMarketplaceAutoReviewAuditEventRow({
    event: "marketplace_review_evidence_guard_occurrence",
    context: params.context,
    metadata: payload,
    traceId,
  });
}

/** Thin SVC call-site helper (§5.5 mode-metrics row). Never throws. */
export async function recordMarketplaceAutoReviewModeMetricsEvent(params: {
  context: MarketplaceAutoReviewAuditContext;
  metrics: MarketplaceAutoReviewModeMetrics;
  dedupeKey?: string;
}): Promise<void> {
  const dedupeKey =
    params.dedupeKey ?? `mode_metrics:${params.metrics.frameStrategy}`;
  const traceId = buildMarketplaceAutoReviewAuditTraceId(
    params.context,
    "marketplace_review_mode_metrics",
    dedupeKey
  );
  const metadata = params.metrics as unknown as Record<string, unknown>;
  emitMarketplaceAutoReviewAuditEvent({
    event: "marketplace_review_mode_metrics",
    context: params.context,
    metadata,
    dedupeKey,
  });
  await recordMarketplaceAutoReviewAuditEventRow({
    event: "marketplace_review_mode_metrics",
    context: params.context,
    metadata,
    traceId,
  });
}

/* -------------------------------------------------------------------------- */
/* 9. Mode-comparison metrics recorder (facts only — see hard invariant #1)   */
/* -------------------------------------------------------------------------- */

export type MarketplaceAutoReviewModeMetrics = {
  metricsVersion: 1;
  runId: string;
  frameStrategy: string;
  evidenceGuardEnabled: boolean;
  qualityMode?: string | null;

  // denominators — always reported alongside every rate
  evaluatedUnits: number;
  frameEquivalents: number;
  acceptedFrameCount: number;
  attemptCount: number;
  repairAttemptCount: number;

  // counters
  reasonCodeCounts: Record<string, number>;
  productReferenceMismatchCount: number;
  storyboardContinuityMismatchCount: number;
  publishSafetyBlockCount: number;
  guardianOccurrenceCount: number;
  assemblyOccurrenceCount: number;

  // derived (null when the denominator is 0 — never NaN, never 0-as-unknown)
  productReferenceMismatchRate: number | null;
  storyboardContinuityMismatchRate: number | null;
  repairAttemptsPerAcceptedFrame: number | null;
  meanQualityScore: number | null;

  computedAt: string;
};

// Mirrors SVC's private `imageReasonCodeBlocksPublishSafety` regex/exact-code
// class closely enough for OBSERVABILITY purposes (this module must not
// import SVC internals). This never gates anything — it only counts.
const PUBLISH_SAFETY_REASON_CODE_PATTERN =
  /^guardian_presence_missing$|shirtless|bare[_-]?(?:chest|torso)|(?:diaper|underwear)[_-]?only|nudit|semi[_-]?nude/i;
const GUARDIAN_OCCURRENCE_REASON_CODES = new Set([
  "guardian_presence_missing",
  "guardian_directive_missing",
]);
const ASSEMBLY_OCCURRENCE_REASON_CODES = new Set([
  "assembly_content_unverified",
  "assembly_demo_unverified",
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cleanReasonCodeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => (typeof item === "string" ? item.trim() : ""))
    .filter((item): item is string => item.length > 0);
}

/**
 * PURE. Reads `unitOutcomes[]` when present (sequential, section-06 §5.10),
 * else falls back to attempt-level `unitIds`/`reasonCodes` (3x3 by attempt
 * wave, legacy start_stop by unit). Never throws on malformed/legacy rows.
 */
export function buildMarketplaceAutoReviewModeMetrics(input: {
  runId: string;
  frameStrategy: string;
  evidenceGuardEnabled: boolean;
  qualityMode?: string | null;
  imageAttemptReviews: readonly Record<string, unknown>[];
  acceptedFrameUrls?: readonly string[];
}): MarketplaceAutoReviewModeMetrics {
  const reviews = Array.isArray(input.imageAttemptReviews)
    ? input.imageAttemptReviews
    : [];

  const reasonCodeCounts: Record<string, number> = {};
  const qualityScores: number[] = [];
  let repairAttemptCount = 0;
  let publishSafetyBlockCount = 0;
  let guardianOccurrenceCount = 0;
  let assemblyOccurrenceCount = 0;

  const tallyReasonCodes = (codes: string[]) => {
    let hasPublishSafety = false;
    let hasGuardian = false;
    let hasAssembly = false;
    for (const code of codes) {
      reasonCodeCounts[code] = (reasonCodeCounts[code] ?? 0) + 1;
      if (PUBLISH_SAFETY_REASON_CODE_PATTERN.test(code)) hasPublishSafety = true;
      if (GUARDIAN_OCCURRENCE_REASON_CODES.has(code)) hasGuardian = true;
      if (ASSEMBLY_OCCURRENCE_REASON_CODES.has(code)) hasAssembly = true;
    }
    if (hasPublishSafety) publishSafetyBlockCount += 1;
    if (hasGuardian) guardianOccurrenceCount += 1;
    if (hasAssembly) assemblyOccurrenceCount += 1;
  };

  // Sequential: dedupe unitOutcomes by unitId across all entries (an entry
  // re-snapshots every currently-known unit, so multiple attempt-review
  // entries would otherwise double-count); latest occurrence wins.
  const sequentialUnitsByUnitId = new Map<string, Record<string, unknown>>();
  let sawSequentialUnits = false;
  let gridWaveCount = 0;
  let sawGridWave = false;
  let legacyUnitEquivalentCount = 0;
  let sawLegacyUnit = false;

  for (const rawEntry of reviews) {
    const entry = (rawEntry ?? {}) as Record<string, unknown>;
    // T9 — "frameStrategy falls back to the run's strategy when an older
    // review entry lacks the tag" (pre-section-06 rows never carried it).
    const entryStrategy =
      (typeof entry.frameStrategy === "string" && entry.frameStrategy) ||
      input.frameStrategy;
    const unitOutcomes = Array.isArray(entry.unitOutcomes)
      ? entry.unitOutcomes
      : [];

    if (entryStrategy === "sequential_shot_storyboard" && unitOutcomes.length > 0) {
      sawSequentialUnits = true;
      for (const rawOutcome of unitOutcomes) {
        const outcome = (rawOutcome ?? {}) as Record<string, unknown>;
        const unitId = typeof outcome.unitId === "string" ? outcome.unitId : "";
        if (!unitId) continue;
        sequentialUnitsByUnitId.set(unitId, outcome);
      }
    } else if (entryStrategy === "storyboard_3x3_split") {
      sawGridWave = true;
      gridWaveCount += 1;
      tallyReasonCodes(cleanReasonCodeList(entry.reasonCodes));
      if (isFiniteNumber(entry.qualityScore)) qualityScores.push(entry.qualityScore);
      const repairRefs = Array.isArray(entry.repairRefs) ? entry.repairRefs : [];
      repairAttemptCount += repairRefs.length;
    } else {
      // Legacy / start_stop fallback: attempt-level unitIds + reasonCodes.
      // Coarse (reasonCodes are attempt-flat, not per-unit) but never throws.
      sawLegacyUnit = true;
      const unitIds = Array.isArray(entry.unitIds)
        ? entry.unitIds.filter(
            (id): id is string => typeof id === "string" && id.length > 0
          )
        : [];
      legacyUnitEquivalentCount += unitIds.length > 0 ? unitIds.length : 1;
      tallyReasonCodes(cleanReasonCodeList(entry.reasonCodes));
      if (isFiniteNumber(entry.qualityScore)) qualityScores.push(entry.qualityScore);
      const repairRefs = Array.isArray(entry.repairRefs) ? entry.repairRefs : [];
      repairAttemptCount += repairRefs.length;
    }
  }

  let evaluatedUnits = 0;
  let frameEquivalents = 0;
  if (sawSequentialUnits) {
    for (const outcome of sequentialUnitsByUnitId.values()) {
      evaluatedUnits += 1;
      tallyReasonCodes(cleanReasonCodeList(outcome.reasonCodes));
      if (isFiniteNumber(outcome.qualityScore)) qualityScores.push(outcome.qualityScore);
      if (isFiniteNumber(outcome.repairAttempts)) {
        repairAttemptCount += outcome.repairAttempts;
      }
    }
    frameEquivalents = evaluatedUnits; // 1 sequential unit = 1 frame
  } else if (sawGridWave) {
    evaluatedUnits = gridWaveCount;
    frameEquivalents = gridWaveCount * 9; // one grid artifact covers 9 cells
  } else if (sawLegacyUnit) {
    evaluatedUnits = legacyUnitEquivalentCount;
    frameEquivalents = legacyUnitEquivalentCount; // 1 legacy unit = 1 frame
  }

  const acceptedFrameCount = Array.isArray(input.acceptedFrameUrls)
    ? input.acceptedFrameUrls.length
    : 0;

  const productReferenceMismatchCount =
    reasonCodeCounts["product_reference_mismatch"] ?? 0;
  const storyboardContinuityMismatchCount =
    reasonCodeCounts["storyboard_continuity_mismatch"] ?? 0;

  const meanQualityScore =
    qualityScores.length > 0
      ? qualityScores.reduce((sum, value) => sum + value, 0) / qualityScores.length
      : null;

  return {
    metricsVersion: 1,
    runId: input.runId,
    frameStrategy: input.frameStrategy,
    evidenceGuardEnabled: input.evidenceGuardEnabled,
    qualityMode: input.qualityMode ?? null,

    evaluatedUnits,
    frameEquivalents,
    acceptedFrameCount,
    attemptCount: reviews.length,
    repairAttemptCount,

    reasonCodeCounts,
    productReferenceMismatchCount,
    storyboardContinuityMismatchCount,
    publishSafetyBlockCount,
    guardianOccurrenceCount,
    assemblyOccurrenceCount,

    productReferenceMismatchRate:
      evaluatedUnits > 0 ? productReferenceMismatchCount / evaluatedUnits : null,
    storyboardContinuityMismatchRate:
      evaluatedUnits > 0 ? storyboardContinuityMismatchCount / evaluatedUnits : null,
    repairAttemptsPerAcceptedFrame:
      acceptedFrameCount > 0 ? repairAttemptCount / acceptedFrameCount : null,
    meanQualityScore,

    computedAt: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* 10. Persistence surfaces (no migration — existing JSONB columns only)      */
/* -------------------------------------------------------------------------- */

/**
 * Writes `metadataJson.observability = {metricsVersion, modeMetrics,
 * emittedEventKeys}`, preserving any pre-existing `emittedEventKeys` and
 * every unrelated metadata key.
 */
export function applyMarketplaceAutoReviewModeMetricsToMetadata(
  metadata: Record<string, unknown>,
  metrics: MarketplaceAutoReviewModeMetrics
): Record<string, unknown> {
  const existing = (metadata?.observability ?? {}) as Partial<MarketplaceAutoReviewObservabilityState>;
  const emittedEventKeys = Array.isArray(existing.emittedEventKeys)
    ? existing.emittedEventKeys
    : [];
  const observability: MarketplaceAutoReviewObservabilityState = {
    metricsVersion: 1,
    modeMetrics: metrics,
    emittedEventKeys,
  };
  return {
    ...metadata,
    observability,
  };
}

/**
 * Shared builder for `persistMarketplaceAutoReviewStageAttemptSnapshot`'s
 * `evidenceJson` (SVC) — extracted here so the insert and the
 * `onConflictDoUpdate.set` copies cannot drift (§5.7). Byte-identical to
 * today's `{schemaVersion, providerReconciliationId, repairLedgerId,
 * qaArtifactManifestId}` shape when there are no image attempt reviews; adds
 * a compact `modeMetrics` object only when there are.
 */
export function buildMarketplaceAutoReviewStageAttemptEvidenceJson(input: {
  runId: string;
  frameStrategy: string;
  evidenceGuardEnabled: boolean;
  qualityMode?: string | null;
  providerReconciliationId: string;
  repairLedgerId: string;
  qaArtifactManifestId: string;
  imageAttemptReviews: readonly Record<string, unknown>[];
}): Record<string, unknown> {
  const base = {
    schemaVersion: 1 as const,
    providerReconciliationId: input.providerReconciliationId,
    repairLedgerId: input.repairLedgerId,
    qaArtifactManifestId: input.qaArtifactManifestId,
  };
  const reviews = Array.isArray(input.imageAttemptReviews)
    ? input.imageAttemptReviews
    : [];
  if (reviews.length === 0) return base;
  const modeMetrics = buildMarketplaceAutoReviewModeMetrics({
    runId: input.runId,
    frameStrategy: input.frameStrategy,
    evidenceGuardEnabled: input.evidenceGuardEnabled,
    qualityMode: input.qualityMode ?? null,
    imageAttemptReviews: reviews,
  });
  return { ...base, modeMetrics };
}
