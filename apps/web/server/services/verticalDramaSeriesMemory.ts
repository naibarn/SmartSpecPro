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
// Feature 132 §5.3 (F132B, ledgers-and-story-state, added 2026-07-09) — the
// typed per-episode story-state shape; tolerant-parsed here (never throws)
// so a malformed `story_state` event payload never breaks bundle
// construction — see `storyState`'s own doc comment below.
import { verticalDramaStoryStateSchema, type VerticalDramaStoryState } from "@shared/verticalDramaSeries/qualityLedgers";
// Story-density reform (spec §7.7.3, section-13, added 2026-07-07) — imported
// DIRECTLY from the submodule (not the shared barrel), mirroring the
// convention `verticalDramaStoryBible.ts`/`verticalDramaScriptGeneration.ts`
// already established for this module: `contentBudget.ts` is the ONE
// canonical content-budget/breakdown-versioning contract source.
import type {
  VerticalDramaArcDriftReasonCode,
  VerticalDramaEpisodeBreakdownItem,
} from "@shared/verticalDramaSeries/contentBudget";

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
 * Bundle item 9 (spec §7.7.3, section-13, added 2026-07-07) — the currently
 * ACTIVE episode-breakdown version, so episode-planning callers can see what
 * the season currently plans for future episodes without a separate bible
 * read. `versionId` is `null` for a legacy series that has never adopted
 * breakdown versioning (only a flat `bible.episodeBreakdown` array exists) —
 * `items` is still populated in that case via `getActiveBreakdown`'s own
 * legacy-fallback read (spec §7.7.2 hard rule 6). This module has no DB
 * access to the series `bible` column itself (it only ever loads memory
 * EVENTS) — the caller resolves this via `verticalDramaStoryBible.ts`'s
 * `getActiveBreakdown`/`readBreakdownVersions` and passes it in through
 * `BuildEpisodeMemoryBundleOpts.activeBreakdownVersion`.
 */
export interface VerticalDramaActiveBreakdownVersionSummary {
  versionId: string | null;
  items: VerticalDramaEpisodeBreakdownItem[];
}

/**
 * Bundle item 9 (spec §7.7.3, section-13, added 2026-07-07) — a standing,
 * unresolved arc-drift warning derived PURELY from the append-only event log
 * itself (no bible/DB read needed, unlike `activeBreakdownVersion` above):
 * an `arc_replan_proposal` event for which no later `arc_replan_applied`
 * event references it yet. Deliberately does NOT exclude a REJECTED
 * proposal — spec §7.7.3: "rejecting keeps the old plan and leaves a
 * standing continuity warning on affected future episodes" — only an
 * APPROVED (applied) proposal actually resolves the drift, since approval is
 * the only outcome that changes the plan to match what was realized.
 */
export interface VerticalDramaStandingArcDriftWarning {
  proposalId: string;
  triggeredByEpisodeNumber: number;
  driftReasons: VerticalDramaArcDriftReasonCode[];
  affectedEpisodeNumbers: number[];
  rationale: string;
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
  /**
   * Bundle item 9 (spec §7.7.3, section-13) — flag-gated by the caller's
   * `verticalDramaSeriesArcReplan` tenant flag (`BuildEpisodeMemoryBundleOpts
   * .arcReplanEnabled`). `undefined` when the flag is off/omitted, so the
   * bundle shape is otherwise BYTE-IDENTICAL to before this change
   * (section-13 acceptance: "flags off — ... byte-compatible").
   */
  activeBreakdownVersion?: VerticalDramaActiveBreakdownVersionSummary;
  /** See `VerticalDramaStandingArcDriftWarning`. Same flag-gating as `activeBreakdownVersion`. */
  standingArcDriftWarnings?: VerticalDramaStandingArcDriftWarning[];
  /**
   * Feature 132 §5.3 (F132B, ledgers-and-story-state, added 2026-07-09) —
   * the most recent `story_state` event whose `payload.episode` is the
   * highest value `<= episodeNumber` (never a future episode's state).
   * Flag-gated by `BuildEpisodeMemoryBundleOpts.ledgersEnabled`; `undefined`
   * when the flag is off, no `story_state` event exists yet for this
   * episode, or the event's payload fails tolerant-parse — same
   * "omitted-not-undefined-keyed" convention as `activeBreakdownVersion`.
   */
  storyState?: VerticalDramaStoryState;
}

