import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_core/logger", () => ({ debugError: vi.fn() }));
vi.mock("../redis", () => ({
  getRedisClient: vi.fn(() => {
    throw new Error("live Redis must not be used in unit tests");
  }),
}));

import {
  enqueueVerticalDramaShotVideoPromptJob,
  getActiveVerticalDramaShotVideoPromptJobs,
  getVerticalDramaShotVideoPromptJobStatus,
  isVerticalDramaShotVideoPromptWorkerExecution,
  recoverVerticalDramaShotVideoPromptJob,
  runVerticalDramaShotVideoPromptJob,
  VerticalDramaShotVideoPromptConflictError,
  type VerticalDramaShotVideoPromptJobPayload,
  type VerticalDramaShotVideoPromptJobRedisAdapter,
} from "../verticalDramaShotVideoPromptJobs";

function makeFakeRedis(): VerticalDramaShotVideoPromptJobRedisAdapter & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async key => store.get(key) ?? null),
    set: vi.fn(async (key, value) => {
      store.set(key, value);
      return "OK";
    }),
    setNx: vi.fn(async (key, value) => {
      if (store.has(key)) return false;
      store.set(key, value);
      return true;
    }),
    incr: vi.fn(async key => {
      const value = Number(store.get(key) ?? "0") + 1;
      store.set(key, String(value));
      return value;
    }),
    del: vi.fn(async key => (store.delete(key) ? 1 : 0)),
    compareDelete: vi.fn(async (key, expected) => {
      if (store.get(key) !== expected) return false;
      store.delete(key);
      return true;
    }),
  };
}

function payload(
  overrides: Partial<VerticalDramaShotVideoPromptJobPayload> = {}
): VerticalDramaShotVideoPromptJobPayload {
  return {
    tenantId: "tenant-1",
    userId: 42,
    seriesId: 21,
    episodeId: 137,
    shotNumber: 9,
    publicUrl: "https://smartaihub.app",
    input: {
      seriesId: "21",
      episodeId: "137",
      shotNumber: 9,
      attachShotImage: true,
      qualityLoop: true,
      idempotencyKey: "request-1",
    },
    ...overrides,
  };
}

const owner = {
  tenantId: "tenant-1",
  userId: 42,
  seriesId: 21,
  episodeId: 137,
  shotNumber: 9,
};

beforeEach(() => vi.clearAllMocks());

describe("vertical drama shot video prompt queue", () => {
  it("deduplicates a repeated request and rejects a conflicting active instruction", async () => {
    const redis = makeFakeRedis();
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);
    const first = await enqueueVerticalDramaShotVideoPromptJob(payload(), {
      redis,
      enqueueBullmqJob,
    });
    const replay = await enqueueVerticalDramaShotVideoPromptJob(
      payload({
        input: { ...payload().input, idempotencyKey: "request-2" },
      }),
      { redis, enqueueBullmqJob }
    );

    expect(replay).toMatchObject({
      jobId: first.jobId,
      status: "queued",
      deduplicated: true,
    });
    await expect(
      enqueueVerticalDramaShotVideoPromptJob(
        payload({
          input: {
            ...payload().input,
            instruction: "เปลี่ยนเป็น close-up",
            idempotencyKey: "request-3",
          },
        }),
        { redis, enqueueBullmqJob }
      )
    ).rejects.toBeInstanceOf(VerticalDramaShotVideoPromptConflictError);
    expect(enqueueBullmqJob).toHaveBeenCalledOnce();
  });

  it("keeps different shots in one episode queued in sequence", async () => {
    const redis = makeFakeRedis();
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);
    const first = await enqueueVerticalDramaShotVideoPromptJob(payload(), {
      redis,
      enqueueBullmqJob,
    });
    const second = await enqueueVerticalDramaShotVideoPromptJob(
      payload({
        shotNumber: 10,
        input: {
          ...payload().input,
          shotNumber: 10,
          idempotencyKey: "shot-10",
        },
      }),
      { redis, enqueueBullmqJob }
    );

    expect(second.jobId).not.toBe(first.jobId);
    await expect(
      getActiveVerticalDramaShotVideoPromptJobs(
        {
          tenantId: owner.tenantId,
          userId: owner.userId,
          seriesId: 21,
          episodeId: 137,
        },
        { redis }
      )
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ jobId: first.jobId, queuePosition: 1 }),
        expect.objectContaining({ jobId: second.jobId, queuePosition: 2 }),
      ])
    );
  });

  it("persists terminal success, clears the active shot, and proves worker-only execution", async () => {
    const redis = makeFakeRedis();
    const submitted = await enqueueVerticalDramaShotVideoPromptJob(payload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });
    const executor = vi
      .fn()
      .mockImplementation(
        async (_payload, execution: { jobId: string; token: string }) => {
          expect(
            isVerticalDramaShotVideoPromptWorkerExecution(
              execution.jobId,
              execution.token
            )
          ).toBe(true);
          return {
            prompt: "generated prompt",
            creditsUsed: 2,
            usedVision: true,
          };
        }
      );

    await runVerticalDramaShotVideoPromptJob(submitted.jobId, executor, {
      redis,
    });

    await expect(
      getVerticalDramaShotVideoPromptJobStatus(submitted.jobId, owner, {
        redis,
      })
    ).resolves.toMatchObject({
      status: "succeeded",
      result: { prompt: "generated prompt", usedVision: true },
    });
    expect(
      isVerticalDramaShotVideoPromptWorkerExecution(
        submitted.jobId,
        executor.mock.calls[0]?.[1].token
      )
    ).toBe(false);
  });

  it("reconciles a BullMQ failure so a stalled job cannot block later shots", async () => {
    const redis = makeFakeRedis();
    const first = await enqueueVerticalDramaShotVideoPromptJob(payload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });
    const second = await enqueueVerticalDramaShotVideoPromptJob(
      payload({
        shotNumber: 10,
        input: {
          ...payload().input,
          shotNumber: 10,
          idempotencyKey: "shot-10-recovery",
        },
      }),
      { redis, enqueueBullmqJob: vi.fn().mockResolvedValue(undefined) }
    );

    await expect(
      recoverVerticalDramaShotVideoPromptJob(
        first.jobId,
        "BullMQ job stalled",
        { redis }
      )
    ).resolves.toBe(true);

    await expect(
      getVerticalDramaShotVideoPromptJobStatus(first.jobId, owner, { redis })
    ).resolves.toMatchObject({ status: "failed", error: "BullMQ job stalled" });
    await expect(
      getActiveVerticalDramaShotVideoPromptJobs(
        { tenantId: owner.tenantId, userId: owner.userId, seriesId: 21, episodeId: 137 },
        { redis }
      )
    ).resolves.toEqual([expect.objectContaining({ jobId: second.jobId, queuePosition: 1 })]);
  });
});
