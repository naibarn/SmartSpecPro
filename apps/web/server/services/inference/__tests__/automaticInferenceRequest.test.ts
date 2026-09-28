import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  prepare: vi.fn(),
  bindings: vi.fn(),
  execute: vi.fn(),
  loader: vi.fn(),
  settlement: vi.fn(),
  close: vi.fn(),
  enqueueRecovery: vi.fn(),
}));

vi.mock("../prepareInferencePlan", () => ({
  prepareAndPersistInferencePlan: (...args: unknown[]) => state.prepare(...args),
}));
vi.mock("../llmRouterAttemptAdapter", () => ({
  createLlmRouterExecutionBindings: (...args: unknown[]) => state.bindings(...args),
}));
vi.mock("../executionCoordinator", () => ({
  executeInferencePlan: (...args: unknown[]) => state.execute(...args),
}));
vi.mock("../durableCreditReservation", () => ({
  loadDurableInferenceReservationAuthority: (...args: unknown[]) => state.loader(...args),
  settleDurableInferenceCreditReservation: (...args: unknown[]) => state.settlement(...args),
  closeDurableInferenceCreditReservation: (...args: unknown[]) => state.close(...args),
}));
vi.mock("../settlementRecoveryJob", () => ({
  enqueueInferenceSettlementRecovery: (...args: unknown[]) => state.enqueueRecovery(...args),
}));

import { executePolicyRoutedInference } from "../automaticInferenceRequest";

describe("Spec 231 policy-routed inference request facade", () => {
  const bindings = {
    resolveCandidate: vi.fn(),
    loadReservationAuthority: vi.fn(),
    settleCompletedAttempt: vi.fn(),
    executeAttempt: vi.fn(),
    providerIdempotencyCertified: vi.fn(),
  };
  const input = () => ({
    request: { selection: { mode: "AUTO" } },
    owners: {
      requestContext: {
        tenantId: "tenant-1",
        principalId: "user:7",
      },
    } as never,
    context: { creditReservationId: "reservation-1" } as never,
    reservation: {
      reservationId: "reservation-1",
      tenantId: "tenant-1",
      principalRef: "user:7",
      availableBudgetMicros: 10_000,
      expiresAt: "2026-09-28T00:00:00.000Z",
      status: "reserved" as const,
    },
    userId: 7,
    messages: [{ role: "user", content: "hello" }],
    stream: false,
    attemptOwnershipEpoch: 1,
    ownerToken: "worker-owner-token",
    now: new Date("2026-09-27T00:00:00.000Z"),
  });

  beforeEach(() => {
    state.prepare.mockReset().mockResolvedValue({
      status: "plan_persisted",
      created: true,
      planId: "plan-1",
      plan: { planId: "plan-1", routePolicyRevision: "route-policy-1" },
      intent: { tenantId: "tenant-1", principalId: "user:7" },
      selectedDeploymentId: "deployment-1",
      registryRevision: "registry-1",
      authorityRevision: "authority-1",
    });
    state.bindings.mockReset().mockReturnValue(bindings);
    state.execute.mockReset().mockResolvedValue({
      status: "completed",
      response: { text: "ok" },
    });
    state.loader.mockReset().mockReturnValue(vi.fn());
    state.settlement.mockReset().mockReturnValue(vi.fn());
    state.close.mockReset().mockResolvedValue(true);
    state.enqueueRecovery.mockReset().mockResolvedValue({ jobId: "job-recovery-1", created: true });
  });

  it("plans from policy, binds the canonical owner and executes the pinned plan", async () => {
    const args = input();
    const result = await executePolicyRoutedInference(args);

    expect(result).toMatchObject({
      status: "executed",
      planning: { planId: "plan-1", selectedDeploymentId: "deployment-1" },
      execution: { status: "completed" },
    });
    expect(state.prepare).toHaveBeenCalledWith(expect.objectContaining({
      request: args.request,
      owners: args.owners,
      context: args.context,
      reservation: args.reservation,
    }));
    expect(state.bindings).toHaveBeenCalledWith(expect.objectContaining({
      intent: { tenantId: "tenant-1", principalId: "user:7" },
      expectedRegistryRevision: "registry-1",
      expectedRouterPolicyRevision: "route-policy-1",
      userId: 7,
      messages: args.messages,
      stream: false,
      loadReservationAuthority: expect.any(Function),
      settleCompletedAttempt: expect.any(Function),
    }));
    expect(state.execute).toHaveBeenCalledWith(expect.objectContaining({
      plan: { planId: "plan-1", routePolicyRevision: "route-policy-1" },
      intent: { tenantId: "tenant-1", principalId: "user:7" },
      workerJobAttemptId: undefined,
      attemptOwnershipEpoch: 1,
      ownerToken: "worker-owner-token",
      ...bindings,
    }));
    expect(state.close).toHaveBeenCalledWith({ reservationId: "reservation-1" });
  });

  it("does not execute or resolve a provider when policy planning is blocked", async () => {
    state.prepare.mockResolvedValue({ status: "planning_blocked", reason: "SOURCE_UNAVAILABLE" });
    const result = await executePolicyRoutedInference(input());
    expect(result).toEqual({
      status: "not_executable",
      planning: { status: "planning_blocked", reason: "SOURCE_UNAVAILABLE" },
    });
    expect(state.bindings).not.toHaveBeenCalled();
    expect(state.execute).not.toHaveBeenCalled();
  });

  it("admits pending settlement recovery through the canonical job adapter", async () => {
    state.execute.mockResolvedValue({
      status: "settlement_pending",
      receipt: { attemptId: "attempt-1", chargedCostMicros: 1_000 },
      reason: "OWNER_REJECTED",
    });

    const result = await executePolicyRoutedInference(input());

    expect(result).toMatchObject({
      status: "executed",
      execution: { status: "settlement_pending" },
      settlementRecovery: "queued",
    });
    expect(state.enqueueRecovery).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      attemptId: "attempt-1",
    });
  });

  it("keeps output withheld and reports failed job admission when canonical enqueue fails", async () => {
    state.execute.mockResolvedValue({
      status: "settlement_pending",
      receipt: { attemptId: "attempt-1", chargedCostMicros: 1_000 },
      reason: "AUDIT_WRITE_FAILED",
    });
    state.enqueueRecovery.mockRejectedValue(new Error("outbox unavailable"));

    const result = await executePolicyRoutedInference(input());

    expect(result).toMatchObject({
      execution: { status: "settlement_pending" },
      settlementRecovery: "admission_failed",
    });
  });

  it("requires manual review when a completed receipt has no measured cost", async () => {
    state.execute.mockResolvedValue({
      status: "settlement_pending",
      receipt: { attemptId: "attempt-no-cost" },
      reason: "COST_UNAVAILABLE",
    });
    const result = await executePolicyRoutedInference(input());
    expect(result).toMatchObject({
      execution: { status: "settlement_pending" },
      settlementRecovery: "manual_review_required",
    });
    expect(state.enqueueRecovery).not.toHaveBeenCalled();
  });

  it("rejects incomplete canonical job ownership before creating a plan", async () => {
    const args = { ...input(), workerJobId: "job-1" };
    await expect(executePolicyRoutedInference(args)).resolves.toMatchObject({
      status: "not_executable",
      reason: "INCOMPLETE_WORKER_JOB_OWNERSHIP",
    });
    expect(state.prepare).not.toHaveBeenCalled();
  });
});
