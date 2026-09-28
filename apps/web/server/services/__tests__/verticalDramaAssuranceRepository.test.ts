import { describe, expect, it } from "vitest";
import { createVerticalDramaAssuranceMemoryRepository } from "../verticalDramaAssuranceRepository";

const admission = {
  executionId: "execution-1",
  attemptId: "attempt-1",
  tenantId: "tenant-a",
  userId: 7,
  surface: "draft_qc",
  domainTaskKind: "draft_qc",
  domainOwnerType: "draft",
  domainOwnerId: "draft-1",
  sourceFingerprint: "a".repeat(64),
  contextFingerprint: "b".repeat(64),
  contractHash: "c".repeat(64),
  policyHash: "d".repeat(64),
  idempotencyKey: "caller-key",
};

describe("vertical drama assurance repository", () => {
  it("deduplicates racing scoped admissions into one execution, attempt, and admitted event", async () => {
    const repository = createVerticalDramaAssuranceMemoryRepository();
    const [first, second] = await Promise.all([
      repository.admit(admission),
      repository.admit(admission),
    ]);

    expect(first.execution.executionId).toBe(second.execution.executionId);
    expect(first.attempt.attemptId).toBe(second.attempt.attemptId);
    expect(
      await repository.events(admission.tenantId, admission.executionId)
    ).toHaveLength(1);
  });

  it("fails closed across tenants and preserves immutable parent attempt facts on retry", async () => {
    const repository = createVerticalDramaAssuranceMemoryRepository();
    await repository.admit(admission);
    expect(
      await repository.getExecution(
        "tenant-b",
        admission.executionId,
        admission.domainOwnerType,
        admission.domainOwnerId
      )
    ).toBeNull();
    const lease = await repository.claimLease({
      tenantId: "tenant-a",
      executionId: "execution-1",
      workerId: "worker-a",
    });
    if (!lease.ok) throw new Error("expected lease");
    await repository.append({
      tenantId: "tenant-a",
      executionId: "execution-1",
      attemptId: "attempt-1",
      expectedFenceToken: lease.fenceToken,
      eventIdempotencyKey: "run",
      nextState: "running",
      reasonCode: "worker_started",
    });
    await repository.append({
      tenantId: "tenant-a",
      executionId: "execution-1",
      attemptId: "attempt-1",
      expectedFenceToken: lease.fenceToken,
      eventIdempotencyKey: "retry",
      nextState: "retryable_failed",
      reasonCode: "retryable",
    });

    const child = await repository.createChildAttempt({
      tenantId: admission.tenantId,
      executionId: admission.executionId,
      parentAttemptId: admission.attemptId,
      attemptId: "attempt-2",
    });
    expect(child.parentAttemptId).toBe(admission.attemptId);
    expect(child.sourceFingerprint).toBe(admission.sourceFingerprint);
    expect(child.budget).toBeNull();
  });

  it("makes append idempotent, cursor-ordered, and fence-protected", async () => {
    const repository = createVerticalDramaAssuranceMemoryRepository();
    await repository.admit(admission);
    const lease = await repository.claimLease({
      tenantId: "tenant-a",
      executionId: "execution-1",
      workerId: "worker-a",
      now: new Date(0),
      leaseMs: 100,
    });
    expect(lease.ok).toBe(true);
    if (!lease.ok) return;

    const event = await repository.append({
      tenantId: "tenant-a",
      executionId: "execution-1",
      attemptId: "attempt-1",
      expectedFenceToken: lease.fenceToken,
      eventIdempotencyKey: "run",
      nextState: "running",
      reasonCode: "worker_started",
    });
    const duplicate = await repository.append({
      tenantId: "tenant-a",
      executionId: "execution-1",
      attemptId: "attempt-1",
      expectedFenceToken: lease.fenceToken,
      eventIdempotencyKey: "run",
      nextState: "running",
      reasonCode: "worker_started",
    });
    expect(duplicate.sequence).toBe(event.sequence);
    expect(
      (
        await repository.getExecution(
          "tenant-a",
          "execution-1",
          "draft",
          "draft-1"
        )
      )?.eventCursor
    ).toBe(2);

    const replacement = await repository.claimLease({
      tenantId: "tenant-a",
      executionId: "execution-1",
      workerId: "worker-b",
      now: new Date(101),
      leaseMs: 100,
    });
    expect(replacement.ok).toBe(true);
    await expect(
      repository.append({
        tenantId: "tenant-a",
        executionId: "execution-1",
        attemptId: "attempt-1",
        expectedFenceToken: lease.fenceToken,
        eventIdempotencyKey: "late-success",
        nextState: "succeeded",
        reasonCode: "late_worker",
      })
    ).rejects.toThrow("VD_ASSURANCE_LEASE_LOST");
  });

  it("returns a single acceptance on finalization redelivery and records stale CAS without overwriting", async () => {
    const repository = createVerticalDramaAssuranceMemoryRepository();
    await repository.admit(admission);
    const lease = await repository.claimLease({
      tenantId: "tenant-a",
      executionId: "execution-1",
      workerId: "worker-a",
    });
    if (!lease.ok) throw new Error("expected lease");
    await repository.append({
      tenantId: "tenant-a",
      executionId: "execution-1",
      attemptId: "attempt-1",
      expectedFenceToken: lease.fenceToken,
      eventIdempotencyKey: "run",
      nextState: "running",
      reasonCode: "worker_started",
    });

    const accepted = await repository.finalize({
      tenantId: "tenant-a",
      executionId: "execution-1",
      attemptId: "attempt-1",
      expectedFenceToken: lease.fenceToken,
      finalizationKey: "final-1",
      activate: async () => ({
        kind: "accepted",
        domainRef: "draft-version-2",
      }),
    });
    const redelivery = await repository.finalize({
      tenantId: "tenant-a",
      executionId: "execution-1",
      attemptId: "attempt-1",
      expectedFenceToken: lease.fenceToken,
      finalizationKey: "final-1",
      activate: async () => ({ kind: "stale", reasonCode: "must_not_run" }),
    });
    expect(accepted).toEqual(redelivery);

    const staleRepository = createVerticalDramaAssuranceMemoryRepository();
    await staleRepository.admit(admission);
    const staleLease = await staleRepository.claimLease({
      tenantId: "tenant-a",
      executionId: "execution-1",
      workerId: "worker-a",
    });
    if (!staleLease.ok) throw new Error("expected lease");
    await staleRepository.append({
      tenantId: "tenant-a",
      executionId: "execution-1",
      attemptId: "attempt-1",
      expectedFenceToken: staleLease.fenceToken,
      eventIdempotencyKey: "run",
      nextState: "running",
      reasonCode: "worker_started",
    });
    const stale = await staleRepository.finalize({
      tenantId: "tenant-a",
      executionId: "execution-1",
      attemptId: "attempt-1",
      expectedFenceToken: staleLease.fenceToken,
      finalizationKey: "final-stale",
      activate: async () => ({
        kind: "stale",
        reasonCode: "VD_ASSURANCE_CURRENT_VERSION_CONFLICT",
      }),
    });
    expect(stale.state).toBe("stale");
  });
});
