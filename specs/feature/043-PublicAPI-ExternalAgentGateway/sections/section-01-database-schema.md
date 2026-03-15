Now I have all the context I need. Let me produce the section content.

# Section 01 -- Database Schema & Foundation

## Overview

This section adds the foundational database schema required by the Public API & External Agent Gateway feature (043). It creates five new tables, adds columns to three existing tables, registers a new feature flag, and extends the credit source type union. All downstream sections depend on this schema being in place.

**Files to create or modify:**

- `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` -- add 5 new tables, modify 3 existing tables
- `/home/dev/projects/SmartSpecPro/apps/web/shared/featureFlags.ts` -- add `publicApi` flag
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts` -- extend `CreditSourceType` union
- `/home/dev/projects/SmartSpecPro/apps/web/shared/publicApiTypes.ts` -- new file for shared type definitions (scopes list, AuthContext stub)

**Dependencies:** None. This is the first section and blocks all others.

---

## Tests (write these first)

All tests use Vitest. Place the schema test file at `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/publicApiSchema.test.ts`.

### Schema Structure Tests

These tests validate that the Drizzle schema definitions compile correctly and that the table shapes match expectations. They do NOT require a running database -- they import the schema objects and inspect their column metadata.

```
Test: api_keys table has correct columns — id (varchar 36), tenantId (varchar 36), userId (integer), name (varchar 100), keyPrefix (varchar 16), keyHash (varchar 128), scopes (json), rateLimit (integer, default 60), creditLimit (integer, nullable), expiresAt (timestamp, nullable), lastUsedAt (timestamp, nullable), isActive (boolean, default true), metadata (json, nullable), createdAt, updatedAt

Test: api_keys.keyHash has a unique index

Test: api_keys.tenantId is varchar(36), NOT integer — must match tenants.id type

Test: api_audit_events table has correct columns — id (bigserial PK), tenantId (varchar 36), userId (integer), apiKeyId (varchar 36), traceId (varchar 36), method (varchar 10), path (varchar 255), statusCode (integer), creditsUsed (integer), latencyMs (integer), ip (varchar 45), userAgent (text), requestMeta (json), createdAt (timestamp)

Test: api_audit_events has composite index on (tenantId, createdAt)

Test: api_webhook_endpoints table has correct columns — id (varchar 36), tenantId (varchar 36), apiKeyId (varchar 36, nullable, ON DELETE SET NULL), url (varchar 2048), secretEncrypted (text), events (json), retryPolicy (varchar 20, default 'exponential'), isActive (boolean, default true), lastDeliveredAt (timestamp, nullable), failureCount (integer, default 0), createdAt, updatedAt

Test: api_webhook_endpoints.apiKeyId ON DELETE SET NULL works correctly (verify FK constraint definition)

Test: api_webhook_deliveries table has correct columns — id (bigserial), webhookEndpointId (FK), eventType (varchar 50), payload (json), statusCode (integer, nullable), attempt (integer, default 1), deliveredAt (timestamp, nullable), error (text, nullable), createdAt

Test: automation_jobs table has correct columns — id (varchar 36), tenantId (varchar 36), userId (integer), apiKeyId (varchar 36), type (varchar 50), status (varchar 20), params (json), result (json), error (json), progress (integer, default 0), creditsReserved (integer), creditsUsed (integer), callbackUrl (varchar 2048, nullable), callbackSecretEncrypted (text, nullable), parentJobId (varchar 36, nullable), stepIndex (integer, nullable), traceId (varchar 36), idempotencyKey (varchar 64, nullable, unique), startedAt, completedAt, createdAt, expiresAt

Test: automation_jobs.idempotencyKey has a unique constraint
```

### Existing Table Column Addition Tests

```
Test: conversations table now has source (varchar 20, default 'web'), apiKeyId (varchar 36, nullable), expiresAt (timestamp, nullable)

Test: agencyConversations table now has source (varchar 20, default 'web'), apiKeyId (varchar 36, nullable), expiresAt (timestamp, nullable)

