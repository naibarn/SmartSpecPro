import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockExecuteWithFallback,
  mockDeductCreditsForModel,
  mockIsModelFree,
  mockLogRequest,
  mockResolveChatModelSelection,
  mockExecuteChatThroughInferenceGateway,
  mockGetConversationById,
  mockCreateMessage,
  mockUpdateConversationCredits,
  mockFindInferenceAssistantMessage,
  mockCreateInferenceAssistantMessageOnce,
  mockDeliverSettledInferenceChatResponseForKey,
} = vi.hoisted(() => ({
  mockExecuteWithFallback: vi.fn(),
  mockDeductCreditsForModel: vi.fn(),
  mockIsModelFree: vi.fn(),
  mockLogRequest: vi.fn(),
  mockResolveChatModelSelection: vi.fn(),
  mockExecuteChatThroughInferenceGateway: vi.fn(),
  mockGetConversationById: vi.fn(),
  mockCreateMessage: vi.fn(),
  mockUpdateConversationCredits: vi.fn(),
  mockFindInferenceAssistantMessage: vi.fn(),
  mockCreateInferenceAssistantMessageOnce: vi.fn(),
  mockDeliverSettledInferenceChatResponseForKey: vi.fn(),
}));

vi.mock("./services/inference/chatInferenceGateway", () => ({
  executeChatThroughInferenceGateway: (...args: unknown[]) =>
    mockExecuteChatThroughInferenceGateway(...args),
}));

vi.mock("./services/llmRouter", () => ({
  executeWithFallback: mockExecuteWithFallback,
}));

vi.mock("./services/creditService", () => ({
  isModelFree: mockIsModelFree,
  deductCreditsForModel: mockDeductCreditsForModel,
  calculateCreditsForLLM: vi.fn().mockReturnValue(1),
  calculateCreditsFromCost: vi.fn().mockReturnValue(1),
  hasEnoughCredits: vi.fn().mockResolvedValue(true),
  getCreditBalance: vi.fn().mockResolvedValue({ credits: 100, plan: "free" }),
}));

vi.mock("./services/costTracker", () => ({
  logRequest: mockLogRequest.mockResolvedValue(undefined),
}));

vi.mock("./services/chatModelSelection", () => ({
  deriveChatSelectionContext: vi.fn().mockReturnValue(null),
  readStoredChatModelSelectionState: vi.fn().mockReturnValue(null),
  resolveChatModelSelection: (...args: unknown[]) =>
    mockResolveChatModelSelection(...args),
  storedSelectionStateFromResolved: vi.fn().mockReturnValue({
    mode: "explicit",
    modelId: "gpt-4o",
  }),
}));

vi.mock("./services/chatService", () => ({
  getConversationById: (...args: unknown[]) => mockGetConversationById(...args),
  createMessage: (...args: unknown[]) => mockCreateMessage(...args),
  updateConversationCredits: (...args: unknown[]) => mockUpdateConversationCredits(...args),
  findInferenceAssistantMessage: (...args: unknown[]) => mockFindInferenceAssistantMessage(...args),
  createInferenceAssistantMessageOnce: (...args: unknown[]) => mockCreateInferenceAssistantMessageOnce(...args),
  deliverSettledInferenceChatResponseForKey: (...args: unknown[]) => mockDeliverSettledInferenceChatResponseForKey(...args),
  updateConversation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn().mockResolvedValue({
    chatAutoModelSelection: true,
  }),
}));

import {
  handleChatWithRouter,
  handleStreamWithRouter,
} from "./services/llmRoutesHandler";

