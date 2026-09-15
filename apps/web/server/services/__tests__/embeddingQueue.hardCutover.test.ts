import { afterEach, describe, expect, it, vi } from "vitest";

const mockCreateControlPlaneJob = vi.hoisted(() => vi.fn().mockResolvedValue({ jobId: "canonical-embedding-1", created: true }));
const mockGetDb = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({ getDb: mockGetDb }));
vi.mock("../jobControlPlaneGateway", () => ({ createControlPlaneJob: mockCreateControlPlaneJob }));
vi.mock("../queryEmbeddingService", () => ({ generateQueryEmbedding: vi.fn() }));
vi.mock("bullmq", () => ({ Queue: vi.fn(), Worker: vi.fn() }));
vi.mock("../redisClients", () => ({ getRealtimeClient: vi.fn() }));

import { enqueueEmbedding } from "../embeddingQueue";

describe("embedding queue hard cutover", () => {
  afterEach(() => {
    delete process.env.FEATURE_186_HARD_CUTOVER;
    mockCreateControlPlaneJob.mockClear();
  });

  it("derives tenant ownership from the persisted embedding record", async () => {
    process.env.FEATURE_186_HARD_CUTOVER = "true";
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ tenantId: "tenant-1" }]),
          }),
        }),
      }),
    });

    await enqueueEmbedding({ type: "message_chunk", recordId: "chunk-1", text: "hello" });

    expect(mockCreateControlPlaneJob).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ tenantId: "tenant-1", actorType: "system" }),
      definition: expect.objectContaining({ jobType: "embedding.generate", executionClass: "short" }),
    }));
  });
});
