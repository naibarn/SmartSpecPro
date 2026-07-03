/**
 * Vertical Drama Series — durable long-series memory service (spec §7.6 / §7.3).
 *
 * The memory model is strictly APPEND-ONLY. Writes are memory events; retcons are
 * explicit `retcon_proposal` events whose approval appends a NEW superseding event
 * and never mutates or deletes a prior event. Retrieval-bundle construction is
 * deterministic for a given (series, episode) so an episode replans identically,
 * and switches to a compacted rolling-summary text once the raw event list grows
 * past a size threshold.
 *
 * This file is intentionally free of provider/section-08 dependencies — memory is
 * a pure persistence + retrieval concern.
 */

import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaMemoryEvents,
  verticalDramaMemorySnapshots,
  type VerticalDramaMemoryEventRow,
} from "../../drizzle/schema";
import {
  VERTICAL_DRAMA_MEMORY_RETRIEVAL_POLICY_DEFAULT,
  type VerticalDramaMemoryEvent,
  type VerticalDramaMemoryKind,
  type VerticalDramaMemoryRetrievalPolicy,
} from "@shared/verticalDramaSeries";
import type { VerticalDramaSeriesMemory } from "@shared/verticalDramaSeries";
import { artifactChecksumSha256 } from "@shared/verticalDramaSeries";

/* -------------------------------------------------------------------------- */
/* Tuning constants                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Once the raw event list for a series exceeds this many events, bundle
 * construction switches to `compactionStrategy: "rolling_summary_plus_events"`
 * instead of inlining the full history (spec §7.6 Memory Bundle Construction).
 */
export const VERTICAL_DRAMA_MEMORY_COMPACTION_EVENT_THRESHOLD = 40;

/** How many recent verbatim events to keep after the rolling summary. */
export const VERTICAL_DRAMA_MEMORY_COMPACTION_VERBATIM_TAIL = 12;

/* -------------------------------------------------------------------------- */
/* Ownership / param types                                                    */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaMemoryOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
}

export interface AppendMemoryEventParams extends VerticalDramaMemoryOwner {
  memoryKind: VerticalDramaMemoryKind;
  payload: Record<string, unknown>;
  summaryText?: string;
  episodeId?: number | null;
  runId?: number | null;
  supersedesEventIds?: string[];
  approved?: boolean | null;
  approvedByUserId?: number | null;
  /** Idempotency key — a replayed append with the same key is de-duplicated. */
  idempotencyKey?: string;
}

export interface ListMemoryEventsParams extends VerticalDramaMemoryOwner {
  /** Optional filter by memory kind (including `retcon_proposal`). */
  kind?: VerticalDramaMemoryKind;
  /** Optional filter by episode number (resolved to episodeId by the caller). */
  episodeId?: number;
  limit?: number;
}

export interface RetconDecisionParams extends VerticalDramaMemoryOwner {
  proposalEventId: number;
  actingUserId: number;
  idempotencyKey?: string;
}

/* -------------------------------------------------------------------------- */
/* Fatigue + bundle types                                                     */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaProductTieInFatigue {
  /** Total tie-in usages recorded across the whole series. */
  totalUsages: number;
  /** Usages within the fatigue lookback window (recent). */
  recentUsages: number;
  /** Episode number of the most recent tie-in usage, when known. */
  lastUsedEpisodeNumber?: number;
  /** Per-product usage counts keyed by product name/id. */
  byProduct: Record<string, number>;
}

/**
 * The retrieval bundle. It is structurally a `VerticalDramaSeriesMemory` (so it
 * satisfies `NormalizedEpisodeInput.memoryBundle`) plus explicit fatigue and
 * lookback metadata that downstream generation uses to respect fatigue limits.
 */
export interface VerticalDramaEpisodeMemoryBundle extends VerticalDramaSeriesMemory {
  productTieInFatigue: VerticalDramaProductTieInFatigue;
  resolvedHookLookback: string[];
  /** True when compacted text replaced the full inlined event history. */
  usedCompaction: boolean;
}

/** Outcome derived from the append-only chain, never stored on the proposal. */
export type VerticalDramaRetconOutcome = "proposed" | "approved" | "rejected";

/* -------------------------------------------------------------------------- */
/* Row <-> contract mapping                                                    */
/* -------------------------------------------------------------------------- */

