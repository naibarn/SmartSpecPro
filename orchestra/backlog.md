# Orchestra Backlog

## In Scope This Session
- Close downstream result sync-back contract and import path sufficiently for live handoff readiness gating.
- Add release-gate evidence for mutating router authorization coverage.
- Add migration/backfill/rollback/no-data-loss evidence without destructive data operations.
- Make MVP vs full node matrix status explicit in shared catalog, UI, and spec.
- Add Production planning skill/model/context panel and clearer project header affordances.

## Deferred Optional / After MVP
- Full adapters for every deferred node kind.
- Undo/redo stack for canvas edits.
- Live Storyboard Review / Video Edit handoff enablement after production credential/staging smoke.
- Dedicated advanced caption editor if Video Edit covers MVP captions.

## Completeness Audit Follow-Ups - 2026-05-23
- Completed: enforce `PRODUCTION_NODE_CATALOG` server-side for Save-to-Node and execution scheduling.
- Completed: harden runtime router schemas for node kind/status, shot status, product evidence manifest, access policy, and tool binding metadata.
- Completed: make handoff idempotency tenant-scoped on router/service preview paths.
- Completed: expand router authorization tests to every mutating procedure for missing tenant and cross-user denial.
- Completed: document MVP migration release rule and add deterministic legacy adapter plus schema read-safety tests.
- Completed: add first-class Production execution status panel copy for confirm, progress, failure/retry, cancellation, and reconcile states.
- Completed: add collaborator role-boundary regression coverage for read, write, and execute access.
# UI/UX Review Backlog — 2026-05-23

- Completed: Consolidate duplicate Production command hierarchy across `MediaStudio.tsx` and `ProductionWorkspace.tsx`; make `Create Plan + Verify` contextual primary and move archive/restore/delete to lifecycle overflow.
- Completed: Reduce Node Drawer density in `ProductionFlowCanvas.tsx` with recommended nodes and a collapsed `Later` section for deferred nodes.
- Completed: Strengthen live-route browser evidence by preseeding `WelcomeLanguagePicker`, then running layout/overflow/a11y/canvas-scroll checks on real `/media-studio`, not only fixture HTML.
- Completed: Replace permanent node-list fallback action wall with compact selected-node inspector/list semantics; clarify run/delete/link action hierarchy.
- Completed: Move `NodeConfigPanel` raw JSON editor into advanced mode and add operator-facing settings copy for normal media operators.
- Completed: Split Context Asset actions into explicit `Add to canvas` and `Attach to selected node`; show selected node title instead of raw id where available.
- Completed: Add accessibility semantics for canvas warnings, JSON validation errors, stepper current state, selected node states, and execution progress.
- Completed: Darken active tab/primary action colors and verify scoped WCAG axe checks.
- Completed: Add `360x800` and `1024x768` viewport evidence; add canvas page-scroll gate over the real React Flow viewport.
- Completed: Increase mobile touch target heights for filter chips and small action buttons where practical.
- Completed: Add reduced-motion CSS/test assertions for spinner and motion states.
- Completed: Map machine statuses and mixed copy to user-facing Thai/English labels.

## UI/UX Re-Review Fix Pass - 2026-05-23

- Completed: Add true no-project/empty-production state that focuses operators on title/goal plus Create Plan, Open Project, and New Project actions before rendering the full canvas system.
- Completed: Put the canvas before the Node Drawer on mobile/tablet and collapse add-node catalog content until requested.
- Completed: Reduce repeated per-node action density with row click/open/link controls and a compact More menu for configure/run/delete.
- Completed: Add operator-facing Node Config fields for prompt, model/preset, references, and output target while keeping JSON as advanced diagnostics/override.
- Completed: Split provider search results into explicit Add and Attach actions, and remove the first-asset shortcut that could attach the wrong asset.
- Completed: Consolidate workspace secondary actions into a More menu so Save remains quiet and Create Plan + Verify stays primary.
- Completed: Add display-label helpers for node kinds, edge kinds, evidence status, targets, delivery modes, asset kinds, and asset zones.
- Completed: Guard canvas/Product Evidence horizontal overflow and update browser evidence so React Flow virtual graph width does not masquerade as text overflow while page/canvas scroll gates stay blocking.
