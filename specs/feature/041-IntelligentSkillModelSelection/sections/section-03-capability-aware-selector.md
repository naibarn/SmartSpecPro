# Section 03: Capability-Aware Model Selector

## Overview

This section implements the core model matching engine for intelligent skill model selection. It has two sub-steps:

- **Step 3a**: Extend `loadEnabledLlmModelRows()` in `enabledLlmModels.ts` to SELECT all capability columns, priority, priorityLocked, contextLength, and isFree. Update the `EnabledLlmModelRow` type.
- **Step 3b**: Add `selectBestLlmModel()`, `describeRequirementsMatch()`, and the `CapabilityRequirements` type to `intelligentModelSelector.ts`.

**Dependencies**: Section 01 (database migration adding `supportsVision` and `priorityLocked` columns) must be applied first. Section 02 creates the `intelligentModelSelector.ts` file with `computeModelPriority()` -- this section adds to that same file.

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/web/server/services/enabledLlmModels.ts` | Modify -- extend SELECT + update type |
| `apps/web/server/services/intelligentModelSelector.ts` | Modify (created by Section 02) -- add selector functions |
| `apps/web/server/services/intelligentModelSelector.test.ts` | Modify (created by Section 02) -- add selector tests |

---

## Tests (Write First)

Add the following tests to `apps/web/server/services/intelligentModelSelector.test.ts` (appending to the file created by Section 02 which already contains `computeModelPriority` tests).

```typescript
// ─── apps/web/server/services/intelligentModelSelector.test.ts ───
// (append to existing file from Section 02)

import {
  selectBestLlmModel,
  describeRequirementsMatch,
  type CapabilityRequirements,
} from "./intelligentModelSelector";
import type { EnabledLlmModelRow } from "./enabledLlmModels";

/**
 * Helper to build a minimal EnabledLlmModelRow for testing.
 * All capability booleans default to false, priority defaults to 50.
 */
function makeRow(
  modelId: string,
  overrides: Partial<EnabledLlmModelRow> = {},
): EnabledLlmModelRow {
  return {
    providerName: "test-provider",
    modelId,
    providerModelId: modelId,
    defaultModel: null,
    supportsVision: false,
    supportsFunctionTools: false,
    supportsStructuredOutputs: false,
    supportsWebSearch: false,
    supportsCodeExecution: false,
    supportsComputerUse: false,
    supportsBackground: false,
    supportsResponses: false,
    contextLength: null,
    priority: 50,
    priorityLocked: false,
    isFree: false,
    ...overrides,
  };
}

describe("selectBestLlmModel", () => {
  it("returns modelId of first qualifying model sorted by priority", () => {
    const rows = [
      makeRow("gpt-4o", { priority: 10, supportsFunctionTools: true }),
      makeRow("claude-3", { priority: 5, supportsFunctionTools: true }),
    ];
    const result = selectBestLlmModel(
      { supportsFunctionTools: true },
      rows,
    );
    // claude-3 has priority 5 (lower = better), so it wins
    expect(result).toBe("claude-3");
  });

  it("returns null when no row satisfies requirements", () => {
    const rows = [
      makeRow("text-only", { supportsFunctionTools: false }),
    ];
    const result = selectBestLlmModel(
      { supportsFunctionTools: true },
      rows,
    );
    expect(result).toBeNull();
  });

  it("AND logic: excludes models missing any single required capability", () => {
    const rows = [
      makeRow("partial", {
        supportsFunctionTools: true,
        supportsStructuredOutputs: false,
      }),
    ];
    const result = selectBestLlmModel(
      { supportsFunctionTools: true, supportsStructuredOutputs: true },
      rows,
    );
    expect(result).toBeNull();
  });

  it("false requirements do not filter out capable models", () => {
    const rows = [
      makeRow("capable", { supportsFunctionTools: true }),
    ];
    // false means "I don't need this" — should NOT exclude models that have it
    const result = selectBestLlmModel(
      { supportsFunctionTools: false },
      rows,
    );
    expect(result).toBe("capable");
  });

  it("contextLength filter excludes models with insufficient context", () => {
    const rows = [
      makeRow("small", { contextLength: 4096, priority: 1 }),
      makeRow("large", { contextLength: 128000, priority: 2 }),
    ];
    const result = selectBestLlmModel(
      { contextLength: 32000 },
      rows,
    );
    expect(result).toBe("large");
  });

  it("contextLength filter excludes models with null contextLength", () => {
    const rows = [
      makeRow("unknown-ctx", { contextLength: null, priority: 1 }),
      makeRow("known-large", { contextLength: 128000, priority: 2 }),
    ];
    const result = selectBestLlmModel(
      { contextLength: 32000 },
      rows,
    );
    expect(result).toBe("known-large");
  });

  it("returns null for empty rows array", () => {
    const result = selectBestLlmModel(
      { supportsFunctionTools: true },
      [],
    );
    expect(result).toBeNull();
  });

  it("returns first model when requirements object is empty", () => {
    const rows = [
      makeRow("model-a", { priority: 20 }),
      makeRow("model-b", { priority: 10 }),
    ];
    const result = selectBestLlmModel({}, rows);
    // After sorting by priority ASC, model-b (10) comes first
    expect(result).toBe("model-b");
  });

  it("does not require capabilities not in requirements object", () => {
    // Only requires supportsFunctionTools; supportsVision is not in requirements
    const rows = [
      makeRow("tools-only", {
        supportsFunctionTools: true,
        supportsVision: false,
        priority: 5,
      }),
    ];
    const result = selectBestLlmModel(
      { supportsFunctionTools: true },
      rows,
    );
    expect(result).toBe("tools-only");
  });
});

