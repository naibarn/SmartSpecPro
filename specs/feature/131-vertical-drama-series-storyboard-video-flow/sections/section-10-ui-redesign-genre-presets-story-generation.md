# section-10-ui-redesign-genre-presets-story-generation

## Goal

Retrofit the shipped Vertical Drama Series UI (built in section-03/04) to match the
"Presentation-Builder" reference pattern requested directly by the user: every wizard/workspace
step always reachable, a full-width center canvas for reviewing any stage's output, a genre
preset library so series creation starts from a rich template instead of a blank form, and a
real "Generate story" action once the wizard is filled in. Also drop the `/dashboard` prefix
from the route. This is an implementation record (work already shipped 2026-07-04), not a
forward-looking proposal — it exists so `spec.md` and `section-03` stay accurate.

## Depends On

- section-02-contracts-persistence-assets
- section-03-dashboard-routes-feature-flags
- section-04-series-memory-and-episode-pipeline (episode pipeline stages/phases reused as-is)
- section-09-assembly-export-artifacts (`verticalDramaAssembly.listRuns`/`getRunDetail`, reused not modified)

## Files

Modified:

- `apps/web/client/src/App.tsx` — route paths + legacy redirects
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaCopy.ts` — base path + legacy path constant, sidebar/wizard copy keys
- `apps/web/client/src/pages/VerticalDramaSeriesPage.tsx` — mounted inside `VerticalDramaShell`, wizard extracted out
- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx` — tabs always visible, `StoryBibleOverviewCard`
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx` — mounted inside `VerticalDramaShell`, wires the new stage-grid props (`assembly.listRuns`/`getRunDetail`, `episodes.getEpisodeDetail`)
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace.tsx` — stage-card grid + focused-stage detail panel
- `apps/web/server/routers/verticalDramaSeries.ts` — `listGenrePresets`, `generateStoryBible`
- `apps/web/server/routers/verticalDramaEpisodes.ts` — `getEpisodeDetail`, `artifactLedgerHref` path update
- `apps/web/drizzle/schema.ts` — `verticalDramaGenrePresets` table
- `packages/shared/src/constants/menu.ts` — menu path
- `apps/web/package.json` — `seed:vertical-drama:genre-presets` script alias

Created:

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaShell.tsx`
- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx` (extracted from the series list page)
- `apps/web/server/services/verticalDramaStoryBible.ts`
- `apps/web/drizzle/manual_vertical_drama_genre_presets.sql` (hand-authored — `drizzle-kit generate` is blocked repo-wide by a pre-existing meta-journal collision at 0146/0147, same workaround already used for `manual_vertical_drama_131.sql`)
- `apps/web/scripts/seed-vertical-drama-genre-presets.ts`

## Schema

```ts
export const verticalDramaGenrePresets = pgTable("vertical_drama_genre_presets", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  title: varchar("title", { length: 150 }).notNull(),
  category: varchar("category", { length: 60 }).notNull(),
  locale: varchar("locale", { length: 8 }).default("th").notNull(),
  logline: text("logline").notNull(),
  mainPlot: text("mainPlot").notNull(),
  seasonArc: text("seasonArc").notNull(),
  tone: varchar("tone", { length: 100 }).notNull(),
  cliffhangerStyle: varchar("cliffhangerStyle", { length: 150 }).notNull(),
  charactersJson: jsonb("charactersJson").notNull(), // Array<{ name, role, description }>
  visualBible: text("visualBible").notNull(),
  sortOrder: integer("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
```

Global, read-only catalog (not tenant/user scoped as of this section) — 36 presets seeded across
revenge/family-conflict, romance/workplace/entertainment, and fantasy/thriller clusters. See
section-11 for the follow-up that adds user-private + admin-published preset ownership on top of
this table.

## New Procedures

- `verticalDramaSeries.listGenrePresets({ locale? })` — read-only, `verticalDramaProcedure`
  (feature-flag gated only, no ownership check since presets are a shared library).
