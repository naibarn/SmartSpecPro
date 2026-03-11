# Section 04 — Agency Escalation + Telemetry Dashboard

## Objective

Wire agency escalation from the planner at ALL `agencyBridge.executeRun()` call sites, and create telemetry queries for shadow mode validation.

## Scope

1. Wire planner into `agency.ts` `sendMessage` mutation
2. Wire planner into `channelGateway.ts` agency paths (2 locations)
3. Wire planner into `webhookDispatchQueue.ts` agency dispatch
4. Wire planner into `webhookTriggers.ts` test trigger
5. Pass `taskMetadata` via `buildAgencyTaskMetadata()` to all agency calls
6. Create `plannerTelemetry.ts` with shadow mode validation queries

## Dependencies

- Section 01 (`taskPlannerMiddleware.ts` must exist)
- Spec 037 S05 (`agencyEscalation.ts`, `agencyBridge.ts` with `taskMetadata` support)

## Files to modify

### `apps/web/server/routers/agency.ts` — `sendMessage` mutation

**Current behavior (lines 1354-1361):**
```typescript
const result = await agencyBridge.executeRun({
  agencyId: input.agencyId,
  conversationId: input.conversationId,
  message: input.message,
  userToken,
  tenantId,
  userId,
});
```

**New behavior — inject planner + pass taskMetadata:**
```typescript
import { runPlanner, recordStepAttempt } from "../services/taskPlannerMiddleware";
import { shouldEscalateToAgency, buildAgencyTaskMetadata } from "../services/agencyEscalation";
// NOTE: Use getTenantFeatureFlag, NOT getFeatureFlag, for tenant-scoped control
import { getTenantFeatureFlag } from "../services/featureFlags";

// Before agencyBridge.executeRun:
const plannerResult = await runPlanner({
  sourceType: "agency",
  userId,
  tenantId,
});

// Build task metadata if planner ran
let taskMetadata: AgencyTaskMetadata | undefined;
if (plannerResult) {
  taskMetadata = buildAgencyTaskMetadata({
    taskRunId: plannerResult.taskRunId,
    plan: plannerResult.plan,
    routeReason: "agency:direct_request",
  });
}

const result = await agencyBridge.executeRun({
  agencyId: input.agencyId,
  conversationId: input.conversationId,
  message: input.message,
  userToken,
  tenantId,
  userId,
  taskMetadata,  // NEW — passed to Python backend
});

// After execution:
if (plannerResult) {
  await recordStepAttempt({
    taskRunId: plannerResult.taskRunId,
    model: "agency",
    inputTokens: 0,
    outputTokens: 0,
    costUsd: result.creditsUsed,
    durationMs: result.durationMs,
  });
}
```

### `apps/web/server/services/channelGateway.ts` — Agency paths (2 locations)

**Location A (lines 170-199):** Channel router override — routes to specified agency.
**Location B (lines 240-247):** Direct agency conversation binding.

Both currently call `agencyBridge.executeRun()` without `taskMetadata`.

**New behavior for BOTH locations:**
```typescript
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
import { buildAgencyTaskMetadata } from "./agencyEscalation";

// Before agencyBridge.executeRun:
const plannerResult = await runPlanner({
  sourceType: "channel",
  userId: connection.userId,
  tenantId: connection.tenantId,
});

let taskMetadata: AgencyTaskMetadata | undefined;
if (plannerResult) {
  taskMetadata = buildAgencyTaskMetadata({
    taskRunId: plannerResult.taskRunId,
    plan: plannerResult.plan,
    routeReason: "agency:channel_gateway",
  });
}

const result = await agencyBridge.executeRun({
  agencyId: agencyConv.agencyId,
  conversationId: channel.agencyConversationId,
  message: event.message.text,
  userToken: "",
  tenantId: connection.tenantId,
  userId: connection.userId,
  taskMetadata,  // NEW
});

// After execution:
if (plannerResult) {
  await recordStepAttempt({
    taskRunId: plannerResult.taskRunId,
    model: "agency",
    inputTokens: 0,
    outputTokens: 0,
    durationMs: Date.now() - startTime,
  });
}
```

**Note:** `channelGateway.ts` already has planner wiring from S01 for LLM calls. The agency paths are SEPARATE code branches (if/else for `conversationType`). Ensure the S01 planner wiring and S04 agency wiring don't conflict — they're in different branches.

