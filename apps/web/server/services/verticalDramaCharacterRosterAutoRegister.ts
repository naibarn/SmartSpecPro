/**
 * Vertical Drama Series — auto-register story-introduced characters into the
 * durable `vertical_drama_characters` roster
 * (`planning/vd-auto-register-story-characters/plan.md`).
 *
 * Root cause (see the plan's own "Root cause" section, verified read-only):
 * the roster is only ever written by the wizard's `seedCharactersFromDraft`
 * (`verticalDramaSeries.ts`), manual UI creation, and variant/twin inserts.
 * `reconcileCharactersFromStoryBible` (`verticalDramaSeries.ts`, same file)
 * is UPDATE-only — it looks a `refinedCharacters` entry up by normalized
 * name and `continue`s when there's no match, it never INSERTs. A character
 * introduced organically by the deep-draft LLM (a `dialogue_lines[].speaker`
 * or a `shotDrafts[].characters[]` name) that was never in the wizard's
 * initial `charactersDraft` therefore never gets a roster row -> no DNA/
 * portrait -> no per-shot reference slot -> silently dropped from
 * `requiredCharacterRefs` at every downstream step, all of which correctly
 * filter through the roster (e.g. this file's sibling
 * `verticalDramaStoryboardGeneration.ts`'s `speakerLookup` reconcile, which
 * is match-only by design and relies on the roster already containing the
 * name).
 *
 * This module is the INSERT-capable counterpart, mirroring this directory's
 * own `verticalDramaLocationReconciliation.ts` shape (`reconcileEpisodeLocations`/
 * `persistDeepDraftDeclaredLocations`): load the roster once, dedup by
 * normalized name, insert what's missing, never update/overwrite an
 * existing row. Two pieces, deliberately separated so the selection/junk-
 * guard logic is unit-testable without a database:
 *
 * - `selectStoryIntroducedCharacterNames` (pure) — given the deep-draft
 *   shots for a run (plus any synthetic "always qualifies" shot entries the
 *   caller wants to fold in, e.g. Story Bible `refinedCharacters` — see
 *   `ensureRosterCharactersFromStory`'s own doc comment) and the roster's
 *   current names, returns the canonical display names that qualify to be
 *   newly inserted.
 * - `ensureRosterCharactersFromStory` (DB) — loads the roster, calls the
 *   pure selector, and INSERTs a row per qualifying name inside a single
 *   `db.transaction` (Database Safety Protocol: this table's data has
 *   already been backed up before this feature's first run per the root
 *   CLAUDE.md protocol; this function itself only ever INSERTs, never
 *   UPDATEs/DELETEs any existing row).
 */

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaCharacters,
  verticalDramaCharacterAliases,
  type VerticalDramaCharacterRow,
  type VerticalDramaCharacterAliasRow,
} from "../../drizzle/schema";
import { debugLog } from "../_core/logger";
import type {
  NarrativeRole,
  RoleTier,
} from "@shared/verticalDramaSeries/narrativeRole";

/** Matches `verticalDramaCharacters.characterKey`'s `varchar(64)` column limit. */
const CHARACTER_KEY_MAX_LENGTH = 64;

/**
 * A one-off lone speaker label is treated as likely junk (a single
 * mis-attributed line, an ad-hoc stage-direction speaker, etc.) — a name
 * must either appear in some shot's `characters[]` (the model explicitly
 * cast this person into the shot) OR speak at least this many dialogue
 * lines across the provided shots before it qualifies for auto-creation.
 */
const MIN_QUALIFYING_SPEAKER_LINE_COUNT = 2;

