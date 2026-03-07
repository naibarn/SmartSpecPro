# Section 01: Database and Configuration Changes

## Overview

This section adds the GPT-5.4 entry to `model_provider_map`, verifies the `apiStyle` enum includes `"responses"`, configures the `responsesApi` feature flag, and seeds required system settings. It is a prerequisite for every other section in Feature 032.

**Corresponds to**: Plan Section 9 (Database + Configuration Changes)

**Dependencies**: None -- this is the first section to implement.

**Blocks**: All other sections (01 through 09 in the section manifest).

---

## Tests

All tests go in a single file. The tests validate that the database configuration is correct and that the existing model resolution and feature flag infrastructure work with the new entries.

**File**: `apps/web/server/__tests__/gpt54ModelConfig.test.ts`

```typescript
// Test: resolveProviderModelAny("gpt-5.4") returns correct provider config
//   - providerModelId should be "gpt-5.4"
//   - apiStyle should be "responses"

// Test: apiStyle "responses" routes to /v1/responses endpoint
//   - Call resolveApiUrl(baseUrl, "gpt-5.4", providerName, "responses")
//   - Expect URL ending in /v1/responses

// Test: pricing matches spec (input: 2.50, output: 15.00 per 1M tokens)
//   - Query model_provider_map for modelId "gpt-5.4"
//   - Assert pricingInput === "2.50000000" and pricingOutput === "15.00000000"

// Test: feature flag responsesApi gates access (global + per-tenant)
//   - When global flag is false: getTenantFeatureFlag("responsesApi", tenantId) returns false
//   - When global flag is true but tenant flag is false: returns false
//   - When global flag is true and no tenant override: returns true (falls through)
//   - When tenant flag is true: returns true regardless of global

// Test: system settings return defaults when no tenant override exists
//   - Query system_settings for vision_model default -> "gpt-4o"
//   - Query system_settings for max_search_calls_per_request -> 5
//   - Query system_settings for max_credits_per_request default -> 500
//   - Query system_settings for max_browser_sessions default -> 3
```

**Testing approach**: These tests need database access. They should query real rows inserted by the seed script or migration. For the feature flag tests, mock Redis via the existing test utilities (the `featureFlags.ts` service reads from Redis, so mock `getRedisClient()`). For `resolveProviderModelAny`, either query the DB directly or mock the Drizzle query layer depending on the project's existing test patterns.

---

## Implementation Details

### 1. Verify `apiStyleEnum` includes `"responses"`

**File**: `apps/web/drizzle/schema.ts` (line 30)

The enum already includes `"responses"`:

```typescript
export const apiStyleEnum = pgEnum("api_style", ["chat-completions", "responses", "messages", "gemini"]);
```

No schema change needed. The database `api_style` PostgreSQL enum already has this value.

### 2. Insert GPT-5.4 into `model_provider_map`

This is a **data insert**, not a schema migration. Create a seed script or use direct SQL.

**File to create**: `apps/web/scripts/seed-gpt54.ts` (or add to existing seed logic)

The insert requires a valid `providerId` referencing the `llm_providers` table. The implementer must query for the OpenAI provider row (or the relevant provider that hosts GPT-5.4) to get its `id`.

**Insert values**:

| Column | Value |
|--------|-------|
| `modelId` | `"gpt-5.4"` |
| `providerId` | (query from `llm_providers` where provider is OpenAI or the relevant host) |
| `modelName` | `"GPT-5.4"` |
| `providerModelId` | `"gpt-5.4"` |
| `pricingInput` | `"2.50"` (per 1M input tokens) |
| `pricingOutput` | `"15.00"` (per 1M output tokens) |
| `isFree` | `false` |
| `contextLength` | `128000` (or as documented by OpenAI) |
| `isEnabled` | `true` |
| `priority` | `0` |
| `apiStyle` | `"responses"` |

**Idempotency**: Use an upsert (`INSERT ... ON CONFLICT (modelId, providerId) DO UPDATE`) to make the script safe to re-run.

**SQL equivalent**:

```sql
INSERT INTO model_provider_map (
  "modelId", "providerId", "modelName", "providerModelId",
  "pricingInput", "pricingOutput", "isFree", "contextLength",
  "isEnabled", "priority", "apiStyle"
)
SELECT
  'gpt-5.4',
  p.id,
  'GPT-5.4',
  'gpt-5.4',
  2.50000000,
  15.00000000,
  false,
  128000,
  true,
  0,
  'responses'
FROM llm_providers p
WHERE p."providerName" ILIKE '%openai%'
   OR p."providerName" ILIKE '%opencode%'
LIMIT 1
ON CONFLICT ("modelId", "providerId") DO UPDATE SET
  "pricingInput" = EXCLUDED."pricingInput",
  "pricingOutput" = EXCLUDED."pricingOutput",
  "apiStyle" = EXCLUDED."apiStyle",
  "isEnabled" = EXCLUDED."isEnabled";
```

