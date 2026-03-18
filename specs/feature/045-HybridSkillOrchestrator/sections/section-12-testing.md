Now I have enough context. Let me produce the section content.

# Section 12: Testing -- Comprehensive Integration Test Suite

## Overview

This section covers the integration test suite for the Hybrid Skill Orchestrator (Feature 045). While sections 2-11 each include their own unit tests with mocked dependencies, this section defines **end-to-end integration tests** that verify the full orchestration flow from user message to final response, crossing service boundaries.

All tests use **Vitest** and live in `apps/web/server/services/__tests__/`. The integration tests mock only the outermost boundaries (LLM provider responses, disk I/O for skill files) while allowing the internal services to call each other as they would in production.

## Dependencies

This section depends on all prior sections (01 through 11) being implemented. It exercises:

- Types and configuration from section 01 (`apps/web/shared/orchestration/types.ts`)
- Skill catalog from section 02 (`getSkillCatalogSummary`, `loadInputSchema` in `skillRegistry.ts`)
- Intent classifier from section 03 (`skillIntentClassifier.ts`)
- Parameter extractor from section 04 (`skillParamExtractor.ts`)
- Orchestrator main entry from section 05 (`skillOrchestrator.ts`)
- Pipeline engine from section 06 (`skillPipelineEngine.ts`)
- Agent loop from section 07 (`skillAgentLoop.ts`)
- Result merger from section 08 (`skillResultMerger.ts`)
- Quality gate from section 09 (`skillQualityGate.ts`)
- Audit events from section 10 (`auditLogger.ts`)
- Frontend types from section 11 (message types)

## Test File

**Path:** `apps/web/server/services/__tests__/skillOrchestratorIntegration.test.ts`

## Tests

The TDD plan specifies four integration test cases for this section:

1. **SIMPLE flow:** user message -> classifier -> param extraction -> skill execution -> response
2. **COMPOUND flow:** user message -> classifier -> pipeline -> merge -> response
3. **Feature flag toggle:** orchestrator -> regex fallback mid-session
4. **Real schema validation:** orchestration with actual `input.schema.json` files from `skills/`

### Test File Stub

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Boundary mocks -- only mock the outermost edges
// ---------------------------------------------------------------------------

// Mock LLM calls (all classifier, extractor, merger, quality gate LLM calls)
const mockExecuteWithFallback = vi.fn();
const mockResolveProviders = vi.fn();

vi.mock("../llmRouter", () => ({
  executeWithFallback: mockExecuteWithFallback,
  resolveProviders: mockResolveProviders,
}));

// NOTE: mock paths use single `../` prefix because this test file lives in
// `server/services/__tests__/` and the services live in `server/services/`.

// Mock credit service (don't actually deduct credits in tests)
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(() => true),
  deductCreditsForModel: vi.fn().mockResolvedValue({ creditsUsed: 1, wasFree: false }),
}));

// Mock audit logger to capture events for assertion
const mockAuditLog = vi.fn();
vi.mock("../auditLogger", () => ({
  auditLogger: { log: mockAuditLog },
}));

// Mock skill executor (don't actually call LLM for skill execution)
const mockExecuteSkill = vi.fn();
vi.mock("../skillExecutor", () => ({
  executeSkill: mockExecuteSkill,
}));

// Mock feature flag service
const mockGetTenantFeatureFlag = vi.fn();
vi.mock("../tenantFeatureFlagService", () => ({
  getTenantFeatureFlag: mockGetTenantFeatureFlag,
}));

// Mock redis
vi.mock("../redis", () => ({
  getRedisClient: vi.fn(() => ({ get: vi.fn(), setex: vi.fn() })),
}));

// Import the orchestrator entry point (after mocks are set up)
import { orchestrateSkill } from "../skillOrchestrator";
import type { OrchestrationResult } from "@shared/orchestration/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock LLM response that the classifier returns for a SIMPLE match */
function classifierSimpleResponse(skillId: string, confidence: number) {
  // Returns a function-call response matching the classifier's expected format.
  // The exact shape depends on how classifyIntent parses the LLM output (section 03).
  return {
    type: "success" as const,
    response: {
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            function: {
              name: "product_review", // category tool name
              arguments: JSON.stringify({
                skillId,
                confidence,
                extractedParams: { topic: "มาม่า" },
                reason: "User wants a food review",
              }),
            },
          }],
        },
      }],
      usage: { prompt_tokens: 200, completion_tokens: 50, total_tokens: 250 },
    },
    providerId: 1,
    providerName: "test-provider",
  };
}

