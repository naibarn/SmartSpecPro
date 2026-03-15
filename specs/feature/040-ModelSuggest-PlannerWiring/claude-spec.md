# Spec 040 — Model-Suggest Endpoint + Auto-Draft Planner Wiring (Consolidated)

## Problem Statement

Spec 039 (Task Planner Runtime Wiring) is fully implemented and wired into 15 entry points. However two critical gaps remain:

1. **Model-Suggest (Spec 035 §03) was never implemented.** The Python Auto-Draft Agent has no way to ask "which image/video/audio model should I use?" — it must hardcode or guess. No code exists at `POST /api/internal/tools/model-suggest`.

2. **autoDraftTool.ts accepts image_model_id blindly.** No validation, no fallback, no recommendation. When the agent doesn't send a model ID the behavior is undefined (falls through to whatever `generateAIDraft` defaults to).

## Solution Architecture

### Core Design Decision: Shared Function + HTTP Wrapper

```
┌────────────────────────────────────────────────────┐
│  modelSuggestTool.ts                               │
│                                                    │
│  export function suggestModel(               ←──┐  │
│    purpose, quality_preference               │  │  │
│  ): SuggestResult                            │  │  │
│                                              │  │  │
│  HTTP handler (wrapper):                     │  │  │
│    POST /api/internal/tools/model-suggest ───┘  │  │
│    (auth + gate + schema → calls suggestModel)  │  │
└────────────────────────────────────────────────┘
                                                  │
                                                  │ direct import
                                                  ▼
┌────────────────────────────────────────────────────┐
│  autoDraftTool.ts (modified)                       │
│                                                    │
│  if (!input.image_model_id) {                      │
│    const r = suggestModel("image", "balanced");    │
│    imageModel = r.recommended?.model_id            │
│               ?? getDefaultModel("image")?.id;     │
│  }                                                 │
│                                                    │
│  auditLogger.log("auto_draft.model_selected", {    │
│    agentModel: input.image_model_id ?? null,       │
│    recommendedModel: r?.recommended?.model_id,     │
│    diverged: agentModel !== recommendedModel,      │
│  });                                               │
└────────────────────────────────────────────────────┘
```

### Model Ranking Algorithm

```typescript
function suggestModel(purpose, quality_preference): SuggestResult {
  const models = await getModelsByTypeAsync(purpose);  // fresh from DB
  if (models.length === 0) return { recommended: null, alternatives: [] };

  // Sort based on preference
  const sorted = [...models].sort((a, b) => {
    if (quality_preference === "speed") return a.creditCost - b.creditCost;
    return (a.priority ?? 99) - (b.priority ?? 99);  // quality + balanced
  });

  const [top, ...rest] = sorted;
  return {
    recommended: toEntry(top),
    alternatives: rest.slice(0, 3).map(toEntry),
  };
}

// creditCost → categorical tier (never expose raw number)
function creditCostToTier(c): "low" | "medium" | "high" {
  if (c <= 5) return "low";
  if (c <= 20) return "medium";
  return "high";
}
```

### HTTP Endpoint Contract

```
POST /api/internal/tools/model-suggest
X-Internal-Token: <SMARTSPEC_WEB_GATEWAY_TOKEN>
Content-Type: application/json

{
  "purpose": "image" | "video" | "audio" | "text",
  "quality_preference"?: "speed" | "balanced" | "quality",  // default: "balanced"
  "userId": number,
  "tenantId": string
}

→ 200: {
  "success": true,
  "recommended": { model_id, name, provider, cost_tier } | null,
  "alternatives": [...],  // max 3
  "message"?: string      // present when recommended is null
}

→ 401: { success: false, error: "Unauthorized" }           // bad token
→ 400: { success: false, error: "...", details: {...} }    // bad body
→ 503: { error: "Content automation is not enabled" }      // feature flag off
```

**purpose: "text"** always returns `{ recommended: null, alternatives: [], message: "Text model selection is handled by the LLM router" }`.

**Auth:** `X-Internal-Token` header + `crypto.timingSafeEqual()` (hash both sides first).

