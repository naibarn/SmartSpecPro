/**
 * `videoIntelligenceJobs.ts` coverage (Feature 133, section-07 §2.5) —
 * enqueue/dedupe, status reads, worker execution, and the Lane-A render
 * dispatch. Mirrors `verticalDramaStoryJobs.test.ts`: all Redis access goes
 * through the injectable `dependencies.redis` adapter, so these tests use a
 * tiny in-memory fake store — no real Redis/BullMQ connection is ever
 * touched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_core/logger", () => ({ debugError: vi.fn(), debugLog: vi.fn() }));

const { mockDb } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn() },
}));
vi.mock("../../db", () => ({ db: mockDb }));

vi.mock("../workers/hyperframesRenderWorker", () => ({
  executeRemotionRenderVideoJob: vi.fn(),
}));

/**
 * `initVideoIntelligenceJobsQueue`'s own describe block below is the only
 * place that touches this — every other test goes through the injectable
 * `dependencies.redis` DI adapter and never calls the real `getRedisClient`.
 * Neutralised (throws) so that suite's BullMQ init lands inside init's own
 * `try/catch`, which is exactly what "arms the sweep even when BullMQ init
 * throws" exercises (section-01 §4.3 test-seam note).
 */
vi.mock("../redis", () => ({
  getRedisClient: vi.fn(() => {
    throw new Error("no redis in tests");
  }),
}));

import {
  enqueueVideoIntelligenceJob,
  getActiveGenerationJob,
  getGenerationJobStatus,
  runVideoIntelligenceJob,
  dispatchLaneARemotionRenderJob,
  sweepOrphanedVideoIntelligenceJobs,
  initVideoIntelligenceJobsQueue,
  closeVideoIntelligenceJobsQueue,
  VIDEO_INTELLIGENCE_JOB_SWEEP_INTERVAL_MS,
  VIDEO_INTELLIGENCE_JOB_ORPHAN_TTL_MS,
  VIDEO_INTELLIGENCE_JOB_MAX_ORPHAN_RECOVERIES,
  type VideoIntelligenceJobPayload,
  type VideoIntelligenceJobRecord,
  type VideoIntelligenceJobRedisAdapter,
} from "../videoIntelligenceJobs";

/** In-memory fake Redis — same `get`/`set(key,value,"EX",seconds)`/`del` shape as the real adapter.
 *  Also implements the optional `scan` seam: one page, everything at once
 *  (cursor immediately returns "0"), filtered by the `match` prefix — enough
 *  for the sweep's `vi:job:*` walk without needing real SCAN cursor paging. */
function makeFakeRedis(): VideoIntelligenceJobRedisAdapter & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => {
      const existed = store.delete(key);
      return existed ? 1 : 0;
    }),
    scan: vi.fn(async (cursor: string, match: string) => {
      if (cursor !== "0") return ["0", []] as [string, string[]];
      const prefix = match.replace(/\*$/, "");
      const keys = Array.from(store.keys()).filter(key => key.startsWith(prefix));
      return ["0", keys] as [string, string[]];
    }),
  };
}

function basePayload(overrides: Partial<VideoIntelligenceJobPayload> = {}): VideoIntelligenceJobPayload {
  return {
    kind: "scene_plan",
    projectId: 10,
    tenantId: "tenant-1",
    userId: 42,
    input: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enqueueVideoIntelligenceJob", () => {
  it("returns a jobId and writes a queued record", async () => {
    const redis = makeFakeRedis();
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);

    const { jobId, deduped } = await enqueueVideoIntelligenceJob(basePayload(), { redis, enqueueBullmqJob });

    expect(deduped).toBe(false);
    expect(enqueueBullmqJob).toHaveBeenCalledWith(jobId);

    const record = await getGenerationJobStatus(
      jobId,
      { tenantId: "tenant-1", userId: 42, projectId: 10 },
      { redis },
    );
    expect(record).toMatchObject({ jobId, kind: "scene_plan", status: "queued", progress: null, result: null });
  });

  it("dedupes a second submit for the SAME project while a job is queued/running", async () => {
    const redis = makeFakeRedis();
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);

    const first = await enqueueVideoIntelligenceJob(basePayload(), { redis, enqueueBullmqJob });
    const second = await enqueueVideoIntelligenceJob(basePayload({ kind: "quality_review" }), {
      redis,
      enqueueBullmqJob,
    });

    expect(second.deduped).toBe(true);
    expect(second.jobId).toBe(first.jobId);
    expect(enqueueBullmqJob).toHaveBeenCalledTimes(1);
  });
});

