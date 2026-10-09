# Runner acceptance routing: Windows first

Date: 2026-10-09
Scope: acceptance routing and continuation guidance for Spec 205.

## Decision

Use the Windows Runner as the primary acceptance baseline for ongoing Runner
development because it is currently the most ready environment. Continue
independent implementation work against this baseline so that other workstreams
can proceed. This is a test-priority decision, not a claim that the Windows
Runner or the overall Spec has passed acceptance.

## Evidence available

- Latest user-provided Windows Runner Desktop screenshots show Runner version
  `0.2.24`, 5/11 tools ready, and Codex CLI `0.161.0` successfully ran a real
  prompt through the Runner and returned an answer. This is Runner-bound Codex
  smoke evidence for that Windows installation.
- The same Windows Desktop view reports automatic token refresh failed with
  `RUNNER_CONNECT_REQUEST_FAILED`. It displays access token expiry as
  `2026-10-09 06:28:18` and a reconnect deadline as `2026-10-16 06:13:18`.
  Treat this as an open session continuity defect; do not assume the successful
  prompt proves refresh or long-lived availability.
- An earlier user-provided Dashboard view showed Windows Runner version
  `0.2.23` at 1/11 tools ready and WSL2 Runner version `0.2.23` at 0/11; both
  showed 0/11 capabilities allowed. The newer Windows Desktop 5/11 result
  supersedes those readiness counts for current routing.
- The user explicitly directed that Windows be used as the main test baseline
  because it is the most ready environment.
- Separate WSL2 evidence from user-provided terminal output shows Linux Codex
  CLI `0.162.0`, `codex login status` as logged in, and a read-only ephemeral
  `codex exec` smoke response of `WSL_CODEX_OK`. The WSL2 Runner rescan reported
  connected over WSS, 11 discovered tools, duplicate acknowledgement, and zero
  pending events. Its Codex tool still reported `auth_probe_required`; the
  direct CLI smoke is not a Runner-bound verification receipt.

## Windows-first continuation

1. Resume `orchestra/runner-codex-shim-fix-20261008` at `FINAL_VERIFY` and run
   the pending Windows-hosted Runner workflow on the repaired candidate. Keep
   release publication disabled.
2. Fix and verify Windows automatic token refresh: capture fresh Runner
   `status`, `doctor`, `capabilities`, and `rescan` output before and after the
   displayed refresh/reconnect boundary, and confirm the authenticated session
   remains acknowledged by the Control Plane. The current screenshot reports
   `RUNNER_CONNECT_REQUEST_FAILED` during automatic refresh.
3. Retain the successful Windows Codex prompt as a passing smoke check, then
   record the next fresh Runner-bound probe with version, auth, health, policy,
   and response evidence. A single successful prompt does not establish
   persistent session health.
4. Continue other independent Spec 205 implementation work against the
   Windows-first baseline. Do not wait for WSL2 or Debian acceptance when the
   work does not depend on those platform-specific findings.
5. Track WSL2 and independent Debian Linux as separate acceptance lanes. The
   WSL2 result does not certify Debian Linux, and Windows results do not certify
   either Linux environment.
6. Do not create grants, budgets, economic charges, or protected dispatch to
   test discovery. Use the existing policy/Task Control authority for any
   additional privileged verification path.

## Current acceptance state

- Windows: primary baseline; Runner-bound Codex prompt succeeded, but persistent
  session/automatic token refresh verification remains pending.
- WSL2: connected and directly smoke-tested at the CLI; Runner-bound Codex
  readiness remains unverified.
- Debian Linux: separate acceptance lane; no new evidence in this checkpoint.
- Overall Spec 205 completion: not established by this routing update.

## Backend retry repair — 2026-10-09

- Code inspection found that `/api/runners/:runnerId/access/refresh` first
  verified the refresh token with revocation enforced, and only afterward
  called the service that supports a bounded replay grace window. If the server
  rotated a refresh token but its response was lost, retrying that same token
  was rejected before the grace handler could return the converged token set.
- The route preflight now allows a revoked refresh token only when a matching
  local or distributed grace record is still valid. Token audience/use, runner
  binding, and local-device proof checks remain in place.
- Added route regression coverage proving a same-token retry returns the same
  execution/upload/refresh token set. Focused Vitest passed:
  `server/routes/__tests__/runnerControl.test.ts` test
  `rotates control credentials and refreshes execution credentials through Runner routes`.
- Source fix is integrated at `326d3a9bf31a23a48ba5f3d2eb2b9341b14a2b0e`.
  The specific production trigger behind the Windows screenshot is not proven
  from the generic error code alone. Backend deployment and a live Windows
  refresh-boundary check are still required before calling the reported runtime
  issue resolved.

## Refresh failure reproduced after server restart — 2026-10-09

- The user rebuilt/restarted the server at source revision `2de300109fe9d8ba4c81c25ecfad194e15e03a0e` and reopened Windows Runner Desktop `0.2.24`; the same `RUNNER_CONNECT_REQUEST_FAILED` remained visible. Therefore the earlier bounded replay repair alone did not resolve the runtime failure.
- Web service logs showed repeated WSS `SESSION_EXPIRED` rejections for `local-runner` before that restart. Inspection found the authorized session controller used a 15-minute TTL, did not extend it when a valid active session re-authorized, and refresh did not restore the session.
- A second source repair is integrated at `ea286e0ae6eb3be97b844c90a2e29a4e6e3ae847`. Focused session and route tests pass 29/29. See `runner-token-session-refresh-fix-20261009.md`.
- The user's deployed build is still `2de30010`, so this repair requires a new build/restart from `ea286e0` followed by live Windows refresh-boundary verification. No live post-fix acceptance is claimed yet.
