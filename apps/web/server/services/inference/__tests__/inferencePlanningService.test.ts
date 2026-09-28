import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  transactionCount: 0,
  transactionCommands: [] as unknown[],
  policyResult: null as unknown,
  registryResult: null as unknown,
  receivedTx: [] as unknown[],
}));

vi.mock("../../../db", () => ({
  getDb: () => ({
    transaction: async (callback: (tx: any) => Promise<unknown>) => {
      state.transactionCount += 1;
      const tx = {
        execute: async (command: unknown) => {
          state.transactionCommands.push(command);
        },
      };
      return callback(tx);
    },
  }),
}));

vi.mock("../policySourceLoader", () => ({
  loadInferencePolicySourceLayers: async (_input: unknown, tx: unknown) => {
    state.receivedTx.push(tx);
    return state.policyResult;
  },
}));

vi.mock("../profileRegistry", () => ({
  loadInferenceProfileRegistry: async (_now: Date, tx: unknown) => {
    state.receivedTx.push(tx);
    return state.registryResult;
  },
}));

import { planInferenceRouteForRequest } from "../inferencePlanningService";

const request = {
  contract: "SAH-INFERENCE-2",
  requestId: "request-1",
  traceId: "client-trace-is-not-trusted",
  tenantId: "tenant-real",
  principalId: "user-real",
  consumer: "chat",
  taskClass: "general-chat",
  purpose: "answer",
  inputModalities: ["text"],
  outputModalities: ["text"],
  inputTokenEstimate: 100,
  outputTokenReserve: 100,
  requiredFeatures: [],
  languageHints: ["th"],
  privacyClass: "public",
  residencyAllowlist: ["US", "TH"],
  zdrRequired: false,
  qualityClass: "standard",
  risk: "low",
  latencyDeadlineMs: 5_000,
  maxEstimatedCostMicros: 10_000,
  selection: { mode: "AUTO" },
  policyRevision: "client-policy",
  budgetScopeRef: "client-budget",
  idempotencyKey: "client-idempotency",
};

const policyLayer = {
  tenantId: "tenant-real",
  principalId: "user-real",
  revision: "policy-layer:1",
  observedAtMs: 10_000,
  ready: true,
  allowedProviderIds: ["provider:a"],
  allowedRegions: ["TH"],
  allowedCredentialOwnerRefs: ["credential:platform"],
  requireZeroDataRetention: true,
};

const baseInput = {
  request,
  now: new Date(10_000),
  owners: {
    budget: {
      tenantId: "tenant-real",
      principalId: "user-real",
      revision: "budget:1",
      observedAtMs: 10_000,
      ready: true,
      availableBudgetMicros: 8_000,
    },
    requestContext: {
      tenantId: "tenant-real",
      principalId: "user-real",
      traceId: "trusted-trace",
      budgetScopeRef: "tenant:tenant-real",
      idempotencyKey: "trusted-idempotency",
      effectivePrivacyClass: "tenant-confidential",
      effectiveRisk: "medium" as const,
    },
  },
};

describe("database-backed inference planning service", () => {
  beforeEach(() => {
    state.transactionCount = 0;
    state.transactionCommands = [];
    state.receivedTx = [];
    state.policyResult = {
      ok: true,
      sources: {
        platform: {
          ...policyLayer,
          revision: "platform-policy:17",
          routerPolicy: {
            scoreCalibrationRevision: "scores:platform-17",
            weights: {
              qualityPpm: 700_000,
              costPpm: 100_000,
              latencyPpm: 100_000,
              reliabilityPpm: 50_000,
              compatibilityPpm: 50_000,
            },
          },
        },
        tenant: policyLayer,
        principal: policyLayer,
        revocations: {
          tenantId: "tenant-real",
          principalId: "user-real",
          revision: "revocations:1",
          observedAtMs: 10_000,
          fresh: true,
          revokedModelProfileIds: [],
          revokedDeploymentIds: [],
        },
      },
    };
    state.registryResult = {
      ok: true,
      profiles: [],
      invalidProfileIds: [],
      registryRevision: "registry:1",
      observedAtMs: 10_000,
    };
  });

  it("binds request scope and routing metadata to one consistent database snapshot", async () => {
    const result = await planInferenceRouteForRequest(baseInput);
    expect(result).toMatchObject({
      status: "planned",
      registryRevision: "registry:1",
      boundIntent: {
        tenantId: "tenant-real",
        principalId: "user-real",
        traceId: "trusted-trace",
        policyRevision: expect.any(String),
        budgetScopeRef: "tenant:tenant-real",
        idempotencyKey: "trusted-idempotency",
        maxEstimatedCostMicros: 8_000,
        privacyClass: "tenant-confidential",
        risk: "medium",
        residencyAllowlist: ["TH"],
        zdrRequired: true,
      },
      route: { status: "no_eligible_route" },
    });
    expect(state.transactionCount).toBe(1);
    expect(result).toMatchObject({
      authority: {
        routerPolicyRevision: "platform-policy:17",
        scoreCalibrationRevision: "scores:platform-17",
        routingWeights: {
          qualityPpm: 700_000,
          costPpm: 100_000,
          latencyPpm: 100_000,
          reliabilityPpm: 50_000,
          compatibilityPpm: 50_000,
        },
      },
    });
    expect(state.transactionCommands).toHaveLength(1);
    expect(state.receivedTx).toHaveLength(2);
    expect(state.receivedTx[0]).toBe(state.receivedTx[1]);
  });

  it("rejects a request that declares a different tenant than authenticated context", async () => {
    const result = await planInferenceRouteForRequest({
      ...baseInput,
      request: { ...request, tenantId: "tenant-attacker" },
    });
    expect(result).toMatchObject({
      status: "source_unavailable",
      code: "INFERENCE_SCOPE_MISMATCH",
      field: "tenantId",
    });
  });

  it("fails closed when policy authority is missing", async () => {
    state.policyResult = {
      ok: false,
      code: "POLICY_SCOPE_MISSING",
      scope: "tenant",
    };
    await expect(planInferenceRouteForRequest(baseInput)).resolves.toMatchObject(
      {
        status: "source_unavailable",
        code: "POLICY_SCOPE_MISSING",
      }
    );
    expect(state.transactionCount).toBe(1);
    expect(state.receivedTx).toHaveLength(1);
  });

  it("fails closed when qualification registry data is unavailable", async () => {
    state.registryResult = {
      ok: false,
      code: "PROFILE_REGISTRY_UNAVAILABLE",
    };
    await expect(planInferenceRouteForRequest(baseInput)).resolves.toMatchObject(
      {
        status: "source_unavailable",
        code: "PROFILE_REGISTRY_UNAVAILABLE",
      }
    );
  });

  it("rejects budget authority from a different tenant", async () => {
    await expect(
      planInferenceRouteForRequest({
        ...baseInput,
        owners: {
          ...baseInput.owners,
          budget: { ...baseInput.owners.budget, tenantId: "tenant-other" },
        },
      })
    ).resolves.toEqual({
      status: "authority_invalid",
      reason: "AUTHORITY_SCOPE_MISMATCH",
    });
  });
});
