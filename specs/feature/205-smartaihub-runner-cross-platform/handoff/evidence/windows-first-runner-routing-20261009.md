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
