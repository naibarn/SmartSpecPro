I now have sufficient context to generate the section content.

# Section 5: Orchestrator Main Entry

## Overview

This section implements `skillOrchestrator.ts`, the main entry point for the Hybrid Skill Orchestrator. It coordinates the intent classifier (section 03), parameter extractor (section 04), and routes execution to the appropriate path (SIMPLE direct execution, COMPOUND pipeline engine, or COMPLEX agent loop). It also integrates into the existing `chat.ts` router as a feature-flagged alternative to the current regex-based `detectSkill()` path.

## Dependencies

- **Section 01 (types-config):** Uses `OrchestrationLevel`, `ClassificationResult`, `OrchestrationResult`, `OrchestrateOptions` types from `apps/web/shared/orchestration/types.ts`, plus configuration constants (`CONFIDENCE_ASK_USER`).
- **Section 02 (skill-catalog):** Calls `getSkillCatalogSummary()` indirectly through the classifier.
- **Section 03 (intent-classifier):** Calls `classifyIntent()` from `apps/web/server/services/skillIntentClassifier.ts`.
- **Section 04 (param-extractor):** Calls `extractParams()` from `apps/web/server/services/skillParamExtractor.ts`.

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/web/server/services/skillOrchestrator.ts` | **Create** -- main orchestrator service |
| `apps/web/server/services/__tests__/skillOrchestrator.test.ts` | **Create** -- unit tests |
| `apps/web/server/routers/chat.ts` | **Modify** -- integrate orchestrator in `sendMessage` and add `confirmOrchestration` mutation |

---

## Tests First

Create `apps/web/server/services/__tests__/skillOrchestrator.test.ts`. All external dependencies are mocked. The tests verify routing logic, feature flag behavior, fallback behavior, credit checks, and traceId generation.

### Test File Structure

```typescript
// apps/web/server/services/__tests__/skillOrchestrator.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies before importing the module under test
vi.mock("../featureFlags", () => ({
  getFeatureFlag: vi.fn(),
  getTenantFeatureFlag: vi.fn(),
  getTenantFeatureFlagValue: vi.fn(),
}));

vi.mock("../skillIntentClassifier", () => ({
  classifyIntent: vi.fn(),
}));

vi.mock("../skillParamExtractor", () => ({
  extractParams: vi.fn(),
}));

vi.mock("../skillDetector", () => ({
  detectSkill: vi.fn(),
  extractSkillParams: vi.fn(),
}));

vi.mock("../skillExecutor", () => ({
  executeSkill: vi.fn(),
}));

vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(() => true),
  reserveCredits: vi.fn(() => Promise.resolve({ reservationId: "res-test" })),
  releaseUnusedCredits: vi.fn(() => Promise.resolve()),
}));

vi.mock("../pricingCalculator", () => ({
  calculateCreditCost: vi.fn(() => 10),
}));

vi.mock("../traceContext", () => ({
  runWithTrace: vi.fn((traceId, userId, fn) => fn()),
  getTraceId: vi.fn(),
}));

