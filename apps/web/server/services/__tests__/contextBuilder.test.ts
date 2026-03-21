import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
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

vi.mock("../promptEnhancementService", () => ({
  buildSystemPrompt: vi.fn(),
  buildUserPrompt: vi.fn(),
}));

import {
  buildChatContext,
  buildTeamContext,
  buildDynamicModelRequirements,
  buildPromptEnhancementContext,
  injectWebSearchIfNeeded,
} from "../executors/contextBuilder";

import { buildPersonaPromptSegments, getPersonaById } from "../personaService";
import { retrieveForPrompt } from "../scopedMemoryService";
import { getEntityMemories } from "../chatService";
import { composePrompt } from "../promptComposer";
import {
  buildWebSearchParams,
  detectProviderFamily,
} from "../webSearchToolInjector";
import { getProviderForModel } from "../llmRouter";
import {
  buildSystemPrompt,
  buildUserPrompt,
} from "../promptEnhancementService";

import type { UnifiedExecutionRequest } from "../executors/types";

const mockGetPersonaById = vi.mocked(getPersonaById);
const mockBuildPersonaPromptSegments = vi.mocked(buildPersonaPromptSegments);
const mockRetrieveForPrompt = vi.mocked(retrieveForPrompt);
const mockGetEntityMemories = vi.mocked(getEntityMemories);
const mockComposePrompt = vi.mocked(composePrompt);
const mockBuildWebSearchParams = vi.mocked(buildWebSearchParams);
const mockDetectProviderFamily = vi.mocked(detectProviderFamily);
const mockGetProviderForModel = vi.mocked(getProviderForModel);
const mockBuildSystemPrompt = vi.mocked(buildSystemPrompt);
const mockBuildUserPrompt = vi.mocked(buildUserPrompt);

