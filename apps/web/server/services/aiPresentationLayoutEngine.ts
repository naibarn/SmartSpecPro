import type { PresentationSlideContent } from "@shared/presentation/contracts";
import { presentationSlideContentSchema } from "@shared/presentation/contracts";
import type {
  AIPresentationSlide,
  SlideStylePreset,
} from "@shared/presentation/aiTypes";
import type { SvgGraphic } from "@shared/presentation/svgGraphicsCatalog";
import { auditLogger } from "./auditLogger";

// ── Public Types ───────────────────────────────────────────

export interface LayoutEngineInput {
  slideData: AIPresentationSlide;
  imageUrl: string | null;
  svgGraphic: SvgGraphic | null;
  stylePreset: SlideStylePreset;
  deckTitle?: string;
  slideIndex: number;
  totalSlides: number;
  canvasWidth?: number;
  canvasHeight?: number;
}

export interface LayoutEngineOutput {
  slideContent: PresentationSlideContent;
  warnings: string[];
}

// ── Internal Types ─────────────────────────────────────────

interface ContentArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ScaleFactors {
  scaleX: number;
  scaleY: number;
}

interface TemplateContext {
  contentArea: ContentArea;
  slideData: AIPresentationSlide;
  imageUrl: string | null;
  svgGraphic: SvgGraphic | null;
  preset: SlideStylePreset;
  scale: ScaleFactors;
  canvasWidth: number;
  canvasHeight: number;
  warnings: string[];
  slideIndex: number;
}

type SlideElement = PresentationSlideContent["elements"][number];

// ── Helpers ────────────────────────────────────────────────

function makeId(): string {
  return crypto.randomUUID();
}

function fontWeightToString(
  weight: number,
): "normal" | "500" | "600" | "700" {
  if (weight >= 700) return "700";
  if (weight >= 600) return "600";
  if (weight >= 500) return "500";
  return "normal";
}

function computeContentArea(
  canvasWidth: number,
  canvasHeight: number,
  headerHeight: number,
  footerHeight: number,
): ContentArea {
  return {
    x: 0,
    y: headerHeight,
    width: canvasWidth,
    height: canvasHeight - headerHeight - footerHeight,
  };
}

function makeTextElement(opts: {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: "normal" | "500" | "600" | "700";
  textAlign?: "left" | "center" | "right" | "justify";
}): SlideElement {
  const el: Record<string, unknown> = {
    id: makeId(),
    type: "text" as const,
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    text: opts.text,
    color: opts.color,
  };
  if (opts.fontSize !== undefined) el.fontSize = opts.fontSize;
  if (opts.fontFamily !== undefined) el.fontFamily = opts.fontFamily;
  if (opts.fontWeight !== undefined) el.fontWeight = opts.fontWeight;
  if (opts.textAlign !== undefined) el.textAlign = opts.textAlign;
  return el as SlideElement;
}

function makeImageElement(opts: {
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  alt: string;
  svgContent?: string;
  svgColor?: string;
}): SlideElement {
  const el: Record<string, unknown> = {
    id: makeId(),
    type: "image" as const,
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    src: opts.src,
    alt: opts.alt,
  };
  if (opts.svgContent !== undefined) el.svgContent = opts.svgContent;
  if (opts.svgColor !== undefined) el.svgColor = opts.svgColor;
  return el as SlideElement;
}

function makeRectElement(opts: {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}): SlideElement {
  const el: Record<string, unknown> = {
    id: makeId(),
    type: "rect" as const,
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    fill: opts.fill,
  };
  if (opts.stroke !== undefined) el.stroke = opts.stroke;
  if (opts.strokeWidth !== undefined) el.strokeWidth = opts.strokeWidth;
  if (opts.opacity !== undefined) el.opacity = opts.opacity;
  return el as SlideElement;
}

function makeLineElement(opts: {
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
}): SlideElement {
  return {
    id: makeId(),
    type: "line" as const,
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    stroke: opts.stroke,
    strokeWidth: opts.strokeWidth,
  };
}

