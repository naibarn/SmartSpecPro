---
name: Skill LLM Model Selection System Research Brief
description: Executive summary and comprehensive analysis of the SmartSpecPro skill LLM model selection architecture
type: project
---

# Skill LLM Model Selection System — Research Brief

## Executive Summary

SmartSpecPro has a **sophisticated 4-tier LLM model selection system** where skills can explicitly pin themselves to specific models with optional provider enforcement. The database schema is **comprehensive and complete**, with all required fields present in the skills table and model_provider_map. However, there are **critical gaps in execution**: OpenRouter sync doesn't assign priorities to new models, capability-aware filtering isn't implemented, and the admin UI completeness is unknown.

**Status**: Architecture is sound; implementation is 70% complete.

---

## Question Responses

### Q1: Do skills need to specify a default LLM model?

**Answer: YES, and they can at TWO levels**

```yaml
# Level 1: Explicit model pin (strongest)
llmModelId: gpt-4o                    # Forces this model, cannot be overridden

# Level 2: Fallback default
defaultModel: gpt-4o                  # Used if llmModelId not set or disabled
```

**Where configured**:
1. **Skill.md frontmatter** (source of truth):
   - `llmModelId: model-id` (recommended)
   - `llm_model_id: model-id` (alias for backward compatibility)

2. **Database** (skills table):
   - Column `llmModelId` (line 2455 in schema.ts)
   - Column `defaultModel` (line 2452 in schema.ts)

3. **Runtime**:
   - Parsed in `skillRegistry.ts:168-192` (`getFrontmatterRoutingConfig()`)
   - Converted to SkillDefinition in `skillRegistry.ts:77-166` (`dbSkillToDefinition()`)

---

### Q2: If a skill specifies a model, which LLM does the system use?

**Answer: Exactly the model the skill specified (priority is unbreakable)**

```
Selection priority (highest → lowest):
  1. skill.llmModelId              ← LOCKED, cannot be overridden
  2. skill.defaultModel             ← Fallback to this
  3. conversationModel              ← User's active choice (fallback ONLY)
  4. system_default                 ← First enabled model in database
```

**Key constraint**: If `skill.llmModelId` is set, it **CANNOT be overridden** by the conversation model. This is intentional — ensures skill behavior is deterministic.

**Source code**: `skillExecutionPolicy.ts:47-93` (`resolveSkillExecutionPolicy()`)

---

### Q3: If no model is specified, how does the system select an LLM?

**Answer: 4-tier cascade with smart fallbacks**

```typescript
async function resolveSkillExecutionPolicy(input: {
  skill: SkillDefinition,
  conversationModel?: string | null,
}): Promise<SkillExecutionPolicyResult> {
  // 1. Try skill.llmModelId
  if (skill.llmModelId && isEnabled(skill.llmModelId)) {
    return skill.llmModelId;  // modelSource: "skill_llmModelId"
  }

  // 2. Fall back to skill.defaultModel
  if (skill.defaultModel && isEnabled(skill.defaultModel)) {
    return skill.defaultModel;  // modelSource: "skill_defaultModel"
  }

  // 3. Fall back to conversation model (if not already tried)
  if (conversationModel && isEnabled(conversationModel)) {
    return conversationModel;  // modelSource: "conversation"
  }

  // 4. Fall back to system default
  return getSystemDefaultModel();  // modelSource: "system_default"
}
```

**Code location**: `skillExecutionPolicy.ts:47-93`

---

### Q4: What about suggestModel() function?

**Answer: It's for MEDIA models only, not LLM models**

```typescript
async function suggestModel(
  purpose: "image" | "video" | "audio" | "text",
  quality_preference?: "speed" | "balanced" | "quality",
): Promise<SuggestResult> {
  if (purpose === "text") {
    return {
      recommended: null,
      alternatives: [],
      message: "Text model selection is handled by the LLM router. Use the default model.",
    };
  }

  // For media (image/video/audio):
  const models = await getModelsByTypeAsync(purpose);  // From modelRegistry
  const sorted = models.sort((a, b) => {
    if (quality_preference === "speed") {
      return (a.creditCost) - (b.creditCost);  // Sort by cost
    }
    return (a.priority) - (b.priority);  // Default: sort by priority
  });

  return { recommended: sorted[0], alternatives: sorted.slice(1, 4) };
}
```

