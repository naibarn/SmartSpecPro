Now I have all the context I need. Let me generate the section content.

# Section 04: Extended `resolveSkillExecutionPolicy()`

## Overview

This section wires the intelligent model selector (built in Section 03) into the existing skill execution policy resolver. Skills that declare capability requirements will automatically use capability-aware model selection. Skills without requirements continue to resolve exactly as before.

**Depends on:**
- Section 01 (DB migration) — `supportsVision` and `priorityLocked` columns must exist
- Section 02 (`computeModelPriority` in `intelligentModelSelector.ts`)
- Section 03 (`selectBestLlmModel`, `EnabledLlmModelRow` with capability fields)

---

## Files to Modify

- **`apps/web/server/services/skillExecutionPolicy.ts`** — primary change
- **`apps/web/server/services/skillExecutionPolicy.test.ts`** — extend existing test file

---

## Background

The current `resolveSkillExecutionPolicy()` in `apps/web/server/services/skillExecutionPolicy.ts` runs a simple priority cascade:

1. `skill.llmModelId`
2. `skill.defaultModel`
3. `conversationModel`
4. system default (first enabled row)

The `SkillDefinition` type (from `packages/skills/src/types.ts`) already has `executionPolicy?: SkillExecutionPolicyConfig`, and `SkillExecutionPolicyConfig` already has `mode`, `requirements`, `fixedModel`, and `allowConversationOverride`. After Section 08 adds `supportsVision` to the requirements sub-type, this field is fully available.

The existing `SkillExecutionPolicyResult` needs two new optional fields:
- `matchedCapabilities?: string[]` — list of capability names that the selected model satisfies
- `requirementsFallback?: boolean` — true when requirements matching found no model and fallback was used

The `modelSource` union needs one new value: `"requirements_match"`.

