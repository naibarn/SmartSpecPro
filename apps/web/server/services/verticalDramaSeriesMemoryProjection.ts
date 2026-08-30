/**
 * Vertical Drama Series — Series Memory PROJECTION (write path).
 *
 * Part of `planning/vd-series-memory-and-lineage/plan.md` Stage 1.2 — the
 * fix for the root cause documented there: `summarize_episode_to_series_
 * memory` is the LAST stage of the whole pipeline (approval-gated, costs
 * credits, sits after render/assembly), so `vertical_drama_memory_events` has
 * 0 rows across 233 real pipeline runs. This module makes series memory get
 * written INSTEAD at story-authoring time, by piggybacking on an LLM call
 * that already happens in the deep-draft producer(s) — zero extra LLM calls,
 * zero extra credits, no approval gate.
 *
 * Persisted to `vertical_drama_series.memory` (jsonb, already exists on the
 * table — no migration needed for this stage). Shape is `VdSeriesMemory`
 * from `@shared/verticalDramaSeries/seriesMemoryState` (Stage 1.1) — that
 * file deliberately has NO zod (shared/ is client+server, matches sibling
 * files); this module owns ALL runtime validation of LLM-produced episode
 * memory, per that Stage 1.1 file's own doc comment ("leave runtime
 * validation of LLM output to the service layer").
 *
 * Two responsibilities:
 *  1. `resolveEpisodeMemoryBlock` — turn ONE raw (`unknown`) `episode_memory`
 *     LLM block into a trustworthy `VdEpisodeMemory`, tolerantly. Mirrors the
 *     tolerant-parse convention of `seriesMemoryPlannerOutputSchema`
 *     (`verticalDramaSeriesMemoryPlanning.ts`) and `scriptBuilderOutputSchema`
 *     (`verticalDramaScriptGeneration.ts`) — BUT does not copy their
 *     looseness (`z.object({}).passthrough()` arrays with no required inner
 *     shape, which is exactly why that data has always been worthless):
 *     the fields this feature depends on (`pair`, `status`, `disclosure`,
 *     `threadClass`, ...) are required inside their own array items, while
 *     the block/array/item objects themselves stay `.passthrough()` so an
 *     extra key the LLM adds never breaks the parse. A missing block or one
 *     that fails this schema NEVER throws — it degrades to a deterministic
 *     fallback (recap only, from logline/keyBeats/cliffhanger; no
 *     relationships) built by `buildFallbackEpisodeMemory`. This is the
 *     "weak-model JSON failure class" mitigation this feature's plan calls
 *     out explicitly (heavier VD schemas make cheap models emit broken
 *     JSON) — never fixed by changing the model (cost policy), only by
 *     making this ONE optional block safe to drop.
 *  2. `upsertEpisodeMemory(s)` — merge freshly-resolved episode memory
 *     block(s) into `vertical_drama_series.memory`, fold, and regenerate the
 *     token-bounded `compactSummary` a downstream skill (season carry-over
 *     planning, out of scope here) will read instead of replaying 20-100
 *     sub-episodes of raw content.
 *
 * Concurrency: `vertical_drama_series.memory` is a single jsonb blob — a
 * naive read-modify-write from two concurrent chunk-persist calls (the same
 * series can have `deep_generate` and `extend` jobs, or two chunks of the
 * SAME job's `onChunkComplete`/final-persist calls, racing) is a lost-update
 * bug. Mirrors the established row-lock convention already used elsewhere in
 * this codebase for the exact same class of problem (`groupsService.ts`'s
 * `SELECT ... FOR UPDATE`, `verticalDramaCharacterStock.ts`'s
 * `.select().for("update")` inside `db.transaction`): every write here reads
 * the series row `FOR UPDATE` inside a transaction, merges, and writes back
 * in the SAME transaction, serializing concurrent writers on that one row
 * instead of losing one side's update.
 *
 * `userEdited` precedence (Stage 1.4, the Series Memory tab, is out of scope
 * for this task, but the flag already exists on `VdSeriesMemory` and this is
 * where it must be enforced): once `stored.userEdited === true`, this module
 * NEVER regenerates `currentState`/`compactSummary` (those are exactly the
 * fields a future hand-edit UI lets a user rewrite) and NEVER supersedes an
 * episode number the user has already seen — it only APPENDS genuinely-new
 * episode numbers into `episodes[]` (documented in `upsertEpisodeMemories`'s
 * own doc comment), so authoring never silently stops being recorded, but a
 * hand-authored summary is never silently clobbered by the next producer
 * run.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { verticalDramaSeries } from "../../drizzle/schema";
import {
  foldSeriesMemory,
  type VdEpisodeMemory,
  type VdOpenThread,
  type VdRelationshipState,
  type VdSeriesMemory,
  type VdSeriesMemoryCurrentState,
} from "@shared/verticalDramaSeries/seriesMemoryState";
import { VERTICAL_DRAMA_MEMORY_RETRIEVAL_POLICY_DEFAULT } from "@shared/verticalDramaSeries/memory";
import { normalizeVerticalDramaContinuityTimeline } from "@shared/verticalDramaSeries/storyContinuity";
import {
  relationshipGraphDeltaSchema,
  type RelationshipGraphDelta,
} from "@shared/verticalDramaSeries/longFormContracts";
import {
  VD_THREAD_CLOSURE_DISPOSITIONS,
  VD_THREAD_CLOSURE_INTENTS,
  type VdThreadClosureAnnotation,
} from "@shared/verticalDramaSeries/closureAssurance";

/* -------------------------------------------------------------------------- */
/* 1. Raw `episode_memory` LLM block -> trustworthy `VdEpisodeMemory`          */
/* -------------------------------------------------------------------------- */

