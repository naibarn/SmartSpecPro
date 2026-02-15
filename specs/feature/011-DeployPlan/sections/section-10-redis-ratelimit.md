Now I have all the context I need. Let me generate the section content.

# Section 10: Split Redis Strategy and Rate Limiting

## Overview

This section configures a split Redis architecture for the Cloud Run deployment: **Upstash Redis** for stateless operations (rate limiting, locks, dedup, feature flags) and **Google Memorystore Redis** for connection-oriented operations (pub/sub for SSE progress streaming, per-user concurrency tracking). It also migrates the existing in-memory rate limiting to a Redis-backed distributed implementation.

### Why This Matters

The current codebase uses a single Redis instance via IORedis for everything -- BullMQ, Bottleneck rate limiters, pub/sub progress streaming, and ad-hoc caching. In the Cloud Run deployment, this single-instance model breaks down because:

- **Upstash Redis is HTTP-based** and does not support `SUBSCRIBE`/`PSUBSCRIBE` commands. The existing codebase uses pub/sub extensively for real-time SSE progress streaming in `apps/web/server/routers/mediaJobs.ts` (lines ~45-48, 545-615), creating dedicated Redis subscriber connections per client.
- **Cloud Run instances are ephemeral and scale to zero**, making in-memory rate limiters (currently used in `apps/web/server/services/rateLimiter.ts`, `apps/web/server/_core/rateLimitedProcedure.ts`, and `apps/web/server/_core/limits.ts`) ineffective since each instance maintains its own counters.

### Dependencies

- **Section 01 (GCP Bootstrap):** Memorystore instance creation and Secret Manager entries for `REDIS_UPSTASH_URL` and `REDIS_MEMORYSTORE_URL`.
- **Blocked by this section:** Section 15 (Admin Dashboard) reads rate limit counters from Upstash. Section 18 (Auth Hardening) depends on distributed rate limiting being in place.

---

## Tests

All tests below should be created before writing the implementation code. Tests use stubs and mocks -- they do not require actual Redis connections.

### Node.js Tests (Vitest)

#### File: `apps/web/server/services/__tests__/redisClients.test.ts`

```typescript
/**
 * Tests for the RedisClients singleton that manages split Redis connections.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("RedisClients", () => {
  describe("redis.cache (Upstash)", () => {
    it("connects to the REDIS_UPSTASH_URL environment variable");
    it("exposes get/set/del/setnx/expire operations");
    it("throws a descriptive error when REDIS_UPSTASH_URL is not set");
  });

  describe("redis.realtime (Memorystore)", () => {
    it("connects to the REDIS_MEMORYSTORE_URL environment variable");
    it("supports pub/sub subscribe and publish round-trip");
    it("creates duplicate connections for subscriber use cases");
    it("throws a descriptive error when REDIS_MEMORYSTORE_URL is not set");
  });

  describe("graceful shutdown", () => {
    it("disconnects both clients on closeAllRedis()");
    it("handles shutdown gracefully when clients are not initialized");
  });
});
```

#### File: `apps/web/server/services/__tests__/distributedRateLimit.test.ts`

```typescript
/**
 * Tests for the Redis-backed distributed rate limiter middleware.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Distributed Rate Limiter (Node.js)", () => {
  describe("sliding window algorithm", () => {
    it("allows requests within the configured limit and returns 200");
    it("returns 429 with Retry-After header when limit is exceeded");
    it("resets the counter after the window expires");
    it("uses per-IP key for authentication endpoints (login, signup)");
    it("uses per-userId key for job and generate endpoints");
  });

  describe("endpoint-specific limits", () => {
    it("enforces 5 requests/minute for POST /api/auth/login");
    it("enforces 3 requests/minute for POST /api/auth/signup");
    it("enforces 10 requests/minute for POST /api/jobs");
    it("enforces 5 requests/minute for POST /api/generate");
  });

  describe("Redis failure handling", () => {
    it("fails open (allows request) when Upstash is unreachable");
    it("logs a warning when falling back to fail-open mode");
  });
});
```

#### File: `apps/web/server/services/__tests__/pubsub.test.ts`

```typescript
/**
 * Tests for pub/sub progress streaming via Memorystore.
 */
import { describe, it, expect, vi } from "vitest";

describe("Pub/Sub via Memorystore", () => {
  it("publishes progress to a Memorystore channel and delivers to subscriber");
  it("SSE endpoint receives progress updates via Redis subscription");
  it("subscriber cleans up connection on client disconnect");
  it("falls back gracefully when Memorystore is unavailable");
});
```