function makeRequest(
  overrides: Partial<UnifiedExecutionRequest> = {},
): UnifiedExecutionRequest {
  return {
    channel: "chat",
    userId: 1,
    tenantId: "t1",
    userMessage: "Hello world",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── buildChatContext ──────────────────────────────────────

describe("buildChatContext", () => {
  it("with persona -- loads persona, builds segments, retrieves memory", async () => {
    const persona = {
      id: "p1",
      systemPromptPrefix: "You are a helper",
      responseStyle: {},
      restrictions: null,
      tone: "friendly",
      assistantNickname: "Buddy",
      assistantGender: "neutral" as const,
    };
    mockGetPersonaById.mockResolvedValue(persona as any);
    mockBuildPersonaPromptSegments.mockReturnValue({
      prefix: "[PERSONA START]\nYou are a helper\n[PERSONA END]",
      styleInstructions: "Respond in a friendly tone.",
      restrictionsBulletPoints: null,
    });
    mockRetrieveForPrompt.mockResolvedValue([
      { content: "User prefers short answers", score: 0.9 } as any,
    ]);
    mockGetEntityMemories.mockResolvedValue([
      { content: "User works in marketing", entityType: "user" } as any,
    ]);

    const req = makeRequest({
      conversationContext: {
        activePersonaId: "p1",
        publicUrl: "https://example.com",
      },
    });

    const messages = await buildChatContext(req, "You are a skill", null);

    expect(mockGetPersonaById).toHaveBeenCalledWith("p1");
    expect(mockBuildPersonaPromptSegments).toHaveBeenCalledWith(persona);
    expect(mockRetrieveForPrompt).toHaveBeenCalled();
    expect(mockGetEntityMemories).toHaveBeenCalled();

    // Should have 3 messages: persona+memory system, skill system, user
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("PERSONA START");
    expect(messages[1].role).toBe("system");
    expect(messages[1].content).toContain("You are a skill");
    expect(messages[2].role).toBe("user");
    expect(messages[2].content).toBe("Hello world");
  });

  it("with persona -- composes messages in correct order", async () => {
    mockGetPersonaById.mockResolvedValue({
      id: "p1",
      systemPromptPrefix: "Prefix",
      responseStyle: {},
      restrictions: null,
      tone: null,
      assistantNickname: null,
      assistantGender: null,
    } as any);
    mockBuildPersonaPromptSegments.mockReturnValue({
      prefix: "persona-prefix",
      styleInstructions: null,
      restrictionsBulletPoints: null,
    });
    mockRetrieveForPrompt.mockResolvedValue([]);
    mockGetEntityMemories.mockResolvedValue([]);

    const req = makeRequest({
      conversationContext: { activePersonaId: "p1" },
    });

    const messages = await buildChatContext(req, "skill prompt", null);

    expect(messages[0].role).toBe("system"); // persona
    expect(messages[1].role).toBe("system"); // skill
    expect(messages[2].role).toBe("user"); // user message
  });

  it("without persona -- returns minimal messages", async () => {
    const req = makeRequest();
    const messages = await buildChatContext(req, "skill prompt", null);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: "system", content: "skill prompt" });
    expect(messages[1]).toEqual({ role: "user", content: "Hello world" });
    expect(mockGetPersonaById).not.toHaveBeenCalled();
  });

  it("knowledgebase appended to skill system prompt when present", async () => {
    const req = makeRequest();
    const messages = await buildChatContext(
      req,
      "skill prompt",
      "domain knowledge here",
    );

    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("skill prompt");
    expect(messages[0].content).toContain("[DOMAIN KNOWLEDGE]");
    expect(messages[0].content).toContain("domain knowledge here");
  });

  it("knowledgebase trimmed to 8K chars max", async () => {
    const req = makeRequest();
    const longKb = "x".repeat(10_000);
    const messages = await buildChatContext(req, "skill prompt", longKb);

    const content = messages[0].content as string;
    // The knowledgebase portion should be max 8000 chars
    const kbStart = content.indexOf("[DOMAIN KNOWLEDGE]\n") + "[DOMAIN KNOWLEDGE]\n".length;
    const kbContent = content.substring(kbStart);
    expect(kbContent.length).toBeLessThanOrEqual(8000);
  });

  it("image URLs resolved from relative to absolute using publicUrl", async () => {
    const req = makeRequest({
      conversationContext: { publicUrl: "https://example.com" },
      dynamicParams: { reference_images: ["/uploads/img1.png"] },
    });

    const messages = await buildChatContext(req, "skill prompt", null);

    const userMsg = messages[messages.length - 1];
    expect(Array.isArray(userMsg.content)).toBe(true);
    const parts = userMsg.content as Array<any>;
    const imgPart = parts.find((p: any) => p.type === "image_url");
    expect(imgPart.image_url.url).toBe("https://example.com/uploads/img1.png");
  });

  it("multimodal content array built correctly with text + image_url parts", async () => {
    const req = makeRequest({
      conversationContext: { publicUrl: "https://example.com" },
      attachments: [{ type: "image" as const, url: "https://cdn.example.com/img.png" }],
    });

    const messages = await buildChatContext(req, "skill prompt", null);

    const userMsg = messages[messages.length - 1];
    expect(Array.isArray(userMsg.content)).toBe(true);
    const parts = userMsg.content as Array<any>;
    expect(parts[0].type).toBe("text");
    expect(parts[0].text).toBe("Hello world");
    expect(parts[1].type).toBe("image_url");
    expect(parts[1].image_url.url).toBe("https://cdn.example.com/img.png");
  });

  it("data:image URIs passed through without URL resolution", async () => {
    const dataUri = "data:image/png;base64,abc123";
    const req = makeRequest({
      dynamicParams: { reference_images: [dataUri] },
    });

    const messages = await buildChatContext(req, "skill prompt", null);

    const userMsg = messages[messages.length - 1];
    const parts = userMsg.content as Array<any>;
    const imgPart = parts.find((p: any) => p.type === "image_url");
    expect(imgPart.image_url.url).toBe(dataUri);
  });

  it("empty/null persona scoped memory does not inject empty blocks", async () => {
    mockGetPersonaById.mockResolvedValue({
      id: "p1",
      systemPromptPrefix: "Prefix",
      responseStyle: {},
      restrictions: null,
      tone: null,
      assistantNickname: null,
      assistantGender: null,
    } as any);
    mockBuildPersonaPromptSegments.mockReturnValue({
      prefix: "persona-prefix",
      styleInstructions: null,
      restrictionsBulletPoints: null,
    });
    mockRetrieveForPrompt.mockResolvedValue([]);
    mockGetEntityMemories.mockResolvedValue([]);

    const req = makeRequest({
      conversationContext: { activePersonaId: "p1" },
    });

    const messages = await buildChatContext(req, "skill prompt", null);

    const personaMsg = messages[0].content as string;
    // Should not contain empty "Scoped Memory:" or "Entity Memory:" sections
    expect(personaMsg).not.toContain("[SCOPED MEMORY]\n\n");
    expect(personaMsg).not.toContain("[ENTITY MEMORY]\n\n");
  });
});

