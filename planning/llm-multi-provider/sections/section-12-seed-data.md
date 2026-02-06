# Section 12: Seed Data for OpenCode Zen Provider and Free Models

## Overview

Create an idempotent seed script (or migration) that inserts the OpenCode Zen provider and three free model mappings (Kimi K2.5, MiniMax M2.1, GLM 4.7) into the database. The seed must be safe to run multiple times (ON CONFLICT DO NOTHING). Existing OpenRouter data must remain untouched.

**Files to create/modify:**
- `apps/web/drizzle/seed.ts` (or a new seed migration file, depending on project convention)
- Alternatively, add to an existing seed script if one exists

**Dependencies:**
- Section 01 (schema) must be complete — the `llm_providers` and `model_provider_map` tables with new columns must exist

---

## Tests First

Test file: `apps/web/drizzle/seed.test.ts`

Use Vitest. These tests run against a test database (or mock Drizzle queries).

### Idempotency

- Test: Running the seed once inserts the OpenCode Zen provider row into `llm_providers`. Query the table afterward, verify a row with `name: 'OpenCode Zen'` exists.
- Test: Running the seed twice does not create duplicate provider rows. Run seed, run seed again, query `llm_providers` for `name: 'OpenCode Zen'`, verify exactly 1 row.
- Test: Running the seed once inserts 3 model mappings into `model_provider_map`. Query the table for the Zen provider's ID, verify 3 rows.
- Test: Running the seed twice does not create duplicate model mappings. Run seed twice, verify still exactly 3 rows for the Zen provider.

### Data Integrity

- Test: The Zen provider row has correct field values: `name: 'OpenCode Zen'`, `baseUrl: 'https://open-api.zen.com'` (or the actual Zen API base URL), `providerType: 'secondary'`, `isEnabled: true`, `healthStatus: 'healthy'`.
- Test: Each model mapping has `isFree: true` and pricing fields set to 0.
- Test: Each model mapping has the correct `providerModelId` that the Zen API expects.
- Test: Each model mapping has a reasonable `contextLength` value.
- Test: The seed does not modify any existing OpenRouter provider rows. Query OpenRouter rows before and after seed, verify they are unchanged.

### Foreign Key Validity

- Test: All 3 model mappings reference the Zen provider's `providerId` via foreign key. Verify `providerId` on each mapping matches the Zen provider's ID.

---

## Implementation Details

### OpenCode Zen Provider Data

Insert into `llm_providers`:

| Field | Value |
|-------|-------|
| name | OpenCode Zen |
| baseUrl | `https://open-api.zen.com` |
| providerType | `secondary` |
| isEnabled | `true` |
| healthStatus | `healthy` |
| failureCount | `0` |
| successCount | `0` |
| apiKey | (encrypted, see below) |
| configJson | `{"firstChunkTimeoutMs": 15000}` |

The API key for OpenCode Zen should be read from an environment variable (`OPENCODE_ZEN_API_KEY`) at seed time. If the env var is not set, the seed should still insert the provider row but with a null/empty API key and `isEnabled: false`, logging a warning. This allows the schema to be seeded in development without a real key.

### Free Model Mappings

Insert into `model_provider_map` (all referencing the Zen provider):

#### Kimi K2.5

| Field | Value |
|-------|-------|
| modelId | `kimi-k2.5-free` |
| modelName | Kimi K2.5 |
| providerModelId | `kimi-k2.5` |
| pricingInput | `0` |
| pricingOutput | `0` |
| isFree | `true` |
| contextLength | `131072` |
| isEnabled | `true` |
| priority | `0` |

#### MiniMax M2.1

| Field | Value |
|-------|-------|
| modelId | `minimax-m2.1-free` |
| modelName | MiniMax M2.1 |
| providerModelId | `minimax-m2.1` |
| pricingInput | `0` |
| pricingOutput | `0` |
| isFree | `true` |
| contextLength | `245760` |
| isEnabled | `true` |
| priority | `0` |

#### GLM 4.7

| Field | Value |
|-------|-------|
| modelId | `glm-4.7-free` |
| modelName | GLM 4.7 |
| providerModelId | `glm-4.7` |
| pricingInput | `0` |
| pricingOutput | `0` |
| isFree | `true` |
| contextLength | `131072` |
| isEnabled | `true` |
| priority | `0` |

### Seed Script Structure

The seed function should:

1. Insert the OpenCode Zen provider using `INSERT ... ON CONFLICT (name) DO NOTHING` (or the Drizzle equivalent: `db.insert(llmProviders).values({...}).onConflictDoNothing()`). If the project uses a different unique constraint for conflict detection, use the appropriate column.
2. Retrieve the Zen provider's ID (either from the insert result via `RETURNING` or a follow-up `SELECT`).
3. Insert each model mapping using `INSERT ... ON CONFLICT (modelId, providerId) DO NOTHING`.
4. Log a summary: "Seeded OpenCode Zen provider with 3 free models" or "OpenCode Zen already exists, skipping".

```typescript
export async function seedZenProvider(db: DrizzleDB): Promise<void> {
  // 1. Upsert provider
  // 2. Get provider ID
  // 3. Upsert 3 model mappings
  // 4. Log result
}
```

### Default Routing Rule

Also seed a default routing rule for free models:

| Field | Value |
|-------|-------|
| modelPattern | `*-free` |
| routingMode | `cost` |
| providerOrder | `null` (not needed for cost mode) |
| maxFallbacks | `3` |
| isActive | `true` |

This ensures all free models default to cost-based routing (which naturally prefers the free provider). Use `ON CONFLICT DO NOTHING` keyed on `modelPattern`.

### Running the Seed

The seed can be invoked:
- As part of the Drizzle migration (`drizzle-kit migrate` followed by `tsx apps/web/drizzle/seed.ts`)
- Or as a standalone script: `npx tsx apps/web/drizzle/seed.ts`
- Or integrated into the app startup (call `seedZenProvider(db)` during server boot, after migrations run)

The idempotent nature (ON CONFLICT DO NOTHING) makes it safe for any of these approaches. The recommended approach is to call it during server startup after migrations, so new deployments automatically get the seed data.

### Environment Variable

Add `OPENCODE_ZEN_API_KEY` to:
- `apps/web/.env.example` with a placeholder comment
- The `env.ts` validation schema (optional, with a default of empty string)
