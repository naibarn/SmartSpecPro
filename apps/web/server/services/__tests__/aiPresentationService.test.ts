import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock hoisting ────────────────────────────────────────────

const {
  mockInvokeLLM,
  mockCallLLMStructured,
  mockGetSkillByIdAsync,
  mockGenerateImageAsync,
  mockGetTask,
  mockAddSlideToDeck,
  mockHasEnoughCredits,
  mockAuditLog,
  mockGetBuiltInPreset,
  mockPickRandomSvg,
  mockGenerateSlide,
  mockRedisSet,
  mockRedisGet,
  mockRedisDel,
  mockRedisExpire,
  mockDbTransaction,
} = vi.hoisted(() => ({
  mockInvokeLLM: vi.fn(),
  mockCallLLMStructured: vi.fn(),
  mockGetSkillByIdAsync: vi.fn(),
  mockGenerateImageAsync: vi.fn(),
  mockGetTask: vi.fn(),
  mockAddSlideToDeck: vi.fn(),
  mockHasEnoughCredits: vi.fn(),
  mockAuditLog: vi.fn(),
  mockGetBuiltInPreset: vi.fn(),
  mockPickRandomSvg: vi.fn(),
  mockGenerateSlide: vi.fn(),
  mockRedisSet: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisDel: vi.fn(),
  mockRedisExpire: vi.fn(),
  mockDbTransaction: vi.fn(),
}));

vi.mock("../../_core/llm", () => ({
  invokeLLM: mockInvokeLLM,
}));

vi.mock("../callLLMStructured", () => ({
  callLLMStructured: mockCallLLMStructured,
}));

vi.mock("../skillRegistry", () => ({
  getSkillByIdAsync: mockGetSkillByIdAsync,
}));

vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: {
    generateImageAsync: mockGenerateImageAsync,
    getTask: mockGetTask,
  },
}));

vi.mock("../presentationService", () => ({
  addSlideToDeck: mockAddSlideToDeck,
}));

vi.mock("../creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
}));

vi.mock("../auditLogger", () => ({
  auditLogger: { log: mockAuditLog },
}));

vi.mock("@shared/presentation/aiStylePresets", () => ({
  getBuiltInPreset: mockGetBuiltInPreset,
}));

vi.mock("@shared/presentation/svgGraphicsCatalog", () => ({
  pickRandomSvgFromCategory: mockPickRandomSvg,
}));

vi.mock("../aiPresentationLayoutEngine", () => ({
  generateSlide: mockGenerateSlide,
}));

vi.mock("../redis", () => ({
  getRedisClient: () => ({
    set: mockRedisSet,
    get: mockRedisGet,
    del: mockRedisDel,
    expire: mockRedisExpire,
  }),
}));

vi.mock("../../db", () => ({
  getDb: () => ({
    transaction: mockDbTransaction,
  }),
}));

// ── Imports after mocks ─────────────────────────────────────

import {
  generateAIDraft,
  estimateCreditCost,
  buildArticlePrompt,
} from "../aiPresentationService";
import type { GenerateAIDraftInput } from "@shared/presentation/aiTypes";
import type { PresentationActor } from "../presentationService";

// ── Helpers ─────────────────────────────────────────────────

function buildMockInput(overrides?: Partial<GenerateAIDraftInput>): GenerateAIDraftInput {
  return {
    deckId: 1,
    expectedVersion: 0,
    prompt: "Test topic",
    numSlides: 3,
    language: "en",
    articleSkillId: "general-article-writer",
    stylePresetId: "dark-professional",
    ...overrides,
  };
}

function buildMockActor(): PresentationActor {
  return { userId: 1, tenantId: "test-tenant", role: "user" };
}

const MOCK_ARTICLE = "Title: Test\n\n1. Section One\nContent one\n\n2. Section Two\nContent two\n\n3. Section Three\nContent three";

