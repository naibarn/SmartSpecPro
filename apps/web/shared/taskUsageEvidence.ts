import { z } from "zod";

/**
 * A deliberately small, read-only representation of usage receipts.  It is
 * safe to project into an operator UI: provider request/selection payloads
 * are intentionally not accepted here.
 */
const boundedText = (limit: number) => z.string().trim().min(1).max(limit);
const tokenCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
  .nullable().optional();

const sourceReferenceSchema = z.object({
  kind: boundedText(64),
  reference: boundedText(512),
  rationale: boundedText(512).nullable().optional(),
}).strict();

const tokenEvidenceSchema = z.object({
  /** Delta receipts are already per-call; cumulative receipts need a baseline. */
  mode: z.enum(["delta", "cumulative"]).default("delta"),
  inputTokens: tokenCount,
  outputTokens: tokenCount,
  /** A subset of inputTokens, never an additional category to add. */
  cachedInputTokens: tokenCount,
  sessionId: boundedText(128).nullable().optional(),
  epoch: boundedText(128).nullable().optional(),
}).strict().default({ mode: "delta" });

const moneyEvidenceSchema = z.object({
  amount: z.number().finite().nonnegative().nullable().optional(),
  currency: boundedText(16).nullable().optional(),
  funding: boundedText(128).nullable().optional(),
}).strict();

const quotaObservationSchema = z.object({
  observedAt: boundedText(64),
  freshness: z.enum(["fresh", "stale", "unknown"]),
  remainingTokens: tokenCount,
  limitTokens: tokenCount,
}).strict();

export const taskUsageEvidenceCallSchema = z.object({
  /** Stable only within scope; the pair is the canonical receipt identity. */
  consumptionId: boundedText(256),
  scope: boundedText(256),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  asOf: boundedText(64),
  sourceRefs: z.array(sourceReferenceSchema).max(32).default([]),
  tokens: tokenEvidenceSchema,
  model: z.object({
    uiSession: boundedText(256).nullable().optional(),
    requested: boundedText(256).nullable().optional(),
    /** Only a provider-confirmed receipt can populate the effective facet. */
    providerConfirmedEffective: boundedText(256).nullable().optional(),
    helper: boundedText(256).nullable().optional(),
  }).strict().default({}),
  selection: z.object({
    phase: boundedText(40).nullable().optional(),
    role: boundedText(64).nullable().optional(),
    effort: boundedText(24).nullable().optional(),
    policyProfile: boundedText(80).nullable().optional(),
    rationale: boundedText(300).nullable().optional(),
    selectedAt: boundedText(64).nullable().optional(),
  }).strict().nullable().optional(),
  /**
   * A helper may be independently billed, already included by its parent, or
   * have an unresolved overlap.  The parent reference is an identity, never a
   * loose display label.
   */
  coverage: z.object({
    relationship: z.enum([
      "standalone",
      "included_in_parent",
      "disjoint_from_parent",
      "overlap_unknown",
    ]).default("standalone"),
    parent: z.object({
      consumptionId: boundedText(256),
      scope: boundedText(256),
    }).strict().nullable().optional(),
    rationale: boundedText(512).nullable().optional(),
  }).strict().default({ relationship: "standalone" }),
  /** Reservations remain evidence, never settled spend. */
  reservation: moneyEvidenceSchema.nullable().optional(),
  settlement: moneyEvidenceSchema.nullable().optional(),
  quotaObservation: quotaObservationSchema.nullable().optional(),
}).strict();

export type TaskUsageEvidenceCall = z.infer<typeof taskUsageEvidenceCallSchema>;

export type UsageModelFacets = {
  uiSession: string | null;
  requested: string | null;
  effective: string | null;
  helper: string | null;
};

export type UsageSourceReference = {
  kind: string;
  reference: string;
  rationale: string | null;
};

export type UsageEvidenceIdentity = {
  consumptionId: string;
  scope: string;
};

type ResolvedTokenEvidence = {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  totalTokens: number | null;
  reason: string | null;
};

export type UsageEvidenceReceipt = {
  identity: UsageEvidenceIdentity;
  revision: number;
  asOf: string;
  sourceRefs: UsageSourceReference[];
  model: UsageModelFacets;
  selection: {
    phase: string | null;
    role: string | null;
    effort: string | null;
    policyProfile: string | null;
    rationale: string | null;
    selectedAt: string | null;
  } | null;
  tokens: ResolvedTokenEvidence;
  coverage: {
    relationship: TaskUsageEvidenceCall["coverage"]["relationship"];
    parent: UsageEvidenceIdentity | null;
    rationale: string | null;
  };
};

