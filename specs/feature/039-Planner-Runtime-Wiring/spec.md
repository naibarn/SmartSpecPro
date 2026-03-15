# Spec 039 — Planner Runtime Wiring

## Status: Draft
## Depends on: Spec 037 (Task-First Execution Intelligence)
## Author: Claude
## Date: 2026-03-11

---

## Problem Statement

Spec 037 delivered 5 well-tested planning modules (~730 LOC, 100+ tests) but they are **not connected to any production request path**. Every request still uses the legacy model selection (`resolveEnabledLlmModelId()` → first available model), bypassing the planner's capability matching, strategy-based ranking, and billing metadata.

The modules that need wiring:

| Module | What it does | Current status |
|--------|-------------|----------------|
| `buildExecutionPlan()` | Classifies tasks, creates immutable plans | Never called |
| `resolveModelFromPlan()` | Selects model by strategy (cheapest/fastest/best) | Never called |
| `createTaskRun()` / `createStepAttempt()` | Records plans + billing snapshots | Never called |
| `classifyArtifactIntent()` / `selectExecutionRoute()` | Routes presentations vs reports vs chat | Never called |
| `shouldEscalateToAgency()` | Decides agency escalation | Never called |
| Feature flag checks | Guards rollout | Never checked |

## Goal

Wire the Spec 037 planner into all request entry points behind a feature flag, so every LLM/skill/media/agency request flows through:

```
Request → Feature Flag Check → buildExecutionPlan() → createTaskRun()
→ resolveModelFromPlan() → createStepAttempt() → Execute → completeStepAttempt()
```

**Shadow mode first**: planner runs alongside legacy path, logs decisions but doesn't override model selection. Once validated, switch to planner-driven model selection.

## Non-Goals

- New planning logic or algorithms (Spec 037 handles that)
- Database schema changes (tables already exist and migrated)
- Python backend changes (already prepared in Spec 037 Section 05)
- UI changes

---

## Architecture

### Feature Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `TASK_PLANNER_ENABLED` | `false` | Master switch — enables planner at all entry points |
| `TASK_PLANNER_SHADOW_MODE` | `true` | Shadow mode — planner runs but doesn't override model selection |
| `TASK_PLANNER_AGENCY_ESCALATION` | `false` | Agency escalation via planner (per Spec 037 S05) |

> **API note:** Use `getTenantFeatureFlag(flagName, tenantId)` for tenant-scoped rollout, NOT `getFeatureFlag(flagName)` which is global-only. See `featureFlags.ts` for both signatures.

When `TASK_PLANNER_ENABLED=true` + `TASK_PLANNER_SHADOW_MODE=true`:
- Planner runs for every request
- `task_runs` and `task_step_attempts` records are created
- Model selection still uses legacy path
- Planner's recommended model is logged for comparison

When `TASK_PLANNER_ENABLED=true` + `TASK_PLANNER_SHADOW_MODE=false`:
- Planner drives model selection
- Legacy `resolveEnabledLlmModelId()` is bypassed
- Full billing metadata flows through `task_step_attempts`

### Data Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                      Request Entry Points                            │
│                                                                      │
│  llmRoutes.ts     chat.ts        skillExecutor.ts    responsesRoutes │
│  (chat/stream)    (executeSkill)  (media gen)        (tools API)     │
│                                                                      │
│  chatService.ts   channelGateway  scheduledMessages   translation.ts │
│  (chat service)   (telegram/wh)   (scheduled sends)  (i18n)         │
│                                                                      │
│  memoryService    callLLMStruct   aiPresentation.ts   agency.ts      │
│  (summarize)      (JSON mode)     (deck generation)   (agency runs)  │
│                                                                      │
│  webhookDispatch  webhookTriggers                                     │
│  (wh agency)      (trigger agency)                                   │
└──────┬───────────────┬──────────────┬──────────────┬─────────────────┘
       │               │              │              │
       ▼               ▼              ▼              ▼
