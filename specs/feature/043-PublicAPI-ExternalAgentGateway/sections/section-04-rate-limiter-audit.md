# Section 04: Rate Limiter, Audit Logging, Idempotency, CORS, and Common Response Infrastructure

## Overview

This section builds the cross-cutting middleware layer that all public API endpoints (sections 05-11) depend on. It covers six concerns:

1. **Redis sliding-window rate limiter** (per-key and per-tenant)
2. **Daily credit limit enforcement** per API key
3. **Audit logging middleware** for the `api_audit_events` table
4. **Idempotency middleware** for POST endpoints
5. **CORS configuration** for `/v1/` endpoints
6. **Common response headers and error format**

All middleware is applied before individual route handlers, creating a consistent enforcement and observability layer for the entire public API surface.

## Dependencies

- **Section 01 (database-schema):** The `api_audit_events` table must exist.
- **Section 02 (api-key-service):** The `api_keys` table (with `rateLimit` and `creditLimit` columns) must exist, and the `apiKeyService` module must be importable.
- **Section 03 (auth-extension):** The `authorizeRequest()` extension that produces `mode: 'api_key'` AuthContext results, including `apiKeyId`, `scopes`, `tenantId`, and `userId` fields. The `requireScopes()` middleware must be available.

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/server/services/apiKeyRateLimiter.ts` | Sliding-window rate limiter + daily credit limit |
| `apps/web/server/middleware/apiAuditMiddleware.ts` | Audit logging for public API requests |
| `apps/web/server/middleware/idempotencyMiddleware.ts` | Idempotency-Key caching for POST endpoints |
| `apps/web/server/middleware/publicApiCors.ts` | CORS configuration for `/v1/` routes |
| `apps/web/server/middleware/publicApiHeaders.ts` | Common response headers + error format utility |
| `apps/web/server/services/apiKeyRateLimiter.test.ts` | Rate limiter tests |
| `apps/web/server/middleware/__tests__/apiAuditMiddleware.test.ts` | Audit middleware tests |
| `apps/web/server/middleware/__tests__/idempotencyMiddleware.test.ts` | Idempotency tests |
| `apps/web/server/middleware/__tests__/publicApiCors.test.ts` | CORS tests |
| `apps/web/server/middleware/__tests__/publicApiHeaders.test.ts` | Headers + error format tests |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/server/_core/index.ts` | Mount CORS middleware, common headers middleware, and audit middleware on `/v1/` path prefix |

---

## Tests (Write First)

### Rate Limiter Tests

**File:** `apps/web/server/services/apiKeyRateLimiter.test.ts`

Tests to implement (each as a separate `it()` block):

```
describe("apiKeyRateLimiter", () => {
  describe("checkRateLimit", () => {
    // Test: allows requests under per-key limit
    //   - Mock Redis INCR to return count below key's rateLimit
    //   - Assert result.allowed === true
    //   - Assert result.remaining === rateLimit - count

    // Test: returns 429 info when per-key limit exceeded
    //   - Mock Redis INCR to return count above key's rateLimit (default 60)
    //   - Assert result.allowed === false
    //   - Assert result.retryAfterSeconds is set (seconds until next minute window)

    // Test: returns 429 info when per-tenant limit exceeded (600 RPM global)
    //   - Mock per-key INCR to return count below key limit
    //   - Mock per-tenant INCR to return count above 600
    //   - Assert result.allowed === false

    // Test: sets correct X-RateLimit-* header values in result
    //   - Assert result.headers contains 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'
    //   - 'X-RateLimit-Limit' equals key's rateLimit value
    //   - 'X-RateLimit-Reset' is a Unix timestamp for start of next minute

    // Test: Redis EXPIRE is called with 120s TTL on rate limit keys
    //   - Verify EXPIRE call arguments after INCR
  })

  describe("checkDailyCreditLimit", () => {
    // Test: daily credit limit returns allowed=false with Retry-After when exceeded
    //   - Mock Redis GET to return accumulated credits above key's creditLimit
    //   - Assert result.allowed === false
    //   - Assert result.retryAfterSeconds is seconds until midnight UTC

    // Test: daily credit limit resets at midnight UTC
    //   - Redis key format is 'creditlimit:apikey:{keyId}:{YYYY-MM-DD}'
    //   - Different dates produce different keys

    // Test: null creditLimit means unlimited (always allowed)
    //   - Pass creditLimit as null
    //   - Assert result.allowed === true regardless of accumulated total

    // Test: incrementDailyCredits adds to the daily counter
    //   - Call incrementDailyCredits with amount
    //   - Verify Redis INCRBY called with correct key and amount
    //   - Verify EXPIREAT set to midnight UTC + 1 day
  })
})
```

