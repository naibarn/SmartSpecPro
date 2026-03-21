I now have all the context needed to write section 10. Here is the content:

# Section 10 -- Cross-Channel Parity Tests

## Overview

This section implements the **cross-channel parity test suite** that verifies routing, policy, credit, and failure behavior is consistent between the `chat` and `team_room` channels when both delegate to the unified orchestrator. These tests exercise the full orchestrator flow with two different channel configurations for the same inputs and assert that key decisions are identical.

**File:** `apps/web/server/services/__tests__/channelParityTests.test.ts`

**Estimated size:** ~250 lines

## Dependencies

| Section | What It Provides | How This Section Uses It |
|---------|-----------------|------------------------|
| section-01-types-and-contract | `UnifiedExecutionRequest`, `UnifiedExecutionResult`, `CapabilityFamily` | Types for building test requests and asserting results |
| section-06-unified-orchestrator | `executeUnified()` | The function under test (called with both chat and team_room requests) |
| section-07-wire-chat-router | Chat wiring with feature flag check | Confirms chat builds the correct request shape (informational only; not called directly) |
| section-08-wire-team-room | Team room wiring with feature flag check | Confirms team room builds the correct request shape (informational only; not called directly) |

## Blocks

- None. This is a leaf node in the dependency graph.

---

## Testing Strategy

The parity suite does NOT test the wiring in `chat.ts` or `teamRunSkillExecutor.ts` directly. Instead, it calls `executeUnified()` twice for each scenario -- once with `channel: "chat"` and once with `channel: "team_room"` -- and asserts that the orchestrator makes the **same routing and policy decisions** for both.

All external dependencies (skill registry, credit service, LLM execution, context builders, planner) are mocked. The tests verify the orchestrator's internal logic, not the downstream services.

### Mocking Approach

The test file uses `vi.mock()` for every external service the orchestrator depends on:

| Mock Target | Import Path (from orchestrator) | What It Returns |
|-------------|--------------------------------|-----------------|
| `getSkillByIdAsync` | `../skillRegistry` | Returns a configurable skill definition object |
| `getExecutor` | `../executors/executorRegistry` | Returns a mock executor with `canHandle: () => true` and configurable `execute()` |
| `buildChatContext` | `../executors/contextBuilder` | Returns a mock messages array |
| `buildTeamContext` | `../executors/contextBuilder` | Returns a mock messages array |
| `buildDynamicModelRequirements` | `../executors/contextBuilder` | Returns a configurable requirements object |
| `injectWebSearchIfNeeded` | `../executors/contextBuilder` | Returns unmodified or web-search-enriched params |
| `resolveSkillExecutionPolicy` | `../skillExecutionPolicy` | Returns a configurable execution policy |
| `runPlanner` | `../taskPlannerMiddleware` | Returns `null` (planner disabled by default in parity tests) |
| `deductCreditsForModel` | `../creditService` | Returns `{ creditsDeducted: 5 }` |
| `calculateCreditsForLLMDynamic` | `../creditService` | Returns `5` |
| `auditLogger` | `../auditLogger` | No-op spy |
| `classifyArtifactIntent` | `../artifactRouter` | Returns `"chat_reply"` (default) |

### Helper Factory Functions

Define two helper functions at the top of the test file:

**`buildChatRequest(overrides?)`** -- returns a `UnifiedExecutionRequest` with `channel: "chat"`, sensible defaults for `userId`, `tenantId`, `userMessage`, `conversationContext`, and `routeHint`. Accepts partial overrides.

**`buildTeamRoomRequest(overrides?)`** -- returns a `UnifiedExecutionRequest` with `channel: "team_room"`, sensible defaults including `teamContext` with `assistantId`, `roomId`, `teamId`, `objective`. Accepts partial overrides. Sets `creditMode: "calculate_only"` (the team room default).

Both helpers use the **same** `userMessage`, `routeHint.selectedSkillId`, and `dynamicParams` so that the only difference is the channel and its context shape.

---

## TDD Plan

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/channelParityTests.test.ts`

Write this test file first. All tests should be passing once sections 01 through 08 are implemented.

### Test Cases

```
# --- Routing Parity ---

# Test: article writing skill -- same capability for chat and team_room
# Setup: mock skill with category "prompt_enhancement"
# Action: call executeUnified with buildChatRequest({ routeHint: { selectedSkillId: "article-writer" } })
#         call executeUnified with buildTeamRoomRequest({ routeHint: { selectedSkillId: "article-writer" } })
# Assert: both results have route.capability === "writing.article"
# Assert: both results have route.executorId === "text-skill-executor"

# Test: review skill -- same capability for both channels
# Setup: mock skill with category "prompt_enhancement" and review classification
# Action: call executeUnified for both channels with same skillId
# Assert: both results have route.capability === "writing.review"
# Assert: both results have route.executorId === "text-skill-executor"

# Test: image generation skill -- same capability for both channels
# Setup: mock skill with category "image_generation"
# Action: call executeUnified for both channels
# Assert: both results have route.capability === "media.image"

