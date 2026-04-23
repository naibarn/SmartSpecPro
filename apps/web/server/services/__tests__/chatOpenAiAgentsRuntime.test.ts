import { describe, expect, it, vi } from "vitest";

vi.mock("../agentRuntime/skillRuntimeOrchestrator", () => ({
  executeSharedSkillRuntime: vi.fn(async (input: any) => {
    const legacyValue = await input.legacyExecute();
    return {
      value: legacyValue,
      runtimeRequest: { requestId: "req-chat" },
      runtimeResponse: null,
      runtime: {
        selection: {
          mode: "legacy",
          engine: "legacy",
          selectionReason: "test",
          flagSnapshot: {},
          frozenAtRecommendation: "request",
          rollbackReason: null,
        },
        requestId: "req-chat",
        traceId: null,
        selectedSkillSlug: null,
        status: "legacy",
        diagnostics: [],
        comparison: null,
        errorCode: null,
      },
    };
  }),
  buildRuntimeModelConfig: vi.fn((input: any) => ({
    providerId: String(input.providerId ?? "auto"),
    modelId: input.modelId,
    gatewayRouteId: input.gatewayRouteId ?? null,
    resolvedGatewayModelId: input.resolvedGatewayModelId ?? input.modelId,
  })),
  extractRuntimeTextResult: vi.fn(),
}));

vi.mock("../llmRouter", () => ({
  getProviderForModel: vi.fn(),
}));

import { executeChatRuntimeTurn } from "../agentRuntime/chatRuntimeOrchestrator";
import { executeSharedSkillRuntime } from "../agentRuntime/skillRuntimeOrchestrator";

describe("executeChatRuntimeTurn", () => {
  it("forwards chat-specific runtime settings and preserves legacy output shape", async () => {
    const result = await executeChatRuntimeTurn({
      tenantId: "tenant-a",
      userId: 42,
      objective: "Draft a plan",
      skillSlug: "general-article-writer",
      executionPolicy: {
        modelId: "openai/gpt-4.1-mini",
        allowFreeModels: true,
        modelSource: "conversation",
      },
      contextPackRequest: {
        surface: "chat",
        request: {
          channel: "chat",
          tenantId: "tenant-a",
          userId: 42,
          userMessage: "Draft a plan",
          conversationContext: {
            conversationId: "conv-1",
          },
        },
      } as any,
      legacyExecute: async () => ({
        success: true,
        skillId: "general-article-writer",
        type: "text" as const,
        content: "legacy content",
        inputTokens: 11,
        outputTokens: 22,
        creditsUsed: 3,
        attempts: [],
        totalDurationMs: 5,
      }),
      requestLabel: "chat:test",
    });

    expect(vi.mocked(executeSharedSkillRuntime)).toHaveBeenCalledTimes(1);
    const [call] = vi.mocked(executeSharedSkillRuntime).mock.calls;
    expect(call[0].originSurface).toBe("chat");
    expect(call[0].entryPoint).toBe("chat_turn");
    expect(call[0].skillSlugs).toEqual(["general-article-writer"]);
    expect(call[0].requestLabel).toBe("chat:test");
    expect(result.value.content).toBe("legacy content");
    expect(result.runtime.selection.mode).toBe("legacy");
  });
});

