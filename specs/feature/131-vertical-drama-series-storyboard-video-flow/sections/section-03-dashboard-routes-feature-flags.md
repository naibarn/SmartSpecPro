# section-03-dashboard-routes-feature-flags

## Goal

Expose a feature-flagged Dashboard workspace for Vertical Drama Series without changing Article Video Builder, existing Dashboard behavior, or existing Storyboard Review routes.

## Depends On

- section-02-contracts-persistence-assets

## Files

Modify:

- `apps/web/shared/featureFlags.ts`
- tenant feature flag grouping/admin UI files if required by existing tests
- Dashboard/menu constants used by this repo
- route registration file used by this repo

Create:

- `apps/web/client/src/pages/VerticalDramaSeriesPage.tsx`
- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx`
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
- `apps/web/client/src/components/verticalDramaSeries/`
- feature flag/menu/route tests

## Feature Flags

Add rollout-sensitive flags defaulted off:

- `verticalDramaSeries`
- `verticalDramaSeriesDashboardMenu`
- `verticalDramaSeriesSkillChain`
- `verticalDramaSeriesCharacterStock`
- `verticalDramaSeriesMemory`
- `verticalDramaSeriesProductTieIn`
- `verticalDramaSeriesStartFrames`
- `verticalDramaSeriesFirstLastFrameBridge`
- `verticalDramaSeriesStoryboardReviewHandoff`
- `verticalDramaSeriesProviderRouting`
- `verticalDramaSeriesQcRepair`
- `verticalDramaSeriesDialogueAudio`
- `verticalDramaSeriesSubtitles`
- `verticalDramaSeriesSubShots` (opt-in sub-shot decomposition per §7.4/§8.4; default off, fail-closed — with the flag off the video-motion step and its sub-shot editor are unchanged and no sub-shot surface renders)

If existing app naming conventions require aliases such as `verticalDramaSeriesEnabled`, keep the source-spec names as canonical and add a tested one-way mapping so permissions, menu state, router guards, and rollout docs cannot drift. `verticalDramaSeriesSubShots` follows the same canonical-name + one-way-alias rule as every other flag above.

## Routes

Add routes:

- `/dashboard/vertical-drama`
- `/dashboard/vertical-drama/:seriesId`
- `/dashboard/vertical-drama/:seriesId/episodes/:episodeId`
- `/dashboard/vertical-drama/:seriesId/episodes/:episodeId/runs/:runId` (read-only run detail)

All routes require auth and feature access. The nested `runs/:runId` route is read-only and additionally requires ownership of the parent series/episode; it exposes a specific past run's artifact ledger as a directly linkable deep link (never hidden or orphaned).

## UI/UX Contract

### Target User / JTBD

- Role: content creator, marketer, or operator.
- Goal: create/resume vertical drama series and advance episodes through planning, frames, prompts, review, and export.
- Entry point: Dashboard menu.
- Success outcome: create a series shell, open an episode workspace, and see the next safe action.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Dashboard menu | shared menu constants | gated menu item |
| Breadcrumb nav | all `/dashboard/vertical-drama/*` routes | reversible trail: Series › Episode › Storyboard Review (see Breadcrumb / Reversible Nav) |
| Series list | `/dashboard/vertical-drama` | list/create/recent episodes |
| Series detail | `/dashboard/vertical-drama/:seriesId` | tabbed workspace (see Series Workspace Tabs) |
| Episode workspace | `/dashboard/vertical-drama/:seriesId/episodes/:episodeId` | stage cards and approvals |
| Sub-shot editor | episode workspace, video-motion step | flag-gated sub-shot decomposition editor (see Sub-Shot Editor Surface Detail) |
| Run detail (read-only) | `/dashboard/vertical-drama/:seriesId/episodes/:episodeId/runs/:runId` | linkable, read-only past-run artifact ledger |

#### Breadcrumb / Reversible Nav (spec §8.1–8.3)

Every deep route renders a `VerticalDramaBreadcrumb` so that deep-linking into an episode, a workspace tab, or a run is reversible without relying on the browser back button:

| Depth | Breadcrumb trail |
|---|---|
| Series detail | Series |
| Episode workspace | Series › Episode |
| Storyboard Review / Run detail | Series › Episode › Storyboard Review |

The breadcrumb is a `nav` landmark with an accessible name (e.g. `aria-label="Vertical drama breadcrumb"`), each ancestor crumb is a real link to its route, and the current node is marked `aria-current="page"`. This keeps every history surface reachable and lets users step back up the hierarchy from any depth.

#### Series List Surface Detail (spec §8.1)

The Dashboard menu opens to a production workspace that exposes these fields/controls:

| Element | Purpose |
|---|---|
| project search/filter | find/scope series by title or attributes |
| status chips | show each series lifecycle/production status |
| next episode number | show the next episode to work on per series |
| last edited time | surface recency for resume-work prioritization |
| missing approval badges | flag series/episodes blocked awaiting an approval gate |
| product tie-in enabled marker | indicate which series have a product tie-in configured |
| primary create button | start the Create Series Wizard; Thai copy: `สร้างซีรีย์แนวตั้ง` |

#### Create Series Wizard Steps (spec §8.2)

Wizard steps in order, each rendering loading (skeleton while prefill/validation resolves), empty (first-entry defaults with guidance), and error (retryable inline validation/save failure with reason code) states:

| # | Step | Purpose |
|---|---|---|
| 1 | Basic setup | capture title, genre, logline, target episode count, language, target duration |
| 2 | Story setup | capture main plot, season arc, tone, cliffhanger style |
| 3 | Characters | add/import characters, roles, relationships, initial state |
| 4 | Visual bible | generate or upload character references |
| 5 | Product tie-in (optional) | select product, references, placement policy, forbidden claims |
| 6 | Review | confirm memory seed, skill chain, provider mode, credit estimate before create |

Beyond loading/empty/error, each step also has a validation-gated navigation state and the final step has a create lifecycle state:

| Step state | Expected UI |
|---|---|
| next-disabled | `Next` is disabled until that step's required fields pass validation; disabled reason is announced/labeled, not silent |
| next-enabled | `Next` becomes enabled once the step validates, advancing to the next step |
| create-in-progress | on Review confirm, the `Create` action shows an in-progress/pending state and is guarded against double-submit |
| create-success | on success, a confirmation state routes to the new series shell (dry-run, no paid generation) |

The wizard runs in dry-run mode: reaching Review and confirming creates a series shell only and must not trigger paid generation.

#### Series Workspace Tabs (spec §8.3)

The Series detail page is a tabbed workspace exposing all of these tabs:

| Tab | Purpose |
|---|---|
| Overview | series summary and next safe action |
| Bible | story/world bible content |
| Characters | character roster and references |
| Episodes | episode list and per-episode entry to the stage workspace |
| Memory | series memory summary/seed |
| Product Tie-in | product, references, placement policy, forbidden claims |
| Assets | generated/imported media ledger only (not the character roster) |
| Settings | series-level configuration |

**Progressive disclosure (simplicity):** the eight tabs are not all surfaced at once for a fresh/empty series. Default visible tabs are the essentials — `Overview` and `Episodes`. The remaining tabs are grouped and revealed progressively:

| Group | Tabs | Reveal condition |
|---|---|---|
| Essentials | Overview, Episodes | always visible |
| Story | Bible, Characters, Memory | shown once populated, or via a "more" affordance |
| Advanced | Product Tie-in, Assets, Settings | shown once populated, or via a "more" affordance |

A fresh series therefore shows only Overview + Episodes; the Story and Advanced groups appear automatically once their underlying content exists, and remain reachable at any time through an explicit "more" affordance so nothing is permanently hidden.

**Assets tab = media ledger with lineage:** the Assets tab is the generated/imported media ledger only and does not duplicate the character roster (Characters owns the roster). Each asset row exposes its supersede/repair lineage (source → superseded → current) so users can browse an asset's history and see which version is current. Characters and Assets cross-link (a character reference links to its underlying asset row, and an asset row links back to any character it belongs to) rather than duplicating each other.

#### Sub-Shot Editor Surface Detail (spec §7.4, §8.4 step 9)

When `verticalDramaSeriesSubShots` is on, the episode workspace's video-motion step (§8.4 step 9) surfaces an opt-in sub-shot editor that decomposes each main shot into 2-5 quick-cut sub-clips whose durations sum to the parent main-shot duration. It exposes these controls, all visible and editable **before paid generation**:

| Element | Purpose |
|---|---|
| target count selector | set the target sub-shot count per main shot — auto aims for 2-3, raisable up to 4-5 (hard cap 5) |
| per-sub-shot camera setup | view/edit each sub-shot's camera setup (angle/framing/lens feel/movement) |
| per-sub-shot motion prompt | view/edit each sub-shot's motion prompt |
| per-sub-shot duration | view/edit each sub-shot's duration (durations sum to the parent shot duration; each ≥ the anti-choppy floor) |
| per-sub-shot transition | view/edit how each sub-shot follows the prior one (cut / match_cut / smash_cut / continuous) |
| cut-sequence preview | preview the ordered cut sequence for the parent shot before any paid generation |

**Progressive disclosure (simplicity):** the sub-shot editor renders only when `verticalDramaSeriesSubShots` is on (fail-closed). With the flag off, the video-motion step and its surrounding surfaces are unchanged and the editor never mounts. The editor is a planning surface only — it must not trigger paid generation.

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `VerticalDramaSeriesPage` | page | list and create wizard shell | series router |
| `VerticalDramaSeriesDetailPage` | page | tabs, series state, memory summary | series data |
| `VerticalDramaEpisodePage` | page | episode stage workspace | episode run state |
| `VerticalDramaStageCard` | component | stage display and CTA | stage result |
| `VerticalDramaApprovalBar` | component | approval gate actions | approval checkpoint |
| `VerticalDramaBreadcrumb` | component | reversible Series › Episode › Storyboard Review trail (`nav` landmark) | current route/series/episode/run context |
| `VerticalDramaRunDetail` | component | read-only past-run artifact ledger | run detail data |
| `VerticalDramaSubShotEditor` | component | flag-gated sub-shot editor: target count (auto 2-3, raise to 4-5), per-sub-shot camera setup / motion prompt / duration / transition, cut-sequence preview; renders only when `verticalDramaSeriesSubShots` is on (progressive disclosure) | sub-shot plan for the episode's main shots |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | skeleton list/cards | component tests |
| empty | first create-series action | component tests |
| error | retryable message with reason code | component tests |
| success | current stage and next CTA visible | route tests |
| disabled | paid actions disabled until approval | unit tests |
| archived / read-only | for archived series and completed episodes, history surfaces (Episodes, Memory, Assets, Runs) render read-only but stay fully reachable — never hidden or orphaned | component/route tests |
| focus/hover/selected | visible keyboard/focus states | browser evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | single-column, no horizontal overflow | screenshot |
| tablet 768x1024 | list/detail stack or two columns where safe | screenshot |
| desktop 1440x900 | dense workspace with scan-friendly cards | screenshot |
| laptop 1024x768 | action bar reachable | extended screenshot |
| wide-desktop 1280x800 | content remains constrained | extended screenshot |

### Accessibility Acceptance

- Auth/feature-denied states are announced with text.
- Primary actions have accessible names.
- Icon buttons have labels.
- Focus order follows list -> detail -> stage actions.
- Status colors always have text labels.
- The breadcrumb is a `nav` landmark with an accessible name; ancestor crumbs are links and the current node is `aria-current="page"`.

### Copy Contract

- Primary labels in Thai and English.
- Thai menu label: `ซีรีย์แนวตั้ง`.
- English menu label: `Vertical Drama Series`.
- Copy must distinguish planning from paid generation.

### Browser Evidence Required

Capture list, detail, and episode workspace at mobile, tablet, desktop. Include denied/disabled and successful dry-run states.

## Tests First

- Test: flags exist in allowlist and default off.
- Test: canonical source-spec flag names map to any local aliases in one place.
- Test: menu hidden when feature disabled and visible when enabled.
- Test: routes require auth and feature flag.
- Test: existing Article Video Builder routes are unchanged.
- Test: page states render loading, empty, error, success, disabled.
- Test: Thai and English copy keys exist.
- Test: Series list surface renders search/filter, status chips, next episode number, last edited time, missing-approval badges, product tie-in marker, and the `สร้างซีรีย์แนวตั้ง` primary button.
- Test: create series wizard walks steps 1-6 (basic setup, story setup, characters, visual bible, product tie-in, review), renders each step's loading/empty/error states, and completes create in dry-run mode without paid generation (E2E/component).
- Test: series workspace renders all tabs (Overview, Bible, Characters, Episodes, Memory, Product Tie-in, Assets, Settings).
- Test: a fresh/empty series shows only the Overview and Episodes tabs; the Story (Bible, Characters, Memory) and Advanced (Product Tie-in, Assets, Settings) groups appear once populated or via the "more" affordance (spec §8.3).
- Test: `VerticalDramaBreadcrumb` renders a `nav` landmark with an accessible name across all three routes, ancestor crumbs link to their routes (Series › Episode › Storyboard Review), the current node uses `aria-current="page"`, and deep-linking into an episode is reversible (spec §8.1–8.3).
- Test: create series wizard disables `Next` per step until that step's required fields validate (with a labeled disabled reason), and the Review step's `Create` shows in-progress then success states while remaining dry-run (no paid generation) (spec §8.2).
- Test: Assets tab renders the generated/imported media ledger only (not the character roster), each asset row exposes supersede/repair lineage (source → superseded → current), and Characters↔Assets cross-link without duplication (spec §8.3).
- Test: archived series and completed episodes render history surfaces (Episodes, Memory, Assets, Runs) read-only while keeping them fully reachable (not hidden/orphaned).
- Test: `/dashboard/vertical-drama/:seriesId/episodes/:episodeId/runs/:runId` requires auth + feature + ownership and renders a read-only past-run artifact ledger as a directly linkable deep link.
- Test: `verticalDramaSeriesSubShots` exists in the allowlist, defaults off, and maps its canonical source-spec name to any local alias in the one-way mapping alongside the other flags.
- Test: the `VerticalDramaSubShotEditor` is hidden when `verticalDramaSeriesSubShots` is off (video-motion step unchanged, editor not mounted) and visible when the flag is on, exposing target count (auto 2-3, raise up to 4-5), per-sub-shot camera setup / motion prompt / duration / transition, and the cut-sequence preview before paid generation (spec §7.4, §8.4 step 9).

## Implementation Tasks

1. Add canonical feature flags and admin grouping if needed.
2. Add alias mapper only if existing feature-flag conventions require different runtime names.
3. Add menu entry and routes.
4. Build list/detail/episode page shells.
5. Add dry-run create-series CTA.
6. Add stage cards and approval bar placeholders wired to mock/router data.
7. Add responsive and accessibility-friendly states.
8. Add `VerticalDramaBreadcrumb` (`nav` landmark) across all three routes for reversible deep-linking.
9. Add progressive-disclosure grouping (Essentials / Story / Advanced) with a "more" affordance to the workspace tabs.
10. Add per-step `Next` validation gating and Review `Create` in-progress/success states to the wizard.
11. Wire Assets tab to the media ledger with per-row supersede/repair lineage and Characters↔Assets cross-links.
12. Add the read-only `runs/:runId` route/page (`VerticalDramaRunDetail`) with auth + feature + ownership guards, plus read-only archived/completed history surfaces.

## Acceptance

- User can create a series shell in dry-run mode from Dashboard.
- No paid generation is triggered from the initial UI.
- Existing media/dashboard flows are unchanged when flags are off.
- Archived series and completed episodes expose their history surfaces (Episodes, Memory, Assets, Runs) as read-only and fully reachable — never hidden or orphaned.
- A specific past run is directly linkable at `/dashboard/vertical-drama/:seriesId/episodes/:episodeId/runs/:runId` (read-only, auth + feature + ownership enforced).

## Verification

```bash
cd apps/web && pnpm test -- verticalDrama
cd apps/web && pnpm check
```
