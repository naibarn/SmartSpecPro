/**
 * Vertical Drama Series — Season/Special-Edition Lineage.
 *
 * Part of `planning/vd-series-memory-and-lineage/plan.md` Part 2 (Stage
 * 2.1). Declares the shape persisted at `vertical_drama_series.lineage`
 * (jsonb, `drizzle/schema.ts`) alongside the sibling `parentSeriesId` /
 * `createMode` / `seasonNumber` columns added by
 * `drizzle/manual_vertical_drama_series_lineage.sql`. Not folded into
 * `./contracts.ts` (the 1000+ line bible contract) — one-concern-per-file,
 * same precedent as `./audienceAgeRating.ts` / `./seriesMemoryState.ts`, and
 * not re-exported from `./index.ts` either, matching those two files' own
 * "import the submodule directly" convention (neither of them is barrel
 * -exported).
 *
 * Pure field-only types, no zod — this file only declares the CONTRACT; the
 * server owns runtime validation of both the wizard's input (loosely typed
 * `z.record(...)` on `createSeriesInput.lineage`, same "wizard payloads
 * stored losslessly" convention as `bible`/`memory`/`productTieIn`/`policy`)
 * and any AI-produced draft (`server/services/verticalDramaSeasonCarryOver.ts`
 * owns that zod schema, mirroring `synthesizedPresetDraftSchema`).
 */

import type {
  VdOpenThread,
  VdRelationshipState,
} from "./seriesMemoryState";

/**
 * `NULL` on the `createMode` column means "an ORIGINAL series" — see
 * `manual_vertical_drama_series_lineage.sql`'s header comment. Do NOT add an
 * `"original"` member here: that would reintroduce the sentinel the schema
 * deliberately avoids and break the "NULL = original, a structural
 * guarantee" invariant every read path relies on.
 */
export const VERTICAL_DRAMA_SERIES_CREATE_MODES = [
  "sequel",
  "special_edition",
] as const;

export type VerticalDramaSeriesCreateMode =
  (typeof VERTICAL_DRAMA_SERIES_CREATE_MODES)[number];

/**
 * How a carried-over parent character is disposed of in the new season, as
 * decided by the Stage 2.2 carry-over planner and (optionally) edited by the
 * user before `create`. Mirrors the vocabulary named in the plan's Stage 2.2
 * section verbatim (`returns` / `returns_with_explanation` / `write_out` /
 * `cameo_only`).
 */
export const VERTICAL_DRAMA_CARRY_OVER_AVAILABILITIES = [
  "returns",
  "returns_with_explanation",
  "write_out",
  "cameo_only",
] as const;

export type VerticalDramaCarryOverAvailability =
  (typeof VERTICAL_DRAMA_CARRY_OVER_AVAILABILITIES)[number];

/**
 * One parent-series character's carry-over decision. `characterKey` is the
 * stable handle (see `VdRelationshipState.pair`'s own doc comment on why
 * `characterKey`, never a DB row id, is the thing that survives a clone).
 * `suggestedStateUpdate` is free prose the carry-over planner writes (e.g.
 * "released from prison after 3 years, estranged from his daughter") that
 * `cloneSeriesCastForLineage` merges into the cloned row's
 * `data.currentState` — the user may edit this before `create` persists it.
 */
export type VerticalDramaCarryOverCharacterDecision = {
  characterKey: string;
  name: string;
  /** Free text: where this character's arc stood at the parent series' finale. */
  postFinaleStatus: string;
  availability: VerticalDramaCarryOverAvailability;
  /** Required when `availability === "returns_with_explanation"` — how the character plausibly returns (e.g. a villain's earned prison release). */
  returnJustification?: string;
  /** Merged into the cloned character's `data.currentState` at `create` time — absent means "carry the parent's currentState forward unchanged". */
  suggestedStateUpdate?: string;
};

/**
 * The AI-proposed (and user-editable) carry-over draft — the Stage 2.2
 * `proposeSeasonCarryOver` mutation's transient response shape AND the
 * shape persisted (once the user approves/edits it) under
 * `VerticalDramaSeriesLineage.carryOver` at `create` time. `carriedRelationships`
 * / `carriedThreads` are a SNAPSHOT of the parent's
 * `series.memory.currentState` at proposal time (not a live reference) —
 * the plan's explicit requirement that the user sees and can edit them
 * before they become the new season's starting continuity.
 */
export type VerticalDramaSeasonCarryOverDraft = {
  contractVersion: 1;
  characters: VerticalDramaCarryOverCharacterDecision[];
  newCharacterSuggestions: string[];
  newConflictDirections: string[];
  /** How the new season handles (or replaces) the parent's antagonist. */
  antagonistStrategy: string;
  carriedRelationships: VdRelationshipState[];
  carriedThreads: VdOpenThread[];
};

/**
 * The durable lineage payload persisted at `vertical_drama_series.lineage`.
 * `parentTitle`/`parentEpisodeCount` are a SNAPSHOT taken at `create` time —
 * deliberately not a live join — so a child series' badge
 * ("ภาคพิเศษ ของ <ชื่อเรื่อง>" / "ภาค <seasonNumber>") keeps rendering even
 * after the parent row is deleted (`parentSeriesId` degrades to `NULL` via
 * `ON DELETE SET NULL`, but `lineage` itself is untouched).
 *
 * `priorSeasonSummary` is a snapshot of the parent's
 * `series.memory.compactSummary` at creation time — NOT a live reference —
 * matching this feature's core constraint that a sequel is fed BOUNDED
 * memory, never the parent's full episode-by-episode content (see
 * `loadLineageContext`, `server/services/verticalDramaSeriesLineage.ts`).
 *
 * `carryOver` is present for `createMode: "sequel"` (Stage 2.2/2.3); absent
 * for `createMode: "special_edition"` (Stage 2.5, out of this task's scope)
 * — a special edition's own source config (marketplace / uploaded
 * reference / story-function selection) is intentionally NOT modeled here
 * yet, to avoid speculatively building ahead of that stage's actual
 * requirements.
 */
export type VerticalDramaSeriesLineage = {
  contractVersion: 1;
  parentSeriesId: number;
  parentTitle: string;
  parentEpisodeCount?: number;
  createMode: VerticalDramaSeriesCreateMode;
  seasonNumber?: number;
  priorSeasonSummary?: string;
  carryOver?: VerticalDramaSeasonCarryOverDraft & {
    /** The free-form premise the user typed into `proposeSeasonCarryOver`, if any — carried forward for display/audit. */
    premise?: string;
  };
};
