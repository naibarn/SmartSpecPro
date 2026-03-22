# Section 06 -- Unified Orchestrator

## Overview

This section implements the **core unified orchestrator** -- the single entry point that both Chat and Team Room channels delegate to for skill execution. The orchestrator owns skill resolution, capability classification, executor selection, context building delegation, execution policy resolution, planner integration, credit handling, persistence hooks, and audit logging.

**File:** `apps/web/server/services/unifiedOrchestrator.ts`

**Estimated size:** ~350 lines

## Dependencies

| Section | What It Provides | How This Section Uses It |
|---------|-----------------|------------------------|
| section-01-types-and-contract | `CapabilityFamily`, `UnifiedExecutionRequest`, `UnifiedExecutionResult`, `CapabilityExecutor`, `ExecutorInput`, `ExecutorResult`, `PersistenceHook`, `RouteDecision` | All type signatures for the orchestrator's input, output, and internal routing |
| section-02-executor-registry | `getExecutor(capability)`, `registerExecutor()` | Orchestrator queries the registry to find the executor for a classified capability |
| section-04-context-builder | `buildChatContext()`, `buildTeamContext()`, `buildDynamicModelRequirements()`, `buildPromptEnhancementContext()`, `injectWebSearchIfNeeded()` | Orchestrator calls these to enrich execution context before delegation |
| section-05-text-skill-executor | `TextSkillExecutor` (registered in executor registry) | Default executor for `writing.article` and `writing.review` capabilities |

## Existing Services Used (Unchanged)

These services are called by the orchestrator but are NOT modified:

| Service | Import Path | Usage |
|---------|-------------|-------|
| `resolveSkillExecutionPolicy` | `./skillExecutionPolicy` | Step 6: resolve model + provider routing for the skill |
| `runPlanner` | `./taskPlannerMiddleware` | Step 7: run task planner if feature flag enabled |
| `recordStepAttempt` | `./taskPlannerMiddleware` | Step 12: record planner step result |
| `classifyArtifactIntent` | `./artifactRouter` | Step 9: classify artifact type for presentation/report skills |
| `selectExecutionRoute` | `./artifactRouter` | Step 9: select execution route for artifacts |
| `deductCreditsForModel` | `./creditService` | Step 11: deduct credits when `creditMode === "deduct"` |
| `calculateCreditsForLLMDynamic` | `./creditService` | Step 11: calculate cost when `creditMode === "calculate_only"` |
| `auditLogger` | `./auditLogger` | Audit logging throughout the flow |
| `debugLog`, `debugError` | `../_core/logger` | Debug logging |
| `getTraceId` | `./traceContext` | Trace ID propagation |

## Blocked By

Sections 01, 02, 04, and 05 must be implemented first (or at least have their exports stubbed).

## Blocks

- section-07-wire-chat-router (needs orchestrator to delegate to)
- section-08-wire-team-room (needs orchestrator to delegate to)
- section-09-orchestrator-tests (tests for this section)
- section-10-parity-tests (cross-channel parity assertions)
- section-13-media-routing-integration (media routing through orchestrator)

---

## TDD Expectations

### Test File

`apps/web/server/services/__tests__/unifiedOrchestrator.test.ts`

All external dependencies should be mocked with `vi.mock()`. The orchestrator is tested in isolation, verifying that it calls the correct services in the correct order with the correct arguments.

### Test Cases

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

### Test Structure Guidance

Each test should:
1. Set up mocks for all external service dependencies
2. Construct a `UnifiedExecutionRequest` with the relevant fields for the scenario
3. Call the orchestrator's main `executeUnified()` function
4. Assert the correct services were called with the correct arguments
5. Assert the returned `UnifiedExecutionResult` has the expected shape

Example mock setup pattern:

```typescript
vi.mock("../skillExecutionPolicy", () => ({
  resolveSkillExecutionPolicy: vi.fn().mockResolvedValue({
    modelId: "gpt-4o-mini",
    allowFreeModels: true,
    modelSource: "system_default",
  }),
}));

vi.mock("../creditService", () => ({
  deductCreditsForModel: vi.fn().mockResolvedValue({ creditsUsed: 5, wasFree: false }),
  calculateCreditsForLLMDynamic: vi.fn().mockResolvedValue(5),
}));
```

---

## Implementation Guidance

### Main Export

The orchestrator exposes a single primary function:

```typescript
export async function executeUnified(
  request: UnifiedExecutionRequest,
): Promise<UnifiedExecutionResult>;
```

It also exposes a hook registration function (called once at module initialization by each channel):

```typescript
export function registerPersistenceHook(hook: PersistenceHook): void;
```

And a capability classification helper (exported for testing and use by section-13):

```typescript
export function classifyCapability(skill: SkillDefinition): CapabilityFamily;
```

### Orchestrator Flow (14 Steps)

The `executeUnified` function follows this exact sequence. Each step is described with its inputs, outputs, and error handling.

#### Step 1: Resolve Skill