beforeEach(() => {
  vi.clearAllMocks();
  mockIsModelFree.mockResolvedValue(false);
  mockDeductCreditsForModel.mockResolvedValue({
    creditsUsed: 1,
    wasFree: false,
  });
  mockResolveChatModelSelection.mockResolvedValue({
    selectionMode: "explicit",
    selection: { mode: "explicit", modelId: "gpt-4o", providerId: null },
    requestedModelId: "gpt-4o",
    resolvedModelId: "gpt-4o",
    resolvedProviderId: undefined,
    resolvedProviderName: undefined,
    preferredProviderId: undefined,
    strictProviderPin: false,
    routeFamily: "chat-completions",
    requirements: {},
    continuityApplied: false,
    shouldPersistSelectionState: true,
  });
  mockExecuteChatThroughInferenceGateway.mockResolvedValue({
    status: "blocked",
    reason: "ACTIVE_ROLLOUT_MISSING",
  });
  mockGetConversationById.mockResolvedValue(undefined);
  mockCreateMessage.mockResolvedValue({ id: 501 });
  mockUpdateConversationCredits.mockResolvedValue(undefined);
  mockFindInferenceAssistantMessage.mockResolvedValue(null);
  mockDeliverSettledInferenceChatResponseForKey.mockResolvedValue("not_found");
  mockCreateInferenceAssistantMessageOnce.mockResolvedValue({
    message: { id: 501 },
    created: true,
  });
});

// --- Mock Express helpers ---

function mockRes() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
  return res;
}

// --- JSON Endpoint ---

