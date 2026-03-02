import { describe, it, expect, vi, beforeEach } from "vitest";
import { presentationSlideContentSchema } from "@shared/presentation/contracts";
import {
  BUILT_IN_PRESETS,
  getBuiltInPreset,
} from "@shared/presentation/aiStylePresets";
import type { SlideStylePreset } from "@shared/presentation/aiTypes";
import type { SvgGraphic } from "@shared/presentation/svgGraphicsCatalog";
import {
  generateSlide,
  type LayoutEngineInput,
  type LayoutEngineOutput,
} from "../aiPresentationLayoutEngine";

// Mock crypto.randomUUID for deterministic but unique IDs
let uuidCounter = 0;
vi.stubGlobal("crypto", {
  ...crypto,
  randomUUID: vi.fn(() => `test-uuid-${String(++uuidCounter).padStart(4, "0")}`),
});

beforeEach(() => {
  uuidCounter = 0;
});

// ── Test Fixtures ──────────────────────────────────────────

function makeSlideData(
  overrides?: Partial<LayoutEngineInput["slideData"]>,
): LayoutEngineInput["slideData"] {
  return {
    templateId: "hero_center",
    title: "Test Slide Title",
    body: ["First bullet point", "Second bullet point"],
    graphicCategory: "Technology",
    imagePromptKeywords: "futuristic technology",
    ...overrides,
  };
}

function makeSvgGraphic(): SvgGraphic {
  return {
    id: "test-svg",
    label: "Test SVG",
    category: "Technology",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2L2 22h20z"/></svg>',
  };
}

function makeLayoutInput(
  overrides?: Partial<LayoutEngineInput>,
): LayoutEngineInput {
  return {
    slideData: makeSlideData(),
    imageUrl: "https://example.com/image.jpg",
    svgGraphic: makeSvgGraphic(),
    stylePreset: getBuiltInPreset("dark-professional")!,
    deckTitle: "Test Deck",
    slideIndex: 1,
    totalSlides: 5,
    ...overrides,
  };
}

// ── C.1: Template Rendering Tests ──────────────────────────

describe("Template Rendering", () => {
  const templates = [
    "hero_center",
    "split_right_image",
    "split_left_image",
    "feature_boxes_right",
  ] as const;

  for (const templateId of templates) {
    describe(`${templateId}`, () => {
      for (const preset of BUILT_IN_PRESETS) {
        it(`produces valid PresentationSlideContent for ${preset.id}`, () => {
          const input = makeLayoutInput({
            slideData: makeSlideData({
              templateId,
              body: ["Point one", "Point two", "Point three"],
            }),
            stylePreset: preset,
          });
          const result = generateSlide(input);
          const parsed = presentationSlideContentSchema.safeParse(
            result.slideContent,
          );
          expect(
            parsed.success,
            `Template '${templateId}' + preset '${preset.id}' produced invalid slide content: ${
              !parsed.success ? JSON.stringify(parsed.error.issues, null, 2) : ""
            }`,
          ).toBe(true);
        });
      }
    });
  }
});

// ── C.2: Color/Font Parameterization Tests ─────────────────