// ─── buildTeamContext ──────────────────────────────────────

describe("buildTeamContext", () => {
  it("delegates to composePrompt with correct parameters", async () => {
    mockComposePrompt.mockResolvedValue({
      messages: [{ role: "system", content: "composed" }],
      estimatedTokens: 100,
    });

    const req = makeRequest({
      channel: "team_room",
      teamContext: {
        assistantId: "a1",
        roomId: "r1",
        teamId: "t1",
        runId: "run1",
        objective: "Write an article",
      },
    });

    const messages = await buildTeamContext(req, "tenant1");

    expect(mockComposePrompt).toHaveBeenCalledWith({
      assistantId: "a1",
      runId: "run1",
      roomId: "r1",
      teamId: "t1",
      objective: "Write an article",
      tenantId: "tenant1",
    });
  });

  it("returns composed messages array from composePrompt result", async () => {
    const expectedMessages = [
      { role: "system" as const, content: "system msg" },
      { role: "user" as const, content: "user msg" },
    ];
    mockComposePrompt.mockResolvedValue({
      messages: expectedMessages,
      estimatedTokens: 200,
    });

    const req = makeRequest({
      channel: "team_room",
      teamContext: {
        assistantId: "a1",
        roomId: "r1",
        teamId: "t1",
        objective: "Do work",
      },
    });

    const messages = await buildTeamContext(req, "tenant1");
    expect(messages).toEqual(expectedMessages);
  });
});

// ─── buildDynamicModelRequirements ──────────────────────────

describe("buildDynamicModelRequirements", () => {
  it("hasImages flag adds supportsVision: true", () => {
    const result = buildDynamicModelRequirements(
      { executionPolicy: null },
      true,
      undefined,
    );
    expect(result.requirements).toHaveProperty("supportsVision", true);
    expect(result.hasOverrides).toBe(true);
  });

  it("skill with requires_web_search adds supportsWebSearch: true", () => {
    const result = buildDynamicModelRequirements(
      { executionPolicy: { requires_web_search: true } },
      false,
      undefined,
    );
    expect(result.requirements).toHaveProperty("supportsWebSearch", true);
  });

  it("skill with requires_thinking adds supportsThinking: true", () => {
    const result = buildDynamicModelRequirements(
      { executionPolicy: { requires_thinking: true } },
      false,
      undefined,
    );
    expect(result.requirements).toHaveProperty("supportsThinking", true);
  });

  it("skill with thinking_level_hint 'high' adds supportsThinking", () => {
    const result = buildDynamicModelRequirements(
      { executionPolicy: { thinking_level_hint: "high" } },
      false,
      undefined,
    );
    expect(result.requirements).toHaveProperty("supportsThinking", true);
  });

  it("skill with thinking_level_hint 'medium' adds supportsThinking", () => {
    const result = buildDynamicModelRequirements(
      { executionPolicy: { thinking_level_hint: "medium" } },
      false,
      undefined,
    );
    expect(result.requirements).toHaveProperty("supportsThinking", true);
  });

  it("review skill gets supportsWebSearch + supportsThinking + 500K contextLength", () => {
    const result = buildDynamicModelRequirements(
      { executionPolicy: null, category: "review" },
      false,
      undefined,
    );
    expect(result.requirements).toHaveProperty("supportsWebSearch", true);
    expect(result.requirements).toHaveProperty("supportsThinking", true);
    expect(result.requirements).toHaveProperty("contextLength", 500_000);
  });

  it("complex skill (thinking_level_hint high) gets enhanced requirements", () => {
    const result = buildDynamicModelRequirements(
      { executionPolicy: { thinking_level_hint: "high" } },
      false,
      undefined,
    );
    expect(result.requirements).toHaveProperty("supportsWebSearch", true);
    expect(result.requirements).toHaveProperty("supportsThinking", true);
    expect(result.requirements).toHaveProperty("contextLength", 500_000);
  });

  it("route reason containing 'web_search' adds supportsWebSearch", () => {
    const result = buildDynamicModelRequirements(
      { executionPolicy: null },
      false,
      "auto_web_search",
    );
    expect(result.requirements).toHaveProperty("supportsWebSearch", true);
  });

  it("base requirements from execution policy are preserved and merged", () => {
    const result = buildDynamicModelRequirements(
      {
        executionPolicy: {
          requirements: { customField: "value", contextLength: 100_000 },
          requires_web_search: true,
        },
      },
      false,
      undefined,
    );
    expect(result.requirements).toHaveProperty("customField", "value");
    expect(result.requirements).toHaveProperty("supportsWebSearch", true);
  });

  it("returns unchanged base requirements when no overrides needed", () => {
    const result = buildDynamicModelRequirements(
      { executionPolicy: { requirements: { foo: "bar" } } },
      false,
      undefined,
    );
    expect(result.requirements).toEqual({ foo: "bar" });
    expect(result.hasOverrides).toBe(false);
  });

  it("handles string executionPolicy (JSON)", () => {
    const result = buildDynamicModelRequirements(
      { executionPolicy: JSON.stringify({ requires_thinking: true }) },
      false,
      undefined,
    );
    expect(result.requirements).toHaveProperty("supportsThinking", true);
  });
});

