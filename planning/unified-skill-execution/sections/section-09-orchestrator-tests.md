I now have all the context needed. Let me produce the section content.

# Section 09: Orchestrator Tests

## Overview

This section provides the comprehensive unit test suites for the four core modules built in earlier sections: the **Unified Orchestrator** (section-06), the **Text Skill Executor** (section-05), the **Context Builder** (section-04), and the **Executor Registry** (section-02). All tests live under `apps/web/server/services/__tests__/` and follow the existing Vitest conventions used throughout the project.

**Depends on:** section-06-unified-orchestrator (the primary module under test), which transitively depends on sections 01, 02, 04, and 05.

**Blocks:** Nothing. This section is a leaf node in the dependency graph.

**Parallelizable:** Yes -- can be developed alongside sections 07, 08, 11, and 12.

---

## Test Files

| File | Module Under Test | Estimated Lines |
|------|-------------------|-----------------|
| `apps/web/server/services/__tests__/unifiedOrchestrator.test.ts` | `apps/web/server/services/unifiedOrchestrator.ts` | ~300 |
| `apps/web/server/services/__tests__/textSkillExecutor.test.ts` | `apps/web/server/services/executors/textSkillExecutor.ts` | ~200 |
| `apps/web/server/services/__tests__/contextBuilder.test.ts` | `apps/web/server/services/executors/contextBuilder.ts` | ~250 |
| `apps/web/server/services/__tests__/executorRegistry.test.ts` | `apps/web/server/services/executors/executorRegistry.ts` | ~120 |

**Run command:** `cd /home/dev/projects/SmartSpecPro/apps/web && npx vitest run server/services/__tests__/unifiedOrchestrator.test.ts server/services/__tests__/textSkillExecutor.test.ts server/services/__tests__/contextBuilder.test.ts server/services/__tests__/executorRegistry.test.ts`

---

## General Testing Conventions

All test files follow these conventions based on the existing codebase patterns:

1. **Framework:** Vitest with `describe`, `it`, `expect`, `vi`, `beforeEach`
2. **Mocking:** Top-level `vi.mock()` calls before imports; mutable mock state variables to control behavior per-test
3. **Structure:** Mocks first, then imports, then `describe` blocks grouped by functional area
4. **Assertions:** Verify both that the correct services were called with correct arguments AND that the returned result has the expected shape
5. **Reset:** `beforeEach` resets all mock state to sane defaults so tests are independent

---

## Test File 1: `executorRegistry.test.ts`

**File:** `apps/web/server/services/__tests__/executorRegistry.test.ts`

### Mocking Strategy

No external service mocks needed. The registry is self-contained. Tests create inline mock executors implementing `CapabilityExecutor` from `apps/web/server/services/executors/types.ts`.

### Mock Executor Factory

Each test should create mock executors using a helper:

```typescript
function makeMockExecutor(
  id: string,
  capabilities: CapabilityFamily[],
  canHandleResult = true,
): CapabilityExecutor {
  return {
    id,
    capabilities,
    canHandle: vi.fn().mockReturnValue(canHandleResult),
    execute: vi.fn().mockResolvedValue({ /* stub ExecutorResult */ }),
  };
}
```

### Test Cases

```
describe("executorRegistry")

  describe("registerExecutor")
    # Test: adds executor to registry and it is retrievable by capability
    - Create mock executor with capabilities ["writing.article"], canHandle true.
    - registerExecutor(mock). getExecutor("writing.article") returns the mock.

    # Test: registers executor for multiple capabilities
    - Create mock executor with capabilities ["writing.article", "writing.review"].
    - registerExecutor(mock). Both getExecutor("writing.article") and getExecutor("writing.review") return the mock.

  describe("getExecutor")
    # Test: returns null for unregistered capability when no fallback exists
    - Empty registry (cleared). getExecutor("orchestration.swarm") returns null.

    # Test: returns TextSkillExecutor as fallback for unknown text-like capabilities
    - Register mock for "writing.article" (the default fallback target).
    - getExecutor("skill_factory.create") returns the "writing.article" executor.

    # Test: calls canHandle on candidate executors to confirm match
    - Register mock with canHandle returning false.
    - getExecutor for that capability should fall through to fallback.

    # Test: first registered executor wins (no override)
    - Register executor A for "media.image", then executor B for "media.image".
    - getExecutor("media.image") returns executor A.

    # Test: override flag replaces existing executor
    - Register executor A for "media.image", then executor B with override: true.
    - getExecutor("media.image") returns executor B.

  describe("getAllExecutors")
    # Test: returns deduplicated list of all registered executors
    - Register same executor for multiple capabilities.
    - getAllExecutors() returns a single entry.

  describe("hasExecutor")
    # Test: returns true for registered capability
    # Test: returns false for unregistered capability
```