// Create an image element or placeholder rect if imageUrl is null
function makeImageOrPlaceholder(
  ctx: TemplateContext,
  x: number,
  y: number,
  width: number,
  height: number,
  alt: string,
): SlideElement {
  if (ctx.imageUrl) {
    return makeImageElement({ x, y, width, height, src: ctx.imageUrl, alt });
  }
  ctx.warnings.push(
    `Slide ${ctx.slideIndex}: Image generation failed, using placeholder`,
  );
  return makeRectElement({ x, y, width, height, fill: ctx.preset.colors.backgroundAlt });
}

// ── Template Builders ──────────────────────────────────────

function buildHeroCenter(ctx: TemplateContext): SlideElement[] {
  const { contentArea, slideData, preset, scale } = ctx;
  const elements: SlideElement[] = [];

  // 1. Full-canvas image or placeholder
  elements.push(
    makeImageOrPlaceholder(
      ctx,
      contentArea.x,
      contentArea.y,
      contentArea.width,
      contentArea.height,
      slideData.title,
    ),
  );

  // 2. Overlay rect
  elements.push(
    makeRectElement({
      x: contentArea.x,
      y: contentArea.y,
      width: contentArea.width,
      height: contentArea.height,
      fill: preset.colors.overlay,
    }),
  );

  // 3. Centered title
  const titleFontSize = Math.max(8, Math.round(64 * scale.scaleX));
  const titleHeight = Math.round(80 * scale.scaleY);
  const titleY =
    contentArea.y + contentArea.height * 0.35;
  elements.push(
    makeTextElement({
      x: contentArea.x + contentArea.width * 0.1,
      y: titleY,
      width: contentArea.width * 0.8,
      height: titleHeight,
      text: slideData.title,
      color: preset.colors.primary,
      fontSize: titleFontSize,
      fontFamily: preset.typography.titleFontFamily,
      fontWeight: fontWeightToString(preset.typography.titleFontWeight),
      textAlign: "center",
    }),
  );

  // 4. Body text
  const bodyFontSize = Math.max(8, Math.round(28 * scale.scaleX));
  const bodyLineHeight = Math.round(44 * scale.scaleY);
  let bodyY = titleY + titleHeight + Math.round(20 * scale.scaleY);
  for (const line of slideData.body) {
    elements.push(
      makeTextElement({
        x: contentArea.x + contentArea.width * 0.15,
        y: bodyY,
        width: contentArea.width * 0.7,
        height: bodyLineHeight,
        text: line,
        color: preset.colors.text,
        fontSize: bodyFontSize,
        fontFamily: preset.typography.bodyFontFamily,
        fontWeight: fontWeightToString(preset.typography.bodyFontWeight),
        textAlign: "center",
      }),
    );
    bodyY += bodyLineHeight + Math.round(8 * scale.scaleY);
  }

  return elements;
}