Test: providerUsageLog table now has apiKeyId (varchar 36, nullable)
```

### Feature Flag Tests

Place at `/home/dev/projects/SmartSpecPro/apps/web/shared/__tests__/publicApiFeatureFlag.test.ts`.

```
Test: TenantFeatureFlags interface includes publicApi as boolean
Test: publicApi defaults to false in FEATURE_FLAG_DEFAULTS
Test: ALLOWED_FEATURE_FLAGS set includes "publicApi"
```

### CreditSourceType Tests

Place at `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/publicApiCreditSourceTypes.test.ts`.

```
Test: CreditSourceType union includes api_chat
Test: CreditSourceType union includes api_skill
Test: CreditSourceType union includes api_agency
Test: CreditSourceType union includes api_job
Test: CreditSourceType union includes api_mcp
Test: CreditSourceType union includes api_media
Test: CreditSourceType union includes api_presentation
Test: CreditSourceType union includes api_video_project
```

A practical way to test the type union is to write a function that assigns each literal string to a `CreditSourceType` variable -- if any are invalid, TypeScript compilation will fail (caught by `pnpm check`). Additionally, write a runtime test that asserts these strings are accepted by `deductCredits` without type errors by passing them as the `sourceType` field.

---

## Implementation Details

### 1. Update Drizzle Import

In `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`, the existing import on line 1 includes `bigint` but not `bigserial`. Add `bigserial` to the import from `drizzle-orm/pg-core`. The current import is:

```typescript
import { integer, pgEnum, pgTable, text, timestamp, varchar, json, jsonb, boolean, numeric, serial, uniqueIndex, index, foreignKey, bigint, check, type AnyPgColumn } from "drizzle-orm/pg-core";
```

Add `bigserial` to this list.

### 2. New Table: `api_keys`

Central API key registry. Add to `drizzle/schema.ts`:

- **PK:** `id` -- `varchar("id", { length: 36 }).primaryKey()` (UUID generated at insert time)
- **`tenantId`** -- `varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id)` -- CRITICAL: this is `varchar(36)` to match `tenants.id` type. Do NOT use integer.
- **`userId`** -- `integer("userId").notNull().references(() => users.id)` -- the user who created the key
- **`name`** -- `varchar("name", { length: 100 }).notNull()` -- human-readable label
- **`keyPrefix`** -- `varchar("keyPrefix", { length: 16 }).notNull()` -- first 16 chars for display (e.g., `sk-ssp_abc12...`)
- **`keyHash`** -- `varchar("keyHash", { length: 128 }).notNull()` -- HMAC-SHA256 hash, must be unique
- **`scopes`** -- `json("scopes").$type<string[]>().notNull()` -- array of scope strings like `["skills:list", "skills:execute"]`
- **`rateLimit`** -- `integer("rateLimit").default(60).notNull()` -- requests per minute
- **`creditLimit`** -- `integer("creditLimit")` -- daily credit cap; null means unlimited
- **`expiresAt`** -- `timestamp("expiresAt", { withTimezone: true })` -- nullable, key expiry
- **`lastUsedAt`** -- `timestamp("lastUsedAt", { withTimezone: true })` -- nullable, updated async on use
- **`isActive`** -- `boolean("isActive").default(true).notNull()`
- **`metadata`** -- `json("metadata").$type<Record<string, unknown>>()` -- nullable freeform metadata
- **`createdAt`** -- `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()`
- **`updatedAt`** -- `timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull()`

**Indexes** (in the table's third argument function):
- `uniqueIndex("api_keys_key_hash_idx").on(t.keyHash)` -- unique lookup index for key validation (hot path)
- `index("api_keys_tenant_idx").on(t.tenantId)` -- list keys by tenant
- `index("api_keys_user_idx").on(t.userId)` -- list keys by user

Export `ApiKey` and `InsertApiKey` inferred types.

### 3. New Table: `api_audit_events`

Audit trail for all API key requests. 90-day retention (enforced by a cleanup job, not by schema).

- **PK:** `id` -- `bigserial("id", { mode: "number" }).primaryKey()` -- bigserial for high-volume inserts. Note: Drizzle's `bigserial` requires a `mode` parameter; use `"number"` since audit IDs will not exceed JS safe integer range at expected scale.
- **`tenantId`** -- `varchar("tenantId", { length: 36 }).notNull()`
- **`userId`** -- `integer("userId").notNull()`
- **`apiKeyId`** -- `varchar("apiKeyId", { length: 36 }).notNull()`
- **`traceId`** -- `varchar("traceId", { length: 36 })` -- correlation ID for cross-service tracing
- **`method`** -- `varchar("method", { length: 10 }).notNull()` -- HTTP method (GET, POST, etc.)
- **`path`** -- `varchar("path", { length: 255 }).notNull()` -- request path
- **`statusCode`** -- `integer("statusCode")` -- HTTP response status
- **`creditsUsed`** -- `integer("creditsUsed").default(0)` -- credits consumed
- **`latencyMs`** -- `integer("latencyMs")` -- request duration
- **`ip`** -- `varchar("ip", { length: 45 })` -- client IP (supports IPv6)
- **`userAgent`** -- `text("userAgent")` -- client user agent string
- **`requestMeta`** -- `json("requestMeta").$type<Record<string, unknown>>()` -- sanitized request summary (never include secrets)
- **`createdAt`** -- `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()`

**Indexes:**
- `index("api_audit_events_tenant_created_idx").on(t.tenantId, t.createdAt)` -- time-range queries per tenant
- `index("api_audit_events_api_key_idx").on(t.apiKeyId)` -- per-key queries
- `index("api_audit_events_trace_idx").on(t.traceId)` -- trace correlation

No foreign keys on this table -- it is a log table that should not cascade-delete when keys are revoked.

### 4. New Table: `api_webhook_endpoints`

Outbound webhook registration.

- **PK:** `id` -- `varchar("id", { length: 36 }).primaryKey()`
- **`tenantId`** -- `varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id)`
- **`apiKeyId`** -- `varchar("apiKeyId", { length: 36 }).references(() => apiKeys.id, { onDelete: "set null" })` -- nullable, SET NULL if key is deleted
- **`url`** -- `varchar("url", { length: 2048 }).notNull()` -- HTTPS-only, SSRF-validated at write time (not by schema)
- **`secretEncrypted`** -- `text("secretEncrypted").notNull()` -- AES-256-GCM encrypted signing secret via `crypto.ts`
- **`events`** -- `json("events").$type<string[]>().notNull()` -- event types to subscribe to
- **`retryPolicy`** -- `varchar("retryPolicy", { length: 20 }).default("exponential").notNull()` -- `'exponential'` or `'none'`
- **`isActive`** -- `boolean("isActive").default(true).notNull()`
- **`lastDeliveredAt`** -- `timestamp("lastDeliveredAt", { withTimezone: true })`
- **`failureCount`** -- `integer("failureCount").default(0).notNull()`
- **`createdAt`** -- `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()`
- **`updatedAt`** -- `timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull()`

**Indexes:**
- `index("api_webhook_endpoints_tenant_idx").on(t.tenantId)`
- `index("api_webhook_endpoints_api_key_idx").on(t.apiKeyId)`

### 5. New Table: `api_webhook_deliveries`

Delivery log with retry tracking. Child of `api_webhook_endpoints`.

- **PK:** `id` -- `bigserial("id", { mode: "number" }).primaryKey()`
- **`webhookEndpointId`** -- `varchar("webhookEndpointId", { length: 36 }).notNull().references(() => apiWebhookEndpoints.id, { onDelete: "cascade" })`
- **`eventType`** -- `varchar("eventType", { length: 50 }).notNull()`
- **`payload`** -- `json("payload").$type<Record<string, unknown>>().notNull()`
- **`statusCode`** -- `integer("statusCode")` -- nullable, null if delivery failed before getting a response
- **`attempt`** -- `integer("attempt").default(1).notNull()`
- **`deliveredAt`** -- `timestamp("deliveredAt", { withTimezone: true })` -- nullable, set on successful delivery
- **`error`** -- `text("error")` -- nullable error message
- **`createdAt`** -- `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()`

No additional indexes beyond the FK. Queries on this table are typically by `webhookEndpointId` which is already indexed via the FK.

### 6. New Table: `automation_jobs`

Async job queue records for the Job Automation API.

- **PK:** `id` -- `varchar("id", { length: 36 }).primaryKey()` -- format `job_{uuid}`
- **`tenantId`** -- `varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id)`
- **`userId`** -- `integer("userId").notNull().references(() => users.id)`
- **`apiKeyId`** -- `varchar("apiKeyId", { length: 36 }).notNull()`
- **`type`** -- `varchar("type", { length: 50 }).notNull()` -- validated at application layer against `VALID_JOB_TYPES`
- **`status`** -- `varchar("status", { length: 20 }).default("pending").notNull()` -- pending, running, completed, failed, cancelled
- **`params`** -- `json("params").$type<Record<string, unknown>>()`
- **`result`** -- `json("result").$type<Record<string, unknown>>()`
- **`error`** -- `json("error").$type<Record<string, unknown>>()`
- **`progress`** -- `integer("progress").default(0).notNull()` -- 0-100 percent
- **`creditsReserved`** -- `integer("creditsReserved").default(0).notNull()`
- **`creditsUsed`** -- `integer("creditsUsed").default(0).notNull()`
- **`callbackUrl`** -- `varchar("callbackUrl", { length: 2048 })` -- nullable webhook URL for completion
- **`callbackSecretEncrypted`** -- `text("callbackSecretEncrypted")` -- nullable, AES-256-GCM encrypted
- **`parentJobId`** -- `varchar("parentJobId", { length: 36 })` -- nullable, for pipeline steps
- **`stepIndex`** -- `integer("stepIndex")` -- nullable, position in pipeline
- **`traceId`** -- `varchar("traceId", { length: 36 })`
- **`idempotencyKey`** -- `varchar("idempotencyKey", { length: 64 })` -- nullable, unique
- **`startedAt`** -- `timestamp("startedAt", { withTimezone: true })`
- **`completedAt`** -- `timestamp("completedAt", { withTimezone: true })`
- **`createdAt`** -- `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()`
- **`expiresAt`** -- `timestamp("expiresAt", { withTimezone: true })`

**Indexes:**
- `index("automation_jobs_tenant_status_idx").on(t.tenantId, t.status)` -- list jobs by tenant filtered by status
- `index("automation_jobs_api_key_idx").on(t.apiKeyId)` -- list jobs by key
- `uniqueIndex("automation_jobs_idempotency_idx").on(t.idempotencyKey)` -- idempotency constraint
- `index("automation_jobs_parent_idx").on(t.parentJobId)` -- pipeline step lookup

### 7. Column Additions to Existing Tables

#### `conversations` table (line ~1273 in schema.ts)

Add three columns after the existing columns:

- `source` -- `varchar("source", { length: 20 }).default("web")` -- identifies origin: `'web'`, `'api'`, `'widget'`
- `apiKeyId` -- `varchar("apiKeyId", { length: 36 })` -- nullable, no FK (the api_keys table may not exist when old conversations were created; ON DELETE SET NULL would be ideal but the column is nullable and the key service handles cleanup)
- `expiresAt` -- `timestamp("expiresAt", { withTimezone: true })` -- nullable, auto-expire API-created conversations

All three columns are nullable with defaults, so this is a safe additive migration on an existing table with data.

#### `agencyConversations` table (line ~4613 in schema.ts)

Add the same three columns:

- `source` -- `varchar("source", { length: 20 }).default("web")`
- `apiKeyId` -- `varchar("apiKeyId", { length: 36 })`
- `expiresAt` -- `timestamp("expiresAt", { withTimezone: true })`

#### `providerUsageLog` table (line ~715 in schema.ts)

Add one column:

- `apiKeyId` -- `varchar("apiKeyId", { length: 36 })` -- nullable, tracks which API key triggered this LLM usage

### 8. Feature Flag: `publicApi`

In `/home/dev/projects/SmartSpecPro/apps/web/shared/featureFlags.ts`:

1. Add `publicApi: boolean;` to the `TenantFeatureFlags` interface (add as F19 with comment `// F19 -- Public API & External Agent Gateway`)
2. Add `"publicApi"` to the `ALLOWED_FEATURE_FLAGS` set
3. Add `publicApi: false` to `FEATURE_FLAG_DEFAULTS` -- disabled by default; this is the kill switch for all API key authentication