---

## Test File 2: `contextBuilder.test.ts`

**File:** `apps/web/server/services/__tests__/contextBuilder.test.ts`

### Mocking Strategy

Mock all external service dependencies with `vi.mock()` at module level:

```
vi.mock("../personaService")       -- buildPersonaPromptSegments, getPersonaById
vi.mock("../scopedMemoryService")  -- retrieveForPrompt (or equivalent from scopedMemory.ts)
vi.mock("../memoryService")        -- getEntityMemories
vi.mock("../promptComposer")       -- composePrompt
vi.mock("../webSearchToolInjector") -- buildWebSearchParams, detectProviderFamily
vi.mock("../promptEnhancementService") -- buildSystemPrompt, buildUserPrompt
```

Use mutable `let` variables at the top to control per-test mock return values. Reset in `beforeEach`.

### Test Cases

```
describe("contextBuilder")

  describe("buildChatContext")
    # Test: with persona -- loads persona, calls buildPersonaPromptSegments, retrieveForPrompt, getEntityMemories
    - Set activePersonaId in conversationContext.
    - Assert all three services called with correct args.
    - Assert returned messages array has 3 system+user messages.

    # Test: with persona -- composes messages in correct order
    - Verify message array: [system(persona+scopedMemory+entityMemory), system(skillPrompt), user(prompt)]

    # Test: without persona -- returns minimal messages
    - No activePersonaId set.
    - Assert personaService NOT called.
    - Assert returned messages: [system(skillPrompt), user(userMessage)]

    # Test: knowledgebase appended to skill system prompt when present
    - Skill definition has knowledgebase field with content.
    - Assert the skill system prompt message includes the knowledgebase text appended.

    # Test: knowledgebase trimmed to 8K chars max
    - Skill has knowledgebase exceeding 8192 chars.
    - Assert the appended content is truncated to 8192 characters.

    # Test: image URLs resolved from relative to absolute using publicUrl
    - Attachments contain relative URL "/uploads/img.png".
    - conversationContext.publicUrl is "https://smartaihub.app".
    - Assert resolved URL in multimodal content array is "https://smartaihub.app/uploads/img.png".

    # Test: multimodal content array built correctly with text + image_url parts
    - Attachments contain an image.
    - Assert user message is an array: [{ type: "text", text }, { type: "image_url", image_url: { url } }]

    # Test: token budget respected (~6K total for persona context)
    - Mock persona segments, scoped memory, entity memory each returning large content.
    - Assert total injected context is bounded (persona 1.2K + scoped 3K + entity 1.5K = ~6K).

    # Test: data:image URIs passed through without URL resolution
    - Attachment has "data:image/png;base64,..." URL.
    - Assert URL is used as-is (no publicUrl prefix).

    # Test: empty persona scoped memory does not inject empty blocks
    - retrieveForPrompt returns empty string.
    - Assert no empty memory block in final messages.

  describe("buildTeamContext")
    # Test: delegates to composePrompt with correct parameters
    - Call with teamContext containing assistantId, runId, roomId, teamId, objective, tenantId.
    - Assert composePrompt called with those exact params.

    # Test: returns composed messages array from composePrompt result
    - Mock composePrompt returning an array of messages.
    - Assert buildTeamContext returns the same array.

  describe("buildDynamicModelRequirements")
    # Test: hasImages flag adds supportsVision: true
    # Test: skill with requires_web_search in executionPolicy adds supportsWebSearch: true
    # Test: skill with requires_thinking adds supportsThinking: true
    # Test: skill with thinking_level_hint "high" adds supportsThinking: true
    # Test: review skill gets supportsWebSearch + supportsThinking + 500K contextLength
    # Test: complex skill (thinking_level_hint "high") gets enhanced requirements
    # Test: route reason containing "web_search" adds supportsWebSearch: true
    # Test: base requirements from execution policy preserved and merged
    # Test: returns unchanged base when no overrides needed

  describe("buildPromptEnhancementContext")
    # Test: image-prompt-engineer skill calls buildSystemPrompt and buildUserPrompt
    - Skill slug matches "image-prompt-engineer".
    - Assert promptEnhancementService functions called.
    - Assert returned messages use the custom prompts.

    # Test: non-enhancement skill returns null
    - Skill slug is "general-article-writer".
    - Assert returns null, promptEnhancementService NOT called.

    # Test: promptEnhancementService failure falls back to null
    - buildSystemPrompt throws.
    - Assert returns null (non-blocking).

  describe("injectWebSearchIfNeeded")
    # Test: injects OpenAI web_search_preview tool format
    - Skill requires_web_search, provider resolves to "openai".
    - Assert extraBodyParams contains tools with web_search_preview.

    # Test: injects Gemini google_search tool format
    - Provider is "gemini". Assert google_search tool format.

    # Test: injects Anthropic web_search tool format
    - Provider is "anthropic". Assert anthropic tool format.

    # Test: injects Kimi use_search flag
    - Provider is "kimi". Assert use_search in params.

    # Test: appends systemPromptSuffix for unknown providers
    - Provider is unknown. Assert suffix appended.

    # Test: returns unmodified params when web search not needed
    - Skill does not require web search, route reason has no "web_search".
    - Assert params unchanged.

    # Test: route reason "web_search" triggers injection even without skill policy flag
    - Skill.requires_web_search is false but routeReason contains "web_search".
    - Assert web search injected.
```