function buildSplitRightImage(ctx: TemplateContext): SlideElement[] {
  const { contentArea, slideData, preset, scale } = ctx;
  const elements: SlideElement[] = [];
  const halfWidth = contentArea.width * 0.5;

  // 1. Left panel rect
  elements.push(
    makeRectElement({
      x: contentArea.x,
      y: contentArea.y,
      width: halfWidth,
      height: contentArea.height,
      fill: preset.colors.backgroundAlt,
    }),
  );

  // 2. SVG graphic (skip if no graphic available for category)
  if (ctx.svgGraphic) {
    const svgSize = Math.round(80 * scale.scaleX);
    elements.push(
      makeImageElement({
        x: contentArea.x + Math.round(40 * scale.scaleX),
        y: contentArea.y + Math.round(40 * scale.scaleY),
        width: svgSize,
        height: svgSize,
        src: "",
        alt: ctx.svgGraphic.label,
        svgContent: ctx.svgGraphic.svg,
        svgColor: preset.colors.secondary,
      }),
    );
  }

  // 3. Title text
  const titleFontSize = Math.max(8, Math.round(48 * scale.scaleX));
  const titleY =
    contentArea.y + Math.round(160 * scale.scaleY);
  elements.push(
    makeTextElement({
      x: contentArea.x + Math.round(40 * scale.scaleX),
      y: titleY,
      width: halfWidth - Math.round(80 * scale.scaleX),
      height: Math.round(60 * scale.scaleY),
      text: slideData.title,
      color: preset.colors.primary,
      fontSize: titleFontSize,
      fontFamily: preset.typography.titleFontFamily,
      fontWeight: fontWeightToString(preset.typography.titleFontWeight),
      textAlign: "left",
    }),
  );

  // 4. Body text
  const bodyFontSize = Math.max(8, Math.round(24 * scale.scaleX));
  const bodyLineHeight = Math.round(40 * scale.scaleY);
  let bodyY = titleY + Math.round(80 * scale.scaleY);
  for (const line of slideData.body) {
    elements.push(
      makeTextElement({
        x: contentArea.x + Math.round(40 * scale.scaleX),
        y: bodyY,
        width: halfWidth - Math.round(80 * scale.scaleX),
        height: bodyLineHeight,
        text: line,
        color: preset.colors.text,
        fontSize: bodyFontSize,
        fontFamily: preset.typography.bodyFontFamily,
        fontWeight: fontWeightToString(preset.typography.bodyFontWeight),
        textAlign: "left",
      }),
    );
    bodyY += bodyLineHeight + Math.round(8 * scale.scaleY);
  }

  // 5. Right image
  elements.push(
    makeImageOrPlaceholder(
      ctx,
      contentArea.x + halfWidth,
      contentArea.y,
      halfWidth,
      contentArea.height,
      slideData.title,
    ),
  );

  return elements;
}

function buildSplitLeftImage(ctx: TemplateContext): SlideElement[] {
  const { contentArea, slideData, preset, scale } = ctx;
  const elements: SlideElement[] = [];
  const halfWidth = contentArea.width * 0.5;

  // 1. Left image
  elements.push(
    makeImageOrPlaceholder(
      ctx,
      contentArea.x,
      contentArea.y,
      halfWidth,
      contentArea.height,
      slideData.title,
    ),
  );

  // 2. Right panel rect
  elements.push(
    makeRectElement({
      x: contentArea.x + halfWidth,
      y: contentArea.y,
      width: halfWidth,
      height: contentArea.height,
      fill: preset.colors.backgroundAlt,
    }),
  );

  // 3. SVG graphic on right (skip if no graphic available)
  if (ctx.svgGraphic) {
    const svgSize = Math.round(80 * scale.scaleX);
    elements.push(
      makeImageElement({
        x: contentArea.x + halfWidth + Math.round(40 * scale.scaleX),
        y: contentArea.y + Math.round(40 * scale.scaleY),
        width: svgSize,
        height: svgSize,
        src: "",
        alt: ctx.svgGraphic.label,
        svgContent: ctx.svgGraphic.svg,
        svgColor: preset.colors.secondary,
      }),
    );
  }

  // 4. Title text on right
  const titleFontSize = Math.max(8, Math.round(48 * scale.scaleX));
  const titleY = contentArea.y + Math.round(160 * scale.scaleY);
  elements.push(
    makeTextElement({
      x: contentArea.x + halfWidth + Math.round(40 * scale.scaleX),
      y: titleY,
      width: halfWidth - Math.round(80 * scale.scaleX),
      height: Math.round(60 * scale.scaleY),
      text: slideData.title,
      color: preset.colors.primary,
      fontSize: titleFontSize,
      fontFamily: preset.typography.titleFontFamily,
      fontWeight: fontWeightToString(preset.typography.titleFontWeight),
      textAlign: "left",
    }),
  );

  // 5. Body text on right
  const bodyFontSize = Math.max(8, Math.round(24 * scale.scaleX));
  const bodyLineHeight = Math.round(40 * scale.scaleY);
  let bodyY = titleY + Math.round(80 * scale.scaleY);
  for (const line of slideData.body) {
    elements.push(
      makeTextElement({
        x: contentArea.x + halfWidth + Math.round(40 * scale.scaleX),
        y: bodyY,
        width: halfWidth - Math.round(80 * scale.scaleX),
        height: bodyLineHeight,
        text: line,
        color: preset.colors.text,
        fontSize: bodyFontSize,
        fontFamily: preset.typography.bodyFontFamily,
        fontWeight: fontWeightToString(preset.typography.bodyFontWeight),
        textAlign: "left",
      }),
    );
    bodyY += bodyLineHeight + Math.round(8 * scale.scaleY);
  }

  return elements;
}

