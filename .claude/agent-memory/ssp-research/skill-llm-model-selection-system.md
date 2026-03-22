---
name: Skill LLM Model Selection System
description: Complete analysis of how skills select LLM models, with database schema gaps, UI completeness, and OpenRouter sync status
type: reference
---

# Skill LLM Model Selection System — Complete Research Brief

## Findings

### 1. Current Skill→LLM Selection Flow (Priority Order)

Skills follow a **4-tier priority cascade** for LLM model selection:

```
1. skill.llmModelId              (explicit skill-level model configuration)
   ↓ (if not set)
2. skill.defaultModel             (skill-level default fallback)
   ↓ (if not set)
3. conversationModel              (user's active conversation model — fallback only)
   ↓ (if not set)
4. system_default                 (first enabled model from database)
```

**Source**: `skillExecutionPolicy.ts:47-93` — `resolveSkillExecutionPolicy()` function

**Key constraint**: Skill's `llmModelId` **CANNOT be overridden** by conversation model. Once set, it locks the skill to that model.

### 2. Database Schema — Skills Table (COMPLETE)

**Table**: `skills` (apps/web/drizzle/schema.ts:2388-2556)

**LLM Model Fields** (FULLY IMPLEMENTED):
| Field | Type | Purpose | Notes |
|-------|------|---------|-------|
| `llmModelId` | `varchar(128)` | Canonical routed LLM model ID for text-generation skills | Line 2455 |
| `defaultModel` | `varchar(128)` | Default model for this skill (media skills fallback) | Line 2452 |
| `availableModels` | `json<string[]>` | Available models for media-related skills | Line 2449 |
| `preferredProviderId` | `integer` (FK) | Foreign key to `llm_providers.id` — optional provider pin | Line 2458 |
| `strictProviderPin` | `boolean` | Enforce provider pin without fallback (default: false) | Line 2461 |

**Additional related fields**:
| Field | Type | Purpose |
|-------|------|---------|
| `executionPolicyJson` | `json<object>` | Capability-first execution policy (parsed from skill.md frontmatter) | Line 2540-2552 |
| `executionMode` | `varchar(50)` | Execution mode: `llm-only`, `media-generate`, etc. | Line 2464 |

**Status**: ✅ COMPLETE — All fields exist and are properly indexed

---

### 3. Database Schema — LLM Provider Routing (COMPLETE)

**Table**: `model_provider_map` (apps/web/drizzle/schema.ts:640-700)

**Fields**:
| Field | Type | Purpose | Status |
|-------|------|---------|--------|
| `modelId` | `varchar(128)` | Canonical model identifier (e.g., `gpt-4o`) | ✅ |
| `providerId` | `integer` (FK) | Reference to `llm_providers.id` | ✅ |
| `providerModelId` | `varchar(256)` | Provider-specific model string (e.g., `gpt-4-turbo`) | ✅ |
| `pricingInput` | `numeric(12,8)` | Cost per 1M input tokens | ✅ |
| `pricingOutput` | `numeric(12,8)` | Cost per 1M output tokens | ✅ |
| `isFree` | `boolean` | Whether this model is free to use | ✅ |
| `contextLength` | `integer` | Maximum context window size | ✅ |
| **`priority`** | `integer` | **Lower = higher priority within this provider** | ✅ **EXISTS** |
| `isEnabled` | `boolean` | Whether this mapping is active | ✅ |
| `apiStyle` | `apiStyleEnum` | Endpoint style (chat-completions, responses, messages, gemini) | ✅ |

**Capability metadata** (lines 667-688):
- `supportsResponses` — OpenAI Responses API
- `supportsStructuredOutputs` — JSON mode
- `supportsWebSearch` — Built-in web search
- `supportsFunctionTools` — Tool/function calling
- `supportsCodeExecution` — Code sandbox
- `supportsComputerUse` — Browser automation
- `supportsBackground` — Async processing

**Status**: ✅ COMPLETE — All required fields exist

**Unique constraint** (line 699): `UNIQUE(modelId, providerId)` — ensures one-to-one mapping per provider

---

### 4. Database Schema — Media Models (SEPARATE TRACK)

