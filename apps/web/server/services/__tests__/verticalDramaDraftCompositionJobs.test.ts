import { describe, expect, it, vi } from "vitest";
import {
  cancelVerticalDramaDraftComposition,
  classifyVerticalDramaDraftCompositionFailure,
  enqueueVerticalDramaDraftComposition,
  getVerticalDramaDraftCompositionStatus,
  getVerticalDramaDraftCompositionStatusBySession,
} from "../verticalDramaDraftCompositionJobs";

function memoryRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
}

function payload() {
  return {
    tenantId: "tenant-1",
    userId: 7,
    seriesId: 101,
    draftSessionId: "session-1",
    synthesis: {
      locale: "th" as const,
      selectedPresets: [],
      selectedCategories: [],
      useV2: false,
    },
  };
}

describe("vertical drama draft composition jobs", () => {
  it("distinguishes a low-quality LLM output from provider failure and never suggests model fallback", () => {
    const qualityFailure = classifyVerticalDramaDraftCompositionFailure({
      error: new Error("Story foundation is incomplete: storyContract_missing"),
      stage: "building_foundation",
      modelId: "openai/gpt-5.6-luna",
    });
    expect(qualityFailure.code).toBe("llm_output_quality_insufficient");
    expect(qualityFailure.qualityGate).toBe("llm-recommended-draft-quality");
    expect(qualityFailure.message).toContain("quality gate");
    expect(qualityFailure.detail).toContain("storyContract_missing");

    const providerFailure = classifyVerticalDramaDraftCompositionFailure({
      error: new Error("upstream timeout (504)"),
      stage: "composing",
      modelId: "openai/gpt-5.6-luna",
    });
    expect(providerFailure.code).toBe("llm_provider_error");
    expect(providerFailure.retryable).toBe(true);

    const unavailableProviderFailure =
      classifyVerticalDramaDraftCompositionFailure({
        error: new Error(
          'No healthy provider is available for model "openai/gpt-5.6-luna"'
        ),
        stage: "building_foundation",
        modelId: "openai/gpt-5.6-luna",
      });
    expect(unavailableProviderFailure.code).toBe("llm_provider_error");
    expect(unavailableProviderFailure.retryable).toBe(true);

    const capabilityFailure = classifyVerticalDramaDraftCompositionFailure({
      error: new Error(
        "No endpoints found that can handle the requested parameters"
      ),
      stage: "building_foundation",
      modelId: "openai/gpt-5.6-luna",
    });
    expect(capabilityFailure.code).toBe("llm_provider_error");
    expect(capabilityFailure.retryable).toBe(false);
    expect(capabilityFailure.message).toContain("structured output");

    const modelFailure = classifyVerticalDramaDraftCompositionFailure({
      error: new Error(
        "No admin-recommended Vertical Drama Draft LLM is available"
      ),
      stage: "building_foundation",
    });
    expect(modelFailure.code).toBe("recommended_model_unavailable");
    expect(modelFailure.qualityGate).toBe("not-available");
  });

  it("deduplicates the same owner/session request and isolates another owner", async () => {
    const redis = memoryRedis();
    const enqueue = vi.fn(async () => {});
    const first = await enqueueVerticalDramaDraftComposition(payload(), {
      redis,
      enqueueBullmqJob: enqueue,
    });
    const second = await enqueueVerticalDramaDraftComposition(payload(), {
      redis,
      enqueueBullmqJob: enqueue,
    });
    expect(second).toEqual({ jobId: first.jobId, deduped: true });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(
      await getVerticalDramaDraftCompositionStatus(
        first.jobId,
        { tenantId: "other", userId: 7 },
        101,
        { redis }
      )
    ).toBeNull();
  });

  it("passes the raw creator request snapshot to durable persistence", async () => {
    const redis = memoryRedis();
    const persistJob = vi.fn(async () => {});
    await enqueueVerticalDramaDraftComposition(
      {
        ...payload(),
        requestJson: {
          synthesis: {
            userPremise: "ผู้ใช้พิมพ์โจทย์ฉบับเต็มไว้ตรงนี้",
          },
        },
      },
      {
        redis,
        persistJob,
        enqueueBullmqJob: async () => {},
      }
    );
    expect(persistJob).toHaveBeenCalledWith(
      expect.objectContaining({
        requestJson: {
          synthesis: {
            userPremise: "ผู้ใช้พิมพ์โจทย์ฉบับเต็มไว้ตรงนี้",
          },
        },
      })
    );
  });

  it("rediscovers the composition job by session after refresh", async () => {
    const redis = memoryRedis();
    const first = await enqueueVerticalDramaDraftComposition(payload(), {
      redis,
      enqueueBullmqJob: async () => {},
    });
    const recovered = await getVerticalDramaDraftCompositionStatusBySession(
      "session-1",
      { tenantId: "tenant-1", userId: 7 },
      101,
      { redis }
    );
    expect(recovered?.jobId).toBe(first.jobId);
  });

  it("marks queue admission failure as failed and releases the active pointer", async () => {
    const redis = memoryRedis();
    await expect(
      enqueueVerticalDramaDraftComposition(payload(), {
        redis,
        enqueueBullmqJob: async () => {
          throw new Error("redis unavailable");
        },
      })
    ).rejects.toThrow(/queue is unavailable/);
    expect(redis.del).toHaveBeenCalled();
  });

  it("marks a Redis admission failure as failed when the durable row was created", async () => {
    const redis = memoryRedis();
    redis.set.mockRejectedValueOnce(new Error("redis unavailable"));
    const persistJob = vi.fn(async () => {});
    const persistJobStatus = vi.fn(async () => true);

    await expect(
      enqueueVerticalDramaDraftComposition(payload(), {
        redis,
        persistJob,
        persistJobStatus,
        enqueueBullmqJob: async () => {},
      })
    ).rejects.toThrow(/queue is unavailable/);

    expect(persistJob).toHaveBeenCalledTimes(1);
    expect(persistJobStatus).toHaveBeenCalledWith(
      expect.any(String),
      payload(),
      expect.objectContaining({
        jobStatus: "failed",
        lastError: "redis unavailable",
      })
    );
    expect(redis.del).toHaveBeenCalled();
  });

  it("cancels an owner-scoped active job", async () => {
    const redis = memoryRedis();
    const result = await enqueueVerticalDramaDraftComposition(payload(), {
      redis,
      enqueueBullmqJob: async () => {},
    });
    expect(
      await cancelVerticalDramaDraftComposition(
        result.jobId,
        { tenantId: "tenant-1", userId: 7 },
        101,
        { redis }
      )
    ).toBe(true);
    const record = await getVerticalDramaDraftCompositionStatus(
      result.jobId,
      { tenantId: "tenant-1", userId: 7 },
      101,
      { redis }
    );
    expect(record?.status).toBe("cancelled");
  });
});
