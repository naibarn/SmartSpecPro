/**
 * Vertical Drama Series — repair missing per-shot character reference slots.
 *
 * Root cause (concrete repro: series 16, episode 67): a character who
 * genuinely SPEAKS in a shot (per that shot's resolved dialogue — script
 * fallback, `dialogueAudioPlan`, or a synced motion-pack clip, see
 * `resolveShotDialogueLines` in `verticalDramaEpisodes.ts`) can still be
 * ABSENT from that shot's `requiredCharacterRefs` — the per-shot identity-
 * lock reference slots on `startFramePlan.frames[]` — when the storyboard/
 * start-frame LLM stage that originally populated `requiredCharacterRefs`
 * simply missed them (e.g. a character introduced mid-script, after the
 * roster snapshot the stage consumed). No reference slot -> no identity-lock
 * portrait attached -> the shot's generated image/video never actually
 * depicts that speaker.
 *
 * Two pieces, split so the merge logic is unit-testable without a database
 * or an LLM (same "pure core + DB orchestrator" split this directory already
 * uses for `verticalDramaLocationReconciliation.ts`/
 * `verticalDramaCharacterRosterAutoRegister.ts`):
 *
 * - `computeRepairedStartFramePlan` (pure) — given the current
 *   `startFramePlan` and a synchronous `resolveDialogueKeysForShot` callback
 *   (the caller already resolved every shot's dialogue-speaker roster keys),
 *   returns the plan with the resolved keys UNION-merged into each shot's
 *   `requiredCharacterRefs` (creating a minimal frame when a shot has none
 *   yet — mirrors `setShotCharacterReference`'s create-minimal-frame
 *   convention in `verticalDramaEpisodes.ts`). Never removes an existing
 *   ref/character; a shot whose resolved keys are already fully covered is
 *   left byte-identical (not even a new object reference).
 * - `repairEpisodeShotCharacterReferences` (DB orchestrator) — loads the
 *   episode + this series' character roster, builds the name/key -> roster
 *   `characterKey` lookup and the per-shot dialogue resolver (via the
 *   router's own `resolveShotDialogueLines`, so this reuses the EXACT same
 *   fallback chain — script/`dialogueAudioPlan`/synced-clip/deep-draft — the
 *   per-shot video/start-frame prompt generators already use), calls the
 *   pure core, and persists the updated `startFramePlan` inside a
 *   transaction. Re-reads the freshest `startFramePlan` and recomputes
 *   against it immediately before the write, inside the transaction — same
 *   2026-07-11 lost-update-race-fix shape `generateShotVideoPrompt`/
 *   `generateStartFrameShotPrompt` already use for concurrent per-shot
 *   writes to this same jsonb column.
 *
 * Speaker -> roster `characterKey` resolution order (mirrors, does not
 * import, `verticalDramaStoryboardGeneration.ts`'s `speakerLookup` — that
 * lookup is private to that file and keys off `characterId`/`name`/variant
 * `characterKey`, an LLM-facing shape this router-DB context doesn't have;
 * this orchestrator instead reads the DURABLE `vertical_drama_characters`
 * roster directly, which is the source of truth `requiredCharacterRefs`
 * itself is validated against — see `setShotCharacterReference`):
 *  1. The dialogue line's `characterKey` (`resolveShotDialogueLines`'s
 *     result field, which is loaded with the raw speaker label verbatim —
 *     see that function's own doc comment) matches an existing roster
 *     `characterKey` EXACTLY (trimmed) -> resolves directly, no name lookup
 *     needed.
 *  2. Otherwise, normalize the label via `normalizeStoryCharacterName`
 *     (lowercase + whitespace-collapse — reused from
 *     `verticalDramaCharacterRosterAutoRegister.ts`, itself documented as a
 *     superset of `reconcileCharactersFromStoryBible`'s inline
 *     `.trim().toLocaleLowerCase()`) and look it up against every roster
 *     character's own normalized `name`.
 *  3. Otherwise (added for `planning/vd-character-identity-repair/plan.md`
 *     — the "Series 18 repair" section: a merge absorbs drifted spellings
 *     as `vertical_drama_character_aliases` rows against the KEPT
 *     character's row, e.g. "Kirin"/"คีริน"/"คิริน" -> character 70's
 *     `characterKey`; steps 1-2 above see only the post-merge roster, which
 *     no longer has a row named "Kirin" at all, so without this step every
 *     one of those 474 already-drafted shot/dialogue references across
 *     series 18 would silently fail to resolve here too, same as the
 *     storyboard-generation gap this plan also closes), normalize the same
 *     way and look it up against this series' alias rows
 *     (`normalizedAlias -> characterId`, joined back to that character's
 *     current `characterKey` — the alias table keys on the character's
 *     numeric `id`, NOT `characterKey`, so this step needs its own
 *     id->characterKey map alongside the name map from step 2). Canonical
 *     name (step 2) is checked FIRST and always wins if both would match,
 *     mirroring `verticalDramaStoryboardGeneration.ts`'s "existing key wins
 *     over alias" precedence — an alias only resolves a label that isn't
 *     already a live roster name.
 *  4. No match on any of the above -> the speaker is skipped (never
 *     persisted as a raw/unknown key) — the same "unattributable speaker"
 *     tolerance `resolveShotDialogueLines`'s own script-fallback filter
 *     already applies.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaEpisodes,
  verticalDramaCharacters,
  verticalDramaCharacterAliases,
  verticalDramaSeries,
} from "../../drizzle/schema";
import { normalizeStoryCharacterName } from "./verticalDramaCharacterRosterAutoRegister";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import type {
  VerticalDramaStartFramePlan,
  VerticalDramaShotgrid,
  VerticalDramaMotionPromptPack,
} from "@shared/verticalDramaSeries";
// Type-only import (erased at compile time, no runtime circular-import risk
// — unlike the `resolveShotDialogueLines` VALUE import below, which is
// deliberately lazy/dynamic instead).
import type { VdDeepDraftShotDraft } from "./verticalDramaStoryBible";

/** One shot's repair outcome — the roster `characterKey`s that were newly added to `requiredCharacterRefs`. */
export type VdShotCharacterRepairAddition = {
  shotNumber: number;
  addedKeys: string[];
  /**
   * True when this shot ALREADY had a non-empty `imagePrompt` that was cleared
   * because adding a character shifts the attached reference-image order and
   * invalidates the stored prompt's explicit "Image N = character" mapping
   * (the start-frame image generator fail-closes on that stale mapping — see
   * `findCharacterImageIndexMappingMismatches`). The UI surfaces these shots
   * as "regenerate the prompt". Newly-created frames (which never had a
   * prompt) leave this `false`.
   */
  promptReset?: boolean;
};