/**
 * Junk/non-name speaker & character-name tokens (normalized, see
 * `normalizeStoryCharacterName`) that must never mint a roster row, even if
 * they otherwise pass the frequency gate above. Deliberately a small,
 * explicit list rather than an attempt at exhaustive NLP name detection —
 * this is a guardrail against the specific known failure modes (narrator/
 * off-screen/group labels), not a general name validator. No existing
 * shared constant in this codebase covers *character-name* junk tokens
 * (`VERTICAL_DRAMA_SILENCE_INTENTS` in `contentBudget.ts` is a shot-level
 * `silence_intent` enum, a different concept entirely — a shot with no
 * dialogue at all — so it is not reusable here); the dialogue-TEXT sound-
 * marker regex convention (`SCRIPT_DIALOGUE_SOUND_SPEAKER_PATTERN` in
 * `verticalDramaEpisodes.ts`) is mirrored below as
 * `SOUND_CUE_SPEAKER_PATTERN` instead of imported, since that constant is
 * private (non-exported) to that file and that file is out of scope for
 * this change (see this feature's own plan) — same "small local duplicate
 * per file" convention this codebase already uses for
 * `slugifyForCharacterKey`/`slugifyForLocationKey`.
 */
const JUNK_CHARACTER_NAME_DENYLIST = new Set([
  "unknown",
  "voice",
  "narrator",
  "vo",
  "v.o.",
  "off-screen",
  "offscreen",
  "n/a",
  "none",
  "(none)",
  "someone",
  "everyone",
  "all",
  "ทุกคน",
  "เสียง",
  "คนอื่น",
  "ไม่ทราบ",
  "ผู้บรรยาย",
]);

/** Local duplicate of `verticalDramaEpisodes.ts`'s private `SCRIPT_DIALOGUE_SOUND_SPEAKER_PATTERN` — see this file's doc comment above for why it's duplicated rather than imported. */
const SOUND_CUE_SPEAKER_PATTERN = /^(?:เสียง|sfx\b|sound effect\b|\(sfx\))/i;

/**
 * Normalizes a character/speaker name for dedup comparisons: case-fold +
 * collapse internal whitespace runs to a single space + trim. Same "exact
 * normalized match only, no fuzzy matching" convention as this directory's
 * `verticalDramaLocationReconciliation.ts`'s own `normalizeLocationName`,
 * and a superset of `verticalDramaSeries.ts`'s
 * `reconcileCharactersFromStoryBible`'s inline `.trim().toLocaleLowerCase()`
 * (this adds whitespace-collapse on top, so e.g. "มินตรา " / "มินตรา" /
 * "มิน ตรา" spacing drift can't mint a duplicate roster row either — see the
 * plan's dedup requirement).
 */
export function normalizeStoryCharacterName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function isJunkCharacterName(normalized: string): boolean {
  if (!normalized || normalized.length < 2) return true;
  if (JUNK_CHARACTER_NAME_DENYLIST.has(normalized)) return true;
  if (SOUND_CUE_SPEAKER_PATTERN.test(normalized)) return true;
  return false;
}

export interface VdRosterAutoRegisterShotCharacter {
  name: string;
}

export interface VdRosterAutoRegisterDialogueLine {
  speaker: string;
}

/**
 * A Story Bible `refinedCharacters` entry (`readBibleRefinedCharacterProfiles`,
 * `verticalDramaStoryBible.ts`), as handed to `ensureRosterCharactersFromStory`.
 * Role fields are optional/tolerant-read, same as the source schema — a
 * legacy or malformed bible entry degrades to name-only, same as before this
 * type existed.
 *
 * Added `planning/vd-character-identity-repair/plan.md` Phase 1 — this is
 * the fix for the "our code discards the role data it's handed" bug: before
 * this type existed, both call sites in `verticalDramaSeries.ts` passed
 * `refinedCharacters: characterBibleNames.map(name => ({ name }))`, throwing
 * away every field except `name` before it ever reached this module, so the
 * hardcoded-null INSERT below was actually the SECOND place the data was
 * discarded, not the first.
 */
export interface VdRosterAutoRegisterRefinedCharacter {
  name: string;
  role?: string;
  narrativeRole?: NarrativeRole;
  roleTier?: RoleTier;
  occupation?: string;
  /**
   * Other forms this SAME person is called, as declared by the Story Bible
   * (`planning/vd-character-identity-repair/plan.md` Phase 2.1) — e.g.
   * `{name: "คิริน วัฒนเมธา", aliases: ["คิริน"]}`. Optional: every bible
   * persisted before Phase 2.1 (including series 18's live one) has no
   * `aliases` key at all, and must keep working unchanged.
   *
   * Load-bearing, not decorative: the deep-draft prompt's CHARACTER BIBLE
   * block now tells the model it may write EITHER the canonical name OR any
   * declared alias, and the completeness gate accepts both. Without this
   * field threaded into the dedup below, the model doing exactly what we
   * ask — writing "คิริน" — would not match the roster's
   * "คิริน วัฒนเมธา" and would mint a DUPLICATE row. That is the very bug
   * aliases exist to fix, so an alias MUST never be a create-trigger.
   */
  aliases?: string[];
}

