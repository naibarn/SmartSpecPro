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
  visualOnly?: boolean;
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

interface SlideSectionBlock {
  heading: string;
  details: string[];
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

const THAI_COMBINING_MARK_REGEX = /[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/g;
const ZERO_WIDTH_CHAR_REGEX = /[\u200b-\u200d\ufeff]/g;
const TEXT_BLOCK_VERTICAL_PADDING_EM = 0.22;

function countVisualCharacters(text: string): number {
  const normalized = text
    .replace(THAI_COMBINING_MARK_REGEX, "")
    .replace(ZERO_WIDTH_CHAR_REGEX, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return 0;
  }
  return Array.from(normalized).length;
}

function estimateParagraphLineCount(
  text: string,
  charsPerLine: number,
  thaiText: boolean,
): number {
  const cleaned = text.trim();
  if (!cleaned) {
    return 1;
  }

  const visualCharCount = countVisualCharacters(cleaned);
  if (visualCharCount <= 0) {
    return 1;
  }

  const noWhitespaceThai = thaiText && !/\s/.test(cleaned);
  if (noWhitespaceThai) {
    return Math.ceil((visualCharCount * 1.08) / charsPerLine);
  }

  if (!/\s/.test(cleaned)) {
    return Math.ceil(visualCharCount / charsPerLine);
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  let lines = 1;
  let currentLineChars = 0;

  for (const word of words) {
    const wordChars = countVisualCharacters(word);
    if (wordChars <= 0) {
      continue;
    }

    if (wordChars > charsPerLine) {
      if (currentLineChars > 0) {
        lines += 1;
        currentLineChars = 0;
      }

      const wrappedLines = Math.ceil(wordChars / charsPerLine);
      lines += wrappedLines - 1;
      const remainder = wordChars % charsPerLine;
      currentLineChars = remainder === 0 ? charsPerLine : remainder;
      continue;
    }

    const nextLineChars = currentLineChars === 0
      ? wordChars
      : currentLineChars + 1 + wordChars;
    if (nextLineChars <= charsPerLine) {
      currentLineChars = nextLineChars;
      continue;
    }

    lines += 1;
    currentLineChars = wordChars;
  }

  return lines;
}

function estimateTextLineCount(
  text: string,
  width: number,
  fontSize: number,
  maxLines: number = 4,
): number {
  const cleaned = text.trim();
  if (!cleaned) {
    return 1;
  }
  const thaiText = hasThaiCharacters(cleaned);
  const avgCharWidthFactor = thaiText ? 0.6 : 0.56;
  const avgCharWidth = Math.max(1, fontSize * avgCharWidthFactor);
  const charsPerLine = Math.max(8, Math.floor(width / avgCharWidth));
  const estimated = cleaned
    .split(/\n+/)
    .map((paragraph) => estimateParagraphLineCount(paragraph, charsPerLine, thaiText))
    .reduce((sum, lineCount) => sum + lineCount, 0);
  return clamp(estimated, 1, maxLines);
}

function estimateTextBlockHeight(
  fontSize: number,
  lineHeightRatio: number,
  lineCount: number,
  extraPaddingPx: number = 0,
): number {
  const lineHeightPx = Math.max(1, Math.round(fontSize * lineHeightRatio));
  const paddingPx = Math.max(2, Math.round(fontSize * TEXT_BLOCK_VERTICAL_PADDING_EM));
  return Math.max(lineHeightPx, (lineCount * lineHeightPx) + paddingPx + Math.max(0, extraPaddingPx));
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
  const compactTail = tail.length > 500
    ? `${tail.slice(0, 499).trimEnd()}…`
    : tail;
  return [...head, compactTail];
}

function normalizeLayoutText(value: string): string {
  return value
    .replace(/^#{1,6}\s+/gm, "")                    // # headings
    .replace(/\*{2,3}([^*]+)\*{2,3}/g, "$1")        // **bold** / ***bold italic***
    .replace(/\*([^*]+)\*/g, "$1")                   // *italic*
    .replace(/_([^_]+)_/g, "$1")                     // _italic_
    .replace(/~~([^~]+)~~/g, "$1")                   // ~~strikethrough~~
    .replace(/`([^`]+)`/g, "$1")                     // `code`
    .replace(/^\s*>\s?/gm, "")                       // > blockquote
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")         // [link](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")        // ![alt](img)
    .replace(/\s+/g, " ")
    .trim();
}

function parseSectionFromBodyLine(line: string): SlideSectionBlock | null {
  const normalized = normalizeLayoutText(line);
  if (!normalized) {
    return null;
  }
  const separators = [":", " - ", " — ", " – ", "|"];
  for (const separator of separators) {
    const index = normalized.indexOf(separator);
    if (index <= 0) {
      continue;
    }
    const heading = normalizeLayoutText(normalized.slice(0, index));
    const detail = normalizeLayoutText(normalized.slice(index + separator.length));
    if (heading.length < 3 || detail.length < 4) {
      continue;
    }
    return {
      heading: heading.slice(0, 180),
      details: [detail.slice(0, 260)],
    };
  }
  return null;
}

function deriveSectionsFromBodyLines(bodyLines: string[], maxSections: number): SlideSectionBlock[] {
  const sections: SlideSectionBlock[] = [];
  let index = 0;
  while (index < bodyLines.length && sections.length < maxSections) {
    const current = normalizeLayoutText(bodyLines[index] ?? "");
    if (!current) {
      index += 1;
      continue;
    }
    const parsed = parseSectionFromBodyLine(current);
    if (parsed) {
      sections.push(parsed);
      index += 1;
      continue;
    }
    sections.push({ heading: current.slice(0, 180), details: [] });
    index += 1;
  }
  return sections;
}

function resolveSlideSections(slideData: AIPresentationSlide, maxSections: number): SlideSectionBlock[] {
  const explicit = (slideData.sections ?? [])
    .map((section) => {
      const heading = normalizeLayoutText(section.heading).slice(0, 180);
      const details = section.details
        .map((detail) => normalizeLayoutText(detail).slice(0, 260))
        .filter((detail) => detail.length > 0)
        .slice(0, 4);
      if (!heading) {
        return null;
      }
      return { heading, details };
    })
    .filter((section): section is SlideSectionBlock => Boolean(section))
    .slice(0, maxSections);
  if (explicit.length > 0) {
    return explicit;
  }
  return deriveSectionsFromBodyLines(slideData.body, maxSections);
}

function resolveSlideSubtitleAndBodyLines(
  slideData: AIPresentationSlide,
  maxBodyLines: number,
): { subtitle: string | null; bodyLines: string[] } {
  const bodyLines = compactBodyLines(slideData.body, maxBodyLines);
  const sections = resolveSlideSections(slideData, Math.max(10, maxBodyLines + 4));
  if (sections.length === 0) {
    return { subtitle: null, bodyLines };
  }

  const hasExplicitSections = Array.isArray(slideData.sections) && slideData.sections.length > 0;
  const structuredFirstBody = parseSectionFromBodyLine(slideData.body[0] ?? "");
  const allowSubtitleFromSections = hasExplicitSections || Boolean(structuredFirstBody);
  const subtitleCandidate = sections[0]?.heading ? normalizeLayoutText(sections[0].heading) : "";
  const titleKey = normalizeLayoutText(slideData.title).toLowerCase();
  // Strip numbered list prefix (e.g. "1)", "2.", "A)") before comparing subtitle to title.
  // This prevents "1) คำตอบสั้น ๆ..." appearing as subtitle when title is "คำตอบสั้น ๆ..."
  const subtitleCandidateNormalized = subtitleCandidate.replace(/^\d+\s*[).\-]\s*|^[a-zA-Z]\s*[).\-]\s*/i, "").trim();
  const subtitle = allowSubtitleFromSections
    && subtitleCandidate
    && subtitleCandidateNormalized.toLowerCase() !== titleKey
    && subtitleCandidate.toLowerCase() !== titleKey
    ? subtitleCandidate
    : null;

  const detailPool: string[] = [];
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const details = section.details
      .filter((detail) => detail.length > 0)
      .filter((detail) => normalizeLayoutText(detail).toLowerCase() !== section.heading.toLowerCase());
    if (details.length === 0) {
      if (i > 0 || !subtitle) {
        detailPool.push(section.heading);
      }
      continue;
    }
    if (i === 0 && subtitle) {
      detailPool.push(...details);
      continue;
    }
    detailPool.push(`${section.heading}: ${details[0]}`);
    if (details.length > 1) {
      detailPool.push(...details.slice(1));
    }
  }

  const dedupedRaw = detailPool
    .map((line) => normalizeLayoutText(line))
    .filter((line, index, arr) => line.length > 0 && arr.indexOf(line) === index)
    .filter((line) => line.toLowerCase() !== titleKey);

  // Remove lines that are substrings of the title or subtitle
  const subtitleLower = subtitle?.toLowerCase() ?? "";
  // Build a set of original body line prefixes to catch "heading: detail" composites where
  // the heading comes from a body line (e.g. the deck question text) rather than the slide title.
  const bodyLineLowers = new Set(
    (slideData.body ?? []).map((line) => normalizeLayoutText(line).toLowerCase()),
  );
  const deduped = dedupedRaw.filter((line) => {
    const lower = line.toLowerCase();
    // Only apply substring dedup for lines long enough to be meaningful matches
    // (avoids dropping short single-word body lines that happen to appear in the title string)
    const longEnough = lower.length >= 10;
    // Reject if line is substring of title or title is substring of line
    if (longEnough && titleKey && (lower.includes(titleKey) || titleKey.includes(lower))) {
      return false;
    }
    // Reject if line is substring of subtitle or vice versa
    if (longEnough && subtitleLower && (lower.includes(subtitleLower) || subtitleLower.includes(lower))) {
      return false;
    }
    // Reject "heading: detail" composites where the heading is itself a body line
    // (avoids echoing deck-question text + colon + body content as a visual element)
    const colonIdx = lower.indexOf(":");
    if (colonIdx > 0) {
      const headingPart = lower.slice(0, colonIdx).trim();
      if (headingPart.length >= 10 && bodyLineLowers.has(headingPart)) {
        return false;
      }
    }
    return true;
  });

  // Also deduplicate the fallback bodyLines
  const fallbackLines = compactBodyLines(bodyLines, maxBodyLines)
    .filter((line) => {
      const lower = line.toLowerCase();
      if (lower.length >= 10 && titleKey && (lower.includes(titleKey) || titleKey.includes(lower))) {
        return false;
      }
      return lower.length > 0;
    });

  return {
    subtitle,
    bodyLines: compactBodyLines(deduped.length > 0 ? deduped : fallbackLines, maxBodyLines),
  };
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
  const maxFontByHeight = Math.floor(
    remainingHeight / Math.max(0.8, (lineCount * lineHeightRatio) + TEXT_BLOCK_VERTICAL_PADDING_EM),
  );
  const fitted = Math.min(baseFontSize, maxFontByHeight);
  return clamp(Math.round(fitted), minFontSize, maxFontSize);
}

function buildFittedRows(lines: string[], fontSize: number, width: number, lineHeightRatio: number, maxLinesPerRow: number): FittedBodyRow[] {
  return lines.map((text) => {
    const lineCount = estimateTextLineCount(text, width, fontSize, maxLinesPerRow);
    return {
      text,
      lineCount,
      height: estimateTextBlockHeight(fontSize, lineHeightRatio, lineCount),
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
  const hadOverflow = totalHeight > availableHeightPx;
  while (rows.length > 1 && totalHeight > availableHeightPx) {
    rows = rows.slice(0, -1);
    totalHeight = computeRowsHeight(rows, gapPx);
  }

  // Append ellipsis to last row when rows were dropped due to overflow
  if (hadOverflow && rows.length > 0) {
    const last = rows[rows.length - 1];
    const trimmed = last.text.replace(/[,.\s…]+$/, "");
    rows[rows.length - 1] = { ...last, text: `${trimmed}…` };
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
  const { subtitle, bodyLines } = resolveSlideSubtitleAndBodyLines(slideData, portrait ? 10 : 12);
  const thaiText = hasThaiCharacters(`${slideData.title}\n${subtitle ?? ""}\n${bodyLines.join("\n")}`);
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
  const subtitleWidth = titleWidth;
  const subtitleSizing = subtitle
    ? fitTitleTypography(
      subtitle,
      subtitleWidth,
      scaleBodyFontSize(portrait ? 34 : 30, scale, canvasWidth, canvasHeight),
      scaleBodyFontSize(portrait ? 22 : 18, scale, canvasWidth, canvasHeight),
      2,
    )
    : null;
  const subtitleFontSize = subtitleSizing?.fontSize ?? 0;
  const subtitleLineHeight = thaiText ? (portrait ? 1.34 : 1.28) : (portrait ? 1.2 : 1.16);
  const subtitleHeight = subtitleSizing
    ? Math.round(subtitleFontSize * subtitleLineHeight * subtitleSizing.lineCount + Math.round(6 * scale.scaleY))
    : 0;
  const subtitleGap = subtitle ? Math.round(12 * scale.scaleY) : 0;
  const bodyGap = Math.round((portrait ? 10 : 8) * scale.scaleY);
  const baseBodyFontSize = scaleBodyFontSize(portrait ? 32 : 28, scale, canvasWidth, canvasHeight);
  const bodyTop = titleY + titleHeight + subtitleGap + subtitleHeight + Math.round(18 * scale.scaleY);
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
    maxLinesPerRow: thaiText ? 3 : 2,
  });
  const bodyFontSize = bodyFit.fontSize;
  const bodyRows = bodyFit.rows;
  const bodyBlockHeight = bodyFit.totalHeight;
  const textPanelPaddingX = Math.round((portrait ? 36 : 64) * scale.scaleX);
  const textPanelPaddingY = Math.round((portrait ? 28 : 22) * scale.scaleY);
  const textPanelY = Math.max(contentArea.y, titleY - textPanelPaddingY);
  const textPanelHeight = Math.min(
    contentArea.height - Math.round(24 * scale.scaleY),
    titleHeight + subtitleGap + subtitleHeight + Math.round(18 * scale.scaleY) + bodyBlockHeight + (textPanelPaddingY * 2),
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

  if (subtitle && subtitleSizing) {
    elements.push(
      makeTextElement({
        x: titleX,
        y: titleY + titleHeight + subtitleGap,
        width: subtitleWidth,
        height: subtitleHeight,
        text: subtitle,
        color: preset.colors.text,
        fontSize: subtitleFontSize,
        fontFamily: preset.typography.titleFontFamily,
        fontWeight: "600",
        textAlign: "center",
        lineHeight: subtitleLineHeight,
        letterSpacing: thaiText ? 0 : -0.1,
        textShadow: "0 4px 12px rgba(0,0,0,0.35)",
      }),
    );
  }

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
  const portrait = isPortraitCanvas(canvasWidth, canvasHeight);
  const { subtitle, bodyLines } = resolveSlideSubtitleAndBodyLines(slideData, portrait ? 10 : 8);
  // Dynamic split: give text more space when content is heavy
  const totalTextLen = (slideData.title?.length ?? 0) + (subtitle?.length ?? 0) + bodyLines.join("").length;
  const textRatio = totalTextLen > 300 ? 0.6 : 0.5;
  const halfWidth = Math.round(contentArea.width * textRatio);
  const thaiText = hasThaiCharacters(`${slideData.title}\n${subtitle ?? ""}\n${bodyLines.join("\n")}`);
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
  const subtitleSizing = subtitle
    ? fitTitleTypography(
      subtitle,
      titleWidth,
      scaleBodyFontSize(portrait ? 32 : 28, scale, canvasWidth, canvasHeight),
      scaleBodyFontSize(portrait ? 24 : 20, scale, canvasWidth, canvasHeight),
      2,
    )
    : null;
  const subtitleFontSize = subtitleSizing?.fontSize ?? 0;
  const subtitleLineHeight = thaiText ? (portrait ? 1.36 : 1.3) : (portrait ? 1.2 : 1.16);
  const subtitleHeight = subtitleSizing
    ? Math.round(subtitleFontSize * subtitleLineHeight * subtitleSizing.lineCount + Math.round(4 * scale.scaleY))
    : 0;
  const subtitleGap = subtitle ? Math.round(10 * scale.scaleY) : 0;
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

  if (subtitle && subtitleSizing) {
    elements.push(
      makeTextElement({
        x: titleX,
        y: titleY + titleHeight + subtitleGap,
        width: titleWidth,
        height: subtitleHeight,
        text: subtitle,
        color: preset.colors.text,
        fontSize: subtitleFontSize,
        fontFamily: preset.typography.titleFontFamily,
        fontWeight: "600",
        textAlign: "left",
        lineHeight: subtitleLineHeight,
        letterSpacing: thaiText ? 0 : -0.08,
      }),
    );
  }

  // 4. Body text
  const bodyGap = Math.round(8 * scale.scaleY);
  const bodyTop = titleY + titleHeight + subtitleGap + subtitleHeight + Math.round(20 * scale.scaleY);
  const availableBodyHeight = Math.max(
    Math.round(52 * scale.scaleY),
    (contentArea.y + contentArea.height - Math.round(32 * scale.scaleY)) - bodyTop,
  );
  const bodyFit = fitBodyRowsToHeight({
    lines: bodyLines,
    width: titleWidth,
    baseFontSize: scaleBodyFontSize(26, scale, canvasWidth, canvasHeight),
    minFontSize: portrait ? 14 : 12,
    maxFontSize: portrait ? 34 : 24,
    lineHeightRatio: bodyLineHeightRatio,
    gapPx: bodyGap,
    availableHeightPx: availableBodyHeight,
    maxLinesPerRow: thaiText ? 4 : 2,
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

  // 5. Right image (uses remaining space)
  const imageWidth = contentArea.width - halfWidth;
  elements.push(
    makeImageOrPlaceholder(
      ctx,
      contentArea.x + halfWidth,
      contentArea.y,
      imageWidth,
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
  const portrait = isPortraitCanvas(canvasWidth, canvasHeight);
  const { subtitle, bodyLines } = resolveSlideSubtitleAndBodyLines(slideData, portrait ? 10 : 8);
  const thaiText = hasThaiCharacters(`${slideData.title}\n${subtitle ?? ""}\n${bodyLines.join("\n")}`);
  const titleLineHeight = getTitleLineHeight(canvasWidth, canvasHeight, thaiText);
  const bodyLineHeightRatio = getBodyLineHeight(canvasWidth, canvasHeight, thaiText);
  const bodyLetterSpacing = getBodyLetterSpacing(canvasWidth, canvasHeight, thaiText);
  // Dynamic split: give text more space when content is heavy
  const totalTextLen = (slideData.title?.length ?? 0) + (subtitle?.length ?? 0) + bodyLines.join("").length;
  const textRatio = totalTextLen > 300 ? 0.6 : 0.5;
  const imageWidth = Math.round(contentArea.width * (1 - textRatio));
  const textWidth = contentArea.width - imageWidth;

  // 1. Left image
  elements.push(
    makeImageOrPlaceholder(
      ctx,
      contentArea.x,
      contentArea.y,
      imageWidth,
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
      x: contentArea.x + imageWidth,
      y: contentArea.y,
      width: textWidth,
      height: contentArea.height,
      fill: preset.colors.backgroundAlt,
    }),
  );

  // 3. SVG graphic on right (skip if no graphic available)
  if (ctx.svgGraphic) {
    const svgSize = Math.round(80 * scale.scaleX);
    elements.push(
      makeImageElement({
        x: contentArea.x + imageWidth + Math.round(40 * scale.scaleX),
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
  const titleX = contentArea.x + imageWidth + Math.round(40 * scale.scaleX) + accentWidth + Math.round(14 * scale.scaleX);
  const titleWidth = textWidth - Math.round(96 * scale.scaleX);
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
  const subtitleSizing = subtitle
    ? fitTitleTypography(
      subtitle,
      titleWidth,
      scaleBodyFontSize(portrait ? 32 : 28, scale, canvasWidth, canvasHeight),
      scaleBodyFontSize(portrait ? 24 : 20, scale, canvasWidth, canvasHeight),
      2,
    )
    : null;
  const subtitleFontSize = subtitleSizing?.fontSize ?? 0;
  const subtitleLineHeight = thaiText ? (portrait ? 1.36 : 1.3) : (portrait ? 1.2 : 1.16);
  const subtitleHeight = subtitleSizing
    ? Math.round(subtitleFontSize * subtitleLineHeight * subtitleSizing.lineCount + Math.round(4 * scale.scaleY))
    : 0;
  const subtitleGap = subtitle ? Math.round(10 * scale.scaleY) : 0;
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

  if (subtitle && subtitleSizing) {
    elements.push(
      makeTextElement({
        x: titleX,
        y: titleY + titleHeight + subtitleGap,
        width: titleWidth,
        height: subtitleHeight,
        text: subtitle,
        color: preset.colors.text,
        fontSize: subtitleFontSize,
        fontFamily: preset.typography.titleFontFamily,
        fontWeight: "600",
        textAlign: "left",
        lineHeight: subtitleLineHeight,
        letterSpacing: thaiText ? 0 : -0.08,
      }),
    );
  }

  // 5. Body text on right
  const bodyGap = Math.round(8 * scale.scaleY);
  const bodyTop = titleY + titleHeight + subtitleGap + subtitleHeight + Math.round(20 * scale.scaleY);
  const availableBodyHeight = Math.max(
    Math.round(52 * scale.scaleY),
    (contentArea.y + contentArea.height - Math.round(32 * scale.scaleY)) - bodyTop,
  );
  const bodyFit = fitBodyRowsToHeight({
    lines: bodyLines,
    width: titleWidth,
    baseFontSize: scaleBodyFontSize(26, scale, canvasWidth, canvasHeight),
    minFontSize: portrait ? 14 : 12,
    maxFontSize: portrait ? 34 : 24,
    lineHeightRatio: bodyLineHeightRatio,
    gapPx: bodyGap,
    availableHeightPx: availableBodyHeight,
    maxLinesPerRow: thaiText ? 4 : 2,
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
  const { subtitle, bodyLines } = resolveSlideSubtitleAndBodyLines(slideData, portrait ? 10 : 12);
  const thaiText = hasThaiCharacters(`${slideData.title}\n${subtitle ?? ""}\n${bodyLines.join("\n")}`);
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
  const subtitleSizing = subtitle
    ? fitTitleTypography(
      subtitle,
      titleWidth,
      scaleBodyFontSize(portrait ? 32 : 28, scale, canvasWidth, canvasHeight),
      scaleBodyFontSize(portrait ? 24 : 20, scale, canvasWidth, canvasHeight),
      2,
    )
    : null;
  const subtitleFontSize = subtitleSizing?.fontSize ?? 0;
  const subtitleLineHeight = thaiText ? (portrait ? 1.36 : 1.3) : (portrait ? 1.2 : 1.16);
  const subtitleHeight = subtitleSizing
    ? Math.round(subtitleFontSize * subtitleLineHeight * subtitleSizing.lineCount + Math.round(4 * scale.scaleY))
    : 0;
  const subtitleGap = subtitle ? Math.round(10 * scale.scaleY) : 0;
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

  if (subtitle && subtitleSizing) {
    elements.push(
      makeTextElement({
        x: titleX,
        y: titleY + titleHeight + subtitleGap,
        width: titleWidth,
        height: subtitleHeight,
        text: subtitle,
        color: preset.colors.text,
        fontSize: subtitleFontSize,
        fontFamily: preset.typography.titleFontFamily,
        fontWeight: "600",
        textAlign: "left",
        lineHeight: subtitleLineHeight,
        letterSpacing: thaiText ? 0 : -0.08,
      }),
    );
  }

  const bodyGap = Math.round(8 * scale.scaleY);
  const bodyTop = titleY + titleHeight + subtitleGap + subtitleHeight + Math.round(14 * scale.scaleY);
  const availableBodyHeight = Math.max(56, (bottomY + bottomHeight - Math.round(26 * scale.scaleY)) - bodyTop);
  const bodyFit = fitBodyRowsToHeight({
    lines: bodyLines,
    width: titleWidth,
    baseFontSize: scaleBodyFontSize(26, scale, canvasWidth, canvasHeight),
    minFontSize: portrait ? 20 : 16,
    maxFontSize: portrait ? 34 : 24,
    lineHeightRatio: bodyLineHeightRatio,
    gapPx: bodyGap,
    availableHeightPx: availableBodyHeight,
    maxLinesPerRow: thaiText ? 4 : 2,
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
  const { subtitle, bodyLines } = resolveSlideSubtitleAndBodyLines(slideData, portrait ? 10 : 12);
  const thaiText = hasThaiCharacters(`${slideData.title}\n${subtitle ?? ""}\n${bodyLines.join("\n")}`);
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
  const subtitleSizing = subtitle
    ? fitTitleTypography(
      subtitle,
      titleWidth,
      scaleBodyFontSize(portrait ? 32 : 28, scale, canvasWidth, canvasHeight),
      scaleBodyFontSize(portrait ? 24 : 20, scale, canvasWidth, canvasHeight),
      2,
    )
    : null;
  const subtitleFontSize = subtitleSizing?.fontSize ?? 0;
  const subtitleLineHeight = thaiText ? (portrait ? 1.36 : 1.3) : (portrait ? 1.2 : 1.16);
  const subtitleHeight = subtitleSizing
    ? Math.round(subtitleFontSize * subtitleLineHeight * subtitleSizing.lineCount + Math.round(4 * scale.scaleY))
    : 0;
  const subtitleGap = subtitle ? Math.round(10 * scale.scaleY) : 0;
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

  if (subtitle && subtitleSizing) {
    elements.push(
      makeTextElement({
        x: titleX,
        y: titleY + titleHeight + subtitleGap,
        width: titleWidth,
        height: subtitleHeight,
        text: subtitle,
        color: preset.colors.text,
        fontSize: subtitleFontSize,
        fontFamily: preset.typography.titleFontFamily,
        fontWeight: "600",
        textAlign: "left",
        lineHeight: subtitleLineHeight,
        letterSpacing: thaiText ? 0 : -0.08,
      }),
    );
  }

  const bodyGap = Math.round(8 * scale.scaleY);
  const bodyTop = titleY + titleHeight + subtitleGap + subtitleHeight + Math.round(14 * scale.scaleY);
  const availableBodyHeight = Math.max(56, (contentArea.y + topHeight - Math.round(22 * scale.scaleY)) - bodyTop);
  const bodyFit = fitBodyRowsToHeight({
    lines: bodyLines,
    width: titleWidth,
    baseFontSize: scaleBodyFontSize(26, scale, canvasWidth, canvasHeight),
    minFontSize: portrait ? 20 : 16,
    maxFontSize: portrait ? 34 : 24,
    lineHeightRatio: bodyLineHeightRatio,
    gapPx: bodyGap,
    availableHeightPx: availableBodyHeight,
    maxLinesPerRow: thaiText ? 4 : 2,
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
  const cards = resolveSlideSections(slideData, portrait ? 7 : 8);
  const fallbackCardLines = compactBodyLines(slideData.body, portrait ? 7 : 8);
  const normalizedCards = cards.length > 0
    ? cards
    : fallbackCardLines.map((line) => ({ heading: line, details: [] }));
  const thaiText = hasThaiCharacters(
    `${slideData.title}\n${normalizedCards.map((card) => `${card.heading}\n${card.details.join("\n")}`).join("\n")}`,
  );
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
  const titleHeight = estimateTextBlockHeight(
    titleFontSize,
    titleLineHeight,
    titleLineCount,
    Math.round(2 * scale.scaleY),
  );
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
  const cardCount = Math.max(1, normalizedCards.length);
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
    const card = normalizedCards[i] ?? { heading: "", details: [] };
    const headingText = card.heading || fallbackCardLines[i] || "";
    const detailText = card.details.join(" ");
    if (headingText) {
      const cardTextWidth = cardWidth - Math.round(40 * scale.scaleX);
      const cardInnerHeight = cardHeight - Math.round(20 * scale.scaleY);
      const headingLineCount = estimateTextLineCount(
        headingText,
        cardTextWidth,
        scaleBodyFontSize(24, scale, canvasWidth, canvasHeight),
        3,
      );
      const headingFontSize = fitBodyFontSizeToHeight({
        baseFontSize: scaleBodyFontSize(24, scale, canvasWidth, canvasHeight),
        minFontSize: portrait ? 18 : 15,
        maxFontSize: portrait ? 34 : 28,
        lineCount: headingLineCount,
        lineHeightRatio: thaiText ? 1.34 : 1.2,
        gapPx: 0,
        availableHeightPx: detailText ? Math.max(26, cardInnerHeight * 0.45) : Math.max(26, cardInnerHeight),
      });
      const headingHeight = Math.max(
        estimateTextBlockHeight(headingFontSize, thaiText ? 1.34 : 1.2, headingLineCount),
        Math.round(24 * scale.scaleY),
      );
      elements.push(
        makeTextElement({
          x:
            contentArea.x +
            leftWidth +
            Math.round(50 * scale.scaleX),
          y: cardY + Math.round(10 * scale.scaleY),
          width: cardTextWidth,
          height: headingHeight,
          text: headingText,
          color: preset.colors.text,
          fontSize: headingFontSize,
          fontFamily: preset.typography.titleFontFamily,
          fontWeight: "600",
          textAlign: "left",
          lineHeight: thaiText ? 1.34 : 1.2,
          letterSpacing: thaiText ? 0 : -0.08,
        }),
      );

      if (detailText) {
        const detailY = cardY + Math.round(14 * scale.scaleY) + headingHeight;
        const detailHeight = Math.max(
          20,
          cardInnerHeight - (detailY - cardY),
        );
        const detailLineCount = estimateTextLineCount(
          detailText,
          cardTextWidth,
          scaleBodyFontSize(20, scale, canvasWidth, canvasHeight),
          4,
        );
        const detailFontSize = fitBodyFontSizeToHeight({
          baseFontSize: scaleBodyFontSize(20, scale, canvasWidth, canvasHeight),
          minFontSize: portrait ? 16 : 13,
          maxFontSize: portrait ? 28 : 22,
          lineCount: detailLineCount,
          lineHeightRatio: bodyLineHeightRatio,
          gapPx: 0,
          availableHeightPx: detailHeight,
        });
        elements.push(
          makeTextElement({
            x:
              contentArea.x +
              leftWidth +
              Math.round(50 * scale.scaleX),
            y: detailY,
            width: cardTextWidth,
            height: detailHeight,
            text: detailText,
            color: preset.colors.text,
            fontSize: detailFontSize,
            fontFamily: preset.typography.bodyFontFamily,
            fontWeight: fontWeightToString(preset.typography.bodyFontWeight),
            textAlign: "left",
            lineHeight: bodyLineHeightRatio,
            letterSpacing: bodyLetterSpacing,
          }),
        );
      }
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

function buildVisualOnlyMediaElements(ctx: TemplateContext): SlideElement[] {
  const mediaAlt = ctx.slideData.title?.trim() || `Slide ${ctx.slideIndex + 1} media`;
  if (ctx.imageUrl?.trim()) {
    return [
      makeImageElement({
        x: 0,
        y: 0,
        width: ctx.canvasWidth,
        height: ctx.canvasHeight,
        src: ctx.imageUrl,
        alt: mediaAlt,
        imageFit: "cover",
        imagePositionX: 50,
        imagePositionY: 50,
        imageZoom: 1,
      }),
    ];
  }

  if (ctx.svgGraphic?.svg) {
    return [
      makeImageElement({
        x: 0,
        y: 0,
        width: ctx.canvasWidth,
        height: ctx.canvasHeight,
        src: "",
        alt: mediaAlt,
        imageFit: "cover",
        svgContent: ctx.svgGraphic.svg,
        svgColor: ctx.preset.colors.primary,
      }),
    ];
  }

  ctx.warnings.push("No generated media available for visual-only slide; using background only");
  return [];
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
  if (input.visualOnly) {
    templateElements = buildVisualOnlyMediaElements(ctx);
  } else {
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
  }
  elements.push(...templateElements);

  // 3. Header
  if (!input.visualOnly) {
    elements.push(
      ...buildHeaderElements(
        input.stylePreset,
        canvasWidth,
        headerHeight,
        input.deckTitle,
        scale,
      ),
    );
  }

  // 4. Footer
  if (!input.visualOnly) {
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
  }

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
