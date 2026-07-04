# Wave 1 Contracts — Vertical Drama Series Audit

All 4 Wave 1 agents are **read-only** (Explore-type investigation, no file writes).
No ownership conflicts are possible since nothing is written. Contract is limited to
topic boundaries so agents don't duplicate each other's reading.

## Ownership / topic boundaries

| Agent | Topic | Primary files to read |
|---|---|---|
| agent-A | Overview tab vs Episodes tab relationship + Story Bible concept/status (items 1, 2) | `VerticalDramaSeriesDetailPage.tsx`, `StoryBibleOverviewCard` (wherever it lives), `verticalDramaStoryBible.ts` service, `verticalDramaSeries.ts` router (`generateStoryBible`), spec `section-10-ui-redesign-genre-presets-story-generation.md`, `spec.md` §8 |
| agent-B | Character carryover bug (item 3) | `CreateSeriesWizard.tsx` (characters step + create payload), `verticalDramaSeries.ts` router (`create`, `parseCharactersDraft`), Characters tab component in `VerticalDramaSeriesDetailPage.tsx` or a dedicated `VerticalDrama*Characters*` component, `drizzle/schema.ts` (series `characters`/`bible` jsonb columns) |
| agent-C | Last 3 tabs completeness: Product tie-in, Assets, Settings (item 4) | `VerticalDramaSeriesDetailPage.tsx` tab render bodies for these 3 tabs, any backing tRPC procedures they call |
| agent-D | Storyboard generation + character image generation (items 5, 6) | `VerticalDramaEpisodeWorkspace.tsx`, episode pipeline stage list/config, `VerticalDramaCharacterStockPanel.tsx`, any character reference-image mutation/service, spec sections describing storyboard/character-image stages |

## Test boundary
N/A — read-only investigation, no code changes, no gate commands beyond agents citing
file:line evidence for every claim.

## Impact boundary
N/A — no writes in Wave 1. Wave 2 (if any) will be scoped after Wave 1 findings land,
most likely limited to a single-file fix for item 3 if root cause is clear and small.

## Wave 2 — parallel fixes (disjoint files, no shared contract needed)

| Agent | Owns | Contract |
|---|---|---|
| ssp-backend | apps/web/server/routers/verticalDramaSeries.ts (create mutation only) | N/A — solo backend fix, no frontend consumer contract change (existing verticalDramaCharacters.listCharacters shape is unchanged, only new rows are inserted) |
| ssp-frontend | apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx (StoryBibleOverviewCard copy only) | N/A — solo copy/label change, no data shape change |

dispatch_mode: parallel_batch (no worktree needed — disjoint files, no merge risk)
writer_count: 2
merge_owner: conductor (no merge needed — disjoint files)

## Wave 3 Contract — Settings / Product tie-in / Assets tabs

### Shared Interface
1. `verticalDramaSeries.updateSeries` — extend existing Zod input (`updateSeriesInput`, currently
   title/status/bible/policy only) to also accept `productTieIn: z.record(z.string(), z.unknown()).optional()`,
   patched the same way as the existing optional fields (`if (input.productTieIn !== undefined) updates.productTieIn = input.productTieIn`).
   Response shape unchanged: `{ series: {...row, id: string} }`.
2. NEW `verticalDramaSeries.listSeriesAssets` query — input `{ seriesId: z.string() }`, reads
   `verticalDramaCharacterAssets` (schema.ts:12893) LEFT JOIN `verticalDramaCharacters` (for character name)
   and `verticalDramaRunArtifacts` (schema.ts:12982) for the given seriesId (ownership-scoped via
   existing `loadOwnedSeries`/`seriesOwnershipWhere` helpers already used by `updateSeries`), returns:
   `{ characterAssets: Array<{id: string, characterId: string|null, characterName: string|null, mediaAssetId: string|null, assetType: string, role: string|null, approved: boolean, qcStatus: string, createdAt: string}>, runArtifacts: Array<{id: string, episodeId: string, stage: string, storageKey: string|null, mediaAssetIds: number[], createdAt: string}> }`

### Ownership Boundaries
| File | Owner |
|------|-------|
| apps/web/server/routers/verticalDramaSeries.ts | ssp-backend |
| apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx | ssp-frontend |
| apps/web/client/src/components/verticalDramaSeries/VerticalDramaSettingsTab.tsx (new) | ssp-frontend |
| apps/web/client/src/components/verticalDramaSeries/VerticalDramaProductTieInTab.tsx (new) | ssp-frontend |
| apps/web/client/src/components/verticalDramaSeries/VerticalDramaAssetsTab.tsx (new) | ssp-frontend |

### Test Boundary
- backend: `cd apps/web && npx tsc --noEmit`
- frontend: `cd apps/web && npx tsc --noEmit`

### Impact Boundary
- `updateSeries` response shape: unchanged (in-scope-now, no other consumer breaks)
- `PlaceholderTab` component: still used by nothing after this wave for these 3 tabs, but left
  intact (may still be referenced elsewhere) — out-of-scope to remove it, just stop using it for
  product/assets/settings

dispatch_mode: parallel_batch (disjoint files — backend touches only the router, frontend touches
only client files)
writer_count: 2
merge_owner: conductor
