Now I have all the context needed. Let me generate the section content.

# Section 1: Shared Types and Configuration

## Overview

This section establishes the foundational TypeScript types and configuration constants used by every other module in the Hybrid Skill Orchestrator (Feature 045). All subsequent sections depend on these definitions. There are no upstream dependencies.

**Files to create:**
- `/home/dev/projects/SmartSpecPro/apps/web/shared/orchestration/types.ts` -- all shared types
- `/home/dev/projects/SmartSpecPro/apps/web/shared/orchestration/constants.ts` -- configuration constants

**Files to modify:**
- `/home/dev/projects/SmartSpecPro/apps/web/shared/featureFlags.ts` -- add two new feature flag entries

---

## Tests

No dedicated test file is required for this section. The types are pure TypeScript definitions verified at compile time. The constants are simple primitives with no logic. Type correctness is enforced by `pnpm check` (tsc --noEmit) across the monorepo.

Verification steps after implementation:

1. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check` -- must pass with zero errors.
2. Confirm that importing from `@shared/orchestration/types` and `@shared/orchestration/constants` resolves correctly in both `server/` and `client/` code.

---

## Implementation Details

### 1. Create `apps/web/shared/orchestration/types.ts`

This file defines every shared type used across the orchestrator modules. Each type is documented below with its fields and purpose.

**Type: `OrchestrationLevel`**

A string literal union representing how complex the user's request is:
- `"simple"` -- single skill, clear match (~80% of traffic)
- `"compound"` -- multiple skills needed, known in advance
- `"complex"` -- requires iterative planning/evaluation via agent loop

```typescript
export type OrchestrationLevel = "simple" | "compound" | "complex";
```

**Type: `OrchestrationStrategy`**

How multiple skills should be executed:
- `"single"` -- one skill only (SIMPLE level)
- `"parallel"` -- multiple skills concurrently, order does not matter
- `"sequential"` -- multiple skills in order, output of one feeds into next
- `"agent"` -- LLM-driven iterative loop decides execution order

```typescript
export type OrchestrationStrategy = "single" | "parallel" | "sequential" | "agent";
```

**Type: `ErrorStrategy`**

Per-step error handling in COMPOUND pipelines:
- `"fail-fast"` -- abort entire pipeline on first failure
- `"continue"` -- mark step as failed, proceed with remaining steps
- `"retry"` -- retry the failed step once with same params

```typescript
export type ErrorStrategy = "fail-fast" | "continue" | "retry";
```

**Interface: `ClassifiedSkill`**

One skill matched by the intent classifier, nested inside `ClassificationResult`:
- `skillId: string` -- the skill slug (e.g., `"food-grocery-reviewer"`)
- `confidence: number` -- 0 to 1, how certain the classifier is
- `reason: string` -- human-readable explanation for the match
- `extractedParams: Record<string, unknown>` -- any params the classifier pulled from the message
- `missingRequiredParams: string[]` -- required schema fields not found in the message

**Interface: `ClassificationResult`**

Output of the intent classifier (Section 3). Contains everything the orchestrator needs to decide the execution path:
- `level: OrchestrationLevel`
- `skills: ClassifiedSkill[]` -- one or more matched skills
- `strategy: OrchestrationStrategy`
- `reasoning: string` -- classifier's explanation of its decision

> **SECURITY NOTE — no `estimatedCreditCost` field:** Credit cost is calculated server-side by the orchestrator using `pricingCalculator`, never from LLM output. LLM-generated cost estimates are untrustworthy (the model may hallucinate or underestimate) and must never be used for billing decisions. Do NOT add an `estimatedCreditCost` field to this interface.

**Interface: `PipelineStep`**

One step in a COMPOUND pipeline (Section 6):
- `id: string` -- unique step identifier (e.g., `"step1"`)
- `skillId: string` -- which skill to execute
- `params: Record<string, unknown>` -- extracted parameters for this step
- `dependsOn: string[]` -- array of step IDs that must complete before this one
- `inputMapping: Record<string, string>` -- maps input fields to outputs of previous steps, using dot notation (e.g., `{ "topic": "step1.content" }`)
- `errorStrategy: ErrorStrategy` -- what to do if this step fails

**Interface: `AgentAction`**

One action chosen by the LLM in the COMPLEX agent loop (Section 7):
- `type: "execute_skill" | "execute_parallel" | "quality_check" | "revise_plan" | "done"` -- what the agent wants to do
- `skillId?: string` -- for `execute_skill`, which skill to run
- `skills?: Array<{ skillId: string; params: Record<string, unknown> }>` -- for `execute_parallel`
- `params?: Record<string, unknown>` -- parameters for execution
- `reasoning: string` -- why the agent chose this action

**Interface: `OrchestrationResultSection`**

One section within a multi-skill orchestration result:
- `skillId: string` -- which skill produced this
- `type: "text" | "image" | "video" | "audio" | "error"` -- output type
- `content?: string` -- text content (markdown)
- `urls?: string[]` -- media URLs
- `metadata: { creditsUsed: number; durationMs: number }` -- per-section metrics

**Interface: `OrchestrationResult`**

The unified result returned by the orchestrator regardless of execution path:
- `sections: OrchestrationResultSection[]` -- per-skill results
- `summary?: string` -- optional merged summary (for COMPOUND/COMPLEX)
- `totalCreditsUsed: number` -- sum across all skills
- `totalDurationMs: number` -- wall-clock time
- `traceId: string` -- for audit log correlation
- `orchestrationLevel: OrchestrationLevel` -- which path was taken
- `classificationLatencyMs: number` -- how long the classifier took
- `needsConfirmation?: boolean` -- if true, frontend should show confirmation form
- `confirmationData?: OrchestrationConfirmationData` -- data for the confirmation form
- `error?: { code: string; message: string; affectedSkills?: string[] }` -- structured error when the orchestration fails wholly or partially

**Defined error codes for `error.code`:**

| Code | When it is set |
|------|----------------|
| `insufficient_credits` | User does not have enough credits to run the requested skills |
| `classifier_timeout` | The intent classifier LLM call exceeded `CLASSIFIER_TIMEOUT_MS` |
| `skill_not_found` | A skill ID returned by the classifier does not exist in the registry |
| `pipeline_failed` | A COMPOUND pipeline step failed with `errorStrategy: "fail-fast"` |
| `agent_budget_exceeded` | The COMPLEX agent loop exhausted the `budget` credit limit |
| `agent_timeout` | The COMPLEX agent loop exceeded `AGENT_MAX_DURATION_MS` |
| `partial_failure` | At least one step in a COMPOUND pipeline failed but execution continued (`errorStrategy: "continue"`) |

When `error` is set on a result that also has `sections`, it signals a partial failure: some skills succeeded (their sections are present) and at least one failed (use `"partial_failure"` code and list affected skill IDs in `affectedSkills`).

**Interface: `OrchestrationConfirmationData`**

Data sent to the frontend when parameter confirmation is needed (Section 4):
- `skillId: string`
- `prefilledParams: Record<string, unknown>` -- params already extracted
- `missingFields: string[]` -- required fields the user must fill
- `schema: OrchestrationFieldProjection[]` -- **server-side projection** of the skill's input schema (see Section 04 "UI-Safe Schema Projection"); never the raw `input.schema.json`

> **SECURITY NOTE:** The `schema` field is a projected array, not the raw JSON Schema object. Raw schemas contain `$defs`, `$ref`, internal metadata, and descriptions that may include internal system details. Only project: field name, label, simplified type, enum options, required flag, and default value. See Section 04 for the `OrchestrationFieldProjection` type and projection algorithm.

Add this interface to `types.ts`:

```typescript
export interface OrchestrationFieldProjection {
  name: string;
  label: string;                         // from schema title, or title-cased name
  type: "text" | "number" | "select" | "boolean";
  options?: string[];                    // only when type === "select"
  required: boolean;
  default?: unknown;
}
```

**Interface: `ParamExtractionResult`**

Output of the parameter extractor (Section 4):
- `params: Record<string, unknown>` -- extracted and validated parameters
- `missingRequired: string[]` -- required fields not found
- `confidence: number` -- 0 to 1
- `needsConfirmation: boolean` -- whether the frontend should show a confirmation form

**Interface: `OrchestrateOptions`**

Options passed to the main `orchestrateSkill()` entry point (Section 5):
- `userId: number`
- `tenantId: string`
- `conversationId?: number`
- `skillSettings?: unknown` -- user's per-skill settings (nullable)
- `userToken: string`
- `budget?: number` -- credit limit for this orchestration session
- `maxLevel?: OrchestrationLevel` -- cap from tenant feature flag
- `fallbackToRegex?: boolean` -- default `true`, whether to fall back to regex on classifier failure

All interfaces and types should be exported individually (named exports, no default export).

### 2. Create `apps/web/shared/orchestration/constants.ts`

This file defines configuration constants used by the orchestrator modules. All values are simple primitives.

```typescript
/** Max time to wait for classifier LLM response (ms) */
export const CLASSIFIER_TIMEOUT_MS = 3000;