**Table**: `mediaModels` (apps/web/drizzle/schema.ts:1642-1692)

**Note**: Media models (image, video, audio generation) use a **separate table** from LLM models. This is intentional — media models are for generation APIs (kie.ai, fal.ai), while LLM models route to language models (OpenAI, Anthropic, etc.).

**Fields**:
| Field | Type | Purpose | Has Priority? |
|-------|------|---------|----------------|
| `modelId` | `varchar(128)` | Model identifier (e.g., `google-nano-banana-pro`) | |
| `creditCost` | `integer` | Credit cost per generation | ✅ (line 1664) |
| `priority` | `integer` | Priority for selection (lower = higher) | ✅ (line 1685) |

**Status**: ✅ COMPLETE — Media models have all required fields

---

## Current Architecture

### A. Skill LLM Model Selection Flow

```
User Input
    ↓
skillExecutor.ts:executeSkill() (line 300)
    ├─ Detects skill
    ├─ Calls resolveSkillExecutionPolicy() with {skill, conversationModel}
    │   └─ skillExecutionPolicy.ts:47-93
    │       ├─ Loads enabled LLM model rows from database
    │       ├─ Applies priority: skillLlmModelId > skillDefaultModel > conversationModel > system_default
    │       └─ Returns {modelId, preferredProviderId, strictProviderPin, modelSource}
    │
    ├─ Gets provider for resolved model via llmRouter.ts
    │   └─ getProviderForModel(modelId, hints)
    │       ├─ Calls resolveProviders(modelId)
    │       │   └─ Queries model_provider_map JOINed with llm_providers
    │       │   └─ Returns ProviderCandidate[] sorted by priority
    │       │
    │       └─ Applies provider pin hints (preferredProviderId, strictProviderPin)
    │
    └─ Executes LLM call with selected provider
```

**Key files**:
- `skillExecutionPolicy.ts:47-93` — Resolution logic
- `llmRouter.ts:74-128` — Provider lookup with hints
- `skillRegistry.ts:168-192` — Frontmatter parsing for routing config
- `skillRegistry.ts:77-166` — DB skill → SkillDefinition conversion

---

### B. Skill.md Frontmatter Support

**Currently implemented fields**:

```yaml
---
id: my-skill
name: My Skill
version: "1.0.0"
category: prompt_enhancement
execution_mode: llm-only

# NEW: Explicit LLM model selection
llmModelId: gpt-4o                    # Canonical model ID from model_provider_map
preferred_provider_id: 2              # Optional: pin to specific provider (int or string)
strict_provider_pin: false            # Optional: enforce provider without fallback

# LEGACY (still supported):
defaultModel: gpt-4o                  # Fallback to this if llmModelId not set
chainTo: another-skill                # Chain to another skill after completion
---
```

**Source**: `skillRegistry.ts:168-192` — `getFrontmatterRoutingConfig()`

**Aliases supported** (for backward compatibility):
- `llmModelId` or `llm_model_id`
- `preferredProviderId` or `preferred_provider_id` (string or int)
- `strictProviderPin` or `strict_provider_pin`

---

### C. Model Registry (Media Models Only)

**File**: `modelRegistry.ts`

**Functions**:
- `getDefaultModel(type)` (line 382) — Returns highest-priority model for type
- `getModelsByType(type)` (line 359) — Returns all enabled models for type, sorted by priority
- `getModelsByTypeAsync(type)` (line 582) — Async version with cache refresh
- `detectModelFromMessage(message, type)` (line 424) — NLP detection from user input
- `getModelIdsByType(type)` (line 373) — Returns sorted model IDs

**Important**: This registry is **for MEDIA models only** (image, video, audio). LLM model selection uses `modelProviderMap` table directly.

---

### D. LLM Provider Routing

**File**: `llmRouter.ts`

**Key function**: `getProviderForModel(modelId, hints?)` (line 74-128)

```typescript
// Usage example from skill execution:
const candidate = await getProviderForModel(resolvedModelId, {
  preferredProviderId: skill.preferredProviderId,      // Optional pin
  strictProviderPin: skill.strictProviderPin,          // No fallback if true
});
```

