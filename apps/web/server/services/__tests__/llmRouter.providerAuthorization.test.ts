import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  isAvailable: vi.fn(() => true),
  recordFailure: vi.fn(),
  recordSuccess: vi.fn(),
  logRequest: vi.fn(() => Promise.resolve()),
  calculateCost: vi.fn(async () => ({ cost: 0, method: "test" })),
  auditLog: vi.fn(),
  decrypt: vi.fn((value: string) => `decoded:${value}`),
  getTraceId: vi.fn(() => "test-trace"),
  calculateCreditsFromCost: vi.fn(() => 1),
  calculateCreditsForLLMDynamic: vi.fn(async () => 1),
  resolveEnabledLlmModelId: vi.fn(async ([model]: string[]) => model),
  isFreeModelIdentifier: vi.fn(() => false),
  buildModelProviderMapLookupCondition: vi.fn(() => ({})),
  resolveCatalogBackedPricing: vi.fn((input: {
    pricingInput: number;
    pricingOutput: number;
    isFree: boolean;
  }) => ({
    pricingInput: input.pricingInput,
    pricingOutput: input.pricingOutput,
    isFree: input.isFree,
  })),
  queueWorkerLlmInvoke: vi.fn(),
}));

vi.mock("../../db", () => ({ getDb: mocks.getDb }));
vi.mock("../../../drizzle/schema", () => ({
  modelProviderMap: {
    providerId: "providerId",
    id: "mappingId",
    supportsResponses: "supportsResponses",
    supportsFunctionTools: "supportsFunctionTools",
    supportsThinking: "supportsThinking",
    providerModelId: "providerModelId",
    apiStyle: "apiStyle",
    pricingInput: "pricingInput",
    pricingOutput: "pricingOutput",
    isFree: "isFree",
    priority: "priority",
    isEnabled: "isEnabled",
  },
  llmProviders: {
    id: "id",
    providerName: "providerName",
    baseUrl: "baseUrl",
    apiKeyEncrypted: "apiKeyEncrypted",
    availableModels: "availableModels",
    isEnabled: "isEnabled",
  },
  routingRules: {
    modelPattern: "modelPattern",
    routingMode: "routingMode",
    maxFallbacks: "maxFallbacks",
    isActive: "isActive",
    providerOrder: "providerOrder",
  },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
}));
vi.mock("../providerHealth", () => ({
  isAvailable: mocks.isAvailable,
  recordFailure: mocks.recordFailure,
  recordSuccess: mocks.recordSuccess,
}));
vi.mock("../costTracker", () => ({
  calculateCost: mocks.calculateCost,
  logRequest: mocks.logRequest,
}));
vi.mock("../auditLogger", () => ({ auditLogger: { log: mocks.auditLog } }));
vi.mock("../crypto", () => ({ decrypt: mocks.decrypt }));
vi.mock("../traceContext", () => ({ getTraceId: mocks.getTraceId }));
vi.mock("../creditService", () => ({
  calculateCreditsFromCost: mocks.calculateCreditsFromCost,
  calculateCreditsForLLMDynamic: mocks.calculateCreditsForLLMDynamic,
}));
vi.mock("../enabledLlmModels", () => ({
  isFreeModelIdentifier: mocks.isFreeModelIdentifier,
  resolveEnabledLlmModelId: mocks.resolveEnabledLlmModelId,
}));
vi.mock("../modelLookup", () => ({
  buildModelProviderMapLookupCondition: mocks.buildModelProviderMapLookupCondition,
}));
vi.mock("../llmProviderCatalog", () => ({
  resolveCatalogBackedPricing: mocks.resolveCatalogBackedPricing,
}));
vi.mock("../workerLocalLlmService", () => ({
  queueWorkerLlmInvoke: mocks.queueWorkerLlmInvoke,
}));
vi.mock("../verticalDramaLlmPolicy", () => ({
  VERTICAL_DRAMA_REASONING_POLICY_KEY: "vertical_drama_reasoning_policy",
  adaptVerticalDramaReasoningForProvider: vi.fn(() => ({})),
}));

import { executeWithFallback } from "../llmRouter";

