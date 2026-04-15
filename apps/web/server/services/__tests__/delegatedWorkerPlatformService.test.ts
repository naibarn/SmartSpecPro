import { beforeEach, describe, expect, it, vi } from "vitest";

import { getWorkerAccessPermissionScopesForPreset } from "../../../shared/workerAccessKeys";

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

  it("enforces Hermes worker access policy for delegated LLM routes", async () => {
    const {
      enforceDelegatedWorkerLlmRoutePolicy,
      DelegatedWorkerPlatformError,
    } = await import("../delegatedWorkerPlatformService");

    const makeDb = (worker: Record<string, unknown>, job: Record<string, unknown>) => {
      const rows = [[worker], [job]];
      return {
        select() {
          return {
            from() {
              return {
                where() {
                  return {
                    limit() {
                      return Promise.resolve(rows.shift() ?? []);
                    },
                  };
                },
              };
            },
          };
        },
      };
    };

    mockGetDb.mockResolvedValue(makeDb(
      {
        id: "worker-1",
        tenantId: "tenant-1",
        runtimeType: "hermes_agent_gateway",
        status: "online",
        capabilitiesJson: {
          runtimeMetadata: {
            llmRoutingMode: "pinned_provider",
            preferredProviderId: 42,
            preferredProviderName: "SmartSpecPro Gateway",
            workerAccessPolicy: {
              permissionPreset: "readonly",
              permissionScopes: getWorkerAccessPermissionScopesForPreset("readonly"),
              quotaHourly: 10,
              quotaDaily: 100,
              quotaWeekly: null,
              quotaMonthly: null,
            },
          },
        },
      },
      {
        id: "job-1",
        tenantId: "tenant-1",
        workerId: "worker-1",
        requestedByUserId: 7,
      },
    ) as any);

    await expect(enforceDelegatedWorkerLlmRoutePolicy({
      auth: {
        mode: "delegated_worker",
        tenantId: "tenant-1",
        userId: 7,
        ownerUserId: 7,
        workerId: "worker-1",
        workerJobId: "job-1",
        delegatedSessionId: "session-1",
        runtimeType: "hermes_agent_gateway",
        scopeProfile: "worker_gateway_hybrid_executor",
      } as any,
      requestedModelId: "gpt-5.4",
      resolvedProviderId: 42,
      providerName: "SmartSpecPro Gateway",
    })).resolves.toBeUndefined();

    mockGetDb.mockResolvedValue(makeDb(
      {
        id: "worker-1",
        tenantId: "tenant-1",
        runtimeType: "hermes_agent_gateway",
        status: "online",
        capabilitiesJson: {
          runtimeMetadata: {
            llmRoutingMode: "auto",
            workerAccessPolicy: {
              permissionPreset: "readonly",
              permissionScopes: getWorkerAccessPermissionScopesForPreset("readonly").filter((scope) => scope !== "llm:chat"),
              quotaHourly: 10,
              quotaDaily: 100,
              quotaWeekly: null,
              quotaMonthly: null,
            },
          },
        },
      },
      {
        id: "job-1",
        tenantId: "tenant-1",
        workerId: "worker-1",
        requestedByUserId: 7,
      },
    ) as any);

    await expect(enforceDelegatedWorkerLlmRoutePolicy({
      auth: {
        mode: "delegated_worker",
        tenantId: "tenant-1",
        userId: 7,
        ownerUserId: 7,
        workerId: "worker-1",
        workerJobId: "job-1",
        delegatedSessionId: "session-1",
        runtimeType: "hermes_agent_gateway",
        scopeProfile: "worker_gateway_hybrid_executor",
      } as any,
      requestedModelId: "gpt-5.4",
      resolvedProviderId: 42,
      providerName: "SmartSpecPro Gateway",
    })).rejects.toMatchObject({
      code: "worker_access_policy_denied",
      statusCode: 403,
    });
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
