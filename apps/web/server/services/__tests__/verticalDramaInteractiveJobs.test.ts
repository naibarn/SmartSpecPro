import { describe, expect, it, vi } from "vitest";
import {
  enqueueVerticalDramaInteractiveJob,
  getActiveVerticalDramaInteractiveJob,
  getVerticalDramaInteractiveJobStatus,
  runVerticalDramaInteractiveJob,
  type VerticalDramaInteractiveJobRedisAdapter,
} from "../verticalDramaInteractiveJobs";

function createRedis() {
  const values = new Map<string, string>();
  const redis: VerticalDramaInteractiveJobRedisAdapter = {
    get: async key => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value);
    },
    setNx: async (key, value) => {
      if (values.has(key)) return false;
      values.set(key, value);
      return true;
    },
    del: async key => {
      values.delete(key);
    },
    compareDelete: async (key, expected) => {
      if (values.get(key) !== expected) return false;
      values.delete(key);
      return true;
    },
  };
  return redis;
}

const payload = {
  kind: "prompt_expansion" as const,
  tenantId: "tenant-test",
  userId: 42,
  scopeKey: "series:7",
  skillSlug: "vertical-drama-prompt-expansion",
  idempotencyKey: "expansion:7:1",
  input: { prompt: "a premise" },
};

describe("vertical drama interactive jobs", () => {
  it("reserves, deduplicates, executes, and exposes the real terminal result", async () => {
    const redis = createRedis();
    const dependencies = {
      redis,
      now: () => 1_700_000_000_000,
      enqueueBullmqJob: async () => undefined,
    };
    const first = await enqueueVerticalDramaInteractiveJob(
      payload,
      dependencies
    );
    const duplicate = await enqueueVerticalDramaInteractiveJob(
      payload,
      dependencies
    );
    expect(first.status).toBe("queued");
    expect(duplicate).toMatchObject({ jobId: first.jobId, deduped: true });

    await runVerticalDramaInteractiveJob(
      first.jobId,
      async (_job, execution) => ({ ok: true, execution }),
      dependencies
    );
    const status = await getVerticalDramaInteractiveJobStatus(
      first.jobId,
      payload,
      dependencies
    );
    expect(status).toMatchObject({ status: "succeeded", result: { ok: true } });
    expect(
      await getActiveVerticalDramaInteractiveJob(payload, dependencies)
    ).toBeNull();
  });

  it("records a worker failure and releases the scope for a later paid retry", async () => {
    const redis = createRedis();
    const dependencies = {
      redis,
      now: () => 1_700_000_000_000,
      enqueueBullmqJob: async () => undefined,
    };
    const first = await enqueueVerticalDramaInteractiveJob(
      payload,
      dependencies
    );
    await runVerticalDramaInteractiveJob(
      first.jobId,
      async () => {
        throw new Error("provider unavailable");
      },
      dependencies
    );
    const failed = await getVerticalDramaInteractiveJobStatus(
      first.jobId,
      payload,
      dependencies
    );
    expect(failed).toMatchObject({
      status: "failed",
      error: "provider unavailable",
    });
    const retry = await enqueueVerticalDramaInteractiveJob(
      { ...payload, idempotencyKey: "expansion:7:2" },
      dependencies
    );
    expect(retry.deduped).toBe(false);
  });

  it("notifies the owner after a successful terminal write", async () => {
    const redis = createRedis();
    const notifyCompletion = vi.fn().mockResolvedValue(undefined);
    const dependencies = {
      redis,
      now: () => 1_700_000_000_000,
      enqueueBullmqJob: async () => undefined,
      notifyCompletion,
    };
    const first = await enqueueVerticalDramaInteractiveJob(
      {
        ...payload,
        kind: "special_tie_in_prompt",
        input: { seriesId: 53, episodeId: 248 },
      },
      dependencies
    );

    await runVerticalDramaInteractiveJob(
      first.jobId,
      async () => ({ ok: true }),
      dependencies
    );

    expect(notifyCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: first.jobId,
        status: "succeeded",
        kind: "special_tie_in_prompt",
      })
    );
  });

  it("notifies the owner after a failed terminal write", async () => {
    const redis = createRedis();
    const notifyCompletion = vi.fn().mockResolvedValue(undefined);
    const dependencies = {
      redis,
      now: () => 1_700_000_000_000,
      enqueueBullmqJob: async () => undefined,
      notifyCompletion,
    };
    const first = await enqueueVerticalDramaInteractiveJob(
      payload,
      dependencies
    );

    await runVerticalDramaInteractiveJob(
      first.jobId,
      async () => {
        throw new Error("provider unavailable");
      },
      dependencies
    );

    expect(notifyCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: first.jobId,
        status: "failed",
        error: "provider unavailable",
      })
    );
  });
});
