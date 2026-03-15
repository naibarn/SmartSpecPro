# Research Notes: Feature 041 — Intelligent Skill Model Selection

## Architecture Summary

The system has TWO separate model tracking systems:
1. **`llmProviders.availableModels`** — JSON array on the provider record. `modelSyncService.ts` syncs OpenRouter/API model lists here. This is the "catalog."
2. **`model_provider_map` table** — Individual rows per (modelId × providerId) pair. Created by admin action (bulk-enable or upsert). This is what actually routes requests.

Flow: OpenRouter API → modelSyncService → `llmProviders.availableModels` (JSON) → Admin enables models → `model_provider_map` rows created.

---

## Key Findings

### 1. modelSyncService.ts — Catalog Sync (NOT model_provider_map rows)

`modelSyncService.ts` (`syncProviderModels()`) syncs to `llmProviders.availableModels` JSON array, NOT to `model_provider_map` table. It:
- Merges existing models with API results (never removes)
- Updates pricing/contextLength if changed
- Sets `createdAt` from OpenRouter's `created` Unix timestamp
- **Never sets priority** (no priority field in `SyncedModel` type)
- Does NOT write `model_provider_map` rows

`model_provider_map` rows are created via admin UI:
- `upsertModelMapping` (individual mapping CRUD)
- `bulkSetAdminModelCatalogEnabled` (bulk enable from catalog, sets `priority: item.priority ?? 0`)

**Priority gap:** When admin enables a model from the catalog, `priority` defaults to 0.

### 2. skillExecutionPolicy.ts — No Capability Filtering

`resolveSkillExecutionPolicy()` (lines 47-93):
- Loads all enabled models via `loadEnabledLlmModelRows()` (from `enabledLlmModels.ts`)
- Tries preferences in order: `[llmModelId, defaultModel, conversationModel]`
- Returns first enabled match or system default
- **`executionPolicyJson` is never read** — confirmed in code
- **No capability filtering at all**

`SkillExecutionPolicyResult` returns: `{ modelId, preferredProviderId, strictProviderPin, modelSource }`

### 3. model_provider_map — Capability Columns Exist but Unused

7 boolean capability columns all exist but are never filtered on during model selection:
- `supportsResponses`, `supportsStructuredOutputs`, `supportsWebSearch`
- `supportsFunctionTools`, `supportsCodeExecution`, `supportsComputerUse`, `supportsBackground`
- `contextLength` (integer, exists but not used as filter)

Note: `supportsVision` is NOT a column in `model_provider_map`. It's in `llmProviders.configJson` as a legacy provider-level flag. This is a gap.

### 4. skills.executionPolicyJson — Rich Type, Weak Validation

`SkillExecutionPolicyConfig` type (packages/skills/src/types.ts) is fully defined:
- `mode: "requirements" | "fixed" | "hybrid"` — execution mode
- `requirements: { supportsFunctionTools, supportsStructuredOutputs, ... contextLength }` — capability filter
- `preferredStrategy: "cheapest" | "fastest" | "best"` — ranking preference
- `budgetClass: "economy" | "standard" | "premium"` — cost tier
- `disallowedModels: string[]` — blocklist

The `skills.update` tRPC mutation validates only Spec 038 fields (citation/content quality) — `requirements` field is NOT in the Zod input validation. The JSON column accepts anything.

Frontmatter parsing: `skillRegistry.ts` stores `execution_policy` or `executionPolicy` directly into `executionPolicyJson` — no validation.

### 5. MultiProviderAdmin.tsx — Priority is Editable (Via Full Form)

Priority IS editable today via the full "Edit Mapping" dialog (`upsertModelMapping` mutation). However:
- No dedicated quick-edit field for priority alone
- Dialog requires filling all fields (providerModelId, pricing, etc.)
- Priority shown as read-only label in row cards (not inline-editable)
- Admin catalog view (`filterAdminModelCatalogRows`) does NOT sort by priority — uses name sort

The `upsertModelMapping` mutation accepts `priority: z.number().int().default(0)`.

### 6. No `priorityManualOverride` Flag

There is no mechanism to mark a priority as "manually set." Re-syncing would not affect `model_provider_map` directly (sync only updates `llmProviders.availableModels` JSON). But `bulkSetAdminModelCatalogEnabled` sets `priority: item.priority ?? 0` which would reset to 0 if admin re-runs bulk enable.

