import { createHash } from "node:crypto";

import {
  JobControlPlaneError,
  type ExecutionClass,
  type JobDefinition,
} from "../jobControlPlaneTypes";

export const ORCHESTRATION_CONTRACT_VERSION = "sah-orchestration-v1";

export type CommandChannel =
  "chat" | "assistant" | "api" | "scheduled" | "operator";

export type UniversalCommand = {
  commandId: string;
  tenantId: string;
  actorId: number;
  channel: CommandChannel;
  text: string;
  requestedAt: string;
  idempotencyKey: string;
  pageContext?: { route?: string; resourceId?: string };
};

export type Goal = {
  goalId: string;
  tenantId: string;
  commandId: string;
  objective: string;
  constraints: Record<string, unknown>;
  createdAt: string;
};

export type CapabilityRequirement = {
  capabilityId: string;
  minQuality?: number;
  maxCostCredits?: number;
  requiresApproval?: boolean;
  locality?: "any" | "tenant" | "local";
};

export type CapabilityOffer = CapabilityRequirement & {
  offerId: string;
  providerNeutralName: string;
  executionClass: ExecutionClass;
  jobType: string;
  available: boolean;
  estimatedCostCredits?: number;
  qualityScore?: number;
  snapshotRevision: string;
};

export type PlanStep = {
  stepId: string;
  selectedOfferId: string;
  capabilityId: string;
  jobType: string;
  executionClass: ExecutionClass;
  input: Record<string, unknown>;
  dependsOn: string[];
  requiresApproval: boolean;
};

export type PlanRevision = {
  planId: string;
  goalId: string;
  tenantId: string;
  revision: number;
  planHash: string;
  status: "draft" | "awaiting_approval" | "approved" | "submitted" | "rejected";
  steps: PlanStep[];
  capabilitySnapshotRevision: string;
  createdAt: string;
};

export type Approval = {
  approvalId: string;
  planId: string;
  planRevision: number;
  tenantId: string;
  actorId: number;
  decision: "approved" | "rejected";
  decidedAt: string;
};

export type DecisionRecord = {
  decisionId: string;
  planId: string;
  planRevision: number;
  policyVersion: string;
  outcome: "allow" | "deny" | "needs_approval";
  reasons: string[];
};

function fail(message: string, details?: Record<string, unknown>): never {
  throw new JobControlPlaneError(
    "ORCHESTRATION_CONTRACT_INVALID",
    message,
    details
  );
}

function requiredText(
  value: unknown,
  field: string,
  maxLength: number
): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    fail(`${field} is invalid`);
  }
  return value.trim();
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stableValue(child)])
    );
  }
  return typeof value === "string" ? value.normalize("NFC") : value;
}

export function hashPlanSteps(steps: readonly PlanStep[]): string {
  const serialized = JSON.stringify(stableValue(steps));
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}

export function normalizeUniversalCommand(input: {
  commandId: string;
  tenantId: string;
  actorId: number;
  channel: CommandChannel;
  text: string;
  requestedAt?: string;
  idempotencyKey: string;
  pageContext?: UniversalCommand["pageContext"];
}): UniversalCommand {
  const commandId = requiredText(input.commandId, "commandId", 128);
  const tenantId = requiredText(input.tenantId, "tenantId", 36);
  if (!Number.isSafeInteger(input.actorId) || input.actorId <= 0)
    fail("actorId is invalid");
  if (
    !["chat", "assistant", "api", "scheduled", "operator"].includes(
      input.channel
    )
  )
    fail("channel is invalid");
  const text = requiredText(input.text, "text", 24_000);
  const idempotencyKey = requiredText(
    input.idempotencyKey,
    "idempotencyKey",
    128
  );
  const requestedAt = input.requestedAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(requestedAt))) fail("requestedAt is invalid");
  if (
    input.pageContext !== undefined &&
    (!input.pageContext ||
      typeof input.pageContext !== "object" ||
      Array.isArray(input.pageContext))
  ) {
    fail("pageContext is invalid");
  }
  for (const [field, value, maxLength] of [
    ["pageContext.route", input.pageContext?.route, 300],
    ["pageContext.resourceId", input.pageContext?.resourceId, 200],
  ] as const) {
    if (
      value !== undefined &&
      (typeof value !== "string" || value.length > maxLength)
    )
      fail(`${field} is invalid`);
  }
  return {
    commandId,
    tenantId,
    actorId: input.actorId,
    channel: input.channel,
    text,
    requestedAt: new Date(requestedAt).toISOString(),
    idempotencyKey,
    pageContext: input.pageContext
      ? {
          route: input.pageContext.route?.trim(),
          resourceId: input.pageContext.resourceId?.trim(),
        }
      : undefined,
  };
}

