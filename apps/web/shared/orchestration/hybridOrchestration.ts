/**
 * Shared hybrid orchestration contract.
 *
 * This is used by the router, chat UI, and agency UI to pass a single
 * structured plan from the intent router into the agency workflow.
 */

import { z } from "zod";

export const HYBRID_RUNTIME_CONTRACT_VERSION = "hybrid-runtime-v1" as const;
export const HYBRID_EXECUTOR_REGISTRY_VERSION = "hybrid-executor-registry-v1" as const;
export const HYBRID_ROLE_TEMPLATE_VERSION = "hybrid-role-template-v1" as const;
export const HYBRID_PLAN_SCHEMA_VERSION = "hybrid-plan-v1" as const;
export const HYBRID_RESULT_SCHEMA_VERSION = "hybrid-result-v1" as const;

export type HybridRuntimeContractVersion = typeof HYBRID_RUNTIME_CONTRACT_VERSION;

export type HybridStageType = "intake" | "explore" | "validate" | "approval" | "commit" | "repair";
export type HybridStageOwner = "workflow" | "swarm" | "human" | "sdk" | "executor";
export type HybridBlendMode = "workflow-first" | "swarm-first" | "balanced-mixed" | "adaptive-mixed";
export type HybridOriginSurface = "chat" | "agency" | "agency-browser" | "agency-chat" | "review-center" | "legacy";
export type HybridSideEffectClass = "none" | "preview" | "approval_required" | "mutating";

export const hybridStageTypeValues = ["intake", "explore", "validate", "approval", "commit", "repair"] as const;
export const hybridStageOwnerValues = ["workflow", "swarm", "human", "sdk", "executor"] as const;
export const hybridBlendModeValues = ["workflow-first", "swarm-first", "balanced-mixed", "adaptive-mixed"] as const;
export const hybridOriginSurfaceValues = ["chat", "agency", "agency-browser", "agency-chat", "review-center", "legacy"] as const;
export const hybridSideEffectClassValues = ["none", "preview", "approval_required", "mutating"] as const;

export const hybridStageTypeSchema = z.enum(hybridStageTypeValues);
export const hybridStageOwnerSchema = z.enum(hybridStageOwnerValues);
export const hybridBlendModeSchema = z.enum(hybridBlendModeValues);
export const hybridOriginSurfaceSchema = z.enum(hybridOriginSurfaceValues);
export const hybridSideEffectClassSchema = z.enum(hybridSideEffectClassValues);

export interface HybridOrchestrationStage {
  id: string;
  type: HybridStageType;
  owner: HybridStageOwner;
  title: string;
  description: string;
  inputs: string[];
  outputs: string[];
  gate?: "optional" | "required";
}

export interface HybridOrchestrationPlan {
  mode: "hybrid";
  blendMode: HybridBlendMode;
  summary: string;
  workflowAnchor: string;
  swarmRoles: Array<"explorer" | "critic" | "synthesizer" | "executor" | "validator">;
  stages: HybridOrchestrationStage[];
  requiresApproval: boolean;
  reason: string;
}

export interface HybridPlanPayload {
  draft: string;
  plan: HybridOrchestrationPlan;
}

export type HybridExecutionStageStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "blocked"
  | "skipped"
  | "failed"
  | "cancelled";
export type HybridExecutionStatus =
  | "draft_preview"
  | "ready_to_start"
  | "running"
  | "running_stage"
  | "awaiting_approval"
  | "needs_revision"
  | "repairing"
  | "committing"
  | "completed"
  | "cancelled"
  | "failed"
  | "expired";

export type HybridStageResultStatus = "succeeded" | "failed" | "requires_approval" | "skipped";

export interface HybridRuntimeStageRequest {
  executionId: string;
  stageId: string;
  stageType: HybridStageType;
  owner: HybridStageOwner;
  tenantId: string;
  userId: number;
  objective: string;
  input: Record<string, unknown>;
  runtimeContractVersion: typeof HYBRID_RUNTIME_CONTRACT_VERSION;
  planSchemaVersion: typeof HYBRID_PLAN_SCHEMA_VERSION;
}