describe("handleChatWithRouter", () => {
  it("routes a resolved database model lock through Spec 231", async () => {
    mockResolveChatModelSelection.mockResolvedValue({
      selectionMode: "explicit",
      selection: { mode: "explicit", modelId: "gpt-4o", providerId: 18 },
      resolvedModelId: "gpt-4o",
      resolvedProviderId: 18,
      resolvedModelMappingId: 42,
      strictProviderPin: true,
      routeFamily: "chat-completions",
      requirements: {},
      continuityApplied: false,
      shouldPersistSelectionState: true,
    });
    mockExecuteChatThroughInferenceGateway.mockResolvedValue({
      status: "blocked",
      reason: "EXPLICIT_MODEL_NOT_CERTIFIED",
    });
    const res = mockRes();

    await handleChatWithRouter({
      messages: [{ role: "user", content: "hello" }],
      userId: 7,
      tenantId: "tenant-1",
      res,
    });

    expect(mockExecuteChatThroughInferenceGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: { mode: "explicit", modelId: "gpt-4o", providerId: 18 },
        resolvedModelMappingId: 42,
        resolvedProviderId: 18,
      })
    );
    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });

  it("fails closed without an active Spec 231 rollout instead of using legacy routing", async () => {
    mockResolveChatModelSelection.mockResolvedValue({
      selectionMode: "auto-global",
      selection: { mode: "auto-global" },
      resolvedModelId: "gpt-4o",
      strictProviderPin: false,
      routeFamily: "chat-completions",
      requirements: {},
      continuityApplied: false,
      shouldPersistSelectionState: false,
    });
    mockExecuteChatThroughInferenceGateway.mockResolvedValue({
      status: "blocked",
      reason: "ACTIVE_ROLLOUT_MISSING",
    });
    const res = mockRes();

    await handleChatWithRouter({
      messages: [{ role: "user", content: "hello" }],
      userId: 7,
      tenantId: "tenant-1",
      res,
    });

    expect(mockExecuteChatThroughInferenceGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        tenantId: "tenant-1",
        stream: false,
        selection: { mode: "auto-global" },
      })
    );
    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });

  it("returns the existing in-flight attempt receipt for a duplicate request", async () => {
    mockResolveChatModelSelection.mockResolvedValue({
      selectionMode: "auto-global",
      selection: { mode: "auto-global" },
      resolvedModelId: "gpt-4o",
      strictProviderPin: false,
      routeFamily: "chat-completions",
      requirements: {},
      continuityApplied: false,
      shouldPersistSelectionState: false,
    });
    mockExecuteChatThroughInferenceGateway.mockResolvedValue({
      status: "executed",
      result: {
        execution: {
          status: "duplicate_attempt",
          attemptId: "attempt-existing",
          existingStatus: "submitting",
        },
      },
      creditsReserved: 2,
    });
    const res = mockRes();

    await handleChatWithRouter({
      messages: [{ role: "user", content: "hello" }],
      userId: 7,
      tenantId: "tenant-1",
      idempotencyKey: "same-request",
      res,
    });

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({
      inference: {
        status: "in_progress",
        attemptId: "attempt-existing",
        attemptStatus: "submitting",
      },
    });
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });

  it("does not claim a terminal duplicate can replay a response that is not stored", async () => {
    mockResolveChatModelSelection.mockResolvedValue({
      selectionMode: "auto-global",
      selection: { mode: "auto-global" },
      resolvedModelId: "gpt-4o",
      strictProviderPin: false,
      routeFamily: "chat-completions",
      requirements: {},
      continuityApplied: false,
      shouldPersistSelectionState: false,
    });
    mockExecuteChatThroughInferenceGateway.mockResolvedValue({
      status: "executed",
      result: {
        execution: {
          status: "duplicate_attempt",
          attemptId: "attempt-terminal",
          existingStatus: "terminal",
        },
      },
      creditsReserved: 2,
    });
    const res = mockRes();

    await handleChatWithRouter({
      messages: [{ role: "user", content: "hello" }],
      userId: 7,
      tenantId: "tenant-1",
      idempotencyKey: "same-request",
      res,
    });

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "INFERENCE_ATTEMPT_ALREADY_TERMINAL",
          attemptId: "attempt-terminal",
        }),
      })
    );
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });

  it("returns JSON response on success", async () => {
    const responseData = {
      choices: [{ message: { content: "Hello" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    };
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: responseData,
      providerId: 1,
    });

    const res = mockRes();
    await handleChatWithRouter({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      userId: 1,
      res,
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ choices: expect.any(Array) })
    );
  });

  it("returns fallback_required JSON when tier crossing", async () => {
    mockExecuteWithFallback.mockResolvedValue({
      type: "fallback_required",
      from: { providerId: 1, providerName: "zen" },
      to: { providerId: 2, providerName: "openrouter" },
      estimatedCredits: 42,
    });

    const res = mockRes();
    await handleChatWithRouter({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      userId: 1,
      res,
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackRequired: true, estimatedCredits: 42 })
    );
  });

  it("preferredProvider is passed through to executeWithFallback", async () => {
    mockResolveChatModelSelection.mockResolvedValue({
      selectionMode: "explicit",
      selection: { mode: "explicit", modelId: "gpt-4o", providerId: 5 },
      requestedModelId: "gpt-4o",
      resolvedModelId: "gpt-4o",
      resolvedProviderId: 5,
      resolvedProviderName: "openrouter",
      preferredProviderId: 5,
      strictProviderPin: false,
      routeFamily: "chat-completions",
      requirements: {},
      continuityApplied: false,
      shouldPersistSelectionState: true,
    });
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: { choices: [{ message: { content: "OK" } }] },
      providerId: 5,
    });

    const res = mockRes();
    await handleChatWithRouter({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      userId: 1,
      preferredProvider: 5,
      res,
    });

    expect(mockExecuteWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ preferredProvider: 5 })
    );
  });

  it("passes tenant auto-selection flag state through to the resolver", async () => {
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [{ message: { content: "OK" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      },
      providerId: 1,
    });

    const { getTenantFeatureFlags } =
      await import("./services/tenantFeatureFlagService");
    vi.mocked(getTenantFeatureFlags).mockResolvedValueOnce({
      chatAutoModelSelection: false,
    } as any);

    const res = mockRes();
    await handleChatWithRouter({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      userId: 1,
      tenantId: "tenant-1",
      res,
    });

    expect(mockResolveChatModelSelection).toHaveBeenCalledWith(
      expect.objectContaining({ autoSelectionEnabled: false })
    );
  });

  it("returns error on failure", async () => {
    mockExecuteWithFallback.mockResolvedValue({
      type: "error",
      error: "All down",
      statusCode: 502,
    });

    const res = mockRes();
    await handleChatWithRouter({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      userId: 1,
      res,
    });

    expect(res.status).toHaveBeenCalledWith(502);
  });

  it("credit deduction called after success", async () => {
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [{ message: { content: "Hello" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
      providerId: 1,
    });

    const res = mockRes();
    await handleChatWithRouter({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      userId: 1,
      res,
    });

    expect(mockDeductCreditsForModel).toHaveBeenCalled();
  });

  it("free model deduction is 0 credits", async () => {
    mockIsModelFree.mockResolvedValue(true);
    mockDeductCreditsForModel.mockResolvedValue({
      creditsUsed: 0,
      wasFree: true,
    });
    mockResolveChatModelSelection.mockResolvedValue({
      selectionMode: "explicit",
      selection: { mode: "explicit", modelId: "kimi-k2.5", providerId: null },
      requestedModelId: "kimi-k2.5",
      resolvedModelId: "kimi-k2.5",
      resolvedProviderId: undefined,
      resolvedProviderName: undefined,
      preferredProviderId: undefined,
      strictProviderPin: false,
      routeFamily: "chat-completions",
      requirements: {},
      continuityApplied: false,
      shouldPersistSelectionState: true,
    });
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [{ message: { content: "Hello" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
      providerId: 1,
    });

    const res = mockRes();
    await handleChatWithRouter({
      model: "kimi-k2.5",
      messages: [{ role: "user", content: "Hi" }],
      userId: 1,
      res,
    });

    expect(mockDeductCreditsForModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: "kimi-k2.5" })
    );
  });
});

