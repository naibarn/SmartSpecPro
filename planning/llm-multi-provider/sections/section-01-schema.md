# Section 01: Database Schema Changes

## Overview

This section defines all database schema changes required for the LLM multi-provider system. SmartSpecPro currently uses a single `llm_providers` table. This section extends that table and adds three new tables: `model_provider_map`, `provider_usage_log`, and `routing_rules`.

All schema is defined in Drizzle ORM in `apps/web/drizzle/schema.ts`. Migrations are generated via `drizzle-kit generate` and applied via `drizzle-kit migrate`.

**Dependencies:** None (this is the foundation for all other sections).
**Blocks:** All other sections depend on this schema.

---

## Tests First

File: `apps/web/server/schema.test.ts`

These tests validate that the migration produces the expected tables and constraints. They run against a test database.

- **Test: New tables are created by migration** -- After running the migration, `model_provider_map`, `provider_usage_log`, and `routing_rules` tables must exist.
- **Test: `llm_providers` has new columns** -- The columns `providerType`, `healthStatus`, `lastHealthCheck`, `failureCount`, `successCount` must exist on `llm_providers` after migration.
- **Test: `model_provider_map` unique constraint on (modelId, providerId) rejects duplicates** -- Inserting two rows with the same `modelId` and `providerId` must throw a unique constraint violation.
- **Test: Seed data inserts are idempotent** -- Running the seed script twice must not error (uses `ON CONFLICT DO NOTHING`).
- **Test: Foreign key constraints on `provider_usage_log`** -- Inserting a row with a non-existent `userId` or `providerId` must fail with a foreign key violation.

---

## Implementation Details

### 1. Extend `llm_providers` Table

Add the following columns to the existing `llm_providers` table in `apps/web/drizzle/schema.ts`:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `providerType` | VARCHAR | `'primary'` | Classification: `'primary'`, `'secondary'`, `'fallback'` |
| `healthStatus` | VARCHAR | `'healthy'` | `'healthy'`, `'degraded'`, `'down'` -- managed at runtime by circuit breaker, persisted for dashboard and startup seeding |
| `lastHealthCheck` | TIMESTAMPTZ | `null` | Last time health was evaluated |
| `failureCount` | INTEGER | `0` | Rolling failure count |
| `successCount` | INTEGER | `0` | Rolling success count |

### 2. New Table: `model_provider_map`

Maps which providers offer which models. Replaces the `availableModels` JSON column approach with a queryable relational structure.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `modelId` | VARCHAR(128) | Canonical model identifier, e.g. `"kimi-k2.5-free"`. Used internally by frontend and routing. |
| `providerId` | INTEGER FK -> llm_providers.id | |
| `modelName` | VARCHAR(128) | Human-readable display name |
| `providerModelId` | VARCHAR(256) | The provider-specific model string sent in API requests (e.g., `"anthropic/claude-3.5-sonnet"` for OpenRouter, `"kimi-k2.5"` for Zen). This is what gets sent to the upstream API. |
| `pricingInput` | NUMERIC(12,8) | Cost per 1M input tokens (0 for free) |
| `pricingOutput` | NUMERIC(12,8) | Cost per 1M output tokens (0 for free) |
| `isFree` | BOOLEAN | Default `false` |
| `contextLength` | INTEGER | |
| `isEnabled` | BOOLEAN | Default `true` |
| `priority` | INTEGER | Default `0`. Lower = higher priority within this provider. |

**Constraints:**
- Unique constraint on `(modelId, providerId)`

### 3. New Table: `provider_usage_log`

Per-request tracking for dashboards and cost reconciliation.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `userId` | INTEGER FK -> users.id | |
| `providerId` | INTEGER FK -> llm_providers.id | |
| `modelUsed` | VARCHAR(128) | |
| `inputTokens` | INTEGER | |
| `outputTokens` | INTEGER | |
| `costUsd` | NUMERIC(12,8) | Provider-reported or calculated |
| `creditsCharged` | INTEGER | |
| `responseTimeMs` | INTEGER | |
| `statusCode` | INTEGER | |
| `errorType` | VARCHAR(64) | Nullable. Values: `'rate_limit'`, `'timeout'`, `'server_error'` |
| `wasFallback` | BOOLEAN | Default `false` |
| `fallbackFromProviderId` | INTEGER FK | Nullable |
| `createdAt` | TIMESTAMPTZ | Default `NOW()` |

**Indexes:**
- `(userId, createdAt)` -- for user dashboard aggregation
- `(providerId, createdAt)` -- for admin dashboard aggregation

### 4. New Table: `routing_rules`

Admin-configured routing preferences per model pattern.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `modelPattern` | VARCHAR(128) | Glob-style: `"*"`, `"kimi-*"`, or exact model ID. Precedence: exact match > prefix glob > wildcard. Multiple matching rules resolved most-specific-first. Matching done application-side. |
| `routingMode` | VARCHAR(32) | `'cost'`, `'quality'`, `'priority'` |
| `providerOrder` | JSON | Array of provider IDs for priority mode |
| `maxFallbacks` | INTEGER | Default `3` |
| `isActive` | BOOLEAN | Default `true` |
| `createdAt` | TIMESTAMPTZ | Default `NOW()` |

### 5. Migration Strategy

1. Define all tables/columns in `apps/web/drizzle/schema.ts`
2. Run `drizzle-kit generate` to produce the migration SQL
3. Run `drizzle-kit migrate` to apply
4. After migration, run seed script to insert OpenCode Zen provider row and `model_provider_map` entries for the 3 free models using idempotent inserts (`ON CONFLICT DO NOTHING`). Existing OpenRouter data remains untouched.

### 6. File Paths

- Schema definition: `apps/web/drizzle/schema.ts`
- Generated migration: `apps/web/drizzle/migrations/` (auto-generated by drizzle-kit)
- Test file: `apps/web/server/schema.test.ts`
