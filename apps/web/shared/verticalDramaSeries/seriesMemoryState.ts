/**
 * Vertical Drama Series — Series Memory State (materialized projection).
 *
 * Part of `planning/vd-series-memory-and-lineage/plan.md` Stage 1.1. This
 * module declares concepts the product has NEVER had: a per-pair
 * relationship STATE (not a delta), a disclosure axis (secret / known to
 * some / public / never spoken aloud), and a "domestic" thread class for
 * mundane unfinished business (e.g. "the house renovation still isn't
 * done"). See the plan file for the full investigation that motivated this
 * (`vertical_drama_memory_events` has 0 rows across 233 runs; the existing
 * `relationshipMap`/`currentState.relationshipNotes` types in `./contracts`
 * have 0 readers/writers).
 *
 * Relationship to `./memory.ts`: `./memory.ts` defines the DURABLE,
 * append-only event log (`VerticalDramaMemoryEvent` /
 * `VerticalDramaMemoryKind`, incl. `"relationship_delta"` /
 * `"episode_summary"`) — events are never mutated once written. THIS file is
 * the projection layer that sits on top: `VdEpisodeMemory` is a
 * per-episode fact block (conceptually one skill-authored summary of "what
 * happened this episode"), and `foldSeriesMemory` replays those blocks into
 * a single materialized `currentState` a UI or a downstream skill can read
 * directly without replaying the whole event log. It does not read or write
 * `vertical_drama_memory_events` itself — persistence/wiring is Stage 1.2.
 *
 * `VdRelationshipState` supersedes `VerticalDramaRelationship`
 * (`./contracts.ts`, `fromCharacterId`/`toCharacterId`/`kind`) and
 * `VerticalDramaSeriesBible.relationshipMap` (`./contracts.ts`): those types
 * are NOT deleted here (out of scope for this task; other code still
 * imports the module they live in) but they are dead in practice (0 entries
 * across all 9 existing series) because they have no STATE axis (they
 * describe a single edge, not "what is true right now for this pair") and
 * no DISCLOSURE axis at all — the exact gap this file exists to close.
 *
 * Everything below is pure field-only types plus one pure fold function.
 * No zod here — matching the sibling files this module was modeled on
 * (`./audienceAgeRating.ts`, `./memory.ts`) which also declare plain
 * TypeScript contracts and leave runtime validation of LLM output to the
 * service layer (Stage 1.2 for this feature). No DB, no LLM, no I/O.
 */

/**
 * How visible a relationship is to the story world — the axis that did not
 * exist anywhere in the codebase before this file (spec: plan Stage 1.1,
 * "ระดับการเปิดเผยความสัมพันธ์ ไม่มี concept นี้ในระบบเลย").
 *
 * - `"secret"` — the relationship exists and at least one party is
 *   DELIBERATELY hiding it from others (e.g. an affair, a secret alliance).
 * - `"known_to_some"` — a known subset of characters are aware; pairs with
 *   `VdRelationshipState.knownBy` to say who.
 * - `"public"` — openly acknowledged within the story world; any character
 *   may reference it without it being a revelation.
 * - `"undeclared"` — both parties may privately feel it, but NEITHER has
 *   said it aloud yet, to each other or anyone else. This is distinct from
 *   `"secret"`: nothing is being hidden, it simply hasn't been spoken —
 *   the state a slow-burn romance sits in before either a confession
 *   (→ `"public"`/`"known_to_some"`) or a deliberate concealment
 *   (→ `"secret"`) happens.
 */
export type VdRelationshipDisclosure =
  "secret" | "known_to_some" | "public" | "undeclared";

/**
 * The MATERIALIZED state of one character pair's relationship as of a given
 * episode — NOT a delta. This is the direct fix for the existing
 * `relationship_delta` memory-event kind (`./memory.ts`) and the
 * `plan_episode_script` output's `character_state_deltas`, both of which
 * record "trust -> rivalry" style transitions that never accumulate into an
 * answerable "who is dating whom, right now" state.
 */
export type VdRelationshipState = {
  /**
   * The two characters' `characterKey` (NOT a DB row id / `characterId`).
   * `characterKey` is unique per `(seriesId, characterKey)` and is the
   * stable handle a sequel clones forward (see plan Stage 2.3) — using the
   * DB id here would break the moment a sequel re-inserts the character
   * under a new row id. Order within the tuple carries no meaning: pair
   * identity is order-insensitive (see `foldSeriesMemory`'s pair-key
   * normalization below).
   */
  pair: [string, string];
  /** Free text the skill writes, e.g. "คบกัน" / "หย่าแล้ว" / "พี่น้องห่างเหิน". */
  status: string;
  disclosure: VdRelationshipDisclosure;
  /**
   * `characterKey`s who know about this relationship. For `"undeclared"`
   * this is meaningfully empty or reflects private suspicion only — nobody
   * has been TOLD, because nothing has been said aloud yet.
   */
  knownBy: string[];
  /** Episode number this state has held since (first became true). */
  sinceEpisode: number;
};