┌──────────────────────────────────────────────────────────────────────┐
│              taskPlannerMiddleware.ts (NEW)                           │
│                                                                      │
│  1. Check TASK_PLANNER_ENABLED flag                                  │
│  2. buildExecutionPlan(classificationInput)                          │
│  3. createTaskRun(plan)                                              │
│  4. resolveModelFromPlan(plan, enabledModels)                        │
│  5. Return { taskRunId, resolvedModel, plan }                        │
│                                                                      │
│  If shadow mode: return resolvedModel as metadata only               │
│  If active mode: return resolvedModel for actual use                 │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│              Existing Execution Path                                  │
│                                                                      │
│  executeWithFallback() / provider.chat() / media.gen()               │
│                                                                      │
│  After completion:                                                   │
│    createStepAttempt() + completeStepAttempt()                        │
│    (with tokens, cost, duration)                                     │
└──────────────────────────────────────────────────────────────────────┘
```

### Complete Entry Point Inventory

Every production caller of `resolveEnabledLlmModelId()`, `executeWithFallback()`, or `agencyBridge.executeRun()` must be wired. This table tracks coverage:

| File | Current function | Section | Priority |
|------|-----------------|---------|----------|
| `_core/llmRoutes.ts` | `resolveEnabledLlmModelId()` | S1 | HIGH |
| `_core/llmRoutesHandler.ts` | passes model to chat/stream | S1 | HIGH |
| `services/chatService.ts` | `resolveEnabledLlmModelId()` | S1 | HIGH |
| `services/memoryService.ts` | `resolveEnabledLlmModelId()` | S1 | MEDIUM |
| `services/translation.ts` | `resolveEnabledLlmModelId()` | S1 | MEDIUM |
| `routers/scheduledMessages.ts` | `resolveEnabledLlmModelId()` | S1 | MEDIUM |
| `services/channelGateway.ts` | `resolveEnabledLlmModelId()` + `agencyBridge.executeRun()` | S1+S4 | HIGH |
| `routers/chat.ts` | `executeSkill()` | S2 | HIGH |
| `services/skillExecutor.ts` | media generation | S2 | HIGH |
| `services/callLLMStructured.ts` | `executeWithFallback()` (JSON mode) | S2 | HIGH |
| `_core/responsesRoutes.ts` | Responses API tool loop | S3 | HIGH |
| `services/aiPresentationService.ts` | `executeWithFallback()` (deck gen) | S3 | HIGH |
| `routers/agency.ts` | agency execution | S4 | HIGH |
| `services/webhookDispatchQueue.ts` | `agencyBridge.executeRun()` | S4 | MEDIUM |
| `services/webhookTriggers.ts` | `agencyBridge.executeRun()` | S4 | MEDIUM |
| `routers/scheduler.ts` | `resolveEnabledLlmModelId()` | S1 | LOW |
| `routers/users.ts` | `resolveEnabledLlmModelId()` | S1 | LOW |

---

## Sections

### Section 1: Planner Middleware + Core Chat/Service Wiring

**Scope**: Create `taskPlannerMiddleware.ts` and wire into all core LLM resolution paths — chat routes, chat service, channel gateway, memory, translation, and scheduled messages.

**Files to create:**
- `apps/web/server/services/taskPlannerMiddleware.ts` — Orchestrator that calls planner modules in sequence

**Files to modify:**
- `apps/web/server/_core/llmRoutes.ts` — Inject planner before `resolveEnabledLlmModelId()`
- `apps/web/server/_core/llmRoutesHandler.ts` — Pass planner result through `handleChatWithRouter()` / `handleStreamWithRouter()`
- `apps/web/server/services/chatService.ts` — Inject planner before model resolution in chat service layer
- `apps/web/server/services/channelGateway.ts` — Inject planner for Telegram/webhook channel LLM calls (also has agency call — covered in S4)
- `apps/web/server/services/memoryService.ts` — Inject planner for memory summarization model selection
- `apps/web/server/services/translation.ts` — Inject planner for translation model selection
- `apps/web/server/routers/scheduledMessages.ts` — Inject planner for scheduled message model selection
- `apps/web/server/routers/scheduler.ts` — Inject planner for background scheduler model selection (low priority)
- `apps/web/server/routers/users.ts` — Inject planner for user-related model resolution (low priority)

**Key function:**
```typescript
interface PlannerResult {
  taskRunId: number;
  plan: TaskExecutionPlan;
  resolvedModel: ModelWithPricing | null;
  snapshot: ModelResolutionSnapshot | null;
  shadowMode: boolean;
}

