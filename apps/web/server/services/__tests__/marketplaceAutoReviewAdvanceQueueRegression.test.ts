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

  it("does not enqueue a generic advance for a staged run awaiting concept selection", async () => {
    const run = {
      id: "run-awaiting-concept",
      userId: 42,
      tenantId: "tenant-1",
      status: "running",
      currentStage: "concept_story",
      stageIndex: 3,
      metadataJson: {
        planningArchitecture: "staged_two_skill_v2",
        stagedPipeline: {
          plan: {
            conceptOptions: [{ conceptId: "idea-1" }],
            shots: [],
          },
        },
      },
    };
    const select = vi.fn().mockReturnValue({
      from: () => ({
        where: () => ({ limit: async () => [run] }),
      }),
    });
    getDbMock.mockResolvedValue({ select });

    await queueMarketplaceAutoReviewAdvance(
      run.id,
      { userId: 42, tenantId: "tenant-1" },
      { schedulerSource: "worker_jobs:initialize_run" },
      500
    );

    expect(select).toHaveBeenCalledTimes(1);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it.each([
    ["legacy", {}],
    [
      "staged",
      {
        planningArchitecture: "staged_two_skill_v2",
        stagedPipeline: {
          plan: {
            conceptOptions: [{ conceptId: "idea-1" }],
            selectedConceptId: "idea-1",
            shots: [{ shotId: 1 }],
          },
        },
      },
    ],
  ])("queues a follow-up worker job for a %s run awaiting its provider", async (_architecture, metadataJson) => {
    const run = {
      id: "run-awaiting-provider",
      userId: 42,
      tenantId: "tenant-1",
      status: "waiting_provider",
      currentStage: "image_generation",
      stageIndex: 4,
      metadataJson,
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
