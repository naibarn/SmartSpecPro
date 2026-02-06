# Section 02: Provider Health & Circuit Breaker

## Overview

This section implements `providerHealth.ts`, an in-memory circuit breaker service that tracks the health of each LLM provider. It uses three states -- healthy, degraded, and down -- with automatic transitions based on failure rates. The circuit breaker prevents routing to unhealthy providers and supports cooldown-based recovery.

The service is implemented as pure async functions (matching existing service patterns in the codebase). No classes.

**Dependencies:** Section 01 (schema) -- requires `llm_providers` table with `healthStatus`, `lastHealthCheck`, `failureCount`, `successCount` columns.
**Blocks:** Section 04 (llmRouter), Section 06 (llmRoutes).

---

## Tests First

File: `apps/web/server/services/providerHealth.test.ts`

### Health State Transitions
- **Test: New provider defaults to 'healthy'** -- A provider ID not yet tracked should return `getHealthStatus() === 'healthy'`.
- **Test: Recording failures below 5% rate keeps status 'healthy'** -- With 10+ requests in the window where failure rate is under 5%, status stays `'healthy'`.
- **Test: Recording failures above 5% rate transitions to 'degraded'** -- With 10+ requests and failure rate exceeding 5%, status transitions to `'degraded'`.
- **Test: Recording failures above 20% rate transitions to 'down'** -- Status transitions to `'down'` when failure rate exceeds 20%.
- **Test: 'down' provider returns `isAvailable() = false`** -- A provider in 'down' state is not available for routing.
- **Test: 'down' provider with expired cooldown returns `isAvailable() = true`** -- After the 60-second cooldown period expires, the provider becomes available again for a probe request.
- **Test: Successful request after cooldown transitions 'down' -> 'healthy'** -- A `recordSuccess()` call on a provider whose cooldown has expired resets it to 'healthy'.
- **Test: Failure rate dropping below 5% transitions 'degraded' -> 'healthy'** -- As successes accumulate and failure rate drops, status returns to 'healthy'.
- **Test: `getHealthSummary()` returns all tracked providers** -- The summary map includes every provider that has been recorded.

### Persistence
- **Test: `initFromDb()` seeds in-memory state from `llm_providers.healthStatus`** -- On startup, the in-memory map reflects the DB values.
- **Test: Provider marked 'down' in DB starts as 'down' in memory** -- Avoids hitting a known-down provider until enough traffic accumulates.
- **Test: `persistHealth()` writes current status to `llm_providers.healthStatus`** -- The DB column is updated to reflect the in-memory state.

---

## Implementation Details

### File Path

`apps/web/server/services/providerHealth.ts`

### In-Memory State

A module-level `Map<number, ProviderHealthState>` keyed by provider ID. Each entry tracks:

```typescript
interface ProviderHealthState {
  successCount: number       // rolling, reset periodically
  failureCount: number       // rolling, reset periodically
  lastFailureAt: number | null  // timestamp ms
  status: 'healthy' | 'degraded' | 'down'
  cooldownUntil: number | null  // timestamp ms, null if not in cooldown
}
```

### Health Transition Thresholds

- **healthy -> degraded**: Failure rate exceeds 5% (minimum 10 requests in window)
- **degraded -> down**: Failure rate exceeds 20%
- **down -> healthy**: After cooldown period (60 seconds), next `recordSuccess()` call
- **degraded -> healthy**: Failure rate drops below 5%

The cooldown period is 60 seconds. When a provider transitions to 'down', set `cooldownUntil = Date.now() + 60_000`.

### Exported Functions

```typescript
/** Record a successful request to a provider */
function recordSuccess(providerId: number): void

/** Record a failed request to a provider */
function recordFailure(providerId: number, errorType: string): void

/** Get the current health status of a provider */
function getHealthStatus(providerId: number): 'healthy' | 'degraded' | 'down'

/**
 * Check if a provider is available for routing.
 * Returns true if healthy or degraded.
 * Returns true if down but cooldown has expired (probe request).
 * Returns false if down and cooldown is active.
 */
function isAvailable(providerId: number): boolean

/** Get health summary for all tracked providers (for admin dashboard) */
function getHealthSummary(): Map<number, ProviderHealthState>

/** Seed in-memory state from llm_providers.healthStatus on startup */
function initFromDb(db: DbClient): Promise<void>

/** Persist current in-memory health state to llm_providers table */
function persistHealth(db: DbClient): Promise<void>
```

### Persistence Strategy

- Health state is primarily in-memory for performance (every request touches it).
- On startup, call `initFromDb()` to seed the map from `llm_providers.healthStatus` column. This prevents hitting a provider that was known to be down before the process restarted.
- The `persistHealth()` function writes current status to `llm_providers.healthStatus` and `llm_providers.lastHealthCheck`. Call this periodically (every 60 seconds via `setInterval`) and on state changes (transition to 'down' or back to 'healthy').
- The DB columns exist for dashboard display and startup seeding only -- they are not the source of truth at runtime.

### Rolling Window

The success/failure counts should be periodically reset (e.g., every 5 minutes) to prevent stale data from dominating the calculation. Use a simple approach: reset counts on a timer interval. The failure rate calculation is `failureCount / (successCount + failureCount)`.
