# Media Polling and Rate-Limit Containment Design

## Incident

On 2026-07-20, a stale MCP media task caused repeated calls to the Python
`/api/v1/media/tasks/{taskId}/fetch-result` endpoint. The task did not exist in
the Python `media_tasks` table, so every request returned 404. React state
changes repeatedly restarted the Media History polling effect and triggered an
immediate retry instead of waiting for the nominal 15-second interval.

The Python rate limiter accepted the Node session JWT but did not derive a user
identifier when the token contained `openId`. All authenticated Node-to-Python
traffic therefore shared the `ip:127.0.0.1` bucket. The polling storm exhausted
that bucket and rejected unrelated direct Kie image generation before the
request reached Kie.

## Goals

- MCP tasks never use the Python media-task result endpoint.
- A component rerender cannot trigger an immediate polling feedback loop.
- Polling is single-flight, rate-aware, and bounded per task.
- Authenticated Node-to-Python requests use a stable per-user rate-limit key.
- Stale MCP tasks reach a terminal state without requiring an open browser.
- Direct Kie tasks and other media models remain behaviorally unchanged.

## Design

### Server-side task dispatch

`media.fetchTaskResult` will resolve the task type before calling Python. If
`getMcpMediaTask(taskId, userId)` finds the task, the procedure returns the
refreshed MCP task directly. Only non-MCP task IDs are forwarded to the Python
media endpoint.

This is an additive dispatch guard and preserves the existing tRPC response
contract.

### Client polling scheduler

Media History will use a stable polling scheduler with:

- one in-flight request at a time;
- a monotonic next-attempt timestamp per task;
- no immediate retry when a render occurs during the cooldown;
- a minimum 15-second interval after every attempt;
- server `Retry-After` backoff for 429 responses;
- a bounded delay for expected 404 responses;
- automatic cancellation when the tab is hidden or no pending task remains.

MCP tasks can remain in the combined History list because the server dispatch
guard makes their refresh path safe.

### MCP stale-task reconciliation

MCP hard-timeout behavior remains authoritative and becomes media-type-aware:
image/audio tasks time out after 2 hours by default, while video retains the
24-hour window. Reconciliation persists a terminal `failed` state when the
timeout is exceeded. The background reconciliation sweep, rather than a browser
poll, is responsible for settling abandoned MCP tasks.

The incident task is backed up and marked failed once as production containment.
No active direct-provider task is changed.

### Rate-limit identity

After cryptographic JWT verification, the middleware will derive its identity
from the same supported claims as `get_current_user`:

1. numeric `sub`;
2. legacy `user_id`;
3. verified `openId`, converted to a deterministic non-reversible digest.

The key will be namespaced by claim type. Raw identifiers and unauthenticated
headers will never be used in keys or logs. Requests without a verified
supported identity retain the IP bucket. This prevents cross-user contention
while preserving protection against anonymous traffic.

### Observability

Rate-limit logs will retain the key namespace, request path, tier, and
authenticated state without logging bearer tokens. Polling failures remain
visible in server logs but expected 404/429 responses do not create a retry
storm.

## Tests

- tRPC test: MCP fetch returns through the MCP adapter and never calls Python.
- tRPC test: direct media task still calls the Python fetch-result endpoint.
- client scheduler test with fake timers: rerenders do not cause additional
  calls before the interval.
- client scheduler test: only one in-flight request is allowed.
- client scheduler test: 429 honors the retry delay.
- Python middleware tests: `sub`, `user_id`, and `openId` produce isolated
  authenticated keys; missing identity falls back to IP.
- Existing Kie GPT Image 2 auto-routing tests remain green.

## Deployment and verification

1. Run focused web and Python tests, type checking, lint, and security review.
2. Gracefully restart only the web and backend services.
3. Verify health endpoints.
4. Observe at least two polling intervals with zero burst requests and zero
   internal 429 responses.
5. Submit one direct Kie image request through the normal workflow only if a
   paid provider smoke test is explicitly acceptable; otherwise verify routing
   at the API boundary without provider spend.

## Rollback

- Code changes are independently reversible.
- The production MCP row backup is stored under `orchestra/backups/`.
- Restoring that stale row is not recommended because it would re-enable the
  incident condition; the backup exists for audit and data recovery only.
