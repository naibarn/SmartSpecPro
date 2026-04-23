/**
 * Tests for team room → unified orchestrator wiring (section-08).
 *
 * Verifies feature flag gates delegation to executeUnified(),
 * correct UnifiedExecutionRequest shape for team_room channel,
 * and fallback to existing code on orchestrator failure.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────

const mockExecuteUnified = vi.fn();
vi.mock("../unifiedOrchestrator", () => ({
  executeUnified: (...args: unknown[]) => mockExecuteUnified(...args),
}));

const mockGetTenantFeatureFlags = vi.fn();
vi.mock("../tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: (...args: unknown[]) =>
    mockGetTenantFeatureFlags(...args),
}));

const mockExecuteSkillLlmWithFallback = vi.fn();
vi.mock("../skillModelFallback", () => ({
  executeSkillLlmWithFallback: (...args: unknown[]) =>
    mockExecuteSkillLlmWithFallback(...args),
}));

const mockGetSkillByIdAsync = vi.fn(async (skillId: string) => ({
  id: skillId || "general-article-writer",
  name:
    skillId === "video-creator"
      ? "Video Creator"
      : skillId === "image-creator"
        ? "Image Creator"
        : skillId || "General Article Writer",
  slug: skillId || "general-article-writer",
  chainTo:
    skillId === "image_prompt_engineer"
      ? "image-creator"
      : skillId === "smart-landscape-designer"
        ? "image-creator"
        : skillId === "video-prompt-engineer"
          ? "video-creator"
          : skillId === "video-storyboard-to-prompts"
            ? "video-creator"
            : skillId === "cinematic-video-createprompt"
              ? "video-creator"
              : null,
  systemPrompt:
    skillId === "cinematic-video-createprompt"
      ? "You are a cinematic video prompt director."
      : skillId === "video-prompt-engineer"
        ? "You are a video prompt engineer."
        : skillId === "video-storyboard-to-prompts"
          ? "You are a storyboard writer."
          : "You are a writer.",
  executionMode: "llm-only",
  executionPolicy: null,
}));

const mockClassifyIntent = vi.fn();
vi.mock("../skillIntentClassifier", () => ({
  classifyIntent: (...args: unknown[]) => mockClassifyIntent(...args),
}));

const mockRouteRoomIntent = vi.fn();
vi.mock("../roomIntentRouter", () => ({
  routeRoomIntent: (...args: unknown[]) => mockRouteRoomIntent(...args),
}));

const mockAgencyBridgeExecuteRun = vi.fn();
vi.mock("../agencyBridge", () => ({
  agencyBridge: {
    executeRun: (...args: unknown[]) => mockAgencyBridgeExecuteRun(...args),
  },
}));

const mockGetTeam = vi.fn();
vi.mock("../teamService", () => ({
  getTeam: (...args: unknown[]) => mockGetTeam(...args),
}));

vi.mock("../skillRegistry", () => ({
  getSkillByIdAsync: (...args: unknown[]) => mockGetSkillByIdAsync(...args),
}));

vi.mock("../skillExecutionPolicy", () => ({
  resolveSkillExecutionPolicy: vi.fn().mockResolvedValue({
    modelId: "gpt-4o-mini",
    preferredProviderId: null,
    strictProviderPin: false,
  }),
}));

vi.mock("../taskPlannerMiddleware", () => ({
  runPlanner: vi.fn().mockResolvedValue(null),
  recordStepAttempt: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../promptComposer", () => ({
  composePrompt: vi.fn().mockResolvedValue({
    messages: [{ role: "user", content: "test objective" }],
  }),
}));

vi.mock("../creditService", () => ({
  calculateCreditsForLLMDynamic: vi.fn().mockResolvedValue(3),
}));

vi.mock("../monitoringService", () => ({
  recordContextEngineMetric: vi.fn().mockResolvedValue({ checkId: 1 }),
}));

vi.mock("../webSearchToolInjector", () => ({
  detectProviderFamily: vi.fn(),
  buildWebSearchParams: vi.fn(),
}));

vi.mock("../llmRouter", () => ({
  getProviderForModel: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────

import type { TeamRunSkillExecutionInput } from "../teamRunSkillExecutor";

function makeInput(
  overrides?: Partial<TeamRunSkillExecutionInput>
): TeamRunSkillExecutionInput {
  return {
    run: { id: "run-1" } as any,
    tenantId: "tenant-1",
    userId: 42,
    assistantId: "assistant-1",
    assistantContext: {
      profile: { preferredModelId: "gpt-4o", displayName: "Writer" },
      agentModel: null,
      personaContext: null,
    },
    roomId: "room-1",
    teamId: "team-1",
    objective: "Write a report about AI trends",
    route: {
      route: "skill",
      reason: "team_run_skill",
      selectedSkillId: "general-article-writer",
    },
    ...overrides,
  };
}

function makeUnifiedResult(content = "unified team response", costCredits = 3) {
  return {
    route: {
      capability: "writing.article",
      executorId: "text-skill-executor",
      reason: "team_run_skill",
    },
    result: { type: "text" as const, content },
    tokens: { input: 100, output: 200 },
    costCredits,
    creditsDeducted: 0, // team_room uses calculate_only
    modelUsed: "gpt-4o",
    skillId: "general-article-writer",
    nextSpeakerHint: "reviewer-persona",
    metadata: { traceId: "t1", success: true },
    telemetry: {
      routerVersion: "1.0.0",
      policyVersion: "1.0.0",
      executorId: "text-skill-executor",
      attempts: [],
      totalDurationMs: 500,
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe("Team Room → Unified Orchestrator Wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFeatureFlags.mockResolvedValue({
      unifiedSkillExecution: false,
    });
    mockExecuteSkillLlmWithFallback.mockResolvedValue({
      success: true,
      content: "fallback content [NEXT: reviewer]",
      modelId: "gpt-4o-mini",
      inputTokens: 50,
      outputTokens: 100,
      attempts: [],
    });
    mockClassifyIntent.mockResolvedValue({
      level: "simple",
      strategy: "single",
      reasoning: "best match",
      skills: [
        {
          skillId: "video-producer",
          confidence: 0.91,
          reason: "video objective",
          extractedParams: {},
          missingRequiredParams: [],
        },
      ],
    });
    mockRouteRoomIntent.mockResolvedValue({
      route: "skill",
      reason: "auto_fallback",
      selectedSkillId: "business-article-writer",
      confidence: 0.6,
      source: "rules",
    });
    mockGetTeam.mockResolvedValue({
      agencyId: "agency-creative-1",
    });
    mockAgencyBridgeExecuteRun.mockResolvedValue({
      runId: "agency-run-1",
      status: "completed",
      response: "Agency swarm response",
      creditsUsed: 9,
      durationMs: 1200,
      stepAttemptSnapshots: [],
      structuredResult: {
        version: "1",
        intent: "complex_task",
        summary: "Agency swarm summary",
        payload: {},
        artifacts: [],
        references: [],
        metrics: {},
      },
      previewArtifacts: [],
      hybridSummary: null,
    });
  });

  it("flag=false — uses existing code, orchestrator NOT called", async () => {
    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(makeInput());

    expect(mockExecuteUnified).not.toHaveBeenCalled();
    expect(result.content).toBeDefined();
    expect(result.skillId).toBe("general-article-writer");
  });

  it("flag=true — delegates to orchestrator with correct request shape", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      unifiedSkillExecution: true,
    });
    mockExecuteUnified.mockResolvedValue(makeUnifiedResult());

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(makeInput());

    expect(mockExecuteUnified).toHaveBeenCalledTimes(1);
    const req = mockExecuteUnified.mock.calls[0][0];
    expect(req.channel).toBe("team_room");
    expect(req.creditMode).toBe("calculate_only");
    expect(req.userId).toBe(42);
    expect(req.tenantId).toBe("tenant-1");
    expect(req.userMessage).toBe("Write a report about AI trends");
  });

  it("flag=true — teamContext populated correctly from input", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      unifiedSkillExecution: true,
    });
    mockExecuteUnified.mockResolvedValue(makeUnifiedResult());

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    await executeTeamRunSkillTurn(makeInput());

    const req = mockExecuteUnified.mock.calls[0][0];
    expect(req.teamContext).toEqual({
      assistantId: "assistant-1",
      roomId: "room-1",
      teamId: "team-1",
      runId: "run-1",
      objective: "Write a report about AI trends",
      initiatedByUserId: 42,
      currentMessage: "Write a report about AI trends",
    });
  });

  it("flag=true — nextSpeakerHint forwarded from result", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      unifiedSkillExecution: true,
    });
    mockExecuteUnified.mockResolvedValue(makeUnifiedResult());

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(makeInput());

    expect(result.nextSpeakerHint).toBe("reviewer-persona");
  });

  it("flag=true, orchestrator throws — falls back to existing path", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      unifiedSkillExecution: true,
    });
    mockExecuteUnified.mockRejectedValue(new Error("orchestrator failure"));

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(makeInput());

    // Should fall back to existing path
    expect(mockExecuteSkillLlmWithFallback).toHaveBeenCalled();
    expect(result.content).toBeDefined();
  });

  it("flag=true — result mapped to TeamRunSkillExecutionResult shape", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      unifiedSkillExecution: true,
    });
    mockExecuteUnified.mockResolvedValue(
      makeUnifiedResult("AI trends report", 5)
    );

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(makeInput());

    expect(result.content).toBe("AI trends report");
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(200);
    expect(result.costCredits).toBe(5);
    expect(result.skillId).toBe("general-article-writer");
    expect(result.metadata).toHaveProperty("unifiedPath", true);
  });

  it("flag=true — orchestrator error result surfaces an error", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      unifiedSkillExecution: true,
    });
    mockExecuteUnified.mockResolvedValue({
      ...makeUnifiedResult(),
      route: {
        capability: "writing.article",
        executorId: "unknown",
        reason: "orchestrator_error",
      },
      result: { type: "text", content: "" },
      metadata: { error: "skill_resolution_failed" },
    });

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    await expect(executeTeamRunSkillTurn(makeInput())).rejects.toThrow(
      "Orchestrator error: orchestrator_error"
    );
  });

  it("skill-orchestrator input for a video objective is routed to a video prompt skill before execution", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce({
      success: true,
      content:
        "Prompt: cinematic Songkran video, warm golden light, lively water festival, cinematic camera moves",
      modelId: "gpt-4o-mini",
      inputTokens: 50,
      outputTokens: 100,
      attempts: [],
    });
    mockExecuteUnified.mockResolvedValueOnce({
      route: {
        capability: "media.video",
        executorId: "video-generation-executor",
        reason: "auto_team_media_chain:video-prompt-engineer->video-creator",
      },
      result: {
        type: "media_job" as const,
        mediaType: "video" as const,
        jobPayload: {
          taskId: "video-task-1",
          resultUrl: "https://example.com/video-task-1",
        },
      },
      tokens: { input: 20, output: 10 },
      costCredits: 8,
      creditsDeducted: 8,
      modelUsed: "veo-3-1",
      skillId: "video-creator",
      nextSpeakerHint: "done",
      metadata: { traceId: "t3", success: true },
      telemetry: {
        routerVersion: "1.0.0",
        policyVersion: "1.0.0",
        executorId: "video-generation-executor",
        attempts: [],
        totalDurationMs: 220,
      },
    });

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");

    const result = await executeTeamRunSkillTurn(
      makeInput({
        route: {
          route: "skill",
          reason: "auto_team_orchestrator",
          selectedSkillId: "skill-orchestrator",
        },
        objective: "Create a 24-30 second video about Songkran 2569",
      })
    );

    expect(mockClassifyIntent).not.toHaveBeenCalled();
    expect(mockRouteRoomIntent).toHaveBeenCalledOnce();
    expect(mockExecuteSkillLlmWithFallback).toHaveBeenCalledTimes(1);
    expect(mockExecuteSkillLlmWithFallback.mock.calls[0][0].skillSlug).toBe(
      "video-prompt-engineer"
    );
    expect(mockExecuteUnified).toHaveBeenCalledTimes(1);
    expect(result.skillId).toBe("video-creator");
    expect(result.content).toContain("Video Creator finished video generation");
    expect(result.metadata).toMatchObject({
      routeReason: "auto_team_video:video-prompt-engineer",
      promptSkillId: "video-prompt-engineer",
      selectedSkillId: "video-creator",
    });
  });

  it("auto-team plan steps route research work to the article writer instead of the video chain", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce({
      success: true,
      content:
        "Research summary: Songkran blends ritual renewal, family visits, and public celebration.",
      modelId: "gpt-4o-mini",
      inputTokens: 50,
      outputTokens: 100,
      attempts: [],
    });

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(
      makeInput({
        route: {
          route: "skill",
          reason: "auto_team_orchestrator",
          selectedSkillId: "skill-orchestrator",
        },
        objective:
          "ต้องการสร้างวีดีโอ ความยาวในช่วง 24 - 30 วินาที เกี่ยวกับสงกรานต์ปี 2569",
        dynamicParams: {
          contextState: {
            projectState: {
              steps: [
                {
                  stepKey: "research-cultural-direction",
                  title: "ค้นคว้าและกำหนดทิศทางวัฒนธรรม",
                  objective:
                    "รวบรวมข้อเท็จจริงและกรอบเรื่องเล่าเกี่ยวกับสงกรานต์จากอดีตถึงปัจจุบัน",
                  deliverable: "สรุปทิศทางเนื้อหา 1 หน้า",
                  status: "planned",
                },
              ],
            },
          },
        } as any,
      })
    );

    expect(mockExecuteSkillLlmWithFallback).toHaveBeenCalled();
    expect(mockGetSkillByIdAsync).toHaveBeenCalledWith(
      "general-article-writer"
    );
    expect(result.skillId).toBe("general-article-writer");
    expect(result.content).toContain("Research summary");
  });

  it("auto-team approved-plan steps honor an explicit agency surface before heuristics", async () => {
    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(
      makeInput({
        route: {
          route: "skill",
          reason: "auto_team_orchestrator",
          selectedSkillId: "skill-orchestrator",
        },
        objective: "Review alternatives and coordinate the next execution step",
        dynamicParams: {
          contextState: {
            projectState: {
              steps: [
                {
                  stepKey: "agency-evaluation",
                  title: "Agency evaluation",
                  objective: "Coordinate multiple approaches and compare them",
                  deliverable: "Ranked options",
                  surface: "agency",
                  status: "planned",
                },
              ],
            },
          },
        } as any,
      })
    );

    expect(mockRouteRoomIntent).not.toHaveBeenCalled();
    expect(mockClassifyIntent).not.toHaveBeenCalled();
    expect(mockAgencyBridgeExecuteRun).toHaveBeenCalledOnce();
    expect(result.skillId).toBe("agency-swarm");
    expect(result.metadata).toMatchObject({
      route: "agency",
      routeReason: "auto_team_plan_surface:agency-evaluation",
      selectedSkillId: "agency-swarm",
    });
  });

  it("skill-orchestrator input for an image objective chains into image generation", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce({
      success: true,
      content:
        "Prompt: scenic Songkran image, vibrant colors, wet reflections, cinematic composition",
      modelId: "gpt-4o-mini",
      inputTokens: 42,
      outputTokens: 84,
      attempts: [],
    });
    mockExecuteUnified.mockResolvedValueOnce({
      route: {
        capability: "media.image",
        executorId: "image-generation-executor",
        reason: "auto_team_media_chain:image_prompt_engineer->image-creator",
      },
      result: {
        type: "media_job" as const,
        mediaType: "image" as const,
        jobPayload: {
          taskId: "image-task-1",
          resultUrl: "https://example.com/image-task-1",
        },
      },
      tokens: { input: 10, output: 5 },
      costCredits: 4,
      creditsDeducted: 4,
      modelUsed: "gpt-4o-image",
      skillId: "image-creator",
      nextSpeakerHint: "done",
      metadata: { traceId: "i3", success: true },
      telemetry: {
        routerVersion: "1.0.0",
        policyVersion: "1.0.0",
        executorId: "image-generation-executor",
        attempts: [],
        totalDurationMs: 180,
      },
    });

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(
      makeInput({
        route: {
          route: "skill",
          reason: "auto_team_orchestrator",
          selectedSkillId: "skill-orchestrator",
        },
        objective: "Create a poster image for Songkran 2569",
      })
    );

    expect(mockExecuteSkillLlmWithFallback).toHaveBeenCalledTimes(1);
    expect(mockExecuteSkillLlmWithFallback.mock.calls[0][0].skillSlug).toBe(
      "image_prompt_engineer"
    );
    expect(mockExecuteUnified).toHaveBeenCalledTimes(1);
    expect(result.skillId).toBe("image-creator");
    expect(result.content).toContain("Image Creator finished image generation");
    expect(result.metadata).toMatchObject({
      routeReason: "auto_team_image:image_prompt_engineer",
      promptSkillId: "image_prompt_engineer",
      selectedSkillId: "image-creator",
    });
  });

  it("skill-orchestrator input for a complex objective routes to Agency swarm", async () => {
    mockRouteRoomIntent.mockResolvedValueOnce({
      route: "agency",
      reason: "classifier_complex:agent",
      confidence: 0.91,
      source: "classifier",
      agencyEscalation: true,
    });

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(
      makeInput({
        route: {
          route: "skill",
          reason: "auto_team_orchestrator",
          selectedSkillId: "skill-orchestrator",
        },
        objective:
          "Plan a complex multi-step campaign with research, alternatives, and execution plan",
      })
    );

    expect(mockClassifyIntent).not.toHaveBeenCalled();
    expect(mockGetSkillByIdAsync).not.toHaveBeenCalledWith(
      expect.stringContaining("article")
    );
    expect(mockAgencyBridgeExecuteRun).toHaveBeenCalledOnce();
    expect(mockGetTeam).toHaveBeenCalledWith("team-1", "tenant-1");
    expect(result.skillId).toBe("agency-swarm");
    expect(result.content).toBe("Agency swarm response");
    expect(result.metadata).toMatchObject({
      route: "agency",
      routeReason: "auto_team_orchestrator_agency:classifier_complex:agent",
      selectedSkillId: "agency-swarm",
      agencyId: "agency-creative-1",
      agencyRunId: "agency-run-1",
    });
  });
});