function buildFeatureBoxesRight(ctx: TemplateContext): SlideElement[] {
  const { contentArea, slideData, preset, scale } = ctx;
  const elements: SlideElement[] = [];
  const leftWidth = contentArea.width * 0.55;
  const rightWidth = contentArea.width * 0.45;

  // 1. Left image (~55% width)
  elements.push(
    makeImageOrPlaceholder(
      ctx,
      contentArea.x,
      contentArea.y,
      leftWidth,
      contentArea.height,
      slideData.title,
    ),
  );

  // 2. Title on right
  const titleFontSize = Math.max(8, Math.round(40 * scale.scaleX));
  const titleY = contentArea.y + Math.round(30 * scale.scaleY);
  elements.push(
    makeTextElement({
      x: contentArea.x + leftWidth + Math.round(30 * scale.scaleX),
      y: titleY,
      width: rightWidth - Math.round(60 * scale.scaleX),
      height: Math.round(60 * scale.scaleY),
      text: slideData.title,
      color: preset.colors.primary,
      fontSize: titleFontSize,
      fontFamily: preset.typography.titleFontFamily,
      fontWeight: fontWeightToString(preset.typography.titleFontWeight),
      textAlign: "left",
    }),
  );

  // 3. Three feature cards
  const cardWidth = rightWidth - Math.round(60 * scale.scaleX);
  const cardHeight = Math.round(
    (contentArea.height - Math.round(130 * scale.scaleY)) / 3 -
      Math.round(10 * scale.scaleY),
  );
  let cardY = titleY + Math.round(80 * scale.scaleY);

  for (let i = 0; i < 3; i++) {
    const cardBgColor = preset.colors.cardBg[i] ?? preset.colors.cardBg[0];

    // Card rect
    elements.push(
      makeRectElement({
        x: contentArea.x + leftWidth + Math.round(30 * scale.scaleX),
        y: cardY,
        width: cardWidth,
        height: cardHeight,
        fill: cardBgColor,
      }),
    );

    // Card text
    const bodyText = slideData.body[i] ?? "";
    if (bodyText) {
      const cardTextFontSize = Math.max(8, Math.round(20 * scale.scaleX));
      elements.push(
        makeTextElement({
          x:
            contentArea.x +
            leftWidth +
            Math.round(50 * scale.scaleX),
          y: cardY + Math.round(15 * scale.scaleY),
          width: cardWidth - Math.round(40 * scale.scaleX),
          height: cardHeight - Math.round(30 * scale.scaleY),
          text: bodyText,
          color: preset.colors.text,
          fontSize: cardTextFontSize,
          fontFamily: preset.typography.bodyFontFamily,
          fontWeight: fontWeightToString(preset.typography.bodyFontWeight),
          textAlign: "left",
        }),
      );
    }

    cardY += cardHeight + Math.round(10 * scale.scaleY);
  }

  return elements;
}

// ── Header/Footer Builders ─────────────────────────────────

