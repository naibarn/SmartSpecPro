import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// ── Mock hoisting ────────────────────────────────────────────

const {
  mockExecuteWithFallback,
  mockResolveProviders,
  mockCallLLMStructured,
  mockGetSkillByIdAsync,
  mockGenerateImageAsync,
  mockGenerateVideoAsync,
  mockGenerateAudioAsync,
  mockGetTask,
  mockAddMediaTaskToLibrary,
  mockAddSlideToDeck,
  mockGetPresentationDeckDetail,
  mockUpdatePresentationDeckMetadata,
  mockUpdateSlideInDeck,
  mockHasEnoughCredits,
  mockDeductCreditsForModel,
  mockDeductCredits,
  mockAuditLog,
  mockGetBuiltInPreset,
  mockPickRandomSvg,
  mockGenerateSlide,
  mockRedisSet,
  mockRedisGet,
  mockRedisDel,
  mockRedisExpire,
  mockDbTransaction,
  mockGetModelsByTypeAsync,
  mockLoadEnabledModelsWithPricing,
  mockLoadEnabledLlmModelRows,
  mockSelectBestLlmModel,
  mockPresentationServiceError,
} = vi.hoisted(() => ({
  mockExecuteWithFallback: vi.fn(),
  mockResolveProviders: vi.fn(),
  mockCallLLMStructured: vi.fn(),
  mockGetSkillByIdAsync: vi.fn(),
  mockGenerateImageAsync: vi.fn(),
  mockGenerateVideoAsync: vi.fn(),
  mockGenerateAudioAsync: vi.fn(),
  mockGetTask: vi.fn(),
  mockAddMediaTaskToLibrary: vi.fn(),
  mockAddSlideToDeck: vi.fn(),
  mockGetPresentationDeckDetail: vi.fn(),
  mockUpdatePresentationDeckMetadata: vi.fn(),
  mockUpdateSlideInDeck: vi.fn(),
  mockHasEnoughCredits: vi.fn(),
  mockDeductCreditsForModel: vi.fn(),
  mockDeductCredits: vi.fn(),
  mockAuditLog: vi.fn(),
  mockGetBuiltInPreset: vi.fn(),
  mockPickRandomSvg: vi.fn(),
  mockGenerateSlide: vi.fn(),
  mockRedisSet: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisDel: vi.fn(),
  mockRedisExpire: vi.fn(),
  mockDbTransaction: vi.fn(),
  mockGetModelsByTypeAsync: vi.fn(),
  mockLoadEnabledModelsWithPricing: vi.fn(),
  mockLoadEnabledLlmModelRows: vi.fn(),
  mockSelectBestLlmModel: vi.fn(),
  mockPresentationServiceError: class PresentationServiceError extends Error {
    code: string;
    details?: Record<string, unknown>;

    constructor(code: string, message: string, details?: Record<string, unknown>) {
      super(message);
      this.name = "PresentationServiceError";
      this.code = code;
      this.details = details;
    }
  },
}));

vi.mock("../llmRouter", () => ({
  executeWithFallback: mockExecuteWithFallback,
  resolveProviders: mockResolveProviders,
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
    generateVideoAsync: mockGenerateVideoAsync,
    generateAudioAsync: mockGenerateAudioAsync,
    getTask: mockGetTask,
  },
}));

vi.mock("../mediaLibraryService", () => ({
  addMediaTaskToLibrary: mockAddMediaTaskToLibrary,
}));

vi.mock("../presentationService", () => ({
  addSlideToDeck: mockAddSlideToDeck,
  getPresentationDeckDetail: mockGetPresentationDeckDetail,
  updatePresentationDeckMetadata: mockUpdatePresentationDeckMetadata,
  updateSlideInDeck: mockUpdateSlideInDeck,
  PresentationServiceError: mockPresentationServiceError,
}));

vi.mock("../creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCreditsForModel: mockDeductCreditsForModel,
  deductCredits: mockDeductCredits,
}));

vi.mock("../auditLogger", () => ({
  auditLogger: { log: mockAuditLog },
}));

vi.mock("@shared/presentation/aiStylePresets", () => ({
  getBuiltInPreset: mockGetBuiltInPreset,
  BUILT_IN_PRESETS: [
    {
      id: "dark-professional",
      name: "Dark Professional",
      colors: {
        background: "#1a1a2e",
        backgroundAlt: "#16213e",
        primary: "#e94560",
        secondary: "#0f3460",
        text: "#ffffff",
        textMuted: "#a0a0b0",
        cardBg: ["#16213e", "#1a1a3e", "#0f2460"],
        overlay: "rgba(0,0,0,0.55)",
      },
      typography: {
        titleFontFamily: "Inter",
        bodyFontFamily: "Inter",
        titleFontWeight: 700,
        bodyFontWeight: 400,
      },
    },
  ],
}));

vi.mock("@shared/presentation/svgGraphicsCatalog", () => ({
  pickRandomSvgFromCategory: mockPickRandomSvg,
}));

vi.mock("../aiPresentationLayoutEngine", () => ({
  generateSlide: mockGenerateSlide,
}));

vi.mock("../modelRegistry", () => ({
  getModelsByTypeAsync: mockGetModelsByTypeAsync,
}));

vi.mock("../capabilityRegistry", () => ({
  loadEnabledModelsWithPricing: mockLoadEnabledModelsWithPricing,
}));

vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: mockLoadEnabledLlmModelRows,
}));

vi.mock("../intelligentModelSelector", () => ({
  selectBestLlmModel: mockSelectBestLlmModel,
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
  getDb: async () => ({
    transaction: mockDbTransaction,
  }),
}));

// ── Imports after mocks ─────────────────────────────────────

import {
  generateAIDraft,
  estimateCreditCost,
  buildArticlePrompt,
  computeImagePollTimeoutMs,
  assessSlideCoverage,
  finalizeSlideContentBeforeDraftInsert,
  finalizeSlideContentAfterRelayout,
  finalizeSlideContentAfterRepair,
  makeFallbackHistoryEntry,
  repairSlideFromSavedNote,
  relayoutExistingSlideAsync,
  relayoutExistingSlide,
  evaluateDraftSlideRouting,
  resolvePendingMediaForDeck,
  assignAIComponentRecipes,
  normalizeSlideHierarchy,
} from "../aiPresentationService";
import type { GenerateAIDraftInput } from "@shared/presentation/aiTypes";
import { presentationSlideContentSchema } from "@shared/presentation/contracts";
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
  { templateId: "hero_center" as const, title: "Test", body: ["Content one"], notes: "Narration one", graphicCategory: "Business" as const, imagePromptKeywords: "test image 1" },
  { templateId: "split_right_image" as const, title: "Section Two", body: ["Content two"], notes: "Narration two", graphicCategory: "Technology" as const, imagePromptKeywords: "test image 2" },
  { templateId: "split_left_image" as const, title: "Section Three", body: ["Content three"], notes: "Narration three", graphicCategory: "Nature" as const, imagePromptKeywords: "test image 3" },
];

const MOCK_SVG = { id: "svg1", category: "Business", svgContent: "<svg></svg>", label: "test" };

const MOCK_SLIDE_CONTENT = {
  elements: [{ type: "text", id: "t1", x: 0, y: 0, width: 100, height: 50, text: "Test", color: "#111827" }],
};