describe("describeRequirementsMatch", () => {
  it("lists matched capabilities correctly", () => {
    const requirements: Partial<CapabilityRequirements> = {
      supportsFunctionTools: true,
      supportsVision: true,
    };
    const row = makeRow("model-a", {
      supportsFunctionTools: true,
      supportsVision: true,
    });
    const result = describeRequirementsMatch(requirements, row);
    expect(result.matched).toContain("supportsFunctionTools");
    expect(result.matched).toContain("supportsVision");
    expect(result.missing).toHaveLength(0);
  });

  it("lists missing capabilities correctly", () => {
    const requirements: Partial<CapabilityRequirements> = {
      supportsFunctionTools: true,
      supportsVision: true,
    };
    const row = makeRow("model-a", {
      supportsFunctionTools: true,
      supportsVision: false,
    });
    const result = describeRequirementsMatch(requirements, row);
    expect(result.matched).toContain("supportsFunctionTools");
    expect(result.missing).toContain("supportsVision");
  });

  it("returns empty arrays when requirements is empty", () => {
    const row = makeRow("model-a", { supportsFunctionTools: true });
    const result = describeRequirementsMatch({}, row);
    expect(result.matched).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
  });
});
```

---

## Implementation

### Step 3a: Update `apps/web/server/services/enabledLlmModels.ts`

The current `EnabledLlmModelRow` type has only 4 fields: `providerName`, `modelId`, `providerModelId`, `defaultModel`. The current `loadEnabledLlmModelRows()` SELECT matches those 4 fields. The capability-aware selector needs all capability columns, priority, and context length.

#### Updated `EnabledLlmModelRow` type

Replace the existing type definition at the top of the file:

```typescript
// ─── apps/web/server/services/enabledLlmModels.ts ───

