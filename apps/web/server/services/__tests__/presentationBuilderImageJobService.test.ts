import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getUnifiedMediaTask: vi.fn(),
  ensurePresentationTaskResultDurable: vi.fn(),
  signBearerToken: vi.fn(() => "internal-token"),
}));

vi.mock("../../db", () => ({ getDb: mocks.getDb }));
vi.mock("../mediaTaskPollingService", () => ({
  getUnifiedMediaTask: mocks.getUnifiedMediaTask,
}));
vi.mock("../presentationMediaAssetService", () => ({
  ensurePresentationTaskResultDurable:
    mocks.ensurePresentationTaskResultDurable,
}));
vi.mock("../../_core/tokens", () => ({
  signBearerToken: mocks.signBearerToken,
}));

function chain<T>(value: T) {
  const query: any = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  query.limit.mockResolvedValue(value);
  query.then = (resolve: (value: T) => unknown) =>
    Promise.resolve(value).then(resolve);
  return query;
}

describe("presentationBuilderImageJobService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reconciles a completed provider task into a durable result without browser polling", async () => {
    const row = {
      id: "pbj-1",
      tenantId: "tenant-1",
      userId: 10,
      deckId: 911,
      slotId: "2:1:hero",
      pageNumber: 2,
      imageIndex: 1,
      placementRole: "hero",
      shortLabel: "Page 2 hero",
      prompt: "Create the hero",
      model: "gpt-image-2",
      canvasRatio: "16:9",
      mediaTaskId: "media-task-1",
      status: "processing",
      resultUrl: null,
      errorMessage: null,
      attemptCount: 0,
      nextPollAt: new Date(Date.now() - 1_000),
      lastCheckedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const updateWhere = vi.fn().mockResolvedValue([]);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    mocks.getDb.mockResolvedValue({
      select: vi
        .fn()
        .mockImplementationOnce(() => chain([row]))
        .mockImplementationOnce(() => chain([{ count: 0 }])),
      update: vi.fn().mockReturnValue({ set: updateSet }),
    });
    mocks.getUnifiedMediaTask.mockResolvedValue({
      id: "media-task-1",
      status: "completed",
      resultUrl: "https://provider.example/result.png",
      resultData: {},
    });
    mocks.ensurePresentationTaskResultDurable.mockResolvedValue({
      durableUrl:
        "/api/storage/files/presentation/tenant-1/deck-911/image/2_1/result.png",
    });

    const { reconcilePresentationBuilderImageJobs } =
      await import("../presentationBuilderImageJobService");
    const result = await reconcilePresentationBuilderImageJobs({ limit: 10 });

    expect(result).toMatchObject({ checked: 1, completed: 1, failed: 0 });
    expect(mocks.getUnifiedMediaTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "media-task-1",
        userId: 10,
        tenantId: "tenant-1",
      })
    );
    expect(mocks.ensurePresentationTaskResultDurable).toHaveBeenCalledWith(
      expect.objectContaining({
        deckId: 911,
        slotId: "2:1:hero",
        mediaType: "image",
      })
    );
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        resultUrl:
          "/api/storage/files/presentation/tenant-1/deck-911/image/2_1/result.png",
      })
    );
  });

  it("keeps transient provider polling errors retryable instead of marking the slot failed", async () => {
    const row = {
      id: "pbj-2",
      tenantId: "tenant-1",
      userId: 10,
      deckId: 911,
      slotId: "1:1:hero",
      pageNumber: 1,
      imageIndex: 1,
      placementRole: "hero",
      shortLabel: "Cover hero",
      prompt: "Create the cover",
      model: null,
      canvasRatio: "16:9",
      mediaTaskId: "media-task-2",
      status: "processing",
      resultUrl: null,
      errorMessage: null,
      attemptCount: 2,
      nextPollAt: new Date(Date.now() - 1_000),
      lastCheckedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const updateSet = vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
    mocks.getDb.mockResolvedValue({
      select: vi
        .fn()
        .mockImplementationOnce(() => chain([row]))
        .mockImplementationOnce(() => chain([{ count: 1 }])),
      update: vi.fn().mockReturnValue({ set: updateSet }),
    });
    mocks.getUnifiedMediaTask.mockRejectedValue(
      new Error("provider status temporarily unavailable")
    );

    const { reconcilePresentationBuilderImageJobs } =
      await import("../presentationBuilderImageJobService");
    const result = await reconcilePresentationBuilderImageJobs({ limit: 10 });

    expect(result).toMatchObject({
      checked: 1,
      completed: 0,
      failed: 0,
      remaining: 1,
    });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "processing",
        errorMessage: "provider status temporarily unavailable",
      })
    );
  });
});
