# Section 08: tRPC Endpoints for Multi-Provider System

## Overview

This section adds new tRPC procedures to the existing `llmProviders` tRPC router. These endpoints expose model mapping CRUD, routing rule CRUD, provider health queries, and usage statistics for both admin and user roles. The frontend sections (09, 10, 11) depend on these endpoints.

**File to modify:** `apps/web/server/routers/llmProviders.ts`

**Dependencies:**
- Section 01 (schema) must be complete — the `model_provider_map`, `routing_rules`, and `provider_usage_log` tables must exist
- Section 03 (costTracker) must be complete — `getAdminUsageStats()` and `getUserUsageStats()` are called by the tRPC procedures

---

## Tests First

Test file: `apps/web/server/routers/llmProviders.test.ts`

Use the existing Vitest + tRPC `createCaller(context)` pattern with `createAdminContext` and `createUserContext` factories.

### Auth Guards

- Test: Admin endpoints (`listModelMappings`, `upsertModelMapping`, `deleteModelMapping`, `listRoutingRules`, `upsertRoutingRule`, `deleteRoutingRule`, `getProviderHealth`, `getAdminUsageStats`) reject non-admin users with an authorization error.
- Test: User endpoints (`getAvailableModelsWithProviders`, `getUserUsageStats`) reject unauthenticated requests.

### Model Mapping CRUD

- Test: `listModelMappings` returns all mappings grouped by model (admin only). Seed two models each with two providers, verify the response groups them by `modelId` and includes pricing, `isFree`, `isEnabled`, and `priority` fields.
- Test: `upsertModelMapping` creates a new mapping when no existing (modelId, providerId) pair exists. Verify it appears in subsequent `listModelMappings` call.
- Test: `upsertModelMapping` updates an existing mapping (change pricing). Verify the old row is updated, not duplicated.
- Test: `deleteModelMapping` removes a mapping by its ID. Verify it no longer appears in `listModelMappings`.

### Routing Rules CRUD

- Test: `listRoutingRules` returns all active rules ordered by specificity (exact > glob > wildcard).
- Test: `upsertRoutingRule` validates `modelPattern` format — accepts `"*"`, `"kimi-*"`, and exact model IDs; rejects empty strings.
- Test: `upsertRoutingRule` creates a new rule. Verify fields: `modelPattern`, `routingMode`, `providerOrder`, `maxFallbacks`, `isActive`.
- Test: `deleteRoutingRule` removes a rule by its ID.

### Provider Health

- Test: `getProviderHealth` returns health status for all providers. Each entry includes `providerId`, `status` (healthy/degraded/down), `failureCount`, `successCount`, and `lastHealthCheck`.

### Usage Stats

- Test: `getAdminUsageStats` returns aggregated data filtered by date range. Response includes `totalRequests`, `totalCostUsd`, breakdowns by provider and model.
- Test: `getUserUsageStats` returns only the calling user's data. Seed usage logs for two users, call as user A, verify only user A's data is returned.

### Available Models (User-Facing)

- Test: `getAvailableModelsWithProviders` returns models with their provider options and pricing. Each model entry includes: `modelId`, `modelName`, `providers` array (each with `providerId`, `providerName`, `providerModelId`, `pricingInput`, `pricingOutput`, `isFree`, `isEnabled`).
- Test: Disabled models (`isEnabled: false`) are excluded from the response.
- Test: Disabled providers (provider-level `isEnabled: false`) are excluded.

---

## Implementation Details

### New Admin Procedures

All admin procedures use the existing admin guard pattern (check `ctx.user.role === 'admin'`).

#### `listModelMappings`

Query procedure. Joins `model_provider_map` with `llm_providers` to include provider name. Returns results grouped by `modelId`. No input parameters.

```typescript
listModelMappings: adminProcedure.query(async ({ ctx }) => {
  // SELECT mpm.*, lp.name as providerName
  // FROM model_provider_map mpm
  // JOIN llm_providers lp ON mpm.providerId = lp.id
  // ORDER BY mpm.modelId, mpm.priority
  // Group results by modelId in application code
})
```

#### `upsertModelMapping`

