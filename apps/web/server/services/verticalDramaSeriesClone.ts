/**
 * Vertical Drama Series — Cast/Location Clone-on-Create (Stage 2.3,
 * `planning/vd-series-memory-and-lineage/plan.md`).
 *
 * Copies a parent series' durable character/location roster (and their
 * approved portrait/plate assets) into a freshly-inserted sequel/special
 * -edition series row, so the new season opens with an already-approved
 * cast — zero regeneration, zero credits spent on portraits that already
 * exist.
 *
 * Ownership convention (same as `verticalDramaSeriesLineage.ts`'s own doc
 * comment): this file NEVER imports the router and NEVER re-checks
 * ownership of the parent series itself — the caller
 * (`server/routers/verticalDramaSeries.ts`'s `create`) MUST have already
 * hard-thrown via `loadOwnedSeries(parentSeriesId)` before calling this
 * function. A cross-tenant/cross-user parent silently yielding an empty
 * clone is a data-leak-shaped bug this module refuses to paper over by
 * re-deriving its own (possibly divergent) ownership check.
 *
 * Table-by-table clone decision (verified against the real schema, plan
 * Stage 2.3):
 *  - `vertical_drama_characters`               COPY  — `characterKey` preserved verbatim.
 *  - `vertical_drama_character_aliases`         COPY  — `(seriesId, normalizedAlias)` unique, clones cleanly.
 *  - `vertical_drama_character_assets`          COPY  — shares the SAME `mediaAssetId`, no file copy.
 *  - `vertical_drama_locations`                 COPY  — `locationKey` preserved verbatim.
 *  - `vertical_drama_location_assets`           COPY  — shares the SAME `mediaAssetId`.
 *  - `vertical_drama_shot_references`           SKIP  — scoped to the OLD season's `episodeId`+`shotNumber`.
 *  - `productTieIn`                             SKIP  — `marketplaceCaptureId` is a bare string, not an FK; copying it dangles (`verticalDramaProductTieIn.ts`).
 *  - `memory`                                   SKIP  — that is season 1's state; `lineage.priorSeasonSummary` keeps a snapshot instead.
 *  - episodes / runs                            SKIP  — the new season authors its own.
 *
 * The whole clone runs inside ONE `db.transaction` so a mid-clone failure
 * (e.g. a DB error on the 40th character) never leaves a half-cloned cast
 * behind for the caller's best-effort `try/catch` to silently accept —
 * either every table below is copied consistently, or none of it is.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaCharacters,
  verticalDramaCharacterAliases,
  verticalDramaCharacterAssets,
  verticalDramaLocations,
  verticalDramaLocationAssets,
  type VerticalDramaCharacterRow,
  type VerticalDramaLocationRow,
} from "../../drizzle/schema";
import type {
  VerticalDramaCarryOverCharacterDecision,
  VerticalDramaSeriesLineage,
} from "@shared/verticalDramaSeries/lineage";

export interface CloneSeriesCastForLineageParams {
  tenantId: string;
  userId: number;
  parentSeriesId: number;
  childSeriesId: number;
  /**
   * The child row's approved `lineage` payload, if any. Only
   * `lineage.carryOver.characters[]` is consulted (for `availability`/
   * `suggestedStateUpdate` per parent character) — every other `lineage`
   * field is out of this function's concern. `undefined` (e.g. a
   * special-edition series with no carry-over planning step) is treated as
   * "carry every parent character forward unchanged, none written out".
   */
  lineage?: VerticalDramaSeriesLineage;
}

export interface CloneSeriesCastForLineageSummary {
  charactersCloned: number;
  charactersWrittenOut: number;
  aliasesCloned: number;
  characterAssetsCloned: number;
  locationsCloned: number;
  locationAssetsCloned: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Merges a carry-over decision's `postFinaleStatus`/`suggestedStateUpdate`
 * into the parent character's `data.currentState`, additively (every other
 * `currentState` key — `relationshipNotes`/`storyKnowledge`/
 * `injuryOrWardrobeContinuity`, `VerticalDramaCharacter.currentState`'s own
 * shape — is preserved untouched). No decision -> the parent's
 * `currentState` carries forward byte-identical.
 */
