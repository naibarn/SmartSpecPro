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
  typographyScale: number;
}

interface FittedBodyRow {
  text: string;
  lineCount: number;
  height: number;
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function estimateTextLineCount(
  text: string,
  width: number,
  fontSize: number,
  maxLines: number = 4,
): number {
  if (!text.trim()) {
    return 1;
  }
  const avgCharWidth = Math.max(1, fontSize * 0.56);
  const charsPerLine = Math.max(8, Math.floor(width / avgCharWidth));
  const estimated = Math.ceil(text.length / charsPerLine);
  return clamp(estimated, 1, maxLines);
}

function scaleFontSize(
  baseSize: number,
  scale: ScaleFactors,
  minSize: number = 8,
): number {
  return Math.max(minSize, Math.round(baseSize * scale.typographyScale));
}

function getPortraitBodyFontBoost(
  canvasWidth: number,
  canvasHeight: number,
): number {
  if (canvasHeight <= canvasWidth) {
    return 1;
  }
  const portraitRatio = canvasHeight / Math.max(1, canvasWidth);
  return clamp(1 + ((portraitRatio - 1) * 0.52), 1, 1.52);
}

function scaleBodyFontSize(
  baseSize: number,
  scale: ScaleFactors,
  canvasWidth: number,
  canvasHeight: number,
): number {
  const scaled = scaleFontSize(baseSize, scale, 10);
  const boost = getPortraitBodyFontBoost(canvasWidth, canvasHeight);
  const minReadableSize = canvasHeight > canvasWidth ? 16 : 12;
  return Math.max(minReadableSize, Math.round(scaled * boost));
}

function isPortraitCanvas(canvasWidth: number, canvasHeight: number): boolean {
  return canvasHeight > canvasWidth;
}

function hasThaiCharacters(text: string): boolean {
  return /[\u0e00-\u0e7f]/.test(text);
}

function getTitleLineHeight(canvasWidth: number, canvasHeight: number, thaiText: boolean): number {
  if (thaiText) {
    return isPortraitCanvas(canvasWidth, canvasHeight) ? 1.22 : 1.16;
  }
  return isPortraitCanvas(canvasWidth, canvasHeight) ? 1.1 : 1.06;
}

function getTitleLetterSpacing(canvasWidth: number, canvasHeight: number, thaiText: boolean): number {
  if (thaiText) {
    return 0;
  }
  return isPortraitCanvas(canvasWidth, canvasHeight) ? -0.2 : -0.35;
}

function getBodyLineHeight(canvasWidth: number, canvasHeight: number, thaiText: boolean): number {
  if (thaiText) {
    return isPortraitCanvas(canvasWidth, canvasHeight) ? 1.56 : 1.48;
  }
  return isPortraitCanvas(canvasWidth, canvasHeight) ? 1.34 : 1.28;
}

function getBodyLetterSpacing(canvasWidth: number, canvasHeight: number, thaiText: boolean): number {
  if (thaiText) {
    return 0;
  }
  return isPortraitCanvas(canvasWidth, canvasHeight) ? 0.12 : 0.05;
}

function compactBodyLines(body: string[], maxLines: number): string[] {
  const cleaned = body
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (cleaned.length <= maxLines) {
    return cleaned;
  }
  const head = cleaned.slice(0, Math.max(0, maxLines - 1));
  const tail = cleaned.slice(Math.max(0, maxLines - 1)).join(" • ");
  const compactTail = tail.length > 220
    ? `${tail.slice(0, 219).trimEnd()}…`
    : tail;
  return [...head, compactTail];
}

function fitTitleTypography(
  text: string,
  width: number,
  baseFontSize: number,
  minFontSize: number,
  maxLines: number,
): { fontSize: number; lineCount: number } {
  let fontSize = Math.max(minFontSize, Math.round(baseFontSize));
  let lineCount = estimateTextLineCount(text, width, fontSize, 12);
  while (lineCount > maxLines && fontSize > minFontSize) {
    fontSize -= 1;
    lineCount = estimateTextLineCount(text, width, fontSize, 12);
  }
  return { fontSize, lineCount: Math.min(lineCount, maxLines) };
}

function fitBodyFontSizeToHeight(opts: {
  baseFontSize: number;
  minFontSize: number;
  maxFontSize: number;
  lineCount: number;
  lineHeightRatio: number;
  gapPx: number;
  availableHeightPx: number;
}): number {
  const {
    baseFontSize,
    minFontSize,
    maxFontSize,
    lineCount,
    lineHeightRatio,
    gapPx,
    availableHeightPx,
  } = opts;

  if (lineCount <= 0) {
    return clamp(Math.round(baseFontSize), minFontSize, maxFontSize);
  }

  const remainingHeight = Math.max(1, availableHeightPx - Math.max(0, (lineCount - 1) * gapPx));
  const maxFontByHeight = Math.floor(remainingHeight / Math.max(0.8, lineCount * lineHeightRatio));
  const fitted = Math.min(baseFontSize, maxFontByHeight);
  return clamp(Math.round(fitted), minFontSize, maxFontSize);
}

function buildFittedRows(lines: string[], fontSize: number, width: number, lineHeightRatio: number, maxLinesPerRow: number): FittedBodyRow[] {
  const lineHeightPx = Math.max(1, Math.round(fontSize * lineHeightRatio));
  return lines.map((text) => {
    const lineCount = estimateTextLineCount(text, width, fontSize, maxLinesPerRow);
    return {
      text,
      lineCount,
      height: Math.max(lineHeightPx, lineCount * lineHeightPx),
    };
  });
}

function computeRowsHeight(rows: FittedBodyRow[], gapPx: number): number {
  if (rows.length === 0) {
    return 0;
  }
  const contentHeight = rows.reduce((sum, row) => sum + row.height, 0);
  return contentHeight + (Math.max(0, rows.length - 1) * Math.max(0, gapPx));
}

function fitBodyRowsToHeight(opts: {
  lines: string[];
  width: number;
  baseFontSize: number;
  minFontSize: number;
  maxFontSize: number;
  lineHeightRatio: number;
  gapPx: number;
  availableHeightPx: number;
  maxLinesPerRow: number;
}): { fontSize: number; rows: FittedBodyRow[]; totalHeight: number } {
  const {
    lines,
    width,
    baseFontSize,
    minFontSize,
    maxFontSize,
    lineHeightRatio,
    gapPx,
    availableHeightPx,
    maxLinesPerRow,
  } = opts;

  const targetFontSize = clamp(Math.round(baseFontSize), minFontSize, maxFontSize);
  for (let size = targetFontSize; size >= minFontSize; size -= 1) {
    const rows = buildFittedRows(lines, size, width, lineHeightRatio, maxLinesPerRow);
    const totalHeight = computeRowsHeight(rows, gapPx);
    if (totalHeight <= availableHeightPx) {
      return { fontSize: size, rows, totalHeight };
    }
  }

  let rows = buildFittedRows(lines, minFontSize, width, lineHeightRatio, maxLinesPerRow);
  let totalHeight = computeRowsHeight(rows, gapPx);
  while (rows.length > 1 && totalHeight > availableHeightPx) {
    rows = rows.slice(0, -1);
    totalHeight = computeRowsHeight(rows, gapPx);
  }

  return {
    fontSize: minFontSize,
    rows,
    totalHeight,
  };
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
  lineHeight?: number;
  letterSpacing?: number;
  textShadow?: string;
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
  if (opts.lineHeight !== undefined) el.lineHeight = opts.lineHeight;
  if (opts.letterSpacing !== undefined) el.letterSpacing = opts.letterSpacing;
  if (opts.textShadow !== undefined) el.textShadow = opts.textShadow;
  return el as SlideElement;
}

function makeImageElement(opts: {
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  alt: string;
  imageFit?: "contain" | "cover" | "fill";
  imagePositionX?: number;
  imagePositionY?: number;
  imageZoom?: number;
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
  if (opts.imageFit !== undefined) el.imageFit = opts.imageFit;
  if (opts.imagePositionX !== undefined) el.imagePositionX = opts.imagePositionX;
  if (opts.imagePositionY !== undefined) el.imagePositionY = opts.imagePositionY;
  if (opts.imageZoom !== undefined) el.imageZoom = opts.imageZoom;
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
  renderOptions?: {
    imageFit?: "contain" | "cover" | "fill";
    imagePositionX?: number;
    imagePositionY?: number;
    imageZoom?: number;
  },
): SlideElement {
  if (ctx.imageUrl) {
    return makeImageElement({
      x,
      y,
      width,
      height,
      src: ctx.imageUrl,
      alt,
      ...renderOptions,
    });
  }
  ctx.warnings.push(
    `Slide ${ctx.slideIndex}: Visual generation failed, using placeholder`,
  );
  return makeRectElement({ x, y, width, height, fill: ctx.preset.colors.backgroundAlt });
}

// ── Template Builders ──────────────────────────────────────

function buildHeroCenter(ctx: TemplateContext): SlideElement[] {
  const { contentArea, slideData, preset, scale, canvasWidth, canvasHeight } = ctx;
  const elements: SlideElement[] = [];
  const portrait = isPortraitCanvas(canvasWidth, canvasHeight);
  const bodyLines = compactBodyLines(slideData.body, portrait ? 6 : 5);
  const thaiText = hasThaiCharacters(`${slideData.title}\n${bodyLines.join("\n")}`);
  const titleLineHeight = getTitleLineHeight(canvasWidth, canvasHeight, thaiText);
  const bodyLineHeightRatio = getBodyLineHeight(canvasWidth, canvasHeight, thaiText);
  const bodyLetterSpacing = getBodyLetterSpacing(canvasWidth, canvasHeight, thaiText);

  // 1. Full-canvas image or placeholder
  elements.push(
    makeImageOrPlaceholder(
      ctx,
      contentArea.x,
      contentArea.y,
      contentArea.width,
      contentArea.height,
      slideData.title,
      {
        imageFit: "cover",
        imagePositionX: 50,
        imagePositionY: 42,
        imageZoom: 1.08,
      },
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
      opacity: portrait ? 0.92 : 0.84,
    }),
  );

  // 3. Modern text panel for better legibility on rich backgrounds
  const titleWidth = contentArea.width * (portrait ? 0.88 : 0.82);
  const titleX = contentArea.x + (contentArea.width - titleWidth) / 2;
  const titleSizing = fitTitleTypography(
    slideData.title,
    titleWidth,
    scaleFontSize(64, scale),
    scaleFontSize(42, scale),
    portrait ? 3 : 2,
  );
  const titleFontSize = titleSizing.fontSize;
  const titleLineCount = titleSizing.lineCount;
  const titleHeight = Math.round(
    titleFontSize * titleLineHeight * titleLineCount + Math.round(12 * scale.scaleY),
  );
  const titleY = contentArea.y + contentArea.height * (portrait ? 0.24 : 0.33);
  const bodyGap = Math.round((portrait ? 10 : 8) * scale.scaleY);
  const baseBodyFontSize = scaleBodyFontSize(portrait ? 32 : 28, scale, canvasWidth, canvasHeight);
  const bodyTop = titleY + titleHeight + Math.round(18 * scale.scaleY);
  const bodyBottomLimit = contentArea.y + contentArea.height - Math.round(40 * scale.scaleY);
  const availableBodyHeight = Math.max(
    Math.round(64 * scale.scaleY),
    bodyBottomLimit - bodyTop,
  );
  const bodyFit = fitBodyRowsToHeight({
    lines: bodyLines,
    width: titleWidth,
    baseFontSize: baseBodyFontSize,
    minFontSize: portrait ? 24 : 18,
    maxFontSize: portrait ? 52 : 42,
    lineHeightRatio: bodyLineHeightRatio,
    gapPx: bodyGap,
    availableHeightPx: availableBodyHeight,
    maxLinesPerRow: 2,
  });
  const bodyFontSize = bodyFit.fontSize;
  const bodyRows = bodyFit.rows;
  const bodyBlockHeight = bodyFit.totalHeight;
  const textPanelPaddingX = Math.round((portrait ? 36 : 64) * scale.scaleX);
  const textPanelPaddingY = Math.round((portrait ? 28 : 22) * scale.scaleY);
  const textPanelY = Math.max(contentArea.y, titleY - textPanelPaddingY);
  const textPanelHeight = Math.min(
    contentArea.height - Math.round(24 * scale.scaleY),
    titleHeight + Math.round(18 * scale.scaleY) + bodyBlockHeight + (textPanelPaddingY * 2),
  );
  elements.push(
    makeRectElement({
      x: contentArea.x + textPanelPaddingX,
      y: textPanelY,
      width: contentArea.width - (textPanelPaddingX * 2),
      height: Math.max(Math.round(90 * scale.scaleY), textPanelHeight),
      fill: preset.colors.backgroundAlt,
      opacity: portrait ? 0.56 : 0.42,
    }),
  );

  // 4. Centered title
  elements.push(
    makeTextElement({
      x: titleX,
      y: titleY,
      width: titleWidth,
      height: titleHeight,
      text: slideData.title,
      color: preset.colors.primary,
      fontSize: titleFontSize,
      fontFamily: preset.typography.titleFontFamily,
      fontWeight: fontWeightToString(preset.typography.titleFontWeight),
      textAlign: "center",
      lineHeight: titleLineHeight,
      letterSpacing: getTitleLetterSpacing(canvasWidth, canvasHeight, thaiText),
      textShadow: "0 8px 24px rgba(0,0,0,0.45)",
    }),
  );

  // 5. Body text
  let bodyY = bodyTop;
  for (const row of bodyRows) {
    elements.push(
      makeTextElement({
        x: titleX,
        y: bodyY,
        width: titleWidth,
        height: row.height,
        text: row.text,
        color: preset.colors.text,
        fontSize: bodyFontSize,
        fontFamily: preset.typography.bodyFontFamily,
        fontWeight: fontWeightToString(preset.typography.bodyFontWeight),
        textAlign: "center",
        lineHeight: bodyLineHeightRatio,
        letterSpacing: bodyLetterSpacing,
        textShadow: "0 4px 14px rgba(0,0,0,0.35)",
      }),
    );
    bodyY += row.height + bodyGap;
  }

  return elements;
}

function buildSplitRightImage(ctx: TemplateContext): SlideElement[] {
  const { contentArea, slideData, preset, scale, canvasWidth, canvasHeight } = ctx;
  const elements: SlideElement[] = [];
  const halfWidth = contentArea.width * 0.5;
  const portrait = isPortraitCanvas(canvasWidth, canvasHeight);
  const bodyLines = compactBodyLines(slideData.body, portrait ? 6 : 5);
  const thaiText = hasThaiCharacters(`${slideData.title}\n${bodyLines.join("\n")}`);
  const titleLineHeight = getTitleLineHeight(canvasWidth, canvasHeight, thaiText);
  const bodyLineHeightRatio = getBodyLineHeight(canvasWidth, canvasHeight, thaiText);
  const bodyLetterSpacing = getBodyLetterSpacing(canvasWidth, canvasHeight, thaiText);

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
  const titleBaseFontSize = scaleFontSize(48, scale);
  const titleY =
    contentArea.y + Math.round(160 * scale.scaleY);
  const accentWidth = Math.max(4, Math.round(6 * scale.scaleX));
  const titleX = contentArea.x + Math.round(40 * scale.scaleX) + accentWidth + Math.round(14 * scale.scaleX);
  const titleWidth = halfWidth - Math.round(96 * scale.scaleX);
  const titleSizing = fitTitleTypography(
    slideData.title,
    titleWidth,
    titleBaseFontSize,
    scaleFontSize(30, scale),
    portrait ? 4 : 3,
  );
  const titleFontSize = titleSizing.fontSize;
  const titleLineCount = titleSizing.lineCount;
  const titleHeight = Math.round(titleFontSize * titleLineHeight * titleLineCount + Math.round(8 * scale.scaleY));
  elements.push(
    makeRectElement({
      x: titleX - Math.round(14 * scale.scaleX),
      y: titleY + Math.round(4 * scale.scaleY),
      width: accentWidth,
      height: Math.max(titleHeight, Math.round(72 * scale.scaleY)),
      fill: preset.colors.secondary,
      opacity: 0.9,
    }),
  );
  elements.push(
    makeTextElement({
      x: titleX,
      y: titleY,
      width: titleWidth,
      height: titleHeight,
      text: slideData.title,
      color: preset.colors.primary,
      fontSize: titleFontSize,
      fontFamily: preset.typography.titleFontFamily,
      fontWeight: fontWeightToString(preset.typography.titleFontWeight),
      textAlign: "left",
      lineHeight: titleLineHeight,
      letterSpacing: getTitleLetterSpacing(canvasWidth, canvasHeight, thaiText),
    }),
  );

  // 4. Body text
  const bodyGap = Math.round(8 * scale.scaleY);
  const bodyTop = titleY + titleHeight + Math.round(24 * scale.scaleY);
  const availableBodyHeight = Math.max(
    Math.round(52 * scale.scaleY),
    (contentArea.y + contentArea.height - Math.round(32 * scale.scaleY)) - bodyTop,
  );
  const bodyFit = fitBodyRowsToHeight({
    lines: bodyLines,
    width: titleWidth,
    baseFontSize: scaleBodyFontSize(26, scale, canvasWidth, canvasHeight),
    minFontSize: portrait ? 20 : 16,
    maxFontSize: portrait ? 38 : 30,
    lineHeightRatio: bodyLineHeightRatio,
    gapPx: bodyGap,
    availableHeightPx: availableBodyHeight,
    maxLinesPerRow: 2,
  });
  const bodyFontSize = bodyFit.fontSize;
  const bodyRows = bodyFit.rows;
  let bodyY = bodyTop;
  for (const row of bodyRows) {
    elements.push(
      makeTextElement({
        x: titleX,
        y: bodyY,
        width: titleWidth,
        height: row.height,
        text: row.text,
        color: preset.colors.text,
        fontSize: bodyFontSize,
        fontFamily: preset.typography.bodyFontFamily,
        fontWeight: fontWeightToString(preset.typography.bodyFontWeight),
        textAlign: "left",
        lineHeight: bodyLineHeightRatio,
        letterSpacing: bodyLetterSpacing,
      }),
    );
    bodyY += row.height + bodyGap;
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
      {
        imageFit: "cover",
        imagePositionX: 52,
        imagePositionY: 45,
        imageZoom: 1.06,
      },
    ),
  );