# Test: video generation skill -- same capability for both channels
# Setup: mock skill with category "video_generation"
# Action: call executeUnified for both channels
# Assert: both results have route.capability === "media.video"

# Test: skill not found -- same fallback for both channels
# Setup: mock getSkillByIdAsync to return null for requested ID, then return
#         general-article-writer on fallback lookup
# Action: call executeUnified for both channels with nonexistent skillId
# Assert: both results have skillId === "general-article-writer"
# Assert: both results have route.capability === "writing.article"

# Test: ambiguous input -- same capability when routeHint has no skillId
# Setup: mock skill detection/fallback to resolve the same skill for both channels
# Action: call executeUnified for both channels without routeHint.selectedSkillId
# Assert: both results have identical route.capability

# --- Policy Parity ---

# Test: same skill + requires_web_search -- web search enabled for both channels
# Setup: mock skill with executionPolicy { requires_web_search: true }
# Action: call executeUnified for both channels
# Assert: injectWebSearchIfNeeded was called for both with identical skill/policy args
# Assert: both results have the same web search policy applied (verify via mock call args)

# Test: same skill + requires_thinking -- thinking enabled for both channels
# Setup: mock skill with executionPolicy { requires_thinking: true, thinking_level_hint: "high" }
# Action: call executeUnified for both channels
# Assert: buildDynamicModelRequirements was called for both
# Assert: both received supportsThinking: true in the requirements

# Test: reference images -- vision enabled for both channels
# Setup: provide attachments with image URLs in both requests
# Action: call executeUnified for both channels
# Assert: buildDynamicModelRequirements was called with hasImages: true for both
# Assert: both results have supportsVision applied in the execution policy

# Test: review skill -- enhanced requirements for both channels
# Setup: mock skill classified as writing.review
# Action: call executeUnified for both channels
# Assert: buildDynamicModelRequirements returned enhanced requirements for both
# Assert: both got supportsWebSearch + supportsThinking

# --- Credit Parity ---

# Test: same execution -- same cost calculation regardless of channel
# Setup: mock executor to return fixed token counts (inputTokens: 100, outputTokens: 200)
# Action: call executeUnified for chat (creditMode: "deduct") and team_room (creditMode: "calculate_only")
# Assert: both results have costCredits === 5 (same calculation)
# Note: chat result has creditsDeducted === 5, team_room has creditsDeducted === undefined
#        This is by design (team room orchestrator handles deduction separately)

# Test: chat deducts credits, team room calculates only (design difference, not parity violation)
# Setup: same as above
# Action: call executeUnified for chat with creditMode "deduct", team_room with "calculate_only"
# Assert: deductCreditsForModel called ONCE (for chat only)
# Assert: calculateCreditsForLLMDynamic called ONCE (for team_room only)
# Assert: costCredits is equal for both results

# --- Failure Parity ---

# Test: LLM failure -- same fallback behavior for both channels
# Setup: mock executor.execute to throw an LLM execution error
# Action: call executeUnified for both channels
# Assert: both results have the same error shape
# Assert: both results have the same route.capability (routing was correct, execution failed)

# Test: skill resolution failure -- same error for both channels
# Setup: mock getSkillByIdAsync to return null for all lookups (including fallback)
# Action: call executeUnified for both channels
# Assert: both throw (or return error) with the same error type/message pattern

# Test: executor not found -- same fallback for both channels
# Setup: mock getExecutor to return null
# Action: call executeUnified for both channels
# Assert: both fall back to text executor (or both return the same error)
```

### Test File Structure

```typescript
// File: apps/web/server/services/__tests__/channelParityTests.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock() calls for all dependencies (listed in Mocking Approach above)

// Helper: buildChatRequest(overrides?)
// Helper: buildTeamRoomRequest(overrides?)
// Helper: mockSkill(overrides?) -- returns a SkillDefinition-like object

