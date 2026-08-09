# VD episode "ขั้นสูง" section — inner content (model pickers) appears intermittently

Reported 2026-08-03 on `smartaihub.app/drama-series/22/episodes/162`:
expanding **ขั้นสูง** sometimes shows the inner controls (image/video model
pickers, prompt-language/mode selects, resolution selects) and sometimes shows
nothing. Non-deterministic — "บางครั้งก็ขึ้นปกติ".

## Where that content lives

The image/video model pickers are NOT in the workspace's advanced disclosure —
they live inside `VerticalDramaStoryboardPanel`'s `StoryboardMetaSection`
(`VerticalDramaStoryboardPanel.tsx:2665`), whose `open` is driven by
`advancedMetaOpen`, wired from the workspace's `advancedStagesOpen`
(`VerticalDramaEpisodeWorkspace.tsx:1550`). The row itself is at
`VerticalDramaStoryboardPanel.tsx:2745` and is rendered unconditionally as long
as any of the `onSelect*` callbacks is wired — and the page wires all of them
unconditionally (`VerticalDramaEpisodePage.tsx:6082-6105`). So the row is never
"conditionally missing": either the whole meta section is collapsed, or the
model list it renders is empty.

That gives exactly two failure paths, both confirmed in code.

## Root cause 1 — the whole page unmounts on a transient refetch failure

`VerticalDramaEpisodePage.tsx:5655`

```ts
if (seriesQuery.isError) {
  return <Card>…error…</Card>;
}
```

`seriesQuery` is `verticalDramaSeries.get` with `staleTime: 30_000`, so it
refetches on window focus / remount. In TanStack Query v5 a **failed background
refetch sets `status: "error"` even when `data` is still present**. One blip —
web service restart (4 restarts in the last 3 days per `journalctl`), a 5xx, a
tunnel hiccup — and the entire page is replaced by the error card. That
**unmounts `VerticalDramaEpisodeWorkspace`**, destroying its local
`advancedStagesOpen` state. On the next successful fetch the workspace remounts
**collapsed**.

From the user's seat: the section was open, then a moment later it isn't; click
to expand, and shortly after it is closed again. Unpredictable, because it is
driven by network luck.

## Root cause 2 — the open-state restore clobbers the user's click

`VerticalDramaEpisodeWorkspace.tsx:1131-1139`

```ts
useEffect(() => {
  if (!productionWizardEnabled || !advancedStagesStorageKey || …) return;
  setAdvancedStagesOpen(safeStorageGet(advancedStagesStorageKey) === "true");
}, [productionWizardEnabled, advancedStagesStorageKey]);
```

`productionWizardEnabled` is `Boolean(episodeDetailQuery.data?.flags?.productionWizard)`
(`VerticalDramaEpisodePage.tsx:6311`) — it is `false` until `getEpisodeDetail`
resolves (0.5–1s typical, and this box logs tRPC calls up to 120s in
`logs/debug/trpc-slow.jsonl`), then flips to `true`. Every `false → true`
transition re-runs this effect and **overwrites whatever the user just did**
with the localStorage value.

The persisted value is also best-effort only: `safeStorageSet`
(`VerticalDramaEpisodeWorkspace.tsx:908`) swallows `QuotaExceededError` by
design. When the origin's localStorage is full — a known recurring condition on
these VD pages — the "true" never lands, so every restore resolves to
**closed**.

Amplifies root cause 1: each remount restores a value that may never have been
written.

## Root cause 3 — `mediaModels.list` reports failure as an empty list, HTTP 200

`apps/web/server/routers/mediaModels.ts:1178-1183`

```ts
} catch (error: any) {
  console.warn("[MediaModels] Public list query failed:", error.message);
  return { models: [], providers: [] };
}
```

A DB timeout / pool exhaustion / any thrown error becomes a **successful empty
response**. The client sees `isLoading: false`, `isError: false`,
`data.models: []` — indistinguishable from "this tenant has no models". TanStack
caches it and does not retry, because nothing failed.

