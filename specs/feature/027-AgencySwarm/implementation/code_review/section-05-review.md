# Section 05 Code Review: Python Router

## Critical Issues

### 1. CRITICAL: user_token hardcoded to empty string (agencies.py)
Both `run_agency()` and `stream_agency()` set `user_token=""` in RunContext. The adapter uses this as the api_key for the AsyncOpenAI client. Empty string means all LLM calls fail.

### 2. HIGH: SSE heartbeat not implemented
Plan requires `: keepalive\n\n` every 15 seconds. Not implemented. Risk of Nginx proxy dropping long connections.

### 3. HIGH: Stream credit pre-check hardcodes agent_count=2
Should use actual agent count or at least a better estimate.

### 4. HIGH: classify_error called twice in SSE error handler
Called once for error_type and once for retryable. Should store result.

## Medium Issues

### 5. Missing `fallback` field in AgencyRunResponse
Plan specifies `fallback: true` field for fallback responses.

### 6. cancel_run only updates DB status, doesn't stop running coroutine

### 7. Some tests are superficial (fallback, error, credit tests)

### 8. Missing test for 429 retry with actual backoff timing

### 9. Empty tenant_id fallback to empty string could match wrong records

## Low Issues

### 10. credits_used hardcoded to 0.0 (acknowledged TODO for section-06)
### 11. Auth tests accept 401 or 403 instead of exactly 401
### 12. No @pytest.mark.asyncio on TestRetryLogic