/**
 * Additive options bag for `buildEpisodeMemoryBundle` (spec §7.7.3,
 * section-13, added 2026-07-07) — bundle item 9. Both the pure function and
 * the DB-backed service method accept this as an optional trailing
 * parameter; omitting it entirely preserves today's exact bundle shape
 * (flags-off byte-identical, section-13 acceptance).
 */
export interface BuildEpisodeMemoryBundleOpts {
  /**
   * Feature flag `verticalDramaSeriesArcReplan` — gates BOTH bundle item 9
   * fields entirely. This module has no direct tenant-flag read of its own
   * (that lives in `server/services/tenantFeatureFlagService.ts`); the
   * caller resolves the flag and passes the boolean through, matching this
   * codebase's established "gate at the call site" convention (see
   * `server/routers/verticalDramaEpisodes.ts`'s `resolveSubShotPolicy`).
   */
  arcReplanEnabled?: boolean;
  /**
   * Caller-resolved active breakdown version (see
   * `VerticalDramaActiveBreakdownVersionSummary`'s doc comment for why this
   * module cannot resolve it itself). Only read when `arcReplanEnabled` is
   * true; a `null`/omitted value with the flag on simply omits
   * `activeBreakdownVersion` from the returned bundle (e.g. the series row
   * failed to load) rather than throwing.
   */
  activeBreakdownVersion?: VerticalDramaActiveBreakdownVersionSummary | null;
  /**
   * Feature 132 §5.3 (F132B) — gates `storyState` derivation entirely,
   * mirroring `arcReplanEnabled`'s exact flag-gated-optional convention:
   * the caller resolves the `verticalDramaQualityLedgers` tenant flag
   * (this module has no direct tenant-flag read of its own).
   */
  ledgersEnabled?: boolean;
}

/** Outcome derived from the append-only chain, never stored on the proposal. */
export type VerticalDramaRetconOutcome = "proposed" | "approved" | "rejected";

/**
 * Standing (unresolved) arc-replan proposals from the append-only event log
 * (spec §7.7.3, section-13 bundle item 9) — see
 * `VerticalDramaStandingArcDriftWarning`'s doc comment for the exact
 * "unresolved" definition. Pure, deterministic — operates on the same
 * `live` (retcon-supersession-filtered) event list `buildEpisodeMemoryBundle`
 * already computes.
 */
export function deriveStandingArcDriftWarnings(
  liveEvents: VerticalDramaMemoryEvent[],
): VerticalDramaStandingArcDriftWarning[] {
  const appliedProposalIds = new Set<string>();
  for (const ev of liveEvents) {
    if (ev.memoryKind !== "arc_replan_applied") continue;
    const proposalId = ev.payload?.proposalId ?? ev.payload?.arcReplanApprovalOf;
    if (typeof proposalId === "string") appliedProposalIds.add(proposalId);
  }

  const warnings: VerticalDramaStandingArcDriftWarning[] = [];
  for (const ev of liveEvents) {
    if (ev.memoryKind !== "arc_replan_proposal") continue;
    const payload = ev.payload ?? {};
    const proposalId = payload.proposalId;
    if (typeof proposalId !== "string" || appliedProposalIds.has(proposalId)) continue;

    const triggeredByEpisodeNumber = payload.triggeredByEpisodeNumber;
    const driftReasons = Array.isArray(payload.driftReasons) ? payload.driftReasons : [];
    const affectedEpisodeNumbers = Array.isArray(payload.affectedEpisodeNumbers)
      ? payload.affectedEpisodeNumbers
      : [];
    warnings.push({
      proposalId,
      triggeredByEpisodeNumber: typeof triggeredByEpisodeNumber === "number" ? triggeredByEpisodeNumber : 0,
      driftReasons: driftReasons as VerticalDramaArcDriftReasonCode[],
      affectedEpisodeNumbers: affectedEpisodeNumbers.filter((n): n is number => typeof n === "number"),
      rationale: typeof payload.rationale === "string" ? payload.rationale : "",
    });
  }
  return warnings;
}

/**
 * Feature 132 §5.3 (F132B) — resolves the most recent `story_state` event
 * whose `payload.storyState.episode` (or, tolerantly, `payload.episode`) is
 * the highest value `<= episodeNumber`, never a future episode's state.
 * Tolerant-parsed against `verticalDramaStoryStateSchema` — a malformed
 * payload is skipped (never thrown), falling back to the next-best
 * candidate or `undefined`. Pure, deterministic — operates on the same
 * `live` (retcon-supersession-filtered) event list `buildEpisodeMemoryBundle`
 * already computes.
 */
