import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown> | undefined>,
  revocations: [] as Array<Record<string, unknown>>,
  selectCount: 0,
  fail: false,
}));

vi.mock("../../../db", () => ({
  getDb: () => ({
    transaction: (callback: (tx: any) => Promise<unknown>) =>
      callback({
        execute: async () => undefined,
        select: () => {
          const index = state.selectCount++;
          const builder = {
            from: () => builder,
            innerJoin: () => builder,
            where: () =>
              index >= 3 ? Promise.resolve(state.revocations) : builder,
            limit: async () => {
              if (state.fail) throw new Error("database unavailable");
              return state.rows[index] ? [state.rows[index]] : [];
            },
          };
          return builder;
        },
      }),
  }),
}));

import { loadInferencePolicySourceLayers } from "../policySourceLoader";
import { DEFAULT_INFERENCE_ROUTER_POLICY } from "../routerPolicy";

const policyJson = {
  ready: true,
  allowedProviderIds: ["provider-a", "provider-b"],
  allowedRegions: ["TH"],
  allowedCredentialOwnerRefs: ["platform:default"],
  requireZeroDataRetention: false,
};

function policyRows() {
  const platformPolicyJson = {
    ...policyJson,
    routingPolicy: DEFAULT_INFERENCE_ROUTER_POLICY,
  };
  return [
    {
      scopeType: "platform",
      scopeKey: "platform",
      tenantId: null,
      principalRef: null,
      revision: "platform:1",
      policyJson: platformPolicyJson,
    },
    {
      scopeType: "tenant",
      scopeKey: "tenant-1",
      tenantId: "tenant-1",
      principalRef: null,
      revision: "tenant:1",
      policyJson,
    },
    {
      scopeType: "principal",
      scopeKey: "tenant-1:user-1",
      tenantId: "tenant-1",
      principalRef: "user-1",
      revision: "principal:1",
      policyJson,
    },
  ];
}

describe("loadInferencePolicySourceLayers", () => {
  beforeEach(() => {
    state.rows = policyRows();
    state.revocations = [];
    state.selectCount = 0;
    state.fail = false;
  });

  it("loads all three exact scopes and current revocations", async () => {
    state.revocations = [
      {
        id: 7,
        scopeType: "tenant",
        targetType: "model",
        targetId: "model:revoked",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        id: 9,
        scopeType: "principal",
        targetType: "deployment",
        targetId: "deployment:revoked",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];
    const now = new Date("2026-09-27T00:00:00Z");
    const result = await loadInferencePolicySourceLayers({
      tenantId: "tenant-1",
      principalId: "user-1",
      now,
    });
    expect(result).toMatchObject({
      ok: true,
      sources: {
        platform: { revision: "platform:1" },
        tenant: { revision: "tenant:1" },
        principal: { revision: "principal:1" },
        revocations: {
          fresh: true,
          revokedModelProfileIds: ["model:revoked"],
          revokedDeploymentIds: ["deployment:revoked"],
        },
      },
    });
  });

  it("fails closed when any required policy head is missing or scoped incorrectly", async () => {
    state.rows[1] = undefined;
    await expect(
      loadInferencePolicySourceLayers({
        tenantId: "tenant-1",
        principalId: "user-1",
        now: new Date("2026-09-27T00:00:00Z"),
      })
    ).resolves.toMatchObject({
      ok: false,
      code: "POLICY_SCOPE_MISSING",
      scope: "tenant",
    });
  });

  it("requires router weights on the platform head and exposes its revision-bound policy", async () => {
    const rows = policyRows();
    state.rows = [{ ...rows[0], policyJson } as Record<string, unknown>, rows[1], rows[2]];
    await expect(loadInferencePolicySourceLayers({
      tenantId: "tenant-1",
      principalId: "user-1",
      now: new Date("2026-09-27T00:00:00Z"),
    })).resolves.toMatchObject({
      ok: false,
      code: "POLICY_SCOPE_INVALID",
      scope: "platform",
    });

    state.selectCount = 0;
    state.rows = rows;
    await expect(loadInferencePolicySourceLayers({
      tenantId: "tenant-1",
      principalId: "user-1",
      now: new Date("2026-09-27T00:00:00Z"),
    })).resolves.toMatchObject({
      ok: true,
      sources: {
        platform: {
          revision: "platform:1",
          routerPolicy: DEFAULT_INFERENCE_ROUTER_POLICY,
        },
      },
    });

    state.selectCount = 0;
    state.rows = [
      rows[0],
      {
        ...rows[1],
        policyJson: { ...policyJson, routingPolicy: DEFAULT_INFERENCE_ROUTER_POLICY },
      },
      rows[2],
    ];
    await expect(loadInferencePolicySourceLayers({
      tenantId: "tenant-1",
      principalId: "user-1",
      now: new Date("2026-09-27T00:00:00Z"),
    })).resolves.toMatchObject({
      ok: false,
      code: "POLICY_SCOPE_INVALID",
      scope: "tenant",
    });
  });

  it("fails closed when the database or policy payload is unavailable", async () => {
    state.fail = true;
    await expect(
      loadInferencePolicySourceLayers({
        tenantId: "tenant-1",
        principalId: "user-1",
        now: new Date("2026-09-27T00:00:00Z"),
      })
    ).resolves.toEqual({ ok: false, code: "POLICY_SOURCE_UNAVAILABLE" });

    state.fail = false;
    state.selectCount = 0;
    state.rows[2] = {
      ...policyRows()[2],
      scopeKey: "other-tenant:user-1",
    };
    await expect(
      loadInferencePolicySourceLayers({
        tenantId: "tenant-1",
        principalId: "user-1",
        now: new Date("2026-09-27T00:00:00Z"),
      })
    ).resolves.toMatchObject({
      ok: false,
      code: "POLICY_SCOPE_INVALID",
      scope: "principal",
    });
  });
});
