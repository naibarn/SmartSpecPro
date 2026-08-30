import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_core/logger", () => ({ debugError: vi.fn() }));
vi.mock("../redis", () => ({
  getRedisClient: vi.fn(() => {
    throw new Error("live Redis must not be used in unit tests");
  }),
}));

import {
  enqueueVerticalDramaShotPromptJob,
  getActiveVerticalDramaShotPromptJob,
  getVerticalDramaShotPromptJobStatus,
  isVerticalDramaShotPromptWorkerExecution,
  runVerticalDramaShotPromptJob,
  type VerticalDramaShotPromptJobPayload,
  type VerticalDramaShotPromptJobRedisAdapter,
} from "../verticalDramaShotPromptJobs";

function makeFakeRedis(): VerticalDramaShotPromptJobRedisAdapter & {
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
    del: vi.fn(async key => (store.delete(key) ? 1 : 0)),
    compareDelete: vi.fn(async (key, expected) => {
      if (store.get(key) !== expected) return false;
      store.delete(key);
      return true;
    }),
  };
}

function payload(
  overrides: Partial<VerticalDramaShotPromptJobPayload> = {},
): VerticalDramaShotPromptJobPayload {
  return {
    tenantId: "tenant-1",
    userId: 42,
    seriesId: 21,
    episodeId: 134,
    shotNumber: 9,
    publicUrl: "https://smartaihub.app",
    input: {
      seriesId: "21",
      episodeId: "134",
      shotNumber: 9,
      idempotencyKey: "request-1",
    },
    ...overrides,
  };
}

const owner = {
  tenantId: "tenant-1",
  userId: 42,
  seriesId: 21,
  episodeId: 134,
  shotNumber: 9,
};

beforeEach(() => vi.clearAllMocks());

describe("enqueueVerticalDramaShotPromptJob", () => {
  it("writes a queued record and dispatches BullMQ once", async () => {
    const redis = makeFakeRedis();
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);
    const submitted = await enqueueVerticalDramaShotPromptJob(payload(), {
      redis,
      enqueueBullmqJob,
    });

    expect(submitted).toMatchObject({ status: "queued", deduped: false });
    expect(enqueueBullmqJob).toHaveBeenCalledOnce();
    await expect(
      getVerticalDramaShotPromptJobStatus(submitted.jobId, owner, { redis }),
    ).resolves.toMatchObject({ status: "queued", shotNumber: 9 });
  });

  it("joins repeated submits for the same active shot", async () => {
    const redis = makeFakeRedis();
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);
    const first = await enqueueVerticalDramaShotPromptJob(payload(), {
      redis,
      enqueueBullmqJob,
    });
    const second = await enqueueVerticalDramaShotPromptJob(
      payload({ input: { ...payload().input, idempotencyKey: "request-2" } }),
      { redis, enqueueBullmqJob },
    );

    expect(second).toEqual({
      jobId: first.jobId,
      status: "queued",
      deduped: true,
    });
    expect(enqueueBullmqJob).toHaveBeenCalledOnce();
  });

  it("queues different shots independently", async () => {
    const redis = makeFakeRedis();
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);
    const first = await enqueueVerticalDramaShotPromptJob(payload(), {
      redis,
      enqueueBullmqJob,
    });
    const second = await enqueueVerticalDramaShotPromptJob(
      payload({
        shotNumber: 8,
        input: {
          ...payload().input,
          shotNumber: 8,
          idempotencyKey: "shot-8",
        },
      }),
      { redis, enqueueBullmqJob },
    );

    expect(second.jobId).not.toBe(first.jobId);
    expect(second.deduped).toBe(false);
    expect(enqueueBullmqJob).toHaveBeenCalledTimes(2);
  });

  it("keeps start and stop prompt jobs independent for the same shot", async () => {
    const redis = makeFakeRedis();
    const enqueueBullmqJob = vi.fn().mockResolvedValue(undefined);
    const start = await enqueueVerticalDramaShotPromptJob(payload(), {
      redis,
      enqueueBullmqJob,
    });
    const stop = await enqueueVerticalDramaShotPromptJob(
      payload({
        input: { ...payload().input, frameRole: "stop", idempotencyKey: "stop-1" },
      }),
      { redis, enqueueBullmqJob },
    );

    expect(stop.jobId).not.toBe(start.jobId);
    expect(enqueueBullmqJob).toHaveBeenCalledTimes(2);
    await expect(
      getActiveVerticalDramaShotPromptJob(
        { ...owner, frameRole: "stop" },
        { redis },
      ),
    ).resolves.toMatchObject({ jobId: stop.jobId });
  });

  it("returns the same terminal job for the same idempotency key", async () => {
    const redis = makeFakeRedis();
    const first = await enqueueVerticalDramaShotPromptJob(payload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });
    await runVerticalDramaShotPromptJob(
      first.jobId,
      vi.fn().mockResolvedValue({
        prompt: "ready",
        negativePrompt: "",
        creditsUsed: 1,
        usedVision: false,
      }),
      { redis },
    );
    const replay = await enqueueVerticalDramaShotPromptJob(payload(), {
      redis,
      enqueueBullmqJob: vi.fn(),
    });

    expect(replay).toEqual({
      jobId: first.jobId,
      status: "succeeded",
      deduped: true,
    });
  });

  it("marks queue-dispatch failure terminal instead of stranding queued", async () => {
    const redis = makeFakeRedis();
    const submitted = await enqueueVerticalDramaShotPromptJob(payload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockRejectedValue(new Error("queue offline")),
    });
    const record = await getVerticalDramaShotPromptJobStatus(
      submitted.jobId,
      owner,
      { redis },
    );

    expect(submitted.status).toBe("failed");
    expect(record).toMatchObject({ status: "failed", error: "queue offline" });
    await expect(
      getActiveVerticalDramaShotPromptJob(owner, { redis }),
    ).resolves.toBeNull();
  });
});

