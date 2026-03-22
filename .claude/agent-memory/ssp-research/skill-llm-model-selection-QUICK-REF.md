---
name: Skill LLM Model Selection — Quick Reference
description: Fast lookup table for skill model selection system, key file locations, data flow
type: reference
---

# Skill LLM Model Selection — Quick Reference

## Skill Model Selection Priority (Highest → Lowest)

```
1. skill.llmModelId              ← Explicit, cannot be overridden
2. skill.defaultModel             ← Fallback to this
3. conversationModel              ← User's active choice (fallback only)
4. system_default                 ← First enabled model in database
```

---

## Frontmatter Fields (skill.md)

```yaml
llmModelId: gpt-4o                    # Canonical model ID (from model_provider_map.modelId)
defaultModel: gpt-4o                  # Fallback for llmModelId
preferred_provider_id: 2              # Pin to provider (int or string)
strict_provider_pin: false            # Enforce pin with no fallback (false = allow fallback)

# Aliases (backward compatible):
llm_model_id: gpt-4o                  # Same as llmModelId
preferred_provider_id: "2"            # Can be string or int
strict_provider_pin: true             # Same as strictProviderPin
```

---

## Database Tables

### skills.columns (LLM-related)

```sql
llmModelId VARCHAR(128)                      -- Skill's forced LLM model
defaultModel VARCHAR(128)                    -- Skill's fallback model
preferredProviderId INTEGER                  -- FK to llm_providers.id (optional pin)
strictProviderPin BOOLEAN DEFAULT false      -- Enforce pin (no fallback)
executionPolicyJson JSON                     -- Future: capability-based selection
```

### model_provider_map.columns (LLM models)

```sql
modelId VARCHAR(128) NOT NULL UNIQUE         -- Canonical ID (e.g., "gpt-4o")
providerId INTEGER NOT NULL                  -- FK to llm_providers.id
providerModelId VARCHAR(256) NOT NULL        -- Provider-specific ID (e.g., "gpt-4-turbo")
pricingInput NUMERIC(12,8)                   -- Cost per 1M input tokens
pricingOutput NUMERIC(12,8)                  -- Cost per 1M output tokens
priority INTEGER DEFAULT 0                   -- Lower = higher priority
isEnabled BOOLEAN DEFAULT true               -- Active?
contextLength INTEGER                        -- Max context window

-- Capability metadata:
supportsVision BOOLEAN
supportsFunctionTools BOOLEAN
supportsStructuredOutputs BOOLEAN
supportsWebSearch BOOLEAN
supportsCodeExecution BOOLEAN
supportsComputerUse BOOLEAN
supportsBackground BOOLEAN
```

### mediaModels.columns (Media generation models — separate!)

```sql
modelId VARCHAR(128) NOT NULL UNIQUE         -- Model ID (e.g., "google-nano-banana-pro")
creditCost INTEGER                           -- Cost per generation
priority INTEGER                             -- Lower = higher priority
provider VARCHAR(64)                         -- e.g., "kie.ai", "fal.ai"
```

---

## Key File Locations

| Task | File | Lines |
|------|------|-------|
| **Resolve skill model** | skillExecutionPolicy.ts | 47-93 |
| **Load skill from DB** | skillRegistry.ts | 77-166 |
| **Parse frontmatter fields** | skillRegistry.ts | 168-192 |
| **Get provider for model** | llmRouter.ts | 74-128 |
| **Query model_provider_map** | llmRouter.ts | 130-160 |
| **Suggest media model** | modelSuggestTool.ts | 33-77 |
| **Get media models by type** | modelRegistry.ts | 359-384 |
| **Sync OpenRouter models** | modelSyncService.ts | 128-376 |
| **Skills table schema** | drizzle/schema.ts | 2388-2556 |
| **model_provider_map schema** | drizzle/schema.ts | 640-700 |
| **mediaModels schema** | drizzle/schema.ts | 1642-1692 |
| **llmProviders schema** | drizzle/schema.ts | 565-631 |
| **Admin LLM Models UI** | pages/AdminLLMModels.tsx | 1-100+ |
| **Multi-provider admin** | components/admin/MultiProviderAdmin.tsx | ? |

---

## Data Flow: Skill Execution