// Import after mocks
import { orchestrateSkill } from "../skillOrchestrator";
import { getFeatureFlag, getTenantFeatureFlag, getTenantFeatureFlagValue } from "../featureFlags";
import { classifyIntent } from "../skillIntentClassifier";
import { extractParams } from "../skillParamExtractor";
import { detectSkill, extractSkillParams } from "../skillDetector";
import { executeSkill } from "../skillExecutor";
import { hasEnoughCredits, reserveCredits, releaseUnusedCredits } from "../creditService";
import { calculateCreditCost } from "../pricingCalculator";
```

### Test Cases (stubs with descriptions)

```typescript
describe("orchestrateSkill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Feature flag tests ---

  it("returns regex fallback result when skillOrchestrator is false", async () => {
    // getTenantFeatureFlag("skillOrchestrator", tenantId) returns false
    // Verify detectSkill is called instead of classifyIntent
    // Verify classifyIntent is NOT called
  });

  it("returns regex fallback when classifier fails with timeout or error", async () => {
    // getFeatureFlag returns true
    // classifyIntent throws or returns null
    // Verify detectSkill fallback is called
    // Verify result has fallback indicator
  });

  // --- Level capping tests ---

  it("caps orchestration level to tenant maxLevel setting", async () => {
    // getTenantFeatureFlag("skillOrchestratorMaxLevel") returns "simple"
    // classifyIntent returns level "compound" with 2 skills
    // Verify orchestrator downgrades to "simple" and picks top skill only
  });

  // --- Routing tests ---

  it("routes SIMPLE classification to direct executeSkill()", async () => {
    // classifyIntent returns { level: "simple", skills: [singleSkill] }
    // extractParams returns { params: {...}, missingRequired: [] }
    // Verify executeSkill is called with extracted params
    // Verify result.orchestrationLevel === "simple"
  });

  it("routes COMPOUND classification to pipeline engine", async () => {
    // classifyIntent returns { level: "compound", skills: [skill1, skill2], strategy: "sequential" }
    // Verify pipeline engine is invoked (mocked)
    // Verify result.orchestrationLevel === "compound"
  });

  it("routes COMPLEX classification to agent loop", async () => {
    // classifyIntent returns { level: "complex", skills: [...] }
    // Verify agent loop is invoked (mocked)
    // Verify result.orchestrationLevel === "complex"
  });

  // --- Confidence threshold tests ---

  it("returns no-match when classifier confidence < 0.50", async () => {
    // classifyIntent returns { skills: [{ confidence: 0.3 }] }
    // Verify null/no-match result returned
    // Verify no execution attempted
  });

  // --- Credit checks ---

  it("checks credit balance before execution and rejects if insufficient", async () => {
    // hasEnoughCredits returns false
    // Verify execution is NOT attempted
    // Verify error result with insufficient credits message
  });

  // --- TraceId propagation ---

  it("generates traceId and propagates to all sub-calls", async () => {
    // Verify traceId is generated (non-empty string)
    // Verify classifyIntent receives traceId in options
    // Verify extractParams receives traceId
    // Verify executeSkill receives traceId in params
  });

  // --- Result shape ---

  it("returns OrchestrationResult with correct orchestrationLevel", async () => {
    // Verify result has: sections, totalCreditsUsed, totalDurationMs,
    //   traceId, orchestrationLevel, classificationLatencyMs
  });
});
```

### Chat Router Integration Tests

These tests belong in the chat router test file or a new file `apps/web/server/routers/__tests__/chatOrchestration.test.ts`:

```typescript
describe("chat.sendMessage orchestration integration", () => {
  it("calls orchestrateSkill when feature flag enabled", async () => {
    // Mock getTenantFeatureFlag("skillOrchestrator") → true
    // Send a message through the chat router
    // Verify orchestrateSkill was called
  });

  it("calls detectSkill when feature flag disabled", async () => {
    // Mock getTenantFeatureFlag("skillOrchestrator") → false
    // Send a message through the chat router
    // Verify detectSkill was called (existing path)
  });

  it("handles orchestration_confirm response type correctly", async () => {
    // orchestrateSkill returns { type: "orchestration_confirm", ... }
    // Verify chat router returns the confirmation form data to client
  });
});
```

---

## Implementation Details

### skillOrchestrator.ts

Create file at `apps/web/server/services/skillOrchestrator.ts`.

#### Imports

The orchestrator imports from:
- `./featureFlags` -- `getFeatureFlag`, `getTenantFeatureFlag`
- `./skillIntentClassifier` -- `classifyIntent`
- `./skillParamExtractor` -- `extractParams`
- `./skillDetector` -- `detectSkill`, `extractSkillParams` (fallback path)
- `./skillExecutor` -- `executeSkill` (SIMPLE path)
- `./creditService` -- `hasEnoughCredits`, `reserveCredits`, `releaseUnusedCredits`
- `./pricingCalculator` -- `calculateCreditCost`
- `./traceContext` -- `runWithTrace`, `getTraceId`
- `@shared/orchestration/types` -- all shared types
- `crypto` -- `randomUUID()` for traceId generation

#### OrchestrateOptions Interface

```typescript
interface OrchestrateOptions {
  userId: number;
  tenantId: string;
  conversationId?: number;
  skillSettings?: SkillSettings | null;
  userToken: string;
  budget?: number;            // credit limit for this session
  maxLevel?: OrchestrationLevel;  // from tenant feature flag
  fallbackToRegex?: boolean;  // default: true
}
```

#### orchestrateSkill(message, options) -- Main Flow

The function follows this control flow:

1. **Generate traceId** using `crypto.randomUUID()`. Wrap the entire function body in `runWithTrace(traceId, options.userId, ...)` so all downstream calls can access it via `getTraceId()`.

2. **Check tenant feature flag** -- call `getTenantFeatureFlag("skillOrchestrator", tenantId)` (returns boolean). If false, immediately invoke the regex fallback path (`detectSkill()` + `extractSkillParams()`), wrapping the result in an `OrchestrationResult` with `orchestrationLevel: "simple"` and a `fallbackReason: "disabled"` marker.

3. **Read tenant max level** -- call `getTenantFeatureFlagValue("skillOrchestratorMaxLevel", tenantId)` (returns `string | null`, NOT boolean). Parse the returned string as `OrchestrationLevel`. If the value is `"disabled"` or null, use regex fallback. Otherwise store as `tenantMaxLevel`.

4. **Run classifier** -- call `classifyIntent(message, options.userId, options.tenantId, options.conversationId)` inside a try/catch with a timing measurement (`Date.now()` before/after). Record `classificationLatencyMs`. If the classifier throws or returns null, fall back to regex with `fallbackReason: "classifier_error"` or `"classifier_timeout"`.

5. **Apply confidence threshold** -- if the top skill's confidence is below `CONFIDENCE_ASK_USER` (0.50), do NOT return no-match immediately. Instead, fall through to `detectSkillWithAgency()` as a second-chance lookup before returning no-match. The orchestrator does NOT bypass agency detection — when the classifier returns low confidence, agency-based skill detection is the fallback, not a dead end. Only if `detectSkillWithAgency()` also returns no match should the orchestrator return a no-match result that lets the chat router treat the message as general conversation.

6. **Cap level** -- compare `classificationResult.level` against `tenantMaxLevel` and `options.maxLevel`. If the classified level exceeds the cap, downgrade:
   - `compound` capped to `simple` -- keep only the highest-confidence skill, discard others.
   - `complex` capped to `compound` -- keep skills but force pipeline strategy.
   - `complex` capped to `simple` -- keep only top skill.

7. **Extract parameters** -- for each skill in the classification result, call `extractParams(message, skill.skillId, skill.extractedParams)`. If any skill returns `needsConfirmation: true` (missing required fields or low confidence), short-circuit and return an `orchestration_confirm` response with the prefilled params, missing fields, and schema data.

8. **Check credits** -- compute a server-side estimate using `calculateCreditCost()` from `apps/web/server/services/pricingCalculator.ts`. Apply it to each matched skill and its likely model (obtained from the skill definition's `defaultModel` or the tenant's model preference). Do NOT use `classificationResult.estimatedCreditCost` — that value comes from the client-side classifier and must not be trusted for billing decisions. Sum the per-skill estimates to get `serverEstimate`. Reserve credits with `reserveCredits(options.userId, hardCap)` where `hardCap = Math.min(serverEstimate * 3, 500)`. If reservation fails, return an error result with `reason: "insufficient_credits"`.

9. **Route to execution path:**
   - **SIMPLE** -- call `getSkillByIdAsync(skillId)` from `skillRegistry.ts` before any execution. If it returns null, return an error result immediately: `{ success: false, code: "skill_not_found", message: "Skill not found: ${skillId}" }`. Only after a valid `SkillDefinition` is confirmed, call `executeSkill(skillDef, extractedParams, ...)`. Wrap the result in `OrchestrationResult.sections[0]`.
   - **COMPOUND** -- delegate to `executePipeline()` from `skillPipelineEngine.ts` (section 06). The pipeline steps are constructed from the classification's skills array with their extracted params and the classifier's `strategy`.
   - **COMPLEX** -- delegate to `runAgentLoop()` from `skillAgentLoop.ts` (section 07). Pass the original message, skill catalog context, and budget constraints.

10. **Merge results** -- for multi-skill outputs, call `mergeResults()` from `skillResultMerger.ts` (section 08). For SIMPLE, pass through unchanged.

11. **Quality gate** (optional) -- if enabled, call `validateQuality()` from `skillQualityGate.ts` (section 09). For COMPLEX mode, if quality fails, the agent loop handles retry internally.

12. **Release unused credits and build result** -- after execution completes (success or failure), call `releaseUnusedCredits(reservationId, actualCreditsUsed)` to return any over-reserved credits to the user's balance. Then assemble the final result object with `sections`, `summary`, `totalCreditsUsed`, `totalDurationMs`, `traceId`, `orchestrationLevel`, and `classificationLatencyMs`. The `releaseUnusedCredits` call must be in a `finally` block to ensure it runs even if execution throws.

#### Regex Fallback Helper

Extract a private helper function `fallbackToRegex(message, options, fallbackReason)` that:
1. Calls `detectSkill(message, options.conversationId, options.skillSettings, options.userId)`
2. If a skill is detected, calls `extractSkillParams(message, skillDefinition)`
3. Wraps the result into a minimal `OrchestrationResult` format so the caller doesn't need to handle two different result shapes
4. Logs an `orchestration_fallback` audit event with the `fallbackReason`

This helper is used in three places: feature flag disabled, classifier error, and classifier timeout.

#### Handling the orchestration_confirm Response

When parameter extraction returns `needsConfirmation: true`, the orchestrator returns a special response object:

```typescript
{
  type: "orchestration_confirm",
  skillId: string,
  prefilledParams: Record<string, unknown>,
  missingFields: string[],
  schema: JSONSchema,  // the skill's input.schema.json for form rendering
  traceId: string,
}
```

This is NOT an `OrchestrationResult`. The chat router must detect this type and return it to the frontend as a different message type. The frontend renders an inline form (section 11). When the user submits, a `confirmOrchestration` mutation fires, which re-enters `orchestrateSkill` but skips classification and extraction, going straight to execution with user-provided params.

### Integration with chat.ts

#### Modify the sendMessage procedure

In `apps/web/server/routers/chat.ts`, within the `sendMessage` procedure (around line 664), add orchestrator logic before the existing `detectSkill` call. The change is gated by a feature flag check.

The modification point is where the current code calls `detectSkill()`. Replace the call site with:

```typescript
const orchestratorEnabled = await getTenantFeatureFlag(
  "skillOrchestrator",
  ctx.tenant.id
);

