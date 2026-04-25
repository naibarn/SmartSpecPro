# Section 06: Admin UI and Observability

## Goal

Expose subagent topology, parent-child lineage, and failure reasons in the admin surfaces so operators can diagnose runs without inspecting raw logs.

## Scope

This section covers:

- Admin Skills maintenance views
- run detail views for parent and child lineage
- dashboard shortcuts into maintenance and run inspection
- locale updates for new labels and states

## Files to touch

- `apps/web/client/src/pages/AdminSkills.tsx`
- `apps/web/client/src/pages/AdminLegacyUpgradeRunDetail.tsx`
- `apps/web/client/src/pages/Dashboard.tsx`
- locale files used by the admin pages and detail pages

## Implementation notes

- Add topology cards and child-run panels for subagent-aware skills.
- Show parent/child run IDs, task IDs, checkpoint state, verification state, and clear failure reasons.
- Keep the existing maintenance filters and shortcuts, but add subagent-specific views for orchestrator failure, child failure, and handoff failure.
- Make blocked, failed, and completed outcomes visually distinct and truthful.
- Add dashboard shortcuts so operators can jump directly to subagent maintenance and run detail views.

## Acceptance criteria

- Operators can see the same lineage and failure truth that the backend stores.
- The UI distinguishes orchestrator failures from child subagent failures.
- The dashboard can route quickly into the maintenance/inspection surfaces for subagent-aware skills.

## Implementation notes

- The run monitor now surfaces role, failure scope, checkpoint, verification, parent, child, artifact, and resume lineage directly in the maintenance views.
- The legacy queue detail card now shows a dedicated lineage panel for subagent-aware recommendations, while the apply-run table shows role and failure-scope badges at a glance.
- The run detail page and dashboard shortcut continue to prefer persisted lineage over raw logs so the UI stays truthful when a run is resumed.

## Test-first guidance

- Write UI tests before wiring the new panels into production routes.
- Cover topology rendering, failure labels, dashboard shortcuts, and locale strings.
