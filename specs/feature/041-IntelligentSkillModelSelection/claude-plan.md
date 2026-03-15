# Implementation Plan — Feature 041: Intelligent Skill Model Selection

## Overview

This plan implements capability-aware, priority-driven automatic LLM model selection for skills. Skills declare what they need (capabilities, context size); the system picks the best available model at runtime. New models automatically improve skill execution as they are added.

The implementation has eight sequentially-dependent sections. Database migration runs first. The core selector service is built before being wired into the policy resolver. Admin UI follows after the backend mutations exist.

---

## Section 01: Database Migration

### Purpose
Add two columns to `model_provider_map` that the rest of this feature depends on.

### What to build

**Column 1: `supportsVision boolean DEFAULT false`**

The current codebase tracks vision support at the provider level (`llmProviders.configJson.supportsVision`), not per model. This is wrong — many providers offer both vision and text-only models. Skills that require image analysis need per-model vision metadata.

**Column 2: `priorityLocked boolean DEFAULT false`**

When the system auto-assigns a priority score to a newly enabled model, we need to know later whether an admin has since overridden that value. `priorityLocked = true` means "hands off — admin set this manually." Auto-scoring logic checks this flag and skips locked entries.

### Steps

1. Edit `apps/web/drizzle/schema.ts`:
   - Add `supportsVision: boolean("supportsVision").default(false)` to `modelProviderMap` table
   - Add `priorityLocked: boolean("priorityLocked").default(false)` to `modelProviderMap` table

2. Run `cd apps/web && pnpm db:push` to generate the migration SQL and apply it.

3. Verify: confirm both columns appear in the database with correct defaults.

4. **Optional backfill** (not required for the feature to work, but improves immediately for existing rows):
   After migration, existing `model_provider_map` rows have `priority = 0` and `priorityLocked = false`.
   A one-time admin action can recompute priorities for all rows using `computeModelPriority()`.
   Provide a tRPC admin mutation `multiProvider.backfillModelPriorities` that iterates unlocked rows
   and applies computed scores. This is idempotent and safe to re-run.

### Backward compatibility

Both columns default to `false`. All existing queries, mutations, and TypeScript types compile without change. No existing functionality is affected.

---

## Section 02: Model Priority Scoring Service

### Purpose
When an admin enables a model from the catalog (creating a new `model_provider_map` row), automatically assign a meaningful priority instead of defaulting to 0.

### What to build

**File: `apps/web/server/services/intelligentModelSelector.ts`** (first part)

Create and export `computeModelPriority(model: ModelInput): number` where `ModelInput` is the shape of data available when a mapping is created (pricing, context length, capability flags, creation timestamp).

**Scoring algorithm** (higher score = lower priority number = ranked higher in queries):

*Recency* (0–40 points): Based on the OpenRouter `createdAt` Unix timestamp stored in `llmProviders.availableModels`. Models are indexed when they arrive in OpenRouter; newer models are generally more capable.
- Created within 30 days: 40 points
- 31–90 days: 30 points
- 91–365 days: 20 points
- Over 1 year: 10 points
- Unknown/missing: 15 points (safe middle)

*Cost* (0–30 points): Based on `pricingInput + pricingOutput` average per 1M tokens. Cheaper models are preferred at equal capability.
- Free (`isFree = true`): 30 points
- Under $0.50/1M: 25 points
- $0.50–$2/1M: 20 points
- $2–$5/1M: 15 points
- $5–$15/1M: 10 points
- Over $15/1M: 5 points
- Unknown pricing: 15 points

*Capabilities* (0–30 points): Count of `true` capability flags divided by maximum. Each of the 8 boolean columns (`supportsFunctionTools`, `supportsStructuredOutputs`, `supportsWebSearch`, `supportsCodeExecution`, `supportsComputerUse`, `supportsBackground`, `supportsResponses`, `supportsVision`) contributes ~3.75 points.
- Formula: `Math.floor((trueCount / 8) * 30)`

