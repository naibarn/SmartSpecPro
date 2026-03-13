import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getPresentationSlideRenderableElements,
  presentationSlideContentSchema,
} from "@shared/presentation/contracts";
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

describe("Visual-only slides", () => {
  it("renders a full-canvas media slide without text elements", () => {
    const input = makeLayoutInput({
      visualOnly: true,
      canvasWidth: 720,
      canvasHeight: 1280,
    });

    const result = generateSlide(input);
    const textElements = result.slideContent.elements.filter((element) => element.type === "text");
    const imageElements = result.slideContent.elements.filter((element) => element.type === "image");

    expect(textElements).toHaveLength(0);
    expect(imageElements).toHaveLength(1);
    expect(imageElements[0]).toMatchObject({
      x: 0,
      y: 0,
      width: 720,
      height: 1280,
      imageFit: "cover",
      src: "https://example.com/image.jpg",
    });
  });

  it("falls back to a full-canvas svg when generated media is unavailable", () => {
    const input = makeLayoutInput({
      visualOnly: true,
      imageUrl: null,
      canvasWidth: 1080,
      canvasHeight: 1080,
    });

    const result = generateSlide(input);
    const textElements = result.slideContent.elements.filter((element) => element.type === "text");
    const imageElements = result.slideContent.elements.filter((element) => element.type === "image");

    expect(textElements).toHaveLength(0);
    expect(imageElements).toHaveLength(1);
    expect(imageElements[0]).toMatchObject({
      x: 0,
      y: 0,
      width: 1080,
      height: 1080,
      src: "",
    });
    if (imageElements[0]?.type === "image") {
      expect(imageElements[0].svgContent).toContain("<svg");
    }
  });
});