export interface HybridStageResult {
  executionId: string;
  stageId: string;
  status: HybridStageResultStatus;
  output: Record<string, unknown> | null;
  errorCode?: string | null;
  traceRefs?: string[];
  estimatedCredits?: number | null;
  actualCredits?: number | null;
  tokenUsage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
  } | null;
  modelRoute?: string | null;
  executorCost?: number | null;
  resultSchemaVersion: typeof HYBRID_RESULT_SCHEMA_VERSION;
}

export interface HybridStageExecutorDefinition {
  executorId: string;
  stageType: HybridStageType;
  owner: HybridStageOwner;
  sideEffectClass: HybridSideEffectClass;
  requiresApproval: boolean;
  registryVersion: typeof HYBRID_EXECUTOR_REGISTRY_VERSION;
}

export interface HybridExecutionStageState {
  id: string;
  status: HybridExecutionStageStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  note?: string | null;
}

export interface HybridExecutionHistoryEntry {
  at: string;
  action: string;
  stageId?: string | null;
  note?: string | null;
}

export interface HybridOrchestrationExecution {
  executionId: string;
  previewToken: string;
  tenantId: string;
  userId: number;
  agencyId?: string | null;
  legacyAgencyId?: string | null;
  originSurface?: HybridOriginSurface;
  status: HybridExecutionStatus;
  blendMode: HybridBlendMode;
  currentStageIndex: number;
  currentStageId: string | null;
  plan: HybridOrchestrationPlan;
  draft: string;
  stageStates: HybridExecutionStageState[];
  history: HybridExecutionHistoryEntry[];
  approvalDecision: "approved" | "rejected" | null;
  revisionCount: number;
  runtimeContractVersion?: typeof HYBRID_RUNTIME_CONTRACT_VERSION;
  planSchemaVersion?: typeof HYBRID_PLAN_SCHEMA_VERSION;
  resultSchemaVersion?: typeof HYBRID_RESULT_SCHEMA_VERSION;
  sdkVersion?: string | null;
  adapterVersion?: string | null;
  totalCreditsUsed?: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
}

export const hybridOrchestrationStageSchema = z.object({
  id: z.string().min(1).max(128),
  type: hybridStageTypeSchema,
  owner: hybridStageOwnerSchema,
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(500),
  inputs: z.array(z.string().min(1).max(200)).max(12),
  outputs: z.array(z.string().min(1).max(200)).max(12),
  gate: z.enum(["optional", "required"]).optional(),
}).strict();

export const hybridOrchestrationPlanSchema = z.object({
  mode: z.literal("hybrid"),
  blendMode: hybridBlendModeSchema.default("balanced-mixed"),
  summary: z.string().min(1).max(240),
  workflowAnchor: z.string().min(1).max(120),
  swarmRoles: z.array(z.enum(["explorer", "critic", "synthesizer", "executor", "validator"])).min(1).max(5),
  stages: z.array(hybridOrchestrationStageSchema).min(3).max(12),
  requiresApproval: z.boolean(),
  reason: z.string().min(1).max(160),
}).strict().superRefine((plan, ctx) => {
  const stageOwners = new Set(plan.stages.map((stage) => stage.owner));
  if (!stageOwners.has("workflow")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Hybrid plans must include at least one workflow-owned stage.",
      path: ["stages"],
    });
  }
  if (!stageOwners.has("swarm")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Hybrid plans must include at least one swarm-owned stage.",
      path: ["stages"],
    });
  }
  if (plan.requiresApproval && !stageOwners.has("human")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Hybrid plans that require approval must include a human approval stage.",
      path: ["stages"],
    });
  }
});

export const hybridPlanPayloadSchema = z.object({
  draft: z.string().min(1).max(5000),
  plan: hybridOrchestrationPlanSchema,
}).strict();

export const hybridExecutionStageStateSchema = z.object({
  id: z.string().min(1).max(128),
  status: z.enum(["pending", "running", "awaiting_approval", "completed", "blocked", "skipped", "failed", "cancelled"]),
  startedAt: z.string().min(1).max(64).nullable().optional(),
  completedAt: z.string().min(1).max(64).nullable().optional(),
  note: z.string().min(1).max(1000).nullable().optional(),
}).strict();