const vdThreadClassSchema = z.enum([
  "plot",
  "domestic",
  "career",
  "financial",
  "health",
  "relationship",
]);

const vdRelationshipDisclosureSchema = z.enum([
  "secret",
  "known_to_some",
  "public",
  "undeclared",
]);

/**
 * One `threads_opened[]` entry. `thread_id`/`description`/`thread_class` are
 * REQUIRED (this is the strict inner shape the brief calls for) — an entry
 * missing any of these is dropped by `z.array(...)`'s parse failure
 * bubbling up to the WHOLE `episode_memory` block failing (see
 * `episodeMemoryBlockSchema` below), which is deliberate: a thread with no
 * id/description/class is not a usable thread, and this block is optional
 * end-to-end anyway (falls back to `buildFallbackEpisodeMemory`), so failing
 * the whole block rather than silently keeping a broken thread is safe.
 * `openedEpisode` is NEVER requested from the LLM — it is always "this
 * episode" by construction (assigned in `toVdEpisodeMemory` below), removing
 * an entire class of "the model invented a wrong episode number" risk.
 */
const vdOpenThreadBlockSchema = z
  .object({
    thread_id: z.string().min(1),
    description: z.string().min(1),
    thread_class: vdThreadClassSchema,
    expected_resolution: z
      .enum(["this_episode", "future_episode", "season"])
      .optional(),
    expected_resolution_episode: z.number().int().positive().optional(),
    closure_intent: z.enum(VD_THREAD_CLOSURE_INTENTS).optional(),
    expected_evidence: z.array(z.string().min(1)).max(12).optional(),
  })
  .passthrough();

/**
 * One `relationship_changes[]` entry — the materialized state AFTER this
 * episode, never a delta (see `VdEpisodeMemory.relationshipChanges`'s own
 * doc comment). `pair`/`status`/`disclosure` are required; `known_by`
 * defaults to `[]` (meaningfully empty for `"undeclared"`). `sinceEpisode` is
 * NEVER requested from the LLM, for the same reason as `openedEpisode`
 * above — always assigned as "this episode" in `toVdEpisodeMemory`.
 */
const vdRelationshipChangeBlockSchema = z
  .object({
    pair: z.tuple([z.string().min(1), z.string().min(1)]),
    status: z.string().min(1),
    disclosure: vdRelationshipDisclosureSchema,
    known_by: z.array(z.string().min(1)).default([]),
  })
  .passthrough();

