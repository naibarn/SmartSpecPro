import { describe, expect, it } from "vitest";

import { InMemoryJobTransportAdapter } from "../jobTransportAdapters";

describe("provider-neutral adapter convergence", () => {
  it("converges duplicate queue delivery on one reference", async () => {
    const adapter = new InMemoryJobTransportAdapter("cloudflare-queues", "cloudflare-queues");
    const request = { jobId: "job-1", businessAttempt: 1, outboxId: "outbox-1", dedupeKey: "job-1:1", contractVersion: "feature-186-v1", routingMetadata: {} };
    const first = await adapter.publish(request);
    const second = await adapter.publish(request);
    expect(second).toEqual(first);
    expect(await adapter.inspect(first)).toBe("published");
  });

  it("keeps workflow/container identities as references", async () => {
    const workflow = new InMemoryJobTransportAdapter("cloudflare-workflows", "cloudflare-workflows", "workflow");
    const container = new InMemoryJobTransportAdapter("cloudflare-containers", "cloudflare-containers", "container");
    const base = { jobId: "job-1", businessAttempt: 1, outboxId: "outbox-1", dedupeKey: "job-1:1", contractVersion: "feature-186-v1", routingMetadata: {} };
    expect((await workflow.publish(base)).workflowInstanceId).toBeDefined();
    expect((await container.publish(base)).containerInstanceId).toBeDefined();
  });
});