export function deriveStoryStateForEpisode(
  liveEvents: VerticalDramaMemoryEvent[],
  episodeNumber: number,
): VerticalDramaStoryState | undefined {
  const candidates = liveEvents
    .filter((ev) => ev.memoryKind === "story_state")
    .map((ev) => {
      const raw = (ev.payload?.storyState ?? ev.payload) as unknown;
      const parsed = verticalDramaStoryStateSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    })
    .filter((state): state is VerticalDramaStoryState => state !== null)
    .filter((state) => state.episode <= episodeNumber)
    .sort((a, b) => a.episode - b.episode);

  return candidates.length > 0 ? candidates[candidates.length - 1] : undefined;
}

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
  const storyState = ev.payload?.storyState;
  const raw =
    ev.payload?.episodeNumber ??
    ev.payload?.episode_number ??
    ev.payload?.triggeredByEpisodeNumber ??
    (storyState && typeof storyState === "object"
      ? (storyState as Record<string, unknown>).episode
      : undefined);
  const n = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : raw;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : undefined;
}

function eventText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function isValidMemoryEventForProjection(ev: VerticalDramaMemoryEvent): boolean {
  switch (ev.memoryKind) {
    case "canonical_fact":
      return eventText(ev.payload?.fact, ev.summaryText) !== undefined;
    case "episode_summary":
      return eventText(ev.payload?.summary, ev.summaryText) !== undefined;
    case "hook_opened":
    case "hook_resolved":
      return (
        eventText(ev.payload?.hook, ev.summaryText) !== undefined &&
        eventText(ev.payload?.hookId, ev.payload?.hook, ev.summaryText) !== undefined
      );
    case "continuity_warning":
      return eventText(ev.payload?.warning, ev.summaryText) !== undefined;
    case "product_tie_in_usage":
      return eventText(ev.payload?.productName, ev.payload?.product_name) !== undefined;
    case "story_state":
      return verticalDramaStoryStateSchema.safeParse(
        ev.payload?.storyState ?? ev.payload,
      ).success;
    case "arc_replan_proposal":
      return (
        typeof ev.payload?.proposalId === "string" &&
        eventText(ev.payload?.rationale) !== undefined
      );
    case "arc_replan_applied":
      return typeof (ev.payload?.proposalId ?? ev.payload?.arcReplanApprovalOf) === "string";
    case "character_delta":
    case "relationship_delta":
      return eventText(ev.summaryText) !== undefined;
    default:
      return false;
  }
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
    const product = eventText(ev.payload?.productName, ev.payload?.product_name);
    if (!product) continue;
    totalUsages += 1;
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
  const sorted = sortEventsStable(
    events.filter((ev) => ev.approved === true && isValidMemoryEventForProjection(ev)),
  );
  if (sorted.length === 0) return "";
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
    .map((ev) => `- [${ev.memoryKind}] ${compactedEventText(ev)}`)
    .join("\n");
  return `${rollingSummary}\n\nRECENT EVENTS (verbatim):\n${verbatim}`;
}