Mock strategy: Mock `getRedisClient()` from `../services/redis` (same pattern used in `contentAutomationRateLimit.test.ts`). Create a `makeMockRedis` helper that returns an object with `incr`, `expire`, `expireat`, `get`, `incrby`, `eval` as vi.fn() stubs.

### Audit Middleware Tests

**File:** `apps/web/server/middleware/__tests__/apiAuditMiddleware.test.ts`

```
describe("apiAuditMiddleware", () => {
  // Test: API key request creates api_audit_events record
  //   - Mock req with apiKeyId, tenantId, userId on req.auth
  //   - Call middleware, invoke next(), simulate res.end()
  //   - Verify db.insert(apiAuditEvents) was called with correct fields

  // Test: audit event captures method, path, statusCode, creditsUsed, latencyMs
  //   - Set req.method = 'POST', req.path = '/v1/skills/abc/execute'
  //   - Set res.statusCode = 200
  //   - Set res.getHeader('X-Credits-Used') = '5'
  //   - Verify insert payload matches

  // Test: audit event sanitizes Bearer tokens from requestMeta
  //   - Include Authorization header with 'Bearer sk-ssp_...' in req.headers
  //   - Verify requestMeta does NOT contain the token value
  //   - Verify requestMeta contains 'Authorization: Bearer [REDACTED]'

  // Test: audit logging is non-blocking (response returns before insert completes)
  //   - Make db.insert return a slow promise (e.g., never-resolving or delayed)
  //   - Verify res.end() is called before insert resolves
  //   - Use .catch() on insert to avoid unhandled rejection
})
```

Mock strategy: Mock `getDb()` from `../db` to return a mock with `insert().values()` chain. Use Express `req`/`res` mocks (plain objects with needed properties).

### Idempotency Middleware Tests

**File:** `apps/web/server/middleware/__tests__/idempotencyMiddleware.test.ts`

```
describe("idempotencyMiddleware", () => {
  // Test: POST with Idempotency-Key returns cached response on second call
  //   - First call: no cache hit, proceed, cache response
  //   - Second call with same key: return cached { statusCode, body }

  // Test: cached response preserves original status code (including 4xx/5xx)
  //   - First call returns 422 with error body
  //   - Second call returns same 422 and same body

  // Test: different Idempotency-Key values are independent
  //   - Call with key 'A', get response A
  //   - Call with key 'B', proceed to handler (not cached)

  // Test: idempotency keys are tenant-scoped
  //   - Key format in Redis: 'idempotency:{tenantId}:{key}'
  //   - Same Idempotency-Key from different tenant = different cache entry

  // Test: cache expires after 24h (TTL 86400)
  //   - Verify Redis SET called with EX 86400

  // Test: response > 1MB is not cached
  //   - Handler returns body larger than 1MB
  //   - Verify Redis SET is NOT called
  //   - Response still sent to client normally

  // Test: GET requests skip idempotency check entirely
  //   - Send GET with Idempotency-Key header
  //   - Middleware calls next() without checking Redis

  // Test: response > 100KB but < 1MB uses shorter TTL (1h)
  //   - Verify Redis SET called with EX 3600 instead of 86400
})
```

Mock strategy: Mock `getRedisClient()`. For response interception, monkey-patch `res.json()` and `res.send()` to capture the body before forwarding.

### CORS Tests

**File:** `apps/web/server/middleware/__tests__/publicApiCors.test.ts`

```
describe("publicApiCors", () => {
  // Test: OPTIONS preflight on /v1/ path returns correct CORS headers
  //   - Access-Control-Allow-Origin: *
  //   - Access-Control-Allow-Methods includes GET, POST, DELETE, OPTIONS
  //   - Access-Control-Allow-Headers includes Authorization, Content-Type,
  //     Idempotency-Key, Mcp-Session-Id
  //   - Status 204 (no body)

  // Test: Access-Control-Allow-Origin is * for /v1/ endpoints
  //   - Send normal GET to /v1/skills, verify header present

  // Test: Access-Control-Expose-Headers includes custom headers
  //   - Verify: X-Request-Id, X-Credits-Used, X-Credits-Remaining,
  //     X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
})
```

### Common Headers and Error Format Tests

**File:** `apps/web/server/middleware/__tests__/publicApiHeaders.test.ts`

