# Section 05 - Operator Surfaces, Timeline Projections, And Monitoring

## Goal

Expose the canonical Work OS through operator-facing queue, inbox, timeline, and monitoring views.

## Scope

- Add or normalize the Work Inbox, Team Queue, My Tasks, Approval Queue, Exceptions Desk, SLA and Aging Dashboard, and Case Timeline.
- Join case timeline data across requests, tasks, approvals, exceptions, outcomes, workpack evidence, role-routine evidence, and team-run evidence.
- Feed SLA, backlog, age, triage rate, approval latency, and exception metrics into monitoring and notifications.
- Ensure desktop-generated progress, artifacts, and worklog entries appear as attributed timeline evidence after sync.

## Implementation Notes

- Keep links deep and direct to existing workpack and monitoring pages where relevant.
- Maintain tenant scoping everywhere.
- Do not duplicate ownership state in the UI.

## Likely Files

- `apps/web/server/routers/monitoring.ts`
- `apps/web/server/services/monitoringService.ts`
- `apps/web/server/routers/teamWorkItem.ts`
- `apps/web/client/src/pages/*` or `apps/web/client/src/components/*`
- `apps/web/client/src/pages/AdminWorkOsDashboard.tsx`
- `apps/web/client/src/pages/AdminMonitoring.tsx`
- `apps/web/client/src/App.tsx`

## Tests First

- Assert each operator surface can be populated from the canonical model.
- Assert the case timeline surfaces workpack, role-routine, and team-run evidence via direct links or join fields.
- Assert queue views can show human-owned and agent-owned work side by side with tenant-safe filtering.
- Assert monitoring receives Work OS-derived metrics instead of inferring them from raw logs.
- Assert desktop-generated artifacts and worklog entries appear in the shared timeline after sync, including delayed uploads from stale or offline desktops.

## Acceptance Notes

- Operators can inspect the work once and see the whole lifecycle.
- The UI remains a projection of the canonical model, not a second source of truth.

## Implemented Files

- `apps/web/server/routers/workOs.ts`
- `apps/web/server/routers/monitoring.ts`
- `apps/web/server/services/workOsService.ts`
- `apps/web/client/src/pages/AdminWorkOsDashboard.tsx`
- `apps/web/client/src/pages/AdminMonitoring.tsx`
- `apps/web/client/src/App.tsx`

## Deviation

- This pass implemented the operator surfaces as backend projections, router endpoints, a lightweight admin console, and monitoring summaries rather than a full redesign of every operator page. The desktop/offline sync path is now specified as attributed timeline evidence, but the full conflict-handling UX remains a later UI pass.
