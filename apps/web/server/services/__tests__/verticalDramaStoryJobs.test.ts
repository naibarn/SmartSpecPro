/**
 * `verticalDramaStoryJobs.ts` coverage (task #28) — enqueue/dedupe, status
 * reads, and worker execution. All Redis access goes through the injectable
 * `dependencies.redis` adapter (see the service's own `resolveDeps`), so
 * these tests use a tiny in-memory fake store instead of `vi.mock("../redis")`
 * — no real Redis/BullMQ connection is ever touched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  enqueueVerticalDramaStoryJob,
  enqueueVerticalDramaStoryJobHandoff,
  getActiveVerticalDramaStoryJob,
  getVerticalDramaStoryJobStatus,
  runVerticalDramaStoryJob,
  submitVerticalDramaSystemFeedback,
  updateVerticalDramaStoryJobCheckpoint,
  initVerticalDramaStoryJobsQueue,
  closeVerticalDramaStoryJobsQueue,
  type VerticalDramaStoryJobCheckpoint,
  type VerticalDramaStoryJobExecutor,
  type VerticalDramaStoryJobPayload,
  type VerticalDramaStoryJobProgress,
  type VerticalDramaStoryJobRedisAdapter,
} from "../verticalDramaStoryJobs";

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

/**
 * Resilient resume (added 2026-07-14) — `initVerticalDramaStoryJobsQueue`'s
 * BullMQ-options coverage below (`describe("BullMQ auto-retry options")`) is
 * the ONLY place in this file that touches these two modules; every other
 * test still goes through the injectable `dependencies.redis` DI adapter and
 * never hits either mock. `bullmq`'s `Queue`/`Worker` are mocked so no real
 * connection is ever attempted (matching this file's own header doc
 * comment); `../redis`'s `getRedisClient` is mocked for the same reason.
 */
const mockQueueAdd = vi.fn().mockResolvedValue(undefined);
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(function MockQueue() {
    return {
      add: mockQueueAdd,
      close: mockQueueClose,
    };
  }),
  Worker: vi.fn().mockImplementation(function MockWorker() {
    return {
      on: vi.fn(),
      close: mockWorkerClose,
    };
  }),
}));
const bullmqRedisStore = new Map<string, string>();
vi.mock("../redis", () => ({
  getRedisClient: () => ({
    get: async (key: string) => bullmqRedisStore.get(key) ?? null,
    set: async (key: string, value: string) => {
      bullmqRedisStore.set(key, value);
      return "OK";
    },
    del: async (key: string) => (bullmqRedisStore.delete(key) ? 1 : 0),
  }),
}));

/**
 * debt-item-6 (2026-07-08) — `notifyStoryJobTerminal`'s two dynamic
 * `import()`s. Mocked so `runVerticalDramaStoryJob`'s pre-existing tests
 * above (none of which cared about notifications before this wave) never
 * touch a real DB connection or insert a real row; dedicated notification
 * behavior is covered by its own describe block below.
 */
const mockCreateNotification = vi
  .fn()
  .mockResolvedValue({ notificationId: 1, deduplicated: false });
vi.mock("../notificationService", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));
const mockProcessTicket = vi.fn().mockResolvedValue({});
vi.mock("../virtualAdmin/feedbackProcessor", () => ({
  processTicket: (...args: unknown[]) => mockProcessTicket(...args),
}));
const mockReportSystemFailure = vi.fn().mockResolvedValue(undefined);
vi.mock("../systemAutoReportService", () => ({
  reportSystemFailure: (...args: unknown[]) => mockReportSystemFailure(...args),
}));
const mockFeedbackInsertValues = vi.fn();
const mockFeedbackReturning = vi.fn().mockResolvedValue([{ id: 123 }]);
const mockDb = {
  insert: vi.fn(() => ({
    values: mockFeedbackInsertValues.mockImplementation(() => ({
      returning: mockFeedbackReturning,
    })),
  })),
};
const mockGetDb = vi.fn(() => mockDb as unknown);
vi.mock("../../db", () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
}));

