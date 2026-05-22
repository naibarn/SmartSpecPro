# UI Browser Evidence

This artifact is the required release evidence for Feature 116 UI/UX. It starts as a planning template and must be completed during deep-implement before the feature can be marked ready.

Skipped checks are not pass results. If automation is unavailable, mark the relevant row `skipped`, explain why, add manual inspection notes, and record residual risk.

## Target

- Route/surface: Media Studio Production Director, React Flow Canvas, Video Shot Workspace, Node Drawer/Node Config Mode, Product Evidence Tray, Handoff/Execution/Export.
- Planning source: `specs/feature/116-production-director-node-canvas`.
- Build/dev server:
  - Preferred: `npm --prefix apps/web run dev:no-watch`.
  - Browser gate: add or identify a deterministic command such as `npm --prefix apps/web run e2e:production-director`.
- Date:

## Required Canonical Journey

| Step | Required action | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Open Media Studio Production and create a new Production project. | pending |  |
| 2 | Fill goal brief with output type, audience/platform, duration/aspect/language, and constraints. | pending |  |
| 3 | Add one normal asset and one Feature 115 product evidence fixture by click-to-add. | pending |  |
| 4 | Create a fixture plan canvas. | pending |  |
| 5 | Edit/reconnect a dependency through canvas or list fallback, including a non-pointer path. | pending |  |
| 6 | Open a `video_shot` group in Video Shot workspace and save a shot edit. | pending |  |
| 7 | Configure one Image node, one Video node, and one basic TTS node. | pending |  |
| 8 | Use `Save to Node` and prove config/output attaches only to the active node. | pending |  |
| 9 | Approve the plan after blockers resolve. | pending |  |
| 10 | Preview Storyboard Review and Video Edit handoff while live handoff is disabled. | pending |  |
| 11 | Verify zero provider-generation credit reservation/deduction before explicit generation confirmation. | pending |  |
| 12 | Open Export preview and verify safe manifest exclusions. | pending |  |

## Viewports

| Viewport | Size | Result | Evidence |
| --- | ---: | --- | --- |
| mobile | 390x844 | pending |  |
| tablet | 768x1024 | pending |  |
| laptop | 1280x800 | pending |  |
| desktop | 1440x900 | pending |  |

## Surface Coverage

| Surface | Required states | Result | Evidence |
| --- | --- | --- | --- |
| Production Workspace | no project, draft, loading, planner failed, partial, schema-invalid, plan ready, verifier blocked, approved, conflict, feature disabled | pending |  |
| React Flow Canvas | empty, loaded, invalid edge, drawer open, list fallback, partial output, schema invalid, disabled feature | pending |  |
| Video Shot Workspace | no project, no shot, stale shot, selected shot, locked shot, product blocked, conflict | pending |  |
| Node Drawer / Config Mode | valid config mode, standalone mode, loading snapshot, stale version, disabled adapter, generated output, permission denied | pending |  |
| Product Evidence Tray | empty, ready, warning, blocked, claim/evidence link, role change, project/shot conflict | pending |  |
| Handoff / Execution | preview-only handoff, disabled Storyboard Review, disabled Video Edit, run-one-node confirmation, no-credit-spend before confirmation, progress, failure/retry, cancellation, permission denied | pending |  |
| Export / Archive / Delete | export ready, export success, export failure, archive, restore conflict, delete draft, permission denied | pending |  |

## Checks

| Check | Result | Evidence |
| --- | --- | --- |
| Console has no new errors | pending |  |
| Primary keyboard path works | pending |  |
| Text does not overflow or overlap | pending |  |
| Loading, empty, error, partial, disabled, conflict, success states render | pending |  |
| Disabled, focus, hover, selected states are visible | pending |  |
| Dark/light mode remains readable | pending |  |
| Accessible names/labels are present for icon-only controls and status badges | pending |  |
| Drawer/dialog focus trap and focus return work | pending |  |
| Reduced-motion behavior is respected | pending |  |
| Axe/WCAG or documented manual accessibility equivalent completed | pending |  |
| Provider-generation credits are not reserved during planning/config-only flow | pending |  |

## Commands

- Typecheck/lint:
- Unit/UI tests:
- Browser/screenshot:
- Manual notes:

## Required Artifacts

- Playwright/browser report:
- Mobile screenshots:
- Tablet screenshots:
- Laptop screenshots:
- Desktop screenshots:
- Traces:
- Accessibility report:
- Visual regression snapshots:

## Residual Risk

- Skipped checks and why:
- Known limitations:
- Follow-up owner:
