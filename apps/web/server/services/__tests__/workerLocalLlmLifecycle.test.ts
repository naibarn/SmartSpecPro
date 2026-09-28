import { describe, expect, it } from "vitest";
import { acceptWorkerLlmTerminalEvent, classifyWorkerLlmFailure, resolveWorkerLlmBilling, shouldInvalidateQueuedWorkerLlmJob } from "../workerLocalLlmLifecycle";

const readyModel = {
  enabled: true,
  tombstoned: false,
  readiness: "ready",
  workerStatus: "online",
  lastInventoryAt: new Date(),
};

describe("workerLocalLlmLifecycle", () => {
  it("is zero-cost and keeps skill fees policy-driven", () => {
    expect(resolveWorkerLlmBilling()).toEqual({ localInferenceCost: 0, platformFeeCredits: 0, skillFeePolicy: "existing_policy" });
  });

  it("invalidates queued work after ACL or revision changes", () => {
    expect(shouldInvalidateQueuedWorkerLlmJob({ actorId: 8, ownerId: 7, sharePolicy: { mode: "groups", groupIds: [10] }, activeGroupIds: [10], model: readyModel, requestedInventoryRevision: 1, currentInventoryRevision: 1 })).toBe(false);
    expect(shouldInvalidateQueuedWorkerLlmJob({ actorId: 8, ownerId: 7, sharePolicy: { mode: "private", groupIds: [] }, activeGroupIds: [10], model: readyModel, requestedInventoryRevision: 1, currentInventoryRevision: 1 })).toBe(true);
    expect(shouldInvalidateQueuedWorkerLlmJob({ actorId: 8, ownerId: 7, sharePolicy: { mode: "groups", groupIds: [10] }, activeGroupIds: [10], model: readyModel, requestedInventoryRevision: 1, currentInventoryRevision: 2 })).toBe(true);
  });

  it("rejects late terminal events from an old assignment", () => {
    expect(acceptWorkerLlmTerminalEvent({ currentStatus: "running", eventAssignmentId: "a1", currentAssignmentId: "a1" })).toBe(true);
    expect(acceptWorkerLlmTerminalEvent({ currentStatus: "running", eventAssignmentId: "a1", currentAssignmentId: "a2" })).toBe(false);
    expect(acceptWorkerLlmTerminalEvent({ currentStatus: "completed", eventAssignmentId: "a1", currentAssignmentId: "a1" })).toBe(false);
  });

  it("never enables cloud fallback for explicit local failures", () => {
    expect(classifyWorkerLlmFailure("provider_unavailable")).toEqual({ retryable: true, fallback: false });
    expect(classifyWorkerLlmFailure("provider_rejected")).toEqual({ retryable: false, fallback: false });
  });
});