const MOCK_SLIDES = [
  { templateId: "hero_center" as const, title: "Test", body: ["Content one"], graphicCategory: "Business" as const, imagePromptKeywords: "test image 1" },
  { templateId: "split_right_image" as const, title: "Section Two", body: ["Content two"], graphicCategory: "Technology" as const, imagePromptKeywords: "test image 2" },
  { templateId: "split_left_image" as const, title: "Section Three", body: ["Content three"], graphicCategory: "Nature" as const, imagePromptKeywords: "test image 3" },
];

const MOCK_SVG = { id: "svg1", category: "Business", svgContent: "<svg></svg>", label: "test" };

const MOCK_SLIDE_CONTENT = {
  elements: [{ type: "text", id: "t1", x: 0, y: 0, width: 100, height: 50, text: "Test" }],
  background: { fill: "#000000" },
};

function setupHappyPath() {
  mockHasEnoughCredits.mockResolvedValue(true);
  mockRedisSet.mockResolvedValue("OK");
  mockRedisGet.mockResolvedValue(null); // no cancellation
  mockRedisDel.mockResolvedValue(1);
  mockRedisExpire.mockResolvedValue(1);

  mockGetSkillByIdAsync.mockResolvedValue({
    id: "general-article-writer",
    name: "General Article Writer",
    systemPrompt: "You are a versatile article writer.",
    executionMode: "llm-only",
  });

  mockInvokeLLM.mockResolvedValue({
    id: "resp1",
    created: Date.now(),
    model: "claude-sonnet-4-6",
    choices: [{ index: 0, message: { role: "assistant", content: MOCK_ARTICLE }, finish_reason: "stop" }],
    usage: { prompt_tokens: 100, completion_tokens: 200 },
  });

  mockCallLLMStructured.mockResolvedValue({
    data: MOCK_SLIDES,
    tokensUsed: 300,
    creditsUsed: 10,
  });

  mockGenerateImageAsync.mockResolvedValue({ id: "task-1", status: "processing" });
  mockGetTask.mockResolvedValue({ id: "task-1", status: "completed", resultUrl: "https://cdn.example.com/image.jpg" });

  mockGetBuiltInPreset.mockReturnValue({
    id: "dark-professional",
    name: "Dark Professional",
    colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
    typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
  });

  mockPickRandomSvg.mockReturnValue(MOCK_SVG);
  mockGenerateSlide.mockReturnValue({ slideContent: MOCK_SLIDE_CONTENT, warnings: [] });
  mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => fn({}));
  mockAddSlideToDeck.mockResolvedValue({ id: 1, deckId: 1 });
}

// ── Tests ───────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

describe("estimateCreditCost", () => {
  it("calculates cost with 20% buffer", () => {
    // (30 + 10 + 75*3 + 40*3) * 1.2 = (30 + 10 + 225 + 120) * 1.2 = 385 * 1.2 = 462
    expect(estimateCreditCost(3)).toBe(462);
  });

  it("calculates for 5 slides", () => {
    // (30 + 10 + 75*5 + 40*5) * 1.2 = (30 + 10 + 375 + 200) * 1.2 = 615 * 1.2 = 738
    expect(estimateCreditCost(5)).toBe(738);
  });
});

describe("buildArticlePrompt", () => {
  it("includes topic, language, and slide count", () => {
    const prompt = buildArticlePrompt("AI in Healthcare", "en", 5);
    expect(prompt).toContain("AI in Healthcare");
    expect(prompt).toContain("5");
    expect(prompt).toMatch(/english|en/i);
  });

  it("handles auto language", () => {
    const prompt = buildArticlePrompt("Test topic", "auto", 3);
    expect(prompt).toContain("Test topic");
  });
});