  return elements;
}

function buildSplitLeftImage(ctx: TemplateContext): SlideElement[] {
  const { contentArea, slideData, preset, scale, canvasWidth, canvasHeight } = ctx;
  const elements: SlideElement[] = [];
  const halfWidth = contentArea.width * 0.5;
  const portrait = isPortraitCanvas(canvasWidth, canvasHeight);
  const bodyLines = compactBodyLines(slideData.body, portrait ? 6 : 5);
  const thaiText = hasThaiCharacters(`${slideData.title}\n${bodyLines.join("\n")}`);
  const titleLineHeight = getTitleLineHeight(canvasWidth, canvasHeight, thaiText);
  const bodyLineHeightRatio = getBodyLineHeight(canvasWidth, canvasHeight, thaiText);
  const bodyLetterSpacing = getBodyLetterSpacing(canvasWidth, canvasHeight, thaiText);

  // 1. Left image
  elements.push(
    makeImageOrPlaceholder(
      ctx,
      contentArea.x,
      contentArea.y,
      halfWidth,
      contentArea.height,
      slideData.title,
      {
        imageFit: "cover",
        imagePositionX: 48,
        imagePositionY: 45,
        imageZoom: 1.06,
      },
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
  const titleBaseFontSize = scaleFontSize(48, scale);
  const titleY = contentArea.y + Math.round(160 * scale.scaleY);
  const accentWidth = Math.max(4, Math.round(6 * scale.scaleX));
  const titleX = contentArea.x + halfWidth + Math.round(40 * scale.scaleX) + accentWidth + Math.round(14 * scale.scaleX);
  const titleWidth = halfWidth - Math.round(96 * scale.scaleX);
  const titleSizing = fitTitleTypography(
    slideData.title,
    titleWidth,
    titleBaseFontSize,
    scaleFontSize(30, scale),
    portrait ? 4 : 3,
  );
  const titleFontSize = titleSizing.fontSize;
  const titleLineCount = titleSizing.lineCount;
  const titleHeight = Math.round(titleFontSize * titleLineHeight * titleLineCount + Math.round(8 * scale.scaleY));
  elements.push(
    makeRectElement({
      x: titleX - Math.round(14 * scale.scaleX),
      y: titleY + Math.round(4 * scale.scaleY),
      width: accentWidth,
      height: Math.max(titleHeight, Math.round(72 * scale.scaleY)),
      fill: preset.colors.secondary,
      opacity: 0.9,
    }),
  );
  elements.push(
    makeTextElement({
      x: titleX,
      y: titleY,
      width: titleWidth,
      height: titleHeight,
      text: slideData.title,
      color: preset.colors.primary,
      fontSize: titleFontSize,
      fontFamily: preset.typography.titleFontFamily,
      fontWeight: fontWeightToString(preset.typography.titleFontWeight),
      textAlign: "left",
      lineHeight: titleLineHeight,
      letterSpacing: getTitleLetterSpacing(canvasWidth, canvasHeight, thaiText),
    }),
  );

  // 5. Body text on right
  const bodyGap = Math.round(8 * scale.scaleY);
  const bodyTop = titleY + titleHeight + Math.round(24 * scale.scaleY);
  const availableBodyHeight = Math.max(
    Math.round(52 * scale.scaleY),
    (contentArea.y + contentArea.height - Math.round(32 * scale.scaleY)) - bodyTop,
  );
  const bodyFit = fitBodyRowsToHeight({
    lines: bodyLines,
    width: titleWidth,
    baseFontSize: scaleBodyFontSize(26, scale, canvasWidth, canvasHeight),
    minFontSize: portrait ? 20 : 16,
    maxFontSize: portrait ? 38 : 30,
    lineHeightRatio: bodyLineHeightRatio,
    gapPx: bodyGap,
    availableHeightPx: availableBodyHeight,
    maxLinesPerRow: 2,
  });
  const bodyFontSize = bodyFit.fontSize;
  const bodyRows = bodyFit.rows;
  let bodyY = bodyTop;
  for (const row of bodyRows) {
    elements.push(
      makeTextElement({
        x: titleX,
        y: bodyY,
        width: titleWidth,
        height: row.height,
        text: row.text,
        color: preset.colors.text,
        fontSize: bodyFontSize,
        fontFamily: preset.typography.bodyFontFamily,
        fontWeight: fontWeightToString(preset.typography.bodyFontWeight),
        textAlign: "left",
        lineHeight: bodyLineHeightRatio,
        letterSpacing: bodyLetterSpacing,
      }),
    );
    bodyY += row.height + bodyGap;
  }

  return elements;
}

function buildTopImageTextBottom(ctx: TemplateContext): SlideElement[] {
  const { contentArea, slideData, preset, scale, canvasWidth, canvasHeight } = ctx;
  const elements: SlideElement[] = [];
  const portrait = isPortraitCanvas(canvasWidth, canvasHeight);
  const imageHeight = Math.round(contentArea.height * (portrait ? 0.52 : 0.56));
  const bottomY = contentArea.y + imageHeight;
  const bottomHeight = Math.max(120, contentArea.height - imageHeight);
  const bodyLines = compactBodyLines(slideData.body, portrait ? 6 : 5);
  const thaiText = hasThaiCharacters(`${slideData.title}\n${bodyLines.join("\n")}`);
  const titleLineHeight = getTitleLineHeight(canvasWidth, canvasHeight, thaiText);
  const bodyLineHeightRatio = getBodyLineHeight(canvasWidth, canvasHeight, thaiText);
  const bodyLetterSpacing = getBodyLetterSpacing(canvasWidth, canvasHeight, thaiText);

  elements.push(
    makeImageOrPlaceholder(
      ctx,
      contentArea.x,
      contentArea.y,
      contentArea.width,
      imageHeight,
      slideData.title,
      {
        imageFit: "cover",
        imagePositionX: 50,
        imagePositionY: 45,
        imageZoom: 1.06,
      },
    ),
  );

  elements.push(
    makeRectElement({
      x: contentArea.x,
      y: bottomY,
      width: contentArea.width,
      height: bottomHeight,
      fill: preset.colors.backgroundAlt,
    }),
  );

  const accentWidth = Math.max(4, Math.round(6 * scale.scaleX));
  const leftPadding = Math.round(40 * scale.scaleX);
  const topPadding = Math.round(24 * scale.scaleY);
  let titleY = bottomY + topPadding;
  if (ctx.svgGraphic) {
    const svgSize = Math.round(66 * scale.scaleX);
    elements.push(
      makeImageElement({
        x: leftPadding,
        y: titleY,
        width: svgSize,
        height: svgSize,
        src: "",
        alt: ctx.svgGraphic.label,
        svgContent: ctx.svgGraphic.svg,
        svgColor: preset.colors.secondary,
      }),
    );
    titleY += svgSize + Math.round(12 * scale.scaleY);
  }

  const titleX = leftPadding + accentWidth + Math.round(12 * scale.scaleX);
  const titleWidth = contentArea.width - (leftPadding * 2) - accentWidth;
  const titleSizing = fitTitleTypography(
    slideData.title,
    titleWidth,
    scaleFontSize(42, scale),
    scaleFontSize(28, scale),
    portrait ? 3 : 2,
  );
  const titleFontSize = titleSizing.fontSize;
  const titleHeight = Math.round(
    titleFontSize * titleLineHeight * titleSizing.lineCount + Math.round(8 * scale.scaleY),
  );
  elements.push(
    makeRectElement({
      x: titleX - Math.round(12 * scale.scaleX),
      y: titleY + Math.round(3 * scale.scaleY),
      width: accentWidth,
      height: Math.max(titleHeight, Math.round(56 * scale.scaleY)),
      fill: preset.colors.secondary,
      opacity: 0.9,
    }),
  );
  elements.push(
    makeTextElement({
      x: titleX,
      y: titleY,
      width: titleWidth,
      height: titleHeight,
      text: slideData.title,
      color: preset.colors.primary,
      fontSize: titleFontSize,
      fontFamily: preset.typography.titleFontFamily,
      fontWeight: fontWeightToString(preset.typography.titleFontWeight),
      textAlign: "left",
      lineHeight: titleLineHeight,
      letterSpacing: getTitleLetterSpacing(canvasWidth, canvasHeight, thaiText),
    }),
  );

  const bodyGap = Math.round(8 * scale.scaleY);
  const bodyTop = titleY + titleHeight + Math.round(18 * scale.scaleY);
  const availableBodyHeight = Math.max(56, (bottomY + bottomHeight - Math.round(26 * scale.scaleY)) - bodyTop);
  const bodyFit = fitBodyRowsToHeight({
    lines: bodyLines,
    width: titleWidth,
    baseFontSize: scaleBodyFontSize(26, scale, canvasWidth, canvasHeight),
    minFontSize: portrait ? 20 : 16,
    maxFontSize: portrait ? 36 : 30,
    lineHeightRatio: bodyLineHeightRatio,
    gapPx: bodyGap,
    availableHeightPx: availableBodyHeight,
    maxLinesPerRow: 2,
  });

  let bodyY = bodyTop;
  for (const row of bodyFit.rows) {
    elements.push(
      makeTextElement({
        x: titleX,
        y: bodyY,
        width: titleWidth,
        height: row.height,
        text: row.text,
        color: preset.colors.text,
        fontSize: bodyFit.fontSize,
        fontFamily: preset.typography.bodyFontFamily,
        fontWeight: fontWeightToString(preset.typography.bodyFontWeight),
        textAlign: "left",
        lineHeight: bodyLineHeightRatio,
        letterSpacing: bodyLetterSpacing,
      }),
    );
    bodyY += row.height + bodyGap;
  }

  return elements;
}

function buildBottomImageTextTop(ctx: TemplateContext): SlideElement[] {
  const { contentArea, slideData, preset, scale, canvasWidth, canvasHeight } = ctx;
  const elements: SlideElement[] = [];
  const portrait = isPortraitCanvas(canvasWidth, canvasHeight);
  const imageHeight = Math.round(contentArea.height * (portrait ? 0.52 : 0.56));
  const topHeight = Math.max(120, contentArea.height - imageHeight);
  const imageY = contentArea.y + topHeight;
  const bodyLines = compactBodyLines(slideData.body, portrait ? 6 : 5);
  const thaiText = hasThaiCharacters(`${slideData.title}\n${bodyLines.join("\n")}`);
  const titleLineHeight = getTitleLineHeight(canvasWidth, canvasHeight, thaiText);
  const bodyLineHeightRatio = getBodyLineHeight(canvasWidth, canvasHeight, thaiText);
  const bodyLetterSpacing = getBodyLetterSpacing(canvasWidth, canvasHeight, thaiText);

  elements.push(
    makeRectElement({
      x: contentArea.x,
      y: contentArea.y,
      width: contentArea.width,
      height: topHeight,
      fill: preset.colors.backgroundAlt,
    }),
  );

  const accentWidth = Math.max(4, Math.round(6 * scale.scaleX));
  const leftPadding = Math.round(40 * scale.scaleX);
  const topPadding = Math.round(24 * scale.scaleY);
  let titleY = contentArea.y + topPadding;
  if (ctx.svgGraphic) {
    const svgSize = Math.round(66 * scale.scaleX);
    elements.push(
      makeImageElement({
        x: leftPadding,
        y: titleY,
        width: svgSize,
        height: svgSize,
        src: "",
        alt: ctx.svgGraphic.label,
        svgContent: ctx.svgGraphic.svg,
        svgColor: preset.colors.secondary,
      }),
    );
    titleY += svgSize + Math.round(12 * scale.scaleY);
  }

  const titleX = leftPadding + accentWidth + Math.round(12 * scale.scaleX);
  const titleWidth = contentArea.width - (leftPadding * 2) - accentWidth;
  const titleSizing = fitTitleTypography(
    slideData.title,
    titleWidth,
    scaleFontSize(42, scale),
    scaleFontSize(28, scale),
    portrait ? 3 : 2,
  );
  const titleFontSize = titleSizing.fontSize;
  const titleHeight = Math.round(
    titleFontSize * titleLineHeight * titleSizing.lineCount + Math.round(8 * scale.scaleY),
  );
  elements.push(
    makeRectElement({
      x: titleX - Math.round(12 * scale.scaleX),
      y: titleY + Math.round(3 * scale.scaleY),
      width: accentWidth,
      height: Math.max(titleHeight, Math.round(56 * scale.scaleY)),
      fill: preset.colors.secondary,
      opacity: 0.9,
    }),
  );
  elements.push(
    makeTextElement({
      x: titleX,
      y: titleY,
      width: titleWidth,
      height: titleHeight,
      text: slideData.title,
      color: preset.colors.primary,
      fontSize: titleFontSize,
      fontFamily: preset.typography.titleFontFamily,
      fontWeight: fontWeightToString(preset.typography.titleFontWeight),
      textAlign: "left",
      lineHeight: titleLineHeight,
      letterSpacing: getTitleLetterSpacing(canvasWidth, canvasHeight, thaiText),
    }),
  );

  const bodyGap = Math.round(8 * scale.scaleY);
  const bodyTop = titleY + titleHeight + Math.round(18 * scale.scaleY);
  const availableBodyHeight = Math.max(56, (contentArea.y + topHeight - Math.round(22 * scale.scaleY)) - bodyTop);
  const bodyFit = fitBodyRowsToHeight({
    lines: bodyLines,
    width: titleWidth,
    baseFontSize: scaleBodyFontSize(26, scale, canvasWidth, canvasHeight),
    minFontSize: portrait ? 20 : 16,
    maxFontSize: portrait ? 36 : 30,
    lineHeightRatio: bodyLineHeightRatio,
    gapPx: bodyGap,
    availableHeightPx: availableBodyHeight,
    maxLinesPerRow: 2,
  });

  let bodyY = bodyTop;
  for (const row of bodyFit.rows) {
    elements.push(
      makeTextElement({
        x: titleX,
        y: bodyY,
        width: titleWidth,
        height: row.height,
        text: row.text,
        color: preset.colors.text,
        fontSize: bodyFit.fontSize,
        fontFamily: preset.typography.bodyFontFamily,
        fontWeight: fontWeightToString(preset.typography.bodyFontWeight),
        textAlign: "left",
        lineHeight: bodyLineHeightRatio,
        letterSpacing: bodyLetterSpacing,
      }),
    );
    bodyY += row.height + bodyGap;
  }

  elements.push(
    makeImageOrPlaceholder(
      ctx,
      contentArea.x,
      imageY,
      contentArea.width,
      imageHeight,
      slideData.title,
      {
        imageFit: "cover",
        imagePositionX: 50,
        imagePositionY: 45,
        imageZoom: 1.06,
      },
    ),
  );

  return elements;
}

function buildFeatureBoxesRight(ctx: TemplateContext): SlideElement[] {
  const { contentArea, slideData, preset, scale, canvasWidth, canvasHeight } = ctx;
  const elements: SlideElement[] = [];
  const leftWidth = contentArea.width * 0.55;
  const rightWidth = contentArea.width * 0.45;
  const portrait = isPortraitCanvas(canvasWidth, canvasHeight);
  const cardLines = compactBodyLines(slideData.body, portrait ? 4 : 5);
  const thaiText = hasThaiCharacters(`${slideData.title}\n${cardLines.join("\n")}`);
  const titleLineHeight = getTitleLineHeight(canvasWidth, canvasHeight, thaiText);
  const bodyLineHeightRatio = getBodyLineHeight(canvasWidth, canvasHeight, thaiText);
  const bodyLetterSpacing = getBodyLetterSpacing(canvasWidth, canvasHeight, thaiText);

  // 1. Left image (~55% width)
  elements.push(
    makeImageOrPlaceholder(
      ctx,
      contentArea.x,
      contentArea.y,
      leftWidth,
      contentArea.height,
      slideData.title,
      {
        imageFit: "cover",
        imagePositionX: 45,
        imagePositionY: 42,
        imageZoom: 1.08,
      },
    ),
  );

  // 2. Right-side panel to keep the composition clean and modern
  elements.push(
    makeRectElement({
      x: contentArea.x + leftWidth,
      y: contentArea.y,
      width: rightWidth,
      height: contentArea.height,
      fill: preset.colors.backgroundAlt,
      opacity: 0.94,
    }),
  );

  // 3. Title on right
  const titleSizing = fitTitleTypography(
    slideData.title,
    rightWidth - Math.round(60 * scale.scaleX),
    scaleFontSize(40, scale),
    scaleFontSize(30, scale),
    portrait ? 4 : 3,
  );
  const titleFontSize = titleSizing.fontSize;
  const titleY = contentArea.y + Math.round(30 * scale.scaleY);
  const titleWidth = rightWidth - Math.round(60 * scale.scaleX);
  const titleLineCount = titleSizing.lineCount;
  const titleHeight = Math.round(titleFontSize * titleLineHeight * titleLineCount + Math.round(10 * scale.scaleY));
  elements.push(
    makeTextElement({
      x: contentArea.x + leftWidth + Math.round(30 * scale.scaleX),
      y: titleY,
      width: titleWidth,
      height: titleHeight,
      text: slideData.title,
      color: preset.colors.primary,
      fontSize: titleFontSize,
      fontFamily: preset.typography.titleFontFamily,
      fontWeight: fontWeightToString(preset.typography.titleFontWeight),
      textAlign: "left",
      lineHeight: titleLineHeight,
      letterSpacing: getTitleLetterSpacing(canvasWidth, canvasHeight, thaiText),
    }),
  );
  elements.push(
    makeRectElement({
      x: contentArea.x + leftWidth + Math.round(30 * scale.scaleX),
      y: titleY + titleHeight + Math.round(8 * scale.scaleY),
      width: Math.round(96 * scale.scaleX),
      height: Math.max(2, Math.round(4 * scale.scaleY)),
      fill: preset.colors.secondary,
      opacity: 0.85,
    }),
  );

  // 4. Flexible feature cards based on body line count
  const cardWidth = rightWidth - Math.round(60 * scale.scaleX);
  const cardGap = Math.round(12 * scale.scaleY);
  const cardCount = Math.max(1, cardLines.length);
  const cardHeight = Math.max(
    Math.round(80 * scale.scaleY),
    Math.round(
      (contentArea.height - (titleHeight + Math.round(108 * scale.scaleY)) - (cardGap * Math.max(0, cardCount - 1))) / cardCount,
    ),
  );
  let cardY = titleY + titleHeight + Math.round(26 * scale.scaleY);

  for (let i = 0; i < cardCount; i++) {
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
    const bodyText = cardLines[i] ?? "";
    if (bodyText) {
      const cardTextWidth = cardWidth - Math.round(40 * scale.scaleX);
      const cardTextHeight = cardHeight - Math.round(30 * scale.scaleY);
      const estimatedCardLineCount = estimateTextLineCount(bodyText, cardTextWidth, scaleBodyFontSize(22, scale, canvasWidth, canvasHeight), 4);
      const cardTextFontSize = fitBodyFontSizeToHeight({
        baseFontSize: scaleBodyFontSize(22, scale, canvasWidth, canvasHeight),
        minFontSize: portrait ? 18 : 14,
        maxFontSize: portrait ? 34 : 26,
        lineCount: estimatedCardLineCount,
        lineHeightRatio: bodyLineHeightRatio,
        gapPx: Math.round(2 * scale.scaleY),
        availableHeightPx: Math.max(20, cardTextHeight),
      });
      elements.push(
        makeTextElement({
          x:
            contentArea.x +
            leftWidth +
            Math.round(50 * scale.scaleX),
          y: cardY + Math.round(15 * scale.scaleY),
          width: cardTextWidth,
          height: cardTextHeight,
          text: bodyText,
          color: preset.colors.text,
          fontSize: cardTextFontSize,
          fontFamily: preset.typography.bodyFontFamily,
          fontWeight: fontWeightToString(preset.typography.bodyFontWeight),
          textAlign: "left",
          lineHeight: bodyLineHeightRatio,
          letterSpacing: bodyLetterSpacing,
        }),
      );
    }

    cardY += cardHeight + cardGap;
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
  const headerTitle = (header.customTitle ?? deckTitle)?.trim();
  if (header.showDeckTitle && headerTitle) {
    const normalizedDeckTitle = headerTitle.replace(/\s+/g, " ").trim();
    const compactDeckTitle = normalizedDeckTitle.length > 32
      ? `${normalizedDeckTitle.slice(0, 31)}…`
      : normalizedDeckTitle;
    let textX: number;
    let textAlign: "left" | "center" | "right" = "left";
    const textWidth = Math.round(400 * scale.scaleX);
    const scaledFontSize = scaleFontSize(header.titleFontSize ?? 18, scale);
    const verticalPadding = Math.round(6 * scale.scaleY);

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
        y: verticalPadding,
        width: textWidth,
        height: Math.max(Math.round(scaledHeaderHeight * 0.5), scaledHeaderHeight - verticalPadding * 2),
        text: compactDeckTitle,
        color: header.titleColor ?? preset.colors.text,
        fontSize: scaledFontSize,
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

  const scaledFontSize = scaleFontSize(footer.fontSize ?? 14, scale);
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
  const shortEdgeScale = Math.min(canvasWidth, canvasHeight) / 1080;
  const scale: ScaleFactors = {
    scaleX: canvasWidth / 1920,
    scaleY: canvasHeight / 1080,
    typographyScale: clamp(shortEdgeScale, 0.45, 2),
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
    case "top_image_text_bottom":
      templateElements = buildTopImageTextBottom(ctx);
      break;
    case "bottom_image_text_top":
      templateElements = buildBottomImageTextTop(ctx);
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
          fontSize: scaleFontSize(48, scale),
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
