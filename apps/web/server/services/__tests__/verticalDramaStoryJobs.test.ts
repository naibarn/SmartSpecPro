/**
 * `verticalDramaStoryJobs.ts` coverage (task #28) — enqueue/dedupe, status
 * reads, and worker execution. All Redis access goes through the injectable
 * `dependencies.redis` adapter (see the service's own `resolveDeps`), so
 * these tests use a tiny in-memory fake store instead of `vi.mock("../redis")`
 * — no real Redis/BullMQ connection is ever touched.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  enqueueVerticalDramaStoryJob,
  getActiveVerticalDramaStoryJob,
  getVerticalDramaStoryJobStatus,
  runVerticalDramaStoryJob,
  submitVerticalDramaSystemFeedback,
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
    );
    const record = await getVerticalDramaStoryJobStatus(jobId, { tenantId: "tenant-1", seriesId: 10 }, { redis });
    expect(record).toMatchObject({ status: "succeeded", result: { horizonEndEpisode: 5 }, error: null });
    expect(await getActiveVerticalDramaStoryJob({ tenantId: "tenant-1", seriesId: 10 }, { redis })).toBeNull();
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
    ]);
    // Terminal write is never clobbered by a late progress write — final status is "succeeded".
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

  it("failed: sends a Thai, type='alert', priority='high' notification including the error message", async () => {
    const redis = makeFakeRedis();
    const { jobId } = await enqueueVerticalDramaStoryJob(basePayload({ userId: 42, seriesId: 10 }), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });

    await runVerticalDramaStoryJob(jobId, vi.fn().mockRejectedValue(new Error("insufficient credits")), {
      redis,
    });

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    const input = mockCreateNotification.mock.calls[0][0] as Record<string, unknown>;
    expect(input.type).toBe("alert");
    expect(input.priority).toBe("high");
    expect(input.title).toContain("ไม่สำเร็จ");
    expect(input.content).toContain("insufficient credits");
  });

  it("failed: creates an automatic system feedback ticket for admins with diagnostic context and original user attribution", async () => {
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
      category: "vertical_drama_story_jobs",
    });
    expect(values.description).toContain("User ID: 42");
    expect(values.description).toContain(`Job ID: ${jobId}`);
    expect(values.description).toContain("response failed schema validation");
    expect(values.contextJson).toMatchObject({
      source: "vertical_drama_story_jobs",
      eventType: "system_job_failure",
      user: { id: 42, tenantId: "tenant-1" },
      verticalDrama: {
        seriesId: 10,
        jobId,
        kind: "deep_generate",
        status: "failed",
        input: { mode: "premium" },
      },
      diagnostics: {
        pageUrl: "/drama-series/10",
        redisKey: `vd:story-job:${jobId}`,
        activePointerKey: "vd:story-job:active:tenant-1:10",
        screenshotCapture: {
          attached: false,
        },
      },
      error: {
        message: "response failed schema validation",
      },
    });
    expect(mockProcessTicket).toHaveBeenCalledWith(123);
  });

  it("failed: still creates admin feedback even when the owner notification fails", async () => {
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
    expect(mockFeedbackInsertValues).toHaveBeenCalledTimes(1);
    expect(mockProcessTicket).toHaveBeenCalledWith(123);
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
      description: "some description",
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
    expect(values.description.startsWith("&lt;b&gt;")).toBe(true);
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