async function runPlanner(input: {
  sourceType: string;
  skillSlug?: string;
  userId: number;
  tenantId: string;
  conversationModel?: string;
  hasTools?: boolean;
  executionPolicy?: SkillExecutionPolicyConfig;
}): Promise<PlannerResult | null>
```

**Acceptance criteria:**
1. When `TASK_PLANNER_ENABLED=false`: zero overhead, no planner code runs
2. When enabled in shadow mode: `task_runs` row created for every chat request, planner model logged but not used
3. When enabled in active mode: planner-selected model replaces `resolveEnabledLlmModelId()` result
4. `task_step_attempts` row created after LLM response with billing metadata
5. Fallback: if planner fails (no model found), falls back to legacy path with `routeReason: "planner_fallback"`
6. All 9 `resolveEnabledLlmModelId()` callers covered: llmRoutes, llmRoutesHandler, chatService, channelGateway, memoryService, translation, scheduledMessages, scheduler, users
7. Channel gateway (Telegram/webhook) creates `task_runs` with `sourceType: "channel"`

---

### Section 2: Skill Execution + Structured LLM Wiring

**Scope**: Wire planner into `executeSkill()` in `chat.ts` for LLM-only skills, into `skillExecutor.ts` for media skills, and into `callLLMStructured.ts` for JSON-mode structured LLM calls.

**Files to modify:**
- `apps/web/server/routers/chat.ts` — `executeSkill()` mutation, before `resolveSkillExecutionPolicy()`
- `apps/web/server/services/skillExecutor.ts` — `executeImageGeneration()`, `executeVideoGeneration()`, `executeAudioGeneration()`
- `apps/web/server/services/callLLMStructured.ts` — Inject planner before `executeWithFallback()` for structured (JSON mode) LLM calls

**Key behavior:**
- Skill execution policy (from Spec 037 S01) becomes input to the planner
- Planner produces a plan with skill-specific requirements
- For media skills: planner assesses complexity and routes to appropriate media model
- `createTaskRun()` records the skill slug and execution policy in `planJson`
- For structured calls: planner adds `structuredOutput: true` capability requirement, ensuring model supports JSON mode

**Acceptance criteria:**
1. Every skill execution creates a `task_runs` record
2. Skill execution policy requirements are reflected in the plan
3. Media skills get planner-aware model selection (when not in shadow mode)
4. Legacy `resolveSkillExecutionPolicy()` still works as fallback
5. Structured LLM calls (`callLLMStructured.ts`) create `task_runs` with `structuredOutput` requirement

---

### Section 3: Artifact Routing + Presentation Service + Responses API Wiring

**Scope**: Wire artifact router for presentations/reports, planner into `aiPresentationService.ts` (the actual deck generation path), and planner into Responses API.

**Files to modify:**
- `apps/web/server/_core/responsesRoutes.ts` — Inject planner before tool loop
- `apps/web/server/routers/chat.ts` — Inject `classifyArtifactIntent()` + `selectExecutionRoute()` for presentation/report skills
- `apps/web/server/services/aiPresentationService.ts` — Inject planner before `executeWithFallback()` for presentation deck generation (this is THE file that generates presentations via LLM — critical for artifact routing to actually work)

**Key behavior:**
- Artifact intent classification happens before execution
- `task_runs` stores `artifactIntent` and `executionRoute`
- `routeReason` is logged for telemetry
- Responses API gets planner-aware budget estimation
- `aiPresentationService.ts` uses planner to select a model capable of long-context + structured output (deck JSON generation requires both)

**Acceptance criteria:**
1. Presentation skills record `artifactIntent: "presentation_deck"` and correct `executionRoute`
2. Report skills record `artifactIntent: "research_report"`
3. Responses API requests create `task_runs` with `supportsResponses: true` requirement
4. `linkArtifactToTaskRun()` called when presentations are completed
5. `aiPresentationService.ts` creates `task_runs` and uses planner-selected model for deck generation
6. Presentation `task_runs` link to generated presentation artifacts via `linkArtifactToTaskRun()`

---

### Section 4: Agency Escalation + Telemetry Dashboard

**Scope**: Wire agency escalation from planner at ALL agency call sites and add telemetry queries for shadow mode validation.

**Files to modify:**
- `apps/web/server/routers/agency.ts` — Create `task_runs` for agency requests, pass `taskMetadata`
- `apps/web/server/services/channelGateway.ts` — Pass `taskMetadata` when calling `agencyBridge.executeRun()` from Telegram/webhook channels
- `apps/web/server/services/webhookDispatchQueue.ts` — Pass `taskMetadata` when dispatching agency runs from webhook queue
- `apps/web/server/services/webhookTriggers.ts` — Pass `taskMetadata` when triggering agency runs from webhook events

**Files to create:**
- `apps/web/server/services/plannerTelemetry.ts` — Queries for planner accuracy analysis

**Telemetry queries:**

> **NOTE:** `task_runs` does NOT currently have a `traceId` column. Section 01 should add it via Drizzle migration (nullable varchar). If not added, use timestamp-based correlation instead of `traceId` JOIN.

```sql
-- Shadow mode: compare planner model vs actual model used
-- Requires traceId column added to task_runs in S01
SELECT
  tr."taskType",
  (tr."planJson"->>'strategy') as strategy,
  tsa."effectiveModel" as planner_model,
  pul."modelUsed" as actual_model,
  tsa."creditsUsed" as planner_credits,
  pul."creditsCharged" as actual_credits