function setupHappyPath() {
  mockLoadEnabledModelsWithPricing.mockReset();
  mockLoadEnabledLlmModelRows.mockReset();
  mockSelectBestLlmModel.mockReset();
  mockResolveProviders.mockReset();
  mockHasEnoughCredits.mockReset();
  mockRedisSet.mockReset();
  mockRedisGet.mockReset();
  mockRedisDel.mockReset();
  mockRedisExpire.mockReset();
  mockGetSkillByIdAsync.mockReset();
  mockExecuteWithFallback.mockReset();
  mockCallLLMStructured.mockReset();
  mockGenerateImageAsync.mockReset();
  mockGenerateVideoAsync.mockReset();
  mockGenerateAudioAsync.mockReset();
  mockAddMediaTaskToLibrary.mockReset();
  mockGetTask.mockReset();
  mockDeductCreditsForModel.mockReset();
  mockDeductCredits.mockReset();
  mockGetBuiltInPreset.mockReset();
  mockPickRandomSvg.mockReset();
  mockGenerateSlide.mockReset();
  mockGetModelsByTypeAsync.mockReset();
  mockDbTransaction.mockReset();
  mockAddSlideToDeck.mockReset();
  mockUpdatePresentationDeckMetadata.mockReset();
  mockLoadEnabledModelsWithPricing.mockResolvedValue([
    {
      modelId: "claude-sonnet-4-6",
      providerModelId: "claude-sonnet-4-6",
      providerName: "test-provider",
      capabilities: {
        supportsStructuredOutputs: true,
        supportsFunctionTools: true,
        contextLength: 200000,
      },
      pricingInput: 3,
      pricingOutput: 15,
      isFree: false,
    },
  ]);
  mockLoadEnabledLlmModelRows.mockResolvedValue([
    {
      providerName: "test-provider",
      modelId: "claude-sonnet-4-6",
      providerModelId: "claude-sonnet-4-6",
      priority: 10,
      contextLength: 200000,
      supportsResponses: true,
      supportsStructuredOutputs: true,
      supportsWebSearch: false,
      supportsFunctionTools: true,
      supportsCodeExecution: false,
      supportsComputerUse: false,
      supportsBackground: false,
    },
  ]);
  mockSelectBestLlmModel.mockReturnValue("claude-sonnet-4-6");
  mockResolveProviders.mockResolvedValue([
    {
      providerId: 1,
      providerName: "test-provider",
      baseUrl: "https://example.com",
      apiKey: "test-key",
      providerModelId: "claude-sonnet-4-6",
      pricingInput: 0,
      pricingOutput: 0,
      isFree: true,
      priority: 0,
    },
  ]);
  mockHasEnoughCredits.mockResolvedValue(true);
  mockRedisSet.mockResolvedValue("OK");
  mockRedisGet.mockImplementation(async (key: string) => {
    if (key.includes("ai_draft_lock:")) return "task-123";
    return null; // no cancellation
  });
  mockRedisDel.mockResolvedValue(1);
  mockRedisExpire.mockResolvedValue(1);

  mockGetSkillByIdAsync.mockResolvedValue({
    id: "general-article-writer",
    name: "General Article Writer",
    systemPrompt: "You are a versatile article writer.",
    executionMode: "llm-only",
  });

  mockExecuteWithFallback.mockResolvedValue({
    type: "success",
    providerId: 1,
    providerName: "test-provider",
    response: {
      id: "resp1",
      created: Date.now(),
      model: "claude-sonnet-4-6",
      choices: [{ index: 0, message: { role: "assistant", content: MOCK_ARTICLE }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 200 },
    },
  });

  mockCallLLMStructured.mockResolvedValue({
    data: MOCK_SLIDES,
    tokensUsed: 300,
    creditsUsed: 10,
  });

  mockGenerateImageAsync.mockResolvedValue({ id: "task-1", status: "processing" });
  mockGenerateVideoAsync.mockResolvedValue({ id: "video-task-1", status: "processing" });
  mockGenerateAudioAsync.mockResolvedValue({ id: "audio-task-1", status: "processing" });
  mockAddMediaTaskToLibrary.mockResolvedValue({
    itemId: 301,
    created: true,
    indexJob: { jobId: 1, status: "queued", created: true },
    taskStatus: "completed",
  });
  mockGetTask.mockResolvedValue({ id: "task-1", status: "completed", resultUrl: "https://cdn.example.com/image.jpg" });
  mockDeductCreditsForModel.mockResolvedValue({ creditsUsed: 1, wasFree: false });
  mockDeductCredits.mockResolvedValue({ success: true, creditsUsed: 8, newBalance: 92, transactionId: 1 });

  mockGetBuiltInPreset.mockReturnValue({
    id: "dark-professional",
    name: "Dark Professional",
    colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
    typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
  });

  mockPickRandomSvg.mockReturnValue(MOCK_SVG);
  mockGenerateSlide.mockImplementation(() => ({
    slideContent: JSON.parse(JSON.stringify(MOCK_SLIDE_CONTENT)),
    warnings: [],
  }));
  mockGetModelsByTypeAsync.mockImplementation(async (type: string) => {
    if (type === "audio") {
      return [
        {
          id: "elevenlabs-tts",
          type: "audio",
          name: "ElevenLabs Text-to-Speech",
          provider: "kie.ai",
          description: "High-quality text-to-speech",
          creditCost: 5,
          isEnabled: true,
          priority: 0,
          configJson: { generateType: "text-to-audio" },
        },
      ];
    }
    return [
      {
        id: "flux-2.0",
        type: "image",
        name: "Flux 2.0",
        provider: "kie.ai",
        description: "Fast and creative image generation",
        creditCost: 8,
        isEnabled: true,
        priority: 0,
        configJson: { generateType: "text-to-image" },
      },
    ];
  });
  mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => fn({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ version: 0 }],
        }),
      }),
    }),
    delete: () => ({
      where: async () => [],
    }),
    update: () => ({
      set: () => ({
        where: async () => [{ id: 1 }],
      }),
    }),
  }));
  mockAddSlideToDeck.mockResolvedValue({ id: 1, deckId: 1 });
  mockUpdatePresentationDeckMetadata.mockResolvedValue({
    id: 1,
    tenantId: "test-tenant",
    libraryItemId: 101,
    title: "Test deck",
    description: null,
    notes: MOCK_ARTICLE,
    version: 4,
    slideCount: 3,
    totalAssetBytes: 0,
    projectAudioTrack: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
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

describe("computeImagePollTimeoutMs", () => {
  it("increases timeout when requested slide count increases", () => {
    const timeoutForOneSlide = computeImagePollTimeoutMs(1);
    const timeoutForThirtySlides = computeImagePollTimeoutMs(30);

    expect(timeoutForOneSlide).toBeGreaterThanOrEqual(5000);
    expect(timeoutForThirtySlides).toBeGreaterThan(timeoutForOneSlide);
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

  it("includes slide-based word planning guidance", () => {
    const prompt = buildArticlePrompt("Newborn sleep", "en", 6);
    expect(prompt).toContain("Word planning instructions");
    expect(prompt).toContain("Slide-based recommendation (6 slides)");
    expect(prompt).toContain("Suggested section size");
  });

  it("enforces explicit user word_count as strict maximum when provided", () => {
    const prompt = buildArticlePrompt("พัฒนาการทารก", "th", 8, {
      length: "long",
      word_count: 900,
    });
    expect(prompt).toContain("STRICT LIMIT: The article MUST NOT exceed 900 words.");
    expect(prompt).toContain("- word_count: 900");
  });

  it("keeps legacy length preset behavior when word_count is not provided", () => {
    const prompt = buildArticlePrompt("Toddler behavior", "en", 5, {
      length: "short",
    });
    expect(prompt).toContain("Length preset \"short\" detected");
    expect(prompt).not.toContain("STRICT LIMIT:");
  });

  it("prefers explicit article skill language over top-level auto language", () => {
    const prompt = buildArticlePrompt("Sleep routines for newborns", "auto", 4, {
      language: "th",
      length: "medium",
    });
    expect(prompt).toContain("Write the entire article in Thai.");
    expect(prompt).not.toContain("Write in the same language as the topic.");
  });

  it("normalizes human-readable Thai language values from skill params", () => {
    const prompt = buildArticlePrompt("Toddler tantrums", "auto", 4, {
      language: "Thai (ภาษาไทย)",
    });
    expect(prompt).toContain("Write the entire article in Thai.");
  });
});

describe("assessSlideCoverage", () => {
  it("returns lower coverage score when major article points are missing from slides", () => {
    const article = `
      AI improves diagnosis accuracy.
      AI automates repetitive tasks for doctors.
      AI helps hospitals predict patient flow.
    `;
    const slides = [
      {
        templateId: "hero_center" as const,
        title: "AI in Healthcare",
        body: ["Diagnosis accuracy"],
        graphicCategory: "Health" as const,
        imagePromptKeywords: "medical AI",
      },
    ];

    const result = assessSlideCoverage(article, slides);
    expect(result.totalPoints).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
  });
});

describe("relayoutExistingSlide", () => {
  it("reuses existing image url and preserves transition/duration", () => {
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockReturnValue({
      slideContent: {
        elements: [
          { id: "new-image-1", type: "image", x: 0, y: 0, width: 1280, height: 720, src: "https://cdn.example.com/existing.jpg", alt: "cover" },
          { id: "new-text-1", type: "text", x: 100, y: 100, width: 700, height: 120, text: "Relayout title", color: "#ffffff" },
        ],
      },
      warnings: [],
    });

    const output = relayoutExistingSlide({
      slideTitle: "Original title",
      deckTitle: "Deck",
      slideIndex: 1,
      totalSlides: 5,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "img-1", type: "image", x: 0, y: 0, width: 1280, height: 720, src: "https://cdn.example.com/existing.jpg", alt: "hero", imagePrompt: "prompt", imageModelId: "flux-2.0" },
          { id: "t-1", type: "text", x: 120, y: 110, width: 900, height: 130, text: "Original title", color: "#ffffff", fontSize: 58, fontWeight: "700" },
          { id: "t-2", type: "text", x: 120, y: 270, width: 900, height: 80, text: "Point one", color: "#ffffff", fontSize: 34 },
        ],
        transition: "fade",
        durationMs: 5000,
        canvas: { width: 1280, height: 720, preset: "16:9" },
      },
      includeSvg: true,
      layoutSeed: 2,
    });

    expect(mockGenerateSlide).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: "https://cdn.example.com/existing.jpg",
      canvasWidth: 1280,
      canvasHeight: 720,
    }));
    expect(output.slideContent.transition).toBe("fade");
    expect(output.slideContent.durationMs).toBe(5000);
    expect(output.applied.reusedImage).toBe(true);
  });

  it("stabilizes stale fallback history metadata before relayout parsing", () => {
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockReturnValue({
      slideContent: {
        elements: [
          { id: "new-image-1", type: "image", x: 0, y: 0, width: 1280, height: 720, src: "https://cdn.example.com/existing.jpg", alt: "cover" },
          { id: "new-text-1", type: "text", x: 100, y: 100, width: 700, height: 120, text: "Relayout title", color: "#ffffff" },
        ],
      },
      warnings: [],
    });

    const output = relayoutExistingSlide({
      slideTitle: "Original title",
      deckTitle: "Deck",
      slideIndex: 1,
      totalSlides: 5,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "img-1", type: "image", x: 0, y: 0, width: 1280, height: 720, src: "https://cdn.example.com/existing.jpg", alt: "hero", imagePrompt: "prompt", imageModelId: "flux-2.0" },
          { id: "t-1", type: "text", x: 120, y: 110, width: 900, height: 130, text: "Original title", color: "#ffffff", fontSize: 58, fontWeight: "700" },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
        aiDesign: {
          source: "draft-with-ai",
          selectionMode: "llm",
          fallbackHistory: [
            {
              step: "switch_mode",
              from: "llm_layout_dsl",
              to: "llm_layout_dsl_local_fallback",
              reason: `Repeated DSL failure ${"x".repeat(900)}`,
              timestamp: "2026-04-02T00:00:00.000Z",
            },
          ],
        } as any,
      },
      includeSvg: true,
      layoutSeed: 2,
    });

    expect(presentationSlideContentSchema.safeParse(output.slideContent).success).toBe(true);
    expect(output.slideContent.aiDesign?.fallbackHistory).toHaveLength(1);
    expect(output.slideContent.aiDesign?.fallbackHistory?.[0].reason).toContain("Repeated DSL failure");
    expect((output.slideContent.aiDesign?.fallbackHistory?.[0].reason ?? "").length).toBeLessThanOrEqual(512);
  });

  it("expands component fallback content so auto layout can reuse block text and media", () => {
    let capturedLayoutInput: any = null;
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockImplementation((input: unknown) => {
      capturedLayoutInput = input;
      return {
        slideContent: {
          elements: [],
        },
        warnings: [],
      };
    });

    relayoutExistingSlide({
      slideTitle: "Fallback title",
      deckTitle: "Deck",
      slideIndex: 1,
      totalSlides: 4,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
        ],
        components: [
          {
            id: "cmp-photo-collage",
            componentId: "photo-collage",
            componentType: "built-in",
            definitionRevision: 1,
            slotBindings: [],
            fallbackElements: [
              { id: "cmp-title", type: "text", x: 80, y: 80, width: 500, height: 90, text: "Campaign lookbook", color: "#ffffff", fontSize: 56, fontWeight: "700" },
              { id: "cmp-body", type: "text", x: 80, y: 200, width: 500, height: 120, text: "Primary story\nSecondary supporting caption", color: "#ffffff", fontSize: 30 },
              { id: "cmp-img-primary", type: "image", x: 700, y: 80, width: 420, height: 280, src: "https://cdn.example.com/collage-primary.jpg", alt: "primary" },
              { id: "cmp-img-secondary", type: "image", x: 700, y: 390, width: 420, height: 220, src: "https://cdn.example.com/collage-secondary.jpg", alt: "secondary" },
            ],
          },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
        aiDesign: {
          source: "draft-with-ai",
          componentRecipeId: "photo-collage",
          selectionMode: "heuristic",
        },
      },
      includeSvg: true,
      layoutSeed: 7,
    });

    expect(capturedLayoutInput).toBeTruthy();
    expect(capturedLayoutInput.slideData.title).toBe("Campaign lookbook");
    expect(capturedLayoutInput.slideData.body).toEqual(expect.arrayContaining([
      "Primary story",
      "Secondary supporting caption",
    ]));
    expect(capturedLayoutInput.slideData.componentRecipeId).toBe("photo-collage");
    expect(capturedLayoutInput.imageUrl).toBe("https://cdn.example.com/collage-primary.jpg");
    expect(capturedLayoutInput.imageUrls).toEqual([
      "https://cdn.example.com/collage-primary.jpg",
      "https://cdn.example.com/collage-secondary.jpg",
    ]);
  });

  it("preserves visual-only slides during relayout and skips text-oriented auto-layout extras", () => {
    let capturedLayoutInput: any = null;
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
      header: { enabled: true, height: 60, backgroundColor: "#101010", showDeckTitle: true },
      footer: { enabled: true, height: 42, backgroundColor: "#101010", showPageNumber: true },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockImplementation((input: unknown) => {
      capturedLayoutInput = input;
      return {
        slideContent: {
          elements: [
            { id: "hero", type: "image", x: 0, y: 0, width: 1280, height: 720, src: "https://cdn.example.com/existing.jpg", alt: "hero", imageFit: "cover" },
          ],
        },
        warnings: [],
      };
    });

    const output = relayoutExistingSlide({
      slideTitle: "Original title",
      deckTitle: "Deck",
      slideIndex: 1,
      totalSlides: 5,
      includeSvg: true,
      includeGeometricCrop: true,
      includeGeometricAccents: true,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "img-1", type: "image", x: 0, y: 0, width: 1280, height: 720, src: "https://cdn.example.com/existing.jpg", alt: "hero", imagePrompt: "prompt", imageModelId: "flux-2.0" },
        ],
        visualOnly: true,
        transition: "fade",
        durationMs: 5000,
        canvas: { width: 1280, height: 720, preset: "16:9" },
      },
      layoutSeed: 2,
    });

    expect(capturedLayoutInput).toBeTruthy();
    expect(capturedLayoutInput.visualOnly).toBe(true);
    expect(output.slideContent.visualOnly).toBe(true);
    expect(output.slideContent.elements.some((element) => element.type === "text")).toBe(false);
    expect(output.warnings).toContain("Preserved visual-only slide mode during auto layout.");
    expect(output.warnings).toContain("Skipped geometric crop to preserve full-canvas visual-only slide.");
    expect(output.warnings).toContain("Skipped geometric accents to preserve full-canvas visual-only slide.");
  });

  it("reuses existing video as primary media during relayout when no image exists", () => {
    let capturedLayoutInput: any = null;
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockImplementation((input: unknown) => {
      capturedLayoutInput = input;
      return {
        slideContent: {
          elements: [
            { id: "video-zone", type: "image", x: 0, y: 0, width: 1280, height: 720, src: "https://cdn.example.com/demo.mp4", alt: "video zone" },
          ],
        },
        warnings: [],
      };
    });

    const output = relayoutExistingSlide({
      slideTitle: "Demo reel",
      deckTitle: "Deck",
      slideIndex: 1,
      totalSlides: 4,
      includeSvg: true,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "video-main", type: "video", x: 0, y: 0, width: 1280, height: 720, src: "https://cdn.example.com/demo.mp4", title: "demo", muted: true, loop: true },
          { id: "title", type: "text", x: 72, y: 120, width: 700, height: 100, text: "Demo reel", color: "#ffffff", fontSize: 58, fontWeight: "700" },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
      },
      layoutSeed: 11,
    });

    expect(capturedLayoutInput.imageUrl).toBe("https://cdn.example.com/demo.mp4");
    expect(output.warnings).toContain("Reused existing video as the primary media during auto layout.");
    const mainVideo = output.slideContent.elements.find((element) => element.id === "video-zone");
    expect(mainVideo?.type).toBe("video");
    expect(output.applied.reusedImage).toBe(true);
  });

  it("routes only image sources into image-only relayout recipes and preserves remaining video media separately", () => {
    let capturedLayoutInput: any = null;
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockImplementation((input: unknown) => {
      capturedLayoutInput = input;
      return {
        slideContent: {
          elements: [
            { id: "primary-zone", type: "image", x: 0, y: 0, width: 820, height: 720, src: "https://cdn.example.com/block-primary.jpg", alt: "primary" },
            { id: "slot-1", type: "rect", x: 860, y: 180, width: 320, height: 180, fill: "#31455a", opacity: 0.4 },
            { id: "slot-2", type: "rect", x: 860, y: 390, width: 320, height: 180, fill: "#31455a", opacity: 0.4 },
            { id: "title", type: "text", x: 72, y: 90, width: 620, height: 100, text: "Campaign lookbook", color: "#ffffff", fontSize: 58, fontWeight: "700" },
          ],
        },
        warnings: [],
      };
    });

    const output = relayoutExistingSlide({
      slideTitle: "Campaign lookbook",
      deckTitle: "Deck",
      slideIndex: 1,
      totalSlides: 4,
      includeSvg: true,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "freeform-image", type: "image", x: 960, y: 40, width: 220, height: 140, src: "https://cdn.example.com/freeform-image.png", alt: "freeform image" },
          { id: "freeform-video", type: "video", x: 700, y: 40, width: 500, height: 300, src: "https://cdn.example.com/freeform-video.mp4", title: "freeform video", muted: true },
        ],
        components: [
          {
            id: "cmp-photo-collage",
            componentId: "photo-collage",
            componentType: "built-in",
            definitionRevision: 1,
            slotBindings: [],
            fallbackElements: [
              { id: "cmp-title", type: "text", x: 80, y: 80, width: 500, height: 90, text: "Campaign lookbook", color: "#ffffff", fontSize: 56, fontWeight: "700" },
              { id: "cmp-body", type: "text", x: 80, y: 200, width: 500, height: 120, text: "Primary story\nSupporting detail", color: "#ffffff", fontSize: 30 },
              { id: "cmp-img-primary", type: "image", x: 700, y: 80, width: 420, height: 280, src: "https://cdn.example.com/block-primary.jpg", alt: "block primary" },
              { id: "cmp-img-secondary", type: "image", x: 700, y: 390, width: 420, height: 220, src: "https://cdn.example.com/block-secondary.jpg", alt: "block secondary" },
            ],
          },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
        aiDesign: {
          source: "draft-with-ai",
          componentRecipeId: "photo-collage",
          selectionMode: "heuristic",
        },
      },
      layoutSeed: 19,
    });

    expect(capturedLayoutInput.imageUrls).toEqual([
      "https://cdn.example.com/block-primary.jpg",
      "https://cdn.example.com/block-secondary.jpg",
      "https://cdn.example.com/freeform-image.png",
    ]);
    expect(capturedLayoutInput.imageUrls).not.toContain("https://cdn.example.com/freeform-video.mp4");
    const preservedIds = output.slideContent.elements.map((element) => element.id);
    expect(preservedIds).toContain("freeform-image");
    expect(preservedIds).toContain("freeform-video");
    expect(preservedIds).toContain("cmp-img-secondary");
  });

  it("preserves an extra manually-added image even when it reuses the same src as the primary media", () => {
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockReturnValue({
      slideContent: {
        elements: [
          { id: "img-main", type: "image", x: 0, y: 0, width: 820, height: 720, src: "https://cdn.example.com/shared-photo.jpg", alt: "hero" },
          { id: "title", type: "text", x: 72, y: 90, width: 620, height: 100, text: "Shared photo slide", color: "#ffffff", fontSize: 58, fontWeight: "700" },
        ],
      },
      warnings: [],
    });

    const output = relayoutExistingSlide({
      slideTitle: "Shared photo slide",
      deckTitle: "Deck",
      slideIndex: 2,
      totalSlides: 5,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "img-primary", type: "image", x: 0, y: 0, width: 900, height: 720, src: "https://cdn.example.com/shared-photo.jpg", alt: "primary" },
          { id: "img-secondary", type: "image", x: 980, y: 80, width: 180, height: 140, src: "https://cdn.example.com/shared-photo.jpg", alt: "secondary duplicate" },
          { id: "title", type: "text", x: 72, y: 90, width: 620, height: 100, text: "Shared photo slide", color: "#ffffff", fontSize: 58, fontWeight: "700" },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
      },
      layoutSeed: 71,
    });

    const elementIds = output.slideContent.elements.map((element) => element.id);
    expect(elementIds).toContain("img-secondary");
  });

  it("honors a manually requested block recipe during auto layout when the copy fits", () => {
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    let capturedLayoutInput: any;
    mockGenerateSlide.mockImplementation((input: any) => {
      capturedLayoutInput = input;
      return {
        slideContent: {
          elements: [
            { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          ],
          components: [
            {
              id: "cmp-process",
              componentId: "process-steps",
              componentType: "built-in",
              definitionRevision: 1,
              slotBindings: [],
              fallbackElements: [],
            },
          ],
        },
        warnings: [],
      };
    });

    relayoutExistingSlide({
      slideTitle: "Bedtime routine",
      deckTitle: "Deck",
      slideIndex: 2,
      totalSlides: 5,
      preferredComponentRecipeId: "process-steps",
      slideContent: {
        elements: [
          { id: "img-primary", type: "image", x: 0, y: 0, width: 640, height: 720, src: "https://cdn.example.com/bedtime.jpg", alt: "primary" },
          { id: "title", type: "text", x: 700, y: 80, width: 420, height: 80, text: "Bedtime routine", color: "#111827", fontSize: 52, fontWeight: "700" },
          { id: "body-1", type: "text", x: 700, y: 180, width: 420, height: 60, text: "Step 1: Dim the lights", color: "#111827", fontSize: 26 },
          { id: "body-2", type: "text", x: 700, y: 260, width: 420, height: 60, text: "Step 2: Read a short story", color: "#111827", fontSize: 26 },
          { id: "body-3", type: "text", x: 700, y: 340, width: 420, height: 60, text: "Step 3: Put the baby down drowsy", color: "#111827", fontSize: 26 },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
      },
      layoutSeed: 99,
    });

    expect(capturedLayoutInput.slideData.componentRecipeId).toBe("process-steps");
  });

  it("keeps a secondary image visible when dense auto layout already uses one primary image", () => {
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockReturnValue({
      slideContent: {
        elements: [
          { id: "primary-zone", type: "image", x: 20, y: 520, width: 380, height: 720, src: "https://cdn.example.com/main-photo.jpg", alt: "primary" },
          { id: "card-1", type: "rect", x: 430, y: 180, width: 250, height: 250, fill: "#f3e2d8" },
          { id: "card-2", type: "rect", x: 430, y: 450, width: 250, height: 250, fill: "#efb1a3" },
          { id: "card-3", type: "rect", x: 430, y: 720, width: 250, height: 250, fill: "#f2c867" },
          { id: "title", type: "text", x: 420, y: 40, width: 260, height: 120, text: "FAQ", color: "#111827", fontSize: 54, fontWeight: "700" },
          { id: "body-1", type: "text", x: 450, y: 220, width: 190, height: 120, text: "Answer one", color: "#111827", fontSize: 28 },
          { id: "body-2", type: "text", x: 450, y: 490, width: 190, height: 120, text: "Answer two", color: "#111827", fontSize: 28 },
          { id: "body-3", type: "text", x: 450, y: 760, width: 190, height: 120, text: "Answer three", color: "#111827", fontSize: 28 },
        ],
      },
      warnings: [],
    });

    const output = relayoutExistingSlide({
      slideTitle: "FAQ",
      deckTitle: "Deck",
      slideIndex: 2,
      totalSlides: 5,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 720, height: 1280, fill: "#fff8f0" },
          { id: "img-secondary-top", type: "image", x: 20, y: 20, width: 380, height: 470, src: "https://cdn.example.com/infographic-top.jpg", alt: "top infographic" },
          { id: "img-primary-bottom", type: "image", x: 20, y: 540, width: 380, height: 720, src: "https://cdn.example.com/main-photo.jpg", alt: "main photo" },
          { id: "title", type: "text", x: 420, y: 40, width: 260, height: 120, text: "FAQ", color: "#111827", fontSize: 54, fontWeight: "700" },
          { id: "body", type: "text", x: 420, y: 200, width: 260, height: 840, text: "Long answer one\nLong answer two\nLong answer three\nLong answer four", color: "#111827", fontSize: 28 },
        ],
        canvas: { width: 720, height: 1280, preset: "9:16" },
      },
      layoutSeed: 41,
    });

    const preservedSecondary = output.slideContent.elements.find((element) => element.id === "img-secondary-top");
    expect(preservedSecondary?.type).toBe("image");
    if (preservedSecondary?.type === "image") {
      expect(preservedSecondary.src).toBe("https://cdn.example.com/infographic-top.jpg");
      expect(preservedSecondary.y).toBeGreaterThanOrEqual(520);
      expect(preservedSecondary.width).toBeGreaterThan(180);
    }
  });

  it("preserves secondary supported blocks as components during relayout", () => {
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockReturnValue({
      slideContent: {
        elements: [
          { id: "primary-zone", type: "image", x: 0, y: 0, width: 820, height: 720, src: "https://cdn.example.com/block-primary.jpg", alt: "primary" },
          { id: "slot-1", type: "rect", x: 860, y: 180, width: 320, height: 180, fill: "#31455a", opacity: 0.4 },
          { id: "slot-2", type: "rect", x: 860, y: 390, width: 320, height: 180, fill: "#31455a", opacity: 0.4 },
          { id: "title", type: "text", x: 72, y: 90, width: 620, height: 100, text: "Campaign lookbook", color: "#ffffff", fontSize: 58, fontWeight: "700" },
        ],
      },
      warnings: [],
    });

    const output = relayoutExistingSlide({
      slideTitle: "Campaign lookbook",
      deckTitle: "Deck",
      slideIndex: 1,
      totalSlides: 4,
      includeSvg: true,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "freeform-image", type: "image", x: 960, y: 40, width: 220, height: 140, src: "https://cdn.example.com/freeform-image.png", alt: "freeform image" },
          { id: "freeform-video", type: "video", x: 930, y: 560, width: 260, height: 140, src: "https://cdn.example.com/freeform-video.mp4", title: "freeform video", muted: true },
        ],
        components: [
          {
            id: "cmp-photo-collage",
            componentId: "photo-collage",
            componentType: "built-in",
            definitionRevision: 1,
            slotBindings: [],
            fallbackElements: [
              { id: "cmp-title", type: "text", x: 80, y: 80, width: 500, height: 90, text: "Campaign lookbook", color: "#ffffff", fontSize: 56, fontWeight: "700" },
              { id: "cmp-body", type: "text", x: 80, y: 200, width: 500, height: 120, text: "Primary story\nSupporting detail", color: "#ffffff", fontSize: 30 },
              { id: "cmp-img-primary", type: "image", x: 700, y: 80, width: 420, height: 280, src: "https://cdn.example.com/block-primary.jpg", alt: "block primary" },
              { id: "cmp-img-secondary", type: "image", x: 700, y: 390, width: 420, height: 220, src: "https://cdn.example.com/block-secondary.jpg", alt: "block secondary" },
            ],
          },
          {
            id: "cmp-stat-cards",
            componentId: "stat-cards",
            componentType: "built-in",
            definitionRevision: 1,
            slotBindings: [],
            fallbackElements: [
              { id: "stat-title", type: "text", x: 120, y: 560, width: 320, height: 50, text: "Metrics", color: "#ffffff", fontSize: 34, fontWeight: "700" },
              { id: "stat-card-bg", type: "rect", x: 120, y: 620, width: 260, height: 80, fill: "#16213e", opacity: 0.92 },
              { id: "stat-card-value", type: "text", x: 150, y: 638, width: 120, height: 36, text: "42%", color: "#ffffff", fontSize: 30, fontWeight: "700" },
              { id: "stat-card-label", type: "text", x: 150, y: 672, width: 180, height: 24, text: "Conversion lift", color: "#a0a0b0", fontSize: 18 },
            ],
          },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
        aiDesign: {
          source: "draft-with-ai",
          componentRecipeId: "photo-collage",
          selectionMode: "heuristic",
        },
      },
      layoutSeed: 19,
    });

    expect(output.slideContent.components?.some((component) => component.id === "cmp-stat-cards__relayout")).toBe(true);
    expect(output.slideContent.renderOrder?.some((entry) => entry === "component:cmp-stat-cards__relayout")).toBe(true);
    expect(output.warnings.some((warning) => warning.includes("Preserved") && warning.includes("existing block"))).toBe(true);
  });

  it("passes supplemental media clarity percent through relayout to the layout engine", () => {
    let capturedLayoutInput: any = null;
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockImplementation((input: unknown) => {
      capturedLayoutInput = input;
      return {
        slideContent: { elements: [] },
        warnings: [],
      };
    });

    relayoutExistingSlide({
      slideTitle: "Launch checklist",
      deckTitle: "Deck",
      slideIndex: 1,
      totalSlides: 4,
      supplementalMediaClarityPercent: 42,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "img-1", type: "image", x: 0, y: 0, width: 1280, height: 720, src: "https://cdn.example.com/hero.jpg", alt: "hero" },
          { id: "title", type: "text", x: 80, y: 80, width: 620, height: 100, text: "Launch checklist", color: "#ffffff", fontSize: 58, fontWeight: "700" },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
      },
    });

    expect(capturedLayoutInput.supplementalMediaOpacity).toBeCloseTo(0.42, 5);
  });

  it("prefers aiDesign narrative over rendered block text when relayouting draft-with-ai slides", () => {
    let capturedLayoutInput: any = null;
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockImplementation((input: unknown) => {
      capturedLayoutInput = input;
      return {
        slideContent: { elements: [] },
        warnings: [],
      };
    });

    relayoutExistingSlide({
      slideTitle: "ขั้นตอนปฏิบัติ / เคล็ดลับ",
      deckTitle: "Deck",
      slideIndex: 2,
      totalSlides: 6,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "hero", type: "image", x: 0, y: 0, width: 1280, height: 720, src: "https://cdn.example.com/process.jpg", alt: "hero" },
        ],
        components: [
          {
            id: "cmp-process",
            componentId: "process-steps",
            componentType: "built-in",
            definitionRevision: 1,
            slotBindings: [],
            fallbackElements: [
              { id: "cmp-title", type: "text", x: 120, y: 90, width: 560, height: 60, text: "ขั้นตอนปฏิบัติ / เคล็ดลับ", color: "#ffffff", fontSize: 52, fontWeight: "700" },
              { id: "cmp-subtitle", type: "text", x: 120, y: 150, width: 760, height: 32, text: "ข้อความเพี้ยนที่ไม่ควรถูกใช้เป็น source หลัก", color: "#a0a0b0", fontSize: 22 },
            ],
          },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
        aiDesign: {
          source: "draft-with-ai",
          componentRecipeId: "process-steps",
          selectionMode: "heuristic",
          narrative: {
            title: "ขั้นตอนปฏิบัติ / เคล็ดลับ",
            body: [
              "สร้างกิจวัตรก่อนนอนอย่างสม่ำเสมอ",
              "จัดสภาพแวดล้อมให้เงียบและสบาย",
              "สังเกตสัญญาณง่วงก่อนร้องไห้หนัก",
            ],
            sections: [
              { heading: "สร้างกิจวัตรก่อนนอน", details: ["ทำกิจกรรมเดิมซ้ำในเวลาคล้ายกันทุกวัน"] },
              { heading: "จัดห้องนอนให้เหมาะสม", details: ["ลดแสงและเสียงรบกวนก่อนเข้านอน"] },
              { heading: "ตอบสนองอย่างนุ่มนวล", details: ["ปลอบสั้น ๆ เพื่อช่วยให้กลับไปนอนได้"] },
            ],
          },
        },
      },
      layoutSeed: 23,
    });

    expect(capturedLayoutInput.slideData.body).toEqual(expect.arrayContaining([
      "สร้างกิจวัตรก่อนนอนอย่างสม่ำเสมอ",
      "จัดสภาพแวดล้อมให้เงียบและสบาย",
    ]));
    expect(capturedLayoutInput.slideData.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({ heading: "สร้างกิจวัตรก่อนนอน" }),
      expect.objectContaining({ heading: "จัดห้องนอนให้เหมาะสม" }),
    ]));
    expect(capturedLayoutInput.slideData.body).not.toContain("ข้อความเพี้ยนที่ไม่ควรถูกใช้เป็น source หลัก");
  });

  it("preserves aiDesign mode metadata during relayout and honors long-form mode overrides", () => {
    let capturedLayoutInput: any = null;
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockImplementation((input: unknown) => {
      capturedLayoutInput = input;
      return {
        slideContent: {
          elements: [
            { id: "title", type: "text", x: 80, y: 80, width: 620, height: 100, text: "Dense explainer", color: "#ffffff", fontSize: 56, fontWeight: "700" },
          ],
        },
        warnings: [],
      };
    });

    const result = relayoutExistingSlide({
      slideTitle: "Dense explainer",
      deckTitle: "Deck",
      slideIndex: 3,
      totalSlides: 6,
      slideContent: {
        elements: [
          { id: "img-1", type: "image", x: 0, y: 0, width: 1280, height: 720, src: "https://cdn.example.com/hero.jpg", alt: "hero" },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
        aiDesign: {
          source: "draft-with-ai",
          taskId: "task-relayout-1",
          schemaVersion: "presentation_ai_layout_v1",
          mode: "structured_block",
          modeLocked: true,
          userOverrideMode: "long_form_block",
          componentRecipeId: "poster-spotlight",
          selectionMode: "heuristic",
          narrative: {
            title: "Dense explainer",
            body: [
              "ข้อความยาวมากสำหรับย่อหน้าแรกที่ควรไปลงเลย์เอาต์แบบ long form",
              "ข้อความยาวมากสำหรับย่อหน้าแรกที่สองที่ควรไปลงเลย์เอาต์แบบ long form",
            ],
            sections: [
              { heading: "หัวข้อที่หนึ่ง", details: ["รายละเอียดที่หนึ่ง", "รายละเอียดที่สอง"] },
              { heading: "หัวข้อที่สอง", details: ["รายละเอียดที่สาม", "รายละเอียดที่สี่"] },
            ],
            templateId: "split_right_image",
          },
          generatedAt: "2026-03-14T10:00:00.000Z",
        },
      },
      layoutSeed: 99,
    });

    expect(capturedLayoutInput.slideData.componentRecipeId).toBe("sectioned-explainer");
    expect(result.slideContent.aiDesign).toMatchObject({
      source: "draft-with-ai",
      mode: "long_form_block",
      modeLocked: true,
      userOverrideMode: "long_form_block",
      componentRecipeId: "sectioned-explainer",
      narrative: expect.objectContaining({
        title: "Dense explainer",
        sections: expect.arrayContaining([
          expect.objectContaining({ heading: "หัวข้อที่หนึ่ง" }),
        ]),
      }),
    });
  });

  it("uses slide notes to recover to a long-form block when the previous recipe is too dense", () => {
    let capturedLayoutInput: any = null;
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockImplementation((input: unknown) => {
      capturedLayoutInput = input;
      return {
        slideContent: { elements: [] },
        warnings: [],
      };
    });

    const slideNotes = `
# ใครคือกลุ่มเป้าหมาย

## เรื่องราวของครอบครัวที่กังวล
บทความนี้อธิบายบริบทของพ่อแม่หรือผู้ดูแลเด็กวัย 4 ถึง 6 เดือนที่กำลังพยายามสร้างนิสัยการนอนให้สม่ำเสมอ และต้องการคำแนะนำที่ค่อยเป็นค่อยไปมากกว่ารายการสั้น ๆ

## สิ่งที่ควรสังเกตในชีวิตประจำวัน
ในช่วงอายุนี้เด็กบางคนเริ่มนอนนานขึ้นในตอนกลางคืน แต่ก็ยังตื่นง่ายเมื่อหิว ไม่สบายตัว หรือมีสิ่งเร้ารอบตัวมากเกินไป จึงควรจัดวางเป็น story layout แทนการ์ดสรุปสามช่อง
    `.trim();

    const output = relayoutExistingSlide({
      slideTitle: "ใครคือกลุ่มเป้าหมาย",
      deckTitle: "Deck",
      slideIndex: 3,
      totalSlides: 6,
      slideNotes,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "hero", type: "image", x: 640, y: 0, width: 640, height: 720, src: "https://cdn.example.com/story.jpg", alt: "hero" },
          { id: "title", type: "text", x: 72, y: 160, width: 540, height: 110, text: "ใครคือกลุ่มเป้าหมาย", color: "#ffffff", fontSize: 58, fontWeight: "700" },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
        aiDesign: {
          source: "draft-with-ai",
          componentRecipeId: "process-steps",
          selectionMode: "heuristic",
          narrative: {
            title: "ใครคือกลุ่มเป้าหมาย",
            body: ["ข้อความสั้นเกินไป"],
          },
        },
      },
      layoutSeed: 41,
    });

    expect(capturedLayoutInput.slideData.componentRecipeId).toBe("sectioned-explainer");
    expect(capturedLayoutInput.slideData.notes).toContain("บทความนี้อธิบายบริบทของพ่อแม่หรือผู้ดูแล");
    expect(
      (capturedLayoutInput.slideData.body as string[]).length > 0
      || (capturedLayoutInput.slideData.sections as Array<{ heading: string; details: string[] }> | undefined)?.some((section) => (
        section.details.some((detail) => detail.includes("พ่อแม่หรือผู้ดูแลเด็กวัย 4 ถึง 6 เดือน"))
      )),
    ).toBe(true);
    expect(output.warnings.some((warning) => warning.includes('Skipped component recipe "process-steps"'))).toBe(true);
  });

  it("preserves component fallback images when feature-highlights is skipped during relayout", () => {
    let capturedLayoutInput: any = null;
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockImplementation((input: unknown) => {
      capturedLayoutInput = input;
      return {
        slideContent: {
          elements: [
            { id: "title", type: "text", x: 72, y: 90, width: 640, height: 90, text: "Frequently asked questions", color: "#ffffff", fontSize: 58, fontWeight: "700" },
            { id: "body-1", type: "text", x: 72, y: 210, width: 720, height: 240, text: "Question one\nQuestion two\nQuestion three\nQuestion four", color: "#ffffff", fontSize: 28 },
          ],
        },
        warnings: [],
      };
    });

    const output = relayoutExistingSlide({
      slideTitle: "Frequently asked questions",
      deckTitle: "Deck",
      slideIndex: 4,
      totalSlides: 7,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
        ],
        components: [
          {
            id: "cmp-feature-highlights",
            componentId: "feature-highlights",
            componentType: "built-in",
            definitionRevision: 1,
            slotBindings: [],
            fallbackElements: [
              { id: "cmp-image", type: "image", x: 760, y: 80, width: 420, height: 560, src: "https://cdn.example.com/faq-hero.jpg", alt: "faq hero" },
              { id: "cmp-title", type: "text", x: 72, y: 90, width: 560, height: 90, text: "Frequently asked questions", color: "#ffffff", fontSize: 58, fontWeight: "700" },
            ],
          },
        ],
        renderOrder: ["element:bg", "component:cmp-feature-highlights"],
        canvas: { width: 1280, height: 720, preset: "16:9" },
        aiDesign: {
          source: "draft-with-ai",
          componentRecipeId: "feature-highlights",
          selectionMode: "heuristic",
          narrative: {
            title: "Frequently asked questions",
            body: ["Overview"],
            sections: [
              { heading: "Question one", details: ["Answer one"] },
              { heading: "Question two", details: ["Answer two"] },
              { heading: "Question three", details: ["Answer three"] },
              { heading: "Question four", details: ["Answer four"] },
            ],
          },
        },
      },
      layoutSeed: 63,
    });

    expect(capturedLayoutInput.slideData.componentRecipeId).toBe("article-focus");
    expect(capturedLayoutInput.slideData.templateId).not.toBe("feature_boxes_right");
    expect(output.slideContent.elements.some((element) => (
      element.type === "image"
      && element.id === "cmp-image"
      && element.src === "https://cdn.example.com/faq-hero.jpg"
    ))).toBe(true);
    expect(output.warnings.some((warning) => warning.includes('Skipped component recipe "feature-highlights"'))).toBe(true);
  });

  it("tops up sparse relayout text from slide notes before rendering", () => {
    let capturedLayoutInput: any = null;
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockImplementation((input: unknown) => {
      capturedLayoutInput = input;
      return {
        slideContent: { elements: [] },
        warnings: [],
      };
    });

    relayoutExistingSlide({
      slideTitle: "Safe sleep environment",
      deckTitle: "Deck",
      slideIndex: 2,
      totalSlides: 5,
      slideNotes: [
        "# Safe sleep environment",
        "Place the baby on their back to sleep.",
        "Use a firm mattress with no pillows or loose blankets.",
        "Keep the room calm and free from soft items.",
      ].join("\n"),
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "hero", type: "image", x: 720, y: 0, width: 560, height: 720, src: "https://cdn.example.com/sleep.jpg", alt: "sleep" },
          { id: "title", type: "text", x: 72, y: 120, width: 620, height: 100, text: "Safe sleep environment", color: "#ffffff", fontSize: 58, fontWeight: "700" },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
        aiDesign: {
          source: "draft-with-ai",
          selectionMode: "none",
          narrative: {
            title: "Safe sleep environment",
            body: ["Place the baby on their back to sleep."],
          },
        },
      },
      layoutSeed: 89,
    });

    expect(capturedLayoutInput.slideData.body.some((line: string) => line.includes("Place the baby on their back to sleep"))).toBe(true);
    expect(capturedLayoutInput.slideData.body.some((line: string) => line.includes("Use a firm mattress with no pillows or loose blankets"))).toBe(true);
    expect(capturedLayoutInput.slideData.notes).toContain("Keep the room calm and free from soft items");
  });

  it("derives a clean relayout title from slide notes when numbered steps were inlined into the old title", () => {
    let capturedLayoutInput: any = null;
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockImplementation((input: unknown) => {
      capturedLayoutInput = input;
      return {
        slideContent: { elements: [] },
        warnings: [],
      };
    });

    relayoutExistingSlide({
      slideTitle: "ขั้นตอนปฏิบัติ / เคล็ดลับ 1. สร้างกิจวัตรก่อนนอน: ทำให้กิจกรรมตอนก่อนนอนมีความซ้ำซ้อน เช่น หรืออาบน้ำ",
      deckTitle: "Deck",
      slideIndex: 3,
      totalSlides: 6,
      slideNotes: "ขั้นตอนปฏิบัติ / เคล็ดลับ 1. สร้างกิจวัตรก่อนนอน: ทำให้กิจกรรมตอนก่อนนอนมีความซ้ำซ้อน เช่น อ่านหนังสือ หรืออาบน้ำ เพื่อสร้างความรู้สึกผ่อนคลายให้กับลูก 2. กำหนดเวลาเข้านอน: ตั้งเวลาเข้านอนที่สม่ำเสมอทุกวัน เพื่อช่วยให้ร่างกายสร้างนิสัยในการนอน 3. สร้างสภาพแวดล้อมที่เอื้อต่อการนอน: ห้องนอนควรเงียบ สบาย และมีอุณหภูมิที่เหมาะสม",
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "title", type: "text", x: 72, y: 100, width: 900, height: 160, text: "ขั้นตอนปฏิบัติ / เคล็ดลับ 1. สร้างกิจวัตรก่อนนอน: ทำให้กิจกรรมตอนก่อนนอนมีความซ้ำซ้อน เช่น หรืออาบน้ำ", color: "#ffffff", fontSize: 58, fontWeight: "700" },
          { id: "body", type: "text", x: 72, y: 280, width: 980, height: 220, text: "หรืออาบน้ำ เพื่อสร้างความรู้สึกผ่อนคลายให้กับลูก 2. กำหนดเวลาเข้านอน", color: "#ffffff", fontSize: 30 },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
      },
      layoutSeed: 90,
    });

    expect(capturedLayoutInput).toBeTruthy();
    expect(capturedLayoutInput.slideData.title).toBe("ขั้นตอนปฏิบัติ / เคล็ดลับ");
    expect(capturedLayoutInput.slideData.title).not.toContain("1.");
    expect(capturedLayoutInput.slideData.body.join("\n")).toContain("สร้างกิจวัตรก่อนนอน");
    expect(capturedLayoutInput.slideData.body.join("\n")).toContain("กำหนดเวลาเข้านอน");
    expect(capturedLayoutInput.slideData.body.join("\n")).toContain("สร้างสภาพแวดล้อมที่เอื้อต่อการนอน");
  });

  it("routes dense portrait auto layout into a text-first top/bottom template instead of a split layout", () => {
    let capturedLayoutInput: any = null;
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockImplementation((input: unknown) => {
      capturedLayoutInput = input;
      return {
        slideContent: {
          elements: [],
        },
        warnings: [],
      };
    });

    const output = relayoutExistingSlide({
      slideTitle: "แนวทางดูแลที่ควรอ่าน",
      deckTitle: "Deck",
      slideIndex: 2,
      totalSlides: 6,
      layoutSeed: 17,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 720, height: 1280, fill: "#1a1a2e" },
          { id: "hero", type: "image", x: 0, y: 760, width: 720, height: 520, src: "https://cdn.example.com/hero.jpg", alt: "hero" },
          { id: "title", type: "text", x: 40, y: 70, width: 620, height: 100, text: "แนวทางดูแลที่ควรอ่าน", color: "#ffffff", fontSize: 58, fontWeight: "700" },
        ],
        canvas: { width: 720, height: 1280, preset: "9:16" },
        aiDesign: {
          source: "draft-with-ai",
          componentRecipeId: "process-steps",
          selectionMode: "heuristic",
          narrative: {
            title: "แนวทางดูแลที่ควรอ่าน",
            body: [
              "สร้างกิจวัตรก่อนนอนให้สม่ำเสมอและทำซ้ำในลำดับเดิมทุกคืน",
              "ปรับสภาพแวดล้อมให้เงียบ สบาย และมืดพอสำหรับการพักผ่อน",
              "ให้ผู้ดูแลทุกคนใช้แนวทางเดียวกันเพื่อลดความสับสนของเด็ก",
              "จดสิ่งที่กระตุ้นอาการเพื่อทบทวนรูปแบบที่เกิดซ้ำ",
              "หากอาการไม่ดีขึ้นควรปรึกษาแพทย์เพื่อประเมินต่อ",
              "สรุปสิ่งที่สังเกตได้เป็นโน้ตสั้น ๆ ก่อนพบแพทย์",
            ],
            notes: "คู่มือนี้ต้องใช้พื้นที่อ่านแบบเต็มหน้าและไม่ควรถูกบีบกลับไปเป็น split layout ที่ทำให้ข้อความดูแคบเกินไป",
          },
        },
      },
      includeSvg: true,
    });

    expect(capturedLayoutInput?.slideData?.templateId).toBe("bottom_image_text_top");
    expect(output.applied.templateId).toBe("bottom_image_text_top");
  });

  it("does not preserve component fallback rects as loose overlays during relayout", () => {
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockReturnValue({
      slideContent: {
        elements: [
          { id: "generated-bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
        ],
        components: [
          {
            id: "generated-process",
            componentId: "process-steps",
            componentType: "built-in",
            definitionRevision: 1,
            slotBindings: [],
            fallbackElements: [],
          },
        ],
        renderOrder: ["element:generated-bg", "component:generated-process"],
      },
      warnings: [],
    });

    const output = relayoutExistingSlide({
      slideTitle: "ขั้นตอนปฏิบัติ / เคล็ดลับ",
      deckTitle: "Deck",
      slideIndex: 1,
      totalSlides: 4,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "hero", type: "image", x: 0, y: 0, width: 1280, height: 720, src: "https://cdn.example.com/process.jpg", alt: "hero" },
        ],
        components: [
          {
            id: "cmp-process",
            componentId: "process-steps",
            componentType: "built-in",
            definitionRevision: 1,
            slotBindings: [],
            fallbackElements: [
              { id: "cmp-process::card-1-bg", type: "rect", x: 168, y: 188, width: 944, height: 96, fill: "#16213e", stroke: "#e94560", strokeWidth: 3 },
              { id: "cmp-process::card-2-bg", type: "rect", x: 168, y: 314, width: 944, height: 96, fill: "#16213e", stroke: "#0f3460", strokeWidth: 3 },
            ],
          },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
        aiDesign: {
          source: "draft-with-ai",
          componentRecipeId: "process-steps",
          selectionMode: "heuristic",
          narrative: {
            title: "ขั้นตอนปฏิบัติ / เคล็ดลับ",
            body: ["สร้างกิจวัตรก่อนนอน", "จัดสภาพแวดล้อมให้สงบ", "สังเกตสัญญาณง่วง"],
          },
        },
      },
      layoutSeed: 31,
    });

    expect(output.slideContent.elements.some((element) => element.id === "cmp-process::card-1-bg")).toBe(false);
    expect(output.slideContent.elements.some((element) => element.id === "cmp-process::card-2-bg")).toBe(false);
    expect(output.slideContent.components?.some((component) => component.id === "generated-process")).toBe(true);
  });

  it("does not preserve oversized inline svg graphics or loose lines during relayout", () => {
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockReturnValue({
      slideContent: {
        elements: [
          { id: "generated-bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "img-main", type: "image", x: 780, y: 0, width: 500, height: 720, src: "https://cdn.example.com/hero.jpg", alt: "hero" },
          { id: "title", type: "text", x: 72, y: 140, width: 560, height: 180, text: "Narrative slide", color: "#ffffff", fontSize: 58, fontWeight: "700" },
        ],
      },
      warnings: [],
    });

    const output = relayoutExistingSlide({
      slideTitle: "Narrative slide",
      deckTitle: "Deck",
      slideIndex: 2,
      totalSlides: 5,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "hero", type: "image", x: 780, y: 0, width: 500, height: 720, src: "https://cdn.example.com/hero.jpg", alt: "hero" },
          { id: "title", type: "text", x: 72, y: 140, width: 560, height: 180, text: "Narrative slide", color: "#ffffff", fontSize: 58, fontWeight: "700" },
          { id: "decorative-svg", type: "image", x: 180, y: 250, width: 240, height: 240, src: "", alt: "decorative svg", svgContent: "<svg><rect width='240' height='240'/></svg>" },
          { id: "loose-line", type: "line", x: 120, y: 420, width: 420, height: 0, stroke: "#e94560", strokeWidth: 6 },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
      },
      layoutSeed: 53,
    });

    expect(output.slideContent.elements.some((element) => element.id === "decorative-svg")).toBe(false);
    expect(output.slideContent.elements.some((element) => element.id === "loose-line")).toBe(false);
  });

  it("drops geometric accents that would overlap the generated text stack", () => {
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockReturnValue({
      slideContent: {
        elements: [
          { id: "generated-bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "title", type: "text", x: 36, y: 36, width: 640, height: 220, text: "Top-left text stack", color: "#ffffff", fontSize: 58, fontWeight: "700" },
          { id: "body", type: "text", x: 36, y: 250, width: 620, height: 180, text: "Body copy", color: "#ffffff", fontSize: 28 },
        ],
      },
      warnings: [],
    });

    const output = relayoutExistingSlide({
      slideTitle: "Top-left text stack",
      deckTitle: "Deck",
      slideIndex: 2,
      totalSlides: 5,
      includeGeometricAccents: true,
      geometricAccentShape: "triangle",
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "title", type: "text", x: 36, y: 36, width: 640, height: 220, text: "Top-left text stack", color: "#ffffff", fontSize: 58, fontWeight: "700" },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
      },
      layoutSeed: 67,
    });

    const accentImages = output.slideContent.elements.filter((element) => (
      element.type === "image" && String(element.alt || "").toLowerCase().includes("geometric accent")
    ));
    expect(accentImages).toHaveLength(1);
  });

  it("preserves multiline body text and adds Thai number spacing for readability", () => {
    let capturedLayoutInput: any = null;
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockGenerateSlide.mockImplementation((input: unknown) => {
      capturedLayoutInput = input;
      return {
        slideContent: {
          elements: [],
        },
        warnings: [],
      };
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);

    relayoutExistingSlide({
      slideTitle: "ลักษณะการขับถ่ายของทารกที่อายุเกิน1เดือน",
      deckTitle: "Deck",
      slideIndex: 1,
      totalSlides: 5,
      templateId: "split_right_image",
      includeSvg: false,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "t-title", type: "text", x: 100, y: 90, width: 1000, height: 140, text: "ลักษณะการขับถ่ายของทารกที่อายุเกิน1เดือน", color: "#ffffff", fontSize: 64, fontWeight: "700" },
          { id: "t-body", type: "text", x: 110, y: 280, width: 1000, height: 180, text: "ทารกอายุ1เดือนขึ้นไป\nถ่าย1ไม่ถ่าย1เสมอ\nหากถ่าย2วันไม่ถ่ายควรพบแพทย์", color: "#ffffff", fontSize: 28 },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
      },
    });

    expect(capturedLayoutInput).toBeTruthy();
    expect(capturedLayoutInput.slideData.title).toContain("1 เดือน");
    expect(capturedLayoutInput.slideData.body).toContain("ทารกอายุ 1 เดือนขึ้นไป");
    expect(capturedLayoutInput.slideData.body).toContain("ถ่าย 1 ไม่ถ่าย 1 เสมอ");
    expect(capturedLayoutInput.slideData.body).toContain("หากถ่าย 2 วันไม่ถ่ายควรพบแพทย์");
  });

  it("preserves heading-detail hierarchy for card-like text groups during relayout", () => {
    let capturedLayoutInput: any = null;
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockGenerateSlide.mockImplementation((input: unknown) => {
      capturedLayoutInput = input;
      return {
        slideContent: {
          elements: [],
        },
        warnings: [],
      };
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);

    relayoutExistingSlide({
      slideTitle: "การพัฒนาทางการสื่อสารและการรับประทานอาหาร",
      deckTitle: "Deck",
      slideIndex: 2,
      totalSlides: 6,
      templateId: "feature_boxes_right",
      includeSvg: false,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1600, height: 900, fill: "#1a1a2e" },
          { id: "hero", type: "image", x: 0, y: 0, width: 860, height: 900, src: "https://cdn.example.com/hero.jpg", alt: "hero" },
          { id: "title", type: "text", x: 940, y: 56, width: 600, height: 132, text: "การพัฒนาทางการสื่อสารและการรับประทานอาหาร", color: "#ff4d7a", fontSize: 66, fontWeight: "700" },

          { id: "h1", type: "text", x: 960, y: 220, width: 560, height: 60, text: "การสื่อสารและปฏิสัมพันธ์", color: "#ffffff", fontSize: 46, fontWeight: "700" },
          { id: "d1", type: "text", x: 960, y: 288, width: 560, height: 88, text: "ออกเสียงพยางค์ง่ายๆ เช่น 'บา-บา' พยายามล้อเลียนเสียงที่คุณทำ", color: "#ffffff", fontSize: 30, fontWeight: "normal" },

          { id: "h2", type: "text", x: 960, y: 398, width: 560, height: 58, text: "การรับประทานอาหารเสริม", color: "#ffffff", fontSize: 46, fontWeight: "700" },
          { id: "d2", type: "text", x: 960, y: 466, width: 560, height: 84, text: "เริ่มทานเมื่ออายุ 6 เดือน ทำให้อาหารเป็นประสบการณ์ที่สนุก", color: "#ffffff", fontSize: 30, fontWeight: "normal" },

          { id: "h3", type: "text", x: 960, y: 572, width: 560, height: 58, text: "เริ่มออกเสียงง่ายๆ", color: "#ffffff", fontSize: 46, fontWeight: "700" },
          { id: "d3", type: "text", x: 960, y: 640, width: 560, height: 72, text: "ฟังและล้อเลียนเสียง", color: "#ffffff", fontSize: 30, fontWeight: "normal" },
        ],
        canvas: { width: 1600, height: 900, preset: "16:9" },
      },
    });

    expect(capturedLayoutInput).toBeTruthy();
    expect(capturedLayoutInput.slideData.sections).toBeDefined();
    expect(capturedLayoutInput.slideData.sections.length).toBeGreaterThanOrEqual(3);
    expect(capturedLayoutInput.slideData.sections[0]).toMatchObject({
      heading: "การสื่อสารและปฏิสัมพันธ์",
      details: ["ออกเสียงพยางค์ง่ายๆ เช่น 'บา-บา' พยายามล้อเลียนเสียงที่คุณทำ"],
    });
    expect(capturedLayoutInput.slideData.sections[1]).toMatchObject({
      heading: "การรับประทานอาหารเสริม",
      details: ["เริ่มทานเมื่ออายุ 6 เดือน ทำให้อาหารเป็นประสบการณ์ที่สนุก"],
    });
  });

  it("forces header/footer off for auto relayout to avoid adding chrome", () => {
    let capturedLayoutInput: any = null;
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
      header: { enabled: true, height: 60, backgroundColor: "#101010", showDeckTitle: true },
      footer: { enabled: true, height: 42, backgroundColor: "#101010", showPageNumber: true },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockImplementation((input: unknown) => {
      capturedLayoutInput = input;
      return {
        slideContent: {
          elements: [],
        },
        warnings: [],
      };
    });

    relayoutExistingSlide({
      slideTitle: "Slide title",
      deckTitle: "Deck",
      slideIndex: 2,
      totalSlides: 5,
      includeSvg: true,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "header-band", type: "rect", x: 0, y: 0, width: 1280, height: 60, fill: "#101010" },
          { id: "footer-band", type: "rect", x: 0, y: 680, width: 1280, height: 40, fill: "#101010" },
          { id: "img", type: "image", x: 640, y: 0, width: 640, height: 720, src: "https://cdn.example.com/bg.jpg", alt: "bg" },
          { id: "title", type: "text", x: 72, y: 170, width: 520, height: 120, text: "Slide title", color: "#ffffff", fontSize: 58, fontWeight: "700" },
          { id: "body", type: "text", x: 72, y: 340, width: 520, height: 180, text: "Point one\nPoint two", color: "#ffffff", fontSize: 30 },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
      },
    });

    expect(capturedLayoutInput).toBeTruthy();
    expect(capturedLayoutInput.stylePreset.header.enabled).toBe(false);
    expect(capturedLayoutInput.stylePreset.footer.enabled).toBe(false);
  });

  it("applies geometric crop to the main relayout image when enabled", () => {
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
      header: { enabled: true, height: 60, backgroundColor: "#101010", showDeckTitle: true },
      footer: { enabled: true, height: 42, backgroundColor: "#101010", showPageNumber: true },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockReturnValue({
      slideContent: {
        elements: [
          { id: "img-main", type: "image", x: 0, y: 0, width: 900, height: 720, src: "https://cdn.example.com/bg.jpg", alt: "hero" },
          { id: "img-deco", type: "image", x: 930, y: 20, width: 120, height: 120, src: "", alt: "deco", svgContent: "<svg></svg>" },
        ],
      },
      warnings: [],
    });

    const output = relayoutExistingSlide({
      slideTitle: "Slide title",
      deckTitle: "Deck",
      slideIndex: 2,
      totalSlides: 5,
      includeSvg: true,
      includeGeometricCrop: true,
      geometricCropShape: "circle",
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "img", type: "image", x: 640, y: 0, width: 640, height: 720, src: "https://cdn.example.com/bg.jpg", alt: "bg" },
          { id: "title", type: "text", x: 72, y: 170, width: 520, height: 120, text: "Slide title", color: "#ffffff", fontSize: 58, fontWeight: "700" },
          { id: "body", type: "text", x: 72, y: 340, width: 520, height: 180, text: "Point one\nPoint two", color: "#ffffff", fontSize: 30 },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
      },
    });

    const croppedImage = output.slideContent.elements.find((element) => element.id === "img-main");
    expect(croppedImage?.type).toBe("image");
    expect((croppedImage as any)?.svgContent).toContain("<clipPath");
    expect((croppedImage as any)?.svgContent).toContain("<circle");
    expect(output.warnings.some((warning) => warning.includes("geometric image crop shape"))).toBe(true);
  });

  it("adds geometric accents without cropping when accents are enabled", () => {
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
      header: { enabled: true, height: 60, backgroundColor: "#101010", showDeckTitle: true },
      footer: { enabled: true, height: 42, backgroundColor: "#101010", showPageNumber: true },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockReturnValue({
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "img-main", type: "image", x: 0, y: 0, width: 900, height: 720, src: "https://cdn.example.com/bg.jpg", alt: "hero" },
          { id: "title", type: "text", x: 72, y: 170, width: 520, height: 120, text: "Slide title", color: "#ffffff" },
        ],
      },
      warnings: [],
    });

    const output = relayoutExistingSlide({
      slideTitle: "Slide title",
      deckTitle: "Deck",
      slideIndex: 2,
      totalSlides: 5,
      includeSvg: true,
      includeGeometricAccents: true,
      geometricAccentShape: "triangle",
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "img", type: "image", x: 640, y: 0, width: 640, height: 720, src: "https://cdn.example.com/bg.jpg", alt: "bg" },
          { id: "title", type: "text", x: 72, y: 170, width: 520, height: 120, text: "Slide title", color: "#ffffff", fontSize: 58, fontWeight: "700" },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
      },
    });

    const accentImages = output.slideContent.elements.filter((element) => (
      element.type === "image" && String(element.alt || "").toLowerCase().includes("geometric accent")
    ));
    expect(accentImages.length).toBeGreaterThanOrEqual(2);
    expect(accentImages.every((element) => typeof (element as any).svgContent === "string")).toBe(true);
    expect(accentImages.some((element) => String((element as any).svgContent).includes("<polygon"))).toBe(true);
    const titleIndex = output.slideContent.elements.findIndex((element) => element.id === "title");
    const mainImageIndex = output.slideContent.elements.findIndex((element) => element.id === "img-main");
    const accentIndexes = output.slideContent.elements
      .map((element, index) => ({ element, index }))
      .filter(({ element }) => (
        element.type === "image" && String(element.alt || "").toLowerCase().includes("geometric accent")
      ))
      .map(({ index }) => index);
    expect(accentIndexes.every((index) => index > mainImageIndex)).toBe(true);
    expect(accentIndexes.every((index) => index < titleIndex)).toBe(true);
    expect(output.warnings.some((warning) => warning.includes("Added geometric accents"))).toBe(true);
  });

  it("applies watermark when provided", () => {
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockReturnValue({
      slideContent: {
        elements: [
          { id: "img-main", type: "image", x: 0, y: 0, width: 900, height: 720, src: "https://cdn.example.com/bg.jpg", alt: "hero" },
          { id: "title", type: "text", x: 72, y: 170, width: 520, height: 120, text: "Slide title", color: "#ffffff" },
        ],
      },
      warnings: [],
    });

    const output = relayoutExistingSlide({
      slideTitle: "Slide title",
      deckTitle: "Deck",
      slideIndex: 1,
      totalSlides: 3,
      includeSvg: true,
      watermark: {
        sourceUrl: "https://cdn.example.com/watermark.png",
        format: "png",
        clarityPercent: 20,
      },
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "img", type: "image", x: 640, y: 0, width: 640, height: 720, src: "https://cdn.example.com/bg.jpg", alt: "bg" },
          { id: "title", type: "text", x: 72, y: 170, width: 520, height: 120, text: "Slide title", color: "#ffffff", fontSize: 58, fontWeight: "700" },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
      },
    });

    const watermark = output.slideContent.elements.find((element) => (
      element.type === "image" && element.id.startsWith("watermark__")
    ));
    expect(watermark).toBeTruthy();
    if (watermark && watermark.type === "image") {
      expect(watermark.src).toBe("https://cdn.example.com/watermark.png");
      expect(watermark.opacity).toBeCloseTo(0.2, 5);
    }
    expect(output.warnings.some((warning) => warning.includes("Applied watermark"))).toBe(true);
  });

  it("preserves user-added media elements when running relayout", () => {
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockReturnValue({
      slideContent: {
        elements: [
          { id: "img-main", type: "image", x: 0, y: 0, width: 900, height: 720, src: "https://cdn.example.com/bg.jpg", alt: "hero" },
          { id: "title", type: "text", x: 72, y: 170, width: 520, height: 120, text: "Slide title", color: "#ffffff" },
        ],
      },
      warnings: [],
    });

    const output = relayoutExistingSlide({
      slideTitle: "Slide title",
      deckTitle: "Deck",
      slideIndex: 1,
      totalSlides: 3,
      includeSvg: true,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "img-main-old", type: "image", x: 0, y: 0, width: 1000, height: 720, src: "https://cdn.example.com/bg.jpg", alt: "main" },
          { id: "user-image", type: "image", x: 980, y: 520, width: 240, height: 150, src: "https://cdn.example.com/user-added.png", alt: "user image" },
          { id: "user-video", type: "video", x: 900, y: 80, width: 320, height: 180, src: "https://cdn.example.com/user-added.mp4", title: "user video", muted: true },
          { id: "title", type: "text", x: 72, y: 170, width: 520, height: 120, text: "Slide title", color: "#ffffff", fontSize: 58, fontWeight: "700" },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
      },
    });

    const preservedImage = output.slideContent.elements.find((element) => (
      element.type === "image" && element.id === "user-image"
    ));
    const preservedVideo = output.slideContent.elements.find((element) => (
      element.type === "video" && element.id === "user-video"
    ));
    expect(preservedImage).toBeTruthy();
    expect(preservedVideo).toBeTruthy();
    const titleIndex = output.slideContent.elements.findIndex((element) => element.id === "title");
    const preservedImageIndex = output.slideContent.elements.findIndex((element) => element.id === "user-image");
    const preservedVideoIndex = output.slideContent.elements.findIndex((element) => element.id === "user-video");
    expect(preservedImageIndex).toBeGreaterThanOrEqual(0);
    expect(preservedVideoIndex).toBeGreaterThanOrEqual(0);
    expect(preservedImageIndex).toBeLessThan(titleIndex);
    expect(preservedVideoIndex).toBeLessThan(titleIndex);
    expect(output.warnings.some((warning) => warning.includes("Preserved 2 existing user element"))).toBe(true);
  });

  it("preserves large non-primary media by fitting them into generated drop zones", () => {
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockReturnValue({
      slideContent: {
        elements: [
          { id: "img-main", type: "image", x: 0, y: 0, width: 900, height: 720, src: "https://cdn.example.com/bg.jpg", alt: "hero" },
          { id: "slot-1", type: "rect", x: 930, y: 210, width: 320, height: 180, fill: "#31455a", opacity: 0.4 },
          { id: "slot-2", type: "rect", x: 930, y: 410, width: 320, height: 180, fill: "#31455a", opacity: 0.4 },
          { id: "title", type: "text", x: 72, y: 170, width: 520, height: 120, text: "Slide title", color: "#ffffff" },
        ],
      },
      warnings: [],
    });

    const output = relayoutExistingSlide({
      slideTitle: "Slide title",
      deckTitle: "Deck",
      slideIndex: 1,
      totalSlides: 3,
      includeSvg: true,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "img-main-old", type: "image", x: 0, y: 0, width: 1280, height: 720, src: "https://cdn.example.com/bg.jpg", alt: "main" },
          { id: "large-secondary-image", type: "image", x: 40, y: 40, width: 900, height: 500, src: "https://cdn.example.com/secondary.jpg", alt: "secondary" },
          { id: "large-secondary-video", type: "video", x: 120, y: 120, width: 760, height: 430, src: "https://cdn.example.com/secondary.mp4", title: "secondary video", muted: true },
          { id: "title", type: "text", x: 72, y: 170, width: 520, height: 120, text: "Slide title", color: "#ffffff", fontSize: 58, fontWeight: "700" },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
      },
    });

    const preservedLargeImage = output.slideContent.elements.find((element) => (
      element.type === "image" && element.id === "large-secondary-image"
    ));
    const preservedLargeVideo = output.slideContent.elements.find((element) => (
      element.type === "video" && element.id === "large-secondary-video"
    ));
    expect(preservedLargeImage).toBeTruthy();
    expect(preservedLargeVideo).toBeTruthy();
    if (preservedLargeImage && preservedLargeImage.type === "image") {
      expect(preservedLargeImage.width).toBeLessThan(421);
      expect(preservedLargeImage.height).toBeLessThan(361);
      expect(preservedLargeImage.x).toBeGreaterThanOrEqual(0);
      expect(preservedLargeImage.y).toBeGreaterThanOrEqual(0);
    }
    if (preservedLargeVideo && preservedLargeVideo.type === "video") {
      expect(preservedLargeVideo.width).toBeLessThan(421);
      expect(preservedLargeVideo.height).toBeLessThan(361);
      expect(preservedLargeVideo.x).toBeGreaterThanOrEqual(0);
      expect(preservedLargeVideo.y).toBeGreaterThanOrEqual(0);
    }
    expect(output.warnings.some((warning) => warning.includes("Preserved 2 existing user element"))).toBe(true);
  });

  it("preserves more than 12 user media elements during relayout", () => {
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockReturnValue({
      slideContent: {
        elements: [
          { id: "img-main", type: "image", x: 0, y: 0, width: 900, height: 720, src: "https://cdn.example.com/bg.jpg", alt: "hero" },
          { id: "title", type: "text", x: 72, y: 120, width: 520, height: 120, text: "Slide title", color: "#ffffff" },
        ],
      },
      warnings: [],
    });

    const extraMedia: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 10; i += 1) {
      extraMedia.push({
        id: `user-image-${i}`,
        type: "image",
        x: 20 + (i * 8),
        y: 340 + (i * 3),
        width: 220,
        height: 140,
        src: `https://cdn.example.com/user-image-${i}.png`,
        alt: `user image ${i}`,
      });
    }
    for (let i = 0; i < 6; i += 1) {
      extraMedia.push({
        id: `user-video-${i}`,
        type: "video",
        x: 40 + (i * 10),
        y: 420 + (i * 2),
        width: 260,
        height: 150,
        src: `https://cdn.example.com/user-video-${i}.mp4`,
        title: `user video ${i}`,
        muted: true,
      });
    }

    const output = relayoutExistingSlide({
      slideTitle: "Slide title",
      deckTitle: "Deck",
      slideIndex: 1,
      totalSlides: 3,
      includeSvg: true,
      slideContent: {
        elements: [
          { id: "bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#1a1a2e" },
          { id: "img-main-old", type: "image", x: 0, y: 0, width: 1280, height: 720, src: "https://cdn.example.com/bg.jpg", alt: "main" },
          ...extraMedia,
          { id: "title", type: "text", x: 72, y: 170, width: 520, height: 120, text: "Slide title", color: "#ffffff", fontSize: 58, fontWeight: "700" },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
      },
    });

    const preservedIds = output.slideContent.elements
      .map((element) => element.id)
      .filter((id) => id.startsWith("user-image-") || id.startsWith("user-video-"));
    expect(preservedIds.length).toBe(16);
    expect(output.warnings.some((warning) => warning.includes("Preserved 16 existing user element"))).toBe(true);
  });
});

