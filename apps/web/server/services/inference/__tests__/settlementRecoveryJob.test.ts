import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  reconcile: vi.fn(),
  listPending: vi.fn(),
  deliverPending: vi.fn(),
}));

vi.mock("../executionCoordinator", () => ({
  reconcileInferenceAttemptSettlement: (...args: unknown[]) => state.reconcile(...args),
}));
vi.mock("../durableCreditReservation", () => ({
  settleDurableInferenceCreditReservation: vi.fn(),
}));
vi.mock("../persistence", () => ({
  listPendingInferenceSettlementAttempts: (...args: unknown[]) => state.listPending(...args),
}));
vi.mock("../../chatService", () => ({
  deliverPendingInferenceChatResponses: (...args: unknown[]) => state.deliverPending(...args),
}));

import {
  enqueueInferenceSettlementRecovery,
  executeInferenceSettlementRecoveryJob,
  executeInferenceSettlementSweepJob,
  INFERENCE_SETTLEMENT_RECOVERY_JOB,
  INFERENCE_SETTLEMENT_SWEEP_JOB,
} from "../settlementRecoveryJob";
import { POSTGRES_NODE_JOB_TYPES } from "../../../jobs/feature186JobTypes";
import { defaultJobExecutorRegistry } from "../../jobExecutorRegistry";

