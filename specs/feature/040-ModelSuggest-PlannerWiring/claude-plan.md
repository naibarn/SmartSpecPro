# Implementation Plan: Spec 040 — Model-Suggest Endpoint + Auto-Draft Planner Wiring

## Overview

This plan covers two tightly related deliverables:

1. **Model-Suggest Core** — extract an exported `suggestModel()` ranking function and add audit logging to the existing (but incomplete) `modelSuggestTool.ts`. Fix the `verifyInternalToken` security issue. The file already has a handler and route registration; the plan describes what must change.

2. **Auto-Draft Wiring** — connect `suggestModel()` into `autoDraftTool.ts` so that when the Python Auto-Draft Agent doesn't specify an image model, the system picks the best one automatically. Add divergence audit logging.

The implementation is entirely within the Node.js/TypeScript web application (`apps/web/`). No Python backend changes, no database migrations, no new feature flags.

---

## Background: Why This Matters

Spec 039 (Task Planner Runtime Wiring) successfully added intelligent model selection for LLM calls, but left image generation untouched. The Auto-Draft tool generates presentation decks with AI-generated images. Currently, the Python agent must know in advance which image model to use. If it doesn't send a model ID, `generateAIDraft()` receives `undefined` — with no telemetry, no transparency, and no ability to influence the choice.

---

## Current State of `modelSuggestTool.ts`

The file already exists (~103 lines) and contains:
- ✅ `registerModelSuggestToolRoute(app)` — route registered in `_core/index.ts`
- ✅ `creditCostToTier(creditCost)` — categorical tier mapping
- ✅ `verifyInternalToken(req)` — BUT uses raw `Buffer.from()` comparison (security issue, see Section 1b)
- ✅ HTTP handler calling `getModelsByTypeAsync()` inline

**Missing:**
- ❌ `suggestModel()` is not exported — ranking logic is inline in the handler
- ❌ No audit logging
- ❌ `verifyInternalToken` uses unsafe length-leaking comparison
- ❌ No try-catch around `getModelsByTypeAsync` in handler
- ❌ `priority` default inconsistency (uses `?? 0` instead of `?? 99`)

The test file `modelSuggestTool.test.ts` also exists (~196 lines) but lacks tests for `quality_preference` sorting and audit logging.

---

## Section 1: Modify `modelSuggestTool.ts`

**File:** `apps/web/server/routers/modelSuggestTool.ts`

### 1a. Extract `suggestModel()` as Exported Standalone Function

Extract the ranking logic from the inline handler into a named, exported, async function. This is the function that `autoDraftTool.ts` will import directly (no HTTP overhead).

Function signature:

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

