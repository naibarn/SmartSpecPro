import { describe, expect, it, vi } from "vitest";

import { createJobReporter } from "../jobReporter";

describe("canonical job reporter port", () => {
  it("forwards every operation with the complete lease context", async () => {
    const lease = { jobId: "job-1", attemptId: "attempt-1", leaseToken: "token", fencingVersion: 4, expiresAt: "" };
    const controlPlane = {
      heartbeat: vi.fn().mockResolvedValue(undefined),
      progress: vi.fn().mockResolvedValue(undefined),
      waitForExternal: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
      assertActive: vi.fn().mockResolvedValue(undefined),
    };
    const reporter = createJobReporter(controlPlane);

    await reporter.heartbeat(lease);
    await reporter.progress(lease, { progress: 10, stage: "work" });
    await reporter.waitForExternal(lease, { operationKey: "op-1", resumeAfter: "2026-09-13T00:00:00.000Z" });
    await reporter.complete(lease, { resultRef: "artifact:1" });
    await reporter.fail(lease, { code: "temporary", message: "retry", class: "retryable" });
    await reporter.assertActive(lease);

    expect(controlPlane.heartbeat).toHaveBeenCalledWith(lease);
    expect(controlPlane.progress).toHaveBeenCalledWith(lease, { progress: 10, stage: "work" });
    expect(controlPlane.complete).toHaveBeenCalledWith(lease, { resultRef: "artifact:1" });
    expect(controlPlane.fail).toHaveBeenCalledWith(lease, { code: "temporary", message: "retry", class: "retryable" });
  });
});