describe("relayoutExistingSlideAsync", () => {
  it("honors locked llm_layout_dsl mode through the async relayout path", async () => {
    process.env.PRESENTATION_AI_LAYOUT_DSL_ENABLED = "true";
    try {
      mockGetBuiltInPreset.mockReturnValue({
        id: "dark-professional",
        name: "Dark Professional",
        colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
        typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
      });
      mockPickRandomSvg.mockReturnValue(MOCK_SVG);
      mockGenerateSlide.mockReturnValue({ slideContent: { elements: [] }, warnings: [] });
      mockCallLLMStructured.mockResolvedValue({
        data: {
          status: "ok",
          elements: [
            {
              id: "dsl-title",
              type: "text",
              x: 96,
              y: 80,
              width: 540,
              height: 120,
              text: "DSL Layout",
              color: "#111827",
              fontSize: 58,
              fontWeight: "700",
            },
            {
              id: "dsl-body",
              type: "text",
              x: 96,
              y: 220,
              width: 540,
              height: 120,
              text: "ข้อความยาวที่ควรให้ DSL จัดเอง พร้อมคงโครงเรื่องหลักของสไลด์ไว้ครบถ้วน",
              color: "#374151",
              fontSize: 24,
            },
          ],
          groups: [],
        },
        tokensUsed: 30,
        creditsUsed: 1,
      });

      const output = await relayoutExistingSlideAsync({
        slideTitle: "DSL Layout",
        deckTitle: "Deck",
        slideIndex: 2,
        totalSlides: 5,
        slideContent: {
          elements: [
            { id: "title", type: "text", x: 40, y: 40, width: 300, height: 80, text: "Old", color: "#111827" },
          ],
          canvas: { width: 1280, height: 720, preset: "16:9" },
          aiDesign: {
            source: "draft-with-ai",
            taskId: "task-1",
            schemaVersion: "presentation_ai_layout_v1",
            mode: "llm_layout_dsl",
            modeLocked: true,
            userOverrideMode: "llm_layout_dsl",
            selectionMode: "heuristic",
            narrative: {
              title: "DSL Layout",
              body: ["ข้อความยาวที่ควรให้ DSL จัดเอง"],
              templateId: "split_right_image",
            },
            generatedAt: "2026-03-14T10:00:00.000Z",
          },
        },
      }, buildMockActor());

      expect(output.slideContent.aiDesign?.mode).toBe("llm_layout_dsl");
      expect(output.slideContent.elements.some((element) => (
        element.type === "text" && "text" in element && element.text === "DSL Layout"
      ))).toBe(true);
      expect(output.warnings.some((warning) => warning.includes("currently rebuilds this slide through the structured layout path"))).toBe(false);
    } finally {
      delete process.env.PRESENTATION_AI_LAYOUT_DSL_ENABLED;
    }
  });

  it("honors locked full_slide_media mode by reusing the existing hero visual", async () => {
    process.env.PRESENTATION_AI_FULL_SLIDE_MEDIA_ENABLED = "true";
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockReturnValue({ slideContent: { elements: [] }, warnings: [] });

    const output = await relayoutExistingSlideAsync({
      slideTitle: "Poster",
      deckTitle: "Deck",
      slideIndex: 2,
      totalSlides: 5,
      slideContent: {
        elements: [
          { id: "hero", type: "image", x: 120, y: 60, width: 900, height: 600, src: "https://cdn.example.com/hero.jpg", alt: "hero" },
          { id: "title", type: "text", x: 80, y: 80, width: 360, height: 80, text: "Poster", color: "#111827" },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
        aiDesign: {
          source: "draft-with-ai",
          taskId: "task-1",
          schemaVersion: "presentation_ai_layout_v1",
          mode: "full_slide_media",
          modeLocked: true,
          userOverrideMode: "full_slide_media",
          selectionMode: "heuristic",
          narrative: {
            title: "Poster",
            body: ["ข้อความสั้นเพื่อบอกเจตนาของภาพเต็มหน้า"],
            templateId: "hero_center",
          },
          generatedAt: "2026-03-14T10:00:00.000Z",
        },
      },
    }, buildMockActor());

    expect(output.slideContent.aiDesign?.mode).toBe("full_slide_media");
    expect(output.slideContent.visualOnly).toBe(true);
    expect(output.slideContent.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "image",
        src: "https://cdn.example.com/hero.jpg",
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
      }),
    ]));
  });

  it("honors locked full_slide_media mode by generating a new visual when a token is available", async () => {
    process.env.PRESENTATION_AI_FULL_SLIDE_MEDIA_ENABLED = "true";
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockReturnValue({ slideContent: { elements: [] }, warnings: [] });
    mockGetModelsByTypeAsync.mockResolvedValue([
      {
        id: "nano-banana-2",
        name: "Nano Banana 2",
        provider: "test-provider",
        aspectRatios: ["16:9"],
        configJson: { generateType: "text-to-image" },
      },
    ]);
    mockGenerateImageAsync.mockResolvedValue({ id: "relayout-image-task", status: "processing" });
    mockGetTask.mockResolvedValue({
      id: "relayout-image-task",
      status: "completed",
      resultUrl: "https://cdn.example.com/generated-full-slide.jpg",
    });

    const output = await relayoutExistingSlideAsync({
      slideTitle: "Poster",
      deckTitle: "Deck",
      slideIndex: 2,
      totalSlides: 5,
      userToken: "user-token",
      slideContent: {
        elements: [
          { id: "title", type: "text", x: 80, y: 80, width: 360, height: 80, text: "Poster", color: "#111827" },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
        aiDesign: {
          source: "draft-with-ai",
          taskId: "task-1",
          schemaVersion: "presentation_ai_layout_v1",
          mode: "full_slide_media",
          modeLocked: true,
          userOverrideMode: "full_slide_media",
          selectionMode: "heuristic",
          narrative: {
            title: "Poster",
            body: ["ข้อความสั้นเพื่อบอกเจตนาของภาพเต็มหน้า"],
            templateId: "hero_center",
          },
          generatedAt: "2026-03-14T10:00:00.000Z",
        },
      },
    }, buildMockActor());

    expect(mockGenerateImageAsync).toHaveBeenCalled();
    expect(output.slideContent.aiDesign?.mode).toBe("full_slide_media");
    expect(output.slideContent.aiDesign?.mediaModeMetadata?.modelId).toBe("nano-banana-2");
    expect(output.slideContent.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "image",
        src: "https://cdn.example.com/generated-full-slide.jpg",
        imageModelId: "nano-banana-2",
      }),
    ]));
    expect(output.warnings).toContain("Rebuilt this slide as a full-slide media layout with a newly generated visual.");
  });

  it("honors locked full_slide_media mode by generating a new video for video-led slides when a token is available", async () => {
    process.env.PRESENTATION_AI_FULL_SLIDE_MEDIA_ENABLED = "true";
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
    });
    mockPickRandomSvg.mockReturnValue(MOCK_SVG);
    mockGenerateSlide.mockReturnValue({ slideContent: { elements: [] }, warnings: [] });
    mockGetModelsByTypeAsync.mockImplementation(async (type: string) => {
      if (type === "video") {
        return [
          {
            id: "veo3-fast",
            name: "Veo 3 Fast",
            provider: "test-provider",
            aspectRatios: ["16:9"],
            durations: [5],
            configJson: { generateType: "text-to-video" },
          },
        ];
      }
      return [];
    });
    mockGenerateVideoAsync.mockResolvedValue({ id: "relayout-video-task", status: "processing" });
    mockGetTask.mockResolvedValue({
      id: "relayout-video-task",
      status: "completed",
      resultUrl: "https://cdn.example.com/generated-full-slide.mp4",
    });

    const output = await relayoutExistingSlideAsync({
      slideTitle: "Launch reel",
      deckTitle: "Deck",
      slideIndex: 2,
      totalSlides: 5,
      userToken: "user-token",
      slideContent: {
        elements: [
          { id: "clip", type: "video", x: 120, y: 60, width: 900, height: 600, src: "https://cdn.example.com/original.mp4", title: "Original clip" },
          { id: "title", type: "text", x: 80, y: 80, width: 360, height: 80, text: "Launch reel", color: "#111827" },
        ],
        canvas: { width: 1280, height: 720, preset: "16:9" },
        aiDesign: {
          source: "draft-with-ai",
          taskId: "task-1",
          schemaVersion: "presentation_ai_layout_v1",
          mode: "full_slide_media",
          modeLocked: true,
          userOverrideMode: "full_slide_media",
          selectionMode: "heuristic",
          narrative: {
            title: "Launch reel",
            body: ["ข้อความสั้นเพื่อสั่ง mood ของคลิปเต็มหน้า"],
            templateId: "hero_center",
          },
          generatedAt: "2026-03-14T10:00:00.000Z",
        },
      },
    }, buildMockActor());

    expect(mockGenerateVideoAsync).toHaveBeenCalled();
    expect(output.slideContent.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "video",
        src: "https://cdn.example.com/generated-full-slide.mp4",
        videoModelId: "veo3-fast",
      }),
    ]));
    expect(output.slideContent.aiDesign?.mediaModeMetadata?.modelId).toBe("veo3-fast");
    expect(output.warnings).toContain("Rebuilt this slide as a full-slide media layout with a newly generated visual.");
  });
});

describe("repairSlideFromSavedNote", () => {
  it("sanitizes incompatible aiDesign metadata from draft output instead of dropping it", () => {
    const warnings: string[] = [];
    const stabilized = finalizeSlideContentBeforeDraftInsert({
      elements: [
        { id: "title", type: "text", x: 80, y: 80, width: 400, height: 80, text: "Stable slide", color: "#111827" },
      ],
      aiDesign: {
        source: "draft-with-ai",
        selectionMode: "none",
        selectionReason: "x".repeat(700),
      } as any,
    }, warnings);

    expect(presentationSlideContentSchema.safeParse(stabilized).success).toBe(true);
    expect(stabilized.aiDesign).toEqual(expect.objectContaining({
      source: "draft-with-ai",
      selectionMode: "none",
      selectionReason: expect.any(String),
    }));
    expect((stabilized.aiDesign?.selectionReason ?? "").length).toBeLessThanOrEqual(512);
    expect(warnings).toContain("Draft render dropped incompatible optional metadata to satisfy schema validation.");
  });

  it("sanitizes incompatible aiDesign metadata from auto layout output instead of surfacing schema validation", () => {
    const warnings: string[] = [];
    const stabilized = finalizeSlideContentAfterRelayout({
      elements: [
        { id: "title", type: "text", x: 80, y: 80, width: 400, height: 80, text: "Stable slide", color: "#111827" },
      ],
      aiDesign: {
        source: "draft-with-ai",
        selectionMode: "none",
        selectionReason: "x".repeat(700),
      } as any,
    }, warnings);

    expect(presentationSlideContentSchema.safeParse(stabilized).success).toBe(true);
    expect(stabilized.aiDesign).toEqual(expect.objectContaining({
      source: "draft-with-ai",
      selectionMode: "none",
    }));
    expect(warnings).toContain("Auto layout dropped incompatible optional metadata to satisfy schema validation.");
  });

  it("sanitizes incompatible aiDesign metadata instead of returning invalid slide content", () => {
    const warnings: string[] = [];
    const stabilized = finalizeSlideContentAfterRepair({
      elements: [
        { id: "title", type: "text", x: 80, y: 80, width: 400, height: 80, text: "Stable slide", color: "#111827" },
      ],
      aiDesign: {
        source: "draft-with-ai",
        selectionMode: "none",
        selectionReason: "x".repeat(700),
      } as any,
    }, warnings);

    expect(presentationSlideContentSchema.safeParse(stabilized).success).toBe(true);
    expect(stabilized.aiDesign).toEqual(expect.objectContaining({
      source: "draft-with-ai",
      selectionMode: "none",
    }));
    expect(warnings).toContain("Regenerated slide content dropped incompatible optional metadata to satisfy schema validation.");
  });

  it("rebuilds a slide from the saved note and regenerates image media", async () => {
    setupHappyPath();
    mockGenerateSlide.mockImplementation((input: any) => ({
      slideContent: {
        elements: [
          {
            id: "generated-image",
            type: "image",
            x: 640,
            y: 0,
            width: 640,
            height: 720,
            src: input.imageUrl ?? "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'></svg>",
            alt: "generated hero",
          },
          {
            id: "generated-title",
            type: "text",
            x: 72,
            y: 96,
            width: 520,
            height: 120,
            text: input.slideData.title,
            color: "#ffffff",
          },
        ],
      },
      warnings: [],
    }));

    const result = await repairSlideFromSavedNote(
      {
        deckId: 7,
        slideTitle: "Old broken title",
        slideContent: {
          elements: [
            { id: "old-bg", type: "rect", x: 0, y: 0, width: 1280, height: 720, fill: "#ffffff" },
          ],
          canvas: { width: 1280, height: 720, preset: "16:9" },
        },
        slideNotes: "ขั้นตอนปฏิบัติ / เคล็ดลับ 1. สร้างกิจวัตรก่อนนอน: ทำกิจกรรมแบบเดิมในเวลาคล้ายกันทุกวันเพื่อให้เด็กคาดเดาได้ 2. กำหนดเวลาเข้านอน: ตั้งเวลาเข้านอนที่สม่ำเสมอทุกวัน 3. สร้างสภาพแวดล้อมที่เอื้อต่อการนอน: ห้องนอนควรเงียบ สบาย และมีอุณหภูมิที่เหมาะสม 4. ไม่ต้องตอบสนองทันทีเมื่อเด็กตื่น: หากเด็กตื่นขึ้นในกลางคืน ให้รอสักครู่ก่อนที่จะเข้าไปดูเพื่อดูว่าเขาจะกลับไปนอนเองได้หรือไม่ 5. ใช้เสียงเพลงหรือเสียงธรรมชาติ: เสียงที่อ่อนโยนสามารถช่วยให้เด็กผ่อนคลายและนอนหลับได้ดีขึ้น ความผิดพลาดที่พบบ่อย - ให้เด็กนอนในที่นอนที่ไม่ปลอดภัย: ควรให้เด็กนอนในที่นอนที่เหมาะสมและปลอดภัย - นิสัยการให้อาหารตลอดคืน: หลีกเลี่ยงการให้อาหารเด็กเมื่อเขาตื่นกลางคืนเพื่อลดการตื่นบ่อย - ไม่มีกิจวัตรชัดเจน: การไม่มีกิจวัตรก่อนนอนอาจทำให้เด็กไม่รู้ว่าเมื่อไหร่ถึงเวลานอน",
        deckTitle: "Deck",
        slideIndex: 3,
        totalSlides: 6,
      },
      buildMockActor(),
      "test-token",
    );

    expect(result.title).toBe("ขั้นตอนปฏิบัติ / เคล็ดลับ");
    expect(mockGenerateImageAsync).toHaveBeenCalled();
    expect(mockGetTask).not.toHaveBeenCalled();
    expect(mockGenerateSlide).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: null,
    }));
    const repairLayoutInput = mockGenerateSlide.mock.calls[0]?.[0];
    expect(["split_left_image", "split_right_image", "top_image_text_bottom", "bottom_image_text_top"]).toContain(
      repairLayoutInput?.slideData?.templateId,
    );
    expect(repairLayoutInput?.slideData?.markdownHierarchy).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: "body", text: expect.stringContaining("สร้างกิจวัตรก่อนนอน") }),
      expect.objectContaining({ level: "body", text: expect.stringContaining("ไม่มีกิจวัตรชัดเจน") }),
    ]));
    expect(result.applied.regeneratedImage).toBe(true);
    expect(["split_left_image", "split_right_image", "top_image_text_bottom", "bottom_image_text_top"]).toContain(
      result.applied.templateId,
    );
    expect((result.slideContent as any).pendingMediaJobs?.length).toBeGreaterThan(0);
    expect(result.warnings).toContain("Dense slide note detected; prioritized full text coverage over block-based layout.");
    expect(result.slideContent.aiDesign?.source).toBe("draft-with-ai");
    expect(result.slideContent.aiDesign?.narrative?.title).toBe("ขั้นตอนปฏิบัติ / เคล็ดลับ");
    expect(result.slideContent.aiDesign?.narrative?.body.join("\n")).toContain("สร้างกิจวัตรก่อนนอน");
    const generatedImage = result.slideContent.elements.find((element) => element.type === "image");
    expect(generatedImage?.type).toBe("image");
    if (generatedImage?.type === "image") {
      expect(generatedImage.src).toContain("data:image/svg+xml");
      expect(generatedImage.imagePrompt).toContain("ขั้นตอนปฏิบัติ / เคล็ดลับ");
      expect(generatedImage.imageModelId).toBe("flux-2.0");
    }
  });
});

