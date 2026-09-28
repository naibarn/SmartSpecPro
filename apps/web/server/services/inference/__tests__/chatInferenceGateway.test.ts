import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  balance: vi.fn(),
  createReservation: vi.fn(),
  closeReservation: vi.fn(),
  plan: vi.fn(),
  rollout: vi.fn(),
  registry: vi.fn(),
  buildIntent: vi.fn(),
  execute: vi.fn(),
  stageResponse: vi.fn(),
  deliverResponse: vi.fn(),
}));

vi.mock("../../creditService", () => ({
  getCreditBalance: (...args: unknown[]) => mocks.balance(...args),
}));
vi.mock("../durableCreditReservation", () => ({
  createDurableInferenceCreditReservation: (...args: unknown[]) =>
    mocks.createReservation(...args),
  closeDurableInferenceCreditReservation: (...args: unknown[]) =>
    mocks.closeReservation(...args),
}));
vi.mock("../inferencePlanningService", () => ({
  planInferenceRouteForRequest: (...args: unknown[]) => mocks.plan(...args),
}));
vi.mock("../rolloutBundle", () => ({
  getInferenceRolloutBundleStatus: (...args: unknown[]) =>
    mocks.rollout(...args),
}));
vi.mock("../profileRegistry", () => ({
  loadInferenceProfileRegistry: (...args: unknown[]) => mocks.registry(...args),
}));
vi.mock("../chatInferenceIntent", () => ({
  buildChatInferenceIntent: (...args: unknown[]) => mocks.buildIntent(...args),
}));
vi.mock("../automaticInferenceRequest", () => ({
  executePolicyRoutedInference: (...args: unknown[]) => mocks.execute(...args),
}));
vi.mock("../creditReservationAuthority", () => ({
  inferenceCostMicrosToCreditUnits: (cost: number) =>
    Math.max(1, Math.ceil(cost / 1_000)),
}));
vi.mock("../../chatService", () => ({
  stageInferenceChatResponseDelivery: (...args: unknown[]) => mocks.stageResponse(...args),
  deliverSettledInferenceChatResponse: (...args: unknown[]) => mocks.deliverResponse(...args),
}));

import { executeChatThroughInferenceGateway } from "../chatInferenceGateway";