/** `VdShotCharacterRepairAddition` plus display NAMES for the addition — orchestrator-only (needs the roster to resolve names), used by the UI toast summary. */
export type VdShotCharacterRepairAdditionWithNames =
  VdShotCharacterRepairAddition & { addedNames: string[] };

/**
 * Pure merge core (no DB/LLM access) — see this file's own doc comment above
 * for the full contract. `resolveDialogueKeysForShot` is called once per shot
 * number in `1..shotCount`; its return value is the FULLY RESOLVED set of
 * roster `characterKey`s this shot's dialogue speakers map to (already
 * deduped/unresolvable-filtered by the caller — this function does no
 * resolution of its own, only merging).
 */
export function computeRepairedStartFramePlan(params: {
  shotCount: number;
  existingPlan: VerticalDramaStartFramePlan | null;
  resolveDialogueKeysForShot: (shotNumber: number) => string[];
}): {
  updatedPlan: VerticalDramaStartFramePlan;
  added: VdShotCharacterRepairAddition[];
} {
  const { shotCount, existingPlan, resolveDialogueKeysForShot } = params;

  const basePlan: VerticalDramaStartFramePlan =
    existingPlan && Array.isArray(existingPlan.frames)
      ? existingPlan
      : { mode: "single_frame_per_shot", selectedImageModelId: "", frames: [] };

  const frames = basePlan.frames.slice();
  const added: VdShotCharacterRepairAddition[] = [];
  let framesChanged = false;

  for (let shotNumber = 1; shotNumber <= shotCount; shotNumber++) {
    const resolvedKeys = resolveDialogueKeysForShot(shotNumber);
    if (resolvedKeys.length === 0) continue;

    const frameIndex = frames.findIndex(f => f.shotNumber === shotNumber);
    const existingRefs =
      frameIndex === -1 ? [] : (frames[frameIndex].requiredCharacterRefs ?? []);
    const existingRefSet = new Set(existingRefs);
    const missingKeys = Array.from(
      new Set(resolvedKeys.filter(k => !existingRefSet.has(k)))
    );
    if (missingKeys.length === 0) continue;

    const mergedRefs = [...existingRefs, ...missingKeys];
    let promptReset = false;
    if (frameIndex === -1) {
      frames.push({
        shotNumber,
        imagePrompt: "",
        negativePrompt: "",
        requiredCharacterRefs: mergedRefs,
        productReferenceAssetIds: [],
      });
    } else {
      // Adding a character shifts the attached reference-image order, so any
      // explicit "Image N = character" mapping baked into the stored prompt is
      // now stale — the start-frame image generator fail-closes on it. Clear
      // the stale prompt (it's re-authorable from the shot's canonical summary)
      // so the shot reads as "needs a fresh prompt" instead of a broken one.
      promptReset = (frames[frameIndex].imagePrompt ?? "").trim().length > 0;
      frames[frameIndex] = {
        ...frames[frameIndex],
        requiredCharacterRefs: mergedRefs,
        ...(promptReset ? { imagePrompt: "", negativePrompt: "" } : {}),
      };
    }
    framesChanged = true;
    added.push({ shotNumber, addedKeys: missingKeys, promptReset });
  }

  if (!framesChanged) {
    return { updatedPlan: basePlan, added: [] };
  }

  frames.sort((a, b) => a.shotNumber - b.shotNumber);
  return { updatedPlan: { ...basePlan, frames }, added };
}