/** In-memory fake Redis — same `get`/`set(key,value,"EX",seconds)`/`del` shape as the real adapter. */
function makeFakeRedis(): VerticalDramaStoryJobRedisAdapter & { store: Map<string, string> } {
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

beforeEach(() => {
  mockCreateNotification.mockClear();
  mockCreateNotification.mockResolvedValue({ notificationId: 1, deduplicated: false });
  mockProcessTicket.mockClear();
  mockProcessTicket.mockResolvedValue({});
  mockReportSystemFailure.mockClear();
  mockDb.insert.mockClear();
  mockFeedbackInsertValues.mockClear();
  mockFeedbackReturning.mockClear();
  mockFeedbackReturning.mockResolvedValue([{ id: 123 }]);
  mockGetDb.mockClear();
  mockGetDb.mockReturnValue(mockDb as unknown);
});

function basePayload(overrides: Partial<VerticalDramaStoryJobPayload> = {}): VerticalDramaStoryJobPayload {
  return {
    kind: "deep_generate",
    seriesId: 10,
    tenantId: "tenant-1",
    userId: 42,
    input: { mode: "standard" },
    ...overrides,
  };
}

describe("enqueueVerticalDramaStoryJob", () => {
  it("creates a new queued record and an active-series pointer, and enqueues onto BullMQ", async () => {
    const redis = makeFakeRedis();
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);

    const { jobId, deduped } = await enqueueVerticalDramaStoryJob(basePayload(), { redis, enqueueBullmqJob });

    expect(deduped).toBe(false);
    expect(enqueueBullmqJob).toHaveBeenCalledWith(jobId);

    const record = await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-1", seriesId: 10 }, { redis });
    expect(record).toMatchObject({ jobId, kind: "deep_generate", status: "queued", progress: null, result: null, error: null });

    const active = await getActiveVerticalDramaStoryJob({ tenantId: "tenant-1", seriesId: 10 }, { redis });
    expect(active?.jobId).toBe(jobId);
  });

  it("does not throw when the BullMQ enqueue itself fails — the record stays queued (best-effort, mirrors jobAutomationService.ts)", async () => {
    const redis = makeFakeRedis();
    const enqueueBullmqJob = vi.fn().mockRejectedValue(new Error("queue down"));

    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), { redis, enqueueBullmqJob });

    const record = await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-1", seriesId: 10 }, { redis });
    expect(record?.status).toBe("queued");
  });

  it("double-spend guard: a second submit for the SAME series while a job is queued/running returns the existing jobId instead of creating a new one", async () => {
    const redis = makeFakeRedis();
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);

    const first = await enqueueVerticalDramaStoryJob(basePayload(), { redis, enqueueBullmqJob });
    const second = await enqueueVerticalDramaStoryJob(basePayload({ kind: "extend" }), { redis, enqueueBullmqJob });

    expect(second.deduped).toBe(true);
    expect(second.jobId).toBe(first.jobId);
    expect(enqueueBullmqJob).toHaveBeenCalledTimes(1); // never enqueued a second BullMQ job
  });

  it("allows the current plan job to hand off to a distinct deep job without being swallowed by cross-kind dedupe", async () => {
    const redis = makeFakeRedis();
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);
    const plan = await enqueueVerticalDramaStoryJob(
      basePayload({ kind: "plan", input: {} }),
      { redis, enqueueBullmqJob },
    );

    const deep = await enqueueVerticalDramaStoryJobHandoff(
      plan.jobId,
      basePayload({ kind: "deep_generate", input: { horizonEpisodes: 50 } }),
      { redis, enqueueBullmqJob },
    );

    expect(deep.deduped).toBe(false);
    expect(deep.jobId).not.toBe(plan.jobId);
    expect(enqueueBullmqJob).toHaveBeenCalledTimes(2);
    expect((await getActiveVerticalDramaStoryJob({ tenantId: "tenant-1", seriesId: 10 }, { redis }))?.jobId).toBe(deep.jobId);
  });

  it("cross-kind double-spend guard: 'extend' blocks 'improve_script' for the same series, and vice versa (the pointer is per-series, not per-kind)", async () => {
    const redis = makeFakeRedis();
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);

    const extend = await enqueueVerticalDramaStoryJob(basePayload({ kind: "extend", input: {} }), {
      redis,
      enqueueBullmqJob,
    });
    const improveAttempt = await enqueueVerticalDramaStoryJob(
      basePayload({ kind: "improve_script", input: { userRevisionRequest: "ทำให้สนุกขึ้น" } }),
      { redis, enqueueBullmqJob },
    );

    expect(improveAttempt.deduped).toBe(true);
    expect(improveAttempt.jobId).toBe(extend.jobId);
  });

  it("does NOT dedupe a different series (independent per-series pointers)", async () => {
    const redis = makeFakeRedis();
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);

    const seriesA = await enqueueVerticalDramaStoryJob(basePayload({ seriesId: 10 }), { redis, enqueueBullmqJob });
    const seriesB = await enqueueVerticalDramaStoryJob(basePayload({ seriesId: 11 }), { redis, enqueueBullmqJob });

    expect(seriesB.deduped).toBe(false);
    expect(seriesB.jobId).not.toBe(seriesA.jobId);
  });

  it("self-heals a stale pointer (record already terminal) and creates a fresh job instead of deduping forever", async () => {
    const redis = makeFakeRedis();
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);

    const first = await enqueueVerticalDramaStoryJob(basePayload(), { redis, enqueueBullmqJob });
    const executor: VerticalDramaStoryJobExecutor = vi.fn().mockResolvedValue({ ok: true });
    await runVerticalDramaStoryJob(first.jobId, executor, { redis }); // completes -> succeeded, pointer cleared

    const second = await enqueueVerticalDramaStoryJob(basePayload(), { redis, enqueueBullmqJob });
    expect(second.deduped).toBe(false);
    expect(second.jobId).not.toBe(first.jobId);
  });
});