---

## Test File 3: `textSkillExecutor.test.ts`

**File:** `apps/web/server/services/__tests__/textSkillExecutor.test.ts`

### Mocking Strategy

```
vi.mock("../skillModelFallback")  -- executeSkillLlmWithFallback
```

Use a mutable mock for the LLM call result. The `TextSkillExecutor` should be imported and its `execute()` method called directly with an `ExecutorInput`.

### Default Mock Return

```typescript
let mockLlmResult: any = {
  response: "Generated article content.",
  usage: { prompt_tokens: 100, completion_tokens: 200 },
  modelUsed: "gpt-4o-mini",
  attempts: [{ model: "gpt-4o-mini", success: true }],
};
```

### Test Cases

```
describe("TextSkillExecutor")

  describe("canHandle")
    # Test: returns true for writing.article RouteDecision
    # Test: returns true for writing.review RouteDecision
    # Test: returns false for media.image RouteDecision

  describe("execute")
    # Test: calls executeSkillLlmWithFallback with provided messages and policy
    - Build ExecutorInput with messages and executionPolicy.
    - Assert executeSkillLlmWithFallback called with messages, policy model, and params.

    # Test: model selection priority -- dynamic override > planner > policy fallback
    - ExecutorInput has dynamicModelOverride set.
    - Assert LLM called with the override model, not the policy model.

    # Test: enables thinking mode when execution policy requires it
    - ExecutorInput with thinkingMode: true.
    - Assert LLM call includes thinking mode flag in extra params.

    # Test: passes extraBodyParams (web search tools) to LLM call
    - ExecutorInput with extraBodyParams containing tools.
    - Assert LLM call includes the extra params.

    # Test: parses next-speaker hint from output when present
    - Mock LLM returning "Content here.\n[NEXT_SPEAKER: analyst]".
    - Assert result.nextSpeakerHint === "analyst".
    - Assert result.content has the hint stripped.

    # Test: returns raw content, token counts, model used, fallback attempts
    - Verify ExecutorResult shape: content, tokens.input, tokens.output, modelUsed, attempts.

    # Test: handles LLM failure gracefully (returns error result, not throw)
    - Mock executeSkillLlmWithFallback rejecting.
    - Assert execute() returns an error result with success: false, not a thrown exception.

    # Test: multimodal messages (text + images) passed through correctly
    - ExecutorInput messages contain multimodal content arrays.
    - Assert LLM called with those messages unchanged.
```

---

## Test File 4: `unifiedOrchestrator.test.ts`

**File:** `apps/web/server/services/__tests__/unifiedOrchestrator.test.ts`

### Mocking Strategy

This is the most heavily mocked test file. All external service dependencies must be mocked at module level:

