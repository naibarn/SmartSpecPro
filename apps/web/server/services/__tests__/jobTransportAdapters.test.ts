import { describe, expect, it, vi } from "vitest";

import {
  BullMqJobTransportAdapter,
  CeleryJobTransportAdapter,
  assertAdapterSupports,
} from "../jobTransportAdapters";

describe("job transport adapters", () => {
  it("publishes BullMQ messages with canonical identity and stable dedupe", async () => {
    const remove = vi.fn();
    const queue = {
      add: vi.fn().mockResolvedValue({ id: "bull-1" }),
      getJob: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: "bull-1", remove, finishedOn: undefined, failedReason: undefined }),
    };
    const adapter = new BullMqJobTransportAdapter(queue);
    const reference = await adapter.publish({
      jobId: "canonical-1",
      businessAttempt: 1,
      outboxId: "outbox-1",
      dedupeKey: "job:canonical-1:attempt:1",
      contractVersion: "feature-186-v1",
      routingMetadata: {},
    });

    expect(queue.add).toHaveBeenCalledWith("unified-job", expect.objectContaining({ jobId: "canonical-1" }), expect.objectContaining({ jobId: "job:canonical-1:attempt:1" }));
    expect(reference.queueJobId).toBe("bull-1");
    expect(await adapter.inspect(reference)).toBe("published");
  });

  it("publishes Celery payloads with canonical job ID only", async () => {
    const publishTask = vi.fn().mockResolvedValue({ taskId: "celery-1" });
    const adapter = new CeleryJobTransportAdapter("app.tasks.unified_job", publishTask);
    const reference = await adapter.publish({
      jobId: "canonical-2",
      businessAttempt: 2,
      attemptId: "attempt-2",
      outboxId: "outbox-2",
      dedupeKey: "job:canonical-2:attempt:2",
      contractVersion: "feature-186-v1",
      routingMetadata: { queue: "media" },
    });

    expect(publishTask).toHaveBeenCalledWith(expect.objectContaining({
      taskName: "app.tasks.unified_job",
      taskId: "job:canonical-2:attempt:2",
      payload: expect.objectContaining({ job_id: "canonical-2", business_attempt: 2 }),
    }));
    expect(reference.celeryTaskId).toBe("celery-1");
  });

  it("rejects unsupported contract versions before publish", () => {
    const adapter = new CeleryJobTransportAdapter("task", vi.fn());
    expect(() => assertAdapterSupports(adapter, {
      jobType: "test",
      executionClass: "short",
      contractVersion: "unknown",
    })).toThrow("JOB_ADAPTER_UNSUPPORTED");
  });
});