export type UsageModelGroup = {
  model: string;
  callCount: number;
  knownTokenTotal: number;
  unknownCallCount: number;
};

export type UsageEvidenceAggregate = {
  completeTotalTokens: number | null;
  /** Sum of every known receipt before any overlap exclusion. */
  knownSubtotalTokens: number;
  coverageReason: string | null;
  counts: {
    received: number;
    unique: number;
    known: number;
    missing: number;
    conflicts: number;
    overlap: number;
    replayed: number;
    corrections: number;
  };
  receipts: UsageEvidenceReceipt[];
  requestedModelGroups: UsageModelGroup[];
  providerConfirmedModelGroups: UsageModelGroup[];
  reservations: Array<{ identity: UsageEvidenceIdentity; amount: number | null; currency: string | null; funding: string | null }>;
  settlements: Array<{ identity: UsageEvidenceIdentity; amount: number | null; currency: string | null; funding: string | null }>;
  quotaObservations: Array<{ identity: UsageEvidenceIdentity; observedAt: string; freshness: "fresh" | "stale" | "unknown"; remainingTokens: number | null; limitTokens: number | null }>;
};

const CREDENTIAL_LIKE = /(?:\b(?:api[_-]?key|token|secret|password|authorization)\b\s*[:=]\s*\S+|\bbearer\s+\S+|\bsk-[A-Za-z0-9_-]+|\bAKIA[0-9A-Z]{16}\b|\bxox[abprs]-\S+)/gi;

function publicText(value: string | null | undefined, limit: number): string | null {
  if (!value) return null;
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(CREDENTIAL_LIKE, "[redacted]")
    .trim()
    .slice(0, limit) || null;
}

function sourceRefsForPublic(call: TaskUsageEvidenceCall): UsageSourceReference[] {
  return call.sourceRefs.map((source) => ({
    kind: publicText(source.kind, 64) ?? "unknown",
    reference: publicText(source.reference, 512) ?? "[redacted]",
    rationale: publicText(source.rationale, 512),
  }));
}

/** Projects independent model facets without treating compatibility hints as fact. */
export function projectModelFacets(call: TaskUsageEvidenceCall): UsageModelFacets {
  return {
    uiSession: publicText(call.model.uiSession, 256),
    requested: publicText(call.model.requested, 256),
    effective: publicText(call.model.providerConfirmedEffective, 256),
    helper: publicText(call.model.helper, 256),
  };
}

function identityKey(identity: UsageEvidenceIdentity): string {
  return `${identity.scope.length}:${identity.scope}\u0000${identity.consumptionId}`;
}

function callIdentity(call: TaskUsageEvidenceCall): UsageEvidenceIdentity {
  return { consumptionId: call.consumptionId, scope: call.scope };
}

function comparableCall(call: TaskUsageEvidenceCall): string {
  // The schema is strict and every listed field is scalar / fixed-shape.  Do
  // not spread provider payloads or arbitrary JSON into conflict comparison.
  return JSON.stringify({
    asOf: call.asOf,
    tokens: call.tokens,
    model: call.model,
    selection: call.selection ?? null,
    coverage: call.coverage,
    reservation: call.reservation ?? null,
    settlement: call.settlement ?? null,
    quotaObservation: call.quotaObservation ?? null,
    sourceRefs: call.sourceRefs,
  });
}

function rawDelta(tokens: TaskUsageEvidenceCall["tokens"]): ResolvedTokenEvidence {
  const inputTokens = tokens.inputTokens ?? null;
  const outputTokens = tokens.outputTokens ?? null;
  const cachedInputTokens = tokens.cachedInputTokens ?? null;
  if (inputTokens === null || outputTokens === null) {
    return { inputTokens, outputTokens, cachedInputTokens, totalTokens: null, reason: "missing_token_count" };
  }
  if (cachedInputTokens !== null && cachedInputTokens > inputTokens) {
    return { inputTokens, outputTokens, cachedInputTokens, totalTokens: null, reason: "cached_input_exceeds_input" };
  }
  return { inputTokens, outputTokens, cachedInputTokens, totalTokens: inputTokens + outputTokens, reason: null };
}

type Baseline = { input: number; output: number; cached: number | null; reset: boolean };

