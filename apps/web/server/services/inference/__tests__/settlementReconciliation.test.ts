import { describe, expect, it, vi } from "vitest";
import { reconcileInferenceAttemptSettlement } from "../executionCoordinator";
import type { InferenceAttemptReceipt } from "../contracts";

const receipt: InferenceAttemptReceipt = {
  planId: "plan-1",
  attemptId: "attempt-1",
  attemptOrdinal: 1,
  actualModel: "native:model-1",
  providerId: "provider-1",
  credentialOwnerRef: "credential-owner-1",
  deploymentId: "deployment-1",
  outcome: "completed",
  submissionState: "submitted",
  streamCommitted: false,
  chargedCostMicros: 1_001,
  observedExecution: {
    model: "native:model-1",
    providerId: "provider-1",
    credentialOwnerRef: "credential-owner-1",
    deploymentId: "deployment-1",
    endpointSurface: "responses_compatible",
  },
};

describe("Spec 231 settlement reconciliation", () => {
  it("retries owner settlement from the stored receipt without provider execution", async () => {
    const settleCompletedAttempt = vi.fn(async () => true);
    const record = vi.fn(async () => undefined);
    const load = vi.fn(async () => ({
      reservationId: "reservation-1",
      receipt,
    }));

    await expect(reconcileInferenceAttemptSettlement({
      attemptId: receipt.attemptId,
      settleCompletedAttempt,
      load,
      record,
    })).resolves.toEqual({ status: "settled", attemptId: "attempt-1" });
    expect(load).toHaveBeenCalledWith("attempt-1");
    expect(settleCompletedAttempt).toHaveBeenCalledWith({
      reservationId: "reservation-1",
      settlementKey: "attempt-1",
      chargedCostMicros: 1_001,
      receipt,
    });
    expect(record).toHaveBeenCalledWith({
      planId: "plan-1",
      attemptId: "attempt-1",
      status: "settled",
      chargedCostMicros: 1_001,
    });
  });

  it("leaves a failed owner retry pending and records the typed reason", async () => {
    const record = vi.fn(async () => undefined);
    await expect(reconcileInferenceAttemptSettlement({
      attemptId: receipt.attemptId,
      settleCompletedAttempt: async () => false,
      load: async () => ({ reservationId: "reservation-1", receipt }),
      record,
    })).resolves.toEqual({
      status: "pending",
      attemptId: "attempt-1",
      reason: "OWNER_REJECTED",
    });
    expect(record).toHaveBeenCalledWith({
      planId: "plan-1",
      attemptId: "attempt-1",
      status: "pending",
      reason: "OWNER_REJECTED",
    });
  });

  it("refuses missing attempts and receipts without measured cost", async () => {
    const settleCompletedAttempt = vi.fn(async () => true);
    const noRecord = await reconcileInferenceAttemptSettlement({
      attemptId: "missing",
      settleCompletedAttempt,
      load: async () => null,
      record: async () => undefined,
    });
    const noCost = await reconcileInferenceAttemptSettlement({
      attemptId: receipt.attemptId,
      settleCompletedAttempt,
      load: async () => ({
        reservationId: "reservation-1",
        receipt: { ...receipt, chargedCostMicros: undefined },
      }),
      record: async () => undefined,
    });
    expect(noRecord.status).toBe("not_settleable");
    expect(noCost.status).toBe("not_settleable");
    expect(settleCompletedAttempt).not.toHaveBeenCalled();
  });

  it("keeps the result pending if the durable lifecycle event cannot be written", async () => {
    await expect(reconcileInferenceAttemptSettlement({
      attemptId: receipt.attemptId,
      settleCompletedAttempt: async () => true,
      load: async () => ({ reservationId: "reservation-1", receipt }),
      record: async () => { throw new Error("database unavailable"); },
    })).resolves.toEqual({
      status: "pending",
      attemptId: "attempt-1",
      reason: "AUDIT_WRITE_FAILED",
    });
  });
});
