import { describe, expect, it, vi } from "vitest";

import { executeCanonicalJob } from "../jobExecutor";

describe("canonical job executor", () => {
  it("asserts the lease fence before entering the business executor", async () => {
    const lease = {
      jobId: "job-1",
      attemptId: "attempt-1",
      leaseToken: "token",
      fencingVersion: 2,
      expiresAt: "2026-09-13T00:00:00.000Z",
    };
    const calls: string[] = [];
    const controlPlane = {
      claim: vi.fn().mockResolvedValue(lease),
      getContext: vi.fn().mockResolvedValue({ jobId: "job-1", jobType: "demo" }),
      start: vi.fn().mockImplementation(async () => calls.push("start")),
      assertActive: vi.fn().mockImplementation(async () => calls.push("assert-active")),
      heartbeat: vi.fn(),
      progress: vi.fn(),
      waitForExternal: vi.fn(),
      complete: vi.fn().mockImplementation(async () => calls.push("complete")),
      fail: vi.fn(),
    } as any;

    const result = await executeCanonicalJob(
      { jobId: "job-1", runnerId: "runner-1", adapter: "fake" },
      { controlPlane, executor: vi.fn().mockImplementation(async () => {
        calls.push("executor");
        return { resultRef: "artifact:1" };
      }) },
    );

    expect(result).toMatchObject({ state: "succeeded", jobId: "job-1", attemptId: "attempt-1" });
    expect(calls).toEqual(["start", "assert-active", "executor", "complete"]);
  });

  it("leaves a paused execution deferred without writing a terminal success", async () => {
    const lease = {
      jobId: "job-2",
      attemptId: "attempt-2",
      leaseToken: "token",
      fencingVersion: 1,
      expiresAt: "2026-09-13T00:00:00.000Z",
    };
    const controlPlane = {
      claim: vi.fn().mockResolvedValue(lease),
      getContext: vi.fn().mockResolvedValue({ jobId: "job-2", jobType: "demo" }),
      start: vi.fn(),
      assertActive: vi.fn(),
      heartbeat: vi.fn(),
      progress: vi.fn(),
      waitForExternal: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    } as any;

    const result = await executeCanonicalJob(
      { jobId: "job-2", runnerId: "runner-1", adapter: "fake" },
      { controlPlane, executor: vi.fn().mockResolvedValue({ deferred: true, output: { status: "paused" } }) },
    );

    expect(result).toMatchObject({ state: "deferred", jobId: "job-2" });
    expect(controlPlane.complete).not.toHaveBeenCalled();
    expect(controlPlane.fail).not.toHaveBeenCalled();
  });
});
