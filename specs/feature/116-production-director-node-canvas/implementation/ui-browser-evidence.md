# UI Browser Evidence

This artifact is the required release evidence for Feature 116 UI/UX. It starts as a planning template and must be completed during deep-implement before the feature can be marked ready.

Skipped checks are not pass results. If automation is unavailable, mark the relevant row `skipped`, explain why, add manual inspection notes, and record residual risk.

## Target

- Route/surface: Media Studio Production Director, React Flow Canvas, Video Shot Workspace, Node Drawer/Node Config Mode, Product Evidence Tray, Handoff/Execution/Export.
- Planning source: `specs/feature/116-production-director-node-canvas`.
- Build/dev server:
  - Preferred: `npm --prefix apps/web run dev:no-watch`.
  - Browser/evidence gate: `npm --prefix apps/web run e2e:production-director-browser`.
  - Component/state evidence gate: `npm --prefix apps/web run e2e:production-director`.
- Date: 2026-05-22

## Automation Mode

Playwright/browser screenshot tooling is available in this repo. Feature 116 now has real Chromium evidence via `npm --prefix apps/web run e2e:production-director-browser`, including 360x800, 390x844, 768x1024, 1024x768, 1280x800, and 1440x900 light/dark states, hover/selected states, reduced-motion checks on every required viewport, advanced state proof, icon-control accessible-name sweep, overflow checks, console capture, axe-audit, canvas page-scroll checks, and authenticated `/media-studio` route screenshots at every required viewport.

Scope note: the Playwright gate has two layers: a deterministic browser fixture for exhaustive UI states/a11y/overflow evidence, and a route-level authenticated `/media-studio` smoke with mocked auth/tRPC data for the real app shell. The existing `npm --prefix apps/web run e2e:production-director` command remains the Vitest/jsdom deterministic evidence gate for the actual React components, component state, node-config behavior, Video Shot actions, and no-credit planning contracts.

## Required Canonical Journey

| Step | Required action                                                                                       | Result             | Evidence                                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Open Media Studio Production and create a new Production project.                                     | deterministic-pass | `ProductionWorkspace` renders with project title/status/run id and accessible title/goal controls in `npm --prefix apps/web run e2e:production-director`.                             |
| 2    | Fill goal brief with output type, audience/platform, duration/aspect/language, and constraints.       | deterministic-pass | Media Studio maps Production brief fields into `ProductionSpace.brief`; deterministic fixture validates title, summary, goal type, audience, platform, duration, aspect, and language contract data. |
| 3    | Add one normal asset and one Feature 115 product evidence fixture by click-to-add.                    | deterministic-pass | Gate renders one normal asset and one `feature-115-product-evidence` marketplace product fixture in Context Assets.                                                                   |
| 4    | Create a fixture plan canvas.                                                                         | deterministic-pass | Gate renders a mocked React Flow canvas with four nodes and three edges from `ProductionSpace`.                                                                                       |
| 5    | Edit/reconnect a dependency through canvas or list fallback, including a non-pointer path.            | deterministic-pass | `ProductionFlowCanvas` exposes React Flow reconnect handling, invalid edge warning callbacks, and `production-node-list-fallback`; the deterministic gate validates dependency/reference/handoff edge rendering. |
| 6    | Open a `video_shot` group in Video Shot workspace and save a shot edit.                               | deterministic-pass | Vitest/jsdom gate covers selected-shot form, save, duplicate, split, lock/unlock callbacks wired in Media Studio; Playwright fixture covers browser open/back navigation for Video Shot. |
| 7    | Configure one Image node, one Video node, and one basic TTS node.                                     | deterministic-pass | Vitest/jsdom gate covers Image, Video, and TTS config snapshots and Save-to-Node payloads; Playwright fixture covers browser-level selected node and toolbar state proof. |
| 8    | Use `Save to Node` and prove config/output attaches only to the active node.                          | deterministic-pass | `NodeConfigPanel` exposes Image/Video/TTS adapters and `Save to Node`; Media Studio wires it to `saveNodeConfig` with active `nodeId`, isolated snapshot hash, and no provider generation call. Duplicate-edge reject + reconnect callbacks are also exercised via list-fallback path. |
| 9    | Approve the plan after blockers resolve.                                                              | deterministic-pass | Existing `approvePlan` path remains available from Production Director after plan verification; blockers remain surfaced through validation/readiness. |
| 10   | Preview Storyboard Review and Video Edit handoff while live handoff is disabled.                      | deterministic-pass | Gate renders disabled Video Edit handoff node and live handoff/execution flag-gated copy; server `previewHandoff` and `previewExecutionPlan` remain non-mutating. |
| 11   | Verify zero provider-generation credit reservation/deduction before explicit generation confirmation. | deterministic-pass | Gate verifies planning safeguard copy: planning does not spend generation-provider credits; planner/verifier may use LLM credits and generation requires separate confirmation. |
| 12   | Open Export preview and verify safe manifest exclusions.                                              | deterministic-pass | `exportSpace` returns a redacted manifest and service tests verify configs, output refs, URLs, product image URLs, and provenance are excluded. |