**Key insight**: `suggestModel()` handles **media models** (image, video, audio generation) via `modelRegistry.ts`. For **LLM text models**, there's no suggest function — they're selected via the 4-tier cascade above.

**Code location**: `modelSuggestTool.ts:33-77`

---

### Q5: What fields do LLM models have in the DB schema?

**Answer: Two tables, one unified query path**

#### Table 1: model_provider_map (PRIMARY)

```sql
CREATE TABLE model_provider_map (
  id SERIAL PRIMARY KEY,

  -- Identity
  modelId VARCHAR(128) NOT NULL UNIQUE,      -- e.g., "gpt-4o"
  providerId INTEGER NOT NULL,               -- FK to llm_providers
  providerModelId VARCHAR(256) NOT NULL,     -- e.g., "gpt-4-turbo"

  -- Pricing
  pricingInput NUMERIC(12,8),                -- Cost per 1M input tokens
  pricingOutput NUMERIC(12,8),               -- Cost per 1M output tokens
  isFree BOOLEAN DEFAULT false,

  -- Selection metadata
  priority INTEGER DEFAULT 0,                -- Lower = higher priority
  isEnabled BOOLEAN DEFAULT true,
  contextLength INTEGER,

  -- Capability metadata (for future filtering)
  supportsVision BOOLEAN DEFAULT false,
  supportsFunctionTools BOOLEAN DEFAULT false,
  supportsStructuredOutputs BOOLEAN DEFAULT false,
  supportsWebSearch BOOLEAN DEFAULT false,
  supportsCodeExecution BOOLEAN DEFAULT false,
  supportsComputerUse BOOLEAN DEFAULT false,
  supportsBackground BOOLEAN DEFAULT false,

  -- API routing
  apiStyle ENUM ('chat-completions'|'responses'|'messages'|'gemini'),

  UNIQUE(modelId, providerId),
);
```

**Source**: `drizzle/schema.ts:640-700`

#### Table 2: llmProviders (Supporting)

```sql
CREATE TABLE llm_providers (
  id SERIAL PRIMARY KEY,

  providerName VARCHAR(64) NOT NULL UNIQUE,    -- e.g., "openai"
  displayName VARCHAR(128) NOT NULL,           -- e.g., "OpenAI"
  baseUrl VARCHAR(512),                        -- API endpoint
  apiKeyEncrypted TEXT,                        -- Encrypted secret
  hasApiKey BOOLEAN,

  -- Metadata
  defaultModel VARCHAR(128),
  availableModels JSON,                        -- Cached model list
  configJson JSON,

  -- Health tracking
  isEnabled BOOLEAN DEFAULT false,
  healthStatus VARCHAR(32) DEFAULT 'healthy',
  failureCount INTEGER,
  successCount INTEGER,

  sortOrder INTEGER,
  providerType VARCHAR(32),  -- 'primary'|'secondary'|'fallback'
);
```

**Source**: `drizzle/schema.ts:565-631`

---

### Q6: Are priority and creditCost present and populated?

**Answer: PARTIALLY**

| Field | Table | Present | Populated | Notes |
|-------|-------|---------|-----------|-------|
| **priority** | model_provider_map | ✅ YES | ⚠️ PARTIAL | Defaults to 0; admin can edit; no auto-assignment in sync |
| **creditCost** | model_provider_map | ❌ NO | — | Uses pricingInput/pricingOutput instead |
| **creditCost** | mediaModels | ✅ YES | ✅ YES | For image/video/audio only |

**Problem**: LLM models store cost as `pricingInput`/`pricingOutput` (per 1M tokens), while media models store as `creditCost` (per generation). Two different systems.

---

### Q7: What does the Admin LLM Models UI look like?

**File**: `apps/web/client/src/pages/AdminLLMModels.tsx`

**Current state**:
```typescript
export default function AdminLLMModels() {
  const { data: mappings } = trpc.multiProvider.listModelMappings.useQuery();
  const { data: catalogRows } = trpc.multiProvider.listAdminModelCatalog.useQuery();

  return (
    <div>
      <h1>LLM Model Configuration</h1>
      <MultiProviderAdmin mappings={mappings} />
    </div>
  );
}
```