Downstream (`VerticalDramaStoryboardPanel.tsx:3054-3075`) the picker dialog then
opens with nothing to choose, and the amber "you must pick a model" notices
appear — matching "ปกติต้องมีให้เลือก model … แต่ไม่แสดง". 17 client call sites
share this procedure, so all of them degrade silently the same way.

## Fixes

| # | File | Change |
|---|---|---|
| 1 | `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx:5655` | Only show the fatal error card when there is no series data yet (`seriesQuery.isError && !seriesQuery.data`), so a failed background refetch no longer unmounts the workspace. |
| 2 | `apps/web/client/src/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace.tsx:1131` | Restore the disclosure state **once per series key** (ref guard) instead of on every `productionWizardEnabled` transition, so the flag landing can't undo a click. |
| 3 | `apps/web/server/routers/mediaModels.ts:1178` | Rethrow as a tRPC error instead of returning `{models: [], providers: []}`, so a failed query is retried and surfaced rather than rendering as "no models". |

## Risk

- Fix 1: strictly narrows when the error card renders. A genuine "series not
  found" still has no `data`, so it still shows.
- Fix 2: behaviour identical on first load; only stops the redundant re-restore.
- Fix 3: widest blast radius (17 call sites), but every one of them currently
  mis-renders a failure as "empty catalog". Turning it into a real error lets
  TanStack's retry recover it and lets each UI show its loading/error state.
  No change on the success path.

## Verification

- `cd apps/web && pnpm vitest run` for the touched suites.
- `pnpm check` for the touched files' type errors (repo has a large pre-existing
  red baseline — compare fail-set identity, not count).
- Manual: open a VD episode, expand ขั้นสูง, confirm the model pickers render and
  survive a window blur/focus cycle.

## Round 2 — full sweep of the same defect classes

### Class A: `if (query.isError) return <ErrorCard/>` — 7 more sites

The same guard was applied everywhere the pattern appears. Each one replaced a
whole panel/page (destroying local state below it) on a **failed background
refetch**, even with cached `data` present:

| File | Query |
|---|---|
| `components/videoStudio/RenderPanel.tsx:111` | `compileQuery` |
| `components/verticalDramaSeries/VerticalDramaSeriesMemoryTab.tsx:151` | `memoryQuery` |
| `components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx:4255` | `listQuery` |
| `components/verticalDramaSeries/VerticalDramaArcReplanCard.tsx:218` | `memoryQuery` |
| `components/verticalDramaSeries/VerticalDramaLocationStockPanel.tsx:901` | `listQuery` |
| `components/verticalDramaSeries/VerticalDramaAssetsTab.tsx:78` | `assetsQuery` |
| `pages/AgencyTemplates.tsx:75` | `templatesQuery` |

(`pages/PresentationEditor.tsx:3718` also reads `isError`, but as an effect
fallback, not a render takeover — left alone.)

### Class B: `catch → return empty` in `mediaModels.ts` — 4 more sites

`list` (admin), `templates`, `stats` and `providers` all turned a thrown DB
error into an empty/zero result with HTTP 200. All now throw `TRPCError`. This
class is directly implicated in the earlier MCP model-prune incident: an admin
staring at a silently-empty catalog is one click from "fixing" a catalog that
was never broken.

### Class C: localStorage quota — new `client/src/lib/safeLocalStorage.ts`

Six files each carried an identical private `safeStorageGet`/`safeStorageSet`
pair that swallowed `QuotaExceededError` and moved on. Correct as far as "must
not throw", but it meant that once the origin filled up, **no preference was
ever remembered again** — while each page load kept restoring the stale value
still on disk. That is the "keeps forgetting / randomly resets" behaviour.

The shared module keeps the no-throw contract and adds recovery: every write is
recorded in an `ssp:pref-index` write-order index, and on a quota failure the
least-recently-written **tracked** keys are evicted and the write retried.
Eviction can only ever touch keys this module itself wrote — auth tokens and
drafts are never candidates. `safeStorageSet` now returns `boolean` so callers
that care can distinguish "remembered" from "could not remember".

