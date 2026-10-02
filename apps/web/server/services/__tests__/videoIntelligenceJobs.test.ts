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

const { mockDb, canonicalJobs, mockCreateFeatureRef } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn() },
  canonicalJobs: new Map<string, any>(),
  mockCreateFeatureRef: vi.fn(),
}));
vi.mock("../../db", () => ({ db: mockDb }));
vi.mock("../feature186VerticalDramaJobAdapter", async importOriginal => ({
  ...(await importOriginal<typeof import("../feature186VerticalDramaJobAdapter")>()),
  createFeature186VerticalDramaJobRef: mockCreateFeatureRef,
}));
vi.mock("../jobControlPlane", () => ({
  createJobControlPlane: () => ({
    getJobSnapshot: async (jobId: string, scope: { tenantId: string; requestedByUserId?: number }) => {
      const job = canonicalJobs.get(jobId);
      return job && job.tenantId === scope.tenantId && job.requestedByUserId === scope.requestedByUserId ? job : null;
    },
    getActiveJobByDedupeKey: async ({ tenantId, requestedByUserId, activeDedupeKey }: any) =>
      Array.from(canonicalJobs.values()).find((job: any) =>
        job.tenantId === tenantId && job.requestedByUserId === requestedByUserId &&
        job.activeDedupeKey === activeDedupeKey && !["succeeded", "failed", "cancelled", "expired"].includes(job.status),
      ) ?? null,
    cancel: async (jobId: string) => {
      const job = canonicalJobs.get(jobId);
      if (job) job.status = "cancelled";
    },
  }),
}));

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
  cancelVideoIntelligenceJob,
  getActiveGenerationJob,
  getGenerationJobStatus,
  executeVideoIntelligenceJobExecutor,
  dispatchLaneARemotionRenderJob,
  sweepOrphanedLaneARenderJobs,
  initVideoIntelligenceJobsQueue,
  closeVideoIntelligenceJobsQueue,
  VIDEO_INTELLIGENCE_JOB_SWEEP_INTERVAL_MS,
  LANE_A_RENDER_ORPHAN_GRACE_MS,
  type VideoIntelligenceJobPayload,
} from "../videoIntelligenceJobs";

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
  canonicalJobs.clear();
  mockCreateFeatureRef.mockImplementation(async (input: any) => {
    const existing = Array.from(canonicalJobs.values()).find((job: any) =>
      job.tenantId === input.tenantId && job.activeDedupeKey === input.activeDedupeKey &&
      !["succeeded", "failed", "cancelled", "expired"].includes(job.status),
    ) as any;
    if (existing) return { jobId: existing.jobId, created: false };
    const job = {
      jobId: input.jobId, tenantId: input.tenantId, requestedByUserId: input.userId,
      jobType: input.jobType, status: "queued", input: input.payload, progress: {}, output: null,
      errorCode: null, errorMessage: null, createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z", activeDedupeKey: input.activeDedupeKey,
    };
    canonicalJobs.set(job.jobId, job);
    return { jobId: job.jobId, created: true };
  });
});

describe("enqueueVideoIntelligenceJob", () => {
  it("uses worker_jobs while Redis is unavailable", async () => {
    const { jobId, deduped } = await enqueueVideoIntelligenceJob(basePayload());

    expect(deduped).toBe(false);
    expect(mockCreateFeatureRef).toHaveBeenCalledWith(
      expect.objectContaining({ jobId, jobType: "video.intelligence" }),
    );

    const record = await getGenerationJobStatus(
      jobId,
      { tenantId: "tenant-1", userId: 42, projectId: 10 },
    );
    expect(record).toMatchObject({ jobId, kind: "scene_plan", status: "queued", progress: null, result: null });
  });

  it("dedupes a second submit for the SAME project while a job is queued/running", async () => {
    const first = await enqueueVideoIntelligenceJob(basePayload());
    const second = await enqueueVideoIntelligenceJob(basePayload({ kind: "quality_review" }));

    expect(second.deduped).toBe(true);
    expect(second.jobId).toBe(first.jobId);
  });
});

describe("getGenerationJobStatus", () => {
  it("reads the record by jobId (owner-scoped) — returns null for a foreign owner", async () => {
    const { jobId } = await enqueueVideoIntelligenceJob(basePayload());

    const ownRecord = await getGenerationJobStatus(jobId, { tenantId: "tenant-1", userId: 42, projectId: 10 });
    expect(ownRecord?.jobId).toBe(jobId);

    const foreignRecord = await getGenerationJobStatus(
      jobId,
      { tenantId: "tenant-1", userId: 999, projectId: 10 },
    );
    expect(foreignRecord).toBeNull();
  });

  it("returns null for a missing job", async () => {
    const record = await getGenerationJobStatus(
      "does-not-exist",
      { tenantId: "tenant-1", userId: 42, projectId: 10 },
    );
    expect(record).toBeNull();
  });
});