### Python Tests (pytest)

#### File: `python-backend/tests/test_redis_rate_limit.py`

```python
"""
Tests for the Python-side Redis rate limiting middleware.
"""
import pytest


class TestPythonRateLimiting:
    """Rate limiting middleware for Python FastAPI endpoints."""

    async def test_request_within_limit_is_allowed(self):
        """Requests under the threshold should return normally."""
        ...

    async def test_request_over_limit_returns_429(self):
        """Exceeding the limit should return HTTP 429 with Retry-After."""
        ...

    async def test_rate_limit_key_uses_correct_prefix_and_ttl(self):
        """Keys follow the pattern ratelimit:{endpoint}:{identifier} with window TTL."""
        ...

    async def test_rate_limit_resets_after_window_expiry(self):
        """After the sliding window expires, requests are allowed again."""
        ...

    async def test_fails_open_when_redis_unavailable(self):
        """When Upstash is unreachable, requests are allowed (fail-open)."""
        ...
```

#### File: `python-backend/tests/test_redis_clients.py`

```python
"""
Tests for Python split Redis client configuration.
"""
import pytest


class TestPythonRedisClients:
    """Verify the Python Redis client adapter correctly routes operations."""

    async def test_cache_client_connects_to_upstash_url(self):
        """Cache operations use REDIS_UPSTASH_URL."""
        ...

    async def test_realtime_client_connects_to_memorystore_url(self):
        """Pub/sub operations use REDIS_MEMORYSTORE_URL."""
        ...

    async def test_publish_to_memorystore_channel(self):
        """Publishing progress updates to Memorystore channels works."""
        ...
```

---

## Implementation Details

### 1. Upstash Redis Instance Setup

Create one Upstash Redis instance per environment (staging, production) via the Upstash Console or API. Store the connection URL as `REDIS_UPSTASH_URL` in GCP Secret Manager. The URL format is `rediss://default:<password>@<host>:<port>`.

The Node.js service uses the `@upstash/redis` HTTP client package for Upstash operations. The Python service uses the `upstash-redis` Python SDK. Both use HTTP-based transports, making them compatible with Cloud Run's stateless scaling model.

**What Upstash handles:**
- Rate limiting sliding window counters (keys: `ratelimit:{endpoint}:{identifier}`)
- Job locks via `SETNX` with TTL to prevent double-start
- Webhook dedup keys with 24h TTL
- Feature flag storage (e.g., `USE_CLOUD_TASKS`)
- Session cache (optional, DB remains source of truth)

### 2. Google Memorystore Redis Instance

Create a Google Memorystore for Redis instance (Basic tier, 1 GiB, same region as Cloud Run) via `gcloud`. Store the URL as `REDIS_MEMORYSTORE_URL` in Secret Manager. Memorystore provides a standard Redis protocol over a VPC-internal IP -- it requires Cloud Run to be configured with a VPC connector.

**What Memorystore handles:**
- Pub/sub for SSE progress streaming (channel: `media-job-progress:{jobId}`)
- Per-user concurrency tracking (Redis Set: `media-jobs:user:{userId}:active`)
- Bottleneck rate limiter state for LLM providers (existing IORedis-based Bottleneck integration in `apps/web/server/services/llmRateLimiter.ts` continues to use Memorystore since Bottleneck requires IORedis with blocking operations)

### 3. Node.js Redis Adapter

#### File to create: `apps/web/server/services/redisClients.ts`

Create a `RedisClients` singleton module that replaces the current `apps/web/server/services/redis.ts`. The new module exposes two named clients:

- `redis.cache` -- An `@upstash/redis` client connected to `REDIS_UPSTASH_URL`. Used for rate limiting, locks, dedup, flags. Accessed via HTTP (no persistent connection).
- `redis.realtime` -- An IORedis client connected to `REDIS_MEMORYSTORE_URL`. Used for pub/sub, concurrency sets, and Bottleneck state. Maintains a persistent TCP connection.

The module should export:

```typescript
// Upstash client for stateless operations
export function getCacheClient(): UpstashRedis;

// IORedis client for connection-oriented operations
export function getRealtimeClient(): IORedis;

// Create a duplicate IORedis connection for subscriber use cases
export function createRealtimeSubscriber(): IORedis;

// Health checks
export async function isCacheHealthy(): Promise<boolean>;
export async function isRealtimeHealthy(): Promise<boolean>;

// Graceful shutdown
export async function closeAllRedis(): Promise<void>;
```