// --- Streaming Endpoint ---

describe("handleStreamWithRouter", () => {
  it("does not fall back to legacy routing when the active consumer requires the policy gateway", async () => {
    mockResolveChatModelSelection.mockResolvedValue({
      selectionMode: "explicit",
      selection: { mode: "explicit", modelId: "legacy-model", providerId: null },
      resolvedModelId: "legacy-model",
      resolvedProviderId: undefined,
      resolvedModelMappingId: undefined,
      strictProviderPin: false,
      routeFamily: "chat-completions",
      requirements: {},
      continuityApplied: false,
      shouldPersistSelectionState: false,
    });
    const res = mockRes();

    await handleStreamWithRouter({
      model: "legacy-model",
      messages: [{ role: "user", content: "hello" }],
      userId: 7,
      tenantId: "tenant-1",
      requirePolicyGateway: true,
      res,
    });

    expect(mockExecuteChatThroughInferenceGateway).toHaveBeenCalledOnce();
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining("ACTIVE_ROLLOUT_MISSING"));
  });

  it("persists policy-routed assistant output and emits Chat-compatible SSE events", async () => {
    mockResolveChatModelSelection.mockResolvedValue({
      selectionMode: "auto-global",
      selection: { mode: "auto-global" },
      resolvedModelId: "gpt-4o",
      strictProviderPin: false,
      routeFamily: "chat-completions",
      requirements: {},
      continuityApplied: false,
      shouldPersistSelectionState: false,
    });
    mockGetConversationById.mockResolvedValue({ id: 31, skillSettings: {} });
    mockExecuteChatThroughInferenceGateway.mockResolvedValue({
      status: "executed",
      result: {
        planning: { planId: "plan-1", selectedDeploymentId: "deployment-1" },
        execution: {
          status: "completed",
          response: {
            id: "provider-response-1",
            model: "gpt-4o",
            choices: [{ message: { content: "Routed answer" } }],
          },
          receipt: {
            chargedCostMicros: 1200,
            usage: { input: 11, output: 7 },
          },
        },
      },
    });

    const res = mockRes();
    await handleStreamWithRouter({
      messages: [{ role: "user", content: "hello" }],
      userId: 7,
      tenantId: "tenant-1",
      conversationId: 31,
      idempotencyKey: "client-request-31",
      res,
    });

    expect(mockExecuteChatThroughInferenceGateway).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 31,
      idempotencyKey: expect.any(String),
    }));

    expect(mockCreateInferenceAssistantMessageOnce).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      userId: 7,
      message: expect.objectContaining({
        conversationId: 31,
        role: "assistant",
        content: "Routed answer",
        inputTokens: 11,
        outputTokens: 7,
      }),
    }));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"delta":{"content":"Routed answer"}'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: message_complete'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"content":"Routed answer"'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: message_saved'));
  });

  it("replays the saved assistant message without calling the inference gateway", async () => {
    mockGetConversationById.mockResolvedValue({ id: 31, skillSettings: {} });
    mockFindInferenceAssistantMessage.mockResolvedValue({
      id: 501,
      content: "Previously completed answer",
      inputTokens: 8,
      outputTokens: 5,
      creditsUsed: "2.0000",
      modelUsed: "gpt-4o",
      runtimeMetadata: { source: "cloud", model: "gpt-4o" },
    });
    const res = mockRes();

    await handleStreamWithRouter({
      messages: [{ role: "user", content: "hello" }],
      userId: 7,
      tenantId: "tenant-1",
      conversationId: 31,
      idempotencyKey: "same-client-request",
      res,
    });

    expect(mockFindInferenceAssistantMessage).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 7,
      idempotencyKey: "same-client-request",
    });
    expect(mockDeliverSettledInferenceChatResponseForKey).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 7,
      idempotencyKey: "same-client-request",
    });
    expect(mockExecuteChatThroughInferenceGateway).not.toHaveBeenCalled();
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining("Previously completed answer"));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"replayed":true'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining("event: message_saved"));
  });

  it("routes an explicit database model through Spec 231 and does not fallback", async () => {
    mockResolveChatModelSelection.mockResolvedValue({
      selectionMode: "explicit",
      selection: { mode: "explicit", modelId: "gpt-4o", providerId: 18 },
      resolvedModelId: "gpt-4o",
      resolvedProviderId: 18,
      resolvedModelMappingId: 42,
      strictProviderPin: true,
      routeFamily: "chat-completions",
      requirements: {},
      continuityApplied: false,
      shouldPersistSelectionState: true,
    });
    mockExecuteChatThroughInferenceGateway.mockResolvedValue({
      status: "blocked",
      reason: "EXPLICIT_MODEL_NOT_CERTIFIED",
    });
    const res = mockRes();

    await handleStreamWithRouter({
      messages: [{ role: "user", content: "hello" }],
      userId: 7,
      tenantId: "tenant-1",
      res,
    });

    expect(mockExecuteChatThroughInferenceGateway).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedModelMappingId: 42 })
    );
    expect(res.write).toHaveBeenCalledWith(
      expect.stringContaining("EXPLICIT_MODEL_NOT_CERTIFIED")
    );
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });

  it("returns the existing in-flight attempt receipt as an SSE event", async () => {
    mockResolveChatModelSelection.mockResolvedValue({
      selectionMode: "auto-global",
      selection: { mode: "auto-global" },
      resolvedModelId: "gpt-4o",
      strictProviderPin: false,
      routeFamily: "chat-completions",
      requirements: {},
      continuityApplied: false,
      shouldPersistSelectionState: false,
    });
    mockExecuteChatThroughInferenceGateway.mockResolvedValue({
      status: "executed",
      result: {
        execution: {
          status: "duplicate_attempt",
          attemptId: "attempt-existing",
          existingStatus: "prepared",
        },
      },
      creditsReserved: 2,
    });
    const res = mockRes();

    await handleStreamWithRouter({
      messages: [{ role: "user", content: "hello" }],
      userId: 7,
      tenantId: "tenant-1",
      idempotencyKey: "same-request",
      res,
    });

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.write).toHaveBeenCalledWith(
      expect.stringContaining("event: inference_pending")
    );
    expect(res.write).toHaveBeenCalledWith(
      expect.stringContaining("attempt-existing")
    );
    expect(mockExecuteChatThroughInferenceGateway).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "same-request" })
    );
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });

  it("returns SSE event: fallback_required when tier crossing", async () => {
    mockExecuteWithFallback.mockResolvedValue({
      type: "fallback_required",
      from: { providerId: 1, providerName: "zen" },
      to: { providerId: 2, providerName: "openrouter" },
      estimatedCredits: 42,
    });

    const res = mockRes();
    await handleStreamWithRouter({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      userId: 1,
      res,
    });

    expect(res.write).toHaveBeenCalledWith(
      expect.stringContaining("event: fallback_required")
    );
  });

  it("returns error SSE event on failure", async () => {
    mockExecuteWithFallback.mockResolvedValue({
      type: "error",
      error: "All down",
      statusCode: 502,
    });

    const res = mockRes();
    await handleStreamWithRouter({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      userId: 1,
      res,
    });

    expect(res.write).toHaveBeenCalledWith(expect.stringContaining("error"));
    expect(res.end).toHaveBeenCalled();
  });
});
