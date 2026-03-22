diff --git a/apps/web/server/services/__tests__/channelParityTests.test.ts b/apps/web/server/services/__tests__/channelParityTests.test.ts
new file mode 100644
index 00000000..837c95db
--- /dev/null
+++ b/apps/web/server/services/__tests__/channelParityTests.test.ts
@@ -0,0 +1,466 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// --- Mocks ---
+
+vi.mock("../skillRegistry", () => ({
+  getSkillByIdAsync: vi.fn(),
+  getSkillById: vi.fn(),
+}));
+
+vi.mock("../executors/executorRegistry", () => ({
+  getExecutor: vi.fn(),
+  registerExecutor: vi.fn(),
+}));
+
+vi.mock("../executors/contextBuilder", () => ({
+  buildChatContext: vi.fn(),
+  buildTeamContext: vi.fn(),
+  buildDynamicModelRequirements: vi.fn(),
+  buildPromptEnhancementContext: vi.fn(),
+  injectWebSearchIfNeeded: vi.fn(),
+}));
+
+vi.mock("../skillExecutionPolicy", () => ({
+  resolveSkillExecutionPolicy: vi.fn(),
+}));
+
+vi.mock("../taskPlannerMiddleware", () => ({
+  runPlanner: vi.fn(),
+  recordStepAttempt: vi.fn(),
+}));
+
+vi.mock("../artifactRouter", () => ({
+  classifyArtifactIntent: vi.fn(),
+  selectExecutionRoute: vi.fn(),
+}));
+
+vi.mock("../creditService", () => ({
+  deductCreditsForModel: vi.fn(),
+  calculateCreditsForLLMDynamic: vi.fn(),
+}));
+
+vi.mock("../auditLogger", () => ({
+  auditLogger: { log: vi.fn() },
+}));
+
+vi.mock("../traceContext", () => ({
+  getTraceId: vi.fn().mockReturnValue("parity-trace-123"),
+}));
+
+vi.mock("../executors/textSkillExecutor", () => ({
+  TextSkillExecutor: vi.fn(),
+  textSkillExecutor: {},
+}));
+
+// --- Imports ---
+
+import { executeUnified } from "../unifiedOrchestrator";
+import { getSkillByIdAsync, getSkillById } from "../skillRegistry";
+import { getExecutor } from "../executors/executorRegistry";
+import {
+  buildChatContext,
+  buildTeamContext,
+  buildDynamicModelRequirements,
+  buildPromptEnhancementContext,
+  injectWebSearchIfNeeded,
+} from "../executors/contextBuilder";
+import { resolveSkillExecutionPolicy } from "../skillExecutionPolicy";
+import { runPlanner } from "../taskPlannerMiddleware";
+import { classifyArtifactIntent } from "../artifactRouter";
+import {
+  deductCreditsForModel,
+  calculateCreditsForLLMDynamic,
+} from "../creditService";
+import type {
+  UnifiedExecutionRequest,
+  ExecutorResult,
+  CapabilityExecutor,
+  CapabilityFamily,
+} from "../executors/types";
+
+// --- Typed mocks ---
+
+const mockGetSkillByIdAsync = vi.mocked(getSkillByIdAsync);
+const mockGetSkillById = vi.mocked(getSkillById);
+const mockGetExecutor = vi.mocked(getExecutor);
+const mockBuildChatContext = vi.mocked(buildChatContext);
+const mockBuildTeamContext = vi.mocked(buildTeamContext);
+const mockBuildDynamicModelReqs = vi.mocked(buildDynamicModelRequirements);
+const mockBuildPromptEnhancement = vi.mocked(buildPromptEnhancementContext);
+const mockInjectWebSearch = vi.mocked(injectWebSearchIfNeeded);
+const mockResolvePolicy = vi.mocked(resolveSkillExecutionPolicy);
+const mockRunPlanner = vi.mocked(runPlanner);
+const mockClassifyArtifact = vi.mocked(classifyArtifactIntent);
+const mockDeductCredits = vi.mocked(deductCreditsForModel);
+const mockCalculateCredits = vi.mocked(calculateCreditsForLLMDynamic);
+
+// --- Fixtures ---
+
+function mockSkill(overrides?: Record<string, unknown>): any {
+  return {
+    id: "test-skill",
+    slug: "test-skill",
+    name: "Test Skill",
+    category: "prompt_enhancement",
+    type: "llm-only",
+    executionMode: "llm-only",
+    executionPolicy: {},
+    systemPrompt: "You are a helpful assistant.",
+    tags: [],
+    enabled: true,
+    ...overrides,
+  };
+}
+
+const defaultExecutorResult: ExecutorResult = {
+  success: true,
+  content: "Generated content for test",
+  inputTokens: 100,
+  outputTokens: 200,
+  modelUsed: "gpt-4o",
+  attempts: [
+    {
+      attempt: 1,
+      modelId: "gpt-4o",
+      providerName: "openai",
+      statusCode: 200,
+      errorType: null,
+      errorMessage: null,
+      durationMs: 300,
+      success: true,
+    },
+  ],
+  totalDurationMs: 300,
+};
+
+const textExecutor: CapabilityExecutor = {
+  id: "text-skill-executor",
+  capabilities: ["writing.article", "writing.review"] as readonly CapabilityFamily[],
+  canHandle: vi.fn().mockReturnValue(true),
+  execute: vi.fn().mockResolvedValue(defaultExecutorResult),
+};
+
+const imageExecutor: CapabilityExecutor = {
+  id: "image-generation-executor",
+  capabilities: ["media.image"] as readonly CapabilityFamily[],
+  canHandle: vi.fn().mockReturnValue(true),
+  execute: vi.fn().mockResolvedValue({
+    ...defaultExecutorResult,
+    mediaJob: { mediaType: "image", jobPayload: { jobId: "img-job-1" } },
+  }),
+};
+
+const videoExecutor: CapabilityExecutor = {
+  id: "video-generation-executor",
+  capabilities: ["media.video"] as readonly CapabilityFamily[],
+  canHandle: vi.fn().mockReturnValue(true),
+  execute: vi.fn().mockResolvedValue({
+    ...defaultExecutorResult,
+    mediaJob: { mediaType: "video", jobPayload: { jobId: "vid-job-1" } },
+  }),
+};
+
+// --- Helpers ---
+
+function buildChatRequest(
+  overrides?: Partial<UnifiedExecutionRequest>,
+): UnifiedExecutionRequest {
+  return {
+    channel: "chat",
+    userId: 1,
+    tenantId: "tenant-1",
+    userMessage: "Write about AI technology",
+    routeHint: {
+      selectedSkillId: "test-skill",
+      route: "skill",
+      reason: "user_selected",
+    },
+    conversationContext: { conversationId: 1 },
+    creditMode: "deduct",
+    ...overrides,
+  };
+}
+
+function buildTeamRoomRequest(
+  overrides?: Partial<UnifiedExecutionRequest>,
+): UnifiedExecutionRequest {
+  return {
+    channel: "team_room",
+    userId: 1,
+    tenantId: "tenant-1",
+    userMessage: "Write about AI technology",
+    routeHint: {
+      selectedSkillId: "test-skill",
+      route: "skill",
+      reason: "user_selected",
+    },
+    teamContext: {
+      assistantId: "assistant-1",
+      roomId: "room-1",
+      teamId: "team-1",
+      objective: "Write about AI technology",
+    },
+    creditMode: "calculate_only",
+    ...overrides,
+  };
+}
+
+// --- Setup ---
+
+beforeEach(() => {
+  vi.clearAllMocks();
+
+  const skill = mockSkill();
+  mockGetSkillByIdAsync.mockResolvedValue(skill);
+  mockGetSkillById.mockReturnValue(skill);
+  mockGetExecutor.mockReturnValue(textExecutor);
+  mockBuildChatContext.mockResolvedValue([
+    { role: "system", content: "chat context" },
+    { role: "user", content: "Write about AI technology" },
+  ]);
+  mockBuildTeamContext.mockResolvedValue([
+    { role: "system", content: "team context" },
+  ] as any);
+  mockBuildDynamicModelReqs.mockReturnValue({
+    requirements: {},
+    hasOverrides: false,
+  });
+  mockBuildPromptEnhancement.mockResolvedValue(null);
+  mockInjectWebSearch.mockResolvedValue(null);
+  mockResolvePolicy.mockResolvedValue({
+    modelId: "gpt-4o",
+    preferredProviderId: 1,
+    strictProviderPin: false,
+    allowFreeModels: false,
+  } as any);
+  mockRunPlanner.mockResolvedValue(null);
+  mockClassifyArtifact.mockReturnValue("chat_reply" as any);
+  mockDeductCredits.mockResolvedValue({ creditsUsed: 5 } as any);
+  mockCalculateCredits.mockResolvedValue(5);
+
+  (textExecutor.execute as any).mockResolvedValue(defaultExecutorResult);
+});
+
+// --- Tests ---
+
+describe("Channel Parity Tests", () => {
+  describe("Routing Parity", () => {
+    it("article writing skill -- same capability for chat and team_room", async () => {
+      const chatResult = await executeUnified(buildChatRequest());
+      const teamResult = await executeUnified(buildTeamRoomRequest());
+
+      expect(chatResult.route.capability).toBe("writing.article");
+      expect(teamResult.route.capability).toBe("writing.article");
+      expect(chatResult.route.executorId).toBe(teamResult.route.executorId);
+    });
+
+    it("review skill -- same capability for both channels", async () => {
+      const skill = mockSkill({ slug: "product-review-writer", tags: ["review"] });
+      mockGetSkillByIdAsync.mockResolvedValue(skill);
+      mockGetSkillById.mockReturnValue(skill);
+
+      const chatResult = await executeUnified(buildChatRequest());
+      const teamResult = await executeUnified(buildTeamRoomRequest());
+
+      expect(chatResult.route.capability).toBe("writing.review");
+      expect(teamResult.route.capability).toBe("writing.review");
+      expect(chatResult.route.executorId).toBe(teamResult.route.executorId);
+    });
+
+    it("image generation skill -- same capability for both channels", async () => {
+      const skill = mockSkill({ category: "image_generation" });
+      mockGetSkillByIdAsync.mockResolvedValue(skill);
+      mockGetSkillById.mockReturnValue(skill);
+      mockGetExecutor.mockReturnValue(imageExecutor);
+
+      const chatResult = await executeUnified(buildChatRequest());
+      const teamResult = await executeUnified(buildTeamRoomRequest());
+
+      expect(chatResult.route.capability).toBe("media.image");
+      expect(teamResult.route.capability).toBe("media.image");
+    });
+
+    it("video generation skill -- same capability for both channels", async () => {
+      const skill = mockSkill({ category: "video_generation" });
+      mockGetSkillByIdAsync.mockResolvedValue(skill);
+      mockGetSkillById.mockReturnValue(skill);
+      mockGetExecutor.mockReturnValue(videoExecutor);
+
+      const chatResult = await executeUnified(buildChatRequest());
+      const teamResult = await executeUnified(buildTeamRoomRequest());
+
+      expect(chatResult.route.capability).toBe("media.video");
+      expect(teamResult.route.capability).toBe("media.video");
+    });
+
+    it("skill not found -- same fallback for both channels", async () => {
+      mockGetSkillByIdAsync.mockResolvedValue(undefined);
+      const fallbackSkill = mockSkill({ id: "general-article-writer", slug: "general-article-writer" });
+      mockGetSkillById.mockReturnValue(fallbackSkill);
+
+      const chatResult = await executeUnified(buildChatRequest());
+      const teamResult = await executeUnified(buildTeamRoomRequest());
+
+      expect(chatResult.skillId).toBe("general-article-writer");
+      expect(teamResult.skillId).toBe("general-article-writer");
+      expect(chatResult.route.capability).toBe(teamResult.route.capability);
+    });
+
+    it("no routeHint.selectedSkillId -- same fallback for both channels", async () => {
+      const chatResult = await executeUnified(
+        buildChatRequest({ routeHint: undefined }),
+      );
+      const teamResult = await executeUnified(
+        buildTeamRoomRequest({ routeHint: undefined }),
+      );
+
+      expect(chatResult.route.capability).toBe(teamResult.route.capability);
+    });
+  });
+
+  describe("Policy Parity", () => {
+    it("same skill + requires_web_search -- web search enabled for both", async () => {
+      const skill = mockSkill({
+        executionPolicy: { requires_web_search: true },
+      });
+      mockGetSkillByIdAsync.mockResolvedValue(skill);
+      mockGetSkillById.mockReturnValue(skill);
+
+      await executeUnified(buildChatRequest());
+      await executeUnified(buildTeamRoomRequest());
+
+      // injectWebSearchIfNeeded should be called for both
+      expect(mockInjectWebSearch).toHaveBeenCalledTimes(2);
+    });
+
+    it("same skill + requires_thinking -- thinking enabled for both", async () => {
+      const skill = mockSkill({
+        executionPolicy: { requires_thinking: true, thinking_level_hint: "high" },
+      });
+      mockGetSkillByIdAsync.mockResolvedValue(skill);
+      mockGetSkillById.mockReturnValue(skill);
+      mockBuildDynamicModelReqs.mockReturnValue({
+        requirements: { supportsThinking: true },
+        hasOverrides: true,
+      });
+
+      await executeUnified(buildChatRequest());
+      await executeUnified(buildTeamRoomRequest());
+
+      expect(mockBuildDynamicModelReqs).toHaveBeenCalledTimes(2);
+    });
+
+    it("reference images -- vision enabled for both channels", async () => {
+      const attachments = [{ type: "image" as const, url: "https://example.com/img.png" }];
+
+      await executeUnified(buildChatRequest({ attachments }));
+      await executeUnified(buildTeamRoomRequest({ attachments }));
+
+      // Both calls should have hasImages=true
+      const calls = mockBuildDynamicModelReqs.mock.calls;
+      expect(calls).toHaveLength(2);
+      expect(calls[0][1]).toBe(true); // hasImages for chat
+      expect(calls[1][1]).toBe(true); // hasImages for team_room
+    });
+
+    it("review skill -- enhanced requirements for both channels", async () => {
+      const skill = mockSkill({ category: "review", tags: ["review"] });
+      mockGetSkillByIdAsync.mockResolvedValue(skill);
+      mockGetSkillById.mockReturnValue(skill);
+      mockBuildDynamicModelReqs.mockReturnValue({
+        requirements: { supportsWebSearch: true, supportsThinking: true, contextLength: 500_000 },
+        hasOverrides: true,
+      });
+
+      const chatResult = await executeUnified(buildChatRequest());
+      const teamResult = await executeUnified(buildTeamRoomRequest());
+
+      expect(chatResult.route.capability).toBe(teamResult.route.capability);
+      expect(mockBuildDynamicModelReqs).toHaveBeenCalledTimes(2);
+    });
+  });
+
+  describe("Credit Parity", () => {
+    it("same execution -- same cost calculation regardless of channel", async () => {
+      const chatResult = await executeUnified(
+        buildChatRequest({ creditMode: "deduct" }),
+      );
+      const teamResult = await executeUnified(
+        buildTeamRoomRequest({ creditMode: "calculate_only" }),
+      );
+
+      expect(chatResult.costCredits).toBe(5);
+      expect(teamResult.costCredits).toBe(5);
+    });
+
+    it("chat deducts, team room calculates only (designed difference)", async () => {
+      vi.clearAllMocks();
+      // Re-setup mocks after clearAllMocks
+      mockGetSkillByIdAsync.mockResolvedValue(mockSkill());
+      mockGetSkillById.mockReturnValue(mockSkill());
+      mockGetExecutor.mockReturnValue(textExecutor);
+      mockBuildChatContext.mockResolvedValue([
+        { role: "system", content: "s" },
+        { role: "user", content: "u" },
+      ]);
+      mockBuildTeamContext.mockResolvedValue([{ role: "system", content: "t" }] as any);
+      mockBuildDynamicModelReqs.mockReturnValue({ requirements: {}, hasOverrides: false });
+      mockBuildPromptEnhancement.mockResolvedValue(null);
+      mockInjectWebSearch.mockResolvedValue(null);
+      mockResolvePolicy.mockResolvedValue({ modelId: "gpt-4o" } as any);
+      mockRunPlanner.mockResolvedValue(null);
+      mockClassifyArtifact.mockReturnValue("chat_reply" as any);
+      mockDeductCredits.mockResolvedValue({ creditsUsed: 5 } as any);
+      mockCalculateCredits.mockResolvedValue(5);
+      (textExecutor.execute as any).mockResolvedValue(defaultExecutorResult);
+
+      await executeUnified(buildChatRequest({ creditMode: "deduct" }));
+      await executeUnified(buildTeamRoomRequest({ creditMode: "calculate_only" }));
+
+      expect(mockDeductCredits).toHaveBeenCalledTimes(1);
+      expect(mockCalculateCredits).toHaveBeenCalledTimes(1);
+    });
+  });
+
+  describe("Failure Parity", () => {
+    it("executor failure -- same error shape for both channels", async () => {
+      const failResult: ExecutorResult = {
+        success: false,
+        error: "All models exhausted",
+        inputTokens: 0,
+        outputTokens: 0,
+        attempts: [],
+        totalDurationMs: 100,
+      };
+      (textExecutor.execute as any).mockResolvedValue(failResult);
+
+      const chatResult = await executeUnified(buildChatRequest());
+      const teamResult = await executeUnified(buildTeamRoomRequest());
+
+      expect(chatResult.metadata.success).toBe(false);
+      expect(teamResult.metadata.success).toBe(false);
+      expect(chatResult.metadata.error).toBe(teamResult.metadata.error);
+    });
+
+    it("skill resolution failure -- same error for both channels", async () => {
+      mockGetSkillByIdAsync.mockResolvedValue(undefined);
+      mockGetSkillById.mockReturnValue(undefined);
+
+      const chatResult = await executeUnified(buildChatRequest());
+      const teamResult = await executeUnified(buildTeamRoomRequest());
+
+      expect(chatResult.route.reason).toBe("skill_resolution_failed");
+      expect(teamResult.route.reason).toBe("skill_resolution_failed");
+    });
+
+    it("executor not found -- same fallback for both channels", async () => {
+      mockGetExecutor.mockReturnValue(null);
+
+      const chatResult = await executeUnified(buildChatRequest());
+      const teamResult = await executeUnified(buildTeamRoomRequest());
+
+      expect(chatResult.route.reason).toBe(teamResult.route.reason);
+      expect(chatResult.telemetry.executorId).toBe(teamResult.telemetry.executorId);
+    });
+  });
+});