export const hybridExecutionHistoryEntrySchema = z.object({
  at: z.string().min(1).max(64),
  action: z.string().min(1).max(64),
  stageId: z.string().min(1).max(128).nullable().optional(),
  note: z.string().min(1).max(1000).nullable().optional(),
}).strict();

export const hybridExecutionStatusSchema = z.enum([
  "draft_preview",
  "ready_to_start",
  "running",
  "running_stage",
  "awaiting_approval",
  "needs_revision",
  "repairing",
  "committing",
  "completed",
  "cancelled",
  "failed",
  "expired",
]);

export const hybridRuntimeStageRequestSchema = z.object({
  executionId: z.string().min(1).max(128),
  stageId: z.string().min(1).max(128),
  stageType: hybridStageTypeSchema,
  owner: hybridStageOwnerSchema,
  tenantId: z.string().min(1).max(64),
  userId: z.number().int().positive(),
  objective: z.string().min(1).max(5000),
  input: z.record(z.unknown()).default({}),
  runtimeContractVersion: z.literal(HYBRID_RUNTIME_CONTRACT_VERSION),
  planSchemaVersion: z.literal(HYBRID_PLAN_SCHEMA_VERSION),
}).strict();

export const hybridStageResultSchema = z.object({
  executionId: z.string().min(1).max(128),
  stageId: z.string().min(1).max(128),
  status: z.enum(["succeeded", "failed", "requires_approval", "skipped"]),
  output: z.record(z.unknown()).nullable(),
  errorCode: z.string().min(1).max(128).nullable().optional(),
  traceRefs: z.array(z.string().min(1).max(256)).default([]),
  estimatedCredits: z.number().nonnegative().nullable().optional(),
  actualCredits: z.number().nonnegative().nullable().optional(),
  tokenUsage: z.object({
    inputTokens: z.number().int().nonnegative().nullable().optional(),
    outputTokens: z.number().int().nonnegative().nullable().optional(),
    totalTokens: z.number().int().nonnegative().nullable().optional(),
  }).nullable().optional(),
  modelRoute: z.string().min(1).max(256).nullable().optional(),
  executorCost: z.number().nonnegative().nullable().optional(),
  resultSchemaVersion: z.literal(HYBRID_RESULT_SCHEMA_VERSION),
}).strict();

export const hybridStageExecutorDefinitionSchema = z.object({
  executorId: z.string().min(1).max(128),
  stageType: hybridStageTypeSchema,
  owner: hybridStageOwnerSchema,
  sideEffectClass: hybridSideEffectClassSchema,
  requiresApproval: z.boolean(),
  registryVersion: z.literal(HYBRID_EXECUTOR_REGISTRY_VERSION),
}).strict().superRefine((definition, ctx) => {
  if (definition.sideEffectClass === "mutating" && !definition.requiresApproval) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Mutating Hybrid executors require approval.",
      path: ["requiresApproval"],
    });
  }
});

export const hybridOrchestrationExecutionSchema = z.object({
  executionId: z.string().min(1).max(128),
  previewToken: z.string().min(1).max(2048),
  tenantId: z.string().min(1).max(64),
  userId: z.number().int().positive(),
  agencyId: z.string().min(1).max(128).nullable().optional(),
  legacyAgencyId: z.string().min(1).max(128).nullable().optional(),
  originSurface: hybridOriginSurfaceSchema.default("legacy"),
  status: hybridExecutionStatusSchema,
  blendMode: hybridBlendModeSchema,
  currentStageIndex: z.number().int().min(0).max(50),
  currentStageId: z.string().min(1).max(128).nullable(),
  plan: hybridOrchestrationPlanSchema,
  draft: z.string().min(1).max(5000),
  stageStates: z.array(hybridExecutionStageStateSchema).max(20),
  history: z.array(hybridExecutionHistoryEntrySchema).max(100),
  approvalDecision: z.enum(["approved", "rejected"]).nullable(),
  revisionCount: z.number().int().min(0).default(0),
  runtimeContractVersion: z.literal(HYBRID_RUNTIME_CONTRACT_VERSION).default(HYBRID_RUNTIME_CONTRACT_VERSION),
  planSchemaVersion: z.literal(HYBRID_PLAN_SCHEMA_VERSION).default(HYBRID_PLAN_SCHEMA_VERSION),
  resultSchemaVersion: z.literal(HYBRID_RESULT_SCHEMA_VERSION).default(HYBRID_RESULT_SCHEMA_VERSION),
  sdkVersion: z.string().min(1).max(128).nullable().optional(),
  adapterVersion: z.string().min(1).max(128).nullable().optional(),
  totalCreditsUsed: z.number().nonnegative().default(0),
  notes: z.string().min(1).max(1000).nullable().optional(),
  createdAt: z.string().min(1).max(64),
  updatedAt: z.string().min(1).max(64),
  expiresAt: z.string().min(1).max(64).nullable().optional(),
}).strict();

