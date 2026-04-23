import { describe, expect, it, vi } from "vitest";

vi.mock("../agentRuntime/skillRuntimeOrchestrator", () => ({
  executeSharedSkillRuntime: vi.fn(async (input: any) => {
    const legacyValue = await input.legacyExecute();
    return {
      value: legacyValue,
      runtimeRequest: { requestId: "req-team" },
      runtimeResponse: null,
      runtime: {
        selection: {
          mode: "legacy",
          engine: "legacy",
          selectionReason: "test",
          flagSnapshot: {},
          frozenAtRecommendation: "run",
          rollbackReason: null,
        },
        requestId: "req-team",
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

import { executeTeamRuntimeTurn } from "../agentRuntime/teamRuntimeOrchestrator";
import { executeSharedSkillRuntime } from "../agentRuntime/skillRuntimeOrchestrator";

describe("executeTeamRuntimeTurn", () => {
  it("forwards team runtime settings and preserves legacy output shape", async () => {
    const result = await executeTeamRuntimeTurn({
      tenantId: "tenant-a",
      userId: 42,
      objective: "Create a Songkran video",
      skillSlug: "video-prompt-engineer",
      executionPolicy: {
        modelId: "openai/gpt-4.1-mini",
        allowFreeModels: true,
        modelSource: "conversation",
      },
      contextPackRequest: {
        surface: "team",
        request: {
          channel: "team_room",
          tenantId: "tenant-a",
          userId: 42,
          userMessage: "Create a Songkran video",
          teamContext: {
            teamId: "team-1",
            roomId: "room-1",
            assistantId: "assistant-1",
            runId: "run-1",
            objective: "Create a Songkran video",
          },
        },
      } as any,
      legacyExecute: async () => ({
        success: true,
        skillId: "video-prompt-engineer",
        type: "text" as const,
        content: "legacy team content",
        inputTokens: 14,
        outputTokens: 28,
        creditsUsed: 5,
        attempts: [],
        totalDurationMs: 9,
      }),
      requestLabel: "team:test",
      roomId: "room-1",
      runId: "run-1",
    });

    expect(vi.mocked(executeSharedSkillRuntime)).toHaveBeenCalledTimes(1);
    const [call] = vi.mocked(executeSharedSkillRuntime).mock.calls;
    expect(call[0].originSurface).toBe("team");
    expect(call[0].entryPoint).toBe("team_step");
    expect(call[0].skillSlugs).toEqual(["video-prompt-engineer"]);
    expect(call[0].requestLabel).toBe("team:test");
    expect(result.value.content).toBe("legacy team content");
    expect(result.runtime.selection.mode).toBe("legacy");
  });
});