**Final priority**: `Math.max(1, Math.round(100 - totalScore))`
- Range approximately 10–99
- The formula never produces 0, but admin may explicitly set 0 via `updateModelPriority` (0 is valid)
- Lower number = higher priority (consistent with existing `ORDER BY priority ASC`)

### Idempotency rules

`computeModelPriority()` is a pure function — it takes model data and returns a number. The calling code decides whether to apply it:
- Apply when creating NEW `model_provider_map` rows (`priorityLocked` defaults to `false`)
- Skip when updating existing rows that have `priorityLocked = true`
- Skip when the caller explicitly passes a priority value

### Integration points

Modify `multiProvider.ts` → `bulkSetAdminModelCatalogEnabled`:
- For each new mapping being created, if no `priority` was explicitly provided by the caller, compute it from available model data (pricing, context length, capabilities, createdAt)
- Look up `createdAt` from the provider's `availableModels` JSON by matching model ID

Modify `multiProvider.ts` → `upsertModelMapping`:
- If the input has `priority: undefined` (caller didn't provide), compute and assign
- If the input has explicit `priority`, use that value and set `priorityLocked = true`

---

## Section 03: Capability-Aware Model Selector

### Purpose
The core matching engine. Given a set of requirements from a skill and a list of enabled model rows, find the best matching model.

### What to build

**Step 3a: Update `apps/web/server/services/enabledLlmModels.ts`** (prerequisite, load-bearing)

The current `loadEnabledLlmModelRows()` function selects only 4 fields: `providerName`, `modelId`, `providerModelId`, `defaultModel`. The capability-aware selector needs all capability columns, priority, priorityLocked, and contextLength.

Extend the SELECT to include: `supportsVision`, `supportsFunctionTools`, `supportsStructuredOutputs`, `supportsWebSearch`, `supportsCodeExecution`, `supportsComputerUse`, `supportsBackground`, `supportsResponses`, `contextLength`, `priority`, `priorityLocked`, `isFree`.

This changes the return type of `loadEnabledLlmModelRows()`. Update the `EnabledLlmModelRow` type definition in the same file and check all existing callers (primarily `resolveEnabledLlmModelIdFromRows()`) to ensure they still compile. Existing callers use only `modelId` from the rows, so the additional fields are additive and safe.

**Step 3b: File: `apps/web/server/services/intelligentModelSelector.ts`** (new file)

**Function 1: `selectBestLlmModel(requirements, rows)`**

```
Input:
  requirements: Partial<CapabilityRequirements>
    { supportsVision, supportsFunctionTools, supportsStructuredOutputs,
      supportsWebSearch, supportsCodeExecution, supportsComputerUse,
      supportsBackground, supportsResponses, contextLength }
  rows: EnabledLlmModelRow[]

Output:
  string | null  — modelId of best match, or null if nothing qualifies
```

Algorithm:
1. Filter rows to those satisfying ALL boolean requirements (AND logic). For each `true` requirement, the corresponding column on the row must also be `true`. `false` requirements are ignored (don't require the model to NOT have a capability).
2. If `contextLength` requirement is set, additionally filter to rows where `row.contextLength >= requirements.contextLength`. Note: rows where `contextLength IS NULL` fail this filter (conservative default — unknown-capacity models are excluded when context requirements are declared).
3. `disallowedModels` from `SkillExecutionPolicyConfig` is NOT filtered in v1. A code comment documents this as deferred to v2.
4. Sort the qualifying rows by `priority ASC` (lower number = higher priority).
5. Return the `modelId` of the first row. Return `null` if the filtered list is empty.

**Function 2: `describeRequirementsMatch(requirements, row)`**

Returns a human-readable string listing which capabilities matched and which didn't. Used by the resolution preview endpoint. Example: `"Matched: functionTools, structuredOutput. Missing: vision"`.

**Type: `CapabilityRequirements`**

Export a TypeScript interface matching the `requirements` sub-object of `SkillExecutionPolicyConfig` (from `packages/skills/src/types.ts`). This type must also be updated to include `supportsVision?: boolean` (see Section 08).

**Type: `EnabledLlmModelRow`**

Re-export or re-use the updated type from `enabledLlmModels.ts` (extended in Step 3a with capability fields).

### Testing

`intelligentModelSelector.test.ts` — pure unit tests, no DB:
- Returns best model when multiple qualify (sorted by priority)
- Returns null when no model has required capabilities
- AND logic: model missing any single required capability is excluded
- contextLength filter works correctly
- `false` requirements do not exclude models that happen to have that capability
- `describeRequirementsMatch` output format

---

## Section 04: Extended resolveSkillExecutionPolicy()

### Purpose
Wire the intelligent selector into the existing policy resolver. Skills with requirements automatically use capability-aware selection. Skills without requirements continue to work exactly as before.

### What to build

Modify `apps/web/server/services/skillExecutionPolicy.ts`:

**New import**: `selectBestLlmModel` from `intelligentModelSelector`

**Extended cascade logic**:

```
1. Determine mode:
   hasRequirements = skill.executionPolicy?.requirements exists AND has at least one key
   mode = skill.executionPolicy?.mode  // "requirements", "fixed", "hybrid", or undefined

2. If mode == "hybrid":
   a. Try skill.executionPolicy.fixedModel (if it appears in enabled rows)
   b. If fixedModel found and enabled: use it, source = "skill_fixedModel"
   c. If fixedModel not found/not enabled: fall through to step 3 (requirements path)

3. If hasRequirements (or mode == "requirements"):
   a. Call selectBestLlmModel(requirements, allEnabledRows)
   b. If found: return { modelId, modelSource: "requirements_match", ... }
   c. If null: emit WARNING audit event, fall through to step 4 with requirementsFallback=true

4. Existing cascade (unchanged when no requirements):
   a. Try skill.llmModelId (if set)
   b. Try skill.defaultModel
   c. Try conversationModel (unless requirements mode active and allowConversationOverride=false)
   d. Try system default (first enabled model)
```

**Auto-migrate logic** (step 3 takes precedence over step 4a when requirements present):
- If a skill has BOTH `llmModelId` AND `requirements`, requirements mode runs first
- If requirements find a match, `llmModelId` is NOT used (requirements win)
- If requirements find nothing, fall back to `llmModelId` as step 4a

**Mode semantics**:
- `"requirements"` — skip cascade steps 4a/4b entirely; only 4c/4d allowed as fallback
- `"fixed"` — skip requirements; use existing cascade unchanged
- `"hybrid"` — try `fixedModel` first, then requirements if fixed unavailable
- `undefined` — auto-detect: use requirements if declared, otherwise cascade

**`allowConversationOverride`**: If `skill.executionPolicy.allowConversationOverride === true`, the `conversationModel` is eligible to be tried in step 4c even when requirements mode is active. Defaults to `false` (requirements selection ignores conversation model).

**Extended `SkillExecutionPolicyResult`**:
Add optional fields to the return type:
- `matchedCapabilities?: string[]` — list of capabilities that the selected model satisfies
- `requirementsFallback?: boolean` — true if requirements found no match and fallback was used
- `modelSource` gains a new value: `"requirements_match"`

**Audit event**: After resolution, emit `model_selection_resolved` to `auditLogger`. Include `modelSource`, `requirementsFallback`, `skillId`, `selectedModel`.

### Testing

Extend `skillExecutionPolicy.test.ts`:
- Requirements mode returns matching model (mock rows with capabilities)
- Requirements mode skips non-matching models
- When requirements fail, falls back to llmModelId
- When requirements fail AND no llmModelId, falls back to system default
- Audit event emitted with correct modelSource
- Skill without requirements: behavior unchanged (regression tests)
- Skill with allowConversationOverride=true: conversationModel eligible

---

## Section 05: updateModelPriority tRPC Mutation

### Purpose
Give admins a fast way to set a model's priority and lock it against auto-reassignment.

### What to build

Modify `apps/web/server/routers/multiProvider.ts`:

**New mutation `updateModelPriority`**:
```
Input: { mappingId: number, priority: number }
Validation: priority must be integer 0–999
Effect:
  UPDATE model_provider_map
  SET priority = input.priority, priorityLocked = true
  WHERE id = input.mappingId
Output: { success: true, mapping: updated row }
```

Role guard: admin procedure (same as other mutations in this router).

Note on priority range: `updateModelPriority` validates priority as 0–999 (all values valid including 0). The scoring formula produces 1–99, but admin may explicitly set 0 if desired.

**Modify `bulkSetAdminModelCatalogEnabled`**:
- Pre-load strategy: before the per-item loop, query all relevant providers' `availableModels` JSON in a single query. Build a `Map<modelId, SyncedModel>` for O(1) lookup during the loop. Avoids N+1 provider lookups.
- When creating a new mapping (INSERT path): compute priority via `computeModelPriority()` using model data looked up from the pre-loaded Map
- When updating an existing mapping that has `priorityLocked = true`: leave `priority` and `priorityLocked` unchanged
- When updating an existing mapping with `priorityLocked = false`: optionally recompute (or leave current value)

**Modify `upsertModelMapping`**:
- If `input.priority` is provided by caller: use it, set `priorityLocked = true`
- If `input.priority` is omitted (undefined): compute via `computeModelPriority()`, set `priorityLocked = false`

### Testing

Extend `multiProvider.test.ts`:
- `updateModelPriority` sets value and locks
- `updateModelPriority` requires admin role
- `updateModelPriority` rejects priority > 999
- `bulkSetAdminModelCatalogEnabled` computes priority for new entries
- `bulkSetAdminModelCatalogEnabled` preserves locked priorities

---

## Section 06: Admin UI — Priority Quick-Edit

### Purpose
Make model priorities visible and editable in the admin interface without requiring the full mapping edit dialog.

### What to build

Modify `apps/web/client/src/components/admin/MultiProviderAdmin.tsx`:

**Inline priority editor**:
In each model mapping card/row, alongside the existing priority label, add:
- A small `<input type="number" min="0" max="999">` showing the current priority
- On `onBlur` (losing focus): call `updateModelPriority` mutation if value changed
- Optimistic update: show new value immediately, revert on error
- Show `<Lock size={14} />` (lucide-react) when `priorityLocked = true`, with tooltip "Manually set. Re-import won't change this."
- Show `<Info size={14} />` (lucide-react) when `priorityLocked = false`, with tooltip "Auto-assigned."

**Admin catalog sort order**:
In `multiProviderAdminModelMappings.ts`, modify `filterAdminModelCatalogRows()` to sort by priority ASC as secondary sort (after modelId primary sort). Currently only sorts by name.

**tRPC hook**:
Add `trpc.multiProvider.updateModelPriority.useMutation()` call with `onSuccess` cache invalidation of `listModelMappings` and `listAdminModelCatalog`.

---

## Section 07: SkillSettings Model Resolution Preview

### Purpose
Help admins verify that a skill's requirements actually resolve to an appropriate model before publishing.

### What to build

**New tRPC query `skills.previewModelResolution`**:
```
Input: { skillId: number, conversationModel?: string }
Effect: load skill, call resolveSkillExecutionPolicy() with current config
Output: {
  modelId: string | null,
  modelSource: string,
  matchedCapabilities: string[],
  requirementsFallback: boolean,
  availableModelCount: number,
}
```

No side effects. Admin-only query.

**Modify `apps/web/client/src/components/chat/settings/SkillSettings.tsx`** (or `AdminSkills.tsx`):

Below the execution policy configuration section, add a "Model Preview" panel:
- Lazy-loaded (only fetches when user expands the preview panel or clicks refresh)
- Auto-refresh debounced 400ms when requirements fields are changed in the form
- Shows: "Would use: **claude-sonnet-4-6** | Source: requirements_match | Matched: vision, function tools"
- If fallback: yellow warning "⚠ No model matched requirements — using system default"
- If mode is "fixed" or skill uses only llmModelId: "Fixed model: claude-sonnet-4-6 (source: skill_llmModelId)"
- If no requirements configured: "Requirements not set — using [source: llmModelId / defaultModel / system default]"
- Refresh button to re-fetch (useful after admin changes model catalog)

---

## Section 08: Zod Validation + Frontmatter Parsing

### Purpose
Complete the loop so skills can express requirements both via the admin UI (tRPC) and via skill.md frontmatter (file-based).

### What to build

**Step 8a: Update `packages/skills/src/types.ts`**

Add `supportsVision?: boolean` to the `requirements` sub-object of `SkillExecutionPolicyConfig`:
```typescript
requirements?: {
  supportsVision?: boolean;          // ← ADD THIS
  supportsResponses?: boolean;
  supportsStructuredOutputs?: boolean;
  // ... (rest unchanged)
};
```

After this change, rebuild the `@smartspec/skills` package: `cd packages/skills && pnpm build` (or handled by `pnpm db:push` as part of the monorepo build).

**Step 8b: Modify `apps/web/server/routers/skills.ts`** — extend the `update` mutation's Zod schema:

Add `requirements` sub-object to `executionPolicy` input. Note: `preferredStrategy` is NOT added to the Zod schema in v1 — the field exists in the TypeScript type (from a prior spec) but has no implementation. Adding it to input validation without implementing it would be misleading. A code comment marks it as "reserved for v2."

```typescript
requirements: z.object({
  supportsVision: z.boolean().optional(),
  supportsFunctionTools: z.boolean().optional(),
  supportsStructuredOutputs: z.boolean().optional(),
  supportsWebSearch: z.boolean().optional(),
  supportsCodeExecution: z.boolean().optional(),
  supportsComputerUse: z.boolean().optional(),
  supportsBackground: z.boolean().optional(),
  supportsResponses: z.boolean().optional(),
  contextLength: z.number().int().min(1000).max(2000000).optional(),
}).optional(),
mode: z.enum(["requirements", "fixed", "hybrid"]).optional(),
allowConversationOverride: z.boolean().optional(),
// preferredStrategy: reserved for v2 — not validated here
```

Merge into `executionPolicyJson` column alongside existing Spec 038 fields.

**Step 8c: Modify `apps/web/server/services/skillRegistry.ts`** — parse `model_requirements` frontmatter key:

```yaml
# skill.md example
model_requirements:
  supportsFunctionTools: true
  supportsStructuredOutputs: true
  contextLength: 32000
```

In `autoSyncSkillsFromFolder()` (and `getFrontmatterRoutingConfig()`), parse `model_requirements` or `modelRequirements` from frontmatter. Store into `executionPolicyJson.requirements`. This lets skill authors express requirements in the skill.md file directly.

**No schema migration needed** — `executionPolicyJson` is already a flexible JSON column.

**Type guard**: Add `isSkillRequirements(obj)` function to validate that frontmatter-parsed requirements only contain known keys (prevent typos from silently having no effect).

### Testing

- Frontmatter with `model_requirements` correctly populates `executionPolicyJson.requirements`
- Unknown keys in `model_requirements` are filtered out / warned about
- `skills.update` with `requirements` merges correctly into existing `executionPolicyJson`
- `skills.update` with `requirements: null` clears the requirements field

---

## Dependency Order

```
Section 01 (migration)
    ↓
Section 02 (scoring service — needs supportsVision column)
    ↓
Section 03 (selector service — needs supportsVision in rows)
    ↓
Section 04 (policy resolver — needs selectBestLlmModel)
    ↓
Section 05 (updateModelPriority mutation — needs priorityLocked column)
    ↓
Section 06 (admin UI — needs updateModelPriority mutation)
    ↓
Section 07 (skills preview — needs extended resolveSkillExecutionPolicy return type)
    ↓
Section 08 (frontmatter + Zod — independent, but easier after everything else works)
```

Sections 06, 07, 08 are partially independent and could be parallelized after section 05.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Migration fails on production | Backup before running; both columns have DEFAULT values so migration is safe even on large tables |
| computeModelPriority formula produces bad rankings | Formula is a starting point; admin can always override via UI (priorityLocked) |
| Requirements matching too strict → skills always fall back | Silent fallback prevents breakage; audit warning helps diagnose; admin can relax requirements |
| Capability columns wrong for synced models | Most columns default to false (safe, conservative); OpenRouter sync can be enhanced to populate them later |
| SkillSettings preview endpoint slow | Add caching or make preview on-demand (not automatic) |

---

## Files to Create/Modify

**New files:**
- `apps/web/server/services/intelligentModelSelector.ts` — `selectBestLlmModel()` + `computeModelPriority()`
- `apps/web/server/services/intelligentModelSelector.test.ts` — unit tests
- Migration SQL generated by `pnpm db:push`

**Modified files:**
- `apps/web/drizzle/schema.ts` — add `supportsVision`, `priorityLocked` columns to `modelProviderMap`
- `apps/web/server/services/enabledLlmModels.ts` — extend SELECT to include capability columns + priority
- `apps/web/server/services/skillExecutionPolicy.ts` — wire intelligentModelSelector
- `apps/web/server/services/skillRegistry.ts` — parse `model_requirements` frontmatter
- `apps/web/server/routers/multiProvider.ts` — add `updateModelPriority` + `backfillModelPriorities`; auto-score in bulkSet
- `apps/web/server/routers/skills.ts` — extend Zod schema, add `previewModelResolution` query
- `apps/web/client/src/components/admin/MultiProviderAdmin.tsx` — priority quick-edit UI
- `apps/web/client/src/components/chat/settings/SkillSettings.tsx` — resolution preview
- `apps/web/client/src/components/admin/multiProviderAdminModelMappings.ts` — priority sort in catalog view
- `packages/skills/src/types.ts` — add `supportsVision` to `SkillExecutionPolicyConfig.requirements`

---

## Definition of Done

- [ ] Migration applied: `supportsVision` and `priorityLocked` columns exist in `model_provider_map`
- [ ] `packages/skills/src/types.ts` updated with `supportsVision` in requirements type
- [ ] `enabledLlmModels.ts` SELECT includes all capability columns + priority + priorityLocked
- [ ] `computeModelPriority()` exported from `intelligentModelSelector.ts`, produces 1–99 range
- [ ] New `model_provider_map` entries get auto-scored priority (not always 0)
- [ ] Locked priorities survive `bulkSetAdminModelCatalogEnabled` re-run
- [ ] `selectBestLlmModel()` returns correct model for given requirements (AND logic, priority sort)
- [ ] `resolveSkillExecutionPolicy()` uses requirements when skill has them
- [ ] Skills without requirements resolve exactly as before (no regression)
- [ ] hybrid mode: fixedModel tried first, then requirements fallback
- [ ] `updateModelPriority` mutation sets priority and `priorityLocked = true`
- [ ] `backfillModelPriorities` mutation available for one-time backfill of existing rows
- [ ] Admin UI shows priority with inline editor and lock/info icons (Lucide)
- [ ] `previewModelResolution` query returns correct resolved model with capabilities list
- [ ] SkillSettings shows model resolution preview (debounced, with fixed vs requirements distinction)
- [ ] `model_requirements` frontmatter key populates `executionPolicyJson.requirements`
- [ ] `preferredStrategy` NOT in v1 Zod schema (reserved for v2, commented)
- [ ] Full test suite passes with no regressions
- [ ] `pnpm check` passes
