# Section 10: Redis Rate Limit — Code Review Interview

## Findings Triage

### Fixed:

1. **Redis key injection (HIGH)** — Added `sanitizeKeyComponent()` that strips colons, slashes, wildcards, null bytes, and path traversal sequences. Truncates to 128 chars. Applied to all identifier values before Redis key construction.

### Deferred (user approved):

2. **Race condition in sliding window** — Same pattern as existing Python rate limiter. Acceptable for rate limiting where off-by-one under extreme concurrency is tolerable.

3. **IORedis vs @upstash/redis** — IORedis works with Upstash via `rediss://` protocol. Simpler approach, no new dependency. Can migrate to HTTP client later if needed.

4-6. **Existing code migration** — Updating 9+ files to use new clients is a separate migration task. New modules are ready for incremental adoption.

7-9. **Missing features/tests** — pubsub.test.ts, existing rate limiter delegation, concurrency tracking updates. Scope-limited for safety.

10-14. Low priority items deferred.

## Test Results

- Node.js: 16/16 pass (redisClients + distributedRateLimit)
- Python: 8/8 pass (redis clients + rate limiting)
- No regressions (all 62 existing Node.js tests pass)