export function memoryRowToEvent(row: VerticalDramaMemoryEventRow): VerticalDramaMemoryEvent {
  return {
    memoryEventId: String(row.id),
    seriesId: String(row.seriesId),
    episodeId: row.episodeId != null ? String(row.episodeId) : undefined,
    runId: row.runId != null ? String(row.runId) : undefined,
    memoryKind: row.memoryKind as VerticalDramaMemoryKind,
    payload: (row.payload as Record<string, unknown>) ?? {},
    summaryText: row.summaryText ?? undefined,
    supersedesEventIds: (row.supersedesEventIds as string[] | null) ?? undefined,
    approved: row.approved ?? undefined,
    approvedByUserId: row.approvedByUserId != null ? String(row.approvedByUserId) : undefined,
    createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Deterministic bundle construction (pure — unit-testable without a DB)       */
/* -------------------------------------------------------------------------- */

/** Stable ordering: chronological by createdAt then numeric event id. */
function sortEventsStable(events: VerticalDramaMemoryEvent[]): VerticalDramaMemoryEvent[] {
  return [...events].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return Number(a.memoryEventId) - Number(b.memoryEventId);
  });
}

function eventEpisodeNumber(ev: VerticalDramaMemoryEvent): number | undefined {
  const n = (ev.payload?.episodeNumber ?? ev.payload?.episode_number) as unknown;
  return typeof n === "number" ? n : undefined;
}

/** Derive the outcome of a retcon proposal purely from later append-only events. */
export function deriveRetconOutcome(
  proposal: VerticalDramaMemoryEvent,
  allEvents: VerticalDramaMemoryEvent[],
): VerticalDramaRetconOutcome {
  const pid = proposal.memoryEventId;
  for (const ev of allEvents) {
    if (ev.payload?.retconApprovalOf === pid) return "approved";
    if (ev.payload?.retconRejectionOf === pid) return "rejected";
  }
  return "proposed";
}

export function computeProductTieInFatigue(
  events: VerticalDramaMemoryEvent[],
  currentEpisodeNumber: number,
  lookback: number,
): VerticalDramaProductTieInFatigue {
  const byProduct: Record<string, number> = {};
  let totalUsages = 0;
  let recentUsages = 0;
  let lastUsedEpisodeNumber: number | undefined;
  for (const ev of events) {
    if (ev.memoryKind !== "product_tie_in_usage") continue;
    totalUsages += 1;
    const product = String(ev.payload?.productName ?? ev.payload?.product_name ?? "unknown");
    byProduct[product] = (byProduct[product] ?? 0) + 1;
    const epNum = eventEpisodeNumber(ev);
    if (epNum != null) {
      if (lastUsedEpisodeNumber == null || epNum > lastUsedEpisodeNumber) lastUsedEpisodeNumber = epNum;
      if (currentEpisodeNumber - epNum <= lookback) recentUsages += 1;
    }
  }
  return { totalUsages, recentUsages, lastUsedEpisodeNumber, byProduct };
}

/** Build the compacted rolling-summary + verbatim-tail memory text (spec §7.6). */
export function buildCompactedMemoryText(events: VerticalDramaMemoryEvent[]): string {
  if (events.length === 0) return "";
  const sorted = sortEventsStable(events);
  const head = sorted.slice(0, Math.max(0, sorted.length - VERTICAL_DRAMA_MEMORY_COMPACTION_VERBATIM_TAIL));
  const tail = sorted.slice(-VERTICAL_DRAMA_MEMORY_COMPACTION_VERBATIM_TAIL);
  const byKind: Record<string, number> = {};
  for (const ev of head) byKind[ev.memoryKind] = (byKind[ev.memoryKind] ?? 0) + 1;
  const rollingSummary =
    `ROLLING SUMMARY (${head.length} earlier events): ` +
    Object.entries(byKind)
      .map(([k, n]) => `${k}×${n}`)
      .join(", ");
  const verbatim = tail
    .map((ev) => `- [${ev.memoryKind}] ${ev.summaryText ?? JSON.stringify(ev.payload)}`)
    .join("\n");
  return `${rollingSummary}\n\nRECENT EVENTS (verbatim):\n${verbatim}`;
}

/**
 * Assemble the deterministic episode memory bundle from the append-only event
 * list (spec §7.6). Retcon-superseded facts are dropped; the last N summaries,
 * open hooks, resolved-hook lookback, product-tie-in history + fatigue, and the
 * compacted text (past threshold) are all derived here, not stored.
 */
