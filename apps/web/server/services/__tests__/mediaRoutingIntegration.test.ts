import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external services (database, credit, skill loading, etc.)
// but use REAL orchestrator, registry, and executors

vi.mock("../skillRegistry", () => ({
  getSkillByIdAsync: vi.fn(),
  getSkillById: vi.fn(),
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

vi.mock("../monitoringService", () => ({
  recordContextEngineMetric: vi.fn().mockResolvedValue({ checkId: 1 }),
}));

vi.mock("../auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

vi.mock("../traceContext", () => ({
  getTraceId: vi.fn().mockReturnValue("integration-trace-123"),
}));

// Mock the media generation service (external I/O)
vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: {
    generateImage: vi.fn(),
    generateVideoAsync: vi.fn(),
    generateAudioAsync: vi.fn(),
  },
  DEFAULT_MODELS: {
    image: "google-nano-banana-pro",
    video: "veo-3-1",
    audio: "elevenlabs-tts",
  },
}));

// Mock skillModelFallback for text executor
vi.mock("../skillModelFallback", () => ({
  executeSkillLlmWithFallback: vi.fn(),
}));

// Mock context builder services
vi.mock("../personaService", () => ({
  buildPersonaPromptSegments: vi.fn(),
  getPersonaById: vi.fn(),
}));
vi.mock("../scopedMemoryService", () => ({
  retrieveForPrompt: vi.fn(),
}));
vi.mock("../chatService", () => ({
  getEntityMemories: vi.fn(),
}));
vi.mock("../promptComposer", () => ({
  composePrompt: vi.fn(),
}));
vi.mock("../webSearchToolInjector", () => ({
  buildWebSearchParams: vi.fn(),
  detectProviderFamily: vi.fn(),
}));
vi.mock("../llmRouter", () => ({
  getProviderForModel: vi.fn(),
}));
vi.mock("../../_core/tokens", () => ({
  signBearerToken: vi.fn().mockReturnValue("mock-server-token"),
}));

vi.mock("../rateLimiter", () => ({
  skillExecutionLimiter: {
    isAllowed: vi.fn().mockReturnValue(true),
    getResetTime: vi.fn().mockReturnValue(0),
  },
}));

vi.mock("../promptEnhancementService", () => ({
  buildSystemPrompt: vi.fn(),
  buildUserPrompt: vi.fn(),
}));

// --- Real imports (triggers executor self-registration) ---

import { executeUnified, classifyCapability } from "../unifiedOrchestrator";
import { getExecutor, getAllExecutors, clearRegistry } from "../executors/executorRegistry";
import { getSkillByIdAsync, getSkillById } from "../skillRegistry";
import { resolveSkillExecutionPolicy } from "../skillExecutionPolicy";
import { runPlanner } from "../taskPlannerMiddleware";
import { classifyArtifactIntent } from "../artifactRouter";
import { deductCreditsForModel, calculateCreditsForLLMDynamic } from "../creditService";
import { mediaGenerationService } from "../mediaGenerationService";
import { composePrompt } from "../promptComposer";
import type { UnifiedExecutionRequest } from "../executors/types";

// --- Typed mocks ---
const mockGetSkillByIdAsync = vi.mocked(getSkillByIdAsync);
const mockGetSkillById = vi.mocked(getSkillById);
const mockResolvePolicy = vi.mocked(resolveSkillExecutionPolicy);
const mockRunPlanner = vi.mocked(runPlanner);
const mockClassifyArtifact = vi.mocked(classifyArtifactIntent);
const mockDeductCredits = vi.mocked(deductCreditsForModel);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLMDynamic);
const mockGenerateImage = vi.mocked(mediaGenerationService.generateImage);
const mockGenerateVideo = vi.mocked(mediaGenerationService.generateVideoAsync);
const mockGenerateAudio = vi.mocked(mediaGenerationService.generateAudioAsync);
const mockComposePrompt = vi.mocked(composePrompt);

// --- Skill Fixtures ---

function makeImageSkill(): any {
  return {
    id: "test-image-skill",
    slug: "test-image-generator",
    name: "Test Image Generator",
    category: "image_generation",
    executionMode: "media-generate",
    executionPolicy: {},
    systemPrompt: "Generate images",
    tags: [],
  };
}

function makeVideoSkill(): any {
  return {
    id: "test-video-skill",
    slug: "test-video-creator",
    name: "Test Video Creator",
    category: "video_generation",
    executionMode: "media-generate",
    executionPolicy: {},
    systemPrompt: "Generate videos",
    tags: [],
  };
}

function makeAudioSkill(): any {
  return {
    id: "test-audio-skill",
    slug: "test-audio-composer",
    name: "Test Audio Composer",
    category: "audio_generation",
    executionMode: "media-generate",
    executionPolicy: {},
    systemPrompt: "Generate audio",
    tags: [],
  };
}