describe("generateAIDraft - happy path", () => {
  it("completes full 6-phase pipeline", async () => {
    setupHappyPath();
    const input = buildMockInput();
    const actor = buildMockActor();

    await generateAIDraft(input, actor, "test-token", "task-123");

    // Phase 1: Article generation
    expect(mockGetSkillByIdAsync).toHaveBeenCalledWith("general-article-writer");
    expect(mockInvokeLLM).toHaveBeenCalled();

    // Phase 2: Split
    expect(mockCallLLMStructured).toHaveBeenCalled();

    // Phase 3+4: Image enhancement + generation (3 slides)
    expect(mockGenerateImageAsync).toHaveBeenCalledTimes(3);

    // Phase 5: Layout
    expect(mockGenerateSlide).toHaveBeenCalledTimes(3);

    // Phase 6: DB insertion
    expect(mockDbTransaction).toHaveBeenCalledTimes(1);
    expect(mockAddSlideToDeck).toHaveBeenCalledTimes(3);
  });

  it("updates Redis progress to completed", async () => {
    setupHappyPath();
    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    // Final progress update should have completed=true
    const lastSetCall = mockRedisSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"),
    ).pop();
    expect(lastSetCall).toBeDefined();
    const progress = JSON.parse(lastSetCall![1] as string);
    expect(progress.completed).toBe(true);
    expect(progress.result.slidesAdded).toBe(3);
  });
});

describe("generateAIDraft - Phase 1", () => {
  it("loads skill definition via getSkillByIdAsync", async () => {
    setupHappyPath();
    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");
    expect(mockGetSkillByIdAsync).toHaveBeenCalledWith("general-article-writer");
  });

  it("fails immediately when invokeLLM throws", async () => {
    setupHappyPath();
    mockInvokeLLM.mockRejectedValueOnce(new Error("LLM unavailable"));

    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    // Should set error in Redis progress
    const progressCalls = mockRedisSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"),
    );
    const lastProgress = JSON.parse(progressCalls[progressCalls.length - 1][1] as string);
    expect(lastProgress.error).toBeDefined();
    expect(lastProgress.completed).toBe(true);

    // Phase 2+ should NOT be called
    expect(mockCallLLMStructured).not.toHaveBeenCalled();
  });
});

describe("generateAIDraft - Phase 2", () => {
  it("calls callLLMStructured with article text", async () => {
    setupHappyPath();
    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");
    expect(mockCallLLMStructured).toHaveBeenCalled();
    const callArgs = mockCallLLMStructured.mock.calls[0][0];
    expect(callArgs.userMessage).toContain("Section One");
    expect(callArgs.userMessage).toContain("Section Two");
  });

  it("forces slide 1 templateId to hero_center", async () => {
    setupHappyPath();
    mockCallLLMStructured.mockResolvedValueOnce({
      data: MOCK_SLIDES.map((s, i) =>
        i === 0 ? { ...s, templateId: "split_right_image" } : s,
      ),
      tokensUsed: 300,
      creditsUsed: 10,
    });

    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    // generateSlide should receive hero_center for first slide
    const firstSlideCall = mockGenerateSlide.mock.calls[0][0];
    expect(firstSlideCall.slideData.templateId).toBe("hero_center");
  });
});

