Now I have all the context needed. Here is the section content:

# Section 04: Context Builder

**File:** `apps/web/server/services/executors/contextBuilder.ts`
**Test file:** `apps/web/server/services/__tests__/contextBuilder.test.ts`
**Depends on:** section-01-types-and-contract (for `ExecutorInput`, `UnifiedExecutionRequest`, `CapabilityFamily`, message types)
**Blocks:** section-06-unified-orchestrator (orchestrator calls all context builder functions)

---

## Overview

This section implements the context enrichment module that the unified orchestrator delegates to for assembling LLM messages, resolving dynamic model requirements, injecting web search parameters, and handling prompt enhancement skills. The context builder bridges channel-specific data (Chat persona/memory, Team Room composed prompts) into a uniform message array that executors consume.

---

## TDD Test Specifications

**File:** `apps/web/server/services/__tests__/contextBuilder.test.ts`
**Run:** `cd /home/dev/projects/SmartSpecPro/apps/web && npx vitest run server/services/__tests__/contextBuilder.test.ts`

### Mocking Strategy

Mock the following external dependencies using `vi.mock()`:

- `../personaService` -- `buildPersonaPromptSegments`, `getPersonaById` (or however persona is loaded)
- `../scopedMemoryService` -- `retrieveForPrompt`
- `../chatService` -- `getEntityMemories`
- `../promptComposer` -- `composePrompt`
- `../webSearchToolInjector` -- `buildWebSearchParams`, `detectProviderFamily`
- `../llmRouter` -- `getProviderForModel`
- `../promptEnhancementService` -- `buildSystemPrompt`, `buildUserPrompt`

### Test Cases

```
# --- buildChatContext ---
# Test: with persona -- loads persona via personaService, calls buildPersonaPromptSegments, retrieveForPrompt, getEntityMemories
# Test: with persona -- composes messages in correct order: [system(persona+memory), system(skill), user(prompt)]
# Test: without persona -- returns minimal messages [system(skillPrompt), user(prompt)]
# Test: knowledgebase appended to skill system prompt when present
# Test: knowledgebase trimmed to 8K chars max
# Test: image URLs resolved from relative to absolute using publicUrl
# Test: multimodal content array built correctly with text + image_url parts
# Test: token budget respected (~6K total for persona context sections)
# Test: data:image URIs passed through without URL resolution
# Test: empty/null persona scoped memory does not inject empty blocks

# --- buildTeamContext ---
# Test: delegates to composePrompt with correct parameters (assistantId, runId, roomId, teamId, objective, tenantId)
# Test: returns composed messages array from composePrompt result

# --- buildDynamicModelRequirements ---
# Test: hasImages flag adds supportsVision: true
# Test: skill with requires_web_search adds supportsWebSearch: true
# Test: skill with requires_thinking adds supportsThinking: true
# Test: skill with thinking_level_hint "high" or "medium" adds supportsThinking: true
# Test: review skill gets supportsWebSearch + supportsThinking + 500K contextLength
# Test: complex skill (thinking_level_hint high) gets enhanced requirements
# Test: route reason containing "web_search" adds supportsWebSearch: true
# Test: base requirements from execution policy are preserved and merged (not overwritten)
# Test: returns unchanged base requirements when no overrides needed

# --- buildPromptEnhancementContext ---
# Test: image-prompt-engineer skill calls buildSystemPrompt and buildUserPrompt from promptEnhancementService
# Test: create-image-prompt skill also triggers prompt enhancement path
# Test: non-enhancement skill returns null (caller uses generic path)
# Test: promptEnhancementService failure falls back to null (caller uses generic path)

# --- injectWebSearchIfNeeded ---
# Test: injects OpenAI web_search_preview tool format when provider is openai
# Test: injects Gemini google_search tool format when provider is gemini
# Test: injects Anthropic web_search tool format when provider is anthropic
# Test: injects Kimi use_search flag when provider is kimi
# Test: appends systemPromptSuffix for unknown providers
# Test: returns unmodified params when web search not needed
# Test: provider resolution failure is non-blocking (returns unmodified params)
# Test: route reason "web_search" triggers injection even without skill policy flag
```

---

## Implementation Guidance

### File Location

`/home/dev/projects/SmartSpecPro/apps/web/server/services/executors/contextBuilder.ts`

Create the `executors/` directory under `apps/web/server/services/` if it does not exist.

### Imports

The module imports from sibling services (all existing, unchanged):

- `buildPersonaPromptSegments` and persona loading from `../personaService` (signature at `/home/dev/projects/SmartSpecPro/apps/web/server/services/personaService.ts` line 356)
- `retrieveForPrompt` from `../scopedMemoryService` (signature at line 280: accepts `tenantId, assistantId, runId, roomId, teamId, query, tokenBudget, embedding?`)
- `getEntityMemories` from `../chatService` (signature at line 568: accepts `userId, entityType?, personaId?`)
- `composePrompt` and `ComposePromptInput`, `ComposePromptResult`, `PromptMessage` from `../promptComposer` (signature at line 313)
- `buildWebSearchParams`, `detectProviderFamily`, `ProviderFamily` from `../webSearchToolInjector`
- `getProviderForModel` from `../llmRouter`
- `buildSystemPrompt`, `buildUserPrompt` from `../promptEnhancementService`
- Types from `./types` (section-01): `UnifiedExecutionRequest`, message-related types

