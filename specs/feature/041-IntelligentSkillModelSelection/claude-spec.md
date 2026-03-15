# Feature 041: Intelligent Skill Model Selection — Complete Specification

## Problem

Skills in SmartSpecPro currently rely on a hard-coded `llmModelId` field in skill.md frontmatter to specify which LLM model to use. This approach has three fundamental flaws:

1. **Skills go stale.** When a better model is released, every relevant skill must be manually updated to use it. No one does this reliably.
2. **All new models get priority=0.** When an admin enables a model from the catalog, it's assigned priority 0 by default — unordered, indistinguishable from every other model.
3. **Capability requirements are ignored.** The `executionPolicyJson.requirements` column exists in the database with a full type definition (`SkillExecutionPolicyConfig`) and matching capability columns in `model_provider_map` (`supportsFunctionTools`, `supportsStructuredOutputs`, etc.) — but `resolveSkillExecutionPolicy()` never reads any of it.

The result: skills are frozen to whatever model was current when they were written, the admin has no practical way to order models, and skills that need vision or tool-calling can silently get assigned a plain text model.

## Goal

Skills should declare **what they need** (capabilities, context size, cost preference), not **which model to use**. The system selects the best available model at runtime. As new, better models are added and prioritized, all skills automatically benefit — without anyone editing skill definitions.

---

## Architecture Changes

### Two-Model System (Unchanged)

LLM models and media models use separate systems. This feature only touches the LLM path:
- **LLM**: `model_provider_map` table → `llmRouter.ts` → `skillExecutionPolicy.ts`
- **Media**: `mediaModels` table → `modelRegistry.ts` → `modelSuggestTool.ts` (separate, not changed)

### Model Catalog Flow (Unchanged)

1. `modelSyncService.ts` fetches from OpenRouter/APIs → stores in `llmProviders.availableModels` JSON
2. Admin views catalog, enables models → creates `model_provider_map` rows
3. `resolveSkillExecutionPolicy()` reads `model_provider_map` to route requests

### New Flow (This Feature)

At step 2, auto-assign a priority score when creating new `model_provider_map` rows.
At step 3, if skill has `requirements`, filter `model_provider_map` by capabilities before selecting.

---

## Implementation Scope

### Section 01: Database Migration
Add two columns to `model_provider_map`:
- `supportsVision: boolean DEFAULT false` — model-level vision capability (fills gap where only provider-level existed)
- `priorityLocked: boolean DEFAULT false` — marks manually-set priorities that survive re-import

No other schema changes needed. All other required columns already exist.

### Section 02: Model Priority Scoring Service
New `computeModelPriority(model)` function. Called when creating new `model_provider_map` entries.

**Scoring formula (higher score = lower priority number = better)**:
- Recency: 0–40 points based on `createdAt` (Unix timestamp from OpenRouter)
  - < 30 days old: 40pts
  - 30–90 days: 30pts
  - 90–365 days: 20pts
  - > 1 year: 10pts
  - Unknown: 15pts
- Cheapness: 0–30 points based on average cost per 1M tokens (`pricingInput + pricingOutput`)
  - Free (`isFree = true`): 30pts
  - < $0.50/1M: 25pts
  - $0.50–$2/1M: 20pts
  - $2–$5/1M: 15pts
  - $5–$15/1M: 10pts
  - > $15/1M: 5pts
  - Unknown: 15pts
- Capability count: 0–30 points based on how many of 8 boolean columns are true
  - 8 × 3.75pts per capability = up to 30pts

**Final priority**: `Math.round(100 - (recency + cheapness + capabilities))`
- Higher score = lower number = higher priority
- Range: 10–100 (never 0 to distinguish from "unset")

**Idempotency**: `computeModelPriority()` is called only when `priorityLocked = false`. If admin has explicitly edited priority (`priorityLocked = true`), the value is never touched.

### Section 03: Capability-Aware Model Selector
New service `intelligentModelSelector.ts` with `selectBestLlmModel(requirements, rows)`:

```
Requirements: { supportsFunctionTools: true, supportsStructuredOutputs: true, contextLength: 50000 }

1. Filter: rows WHERE supportsFunctionTools = true AND supportsStructuredOutputs = true AND contextLength >= 50000 AND isEnabled = true
2. Sort by priority ASC (lower = higher priority)
3. Return first match (modelId)
4. If empty: return null (trigger fallback)
```

AND logic: ALL requirements must be satisfied. No partial matches.

Also exports `describeRequirementsMatch(requirements, modelRow)` for audit/preview use.

### Section 04: Extended resolveSkillExecutionPolicy()
Extend the existing function to read `skill.executionPolicy`:

**Selection cascade (new)**:
```
1. If skill.executionPolicy.mode == "requirements" (or has requirements AND no exclusive llmModelId):
   → Call selectBestLlmModel(requirements, allEnabledRows)
   → If match found: use it, source = "requirements_match"
   → If no match: fall back to step 2 (log warning)

2. Existing cascade (unchanged):
   → Try skill.llmModelId (if set AND not requirements mode)
   → Try skill.defaultModel
   → Try conversationModel
   → Try system default
```

**Auto-migrate logic**: If skill has `executionPolicyJson.requirements` defined, prefer requirements mode automatically (no need to explicitly set `mode: "requirements"`). If skill has ONLY `llmModelId` with no requirements, behavior unchanged.

**Conversation override**: Requirements-selected models ignore `conversationModel`. The skill's requirements take precedence. (`allowConversationOverride: true` in policy optionally disables this.)