```
describe("publicApiHeaders", () => {
  // Test: X-Request-Id header present on all responses (uses req.requestId from correlationIdMiddleware)

  // Test: X-Credits-Used header reflects credits consumed (set by route handler)

  // Test: X-Credits-Remaining shows correct balance after deduction
})

describe("formatApiError", () => {
  // Test: invalid API key returns { error: { code: "invalid_api_key", type: "auth_error", message } }

  // Test: insufficient credits returns { error: { code: "insufficient_credits", type: "billing_error", message } }

  // Test: rate limit exceeded returns { error: { code: "rate_limit_exceeded", type: "rate_limit_error", message } }

  // Test: disabled publicApi flag returns { error: { code: "feature_disabled", type: "auth_error", message } }

  // Test: all error responses include X-Request-Id header
})
```

---

## Implementation Details

### 1. Rate Limiter (`apps/web/server/services/apiKeyRateLimiter.ts`)

This module exports three functions:

**`checkRateLimit(apiKeyId: string, tenantId: string, keyRateLimit: number): Promise<RateLimitResult>`**

Uses a Redis sliding-window counter approach with minute-granularity buckets:

- **Per-key key format:** `ratelimit:apikey:{apiKeyId}:{minuteTimestamp}` where `minuteTimestamp` is `Math.floor(Date.now() / 60000)`.
- **Per-tenant key format:** `ratelimit:tenant:api:{tenantId}:{minuteTimestamp}`.
- For each, call `INCR` on the key. If the return value is 1 (first request in this window), set `EXPIRE 120` (two minutes, gives buffer for clock edge cases).
- Compare the per-key count against `keyRateLimit` (default 60 RPM, from `api_keys.rateLimit`).
- Compare the per-tenant count against the global tenant limit constant `TENANT_RPM_LIMIT = 600`.
- Return a result object containing:
  - `allowed: boolean`
  - `remaining: number` (min of key remaining, tenant remaining)
  - `headers: Record<string, string>` with `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
  - `retryAfterSeconds?: number` (seconds until next minute window, only if `allowed === false`)

Use `getRedisClient()` from `../services/redis`.

**`checkDailyCreditLimit(apiKeyId: string, creditLimit: number | null, currentDayCredits?: number): Promise<DailyCreditResult>`**

- If `creditLimit` is `null`, return `{ allowed: true }` immediately (unlimited).
- Redis key: `creditlimit:apikey:{apiKeyId}:{YYYY-MM-DD}` (UTC date string).
- Call `GET` on the key to retrieve accumulated credits for today.
- If accumulated >= `creditLimit`, return `{ allowed: false, retryAfterSeconds }` where `retryAfterSeconds` is seconds until midnight UTC.
- Otherwise return `{ allowed: true, remaining: creditLimit - accumulated }`.

**`incrementDailyCredits(apiKeyId: string, amount: number): Promise<void>`**

- Redis key: same format as above with today's UTC date.
- Call `INCRBY` with `amount`.
- Call `EXPIREAT` with midnight UTC + 1 day (so stale keys auto-expire).

**Calculating seconds until midnight UTC:**

```typescript
function secondsUntilMidnightUTC(): number {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}
```

**Type definitions** (in the same file):

```typescript
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  headers: Record<string, string>;
  retryAfterSeconds?: number;
}