```
vi.mock("../skillRegistry" or "../skillService") -- skill loading by ID
vi.mock("./executors/executorRegistry")           -- getExecutor
vi.mock("./executors/contextBuilder")             -- buildChatContext, buildTeamContext, buildDynamicModelRequirements, buildPromptEnhancementContext, injectWebSearchIfNeeded
vi.mock("../skillExecutionPolicy")                -- resolveSkillExecutionPolicy
vi.mock("../taskPlannerMiddleware")               -- runPlanner, recordStepAttempt
vi.mock("../artifactRouter")                      -- classifyArtifactIntent, selectExecutionRoute
vi.mock("../creditService")                       -- deductCreditsForModel, calculateCreditsForLLMDynamic
vi.mock("../auditLogger")                         -- auditLogger.log
vi.mock("../_core/logger")                        -- debugLog, debugError
vi.mock("../traceContext")                         -- getTraceId
```

### Default Mock State

Define mutable `let` variables for per-test control:

```typescript
let mockSkill: any = {
  id: "skill-1",
  slug: "general-article-writer",
  name: "Article Writer",
  category: "prompt_enhancement",
  content: "You are a helpful writer...",
  executionPolicy: {},
  tags: [],
};

let mockExecutorResult: any = {
  content: "Generated response.",
  tokens: { input: 150, output: 300 },
  modelUsed: "gpt-4o-mini",
  attempts: [{ model: "gpt-4o-mini", success: true }],
  nextSpeakerHint: undefined,
};
```

Create a mock executor object that `getExecutor` returns:

```typescript
const mockExecutor = {
  id: "text-skill-executor",
  capabilities: ["writing.article" as CapabilityFamily],
  canHandle: vi.fn().mockReturnValue(true),
  execute: vi.fn().mockResolvedValue(mockExecutorResult),
};
```

### Helper: Build Request

Define a helper function to build a valid `UnifiedExecutionRequest` with sensible defaults:

```typescript
function buildRequest(overrides?: Partial<UnifiedExecutionRequest>): UnifiedExecutionRequest {
  return {
    channel: "chat",
    userId: 1,
    tenantId: "tenant-1",
    userMessage: "Write an article about AI.",
    routeHint: { selectedSkillId: "skill-1", route: "skill", reason: "user_selected" },
    ...overrides,
  };
}
```

### Test Cases

