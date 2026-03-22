# TDD Plan: Unified Skill Execution Pipeline

**Testing framework:** Vitest (existing project convention)
**Test location:** `apps/web/server/services/__tests__/` (co-located with source)
**Mocking:** Vitest `vi.mock()` for service dependencies
**Run command:** `cd apps/web && npx vitest run <test-file>`

---

## 2. Capability Contract (Phase 1)

### 2.1-2.3 Types (types.ts)

No tests needed — pure type definitions with no runtime logic.

### 2.4-2.5 Executor Registry (executorRegistry.ts)

**File:** `__tests__/executorRegistry.test.ts`

```
# Test: registerExecutor adds executor to registry
# Test: getExecutor returns correct executor for capability family
# Test: getExecutor returns null for unregistered capability
# Test: getExecutor returns TextSkillExecutor as fallback for unknown text-like capabilities
# Test: static executors are available immediately after module load
# Test: dynamic registration does not override static executors (unless explicitly replaced)
# Test: canHandle is called on candidate executors to confirm match
# Test: multiple executors for same capability — first registered wins
```

---

## 3. Text Skill Executor + Core Orchestrator (Phase 2)

### 3.1 Orchestrator Flow (unifiedOrchestrator.ts)

**File:** `__tests__/unifiedOrchestrator.test.ts`

```
# --- Skill Resolution ---
# Test: resolves skill by routeHint.selectedSkillId when provided
# Test: falls back to general-article-writer when selectedSkillId not found
# Test: throws structured error when no skill can be resolved at all

# --- Capability Classification ---
# Test: skill with category "image_generation" classifies as media.image
# Test: skill with category "video_generation" classifies as media.video
# Test: skill with category "audio_generation" classifies as media.audio
# Test: skill with capability_family in executionPolicy uses declared family
# Test: skill without explicit category defaults to writing.article
# Test: review-classified skill maps to writing.review

# --- Executor Selection ---
# Test: classified capability resolves to correct executor from registry
# Test: unregistered capability falls back to text executor

# --- Context Building (Chat channel) ---
# Test: chat with activePersonaId calls buildChatContext with persona enrichment
# Test: chat without activePersonaId builds minimal skill prompt + user message
# Test: chat context includes knowledgebase when skill has it

# --- Context Building (Team Room channel) ---
# Test: team room calls buildTeamContext which delegates to composePrompt
# Test: team room prepends skill system prompt to composed messages

# --- Dynamic Model Requirements ---
# Test: images in attachments set supportsVision: true
# Test: skill with requires_web_search sets supportsWebSearch: true
# Test: skill with requires_thinking sets supportsThinking: true
# Test: review skill gets supportsWebSearch + supportsThinking + 500K context
# Test: route reason containing "web_search" sets supportsWebSearch: true

# --- Execution Policy + Planner ---
# Test: resolveSkillExecutionPolicy called with merged dynamic requirements
# Test: runPlanner called when taskPlannerEnabled flag is true
# Test: runPlanner skipped when flag is false

# --- Web Search Injection ---
# Test: web search params injected when skill requires web search
# Test: web search params NOT injected when not required
# Test: provider-specific format used (OpenAI tools, Gemini google_search, etc.)

# --- Artifact Classification ---
# Test: presentation skill triggers classifyArtifactIntent
# Test: non-presentation skill skips artifact classification

# --- Credit Handling ---
# Test: creditMode "deduct" calls deductCreditsForModel
# Test: creditMode "calculate_only" calls calculateCreditsForLLMDynamic only
# Test: creditMode "skip" returns 0 credits
# Test: credit deduction failure does not block result return

# --- Persistence Hook ---
# Test: onExecutionComplete hook called after successful execution
# Test: hook failure logged but does not throw

# --- Fallback ---
# Test: orchestrator error triggers fallback audit event
# Test: result shape matches expected format for chat caller
# Test: result shape matches expected format for team room caller
```

### 3.2 Text Skill Executor (textSkillExecutor.ts)

**File:** `__tests__/textSkillExecutor.test.ts`

```
# Test: calls executeSkillLlmWithFallback with provided messages and policy
# Test: model selection priority: dynamic override > planner > policy fallback
# Test: enables thinking mode when execution policy requires it
# Test: passes extraBodyParams (web search tools) to LLM call
# Test: parses next-speaker hint from output when present
# Test: returns raw content, token counts, model used, fallback attempts
# Test: handles LLM failure gracefully (returns error result, not throw)
# Test: multimodal messages (text + images) passed through correctly
```