if (orchestratorEnabled) {
  const orchResult = await orchestrateSkill(input.content, {
    userId: ctx.user.id,
    tenantId: ctx.tenant.id,
    conversationId: input.conversationId,
    skillSettings: skillSettings,
    userToken: ctx.token,
  });

  if (orchResult?.type === "orchestration_confirm") {
    // Return confirmation form to frontend
    return { type: "orchestration_confirm", ...orchResult };
  }

  if (orchResult && orchResult.sections.length > 0) {
    // Return multi-skill result to frontend
    return { type: "orchestration_result", ...orchResult };
  }
  // No match from orchestrator -- fall through to general conversation
} else {
  // Existing detectSkill flow (unchanged)
  const detection = await detectSkill(/* existing args */);
  // ... existing handling ...
}
```

The key insight is that the existing `detectSkill` path remains completely untouched when the flag is off. The orchestrator path is additive.

#### Add confirmOrchestration mutation

Add a new tRPC mutation to `chat.ts`:

```typescript
confirmOrchestration: protectedProcedure
  .input(z.object({
    skillId: z.string(),
    params: z.record(z.unknown()),
    traceId: z.string(),       // used for audit logging only, never for state lookup
    conversationId: z.number(),
  }))
  .mutation(async ({ input, ctx }) => {
    // MANDATORY auth guards — all must pass before any execution:

    // 1. Ownership: verify the conversation belongs to this user AND tenant
    //    WHERE conversationId = input.conversationId
    //      AND userId = ctx.user.id
    //      AND tenantId = ctx.tenantId
    // Throw TRPCError({ code: "FORBIDDEN" }) if not found.

    // 2. Skill visibility: validate input.skillId against getUserVisibleSkillIds(ctx.user.id)
    //    If the skillId is not in the user's visible set, throw TRPCError({ code: "FORBIDDEN" }).

    // 3. Server-side param validation: re-validate input.params against the skill's
    //    input.schema.json using a JSON Schema validator. Reject with UNPROCESSABLE_CONTENT
    //    if validation fails.

    // 4. Credit re-check: call hasEnoughCredits(ctx.user.id, estimatedCost) at execution time.
    //    The balance may have changed since the original classification call.
    //    If insufficient, throw TRPCError({ code: "PRECONDITION_FAILED", message: "insufficient_credits" }).

    // 5. traceId is used ONLY for audit log correlation — never used to look up cached state.

    // Skip classifier + extractor, go straight to execution with user-provided params
  })