function makeTextSkill(): any {
  return {
    id: "test-text-skill",
    slug: "general-article-writer",
    name: "General Article Writer",
    category: "prompt_enhancement",
    executionMode: "llm-only",
    executionPolicy: {},
    systemPrompt: "You are a helpful writer",
    tags: [],
  };
}

// --- Request Builders ---

function makeChatRequest(
  skillId: string,
  overrides?: Partial<UnifiedExecutionRequest>,
): UnifiedExecutionRequest {
  return {
    channel: "chat",
    userId: 1,
    tenantId: "test-tenant",
    userMessage: "Generate something for me",
    routeHint: { selectedSkillId: skillId, route: "skill", reason: "user_selected" },
    creditMode: "calculate_only",
    ...overrides,
  };
}

function makeTeamRoomRequest(
  skillId: string,
  overrides?: Partial<UnifiedExecutionRequest>,
): UnifiedExecutionRequest {
  return {
    channel: "team_room",
    userId: 1,
    tenantId: "test-tenant",
    userMessage: "Generate something for me",
    teamContext: {
      assistantId: "asst-1",
      roomId: "room-1",
      teamId: "team-1",
      objective: "Test objective",
    },
    routeHint: { selectedSkillId: skillId, route: "skill", reason: "user_selected" },
    creditMode: "calculate_only",
    ...overrides,
  };
}

// --- Setup ---

beforeEach(() => {
  vi.clearAllMocks();

  // Default: resolve any skill as text skill for safety
  mockGetSkillByIdAsync.mockResolvedValue(makeTextSkill());
  mockGetSkillById.mockReturnValue(makeTextSkill());
  mockResolvePolicy.mockResolvedValue({
    modelId: "gpt-4o-mini",
    preferredProviderId: 1,
    strictProviderPin: false,
    allowFreeModels: false,
  } as any);
  mockRunPlanner.mockResolvedValue(null);
  mockClassifyArtifact.mockReturnValue("chat_reply" as any);
  mockCalculateCredits.mockResolvedValue(2);
  mockDeductCredits.mockResolvedValue({ creditsUsed: 2 } as any);

  // Mock media service responses
  mockGenerateImage.mockResolvedValue({
    success: true,
    data: [{ id: "img-1", url: "https://cdn.example.com/img.png" }],
    creditsUsed: 10,
    creditsBalance: 90,
    model: "flux-2.0",
  } as any);

  mockGenerateVideo.mockResolvedValue({
    id: "task-vid-1",
    userId: "1",
    mediaType: "video",
    status: "pending",
    model: "veo-3-1",
    prompt: "test",
    createdAt: "2026-03-21T00:00:00Z",
  } as any);

  mockGenerateAudio.mockResolvedValue({
    id: "task-aud-1",
    userId: "1",
    mediaType: "audio",
    status: "pending",
    model: "elevenlabs-tts",
    prompt: "test",
    createdAt: "2026-03-21T00:00:00Z",
  } as any);

  mockComposePrompt.mockResolvedValue({
    messages: [{ role: "system", content: "team composed" }],
    estimatedTokens: 50,
  });
});

// --- Tests ---