// ─── buildPromptEnhancementContext ──────────────────────────

describe("buildPromptEnhancementContext", () => {
  it("image-prompt-engineer skill calls promptEnhancementService", async () => {
    mockBuildSystemPrompt.mockReturnValue("enhanced system");
    mockBuildUserPrompt.mockReturnValue("enhanced user");

    const result = await buildPromptEnhancementContext(
      "image-prompt-engineer",
      { style: "cyberpunk" },
      "a cat in space",
    );

    expect(result).toEqual({
      systemPrompt: "enhanced system",
      userPrompt: "enhanced user",
    });
    expect(mockBuildSystemPrompt).toHaveBeenCalled();
    expect(mockBuildUserPrompt).toHaveBeenCalled();
  });

  it("create-image-prompt skill also triggers prompt enhancement", async () => {
    mockBuildSystemPrompt.mockReturnValue("sys");
    mockBuildUserPrompt.mockReturnValue("usr");

    const result = await buildPromptEnhancementContext(
      "create-image-prompt",
      {},
      "test",
    );

    expect(result).not.toBeNull();
    expect(mockBuildSystemPrompt).toHaveBeenCalled();
  });

  it("non-enhancement skill returns null", async () => {
    const result = await buildPromptEnhancementContext(
      "article-writer",
      {},
      "test",
    );

    expect(result).toBeNull();
    expect(mockBuildSystemPrompt).not.toHaveBeenCalled();
  });

  it("promptEnhancementService failure falls back to null", async () => {
    mockBuildSystemPrompt.mockImplementation(() => {
      throw new Error("service down");
    });

    const result = await buildPromptEnhancementContext(
      "image-prompt-engineer",
      {},
      "test",
    );

    expect(result).toBeNull();
  });
});

// ─── injectWebSearchIfNeeded ──────────────────────────────