describe("getGenerationJobStatus", () => {
  it("reads the record by jobId (owner-scoped) — returns null for a foreign owner", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVideoIntelligenceJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    const ownRecord = await getGenerationJobStatus(jobId, { tenantId: "tenant-1", userId: 42, projectId: 10 }, { redis });
    expect(ownRecord?.jobId).toBe(jobId);

    const foreignRecord = await getGenerationJobStatus(
      jobId,
      { tenantId: "tenant-1", userId: 999, projectId: 10 },
      { redis },
    );
    expect(foreignRecord).toBeNull();
  });

  it("returns null for a missing job", async () => {
    const redis = makeFakeRedis();
    const record = await getGenerationJobStatus(
      "does-not-exist",
      { tenantId: "tenant-1", userId: 42, projectId: 10 },
      { redis },
    );
    expect(record).toBeNull();
  });
});

describe("getActiveGenerationJob", () => {
  it("returns the active job for a project (dedupe pointer)", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVideoIntelligenceJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    const active = await getActiveGenerationJob({ tenantId: "tenant-1", userId: 42, projectId: 10 }, { redis });
    expect(active?.jobId).toBe(jobId);
  });

  it("returns null when no job is active", async () => {
    const redis = makeFakeRedis();
    const active = await getActiveGenerationJob({ tenantId: "tenant-1", userId: 42, projectId: 10 }, { redis });
    expect(active).toBeNull();
  });
});

describe("runVideoIntelligenceJob", () => {
  it("clears the active pointer on terminal (succeeded) outcome — only its own jobId", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVideoIntelligenceJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    const executor = vi.fn().mockResolvedValue({ ok: true });
    await runVideoIntelligenceJob(jobId, executor, { redis });

    const record = await getGenerationJobStatus(jobId, { tenantId: "tenant-1", userId: 42, projectId: 10 }, { redis });
    expect(record?.status).toBe("succeeded");
    expect(record?.result).toEqual({ ok: true });

    const active = await getActiveGenerationJob({ tenantId: "tenant-1", userId: 42, projectId: 10 }, { redis });
    expect(active).toBeNull();
  });

  it("clears the active pointer on terminal (failed) outcome and records the error", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVideoIntelligenceJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    const executor = vi.fn().mockRejectedValue(new Error("boom"));
    await runVideoIntelligenceJob(jobId, executor, { redis });

    const record = await getGenerationJobStatus(jobId, { tenantId: "tenant-1", userId: 42, projectId: 10 }, { redis });
    expect(record?.status).toBe("failed");
    expect(record?.error).toBe("boom");

    const active = await getActiveGenerationJob({ tenantId: "tenant-1", userId: 42, projectId: 10 }, { redis });
    expect(active).toBeNull();
  });

  it("finally-guard: never clears a pointer that now points at a DIFFERENT (newer) job", async () => {
    const redis = makeFakeRedis();
    const { jobId: firstJobId } = await enqueueVideoIntelligenceJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    // Simulate a second job having already claimed the active pointer for
    // this project (e.g. this project's job finished+cleared, then a new
    // one was submitted) before the first job's own run loop reaches its
    // `finally` block.
    await redis.set(`vi:job:active:tenant-1:10`, "some-other-job-id", "EX", 3600);

    const executor = vi.fn().mockResolvedValue({ ok: true });
    await runVideoIntelligenceJob(firstJobId, executor, { redis });

    const pointer = await redis.get(`vi:job:active:tenant-1:10`);
    expect(pointer).toBe("some-other-job-id");
  });
});

