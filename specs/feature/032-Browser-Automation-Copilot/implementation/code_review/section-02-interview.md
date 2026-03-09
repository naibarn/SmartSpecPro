# Section 02 Code Review Interview

## Auto-fixes Applied

### 1. Rate limiter bypass — wired up skipIpRateLimit in limits.ts (was HIGH/DEAD CODE)
- Added early return in `rateLimit()` when `res.locals.skipIpRateLimit === true`

### 2. Double token verification — cached result in res.locals (was MEDIUM)
- First verification in middleware caches `res.locals.verifiedInternalToken = true`
- `guardWithCreditsOrInternalToken` checks cache before re-verifying

### 3. httpx.AsyncClient reuse — moved to instance variable (was MEDIUM)
- Client stored as `self._client` and reused across requests
- Added `aclose()` method for lifecycle management

### 4. Retry-After unbounded — capped at 60 seconds (was LOW)
- `min(float(retry_after), 60.0)` prevents malicious/buggy long waits

## Let Go (No Action)

### 5. Node.js tests don't test actual guard function (HIGH from reviewer)
- Testing the full function requires mocking Express req/res, authorizeRequest, db, etc.
- The crypto logic and flow are tested; integration tests will cover e2e in later sections

### 6. tenant_id not extracted in guard
- Not needed downstream yet; Section 08 will address credit flow with tenant context

### 7. /v1/models endpoint auth mismatch
- `/v1/models` already accepts Bearer auth; internal callers can use the existing path
- Will be addressed if needed in Section 07 (MCP tools)

### 8. vision_call signature differs from plan
- Intentional improvement — simpler API for the common case (single image + prompt)