Environment variables read:
- `REDIS_UPSTASH_URL` -- Required for cache client
- `REDIS_MEMORYSTORE_URL` -- Required for realtime client
- `REDIS_URL` -- Fallback for local development (single Redis, both clients point to it)

When `REDIS_URL` is set and the Upstash/Memorystore-specific variables are not, both clients should connect to the single local Redis instance. This preserves the local development experience.

### 4. Update Existing Redis Usage

All files currently importing from `apps/web/server/services/redis.ts` must be updated to use the appropriate client from `redisClients.ts`. The mapping is:

| Current usage | New client | Files affected |
|---|---|---|
| `getRedisClient()` for pub/sub in SSE progress | `getRealtimeClient()` / `createRealtimeSubscriber()` | `apps/web/server/routers/mediaJobs.ts` |
| `getRedisClient()` for Bottleneck datastore | `getRealtimeClient()` | `apps/web/server/services/llmRateLimiter.ts` |
| `getRedisClient()` for BullMQ | **Removed** (BullMQ is being removed in section 05) | `apps/web/server/services/scheduler.ts` |
| `createRedisConnection()` for subscriber | `createRealtimeSubscriber()` | `apps/web/server/routers/mediaJobs.ts` |
| `getRedisClient()` for locks/dedup/flags | `getCacheClient()` | `apps/web/server/services/telegramService.ts`, `apps/web/server/jobs/gdriveSessionCleanup.ts`, `apps/web/server/jobs/purgeOldTrashItems.ts` |
| `isRedisAvailable()` / `isRedisHealthy()` | `isCacheHealthy()` / `isRealtimeHealthy()` | `apps/web/server/_core/index.ts`, health check endpoints |

The old `apps/web/server/services/redis.ts` should be retained temporarily with a deprecation comment, forwarding calls to the new module to avoid breaking imports during the migration. It can be removed once all call sites are updated.

### 5. Distributed Rate Limiting Middleware (Node.js)

#### File to create: `apps/web/server/middleware/distributedRateLimit.ts`

Replace the in-memory rate limiters in `apps/web/server/services/rateLimiter.ts` and `apps/web/server/_core/limits.ts` with a Redis-backed implementation using Upstash. The sliding window algorithm uses sorted sets in Redis (same pattern as the existing `python-backend/app/core/distributed_rate_limiter.py`).

The middleware should be an Express middleware function that:

1. Extracts the identifier: IP address (from `X-Forwarded-For` header) for auth endpoints, or `userId` (from the authenticated session) for job/generate endpoints.
2. Constructs the Redis key: `ratelimit:{endpoint}:{identifier}`.
3. Executes the sliding window check against Upstash:
   - `ZREMRANGEBYSCORE` to prune expired entries.
   - `ZCARD` to count current entries.
   - If count >= limit: return HTTP 429 with `Retry-After` header (seconds until oldest entry expires).
   - If count < limit: `ZADD` the current timestamp, `EXPIRE` the key with window + buffer.
4. On Upstash errors: fail open (allow the request) and log a warning.

**Endpoint-specific rate limits:**

| Endpoint pattern | Limit | Window | Identifier |
|---|---|---|---|
| `POST /api/auth/login` | 5 | 60s | IP |
| `POST /api/auth/signup` | 3 | 60s | IP |
| `POST /api/jobs` | 10 | 60s | userId |
| `POST /api/generate` | 5 | 60s | userId |

The existing in-memory rate limiters (`rateLimiter.ts`, `rateLimitedProcedure.ts`, `limits.ts`) should be updated to delegate to the distributed implementation when Upstash is available, falling back to in-memory when not (for local development).

### 6. Distributed Rate Limiting Middleware (Python)

#### File to modify: `python-backend/app/core/distributed_rate_limiter.py`

The Python backend already has a `DistributedRateLimiter` class that uses sorted sets with Redis. This needs to be updated to use the Upstash Redis URL (`REDIS_UPSTASH_URL`) instead of the general `REDIS_URL`. The existing implementation pattern is sound; the changes are:

1. Update the client initialization in `get_distributed_rate_limiter()` to read from `settings.REDIS_UPSTASH_URL`.
2. Update `python-backend/app/core/redis_client.py` to expose two client factories: `get_cache_redis()` (Upstash) and `get_realtime_redis()` (Memorystore).
3. The `RATE_LIMIT_CONFIGS` dictionary already has sensible defaults. Verify they align with the Node.js side limits or adjust as needed.

