# Research findings

## Runtime and source of truth

- `apps/web/server/services/workerJobMonitorService.ts` is the protected
  tenant/user-scoped projection for `worker_jobs`, `worker_job_events`, workers
  and verified artifacts. It already owns cancellation and safe event shaping.
- `apps/web/server/services/jobControlPlane.ts` already reads
  `inputJson.orchestration.dependsOnJobIds` for dependency admission. This
  feature must project that metadata; it must not create another job ledger.
- `apps/web/server/services/orchestration/contracts.ts` and `gateway.ts` build
  and submit plan steps. The gateway maps step dependencies to canonical job
  IDs, so completed predecessors can be recovered by scoped ID lookup.
- `apps/web/drizzle/schema.ts` already has `workerJobs.progressJson` and
  `workflowRunId`; no schema migration is required for this view.

## API and UI

- `apps/web/server/routers/workerJobs.ts` exposes protected `list`, `detail`,
  `dashboardSummary` and `cancelQueued` procedures. Add a protected
  `taskGroups` query without changing existing procedure meanings.
- `apps/web/client/src/components/chat/UniversalControlPlanePanel.tsx` is used
  by both the global `AI Chat & Feedback` dialog and the `/chat` side panel.
  It currently truncates `workerJobs.list` to five visible rows and has no
  hierarchy.
- The UI already polls with bounded intervals, exposes partial API errors, and
  hands new task text to the existing Chat composer. That handoff remains
  unchanged.

## Testing

- Web tests use Vitest with Testing Library and `@vitest-environment jsdom`
  for React components. Server unit tests live under
  `apps/web/server/services/__tests__` and `apps/web/server/routers/__tests__`.
- Browser evidence uses Playwright under `apps/web/tests/e2e`, with mocked tRPC
  routes for responsive and user-visible flows.
- Verification must use focused Vitest/Playwright commands. Do not run the
  repository TypeScript check because of the documented RAM constraint.

## Constraints and gaps found

- `waiting_external` is handled by cancellation/readiness code but is missing
  from `USER_WORKER_JOB_STATUSES`; the task-group contract must include it so
  waiting work is not silently omitted.
- Existing orchestration metadata has plan/step/dependency IDs but does not
  persist an explicit step ordinal/total. Add bounded ordinal/total metadata at
  the contract boundary, with a safe fallback to deterministic creation order.
- Dependency IDs must be resolved only through the same tenant and requesting
  user predicates. Malformed metadata must degrade to a single-job group.
