import { describe, it, expect, vi, beforeEach } from "vitest";

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
  finalizeSlideContentAfterRelayout,
  finalizeSlideContentAfterRepair,
  repairSlideFromSavedNote,
  relayoutExistingSlide,
  resolvePendingMediaForDeck,
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
  mockGenerateSlide.mockReturnValue({ slideContent: MOCK_SLIDE_CONTENT, warnings: [] });
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

  it("uses slide notes to fall back to a plain template when block recipes are too dense", () => {
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

    expect(capturedLayoutInput.slideData.componentRecipeId).toBeUndefined();
    expect(capturedLayoutInput.slideData.notes).toContain("บทความนี้อธิบายบริบทของพ่อแม่หรือผู้ดูแล");
    expect(capturedLayoutInput.slideData.body.some((line: string) => line.includes("พ่อแม่หรือผู้ดูแลเด็กวัย 4 ถึง 6 เดือน"))).toBe(true);
    expect(output.warnings.some((warning) => warning.includes('Skipped component recipe "process-steps"'))).toBe(true);
    expect(output.warnings.some((warning) => warning.includes("fell back to a plain template"))).toBe(true);
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

    expect(capturedLayoutInput.slideData.componentRecipeId).toBeUndefined();
    expect(capturedLayoutInput.slideData.templateId).not.toBe("feature_boxes_right");
    expect(output.slideContent.elements.some((element) => (
      element.type === "image"
      && element.id === "cmp-image"
      && element.src === "https://cdn.example.com/faq-hero.jpg"
    ))).toBe(true);
    expect(output.warnings.some((warning) => warning.includes('Skipped component recipe "feature-highlights"'))).toBe(true);
    expect(output.warnings.some((warning) => warning.includes("fell back to a plain template"))).toBe(true);
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

describe("repairSlideFromSavedNote", () => {
  it("drops incompatible aiDesign metadata from auto layout output instead of surfacing schema validation", () => {
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
    expect(stabilized.aiDesign).toBeUndefined();
    expect(warnings).toContain("Auto layout omitted incompatible AI metadata to satisfy schema validation.");
  });

  it("drops incompatible aiDesign metadata instead of returning invalid slide content", () => {
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
    expect(stabilized.aiDesign).toBeUndefined();
    expect(warnings).toContain("Regenerated slide content omitted incompatible AI metadata to satisfy schema validation.");
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
            src: input.imageUrl,
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
    expect(mockGenerateSlide).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: "https://cdn.example.com/image.jpg",
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
    expect(result.warnings).toContain("Dense slide note detected; prioritized full text coverage over block-based layout.");
    expect(result.slideContent.aiDesign?.source).toBe("draft-with-ai");
    expect(result.slideContent.aiDesign?.narrative?.title).toBe("ขั้นตอนปฏิบัติ / เคล็ดลับ");
    expect(result.slideContent.aiDesign?.narrative?.body.join("\n")).toContain("สร้างกิจวัตรก่อนนอน");
    const generatedImage = result.slideContent.elements.find((element) => element.type === "image");
    expect(generatedImage?.type).toBe("image");
    if (generatedImage?.type === "image") {
      expect(generatedImage.src).toBe("https://cdn.example.com/image.jpg");
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

    expect(mockExecuteWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
      }),
    );
  });

  it("normalizes provider-qualified skill models before routing text generation", async () => {
    setupHappyPath();
    mockGetSkillByIdAsync.mockResolvedValueOnce({
      id: "parenting-article-writer",
      name: "Parenting Article Writer",
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
      return [];
    });

    await generateAIDraft(
      buildMockInput({ articleSkillId: "parenting-article-writer" }),
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

  it("assigns infographic-grid from framework slides with four balanced sections", async () => {
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
          title: "The zero waste framework",
          body: ["Four pillars for sustainable operations"],
          sections: [
            { heading: "Avoid", details: ["Reduce unnecessary inputs"] },
            { heading: "Reuse", details: ["Extend the life of materials"] },
            { heading: "Recycle", details: ["Recover value from waste"] },
            { heading: "Measure", details: ["Track impact and iterate"] },
          ],
          notes: "Framework overview with four balanced categories.",
          graphicCategory: "Education",
          imagePromptKeywords: "framework infographic",
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
    expect(secondSlideCall.slideData.componentRecipeId).toBe("infographic-grid");
  });

  it("assigns photo-collage from editorial gallery slides", async () => {
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
    expect(secondSlideCall.slideData.componentRecipeId).toBe("photo-collage");
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
      };
    } | undefined;
    const slotBindings = secondInsertPayload?.slideContent?.components?.[0]?.slotBindings ?? [];
    expect(slotBindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slotId: "primary-photo",
        src: "https://cdn.example.com/collage-primary.jpg",
      }),
      expect.objectContaining({
        slotId: "secondary-photo",
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

  it("records long-form routing candidates and avoids compact component recipes for dense slides", async () => {
    setupHappyPath();
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
          ],
          notes: "บทความนี้เหมาะสำหรับพ่อแม่และผู้ดูแลที่ต้องการคำอธิบายยาวและค่อยเป็นค่อยไปมากกว่าการ์ดสั้น",
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
      mode: "structured_block",
      selectionMode: "none",
    });
    expect(secondInsertPayload.slideContent?.aiDesign?.componentRecipeId).toBeUndefined();
    expect(secondInsertPayload.slideContent?.aiDesign?.candidateModes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        mode: "long_form_block",
        blockedBy: "feature_flag",
      }),
    ]));
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

  it("repairs sparse draft slide text from the slide note before rendering", async () => {
    setupHappyPath();
    const customArticleText = [
      "คู่มือ safe sleep",
      "1. Safe sleep environment",
      "Place the baby on their back to sleep.",
      "Use a firm mattress with no pillows or loose blankets.",
      "Keep the room calm and free from soft items.",
    ].join("\n\n");
    mockCallLLMStructured.mockResolvedValue({
      data: [
        {
          templateId: "hero_center",
          title: "Safe sleep environment",
          body: ["Place the baby on their back to sleep."],
          notes: "Place the baby on their back to sleep.",
          graphicCategory: "Health",
          imagePromptKeywords: "safe sleep baby room",
        },
      ],
      tokensUsed: 280,
      creditsUsed: 9,
    });

    await generateAIDraft(
      buildMockInput({
        numSlides: 1,
        prompt: "safe sleep",
        language: "en",
        useCustomArticle: true,
        customArticleText,
      }),
      buildMockActor(),
      "test-token",
      "task-123",
    );

    const firstLayoutCall = mockGenerateSlide.mock.calls.at(-1)?.[0] as { slideData: { body: string[]; notes?: string } };
    expect(firstLayoutCall.slideData.body.some((line: string) => line.includes("Place the baby on their back to sleep"))).toBe(true);
    expect(firstLayoutCall.slideData.body.some((line: string) => line.includes("Use a firm mattress with no pillows or loose blankets"))).toBe(true);
    expect(firstLayoutCall.slideData.notes).toContain("Keep the room calm and free from soft items");
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