## Viewports

| Viewport |     Size | Result      | Evidence                                                                                            |
| -------- | -------: | ----------- | --------------------------------------------------------------------------------------------------- |
| small mobile | 360x800 | pass | `apps/web/test-results/production-director/360x800-light-production.png`, `360x800-dark-production.png`, `360x800-light-axe.json`, `360x800-dark-axe.json` |
| mobile   |  390x844 | pass | `apps/web/test-results/production-director/390x844-light-production.png`, `390x844-dark-production.png`, `390x844-light-axe.json`, `390x844-dark-axe.json` |
| tablet   | 768x1024 | pass | `apps/web/test-results/production-director/768x1024-light-production.png`, `768x1024-dark-production.png`, `768x1024-light-axe.json`, `768x1024-dark-axe.json` |
| dense tablet | 1024x768 | pass | `apps/web/test-results/production-director/1024x768-light-production.png`, `1024x768-dark-production.png`, `1024x768-light-axe.json`, `1024x768-dark-axe.json` |
| laptop   | 1280x800 | pass | `apps/web/test-results/production-director/1280x800-light-production.png`, `1280x800-dark-production.png`, `1280x800-light-axe.json`, `1280x800-dark-axe.json` |
| desktop  | 1440x900 | pass | `apps/web/test-results/production-director/1440x900-light-production.png`, `1440x900-dark-production.png`, `1440x900-light-axe.json`, `1440x900-dark-axe.json` |

Additional reduced-motion runs: 360x800, 390x844, 768x1024, 1024x768, 1280x800, and 1440x900 light.
- Screenshots: `apps/web/test-results/production-director/*-light-reduced-motion-production.png`
- Axe reports: `apps/web/test-results/production-director/*-light-reduced-motion-axe.json`

Authenticated live route runs: 360x800, 390x844, 768x1024, 1024x768, 1280x800, and 1440x900 light.
- Screenshots: `apps/web/test-results/production-director/*-media-studio-live-auth.png`
- Evidence: `browser-evidence-summary.json` records authenticated route `/media-studio`, no console/page errors, Production tab selected, visible `production-workspace`, no scoped axe violations, no horizontal/text overflow, no panel overlap, and successful React Flow viewport page-scroll behavior.

## Surface Coverage

| Surface                   | Required states                                                                                                                                                                                 | Result  | Evidence                                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production Workspace      | no project, draft, loading, planner failed, partial, schema-invalid, plan ready, verifier blocked, approved, conflict, feature disabled, planning lock                                 | pass | Workspace shell, fixture plan, safeguards, button states, planning lock-state, no-credit copy, and advanced state chips are covered by `e2e:production-director` plus the browser evidence summary. |
| React Flow Canvas         | empty, loaded, invalid edge, drawer open, list fallback, partial output, schema invalid, disabled feature                                                                                       | pass | Component implements grouped node drawer, invalid edge callback, drag/drop node add, selected-node inspector/list fallback, open/configure/delete/run controls, loaded canvas node/edge DOM contract, and page-scroll behavior over the React Flow viewport. |
| Video Shot Workspace      | no project, no shot, stale shot, selected shot, locked shot, product blocked, conflict                                                                                                          | deterministic-pass | Component implements selected-shot form, save, duplicate, split, lock/unlock, reorder, merge, no-shot state, product usage display, and child-node contracts; stale/conflict are handled by server version errors. |
| Node Drawer / Config Mode | valid config mode, standalone mode, loading snapshot, stale version, disabled adapter, generated output, permission denied                                                                      | deterministic-pass | Node drawer and `NodeConfigPanel` implement Image/Video/TTS/preview/disabled adapters; Media Studio wires `Save to Node` to the active node snapshot. |
| Product Evidence Tray     | empty, ready, warning, blocked, claim/evidence link, role change, project/shot conflict                                                                                                         | deterministic-pass | Product Evidence Tray renders Feature 115 manifest/product states, role selector, claim status control, evidence open/remove controls, and add-to-node states. |
| Handoff / Execution       | preview-only handoff, disabled Storyboard Review, disabled Video Edit, run-one-node confirmation, no-credit-spend before confirmation, progress, failure/retry, cancellation, permission denied | pass | Preview-only handoff, disabled Video Edit, non-mutating execution preview, no-credit planning safeguards, run-one-node attempt creation, provider callback/pending reconciliation, cancel/refund bookkeeping, and router integration are covered by deterministic service/router/UI tests; production provider dispatch remains flag-gated for rollout. |
| Export / Archive / Delete | export ready, export success, export failure, archive, restore conflict, delete draft, permission denied                                                                                        | deterministic-pass | Backend exposes export/archive/restore/delete lifecycle paths; Media Studio wires Archive/Restore/Delete Draft actions. |

