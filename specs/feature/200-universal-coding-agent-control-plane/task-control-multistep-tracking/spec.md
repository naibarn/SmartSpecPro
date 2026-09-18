# Task Control multi-step tracking

## Goal

Upgrade the existing Task Control surface so a user can follow every open
canonical worker task and expand a grouped multi-step task to see the status and
progress of each step. The feature must remain inside the existing `AI Chat &
Feedback` dialog and the full-page `/chat` Task Control surface.

## User experience

- The Task Control tab shows all user-owned open work, not only the five most
  recent rows.
- Jobs are grouped by `planId` when orchestration metadata is present, then by
  `workflowRunId`, with a single-job fallback when neither is available.
- A group row shows title, aggregate state, completed/total steps, percentage,
  current step and the most recent safe event.
- The group can be expanded and collapsed. Expanded content lists every known
  step in dependency/order sequence, including completed predecessor steps when
  they are available from the canonical dependency references.
- Each step shows canonical status, progress percentage, phase/message, worker
  identity when safe, and a cancel action only when the canonical monitor says
  it can be canceled.
- Pagination/load-more is used for large open-task sets. The UI must disclose
  when more tasks remain instead of silently implying that the list is complete.
- Refresh remains available and polling stays bounded. Loading, partial error,
  empty, malformed metadata and stale data must be visible without breaking the
  rest of the panel.
- The existing task handoff to Chat composer remains unchanged. Adding a task
  from this panel does not execute it directly.

## Data and safety contract

- Reuse `worker_jobs`, `worker_job_events`, and existing user-scoped monitor
  authorization. Do not add a second job ledger or a new execution route.
- Extend the safe monitor projection with bounded orchestration metadata and a
  bounded progress projection. Never expose raw `inputJson`, `progressJson`,
  credentials, lease tokens, signed URLs, or arbitrary provider payloads.
- Group identity is derived only from server-persisted job metadata. Client
  route, hostname, query parameters and user-supplied labels cannot authorize
  access or alter grouping.
- Malformed plan/step/dependency metadata is isolated as an ungrouped job or a
  visible degraded state; it must not cause a cross-tenant lookup.
- Aggregate state is deterministic: failed/expired/canceled work is surfaced;
  running/waiting/queued work cannot be reported as complete; a group is
  complete only when all known required steps are successful.
- Cancellation continues through the existing canonical monitor mutation and
  must preserve tenant/user scope and lifecycle fences.

## API and component boundary

- Add a protected task-group query or equivalent monitor service projection
  consumed by `UniversalControlPlanePanel`.
- Keep `workerJobs.list` and `workerJobs.detail` backward compatible for current
  callers. Add fields rather than changing existing field meanings.
- Keep grouping/aggregation logic in a testable server service or shared pure
  helper; the React component should render the returned view model and own only
  expansion/pagination state.
- The same view model must work for the inline Task Control tab and the `/chat`
  side panel.

## Acceptance criteria

1. A user with multiple open jobs sees all available open groups and a clear
   continuation affordance when pagination has more results.
2. A multi-step plan with dependency-linked jobs renders one expandable group,
   ordered steps, and correct aggregate progress/state.
3. An expanded step shows the latest event and progress without leaking raw
   provider/credential data.
4. A single job with no grouping metadata remains visible and actionable.
5. A failed, canceled, waiting, stale, loading, empty or partial-error state is
   distinguishable from success.
6. Cancel affects only a permitted job and refreshes the group state.
7. Tenant/user isolation is covered by focused service/router tests.
8. Mobile, tablet and desktop browser evidence confirms expansion, scrolling,
   no horizontal overflow, and the single-button inline access path.

## Explicit non-goals

- Do not implement a new workflow engine, Agency path, Docker/OpenSandbox
  runner, or alternate execution ledger.
- Do not claim provider-backed Agent execution, live event delivery, verified
  artifacts or durable Goal/Plan persistence beyond the evidence available in
  the existing runtime.
- Do not navigate away from the current page to open Chat or Task Control.
