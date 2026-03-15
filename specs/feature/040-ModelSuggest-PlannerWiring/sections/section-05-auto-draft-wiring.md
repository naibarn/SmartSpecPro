# Section 05: Auto-Draft Wiring

## Overview

Connect `suggestModel()` (exported in Section 01) into `autoDraftTool.ts`. When the Python agent omits `image_model_id`, the handler calls `await suggestModel("image", "balanced")` automatically. A three-tier fallback (agent → suggest → getDefaultModel) ensures auto-draft always completes. A divergence audit event is emitted on every request.

**Dependency:** Section 01 (`suggestModel()` exported) must be complete before this section.

## Files to Modify

- `apps/web/server/routers/autoDraftTool.ts` — add import, model resolution logic, divergence audit event
- `apps/web/server/routers/autoDraftTool.test.ts` — add new describe block for model selection

## Background

`autoDraftTool.ts` currently has at line 212:

```typescript
imageModel: input.image_model_id,
```

This passes the agent's value (possibly `undefined`) directly to `generateAIDraft()`. This section replaces that single line with a resolved variable `imageModel` that goes through the fallback chain.

Also, `AuditEventType` must already include `"auto_draft.model_selected"` — added in Section 03 Step 1.

## Step 1: Add Imports

At the top of `autoDraftTool.ts`, add (check for duplicates first):

```typescript
import { suggestModel } from "./modelSuggestTool";
import { getDefaultModel } from "../services/modelRegistry";
```

`getDefaultModel` signature (in `modelRegistry.ts`):
```typescript
export function getDefaultModel(type: MediaType): ModelDefinition | undefined
```

## Step 2: Insert Model Resolution Logic

Locate the block where `draftInput` is built (around line 204, after Zod parse and rate limit check). **Before** the `draftInput` object construction, insert:

```typescript
// Resolve image model: agent-specified → suggested → default
let imageModel: string | undefined = input.image_model_id;
let recommendedModel: string | undefined;

if (!input.image_model_id) {
  try {
    const suggestResult = await suggestModel("image", "balanced");
    recommendedModel = suggestResult.recommended?.model_id;
    imageModel = recommendedModel ?? getDefaultModel("image")?.id;
  } catch {
    imageModel = getDefaultModel("image")?.id;
  }
}
```

**Key invariant:** The try-catch ensures auto-draft never blocks for a failing suggestion. If `suggestModel` throws, `imageModel` falls back to `getDefaultModel("image")?.id`.

## Step 3: Emit Divergence Audit Event

After the model resolution block (before `draftInput` construction), emit:

```typescript
auditLogger.log({
  eventType: "auto_draft.model_selected" as AuditEventType,
  userId,
  metadata: {
    tenantId,
    agentModel: input.image_model_id ?? null,
    recommendedModel: recommendedModel ?? null,
    imageModelUsed: imageModel ?? null,
    diverged: !!input.image_model_id && input.image_model_id !== recommendedModel,
  },
});
```

**Variable source:** `userId` and `tenantId` are **existing local variables already in scope** from `autoDraftTool.ts` lines 64–65. They are extracted earlier in the handler via an unsafe `req.body` cast. Do NOT use `input.userId` or `input.tenantId` — these fields do not exist on the `AutoDraftInput` schema. The correct variable names are `userId` (number) and `tenantId` (string), already declared before the model resolution block.

`diverged` semantics:
- `false` when agent omitted `image_model_id` (system chose — no divergence possible)
- `true` when agent provided a model AND it differs from `recommendedModel`
- `false` when agent's model matches the recommendation

Note: When agent provides `image_model_id`, we do NOT call `suggestModel` (per user decision — agent knows context). So `recommendedModel` remains `undefined` → `null` in the audit log, and `diverged` is `false` (not `true`) because `recommendedModel` was never computed.

## Step 4: Use Resolved imageModel in draftInput

In the `draftInput` object, change:
```typescript
imageModel: input.image_model_id,
```
to:
```typescript
imageModel,
```

Confirm that `generateAIDraft()`'s `imageModel` parameter accepts `string | undefined`. If it requires `string`, wrap: `imageModel: imageModel ?? undefined`.

Run `pnpm check` immediately after this change to catch type narrowing issues.

## Tests (Write First — TDD)

Add vi.mock entries at the top of `autoDraftTool.test.ts` (BEFORE imports):

```typescript
vi.mock("./modelSuggestTool", () => ({
  suggestModel: vi.fn(),
}));

// IMPORTANT: The existing vi.mock("../services/modelRegistry") at lines 8-10 mocks
// only getModelsByTypeAsync. You MUST extend it to also include getDefaultModel:
vi.mock("../services/modelRegistry", () => ({
  getModelsByTypeAsync: vi.fn(),
  getDefaultModel: vi.fn(),  // ← ADD THIS — required for fallback tests
}));
```

If there is an existing `vi.mock("../services/modelRegistry", ...)` call, **replace** it entirely with the version above. Do NOT add a second `vi.mock` call for the same module (Vitest only applies the last one).

Add imports:
```typescript
import { suggestModel } from "./modelSuggestTool";
import { getDefaultModel } from "../services/modelRegistry";
```

