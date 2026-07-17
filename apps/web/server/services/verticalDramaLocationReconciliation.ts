/**
 * Vertical Drama Series — per-episode location roster reconciliation
 * (`planning/polished-toasting-gadget.md` Phase 2).
 *
 * Purely deterministic, no LLM call (detection already happened inside the
 * `vertical-drama-storyboard-shotgrid` skill, whose `distinct_locations[]`
 * output this function consumes). Mirrors the existing, proven
 * `reconcileCharacterVariantPlan` in `verticalDramaCharacterVariantPlanner.ts`
 * (verified directly by reading that function in full): load the full
 * roster, build a key-lookup map, stable-key match first, generate a unique
 * slug key + insert when unmatched, best-effort skip (never throw) on
 * anything unresolvable.
 *
 * Simpler than its character counterpart in one deliberate way: on a
 * stable-key MATCH, this function leaves the existing row completely
 * untouched (no UPDATE at all) — mirroring the character system's TWIN
 * match behavior ("leave as-is, never re-created, never overwritten"), not
 * its VARIANT match behavior (which DOES refresh `data`/`variantType` on
 * every match). This is the plan's own explicit product decision: "On
 * location reuse across episodes, keep the originally-approved description
 * frozen — a separate 'regenerate description' action exists for when the
 * user wants to update it, rather than auto-overwriting on every reuse."
 * There is no variant/twin concept for locations at all, so there is only
 * ever ONE match behavior to choose between, not two.
 *
 * Error-handling convention mirrors `reconcileCharacterVariantPlan` exactly:
 * an individual group whose identity can't be resolved (no usable name) is
 * silently skipped via a plain conditional `continue` — never a try/catch
 * swallowing a DB error. A genuine DB error (e.g. connection failure) still
 * propagates normally; the caller (the episode pipeline, wired in a later
 * dispatch) is expected to wrap the whole call in its own best-effort
 * try/catch, exactly as `runImproveScriptJob` already does for
 * `reconcileCharacterVariantPlan`.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { verticalDramaLocations, type VerticalDramaLocationRow } from "../../drizzle/schema";
import type { VerticalDramaStoryboardLocationGroup } from "@shared/verticalDramaSeries/storyboardLocations";

/** Matches `verticalDramaLocations.locationKey`'s `varchar(64)` column limit. */
const LOCATION_KEY_MAX_LENGTH = 64;

/**
 * Slugify a location name into a `locationKey` candidate (lowercase,
 * non-alphanumeric collapsed to `-`, trimmed). Falls back to `"location"` for
 * a name that's entirely non-alphanumeric (e.g. Thai-only text, which this
 * app's location names usually are) — byte-identical convention to
 * `verticalDramaCharacterVariantPlanner.ts`'s own `slugifyForCharacterKey`
 * (duplicated here rather than imported — that function is private to its
 * own file, and this codebase's established convention for this feature is
 * "duplicate small helpers per file to keep the character and location
 * systems decoupled", the same convention the Phase 2 plan itself calls out
 * for the sibling location router's `resolveMediaAssetForImport`).
 */
function slugifyForLocationKey(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "location";
}

/**
 * Appends `-2`, `-3`, ... until `baseKey` (truncated to fit the 64-char
 * column limit alongside its suffix) is not already present in `usedKeys`;
 * mutates nothing, caller adds the result to `usedKeys` itself. Mirrors
 * `generateUniqueCharacterKey`'s dedup loop, plus the truncation safeguard —
 * needed here because, unlike a character-variant key (always CODE-composed
 * from a short parent key + slug), an incoming `distinctLocations[].locationKey`
 * may be supplied directly by the storyboard skill and could in principle
 * exceed the column limit.
 */