#### File to modify: `python-backend/app/core/redis_client.py`

Restructure to provide two client getters:

```python
async def get_cache_redis() -> Optional[Redis]:
    """Get Upstash Redis client for stateless operations (rate limit, locks, dedup)."""
    ...

async def get_realtime_redis() -> Optional[Redis]:
    """Get Memorystore Redis client for pub/sub and connection-oriented ops."""
    ...
```

The existing `get_redis()` function should remain as a compatibility shim that returns the cache client (or a single local Redis for development).

### 7. Python Pub/Sub Update

#### File affected: `python-backend/app/tasks/media_job_worker.py`

The media job worker publishes progress updates to Redis channels. These calls must use the Memorystore client instead of the general Redis client:

```python
# Before
redis = await get_redis()
await redis.publish(f"media-job-progress:{job_id}", json.dumps(progress_data))

# After
redis = await get_realtime_redis()
await redis.publish(f"media-job-progress:{job_id}", json.dumps(progress_data))
```

### 8. Environment Configuration

Add the following environment variables to GCP Secret Manager and Cloud Run service configurations:

| Variable | Value source | Used by |
|---|---|---|
| `REDIS_UPSTASH_URL` | Upstash Console | Node.js + Python Cloud Run Services |
| `REDIS_MEMORYSTORE_URL` | GCP Memorystore instance IP | Node.js + Python Cloud Run Services |
| `REDIS_URL` | Local `.env` only | Local development (both clients use this) |

For Cloud Run, the Memorystore connection requires a **Serverless VPC Access connector** in the same region. This connector allows Cloud Run instances to reach the VPC-internal Memorystore IP. The connector is created during GCP bootstrap (Section 01) if not already present.

### 9. Packages to Install

**Node.js (`apps/web/package.json`):**
- `@upstash/redis` -- HTTP-based Redis client for Upstash

IORedis is already installed.

**Python (`python-backend/requirements.txt`):**
- `upstash-redis` -- Python SDK for Upstash Redis (optional; the existing `redis` package can also connect to Upstash via `rediss://` URLs, but the Upstash SDK handles HTTP transport natively for serverless environments)

### 10. Migration Path for Existing Rate Limiters

The codebase has three separate rate limiting implementations that need to converge:

1. **`apps/web/server/services/rateLimiter.ts`** -- In-memory sliding window. Used by skill detection, media generation, registration, group/share operations. Update `createRateLimiter` to optionally back by Upstash when available.

2. **`apps/web/server/_core/rateLimitedProcedure.ts`** -- In-memory tRPC middleware. Update to delegate to the new distributed middleware.

3. **`apps/web/server/_core/limits.ts`** -- Express middleware with `rateLimit()`. Update to use the distributed implementation from `distributedRateLimit.ts`.

The in-memory fallback should be retained for:
- Local development without Redis
- Graceful degradation if Upstash is temporarily unreachable

### 11. Concurrency Tracking Update

The media jobs router (`apps/web/server/routers/mediaJobs.ts`) uses Redis Set operations (`SADD`, `SREM`, `SCARD`) on keys like `media-jobs:user:{userId}:active` to track per-user concurrency (max 3 concurrent jobs). These operations should use the **Memorystore** client since they are colocated with the pub/sub progress channels for the same job lifecycle.

---

## Verification Checklist

After implementation, verify each of the following:

1. `getCacheClient()` successfully connects to Upstash and can `SET`/`GET` a test key.
2. `getRealtimeClient()` successfully connects to Memorystore and can `PING`.
3. A subscriber created with `createRealtimeSubscriber()` receives messages published by `getRealtimeClient()`.
4. Rate limiting returns 429 after exceeding the configured limit for login, signup, jobs, and generate endpoints.
5. The `Retry-After` header value is correct (seconds remaining in the window).
6. Rate limit counters reset after the window expires.
7. When Upstash is unreachable, requests are allowed (fail-open) and a warning is logged.
8. The SSE progress endpoint in `mediaJobs.ts` continues to receive real-time updates via Memorystore pub/sub.
9. Bottleneck LLM rate limiters in `llmRateLimiter.ts` continue to function with Memorystore IORedis.
10. Local development with only `REDIS_URL` set works identically to current behavior (both clients use the single local Redis).