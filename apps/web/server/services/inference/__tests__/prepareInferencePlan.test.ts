import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  planning: null as unknown,
  built: null as unknown,
  persisted: null as unknown,
  persistInput: null as unknown,
  rolloutBundle: null as unknown,
}));

vi.mock("../inferencePlanningService", () => ({
  planInferenceRouteForRequest: async () => state.planning,
}));
vi.mock("../planFactory", () => ({
  buildInferencePlan: (..._args: unknown[]) => state.built,
}));
vi.mock("../persistence", () => ({
  persistInferencePlan: async (input: unknown) => {
    state.persistInput = input;
    return state.persisted;
  },
}));
vi.mock("../rolloutBundle", () => ({
  loadVerifiedInferenceRolloutBundle: async () => state.rolloutBundle,
}));

import { prepareAndPersistInferencePlan } from "../prepareInferencePlan";

describe("prepare and persist inference plan", () => {
  const input = () => ({
    request: {},
    owners: {
      requestContext: { tenantId: "tenant-a", principalId: "user-1" },
    } as never,
    context: {
      creditReservationId: "credit-res-1",
      parentCostCeilingMicros: 100,
      rolloutBundleHash: `sha256:${"a".repeat(64)}`,
    } as never,
    reservation: {
      reservationId: "credit-res-1",
      tenantId: "tenant-a",
      principalRef: "user-1",
      availableBudgetMicros: 100,
      expiresAt: "2026-09-28T00:00:00.000Z",
      status: "reserved" as const,
    },
  });

  beforeEach(() => {
    state.planning = {
      status: "planned",
      boundIntent: {
        tenantId: "tenant-a",
        principalId: "user-1",
        idempotencyKey: "idem-1",
      },
      authority: {
        scoreCalibrationRevision: "scores:1",
        routerPolicyRevision: "route-policy:1",
      },
      authorityRevision: "authority:1",
      registryRevision: "registry:1",
      route: {
        status: "selected",
        candidate: { deploymentId: "deploy-a" },
        eligibleCandidates: [{ deploymentId: "deploy-a" }],
      },
    };
    state.built = {
      ok: true,
      plan: { planId: "plan-1", creditReservationId: "credit-res-1" },
    };
    state.persisted = {
      plan: { planId: "plan-1" },
      created: true,
    };
    state.persistInput = null;
    state.rolloutBundle = {
      payload: {
        routerPolicyRevision: "route-policy:1",
        logicalModelRegistryRevision: "registry:1",
      },
    };
  });

  it("persists the selected plan against trusted tenant and existing job owner", async () => {
    const result = await prepareAndPersistInferencePlan({
      ...input(),
      workerJobId: "worker-job-1",
      now: new Date("2026-09-27T00:00:00.000Z"),
    });
    expect(result).toMatchObject({
      status: "plan_persisted",
      planId: "plan-1",
      selectedDeploymentId: "deploy-a",
      registryRevision: "registry:1",
      authorityRevision: "authority:1",
    });
    expect(state.persistInput).toMatchObject({
      tenantId: "tenant-a",
      principalRef: "user-1",
      idempotencyKey: "idem-1",
      workerJobId: "worker-job-1",
      scoreCalibrationRevision: "scores:1",
    });
  });

  it("does not attempt plan persistence when no route is selected", async () => {
    state.planning = {
      ...(state.planning as Record<string, unknown>),
      route: { status: "no_eligible_route", reasonCode: "NO_ELIGIBLE_ROUTE" },
    };
    await expect(
      prepareAndPersistInferencePlan({
        ...input(),
      })
    ).resolves.toEqual({ status: "no_route", reason: "no_eligible_route" });
    expect(state.persistInput).toBeNull();
  });

  it("fails closed when a signed bundle is unavailable or does not pin current authorities", async () => {
    state.rolloutBundle = null;
    await expect(prepareAndPersistInferencePlan(input())).resolves.toEqual({
      status: "plan_rejected",
      reason: "ROLLOUT_BUNDLE_UNAVAILABLE_OR_STALE",
    });
    expect(state.persistInput).toBeNull();

    state.rolloutBundle = {
      payload: {
        routerPolicyRevision: "old-route-policy",
        logicalModelRegistryRevision: "registry:1",
      },
    };
    await expect(prepareAndPersistInferencePlan(input())).resolves.toEqual({
      status: "plan_rejected",
      reason: "ROLLOUT_BUNDLE_UNAVAILABLE_OR_STALE",
    });
    expect(state.persistInput).toBeNull();
  });

  it("rejects a reservation from another tenant before planning", async () => {
    await expect(
      prepareAndPersistInferencePlan({
        ...input(),
        now: new Date("2026-09-27T00:00:00.000Z"),
        reservation: { ...input().reservation, tenantId: "tenant-other" },
      })
    ).resolves.toEqual({
      status: "reservation_invalid",
      reason: "RESERVATION_AUTHORITY_MISMATCH",
    });
  });

  it("rejects an expired reservation before planning", async () => {
    await expect(
      prepareAndPersistInferencePlan({
        ...input(),
        now: new Date("2026-09-29T00:00:00.000Z"),
      })
    ).resolves.toEqual({
      status: "reservation_invalid",
      reason: "RESERVATION_EXPIRED",
    });
    expect(state.persistInput).toBeNull();
  });

  it("rejects a reservation whose remaining ceiling is below the plan ceiling", async () => {
    await expect(
      prepareAndPersistInferencePlan({
        ...input(),
        now: new Date("2026-09-27T00:00:00.000Z"),
        reservation: { ...input().reservation, availableBudgetMicros: 99 },
      })
    ).resolves.toEqual({
      status: "reservation_invalid",
      reason: "RESERVATION_BUDGET_INSUFFICIENT",
    });
    expect(state.persistInput).toBeNull();
  });
});
