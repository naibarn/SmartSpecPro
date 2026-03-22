# Skill Execution System Analysis

## Executive Summary

SmartSpecPro's skill execution system is sophisticated and layered:
- **Skill Loading**: Database-driven with auto-sync from folder changes (60-second cache)
- **Model Selection**: Three-tier fallback (skill-specific > conversation > system default)
- **Content Delivery**: Skill.md content passed as system prompt to LLM, not as user input
- **Model Routing**: Multi-provider routing with health checks, fallback rules, and cost optimization
- **No Capability Detection**: System currently lacks model-specific capability introspection

---

## 1. Skill Loading Pipeline

### Source of Truth: Database, NOT Files

**File**: `apps/web/server/services/skillRegistry.ts`

Skills are **always** loaded from the database (primary) with auto-sync from the folder:

```
Database (primary) ← Folder (secondary, via auto-sync)
                  ↓
            Cached Registry (60s TTL)
                  ↓
        Queries return SkillDefinition[]
```

**Key Functions**:
- `getSkillRegistryAsync()` — Load skills with 60-second cache TTL (line 535)
- `autoSyncSkillsFromFolder()` — Runs on server startup; detects changes via MD5 contentHash (line 245)
- `syncSingleSkillIfChanged()` — Called when user selects a skill; checks if content changed (line 387)

### How skill.md Changes Are Detected

Change detection uses **content hash** comparison:
- Calculate MD5 of raw skill.md file (line 411)
- Compare to `skillsTable.contentHash` stored in DB (line 415)
- If mismatch, update DB with new content + metadata (lines 430-447)

### What Gets Stored in DB

From `parseSkillFile()` in `packages/skills/src/parser.ts`:
1. **YAML Frontmatter** → `SkillMetadata` object (lines 18-20)
2. **Markdown Body** → `skillContent` string (line 20)
3. **Both** → Stored in `skillsTable.skillContent` and `skillsTable.systemPrompt` (line 336)

**Frontmatter Fields** (normalizes snake_case and camelCase):
```yaml
name: Display name
version: "1.0.0"
category: prompt_enhancement|image_generation|video_generation|audio_generation|product_review|article_generation|chat_assistant
icon: lucide icon name
description: Multi-line description
auto_trigger: boolean (default false)
enabled_by_default: boolean (default true)
credit_multiplier: number (default 1.0)
priority: integer (default 50)
llm_model_id: specific LLM model for this skill (OPTIONAL)
preferred_provider_id: specific provider ID (OPTIONAL)
strict_provider_pin: boolean - if true, ONLY use preferred_provider_id (OPTIONAL)
trigger_patterns: regex array (for auto-triggering)
chain_to: next skill slug (for skill chaining)
```

---

## 2. Model Selection for LLM Skills

### Three-Tier Model Selection Hierarchy

**File**: `apps/web/server/routers/chat.ts` lines 1428-1444

When executing an LLM skill, model selection follows this order:

```
1. Skill's llmModelId/defaultModel
   ↓ (if configured in DB)
2. Conversation's model
   ↓ (if conversation exists)
3. Default fallback: "gpt-4o-mini"
```

**Code**:
```typescript
let llmModel = "gpt-4o-mini";  // default

// 1. Use skill's configured model
const skillModelId = (skill as any).llmModelId || (skill as any).defaultModel;
if (skillModelId) {
  llmModel = skillModelId;
}

// 2. Override with conversation model (user's active choice)
if (input.conversationId) {
  const conversation = await getConversationById(input.conversationId, ctx.user.id);
  if (conversation?.model) {
    llmModel = conversation.model;
  }
}
```

### How Skills Can Specify Model Requirements

**In skill.md frontmatter**:
```yaml
# Option 1: Specific LLM model for this skill
llm_model_id: "gpt-4o"

# Option 2: Preferred provider
preferred_provider_id: 2

# Option 3: Strict provider pinning (only use this provider, never fallback)
strict_provider_pin: true
```

**In database** (`skills` table):
- `llmModelId` (varchar 255)
- `preferredProviderId` (integer)
- `strictProviderPin` (boolean)

These are set by:
1. Auto-sync parsing frontmatter (lines 304-306 in skillRegistry.ts)
2. Admin skill editor via tRPC (lines 2286-2287 in routers/skills.ts)