interface DailyCreditResult {
  allowed: boolean;
  remaining?: number;
  retryAfterSeconds?: number;
}
```

### 2. Audit Logging Middleware (`apps/web/server/middleware/apiAuditMiddleware.ts`)

Express middleware that captures request/response metadata and inserts into `api_audit_events`.

**Behavior:**

- Only activates when `req.auth?.mode === 'api_key'` (skip for session-based web requests).
- Records `startTime = Date.now()` on entry.
- Hooks into `res.on('finish', ...)` to capture the response after it is sent.
- On finish, builds an audit record:
  - `tenantId` from `req.auth.tenantId`
  - `userId` from `req.auth.userId`
  - `apiKeyId` from `req.auth.apiKeyId`
  - `traceId` from `req.requestId` (set by existing `correlationIdMiddleware`)
  - `method` from `req.method`
  - `path` from `req.path` (truncated to 255 chars)
  - `statusCode` from `res.statusCode`
  - `creditsUsed` from `res.getHeader('X-Credits-Used')` parsed as integer, default 0
  - `latencyMs` = `Date.now() - startTime`
  - `ip` from `req.ip` or `req.headers['x-forwarded-for']`
  - `userAgent` from `req.headers['user-agent']`
  - `requestMeta` built from sanitized request info (see below)
- Insert asynchronously using `getDb().insert(apiAuditEvents).values(...)`. The `.catch()` must log errors but never throw (non-blocking).

**Sanitization for `requestMeta`:**

Build a JSON object containing:
- `query`: `req.query` (shallow copy)
- `contentLength`: `req.headers['content-length']`
- `authorization`: Replace actual token with `'Bearer [REDACTED]'`

Do NOT include: request body (may contain PII or large payloads), cookie values, raw headers beyond the above.

**Accessing the schema:** Import `apiAuditEvents` from `../../drizzle/schema` (the table created in section 01).

### 3. Idempotency Middleware (`apps/web/server/middleware/idempotencyMiddleware.ts`)

Express middleware factory. Apply to specific POST routes or as a general middleware on `/v1/` for POST methods.

**Behavior:**

- If `req.method !== 'POST'`, call `next()` immediately (skip).
- Read `Idempotency-Key` header. If absent, call `next()` (idempotency is opt-in).
- Validate key length: max 64 characters. Return 400 if exceeded.
- Build Redis key: `idempotency:{tenantId}:{idempotencyKey}` where `tenantId` comes from `req.auth.tenantId`.
- Check Redis `GET` for existing cached response.
- **Cache hit:** Parse the cached JSON `{ statusCode, body, contentType }`. Set `res.status(statusCode)`, set `Content-Type`, send `body`. Return without calling `next()`.
- **Cache miss:** Intercept `res.json()` and `res.send()` to capture the response body. After capture:
  - Calculate body size in bytes.
  - If body size > 1MB (1,048,576 bytes): do NOT cache. Send response normally.
  - If body size > 100KB (102,400 bytes): cache with `EX 3600` (1 hour TTL).
  - Otherwise: cache with `EX 86400` (24 hour TTL).
  - Cache value: `JSON.stringify({ statusCode: res.statusCode, body, contentType: res.getHeader('content-type') })`.

**Response interception pattern:**

```typescript
const originalJson = res.json.bind(res);
res.json = (body: any) => {
  // Cache logic here
  return originalJson(body);
};
```

This is a standard Express pattern. Be careful to call the original method exactly once.

### 4. CORS Middleware (`apps/web/server/middleware/publicApiCors.ts`)

A dedicated CORS middleware for `/v1/` routes, separate from the existing domain-specific CORS in `_core/index.ts` (which uses `isAllowedOrigin()` for cookie-based auth).

**Export:** `publicApiCorsMiddleware` -- an Express middleware function.

**Headers set on every response:**

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Authorization, Content-Type, Idempotency-Key, Mcp-Session-Id`
- `Access-Control-Expose-Headers: X-Request-Id, X-Credits-Used, X-Credits-Remaining, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset`
- `Access-Control-Max-Age: 86400`

**Preflight handling:** If `req.method === 'OPTIONS'`, set headers and respond with `204` immediately (no body). Do not call `next()`.

**Security note:** `Access-Control-Allow-Origin: *` is safe here because API key auth does not use cookies. CSRF is not a concern. This is documented in the API docs (section 13).

### 5. Common Response Headers and Error Format (`apps/web/server/middleware/publicApiHeaders.ts`)

**Exports:**

**`publicApiHeadersMiddleware`** -- Express middleware that:
- Sets `X-Request-Id` from `req.requestId` (already set by `correlationIdMiddleware`).
- On `res.on('finish')`, no action needed -- headers are already set by the time response sends.
- The `X-Credits-Used` and `X-Credits-Remaining` headers are set by individual route handlers after credit operations. This middleware does NOT set them -- it only ensures `X-Request-Id` is present.

**`formatApiError(code: string, message: string, type: string, statusCode?: number)`** -- utility function returning the standard error object:

```typescript
interface ApiError {
  error: {
    code: string;
    message: string;
    type: string;
  };
}
```

**`sendApiError(res: Response, statusCode: number, code: string, message: string, type: string)`** -- convenience function that:
1. Sets the status code
2. Sends the formatted error JSON
3. Includes `X-Request-Id` header (from `req.requestId`)

**Error code constants** (exported for use by other modules):