**Audit**: Emit `model_selection_resolved` audit event with `{ modelSource, matchedCapabilities, requirementsMet, fallbackReason }`.

### Section 05: updateModelPriority tRPC Mutation
New mutation `multiProvider.updateModelPriority`:

```typescript
input: { mappingId: number, priority: number }  // priority: 0–999
effect:
  UPDATE model_provider_map SET priority = input.priority, priorityLocked = true
  WHERE id = input.mappingId
```

Validates priority is 0–999. Sets `priorityLocked = true` to protect from auto-reassignment. Role: admin only.

Also modify `bulkSetAdminModelCatalogEnabled` to call `computeModelPriority()` for new entries where `priorityLocked = false`.

### Section 06: Admin UI — Priority Quick-Edit
In `MultiProviderAdmin.tsx`, add to each model mapping row:
- Inline number input showing current priority
- On blur: call `updateModelPriority` mutation
- Lock icon 🔒 shown when `priorityLocked = true` (with tooltip: "Manually set. Re-import won't change this.")
- Admin catalog view (`filterAdminModelCatalogRows`) sorted by priority (secondary sort after model name)

### Section 07: SkillSettings Model Resolution Preview
New tRPC query `skills.previewModelResolution({ skillId, conversationModel? })`:
- Calls `resolveSkillExecutionPolicy()` with the skill's current config
- Returns `{ modelId, modelSource, matchedCapabilities, availableModelCount }`

In `SkillSettings.tsx`, below the execution policy config:
- Show: "Currently would select: **claude-sonnet-4-6** (matched: vision, function tools)"
- Show fallback notice if requirements didn't match: "⚠ No model matched requirements — falling back to system default"
- Auto-refresh when requirements are changed

### Section 08: Zod Validation + Frontmatter Parsing
Add `requirements` to `skills.update` Zod schema:
```typescript
executionPolicy: z.object({
  mode: z.enum(["requirements", "fixed", "hybrid"]).optional(),
  requirements: z.object({
    supportsVision: z.boolean().optional(),
    supportsResponses: z.boolean().optional(),
    supportsStructuredOutputs: z.boolean().optional(),
    supportsWebSearch: z.boolean().optional(),
    supportsFunctionTools: z.boolean().optional(),
    supportsCodeExecution: z.boolean().optional(),
    supportsComputerUse: z.boolean().optional(),
    supportsBackground: z.boolean().optional(),
    contextLength: z.number().int().min(1000).optional(),
  }).optional(),
  preferredStrategy: z.enum(["cheapest", "fastest", "best"]).optional(),
  allowConversationOverride: z.boolean().optional(),
  // ... existing Spec 038 fields preserved
}).optional(),
```

Add `model_requirements` frontmatter key parsing in `skillRegistry.ts`:
```yaml
# skill.md frontmatter example:
model_requirements:
  supportsFunctionTools: true
  supportsStructuredOutputs: true
  contextLength: 32000
  preferredStrategy: balanced
```

Maps to `executionPolicyJson.requirements`.

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Priority formula | Balanced (recency + cost + capabilities) | Auto-favors newer, cheaper, more-capable models |
| No-match fallback | Silent fallback + audit warning | Never block execution; operator learns via logs |
| Priority lock | `priorityLocked` column | Clean separation between auto and manual values |
| Vision | Add `supportsVision` column now | Needed for image-analysis skills; same migration window |
| Migration | Auto-detect (requirements defined = use them) | Zero breaking changes; gradual adoption |
| Conversation override | Requirements win (default) | Skill knows its requirements better than user model preference |
| SkillSettings preview | Show resolved model | Operators need feedback loop to verify requirements work |

---

## Backward Compatibility

- Skills with only `llmModelId` → **unchanged behavior**
- Skills with only `defaultModel` → **unchanged behavior**
- Skills with `requirements` → new behavior (requirements-first selection)
- Skills with both `llmModelId` AND `requirements` → requirements mode preferred
- Model catalog: all existing `model_provider_map` rows remain untouched; `priorityLocked = false` means auto-scoring can be applied in a one-time backfill script (optional, not required)

---

## Files to Create/Modify

**New files:**
- `apps/web/server/services/intelligentModelSelector.ts` — `selectBestLlmModel()` + `computeModelPriority()`
- `apps/web/drizzle/XXXX_add_vision_and_priority_lock.sql` — migration

**Modified files:**
- `apps/web/server/services/skillExecutionPolicy.ts` — wire intelligentModelSelector
- `apps/web/server/services/skillRegistry.ts` — parse `model_requirements` frontmatter
- `apps/web/server/routers/multiProvider.ts` — add `updateModelPriority` mutation; auto-score in bulkSet
- `apps/web/server/routers/skills.ts` — extend Zod schema, add `previewModelResolution` query
- `apps/web/client/src/components/admin/MultiProviderAdmin.tsx` — priority quick-edit UI
- `apps/web/client/src/pages/AdminSkills.tsx` or `SkillSettings.tsx` — resolution preview
- `apps/web/drizzle/schema.ts` — add `supportsVision`, `priorityLocked` columns

**Test files:**
- `apps/web/server/services/intelligentModelSelector.test.ts` — unit tests for selector + scorer
- `apps/web/server/services/skillExecutionPolicy.test.ts` — extend with requirements tests
- `apps/web/server/routers/multiProvider.test.ts` — updateModelPriority tests