/** Error rate threshold (0-1) that triggers the circuit breaker */
export const CLASSIFIER_CIRCUIT_BREAKER_THRESHOLD = 0.2;

/** How long the circuit breaker stays open after tripping (ms) — 5 minutes */
export const CLASSIFIER_CIRCUIT_BREAKER_COOLDOWN_MS = 300_000;

/** Sliding window size for circuit breaker error tracking */
export const CLASSIFIER_CIRCUIT_BREAKER_WINDOW = 100;

/** Maximum iterations for the COMPLEX agent loop */
export const AGENT_MAX_ITERATIONS = 5;

/** Maximum wall-clock time for the agent loop (ms) — 30 seconds */
export const AGENT_MAX_DURATION_MS = 30_000;

/** Confidence threshold: auto-route without confirmation */
export const CONFIDENCE_AUTO_ROUTE = 0.85;

/** Confidence threshold: show soft confirmation form */
export const CONFIDENCE_SOFT_CONFIRM = 0.70;

/** Confidence threshold: below this, treat as no match */
export const CONFIDENCE_ASK_USER = 0.50;

/** Max fields in a skill schema before requiring a separate extraction LLM call */
export const COMBINED_EXTRACTION_MAX_FIELDS = 10;

/** Timeout for polling async skill completion in pipelines (ms) — 60 seconds */
export const ASYNC_SKILL_POLL_TIMEOUT_MS = 60_000;
```

### 3. Modify `apps/web/shared/featureFlags.ts`

Add two new feature flag entries to the existing system. The orchestrator uses two flags:

1. **`skillOrchestrator`** (boolean, default: `false`) -- master toggle that enables the orchestrator. When `false`, all chat messages go through the existing regex `detectSkill()` path with zero added overhead.

2. **`skillOrchestratorMaxLevel`** -- this is a string-valued setting rather than a boolean flag. Since the existing `TenantFeatureFlags` interface only supports booleans, the max level will be stored as a separate Redis key using the existing `getTenantFeatureFlag` / `setTenantFeatureFlag` pattern but with a string value read via a dedicated helper. For the boolean flag interface, add only the master toggle.

Changes to make:

- Add `skillOrchestrator: boolean` to the `TenantFeatureFlags` interface (after `multimodalMemory`)
- Add `"skillOrchestrator"` to the `ALLOWED_FEATURE_FLAGS` set
- Add `skillOrchestrator: false` to `FEATURE_FLAG_DEFAULTS`

For the max-level setting, add a helper function in the constants file:

```typescript
// In constants.ts
export type SkillOrchestratorMaxLevel = "disabled" | "simple" | "compound" | "complex";