| Code | Type | HTTP Status | When Used |
|------|------|-------------|-----------|
| `invalid_api_key` | `auth_error` | 401 | Bad or expired API key |
| `insufficient_scopes` | `auth_error` | 403 | Missing required scope |
| `rate_limit_exceeded` | `rate_limit_error` | 429 | RPM limit hit |
| `daily_credit_limit` | `billing_error` | 429 | Daily credit cap hit |
| `insufficient_credits` | `billing_error` | 402 | Not enough credits |
| `invalid_request` | `invalid_request_error` | 400 | Malformed request |
| `not_found` | `not_found_error` | 404 | Resource not found |
| `feature_disabled` | `auth_error` | 403 | publicApi flag off |
| `internal_error` | `internal_error` | 500 | Unexpected server error |
| `idempotency_conflict` | `invalid_request_error` | 409 | Concurrent idempotent requests |

### 6. Mounting in Server Entry Point (`apps/web/server/_core/index.ts`)

Add the public API middleware stack to the Express app. The middleware must be mounted on the `/v1` path prefix, and must be registered BEFORE any `/v1/*` route handlers.

**Mounting order for `/v1/` requests:**

1. `publicApiCorsMiddleware` -- handle OPTIONS preflight before auth
2. `publicApiHeadersMiddleware` -- set X-Request-Id
3. (Auth middleware from section 03 -- already in place)
4. Rate limiter check (applied per-route or as a middleware that reads `req.auth`)
5. `idempotencyMiddleware` (for POST requests)
6. `apiAuditMiddleware` -- hooks res.on('finish') to log after response

The rate limiter is not a standalone middleware but is invoked by route handlers or a thin middleware wrapper that calls `checkRateLimit()` and `checkDailyCreditLimit()` and returns 429 with the appropriate error format if either fails. This is because the rate limiter needs access to `req.auth.apiKeyId` and the key's `rateLimit`/`creditLimit` values, which are only available after auth completes.

**Rate limit middleware wrapper** (can live in `publicApiHeaders.ts` or a separate file):

```typescript
export function rateLimitMiddleware(): RequestHandler {
  return async (req, res, next) => {
    if (req.auth?.mode !== 'api_key') return next(); // skip for session auth

    const result = await checkRateLimit(req.auth.apiKeyId, req.auth.tenantId, req.auth.rateLimit);

    // Always set rate limit headers (even on success)
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }

    if (!result.allowed) {
      return sendApiError(res, 429, 'rate_limit_exceeded',
        'Rate limit exceeded. Try again later.', 'rate_limit_error');
    }

    // Check daily credit limit
    const creditResult = await checkDailyCreditLimit(req.auth.apiKeyId, req.auth.creditLimit);
    if (!creditResult.allowed) {
      res.setHeader('Retry-After', String(creditResult.retryAfterSeconds));
      return sendApiError(res, 429, 'daily_credit_limit',
        'Daily credit limit exceeded.', 'billing_error');
    }

    next();
  };
}
```

This wrapper is exported and applied by each public API route file (sections 05-08) or as a single middleware on the `/v1` router.

---

## Redis Key Namespace Summary

All Redis keys created by this section:

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `ratelimit:apikey:{keyId}:{minuteTs}` | 120s | Per-key RPM counter |
| `ratelimit:tenant:api:{tenantId}:{minuteTs}` | 120s | Per-tenant RPM counter |
| `creditlimit:apikey:{keyId}:{YYYY-MM-DD}` | Until midnight UTC + 1 day | Daily credit accumulator |
| `idempotency:{tenantId}:{key}` | 24h (or 1h for large responses) | Cached idempotent response |

---

## Integration Notes

- The existing `correlationIdMiddleware` (at `/home/dev/projects/SmartSpecPro/apps/web/server/middleware/correlationId.ts`) already generates `req.requestId` and sets the `X-Request-ID` response header. The public API headers middleware reuses this value.
- The existing `auditMiddleware` (at `/home/dev/projects/SmartSpecPro/apps/web/server/middleware/auditMiddleware.ts`) handles JSONL file-based audit logging via `auditLogger`. The new `apiAuditMiddleware` is separate -- it writes to the `api_audit_events` database table specifically for API key requests. Both can coexist on the same request path.
- Redis access uses `getRedisClient()` from `/home/dev/projects/SmartSpecPro/apps/web/server/services/redis.ts`. The existing rate limiting in `contentAutomationRateLimit.ts` uses the same pattern and can serve as a reference implementation for the mock strategy.
- The `CreditSourceType` union at `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts` (line 16-20) must have the `api_*` source types added by section 01 before the `incrementDailyCredits` function can track per-source credit usage.
- Route handlers in sections 05-08 are responsible for calling `incrementDailyCredits()` after successful credit deduction, and for setting `X-Credits-Used` and `X-Credits-Remaining` response headers. The middleware in this section provides the enforcement check but does not perform credit deduction itself.

