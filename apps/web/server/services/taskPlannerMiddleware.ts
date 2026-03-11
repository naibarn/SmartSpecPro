/**
 * Task Planner Middleware
 *
 * Central orchestrator that wires the task planner into all LLM execution paths.
 * Calls planner modules in sequence: classify → plan → resolve model → create task_run.
 *
 * Key guarantees:
 * - NEVER throws — all errors are caught and logged; returns null on failure
 * - Zero overhead when planner is disabled (feature flag check only)
 * - Shadow mode (default): plans and logs but does NOT override model selection
 * - Active mode: planner-selected model replaces legacy resolveEnabledLlmModelId()
 */

import { buildExecutionPlan, type TaskExecutionPlan } from "./taskExecutionPlanner";
import {
  resolveModelFromPlan,
  buildModelResolutionSnapshot,
  type ModelResolutionSnapshot,
} from "./modelResolver";
import { createTaskRun, createStepAttempt, completeStepAttempt } from "./taskRunStore";
import type { CreateStepAttemptInput, CompleteStepAttemptInput } from "./taskRunStore";
import { loadEnabledModelsWithPricing } from "./capabilityRegistry";
import { getTenantFeatureFlag } from "./featureFlags";
import { getTraceId } from "./traceContext";

// ── Public types ──────────────────────────────────────────────────────

export interface PlannerResult {
  taskRunId: number;
  plan: TaskExecutionPlan;
  resolvedModel: string | null;
  snapshot: ModelResolutionSnapshot | null;
  shadowMode: boolean;
}

export interface PlannerInput {
  sourceType: string;
  userId: number;
  tenantId: string;
  conversationModel?: string | null;
  skillSlug?: string;
  hasTools?: boolean;
  executionPolicy?: { modelId?: string; mode?: string };
}

// ── Core orchestrator ─────────────────────────────────────────────────

/**
 * Run the task planner. Returns null if planner is disabled.
 * NEVER throws — wraps all errors and falls back gracefully.
 */
export async function runPlanner(
  input: PlannerInput,
): Promise<PlannerResult | null> {
  try {
    // 1. Check feature flag — zero overhead when disabled
    const enabled = await getTenantFeatureFlag(
      "TASK_PLANNER_ENABLED",
      input.tenantId,
    );
    if (!enabled) return null;

    const shadowMode = await getTenantFeatureFlag(
      "TASK_PLANNER_SHADOW_MODE",
      input.tenantId,
    );
    // 2. Build execution plan
    const plan = buildExecutionPlan({
      sourceType: input.sourceType,
      skillSlug: input.skillSlug,
      userId: input.userId,
      tenantId: input.tenantId,
      conversationModel: input.conversationModel ?? undefined,
      hasTools: input.hasTools,
      executionPolicy: input.executionPolicy,
    });

    // 3. Create task_run record
    const traceId = getTraceId();
    const { id: taskRunId } = await createTaskRun({
      userId: input.userId,
      tenantId: input.tenantId,
      plan,
      sourceType: input.sourceType,
      skillSlug: input.skillSlug,
      traceId: traceId ?? undefined,
    });

    // 4. Resolve model from plan
    const enabledModels = await loadEnabledModelsWithPricing();
    const resolved = resolveModelFromPlan(plan, enabledModels);
    const snapshot = resolved
      ? buildModelResolutionSnapshot(resolved, 0)
      : null;

    return {
      taskRunId,
      plan,
      resolvedModel: resolved?.modelId ?? null,
      snapshot,
      shadowMode: shadowMode !== false, // default true
    };
  } catch (err) {
    // Planner failure must never block the request
    console.error(
      "[taskPlannerMiddleware] planner failed, falling back to legacy",
      err,
    );
    return null;
  }
}

// ── Step attempt recording ────────────────────────────────────────────

/**
 * Record step attempt after LLM execution completes.
 * NEVER throws — billing recording is best-effort.
 */
export async function recordStepAttempt(params: {
  taskRunId: number;
  plan: TaskExecutionPlan;
  model: string;
  provider?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd?: string;
  durationMs?: number;
  snapshot?: ModelResolutionSnapshot | null;
  creditsUsed?: number;
}): Promise<void> {
  try {
    const snapshot = params.snapshot ?? {
      modelId: params.model,
      providerModelId: params.model,
      providerName: params.provider ?? "unknown",
      pricingInput: 0,
      pricingOutput: 0,
      isFree: false,
      attemptIndex: 0,
      resolvedAt: new Date().toISOString(),
    };

    const { id: stepAttemptId } = await createStepAttempt({
      taskRunId: params.taskRunId,
      attemptIndex: snapshot.attemptIndex,
      snapshot,
      strategy: params.plan.strategy,
    });

    await completeStepAttempt({
      stepAttemptId,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      creditsUsed: params.creditsUsed ?? 0,
      costUsd: params.costUsd ?? "0",
      durationMs: params.durationMs ?? 0,
      status: "completed",
    });
  } catch (err) {
    // Step attempt recording must never block the request
    console.error(
      "[taskPlannerMiddleware] step attempt recording failed",
      err,
    );
  }
}
