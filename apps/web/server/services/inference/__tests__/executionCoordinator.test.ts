import { describe, expect, it, vi } from "vitest";
import { inferenceIntentV2Schema, inferencePlanR4Schema } from "../contracts";
import { hashInferenceIntent } from "../planFactory";
import type { InferenceExecutionStore } from "../executionCoordinator";
import { executeInferencePlan } from "../executionCoordinator";
import type {
  InferenceAuthoritySnapshot,
  RouteCandidate,
} from "../policyResolver";

const fixedNow = Date.parse("2026-09-27T10:00:00.000Z");
const intent = inferenceIntentV2Schema.parse({
  contract: "SAH-INFERENCE-2",
  requestId: "request-1",
  traceId: "trace-1",
  tenantId: "tenant-1",
  principalId: "user-1",
  consumer: "chat",
  taskClass: "answer",
  purpose: "respond",
  inputModalities: ["text"],
  outputModalities: ["text"],
  inputTokenEstimate: 100,
  outputTokenReserve: 200,
  requiredFeatures: [],
  languageHints: ["en"],
  privacyClass: "tenant-confidential",
  residencyAllowlist: ["TH"],
  zdrRequired: true,
  qualityClass: "standard",
  risk: "low",
  latencyDeadlineMs: 60_000,
  maxEstimatedCostMicros: 1000,
  selection: { mode: "AUTO" },
  policyRevision: "policy-1",
  budgetScopeRef: "tenant:tenant-1",
  idempotencyKey: "idem-1",
});

function plan(fallbackCandidates: string[] = []) {
  return inferencePlanR4Schema.parse({
    planId: "plan-1",
    intentHash: hashInferenceIntent(intent),
    policyRevision: "policy-1",
    registryRevision: "registry-1",
    selectedModelProfile: "model-1",
    selectedDeploymentProfile: "deployment-1",
    endpointSurface: "responses_compatible",
    attemptBudget: fallbackCandidates.length + 1,
    deadlineAt: "2026-09-27T10:01:00.000Z",
    fallbackCandidates,
    fallbackPermission: fallbackCandidates.length ? "preapproved" : "none",
    cachePolicyId: "cache:no-store",
    creditReservationId: "reservation-1",
    estimatedCostMicros: 100,
    routePolicyRevision: "router-1",
    specUid: "urn:smartaihub:spec:llm-routing-inference",
    specRevision: "R4",
    rolloutBundleHash: `sha256:${"b".repeat(64)}`,
    logicalCallId: "call-1",
    attemptOwnershipEpoch: 1,
    parentCostCeilingMicros: 200,
    overallDeadlineAt: "2026-09-27T10:02:00.000Z",
    residencyPolicySnapshotRef: "residency-1",
    routerFeatureProvenanceRef: "router-1",
  });
}

const authority: InferenceAuthoritySnapshot = {
  tenantId: "tenant-1",
  principalId: "user-1",
  policyRevision: "policy-1",
  platformPolicyReady: true,
  tenantPolicyReady: true,
  emergencyRevocationFresh: true,
  budgetAuthorityReady: true,
  platformAllowedProviderIds: ["provider-1", "provider-2"],
  tenantAllowedProviderIds: ["provider-1", "provider-2"],
  principalAllowedProviderIds: ["provider-1", "provider-2"],
  allowedCredentialOwnerRefs: ["credential-owner-1", "credential-owner-2"],
  allowedRegions: ["TH"],
  requireZeroDataRetention: true,
  availableBudgetMicros: 1000,
  revokedModelProfileIds: [],
  revokedDeploymentIds: [],
  observedAtMs: fixedNow,
  registryRevision: "registry-1",
  routerPolicyRevision: "router-1",
  scoreCalibrationRevision: "scores-1",
  routingWeights: {
    qualityPpm: 800_000,
    costPpm: 50_000,
    latencyPpm: 50_000,
    reliabilityPpm: 50_000,
    compatibilityPpm: 50_000,
  },
};