### 9. CreditSourceType Extension

In `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts`, extend the `CreditSourceType` union (line ~16) to include the eight new API source types:

```
| "api_chat" | "api_skill" | "api_agency" | "api_job"
| "api_mcp" | "api_media" | "api_presentation" | "api_video_project"
```

**Note on `api_chat`:** This source type is **reserved for a future `/v1/chat` endpoint** and is NOT used by any section in this spec. It is included now so the type union does not need to be modified when the chat API is added later. All other seven source types are actively used by sections 05-10.

These are appended to the existing union. No other changes to `creditService.ts` are needed in this section.

### 10. Shared Types File

Create `/home/dev/projects/SmartSpecPro/apps/web/shared/publicApiTypes.ts` with:

- **`ALLOWED_API_SCOPES`** -- a `readonly string[]` containing all 15 valid scope strings: `skills:list`, `skills:execute`, `agencies:list`, `agencies:invoke`, `presentations:create`, `video_projects:create`, `media:generate`, `llm:chat`, `mcp:read`, `mcp:write`, `jobs:create`, `jobs:read`, `webhooks:manage`, `events:read`, `api_keys:manage`
- **`AuthContext`** type stub -- this type is used by sections 02 and 03 and defined here so both can import it:

```typescript
export interface AuthContext {
  userId: number;
  tenantId: string;  // varchar(36) -- NOT integer
  mode: 'session' | 'api_key';
  apiKeyId?: string;
  scopes?: string[];
}
```

