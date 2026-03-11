# Section 05 — Active Mode Cutover + Cleanup

## Objective

Remove the shadow mode guard, make the planner the primary model selection path, and clean up legacy fallback code. This section should only be implemented after shadow mode validation confirms planner accuracy.

## Prerequisites

Before implementing this section:
- Shadow mode has been running for ≥48 hours in production
- `getPlannerAccuracyReport()` shows ≥90% model match accuracy
- `getCostComparisonReport()` shows <10% cost delta for 90%+ of requests
- `getPlannerLatencyReport()` shows p95 latency <50ms
- No billing discrepancies reported by users

## Scope

1. Remove `TASK_PLANNER_SHADOW_MODE` flag and shadow mode branching
2. Make planner the primary model selection path at all entry points
3. Keep `resolveEnabledLlmModelId()` as fallback-only (when planner returns null)
4. Add latency tracking to `runPlanner()`
5. Clean up shadow-mode-specific logging

## Files to modify

### `apps/web/server/services/taskPlannerMiddleware.ts`

**Remove shadow mode logic:**

```typescript
// BEFORE (shadow mode):
export interface PlannerResult {
  taskRunId: number;
  plan: TaskExecutionPlan;
  resolvedModel: string | null;
  snapshot: ModelResolutionSnapshot | null;
  shadowMode: boolean;  // REMOVE this field
}

// AFTER (active mode):
export interface PlannerResult {
  taskRunId: number;
  plan: TaskExecutionPlan;
  resolvedModel: string | null;
  snapshot: ModelResolutionSnapshot | null;
  plannerLatencyMs: number;  // ADD latency tracking
}
```

**Remove `getTenantFeatureFlag("TASK_PLANNER_SHADOW_MODE")` call.**

**Add latency measurement:**
```typescript
export async function runPlanner(input: PlannerInput): Promise<PlannerResult | null> {
  // NOTE: Use getTenantFeatureFlag (consistent with S01)
  const enabled = await getTenantFeatureFlag("TASK_PLANNER_ENABLED", input.tenantId);
  if (!enabled) return null;

  const startMs = Date.now();
  try {
    const plan = buildExecutionPlan({ ... });
    const { id: taskRunId } = await createTaskRun({ ... });  // destructure { id }
    const enabledModels = await loadEnabledModelsWithCapabilities();  // no params
    const resolved = resolveModelFromPlan(plan, enabledModels);
    const snapshot = resolved ? buildModelResolutionSnapshot(resolved, 0) : null;  // attemptIndex=0

    return {
      taskRunId,
      plan,
      resolvedModel: resolved?.modelId ?? null,
      snapshot,
      plannerLatencyMs: Date.now() - startMs,
    };
  } catch (err) {
    console.error("[taskPlannerMiddleware] planner failed", err);
    return null;
  }
}
```

### All entry points — Remove shadow mode conditional

**Pattern in every wired file (llmRoutesHandler, channelGateway, translation, etc.):**

```typescript
// BEFORE (shadow mode branching):
let effectiveModel: string | null;
if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
  effectiveModel = plannerResult.resolvedModel;
} else {
  effectiveModel = await resolveEnabledLlmModelId([model]);
}

// AFTER (active mode — planner is primary, legacy is fallback):
let effectiveModel: string | null;
if (plannerResult?.resolvedModel) {
  effectiveModel = plannerResult.resolvedModel;
} else {
  // Fallback: planner disabled, failed, or no model found
  effectiveModel = await resolveEnabledLlmModelId([model]);
}
```

**Files to update:**
- `apps/web/server/_core/llmRoutesHandler.ts` (2 locations)
- `apps/web/server/services/channelGateway.ts` (1 LLM location + 2 agency locations)
- `apps/web/server/services/memoryService.ts`
- `apps/web/server/services/translation.ts`
- `apps/web/server/routers/scheduledMessages.ts`
- `apps/web/server/routers/scheduler.ts`
- `apps/web/server/routers/chat.ts` (executeSkill)
- `apps/web/server/services/callLLMStructured.ts`
- `apps/web/server/services/aiPresentationService.ts`
- `apps/web/server/_core/responsesRoutes.ts`