/** Strict Feature 153 graph mutation; legacy relationship_changes remains a derived compatibility field. */
const vdRelationshipGraphDeltaBlockSchema = relationshipGraphDeltaSchema;

const vdKnowledgeChangeBlockSchema = z
  .object({
    character_key: z.string().min(1),
    learned: z.string().min(1),
  })
  .passthrough();

const vdThreadClosureBlockSchema = z
  .object({
    thread_id: z.string().min(1),
    disposition: z.enum(VD_THREAD_CLOSURE_DISPOSITIONS),
    evidence_episode_numbers: z
      .array(z.number().int().positive())
      .max(32)
      .default([]),
    rationale: z.string().min(1).max(1000),
    confidence: z.enum(["high", "medium", "low"]).optional(),
  })
  .passthrough();

/**
 * The full `episode_memory` block shape, as emitted by
 * `vertical-drama-full-story-architect` (and, in a future task, the
 * `plan_episode_script` producer). ONLY `recap` is required at the top
 * level — every array defaults to `[]` so a model that writes a recap but
 * skips (say) `knowledge_changes` still produces a partially-useful,
 * schema-valid block instead of failing outright. `.passthrough()` at every
 * object level tolerates any extra key the LLM adds.
 */
export const episodeMemoryBlockSchema = z
  .object({
    recap: z.string().min(1),
    canonical_facts: z.array(z.string().min(1)).default([]),
    threads_opened: z.array(vdOpenThreadBlockSchema).default([]),
    threads_resolved: z.array(z.string().min(1)).default([]),
    relationship_changes: z.array(vdRelationshipChangeBlockSchema).default([]),
    relationship_graph_deltas: z
      .array(vdRelationshipGraphDeltaBlockSchema)
      .optional(),
    thread_closures: z.array(vdThreadClosureBlockSchema).optional(),
    knowledge_changes: z.array(vdKnowledgeChangeBlockSchema).default([]),
  })
  .passthrough();

export type VdEpisodeMemoryBlock = z.infer<typeof episodeMemoryBlockSchema>;

/** Context `resolveEpisodeMemoryBlock` needs to build a deterministic fallback when the LLM block is absent or invalid. */
export interface VdEpisodeMemoryFallbackContext {
  episodeNumber: number;
  logline?: string;
  keyBeats?: string[];
  cliffhangerLine?: string;
}

function toVdEpisodeMemory(
  parsed: VdEpisodeMemoryBlock,
  episodeNumber: number
): VdEpisodeMemory {
  const threadsOpened: VdOpenThread[] = parsed.threads_opened.map(thread => ({
    threadId: thread.thread_id,
    description: thread.description,
    threadClass: thread.thread_class,
    openedEpisode: episodeNumber,
    ...(thread.expected_resolution
      ? { expectedResolution: thread.expected_resolution }
      : {}),
    ...(thread.expected_resolution_episode
      ? { expectedResolutionEpisode: thread.expected_resolution_episode }
      : {}),
    ...(thread.closure_intent ? { closureIntent: thread.closure_intent } : {}),
    ...(thread.expected_evidence
      ? { expectedEvidence: thread.expected_evidence }
      : {}),
  }));
  const relationshipGraphDeltas = parsed.relationship_graph_deltas?.map(
    delta => delta as RelationshipGraphDelta
  );
  const relationshipChanges: VdRelationshipState[] = relationshipGraphDeltas
    ? relationshipGraphDeltas.map(delta => ({
        pair: [delta.fromCharacterKey, delta.toCharacterKey],
        status: delta.operation === "end" ? "ended" : delta.relationType,
        disclosure:
          delta.disclosure === "private"
            ? "secret"
            : delta.disclosure === "misunderstood"
              ? "undeclared"
              : delta.disclosure,
        knownBy: delta.knownByCharacterKeys,
        sinceEpisode: episodeNumber,
      }))
    : parsed.relationship_changes.map(relationship => ({
        pair: relationship.pair,
        status: relationship.status,
        disclosure: relationship.disclosure,
        knownBy: relationship.known_by,
        sinceEpisode: episodeNumber,
      }));
  return {
    episodeNumber,
    recap: parsed.recap,
    canonicalFacts: parsed.canonical_facts,
    threadsOpened,
    threadsResolved: parsed.threads_resolved,
    relationshipChanges,
    ...(relationshipGraphDeltas ? { relationshipGraphDeltas } : {}),
    ...(parsed.thread_closures
      ? {
          threadClosures: parsed.thread_closures.map(
            (closure): VdThreadClosureAnnotation => ({
              threadId: closure.thread_id,
              disposition: closure.disposition,
              evidenceEpisodeNumbers: closure.evidence_episode_numbers,
              rationale: closure.rationale,
              ...(closure.confidence ? { confidence: closure.confidence } : {}),
            })
          ),
        }
      : {}),
    knowledgeChanges: parsed.knowledge_changes.map(change => ({
      characterKey: change.character_key,
      learned: change.learned,
    })),
  };
}