---

## SSE Standard for All Public API Streams

Multiple sections (05, 06, 07, 09) expose SSE (Server-Sent Events) endpoints. All SSE responses across the public API **must** follow this standard format:

### SSE Response Headers

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

The `X-Accel-Buffering: no` header is critical -- Nginx buffers SSE by default, causing events to be batched rather than streamed in real-time.

### Heartbeat

All SSE endpoints must send a heartbeat comment to keep connections alive through proxies (Nginx, load balancers):

```
: heartbeat\n\n
```

- **Interval:** 15 seconds for active streams (agency streaming, skill streaming), 30 seconds for polling-based streams (progress, events)
- **Format:** SSE comment (starts with `:`) -- clients ignore these per the SSE spec

### Event Format

Named events use the `event:` field when available:

```
event: job.completed
data: {"type":"job.completed","job_id":"...","timestamp":"..."}\n\n
```

Data-only events (for simple result streaming):

```
data: {"chunk":"partial result..."}\n\n
```

Stream termination:

```
data: [DONE]\n\n
```

### Connection Cleanup

All SSE endpoints must handle client disconnect via `req.on('close', ...)`:
1. Clear heartbeat interval
2. Unsubscribe from Redis Pub/Sub (if applicable)
3. Close any duplicated Redis connections
4. Abort any upstream fetch requests (via `AbortController`)

### Connection Timeout

Set a maximum connection duration to prevent orphan connections:
- **Active streams** (agency, skill): 5 minutes max
- **Progress streams** (presentation generation): 10 minutes max
- **Event streams** (`/v1/events`): 60 minutes max (client should reconnect periodically)

---

## Idempotency Race Condition Handling

The idempotency middleware (section 3 above) has a potential race condition: two concurrent requests with the same `Idempotency-Key` could both miss the Redis cache and both execute the handler.

**Mitigation:** Use Redis `SET ... NX EX` (set-if-not-exists) as a lock before proceeding:

```typescript
// Pseudocode for the idempotency lock pattern
const lockKey = `idempotency:lock:${tenantId}:${idempotencyKey}`;
const acquired = await redis.set(lockKey, "1", "NX", "EX", 60); // 60s lock TTL

if (!acquired) {
  // Another request is processing this key -- wait briefly or return 409
  return sendApiError(res, 409, "idempotency_conflict",
    "A request with this Idempotency-Key is already being processed", "invalid_request_error");
}

try {
  // Check for cached result (may exist from a previous completed request)
  const cached = await redis.get(cacheKey);
  if (cached) { /* return cached */ }

  // Proceed with handler...
} finally {
  // Lock auto-expires via TTL, or explicitly delete after caching result
  await redis.del(lockKey).catch(() => {});
}
```

This ensures exactly-once execution per idempotency key, even under concurrent requests.

---

## Canonical Error Type Reference

All sections (05-13) must use these exact `type` values in error responses. This table is the single source of truth:

| Error Code | Type | HTTP Status |
|------------|------|-------------|
| `invalid_api_key` | `auth_error` | 401 |
| `insufficient_scopes` | `auth_error` | 403 |
| `feature_disabled` | `auth_error` | 403 |
| `rate_limit_exceeded` | `rate_limit_error` | 429 |
| `daily_credit_limit` | `billing_error` | 429 |
| `insufficient_credits` | `billing_error` | 402 |
| `invalid_request` | `invalid_request_error` | 400 |
| `not_found` | `not_found_error` | 404 |
| `internal_error` | `internal_error` | 500 |
| `idempotency_conflict` | `invalid_request_error` | 409 |
| `credit_overflow` | `invalid_request_error` | 400 |
| `invalid_job_type` | `invalid_request_error` | 400 |
| `circular_pipeline_reference` | `invalid_request_error` | 400 |
| `max_template_depth_exceeded` | `invalid_request_error` | 400 |
| `job_not_cancellable` | `invalid_request_error` | 409 |

**Naming convention:** All `type` values use the `_error` suffix consistently. Do NOT use shortened forms like `"auth"`, `"billing"`, `"server_error"`, or `"permission_error"`.

---

## Tenant Isolation Pattern

All public API queries **must** filter by `tenantId` from the authenticated `AuthContext`. The isolation pattern varies by resource:

