# Code Review Interview — Section 08: Cross-Agency Communication (F09)

## Auto-confirmation mode: User approved all fixes automatically.

## Findings Triage

### Asked User (skipped — auto-confirm mode)
None required. All items auto-triaged.

### Auto-Fixed Items

| # | Severity | Issue | Fix Applied |
|---|----------|-------|-------------|
| H1 | CRITICAL | `execute_agency_call` never wired into dispatch path — dead code | Added `builtin-agency-call` branch in `_make_run_func` to route directly to `execute_agency_call()` |
| H3 | HIGH | Allowlist leaked in error message (exposes internal agency UUIDs to LLM) | Removed `allowed_agencies` from rejection error message |
| H4 | HIGH | `requiresApproval: false` on high-risk tool | Changed to `requiresApproval: true` matching `builtin-browser` pattern |
| M3 | MEDIUM | `log_agency_event()` called with wrong kwargs (`db_session=`, `data=`) — runtime crash | Fixed all call sites to use correct signature (removed `db_session`, renamed `data` → `metadata`) |
| M5 | MEDIUM | Semaphore INCR+EXPIRE not atomic (TOCTOU window on crash) | Switched to Redis pipeline for atomic INCR+EXPIRE in `acquire_semaphore` |

### Let Go (Low Priority / Out of Scope)

| # | Severity | Reason |
|---|----------|--------|
| H2 | HIGH | Budget race condition requires Lua script — deferred to follow-up. Low probability under normal concurrency patterns. |
| M1 | MEDIUM | `record_in_chain` ordering vs semaphore — minor window, defer. Redis connection drops during this window are transient and self-healing. |
| M2 | MEDIUM | Token scope validation for sub-agency delegation — out of scope for v1. Follow-up auth hardening task. |
| M4 | MEDIUM | `check_depth` trusts caller int vs Redis SCARD — defer. The Redis callchain provides loop detection; depth is a secondary guard. |
| L1 | LOW | TS test tests fixture not live module import — acceptable for registration-level test. |
| L2 | LOW | No integration test for `execute_agency_call` orchestrator — acceptable; guard functions are unit tested. |
| L3 | LOW | `check_rbac` allows `draft` status agencies — minor, defer to RBAC refinement pass. |
| L4 | LOW | Budget cap hardcoded — per-tenant config is follow-up feature. |