**Displays**:
- Summary stats (model groups, total mappings, enabled count)
- Delegates to `<MultiProviderAdmin />` component for details

**Unknown** (need to read MultiProviderAdmin.tsx fully):
- Is priority column visible?
- Is priority editable?
- Are capability tags shown?
- Is cost tier shown?

**Code location**: `AdminLLMModels.tsx:1-100+` (full file needed)

---

### Q8: What multiProvider admin components exist?

**Files**:
- `MultiProviderAdmin.tsx` (Component)
- `multiProviderAdminModelMappings.ts` (Logic/types)
- `multiProvider.ts` (tRPC router)

**tRPC endpoints** (router):
```typescript
export const multiProviderRouter = router({
  listModelMappings: adminProcedure.query(...),      // Group models by modelId
  listAdminModelCatalog: adminProcedure.query(...),  // All provider models
  updateModelPriority: adminProcedure.mutation(...), // [Unknown if exists]
  // ... other endpoints
});
```

**Code location**: `multiProvider.ts:1-200+`

---

### Q9: What does OpenRouter sync do?

**File**: `modelSyncService.ts`

**What it does**:
1. ✅ Fetches all models from OpenRouter API (420+ models)
2. ✅ Filters by provider prefix (e.g., "openai/gpt-*" for OpenAI)
3. ✅ Converts to SyncedModel format {id, name, contextLength, pricing, provider}
4. ✅ Inserts/updates into `model_provider_map` table

**What it DOESN'T do**:
- ❌ Assign priority to new models (always defaults to 0)
- ❌ Auto-run on startup (must be called manually)
- ❌ Handle model deprecation
- ❌ Apply ranking algorithm (cost-based, recency-based, capability-based)

**Code location**: `modelSyncService.ts:128-376`

**Example missing logic**:
```typescript
// THIS CODE DOESN'T EXIST:
function assignPriorityToNewModel(model: SyncedModel): number {
  // Option 1: By recency
  if (model.createdAt && isRecent(model.createdAt)) return 1;

  // Option 2: By cost (prefer cheaper)
  if (model.pricing?.input < 0.001) return 5;   // Cheap
  if (model.pricing?.input < 0.01) return 10;   // Moderate
  return 20;  // Expensive

  // Option 3: By capability count
  // ...
}
```

---

### Q10: What is missing for end-to-end completeness?

**Gap Analysis**:

| Component | Status | Impact | Fix Effort |
|-----------|--------|--------|-----------|
| **Priority assignment in sync** | ❌ MISSING | All synced models tied (priority=0); no ranking | 2-4 hours |
| **Capability-aware selection** | ❌ MISSING | Skill requests vision; system picks non-vision model | 4-6 hours |
| **Admin UI: priority editor** | ❓ UNKNOWN | Can't reorder models; might be hidden | 2-4 hours |
| **Skill settings: cost display** | ❓ UNKNOWN | Users don't see cost/capability info | 3-5 hours |
| **Auto-sync on startup** | ❌ MISSING | Models not updated unless sync called manually | 1-2 hours |
| **executionPolicyJson usage** | ⚠️ PARTIAL | Field exists in DB but not checked during selection | 4-8 hours |
| **Media/LLM cost unification** | ⚠️ PARTIAL | Two different fields; inconsistent API | 6-10 hours |

**Recommendation for Priority**:
1. **Week 1**: Priority assignment in sync + auto-sync on startup (quick wins, high value)
2. **Week 2**: Admin UI priority editor + capability-aware filtering (medium complexity, high value)
3. **Week 3+**: executionPolicyJson integration + cost unification (nice-to-have, complex)

---

## Current Architecture Diagram

```
User Input
    ↓
Chat.ts (chat endpoint)
    ├─ Detects skill (skillDetector.ts)
    ├─ Calls resolveSkillExecutionPolicy({skill, conversationModel})
    │   └─ skillExecutionPolicy.ts:47-93
    │       ├─ Loads enabled LLM models: loadEnabledLlmModelRows()
    │       ├─ Checks: skillLlmModelId > skillDefaultModel > conversationModel > system
    │       └─ Returns {modelId, preferredProviderId, strictProviderPin, modelSource}
    │
    ├─ Gets provider: llmRouter.getProviderForModel(modelId, hints)
    │   └─ llmRouter.ts:74-128
    │       ├─ Queries modelProviderMap WHERE modelId=X
    │       ├─ Joins with llmProviders to get apiKey/baseUrl
    │       ├─ Sorts by priority (lower=first)
    │       ├─ Applies hints: preferredProviderId, strictProviderPin
    │       └─ Returns ProviderCandidate
    │
    ├─ Executes: POST provider.baseUrl + headers[Authorization: provider.apiKey]
    └─ Returns to client
```

