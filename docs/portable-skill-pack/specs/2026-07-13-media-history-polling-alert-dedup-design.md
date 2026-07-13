# Media History Polling and Repeated Alert Fix

Date: 2026-07-13
Status: Approved direction; awaiting written-spec review

## Problem

Media History can enter a tight request loop while an asynchronous media task is pending. The background polling effect depends on `fetchResultMutation.isPending` and invokes its first tick immediately. Each mutation transition (`false -> true -> false`) recreates the effect and immediately starts another request, so the intended 15-second interval collapses into roughly 0.14 seconds between requests.

Production evidence from `smartspec-web.service` and `smartspec-backend.service` showed repeated calls for `mcp_7fd0eafef6a1cc8aec331c70a47c2516` to:

```text
POST /api/v1/media/tasks/mcp_.../fetch-result
```

The Python backend alternated between 404 because the MCP task does not exist in the Python media task table and 429 after the local backend limiter reached its 180-request burst ceiling. The web router mapped the 429 to `INTERNAL_SERVER_ERROR`, causing the global system-error monitor to show repeated "ระบบขัดข้องชั่วคราว" alerts.

Evidence ledger:

- Source: production systemd journals plus source inspection
- Identifier: MCP task `mcp_7fd0eafef6a1cc8aec331c70a47c2516`
- Observed failure: repeated 404/429 responses at approximately 0.14-second intervals
- Data state: the task belongs to the Node MCP task store, not the Python media task store
- Confidence: high

## Goals

- Poll pending media tasks at most once per 15-second cycle with no overlapping requests.
- Rotate across eligible tasks one at a time so a long-running first row cannot starve later tasks or create a burst.
- Keep automatic polling silent for transient 404 and 429 responses.
- Route MCP task status refreshes through the MCP adapter instead of the Python gateway path.
- Preserve the existing Python provider result-fetch path for non-MCP tasks.
- Preserve system alerts for genuine unexpected 5xx failures.
- Add regression tests for the request-loop, MCP routing, and 429 mapping.

## Non-Goals

- Increasing global backend rate limits.
- Changing Higgsfield account configuration or provider model catalogs.
- Adding a queue, WebSocket channel, dependency, database migration, or new persistence model.
- Changing generation submission, credit accounting, cancellation, or stale-task reconciliation.

## Considered Approaches

### A. Correct polling, routing, and error classification (selected)

Fix the client scheduling loop, route MCP tasks locally, and preserve 429 as `TOO_MANY_REQUESTS`.

Trade-off: touches both frontend and router behavior, but removes the request storm instead of hiding it and keeps transport ownership explicit.

### B. Suppress or lengthen alert deduplication only

Ignore `media.fetchTaskResult` alerts or increase the toast dedupe window.

Rejected because the backend request storm, 404 noise, and consumed rate-limit capacity would remain.

### C. Increase or bypass the Python rate limit

Raise the 120/180 requests-per-minute limit or exempt the result endpoint.

Rejected because it masks the runaway loop, reduces protection for unrelated endpoints, and still sends MCP task IDs to the wrong subsystem.

## Design

### 1. Single-flight client polling

Replace the effect-owned `setInterval` pattern with a small single-flight scheduler used by Media History:

- Run one immediate status check when a pollable pending task becomes active.
- Schedule the next check 15 seconds after the previous attempt settles.
- Never start a second check while the first is in flight.
- Poll only one eligible task per cycle and advance a round-robin cursor for the next cycle.
- Do not use mutation `isPending` as an effect dependency or scheduling signal.
- Skip attempts while the document is hidden; resume on a later scheduled cycle.
- Stop the loop when the component unmounts or no task remains pending.
- If a returned task becomes terminal or gains a result URL, refetch the task list so the table updates and polling stops.

The scheduler will be exported as a small dependency-injected helper so fake timers can prove its cadence and single-flight behavior without mounting the full page. The React effect will keep the latest polling callback in a ref and depend only on the pending-task lifecycle key, preventing mutation-state renders from restarting the loop.

### 2. Transport-correct result fetching

`media.fetchTaskResult` will recognize persisted MCP task IDs by their `mcp_` prefix before calling the Python backend. This prefix is assigned by `submitMcpMediaGeneration` for both deterministic idempotency IDs and random UUID IDs, so it is an existing server-owned transport discriminator rather than user-supplied metadata.

For an MCP task:

1. Call `getMcpMediaTask(taskId, userId)`, which owns the MCP provider status refresh.
2. Return the normalized `MediaTask` result in the existing `{ success, message, task, fetched }` response shape.
3. Return `NOT_FOUND` when the MCP task is not available to the current user.
4. Never fall through to the Python endpoint for an `mcp_` task.

For a non-MCP task, keep the existing Python `/api/v1/media/tasks/{taskId}/fetch-result` behavior unchanged.

This preserves tenant/user ownership checks already implemented by `getMcpMediaTask` and prevents the Python media table from being queried with MCP-only IDs.

### 3. Error semantics and alert behavior

The non-MCP upstream status mapping will be:

- 400 -> `BAD_REQUEST`
- 401 -> `UNAUTHORIZED`
- 403 -> `FORBIDDEN`
- 404 -> `NOT_FOUND`
- 429 -> `TOO_MANY_REQUESTS`
- unexpected 5xx/other -> `INTERNAL_SERVER_ERROR`

The router will read either `detail` or `message` from the Python error body. A 429 therefore remains a rate-limit/user-class error and does not trigger the global system-error alert. Automatic polling already handles errors silently at the call site. A manual "fetch URL" action may show the returned rate-limit message once, while genuine 5xx errors continue through the current system-error reporting flow.

No global alert dedupe constants need to change.

## Data Flow

```text
Media History pending task
  -> single-flight 15s scheduler
  -> media.fetchTaskResult
       -> task id starts mcp_
            -> getMcpMediaTask -> Higgsfield/MCP status adapter
       -> otherwise
            -> Python /api/v1/media/tasks/{id}/fetch-result
  -> terminal/result URL returned
  -> refetch list and stop polling completed task
```

## Failure Handling

- Provider or network failures inside the MCP adapter retain the current processing state and are recorded through existing MCP observability; they do not redirect to Python.
- 404 and 429 during automatic polling are silent and retried only on the next bounded cycle.
- A slow request delays the following cycle instead of overlapping it.
- Component unmount cancels future timers; a settled in-flight promise cannot schedule another cycle after disposal.
- Genuine server failures remain visible through the existing feedback/report action.

## Test Plan

Use red-green-refactor.

### Client regression tests

In `MediaHistory.compile.test.tsx`, use fake timers and a deferred promise to prove:

- the scheduler performs one immediate call;
- no second call starts while the first is unresolved;
- settling a call schedules exactly one next call after 15 seconds;
- stopping the scheduler prevents future calls.
- two eligible tasks are selected in rotation across successive cycles without parallel requests.

### Router regression tests

In `media.db-first.contract.test.ts` prove:

- an `mcp_` task is resolved with `getMcpMediaTask` and never calls `fetch`;
- a missing `mcp_` task returns `NOT_FOUND` and never calls Python;
- upstream 429 maps to `TOO_MANY_REQUESTS` and preserves the backend message;
- existing 404, 5xx, and successful non-MCP cases continue to behave as before.

### Verification

Run:

```bash
cd apps/web
pnpm vitest run client/src/pages/MediaHistory.compile.test.tsx server/routers/__tests__/media.db-first.contract.test.ts
pnpm check
```

Because the worktree currently has unrelated Feature 133 changes and known typecheck noise may exist, verification must distinguish new failures in the touched files from unrelated baseline failures.

## Blast Radius and Compatibility

Expected implementation files:

- `apps/web/client/src/pages/MediaHistory.tsx`
- `apps/web/client/src/pages/MediaHistory.compile.test.tsx`
- `apps/web/server/routers/media.ts`
- `apps/web/server/routers/__tests__/media.db-first.contract.test.ts`

SocratiCode reports direct dependents of Media History in `main.tsx` and its compile test, and router dependents in server router composition and media router tests. No API input shape, schema, migration, auth middleware, dependency, or public route changes are required.

At 10x task volume, the single-flight scheduler prevents one browser tab from multiplying concurrent result requests. This design does not add cross-instance distributed MCP polling coordination; that is unnecessary for the demonstrated client-loop failure and remains outside scope unless production evidence later shows duplicate provider polling across web replicas.

## Rollout and Observability

- Deploy through the normal web build/restart workflow after tests pass.
- Verify production journals no longer show rapid repeated `/fetch-result` calls for one task.
- Verify an MCP task reaches the Node MCP adapter and does not appear in Python media endpoint logs.
- Verify a forced/simulated 429 does not create a system-error feedback alert.
- No rollback migration is needed; reverting the four source/test files restores prior behavior.