describe("runVerticalDramaShotPromptJob", () => {
  it("persists a successful executor result and clears the active pointer", async () => {
    const redis = makeFakeRedis();
    const submitted = await enqueueVerticalDramaShotPromptJob(payload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });
    const executor = vi.fn().mockImplementation(
      async (_payload, execution: { jobId: string; token: string }) => {
        expect(
          isVerticalDramaShotPromptWorkerExecution(
            execution.jobId,
            execution.token,
          ),
        ).toBe(true);
        return {
          prompt: "generated prompt",
          negativePrompt: "no extra people",
          creditsUsed: 2,
          usedVision: true,
        };
      },
    );
    await runVerticalDramaShotPromptJob(
      submitted.jobId,
      executor,
      { redis },
    );

    await expect(
      getVerticalDramaShotPromptJobStatus(submitted.jobId, owner, { redis }),
    ).resolves.toMatchObject({
      status: "succeeded",
      result: { prompt: "generated prompt", usedVision: true },
    });
    await expect(
      getActiveVerticalDramaShotPromptJob(owner, { redis }),
    ).resolves.toBeNull();
    const execution = executor.mock.calls[0]?.[1];
    expect(
      isVerticalDramaShotPromptWorkerExecution(
        execution.jobId,
        execution.token,
      ),
    ).toBe(false);
  });

  it("stores a bounded failure and never exposes it to a foreign owner", async () => {
    const redis = makeFakeRedis();
    const submitted = await enqueueVerticalDramaShotPromptJob(payload(), {
      redis,
      enqueueBullmqJob: vi.fn().mockResolvedValue(undefined),
    });
    await runVerticalDramaShotPromptJob(
      submitted.jobId,
      vi.fn().mockRejectedValue(new Error("provider failed")),
      { redis },
    );

    await expect(
      getVerticalDramaShotPromptJobStatus(submitted.jobId, owner, { redis }),
    ).resolves.toMatchObject({ status: "failed", error: "provider failed" });
    await expect(
      getVerticalDramaShotPromptJobStatus(
        submitted.jobId,
        { ...owner, userId: 99 },
        { redis },
      ),
    ).resolves.toBeNull();
  });
});