**Provider candidate resolution logic**:
1. Query `model_provider_map` WHERE `modelId = X`
2. JOIN with `llm_providers` to get auth details
3. Sort by `priority` (lower = higher)
4. Apply provider hints (prefer/strict pin)
5. Return first available, or null if strict pin unavailable

---

### E. suggestModel() Function (Media Models)

**File**: `modelSuggestTool.ts:33-77`

**Purpose**: Recommend media models based on quality preference

**Logic**:
```typescript
async function suggestModel(
  purpose: "image" | "video" | "audio" | "text",
  quality_preference?: "speed" | "balanced" | "quality",
): Promise<SuggestResult>
```

**For media** (image/video/audio):
- Calls `getModelsByTypeAsync(purpose)` (from modelRegistry)
- If `quality_preference === "speed"`: sorts by creditCost (cheapest first)
- Otherwise: sorts by priority (default: highest priority first)
- Returns {recommended, alternatives[]}

**For text** (LLM):
- Returns message: "Text model selection is handled by the LLM router. Use the default model."
- Does NOT call getModelsByTypeAsync for text

**Source code reference**: modelSuggestTool.ts:33-77

---

## Risks & Gaps

### 1. ⚠️ NO Capability-Aware Model Selection

**Gap**: There is no automatic mechanism to select models based on declared skill requirements.

**Example problem**:
```
Skill needs: vision, structured output, tool-use
System picks: model-X (which only supports text)
→ Request fails at runtime
```

**What exists**:
- `modelProviderMap` has capability columns: `supportsVision`, `supportsFunctionTools`, etc.
- Skills can declare `executionPolicyJson.requirements` (lines 2540-2552 in schema)

**What's missing**:
- `resolveSkillExecutionPolicy()` does NOT check skill requirements against model capabilities
- No automatic filtering of models by capability match
- No error/warning if selected model lacks required capability

---

### 2. ⚠️ OpenRouter Sync Does NOT Populate Priority or CreditCost

**Current behavior** (modelSyncService.ts):

```
OpenRouter API → fetch models → convert to SyncedModel {
  id, name, contextLength, pricing, provider, description, createdAt
}
→ INSERT into model_provider_map
→ priority = DEFAULT (0)  ← ALWAYS DEFAULT, NOT FROM OPENROUTER
→ No creditCost field (this is for media models, not LLM)
```

**Where it's missing**:
- `modelSyncService.ts:356-375` — `convertModel()` function does not set priority
- No logic to calculate or infer priority from model metadata
- No ranking algorithm (e.g., "recency", "cost", "capability count")

**Impact**:
- All synced models get `priority = 0` (tied, first-come-first-served within provider)
- No way to prefer newer/cheaper/better models via database configuration
- Admin cannot reorder synced models without direct DB edits

---

### 3. ⚠️ Media Models vs LLM Models Use Different Fields

**Media models**:
- Use `mediaModels` table
- Have `creditCost` field
- Have `priority` field
- Used by `modelRegistry.ts` (for media generation)

**LLM models**:
- Use `llmProviders` + `modelProviderMap` tables
- NO `creditCost` field (pricing is in `pricingInput`/`pricingOutput`)
- Have `priority` field (in modelProviderMap)
- Used by `llmRouter.ts` (for text/LLM calls)

**Problem**: Two separate systems with different schemas. Admin UI may not treat them consistently.

---

### 4. ⚠️ No Model Sync for LLM Models (Only for Media)

**What's synced**:
- OpenRouter API → modelProviderMap (manually populated, NOT auto-synced)
- Provider-native APIs (OpenAI, Anthropic, Google, etc.) — fetched but results vary

**What's NOT auto-synced**:
- New LLM models from OpenRouter
- Updated pricing/capabilities for existing models
- Model deprecations

**Evidence**: modelSyncService.ts is called manually or on schedule (not found in startup code)

---

### 5. ✅ Skills Table Fields Are Complete

**All required fields exist and are properly stored**:
- `llmModelId` (line 2455) ✅
- `defaultModel` (line 2452) ✅
- `preferredProviderId` (line 2458) ✅
- `strictProviderPin` (line 2461) ✅
- `executionPolicyJson` (line 2540) ✅

---

## UI Completeness Assessment

