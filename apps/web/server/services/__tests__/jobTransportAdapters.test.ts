import { describe, expect, it, vi } from "vitest";

import {
  CloudflareQueueHttpJobTransportAdapter,
  PostgresPullJobTransportAdapter,
  assertAdapterSupports,
} from "../jobTransportAdapters";

describe("job transport adapters", () => {
  it("rejects unsupported contract versions before publish", () => {
    const adapter = new PostgresPullJobTransportAdapter();
    expect(() => assertAdapterSupports(adapter, {
      jobType: "test",
      executionClass: "short",
      contractVersion: "unknown",
    })).toThrow("JOB_ADAPTER_UNSUPPORTED");
  });

  it("accepts content-protection contracts on canonical transports", () => {
    const adapters = [
      new PostgresPullJobTransportAdapter(),
      new CloudflareQueueHttpJobTransportAdapter("https://runtime.example", "runtime-token"),
    ];
    for (const adapter of adapters) {
      expect(adapter.supports({
        jobType: "content_protection.protect",
        executionClass: "cpu",
        contractVersion: "content-protection.v1",
      })).toBe(true);
      expect(adapter.supports({
        jobType: "content_protection.verify",
        executionClass: "cpu",
        contractVersion: "content-protection.verify.v1",
      })).toBe(true);
    }
  });

  it("publishes a PostgreSQL-pull reference without touching a broker", async () => {
    const adapter = new PostgresPullJobTransportAdapter();
    const reference = await adapter.publish({
      jobId: "canonical-pull-1",
      businessAttempt: 1,
      outboxId: "outbox-pull-1",
      dedupeKey: "job:canonical-pull-1:attempt:1",
      contractVersion: "feature-186-v1",
      routingMetadata: {},
    });

    expect(reference).toMatchObject({
      adapter: "postgres-pull",
      referenceNamespace: "postgres-pull",
      queueJobId: "postgres-pull:job:canonical-pull-1:attempt:1",
    });
    expect(await adapter.inspect(reference)).toBe("unknown");
  });

  it("publishes the canonical envelope to the Cloudflare Queue boundary", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ accepted: true, dispatchId: "cf-dispatch-1" }),
      { status: 202, headers: { "content-type": "application/json" } },
    ));
    const adapter = new CloudflareQueueHttpJobTransportAdapter(
      "https://runtime.example/",
      "runtime-token",
      undefined,
      fetchImpl,
    );
    const reference = await adapter.publish({
      jobId: "canonical-cf-1",
      businessAttempt: 1,
      outboxId: "outbox-cf-1",
      dedupeKey: "job:canonical-cf-1:attempt:1",
      contractVersion: "feature-186-v1",
      routingMetadata: { executionClass: "short" },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://runtime.example/internal/jobs/publish",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer runtime-token" }),
        body: JSON.stringify({
          job_id: "canonical-cf-1",
          business_attempt: 1,
          attempt_id: null,
          contract_version: "feature-186-v1",
          dispatch_id: "outbox-cf-1",
          dedupe_key: "job:canonical-cf-1:attempt:1",
          routing_metadata: { executionClass: "short" },
        }),
      }),
    );
    expect(reference).toMatchObject({
      adapter: "cloudflare-queues",
      referenceNamespace: "cloudflare-queues",
      queueJobId: "cf-dispatch-1",
    });
    expect(await adapter.inspect(reference)).toBe("unknown");
  });
});
