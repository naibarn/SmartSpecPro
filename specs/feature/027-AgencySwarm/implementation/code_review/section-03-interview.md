# Section 03 Code Review Interview

## Review Summary
12 findings total: 3 HIGH, 4 MEDIUM, 5 LOW

## Triage Decisions

### Asked User (2 items)

**#3 (HIGH): max_run_time_seconds timeout not enforced**
- User decision: **Add asyncio.wait_for() AND exclude asyncio.TimeoutError from retry**
- Applied: Added `timeout_seconds` param to `run()`, wrapped with `asyncio.wait_for()`, dedicated `except asyncio.TimeoutError` block that does not retry

**#5 (MEDIUM): Invalid communication flows silently dropped**
- User decision: **Raise ValueError (fail fast)**
- Applied: Changed to raise `ValueError` with descriptive message listing available agents

### Auto-Fixed (8 items)

**#1 (HIGH): is_entry_point flag ignored**
- Fix: `create_agent()` now stores `agent._is_entry_point = config.is_entry_point`. `create_agency()` reads this attribute to determine entry points, falling back to first agent.
- Test added: `test_create_agent_stores_entry_point_metadata`, `test_create_agency_uses_is_entry_point_metadata`

**#2 (HIGH): NODEJS_INTERNAL_URL cached at import time**
- Fix: Moved `os.environ.get("NODEJS_INTERNAL_URL", ...)` into `_create_model()` for lazy evaluation
- Tests now use `monkeypatch.setenv` which works correctly since the env is read at call time

**#4 (MEDIUM): run_stream logs no context**
- Fix: Added `agency_id` and `tenant_id` params to `run_stream()`
- Test added: `test_run_stream_logs_context`

**#6 (MEDIUM): Unused imports**
- Fix: Removed `BadRequestError` and `PermissionDeniedError` from imports (unused in adapter code)

**#7 (MEDIUM): Fragile in-method imports**
- Fix: Changed tests to use top-level imports with `patch.object(adapter_mod, ...)` instead of `patch("app.services...")`

**#9 (LOW): run() no context**
- Fix: Added `agency_id` and `tenant_id` params to `run()`, included in all log events
- Test added: `test_run_logs_agency_id_and_tenant_id`

**#11 (LOW): No test for invalid flow**
- Test added: `test_create_agency_raises_on_invalid_flow`

**#12 (LOW): 502/504 deviation**
- Added tests: `test_api_status_502_is_transient`, `test_api_status_504_is_transient`
- Updated docstring in `_is_transient_error` to document 502/504

### Let Go (2 items)

**#8 (LOW): Mutable default on Pydantic field** — Safe in Pydantic v2, no action needed

**#10 (LOW): Missing streaming event test** — agency-swarm streaming events are opaque; testing iteration is better done at integration level

## Additional Changes

- `TimeoutError` reclassified from transient to permanent in `_is_transient_error`
- Test added: `test_timeout_error_is_permanent`, `test_run_timeout_is_not_retried`
- Total tests: 32 (up from 24)

## Test Results
All 32 tests pass.