export function describeHybridBlendMode(blendMode: HybridBlendMode): string {
  switch (blendMode) {
    case "workflow-first":
      return "Workflow-first";
    case "swarm-first":
      return "Swarm-first";
    case "balanced-mixed":
      return "Balanced mixed";
    case "adaptive-mixed":
      return "Adaptive mixed";
  }
}

function stageOwnerSortWeight(owner: HybridStageOwner, blendMode: HybridBlendMode): number {
  if (blendMode === "swarm-first") {
    if (owner === "swarm") return 0;
    if (owner === "workflow") return 1;
    return 2;
  }
  if (owner === "workflow") return 0;
  if (owner === "swarm") return 1;
  return 2;
}

function sortStagesForMode(
  stages: HybridOrchestrationStage[],
  blendMode: HybridBlendMode,
): HybridOrchestrationStage[] {
  if (blendMode !== "swarm-first") {
    return stages.map((stage) => ({ ...stage }));
  }

  return stages
    .map((stage, index) => ({ stage: { ...stage }, index }))
    .sort((left, right) => {
      const ownerWeightDiff =
        stageOwnerSortWeight(left.stage.owner, blendMode) -
        stageOwnerSortWeight(right.stage.owner, blendMode);
      if (ownerWeightDiff !== 0) return ownerWeightDiff;
      return left.index - right.index;
    })
    .map((entry) => entry.stage);
}

export function applyHybridBlendMode(
  plan: HybridOrchestrationPlan,
  blendMode: HybridBlendMode,
): HybridOrchestrationPlan {
  const normalizedBlendMode = hybridBlendModeSchema.parse(blendMode);
  const stages = sortStagesForMode(plan.stages, normalizedBlendMode);
  return {
    ...plan,
    blendMode: normalizedBlendMode,
    stages,
  };
}

export function normalizeHybridPlanPayload(payload: unknown): HybridPlanPayload | null {
  const parsed = hybridPlanPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export function buildHybridPlanSummary(plan: HybridOrchestrationPlan | null | undefined): string {
  if (!plan) {
    return "Hybrid orchestration is not loaded.";
  }

  const stageCount = plan.stages.length;
  const approvalText = plan.requiresApproval ? "approval step included" : "auto-commit supported";
  const normalizedSummary = plan.summary.replace(
    /\s+\d+\s+stages,\s+(?:approval step included|auto-commit supported)\.?$/i,
    "",
  );
  return `${describeHybridBlendMode(plan.blendMode)}: ${normalizedSummary} ${stageCount} stages, ${approvalText}.`;
}

export function formatHybridPlanInstructions(plan: HybridOrchestrationPlan): string {
  const stageLines = plan.stages.map((stage, index) => {
    const owner = stage.owner === "workflow"
      ? "Workflow"
      : stage.owner === "swarm"
        ? "Swarm"
        : "Human";
    return `${index + 1}. ${owner}: ${stage.title} - ${stage.description}`;
  });

  const roleLine = plan.swarmRoles.length > 0
    ? `Swarm roles: ${plan.swarmRoles.join(", ")}`
    : "Swarm roles: not assigned";

  const approvalLine = plan.requiresApproval
    ? "Human approval is required before the final commit stage."
    : "Human approval is optional and may be skipped when the output is stable.";

  return [
    `Hybrid orchestration plan for ${plan.workflowAnchor}`,
    `Blend mode: ${describeHybridBlendMode(plan.blendMode)}`,
    `Summary: ${plan.summary}`,
    roleLine,
    approvalLine,
    "Stage order:",
    ...stageLines,
    `Routing note: ${plan.reason}`,
  ].join("\n");
}
