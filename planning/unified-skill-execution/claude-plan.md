# Implementation Plan: Unified Skill Execution Pipeline

## 1. Overview

### 1.1 Problem

SmartSpecPro has two independent skill execution pipelines that handle the same fundamental task through different code paths:

- **Chat** (`apps/web/server/routers/chat.ts`, ~330 lines inline): Supports multimodal input, dynamic model requirements, artifact classification, and immediate credit deduction. Lacks persona context, memory injection, web search tools, and conversation history enrichment.

- **Team Room** (`apps/web/server/services/teamRunSkillExecutor.ts`, ~200 lines): Supports full persona context via `composePrompt()`, entity and scoped memory, web search injection, and next-speaker hints. Lacks vision/multimodal support, dynamic model requirements, and artifact classification. Credits are calculated but not deducted (the orchestrator handles deduction separately).

This divergence causes feature drift, inconsistent behavior, duplicated tests, and bugs that get fixed in one pipeline but not the other.

### 1.2 Solution

Create a **Unified Orchestrator** that owns all execution decisions. Both Chat and Team Room become thin channel shells delegating to this single service. The orchestrator uses an **Executor Registry** pattern where modality-specific logic lives in pluggable executors (text, image, video, audio). Media pipelines are wrapped as adapter executors rather than rewritten.

### 1.3 Scope

This plan covers **Phases 1-3** of the full migration:

| Phase | Deliverable |
|-------|-------------|
| 1 | Capability contract (types, executor interface, registry) |
| 2 | Text skill executor + core orchestrator (LLM skills unified) |
| 3 | Media executor adapters (wrap existing image/video/audio pipelines) |

**Out of scope:** Full chat.ts migration to thin shell (Phase 4), removing all duplicate logic (Phase 5), SwarmExecutor, CreateSkillExecutor.

### 1.4 Design Principles

1. **One brain, two skins** — Logic must be identical between channels; only permissions, flags, quotas, and UI surface differ.
2. **Unified orchestrates, specialized pipelines execute** — The orchestrator owns routing and policy; executors own modality-specific execution.
3. **Migrate chat to unified, not team chat back to chat.ts** — Pull chat's capabilities up into the unified layer, don't push team chat's patterns down.
4. **No big-bang rewrite** — Existing media/video/audio pipelines are wrapped as adapters, not rewritten.
5. **Feature flag gated** — The unified path is behind `unifiedSkillExecution` (default `false`); callers check the flag and delegate or fall through to existing logic.

---

## 2. Capability Contract (Phase 1)

### 2.1 Capability Families

Define a closed set of capability families that the orchestrator routes to:

```typescript
type CapabilityFamily =
  | "writing.article"
  | "writing.review"
  | "media.image"
  | "media.video"
  | "media.audio"
  | "orchestration.swarm"
  | "skill_factory.create";
```

Each skill maps to exactly one capability family. The mapping is determined by: (1) skill category/type from the database, (2) execution policy hints, (3) dynamic classification for ambiguous cases.

**Skill frontmatter extension for hybrid registry:** Skills may optionally declare `capability_family` in their `skill.md` frontmatter (e.g., `capability_family: media.image`). When present, this takes priority over category-based inference. This enables custom skills to self-classify without modifying the orchestrator's classification logic. The field is stored in the `skills` table as part of the `executionPolicy` JSON column.

### 2.2 Unified Request Type

The orchestrator accepts a single request type from both channels. The channel provides whatever context it has; the orchestrator uses what's available.