**Gate:** `contentAutomationGate` middleware (ENABLE_CONTENT_AUTOMATION flag).

**No rate limiting** — read-only endpoint.

### autoDraftTool.ts Changes

1. Import `suggestModel` from `./modelSuggestTool`
2. After schema parse, before `generateAIDraft`:
   ```typescript
   let imageModel = input.image_model_id ?? undefined;
   let recommendedModel: string | undefined;

   if (!imageModel) {
     const suggestion = await suggestModel("image", "balanced");  // async — must await
     recommendedModel = suggestion.recommended?.model_id;
     imageModel = recommendedModel ?? getDefaultModel("image")?.id;
   }

   auditLogger.log({
     eventType: "auto_draft.model_selected",
     userId,
     metadata: {
       tenantId,
       agentModel: input.image_model_id ?? null,
       recommendedModel: recommendedModel ?? null,
       imageModelUsed: imageModel,
       diverged: !!input.image_model_id && input.image_model_id !== recommendedModel,
     },
   });
   ```
3. Pass `imageModel` to `generateAIDraft()`

**Key invariant:** Auto-draft MUST complete even if suggestModel fails (wrap in try-catch, fallback to `getDefaultModel("image")`).

### Divergence Behavior

| Situation | Action |
|---|---|
| Agent sends `image_model_id` | Use agent's model. Log comparison with recommended. `diverged: true` if different. |
| Agent sends nothing | Call `suggestModel("image", "balanced")`. Use recommended. `diverged: false`. |
| suggestModel returns null | Fallback to `getDefaultModel("image")`. |
| suggestModel throws | Catch error, fallback to `getDefaultModel("image")`. Log error. |

## Files to Create

### `apps/web/server/routers/modelSuggestTool.ts`

Exports:
- `suggestModel(purpose, quality_preference?)` — pure ranking function (testable, importable)
- `creditCostToTier(creditCost)` — pure mapping function
- `modelSuggestToolHandler(req, res)` — HTTP handler
- `registerModelSuggestToolRoute(app)` — Express route registration

### `apps/web/server/routers/modelSuggestTool.test.ts`

Vitest tests covering all acceptance criteria (see below).

## Files to Modify

### `apps/web/server/routers/autoDraftTool.ts`

- Import `suggestModel` from `./modelSuggestTool`
- Add fallback logic after Zod parse
- Add `auto_draft.model_selected` audit log event

### `apps/web/server/_core/index.ts`

- Add 1 import line: `import { registerModelSuggestToolRoute } from "../routers/modelSuggestTool"`
- Add 1 call line: `registerModelSuggestToolRoute(app)` (near `registerAutoDraftToolRoute(app)`)

## Acceptance Criteria

1. `POST /api/internal/tools/model-suggest` returns 200 with recommended + ≤3 alternatives for purpose=image/video/audio
2. Returns 401 when `X-Internal-Token` is missing or wrong
3. Returns 503 when `ENABLE_CONTENT_AUTOMATION` is false
4. Returns 400 when `purpose` is invalid or `userId` is missing
5. Returns `recommended: null` with message when `purpose = "text"`
6. Returns `recommended: null, alternatives: []` when no models are enabled (200, not error)
7. Response NEVER contains raw `creditCost` — only categorical `cost_tier`
8. `autoDraftTool.ts`: if agent sends no `image_model_id`, system uses `suggestModel()` result
9. `autoDraftTool.ts`: if agent sends `image_model_id`, that model is always used (not overridden)
10. `auto_draft.model_selected` audit event logged with `{ agentModel, recommendedModel, imageModelUsed, diverged }`
11. Auto-draft completes even if `suggestModel()` throws (try-catch + getDefaultModel fallback)
12. All new code ≥80% Vitest coverage
13. TypeScript strict mode passes (`pnpm check`)

## Out of Scope

- Changing Spec 039 planner internals
- Unifying model-suggest algorithm with planner
- Applying model-suggest to non-auto-draft flows
- New feature flags (reuse ENABLE_CONTENT_AUTOMATION)
- Per-slide model selection
- DB storage of divergence (JSONL audit log only)
- Circuit breaker (direct import, no HTTP overhead)
