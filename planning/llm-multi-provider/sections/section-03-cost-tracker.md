# Section 03: Cost Tracker

## Overview

This section implements `costTracker.ts`, a service responsible for logging every LLM request to the `provider_usage_log` table and providing aggregation queries for admin and user dashboards. It also defines the cost calculation priority chain.

The service is implemented as pure async functions (no classes), matching the existing service pattern.

**Dependencies:** Section 01 (schema) -- requires `provider_usage_log` and `model_provider_map` tables.
**Blocks:** Section 06 (llmRoutes).

---

## Tests First

File: `apps/web/server/services/costTracker.test.ts`

### Request Logging
- **Test: `logRequest()` inserts row into `provider_usage_log`** -- After calling `logRequest()`, verify a matching row exists in the table with all fields correctly populated.
- **Test: Failed requests logged with `errorType` and `statusCode`** -- A failed request should still be logged with the appropriate error classification.
- **Test: Fallback requests logged with `wasFallback: true` and `fallbackFromProviderId`** -- When a fallback occurred, both fields are populated.

### Cost Calculation
- **Test: Provider-reported cost (`usage.cost`) used when available** -- When the provider response includes a cost field, that value is used directly.
- **Test: Model pricing from `model_provider_map` used as fallback** -- When no provider-reported cost exists, calculate from `pricingInput`/`pricingOutput` in the map table.
- **Test: Default pricing (1.00/4.00 per 1M tokens) used when model not in map** -- When the model is not found in `model_provider_map`, fall back to default rates.
- **Test: Free model returns cost = 0** -- When `isFree` is true in `model_provider_map`, cost is always 0.

### Dashboard Aggregation
- **Test: `getAdminUsageStats()` aggregates by provider, model, date range** -- Returns total requests, total cost, cost per provider, cost per model, error rates, top users.
- **Test: `getUserUsageStats()` returns only the specified user's data** -- Filtering by userId returns only that user's requests.
- **Test: Date range filtering works correctly** -- Only rows within the specified date range are included in aggregation.

---

## Implementation Details

### File Path

`apps/web/server/services/costTracker.ts`

### Request Logging

```typescript
function logRequest(params: {
  userId: number
  providerId: number
  modelUsed: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  creditsCharged: number
  responseTimeMs: number
  statusCode: number
  errorType?: string
  wasFallback: boolean
  fallbackFromProviderId?: number
}): Promise<void>
```

This inserts a row into `provider_usage_log`. It is called by `llmRouter` after every provider attempt, including failures. This enables tracking of error rates and fallback patterns.

### Cost Calculation

The cost calculation function determines the USD cost of a request. It follows a priority chain:

```typescript
function calculateCost(params: {
  providerReportedCost?: number   // from provider response (e.g., OpenRouter usage.cost)
  modelId: string
  inputTokens: number
  outputTokens: number
  db: DbClient
}): Promise<number>
```

**Priority order:**
1. **Provider-reported cost** -- If the provider response includes `usage.cost`, use it directly. This is the most accurate.
2. **Model pricing from `model_provider_map`** -- Query the table for `pricingInput` and `pricingOutput` for the given model. Calculate: `(inputTokens / 1_000_000 * pricingInput) + (outputTokens / 1_000_000 * pricingOutput)`.
3. **Default pricing** -- If the model is not found in the map, use defaults: 1.00 per 1M input tokens, 4.00 per 1M output tokens.

For free models (`isFree = true` in `model_provider_map`), cost is always 0 regardless of token counts.

### Dashboard Aggregation

```typescript
interface UsageStats {
  totalRequests: number
  totalCostUsd: number
  costByProvider: Array<{ providerId: number; providerName: string; totalCost: number; requestCount: number }>
  costByModel: Array<{ model: string; totalCost: number; requestCount: number }>
  errorRate: number
  topUsers: Array<{ userId: number; totalCost: number; requestCount: number }>
}

function getAdminUsageStats(filters: {
  dateRange: { start: Date; end: Date }
  providerId?: number
  userId?: number
}): Promise<UsageStats>
```

```typescript
interface UserUsageStats {
  totalRequests: number
  totalCostUsd: number
  totalCreditsUsed: number
  modelBreakdown: Array<{ model: string; requestCount: number; creditsUsed: number }>
}

function getUserUsageStats(
  userId: number,
  dateRange: { start: Date; end: Date }
): Promise<UserUsageStats>
```

Both functions query `provider_usage_log` with aggregation. The admin version supports optional filters by provider and user. The user version is scoped to a single user.

Index usage: queries filter on `(userId, createdAt)` and `(providerId, createdAt)` indexes defined in Section 01.
