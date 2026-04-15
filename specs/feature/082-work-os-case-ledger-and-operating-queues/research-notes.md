# Research Notes - Feature 082 Work OS

## Codebase Findings

- `apps/web/server/services/workOsService.ts` already implements the main canonical Work OS boundary:
  - request creation
  - task creation through `workItemService`
  - assignment changes
  - approval, exception, outcome, and SLA recording
  - case projections and inbox/overview queries
  - deterministic projection of legacy `team_work_items`
- `apps/web/server/routers/workOs.ts` already exposes the admin and requester-facing routes.
- `apps/web/server/routers/approvals.ts` and `apps/web/server/routers/monitoring.ts` are already wired into the app router.
- `apps/web/client/src/pages/WorkRequest.tsx` and `apps/web/client/src/pages/MyRequests.tsx` already provide the requester-facing Work OS surfaces.
- `apps/web/client/src/pages/AdminWorkOsDashboard.tsx` and `apps/web/client/src/pages/AdminMonitoring.tsx` already provide a lightweight operator surface.
- `apps/web/drizzle/schema.ts` already contains the new Work OS tables and enums.
- `apps/web/drizzle/0146_work_os_case_ledger_and_operating_queues.sql` and `meta/0146_snapshot.json` show the migration is already present.

## What Is Already Covered

- Deterministic projection of legacy `team_work_items` into a synthetic Work OS case view.
- Work item event journaling and Work OS event emission.
- Tenant-scoped reads and writes in the new service boundary.
- A thin compatibility path that lets legacy task creation flow through the new boundary.
- Basic admin console pages for inbox, lifecycle, approvals, exceptions, outcomes, SLA, and overview counts.

## Remaining Gaps

- Desktop/offline progress still needs to be described and verified as attributed timeline evidence end-to-end.
- Role-routine evidence is represented in the data model and projections, but the operator plan should make the join behavior explicit.
- External assistants and autonomous workers need a clearly documented triage fallback when no safe work target can be resolved.
- The rollout still needs a stronger plan for deterministic read projections versus later physical backfill.
- Monitoring and operator surfaces still need explicit plan coverage for deep links and timeline join behavior.

## Test/Code Path Hotspots

- `apps/web/server/services/__tests__/workOsService.test.ts`
- `apps/web/server/services/__tests__/workOsSchema.test.ts`
- `apps/web/server/routers/__tests__/workOs.test.ts`
- `apps/web/server/routers/__tests__/approvals.test.ts`
- `apps/web/server/routers/__tests__/monitoring.workpack.test.ts`
- `apps/web/server/routers/__tests__/teamWorkItem.test.ts`
- `apps/web/server/services/__tests__/monitoringService.test.ts`

## Risk Notes

- Approval transport still proxies to the Python backend, so linkage and projection behavior need careful regression coverage.
- The current implementation already spans schema, service, router, and UI layers, so changes should stay compatibility-first and avoid duplicate ownership stores.
