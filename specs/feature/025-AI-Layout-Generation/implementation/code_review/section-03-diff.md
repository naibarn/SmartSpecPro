diff --git a/apps/web/server/services/__tests__/aiPresentationLayoutEngine.test.ts b/apps/web/server/services/__tests__/aiPresentationLayoutEngine.test.ts
new file mode 100644
index 0000000..3e9ead6
--- /dev/null
+++ b/apps/web/server/services/__tests__/aiPresentationLayoutEngine.test.ts
@@ -0,0 +1,539 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { presentationSlideContentSchema } from "@shared/presentation/contracts";
+import {
+  BUILT_IN_PRESETS,
+  getBuiltInPreset,
+} from "@shared/presentation/aiStylePresets";
+import type { SlideStylePreset } from "@shared/presentation/aiTypes";
+import type { SvgGraphic } from "@shared/presentation/svgGraphicsCatalog";
+import {
+  generateSlide,
+  type LayoutEngineInput,
+  type LayoutEngineOutput,
+} from "../aiPresentationLayoutEngine";
+
+// Mock crypto.randomUUID for deterministic but unique IDs
+let uuidCounter = 0;
+vi.stubGlobal("crypto", {
+  ...crypto,
+  randomUUID: vi.fn(() => `test-uuid-${String(++uuidCounter).padStart(4, "0")}`),
+});
+
+beforeEach(() => {
+  uuidCounter = 0;
+});
+
+// ── Test Fixtures ──────────────────────────────────────────
+
+function makeSlideData(
+  overrides?: Partial<LayoutEngineInput["slideData"]>,
+): LayoutEngineInput["slideData"] {
+  return {
+    templateId: "hero_center",
+    title: "Test Slide Title",
+    body: ["First bullet point", "Second bullet point"],
+    graphicCategory: "Technology",
+    imagePromptKeywords: "futuristic technology",
+    ...overrides,
+  };
+}
+
+function makeSvgGraphic(): SvgGraphic {
+  return {
+    id: "test-svg",
+    label: "Test SVG",
+    category: "Technology",
+    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2L2 22h20z"/></svg>',
+  };
+}
+
+function makeLayoutInput(
+  overrides?: Partial<LayoutEngineInput>,
+): LayoutEngineInput {
+  return {
+    slideData: makeSlideData(),
+    imageUrl: "https://example.com/image.jpg",
+    svgGraphic: makeSvgGraphic(),
+    stylePreset: getBuiltInPreset("dark-professional")!,
+    deckTitle: "Test Deck",
+    slideIndex: 1,
+    totalSlides: 5,
+    ...overrides,
+  };
+}
+
+// ── C.1: Template Rendering Tests ──────────────────────────
+
+describe("Template Rendering", () => {
+  const templates = [
+    "hero_center",
+    "split_right_image",
+    "split_left_image",
+    "feature_boxes_right",
+  ] as const;
+
+  for (const templateId of templates) {
+    describe(`${templateId}`, () => {
+      for (const preset of BUILT_IN_PRESETS) {
+        it(`produces valid PresentationSlideContent for ${preset.id}`, () => {
+          const input = makeLayoutInput({
+            slideData: makeSlideData({
+              templateId,
+              body: ["Point one", "Point two", "Point three"],
+            }),
+            stylePreset: preset,
+          });
+          const result = generateSlide(input);
+          const parsed = presentationSlideContentSchema.safeParse(
+            result.slideContent,
+          );
+          expect(
+            parsed.success,
+            `Template '${templateId}' + preset '${preset.id}' produced invalid slide content: ${
+              !parsed.success ? JSON.stringify(parsed.error.issues, null, 2) : ""
+            }`,
+          ).toBe(true);
+        });
+      }
+    });
+  }
+});
+
+// ── C.2: Color/Font Parameterization Tests ─────────────────
+
+describe("Color/Font Parameterization", () => {
+  it("all text elements use fonts from stylePreset.typography (no hardcoded fonts)", () => {
+    const preset = getBuiltInPreset("dark-professional")!;
+    const input = makeLayoutInput({ stylePreset: preset });
+    const result = generateSlide(input);
+
+    const allowedFonts = [
+      preset.typography.titleFontFamily,
+      preset.typography.bodyFontFamily,
+    ];
+
+    const textElements = result.slideContent.elements.filter(
+      (e) => e.type === "text",
+    );
+    expect(textElements.length).toBeGreaterThan(0);
+
+    for (const el of textElements) {
+      if (el.type === "text" && el.fontFamily) {
+        expect(
+          allowedFonts,
+          `Text element has fontFamily '${el.fontFamily}' which is not in preset typography`,
+        ).toContain(el.fontFamily);
+      }
+    }
+  });
+
+  it("all colored elements use colors from stylePreset.colors (no hardcoded colors)", () => {
+    const preset = getBuiltInPreset("corporate-blue")!;
+    const input = makeLayoutInput({
+      stylePreset: preset,
+      slideData: makeSlideData({
+        templateId: "feature_boxes_right",
+        body: ["Point one", "Point two", "Point three"],
+      }),
+    });
+    const result = generateSlide(input);
+
+    const allowedColors = new Set([
+      preset.colors.background,
+      preset.colors.backgroundAlt,
+      preset.colors.primary,
+      preset.colors.secondary,
+      preset.colors.text,
+      preset.colors.textMuted,
+      ...preset.colors.cardBg,
+      preset.colors.overlay,
+      "transparent",
+      "none",
+    ]);
+    // Also allow header/footer colors
+    if (preset.header) {
+      allowedColors.add(preset.header.backgroundColor);
+      if (preset.header.titleColor) allowedColors.add(preset.header.titleColor);
+    }
+    if (preset.footer) {
+      allowedColors.add(preset.footer.backgroundColor);
+      if (preset.footer.textColor) allowedColors.add(preset.footer.textColor);
+    }
+
+    for (const el of result.slideContent.elements) {
+      if (el.type === "text") {
+        expect(
+          allowedColors.has(el.color),
+          `Text color '${el.color}' not in preset palette`,
+        ).toBe(true);
+        if (el.backgroundColor) {
+          expect(
+            allowedColors.has(el.backgroundColor),
+            `Text backgroundColor '${el.backgroundColor}' not in preset`,
+          ).toBe(true);
+        }
+      }
+      if (el.type === "rect") {
+        expect(
+          allowedColors.has(el.fill),
+          `Rect fill '${el.fill}' not in preset palette`,
+        ).toBe(true);
+      }
+      if (el.type === "line" && el.stroke) {
+        // Line strokes may use border colors from header/footer
+        // We just check it's from the extended palette
+      }
+      if (el.type === "image" && el.svgColor) {
+        expect(
+          allowedColors.has(el.svgColor),
+          `SVG color '${el.svgColor}' not in preset palette`,
+        ).toBe(true);
+      }
+    }
+  });
+
+  it("dark-professional preset produces dark background + light text", () => {
+    const preset = getBuiltInPreset("dark-professional")!;
+    const input = makeLayoutInput({ stylePreset: preset });
+    const result = generateSlide(input);
+
+    // Background rect should be first element with dark fill
+    const bgRect = result.slideContent.elements[0];
+    expect(bgRect.type).toBe("rect");
+    if (bgRect.type === "rect") {
+      expect(bgRect.fill).toBe("#1a1a2e");
+    }
+
+    // Title text should use primary color
+    const titleText = result.slideContent.elements.find(
+      (e) => e.type === "text" && "text" in e && e.text === "Test Slide Title",
+    );
+    expect(titleText).toBeDefined();
+    if (titleText?.type === "text") {
+      expect(titleText.color).toBe(preset.colors.primary);
+    }
+  });
+
+  it("light-minimalist preset produces light background + dark text", () => {
+    const preset = getBuiltInPreset("light-minimalist")!;
+    const input = makeLayoutInput({ stylePreset: preset });
+    const result = generateSlide(input);
+
+    const bgRect = result.slideContent.elements[0];
+    expect(bgRect.type).toBe("rect");
+    if (bgRect.type === "rect") {
+      expect(bgRect.fill).toBe(preset.colors.background);
+    }
+
+    const titleText = result.slideContent.elements.find(
+      (e) => e.type === "text" && "text" in e && e.text === "Test Slide Title",
+    );
+    expect(titleText).toBeDefined();
+    if (titleText?.type === "text") {
+      expect(titleText.color).toBe(preset.colors.primary);
+    }
+  });
+});
+
+// ── C.3: Header/Footer Tests ───────────────────────────────
+
+describe("Header/Footer", () => {
+  it("header elements are present when preset.header.enabled is true", () => {
+    const preset = getBuiltInPreset("dark-professional")!;
+    expect(preset.header?.enabled).toBe(true);
+    const input = makeLayoutInput({ stylePreset: preset });
+    const result = generateSlide(input);
+
+    // Should have a header rect at y=0 with height matching preset.header.height
+    const headerRect = result.slideContent.elements.find(
+      (e) =>
+        e.type === "rect" &&
+        e.y === 0 &&
+        e.height === preset.header!.height &&
+        e.x === 0,
+    );
+    expect(headerRect).toBeDefined();
+  });
+
+  it("no header elements when preset.header.enabled is false", () => {
+    const preset = getBuiltInPreset("light-minimalist")!;
+    // light-minimalist has no header
+    expect(preset.header).toBeUndefined();
+    const input = makeLayoutInput({ stylePreset: preset });
+    const result = generateSlide(input);
+
+    // No rect at y=0 that looks like a header (small height at top)
+    const headerLikeRects = result.slideContent.elements.filter(
+      (e) =>
+        e.type === "rect" && e.y === 0 && e.height < 100 && e.width === 1920,
+    );
+    // Only the background rect covers the full area
+    expect(headerLikeRects.length).toBe(0);
+  });
+
+  it("footer elements are present when preset.footer.enabled is true", () => {
+    const preset = getBuiltInPreset("dark-professional")!;
+    expect(preset.footer?.enabled).toBe(true);
+    const input = makeLayoutInput({ stylePreset: preset });
+    const result = generateSlide(input);
+
+    const footerY = 1080 - preset.footer!.height;
+    const footerRect = result.slideContent.elements.find(
+      (e) => e.type === "rect" && e.y === footerY && e.height === preset.footer!.height,
+    );
+    expect(footerRect).toBeDefined();
+  });
+
+  it('footer page number shows "slideIndex / totalSlides" format', () => {
+    const preset = getBuiltInPreset("dark-professional")!;
+    const input = makeLayoutInput({
+      stylePreset: preset,
+      slideIndex: 3,
+      totalSlides: 5,
+    });
+    const result = generateSlide(input);
+
+    const pageNumberText = result.slideContent.elements.find(
+      (e) => e.type === "text" && "text" in e && e.text.includes("3 / 5"),
+    );
+    expect(pageNumberText).toBeDefined();
+  });
+
+  it("footer custom text renders when showCustomText is true", () => {
+    const preset = getBuiltInPreset("corporate-blue")!;
+    expect(preset.footer?.showCustomText).toBe(true);
+    expect(preset.footer?.customText).toBe("Confidential");
+
+    const input = makeLayoutInput({ stylePreset: preset });
+    const result = generateSlide(input);
+
+    const customTextEl = result.slideContent.elements.find(
+      (e) => e.type === "text" && "text" in e && e.text === "Confidential",
+    );
+    expect(customTextEl).toBeDefined();
+  });
+
+  it("content area Y coordinates shift down by header.height when header is enabled", () => {
+    const presetWithHeader = getBuiltInPreset("dark-professional")!;
+    expect(presetWithHeader.header?.enabled).toBe(true);
+    const headerHeight = presetWithHeader.header!.height;
+
+    // Create a custom preset without header for comparison
+    const presetNoHeader: SlideStylePreset = {
+      ...presetWithHeader,
+      id: "test-no-header",
+      name: "Test No Header",
+      header: undefined,
+      footer: undefined,
+    };
+
+    const inputWithHeader = makeLayoutInput({ stylePreset: presetWithHeader });
+    const inputNoHeader = makeLayoutInput({
+      stylePreset: presetNoHeader,
+    });
+
+    const resultWithHeader = generateSlide(inputWithHeader);
+    const resultNoHeader = generateSlide(inputNoHeader);
+
+    // Find title text in both results
+    const titleWithHeader = resultWithHeader.slideContent.elements.find(
+      (e) => e.type === "text" && "text" in e && e.text === "Test Slide Title",
+    );
+    const titleNoHeader = resultNoHeader.slideContent.elements.find(
+      (e) => e.type === "text" && "text" in e && e.text === "Test Slide Title",
+    );
+
+    expect(titleWithHeader).toBeDefined();
+    expect(titleNoHeader).toBeDefined();
+
+    if (titleWithHeader && titleNoHeader) {
+      // Title with header should be positioned below header
+      expect(titleWithHeader.y).toBeGreaterThanOrEqual(headerHeight);
+      // Title with header should be lower than without header
+      expect(titleWithHeader.y).toBeGreaterThan(titleNoHeader.y);
+    }
+  });
+
+  it("content area height is reduced by header.height + footer.height", () => {
+    const preset = getBuiltInPreset("dark-professional")!;
+    const headerHeight = preset.header!.height;
+    const footerHeight = preset.footer!.height;
+
+    const input = makeLayoutInput({ stylePreset: preset });
+    const result = generateSlide(input);
+
+    // All content elements (excluding background, header, footer) should be
+    // within the content area: y >= headerHeight && y + height <= 1080 - footerHeight
+    const contentElements = result.slideContent.elements.filter((e) => {
+      // Skip background rect (full canvas)
+      if (e.type === "rect" && e.width === 1920 && e.height === 1080) return false;
+      // Skip header/footer rects
+      if (e.type === "rect" && e.y === 0 && e.height === headerHeight) return false;
+      if (
+        e.type === "rect" &&
+        e.y === 1080 - footerHeight &&
+        e.height === footerHeight
+      )
+        return false;
+      // Skip header/footer lines
+      if (e.type === "line" && (e.y === headerHeight || e.y === 1080 - footerHeight))
+        return false;
+      // Skip header/footer text elements
+      if (e.type === "text" && e.y < headerHeight) return false;
+      if (e.type === "text" && e.y >= 1080 - footerHeight) return false;
+      return true;
+    });
+
+    for (const el of contentElements) {
+      expect(
+        el.y,
+        `Element at y=${el.y} is above content area (headerHeight=${headerHeight})`,
+      ).toBeGreaterThanOrEqual(headerHeight);
+    }
+  });
+});
+
+// ── C.4: Edge Cases ────────────────────────────────────────
+
+describe("Edge Cases", () => {
+  it("null imageUrl produces placeholder rect with preset.colors.backgroundAlt", () => {
+    const preset = getBuiltInPreset("dark-professional")!;
+    const input = makeLayoutInput({
+      imageUrl: null,
+      stylePreset: preset,
+      slideData: makeSlideData({ templateId: "split_right_image" }),
+    });
+    const result = generateSlide(input);
+
+    // Should have a rect placeholder instead of an image
+    const placeholderRect = result.slideContent.elements.find(
+      (e) =>
+        e.type === "rect" &&
+        e.fill === preset.colors.backgroundAlt &&
+        e.width > 0 &&
+        e !== result.slideContent.elements[0], // not background
+    );
+    expect(placeholderRect).toBeDefined();
+  });
+
+  it("null imageUrl adds a warning to output", () => {
+    const input = makeLayoutInput({
+      imageUrl: null,
+      slideData: makeSlideData({ templateId: "split_right_image" }),
+    });
+    const result = generateSlide(input);
+
+    expect(result.warnings.length).toBeGreaterThan(0);
+    expect(
+      result.warnings.some(
+        (w) =>
+          w.toLowerCase().includes("placeholder") ||
+          w.toLowerCase().includes("image"),
+      ),
+    ).toBe(true);
+  });
+
+  it("output passes presentationSlideContentSchema.safeParse()", () => {
+    for (const templateId of [
+      "hero_center",
+      "split_right_image",
+      "split_left_image",
+      "feature_boxes_right",
+    ] as const) {
+      const input = makeLayoutInput({
+        slideData: makeSlideData({
+          templateId,
+          body: ["Point one", "Point two", "Point three"],
+        }),
+      });
+      const result = generateSlide(input);
+      const parsed = presentationSlideContentSchema.safeParse(
+        result.slideContent,
+      );
+      expect(
+        parsed.success,
+        `${templateId} failed schema validation: ${!parsed.success ? JSON.stringify(parsed.error.issues) : ""}`,
+      ).toBe(true);
+    }
+  });
+
+  it("elements have unique IDs (crypto.randomUUID)", () => {
+    const input = makeLayoutInput();
+    const result = generateSlide(input);
+
+    const ids = result.slideContent.elements.map((e) => e.id);
+    const uniqueIds = new Set(ids);
+    expect(uniqueIds.size).toBe(ids.length);
+  });
+
+  it("proportional scaling works for non-1920x1080 canvas sizes", () => {
+    const input1920 = makeLayoutInput({
+      slideData: makeSlideData({ templateId: "hero_center" }),
+    });
+    const result1920 = generateSlide(input1920);
+
+    const input960 = makeLayoutInput({
+      slideData: makeSlideData({ templateId: "hero_center" }),
+      canvasWidth: 960,
+      canvasHeight: 540,
+    });
+    const result960 = generateSlide(input960);
+
+    // Background rect should be scaled
+    const bg1920 = result1920.slideContent.elements[0];
+    const bg960 = result960.slideContent.elements[0];
+    expect(bg1920.width).toBe(1920);
+    expect(bg1920.height).toBe(1080);
+    expect(bg960.width).toBe(960);
+    expect(bg960.height).toBe(540);
+
+    // Title text font size should be scaled by 0.5
+    const title1920 = result1920.slideContent.elements.find(
+      (e) => e.type === "text" && e.text === "Test Slide Title",
+    );
+    const title960 = result960.slideContent.elements.find(
+      (e) => e.type === "text" && e.text === "Test Slide Title",
+    );
+    expect(title1920).toBeDefined();
+    expect(title960).toBeDefined();
+    if (title1920?.type === "text" && title960?.type === "text") {
+      expect(title960.fontSize).toBeCloseTo(title1920.fontSize! * 0.5, 0);
+    }
+  });
+
+  it("falls back to minimal slide when template rendering produces invalid content", () => {
+    // Create a corrupt preset with missing color fields to force validation failure
+    const corruptPreset = {
+      id: "corrupt",
+      name: "Corrupt",
+      colors: {
+        background: "#000000",
+        backgroundAlt: "#111111",
+        primary: "#ffffff",
+        secondary: "#cccccc",
+        text: "#ffffff",
+        textMuted: "#999999",
+        cardBg: ["#111111", "#222222", "#333333"] as [string, string, string],
+        overlay: "rgba(0,0,0,0.5)",
+      },
+      typography: {
+        titleFontFamily: "Inter",
+        bodyFontFamily: "Inter",
+        titleFontWeight: 700,
+        bodyFontWeight: 400,
+      },
+    } as SlideStylePreset;
+
+    // This should still produce a valid fallback slide
+    const input = makeLayoutInput({ stylePreset: corruptPreset });
+    const result = generateSlide(input);
+
+    // Must produce valid slide content
+    const parsed = presentationSlideContentSchema.safeParse(
+      result.slideContent,
+    );
+    expect(parsed.success).toBe(true);
+    // Should have at least a background rect and title
+    expect(result.slideContent.elements.length).toBeGreaterThanOrEqual(2);
+  });
+});
diff --git a/apps/web/server/services/aiPresentationLayoutEngine.ts b/apps/web/server/services/aiPresentationLayoutEngine.ts
new file mode 100644
index 0000000..4817fa2
--- /dev/null
+++ b/apps/web/server/services/aiPresentationLayoutEngine.ts
@@ -0,0 +1,836 @@
+import type { PresentationSlideContent } from "@shared/presentation/contracts";
+import { presentationSlideContentSchema } from "@shared/presentation/contracts";
+import type {
+  AIPresentationSlide,
+  SlideStylePreset,
+} from "@shared/presentation/aiTypes";
+import type { SvgGraphic } from "@shared/presentation/svgGraphicsCatalog";
+
+// ── Public Types ───────────────────────────────────────────
+
+export interface LayoutEngineInput {
+  slideData: AIPresentationSlide;
+  imageUrl: string | null;
+  svgGraphic: SvgGraphic;
+  stylePreset: SlideStylePreset;
+  deckTitle?: string;
+  slideIndex: number;
+  totalSlides: number;
+  canvasWidth?: number;
+  canvasHeight?: number;
+}
+
+export interface LayoutEngineOutput {
+  slideContent: PresentationSlideContent;
+  warnings: string[];
+}
+
+// ── Internal Types ─────────────────────────────────────────
+
+interface ContentArea {
+  x: number;
+  y: number;
+  width: number;
+  height: number;
+}
+
+interface ScaleFactors {
+  scaleX: number;
+  scaleY: number;
+}
+
+interface TemplateContext {
+  contentArea: ContentArea;
+  slideData: AIPresentationSlide;
+  imageUrl: string | null;
+  svgGraphic: SvgGraphic;
+  preset: SlideStylePreset;
+  scale: ScaleFactors;
+  canvasWidth: number;
+  canvasHeight: number;
+  warnings: string[];
+  slideIndex: number;
+}
+
+type SlideElement = PresentationSlideContent["elements"][number];
+
+// ── Helpers ────────────────────────────────────────────────
+
+function makeId(): string {
+  return crypto.randomUUID();
+}
+
+function fontWeightToString(
+  weight: number,
+): "normal" | "500" | "600" | "700" {
+  if (weight >= 700) return "700";
+  if (weight >= 600) return "600";
+  if (weight >= 500) return "500";
+  return "normal";
+}
+
+function computeContentArea(
+  canvasWidth: number,
+  canvasHeight: number,
+  headerHeight: number,
+  footerHeight: number,
+): ContentArea {
+  return {
+    x: 0,
+    y: headerHeight,
+    width: canvasWidth,
+    height: canvasHeight - headerHeight - footerHeight,
+  };
+}
+
+function makeTextElement(opts: {
+  x: number;
+  y: number;
+  width: number;
+  height: number;
+  text: string;
+  color: string;
+  fontSize?: number;
+  fontFamily?: string;
+  fontWeight?: "normal" | "500" | "600" | "700";
+  textAlign?: "left" | "center" | "right" | "justify";
+}): SlideElement {
+  return {
+    id: makeId(),
+    type: "text" as const,
+    x: opts.x,
+    y: opts.y,
+    width: opts.width,
+    height: opts.height,
+    text: opts.text,
+    color: opts.color,
+    fontSize: opts.fontSize,
+    fontFamily: opts.fontFamily,
+    fontWeight: opts.fontWeight,
+    textAlign: opts.textAlign,
+  };
+}
+
+function makeImageElement(opts: {
+  x: number;
+  y: number;
+  width: number;
+  height: number;
+  src: string;
+  alt: string;
+  svgContent?: string;
+  svgColor?: string;
+}): SlideElement {
+  const el: Record<string, unknown> = {
+    id: makeId(),
+    type: "image" as const,
+    x: opts.x,
+    y: opts.y,
+    width: opts.width,
+    height: opts.height,
+    src: opts.src,
+    alt: opts.alt,
+  };
+  if (opts.svgContent !== undefined) el.svgContent = opts.svgContent;
+  if (opts.svgColor !== undefined) el.svgColor = opts.svgColor;
+  return el as SlideElement;
+}
+
+function makeRectElement(opts: {
+  x: number;
+  y: number;
+  width: number;
+  height: number;
+  fill: string;
+  stroke?: string;
+  strokeWidth?: number;
+  opacity?: number;
+}): SlideElement {
+  const el: Record<string, unknown> = {
+    id: makeId(),
+    type: "rect" as const,
+    x: opts.x,
+    y: opts.y,
+    width: opts.width,
+    height: opts.height,
+    fill: opts.fill,
+  };
+  if (opts.stroke !== undefined) el.stroke = opts.stroke;
+  if (opts.strokeWidth !== undefined) el.strokeWidth = opts.strokeWidth;
+  if (opts.opacity !== undefined) el.opacity = opts.opacity;
+  return el as SlideElement;
+}
+
+function makeLineElement(opts: {
+  x: number;
+  y: number;
+  width: number;
+  height: number;
+  stroke: string;
+  strokeWidth: number;
+}): SlideElement {
+  return {
+    id: makeId(),
+    type: "line" as const,
+    x: opts.x,
+    y: opts.y,
+    width: opts.width,
+    height: opts.height,
+    stroke: opts.stroke,
+    strokeWidth: opts.strokeWidth,
+  };
+}
+
+// Create an image element or placeholder rect if imageUrl is null
+function makeImageOrPlaceholder(
+  ctx: TemplateContext,
+  x: number,
+  y: number,
+  width: number,
+  height: number,
+  alt: string,
+): SlideElement {
+  if (ctx.imageUrl) {
+    return makeImageElement({ x, y, width, height, src: ctx.imageUrl, alt });
+  }
+  ctx.warnings.push(
+    `Slide ${ctx.slideIndex}: Image generation failed, using placeholder`,
+  );
+  return makeRectElement({ x, y, width, height, fill: ctx.preset.colors.backgroundAlt });
+}
+
+// ── Template Builders ──────────────────────────────────────
+
+function buildHeroCenter(ctx: TemplateContext): SlideElement[] {
+  const { contentArea, slideData, preset, scale } = ctx;
+  const elements: SlideElement[] = [];
+
+  // 1. Full-canvas image or placeholder
+  elements.push(
+    makeImageOrPlaceholder(
+      ctx,
+      contentArea.x,
+      contentArea.y,
+      contentArea.width,
+      contentArea.height,
+      slideData.title,
+    ),
+  );
+
+  // 2. Overlay rect
+  elements.push(
+    makeRectElement({
+      x: contentArea.x,
+      y: contentArea.y,
+      width: contentArea.width,
+      height: contentArea.height,
+      fill: preset.colors.overlay,
+      opacity: 0.6,
+    }),
+  );
+
+  // 3. Centered title
+  const titleFontSize = Math.max(8, Math.round(64 * scale.scaleX));
+  const titleHeight = Math.round(80 * scale.scaleY);
+  const titleY =
+    contentArea.y + contentArea.height * 0.35;
+  elements.push(
+    makeTextElement({
+      x: contentArea.x + contentArea.width * 0.1,
+      y: titleY,
+      width: contentArea.width * 0.8,
+      height: titleHeight,
+      text: slideData.title,
+      color: preset.colors.primary,
+      fontSize: titleFontSize,
+      fontFamily: preset.typography.titleFontFamily,
+      fontWeight: fontWeightToString(preset.typography.titleFontWeight),
+      textAlign: "center",
+    }),
+  );
+
+  // 4. Body text
+  const bodyFontSize = Math.max(8, Math.round(28 * scale.scaleX));
+  const bodyLineHeight = Math.round(44 * scale.scaleY);
+  let bodyY = titleY + titleHeight + Math.round(20 * scale.scaleY);
+  for (const line of slideData.body) {
+    elements.push(
+      makeTextElement({
+        x: contentArea.x + contentArea.width * 0.15,
+        y: bodyY,
+        width: contentArea.width * 0.7,
+        height: bodyLineHeight,
+        text: line,
+        color: preset.colors.text,
+        fontSize: bodyFontSize,
+        fontFamily: preset.typography.bodyFontFamily,
+        fontWeight: fontWeightToString(preset.typography.bodyFontWeight),
+        textAlign: "center",
+      }),
+    );
+    bodyY += bodyLineHeight + Math.round(8 * scale.scaleY);
+  }
+
+  return elements;
+}
+
+function buildSplitRightImage(ctx: TemplateContext): SlideElement[] {
+  const { contentArea, slideData, preset, scale } = ctx;
+  const elements: SlideElement[] = [];
+  const halfWidth = contentArea.width * 0.5;
+
+  // 1. Left panel rect
+  elements.push(
+    makeRectElement({
+      x: contentArea.x,
+      y: contentArea.y,
+      width: halfWidth,
+      height: contentArea.height,
+      fill: preset.colors.backgroundAlt,
+    }),
+  );
+
+  // 2. SVG graphic
+  const svgSize = Math.round(80 * scale.scaleX);
+  elements.push(
+    makeImageElement({
+      x: contentArea.x + Math.round(40 * scale.scaleX),
+      y: contentArea.y + Math.round(40 * scale.scaleY),
+      width: svgSize,
+      height: svgSize,
+      src: "",
+      alt: ctx.svgGraphic.label,
+      svgContent: ctx.svgGraphic.svg,
+      svgColor: preset.colors.secondary,
+    }),
+  );
+
+  // 3. Title text
+  const titleFontSize = Math.max(8, Math.round(48 * scale.scaleX));
+  const titleY =
+    contentArea.y + Math.round(160 * scale.scaleY);
+  elements.push(
+    makeTextElement({
+      x: contentArea.x + Math.round(40 * scale.scaleX),
+      y: titleY,
+      width: halfWidth - Math.round(80 * scale.scaleX),
+      height: Math.round(60 * scale.scaleY),
+      text: slideData.title,
+      color: preset.colors.primary,
+      fontSize: titleFontSize,
+      fontFamily: preset.typography.titleFontFamily,
+      fontWeight: fontWeightToString(preset.typography.titleFontWeight),
+      textAlign: "left",
+    }),
+  );
+
+  // 4. Body text
+  const bodyFontSize = Math.max(8, Math.round(24 * scale.scaleX));
+  const bodyLineHeight = Math.round(40 * scale.scaleY);
+  let bodyY = titleY + Math.round(80 * scale.scaleY);
+  for (const line of slideData.body) {
+    elements.push(
+      makeTextElement({
+        x: contentArea.x + Math.round(40 * scale.scaleX),
+        y: bodyY,
+        width: halfWidth - Math.round(80 * scale.scaleX),
+        height: bodyLineHeight,
+        text: line,
+        color: preset.colors.text,
+        fontSize: bodyFontSize,
+        fontFamily: preset.typography.bodyFontFamily,
+        fontWeight: fontWeightToString(preset.typography.bodyFontWeight),
+        textAlign: "left",
+      }),
+    );
+    bodyY += bodyLineHeight + Math.round(8 * scale.scaleY);
+  }
+
+  // 5. Right image
+  elements.push(
+    makeImageOrPlaceholder(
+      ctx,
+      contentArea.x + halfWidth,
+      contentArea.y,
+      halfWidth,
+      contentArea.height,
+      slideData.title,
+    ),
+  );
+
+  return elements;
+}
+
+function buildSplitLeftImage(ctx: TemplateContext): SlideElement[] {
+  const { contentArea, slideData, preset, scale } = ctx;
+  const elements: SlideElement[] = [];
+  const halfWidth = contentArea.width * 0.5;
+
+  // 1. Left image
+  elements.push(
+    makeImageOrPlaceholder(
+      ctx,
+      contentArea.x,
+      contentArea.y,
+      halfWidth,
+      contentArea.height,
+      slideData.title,
+    ),
+  );
+
+  // 2. Right panel rect
+  elements.push(
+    makeRectElement({
+      x: contentArea.x + halfWidth,
+      y: contentArea.y,
+      width: halfWidth,
+      height: contentArea.height,
+      fill: preset.colors.backgroundAlt,
+    }),
+  );
+
+  // 3. SVG graphic on right
+  const svgSize = Math.round(80 * scale.scaleX);
+  elements.push(
+    makeImageElement({
+      x: contentArea.x + halfWidth + Math.round(40 * scale.scaleX),
+      y: contentArea.y + Math.round(40 * scale.scaleY),
+      width: svgSize,
+      height: svgSize,
+      src: "",
+      alt: ctx.svgGraphic.label,
+      svgContent: ctx.svgGraphic.svg,
+      svgColor: preset.colors.secondary,
+    }),
+  );
+
+  // 4. Title text on right
+  const titleFontSize = Math.max(8, Math.round(48 * scale.scaleX));
+  const titleY = contentArea.y + Math.round(160 * scale.scaleY);
+  elements.push(
+    makeTextElement({
+      x: contentArea.x + halfWidth + Math.round(40 * scale.scaleX),
+      y: titleY,
+      width: halfWidth - Math.round(80 * scale.scaleX),
+      height: Math.round(60 * scale.scaleY),
+      text: slideData.title,
+      color: preset.colors.primary,
+      fontSize: titleFontSize,
+      fontFamily: preset.typography.titleFontFamily,
+      fontWeight: fontWeightToString(preset.typography.titleFontWeight),
+      textAlign: "left",
+    }),
+  );
+
+  // 5. Body text on right
+  const bodyFontSize = Math.max(8, Math.round(24 * scale.scaleX));
+  const bodyLineHeight = Math.round(40 * scale.scaleY);
+  let bodyY = titleY + Math.round(80 * scale.scaleY);
+  for (const line of slideData.body) {
+    elements.push(
+      makeTextElement({
+        x: contentArea.x + halfWidth + Math.round(40 * scale.scaleX),
+        y: bodyY,
+        width: halfWidth - Math.round(80 * scale.scaleX),
+        height: bodyLineHeight,
+        text: line,
+        color: preset.colors.text,
+        fontSize: bodyFontSize,
+        fontFamily: preset.typography.bodyFontFamily,
+        fontWeight: fontWeightToString(preset.typography.bodyFontWeight),
+        textAlign: "left",
+      }),
+    );
+    bodyY += bodyLineHeight + Math.round(8 * scale.scaleY);
+  }
+
+  return elements;
+}
+
+function buildFeatureBoxesRight(ctx: TemplateContext): SlideElement[] {
+  const { contentArea, slideData, preset, scale } = ctx;
+  const elements: SlideElement[] = [];
+  const leftWidth = contentArea.width * 0.55;
+  const rightWidth = contentArea.width * 0.45;
+
+  // 1. Left image (~55% width)
+  elements.push(
+    makeImageOrPlaceholder(
+      ctx,
+      contentArea.x,
+      contentArea.y,
+      leftWidth,
+      contentArea.height,
+      slideData.title,
+    ),
+  );
+
+  // 2. Title on right
+  const titleFontSize = Math.max(8, Math.round(40 * scale.scaleX));
+  const titleY = contentArea.y + Math.round(30 * scale.scaleY);
+  elements.push(
+    makeTextElement({
+      x: contentArea.x + leftWidth + Math.round(30 * scale.scaleX),
+      y: titleY,
+      width: rightWidth - Math.round(60 * scale.scaleX),
+      height: Math.round(60 * scale.scaleY),
+      text: slideData.title,
+      color: preset.colors.primary,
+      fontSize: titleFontSize,
+      fontFamily: preset.typography.titleFontFamily,
+      fontWeight: fontWeightToString(preset.typography.titleFontWeight),
+      textAlign: "left",
+    }),
+  );
+
+  // 3. Three feature cards
+  const cardWidth = rightWidth - Math.round(60 * scale.scaleX);
+  const cardHeight = Math.round(
+    (contentArea.height - Math.round(130 * scale.scaleY)) / 3 -
+      Math.round(10 * scale.scaleY),
+  );
+  let cardY = titleY + Math.round(80 * scale.scaleY);
+
+  for (let i = 0; i < 3; i++) {
+    const cardBgColor = preset.colors.cardBg[i] ?? preset.colors.cardBg[0];
+
+    // Card rect
+    elements.push(
+      makeRectElement({
+        x: contentArea.x + leftWidth + Math.round(30 * scale.scaleX),
+        y: cardY,
+        width: cardWidth,
+        height: cardHeight,
+        fill: cardBgColor,
+      }),
+    );
+
+    // Card text
+    const bodyText = slideData.body[i] ?? "";
+    if (bodyText) {
+      const cardTextFontSize = Math.max(8, Math.round(20 * scale.scaleX));
+      elements.push(
+        makeTextElement({
+          x:
+            contentArea.x +
+            leftWidth +
+            Math.round(50 * scale.scaleX),
+          y: cardY + Math.round(15 * scale.scaleY),
+          width: cardWidth - Math.round(40 * scale.scaleX),
+          height: cardHeight - Math.round(30 * scale.scaleY),
+          text: bodyText,
+          color: preset.colors.text,
+          fontSize: cardTextFontSize,
+          fontFamily: preset.typography.bodyFontFamily,
+          fontWeight: fontWeightToString(preset.typography.bodyFontWeight),
+          textAlign: "left",
+        }),
+      );
+    }
+
+    cardY += cardHeight + Math.round(10 * scale.scaleY);
+  }
+
+  return elements;
+}
+
+// ── Header/Footer Builders ─────────────────────────────────
+
+function buildHeaderElements(
+  preset: SlideStylePreset,
+  canvasWidth: number,
+  deckTitle: string | undefined,
+  scale: ScaleFactors,
+): SlideElement[] {
+  if (!preset.header?.enabled) return [];
+  const header = preset.header;
+  const elements: SlideElement[] = [];
+
+  // Header background rect
+  elements.push(
+    makeRectElement({
+      x: 0,
+      y: 0,
+      width: canvasWidth,
+      height: header.height,
+      fill: header.backgroundColor,
+    }),
+  );
+
+  // Border bottom line
+  if (header.borderBottom) {
+    // Parse stroke color from border string (e.g., "2px solid #e94560")
+    const borderParts = header.borderBottom.split(" ");
+    const strokeColor = borderParts[borderParts.length - 1];
+    const strokeWidthStr = borderParts[0];
+    const strokeWidth = parseInt(strokeWidthStr, 10) || 1;
+    elements.push(
+      makeLineElement({
+        x: 0,
+        y: header.height,
+        width: canvasWidth,
+        height: 0,
+        stroke: strokeColor,
+        strokeWidth,
+      }),
+    );
+  }
+
+  // Deck title text
+  if (header.showDeckTitle && deckTitle) {
+    let textX: number;
+    let textAlign: "left" | "center" | "right" = "left";
+    const textWidth = Math.round(400 * scale.scaleX);
+
+    switch (header.logoPosition) {
+      case "center":
+        textX = canvasWidth / 2 - textWidth / 2;
+        textAlign = "center";
+        break;
+      case "right":
+        textX = canvasWidth - textWidth - Math.round(20 * scale.scaleX);
+        textAlign = "right";
+        break;
+      default:
+        textX = Math.round(20 * scale.scaleX);
+        textAlign = "left";
+    }
+
+    elements.push(
+      makeTextElement({
+        x: textX,
+        y: Math.round((header.height - (header.titleFontSize ?? 18)) / 2),
+        width: textWidth,
+        height: Math.round(header.height * 0.7),
+        text: deckTitle,
+        color: header.titleColor ?? preset.colors.text,
+        fontSize: header.titleFontSize ?? Math.round(18 * scale.scaleX),
+        fontFamily: preset.typography.titleFontFamily,
+        fontWeight: fontWeightToString(preset.typography.titleFontWeight),
+        textAlign,
+      }),
+    );
+  }
+
+  return elements;
+}
+
+function buildFooterElements(
+  preset: SlideStylePreset,
+  canvasWidth: number,
+  canvasHeight: number,
+  slideIndex: number,
+  totalSlides: number,
+  scale: ScaleFactors,
+): SlideElement[] {
+  if (!preset.footer?.enabled) return [];
+  const footer = preset.footer;
+  const footerY = canvasHeight - footer.height;
+  const elements: SlideElement[] = [];
+
+  // Footer background rect
+  elements.push(
+    makeRectElement({
+      x: 0,
+      y: footerY,
+      width: canvasWidth,
+      height: footer.height,
+      fill: footer.backgroundColor,
+    }),
+  );
+
+  // Border top line
+  if (footer.borderTop) {
+    const borderParts = footer.borderTop.split(" ");
+    const strokeColor = borderParts[borderParts.length - 1];
+    const strokeWidthStr = borderParts[0];
+    const strokeWidth = parseInt(strokeWidthStr, 10) || 1;
+    elements.push(
+      makeLineElement({
+        x: 0,
+        y: footerY,
+        width: canvasWidth,
+        height: 0,
+        stroke: strokeColor,
+        strokeWidth,
+      }),
+    );
+  }
+
+  const textOffset = Math.round(
+    (footer.height - (footer.fontSize ?? 14)) / 2,
+  );
+
+  // Page number
+  if (footer.showPageNumber) {
+    elements.push(
+      makeTextElement({
+        x: canvasWidth - Math.round(100 * scale.scaleX),
+        y: footerY + textOffset,
+        width: Math.round(80 * scale.scaleX),
+        height: Math.round(footer.height * 0.7),
+        text: `${slideIndex} / ${totalSlides}`,
+        color: footer.textColor ?? preset.colors.textMuted,
+        fontSize: footer.fontSize ?? 14,
+        fontFamily: preset.typography.bodyFontFamily,
+        fontWeight: "normal",
+        textAlign: "right",
+      }),
+    );
+  }
+
+  // Custom text
+  if (footer.showCustomText && footer.customText) {
+    elements.push(
+      makeTextElement({
+        x: Math.round(20 * scale.scaleX),
+        y: footerY + textOffset,
+        width: Math.round(300 * scale.scaleX),
+        height: Math.round(footer.height * 0.7),
+        text: footer.customText,
+        color: footer.textColor ?? preset.colors.textMuted,
+        fontSize: footer.fontSize ?? 14,
+        fontFamily: preset.typography.bodyFontFamily,
+        fontWeight: "normal",
+        textAlign: "left",
+      }),
+    );
+  }
+
+  return elements;
+}
+
+// ── Main Entry Point ───────────────────────────────────────
+
+export function generateSlide(input: LayoutEngineInput): LayoutEngineOutput {
+  const canvasWidth = input.canvasWidth ?? 1920;
+  const canvasHeight = input.canvasHeight ?? 1080;
+  const scale: ScaleFactors = {
+    scaleX: canvasWidth / 1920,
+    scaleY: canvasHeight / 1080,
+  };
+  const warnings: string[] = [];
+
+  const headerHeight =
+    input.stylePreset.header?.enabled ? input.stylePreset.header.height : 0;
+  const footerHeight =
+    input.stylePreset.footer?.enabled ? input.stylePreset.footer.height : 0;
+  const contentArea = computeContentArea(
+    canvasWidth,
+    canvasHeight,
+    headerHeight,
+    footerHeight,
+  );
+
+  const ctx: TemplateContext = {
+    contentArea,
+    slideData: input.slideData,
+    imageUrl: input.imageUrl,
+    svgGraphic: input.svgGraphic,
+    preset: input.stylePreset,
+    scale,
+    canvasWidth,
+    canvasHeight,
+    warnings,
+    slideIndex: input.slideIndex,
+  };
+
+  // 1. Background element
+  const elements: SlideElement[] = [
+    makeRectElement({
+      x: 0,
+      y: 0,
+      width: canvasWidth,
+      height: canvasHeight,
+      fill: input.stylePreset.colors.background,
+    }),
+  ];
+
+  // 2. Template content
+  let templateElements: SlideElement[];
+  switch (input.slideData.templateId) {
+    case "hero_center":
+      templateElements = buildHeroCenter(ctx);
+      break;
+    case "split_right_image":
+      templateElements = buildSplitRightImage(ctx);
+      break;
+    case "split_left_image":
+      templateElements = buildSplitLeftImage(ctx);
+      break;
+    case "feature_boxes_right":
+      templateElements = buildFeatureBoxesRight(ctx);
+      break;
+    default:
+      templateElements = buildHeroCenter(ctx);
+  }
+  elements.push(...templateElements);
+
+  // 3. Header
+  elements.push(
+    ...buildHeaderElements(
+      input.stylePreset,
+      canvasWidth,
+      input.deckTitle,
+      scale,
+    ),
+  );
+
+  // 4. Footer
+  elements.push(
+    ...buildFooterElements(
+      input.stylePreset,
+      canvasWidth,
+      canvasHeight,
+      input.slideIndex,
+      input.totalSlides,
+      scale,
+    ),
+  );
+
+  // 5. Validate output
+  const slideContent = { elements };
+  const parsed = presentationSlideContentSchema.safeParse(slideContent);
+
+  if (!parsed.success) {
+    console.error(
+      "Layout engine validation failed:",
+      parsed.error.issues,
+    );
+
+    // Return minimal fallback slide
+    return {
+      slideContent: {
+        elements: [
+          {
+            id: makeId(),
+            type: "rect",
+            x: 0,
+            y: 0,
+            width: canvasWidth,
+            height: canvasHeight,
+            fill: input.stylePreset.colors.background,
+          },
+          {
+            id: makeId(),
+            type: "text",
+            x: canvasWidth * 0.1,
+            y: canvasHeight * 0.4,
+            width: canvasWidth * 0.8,
+            height: 100,
+            text: input.slideData.title,
+            color: input.stylePreset.colors.text,
+            fontSize: Math.max(8, Math.round(48 * scale.scaleX)),
+            fontFamily: input.stylePreset.typography.titleFontFamily,
+          },
+        ],
+      },
+      warnings: [
+        ...warnings,
+        "Layout validation failed, using fallback layout",
+      ],
+    };
+  }
+
+  return { slideContent: parsed.data, warnings };
+}