FROM task_runs tr
JOIN task_step_attempts tsa ON tsa."taskRunId" = tr.id
LEFT JOIN provider_usage_log pul ON pul."traceId" = tr."traceId"
WHERE tr."createdAt" > NOW() - INTERVAL '24 hours'
ORDER BY tr."createdAt" DESC;
```

**Acceptance criteria:**
1. Agency requests create `task_runs` with `taskType: "agency"`
2. `shouldEscalateToAgency()` is called when `TASK_PLANNER_AGENCY_ESCALATION=true`
3. `buildAgencyTaskMetadata()` passes planner context to Python
4. Telemetry queries work for shadow mode validation
5. Cost comparison: planner-predicted vs actual credits within 10% for 90% of requests
6. All 4 `agencyBridge.executeRun()` callers pass `taskMetadata`: agency router, channelGateway, webhookDispatchQueue, webhookTriggers
7. Webhook/channel agency runs create `task_runs` with `sourceType: "webhook"` or `sourceType: "channel"`

---

### Section 5: Active Mode Cutover + Cleanup

**Scope**: Remove shadow mode guard, make planner the primary model selection path. Clean up legacy `resolveEnabledLlmModelId()` calls.

**Prerequisites:**
- Shadow mode has run for ≥48 hours
- Telemetry shows planner accuracy ≥90%
- No billing discrepancies >10%

**Files to modify:**
- All entry points — remove shadow mode conditional
- `apps/web/server/services/taskPlannerMiddleware.ts` — Remove shadow mode logic

**Acceptance criteria:**
1. `TASK_PLANNER_SHADOW_MODE` flag removed
2. All requests use planner-selected model
3. Legacy `resolveEnabledLlmModelId()` only used as fallback
4. No regression in credit billing accuracy
5. Latency overhead <50ms per request (planner + DB insert)

---

## Rollout Plan

| Phase | Duration | What | Flag State |
|-------|----------|------|------------|
| 0 | Deploy | Code ships, everything off | `ENABLED=false` |
| 1 | 24h | Shadow mode on 1 tenant | `ENABLED=true, SHADOW=true` (tenant-scoped) |
| 2 | 48h | Shadow mode all tenants | `ENABLED=true, SHADOW=true` (global) |
| 3 | — | Validate telemetry | Review cost accuracy, latency, error rate |
| 4 | 24h | Active mode on 1 tenant | `SHADOW=false` (tenant-scoped) |
| 5 | 48h | Active mode all tenants | `SHADOW=false` (global) |
| 6 | — | Agency escalation | `AGENCY_ESCALATION=true` (tenant-scoped first) |
| 7 | — | Cleanup | Remove shadow mode code, legacy fallback becomes error path |

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Planner selects wrong model | User gets inferior response | Shadow mode validates before cutover |
| Planner adds latency | Every request slows down | Feature flag instant kill switch; target <50ms |
| DB insert fails | Request blocked | Wrap in try/catch; request proceeds without task_run |
| No model meets requirements | Request fails | Fallback to legacy path with `planner_fallback` reason |
| Billing discrepancy | Over/under-charging | Shadow mode cost comparison for 48h before active mode |
| `task_runs` table grows fast | DB bloat | Add retention policy (30 days default, configurable) |
| Missed entry point | Some requests bypass planner | Entry Point Inventory table tracks all callers; grep-verify before cutover |
| Channel gateway dual path | channelGateway uses both LLM + agency | Wire both S1 (model resolution) and S4 (agency metadata) in same file |

## Success Metrics

1. **Coverage**: 100% of LLM/skill/media requests create `task_runs` (when enabled)
2. **Accuracy**: Planner model matches "best choice" ≥90% of the time
3. **Latency**: <50ms added per request (plan + DB insert)
4. **Billing**: Cost prediction within 10% of actual for 90% of requests
5. **Availability**: Planner failure rate <0.1% (fallback to legacy on failure)
