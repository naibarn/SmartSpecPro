# Code Review: Section 03 -- AgencySwarmAdapter

## Summary

The implementation broadly follows the section plan. The adapter file and test file are created at the correct locations, the Pydantic data types match the spec, and the general architecture (gateway routing, per-request instantiation, retry logic, streaming passthrough) is present.

## Findings

| # | Severity | Issue |
|---|----------|-------|
| 1 | HIGH | `is_entry_point` flag is ignored; entry point is always first agent |
| 2 | HIGH | `NODEJS_INTERNAL_URL` cached at import time; tests may pass falsely |
| 3 | HIGH | `max_run_time_seconds` timeout is declared but never enforced |
| 4 | MEDIUM | `run_stream` logs no identifying context (agency_id, tenant_id) |
| 5 | MEDIUM | Invalid communication flows silently dropped instead of failing fast |
| 6 | MEDIUM | `PermissionDeniedError` and `BadRequestError` imported but unused |
| 7 | MEDIUM | Tests use in-method imports with fragile module caching for env vars |
| 8 | LOW | Mutable default on Pydantic field (safe but potentially misleading) |
| 9 | LOW | `run()` does not log `tenant_id`/`agency_id` per plan requirements |
| 10 | LOW | Missing `test_run_stream_yields_correct_event_types` test from plan |
| 11 | LOW | No test for invalid communication flow agent names |
| 12 | LOW | Retry on 502/504 deviates from plan without documentation |

All findings were addressed in the interview phase.