### Feature flag cleanup

**Remove from `featureFlags.ts` or mark as deprecated:**
- `TASK_PLANNER_SHADOW_MODE` — no longer used

**Keep:**
- `TASK_PLANNER_ENABLED` — master kill switch (always needed)
- `TASK_PLANNER_AGENCY_ESCALATION` — agency escalation toggle

### `apps/web/server/services/taskPlannerMiddleware.test.ts`

**Update tests:**
- Remove tests for `shadowMode: true/false` branching
- Add test for `plannerLatencyMs` measurement
- Add test that planner-selected model is always returned (no shadow mode check)
- Verify legacy fallback only triggers when planner returns null

## Key design decisions

1. **`TASK_PLANNER_ENABLED` stays as kill switch** — can instantly disable planner if issues arise
2. **Legacy `resolveEnabledLlmModelId()` stays as fallback** — when planner is disabled or fails, legacy path runs
3. **`plannerLatencyMs` added for ongoing monitoring** — record in step_attempts for percentile analysis
4. **Gradual rollout via tenant-scoped flag** — `TASK_PLANNER_ENABLED` can be enabled per-tenant
5. **Shadow mode code is fully removed** — not just disabled, but deleted to reduce complexity

## Acceptance criteria

1. `TASK_PLANNER_SHADOW_MODE` flag fully removed from code
2. All requests use planner-selected model when planner is enabled
3. Legacy `resolveEnabledLlmModelId()` only used as fallback (planner disabled/failed/no model)
4. `plannerLatencyMs` tracked in PlannerResult
5. No regression in credit billing accuracy
6. Latency overhead <50ms per request (planner + DB insert)
7. Kill switch (`TASK_PLANNER_ENABLED=false`) instantly disables planner at all entry points

## Test plan

- Unit test: planner result no longer has `shadowMode` field
- Unit test: planner result includes `plannerLatencyMs`
- Unit test: planner-selected model is used when available (no shadow check)
- Unit test: legacy fallback used when planner returns null
- Unit test: kill switch disables planner (returns null)
- Integration: verify all entry points use consistent active mode pattern
- Performance: measure `runPlanner()` latency in test environment (<50ms target)

## Rollout checklist

Before deploying this section:
- [ ] Shadow mode accuracy report shows ≥90% model match
- [ ] Cost comparison shows <10% delta for 90%+ requests
- [ ] p95 planner latency <50ms
- [ ] No user-reported billing issues
- [ ] Tested on 1 tenant for 24h before global rollout
- [ ] Kill switch tested (can disable planner instantly)

---

## Implementation notes (actual vs planned)

**Files modified:**
- `apps/web/server/services/taskPlannerMiddleware.ts` — removed `shadowMode` field, added `plannerLatencyMs` with JSDoc clarifying it is for caller telemetry only (not persisted in this release)
- `apps/web/server/services/taskPlannerMiddleware.test.ts` — replaced shadow mode tests with active-mode tests; added `typeof`/`isFinite` assertions for `plannerLatencyMs`
- `apps/web/server/services/llmRoutesHandler.ts` (2 locations)
- `apps/web/server/services/channelGateway.ts` (1 LLM location)
- `apps/web/server/services/callLLMStructured.ts`
- `apps/web/server/services/callLLMStructured.test.ts` — updated mock fixtures and shadow mode tests
- `apps/web/server/services/scheduler.ts`
- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/routers/chat.ts`
- `apps/web/server/routers/translation.ts`
- `apps/web/server/routers/scheduledMessages.ts`

**Deviations from plan:**
- `memoryService.ts` — not modified; has no planner usage (spec reference was aspirational)
- `aiPresentationService.ts` — not modified; uses planner for task tracking only, not model selection (by design)
- `TASK_PLANNER_SHADOW_MODE` in featureFlags — no cleanup needed; flag was never registered as a typed constant
- `plannerLatencyMs` is computed and returned but NOT persisted to `task_step_attempts`; requires a schema change (out of scope) if SLO enforcement is needed later

**Tests:** 18 tests pass (12 middleware + 6 callLLMStructured)
