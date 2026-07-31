/**
 * Bug #127 hardening (`planning/vd-storyboard-runstage-async-job/plan.md`) —
 * unit tests for `verticalDramaEpisodeStageJobs.ts`'s two orphaned-row
 * defenses:
 *
 * 1. FAIL-FAST ENQUEUE: a thrown BullMQ add marks the freshly-inserted
 *    `vertical_drama_episode_runs` row `failed` (via the pipeline's
 *    `markStoryboardShotgridRunFailed`) and reports `{ enqueued: false }`,
 *    instead of orphaning the row at `queued` forever (the runs #496/#501
 *    poison pill — the idempotency reuse kept returning the dead row).
 * 2. ORPHANED-RUN SWEEP: `initVerticalDramaEpisodeStageJobsQueue` arms a
 *    periodic sweep (immediate first tick + every
 *    `STORYBOARD_SHOTGRID_RUN_SWEEP_INTERVAL_MS`) that calls the pipeline's
 *    `sweepStaleStoryboardShotgridRuns`, and
 *    `closeVerticalDramaEpisodeStageJobsQueue` disarms it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockMarkFailed, mockSweep } = vi.hoisted(() => ({
  mockMarkFailed: vi.fn().mockResolvedValue(true),
  mockSweep: vi.fn().mockResolvedValue([]),
}));
// The stage-jobs module only ever reaches the pipeline via lazy
// execution-time `import()`s (no static value import), so this minimal
// factory is all it can see.
vi.mock("../verticalDramaEpisodePipeline", () => ({
  markStoryboardShotgridRunFailed: mockMarkFailed,
  sweepStaleStoryboardShotgridRuns: mockSweep,
}));
vi.mock("../redis", () => ({ getRedisClient: vi.fn(() => ({})) }));
vi.mock("bullmq", () => ({
  Queue: class {
    async add() {}
    async close() {}
  },
  Worker: class {
    on() {}
    async close() {}
  },
}));

import {
  closeVerticalDramaEpisodeStageJobsQueue,
  enqueueVerticalDramaEpisodeStageJob,
  initVerticalDramaEpisodeStageJobsQueue,
  STORYBOARD_SHOTGRID_RUN_SWEEP_INTERVAL_MS,
  type VerticalDramaEpisodeStageJobData,
} from "../verticalDramaEpisodeStageJobs";

const jobData: VerticalDramaEpisodeStageJobData = {
  runId: 501,
  owner: { tenantId: "t1", userId: 1, seriesId: 10, episodeId: 100 },
  opts: { mode: "full" } as VerticalDramaEpisodeStageJobData["opts"],
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  // Resets module state (queue/worker refs + the sweep timer) between tests.
  await closeVerticalDramaEpisodeStageJobsQueue();
  vi.useRealTimers();
});

describe("enqueueVerticalDramaEpisodeStageJob — fail-fast (bug #127 hardening)", () => {
  it("reports { enqueued: true } and never touches the run row when the BullMQ add succeeds", async () => {
    const result = await enqueueVerticalDramaEpisodeStageJob(
      jobData,
      vi.fn().mockResolvedValue(undefined)
    );

    expect(result).toEqual({ enqueued: true });
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });

  it("marks the freshly-inserted run row failed and reports { enqueued: false } when the BullMQ add throws", async () => {
    const result = await enqueueVerticalDramaEpisodeStageJob(
      jobData,
      vi.fn().mockRejectedValue(new Error("redis connection refused"))
    );

    expect(result).toEqual({ enqueued: false });
    expect(mockMarkFailed).toHaveBeenCalledTimes(1);
    expect(mockMarkFailed).toHaveBeenCalledWith(
      501,
      expect.stringContaining("redis connection refused")
    );
  });

  it("still resolves { enqueued: false } (never throws) when marking the row failed fails too", async () => {
    mockMarkFailed.mockRejectedValueOnce(new Error("db down"));

    await expect(
      enqueueVerticalDramaEpisodeStageJob(
        jobData,
        vi.fn().mockRejectedValue(new Error("queue is not initialized"))
      )
    ).resolves.toEqual({ enqueued: false });
  });
});

describe("orphaned-run sweep wiring (bug #127 hardening)", () => {
  it("init arms the sweep (immediate tick + interval), a second init does not double-arm, and close disarms it", async () => {
    vi.useFakeTimers();

    await initVerticalDramaEpisodeStageJobsQueue();
    await vi.advanceTimersByTimeAsync(0);
    // Immediate first tick — heals orphans from before a restart right away.
    expect(mockSweep).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(STORYBOARD_SHOTGRID_RUN_SWEEP_INTERVAL_MS);
    expect(mockSweep).toHaveBeenCalledTimes(2);

    // Idempotent re-init: no second timer, no extra immediate tick.
    await initVerticalDramaEpisodeStageJobsQueue();
    await vi.advanceTimersByTimeAsync(STORYBOARD_SHOTGRID_RUN_SWEEP_INTERVAL_MS);
    expect(mockSweep).toHaveBeenCalledTimes(3);

    await closeVerticalDramaEpisodeStageJobsQueue();
    await vi.advanceTimersByTimeAsync(
      STORYBOARD_SHOTGRID_RUN_SWEEP_INTERVAL_MS * 3
    );
    expect(mockSweep).toHaveBeenCalledTimes(3);
  });

  it("a sweep tick that rejects is contained and does not stop later ticks", async () => {
    vi.useFakeTimers();
    mockSweep.mockRejectedValueOnce(new Error("db down"));

    await initVerticalDramaEpisodeStageJobsQueue();
    await vi.advanceTimersByTimeAsync(0);
    expect(mockSweep).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(STORYBOARD_SHOTGRID_RUN_SWEEP_INTERVAL_MS);
    expect(mockSweep).toHaveBeenCalledTimes(2);
  });
});
