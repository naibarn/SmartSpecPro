# Section 07 — Mockup-led UI state integration

## Objective

Extend the current Builder/Subflow/Library/Marketplace/Run shell to project all
server states without changing the supplied mockup composition.

## Dependencies and ownership

- Depends on Sections 02–06 API/query contracts.
- Owns client queries/mutations, state rendering, responsive/accessibility
  behavior, copy and browser evidence.
- Does not invent client-side execution truth.

## Editor Interaction Contract

The existing static node cards and placeholder buttons are not accepted as an
editor implementation. Reuse the installed `@xyflow/react` and existing graph
patterns from `KnowledgeCanvasPanel.tsx`/`ProductionFlowCanvas.tsx` while
preserving the supplied mockup composition.

- Model the canvas as typed nodes/edges with stable IDs, persisted positions,
  viewport, selected item, graph revision and dirty/save state.
- Support node select, drag, keyboard nudge, add, duplicate, delete and
  undo/restore. Drag-stop must update the graph draft and survive reload.
- Support typed handle connections, connection preview, arrowed edges,
  relink/select/delete, and reject self-links, incompatible ports and cycles
  before mutation with an inline reason.
- Render an editable schema-driven Properties inspector for every node kind,
  including label, capability/configuration, ports, bindings, retry/timeout,
  approval policy and output mapping where applicable.
- Persist changes through an authorized `saveDraft`/`updateDraft` contract with
  expected revision and dirty/saving/saved/conflict/error states.
- Every visible action (tabs, search, open, publish, run, add note, canvas
  settings, Improve with AI and drawer actions) must execute a command or be
  disabled with an explicit reason. Enabled no-op buttons are a failure.

### Interaction acceptance matrix

| Interaction | Acceptance |
|---|---|
| Node drag/keyboard nudge | Position changes in graph state and persists after reload |
| Edge connect/delete/relink | Valid typed edge is visible, selectable and persisted; invalid edge is rejected |
| Properties edit | Correct node changes, validates and saves; invalid fields block Publish/Run |
| Add/duplicate/delete | Graph, inspector and edges remain consistent with undo/recovery |
| Publish/Run/Open | Real mutation/query/preflight result is shown; no local success claim |
| Tabs/search/settings/debug | Each enabled control changes route/query/panel or has a disabled reason |

## UI/UX Contract

### Target User / JTBD

- Authenticated creator/operator entering from Dashboard.
- Understand readiness/cost/access, run a Workflow Version, approve/recover
  it and inspect safe results.

### Existing Pattern Reference

Reuse `WorkflowStudioPage.tsx`, `AppPage`, shadcn/Radix primitives, existing
Marketplace filters/cards and Worker Jobs timeline/status patterns. Diverge only
for version-bound dependency, checkpoint, approval and artifact panels.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Builder | `/studio/workflow` | server-backed save/compile/readiness |
| Subflow | builder mode | binding/run-from/checkpoint controls |
| Library/Marketplace | same shell | detail/preflight/invoke states |
| Run/Mini App | `/studio/workflow/run` | mode, quote, status, controls and results |
| Debug Drawer | Builder/Run | canonical Output/Data/Trace/Logs/Artifacts/Cost/Errors |

### Component Map

`WorkflowCatalog`, `WorkflowDetailPanel`, `DependencyReadinessPanel`,
`EntitlementPanel`, `WorkflowRunPanel`, `WorkflowApprovalPanel`,
`WorkflowArtifactPreview` and `WorkflowDebugDrawer` should own rendering and
receive typed server projections. `WorkflowStudioPage` owns route/surface
composition, not lifecycle logic.

### State Matrix

Implement and test loading, empty, error, blocked, dependency-unavailable,
approval-pending, running, partial, retrying, cancel-pending, resumed, success,
failed, expired, recovery-required, selected, hover, focus and disabled.

### Responsive Matrix

| Viewport | Behavior |
|---|---|
| mobile 390x844 | single column, reachable status/approval/recovery actions |
| tablet 768x1024 | stacked or sheet inspector/drawer without overflow |
| laptop 1024x768 | compact collapsible multi-panel layout |
| desktop 1440x900 | mockup canvas + inspector + bottom drawer |
| small-mobile 360x800 | dense control wrap/overflow check |
| wide-desktop 1280x800 | graph/inspector clipping check |

### Accessibility Acceptance

Keyboard reaches cards, tabs, run mode, invoke, approval, retry/cancel/resume,
artifact and drawer controls. Every icon has an accessible name; status uses
semantic live regions; focus rings and contrast remain visible; reduced motion
does not hide information.

### Visual Direction

Use the three supplied mockups, current semantic Tailwind tokens, existing
spacing/radius/shadow and restrained motion. Do not replace the left nav,
top-down graph, right inspector, bottom drawer or separate Run surface.

### Copy Contract

All new copy has English/Thai keys for readiness, denial, approval, retry,
cancel, resume, artifact and reconciliation states. Never claim running,
completed, charged or verified without server projection.

### Browser Evidence Required

Playwright must cover Dashboard → Builder → Subflow → Catalog → Run at
390x844/768x1024/1440x900, with state fixtures, no new console errors, no
unintended horizontal overflow, keyboard/focus checks and screenshots.

## TDD-first verification

- Page tests for each state matrix row and server mutation success/error.
- Graph tests for node drag/keyboard nudge, add/duplicate/delete, typed edge
  create/relink/delete, cycle/type rejection and orphan-edge cleanup.
- Properties tests for every node kind, local/server validation, save/update
  revision conflicts and dirty/saving/saved/error state transitions.
- CTA contract tests that fail if an enabled button only changes a notice or
  local placeholder instead of executing a command/query.
- Locale parity/namespace tests.
- Browser flow with readiness, approval, partial, success, failure and artifact
  fixtures; drag a node, create/delete an edge, edit Properties, save/reload
  and exercise enabled actions; screenshot evidence at required viewports.

## Acceptance

Refreshing or opening another tab does not reset run state or duplicate work;
all displayed lifecycle status is server-derived. No visible enabled button is a
no-op, node/edge edits persist, and every node kind exposes actionable
Properties.