/**
 * Classification of an open story thread. `"domestic"` is the addition this
 * feature exists to make possible — mundane unfinished business ("the house
 * renovation still isn't done", "hasn't paid mom back yet") that today has
 * nowhere to live: the system only ever recorded plot hooks.
 */
export type VdThreadClass =
  "plot" | "domestic" | "career" | "financial" | "health" | "relationship";

/**
 * An open (or since-resolved) story thread. Presence of `resolvedEpisode`
 * is the ONLY thing that distinguishes "resolved" from "open" — a thread
 * must never simply vanish silently the way `open_threads` does in the
 * current pipeline (computed at `verticalDramaStoryBible.ts:3959` then
 * discarded; hardcoded to `[]` at `verticalDramaSeries.ts:1981`).
 */
export type VdOpenThread = {
  threadId: string;
  description: string;
  threadClass: VdThreadClass;
  openedEpisode: number;
  /** Present = resolved as of this episode number. Absent = still open. */
  resolvedEpisode?: number;
};

/**
 * One skill-authored fact block per sub-episode — the unit `foldSeriesMemory`
 * replays. Written at story-authoring time (Stage 1.2), not after render.
 */
export type VdEpisodeMemory = {
  episodeNumber: number;
  /** Prose recap of this episode. */
  recap: string;
  /** Canonical facts this episode pins down (accumulate, dedupe, never retract here). */
  canonicalFacts: string[];
  threadsOpened: VdOpenThread[];
  /** `threadId`s resolved as of this episode (may resolve a thread opened in an earlier episode). */
  threadsResolved: string[];
  /**
   * The relationship STATE **after** this episode — NOT a delta. This is
   * the exact mistake the existing `vertical-drama-series-memory-planner`
   * skill makes today (it records `{pair, change: "trust -> rivalry"}`);
   * this field must always be "what is true now for this pair", already
   * reflecting whatever happened in this episode.
   */
  relationshipChanges: VdRelationshipState[];
  knowledgeChanges: Array<{ characterKey: string; learned: string }>;
};

/**
 * The accumulated, replay-derived state exposed to a reader (UI tab, or a
 * downstream skill like the Stage 2.2 season carry-over planner) without
 * needing to replay `VdSeriesMemory.episodes` itself.
 */
export type VdSeriesMemoryCurrentState = {
  /** One entry per pair — the latest known state, order-insensitive by pair. */
  relationships: VdRelationshipState[];
  /** Only threads with no `resolvedEpisode`. */
  openThreads: VdOpenThread[];
  canonicalFacts: string[];
  /** `characterKey` -> accumulated, deduped list of things learned. */
  characterKnowledge: Record<string, string[]>;
};

/**
 * The persisted, series-level memory contract (intended home:
 * `vertical_drama_series.memory` jsonb — no migration needed, per plan
 * Stage 1.2). This file only declares the shape and the pure fold; reading
 * and writing this to the DB, wiring it into skill prompts, and generating
 * `compactSummary` are out of scope for Stage 1.1 (see plan Stage 1.2).
 */
export type VdSeriesMemory = {
  contractVersion: 1;
  episodes: VdEpisodeMemory[];
  /** Pure `foldSeriesMemory(episodes)` output — TS-only, never calls an LLM. */
  currentState: VdSeriesMemoryCurrentState;
  /** Token-bounded prose summary fed to downstream skills (e.g. season carry-over planning). */
  compactSummary: string;
  lastFoldedEpisode: number;
  /**
   * True once a user has hand-edited this memory via the Series Memory tab
   * (plan Stage 1.4). Enforcement (producers must not overwrite user edits)
   * is Stage 1.2's `verticalDramaSeriesMemoryProjection.ts` responsibility —
   * this field only declares the flag so later stages have somewhere to
   * read/write it.
   */
  userEdited?: boolean;
};

/**
 * Order-insensitive identity key for a relationship pair — `["a", "b"]` and
 * `["b", "a"]` are the same pair. Not exported: an implementation detail of
 * `foldSeriesMemory`'s "last state wins per pair" replay.
 */
function pairKey(pair: readonly [string, string]): string {
  return [...pair].sort().join(" ");
}

/**
 * Replays a series' per-episode memory blocks into the single materialized
 * `currentState` a reader can use directly — the "delta -> state" answer the
 * product has never had (see this file's header doc comment).
 *
 * Contract:
 * - **Pure and deterministic.** No I/O, no LLM call, no `Date.now()`, no
 *   randomness. Same input always yields the same output (including key
 *   ordering), so it is directly snapshot-testable.
 * - Input order is NOT trusted — episodes are replayed in ascending
 *   `episodeNumber` order regardless of array order. Ties (duplicate
 *   `episodeNumber`) are broken by original array position: the entry that
 *   appears LATER in the input array wins, matching "last write wins".
 * - Relationship pair identity is order-insensitive (`pairKey` above);
 *   the last `relationshipChanges` entry replayed for a pair, in replay
 *   order, is the pair's final state. Output is sorted by the normalized
 *   pair key for a stable, testable ordering.
 * - A thread is included in `openThreads` iff it has no `resolvedEpisode`
 *   after replay. `threadsResolved` in a later episode sets
 *   `resolvedEpisode` on a thread opened in an earlier (or the same)
 *   episode. Resolving an unknown/never-opened `threadId` is a no-op — it
 *   must never throw, because this runs on LLM-produced data.
 * - `canonicalFacts` accumulate across episodes, de-duplicated, in the
 *   order first seen.
 * - `characterKnowledge` accumulates `knowledgeChanges` per `characterKey`,
 *   de-duplicated, in the order first seen.
 * - Malformed/partial input (missing arrays, non-string entries, a
 *   malformed `pair`, a non-array `episodes` argument) is tolerated by
 *   skipping the offending entry — this function must never throw.
 */
export function foldSeriesMemory(
  episodes: VdEpisodeMemory[]
): VdSeriesMemory["currentState"] {
  const emptyState: VdSeriesMemory["currentState"] = {
    relationships: [],
    openThreads: [],
    canonicalFacts: [],
    characterKnowledge: {},
  };

  if (!Array.isArray(episodes) || episodes.length === 0) {
    return emptyState;
  }

  // Defensive sort: replay by ascending episodeNumber, never trusting input
  // order. Ties broken by original array index so a duplicate
  // episodeNumber's LATER array entry wins (explicit tiebreaker — does not
  // rely on Array.prototype.sort's stability guarantee).
  const sorted = episodes
    .map((episode, index) => ({ episode, index }))
    .filter(
      ({ episode }) =>
        episode != null && typeof episode.episodeNumber === "number"
    )
    .sort(
      (a, b) =>
        a.episode.episodeNumber - b.episode.episodeNumber || a.index - b.index
    )
    .map(({ episode }) => episode);

  const relationshipsByPair = new Map<string, VdRelationshipState>();
  const threadsById = new Map<string, VdOpenThread>();
  const canonicalFactsSeen = new Set<string>();
  const canonicalFacts: string[] = [];
  const characterKnowledge: Record<string, string[]> = {};
  const characterKnowledgeSeen = new Map<string, Set<string>>();

  for (const episode of sorted) {
    for (const fact of episode.canonicalFacts ?? []) {
      if (typeof fact !== "string" || fact.length === 0) continue;
      if (canonicalFactsSeen.has(fact)) continue;
      canonicalFactsSeen.add(fact);
      canonicalFacts.push(fact);
    }

    for (const thread of episode.threadsOpened ?? []) {
      if (!thread || typeof thread.threadId !== "string") continue;
      threadsById.set(thread.threadId, { ...thread });
    }

    for (const threadId of episode.threadsResolved ?? []) {
      if (typeof threadId !== "string") continue;
      const existing = threadsById.get(threadId);
      // Resolving a thread that was never opened (or already elsewhere)
      // is tolerated as a no-op — never throw on LLM-produced input.
      if (!existing) continue;
      existing.resolvedEpisode = episode.episodeNumber;
    }

    for (const relationship of episode.relationshipChanges ?? []) {
      if (
        !relationship ||
        !Array.isArray(relationship.pair) ||
        relationship.pair.length !== 2 ||
        typeof relationship.pair[0] !== "string" ||
        typeof relationship.pair[1] !== "string"
      ) {
        continue;
      }
      relationshipsByPair.set(pairKey(relationship.pair), relationship);
    }

    for (const change of episode.knowledgeChanges ?? []) {
      if (
        !change ||
        typeof change.characterKey !== "string" ||
        typeof change.learned !== "string"
      ) {
        continue;
      }
      let seen = characterKnowledgeSeen.get(change.characterKey);
      if (!seen) {
        seen = new Set<string>();
        characterKnowledgeSeen.set(change.characterKey, seen);
      }
      if (seen.has(change.learned)) continue;
      seen.add(change.learned);
      (characterKnowledge[change.characterKey] ??= []).push(change.learned);
    }
  }

  const relationships = [...relationshipsByPair.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, relationship]) => relationship);

  const openThreads = [...threadsById.values()]
    .filter(thread => thread.resolvedEpisode === undefined)
    .sort(
      (a, b) =>
        a.openedEpisode - b.openedEpisode ||
        a.threadId.localeCompare(b.threadId)
    );

  return { relationships, openThreads, canonicalFacts, characterKnowledge };
}