function candidate(
  deploymentId: string,
  providerId = "provider-1",
  modelProfileId = "model-1"
): RouteCandidate {
  return {
    modelProfileId,
    deploymentId,
    providerId,
    credentialOwnerRef:
      providerId === "provider-1" ? "credential-owner-1" : "credential-owner-2",
    endpointSurface: "responses_compatible",
    executionSurface: "cloud",
    qualification: "qualified",
    health: "healthy",
    credentialStatus: "active",
    region: "TH",
    supportsZeroDataRetention: true,
    allowedPrivacyClasses: ["tenant-confidential"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    features: [],
    toolContractRefs: [],
    maxContextTokens: 10_000,
    maxOutputTokens: 1_000,
    priceValidUntilMs: fixedNow + 60_000,
    estimatedCostMicros: 100,
    latencyP95Ms: 100,
    qualityScorePpm: 900_000,
    reliabilityScorePpm: 900_000,
    compatibilityScorePpm: 900_000,
    scoreCalibrationRevision: "scores-1",
  };
}

function makeStore(overrides: Partial<InferenceExecutionStore> = {}) {
  const store: InferenceExecutionStore = {
    createAttempt: vi.fn(async () => ({ created: true, status: "prepared" })),
    markSubmitting: vi.fn(async () => true),
    complete: vi.fn(async () => true),
    recordSettlement: vi.fn(async () => undefined),
    ...overrides,
  };
  return store;
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    plan: plan(),
    intent,
    attemptOwnershipEpoch: 1,
    ownerToken: "worker-owner-token",
    store: makeStore(),
    resolveCandidate: vi.fn(async (deploymentId: string) => ({
      candidate: candidate(deploymentId),
      authority,
    })),
    loadReservationAuthority: vi.fn(async () => ({
      reservationId: "reservation-1",
      tenantId: "tenant-1",
      principalRef: "user-1",
      availableBudgetMicros: 1000,
      expiresAt: "2026-09-27T10:05:00.000Z",
      status: "reserved" as const,
    })),
    providerIdempotencyCertified: () => false,
    executeAttempt: vi.fn(async () => ({
      observation: {
        outcome: "completed" as const,
        submissionState: "submitted" as const,
        streamCommitted: false,
        chargedCostMicros: 25,
        observedExecution: {
          model: "model-1",
          providerId: "provider-1",
          credentialOwnerRef: "credential-owner-1",
          deploymentId: "deployment-1",
          endpointSurface: "responses_compatible" as const,
        },
      },
      response: { text: "ok" },
    })),
    settleCompletedAttempt: vi.fn(async () => true),
    now: () => fixedNow,
    makeAttemptId: () => "attempt-1",
    ...overrides,
  } as Parameters<typeof executeInferencePlan>[0];
}

