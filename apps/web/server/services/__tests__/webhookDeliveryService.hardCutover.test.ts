import { afterEach, describe, expect, it, vi } from "vitest";

const mockCreateControlPlaneJob = vi.hoisted(() => vi.fn().mockResolvedValue({ jobId: "canonical-delivery-1", created: true }));
const mockGetDb = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({ getDb: mockGetDb }));
vi.mock("../jobControlPlaneGateway", () => ({ createControlPlaneJob: mockCreateControlPlaneJob }));
vi.mock("../redisClients", () => ({ getRealtimeClient: vi.fn(() => ({ publish: vi.fn() })) }));
vi.mock("../crypto", () => ({ encrypt: vi.fn(), decrypt: vi.fn((value: string) => value) }));
vi.mock("bullmq", () => ({ Queue: vi.fn(), Worker: vi.fn() }));

import { dispatchWebhookEvent } from "../webhookDeliveryService";

describe("webhook API delivery hard cutover", () => {
  afterEach(() => {
    delete process.env.FEATURE_186_HARD_CUTOVER;
    mockCreateControlPlaneJob.mockClear();
  });

  it("creates one canonical delivery intent per subscribed endpoint", async () => {
    process.env.FEATURE_186_HARD_CUTOVER = "true";
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: "endpoint-1",
            tenantId: "tenant-1",
            events: ["job.completed"],
            isActive: true,
          }]),
        }),
      }),
    });

    await dispatchWebhookEvent("tenant-1", "job.completed", { jobId: "job-1", token: "redacted" });

    expect(mockCreateControlPlaneJob).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ tenantId: "tenant-1", actorType: "system" }),
      definition: expect.objectContaining({ jobType: "webhook.api_delivery", executionClass: "short" }),
    }));
    const call = mockCreateControlPlaneJob.mock.calls[0][0];
    expect(call.definition.input.payload).toEqual({ jobId: "job-1" });
  });
});
