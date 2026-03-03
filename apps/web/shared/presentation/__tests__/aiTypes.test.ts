import { describe, expect, it } from "vitest";
import {
  GenerateAIDraftInputSchema,
  GenerateAIDraftOutputSchema,
  AIPresentationSlideSchema,
  AIPresentationSchema,
  AIDraftProgressSchema,
  SlideStylePresetSchema,
  AI_LAYOUT_TEMPLATE_IDS,
  AI_SVG_CATEGORIES,
  AI_STYLE_PRESET_IDS,
  AI_GEOMETRIC_CROP_SHAPES,
  AI_GEOMETRIC_ACCENT_SHAPES,
  AI_WATERMARK_FORMATS,
  MAX_AI_DRAFT_SLIDES,
} from "../aiTypes";

describe("GenerateAIDraftInputSchema", () => {
  const validInput = {
    deckId: 1,
    expectedVersion: 0,
    prompt: "A presentation about AI in healthcare",
    numSlides: 5,
    language: "en",
    articleSkillId: "general-article-writer",
    stylePresetId: "dark-professional",
  };

  it("accepts valid input with all required fields", () => {
    const result = GenerateAIDraftInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects prompt shorter than 3 chars", () => {
    const result = GenerateAIDraftInputSchema.safeParse({
      ...validInput,
      prompt: "ab",
    });
    expect(result.success).toBe(false);
  });

  it("rejects numSlides > 30", () => {
    const result = GenerateAIDraftInputSchema.safeParse({
      ...validInput,
      numSlides: MAX_AI_DRAFT_SLIDES + 1,
    });
    expect(result.success).toBe(false);
  });

  it("defaults stylePresetId to 'dark-professional'", () => {
    const { stylePresetId, ...withoutPreset } = validInput;
    const result = GenerateAIDraftInputSchema.safeParse(withoutPreset);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stylePresetId).toBe("dark-professional");
    }
  });

  it("defaults numSlides to 5", () => {
    const { numSlides, ...withoutNum } = validInput;
    const result = GenerateAIDraftInputSchema.safeParse(withoutNum);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.numSlides).toBe(5);
    }
  });

  it("rejects unknown stylePresetId", () => {
    const result = GenerateAIDraftInputSchema.safeParse({
      ...validInput,
      stylePresetId: "neon-cyber-punk",
    });
    expect(result.success).toBe(false);
  });

  it("rejects prompt longer than 1000 chars", () => {
    const result = GenerateAIDraftInputSchema.safeParse({
      ...validInput,
      prompt: "x".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts imagePromptContext and referenceImageUrls", () => {
    const result = GenerateAIDraftInputSchema.safeParse({
      ...validInput,
      canvasWidth: 1280,
      canvasHeight: 720,
      imagePromptContext: "Thai child, Thai family style, warm natural lighting",
      referenceImageUrls: [
        "https://cdn.example.com/reference-1.jpg",
        "/uploads/reference-2.jpg",
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid referenceImageUrls", () => {
    const result = GenerateAIDraftInputSchema.safeParse({
      ...validInput,
      referenceImageUrls: ["ftp://example.com/file.jpg"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid canvas dimensions", () => {
    const result = GenerateAIDraftInputSchema.safeParse({
      ...validInput,
      canvasWidth: 0,
      canvasHeight: 12000,
    });
    expect(result.success).toBe(false);
  });

  it("accepts watermark with png/jpg and clarityPercent", () => {
    const result = GenerateAIDraftInputSchema.safeParse({
      ...validInput,
      watermark: {
        sourceUrl: "/uploads/watermark-logo.png",
        format: "png",
        clarityPercent: 20,
      },
    });
    expect(result.success).toBe(true);
  });

  it("defaults watermark clarityPercent to 20 when omitted", () => {
    const result = GenerateAIDraftInputSchema.safeParse({
      ...validInput,
      watermark: {
        sourceUrl: "/uploads/watermark-logo.png",
        format: "png",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.watermark?.clarityPercent).toBe(20);
    }
  });

  it("rejects watermark format outside png/jpg", () => {
    const result = GenerateAIDraftInputSchema.safeParse({
      ...validInput,
      watermark: {
        sourceUrl: "/uploads/watermark-logo.webp",
        format: "webp",
        clarityPercent: 20,
      },
    });
    expect(result.success).toBe(false);

    const wrongUrl = GenerateAIDraftInputSchema.safeParse({
      ...validInput,
      watermark: {
        sourceUrl: "/uploads/watermark-logo.webp",
        format: "jpg",
        clarityPercent: 20,
      },
    });
    expect(wrongUrl.success).toBe(false);
  });

  it("rejects watermark clarity outside 5-100 step 5", () => {
    const tooLow = GenerateAIDraftInputSchema.safeParse({
      ...validInput,
      watermark: {
        sourceUrl: "/uploads/watermark-logo.jpg",
        format: "jpg",
        clarityPercent: 0,
      },
    });
    expect(tooLow.success).toBe(false);

    const wrongStep = GenerateAIDraftInputSchema.safeParse({
      ...validInput,
      watermark: {
        sourceUrl: "/uploads/watermark-logo.jpg",
        format: "jpg",
        clarityPercent: 19,
      },
    });
    expect(wrongStep.success).toBe(false);
  });
});

describe("AIPresentationSlideSchema", () => {
  it("validates correct slide data", () => {
    const result = AIPresentationSlideSchema.safeParse({
      templateId: "hero_center",
      title: "Introduction",
      body: ["Point one", "Point two"],
      graphicCategory: "Technology",
      imagePromptKeywords: "futuristic AI robot",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown templateId", () => {
    const result = AIPresentationSlideSchema.safeParse({
      templateId: "unknown_template",
      title: "Title",
      body: ["text"],
      graphicCategory: "Business",
      imagePromptKeywords: "keywords",
    });
    expect(result.success).toBe(false);
  });
});

describe("AIDraftProgressSchema", () => {
  it("accepts completed state with result", () => {
    const result = AIDraftProgressSchema.safeParse({
      phase: 6,
      phaseLabel: "Done",
      slidesCompleted: 5,
      totalSlides: 5,
      slidePreview: [],
      completed: true,
      result: {
        slidesAdded: 5,
        newDeckVersion: 6,
        articlePreview: "Article text...",
        warnings: [],
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts error state", () => {
    const result = AIDraftProgressSchema.safeParse({
      phase: 1,
      phaseLabel: "Writing article...",
      slidesCompleted: 0,
      totalSlides: 5,
      slidePreview: [],
      completed: true,
      error: {
        code: "AI_GENERATION_FAILED",
        message: "LLM provider unavailable",
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("SlideStylePresetSchema", () => {
  it("validates a complete preset definition", () => {
    const result = SlideStylePresetSchema.safeParse({
      id: "test-preset",
      name: "Test Preset",
      colors: {
        background: "#1a1a2e",
        backgroundAlt: "#16213e",
        primary: "#e94560",
        secondary: "#0f3460",
        text: "#ffffff",
        textMuted: "#a0a0b0",
        cardBg: ["#16213e", "#1a1a3e", "#0f2460"],
        overlay: "rgba(0,0,0,0.5)",
      },
      typography: {
        titleFontFamily: "Inter",
        bodyFontFamily: "Inter",
        titleFontWeight: 700,
        bodyFontWeight: 400,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects preset with missing required color fields", () => {
    const result = SlideStylePresetSchema.safeParse({
      id: "bad",
      name: "Bad",
      colors: {
        background: "#fff",
        // missing all other fields
      },
      typography: {
        titleFontFamily: "Inter",
        bodyFontFamily: "Inter",
        titleFontWeight: 700,
        bodyFontWeight: 400,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("AIPresentationSchema", () => {
  const validSlide = {
    templateId: "hero_center",
    title: "Title",
    body: ["Point"],
    graphicCategory: "Business",
    imagePromptKeywords: "keywords",
  };

  it("rejects empty array", () => {
    const result = AIPresentationSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it("rejects array with more than 30 slides", () => {
    const slides = Array.from({ length: MAX_AI_DRAFT_SLIDES + 1 }, () => validSlide);
    const result = AIPresentationSchema.safeParse(slides);
    expect(result.success).toBe(false);
  });

  it("accepts array with 1-30 valid slides", () => {
    const result = AIPresentationSchema.safeParse([validSlide]);
    expect(result.success).toBe(true);
  });
});

describe("GenerateAIDraftOutputSchema", () => {
  it("accepts valid output with taskId", () => {
    const result = GenerateAIDraftOutputSchema.safeParse({ taskId: "abc-123" });
    expect(result.success).toBe(true);
  });

  it("accepts valid output when resuming existing task", () => {
    const result = GenerateAIDraftOutputSchema.safeParse({
      taskId: "abc-123",
      alreadyInProgress: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty taskId", () => {
    const result = GenerateAIDraftOutputSchema.safeParse({ taskId: "" });
    expect(result.success).toBe(false);
  });
});

describe("geometric shape options", () => {
  it("defines crop shape choices", () => {
    expect(AI_GEOMETRIC_CROP_SHAPES).toEqual(["auto", "rect", "circle", "triangle"]);
  });

  it("defines accent shape choices", () => {
    expect(AI_GEOMETRIC_ACCENT_SHAPES).toEqual(["auto", "rect", "circle", "triangle"]);
  });

  it("defines watermark image formats", () => {
    expect(AI_WATERMARK_FORMATS).toEqual(["png", "jpg"]);
  });
});