function compactedEventText(ev: VerticalDramaMemoryEvent): string {
  switch (ev.memoryKind) {
    case "canonical_fact":
      return eventText(ev.summaryText, ev.payload?.fact) ?? "";
    case "episode_summary":
      return eventText(ev.summaryText, ev.payload?.summary) ?? "";
    case "hook_opened":
    case "hook_resolved":
      return eventText(ev.summaryText, ev.payload?.hook) ?? "";
    case "continuity_warning":
      return eventText(ev.summaryText, ev.payload?.warning) ?? "";
    case "product_tie_in_usage":
      return eventText(ev.summaryText, ev.payload?.productName, ev.payload?.product_name) ?? "";
    case "story_state": {
      const state = (ev.payload?.storyState ?? ev.payload) as Record<string, unknown>;
      return eventText(state.requiredNextEpisodeResponse) ?? "";
    }
    case "character_delta":
    case "relationship_delta":
    case "arc_replan_proposal":
    case "arc_replan_applied":
      return eventText(ev.summaryText) ?? "";
    default:
      return "";
  }
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
  opts: BuildEpisodeMemoryBundleOpts = {},
): VerticalDramaEpisodeMemoryBundle {
  const sorted = sortEventsStable(events);

  // Only memory from completed, earlier episodes may influence this episode.
  // The canonical event path writes approved facts with an episode number;
  // approved retcons are the one intentionally series-scoped exception.
  // Arc proposals remain advisory signals, but only after their triggering
  // episode, and never enter the factual projections below.
  const episodeScoped = sorted.flatMap((ev, index) => {
    if (!isValidMemoryEventForProjection(ev)) return [];
    const sourceEpisode = eventEpisodeNumber(ev);
    if (sourceEpisode != null) {
      if (sourceEpisode >= episodeNumber) return [];
      if (ev.approved === true || ev.memoryKind === "arc_replan_proposal") {
        return [{ ev, index, sourceEpisode }];
      }
      return [];
    }
    if (
      ev.memoryKind === "canonical_fact" &&
      ev.approved === true &&
      typeof ev.payload?.retconApprovalOf === "string"
    ) {
      return [{ ev, index, sourceEpisode: undefined }];
    }
    return [];
  });

  // Append-only storage keeps old approvals. Project only the latest accepted
  // checkpoint/manual summary revision for each source episode so a re-draft
  // cannot leave stale facts or hooks in future prompts.
  const latestSummaryIndexByEpisode = new Map<number, number>();
  for (const entry of episodeScoped) {
    if (entry.ev.memoryKind === "episode_summary" && entry.sourceEpisode != null) {
      latestSummaryIndexByEpisode.set(entry.sourceEpisode, entry.index);
    }
  }
  const eligible = episodeScoped
    .filter(({ ev, index, sourceEpisode }) => {
      if (sourceEpisode == null) return true;
      const latestSummaryIndex = latestSummaryIndexByEpisode.get(sourceEpisode);
      return latestSummaryIndex == null || index >= latestSummaryIndex;
    })
    .map(({ ev }) => ev);

  // Retcon supersession: an event id superseded by any later event is dropped.
  const supersededIds = new Set<string>();
  for (const ev of eligible) {
    for (const sup of ev.supersedesEventIds ?? []) supersededIds.add(sup);
  }
  const live = eligible.filter((ev) => !supersededIds.has(ev.memoryEventId));

  // Canonical facts (approved retcon approvals count as canonical facts too).
  const canonicalFacts = live
    .filter((ev) => ev.memoryKind === "canonical_fact")
    .map((ev) => eventText(ev.payload?.fact, ev.summaryText))
    .filter((fact): fact is string => fact !== undefined);

  // Episode summaries: keep the last N by episode number.
  const episodeSummaryEvents = live
    .filter((ev) => ev.memoryKind === "episode_summary")
    .sort((a, b) => (eventEpisodeNumber(a) ?? 0) - (eventEpisodeNumber(b) ?? 0));
  const lastSummaries = episodeSummaryEvents
    .slice(-policy.includeLastEpisodeCount)
    .flatMap((ev) => {
      const summary = eventText(ev.payload?.summary, ev.summaryText);
      const sourceEpisode = eventEpisodeNumber(ev);
      if (!summary || sourceEpisode == null) return [];
      const rawCharacterDeltas = ev.payload?.characterDeltas;
      const characterDeltas = Array.isArray(rawCharacterDeltas)
        ? rawCharacterDeltas.filter(
            (delta): delta is VerticalDramaSeriesMemory["episodeSummaries"][number]["characterDeltas"][number] => {
              if (!delta || typeof delta !== "object" || Array.isArray(delta)) return false;
              const candidate = delta as Record<string, unknown>;
              const changedFields = candidate.changedFields;
              return (
                typeof candidate.characterId === "string" && candidate.characterId.trim().length > 0 &&
                typeof candidate.episodeNumber === "number" &&
                Number.isInteger(candidate.episodeNumber) && candidate.episodeNumber > 0 &&
                typeof candidate.summary === "string" && candidate.summary.trim().length > 0 &&
                Array.isArray(changedFields) &&
                changedFields.every((field) => typeof field === "string")
              );
            },
          )
        : [];
      const rawProductTieIn = ev.payload?.productTieInUsage;
      let productTieInUsage:
        | VerticalDramaSeriesMemory["episodeSummaries"][number]["productTieInUsage"]
        | undefined;
      if (rawProductTieIn && typeof rawProductTieIn === "object" && !Array.isArray(rawProductTieIn)) {
        const candidate = rawProductTieIn as Record<string, unknown>;
        const claimsReview = candidate.claimsReview;
        if (
          typeof candidate.enabled === "boolean" &&
          typeof candidate.episodeHasTieIn === "boolean" &&
          Array.isArray(candidate.shotNumbers) &&
          candidate.shotNumbers.every((shotNumber) => Number.isInteger(shotNumber) && Number(shotNumber) > 0) &&
          typeof candidate.storyFunction === "string" && candidate.storyFunction.trim().length > 0 &&
          typeof candidate.placementNaturalnessScore === "number" &&
          Number.isFinite(candidate.placementNaturalnessScore) &&
          !!claimsReview &&
          typeof claimsReview === "object" &&
          !Array.isArray(claimsReview) &&
          typeof (claimsReview as Record<string, unknown>).unsupportedClaimsDetected === "boolean" &&
          Array.isArray((claimsReview as Record<string, unknown>).warnings) &&
          ((claimsReview as Record<string, unknown>).warnings as unknown[]).every((warning) => typeof warning === "string") &&
          typeof candidate.disclosureRequired === "boolean"
        ) {
          productTieInUsage = rawProductTieIn as VerticalDramaSeriesMemory["episodeSummaries"][number]["productTieInUsage"];
        }
      }
      const episodeId = eventText(ev.episodeId, ev.payload?.episodeId) ?? "";
      const cliffhanger = eventText(ev.payload?.cliffhanger);
      return [{
        episodeId,
        episodeNumber: sourceEpisode,
        summary,
        ...(cliffhanger ? { cliffhanger } : {}),
        characterDeltas,
        ...(productTieInUsage ? { productTieInUsage } : {}),
      }];
    });

  // Hooks.
  const openedHooks = live.filter((ev) => ev.memoryKind === "hook_opened");
  const resolvedHookEvents = live.filter((ev) => ev.memoryKind === "hook_resolved");
  const resolvedHookKeys = new Set(
    resolvedHookEvents
      .map((ev) => eventText(ev.payload?.hookId, ev.payload?.hook, ev.summaryText))
      .filter((hook): hook is string => hook !== undefined),
  );
  const unresolvedHooks = openedHooks
    .map((ev) => ({
      key: eventText(ev.payload?.hookId, ev.payload?.hook, ev.summaryText),
      text: eventText(ev.payload?.hook, ev.summaryText),
    }))
    .filter((hook): hook is { key: string; text: string } =>
      hook.key !== undefined && hook.text !== undefined && !resolvedHookKeys.has(hook.key),
    )
    .map((hook) => hook.text);

  // Resolved-hook lookback: hooks resolved within the last N episodes.
  const resolvedHookLookback = resolvedHookEvents
    .filter((ev) => {
      const epNum = eventEpisodeNumber(ev);
      return epNum == null || episodeNumber - epNum <= policy.includeResolvedHookLookbackCount;
    })
    .map((ev) => eventText(ev.payload?.hook, ev.summaryText))
    .filter((hook): hook is string => hook !== undefined);

  const continuityWarnings = live
    .filter((ev) => ev.memoryKind === "continuity_warning")
    .map((ev) => eventText(ev.payload?.warning, ev.summaryText))
    .filter((warning): warning is string => warning !== undefined);

  const usedCompaction = live.filter((ev) => ev.approved === true).length >
    VERTICAL_DRAMA_MEMORY_COMPACTION_EVENT_THRESHOLD;
  const compactedMemoryText = usedCompaction ? buildCompactedMemoryText(live) : "";

  const productTieInFatigue = computeProductTieInFatigue(
    live,
    episodeNumber,
    policy.includeResolvedHookLookbackCount,
  );

  // Deterministic updatedAt: last event's timestamp, else epoch.
  const updatedAt = live.length > 0 ? live[live.length - 1].createdAt : new Date(0).toISOString();

  // Bundle item 9 (spec §7.7.3, section-13, added 2026-07-07) — flag-gated;
  // omitted entirely (not even present as `undefined` keys — see the object
  // spread below) when the flag is off, so the bundle shape is otherwise
  // byte-identical to before this change.
  const arcReplanExtras = opts.arcReplanEnabled
    ? {
        ...(opts.activeBreakdownVersion ? { activeBreakdownVersion: opts.activeBreakdownVersion } : {}),
        standingArcDriftWarnings: deriveStandingArcDriftWarnings(live),
      }
    : {};

  // Feature 132 §5.3 (F132B) — flag-gated; omitted entirely (not even
  // present as an `undefined` key) when the flag is off, matching
  // `arcReplanExtras`'s exact convention above.
  const storyState = opts.ledgersEnabled
    ? deriveStoryStateForEpisode(live, episodeNumber)
    : undefined;

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
    ...arcReplanExtras,
    ...(storyState ? { storyState } : {}),
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
    opts: BuildEpisodeMemoryBundleOpts = {},
  ): Promise<VerticalDramaEpisodeMemoryBundle> {
    const events = await this.loadAllEvents(owner);
    return buildEpisodeMemoryBundle(events, episodeNumber, policy, opts);
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