/**
 * Pure speaker-label -> roster `characterKey` resolver (no DB access) — the
 * three-step cascade this file's own doc comment above documents in full
 * (exact `characterKey` -> normalized `name` -> normalized alias -> skip).
 * Extracted as its own exported pure function (added for
 * `planning/vd-character-identity-repair/plan.md`) so the alias-precedence
 * rules are unit-testable without a database, mirroring
 * `computeRepairedStartFramePlan`'s own "pure core, DB orchestrator builds
 * the inputs" split. `repairEpisodeShotCharacterReferences` below is the
 * only production caller — it builds all three lookup maps from the live
 * `vertical_drama_characters` / `vertical_drama_character_aliases` rows and
 * calls this once per resolved dialogue-speaker label.
 */
export function resolveSpeakerLabelToRosterKey(params: {
  rawLabel: string | undefined;
  /** Every roster row's own `characterKey`, verbatim (case-sensitive, untrimmed keys). */
  rosterKeySet: ReadonlySet<string>;
  /** `normalizeStoryCharacterName(row.name) -> row.characterKey`. */
  rosterByNormalizedName: ReadonlyMap<string, string>;
  /**
   * `normalizeStoryCharacterName(alias) -> owning character's characterKey`,
   * pre-filtered by the caller so a normalized string that collides with an
   * entry already in `rosterByNormalizedName` is never present here (see
   * this file's doc comment: canonical name always wins over an alias for
   * the same string). Empty for a series with no alias rows — every
   * pre-existing caller behaves byte-identically.
   */
  characterKeyByNormalizedAlias: ReadonlyMap<string, string>;
}): string | undefined {
  const { rawLabel, rosterKeySet, rosterByNormalizedName, characterKeyByNormalizedAlias } =
    params;
  const label = rawLabel?.trim();
  if (!label) return undefined;
  if (rosterKeySet.has(label)) return label;
  const normalized = normalizeStoryCharacterName(label);
  return (
    rosterByNormalizedName.get(normalized) ??
    characterKeyByNormalizedAlias.get(normalized)
  );
}

/**
 * DB orchestrator — see this file's own doc comment above for the full
 * resolution chain. Throws when the episode isn't found/owned (same
 * NOT_FOUND-worthy condition the router's own `loadOwnedEpisode` guards —
 * the thin router mutation is expected to translate this into a `TRPCError`;
 * the standalone repair script just lets it propagate to the console).
 */