function generateUniqueLocationKey(baseKey: string, usedKeys: Set<string>): string {
  const base = (baseKey.trim() || "location").slice(0, LOCATION_KEY_MAX_LENGTH);
  let key = base;
  let suffix = 2;
  while (usedKeys.has(key)) {
    const suffixText = `-${suffix}`;
    key = `${base.slice(0, LOCATION_KEY_MAX_LENGTH - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  return key;
}

/**
 * Normalizes a location `name` for the name-based dedup fallback (see
 * `reconcileEpisodeLocations`'s doc comment): case-fold + collapse internal
 * whitespace runs to a single space + trim. Deliberately EXACT-match only —
 * no fuzzy/substring comparison — so genuinely distinct-but-similar scene
 * names (e.g. "ร้านกาแฟ" vs "ร้านกาแฟ (สาขา 2)") stay distinct.
 */
function normalizeLocationName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolve the base key to seed a NEW location row's `locationKey` with: the
 * incoming `locationKey` verbatim when it's present and fits the column
 * limit (the common case — the storyboard skill is instructed to invent a
 * slug-shaped key for a genuinely new location), otherwise a deterministic
 * slug of `locationName` (absent/malformed-key fallback). Always passed
 * through `generateUniqueLocationKey` afterward for dedup + a final
 * length-safety pass.
 */
function resolveNewLocationKeyBase(locationKey: string, locationName: string): string {
  if (locationKey && locationKey.length <= LOCATION_KEY_MAX_LENGTH) return locationKey;
  return slugifyForLocationKey(locationName);
}

export interface LocationReconciliationSummary {
  createdLocations: Array<{ locationKey: string; name: string }>;
  /** Existing rows matched by `locationKey` — left completely untouched (description frozen). */
  reusedLocations: Array<{ locationKey: string; name: string }>;
}

/**
 * Idempotently materializes `distinctLocations` (from the storyboard-shotgrid
 * stage's own `distinct_locations[]` output, already projected to this
 * camelCase contract shape by the caller) into durable
 * `vertical_drama_locations` rows for `owner.seriesId`.
 *
 * - **Stable-key match (default: REUSE)** — a group whose (trimmed)
 *   `locationKey` matches an EXISTING row's `locationKey` (or a row already
 *   inserted earlier in this same call — a location can legitimately recur
 *   non-contiguously across `distinctLocations`, e.g. a flashback returning
 *   to an earlier setting) is, BY DEFAULT, a reuse: left completely
 *   untouched, no DB write at all (see this file's doc comment for why this
 *   differs from the character system's variant-match behavior) — even when
 *   the incoming `locationName` text is different from the matched row's
 *   own `name`. Name drift on a reused key is EXPECTED and normal (the
 *   model re-authors `location_name` prose every generation; that's
 *   precisely why descriptions are frozen on reuse in the first place) —
 *   trusting the key by default here matters because 2026-07-14's first
 *   attempt at this fix instead DISCARDED any key match whose name didn't
 *   align, which regressed into minting a duplicate row every time a
 *   reused canonical key's Thai name was merely reworded between runs (both
 *   sides slugify to the same non-informative `"location"` fallback, so a
 *   naive name-alignment check can't tell "reworded" apart from "different
 *   place" for Thai text at all). See "Positive-swap-evidence override"
 *   immediately below for the one narrow, evidence-based exception.
 * - **Positive-swap-evidence override** — a stable-key match above is
 *   instead OVERRIDDEN (bind to a different row, not the key-hit row) only
 *   when there is POSITIVE evidence of an actual swap: the incoming
 *   `locationName` is already "key-shaped" (slugifying it via
 *   `slugifyForLocationKey` is a no-op, e.g. `"shophouse-stairhall"`) AND
 *   that exact text is itself an EXISTING row's `locationKey` — DIFFERENT
 *   from the row the incoming `locationKey` hit (or the incoming
 *   `locationKey` didn't hit any row at all, the legacy/positional case).
 *   In that specific, narrow case the override binds to the name-keyed
 *   canonical row instead. This is the root-caused production scenario
 *   (series 16 / episode 59): a positional fallback key `location-1`
 *   pointed at "Irin Cafe" in the roster, while a later storyboard's
 *   `location-1` group's `location_name` field literally carried the text
 *   `"shophouse-stairhall"` — a DIFFERENT existing canonical row's own key
 *   — which is unambiguous evidence the model meant that other place, not
 *   a same-place rewording. Absent that specific signal (no differently-
 *   keyed row matches the name-as-key text), the default stable-key REUSE
 *   above applies — never a silent discard-then-mint.
 * - **Normalized-name fallback match** — when there is no `locationKey`
 *   match at all, a group whose (trimmed) `locationName`, run through
 *   `normalizeLocationName` (case-fold + whitespace-collapse), EXACTLY
 *   matches an existing row's (or an earlier-this-call inserted row's)
 *   normalized name is ALSO treated as a reuse, same "left completely
 *   untouched" contract as a key match. This exists because the storyboard
 *   generator can mint an unstable positional fallback key
 *   (`location-${index+1}`) for the same physical scene across episodes when
 *   the model omits `distinct_locations`, which the key-only lookup would
 *   miss and duplicate — see `planning/vertical-drama-scene-dedup-bulk-slots/plan.md`.
 *   Deliberately EXACT normalized equality only, no fuzzy/substring matching,
 *   so distinct-but-similar names stay distinct rows. (As of 2026-07-14 the
 *   storyboard generator's own fallback mints a content-derived slug key
 *   instead of a positional one, so this rule now mainly guards legacy data
 *   and any other unstable-key producer, current or future.)
 * - **No match** — INSERT a new row. Its `locationKey` comes from
 *   `resolveNewLocationKeyBase` (the incoming key verbatim when usable, else
 *   a slug of `locationName`), deduplicated against every key already used
 *   in the series (existing rows + rows inserted earlier in this same call)
 *   via `generateUniqueLocationKey`. `data` is seeded with `{ description }`
 *   only — `aggregatedFacts` is intentionally NOT part of this function's
 *   input (`VerticalDramaStoryboardLocationGroup` carries no such field);
 *   populating it is a separate concern for whichever caller aggregates
 *   per-shot facts.
 * - **Malformed/unresolvable group** — a group with no usable `locationName`
 *   (the DB column is `NOT NULL`, and there is no reliable fallback source
 *   to synthesize one from) is silently skipped and never throws, mirroring
 *   `reconcileCharacterVariantPlan`'s "unknown character_key -> continue"
 *   philosophy.
 *
 * Never throws for an unresolvable individual group (skips it); DOES
 * propagate a genuine DB error, since the caller is expected to wrap this
 * whole call in its own best-effort try/catch (see this file's doc comment).
 */
export async function reconcileEpisodeLocations(
  owner: { tenantId: string; userId: number; seriesId: number },
  distinctLocations: VerticalDramaStoryboardLocationGroup[],
): Promise<LocationReconciliationSummary> {
  const createdLocations: LocationReconciliationSummary["createdLocations"] = [];
  const reusedLocations: LocationReconciliationSummary["reusedLocations"] = [];

  const rows: VerticalDramaLocationRow[] = await db
    .select()
    .from(verticalDramaLocations)
    .where(
      and(
        eq(verticalDramaLocations.tenantId, owner.tenantId),
        eq(verticalDramaLocations.userId, owner.userId),
        eq(verticalDramaLocations.seriesId, owner.seriesId),
      ),
    );

  const rowsByLocationKey = new Map<string, VerticalDramaLocationRow>(
    rows.map((row) => [row.locationKey, row]),
  );
  // Normalized-name fallback lookup (see this function's doc comment). On a
  // collision between two EXISTING rows sharing a normalized name, keep the
  // FIRST one encountered (deterministic — never overwrite the map entry);
  // this is an existing-data edge case this function doesn't attempt to
  // resolve further, it just needs a single stable reuse target.
  const rowsByNormalizedName = new Map<string, VerticalDramaLocationRow>();
  for (const row of rows) {
    const normalized = normalizeLocationName(row.name);
    if (!rowsByNormalizedName.has(normalized)) {
      rowsByNormalizedName.set(normalized, row);
    }
  }
  const usedKeys = new Set<string>(rows.map((row) => row.locationKey));

  for (const group of distinctLocations ?? []) {
    const locationName = (group?.locationName ?? "").trim();
    const locationKey = (group?.locationKey ?? "").trim();

    if (!locationName) {
      // Nothing usable to insert (name is a required, NOT NULL DB column)
      // and no reliable fallback source for a slug either — best-effort
      // skip, never throw.
      continue;
    }

    const normalizedIncomingName = normalizeLocationName(locationName);
    const slugOfIncomingName = slugifyForLocationKey(locationName);
    // A name is "already key-shaped" when slugifying it is a no-op (e.g.
    // "shophouse-stairhall") — i.e. it plausibly IS a canonical key that
    // ended up in the `locationName` field rather than `locationKey` (the
    // episode 59 evidence: `location_name: "shophouse-stairhall"`). Gates
    // the positive-swap-evidence override below so an ordinary human-
    // readable name that merely COLLIDES with an unrelated existing key
    // when slugified (e.g. "Kitchen" -> "kitchen" colliding with an
    // existing, genuinely different "ครัวเก่า" row keyed "kitchen") is
    // never mistaken for it.
    const nameIsAlreadyKeyShaped = locationName === slugOfIncomingName;

    const keyMatch = locationKey ? rowsByLocationKey.get(locationKey) : undefined;
    // Positive-swap-evidence override (see doc comment): only fires when
    // the incoming name is key-shaped AND that exact text is a DIFFERENT
    // existing row's own locationKey than whatever the incoming locationKey
    // itself hit (including "hit nothing" — the legacy/positional case).
    const nameAsKeyRow = nameIsAlreadyKeyShaped
      ? rowsByLocationKey.get(slugOfIncomingName)
      : undefined;
    const swapTarget =
      nameAsKeyRow && (!keyMatch || nameAsKeyRow.locationKey !== keyMatch.locationKey)
        ? nameAsKeyRow
        : undefined;

    const existing =
      swapTarget ?? keyMatch ?? rowsByNormalizedName.get(normalizedIncomingName);
    if (existing) {
      // Reuse — description stays frozen (the plan's explicit decision); no
      // DB write at all. Matches whether found by the positive-swap-evidence
      // override, a default stable-key match, or the normalized-name
      // fallback (see doc comment).
      reusedLocations.push({ locationKey: existing.locationKey, name: existing.name });
      continue;
    }

    const description = (group?.description ?? "").trim() || locationName;
    const newKey = generateUniqueLocationKey(resolveNewLocationKeyBase(locationKey, locationName), usedKeys);

    const [insertedRow] = await db
      .insert(verticalDramaLocations)
      .values({
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
        locationKey: newKey,
        name: locationName,
        data: { description },
      } as typeof verticalDramaLocations.$inferInsert)
      .returning();

    if (insertedRow) {
      const row = insertedRow as VerticalDramaLocationRow;
      rowsByLocationKey.set(row.locationKey, row);
      usedKeys.add(row.locationKey);
      const normalizedNewName = normalizeLocationName(row.name);
      if (!rowsByNormalizedName.has(normalizedNewName)) {
        rowsByNormalizedName.set(normalizedNewName, row);
      }
      createdLocations.push({ locationKey: row.locationKey, name: row.name });
    }
  }

  return { createdLocations, reusedLocations };
}

/**
 * Production-grade full-story generation
 * (`planning/vertical-drama-full-story-production-grade`, added 2026-07-13)
 * — persists `new_locations` DECLARED by a deep story draft generation run
 * (`generateStoryBibleDeep`'s `GenerateStoryBibleDeepResult.newLocations`,
 * already deduped-by-`location_key` by that service) into the durable
 * `vertical_drama_locations` roster, called by `runGenerateStoryBibleDeepJob`
 * AFTER the bible write succeeds (`server/routers/verticalDramaSeries.ts`).
 *
 * Reuses this file's OWN "load roster once, key-lookup map, skip on
 * stable-key match, insert-when-unmatched, best-effort skip on
 * unresolvable" shape (`reconcileEpisodeLocations` above) — the ONE
 * deliberate difference from that function: a `location_key` COLLISION here
 * is NEVER an implicit "reuse" (the deep-draft gate should already have
 * prevented the model from declaring an existing key as new — see
 * `computeNewLocationDeclarationViolations` in `verticalDramaStoryBible.ts`)
 * — it is instead reported via `skippedExistingKeys` so the caller can
 * decide whether to warn, but the existing row's data is, exactly like
 * `reconcileEpisodeLocations`, NEVER overwritten.
 *
 * Also carries the SAME normalized-name fallback guard as
 * `reconcileEpisodeLocations` (see that function's doc comment): a declared
 * location whose (trimmed) `name`, normalized, EXACTLY matches an existing
 * row's (or an earlier-this-call inserted row's) normalized name is treated
 * exactly like a `location_key` collision — recorded in
 * `skippedExistingKeys` (using the MATCHED row's own key, not the incoming
 * one), never inserted, never overwritten.
 */
export interface DeepDraftLocationPersistSummary {
  createdLocations: Array<{ locationKey: string; name: string }>;
  /** `location_key`s that already existed (or were duplicated within THIS call) — never inserted, never overwritten. */
  skippedExistingKeys: string[];
}

export async function persistDeepDraftDeclaredLocations(
  owner: { tenantId: string; userId: number; seriesId: number },
  declaredLocations: ReadonlyArray<{
    location_key: string;
    name: string;
    description: string;
    environment: string;
    time_of_day?: string;
    mood?: string;
  }>,
): Promise<DeepDraftLocationPersistSummary> {
  if (declaredLocations.length === 0) {
    return { createdLocations: [], skippedExistingKeys: [] };
  }

  const rows: VerticalDramaLocationRow[] = await db
    .select()
    .from(verticalDramaLocations)
    .where(
      and(
        eq(verticalDramaLocations.tenantId, owner.tenantId),
        eq(verticalDramaLocations.userId, owner.userId),
        eq(verticalDramaLocations.seriesId, owner.seriesId),
      ),
    );
  const existingKeys = new Set(rows.map((row) => row.locationKey));
  // Normalized-name fallback lookup, keyed by normalized name -> the
  // MATCHED row's own `locationKey` (see this function's doc comment). On a
  // collision between two existing rows, keep the FIRST one's key
  // (deterministic).
  const keyByNormalizedName = new Map<string, string>();
  for (const row of rows) {
    const normalized = normalizeLocationName(row.name);
    if (!keyByNormalizedName.has(normalized)) {
      keyByNormalizedName.set(normalized, row.locationKey);
    }
  }

  const createdLocations: DeepDraftLocationPersistSummary["createdLocations"] = [];
  const skippedExistingKeys: string[] = [];

  for (const loc of declaredLocations) {
    const key = (loc.location_key ?? "").trim();
    const name = (loc.name ?? "").trim();
    if (!key || !name) continue; // `locationKey`/`name` are NOT NULL columns — skip an unusable entry, never throw.

    const normalizedName = normalizeLocationName(name);
    const matchedExistingKey = existingKeys.has(key)
      ? key
      : keyByNormalizedName.get(normalizedName);
    if (matchedExistingKey) {
      // NEVER overwrite an existing location's data (hard rule) — record and
      // move on, the same "leave as-is" behavior as `reconcileEpisodeLocations`'s
      // stable-key/normalized-name match. Record the MATCHED row's own key,
      // not necessarily the incoming `key` (a normalized-name match can have
      // a different incoming key).
      skippedExistingKeys.push(matchedExistingKey);
      continue;
    }
    existingKeys.add(key); // also guards against a duplicate key WITHIN this same call.
    if (!keyByNormalizedName.has(normalizedName)) {
      keyByNormalizedName.set(normalizedName, key); // also guards a duplicate NAME within this same call.
    }

    const [insertedRow] = await db
      .insert(verticalDramaLocations)
      .values({
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
        locationKey: key.slice(0, LOCATION_KEY_MAX_LENGTH),
        name,
        data: {
          description: loc.description,
          environment: loc.environment,
          ...(loc.time_of_day ? { timeOfDay: loc.time_of_day } : {}),
          ...(loc.mood ? { mood: loc.mood } : {}),
          source: "deep_story_draft",
        },
      } as typeof verticalDramaLocations.$inferInsert)
      .returning();

    if (insertedRow) {
      const row = insertedRow as VerticalDramaLocationRow;
      createdLocations.push({ locationKey: row.locationKey, name: row.name });
    }
  }

  return { createdLocations, skippedExistingKeys };
}