function buildHeaderElements(
  preset: SlideStylePreset,
  canvasWidth: number,
  scaledHeaderHeight: number,
  deckTitle: string | undefined,
  scale: ScaleFactors,
): SlideElement[] {
  if (!preset.header?.enabled) return [];
  const header = preset.header;
  const elements: SlideElement[] = [];

  // Header background rect
  elements.push(
    makeRectElement({
      x: 0,
      y: 0,
      width: canvasWidth,
      height: scaledHeaderHeight,
      fill: header.backgroundColor,
    }),
  );

  // Border bottom line
  if (header.borderBottom) {
    const borderParts = header.borderBottom.split(" ");
    const strokeColor = borderParts[borderParts.length - 1];
    const strokeWidthStr = borderParts[0];
    const strokeWidth = parseInt(strokeWidthStr, 10) || 1;
    elements.push(
      makeLineElement({
        x: 0,
        y: scaledHeaderHeight,
        width: canvasWidth,
        height: 0,
        stroke: strokeColor,
        strokeWidth,
      }),
    );
  }

  // Deck title text
  if (header.showDeckTitle && deckTitle) {
    let textX: number;
    let textAlign: "left" | "center" | "right" = "left";
    const textWidth = Math.round(400 * scale.scaleX);
    const scaledFontSize = Math.round(
      (header.titleFontSize ?? 18) * scale.scaleX,
    );

    switch (header.logoPosition) {
      case "center":
        textX = canvasWidth / 2 - textWidth / 2;
        textAlign = "center";
        break;
      case "right":
        textX = canvasWidth - textWidth - Math.round(20 * scale.scaleX);
        textAlign = "right";
        break;
      default:
        textX = Math.round(20 * scale.scaleX);
        textAlign = "left";
    }

    elements.push(
      makeTextElement({
        x: textX,
        y: Math.round((scaledHeaderHeight - scaledFontSize) / 2),
        width: textWidth,
        height: Math.round(scaledHeaderHeight * 0.7),
        text: deckTitle,
        color: header.titleColor ?? preset.colors.text,
        fontSize: Math.max(8, scaledFontSize),
        fontFamily: preset.typography.titleFontFamily,
        fontWeight: fontWeightToString(preset.typography.titleFontWeight),
        textAlign,
      }),
    );
  }

  return elements;
}

function buildFooterElements(
  preset: SlideStylePreset,
  canvasWidth: number,
  canvasHeight: number,
  scaledFooterHeight: number,
  slideIndex: number,
  totalSlides: number,
  scale: ScaleFactors,
): SlideElement[] {
  if (!preset.footer?.enabled) return [];
  const footer = preset.footer;
  const footerY = canvasHeight - scaledFooterHeight;
  const elements: SlideElement[] = [];

  // Footer background rect
  elements.push(
    makeRectElement({
      x: 0,
      y: footerY,
      width: canvasWidth,
      height: scaledFooterHeight,
      fill: footer.backgroundColor,
    }),
  );

  // Border top line
  if (footer.borderTop) {
    const borderParts = footer.borderTop.split(" ");
    const strokeColor = borderParts[borderParts.length - 1];
    const strokeWidthStr = borderParts[0];
    const strokeWidth = parseInt(strokeWidthStr, 10) || 1;
    elements.push(
      makeLineElement({
        x: 0,
        y: footerY,
        width: canvasWidth,
        height: 0,
        stroke: strokeColor,
        strokeWidth,
      }),
    );
  }

  const scaledFontSize = Math.max(
    8,
    Math.round((footer.fontSize ?? 14) * scale.scaleX),
  );
  const textOffset = Math.round((scaledFooterHeight - scaledFontSize) / 2);

  // Page number
  if (footer.showPageNumber) {
    elements.push(
      makeTextElement({
        x: canvasWidth - Math.round(100 * scale.scaleX),
        y: footerY + textOffset,
        width: Math.round(80 * scale.scaleX),
        height: Math.round(scaledFooterHeight * 0.7),
        text: `${slideIndex} / ${totalSlides}`,
        color: footer.textColor ?? preset.colors.textMuted,
        fontSize: scaledFontSize,
        fontFamily: preset.typography.bodyFontFamily,
        fontWeight: "normal",
        textAlign: "right",
      }),
    );
  }

  // Custom text
  if (footer.showCustomText && footer.customText) {
    elements.push(
      makeTextElement({
        x: Math.round(20 * scale.scaleX),
        y: footerY + textOffset,
        width: Math.round(300 * scale.scaleX),
        height: Math.round(scaledFooterHeight * 0.7),
        text: footer.customText,
        color: footer.textColor ?? preset.colors.textMuted,
        fontSize: scaledFontSize,
        fontFamily: preset.typography.bodyFontFamily,
        fontWeight: "normal",
        textAlign: "left",
      }),
    );
  }

  return elements;
}