/** Build a mock LLM response for a COMPOUND (multi-skill) classification */
function classifierCompoundResponse() {
  // Returns classification with two skills and sequential strategy.
  // Shape mirrors the classifier's multi-intent detection output.
  return {
    type: "success" as const,
    response: {
      choices: [{
        message: {
          content: null,
          tool_calls: [
            {
              function: {
                name: "article_writing",
                arguments: JSON.stringify({
                  skillId: "food-grocery-reviewer",
                  confidence: 0.9,
                  extractedParams: { topic: "อาหารไทย" },
                  reason: "Write article about Thai food",
                }),
              },
            },
            {
              function: {
                name: "media_image",
                arguments: JSON.stringify({
                  skillId: "image-creator",
                  confidence: 0.85,
                  extractedParams: {},
                  reason: "Create illustration image",
                }),
              },
            },
          ],
        },
      }],
      usage: { prompt_tokens: 250, completion_tokens: 80, total_tokens: 330 },
    },
    providerId: 1,
    providerName: "test-provider",
  };
}

/** Standard options passed to orchestrateSkill */
const baseOptions = {
  userId: 1,
  tenantId: "test-tenant",
  conversationId: 100,
  skillSettings: null,
  userToken: "test-token",
  budget: 50,
  fallbackToRegex: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveProviders.mockResolvedValue([{ providerId: 1 }]);
  // Default: orchestrator enabled, max level complex
  mockGetTenantFeatureFlag.mockImplementation((flag: string) => {
    if (flag === "skillOrchestrator") return Promise.resolve(true);
    if (flag === "skillOrchestratorMaxLevel") return Promise.resolve("complex");
    return Promise.resolve(null);
  });
});

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe("Orchestrator Integration: SIMPLE flow", () => {
  it("routes user message through classifier -> param extraction -> skill execution -> response", async () => {
    // Arrange: classifier returns a single high-confidence match
    mockExecuteWithFallback.mockResolvedValueOnce(
      classifierSimpleResponse("food-grocery-reviewer", 0.92),
    );
    // Param extractor LLM call (may be combined or separate depending on schema size)
    mockExecuteWithFallback.mockResolvedValueOnce({
      type: "success",
      response: {
        choices: [{ message: { content: JSON.stringify({ topic: "มาม่า", review_angle: "taste" }) } }],
        usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
      },
      providerId: 1,
      providerName: "test-provider",
    });
    // Skill execution returns content
    mockExecuteSkill.mockResolvedValueOnce({
      success: true,
      skillId: "food-grocery-reviewer",
      type: "text",
      message: "รีวิวมาม่ารสต้มยำ...",
      isAsync: false,
      creditsUsed: 2,
    });

    // Act
    const result = await orchestrateSkill("รีวิวมาม่า", baseOptions);

    // Assert
    expect(result).toBeDefined();
    expect(result.orchestrationLevel).toBe("simple");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].message).toContain("มาม่า");
    expect(result.traceId).toBeTruthy();
    // Verify audit events were logged
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "orchestration_classify" }),
    );
  });
});

describe("Orchestrator Integration: COMPOUND flow", () => {
  it("routes multi-skill request through classifier -> pipeline -> merge -> response", async () => {
    // Arrange: classifier returns two skills with sequential strategy
    mockExecuteWithFallback.mockResolvedValueOnce(classifierCompoundResponse());
    // Param extraction for each skill (2 calls, or combined)
    mockExecuteWithFallback.mockResolvedValueOnce({
      type: "success",
      response: {
        choices: [{ message: { content: JSON.stringify({ topic: "อาหารไทย" }) } }],
        usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 },
      },
      providerId: 1,
      providerName: "test-provider",
    });
    mockExecuteWithFallback.mockResolvedValueOnce({
      type: "success",
      response: {
        choices: [{ message: { content: JSON.stringify({ prompt: "Thai food illustration" }) } }],
        usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 },
      },
      providerId: 1,
      providerName: "test-provider",
    });
    // Skill executions
    mockExecuteSkill
      .mockResolvedValueOnce({
        success: true,
        skillId: "food-grocery-reviewer",
        type: "text",
        message: "บทความอาหารไทย...",
        isAsync: false,
        creditsUsed: 2,
      })
      .mockResolvedValueOnce({
        success: true,
        skillId: "image-creator",
        type: "image",
        resultUrls: ["https://img.example.com/thai-food.png"],
        isAsync: false,
        creditsUsed: 3,
      });
    // Merger LLM call (for combining text + image)
    mockExecuteWithFallback.mockResolvedValueOnce({
      type: "success",
      response: {
        choices: [{ message: { content: "## อาหารไทย\n\nบทความอาหารไทย...\n\n![](https://img.example.com/thai-food.png)" } }],
        usage: { prompt_tokens: 150, completion_tokens: 60, total_tokens: 210 },
      },
      providerId: 1,
      providerName: "test-provider",
    });

    // Act
    const result = await orchestrateSkill(
      "เขียนบทความอาหารไทย แล้วสร้างรูปประกอบ",
      baseOptions,
    );

    // Assert
    expect(result.orchestrationLevel).toBe("compound");
    expect(result.sections.length).toBeGreaterThanOrEqual(2);
    expect(result.totalCreditsUsed).toBeGreaterThanOrEqual(5);
    expect(mockExecuteSkill).toHaveBeenCalledTimes(2);
    // Pipeline audit event
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "orchestration_pipeline" }),
    );
  });
});