describe("getActiveGenerationJob", () => {
  it("returns the active job for a project (dedupe pointer)", async () => {
    const { jobId } = await enqueueVideoIntelligenceJob(basePayload());

    const active = await getActiveGenerationJob({ tenantId: "tenant-1", userId: 42, projectId: 10 });
    expect(active?.jobId).toBe(jobId);
  });

  it("returns null when no job is active", async () => {
    const active = await getActiveGenerationJob({ tenantId: "tenant-1", userId: 42, projectId: 10 });
    expect(active).toBeNull();
  });
});

describe("canonical Video Intelligence projection", () => {
  it("reads worker_jobs progress and nested executor output without Redis", async () => {
    const { jobId } = await enqueueVideoIntelligenceJob(basePayload());
    const job = canonicalJobs.get(jobId);
    job.status = "succeeded";
    job.progress = { stage: "rendering", message: "halfway" };
    job.output = { output: { result: { projectRevision: 7 } } };

    await expect(
      getGenerationJobStatus(jobId, { tenantId: "tenant-1", userId: 42, projectId: 10 }),
    ).resolves.toMatchObject({
      status: "succeeded",
      progress: { stage: "rendering", message: "halfway" },
      result: { projectRevision: 7 },
    });
    await expect(
      getActiveGenerationJob({ tenantId: "tenant-1", userId: 42, projectId: 10 }),
    ).resolves.toBeNull();
  });

  it("cancels through worker_jobs and releases the active scope", async () => {
    const { jobId } = await enqueueVideoIntelligenceJob(basePayload());
    await expect(
      cancelVideoIntelligenceJob(jobId, { tenantId: "tenant-1", userId: 42, projectId: 10 }),
    ).resolves.toMatchObject({ jobId, status: "failed" });
    await expect(
      getActiveGenerationJob({ tenantId: "tenant-1", userId: 42, projectId: 10 }),
    ).resolves.toBeNull();
  });
});

