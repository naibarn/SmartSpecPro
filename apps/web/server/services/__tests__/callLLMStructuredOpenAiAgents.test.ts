import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const {
  mockExecuteWithFallback,
  mockResolveProviders,
  mockDeductCreditsForModel,
  mockRunPlanner,
  mockRecordStepAttempt,
  mockResolveStructuredAutoChatModelSelection,
  mockBuildRuntimeModelConfig,
  mockExecuteSharedSkillRuntime,
  mockExecuteResponsesRuntimeTurn,
} = vi.hoisted(() => ({
  mockExecuteWithFallback: vi.fn(),
  mockResolveProviders: vi.fn(),
  mockDeductCreditsForModel: vi.fn(),
  mockRunPlanner: vi.fn(),
  mockRecordStepAttempt: vi.fn(),
  mockResolveStructuredAutoChatModelSelection: vi.fn(),
  mockBuildRuntimeModelConfig: vi.fn(input => ({
    providerId: String(input.providerId ?? "auto"),
    modelId: input.modelId,
    gatewayRouteId: input.gatewayRouteId ?? null,
    resolvedGatewayModelId: input.resolvedGatewayModelId ?? input.modelId,
  })),
  mockExecuteSharedSkillRuntime: vi.fn(),
  mockExecuteResponsesRuntimeTurn: vi.fn(),
}));

vi.mock("../llmRouter", () => ({
  executeWithFallback: mockExecuteWithFallback,
  resolveProviders: mockResolveProviders,
}));

vi.mock("../creditService", () => ({
  deductCreditsForModel: mockDeductCreditsForModel,
}));

vi.mock("../auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

vi.mock("../taskPlannerMiddleware", () => ({
  runPlanner: mockRunPlanner,
  recordStepAttempt: mockRecordStepAttempt,
}));

vi.mock("../chatModelSelection", () => ({
  resolveStructuredAutoChatModelSelection:
    mockResolveStructuredAutoChatModelSelection,
}));

vi.mock("../agentRuntime/skillRuntimeOrchestrator", () => ({
  buildRuntimeModelConfig: mockBuildRuntimeModelConfig,
  executeSharedSkillRuntime: mockExecuteSharedSkillRuntime,
}));

vi.mock("../agentRuntime/responsesRuntimeOrchestrator", () => ({
  executeResponsesRuntimeTurn: mockExecuteResponsesRuntimeTurn,
}));

import {
  callLLMStructured,
  LLMStructuredOutputError,
} from "../callLLMStructured";

const TestSchema = z.object({
  title: z.string(),
  items: z.array(z.string()),
});

const baseParams = {
  systemPrompt: "You are a structured planner.",
  userMessage: "Return the approved plan summary.",
  zodSchema: TestSchema,
  userId: 42,
  tenantId: "tenant-1",
  billingDescription: "structured_planner",
  billingMetadata: {
    workflow: "team_planning",
  },
};

function makeSuccessResponse(content: string) {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    },
    providerId: 1,
    providerName: "test-provider",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveProviders.mockResolvedValue([{ providerId: 1 }]);
  mockResolveStructuredAutoChatModelSelection.mockResolvedValue({
    selectionMode: "auto-global",
    selection: { mode: "auto-global" },
    requestedModelId: null,
    resolvedModelId: "openai/gpt-4.1-mini",
    resolvedProviderId: 1,
    resolvedProviderName: "openrouter",
    preferredProviderId: 1,
    strictProviderPin: false,
    routeFamily: "chat-completions",
    requirements: { supportsStructuredOutputs: true },
    continuityApplied: false,
    shouldPersistSelectionState: false,
  });
  mockDeductCreditsForModel.mockResolvedValue({
    creditsUsed: 5,
    wasFree: false,
  });
  mockRunPlanner.mockResolvedValue(null);
  mockRecordStepAttempt.mockResolvedValue(undefined);
});

