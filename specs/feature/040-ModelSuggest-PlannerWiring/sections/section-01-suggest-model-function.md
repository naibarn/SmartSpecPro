Now I have everything I need to write the section content.

# Section 01: Extract `suggestModel()` as Exported Function

## Overview

This section extracts the model-ranking logic from the inline HTTP handler in `modelSuggestTool.ts` into a standalone exported async function called `suggestModel()`. It also fixes the `priority ?? 0` default to `priority ?? 99` so that models without an explicit priority sort to the end rather than the beginning.

This is the **foundational step** for spec 040. Section 03 (handler audit/errors) and Section 05 (auto-draft wiring) both depend on the exported `suggestModel()` function created here.

**Parallelizable with:** Section 02 (verify-token-security)

---

## Files to Modify

- `apps/web/server/routers/modelSuggestTool.ts` — extract function, fix priority default
- `apps/web/server/routers/modelSuggestTool.test.ts` — add new test cases for `suggestModel()` directly

---

## Background

`modelSuggestTool.ts` (~103 lines) already exists with a working HTTP handler (`modelSuggestHandler`) and route registration (`registerModelSuggestToolRoute`). The ranking logic is currently inline inside `modelSuggestHandler` — it calls `getModelsByTypeAsync`, sorts models by `quality_preference`, picks the top result as `recommended`, and returns up to 3 `alternatives`.

The problem: nothing outside this file can call that logic. Section 05 needs `autoDraftTool.ts` to call the same ranking logic directly (no HTTP overhead) when the Python agent omits `image_model_id`. The fix is to extract the inline logic into an exported `suggestModel()` and have `modelSuggestHandler` delegate to it.

There is also a bug in the current sort: `priority ?? 0` puts models without a priority value at the top (sort position 0) instead of the bottom. The correct default is `?? 99` to make undeclared-priority models sort last, consistent with how `getDefaultModel()` in `modelRegistry.ts` works.

---

## Type Contracts

Define these interfaces at the top of `modelSuggestTool.ts` (they are local to this file; no shared type extraction needed yet):

```typescript
interface ModelEntry {
  model_id: string;
  name: string;
  provider: string;
  cost_tier: "low" | "medium" | "high";
  description: string;  // use m.description ?? "" as fallback
}

interface SuggestResult {
  recommended: ModelEntry | null;
  alternatives: ModelEntry[];
  message?: string;
}
```

---

## `suggestModel()` Function Specification

**Signature:**

```typescript
export async function suggestModel(
  purpose: "image" | "video" | "audio" | "text",
  quality_preference?: "speed" | "balanced" | "quality"
): Promise<SuggestResult>
```

**Behavior by purpose:**

- `"text"`: Return immediately `{ recommended: null, alternatives: [], message: "Text model selection is handled by the LLM router. Use the default model." }`. Do NOT call `getModelsByTypeAsync`.
- `"image" | "video" | "audio"`: Call `await getModelsByTypeAsync(purpose)`. If the returned list is empty, return `{ recommended: null, alternatives: [] }` (no error, no message — caller handles fallback).

**Sorting by `quality_preference`:**

- `"speed"`: Sort by `creditCost` ascending — cheapest model first.
- `"quality"` or `"balanced"` (the default when omitted): Sort by `priority ?? 99` ascending — lowest number (highest priority) first. Both "balanced" and "quality" produce identical sort order in this MVP; no weighted score yet.

**Building the result:**

After sorting, the first model is `recommended`. The next up to three models are `alternatives`. Each model is converted using `creditCostToTier()` — raw `creditCost` numbers must never appear in the returned `ModelEntry`. Use `m.description ?? ""` for description.

**Error handling:**

Wrap the body in a try-catch. If `getModelsByTypeAsync` throws, catch it, log internally (do not re-throw), and return `{ recommended: null, alternatives: [] }`. Auto-draft callers rely on this to degrade gracefully.

**Handler update:**

After extracting `suggestModel()`, update `modelSuggestHandler` to call `await suggestModel(purpose, quality_preference)` instead of containing the inline logic. The handler's auth/validation logic stays in the handler. The handler will gain try-catch and audit logging in Section 03 — do not add those here.

---

## Handler Cleanup Checklist

After `suggestModel()` is implemented and tested, **delete** the following inline blocks from `modelSuggestHandler`. These blocks are entirely moved into `suggestModel()`:

| Block | Lines (approximate) | What it does |
|---|---|---|
| `"text"` early-return | lines 47–56 | Returns null recommended for text purpose |
| Empty-list early-return | lines 58–69 | Returns null recommended when registry is empty |
| Sort + response build | lines 71–97 | Sorts by quality_preference, builds `recommended`/`alternatives` |

After deletion, the handler body (after auth and Zod parse) should only contain:

```typescript
const { purpose, quality_preference } = parseResult.data;
const result = await suggestModel(purpose, quality_preference);
res.json({ success: true, ...result });
```