export type EnabledLlmModelRow = {
  providerName: string;
  modelId: string;
  providerModelId: string;
  defaultModel: string | null;
  // Capability columns (all nullable booleans from model_provider_map)
  supportsVision: boolean | null;
  supportsFunctionTools: boolean | null;
  supportsStructuredOutputs: boolean | null;
  supportsWebSearch: boolean | null;
  supportsCodeExecution: boolean | null;
  supportsComputerUse: boolean | null;
  supportsBackground: boolean | null;
  supportsResponses: boolean | null;
  // Sizing and ranking
  contextLength: number | null;
  priority: number;
  priorityLocked: boolean | null;
  isFree: boolean;
};
```

**Important**: The type must be `export`ed since `intelligentModelSelector.ts` imports it.

#### Updated `loadEnabledLlmModelRows()` SELECT

Extend the `.select({...})` block and the `.map()` at the end to include the new columns. The full function becomes:

```typescript
export async function loadEnabledLlmModelRows(): Promise<EnabledLlmModelRow[]> {
  const db = await getDb();
  if (!db) {
    return [];
  }

  const rows = await db
    .select({
      providerName: llmProviders.providerName,
      modelId: modelProviderMap.modelId,
      providerModelId: modelProviderMap.providerModelId,
      defaultModel: llmProviders.defaultModel,
      // Capability columns
      supportsVision: modelProviderMap.supportsVision,
      supportsFunctionTools: modelProviderMap.supportsFunctionTools,
      supportsStructuredOutputs: modelProviderMap.supportsStructuredOutputs,
      supportsWebSearch: modelProviderMap.supportsWebSearch,
      supportsCodeExecution: modelProviderMap.supportsCodeExecution,
      supportsComputerUse: modelProviderMap.supportsComputerUse,
      supportsBackground: modelProviderMap.supportsBackground,
      supportsResponses: modelProviderMap.supportsResponses,
      // Sizing and ranking
      contextLength: modelProviderMap.contextLength,
      priority: modelProviderMap.priority,
      priorityLocked: modelProviderMap.priorityLocked,
      isFree: modelProviderMap.isFree,
    })
    .from(modelProviderMap)
    .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
    .where(and(eq(modelProviderMap.isEnabled, true), eq(llmProviders.isEnabled, true)))
    .orderBy(
      asc(llmProviders.sortOrder),
      asc(modelProviderMap.priority),
      asc(modelProviderMap.id),
    );

  return rows.map((row) => ({
    providerName: row.providerName,
    modelId: row.modelId,
    providerModelId: row.providerModelId,
    defaultModel: row.defaultModel,
    supportsVision: row.supportsVision,
    supportsFunctionTools: row.supportsFunctionTools,
    supportsStructuredOutputs: row.supportsStructuredOutputs,
    supportsWebSearch: row.supportsWebSearch,
    supportsCodeExecution: row.supportsCodeExecution,
    supportsComputerUse: row.supportsComputerUse,
    supportsBackground: row.supportsBackground,
    supportsResponses: row.supportsResponses,
    contextLength: row.contextLength,
    priority: row.priority,
    priorityLocked: row.priorityLocked,
    isFree: row.isFree,
  }));
}
```

#### Backward compatibility

All existing callers of `loadEnabledLlmModelRows()` and `resolveEnabledLlmModelIdFromRows()` access only `modelId`, `providerName`, `providerModelId`, and `defaultModel`. Adding new fields to the type is purely additive. The helper functions `buildComparableIds()`, `rowMatchesModelId()`, and `resolveEnabledLlmModelIdFromRows()` use only the original 4 fields and continue to compile without changes.

The internal type parameter used by `buildComparableIds` and `rowMatchesModelId` is structurally typed (uses `row.modelId`, `row.providerModelId`, etc.) so it remains compatible with the wider type.

---

### Step 3b: Add Selector Functions to `apps/web/server/services/intelligentModelSelector.ts`

This file is created by Section 02 with `computeModelPriority()`. Add the following exports to the same file.

#### `CapabilityRequirements` interface

```typescript
// ─── apps/web/server/services/intelligentModelSelector.ts ───
// (add below the Section 02 code)

import type { EnabledLlmModelRow } from "./enabledLlmModels";

/**
 * Requirements that a skill can declare for model selection.
 * All fields are optional. Only `true` boolean values act as filters.
 * `false` values are ignored (they do not exclude models that have the capability).
 */
export interface CapabilityRequirements {
  supportsVision?: boolean;
  supportsFunctionTools?: boolean;
  supportsStructuredOutputs?: boolean;
  supportsWebSearch?: boolean;
  supportsCodeExecution?: boolean;
  supportsComputerUse?: boolean;
  supportsBackground?: boolean;
  supportsResponses?: boolean;
  /** Minimum context window size in tokens. */
  contextLength?: number;
}
```

#### The 8 capability keys (used by both functions)

```typescript
const CAPABILITY_KEYS: ReadonlyArray<keyof Omit<CapabilityRequirements, "contextLength">> = [
  "supportsVision",
  "supportsFunctionTools",
  "supportsStructuredOutputs",
  "supportsWebSearch",
  "supportsCodeExecution",
  "supportsComputerUse",
  "supportsBackground",
  "supportsResponses",
] as const;
```

#### `selectBestLlmModel()`

```typescript
/**
 * Given a set of capability requirements and a list of enabled model rows,
 * return the modelId of the best matching model, or null if none qualifies.
 *
 * Algorithm:
 * 1. Filter rows by boolean capability requirements (AND logic).
 *    Only `true` requirements filter; `false` requirements are ignored.
 * 2. If contextLength requirement is set, exclude rows where
 *    row.contextLength is null or row.contextLength < requirements.contextLength.
 * 3. Sort qualifying rows by priority ASC (lower number = higher priority).
 * 4. Return first row's modelId, or null.
 *
 * NOTE: disallowedModels filtering is deferred to v2.
 */
