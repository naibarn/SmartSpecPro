# Vertical Drama — Scene-Slot Dedup + Bulk Sub-Episode Slot Creation

Date: 2026-07-14
Status: Implemented (2026-07-14) — awaiting user deploy. Unit tests 20/20 green;
typecheck clean for edited files. Not deployed (working tree has unrelated
in-flight SUB-EP/EP refactor with pre-existing failing tests).

## Problem statement

Two user-reported issues on the series episodes tab (`/drama-series/:id?tab=episodes`):

1. **Duplicate scene slots (bug).** When a sub-episode's storyboard materializes its
   scenes, the system inserts a NEW location/scene slot with a fresh name instead of
   reusing an existing scene with the same name — so the same physical scene (e.g.
   "ร้านกาแฟ") accumulates duplicate rows across sub-episodes.

2. **No bulk sub-episode slot creation (feature).** The "สร้างตอนย่อยใหม่" control only
   offers 1–5 at a time; there is no way to create all planned sub-episode slots at
   once (up to the configured target). User wants: create all planned slots in one
   action (esp. first-time), and when slots already exist, still be able to specify a
   number to add more.

## Root cause (bug 1)

`reconcileEpisodeLocations` (`server/services/verticalDramaLocationReconciliation.ts:173`)
matches an incoming scene against existing rows **only by exact `locationKey`** — no
`name`-based fallback, no normalization (only `.trim()`). The storyboard fallback
(`server/services/verticalDramaStoryboardGeneration.ts:928`) mints unstable positional
keys `location-${index+1}` when the model omits `distinct_locations`, so the same scene
gets a different key per episode → the key lookup misses → a duplicate row with the same
`name` is inserted. Schema has a unique index only on `(seriesId, locationKey)`, none on
`(seriesId, name)` (`drizzle/schema.ts:20636`), so nothing stops the duplicate.

The deep-draft persist path (`persistDeepDraftDeclaredLocations`, same file:268) has the
identical key-only dedup and the same latent duplicate risk.

## Affected files

Server (bug fix):
- `apps/web/server/services/verticalDramaLocationReconciliation.ts` — add normalized-name
  fallback dedup to `reconcileEpisodeLocations` (and `persistDeepDraftDeclaredLocations`).
- (optional hardening) `apps/web/server/services/verticalDramaStoryboardGeneration.ts:928`
  — derive fallback `location_key` from a name-slug instead of a shot ordinal, for key
  stability. Secondary; the reconcile name-match is the authoritative safety net.

Server (feature):
- `apps/web/server/routers/verticalDramaEpisodes.ts` — raise `generateNextEpisodes`
  `count` cap from `.max(5)` to `.max(1000)` (already server-capped to remaining planned
  slots, so this is safe; Mode A materialize-from-plan is free).

Client (feature):
- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx` — pass `targetEpisodeCount`
  into `EpisodesTab`; add an "ทั้งหมดที่เหลือ (N)" / "All remaining (N)" option to the
  count dropdown; keep 1–5 quick options.

Tests:
- `verticalDramaLocationReconciliation` unit tests — add name-dedup cases.
- `generateNextEpisodes` — extend/verify large-count → capped-to-remaining behavior.

## Proposed changes

### 1. Scene-slot name dedup (bug)

In `reconcileEpisodeLocations`, before inserting:
- Build a `rowsByNormalizedName` map alongside `rowsByLocationKey`.
- Normalization = `trim().toLowerCase().replace(/\s+/g, " ")` (whitespace-collapse +
  case-fold). NO fuzzy matching — distinct-but-similar names must stay distinct.
- Reuse order: (a) exact `locationKey` match (existing behavior) → reuse; else
  (b) normalized-`name` match → reuse the existing row (record in `reusedLocations`,
  no DB write, description stays frozen — same contract as key-reuse); else insert new.
- When inserting, also register the new row's normalized name in the map so
  within-call duplicates by name are also deduped.

Apply the same normalized-name guard to `persistDeepDraftDeclaredLocations` (skip as
existing, never overwrite — its existing semantics).

### 2. Bulk slot creation (feature)

- Server: `generateNextEpisodes` input `count: z.number().int().min(1).max(1000)`.
  No logic change — it already computes `remaining = min(count, remainingPlannedSlots)`
  and materializes free plan entries first (Mode A), only using paid LLM continuation
  (Mode B) beyond the plan (unchanged behavior).
- Client `EpisodesTab`:
  - Accept new prop `targetEpisodeCount?: number`.
  - `remainingPlanned = max(0, targetEpisodeCount - episodes.length)`.
  - Dropdown options: `1..min(5, remainingPlanned)` plus, when `remainingPlanned > 1`,
    an "ทั้งหมดที่เหลือ (N)" / "All remaining (N)" option whose value = `remainingPlanned`.
  - When `remainingPlanned === 0`, disable the create button (series already at target).
  - Empty-state "add first" flow unchanged (still uses the selected count; first-time,
    remainingPlanned = target, so "All remaining (N)" is available).

## Risk assessment

- Name dedup: LOW-risk, but changes which scenes are treated as "the same". Mitigated by
  exact normalized match only (no fuzzy). Could reuse a scene the model intended as new
  ONLY if it has a byte-identical (case/space-normalized) name — acceptable and desired.
- No schema/migration change. No new unique constraint added (would fail on existing
  duplicate rows in prod). Retroactive cleanup of existing duplicates is OUT OF SCOPE.
- `count` cap raise: safe — server already bounds to remaining planned; Mode A is free.
  Large "all remaining" beyond the plan could trigger paid Mode B for un-planned slots —
  same as today, just at larger N. Existing per-call behavior/toasts unchanged.

## Verification steps

1. `pnpm --filter @smartspec/web test` for reconciliation + episodes router tests (add
   name-dedup cases first — TDD).
2. `pnpm --filter @smartspec/web check` (typecheck).
3. Manual: on a series with a scene "ร้านกาแฟ", generate two sub-episode storyboards
   referencing it → confirm one location row, not two (Tab ฉาก).
4. Manual: pick "All remaining (N)" → confirm N planned sub-episodes created in one click;
   pick "3" when some exist → confirm 3 added, capped at target.

## Out of scope

- Retroactive merge/cleanup of already-duplicated scene rows.
- Adding a `(seriesId, name)` DB unique constraint (unsafe with existing dupes).
- Creating scene slots at episode-creation time (they remain storyboard-time).
