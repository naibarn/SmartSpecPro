import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMcpMediaTask: vi.fn(),
  getDeferredMediaTask: vi.fn(),
  getTask: vi.fn(),
  ensureVerticalDramaTaskResultDurable: vi.fn(),
  ensureMarketplaceAutoReviewTaskResultDurable: vi.fn(),
}));

vi.mock("../mcpMediaAdapter", () => ({
  getMcpMediaTask: mocks.getMcpMediaTask,
}));
vi.mock("../deferredMediaRetryService", () => ({
  getDeferredMediaTask: mocks.getDeferredMediaTask,
}));
vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: { getTask: mocks.getTask },
}));
vi.mock("../verticalDramaMediaAssetService", () => ({
  ensureVerticalDramaTaskResultDurable:
    mocks.ensureVerticalDramaTaskResultDurable,
}));
vi.mock("../marketplaceAutoReviewMediaAssetService", () => ({
  ensureMarketplaceAutoReviewTaskResultDurable:
    mocks.ensureMarketplaceAutoReviewTaskResultDurable,
}));

import { getUnifiedMediaTask } from "../mediaTaskPollingService";

const input = {
  taskId: "task-1",
  userId: 42,
  userToken: "token",
  tenantId: "tenant-1",
  auditContext: { userId: 42, source: "test", stage: "poll" },
};

function task(over: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    status: "completed",
    mediaType: "image",
    model: "test-model",
    resultUrl: "https://provider.example/image.png",
    ...over,
  } as any;
}

describe("getUnifiedMediaTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMcpMediaTask.mockResolvedValue(null);
    mocks.getDeferredMediaTask.mockResolvedValue(null);
    mocks.ensureVerticalDramaTaskResultDurable.mockImplementation(
      async ({ task: currentTask }: { task: any }) => ({
        task: { ...currentTask, resultUrl: "/api/storage/files/durable.png" },
      })
    );
    mocks.ensureMarketplaceAutoReviewTaskResultDurable.mockResolvedValue(null);
  });

  it("uses the MCP task before deferred/provider adapters and durabilizes it", async () => {
    const mcpTask = task({ id: "mcp_task-1" });
    mocks.getMcpMediaTask.mockResolvedValue(mcpTask);

    const result = await getUnifiedMediaTask(input);

    expect(result.resultUrl).toBe("/api/storage/files/durable.png");
    expect(mocks.getDeferredMediaTask).not.toHaveBeenCalled();
    expect(mocks.getTask).not.toHaveBeenCalled();
  });

  it("uses deferred tasks before the provider and durabilizes them", async () => {
    const deferredTask = task({ id: "deferred-task-1" });
    mocks.getDeferredMediaTask.mockResolvedValue(deferredTask);

    const result = await getUnifiedMediaTask(input);

    expect(result.resultUrl).toBe("/api/storage/files/durable.png");
    expect(mocks.getTask).not.toHaveBeenCalled();
  });

  it("falls back to the provider and passes the audit context", async () => {
    const providerTask = task();
    mocks.getTask.mockResolvedValue(providerTask);

    await getUnifiedMediaTask(input);

    expect(mocks.getTask).toHaveBeenCalledWith(
      input.taskId,
      input.userToken,
      { ...input.auditContext, tenantId: input.tenantId }
    );
  });

  it("durabilizes completed Auto Review media from the same polling boundary", async () => {
    const providerTask = task({
      parameters: {
        extra_params: { __auto_review_run_id: "mar-1", __unit_id: "shot-1" },
      },
    });
    mocks.getTask.mockResolvedValue(providerTask);
    mocks.ensureVerticalDramaTaskResultDurable.mockResolvedValue(null);
    mocks.ensureMarketplaceAutoReviewTaskResultDurable.mockResolvedValue({
      task: {
        ...providerTask,
        resultUrl: "/api/storage/files/auto-review.png",
      },
    });

    const result = await getUnifiedMediaTask(input);

    expect(result.resultUrl).toBe("/api/storage/files/auto-review.png");
    expect(
      mocks.ensureMarketplaceAutoReviewTaskResultDurable
    ).toHaveBeenCalledWith({
      tenantId: input.tenantId,
      userId: input.userId,
      task: providerTask,
    });
  });
});