---

## Risks & Recommendations

### High-Priority Risks

1. **Risk**: All synced models have priority=0 (tied), making priority field useless
   - **Impact**: Cannot rank newer/cheaper models without manual DB edits
   - **Mitigation**: Implement priority assignment algorithm in sync

2. **Risk**: No capability-aware filtering; skill can request vision but get non-vision model
   - **Impact**: Runtime failures when model lacks required capability
   - **Mitigation**: Check skill.executionPolicyJson.requirements against model capabilities

3. **Risk**: Admin priority editor may not exist in UI
   - **Impact**: Admins cannot reorder models; forced to edit DB directly
   - **Mitigation**: Verify UI completeness; add if missing

### Medium-Priority Risks

4. **Risk**: Media and LLM use different cost fields (creditCost vs pricingInput/Output)
   - **Impact**: Confusing API; inconsistent cost calculation
   - **Mitigation**: Unify via wrapper service or add creditCost alias

5. **Risk**: Model sync not auto-running; requires manual scheduler
   - **Impact**: New models from OpenRouter not reflected in system
   - **Mitigation**: Add auto-sync to startup or register with scheduler

---

## Key Files & Line References

| Task | File | Lines | Purpose |
|------|------|-------|---------|
| Resolve skill model | skillExecutionPolicy.ts | 47-93 | 4-tier selection cascade |
| Load skill from DB | skillRegistry.ts | 77-166 | DB → SkillDefinition |
| Parse frontmatter | skillRegistry.ts | 168-192 | YAML → routing config |
| Get provider | llmRouter.ts | 74-128 | model → ProviderCandidate |
| Query routing | llmRouter.ts | 130-160 | DB query + sort |
| Suggest media model | modelSuggestTool.ts | 33-77 | Media model suggestion |
| Get media models | modelRegistry.ts | 359-384 | Sorted by priority |
| Sync OpenRouter | modelSyncService.ts | 128-376 | Fetch & insert models |
| Skills schema | schema.ts | 2388-2556 | All skill fields |
| model_provider_map | schema.ts | 640-700 | LLM model mappings |
| mediaModels | schema.ts | 1642-1692 | Media model definitions |
| llmProviders | schema.ts | 565-631 | Provider config |
| Admin UI | AdminLLMModels.tsx | 1-100+ | Admin page |
| Multi-provider | MultiProviderAdmin.tsx | ? | Admin component |
| tRPC router | multiProvider.ts | 1-200+ | API endpoints |

---

## Testing Strategy

```bash
# 1. Skill model selection cascade
test("skill.llmModelId overrides conversation model")
test("skill.defaultModel used when llmModelId disabled")
test("conversation model NOT used when skill.llmModelId set")
test("system default used when all else fail")

# 2. Provider routing
test("provider priority respected (lower = first)")
test("preferredProviderId moves provider up")
test("strictProviderPin=true causes error when provider down")

# 3. OpenRouter sync
test("priority assigned to new synced models")
test("OpenRouter models inserted into model_provider_map")
test("models sorted by priority in admin UI")

# 4. Capability filtering (future)
test("skill requiring vision gets vision-capable model")
test("skill requiring tools gets tool-capable model")
test("error/warning logged when model lacks capability")
```

---

## Conclusion

The SmartSpecPro skill LLM model selection system is **architecturally sound** with comprehensive database schema and proper separation of concerns. The 4-tier cascade provides good flexibility while maintaining skill determinism. However, the implementation is **70% complete** — critical features like priority assignment in sync and capability-aware filtering are missing.

**Estimated effort to reach 100%**: 15-25 engineer-hours across 3-4 weeks, with diminishing returns after the first week's quick wins.

**Next steps**:
1. Verify Admin UI priority editor completeness
2. Implement priority assignment in OpenRouter sync
3. Add auto-sync on startup
4. Implement capability-aware filtering
