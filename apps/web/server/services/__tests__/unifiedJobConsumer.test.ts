import { describe, expect, it, vi } from "vitest";

import { executeCanonicalJobEnvelope, validateCanonicalJobEnvelope } from "../../jobs/unifiedJobConsumer";
import { createJobExecutorRegistry } from "../jobExecutorRegistry";

describe("unified job consumer", () => {
  it("rejects envelope identity wider than the canonical persistence contract", () => {
    expect(() => validateCanonicalJobEnvelope({ jobId: "x".repeat(37), contractVersion: "feature-186-v1", businessAttempt: 1 })).toThrow("INVALID_JOB_ENVELOPE");
    expect(() => validateCanonicalJobEnvelope({ jobId: "job-1", contractVersion: "feature-186-v1", businessAttempt: 101 })).toThrow("INVALID_JOB_ENVELOPE");
  });

  it("rejects a contract mismatch before claim", async () => {
    const controlPlane = {
      getContext: vi.fn().mockResolvedValue({ jobId: "job-1", contractVersion: "feature-186-v1", attempt: 1, jobType: "maintenance.cleanup" }),
      rejectUnsupportedDelivery: vi.fn().mockResolvedValue(true),
      claim: vi.fn(),
    } as any;
    const registry = createJobExecutorRegistry();
    const result = await executeCanonicalJobEnvelope({ jobId: "job-1", contractVersion: "feature-186-v2", businessAttempt: 1 }, { controlPlane, executorRegistry: registry, runnerId: "r1", adapter: "bullmq" });
    expect(result).toEqual({ state: "rejected", jobId: "job-1" });
    expect(controlPlane.claim).not.toHaveBeenCalled();
    expect(controlPlane.rejectUnsupportedDelivery).toHaveBeenCalled();
  });

  it("claims and invokes only the registered canonical handler", async () => {
    const executor = vi.fn().mockResolvedValue({ output: { ok: true } });
    const controlPlane = {
      getContext: vi.fn().mockResolvedValue({ jobId: "job-1", contractVersion: "feature-186-v1", attempt: 1, jobType: "maintenance.cleanup" }),
      claim: vi.fn().mockResolvedValue({ jobId: "job-1", attemptId: "attempt-1", leaseToken: "secret", fencingVersion: 1, expiresAt: new Date().toISOString() }),
      start: vi.fn(),
      assertActive: vi.fn(),
      heartbeat: vi.fn(),
      progress: vi.fn(),
      waitForExternal: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    } as any;
    const registry = createJobExecutorRegistry([{
      jobType: "maintenance.cleanup",
      executionClass: "short",
      contractVersions: new Set(["feature-186-v1"]),
      executor,
    }]);
    const result = await executeCanonicalJobEnvelope({ jobId: "job-1", contractVersion: "feature-186-v1", businessAttempt: 1 }, { controlPlane, executorRegistry: registry, runnerId: "r1", adapter: "bullmq" });
    expect(result).toMatchObject({ state: "succeeded", jobId: "job-1" });
    expect(executor).toHaveBeenCalledTimes(1);
    expect(controlPlane.claim).toHaveBeenCalledWith({ jobId: "job-1", runnerId: "r1", adapter: "bullmq" });
  });

  it("ignores stale business-attempt delivery without terminalizing the current job", async () => {
    const controlPlane = {
      getContext: vi.fn().mockResolvedValue({ jobId: "job-1", contractVersion: "feature-186-v1", attempt: 2, jobType: "maintenance.cleanup" }),
      rejectUnsupportedDelivery: vi.fn(),
      claim: vi.fn(),
    } as any;
    const result = await executeCanonicalJobEnvelope(
      { jobId: "job-1", contractVersion: "feature-186-v1", businessAttempt: 1, attemptId: "attempt-1" },
      { controlPlane, executorRegistry: createJobExecutorRegistry(), runnerId: "r1", adapter: "bullmq" },
    );
    expect(result).toEqual({ state: "ignored", jobId: "job-1" });
    expect(controlPlane.rejectUnsupportedDelivery).not.toHaveBeenCalled();
    expect(controlPlane.claim).not.toHaveBeenCalled();
  });

  it("passes the attempt fence to claim when the envelope carries one", async () => {
    const executor = vi.fn().mockResolvedValue({ output: { ok: true } });
    const controlPlane = {
      getContext: vi.fn().mockResolvedValue({ jobId: "job-1", contractVersion: "feature-186-v1", attempt: 1, jobType: "maintenance.cleanup" }),
      claim: vi.fn().mockResolvedValue({ jobId: "job-1", attemptId: "attempt-1", leaseToken: "secret", fencingVersion: 1, expiresAt: new Date().toISOString() }),
      start: vi.fn(),
      assertActive: vi.fn(),
      heartbeat: vi.fn(),
      progress: vi.fn(),
      waitForExternal: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    } as any;
    const registry = createJobExecutorRegistry([{ jobType: "maintenance.cleanup", executionClass: "short", contractVersions: new Set(["feature-186-v1"]), executor }]);
    await executeCanonicalJobEnvelope(
      { jobId: "job-1", contractVersion: "feature-186-v1", businessAttempt: 1, attemptId: "attempt-1" },
      { controlPlane, executorRegistry: registry, runnerId: "r1", adapter: "bullmq" },
    );
    expect(controlPlane.claim).toHaveBeenCalledWith({ jobId: "job-1", runnerId: "r1", adapter: "bullmq", attemptId: "attempt-1" });
  });
});
