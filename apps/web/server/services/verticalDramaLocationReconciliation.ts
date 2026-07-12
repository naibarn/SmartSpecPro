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
 * - **Stable-key match** — a group whose (trimmed) `locationKey` matches an
 *   EXISTING row's `locationKey`, OR a row already inserted earlier in this
 *   same call (a location can legitimately recur non-contiguously across
 *   `distinctLocations`, e.g. a flashback returning to an earlier setting),
 *   is a reuse: left completely untouched, no DB write at all (see this
 *   file's doc comment for why this differs from the character system's
 *   variant-match behavior).
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

    const existing = locationKey ? rowsByLocationKey.get(locationKey) : undefined;
    if (existing) {
      // Reuse — description stays frozen (the plan's explicit decision); no
      // DB write at all.
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
      createdLocations.push({ locationKey: row.locationKey, name: row.name });
    }
  }

  return { createdLocations, reusedLocations };
}
