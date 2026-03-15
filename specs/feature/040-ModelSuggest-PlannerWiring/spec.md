# Spec 040 — Model-Suggest Endpoint + Auto-Draft Planner Wiring

## Problem Statement

Spec 039 (Task Planner Runtime Wiring) is fully implemented and wired into 15 entry points across
the system. However, two critical gaps remain:

1. **Model-Suggest Endpoint (Spec 035 Section 03) was never implemented.** The design exists in
   `specs/feature/035-AutoDraftContentAutomation/sections/section-03-model-suggest-tool.md` but no
   code was written. The Python Auto-Draft Agent has no way to ask "which LLM/image model should I
   use for this task?" before executing.

2. **Auto-Draft bypasses planner for image model selection.** `autoDraftTool.ts` accepts
   `image_model_id` directly from the agent without validation or recommendation from the planner.
   The agent must know which model to use in advance, making poor choices likely (wrong capability,
   excess cost).

## Background

### Spec 035 Section 03 — Model-Suggest Tool (Design Only)

The spec defines:
- `POST /api/internal/tools/model-suggest`
- Auth: Bearer gateway token + X-Internal-Token header (same pattern as browserTool.ts)
- Input: `{ purpose: "image"|"video"|"audio"|"text", userId, tenantId, quality_preference? }`
- Output: `{ recommended: { model_id, name, provider, cost_tier }, alternatives: [...] }`
- Gated by `contentAutomationGate` middleware (ENABLE_CONTENT_AUTOMATION flag)
- Ranking: priority ascending + quality_preference hint

### Spec 039 — Task Planner Runtime Wiring (Fully Implemented)

- `modelResolver.ts`: `resolveModelFromPlan()` — capability matching + strategy ranking
- `taskExecutionPlanner.ts`: `buildExecutionPlan()` — classifies task requirements
- `capabilityRegistry.ts`: `loadEnabledModelsWithPricing()` — fetches models from DB
- Wired into 15 entry points including aiPresentationService.ts (article generation)
- Feature flags: `taskPlannerEnabled` (F14), `taskPlannerAgencyEscalation` (F15)

### Current Auto-Draft Flow Gap

```
Python Agent → POST /api/internal/tools/auto-draft
  → autoDraftTool.ts (lines 207-225)
    → imageModel: input.image_model_id  ← agent provides blindly
    → generateAIDraft(draftInput)
      → callLLMStructured() → runPlanner() ✓  (article: planner wired)
      → mediaGenerationService           ✗  (images: no planner, no validation)
```

## Goals

1. Implement `/api/internal/tools/model-suggest` endpoint per spec-035 section-03
2. Wire model-suggest into `autoDraftTool.ts` as fallback when agent doesn't provide a model
3. Add telemetry: log agent-provided model vs. recommended model for divergence tracking
4. All new code follows existing patterns: auth middleware, Vitest tests, tRPC conventions

## Out of Scope

- Changing Spec 039 planner internals
- Unifying model-suggest algorithm with planner (future work if divergence > threshold)
- Adding model-suggest to non-auto-draft flows
- New feature flags (reuse ENABLE_CONTENT_AUTOMATION)

## Key Files

### To Create
- `apps/web/server/routers/modelSuggestTool.ts` — HTTP handler + Express router
- `apps/web/server/routers/modelSuggestTool.test.ts` — Vitest tests

### To Modify
- `apps/web/server/_core/index.ts` — Register new route (1 line import + call)
- `apps/web/server/routers/autoDraftTool.ts` — Add model-suggest fallback logic
- `apps/web/server/routers/autoDraftTool.test.ts` — Tests for fallback flow (if exists)

### Reference (Read-Only)
- `apps/web/server/routers/autoDraftTool.ts` — Current auto-draft implementation
- `apps/web/server/routers/liveBrowser.ts` or `browserTool.ts` — Auth middleware pattern
- `apps/web/server/services/tenantFeatureFlagService.ts` — contentAutomationGate source
- `apps/web/server/services/multiProviderService.ts` or similar — getModelsByTypeAsync source
- `specs/feature/035-AutoDraftContentAutomation/sections/section-03-model-suggest-tool.md`
- `specs/feature/039-Planner-Runtime-Wiring/spec.md`

## Acceptance Criteria

1. `POST /api/internal/tools/model-suggest` returns 200 with recommended model + up to 3 alternatives
2. Returns 401 if gateway token is invalid
3. Returns 403 if ENABLE_CONTENT_AUTOMATION is false
4. Returns 400 if `purpose` is not one of: image, video, audio, text
5. `autoDraftTool.ts`: if agent sends no `image_model_id`, system calls model-suggest and fills it in
6. `autoDraftTool.ts`: audit log includes `{ agentModel, recommendedModel, diverged: boolean }`
7. All new code has ≥80% test coverage (Vitest)
8. TypeScript strict mode passes (`pnpm check`)