export function buildEpisodeMemoryBundle(
  events: VerticalDramaMemoryEvent[],
  episodeNumber: number,
  policy: VerticalDramaMemoryRetrievalPolicy = VERTICAL_DRAMA_MEMORY_RETRIEVAL_POLICY_DEFAULT,
): VerticalDramaEpisodeMemoryBundle {
  const sorted = sortEventsStable(events);

  // Retcon supersession: an event id superseded by any later event is dropped.
  const supersededIds = new Set<string>();
  for (const ev of sorted) {
    for (const sup of ev.supersedesEventIds ?? []) supersededIds.add(sup);
  }
  const live = sorted.filter((ev) => !supersededIds.has(ev.memoryEventId));

  // Canonical facts (approved retcon approvals count as canonical facts too).
  const canonicalFacts = live
    .filter((ev) => ev.memoryKind === "canonical_fact")
    .map((ev) => String(ev.payload?.fact ?? ev.summaryText ?? ""))
    .filter((s) => s.length > 0);

  // Episode summaries: keep the last N by episode number.
  const episodeSummaryEvents = live
    .filter((ev) => ev.memoryKind === "episode_summary")
    .sort((a, b) => (eventEpisodeNumber(a) ?? 0) - (eventEpisodeNumber(b) ?? 0));
  const lastSummaries = episodeSummaryEvents.slice(-policy.includeLastEpisodeCount).map((ev) => ({
    episodeId: String(ev.episodeId ?? ev.payload?.episodeId ?? ""),
    episodeNumber: eventEpisodeNumber(ev) ?? 0,
    summary: String(ev.payload?.summary ?? ev.summaryText ?? ""),
    cliffhanger: ev.payload?.cliffhanger != null ? String(ev.payload.cliffhanger) : undefined,
    characterDeltas: (ev.payload?.characterDeltas as VerticalDramaSeriesMemory["episodeSummaries"][number]["characterDeltas"]) ?? [],
    productTieInUsage: ev.payload?.productTieInUsage as
      | VerticalDramaSeriesMemory["episodeSummaries"][number]["productTieInUsage"]
      | undefined,
  }));

  // Hooks.
  const openedHooks = live.filter((ev) => ev.memoryKind === "hook_opened");
  const resolvedHookEvents = live.filter((ev) => ev.memoryKind === "hook_resolved");
  const resolvedHookKeys = new Set(
    resolvedHookEvents.map((ev) => String(ev.payload?.hookId ?? ev.payload?.hook ?? ev.summaryText ?? "")),
  );
  const unresolvedHooks = openedHooks
    .map((ev) => ({ key: String(ev.payload?.hookId ?? ev.payload?.hook ?? ev.summaryText ?? ""), text: String(ev.payload?.hook ?? ev.summaryText ?? "") }))
    .filter((h) => h.key.length > 0 && !resolvedHookKeys.has(h.key))
    .map((h) => h.text);

  // Resolved-hook lookback: hooks resolved within the last N episodes.
  const resolvedHookLookback = resolvedHookEvents
    .filter((ev) => {
      const epNum = eventEpisodeNumber(ev);
      return epNum == null || episodeNumber - epNum <= policy.includeResolvedHookLookbackCount;
    })
    .map((ev) => String(ev.payload?.hook ?? ev.summaryText ?? ""))
    .filter((s) => s.length > 0);

  const continuityWarnings = live
    .filter((ev) => ev.memoryKind === "continuity_warning")
    .map((ev) => String(ev.payload?.warning ?? ev.summaryText ?? ""))
    .filter((s) => s.length > 0);

  const usedCompaction = sorted.length > VERTICAL_DRAMA_MEMORY_COMPACTION_EVENT_THRESHOLD;
  const compactedMemoryText = usedCompaction ? buildCompactedMemoryText(sorted) : "";

  const productTieInFatigue = computeProductTieInFatigue(
    live,
    episodeNumber,
    policy.includeResolvedHookLookbackCount,
  );

  // Deterministic updatedAt: last event's timestamp, else epoch.
  const updatedAt = sorted.length > 0 ? sorted[sorted.length - 1].createdAt : new Date(0).toISOString();

  return {
    canonicalFacts,
    episodeSummaries: lastSummaries,
    unresolvedHooks,
    resolvedHooks: resolvedHookLookback,
    continuityWarnings,
    compactedMemoryText,
    retrievalPolicy: policy,
    updatedAt,
    productTieInFatigue,
    resolvedHookLookback,
    usedCompaction,
  };
}