- **`VALID_JOB_TYPES`** -- a `readonly string[]` containing: `skill_execution`, `media_generation`, `agency_run`, `batch_skill`, `presentation_create`, `video_project_create`, `pipeline`
- **`MAX_SINGLE_JOB_CREDITS`** -- `10_000` constant for credit overflow guard

### 11. Migration Execution

After all schema changes are saved in `drizzle/schema.ts`, run the migration:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm db:push
```

This generates a new migration SQL file (will be numbered `0073_*.sql` based on the current highest migration `0072_red_zuras.sql`) and applies it.

**Database Safety Protocol reminders:**
- Before running `pnpm db:push`, backup the affected existing tables (`conversations`, `agency_conversations`, `provider_usage_log`) using `pg_dump`
- Record row counts before migration
- After migration, verify row counts are unchanged (all changes are additive -- new tables and nullable columns)
- The new tables will be empty after migration, which is expected

---

## Verification Checklist

After implementation, verify:

1. `pnpm check` passes in `apps/web/` (TypeScript compilation succeeds with new types)
2. `pnpm test` passes (all new tests green)
3. Migration applied successfully (`pnpm db:push` completes without errors)
4. Row counts for `conversations`, `agency_conversations`, `provider_usage_log` are unchanged after migration
5. New tables exist and are empty: `api_keys`, `api_audit_events`, `api_webhook_endpoints`, `api_webhook_deliveries`, `automation_jobs`
6. Feature flag `publicApi` defaults to `false` when queried for any tenant
7. All 8 `api_*` credit source types are accepted by TypeScript without errors