describe("getVerticalDramaStoryJobStatus", () => {
  it("returns null (never throws) for an unknown jobId", async () => {
    const redis = makeFakeRedis();
    const result = await getVerticalDramaStoryJobStatus("nope", { tenantId: "tenant-1", seriesId: 10 }, { redis });
    expect(result).toBeNull();
  });

  it("returns null for a job that belongs to a different tenant or series (never discloses existence)", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload({ tenantId: "tenant-1", seriesId: 10 }), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    expect(await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-2", seriesId: 10 }, { redis })).toBeNull();
    expect(await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-1", seriesId: 99 }, { redis })).toBeNull();
  });
});

describe("getActiveVerticalDramaStoryJob", () => {
  it("returns null when no job has ever run for the series", async () => {
    const redis = makeFakeRedis();
    expect(await getActiveVerticalDramaStoryJob({ tenantId: "tenant-1", seriesId: 10 }, { redis })).toBeNull();
  });

  it("self-heals and returns null when the pointer survives but the record is already terminal", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });
    await runVerticalDramaStoryJob(jobId, vi.fn().mockResolvedValue({ ok: true }), { redis });

    // Simulate the pointer outliving the terminal record's clear (defensive path).
    await redis.set(`vd:story-job:active:tenant-1:10`, jobId, "EX", 999);

    expect(await getActiveVerticalDramaStoryJob({ tenantId: "tenant-1", seriesId: 10 }, { redis })).toBeNull();
    expect(await redis.get(`vd:story-job:active:tenant-1:10`)).toBeNull(); // pointer cleared by the self-heal
  });
});

describe("runVerticalDramaStoryJob", () => {
  it("is a no-op (never throws) when the jobId is unknown", async () => {
    const redis = makeFakeRedis();
    await expect(
      runVerticalDramaStoryJob("nope", vi.fn(), { redis }),
    ).resolves.toBeUndefined();
  });

  it("happy path: running -> succeeded with result, clears the active pointer", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });
    const executor: VerticalDramaStoryJobExecutor = vi.fn().mockResolvedValue({ horizonEndEpisode: 5 });

    await runVerticalDramaStoryJob(jobId, executor, { redis });

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "deep_generate", seriesId: 10, tenantId: "tenant-1", userId: 42 }),
      expect.any(Function),
      // Resilient resume (added 2026-07-14) — a fresh job (no prior
      // checkpoint) resumes with `checkpoint: null`.
      expect.objectContaining({
        checkpoint: null,
        persistCheckpoint: expect.any(Function),
        persistCheckpointAndWait: expect.any(Function),
      }),
    );
    const record = await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-1", seriesId: 10 }, { redis });
    expect(record).toMatchObject({ status: "succeeded", result: { horizonEndEpisode: 5 }, error: null });
    expect(await getActiveVerticalDramaStoryJob({ tenantId: "tenant-1", seriesId: 10 }, { redis })).toBeNull();
  });

  it("keeps a deep-draft job active and resumes only from its checkpoint after a partial result", async () => {
    const redis = makeFakeRedis();
    const sleep = vi.fn().mockResolvedValue(undefined);
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });
    const seenCheckpoints: unknown[] = [];
    const executor: VerticalDramaStoryJobExecutor = vi
      .fn()
      .mockImplementationOnce(async (_payload, _onProgress, resume) => {
        seenCheckpoints.push(resume.checkpoint);
        resume.persistCheckpoint({
          draftedItems: [{ episodeNumber: 1, shotDrafts: [] }],
          completedEpisodeNumbers: [1],
          chunkSizesDone: [1],
          creditsUsed: 5,
          updatedAt: new Date().toISOString(),
        });
        return { partial: true, missingEpisodes: [2] };
      })
      .mockImplementationOnce(async (_payload, _onProgress, resume) => {
        seenCheckpoints.push(resume.checkpoint);
        return { partial: false, horizonEndEpisode: 2 };
      });

    await runVerticalDramaStoryJob(jobId, executor, { redis, sleep });

    expect(executor).toHaveBeenCalledTimes(2);
    expect(seenCheckpoints[0]).toBeNull();
    expect(seenCheckpoints[1]).toMatchObject({ completedEpisodeNumbers: [1] });
    expect(sleep).toHaveBeenCalledWith(1_000);
    const record = await getVerticalDramaStoryJobStatus(
      jobId,
      { tenantId: "tenant-1", seriesId: 10 },
      { redis },
    );
    expect(record).toMatchObject({
      status: "succeeded",
      result: { partial: false, horizonEndEpisode: 2 },
      recoveryAttempts: 1,
    });
    expect(await getActiveVerticalDramaStoryJob({ tenantId: "tenant-1", seriesId: 10 }, { redis })).toBeNull();
  });

  it("retries an escaped transient provider-capacity error in the same background job", async () => {
    const redis = makeFakeRedis();
    const sleep = vi.fn().mockResolvedValue(undefined);
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });
    const executor = vi
      .fn<VerticalDramaStoryJobExecutor>()
      .mockRejectedValueOnce(
        new Error(
          "This request would exceed your available credits given your current in-flight requests",
        ),
      )
      .mockResolvedValueOnce({ ok: true });

    await runVerticalDramaStoryJob(jobId, executor, { redis, sleep });

    expect(executor).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1_000);
    const record = await getVerticalDramaStoryJobStatus(
      jobId,
      { tenantId: "tenant-1", seriesId: 10 },
      { redis },
    );
    expect(record).toMatchObject({ status: "succeeded", result: { ok: true }, recoveryAttempts: 1 });
  });

  it("failure path: running -> failed with the error message, clears the active pointer", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });
    const executor: VerticalDramaStoryJobExecutor = vi.fn().mockRejectedValue(new Error("insufficient credits"));

    await runVerticalDramaStoryJob(jobId, executor, { redis });

    const record = await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-1", seriesId: 10 }, { redis });
    expect(record).toMatchObject({ status: "failed", error: "insufficient credits", result: null });
    expect(await getActiveVerticalDramaStoryJob({ tenantId: "tenant-1", seriesId: 10 }, { redis })).toBeNull();
  });

  it("threads onProgress calls into the persisted record's `progress` field while status stays 'running'", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });
    const seenProgress: VerticalDramaStoryJobProgress[] = [];
    const executor: VerticalDramaStoryJobExecutor = async (_payload, onProgress) => {
      onProgress({ phase: "draft", chunkIndex: 1, chunkCount: 2 });
      onProgress({ phase: "draft", chunkIndex: 2, chunkCount: 2 });
      return { ok: true };
    };

    // Snapshot mid-flight progress by wrapping the fake redis's set() before running.
    const originalSet = redis.set;
    redis.set = vi.fn(async (key, value, mode, seconds) => {
      const parsed = key.startsWith("vd:story-job:") && !key.includes(":active:") ? JSON.parse(value) : null;
      if (parsed?.progress) seenProgress.push(parsed.progress);
      return originalSet(key, value, mode, seconds);
    });

    await runVerticalDramaStoryJob(jobId, executor, { redis });

    expect(seenProgress).toEqual([
      { phase: "draft", chunkIndex: 1, chunkCount: 2 },
      { phase: "draft", chunkIndex: 2, chunkCount: 2 },
      { phase: "draft", chunkIndex: 2, chunkCount: 2 },
    ]);
    // The terminal record retains the latest progress for post-failure/success
    // inspection, and a late progress write still cannot clobber its status.
    const record = await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-1", seriesId: 10 }, { redis });
    expect(record?.status).toBe("succeeded");
  });

  it("write-ordering guarantee: a progress write that resolves AFTER the terminal write is enqueued never clobbers the terminal status", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    // Make every `set()` after the first two (queued->running transition +
    // its own initial writes) resolve on a delayed microtask queue turn, so
    // the progress write's OWN promise settles late — the per-job write
    // queue (`enqueueWrite`) must still serialize it strictly before the
    // terminal write regardless of that delay.
    let callCount = 0;
    const originalSet = redis.set;
    redis.set = vi.fn(async (key, value, mode, seconds) => {
      callCount += 1;
      if (callCount > 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      return originalSet(key, value, mode, seconds);
    });

    const executor: VerticalDramaStoryJobExecutor = async (_payload, onProgress) => {
      onProgress({ phase: "review" });
      return { done: true };
    };

    await runVerticalDramaStoryJob(jobId, executor, { redis });

    const record = await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-1", seriesId: 10 }, { redis });
    expect(record?.status).toBe("succeeded");
    expect(record?.result).toEqual({ done: true });
  });

  it("only clears the active pointer if it still points at THIS job (defensive against a pathological race with a newer job)", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    // Simulate a newer job having already claimed the series' pointer by the
    // time this (stale) execution finishes.
    await redis.set("vd:story-job:active:tenant-1:10", "some-other-job-id", "EX", 999);

    await runVerticalDramaStoryJob(jobId, vi.fn().mockResolvedValue({ ok: true }), { redis });

    expect(await redis.get("vd:story-job:active:tenant-1:10")).toBe("some-other-job-id");
  });
});