describe("injectWebSearchIfNeeded", () => {
  it("injects OpenAI web_search_preview tool format", async () => {
    mockGetProviderForModel.mockResolvedValue({
      providerName: "OpenAI",
      providerId: "prov1",
    } as any);
    mockDetectProviderFamily.mockReturnValue("openai");
    mockBuildWebSearchParams.mockReturnValue({
      bodyParams: { tools: [{ type: "web_search_preview" }] },
    });

    const result = await injectWebSearchIfNeeded({
      skillPolicy: { requires_web_search: true },
      routeReason: undefined,
      modelId: "gpt-4o",
    });

    expect(result).not.toBeNull();
    expect(result!.extraBodyParams).toEqual({
      tools: [{ type: "web_search_preview" }],
    });
  });

  it("injects Gemini google_search tool format", async () => {
    mockGetProviderForModel.mockResolvedValue({
      providerName: "Google Gemini",
      providerId: "prov2",
    } as any);
    mockDetectProviderFamily.mockReturnValue("gemini");
    mockBuildWebSearchParams.mockReturnValue({
      bodyParams: { tools: [{ google_search: {} }] },
    });

    const result = await injectWebSearchIfNeeded({
      skillPolicy: { requires_web_search: true },
      routeReason: undefined,
      modelId: "gemini-pro",
    });

    expect(result!.extraBodyParams).toEqual({
      tools: [{ google_search: {} }],
    });
  });

  it("injects Anthropic web_search tool format", async () => {
    mockGetProviderForModel.mockResolvedValue({
      providerName: "Anthropic",
      providerId: "prov3",
    } as any);
    mockDetectProviderFamily.mockReturnValue("anthropic");
    mockBuildWebSearchParams.mockReturnValue({
      bodyParams: { tools: [{ type: "web_search", name: "web_search" }] },
    });

    const result = await injectWebSearchIfNeeded({
      skillPolicy: { requires_web_search: true },
      routeReason: undefined,
      modelId: "claude-3",
    });

    expect(result!.extraBodyParams).toEqual({
      tools: [{ type: "web_search", name: "web_search" }],
    });
  });

  it("injects Kimi use_search flag", async () => {
    mockGetProviderForModel.mockResolvedValue({
      providerName: "Kimi",
      providerId: "prov4",
    } as any);
    mockDetectProviderFamily.mockReturnValue("kimi");
    mockBuildWebSearchParams.mockReturnValue({
      bodyParams: { use_search: true },
    });

    const result = await injectWebSearchIfNeeded({
      skillPolicy: { requires_web_search: true },
      routeReason: undefined,
      modelId: "kimi-latest",
    });

    expect(result!.extraBodyParams).toEqual({ use_search: true });
  });

  it("appends systemPromptSuffix for unknown providers", async () => {
    mockGetProviderForModel.mockResolvedValue({
      providerName: "unknown-provider",
      providerId: "prov5",
    } as any);
    mockDetectProviderFamily.mockReturnValue("other");
    mockBuildWebSearchParams.mockReturnValue({
      bodyParams: {},
      systemPromptSuffix: "Please search the web for relevant info.",
    });

    const result = await injectWebSearchIfNeeded({
      skillPolicy: { requires_web_search: true },
      routeReason: undefined,
      modelId: "some-model",
    });

    expect(result!.systemPromptSuffix).toBe(
      "Please search the web for relevant info.",
    );
  });

  it("returns null when web search not needed", async () => {
    const result = await injectWebSearchIfNeeded({
      skillPolicy: null,
      routeReason: undefined,
      modelId: "gpt-4o",
    });

    expect(result).toBeNull();
    expect(mockGetProviderForModel).not.toHaveBeenCalled();
  });

  it("provider resolution failure is non-blocking", async () => {
    mockGetProviderForModel.mockResolvedValue(null);

    const result = await injectWebSearchIfNeeded({
      skillPolicy: { requires_web_search: true },
      routeReason: undefined,
      modelId: "broken-model",
    });

    expect(result).toBeNull();
  });

  it("route reason 'web_search' triggers injection even without skill policy flag", async () => {
    mockGetProviderForModel.mockResolvedValue({
      providerName: "OpenAI",
      providerId: "prov1",
    } as any);
    mockDetectProviderFamily.mockReturnValue("openai");
    mockBuildWebSearchParams.mockReturnValue({
      bodyParams: { tools: [{ type: "web_search_preview" }] },
    });

    const result = await injectWebSearchIfNeeded({
      skillPolicy: null,
      routeReason: "auto_web_search",
      modelId: "gpt-4o",
    });

    expect(result).not.toBeNull();
  });
});