/**
 * Minimal shape this module needs from a deep-draft shot — a structural
 * subset of `VdDeepDraftShotDraft` (`verticalDramaStoryBible.ts`), kept
 * local so this module doesn't need to import that service's much larger
 * type just for two fields.
 */
export interface VdRosterAutoRegisterShot {
  characters?: ReadonlyArray<VdRosterAutoRegisterShotCharacter>;
  dialogue_lines?: ReadonlyArray<VdRosterAutoRegisterDialogueLine>;
}

/**
 * Pure candidate-selection + junk-guard (no DB access — unit-tested
 * directly, see `__tests__/verticalDramaCharacterRosterAutoRegister.test.ts`).
 *
 * A name qualifies to be returned when ALL of:
 * - normalized name is non-empty, length >= 2, and not a junk/non-name
 *   token (`isJunkCharacterName`);
 * - AND it is NOT already in `existingRosterNames` (normalized-name dedup,
 *   so casing/spacing variants of an already-registered character never
 *   produce a duplicate);
 * - AND (it appears in some shot's `characters[]`, OR it is the `speaker`
 *   of at least `MIN_QUALIFYING_SPEAKER_LINE_COUNT` dialogue lines across
 *   `shots`) — a lone one-off speaker label is skipped as likely junk.
 *
 * Returns canonical (first-seen, trimmed, un-normalized) display names, in
 * first-seen order, deduped by normalized name.
 */
export function selectStoryIntroducedCharacterNames(params: {
  shots: ReadonlyArray<VdRosterAutoRegisterShot>;
  existingRosterNames: ReadonlyArray<string>;
  /**
   * Names that are already CLAIMED by an existing (or being-created-this-run)
   * character without being that character's `name` — i.e. known aliases
   * (`planning/vd-character-identity-repair/plan.md` Phase 2.3/2.4):
   * `vertical_drama_character_aliases` rows for the series, plus every
   * `aliases[]` the Story Bible declares.
   *
   * Additive and optional so every caller that predates it (and all of this
   * function's existing tests) keeps its byte-identical behavior. Deliberately
   * a SEPARATE param from `existingRosterNames` rather than folding both into
   * one list at the call site: an alias is not a roster name, and conflating
   * them in the signature is exactly the kind of quiet lie that produced this
   * bug in the first place.
   *
   * Matching stays EXACT-normalized — no fuzzy/edit-distance. Romanization
   * drift ("Kirin" vs "คิริน") shares zero characters and is deliberately NOT
   * resolvable here; that is the merge tool's LLM-judged job
   * (`verticalDramaCharacterMerge.ts`). A similarity heuristic here would
   * silently fuse genuinely distinct characters, which is worse than the
   * duplicate it would prevent.
   */
  existingAliasNames?: ReadonlyArray<string>;
}): string[] {
  const existingNormalizedNames = new Set([
    ...params.existingRosterNames.map(normalizeStoryCharacterName),
    ...(params.existingAliasNames ?? []).map(normalizeStoryCharacterName),
  ]);

  // First-seen canonical (un-normalized) display name, keyed by normalized
  // name, across BOTH `characters[]` entries and dialogue `speaker`s.
  const canonicalNameByNormalized = new Map<string, string>();
  const normalizedNamesInShotCharacters = new Set<string>();
  const speakerLineCountByNormalized = new Map<string, number>();

  for (const shot of params.shots) {
    for (const character of shot.characters ?? []) {
      const raw = (character?.name ?? "").trim();
      if (!raw) continue;
      const normalized = normalizeStoryCharacterName(raw);
      if (isJunkCharacterName(normalized)) continue;
      if (!canonicalNameByNormalized.has(normalized)) {
        canonicalNameByNormalized.set(normalized, raw);
      }
      normalizedNamesInShotCharacters.add(normalized);
    }
    for (const line of shot.dialogue_lines ?? []) {
      const raw = (line?.speaker ?? "").trim();
      if (!raw) continue;
      const normalized = normalizeStoryCharacterName(raw);
      if (isJunkCharacterName(normalized)) continue;
      if (!canonicalNameByNormalized.has(normalized)) {
        canonicalNameByNormalized.set(normalized, raw);
      }
      speakerLineCountByNormalized.set(
        normalized,
        (speakerLineCountByNormalized.get(normalized) ?? 0) + 1
      );
    }
  }

  const selected: string[] = [];
  for (const [normalized, canonicalName] of canonicalNameByNormalized) {
    if (existingNormalizedNames.has(normalized)) continue;
    const qualifiesByShotCharacter =
      normalizedNamesInShotCharacters.has(normalized);
    const qualifiesByRepeatedSpeaker =
      (speakerLineCountByNormalized.get(normalized) ?? 0) >=
      MIN_QUALIFYING_SPEAKER_LINE_COUNT;
    if (qualifiesByShotCharacter || qualifiesByRepeatedSpeaker) {
      selected.push(canonicalName);
    }
  }
  return selected;
}