To protect manual priorities, we need either:
- A `priorityIsManual: boolean` flag in `model_provider_map`
- Or a convention: "if priority !== 0, never auto-overwrite"

### 7. SkillDefinition Type (from @smartspec/skills)

Fields relevant to model selection:
```typescript
{
  llmModelId?: string;
  defaultModel?: string;
  preferredProviderId?: number;
  strictProviderPin?: boolean;
  executionPolicy?: SkillExecutionPolicyConfig;  // populated from executionPolicyJson
}
```

`executionPolicy` IS loaded from DB into `SkillDefinition` — just never consumed by `resolveSkillExecutionPolicy()`.

### 8. Testing Setup

Tests use Vitest + `@vitest/coverage-v8`. Integration tests exist for skills router. Model policy tests can be unit-tested by mocking `loadEnabledLlmModelRows()`. DB-level tests use real DB (no mocking per project convention).

---

## Implementation Readiness Matrix

| Component | Status | Gap |
|-----------|--------|-----|
| model_provider_map capability columns | ✅ Exists | Not used in queries |
| executionPolicyJson type | ✅ Complete | requirements not in Zod validation |
| Priority column in model_provider_map | ✅ Exists | Always 0 for new entries |
| Priority editable in admin UI | ⚠️ Via full form | No quick-edit; no inline editor |
| Admin catalog view sorted by priority | ❌ Missing | Sorted by name only |
| resolveSkillExecutionPolicy capability filter | ❌ Missing | Reads only llmModelId/defaultModel |
| selectBestLlmModel() service | ❌ Missing | Does not exist |
| Priority auto-assignment when enabling models | ❌ Missing | Always defaults to 0 |
| supportsVision in model_provider_map | ❌ Missing | In provider.configJson (wrong level) |
| Zod validation for requirements in skills.update | ❌ Missing | No validation |
| Frontmatter: model_requirements parsing | ❌ Missing | Only llmModelId parsed |

---

## Implications for Feature Design

### Priority Assignment
Priority is set when admin enables a model from catalog (via `bulkSetAdminModelCatalogEnabled`). We need a scoring function called BEFORE insertion:
```
score(model) = recencyPoints + cheapnessPoints + capabilityPoints
```
- recencyPoints: 0–40 based on `createdAt` (last 30 days = 40pts)
- cheapnessPoints: 0–30 based on pricingInput+pricingOutput (free = 30pts)
- capabilityPoints: 0–30 based on count of `true` capability flags (7 flags × ~4pts each)
- Final priority = 100 - score (lower = higher = better)

Idempotency: add `priorityLocked: boolean` column to model_provider_map (or use convention: priority > 0 set by admin = locked).

### Capability-Aware Selection
New function `selectBestLlmModel(requirements, rows)`:
1. Filter rows WHERE all requirements match (AND logic)
2. If no matches: return null (fall back to unfiltered)
3. Sort by priority (ascending)
4. Return modelId of first match

Wire into `resolveSkillExecutionPolicy()`:
- If `skill.executionPolicy?.mode === "requirements"` AND `skill.executionPolicy?.requirements` exists → use `selectBestLlmModel()`
- Otherwise: existing cascade unchanged (backward compatible)

### Auto LLM Suggestion
New mode in `executionPolicyJson.mode = "requirements"`. When active:
- Skip `llmModelId`/`defaultModel` hard-coded lookups
- Call `selectBestLlmModel(requirements, allEnabledRows)`
- Return best match or fallback to system default
- Emit audit event with `{ modelSource: "requirements_match", matchedRequirements: {...} }`

### supportsVision Gap
Add `supportsVision: boolean` column to `model_provider_map`. Requires migration.
Migration: `ALTER TABLE model_provider_map ADD COLUMN "supportsVision" boolean DEFAULT false`
Then: during model sync or admin catalog, populate based on model ID patterns (same patterns as current `getVisionModelOptions()`).
OR: Scope V1 to the 7 existing capability columns and leave vision as out-of-scope.

### Admin UI — Priority Quick-Edit
Add inline number input in the model mapping row (no dialog needed):
- Input on blur → call new `multiProvider.updateModelPriority({ mappingId, priority })` mutation
- Debounced to avoid spam
- Add tooltip: "Lower = higher priority. 0 = auto-assigned."
- Show lock icon when `priorityLocked = true`