```
1. User: "execute skill X with prompt Y"

2. skillExecutor.ts:300
   ├─ Call resolveSkillExecutionPolicy({skill, conversationModel})
   │
3. skillExecutionPolicy.ts:47
   ├─ Load enabled LLM models: loadEnabledLlmModelRows()
   ├─ Apply cascade: [skill.llmModelId, skill.defaultModel, convModel]
   ├─ Return {modelId, preferredProviderId, strictProviderPin, modelSource}
   │
4. llmRouter.ts:74 via getProviderForModel(modelId, hints)
   ├─ Query model_provider_map WHERE modelId = X
   ├─ Sort by priority (lower first)
   ├─ Apply hints: preferredProviderId filter
   ├─ Return ProviderCandidate {providerId, apiKey, baseUrl, ...}
   │
5. Send API request to selected provider's baseUrl with apiKey
```

---

## Common Operations

### Read: Get skill's resolved LLM model

```typescript
import { resolveSkillExecutionPolicy } from '../services/skillExecutionPolicy';

const policy = await resolveSkillExecutionPolicy({
  skill,
  conversationModel: user.activeModel,
});

const modelId = policy.modelId;  // e.g., "gpt-4o"
const source = policy.modelSource;  // "skill_llmModelId" | "skill_defaultModel" | ...
```

### Read: Get provider for model

```typescript
import { getProviderForModel } from '../services/llmRouter';

const candidate = await getProviderForModel('gpt-4o', {
  preferredProviderId: 5,
  strictProviderPin: false,
});

if (candidate) {
  // Use candidate.apiKey + candidate.baseUrl
}
```

### Read: List models for skill

```typescript
import { db } from '../db';
import { modelProviderMap } from '../../drizzle/schema';

const models = await db
  .select({modelId: modelProviderMap.modelId})
  .from(modelProviderMap)
  .where(eq(modelProviderMap.isEnabled, true))
  .distinct();
```

### Write: Update skill's LLM model

```typescript
import { db } from '../db';
import { skills } from '../../drizzle/schema';

await db
  .update(skills)
  .set({
    llmModelId: 'gpt-4o',
    preferredProviderId: 2,
    strictProviderPin: false,
  })
  .where(eq(skills.id, skillId));
```

---

## What's MISSING (Known Gaps)

| Feature | Status | Impact |
|---------|--------|--------|
| Capability-aware model selection | ❌ No | Skill can request vision, but system may pick non-vision model |
| Priority assignment in model sync | ❌ No | All new synced models get priority=0 (tied) |
| Media/LLM creditCost unification | ⚠️ Partial | Two different fields in two different tables |
| Admin UI: priority editor | ❓ Unknown | Can't reorder models by priority in UI |
| Skill settings: model metadata | ❓ Unknown | Users don't see cost/capability info |
| Auto-sync on startup | ❌ No | modelSyncService must be called manually |
| executionPolicyJson usage | ⚠️ Stored but unused | Field exists but not checked during selection |

---

## Terminology

| Term | Definition | Example |
|------|-----------|---------|
| **modelId** | Canonical internal model ID | `gpt-4o`, `claude-opus-4-6` |
| **providerModelId** | Provider-specific model string | `gpt-4-turbo`, `claude-3-opus-20240229` |
| **priority** | Ranking (lower = higher priority) | 0 = highest, 99 = lowest |
| **llmModelId** | Skill's explicit forced model (skill table column) | `gpt-4o` |
| **defaultModel** | Skill's fallback model (skill table column) | `gpt-4o` |
| **conversationModel** | User's active model choice | `gpt-4o` |
| **preferredProviderId** | Optional provider pin | 2 (references llm_providers.id) |
| **strictProviderPin** | Enforce provider pin (no fallback) | `true` = error if provider unavailable |

---

## Enum Values

### apiStyleEnum (model_provider_map.apiStyle)

```sql
'chat-completions'    -- OpenAI-compatible
'responses'           -- OpenAI Responses API
'messages'            -- Anthropic Messages API
'gemini'              -- Google Gemini API
```

### skillCategoryEnum (skills.category)

```sql
'prompt_enhancement'
'image_prompt_generation'
'video_prompt_generation'
'article_generation'
'product_review'
'image_generation'
'video_generation'
'audio_generation'
'chat_assistant'
'other'
```

---

## Testing Checklist

- [ ] Can skill override conversation model with llmModelId?
- [ ] Does skill respect preferredProviderId when available?
- [ ] Does strictProviderPin=true cause error when provider down?
- [ ] Does defaultModel work as fallback when llmModelId disabled?
- [ ] Does system default model work when all others are disabled?
- [ ] Can admin edit model priority in UI?
- [ ] Do synced models from OpenRouter get assigned priority?
- [ ] Does capability-aware selection work (vision, tools, etc.)?