/**
 * Deterministic fallback used when the `episode_memory` block is absent OR
 * fails `episodeMemoryBlockSchema` — projects what can be known WITHOUT an
 * LLM call from facts the deep-draft response already always carries
 * (`logline`/`keyBeats`/`cliffhanger_line`, all required/near-always-present
 * fields on every drafted episode). Deliberately produces NO relationship
 * state and NO threads (there is no reliable source for those without the
 * structured block) — recap-only memory is still strictly better than the
 * single-sentence total the pipeline has produced across 233 real runs.
 */
function buildFallbackEpisodeMemory(
  ctx: VdEpisodeMemoryFallbackContext
): VdEpisodeMemory {
  const beats = (ctx.keyBeats ?? []).filter(
    (beat): beat is string => typeof beat === "string" && beat.trim().length > 0
  );
  const recapParts = [ctx.logline, ...beats, ctx.cliffhangerLine].filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0
  );
  return {
    episodeNumber: ctx.episodeNumber,
    recap:
      recapParts.length > 0
        ? recapParts.join(" ")
        : `Episode ${ctx.episodeNumber}.`,
    canonicalFacts: [],
    threadsOpened: [],
    threadsResolved: [],
    relationshipChanges: [],
    knowledgeChanges: [],
  };
}

/**
 * Resolves ONE episode's `episode_memory` raw LLM value into a trustworthy
 * `VdEpisodeMemory` — ALWAYS returns a value, NEVER throws (this runs
 * per-episode inside the deep-draft chunk loop, standard AND premium; a
 * malformed block must never fail the draft — see this file's header doc
 * comment and `episodeMemoryBlockSchema`'s own doc comment). `raw == null`
 * (block simply absent, the common "flag off"/weak-model/older-run case)
 * and "present but fails strict validation" are treated identically: both
 * fall back to `buildFallbackEpisodeMemory`.
 */
export function resolveEpisodeMemoryBlock(
  raw: unknown,
  ctx: VdEpisodeMemoryFallbackContext
): VdEpisodeMemory {
  if (raw != null) {
    const parsed = episodeMemoryBlockSchema.safeParse(raw);
    if (parsed.success) {
      return toVdEpisodeMemory(parsed.data, ctx.episodeNumber);
    }
  }
  return buildFallbackEpisodeMemory(ctx);
}

/* -------------------------------------------------------------------------- */
/* 2. Deterministic, token-bounded `compactSummary`                           */
/* -------------------------------------------------------------------------- */

/**
 * Chars-per-token estimate for THIS summary's budget.
 *
 * Deliberately 2, NOT the ~4 used elsewhere in this codebase
 * (`messageChunkerService.ts:28`, `memoryMerger.ts:51`). That 4 is an
 * English-text heuristic; Vertical Drama is Thai-first (`locale` defaults to
 * `"th"`), and Thai tokenizes far denser — no inter-word spaces, and BPE
 * vocabularies cover Thai poorly, so a Thai character costs roughly 2-4x the
 * tokens an English one does. Measured against real data: series 16's backfilled
 * summary is 8,327 chars, which at 4 chars/token would be scored ~2.1k tokens
 * while realistically costing ~4k+ — i.e. the 4 heuristic silently reports
 * HALF the true cost or less.
 *
 * 2 is a conservative floor, not a measured constant (no tokenizer is a
 * dependency of this repo). Being under-budget costs a slightly shorter recap;
 * being over-budget inflates every downstream prompt that reads
 * `compactSummary` — and being bounded is this field's entire reason to exist
 * (a 100-sub-episode series must feed a season-2 skill without blowing up).
 * Erring short is the cheap direction.
 */