Add a new describe block after the existing `describe("autoDraftTool handler")` block:

```typescript
describe("autoDraftTool model selection", () => {
  beforeEach(() => {
    // default: suggestModel resolves with a recommendation
    vi.mocked(suggestModel).mockResolvedValue({
      recommended: { model_id: "flux-2.0", name: "Flux", provider: "fal", cost_tier: "low", description: "" },
      alternatives: [],
    });
    vi.mocked(getDefaultModel).mockReturnValue({ id: "default-img-model" } as never);
  });

  // Fallback logic
  it("calls suggestModel when image_model_id is absent")
  // setup: buildMockRequest({ image_model_id: undefined })
  // verify: vi.mocked(suggestModel).toHaveBeenCalledWith("image", "balanced")

  it("uses recommended model_id from suggestModel when image_model_id is absent")
  // verify: vi.mocked(generateAIDraft) called with imageModel: "flux-2.0"

  it("does NOT call suggestModel when image_model_id is present")
  // setup: buildMockRequest({ image_model_id: "grok-imagine" })
  // verify: vi.mocked(suggestModel).not.toHaveBeenCalled()

  it("uses agent's model unchanged when image_model_id is present")
  // verify: vi.mocked(generateAIDraft) called with imageModel: "grok-imagine"

  it("auto-draft completes when suggestModel throws — no error returned to caller")
  // setup: vi.mocked(suggestModel).mockRejectedValue(new Error("Registry down"))
  // verify: res.json called with success:true (deck generated)

  it("uses getDefaultModel fallback when suggestModel throws")
  // setup: suggestModel throws
  // verify: vi.mocked(generateAIDraft) called with imageModel: "default-img-model"

  it("uses getDefaultModel fallback when suggestModel returns null recommended")
  // setup: vi.mocked(suggestModel).mockResolvedValue({ recommended: null, alternatives: [] })
  // verify: vi.mocked(generateAIDraft) called with imageModel: "default-img-model"

  // Divergence audit log
  it("emits auto_draft.model_selected event when agent omits image_model_id")
  // verify: vi.mocked(auditLogger.log) has call with eventType: "auto_draft.model_selected"

  it("diverged=false when agent omits image_model_id")
  // verify: metadata.diverged === false (we made the choice, nothing to diverge from)

  it("emits auto_draft.model_selected event when agent provides image_model_id")
  // setup: image_model_id: "grok-imagine"
  // verify: auditLogger.log called with eventType: "auto_draft.model_selected"

  it("diverged=false when agent model matches recommendedModel")
  // not applicable here since suggestModel not called when agent provides model
  // diverged is always false when agent provides — recommendedModel is undefined

  it("audit event contains { agentModel, recommendedModel, imageModelUsed, diverged }")
  // verify metadata shape on a successful suggestion case
  // agentModel: null, recommendedModel: "flux-2.0", imageModelUsed: "flux-2.0", diverged: false
});
```

## Data Flow Reference

```
Agent omits image_model_id:
  autoDraftTool → await suggestModel("image", "balanced")
  → recommended: { model_id: "flux-2.0" }
  → imageModel = "flux-2.0"
  → audit: { agentModel: null, recommendedModel: "flux-2.0", diverged: false }
  → generateAIDraft({ imageModel: "flux-2.0" })

Agent provides image_model_id: "grok-imagine":
  autoDraftTool → skips suggestModel
  → imageModel = "grok-imagine", recommendedModel = undefined
  → audit: { agentModel: "grok-imagine", recommendedModel: null, diverged: false }
  → generateAIDraft({ imageModel: "grok-imagine" })

suggestModel throws:
  autoDraftTool catches → imageModel = getDefaultModel("image").id
  → generateAIDraft called anyway — draft completes
```

## Verification

```bash
cd apps/web && pnpm test -- autoDraftTool
cd apps/web && pnpm check
```

## Definition of Done

- [x] `suggestModel` imported from `./modelSuggestTool`
- [x] `getDefaultModel` imported from `../services/modelRegistry`
- [x] Model resolution block inserted before `draftInput` construction
- [x] `imageModel` (resolved variable) used in `draftInput` (not `input.image_model_id`)
- [x] `auto_draft.model_selected` audit event emitted on every code path
- [x] `diverged` field: false when agent omits model, false when agent provides model (recommendedModel not computed), true only when both provided and differ
- [x] `suggestModel` error caught; auto-draft continues with `getDefaultModel` fallback
- [x] 12 new model selection tests in `autoDraftTool.test.ts` (34 total, all pass)
- [x] TypeScript: no new errors introduced

## Implementation Notes

- **`diverged` fix**: Required guard `recommendedModel !== undefined` to prevent false positives when agent provides model (suggestModel not called)
- **Mock isolation**: suggestModel/getDefaultModel mocks in scoped `beforeEach` inside `describe("autoDraftTool model selection")` only
- **Test added**: `diverged=false` assertion for agent-provided model path with full metadata shape

## Files Modified

- `apps/web/server/routers/autoDraftTool.ts` — imports, model resolution block, audit event, draftInput update
- `apps/web/server/routers/autoDraftTool.test.ts` — vi.mock for modelSuggestTool + modelRegistry, 12 new tests