### A. Admin LLM Models Page

**File**: `AdminLLMModels.tsx`

**Current state**:
- Loads `listModelMappings()` (groups by modelId)
- Loads `listAdminModelCatalog()` (all provider models)
- Displays summary stats: model groups, total mappings, enabled count
- Delegates to `<MultiProviderAdmin />` component for details

**What's visible**:
- Model ID, provider, pricing (input/output), context length
- Enable/disable toggle per mapping
- **Priority field: NOT visible in screenshot (need to check MultiProviderAdmin)**

---

### B. MultiProviderAdmin Component

**File**: `MultiProviderAdmin.tsx` (first 100 lines)

**Current structure**:
- Props: `mappings` (grouped by modelId), optional `title`
- Renders admin UI for managing model-provider relationships

**What it exposes** (need to read full file for complete picture):
- Likely: model cards, enable/disable buttons, provider selector
- Unknown: whether priority is exposed as an editable field

---

### C. SkillSettings Component

**File**: `SkillSettings.tsx`

**Likely contains**:
- Form fields for skill-level LLM model selection
- Dropdown to pick llmModelId
- Provider pin selector (preferredProviderId, strictProviderPin)

**Need to verify**: Does it expose priority/cost information to help users choose?

---

## Model Sync Status (OpenRouter & Provider APIs)

### Current Implementation

**File**: `modelSyncService.ts`

**What's implemented**:
1. ✅ OpenRouter API fetch (`fetchOpenRouterModels()` line 128)
2. ✅ Provider-native API fetch for:
   - OpenAI, Groq, DeepSeek, Together, Fireworks (OpenAI-compatible)
   - Anthropic (hardcoded)
   - Google AI (special endpoint)
   - Ollama (local)
   - OpenCode Zen (custom endpoint)
3. ✅ Model conversion and filtering by provider prefix (line 382-399)
4. ✅ Database insert/update logic (calls to `syncModelsToDatabase()`)