### 3.3 Context Builder (contextBuilder.ts)

**File:** `__tests__/contextBuilder.test.ts`

```
# --- buildChatContext ---
# Test: with persona — loads persona segments, scoped memory, entity memory
# Test: with persona — composes messages in correct order (persona, memory, skill, user)
# Test: without persona — returns minimal messages (skill system prompt + user)
# Test: knowledgebase appended to skill system prompt when present
# Test: knowledgebase trimmed to 8K chars max
# Test: image URLs resolved from relative to absolute using publicUrl
# Test: multimodal content array built correctly with text + images
# Test: token budget respected (~6K for persona context)

# --- buildTeamContext ---
# Test: delegates to composePrompt with correct parameters
# Test: returns composed messages array

# --- buildDynamicModelRequirements ---
# Test: hasImages flag adds supportsVision
# Test: skill with requires_web_search adds supportsWebSearch
# Test: skill with requires_thinking adds supportsThinking
# Test: review skill gets enhanced requirements
# Test: base requirements from execution policy preserved and merged

# --- buildPromptEnhancementContext ---
# Test: image-prompt-engineer skill uses buildSystemPrompt/buildUserPrompt
# Test: non-enhancement skill returns null (caller uses generic path)

# --- injectWebSearchIfNeeded ---
# Test: injects OpenAI web_search_preview tool format
# Test: injects Gemini google_search tool format
# Test: injects Anthropic web_search tool format
# Test: injects Kimi use_search flag
# Test: appends system prompt suffix for unknown providers
# Test: returns unmodified params when web search not needed
```

### 3.6 Feature Flag Wiring

**File:** `__tests__/unifiedOrchestrator.test.ts` (additional section)

```
# --- Feature Flag Integration ---
# Test: flag=false — chat.ts uses existing inline code (mock verifies orchestrator NOT called)
# Test: flag=true — chat.ts delegates to orchestrator
# Test: flag=false — teamRunSkillExecutor uses existing code
# Test: flag=true — teamRunSkillExecutor delegates to orchestrator
# Test: orchestrator failure with flag=true — caller falls back to existing path
```

### 3.X Channel Parity Tests

**File:** `__tests__/channelParityTests.test.ts`

```
# --- Routing Parity ---
# Test: article writing skill — same capability for chat and team_room
# Test: review skill — same capability for both channels
# Test: image generation skill — same capability for both channels
# Test: skill not found — same fallback for both channels

# --- Policy Parity ---
# Test: same skill + requires_web_search — web search enabled for both channels
# Test: same skill + requires_thinking — thinking enabled for both channels
# Test: reference images — vision enabled for both channels
# Test: review skill — enhanced requirements for both channels

# --- Credit Parity ---
# Test: same execution — same cost calculation regardless of channel
# Test: chat deducts, team room calculates only (by design, not a parity violation)

# --- Failure Parity ---
# Test: LLM failure — same fallback behavior for both channels
# Test: skill resolution failure — same error for both channels
```

---

## 4. Media Executor Adapters (Phase 3)

### 4.2 Image Generation Executor (imageExecutor.ts)

**File:** `__tests__/imageExecutor.test.ts`

```
# Test: canHandle returns true for media.image capability
# Test: canHandle returns false for non-image capabilities
# Test: extracts image params from dynamic params and execution policy
# Test: calls existing media dispatch (Python backend or BullMQ enqueue)
# Test: returns media_job result with job ID and status URL
# Test: handles dispatch failure gracefully
# Test: same routing decision from chat channel and team_room channel
```

### 4.3 Video Generation Executor (videoExecutor.ts)

**File:** `__tests__/videoExecutor.test.ts`

```
# Test: canHandle returns true for media.video capability
# Test: canHandle returns false for non-video capabilities
# Test: extracts video params from dynamic params
# Test: calls existing video pipeline dispatch
# Test: returns media_job result with mediaType "video"
# Test: handles dispatch failure gracefully
```

### 4.4 Audio Generation Executor (audioExecutor.ts)

**File:** `__tests__/audioExecutor.test.ts`

```
# Test: canHandle returns true for media.audio capability
# Test: extracts audio params from dynamic params
# Test: calls existing audio pipeline dispatch
# Test: returns media_job result with mediaType "audio"
# Test: handles dispatch failure gracefully
```