```
describe("unifiedOrchestrator")

  describe("executeUnified")

    describe("Skill Resolution")
      # Test: resolves skill by routeHint.selectedSkillId when provided
      - Request has routeHint.selectedSkillId = "skill-1".
      - Mock skill loader returns mockSkill.
      - Assert executeUnified succeeds and result.skillId === "skill-1".

      # Test: falls back to general-article-writer when selectedSkillId not found
      - Mock skill loader returns null for the given ID.
      - Assert skill loader called again with "general-article-writer" slug.
      - Assert result includes the fallback skill.

      # Test: returns structured error when no skill can be resolved at all
      - Mock skill loader returns null for both ID and fallback.
      - Assert result has route.reason containing "skill_resolution_failed".
      - Assert result.result.type === "text" with empty content.

    describe("Capability Classification")
      # Test: skill with category "image_generation" classifies as media.image
      - Set mockSkill.category = "image_generation".
      - Assert result.route.capability === "media.image".

      # Test: skill with category "video_generation" classifies as media.video
      # Test: skill with category "audio_generation" classifies as media.audio

      # Test: skill with capability_family in executionPolicy uses declared family
      - Set mockSkill.executionPolicy.capability_family = "media.image".
      - Even though category is "prompt_enhancement", assert capability is "media.image".

      # Test: skill without explicit category defaults to writing.article
      - mockSkill.category = "prompt_enhancement" (no media category).
      - Assert capability is "writing.article".

      # Test: review-classified skill maps to writing.review
      - Set mockSkill.tags = ["review"] or mockSkill.slug includes "review".
      - Assert capability is "writing.review".

    describe("Executor Selection")
      # Test: classified capability resolves to correct executor from registry
      - getExecutor mock returns mockExecutor.
      - Assert mockExecutor.execute was called.
      - Assert result.telemetry.executorId matches mockExecutor.id.

      # Test: unregistered capability falls back to text executor
      - getExecutor returns null for the classified capability.
      - Assert fallback: getExecutor called again with "writing.article".

    describe("Context Building -- Chat channel")
      # Test: chat with activePersonaId calls buildChatContext with persona enrichment
      - Request has conversationContext.activePersonaId = "persona-1".
      - Assert buildChatContext called with the persona ID and skill.

      # Test: chat without activePersonaId builds minimal context
      - Request has conversationContext but no activePersonaId.
      - Assert buildChatContext called (it handles the no-persona case internally).

      # Test: chat context includes knowledgebase when skill has it
      - mockSkill has knowledgebase field.
      - Assert buildChatContext receives the skill with knowledgebase.

    describe("Context Building -- Team Room channel")
      # Test: team room calls buildTeamContext which delegates to composePrompt
      - Request with channel "team_room" and teamContext set.
      - Assert buildTeamContext called with teamContext params.

      # Test: team room prepends skill system prompt to composed messages
      - buildTeamContext returns messages array.
      - Assert executor receives messages with skill prompt prepended.

    describe("Dynamic Model Requirements")
      # Test: images in attachments set supportsVision: true
      - Request has attachments with an image.
      - Assert buildDynamicModelRequirements called with hasImages: true.

      # Test: skill with requires_web_search sets supportsWebSearch: true
      # Test: skill with requires_thinking sets supportsThinking: true

      # Test: review skill gets enhanced requirements
      - mockSkill classified as writing.review.
      - Assert buildDynamicModelRequirements receives flags for review enhancement.

      # Test: route reason containing "web_search" sets supportsWebSearch
      - Request routeHint.reason = "web_search_detected".
      - Assert buildDynamicModelRequirements called with routeReason containing "web_search".

    describe("Execution Policy + Planner")
      # Test: resolveSkillExecutionPolicy called with merged dynamic requirements
      - Assert resolveSkillExecutionPolicy receives the skill and merged requirements.

      # Test: runPlanner called when the middleware reports enabled
      - Mock runPlanner returning a planner result with model override.
      - Assert recordStepAttempt called after execution.

      # Test: runPlanner returning null means planner was skipped
      - Mock runPlanner returning null.
      - Assert recordStepAttempt NOT called.

    describe("Web Search Injection")
      # Test: web search params injected when skill requires web search
      - Assert injectWebSearchIfNeeded called.
      - Assert executor receives the modified extraBodyParams.

      # Test: web search params NOT injected when not required
      - injectWebSearchIfNeeded returns unmodified params.
      - Assert executor receives original params.

    describe("Artifact Classification")
      # Test: presentation skill triggers classifyArtifactIntent
      - Capability is "writing.article", skill slug contains "presentation".
      - Assert classifyArtifactIntent called.

      # Test: non-presentation skill skips artifact classification
      - Capability is "writing.article", generic skill.
      - Assert classifyArtifactIntent NOT called (or called and returns "chat_reply").

    describe("Credit Handling")
      # Test: creditMode "deduct" calls deductCreditsForModel
      - Request with creditMode "deduct" (or default).
      - Assert deductCreditsForModel called with userId, model, tokens.
      - Assert result.creditsDeducted matches the returned value.

      # Test: creditMode "calculate_only" calls calculateCreditsForLLMDynamic only
      - Request with creditMode "calculate_only".
      - Assert calculateCreditsForLLMDynamic called.
      - Assert deductCreditsForModel NOT called.
      - Assert result.costCredits is populated, creditsDeducted is 0 or undefined.

      # Test: creditMode "skip" returns 0 credits
      - Request with creditMode "skip".
      - Assert neither credit function called.
      - Assert result.costCredits === 0.

      # Test: credit deduction failure does not block result return
      - Mock deductCreditsForModel throwing an error.
      - Assert executeUnified still returns a result (not throws).
      - Assert result.creditsDeducted === 0.
      - Assert result.metadata contains error indication.

    describe("Persistence Hook")
      # Test: onExecutionComplete hook called after successful execution
      - Register a mock persistence hook for "chat" channel.
      - Assert hook.onExecutionComplete called with the result and context.

      # Test: hook failure logged but does not throw
      - Register a hook that throws an error.
      - Assert executeUnified still returns successfully.
      - Assert debugError (or equivalent) was called.

    describe("Error Handling and Fallback")
      # Test: orchestrator error returns error result (not throws)
      - Force an early error (e.g., skill loader throws unexpectedly).
      - Assert result has route.reason "orchestrator_error".
      - Assert result.telemetry.executorId === "unknown".

      # Test: result shape matches expected format for chat caller
      - Verify all required fields in UnifiedExecutionResult are present.

      # Test: result shape matches expected format for team room caller
      - Request with channel "team_room".
      - Verify result still has all required fields.

    describe("Telemetry")
      # Test: result includes routerVersion, policyVersion, executorId, totalDurationMs
      - Assert telemetry object is populated with non-null values.
      - Assert totalDurationMs > 0.

    describe("Audit Logging")
      # Test: unified_route event logged after executor selection
      - Assert auditLogger.log called with eventType "unified_route".

      # Test: unified_credit event logged after credit handling
      - Assert auditLogger.log called with eventType "unified_credit".
```

