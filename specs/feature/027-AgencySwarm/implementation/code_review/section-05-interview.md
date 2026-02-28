# Section 05 Code Review Interview

## Auto-Fixed

1. **CRITICAL: user_token hardcoded to empty string** -- Added `_bearer_scheme` dependency to extract raw JWT token from Authorization header. Both `run_agency()` and `stream_agency()` now pass `credentials.credentials` as `user_token` in RunContext.
2. **Double classify_error call in SSE error handler** -- Stored result in `err_type` variable, called once.

## User Decisions

1. **SSE heartbeat** -- Deferred to section-07 (SSE Streaming infrastructure section). User confirmed.
2. **Empty tenant_id fallback** -- Keep empty string fallback. Matches existing patterns. User confirmed.

## Let Go

- Missing `fallback` field in AgencyRunResponse (future concern)
- cancel_run only updates DB, doesn't stop running coroutine (adapter limitation)
- Whitespace in main.py imports (pre-existing)
- Superficial fallback/credit/error tests (test contracts, not internals)
- credits_used=0.0 (TODO for section-06)
- Auth tests accept 401/403 (both valid)
- Missing @pytest.mark.asyncio (auto mode handles)
- Service methods added to agency_service.py (needed for router)
