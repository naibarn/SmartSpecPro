import type { WorkerLlmSharePolicy } from "./workerLocalLlmService";
import { canAccessWorkerLlmModel, isWorkerLlmRowSelectable } from "./workerLocalLlmService";

export type WorkerLlmBillingDecision = {
  localInferenceCost: 0;
  platformFeeCredits: 0;
  skillFeePolicy: "existing_policy";
};

export function resolveWorkerLlmBilling(): WorkerLlmBillingDecision {
  return { localInferenceCost: 0, platformFeeCredits: 0, skillFeePolicy: "existing_policy" };
}

export function shouldInvalidateQueuedWorkerLlmJob(input: {
  actorId: number;
  ownerId: number;
  sharePolicy: WorkerLlmSharePolicy;
  activeGroupIds: number[];
  model: Parameters<typeof isWorkerLlmRowSelectable>[0];
  requestedInventoryRevision: number;
  currentInventoryRevision: number;
}): boolean {
  if (!canAccessWorkerLlmModel({
    actorId: input.actorId,
    ownerId: input.ownerId,
    policy: input.sharePolicy,
    activeGroupIds: input.activeGroupIds,
  })) return true;
  if (!isWorkerLlmRowSelectable(input.model)) return true;
  return input.requestedInventoryRevision !== input.currentInventoryRevision;
}

export function acceptWorkerLlmTerminalEvent(input: {
  currentStatus: "queued" | "running" | "completed" | "failed" | "canceled" | "expired";
  eventAssignmentId: string;
  currentAssignmentId: string | null;
}): boolean {
  if (input.currentAssignmentId !== input.eventAssignmentId) return false;
  return input.currentStatus === "running";
}

export function classifyWorkerLlmFailure(code: string): { retryable: boolean; fallback: false } {
  // Local-only selection never silently falls back to a cloud gateway.
  return { retryable: ["provider_unavailable", "queue_timeout", "busy"].includes(code), fallback: false };
}
