# Feature 040: ModelSuggest-PlannerWiring — Implementation Summary

## What Was Built

### Section 01 (pre-existing): suggestModel() exported function
- `apps/web/server/routers/modelSuggestTool.ts` — `suggestModel(purpose, quality_preference)` exported
- Three-tier model selection: by priority (quality/balanced) or creditCost (speed)

### Section 02 (pre-existing): SHA-256 token verification
- `verifyInternalToken` in `modelSuggestTool.ts` uses SHA-256 hashing to prevent length oracle attacks

### Section 03: Handler audit logging + error handling
- `AuditEventType` extended with `"model_suggest_response"` and `"auto_draft.model_selected"`
- `modelSuggestHandler` wraps `suggestModel()` in try-catch safety net (sanitizes all URI schemes, max 200 chars)
- Emits audit event on every successful response: `{ traceId, userId, tenantId, purpose, recommendedModelId, alternativeCount }`
- No audit event on 401/400 early-return paths

### Section 04: Route registration verified
- `registerModelSuggestToolRoute` import and call confirmed in `_core/index.ts` (lines 23, 412) — no changes needed

### Section 05: Auto-draft model selection wiring
- `autoDraftTool.ts` now calls `suggestModel("image", "balanced")` when Python agent omits `image_model_id`
- Three-tier fallback: agent-specified → suggestModel → getDefaultModel("image")
- `suggestModel` errors caught — auto-draft always completes
- Emits `auto_draft.model_selected` audit event with: `{ agentModel, recommendedModel, imageModelUsed, diverged }`
- `diverged=false` when agent omits model; `diverged=true` only when agent provided AND it differs from recommendation

## Commits

| Section | Commit | Description |
|---------|--------|-------------|
| 01 | `214a8ad3` | suggestModel() exported (pre-existing) |
| 02 | `b25e69fc` | SHA-256 token verification (pre-existing) |
| 03 | `be359a99` | Handler audit logging and error handling |
| 04 | `bb9070c2` | Route registration verification |
| 05 | `4541f9cf` | Auto-draft model selection wiring |

## Test Coverage

- `modelSuggestTool.test.ts`: 35 tests pass, 3 todo
- `autoDraftTool.test.ts`: 34 tests pass

## Key Files

- `apps/web/server/routers/modelSuggestTool.ts` — model suggestion handler + audit
- `apps/web/server/routers/autoDraftTool.ts` — auto-draft handler with model wiring
- `apps/web/server/services/auditLogger.ts` — extended AuditEventType union