const CHARS_PER_TOKEN_ESTIMATE = 2;
const COMPACT_SUMMARY_MAX_CHARS =
  VERTICAL_DRAMA_MEMORY_RETRIEVAL_POLICY_DEFAULT.maxPromptTokens *
  CHARS_PER_TOKEN_ESTIMATE;
/** Safety cap independent of the overall char budget — a 100-episode series must not let `canonicalFacts` alone blow the budget before recaps are even considered. */
const MAX_CANONICAL_FACTS_IN_SUMMARY = 40;

/**
 * Assembles the bounded prose summary a downstream skill (e.g. the Stage 2.2
 * season carry-over planner, out of scope here) reads INSTEAD of replaying
 * every episode's full content — the whole point per this feature's plan
 * ("ไม่ใช่ให้ระบบย้อนอ่านเนื้อทั้งเรื่อง"). Deterministic, no LLM call.
 *
 * Priority order when trimming to fit `COMPACT_SUMMARY_MAX_CHARS`:
 *   1. Relationships + open threads + canonical facts (already bounded by
 *      `foldSeriesMemory`'s own "latest per pair"/"open only" semantics,
 *      plus the `MAX_CANONICAL_FACTS_IN_SUMMARY` cap here) — always kept in
 *      full, this is the highest-value, already-small section.
 *   2. Episode recaps, MOST RECENT first — filled until the remaining
 *      budget is exhausted, then re-ordered chronologically for
 *      readability. This is what actually keeps a 100-episode series
 *      bounded: older recaps are silently dropped from the summary (they
 *      remain fully available, un-lossy, in `episodes[]` itself).
 */