Key fields:
- `channel`: `"chat" | "team_room"` — identifies the caller
- `userMessage`: the user's input text
- `attachments`: optional images/files (for vision)
- `conversationContext`: optional chat-specific context (conversationId, activePersonaId, conversationModel)
- `teamContext`: optional team-specific context (assistantId, roomId, teamId, runId, objective)
- `routeHint`: optional routing hint from `routeRoomIntent()` or chat skill detection
- `creditMode`: `"deduct" | "calculate_only" | "skip"` — defaults to `"deduct"`
- `capabilitiesAllowed`: optional restriction list (channel may limit what's available)
- `dynamicParams`: skill form parameters from the UI

### 2.3 Unified Result Type

The orchestrator returns a discriminated union result:

- `route`: which capability was selected, which executor handled it, and why
- `result`: either `{ type: "text", content }` for LLM results, `{ type: "media_job", mediaType, jobPayload }` for media generation, or `{ type: "delegated", target, payload }` for delegation to external systems
- `tokens`: input/output token counts
- `costCredits`: calculated credit cost
- `creditsDeducted`: actual credits deducted (if `creditMode` was `"deduct"`)
- `skillId`: which skill was executed
- `nextSpeakerHint`: optional hint for team room turn order
- `telemetry`: routing version, policy version, executor ID, fallback attempts, duration

### 2.4 Executor Interface

Each executor implements:

```typescript
interface CapabilityExecutor {
  id: string;
  capabilities: CapabilityFamily[];
  canHandle(route: RouteDecision): boolean;
  execute(input: ExecutorInput): Promise<ExecutorResult>;
}
```

`ExecutorInput` is a subset of the unified request that's relevant to execution (messages, model policy, extra params). `ExecutorResult` contains the raw output, token counts, model used, and fallback attempts.

### 2.5 Executor Registry

**Hybrid discovery model:**

1. **Static base executors** registered at module initialization:
   - `TextSkillExecutor` — handles `writing.article`, `writing.review`
   - `ImageGenerationExecutor` — handles `media.image`
   - `VideoGenerationExecutor` — handles `media.video`
   - `AudioGenerationExecutor` — handles `media.audio`

2. **Dynamic extension point**: Skills can declare a `capabilityFamily` in their `skill.md` frontmatter. If a skill's capability doesn't match any static executor, the registry falls through to `TextSkillExecutor` as the default.

3. **Registration API**: `registerExecutor(executor: CapabilityExecutor)` — allows future executors (swarm, create-skill) to self-register at startup.

**File:** `apps/web/server/services/executors/executorRegistry.ts`

### 2.6 Files for Phase 1

```
apps/web/server/services/executors/
  types.ts                    # All shared types (request, result, executor interface, capability families)
  executorRegistry.ts         # Registry with static + dynamic discovery
```

---

## 3. Text Skill Executor + Core Orchestrator (Phase 2)

This is the largest phase. It extracts the shared skill execution logic from both pipelines into a unified orchestrator and a text-specific executor.

### 3.1 Orchestrator Flow

The orchestrator (`unifiedOrchestrator.ts`) is the single entry point. Its flow:

1. **Resolve skill** — Load skill definition from DB by `routeHint.selectedSkillId` or detect from input. Fallback to `general-article-writer`.

2. **Classify capability** — Map skill to a `CapabilityFamily` based on skill category, type, and execution policy. Rules:
   - `category === "image_generation"` → `media.image`
   - `category === "video_generation"` → `media.video`
   - `category === "audio_generation"` → `media.audio`
   - Skills with `executionMode === "swarm"` → `orchestration.swarm`
   - Everything else → `writing.article` (or `writing.review` if review-classified)

3. **Select executor** — Query the executor registry for a handler matching the capability.

4. **Build execution context** — This is where channel-specific enrichment happens:

   **For Chat channel with persona:**
   - If `conversationContext.activePersonaId` is set, load persona profile and build persona prompt segments via `buildPersonaPromptSegments()`
   - Retrieve persona-scoped memory via `retrieveForPrompt()`
   - Retrieve entity memory from conversation via `getEntityMemories()`
   - Compose messages: persona system prompt + memory context + skill system prompt + user message

   **For Chat channel without persona:**
   - Skill system prompt + user prompt + dynamic params (current behavior)

   **For Team Room channel:**
   - Call `composePrompt()` with full team context (persona, history, memory, adaptive budgets)
   - Prepend skill system prompt to composed messages

5. **Build dynamic model requirements** — Shared logic extracted from chat.ts lines 1590-1634:
   - Check for images → `supportsVision: true`
   - Check skill policy for `requires_web_search` → `supportsWebSearch: true`
   - Check for `requires_thinking` / `thinking_level_hint` → `supportsThinking: true`
   - Review/complex skills → enhanced capabilities + 500K context
   - Route reason includes "web_search" → `supportsWebSearch: true`

6. **Resolve execution policy** — Call `resolveSkillExecutionPolicy()` with dynamic requirements merged in.

7. **Run task planner** — Call `runPlanner()` if task planner feature flag is enabled.

8. **Inject web search params** — Shared logic extracted from teamRunSkillExecutor.ts lines 110-141:
   - Detect if web search is needed (from skill policy, route reason, or freshness)
   - Resolve provider family for the selected model
   - Call `buildWebSearchParams()` for provider-specific tool format
   - Append to extraBodyParams and/or system prompt suffix

9. **Classify artifact intent** (text skills only) — For presentation/report skills, call `classifyArtifactIntent()` and `selectExecutionRoute()` from the existing artifact classification system. If the intent is not `"chat_reply"`, update the task run artifact metadata. This preserves Chat's existing artifact routing for slide/report generation skills.

10. **Delegate to executor** — Pass prepared `ExecutorInput` to the selected executor.

11. **Handle credits** — Based on `creditMode`:
    - `"deduct"`: Call `deductCreditsForModel()` with full metadata
    - `"calculate_only"`: Call `calculateCreditsForLLMDynamic()`, return amount
    - `"skip"`: Return 0

12. **Record planner step** — If planner was used, call `recordStepAttempt()`.

13. **Emit persistence hook** — Call registered `onExecutionComplete` callback so the channel can save messages in its own format.

14. **Return unified result** — Assemble and return `UnifiedExecutionResult`.

**File:** `apps/web/server/services/unifiedOrchestrator.ts`

### 3.2 Text Skill Executor

The text executor handles `writing.article` and `writing.review` capabilities. It wraps `executeSkillLlmWithFallback()`.

**Flow:**
1. Receive `ExecutorInput` (messages, execution policy, extra params, thinking mode)
2. Determine model selection priority: dynamic requirements override → planner resolution → execution policy fallback
3. Call `executeSkillLlmWithFallback()` with messages, policy, and params
4. Parse next-speaker hint from output if present
5. Return raw content, token counts, model used, fallback attempts

This executor does NOT handle:
- Credit deduction (orchestrator's job)
- Message persistence (channel's job via hook)
- Skill resolution (orchestrator's job)
- Context building (orchestrator's job)

**File:** `apps/web/server/services/executors/textSkillExecutor.ts`

### 3.3 Context Building Service

Extract the context enrichment logic into a dedicated module that the orchestrator calls:

**`buildChatContext()`** — New function for Chat channel persona enrichment:
- If `activePersonaId` is set:
  1. Load persona row from `personaTemplates` table via `personaService.getPersonaById()`
  2. Call `buildPersonaPromptSegments()` from `apps/web/server/services/personaService.ts` — returns identity, style, and restriction segments
  3. Call `retrieveForPrompt()` from `apps/web/server/services/scopedMemory.ts` — retrieves persona-scoped memory entries (max ~3K tokens)
  4. Call `getEntityMemories()` from `apps/web/server/services/memoryService.ts` with the conversationId — retrieves conversation-level entity memories (max ~1.5K tokens)
  5. Compose messages: `[{ role: "system", content: personaSegments + scopedMemory + entityMemory }, { role: "system", content: skillSystemPrompt }, { role: "user", content: userPrompt }]`
- If no persona: `[{ role: "system", content: skillSystemPrompt }, { role: "user", content: userPrompt }]`
- Token budget for Chat persona context: ~6K tokens total (1.2K persona + 3K scoped memory + 1.5K entity memory), matching Team Room's "balanced" profile

**Knowledgebase handling:** If the skill has a `knowledgebase` field (max 8K chars), append it to the skill system prompt message. This is currently done in chat.ts (lines 1496-1508) and must be preserved in the unified path.

**Image URL resolution:** When `attachments` contain reference images with relative URLs (e.g., `/uploads/...`), resolve them to absolute URLs using the provided `publicUrl` from the conversation context. Build multimodal content arrays with `[{ type: "text", text }, { type: "image_url", image_url: { url } }]` format. This is currently done in chat.ts (lines 1554-1580).

**`buildTeamContext()`** — Thin wrapper around existing `composePrompt()`:
- Call `composePrompt()` from `apps/web/server/services/promptComposer.ts` with `{ assistantId, runId, roomId, teamId, objective, tenantId }`
- Return composed messages array

**`buildDynamicModelRequirements()`** — Extracted from chat.ts lines 1590-1634:
- Accept skill definition, execution policy, and context flags (hasImages, routeReason)
- Return merged requirements object

**`buildPromptEnhancementContext()`** — Special handling for `image_prompt_engineer` and similar skills that use custom prompt builders:
- If skill slug matches prompt enhancement skills (e.g., `image-prompt-engineer`), call `buildSystemPrompt()` and `buildUserPrompt()` from `apps/web/server/services/promptEnhancementService.ts` instead of using the generic skill system prompt
- This preserves the existing custom prompt builder behavior that chat.ts has for these specialized skills

**File:** `apps/web/server/services/executors/contextBuilder.ts`

### 3.4 Web Search Injection

Extract the web search injection logic into a shared function used by the orchestrator:

**`injectWebSearchIfNeeded()`** — Determines if web search is needed and injects provider-specific params:
- Input: messages array, skill, execution policy, route reason
- Logic: Check skill policy `requires_web_search`, route reason, skill freshness hints
- If needed: resolve provider family, call `buildWebSearchParams()`, merge into extraBodyParams
- Returns: modified extraBodyParams and optionally modified system prompt

This consolidates the logic currently in teamRunSkillExecutor.ts (lines 110-141) and the implicit web search handling in chat.ts dynamic requirements.

**File:** This can live in `contextBuilder.ts` or stay in the existing `webSearchToolInjector.ts` with an additional convenience wrapper.

### 3.5 Persistence Hook Registration

The orchestrator exposes a hook registration mechanism:

```typescript
interface PersistenceHook {
  channel: "chat" | "team_room";
  onExecutionComplete(
    result: UnifiedExecutionResult,
    context: { conversationId?: number; roomId?: string; runId?: string }
  ): Promise<void>;
}
```

- `chat.ts` registers a hook that calls `createMessage()` to save to conversation
- Team Room registers a hook that saves to `teamRoomMessages` (or lets the orchestrator handle it)
- Hooks are registered once at module initialization, not per-request

### 3.6 Feature Flag Wiring

**In `apps/web/shared/featureFlags.ts`:**
Add `unifiedSkillExecution: boolean` (default: `false`).

**In `apps/web/server/routers/chat.ts`:**
At the start of the LLM skill block (line ~1491):
- Check `unifiedSkillExecution` flag for the tenant
- If `true`: build `UnifiedExecutionRequest` from chat context, call orchestrator, handle result
- If `false`: fall through to existing inline code (unchanged)

**In `apps/web/server/services/teamRunSkillExecutor.ts`:**
At the start of `executeTeamRunSkillTurn()`:
- Check `unifiedSkillExecution` flag
- If `true`: build `UnifiedExecutionRequest` from team context, call orchestrator, map result to `TeamRunSkillExecutionResult`
- If `false`: fall through to existing code (unchanged)

### 3.7 Files for Phase 2

```
apps/web/server/services/
  unifiedOrchestrator.ts              # Core orchestrator (routing, policy, execution)
  executors/
    textSkillExecutor.ts              # LLM/text skill execution
    contextBuilder.ts                 # Context enrichment (chat persona, team prompt, dynamic reqs)

apps/web/server/services/__tests__/
  unifiedOrchestrator.test.ts         # Orchestrator unit tests
  textSkillExecutor.test.ts           # Text executor tests
  channelParityTests.test.ts          # Cross-channel parity assertions

Modified:
  apps/web/server/routers/chat.ts     # Add flag check → delegate to unified
  apps/web/server/services/teamRunSkillExecutor.ts  # Add flag check → delegate
  apps/web/shared/featureFlags.ts     # Add unifiedSkillExecution flag
```

---

## 4. Media Executor Adapters (Phase 3)

### 4.1 Strategy

Existing media pipelines remain untouched. Each adapter executor translates the unified request/response into calls to existing services.

### 4.2 Image Generation Executor

**Wraps:** The existing image generation flow in chat.ts (which calls Python backend Celery tasks).

**Flow:**
1. Receive `ExecutorInput` with skill definition and dynamic params
2. Detect image generation parameters (model, dimensions, style, etc.) from skill execution policy and dynamic params
3. Call existing `handleMediaSkill()` or equivalent media dispatch logic
4. Return `{ type: "media_job", mediaType: "image", jobPayload }` — the job ID and status URL

**Key consideration:** The existing image generation in chat.ts interleaves heavily with the chat router (reading form params, calling Python endpoints, polling job status). The adapter must extract the essential dispatch call without copying router-level logic.

**Approach:** Identify the minimal API call surface — likely the call to the Python backend's image generation endpoint or the BullMQ job enqueue — and wrap just that.

**File:** `apps/web/server/services/executors/imageExecutor.ts`

### 4.3 Video Generation Executor

**Wraps:** Existing video generation pipeline (Celery tasks for video processing).

**Same adapter pattern as image:** Extract the dispatch call, wrap it in the executor interface, return a media job result.

**File:** `apps/web/server/services/executors/videoExecutor.ts`

### 4.4 Audio Generation Executor

**Wraps:** Existing audio generation pipeline.

**Same adapter pattern.**

**File:** `apps/web/server/services/executors/audioExecutor.ts`

### 4.5 Capability Classification Enhancement

Update the orchestrator's capability classification (step 2 in section 3.1) to properly route media skills:

- Parse `skill.category` for `image_generation`, `video_generation`, `audio_generation`
- Check `skill.executionMode` for media indicators
- Map to the correct capability family
- The executor registry returns the matching media adapter

### 4.6 Chat.ts Integration for Media

When the unified flag is on and the orchestrator routes to a media executor:
- The orchestrator calls the media executor
- The executor returns a `media_job` result
- Chat.ts (as the channel shell) receives this and handles the job polling / status updates that are UI-specific

This means chat.ts still has some media-specific UI handling, but the **decision** to use media and the **dispatch** go through the unified path.

### 4.7 Files for Phase 3

```
apps/web/server/services/executors/
  imageExecutor.ts        # Image generation adapter
  videoExecutor.ts        # Video generation adapter
  audioExecutor.ts        # Audio generation adapter

apps/web/server/services/__tests__/
  imageExecutor.test.ts   # Image executor adapter tests
  videoExecutor.test.ts   # Video executor adapter tests
  audioExecutor.test.ts   # Audio executor adapter tests
```

---

## 5. Cross-Cutting Concerns

### 5.1 Error Handling

The orchestrator catches errors at each stage and returns structured error results:

- **Skill resolution failure:** Return error with `skillId: "unknown"`, suggest fallback
- **Executor not found:** Return error, fall through to TextSkillExecutor if capability is text-like
- **LLM execution failure:** `executeSkillLlmWithFallback()` already handles model-level retries (up to 5 attempts). The orchestrator surfaces the final failure.
- **Credit deduction failure:** Log error, return result with `creditsDeducted: 0` and an error flag. Do not block the response from reaching the user.
- **Persistence hook failure:** Log error, do not block. The response has already been generated.

### 5.2 Audit Logging

The orchestrator integrates with the existing audit trail:
- Log `"unified_route"` event with capability, executor, confidence
- The executor (via `executeSkillLlmWithFallback`) already logs `"llm_request"` / `"llm_response"` events
- Log `"unified_credit"` event with deduction details
- All events include `traceId` from request context

### 5.3 Telemetry

The result includes a `telemetry` object for observability:
- `routerVersion`: Version string for the routing logic (allows A/B comparison)
- `policyVersion`: Version of the policy engine
- `executorId`: Which executor handled the request
- `attempts`: Fallback attempt details from the LLM execution
- `totalDurationMs`: End-to-end orchestration time

### 5.4 Orchestrator Failure Fallback

When the unified flag is on and the orchestrator throws an unrecoverable error (not an LLM failure — those are handled by `executeSkillLlmWithFallback`), the caller should:

1. **Log the error** with full context (traceId, channel, skillId, error message)
2. **Fall back to existing code path** — both chat.ts and teamRunSkillExecutor.ts keep their existing logic as the else-branch of the flag check. On orchestrator failure, execute the existing path and log a `"unified_fallback"` audit event.
3. This ensures zero user-facing failures during rollout, even if the orchestrator has edge-case bugs.

Once the unified path is stable and validated, the fallback can be removed in Phase 4.

### 5.5 Backward Compatibility

The feature flag ensures zero risk:
- `unifiedSkillExecution = false` (default): No code paths change. Both pipelines work exactly as they do today.
- `unifiedSkillExecution = true`: Both pipelines delegate to unified with fallback to existing code on orchestrator failure.

The unified orchestrator returns the same data shapes that callers already expect:
- For chat: `{ success, skillId, type: "text", message }` — mapped from `UnifiedExecutionResult`
- For team room: `TeamRunSkillExecutionResult` — mapped from `UnifiedExecutionResult`

---

## 6. Parity Testing Strategy

### 6.1 Dedicated Routing Parity Suite

**File:** `apps/web/server/services/__tests__/channelParityTests.test.ts`

Tests that run the same inputs through both channel configurations and assert identical routing/policy decisions:

- **Routing parity:** Same user message → same capability family and executor selection regardless of channel
- **Policy parity:** Same skill + context → same web search decision, thinking mode, vision enablement
- **Failure parity:** Same error conditions → same fallback behavior
- **Credit parity:** Same execution → same cost calculation (deduction behavior differs by design)

Test cases should cover:
- Article writing (basic text skill)
- Review with web search (writing.review)
- Image generation request
- Video generation request
- Ambiguous input that could be text or media
- Request with reference images (vision)
- Request that triggers thinking mode
- Request where skill is not found (fallback behavior)

### 6.2 Per-Executor Tests

Each executor test file includes cases for both chat and team contexts:

- `textSkillExecutor.test.ts`: Test with chat persona context, without persona, with team context, with/without web search, with/without vision
- `imageExecutor.test.ts`: Test routing from both channels, verify same dispatch
- Failure tests: Timeout, unsupported type, moderation block

### 6.3 Regression Tests

All existing tests must continue to pass when the feature flag is off:
- `teamRunSkillExecutor.test.ts`
- `promptComposer.test.ts`
- `skillModelFallback.test.ts`
- `skillExecutionPolicy.test.ts`

---

## 7. Migration Path

### 7.1 Development Order

1. Define types (Phase 1) — no runtime changes, just type definitions
2. Build executor registry — module initialization, no side effects
3. Add feature flag `unifiedSkillExecution` to `featureFlags.ts` (must exist before callers reference it)
4. Build text skill executor — wraps existing `executeSkillLlmWithFallback()`
5. Build context builder — extracts logic from chat.ts and wraps `composePrompt()`
6. Build core orchestrator — wires everything together
7. Wire chat.ts with feature flag check + fallback
8. Wire teamRunSkillExecutor.ts with feature flag check + fallback
9. Write orchestrator + text executor unit tests
10. Write parity tests
11. Build media executor adapters (Phase 3)
12. Update orchestrator to route media capabilities
13. Write media executor adapter tests

### 7.2 Testing Strategy

- Each component is unit tested in isolation with mocked dependencies
- Integration tests verify the full orchestrator flow with both channel configurations
- Parity tests verify behavioral equivalence
- Regression tests verify flag-off behavior is unchanged

### 7.3 Rollout

1. Deploy with flag `false` — no behavior change
2. Enable flag for a test tenant — verify Chat gets persona + memory + web search, Team Room gets vision + dynamic requirements
3. Monitor audit logs for routing decisions and credit accuracy
4. Gradually enable for more tenants
5. Once stable, consider making `true` the default

---

## 8. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Context building adds latency to Chat | Medium | Lazy-load persona/memory only when activePersonaId is set; measure latency per component |
| Credit deduction race condition (double deduction) | High | Use idempotency keys; team room passes `calculate_only` mode |
| Media adapter misroutes a text skill to media executor | Medium | Capability classification uses strict category matching; fallback to text executor |
| Existing tests fail when flag is on | Medium | Flag is off by default; on-path tests are separate suite |
| `composePrompt()` token budget conflicts with Chat context | Low | Chat context building uses a separate budget strategy tuned for chat-length conversations |
| Executor registry race condition at startup | Low | Static executors registered synchronously at module load; dynamic registration after |

---

## 9. File Summary

### New Files

| File | Phase | Purpose | Est. Lines |
|------|-------|---------|------------|
| `executors/types.ts` | 1 | Shared types, interfaces, capability families | ~120 |
| `executors/executorRegistry.ts` | 1 | Hybrid executor discovery and registration | ~80 |
| `unifiedOrchestrator.ts` | 2 | Core orchestrator: routing, policy, execution flow | ~350 |
| `executors/textSkillExecutor.ts` | 2 | LLM/text skill execution wrapper | ~120 |
| `executors/contextBuilder.ts` | 2 | Context enrichment (persona, team, dynamic reqs, web search) | ~250 |
| `executors/imageExecutor.ts` | 3 | Image generation adapter | ~80 |
| `executors/videoExecutor.ts` | 3 | Video generation adapter | ~70 |
| `executors/audioExecutor.ts` | 3 | Audio generation adapter | ~70 |
| `__tests__/unifiedOrchestrator.test.ts` | 2 | Orchestrator unit tests | ~300 |
| `__tests__/textSkillExecutor.test.ts` | 2 | Text executor tests | ~200 |
| `__tests__/channelParityTests.test.ts` | 2 | Cross-channel parity suite | ~250 |
| `__tests__/imageExecutor.test.ts` | 3 | Image adapter tests | ~100 |
| `__tests__/videoExecutor.test.ts` | 3 | Video adapter tests | ~80 |
| `__tests__/audioExecutor.test.ts` | 3 | Audio adapter tests | ~80 |

### Modified Files

| File | Phase | Change |
|------|-------|--------|
| `shared/featureFlags.ts` | 2 | Add `unifiedSkillExecution` flag |
| `routers/chat.ts` | 2 | Add flag check → delegate to orchestrator (~30 lines) |
| `services/teamRunSkillExecutor.ts` | 2 | Add flag check → delegate to orchestrator (~25 lines) |

### Unchanged (Reused)

| File | Used By |
|------|---------|
| `skillModelFallback.ts` (`executeSkillLlmWithFallback`) | TextSkillExecutor |
| `skillExecutionPolicy.ts` (`resolveSkillExecutionPolicy`) | Orchestrator |
| `promptComposer.ts` (`composePrompt`) | contextBuilder (team path) |
| `webSearchToolInjector.ts` (`buildWebSearchParams`) | contextBuilder |
| `creditService.ts` (`deductCreditsForModel`, `calculateCreditsForLLMDynamic`) | Orchestrator |
| `roomIntentRouter.ts` (`routeRoomIntent`) | Callers (route hint input) |