```

This mutation calls `orchestrateSkill` internally but passes a flag or pre-extracted params that cause it to skip classification and extraction, proceeding directly to the execution step.

#### Feature Flag Registration

The `skillOrchestrator` flag must be added to the tenant feature flags system. In `apps/web/shared/featureFlags.ts`, add:

- `"skillOrchestrator"` to the `ALLOWED_FEATURE_FLAGS` array (boolean flag, read via `getTenantFeatureFlag("skillOrchestrator", tenantId)`)
- `"skillOrchestratorMaxLevel"` -- this is a string-valued flag, NOT boolean. It must be read via `getTenantFeatureFlagValue("skillOrchestratorMaxLevel", tenantId): Promise<string | null>`, a new parallel function that must be added to `featureFlags.ts`. Valid return values: `"disabled"`, `"simple"`, `"compound"`, `"complex"`. The existing `getTenantFeatureFlag` which returns boolean MUST NOT be used for this flag. The string flag is stored in Redis as `feature-flag:skillOrchestratorMaxLevel:{tenantId}` with a string value.

### Classifier Model Selection (orchestration_classify sourceType)

The intent classifier and parameter extractor must always use the cheapest available model. To enforce this, `taskExecutionPlanner.ts` must register a new source type:

- **sourceType:** `"orchestration_classify"`
- **strategy:** always `"cheapest"` (never "best" or "tenant_preferred")
- **complexity:** always `"simple"`

This sourceType must be added to the `SOURCE_TYPE_DEFAULTS` map in `taskExecutionPlanner.ts` so that any model selection call made during classification or extraction is automatically routed to the cheapest eligible model, regardless of tenant model preferences. Classifier and extractor calls MUST pass `sourceType: "orchestration_classify"` when calling `selectModel()` or equivalent.

### Error Handling Strategy

The orchestrator must NEVER throw an unhandled error to the chat router. Every exception is caught and results in either:
- A regex fallback (if `fallbackToRegex` option is true, which is the default)
- A graceful error result with `success: false` and descriptive message

This ensures the chat experience is never degraded by orchestrator failures.

### Key Design Decisions

1. **TraceId generation** uses `crypto.randomUUID()` and is created at the very start of `orchestrateSkill()`. All sub-components receive it via `runWithTrace()` from the existing `traceContext.ts` module.

2. **The orchestrator is a pure coordinator.** It does not call LLMs directly. All LLM interaction happens through the classifier, extractor, pipeline engine, and agent loop services.

3. **Level capping is strict.** If a tenant's max level is "simple", even a clearly compound request will be downgraded. The top-confidence skill is always selected when downgrading.

4. **Credit reservation uses pre-reserve + refund pattern.** The server calculates its own cost estimate using `calculateCreditCost()` — the classifier's `estimatedCreditCost` is never used for billing. Credits are atomically reserved at the start with a hard cap of `min(serverEstimate * 3, 500)` to prevent runaway charges. `releaseUnusedCredits()` is called in a `finally` block after execution to return any over-reserved amount. This pattern follows the existing implementation in `apps/web/server/services/sandbox/costEstimator.ts`.

5. **The confirmation flow is synchronous from the user's perspective.** The orchestrator returns a form, the user fills it, a new mutation fires. No websocket or polling needed for this part.