---

## 3. Skill Content → LLM Pipeline

### How skill.md Content Is Used

**File**: `apps/web/server/routers/chat.ts` lines 1410-1426

**The skill markdown content is passed as the SYSTEM PROMPT, not user message**:

```typescript
// Build LLM messages
const llmMessages: Message[] = [];

// Add system message with skill content
llmMessages.push({
  role: "system",
  content: skill.systemPrompt,  // ← This is the skill.md body content
});

// Add user message (with optional reference images)
if (refImageUrls.length > 0) {
  const contentParts: any[] = [{ type: "text", text: userPrompt }];
  for (const imgUrl of refImageUrls) {
    const absoluteUrl = imgUrl.startsWith("http") ? imgUrl : `${baseUrl}${imgUrl}`;
    contentParts.push({ type: "image_url", image_url: { url: absoluteUrl } });
  }
  llmMessages.push({ role: "user", content: contentParts });
} else {
  llmMessages.push({ role: "user", content: userPrompt || `Use ${skill.name}` });
}
```

### Example Skill System Prompt

From `apps/web/skills/business-article-writer/skill.md`:

```markdown
You are an expert business article writer specializing in clear, actionable...
[Full skill content here - used as system prompt]
```

This entire markdown body becomes the system message sent to the LLM.

---

## 4. Model Routing & Provider Selection

### How Models Map to Providers

**File**: `apps/web/server/services/llmRouter.ts`

Provider routing uses a **database-driven model provider map**:

**Table**: `modelProviderMap` (modelId → providerId with pricing)

```sql
SELECT model_provider_map.*, llm_providers.apiKey, llm_providers.baseUrl
FROM model_provider_map
JOIN llm_providers ON model_provider_map.provider_id = llm_providers.id
WHERE model_provider_map.model_id = ?
  AND model_provider_map.is_enabled = true
  AND llm_providers.is_enabled = true
ORDER BY priority;  -- Multiple providers can serve the same model
```

**Key Function**: `resolveProviders(modelId)` (line 53)
- Returns **all available providers** for a model (sorted by priority)
- **Filters by health** using circuit breaker (line 134)
- Applies **routing rules** for cost/priority modes (lines 137-166)
- Returns `ProviderCandidate[]` with pricing info

### Routing Rules

**Table**: `routingRules` (only queried if explicitly configured)

```typescript
interface RoutingRule {
  modelPattern: string;        // "gpt-4o", "gpt-*", "*"
  routingMode: "cost" | "priority";
  maxFallbacks: number;
  providerOrder?: any;         // Custom provider ordering
}
```

**Routing Decision**:
```
1. Find active routing rule matching modelPattern
2. If mode="cost": sort by price (lowest first)
3. If mode="priority": sort by rule's providerOrder
4. Return up to maxFallbacks candidates
```

### Multi-Provider Fallback

**Function**: `executeWithFallback()` (llmRouter.ts lines ~200+)

When the first provider fails:
1. Try next candidate in resolved list
2. Log failure to audit trail
3. Continue up to maxFallbacks
4. If all fail, return error

---

## 5. Model-Specific Behavior & Capability Detection

### CRITICAL FINDING: No Capability Introspection Currently Exists

**What's Missing**:
- No model capability metadata (vision, tool-use, context length, etc.)
- No model feature detection system
- No way to query "does this model support vision?"
- Skills cannot declare model requirements beyond "use this specific model ID"

### What IS Tracked

**Model Metadata** in `modelRegistry.ts` (static fallback):
```typescript
interface ModelDefinition {
  id: string;
  type: "image" | "video" | "audio";
  name: string;
  provider: string;
  description: string;
  aliases: string[];        // For natural language detection
  creditCost: number;
  aspectRatios?: string[];
  sizes?: string[];
  durations?: number[];
  voices?: string[];
  isEnabled?: boolean;
  priority?: number;
  configJson?: Record<string, any>;
}
```

**These are for MEDIA MODELS (image/video/audio), NOT LLM models.**

### LLM Model Metadata

**Table**: `modelProviderMap` tracks:
- `modelId` (string)
- `providerModelId` (what to send to API)
- `pricingInput` / `pricingOutput` (cost per token)
- `isFree` (boolean)
- `priority` (for sorting)