export function buildCompactSummary(
  currentState: VdSeriesMemoryCurrentState,
  episodes: ReadonlyArray<VdEpisodeMemory>
): string {
  const relationshipLines = currentState.relationships.map(relationship => {
    const knownBy =
      relationship.knownBy.length > 0
        ? `, known by: ${relationship.knownBy.join(", ")}`
        : "";
    return `- ${relationship.pair[0]} & ${relationship.pair[1]}: ${relationship.status} [${relationship.disclosure}]${knownBy}`;
  });
  const openThreadLines = currentState.openThreads.map(
    thread =>
      `- (${thread.threadClass}) ${thread.description} [opened ep.${thread.openedEpisode}]`
  );
  const canonicalFactLines = currentState.canonicalFacts
    .slice(-MAX_CANONICAL_FACTS_IN_SUMMARY)
    .map(fact => `- ${fact}`);

  const header = [
    "RELATIONSHIPS:",
    relationshipLines.length > 0
      ? relationshipLines.join("\n")
      : "- (none recorded yet)",
    "",
    "OPEN THREADS:",
    openThreadLines.length > 0 ? openThreadLines.join("\n") : "- (none open)",
    "",
    "CANONICAL FACTS:",
    canonicalFactLines.length > 0
      ? canonicalFactLines.join("\n")
      : "- (none recorded yet)",
    "",
    "EPISODE RECAPS (most recent first, older recaps may be omitted for length):",
  ].join("\n");

  const sortedEpisodes = [...episodes].sort(
    (a, b) => a.episodeNumber - b.episodeNumber
  );
  const remainingBudget = Math.max(
    0,
    COMPACT_SUMMARY_MAX_CHARS - header.length
  );
  const recapLines: string[] = [];
  let used = 0;
  for (let i = sortedEpisodes.length - 1; i >= 0; i--) {
    const ep = sortedEpisodes[i];
    const line = `- Ep.${ep.episodeNumber}: ${ep.recap}`;
    if (used + line.length + 1 > remainingBudget && recapLines.length > 0) {
      break;
    }
    recapLines.unshift(line);
    used += line.length + 1;
  }

  return [
    header,
    recapLines.length > 0 ? recapLines.join("\n") : "- (no episodes yet)",
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* 3. Persistence — merge into `vertical_drama_series.memory`                 */
/* -------------------------------------------------------------------------- */

export interface VdEpisodeMemoryUpsertSummary {
  /** Episode numbers actually merged into `episodes[]` this call (new + superseded, or new-only when `userEdited`). */
  mergedEpisodeCount: number;
  /** Of `mergedEpisodeCount`, how many were genuinely new episode numbers (not previously recorded). */
  newEpisodeCount: number;
  /** True when `stored.userEdited` was already `true` — `currentState`/`compactSummary` were left untouched (see this file's header doc comment). */
  skippedUserEdited: boolean;
}

function readStoredSeriesMemory(raw: unknown): VdSeriesMemory {
  if (!raw || typeof raw !== "object") {
    return {
      contractVersion: 1,
      episodes: [],
      currentState: foldSeriesMemory([]),
      compactSummary: "",
      lastFoldedEpisode: 0,
    };
  }
  const candidate = raw as Partial<VdSeriesMemory>;
  const episodes = Array.isArray(candidate.episodes)
    ? candidate.episodes.filter(
        (ep): ep is VdEpisodeMemory =>
          !!ep && typeof (ep as VdEpisodeMemory).episodeNumber === "number"
      )
    : [];
  return {
    contractVersion: 1,
    episodes,
    currentState: candidate.currentState ?? foldSeriesMemory(episodes),
    compactSummary:
      typeof candidate.compactSummary === "string"
        ? candidate.compactSummary
        : "",
    lastFoldedEpisode:
      typeof candidate.lastFoldedEpisode === "number"
        ? candidate.lastFoldedEpisode
        : 0,
    ...(candidate.userEdited === true ? { userEdited: true as const } : {}),
  };
}

/** Supersede-by-episodeNumber merge — a later call for the SAME episodeNumber replaces the prior record (a re-drafted episode's memory should win). */
function supersedeEpisodes(
  existing: ReadonlyArray<VdEpisodeMemory>,
  incoming: ReadonlyArray<VdEpisodeMemory>
): VdEpisodeMemory[] {
  const byNumber = new Map<number, VdEpisodeMemory>();
  for (const ep of existing) byNumber.set(ep.episodeNumber, ep);
  for (const ep of incoming) byNumber.set(ep.episodeNumber, ep);
  return [...byNumber.values()].sort(
    (a, b) => a.episodeNumber - b.episodeNumber
  );
}

/** `userEdited` path — appends ONLY episode numbers not already present; never supersedes an existing record (see this file's header doc comment). */
function appendNewOnlyEpisodes(
  existing: ReadonlyArray<VdEpisodeMemory>,
  incoming: ReadonlyArray<VdEpisodeMemory>
): VdEpisodeMemory[] {
  const seen = new Set(existing.map(ep => ep.episodeNumber));
  const additions = incoming.filter(ep => !seen.has(ep.episodeNumber));
  return [...existing, ...additions].sort(
    (a, b) => a.episodeNumber - b.episodeNumber
  );
}

/**
 * Merges one or more freshly-resolved `VdEpisodeMemory` blocks into
 * `vertical_drama_series.memory`, inside a single row-locked transaction
 * (see this file's header doc comment on why a lock is required here). Never
 * called directly by a producer's main code path without a try/catch at the
 * CALL SITE (mirrors `seedCharactersFromDraft`'s convention) — a genuine DB
 * error propagates from here so the caller's best-effort wrapper can log it;
 * this function itself does not swallow errors.
 *
 * Batches ALL of `episodeMemories` into ONE read-modify-write (one row lock,
 * one merge, one write) rather than one transaction per episode — this
 * matters for a multi-episode chunk: fewer lock round-trips, and a single
 * consistent `currentState`/`compactSummary` fold reflecting the WHOLE
 * batch, not an intermediate half-merged state a concurrent reader could
 * observe between per-episode writes.
 */
export async function upsertEpisodeMemories(
  seriesId: number,
  tenantId: string,
  userId: number,
  episodeMemories: ReadonlyArray<VdEpisodeMemory>
): Promise<VdEpisodeMemoryUpsertSummary> {
  const incoming = episodeMemories.filter(
    (ep): ep is VdEpisodeMemory =>
      ep != null && typeof ep.episodeNumber === "number"
  );
  if (incoming.length === 0) {
    return {
      mergedEpisodeCount: 0,
      newEpisodeCount: 0,
      skippedUserEdited: false,
    };
  }

  return db.transaction(async tx => {
    const ownershipWhere = and(
      eq(verticalDramaSeries.id, seriesId),
      eq(verticalDramaSeries.tenantId, tenantId),
      eq(verticalDramaSeries.userId, userId)
    );

    // Row-lock FIRST, then read `memory` — same shape as
    // `verticalDramaCharacterStock.ts`'s `.select().for("update")` inside
    // `db.transaction`, serializing any other concurrent
    // upsertEpisodeMemories call on this exact series row instead of losing
    // one side's update.
    const [row] = await tx
      .select({ memory: verticalDramaSeries.memory })
      .from(verticalDramaSeries)
      .where(ownershipWhere)
      .for("update");

    if (!row) {
      throw new Error(
        `upsertEpisodeMemories: series ${seriesId} not found for tenant/user — nothing to persist memory onto`
      );
    }

    const stored = readStoredSeriesMemory(row.memory);
    const priorEpisodeNumbers = new Set(
      stored.episodes.map(ep => ep.episodeNumber)
    );
    const newEpisodeCount = incoming.filter(
      ep => !priorEpisodeNumbers.has(ep.episodeNumber)
    ).length;

    if (stored.userEdited === true) {
      if (newEpisodeCount === 0) {
        // Nothing new to record and `currentState`/`compactSummary` must
        // stay untouched — true no-op, not even an `updatedAt` bump.
        return {
          mergedEpisodeCount: 0,
          newEpisodeCount: 0,
          skippedUserEdited: true,
        };
      }
      const mergedEpisodes = normalizeVerticalDramaContinuityTimeline(
        appendNewOnlyEpisodes(stored.episodes, incoming)
      ).episodes;
      const nextMemory: VdSeriesMemory = {
        ...stored,
        episodes: mergedEpisodes,
      };
      await tx
        .update(verticalDramaSeries)
        .set({ memory: nextMemory, updatedAt: new Date() })
        .where(ownershipWhere);
      return {
        mergedEpisodeCount: newEpisodeCount,
        newEpisodeCount,
        skippedUserEdited: true,
      };
    }

    // This is the canonical write boundary. Never persist an LLM-produced
    // resolution that cannot be tied to an opening in the chronological
    // series ledger; otherwise one bad ID poisons every later media gate.
    const normalized = normalizeVerticalDramaContinuityTimeline(
      supersedeEpisodes(stored.episodes, incoming)
    );
    const mergedEpisodes = normalized.episodes;
    const currentState = foldSeriesMemory(mergedEpisodes);
    const lastFoldedEpisode = mergedEpisodes.reduce(
      (max, ep) => Math.max(max, ep.episodeNumber),
      0
    );
    const compactSummary = buildCompactSummary(currentState, mergedEpisodes);
    const nextMemory: VdSeriesMemory = {
      contractVersion: 1,
      episodes: mergedEpisodes,
      currentState,
      compactSummary,
      lastFoldedEpisode,
    };
    await tx
      .update(verticalDramaSeries)
      .set({ memory: nextMemory, updatedAt: new Date() })
      .where(ownershipWhere);
    return {
      mergedEpisodeCount: incoming.length,
      newEpisodeCount,
      skippedUserEdited: false,
    };
  });
}

/** Single-episode convenience wrapper over `upsertEpisodeMemories` — the exact signature named in this feature's brief. */
export async function upsertEpisodeMemory(
  seriesId: number,
  tenantId: string,
  userId: number,
  episodeMemory: VdEpisodeMemory
): Promise<VdEpisodeMemoryUpsertSummary> {
  return upsertEpisodeMemories(seriesId, tenantId, userId, [episodeMemory]);
}

/**
 * Idempotent repair for legacy series memory. It removes only quarantined
 * lifecycle markers; episode recaps, openings, relationships, and user-edited
 * projections remain intact. This is intentionally safe to call from a
 * defensive media gate when an old series is encountered for the first time.
 */
export async function repairSeriesMemoryContinuity(
  seriesId: number,
  tenantId: string,
  userId: number
): Promise<{
  quarantinedResolutionCount: number;
  quarantinedOpeningCount: number;
}> {
  return db.transaction(async tx => {
    const ownershipWhere = and(
      eq(verticalDramaSeries.id, seriesId),
      eq(verticalDramaSeries.tenantId, tenantId),
      eq(verticalDramaSeries.userId, userId)
    );
    const [row] = await tx
      .select({ memory: verticalDramaSeries.memory })
      .from(verticalDramaSeries)
      .where(ownershipWhere)
      .for("update");
    if (!row) {
      return { quarantinedResolutionCount: 0, quarantinedOpeningCount: 0 };
    }

    const stored = readStoredSeriesMemory(row.memory);
    const normalized = normalizeVerticalDramaContinuityTimeline(
      stored.episodes
    );
    if (
      normalized.quarantinedResolutions.length === 0 &&
      normalized.quarantinedOpenings.length === 0
    ) {
      return { quarantinedResolutionCount: 0, quarantinedOpeningCount: 0 };
    }

    const nextMemory: VdSeriesMemory = stored.userEdited
      ? { ...stored, episodes: normalized.episodes }
      : {
          contractVersion: 1,
          episodes: normalized.episodes,
          currentState: foldSeriesMemory(normalized.episodes),
          compactSummary: buildCompactSummary(
            foldSeriesMemory(normalized.episodes),
            normalized.episodes
          ),
          lastFoldedEpisode: normalized.episodes.reduce(
            (max, episode) => Math.max(max, episode.episodeNumber),
            0
          ),
        };
    await tx
      .update(verticalDramaSeries)
      .set({ memory: nextMemory, updatedAt: new Date() })
      .where(ownershipWhere);
    return {
      quarantinedResolutionCount: normalized.quarantinedResolutions.length,
      quarantinedOpeningCount: normalized.quarantinedOpenings.length,
    };
  });
}

/**
 * Router-facing shim mirroring `persistDeepDraftDeclaredLocations`'s exact
 * shape (owner tuple + list in, summary out) — called at the SAME two
 * `runGenerateStoryBibleDeepJob`/`runExtendStoryDraftHorizonJob` call sites
 * as that function (`server/routers/verticalDramaSeries.ts`), AFTER the
 * bible write succeeds, inside a `try/catch` (this function itself is NOT
 * best-effort — the CALL SITE is, per this module's header doc comment).
 * Extracts each drafted item's already-resolved `episodeMemory` (populated
 * by `extractDramaturgyStructureFields` in `verticalDramaStoryBible.ts` for
 * every item — see that function's own doc comment) and merges the whole
 * batch in ONE transaction.
 */
export async function persistDeepDraftEpisodeMemories(
  owner: { tenantId: string; userId: number; seriesId: number },
  draftedItems: ReadonlyArray<{
    episodeNumber: number;
    episodeMemory?: VdEpisodeMemory;
  }>
): Promise<VdEpisodeMemoryUpsertSummary> {
  const episodeMemories = draftedItems
    .map(item => item.episodeMemory)
    .filter((memory): memory is VdEpisodeMemory => memory != null);
  if (episodeMemories.length === 0) {
    return {
      mergedEpisodeCount: 0,
      newEpisodeCount: 0,
      skippedUserEdited: false,
    };
  }
  return upsertEpisodeMemories(
    owner.seriesId,
    owner.tenantId,
    owner.userId,
    episodeMemories
  );
}
