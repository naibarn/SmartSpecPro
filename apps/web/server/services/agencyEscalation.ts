/**
 * Agency Escalation
 *
 * Decides when the planner should escalate a task into AgencySwarm execution,
 * builds metadata for the agency bridge, and defines rollout feature flags.
 *
 * Built on top of:
 *   - Section 03: TaskExecutionPlanner (plan classification)
 *   - Section 04: ArtifactRouter (execution routing)
 *   - Section 02: CapabilityRegistry (requirements propagation)
 */

import type { CapabilityRequirements } from "./capabilityRegistry";
import type {
  TaskExecutionPlan,
  TaskType,
  TaskComplexity,
  ExecutionStrategy,
  BudgetClass,
} from "./taskExecutionPlanner";

// ── Feature flag constants ──────────────────────────────────────

/** Global flag: enables planner-driven agency escalation */
export const PLANNER_AGENCY_ESCALATION_FLAG =
  "PLANNER_AGENCY_ESCALATION_ENABLED";

/** Per-task-type flag prefix: e.g. PLANNER_AGENCY_ESCALATION:skill */
export const PLANNER_AGENCY_ESCALATION_TASK_PREFIX =
  "PLANNER_AGENCY_ESCALATION";

// ── Escalation decision ─────────────────────────────────────────

export interface AgencyEscalationInput {
  taskType: TaskType;
  complexity: TaskComplexity;
  hasMultipleAgents: boolean;
}

export interface AgencyEscalationResult {
  escalate: boolean;
  reason: string;
}

/**
 * Determine whether a task should be escalated to agency execution.
 *
 * Escalation triggers:
 * 1. Task type is explicitly "agency" (direct agency source)
 * 2. Complex tasks that have multiple agents available
 *
 * This is a pure function — feature flag checks happen at the call site.
 */
export function shouldEscalateToAgency(
  input: AgencyEscalationInput,
): AgencyEscalationResult {
  // Direct agency source type always escalates
  if (input.taskType === "agency") {
    return {
      escalate: true,
      reason: "agency task type — direct agency source",
    };
  }

  // Complex tasks with multiple agents available escalate
  if (input.complexity === "complex" && input.hasMultipleAgents) {
    return {
      escalate: true,
      reason: "complex task with multiple agents available",
    };
  }

  // All other cases: no escalation
  return {
    escalate: false,
    reason: `no escalation: ${input.taskType}/${input.complexity} (agents=${input.hasMultipleAgents})`,
  };
}

// ── Agency task metadata ────────────────────────────────────────

/**
 * Metadata passed from Node.js planner to Python agency service.
 * Uses snake_case to match Python API conventions.
 */
export interface AgencyTaskMetadata {
  task_run_id: number;
  task_type: TaskType;
  execution_strategy: ExecutionStrategy;
  capability_requirements?: CapabilityRequirements;
  budget_class?: BudgetClass;
  route_reason: string;
  plan_version: number;
}

export interface BuildAgencyTaskMetadataInput {
  taskRunId: number;
  plan: TaskExecutionPlan;
  routeReason: string;
}

/**
 * Build metadata to propagate from the planner into the agency run request.
 * This ensures the Python agency service has full context for model selection,
 * budget alignment, and step-attempt tracking.
 */
export function buildAgencyTaskMetadata(
  input: BuildAgencyTaskMetadataInput,
): AgencyTaskMetadata {
  const { taskRunId, plan, routeReason } = input;

  const meta: AgencyTaskMetadata = {
    task_run_id: taskRunId,
    task_type: plan.taskType,
    execution_strategy: plan.strategy,
    route_reason: routeReason,
    plan_version: plan.version,
  };

  // Only include requirements if they have content
  if (plan.requirements && Object.keys(plan.requirements).length > 0) {
    meta.capability_requirements = { ...plan.requirements };
  }

  if (plan.budgetClass) {
    meta.budget_class = plan.budgetClass;
  }

  return meta;
}
