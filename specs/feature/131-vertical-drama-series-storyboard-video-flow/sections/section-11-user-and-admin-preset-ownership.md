# section-11-user-and-admin-preset-ownership

## Goal

Add ownership to the genre preset library shipped in section-10 so a user can save the series
they're already editing as their own private, reusable preset, and an admin can publish a preset
globally (visible to every user) — **without a new preset-management screen**. This is an
implementation record (work already shipped 2026-07-04), not a forward-looking proposal.

## Depends On

- section-10-ui-redesign-genre-presets-story-generation (the `vertical_drama_genre_presets` table and `listGenrePresets`)

## Schema

Additive columns on the existing table (applied via hand-authored SQL — `drizzle-kit generate`
remains blocked repo-wide by the pre-existing 0146/0147 meta-journal collision, same workaround
as every other migration in this feature):

```sql
ALTER TABLE vertical_drama_genre_presets
  ADD COLUMN "scope" varchar(20) NOT NULL DEFAULT 'global',
  ADD COLUMN "tenantId" varchar(36),
  ADD COLUMN "userId" integer REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX vds_genre_presets_owner_idx ON vertical_drama_genre_presets ("tenantId", "userId", "scope");
```

The existing 36 seeded rows keep `scope='global'` with `NULL` owner columns — identical semantics
to before (visible to everyone), zero data-loss, zero migration needed for existing rows.

- `scope: "global"` — visible to every user. Either seeded content or something an admin
  explicitly published.
- `scope: "private"` — visible only to the exact `tenantId` + `userId` that saved it.

## Files

Modified:

- `apps/web/drizzle/schema.ts` — `scope`/`tenantId`/`userId` + owner index on `verticalDramaGenrePresets`.
- `apps/web/server/routers/verticalDramaSeries.ts` — `listGenrePresets` ownership filter, new `saveSeriesAsPreset` mutation, `parseCharactersDraft` helper.
- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx` — `SaveAsPresetCard` (button + dialog) on the Overview tab.
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaCopy.ts` — TH/EN copy for the new button/dialog/checkbox.

Created:

- `apps/web/drizzle/manual_vertical_drama_genre_preset_ownership.sql`

No new page/route/screen was created — this reuses the Series Detail page the user is already on.

## New Procedure

`verticalDramaSeries.saveSeriesAsPreset({ seriesId, title, publishGlobally? })`:

1. `loadOwnedSeries` — same ownership check as every other series procedure (NOT_FOUND for cross-tenant/user ids, never FORBIDDEN, to avoid disclosing existence).
2. Pulls `logline`/`mainPlot`/`seasonArc`/`cliffhangerStyle`/`visualBible` off the series' existing
   `bible` jsonb (falls back to `""` for any missing field — a barely-started series can still be
   saved as a preset), `tone`/`genre` off the series row directly.
3. `parseCharactersDraft(bible.charactersDraft)` — best-effort line parser: matches the
   `name — role: description` shape `CreateSeriesWizard.tsx`'s `applyPreset` already produces
   when a preset is applied (so preset → series → re-saved-as-preset round-trips losslessly);
   any line that doesn't match becomes `{ name: line, role: "", description: "" }`.
4. `publishGlobally` is only honored when `ctx.user.role === "admin"`; otherwise (including any
   admin who left the box unchecked) the preset is always `scope: "private"`, owned by the
   caller's `tenantId` + `userId`.

`listGenrePresets` now returns `scope = 'global'` rows **union** the caller's own
`scope = 'private'` rows — no change needed in `CreateSeriesWizard.tsx`'s picker, which already
calls this procedure.

## UI/UX Contract Delta

- `VerticalDramaSeriesDetailPage` Overview tab (non-archived series only) gains a `SaveAsPresetCard`:
  a short explanation + a "Save as preset" button that opens a small `Dialog` (same weight as the
  existing Repair dialog / Create-Series Wizard — not a new page):
  - Title `Input`, prefilled with the series' own title, editable.
  - Admins only: a "Publish for all users" checkbox with a hint clarifying it's admin-only and
    that leaving it unchecked keeps the preset private to their own account. Non-admins never see
    this control — their saves are always private, matching the ask exactly.
  - Confirm calls `saveSeriesAsPreset`; toast on success/failure; dialog closes on success.
- No change to `CreateSeriesWizard.tsx`'s existing preset picker — private presets simply start
  appearing in the same grid once the backend returns them for that user.

## Tests First

- Test: `listGenrePresets` returns global rows for every caller, plus only the caller's own
  private rows (a second user's private presets never appear for the first user).
- Test: `saveSeriesAsPreset` — non-admin caller with `publishGlobally: true` still gets
  `scope: "private"` (the flag is silently ignored, not an error — matches "if not admin, always
  private" rather than surfacing a permission error for an honest attempt).
- Test: `saveSeriesAsPreset` — admin caller with `publishGlobally: true` gets `scope: "global"`,
  `tenantId`/`userId` both `NULL`, and the preset is immediately visible to a *different* user's
  `listGenrePresets` call.
- Test: `parseCharactersDraft` round-trips the exact `name — role: description` format
  `applyPreset` produces, and degrades gracefully (name-only, empty role/description) for
  arbitrary freeform lines.
- Test: `saveSeriesAsPreset` enforces series ownership (NOT_FOUND for another tenant's/user's
  series id).
- Test: `SaveAsPresetCard`'s publish-globally checkbox renders only when `useAuth().user.role === "admin"`.

**Status:** implemented directly this round; existing adjacent suites re-run clean as a
regression check (see Verification). Dedicated unit tests for `saveSeriesAsPreset` /
`parseCharactersDraft` / the ownership filter on `listGenrePresets` are **backlog** — flagged
explicitly, same as section-10's `generateStoryBible` gap, since both are new server-side
mutations without direct test coverage yet.

## Implementation Tasks

1. Migration: add `scope`/`tenantId`/`userId` + owner index (additive, applied via `psql`).
2. `drizzle/schema.ts` — mirror the new columns.
3. `listGenrePresets` — extend `where` for global-union-own-private.
4. `parseCharactersDraft` helper + `saveSeriesAsPreset` mutation.
5. `SaveAsPresetCard` on the Series Detail Overview tab, gated on `!isArchived`.
6. Copy keys (TH/EN) for the button/dialog/checkbox/toasts.

## Acceptance

- A user can save the series they're editing as a preset from the Overview tab they're already on — no new screen.
- That saved preset appears in *that user's own* wizard preset picker and nowhere else, by default.
- An admin who checks "Publish for all users" produces a preset indistinguishable from the seeded 36 — visible to every user immediately.
- Existing 36 seeded presets are unaffected (still `scope='global'`, still returned for everyone).
- Full `tsc --noEmit` clean; existing adjacent test suites still pass.

## Verification

```bash
cd apps/web && pnpm check
cd apps/web && pnpm test -- verticalDrama
cd apps/web && pnpm test -- useMenuItems
psql "$DATABASE_URL" -c "SELECT scope, count(*) FROM vertical_drama_genre_presets GROUP BY scope;"
```

## Known Gaps / Backlog

- No way for a user to delete/rename their own saved presets yet (only create) — a natural
  follow-up once this ships and gets used.
- No admin browse/moderate view for globally-published presets — an admin can currently only
  create one from their own series, not review/unpublish someone else's later.
- No dedicated unit tests yet for `saveSeriesAsPreset` / `parseCharactersDraft` / the
  ownership filter.
