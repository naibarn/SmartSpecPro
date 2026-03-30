/**
 * Shared hybrid orchestration contract.
 *
 * This is used by the router, chat UI, and agency UI to pass a single
 * structured plan from the intent router into the agency workflow.
 */

import { z } from "zod";

export type HybridStageType = "intake" | "explore" | "validate" | "approval" | "commit";
export type HybridStageOwner = "workflow" | "swarm" | "human";
export type HybridBlendMode = "workflow-first" | "swarm-first" | "balanced-mixed" | "adaptive-mixed";

export const hybridStageTypeValues = ["intake", "explore", "validate", "approval", "commit"] as const;
export const hybridStageOwnerValues = ["workflow", "swarm", "human"] as const;
export const hybridBlendModeValues = ["workflow-first", "swarm-first", "balanced-mixed", "adaptive-mixed"] as const;

export const hybridStageTypeSchema = z.enum(hybridStageTypeValues);
export const hybridStageOwnerSchema = z.enum(hybridStageOwnerValues);
export const hybridBlendModeSchema = z.enum(hybridBlendModeValues);

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

export type HybridExecutionStageStatus = "pending" | "running" | "completed" | "blocked" | "skipped" | "failed";
export type HybridExecutionStatus = "running" | "awaiting_approval" | "needs_revision" | "completed" | "cancelled" | "failed";

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
  agencyId: string;
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
  status: z.enum(["pending", "running", "completed", "blocked", "skipped", "failed"]),
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
  "running",
  "awaiting_approval",
  "needs_revision",
  "completed",
  "cancelled",
  "failed",
]);

export const hybridOrchestrationExecutionSchema = z.object({
  executionId: z.string().min(1).max(128),
  previewToken: z.string().min(1).max(2048),
  tenantId: z.string().min(1).max(64),
  userId: z.number().int().positive(),
  agencyId: z.string().min(1).max(128),
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
