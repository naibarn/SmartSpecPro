# UI/UX Re-Review Report - 2026-05-23

## Scope
- Route/surface: Media Studio Production Director, ProductionWorkspace, React Flow canvas, Context Asset board, Node Config panel.
- Files reviewed:
  - `apps/web/client/src/pages/MediaStudio.tsx`
  - `apps/web/client/src/features/media-production/components/ProductionWorkspace.tsx`
  - `apps/web/client/src/features/media-production/components/ProductionFlowCanvas.tsx`
  - `apps/web/client/src/features/media-production/components/ContextAssetBoard.tsx`
  - `apps/web/client/src/features/media-production/components/NodeConfigPanel.tsx`
  - `apps/web/tests/e2e/production-director-browser.spec.ts`
- Evidence reviewed:
  - `apps/web/test-results/production-director/browser-evidence-summary.json`
  - `apps/web/test-results/production-director/1440x900-media-studio-live-auth.png`
  - `apps/web/test-results/production-director/1024x768-media-studio-live-auth.png`
  - `apps/web/test-results/production-director/360x800-media-studio-live-auth.png`
  - `apps/web/test-results/production-director/1440x900-light-production.png`

## Verdict
- UX: PASS_AFTER_FIX_PASS
- Accessibility: PASS
- Responsive: PASS
- Browser evidence: PASS

Automated evidence is strong after the fix pass: summary status is `pass`, with 18 fixture runs, 6 authenticated live-route runs, 0 failures, no scoped axe violations, no horizontal/text overflow, no overlap, and canvas page-scroll passing. The prior product UX, hierarchy, density, and operator workflow findings are closed below.

## Fix Pass Status

All main findings from this re-review have been implemented in the 2026-05-23 fix pass:

- True no-project/empty-production state now gates the full workspace until there is useful project context.
- Mobile/tablet canvas priority is restored by rendering the canvas before a collapsed add-node drawer.
- Node list action density is reduced with compact row actions plus a More menu.
- Node Config now has operator-facing prompt, model/preset, references, and output target fields; JSON remains advanced.
- Provider search results now expose explicit Add and Attach actions; the first-asset shortcut was removed.
- Workspace secondary commands are grouped under More, with Create Plan + Verify as primary and Save as quiet secondary.
- Display-label mappers now cover node kinds, edge kinds, evidence statuses, targets, delivery modes, asset kinds, and zones.
- Canvas and Product Evidence surfaces were hardened against horizontal overflow while preserving React Flow page-scroll behavior.

Verification after the fix pass:

- `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` passed.
- `npm --prefix apps/web test -- client/src/features/media-production/production-director.e2e.test.tsx` passed 14/14.
- `npm --prefix apps/web run e2e:production-director-browser` passed 24/24; summary status `pass`, 18 fixture runs, 6 authenticated live-route runs, 0 failed.

## Findings

