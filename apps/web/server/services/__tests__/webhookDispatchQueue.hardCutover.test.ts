import { afterEach, describe, expect, it, vi } from "vitest";

const mockCreateControlPlaneJob = vi.hoisted(() => vi.fn().mockResolvedValue({ jobId: "canonical-webhook-1", created: true }));

vi.mock("../jobControlPlaneGateway", () => ({ createControlPlaneJob: mockCreateControlPlaneJob }));

import type { WebhookDispatchJob } from "../webhookDispatchQueue";

function makeJob(): WebhookDispatchJob {
  return {
    triggerId: "trigger-1",
    userId: 7,
    tenantId: "tenant-1",
    targetType: "chat",
    targetConversationId: 9,
    message: "hello",
    payload: { event: "safe" },
    creditCost: 1,
    startTime: 1700000000000,
    requestBodyHash: "hash-1",
    requestMethod: "POST",
    requestBodySize: 20,
    requestHeadersSafe: { "content-type": "application/json" },
    sourceIpMasked: "127.0.0.0/24",
    parsedBody: { event: "safe" },
  };
}

describe("webhook dispatch hard cutover", () => {
  afterEach(() => {
    delete process.env.FEATURE_186_HARD_CUTOVER;
    mockCreateControlPlaneJob.mockClear();
  });

  it("creates a canonical job and does not require the legacy queue", async () => {
    process.env.FEATURE_186_HARD_CUTOVER = "true";
    const { enqueueWebhookDispatch } = await import("../webhookDispatchQueue");

    await enqueueWebhookDispatch(makeJob());

    expect(mockCreateControlPlaneJob).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ tenantId: "tenant-1", actorType: "system" }),
      definition: expect.objectContaining({ jobType: "webhook.dispatch", executionClass: "short" }),
    }));
  });
});