describe("executeVideoIntelligenceJobExecutor", () => {
  it("runs with the canonical payload and returns a worker_jobs-safe output envelope", async () => {
    const executor = vi.fn().mockResolvedValue({ projectRevision: 7 });
    const onProgress = vi.fn();

    await expect(
      executeVideoIntelligenceJobExecutor(basePayload(), executor, onProgress),
    ).resolves.toEqual({ result: { projectRevision: 7 } });

    expect(executor).toHaveBeenCalledWith(basePayload(), onProgress);
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

    await dispatchLaneARemotionRenderJob({ tenantId: "tenant-1", userId: 42, workerJobId: "job-1" }, { execute });

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

    await dispatchLaneARemotionRenderJob({ tenantId: "tenant-1", userId: 42, workerJobId: "job-2" }, { execute });

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
      dispatchLaneARemotionRenderJob({ tenantId: "tenant-1", userId: 42, workerJobId: "job-3" }, { execute }),
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
      dispatchLaneARemotionRenderJob({ tenantId: "tenant-1", userId: 42, workerJobId: "missing" }, { execute }),
    ).resolves.toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Post-render `video_projects` lifecycle mirroring (CMD-2 gap closure)      */
/* -------------------------------------------------------------------------- */

describe("dispatchLaneARemotionRenderJob — post-render video_projects lifecycle", () => {
  async function finalPayload() {
    const { remotionRenderVideoWorkerInputSchema } = await import("../../../shared/workerRuntime");
    return remotionRenderVideoWorkerInputSchema.parse({
      videoProjectId: "77",
      projectRevision: 3,
      traceId: "trace-final-1",
      platformContractVersion: "2026-07-12",
      rendererPolicyVersion: "remotion-1",
      renderProfile: {
        profile: "final",
        width: 1080,
        height: 1920,
        fps: 30,
        codec: "h264",
        loudnessNormalize: true,
        burnInAssCaptions: false,
      },
      remotionTemplate: { id: "x", name: "x", width: 1080, height: 1920, fps: 30, durationInFrames: 10, layers: [] },
      compositionId: "GenericTemplate",
      assetManifest: { sources: [] },
      postPasses: [],
      segmentPlan: null,
      remotionTemplateHash: "a".repeat(16),
      durationInFrames: 10,
    });
  }

  it("final render success: patches status to rendering then completed+resultLibraryItemId, and creates a library item", async () => {
    const payload = await finalPayload();
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([{ id: "job-final-1", status: "queued", inputJson: payload }]) }),
      }),
    });
    const updateSet1 = vi.fn(() => ({ where: () => ({ returning: () => Promise.resolve([{ id: "job-final-1" }]) }) }));
    const updateSet2 = vi.fn(() => ({ where: () => Promise.resolve([]) }));
    mockDb.update.mockReturnValueOnce({ set: updateSet1 }).mockReturnValueOnce({ set: updateSet2 });

    const execute = vi.fn().mockResolvedValue({ outputUrl: "https://cdn.example.com/final.mp4" });
    const updateProjectFields = vi.fn().mockResolvedValue({ id: 77 });
    const createLibraryItem = vi.fn().mockResolvedValue({ item: { id: 555 }, idempotent: false });

    await dispatchLaneARemotionRenderJob(
      { tenantId: "tenant-1", userId: 42, workerJobId: "job-final-1" },
      { execute, updateProjectFields, createLibraryItem },
    );

    expect(updateProjectFields).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42 },
      77,
      { status: "rendering" },
    );
    expect(createLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        itemType: "video",
        source: "video_intelligence_render",
        sourceUrl: "https://cdn.example.com/final.mp4",
        sourceLink: expect.objectContaining({ linkId: "job-final-1" }),
      }),
      { userId: 42, tenantId: "tenant-1" },
    );
    expect(updateProjectFields).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42 },
      77,
      { status: "completed", resultLibraryItemId: 555 },
    );
  });

  it("final render failure: patches status to failed (never throws)", async () => {
    const payload = await finalPayload();
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([{ id: "job-final-2", status: "queued", inputJson: payload }]) }),
      }),
    });
    const updateSet1 = vi.fn(() => ({ where: () => ({ returning: () => Promise.resolve([{ id: "job-final-2" }]) }) }));
    const updateSet2 = vi.fn(() => ({ where: () => Promise.resolve([]) }));
    mockDb.update.mockReturnValueOnce({ set: updateSet1 }).mockReturnValueOnce({ set: updateSet2 });

    const execute = vi.fn().mockRejectedValue(new Error("render blew up"));
    const updateProjectFields = vi.fn().mockResolvedValue({ id: 77 });
    const createLibraryItem = vi.fn();

    await expect(
      dispatchLaneARemotionRenderJob(
        { tenantId: "tenant-1", userId: 42, workerJobId: "job-final-2" },
        { execute, updateProjectFields, createLibraryItem },
      ),
    ).resolves.toBeUndefined();

    expect(createLibraryItem).not.toHaveBeenCalled();
    expect(updateProjectFields).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42 },
      77,
      { status: "rendering" },
    );
    expect(updateProjectFields).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42 },
      77,
      { status: "failed" },
    );
  });

  it("a library-item creation failure still marks the project completed (without resultLibraryItemId) — never blocks the terminal worker_jobs write", async () => {
    const payload = await finalPayload();
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([{ id: "job-final-3", status: "queued", inputJson: payload }]) }),
      }),
    });
    const updateSet1 = vi.fn(() => ({ where: () => ({ returning: () => Promise.resolve([{ id: "job-final-3" }]) }) }));
    const updateSet2 = vi.fn(() => ({ where: () => Promise.resolve([]) }));
    mockDb.update.mockReturnValueOnce({ set: updateSet1 }).mockReturnValueOnce({ set: updateSet2 });

    const execute = vi.fn().mockResolvedValue({ outputUrl: "https://cdn.example.com/final.mp4" });
    const updateProjectFields = vi.fn().mockResolvedValue({ id: 77 });
    const createLibraryItem = vi.fn().mockRejectedValue(new Error("library insert failed"));

    await dispatchLaneARemotionRenderJob(
      { tenantId: "tenant-1", userId: 42, workerJobId: "job-final-3" },
      { execute, updateProjectFields, createLibraryItem },
    );

    expect(updateSet2).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
    expect(updateProjectFields).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42 },
      77,
      { status: "completed" },
    );
  });

  it("preview profile never touches video_projects status or the library — closes preview-must-not-overwrite-final-result", async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                id: "job-preview-1",
                status: "queued",
                inputJson: {
                  kind: "remotion_render_video",
                  schemaVersion: 1,
                  platformContractVersion: "2026-07-12",
                  rendererPolicyVersion: "remotion-1",
                  videoProjectId: "77",
                  projectRevision: 1,
                  traceId: "trace-preview-1",
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
                },
              },
            ]),
        }),
      }),
    });
    const updateSet1 = vi.fn(() => ({ where: () => ({ returning: () => Promise.resolve([{ id: "job-preview-1" }]) }) }));
    const updateSet2 = vi.fn(() => ({ where: () => Promise.resolve([]) }));
    mockDb.update.mockReturnValueOnce({ set: updateSet1 }).mockReturnValueOnce({ set: updateSet2 });

    const execute = vi.fn().mockResolvedValue({ outputUrl: "https://cdn.example.com/preview.mp4" });
    const updateProjectFields = vi.fn();
    const createLibraryItem = vi.fn();

    await dispatchLaneARemotionRenderJob(
      { tenantId: "tenant-1", userId: 42, workerJobId: "job-preview-1" },
      { execute, updateProjectFields, createLibraryItem },
    );

    expect(updateProjectFields).not.toHaveBeenCalled();
    expect(createLibraryItem).not.toHaveBeenCalled();
  });
});