| Resource | Isolation Method |
|----------|-----------------|
| API keys | Direct `tenantId` column on `api_keys` |
| Skills | Global (not tenant-specific); tenant check via feature flag |
| Agencies | Direct `tenantId` column on `agencies` |
| Agency conversations | JOIN through `agencies.tenantId` (no direct `tenantId` on `agencyConversations`) |
| Presentations/Decks | Via `libraryItems.userId` + `libraryItems.tenantId` (IDOR via ownership chain) |
| Media tasks | Via `userId` from the task's creator |
| Jobs | Direct `tenantId` column on `automation_jobs` |
| Webhook endpoints | Direct `tenantId` column on `api_webhook_endpoints` |
| Audit events | Direct `tenantId` column on `api_audit_events` |

**Cross-tenant access must always return 404, not 403**, to avoid leaking information about resource existence to unauthorized tenants.

---

## Consolidated Middleware Stack & Mounting Order

All sections (03-13) modify `apps/web/server/_core/index.ts`. This is the **single authoritative mounting strategy** that all sections must follow.

### Middleware execution order for `/v1/*` requests

```
1. publicApiCorsMiddleware     ← Section 04 | Handles OPTIONS, sets CORS headers | NO AUTH
2. publicApiHeadersMiddleware  ← Section 04 | Sets X-Request-Id from correlationId | NO AUTH
3. apiKeyAuthMiddleware        ← Section 03 | Calls authorizeRequest(), sets req.auth | FAILS 401
4. publicApiFeatureGuard       ← Section 03 | Checks tenant publicApi flag | FAILS 403
5. rateLimitMiddleware()       ← Section 04 | Per-key + per-tenant RPM, daily credit limit | FAILS 429
6. idempotencyMiddleware()     ← Section 04 | POST only, Redis NX lock + cache | FAILS 409
7. apiAuditMiddleware          ← Section 04 | Hooks res.on('finish'), non-blocking | PASSTHROUGH
8. requireScopes(...)          ← Section 03 | Per-route, checks specific scopes | FAILS 403
9. Route handler               ← Sections 05-11 | Business logic
```

### Consolidated `index.ts` mounting code

```typescript
import { Router } from "express";
import { publicApiCorsMiddleware } from "../middleware/publicApiCors";
import { publicApiHeadersMiddleware } from "../middleware/publicApiHeaders";
import { apiKeyAuthMiddleware } from "../middleware/apiKeyAuth";
import { publicApiFeatureGuard } from "../middleware/publicApiFeatureGuard";
import { rateLimitMiddleware } from "../services/apiKeyRateLimiter";
import { idempotencyMiddleware } from "../middleware/idempotencyMiddleware";
import { apiAuditMiddleware } from "../middleware/apiAuditMiddleware";

// --- Public API sub-router (all /v1/* routes) ---
const publicApiRouter = Router();
publicApiRouter.use(publicApiCorsMiddleware);
publicApiRouter.use(publicApiHeadersMiddleware);
publicApiRouter.use(apiKeyAuthMiddleware);       // sets req.auth
publicApiRouter.use(publicApiFeatureGuard);       // checks publicApi flag
publicApiRouter.use(rateLimitMiddleware());        // RPM + daily credit check
publicApiRouter.use(idempotencyMiddleware());      // POST idempotency with NX lock
publicApiRouter.use(apiAuditMiddleware);           // audit logging

// Route mounts (order does not matter within the sub-router)
publicApiRouter.use("/skills", createPublicSkillsRouter());              // Section 05
publicApiRouter.use("/agencies", publicAgencyRouter);                    // Section 06
publicApiRouter.use("/presentations", createPresentationPublicRouter()); // Section 07
publicApiRouter.use("/video-projects", publicVideoApiRouter);            // Section 08
publicApiRouter.use("/media", publicMediaApiRouter);                     // Section 08
publicApiRouter.post("/mcp", mcpPublicHandler);                          // Section 09
publicApiRouter.use("/jobs", publicJobsRouter);                          // Section 10
publicApiRouter.use("/webhooks", publicWebhooksRouter);                  // Section 11
publicApiRouter.use("/events", publicEventsRouter);                      // Section 11

app.use("/v1", publicApiRouter);

// --- Unauthenticated documentation routes (OUTSIDE the auth middleware stack) ---
registerPublicDocsRoutes(app);                     // Section 13: /v1/openapi.json, /v1/docs
app.get("/.well-known/mcp.json", mcpDiscoveryHandler); // Section 09

// --- Queue initialization ---
initAutomationJobsQueue();         // Section 10
initWebhookApiDeliveryQueue();     // Section 11

// --- Graceful shutdown (in shutdown handler) ---
// await closeAutomationJobsQueue();
// await closeWebhookApiDeliveryQueue();
```

