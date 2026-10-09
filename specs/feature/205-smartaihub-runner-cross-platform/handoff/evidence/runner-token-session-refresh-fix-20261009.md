# Runner token/session refresh repair — 2026-10-09

## Runtime evidence

- The user rebuilt and restarted the server from source revision `2de300109fe9d8ba4c81c25ecfad194e15e03a0e`, then reopened Windows Runner Desktop `0.2.24`.
- The Desktop still displayed `RUNNER_CONNECT_REQUEST_FAILED`; the access token display showed expiry `2026-10-09 06:28:18` and reconnect deadline `2026-10-16 06:13:18`.
- Web service logs for `local-runner` recorded WSS event rejections with reason `SESSION_EXPIRED` at 08:22, 08:27, and 08:32 +07, before the reported 08:35 restart.
- The WSS logs do not prove which HTTP request produced the Desktop's generic error. They do establish a separate Control Plane session continuity failure on that runner.

## Root cause and repair

- `RunnerSessionController` assigned authorized sessions a 15-minute TTL. Re-authorizing an active session did not extend the TTL; after expiry `authorizeRunnerSession` rejected it. The access refresh route could rotate valid refresh credentials without restoring/renewing the matching session.
- Integrated source commit `ea286e0ae6eb3be97b844c90a2e29a4e6e3ae847` now renews the authorized session on a successful, unrevoked token refresh, extends the 15-minute TTL on authenticated re-authorization, restores a missing/expired session only after active Control Plane status is confirmed, and rejects revoked or identity-mismatched records.
- The earlier bounded refresh-token replay fix remains integrated at `326d3a9bf31a23a48ba5f3d2eb2b9341b14a2b0e`.

## Verification

- `JWT_SECRET='test-jwt-secret-32-chars-minimum-1234567890' pnpm --dir apps/web exec vitest run server/services/__tests__/runnerSessionContracts.test.ts server/routes/__tests__/runnerControl.test.ts` — PASS, 2 files / 29 tests.
- `git diff --check` — PASS.
- This is source and focused-test evidence. The user's server build at `2de30010` predates the repair; deployment and a new live Windows refresh-boundary observation against `ea286e0` remain pending.

## Next action

Build and restart the server from canonical source `ea286e0ae6eb3be97b844c90a2e29a4e6e3ae847`, reopen Windows Runner Desktop, and verify refresh plus WSS session continuity after the access-token refresh boundary. Keep WSL2 and Debian acceptance separate. Do not call the issue resolved until this live check passes.