export function selectBestLlmModel(
  requirements: Partial<CapabilityRequirements>,
  rows: EnabledLlmModelRow[],
): string | null {
  if (rows.length === 0) {
    return null;
  }

  // Step 1: Filter by boolean capabilities (AND logic)
  let candidates = rows.filter((row) => {
    for (const key of CAPABILITY_KEYS) {
      if (requirements[key] === true) {
        // Row must have this capability set to true
        if (row[key] !== true) {
          return false;
        }
      }
      // false or undefined requirements do NOT filter
    }
    return true;
  });

  // Step 2: Filter by contextLength
  if (
    requirements.contextLength != null &&
    requirements.contextLength > 0
  ) {
    candidates = candidates.filter((row) => {
      // Null contextLength = unknown capacity => excluded (conservative)
      if (row.contextLength == null) {
        return false;
      }
      return row.contextLength >= requirements.contextLength!;
    });
  }

  // Step 3: Sort by priority ASC (lower = higher priority)
  // Rows are already partially sorted from the DB query, but re-sort
  // to ensure correctness after filtering.
  candidates.sort((a, b) => a.priority - b.priority);

  // Step 4: Return first match
  // TODO v2: apply disallowedModels filter here
  return candidates[0]?.modelId ?? null;
}
```

#### `describeRequirementsMatch()`

```typescript
/**
 * Human-readable description of which capabilities a row matches
 * and which it is missing, relative to given requirements.
 *
 * Returns { matched: string[], missing: string[] }.
 * Only boolean requirements set to `true` are evaluated.
 */
export function describeRequirementsMatch(
  requirements: Partial<CapabilityRequirements>,
  row: EnabledLlmModelRow,
): { matched: string[]; missing: string[] } {
  const matched: string[] = [];
  const missing: string[] = [];

  for (const key of CAPABILITY_KEYS) {
    if (requirements[key] !== true) {
      continue; // Not required, skip
    }
    if (row[key] === true) {
      matched.push(key);
    } else {
      missing.push(key);
    }
  }

  // contextLength check
  if (
    requirements.contextLength != null &&
    requirements.contextLength > 0
  ) {
    if (
      row.contextLength != null &&
      row.contextLength >= requirements.contextLength
    ) {
      matched.push("contextLength");
    } else {
      missing.push("contextLength");
    }
  }

  return { matched, missing };
}
```

---

## Key Design Decisions

1. **AND logic only** -- all `true` requirements must be satisfied. There is no OR or "best effort" matching. If a skill needs vision AND function tools, a model missing either one is excluded entirely.

2. **`false` requirements are no-ops** -- setting `supportsFunctionTools: false` does NOT exclude models that have function tools. It simply means "I do not require this capability." This prevents accidental exclusion.

3. **Null contextLength is conservative** -- if a model row has `contextLength: null` (unknown) and the skill requires a specific context length, the model is excluded. This avoids sending oversized prompts to models with unknown limits.

4. **`disallowedModels` deferred to v2** -- the `SkillExecutionPolicyConfig` type from Spec 038 includes a `disallowedModels` array, but this section does not implement filtering by it. A `TODO v2` comment is placed at the filter point for future implementation.

5. **Priority sort after filter** -- although the DB query already sorts by priority, after filtering the order may change (gaps). Re-sorting in JS is O(n log n) on the filtered subset and guarantees correctness.

6. **`describeRequirementsMatch` returns structured data** -- returns `{ matched: string[], missing: string[] }` instead of a formatted string. This gives callers (Section 07 preview UI) flexibility in display formatting.

---

## Verification Checklist

- [x] `EnabledLlmModelRow` type exported from `enabledLlmModels.ts` with all 16 fields
- [x] `loadEnabledLlmModelRows()` SELECT includes all 8 capability columns + contextLength + priority + priorityLocked + isFree
- [x] Existing callers (`resolveEnabledLlmModelIdFromRows`, `resolveEnabledLlmModelId`, `isEnabledLlmModelId`) still compile without changes
- [x] `selectBestLlmModel()` exported from `intelligentModelSelector.ts`
- [x] `describeRequirementsMatch()` exported from `intelligentModelSelector.ts`
- [x] `CapabilityRequirements` interface exported from `intelligentModelSelector.ts`
- [x] All 13 test cases pass (`selectBestLlmModel`: 8, `describeRequirementsMatch`: 5 — 2 extra contextLength tests added during review)
- [x] `pnpm check` passes with no type errors (in our files)
- [x] `pnpm test` passes with no regressions (25 total tests in intelligentModelSelector.test.ts)