describe("Orchestrator Integration: Feature flag toggle", () => {
  it("falls back to regex detection when skillOrchestrator is false", async () => {
    // Arrange: disable orchestrator
    mockGetTenantFeatureFlag.mockImplementation((flag: string) => {
      if (flag === "skillOrchestrator") return Promise.resolve(false);
      return Promise.resolve(null);
    });

    // Act
    const result = await orchestrateSkill("รีวิวมาม่า", baseOptions);

    // Assert: should NOT call the LLM classifier
    // The exact return shape depends on the fallback path (section 05)
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
    // Fallback audit event
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "orchestration_fallback" }),
    );
  });

  it("caps orchestration level to tenant maxLevel setting", async () => {
    // Arrange: tenant allows only SIMPLE
    mockGetTenantFeatureFlag.mockImplementation((flag: string) => {
      if (flag === "skillOrchestrator") return Promise.resolve(true);
      if (flag === "skillOrchestratorMaxLevel") return Promise.resolve("simple");
      return Promise.resolve(null);
    });
    // Classifier says COMPOUND, but tenant maxLevel is "simple"
    mockExecuteWithFallback.mockResolvedValueOnce(classifierCompoundResponse());
    // Only one skill execution (top match picked)
    mockExecuteSkill.mockResolvedValueOnce({
      success: true,
      skillId: "food-grocery-reviewer",
      type: "text",
      message: "บทความอาหารไทย...",
      isAsync: false,
      creditsUsed: 2,
    });

    // Act
    const result = await orchestrateSkill(
      "เขียนบทความอาหารไทย แล้วสร้างรูปประกอบ",
      baseOptions,
    );

    // Assert: level capped to simple, only one skill executed
    expect(result.orchestrationLevel).toBe("simple");
    expect(mockExecuteSkill).toHaveBeenCalledTimes(1);
  });
});

describe("Orchestrator Integration: Real skill schemas", () => {
  it("extracts params using actual input.schema.json from a real skill", async () => {
    // This test reads real schema files from the skills/ directory.
    // It verifies the param extractor correctly uses schema metadata
    // (required fields, enums, defaults) from a production skill.
    //
    // Arrange: classifier matches food-grocery-reviewer (or any skill
    // with a known input.schema.json on disk)
    mockExecuteWithFallback.mockResolvedValueOnce(
      classifierSimpleResponse("food-grocery-reviewer", 0.95),
    );
    // Param extractor returns structured params matching the real schema
    mockExecuteWithFallback.mockResolvedValueOnce({
      type: "success",
      response: {
        choices: [{
          message: {
            content: JSON.stringify({
              topic: "มาม่า",
              review_angle: "taste",
              price_range: "budget",
            }),
          },
        }],
        usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 },
      },
      providerId: 1,
      providerName: "test-provider",
    });
    mockExecuteSkill.mockResolvedValueOnce({
      success: true,
      skillId: "food-grocery-reviewer",
      type: "text",
      message: "รีวิวมาม่า...",
      isAsync: false,
      creditsUsed: 2,
    });

    // Act
    const result = await orchestrateSkill("รีวิวมาม่ารสต้มยำ ราคาถูก", baseOptions);

    // Assert: params were extracted and passed to skill execution
    expect(mockExecuteSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ topic: "มาม่า" }),
      }),
    );
    expect(result.sections).toHaveLength(1);
  });
});
```

## Implementation Details

### What This Section Delivers

This section creates a single integration test file that validates the cross-service wiring of the entire orchestrator system. The tests are **not** intended to re-test individual service logic (that is covered by unit tests in sections 2-11). Instead, they verify:

1. **Data flows correctly between services** -- the classifier output feeds into the param extractor, which feeds into the execution path, which feeds into the result merger.
2. **Feature flags control routing** -- toggling `skillOrchestrator` switches between the orchestrator path and the regex fallback.
3. **Level capping works end-to-end** -- a tenant with `maxLevel: "simple"` never triggers the pipeline engine, even when the classifier suggests COMPOUND.
4. **Audit events are emitted at each stage** -- every orchestration session produces a chain of audit events sharing the same `traceId`.
5. **Real skill schemas integrate correctly** -- the param extractor can load actual `input.schema.json` files from the `skills/` directory and use their metadata.

### Mocking Strategy

The integration tests mock at two boundaries only:

1. **LLM provider calls** (`executeWithFallback` from `llmRouter.ts`) -- returns pre-crafted responses that simulate classifier, extractor, merger, and quality gate LLM outputs.
2. **Skill execution** (`executeSkill` from `skillExecutor.ts`) -- returns mock skill results without actually calling LLM providers or media APIs.

All internal services (classifier, extractor, orchestrator, pipeline engine, merger) run their real code. This catches integration bugs like:
- Wrong type shapes passed between services
- Missing `traceId` propagation
- Incorrect `orchestrationLevel` assignment after level capping
- Audit events not being emitted in the right order

### Additional Internal Mocks

These are needed to prevent side effects, not to change behavior:

- **`creditService`** -- `hasEnoughCredits` always returns true, `deductCreditsForModel` returns a stub result. This prevents actual database calls.
- **`tenantFeatureFlagService`** -- `getTenantFeatureFlag` is mocked to control feature flags per test case.
- **`redis`** -- `getRedisClient` returns a stub to prevent actual Redis connections.
- **`auditLogger`** -- `auditLogger.log` is a `vi.fn()` spy so tests can assert on emitted audit events.

### Running the Tests

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm vitest run server/services/__tests__/skillOrchestratorIntegration.test.ts
```