describe("runVerticalDramaStoryJob — terminal notification (debt-item-6)", () => {
  it("succeeded: sends a Thai, type='system' notification to the job owner referencing the series", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload({ userId: 42, seriesId: 10 }), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    await runVerticalDramaStoryJob(jobId, vi.fn().mockResolvedValue({ ok: true }), { redis });

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    const input = mockCreateNotification.mock.calls[0][0] as Record<string, unknown>;
    expect(input.userId).toBe(42);
    expect(input.type).toBe("system");
    expect(input.priority).toBe("normal");
    expect(input.title).toContain("เสร็จแล้ว");
    expect(input.actionUrl).toBe("/drama-series/10");
    expect(input.groupKey).toBe(`vd_story_job:${jobId}`);
  });

  it("failed: routes insufficient user credits to the central credit policy without a generic failure notification", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload({ userId: 42, seriesId: 10 }), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    await runVerticalDramaStoryJob(jobId, vi.fn().mockRejectedValue(new Error("insufficient credits")), {
      redis,
    });

    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockReportSystemFailure).toHaveBeenCalledTimes(1);
    expect(mockReportSystemFailure.mock.calls[0][0]).toMatchObject({
      source: "vertical_drama_story_jobs",
      userId: 42,
      creditContext: { source: "user", modelKind: "llm" },
    });
  });

  it("failed: sends non-credit failures through the central admin auto-report path", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(
      basePayload({ userId: 42, tenantId: "tenant-1", seriesId: 10, input: { mode: "premium" } }),
      {
        redis,
        enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
      },
    );

    await runVerticalDramaStoryJob(
      jobId,
      vi.fn().mockRejectedValue(new Error("response failed schema validation")),
      {
        redis,
      },
    );

    expect(mockReportSystemFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "vertical_drama_story_jobs",
        userId: 42,
        tenantId: "tenant-1",
        jobId,
        errorMessage: "response failed schema validation",
      }),
    );
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("failed policy jobs notify the owner with actionable safe wording", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(
      basePayload({ kind: "episode_repair", userId: 42, seriesId: 10 }),
      {
        redis,
        enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
      },
    );

    await runVerticalDramaStoryJob(
      jobId,
      vi.fn().mockRejectedValue(
        new Error("Episode story contains a high-risk policy context; rewrite before media generation."),
      ),
      { redis },
    );

    const input = mockCreateNotification.mock.calls[0][0] as Record<string, unknown>;
    expect(input.title).toContain("สร้างเนื้อหาตอนใหม่");
    expect(input.content).toContain("ไม่ผ่านการตรวจสอบความปลอดภัย");
    expect(input.content).not.toContain("high-risk policy context");
  });

  it("failed: still reports through the central path when the owner notification fails", async () => {
    const redis = makeFakeRedis();
    mockCreateNotification.mockRejectedValueOnce(new Error("notification service down"));
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload({ userId: 42, seriesId: 10 }), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    await expect(
      runVerticalDramaStoryJob(jobId, vi.fn().mockRejectedValue(new Error("schema validation failed")), {
        redis,
      }),
    ).resolves.toBeUndefined();

    const record = await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-1", seriesId: 10 }, { redis });
    expect(record?.status).toBe("failed");
    expect(mockReportSystemFailure).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("differentiates the notification content per job kind (extend vs. deep_generate)", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload({ kind: "extend" }), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    await runVerticalDramaStoryJob(jobId, vi.fn().mockResolvedValue({ ok: true }), { redis });

    const input = mockCreateNotification.mock.calls[0][0] as Record<string, unknown>;
    expect(input.title).toContain("ขยายร่างเนื้อเรื่อง");
    expect(input.title).not.toContain("สร้างร่างละเอียดเนื้อเรื่อง");
  });

  it("a notification failure never fails the job — the terminal record is still correctly persisted", async () => {
    const redis = makeFakeRedis();
    mockCreateNotification.mockRejectedValueOnce(new Error("notification service down"));
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    await expect(
      runVerticalDramaStoryJob(jobId, vi.fn().mockResolvedValue({ horizonEndEpisode: 5 }), { redis }),
    ).resolves.toBeUndefined();

    const record = await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-1", seriesId: 10 }, { redis });
    expect(record).toMatchObject({ status: "succeeded", result: { horizonEndEpisode: 5 } });
  });

  it("a getDb() failure (DB unavailable) never fails the job either", async () => {
    const redis = makeFakeRedis();
    mockGetDb.mockImplementationOnce(() => {
      throw new Error("Database not configured");
    });
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    await expect(
      runVerticalDramaStoryJob(jobId, vi.fn().mockResolvedValue({ ok: true }), { redis }),
    ).resolves.toBeUndefined();

    const record = await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-1", seriesId: 10 }, { redis });
    expect(record?.status).toBe("succeeded");
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* submitVerticalDramaSystemFeedback (Phase F, added 2026-07-09) — the        */
/* generic auto-filed-ticket helper extracted from `submitFailedStoryJobFeedback` */
/* so a partial (not job-terminal) in-job failure can file a ticket through   */
/* the SAME mechanism. `routers/verticalDramaSeries.ts`'s own tests cover the */
/* call-site wiring; these tests cover the helper itself directly.           */
/* -------------------------------------------------------------------------- */

describe("submitVerticalDramaSystemFeedback", () => {
  function baseInput(overrides: Partial<Parameters<typeof submitVerticalDramaSystemFeedback>[0]> = {}) {
    return {
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      category: "vertical_drama_season_critique_apply",
      title: "[System] ปรับปรุงเนื้อเรื่องตามคำแนะนำ ล้มเหลวบางส่วน (series #10)",
      description: "some description",
      stepsToReproduce: "1. do a thing",
      expectedBehavior: "should not fail silently",
      actualBehavior: "การเรียก AI เพื่อแก้ไขล้มเหลว",
      contextJson: { source: "vertical_drama_season_critique_apply", seriesId: 10 },
      ...overrides,
    };
  }

  it("inserts a `submittedByType: 'system'` feedback ticket and processes it", async () => {
    await submitVerticalDramaSystemFeedback(baseInput(), mockDb);

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(mockFeedbackInsertValues).toHaveBeenCalledTimes(1);
    const values = mockFeedbackInsertValues.mock.calls[0][0] as Record<string, any>;
    expect(values).toMatchObject({
      tenantId: "tenant-1",
      submittedBy: 42,
      submittedByType: "system",
      ticketType: "bug",
      priority: "high",
      severity: "high",
      category: "vertical_drama_season_critique_apply",
      title: "[System] ปรับปรุงเนื้อเรื่องตามคำแนะนำ ล้มเหลวบางส่วน (series #10)",
      description: "Reporter: user #42\nsome description",
      expectedBehavior: "should not fail silently",
      actualBehavior: "การเรียก AI เพื่อแก้ไขล้มเหลว",
    });
    expect(values.contextJson).toEqual({ source: "vertical_drama_season_critique_apply", seriesId: 10 });
    expect(mockProcessTicket).toHaveBeenCalledWith(123);
  });

  it("sanitizes/truncates title, description, and actualBehavior but leaves expectedBehavior untouched", async () => {
    await submitVerticalDramaSystemFeedback(
      baseInput({
        title: `<script>${"a".repeat(300)}`,
        description: `<b>${"d".repeat(6000)}`,
        actualBehavior: `<i>${"e".repeat(3000)}`,
        expectedBehavior: "raw & unsanitized <ok>",
      }),
      mockDb,
    );

    const values = mockFeedbackInsertValues.mock.calls[0][0] as Record<string, any>;
    expect(values.title.startsWith("&lt;script&gt;")).toBe(true);
    expect(values.title.length).toBe(255);
    expect(values.description.startsWith("Reporter: user #42\n&lt;b&gt;")).toBe(true);
    expect(values.description.length).toBe(5000);
    expect(values.actualBehavior.startsWith("&lt;i&gt;")).toBe(true);
    expect(values.actualBehavior.length).toBe(2000);
    expect(values.expectedBehavior).toBe("raw & unsanitized <ok>"); // NOT sanitized — caller's responsibility.
  });

  it("never throws even when the DB insert itself fails", async () => {
    const throwingDb = {
      insert: vi.fn(() => ({
        values: vi.fn(() => {
          throw new Error("db down");
        }),
      })),
    };

    await expect(submitVerticalDramaSystemFeedback(baseInput(), throwingDb)).resolves.toBeUndefined();
    expect(mockProcessTicket).not.toHaveBeenCalled();
  });

  it("never throws and skips processTicket when the insert returns no row", async () => {
    mockFeedbackReturning.mockResolvedValueOnce([]);

    await expect(submitVerticalDramaSystemFeedback(baseInput(), mockDb)).resolves.toBeUndefined();
    expect(mockProcessTicket).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Resilient resume (added 2026-07-14,                                       */
/* `planning/vertical-drama-deep-story-resilient-resume/plan.md`) — checkpoint */
/* writer, resume-context threading, and heartbeat TTL refresh.              */
/* -------------------------------------------------------------------------- */

describe("updateVerticalDramaStoryJobCheckpoint", () => {
  function baseCheckpoint(overrides: Partial<VerticalDramaStoryJobCheckpoint> = {}): VerticalDramaStoryJobCheckpoint {
    return {
      draftedItems: [{ episodeNumber: 1 }, { episodeNumber: 2 }],
      completedEpisodeNumbers: [1, 2],
      chunkSizesDone: [2],
      creditsUsed: 10,
      updatedAt: "2026-07-14T00:00:00.000Z",
      ...overrides,
    };
  }

  it("writes a fresh checkpoint onto the job record", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    await updateVerticalDramaStoryJobCheckpoint(jobId, baseCheckpoint(), { redis });

    const record = await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-1", seriesId: 10 }, { redis });
    expect(record?.checkpoint).toMatchObject({
      draftedItems: [{ episodeNumber: 1 }, { episodeNumber: 2 }],
      completedEpisodeNumbers: [1, 2],
      chunkSizesDone: [2],
      creditsUsed: 10,
    });
    expect(record?.status).toBe("running");
  });

  it("merges a PARTIAL patch onto the existing checkpoint (fields absent from the patch fall back to the prior checkpoint)", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    await updateVerticalDramaStoryJobCheckpoint(jobId, baseCheckpoint(), { redis });
    // Only bump creditsUsed — draftedItems/completedEpisodeNumbers/chunkSizesDone omitted.
    await updateVerticalDramaStoryJobCheckpoint(jobId, { creditsUsed: 25 }, { redis });

    const record = await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-1", seriesId: 10 }, { redis });
    expect(record?.checkpoint).toMatchObject({
      draftedItems: [{ episodeNumber: 1 }, { episodeNumber: 2 }],
      completedEpisodeNumbers: [1, 2],
      chunkSizesDone: [2],
      creditsUsed: 25,
    });
  });

  it("preserves plan candidate fields across a later checkpoint patch", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(
      basePayload({ kind: "plan", input: {} }),
      { redis, enqueueBullmqJob: vi.fn().mockResolvedValue(undefined) },
    );
    const candidate = {
      expandedSeasonArc: "arc",
      refinedCharacters: [{ name: "A", role: "lead", description: "d", narrativeRole: "lead", roleTier: "main", occupation: "x" }],
      episodeBreakdown: [{ episodeNumber: 1, workingTitle: "one", logline: "l", keyBeats: ["b"] }],
    };
    await updateVerticalDramaStoryJobCheckpoint(jobId, {
      draftedItems: [],
      completedEpisodeNumbers: [],
      chunkSizesDone: [],
      creditsUsed: 7,
      planStage: "candidate_ready",
      planCandidate: candidate,
      planCreditsUsed: 7,
      planModel: "model-a",
      updatedAt: new Date().toISOString(),
    }, { redis });
    await updateVerticalDramaStoryJobCheckpoint(jobId, { creditsUsed: 8 }, { redis });

    expect((await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-1", seriesId: 10 }, { redis }))?.checkpoint).toMatchObject({
      planStage: "candidate_ready",
      planCandidate: candidate,
      planCreditsUsed: 7,
      planModel: "model-a",
      creditsUsed: 8,
    });
  });

  it("is a no-op (never throws) when the job record is missing", async () => {
    const redis = makeFakeRedis();
    await expect(
      updateVerticalDramaStoryJobCheckpoint("nope", baseCheckpoint(), { redis }),
    ).resolves.toBeUndefined();
  });

  it("is serialized: two checkpoint writes for the SAME jobId apply strictly in call order even when the first resolves late", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    let callCount = 0;
    const originalSet = redis.set;
    redis.set = vi.fn(async (key, value, mode, seconds) => {
      callCount += 1;
      if (callCount === 1) {
        // Delay the FIRST checkpoint write so it would resolve AFTER the
        // second one starts, if writes were not serialized.
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
      return originalSet(key, value, mode, seconds);
    });

    const first = updateVerticalDramaStoryJobCheckpoint(
      jobId,
      baseCheckpoint({ completedEpisodeNumbers: [1], chunkSizesDone: [1], creditsUsed: 5 }),
      { redis },
    );
    const second = updateVerticalDramaStoryJobCheckpoint(
      jobId,
      baseCheckpoint({ completedEpisodeNumbers: [1, 2], chunkSizesDone: [1, 1], creditsUsed: 10 }),
      { redis },
    );
    await Promise.all([first, second]);

    // The SECOND write (called after the first) must be the one that "wins"
    // — a correctly-serialized queue never lets an earlier-enqueued, slower
    // write clobber a later one.
    const record = await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-1", seriesId: 10 }, { redis });
    expect(record?.checkpoint?.completedEpisodeNumbers).toEqual([1, 2]);
    expect(record?.checkpoint?.creditsUsed).toBe(10);
  });
});

describe("runVerticalDramaStoryJob — resilient resume (checkpoint)", () => {
  it("passes `resume.checkpoint: null` and a `persistCheckpoint` function to a fresh job with no checkpoint yet", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });
    let seenResume: unknown;
    const executor: VerticalDramaStoryJobExecutor = async (_payload, _onProgress, resume) => {
      seenResume = resume;
      return { ok: true };
    };

    await runVerticalDramaStoryJob(jobId, executor, { redis });

    expect(seenResume).toMatchObject({ checkpoint: null });
    expect(typeof (seenResume as any).persistCheckpoint).toBe("function");
  });

  it("a `persistCheckpoint` call during the run is durably readable via a SAME-jobId re-run's `resume.checkpoint` (simulates a BullMQ redelivery after a mid-run crash)", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    // First attempt: checkpoints ONE chunk, then throws (simulating a
    // mid-run crash/failure AFTER the checkpoint write was queued).
    const firstAttempt: VerticalDramaStoryJobExecutor = async (_payload, _onProgress, resume) => {
      resume.persistCheckpoint({
        draftedItems: [{ episodeNumber: 1 }],
        completedEpisodeNumbers: [1],
        chunkSizesDone: [1],
        creditsUsed: 5,
        updatedAt: new Date().toISOString(),
      });
      throw new Error("simulated mid-run crash");
    };
    await runVerticalDramaStoryJob(jobId, firstAttempt, { redis });

    const failedRecord = await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-1", seriesId: 10 }, { redis });
    expect(failedRecord?.status).toBe("failed");
    // The checkpoint from the failed attempt MUST survive the terminal
    // failure write — this is the core crash-resume guarantee.
    expect(failedRecord?.checkpoint?.completedEpisodeNumbers).toEqual([1]);

    // BullMQ redelivers the SAME jobId — `runVerticalDramaStoryJob` runs
    // again; the executor should see the checkpoint from the failed attempt.
    let seenCheckpoint: unknown;
    const secondAttempt: VerticalDramaStoryJobExecutor = async (_payload, _onProgress, resume) => {
      seenCheckpoint = resume.checkpoint;
      return { ok: true };
    };
    await runVerticalDramaStoryJob(jobId, secondAttempt, { redis });

    expect(seenCheckpoint).toMatchObject({ completedEpisodeNumbers: [1], chunkSizesDone: [1] });
    const succeededRecord = await getVerticalDramaStoryJobStatus(
      jobId,
      { tenantId: "tenant-1", seriesId: 10 },
      { redis },
    );
    expect(succeededRecord?.status).toBe("succeeded");
  });

  it("retries a plan's local finalization failure from its candidate checkpoint instead of terminating immediately", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(
      basePayload({ kind: "plan", input: {} }),
      { redis, enqueueBullmqJob: vi.fn().mockResolvedValue(undefined) },
    );
    const sleep = vi.fn().mockResolvedValue(undefined);
    let seenCheckpoint: VerticalDramaStoryJobCheckpoint | null = null;
    let attempt = 0;
    const executor: VerticalDramaStoryJobExecutor = vi.fn(async (_payload, _onProgress, resume) => {
      attempt += 1;
      if (attempt === 1) {
        resume.persistCheckpoint({
          draftedItems: [],
          completedEpisodeNumbers: [],
          chunkSizesDone: [],
          creditsUsed: 7,
          planStage: "candidate_ready",
          planCandidate: { expandedSeasonArc: "candidate" },
          planCreditsUsed: 7,
          planModel: "test-model",
          updatedAt: new Date().toISOString(),
        });
        throw new Error("transient finalization failure");
      }
      seenCheckpoint = resume.checkpoint;
      return { ok: true };
    });

    await runVerticalDramaStoryJob(jobId, executor, { redis, sleep });

    expect(executor).toHaveBeenCalledTimes(2);
    expect(seenCheckpoint).toMatchObject({
      planStage: "candidate_ready",
      planCreditsUsed: 7,
      planModel: "test-model",
    });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect((await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-1", seriesId: 10 }, { redis }))?.status).toBe("succeeded");
  });

  it("a later `onProgress` write never regresses an already-persisted checkpoint back to a stale value", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    // Snapshot every job-record write (mirrors the existing "threads
    // onProgress calls..." test's own technique) so we can inspect the
    // record as it stood RIGHT AFTER the onProgress write specifically —
    // the terminal write intentionally resets `progress` back to `null`
    // (pre-existing, unrelated behavior; `progress` is a transient
    // "currently running" signal, not part of the terminal result), so
    // asserting against the FINAL record would not actually test what this
    // case cares about: that onProgress's OWN write doesn't wipe out a
    // checkpoint a `persistCheckpoint` call already persisted before it.
    const jobRecordKey = `vd:story-job:${jobId}`;
    const snapshots: Array<Record<string, unknown>> = [];
    const originalSet = redis.set;
    redis.set = vi.fn(async (key, value, mode, seconds) => {
      if (key === jobRecordKey) snapshots.push(JSON.parse(value));
      return originalSet(key, value, mode, seconds);
    });

    const executor: VerticalDramaStoryJobExecutor = async (_payload, onProgress, resume) => {
      resume.persistCheckpoint({
        draftedItems: [{ episodeNumber: 1 }],
        completedEpisodeNumbers: [1],
        chunkSizesDone: [1],
        creditsUsed: 5,
        updatedAt: new Date().toISOString(),
      });
      // A progress event fired AFTER the checkpoint write — must not wipe it.
      onProgress({ phase: "draft", chunkIndex: 2, chunkCount: 3 });
      return { ok: true };
    };

    await runVerticalDramaStoryJob(jobId, executor, { redis });

    const progressSnapshot = snapshots.find(
      (s) => (s as { progress?: unknown }).progress != null,
    );
    expect(progressSnapshot).toMatchObject({
      progress: { phase: "draft", chunkIndex: 2, chunkCount: 3 },
      checkpoint: { completedEpisodeNumbers: [1] },
    });

    // The checkpoint itself also durably survives past the terminal write.
    const record = await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-1", seriesId: 10 }, { redis });
    expect(record?.checkpoint?.completedEpisodeNumbers).toEqual([1]);
  });
});

describe("heartbeat TTL (added 2026-07-14)", () => {
  it("refreshes the active-pointer TTL on the initial running write, on every onProgress write, and on every checkpoint write", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    const pointerKey = "vd:story-job:active:tenant-1:10";
    const pointerSetCalls: Array<[string, string, string, number]> = [];
    const originalSet = redis.set;
    redis.set = vi.fn(async (key, value, mode, seconds) => {
      if (key === pointerKey) pointerSetCalls.push([key, value, mode, seconds]);
      return originalSet(key, value, mode, seconds);
    });

    const executor: VerticalDramaStoryJobExecutor = async (_payload, onProgress, resume) => {
      onProgress({ phase: "draft", chunkIndex: 1, chunkCount: 2 });
      resume.persistCheckpoint({
        draftedItems: [],
        completedEpisodeNumbers: [1],
        chunkSizesDone: [1],
        creditsUsed: 5,
        updatedAt: new Date().toISOString(),
      });
      return { ok: true };
    };

    await runVerticalDramaStoryJob(jobId, executor, { redis });

    // At least: the initial "running" transition, the onProgress write, and
    // the checkpoint write — each refreshes the pointer TTL to the 6h floor.
    expect(pointerSetCalls.length).toBeGreaterThanOrEqual(3);
    for (const [, value, mode, seconds] of pointerSetCalls) {
      expect(value).toBe(jobId);
      expect(mode).toBe("EX");
      expect(seconds).toBe(6 * 60 * 60);
    }
  });

  it("does NOT refresh the pointer on the terminal succeeded write (status is no longer 'running')", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    const pointerKey = "vd:story-job:active:tenant-1:10";
    const pointerSetCalls: unknown[] = [];
    const originalSet = redis.set;
    redis.set = vi.fn(async (key, value, mode, seconds) => {
      if (key === pointerKey) pointerSetCalls.push(value);
      return originalSet(key, value, mode, seconds);
    });
    const countBeforeTerminal = pointerSetCalls.length;

    await runVerticalDramaStoryJob(jobId, vi.fn().mockResolvedValue({ ok: true }), { redis });

    // The pointer is deleted (not re-set) once the job is terminal — the
    // `finally` block's `del` is a separate call, not a `set`.
    expect(pointerSetCalls.length).toBe(countBeforeTerminal + 1); // only the initial "running" transition
    expect(await redis.get(pointerKey)).toBeNull();
  });
});

describe("BullMQ auto-retry options (added 2026-07-14)", () => {
  afterEach(async () => {
    await closeVerticalDramaStoryJobsQueue();
  });

  it("enqueues onto the real BullMQ queue with attempts/backoff/bounded removeOnFail", async () => {
    mockQueueAdd.mockClear();
    await initVerticalDramaStoryJobsQueue();

    await enqueueVerticalDramaStoryJob(basePayload());

    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    const [name, data, opts] = mockQueueAdd.mock.calls[0];
    expect(name).toBe("run");
    expect(data).toMatchObject({ jobId: expect.any(String) });
    expect(opts).toMatchObject({
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnFail: { age: 24 * 60 * 60 },
    });
  });
});