describe("Channel Parity Tests", () => {

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all mocks to default happy-path behavior
  });

  describe("Routing Parity", () => {
    // Tests that same skill -> same capability family and executor for both channels
  });

  describe("Policy Parity", () => {
    // Tests that same skill + context flags -> same policy decisions
  });

  describe("Credit Parity", () => {
    // Tests that cost calculation is identical; deduction behavior differs by design
  });

  describe("Failure Parity", () => {
    // Tests that same error conditions produce same fallback for both channels
  });
});
```

---

## Implementation Guidance

### 1. File Location

Create the test file at:
`/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/channelParityTests.test.ts`

### 2. Import the Orchestrator

```typescript
import { executeUnified } from "../unifiedOrchestrator";
```

The `executeUnified` function is the **only** production code called directly. Everything else is mocked.

### 3. Parity Assertion Pattern

Each parity test follows the same pattern:

```
1. Configure mocks for the scenario (skill definition, executor behavior, etc.)
2. Build chatRequest = buildChatRequest({ ... scenario-specific overrides ... })
3. Build teamRequest = buildTeamRoomRequest({ ... same scenario-specific overrides ... })
4. chatResult = await executeUnified(chatRequest)
5. teamResult = await executeUnified(teamRequest)
6. Assert chatResult.route.capability === teamResult.route.capability
7. Assert chatResult.route.executorId === teamResult.route.executorId
8. Assert any additional parity conditions (policy, cost, error shape)
```

### 4. What Is Parity vs. Designed Difference

The tests must distinguish between **parity requirements** (must be identical) and **designed differences** (allowed to differ):

| Aspect | Parity Required? | Notes |
|--------|-----------------|-------|
| `route.capability` | YES | Same skill must route to same capability regardless of channel |
| `route.executorId` | YES | Same capability must select same executor |
| `route.reason` | YES | Same routing logic applied |
| `costCredits` | YES | Same tokens/model must produce same cost |
| `creditsDeducted` | NO | Chat deducts; team_room calculates only (by design) |
| `result.type` | YES | Same executor produces same result type |
| `result.content` | YES | Same executor with same input produces same content |
| `nextSpeakerHint` | NO | Only relevant for team_room |
| `telemetry.executorId` | YES | Same executor used |
| Context builder called | NO | Chat calls `buildChatContext`, team calls `buildTeamContext` |

### 5. Mock Executor Configuration

The mock executor should be configured to return deterministic results based on the `ExecutorInput` it receives. A simple approach:

```typescript
const mockExecutor = {
  id: "text-skill-executor",
  capabilities: ["writing.article", "writing.review"],
  canHandle: vi.fn().mockReturnValue(true),
  execute: vi.fn().mockResolvedValue({
    content: "Generated content for test",
    inputTokens: 100,
    outputTokens: 200,
    modelUsed: "gpt-4o",
    attempts: [],
  }),
};
```

For media executor parity tests, create a separate mock:

```typescript
const mockImageExecutor = {
  id: "image-generation-executor",
  capabilities: ["media.image"],
  canHandle: vi.fn().mockReturnValue(true),
  execute: vi.fn().mockResolvedValue({
    type: "media_job",
    mediaType: "image",
    jobPayload: { jobId: "test-job-123" },
    inputTokens: 0,
    outputTokens: 0,
    modelUsed: null,
    attempts: [],
  }),
};
```

### 6. Skill Definition Fixture

Create a reusable fixture factory:

```typescript
function mockSkill(overrides?: Partial<SkillDefinition>): SkillDefinition {
  return {
    id: "test-skill",
    slug: "test-skill",
    name: "Test Skill",
    category: "prompt_enhancement",
    type: "llm-only",
    executionMode: "llm-only",
    executionPolicy: {},
    systemPrompt: "You are a helpful assistant.",
    enabled: true,
    ...overrides,
  };
}
```

### 7. Credit Mode Verification

For credit parity tests, verify the mock calls rather than the result values:

```typescript
// After running both channels:
const deductCalls = vi.mocked(deductCreditsForModel).mock.calls;
const calculateCalls = vi.mocked(calculateCreditsForLLMDynamic).mock.calls;

// Chat should have called deduct
expect(deductCalls).toHaveLength(1);
// Team room should have called calculate_only
expect(calculateCalls).toHaveLength(1);

// Both should compute the same cost
expect(chatResult.costCredits).toBe(teamResult.costCredits);
```

---

## Verification

```bash
# Run the parity test suite
cd /home/dev/projects/SmartSpecPro/apps/web && npx vitest run server/services/__tests__/channelParityTests.test.ts

# Run alongside orchestrator tests to verify no conflicts
cd /home/dev/projects/SmartSpecPro/apps/web && npx vitest run server/services/__tests__/unifiedOrchestrator.test.ts server/services/__tests__/channelParityTests.test.ts

# Full test suite (verify no regressions)
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test
```

---

## Key Design Notes

1. **Parity tests are orthogonal to unit tests.** The orchestrator unit tests (section-09) test individual steps in isolation. Parity tests verify that the **combination** of steps produces the same outcome for both channels.

2. **Parity tests do not test the channel wiring.** They do not call `chat.ts` or `teamRunSkillExecutor.ts`. They call `executeUnified()` directly with requests shaped as each channel would build them.

3. **Designed differences are documented, not ignored.** Credit deduction mode and next-speaker hints differ by design. The tests explicitly verify these differences are present and correct, rather than asserting false equality.

4. **Mock resets between tests are critical.** Because each test runs two `executeUnified()` calls, mock call counts accumulate. Use `vi.clearAllMocks()` in `beforeEach` and be careful with `toHaveBeenCalledTimes()` assertions (expect 2 calls per test when both channels are exercised, or filter by channel argument).

## Implementation Notes

- 15 parity tests covering routing (6), policy (4), credit (2), failure (3) parity.
- Code review fixes: removed redundant inline mock re-setup, added concrete value assertions for failure tests, added canHandle re-init in beforeEach for all executor fixtures.
- All tests pass alongside section-09 orchestrator tests (141 tests total across the unified test suites).