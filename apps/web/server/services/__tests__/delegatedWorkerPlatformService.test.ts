import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDb = vi.fn();

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../redis", () => ({
  getRedisClient: vi.fn(() => {
    throw new Error("Redis should not be used in delegated worker platform service unit tests");
  }),
  isRedisAvailable: vi.fn(() => false),
}));

describe("delegatedWorkerPlatformService", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetDb.mockReset();
    const { resetDelegatedWorkerConcurrencyForTests } = await import("../delegatedWorkerPlatformService");
    resetDelegatedWorkerConcurrencyForTests();
  });

  it("enforces default model allowlists for delegated workers", async () => {
    const {
      enforceDelegatedWorkerModelSelectionPolicy,
      DelegatedWorkerPlatformError,
    } = await import("../delegatedWorkerPlatformService");

    const auth = {
      mode: "delegated_worker" as const,
      tenantId: "tenant-1",
      userId: 7,
      ownerUserId: 7,
      workerId: "worker-1",
      workerJobId: "job-1",
      delegatedSessionId: "session-1",
      runtimeType: "openclaw_gateway",
      scopeProfile: "worker_gateway_hybrid_executor" as const,
    };

    expect(() =>
      enforceDelegatedWorkerModelSelectionPolicy({
        auth,
        rawRequestedModel: "gpt-5.4",
        resolvedModelId: "gpt-5.4",
      })).not.toThrow();

    expect(() =>
      enforceDelegatedWorkerModelSelectionPolicy({
        auth,
        rawRequestedModel: "unsupported-model",
        resolvedModelId: "unsupported-model",
      })).toThrowError(DelegatedWorkerPlatformError);

    expect(() =>
      enforceDelegatedWorkerModelSelectionPolicy({
        auth,
        rawRequestedModel: "provider/raw-model",
        resolvedModelId: "gpt-5.4",
      })).toThrowError(DelegatedWorkerPlatformError);
  });

  it("limits concurrent delegated compute actions per worker job", async () => {
    const {
      acquireDelegatedWorkerConcurrencySlot,
      DelegatedWorkerPlatformError,
    } = await import("../delegatedWorkerPlatformService");

    const auth = {
      mode: "delegated_worker" as const,
      tenantId: "tenant-1",
      userId: 7,
      ownerUserId: 7,
      workerId: "worker-1",
      workerJobId: "job-1",
      delegatedSessionId: "session-1",
      runtimeType: "openclaw_gateway",
      scopeProfile: "worker_gateway_hybrid_executor" as const,
    };

    const first = await acquireDelegatedWorkerConcurrencySlot({
      auth,
      actionClass: "compute",
    });
    const second = await acquireDelegatedWorkerConcurrencySlot({
      auth,
      actionClass: "compute",
    });

    await expect(
      acquireDelegatedWorkerConcurrencySlot({
        auth,
        actionClass: "compute",
      }),
    ).rejects.toThrowError(DelegatedWorkerPlatformError);

    await first.release();
    const replacement = await acquireDelegatedWorkerConcurrencySlot({
      auth,
      actionClass: "compute",
    });

    await replacement.release();
    await second.release();
  });

  it("releases delegated execution slots after callback failures", async () => {
    const {
      acquireDelegatedWorkerConcurrencySlot,
      runWithDelegatedWorkerExecution,
    } = await import("../delegatedWorkerPlatformService");

    const auth = {
      mode: "delegated_worker" as const,
      tenantId: "tenant-1",
      userId: 7,
      ownerUserId: 7,
      workerId: "worker-1",
      workerJobId: "job-1",
      delegatedSessionId: "session-1",
      runtimeType: "openclaw_gateway",
      scopeProfile: "worker_gateway_hybrid_executor" as const,
    };

    const first = await acquireDelegatedWorkerConcurrencySlot({
      auth,
      actionClass: "compute",
    });

    await expect(
      runWithDelegatedWorkerExecution(
        {
          auth,
          actionClass: "compute",
          estimatedCredits: 0,
        },
        async () => {
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow("boom");

    const replacement = await acquireDelegatedWorkerConcurrencySlot({
      auth,
      actionClass: "compute",
    });

    await replacement.release();
    await first.release();
  });
});