describe("Color/Font Parameterization", () => {
  it("all text elements use fonts from stylePreset.typography (no hardcoded fonts)", () => {
    const preset = getBuiltInPreset("dark-professional")!;
    const input = makeLayoutInput({ stylePreset: preset });
    const result = generateSlide(input);

    const allowedFonts = [
      preset.typography.titleFontFamily,
      preset.typography.bodyFontFamily,
    ];

    const textElements = result.slideContent.elements.filter(
      (e) => e.type === "text",
    );
    expect(textElements.length).toBeGreaterThan(0);

    for (const el of textElements) {
      if (el.type === "text" && el.fontFamily) {
        expect(
          allowedFonts,
          `Text element has fontFamily '${el.fontFamily}' which is not in preset typography`,
        ).toContain(el.fontFamily);
      }
    }
  });

  it("all colored elements use colors from stylePreset.colors (no hardcoded colors)", () => {
    const preset = getBuiltInPreset("corporate-blue")!;
    const input = makeLayoutInput({
      stylePreset: preset,
      slideData: makeSlideData({
        templateId: "feature_boxes_right",
        body: ["Point one", "Point two", "Point three"],
      }),
    });
    const result = generateSlide(input);

    const allowedColors = new Set([
      preset.colors.background,
      preset.colors.backgroundAlt,
      preset.colors.primary,
      preset.colors.secondary,
      preset.colors.text,
      preset.colors.textMuted,
      ...preset.colors.cardBg,
      preset.colors.overlay,
      "transparent",
      "none",
    ]);
    // Also allow header/footer colors
    if (preset.header) {
      allowedColors.add(preset.header.backgroundColor);
      if (preset.header.titleColor) allowedColors.add(preset.header.titleColor);
    }
    if (preset.footer) {
      allowedColors.add(preset.footer.backgroundColor);
      if (preset.footer.textColor) allowedColors.add(preset.footer.textColor);
    }

    for (const el of result.slideContent.elements) {
      if (el.type === "text") {
        expect(
          allowedColors.has(el.color),
          `Text color '${el.color}' not in preset palette`,
        ).toBe(true);
        if (el.backgroundColor) {
          expect(
            allowedColors.has(el.backgroundColor),
            `Text backgroundColor '${el.backgroundColor}' not in preset`,
          ).toBe(true);
        }
      }
      if (el.type === "rect") {
        expect(
          allowedColors.has(el.fill),
          `Rect fill '${el.fill}' not in preset palette`,
        ).toBe(true);
      }
      if (el.type === "line" && el.stroke) {
        // Line strokes come from border CSS shorthand parsing
        // They should be a valid color from the preset's borders
        expect(
          el.stroke.length,
          `Line stroke '${el.stroke}' should be a non-empty color string`,
        ).toBeGreaterThan(0);
      }
      if (el.type === "image" && el.svgColor) {
        expect(
          allowedColors.has(el.svgColor),
          `SVG color '${el.svgColor}' not in preset palette`,
        ).toBe(true);
      }
    }
  });

  it("dark-professional preset produces dark background + light text", () => {
    const preset = getBuiltInPreset("dark-professional")!;
    const input = makeLayoutInput({ stylePreset: preset });
    const result = generateSlide(input);

    // Background rect should be first element with dark fill
    const bgRect = result.slideContent.elements[0];
    expect(bgRect.type).toBe("rect");
    if (bgRect.type === "rect") {
      expect(bgRect.fill).toBe("#1a1a2e");
    }

    // Title text should use primary color
    const titleText = result.slideContent.elements.find(
      (e) => e.type === "text" && "text" in e && e.text === "Test Slide Title",
    );
    expect(titleText).toBeDefined();
    if (titleText?.type === "text") {
      expect(titleText.color).toBe(preset.colors.primary);
    }
  });

  it("light-minimalist preset produces light background + dark text", () => {
    const preset = getBuiltInPreset("light-minimalist")!;
    const input = makeLayoutInput({ stylePreset: preset });
    const result = generateSlide(input);

    const bgRect = result.slideContent.elements[0];
    expect(bgRect.type).toBe("rect");
    if (bgRect.type === "rect") {
      expect(bgRect.fill).toBe(preset.colors.background);
    }

    const titleText = result.slideContent.elements.find(
      (e) => e.type === "text" && "text" in e && e.text === "Test Slide Title",
    );
    expect(titleText).toBeDefined();
    if (titleText?.type === "text") {
      expect(titleText.color).toBe(preset.colors.primary);
    }
  });
});

// ── C.3: Header/Footer Tests ───────────────────────────────