Migrated: `VerticalDramaShell`, `VerticalDramaCharacterReferencePanel`,
`VerticalDramaEpisodeWorkspace`, `VerticalDramaLocationStockPanel`,
`VerticalDramaCharacterStockPanel`, `VerticalDramaEpisodePage`.

Covered by `client/src/lib/__tests__/safeLocalStorage.test.ts` (6 tests). Note
the pre-existing quota tests in the VD suites patch
`window.localStorage.setItem` on the **instance**, which jsdom ignores — they
assert "does not throw" and pass without ever entering the failure path. The new
tests patch `Storage.prototype` so the eviction path is genuinely exercised.

## Verification (round 2)

- `npx tsc --noEmit`: zero errors in all 13 touched files.
- `npx vitest run` over the VD component suites + VD pages + RenderPanel +
  mediaModels + the new lib test: **9 files / 31 tests failing — byte-identical
  to the pre-existing baseline**, 1316 passing (up 6). Every failure is Thai
  copy drift ("ตอน" vs "ตอนย่อย", native-audio wording) in files this work never
  touched.
- Baseline proof for the one overlap: `VerticalDramaArcReplanCard.test.tsx` was
  re-run against its unmodified HEAD version — same 4 failures.

## Round 3 — residual cached-refetch sweep

The full client sweep found one additional panel with the same state-loss
pattern that was not listed in Round 2:

| File | Query | Status |
|---|---|---|
| `components/verticalDramaSeries/VerticalDramaProductionEpisodesPanel.tsx:478` | `detailQuery` | Fixed: cached `data.series` now remains renderable after a background refetch error; only a response with no usable series shows the fatal card. |

## Verification (round 3)

- Focused run: **10/11 suites passed, 71/75 tests passed**. The four failures
  are the known Thai-copy baseline drift in `VerticalDramaArcReplanCard.test.tsx`
  (`ตอน`/`ตอนย่อย` and related wording); no failure is from the residual guard.
- `pnpm check`: exit 2 from the repository-wide baseline; **55 TypeScript
  errors**, with no error in the plan's touched files or the residual panel.
- `git diff --check`: clean for the touched implementation paths.
- Manual browser/window-focus verification remains external and was not run in
  this turn.

## Round 4 — complete the catalog error surface and preference sweep

The remaining intermittent-looking path was the model-picker UI itself: after
the server began surfacing real tRPC failures, picker dialogs still rendered
the same empty state without explaining the failure or offering recovery.

Implemented:

- `ModelSelectorDialog` now shows a non-fatal load-error alert with Retry and
  keeps cached model rows visible while a refetch is failing.
- Wired image/video catalog error and retry state from
  `VerticalDramaEpisodePage` through `VerticalDramaEpisodeWorkspace` into the
  storyboard advanced section, plus the character/location stock pickers.
- Added a server regression test proving a public catalog DB failure becomes
  `INTERNAL_SERVER_ERROR`, not an empty HTTP 200 result.
- Migrated the storyboard Location Visual Bible model preference and trailer
  voice preference to the shared quota-recovering `safeLocalStorage` helper.
- Fixed the residual `VerticalDramaProductionEpisodesPanel` guard so cached
  episode detail remains mounted after a failed background refetch.

## Verification (round 4)

- Focused affected run: **13/13 suites passed, 88/88 tests passed**. The stale
  Thai-copy assertions in `VerticalDramaArcReplanCard.test.tsx` were synced to
  the component's current `ตอนย่อย` copy contract.
- `pnpm check`: exit 2 from the repository-wide baseline; **43 TypeScript
  errors**, with no error in the plan's touched files.
- `pnpm build`: passed for the web bundle and widget bundle.
- `git diff --check`: clean for the touched implementation paths.
- Manual authenticated browser/window-focus verification remains external and
  was not run in this turn.