The current `EnabledLlmModelRow` type (after Section 03's changes to `enabledLlmModels.ts`) will include all capability fields, `priority`, `priorityLocked`, and `contextLength`.

---

## Tests First

Extend `apps/web/server/services/skillExecutionPolicy.test.ts`.

The existing file already mocks `loadEnabledLlmModelRows` and `resolveEnabledLlmModelIdFromRows` from `./enabledLlmModels`. The new tests must also mock `selectBestLlmModel` from `./intelligentModelSelector`.

```typescript
// Add to existing mock setup at top of file:
vi.mock("./intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(),
  describeRequirementsMatch: vi.fn(),
}));

import { selectBestLlmModel, describeRequirementsMatch } from "./intelligentModelSelector";
const mockSelectBestLlmModel = vi.mocked(selectBestLlmModel);
const mockDescribeRequirementsMatch = vi.mocked(describeRequirementsMatch);
```

The `makeSkill()` helper already exists in the test file. Use it with `executionPolicy` overrides:

```typescript
// Helper for a skill with requirements
function makeSkillWithRequirements(
  requirements: Record<string, unknown>,
  extras: Partial<SkillDefinition> = {}
): SkillDefinition {
  return makeSkill({
    executionPolicy: { mode: "requirements", requirements },
    ...extras,
  });
}
```

### New test suite to add

```typescript
describe("resolveSkillExecutionPolicy — requirements mode", () => {
  // Reset mocks before each test
  beforeEach(() => {
    mockLoadRows.mockResolvedValue(fakeRows);
    mockSelectBestLlmModel.mockReset();
    mockDescribeRequirementsMatch.mockReturnValue("Matched: functionTools");
  });

  it("uses requirements when skill.executionPolicy.requirements is set")
  // skill: { executionPolicy: { requirements: { supportsFunctionTools: true } } }
  // mockSelectBestLlmModel returns "claude-3-sonnet"
  // expect: result.modelId === "claude-3-sonnet"
  // expect: result.modelSource === "requirements_match"

  it("passes all enabled rows to selectBestLlmModel")
  // verify mockSelectBestLlmModel was called with (requirements, fakeRows)

  it("falls back to llmModelId when requirements find no match")
  // mockSelectBestLlmModel returns null
  // skill has llmModelId = "gpt-4o" (enabled in fakeRows)
  // mockResolveFromRows returns "gpt-4o" when asked
  // expect: result.modelId === "gpt-4o", modelSource === "skill_llmModelId"

  it("falls back to system default when requirements fail and no llmModelId")
  // mockSelectBestLlmModel returns null
  // skill has no llmModelId, no defaultModel
  // mockResolveFromRows returns "system-default" for the full array
  // expect: result.modelSource === "system_default"

  it("sets requirementsFallback=true when fallback was used")
  // mockSelectBestLlmModel returns null
  // expect: result.requirementsFallback === true

  it("sets requirementsFallback=false (or undefined) when requirements matched")
  // mockSelectBestLlmModel returns "matched-model"
  // expect: result.requirementsFallback is falsy

  it("sets matchedCapabilities in result when requirements matched")
  // mockDescribeRequirementsMatch returns "Matched: vision, functionTools"
  // expect: result.matchedCapabilities contains capability names

  it("hybrid mode: tries fixedModel first when fixedModel is enabled")
  // skill.executionPolicy = { mode: "hybrid", fixedModel: "claude-3-opus", requirements: {...} }
  // mockResolveFromRows returns "claude-3-opus" when given ["claude-3-opus"]
  // expect: result.modelId === "claude-3-opus", modelSource === "skill_fixedModel"
  // expect: selectBestLlmModel NOT called

  it("hybrid mode: falls through to requirements when fixedModel not enabled")
  // skill.executionPolicy = { mode: "hybrid", fixedModel: "disabled-model", requirements: {...} }
  // mockResolveFromRows returns null when given ["disabled-model"]
  // mockSelectBestLlmModel returns "claude-3-sonnet"
  // expect: result.modelSource === "requirements_match"

  it("fixed mode: skips requirements and uses existing cascade")
  // skill.executionPolicy = { mode: "fixed" }  (no requirements)
  // skill.llmModelId = "gpt-4-turbo"
  // mockResolveFromRows returns "gpt-4-turbo"
  // expect: selectBestLlmModel NOT called
  // expect: result.modelSource === "skill_llmModelId"

  it("allowConversationOverride=false: conversationModel ignored when requirements fail")
  // skill.executionPolicy = { requirements: {...}, allowConversationOverride: false }
  // mockSelectBestLlmModel returns null
  // conversationModel = "conv-model"
  // expect: "conv-model" NOT tried; falls to system default

  it("allowConversationOverride=true: conversationModel eligible when requirements fail")
  // skill.executionPolicy = { requirements: {...}, allowConversationOverride: true }
  // mockSelectBestLlmModel returns null
  // mockResolveFromRows returns "conv-model" when "conv-model" is in array
  // expect: result.modelId === "conv-model", modelSource === "conversation"

  it("auto-detect: requirements take precedence over llmModelId when both present")
  // skill has BOTH llmModelId = "gpt-4o" AND executionPolicy.requirements = {...}
  // mode is undefined (auto-detect)
  // mockSelectBestLlmModel returns "claude-3-sonnet"
  // expect: result.modelId === "claude-3-sonnet" (requirements win), NOT "gpt-4o"
  // expect: result.modelSource === "requirements_match"
})

describe("resolveSkillExecutionPolicy — regression: no requirements", () => {
  // These tests re-verify existing behavior is unchanged
  it("skill without requirements: llmModelId still works")
  it("skill without requirements: defaultModel still works")
  it("skill without requirements: conversation model still works")
  it("skill without requirements: system default still works")
  it("skill with executionPolicy but empty requirements: treats as no requirements")
  // skill.executionPolicy = { mode: undefined, requirements: {} }
  // expect: selectBestLlmModel NOT called (empty requirements = auto-detect = no requirements path)
})
```

---

## Implementation

### 1. Update `SkillExecutionPolicyResult` type

In `apps/web/server/services/skillExecutionPolicy.ts`, extend the result interface:

```typescript
export interface SkillExecutionPolicyResult {
  modelId: string | null;
  preferredProviderId?: number;
  strictProviderPin?: boolean;
  /**
   * Source of the resolved model for auditing.
   * "requirements_match" — selected by capability-aware selector
   * "skill_fixedModel" — hybrid mode, fixedModel was available
   */
  modelSource:
    | "skill_llmModelId"
    | "skill_defaultModel"
    | "conversation"
    | "system_default"
    | "requirements_match"
    | "skill_fixedModel";
  /** Capabilities the selected model satisfies (only when modelSource="requirements_match") */
  matchedCapabilities?: string[];
  /** True when requirements found no match and a fallback model was used */
  requirementsFallback?: boolean;
}
```

### 2. Add import for intelligent selector

```typescript
import { selectBestLlmModel, describeRequirementsMatch } from "./intelligentModelSelector";
```

### 3. Implement the new cascade logic

Replace the body of `resolveSkillExecutionPolicy()` with the extended cascade. The implementation logic, in prose:

**Step 0 — Load rows (unchanged, single DB call):**
Load all enabled model rows once via `loadEnabledLlmModelRows()`. These now include capability fields after Section 03.

**Step 1 — Determine mode:**
Read `skill.executionPolicy?.mode` and `skill.executionPolicy?.requirements`. Compute `hasRequirements`: requirements exists AND has at least one key with a non-undefined value. If mode is `"fixed"` or requirements is absent/empty and mode is not `"requirements"`, skip to the existing cascade unchanged.

**Step 2 — Hybrid mode pre-step:**
If mode is `"hybrid"` AND `fixedModel` is set, call `resolveEnabledLlmModelIdFromRows({ rows, preferredModelIds: [fixedModel] })`. If found and matches the fixedModel, return `{ modelId: fixedModel, modelSource: "skill_fixedModel", ... }`. If not found, fall through to Step 3.

**Step 3 — Requirements matching:**
If `hasRequirements` is true (or mode is `"requirements"`), call `selectBestLlmModel(requirements, rows)`. If a model is returned, gather capabilities via `describeRequirementsMatch` (parse the string into an array of capability names for `matchedCapabilities`), then return `{ modelId, modelSource: "requirements_match", matchedCapabilities, requirementsFallback: false, ...base }`.

If `selectBestLlmModel` returns `null`: log an audit warning (see Audit event section below), set `requirementsFallback = true`, and continue to Step 4.

**Step 4 — Existing cascade (unchanged structure, with one conditional):**

```
4a. skillLlmModelId — always try (even after requirements failure)
4b. skillDefaultModel — always try
4c. convModel — only try if: no executionPolicy.requirements OR allowConversationOverride === true
4d. system default (first row or null)
```

When `requirementsFallback` is true, carry it forward in the returned result so the caller knows a fallback occurred.

**Mode semantics summary:**

| `mode` value | `hasRequirements` | Behavior |
|---|---|---|
| `"requirements"` | any | Always run requirements path; skip 4a/4b; only 4c/4d fallback |
| `"fixed"` | any | Skip requirements; run existing cascade from 4a |
| `"hybrid"` | any | Try `fixedModel` first; if unavailable, run requirements (step 3) |
| `undefined` | `true` | Auto-detect: run requirements (step 3), then full cascade as fallback |
| `undefined` | `false` | Skip requirements; run existing cascade unchanged |

Note: When `mode === "requirements"` and requirements fail, the cascade should still allow `skillLlmModelId` as a last-resort fallback (requirements mode skips _defaultModel_ as a fallback tier; `llmModelId` remains available as a safety net). Callers can rely on `requirementsFallback: true` to detect this situation.

### 4. Audit event

After resolution, emit an audit event using the existing `auditLogger` in the web app. The event shape:

```typescript
// After resolving, emit:
auditLogger.log({
  eventType: "model_selection_resolved",
  skillId: skill.dbId,
  selectedModel: result.modelId,
  modelSource: result.modelSource,
  requirementsFallback: result.requirementsFallback ?? false,
  // Emit at WARN level when requirementsFallback is true
});
```

Check the existing audit logging pattern in `skillExecutionPolicy.ts` or related service files before adding imports — use the established logger in the codebase rather than introducing a new dependency.

### 5. `resolveEnabledLlmModelIdFromRows` call updates

The existing cascade (Step 4) uses `resolveEnabledLlmModelIdFromRows` for each candidate. This function signature does not change. The rows passed to it now include the extended capability fields, but since the function only uses `modelId` for matching, this is backward compatible.

For the `conversationModel` conditional in Step 4c: build the `preferredIds` array conditionally:

```typescript
const allowConvOverride = skill.executionPolicy?.allowConversationOverride ?? false;
const useConvModel = !hasRequirements || allowConvOverride || requirementsFallback;
const preferredIds = [
  skillLlmModelId,
  skillDefaultModel,
  useConvModel ? convModel : undefined,
];
```

Then pass to `resolveEnabledLlmModelIdFromRows` as before, filtering out `undefined`.

---

## Type Alignment Note

The `SkillExecutionPolicyConfig.requirements` type in `packages/skills/src/types.ts` does not yet have `supportsVision`. Section 08 adds it. When implementing Section 04, reference `requirements` through the existing type; `supportsVision` will compile correctly once Section 08 is merged. If implementing Section 04 before Section 08, the requirements object will simply not have `supportsVision` as a typed key yet — the selector will ignore it at runtime (it will be `undefined`, treated as "not required").

---

## Definition of Done

- [ ] `SkillExecutionPolicyResult` has `matchedCapabilities?: string[]`, `requirementsFallback?: boolean`, and `modelSource` includes `"requirements_match"` and `"skill_fixedModel"`
- [ ] `selectBestLlmModel` is imported from `./intelligentModelSelector`
- [ ] Requirements cascade runs when `skill.executionPolicy.requirements` has at least one key
- [ ] `mode === "fixed"`: requirements skipped, existing cascade unchanged
- [ ] `mode === "hybrid"`: fixedModel tried first; falls back to requirements if unavailable
- [ ] `mode === "requirements"`: only requirements + 4c/4d fallback (no 4b)
- [ ] `mode === undefined`: auto-detect — requirements if declared, existing cascade otherwise
- [ ] `allowConversationOverride === false` (default): conversationModel NOT used when requirements active
- [ ] `allowConversationOverride === true`: conversationModel eligible when requirements fail
- [ ] `requirementsFallback: true` set when requirements found no match
- [ ] Audit warning logged when requirements find no match
- [ ] All existing tests in `skillExecutionPolicy.test.ts` pass without modification (no regressions)
- [ ] All new tests listed above pass
- [ ] `pnpm check` passes with no TypeScript errors