describe("Spec 231 execution coordinator", () => {
  it("durably stages the Chat response before recording or settling a completed attempt", async () => {
    const args = input();
    const order: string[] = [];
    args.persistResponseDelivery = vi.fn(async () => { order.push("stage"); });
    const complete = args.store!.complete as ReturnType<typeof vi.fn>;
    complete.mockImplementation(async () => { order.push("complete"); return true; });
    const settle = args.settleCompletedAttempt as ReturnType<typeof vi.fn>;
    settle.mockImplementation(async () => { order.push("settle"); return true; });

    await executeInferencePlan(args);

    expect(args.persistResponseDelivery).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: "attempt-1",
      planId: "plan-1",
      response: { text: "ok" },
      receipt: expect.objectContaining({ outcome: "completed", chargedCostMicros: 25 }),
    }));
    expect(order).toEqual(["stage", "complete", "settle"]);
  });

  it("does not settle or return a paid response when durable Chat staging fails", async () => {
    const args = input({ persistResponseDelivery: vi.fn(async () => { throw new Error("database unavailable"); }) });
    const result = await executeInferencePlan(args);
    expect(result).toMatchObject({ status: "failed", retryDecision: { action: "terminal", reason: "UNKNOWN_OUTCOME" } });
    expect(args.settleCompletedAttempt).not.toHaveBeenCalled();
  });

  it("rechecks the selected route, fences before I/O, and records observed identity", async () => {
    const args = input();
    const result = await executeInferencePlan(args);
    expect(result).toMatchObject({
      status: "completed",
      response: { text: "ok" },
    });
    expect(args.store?.markSubmitting).toHaveBeenCalledOnce();
    expect(args.loadReservationAuthority).toHaveBeenCalledTimes(2);
    expect(args.loadReservationAuthority).toHaveBeenCalledWith({
      reservationId: "reservation-1",
      tenantId: "tenant-1",
      principalRef: "user-1",
    });
    expect(args.settleCompletedAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: "reservation-1",
        settlementKey: "attempt-1",
        chargedCostMicros: 25,
      }),
    );
    expect(args.store?.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        receipt: expect.objectContaining({
          deploymentId: "deployment-1",
          observedExecution: expect.objectContaining({
            providerId: "provider-1",
          }),
        }),
      })
    );
  });

  it("records route identity mismatch and does not return success", async () => {
    const args = input({
      executeAttempt: async () => ({
        observation: {
          outcome: "completed" as const,
          submissionState: "submitted" as const,
          streamCommitted: false,
          observedExecution: {
            model: "model-1",
            providerId: "provider-2",
            credentialOwnerRef: "credential-owner-2",
            deploymentId: "deployment-1",
            endpointSurface: "responses_compatible" as const,
          },
        },
        response: { text: "wrong route" },
      }),
    });
    expect(await executeInferencePlan(args)).toMatchObject({
      status: "route_identity_mismatch",
    });
  });

  it("does not return provider output when credit settlement is unavailable", async () => {
    const args = input({
      settleCompletedAttempt: vi.fn(async () => false),
    });
    const result = await executeInferencePlan(args);
    expect(result).toMatchObject({
      status: "settlement_pending",
      reason: "OWNER_REJECTED",
      receipt: { outcome: "completed", chargedCostMicros: 25 },
    });
    expect(result).not.toHaveProperty("response");
  });

  it("does not return paid provider output when actual cost is missing", async () => {
    const args = input({
      executeAttempt: async () => ({
        observation: {
          outcome: "completed" as const,
          submissionState: "submitted" as const,
          streamCommitted: false,
          observedExecution: {
            model: "model-1",
            providerId: "provider-1",
            credentialOwnerRef: "credential-owner-1",
            deploymentId: "deployment-1",
            endpointSurface: "responses_compatible" as const,
          },
        },
        response: { text: "not settled" },
      }),
    });
    const result = await executeInferencePlan(args);
    expect(result).toMatchObject({
      status: "settlement_pending",
      reason: "COST_UNAVAILABLE",
    });
    expect(args.settleCompletedAttempt).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("response");
  });

  it("does not retry after an unknown provider outcome", async () => {
    const args = input({
      plan: plan(["deployment-2"]),
      executeAttempt: async () => {
        throw new Error("connection lost");
      },
    });
    expect(await executeInferencePlan(args)).toMatchObject({
      status: "failed",
      retryDecision: { action: "terminal", reason: "UNKNOWN_OUTCOME" },
    });
    expect(args.resolveCandidate).toHaveBeenCalledTimes(1);
  });

  it("retries only to a plan-pinned fallback after a known retryable result", async () => {
    const executeAttempt = vi
      .fn()
      .mockResolvedValueOnce({
        observation: {
          outcome: "failed",
          submissionState: "submitted",
          streamCommitted: false,
          normalizedFailure: "provider_unavailable",
        },
      })
      .mockResolvedValueOnce({
        observation: {
          outcome: "completed",
          submissionState: "submitted",
          streamCommitted: false,
          chargedCostMicros: 25,
          observedExecution: {
            model: "model-1",
            providerId: "provider-2",
            credentialOwnerRef: "credential-owner-2",
            deploymentId: "deployment-2",
            endpointSurface: "responses_compatible",
          },
        },
        response: { text: "fallback" },
      });
    const args = input({
      plan: plan(["deployment-2"]),
      resolveCandidate: async (deploymentId: string) => ({
        candidate: candidate(
          deploymentId,
          deploymentId === "deployment-1" ? "provider-1" : "provider-2"
        ),
        authority,
      }),
      providerIdempotencyCertified: () => true,
      executeAttempt,
      makeAttemptId: (() => {
        let i = 0;
        return () => `attempt-${++i}`;
      })(),
    });
    expect(await executeInferencePlan(args)).toMatchObject({
      status: "completed",
      receipt: { deploymentId: "deployment-2", attemptOrdinal: 2 },
    });
    expect(executeAttempt).toHaveBeenCalledTimes(2);
  });

  it("stops before provider I/O when the current route revision differs from the pinned plan", async () => {
    const args = input({
      resolveCandidate: async (deploymentId: string) => ({
        candidate: candidate(deploymentId),
        authority: { ...authority, registryRevision: "registry-stale" },
      }),
    });
    expect(await executeInferencePlan(args)).toMatchObject({
      status: "route_not_eligible",
      reasonCodes: ["PINNED_ROUTE_UNAVAILABLE"],
    });
    expect(args.executeAttempt).not.toHaveBeenCalled();
    expect(args.store?.createAttempt).not.toHaveBeenCalled();
  });

  it("rejects an intent that no longer matches the immutable plan hash", async () => {
    const args = input({ intent: { ...intent, purpose: "different-purpose" } });
    expect(await executeInferencePlan(args)).toEqual({
      status: "plan_invalid",
    });
    expect(args.resolveCandidate).not.toHaveBeenCalled();
    expect(args.executeAttempt).not.toHaveBeenCalled();
  });

  it("fails closed before attempt creation when the canonical reservation is unavailable", async () => {
    const args = input({
      loadReservationAuthority: async () => null,
    });
    expect(await executeInferencePlan(args)).toEqual({
      status: "reservation_unavailable",
    });
    expect(args.store?.createAttempt).not.toHaveBeenCalled();
    expect(args.executeAttempt).not.toHaveBeenCalled();
  });

  it("requires a live reservation loader and treats owner lookup failures as unavailable", async () => {
    const missingLoader = input({ loadReservationAuthority: undefined });
    expect(await executeInferencePlan(missingLoader)).toEqual({
      status: "plan_invalid",
    });
    expect(missingLoader.executeAttempt).not.toHaveBeenCalled();

    const lookupFailed = input({
      loadReservationAuthority: async () => {
        throw new Error("credit owner unavailable");
      },
    });
    expect(await executeInferencePlan(lookupFailed)).toEqual({
      status: "reservation_unavailable",
    });
    expect(lookupFailed.store?.createAttempt).not.toHaveBeenCalled();
    expect(lookupFailed.executeAttempt).not.toHaveBeenCalled();
  });

  it("rejects an expired or insufficient current reservation before provider dispatch", async () => {
    const expired = input({
      loadReservationAuthority: async () => ({
        reservationId: "reservation-1",
        tenantId: "tenant-1",
        principalRef: "user-1",
        availableBudgetMicros: 1000,
        expiresAt: "2026-09-27T09:59:59.000Z",
        status: "reserved" as const,
      }),
    });
    expect(await executeInferencePlan(expired)).toEqual({
      status: "reservation_expired",
    });
    expect(expired.executeAttempt).not.toHaveBeenCalled();

    const insufficient = input({
      loadReservationAuthority: async () => ({
        reservationId: "reservation-1",
        tenantId: "tenant-1",
        principalRef: "user-1",
        availableBudgetMicros: 199,
        expiresAt: "2026-09-27T10:05:00.000Z",
        status: "reserved" as const,
      }),
    });
    expect(await executeInferencePlan(insufficient)).toEqual({
      status: "budget_exhausted",
    });
    expect(insufficient.store?.createAttempt).not.toHaveBeenCalled();
    expect(insufficient.executeAttempt).not.toHaveBeenCalled();
  });

  it("rechecks reservation after the attempt is prepared and persists a known no-submit outcome", async () => {
    const current = {
      reservationId: "reservation-1",
      tenantId: "tenant-1",
      principalRef: "user-1",
      availableBudgetMicros: 1000,
      expiresAt: "2026-09-27T10:05:00.000Z",
      status: "reserved" as const,
    };
    const loader = vi.fn().mockResolvedValueOnce(current).mockResolvedValueOnce({
      ...current,
      availableBudgetMicros: 0,
    });
    const args = input({ loadReservationAuthority: loader });

    expect(await executeInferencePlan(args)).toEqual({
      status: "budget_exhausted",
    });
    expect(args.executeAttempt).not.toHaveBeenCalled();
    expect(args.store?.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        receipt: expect.objectContaining({
          outcome: "failed",
          submissionState: "not_submitted",
          normalizedFailure: "budget_exceeded",
        }),
      })
    );
  });

  it("keeps timed-out provider calls ambiguous and does not retry them", async () => {
    vi.useFakeTimers();
    try {
      const args = input({
        plan: inferencePlanR4Schema.parse({
          ...plan(["deployment-2"]),
          deadlineAt: "2026-09-27T10:00:00.010Z",
          overallDeadlineAt: "2026-09-27T10:00:00.020Z",
        }),
        executeAttempt: () => new Promise(() => {}),
      });
      const resultPromise = executeInferencePlan(args);
      await vi.advanceTimersByTimeAsync(20);
      expect(await resultPromise).toMatchObject({
        status: "failed",
        retryDecision: { action: "terminal", reason: "UNKNOWN_OUTCOME" },
      });
      expect(args.resolveCandidate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