Or as part of the full suite:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm test
```

### Key File Paths

| File | Purpose |
|------|---------|
| `apps/web/server/services/__tests__/skillOrchestratorIntegration.test.ts` | **New** -- integration test file (this section) |
| `apps/web/server/services/skillOrchestrator.ts` | Entry point under test (section 05) |
| `apps/web/server/services/skillIntentClassifier.ts` | Classifier exercised in flow (section 03) |
| `apps/web/server/services/skillParamExtractor.ts` | Extractor exercised in flow (section 04) |
| `apps/web/server/services/skillPipelineEngine.ts` | Pipeline engine exercised in COMPOUND test (section 06) |
| `apps/web/server/services/skillResultMerger.ts` | Merger exercised in COMPOUND test (section 08) |
| `apps/web/server/services/skillQualityGate.ts` | Quality gate (section 09, optional in tests) |
| `apps/web/shared/orchestration/types.ts` | Shared types (section 01) |
| `apps/web/server/services/auditLogger.ts` | Audit logger mock target (section 10) |
| `apps/web/server/services/skillRegistry.ts` | Catalog + schema loader (section 02) |

### Relationship to Unit Tests in Other Sections

Each service has its own unit test file created in its respective section:

- `skillIntentClassifier.test.ts` (section 03) -- tests classification logic with mocked LLM, circuit breaker behavior
- `skillParamExtractor.test.ts` (section 04) -- tests extraction against schemas, defaults, missing fields
- `skillOrchestrator.test.ts` (section 05) -- tests routing logic, feature flags, fallback in isolation
- `skillPipelineEngine.test.ts` (section 06) -- tests topological sort, parallel waves, error strategies
- `skillAgentLoop.test.ts` (section 07) -- tests loop termination, budget, stuck detection
- `skillResultMerger.test.ts` (section 08) -- tests merge strategies by output type
- `skillQualityGate.test.ts` (section 09) -- tests pass/fail evaluation

This section's integration tests complement those unit tests by validating that the services work together correctly when connected. The integration tests intentionally do not duplicate unit-level assertions -- they focus on cross-boundary data flow and end-to-end behavior.

### Mock Response Conventions

When constructing mock LLM responses for integration tests, follow the patterns established in the codebase (see `callLLMStructured.test.ts` at `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/callLLMStructured.test.ts`):

- Use the `type: "success"` / `response.choices[].message` shape from `executeWithFallback`
- For function-calling responses, populate `tool_calls[].function.name` and `arguments` (JSON string)
- For structured text responses, put JSON in `message.content`
- Always include a `usage` object with token counts
- Include `providerId` and `providerName` for provider tracking

### Edge Cases to Cover

Beyond the four primary test cases, the implementer should consider adding tests for:

- **Classifier timeout** -- `mockExecuteWithFallback` rejects with a timeout error; orchestrator should fall back to regex and emit `orchestration_fallback` audit event
- **Classifier returns low confidence** (below 0.50) -- orchestrator should return a no-match result
- **Credit check failure** -- `hasEnoughCredits` returns false; orchestrator should reject before execution
- **Pipeline with one failed step** -- verify that `continue` error strategy allows remaining steps to complete
- **TraceId propagation** -- verify the same `traceId` appears in all `mockAuditLog` calls within a single orchestration

These are not strictly required by the TDD plan but strengthen the integration coverage. The implementer can add them as additional `it()` blocks within the existing `describe()` groups or as new `describe()` blocks.