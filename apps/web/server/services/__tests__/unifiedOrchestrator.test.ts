import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks (must be before imports) ---

vi.mock("../skillRegistry", () => ({
  getSkillByIdAsync: vi.fn(),
  getSkillById: vi.fn(),
}));

vi.mock("../executors/executorRegistry", () => ({
  getExecutor: vi.fn(),
  registerExecutor: vi.fn(),
}));

vi.mock("../executors/contextBuilder", () => ({
  buildChatContext: vi.fn(),
  buildTeamContext: vi.fn(),
  buildDynamicModelRequirements: vi.fn(),
  buildPromptEnhancementContext: vi.fn(),
  injectWebSearchIfNeeded: vi.fn(),
}));

vi.mock("../skillExecutionPolicy", () => ({
  resolveSkillExecutionPolicy: vi.fn(),
}));

vi.mock("../taskPlannerMiddleware", () => ({
  runPlanner: vi.fn(),
  recordStepAttempt: vi.fn(),
}));

vi.mock("../artifactRouter", () => ({
  classifyArtifactIntent: vi.fn(),
  selectExecutionRoute: vi.fn(),
}));

vi.mock("../creditService", () => ({
  deductCreditsForModel: vi.fn(),
  calculateCreditsForLLMDynamic: vi.fn(),
}));

vi.mock("../auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

vi.mock("../traceContext", () => ({
  getTraceId: vi.fn().mockReturnValue("trace-test-123"),
}));

// Mock the self-registration side effect of textSkillExecutor import
vi.mock("../executors/textSkillExecutor", () => ({
  TextSkillExecutor: vi.fn(),
  textSkillExecutor: {},
}));

// Mock JWT token generation (requires JWT_SECRET env var)
vi.mock("../../_core/tokens", () => ({
  signBearerToken: vi.fn().mockReturnValue("mock-server-token"),
}));

// Mock executor side-effect imports
vi.mock("../executors/imageExecutor", () => ({}));
vi.mock("../executors/videoExecutor", () => ({}));
vi.mock("../executors/audioExecutor", () => ({}));

// --- Imports ---

import {
  executeUnified,
  classifyCapability,
  registerPersistenceHook,
  clearPersistenceHooks,
} from "../unifiedOrchestrator";
import { getSkillByIdAsync, getSkillById } from "../skillRegistry";
import { getExecutor } from "../executors/executorRegistry";
import {
  buildChatContext,
  buildTeamContext,
  buildDynamicModelRequirements,
  buildPromptEnhancementContext,
  injectWebSearchIfNeeded,
} from "../executors/contextBuilder";
import { resolveSkillExecutionPolicy } from "../skillExecutionPolicy";
import { runPlanner, recordStepAttempt } from "../taskPlannerMiddleware";
import {
  classifyArtifactIntent,
  selectExecutionRoute,
} from "../artifactRouter";
import {
  deductCreditsForModel,
  calculateCreditsForLLMDynamic,
} from "../creditService";
import { auditLogger } from "../auditLogger";
import type {
  UnifiedExecutionRequest,
  ExecutorResult,
  CapabilityExecutor,
  CapabilityFamily,
  PersistenceHook,
} from "../executors/types";

// --- Typed mocks ---

const mockGetSkillByIdAsync = vi.mocked(getSkillByIdAsync);
const mockGetSkillById = vi.mocked(getSkillById);
const mockGetExecutor = vi.mocked(getExecutor);
const mockBuildChatContext = vi.mocked(buildChatContext);
const mockBuildTeamContext = vi.mocked(buildTeamContext);
const mockBuildDynamicModelReqs = vi.mocked(buildDynamicModelRequirements);
const mockBuildPromptEnhancement = vi.mocked(buildPromptEnhancementContext);
const mockInjectWebSearch = vi.mocked(injectWebSearchIfNeeded);
const mockResolvePolicy = vi.mocked(resolveSkillExecutionPolicy);
const mockRunPlanner = vi.mocked(runPlanner);
const mockRecordStepAttempt = vi.mocked(recordStepAttempt);
const mockClassifyArtifact = vi.mocked(classifyArtifactIntent);
const mockSelectRoute = vi.mocked(selectExecutionRoute);
const mockDeductCredits = vi.mocked(deductCreditsForModel);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLMDynamic);
const mockAuditLog = vi.mocked(auditLogger.log);

// --- Default state ---