/**
 * Slugify a character name into a `characterKey` candidate.
 *
 * Historically this was BYTE-IDENTICAL to `verticalDramaSeries.ts`'s own
 * `slugifyCharacterName` / `verticalDramaCharacters.ts`'s
 * `slugifyForCharacterKey` (the "small local slugify per file" convention —
 * see `verticalDramaLocationReconciliation.ts`'s own doc comment on
 * `slugifyForLocationKey` for the precedent). **As of
 * `planning/vd-character-identity-repair/plan.md` Phase 1, THAT CLAIM IS NO
 * LONGER TRUE for this copy** — this function now deliberately diverges from
 * its two siblings (which still do the old, buggy thing; they're out of
 * scope for Phase 1, see the plan's file list):
 *
 * The old shared behavior — `.replace(/[^a-z0-9]+/g, "-")` then
 * `|| "character"` — collapses to `""` for ANY name with zero Latin
 * alphanumeric characters after lowercasing (every Thai name, and most
 * other non-Latin scripts), and the `|| "character"` fallback then minted
 * the exact same literal key, `"character"`, for every such name. This was
 * the confirmed root cause of a live production bug (`/drama-series/18`):
 * 13 unrelated Thai characters all collided on that one literal, and
 * `generateUniqueCharacterKey`'s suffix loop "resolved" the collision by
 * silently handing out `character-2` … `character-14` — successful
 * duplicate inserts, not the failures a UNIQUE index is supposed to force.
 * `(seriesId, characterKey)` protected nothing.
 *
 * Fix: keep the Latin slug when it's non-empty (byte-identical output for
 * Latin-script names — Latin-named series are unaffected by this change).
 * Otherwise derive a deterministic key from a short SHA-256 hash of the
 * normalized name (`c-<8 hex chars>`), so the SAME name always yields the
 * SAME key across repeated auto-register runs (stability), and two
 * DIFFERENT names essentially never collide (the uniqueness guarantee the
 * old `"character"` literal never provided).
 *
 * Existing rows' `characterKey`s are deliberately NOT touched by this
 * change — `requiredCharacterRefs` and variant/twin links already point at
 * them; rewriting them is a separate, database-touching repair (the plan's
 * Phase 3), not a Phase 1 "pure bug fix".
 */
function slugifyForCharacterKey(name: string): string {
  const normalized = name.trim().toLowerCase();
  const latinSlug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (latinSlug) {
    return latinSlug.slice(0, CHARACTER_KEY_MAX_LENGTH);
  }
  const contentHash = createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 8);
  return `c-${contentHash}`.slice(0, CHARACTER_KEY_MAX_LENGTH);
}

// Exported so `__tests__/verticalDramaCharacterRosterAutoRegister.test.ts`
// can unit-test slugify stability/distinctness directly, without going
// through the DB-backed `ensureRosterCharactersFromStory` — mirrors this
// codebase's established "export a private helper for direct testability"
// convention (e.g. `seedCharactersFromDraft` in `verticalDramaSeries.ts`).
export { slugifyForCharacterKey };