export function buildGoal(
  command: UniversalCommand,
  goalId: string,
  constraints: Record<string, unknown> = {}
): Goal {
  const normalizedGoalId = requiredText(goalId, "goalId", 128);
  return {
    goalId: normalizedGoalId,
    tenantId: command.tenantId,
    commandId: command.commandId,
    objective: command.text,
    constraints,
    createdAt: command.requestedAt,
  };
}

export function compilePlan(input: {
  goal: Goal;
  offers: readonly CapabilityOffer[];
  capabilitySnapshotRevision: string;
  planId: string;
  revision?: number;
}): PlanRevision {
  const planId = requiredText(input.planId, "planId", 128);
  const capabilitySnapshotRevision = requiredText(
    input.capabilitySnapshotRevision,
    "capabilitySnapshotRevision",
    128
  );
  if (
    !input.goal.tenantId.length ||
    !input.offers.length ||
    !Number.isSafeInteger(input.revision ?? 1) ||
    (input.revision ?? 1) < 1
  )
    fail("No executable capability offer is available");
  const available = input.offers.filter(offer => offer.available);
  if (available.length !== input.offers.length)
    fail("Plan contains unavailable capability offers");
  const offerIds = available.map(offer =>
    requiredText(offer.offerId, "offerId", 128)
  );
  if (new Set(offerIds).size !== offerIds.length)
    fail("Plan contains duplicate capability offers");
  const steps = available.map((offer, index): PlanStep => ({
    stepId: `${planId}:step:${index + 1}`,
    selectedOfferId: offerIds[index],
    capabilityId: offer.capabilityId,
    jobType: offer.jobType,
    executionClass: offer.executionClass,
    input: { goalId: input.goal.goalId, objective: input.goal.objective },
    dependsOn: index === 0 ? [] : [`${planId}:step:${index}`],
    requiresApproval: offer.requiresApproval === true,
  }));
  const requiresApproval = steps.some(step => step.requiresApproval);
  return {
    planId,
    goalId: input.goal.goalId,
    tenantId: input.goal.tenantId,
    revision: input.revision ?? 1,
    planHash: hashPlanSteps(steps),
    status: requiresApproval ? "awaiting_approval" : "draft",
    steps,
    capabilitySnapshotRevision,
    createdAt: new Date().toISOString(),
  };
}

export function buildJobDefinitions(plan: PlanRevision): JobDefinition[] {
  if (plan.status !== "approved" && plan.status !== "submitted") {
    fail("Only an approved plan can be handed to the Job control plane");
  }
  if (plan.planHash !== hashPlanSteps(plan.steps)) {
    fail("Plan hash does not match the approved steps");
  }
  return plan.steps.map((step, index) => ({
    contractVersion: "feature-186-v1",
    tenantId: plan.tenantId,
    jobType: step.jobType,
    executionClass: step.executionClass,
    input: {
      ...step.input,
      orchestration: {
        planId: plan.planId,
        planRevision: plan.revision,
        planHash: plan.planHash,
        stepId: step.stepId,
        stepIndex: index + 1,
        totalSteps: plan.steps.length,
        selectedOfferId: step.selectedOfferId,
        dependsOnStepIds: [...step.dependsOn],
      },
    },
    idempotencyKey:
      `plan:${plan.planId}:revision:${plan.revision}:step:${step.stepId}`.slice(
        0,
        128
      ),
    retryPolicy: {
      maxAttempts: 2,
      baseDelayMs: 1_000,
      maxDelayMs: 60_000,
      jitter: "bounded",
      deadlineMs: 3_600_000,
      allowedErrorClasses: ["timeout", "unavailable"],
    },
    timeoutPolicy: { softTimeoutMs: 300_000, hardTimeoutMs: 3_600_000 },
    requiredCapabilities: {
      capabilityId: step.capabilityId,
      snapshotRevision: plan.capabilitySnapshotRevision,
    },
  }));
}
