import { describe, expect, it, vi } from "vitest";

import { DirectJobTransportAdapter } from "../jobDirectTransportAdapter";
import { createJobExecutorRegistry } from "../jobExecutorRegistry";

describe("DirectJobTransportAdapter", () => {
  it("executes a supported canonical envelope and deduplicates the publication", async () => {
    const execute = vi.fn().mockResolvedValue({ output: { ok: true } });
    const controlPlane = {
      getContext: vi.fn().mockResolvedValue({ jobId: "job-1", contractVersion: "feature-186-v1", attempt: 1, jobType: "webhook.dispatch", input: {} }),
      claim: vi.fn().mockResolvedValue({ jobId: "job-1", attemptId: "attempt-1", leaseToken: "secret", fencingVersion: 1, expiresAt: new Date().toISOString() }),
      start: vi.fn(), assertActive: vi.fn(), heartbeat: vi.fn(), progress: vi.fn(), waitForExternal: vi.fn(), complete: vi.fn(), fail: vi.fn(),
    } as any;
    const adapter = new DirectJobTransportAdapter({
      controlPlane,
      executorRegistry: createJobExecutorRegistry([{ jobType: "webhook.dispatch", executionClass: "short", contractVersions: new Set(["feature-186-v1"]), executor: execute }]),
      runnerId: "direct-1",
    }, new Set(["webhook.dispatch"]));
    const request = { jobId: "job-1", businessAttempt: 1, outboxId: "outbox-1", dedupeKey: "job:job-1:attempt:1", contractVersion: "feature-186-v1", routingMetadata: {} };

    const first = await adapter.publish(request);
    const second = await adapter.publish(request);

    expect(first).toEqual(second);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(await adapter.inspect(first)).toBe("consumed");
  });

  it("does not claim job types outside its hard-cutover allowlist", () => {
    const adapter = new DirectJobTransportAdapter({ controlPlane: {} as any, executorRegistry: createJobExecutorRegistry(), runnerId: "direct-1" }, new Set(["webhook.dispatch"]));
    expect(adapter.supports({ jobType: "media.generate", executionClass: "short", contractVersion: "feature-186-v1" })).toBe(false);
  });
});