describe("callLLMStructured OpenAI Agents integration", () => {
  it("keeps the legacy execution path unchanged when runtimeOptions are not provided", async () => {
    mockExecuteWithFallback.mockResolvedValue(
      makeSuccessResponse(JSON.stringify({ title: "Legacy", items: ["one"] })),
    );

    const result = await callLLMStructured(baseParams);

    expect(result.data).toEqual({
      title: "Legacy",
      items: ["one"],
    });
    expect(mockExecuteSharedSkillRuntime).not.toHaveBeenCalled();
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(1);
  });

  it("routes typed structured output through the shared runtime and validates the runtime payload", async () => {
    mockExecuteSharedSkillRuntime.mockImplementation(async input => {
      const value = await input.activeTransform({
        finalOutput: {
          data: {
            title: "Runtime",
            items: ["alpha", "beta"],
          },
          usage: {
            promptTokens: 11,
            completionTokens: 7,
          },
          creditsUsed: 3,
          providerName: "openrouter",
          modelId: "openai/gpt-4.1-mini",
        },
        providerId: "1",
        modelId: "openai/gpt-4.1-mini",
        resolvedGatewayModelId: "openai/gpt-4.1-mini",
      });

      return {
        value,
        runtime: {
          selection: {
            engine: "openai_agents",
            mode: "active",
            selectionReason: "tenant_flags_active",
            flagSnapshot: {} as any,
            frozenAtRecommendation: "request",
            rollbackReason: null,
            originSurface: "workflow",
            entryPoint: "system",
          },
          requestId: "req-structured-runtime-1",
          traceId: "trace-structured-runtime-1",
          selectedSkillSlug: "brainstorm",
          status: "completed",
          diagnostics: [],
          comparison: null,
          errorCode: null,
        },
        runtimeRequest: null,
        runtimeResponse: null,
      };
    });

    const result = await callLLMStructured({
      ...baseParams,
      runtimeOptions: {
        skillSlugs: ["brainstorm"],
        originSurface: "workflow",
        entryPoint: "system",
        objective: "Produce the locked plan artifact.",
        requestLabel: "team_plan_locked",
      },
    });

    expect(result).toEqual({
      data: {
        title: "Runtime",
        items: ["alpha", "beta"],
      },
      tokensUsed: 18,
      creditsUsed: 3,
      providerName: "openrouter",
      modelId: "openai/gpt-4.1-mini",
    });
    expect(mockBuildRuntimeModelConfig).toHaveBeenCalledWith({
      modelId: "openai/gpt-4.1-mini",
      providerId: 1,
      gatewayRouteId: "chat-completions",
      resolvedGatewayModelId: "openai/gpt-4.1-mini",
    });
    expect(mockExecuteSharedSkillRuntime).toHaveBeenCalledTimes(1);
    expect(mockExecuteSharedSkillRuntime.mock.calls[0][0]).toMatchObject({
      tenantId: "tenant-1",
      userId: 42,
      objective: "Produce the locked plan artifact.",
      originSurface: "workflow",
      entryPoint: "system",
      skillSlugs: ["brainstorm"],
      requestLabel: "team_plan_locked",
      schemaHint: {
        name: "structured_output",
        requiredFields: ["title", "items"],
        validationMode: "structured_json",
      },
    });
  });

  it("routes responses-call structured output through executeResponsesRuntimeTurn and validates the runtime payload", async () => {
    mockExecuteResponsesRuntimeTurn.mockImplementation(async input => ({
      value: {
        success: true,
        skillId: input.skillSlug,
        type: "text",
        content: JSON.stringify({
          title: "Responses Runtime",
          items: ["alpha", "beta"],
        }),
        modelId: "openai/gpt-4.1-mini",
        provider: {
          providerId: 1,
          providerName: "openrouter",
          baseUrl: "https://api.openrouter.com",
          apiKey: "redacted",
          providerModelId: "openai/gpt-4.1-mini",
          apiStyle: "responses",
          supportsResponses: true,
          pricingInput: 0,
          pricingOutput: 0,
          isFree: false,
          priority: 0,
        },
        inputTokens: 22,
        outputTokens: 8,
        creditsUsed: 4,
        attempts: [],
        totalDurationMs: 12,
      },
      runtime: {
        selection: {
          engine: "openai_agents",
          mode: "active",
          selectionReason: "tenant_flags_active",
          flagSnapshot: {} as any,
          frozenAtRecommendation: "request",
          rollbackReason: null,
          originSurface: "responses",
          entryPoint: "responses_call",
        },
        requestId: "req-responses-runtime-1",
        traceId: "trace-responses-runtime-1",
        selectedSkillSlug: input.skillSlug,
        status: "completed",
        diagnostics: [],
        comparison: null,
        errorCode: null,
      },
      runtimeRequest: null,
      runtimeResponse: null,
    }));

    const result = await callLLMStructured({
      ...baseParams,
      runtimeOptions: {
        skillSlugs: ["editorial-layout-planner"],
        originSurface: "responses",
        entryPoint: "responses_call",
        objective: "Produce the structured response payload.",
        requestLabel: "responses_structured_runtime",
      },
    });

    expect(result).toEqual({
      data: {
        title: "Responses Runtime",
        items: ["alpha", "beta"],
      },
      tokensUsed: 30,
      creditsUsed: 4,
      providerName: "openrouter",
      modelId: "openai/gpt-4.1-mini",
    });
    expect(mockExecuteResponsesRuntimeTurn).toHaveBeenCalledTimes(1);
    expect(mockExecuteSharedSkillRuntime).not.toHaveBeenCalled();
    expect(mockExecuteResponsesRuntimeTurn.mock.calls[0][0]).toMatchObject({
      tenantId: "tenant-1",
      userId: 42,
      objective: "Produce the structured response payload.",
      skillSlug: "editorial-layout-planner",
      requestLabel: "responses_structured_runtime",
    });
  });

  it("fails closed when the runtime returns schema-invalid structured output", async () => {
    mockExecuteSharedSkillRuntime.mockImplementation(async input => {
      const value = await input.activeTransform({
        finalOutput: {
          data: {
            wrong: "shape",
          },
        },
        providerId: "1",
        modelId: "openai/gpt-4.1-mini",
        resolvedGatewayModelId: "openai/gpt-4.1-mini",
      });

      return {
        value,
        runtime: null,
        runtimeRequest: null,
        runtimeResponse: null,
      };
    });

    await expect(
      callLLMStructured({
        ...baseParams,
        runtimeOptions: {
          skillSlugs: ["brainstorm"],
          originSurface: "workflow",
          entryPoint: "system",
        },
      }),
    ).rejects.toBeInstanceOf(LLMStructuredOutputError);
  });
});
