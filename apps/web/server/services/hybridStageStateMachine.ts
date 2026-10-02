import { z } from "zod";

import { hybridExecutionStatusSchema, type HybridExecutionStatus } from "@shared/orchestration/hybridOrchestration";

const transitionActionSchema = z.enum(["start", "stage_succeeded", "needs_approval", "approve", "reject", "repair", "commit", "complete", "fail", "cancel", "expire", "retry"]);

export type HybridStateTransitionAction = z.infer<typeof transitionActionSchema>;

const allowedTransitions: Record<HybridExecutionStatus, Partial<Record<HybridStateTransitionAction, HybridExecutionStatus>>> = {
  draft_preview: {
    start: "ready_to_start",
    expire: "expired",
    cancel: "cancelled",
  },
  ready_to_start: {
    start: "running_stage",
    fail: "failed",
    cancel: "cancelled",
  },
  running: {
    stage_succeeded: "running_stage",
    needs_approval: "awaiting_approval",
    complete: "completed",
    fail: "failed",
    cancel: "cancelled",
  },
  running_stage: {
    stage_succeeded: "running_stage",
    needs_approval: "awaiting_approval",
    commit: "committing",
    complete: "completed",
    fail: "failed",
    cancel: "cancelled",
  },
  awaiting_approval: {
    approve: "committing",
    reject: "repairing",
    expire: "expired",
    cancel: "cancelled",
  },
  needs_revision: {
    repair: "repairing",
    cancel: "cancelled",
  },
  repairing: {
    retry: "running_stage",
    fail: "failed",
    cancel: "cancelled",
  },
  committing: {
    complete: "completed",
    fail: "failed",
    retry: "committing",
    cancel: "cancelled",
  },
  completed: {},
  cancelled: {},
  failed: {
    retry: "repairing",
  },
  expired: {},
};

export function transitionHybridExecutionStatus(
  currentStatus: HybridExecutionStatus,
  action: HybridStateTransitionAction,
): HybridExecutionStatus {
  const current = hybridExecutionStatusSchema.parse(currentStatus);
  const parsedAction = transitionActionSchema.parse(action);
  const next = allowedTransitions[current][parsedAction];
  if (!next) {
    throw new Error(`Invalid Hybrid state transition: ${current} -> ${parsedAction}`);
  }
  return next;
}

export function canTransitionHybridExecutionStatus(
  currentStatus: HybridExecutionStatus,
  action: HybridStateTransitionAction,
): boolean {
  try {
    transitionHybridExecutionStatus(currentStatus, action);
    return true;
  } catch {
    return false;
  }
}