export function mergeCarryOverCurrentState(
  parentCurrentState: unknown,
  decision: VerticalDramaCarryOverCharacterDecision | undefined
): Record<string, unknown> {
  const base = { ...(asRecord(parentCurrentState) ?? {}) };
  if (!decision) return base;

  const emotionalStateParts = [
    decision.postFinaleStatus,
    decision.suggestedStateUpdate,
  ].filter(
    (part): part is string =>
      typeof part === "string" && part.trim().length > 0
  );
  if (emotionalStateParts.length > 0) {
    base.emotionalState = emotionalStateParts.join(" — ");
  }
  return base;
}

/** Pure decision lookup — a character absent from the carry-over draft (or no draft at all) defaults to `"returns"` (carried forward unchanged), never silently dropped. */
export function resolveCarryOverAvailability(
  decision: VerticalDramaCarryOverCharacterDecision | undefined
): VerticalDramaCarryOverCharacterDecision["availability"] {
  return decision?.availability ?? "returns";
}

/**
 * Clones a parent series' character roster (+ aliases + portrait assets)
 * and location roster (+ plate assets) into an already-inserted child
 * series row. Never throws for "nothing to clone" (an empty parent roster
 * clones zero rows, not an error) — the CALLER's `try/catch` around this
 * call is what makes the overall operation best-effort, per this module's
 * own header doc comment; a genuine DB error still propagates from here.
 */
