# Implementation plan: Task Control multi-step tracking

## Scope and order

Implement the feature in five ordered sections. The first three establish a
safe server contract; the fourth consumes it in the existing panel; the fifth
adds regression and browser proof plus closeout documentation.

## Section 1 — Safe worker projection

Files:

- `apps/web/server/services/workerJobMonitorService.ts`

Changes:

- Add `waiting_external` to the user-visible status tuple.
- Project bounded orchestration metadata (`planId`, `stepId`, ordinal/total,
  dependency job IDs and grouping key) from persisted `inputJson` only.
- Project bounded progress from `progressJson`, with latest safe event fields
  remaining the public event contract. Clamp numeric percentages and lengths;
  never return raw JSON.
- Select `progressJson` in list/detail repository reads and add a scoped
  `listUserJobsByIds` repository method for dependency predecessors.
- Preserve existing list/detail/output/artifact/cancellation semantics.

Tests first:

- Safe extraction accepts valid metadata and clamps/rejects malformed values.
- Raw credentials/provider payloads are absent from the summary.
- `waiting_external` is represented and remains cancelable where permitted.
- Dependency lookup receives tenant and requesting-user scope.

## Section 2 — Grouping and aggregate view model

Files:

- `apps/web/server/services/workerJobMonitorService.ts`
- `apps/web/server/services/__tests__/workerJobMonitorService.test.ts`

Changes:

- Add a pure, exported grouping/aggregation function and a service query for
  open task groups.
- Fetch open jobs in a bounded window, resolve only their dependency IDs,
  project safe summaries, and group by plan → workflow → single job.
- Return deterministic ordered steps, aggregate state, completed/total count,
  progress, active step and latest safe event. A group with any open step is
  not complete; failures/cancellation/expiry remain visible.
- Paginate groups rather than raw rows and return `hasMore`/`nextOffset`.
  Include a bounded-source marker and a degraded marker for malformed metadata
  without merging jobs; the UI must disclose when the source snapshot is capped.

Tests first:

- Plan jobs with dependencies form one ordered group and include a completed
  predecessor.
- Workflow and single-job fallbacks do not collide.
- Aggregate progress/state handles queued, running, waiting, success, failure,
  cancellation, expiry and missing steps deterministically.
- Open-task and dependency result sets cannot cross tenant/user scope.

## Section 3 — Protected tRPC contract and orchestration metadata

Files:

- `apps/web/server/routers/workerJobs.ts`
- `apps/web/server/services/orchestration/contracts.ts`
- Relevant orchestration unit tests and `apps/web/server/routers/__tests__/workerJobs.test.ts`

Changes:

- Add protected `workerJobs.taskGroups({ limit, offset })` returning the group
  view model and continuation metadata.
- Keep `workerJobs.list` and `detail` backward compatible while exposing the
  additive safe fields.
- Add bounded `stepIndex`/`totalSteps` to plan job orchestration metadata so
  new plans render stable order without guessing. Existing jobs use the safe
  creation-order fallback.

Tests first:

- Protected caller context reaches the service and invalid limits are rejected.
- Router returns group page shape and continuation state.
- Plan definitions include stable step metadata while retaining dependency
  fields and existing execution paths.

## Section 4 — Expandable Task Control UI

Files:

- `apps/web/client/src/components/chat/UniversalControlPlanePanel.tsx`
- `apps/web/client/src/components/chat/__tests__/UniversalControlPlanePanel.test.tsx`

Changes:

- Replace the five-row recent-job display with all returned open task groups.
- Add expandable group rows with clear state, progress, step counts, active
  step and latest event. Expanded rows render each step’s status, progress,
  phase/message, worker and permitted cancel action.
- Add bounded polling, loading/error/empty/degraded states and load-more. Keep
  the existing task composer, refresh, connection cards and global dialog
  behavior unchanged.
- Use accessible expand buttons (`aria-expanded`/`aria-controls`) and progress
  bars; keep compact widths without horizontal overflow.

Tests first:

- Multiple groups and all open tasks render.
- Expansion reveals ordered step status/progress/event data and collapses.
- Cancel invokes the existing mutation and refreshes group data.
- Loading, error, empty, malformed/degraded and continuation states remain
  distinguishable.

## Section 5 — Integration proof and documentation

Files:

- `apps/web/tests/e2e/control-plane-browser.spec.ts`
- `specs/feature/200-universal-coding-agent-control-plane/implementation/completion.md`
- `specs/feature/200-universal-coding-agent-control-plane/implementation/review.md`

Changes:

- Mock two open groups in Playwright and verify a multi-step group expands at
  mobile/tablet/desktop, shows step progress and does not overflow.
- Verify the same Task Control remains reachable from the single global button
  outside `/chat`.
- Record focused test commands, limitations and residual runtime boundaries.

## Risk controls

- No schema migration, new execution engine, retired workflow path, or second
  ledger.
- Never use client-supplied grouping or authorization metadata.
- Keep the dependency expansion bounded to prevent N+1/unbounded graph walks.
- Do not run whole-repo typecheck.