function makeReceipt(call: TaskUsageEvidenceCall, tokens: ResolvedTokenEvidence): UsageEvidenceReceipt {
  return {
    identity: {
      consumptionId: publicText(call.consumptionId, 256) ?? "[redacted]",
      scope: publicText(call.scope, 256) ?? "[redacted]",
    },
    revision: call.revision,
    asOf: call.asOf,
    sourceRefs: sourceRefsForPublic(call),
    model: projectModelFacets(call),
    selection: call.selection ? {
      phase: publicText(call.selection.phase, 40),
      role: publicText(call.selection.role, 64),
      effort: publicText(call.selection.effort, 24),
      policyProfile: publicText(call.selection.policyProfile, 80),
      rationale: publicText(call.selection.rationale, 300),
      selectedAt: publicText(call.selection.selectedAt, 64),
    } : null,
    tokens,
    coverage: {
      relationship: call.coverage.relationship,
      parent: call.coverage.parent ?? null,
      rationale: publicText(call.coverage.rationale, 512),
    },
  };
}

function addModelGroup(groups: Map<string, UsageModelGroup>, model: string | null, receipt: UsageEvidenceReceipt): void {
  if (!model) return;
  const current = groups.get(model) ?? { model, callCount: 0, knownTokenTotal: 0, unknownCallCount: 0 };
  current.callCount += 1;
  if (receipt.tokens.totalTokens === null) current.unknownCallCount += 1;
  else current.knownTokenTotal += receipt.tokens.totalTokens;
  groups.set(model, current);
}

function sortedGroups(groups: Map<string, UsageModelGroup>): UsageModelGroup[] {
  return [...groups.values()].sort((left, right) => left.model.localeCompare(right.model));
}

/**
 * Reduces immutable evidence into UI-safe usage facts.  Missing counts stay
 * missing; no amount, cache count, reservation, or correction is coerced to
 * zero.  The function neither parses nor mutates its callers' array.
 */
