import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueMock = vi.hoisted(() => vi.fn());
const getDbMock = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({ getDb: getDbMock }));

vi.mock("../marketplaceAutoReviewWorkerJob", async importOriginal => {
  const actual =
    await importOriginal<typeof import("../marketplaceAutoReviewWorkerJob")>();
  return {
    ...actual,
    enqueueMarketplaceAutoReviewWorkerJob: enqueueMock,
  };
});

import { queueMarketplaceAutoReviewAdvance } from "../marketplaceAutoReviewService";

describe("Marketplace Auto Review advance queue regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueMock.mockResolvedValue({ jobId: "advance-job-1" });
  });

  it("queues a follow-up worker job while reading a run that awaits its provider", async () => {
    const run = {
      id: "run-awaiting-provider",
      userId: 42,
      tenantId: "tenant-1",
      status: "waiting_provider",
      currentStage: "image_generation",
      stageIndex: 4,
      metadataJson: {},
    };
    const queryResults = [[run], [], []];
    let queryIndex = 0;
    getDbMock.mockResolvedValue({
      select: () => {
        const rows = queryResults[queryIndex++];
        return {
          from: () => ({
            where: () => ({
              limit: async () => rows,
            }),
          }),
        };
      },
    });

    await expect(
      queueMarketplaceAutoReviewAdvance(
        run.id,
        { userId: 42, tenantId: "tenant-1" },
        { schedulerSource: "checkpoint_read" },
        1_000
      )
    ).resolves.toBeUndefined();

    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: run.id,
        operation: expect.objectContaining({
          operation: "advance_run",
          targetStage: "image_generation",
          targetStageIndex: 4,
        }),
      })
    );
  });
});