describe("generateAIDraft - happy path", () => {
  it("completes full 7-phase pipeline", async () => {
    setupHappyPath();
    const input = buildMockInput();
    const actor = buildMockActor();

    await generateAIDraft(input, actor, "test-token", "task-123");

    // Phase 1: Article generation
    expect(mockGetSkillByIdAsync).toHaveBeenCalledWith("general-article-writer");
    expect(mockExecuteWithFallback).toHaveBeenCalled();

    // Phase 2: Split
    expect(mockCallLLMStructured).toHaveBeenCalled();

    // Phase 3+4: Image enhancement + generation (3 slides)
    expect(mockGenerateImageAsync).toHaveBeenCalledTimes(3);

    // Phase 5: Layout
    expect(mockGenerateSlide).toHaveBeenCalledTimes(3);

    // Phase 6: DB insertion
    expect(mockDbTransaction).toHaveBeenCalledTimes(1);
    expect(mockAddSlideToDeck).toHaveBeenCalledTimes(3);
    expect(mockAddSlideToDeck.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        notes: "Title: Test 1. Section One Content one",
      }),
    );
    expect((mockAddSlideToDeck.mock.calls[1]?.[0] as { notes: string }).notes).toBe("2. Section Two Content two");
    expect((mockAddSlideToDeck.mock.calls[2]?.[0] as { notes: string }).notes).toBe("3. Section Three Content three");
    expect(mockUpdatePresentationDeckMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        deckId: 1,
        expectedVersion: 3,
        notes: MOCK_ARTICLE,
      }),
      actor,
      expect.anything(),
    );
  });

  it("plans slides directly from the topic for image prompt generation skills", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "image-prompt-engineer") {
        return {
          id: "image-prompt-engineer",
          name: "Image Prompt Engineer",
          category: "image_prompt_generation",
          type: "prompt-enhancement",
          systemPrompt: "Enhance visual prompts.",
          executionMode: "enhance-prompt",
        };
      }
      return undefined;
    });

    await generateAIDraft(
      buildMockInput({
        draftSkillId: "image-prompt-engineer",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const planningCall = mockCallLLMStructured.mock.calls[0]?.[0] as { billingMetadata?: Record<string, unknown> } | undefined;
    expect(planningCall?.billingMetadata?.stage).toBe("topic_to_slide_plan");
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(3);
    expect(mockGenerateImageAsync).toHaveBeenCalledTimes(3);
  });

  it("repairs incomplete topic planning slides before rendering", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "image-prompt-engineer") {
        return {
          id: "image-prompt-engineer",
          name: "Image Prompt Engineer",
          category: "image_prompt_generation",
          type: "prompt-enhancement",
          systemPrompt: "Enhance visual prompts.",
          executionMode: "enhance-prompt",
        };
      }
      return undefined;
    });
    mockCallLLMStructured.mockResolvedValueOnce({
      data: [
        {
          templateId: "hero_center",
          title: "AI adoption in hospitals",
          body: [],
          notes: "# AI adoption in hospitals\n## Why teams are moving now\nHospitals need faster triage.\nAutomation reduces admin load.",
          sections: [
            {
              heading: "Why teams are moving now",
              details: [],
            },
          ],
          graphicCategory: "Health",
          imagePromptKeywords: "AI hospital operations dashboard",
        },
      ],
      tokensUsed: 180,
      creditsUsed: 6,
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 1,
        draftSkillId: "image-prompt-engineer",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const firstLayoutCall = mockGenerateSlide.mock.calls[0]?.[0] as {
      slideData: { body: string[]; sections?: Array<{ heading: string; details: string[] }> };
    };
    expect(firstLayoutCall.slideData.body).toEqual(expect.arrayContaining([
      "Hospitals need faster triage.",
      "Automation reduces admin load.",
    ]));
    expect(firstLayoutCall.slideData.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        heading: "Why teams are moving now",
        details: expect.arrayContaining(["Hospitals need faster triage."]),
      }),
    ]));

    const progressCalls = mockRedisSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"),
    );
    const finalProgress = JSON.parse(progressCalls[progressCalls.length - 1][1] as string);
    expect(finalProgress.error).toBeUndefined();
  });

  it("treats video prompt generation skills as prompt-first and defaults media generation to video", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "video-prompt-engineer") {
        return {
          id: "video-prompt-engineer",
          name: "Video Prompt Engineer",
          category: "video_prompt_generation",
          type: "prompt-enhancement",
          systemPrompt: "Create cinematic video prompts.",
          executionMode: "enhance-prompt",
        };
      }
      return undefined;
    });

    await generateAIDraft(
      buildMockInput({
        draftSkillId: "video-prompt-engineer",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const planningCall = mockCallLLMStructured.mock.calls[0]?.[0] as { billingMetadata?: Record<string, unknown> } | undefined;
    expect(planningCall?.billingMetadata?.stage).toBe("topic_to_slide_plan");
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(3);
    expect(mockGenerateVideoAsync).toHaveBeenCalledTimes(3);
    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
  });

  it("treats video-first draft skills as the default media generator", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "video-story-crafter") {
        return {
          id: "video-story-crafter",
          name: "Video Story Crafter",
          category: "video_generation",
          type: "video-generation",
          executionMode: "media-generate",
        };
      }
      return undefined;
    });

    await generateAIDraft(
      buildMockInput({
        draftSkillId: "video-story-crafter",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const planningCall = mockCallLLMStructured.mock.calls[0]?.[0] as { billingMetadata?: Record<string, unknown> } | undefined;
    expect(planningCall?.billingMetadata?.stage).toBe("topic_to_slide_plan");
    expect(mockGenerateVideoAsync).toHaveBeenCalledTimes(3);
    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
  });

  it("treats image-first draft skills as the default media generator", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "image-creator") {
        return {
          id: "image-creator",
          name: "Image Creator",
          category: "image_generation",
          type: "image-generation",
          executionMode: "media-generate",
        };
      }
      return undefined;
    });

    await generateAIDraft(
      buildMockInput({
        draftSkillId: "image-creator",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const planningCall = mockCallLLMStructured.mock.calls[0]?.[0] as { billingMetadata?: Record<string, unknown> } | undefined;
    expect(planningCall?.billingMetadata?.stage).toBe("topic_to_slide_plan");
    expect(mockGenerateImageAsync).toHaveBeenCalledTimes(3);
    expect(mockGenerateVideoAsync).not.toHaveBeenCalled();
  });

  it("surfaces a friendly topic planning error when structured output is incomplete", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "image-prompt-engineer") {
        return {
          id: "image-prompt-engineer",
          name: "Image Prompt Engineer",
          category: "image_prompt_generation",
          type: "prompt-enhancement",
          systemPrompt: "Enhance visual prompts.",
          executionMode: "enhance-prompt",
        };
      }
      return undefined;
    });
    mockCallLLMStructured.mockRejectedValueOnce(Object.assign(
      new Error("LLM response failed schema validation after 2 attempt(s): Array must contain at least 1 element(s)"),
      {
        name: "LLMStructuredOutputError",
        zodErrors: new z.ZodError([
          {
            code: "too_small",
            minimum: 1,
            type: "array",
            inclusive: true,
            exact: false,
            message: "Array must contain at least 1 element(s)",
            path: [0, "body"],
          },
        ]),
      },
    ));

    await generateAIDraft(
      buildMockInput({
        draftSkillId: "image-prompt-engineer",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const progressCalls = mockRedisSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"),
    );
    const finalProgress = JSON.parse(progressCalls[progressCalls.length - 1][1] as string);
    expect(finalProgress.error.message).toBe(
      "Topic planning returned incomplete slide data. Please retry.",
    );
  });

  it("generates and attaches per-slide audio tracks when audio is enabled", async () => {
    setupHappyPath();
    await generateAIDraft(
      buildMockInput({
        numSlides: 2,
        generateAudio: true,
        audioModel: "elevenlabs-tts",
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockGenerateAudioAsync).toHaveBeenCalledTimes(2);
    expect(mockAddMediaTaskToLibrary).toHaveBeenCalledTimes(2);
    const firstInsertPayload = mockAddSlideToDeck.mock.calls[0]?.[0] as { audioTrack?: Record<string, unknown> } | undefined;
    expect(firstInsertPayload?.audioTrack).toMatchObject({
      libraryItemId: 301,
      volume: 1,
      startAtMs: 0,
      endAtMs: null,
    });
  });

  it("sets slide duration to generated audio length for image plus audio drafts", async () => {
    setupHappyPath();
    mockGetTask.mockImplementation(async (taskId: string) => {
      if (taskId === "audio-task-1") {
        return {
          id: "audio-task-1",
          status: "completed",
          resultUrl: "https://cdn.example.com/narration.mp3",
          resultData: {
            response: {
              data: [{ url: "https://cdn.example.com/narration.mp3", durationSeconds: 7.2 }],
            },
          },
        };
      }
      return {
        id: taskId,
        status: "completed",
        resultUrl: "https://cdn.example.com/image.jpg",
        resultData: {
          response: {
            data: [{ url: "https://cdn.example.com/image.jpg" }],
          },
        },
      };
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 1,
        generateAudio: true,
        audioModel: "elevenlabs-tts",
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const firstInsertPayload = mockAddSlideToDeck.mock.calls[0]?.[0] as {
      slideContent?: { durationMs?: number };
    } | undefined;
    expect(firstInsertPayload?.slideContent?.durationMs).toBe(7200);
  });

  it("sets slide duration to the longer of generated video and audio lengths", async () => {
    setupHappyPath();
    mockGenerateSlide.mockImplementation(({ imageUrl }: { imageUrl?: string | null }) => ({
      slideContent: {
        elements: [
          {
            id: "img-1",
            type: "image",
            x: 0,
            y: 0,
            width: 640,
            height: 360,
            src: imageUrl || "https://cdn.example.com/clip.mp4",
            alt: "Generated media",
          },
        ],
      },
      warnings: [],
    }));
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "video-skill") {
        return {
          id: "video-skill",
          name: "Video Skill",
          type: "video-generation",
          systemPrompt: "Create a video prompt.",
          executionMode: "llm-only",
        };
      }
      return {
        id: "general-article-writer",
        name: "General Article Writer",
        systemPrompt: "You are a versatile article writer.",
        executionMode: "llm-only",
      };
    });
    mockGetModelsByTypeAsync.mockImplementation(async (type: string) => {
      if (type === "audio") {
        return [
          {
            id: "elevenlabs-tts",
            type: "audio",
            name: "ElevenLabs Text-to-Speech",
            provider: "kie.ai",
            description: "High-quality text-to-speech",
            aliases: [],
            creditCost: 5,
            isEnabled: true,
            priority: 0,
            configJson: { generateType: "text-to-audio" },
          },
        ];
      }
      if (type === "video") {
        return [
          {
            id: "veo-3-1",
            type: "video",
            name: "Veo 3.1",
            provider: "kie.ai",
            description: "Video generation",
            aliases: [],
            creditCost: 20,
            isEnabled: true,
            priority: 0,
            durations: [5],
            aspectRatios: ["16:9", "9:16"],
            configJson: { generateType: "text-to-video" },
          },
        ];
      }
      return [];
    });
    mockGenerateVideoAsync.mockResolvedValue({ id: "video-task-1", status: "processing" });
    mockGetTask.mockImplementation(async (taskId: string) => {
      if (taskId === "video-task-1") {
        return {
          id: "video-task-1",
          status: "completed",
          resultUrl: "https://cdn.example.com/clip.mp4",
          resultData: {
            response: {
              data: [{ url: "https://cdn.example.com/clip.mp4", duration: 4.5 }],
            },
          },
          parameters: {
            duration: 5,
          },
        };
      }
      if (taskId === "audio-task-1") {
        return {
          id: "audio-task-1",
          status: "completed",
          resultUrl: "https://cdn.example.com/narration.mp3",
          resultData: {
            response: {
              data: [{ url: "https://cdn.example.com/narration.mp3", durationSeconds: 7.4 }],
            },
          },
        };
      }
      return {
        id: taskId,
        status: "completed",
      };
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 1,
        generateAudio: true,
        audioModel: "elevenlabs-tts",
        imageSkillId: "video-skill",
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const firstInsertPayload = mockAddSlideToDeck.mock.calls[0]?.[0] as {
      slideContent?: { durationMs?: number; elements?: Array<Record<string, unknown>> };
    } | undefined;
    expect(firstInsertPayload?.slideContent?.durationMs).toBe(7400);
    expect(firstInsertPayload?.slideContent?.elements?.some((element) => element.type === "video")).toBe(true);
  });

  it("converts visual-only component fallback media into video elements for video drafts", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "video-skill") {
        return {
          id: "video-skill",
          name: "Video Skill",
          type: "video-generation",
          systemPrompt: "Create a video prompt.",
          executionMode: "llm-only",
        };
      }
      return {
        id: "general-article-writer",
        name: "General Article Writer",
        systemPrompt: "You are a versatile article writer.",
        executionMode: "llm-only",
      };
    });
    mockGetModelsByTypeAsync.mockImplementation(async (type: string) => {
      if (type === "video") {
        return [
          {
            id: "veo3-fast",
            name: "Veo 3 Fast",
            provider: "test-provider",
            aspectRatios: ["16:9"],
            durations: [5],
            configJson: { generateType: "text-to-video" },
          },
        ];
      }
      return [];
    });
    mockGenerateVideoAsync.mockResolvedValue({ id: "video-task-1", status: "processing" });
    mockGetTask.mockResolvedValue({
      id: "video-task-1",
      status: "completed",
      resultUrl: "https://cdn.example.com/fullpage.mp4",
    });
    mockGenerateSlide.mockImplementation(({ imageUrl }: { imageUrl?: string | null }) => ({
      slideContent: {
        elements: [],
        components: [
          {
            id: "cmp-1",
            componentId: "fullpage-image",
            componentType: "built-in",
            definitionRevision: 1,
            slotBindings: [
              {
                slotId: "fullpage",
                type: "image",
                src: imageUrl || "https://cdn.example.com/fullpage.mp4",
                alt: "Full page media",
              },
            ],
            fallbackElements: [
              {
                id: "cmp-1::fullpage-image",
                type: "image",
                x: 0,
                y: 0,
                width: 1280,
                height: 720,
                src: imageUrl || "https://cdn.example.com/fullpage.mp4",
                alt: "Full page media",
                imageFit: "cover",
                imagePositionX: 50,
                imagePositionY: 50,
                imageZoom: 1,
              },
            ],
          },
        ],
      },
      warnings: [],
    }));

    await generateAIDraft(
      buildMockInput({
        numSlides: 1,
        hideTextOnSlides: true,
        imageSkillId: "video-skill",
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const firstInsertPayload = mockAddSlideToDeck.mock.calls[0]?.[0] as {
      slideContent?: {
        visualOnly?: boolean;
        components?: Array<{
          slotBindings?: Array<Record<string, unknown>>;
          fallbackElements?: Array<Record<string, unknown>>;
        }>;
      };
    } | undefined;
    expect(firstInsertPayload?.slideContent?.visualOnly).toBe(true);
    expect(firstInsertPayload?.slideContent?.components?.[0]?.slotBindings?.[0]).toMatchObject({
      type: "video",
      src: "https://cdn.example.com/fullpage.mp4",
    });
    expect(firstInsertPayload?.slideContent?.components?.[0]?.fallbackElements?.[0]).toMatchObject({
      type: "video",
      src: "https://cdn.example.com/fullpage.mp4",
    });
  });

  it("parses time-string media durations and keeps the longest one for slide timing", async () => {
    setupHappyPath();
    mockGenerateSlide.mockImplementation(({ imageUrl }: { imageUrl?: string | null }) => ({
      slideContent: {
        elements: [
          {
            id: "img-1",
            type: "image",
            x: 0,
            y: 0,
            width: 640,
            height: 360,
            src: imageUrl || "https://cdn.example.com/clip.mp4",
            alt: "Generated media",
          },
        ],
      },
      warnings: [],
    }));
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "video-skill") {
        return {
          id: "video-skill",
          name: "Video Skill",
          type: "video-generation",
          systemPrompt: "Create a video prompt.",
          executionMode: "llm-only",
        };
      }
      return {
        id: "general-article-writer",
        name: "General Article Writer",
        systemPrompt: "You are a versatile article writer.",
        executionMode: "llm-only",
      };
    });
    mockGetModelsByTypeAsync.mockImplementation(async (type: string) => {
      if (type === "audio") {
        return [
          {
            id: "elevenlabs-tts",
            type: "audio",
            name: "ElevenLabs Text-to-Speech",
            provider: "kie.ai",
            description: "High-quality text-to-speech",
            aliases: [],
            creditCost: 5,
            isEnabled: true,
            priority: 0,
            configJson: { generateType: "text-to-audio" },
          },
        ];
      }
      if (type === "video") {
        return [
          {
            id: "veo-3-1",
            type: "video",
            name: "Veo 3.1",
            provider: "kie.ai",
            description: "Video generation",
            aliases: [],
            creditCost: 20,
            isEnabled: true,
            priority: 0,
            durations: [5, 10],
            aspectRatios: ["16:9", "9:16"],
            configJson: { generateType: "text-to-video" },
          },
        ];
      }
      return [];
    });
    mockGenerateVideoAsync.mockResolvedValue({ id: "video-task-1", status: "processing" });
    mockGetTask.mockImplementation(async (taskId: string) => {
      if (taskId === "video-task-1") {
        return {
          id: "video-task-1",
          status: "completed",
          resultUrl: "https://cdn.example.com/clip.mp4",
          resultData: {
            response: {
              data: [{ url: "https://cdn.example.com/clip.mp4", duration: "0:08" }],
            },
          },
          parameters: {
            duration: "0:10",
          },
        };
      }
      if (taskId === "audio-task-1") {
        return {
          id: "audio-task-1",
          status: "completed",
          resultUrl: "https://cdn.example.com/narration.mp3",
          resultData: {
            response: {
              data: [{ url: "https://cdn.example.com/narration.mp3", duration: "1:03" }],
            },
          },
        };
      }
      return {
        id: taskId,
        status: "completed",
      };
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 1,
        generateAudio: true,
        audioModel: "elevenlabs-tts",
        imageSkillId: "video-skill",
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const firstInsertPayload = mockAddSlideToDeck.mock.calls[0]?.[0] as {
      slideContent?: { durationMs?: number; elements?: Array<Record<string, unknown>> };
    } | undefined;
    expect(firstInsertPayload?.slideContent?.durationMs).toBe(63_000);
    expect(firstInsertPayload?.slideContent?.elements?.some((element) => element.type === "video")).toBe(true);
  });

  it("uses slide note as the audio source and normalizes TTS-unfriendly symbols", async () => {
    setupHappyPath();
    const customArticle = [
      "การสนับสนุนและข้อควรระวัง • กระตุ้นสมองและร่างกาย + เล่นของเล่นโมบายสีสดใส / พูดคุยใกล้ชิด",
      "ข้อความบนสไลด์ที่ไม่ควรถูกใช้แทน note",
      "สรุปย่อบนสไลด์",
      "อีกบรรทัดหนึ่ง",
    ].join(" ");
    mockCallLLMStructured.mockResolvedValueOnce({
      data: [
        {
          templateId: "hero_center" as const,
          title: "ข้อความบนสไลด์ที่ไม่ควรถูกใช้แทน note",
          body: ["สรุปย่อบนสไลด์", "อีกบรรทัดหนึ่ง"],
          notes: "model note should be ignored for article-driven drafts",
          graphicCategory: "Health" as const,
          imagePromptKeywords: "thai narration",
        },
      ],
      tokensUsed: 120,
      creditsUsed: 4,
    });

    await generateAIDraft(
      buildMockInput({
        prompt: "พัฒนาการเด็ก",
        language: "th",
        numSlides: 1,
        useCustomArticle: true,
        customArticleText: customArticle,
        generateAudio: true,
        audioModel: "elevenlabs-tts",
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const firstAudioCall = mockGenerateAudioAsync.mock.calls[0]?.[0] as { text?: string } | undefined;
    expect(firstAudioCall?.text).toBe(
      "การสนับสนุนและข้อควรระวัง, กระตุ้นสมองและร่างกาย, เล่นของเล่นโมบายสีสดใส, พูดคุยใกล้ชิด ข้อความบนสไลด์ที่ไม่ควรถูกใช้แทน note สรุปย่อบนสไลด์ อีกบรรทัดหนึ่ง",
    );
    expect(firstAudioCall?.text).not.toContain("•");
    expect(firstAudioCall?.text).not.toContain("+");
    expect(firstAudioCall?.text).not.toContain("/");
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

  it("attaches watermark to generated slides when watermark input is provided", async () => {
    setupHappyPath();
    await generateAIDraft(
      buildMockInput({
        watermark: {
          sourceUrl: "https://cdn.example.com/wm.jpg",
          format: "jpg",
          clarityPercent: 25,
        },
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const watermark = mockAddSlideToDeck.mock.calls
      .map((call) => call[0] as { slideContent?: { elements?: unknown[] } })
      .flatMap((payload) => (Array.isArray(payload.slideContent?.elements) ? payload.slideContent.elements : []))
      .find((element: any) => (
        element?.type === "image" && typeof element?.id === "string" && element.id.startsWith("watermark__")
      )) as any;
    expect(watermark).toBeTruthy();
    expect(watermark.src).toBe("https://cdn.example.com/wm.jpg");
    expect(watermark.opacity).toBeCloseTo(0.25, 5);
  });

  it("does not pad slide bodies with duplicate lines when content is sparse", async () => {
    setupHappyPath();
    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    const firstLayoutCall = mockGenerateSlide.mock.calls[0]?.[0];
    expect(firstLayoutCall).toBeDefined();
    // Body must have at least 1 line but should never contain duplicates
    expect(firstLayoutCall.slideData.body.length).toBeGreaterThanOrEqual(1);
    const bodySet = new Set(firstLayoutCall.slideData.body.map((l: string) => l.toLowerCase()));
    expect(bodySet.size).toBe(firstLayoutCall.slideData.body.length);
  });

  it("renders visual-only slides without text chrome when hideTextOnSlides is enabled", async () => {
    setupHappyPath();
    mockGetBuiltInPreset.mockReturnValue({
      id: "dark-professional",
      name: "Dark Professional",
      colors: {
        background: "#1a1a2e",
        backgroundAlt: "#16213e",
        primary: "#e94560",
        secondary: "#0f3460",
        text: "#ffffff",
        textMuted: "#a0a0b0",
        cardBg: ["#16213e", "#0f3460", "#1a1a3e"],
        overlay: "rgba(0,0,0,0.55)",
      },
      typography: {
        titleFontFamily: "Inter",
        bodyFontFamily: "Inter",
        titleFontWeight: 700,
        bodyFontWeight: 400,
      },
      header: { enabled: true, height: 60, backgroundColor: "#101010", showDeckTitle: true },
      footer: { enabled: true, height: 42, backgroundColor: "#101010", showPageNumber: true, showCustomText: true },
    });

    await generateAIDraft(
      buildMockInput({
        hideTextOnSlides: true,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const firstLayoutCall = mockGenerateSlide.mock.calls[0]?.[0] as {
      visualOnly?: boolean;
      stylePreset?: {
        header?: { enabled?: boolean; showDeckTitle?: boolean };
        footer?: { enabled?: boolean; showPageNumber?: boolean; showCustomText?: boolean };
      };
    } | undefined;
    expect(firstLayoutCall).toBeDefined();
    expect(firstLayoutCall?.visualOnly).toBe(true);
    expect(firstLayoutCall?.stylePreset?.header?.enabled).toBe(false);
    expect(firstLayoutCall?.stylePreset?.header?.showDeckTitle).toBe(false);
    expect(firstLayoutCall?.stylePreset?.footer?.enabled).toBe(false);
    expect(firstLayoutCall?.stylePreset?.footer?.showPageNumber).toBe(false);
    expect(firstLayoutCall?.stylePreset?.footer?.showCustomText).toBe(false);
    const firstInsertCall = mockAddSlideToDeck.mock.calls[0]?.[0] as {
      slideContent?: { visualOnly?: boolean };
    } | undefined;
    expect(firstInsertCall?.slideContent?.visualOnly).toBe(true);
  });
});

describe("generateAIDraft - Phase 1", () => {
  it("skips article skill generation when custom article mode is enabled", async () => {
    setupHappyPath();

    await generateAIDraft(
      buildMockInput({
        articleSkillId: undefined,
        useCustomArticle: true,
        customArticleText: "Custom article intro\n\nSection One\nSection Two\nSection Three",
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockGetSkillByIdAsync).not.toHaveBeenCalled();
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
    expect(mockCallLLMStructured).toHaveBeenCalledTimes(1);
    const splitCall = mockCallLLMStructured.mock.calls[0]?.[0];
    expect(splitCall.userMessage).toContain("Custom article intro");
  });

  it("uses the default text model to split a provided custom article", async () => {
    setupHappyPath();

    await generateAIDraft(
      buildMockInput({
        articleSkillId: undefined,
        useCustomArticle: true,
        customArticleText: "Provided article body for direct structuring.",
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const splitCall = mockCallLLMStructured.mock.calls[0]?.[0];
    expect(splitCall.model).toBe("claude-sonnet-4-6");
    expect(splitCall.preferredProviderId).toBeUndefined();
    expect(splitCall.strictProviderPin).toBe(false);
  });

  it("uses an explicit textModel override to split a provided custom article", async () => {
    setupHappyPath();
    mockResolveProviders.mockImplementation(async (model: string) => {
      if (model === "gpt-5.2") {
        return [
          {
            providerId: 2,
            providerName: "opencode-zen",
            baseUrl: "https://example.com",
            apiKey: "test-key",
            providerModelId: "gpt-5.2",
            pricingInput: 0,
            pricingOutput: 0,
            isFree: false,
            priority: 10,
          },
        ];
      }
      return [
        {
          providerId: 1,
          providerName: "test-provider",
          baseUrl: "https://example.com",
          apiKey: "test-key",
          providerModelId: model,
          pricingInput: 0,
          pricingOutput: 0,
          isFree: true,
          priority: 0,
        },
      ];
    });

    await generateAIDraft(
      buildMockInput({
        textModel: "gpt-5.2",
        articleSkillId: undefined,
        useCustomArticle: true,
        customArticleText: "Provided article body for direct structuring.",
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const splitCall = mockCallLLMStructured.mock.calls[0]?.[0];
    expect(splitCall.model).toBe("gpt-5.2");
    expect(splitCall.preferredProviderId).toBeUndefined();
    expect(splitCall.strictProviderPin).toBe(false);
  });

  it("preserves the first markdown heading as the first slide title in custom article mode", async () => {
    setupHappyPath();
    mockCallLLMStructured.mockResolvedValueOnce({
      data: [
        {
          templateId: "hero_center",
          title: "สรุปอย่างรวดเร็ว",
          body: ["สำรอง"],
          sections: [{ heading: "สรุปอย่างรวดเร็ว", details: ["เด็กในวัยเริ่มหัดเดินมักจะแสดงความต้องการที่จะยืนมากกว่าการนั่ง"] }],
          graphicCategory: "Health",
          imagePromptKeywords: "toddler standing support",
        },
        {
          templateId: "split_right_image",
          title: "ใครคือกลุ่มเป้าหมาย",
          body: ["สำรอง"],
          sections: [{ heading: "ใครคือกลุ่มเป้าหมาย", details: ["บทความนี้เหมาะสำหรับพ่อแม่และผู้ดูแลเด็กอายุตั้งแต่หกถึงสิบสองเดือน"] }],
          graphicCategory: "Education",
          imagePromptKeywords: "parents child care",
        },
      ],
      tokensUsed: 300,
      creditsUsed: 10,
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 2,
        articleSkillId: undefined,
        useCustomArticle: true,
        customArticleText: [
          "# เด็กอยากจะยืนไม่อยากนั่งจริงไหม แล้วฝึกยืนได้เมื่อไหร่",
          "",
          "## สรุปอย่างรวดเร็ว",
          "- เด็กในวัยเริ่มหัดเดินมักจะแสดงความต้องการที่จะยืนมากกว่าการนั่ง",
          "- เด็กสามารถเริ่มฝึกยืนได้ตั้งแต่อายุประมาณหกถึงเก้าเดือน",
          "",
          "## ใครคือกลุ่มเป้าหมาย",
          "บทความนี้เหมาะสำหรับพ่อแม่และผู้ดูแลเด็กอายุตั้งแต่หกถึงสิบสองเดือน",
        ].join("\n"),
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const firstSlideCall = mockGenerateSlide.mock.calls[0]?.[0] as
      | {
        slideData?: {
          title?: string;
          sections?: Array<{ heading: string }>;
          markdownHierarchy?: Array<{ level: "h2" | "h3" | "body"; text: string }>;
        };
      }
      | undefined;
    expect(firstSlideCall?.slideData?.title).toBe("เด็กอยากจะยืนไม่อยากนั่งจริงไหม แล้วฝึกยืนได้เมื่อไหร่");
    expect(firstSlideCall?.slideData?.sections?.[0]?.heading).toBe("สรุปอย่างรวดเร็ว");
    expect(firstSlideCall?.slideData?.markdownHierarchy).toEqual([
      { level: "h2", text: "สรุปอย่างรวดเร็ว" },
      { level: "body", text: "- เด็กในวัยเริ่มหัดเดินมักจะแสดงความต้องการที่จะยืนมากกว่าการนั่ง" },
      { level: "body", text: "- เด็กสามารถเริ่มฝึกยืนได้ตั้งแต่อายุประมาณหกถึงเก้าเดือน" },
    ]);
  });

  it("uses article skill language override when top-level language is auto", async () => {
    setupHappyPath();

    await generateAIDraft(
      buildMockInput({
        prompt: "Toddler tantrums",
        language: "auto",
        articleSkillParams: {
          language: "th",
        },
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const firstCall = mockExecuteWithFallback.mock.calls[0]?.[0] as
      | { messages?: Array<{ role?: string; content?: string }> }
      | undefined;
    expect(firstCall?.messages?.[1]?.content).toContain("Write the entire article in Thai.");
  });

  it("loads skill definition via getSkillByIdAsync", async () => {
    setupHappyPath();
    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");
    expect(mockGetSkillByIdAsync).toHaveBeenCalledWith("general-article-writer");
  });

  it("uses skill defaultModel when calling text LLM", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockResolvedValueOnce({
      id: "general-article-writer",
      name: "General Article Writer",
      systemPrompt: "You are a versatile article writer.",
      defaultModel: "gpt-4o-mini",
      executionMode: "llm-only",
    });

    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    const usedModels = [
      ...mockExecuteWithFallback.mock.calls.map((call) => call[0]?.model),
      ...mockCallLLMStructured.mock.calls.map((call) => call[0]?.model),
    ];
    expect(usedModels).toContain("gpt-4o-mini");
  });

  it("prefers an explicit textModel override over the skill default model", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockResolvedValueOnce({
      id: "general-article-writer",
      name: "General Article Writer",
      systemPrompt: "You are a versatile article writer.",
      defaultModel: "gpt-4o-mini",
      executionMode: "llm-only",
    });
    mockResolveProviders.mockImplementation(async (model: string) => {
      if (model === "gpt-5.2") {
        return [
          {
            providerId: 2,
            providerName: "opencode-zen",
            baseUrl: "https://example.com",
            apiKey: "test-key",
            providerModelId: "gpt-5.2",
            pricingInput: 0,
            pricingOutput: 0,
            isFree: false,
            priority: 10,
          },
        ];
      }
      return [
        {
          providerId: 1,
          providerName: "test-provider",
          baseUrl: "https://example.com",
          apiKey: "test-key",
          providerModelId: model,
          pricingInput: 0,
          pricingOutput: 0,
          isFree: true,
          priority: 0,
        },
      ];
    });

    await generateAIDraft(
      buildMockInput({
        textModel: "gpt-5.2",
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockExecuteWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.2",
      }),
    );
  });

  it("accepts provider-qualified skill models without aborting generation", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockResolvedValueOnce({
      id: "parenting-article-writer",
      name: "Parenting Article Writer",
      category: "article_generation",
      systemPrompt: "You are a parenting article writer.",
      defaultModel: "openai/gpt-5.2",
      executionMode: "llm-only",
    });
    mockResolveProviders.mockImplementation(async (model: string) => {
      if (model === "gpt-5.2") {
        return [
          {
            providerId: 2,
            providerName: "opencode-zen",
            baseUrl: "https://example.com",
            apiKey: "test-key",
            providerModelId: "gpt-5.2",
            pricingInput: 0,
            pricingOutput: 0,
            isFree: false,
            priority: 10,
          },
        ];
      }
      return [
        {
          providerId: 1,
          providerName: "test-provider",
          baseUrl: "https://example.com",
          apiKey: "test-key",
          providerModelId: model,
          pricingInput: 0,
          pricingOutput: 0,
          isFree: true,
          priority: 0,
        },
      ];
    });

    await generateAIDraft(
      buildMockInput({ articleSkillId: "parenting-article-writer" }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const progressCalls = mockRedisSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"),
    );
    const lastProgress = JSON.parse(progressCalls[progressCalls.length - 1][1] as string);
    expect(lastProgress.error).toBeUndefined();
    expect(lastProgress.completed).toBe(true);
  });

  it("fails immediately when primary LLM call fails", async () => {
    setupHappyPath();
    mockExecuteWithFallback.mockResolvedValueOnce({
      type: "error",
      error: "LLM unavailable",
      statusCode: 503,
    });

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
    expect(callArgs.userMessage).toContain("Target slide count: 3");
    expect(callArgs.userMessage).toContain("Section One");
    expect(callArgs.userMessage).toContain("Section Two");
  });

  it("falls back to deterministic slide planning when article split LLM is unavailable", async () => {
    setupHappyPath();
    mockCallLLMStructured.mockRejectedValueOnce(new Error("fetch failed"));

    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    const progressCalls = mockRedisSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"),
    );
    const lastProgress = JSON.parse(progressCalls[progressCalls.length - 1][1] as string);
    expect(lastProgress.completed).toBe(true);
    expect(lastProgress.error).toBeUndefined();
    expect(lastProgress.result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Article split LLM failed (fetch failed); used deterministic fallback slide planning instead."),
      ]),
    );
    expect(mockAddSlideToDeck).toHaveBeenCalledTimes(3);
  });

  it("enforces article word_count limit before split when user specifies it", async () => {
    setupHappyPath();
    const longWordArticle = Array.from({ length: 260 }, (_, i) => `zzword${String(i).padStart(3, "0")}`).join(" ");
    mockExecuteWithFallback.mockResolvedValueOnce({
      type: "success",
      providerId: 1,
      providerName: "test-provider",
      response: {
        id: "resp1",
        created: Date.now(),
        model: "claude-sonnet-4-6",
        choices: [{ index: 0, message: { role: "assistant", content: longWordArticle }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 200 },
      },
    });

    await generateAIDraft(
      buildMockInput({
        articleSkillParams: {
          word_count: 120,
        },
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const callArgs = mockCallLLMStructured.mock.calls[0][0];
    expect(callArgs.userMessage).toContain("zzword000");
    expect(callArgs.userMessage).toContain("zzword119");
    expect(callArgs.userMessage).not.toContain("zzword180");
  });

  it("passes structured sections into layout input for multi-level typography", async () => {
    setupHappyPath();
    mockExecuteWithFallback.mockResolvedValueOnce({
      type: "success",
      providerId: 1,
      providerName: "test-provider",
      response: {
        id: "resp-th-article",
        created: Date.now(),
        model: "claude-sonnet-4-6",
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: [
              "หัวข้อ: การดูแลเด็กที่มีความเสี่ยงด้านพัฒนาการ",
              "1. บทนำ",
              "ภาพรวม สาระหลักของบทความ",
              "2. เด็กที่มีพัฒนาการล่าช้าหรือมีความเสี่ยง",
              "เด็กคลอดก่อนกำหนด ควรติดตามพัฒนาการอย่างใกล้ชิด ปัญหากล้ามเนื้อ ควรได้รับกายภาพบำบัด",
              "3. แนวทางช่วยเหลือ",
              "บำบัดตั้งแต่เนิ่น ๆ ลดผลกระทบระยะยาว",
            ].join("\n\n"),
          },
          finish_reason: "stop",
        }],
        usage: { prompt_tokens: 100, completion_tokens: 200 },
      },
    });
    mockCallLLMStructured.mockResolvedValueOnce({
      data: [
        {
          templateId: "hero_center",
          title: "บทนำ",
          body: ["ประเด็นสำคัญ"],
          sections: [{ heading: "ภาพรวม", details: ["สาระหลักของบทความ"] }],
          graphicCategory: "Business",
          imagePromptKeywords: "intro",
        },
        {
          templateId: "split_right_image",
          title: "เด็กที่มีพัฒนาการล่าช้าหรือมีความเสี่ยง",
          body: ["สำรอง"],
          sections: [
            { heading: "เด็กคลอดก่อนกำหนด", details: ["ควรติดตามพัฒนาการอย่างใกล้ชิด"] },
            { heading: "ปัญหากล้ามเนื้อ", details: ["ควรได้รับกายภาพบำบัด"] },
          ],
          graphicCategory: "Health",
          imagePromptKeywords: "medical child care",
        },
        {
          templateId: "feature_boxes_right",
          title: "แนวทางช่วยเหลือ",
          body: ["สำรอง"],
          sections: [{ heading: "บำบัดตั้งแต่เนิ่น ๆ", details: ["ลดผลกระทบระยะยาว"] }],
          graphicCategory: "Education",
          imagePromptKeywords: "therapy",
        },
      ],
      tokensUsed: 300,
      creditsUsed: 10,
    });

    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");
    const secondSlideCall = mockGenerateSlide.mock.calls[1]?.[0];
    expect(secondSlideCall).toBeDefined();
    expect(secondSlideCall.slideData.sections).toBeDefined();
    expect(secondSlideCall.slideData.sections[0].heading).toContain("เด็กที่มีพัฒนาการล่าช้าหรือมีความเสี่ยง");
    expect(secondSlideCall.slideData.body.some((line: string) => line.includes("เด็กคลอดก่อนกำหนด"))).toBe(true);
  });

  it("uses head+tail sampling for long article split input instead of hard 2000-word truncation", async () => {
    setupHappyPath();
    const beginning = "BEGIN_SECTION";
    const ending = "END_SECTION";
    const longArticle = `${beginning} ${Array.from({ length: 7000 }, (_, i) => `token${i}`).join(" ")} ${ending}`;
    mockExecuteWithFallback.mockResolvedValueOnce({
      type: "success",
      providerId: 1,
      providerName: "test-provider",
      response: {
        id: "resp1",
        created: Date.now(),
        model: "claude-sonnet-4-6",
        choices: [{ index: 0, message: { role: "assistant", content: longArticle }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 200 },
      },
    });

    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");
    const callArgs = mockCallLLMStructured.mock.calls[0]?.[0];
    expect(callArgs.userMessage).toContain("BEGIN_SECTION");
    expect(callArgs.userMessage).toContain("END_SECTION");
    expect(callArgs.userMessage).toContain("[...continued summary context...]");
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

  it("assigns video-spotlight component recipes to qualifying non-intro slides for video drafts", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "video-skill") {
        return {
          id: "video-skill",
          name: "Video Skill",
          type: "video-generation",
          systemPrompt: "Create a video prompt.",
          executionMode: "llm-only",
        };
      }
      return {
        id: "general-article-writer",
        name: "General Article Writer",
        systemPrompt: "You are a versatile article writer.",
        executionMode: "llm-only",
      };
    });
    mockGetModelsByTypeAsync.mockImplementation(async (type: string) => {
      if (type === "video") {
        return [
          {
            id: "veo-3-1",
            type: "video",
            name: "Veo 3.1",
            provider: "kie.ai",
            description: "Video generation",
            aliases: [],
            creditCost: 20,
            isEnabled: true,
            priority: 0,
            durations: [5],
            aspectRatios: ["16:9", "9:16"],
            configJson: { generateType: "text-to-video" },
          },
        ];
      }
      return [];
    });

    await generateAIDraft(
      buildMockInput({
        imageSkillId: "video-skill",
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const firstSlideCall = mockGenerateSlide.mock.calls[0]?.[0] as {
      slideData: { componentRecipeId?: string };
    };
    const secondSlideCall = mockGenerateSlide.mock.calls[1]?.[0] as {
      slideData: { componentRecipeId?: string };
    };
    expect(firstSlideCall.slideData.componentRecipeId).toBeUndefined();
    expect(secondSlideCall.slideData.componentRecipeId).toBe("video-spotlight");
  });

  it("assigns quote, process, and feature component recipes from structured content hints", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "prompt-planner") {
        return {
          id: "prompt-planner",
          name: "Prompt Planner",
          category: "prompt_enhancement",
          executionMode: "enhance-prompt",
          systemPrompt: "Plan slides from the prompt.",
        };
      }
      return {
        id: "general-article-writer",
        name: "General Article Writer",
        systemPrompt: "You are a versatile article writer.",
        executionMode: "llm-only",
      };
    });
    mockCallLLMStructured.mockResolvedValueOnce({
      data: [
        {
          templateId: "hero_center",
          title: "Deck Intro",
          body: ["Intro point"],
          notes: "Intro note",
          graphicCategory: "Business",
          imagePromptKeywords: "intro visual",
        },
        {
          templateId: "split_right_image",
          title: "\"Lead with clarity\"",
          body: ["A short editorial quote", "Supporting attribution"],
          notes: "Quoted insight",
          graphicCategory: "Communication",
          imagePromptKeywords: "quote visual",
        },
        {
          templateId: "split_left_image",
          title: "How to launch the workflow",
          body: ["1. Gather the brief", "2. Structure the story", "3. Ship the deck"],
          notes: "Step-by-step guidance",
          graphicCategory: "Business",
          imagePromptKeywords: "workflow visual",
        },
        {
          templateId: "feature_boxes_right",
          title: "Platform highlights",
          body: ["Fast setup", "Shared collaboration", "Reusable components", "Export-ready output"],
          notes: "Key features",
          graphicCategory: "Technology",
          imagePromptKeywords: "feature visual",
        },
      ],
      tokensUsed: 300,
      creditsUsed: 10,
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 4,
        draftSkillId: "prompt-planner",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const secondSlideCall = mockGenerateSlide.mock.calls[1]?.[0] as {
      slideData: { componentRecipeId?: string };
    };
    const thirdSlideCall = mockGenerateSlide.mock.calls[2]?.[0] as {
      slideData: { componentRecipeId?: string };
    };
    const fourthSlideCall = mockGenerateSlide.mock.calls[3]?.[0] as {
      slideData: { componentRecipeId?: string };
    };
    expect(secondSlideCall.slideData.componentRecipeId).toBe("quote-callout");
    expect(thirdSlideCall.slideData.componentRecipeId).toBe("process-steps");
    expect(fourthSlideCall.slideData.componentRecipeId).toBe("feature-highlights");
  });

  it("uses markdown hierarchy and contact signals when selecting component recipes", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "prompt-planner") {
        return {
          id: "prompt-planner",
          name: "Prompt Planner",
          category: "prompt_enhancement",
          executionMode: "enhance-prompt",
          systemPrompt: "Plan slides from the prompt.",
        };
      }
      return {
        id: "general-article-writer",
        name: "General Article Writer",
        systemPrompt: "You are a versatile article writer.",
        executionMode: "llm-only",
      };
    });
    mockCallLLMStructured.mockResolvedValueOnce({
      data: [
        {
          templateId: "hero_center",
          title: "Intro",
          body: ["Intro point"],
          notes: "Intro note",
          graphicCategory: "Business",
          imagePromptKeywords: "intro visual",
        },
        {
          templateId: "split_left_image",
          title: "ทีมที่ดูแลโปรเจกต์",
          body: ["Reach the team directly"],
          notes: "Contact the team",
          sections: [
            { heading: "Contact", details: ["hello@example.com", "+66 123 456 789", "www.example.com"] },
          ],
          graphicCategory: "Communication",
          imagePromptKeywords: "team profile visual",
        },
        {
          templateId: "split_right_image",
          title: "Implementation path",
          body: ["Condensed view"],
          notes: "Structured path",
          markdownHierarchy: [
            { level: "h2", text: "Step 1" },
            { level: "body", text: "Gather the brief" },
            { level: "h2", text: "Step 2" },
            { level: "body", text: "Draft the message" },
            { level: "h2", text: "Step 3" },
            { level: "body", text: "Ship the deck" },
          ],
          graphicCategory: "Technology",
          imagePromptKeywords: "implementation process",
        },
      ],
      tokensUsed: 220,
      creditsUsed: 8,
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 3,
        draftSkillId: "prompt-planner",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const secondSlideCall = mockGenerateSlide.mock.calls[1]?.[0] as {
      slideData: { componentRecipeId?: string };
    };
    const thirdSlideCall = mockGenerateSlide.mock.calls[2]?.[0] as {
      slideData: { componentRecipeId?: string };
    };
    expect(secondSlideCall.slideData.componentRecipeId).toBe("profile-summary");
    expect(thirdSlideCall.slideData.componentRecipeId).toBe("process-steps");
  });

  it("assigns poster and framed-image component recipes from promotional and story signals", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "prompt-planner") {
        return {
          id: "prompt-planner",
          name: "Prompt Planner",
          category: "prompt_enhancement",
          executionMode: "enhance-prompt",
          systemPrompt: "Plan slides from the prompt.",
        };
      }
      return {
        id: "general-article-writer",
        name: "General Article Writer",
        systemPrompt: "You are a versatile article writer.",
        executionMode: "llm-only",
      };
    });
    mockCallLLMStructured.mockResolvedValueOnce({
      data: [
        {
          templateId: "hero_center",
          title: "Intro",
          body: ["Intro point"],
          notes: "Intro note",
          graphicCategory: "Business",
          imagePromptKeywords: "intro visual",
        },
        {
          templateId: "split_right_image",
          title: "Membership launch offer",
          body: ["Priority support", "Premium access", "Join today"],
          notes: "Campaign launch with a clear CTA and short promotional benefits.",
          sections: [
            { heading: "Launch Week", details: ["Priority support", "Premium access", "Join today"] },
          ],
          graphicCategory: "Business",
          imagePromptKeywords: "campaign poster",
        },
        {
          templateId: "split_left_image",
          title: "Campus zero-waste story",
          body: ["A short editorial overview", "Key moments from the rollout"],
          notes: "This story follows how one campus turned policy changes into visible recycling habits across classrooms and shared spaces.",
          sections: [
            { heading: "Editorial Story", details: ["Student-led initiative", "Visible before-and-after changes"] },
          ],
          graphicCategory: "Nature",
          imagePromptKeywords: "editorial sustainability story",
        },
      ],
      tokensUsed: 250,
      creditsUsed: 8,
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 3,
        draftSkillId: "prompt-planner",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const secondSlideCall = mockGenerateSlide.mock.calls[1]?.[0] as {
      slideData: { componentRecipeId?: string };
    };
    const thirdSlideCall = mockGenerateSlide.mock.calls[2]?.[0] as {
      slideData: { componentRecipeId?: string };
    };
    expect(secondSlideCall.slideData.componentRecipeId).toBe("poster-spotlight");
    expect(thirdSlideCall.slideData.componentRecipeId).toBe("framed-image-story");
  });

  it("assigns stat-cards from metric-heavy slides", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "prompt-planner") {
        return {
          id: "prompt-planner",
          name: "Prompt Planner",
          category: "prompt_enhancement",
          executionMode: "enhance-prompt",
          systemPrompt: "Plan slides from the prompt.",
        };
      }
      return {
        id: "general-article-writer",
        name: "General Article Writer",
        systemPrompt: "You are a versatile article writer.",
        executionMode: "llm-only",
      };
    });
    mockCallLLMStructured.mockResolvedValueOnce({
      data: [
        {
          templateId: "hero_center",
          title: "Intro",
          body: ["Intro point"],
          notes: "Intro note",
          graphicCategory: "Business",
          imagePromptKeywords: "intro visual",
        },
        {
          templateId: "split_right_image",
          title: "Q1 KPI Snapshot",
          body: ["42%: Conversion lift", "12d: Time to first win", "3.1x: Return on spend"],
          notes: "Performance summary for the quarter.",
          graphicCategory: "Business",
          imagePromptKeywords: "dashboard metrics",
        },
      ],
      tokensUsed: 180,
      creditsUsed: 6,
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 2,
        draftSkillId: "prompt-planner",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const secondSlideCall = mockGenerateSlide.mock.calls[1]?.[0] as {
      slideData: { componentRecipeId?: string };
    };
    expect(secondSlideCall.slideData.componentRecipeId).toBe("stat-cards");
  });

  it("assigns timeline-flow from roadmap-style slides", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "prompt-planner") {
        return {
          id: "prompt-planner",
          name: "Prompt Planner",
          category: "prompt_enhancement",
          executionMode: "enhance-prompt",
          systemPrompt: "Plan slides from the prompt.",
        };
      }
      return {
        id: "general-article-writer",
        name: "General Article Writer",
        systemPrompt: "You are a versatile article writer.",
        executionMode: "llm-only",
      };
    });
    mockCallLLMStructured.mockResolvedValueOnce({
      data: [
        {
          templateId: "hero_center",
          title: "Intro",
          body: ["Intro point"],
          notes: "Intro note",
          graphicCategory: "Business",
          imagePromptKeywords: "intro visual",
        },
        {
          templateId: "feature_boxes_right",
          title: "Product roadmap timeline",
          body: ["Q1 Pilot launch", "Q2 Department rollout", "Q3 Full adoption"],
          sections: [
            { heading: "Q1", details: ["Pilot launch", "Jan 2026"] },
            { heading: "Q2", details: ["Department rollout", "Apr 2026"] },
            { heading: "Q3", details: ["Full adoption", "Aug 2026"] },
          ],
          notes: "Track milestones across three launch phases.",
          graphicCategory: "Business",
          imagePromptKeywords: "roadmap timeline visual",
        },
      ],
      tokensUsed: 180,
      creditsUsed: 6,
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 2,
        draftSkillId: "prompt-planner",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const secondSlideCall = mockGenerateSlide.mock.calls[1]?.[0] as {
      slideData: { componentRecipeId?: string };
    };
    expect(secondSlideCall.slideData.componentRecipeId).toBe("timeline-flow");
  });

  it("assigns infographic-grid from framework slides with four balanced sections without requiring legacy template hints", () => {
    const assignment = assignAIComponentRecipes([
      {
        templateId: "hero_center",
        title: "Intro",
        body: ["Intro point"],
        notes: "Intro note",
        graphicCategory: "Business",
        imagePromptKeywords: "intro visual",
      },
      {
        templateId: "split_right_image",
        title: "The zero waste framework infographic",
        body: [
          "Avoid unnecessary inputs",
          "Reuse materials longer",
          "Recycle valuable waste",
          "Measure impact weekly",
        ],
        sections: [
          { heading: "Avoid", details: ["Reduce unnecessary inputs"] },
          { heading: "Reuse", details: ["Extend the life of materials"] },
          { heading: "Recycle", details: ["Recover value from waste"] },
          { heading: "Measure", details: ["Track impact and iterate"] },
        ],
        notes: "Framework infographic overview with four balanced categories and short supporting lines.",
        graphicCategory: "Education",
        imagePromptKeywords: "framework infographic board",
      },
    ], {
      preferVideoRecipes: false,
      canvasWidth: 1280,
      canvasHeight: 720,
    });

    expect(assignment.selections[1]?.componentRecipeId).toBe("infographic-grid");
  });

  it("assigns landscape-photo-story from editorial gallery slides on default 16:9 canvases", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "prompt-planner") {
        return {
          id: "prompt-planner",
          name: "Prompt Planner",
          category: "prompt_enhancement",
          executionMode: "enhance-prompt",
          systemPrompt: "Plan slides from the prompt.",
        };
      }
      return {
        id: "general-article-writer",
        name: "General Article Writer",
        systemPrompt: "You are a versatile article writer.",
        executionMode: "llm-only",
      };
    });
    mockCallLLMStructured.mockResolvedValueOnce({
      data: [
        {
          templateId: "hero_center",
          title: "Intro",
          body: ["Intro point"],
          notes: "Intro note",
          graphicCategory: "Lifestyle",
          imagePromptKeywords: "intro visual",
        },
        {
          templateId: "split_left_image",
          title: "Launch lookbook collage",
          body: ["Gallery scenes from the launch", "Moodboard for the campaign atmosphere"],
          notes: "Photo collage gallery lookbook for the campaign launch.",
          graphicCategory: "Lifestyle",
          imagePromptKeywords: "editorial photo collage",
        },
      ],
      tokensUsed: 180,
      creditsUsed: 6,
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 2,
        draftSkillId: "prompt-planner",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const secondSlideCall = mockGenerateSlide.mock.calls[1]?.[0] as {
      slideData: { componentRecipeId?: string };
    };
    expect(secondSlideCall.slideData.componentRecipeId).toBe("landscape-photo-story");
  });

  it("uses first-pass media slot counts to route portrait photo boards into a4-photo-grid", async () => {
    setupHappyPath();
    mockCallLLMStructured.mockResolvedValueOnce({
      data: [
        {
          templateId: "hero_center",
          title: "Intro",
          body: ["Intro point"],
          notes: "Intro note",
          graphicCategory: "Lifestyle",
          imagePromptKeywords: "intro visual",
        },
        {
          templateId: "split_left_image",
          title: "Family meal lookbook",
          body: ["A visual recap of family mealtime scenes", "Multiple supporting frames show details and atmosphere"],
          notes: "Gallery collage moodboard for a family meal feature.",
          mediaPlan: [
            { slotId: "hero-photo", prompt: "Hero family meal scene" },
            { slotId: "detail-photo-1", prompt: "Supporting table detail" },
            { slotId: "detail-photo-2", prompt: "Supporting caregiver moment" },
            { slotId: "detail-photo-3", prompt: "Supporting ingredient close-up" },
            { slotId: "detail-photo-4", prompt: "Supporting atmosphere frame" },
          ],
          graphicCategory: "Lifestyle",
          imagePromptKeywords: "editorial family lookbook collage",
        },
      ],
      tokensUsed: 180,
      creditsUsed: 6,
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 2,
        articleSkillId: undefined,
        draftSkillId: "prompt-planner",
        canvasWidth: 720,
        canvasHeight: 1280,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const secondSlideCall = mockGenerateSlide.mock.calls[1]?.[0] as {
      slideData: { componentRecipeId?: string };
    };
    expect(secondSlideCall.slideData.componentRecipeId).toBe("a4-photo-grid");
  });

  it("diversifies repeated portrait long-form slides instead of reusing one recipe from slide 2 onward", () => {
    const result = assignAIComponentRecipes(
      [
        {
          templateId: "hero_center",
          title: "Guide one",
          body: ["A practical caregiver guide", "Each section captures a focused recommendation"],
          sections: [
            { heading: "What to watch", details: ["Notice behavior changes and keep a simple log"] },
            { heading: "What to do", details: ["Adjust one habit at a time and review the results"] },
          ],
          notes: "Detailed long-form guidance for caregivers with two balanced sections and enough supporting detail to justify an editorial layout.",
          graphicCategory: "Health",
          imagePromptKeywords: "caregiver guidance",
        },
        {
          templateId: "split_left_image",
          title: "Guide two",
          body: ["A practical caregiver guide", "Each section captures a focused recommendation"],
          sections: [
            { heading: "When to pause", details: ["Pause the routine when a warning sign appears and track the change"] },
            { heading: "When to continue", details: ["Resume only after the child settles and symptoms ease for a while"] },
          ],
          notes: "Detailed long-form guidance for caregivers with two balanced sections and enough supporting detail to justify an editorial layout.",
          graphicCategory: "Health",
          imagePromptKeywords: "caregiver guidance",
        },
        {
          templateId: "split_left_image",
          title: "Guide three",
          body: ["A practical caregiver guide", "Each section captures a focused recommendation"],
          sections: [
            { heading: "How to explain it", details: ["Use simple language and one clear action at a time for the family"] },
            { heading: "How to follow up", details: ["Track the response and revisit the plan later with the caregiver"] },
          ],
          notes: "Detailed long-form guidance for caregivers with two balanced sections and enough supporting detail to justify an editorial layout.",
          graphicCategory: "Health",
          imagePromptKeywords: "caregiver guidance",
        },
        {
          templateId: "split_left_image",
          title: "Guide four",
          body: ["A practical caregiver guide", "Each section captures a focused recommendation"],
          sections: [
            { heading: "Home setup", details: ["Create a calm environment and remove obvious triggers in advance"] },
            { heading: "Care routine", details: ["Keep the routine short, repeatable, and easy to explain each day"] },
          ],
          notes: "Detailed long-form guidance for caregivers with two balanced sections and enough supporting detail to justify an editorial layout.",
          graphicCategory: "Health",
          imagePromptKeywords: "caregiver guidance",
        },
      ],
      {
        preferVideoRecipes: false,
        canvasWidth: 720,
        canvasHeight: 1280,
      },
    );

    const repeatedSlideRecipes = result.selections
      .map((selection) => selection.componentRecipeId)
      .filter((recipeId): recipeId is string => Boolean(recipeId));

    expect(new Set(repeatedSlideRecipes).size).toBeGreaterThan(1);
  });

  it("generates distinct media variants for photo-collage slides and binds both image slots", async () => {
    setupHappyPath();
    mockCallLLMStructured.mockResolvedValueOnce({
      data: [
        {
          templateId: "hero_center",
          title: "Intro",
          body: ["Intro point"],
          notes: "Intro note",
          graphicCategory: "Lifestyle",
          imagePromptKeywords: "intro visual",
        },
        {
          templateId: "split_left_image",
          componentRecipeId: "photo-collage",
          title: "Launch lookbook collage",
          body: ["Gallery scenes from the launch", "Moodboard for the campaign atmosphere"],
          notes: "Photo collage gallery lookbook for the campaign launch.",
          graphicCategory: "Lifestyle",
          imagePromptKeywords: "editorial photo collage",
        },
      ],
      tokensUsed: 180,
      creditsUsed: 6,
    });
    mockGenerateImageAsync.mockImplementation(async ({ prompt }: { prompt: string }) => ({
      id: prompt.includes("Secondary frame focus") ? "task-collage-secondary" : "task-collage-primary",
      status: "processing",
    }));
    mockGetTask.mockImplementation(async (taskId: string) => ({
      status: "completed",
      resultUrl: taskId === "task-collage-secondary"
        ? "https://cdn.example.com/collage-secondary.jpg"
        : "https://cdn.example.com/collage-primary.jpg",
      taskId,
      resultData: {},
      output: [],
    }));
    mockGenerateSlide.mockImplementation(({ slideData, imageUrl, imageUrls }: {
      slideData: { componentRecipeId?: string };
      imageUrl?: string | null;
      imageUrls?: Array<string | null>;
    }) => {
      if (slideData.componentRecipeId === "photo-collage") {
        return {
          slideContent: {
            elements: [],
            components: [
              {
                id: "cmp-collage",
                componentId: "photo-collage",
                componentType: "built-in",
                definitionRevision: 1,
                slotBindings: [
                  { slotId: "primary-photo", type: "image", src: imageUrls?.[0] || imageUrl || "", alt: "Primary photo" },
                  { slotId: "secondary-photo", type: "image", src: imageUrls?.[1] || imageUrl || "", alt: "Secondary photo" },
                ],
                fallbackElements: [
                  {
                    id: "cmp-collage::primary-photo-image",
                    type: "image",
                    x: 80,
                    y: 120,
                    width: 460,
                    height: 340,
                    src: imageUrls?.[0] || imageUrl || "",
                    alt: "Primary photo",
                  },
                  {
                    id: "cmp-collage::secondary-photo-image",
                    type: "image",
                    x: 760,
                    y: 148,
                    width: 240,
                    height: 180,
                    src: imageUrls?.[1] || imageUrl || "",
                    alt: "Secondary photo",
                  },
                ],
              },
            ],
          },
          warnings: [],
        };
      }
      return {
        slideContent: MOCK_SLIDE_CONTENT,
        warnings: [],
      };
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 2,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockGenerateImageAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Primary frame focus"),
      }),
      "test-token",
    );
    expect(mockGenerateImageAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Secondary frame focus"),
      }),
      "test-token",
    );

    const secondInsertPayload = mockAddSlideToDeck.mock.calls[1]?.[0] as {
      slideContent?: {
        components?: Array<{
          slotBindings?: Array<Record<string, unknown>>;
          fallbackElements?: Array<Record<string, unknown>>;
        }>;
        pendingMediaJobs?: Array<Record<string, unknown>>;
      };
    } | undefined;
    const slideContent = secondInsertPayload?.slideContent;
    expect(slideContent?.pendingMediaJobs).toBeUndefined();

    const slotBindings = slideContent?.components?.[0]?.slotBindings ?? [];
    expect(slotBindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slotId: "primary-photo",
        type: "image",
        src: "https://cdn.example.com/collage-primary.jpg",
      }),
      expect.objectContaining({
        slotId: "secondary-photo",
        type: "image",
        src: "https://cdn.example.com/collage-secondary.jpg",
      }),
    ]));
  });

  it("prefers explicit mediaPlan prompts from the slide planner for multi-slot recipes", async () => {
    setupHappyPath();
    mockCallLLMStructured.mockResolvedValueOnce({
      data: [
        {
          templateId: "hero_center",
          title: "Intro",
          body: ["Intro point"],
          notes: "Intro note",
          graphicCategory: "Lifestyle",
          imagePromptKeywords: "intro visual",
        },
        {
          templateId: "split_left_image",
          componentRecipeId: "photo-collage",
          mediaPlan: [
            { slotId: "primary-photo", prompt: "Primary hero shot with the launch audience" },
            { slotId: "secondary-photo", prompt: "Secondary detail crop of branded accessories" },
          ],
          title: "Launch lookbook collage",
          body: ["Gallery scenes from the launch", "Moodboard for the campaign atmosphere"],
          notes: "Photo collage gallery lookbook for the campaign launch.",
          graphicCategory: "Lifestyle",
          imagePromptKeywords: "editorial photo collage",
        },
      ],
      tokensUsed: 180,
      creditsUsed: 6,
    });
    mockGenerateImageAsync.mockResolvedValue({ id: "task-slot-plan", status: "processing" });
    mockGetTask.mockResolvedValue({
      status: "completed",
      resultUrl: "https://cdn.example.com/collage-slot-plan.jpg",
      taskId: "task-slot-plan",
      resultData: {},
      output: [],
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 2,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockGenerateImageAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Primary hero shot with the launch audience",
      }),
      "test-token",
    );
    expect(mockGenerateImageAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Secondary detail crop of branded accessories",
      }),
      "test-token",
    );

    const secondInsertPayload = mockAddSlideToDeck.mock.calls[1]?.[0] as {
      slideContent?: {
        aiDesign?: {
          narrative?: {
            mediaPlan?: Array<{ slotId: string; prompt: string }>;
          };
        };
      };
    } | undefined;
    expect(secondInsertPayload?.slideContent?.aiDesign?.narrative?.mediaPlan).toEqual([
      { slotId: "primary-photo", prompt: "Primary hero shot with the launch audience" },
      { slotId: "secondary-photo", prompt: "Secondary detail crop of branded accessories" },
    ]);
  });

  it("preserves slot-aware mediaPlan prompts for single-slot media recipes", async () => {
    setupHappyPath();
    mockCallLLMStructured.mockResolvedValueOnce({
      data: [
        {
          templateId: "hero_center",
          title: "Intro",
          body: ["Intro point"],
          notes: "Intro note",
          graphicCategory: "Business",
          imagePromptKeywords: "intro visual",
        },
        {
          templateId: "split_right_image",
          componentRecipeId: "poster-spotlight",
          mediaPlan: [
            { slotId: "hero", prompt: "Primary campaign hero visual with a confident spokesperson" },
          ],
          title: "Membership launch offer",
          body: ["Priority support", "Premium access", "Join today"],
          notes: "Campaign launch with a clear CTA and short promotional benefits.",
          graphicCategory: "Business",
          imagePromptKeywords: "campaign poster",
        },
      ],
      tokensUsed: 180,
      creditsUsed: 6,
    });
    mockGenerateImageAsync.mockResolvedValue({ id: "task-poster-slot-plan", taskId: "provider-poster-slot-plan", status: "processing" });
    mockGetTask.mockResolvedValue({
      status: "completed",
      resultUrl: "https://cdn.example.com/poster-slot-plan.jpg",
      taskId: "provider-poster-slot-plan",
      resultData: {},
      output: [],
    });
    mockGenerateSlide.mockImplementation(({ slideData, imageUrl }: {
      slideData: { componentRecipeId?: string };
      imageUrl?: string | null;
    }) => {
      if (slideData.componentRecipeId === "poster-spotlight") {
        return {
          slideContent: {
            elements: [],
            components: [
              {
                id: "cmp-poster",
                componentId: "poster-spotlight",
                componentType: "built-in",
                definitionRevision: 1,
                slotBindings: [
                  { slotId: "headline", type: "text", text: "Membership launch offer" },
                  { slotId: "hero", type: "image", src: imageUrl || "", alt: "Hero visual" },
                ],
                fallbackElements: [
                  {
                    id: "cmp-poster::hero-frame",
                    type: "rect",
                    x: 760,
                    y: 96,
                    width: 396,
                    height: 520,
                    fill: "#dbeafe",
                  },
                ],
              },
            ],
          },
          warnings: [],
        };
      }
      return {
        slideContent: MOCK_SLIDE_CONTENT,
        warnings: [],
      };
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 2,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockGenerateImageAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Primary campaign hero visual with a confident spokesperson",
      }),
      "test-token",
    );

    const secondInsertPayload = mockAddSlideToDeck.mock.calls[1]?.[0] as {
      slideContent?: {
        components?: Array<{
          slotBindings?: Array<{ slotId: string; src?: string }>;
        }>;
        aiDesign?: {
          narrative?: {
            mediaPlan?: Array<{ slotId: string; prompt: string }>;
          };
        };
      };
    } | undefined;

    expect(secondInsertPayload?.slideContent?.components?.[0]?.slotBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotId: "hero",
          src: "https://cdn.example.com/poster-slot-plan.jpg",
        }),
      ]),
    );
    expect(secondInsertPayload?.slideContent?.aiDesign?.narrative?.mediaPlan).toEqual([
      { slotId: "hero", prompt: "Primary campaign hero visual with a confident spokesperson" },
    ]);
  });

  it("stores AI recipe telemetry on compiled slide content for both hero and component slides", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "prompt-planner") {
        return {
          id: "prompt-planner",
          name: "Prompt Planner",
          category: "prompt_enhancement",
          executionMode: "enhance-prompt",
          systemPrompt: "Plan slides from the prompt.",
        };
      }
      return {
        id: "general-article-writer",
        name: "General Article Writer",
        systemPrompt: "You are a versatile article writer.",
        executionMode: "llm-only",
      };
    });
    mockCallLLMStructured.mockResolvedValueOnce({
      data: [
        {
          templateId: "hero_center",
          title: "Intro",
          body: ["Intro point"],
          notes: "Intro note",
          graphicCategory: "Business",
          imagePromptKeywords: "intro visual",
        },
        {
          templateId: "split_right_image",
          title: "Membership launch offer",
          body: ["Priority support", "Premium access", "Join today"],
          notes: "Campaign launch with a clear CTA and short promotional benefits.",
          graphicCategory: "Business",
          imagePromptKeywords: "campaign poster",
        },
      ],
      tokensUsed: 180,
      creditsUsed: 6,
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 2,
        draftSkillId: "prompt-planner",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const firstInsertPayload = mockAddSlideToDeck.mock.calls[0]?.[0] as {
      slideContent?: { aiDesign?: Record<string, unknown> };
    };
    const secondInsertPayload = mockAddSlideToDeck.mock.calls[1]?.[0] as {
      slideContent?: { aiDesign?: Record<string, unknown> };
    };

    expect(firstInsertPayload.slideContent?.aiDesign).toMatchObject({
      source: "draft-with-ai",
      taskId: "task-123",
      mode: "structured_block",
      selectionMode: "none",
    });
    expect(secondInsertPayload.slideContent?.aiDesign).toMatchObject({
      source: "draft-with-ai",
      taskId: "task-123",
      mode: "structured_block",
      componentRecipeId: "poster-spotlight",
      selectionMode: "heuristic",
    });
    expect(Array.isArray(secondInsertPayload.slideContent?.aiDesign?.candidateModes)).toBe(true);
    expect(Array.isArray(secondInsertPayload.slideContent?.aiDesign?.candidateRecipes)).toBe(true);
    expect(secondInsertPayload.slideContent?.aiDesign?.narrative).toMatchObject({
      title: "Membership launch offer",
      templateId: "split_right_image",
    });
  });

  it("routes dense section-heavy slides into the sectioned-explainer long-form recipe", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "prompt-planner") {
        return {
          id: "prompt-planner",
          name: "Prompt Planner",
          category: "prompt_enhancement",
          executionMode: "enhance-prompt",
          systemPrompt: "Plan slides from the prompt.",
        };
      }
      return {
        id: "general-article-writer",
        name: "General Article Writer",
        systemPrompt: "You are a versatile article writer.",
        executionMode: "llm-only",
      };
    });
    mockCallLLMStructured.mockResolvedValue({
      data: [
        {
          templateId: "hero_center",
          title: "คู่มือการนอนของเด็กเล็ก",
          body: ["ภาพรวมสั้น ๆ"],
          notes: "สไลด์เปิดหัวเรื่อง",
          graphicCategory: "Education",
          imagePromptKeywords: "sleeping child illustration",
        },
        {
          templateId: "split_right_image",
          title: "ขั้นตอนปฏิบัติ / เคล็ดลับ",
          body: [
            "สร้างกิจวัตรก่อนนอน: ทำให้กิจกรรมตอนก่อนนอนมีความซ้ำซ้อน เช่น อ่านหนังสือ เล่าเรื่อง หรืออาบน้ำ เพื่อสร้างความรู้สึกผ่อนคลายให้กับลูก",
            "กำหนดเวลาเข้านอน: ตั้งเวลาเข้านอนที่สม่ำเสมอทุกวัน เพื่อช่วยให้ร่างกายสร้างนิสัยในการนอน",
            "สร้างสภาพแวดล้อมที่เอื้อต่อการนอน: ห้องนอนควรเงียบ สบาย และมีอุณหภูมิที่เหมาะสม",
            "ใช้เสียงเพลงหรือเสียงธรรมชาติ: เสียงที่อ่อนโยนสามารถช่วยให้เด็กผ่อนคลายและนอนหลับได้ดีขึ้นเมื่อใช้ร่วมกับกิจวัตรที่คงที่",
          ],
          notes: "บทความนี้เหมาะสำหรับพ่อแม่และผู้ดูแลที่ต้องการคำอธิบายยาวและค่อยเป็นค่อยไปมากกว่าการ์ดสั้น รวมถึงต้องการเห็นบริบท ข้อผิดพลาดที่พบบ่อย และคำแนะนำเชิงปฏิบัติอยู่ในหน้าเดียวแบบยังแก้ไขข้อความต่อได้",
          markdownHierarchy: [
            { level: "h2", text: "กิจวัตรก่อนนอน" },
            { level: "body", text: "ทำกิจกรรมเดิมในเวลาใกล้เคียงกันเพื่อสร้างสัญญาณก่อนนอน" },
            { level: "h2", text: "ความผิดพลาดที่พบบ่อย" },
            { level: "body", text: "อย่าตอบสนองทันทีทุกครั้งโดยไม่มีแผน เพราะเด็กจะยังไม่ได้ฝึกกลับไปนอนเอง" },
          ],
          sections: [
            {
              heading: "ความผิดพลาดที่พบบ่อย",
              details: [
                "ให้นอนในที่นอนที่ไม่ปลอดภัย: ควรจัดสภาพแวดล้อมให้นอนอย่างปลอดภัย",
                "นอนดึกและตื่นไม่เป็นเวลา: ควรรักษาเวลาเข้านอนและตื่นนอนให้ใกล้เคียงกันทุกวัน",
              ],
            },
            {
              heading: "ใครควรอ่านสไลด์นี้",
              details: [
                "พ่อแม่หรือผู้ดูแลเด็กเล็กที่กำลังฝึกนิสัยการนอนของลูก",
              ],
            },
            {
              heading: "สิ่งที่ควรทำต่อ",
              details: [
                "เลือกเพียงหนึ่งถึงสองแนวทางแล้วทำซ้ำอย่างสม่ำเสมอเพื่อให้เด็กไม่สับสนกับสัญญาณก่อนนอน",
              ],
            },
          ],
          graphicCategory: "Education",
          imagePromptKeywords: "bedtime routine parent child",
        },
      ],
      tokensUsed: 220,
      creditsUsed: 8,
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 2,
        draftSkillId: "prompt-planner",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const secondInsertPayload = mockAddSlideToDeck.mock.calls[1]?.[0] as {
      slideContent?: {
        aiDesign?: Record<string, unknown> & {
          componentRecipeId?: string;
          candidateModes?: Array<Record<string, unknown>>;
        };
      };
    };

    expect(secondInsertPayload.slideContent?.aiDesign).toMatchObject({
      source: "draft-with-ai",
      taskId: "task-123",
      mode: "long_form_block",
      componentRecipeId: "sectioned-explainer",
      selectionMode: "heuristic",
    });
    expect(secondInsertPayload.slideContent?.aiDesign?.candidateModes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        mode: "long_form_block",
      }),
    ]));
  });

  it("applies recipe-aware compaction for long-form component slides and persists fit metadata", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (skillId: string) => {
      if (skillId === "prompt-planner") {
        return {
          id: "prompt-planner",
          name: "Prompt Planner",
          category: "prompt_enhancement",
          executionMode: "enhance-prompt",
          systemPrompt: "Plan slides from the prompt.",
        };
      }
      return {
        id: "general-article-writer",
        name: "General Article Writer",
        systemPrompt: "You are a versatile article writer.",
        executionMode: "llm-only",
      };
    });
    mockCallLLMStructured
      .mockResolvedValueOnce({
        data: [
          {
            templateId: "hero_center",
            title: "คู่มือการนอนของเด็กเล็ก",
            body: ["ภาพรวมสั้น ๆ"],
            notes: "สไลด์เปิดหัวเรื่อง",
            graphicCategory: "Education",
            imagePromptKeywords: "sleeping child illustration",
          },
          {
            templateId: "split_right_image",
            title: "ขั้นตอนปฏิบัติ / เคล็ดลับ",
            body: [
              "สร้างกิจวัตรก่อนนอน: ทำให้กิจกรรมตอนก่อนนอนมีความซ้ำซ้อน เช่น อ่านหนังสือ เล่าเรื่อง หรืออาบน้ำ เพื่อสร้างความรู้สึกผ่อนคลายให้กับลูก",
              "กำหนดเวลาเข้านอน: ตั้งเวลาเข้านอนที่สม่ำเสมอทุกวัน เพื่อช่วยให้ร่างกายสร้างนิสัยในการนอน",
              "สร้างสภาพแวดล้อมที่เอื้อต่อการนอน: ห้องนอนควรเงียบ สบาย และมีอุณหภูมิที่เหมาะสม",
              "ใช้เสียงเพลงหรือเสียงธรรมชาติ: เสียงที่อ่อนโยนสามารถช่วยให้เด็กผ่อนคลายและนอนหลับได้ดีขึ้นเมื่อใช้ร่วมกับกิจวัตรที่คงที่",
            ],
            notes: "บทความนี้เหมาะสำหรับพ่อแม่และผู้ดูแลที่ต้องการคำอธิบายยาวและค่อยเป็นค่อยไปมากกว่าการ์ดสั้น รวมถึงต้องการเห็นบริบท ข้อผิดพลาดที่พบบ่อย และคำแนะนำเชิงปฏิบัติอยู่ในหน้าเดียวแบบยังแก้ไขข้อความต่อได้",
            sections: [
              {
                heading: "ความผิดพลาดที่พบบ่อย",
                details: [
                  "ให้นอนในที่นอนที่ไม่ปลอดภัย: ควรจัดสภาพแวดล้อมให้นอนอย่างปลอดภัย",
                  "นอนดึกและตื่นไม่เป็นเวลา: ควรรักษาเวลาเข้านอนและตื่นนอนให้ใกล้เคียงกันทุกวัน",
                ],
              },
              {
                heading: "ใครควรอ่านสไลด์นี้",
                details: [
                  "พ่อแม่หรือผู้ดูแลเด็กเล็กที่กำลังฝึกนิสัยการนอนของลูก",
                ],
              },
              {
                heading: "สิ่งที่ควรทำต่อ",
                details: [
                  "เลือกเพียงหนึ่งถึงสองแนวทางแล้วทำซ้ำอย่างสม่ำเสมอเพื่อให้เด็กไม่สับสนกับสัญญาณก่อนนอน",
                ],
              },
            ],
            graphicCategory: "Education",
            imagePromptKeywords: "bedtime routine parent child",
          },
        ],
        tokensUsed: 220,
        creditsUsed: 8,
      })
      .mockResolvedValueOnce({
        data: {
          status: "ok",
          slotContent: [
            { slotId: "eyebrow", type: "text", text: "Sleep guide" },
            { slotId: "title", type: "text", text: "ขั้นตอนปฏิบัติ / เคล็ดลับ" },
            { slotId: "intro", type: "text", text: "เริ่มจากกิจวัตรเดิมทุกคืน รักษาเวลาเข้านอนให้คงที่ และจัดห้องนอนให้สงบเพื่อช่วยให้เด็กผ่อนคลายก่อนนอน" },
            { slotId: "section1-heading", type: "text", text: "ความผิดพลาดที่พบบ่อย" },
            { slotId: "section1-body", type: "text", text: "หลีกเลี่ยงการเปลี่ยนเวลานอนทุกวันและอย่าตอบสนองทันทีทุกครั้งโดยไม่มีแผน" },
            { slotId: "section2-heading", type: "text", text: "ใครควรอ่าน" },
            { slotId: "section2-body", type: "text", text: "เหมาะกับพ่อแม่หรือผู้ดูแลเด็กเล็กที่กำลังฝึกนิสัยการนอนของลูก" },
            { slotId: "section3-heading", type: "text", text: "สิ่งที่ควรทำต่อ" },
            { slotId: "section3-body", type: "text", text: "เลือกเพียงหนึ่งถึงสองแนวทางแล้วทำซ้ำอย่างต่อเนื่องเพื่อให้เด็กไม่สับสน" },
            { slotId: "takeaways-title", type: "text", text: "Key Takeaways" },
            { slotId: "takeaways", type: "list", items: ["ทำกิจวัตรเดิมทุกคืน", "รักษาเวลาเข้านอนให้คงที่", "ให้ผู้ดูแลใช้แนวทางเดียวกัน"] },
          ],
          sourceTrace: [
            { sourceId: "body-0", disposition: "shortened", targetSlotId: "intro" },
            { sourceId: "section-0", disposition: "used", targetSlotId: "section1-heading" },
            { sourceId: "section-1", disposition: "used", targetSlotId: "section2-heading" },
            { sourceId: "section-2", disposition: "used", targetSlotId: "section3-heading" },
          ],
          overflowRisk: 0.21,
          fitConfidence: 0.86,
          fallbackSuggestion: null,
        },
        tokensUsed: 80,
        creditsUsed: 3,
      });

    await generateAIDraft(
      buildMockInput({
        numSlides: 2,
        draftSkillId: "prompt-planner",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const secondSlideCall = mockGenerateSlide.mock.calls
      .map((call) => call[0] as {
        slideData?: { componentRecipeId?: string; componentSlotBindings?: Array<Record<string, unknown>> };
      })
      .find((call) => call.slideData?.componentRecipeId === "sectioned-explainer");
    expect(secondSlideCall?.slideData?.componentRecipeId).toBe("sectioned-explainer");
    expect(secondSlideCall?.slideData?.componentSlotBindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slotId: "intro",
        type: "text",
      }),
      expect.objectContaining({
        slotId: "takeaways",
        type: "list",
      }),
    ]));

    const secondInsertPayload = mockAddSlideToDeck.mock.calls[1]?.[0] as {
      slideContent?: {
        aiDesign?: Record<string, unknown> & {
          fitScore?: { status?: string; overall?: number };
          compactionLevel?: string;
          sourceTrace?: Array<Record<string, unknown>>;
        };
      };
    };
    expect(secondInsertPayload.slideContent?.aiDesign).toMatchObject({
      componentRecipeId: "sectioned-explainer",
      compactionLevel: "balanced",
    });
    expect(secondInsertPayload.slideContent?.aiDesign?.fitScore?.overall).toBeGreaterThan(0);
    expect(secondInsertPayload.slideContent?.aiDesign?.fitScore?.status).toBeDefined();
    expect(secondInsertPayload.slideContent?.aiDesign?.sourceTrace).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: "body-0" }),
      expect.objectContaining({ sourceId: "section-0" }),
    ]));
    expect(secondInsertPayload.slideContent?.aiDesign?.fitScore?.deckConsistency).toBeDefined();
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "rollout_gate",
      responsePayload: expect.objectContaining({ eventType: "quality_gate_result" }),
    }));
  });

  it("applies recipe-aware compaction for article-focus slides and sends long_form_block compaction prompts", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockResolvedValue({
      id: "prompt-planner",
      name: "Prompt Planner",
      category: "prompt_enhancement",
      executionMode: "enhance-prompt",
      systemPrompt: "Plan slides from the prompt.",
    });
    mockCallLLMStructured
      .mockResolvedValueOnce({
        data: [
          {
            templateId: "hero_center",
            title: "คู่มือการนอนของเด็กเล็ก",
            body: ["ภาพรวมสั้น ๆ"],
            notes: "สไลด์เปิดหัวเรื่อง",
            graphicCategory: "Education",
            imagePromptKeywords: "sleeping child illustration",
          },
          {
            templateId: "split_right_image",
            componentRecipeId: "article-focus",
            title: "ทำไมกิจวัตรก่อนนอนจึงช่วยให้เด็กนอนง่ายขึ้น",
            body: [
              "กิจวัตรก่อนนอนที่ทำซ้ำในลำดับเดิมทุกคืนช่วยให้เด็กเล็กค่อย ๆ รับรู้ว่าสัญญาณของการพักผ่อนกำลังเริ่มขึ้น และลดการต่อต้านก่อนนอนได้ดีกว่าการเปลี่ยนกิจกรรมแบบไม่สม่ำเสมอ",
              "ผู้ดูแลควรเลือกกิจกรรมเพียงไม่กี่อย่าง เช่น อาบน้ำ อ่านนิทาน และหรี่ไฟ แล้วทำในช่วงเวลาใกล้เคียงกันทุกวันเพื่อให้ร่างกายและอารมณ์ของเด็กคาดเดาได้",
            ],
            notes: "สไลด์นี้ต้องเก็บเรื่องราวต่อเนื่องและ key points ให้อยู่ในหน้าเดียวแบบยังแก้ไขข้อความได้",
            graphicCategory: "Education",
            imagePromptKeywords: "sleep routine article",
          },
        ],
        tokensUsed: 120,
        creditsUsed: 5,
      })
      .mockResolvedValueOnce({
        data: {
          status: "ok",
          slotContent: [
            { slotId: "eyebrow", type: "text", text: "Sleep Guide" },
            { slotId: "title", type: "text", text: "ทำไมกิจวัตรก่อนนอนจึงช่วยให้เด็กนอนง่ายขึ้น" },
            { slotId: "lead", type: "text", text: "กิจวัตรเดิมทุกคืนช่วยให้เด็กคาดเดาช่วงพักผ่อนและลดการต่อต้านก่อนนอน" },
            { slotId: "body", type: "text", text: "เลือกกิจกรรมไม่กี่อย่างแล้วทำในเวลาใกล้เคียงกันทุกวันเพื่อสร้างจังหวะการนอนที่สม่ำเสมอ" },
            { slotId: "key-points-title", type: "text", text: "Key Points" },
            { slotId: "key-points", type: "list", items: ["ทำกิจกรรมเดิมทุกคืน", "รักษาเวลาให้ใกล้เคียงกัน", "ลดสิ่งกระตุ้นก่อนนอน"] },
            { slotId: "footnote", type: "text", text: "เหมาะกับพ่อแม่ที่ต้องการคำอธิบายต่อเนื่องแบบแก้ไขได้" },
          ],
          sourceTrace: [
            { sourceId: "body-0", disposition: "shortened", targetSlotId: "lead" },
            { sourceId: "body-1", disposition: "shortened", targetSlotId: "body" },
          ],
          overflowRisk: 0.2,
          fitConfidence: 0.91,
          fallbackSuggestion: null,
        },
        tokensUsed: 60,
        creditsUsed: 2,
      });

    await generateAIDraft(
      buildMockInput({ numSlides: 2, draftSkillId: "prompt-planner", articleSkillId: undefined }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const secondSlideCall = mockGenerateSlide.mock.calls[1]?.[0] as {
      slideData: { componentRecipeId?: string; componentSlotBindings?: Array<Record<string, unknown>> };
    };
    expect(secondSlideCall.slideData.componentRecipeId).toBe("article-focus");
    expect(secondSlideCall.slideData.componentSlotBindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ slotId: "lead", type: "text" }),
      expect.objectContaining({ slotId: "key-points", type: "list" }),
    ]));

    const secondInsertPayload = mockAddSlideToDeck.mock.calls[1]?.[0] as {
      slideContent?: {
        aiDesign?: {
          componentRecipeId?: string;
          compactionLevel?: string;
        };
      };
    };
    expect(secondInsertPayload.slideContent?.aiDesign).toMatchObject({
      componentRecipeId: "article-focus",
      compactionLevel: "balanced",
    });
  });

  it("applies recipe-aware compaction for poster-spotlight slides through structured_block prompts", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockResolvedValue({
      id: "prompt-planner",
      name: "Prompt Planner",
      category: "prompt_enhancement",
      executionMode: "enhance-prompt",
      systemPrompt: "Plan slides from the prompt.",
    });
    mockCallLLMStructured
      .mockResolvedValueOnce({
        data: [
          {
            templateId: "hero_center",
            title: "เปิดตัวแคมเปญใหม่",
            body: ["สรุปสั้น"],
            notes: "หน้าปก",
            graphicCategory: "Marketing",
            imagePromptKeywords: "campaign cover",
          },
          {
            templateId: "split_right_image",
            componentRecipeId: "poster-spotlight",
            title: "ประกันสุขภาพ ดูแลคุณทุกช่วงเวลา",
            body: [
              "ความคุ้มครองครอบคลุมพร้อมรายการสิทธิประโยชน์ที่ควรเห็นทันทีและต้องย่อให้เป็น subhead ที่กระชับก่อนลงโปสเตอร์",
              "เหมาจ่าย 20 ล้านบาทต่อปี",
              "ค่ารักษาไม่ต้องสำรองจ่าย",
              "ฟรี ตรวจสุขภาพประจำปี",
            ],
            notes: "ใช้เป็นหน้าโปรโมชันพร้อม CTA และหัวข้อสั้นหลายบรรทัด แต่ต้นฉบับยาวเกินกว่าจะวางลงโปสเตอร์แบบตรง ๆ จึงต้องให้ระบบ compact ก่อน",
            graphicCategory: "Marketing",
            imagePromptKeywords: "health insurance poster",
          },
        ],
        tokensUsed: 120,
        creditsUsed: 5,
      })
      .mockResolvedValueOnce({
        data: {
          status: "ok",
          slotContent: [
            { slotId: "eyebrow", type: "text", text: "ประกันสุขภาพ" },
            { slotId: "headline", type: "text", text: "ดูแลคุณทุกช่วงเวลา" },
            { slotId: "subhead", type: "text", text: "ความคุ้มครองครอบคลุมพร้อมสิทธิประโยชน์สำคัญที่เห็นได้ทันที" },
            { slotId: "benefits", type: "list", items: ["เหมาจ่าย 20 ล้านบาทต่อปี", "ค่ารักษาไม่ต้องสำรองจ่าย", "ฟรี ตรวจสุขภาพประจำปี"] },
            { slotId: "cta", type: "text", text: "ดูรายละเอียดเพิ่มเติม" },
          ],
          sourceTrace: [
            { sourceId: "body-0", disposition: "shortened", targetSlotId: "subhead" },
            { sourceId: "body-1", disposition: "used", targetSlotId: "benefits" },
          ],
          overflowRisk: 0.18,
          fitConfidence: 0.89,
          fallbackSuggestion: null,
        },
        tokensUsed: 50,
        creditsUsed: 2,
      });

    await generateAIDraft(
      buildMockInput({ numSlides: 2, draftSkillId: "prompt-planner", articleSkillId: undefined }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const secondInsertPayload = mockAddSlideToDeck.mock.calls[1]?.[0] as {
      slideContent?: { aiDesign?: { componentRecipeId?: string; compactionLevel?: string } };
    };
    expect(secondInsertPayload.slideContent?.aiDesign?.componentRecipeId).toBe("poster-spotlight");
    expect(secondInsertPayload.slideContent?.aiDesign?.compactionLevel).toBe("compact");
  });

  it("applies recipe-aware compaction for feature-highlights slides through structured_block prompts", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockResolvedValue({
      id: "prompt-planner",
      name: "Prompt Planner",
      category: "prompt_enhancement",
      executionMode: "enhance-prompt",
      systemPrompt: "Plan slides from the prompt.",
    });
    mockCallLLMStructured
      .mockResolvedValueOnce({
        data: [
          {
            templateId: "hero_center",
            title: "เปิดตัวฟีเจอร์ใหม่",
            body: ["สรุปสั้น"],
            notes: "หน้าปก",
            graphicCategory: "Technology",
            imagePromptKeywords: "feature launch cover",
          },
          {
            templateId: "feature_boxes_right",
            componentRecipeId: "feature-highlights",
            title: "เหตุผลที่ทีมควรใช้ workflow ใหม่",
            body: [
              "การมองเห็นสถานะงานแบบเดียวกันช่วยให้แต่ละฝ่ายลดเวลาตามงานซ้ำและตัดสินใจได้เร็วขึ้น",
              "การกำหนด handoff ที่ชัดเจนช่วยลดงานตกหล่นระหว่างทีมและทำให้ onboarding ทีมใหม่ง่ายขึ้น",
              "dashboard กลางช่วยให้หัวหน้าทีมเห็นความเสี่ยงได้เร็วและลดการประชุมอัปเดตที่ไม่จำเป็น",
            ],
            notes: "สไลด์นี้ต้องการสาม feature cards แบบสั้น กระชับ และอ่านเร็ว แม้ต้นฉบับยังยาวเกิน budget ของการ์ด",
            graphicCategory: "Technology",
            imagePromptKeywords: "workflow feature highlights",
          },
        ],
        tokensUsed: 120,
        creditsUsed: 5,
      })
      .mockResolvedValueOnce({
        data: {
          status: "ok",
          slotContent: [
            { slotId: "badge", type: "text", text: "Workflow Upgrade" },
            { slotId: "title", type: "text", text: "เหตุผลที่ทีมควรใช้ workflow ใหม่" },
            { slotId: "feature1-title", type: "text", text: "เห็นภาพเดียวกัน" },
            { slotId: "feature1-body", type: "text", text: "ลดเวลาตามงานซ้ำและเร่งการตัดสินใจ" },
            { slotId: "feature2-title", type: "text", text: "handoff ชัดเจน" },
            { slotId: "feature2-body", type: "text", text: "ลดงานตกหล่นและ onboarding ได้เร็วขึ้น" },
            { slotId: "feature3-title", type: "text", text: "เห็นความเสี่ยงเร็ว" },
            { slotId: "feature3-body", type: "text", text: "dashboard กลางช่วยลดการประชุมอัปเดตที่ไม่จำเป็น" },
          ],
          sourceTrace: [
            { sourceId: "body-0", disposition: "shortened", targetSlotId: "feature1-body" },
            { sourceId: "body-1", disposition: "shortened", targetSlotId: "feature2-body" },
            { sourceId: "body-2", disposition: "shortened", targetSlotId: "feature3-body" },
          ],
          overflowRisk: 0.2,
          fitConfidence: 0.9,
          fallbackSuggestion: null,
        },
        tokensUsed: 55,
        creditsUsed: 2,
      });

    await generateAIDraft(
      buildMockInput({ numSlides: 2, draftSkillId: "prompt-planner", articleSkillId: undefined }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const secondInsertPayload = mockAddSlideToDeck.mock.calls[1]?.[0] as {
      slideContent?: { aiDesign?: { componentRecipeId?: string; compactionLevel?: string } };
    };
    expect(secondInsertPayload.slideContent?.aiDesign?.componentRecipeId).toBe("feature-highlights");
    expect(secondInsertPayload.slideContent?.aiDesign?.compactionLevel).toBe("balanced");
  });

  it("escalates dense compact recipe selections into sectioned-explainer before rendering", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockResolvedValue({
      id: "prompt-planner",
      name: "Prompt Planner",
      category: "prompt_enhancement",
      executionMode: "enhance-prompt",
      systemPrompt: "Plan slides from the prompt.",
    });
    mockCallLLMStructured
      .mockResolvedValueOnce({
        data: [
          {
            templateId: "hero_center",
            title: "คู่มือการนอนของเด็กเล็ก",
            body: ["ภาพรวมสั้น ๆ"],
            notes: "สไลด์เปิดหัวเรื่อง",
            graphicCategory: "Education",
            imagePromptKeywords: "sleeping child illustration",
          },
          {
            templateId: "split_right_image",
            componentRecipeId: "quote-callout",
            title: "ขั้นตอนปฏิบัติ / เคล็ดลับ",
            body: [
              "สร้างกิจวัตรก่อนนอนและรักษาลำดับเดิมทุกคืน เช่น อ่านหนังสือ เล่าเรื่อง หรืออาบน้ำ เพื่อให้เด็กค่อย ๆ ลดสิ่งกระตุ้นและเข้าใจว่ากำลังเข้าสู่ช่วงพักผ่อนอย่างสม่ำเสมอ",
              "กำหนดเวลาเข้านอนให้คงที่ทุกวัน พร้อมสังเกตสัญญาณง่วงของเด็กและปรับสิ่งแวดล้อมในห้องให้เงียบ สบาย และเหมาะกับการนอนมากที่สุด",
            ],
            notes: "บทความนี้เหมาะสำหรับพ่อแม่และผู้ดูแลที่ต้องการคำอธิบายยาวและค่อยเป็นค่อยไปมากกว่าการ์ดสั้น รวมถึงต้องการเห็นบริบทและคำแนะนำเชิงปฏิบัติในหน้าเดียวแบบยังแก้ไขข้อความต่อได้",
            sections: [
              {
                heading: "ความผิดพลาดที่พบบ่อย",
                details: [
                  "ให้นอนในที่นอนที่ไม่ปลอดภัย: ควรจัดสภาพแวดล้อมให้นอนอย่างปลอดภัย",
                  "นอนดึกและตื่นไม่เป็นเวลา: ควรรักษาเวลาเข้านอนและตื่นนอนให้ใกล้เคียงกันทุกวัน",
                ],
              },
              {
                heading: "ใครควรอ่านสไลด์นี้",
                details: [
                  "พ่อแม่หรือผู้ดูแลเด็กเล็กที่กำลังฝึกนิสัยการนอนของลูก",
                ],
              },
            ],
            graphicCategory: "Education",
            imagePromptKeywords: "bedtime routine parent child",
          },
        ],
        tokensUsed: 220,
        creditsUsed: 8,
      })
      .mockResolvedValueOnce({
        data: {
          status: "ok",
          slotContent: [
            { slotId: "eyebrow", type: "text", text: "Sleep guide" },
            { slotId: "title", type: "text", text: "ขั้นตอนปฏิบัติ / เคล็ดลับ" },
            { slotId: "intro", type: "text", text: "เริ่มจากกิจวัตรเดิมทุกคืน รักษาเวลาเข้านอนให้คงที่ และจัดห้องนอนให้สงบเพื่อช่วยให้เด็กผ่อนคลายก่อนนอน" },
            { slotId: "section1-heading", type: "text", text: "ความผิดพลาดที่พบบ่อย" },
            { slotId: "section1-body", type: "text", text: "หลีกเลี่ยงการเปลี่ยนเวลานอนทุกวันและอย่าตอบสนองทันทีทุกครั้งโดยไม่มีแผน" },
            { slotId: "section2-heading", type: "text", text: "ใครควรอ่าน" },
            { slotId: "section2-body", type: "text", text: "เหมาะกับพ่อแม่หรือผู้ดูแลเด็กเล็กที่กำลังฝึกนิสัยการนอนของลูก" },
            { slotId: "section3-heading", type: "text", text: "สิ่งที่ควรทำต่อ" },
            { slotId: "section3-body", type: "text", text: "เลือกเพียงหนึ่งถึงสองแนวทางแล้วทำซ้ำอย่างต่อเนื่องเพื่อให้เด็กไม่สับสน" },
            { slotId: "takeaways-title", type: "text", text: "Key Takeaways" },
            { slotId: "takeaways", type: "list", items: ["ทำกิจวัตรเดิมทุกคืน", "รักษาเวลาเข้านอนให้คงที่", "ให้ผู้ดูแลใช้แนวทางเดียวกัน"] },
          ],
          sourceTrace: [
            { sourceId: "body-0", disposition: "shortened", targetSlotId: "intro" },
            { sourceId: "section-0", disposition: "used", targetSlotId: "section1-heading" },
            { sourceId: "section-1", disposition: "used", targetSlotId: "section2-heading" },
            { sourceId: "section-2", disposition: "used", targetSlotId: "section3-heading" },
          ],
          overflowRisk: 0.19,
          fitConfidence: 0.88,
          fallbackSuggestion: null,
        },
        tokensUsed: 80,
        creditsUsed: 3,
      });

    await generateAIDraft(
      buildMockInput({
        numSlides: 2,
        draftSkillId: "prompt-planner",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const secondSlideCall = mockGenerateSlide.mock.calls[1]?.[0] as {
      slideData: { componentRecipeId?: string };
    };
    expect(secondSlideCall.slideData.componentRecipeId).toBe("sectioned-explainer");

    const secondInsertPayload = mockAddSlideToDeck.mock.calls[1]?.[0] as {
      slideContent?: {
        aiDesign?: {
          componentRecipeId?: string;
          fallbackHistory?: Array<Record<string, unknown>>;
        };
      };
    };
    expect(secondInsertPayload.slideContent?.aiDesign?.componentRecipeId).toBe("sectioned-explainer");
    expect(secondInsertPayload.slideContent?.aiDesign?.fallbackHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        step: "switch_recipe",
        from: "quote-callout",
        to: "sectioned-explainer",
      }),
    ]));
  });

  it("reroutes unsafe profile-board slides into sectioned-explainer, keeps generated media, and rewrites topic notes from visible content", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockResolvedValue({
      id: "prompt-planner",
      name: "Prompt Planner",
      category: "prompt_enhancement",
      executionMode: "enhance-prompt",
      systemPrompt: "Plan slides from the prompt.",
    });
    mockGenerateSlide.mockImplementation(({ slideData, imageUrl }: { slideData: { title: string; body?: string[] }; imageUrl?: string | null }) => ({
      slideContent: {
        elements: [
          ...(imageUrl
            ? [{
              id: `img-${slideData.title}`,
              type: "image" as const,
              x: 0,
              y: 0,
              width: 640,
              height: 360,
              src: imageUrl,
              alt: slideData.title,
            }]
            : []),
          {
            id: `txt-${slideData.title}`,
            type: "text" as const,
            x: 40,
            y: 40,
            width: 560,
            height: 80,
            text: slideData.title,
            color: "#ffffff",
          },
          ...(slideData.body?.[0]
            ? [{
              id: `body-${slideData.title}`,
              type: "text" as const,
              x: 40,
              y: 140,
              width: 560,
              height: 80,
              text: slideData.body[0],
              color: "#ffffff",
            }]
            : []),
        ],
      },
      warnings: [],
    }));
    mockCallLLMStructured
      .mockResolvedValueOnce({
        data: [
          {
            templateId: "hero_center",
            title: "ปัญหาเด็กแหวะนม",
            body: ["ภาพรวมสั้น ๆ"],
            notes: "สไลด์เปิดหัวเรื่อง",
            graphicCategory: "Health",
            imagePromptKeywords: "baby reflux overview",
          },
          {
            templateId: "split_right_image",
            componentRecipeId: "profile-board",
            title: "สาเหตุหลักของการแหวะนม",
            body: [
              "การดื่มนมติดต่อกันมากเกินไป",
              "ระบบย่อยอาหารของเด็กยังไม่สมบูรณ์",
              "การหายใจและการกลืนไม่ถูกต้อง",
            ],
            notes: "การแหวะนมในทารกมักเกิดจากหลายสาเหตุ อาทิ การดื่มนมติดต่อกันมากเกินไปที่อาจทำให้ทารกไม่สามารถย่อยนมได้อย่างถูกต้อง และระบบย่อยอาหารของเด็กที่ยังอยู่ในช่วงพัฒนา. บทความนี้เหมาะสำหรับพ่อแม่ที่ต้องการคำอธิบายยาวแบบบทความเต็มก่อนนำไปเล่าต่อ",
            sections: [
              {
                heading: "การดื่มนมติดต่อกันมากเกินไป",
                details: ["ระบบย่อยอาหารของเด็กยังไม่สมบูรณ์"],
              },
              {
                heading: "ข้อควรสังเกต",
                details: ["การหายใจและการกลืนไม่ถูกต้อง"],
              },
            ],
            graphicCategory: "Health",
            imagePromptKeywords: "baby reflux causes feeding parent",
          },
        ],
        tokensUsed: 220,
        creditsUsed: 8,
      })
      .mockResolvedValueOnce({
        data: {
          status: "needs_fallback",
          slotContent: [],
          sourceTrace: [],
          overflowRisk: 0.84,
          fitConfidence: 0.25,
          fallbackSuggestion: { action: "switch_recipe", reason: "Profile layout does not fit explanatory health content." },
        },
        tokensUsed: 40,
        creditsUsed: 2,
      })
      .mockResolvedValueOnce({
        data: {
          status: "needs_fallback",
          slotContent: [],
          sourceTrace: [],
          overflowRisk: 0.86,
          fitConfidence: 0.22,
          fallbackSuggestion: { action: "switch_recipe", reason: "Compact profile rewrite still overflows." },
        },
        tokensUsed: 40,
        creditsUsed: 2,
      })
      .mockResolvedValueOnce({
        data: {
          status: "needs_fallback",
          slotContent: [],
          sourceTrace: [],
          overflowRisk: 0.88,
          fitConfidence: 0.18,
          fallbackSuggestion: { action: "switch_recipe", reason: "Aggressive profile rewrite still does not fit." },
        },
        tokensUsed: 40,
        creditsUsed: 2,
      })
      .mockResolvedValueOnce({
        data: {
          status: "ok",
          slotContent: [
            { slotId: "eyebrow", type: "text", text: "Health guide" },
            { slotId: "title", type: "text", text: "สาเหตุหลักของการแหวะนม" },
            { slotId: "intro", type: "text", text: "การดื่มนมติดต่อกันมากเกินไปอาจทำให้เด็กแหวะนมได้ง่ายขึ้น" },
            { slotId: "section1-heading", type: "text", text: "การดื่มนมติดต่อกันมากเกินไป" },
            { slotId: "section1-body", type: "text", text: "ระบบย่อยอาหารของเด็กยังไม่สมบูรณ์" },
            { slotId: "section2-heading", type: "text", text: "ข้อควรสังเกต" },
            { slotId: "section2-body", type: "text", text: "การหายใจและการกลืนไม่ถูกต้อง" },
            { slotId: "section3-heading", type: "text", text: "สิ่งที่ควรทำต่อ" },
            { slotId: "section3-body", type: "text", text: "เฝ้าสังเกตอาการหลังให้นมและปรับจังหวะการป้อน" },
            { slotId: "takeaways-title", type: "text", text: "Key Takeaways" },
            { slotId: "takeaways", type: "list", items: ["ลดการป้อนต่อเนื่อง", "สังเกตอาการหลังมื้อ", "ปรึกษาแพทย์เมื่ออาการรุนแรง"] },
          ],
          sourceTrace: [
            { sourceId: "body-0", disposition: "shortened", targetSlotId: "intro" },
            { sourceId: "section-0", disposition: "used", targetSlotId: "section1-heading" },
            { sourceId: "section-1", disposition: "used", targetSlotId: "section2-heading" },
          ],
          overflowRisk: 0.2,
          fitConfidence: 0.9,
          fallbackSuggestion: null,
        },
        tokensUsed: 80,
        creditsUsed: 3,
      });

    await generateAIDraft(
      buildMockInput({
        numSlides: 2,
        draftSkillId: "prompt-planner",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const secondSlideCall = mockGenerateSlide.mock.calls[1]?.[0] as {
      slideData: { componentRecipeId?: string };
      imageUrl?: string | null;
    };
    expect(secondSlideCall.slideData.componentRecipeId).toBe("sectioned-explainer");
    expect(secondSlideCall.imageUrl).toBe("https://cdn.example.com/image.jpg");

    const secondInsertPayload = mockAddSlideToDeck.mock.calls[1]?.[0] as {
      notes: string;
      slideContent?: {
        elements?: Array<Record<string, unknown>>;
        aiDesign?: {
          componentRecipeId?: string;
          fallbackHistory?: Array<Record<string, unknown>>;
        };
      };
    };
    expect(secondInsertPayload.notes).toContain("สาเหตุหลักของการแหวะนม");
    expect(secondInsertPayload.notes).toContain("การดื่มนมติดต่อกันมากเกินไป");
    expect(secondInsertPayload.notes).not.toContain("บทความนี้เหมาะสำหรับพ่อแม่");
    expect(secondInsertPayload.slideContent?.aiDesign?.componentRecipeId).toBe("sectioned-explainer");
    expect(secondInsertPayload.slideContent?.aiDesign?.fallbackHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        step: "switch_recipe",
        from: "profile-board",
        to: "sectioned-explainer",
      }),
    ]));
    expect(secondInsertPayload.slideContent?.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "image",
        src: "https://cdn.example.com/image.jpg",
      }),
    ]));
  });

  it("splits long-form slides when compaction remains unsafe after retries", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockResolvedValue({
      id: "prompt-planner",
      name: "Prompt Planner",
      category: "prompt_enhancement",
      executionMode: "enhance-prompt",
      systemPrompt: "Plan slides from the prompt.",
    });
    mockCallLLMStructured
      .mockResolvedValueOnce({
        data: [
          {
            templateId: "hero_center",
            title: "คู่มือการนอนของเด็กเล็ก",
            body: ["ภาพรวมสั้น ๆ"],
            notes: "สไลด์เปิดหัวเรื่อง",
            graphicCategory: "Education",
            imagePromptKeywords: "sleeping child illustration",
          },
          {
            templateId: "split_right_image",
            title: "ขั้นตอนปฏิบัติ / เคล็ดลับ",
            body: [
              "สร้างกิจวัตรก่อนนอน: ทำให้กิจกรรมตอนก่อนนอนมีความซ้ำซ้อน เช่น อ่านหนังสือ เล่าเรื่อง หรืออาบน้ำ เพื่อสร้างความรู้สึกผ่อนคลายให้กับลูก",
              "กำหนดเวลาเข้านอน: ตั้งเวลาเข้านอนที่สม่ำเสมอทุกวัน เพื่อช่วยให้ร่างกายสร้างนิสัยในการนอน",
              "สร้างสภาพแวดล้อมที่เอื้อต่อการนอน: ห้องนอนควรเงียบ สบาย และมีอุณหภูมิที่เหมาะสม",
              "ใช้เสียงเพลงหรือเสียงธรรมชาติ: เสียงที่อ่อนโยนสามารถช่วยให้เด็กผ่อนคลายและนอนหลับได้ดีขึ้นเมื่อใช้ร่วมกับกิจวัตรที่คงที่",
              "อย่าตอบสนองทันทีทุกครั้งเมื่อเด็กตื่นกลางคืน ควรรอประเมินก่อนว่าเด็กจะกลับไปนอนได้เองหรือไม่",
              "ทำกิจวัตรเดิมซ้ำหลายวันเพื่อให้เด็กได้รับสัญญาณก่อนนอนที่ชัดเจนและสม่ำเสมอ",
            ],
            notes: "บทความนี้เหมาะสำหรับพ่อแม่และผู้ดูแลที่ต้องการคำอธิบายยาวและค่อยเป็นค่อยไปมากกว่าการ์ดสั้น รวมถึงต้องการเห็นบริบท ข้อผิดพลาดที่พบบ่อย และคำแนะนำเชิงปฏิบัติอยู่ในหน้าเดียวแบบยังแก้ไขข้อความต่อได้",
            sections: [
              { heading: "ความผิดพลาดที่พบบ่อย", details: ["ให้นอนในที่นอนที่ไม่ปลอดภัย", "นอนดึกและตื่นไม่เป็นเวลา"] },
              { heading: "ใครควรอ่านสไลด์นี้", details: ["พ่อแม่หรือผู้ดูแลเด็กเล็กที่กำลังฝึกนิสัยการนอนของลูก"] },
              { heading: "สิ่งที่ควรทำต่อ", details: ["เลือกเพียงหนึ่งถึงสองแนวทางแล้วทำซ้ำอย่างสม่ำเสมอ"] },
              { heading: "เคล็ดลับเสริม", details: ["ใช้เสียงเพลงเบา ๆ และลดสิ่งกระตุ้นก่อนนอน"] },
            ],
            graphicCategory: "Education",
            imagePromptKeywords: "bedtime routine parent child",
          },
        ],
        tokensUsed: 220,
        creditsUsed: 8,
      })
      .mockResolvedValueOnce({
        data: {
          status: "needs_fallback",
          slotContent: [],
          sourceTrace: [],
          overflowRisk: 0.82,
          fitConfidence: 0.33,
          fallbackSuggestion: { action: "split_slide", reason: "Long-form copy is still too dense for one slide." },
        },
        tokensUsed: 40,
        creditsUsed: 2,
      })
      .mockResolvedValueOnce({
        data: {
          status: "needs_fallback",
          slotContent: [],
          sourceTrace: [],
          overflowRisk: 0.84,
          fitConfidence: 0.29,
          fallbackSuggestion: { action: "split_slide", reason: "Compact rewrite still overflows." },
        },
        tokensUsed: 40,
        creditsUsed: 2,
      })
      .mockResolvedValueOnce({
        data: {
          status: "needs_fallback",
          slotContent: [],
          sourceTrace: [],
          overflowRisk: 0.86,
          fitConfidence: 0.24,
          fallbackSuggestion: { action: "split_slide", reason: "Aggressive rewrite still overflows." },
        },
        tokensUsed: 40,
        creditsUsed: 2,
      });

    await generateAIDraft(
      buildMockInput({
        numSlides: 2,
        draftSkillId: "prompt-planner",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockAddSlideToDeck).toHaveBeenCalledTimes(3);
    const thirdInsertPayload = mockAddSlideToDeck.mock.calls[2]?.[0] as {
      slideContent?: {
        aiDesign?: {
          componentRecipeId?: string;
          narrative?: { title?: string };
          fallbackHistory?: Array<Record<string, unknown>>;
          sourceTrace?: Array<Record<string, unknown>>;
        };
      };
    };
    expect(thirdInsertPayload.slideContent?.aiDesign?.narrative?.title).toContain("ขั้นตอนปฏิบัติ / เคล็ดลับ");
    expect(thirdInsertPayload.slideContent?.aiDesign?.componentRecipeId).toBe("sectioned-explainer");
    expect(thirdInsertPayload.slideContent?.aiDesign?.fallbackHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ step: "split_slide" }),
    ]));
    expect(thirdInsertPayload.slideContent?.aiDesign?.sourceTrace).toEqual(expect.arrayContaining([
      expect.objectContaining({ disposition: "split" }),
    ]));
  });

  it("uses llm_layout_dsl for every slide and sends canonical note text plus media tokens to the DSL request", async () => {
    setupHappyPath();
    process.env.PRESENTATION_AI_LAYOUT_DSL_ENABLED = "true";
    mockGetSkillByIdAsync.mockResolvedValue({
      id: "prompt-planner",
      name: "Prompt Planner",
      category: "prompt_enhancement",
      executionMode: "enhance-prompt",
      systemPrompt: "Plan slides from the prompt.",
    });
    mockCallLLMStructured
      .mockResolvedValueOnce({
        data: [
          {
            templateId: "hero_center",
            title: "Intro",
            body: ["Intro point"],
            notes: "Intro note",
            graphicCategory: "Business",
            imagePromptKeywords: "intro visual",
          },
          {
            templateId: "split_right_image",
            title: "ภาพรวมงานดูแลลูกค้า",
            body: ["ใช้บอร์ดเดียวเพื่อสรุปประเด็นหลักของงานดูแลลูกค้า"],
            sections: [
              { heading: "บริบท", details: ["อธิบายภาพรวมลูกค้า"] },
              { heading: "ปัญหา", details: ["ชี้ pain point สำคัญ"] },
              { heading: "แนวทาง", details: ["สรุปหลักคิดที่ใช้"] },
              { heading: "ผลลัพธ์", details: ["บอกสิ่งที่คาดหวัง"] },
            ],
            notes: "ต้องการบอร์ดข้อมูล",
            graphicCategory: "Business",
            imagePromptKeywords: "customer service board",
            mediaPlan: [
              { slotId: "hero-photo", prompt: "customer service board" },
            ],
          },
        ],
        tokensUsed: 180,
        creditsUsed: 6,
      })
      .mockImplementation(async (input: { userMessage?: string }) => {
        if (typeof input.userMessage === "string" && input.userMessage.includes("\"mode\": \"llm_layout_dsl\"")) {
          const request = JSON.parse(input.userMessage) as {
            sourceNarrative: { title: string };
          };
          if (request.sourceNarrative.title === "Intro") {
            return {
              data: {
                status: "ok",
                elements: [
                  {
                    id: "intro-title",
                    type: "text",
                    x: 64,
                    y: 80,
                    width: 520,
                    height: 96,
                    text: "Intro DSL",
                    color: "#223344",
                    fontSize: 44,
                  },
                  {
                    id: "intro-body",
                    type: "text",
                    x: 64,
                    y: 196,
                    width: 560,
                    height: 96,
                    text: "Intro note Intro point",
                    color: "#334155",
                    fontSize: 24,
                  },
                ],
                explanation: "Intro slide laid out through DSL.",
                fallbackSuggestion: null,
              },
              tokensUsed: 40,
              creditsUsed: 2,
            };
          }
          return {
            data: {
              status: "ok",
              elements: [
                {
                  id: "hero",
                  type: "image",
                  x: 32,
                  y: 48,
                  width: 656,
                  height: 280,
                  src: "link_1",
                  alt: "Customer service board",
                },
                {
                  id: "title",
                  type: "text",
                  x: 36,
                  y: 360,
                  width: 584,
                  height: 80,
                  text: "ภาพรวมงานดูแลลูกค้า",
                  color: "#223344",
                  fontSize: 40,
                },
                {
                  id: "body",
                  type: "text",
                  x: 36,
                  y: 456,
                  width: 584,
                  height: 168,
                  text: "ใช้บอร์ดเดียวเพื่อสรุปประเด็นหลักของงานดูแลลูกค้า พร้อมบริบท ปัญหา แนวทาง และผลลัพธ์ที่คาดหวังเพื่อให้ทีมเห็นภาพเดียวกัน",
                  color: "#334155",
                  fontSize: 20,
                },
                {
                  id: "section-context",
                  type: "text",
                  x: 36,
                  y: 590,
                  width: 280,
                  height: 72,
                  text: "บริบท อธิบายภาพรวมลูกค้า",
                  color: "#334155",
                  fontSize: 18,
                },
                {
                  id: "section-problem",
                  type: "text",
                  x: 340,
                  y: 590,
                  width: 280,
                  height: 72,
                  text: "ปัญหา ชี้ pain point สำคัญ",
                  color: "#334155",
                  fontSize: 18,
                },
                {
                  id: "section-approach",
                  type: "text",
                  x: 36,
                  y: 680,
                  width: 280,
                  height: 72,
                  text: "แนวทาง สรุปหลักคิดที่ใช้",
                  color: "#334155",
                  fontSize: 18,
                },
                {
                  id: "section-outcome",
                  type: "text",
                  x: 340,
                  y: 680,
                  width: 280,
                  height: 72,
                  text: "ผลลัพธ์ บอกสิ่งที่คาดหวัง",
                  color: "#334155",
                  fontSize: 18,
                },
              ],
              explanation: "Used a bounded board layout because the content mixes four balanced sections.",
              fallbackSuggestion: null,
            },
            tokensUsed: 70,
            creditsUsed: 3,
          };
        }

        return {
          data: MOCK_SLIDES,
          tokensUsed: 300,
          creditsUsed: 10,
        };
      });

    try {
      await generateAIDraft(
        buildMockInput({
          numSlides: 2,
          draftSkillId: "prompt-planner",
          articleSkillId: undefined,
        }),
        buildMockActor(),
        "test-token",
        "task-123",
      );
    } finally {
      delete process.env.PRESENTATION_AI_LAYOUT_DSL_ENABLED;
    }

    const dslCalls = mockCallLLMStructured.mock.calls
      .map((call) => call[0] as { userMessage?: string; systemPrompt?: string })
      .filter((call) => typeof call.userMessage === "string" && call.userMessage.includes("\"mode\": \"llm_layout_dsl\""));
    const parsedRequests = dslCalls.map((call) => JSON.parse(call.userMessage ?? "{}")) as Array<{
      sourceNarrative: { title: string; primaryText?: string; notes?: string };
      availableMedia?: Array<{ token: string; label: string }>;
      styleTokens?: { allowedFontFamilies?: string[]; fontScale?: Record<string, number> };
      contentProfile?: { totalChars?: number; denseTextCandidate?: boolean; bulletCount?: number };
      compositionGuidance?: {
        textDensity?: string;
        recommendedArchetype?: string;
        alternativeArchetypes?: string[];
        preferLargeDisplayType?: boolean;
        preferImageClarity?: boolean;
      };
      canvas?: { aspectRatio?: string };
    }>;

    const introRequest = parsedRequests.find((request) => request.sourceNarrative.title === "Intro");
    const boardRequest = parsedRequests.find((request) => request.sourceNarrative.title === "ภาพรวมงานดูแลลูกค้า");

    expect(introRequest?.sourceNarrative.primaryText).toBe(introRequest?.sourceNarrative.notes);
    expect(introRequest?.contentProfile).toEqual(expect.objectContaining({
      totalChars: expect.any(Number),
      denseTextCandidate: expect.any(Boolean),
      bulletCount: expect.any(Number),
    }));
    expect(introRequest?.compositionGuidance).toEqual(expect.objectContaining({
      textDensity: expect.any(String),
      recommendedArchetype: "magazine_cover",
      preferLargeDisplayType: true,
    }));
    expect(introRequest?.styleTokens).toEqual(expect.objectContaining({
      allowedFontFamilies: expect.arrayContaining(["Inter"]),
      fontScale: expect.objectContaining({ titleMin: expect.any(Number), bodyMax: expect.any(Number) }),
    }));
    expect(introRequest?.styleTokens?.fontScale?.titleMin).toBeGreaterThanOrEqual(40);
    expect(dslCalls[0]?.systemPrompt).toContain("Vary media placement across slides");
    expect(dslCalls[0]?.systemPrompt).toContain("imagePositionX, imagePositionY, and imageZoom");
    expect(dslCalls[0]?.systemPrompt).toContain("modern editorial and magazine-style composition");
    expect(dslCalls[0]?.systemPrompt).toContain("Shapes and SVG framing");
    expect(dslCalls[0]?.systemPrompt).toContain("must not cover readable text or obscure the main subject of an image");
    expect(dslCalls[0]?.systemPrompt).toContain("Honor compositionGuidance.recommendedArchetype");
    expect(dslCalls[0]?.systemPrompt).toContain("headline_only -> treat the slide like a magazine cover");
    expect(dslCalls[0]?.systemPrompt).toContain("Do not default to blurring the image");

    expect(boardRequest?.sourceNarrative.primaryText).toBe(boardRequest?.sourceNarrative.notes);
    expect(boardRequest?.availableMedia).toEqual(expect.arrayContaining([
      expect.objectContaining({ token: "link_1", label: "hero-photo" }),
    ]));
    expect(boardRequest?.compositionGuidance).toEqual(expect.objectContaining({
      textDensity: "dense",
      recommendedArchetype: "business_brochure",
    }));
    expect(boardRequest?.canvas).toEqual(expect.objectContaining({ aspectRatio: expect.any(String) }));

    const firstInsertPayload = mockAddSlideToDeck.mock.calls[0]?.[0] as {
      slideContent?: {
        elements?: Array<Record<string, unknown>>;
        aiDesign?: { mode?: string };
      };
    };
    const secondInsertPayload = mockAddSlideToDeck.mock.calls[1]?.[0] as {
      slideContent?: {
        elements?: Array<Record<string, unknown>>;
        aiDesign?: { mode?: string };
      };
    };
    expect(firstInsertPayload.slideContent?.aiDesign?.mode).toBe("llm_layout_dsl");
    expect(firstInsertPayload.slideContent?.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "text", text: "Intro" }),
      expect.objectContaining({ type: "image", src: "https://cdn.example.com/image.jpg" }),
    ]));
    expect(secondInsertPayload.slideContent?.aiDesign?.mode).toBe("llm_layout_dsl");
    expect(secondInsertPayload.slideContent?.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "text", text: "ภาพรวมงานดูแลลูกค้า" }),
      expect.objectContaining({ type: "image", src: "https://cdn.example.com/image.jpg" }),
    ]));
  });

  it("rebuilds slides with a local DSL fallback when generated media exists but the compiled slide does not consume it", async () => {
    setupHappyPath();
    process.env.PRESENTATION_AI_LAYOUT_DSL_ENABLED = "true";
    mockGetSkillByIdAsync.mockResolvedValue({
      id: "prompt-planner",
      name: "Prompt Planner",
      category: "prompt_enhancement",
      executionMode: "enhance-prompt",
      systemPrompt: "Plan slides from the prompt.",
    });
    mockCallLLMStructured
      .mockResolvedValueOnce({
        data: [
          {
            templateId: "split_right_image",
            title: "ความอดทนคือหัวใจสำคัญของความสำเร็จ",
            body: [
              "การฝึกนิสัยใหม่ให้กับเด็กเล็กอาจต้องใช้เวลาประมาณหนึ่งถึงสองสัปดาห์",
              "คุณพ่อคุณแม่ควรมีแนวทางที่สม่ำเสมอและอบอุ่น",
            ],
            notes: "การฝึกนิสัยใหม่ให้กับเด็กเล็กอาจต้องใช้เวลาประมาณหนึ่งถึงสองสัปดาห์และควรมีแนวทางที่สม่ำเสมอ",
            graphicCategory: "Business",
            imagePromptKeywords: "patient parent comforting child at night",
            mediaPlan: [
              { slotId: "hero-image", prompt: "patient parent comforting child at night" },
            ],
          },
        ],
        tokensUsed: 150,
        creditsUsed: 5,
      })
      .mockImplementation(async (input: { userMessage?: string }) => {
        if (typeof input.userMessage === "string" && input.userMessage.includes("\"mode\": \"llm_layout_dsl\"")) {
          return {
            data: {
              status: "ok",
              elements: [
                {
                  id: "title",
                  type: "text",
                  x: 48,
                  y: 72,
                  width: 600,
                  height: 96,
                  text: "ความอดทนคือหัวใจสำคัญของความสำเร็จ",
                  color: "#ffffff",
                  fontSize: 40,
                },
                {
                  id: "body",
                  type: "text",
                  x: 48,
                  y: 188,
                  width: 600,
                  height: 220,
                  text: "การฝึกนิสัยใหม่ให้กับเด็กเล็กอาจต้องใช้เวลาประมาณหนึ่งถึงสองสัปดาห์และควรมีแนวทางที่สม่ำเสมอ",
                  color: "#d4d4d8",
                  fontSize: 24,
                },
              ],
              explanation: "Text-only layout that accidentally omitted the generated image.",
              fallbackSuggestion: null,
            },
            tokensUsed: 60,
            creditsUsed: 2,
          };
        }
        return {
          data: MOCK_SLIDES,
          tokensUsed: 300,
          creditsUsed: 10,
        };
      });

    try {
      await generateAIDraft(
        buildMockInput({
          numSlides: 1,
          draftSkillId: "prompt-planner",
          articleSkillId: undefined,
        }),
        buildMockActor(),
        "test-token",
        "task-123",
      );
    } finally {
      delete process.env.PRESENTATION_AI_LAYOUT_DSL_ENABLED;
    }

    expect(mockAddSlideToDeck).not.toHaveBeenCalled();

    const progressCalls = mockRedisSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"),
    );
    const lastProgress = JSON.parse(progressCalls[progressCalls.length - 1][1] as string);
    expect(lastProgress.phaseLabel).toBe("Compiling layouts failed");
    expect(lastProgress.error.message).toMatch(/still required fallback/i);
    expect(lastProgress.error.message).toMatch(/slide 1/i);
    expect(lastProgress.error.message).toMatch(/did not consume the resolved media url|use at least one provided media token/i);
  });

  it("retries the layout DSL with repair feedback before settling on a final slide", async () => {
    setupHappyPath();
    process.env.PRESENTATION_AI_LAYOUT_DSL_ENABLED = "true";
    mockGetSkillByIdAsync.mockResolvedValue({
      id: "prompt-planner",
      name: "Prompt Planner",
      category: "prompt_enhancement",
      executionMode: "enhance-prompt",
      systemPrompt: "Plan slides from the prompt.",
    });

    let dslAttempt = 0;
    mockCallLLMStructured.mockImplementation(async (input: { userMessage?: string }) => {
      if (typeof input.userMessage === "string" && input.userMessage.includes("\"mode\": \"llm_layout_dsl\"")) {
        dslAttempt += 1;
        if (dslAttempt === 1) {
          return {
            data: {
              status: "ok",
              elements: [
                {
                  id: "title-only",
                  type: "text",
                  x: 48,
                  y: 72,
                  width: 640,
                  height: 96,
                  text: "ความอดทนคือหัวใจสำคัญของความสำเร็จ",
                  color: "#ffffff",
                  fontSize: 38,
                },
              ],
              explanation: "First pass was too sparse.",
              fallbackSuggestion: null,
            },
            tokensUsed: 60,
            creditsUsed: 2,
          };
        }

        return {
          data: {
            status: "ok",
            elements: [
              {
                id: "hero",
                type: "image",
                x: 48,
                y: 48,
                width: 624,
                height: 280,
                src: "link_1",
                alt: "night routine",
              },
              {
                id: "title",
                type: "text",
                x: 48,
                y: 356,
                width: 624,
                height: 108,
                text: "ความอดทนคือหัวใจสำคัญของความสำเร็จ",
                color: "#ffffff",
                fontSize: 38,
              },
              {
                id: "body",
                type: "text",
                x: 48,
                y: 480,
                width: 624,
                height: 220,
                text: "การฝึกนิสัยใหม่ให้กับเด็กเล็กอาจต้องใช้เวลาประมาณหนึ่งถึงสองสัปดาห์ คุณพ่อคุณแม่ควรมีแนวทางที่สม่ำเสมอและอบอุ่นเพื่อช่วยให้ลูกค่อย ๆ ปรับตัวได้อย่างมั่นใจ",
                color: "#d4d4d8",
                fontSize: 22,
              },
            ],
            explanation: "Second pass repaired coverage and media usage.",
            fallbackSuggestion: null,
          },
          tokensUsed: 70,
          creditsUsed: 3,
        };
      }

      return {
        data: [
          {
            templateId: "split_right_image",
            title: "ความอดทนคือหัวใจสำคัญของความสำเร็จ",
            body: [
              "การฝึกนิสัยใหม่ให้กับเด็กเล็กอาจต้องใช้เวลาประมาณหนึ่งถึงสองสัปดาห์",
              "คุณพ่อคุณแม่ควรมีแนวทางที่สม่ำเสมอและอบอุ่น",
            ],
            notes: "การฝึกนิสัยใหม่ให้กับเด็กเล็กอาจต้องใช้เวลาประมาณหนึ่งถึงสองสัปดาห์และควรมีแนวทางที่สม่ำเสมอ",
            graphicCategory: "Business",
            imagePromptKeywords: "patient parent comforting child at night",
            mediaPlan: [
              { slotId: "hero-image", prompt: "patient parent comforting child at night" },
            ],
          },
        ],
        tokensUsed: 150,
        creditsUsed: 5,
      };
    });

    try {
      await generateAIDraft(
        buildMockInput({
          numSlides: 1,
          draftSkillId: "prompt-planner",
          articleSkillId: undefined,
        }),
        buildMockActor(),
        "test-token",
        "task-123",
      );
    } finally {
      delete process.env.PRESENTATION_AI_LAYOUT_DSL_ENABLED;
    }

    const dslCalls = mockCallLLMStructured.mock.calls
      .map((call) => call[0] as { userMessage?: string })
      .filter((call) => typeof call.userMessage === "string" && call.userMessage.includes("\"mode\": \"llm_layout_dsl\""));
    expect(dslCalls).toHaveLength(2);

    const secondRequest = JSON.parse(dslCalls[1]?.userMessage ?? "{}") as {
      repairContext?: { previousFailure?: string; mustFix?: string[] };
    };
    expect(secondRequest.repairContext?.previousFailure).toBeTruthy();
    expect(secondRequest.repairContext?.mustFix).toEqual(expect.arrayContaining([
      expect.stringMatching(/visible text is too short|use at least one provided media token/i),
    ]));

    const insertPayload = mockAddSlideToDeck.mock.calls[0]?.[0] as {
      slideContent?: {
        aiDesign?: {
          mode?: string;
          selectionMode?: string;
          fallbackHistory?: Array<{ to?: string; reason?: string }>;
          layoutExecution?: { resolvedBy?: string; attemptCount?: number; usedRepairPrompt?: boolean };
        };
      };
    };
    expect(insertPayload.slideContent?.aiDesign?.mode).toBe("llm_layout_dsl");
    expect(insertPayload.slideContent?.aiDesign?.selectionMode).toBe("llm");
    expect(insertPayload.slideContent?.aiDesign?.fallbackHistory ?? []).toHaveLength(0);
    expect(insertPayload.slideContent?.aiDesign?.layoutExecution).toEqual(expect.objectContaining({
      resolvedBy: "llm_repair_success",
      attemptCount: 2,
      usedRepairPrompt: true,
      attempts: expect.arrayContaining([
        expect.objectContaining({
          attempt: 1,
          outcome: expect.stringMatching(/rejected_/),
        }),
        expect.objectContaining({
          attempt: 2,
          outcome: "accepted",
        }),
      ]),
    }));
  });

  it("fails the draft instead of saving local fallback slides when advanced layout DSL times out", async () => {
    setupHappyPath();
    process.env.PRESENTATION_AI_LAYOUT_DSL_ENABLED = "true";
    process.env.AI_DRAFT_LAYOUT_DSL_TIMEOUT_MS = "2000";
    mockGetSkillByIdAsync.mockResolvedValue({
      id: "prompt-planner",
      name: "Prompt Planner",
      category: "prompt_enhancement",
      executionMode: "enhance-prompt",
      systemPrompt: "Plan slides from the prompt.",
    });
    mockCallLLMStructured
      .mockResolvedValueOnce({
        data: [
          {
            templateId: "hero_center",
            title: "Intro",
            body: ["Intro point"],
            notes: "Intro note",
            graphicCategory: "Business",
            imagePromptKeywords: "intro visual",
          },
          {
            templateId: "split_right_image",
            title: "ภาพรวมงานดูแลลูกค้า",
            body: ["ใช้บอร์ดเดียวเพื่อสรุปประเด็นหลักของงานดูแลลูกค้า"],
            sections: [
              { heading: "บริบท", details: ["อธิบายภาพรวมลูกค้า"] },
              { heading: "ปัญหา", details: ["ชี้ pain point สำคัญ"] },
              { heading: "แนวทาง", details: ["สรุปหลักคิดที่ใช้"] },
              { heading: "ผลลัพธ์", details: ["บอกสิ่งที่คาดหวัง"] },
            ],
            notes: "ต้องการบอร์ดข้อมูล",
            graphicCategory: "Business",
            imagePromptKeywords: "customer service board",
          },
        ],
        tokensUsed: 180,
        creditsUsed: 6,
      })
      .mockImplementation(
        () => new Promise(() => {}) as Promise<never>,
      );

    try {
      const runPromise = generateAIDraft(
        buildMockInput({
          numSlides: 2,
          draftSkillId: "prompt-planner",
          articleSkillId: undefined,
        }),
        buildMockActor(),
        "test-token",
        "task-123",
      );
      await vi.advanceTimersByTimeAsync(5000);
      await runPromise;
    } finally {
      delete process.env.PRESENTATION_AI_LAYOUT_DSL_ENABLED;
      delete process.env.AI_DRAFT_LAYOUT_DSL_TIMEOUT_MS;
    }

    expect(mockAddSlideToDeck).not.toHaveBeenCalled();

    const progressCalls = mockRedisSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"),
    );
    expect(progressCalls.some(([, value]) => JSON.parse(String(value)).phaseLabel.includes("Applying advanced layouts"))).toBe(true);
    const lastProgress = JSON.parse(progressCalls[progressCalls.length - 1][1] as string);
    expect(lastProgress.phaseLabel).toBe("Compiling layouts failed");
    expect(lastProgress.error.message).toMatch(/slide 1/i);
    expect(lastProgress.error.message).toMatch(/layout_dsl_timeout|usable layout|did not consume the resolved media url/i);
  });

  it("truncates fallback history reasons to schema-safe length", () => {
    const entry = makeFallbackHistoryEntry({
      step: "switch_mode",
      from: "llm_layout_dsl",
      to: "llm_layout_dsl_local_fallback",
      reason: `Repeated DSL failure ${"x".repeat(900)}`,
    });

    expect(entry.step).toBe("switch_mode");
    expect(entry.reason).toContain("Repeated DSL failure");
    expect(entry.reason.length).toBeLessThanOrEqual(512);
  });

  it("uses full-slide-media mode when the visual-first flag is enabled and Thai text risk is acceptable", async () => {
    setupHappyPath();
    process.env.PRESENTATION_AI_FULL_SLIDE_MEDIA_ENABLED = "true";
    mockGetSkillByIdAsync.mockResolvedValue({
      id: "prompt-planner",
      name: "Prompt Planner",
      category: "prompt_enhancement",
      executionMode: "enhance-prompt",
      systemPrompt: "Plan slides from the prompt.",
    });
    mockCallLLMStructured.mockResolvedValueOnce({
      data: [
        {
          templateId: "hero_center",
          title: "Intro",
          body: ["Intro point"],
          notes: "Intro note",
          graphicCategory: "Business",
          imagePromptKeywords: "intro visual",
        },
        {
          templateId: "split_right_image",
          title: "Spring campaign launch",
          body: ["Soft pastel poster for the new member offer"],
          notes: "Poster slide only",
          graphicCategory: "Marketing",
          imagePromptKeywords: "spring campaign poster",
        },
      ],
      tokensUsed: 180,
      creditsUsed: 6,
    });

    try {
      await generateAIDraft(
        buildMockInput({
          numSlides: 2,
          draftSkillId: "prompt-planner",
          articleSkillId: undefined,
        }),
        buildMockActor(),
        "test-token",
        "task-123",
      );
    } finally {
      delete process.env.PRESENTATION_AI_FULL_SLIDE_MEDIA_ENABLED;
    }

    const secondInsertPayload = mockAddSlideToDeck.mock.calls[1]?.[0] as {
      slideContent?: {
        visualOnly?: boolean;
        elements?: Array<Record<string, unknown>>;
        aiDesign?: {
          mode?: string;
          mediaModeMetadata?: { visualIntent?: string; thaiTextRisk?: string; editableSourceRetained?: boolean };
        };
      };
    };
    expect(secondInsertPayload.slideContent?.visualOnly).toBe(true);
    expect(secondInsertPayload.slideContent?.aiDesign?.mode).toBe("full_slide_media");
    expect(secondInsertPayload.slideContent?.aiDesign?.mediaModeMetadata).toMatchObject({
      editableSourceRetained: true,
      visualIntent: "poster",
      thaiTextRisk: "low",
    });
    expect(secondInsertPayload.slideContent?.elements?.[0]).toMatchObject({
      type: "image",
      src: "https://cdn.example.com/image.jpg",
    });
  });

  it("sanitizes AI narrative body and sections before slide insertion", async () => {
    setupHappyPath();
    const oversizedLine = "Detailed launch coverage ".repeat(20).trim();
    const markdownArticle = [
      "# Membership launch campaign",
      "",
      "## Benefits",
      "Priority onboarding for early adopters",
      "Premium templates for faster publishing",
      "Shared brand controls for every team",
      "Central review workflow for approvals",
      oversizedLine,
      "Dedicated support channel after rollout",
      "",
      "Plain body insight one",
      "Plain body insight two",
      "Plain body insight three",
      "Plain body insight four",
      "Plain body insight five",
      "Plain body insight six",
      "Plain body insight seven",
      "Plain body insight eight",
      "Plain body insight nine",
      "Plain body insight ten",
      "Plain body insight eleven",
      "Plain body insight twelve",
    ].join("\n");

    mockCallLLMStructured.mockResolvedValueOnce({
      data: [
        {
          templateId: "split_right_image",
          title: "Membership launch offer",
          body: ["Seed point"],
          notes: "Seed note",
          graphicCategory: "Business",
          imagePromptKeywords: "campaign poster",
        },
      ],
      tokensUsed: 180,
      creditsUsed: 6,
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 1,
        useCustomArticle: true,
        customArticleText: markdownArticle,
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const insertPayload = mockAddSlideToDeck.mock.calls[0]?.[0] as {
      slideContent?: Record<string, unknown>;
    };
    const parsed = presentationSlideContentSchema.safeParse(insertPayload.slideContent);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    const narrative = parsed.data.aiDesign?.narrative;
    expect(narrative?.body.length).toBeLessThanOrEqual(10);
    expect(narrative?.body.every((line) => line.length <= 260)).toBe(true);
    expect(narrative?.sections?.[0]?.details.length).toBeLessThanOrEqual(4);
    expect(narrative?.sections?.[0]?.details.every((detail) => detail.length <= 260)).toBe(true);
  });

  it("trims slides when structured output exceeds requested numSlides", async () => {
    setupHappyPath();
    await generateAIDraft(
      buildMockInput({ numSlides: 2 }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockGenerateSlide).toHaveBeenCalledTimes(2);
    expect(mockAddSlideToDeck).toHaveBeenCalledTimes(2);
  });

  it("pads slides when structured output is lower than requested numSlides", async () => {
    setupHappyPath();
    mockCallLLMStructured.mockResolvedValueOnce({
      data: MOCK_SLIDES.slice(0, 2),
      tokensUsed: 300,
      creditsUsed: 10,
    });

    await generateAIDraft(
      buildMockInput({ numSlides: 4 }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockGenerateSlide).toHaveBeenCalledTimes(4);
    expect(mockAddSlideToDeck).toHaveBeenCalledTimes(4);
  });
});

describe("generateAIDraft - Phase 3+4", () => {
  it("deducts credits per LLM/media step with transparent descriptions", async () => {
    setupHappyPath();

    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    expect(mockDeductCreditsForModel).toHaveBeenCalledTimes(1); // article generation
    expect(mockDeductCredits).toHaveBeenCalledTimes(3); // one media task per slide

    const firstMediaCharge = mockDeductCredits.mock.calls[0][0] as { description: string; metadata?: Record<string, unknown> };
    expect(firstMediaCharge.description).toContain("AI Draft image generation");
    expect(firstMediaCharge.description).toContain("Deck #1");
    expect(firstMediaCharge.metadata?.operation).toBe("ai_draft_media_generation");
    expect(firstMediaCharge.metadata?.slideNumber).toBe(1);
  });

  it("aborts entire draft immediately when media billing fails under concurrency", async () => {
    setupHappyPath();
    mockDeductCredits
      .mockRejectedValueOnce(new Error("Insufficient credits"))
      .mockResolvedValue({ success: true, creditsUsed: 8, newBalance: 84, transactionId: 2 });

    await generateAIDraft(
      buildMockInput({ numSlides: 8 }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockAddSlideToDeck).not.toHaveBeenCalled();
    expect(mockGenerateImageAsync.mock.calls.length).toBeLessThanOrEqual(3); // bounded by concurrency when stopOnError is active
  });

  it("loads image skill when imageSkillId provided", async () => {
    setupHappyPath();
    const input = buildMockInput({ imageSkillId: "image-prompt-engineer" });
    await generateAIDraft(input, buildMockActor(), "test-token", "task-123");
    expect(mockGetSkillByIdAsync).toHaveBeenCalledWith("image-prompt-engineer");
  });

  it("falls back to raw keywords when image skill LLM call fails", async () => {
    setupHappyPath();
    const input = buildMockInput({ imageSkillId: "image-prompt-engineer" });

    // First text-LLM call succeeds (Phase 1 article), subsequent ones fail (image enhancement)
    mockExecuteWithFallback
      .mockResolvedValueOnce({
        type: "success",
        providerId: 1,
        providerName: "test-provider",
        response: {
          id: "resp1",
          created: Date.now(),
          model: "test",
          choices: [{ index: 0, message: { role: "assistant", content: MOCK_ARTICLE }, finish_reason: "stop" }],
          usage: { prompt_tokens: 100, completion_tokens: 200 },
        },
      })
      .mockResolvedValue({
        type: "error",
        error: "Image skill LLM failed",
        statusCode: 503,
      });

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

  it("applies imagePromptContext and referenceImageUrls to image requests", async () => {
    setupHappyPath();

    await generateAIDraft(
      buildMockInput({
        imagePromptContext: "Thai child, Thai family style",
        referenceImageUrls: ["/uploads/ref-1.jpg"],
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockGenerateImageAsync).toHaveBeenCalled();
    const firstCall = mockGenerateImageAsync.mock.calls[0][0];
    expect(firstCall.prompt).toContain("Additional visual requirements:");
    expect(firstCall.prompt).toContain("Thai child, Thai family style");
    expect(firstCall.referenceImageUrls).toEqual(["/uploads/ref-1.jpg"]);
  });

  it("maps referenceImageUrls into extraParams when model declares image_urls input field", async () => {
    setupHappyPath();
    mockGetModelsByTypeAsync.mockResolvedValueOnce([
      {
        id: "google-banana-2",
        type: "image",
        name: "Google Banana 2",
        provider: "kie.ai",
        description: "Image model",
        creditCost: 10,
        isEnabled: true,
        priority: 0,
        configJson: {
          generateType: "text-to-image",
          inputFields: [
            { key: "image_urls", type: "image_urls" },
          ],
        },
      },
    ]);

    await generateAIDraft(
      buildMockInput({
        referenceImageUrls: ["/uploads/ref-1.jpg", "https://cdn.example.com/ref-2.jpg"],
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockGenerateImageAsync).toHaveBeenCalled();
    const firstCall = mockGenerateImageAsync.mock.calls[0][0];
    expect(firstCall.extraParams).toMatchObject({
      image_urls: ["/uploads/ref-1.jpg", "https://cdn.example.com/ref-2.jpg"],
    });
    expect(firstCall.apiConfig).toMatchObject({
      reference_image_input_key: "image_urls",
      reference_image_input_label: "Reference Images",
      reference_image_input_type: "array",
    });
    expect(firstCall.referenceImageUrls).toEqual([
      "/uploads/ref-1.jpg",
      "https://cdn.example.com/ref-2.jpg",
    ]);
  });

  it("maps referenceImageUrls into extraParams when video model declares legacy video_urls input field", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (id: string) => {
      if (id === "video-creator") {
        return {
          id: "video-creator",
          name: "Video Creator",
          type: "video-generation",
          executionMode: "llm-only",
        };
      }
      return {
        id: "general-article-writer",
        name: "General Article Writer",
        systemPrompt: "You are a versatile article writer.",
        executionMode: "llm-only",
      };
    });
    mockGetModelsByTypeAsync.mockResolvedValueOnce([
      {
        id: "veo-3-1",
        type: "video",
        name: "Veo 3.1",
        provider: "kie.ai",
        description: "Video model",
        creditCost: 50,
        isEnabled: true,
        priority: 0,
        aspectRatios: ["16:9"],
        configJson: {
          generateType: "text-to-video",
          inputFields: [
            { key: "reference_clips", type: "video_urls" },
          ],
        },
      },
    ]);
    mockGetTask.mockResolvedValue({ id: "video-task-1", status: "completed", resultUrl: "https://cdn.example.com/video.mp4" });

    await generateAIDraft(
      buildMockInput({
        imageSkillId: "video-creator",
        imageModel: "veo-3-1",
        referenceImageUrls: ["/uploads/ref-1.jpg", "https://cdn.example.com/ref-2.jpg"],
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockGenerateVideoAsync).toHaveBeenCalled();
    const firstCall = mockGenerateVideoAsync.mock.calls[0][0];
    expect(firstCall.extraParams).toMatchObject({
      reference_clips: ["/uploads/ref-1.jpg", "https://cdn.example.com/ref-2.jpg"],
    });
  });

  it("infers sync targets for aspectRatio and imageUrls when syncWith is omitted", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (id: string) => {
      if (id === "video-creator") {
        return {
          id: "video-creator",
          name: "Video Creator",
          type: "video-generation",
          executionMode: "llm-only",
        };
      }
      return {
        id: "general-article-writer",
        name: "General Article Writer",
        systemPrompt: "You are a versatile article writer.",
        executionMode: "llm-only",
      };
    });
    mockGetModelsByTypeAsync.mockResolvedValueOnce([
      {
        id: "veo-3-1",
        type: "video",
        name: "Veo 3.1",
        provider: "kie.ai",
        description: "Video model",
        creditCost: 50,
        isEnabled: true,
        priority: 0,
        aspectRatios: ["9:16", "16:9"],
        configJson: {
          generateType: "text-to-video",
          inputFields: [
            { key: "imageUrls", type: "text" },
            { key: "aspectRatio", type: "select", options: [{ value: "16:9" }, { value: "9:16" }] },
          ],
        },
      },
    ]);
    mockGetTask.mockResolvedValue({ id: "video-task-1", status: "completed", resultUrl: "https://cdn.example.com/video.mp4" });

    await generateAIDraft(
      buildMockInput({
        imageSkillId: "video-creator",
        imageModel: "veo-3-1",
        canvasWidth: 720,
        canvasHeight: 1280,
        referenceImageUrls: ["/uploads/ref-1.jpg", "https://cdn.example.com/ref-2.jpg"],
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockGenerateVideoAsync).toHaveBeenCalled();
    const firstCall = mockGenerateVideoAsync.mock.calls[0][0];
    expect(firstCall.extraParams).toMatchObject({
      imageUrls: ["/uploads/ref-1.jpg", "https://cdn.example.com/ref-2.jpg"],
      aspectRatio: "9:16",
    });
  });

  it("syncs runtime prompt into model-mapped prompt input for video generation", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (id: string) => {
      if (id === "video-creator") {
        return {
          id: "video-creator",
          name: "Video Creator",
          type: "video-generation",
          executionMode: "llm-only",
        };
      }
      return {
        id: "general-article-writer",
        name: "General Article Writer",
        systemPrompt: "You are a versatile article writer.",
        executionMode: "llm-only",
      };
    });
    mockGetModelsByTypeAsync.mockResolvedValueOnce([
      {
        id: "veo-3-1",
        type: "video",
        name: "Veo 3.1",
        provider: "kie.ai",
        description: "Video model",
        creditCost: 50,
        isEnabled: true,
        priority: 0,
        aspectRatios: ["16:9"],
        configJson: {
          generateType: "text-to-video",
          inputFields: [
            { key: "scene_prompt", type: "text", default: "legacy-default-prompt", syncWith: "prompt" },
          ],
        },
      },
    ]);
    mockGetTask.mockResolvedValue({ id: "video-task-1", status: "completed", resultUrl: "https://cdn.example.com/video.mp4" });

    await generateAIDraft(
      buildMockInput({
        imageSkillId: "video-creator",
        imageModel: "veo-3-1",
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockGenerateVideoAsync).toHaveBeenCalled();
    const firstCall = mockGenerateVideoAsync.mock.calls[0][0];
    expect(firstCall.prompt).toContain("test image 1");
    expect(firstCall.extraParams).toMatchObject({
      scene_prompt: firstCall.prompt,
    });
  });

  it("applies mediaModelExtraParams from request and strips unknown keys", async () => {
    setupHappyPath();
    mockGetModelsByTypeAsync.mockResolvedValueOnce([
      {
        id: "flux-2.0",
        type: "image",
        name: "Flux 2.0",
        provider: "fal",
        description: "Image model",
        creditCost: 10,
        isEnabled: true,
        priority: 0,
        aspectRatios: ["9:16", "16:9"],
        configJson: {
          generateType: "text-to-image",
          inputFields: [
            { key: "quality", type: "select", default: "standard", options: [{ value: "standard" }, { value: "pro" }] },
            { key: "seed", type: "number" },
            { key: "aspectRatio", type: "select", options: [{ value: "16:9" }, { value: "9:16" }] },
          ],
        },
      },
    ]);

    await generateAIDraft(
      buildMockInput({
        imageModel: "flux-2.0",
        canvasWidth: 720,
        canvasHeight: 1280,
        mediaModelExtraParams: {
          quality: "pro",
          seed: 777,
          aspectRatio: "1:1",
          unknown: "drop-me",
        },
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockGenerateImageAsync).toHaveBeenCalled();
    const firstCall = mockGenerateImageAsync.mock.calls[0][0];
    expect(firstCall.extraParams).toMatchObject({
      quality: "pro",
      seed: 777,
      aspectRatio: "9:16",
    });
    expect(firstCall.extraParams).not.toHaveProperty("unknown");
  });

  it("propagates media extra params into component recipe fallback media elements", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (id: string) => {
      if (id === "video-creator") {
        return {
          id: "video-creator",
          name: "Video Creator",
          type: "video-generation",
          executionMode: "llm-only",
        };
      }
      return {
        id: "general-article-writer",
        name: "General Article Writer",
        systemPrompt: "You are a versatile article writer.",
        executionMode: "llm-only",
      };
    });
    mockGetModelsByTypeAsync.mockResolvedValueOnce([
      {
        id: "veo-3-1",
        type: "video",
        name: "Veo 3.1",
        provider: "kie.ai",
        description: "Video model",
        creditCost: 50,
        isEnabled: true,
        priority: 0,
        aspectRatios: ["16:9"],
        configJson: {
          generateType: "text-to-video",
          inputFields: [
            { key: "duration", type: "number" },
          ],
        },
      },
    ]);
    mockGenerateSlide.mockImplementation(({ slideData, imageUrl }: {
      slideData: { componentRecipeId?: string };
      imageUrl?: string | null;
    }) => {
      if (slideData.componentRecipeId === "video-spotlight") {
        return {
          slideContent: {
            elements: [],
            components: [
              {
                id: "cmp-video",
                componentId: "video-spotlight",
                componentType: "built-in",
                definitionRevision: 1,
                slotBindings: [
                  { slotId: "clip", type: "video", src: imageUrl || "", poster: "", title: "Clip" },
                ],
                fallbackElements: [
                  {
                    id: "cmp-video::clip-video",
                    type: "video",
                    x: 100,
                    y: 100,
                    width: 400,
                    height: 300,
                    src: imageUrl || "",
                    poster: "",
                    title: "Clip",
                    muted: true,
                    loop: true,
                    videoFit: "cover",
                    videoPositionX: 50,
                    videoPositionY: 50,
                    videoZoom: 1,
                  },
                ],
              },
            ],
          },
          warnings: [],
        };
      }
      return {
        slideContent: MOCK_SLIDE_CONTENT,
        warnings: [],
      };
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 2,
        imageSkillId: "video-creator",
        imageModel: "veo-3-1",
        mediaModelExtraParams: {
          duration: 8,
        },
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const secondInsertPayload = mockAddSlideToDeck.mock.calls[1]?.[0] as {
      slideContent?: {
        components?: Array<{ fallbackElements?: Array<Record<string, unknown>> }>;
      };
    } | undefined;
    const videoElement = secondInsertPayload?.slideContent?.components?.[0]?.fallbackElements?.find(
      (element) => element.type === "video",
    );
    expect(videoElement).toMatchObject({
      videoExtraParams: {
        duration: 8,
      },
    });
  });

  it("passes configured kie_model_id for video generation when media model is Veo 3.1", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockImplementation(async (id: string) => {
      if (id === "video-creator") {
        return {
          id: "video-creator",
          name: "Video Creator",
          type: "video-generation",
          executionMode: "llm-only",
        };
      }
      return {
        id: "general-article-writer",
        name: "General Article Writer",
        systemPrompt: "You are a versatile article writer.",
        executionMode: "llm-only",
      };
    });
    mockGetModelsByTypeAsync.mockResolvedValueOnce([
      {
        id: "veo-3-1",
        type: "video",
        name: "Veo 3.1",
        provider: "kie.ai",
        description: "Video model",
        creditCost: 50,
        isEnabled: true,
        priority: 0,
        aspectRatios: ["16:9"],
        configJson: {
          generateType: "text-to-video",
          apiEndpoint: "/api/v1/veo/generate",
          apiPayloadFormat: "veo",
          kieModelId: "veo3_fast",
        },
      },
    ]);
    mockGetTask.mockResolvedValue({ id: "video-task-1", status: "completed", resultUrl: "https://cdn.example.com/video.mp4" });

    await generateAIDraft(
      buildMockInput({
        imageSkillId: "video-creator",
        imageModel: "veo-3-1",
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockGenerateVideoAsync).toHaveBeenCalled();
    const firstCall = mockGenerateVideoAsync.mock.calls[0][0];
    expect(firstCall.model).toBe("veo-3-1");
    expect(firstCall.apiConfig).toMatchObject({
      provider: "kie.ai",
      endpoint: "/api/v1/veo/generate",
      payload_format: "veo",
      kie_model_id: "veo3_fast",
    });
  });

  it("uses canvas aspect ratio for image generation when provided", async () => {
    setupHappyPath();

    await generateAIDraft(
      buildMockInput({
        canvasWidth: 720,
        canvasHeight: 1280,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockGenerateImageAsync).toHaveBeenCalled();
    const firstCall = mockGenerateImageAsync.mock.calls[0][0];
    expect(firstCall.aspectRatio).toBe("9:16");
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

  it("stores canvas size in generated slide content", async () => {
    setupHappyPath();
    await generateAIDraft(
      buildMockInput({
        canvasWidth: 1024,
        canvasHeight: 768,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const firstInsertPayload = mockAddSlideToDeck.mock.calls[0][0] as {
      slideContent: { canvas?: { preset?: string; width: number; height: number } };
    };
    expect(firstInsertPayload.slideContent.canvas).toEqual({
      preset: "4:3",
      width: 1024,
      height: 768,
    });
  });

  it("stores image prompt and model id in generated image elements", async () => {
    setupHappyPath();
    mockGenerateSlide.mockImplementation(({ imageUrl }: { imageUrl?: string | null }) => ({
      slideContent: {
        elements: [
          {
            id: "img-1",
            type: "image",
            x: 0,
            y: 0,
            width: 640,
            height: 360,
            src: imageUrl || "https://cdn.example.com/fallback.jpg",
            alt: "Generated image",
          },
        ],
        background: { fill: "#000000" },
      },
      warnings: [],
    }));

    await generateAIDraft(
      buildMockInput({
        numSlides: 1,
        referenceImageUrls: ["/uploads/reference-seed.jpg"],
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const firstInsertPayload = mockAddSlideToDeck.mock.calls[0][0] as {
      slideContent: { elements: Array<Record<string, unknown>> };
    };
    const firstImage = firstInsertPayload.slideContent.elements.find((element) => element.type === "image");
    expect(firstImage).toBeDefined();
    expect(firstImage?.imagePrompt).toContain("test image 1");
    expect(firstImage?.imageModelId).toBe("flux-2.0");
    expect(firstImage?.imageReferenceUrls).toEqual(["/uploads/reference-seed.jpg"]);
  });

  it("builds slide notes from the saved presentation note and derives visible slide text from the same chunk", async () => {
    setupHappyPath();
    const customArticleText = [
      "คู่มือ tummy time สำหรับทารก",
      "1. เริ่มต้นอย่างอ่อนโยน",
      "เริ่มจากช่วงเวลาสั้น ๆ บนพื้นราบมั่นคง ใช้ผ้ารองนุ่มพอดี",
      "2. สร้างความมั่นใจ",
      "อยู่ระดับสายตา พูดคุย และยิ้มให้ลูกเพื่อเพิ่มความมั่นใจ",
    ].join("\n\n");
    mockCallLLMStructured.mockResolvedValue({
      data: [
        {
          templateId: "hero_center",
          title: "เริ่ม tummy time",
          body: [
            "ทำบนพื้นราบมั่นคง",
            "ใช้ผ้ารองนุ่มพอดี",
            "อยู่ระดับสายตาและยิ้มให้ลูก",
          ],
          notes: "เริ่มจากช่วงเวลาสั้น ๆ",
          graphicCategory: "Business",
          imagePromptKeywords: "thai baby tummy time",
        },
      ],
      tokensUsed: 300,
      creditsUsed: 10,
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 1,
        prompt: "tummy time",
        language: "th",
        useCustomArticle: true,
        customArticleText,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const savedNotes = (mockAddSlideToDeck.mock.calls[0]?.[0] as { notes: string }).notes;
    expect(savedNotes).toContain("คู่มือ tummy time สำหรับทารก");
    expect(savedNotes).toContain("เริ่มจากช่วงเวลาสั้น ๆ");
    const firstLayoutCall = mockGenerateSlide.mock.calls[0]?.[0] as { slideData: { body: string[]; title: string } };
    expect(firstLayoutCall.slideData.title).toContain("tummy time");
    expect(savedNotes).toContain("บนพื้นราบมั่นคง");
    expect(firstLayoutCall.slideData.body.some((line) => line.includes("เริ่มจากช่วงเวลาสั้น ๆ"))).toBe(true);
  });

  it("repairs sparse draft slide text from the slide note before rendering", () => {
    const repaired = normalizeSlideHierarchy({
      templateId: "hero_center",
      title: "Safe sleep environment",
      body: ["Place the baby on their back to sleep."],
      notes: [
        "Place the baby on their back to sleep.",
        "Use a firm mattress with no pillows or loose blankets.",
        "Keep the room calm and free from soft items.",
      ].join("\n"),
      graphicCategory: "Health",
      imagePromptKeywords: "safe sleep baby room",
    });

    expect(repaired.body.some((line: string) => line.includes("Place the baby on their back to sleep"))).toBe(true);
    expect(repaired.body.some((line: string) => line.includes("Use a firm mattress with no pillows or loose blankets"))).toBe(true);
    expect(repaired.notes).toContain("Keep the room calm and free from soft items");
  });

  it("preserves canonical article slide notes and strips markdown before saving them to the deck", async () => {
    setupHappyPath();
    const customArticleText = [
      "# เริ่มต้นให้ลูกน้อยกินผลไม้",
      "## ส่วนที่ 1",
      "**ช่วงเวลาที่เหมาะสม** เริ่มเมื่ออายุประมาณ 6 เดือนและพร้อมนั่งได้เอง",
      "## ส่วนที่ 2",
      "สังเกตอาการแพ้และเริ่มจากผลไม้ทีละชนิดในปริมาณน้อย",
    ].join("\n\n");
    mockCallLLMStructured.mockResolvedValue({
      data: [
        {
          templateId: "hero_center",
          title: "เริ่มต้นให้ลูกน้อยกินผลไม้",
          body: ["เริ่มเมื่ออายุประมาณ 6 เดือน"],
          notes: "เริ่มเมื่ออายุประมาณ 6 เดือน",
          graphicCategory: "Health",
          imagePromptKeywords: "baby fruit feeding",
        },
      ],
      tokensUsed: 320,
      creditsUsed: 11,
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 1,
        prompt: "fruit feeding",
        language: "th",
        useCustomArticle: true,
        customArticleText,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const savedNotes = (mockAddSlideToDeck.mock.calls[0]?.[0] as { notes: string }).notes;
    expect(savedNotes).toContain("ส่วนที่ 1");
    expect(savedNotes).toContain("สังเกตอาการแพ้");
    expect(savedNotes).not.toContain("**");
    expect(savedNotes).not.toContain("##");
  });

  it("does not re-expand dense slides from notes when they are already near layout capacity", () => {
    const original = {
      templateId: "hero_center" as const,
      title: "เริ่มต้นให้ลูกน้อยกินผลไม้",
      body: [
        "เริ่มเมื่ออายุประมาณ 6 เดือนและพร้อมนั่งได้เองโดยมีการพยุงศีรษะที่มั่นคง",
        "เริ่มจากผลไม้ทีละชนิดในปริมาณน้อยเพื่อสังเกตอาการแพ้และการยอมรับรสชาติ",
        "หลีกเลี่ยงการเติมน้ำตาล เกลือ หรือน้ำผึ้งในอาหารของทารกช่วงแรก",
        "เฝ้าสังเกตอาการผิดปกติหลังรับประทานและเว้นช่วงก่อนทดลองชนิดใหม่",
      ],
      sections: [
        {
          heading: "ข้อควรระวัง",
          details: [
            "เลือกเนื้อสัมผัสที่เหมาะกับวัยและบดละเอียดพอ",
            "ให้ทีละอย่างและจดบันทึกอาการที่เกิดขึ้น",
          ],
        },
        {
          heading: "สิ่งที่ควรทำต่อ",
          details: [
            "ปรึกษากุมารแพทย์หากมีประวัติแพ้อาหารในครอบครัว",
            "เพิ่มปริมาณอย่างค่อยเป็นค่อยไปตามการตอบสนองของลูก",
          ],
        },
      ],
      notes: [
        "เริ่มต้นให้ลูกน้อยกินผลไม้",
        "เริ่มเมื่ออายุประมาณ 6 เดือนและพร้อมนั่งได้เองโดยมีการพยุงศีรษะที่มั่นคง",
        "เริ่มจากผลไม้ทีละชนิดในปริมาณน้อยเพื่อสังเกตอาการแพ้และการยอมรับรสชาติ",
        "หลีกเลี่ยงการเติมน้ำตาล เกลือ หรือน้ำผึ้งในอาหารของทารกช่วงแรก",
        "เฝ้าสังเกตอาการผิดปกติหลังรับประทานและเว้นช่วงก่อนทดลองชนิดใหม่",
        "ควรให้ผู้ดูแลทุกคนใช้แนวทางเดียวกันและติดตามอาการอย่างต่อเนื่อง",
      ].join("\n"),
      markdownHierarchy: [
        { level: "body" as const, text: "เริ่มเมื่ออายุประมาณ 6 เดือนและพร้อมนั่งได้เองโดยมีการพยุงศีรษะที่มั่นคง" },
        { level: "body" as const, text: "เริ่มจากผลไม้ทีละชนิดในปริมาณน้อยเพื่อสังเกตอาการแพ้และการยอมรับรสชาติ" },
        { level: "body" as const, text: "หลีกเลี่ยงการเติมน้ำตาล เกลือ หรือน้ำผึ้งในอาหารของทารกช่วงแรก" },
        { level: "body" as const, text: "เฝ้าสังเกตอาการผิดปกติหลังรับประทานและเว้นช่วงก่อนทดลองชนิดใหม่" },
        { level: "h2" as const, text: "ข้อควรระวัง" },
        { level: "body" as const, text: "เลือกเนื้อสัมผัสที่เหมาะกับวัยและบดละเอียดพอ" },
        { level: "body" as const, text: "ให้ทีละอย่างและจดบันทึกอาการที่เกิดขึ้น" },
        { level: "h2" as const, text: "สิ่งที่ควรทำต่อ" },
      ],
      graphicCategory: "Health" as const,
      imagePromptKeywords: "baby fruit feeding guidance",
    };

    const normalized = normalizeSlideHierarchy(original);

    expect(normalized.body).toEqual(original.body);
    expect(normalized.sections).toEqual(original.sections);
    expect(normalized.body.some((line) => line.includes("ผู้ดูแลทุกคนใช้แนวทางเดียวกัน"))).toBe(false);
  });

  it("rebuilds a blank first slide with a visible local DSL fallback instead of persisting an empty canvas", async () => {
    setupHappyPath();
    mockCallLLMStructured.mockResolvedValue({
      data: [
        {
          templateId: "split_right_image",
          title: "Slide one",
          body: [
            "The opening slide should have an image and supporting copy.",
            "It should never be persisted as an empty canvas.",
          ],
          notes: "Opening slide copy for the deck.",
          graphicCategory: "Business",
          imagePromptKeywords: "opening slide visual",
        },
      ],
      tokensUsed: 120,
      creditsUsed: 4,
    });

    mockGenerateSlide
      .mockImplementationOnce(() => ({
        slideContent: {
          elements: [
            {
              id: "bg-1",
              type: "rect",
              x: 0,
              y: 0,
              width: 9999,
              height: 9999,
              fill: "#ffffff",
            },
          ],
        },
        warnings: [],
      }))
      .mockImplementationOnce(({ slideData }: { slideData: { title: string; componentRecipeId?: string } }) => ({
        slideContent: {
          elements: [
            {
              id: "bg-2",
              type: "rect",
              x: 0,
              y: 0,
              width: 9999,
              height: 9999,
              fill: "#ffffff",
            },
            {
              id: "body-1",
              type: "text",
              x: 100,
              y: 160,
              width: 760,
              height: 120,
              text: slideData.title,
              color: "#111827",
            },
          ],
        },
        warnings: [],
      }));

    await generateAIDraft(
      buildMockInput({ numSlides: 1 }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    expect(mockGenerateSlide).toHaveBeenCalledTimes(1);

    const firstInsertPayload = mockAddSlideToDeck.mock.calls[0][0] as {
      slideContent: {
        elements: Array<{ type: string; text?: string }>;
        aiDesign?: { mode?: string; fallbackHistory?: Array<{ to?: string; reason?: string }> };
      };
    };
    expect(firstInsertPayload.slideContent.elements.some((element) => element.type === "text")).toBe(true);
    expect(firstInsertPayload.slideContent.aiDesign?.mode).toBe("llm_layout_dsl");
    expect(firstInsertPayload.slideContent.aiDesign?.fallbackHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        to: "llm_layout_dsl_local_fallback",
        reason: expect.stringMatching(/local fallback composition|did not consume the resolved media URL/i),
      }),
    ]));
  });
});

describe("generateAIDraft - error handling", () => {
  it("credit pre-check failure stops pipeline", async () => {
    setupHappyPath();
    mockHasEnoughCredits.mockResolvedValue(false);

    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
    expect(mockCallLLMStructured).not.toHaveBeenCalled();

    const progressCalls = mockRedisSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"),
    );
    const lastProgress = JSON.parse(progressCalls[progressCalls.length - 1][1] as string);
    expect(lastProgress.error.code).toBe("PRESENTATION_AI_INSUFFICIENT_CREDITS");

    const delCall = mockRedisDel.mock.calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_lock:"),
    );
    expect(delCall).toBeDefined();
  });

  it("reports slide validation failures as save-time errors after media has completed", async () => {
    setupHappyPath();
    mockAddSlideToDeck.mockRejectedValueOnce(new mockPresentationServiceError(
      "PRESENTATION_VALIDATION_FAILED",
      "PRESENTATION_VALIDATION_FAILED: slideContent failed schema validation",
      {
        issueCount: 2,
        issueSummaries: [
          { path: "aiDesign.selectionReason", code: "too_big", message: "String must contain at most 512 character(s)" },
          { path: "elements.3.color", code: "invalid_string", message: "Invalid color value" },
        ],
      },
    ));

    await generateAIDraft(buildMockInput({ numSlides: 1 }), buildMockActor(), "test-token", "task-123");

    const progressCalls = mockRedisSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"),
    );
    const lastProgress = JSON.parse(progressCalls[progressCalls.length - 1][1] as string);

    expect(lastProgress.phaseLabel).toBe("Saving slides failed");
    expect(lastProgress.phaseDetail).toContain("Media completed for 1/1 slide(s)");
    expect(lastProgress.error.message).toContain("saving slide 1 failed validation");
    expect(lastProgress.error.message).toContain("aiDesign.selectionReason");
    expect(lastProgress.error.message).toContain("elements.3.color");
  });
});

describe("generateAIDraft - cancellation", () => {
  it("stops when cancel key is set before Phase 2", async () => {
    setupHappyPath();
    let cancelChecks = 0;
    mockRedisGet.mockImplementation(async (key: string) => {
      if (key.includes("ai_draft_cancel:")) {
        cancelChecks += 1;
        return cancelChecks >= 2 ? "1" : null;
      }
      if (key.includes("ai_draft_lock:")) {
        return "task-123";
      }
      return null;
    });

    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    expect(mockCallLLMStructured).not.toHaveBeenCalled();

    const progressCalls = mockRedisSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"),
    );
    const lastProgress = JSON.parse(progressCalls[progressCalls.length - 1][1] as string);
    expect(lastProgress.cancelled).toBe(true);
    expect(lastProgress.completed).toBe(true);
  });

  it("stops while waiting for slide planning after cancel is requested", async () => {
    setupHappyPath();
    let cancelChecks = 0;
    mockRedisGet.mockImplementation(async (key: string) => {
      if (key.includes("ai_draft_cancel:")) {
        cancelChecks += 1;
        return cancelChecks >= 3 ? "1" : null;
      }
      if (key.includes("ai_draft_lock:")) {
        return "task-123";
      }
      return null;
    });
    mockCallLLMStructured.mockImplementation(
      () => new Promise(() => {}) as Promise<never>,
    );

    const runPromise = generateAIDraft(
      buildMockInput(),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    await vi.advanceTimersByTimeAsync(4000);
    await runPromise;

    const progressCalls = mockRedisSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"),
    );
    const lastProgress = JSON.parse(progressCalls[progressCalls.length - 1][1] as string);
    expect(lastProgress.cancelled).toBe(true);
    expect(lastProgress.completed).toBe(true);
  });

  it("stops while waiting for recipe compaction after slide planning has already finished", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockResolvedValue({
      id: "prompt-planner",
      name: "Prompt Planner",
      category: "prompt_enhancement",
      executionMode: "enhance-prompt",
      systemPrompt: "Plan slides from the prompt.",
    });
    let cancelChecks = 0;
    mockRedisGet.mockImplementation(async (key: string) => {
      if (key.includes("ai_draft_cancel:")) {
        cancelChecks += 1;
        return cancelChecks >= 3 ? "1" : null;
      }
      if (key.includes("ai_draft_lock:")) {
        return "task-123";
      }
      return null;
    });
    mockCallLLMStructured
      .mockResolvedValueOnce({
        data: [
          {
            templateId: "hero_center",
            title: "Intro",
            body: ["Intro point"],
            notes: "Intro note",
            graphicCategory: "Business",
            imagePromptKeywords: "intro visual",
          },
          {
            templateId: "split_right_image",
            componentRecipeId: "feature-highlights",
            title: "ลูกกินนมเร็วเกินไป",
            body: [
              "สรุปประเด็นสำคัญที่ยังยาวเกินจะลงเป็นการ์ดโดยตรง",
              "มีอาการแหวะนมหลังมื้อ",
              "ร้องงอแงเพราะอิ่มเร็วเกินไป",
            ],
            notes: "ต้อง compact เป็นบล็อกให้สั้นลง",
            graphicCategory: "Health",
            imagePromptKeywords: "feeding issues",
          },
        ],
        tokensUsed: 180,
        creditsUsed: 6,
      })
      .mockImplementationOnce(
        () => new Promise(() => {}) as Promise<never>,
      );

    const runPromise = generateAIDraft(
      buildMockInput({
        numSlides: 2,
        draftSkillId: "prompt-planner",
        articleSkillId: undefined,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    await vi.advanceTimersByTimeAsync(4000);
    await runPromise;

    const progressCalls = mockRedisSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"),
    );
    const lastProgress = JSON.parse(progressCalls[progressCalls.length - 1][1] as string);
    expect(lastProgress.cancelled).toBe(true);
    expect(lastProgress.completed).toBe(true);
    expect(progressCalls.some(([, value]) => JSON.parse(String(value)).phaseLabel.includes("Refining slide layouts"))).toBe(true);
  });

  it("refreshes progress heartbeat while waiting on a long recipe compaction call", async () => {
    setupHappyPath();
    process.env.AI_DRAFT_PROGRESS_HEARTBEAT_INTERVAL_MS = "5000";
    mockGetSkillByIdAsync.mockResolvedValue({
      id: "prompt-planner",
      name: "Prompt Planner",
      category: "prompt_enhancement",
      executionMode: "enhance-prompt",
      systemPrompt: "Plan slides from the prompt.",
    });
    let cancelChecks = 0;
    mockRedisGet.mockImplementation(async (key: string) => {
      if (key.includes("ai_draft_cancel:")) {
        cancelChecks += 1;
        return cancelChecks >= 14 ? "1" : null;
      }
      if (key.includes("ai_draft_lock:")) {
        return "task-123";
      }
      return null;
    });
    mockCallLLMStructured
      .mockResolvedValueOnce({
        data: [
          {
            templateId: "hero_center",
            title: "Intro",
            body: ["Intro point"],
            notes: "Intro note",
            graphicCategory: "Business",
            imagePromptKeywords: "intro visual",
          },
          {
            templateId: "split_right_image",
            componentRecipeId: "process-steps",
            title: "4 ขั้นตอนลดการแหวะ",
            body: [
              "ขั้นตอนแรกอธิบายยาวจนเกินกรอบ",
              "ขั้นตอนสองอธิบายยาวจนเกินกรอบ",
              "ขั้นตอนสามอธิบายยาวจนเกินกรอบ",
              "ขั้นตอนสี่อธิบายยาวจนเกินกรอบ",
            ],
            notes: "ต้อง compact ก่อนเข้า layout",
            graphicCategory: "Health",
            imagePromptKeywords: "feeding steps",
          },
        ],
        tokensUsed: 180,
        creditsUsed: 6,
      })
      .mockImplementationOnce(
        () => new Promise(() => {}) as Promise<never>,
      );

    try {
      const runPromise = generateAIDraft(
        buildMockInput({
          numSlides: 2,
          draftSkillId: "prompt-planner",
          articleSkillId: undefined,
        }),
        buildMockActor(),
        "test-token",
        "task-123",
      );

      await vi.advanceTimersByTimeAsync(15000);
      await runPromise;
    } finally {
      delete process.env.AI_DRAFT_PROGRESS_HEARTBEAT_INTERVAL_MS;
    }

    const progressCalls = mockRedisSet.mock.calls
      .filter((c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"))
      .map(([, value]) => JSON.parse(String(value)));
    const heartbeatCalls = progressCalls.filter((progress) => (
      progress.phaseLabel === "Refining slide layouts: 2/2"
      && progress.phaseDetail === "Compacting \"4 ขั้นตอนลดการแหวะ\" with process-steps (balanced)."
    ));
    expect(heartbeatCalls.length).toBeGreaterThanOrEqual(2);
    expect(heartbeatCalls.at(-1)?.updatedAt).not.toBe(heartbeatCalls[0]?.updatedAt);
  });
});

describe("generateAIDraft - long-running step budgets", () => {
  it("falls back after the per-slide compaction budget is exhausted", async () => {
    setupHappyPath();
    process.env.AI_DRAFT_RECIPE_COMPACTION_TIMEOUT_MS = "2000";
    process.env.AI_DRAFT_RECIPE_COMPACTION_TOTAL_TIMEOUT_MS = "2500";
    mockGetSkillByIdAsync.mockResolvedValue({
      id: "prompt-planner",
      name: "Prompt Planner",
      category: "prompt_enhancement",
      executionMode: "enhance-prompt",
      systemPrompt: "Plan slides from the prompt.",
    });
    mockCallLLMStructured
      .mockResolvedValueOnce({
        data: [
          {
            templateId: "hero_center",
            title: "Intro",
            body: ["Intro point"],
            notes: "Intro note",
            graphicCategory: "Business",
            imagePromptKeywords: "intro visual",
          },
          {
            templateId: "split_right_image",
            componentRecipeId: "process-steps",
            title: "4 ขั้นตอนลดการแหวะ",
            body: [
              "ขั้นตอนแรกอธิบายยาวจนเกินกรอบ",
              "ขั้นตอนสองอธิบายยาวจนเกินกรอบ",
              "ขั้นตอนสามอธิบายยาวจนเกินกรอบ",
              "ขั้นตอนสี่อธิบายยาวจนเกินกรอบ",
            ],
            notes: "ต้อง compact ก่อนเข้า layout",
            graphicCategory: "Health",
            imagePromptKeywords: "feeding steps",
          },
        ],
        tokensUsed: 180,
        creditsUsed: 6,
      })
      .mockImplementation(
        () => new Promise(() => {}) as Promise<never>,
      );

    try {
      const runPromise = generateAIDraft(
        buildMockInput({
          numSlides: 2,
          draftSkillId: "prompt-planner",
          articleSkillId: undefined,
        }),
        buildMockActor(),
        "test-token",
        "task-123",
      );
      await vi.advanceTimersByTimeAsync(5000);
      await runPromise;
    } finally {
      delete process.env.AI_DRAFT_RECIPE_COMPACTION_TIMEOUT_MS;
      delete process.env.AI_DRAFT_RECIPE_COMPACTION_TOTAL_TIMEOUT_MS;
    }

    expect(mockAddSlideToDeck).toHaveBeenCalledTimes(2);
    const progressCalls = mockRedisSet.mock.calls
      .filter((c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"))
      .map(([, value]) => JSON.parse(String(value)));
    expect(progressCalls.at(-1)?.completed).toBe(true);
  });
});

describe("generateAIDraft - concurrency control", () => {
  it("does not acquire Redis lock in service (router owns lock)", async () => {
    setupHappyPath();
    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    const lockCall = mockRedisSet.mock.calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_lock:"),
    );
    expect(lockCall).toBeUndefined();
  });

  it("stores userId in progress payload for ownership checks", async () => {
    setupHappyPath();
    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    const progressCalls = mockRedisSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_progress"),
    );
    const lastProgress = JSON.parse(progressCalls[progressCalls.length - 1][1] as string);
    expect(lastProgress.userId).toBe(1);
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
    mockExecuteWithFallback.mockResolvedValueOnce({
      type: "error",
      error: "fail",
      statusCode: 500,
    });

    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    const delCall = mockRedisDel.mock.calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_lock:"),
    );
    expect(delCall).toBeDefined();
  });

  it("does not release lock if another task owns it", async () => {
    setupHappyPath();
    mockRedisGet.mockImplementation(async (key: string) => {
      if (key.includes("ai_draft_lock:")) return "task-other";
      return null;
    });

    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    const delCall = mockRedisDel.mock.calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ai_draft_lock:"),
    );
    expect(delCall).toBeUndefined();
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

describe("resolvePendingMediaForDeck", () => {
  it("replaces a hero_center fallback image when resolved media arrives", async () => {
    const actor = buildMockActor();
    mockGetPresentationDeckDetail.mockResolvedValue({
      deck: { id: 1, version: 10 },
      slides: [
        {
          id: 10,
          deckId: 1,
          orderIndex: 0,
          version: 3,
          title: "Slide 1",
          notes: null,
          slideContent: {
            elements: [
              {
                id: "hero-fallback",
                type: "image",
                x: 0,
                y: 0,
                width: 960,
                height: 1200,
                src: "data:image/svg+xml,%3Csvg%3Efallback%3C/svg%3E",
                alt: "Slide 1",
              },
              { id: "hero-text", type: "text", x: 80, y: 160, width: 640, height: 120, text: "Slide 1", color: "#111827" },
            ],
            pendingMediaJobs: [
              {
                id: "pmj-hero-1",
                mediaType: "image",
                mediaTaskId: "hero-task-1",
                targetElementId: "hero-fallback",
                targetX: 0,
                targetY: 0,
                targetWidth: 960,
                targetHeight: 1200,
                status: "pending",
                createdAt: "2026-03-02T12:00:00.000Z",
              },
            ],
          },
        },
      ],
      assets: [],
    });
    mockGetTask.mockResolvedValue({
      id: "hero-task-1",
      status: "completed",
      resultUrl: "https://cdn.example.com/hero-1.jpg",
    });
    mockUpdateSlideInDeck.mockResolvedValue({ id: 10, version: 4 });

    const result = await resolvePendingMediaForDeck(
      { deckId: 1, maxJobs: 10 },
      actor,
      "test-token",
    );

    expect(result.jobsChecked).toBe(1);
    expect(result.jobsResolved).toBe(1);
    const payload = mockUpdateSlideInDeck.mock.calls[0]?.[0];
    expect(payload.slideContent.pendingMediaJobs).toBeUndefined();
    expect(payload.slideContent.elements[0]).toMatchObject({
      id: "hero-fallback",
      type: "image",
      src: "https://cdn.example.com/hero-1.jpg",
    });
  });

  it("replaces placeholder with resolved media and removes pending job", async () => {
    const actor = buildMockActor();
    mockGetPresentationDeckDetail.mockResolvedValue({
      deck: { id: 1, version: 10 },
      slides: [
        {
          id: 11,
          deckId: 1,
          orderIndex: 0,
          version: 3,
          title: "Slide A",
          notes: null,
          slideContent: {
            elements: [
              { id: "ph-1", type: "rect", x: 100, y: 120, width: 400, height: 260, fill: "#223" },
            ],
            pendingMediaJobs: [
              {
                id: "pmj-1",
                mediaType: "image",
                mediaTaskId: "task-1",
                targetElementId: "ph-1",
                targetX: 100,
                targetY: 120,
                targetWidth: 400,
                targetHeight: 260,
                status: "pending",
                createdAt: "2026-03-02T12:00:00.000Z",
              },
            ],
          },
        },
      ],
      assets: [],
    });
    mockGetTask.mockResolvedValue({
      id: "task-1",
      status: "completed",
      resultUrl: "https://cdn.example.com/resolved.jpg",
    });
    mockUpdateSlideInDeck.mockResolvedValue({ id: 11, version: 4 });

    const result = await resolvePendingMediaForDeck(
      { deckId: 1, maxJobs: 10 },
      actor,
      "test-token",
    );

    expect(result.jobsChecked).toBe(1);
    expect(result.jobsResolved).toBe(1);
    expect(result.jobsRemaining).toBe(0);
    expect(mockUpdateSlideInDeck).toHaveBeenCalledTimes(1);

    const payload = mockUpdateSlideInDeck.mock.calls[0]?.[0];
    expect(payload.slideContent.pendingMediaJobs).toBeUndefined();
    expect(payload.slideContent.elements[0]).toMatchObject({
      id: "ph-1",
      type: "image",
      src: "https://cdn.example.com/resolved.jpg",
    });
  });

  it("keeps targetElementId matching deterministic when multiple image placeholders exist", async () => {
    const actor = buildMockActor();
    mockGetPresentationDeckDetail.mockResolvedValue({
      deck: { id: 1, version: 10 },
      slides: [
        {
          id: 17,
          deckId: 1,
          orderIndex: 0,
          version: 3,
          title: "Dual image layout",
          notes: null,
          slideContent: {
            elements: [
              { id: "img-left", type: "image", x: 80, y: 120, width: 320, height: 240, src: "", alt: "Left image" },
              { id: "img-right", type: "image", x: 450, y: 120, width: 320, height: 240, src: "", alt: "Right image" },
            ],
            pendingMediaJobs: [
              {
                id: "pmj-left",
                mediaType: "image",
                mediaTaskId: "task-left",
                targetElementId: "img-left",
                targetX: 80,
                targetY: 120,
                targetWidth: 320,
                targetHeight: 240,
                status: "pending",
                createdAt: "2026-03-02T12:00:00.000Z",
              },
              {
                id: "pmj-right",
                mediaType: "image",
                mediaTaskId: "task-right",
                targetElementId: "img-right",
                targetX: 450,
                targetY: 120,
                targetWidth: 320,
                targetHeight: 240,
                status: "pending",
                createdAt: "2026-03-02T12:00:00.000Z",
              },
            ],
          },
        },
      ],
      assets: [],
    });
    mockGetTask.mockImplementation(async (taskId: string) => ({
      id: taskId,
      status: "completed",
      resultUrl: taskId === "task-left"
        ? "https://cdn.example.com/left.jpg"
        : "https://cdn.example.com/right.jpg",
    }));
    mockUpdateSlideInDeck.mockResolvedValue({ id: 17, version: 4 });

    const result = await resolvePendingMediaForDeck(
      { deckId: 1, maxJobs: 10 },
      actor,
      "test-token",
    );

    expect(result.jobsChecked).toBe(2);
    expect(result.jobsResolved).toBe(2);
    const payload = mockUpdateSlideInDeck.mock.calls[0]?.[0];
    expect(payload.slideContent.pendingMediaJobs).toBeUndefined();
    expect(payload.slideContent.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "img-left",
        type: "image",
        src: "https://cdn.example.com/left.jpg",
      }),
      expect.objectContaining({
        id: "img-right",
        type: "image",
        src: "https://cdn.example.com/right.jpg",
      }),
    ]));
  });

  it("extends slide duration when a pending video resolves longer than the current slide timing", async () => {
    const actor = buildMockActor();
    mockGetPresentationDeckDetail.mockResolvedValue({
      deck: { id: 1, version: 10 },
      slides: [
        {
          id: 12,
          deckId: 1,
          orderIndex: 0,
          version: 3,
          title: "Slide B",
          notes: null,
          slideContent: {
            durationMs: 5000,
            elements: [
              { id: "ph-v1", type: "rect", x: 0, y: 0, width: 640, height: 360, fill: "#111" },
            ],
            pendingMediaJobs: [
              {
                id: "pmj-v1",
                mediaType: "video",
                mediaTaskId: "video-task-1",
                targetElementId: "ph-v1",
                targetX: 0,
                targetY: 0,
                targetWidth: 640,
                targetHeight: 360,
                status: "processing",
                createdAt: "2026-03-02T12:00:00.000Z",
              },
            ],
          },
        },
      ],
      assets: [],
    });
    mockGetTask.mockResolvedValue({
      id: "video-task-1",
      status: "completed",
      resultUrl: "https://cdn.example.com/resolved.mp4",
      resultData: {
        response: {
          data: [{ url: "https://cdn.example.com/resolved.mp4", durationSeconds: 7.6 }],
        },
      },
    });
    mockUpdateSlideInDeck.mockResolvedValue({ id: 12, version: 4 });

    const result = await resolvePendingMediaForDeck(
      { deckId: 1, maxJobs: 10 },
      actor,
      "test-token",
    );

    expect(result.jobsChecked).toBe(1);
    expect(result.jobsResolved).toBe(1);
    const payload = mockUpdateSlideInDeck.mock.calls[0]?.[0];
    expect(payload.slideContent.durationMs).toBe(7600);
    expect(payload.slideContent.pendingMediaJobs).toBeUndefined();
    expect(payload.slideContent.elements[0]).toMatchObject({
      id: "ph-v1",
      type: "video",
      src: "https://cdn.example.com/resolved.mp4",
    });
  });

  it("updates component video slots when deferred media resolves inside a component recipe", async () => {
    const actor = buildMockActor();
    mockGetPresentationDeckDetail.mockResolvedValue({
      deck: { id: 1, version: 10 },
      slides: [
        {
          id: 13,
          deckId: 1,
          orderIndex: 0,
          version: 3,
          title: "Slide C",
          notes: null,
          slideContent: {
            elements: [],
            components: [
              {
                id: "cmp-1",
                componentId: "video-spotlight",
                componentType: "built-in",
                definitionRevision: 1,
                slotBindings: [
                  { slotId: "headline", type: "text", text: "Slide C" },
                  { slotId: "clip", type: "video", src: "", poster: "", title: "Slide C" },
                ],
                fallbackElements: [
                  { id: "cmp-1::clip-frame", type: "rect", x: 200, y: 120, width: 420, height: 320, fill: "#112233" },
                  { id: "cmp-1::clip-icon", type: "text", x: 330, y: 230, width: 150, height: 40, text: "VIDEO", color: "#ffffff" },
                  { id: "cmp-1::clip-placeholder", type: "text", x: 260, y: 300, width: 300, height: 40, text: "Drop or pick a video clip", color: "#ffffff" },
                ],
              },
            ],
            pendingMediaJobs: [
              {
                id: "pmj-c1",
                mediaType: "video",
                mediaTaskId: "video-task-2",
                targetElementId: "cmp-1::clip-frame",
                targetX: 200,
                targetY: 120,
                targetWidth: 420,
                targetHeight: 320,
                status: "processing",
                createdAt: "2026-03-02T12:00:00.000Z",
              },
            ],
          },
        },
      ],
      assets: [],
    });
    mockGetTask.mockResolvedValue({
      id: "video-task-2",
      status: "completed",
      resultUrl: "https://cdn.example.com/component.mp4",
      resultData: {
        response: {
          data: [{ url: "https://cdn.example.com/component.mp4", durationSeconds: 6.2 }],
        },
      },
    });
    mockUpdateSlideInDeck.mockResolvedValue({ id: 13, version: 4 });

    const result = await resolvePendingMediaForDeck(
      { deckId: 1, maxJobs: 10 },
      actor,
      "test-token",
    );

    expect(result.jobsChecked).toBe(1);
    expect(result.jobsResolved).toBe(1);
    const payload = mockUpdateSlideInDeck.mock.calls.at(-1)?.[0];
    expect(payload.slideContent.pendingMediaJobs).toBeUndefined();
    expect(payload.slideContent.components[0].slotBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotId: "clip",
          type: "video",
          src: "https://cdn.example.com/component.mp4",
        }),
      ]),
    );
    expect(payload.slideContent.components[0].fallbackElements.some((element: any) => (
      element.type === "video" && element.id === "cmp-1::clip-frame" && element.src === "https://cdn.example.com/component.mp4"
    ))).toBe(true);
    expect(payload.slideContent.components[0].fallbackElements.some((element: any) => (
      typeof element.id === "string" && element.id.endsWith("::clip-placeholder")
    ))).toBe(false);
  });

  it("updates profile-summary image slots when deferred media resolves inside a component recipe", async () => {
    const actor = buildMockActor();
    mockGetPresentationDeckDetail.mockResolvedValue({
      deck: { id: 1, version: 10 },
      slides: [
        {
          id: 14,
          deckId: 1,
          orderIndex: 0,
          version: 3,
          title: "Speaker Bio",
          notes: null,
          slideContent: {
            elements: [],
            components: [
              {
                id: "cmp-profile",
                componentId: "profile-summary",
                componentType: "built-in",
                definitionRevision: 1,
                slotBindings: [
                  { slotId: "name", type: "text", text: "Speaker Bio" },
                  { slotId: "portrait", type: "image", src: "", alt: "Speaker Bio" },
                ],
                fallbackElements: [
                  { id: "cmp-profile::portrait-frame", type: "rect", x: 180, y: 140, width: 200, height: 180, fill: "#223344" },
                  { id: "cmp-profile::portrait-placeholder", type: "text", x: 220, y: 210, width: 120, height: 40, text: "Photo", color: "#ffffff" },
                ],
              },
            ],
            pendingMediaJobs: [
              {
                id: "pmj-p1",
                mediaType: "image",
                mediaTaskId: "image-task-2",
                targetElementId: "cmp-profile::portrait-frame",
                targetX: 180,
                targetY: 140,
                targetWidth: 200,
                targetHeight: 180,
                status: "processing",
                createdAt: "2026-03-02T12:00:00.000Z",
              },
            ],
          },
        },
      ],
      assets: [],
    });
    mockGetTask.mockResolvedValue({
      id: "image-task-2",
      status: "completed",
      resultUrl: "https://cdn.example.com/profile.jpg",
    });
    mockUpdateSlideInDeck.mockResolvedValue({ id: 14, version: 4 });

    const result = await resolvePendingMediaForDeck(
      { deckId: 1, maxJobs: 10 },
      actor,
      "test-token",
    );

    expect(result.jobsChecked).toBe(1);
    expect(result.jobsResolved).toBe(1);
    const payload = mockUpdateSlideInDeck.mock.calls.at(-1)?.[0];
    expect(payload.slideContent.pendingMediaJobs).toBeUndefined();
    expect(payload.slideContent.components[0].slotBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotId: "portrait",
          type: "image",
          src: "https://cdn.example.com/profile.jpg",
        }),
      ]),
    );
    expect(payload.slideContent.components[0].fallbackElements.some((element: any) => (
      element.type === "image" && element.id === "cmp-profile::portrait-frame" && element.src === "https://cdn.example.com/profile.jpg"
    ))).toBe(true);
    expect(payload.slideContent.components[0].fallbackElements.some((element: any) => (
      typeof element.id === "string" && element.id.endsWith("::portrait-placeholder")
    ))).toBe(false);
  });

  it("updates framed-image-story image slots when deferred media resolves inside a component recipe", async () => {
    const actor = buildMockActor();
    mockGetPresentationDeckDetail.mockResolvedValue({
      deck: { id: 1, version: 10 },
      slides: [
        {
          id: 15,
          deckId: 1,
          orderIndex: 0,
          version: 3,
          title: "Zero Waste Story",
          notes: null,
          slideContent: {
            elements: [],
            components: [
              {
                id: "cmp-story",
                componentId: "framed-image-story",
                componentType: "built-in",
                definitionRevision: 1,
                slotBindings: [
                  { slotId: "headline", type: "text", text: "Zero Waste Story" },
                  { slotId: "photo", type: "image", src: "", alt: "Zero Waste Story" },
                ],
                fallbackElements: [
                  { id: "cmp-story::photo-frame", type: "rect", x: 120, y: 112, width: 424, height: 420, fill: "#dde7f0" },
                  { id: "cmp-story::photo-placeholder", type: "text", x: 180, y: 300, width: 300, height: 40, text: "Drop or pick a story image", color: "#334155" },
                ],
              },
            ],
            pendingMediaJobs: [
              {
                id: "pmj-s1",
                mediaType: "image",
                mediaTaskId: "image-task-3",
                targetElementId: "cmp-story::photo-frame",
                targetX: 120,
                targetY: 112,
                targetWidth: 424,
                targetHeight: 420,
                status: "processing",
                createdAt: "2026-03-02T12:00:00.000Z",
              },
            ],
          },
        },
      ],
      assets: [],
    });
    mockGetTask.mockResolvedValue({
      id: "image-task-3",
      status: "completed",
      resultUrl: "https://cdn.example.com/story.jpg",
    });
    mockUpdateSlideInDeck.mockResolvedValue({ id: 15, version: 4 });

    const result = await resolvePendingMediaForDeck(
      { deckId: 1, maxJobs: 10 },
      actor,
      "test-token",
    );

    expect(result.jobsChecked).toBe(1);
    expect(result.jobsResolved).toBe(1);
    const payload = mockUpdateSlideInDeck.mock.calls.at(-1)?.[0];
    expect(payload.slideContent.pendingMediaJobs).toBeUndefined();
    expect(payload.slideContent.components[0].slotBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotId: "photo",
          type: "image",
          src: "https://cdn.example.com/story.jpg",
        }),
      ]),
    );
    expect(payload.slideContent.components[0].fallbackElements.some((element: any) => (
      element.type === "image" && element.id === "cmp-story::photo-frame" && element.src === "https://cdn.example.com/story.jpg"
    ))).toBe(true);
    expect(payload.slideContent.components[0].fallbackElements.some((element: any) => (
      typeof element.id === "string" && element.id.endsWith("::photo-placeholder")
    ))).toBe(false);
  });

  it("updates both photo-collage image slots when deferred media resolves across multiple targets", async () => {
    const actor = buildMockActor();
    mockGetPresentationDeckDetail.mockResolvedValue({
      deck: { id: 1, version: 10 },
      slides: [
        {
          id: 16,
          deckId: 1,
          orderIndex: 0,
          version: 3,
          title: "Lookbook",
          notes: null,
          slideContent: {
            elements: [],
            components: [
              {
                id: "cmp-collage",
                componentId: "photo-collage",
                componentType: "built-in",
                definitionRevision: 1,
                slotBindings: [
                  { slotId: "headline", type: "text", text: "Lookbook" },
                  { slotId: "primary-photo", type: "image", src: "", alt: "Primary photo" },
                  { slotId: "secondary-photo", type: "image", src: "", alt: "Secondary photo" },
                ],
                fallbackElements: [
                  { id: "cmp-collage::primary-frame", type: "rect", x: 112, y: 152, width: 494, height: 360, fill: "#dde7f0" },
                  { id: "cmp-collage::primary-placeholder", type: "text", x: 216, y: 318, width: 286, height: 40, text: "Drop a primary image", color: "#334155" },
                  { id: "cmp-collage::secondary-frame", type: "rect", x: 864, y: 108, width: 248, height: 198, fill: "#e9d5ff" },
                  { id: "cmp-collage::secondary-placeholder", type: "text", x: 900, y: 190, width: 176, height: 34, text: "Detail image", color: "#6d28d9" },
                ],
              },
            ],
            pendingMediaJobs: [
              {
                id: "pmj-collage-1",
                mediaType: "image",
                mediaTaskId: "image-task-4",
                targetElementId: "cmp-collage::primary-frame",
                targetX: 112,
                targetY: 152,
                targetWidth: 494,
                targetHeight: 360,
                status: "processing",
                createdAt: "2026-03-02T12:00:00.000Z",
              },
              {
                id: "pmj-collage-2",
                mediaType: "image",
                mediaTaskId: "image-task-4",
                targetElementId: "cmp-collage::secondary-frame",
                targetX: 864,
                targetY: 108,
                targetWidth: 248,
                targetHeight: 198,
                status: "processing",
                createdAt: "2026-03-02T12:00:00.000Z",
              },
            ],
          },
        },
      ],
      assets: [],
    });
    mockGetTask.mockResolvedValue({
      id: "image-task-4",
      status: "completed",
      resultUrl: "https://cdn.example.com/collage.jpg",
    });
    mockUpdateSlideInDeck.mockResolvedValue({ id: 16, version: 4 });

    const result = await resolvePendingMediaForDeck(
      { deckId: 1, maxJobs: 10 },
      actor,
      "test-token",
    );

    expect(result.jobsChecked).toBe(2);
    expect(result.jobsResolved).toBe(2);
    const payload = mockUpdateSlideInDeck.mock.calls.at(-1)?.[0];
    expect(payload.slideContent.pendingMediaJobs).toBeUndefined();
    expect(payload.slideContent.components[0].slotBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slotId: "primary-photo", type: "image", src: "https://cdn.example.com/collage.jpg" }),
        expect.objectContaining({ slotId: "secondary-photo", type: "image", src: "https://cdn.example.com/collage.jpg" }),
      ]),
    );
    expect(payload.slideContent.components[0].fallbackElements.filter((element: any) => (
      element.type === "image"
      && (element.id === "cmp-collage::primary-frame" || element.id === "cmp-collage::secondary-frame")
      && element.src === "https://cdn.example.com/collage.jpg"
    ))).toHaveLength(2);
  });
});