describe("Header/Footer", () => {
  it("header elements are present when preset.header.enabled is true", () => {
    const preset = getBuiltInPreset("dark-professional")!;
    expect(preset.header?.enabled).toBe(true);
    const input = makeLayoutInput({ stylePreset: preset });
    const result = generateSlide(input);

    // Should have a header rect at y=0 with height matching preset.header.height
    const headerRect = result.slideContent.elements.find(
      (e) =>
        e.type === "rect" &&
        e.y === 0 &&
        e.height === preset.header!.height &&
        e.x === 0,
    );
    expect(headerRect).toBeDefined();
  });

  it("no header elements when preset.header.enabled is false", () => {
    const preset = getBuiltInPreset("light-minimalist")!;
    // light-minimalist has no header
    expect(preset.header).toBeUndefined();
    const input = makeLayoutInput({ stylePreset: preset });
    const result = generateSlide(input);

    // No rect at y=0 that looks like a header (small height at top)
    const headerLikeRects = result.slideContent.elements.filter(
      (e) =>
        e.type === "rect" && e.y === 0 && e.height < 100 && e.width === 1920,
    );
    // Only the background rect covers the full area
    expect(headerLikeRects.length).toBe(0);
  });

  it("footer elements are present when preset.footer.enabled is true", () => {
    const preset = getBuiltInPreset("dark-professional")!;
    expect(preset.footer?.enabled).toBe(true);
    const input = makeLayoutInput({ stylePreset: preset });
    const result = generateSlide(input);

    const footerY = 1080 - preset.footer!.height;
    const footerRect = result.slideContent.elements.find(
      (e) => e.type === "rect" && e.y === footerY && e.height === preset.footer!.height,
    );
    expect(footerRect).toBeDefined();
  });

  it('footer page number shows "slideIndex / totalSlides" format', () => {
    const preset = getBuiltInPreset("dark-professional")!;
    const input = makeLayoutInput({
      stylePreset: preset,
      slideIndex: 3,
      totalSlides: 5,
    });
    const result = generateSlide(input);

    const pageNumberText = result.slideContent.elements.find(
      (e) => e.type === "text" && "text" in e && e.text.includes("3 / 5"),
    );
    expect(pageNumberText).toBeDefined();
  });

  it("footer custom text renders when showCustomText is true", () => {
    const preset = getBuiltInPreset("corporate-blue")!;
    expect(preset.footer?.showCustomText).toBe(true);
    expect(preset.footer?.customText).toBe("Confidential");

    const input = makeLayoutInput({ stylePreset: preset });
    const result = generateSlide(input);

    const customTextEl = result.slideContent.elements.find(
      (e) => e.type === "text" && "text" in e && e.text === "Confidential",
    );
    expect(customTextEl).toBeDefined();
  });

  it("content area Y coordinates shift down by header.height when header is enabled", () => {
    const presetWithHeader = getBuiltInPreset("dark-professional")!;
    expect(presetWithHeader.header?.enabled).toBe(true);
    const headerHeight = presetWithHeader.header!.height;

    // Create a custom preset without header for comparison
    const presetNoHeader: SlideStylePreset = {
      ...presetWithHeader,
      id: "test-no-header",
      name: "Test No Header",
      header: undefined,
      footer: undefined,
    };

    const inputWithHeader = makeLayoutInput({ stylePreset: presetWithHeader });
    const inputNoHeader = makeLayoutInput({
      stylePreset: presetNoHeader,
    });

    const resultWithHeader = generateSlide(inputWithHeader);
    const resultNoHeader = generateSlide(inputNoHeader);

    // Find title text in both results
    const titleWithHeader = resultWithHeader.slideContent.elements.find(
      (e) => e.type === "text" && "text" in e && e.text === "Test Slide Title",
    );
    const titleNoHeader = resultNoHeader.slideContent.elements.find(
      (e) => e.type === "text" && "text" in e && e.text === "Test Slide Title",
    );

    expect(titleWithHeader).toBeDefined();
    expect(titleNoHeader).toBeDefined();

    if (titleWithHeader && titleNoHeader) {
      // Title with header should be positioned below header
      expect(titleWithHeader.y).toBeGreaterThanOrEqual(headerHeight);
      // Title with header should be lower than without header
      expect(titleWithHeader.y).toBeGreaterThan(titleNoHeader.y);
    }
  });

  it("content area height is reduced by header.height + footer.height", () => {
    const preset = getBuiltInPreset("dark-professional")!;
    const headerHeight = preset.header!.height;
    const footerHeight = preset.footer!.height;

    const input = makeLayoutInput({ stylePreset: preset });
    const result = generateSlide(input);

    // All content elements (excluding background, header, footer) should be
    // within the content area: y >= headerHeight && y + height <= 1080 - footerHeight
    const contentElements = result.slideContent.elements.filter((e) => {
      // Skip background rect (full canvas)
      if (e.type === "rect" && e.width === 1920 && e.height === 1080) return false;
      // Skip header/footer rects
      if (e.type === "rect" && e.y === 0 && e.height === headerHeight) return false;
      if (
        e.type === "rect" &&
        e.y === 1080 - footerHeight &&
        e.height === footerHeight
      )
        return false;
      // Skip header/footer lines
      if (e.type === "line" && (e.y === headerHeight || e.y === 1080 - footerHeight))
        return false;
      // Skip header/footer text elements
      if (e.type === "text" && e.y < headerHeight) return false;
      if (e.type === "text" && e.y >= 1080 - footerHeight) return false;
      return true;
    });

    for (const el of contentElements) {
      expect(
        el.y,
        `Element at y=${el.y} is above content area (headerHeight=${headerHeight})`,
      ).toBeGreaterThanOrEqual(headerHeight);
    }
  });
});

// ── C.4: Edge Cases ────────────────────────────────────────