// ── Main Entry Point ───────────────────────────────────────

export function generateSlide(input: LayoutEngineInput): LayoutEngineOutput {
  const canvasWidth = input.canvasWidth ?? 1920;
  const canvasHeight = input.canvasHeight ?? 1080;
  const scale: ScaleFactors = {
    scaleX: canvasWidth / 1920,
    scaleY: canvasHeight / 1080,
  };
  const warnings: string[] = [];

  const headerHeight =
    input.stylePreset.header?.enabled
      ? Math.round(input.stylePreset.header.height * scale.scaleY)
      : 0;
  const footerHeight =
    input.stylePreset.footer?.enabled
      ? Math.round(input.stylePreset.footer.height * scale.scaleY)
      : 0;
  const contentArea = computeContentArea(
    canvasWidth,
    canvasHeight,
    headerHeight,
    footerHeight,
  );

  const ctx: TemplateContext = {
    contentArea,
    slideData: input.slideData,
    imageUrl: input.imageUrl,
    svgGraphic: input.svgGraphic,
    preset: input.stylePreset,
    scale,
    canvasWidth,
    canvasHeight,
    warnings,
    slideIndex: input.slideIndex,
  };

  // 1. Background element
  const elements: SlideElement[] = [
    makeRectElement({
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight,
      fill: input.stylePreset.colors.background,
    }),
  ];

  // 2. Template content
  let templateElements: SlideElement[];
  switch (input.slideData.templateId) {
    case "hero_center":
      templateElements = buildHeroCenter(ctx);
      break;
    case "split_right_image":
      templateElements = buildSplitRightImage(ctx);
      break;
    case "split_left_image":
      templateElements = buildSplitLeftImage(ctx);
      break;
    case "feature_boxes_right":
      templateElements = buildFeatureBoxesRight(ctx);
      break;
    default:
      templateElements = buildHeroCenter(ctx);
  }
  elements.push(...templateElements);

  // 3. Header
  elements.push(
    ...buildHeaderElements(
      input.stylePreset,
      canvasWidth,
      headerHeight,
      input.deckTitle,
      scale,
    ),
  );

  // 4. Footer
  elements.push(
    ...buildFooterElements(
      input.stylePreset,
      canvasWidth,
      canvasHeight,
      footerHeight,
      input.slideIndex,
      input.totalSlides,
      scale,
    ),
  );

  // 5. Validate output
  const slideContent = { elements };
  const parsed = presentationSlideContentSchema.safeParse(slideContent);

  if (!parsed.success) {
    auditLogger.log({
      timestamp: new Date().toISOString(),
      eventType: "error",
      requestPayload: {
        component: "aiPresentationLayoutEngine",
        message: "Layout engine validation failed",
        issues: parsed.error.issues,
        slideIndex: input.slideIndex,
      },
    });

    // Build minimal fallback slide and validate it too
    const fallbackContent = {
      elements: [
        makeRectElement({
          x: 0,
          y: 0,
          width: canvasWidth,
          height: canvasHeight,
          fill: input.stylePreset.colors.background || "#000000",
        }),
        makeTextElement({
          x: canvasWidth * 0.1,
          y: canvasHeight * 0.4,
          width: canvasWidth * 0.8,
          height: 100,
          text: input.slideData.title || "Slide",
          color: input.stylePreset.colors.text || "#ffffff",
          fontSize: Math.max(8, Math.round(48 * scale.scaleX)),
          fontFamily:
            input.stylePreset.typography.titleFontFamily || "Inter",
        }),
      ],
    };
    const fallbackParsed =
      presentationSlideContentSchema.safeParse(fallbackContent);
    return {
      slideContent: fallbackParsed.success
        ? fallbackParsed.data
        : fallbackContent,
      warnings: [
        ...warnings,
        "Layout validation failed, using fallback layout",
      ],
    };
  }

  return { slideContent: parsed.data, warnings };
}