### Exported Functions

#### `buildChatContext()`

**Purpose:** Build the LLM message array for Chat channel requests, optionally enriching with persona profile, scoped memory, and entity memory.

**Parameters:**
- `request: UnifiedExecutionRequest` -- the full unified request (uses `conversationContext`, `userMessage`, `attachments`, `dynamicParams`)
- `skillSystemPrompt: string` -- the skill's system prompt loaded from DB
- `knowledgebase: string | null` -- optional skill knowledgebase content (max 8K chars)

**Returns:** `Promise<Array<{ role: string; content: string | ContentPart[] }>>` -- ordered message array ready for executor

**Logic outline:**
1. If `request.conversationContext?.activePersonaId` is set:
   - Load persona row via personaService
   - Call `buildPersonaPromptSegments(persona)` to get `PersonaPromptSegments`
   - Call `retrieveForPrompt()` with the persona as `assistantId`, scoped to ~3K token budget
   - Call `getEntityMemories()` for the user, scoped to persona
   - Compose a system message containing persona prefix + style + restrictions + scoped memory + entity memory (total ~6K token budget, matching the "balanced" profile from promptComposer)
2. Build skill system prompt message, appending knowledgebase if present (trimmed to 8K chars)
3. Build user message -- if reference images exist in `attachments` or `dynamicParams.reference_images`, construct multimodal content array with `image_url` parts. Resolve relative URLs to absolute using `request.conversationContext?.publicUrl`.
4. If no persona, return `[system(skill), user(prompt)]`
5. With persona, return `[system(persona+memory), system(skill), user(prompt)]`

**Key detail on image URL resolution:** Matches the logic currently in `chat.ts` lines 1554-1580. Relative paths starting with `/` are prefixed with `publicUrl`. URLs starting with `http` or `data:image/` are passed through unchanged.

**Key detail on knowledgebase:** Appended to skill system prompt as `\n\n[DOMAIN KNOWLEDGE]\n{content}`, with content trimmed to 8000 characters. This matches `chat.ts` lines 1535-1537.

#### `buildTeamContext()`

**Purpose:** Thin wrapper around the existing `composePrompt()` for Team Room channel.

**Parameters:**
- `request: UnifiedExecutionRequest` -- uses `teamContext` fields
- `tenantId: string`

**Returns:** `Promise<PromptMessage[]>` -- the composed messages from `composePrompt()`

**Logic:** Delegates directly to `composePrompt()` from `promptComposer.ts` with:
```
{
  assistantId: request.teamContext.assistantId,
  runId: request.teamContext.runId,
  roomId: request.teamContext.roomId,
  teamId: request.teamContext.teamId,
  objective: request.teamContext.objective,
  tenantId,
}
```

#### `buildDynamicModelRequirements()`

**Purpose:** Determine dynamic model capability requirements based on skill policy, attachments, and route context.

**Parameters:**
- `skill: { executionPolicy: Record<string, any> | string | null; category?: string; type?: string }` -- skill definition (executionPolicy may be a JSON string that needs parsing)
- `hasImages: boolean` -- whether the request includes reference images
- `routeReason: string | undefined` -- the reason string from `routeHint`

**Returns:** `{ requirements: Record<string, unknown>; hasOverrides: boolean }` -- merged dynamic requirements and whether any overrides were applied

**Logic:** Extracted from `chat.ts` lines 1590-1634:
1. Parse `executionPolicy` if it is a string (JSON.parse with fallback to `{}`)
2. Start from base requirements: `parsedPolicy.requirements || {}`
3. If `hasImages` is true, set `supportsVision: true`
4. If policy has `requires_web_search` or `requires_citations`, set `supportsWebSearch: true`
5. If policy has `requires_thinking` or `thinking_level_hint` is "high"/"medium", set `supportsThinking: true`
6. If skill category/type includes "review" or `thinking_level_hint === "high"`, set `supportsWebSearch`, `supportsThinking`, and `contextLength >= 500_000`
7. If `routeReason` contains "web_search", set `supportsWebSearch: true`
8. Return requirements and `hasOverrides` flag (compare against base)

#### `buildPromptEnhancementContext()`

**Purpose:** Handle specialized prompt builder skills (e.g., `image-prompt-engineer`) that use custom system/user prompt construction.

**Parameters:**
- `skillSlug: string` -- the skill ID/slug
- `dynamicParams: Record<string, unknown>` -- form parameters from the UI
- `userMessage: string` -- the user's input text

**Returns:** `{ systemPrompt: string; userPrompt: string } | null` -- custom prompts if this is an enhancement skill, null otherwise