- `verticalDramaSeries.generateStoryBible({ seriesId })` — **the first real, credit-consuming LLM
  call in this feature.** `loadOwnedSeries` ownership check → `hasEnoughCredits` → build a prompt
  from the series' `bible` fields → `executeWithFallback` (model resolved via
  `loadEnabledLlmModelRows` + `selectBestLlmModel`, same primitives as
  `aiPresentationService.ts`'s `resolveDefaultTextModel`) → zod-validate the JSON response
  (`VdSchemaValidationError` on failure, mirroring the pipeline's `VD_SCHEMA_VALIDATION_FAILED`
  convention) → `deductCredits` (`sourceType: "skill"`, `providerUsageLog` auto-populated by
  `executeWithFallback`'s `logRequest`) → merge `expandedSeasonArc`/`refinedCharacters`/
  `episodeBreakdown`/`expandedAt` into the existing `bible` jsonb column. No schema change needed
  for the result — `bible` was already untyped jsonb.
- `verticalDramaEpisodes.getEpisodeDetail({ seriesId, episodeId })` — read-only, returns
  `dialogueAudioPlan` so the episode workspace's focused-stage panel can render a persisted plan
  (not only a just-returned mutation response).

## UI/UX Contract Delta (see section-03 for the full, now-updated surface inventory)

- `VerticalDramaShell` wraps all three routes: gradient/glass header (Media Studio's idiom) +
  persistent collapsible left project sidebar (Storyboard Review's idiom — 18rem/20rem column,
  collapses to a 3.25rem icon rail at `xl:`, reflows to a top strip below that), search box,
  "New" trigger, current-series highlight.
- `CreateSeriesWizard` steps became a freely-navigable tab bar (§8.2); step 1 gained the genre
  preset picker.
- `VerticalDramaSeriesDetailPage` tabs are all always visible (§8.3/§8.7); Overview tab renders
  `StoryBibleOverviewCard`.
- `VerticalDramaEpisodeWorkspace` stage list became a phase-grouped, always-clickable card grid
  with a focused-stage detail panel (§8.4).

## Tests First

- Test: `/drama-series*` routes render and `/dashboard/vertical-drama*` legacy paths redirect to
  their `/drama-series*` equivalents (client-side, all 4 route depths).
- Test: `listGenrePresets` returns seeded rows filtered by `locale`, ordered by `sortOrder`.
- Test: `generateStoryBible` — throws `FORBIDDEN` when credits insufficient (no LLM call made);
  on success, writes `episodeBreakdown`/`expandedSeasonArc`/`refinedCharacters`/`expandedAt` into
  `bible` and returns `creditsUsed`; on a malformed LLM response, throws
  `UNPROCESSABLE_CONTENT` and does **not** deduct credits.
- Test: `getEpisodeDetail` enforces the same tenant/user/series/episode ownership as
  `loadOwnedEpisode` (NOT_FOUND for cross-tenant/user ids).
- Test: CreateSeriesWizard — all 6 step tabs are clickable regardless of order; selecting a
  preset prefills the expected fields without touching `title`; `Create` stays disabled until
  title + valid episode count, independent of active tab.
- Test: Series Detail — all 8 tabs render simultaneously; a tab whose group has no content shows
  the amber indicator; clicking any tab in any order changes `activeTab`.
- Test: Episode workspace — every one of the 15 stage cards is clickable regardless of `status`;
  clicking a non-current stage renders `VerticalDramaRunDetailView` (or
  `VerticalDramaDialogueAudioPanel` for `dialogue_audio_plan`) without altering the primary CTA's
  target stage.

**Status:** implemented directly this round without a preceding failing-test commit (existing
adjacent suites — `verticalDramaAssembly.test.ts`, `verticalDramaDialogueAudio.test.ts`,
`useMenuItems.test.ts` — were re-run clean, 36/36, as a regression check). Dedicated unit tests
for `generateStoryBible`/`listGenrePresets`/the new UI states are **backlog**, not yet written —
flagged explicitly since `generateStoryBible` is a credit-consuming, user-facing action.

## Implementation Tasks

1. Route restructure + legacy redirects.
2. `vertical_drama_genre_presets` table + hand-authored migration + `listGenrePresets`.
3. Author + seed 36 genre presets (parallel-authored in 3 clusters of 12).
4. Preset picker UI in `CreateSeriesWizard` step 1.
5. Freely-navigable tabs + completion dots in `CreateSeriesWizard` and `VerticalDramaSeriesDetailPage`.
6. `verticalDramaStoryBible.ts` service + `generateStoryBible` mutation.
7. Wire wizard `Create` → `generateStoryBible` chain (best-effort) + `StoryBibleOverviewCard` retry path.
8. Stage-card grid redesign in `VerticalDramaEpisodeWorkspace` + `getEpisodeDetail` + container wiring of `assembly.listRuns`/`getRunDetail`.
9. Sync `spec.md` (§8.1-§8.4, §8.7) and `section-03` with the above (this pass).

## Acceptance

- `/drama-series` is the canonical entry point; legacy `/dashboard/vertical-drama*` links still work.
- A user can pick a genre preset when creating a series and every field it should prefill is prefilled.
- Every wizard step and every series-detail tab is reachable in one click regardless of order or content state.
- `generateStoryBible` deducts credits only on a successful, schema-valid LLM response, and the
  result is visible on the Series Detail Overview tab with a working Regenerate path.
- Every one of the 15 episode pipeline stages can be opened for viewing regardless of its status,
  not only the current stage.
- Full `tsc --noEmit` clean (no new errors introduced); existing adjacent test suites still pass.

## Verification

```bash
cd apps/web && pnpm check
cd apps/web && pnpm test -- verticalDrama
cd apps/web && pnpm test -- useMenuItems
DATABASE_URL=... npx tsx scripts/seed-vertical-drama-genre-presets.ts
```

## Known Gaps / Backlog

- `VerticalDramaSubShotEditor` is not wired into the stage-card click flow (no backing
  query/mutation for its per-sub-shot edit contract yet).
- No admin CRUD UI for genre presets — today, editing means re-running the seed script or
  direct DB access. **Superseded by section-11**, which adds user-private + admin-published
  preset ownership without a new CRUD screen (reuses the existing series-editing UI's "save as
  preset" action instead).
- Preset library is 36 of the requested "up to 50" — the seed script is easy to extend.
- No dedicated unit tests yet for `generateStoryBible`/`listGenrePresets` or the new UI states.