describe("dispatchLaneARemotionRenderJob (closes implementation-progress.md gap #2)", () => {
  it("claims a queued worker_jobs row, invokes executeRemotionRenderVideoJob, and marks it completed", async () => {
    const payload = { kind: "remotion_render_video", schemaVersion: 1 } as unknown as Record<string, unknown>;
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([{ id: "job-1", status: "queued", inputJson: payload }]) }),
      }),
    });
    const updateSet1 = vi.fn(() => ({ where: () => ({ returning: () => Promise.resolve([{ id: "job-1" }]) }) }));
    const updateSet2 = vi.fn(() => ({ where: () => Promise.resolve([]) }));
    mockDb.update
      .mockReturnValueOnce({ set: updateSet1 })
      .mockReturnValueOnce({ set: updateSet2 });

    const execute = vi.fn().mockResolvedValue({ outputUrl: "/uploads/out.mp4" });

    // Validate against the real schema by round-tripping through a minimal
    // valid payload instead of the loose stub above — safeParse would reject
    // the stub, which would exercise the "invalid payload" branch instead.
    // Build a schema-valid payload for this happy-path test.
    const { remotionRenderVideoWorkerInputSchema } = await import("../../../shared/workerRuntime");
    const validPayload = remotionRenderVideoWorkerInputSchema.parse({
      videoProjectId: "1",
      projectRevision: 1,
      traceId: "trace-1",
      platformContractVersion: "2026-07-12",
      rendererPolicyVersion: "remotion-1",
      renderProfile: {
        profile: "preview",
        width: 540,
        height: 960,
        fps: 15,
        codec: "h264",
        loudnessNormalize: true,
        burnInAssCaptions: false,
      },
      remotionTemplate: {
        id: "x",
        name: "x",
        width: 540,
        height: 960,
        fps: 15,
        durationInFrames: 10,
        layers: [],
      },
      compositionId: "GenericTemplate",
      assetManifest: { sources: [] },
      postPasses: [],
      segmentPlan: null,
      remotionTemplateHash: "a".repeat(16),
      durationInFrames: 10,
    });

    mockDb.select.mockReset();
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: "job-1", status: "queued", inputJson: validPayload }]),
        }),
      }),
    });

    await dispatchLaneARemotionRenderJob({ tenantId: "tenant-1", workerJobId: "job-1" }, { execute });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", renderJobId: "job-1" }),
    );
    expect(updateSet1).toHaveBeenCalledWith(expect.objectContaining({ status: "running" }));
    expect(updateSet2).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", outputJson: { outputUrl: "/uploads/out.mp4" } }),
    );
  });

  it("never double-dispatches a job that is not in 'queued' status", async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([{ id: "job-2", status: "running", inputJson: {} }]) }),
      }),
    });
    const execute = vi.fn();

    await dispatchLaneARemotionRenderJob({ tenantId: "tenant-1", workerJobId: "job-2" }, { execute });

    expect(execute).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("marks the job failed when the executor throws — never rejects the caller", async () => {
    const { remotionRenderVideoWorkerInputSchema } = await import("../../../shared/workerRuntime");
    const validPayload = remotionRenderVideoWorkerInputSchema.parse({
      videoProjectId: "1",
      projectRevision: 1,
      traceId: "trace-1",
      platformContractVersion: "2026-07-12",
      rendererPolicyVersion: "remotion-1",
      renderProfile: {
        profile: "preview",
        width: 540,
        height: 960,
        fps: 15,
        codec: "h264",
        loudnessNormalize: true,
        burnInAssCaptions: false,
      },
      remotionTemplate: { id: "x", name: "x", width: 540, height: 960, fps: 15, durationInFrames: 10, layers: [] },
      compositionId: "GenericTemplate",
      assetManifest: { sources: [] },
      postPasses: [],
      segmentPlan: null,
      remotionTemplateHash: "a".repeat(16),
      durationInFrames: 10,
    });

    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: "job-3", status: "queued", inputJson: validPayload }]),
        }),
      }),
    });
    const updateSet1 = vi.fn(() => ({ where: () => ({ returning: () => Promise.resolve([{ id: "job-3" }]) }) }));
    const updateSet2 = vi.fn(() => ({ where: () => Promise.resolve([]) }));
    mockDb.update.mockReturnValueOnce({ set: updateSet1 }).mockReturnValueOnce({ set: updateSet2 });

    const execute = vi.fn().mockRejectedValue(new Error("render failed"));

    await expect(
      dispatchLaneARemotionRenderJob({ tenantId: "tenant-1", workerJobId: "job-3" }, { execute }),
    ).resolves.toBeUndefined();

    expect(updateSet2).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", failureReason: "render failed" }),
    );
  });

  it("no-ops when the worker job row does not exist", async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    const execute = vi.fn();

    await expect(
      dispatchLaneARemotionRenderJob({ tenantId: "tenant-1", workerJobId: "missing" }, { execute }),
    ).resolves.toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Fail-fast enqueue (section-01 §4.2, VI_QUEUE_UNAVAILABLE)                 */
/* -------------------------------------------------------------------------- */

describe("enqueueVideoIntelligenceJob — fail-fast (VI_QUEUE_UNAVAILABLE)", () => {
  it("marks the record failed and throws VI_QUEUE_UNAVAILABLE when the queue add throws", async () => {
    const redis = makeFakeRedis();
    const enqueueBullmqJob = vi.fn().mockRejectedValue(new Error("queue is not initialized"));

    await expect(
      enqueueVideoIntelligenceJob(basePayload(), { redis, enqueueBullmqJob }),
    ).rejects.toThrow(/VI_QUEUE_UNAVAILABLE/);

    const recordKey = Array.from(redis.store.keys()).find(
      key => key.startsWith("vi:job:") && !key.startsWith("vi:job:active:"),
    );
    expect(recordKey).toBeDefined();
    const record = JSON.parse(redis.store.get(recordKey!)!);
    expect(record.status).toBe("failed");
    expect(record.error).toMatch(/VI_QUEUE_UNAVAILABLE/);
  });

  it("clears the active pointer on enqueue failure so the project is not blocked for 2h", async () => {
    const redis = makeFakeRedis();
    const enqueueBullmqJob = vi.fn().mockRejectedValue(new Error("queue is not initialized"));

    await expect(
      enqueueVideoIntelligenceJob(basePayload(), { redis, enqueueBullmqJob }),
    ).rejects.toThrow(/VI_QUEUE_UNAVAILABLE/);

    const active = await getActiveGenerationJob(
      { tenantId: "tenant-1", userId: 42, projectId: 10 },
      { redis },
    );
    expect(active).toBeNull();
    expect(redis.store.has("vi:job:active:tenant-1:10")).toBe(false);
  });

  it("does NOT leave a 'queued' record behind after a failed enqueue", async () => {
    const redis = makeFakeRedis();
    const enqueueBullmqJob = vi.fn().mockRejectedValue(new Error("queue is not initialized"));

    await expect(
      enqueueVideoIntelligenceJob(basePayload(), { redis, enqueueBullmqJob }),
    ).rejects.toThrow(/VI_QUEUE_UNAVAILABLE/);

    const recordKey = Array.from(redis.store.keys()).find(
      key => key.startsWith("vi:job:") && !key.startsWith("vi:job:active:"),
    );
    const record = JSON.parse(redis.store.get(recordKey!)!);
    expect(record.status).not.toBe("queued");
  });
});

/* -------------------------------------------------------------------------- */
/* Orphan sweep (section-01 §4.3 / §5.3)                                     */
/* -------------------------------------------------------------------------- */

function makeRecord(
  overrides: Partial<VideoIntelligenceJobRecord> & { jobId: string },
): VideoIntelligenceJobRecord {
  return {
    kind: "scene_plan",
    projectId: 10,
    tenantId: "tenant-1",
    userId: 42,
    input: {},
    status: "running",
    progress: null,
    result: null,
    error: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function seedRecord(
  redis: ReturnType<typeof makeFakeRedis>,
  overrides: Partial<VideoIntelligenceJobRecord> & { jobId: string },
): VideoIntelligenceJobRecord {
  const record = makeRecord(overrides);
  redis.store.set(`vi:job:${record.jobId}`, JSON.stringify(record));
  return record;
}

describe("sweepOrphanedVideoIntelligenceJobs", () => {
  const NOW = Date.parse("2026-01-01T00:20:00.000Z");
  const now = () => NOW;
  const staleUpdatedAt = new Date(NOW - VIDEO_INTELLIGENCE_JOB_ORPHAN_TTL_MS - 1000).toISOString();
  const freshUpdatedAt = new Date(NOW - 1000).toISOString();

  it("resets a 'running' record older than the TTL back to 'queued' and re-enqueues once", async () => {
    const redis = makeFakeRedis();
    seedRecord(redis, { jobId: "job-1", status: "running", updatedAt: staleUpdatedAt });
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);

    const result = await sweepOrphanedVideoIntelligenceJobs({ redis, now, enqueueBullmqJob });

    expect(result.requeued).toEqual(["job-1"]);
    expect(result.failed).toEqual([]);
    expect(enqueueBullmqJob).toHaveBeenCalledWith("job-1");
    const record = JSON.parse(redis.store.get("vi:job:job-1")!);
    expect(record.status).toBe("queued");
    expect(record.orphanRecoveries).toBe(1);
  });

  it("re-enqueues a stale 'queued' record whose BullMQ job vanished", async () => {
    const redis = makeFakeRedis();
    seedRecord(redis, { jobId: "job-2", status: "queued", updatedAt: staleUpdatedAt });
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);

    const result = await sweepOrphanedVideoIntelligenceJobs({ redis, now, enqueueBullmqJob });

    expect(result.stuckQueued).toEqual(["job-2"]);
    expect(result.failed).toEqual([]);
    expect(enqueueBullmqJob).toHaveBeenCalledWith("job-2");
    const record = JSON.parse(redis.store.get("vi:job:job-2")!);
    expect(record.status).toBe("queued");
    expect(record.orphanRecoveries).toBe(1);
  });

  it("marks a twice-orphaned record 'failed' instead of re-enqueueing forever", async () => {
    const redis = makeFakeRedis();
    seedRecord(redis, {
      jobId: "job-3",
      status: "running",
      updatedAt: staleUpdatedAt,
      orphanRecoveries: VIDEO_INTELLIGENCE_JOB_MAX_ORPHAN_RECOVERIES,
    });
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);

    const result = await sweepOrphanedVideoIntelligenceJobs({ redis, now, enqueueBullmqJob });

    expect(result.failed).toEqual(["job-3"]);
    expect(result.requeued).toEqual([]);
    expect(result.stuckQueued).toEqual([]);
    expect(enqueueBullmqJob).not.toHaveBeenCalled();
    const record = JSON.parse(redis.store.get("vi:job:job-3")!);
    expect(record.status).toBe("failed");
    expect(record.error).toMatch(/VI_QUEUE_UNAVAILABLE/);
  });

  it("leaves a fresh 'running' record untouched", async () => {
    const redis = makeFakeRedis();
    seedRecord(redis, { jobId: "job-4", status: "running", updatedAt: freshUpdatedAt });
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);

    const result = await sweepOrphanedVideoIntelligenceJobs({ redis, now, enqueueBullmqJob });

    expect(result.requeued).toEqual([]);
    expect(result.failed).toEqual([]);
    const record = JSON.parse(redis.store.get("vi:job:job-4")!);
    expect(record.status).toBe("running");
    expect(enqueueBullmqJob).not.toHaveBeenCalled();
  });

  it("ignores vi:job:active:* pointer keys while scanning", async () => {
    const redis = makeFakeRedis();
    await redis.set("vi:job:active:tenant-1:10", "not-a-json-record", "EX", 3600);
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);

    await expect(
      sweepOrphanedVideoIntelligenceJobs({ redis, now, enqueueBullmqJob }),
    ).resolves.toEqual({ requeued: [], failed: [], stuckQueued: [] });
  });

  it("clears the active pointer when it fails a twice-orphaned record", async () => {
    const redis = makeFakeRedis();
    seedRecord(redis, {
      jobId: "job-5",
      status: "running",
      updatedAt: staleUpdatedAt,
      orphanRecoveries: VIDEO_INTELLIGENCE_JOB_MAX_ORPHAN_RECOVERIES,
    });
    await redis.set("vi:job:active:tenant-1:10", "job-5", "EX", 3600);
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);

    await sweepOrphanedVideoIntelligenceJobs({ redis, now, enqueueBullmqJob });

    expect(redis.store.has("vi:job:active:tenant-1:10")).toBe(false);
  });

  it("no-ops (and does not throw) when the adapter provides no scan method", async () => {
    const redisNoScan: VideoIntelligenceJobRedisAdapter = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => "OK"),
      del: vi.fn(async () => 0),
    };
    const enqueueBullmqJob = vi.fn();

    await expect(
      sweepOrphanedVideoIntelligenceJobs({ redis: redisNoScan, now, enqueueBullmqJob }),
    ).resolves.toEqual({ requeued: [], failed: [], stuckQueued: [] });
    expect(enqueueBullmqJob).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* initVideoIntelligenceJobsQueue lifecycle (section-01 §5.4)                */