The implementer should verify the correct provider name by checking `SELECT id, "providerName" FROM llm_providers;` before running.

### 3. Configure Feature Flags

**No code changes needed** -- the feature flag infrastructure already exists in `apps/web/server/services/featureFlags.ts`. The functions `getFeatureFlag`, `getTenantFeatureFlag`, `setFeatureFlag`, and `setTenantFeatureFlag` all work with Redis keys.

**Configuration steps** (Redis CLI or admin UI):

```bash
# Global flag (default OFF until ready for rollout)
redis-cli SET "feature-flag:responsesApi" "false"

# Per-tenant override (enable for specific tenants during staged rollout)
# redis-cli SET "feature-flag:responsesApi:{tenantId}" "true"
```

The flag name `responsesApi` is used by `getTenantFeatureFlag("responsesApi", tenantId)` in the Responses API route (Section 03). This section only ensures the flag exists with a default value.

### 4. Seed System Settings

**File**: `apps/web/scripts/seed-gpt54.ts` (same script as the model insert, or separate)

Insert default system settings rows into the `system_settings` table. The table schema (from `drizzle/schema.ts` line 2578) has columns: `id`, `category`, `key`, `value`, `description`, `isSensitive`, `createdAt`, `updatedAt`.

**Rows to insert**:

| Category | Key | Value | Description |
|----------|-----|-------|-------------|
| `automation` | `vision_model` | `"gpt-4o"` | Default vision model for automation copilot |
| `llm` | `max_search_calls_per_request` | `"5"` | Max web_search calls per Responses API request |
| `llm` | `max_credits_per_request` | `"500"` | Default credit budget cap per request |
| `automation` | `max_browser_sessions` | `"3"` | Max concurrent browser sessions per tenant |

**Notes**:
- Values are stored as strings in the `value` column (the `system_settings` table uses `text` type for values).
- These are global defaults. Per-tenant overrides use keys like `vision_model_{tenantId}` (as referenced in Plan Section 3).
- Use `INSERT ... ON CONFLICT` or check-before-insert to make the script idempotent.
- None of these settings are sensitive (`isSensitive: false`).

### 5. Verify `resolveApiUrl` handles `apiStyle: "responses"`

**File**: `apps/web/server/_core/llmRoutes.ts` (line 483)

The existing `resolveApiUrl` function already handles the `"responses"` apiStyle for OpenCode Zen providers (line 497-498):

```typescript
case 'responses':
  return base.includes("/v1") ? `${base}/responses` : `${base}/v1/responses`;
```

If GPT-5.4 is served through OpenAI directly (not OpenCode Zen), the implementer should verify that the provider name triggers the correct URL resolution path. The function dispatches based on `providerLower.includes('opencode')` or `providerLower.includes('zen')`. For a standard OpenAI provider, the default path appends `/chat/completions` which is wrong for a `"responses"` apiStyle model.

**Action needed**: Check whether `resolveApiUrl` needs a fallback case that respects `apiStyle: "responses"` for non-OpenCode providers. If GPT-5.4 is accessed through an OpenCode Zen provider, no change is needed. If accessed through a direct OpenAI provider entry, add a general `apiStyle` check before the provider-specific branches.

---

## Verification Steps

After implementation, verify:

1. **Model resolution**: Run the test file to confirm `resolveProviderModelAny("gpt-5.4")` returns the correct `providerModelId` and `apiStyle`.

2. **Database row**: Query directly:
   ```sql
   SELECT "modelId", "providerModelId", "pricingInput", "pricingOutput", "apiStyle", "isEnabled"
   FROM model_provider_map
   WHERE "modelId" = 'gpt-5.4';
   ```

3. **Feature flag**: Verify the Redis key exists:
   ```bash
   redis-cli GET "feature-flag:responsesApi"
   ```

4. **System settings**: Query defaults:
   ```sql
   SELECT category, key, value FROM system_settings
   WHERE key IN ('vision_model', 'max_search_calls_per_request', 'max_credits_per_request', 'max_browser_sessions');
   ```

5. **No schema migration needed**: The `api_style` enum already includes `"responses"`. Confirm with:
   ```sql
   SELECT unnest(enum_range(NULL::api_style));
   ```

6. **Existing tests pass**: Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test` to confirm no regressions.

---

## Rollback

- **GPT-5.4 model entry**: Set `isEnabled = false` in `model_provider_map` -- the model will no longer resolve.
- **Feature flag**: `redis-cli SET "feature-flag:responsesApi" "false"` -- the Responses API endpoint returns 404.
- **System settings**: The default rows are inert when no code reads them. They can be deleted but do no harm if left in place.