export async function suggestModel(
  purpose: "image" | "video" | "audio" | "text",
  quality_preference?: "speed" | "balanced" | "quality"
): Promise<SuggestResult>
```

**Behavior by purpose:**
- `"text"`: Return immediately `{ recommended: null, alternatives: [], message: "Text model selection is handled by the LLM router. Use the default model." }`. Do not call the model registry.
- `"image" | "video" | "audio"`: Call `await getModelsByTypeAsync(purpose)` to get fresh enabled models. If the list is empty, return `{ recommended: null, alternatives: [] }` with no error (caller falls back).

**Sorting by `quality_preference`:**
- `"speed"`: Sort by `creditCost` ascending (cheapest first)
- `"quality"` or `"balanced"` (default): Sort by `priority ?? 99` ascending (lower number = higher quality)

Note: "balanced" and "quality" produce identical sort order in this implementation — intentional MVP simplification. Future work can introduce a weighted cost/quality score if divergence data warrants it.

After sorting, the first model is `recommended`. Up to three subsequent models are `alternatives`. Convert each model's `creditCost` to `cost_tier` using `creditCostToTier()`. Raw numeric cost values must never appear in the output.

The function must be wrapped in try-catch: if `getModelsByTypeAsync` throws, catch and return `{ recommended: null, alternatives: [] }` with an internal log but no thrown error.

### 1b. Fix `verifyInternalToken()` Security Issue

The existing implementation uses `crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))` which throws `RangeError` when lengths differ, leaking the length of the expected token via timing.

Replace with SHA-256 hashing of both values before comparison:

```typescript
function verifyInternalToken(req: Request): boolean {
  // signature only — implementation hashes both token and expected with sha256
  // before timingSafeEqual to ensure equal buffer lengths and prevent timing oracle
}
```

Both `token` and `expected` are hashed with `createHash("sha256").update(...).digest()` before passing to `timingSafeEqual`. This ensures equal-length buffers regardless of input length.

### 1c. Add Audit Logging to HTTP Handler

After a successful model suggestion, the handler emits a `model_suggest_response` audit event:

```typescript
auditLogger.log({
  eventType: "model_suggest_response",
  traceId: getTraceId(),
  userId,
  metadata: {
    tenantId,
    purpose,
    recommendedModelId: result.recommended?.model_id ?? null,
    alternativeCount: result.alternatives.length,
  },
});
```

### 1d. Add try-catch in HTTP Handler

Wrap the `await suggestModel(...)` call in the HTTP handler with a try-catch. On error, return a sanitized 500 response (strip URLs from error message, truncate to 200 chars) matching the pattern in `autoDraftTool.ts` lines 271-272.

### 1e. Standardize `priority` Default to `99`

Change any `priority ?? 0` usage to `priority ?? 99` so that models without a priority value sort to the end (last choice) rather than the beginning. This aligns with `modelRegistry.ts` `getDefaultModel` behavior.

---

## Section 2: Route Registration

**File:** `apps/web/server/_core/index.ts`

No changes needed — the route is already registered. Verify the import and call are present:
- Import: `import { registerModelSuggestToolRoute } from "../routers/modelSuggestTool"`
- Call: `registerModelSuggestToolRoute(app)` near `registerAutoDraftToolRoute(app)`

---

## Section 3: Auto-Draft Wiring

**File:** `apps/web/server/routers/autoDraftTool.ts`

### 3a. Import Addition

Add one import at the top: `import { suggestModel } from "./modelSuggestTool"` alongside existing imports from `modelRegistry`.

### 3b. Fallback Logic (with `await`)

After the Zod schema parse succeeds and before `generateAIDraft()` is called, insert model selection logic. The existing code passes `imageModel: input.image_model_id` to `generateAIDraft`. Replace with:

1. Declare `imageModel: string | undefined` and `recommendedModel: string | undefined`.
2. If `input.image_model_id` is present, set `imageModel = input.image_model_id`. Do not call `suggestModel`.
3. If `input.image_model_id` is absent, call `await suggestModel("image", "balanced")` inside a try-catch. On success, use `result.recommended?.model_id`. If `suggestModel` throws or returns null recommended, fall back to `getDefaultModel("image")?.id`.

**Auto-draft must always complete** — a failing model suggestion must never block deck generation.

### 3c. Divergence Audit Log

After the model selection logic (regardless of path), emit exactly one audit event of type `"auto_draft.model_selected"`:

```typescript
auditLogger.log({
  eventType: "auto_draft.model_selected",
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

`diverged` is `true` only when the agent provided a model AND it differs from the recommendation. When the agent didn't provide a model (we made the choice), `diverged` is always `false`.

### 3d. Pass Resolved Model to generateAIDraft

Replace `imageModel: input.image_model_id` in the `generateAIDraft` input object with the resolved `imageModel` variable.

---

## Section 4: Tests

### 4a. Add to Existing `modelSuggestTool.test.ts`

The file already exists with ~196 lines of passing tests. Add the following test cases (do not recreate existing mocks/factories — extend them):

**For `suggestModel()` directly (not via HTTP handler):**
- `quality_preference="speed"` sorts by `creditCost` ascending (cheapest model is recommended)
- `quality_preference="quality"` sorts by `priority` ascending (lowest priority number is recommended)
- `quality_preference="balanced"` produces same result as `"quality"` (default behavior)
- Empty model list returns `{ recommended: null, alternatives: [] }` without throwing
- `purpose="text"` returns null recommended with message, never calls `getModelsByTypeAsync`

**For HTTP handler:**
- Audit event `model_suggest_response` is emitted on successful response
- `getModelsByTypeAsync` throwing returns 500 with sanitized message (no connection strings)

**For `verifyInternalToken` (after SHA-256 fix):**
- Tokens of different lengths are rejected (verify no `RangeError` thrown)

### 4b. Add to Existing `autoDraftTool.test.ts`

Add a new describe block for model selection fallback:
- When `image_model_id` is absent: `suggestModel` is called with `"image"` and `"balanced"`, result is used
- When `image_model_id` is present: `suggestModel` is NOT called, agent's model is used
- When `suggestModel` throws: auto-draft still completes with `getDefaultModel` fallback
- Audit event `auto_draft.model_selected` is emitted with `diverged: false` when agent omits model
- Audit event `auto_draft.model_selected` is emitted with `diverged: true` when agent's model differs from recommended
- Audit event `auto_draft.model_selected` is emitted with `diverged: false` when agent's model matches recommended

---

## Data Flow

```
Python Agent (no image_model_id)
  │
  ▼
autoDraftTool.ts handler
  ├─ input.image_model_id absent
  │     └─ await suggestModel("image", "balanced")
  │               │
  │               ▼
  │         getModelsByTypeAsync("image")   ← DB (5-min cache)
  │               │
  │         sort by priority ASC
  │               │
  │         return { recommended: { model_id: "flux-2.0", cost_tier: "low" }, ... }
  │
  ├─ imageModel = "flux-2.0"
  ├─ recommendedModel = "flux-2.0"
  ├─ auditLogger: auto_draft.model_selected { agentModel: null, recommendedModel: "flux-2.0", diverged: false }
  └─ generateAIDraft({ ..., imageModel: "flux-2.0" })

Python Agent (explicit image_model_id: "grok-imagine")
  │
  ▼
autoDraftTool.ts handler
  ├─ input.image_model_id = "grok-imagine"
  ├─ imageModel = "grok-imagine"
  ├─ recommendedModel = undefined (suggestModel NOT called)
  ├─ auditLogger: auto_draft.model_selected { agentModel: "grok-imagine", recommendedModel: null, diverged: false }
  └─ generateAIDraft({ ..., imageModel: "grok-imagine" })

Python Agent (direct call)
  │
  │ POST /api/internal/tools/model-suggest
  │ X-Internal-Token: <token>
  │ { "purpose": "image", "userId": 42, "tenantId": "acme" }
  ▼
modelSuggestTool.ts handler
  ├─ contentAutomationGate (503 if flag off)
  ├─ verifyInternalToken SHA-256 (401 if wrong)
  ├─ Zod validate (400 if invalid)
  └─ await suggestModel("image", "balanced")
       └─ 200: { success: true, recommended: {...}, alternatives: [...] }
```

---

## Implementation Order

1. **Section 1** — Modify `modelSuggestTool.ts`: extract `suggestModel()`, fix `verifyInternalToken`, add audit logging, add try-catch, fix priority default
2. **Section 4a** — Add tests to `modelSuggestTool.test.ts` (run to confirm they pass)
3. **Section 2** — Verify route registration in `_core/index.ts` (likely no-op)
4. **Section 3** — Modify `autoDraftTool.ts`: add import, fallback logic, divergence audit log
5. **Section 4b** — Add tests to `autoDraftTool.test.ts` (run to confirm they pass)
6. Run `pnpm check` (TypeScript strict mode) — confirm no errors

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `suggestModel` export breaks HTTP handler's inline logic | Medium | Low | Extract carefully — tests cover both paths |
| `timingSafeEqual` SHA-256 fix changes auth behavior | Low | Medium | Existing tests verify correct token still works |
| `await suggestModel()` in autoDraftTool adds latency | Low | Low | Registry has 5-min cache; typical call <10ms |
| `priority ?? 99` change reorders model recommendations | Medium | Low | Only affects models without explicit priority in DB |
| `ModelSuggestRequestSchema` not in shared types | Medium | Low | Define inline in file; extract to shared later |

---

## Definition of Done

- [ ] `suggestModel()` is exported from `modelSuggestTool.ts` and testable in isolation
- [ ] `verifyInternalToken()` uses SHA-256 hashing before `timingSafeEqual` (no length oracle)
- [ ] `model_suggest_response` audit event emitted on successful HTTP response
- [ ] HTTP handler has try-catch with sanitized error response
- [ ] `priority ?? 99` used consistently for models without priority
- [ ] Route registration confirmed in `_core/index.ts`
- [ ] `autoDraftTool.ts`: calls `await suggestModel()` fallback when `image_model_id` absent
- [ ] `autoDraftTool.ts`: uses agent's model when `image_model_id` present (no override)
- [ ] `auto_draft.model_selected` audit event emitted with correct `diverged` field
- [ ] Auto-draft completes even when `suggestModel()` throws
- [ ] All new/modified tests pass (`pnpm test`)
- [ ] TypeScript strict mode passes (`pnpm check`)
- [ ] Raw `creditCost` values never appear in any response body