**Logic:**
1. Check if `skillSlug` matches known enhancement slugs: `"image_prompt_engineer"`, `"image-prompt-engineer"`, `"create-image-prompt"`
2. If match: call `buildSystemPrompt()` and `buildUserPrompt()` from `promptEnhancementService`
3. Wrap in try/catch -- on failure, return `null` (caller falls back to generic skill prompt)
4. If no match: return `null`

#### `injectWebSearchIfNeeded()`

**Purpose:** Determine if web search is needed and inject provider-specific parameters.

**Parameters:**
- `options: { skillPolicy: Record<string, any> | null; routeReason: string | undefined; modelId: string | null; preferredProviderId?: string; strictProviderPin?: boolean }`

**Returns:** `Promise<{ extraBodyParams: Record<string, unknown>; systemPromptSuffix?: string } | null>` -- web search params or null if not needed

**Logic:** Extracted from `teamRunSkillExecutor.ts` lines 110-141:
1. Determine if web search is needed: check `skillPolicy.requires_web_search`, `skillPolicy.requirements?.supportsWebSearch`, or `routeReason?.includes("web_search")`
2. If not needed, return `null`
3. If needed and `modelId` is available:
   - Call `getProviderForModel(modelId, { preferredProviderId, strictProviderPin })` to resolve the provider
   - Call `detectProviderFamily(provider.providerName)` to get the family
   - Call `buildWebSearchParams(family)` to get provider-specific params
   - Return the `bodyParams` and optional `systemPromptSuffix`
4. If provider resolution fails, return `null` (non-blocking)

### Token Budget Constants

Define constants matching the "balanced" profile from `promptComposer.ts`:

- `CHAT_PERSONA_BUDGET = 1200` -- persona prompt segments
- `CHAT_SCOPED_MEMORY_BUDGET = 3000` -- scoped memory retrieval
- `CHAT_ENTITY_MEMORY_BUDGET = 1500` -- entity memory
- `CHAT_TOTAL_CONTEXT_BUDGET = 6000` -- approximate total for persona enrichment

These are used when calling `retrieveForPrompt()` with the `tokenBudget` parameter and when truncating entity memory entries.

### Dynamic Params Formatting

When building the user prompt for generic skills (non-enhancement), format dynamic parameters as bullet points appended to the user message. Exclude `reference_images` key (handled separately as multimodal content). This matches `chat.ts` lines 1543-1551:

```
Form inputs:
- key1: value1
- key2: value2
```

### Error Handling

- All external service calls (persona loading, memory retrieval, provider resolution) should be wrapped in try/catch
- Failures in persona/memory enrichment should log a warning and fall back to un-enriched context (do not block execution)
- Failures in web search injection should return null (non-blocking)
- The `buildPromptEnhancementContext` function returns null on any error (caller uses generic path)

### Integration Points

- **Orchestrator (section-06):** Calls `buildChatContext()` or `buildTeamContext()` depending on `request.channel`, then calls `buildDynamicModelRequirements()` and `injectWebSearchIfNeeded()` before delegating to the executor
- **Types (section-01):** Uses `UnifiedExecutionRequest`, `ContentPart`, message types from `executors/types.ts`
- **Text executor (section-05):** Receives the built messages and extraBodyParams as `ExecutorInput` fields

### Existing Service Signatures Reference

These services are NOT modified by this section. They are called as-is:

- **`buildPersonaPromptSegments(persona)`** at `/home/dev/projects/SmartSpecPro/apps/web/server/services/personaService.ts:356` -- returns `PersonaPromptSegments { prefix, styleInstructions, restrictionsBulletPoints }`
- **`retrieveForPrompt(tenantId, assistantId, runId, roomId, teamId, query, tokenBudget)`** at `/home/dev/projects/SmartSpecPro/apps/web/server/services/scopedMemoryService.ts:280` -- returns `MemorySearchResult[]`
- **`getEntityMemories(userId, entityType?, personaId?)`** at `/home/dev/projects/SmartSpecPro/apps/web/server/services/chatService.ts:568` -- returns `EntityMemory[]`
- **`composePrompt(input: ComposePromptInput)`** at `/home/dev/projects/SmartSpecPro/apps/web/server/services/promptComposer.ts:313` -- returns `ComposePromptResult { messages, estimatedTokens }`
- **`buildWebSearchParams(family: ProviderFamily)`** at `/home/dev/projects/SmartSpecPro/apps/web/server/services/webSearchToolInjector.ts:34` -- returns `{ bodyParams, systemPromptSuffix? }`
- **`detectProviderFamily(providerName: string)`** at `/home/dev/projects/SmartSpecPro/apps/web/server/services/webSearchToolInjector.ts:14` -- returns `ProviderFamily`
- **`getProviderForModel(modelId, opts?)`** from `/home/dev/projects/SmartSpecPro/apps/web/server/services/llmRouter.ts`

### Estimated Size

~250 lines for the implementation, ~300 lines for tests.