**No additional metadata**:
- ❌ Vision capability
- ❌ Tool calling capability
- ❌ Context window size
- ❌ Function calling version
- ❌ JSON mode support
- ❌ Structured output support
- ❌ Reliability metrics

---

## 6. Skill Execution Modes

### LLM-Only Skills (Most Common)

**Execution**: `executionMode = "llm-only"`
1. Load skill content from DB
2. Send as system prompt
3. Call LLM provider
4. Return response

**Files**: `apps/web/server/routers/chat.ts` (lines ~1400-1550)

### Media Generation Skills

**Execution**: `executionMode = "media-generate"`
1. Extract skill parameters from user input
2. Call media generation API (Kie.ai, etc.)
3. Poll for completion
4. Return media URL

**Files**: `apps/web/server/services/skillExecutor.ts`

### Python Sandbox Skills

**Execution**: `executionMode = "sandbox-python"`
1. Pack skill folder + input JSON
2. Dispatch to sandbox environment
3. Execute Python script
4. Return result

**Files**: `apps/web/server/services/skillExecutor.ts` (lines ~118-149)

---

## 7. Cost Tracking & Credits

### How Costs Are Calculated

**Files**:
- `apps/web/server/services/costTracker.ts`
- `apps/web/server/services/creditService.ts`

**For LLM Skills**:
```
input_cost = input_tokens × pricing_input_per_token
output_cost = output_tokens × pricing_output_per_token
total_cost_usd = input_cost + output_cost
credits_charged = total_cost_usd × 100  (arbitrary unit conversion)
```

**Pricing source**:
1. From `modelProviderMap.pricingInput/Output` (line 121 in llmRouter.ts)
2. Default to 0 if not configured
3. Logged to `providerUsageLog` table

---

## 8. Skill Detection from User Input

### Auto-Trigger Pattern Matching

**File**: `apps/web/server/services/skillDetector.ts`

Skills can auto-trigger based on regex patterns in `triggerPatterns` field:

```typescript
// For each enabled skill with isAutoTrigger = true
for (const skill of skills) {
  if (!skill.isAutoTrigger) continue;

  for (const rule of skill.triggers) {
    if (rule.regex.test(userMessage)) {
      // Auto-trigger this skill
    }
  }
}
```

**Pattern Format**: `trigger_patterns` in frontmatter (JSON array of strings or PatternRule objects)

```yaml
trigger_patterns:
  - "write.*article"
  - "create.*blog.*post"
  - pattern: "generate.*video"
    chainTo: "video-prompt-engineer"  # Chain to another skill
    label: "Video Script"
```

---

## 9. Caching & Performance

### Registry Cache

- **TTL**: 60 seconds (CACHE_TTL_MS, line 187)
- **Auto-sync**: Runs once on server startup
- **On demand**: `syncSingleSkillIfChanged()` checks before execution
- **Manual refresh**: `refreshSkillCache()` clears and reloads

### Why Not File-Based Caching?

**Reason**: Database is the source of truth for:
- Admin customizations (name, description, icon, category)
- User overrides (enabled/disabled per user)
- Routing config (llmModelId, preferredProviderId, strictProviderPin)

Files only provide the content (skill.md markdown body).

---

## 10. Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER TRIGGERS SKILL                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │ skill auto-detect (optional)         │
        │ Matches regex patterns if enabled    │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │ Load skill from registry             │
        │ (Database → cached 60s)              │
        │ Get: name, systemPrompt, llmModelId, │
        │      preferredProviderId, etc.       │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │ Determine model                      │
        │ 1. Skill's llmModelId                │
        │ 2. Conversation's model              │
        │ 3. System default "gpt-4o-mini"     │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │ Resolve provider                     │
        │ Query: modelProviderMap JOIN         │
        │        llmProviders                  │
        │ Filter by health + routing rules     │
        │ Return: ProviderCandidate[] sorted   │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │ Build LLM request                    │
        │ [System] = skill.systemPrompt        │
        │ [User] = user message + images       │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │ Execute with fallback                │
        │ Try provider[0], if fails → [1], etc │
        │ Max fallbacks from routing rule      │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │ Return response + track costs        │
        │ Log to providerUsageLog              │
        │ Deduct credits from user             │
        └──────────────────────────────────────┘
