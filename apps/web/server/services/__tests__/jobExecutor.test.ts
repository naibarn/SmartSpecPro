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
});