/* -------------------------------------------------------------------------- */
/* Service (DB-backed, append-only)                                            */
/* -------------------------------------------------------------------------- */

export class VerticalDramaSeriesMemoryService {
  /** Look up an existing event written under the same idempotency key. */
  private async findByIdempotencyKey(
    owner: VerticalDramaMemoryOwner,
    key: string,
  ): Promise<VerticalDramaMemoryEventRow | undefined> {
    const rows = await db
      .select()
      .from(verticalDramaMemoryEvents)
      .where(
        and(
          eq(verticalDramaMemoryEvents.tenantId, owner.tenantId),
          eq(verticalDramaMemoryEvents.seriesId, owner.seriesId),
          sql`${verticalDramaMemoryEvents.payload}->>'_idempotencyKey' = ${key}`,
        ),
      )
      .limit(1);
    return rows[0];
  }

  /** Append a new memory event (idempotent). Never mutates prior events. */
  async appendEvent(params: AppendMemoryEventParams): Promise<VerticalDramaMemoryEvent> {
    if (params.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(params, params.idempotencyKey);
      if (existing) return memoryRowToEvent(existing);
    }
    const payload = params.idempotencyKey
      ? { ...params.payload, _idempotencyKey: params.idempotencyKey }
      : params.payload;
    const [row] = await db
      .insert(verticalDramaMemoryEvents)
      .values({
        tenantId: params.tenantId,
        userId: params.userId,
        seriesId: params.seriesId,
        episodeId: params.episodeId ?? null,
        runId: params.runId ?? null,
        memoryKind: params.memoryKind,
        payload,
        summaryText: params.summaryText ?? null,
        supersedesEventIds: params.supersedesEventIds ?? null,
        approved: params.approved ?? null,
        approvedByUserId: params.approvedByUserId ?? null,
      } as typeof verticalDramaMemoryEvents.$inferInsert)
      .returning();
    return memoryRowToEvent(row as VerticalDramaMemoryEventRow);
  }

  /** List append-only events chronologically, filterable by kind / episode. */
  async listEvents(params: ListMemoryEventsParams): Promise<VerticalDramaMemoryEvent[]> {
    const conditions = [
      eq(verticalDramaMemoryEvents.tenantId, params.tenantId),
      eq(verticalDramaMemoryEvents.seriesId, params.seriesId),
    ];
    if (params.kind) conditions.push(eq(verticalDramaMemoryEvents.memoryKind, params.kind));
    if (params.episodeId != null) conditions.push(eq(verticalDramaMemoryEvents.episodeId, params.episodeId));
    const rows = await db
      .select()
      .from(verticalDramaMemoryEvents)
      .where(and(...conditions))
      .orderBy(asc(verticalDramaMemoryEvents.createdAt), asc(verticalDramaMemoryEvents.id))
      .limit(params.limit ?? 500);
    return rows.map(memoryRowToEvent);
  }

  /** Load all series events (used for deterministic bundle construction). */
  async loadAllEvents(owner: VerticalDramaMemoryOwner): Promise<VerticalDramaMemoryEvent[]> {
    const rows = await db
      .select()
      .from(verticalDramaMemoryEvents)
      .where(
        and(
          eq(verticalDramaMemoryEvents.tenantId, owner.tenantId),
          eq(verticalDramaMemoryEvents.seriesId, owner.seriesId),
        ),
      )
      .orderBy(asc(verticalDramaMemoryEvents.createdAt), asc(verticalDramaMemoryEvents.id));
    return rows.map(memoryRowToEvent);
  }

  /**
   * Build the deterministic episode memory bundle from persisted events
   * (spec §7.6). Same series/episode input replans identically.
   */
  async buildEpisodeMemoryBundle(
    owner: VerticalDramaMemoryOwner,
    episodeNumber: number,
    policy: VerticalDramaMemoryRetrievalPolicy = VERTICAL_DRAMA_MEMORY_RETRIEVAL_POLICY_DEFAULT,
  ): Promise<VerticalDramaEpisodeMemoryBundle> {
    const events = await this.loadAllEvents(owner);
    return buildEpisodeMemoryBundle(events, episodeNumber, policy);
  }