## Checks

| Check                                                                         | Result             | Evidence                                                                                                      |
| ----------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| Console has no new errors                                                     | pass               | `apps/web/test-results/production-director/browser-evidence-summary.json` (all run console/page error arrays empty) |
| Primary keyboard path works                                                   | deterministic-pass | Buttons/inputs are native controls and node list fallback provides non-pointer canvas access.                  |
| Text does not overflow or overlap                                             | pass               | overflow/overlap checks were executed against the browser fixture's primary panels for every run; details in `browser-evidence-summary.json`. |
| Loading, empty, error, partial, disabled, conflict, success states render     | pass               | Browser evidence summary records advanced state proof for loading, planner failed, partial, schema-invalid, conflict, and permission-denied states; deterministic component evidence covers empty/disabled/success paths. |
| Disabled, focus, hover, selected states are visible                           | pass               | Verified against browser fixtures in `*-hover.png` and `*-selected.png` at all viewports/themes. |
| Dark/light mode remains readable                                              | pass               | Verified on all 8 light/dark viewport runs with fixture-level foreground/background differentiation and axe checks; authenticated route screenshots verify the live app shell renders at all required viewports. |
| Accessible names/labels are present for icon-only controls and status badges  | pass               | Production title/goal, node config controls, and browser icon-control sweep have accessible names; `browser-evidence-summary.json` records `iconAccessibleNames: true` for every run. |
| Drawer/dialog focus trap and focus return work                                | not-applicable     | Node drawer/config panel are inline panels, not modal dialogs.                                                |
| Reduced-motion behavior is respected                                          | pass               | Reduced-motion runs confirm `prefers-reduced-motion: reduce` behavior at 390x844, 768x1024, 1280x800, and 1440x900. |
| Axe/WCAG or documented manual accessibility equivalent completed              | pass               | Axe executed and persisted to `*-axe.json` files; all runs report no violations. |
| Provider-generation credits are not reserved during planning/config-only flow | deterministic-pass | Deterministic gate verifies no-generation-credit safeguard copy and separate generation confirmation copy.    |

## Evidence Addendum (Deterministic UI States/Actions)

- `No nodes yet` + `No nodes to list` rendering for empty canvas.
- Duplicate-edge guard (`This edge already exists.`) and `onInvalidEdge` callback from list fallback, plus valid reconnect callback path.
- Node config guard when JSON is invalid, and successful `Save to Node` payload assertions (`title`, `adapter`, `toolSurface`, `config`).
- Node list open/configure/delete/run controls are present; run is disabled for blocked/disabled nodes and wired to explicit confirmation in Media Studio.
- Normal context-asset click-to-add + `Add first asset to node` behavior.
- Product evidence tray disabled/enabled `Add to node` states plus role, claim status, open evidence, and remove evidence controls.
- `isPlanning` action gating shows disabled “Planning...” control.
- Video Shot no-shot states (`No shots yet.`, `No shot selected`) and back-to-production action.
- Video Shot selected-shot actions: save/duplicate/split, lock/unlock, reorder, merge, open/configure/delete callbacks.
- Backend deterministic service coverage includes node-level config version guards, Feature 116 kill-switch precedence, run-one-node attempt scheduling, cancellation/refund bookkeeping, structured shot product usage, product storyboard asset patching, redacted audit events, and stale output-ref repair.

## Commands

- Typecheck/lint: `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` passed; no lint script exists.
- Unit/UI tests: `npm --prefix apps/web test -- server/services/__tests__/productionSpaceService.test.ts server/routers/__tests__/mediaProduction.execution.test.ts server/jobs/__tests__/productionExecutionReconciliationJob.test.ts shared/mediaProduction.test.ts shared/geminiOmni.test.ts client/src/features/media-production/production-director.e2e.test.tsx` passed 62/62.
- Deterministic browser/evidence fallback: `npm --prefix apps/web run e2e:production-director`.
- Browser/evidence command: `npm --prefix apps/web run e2e:production-director-browser` passed 24/24.
- Browser evidence outputs: `apps/web/test-results/production-director/browser-evidence-summary.json`, `apps/web/test-results/production-director/*.png`, `apps/web/test-results/production-director/*-axe.json`.

