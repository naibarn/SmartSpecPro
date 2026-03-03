import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock hoisting ────────────────────────────────────────────

const {
  mockExecuteWithFallback,
  mockResolveProviders,
  mockCallLLMStructured,
  mockGetSkillByIdAsync,
  mockGenerateImageAsync,
  mockGetTask,
  mockAddSlideToDeck,
  mockGetPresentationDeckDetail,
  mockUpdateSlideInDeck,
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
  mockGetModelsByTypeAsync,
} = vi.hoisted(() => ({
  mockExecuteWithFallback: vi.fn(),
  mockResolveProviders: vi.fn(),
  mockCallLLMStructured: vi.fn(),
  mockGetSkillByIdAsync: vi.fn(),
  mockGenerateImageAsync: vi.fn(),
  mockGetTask: vi.fn(),
  mockAddSlideToDeck: vi.fn(),
  mockGetPresentationDeckDetail: vi.fn(),
  mockUpdateSlideInDeck: vi.fn(),
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
    getTask: mockGetTask,
  },
}));

vi.mock("../presentationService", () => ({
  addSlideToDeck: mockAddSlideToDeck,
  getPresentationDeckDetail: mockGetPresentationDeckDetail,
  updateSlideInDeck: mockUpdateSlideInDeck,
}));

vi.mock("../creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
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
  relayoutExistingSlide,
  resolvePendingMediaForDeck,
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
  mockGetTask.mockResolvedValue({ id: "task-1", status: "completed", resultUrl: "https://cdn.example.com/image.jpg" });

  mockGetBuiltInPreset.mockReturnValue({
    id: "dark-professional",
    name: "Dark Professional",
    colors: { background: "#1a1a2e", backgroundAlt: "#16213e", primary: "#e94560", secondary: "#0f3460", text: "#ffffff", textMuted: "#a0a0b0", cardBg: ["#16213e", "#0f3460", "#1a1a3e"], overlay: "rgba(0,0,0,0.55)" },
    typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", titleFontWeight: 700, bodyFontWeight: 400 },
  });

  mockPickRandomSvg.mockReturnValue(MOCK_SVG);
  mockGenerateSlide.mockReturnValue({ slideContent: MOCK_SLIDE_CONTENT, warnings: [] });
  mockGetModelsByTypeAsync.mockResolvedValue([
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
  ]);
  mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => fn({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ version: 0 }],
        }),
      }),
    }),
  }));
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
});

describe("generateAIDraft - happy path", () => {
  it("completes full 6-phase pipeline", async () => {
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

  it("tops up sparse slide bodies so split output is not overly thin", async () => {
    setupHappyPath();
    await generateAIDraft(buildMockInput(), buildMockActor(), "test-token", "task-123");

    const firstLayoutCall = mockGenerateSlide.mock.calls[0]?.[0];
    expect(firstLayoutCall).toBeDefined();
    expect(firstLayoutCall.slideData.body.length).toBeGreaterThanOrEqual(2);
  });
});

describe("generateAIDraft - Phase 1", () => {
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
});