const providerRows = [
  {
    providerId: 1,
    modelMappingId: 11,
    providerName: "first-provider",
    baseUrl: "https://first.example/v1",
    apiKeyEncrypted: "first-key",
    availableModels: [],
    supportsResponses: null,
    supportsFunctionTools: null,
    supportsThinking: null,
    providerModelId: "first-model",
    apiStyle: null,
    pricingInput: 0.01,
    pricingOutput: 0.01,
    isFree: false,
    priority: 1,
  },
  {
    providerId: 2,
    modelMappingId: 22,
    providerName: "fallback-provider",
    baseUrl: "https://fallback.example/v1",
    apiKeyEncrypted: "fallback-key",
    availableModels: [],
    supportsResponses: null,
    supportsFunctionTools: null,
    supportsThinking: null,
    providerModelId: "fallback-model",
    apiStyle: null,
    pricingInput: 0.02,
    pricingOutput: 0.02,
    isFree: false,
    priority: 2,
  },
];

function makeDb() {
  let queryIndex = 0;
  return {
    select: vi.fn(() => {
      const rows = queryIndex++ === 0 ? providerRows : [];
      const query: any = {
        from: vi.fn(() => query),
        innerJoin: vi.fn(() => query),
        where: vi.fn(async () => rows),
      };
      return query;
    }),
  };
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    text: vi.fn(async () => JSON.stringify(body)),
  } as unknown as Response;
}

function executeWithGuard(
  beforeProviderRequest: () => Promise<void>,
  physicalAttemptObserver?: (event: { phase: string; providerId: number }) => void,
) {
  return executeWithFallback({
    model: "test-model",
    messages: [{ role: "user" as const, content: "hello" }],
    stream: false,
    userId: 0,
    timeoutMs: 100,
    beforeProviderRequest,
    physicalAttemptObserver,
  });
}

describe("executeWithFallback provider authorization guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAvailable.mockReturnValue(true);
    mocks.resolveEnabledLlmModelId.mockImplementation(async ([model]) => model);
    mocks.getDb.mockImplementation(async () => makeDb());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs the successful guard once immediately before each failed and fallback provider request", async () => {
    const order: string[] = [];
    const attempts: number[] = [];
    let fetchCount = 0;
    const guard = vi.fn(async () => {
      order.push("guard");
    });
    const fetchMock = vi.fn(async () => {
      order.push("fetch");
      fetchCount += 1;
      if (fetchCount === 1) {
        return jsonResponse(503, { error: { message: "temporarily unavailable" } });
      }
      return jsonResponse(200, {
        choices: [{ message: { role: "assistant", content: "fallback worked" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeWithGuard(guard, (event) => {
      if (event.phase === "started") attempts.push(event.providerId);
    });

    expect(result).toMatchObject({ type: "success", providerId: 2 });
    expect(guard).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(order).toEqual(["guard", "fetch", "guard", "fetch"]);
    expect(attempts).toEqual([1, 2]);
  });

  it("propagates guard authorization failure without fetching or attempting fallback", async () => {
    const authorizationError = Object.assign(new Error("provider authorization revoked"), {
      code: "PROVIDER_AUTHORIZATION_REVOKED",
    });
    const attempts: number[] = [];
    const guard = vi.fn(async () => {
      throw authorizationError;
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      executeWithGuard(guard, (event) => {
        if (event.phase === "started") attempts.push(event.providerId);
      }),
    ).rejects.toBe(authorizationError);

    expect(guard).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(attempts).toEqual([1]);
  });

  it("revalidates before persisting a worker-local request", async () => {
    const authorizationError = new Error("project authorization revoked");
    const guard = vi.fn(async () => {
      throw authorizationError;
    });

    await expect(
      executeWithFallback({
        model: "wllm_abcdefgh",
        messages: [{ role: "user", content: "project context" }],
        stream: false,
        userId: 7,
        tenantId: "tenant-a",
        beforeProviderRequest: guard,
      }),
    ).rejects.toBe(authorizationError);

    expect(guard).toHaveBeenCalledTimes(1);
    expect(mocks.queueWorkerLlmInvoke).not.toHaveBeenCalled();
  });
});
