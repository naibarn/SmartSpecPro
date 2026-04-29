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

const mockRegisterAutoTeamMediaArtifact = vi.fn();
const mockGetAutoTeamStoryboardImageUrls = vi.fn(async () => []);
const mockGetAutoTeamStoryboardAssetState = vi.fn(async () => ({
  urls: [],
  pendingImageTaskCount: 0,
  failedImageTaskCount: 0,
  hasPipeline: false,
}));
vi.mock("../autoTeamMediaCompletionService", () => ({
  getAutoTeamStoryboardAssetState: (...args: unknown[]) =>
    mockGetAutoTeamStoryboardAssetState(...args),
  getAutoTeamStoryboardImageUrls: (...args: unknown[]) =>
    mockGetAutoTeamStoryboardImageUrls(...args),
  registerAutoTeamMediaArtifact: (...args: unknown[]) =>
    Promise.resolve(mockRegisterAutoTeamMediaArtifact(...args)),
  resolveAutoTeamClipPlan: (input: {
    objective: string;
    durationSeconds?: number;
    requestedClipCount?: number;
  }) => {
    const durationSeconds = input.durationSeconds ?? 10;
    const targetDurationSeconds = /24-30/.test(input.objective)
      ? 30
      : /60/.test(input.objective)
        ? 60
        : 60;
    const clipCount =
      input.requestedClipCount ?? Math.ceil(targetDurationSeconds / durationSeconds);
    return { targetDurationSeconds, durationSeconds, clipCount };
  },
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
      : skillId === "veo-video-creator"
        ? "VEO Video Creator"
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

const mockAgencyAuthorizationRows = vi.fn();
const mockAgencySharedPermissionRows = vi.fn();
const mockDbSelect = vi.fn(() => {
  const joinedChain: any = {
    innerJoin: vi.fn(() => joinedChain),
    where: vi.fn(() => ({
      limit: (...args: unknown[]) => mockAgencySharedPermissionRows(...args),
    })),
  };
  return {
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => joinedChain),
      where: vi.fn(() => ({
        limit: (...args: unknown[]) => mockAgencyAuthorizationRows(...args),
      })),
    })),
  };
});
vi.mock("../../db", () => ({
  getDb: vi.fn(async () => ({
    select: mockDbSelect,
  })),
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
    mockAgencyAuthorizationRows.mockResolvedValue([
      {
        id: "agency-specialized-1",
        tenantId: "tenant-1",
        status: "published",
        isPublished: true,
        visibility: "public",
        createdBy: 42,
      },
    ]);
    mockAgencySharedPermissionRows.mockResolvedValue([]);
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
    mockExecuteUnified.mockResolvedValue({
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
    expect(mockExecuteUnified).toHaveBeenCalledTimes(3);
    expect(result.skillId).toBe("video-creator");
    expect(result.content).toContain("Video Creator queued 3 video clips");
    expect(result.metadata).toMatchObject({
      routeReason: "auto_team_video:video-prompt-engineer",
      promptSkillId: "video-prompt-engineer",
      selectedSkillId: "video-creator",
    });
    expect(mockRegisterAutoTeamMediaArtifact).toHaveBeenCalledTimes(3);
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

  it("auto-team media_studio plan steps chain into image generation", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce({
      success: true,
      content: "Prompt: six coherent storyboard keyframes for Songkran versus January new year",
      modelId: "gpt-4o-mini",
      inputTokens: 40,
      outputTokens: 80,
      attempts: [],
    });
    mockExecuteUnified.mockResolvedValue({
      route: {
        capability: "media.image",
        executorId: "image-generation-executor",
        reason: "auto_team_media_chain:image_prompt_engineer->image-creator",
      },
      result: {
        type: "media_job" as const,
        mediaType: "image" as const,
        jobPayload: { taskId: "storyboard-image-task" },
      },
      tokens: { input: 5, output: 0 },
      costCredits: 4,
      creditsDeducted: 4,
      modelUsed: "gpt-4o-image",
      skillId: "image-creator",
      nextSpeakerHint: "done",
      metadata: { traceId: "media-step" },
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
        objective: "Create storyboard images then videos for a 60 second result",
        dynamicParams: {
          contextState: {
            projectState: {
              steps: [
                {
                  stepKey: "media",
                  title: "Media Asset Generation",
                  objective: "Generate storyboard keyframes in Media Studio",
                  deliverable: "storyboard images",
                  surface: "media_studio",
                  selectedCapabilityId: "media_studio",
                  status: "planned",
                },
              ],
            },
          },
        } as any,
      }),
    );

    expect(mockExecuteSkillLlmWithFallback.mock.calls[0][0].skillSlug).toBe(
      "image_prompt_engineer",
    );
    expect(mockExecuteUnified).toHaveBeenCalledTimes(1);
    expect(mockExecuteUnified.mock.calls[0][0].dynamicParams).toMatchObject({
      numImages: 6,
    });
    expect(result.skillId).toBe("image-creator");
    expect(result.content).toContain("Image Creator queued image generation");
  });

  it("auto-team video_editor plan steps chain into video generation", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce({
      success: true,
      content: "Prompt: 10 second cinematic clip from the approved storyboard frame",
      modelId: "gpt-4o-mini",
      inputTokens: 40,
      outputTokens: 80,
      attempts: [],
    });
    mockExecuteUnified.mockResolvedValue({
      route: {
        capability: "media.video",
        executorId: "video-generation-executor",
        reason: "auto_team_media_chain:video-storyboard-to-prompts->video-creator",
      },
      result: {
        type: "media_job" as const,
        mediaType: "video" as const,
        jobPayload: { taskId: "storyboard-video-task" },
      },
      tokens: { input: 5, output: 0 },
      costCredits: 8,
      creditsDeducted: 8,
      modelUsed: "veo-3-1",
      skillId: "video-creator",
      nextSpeakerHint: "done",
      metadata: { traceId: "video-step" },
      telemetry: {
        routerVersion: "1.0.0",
        policyVersion: "1.0.0",
        executorId: "video-generation-executor",
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
        objective: "Create storyboard images then videos for a 60 second result",
        dynamicParams: {
          contextState: {
            projectState: {
              steps: [
                {
                  stepKey: "video",
                  title: "Video Composition",
                  objective: "Generate storyboard video clips and compose them",
                  deliverable: "video clips",
                  surface: "video_editor",
                  selectedCapabilityId: "video_editor",
                  status: "planned",
                },
              ],
            },
          },
        } as any,
      }),
    );

    expect(mockExecuteSkillLlmWithFallback.mock.calls[0][0].skillSlug).toBe(
      "video-storyboard-to-prompts",
    );
    expect(mockExecuteUnified).toHaveBeenCalledTimes(6);
    expect(mockExecuteUnified.mock.calls[0][0].dynamicParams).toMatchObject({
      duration: 10,
      __autoTeamClipIndex: 1,
      __autoTeamClipCount: 6,
    });
    expect(result.skillId).toBe("video-creator");
    expect(result.content).toContain("Video Creator queued 6 video clips");
    expect(mockRegisterAutoTeamMediaArtifact).toHaveBeenCalledTimes(6);
  });

  it("auto-team video_editor capability ids with an action suffix still chain into video generation", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce({
      success: true,
      content: "Prompt: 10 second cinematic clip from the approved storyboard frame",
      modelId: "gpt-4o-mini",
      inputTokens: 40,
      outputTokens: 80,
      attempts: [],
    });
    mockExecuteUnified.mockResolvedValue({
      route: {
        capability: "media.video",
        executorId: "video-generation-executor",
        reason: "auto_team_media_chain:video-storyboard-to-prompts->video-creator",
      },
      result: {
        type: "media_job" as const,
        mediaType: "video" as const,
        jobPayload: { taskId: "storyboard-video-task" },
      },
      tokens: { input: 5, output: 0 },
      costCredits: 8,
      creditsDeducted: 8,
      modelUsed: "veo-3-1",
      skillId: "video-creator",
      nextSpeakerHint: "done",
      metadata: { traceId: "video-step" },
      telemetry: {
        routerVersion: "1.0.0",
        policyVersion: "1.0.0",
        executorId: "video-generation-executor",
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
        objective: "Create storyboard images then videos for a 60 second result",
        dynamicParams: {
          contextState: {
            projectState: {
              steps: [
                {
                  stepKey: "final-composition",
                  title: "Final video composition",
                  objective: "Generate storyboard video clips and compose them",
                  deliverable: "final video",
                  surface: "video_editor",
                  selectedCapabilityId: "video_editor:compose",
                  status: "planned",
                },
              ],
            },
          },
        } as any,
      }),
    );

    expect(mockExecuteSkillLlmWithFallback.mock.calls[0][0].skillSlug).toBe(
      "video-storyboard-to-prompts",
    );
    expect(result.skillId).toBe("video-creator");
    expect(mockRegisterAutoTeamMediaArtifact).toHaveBeenCalledTimes(6);
  });

  it("registers direct unified video media jobs instead of returning empty content", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      unifiedSkillExecution: true,
    });
    mockExecuteUnified.mockResolvedValueOnce({
      route: {
        capability: "media.video",
        executorId: "video-generation-executor",
        reason: "team_run_skill",
      },
      result: {
        type: "media_job" as const,
        mediaType: "video" as const,
        jobPayload: {
          taskId: "direct-veo-video-task",
          status: "queued",
          model: "veo-3-1",
        },
      },
      tokens: { input: 12, output: 0 },
      costCredits: 8,
      creditsDeducted: 0,
      modelUsed: "veo-3-1",
      skillId: "veo-video-creator",
      nextSpeakerHint: "done",
      metadata: { traceId: "direct-video-step" },
      telemetry: {
        routerVersion: "1.0.0",
        policyVersion: "1.0.0",
        executorId: "video-generation-executor",
        attempts: [],
        totalDurationMs: 180,
      },
    });

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(
      makeInput({
        route: {
          route: "skill",
          reason: "auto_team_plan_step:compose-final-video",
          selectedSkillId: "veo-video-creator",
          selectedCapabilityId: "skill:veo-video-creator",
        },
        objective: "Create a 60 second final video with veo 3.1",
        dynamicParams: {
          contextState: {
            projectState: {
              steps: [
                {
                  stepKey: "compose-final-video",
                  title: "สร้างและประกอบวิดีโอสุดท้าย",
                  objective: "ใช้ veo 3.1 เพื่อสร้างวิดีโอจาก storyboard ความยาวอย่างน้อย 1 นาที",
                  deliverable: "ไฟล์วิดีโอฉบับสุดท้าย",
                  surface: "video_editor",
                  selectedCapabilityId: "skill:veo-video-creator",
                  status: "in_progress",
                },
              ],
            },
          },
        } as any,
      }),
    );

    expect(mockExecuteUnified).toHaveBeenCalledTimes(1);
    expect(result.skillId).toBe("veo-video-creator");
    expect(result.content).toContain("queued video generation");
    expect(result.content).toContain("direct-veo-video-task");
    expect(result.metadata).toMatchObject({
      selectedSkillId: "veo-video-creator",
      mediaPipelineAwaitingAssets: true,
      runtimeDispatchOutcome: "awaiting_async_assets",
      mediaJob: {
        type: "media_job",
        mediaType: "video",
      },
    });
    expect(mockRegisterAutoTeamMediaArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        roomId: "room-1",
        mediaType: "video",
        promptSkillId: "veo-video-creator",
        mediaSkillId: "veo-video-creator",
        modelId: "veo-3-1",
        clipIndex: 1,
        clipCount: 6,
      }),
    );
  });

  it("returns explicit failure content when direct media execution fails before a job is created", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      unifiedSkillExecution: true,
    });
    mockExecuteUnified.mockResolvedValueOnce({
      route: {
        capability: "media.video",
        executorId: "video-generation-executor",
        reason: "team_run_skill",
      },
      result: { type: "text" as const, content: "" },
      tokens: { input: 0, output: 0 },
      costCredits: 0,
      creditsDeducted: 0,
      modelUsed: null,
      skillId: "veo-video-creator",
      nextSpeakerHint: "done",
      metadata: {
        traceId: "direct-video-step-failed",
        success: false,
        error: "media_generation_failed",
      },
      telemetry: {
        routerVersion: "1.0.0",
        policyVersion: "1.0.0",
        executorId: "video-generation-executor",
        attempts: [],
        totalDurationMs: 180,
      },
    });

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(
      makeInput({
        route: {
          route: "skill",
          reason: "auto_team_plan_step:compose-final-video",
          selectedSkillId: "veo-video-creator",
          selectedCapabilityId: "skill:veo-video-creator",
        },
        objective: "Create a 60 second final video with veo 3.1",
      }),
    );

    expect(result.skillId).toBe("veo-video-creator");
    expect(result.content).toContain("failed before producing a result");
    expect(result.content).toContain("media_generation_failed");
    expect(result.content).not.toContain("[No response generated]");
    expect(result.metadata).toMatchObject({
      success: false,
      runtimeDispatchOutcome: "execution_failed",
      executionError: "media_generation_failed",
    });
    expect(mockRegisterAutoTeamMediaArtifact).not.toHaveBeenCalled();
  });

  it("blocks media execution when artifact registration fails", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce({
      success: true,
      content: "Prompt: 10 second storyboard clip",
      modelId: "gpt-4o-mini",
      inputTokens: 40,
      outputTokens: 80,
      attempts: [],
    });
    mockExecuteUnified.mockResolvedValue({
      route: {
        capability: "media.video",
        executorId: "video-generation-executor",
        reason: "auto_team_media_chain:video-storyboard-to-prompts->video-creator",
      },
      result: {
        type: "media_job" as const,
        mediaType: "video" as const,
        jobPayload: { taskId: "storyboard-video-task" },
      },
      tokens: { input: 5, output: 0 },
      costCredits: 8,
      creditsDeducted: 8,
      modelUsed: "veo-3-1",
      skillId: "video-creator",
      nextSpeakerHint: "done",
      metadata: { traceId: "video-step" },
      telemetry: {
        routerVersion: "1.0.0",
        policyVersion: "1.0.0",
        executorId: "video-generation-executor",
        attempts: [],
        totalDurationMs: 180,
      },
    });
    mockRegisterAutoTeamMediaArtifact.mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    await expect(
      executeTeamRunSkillTurn(
        makeInput({
          route: {
            route: "skill",
            reason: "auto_team_orchestrator",
            selectedSkillId: "skill-orchestrator",
          },
          objective: "Create storyboard images then videos for a 60 second result",
          dynamicParams: {
            contextState: {
              projectState: {
                steps: [
                  {
                    stepKey: "video",
                    title: "Video Composition",
                    objective: "Generate storyboard video clips and compose them",
                    deliverable: "video clips",
                    surface: "video_editor",
                    selectedCapabilityId: "video_editor",
                    status: "planned",
                  },
                ],
              },
            },
          } as any,
        }),
      ),
    ).rejects.toThrow(/Auto-team media artifact registration failed/);
  });

  it("preflights the full multi-clip media budget before queueing video jobs", async () => {
    const { evaluateAutoTeamMediaChainBudgetPreflight } = await import(
      "../teamRunSkillExecutor"
    );

    expect(
      evaluateAutoTeamMediaChainBudgetPreflight({
        maxBudgetCredits: 120,
        totalCreditsUsed: 20,
        promptCredits: 5,
        mediaType: "video",
        clipCount: 3,
      }),
    ).toMatchObject({
      allowed: false,
      blockedReason: "budget_cap_exceeded",
    });

    expect(
      evaluateAutoTeamMediaChainBudgetPreflight({
        maxBudgetCredits: 500,
        totalCreditsUsed: 20,
        promptCredits: 5,
        mediaType: "video",
        clipCount: 3,
      }),
    ).toMatchObject({
      allowed: true,
      blockedReason: null,
    });
  });

  it("waits for storyboard image tasks before queueing video clips", async () => {
    mockGetAutoTeamStoryboardAssetState.mockResolvedValueOnce({
      urls: [],
      pendingImageTaskCount: 2,
      failedImageTaskCount: 0,
      hasPipeline: true,
    });

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(
      makeInput({
        route: {
          route: "skill",
          reason: "auto_team_orchestrator",
          selectedSkillId: "skill-orchestrator",
        },
        objective: "Create storyboard images then videos for a 60 second result",
        dynamicParams: {
          contextState: {
            projectState: {
              steps: [
                {
                  stepKey: "video",
                  title: "Video Composition",
                  objective: "Generate storyboard video clips and compose them",
                  deliverable: "video clips",
                  surface: "video_editor",
                  selectedCapabilityId: "video_editor",
                  status: "planned",
                },
              ],
            },
          },
        } as any,
      }),
    );

    expect(result.metadata).toMatchObject({
      mediaPipelineAwaitingAssets: true,
      runtimeDispatchOutcome: "awaiting_async_assets",
    });
    expect(mockExecuteUnified).not.toHaveBeenCalled();
    expect(mockRegisterAutoTeamMediaArtifact).not.toHaveBeenCalled();
  });

  it("auto-team plan steps honor an explicit skill capability before surface defaults", async () => {
    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(
      makeInput({
        route: {
          route: "skill",
          reason: "auto_team_orchestrator",
          selectedSkillId: "skill-orchestrator",
        },
        objective: "Create a specialized video composition package",
        dynamicParams: {
          contextState: {
            projectState: {
              steps: [
                {
                  stepKey: "custom-video-step",
                  title: "Custom video composition",
                  objective: "Use the selected specialist skill for composition",
                  deliverable: "video composition spec",
                  surface: "video_editor",
                  selectedCapabilityId: "skill:custom-video-specialist",
                  status: "planned",
                },
              ],
            },
          },
        } as any,
      }),
    );

    expect(mockRouteRoomIntent).not.toHaveBeenCalled();
    expect(mockClassifyIntent).not.toHaveBeenCalled();
    expect(mockExecuteSkillLlmWithFallback.mock.calls[0][0].skillSlug).toBe(
      "custom-video-specialist",
    );
    expect(mockExecuteUnified).not.toHaveBeenCalled();
    expect(result.skillId).toBe("custom-video-specialist");
    expect(result.metadata).toMatchObject({
      route: "skill",
      routeReason: "auto_team_plan_step:custom-video-step",
      selectedCapabilityId: "skill:custom-video-specialist",
    });
  });

  it("auto-team agency capability ids route to the selected agency runtime", async () => {
    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(
      makeInput({
        route: {
          route: "skill",
          reason: "auto_team_orchestrator",
          selectedSkillId: "skill-orchestrator",
        },
        objective: "Coordinate a multi-agent evaluation",
        dynamicParams: {
          contextState: {
            projectState: {
              steps: [
                {
                  stepKey: "selected-agency-step",
                  title: "Selected agency coordination",
                  objective: "Use the selected approved agency",
                  deliverable: "agency result",
                  surface: "agency",
                  selectedCapabilityId: "agency:agency-specialized-1",
                  status: "planned",
                },
              ],
            },
          },
        } as any,
      }),
    );

    expect(mockAgencyBridgeExecuteRun).toHaveBeenCalledWith(
      expect.objectContaining({
        agencyId: "agency-specialized-1",
      }),
    );
    expect(result.metadata).toMatchObject({
      route: "agency",
      routeReason: "auto_team_plan_surface:selected-agency-step",
      selectedCapabilityId: "agency:agency-specialized-1",
      agencyId: "agency-specialized-1",
    });
  });

  it("authorizes the team's default agency before execution", async () => {
    mockAgencyAuthorizationRows.mockResolvedValueOnce([]);

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    await expect(
      executeTeamRunSkillTurn(
        makeInput({
          route: {
            route: "agency",
            reason: "team_default_agency",
          },
          objective: "Coordinate through the team's default agency",
        }),
      ),
    ).rejects.toThrow("not available for this tenant");
    expect(mockAgencyBridgeExecuteRun).not.toHaveBeenCalled();
  });

  it("blocks selected agency capability ids that are not authorized for the tenant", async () => {
    mockAgencyAuthorizationRows.mockResolvedValueOnce([]);

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    await expect(
      executeTeamRunSkillTurn(
        makeInput({
          route: {
            route: "skill",
            reason: "auto_team_orchestrator",
            selectedSkillId: "skill-orchestrator",
          },
          objective: "Coordinate a multi-agent evaluation",
          dynamicParams: {
            contextState: {
              projectState: {
                steps: [
                  {
                    stepKey: "selected-agency-step",
                    title: "Selected agency coordination",
                    objective: "Use the selected approved agency",
                    deliverable: "agency result",
                    surface: "agency",
                    selectedCapabilityId: "agency:agency-denied-1",
                    status: "planned",
                  },
                ],
              },
            },
          } as any,
        }),
      ),
    ).rejects.toThrow("not available for this tenant");
    expect(mockAgencyBridgeExecuteRun).not.toHaveBeenCalled();
  });

  it("blocks agency capability ids that are not published for automation", async () => {
    mockAgencyAuthorizationRows.mockResolvedValueOnce([
      {
        id: "agency-draft-1",
        tenantId: "tenant-1",
        status: "draft",
        isPublished: false,
        visibility: "public",
        createdBy: 42,
      },
    ]);

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    await expect(
      executeTeamRunSkillTurn(
        makeInput({
          route: {
            route: "skill",
            reason: "auto_team_orchestrator",
            selectedSkillId: "skill-orchestrator",
          },
          objective: "Coordinate a multi-agent evaluation",
          dynamicParams: {
            contextState: {
              projectState: {
                steps: [
                  {
                    stepKey: "draft-agency-step",
                    title: "Draft agency coordination",
                    objective: "Use the selected agency",
                    deliverable: "agency result",
                    surface: "agency",
                    selectedCapabilityId: "agency:agency-draft-1",
                    status: "planned",
                  },
                ],
              },
            },
          } as any,
        }),
      ),
    ).rejects.toThrow("not published for automation");
    expect(mockAgencyBridgeExecuteRun).not.toHaveBeenCalled();
  });

  it("allows the team's own active backing agency without marketplace publishing", async () => {
    mockGetTeam.mockResolvedValueOnce({
      agencyId: "agency-team-active-1",
    });
    mockAgencyAuthorizationRows.mockResolvedValueOnce([
      {
        id: "agency-team-active-1",
        tenantId: "tenant-1",
        status: "active",
        isPublished: false,
        visibility: "private",
        createdBy: 42,
      },
    ]);

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(
      makeInput({
        route: {
          route: "skill",
          reason: "auto_team_orchestrator",
          selectedSkillId: "skill-orchestrator",
        },
        objective: "Coordinate a multi-agent video workflow",
        dynamicParams: {
          contextState: {
            projectState: {
              steps: [
                {
                  stepKey: "team-agency-step",
                  title: "Team agency coordination",
                  objective: "Use the team's backing agency",
                  deliverable: "agency result",
                  surface: "agency",
                  selectedCapabilityId: "agency:agency-team-active-1",
                  status: "planned",
                },
              ],
            },
          },
        } as any,
      }),
    );

    expect(result.metadata.route).toBe("agency");
    expect(mockAgencyBridgeExecuteRun).toHaveBeenCalledWith(
      expect.objectContaining({
        agencyId: "agency-team-active-1",
      }),
    );
  });

  it("falls back to skill execution when the team's backing agency is archived", async () => {
    mockGetTeam.mockResolvedValueOnce({
      agencyId: "agency-team-archived-1",
    });
    mockAgencyAuthorizationRows.mockResolvedValueOnce([
      {
        id: "agency-team-archived-1",
        tenantId: "tenant-1",
        status: "archived",
        isPublished: false,
        visibility: "private",
        createdBy: 42,
      },
    ]);
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce({
      success: true,
      content: "fallback skill completed the archived agency step",
      modelId: "gpt-4o-mini",
      inputTokens: 10,
      outputTokens: 20,
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
        objective: "Coordinate a multi-agent video workflow",
        dynamicParams: {
          contextState: {
            projectState: {
              steps: [
                {
                  stepKey: "team-agency-step",
                  title: "Team agency coordination",
                  objective: "Use the team's backing agency",
                  deliverable: "agency result",
                  surface: "agency",
                  selectedCapabilityId: "agency:agency-team-archived-1",
                  status: "planned",
                },
              ],
            },
          },
        } as any,
      }),
    );

    expect(result.metadata.route).toBe("skill");
    expect(result.metadata.routeReason).toContain("agency_unavailable_fallback");
    expect(mockAgencyBridgeExecuteRun).not.toHaveBeenCalled();
  });

  it("falls back to skill execution when the agency runtime is temporarily unavailable", async () => {
    mockGetTeam.mockResolvedValueOnce({
      agencyId: "agency-team-active-1",
    });
    mockAgencyAuthorizationRows.mockResolvedValueOnce([
      {
        id: "agency-team-active-1",
        tenantId: "tenant-1",
        status: "active",
        isPublished: false,
        visibility: "private",
        createdBy: 42,
      },
    ]);
    mockAgencyBridgeExecuteRun.mockRejectedValueOnce(
      new Error("Agency service temporarily unavailable"),
    );
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce({
      success: true,
      content: "fallback skill completed the work",
      modelId: "gpt-4o-mini",
      inputTokens: 10,
      outputTokens: 20,
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
        objective: "Coordinate a multi-agent video workflow",
        dynamicParams: {
          contextState: {
            projectState: {
              steps: [
                {
                  stepKey: "team-agency-step",
                  title: "Team agency coordination",
                  objective: "Use the team's backing agency",
                  deliverable: "agency result",
                  surface: "agency",
                  selectedCapabilityId: "agency:agency-team-active-1",
                  status: "planned",
                },
              ],
            },
          },
        } as any,
      }),
    );

    expect(result.content).toBe("fallback skill completed the work");
    expect(result.metadata.route).toBe("skill");
    expect(result.metadata.routeReason).toContain("agency_unavailable_fallback");
  });

  it("blocks agency capability ids that are pending publish approval", async () => {
    mockAgencyAuthorizationRows.mockResolvedValueOnce([
      {
        id: "agency-pending-1",
        tenantId: "tenant-1",
        status: "published",
        isPublished: true,
        visibility: "pending_approval",
        createdBy: 42,
      },
    ]);

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    await expect(
      executeTeamRunSkillTurn(
        makeInput({
          route: {
            route: "skill",
            reason: "auto_team_orchestrator",
            selectedSkillId: "skill-orchestrator",
          },
          objective: "Coordinate a multi-agent evaluation",
          dynamicParams: {
            contextState: {
              projectState: {
                steps: [
                  {
                    stepKey: "pending-agency-step",
                    title: "Pending agency coordination",
                    objective: "Use the selected agency",
                    deliverable: "agency result",
                    surface: "agency",
                    selectedCapabilityId: "agency:agency-pending-1",
                    status: "planned",
                  },
                ],
              },
            },
          } as any,
        }),
      ),
    ).rejects.toThrow("not runnable for automation");
    expect(mockAgencyBridgeExecuteRun).not.toHaveBeenCalled();
  });

  it("blocks shared agency capability ids when the requester is not in an allowed group", async () => {
    mockAgencyAuthorizationRows.mockResolvedValueOnce([
      {
        id: "agency-shared-1",
        tenantId: "tenant-1",
        status: "published",
        isPublished: true,
        visibility: "shared",
        createdBy: 99,
      },
    ]);
    mockAgencySharedPermissionRows.mockResolvedValueOnce([]);

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    await expect(
      executeTeamRunSkillTurn(
        makeInput({
          route: {
            route: "skill",
            reason: "auto_team_orchestrator",
            selectedSkillId: "skill-orchestrator",
          },
          objective: "Coordinate a shared agency evaluation",
          dynamicParams: {
            contextState: {
              projectState: {
                steps: [
                  {
                    stepKey: "shared-agency-step",
                    title: "Shared agency coordination",
                    objective: "Use shared agency",
                    deliverable: "agency result",
                    surface: "agency",
                    selectedCapabilityId: "agency:agency-shared-1",
                    status: "planned",
                  },
                ],
              },
            },
          } as any,
        }),
      ),
    ).rejects.toThrow("shared but not available");
    expect(mockAgencyBridgeExecuteRun).not.toHaveBeenCalled();
  });

  it("allows shared agency capability ids for active permission group members", async () => {
    mockAgencyAuthorizationRows.mockResolvedValueOnce([
      {
        id: "agency-shared-1",
        tenantId: "tenant-1",
        status: "published",
        isPublished: true,
        visibility: "shared",
        createdBy: 99,
      },
    ]);
    mockAgencySharedPermissionRows.mockResolvedValueOnce([{ id: 1 }]);

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(
      makeInput({
        route: {
          route: "skill",
          reason: "auto_team_orchestrator",
          selectedSkillId: "skill-orchestrator",
        },
        objective: "Coordinate a shared agency evaluation",
        dynamicParams: {
          contextState: {
            projectState: {
              steps: [
                {
                  stepKey: "shared-agency-step",
                  title: "Shared agency coordination",
                  objective: "Use shared agency",
                  deliverable: "agency result",
                  surface: "agency",
                  selectedCapabilityId: "agency:agency-shared-1",
                  status: "planned",
                },
              ],
            },
          },
        } as any,
      }),
    );

    expect(mockAgencyBridgeExecuteRun).toHaveBeenCalledWith(
      expect.objectContaining({
        agencyId: "agency-shared-1",
      }),
    );
    expect(result.metadata).toMatchObject({
      route: "agency",
      agencyId: "agency-shared-1",
    });
  });

  it("auto-team skill_studio gaps create a private skill draft instead of falling back to generic execution", async () => {
    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(
      makeInput({
        route: {
          route: "skill",
          reason: "auto_team_orchestrator",
          selectedSkillId: "skill-orchestrator",
        },
        objective: "Prepare a custom compliance checker for future runs",
        dynamicParams: {
          contextState: {
            projectState: {
              steps: [
                {
                  stepKey: "skill-gap",
                  title: "Create missing checker",
                  objective: "Create a reusable checker skill for this domain",
                  deliverable: "private skill proposal",
                  surface: "skill_studio",
                  selectedCapabilityId:
                    "skill_studio:create_private_or_pending_review",
                  status: "planned",
                },
              ],
            },
          },
        } as any,
      }),
    );

    expect(mockRouteRoomIntent).not.toHaveBeenCalled();
    expect(mockClassifyIntent).not.toHaveBeenCalled();
    expect(mockExecuteSkillLlmWithFallback.mock.calls[0][0].skillSlug).toBe(
      "intelligence-skill-creator",
    );
    expect(result.skillId).toBe("intelligence-skill-creator");
    expect(result.metadata).toMatchObject({
      route: "skill",
      routeReason: "auto_team_capability_gap:skill-gap:intelligence-skill-creator",
      selectedCapabilityId: "skill_studio:create_private_or_pending_review",
      capabilityGapResolution: {
        action: "create_private_skill_draft",
        safetyMode: "private_or_pending_review_only",
        publishAllowed: false,
        autoApplyAllowed: false,
        skillStudioPolicy: {
          publishAllowed: false,
          autoApplyAllowed: false,
          widenVisibilityAllowed: false,
          externalSideEffectsAllowed: false,
        },
      },
      capabilityGapPreflight: {
        checked: true,
        draftOnly: true,
        publishAllowed: false,
        autoApplyAllowed: false,
        externalSideEffectsAllowed: false,
      },
    });
  });

  it("blocks capability gaps when no approved skill creator is available", async () => {
    mockGetSkillByIdAsync
      .mockImplementationOnce(async () => null)
      .mockImplementationOnce(async () => null);

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    await expect(
      executeTeamRunSkillTurn(
        makeInput({
          route: {
            route: "skill",
            reason: "auto_team_orchestrator",
            selectedSkillId: "skill-orchestrator",
          },
          objective: "Prepare a custom compliance checker for future runs",
          dynamicParams: {
            contextState: {
              projectState: {
                steps: [
                  {
                    stepKey: "skill-gap",
                    title: "Create missing checker",
                    objective: "Create a reusable checker skill for this domain",
                    deliverable: "private skill proposal",
                    surface: "skill_studio",
                    selectedCapabilityId:
                      "skill_studio:create_private_or_pending_review",
                    status: "planned",
                  },
                ],
              },
            },
          } as any,
        }),
      ),
    ).rejects.toThrow(/No approved skill creator is available/);

    expect(mockRouteRoomIntent).not.toHaveBeenCalled();
    expect(mockClassifyIntent).not.toHaveBeenCalled();
    expect(mockExecuteSkillLlmWithFallback).not.toHaveBeenCalled();
  });

  it("blocks unsafe skill creator outputs that try to publish or auto-apply", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce({
      success: true,
      content:
        '{"name":"unsafe checker","visibility":"public","publishAllowed":true,"autoApplyAllowed":true}',
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
        objective: "Prepare a custom compliance checker for future runs",
        dynamicParams: {
          contextState: {
            projectState: {
              steps: [
                {
                  stepKey: "skill-gap",
                  title: "Create missing checker",
                  objective: "Create a reusable checker skill for this domain",
                  deliverable: "private skill proposal",
                  surface: "skill_studio",
                  selectedCapabilityId:
                    "skill_studio:create_private_or_pending_review",
                  status: "planned",
                },
              ],
            },
          },
        } as any,
      }),
    );

    expect(result.content).toContain("blocked by the Skill Studio safety policy");
    expect(result.metadata).toMatchObject({
      capabilityGapPolicyEnforced: true,
      capabilityGapPolicyViolation: {
        blocked: true,
      },
      runtimeDispatchOutcome: "blocked_by_skill_studio_policy",
    });
  });

  it("blocks natural-language skill creator outputs that ask to publish immediately", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce({
      success: true,
      content:
        "The skill draft is ready. Publish this now and install it now so future runs use it automatically.",
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
        objective: "Prepare a custom compliance checker for future runs",
        dynamicParams: {
          contextState: {
            projectState: {
              steps: [
                {
                  stepKey: "skill-gap",
                  title: "Create missing checker",
                  objective: "Create a reusable checker skill for this domain",
                  deliverable: "private skill proposal",
                  surface: "skill_studio",
                  selectedCapabilityId:
                    "skill_studio:create_private_or_pending_review",
                  status: "planned",
                },
              ],
            },
          },
        } as any,
      }),
    );

    expect(result.content).toContain("blocked by the Skill Studio safety policy");
    expect(result.metadata).toMatchObject({
      capabilityGapPolicyViolation: {
        blocked: true,
      },
    });
  });

  it("auto-team unsupported workflow capabilities route to a private skill draft gap instead of heuristic execution", async () => {
    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(
      makeInput({
        route: {
          route: "skill",
          reason: "auto_team_orchestrator",
          selectedSkillId: "skill-orchestrator",
        },
        objective: "Run a specialized workflow that does not have an adapter yet",
        dynamicParams: {
          contextState: {
            projectState: {
              steps: [
                {
                  stepKey: "workflow-gap",
                  title: "Workflow execution",
                  objective: "Execute workflow template workflow-1",
                  deliverable: "workflow result",
                  surface: "workflow",
                  selectedCapabilityId: "workflow:workflow-1",
                  status: "planned",
                },
              ],
            },
          },
        } as any,
      }),
    );

    expect(mockRouteRoomIntent).not.toHaveBeenCalled();
    expect(mockClassifyIntent).not.toHaveBeenCalled();
    expect(result.skillId).toBe("intelligence-skill-creator");
    expect(result.metadata).toMatchObject({
      route: "skill",
      routeReason: "auto_team_capability_gap:workflow-gap:intelligence-skill-creator",
      selectedCapabilityId: "workflow:workflow-1",
      capabilityGapResolution: {
        action: "create_private_skill_draft",
        parsedCapabilityKind: "workflow",
      },
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
    expect(result.content).toContain("Image Creator produced an image artifact");
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
      agencyStatus: "completed",
    });
  });
});
