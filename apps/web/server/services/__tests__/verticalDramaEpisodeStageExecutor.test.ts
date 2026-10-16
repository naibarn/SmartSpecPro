import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storyboard: vi.fn(),
  episodeStage: vi.fn(),
  listEpisodeRuns: vi.fn(),
  routingPort: vi.fn(),
}));

vi.mock("../verticalDramaEpisodePipeline", () => ({
  VerticalDramaEpisodePipeline: class {
    runStoryboardShotgridStageJob = mocks.storyboard;
    runEpisodeStageJob = mocks.episodeStage;
    listEpisodeRuns = mocks.listEpisodeRuns;
  },
}));
vi.mock("../verticalDramaProviderRouting", () => ({
  createVerticalDramaProviderRoutingPort: mocks.routingPort,
}));

import { defaultJobExecutorRegistry } from "../jobExecutorRegistry";

const owner = { tenantId: "tenant-a", seriesId: "series-a", episodeId: "episode-a" };
const lease = { jobId: "job-a" } as any;
const runId = 41;
const registration = defaultJobExecutorRegistry.resolve("vertical_drama.episode_stage", "feature-186-v1")!;

async function execute(stage?: string, reporter = { assertActive: vi.fn().mockResolvedValue(undefined) }) {
  return registration.executor({
    context: { input: { runId, owner, opts: {}, ...(stage ? { stage } : {}) } },
    lease,
    reporter,
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storyboard.mockResolvedValue(undefined);
  mocks.episodeStage.mockResolvedValue(undefined);
  mocks.listEpisodeRuns.mockResolvedValue([{ id: runId, status: "succeeded" }]);
  mocks.routingPort.mockReturnValue({});
});

describe("vertical_drama.episode_stage executor persisted status", () => {
  it.each([undefined, "script"]) ("returns the canonical projection only after success for stage %s", async stage => {
    await expect(execute(stage)).resolves.toEqual({});
    expect(mocks.listEpisodeRuns).toHaveBeenCalledExactlyOnceWith(owner);
    expect(mocks.storyboard).toHaveBeenCalledTimes(stage === undefined ? 1 : 0);
    expect(mocks.episodeStage).toHaveBeenCalledTimes(stage === undefined ? 0 : 1);
  });

  it.each(["failed", "queued", "running", "cancelled"]) ("rejects persisted %s status without rerunning work", async status => {
    mocks.listEpisodeRuns.mockResolvedValue([{ id: runId, status }]);
    await expect(execute()).rejects.toMatchObject({ code: "DOMAIN_EXECUTION_FAILED" });
    expect(mocks.storyboard).toHaveBeenCalledTimes(1);
    expect(mocks.episodeStage).not.toHaveBeenCalled();
  });

  it("fails closed when the exact run is missing, even if another run succeeded", async () => {
    mocks.listEpisodeRuns.mockResolvedValue([{ id: runId + 1, status: "succeeded" }]);
    await expect(execute("script")).rejects.toMatchObject({ code: "DOMAIN_EXECUTION_FAILED" });
    expect(mocks.listEpisodeRuns).toHaveBeenCalledExactlyOnceWith(owner);
    expect(mocks.episodeStage).toHaveBeenCalledTimes(1);
  });

  it("preserves lease guards before and after domain execution", async () => {
    const reporter = { assertActive: vi.fn().mockResolvedValue(undefined) };
    await execute(undefined, reporter);
    expect(reporter.assertActive).toHaveBeenNthCalledWith(1, lease);
    expect(reporter.assertActive).toHaveBeenNthCalledWith(2, lease);
  });
});
