# Implementation Plan

## Objective

Prevent stale MCP polling from generating a request storm or consuming the
rate-limit capacity needed by direct Kie and other media requests.

## Implementation

1. Add router regression tests proving `fetchTaskResult` returns a refreshed MCP
   task without invoking Python, while direct media tasks still use Python.
2. Add a pure Media History poll scheduler helper that enforces per-task
   cooldown, single-flight behavior, and 429 backoff. Wire the effect to a
   stable interval without immediate reruns caused by render dependencies.
3. Add Python middleware tests for verified `sub`, legacy `user_id`, verified
   `openId`, invalid JWT, and missing identity. Normalize the rate-limit key
   using the same claim compatibility as `get_current_user`.
4. Add MCP reconciler coverage and media-type-aware hard timeout defaults so an
   abandoned image task cannot remain processing for a full day.
5. Run focused tests, type/lint checks, security review, and review convergence.
6. Gracefully restart only web/backend services, verify health, and observe at
   least two poll windows for new burst/429 events.

## Risks and mitigations

- Auth key changes affect a shared middleware: use verified claims only and
  retain IP fallback.
- MCP adapter has unrelated edits: restrict changes to timeout constants and
  focused reconciler tests.
- Client timer behavior can regress silently: extract pure calculations and use
  fake-timer tests.
- Returning an MCP task changes the fetch-result payload shape: retain the
  existing `{ success, fetched, task }` envelope expected by callers.

## Acceptance criteria

- An MCP task ID causes zero calls to Python fetch-result.
- Rerendering Media History cannot issue another fetch before cooldown.
- Concurrent ticks cannot create more than one request.
- A 429 delays subsequent polling according to `Retry-After`.
- Authenticated users with different verified claims receive different keys.
- Raw `openId` is absent from keys and logs.
- Stale image MCP tasks terminate substantially earlier than video tasks.
- Existing Kie GPT Image 2 auto-routing tests pass.
- Production health remains 200 and no polling burst or internal 429 appears
  during the observation window.
