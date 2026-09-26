# Spec 209 runtime completion implementation

## Implemented in this pass

- Replaced the static Builder canvas with a mockup-led `@xyflow/react` editor:
  node selection, drag persistence, keyboard nudge, add/duplicate/delete,
  typed handle connections, cycle/type validation, edge selection/deletion and
  fit/mini-map controls.
- Added editable node Properties for label, capability, ports, retry,
  timeout, approval, output mapping and JSON configuration, with draft
  revision conflict protection.
- Added durable workflow draft/version, run, event and checkpoint persistence.
- Added canonical `workflow.studio.execute` / `workflow.studio.step` executor
  registrations through the existing Job control plane. Unsupported
  capabilities fail closed before admission.
- Added exact-version run admission with idempotency, full/run-until/run-from/
  run-node/subflow plan slicing, tenant/version/input-bound checkpoints,
  approve/reject/input/retry/cancel/resume controls and durable run projection.
- Added authorized Job status, event, log and artifact projection in the Run
  Debug Drawer. The UI does not mark a run completed from local state.
- Added public Marketplace exact-version detail, dependency readiness and
  entitlement contracts, plus Marketplace-aware run admission checks.
- Preserved the supplied Builder/Subflow/Run layout and added bilingual copy.

## Evidence

- Focused Vitest: 9 files / 21 tests passed after the final runtime changes.
- Web production build and widget build passed with Vite.
- Playwright Workflow Studio browser flow passed at mobile, tablet and desktop
  viewports (3/3).
- `git diff --check` passed.

## Boundary still requiring deployment evidence

The repository now has the canonical contracts and implementation path, but a
live database migration, worker execution, provider adapter, artifact
publication and Feature 207 settlement cannot be proven by a local mocked
browser run. Production release must still validate those external effects and
the migration in the target environment.
