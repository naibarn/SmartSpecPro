/**
 * Vertical Drama Series — Lineage READ path (Stage 2.3,
 * `planning/vd-series-memory-and-lineage/plan.md`).
 *
 * Assembles exactly what a sequel/special-edition needs from its parent
 * series: the parent's BOUNDED memory projection (`series.memory` —
 * `compactSummary` + `currentState`, never the parent's whole episode
 * content — this is the entire reason Part 1 of this feature exists: a
 * series may have 20-100 sub-episodes, far too much to feed a downstream
 * skill directly), the durable character/location roster, the visual
 * identity, and the audience age rating.
 *
 * Ownership convention (mirrors `verticalDramaStoryJobs.ts`'s own doc
 * comment on why it never statically imports the router): THIS FILE MUST
 * NEVER IMPORT `server/routers/verticalDramaSeries.ts`. The router owns
 * `loadOwnedSeries` (tenant/user ownership check + NOT_FOUND) and calls
 * INTO this service with the already-loaded, already-owned row — never the
 * other way around. This keeps the service layer free of a circular
 * import and free of any duplicate ownership-check logic.
 */

import { and, eq } from "drizzle-orm";
import {
  verticalDramaCharacters,
  verticalDramaLocations,
  type VerticalDramaCharacterRow,
  type VerticalDramaLocationRow,
  type VerticalDramaSeriesRow,
} from "../../drizzle/schema";
import { db } from "../db";
import {
  resolveAudienceAgeRating,
  type AudienceAgeRating,
} from "@shared/verticalDramaSeries/audienceAgeRating";
import {
  foldSeriesMemory,
  type VdSeriesMemory,
  type VdSeriesMemoryCurrentState,
} from "@shared/verticalDramaSeries/seriesMemoryState";
import type { NarrativeRole, RoleTier } from "@shared/verticalDramaSeries/narrativeRole";

export interface VerticalDramaLineageRosterCharacter {
  id: number;
  characterKey: string;
  name: string;
  role: string | null;
  narrativeRole: NarrativeRole | null;
  roleTier: RoleTier | null;
  occupation: string | null;
  /** Full `VerticalDramaCharacter`-shaped payload (identityLock, currentState, ...), read defensively — same convention as every other loosely-typed `data` read site in this router/service family. */
  data: unknown;
}

export interface VerticalDramaLineageRosterLocation {
  id: number;
  locationKey: string;
  name: string;
  data: unknown;
}

export interface VerticalDramaLineageVisualIdentity {
  visualStyle?: string;
  cameraGrammar?: string;
  /** `VerticalDramaPresetVisualIdentity`, read defensively off `bible.presetVisualIdentity` when the parent was created from (or later stamped with) a genre preset — see `stampPresetVisualIdentityIntoBible` (`routers/verticalDramaSeries.ts`). */
  presetVisualIdentity?: unknown;
}