  /** Persist a compacted memory snapshot (distinct from append-only events). */
  async writeSnapshot(
    owner: VerticalDramaMemoryOwner,
    memory: VerticalDramaSeriesMemory,
  ): Promise<number> {
    const compactedMemoryText = memory.compactedMemoryText || buildCompactedMemoryText(
      await this.loadAllEvents(owner),
    );
    const [row] = await db
      .insert(verticalDramaMemorySnapshots)
      .values({
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
        compactedMemoryText,
        memory,
        checksumSha256: artifactChecksumSha256(memory),
      })
      .returning({ id: verticalDramaMemorySnapshots.id });
    return row.id;
  }

  /**
   * Propose a retcon (spec §7.6). Persisted as an append-only `retcon_proposal`
   * event carrying the contradicted fact, the proposed superseding fact, and the
   * `supersedesEventIds` it would supersede. Requires later approval.
   */
  async proposeRetcon(params: {
    owner: VerticalDramaMemoryOwner;
    contradictedFact: string;
    proposedFact: string;
    rationale: string;
    supersedesEventIds: string[];
    targetKind?: VerticalDramaMemoryKind;
    episodeId?: number | null;
    runId?: number | null;
    idempotencyKey?: string;
  }): Promise<VerticalDramaMemoryEvent> {
    return this.appendEvent({
      ...params.owner,
      memoryKind: "retcon_proposal",
      payload: {
        contradictedFact: params.contradictedFact,
        proposedFact: params.proposedFact,
        rationale: params.rationale,
        targetKind: params.targetKind ?? "canonical_fact",
      },
      summaryText: params.proposedFact,
      supersedesEventIds: params.supersedesEventIds,
      episodeId: params.episodeId ?? null,
      runId: params.runId ?? null,
      approved: null,
      idempotencyKey: params.idempotencyKey,
    });
  }

  private async getProposal(
    owner: VerticalDramaMemoryOwner,
    proposalEventId: number,
  ): Promise<VerticalDramaMemoryEventRow> {
    const [row] = await db
      .select()
      .from(verticalDramaMemoryEvents)
      .where(
        and(
          eq(verticalDramaMemoryEvents.id, proposalEventId),
          eq(verticalDramaMemoryEvents.tenantId, owner.tenantId),
          eq(verticalDramaMemoryEvents.seriesId, owner.seriesId),
        ),
      )
      .limit(1);
    if (!row) throw new Error("retcon_proposal_not_found");
    if (row.memoryKind !== "retcon_proposal") throw new Error("event_is_not_a_retcon_proposal");
    return row;
  }

  /**
   * Approve a retcon proposal (spec §7.6). Appends a NEW superseding event; the
   * proposal and every prior event remain intact (append-only preserved).
   */
  async approveRetconProposal(params: RetconDecisionParams): Promise<VerticalDramaMemoryEvent> {
    const proposal = await this.getProposal(params, params.proposalEventId);
    const payload = (proposal.payload as Record<string, unknown>) ?? {};
    const targetKind = (payload.targetKind as VerticalDramaMemoryKind) ?? "canonical_fact";
    const supersedes = Array.from(
      new Set([...((proposal.supersedesEventIds as string[] | null) ?? []), String(proposal.id)]),
    );
    return this.appendEvent({
      ...params,
      memoryKind: targetKind,
      payload: {
        fact: payload.proposedFact,
        retconApprovalOf: String(proposal.id),
        rationale: payload.rationale,
      },
      summaryText: String(payload.proposedFact ?? ""),
      supersedesEventIds: supersedes,
      approved: true,
      approvedByUserId: params.actingUserId,
      idempotencyKey: params.idempotencyKey,
    });
  }

  /**
   * Reject a retcon proposal (spec §7.6). Appends a rejection marker event; the
   * proposal and prior events are never mutated or deleted.
   */
  async rejectRetconProposal(params: RetconDecisionParams): Promise<VerticalDramaMemoryEvent> {
    const proposal = await this.getProposal(params, params.proposalEventId);
    return this.appendEvent({
      ...params,
      memoryKind: "retcon_proposal",
      payload: {
        retconRejectionOf: String(proposal.id),
        decision: "rejected",
      },
      summaryText: "Retcon proposal rejected",
      approved: false,
      approvedByUserId: params.actingUserId,
      idempotencyKey: params.idempotencyKey,
    });
  }
}

/** Shared singleton. */
export const verticalDramaSeriesMemoryService = new VerticalDramaSeriesMemoryService();