const defaultSkill: any = {
  id: "skill-1",
  slug: "general-article-writer",
  name: "Article Writer",
  category: "prompt_enhancement",
  content: "You are a helpful writer...",
  executionPolicy: {},
  tags: [],
  systemPrompt: "You are a helpful writer",
};

const defaultExecutorResult: ExecutorResult = {
  success: true,
  content: "Generated response.",
  inputTokens: 150,
  outputTokens: 300,
  modelUsed: "gpt-4o-mini",
  attempts: [
    {
      attempt: 1,
      modelId: "gpt-4o-mini",
      providerName: "openai",
      statusCode: 200,
      errorType: null,
      errorMessage: null,
      durationMs: 500,
      success: true,
    },
  ],
  totalDurationMs: 500,
};

const mockExecutor: CapabilityExecutor = {
  id: "text-skill-executor",
  capabilities: ["writing.article"] as readonly CapabilityFamily[],
  canHandle: vi.fn().mockReturnValue(true),
  execute: vi.fn().mockResolvedValue(defaultExecutorResult),
};

function buildRequest(
  overrides?: Partial<UnifiedExecutionRequest>,
): UnifiedExecutionRequest {
  return {
    channel: "chat",
    userId: 1,
    tenantId: "tenant-1",
    userMessage: "Write an article about AI.",
    routeHint: {
      selectedSkillId: "skill-1",
      route: "skill",
      reason: "user_selected",
    },
    ...overrides,
  };
}

// --- Setup ---

beforeEach(() => {
  vi.clearAllMocks();
  clearPersistenceHooks();

  // Default mock return values
  mockGetSkillByIdAsync.mockResolvedValue(defaultSkill);
  mockGetSkillById.mockReturnValue(defaultSkill);
  mockGetExecutor.mockReturnValue(mockExecutor);
  mockBuildChatContext.mockResolvedValue([
    { role: "system", content: "You are a helpful writer" },
    { role: "user", content: "Write an article about AI." },
  ]);
  mockBuildTeamContext.mockResolvedValue([
    { role: "system", content: "Team composed prompt" },
  ] as any);
  mockBuildDynamicModelReqs.mockReturnValue({
    requirements: {},
    hasOverrides: false,
  });
  mockBuildPromptEnhancement.mockResolvedValue(null);
  mockInjectWebSearch.mockResolvedValue(null);
  mockResolvePolicy.mockResolvedValue({
    modelId: "gpt-4o-mini",
    preferredProviderId: 1,
    strictProviderPin: false,
    allowFreeModels: false,
  } as any);
  mockRunPlanner.mockResolvedValue(null);
  mockClassifyArtifact.mockReturnValue("chat_reply" as any);
  mockSelectRoute.mockReturnValue({ route: "chat" } as any);
  mockDeductCredits.mockResolvedValue({ creditsUsed: 5 } as any);
  mockCalculateCredits.mockResolvedValue(5);

  // Reset the mock executor's execute fn
  (mockExecutor.execute as any).mockResolvedValue(defaultExecutorResult);
});

afterEach(() => {
  clearPersistenceHooks();
});

// --- Tests ---

describe("classifyCapability", () => {
  it("skill with category image_generation classifies as media.image", () => {
    expect(classifyCapability({ ...defaultSkill, category: "image_generation" })).toBe("media.image");
  });

  it("skill with category video_generation classifies as media.video", () => {
    expect(classifyCapability({ ...defaultSkill, category: "video_generation" })).toBe("media.video");
  });

  it("skill with category audio_generation classifies as media.audio", () => {
    expect(classifyCapability({ ...defaultSkill, category: "audio_generation" })).toBe("media.audio");
  });

  it("skill with capability_family in executionPolicy uses declared family", () => {
    const skill = {
      ...defaultSkill,
      executionPolicy: { capability_family: "media.image" },
    };
    expect(classifyCapability(skill)).toBe("media.image");
  });

  it("skill without explicit category defaults to writing.article", () => {
    const skill = { ...defaultSkill, category: "prompt_enhancement" };
    expect(classifyCapability(skill)).toBe("writing.article");
  });

  it("review-classified skill by slug maps to writing.review", () => {
    const skill = { ...defaultSkill, slug: "product-review-writer" };
    expect(classifyCapability(skill)).toBe("writing.review");
  });

  it("review-classified skill by tag maps to writing.review", () => {
    const skill = { ...defaultSkill, tags: ["review"] };
    expect(classifyCapability(skill)).toBe("writing.review");
  });

  it("swarm execution mode maps to orchestration.swarm", () => {
    const skill = { ...defaultSkill, executionMode: "swarm" };
    expect(classifyCapability(skill)).toBe("orchestration.swarm");
  });

  it("handles string executionPolicy JSON", () => {
    const skill = {
      ...defaultSkill,
      executionPolicy: JSON.stringify({ capability_family: "media.video" }),
    };
    expect(classifyCapability(skill)).toBe("media.video");
  });
});