export function aggregateUsageEvidence(calls: readonly TaskUsageEvidenceCall[]): UsageEvidenceAggregate {
  const groups = new Map<string, TaskUsageEvidenceCall[]>();
  for (const call of calls) {
    const key = identityKey(callIdentity(call));
    const group = groups.get(key) ?? [];
    group.push(call);
    groups.set(key, group);
  }

  const selected: Array<{ call: TaskUsageEvidenceCall; conflict: boolean; replayed: number; corrections: number }> = [];
  let replayed = 0;
  let corrections = 0;
  for (const group of groups.values()) {
    const newestRevision = Math.max(...group.map((call) => call.revision));
    const newest = group.filter((call) => call.revision === newestRevision);
    const shapes = new Set(newest.map(comparableCall));
    const conflict = shapes.size > 1;
    const representative = newest.slice().sort((left, right) => right.asOf.localeCompare(left.asOf))[0];
    const uniqueRevisions = new Set(group.map((call) => call.revision)).size;
    const groupReplayed = group.length - uniqueRevisions;
    const groupCorrections = Math.max(0, uniqueRevisions - 1);
    replayed += groupReplayed;
    corrections += groupCorrections;
    selected.push({ call: representative, conflict, replayed: groupReplayed, corrections: groupCorrections });
  }

  // Cumulative counters must be observed in chronological order.  A reset
  // poisons that epoch until the producer gives a new epoch, avoiding a
  // fabricated delta after a provider counter reset.
  selected.sort((left, right) => left.call.asOf.localeCompare(right.call.asOf)
    || identityKey(callIdentity(left.call)).localeCompare(identityKey(callIdentity(right.call))));
  const baselines = new Map<string, Baseline>();
  const receipts: UsageEvidenceReceipt[] = [];
  let known = 0;
  let missing = 0;
  let conflicts = 0;
  const requestedGroups = new Map<string, UsageModelGroup>();
  const providerGroups = new Map<string, UsageModelGroup>();

  for (const item of selected) {
    const call = item.call;
    let tokens: ResolvedTokenEvidence;
    if (item.conflict) {
      tokens = { inputTokens: null, outputTokens: null, cachedInputTokens: null, totalTokens: null, reason: "conflicting_equal_revision" };
      conflicts += 1;
    } else if (call.tokens.mode === "delta") {
      tokens = rawDelta(call.tokens);
    } else {
      const input = call.tokens.inputTokens ?? null;
      const output = call.tokens.outputTokens ?? null;
      const cached = call.tokens.cachedInputTokens ?? null;
      const baselineKey = call.tokens.sessionId && call.tokens.epoch
        ? `${call.scope}\u0000${call.tokens.sessionId}\u0000${call.tokens.epoch}`
        : null;
      const baseline = baselineKey ? baselines.get(baselineKey) : undefined;
      if (!baselineKey || input === null || output === null || (cached !== null && cached > input)) {
        tokens = { inputTokens: input, outputTokens: output, cachedInputTokens: cached, totalTokens: null, reason: "missing_cumulative_baseline" };
      } else if (!baseline) {
        baselines.set(baselineKey, { input, output, cached, reset: false });
        tokens = { inputTokens: input, outputTokens: output, cachedInputTokens: cached, totalTokens: null, reason: "missing_cumulative_baseline" };
      } else if (baseline.reset || input < baseline.input || output < baseline.output) {
        baselines.set(baselineKey, { input, output, cached, reset: true });
        tokens = { inputTokens: input, outputTokens: output, cachedInputTokens: cached, totalTokens: null, reason: "cumulative_counter_reset" };
      } else {
        const inputDelta = input - baseline.input;
        const outputDelta = output - baseline.output;
        const cachedDelta = cached !== null && baseline.cached !== null && cached >= baseline.cached
          ? cached - baseline.cached
          : null;
        baselines.set(baselineKey, { input, output, cached, reset: false });
        tokens = {
          inputTokens: inputDelta,
          outputTokens: outputDelta,
          cachedInputTokens: cachedDelta,
          totalTokens: inputDelta + outputDelta,
          reason: null,
        };
      }
    }
    const receipt = makeReceipt(call, tokens);
    receipts.push(receipt);
    if (tokens.totalTokens === null) missing += 1;
    else known += 1;
    addModelGroup(requestedGroups, receipt.model.requested, receipt);
    addModelGroup(providerGroups, receipt.model.effective, receipt);
  }

  const receiptKeys = new Set(receipts.map((receipt) => identityKey(receipt.identity)));
  const overlapReceipts = receipts.filter((receipt) => receipt.coverage.relationship === "overlap_unknown");
  const unresolvedIncludedReceipts = receipts.filter((receipt) =>
    receipt.coverage.relationship === "included_in_parent" &&
    (!receipt.coverage.parent || !receiptKeys.has(identityKey(receipt.coverage.parent))),
  );
  const knownSubtotalTokens = receipts.reduce((sum, receipt) => sum + (receipt.tokens.totalTokens ?? 0), 0);
  const includedKeys = new Set(
    receipts
      .filter((receipt) => receipt.coverage.relationship === "included_in_parent" && receipt.coverage.parent && receiptKeys.has(identityKey(receipt.coverage.parent)))
      .map((receipt) => identityKey(receipt.identity)),
  );
  const completeTotalTokens = missing === 0 && conflicts === 0 && overlapReceipts.length === 0 && unresolvedIncludedReceipts.length === 0
    ? receipts.reduce((sum, receipt) => sum + (includedKeys.has(identityKey(receipt.identity)) ? 0 : receipt.tokens.totalTokens ?? 0), 0)
    : null;
  const coverageReason = overlapReceipts.length > 0
    ? publicText(overlapReceipts[0].coverage.rationale, 512) ?? "overlap_unknown"
    : unresolvedIncludedReceipts.length > 0 ? "included_parent_missing" : null;

  const selectedCalls = selected.map((item) => item.call);
  return {
    completeTotalTokens,
    knownSubtotalTokens,
    coverageReason,
    counts: {
      received: calls.length,
      unique: receipts.length,
      known,
      missing,
      conflicts,
      overlap: overlapReceipts.length,
      replayed,
      corrections,
    },
    receipts,
    requestedModelGroups: sortedGroups(requestedGroups),
    providerConfirmedModelGroups: sortedGroups(providerGroups),
    reservations: selectedCalls.flatMap((call) => call.reservation ? [{ identity: callIdentity(call), amount: call.reservation.amount ?? null, currency: call.reservation.currency ?? null, funding: publicText(call.reservation.funding, 128) }] : []),
    settlements: selectedCalls.flatMap((call) => call.settlement ? [{ identity: callIdentity(call), amount: call.settlement.amount ?? null, currency: call.settlement.currency ?? null, funding: publicText(call.settlement.funding, 128) }] : []),
    quotaObservations: selectedCalls.flatMap((call) => call.quotaObservation ? [{ identity: callIdentity(call), observedAt: call.quotaObservation.observedAt, freshness: call.quotaObservation.freshness, remainingTokens: call.quotaObservation.remainingTokens ?? null, limitTokens: call.quotaObservation.limitTokens ?? null }] : []),
  };
}
