Now I have all the context I need. Let me generate the section content.

# Section 02: Model Priority Scoring Service

## Overview

This section creates the first half of `apps/web/server/services/intelligentModelSelector.ts` — a pure scoring function that computes a meaningful priority number for any model row. When an admin enables a new model from the catalog, the system calls this function to auto-assign priority instead of defaulting everything to 0.

This section depends on **Section 01** (which adds the `supportsVision` and `priorityLocked` columns to `model_provider_map`). Section 03 will add the second half of `intelligentModelSelector.ts` (the actual capability-aware model selector).

---

## Background

Currently, every new `model_provider_map` entry is created with `priority = 0`. This means all models have equal priority and the ordering is arbitrary. The feature needs a smarter default that ranks newer, cheaper, more-capable models higher automatically, while allowing admins to override manually (using the `priorityLocked` flag from Section 01).

The scoring function is a pure deterministic function — same input always returns same output, no DB calls, no side effects. The calling code in `multiProvider.ts` (Section 05) decides when to call it and whether to persist the result.

---

## Files to Create

### New file: `apps/web/server/services/intelligentModelSelector.ts`

This file will grow across sections. In this section, you implement only `computeModelPriority` and its supporting type. Section 03 will add `selectBestLlmModel`, `describeRequirementsMatch`, and `CapabilityRequirements` to the same file.

**Type to define:**

```typescript
/**
 * Minimum model data needed to compute a priority score.
 * Sourced from model_provider_map + llmProviders.availableModels JSON.
 */
export interface ModelPriorityInput {
  /** Unix timestamp (seconds) from OpenRouter availableModels — used for recency scoring */
  createdAt?: number | null;
  /** Cost per 1M input tokens (string from numeric DB column) */
  pricingInput?: string | number | null;
  /** Cost per 1M output tokens (string from numeric DB column) */
  pricingOutput?: string | number | null;
  /** Whether the model is free */
  isFree?: boolean | null;
  // ── Capability flags (all 8 that exist on model_provider_map) ──
  supportsFunctionTools?: boolean | null;
  supportsStructuredOutputs?: boolean | null;
  supportsWebSearch?: boolean | null;
  supportsCodeExecution?: boolean | null;
  supportsComputerUse?: boolean | null;
  supportsBackground?: boolean | null;
  supportsResponses?: boolean | null;
  /** Added in Section 01 */
  supportsVision?: boolean | null;
}
```

**Function to export:**

```typescript
/**
 * Compute a priority score for a model.
 * Lower returned number = higher priority in ORDER BY priority ASC queries.
 * Range: 1–99 (never 0, never negative, never ≥ 100).
 * Pure function — deterministic, no side effects.
 */
export function computeModelPriority(model: ModelPriorityInput): number
```

---

## Scoring Algorithm

The total score is the sum of three components, then inverted: `Math.max(1, Math.round(100 - totalScore))`.

### Component 1: Recency (0–40 points)

Based on `model.createdAt` — a Unix timestamp in seconds from the OpenRouter `availableModels` JSON stored in `llmProviders.availableModels`. Newer models are generally more capable.

| Age of model | Points |
|---|---|
| Created within last 30 days | 40 |
| 31–90 days ago | 30 |
| 91–365 days ago | 20 |
| More than 365 days ago | 10 |
| `createdAt` is undefined or null | 15 (safe middle) |

Compute age by comparing `createdAt * 1000` against `Date.now()`.

### Component 2: Cost (0–30 points)

Based on the average of `pricingInput` and `pricingOutput` per 1M tokens. Parse both as floats; handle null/undefined as unknown.

| Effective average price | Points |
|---|---|
| `isFree === true` | 30 (skip price math entirely) |
| Average < $0.50 per 1M | 25 |
| Average $0.50–$2.00 per 1M | 20 |
| Average $2.00–$5.00 per 1M | 15 |
| Average $5.00–$15.00 per 1M | 10 |
| Average > $15.00 per 1M | 5 |
| Both inputs are null/NaN/missing | 15 (safe middle) |

### Component 3: Capabilities (0–30 points)

Count how many of the 8 boolean flags are `true`. The 8 flags are: `supportsFunctionTools`, `supportsStructuredOutputs`, `supportsWebSearch`, `supportsCodeExecution`, `supportsComputerUse`, `supportsBackground`, `supportsResponses`, `supportsVision`.

Formula: `Math.floor((trueCount / 8) * 30)`

Null/undefined flags count as `false` (conservative).

### Final result

```
totalScore = recencyPoints + costPoints + capabilityPoints  // max 100
priority   = Math.max(1, Math.round(100 - totalScore))
```

Range analysis:
- Best possible: recency=40 + cost=30 + capabilities=30 = score 100 → priority = `Math.max(1, 0)` = **1**
- Worst possible: recency=10 + cost=5 + capabilities=0 = score 15 → priority = **85**
- Unknown everything: 15 + 15 + 0 = score 30 → priority = **70**
- Admin can explicitly set priority to 0 via `updateModelPriority` mutation (Section 05) — 0 is valid but the formula never produces it