describe("Media Routing Integration", () => {
  describe("Capability Classification", () => {
    it("image_generation skill classifies as media.image", () => {
      expect(classifyCapability(makeImageSkill())).toBe("media.image");
    });

    it("video_generation skill classifies as media.video", () => {
      expect(classifyCapability(makeVideoSkill())).toBe("media.video");
    });

    it("audio_generation skill classifies as media.audio", () => {
      expect(classifyCapability(makeAudioSkill())).toBe("media.audio");
    });

    it("capability_family in executionPolicy overrides category", () => {
      const skill = { ...makeTextSkill(), executionPolicy: { capability_family: "media.image" } };
      expect(classifyCapability(skill)).toBe("media.image");
    });

    it("prompt_enhancement does NOT classify as media", () => {
      expect(classifyCapability(makeTextSkill())).toBe("writing.article");
    });
  });

  describe("Registry Verification", () => {
    it("media executors are registered after module import", () => {
      const imageExec = getExecutor("media.image");
      const videoExec = getExecutor("media.video");
      const audioExec = getExecutor("media.audio");

      expect(imageExec).not.toBeNull();
      expect(imageExec!.id).toBe("image-generation");
      expect(videoExec).not.toBeNull();
      expect(videoExec!.id).toBe("video-generation");
      expect(audioExec).not.toBeNull();
      expect(audioExec!.id).toBe("audio-generation");
    });

    it("getAllExecutors includes text and media executors", () => {
      const all = getAllExecutors();
      const ids = all.map((e) => e.id);
      expect(ids).toContain("text-skill-executor");
      expect(ids).toContain("image-generation");
      expect(ids).toContain("video-generation");
      expect(ids).toContain("audio-generation");
    });
  });

  describe("End-to-End Media Routing (Chat)", () => {
    it("image skill routes to ImageGenerationExecutor", async () => {
      mockGetSkillByIdAsync.mockResolvedValue(makeImageSkill());

      const result = await executeUnified(makeChatRequest("test-image-skill"));

      expect(result.route.capability).toBe("media.image");
      expect(result.route.executorId).toBe("image-generation");
      expect(result.result.type).toBe("media_job");
      expect((result.result as any).mediaType).toBe("image");
      expect(mockGenerateImage).toHaveBeenCalled();
    });

    it("video skill routes to VideoGenerationExecutor", async () => {
      mockGetSkillByIdAsync.mockResolvedValue(makeVideoSkill());

      const result = await executeUnified(makeChatRequest("test-video-skill"));

      expect(result.route.capability).toBe("media.video");
      expect(result.route.executorId).toBe("video-generation");
      expect(result.result.type).toBe("media_job");
      expect((result.result as any).mediaType).toBe("video");
      expect(mockGenerateVideo).toHaveBeenCalled();
    });

    it("audio skill routes to AudioGenerationExecutor", async () => {
      mockGetSkillByIdAsync.mockResolvedValue(makeAudioSkill());

      const result = await executeUnified(makeChatRequest("test-audio-skill"));

      expect(result.route.capability).toBe("media.audio");
      expect(result.route.executorId).toBe("audio-generation");
      expect(result.result.type).toBe("media_job");
      expect((result.result as any).mediaType).toBe("audio");
      expect(mockGenerateAudio).toHaveBeenCalled();
    });
  });

  describe("End-to-End Media Routing (Team Room)", () => {
    it("image skill routes to ImageGenerationExecutor from team_room", async () => {
      mockGetSkillByIdAsync.mockResolvedValue(makeImageSkill());

      const result = await executeUnified(makeTeamRoomRequest("test-image-skill"));

      expect(result.route.capability).toBe("media.image");
      expect(result.route.executorId).toBe("image-generation");
      expect(result.result.type).toBe("media_job");
    });

    it("video skill routes to VideoGenerationExecutor from team_room", async () => {
      mockGetSkillByIdAsync.mockResolvedValue(makeVideoSkill());

      const result = await executeUnified(makeTeamRoomRequest("test-video-skill"));

      expect(result.route.capability).toBe("media.video");
      expect(result.route.executorId).toBe("video-generation");
    });

    it("audio skill routes to AudioGenerationExecutor from team_room", async () => {
      mockGetSkillByIdAsync.mockResolvedValue(makeAudioSkill());

      const result = await executeUnified(makeTeamRoomRequest("test-audio-skill"));

      expect(result.route.capability).toBe("media.audio");
      expect(result.route.executorId).toBe("audio-generation");
    });
  });

  describe("Cross-Channel Parity for Media", () => {
    it("same image skill produces identical route from both channels", async () => {
      mockGetSkillByIdAsync.mockResolvedValue(makeImageSkill());

      const chatResult = await executeUnified(makeChatRequest("test-image-skill"));
      const teamResult = await executeUnified(makeTeamRoomRequest("test-image-skill"));

      expect(chatResult.route.capability).toBe(teamResult.route.capability);
      expect(chatResult.route.executorId).toBe(teamResult.route.executorId);
    });

    it("same video skill produces identical route from both channels", async () => {
      mockGetSkillByIdAsync.mockResolvedValue(makeVideoSkill());

      const chatResult = await executeUnified(makeChatRequest("test-video-skill"));
      const teamResult = await executeUnified(makeTeamRoomRequest("test-video-skill"));

      expect(chatResult.route.capability).toBe(teamResult.route.capability);
      expect(chatResult.route.executorId).toBe(teamResult.route.executorId);
    });

    it("same audio skill produces identical route from both channels", async () => {
      mockGetSkillByIdAsync.mockResolvedValue(makeAudioSkill());

      const chatResult = await executeUnified(makeChatRequest("test-audio-skill"));
      const teamResult = await executeUnified(makeTeamRoomRequest("test-audio-skill"));

      expect(chatResult.route.capability).toBe(teamResult.route.capability);
      expect(chatResult.route.executorId).toBe(teamResult.route.executorId);
    });
  });

  describe("Media Executor Failure Handling", () => {
    it("image dispatch failure returns error result", async () => {
      mockGetSkillByIdAsync.mockResolvedValue(makeImageSkill());
      mockGenerateImage.mockRejectedValue(new Error("Provider unavailable"));

      const result = await executeUnified(makeChatRequest("test-image-skill"));

      expect(result.route.capability).toBe("media.image");
      expect(result.metadata.success).toBe(false);
      expect(result.metadata.error).toBe("media_generation_failed");
    });

    it("credit mode calculate_only returns cost without deduction", async () => {
      mockGetSkillByIdAsync.mockResolvedValue(makeImageSkill());

      const result = await executeUnified(
        makeChatRequest("test-image-skill", { creditMode: "calculate_only" }),
      );

      expect(result.costCredits).toBeDefined();
      expect(mockDeductCredits).not.toHaveBeenCalled();
    });
  });
});
