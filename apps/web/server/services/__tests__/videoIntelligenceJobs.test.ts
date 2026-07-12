/**
 * `videoIntelligenceJobs.ts` coverage (Feature 133, section-07 §2.5) —
 * enqueue/dedupe, status reads, worker execution, and the Lane-A render
 * dispatch. Mirrors `verticalDramaStoryJobs.test.ts`: all Redis access goes
 * through the injectable `dependencies.redis` adapter, so these tests use a
 * tiny in-memory fake store — no real Redis/BullMQ connection is ever
 * touched.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_core/logger", () => ({ debugError: vi.fn(), debugLog: vi.fn() }));

const { mockDb } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn() },
}));
vi.mock("../../db", () => ({ db: mockDb }));

vi.mock("../workers/hyperframesRenderWorker", () => ({
  executeRemotionRenderVideoJob: vi.fn(),
}));

import {
  enqueueVideoIntelligenceJob,
  getActiveGenerationJob,
  getGenerationJobStatus,
  runVideoIntelligenceJob,
  dispatchLaneARemotionRenderJob,
  type VideoIntelligenceJobPayload,
  type VideoIntelligenceJobRedisAdapter,
} from "../videoIntelligenceJobs";

/** In-memory fake Redis — same `get`/`set(key,value,"EX",seconds)`/`del` shape as the real adapter. */
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