---

## Test File to Create

**File: `apps/web/server/services/intelligentModelSelector.test.ts`**

Tests are in a `describe("computeModelPriority", ...)` block. Section 03 will add `describe("selectBestLlmModel", ...)` and `describe("describeRequirementsMatch", ...)` blocks to the same file.

Test stubs to implement:

```typescript
describe("computeModelPriority", () => {
  it("returns lower number for newer model (recency wins)")
  // setup: modelA.createdAt = Date.now()/1000 - (7 * 86400)  // 7 days old
  //        modelB.createdAt = Date.now()/1000 - (800 * 86400) // 2+ years old
  // expect: computeModelPriority(modelA) < computeModelPriority(modelB)

  it("returns lower number for free model over paid")
  // setup: modelA: isFree=true; modelB: isFree=false, pricingInput="5", pricingOutput="5"
  // expect: computeModelPriority(modelA) < computeModelPriority(modelB)

  it("returns lower number for model with more capabilities")
  // setup: modelA: all 8 flags true; modelB: all 8 flags false (or undefined)
  // expect: computeModelPriority(modelA) < computeModelPriority(modelB)

  it("never returns 0 or negative")
  // worst-case: old model, expensive, no capabilities
  // expect: priority >= 1

  it("never returns more than 100")
  // best-case: brand new, free, all 8 capabilities true
  // expect: priority <= 100

  it("returns mid-range value (15 pts) for unknown createdAt")
  // setup: model.createdAt = undefined; same cost and capabilities on both sides
  // The recency contribution should be 15 pts (safe middle)
  // Verify by comparing against a model with known 30-day-old createdAt (30 pts)
  // and a model with >1yr old createdAt (10 pts): unknown should be between them

  it("returns mid-range value (15 pts) for unknown pricing")
  // setup: pricingInput = null, pricingOutput = null, isFree = false
  // The cost contribution should be 15 pts
  // Verify: result is between cheapest-known and most-expensive-known

  it("is deterministic — same input always returns same output")
  // Call computeModelPriority twice with identical object
  // expect: both calls return the same number
})
```

The test file imports only from `./intelligentModelSelector` and uses no mocks — the function is pure.

---

## Implementation Notes

**Parsing `pricingInput` / `pricingOutput`:** These come from `numeric("pricingInput", { precision: 12, scale: 8 })` columns in Drizzle, which returns `string` values (PostgreSQL numeric → JS string). The function must handle both `string` and `number` types and parse with `parseFloat`. If the result is `NaN`, treat as unknown.

**The `createdAt` field** does not exist on `model_provider_map`. It comes from the `availableModels` JSON stored on `llmProviders`. The caller (Section 05, `bulkSetAdminModelCatalogEnabled`) is responsible for looking it up and passing it in the `ModelPriorityInput` object. The function treats a missing `createdAt` as unknown (15 recency points).

**Avoid clock drift in tests:** Use relative timestamps (`Date.now() / 1000 - N * 86400`) rather than hardcoded dates so tests don't break over time.

**Capability flag `supportsVision`:** This column is added in Section 01. In the `ModelPriorityInput` type it is `supportsVision?: boolean | null`. If Section 01 has not yet been applied (schema not yet migrated), this field simply won't be present on DB rows — the function handles it as `null` (counts as `false`). The function itself does not access the DB.

**File coverage goal:** 100% line coverage — the function is pure with no external dependencies, making full coverage straightforward.

---

## Integration Points (not implemented in this section)

The following callers of `computeModelPriority` are implemented in **Section 05**:

- `multiProvider.ts` → `bulkSetAdminModelCatalogEnabled`: calls `computeModelPriority()` for each new mapping being created, using model data looked up from a pre-loaded `Map<modelId, SyncedModel>`.
- `multiProvider.ts` → `upsertModelMapping`: calls `computeModelPriority()` when `input.priority` is not explicitly provided by the caller.
- `multiProvider.ts` → `backfillModelPriorities`: iterates all rows where `priorityLocked = false` and recomputes.

This section only creates the function and its tests. Section 05 wires it in.

---

## Checklist

- [x] `apps/web/server/services/intelligentModelSelector.ts` created with `ModelPriorityInput` interface and `computeModelPriority` exported function
- [x] `apps/web/server/services/intelligentModelSelector.test.ts` created with 11 test cases passing (8 spec + 3 edge cases from review)
- [x] `computeModelPriority` handles all null/undefined inputs gracefully (no thrown errors)
- [x] Return value is always in range 1–85 (corrected from spec's 1–99; empirical max is 85)
- [x] Tests pass

## Deviations from Plan

- **CapabilityFlag type**: Added `CapabilityFlag` union type to narrow `CAPABILITY_FLAGS` array (review fix #2)
- **3 extra tests**: Added partial-NaN pricing, isFree=null, and epoch createdAt edge cases (review fixes #1, #4)
- **JSDoc range**: Corrected "1–99" to "1–85" reflecting actual formula bounds (review fix #3)
- [ ] `pnpm check` passes (TypeScript compiles)