export async function repairEpisodeShotCharacterReferences(owner: {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
}): Promise<{
  added: VdShotCharacterRepairAdditionWithNames[];
  updatedPlan: VerticalDramaStartFramePlan;
}> {
  const { tenantId, userId, seriesId, episodeId } = owner;

  const episodeOwnerFilter = and(
    eq(verticalDramaEpisodes.id, episodeId),
    eq(verticalDramaEpisodes.tenantId, tenantId),
    eq(verticalDramaEpisodes.userId, userId),
    eq(verticalDramaEpisodes.seriesId, seriesId)
  );

  const [episodeRow] = await db
    .select()
    .from(verticalDramaEpisodes)
    .where(episodeOwnerFilter)
    .limit(1);
  if (!episodeRow) {
    throw new Error(
      `Vertical Drama episode ${episodeId} not found for this tenant/user/series`
    );
  }

  const plan = episodeRow.startFramePlan as VerticalDramaStartFramePlan | null;
  const storyboard = episodeRow.storyboard as VerticalDramaShotgrid | null;
  const shotCount = storyboard?.shots?.length || plan?.frames?.length || 0;
  const emptyPlan: VerticalDramaStartFramePlan = {
    mode: "single_frame_per_shot",
    selectedImageModelId: "",
    frames: [],
  };
  if (shotCount === 0) {
    return { added: [], updatedPlan: plan ?? emptyPlan };
  }

  // Roster lookup — exact `characterKey` match first, normalized `name`
  // match second, alias-table match third (see this file's doc comment for
  // the full order). `id` is selected alongside the existing columns solely
  // to join the alias table below (`vertical_drama_character_aliases.characterId`
  // references this row's numeric `id`, NOT its `characterKey`).
  const rosterRows = await db
    .select({
      id: verticalDramaCharacters.id,
      characterKey: verticalDramaCharacters.characterKey,
      name: verticalDramaCharacters.name,
    })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.seriesId, seriesId)
      )
    );
  const rosterKeySet = new Set<string>();
  const rosterByNormalizedName = new Map<string, string>();
  const characterKeyById = new Map<number, string>();
  const nameByKey = new Map<string, string>();
  const knownSpeakerKeys = new Set<string>();
  for (const r of rosterRows) {
    rosterKeySet.add(r.characterKey);
    rosterByNormalizedName.set(normalizeStoryCharacterName(r.name), r.characterKey);
    characterKeyById.set(r.id, r.characterKey);
    nameByKey.set(r.characterKey, r.name);
    knownSpeakerKeys.add(r.characterKey.trim());
    knownSpeakerKeys.add(r.name.trim());
  }

  // Alias-table lookup (step 3, see this file's doc comment above) — this
  // series' `vertical_drama_character_aliases` rows, joined back to the
  // current roster's `characterKey` via `characterKeyById`. A merge can
  // record an alias for a character that this repair's owner scope doesn't
  // otherwise see as stale (e.g. the merge ran under a different
  // tenant/user context than expected), so an alias whose `characterId`
  // isn't in `characterKeyById` is silently dropped here rather than
  // resolved to nothing — same "tolerate the miss" posture as every other
  // lookup in this function.
  const aliasRows = await db
    .select({
      characterId: verticalDramaCharacterAliases.characterId,
      normalizedAlias: verticalDramaCharacterAliases.normalizedAlias,
    })
    .from(verticalDramaCharacterAliases)
    .where(
      and(
        eq(verticalDramaCharacterAliases.tenantId, tenantId),
        eq(verticalDramaCharacterAliases.seriesId, seriesId)
      )
    );
  const characterKeyByNormalizedAlias = new Map<string, string>();
  for (const a of aliasRows) {
    const characterKey = characterKeyById.get(a.characterId);
    if (!characterKey) continue;
    // Canonical name (step 2) always wins over an alias for the SAME
    // normalized string — see doc comment. The DB's own
    // `UNIQUE(seriesId, normalizedAlias)` already prevents two DIFFERENT
    // characters from claiming the same alias, so this guard only ever
    // matters for the name-vs-alias precedence, never alias-vs-alias.
    if (rosterByNormalizedName.has(a.normalizedAlias)) continue;
    characterKeyByNormalizedAlias.set(a.normalizedAlias, characterKey);
  }

  const resolveSpeakerLabelToCharacterKey = (rawLabel: string | undefined) =>
    resolveSpeakerLabelToRosterKey({
      rawLabel,
      rosterKeySet,
      rosterByNormalizedName,
      characterKeyByNormalizedAlias,
    });

  // Deep-drafted canonical dialogue (planning/`polished-toasting-gadget.md`)
  // — same optional source `resolveShotDialogueLines`'s call sites in
  // `verticalDramaEpisodes.ts` resolve BEFORE calling it (source 0 in that
  // function's own fallback chain). Gated on the same tenant flag; skipped
  // entirely (empty map) when off, matching every other caller's tolerant
  // "undefined preserves the pre-existing chain" behavior.
  const shotDraftsByShotNumber = new Map<number, VdDeepDraftShotDraft>();
  const flags = await getTenantFeatureFlags(tenantId);
  if (flags?.verticalDramaSeriesDeepStoryDrafts === true) {
    const [seriesRow] = await db
      .select({ bible: verticalDramaSeries.bible })
      .from(verticalDramaSeries)
      .where(
        and(
          eq(verticalDramaSeries.id, seriesId),
          eq(verticalDramaSeries.tenantId, tenantId),
          eq(verticalDramaSeries.userId, userId)
        )
      )
      .limit(1);
    const { getActiveBreakdown, readItemShotDrafts } = await import(
      "./verticalDramaStoryBible"
    );
    const planItem = getActiveBreakdown(
      (seriesRow?.bible as Record<string, unknown> | null) ?? null
    ).find(item => item.episodeNumber === Number(episodeRow.episodeNumber));
    if (planItem) {
      for (const draft of readItemShotDrafts(planItem) ?? []) {
        shotDraftsByShotNumber.set(draft.shot_number, draft);
      }
    }
  }

  // Lazy import (not a static top-level import) — this router file is huge
  // and has module-load-time side effects in sibling imports; every other
  // cross-cutting service call in this codebase that needs one specific
  // export from it already does the same `await import(...)` inside the
  // function body rather than a static import, to avoid a router <-> service
  // circular static-import edge (this service is itself imported BY that
  // router file for the `repairEpisodeShotCharacterReferences` mutation).
  const { resolveShotDialogueLines } = await import(
    "../routers/verticalDramaEpisodes"
  );

  const motionPromptPack =
    episodeRow.motionPromptPack as VerticalDramaMotionPromptPack | null;

  const resolveDialogueKeysForShot = (shotNumber: number): string[] => {
    const matchingClip = motionPromptPack?.clips?.find(c =>
      c.sourceShotNumbers?.includes(shotNumber)
    );
    const lines = resolveShotDialogueLines({
      shotNumber,
      matchingClip,
      dialogueAudioPlan: episodeRow.dialogueAudioPlan as {
        dialogue_lines?: Array<Record<string, unknown>>;
      } | null,
      script: episodeRow.script as Record<string, unknown> | null,
      storyboardShotCount: storyboard?.shots?.length,
      knownSpeakerKeys,
      deepDraftShot: shotDraftsByShotNumber.get(shotNumber) ?? null,
    });
    const resolved = new Set<string>();
    for (const line of lines) {
      const characterKey = resolveSpeakerLabelToCharacterKey(line.characterKey);
      if (characterKey) resolved.add(characterKey);
    }
    return Array.from(resolved);
  };

  // First pass (outside the transaction) — cheap, used only to short-circuit
  // "nothing to repair" without ever opening a transaction/row lock.
  const { added: previewAdded } = computeRepairedStartFramePlan({
    shotCount,
    existingPlan: plan,
    resolveDialogueKeysForShot,
  });
  if (previewAdded.length === 0) {
    return { added: [], updatedPlan: plan ?? emptyPlan };
  }

  // Persist inside a transaction, re-reading + recomputing against the
  // FRESHEST `startFramePlan` immediately before the write — same
  // 2026-07-11 lost-update-race-fix shape `generateShotVideoPrompt`/
  // `generateStartFrameShotPrompt` already use for concurrent per-shot
  // writes to this same jsonb column (`verticalDramaEpisodes.ts`).
  let finalAdded: VdShotCharacterRepairAddition[] = [];
  let finalPlan: VerticalDramaStartFramePlan = plan ?? emptyPlan;
  await db.transaction(async tx => {
    const [freshRow] = await tx
      .select({ startFramePlan: verticalDramaEpisodes.startFramePlan })
      .from(verticalDramaEpisodes)
      .where(episodeOwnerFilter)
      .for("update")
      .limit(1);
    const freshPlan =
      (freshRow?.startFramePlan as VerticalDramaStartFramePlan | null) ?? plan;

    const { updatedPlan, added } = computeRepairedStartFramePlan({
      shotCount,
      existingPlan: freshPlan,
      resolveDialogueKeysForShot,
    });
    finalAdded = added;
    finalPlan = updatedPlan;
    if (added.length === 0) return;

    await tx
      .update(verticalDramaEpisodes)
      .set({ startFramePlan: updatedPlan, updatedAt: new Date() })
      .where(episodeOwnerFilter);
  });

  const addedWithNames: VdShotCharacterRepairAdditionWithNames[] = finalAdded.map(
    a => ({
      ...a,
      addedNames: a.addedKeys.map(k => nameByKey.get(k) ?? k),
    })
  );

  return { added: addedWithNames, updatedPlan: finalPlan };
}