(The try-catch and audit event are added in Section 03.)

**Verification:** After deletion, run existing handler tests — they must all still pass since `suggestModel()` produces identical output to the old inline logic.

---

## Priority Default Fix

In the current sort comparator, change:

```typescript
return (a.priority ?? 0) - (b.priority ?? 0);
```

to:

```typescript
return (a.priority ?? 99) - (b.priority ?? 99);
```

This applies inside `suggestModel()` (and only there — the inline handler logic is being replaced).

---

## Tests to Write First (TDD)

Add these test cases to the **existing** `modelSuggestTool.test.ts`. The file already has mocks for `getModelsByTypeAsync`, `contentAutomationGate`, and `ENV`. Add an import for `suggestModel` alongside the existing `modelSuggestHandler` import:

```typescript
import { modelSuggestHandler, creditCostToTier, suggestModel } from "./modelSuggestTool";
```

The existing `MOCK_MODELS` array has four models: `img-model-1` (creditCost 3, priority 1), `img-model-2` (creditCost 15, priority 2), `img-model-3` (creditCost 30, priority 3), `img-model-4` (creditCost 1, priority 4). Use this in the new tests.

Add a new `describe("suggestModel() standalone function")` block with the following test stubs:

```typescript
describe("suggestModel() standalone function", () => {
  // Sorting by quality_preference
  it("quality_preference='speed' returns cheapest model as recommended")
  // budget model (creditCost=1) should be recommended; verify model_id

  it("quality_preference='quality' returns lowest-priority-number model as recommended")
  // img-model-1 (priority=1) should be recommended

  it("quality_preference='balanced' produces same order as 'quality'")
  // same recommended.model_id as 'quality' test

  it("omitting quality_preference defaults to 'balanced' behaviour")
  // calling suggestModel("image") (no second arg) same result as "balanced"

  it("returns at most 3 alternatives even with 5+ models available")
  // mock 6 models; alternatives.length <= 3

  it("returns recommended: null when model list is empty")
  // mock empty array; result.recommended === null, no error thrown

  it("returns alternatives: [] when model list is empty")
  // result.alternatives deep equal []

  it("purpose='text' returns recommended: null with message, never calls getModelsByTypeAsync")
  // expect(getModelsByTypeAsync).not.toHaveBeenCalled()

  it("purpose='text' returns a non-empty message string")
  // result.message is truthy string

  it("model without priority field sorts after models with explicit priority (priority ?? 99)")
  // mock model with no priority; ensure it is last in alternatives

  it("getModelsByTypeAsync throwing returns { recommended: null, alternatives: [] } without re-throwing")
  // mock getModelsByTypeAsync to throw; await expect(suggestModel(...)).resolves.toEqual(...)

  it("response entries never contain raw creditCost field")
  // check recommended and each alternative: no 'creditCost' key
});
```

Write these tests first, confirm they fail, then implement `suggestModel()`.

---

## Verification

After implementation, run:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- modelSuggestTool
```

All existing tests (`modelSuggestHandler` describe blocks, `creditCostToTier` describe block) must continue to pass — the handler behavior is unchanged, only the internals are refactored to delegate to `suggestModel()`.

Also run:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check
```

TypeScript strict mode must pass with no new errors. Confirm `suggestModel` is callable from another file by checking the export is visible in the module signature.

---

## Definition of Done for This Section

- [x] `suggestModel()` is exported from `apps/web/server/routers/modelSuggestTool.ts`
- [x] `suggestModel("text", ...)` returns null recommended with message, never calls registry
- [x] `quality_preference="speed"` sorts by `creditCost` ascending
- [x] `quality_preference="quality"` and `"balanced"` sort by `priority ?? 99` ascending
- [x] Models without a `priority` field sort to the end (not the beginning)
- [x] `getModelsByTypeAsync` throwing returns `{ recommended: null, alternatives: [] }` without re-throwing
- [x] Raw `creditCost` values never appear in returned `ModelEntry` objects
- [x] `modelSuggestHandler` delegates to `suggestModel()` (inline logic removed)
- [x] All existing handler tests continue to pass
- [x] All new `suggestModel()` tests pass
- [ ] `pnpm check` passes with no TypeScript errors (verified in Section 04)

## Implementation Notes

**Actual files modified:**
- `apps/web/server/routers/modelSuggestTool.ts` — added `suggestModel()` export, `ModelEntry`/`SuggestResult` interfaces, `debugError` import for catch logging
- `apps/web/server/routers/modelSuggestTool.test.ts` — updated import, added 12 new `suggestModel()` tests

**Deviations from plan:**
- Added `import { debugError }` for catch block logging (plan said "log internally" but didn't specify mechanism)
- Fixed vacuous priority test to use 2-model fixture for deterministic assertions

**Test count:** 25 total (13 existing + 12 new), all passing