<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npx vitest run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-schema
section-02-provider-health
section-03-cost-tracker
section-04-llm-router
section-05-credit-service
section-06-llm-routes
section-07-refactor-consolidation
section-08-trpc-endpoints
section-09-frontend-model-selector
section-10-frontend-fallback-ui
section-11-admin-page
section-12-seed-data
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-schema | - | all others | Yes |
| section-02-provider-health | 01 | 04, 06 | Yes |
| section-03-cost-tracker | 01 | 06 | Yes |
| section-04-llm-router | 01, 02 | 06, 07 | No |
| section-05-credit-service | 01 | 06 | Yes |
| section-06-llm-routes | 01, 02, 03, 04, 05 | 09, 10 | No |
| section-07-refactor-consolidation | 04 | - | Yes |
| section-08-trpc-endpoints | 01, 03 | 09, 10, 11 | Yes |
| section-09-frontend-model-selector | 08 | - | Yes |
| section-10-frontend-fallback-ui | 06, 08 | - | Yes |
| section-11-admin-page | 08 | - | Yes |
| section-12-seed-data | 01 | - | Yes |

## Execution Order

1. **Batch 1**: section-01-schema (no dependencies)
2. **Batch 2**: section-02-provider-health, section-03-cost-tracker, section-05-credit-service, section-12-seed-data (parallel after 01)
3. **Batch 3**: section-04-llm-router, section-07-refactor-consolidation, section-08-trpc-endpoints (after batch 2)
4. **Batch 4**: section-06-llm-routes (after 02, 03, 04, 05)
5. **Batch 5**: section-09-frontend-model-selector, section-10-frontend-fallback-ui, section-11-admin-page (parallel after 06, 08)

## Section Summaries

### section-01-schema
Database schema changes: extend `llm_providers` table, add `model_provider_map`, `provider_usage_log`, `routing_rules` tables. Drizzle ORM schema definitions and migration generation. Includes indexes and constraints.

### section-02-provider-health
In-memory circuit breaker service (`providerHealth.ts`). Health state transitions (healthy/degraded/down), cooldown logic, startup seeding from DB, periodic persistence to `llm_providers.healthStatus`.

### section-03-cost-tracker
Usage logging service (`costTracker.ts`). Insert per-request logs into `provider_usage_log`, cost calculation priority (provider-reported > model map > default), admin and user dashboard aggregation queries.

### section-04-llm-router
Core routing service (`llmRouter.ts`). Provider resolution with routing rules (cost/quality/priority modes), `executeWithFallback()` returning discriminated union result type, streaming buffer with first-chunk timeout, pre-stream transparent fallback.

### section-05-credit-service
Update `creditService.ts` for free model handling (0 credits), dynamic pricing from `model_provider_map` replacing hardcoded `MODEL_PRICING`, backward-compatible fallback to hardcoded table.

### section-06-llm-routes
Decompose `proxyChatWithCredits()` in `llmRoutes.ts`. Thin HTTP handlers delegating to llmRouter, SSE `event: fallback_required` for tier crossing, `costTracker.logRequest()` integration, brainstorm mode routing.

### section-07-refactor-consolidation
Replace duplicated `getActiveLlmProvider()` in `skills.ts`, `translation.ts`, `scheduler.ts` with shared `llmRouter.resolveProviders()`. Delete dead code (`llm.ts`, `openaiCompatGateway.ts`).

### section-08-trpc-endpoints
New tRPC procedures in `llmProviders.ts`: model mapping CRUD, routing rule CRUD, provider health query, admin/user usage stats, `getAvailableModelsWithProviders`.

### section-09-frontend-model-selector
Update model selector in `ChatView.tsx`: provider badges, "FREE" indicators, cost-per-1K-tokens display, provider override selection, store provider alongside model in conversation state.

### section-10-frontend-fallback-ui
Fallback consent banner: parse `event: fallback_required` SSE, inline banner with "Switch"/"Cancel" buttons, re-send with `preferredProvider` on consent.

### section-11-admin-page
Update `AdminLLMProviders.tsx`: health status indicators, model mapping CRUD tab, routing rules tab, usage dashboard with date range picker and charts.

### section-12-seed-data
Idempotent seed script/migration for OpenCode Zen provider and 3 free model mappings (Kimi K2.5, MiniMax M2.1, GLM 4.7). ON CONFLICT DO NOTHING.