/**
 * Appends `-2`, `-3`, ... until `baseKey` (already length-safe from
 * `slugifyForCharacterKey`) is not already present in `usedKeys`; mutates
 * nothing, caller adds the result to `usedKeys` itself. Same dedup-suffix
 * loop as `verticalDramaSeries.ts`'s `seedCharactersFromDraft` /
 * `verticalDramaCharacters.ts`'s `generateUniqueCharacterKey`, plus a
 * length-safety truncation so a suffix can never overflow the `varchar(64)`
 * column (mirrors `verticalDramaLocationReconciliation.ts`'s
 * `generateUniqueLocationKey`).
 */
function generateUniqueCharacterKey(
  baseKey: string,
  usedKeys: Set<string>
): string {
  const base = (baseKey.trim() || "character").slice(
    0,
    CHARACTER_KEY_MAX_LENGTH
  );
  let key = base;
  let suffix = 2;
  while (usedKeys.has(key)) {
    const suffixText = `-${suffix}`;
    key = `${base.slice(0, CHARACTER_KEY_MAX_LENGTH - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  return key;
}

export interface VdRosterAutoRegisterSummary {
  createdCharacters: Array<{ characterKey: string; name: string }>;
}

/**
 * Idempotently materializes story-introduced characters (Story Bible
 * `refinedCharacters` + deep-draft `shotDrafts`) into durable
 * `vertical_drama_characters` rows for `owner.seriesId`, INSERT-only (never
 * updates/deletes an existing row — see this file's own doc comment).
 *
 * `params.refinedCharacters` (optional) is folded in as a single synthetic
 * "shot" whose `characters[]` is the full refined-character list, so each
 * name AUTOMATICALLY satisfies `selectStoryIntroducedCharacterNames`'s
 * "appears in some shot's `characters[]`" branch — i.e. refined-character
 * names are NOT subject to the dialogue-repeat-count gate. This is
 * deliberate: `refinedCharacters` is the Story Bible's own curated,
 * already-vetted season character list (the exact list
 * `reconcileCharactersFromStoryBible`, this module's UPDATE-only sibling in
 * `verticalDramaSeries.ts`, already trusts unconditionally for its own
 * UPDATE path with no frequency gate) — a genuinely different trust level
 * from a raw, potentially-mis-parsed dialogue `speaker` label pulled
 * straight from shot-level LLM output, which is why the frequency gate
 * exists at all. The junk-name-token guard still applies to both sources.
 *
 * Role threading (`planning/vd-character-identity-repair/plan.md` Phase 1):
 * `refinedCharacters` entries additionally carry `role`/`narrativeRole`/
 * `roleTier`/`occupation` (see `VdRosterAutoRegisterRefinedCharacter`'s own
 * doc comment for the bug this fixes). That trust distinction is exactly
 * why role data flows ONLY from this param, never from `deepDraftShots`: a
 * name that qualifies purely via `deepDraftShots` (a shot `characters[]`
 * entry or a repeated dialogue `speaker`) is NOT one of the bible's curated,
 * already-vetted characters — it's an organically-introduced name the model
 * decided to use mid-draft, with no role verdict behind it at all — so it
 * is inserted with `narrativeRole`/`roleTier` still `null` and
 * `roleReviewStatus: "needs_role_review"`, same as before this change. Only
 * a name that resolves (by normalized-name match) back to a
 * `refinedCharacters` entry gets its role fields populated on INSERT, with
 * `roleReviewStatus: "ready"` when BOTH `narrativeRole` and `roleTier` are
 * present — the same rule `seedCharactersFromDraft` /
 * `reconcileCharactersFromStoryBible` (`verticalDramaSeries.ts`) already
 * apply, mirrored here rather than reinvented.
 *
 * Never throws for an unresolvable/empty input; DOES propagate a genuine DB
 * error, matching `verticalDramaLocationReconciliation.ts`'s established
 * convention (the caller is expected to wrap this whole call in its own
 * best-effort try/catch, same as `persistDeepDraftDeclaredLocations`'s call
 * sites in `verticalDramaSeries.ts`).
 */
export async function ensureRosterCharactersFromStory(
  owner: { tenantId: string; userId: number; seriesId: number },
  params: {
    refinedCharacters?: ReadonlyArray<VdRosterAutoRegisterRefinedCharacter>;
    deepDraftShots: ReadonlyArray<VdRosterAutoRegisterShot>;
  }
): Promise<VdRosterAutoRegisterSummary> {
  const candidateShots: VdRosterAutoRegisterShot[] = [
    ...(params.refinedCharacters && params.refinedCharacters.length > 0
      ? [
          {
            characters: params.refinedCharacters.map(c => ({ name: c.name })),
          },
        ]
      : []),
    ...params.deepDraftShots,
  ];
  if (candidateShots.length === 0) {
    return { createdCharacters: [] };
  }

  // Normalized-name lookup back to the ORIGINAL (role-bearing)
  // `refinedCharacters` entries — `candidateShots` above only threads
  // `name` through to the selector (the selector doesn't need role data),
  // so this is where the role fields re-join a name that made it through
  // `selectStoryIntroducedCharacterNames`. See this function's own doc
  // comment ("Role threading") for why only THIS map, never
  // `deepDraftShots`, is consulted for role data.
  const refinedCharacterByNormalizedName = new Map(
    (params.refinedCharacters ?? []).map(character => [
      normalizeStoryCharacterName(character.name),
      character,
    ])
  );

  const rows = (await db
    .select()
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, owner.tenantId),
        eq(verticalDramaCharacters.userId, owner.userId),
        eq(verticalDramaCharacters.seriesId, owner.seriesId)
      )
    )) as VerticalDramaCharacterRow[];

  // Already-persisted aliases for this series (`vertical_drama_character_aliases`).
  const aliasRows = (await db
    .select()
    .from(verticalDramaCharacterAliases)
    .where(
      and(
        eq(verticalDramaCharacterAliases.tenantId, owner.tenantId),
        eq(verticalDramaCharacterAliases.seriesId, owner.seriesId)
      )
    )) as VerticalDramaCharacterAliasRow[];

  // Every name CLAIMED by a character without being that character's `name`:
  // persisted alias rows, plus every alias the bible declares this run. The
  // bible-declared half must be included even when its canonical row does not
  // exist yet — the canonical name is itself in `candidateShots` (folded in
  // above), so it is created in THIS same batch, and its alias must not race
  // it into a second row. See `VdRosterAutoRegisterRefinedCharacter.aliases`.
  // A character may redundantly declare its OWN name among its aliases. Such
  // a self-alias must never reach the claimed set: it would mark the
  // canonical name as "already claimed by someone else" and suppress the
  // creation of the very character it belongs to.
  const bibleDeclaredAliases = (params.refinedCharacters ?? []).flatMap(
    character => {
      const normalizedOwnName = normalizeStoryCharacterName(character.name);
      return (character.aliases ?? []).filter(
        alias => normalizeStoryCharacterName(alias) !== normalizedOwnName
      );
    }
  );
  const existingAliasNames = [
    ...aliasRows.map(row => row.alias),
    ...bibleDeclaredAliases,
  ];

  const namesToInsert = selectStoryIntroducedCharacterNames({
    shots: candidateShots,
    existingRosterNames: rows.map(row => row.name),
    existingAliasNames,
  });

  const usedKeys = new Set(rows.map(row => row.characterKey));
  const createdCharacters: VdRosterAutoRegisterSummary["createdCharacters"] =
    [];

  // Normalized character name -> its roster row id, for the alias-seeding
  // pass at the end of the transaction below. Seeded with the rows that
  // already exist, then extended with the ones this run inserts.
  const characterIdByNormalizedName = new Map<string, number>(
    rows.map(row => [normalizeStoryCharacterName(row.name), row.id])
  );

  // Transaction (Database Safety Protocol) — this loop only ever INSERTs
  // (never updates/deletes an existing row), but wrapping it keeps the
  // whole batch atomic (all-or-nothing) if the DB rejects one of the
  // inserts partway through (e.g. an unexpected constraint violation).
  await db.transaction(async tx => {
    for (const name of namesToInsert) {
      const characterKey = generateUniqueCharacterKey(
        slugifyForCharacterKey(name),
        usedKeys
      );
      usedKeys.add(characterKey);

      // Bible-declared role data for this name, when this name resolved
      // from `refinedCharacters` (vs. a `deepDraftShots`-only name, which
      // has no entry here — see the "Role threading" doc comment above).
      const refinedCharacter = refinedCharacterByNormalizedName.get(
        normalizeStoryCharacterName(name)
      );
      const narrativeRole = refinedCharacter?.narrativeRole ?? null;
      const roleTier = refinedCharacter?.roleTier ?? null;

      const [insertedRow] = await tx
        .insert(verticalDramaCharacters)
        .values({
          tenantId: owner.tenantId,
          userId: owner.userId,
          seriesId: owner.seriesId,
          characterKey,
          name,
          role: refinedCharacter?.role ?? null,
          narrativeRole,
          roleTier,
          occupation: refinedCharacter?.occupation ?? refinedCharacter?.role ?? null,
          roleProvenance: "ai_assigned",
          // Same rule as `seedCharactersFromDraft` /
          // `reconcileCharactersFromStoryBible` (`verticalDramaSeries.ts`):
          // only "ready" for a human once BOTH the narrative role AND the
          // visual-design tier are known; a `deepDraftShots`-only name (no
          // `refinedCharacter` match) always falls to `needs_role_review`,
          // preserving today's behavior for organically-introduced names.
          roleReviewStatus:
            narrativeRole && roleTier ? "ready" : "needs_role_review",
          data: { source: "auto_registered_from_story" },
        } as typeof verticalDramaCharacters.$inferInsert)
        .returning();

      if (insertedRow) {
        const row = insertedRow as VerticalDramaCharacterRow;
        characterIdByNormalizedName.set(
          normalizeStoryCharacterName(row.name),
          row.id
        );
        createdCharacters.push({
          characterKey: row.characterKey,
          name: row.name,
        });
      }
    }

    // Materialize the bible's declared aliases as durable
    // `vertical_drama_character_aliases` rows, so a LATER run (whose
    // `refinedCharacters` the caller may not thread, e.g. a shots-only
    // extend) still recognizes "คิริน" as claimed by "คิริน วัฒนเมธา"
    // rather than minting a duplicate. Covers characters created just now
    // AND ones already on the roster.
    //
    // `onConflictDoNothing` on the UNIQUE `(seriesId, normalizedAlias)`
    // index makes this idempotent: re-running the same deep draft inserts
    // nothing and, crucially, does not abort the batch on the 23505 that a
    // plain insert would raise. An alias already claimed by a DIFFERENT
    // character is likewise left alone rather than stolen — first writer
    // wins, and a genuine conflict is the merge tool's business to resolve,
    // not a silent overwrite here.
    for (const character of params.refinedCharacters ?? []) {
      const characterId = characterIdByNormalizedName.get(
        normalizeStoryCharacterName(character.name)
      );
      if (!characterId) continue;
      for (const alias of character.aliases ?? []) {
        const normalizedAlias = normalizeStoryCharacterName(alias);
        // An alias identical to the character's own name carries no
        // information and would collide with nothing useful; skip it.
        if (
          !normalizedAlias ||
          normalizedAlias === normalizeStoryCharacterName(character.name)
        ) {
          continue;
        }
        await tx
          .insert(verticalDramaCharacterAliases)
          .values({
            tenantId: owner.tenantId,
            seriesId: owner.seriesId,
            characterId,
            alias: alias.trim(),
            normalizedAlias,
            source: "bible_declared",
          } as typeof verticalDramaCharacterAliases.$inferInsert)
          .onConflictDoNothing();
      }
    }
  });

  if (createdCharacters.length > 0) {
    // Names only, never any secret/PII beyond the character's own in-story
    // display name (see root CLAUDE.md "Secret Exposure Prevention").
    debugLog(
      "verticalDramaSeries.rosterAutoRegister",
      "Auto-registered story-introduced characters into roster",
      {
        seriesId: owner.seriesId,
        names: createdCharacters.map(c => c.name),
      }
    );
  }

  return { createdCharacters };
}