export const ORCHESTRATOR_MAX_LEVEL_DEFAULT: SkillOrchestratorMaxLevel = "simple";
```

> **DEFAULT IS `"simple"`, NOT `"complex"`:** New tenants should not automatically have access to compound/complex orchestration which can consume significantly more credits per request. The `"simple"` default limits new tenants to single-skill routing until an admin explicitly elevates the cap.

The max-level value will be read from Redis key `feature-flag:skillOrchestratorMaxLevel:{tenantId}` as a string by the orchestrator service (Section 5). This avoids modifying the boolean-only `TenantFeatureFlags` interface for a string-valued setting.

**Required addition to `apps/web/shared/featureFlags.ts`:**

Add a new exported async function `getTenantFeatureFlagValue()` that reads a raw string value from Redis rather than coercing to boolean:

```typescript
/**
 * Reads a raw string value from the Redis feature-flag namespace.
 * Used for string-valued settings like `skillOrchestratorMaxLevel` that cannot
 * be stored in the boolean-only TenantFeatureFlags interface.
 *
 * Returns null if the key is not set (caller should apply its own default).
 */
export async function getTenantFeatureFlagValue(
  flagName: string,
  tenantId: string,
): Promise<string | null>
```

Implementation: read from Redis key `feature-flag:{flagName}:{tenantId}` using `redis.get()`. Return the raw string, or `null` if the key does not exist. Do NOT apply boolean coercion, JSON.parse, or any type transformation — callers are responsible for validating the value against their expected union type.

This function is called by the orchestrator service (Section 05) to resolve `skillOrchestratorMaxLevel` for each request's tenant.

Additionally, add `"skillOrchestrator"` to the `REDIS_SYNCED_FLAGS` set in `/home/dev/projects/SmartSpecPro/apps/web/server/services/tenantFeatureFlagService.ts` so admin panel toggles propagate to the Redis-backed route guards.

---

## Dependencies

- **No upstream dependencies.** This section is the foundation for all others.
- **Downstream:** Every other section (02 through 12) imports from these two files.

## Verification Checklist

1. `apps/web/shared/orchestration/types.ts` exists with all types exported.
2. `apps/web/shared/orchestration/constants.ts` exists with all constants exported.
3. `apps/web/shared/featureFlags.ts` includes the `skillOrchestrator` flag in the interface, allowlist, and defaults.
4. `apps/web/server/services/tenantFeatureFlagService.ts` includes `"skillOrchestrator"` in `REDIS_SYNCED_FLAGS`.
5. `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check` passes with no type errors.
6. Imports like `import { OrchestrationLevel } from "@shared/orchestration/types"` resolve correctly.