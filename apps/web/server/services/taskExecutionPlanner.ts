/**
 * Task Execution Planner
 *
 * Central planner that classifies tasks and produces immutable execution plans.
 * Plans capture the intent and requirements at creation time;
 * runtime model resolution happens separately via modelResolver.
 *
 * Built on top of:
 *   - Section 01: skillExecutionPolicy (model priority resolution)
 *   - Section 02: capabilityRegistry (capability-based filtering)
 */

import type { SkillExecutionPolicyConfig } from "@smartspec/skills";
import type { CapabilityRequirements } from "./capabilityRegistry";
import type { ThinkingLevel } from "./thinkingLevelMapper";
import { resolveThinkingLevel } from "./thinkingLevelMapper";

// ── Types ────────────────────────────────────────────────────────────

export type TaskType = "chat" | "skill" | "media" | "responses" | "agency";
export type TaskComplexity = "simple" | "moderate" | "complex";
export type ExecutionStrategy = "cheapest" | "fastest" | "best";
export type BudgetClass = "economy" | "standard" | "premium";
export type TaskRuntimePath =
  | "workflow"
  | "skill"
  | "browser"
  | "hybrid"
  | "agency"
  | "desktop_local"
  | "worker_fabric";
export type TaskStepUpBoundary = "none" | "approval" | "policy";

export interface TaskRuntimeHints {
  preferredPath?: TaskRuntimePath;
  allowedFallbackPaths?: TaskRuntimePath[];
  connectorCount?: number;
  localityHint?: "none" | "desktop" | "worker_fabric";
  sideEffectClass?: "read_only" | "bounded_write" | "external_write" | "irreversible" | "financial" | "privileged";
  requiresApproval?: boolean;
  prefersBrowser?: boolean;
  prefersWorkflow?: boolean;
  requiresDeterministic?: boolean;
}

export interface TaskRuntimeIntent {
  readonly primaryPath: TaskRuntimePath;
  readonly fallbackPaths: readonly TaskRuntimePath[];
  readonly stepUpBoundary: TaskStepUpBoundary;
}

export interface TaskClassificationInput {
  sourceType: string;
  skillSlug?: string;
  userId?: number;
  tenantId?: string;
  conversationModel?: string;
  hasTools?: boolean;
  hasMultipleSteps?: boolean;
  executionPolicy?: SkillExecutionPolicyConfig;
  runtimeHints?: TaskRuntimeHints;
}

export interface TaskExecutionPlan {
  readonly version: 1;
  readonly taskType: TaskType;
  readonly complexity: TaskComplexity;
  readonly requirements: Readonly<CapabilityRequirements>;
  readonly strategy: ExecutionStrategy;
  readonly budgetClass?: BudgetClass;
  readonly thinkingLevel?: ThinkingLevel;
  readonly disallowedModels?: readonly string[];
  readonly runtimeIntent?: Readonly<TaskRuntimeIntent>;
  readonly context?: Readonly<{
    skillSlug?: string;
    conversationModel?: string;
    sourceType?: string;
  }>;
  readonly createdAt: string;
}

/** Billing metadata contract — every execution path must carry these fields */
export interface TaskBillingMetadata {
  taskRunId: number;
  strategy: ExecutionStrategy;
  effectiveModel: string;
  provider: string;
  attemptIndex: number;
  sourceType: string;
  taskType: TaskType;
}

// ── Constants ────────────────────────────────────────────────────────

export const CURRENT_PLAN_VERSION = 1;

function dedupePaths(paths: readonly TaskRuntimePath[]): readonly TaskRuntimePath[] {
  return Array.from(new Set(paths));
}

function inferRuntimeIntent(input: {
  taskType: TaskType;
  complexity: TaskComplexity;
  runtimeHints?: TaskRuntimeHints;
}): TaskRuntimeIntent | undefined {
  const hints = input.runtimeHints;
  if (!hints) {
    return undefined;
  }

  const connectorCount = hints.connectorCount ?? 0;
  const sideEffectClass = hints.sideEffectClass ?? "read_only";
  const requiresApproval = hints.requiresApproval === true;
  const localityHint = hints.localityHint ?? "none";

  let primaryPath: TaskRuntimePath;
  if (localityHint === "desktop") {
    primaryPath = "desktop_local";
  } else if (hints.preferredPath) {
    primaryPath = hints.preferredPath;
  } else if (input.taskType === "agency" && connectorCount > 1) {
    primaryPath = "agency";
  } else if ((hints.prefersBrowser || input.taskType === "responses") && sideEffectClass === "read_only") {
    primaryPath = "browser";
  } else if (localityHint === "worker_fabric") {
    primaryPath = "worker_fabric";
  } else if (sideEffectClass === "read_only" && connectorCount === 0) {
    primaryPath = "skill";
  } else if (hints.prefersWorkflow || hints.requiresDeterministic) {
    primaryPath = "workflow";
  } else if (connectorCount > 1) {
    primaryPath = "hybrid";
  } else {
    primaryPath = input.taskType === "agency" ? "agency" : "workflow";
  }

  const defaultFallbacks: readonly TaskRuntimePath[] =
    primaryPath === "browser"
      ? input.complexity === "complex" ? ["hybrid", "agency"] : ["hybrid"]
      : primaryPath === "desktop_local"
        ? ["worker_fabric"]
        : primaryPath === "workflow"
          ? ["skill"]
          : primaryPath === "hybrid"
            ? input.complexity === "complex" ? ["agency", "workflow"] : ["workflow", "agency"]
            : primaryPath === "worker_fabric"
              ? ["agency"]
              : primaryPath === "agency"
                ? ["hybrid"]
                : [];

  const fallbackPaths = dedupePaths(hints.allowedFallbackPaths?.length ? hints.allowedFallbackPaths : defaultFallbacks);
  const stepUpBoundary: TaskStepUpBoundary =
    requiresApproval || sideEffectClass === "financial" || sideEffectClass === "irreversible" || sideEffectClass === "privileged"
      ? "approval"
      : sideEffectClass !== "read_only" || connectorCount > 0
        ? "policy"
        : "none";

  return {
    primaryPath,
    fallbackPaths,
    stepUpBoundary,
  };
}

