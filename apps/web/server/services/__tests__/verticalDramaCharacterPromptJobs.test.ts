import { describe, expect, it } from "vitest";
import {
  enqueueVerticalDramaCharacterPromptJob,
  getActiveVerticalDramaCharacterPromptJob,
  getVerticalDramaCharacterPromptJobStatus,
  isVerticalDramaCharacterPromptCreditCapacityError,
  isVerticalDramaCharacterPromptWorkerExecution,
  runVerticalDramaCharacterPromptJob,
  type VerticalDramaCharacterPromptJobRedisAdapter,
} from "../verticalDramaCharacterPromptJobs";

function fakeRedis(): VerticalDramaCharacterPromptJobRedisAdapter {
  const values = new Map<string, string>();
  return {
    get: async key => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value);
      return "OK";
    },
    setNx: async (key, value) => {
      if (values.has(key)) return false;
      values.set(key, value);
      return true;
    },
    compareDelete: async (key, expected) => {
      if (values.get(key) !== expected) return false;
      values.delete(key);
      return true;
    },
  };
}

const owner = {
  tenantId: "tenant-1",
  userId: 7,
  seriesId: 24,
  characterId: 11,
};

const payload = {
  ...owner,
  publicUrl: null,
  input: {
    seriesId: "24",
    characterId: "11",
    selectedImageModelId: "recommended-character-model",
    customInstruction: "front-facing portrait",
  },
};

describe("verticalDramaCharacterPromptJobs", () => {
  it("deduplicates an active character preview and preserves the result for polling", async () => {
    const redis = fakeRedis();
    const deps = { redis, now: () => 1_700_000_000_000 };
    const first = await enqueueVerticalDramaCharacterPromptJob(payload, {
      ...deps,
      enqueueBullmqJob: async () => {},
    });
    const second = await enqueueVerticalDramaCharacterPromptJob(payload, {
      ...deps,
      enqueueBullmqJob: async () => {},
    });

    expect(first.deduped).toBe(false);
    expect(second).toMatchObject({ jobId: first.jobId, deduped: true });
    expect(
      await getActiveVerticalDramaCharacterPromptJob(owner, deps),
    ).toMatchObject({ jobId: first.jobId, status: "queued" });

    await runVerticalDramaCharacterPromptJob(
      first.jobId,
      async (_payload, execution) => {
        expect(isVerticalDramaCharacterPromptWorkerExecution(first.jobId, execution.token)).toBe(true);
        return { mode: "single", portraitPrompt: "ready" };
      },
      deps,
    );

    const completed = await getVerticalDramaCharacterPromptJobStatus(
      first.jobId,
      owner,
      deps,
    );
    expect(completed).toMatchObject({
      status: "succeeded",
      result: { mode: "single", portraitPrompt: "ready" },
    });
    expect(await getActiveVerticalDramaCharacterPromptJob(owner, deps)).toBeNull();
  });

  it("persists a failed enqueue and never leaves a permanent active pointer", async () => {
    const redis = fakeRedis();
    const deps = { redis, now: () => 1_700_000_000_000 };
    const result = await enqueueVerticalDramaCharacterPromptJob(payload, {
      ...deps,
      enqueueBullmqJob: async () => {
        throw new Error("queue unavailable");
      },
    });

    expect(result.status).toBe("failed");
    expect(
      await getVerticalDramaCharacterPromptJobStatus(result.jobId, owner, deps),
    ).toMatchObject({ status: "failed", error: "queue unavailable" });
    expect(await getActiveVerticalDramaCharacterPromptJob(owner, deps)).toBeNull();
  });

  it("does not expose a job to a different owner", async () => {
    const redis = fakeRedis();
    const deps = { redis, now: () => 1_700_000_000_000 };
    const result = await enqueueVerticalDramaCharacterPromptJob(payload, {
      ...deps,
      enqueueBullmqJob: async () => {},
    });

    expect(
      await getVerticalDramaCharacterPromptJobStatus(
        result.jobId,
        { ...owner, userId: 99 },
        deps,
      ),
    ).toBeNull();
  });

  it("keeps a job alive while provider in-flight credit capacity settles", async () => {
    const redis = fakeRedis();
    const retryDelays: number[] = [];
    const deps = {
      redis,
      now: () => 1_700_000_000_000,
      sleep: async (milliseconds: number) => {
        retryDelays.push(milliseconds);
      },
    };
    const result = await enqueueVerticalDramaCharacterPromptJob(payload, {
      ...deps,
      enqueueBullmqJob: async () => {},
    });
    let calls = 0;

    await runVerticalDramaCharacterPromptJob(
      result.jobId,
      async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error(
            "LLM request failed: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits."
          );
        }
        return { mode: "single", portraitPrompt: "ready after capacity" };
      },
      deps,
    );

    expect(isVerticalDramaCharacterPromptCreditCapacityError(new Error(
      "This request would exceed your available credits given your current in-flight requests"
    ))).toBe(true);
    expect(retryDelays).toEqual([15_000]);
    expect(
      await getVerticalDramaCharacterPromptJobStatus(result.jobId, owner, deps),
    ).toMatchObject({
      status: "succeeded",
      result: { portraitPrompt: "ready after capacity" },
    });
  });

  it("requeues capacity waits without failing the durable prompt job", async () => {
    const redis = fakeRedis();
    const scheduled: Array<{
      jobId: string;
      delayMs: number;
      retryCount: number;
    }> = [];
    const deps = {
      redis,
      now: () => 1_700_000_000_000,
      scheduleRetry: async (
        jobId: string,
        delayMs: number,
        retryCount: number,
      ) => {
        scheduled.push({ jobId, delayMs, retryCount });
      },
    };
    const result = await enqueueVerticalDramaCharacterPromptJob(payload, {
      ...deps,
      enqueueBullmqJob: async () => {},
    });

    await runVerticalDramaCharacterPromptJob(
      result.jobId,
      async () => {
        throw new Error(
          "LLM request failed: This request would exceed your available credits given your current in-flight requests",
        );
      },
      deps,
    );

    expect(scheduled).toEqual([
      { jobId: result.jobId, delayMs: 15_000, retryCount: 1 },
    ]);
    expect(
      await getVerticalDramaCharacterPromptJobStatus(result.jobId, owner, deps),
    ).toMatchObject({
      status: "queued",
      error: null,
      capacityRetryCount: 1,
      waitingReason: "provider_capacity",
      nextRetryAt: expect.any(String),
    });
    expect(await getActiveVerticalDramaCharacterPromptJob(owner, deps)).toMatchObject({
      jobId: result.jobId,
      status: "queued",
    });
  });
});