---

## Implementation Guidance

### Test File Creation Order

Write tests in this order, matching the dependency chain:

1. `executorRegistry.test.ts` -- no service mocks needed, simplest to write
2. `contextBuilder.test.ts` -- mock external services, test pure logic
3. `textSkillExecutor.test.ts` -- mock `executeSkillLlmWithFallback`, test executor contract
4. `unifiedOrchestrator.test.ts` -- most mocks, tests the full orchestration flow

### Mock Module Path Resolution

When mocking modules, use relative paths from the test file location (`__tests__/`). For example:

- To mock `apps/web/server/services/creditService.ts`, use `vi.mock("../creditService", ...)`
- To mock `apps/web/server/services/executors/contextBuilder.ts`, use `vi.mock("../executors/contextBuilder", ...)`
- To mock `apps/web/server/services/executors/executorRegistry.ts`, use `vi.mock("../executors/executorRegistry", ...)`

### Important: Do Not Implement Full Function Bodies

Test files should contain:
- `vi.mock()` declarations with mock factories
- Mock state variables with default values
- `beforeEach` blocks resetting mock state
- `describe`/`it` blocks with stub assertions (e.g., `expect(fn).toHaveBeenCalledWith(...)`)
- Helper functions for building test inputs

Do NOT write full implementations of the modules under test. The tests verify the contract; sections 02, 04, 05, and 06 provide the implementations.

### Verifying the Full Flow

The `unifiedOrchestrator.test.ts` tests should verify the **call sequence**, not the internal logic of each step. For example, the test for "chat with persona" should verify:

1. Skill loader was called with the skill ID
2. `buildChatContext` was called with the persona context
3. `buildDynamicModelRequirements` was called
4. `resolveSkillExecutionPolicy` was called
5. `injectWebSearchIfNeeded` was called
6. The executor's `execute` method was called with the prepared input
7. Credit service was called with the execution result
8. The persistence hook was called
9. The returned result has the expected shape

This "wire test" pattern ensures the orchestrator correctly sequences all steps without testing each step's internal logic (that is covered by the individual module tests).

---

## File Listing

| Action | File Path |
|--------|-----------|
| CREATE | `apps/web/server/services/__tests__/unifiedOrchestrator.test.ts` |
| EXISTED | `apps/web/server/services/__tests__/textSkillExecutor.test.ts` (18 tests, created in section-05) |
| EXISTED | `apps/web/server/services/__tests__/contextBuilder.test.ts` (34 tests, created in section-04) |
| EXISTED | `apps/web/server/services/__tests__/executorRegistry.test.ts` (11 tests, created in section-02) |
| MODIFY | `apps/web/server/services/unifiedOrchestrator.ts` (added `clearPersistenceHooks()` for test cleanup) |

## Implementation Notes

- Three of the four planned test files already existed from earlier sections (02, 04, 05).
- Section-09 created `unifiedOrchestrator.test.ts` with 48 tests covering: skill resolution, executor selection, context building (both channels), dynamic model requirements, execution policy + planner, web search injection (including `systemPromptSuffix` mutation), artifact classification (including non-`chat_reply` path), credit handling (all three modes + failure), persistence hooks (with state cleanup), result shape variants (`text`, `media_job`, `delegated`), telemetry, audit logging, prompt enhancement, and full flow sequence ordering.
- Code review identified a persistence hook state leak (module-level `Map` not cleared between tests). Fixed by adding `clearPersistenceHooks()` export and calling it in `beforeEach`/`afterEach`.
- Total: 126 tests across all 5 test files, all passing.