- Input: `request.routeHint?.selectedSkillId`
- Load skill definition from the database using the skill service (e.g., `skillRegistry.getSkillById()` or equivalent query)
- If `selectedSkillId` is provided but not found, log a warning and fall back to `"general-article-writer"`
- If no skill can be resolved at all, return a structured error result (do NOT throw)

#### Step 2: Classify Capability

- Input: resolved skill definition
- Implement `classifyCapability()` with these rules in priority order:
  1. If `skill.executionPolicy?.capability_family` is set, use it directly
  2. If `skill.category === "image_generation"`, return `"media.image"`
  3. If `skill.category === "video_generation"`, return `"media.video"`
  4. If `skill.category === "audio_generation"`, return `"media.audio"`
  5. If `skill.executionMode === "swarm"`, return `"orchestration.swarm"`
  6. If skill is review-classified (check `skill.tags` or `skill.slug` for "review" patterns), return `"writing.review"`
  7. Default: return `"writing.article"`

#### Step 3: Select Executor

- Input: capability family from step 2
- Call `getExecutor(capability)` from the executor registry (section-02)
- If no executor found, fall back to the text skill executor
- Store the executor reference and its `id` for telemetry

#### Step 4: Build Execution Context

- Delegate to the context builder (section-04) based on channel:
  - If `request.channel === "chat"`: call `buildChatContext()` with `request.conversationContext`, skill definition, `request.userMessage`, `request.attachments`
  - If `request.channel === "team_room"`: call `buildTeamContext()` with `request.teamContext`, skill definition
- Also call `buildPromptEnhancementContext()` for specialized skills (e.g., `image-prompt-engineer`); if it returns non-null, use its messages instead of the generic context

#### Step 5: Build Dynamic Model Requirements

- Call `buildDynamicModelRequirements()` from section-04 with:
  - skill definition
  - boolean flags: `hasImages` (derived from `request.attachments`), `routeReason` (from `request.routeHint?.reason`)
- Returns a `CapabilityRequirements` object

#### Step 6: Resolve Execution Policy

- Call `resolveSkillExecutionPolicy()` from `./skillExecutionPolicy` with:
  - `skill`: the resolved skill definition
  - `conversationModel`: from `request.conversationContext?.conversationModel`
- Merge in the dynamic requirements from step 5

#### Step 7: Run Task Planner

- Call `runPlanner()` from `./taskPlannerMiddleware` with:
  - `userId`, `tenantId`, `sourceType` (derived from channel), `skillSlug`, `conversationModel`, `executionPolicy` from step 6
- `runPlanner()` internally checks the `taskPlannerEnabled` feature flag and returns `null` if disabled
- If planner returns a result with a model resolution, it may override the execution policy model

#### Step 8: Inject Web Search

- Call `injectWebSearchIfNeeded()` from section-04 with:
  - messages from step 4, skill definition, execution policy, route reason
- Returns modified `extraBodyParams` and optionally a system prompt suffix

#### Step 9: Classify Artifact Intent (Text Skills Only)

- Only for text-family capabilities (`writing.article`, `writing.review`)
- Call `classifyArtifactIntent()` from `./artifactRouter` with the skill slug and source type
- If the intent is NOT `"chat_reply"`, call `selectExecutionRoute()` to determine the execution path
- Store artifact metadata for inclusion in the result

#### Step 10: Delegate to Executor

- Build `ExecutorInput` (type from section-01) from:
  - messages (from step 4 or 8)
  - execution policy (from step 6, potentially overridden by step 7)
  - extra body params (from step 8)
  - thinking mode flag (from dynamic requirements in step 5)
  - skill definition
- Call `executor.execute(input)` on the selected executor
- The executor returns an `ExecutorResult` with content, token counts, model used, and fallback attempts

#### Step 11: Handle Credits

- Based on `request.creditMode` (default: `"deduct"`):
  - `"deduct"`: Call `deductCreditsForModel()` with userId, model, provider, input/output tokens, skillSlug, tenantId, idempotencyKey
  - `"calculate_only"`: Call `calculateCreditsForLLMDynamic()` with input tokens, output tokens, model
  - `"skip"`: Set `costCredits = 0`, `creditsDeducted = 0`
- Wrap credit operations in try/catch -- credit failure must NOT block the result from being returned. Log the error and set `creditsDeducted = 0` with an error flag in metadata.

#### Step 12: Record Planner Step

- If `runPlanner()` returned a non-null result in step 7, call `recordStepAttempt()` from `./taskPlannerMiddleware` with the execution outcome

#### Step 13: Emit Persistence Hook

- Find the registered `PersistenceHook` for the request's channel
- Call `hook.onExecutionComplete(result, context)` where context includes `conversationId`, `roomId`, `runId` as applicable
- Wrap in try/catch -- hook failure must NOT block the response. Log the error.

#### Step 14: Return Unified Result

- Assemble `UnifiedExecutionResult` from all collected data:
  - `route`: capability, executorId, reason
  - `result`: mapped from executor result (text content, or media job payload)
  - `tokens`: from executor result
  - `costCredits`: from step 11
  - `creditsDeducted`: from step 11
  - `modelUsed`: from executor result
  - `skillId`: from step 1
  - `nextSpeakerHint`: from executor result (if present)
  - `metadata`: artifact info, planner info, etc.
  - `telemetry`: routerVersion, policyVersion, executorId, attempts, totalDurationMs