Mutation procedure. Input schema (Zod):

```typescript
z.object({
  id: z.number().optional(),         // present for update, absent for create
  modelId: z.string().min(1).max(128),
  providerId: z.number(),
  modelName: z.string().min(1).max(128),
  providerModelId: z.string().min(1).max(256),
  pricingInput: z.number().min(0),   // per 1M tokens
  pricingOutput: z.number().min(0),
  isFree: z.boolean(),
  contextLength: z.number().int().positive(),
  isEnabled: z.boolean(),
  priority: z.number().int().default(0),
})
```

Uses Drizzle `INSERT ... ON CONFLICT (modelId, providerId) DO UPDATE` when `id` is not provided. When `id` is provided, uses `UPDATE ... WHERE id = ?`.

#### `deleteModelMapping`

Mutation procedure. Input: `z.object({ id: z.number() })`. Deletes from `model_provider_map` by primary key.

#### `listRoutingRules`

Query procedure. Returns all rows from `routing_rules` ordered by specificity (exact matches first, then globs, then wildcard `"*"`). Sorting is done application-side: rules without `*` sort first, then rules with trailing `*`, then the bare `"*"`.

#### `upsertRoutingRule`

Mutation procedure. Input schema:

```typescript
z.object({
  id: z.number().optional(),
  modelPattern: z.string().min(1).max(128),
  routingMode: z.enum(['cost', 'quality', 'priority']),
  providerOrder: z.array(z.number()).optional(), // required when routingMode is 'priority'
  maxFallbacks: z.number().int().min(0).max(10).default(3),
  isActive: z.boolean().default(true),
})
```

Validation: if `routingMode` is `'priority'`, `providerOrder` must be a non-empty array. Reject empty `modelPattern`.

#### `deleteRoutingRule`

Mutation procedure. Input: `z.object({ id: z.number() })`. Deletes from `routing_rules` by primary key.

#### `getProviderHealth`

Query procedure. Reads health state from the `providerHealth` service (in-memory via `getHealthSummary()`) and joins with `llm_providers` for provider names. Returns an array of objects with `providerId`, `providerName`, `status`, `failureCount`, `successCount`, `lastHealthCheck`.

#### `getAdminUsageStats`

Query procedure. Input:

```typescript
z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  providerId: z.number().optional(),
  userId: z.number().optional(),
})
```

Delegates to `costTracker.getAdminUsageStats()`. Returns `totalRequests`, `totalCostUsd`, `totalCreditsCharged`, `byProvider` (array of per-provider aggregates), `byModel` (array of per-model aggregates), `errorRate`.

### New User Procedures

User procedures use the existing auth guard (check `ctx.user` exists).

#### `getAvailableModelsWithProviders`

Query procedure. No input. Queries `model_provider_map` joined with `llm_providers` where both the mapping and the provider are enabled. Groups by `modelId` and returns each model with its available providers array. This replaces the current flat `availableModels` query.

#### `getUserUsageStats`

Query procedure. Input:

```typescript
z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
})
```

Delegates to `costTracker.getUserUsageStats(ctx.user.id, dateRange)`. Returns `totalRequests`, `totalCostUsd`, `totalCreditsCharged`, `byModel` array.

### Updates to Existing Endpoints

#### `llmProviders.update`

Add support for the new `providerType` column in the update mutation's Zod schema. Add `providerType: z.enum(['primary', 'secondary', 'fallback']).optional()` to the input.

#### `llmProviders.list`

Include `healthStatus`, `providerType`, `failureCount`, `successCount` in the response shape. These come directly from the `llm_providers` table columns added in section 01.

---

## Key Design Decisions

- All model mapping and routing rule CRUD is admin-only. Regular users only see the read-only `getAvailableModelsWithProviders` endpoint.
- Provider health is read from in-memory state (section 02's `providerHealth` service), not directly from the DB, to ensure real-time accuracy.
- Usage stats queries delegate to `costTracker` (section 03) which handles the SQL aggregation, keeping the tRPC layer thin.
- The `getAvailableModelsWithProviders` endpoint is the primary data source for the frontend model selector (section 09).