/* -------------------------------------------------------------------------- */

describe("initVideoIntelligenceJobsQueue", () => {
  afterEach(async () => {
    vi.useRealTimers();
    await closeVideoIntelligenceJobsQueue();
  });

  it("arms the sweep even when BullMQ init throws", async () => {
    vi.useFakeTimers();
    const sweep = vi.fn().mockResolvedValue(undefined);

    await initVideoIntelligenceJobsQueue({ sweep });

    // getRedisClient() is mocked (module-level) to throw, so BullMQ init
    // fails and lands in its own try/catch — the sweep must already be
    // armed regardless, proven by the immediate fire below.
    expect(sweep).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(VIDEO_INTELLIGENCE_JOB_SWEEP_INTERVAL_MS);
    expect(sweep).toHaveBeenCalledTimes(2);
  });

  it("fires one sweep immediately at init so pre-restart orphans heal now", async () => {
    const sweep = vi.fn().mockResolvedValue(undefined);
    await initVideoIntelligenceJobsQueue({ sweep });
    // Let the fire-and-forget immediate call's microtask flush.
    await Promise.resolve();
    expect(sweep).toHaveBeenCalledTimes(1);
  });

  it("clears the timer on close", async () => {
    vi.useFakeTimers();
    const sweep = vi.fn().mockResolvedValue(undefined);
    await initVideoIntelligenceJobsQueue({ sweep });
    await closeVideoIntelligenceJobsQueue();

    await vi.advanceTimersByTimeAsync(VIDEO_INTELLIGENCE_JOB_SWEEP_INTERVAL_MS * 2);
    expect(sweep).toHaveBeenCalledTimes(1);
  });
});