### Hook Storage

Persistence hooks are stored in a module-level `Map<string, PersistenceHook>` keyed by channel name. `registerPersistenceHook` adds to this map. The map is populated once at module initialization when `chat.ts` and `teamRunSkillExecutor.ts` import the orchestrator.

```typescript
// Module-level storage
const persistenceHooks = new Map<string, PersistenceHook>();

export function registerPersistenceHook(hook: PersistenceHook): void {
  persistenceHooks.set(hook.channel, hook);
}
```

### Capability Classification Function

This is a pure function (no I/O) and should be exported separately for unit testing:

```typescript
export function classifyCapability(skill: SkillDefinition): CapabilityFamily {
  // 1. Explicit declaration in executionPolicy
  // 2. Category-based mapping
  // 3. Review pattern detection
  // 4. Default to writing.article
}
```

### Error Handling Strategy

The orchestrator uses a layered error handling approach:

1. **Skill resolution failure**: Return a result with `route.reason: "skill_resolution_failed"` and `result: { type: "text", content: "" }`. Do NOT throw.
2. **Executor not found**: Fall back to TextSkillExecutor. Log a warning.
3. **Executor execution failure**: The executor (via `executeSkillLlmWithFallback`) handles retries internally. If the executor returns `{ success: false }`, map it to the unified result with the error information.
4. **Credit failure**: Catch, log, continue. Set `creditsDeducted: 0`.
5. **Persistence hook failure**: Catch, log, continue. The response is already generated.
6. **Unrecoverable orchestrator error**: The orchestrator itself should catch at the top level and return a result indicating failure. The caller (chat.ts or teamRunSkillExecutor.ts) uses this to decide whether to fall back to existing code.

Top-level structure:

```typescript
export async function executeUnified(
  request: UnifiedExecutionRequest,
): Promise<UnifiedExecutionResult> {
  const startMs = Date.now();
  const traceId = getTraceId();

  try {
    // Steps 1-14 ...
  } catch (err) {
    // Log unrecoverable error
    auditLogger.log({
      eventType: "unified_route",
      /* ... error details ... */
    });
    // Return error result (caller decides whether to fall back)
    return {
      route: { capability: "writing.article", executorId: "unknown", reason: "orchestrator_error" },
      result: { type: "text", content: "" },
      tokens: { input: 0, output: 0 },
      costCredits: 0,
      modelUsed: null,
      skillId: request.routeHint?.selectedSkillId ?? "unknown",
      metadata: { error: String(err) },
      telemetry: {
        routerVersion: ROUTER_VERSION,
        policyVersion: POLICY_VERSION,
        executorId: "unknown",
        attempts: [],
        totalDurationMs: Date.now() - startMs,
      },
    };
  }
}
```

### Audit Logging

The orchestrator emits two audit events (in addition to whatever the executor logs internally):

1. **`"unified_route"`** -- Logged after step 3 (executor selection):
   - Includes: capability, executorId, skillId, channel, confidence, reason

2. **`"unified_credit"`** -- Logged after step 11 (credit handling):
   - Includes: creditMode, costCredits, creditsDeducted, modelUsed, wasFree

Use `auditLogger.log()` from `./auditLogger`. Note: `"unified_route"` and `"unified_credit"` are new event types that must be added to the `AuditEventType` union in `auditLogger.ts`. This is a minor addition (two string literals to the union type).

### Telemetry Constants

Define version constants at module level:

```typescript
const ROUTER_VERSION = "1.0.0";
const POLICY_VERSION = "1.0.0";
```

These are included in every result's `telemetry` object for A/B comparison during rollout.

### Skill Loading

The orchestrator needs to load a skill definition by ID. Use the existing skill registry or database query pattern. The skill type should be `SkillDefinition` from `@smartspec/skills`. The exact loading mechanism depends on what the skill service exposes -- likely a function like:

```typescript
import { db } from "../db";
import { skills } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
```

Query the `skills` table by `id` or `slug`. The fallback slug is `"general-article-writer"`.

---

## File Listing

| Action | File Path |
|--------|-----------|
| CREATE | `apps/web/server/services/unifiedOrchestrator.ts` |
| MODIFY | `apps/web/server/services/auditLogger.ts` (add `"unified_route"` and `"unified_credit"` to `AuditEventType` union) |

The test file `apps/web/server/services/__tests__/unifiedOrchestrator.test.ts` is covered by section-09-orchestrator-tests.

---

## Integration Notes

- **Callers** (section-07, section-08) will import `executeUnified` and `registerPersistenceHook` from this module
- **Media routing** (section-13) will rely on `classifyCapability()` to correctly route media skills and will extend the orchestrator's step 2 if needed
- The orchestrator does NOT import or know about the chat router or team room executor directly -- it only knows about the executor registry and context builder abstractions
- The `creditMode` field defaults to `"deduct"`. Team Room callers will pass `"calculate_only"` because their orchestrator handles credit deduction at the run level