describe("enqueueVideoIntelligenceJob — canonical admission failure", () => {
  it("returns VI_QUEUE_UNAVAILABLE without creating a Redis record", async () => {
    mockCreateFeatureRef.mockRejectedValueOnce(new Error("control plane unavailable"));
    await expect(enqueueVideoIntelligenceJob(basePayload())).rejects.toThrow(/VI_QUEUE_UNAVAILABLE/);
    expect(canonicalJobs.size).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Lane-A render orphan sweep (stranded worker_jobs rows)                    */
/* -------------------------------------------------------------------------- */

describe("sweepOrphanedLaneARenderJobs", () => {
  const NOW = Date.parse("2026-01-01T01:00:00.000Z");
  const now = () => NOW;

  async function finalPayload(overrides: { videoProjectId?: string } = {}) {
    const { remotionRenderVideoWorkerInputSchema } = await import("../../../shared/workerRuntime");
    return remotionRenderVideoWorkerInputSchema.parse({
      videoProjectId: overrides.videoProjectId ?? "77",
      projectRevision: 3,
      traceId: "trace-final-1",
      platformContractVersion: "2026-07-12",
      rendererPolicyVersion: "remotion-1",
      renderProfile: {
        profile: "final",
        width: 1080,
        height: 1920,
        fps: 30,
        codec: "h264",
        loudnessNormalize: true,
        burnInAssCaptions: false,
      },
      remotionTemplate: { id: "x", name: "x", width: 1080, height: 1920, fps: 30, durationInFrames: 10, layers: [] },
      compositionId: "GenericTemplate",
      assetManifest: { sources: [] },
      postPasses: [],
      segmentPlan: null,
      remotionTemplateHash: "a".repeat(16),
      durationInFrames: 10,
    });
  }

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: "job-stranded-1",
      tenantId: "tenant-1",
      requestedByUserId: 42,
      status: "running",
      jobType: "remotion_render_video",
      timeoutSeconds: 900,
      startedAt: new Date(NOW - 900 * 1000 - LANE_A_RENDER_ORPHAN_GRACE_MS - 1000),
      createdAt: new Date(NOW - 900 * 1000 - LANE_A_RENDER_ORPHAN_GRACE_MS - 2000),
      inputJson: {},
      ...overrides,
    };
  }

  beforeEach(() => {
    mockDb.select.mockReset();
    mockDb.update.mockReset();
  });

  it("fails a stranded row past its timeout + grace, and mirrors a final-profile project to failed", async () => {
    const payload = await finalPayload();
    const strandedRow = row({ inputJson: payload });
    mockDb.select.mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([strandedRow]) }) });
    const updateWhere = vi.fn(() => ({ returning: () => Promise.resolve([{ id: strandedRow.id }]) }));
    mockDb.update.mockReturnValueOnce({ set: () => ({ where: updateWhere }) });
    const updateProjectFields = vi.fn().mockResolvedValue({ id: 77 });

    const result = await sweepOrphanedLaneARenderJobs({ now, updateProjectFields });

    expect(result.failed).toEqual(["job-stranded-1"]);
    expect(updateProjectFields).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42 },
      77,
      { status: "failed" },
    );
  });

  it("leaves a row inside its timeout + grace window untouched", async () => {
    const payload = await finalPayload();
    const freshRow = row({
      id: "job-fresh-1",
      inputJson: payload,
      startedAt: new Date(NOW - 1000),
      createdAt: new Date(NOW - 2000),
    });
    mockDb.select.mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([freshRow]) }) });
    const updateProjectFields = vi.fn();

    const result = await sweepOrphanedLaneARenderJobs({ now, updateProjectFields });

    expect(result.failed).toEqual([]);
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(updateProjectFields).not.toHaveBeenCalled();
  });

  it("never touches a preview-profile row's project status, even when stranded", async () => {
    const { remotionRenderVideoWorkerInputSchema } = await import("../../../shared/workerRuntime");
    const previewPayload = remotionRenderVideoWorkerInputSchema.parse({
      videoProjectId: "77",
      projectRevision: 1,
      traceId: "trace-preview-1",
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
    const strandedPreviewRow = row({ id: "job-preview-stranded-1", inputJson: previewPayload });
    mockDb.select.mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([strandedPreviewRow]) }) });
    const updateWhere = vi.fn(() => ({ returning: () => Promise.resolve([{ id: strandedPreviewRow.id }]) }));
    mockDb.update.mockReturnValueOnce({ set: () => ({ where: updateWhere }) });
    const updateProjectFields = vi.fn();

    const result = await sweepOrphanedLaneARenderJobs({ now, updateProjectFields });

    expect(result.failed).toEqual(["job-preview-stranded-1"]);
    expect(updateProjectFields).not.toHaveBeenCalled();
  });

  it("never overwrites a row that reached a terminal state between the read and the write", async () => {
    const payload = await finalPayload();
    const strandedRow = row({ inputJson: payload });
    mockDb.select.mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([strandedRow]) }) });
    // Guarded WHERE finds no matching row anymore — it already went terminal.
    const updateWhere = vi.fn(() => ({ returning: () => Promise.resolve([]) }));
    mockDb.update.mockReturnValueOnce({ set: () => ({ where: updateWhere }) });
    const updateProjectFields = vi.fn();

    const result = await sweepOrphanedLaneARenderJobs({ now, updateProjectFields });

    expect(result.failed).toEqual([]);
    expect(updateProjectFields).not.toHaveBeenCalled();
  });

  it("never throws when the select query itself fails", async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => Promise.reject(new Error("db unavailable")) }),
    });

    await expect(sweepOrphanedLaneARenderJobs({ now })).resolves.toEqual({ failed: [] });
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

  it("arms only the canonical Lane-A sweep", async () => {
    vi.useFakeTimers();
    const sweep = vi.fn().mockResolvedValue(undefined);
    const laneARenderSweep = vi.fn().mockResolvedValue(undefined);

    await initVideoIntelligenceJobsQueue({ sweep, laneARenderSweep });

    expect(sweep).not.toHaveBeenCalled();
    expect(laneARenderSweep).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(VIDEO_INTELLIGENCE_JOB_SWEEP_INTERVAL_MS);
    expect(sweep).not.toHaveBeenCalled();
    expect(laneARenderSweep).toHaveBeenCalledTimes(2);
  });

  it("fires the canonical Lane-A sweep immediately", async () => {
    const sweep = vi.fn().mockResolvedValue(undefined);
    const laneARenderSweep = vi.fn().mockResolvedValue(undefined);
    await initVideoIntelligenceJobsQueue({ sweep, laneARenderSweep });
    // Let the fire-and-forget immediate call's microtask flush.
    await Promise.resolve();
    expect(sweep).not.toHaveBeenCalled();
    expect(laneARenderSweep).toHaveBeenCalledTimes(1);
  });

  it("clears the canonical Lane-A timer on close", async () => {
    vi.useFakeTimers();
    const sweep = vi.fn().mockResolvedValue(undefined);
    const laneARenderSweep = vi.fn().mockResolvedValue(undefined);
    await initVideoIntelligenceJobsQueue({ sweep, laneARenderSweep });
    await closeVideoIntelligenceJobsQueue();

    await vi.advanceTimersByTimeAsync(VIDEO_INTELLIGENCE_JOB_SWEEP_INTERVAL_MS * 2);
    expect(sweep).not.toHaveBeenCalled();
    expect(laneARenderSweep).toHaveBeenCalledTimes(1);
  });

  it("does not arm the Redis orphan requeue sweep during hard cutover", async () => {
    const previous = process.env.FEATURE_186_HARD_CUTOVER;
    process.env.FEATURE_186_HARD_CUTOVER = "true";
    try {
      const sweep = vi.fn().mockResolvedValue(undefined);
      const laneARenderSweep = vi.fn().mockResolvedValue(undefined);
      await initVideoIntelligenceJobsQueue({ sweep, laneARenderSweep });
      await Promise.resolve();

      expect(sweep).not.toHaveBeenCalled();
      expect(laneARenderSweep).toHaveBeenCalledTimes(1);
    } finally {
      if (previous === undefined) delete process.env.FEATURE_186_HARD_CUTOVER;
      else process.env.FEATURE_186_HARD_CUTOVER = previous;
    }
  });
});