export async function cloneSeriesCastForLineage(
  params: CloneSeriesCastForLineageParams
): Promise<CloneSeriesCastForLineageSummary> {
  const { tenantId, userId, parentSeriesId, childSeriesId } = params;
  const decisionByCharacterKey = new Map(
    (params.lineage?.carryOver?.characters ?? []).map(decision => [
      decision.characterKey,
      decision,
    ])
  );

  return db.transaction(async tx => {
    /* ---------------------------------------------------------------- */
    /* Characters — pass 1: insert, preserving characterKey verbatim.    */
    /* ---------------------------------------------------------------- */
    const parentCharacterRows = (await tx
      .select()
      .from(verticalDramaCharacters)
      .where(
        and(
          eq(verticalDramaCharacters.tenantId, tenantId),
          eq(verticalDramaCharacters.userId, userId),
          eq(verticalDramaCharacters.seriesId, parentSeriesId)
        )
      )) as VerticalDramaCharacterRow[];

    const oldToNewCharacterId = new Map<number, number>();
    let charactersWrittenOut = 0;

    for (const parentRow of parentCharacterRows) {
      const decision = decisionByCharacterKey.get(parentRow.characterKey);
      const availability = resolveCarryOverAvailability(decision);
      if (availability === "write_out") {
        charactersWrittenOut += 1;
        continue;
      }

      const parentData = asRecord(parentRow.data) ?? {};
      const nextData: Record<string, unknown> = {
        ...parentData,
        currentState: mergeCarryOverCurrentState(
          parentData.currentState,
          decision
        ),
        lineage: {
          parentSeriesId,
          parentCharacterId: parentRow.id,
          carriedOver: true,
          ...(decision?.availability
            ? { availability: decision.availability }
            : {}),
          ...(decision?.postFinaleStatus
            ? { postFinaleStatus: decision.postFinaleStatus }
            : {}),
          ...(decision?.suggestedStateUpdate
            ? { suggestedStateUpdate: decision.suggestedStateUpdate }
            : {}),
        },
      };

      const [insertedRow] = await tx
        .insert(verticalDramaCharacters)
        .values({
          tenantId,
          userId,
          seriesId: childSeriesId,
          characterKey: parentRow.characterKey,
          name: parentRow.name,
          role: parentRow.role,
          narrativeRole: parentRow.narrativeRole,
          roleTier: parentRow.roleTier,
          occupation: parentRow.occupation,
          roleVisualIntent: parentRow.roleVisualIntent,
          roleProvenance: parentRow.roleProvenance,
          roleReviewStatus: parentRow.roleReviewStatus,
          data: nextData,
          voiceConfig: parentRow.voiceConfig,
          // Pass 2 (below) remaps these self-FKs from parent-series row ids
          // to the newly-inserted child rows' ids — never left dangling.
          parentCharacterId: null,
          variantLabel: parentRow.variantLabel,
          variantType: parentRow.variantType,
          sharesFaceWithCharacterId: null,
        })
        .returning({ id: verticalDramaCharacters.id });

      if (insertedRow) {
        oldToNewCharacterId.set(parentRow.id, insertedRow.id);
      }
    }

    /* ---------------------------------------------------------------- */
    /* Characters — pass 2: remap self-FKs (parentCharacterId /           */
    /* sharesFaceWithCharacterId) — these point at PARENT-series row ids  */
    /* on the just-inserted rows and would otherwise dangle cross-series. */
    /* A referent that was written out (absent from the map) resolves to  */
    /* null rather than a broken reference.                               */
    /* ---------------------------------------------------------------- */
    for (const parentRow of parentCharacterRows) {
      const newId = oldToNewCharacterId.get(parentRow.id);
      if (newId === undefined) continue; // this character itself was written out
      const hasParentLink = parentRow.parentCharacterId != null;
      const hasSharesFaceLink = parentRow.sharesFaceWithCharacterId != null;
      if (!hasParentLink && !hasSharesFaceLink) continue;

      const remappedParentCharacterId = hasParentLink
        ? oldToNewCharacterId.get(parentRow.parentCharacterId as number) ?? null
        : null;
      const remappedSharesFaceWithCharacterId = hasSharesFaceLink
        ? oldToNewCharacterId.get(
            parentRow.sharesFaceWithCharacterId as number
          ) ?? null
        : null;

      await tx
        .update(verticalDramaCharacters)
        .set({
          parentCharacterId: remappedParentCharacterId,
          sharesFaceWithCharacterId: remappedSharesFaceWithCharacterId,
        })
        .where(eq(verticalDramaCharacters.id, newId));
    }

    /* ---------------------------------------------------------------- */
    /* Character aliases — clone intact; without these the sequel's       */
    /* character-bible prompt rejects any nickname the parent established.*/
    /* ---------------------------------------------------------------- */
    let aliasesCloned = 0;
    if (oldToNewCharacterId.size > 0) {
      const parentAliasRows = await tx
        .select()
        .from(verticalDramaCharacterAliases)
        .where(
          and(
            eq(verticalDramaCharacterAliases.tenantId, tenantId),
            eq(verticalDramaCharacterAliases.seriesId, parentSeriesId),
            inArray(
              verticalDramaCharacterAliases.characterId,
              [...oldToNewCharacterId.keys()]
            )
          )
        );

      const aliasRowsToInsert = parentAliasRows
        .map(row => {
          const newCharacterId = oldToNewCharacterId.get(row.characterId);
          if (newCharacterId === undefined) return null;
          return {
            tenantId,
            seriesId: childSeriesId,
            characterId: newCharacterId,
            alias: row.alias,
            normalizedAlias: row.normalizedAlias,
            source: row.source,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (aliasRowsToInsert.length > 0) {
        await tx.insert(verticalDramaCharacterAliases).values(aliasRowsToInsert);
        aliasesCloned = aliasRowsToInsert.length;
      }
    }

    /* ---------------------------------------------------------------- */
    /* Character portrait assets — share the SAME mediaAssetId (no file   */
    /* copy, no regeneration, no credits); already-approved rows arrive    */
    /* pre-approved in the new season.                                    */
    /* ---------------------------------------------------------------- */
    let characterAssetsCloned = 0;
    if (oldToNewCharacterId.size > 0) {
      const parentAssetRows = await tx
        .select()
        .from(verticalDramaCharacterAssets)
        .where(
          and(
            eq(verticalDramaCharacterAssets.tenantId, tenantId),
            eq(verticalDramaCharacterAssets.userId, userId),
            eq(verticalDramaCharacterAssets.seriesId, parentSeriesId)
          )
        );

      const assetRowsToInsert = parentAssetRows
        .map(row => {
          if (row.characterId == null) return null;
          const newCharacterId = oldToNewCharacterId.get(row.characterId);
          if (newCharacterId === undefined) return null;
          return {
            tenantId,
            userId,
            seriesId: childSeriesId,
            characterId: newCharacterId,
            mediaAssetId: row.mediaAssetId,
            assetType: row.assetType,
            role: row.role,
            approved: row.approved,
            containsHumanFace: row.containsHumanFace,
            qcStatus: row.qcStatus,
            checksumSha256: row.checksumSha256,
            metadata: row.metadata,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (assetRowsToInsert.length > 0) {
        await tx.insert(verticalDramaCharacterAssets).values(assetRowsToInsert);
        characterAssetsCloned = assetRowsToInsert.length;
      }
    }

    /* ---------------------------------------------------------------- */
    /* Locations — locationKey preserved verbatim, same pattern as        */
    /* characters. No carry-over decision axis for locations (spec: the   */
    /* whole point of "same universe" is that the places don't change).   */
    /* ---------------------------------------------------------------- */
    const parentLocationRows = (await tx
      .select()
      .from(verticalDramaLocations)
      .where(
        and(
          eq(verticalDramaLocations.tenantId, tenantId),
          eq(verticalDramaLocations.userId, userId),
          eq(verticalDramaLocations.seriesId, parentSeriesId)
        )
      )) as VerticalDramaLocationRow[];

    const oldToNewLocationId = new Map<number, number>();
    for (const parentRow of parentLocationRows) {
      const [insertedRow] = await tx
        .insert(verticalDramaLocations)
        .values({
          tenantId,
          userId,
          seriesId: childSeriesId,
          locationKey: parentRow.locationKey,
          name: parentRow.name,
          data: parentRow.data,
        })
        .returning({ id: verticalDramaLocations.id });
      if (insertedRow) {
        oldToNewLocationId.set(parentRow.id, insertedRow.id);
      }
    }

    let locationAssetsCloned = 0;
    if (oldToNewLocationId.size > 0) {
      const parentLocationAssetRows = await tx
        .select()
        .from(verticalDramaLocationAssets)
        .where(
          and(
            eq(verticalDramaLocationAssets.tenantId, tenantId),
            eq(verticalDramaLocationAssets.userId, userId),
            eq(verticalDramaLocationAssets.seriesId, parentSeriesId)
          )
        );

      const locationAssetRowsToInsert = parentLocationAssetRows
        .map(row => {
          if (row.locationId == null) return null;
          const newLocationId = oldToNewLocationId.get(row.locationId);
          if (newLocationId === undefined) return null;
          return {
            tenantId,
            userId,
            seriesId: childSeriesId,
            locationId: newLocationId,
            mediaAssetId: row.mediaAssetId,
            assetType: row.assetType,
            role: row.role,
            approved: row.approved,
            qcStatus: row.qcStatus,
            checksumSha256: row.checksumSha256,
            metadata: row.metadata,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (locationAssetRowsToInsert.length > 0) {
        await tx
          .insert(verticalDramaLocationAssets)
          .values(locationAssetRowsToInsert);
        locationAssetsCloned = locationAssetRowsToInsert.length;
      }
    }

    return {
      charactersCloned: oldToNewCharacterId.size,
      charactersWrittenOut,
      aliasesCloned,
      characterAssetsCloned,
      locationsCloned: oldToNewLocationId.size,
      locationAssetsCloned,
    };
  });
}