// ── Source type to task type mapping ──────────────────────────────────

const SOURCE_TYPE_MAP: Record<string, TaskType> = {
  chat: "chat",
  stream: "chat",
  skill: "skill",
  media: "media",         // generic fallback; prefer specific subtypes below
  media_image: "media",
  media_video: "media",
  media_audio: "media",
  presentation: "media",
  translation: "skill",
  scheduled: "chat",
  responses: "responses",
  browser_automation: "responses",
  agency: "agency",
  webhook: "agency",
  channel: "chat",
  widget_chat: "chat",
  webhook_chat: "chat",
};

// ── Classification ───────────────────────────────────────────────────

export function classifyTaskType(input: Pick<TaskClassificationInput, "sourceType" | "skillSlug">): TaskType {
  return SOURCE_TYPE_MAP[input.sourceType] ?? "chat";
}

export function classifyComplexity(input: {
  taskType: TaskType;
  hasTools?: boolean;
  hasMultipleSteps?: boolean;
}): TaskComplexity {
  if (input.taskType === "agency") return "complex";
  if (input.hasMultipleSteps && input.hasTools) return "complex";
  if (input.hasTools || input.hasMultipleSteps) return "moderate";
  if (input.taskType === "responses") return "moderate";
  return "simple";
}

// ── Requirement inference ────────────────────────────────────────────

function inferRequirements(
  taskType: TaskType,
  policy?: SkillExecutionPolicyConfig,
): CapabilityRequirements {
  const reqs: CapabilityRequirements = {};

  // Merge policy requirements
  if (policy?.requirements) {
    Object.assign(reqs, policy.requirements);
  }

  // Infer requirements from task type when not explicitly set
  if (taskType === "responses" && reqs.supportsResponses === undefined) {
    reqs.supportsResponses = true;
  }

  return reqs;
}

// ── Plan builder ─────────────────────────────────────────────────────

/**
 * Build an immutable execution plan. The returned object is frozen
 * (Object.freeze) so callers cannot modify it after creation.
 */
export function buildExecutionPlan(input: TaskClassificationInput): TaskExecutionPlan {
  const taskType = classifyTaskType(input);
  const complexity = classifyComplexity({
    taskType,
    hasTools: input.hasTools,
    hasMultipleSteps: input.hasMultipleSteps,
  });

  const requirements = inferRequirements(taskType, input.executionPolicy);
  const strategy: ExecutionStrategy =
    (input.executionPolicy?.preferredStrategy as ExecutionStrategy) ?? "cheapest";
  const budgetClass = input.executionPolicy?.budgetClass as BudgetClass | undefined;

  const thinkingHint = input.executionPolicy?.thinking_level_hint as ThinkingLevel | undefined;
  const thinkingLevel = resolveThinkingLevel(thinkingHint, complexity);
  const runtimeIntent = inferRuntimeIntent({
    taskType,
    complexity,
    runtimeHints: input.runtimeHints,
  });

  const plan: TaskExecutionPlan = {
    version: 1,
    taskType,
    complexity,
    requirements,
    strategy,
    thinkingLevel,
    createdAt: new Date().toISOString(),
    ...(budgetClass ? { budgetClass } : {}),
    ...(input.executionPolicy?.disallowedModels?.length
      ? { disallowedModels: input.executionPolicy.disallowedModels }
      : {}),
    ...((input.skillSlug || input.conversationModel || input.sourceType)
      ? {
          context: {
            ...(input.skillSlug ? { skillSlug: input.skillSlug } : {}),
            ...(input.conversationModel ? { conversationModel: input.conversationModel } : {}),
            ...(input.sourceType ? { sourceType: input.sourceType } : {}),
          },
        }
      : {}),
    ...(runtimeIntent ? { runtimeIntent } : {}),
  };

  return Object.freeze(plan);
}

// ── Plan validation ──────────────────────────────────────────────────

/**
 * Validate a stored plan JSON. Returns true if the plan is compatible
 * with the current version. Incompatible plans fail closed.
 */
export function validatePlanVersion(planJson: unknown): planJson is TaskExecutionPlan {
  if (!planJson || typeof planJson !== "object") return false;
  const plan = planJson as Record<string, unknown>;
  return (
    plan.version === CURRENT_PLAN_VERSION &&
    typeof plan.taskType === "string" &&
    typeof plan.complexity === "string" &&
    typeof plan.strategy === "string" &&
    typeof plan.createdAt === "string"
  );
}