### `apps/web/server/services/webhookDispatchQueue.ts`

**Current behavior (lines 75-83):**
```typescript
const result = await agencyBridge.executeRun({
  agencyId: targetAgencyId,
  conversationId: targetAgencyId,
  message,
  userToken: "",
  tenantId,
  userId,
});
```

**New behavior:**
```typescript
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
import { buildAgencyTaskMetadata } from "./agencyEscalation";

const plannerResult = await runPlanner({
  sourceType: "webhook",
  userId,
  tenantId,
});

let taskMetadata: AgencyTaskMetadata | undefined;
if (plannerResult) {
  taskMetadata = buildAgencyTaskMetadata({
    taskRunId: plannerResult.taskRunId,
    plan: plannerResult.plan,
    routeReason: "agency:webhook_dispatch",
  });
}

const result = await agencyBridge.executeRun({
  agencyId: targetAgencyId,
  conversationId: targetAgencyId,
  message,
  userToken: "",
  tenantId,
  userId,
  taskMetadata,
});

if (plannerResult) {
  await recordStepAttempt({
    taskRunId: plannerResult.taskRunId,
    model: "agency",
    inputTokens: 0,
    outputTokens: 0,
  });
}
```

### `apps/web/server/routers/webhookTriggers.ts` — `testTrigger` mutation

**Current behavior (lines 326-334):**
Same pattern as above, calling `agencyBridge.executeRun()` without metadata.

**New behavior:** Same planner wiring pattern with `sourceType: "webhook"` and `routeReason: "agency:webhook_test"`.

## Files to create

### `apps/web/server/services/plannerTelemetry.ts`

Telemetry queries for shadow mode validation:

```typescript
import { getDb } from "../db";
import { taskRuns, taskStepAttempts } from "../../drizzle/schema";
import { sql, desc, and, gte } from "drizzle-orm";

export interface PlannerAccuracyReport {
  totalRuns: number;
  modelMatches: number;
  modelMismatches: number;
  accuracyPercent: number;
  costDeltaPercent: number;
  avgLatencyMs: number;
  byTaskType: Record<string, {
    runs: number;
    matches: number;
    avgCostDelta: number;
  }>;
}

/**
 * Compare planner-recommended model vs actual model used (shadow mode).
 */
export async function getPlannerAccuracyReport(
  hoursBack: number = 24
): Promise<PlannerAccuracyReport> {
  const db = await getDb();
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const rows = await db
    .select({
      taskType: taskRuns.taskType,
      planJson: taskRuns.planJson,
      effectiveModel: taskStepAttempts.effectiveModel,
      creditsUsed: taskStepAttempts.creditsUsed,
      durationMs: taskStepAttempts.durationMs,
    })
    .from(taskRuns)
    .innerJoin(taskStepAttempts, sql`${taskStepAttempts.taskRunId} = ${taskRuns.id}`)
    .where(gte(taskRuns.createdAt, since))
    .orderBy(desc(taskRuns.createdAt));

  // Compute accuracy metrics...
  // Return structured report
}

/**
 * Shadow mode cost comparison: planner-predicted vs actual.
 */
export async function getCostComparisonReport(
  hoursBack: number = 24
): Promise<{
  totalPlannerCredits: number;
  totalActualCredits: number;
  deltaPercent: number;
  outliers: Array<{ taskRunId: number; plannerCredits: number; actualCredits: number }>;
}> {
  // SQL query comparing task_step_attempts costs with provider_usage_log
}

/**
 * Latency overhead: time spent in planner per request.
 */
export async function getPlannerLatencyReport(
  hoursBack: number = 24
): Promise<{
  avgPlannerMs: number;
  p95PlannerMs: number;
  p99PlannerMs: number;
  totalRequests: number;
}> {
  // Measure time between task_run creation and step_attempt creation
}
```

### `apps/web/server/services/plannerTelemetry.test.ts`

Tests:
1. `getPlannerAccuracyReport()` returns correct accuracy metrics
2. `getCostComparisonReport()` identifies cost outliers
3. `getPlannerLatencyReport()` calculates percentiles correctly
4. All queries handle empty result sets gracefully
5. Time range filtering works correctly

## Schema dependency: `traceId` column

The spec.md telemetry SQL query JOINs `task_runs` with `provider_usage_log` via `traceId`, but **`traceId` column does NOT exist** in the `task_runs` table.