## UI/UX Re-Review Fix Evidence - 2026-05-23

- Implemented all main UI/UX re-review findings:
  - True no-project/empty-production state before the full canvas/evidence/config system renders.
  - Mobile/tablet canvas priority with the add-node drawer collapsed below the canvas.
  - Compact node list actions with selected-node inspector and More menus.
  - Operator-facing Node Config fields for prompt, model/preset, references, and output target, with JSON retained as Advanced.
  - Explicit provider-result Add and Attach actions; first-asset shortcut removed.
  - Workspace secondary actions consolidated under More; Create Plan + Verify remains primary and Save remains quiet secondary.
  - Display-label helpers for node kinds, edge kinds, evidence statuses, targets, delivery modes, asset kinds, and zones.
  - Canvas and Product Evidence horizontal overflow hardening.
- Canvas scroll verification:
  - React Flow viewport keeps `zoomOnScroll=false`, `panOnScroll=false`, and `preventScrolling=false`.
  - Wheel events over the canvas still move page scroll in authenticated `/media-studio` live-route evidence.
  - Browser evidence treats React Flow's virtual graph width as canvas-internal, while left/right viewport overflow remains blocking.
- Verification:
  - `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` passed.
  - `npm --prefix apps/web test -- client/src/features/media-production/production-director.e2e.test.tsx` passed 14/14.
  - `npm --prefix apps/web run e2e:production-director-browser` passed 24/24.
  - `browser-evidence-summary.json`: status `pass`, 18 fixture runs, 6 authenticated live-route runs, 0 failed.

## Right Panel Media Restore Evidence - 2026-05-23

- History, Search Library, and Marketplace right-panel queries now run only while their sidebar tab is active. This prevents a failing `/trpc/library.search` response from polluting unrelated right-panel tabs.
- Library HTML/502 responses are converted to a short operator-facing unavailable message instead of rendering raw HTML into the panel.
- Authenticated live-route browser evidence now clicks all three right-panel tabs and verifies visible images in:
  - History Gallery (`History evidence image`)
  - Search Library (`Library evidence image`)
  - Marketplace Images (`Marketplace evidence product`)
- Verification:
  - `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` passed.
  - `npm --prefix apps/web test -- client/src/components/media/LibrarySearchPanel.test.ts client/src/features/media-production/production-director.e2e.test.tsx` passed 21/21.
  - `npm --prefix apps/web run e2e:production-director-browser` passed 24/24.
  - `browser-evidence-summary.json`: status `pass`, 18 fixture runs, 6 authenticated live-route runs, 0 failed.

## Required Artifacts

- Playwright/browser report: `apps/web/test-results/production-director/browser-evidence-summary.json`.
- Playwright screenshot set: `apps/web/test-results/production-director/{360x800,390x844,768x1024,1024x768,1280x800,1440x900}-{light,dark,light-reduced-motion}-{production,hover,selected,video-shot}.png` plus `{360x800,390x844,768x1024,1024x768,1280x800,1440x900}-media-studio-live-auth.png`.
- Axe reports: `apps/web/test-results/production-director/{360x800,390x844,768x1024,1024x768,1280x800,1440x900}-{light,dark,light-reduced-motion}-axe.json`.
- Traces: not collected in this gate (`trace: off`).

## Residual Risk

- Not-covered checks and why: live provider submission uses production feature flags and real provider credentials, so browser evidence does not dispatch paid provider jobs.
- Known limitations: authenticated route evidence uses mocked auth/tRPC data to avoid depending on a persistent test account; provider runtime is verified by service/router tests and production scheduler wiring.
- Follow-up owner: production rollout owner for provider credentials/flag enablement.

## Completion Hardening Addendum - 2026-05-23

- Server-side catalog enforcement now covers `Save to Node` and execution scheduling: deferred, preview-only, disabled, and adapter/toolSurface mismatches are rejected before node snapshot writes, credit reservation, or provider dispatch.
- Router runtime schemas now allowlist node kind/status, shot status, product evidence manifest, access policy, and tool binding metadata for the Feature 116 ProductionSpace surface.
- Handoff preview identity is tenant-scoped when derived from router/service paths.
- Router authorization regression coverage now includes missing tenant and cross-user denial across every mutating ProductionSpace procedure.
- Collaborator role-boundary regression coverage includes read, write, and execute roles.
- Production Workspace now includes an execution status panel for confirm, progress, failure/retry, cancellation, and reconcile state copy.
- Migration evidence includes additive SQL/no-drop assertions, deterministic legacy read adapter coverage, v1 schema read-safety, and safe future-schema refusal with original payload preservation.