describe("Spec 231 canonical settlement recovery job", () => {
  beforeEach(() => {
    state.reconcile.mockReset();
    state.listPending.mockReset().mockResolvedValue([]);
    state.deliverPending.mockReset().mockResolvedValue({ scanned: 0, delivered: 0, pending: 0 });
  });

  it("is registered only on the canonical PostgreSQL Node worker", () => {
    expect(POSTGRES_NODE_JOB_TYPES.has(INFERENCE_SETTLEMENT_RECOVERY_JOB.jobType)).toBe(true);
    expect(defaultJobExecutorRegistry.resolve(
      INFERENCE_SETTLEMENT_RECOVERY_JOB.jobType,
      INFERENCE_SETTLEMENT_RECOVERY_JOB.contractVersion,
    )?.executor).toBe(executeInferenceSettlementRecoveryJob);
    expect(POSTGRES_NODE_JOB_TYPES.has(INFERENCE_SETTLEMENT_SWEEP_JOB.jobType)).toBe(true);
    expect(defaultJobExecutorRegistry.resolve(
      INFERENCE_SETTLEMENT_SWEEP_JOB.jobType,
      INFERENCE_SETTLEMENT_SWEEP_JOB.contractVersion,
    )?.executor).toBe(executeInferenceSettlementSweepJob);
  });

  it("creates a tenant-scoped idempotent worker_jobs admission without secrets", async () => {
    const create = vi.fn(async () => ({ jobId: "job-1", created: true }));

    await expect(enqueueInferenceSettlementRecovery({
      tenantId: "tenant-1",
      attemptId: "attempt:secret-looking-id",
    }, { create: create as never })).resolves.toEqual({ jobId: "job-1", created: true });

    const [job] = create.mock.calls[0] as any[];
    expect(job.context).toMatchObject({
      tenantId: "tenant-1",
      actorType: "system",
      authorizationScope: "system:spec231-inference-settlement",
    });
    expect(job.context.idempotencyKey).toMatch(/^spec231:settlement:[a-f0-9]{64}$/);
    expect(job.definition).toMatchObject({
      contractVersion: INFERENCE_SETTLEMENT_RECOVERY_JOB.contractVersion,
      jobType: INFERENCE_SETTLEMENT_RECOVERY_JOB.jobType,
      executionClass: "short",
      input: { attemptId: "attempt:secret-looking-id" },
      retryPolicy: { maxAttempts: 8, allowedErrorClasses: ["retryable"] },
    });
    expect(job.context.idempotencyKey).not.toContain("secret-looking-id");
  });

  it("validates input and reports success only after reconciliation", async () => {
    const reporter = { assertActive: vi.fn(async () => undefined) };
    state.reconcile.mockResolvedValue({ status: "settled", attemptId: "attempt-1" });

    const result = await executeInferenceSettlementRecoveryJob({
      context: { tenantId: "tenant-1", input: { attemptId: "attempt-1" } },
      lease: { jobId: "job-1", attemptId: "job-attempt-1" },
      reporter,
    } as any);

    expect(result).toEqual({ output: { attemptId: "attempt-1", settlement: "settled" } });
    expect(reporter.assertActive).toHaveBeenCalledTimes(2);
    expect(state.reconcile).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: "attempt-1",
      tenantId: "tenant-1",
    }));
  });

  it("retries a pending owner settlement and fails closed on missing receipt evidence", async () => {
    const reporter = { assertActive: vi.fn(async () => undefined) };
    state.reconcile.mockResolvedValueOnce({
      status: "pending",
      attemptId: "attempt-1",
      reason: "OWNER_REJECTED",
    });
    await expect(executeInferenceSettlementRecoveryJob({
      context: { tenantId: "tenant-1", input: { attemptId: "attempt-1" } },
      lease: { jobId: "job-1", attemptId: "job-attempt-1" },
      reporter,
    } as any)).rejects.toMatchObject({ class: "retryable", code: "INFERENCE_SETTLEMENT_PENDING" });

    state.reconcile.mockResolvedValueOnce({
      status: "not_settleable",
      attemptId: "attempt-1",
      reason: "ATTEMPT_NOT_FOUND_OR_NOT_COMPLETED",
    });
    await expect(executeInferenceSettlementRecoveryJob({
      context: { tenantId: "tenant-1", input: { attemptId: "attempt-1" } },
      lease: { jobId: "job-1", attemptId: "job-attempt-1" },
      reporter,
    } as any)).rejects.toMatchObject({
      class: "unknown",
      code: "INFERENCE_SETTLEMENT_EVIDENCE_INVALID",
      operatorReviewRequired: true,
    });
  });

  it("sweeps durable completed attempts after a process crash gap without provider replay", async () => {
    const reporter = { assertActive: vi.fn(async () => undefined) };
    state.listPending.mockResolvedValue([
      { attemptId: "attempt-settled", tenantId: "tenant-1" },
      { attemptId: "attempt-pending", tenantId: "tenant-2" },
      { attemptId: "attempt-invalid", tenantId: "tenant-3" },
    ]);
    state.reconcile
      .mockResolvedValueOnce({ status: "settled", attemptId: "attempt-settled" })
      .mockResolvedValueOnce({ status: "pending", attemptId: "attempt-pending", reason: "OWNER_REJECTED" })
      .mockResolvedValueOnce({ status: "not_settleable", attemptId: "attempt-invalid", reason: "ATTEMPT_NOT_FOUND_OR_NOT_COMPLETED" });

    await expect(executeInferenceSettlementSweepJob({
      context: { tenantId: "system-tenant", input: {} },
      lease: { jobId: "sweep-job", attemptId: "sweep-attempt" },
      reporter,
    } as any)).resolves.toEqual({
      output: { scanned: 3, settled: 1, stillPending: 1, invalidEvidence: 1, responseDeliveries: 0, responseDeliveriesPending: 0 },
    });
    expect(state.listPending).toHaveBeenCalledWith(50);
    expect(state.reconcile).toHaveBeenCalledTimes(3);
    expect(reporter.assertActive).toHaveBeenCalledTimes(5);
  });

  it("recovers settled Chat output through the same worker_jobs sweep", async () => {
    const reporter = { assertActive: vi.fn(async () => undefined) };
    state.deliverPending.mockResolvedValue({ scanned: 2, delivered: 1, pending: 1 });
    await expect(executeInferenceSettlementSweepJob({
      context: { tenantId: "system-tenant", input: {} },
      lease: { jobId: "sweep-job", attemptId: "sweep-attempt" },
      reporter,
    } as any)).resolves.toEqual({
      output: { scanned: 0, settled: 0, stillPending: 0, invalidEvidence: 0, responseDeliveries: 1, responseDeliveriesPending: 1 },
    });
    expect(state.deliverPending).toHaveBeenCalledWith(50);
  });
});