describe("unifiedOrchestrator", () => {
  describe("executeUnified", () => {
    // ─── Skill Resolution ──────────────────────────────────
    describe("Skill Resolution", () => {
      it("resolves skill by routeHint.selectedSkillId when provided", async () => {
        const result = await executeUnified(buildRequest());

        expect(mockGetSkillByIdAsync).toHaveBeenCalledWith("skill-1");
        expect(result.skillId).toBe("skill-1");
      });

      it("falls back to general-article-writer when selectedSkillId not found", async () => {
        mockGetSkillByIdAsync.mockResolvedValue(undefined);

        const result = await executeUnified(buildRequest());

        expect(mockGetSkillById).toHaveBeenCalledWith("general-article-writer");
        expect(result.skillId).toBe("skill-1"); // from default mockGetSkillById
      });

      it("returns structured error when no skill can be resolved", async () => {
        mockGetSkillByIdAsync.mockResolvedValue(undefined);
        mockGetSkillById.mockReturnValue(undefined);

        const result = await executeUnified(buildRequest());

        expect(result.route.reason).toBe("skill_resolution_failed");
        expect(result.result.type).toBe("text");
        expect((result.result as any).content).toBe("");
      });
    });

    // ─── Executor Selection ──────────────────────────────────
    describe("Executor Selection", () => {
      it("classified capability resolves to correct executor from registry", async () => {
        const result = await executeUnified(buildRequest());

        expect(mockGetExecutor).toHaveBeenCalled();
        expect(mockExecutor.execute).toHaveBeenCalled();
        expect(result.telemetry.executorId).toBe("text-skill-executor");
      });

      it("unregistered capability falls back to text executor", async () => {
        mockGetExecutor
          .mockReturnValueOnce(null)
          .mockReturnValueOnce(mockExecutor);

        const result = await executeUnified(buildRequest());

        expect(mockGetExecutor).toHaveBeenCalledTimes(2);
        // Verify fallback target is "writing.article"
        expect(mockGetExecutor).toHaveBeenNthCalledWith(2, "writing.article");
        expect(result.telemetry.executorId).toBe("text-skill-executor");
      });

      it("returns error when no executor found at all", async () => {
        mockGetExecutor.mockReturnValue(null);

        const result = await executeUnified(buildRequest());

        expect(result.route.reason).toBe("executor_not_found");
        expect(result.telemetry.executorId).toBe("unknown");
      });
    });

    // ─── Context Building -- Chat ──────────────────────────────────
    describe("Context Building -- Chat channel", () => {
      it("chat channel calls buildChatContext", async () => {
        await executeUnified(buildRequest());

        expect(mockBuildChatContext).toHaveBeenCalled();
        expect(mockBuildTeamContext).not.toHaveBeenCalled();
      });

      it("chat with activePersonaId passes skill systemPrompt", async () => {
        await executeUnified(
          buildRequest({
            conversationContext: { activePersonaId: "persona-1" },
          }),
        );

        expect(mockBuildChatContext).toHaveBeenCalledWith(
          expect.objectContaining({
            channel: "chat",
            conversationContext: { activePersonaId: "persona-1" },
          }),
          "You are a helpful writer",
          null,
        );
      });
    });

    // ─── Context Building -- Team Room ──────────────────────────────────
    describe("Context Building -- Team Room channel", () => {
      it("team room calls buildTeamContext which delegates to composePrompt", async () => {
        await executeUnified(
          buildRequest({
            channel: "team_room",
            teamContext: {
              assistantId: "a1",
              roomId: "r1",
              teamId: "t1",
              objective: "Write a report",
            },
          }),
        );

        expect(mockBuildTeamContext).toHaveBeenCalledWith(
          expect.objectContaining({ channel: "team_room" }),
          "tenant-1",
        );
      });
    });

    // ─── Dynamic Model Requirements ──────────────────────────────────
    describe("Dynamic Model Requirements", () => {
      it("images in attachments triggers buildDynamicModelRequirements with hasImages", async () => {
        const req = buildRequest({
          attachments: [{ type: "image", url: "https://example.com/img.png" }],
        });

        await executeUnified(req);

        expect(mockBuildDynamicModelReqs).toHaveBeenCalledWith(
          expect.anything(),
          true, // hasImages
          expect.anything(),
        );
      });

      it("no images passes hasImages as false", async () => {
        await executeUnified(buildRequest());

        expect(mockBuildDynamicModelReqs).toHaveBeenCalledWith(
          expect.anything(),
          false,
          expect.anything(),
        );
      });

      it("reference_images in dynamicParams triggers hasImages", async () => {
        const req = buildRequest({
          dynamicParams: { reference_images: ["https://example.com/ref.png"] },
        });

        await executeUnified(req);

        expect(mockBuildDynamicModelReqs).toHaveBeenCalledWith(
          expect.anything(),
          true,
          expect.anything(),
        );
      });
    });

    // ─── Execution Policy + Planner ──────────────────────────────────
    describe("Execution Policy + Planner", () => {
      it("resolveSkillExecutionPolicy called with the skill", async () => {
        await executeUnified(buildRequest());

        expect(mockResolvePolicy).toHaveBeenCalledWith(
          expect.objectContaining({ skill: defaultSkill }),
        );
      });

      it("runPlanner called and recordStepAttempt called with correct args", async () => {
        const plannerResult = { resolvedModelId: "claude-3-5-sonnet", enabled: true };
        mockRunPlanner.mockResolvedValue(plannerResult as any);

        await executeUnified(buildRequest());

        expect(mockRunPlanner).toHaveBeenCalled();
        expect(mockRecordStepAttempt).toHaveBeenCalledWith(
          expect.objectContaining({
            plannerResult,
            executorResult: expect.objectContaining({
              success: true,
              modelUsed: "gpt-4o-mini",
            }),
          }),
        );
      });

      it("runPlanner returning null means planner was skipped", async () => {
        mockRunPlanner.mockResolvedValue(null);

        await executeUnified(buildRequest());

        expect(mockRecordStepAttempt).not.toHaveBeenCalled();
      });
    });

    // ─── Web Search Injection ──────────────────────────────────
    describe("Web Search Injection", () => {
      it("injectWebSearchIfNeeded is called", async () => {
        await executeUnified(buildRequest());

        expect(mockInjectWebSearch).toHaveBeenCalled();
      });

      it("web search params injected into executor input", async () => {
        mockInjectWebSearch.mockResolvedValue({
          extraBodyParams: { tools: [{ type: "web_search_preview" }] },
        });

        await executeUnified(buildRequest());

        expect(mockExecutor.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            extraBodyParams: { tools: [{ type: "web_search_preview" }] },
          }),
        );
      });

      it("systemPromptSuffix appended to first system message", async () => {
        mockInjectWebSearch.mockResolvedValue({
          extraBodyParams: {},
          systemPromptSuffix: "Use only verified sources.",
        });

        await executeUnified(buildRequest());

        expect(mockExecutor.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({
                role: "system",
                content: expect.stringContaining("Use only verified sources."),
              }),
            ]),
          }),
        );
      });
    });

    // ─── Artifact Classification ──────────────────────────────────
    describe("Artifact Classification", () => {
      it("text capability triggers classifyArtifactIntent", async () => {
        await executeUnified(buildRequest());

        expect(mockClassifyArtifact).toHaveBeenCalled();
      });

      it("non-chat_reply artifact populates metadata", async () => {
        mockClassifyArtifact.mockReturnValue("library_document" as any);
        mockSelectRoute.mockReturnValue({ route: "library" } as any);

        const result = await executeUnified(buildRequest());

        expect(mockSelectRoute).toHaveBeenCalled();
        expect(result.metadata.artifactIntent).toBe("library_document");
        expect(result.metadata.artifactRoute).toBe("library");
      });
    });

    // ─── Credit Handling ──────────────────────────────────
    describe("Credit Handling", () => {
      it("creditMode 'deduct' calls deductCreditsForModel", async () => {
        const result = await executeUnified(
          buildRequest({ creditMode: "deduct" }),
        );

        expect(mockDeductCredits).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 1,
            model: "gpt-4o-mini",
          }),
        );
        expect(result.creditsDeducted).toBe(5);
      });

      it("default creditMode is 'deduct'", async () => {
        await executeUnified(buildRequest());

        expect(mockDeductCredits).toHaveBeenCalled();
      });

      it("creditMode 'calculate_only' calls calculateCreditsForLLMDynamic", async () => {
        const result = await executeUnified(
          buildRequest({ creditMode: "calculate_only" }),
        );

        expect(mockCalculateCredits).toHaveBeenCalledWith(150, 300, "gpt-4o-mini");
        expect(mockDeductCredits).not.toHaveBeenCalled();
        expect(result.costCredits).toBe(5);
      });

      it("creditMode 'skip' returns 0 credits", async () => {
        const result = await executeUnified(
          buildRequest({ creditMode: "skip" }),
        );

        expect(mockDeductCredits).not.toHaveBeenCalled();
        expect(mockCalculateCredits).not.toHaveBeenCalled();
        expect(result.costCredits).toBe(0);
      });

      it("credit deduction failure does not block result return", async () => {
        mockDeductCredits.mockRejectedValue(new Error("credit service down"));

        const result = await executeUnified(buildRequest());

        expect(result.result.type).toBe("text");
        expect((result.result as any).content).toBe("Generated response.");
        expect(result.creditsDeducted).toBe(0);
      });
    });

    // ─── Persistence Hook ──────────────────────────────────
    describe("Persistence Hook", () => {
      it("onExecutionComplete hook called after successful execution", async () => {
        const hookFn = vi.fn().mockResolvedValue(undefined);
        const hook: PersistenceHook = {
          channel: "chat",
          onExecutionComplete: hookFn,
        };
        registerPersistenceHook(hook);

        await executeUnified(buildRequest());

        expect(hookFn).toHaveBeenCalledWith(
          expect.objectContaining({ route: expect.any(Object) }),
          expect.objectContaining({}),
        );
      });

      it("hook failure logged but does not throw", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const hookFn = vi.fn().mockRejectedValue(new Error("hook failure"));
        registerPersistenceHook({
          channel: "chat",
          onExecutionComplete: hookFn,
        });

        const result = await executeUnified(buildRequest());

        expect(result.result.type).toBe("text");
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("persistence hook failed"),
          expect.any(Error),
        );
        warnSpy.mockRestore();
      });
    });

    // ─── Result Shape Variants ──────────────────────────────────
    describe("Result Shape Variants", () => {
      it("media_job result when executor returns mediaJob", async () => {
        (mockExecutor.execute as any).mockResolvedValue({
          ...defaultExecutorResult,
          mediaJob: { mediaType: "image", jobPayload: { taskId: "t1" } },
        });

        const result = await executeUnified(buildRequest());

        expect(result.result.type).toBe("media_job");
        expect((result.result as any).mediaType).toBe("image");
        expect((result.result as any).jobPayload).toEqual({ taskId: "t1" });
      });

      it("delegated result when executor returns delegated", async () => {
        (mockExecutor.execute as any).mockResolvedValue({
          ...defaultExecutorResult,
          delegated: { target: "agency", payload: { agencyId: "a1" } },
        });

        const result = await executeUnified(buildRequest());

        expect(result.result.type).toBe("delegated");
        expect((result.result as any).target).toBe("agency");
        expect((result.result as any).payload).toEqual({ agencyId: "a1" });
      });
    });

    // ─── Error Handling ──────────────────────────────────
    describe("Error Handling and Fallback", () => {
      it("orchestrator error returns error result (not throws)", async () => {
        mockGetSkillByIdAsync.mockRejectedValue(
          new Error("unexpected DB error"),
        );

        const result = await executeUnified(buildRequest());

        expect(result.route.reason).toBe("orchestrator_error");
        expect(result.telemetry.executorId).toBe("unknown");
        // U02: Error is sanitized — raw message not exposed
        expect(result.metadata.error).toBe("orchestrator_error");
      });

      it("result shape matches expected format for chat caller", async () => {
        const result = await executeUnified(buildRequest());

        expect(result).toHaveProperty("route");
        expect(result).toHaveProperty("result");
        expect(result).toHaveProperty("tokens");
        expect(result).toHaveProperty("costCredits");
        expect(result).toHaveProperty("modelUsed");
        expect(result).toHaveProperty("skillId");
        expect(result).toHaveProperty("metadata");
        expect(result).toHaveProperty("telemetry");
        expect(result.tokens).toHaveProperty("input");
        expect(result.tokens).toHaveProperty("output");
      });

      it("result shape matches expected format for team room caller", async () => {
        const req = buildRequest({
          channel: "team_room",
          teamContext: {
            assistantId: "a1",
            roomId: "r1",
            teamId: "t1",
            objective: "Do work",
          },
        });

        const result = await executeUnified(req);

        expect(result).toHaveProperty("route");
        expect(result).toHaveProperty("result");
        expect(result).toHaveProperty("tokens");
        expect(result).toHaveProperty("telemetry");
      });
    });

    // ─── Telemetry ──────────────────────────────────
    describe("Telemetry", () => {
      it("result includes routerVersion, policyVersion, executorId, totalDurationMs", async () => {
        const result = await executeUnified(buildRequest());

        expect(result.telemetry.routerVersion).toBe("1.0.0");
        expect(result.telemetry.policyVersion).toBe("1.0.0");
        expect(result.telemetry.executorId).toBe("text-skill-executor");
        expect(result.telemetry.totalDurationMs).toBeGreaterThanOrEqual(0);
      });
    });

    // ─── Audit Logging ──────────────────────────────────
    describe("Audit Logging", () => {
      it("unified_route event logged after executor selection", async () => {
        await executeUnified(buildRequest());

        expect(mockAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({ eventType: "unified_route" }),
        );
      });

      it("unified_credit event logged after credit handling", async () => {
        await executeUnified(buildRequest());

        expect(mockAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({ eventType: "unified_credit" }),
        );
      });

      it("audit events include traceId", async () => {
        await executeUnified(buildRequest({ traceId: "my-trace-id" }));

        const routeCall = mockAuditLog.mock.calls.find(
          (c) => (c[0] as any).eventType === "unified_route",
        );
        expect(routeCall).toBeDefined();
        expect((routeCall![0] as any).requestPayload.traceId).toBe("my-trace-id");
      });
    });

    // ─── Prompt Enhancement ──────────────────────────────────
    describe("Prompt Enhancement", () => {
      it("prompt enhancement skill uses enhanced messages", async () => {
        mockBuildPromptEnhancement.mockResolvedValue({
          systemPrompt: "Enhanced system",
          userPrompt: "Enhanced user",
        });

        await executeUnified(buildRequest());

        expect(mockExecutor.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: [
              { role: "system", content: "Enhanced system" },
              { role: "user", content: "Enhanced user" },
            ],
          }),
        );
        expect(mockBuildChatContext).not.toHaveBeenCalled();
      });

      it("non-enhancement skill uses regular context", async () => {
        mockBuildPromptEnhancement.mockResolvedValue(null);

        await executeUnified(buildRequest());

        expect(mockBuildChatContext).toHaveBeenCalled();
      });
    });

    // ─── Full Flow Sequence ──────────────────────────────────
    describe("Full Flow Sequence", () => {
      it("all steps called in correct sequence for chat channel", async () => {
        const callOrder: string[] = [];

        mockGetSkillByIdAsync.mockImplementation(async () => {
          callOrder.push("resolveSkill");
          return defaultSkill;
        });
        mockGetExecutor.mockImplementation(() => {
          callOrder.push("getExecutor");
          return mockExecutor;
        });
        mockBuildPromptEnhancement.mockImplementation(async () => {
          callOrder.push("promptEnhancement");
          return null;
        });
        mockBuildChatContext.mockImplementation(async () => {
          callOrder.push("buildContext");
          return [
            { role: "system", content: "sys" },
            { role: "user", content: "usr" },
          ];
        });
        mockBuildDynamicModelReqs.mockImplementation(() => {
          callOrder.push("dynamicReqs");
          return { requirements: {}, hasOverrides: false };
        });
        mockResolvePolicy.mockImplementation(async () => {
          callOrder.push("resolvePolicy");
          return { modelId: "gpt-4o-mini" } as any;
        });
        mockRunPlanner.mockImplementation(async () => {
          callOrder.push("runPlanner");
          return null;
        });
        mockInjectWebSearch.mockImplementation(async () => {
          callOrder.push("injectWebSearch");
          return null;
        });
        (mockExecutor.execute as any).mockImplementation(async () => {
          callOrder.push("execute");
          return defaultExecutorResult;
        });
        mockDeductCredits.mockImplementation(async () => {
          callOrder.push("deductCredits");
          return { creditsUsed: 5 } as any;
        });

        await executeUnified(buildRequest());

        expect(callOrder).toEqual([
          "resolveSkill",
          "getExecutor",
          "promptEnhancement",
          "buildContext",
          "dynamicReqs",
          "resolvePolicy",
          "runPlanner",
          "injectWebSearch",
          "execute",
          "deductCredits",
        ]);
      });
    });
  });
});