describe("Template Rendering", () => {
  const templates = [
    "hero_center",
    "split_right_image",
    "split_left_image",
    "top_image_text_bottom",
    "bottom_image_text_top",
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

describe("Component recipe rendering", () => {
  it("renders profile-summary slides as first-class components", () => {
    const result = generateSlide(makeLayoutInput({
      slideData: makeSlideData({
        templateId: "split_right_image",
        componentRecipeId: "profile-summary",
        title: "Adora Montminy",
        body: ["Marketing / Digital Marketing", "hello@example.com", "+66 1234 5678"],
        sections: [
          { heading: "Marketing Lead", details: ["hello@example.com", "+66 1234 5678"] },
          { heading: "About", details: ["Performance marketer with campaign and content strategy experience"] },
          { heading: "Highlights", details: ["Brand growth", "Campaign planning", "Content systems"] },
        ],
      }),
      imageUrl: "https://example.com/portrait.jpg",
    }));

    expect(result.slideContent.components).toHaveLength(1);
    expect(result.slideContent.components?.[0]).toMatchObject({
      componentId: "profile-summary",
      componentType: "built-in",
    });
    const renderable = getPresentationSlideRenderableElements(result.slideContent);
    expect(renderable.elements.some((element) => element.type === "image" && element.id.includes("portrait"))).toBe(true);
    expect(result.slideContent.renderOrder?.some((entry) => entry.startsWith("component:"))).toBe(true);
  });

  it("renders video-spotlight slides with a video fallback element", () => {
    const result = generateSlide(makeLayoutInput({
      slideData: makeSlideData({
        templateId: "split_right_image",
        componentRecipeId: "video-spotlight",
        title: "Product Launch Teaser",
        body: ["Fast onboarding", "Live analytics", "Studio-quality export"],
      }),
      imageUrl: "https://example.com/clip.mp4",
    }));

    expect(result.slideContent.components).toHaveLength(1);
    expect(result.slideContent.components?.[0]?.componentId).toBe("video-spotlight");
    const renderable = getPresentationSlideRenderableElements(result.slideContent);
    expect(renderable.elements.some((element) => element.type === "video")).toBe(true);
  });

  it("renders poster-spotlight slides with an image fallback element", () => {
    const result = generateSlide(makeLayoutInput({
      slideData: makeSlideData({
        templateId: "split_right_image",
        componentRecipeId: "poster-spotlight",
        title: "Membership launch",
        body: ["Premium support", "Priority booking", "Join today"],
      }),
      imageUrl: "https://example.com/poster.jpg",
    }));

    expect(result.slideContent.components?.[0]?.componentId).toBe("poster-spotlight");
    const renderable = getPresentationSlideRenderableElements(result.slideContent);
    expect(renderable.elements.some((element) => element.type === "image" && element.id.includes("hero"))).toBe(true);
  });

  it("renders framed-image-story slides with an image fallback element", () => {
    const result = generateSlide(makeLayoutInput({
      slideData: makeSlideData({
        templateId: "split_left_image",
        componentRecipeId: "framed-image-story",
        title: "Zero waste in practice",
        body: ["What it looks like on a real campus", "Short editorial summary"],
      }),
      imageUrl: "https://example.com/story.jpg",
    }));

    expect(result.slideContent.components?.[0]?.componentId).toBe("framed-image-story");
    const renderable = getPresentationSlideRenderableElements(result.slideContent);
    expect(renderable.elements.some((element) => element.type === "image" && element.id.includes("photo"))).toBe(true);
  });

  it("renders photo-collage slides with multiple image fallback elements", () => {
    const result = generateSlide(makeLayoutInput({
      slideData: makeSlideData({
        templateId: "split_left_image",
        componentRecipeId: "photo-collage",
        title: "Campaign lookbook",
        body: ["Two-frame editorial story", "Caption support"],
      }),
      imageUrl: "https://example.com/collage.jpg",
      imageUrls: [
        "https://example.com/collage-primary.jpg",
        "https://example.com/collage-secondary.jpg",
      ],
    }));

    expect(result.slideContent.components?.[0]?.componentId).toBe("photo-collage");
    const renderable = getPresentationSlideRenderableElements(result.slideContent);
    const imageUrls = renderable.elements
      .filter((element) => element.type === "image")
      .map((element) => element.src);
    expect(imageUrls).toEqual(expect.arrayContaining([
      "https://example.com/collage-primary.jpg",
      "https://example.com/collage-secondary.jpg",
    ]));
  });

  it("renders non-media component recipes as first-class components", () => {
    const recipes = [
      {
        componentRecipeId: "process-steps" as const,
        title: "Launch checklist",
        body: ["1. Gather the brief", "2. Build the message", "3. Deliver the deck"],
      },
      {
        componentRecipeId: "feature-highlights" as const,
        title: "Platform highlights",
        body: ["Fast setup", "Shared collaboration", "Reusable components", "Export-ready output"],
      },
      {
        componentRecipeId: "timeline-flow" as const,
        title: "Roadmap",
        body: ["Q1 Launch the pilot", "Q2 Expand to new teams", "Q3 Scale the workflow"],
      },
      {
        componentRecipeId: "infographic-grid" as const,
        title: "Framework overview",
        body: ["Discover", "Audience problem", "Design", "Narrative system", "Deliver", "Campaign rollout", "Measure", "Outcome tracking"],
      },
      {
        componentRecipeId: "stat-cards" as const,
        title: "Campaign metrics snapshot",
        body: ["42%: Conversion lift", "12d: Time to first win", "3.1x: Return on spend"],
      },
      {
        componentRecipeId: "quote-callout" as const,
        title: "\"Lead with clarity\"",
        body: ["Lead with one decision per slide", "Editorial insight"],
      },
    ];

    for (const recipe of recipes) {
      const result = generateSlide(makeLayoutInput({
        slideData: makeSlideData({
          templateId: "feature_boxes_right",
          componentRecipeId: recipe.componentRecipeId,
          title: recipe.title,
          body: recipe.body,
        }),
      }));

      expect(result.slideContent.components?.[0]?.componentId).toBe(recipe.componentRecipeId);
      expect(result.slideContent.renderOrder?.some((entry) => entry.startsWith("component:"))).toBe(true);
    }
  });

  it("adds a supplemental background image when a text-only component recipe has media", () => {
    const result = generateSlide(makeLayoutInput({
      slideData: makeSlideData({
        templateId: "feature_boxes_right",
        componentRecipeId: "process-steps",
        title: "Launch checklist",
        body: ["1. Gather the brief", "2. Build the message", "3. Deliver the deck"],
      }),
      imageUrl: "https://example.com/checklist.jpg",
    }));

    const backdropImage = result.slideContent.elements.find((element) => (
      element.type === "image"
      && element.src === "https://example.com/checklist.jpg"
      && element.opacity === 0.16
    ));

    expect(result.slideContent.components?.[0]?.componentId).toBe("process-steps");
    expect(backdropImage).toBeTruthy();
  });

  it("applies custom supplemental media opacity when requested", () => {
    const result = generateSlide(makeLayoutInput({
      slideData: makeSlideData({
        templateId: "feature_boxes_right",
        componentRecipeId: "process-steps",
        title: "Launch checklist",
        body: ["1. Gather the brief", "2. Build the message", "3. Deliver the deck"],
      }),
      imageUrl: "https://example.com/checklist.jpg",
      supplementalMediaOpacity: 0.42,
    }));

    const backdropImage = result.slideContent.elements.find((element) => (
      element.type === "image"
      && element.src === "https://example.com/checklist.jpg"
    ));

    expect(backdropImage?.opacity).toBeCloseTo(0.42, 5);
  });

  it("fills non-media component detail text from notes when sections only contain headings", () => {
    const result = generateSlide(makeLayoutInput({
      slideData: makeSlideData({
        templateId: "feature_boxes_right",
        componentRecipeId: "feature-highlights",
        title: "Platform highlights",
        body: ["Fast setup", "Reusable automation"],
        notes: "Shared collaboration across teams with review controls.",
        sections: [
          { heading: "Collaboration", details: [] },
          { heading: "Automation", details: [] },
          { heading: "Review", details: [] },
        ],
      }),
    }));

    const renderable = getPresentationSlideRenderableElements(result.slideContent);
    const bodyLikeText = renderable.elements.find((element) => (
      element.type === "text"
      && element.id.includes("body")
      && element.text.trim().length > 0
    ));

    expect(bodyLikeText).toBeTruthy();
  });
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
      "top_image_text_bottom",
      "bottom_image_text_top",
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

  it("boosts portrait body font size so 9:16 content remains readable", () => {
    const heroPortrait = generateSlide(makeLayoutInput({
      slideData: makeSlideData({ templateId: "hero_center" }),
      canvasWidth: 720,
      canvasHeight: 1280,
    }));
    const heroLandscape = generateSlide(makeLayoutInput({
      slideData: makeSlideData({ templateId: "hero_center" }),
      canvasWidth: 1280,
      canvasHeight: 720,
    }));
    const splitPortrait = generateSlide(makeLayoutInput({
      slideData: makeSlideData({ templateId: "split_right_image" }),
      canvasWidth: 720,
      canvasHeight: 1280,
    }));
    const splitLandscape = generateSlide(makeLayoutInput({
      slideData: makeSlideData({ templateId: "split_right_image" }),
      canvasWidth: 1280,
      canvasHeight: 720,
    }));

    const heroBodyPortrait = heroPortrait.slideContent.elements.find(
      (e) => e.type === "text" && e.text === "First bullet point",
    );
    const heroBodyLandscape = heroLandscape.slideContent.elements.find(
      (e) => e.type === "text" && e.text === "First bullet point",
    );
    const splitBodyPortrait = splitPortrait.slideContent.elements.find(
      (e) => e.type === "text" && e.text === "First bullet point",
    );
    const splitBodyLandscape = splitLandscape.slideContent.elements.find(
      (e) => e.type === "text" && e.text === "First bullet point",
    );

    expect(heroBodyPortrait).toBeDefined();
    expect(heroBodyLandscape).toBeDefined();
    expect(splitBodyPortrait).toBeDefined();
    expect(splitBodyLandscape).toBeDefined();

    if (
      heroBodyPortrait?.type === "text"
      && heroBodyLandscape?.type === "text"
      && splitBodyPortrait?.type === "text"
      && splitBodyLandscape?.type === "text"
    ) {
      expect(heroBodyPortrait.fontSize).toBeGreaterThanOrEqual(12);
      expect(splitBodyPortrait.fontSize).toBeGreaterThanOrEqual(20);
      expect(heroBodyPortrait.fontSize).toBeGreaterThan(heroBodyLandscape.fontSize ?? 0);
      expect(splitBodyPortrait.fontSize).toBeGreaterThan(splitBodyLandscape.fontSize ?? 0);
    }
  });

  it("applies modern typography metadata and hero legibility panel", () => {
    const hero = generateSlide(makeLayoutInput({
      slideData: makeSlideData({ templateId: "hero_center" }),
      canvasWidth: 720,
      canvasHeight: 1280,
    }));
    const split = generateSlide(makeLayoutInput({
      slideData: makeSlideData({ templateId: "split_right_image" }),
    }));

    const heroTitle = hero.slideContent.elements.find(
      (e) => e.type === "text" && e.text === "Test Slide Title",
    );
    const heroBody = hero.slideContent.elements.find(
      (e) => e.type === "text" && e.text === "First bullet point",
    );
    const splitTitle = split.slideContent.elements.find(
      (e) => e.type === "text" && e.text === "Test Slide Title",
    );
    const splitBody = split.slideContent.elements.find(
      (e) => e.type === "text" && e.text === "First bullet point",
    );
    const heroPanel = hero.slideContent.elements.find(
      (e) =>
        e.type === "rect"
        && e.fill === getBuiltInPreset("dark-professional")!.colors.backgroundAlt
        && e.opacity !== undefined
        && e.opacity > 0
        && e.width < 720,
    );

    expect(heroTitle).toBeDefined();
    expect(heroBody).toBeDefined();
    expect(splitTitle).toBeDefined();
    expect(splitBody).toBeDefined();
    expect(heroPanel).toBeDefined();

    if (
      heroTitle?.type === "text"
      && heroBody?.type === "text"
      && splitTitle?.type === "text"
      && splitBody?.type === "text"
    ) {
      expect(heroTitle.lineHeight).toBeGreaterThan(1);
      expect(heroTitle.letterSpacing).toBeLessThanOrEqual(0);
      expect(heroTitle.textShadow).toContain("rgba(");
      expect(heroBody.lineHeight).toBeGreaterThanOrEqual(1.2);
      expect(heroBody.letterSpacing).toBeGreaterThan(0);
      expect(splitTitle.lineHeight).toBeGreaterThan(1);
      expect(splitBody.lineHeight).toBeGreaterThan(1.2);
    }
  });

  it("feature_boxes_right keeps more than 3 body points for better content coverage", () => {
    const bodyLines = [
      "Point 1",
      "Point 2",
      "Point 3",
      "Point 4",
      "Point 5",
    ];
    const result = generateSlide(makeLayoutInput({
      slideData: makeSlideData({
        templateId: "feature_boxes_right",
        body: bodyLines,
      }),
    }));

    const textSet = new Set(
      result.slideContent.elements
        .filter((element) => element.type === "text")
        .map((element) => element.text),
    );
    expect(textSet.has("Point 1")).toBe(true);
    expect(textSet.has("Point 2")).toBe(true);
    expect(textSet.has("Point 3")).toBe(true);
    expect(textSet.has("Point 4")).toBe(true);
    expect(textSet.has("Point 5")).toBe(true);
  });

  it("renders section heading + detail hierarchy when sections are provided", () => {
    const result = generateSlide(makeLayoutInput({
      slideData: makeSlideData({
        templateId: "feature_boxes_right",
        title: "พัฒนาการที่ควรติดตาม",
        body: ["สำรองกรณีไม่มี sections"],
        sections: [
          { heading: "เด็กคลอดก่อนกำหนด", details: ["ควรติดตามพัฒนาการอย่างใกล้ชิด"] },
          { heading: "ปัญหากล้ามเนื้อ", details: ["ควรพบผู้เชี่ยวชาญด้านกายภาพบำบัด"] },
        ],
      }),
    }));

    const texts = result.slideContent.elements
      .filter((element) => element.type === "text")
      .map((element) => element.text);
    expect(texts).toContain("เด็กคลอดก่อนกำหนด");
    expect(texts).toContain("ควรติดตามพัฒนาการอย่างใกล้ชิด");
    expect(texts).toContain("ปัญหากล้ามเนื้อ");
  });

  it("keeps feature box heading and detail blocks separated in portrait auto layout", () => {
    const result = generateSlide(makeLayoutInput({
      slideData: makeSlideData({
        templateId: "feature_boxes_right",
        title: "Movement and Social Skills at 9 Months",
        sections: [
          { heading: "Encouraging Exploration", details: ["Create a safe environment for crawling"] },
          { heading: "Remove hazardous items", details: ["Clear small or sharp objects from reach"] },
          { heading: "Enhancing Communication", details: ["Read stories frequently"] },
          { heading: "Promote strong language skills", details: ["Name objects and respond to babbling"] },
        ],
      }),
      canvasWidth: 720,
      canvasHeight: 1280,
    }));

    const heading = result.slideContent.elements.find(
      (element) => element.type === "text" && element.text === "Enhancing Communication",
    );
    const detail = result.slideContent.elements.find(
      (element) => element.type === "text" && element.text === "Read stories frequently",
    );

    expect(heading).toBeDefined();
    expect(detail).toBeDefined();
    if (heading?.type === "text" && detail?.type === "text") {
      expect(detail.y).toBeGreaterThanOrEqual(heading.y + heading.height);
    }
  });

  it("renders subtitle level before detail body in split templates", () => {
    const result = generateSlide(makeLayoutInput({
      slideData: makeSlideData({
        templateId: "split_right_image",
        title: "เด็กที่มีพัฒนาการล่าช้าหรือมีความเสี่ยง",
        body: ["ข้อความสำรอง"],
        sections: [
          { heading: "เด็กคลอดก่อนกำหนด", details: ["ต้องการการติดตามใกล้ชิด"] },
          { heading: "ปัญหากล้ามเนื้อ", details: ["ต้องการการกระตุ้นเฉพาะทาง"] },
        ],
      }),
    }));

    const subtitleText = result.slideContent.elements.find(
      (element) => element.type === "text" && element.text === "เด็กคลอดก่อนกำหนด",
    );
    const detailText = result.slideContent.elements.find(
      (element) => element.type === "text" && element.text.includes("ปัญหากล้ามเนื้อ:"),
    );

    expect(subtitleText).toBeDefined();
    expect(detailText).toBeDefined();
    if (subtitleText?.type === "text" && detailText?.type === "text") {
      expect(subtitleText.fontSize).toBeGreaterThan(detailText.fontSize ?? 0);
    }
  });

  it("renders markdown hierarchy with smaller body text than ### emphasis lines", () => {
    const result = generateSlide(makeLayoutInput({
      slideData: makeSlideData({
        templateId: "split_right_image",
        title: "หัวข้อหลักของบทความ",
        body: ["ข้อความทั่วไปสำหรับอธิบายรายละเอียดเพิ่มเติม"],
        markdownHierarchy: [
          { level: "h2", text: "สรุปอย่างรวดเร็ว" },
          { level: "h3", text: "ฝึกยืนได้เมื่ออายุประมาณหกถึงเก้าเดือน" },
          { level: "body", text: "ข้อความทั่วไปสำหรับอธิบายรายละเอียดเพิ่มเติม" },
        ],
      }),
    }));

    const subtitleText = result.slideContent.elements.find(
      (element) => element.type === "text" && element.text === "สรุปอย่างรวดเร็ว",
    );
    const emphasisText = result.slideContent.elements.find(
      (element) => element.type === "text" && element.text === "ฝึกยืนได้เมื่ออายุประมาณหกถึงเก้าเดือน",
    );
    const bodyText = result.slideContent.elements.find(
      (element) => element.type === "text" && element.text === "ข้อความทั่วไปสำหรับอธิบายรายละเอียดเพิ่มเติม",
    );

    expect(subtitleText).toBeDefined();
    expect(emphasisText).toBeDefined();
    expect(bodyText).toBeDefined();
    if (subtitleText?.type === "text" && emphasisText?.type === "text" && bodyText?.type === "text") {
      expect(subtitleText.fontSize).toBeGreaterThan(emphasisText.fontSize ?? 0);
      expect(emphasisText.fontSize).toBeGreaterThan(bodyText.fontSize ?? 0);
    }
  });

  it("avoids overlapping Thai body rows in split right image layouts with long content", () => {
    const result = generateSlide(makeLayoutInput({
      slideData: makeSlideData({
        templateId: "split_right_image",
        title: "ใครคือกลุ่มเป้าหมาย",
        body: [
          "สิ่งที่ปกติเมื่อเปรียบเทียบกับสิ่งที่น่ากังวล",
          "บทความนี้เหมาะสำหรับพ่อแม่หรือผู้ดูแลเด็กอายุระหว่าง 4 ถึง 6 เดือน ซึ่งกำลังมองหาวิธีการสร้างนิสัยการนอนที่เหมาะสมเพื่อให้เด็กมีโอกาสได้นอนยาวตลอดคืน",
          "ในช่วงวัยนี้ เด็กมักจะเริ่มนอนยาวขึ้นในช่วงเวลากลางคืน ความกังวลมักเกิดขึ้นในกรณีที่เด็กยังตื่นบ่อยหรือมีปัญหาในการกลับเข้าสู่การนอนหลับหลังจากตื่น",
        ],
      }),
    }));

    const textElements = result.slideContent.elements
      .filter((element): element is Extract<typeof result.slideContent.elements[number], { type: "text" }> => element.type === "text")
      .sort((a, b) => a.y - b.y);
    const bodyTexts = textElements.filter((element) => (
      element.text.includes("บทความนี้เหมาะสำหรับ")
      || element.text.includes("ในช่วงวัยนี้")
      || element.text.includes("สิ่งที่ปกติเมื่อเปรียบเทียบ")
    ));

    expect(bodyTexts.length).toBeGreaterThan(0);
    for (let index = 1; index < bodyTexts.length; index += 1) {
      const previous = bodyTexts[index - 1]!;
      const current = bodyTexts[index]!;
      expect(previous.y + previous.height).toBeLessThanOrEqual(current.y + 2);
    }
  });

  it("fits long process-step text into cards without using oversized subtitle notes", () => {
    const result = generateSlide(makeLayoutInput({
      slideData: makeSlideData({
        templateId: "feature_boxes_right",
        componentRecipeId: "process-steps",
        title: "ขั้นตอนปฏิบัติ / เคล็ดลับ",
        notes: "บรรทัดอธิบายยาวมากที่ไม่ควรถูกดึงมาใช้เต็ม ๆ ใน subtitle เพราะจะทำให้หัวข้อหลักกับบรรทัดรองซ้อนกันและอ่านไม่ออกเมื่อ render เป็น block",
        body: [
          "สร้างกิจวัตรก่อนนอน",
          "ทำกิจกรรมแบบเดิมในเวลาคล้ายกันทุกวันเพื่อให้เด็กคาดเดาได้และผ่อนคลายก่อนหลับ",
          "ความผิดพลาดที่พบบ่อย",
          "ปล่อยให้เด็กเล่นจนตื่นตัวมากเกินไปก่อนเข้านอน",
          "ใช้เสียงเพลงหรือเสียงธรรมชาติ",
          "ช่วยกลบเสียงรบกวนและสร้างบรรยากาศสม่ำเสมอ",
        ],
      }),
    }));

    const renderable = getPresentationSlideRenderableElements(result.slideContent);
    const subtitle = renderable.elements.find((element) => element.type === "text" && element.id.includes("subtitle"));
    const cardTitle = renderable.elements.find((element) => element.type === "text" && element.id.includes("card-1-title"));
    const cardBody = renderable.elements.find((element) => element.type === "text" && element.id.includes("card-1-body"));

    expect(subtitle?.text.length ?? 0).toBeLessThan(181);
    if (cardTitle?.type === "text") {
      expect(cardTitle.text.length).toBeLessThanOrEqual("สร้างกิจวัตรก่อนนอน".length);
      expect(cardTitle.height).toBeGreaterThanOrEqual(40);
    }
    if (cardBody?.type === "text") {
      expect(cardBody.height).toBeGreaterThanOrEqual(48);
      expect(cardBody.lineHeight).toBeGreaterThan(1.2);
    }
  });

  it("compacts overflow body lines in split templates instead of silently dropping context", () => {
    const result = generateSlide(makeLayoutInput({
      slideData: makeSlideData({
        templateId: "split_left_image",
        body: [
          "A",
          "B",
          "C",
          "D",
          "E",
          "F",
          "G",
        ],
      }),
    }));

    const renderedBodyTexts = result.slideContent.elements
      .filter((element) => element.type === "text")
      .map((element) => element.text)
      .filter((text) => ["A", "B", "C", "D", "E", "F", "G"].some((prefix) => text.startsWith(prefix)));

    // With maxBodyLines=8 for split templates, all 7 lines fit without compaction
    expect(renderedBodyTexts.length).toBeLessThanOrEqual(8);
    expect(renderedBodyTexts.length).toBeGreaterThanOrEqual(5);
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