**If S01 adds `traceId` column** (recommended Option A), the telemetry queries work as-is.

**If S01 does NOT add `traceId`**, the telemetry queries must correlate by:
- `userId` + `createdAt` timestamp range (within 5 seconds), OR
- Separate comparison using `task_step_attempts.effectiveModel` vs `planJson` strategy recommendations

The `getCostComparisonReport()` should use `task_step_attempts.creditsUsed` (planner-side) vs `provider_usage_log.creditsCharged` (actual) with timestamp-based correlation if no `traceId`.

## Key design decisions

1. **All 4 agency call sites get planner wiring** — agency.ts, channelGateway (×2), webhookDispatchQueue, webhookTriggers
2. **`taskMetadata` is always optional** — backward compatible, Python handles missing gracefully
3. **Agency step attempts record `model: "agency"`** — agency runs don't have a single model; use "agency" as marker
4. **Agency `creditsUsed` comes from `RunResult`** — not from token counting
5. **Telemetry is separate from execution** — queries are read-only, no impact on request path
6. **Channel gateway has BOTH S01 (LLM) and S04 (agency) wiring** — different code branches, no conflict
7. **Use `getTenantFeatureFlag()`** — not `getFeatureFlag()` — for tenant-scoped escalation control

## Acceptance criteria

1. Agency requests from `agency.ts` create `task_runs` with `taskType: "agency"`
2. Agency requests from `channelGateway.ts` create `task_runs` with `sourceType: "channel"`
3. Agency requests from webhook paths create `task_runs` with `sourceType: "webhook"`
4. All 4 `agencyBridge.executeRun()` callers pass `taskMetadata`
5. `shouldEscalateToAgency()` is called when `TASK_PLANNER_AGENCY_ESCALATION=true`
6. `buildAgencyTaskMetadata()` passes planner context to Python
7. Telemetry queries return accurate shadow mode validation data
8. Cost comparison query identifies outliers >10% delta

## Test plan

- Unit test: `agency.ts` sendMessage passes `taskMetadata` when planner is enabled
- Unit test: `channelGateway.ts` both agency paths pass `taskMetadata`
- Unit test: `webhookDispatchQueue.ts` passes `taskMetadata`
- Unit test: `webhookTriggers.ts` testTrigger passes `taskMetadata`
- Unit test: all call sites gracefully handle planner being disabled (no taskMetadata)
- Unit test: `plannerTelemetry.ts` accuracy report calculation
- Unit test: `plannerTelemetry.ts` cost comparison with outlier detection
- Unit test: `plannerTelemetry.ts` latency report percentiles

---

## Implementation Notes

### Actual files modified
- `apps/web/server/routers/agency.ts` — Added planner + taskMetadata to `sendMessage`
- `apps/web/server/services/channelGateway.ts` — Added planner + taskMetadata at both agency paths (~line 176 and ~line 265). `runPlanner`/`recordStepAttempt` already imported from S01.
- `apps/web/server/services/webhookDispatchQueue.ts` — Added planner + taskMetadata to agency dispatch
- `apps/web/server/routers/webhookTriggers.ts` — Added planner + taskMetadata to `testTrigger`

### Actual files created
- `apps/web/server/services/plannerTelemetry.ts` — 3 report functions: accuracy, cost comparison, latency
- `apps/web/server/services/plannerTelemetry.test.ts` — 4 tests covering null-db and empty-data fallbacks

### Deviations from plan
1. **`recordStepAttempt` requires `plan` field** — The plan specified only `taskRunId` + `model` params, but `recordStepAttempt()` requires the full `plan: TaskExecutionPlan` object. All call sites pass `plan: plannerResult.plan`.
2. **No `shouldEscalateToAgency()` calls** — The plan mentioned wiring `shouldEscalateToAgency()` with feature flag, but all call sites already know they're dispatching to agencies (the routing decision is made upstream). `shouldEscalateToAgency()` is for the planner to decide IF a request should go to an agency, which is a different concern (S05 active mode).
3. **Accuracy metric fix** — Code review found that `getPlannerAccuracyReport()` was inflating accuracy by treating rows with null `recommendedModel` as matches. Fixed to skip rows without planner recommendations.
4. **Missing `recordStepAttempt` calls** — Code review found 3 sites (channelGateway ×2, webhookTriggers) that called `runPlanner` but never recorded step attempts. Fixed by adding `recordStepAttempt` at all 3 locations.