```

---

## Key Architectural Decisions

### 1. Database-Driven Skills (Not File-Based)

**Decision**: Load skills from `skills` table, not `skills/*/skill.md` files.

**Rationale**:
- Enables admin customization without redeploying
- Supports user-created skills (future)
- Allows per-tenant skill variations
- Content hash change detection enables incremental updates

### 2. System Prompt Delivery

**Decision**: Skill content is system message, not user message.

**Rationale**:
- More influence on LLM behavior
- Follows industry best practice for custom AI personas
- LLM treats system prompt as authoritative instruction set

### 3. Model Selection Hierarchy

**Decision**: Skill > Conversation > Default

**Rationale**:
- Skill-specific model for specialized tasks (e.g., vision requires gpt-4o)
- User can override per conversation
- Falls back to safe default

### 4. No Model Capability Metadata

**Current Status**: No capability detection system exists.

**Why It Matters**:
- Skills can't declare "I need a vision model"
- No automatic model selection based on requirements
- Admin must manually configure llmModelId
- Risk of skill → incompatible model mismatches

---

## Recommendations for Skill Improvements

### Short-term (Immediate)

1. **Add Model Requirement Frontmatter Field**
   ```yaml
   llm_requires:
     - vision      # Has vision capability
     - tool_use    # Supports tool calling
     - json_mode   # Outputs structured JSON
   ```

2. **Document Capability Metadata** in model_provider_map
   ```sql
   ALTER TABLE model_provider_map ADD COLUMN capabilities jsonb;
   -- {"vision": true, "toolUse": true, "jsonMode": true, "contextLength": 128000}
   ```

3. **Add Model Selection Logic**
   ```typescript
   // If skill requires vision, filter candidates to vision-capable models
   if (skill.llmRequires?.includes('vision')) {
     candidates = candidates.filter(c => getModelCapabilities(c.providerModelId).vision);
   }
   ```

### Long-term (Architecture)

1. **Implement Provider Capability Introspection**
   - Periodically query provider APIs for model info
   - Cache capabilities with TTL
   - Example: OpenAI `/v1/models` endpoint

2. **Create Model Variant System**
   - Support `gpt-4o@vision` or `claude-opus@tool_use`
   - Map variants to actual provider models
   - Allow admin to define capabilities per variant

3. **Add Skill Validation on Upload**
   - Check if configured llmModelId has required capabilities
   - Warn admin if mismatch detected

---

## Files Reference

| File | Purpose | Key Lines |
|------|---------|-----------|
| `apps/web/server/services/skillRegistry.ts` | Load skills from DB, auto-sync from folder | 75-154 (dbSkillToDefinition), 245-380 (autoSync), 535-545 (getSkillRegistryAsync) |
| `packages/skills/src/parser.ts` | Parse skill.md frontmatter + content | 14-28 (parseSkillFile) |
| `apps/web/server/routers/chat.ts` | Execute LLM skills | 1410-1550 (executeSkill procedure) |
| `apps/web/server/services/llmRouter.ts` | Multi-provider routing + fallback | 53-167 (resolveProviders, executeWithFallback) |
| `apps/web/server/services/modelRegistry.ts` | Model definitions + metadata | 14-49 (ModelDefinition interface) |
| `apps/web/server/services/skillDetector.ts` | Auto-trigger skill detection | (see skillDetector.ts) |
| `apps/web/drizzle/schema.ts` | DB schema for skills, models, providers | (skills, modelProviderMap, llmProviders tables) |

---

## Questions for Implementers

1. **Do we need model capability detection for your use case?**
   - If skills will be created by non-admins, YES
   - If only admin-created skills, maybe not urgent

2. **Should skills be able to reject incompatible models?**
   - E.g., vision skills that refuse non-vision models
   - Currently impossible without adding capability metadata

3. **Is there a multi-tenancy requirement?**
   - Skills can be per-tenant, but currently they're global
   - May need tenant_id field in skills table

4. **Future: User-Created Skills?**
   - Current architecture supports this (DB-driven)
   - Would need validation, isolation, and capability checking