export interface VerticalDramaLineageContext {
  parentSeriesId: number;
  parentTitle: string;
  parentGenre: string | null;
  parentTone: string | null;
  parentEpisodeCount: number;
  audienceAgeRating: AudienceAgeRating;
  visualIdentity: VerticalDramaLineageVisualIdentity;
  /** Bounded, token-budgeted prose summary — the ONLY story-content fact a downstream skill (e.g. the Stage 2.2 carry-over planner) should ever be fed. Empty string when the parent has no recorded memory yet. */
  compactSummary: string;
  currentState: VdSeriesMemoryCurrentState;
  /** True when the parent has never had ANY episode memory recorded — the "series เนื้อบาง" case (plan decision #6: warn, let the user fill in by hand) rather than a hard failure. */
  hasMemory: boolean;
  /** How many episodes' worth of memory actually folded into `currentState`/`compactSummary` — the numerator of the "coverage" warning (`lastFoldedEpisode` vs. `parentEpisodeCount`). */
  memoryEpisodesRecorded: number;
  roster: VerticalDramaLineageRosterCharacter[];
  locations: VerticalDramaLineageRosterLocation[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Defensive parse of `series.memory` — mirrors
 * `verticalDramaSeriesMemoryProjection.ts`'s `readStoredSeriesMemory`
 * (duplicated rather than imported: that function is that module's
 * INTERNAL, unexported helper, and re-deriving a read-only view here keeps
 * this file's failure mode fully independent — a malformed `memory` blob
 * must degrade to "no memory recorded" for lineage purposes, never throw).
 */
function readParentMemory(raw: unknown): {
  compactSummary: string;
  currentState: VdSeriesMemoryCurrentState;
  hasMemory: boolean;
  lastFoldedEpisode: number;
} {
  const empty = {
    compactSummary: "",
    currentState: foldSeriesMemory([]),
    hasMemory: false,
    lastFoldedEpisode: 0,
  };
  const record = asRecord(raw);
  if (!record) return empty;

  const episodes = Array.isArray((record as Partial<VdSeriesMemory>).episodes)
    ? (record as VdSeriesMemory).episodes
    : [];
  const hasMemory = episodes.length > 0;
  const currentState =
    record.currentState && typeof record.currentState === "object"
      ? (record.currentState as VdSeriesMemoryCurrentState)
      : foldSeriesMemory(episodes);
  const compactSummary =
    typeof record.compactSummary === "string" ? record.compactSummary : "";
  const lastFoldedEpisode =
    typeof record.lastFoldedEpisode === "number" ? record.lastFoldedEpisode : 0;

  return { compactSummary, currentState, hasMemory, lastFoldedEpisode };
}

/**
 * Loads the bounded lineage context a sequel/special-edition needs from an
 * already-owned parent series row. Never throws on missing/malformed
 * `bible`/`memory` data (every field degrades to a safe default) — the
 * ONLY hard-failure path for lineage is the caller's own ownership check
 * (`loadOwnedSeries`), which happens BEFORE this function is ever called.
 */
export async function loadLineageContext(
  parentRow: VerticalDramaSeriesRow,
  owner: { tenantId: string; userId: number }
): Promise<VerticalDramaLineageContext> {
  const bible = asRecord(parentRow.bible);
  const { compactSummary, currentState, hasMemory, lastFoldedEpisode } =
    readParentMemory(parentRow.memory);

  const characterRows: VerticalDramaCharacterRow[] = await db
    .select()
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, owner.tenantId),
        eq(verticalDramaCharacters.userId, owner.userId),
        eq(verticalDramaCharacters.seriesId, parentRow.id)
      )
    );
  const locationRows: VerticalDramaLocationRow[] = await db
    .select()
    .from(verticalDramaLocations)
    .where(
      and(
        eq(verticalDramaLocations.tenantId, owner.tenantId),
        eq(verticalDramaLocations.userId, owner.userId),
        eq(verticalDramaLocations.seriesId, parentRow.id)
      )
    );

  const roster: VerticalDramaLineageRosterCharacter[] = characterRows.map(
    row => ({
      id: row.id,
      characterKey: row.characterKey,
      name: row.name,
      role: row.role,
      narrativeRole: row.narrativeRole as NarrativeRole | null,
      roleTier: row.roleTier as RoleTier | null,
      occupation: row.occupation,
      data: row.data,
    })
  );

  const locations: VerticalDramaLineageRosterLocation[] = locationRows.map(
    row => ({
      id: row.id,
      locationKey: row.locationKey,
      name: row.name,
      data: row.data,
    })
  );

  return {
    parentSeriesId: parentRow.id,
    parentTitle: parentRow.title,
    parentGenre: parentRow.genre,
    parentTone: parentRow.tone,
    parentEpisodeCount: parentRow.targetEpisodeCount,
    audienceAgeRating: resolveAudienceAgeRating(bible?.audienceAgeRating),
    visualIdentity: {
      visualStyle:
        typeof bible?.visualStyle === "string" ? bible.visualStyle : undefined,
      cameraGrammar:
        typeof bible?.cameraGrammar === "string"
          ? bible.cameraGrammar
          : undefined,
      presetVisualIdentity: bible?.presetVisualIdentity,
    },
    compactSummary,
    currentState,
    hasMemory,
    memoryEpisodesRecorded: lastFoldedEpisode,
    roster,
    locations,
  };
}