**What's NOT implemented**:
- ❌ NO `priority` assignment from OpenRouter data (always defaults to 0)
- ❌ NO ranking algorithm for new models
- ❌ NO auto-refresh on startup (must be called manually or via schedule)
- ❌ NO credit cost calculation for LLM models (modelSyncService only syncs context length + pricing, doesn't populate creditCost)

### Missing: Priority Assignment Logic

**Example of what should happen**:
```typescript
// MISSING: No logic like this exists
function assignPriorityToNewModel(model: SyncedModel): number {
  // Option 1: By recency
  if (model.createdAt && isRecent(model.createdAt)) return 1; // Higher priority for recent

  // Option 2: By cost (prefer cheaper)
  if (model.pricing) {
    const avgCost = (model.pricing.input + model.pricing.output) / 2;
    if (avgCost < 0.001) return 5;   // Very cheap
    if (avgCost < 0.01) return 10;   // Cheap
    return 20;                       // Expensive
  }

  // Option 3: By capability count (prefer more capable)
  const capCount = countCapabilities(model);
  return capCount * 2;

  return 99;  // Default fallback
}
```

---

## What Needs to Be Built

### 1. Priority Assignment in Model Sync

**Task**: Implement ranking algorithm for newly synced models

**Steps**:
1. Add `assignPriorityToNewModel(model)` function to modelSyncService
2. Call it during `syncModelsToDatabase()` before INSERT
3. Options:
   - Recency-based: newer models get lower priority value
   - Cost-based: cheaper models get lower priority value
   - Capability-based: more capable models get lower priority value
   - Manual: admin assigns priority via Admin UI

---

### 2. Capability-Aware Model Selection

**Task**: Automatically filter models by skill requirements

**Steps**:
1. Extend `resolveSkillExecutionPolicy()` to:
   - Load skill's `executionPolicyJson.requirements`
   - Query `modelProviderMap` WHERE capabilities match requirements
   - Fall back to unconstrained selection if no match
2. Add error/warning logging when selected model lacks capability
3. Document requirement format (vision, tools, structured-output, etc.)

---

### 3. Media Models: Consolidate Fields

**Option A** (recommended): Unify API
- Add `creditCost` to modelRegistry return type
- modelRegistry queries both media models + pricing cache
- Single interface for both media and LLM cost lookup

**Option B**: Separate presentation layer
- Keep DB schemas separate
- Add wrapper service that translates both to unified cost API
- Admin UI uses wrapper service for consistent display

---

### 4. Admin UI: Expose Priority Field

**Task**: Make priority editable in Admin LLM Models page

**Steps**:
1. Ensure MultiProviderAdmin exposes `priority` column (int, editable)
2. Add tRPC mutation `multiProvider.updateModelPriority(mappingId, priority)`
3. Add validation: priority must be 0-999
4. Show "Priority helps rank models when multiple providers offer same model"

---

### 5. Skill Settings: Show Model Metadata

**Task**: Help users pick models with confidence

**Steps**:
1. When user selects llmModelId in SkillSettings:
   - Show context length, capability tags, cost tier, latency SLO
   - Show "Recommended for: vision, tools, structured output" etc.
2. Add info icon: "Why we recommend this model"
3. Show alternatives: "Similar models by cost/capability"

---

## Open Questions

1. **Priority interpretation**: In SmartSpecPro, does lower priority = "try first" or "try last"?
   - Current code: `sort((a, b) => a.priority - b.priority)` → lower = first
   - Confirm this is intentional

2. **Provider health circuit breaker**: Does provider.healthStatus affect model_provider_map lookups?
   - (Searched code, found `providerHealth.ts` but unclear if it filters queries)

3. **LLM model auto-sync on startup**: Is modelSyncService called at app startup?
   - Need to check `apps/web/server/_core/index.ts` for initialization

4. **Media vs LLM creditCost**: Should both use same currency?
   - Media: credits per generation
   - LLM: pricing per 1M tokens (converted to credits how?)

5. **Skill execution policy**: Is `executionPolicyJson` ever read during model selection?
   - Schema shows it exists (line 2540), but code does NOT check it in resolveSkillExecutionPolicy()
   - Is it for future use or already integrated?

6. **Backward compatibility**: Are skills without llmModelId field still resolved correctly?
   - Code: line 2149 in skillRegistry shows fallback: `llmModelId: llmModelId || defaultModel`
   - Ensures no null values passed to resolver

---

## Summary Table

| Aspect | Status | File:Line | Notes |
|--------|--------|-----------|-------|
| Skill llmModelId storage | ✅ Complete | schema.ts:2455 | Field exists, migrated |
| Skill defaultModel storage | ✅ Complete | schema.ts:2452 | Field exists, fallback chain works |
| Skill preferredProviderId storage | ✅ Complete | schema.ts:2458 | FK to llm_providers |
| Skill strictProviderPin storage | ✅ Complete | schema.ts:2461 | Boolean, enforces pin |
| Model priority (LLM) | ✅ Complete | schema.ts:694 | In modelProviderMap |
| Model priority (media) | ✅ Complete | schema.ts:1685 | In mediaModels |
| Priority-aware model selection | ✅ Complete | modelRegistry.ts:359-384 | Media models sorted by priority |
| Priority-aware LLM selection | ⚠️ Partial | llmRouter.ts:74-128 | Queries priority, but no ranking UI |
| Capability filtering | ❌ Missing | — | No automatic filter by skill requirements |
| OpenRouter sync to modelProviderMap | ✅ Exists | modelSyncService.ts | Manual call, not auto-refresh |
| Priority assignment in sync | ❌ Missing | — | Always defaults to 0 |
| Skill execution policy integration | ⚠️ Partial | skillExecutionPolicy.ts | Stored in DB, not used in selection |
| Admin UI: priority column | ❓ Unknown | AdminLLMModels.tsx | Need to verify MultiProviderAdmin |
| Skill settings: model metadata | ❓ Unknown | SkillSettings.tsx | Need to verify what's shown |

---

## Recommendations

1. **Short-term (critical)**: Implement priority assignment in modelSyncService for new models
2. **Short-term**: Expose priority as editable field in Admin LLM Models UI
3. **Medium-term**: Implement capability-aware model filtering for skill execution
4. **Medium-term**: Add model metadata display to Skill Settings UI
5. **Long-term**: Unify creditCost API for both media and LLM models