describe("generateAIDraft - Phase 3+4", () => {
  it("loads image skill when imageSkillId provided", async () => {
    setupHappyPath();
    const input = buildMockInput({ imageSkillId: "image-prompt-engineer" });
    await generateAIDraft(input, buildMockActor(), "test-token", "task-123");
    expect(mockGetSkillByIdAsync).toHaveBeenCalledWith("image-prompt-engineer");
  });

  it("falls back to raw keywords when image skill LLM call fails", async () => {
    setupHappyPath();
    const input = buildMockInput({ imageSkillId: "image-prompt-engineer" });

    // First invokeLLM call succeeds (Phase 1 article), subsequent ones fail (image enhancement)
    mockInvokeLLM
      .mockResolvedValueOnce({
        id: "resp1", created: Date.now(), model: "test",
        choices: [{ index: 0, message: { role: "assistant", content: MOCK_ARTICLE }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 200 },
      })
      .mockRejectedValue(new Error("Image skill LLM failed"));

    await generateAIDraft(input, buildMockActor(), "test-token", "task-123");

    // Image generation should still be called (with raw keywords)
    expect(mockGenerateImageAsync).toHaveBeenCalledTimes(3);
  });

  it("sets imageUrl=null on media task failure", async () => {
    setupHappyPath();
    mockGetTask.mockResolvedValue({ id: "task-1", status: "failed" });

    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    // Layout engine should be called with null imageUrl
    const slideCall = mockGenerateSlide.mock.calls[0][0];
    expect(slideCall.imageUrl).toBeNull();
  });
});

describe("generateAIDraft - Phase 6", () => {
  it("all slides inserted within a single database transaction", async () => {
    setupHappyPath();
    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");
    expect(mockDbTransaction).toHaveBeenCalledTimes(1);
    expect(mockAddSlideToDeck).toHaveBeenCalledTimes(3);
  });

  it("version increments sequentially", async () => {
    setupHappyPath();
    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    const versions = mockAddSlideToDeck.mock.calls.map(
      (c: unknown[]) => (c[0] as { expectedVersion: number }).expectedVersion,
    );
    expect(versions).toEqual([0, 1, 2]);
  });
});

describe("generateAIDraft - error handling", () => {
  it("credit pre-check failure stops pipeline", async () => {
    setupHappyPath();
    mockHasEnoughCredits.mockResolvedValue(false);

    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    expect(mockInvokeLLM).not.toHaveBeenCalled();
    expect(mockCallLLMStructured).not.toHaveBeenCalled();

    const progressCalls = mockRedisSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"),
    );
    const lastProgress = JSON.parse(progressCalls[progressCalls.length - 1][1] as string);
    expect(lastProgress.error.code).toBe("PRESENTATION_AI_INSUFFICIENT_CREDITS");
  });
});

describe("generateAIDraft - cancellation", () => {
  it("stops when cancel key is set before Phase 2", async () => {
    setupHappyPath();
    // First get returns null (no cancel before Phase 1), second returns "1" (cancel before Phase 2)
    mockRedisGet
      .mockResolvedValueOnce(null) // check before Phase 1
      .mockResolvedValueOnce("1"); // check before Phase 2

    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    expect(mockCallLLMStructured).not.toHaveBeenCalled();

    const progressCalls = mockRedisSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"),
    );
    const lastProgress = JSON.parse(progressCalls[progressCalls.length - 1][1] as string);
    expect(lastProgress.cancelled).toBe(true);
    expect(lastProgress.completed).toBe(true);
  });
});

describe("generateAIDraft - concurrency control", () => {
  it("acquires Redis lock at start", async () => {
    setupHappyPath();
    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    const lockCall = mockRedisSet.mock.calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_lock:"),
    );
    expect(lockCall).toBeDefined();
  });

  it("rejects when lock already exists", async () => {
    setupHappyPath();
    // Lock acquisition returns null (already held)
    mockRedisSet.mockImplementation(async (...args: unknown[]) => {
      if (typeof args[0] === "string" && (args[0] as string).includes("ai_draft_lock:") && args[2] === "NX") {
        return null;
      }
      return "OK";
    });

    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    expect(mockInvokeLLM).not.toHaveBeenCalled();

    const progressCalls = mockRedisSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"),
    );
    const lastProgress = JSON.parse(progressCalls[progressCalls.length - 1][1] as string);
    expect(lastProgress.error).toBeDefined();
  });

  it("releases lock on completion", async () => {
    setupHappyPath();
    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    const delCall = mockRedisDel.mock.calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_lock:"),
    );
    expect(delCall).toBeDefined();
  });

  it("releases lock on error", async () => {
    setupHappyPath();
    mockInvokeLLM.mockRejectedValueOnce(new Error("fail"));

    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    const delCall = mockRedisDel.mock.calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_lock:"),
    );
    expect(delCall).toBeDefined();
  });
});

describe("generateAIDraft - credit estimation", () => {
  it("pre-check uses estimated amount with 20% buffer", async () => {
    setupHappyPath();
    const input = buildMockInput({ numSlides: 5 });
    await generateAIDraft(input, buildMockActor(), "test-token", "task-123");

    expect(mockHasEnoughCredits).toHaveBeenCalledWith(1, 738);
  });
});
