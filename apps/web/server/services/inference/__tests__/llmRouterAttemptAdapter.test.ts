import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  result: null as unknown,
  call: null as unknown,
  event: null as unknown,
  runtimeResolution: null as unknown,
  runtimeResolveCount: 0,
}));

vi.mock("../../llmRouter", () => ({
  executeWithFallback: async (input: any) => {
    state.call = input;
    if (state.event) await input.physicalAttemptObserver(state.event);
    return state.result;
  },
}));
vi.mock("../runtimeDeploymentResolver", () => ({
  resolveCurrentInferenceDeployment: async () => {
    state.runtimeResolveCount += 1;
    return state.runtimeResolution;
  },
}));

import {
  createLlmRouterExecutionBindings,
  executePinnedLlmRouterAttempt,
} from "../llmRouterAttemptAdapter";

const candidate = {
  modelProfileId: "model:logical-chat",
  providerModelId: "native-chat-v4",
  deploymentId: "deployment:llm-provider-map:42",
  providerId: "provider:llm-provider:7",
  credentialOwnerRef: "credential-owner:llm-provider:7",
  endpointSurface: "responses_compatible",
} as never;

const baseInput = {
  intent: { tenantId: "tenant-a", outputTokenReserve: 300 } as never,
  candidate,
  runtime: {
    providerRecordId: 7,
    modelMappingId: 42,
    providerModelId: "native-chat-v4",
    apiStyle: "responses" as const,
  },
  messages: [{ role: "user", content: "hello" }],
  userId: 9,
  stream: false,
  signal: new AbortController().signal,
  deadlineAt: new Date(Date.now() + 10_000).toISOString(),
};

describe("pinned llmRouter provider attempt adapter", () => {
  beforeEach(() => {
    state.call = null;
    state.event = null;
    state.runtimeResolveCount = 0;
    state.runtimeResolution = {
      ok: true,
      candidate,
      authority: {},
      registryRevision: "registry:1",
      runtime: {
        providerRecordId: 7,
        modelMappingId: 42,
        providerModelId: "native-chat-v4",
        apiStyle: "responses",
      },
    };
    state.result = {
      type: "success",
      providerId: 7,
      providerName: "provider-a",
      response: {
        id: "provider-request-1",
        model: "native-chat-v4",
        usage: { prompt_tokens: 40, completion_tokens: 20, cost: 0.0002 },
      },
    };
  });

  it("dispatches only through the exact provider, native model and API style", async () => {
    const result = await executePinnedLlmRouterAttempt(baseInput);
    expect(state.call).toMatchObject({
      model: "model:logical-chat",
      preferredProvider: 7,
      strictProviderPin: true,
      expectedProviderModelId: "native-chat-v4",
      expectedApiStyle: "responses",
      expectedModelMappingId: 42,
      disableProviderFallbacks: true,
      signal: baseInput.signal,
    });
    expect(result).toMatchObject({
      observation: {
        outcome: "completed",
        submissionState: "submitted",
        observedExecution: {
          model: "native-chat-v4",
          providerId: "provider:llm-provider:7",
          deploymentId: "deployment:llm-provider-map:42",
        },
        usage: { input: 40, output: 20 },
        chargedCostMicros: 200,
      },
    });
  });

  it("records unknown outcome when a completed response does not identify the actual model", async () => {
    state.result = {
      type: "success",
      providerId: 7,
      providerName: "provider-a",
      response: { usage: { prompt_tokens: 40, completion_tokens: 20 } },
    };
    await expect(executePinnedLlmRouterAttempt(baseInput)).resolves.toMatchObject({
      observation: {
        outcome: "unknown",
        submissionState: "unknown",
        normalizedFailure: "unknown_outcome",
      },
    });
  });

  it("preserves a known HTTP rate-limit result for the safe retry policy", async () => {
    state.event = {
      phase: "terminal",
      providerCallId: "call-1",
      attemptOrdinal: 0,
      providerId: 7,
      providerName: "provider-a",
      model: "native-chat-v4",
      outcome: "error",
      statusCode: 429,
    };
    state.result = {
      type: "error",
      error: "rate limited",
      statusCode: 502,
    };
    await expect(executePinnedLlmRouterAttempt(baseInput)).resolves.toMatchObject({
      observation: {
        outcome: "failed",
        submissionState: "submitted",
        normalizedFailure: "rate_limited",
      },
    });
  });

  it("revalidates runtime identity again at dispatch through coordinator bindings", async () => {
    const loadReservationAuthority = vi.fn(async () => ({
      reservationId: "reservation-1",
      tenantId: baseInput.intent.tenantId,
      principalRef: baseInput.intent.principalId,
      availableBudgetMicros: 1000,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      status: "reserved" as const,
    }));
    const settleCompletedAttempt = vi.fn(async () => true);
    const bindings = createLlmRouterExecutionBindings({
      intent: baseInput.intent,
      owners: {} as never,
      expectedRegistryRevision: "registry:1",
      expectedRouterPolicyRevision: "router:1",
      messages: baseInput.messages,
      userId: baseInput.userId,
      stream: false,
      loadReservationAuthority,
      settleCompletedAttempt,
    });
    expect(bindings.loadReservationAuthority).toBe(loadReservationAuthority);
    expect(bindings.settleCompletedAttempt).toBe(settleCompletedAttempt);
    const resolved = await bindings.resolveCandidate(
      (candidate as { deploymentId: string }).deploymentId
    );
    expect(resolved).not.toBeNull();
    const execution = await bindings.executeAttempt({
      plan: {
        registryRevision: "registry:1",
        routePolicyRevision: "router:1",
      } as never,
      intent: baseInput.intent,
      candidate,
      attemptId: "attempt-1",
      attemptOrdinal: 1,
      deadlineAt: new Date(Date.now() + 10_000).toISOString(),
      signal: new AbortController().signal,
    });
    expect(state.runtimeResolveCount).toBe(2);
    expect(state.call).toMatchObject({
      expectedProviderModelId: "native-chat-v4",
      expectedModelMappingId: 42,
    });
    expect(execution.observation.outcome).toBe("completed");
  });
});