| Severity | Area | Finding | File/Surface | Recommended Fix |
|---|---|---|---|---|
| HIGH | UX/state | Empty/no-project state still renders the full production system instead of guiding the operator to create/open/select a project. The live route shows blank title/goal, 0 shots/assets/evidence, full canvas, Node Config, Safeguards, and an empty right rail all at once. | `ProductionWorkspace.tsx`, `MediaStudio.tsx`, live screenshots | Add a purposeful empty state when no real `productionRunId`/goal exists: compact brief card + Create Plan/Open Project/New Project, hide or collapse canvas/evidence/config until the project has enough context. |
| MEDIUM | Responsive | On 360x800 and 1024x768, the Node Drawer comes before the canvas and consumes much of the first canvas section, pushing the actual canvas below the fold. This makes the primary object of the feature feel secondary. | `ProductionFlowCanvas.tsx:222-249`, `360x800-media-studio-live-auth.png`, `1024x768-media-studio-live-auth.png` | On mobile/tablet, put the canvas first and move Node Drawer into a collapsed drawer/sheet/accordion; keep only a compact Add Node button above the canvas. |
| MEDIUM | UX/action hierarchy | Node Inspector still repeats a full action wall per node: Open, Configure, Run, Delete, Start link, Connect here. This scales poorly when the node count grows and competes with the selected-node inspector. | `ProductionFlowCanvas.tsx:316-452` | Use a compact table/list with one row click plus a small kebab/action menu. Keep Configure/Run in selected inspector, make link mode a single toolbar state, and move Delete to overflow/destructive confirmation. |
| MEDIUM | UX/form completeness | Node Config moved JSON into Advanced, but the operator-facing form is still only explanatory copy. Save still depends on JSON parsing, so normal operators cannot truly configure prompt/model/reference/output fields without Advanced JSON. | `NodeConfigPanel.tsx:131-176` | Add adapter-specific fields for at least prompt, model/settings, references, output target, and validation. Generate config JSON from those fields; keep JSON as override/diagnostic only. |
| MEDIUM | UX/action clarity | Context Asset provider search results still perform multiple actions on one click: add provider asset, add to canvas, and assign to selected node. The bottom shortcut also remains a first-asset action that can attach the wrong asset. | `ContextAssetBoard.tsx:117-125`, `ContextAssetBoard.tsx:224-239` | Split provider result actions the same way as normal assets: Add to canvas / Attach to selected node. Remove the first-asset shortcut or replace it with explicit selected-asset state. |
| MEDIUM | Visual hierarchy | The top workspace has many same-weight bordered buttons and cards. Even after the primary button improvement, Save/Search/New/Open/Manage have equal visual weight and wrap into a command cluster that dominates the brief area. | `ProductionWorkspace.tsx:361-411`, live screenshots | Group secondary actions into one toolbar/menu: Save as quiet secondary, Search/New/Open Video Shot in a compact menu, lifecycle actions in Manage. Reserve button density for after a project exists. |
| LOW | Copy/localization | Machine/internal terms still leak into the user-facing UI: `goal_brief`, `not_loaded`, `storyboard_review, video_edit`, `single_shot`, mixed English in Thai strings, and `Node Drawer`. | `ProductionWorkspace.tsx`, `ProductionFlowCanvas.tsx`, `ProductEvidenceTray.tsx`, screenshots | Add display-label mappers for node kinds, evidence status, target names, delivery modes, and edge kinds. Extend Thai glossary for node/canvas/adapter/target terms. |
| LOW | Visual polish | Many surfaces use the same white-card + border + small label treatment, creating a long stack of similar cards with weak scan hierarchy. The right rail also looks empty and low-value when history is empty. | Live screenshots | Use section bands and stronger grouping: brief/planning as one compact top section, canvas as the primary work area, evidence/config as contextual side panels. Hide or collapse empty right rail content until useful. |
| LOW | Accessibility/interaction | The Manage menu uses native `details` but behaves like a dropdown. It does not close on outside click/escape and may be awkward for repeated keyboard use. | `ProductionWorkspace.tsx:384-410` | Replace with the app's dropdown/menu primitive if available, or add close behavior and menu semantics. |

## State Coverage

| State | Covered | Notes |
|---|---|---|
| loading | yes | Covered by component state and evidence. |
| empty | partial | Empty state exists technically, but no-project/empty-production UX is too noisy. |
| error | yes | JSON and canvas warnings have semantics. |
| success | partial | Ready states exist, but user-facing success/progress hierarchy remains dense. |
| disabled/focus/hover/selected | yes | Automated evidence passes; recommended improvements are hierarchy, not basic a11y. |

## Viewport Coverage

| Viewport | Result | Evidence |
|---|---|---|
| mobile 390x844 | pass | Browser evidence summary and screenshots. |
| tablet 768x1024 | pass | Browser evidence summary and screenshots. |
| desktop 1440x900 | pass | Browser evidence summary and screenshots. |
| small-mobile 360x800 | pass with UX findings | Canvas priority and long stacked workflow need improvement. |
| laptop 1024x768 | pass with UX findings | Canvas drawer consumes vertical priority. |
| wide-desktop 1280x800 | pass | Browser evidence summary and screenshots. |

## Required Follow-Up
- Blocking fixes: none from automated evidence or accessibility gate.
- Recommended fixes: all main recommendations from this report are completed in the 2026-05-23 fix pass.
- Skipped checks and why:
  - None after the fix pass; Playwright browser evidence was rerun and passed 24/24.