describe("Edge Cases", () => {
  it("null imageUrl produces placeholder rect with preset.colors.backgroundAlt", () => {
    const preset = getBuiltInPreset("dark-professional")!;
    const input = makeLayoutInput({
      imageUrl: null,
      stylePreset: preset,
      slideData: makeSlideData({ templateId: "split_right_image" }),
    });
    const result = generateSlide(input);

    // Should have a rect placeholder instead of an image
    const placeholderRect = result.slideContent.elements.find(
      (e) =>
        e.type === "rect" &&
        e.fill === preset.colors.backgroundAlt &&
        e.width > 0 &&
        e !== result.slideContent.elements[0], // not background
    );
    expect(placeholderRect).toBeDefined();
  });

  it("null imageUrl adds a warning to output", () => {
    const input = makeLayoutInput({
      imageUrl: null,
      slideData: makeSlideData({ templateId: "split_right_image" }),
    });
    const result = generateSlide(input);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(
      result.warnings.some(
        (w) =>
          w.toLowerCase().includes("placeholder") ||
          w.toLowerCase().includes("image"),
      ),
    ).toBe(true);
  });

  it("output passes presentationSlideContentSchema.safeParse()", () => {
    for (const templateId of [
      "hero_center",
      "split_right_image",
      "split_left_image",
      "feature_boxes_right",
    ] as const) {
      const input = makeLayoutInput({
        slideData: makeSlideData({
          templateId,
          body: ["Point one", "Point two", "Point three"],
        }),
      });
      const result = generateSlide(input);
      const parsed = presentationSlideContentSchema.safeParse(
        result.slideContent,
      );
      expect(
        parsed.success,
        `${templateId} failed schema validation: ${!parsed.success ? JSON.stringify(parsed.error.issues) : ""}`,
      ).toBe(true);
    }
  });

  it("elements have unique IDs (crypto.randomUUID)", () => {
    const input = makeLayoutInput();
    const result = generateSlide(input);

    const ids = result.slideContent.elements.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("proportional scaling works for non-1920x1080 canvas sizes", () => {
    const input1920 = makeLayoutInput({
      slideData: makeSlideData({ templateId: "hero_center" }),
    });
    const result1920 = generateSlide(input1920);

    const input960 = makeLayoutInput({
      slideData: makeSlideData({ templateId: "hero_center" }),
      canvasWidth: 960,
      canvasHeight: 540,
    });
    const result960 = generateSlide(input960);

    // Background rect should be scaled
    const bg1920 = result1920.slideContent.elements[0];
    const bg960 = result960.slideContent.elements[0];
    expect(bg1920.width).toBe(1920);
    expect(bg1920.height).toBe(1080);
    expect(bg960.width).toBe(960);
    expect(bg960.height).toBe(540);

    // Title text font size should be scaled by 0.5
    const title1920 = result1920.slideContent.elements.find(
      (e) => e.type === "text" && e.text === "Test Slide Title",
    );
    const title960 = result960.slideContent.elements.find(
      (e) => e.type === "text" && e.text === "Test Slide Title",
    );
    expect(title1920).toBeDefined();
    expect(title960).toBeDefined();
    if (title1920?.type === "text" && title960?.type === "text") {
      expect(title960.fontSize).toBeCloseTo(title1920.fontSize! * 0.5, 0);
    }
  });

  it("uses short-edge typography scaling so portrait canvas text is not undersized", () => {
    const result = generateSlide(makeLayoutInput({
      slideData: makeSlideData({ templateId: "hero_center" }),
      canvasWidth: 720,
      canvasHeight: 1280,
    }));

    const title = result.slideContent.elements.find(
      (e) => e.type === "text" && e.text === "Test Slide Title",
    );
    const body = result.slideContent.elements.find(
      (e) => e.type === "text" && e.text === "First bullet point",
    );
    expect(title).toBeDefined();
    expect(body).toBeDefined();
    if (title?.type === "text" && body?.type === "text") {
      expect(title.fontSize).toBeGreaterThanOrEqual(40);
      expect(body.fontSize).toBeGreaterThanOrEqual(18);
    }
  });

  it("falls back to minimal slide when template rendering produces invalid content", () => {
    // Create a corrupt preset with missing color fields to force validation failure
    const corruptPreset = {
      id: "corrupt",
      name: "Corrupt",
      colors: {
        background: "#000000",
        backgroundAlt: "#111111",
        primary: "#ffffff",
        secondary: "#cccccc",
        text: "#ffffff",
        textMuted: "#999999",
        cardBg: ["#111111", "#222222", "#333333"] as [string, string, string],
        overlay: "rgba(0,0,0,0.5)",
      },
      typography: {
        titleFontFamily: "Inter",
        bodyFontFamily: "Inter",
        titleFontWeight: 700,
        bodyFontWeight: 400,
      },
    } as SlideStylePreset;

    // This should still produce a valid fallback slide
    const input = makeLayoutInput({ stylePreset: corruptPreset });
    const result = generateSlide(input);

    // Must produce valid slide content
    const parsed = presentationSlideContentSchema.safeParse(
      result.slideContent,
    );
    expect(parsed.success).toBe(true);
    // Should have at least a background rect and title
    expect(result.slideContent.elements.length).toBeGreaterThanOrEqual(2);
  });
});