describe("Spec 231 chat inference gateway", () => {
  const input = () => ({
    userId: 7,
    tenantId: "tenant-1",
    messages: [{ role: "user", content: "hello" }],
    selection: { mode: "auto-global" as const },
    stream: false,
    traceId: "trace-1",
    idempotencyKey: "client-request-1",
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.registry.mockResolvedValue({
      ok: true,
      profiles: [
        {
          model: { logicalModelId: "logical:model-a" },
          deployment: {
            runtimeBinding: { providerRecordId: 18, modelMappingId: 42 },
          },
        },
      ],
    });
    mocks.rollout.mockResolvedValue({
      keyringStatus: "ready",
      activeBundle: {
        bundleHash: `sha256:${"a".repeat(64)}`,
        signatureStatus: "valid",
        payload: {},
      },
    });
    mocks.balance.mockResolvedValue({ credits: 40, plan: "free" });
    mocks.buildIntent.mockReturnValue({
      ok: true,
      request: {
        idempotencyKey: "chat:digest",
        maxEstimatedCostMicros: 40_000,
      },
    });
    mocks.plan.mockResolvedValue({
      status: "planned",
      boundIntent: { selection: { mode: "AUTO" } },
      authority: {
        routerPolicyRevision: "router-policy-1",
        policyRevision: "policy-1",
      },
      route: {
        status: "selected",
        candidate: { estimatedCostMicros: 1_500 },
        eligibleCandidates: [],
      },
    });
    mocks.createReservation.mockResolvedValue({
      ok: true,
      reservationId: "reservation-1",
      authority: {
        reservationId: "reservation-1",
        tenantId: "tenant-1",
        principalRef: "user:7",
        availableBudgetMicros: 2_000,
        expiresAt: "2026-09-27T18:00:00.000Z",
        status: "reserved",
      },
    });
    mocks.execute.mockResolvedValue({
      status: "executed",
      result: { status: "executed" },
    });
    mocks.stageResponse.mockResolvedValue(undefined);
    mocks.deliverResponse.mockResolvedValue("delivered");
    mocks.closeReservation.mockResolvedValue(true);
  });

  it("reserves only the quoted route budget and executes under the active signed bundle", async () => {
    const result = await executeChatThroughInferenceGateway(input());
    expect(result).toMatchObject({ status: "executed", creditsReserved: 2 });
    expect(mocks.createReservation).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 2 })
    );
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          rolloutBundleHash: `sha256:${"a".repeat(64)}`,
        }),
        request: expect.objectContaining({ maxEstimatedCostMicros: 2_000 }),
        reservation: expect.objectContaining({ availableBudgetMicros: 2_000 }),
        maxTokens: 1_024,
      })
    );
  });

  it("stages a conversation response before completion and delivers only after settlement", async () => {
    const request = { ...input(), conversationId: 31, skillUsed: "summarize" };
    mocks.execute.mockImplementation(async (executionInput: any) => {
      await executionInput.persistResponseDelivery({
        attemptId: "attempt-1",
        receipt: { usage: { input: 10, output: 5 }, chargedCostMicros: 1_200 },
        response: { model: "gpt-4o", choices: [{ message: { content: "Recovered response" } }] },
      });
      return {
        status: "executed",
        planning: { status: "plan_persisted" },
        execution: { status: "completed", receipt: { attemptId: "attempt-1" } },
      };
    });

    await expect(executeChatThroughInferenceGateway(request)).resolves.toMatchObject({
      status: "executed",
    });
    expect(mocks.stageResponse).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: "attempt-1",
      tenantId: "tenant-1",
      userId: 7,
      message: expect.objectContaining({
        conversationId: 31,
        content: "Recovered response",
        inputTokens: 10,
        outputTokens: 5,
        creditsUsed: "2",
        skillUsed: "summarize",
      }),
    }));
    expect(mocks.deliverResponse).toHaveBeenCalledWith("attempt-1");
  });

  it("uses the request trace as one stable server idempotency key when the client omits one", async () => {
    const request = { ...input(), conversationId: 31, idempotencyKey: undefined };
    mocks.execute.mockImplementation(async (executionInput: any) => {
      await executionInput.persistResponseDelivery({
        attemptId: "attempt-2",
        receipt: { usage: { input: 1, output: 1 }, chargedCostMicros: 1_000 },
        response: { choices: [{ message: { content: "answer" } }] },
      });
      return {
        status: "executed",
        planning: { status: "plan_persisted" },
        execution: { status: "completed", receipt: { attemptId: "attempt-2" } },
      };
    });

    await executeChatThroughInferenceGateway(request);

    expect(mocks.stageResponse).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "server:trace-1",
    }));
  });

  it("preapproves one policy-eligible AUTO fallback and reserves its worst-case cost", async () => {
    const primary = {
      modelProfileId: "model:primary",
      providerModelId: "primary-r1",
      deploymentId: "deployment:primary",
      providerId: "provider:primary",
      credentialOwnerRef: "credential-owner:primary",
      endpointSurface: "responses_compatible" as const,
      executionSurface: "cloud" as const,
      qualification: "qualified" as const,
      health: "healthy" as const,
      credentialStatus: "active" as const,
      region: "TH",
      supportsZeroDataRetention: true,
      allowedPrivacyClasses: ["tenant-confidential"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: ["streaming"],
      toolContractRefs: [],
      maxContextTokens: 32_000,
      maxOutputTokens: 8_000,
      priceValidUntilMs: Date.now() + 60_000,
      estimatedCostMicros: 1_500,
      latencyP95Ms: 2_000,
      qualityScorePpm: 700_000,
      reliabilityScorePpm: 800_000,
      compatibilityScorePpm: 900_000,
      scoreCalibrationRevision: "scores:1",
    };
    const fallback = {
      ...primary,
      modelProfileId: "model:fallback",
      providerModelId: "fallback-r1",
      deploymentId: "deployment:fallback",
      providerId: "provider:fallback",
      credentialOwnerRef: "credential-owner:fallback",
      estimatedCostMicros: 2_500,
      qualityScorePpm: 600_000,
    };
    const higherQualityOverBudgetFallback = {
      ...fallback,
      modelProfileId: "model:over-budget",
      providerModelId: "over-budget-r1",
      deploymentId: "deployment:over-budget",
      providerId: "provider:over-budget",
      credentialOwnerRef: "credential-owner:over-budget",
      estimatedCostMicros: 3_000,
      qualityScorePpm: 990_000,
    };
    const autoIntent = {
      contract: "SAH-INFERENCE-2" as const,
      requestId: "request:auto",
      traceId: "trace-1",
      tenantId: "tenant-1",
      principalId: "user:7",
      consumer: "chat",
      taskClass: "general-chat",
      purpose: "answer-user",
      inputModalities: ["text"],
      outputModalities: ["text"],
      inputTokenEstimate: 100,
      outputTokenReserve: 1_024,
      requiredFeatures: [],
      languageHints: ["en"],
      privacyClass: "tenant-confidential",
      residencyAllowlist: ["TH"],
      zdrRequired: false,
      qualityClass: "standard" as const,
      risk: "medium" as const,
      latencyDeadlineMs: 20_000,
      maxEstimatedCostMicros: 4_000,
      selection: { mode: "AUTO" as const },
      policyRevision: "policy-1",
      budgetScopeRef: "tenant:tenant-1",
      idempotencyKey: "chat:digest",
    };
    const routeAuthority = {
      tenantId: "tenant-1",
      principalId: "user:7",
      policyRevision: "policy-1",
      platformPolicyReady: true,
      tenantPolicyReady: true,
      emergencyRevocationFresh: true,
      budgetAuthorityReady: true,
      platformAllowedProviderIds: [
        primary.providerId,
        fallback.providerId,
        higherQualityOverBudgetFallback.providerId,
      ],
      tenantAllowedProviderIds: [
        primary.providerId,
        fallback.providerId,
        higherQualityOverBudgetFallback.providerId,
      ],
      principalAllowedProviderIds: [
        primary.providerId,
        fallback.providerId,
        higherQualityOverBudgetFallback.providerId,
      ],
      allowedCredentialOwnerRefs: [
        primary.credentialOwnerRef,
        fallback.credentialOwnerRef,
        higherQualityOverBudgetFallback.credentialOwnerRef,
      ],
      allowedRegions: ["TH"],
      requireZeroDataRetention: false,
      availableBudgetMicros: 4_000,
      revokedModelProfileIds: [],
      revokedDeploymentIds: [],
      observedAtMs: Date.now(),
      registryRevision: "registry:1",
      routerPolicyRevision: "router-policy-1",
      scoreCalibrationRevision: "scores:1",
      routingWeights: {
        qualityPpm: 800_000,
        costPpm: 50_000,
        latencyPpm: 50_000,
        reliabilityPpm: 50_000,
        compatibilityPpm: 50_000,
      },
    };
    mocks.buildIntent.mockReturnValue({ ok: true, request: autoIntent });
    mocks.plan.mockResolvedValue({
      status: "planned",
      boundIntent: autoIntent,
      authority: routeAuthority,
      route: {
        status: "selected",
        candidate: primary,
        eligibleCandidates: [
          primary,
          fallback,
          higherQualityOverBudgetFallback,
        ],
      },
    });
    mocks.balance.mockResolvedValue({ credits: 4, plan: "free" });
    mocks.createReservation.mockResolvedValue({
      ok: true,
      reservationId: "reservation-1",
      authority: {
        reservationId: "reservation-1",
        tenantId: "tenant-1",
        principalRef: "user:7",
        availableBudgetMicros: 4_000,
        expiresAt: "2026-09-27T18:00:00.000Z",
        status: "reserved",
      },
    });

    const result = await executeChatThroughInferenceGateway(input());

    expect(result).toMatchObject({ status: "executed", creditsReserved: 4 });
    expect(mocks.createReservation).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 4 })
    );
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          attemptBudget: 2,
          fallbackPermission: "preapproved",
          preapprovedFallbackDeploymentIds: ["deployment:fallback"],
        }),
        request: expect.objectContaining({ maxEstimatedCostMicros: 4_000 }),
      })
    );
  });

  it("does not convert a user provider lock into an automatic cross-provider fallback", async () => {
    mocks.plan.mockResolvedValue({
      status: "planned",
      boundIntent: {
        selection: {
          mode: "PROVIDER_LOCK",
          providerId: "provider:locked",
          fallback: "ask",
        },
      },
      authority: {},
      route: {
        status: "selected",
        candidate: {
          estimatedCostMicros: 1_500,
          deploymentId: "deployment:locked",
        },
        eligibleCandidates: [
          { deploymentId: "deployment:locked" },
          { deploymentId: "deployment:other-provider" },
        ],
      },
    });

    await executeChatThroughInferenceGateway({
      ...input(),
      selection: { mode: "auto-provider", providerId: 3 },
    });

    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          attemptBudget: 1,
          fallbackPermission: "ask",
          preapprovedFallbackDeploymentIds: [],
        }),
      })
    );
  });

  it("routes a database-backed explicit model as a certified model/provider lock", async () => {
    await executeChatThroughInferenceGateway({
      ...input(),
      selection: { mode: "explicit", modelId: "model-a", providerId: 18 },
      resolvedModelMappingId: 42,
      resolvedProviderId: 18,
    });

    expect(mocks.buildIntent).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedModelProfileId: "logical:model-a" })
    );
    expect(mocks.plan).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ idempotencyKey: "chat:digest" }),
      })
    );
  });

  it("blocks an explicit model that has no certified mapping", async () => {
    mocks.registry.mockResolvedValue({ ok: true, profiles: [] });
    await expect(
      executeChatThroughInferenceGateway({
        ...input(),
        selection: { mode: "explicit", modelId: "model-a" },
        resolvedModelMappingId: 42,
        resolvedProviderId: 18,
      })
    ).resolves.toEqual({
      status: "blocked",
      reason: "EXPLICIT_MODEL_NOT_CERTIFIED",
    });
    expect(mocks.createReservation).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("fails closed when an active rollout cannot be verified", async () => {
    mocks.rollout.mockResolvedValue({
      keyringStatus: "KEYRING_MISSING",
      activeBundle: {
        bundleHash: "sha256:bad",
        signatureStatus: "unavailable",
        payload: null,
      },
    });
    await expect(executeChatThroughInferenceGateway(input())).resolves.toEqual({
      status: "blocked",
      reason: "ACTIVE_ROLLOUT_NOT_VERIFIABLE",
    });
    expect(mocks.createReservation).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("attempts guarded reservation cleanup when the facade throws", async () => {
    mocks.execute.mockRejectedValue(new Error("database unavailable"));
    await expect(executeChatThroughInferenceGateway(input())).resolves.toEqual({
      status: "blocked",
      reason: "INFERENCE_GATEWAY_FAILED",
    });
    expect(mocks.closeReservation).toHaveBeenCalledWith({
      reservationId: "reservation-1",
    });
  });

  it("blocks non-explicit chat when there is no active rollout head", async () => {
    mocks.rollout.mockResolvedValue({
      keyringStatus: "ready",
      activeBundle: null,
    });
    await expect(executeChatThroughInferenceGateway(input())).resolves.toEqual({
      status: "blocked",
      reason: "ACTIVE_ROLLOUT_MISSING",
    });
    expect(mocks.createReservation).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