**Key decisions:**
- **Single sub-router** for all `/v1/*` routes — middleware applies once, not per-section
- **Docs routes mounted OUTSIDE the sub-router** — `/v1/docs` and `/v1/openapi.json` are unauthenticated
- **`/.well-known/mcp.json` is unauthenticated** — discovery manifest is public
- **`requireScopes()` is NOT in the sub-router** — applied per-route inside each section's router since different endpoints need different scopes
- **Idempotency middleware includes the NX lock** pattern described above — no per-route implementation needed

---

## Standard HTTP Status Codes

All sections must use these HTTP status codes consistently:

| Operation | Status Code | When |
|-----------|-------------|------|
| GET success | 200 | Resource found and returned |
| POST with immediate result | 200 | Synchronous execution completed |
| POST that creates a resource | 201 | Resource created (job, webhook, API key) |
| POST that queues async work | 202 | Accepted for processing (media generation) |
| DELETE success | 200 | Resource deleted/deactivated |
| Validation error | 400 | Malformed input |
| Auth failure | 401 | Invalid/missing API key |
| Insufficient credits | 402 | Not enough credits |
| Permission denied | 403 | Wrong scope or feature disabled |
| Not found | 404 | Resource doesn't exist or cross-tenant |
| Conflict | 409 | Idempotency conflict, job not cancellable |
| Rate limited | 429 | RPM or daily credit limit exceeded |
| Server error | 500 | Unexpected internal error |

---

## Event Emission Manifest

All public API events emitted via Redis Pub/Sub (consumed by webhooks in section 11 and SSE in `/v1/events`):

| Event Type | Emitted By | Payload Fields | Trigger |
|------------|------------|----------------|---------|
| `job.completed` | Section 10 `jobAutomationService` | `job_id`, `type`, `status`, `credits_used`, `result`, `timestamp` | Job finishes successfully |
| `job.failed` | Section 10 `jobAutomationService` | `job_id`, `type`, `status`, `error`, `timestamp` | Job execution fails |
| `job.progress` | Section 10 `jobAutomationService` | `job_id`, `phase`, `progress_pct`, `timestamp` | Pipeline step completes |
| `media.ready` | Section 08 media service | `task_id`, `media_type`, `result_url`, `timestamp` | Async media generation completes |
| `agency.message` | Section 06 `agencyBridge` | `run_id`, `agency_id`, `message`, `timestamp` | Agency produces a response |
| `credits.low` | **Deferred to v2** | — | Requires background cron scheduler |
| `key.expiring` | **Deferred to v2** | — | Requires background cron scheduler |

**Implementation note:** Sections 06, 08, and 10 must call `emitPublicApiEvent(tenantId, eventType, payload)` (defined in section 11's `webhookDeliveryService.ts`) at the indicated trigger points.

---

## CreditSourceType Mapping

All `api_*` credit source types defined in section 01 and their usage:

| Source Type | Endpoint | Section |
|-------------|----------|---------|
| `api_skill` | `POST /v1/skills/:id/execute` | 05 |
| `api_agency` | `POST /v1/agencies/:id/invoke` | 06 |
| `api_presentation` | `POST /v1/presentations/generate` | 07 |
| `api_media` | `POST /v1/media/{images,videos,audio}/generate` | 08 |
| `api_video_project` | `POST /v1/video-projects` | 08 |
| `api_job` | `POST /v1/jobs` (reservation + usage) | 10 |
| `api_mcp` | MCP tool calls that consume credits | 09 |
| `api_chat` | **Reserved for future `/v1/chat` endpoint** | Not used in this spec |

---

## SSE Heartbeat Per-Endpoint Reference

| Endpoint | Type | Heartbeat | Max Duration |
|----------|------|-----------|--------------|
| `POST /v1/skills/:id/execute?stream=true` | Active | 15s | 5 min |
| `POST /v1/agencies/:id/invoke?stream=true` | Active | 15s | 5 min |
| `GET /v1/agencies/:id/runs/:runId/stream` | Active | 15s | 5 min |
| `GET /v1/presentations/tasks/:taskId/progress` | Progress | 30s | 10 min |
| `GET /v1/events` | Event stream | 30s | 60 min |