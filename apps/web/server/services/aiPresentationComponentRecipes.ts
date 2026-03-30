import type {
  PresentationComponentImageSlotBinding,
  PresentationComponentInstance,
  PresentationComponentSlotBinding,
  PresentationComponentVideoSlotBinding,
  PresentationPendingMediaJob,
  PresentationSlideContent,
  PresentationSlideElement,
} from "@shared/presentation/contracts";
import {
  PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES,
  PRESENTATION_COMPONENT_MEDIA_SLOTS,
  PRESENTATION_COMPONENT_MEDIA_SLOT_TYPES,
  PRESENTATION_COMPONENT_SLOT_TARGETS,
  presentationMediaSlotSupportsType,
} from "@shared/presentation/componentRecipes";
import type { PresentationComponentMediaSlotType } from "@shared/presentation/componentRecipes";
import { buildPresentationComponentRecipeSlotBindings } from "@shared/presentation/componentRecipeSlotBindings";
import type {
  AIPresentationComponentRecipeId,
  AIPresentationSlide,
  SlideStylePreset,
} from "@shared/presentation/aiTypes";

const BASE_RECIPE_WIDTH = 1280;
const BASE_RECIPE_HEIGHT = 720;
const PORTRAIT_LAYOUT_WIDTH = 1000;
const PORTRAIT_LAYOUT_HEIGHT = 1414;
const BUILT_IN_COMPONENT_REVISION = 1;

interface ContentArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutFrame {
  scale: number;
  offsetX: number;
  offsetY: number;
  /** Vertical stretch factor for portrait layouts mapping A4-era y-coords to 9:16 canvas */
  yStretch?: number;
}

function getLayoutFrame(contentArea: ContentArea): LayoutFrame {
  const scale = Math.min(
    contentArea.width / BASE_RECIPE_WIDTH,
    contentArea.height / BASE_RECIPE_HEIGHT,
  );
  return {
    scale,
    offsetX: Math.round(contentArea.x + ((contentArea.width - (BASE_RECIPE_WIDTH * scale)) / 2)),
    offsetY: Math.round(contentArea.y + ((contentArea.height - (BASE_RECIPE_HEIGHT * scale)) / 2)),
  };
}

function isPortraitContentArea(contentArea: ContentArea): boolean {
  return contentArea.height > contentArea.width;
}

function getPortraitDocumentFrame(contentArea: ContentArea): LayoutFrame {
  // For tall portrait canvases like 9:16 we can preserve the full-width editorial feel
  // and stretch vertically to consume the extra height.
  const widthScale = contentArea.width / PORTRAIT_LAYOUT_WIDTH;
  const widthDrivenStretch = contentArea.height / (PORTRAIT_LAYOUT_HEIGHT * widthScale);
  if (widthDrivenStretch >= 1) {
    return {
      scale: widthScale,
      offsetX: Math.round(contentArea.x),
      offsetY: Math.round(contentArea.y),
      yStretch: widthDrivenStretch,
    };
  }

  // Shorter portrait boards like 4:5 cannot safely compress only the y-axis:
  // the text boxes shrink but font sizes stay width-driven, which causes overlap.
  // In that case, scale uniformly to height and center the page instead.
  const scale = Math.min(widthScale, contentArea.height / PORTRAIT_LAYOUT_HEIGHT);
  return {
    scale,
    offsetX: Math.round(contentArea.x + ((contentArea.width - (PORTRAIT_LAYOUT_WIDTH * scale)) / 2)),
    offsetY: Math.round(contentArea.y + ((contentArea.height - (PORTRAIT_LAYOUT_HEIGHT * scale)) / 2)),
  };
}

function px(frame: LayoutFrame, value: number): number {
  return frame.offsetX + Math.round(value * frame.scale);
}

function py(frame: LayoutFrame, value: number): number {
  const stretched = value * (frame.yStretch ?? 1);
  return frame.offsetY + Math.round(stretched * frame.scale);
}

function ps(frame: LayoutFrame, value: number, min: number = 1): number {
  return Math.max(min, Math.round(value * frame.scale));
}

/** Scale a height value, applying yStretch when present (portrait layouts). */
function phs(frame: LayoutFrame, value: number, min: number = 1): number {
  const stretched = value * (frame.yStretch ?? 1);
  return Math.max(min, Math.round(stretched * frame.scale));
}

function componentElementId(componentInstanceId: string, suffix: string): string {
  return `${componentInstanceId}::${suffix}`;
}

function componentTextSlot(slotBindings: PresentationComponentSlotBinding[], slotId: string, fallback: string): string {
  const binding = slotBindings.find((slot) => slot.slotId === slotId && slot.type === "text");
  return binding?.type === "text" ? binding.text : fallback;
}

function componentListSlot(slotBindings: PresentationComponentSlotBinding[], slotId: string, fallback: string[]): string[] {
  const binding = slotBindings.find((slot) => slot.slotId === slotId && slot.type === "list");
  return binding?.type === "list" ? binding.items : fallback;
}

function componentImageSlot(
  slotBindings: PresentationComponentSlotBinding[],
  slotId: string,
  fallback: { src: string; alt: string },
): { src: string; alt: string } {
  const binding = slotBindings.find((slot): slot is PresentationComponentImageSlotBinding => (
    slot.slotId === slotId && slot.type === "image"
  ));
  return {
    src: binding?.src ?? fallback.src,
    alt: binding?.alt ?? fallback.alt,
  };
}

function componentVideoSlot(
  slotBindings: PresentationComponentSlotBinding[],
  slotId: string,
  fallback: { src: string; poster?: string; title: string },
): { src: string; poster?: string; title: string } {
  const binding = slotBindings.find((slot): slot is PresentationComponentVideoSlotBinding => (
    slot.slotId === slotId && slot.type === "video"
  ));
  return {
    src: binding?.src ?? fallback.src,
    poster: binding?.poster ?? fallback.poster,
    title: binding?.title ?? fallback.title,
  };
}

function makeText(
  frame: LayoutFrame,
  componentInstanceId: string,
  config: {
    suffix: string;
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    color: string;
    fontSize: number;
    fontFamily?: string;
    fontWeight?: "normal" | "500" | "600" | "700";
    textAlign?: "left" | "center" | "right" | "justify";
    lineHeight?: number;
  },
): Extract<PresentationSlideElement, { type: "text" }> {
  return {
    id: componentElementId(componentInstanceId, config.suffix),
    type: "text",
    x: px(frame, config.x),
    y: py(frame, config.y),
    width: ps(frame, config.width),
    height: phs(frame, config.height),
    rotation: 0,
    text: config.text,
    color: config.color,
    fontSize: ps(frame, config.fontSize, 8),
    ...(config.fontFamily ? { fontFamily: config.fontFamily } : {}),
    ...(config.fontWeight ? { fontWeight: config.fontWeight } : {}),
    ...(config.textAlign ? { textAlign: config.textAlign } : {}),
    ...(config.lineHeight ? { lineHeight: config.lineHeight } : {}),
  };
}

const THAI_COMBINING_MARK_REGEX = /[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/g;
const ZERO_WIDTH_CHAR_REGEX = /[\u200b-\u200d\ufeff]/g;

function countRenderableCharacters(text: string): number {
  const normalized = text
    .replace(THAI_COMBINING_MARK_REGEX, "")
    .replace(ZERO_WIDTH_CHAR_REGEX, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? Array.from(normalized).length : 0;
}

function hasThaiCharacters(text: string): boolean {
  return /[\u0E00-\u0E7F]/.test(text);
}

function estimateComponentTextLineCount(text: string, width: number, fontSize: number): number {
  const cleaned = text.trim();
  if (!cleaned) {
    return 1;
  }
  const thaiText = hasThaiCharacters(cleaned);
  const charsPerLine = Math.max(4, Math.floor(width / Math.max(1, fontSize * (thaiText ? 0.6 : 0.56))));
  const paragraphs = cleaned.split(/\n+/).filter(Boolean);
  let total = 0;
  for (const paragraph of paragraphs) {
    if (thaiText && !/\s/.test(paragraph)) {
      total += Math.max(1, Math.ceil((countRenderableCharacters(paragraph) * 1.08) / charsPerLine));
      continue;
    }
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      total += 1;
      continue;
    }
    let current = 0;
    let lines = 1;
    for (const word of words) {
      const wordChars = Math.max(1, countRenderableCharacters(word));
      if (current === 0) {
        current = wordChars;
        continue;
      }
      if ((current + 1 + wordChars) <= charsPerLine) {
        current += 1 + wordChars;
        continue;
      }
      lines += 1;
      current = wordChars;
    }
    total += Math.max(1, lines);
  }
  return Math.max(1, total);
}

function estimateComponentTextHeight(fontSize: number, lineHeight: number, lineCount: number): number {
  return Math.max(fontSize, Math.round(fontSize * lineHeight * lineCount + (fontSize * 0.24)));
}

function trimTextToLineLimit(text: string, width: number, fontSize: number, maxLines: number): string {
  let next = text.trim();
  if (!next) {
    return next;
  }
  while (estimateComponentTextLineCount(next, width, fontSize) > maxLines && next.length > 1) {
    if (/\s/.test(next)) {
      next = next.replace(/\s+\S*$/, "").trim();
    } else {
      next = next.slice(0, -1).trim();
    }
  }
  const trimmed = next.replace(/[,.\s…]+$/, "");
  return trimmed && trimmed !== text.trim() ? `${trimmed}…` : (trimmed || text.trim());
}

function fitTextBox(config: {
  text: string;
  width: number;
  height: number;
  baseFontSize: number;
  minFontSize: number;
  lineHeight: number;
  maxLines: number;
  allowExpansion?: boolean;
  maxFontSize?: number;
}): { text: string; fontSize: number } {
  const cleanedText = config.text.trim();
  if (!cleanedText) {
    return { text: "", fontSize: config.baseFontSize };
  }
  const targetMaxFontSize = config.allowExpansion
    ? Math.max(config.baseFontSize, config.maxFontSize ?? config.baseFontSize)
    : config.baseFontSize;
  for (let size = targetMaxFontSize; size >= config.minFontSize; size -= 1) {
    const nextText = trimTextToLineLimit(cleanedText, config.width, size, config.maxLines);
    const lineCount = estimateComponentTextLineCount(nextText, config.width, size);
    const height = estimateComponentTextHeight(size, config.lineHeight, lineCount);
    if (lineCount <= config.maxLines && height <= config.height) {
      return { text: nextText, fontSize: size };
    }
  }
  return {
    text: trimTextToLineLimit(cleanedText, config.width, config.minFontSize, config.maxLines),
    fontSize: config.minFontSize,
  };
}

function fitListTextBox(config: {
  items: string[];
  width: number;
  height: number;
  baseFontSize: number;
  minFontSize: number;
  lineHeight: number;
  maxLines: number;
  bulletPrefix?: string;
  allowExpansion?: boolean;
  maxFontSize?: number;
}): { text: string; fontSize: number } {
  const bulletPrefix = config.bulletPrefix ?? "• ";
  const text = config.items
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => `${bulletPrefix}${item}`)
    .join("\n");
  return fitTextBox({
    text,
    width: config.width,
    height: config.height,
    baseFontSize: config.baseFontSize,
    minFontSize: config.minFontSize,
    lineHeight: config.lineHeight,
    maxLines: config.maxLines,
    allowExpansion: config.allowExpansion,
    maxFontSize: config.maxFontSize,
  });
}

function countTextCharacters(values: Array<string | null | undefined>): number {
  return values.reduce((sum, value) => sum + String(value ?? "").trim().length, 0);
}

function makeRect(
  frame: LayoutFrame,
  componentInstanceId: string,
  config: {
    suffix: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
    stroke?: string;
    strokeWidth?: number;
  },
): Extract<PresentationSlideElement, { type: "rect" }> {
  return {
    id: componentElementId(componentInstanceId, config.suffix),
    type: "rect",
    x: px(frame, config.x),
    y: py(frame, config.y),
    width: ps(frame, config.width),
    height: phs(frame, config.height),
    rotation: 0,
    fill: config.fill,
    ...(config.stroke ? { stroke: config.stroke } : {}),
    ...(config.strokeWidth != null ? { strokeWidth: ps(frame, config.strokeWidth) } : {}),
  };
}

function makeImage(
  frame: LayoutFrame,
  componentInstanceId: string,
  config: {
    suffix: string;
    x: number;
    y: number;
    width: number;
    height: number;
    src: string;
    alt: string;
    mediaShape?: "rect" | "rounded" | "circle" | "ellipse" | "diamond" | "star";
    mediaCornerRadius?: number;
  },
): Extract<PresentationSlideElement, { type: "image" }> {
  return {
    id: componentElementId(componentInstanceId, config.suffix),
    type: "image",
    x: px(frame, config.x),
    y: py(frame, config.y),
    width: ps(frame, config.width),
    height: phs(frame, config.height),
    rotation: 0,
    src: config.src,
    alt: config.alt,
    imageFit: "cover",
    mediaShape: config.mediaShape,
    mediaCornerRadius: config.mediaCornerRadius,
    imagePositionX: 50,
    imagePositionY: 50,
    imageZoom: 1,
  };
}

function makeVideo(
  frame: LayoutFrame,
  componentInstanceId: string,
  config: {
    suffix: string;
    x: number;
    y: number;
    width: number;
    height: number;
    src: string;
    poster?: string;
    title?: string;
    mediaShape?: "rect" | "rounded" | "circle" | "ellipse" | "diamond" | "star";
    mediaCornerRadius?: number;
  },
): Extract<PresentationSlideElement, { type: "video" }> {
  return {
    id: componentElementId(componentInstanceId, config.suffix),
    type: "video",
    x: px(frame, config.x),
    y: py(frame, config.y),
    width: ps(frame, config.width),
    height: phs(frame, config.height),
    rotation: 0,
    src: config.src,
    ...(config.poster ? { poster: config.poster } : {}),
    ...(config.title ? { title: config.title } : {}),
    muted: true,
    loop: true,
    videoFit: "cover",
    mediaShape: config.mediaShape,
    mediaCornerRadius: config.mediaCornerRadius,
    videoPositionX: 50,
    videoPositionY: 50,
    videoZoom: 1,
  };
}

function createProfileSummarySlotBindings(
  slideData: AIPresentationSlide,
  mediaUrl: string | null,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("profile-summary", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
    mediaUrl,
  });
}

function createVideoSpotlightSlotBindings(
  slideData: AIPresentationSlide,
  mediaUrl: string | null,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("video-spotlight", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
    mediaUrl,
  });
}

function createPosterSpotlightSlotBindings(
  slideData: AIPresentationSlide,
  mediaUrl: string | null,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("poster-spotlight", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
    mediaUrl,
  });
}

function createProcessStepsSlotBindings(
  slideData: AIPresentationSlide,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("process-steps", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
  });
}

function createTimelineFlowSlotBindings(
  slideData: AIPresentationSlide,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("timeline-flow", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
  });
}

function createTimelineReportSlotBindings(
  slideData: AIPresentationSlide,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("timeline-report", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
  });
}

function createFeatureHighlightsSlotBindings(
  slideData: AIPresentationSlide,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("feature-highlights", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
  });
}

function createInfographicGridSlotBindings(
  slideData: AIPresentationSlide,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("infographic-grid", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
  });
}

function createStatCardsSlotBindings(
  slideData: AIPresentationSlide,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("stat-cards", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
  });
}

function createSectionedExplainerSlotBindings(
  slideData: AIPresentationSlide,
  mediaUrl: string | null,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("sectioned-explainer", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
    mediaUrl,
  });
}

function createQuoteCalloutSlotBindings(
  slideData: AIPresentationSlide,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("quote-callout", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
  });
}

function createFramedImageStorySlotBindings(
  slideData: AIPresentationSlide,
  mediaUrl: string | null,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("framed-image-story", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
    mediaUrl,
  });
}

function createPhotoCollageSlotBindings(
  slideData: AIPresentationSlide,
  mediaUrls: Array<string | null>,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("photo-collage", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
    mediaUrl: mediaUrls[0] ?? null,
    mediaUrls,
  });
}

function createA4PhotoGridSlotBindings(
  slideData: AIPresentationSlide,
  mediaUrls: Array<string | null>,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("a4-photo-grid", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
    mediaUrl: mediaUrls[0] ?? null,
    mediaUrls,
  });
}

function createLandscapePhotoStorySlotBindings(
  slideData: AIPresentationSlide,
  mediaUrls: Array<string | null>,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("landscape-photo-story", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
    mediaUrl: mediaUrls[0] ?? null,
    mediaUrls,
  });
}

function createArticleFocusSlotBindings(
  slideData: AIPresentationSlide,
  mediaUrl: string | null,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("article-focus", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
    mediaUrl,
  });
}

function createTwoColumnArticleSlotBindings(
  slideData: AIPresentationSlide,
  mediaUrl: string | null,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("two-column-article", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
    mediaUrl,
  });
}

function createFaqStackSlotBindings(
  slideData: AIPresentationSlide,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("faq-stack", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
  });
}

function createProfileBoardSlotBindings(
  slideData: AIPresentationSlide,
  mediaUrl: string | null,
): PresentationComponentSlotBinding[] {
  if (slideData.componentSlotBindings?.length) {
    return slideData.componentSlotBindings.map((binding) => ({ ...binding }));
  }
  return buildPresentationComponentRecipeSlotBindings("profile-board", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
    mediaUrl,
  });
}

function buildSectionedExplainerFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  if (isPortraitContentArea(contentArea)) {
    const frame = getPortraitDocumentFrame(contentArea);
    const hero = componentImageSlot(slotBindings, "hero", { src: "", alt: "Hero visual" });
    const heroFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["sectioned-explainer"]?.hero;
    const canvasBottom = PORTRAIT_LAYOUT_HEIGHT;
    const heroY = 54;
    const heroH = 370;
    const heroBottom = heroY + heroH;
    const eyebrowY = heroBottom + 30;
    const eyebrowH = 42;
    const eyebrowBottom = eyebrowY + eyebrowH;
    const titleY = eyebrowBottom + 20;
    const titleH = 80;
    const titleFit = fitTextBox({
      text: componentTextSlot(slotBindings, "title", ""),
      width: 888,
      height: titleH,
      baseFontSize: 42,
      minFontSize: 28,
      lineHeight: 1.08,
      maxLines: 2,
    });
    const titleBottom = titleY + titleH;
    const introY = titleBottom + 12;
    const introH = 100;
    const introFit = fitTextBox({
      text: componentTextSlot(slotBindings, "intro", ""),
      width: 888,
      height: introH,
      baseFontSize: 18,
      minFontSize: 12,
      lineHeight: 1.36,
      maxLines: 6,
    });
    const introBottom = introY + introH;
    const sectionWidth = 258;
    const sectionHeadingY = introBottom + 16;
    const section1HeadingText = componentTextSlot(slotBindings, "section1-heading", "");
    const section2HeadingText = componentTextSlot(slotBindings, "section2-heading", "");
    const section3HeadingText = componentTextSlot(slotBindings, "section3-heading", "");
    const computeHeadingHeight = (text: string) => {
      if (!text.trim()) {
        return 30;
      }
      const lines = estimateComponentTextLineCount(text.trim(), sectionWidth, 20);
      return Math.max(30, estimateComponentTextHeight(20, 1.2, lines));
    };
    const sectionHeadingHeight = Math.min(100, Math.max(
      computeHeadingHeight(section1HeadingText),
      computeHeadingHeight(section2HeadingText),
      computeHeadingHeight(section3HeadingText),
    ));
    const sectionBodyY = sectionHeadingY + sectionHeadingHeight + 4;
    const sectionLineHeight = 1.38;
    const sectionMinFont = 11;
    const sectionGapToTakeaways = 20;
    const takeawaysPaddingTop = 32;
    const takeawaysPaddingBottom = 20;
    const takeawaysTitleHeight = 28;
    const takeawaysGap = 8;
    const availableHeight = canvasBottom - sectionBodyY - sectionGapToTakeaways;
    const sectionBodyHeight = Math.max(200, Math.round(availableHeight * 0.75));
    const takeawaysCardHeight = Math.max(100, availableHeight - sectionBodyHeight);
    const takeawaysTextHeight = Math.max(
      40,
      takeawaysCardHeight - takeawaysPaddingTop - takeawaysTitleHeight - takeawaysGap - takeawaysPaddingBottom,
    );
    const sectionMaxLines = Math.max(
      20,
      Math.floor((sectionBodyHeight - sectionMinFont * 0.24) / (sectionMinFont * sectionLineHeight)),
    );
    const s1Body = fitTextBox({
      text: componentTextSlot(slotBindings, "section1-body", ""),
      width: sectionWidth,
      height: sectionBodyHeight,
      baseFontSize: 18,
      minFontSize: sectionMinFont,
      lineHeight: sectionLineHeight,
      maxLines: sectionMaxLines,
    });
    const s2Body = fitTextBox({
      text: componentTextSlot(slotBindings, "section2-body", ""),
      width: sectionWidth,
      height: sectionBodyHeight,
      baseFontSize: 18,
      minFontSize: sectionMinFont,
      lineHeight: sectionLineHeight,
      maxLines: sectionMaxLines,
    });
    const s3Body = fitTextBox({
      text: componentTextSlot(slotBindings, "section3-body", ""),
      width: sectionWidth,
      height: sectionBodyHeight,
      baseFontSize: 18,
      minFontSize: sectionMinFont,
      lineHeight: sectionLineHeight,
      maxLines: sectionMaxLines,
    });
    const takeawaysCardY = sectionBodyY + sectionBodyHeight + sectionGapToTakeaways;
    const takeawaysTitleY = takeawaysCardY + takeawaysPaddingTop;
    const takeawaysTextY = takeawaysTitleY + takeawaysTitleHeight + takeawaysGap;
    const takeawaysFitMaxLines = Math.max(
      3,
      Math.floor((takeawaysTextHeight - 12 * 0.24) / (12 * 1.42)),
    );
    const takeawaysFit = fitListTextBox({
      items: componentListSlot(slotBindings, "takeaways", []),
      width: 816,
      height: takeawaysTextHeight,
      baseFontSize: 18,
      minFontSize: 11,
      lineHeight: 1.42,
      maxLines: takeawaysFitMaxLines,
      bulletPrefix: "• ",
    });
    const heroElements = hero.src.trim()
      ? [
        makeImage(frame, componentId, {
          suffix: "hero-image",
          x: 56,
          y: heroY,
          width: 888,
          height: heroH,
          src: hero.src,
          alt: hero.alt,
          mediaShape: heroFrameStyle?.mediaShape,
          mediaCornerRadius: heroFrameStyle?.mediaCornerRadius,
        }),
      ]
      : [
        makeRect(frame, componentId, {
          suffix: "hero-frame",
          x: 56,
          y: heroY,
          width: 888,
          height: heroH,
          fill: "#DBEAFE",
        }),
        makeText(frame, componentId, {
          suffix: "hero-placeholder",
          x: 236,
          y: 212,
          width: 528,
          height: 44,
          text: "Explainer Visual",
          color: "#1D4ED8",
          fontSize: 30,
          fontFamily: stylePreset.typography.titleFontFamily,
          fontWeight: "700",
          textAlign: "center",
        }),
      ];

    return [
      makeRect(frame, componentId, {
        suffix: "canvas-bg",
        x: 0,
        y: 0,
        width: PORTRAIT_LAYOUT_WIDTH,
        height: PORTRAIT_LAYOUT_HEIGHT,
        fill: "#FFFFFF",
      }),
      ...heroElements,
      makeRect(frame, componentId, {
        suffix: "eyebrow-bg",
        x: 56,
        y: eyebrowY,
        width: 230,
        height: eyebrowH,
        fill: "#DBEAFE",
      }),
      makeText(frame, componentId, {
        suffix: "eyebrow",
        x: 86,
        y: eyebrowY + 12,
        width: 170,
        height: 16,
        text: componentTextSlot(slotBindings, "eyebrow", ""),
        color: "#1D4ED8",
        fontSize: 18,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "700",
        textAlign: "center",
      }),
      makeText(frame, componentId, {
        suffix: "title",
        x: 56,
        y: titleY,
        width: 888,
        height: titleH,
        text: titleFit.text,
        color: "#0F172A",
        fontSize: titleFit.fontSize,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
        lineHeight: 1.08,
      }),
      makeText(frame, componentId, {
        suffix: "intro",
        x: 56,
        y: introY,
        width: 888,
        height: introH,
        text: introFit.text,
        color: "#475569",
        fontSize: introFit.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "500",
        lineHeight: 1.36,
      }),
      makeText(frame, componentId, {
        suffix: "section-1-heading",
        x: 56,
        y: sectionHeadingY,
        width: sectionWidth,
        height: sectionHeadingHeight,
        text: section1HeadingText,
        color: "#0F172A",
        fontSize: 20,
        fontWeight: "700",
        lineHeight: 1.2,
      }),
      makeText(frame, componentId, {
        suffix: "section-1-body",
        x: 56,
        y: sectionBodyY,
        width: sectionWidth,
        height: sectionBodyHeight,
        text: s1Body.text,
        color: "#334155",
        fontSize: s1Body.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        lineHeight: sectionLineHeight,
      }),
      makeText(frame, componentId, {
        suffix: "section-2-heading",
        x: 370,
        y: sectionHeadingY,
        width: sectionWidth,
        height: sectionHeadingHeight,
        text: section2HeadingText,
        color: "#0F172A",
        fontSize: 20,
        fontWeight: "700",
        lineHeight: 1.2,
      }),
      makeText(frame, componentId, {
        suffix: "section-2-body",
        x: 370,
        y: sectionBodyY,
        width: sectionWidth,
        height: sectionBodyHeight,
        text: s2Body.text,
        color: "#334155",
        fontSize: s2Body.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        lineHeight: sectionLineHeight,
      }),
      makeText(frame, componentId, {
        suffix: "section-3-heading",
        x: 686,
        y: sectionHeadingY,
        width: sectionWidth,
        height: sectionHeadingHeight,
        text: section3HeadingText,
        color: "#0F172A",
        fontSize: 20,
        fontWeight: "700",
        lineHeight: 1.2,
      }),
      makeText(frame, componentId, {
        suffix: "section-3-body",
        x: 686,
        y: sectionBodyY,
        width: sectionWidth,
        height: sectionBodyHeight,
        text: s3Body.text,
        color: "#334155",
        fontSize: s3Body.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        lineHeight: sectionLineHeight,
      }),
      makeRect(frame, componentId, {
        suffix: "takeaways-card",
        x: 56,
        y: takeawaysCardY,
        width: 888,
        height: takeawaysCardHeight,
        fill: "#EEF2FF",
      }),
      makeText(frame, componentId, {
        suffix: "takeaways-title",
        x: 92,
        y: takeawaysTitleY,
        width: 220,
        height: takeawaysTitleHeight,
        text: componentTextSlot(slotBindings, "takeaways-title", "Key Takeaways"),
        color: "#4338CA",
        fontSize: 22,
        fontWeight: "700",
      }),
      makeText(frame, componentId, {
        suffix: "takeaways",
        x: 92,
        y: takeawaysTextY,
        width: 816,
        height: takeawaysTextHeight,
        text: takeawaysFit.text,
        color: "#334155",
        fontSize: takeawaysFit.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        lineHeight: 1.42,
      }),
    ];
  }
  const frame = getLayoutFrame(contentArea);
  const hero = componentImageSlot(slotBindings, "hero", { src: "", alt: "Hero visual" });
  const heroFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["sectioned-explainer"]?.hero;
  const title = fitTextBox({
    text: componentTextSlot(slotBindings, "title", ""),
    width: hero.src.trim() ? 610 : 1030,
    height: hero.src.trim() ? 74 : 58,
    baseFontSize: hero.src.trim() ? 40 : 44,
    minFontSize: hero.src.trim() ? 28 : 30,
    lineHeight: 1.12,
    maxLines: 2,
  });
  const intro = fitTextBox({
    text: componentTextSlot(slotBindings, "intro", ""),
    width: hero.src.trim() ? 610 : 292,
    height: hero.src.trim() ? 108 : 246,
    baseFontSize: hero.src.trim() ? 18 : 20,
    minFontSize: hero.src.trim() ? 13 : 15,
    lineHeight: 1.5,
    maxLines: hero.src.trim() ? 6 : 10,
    allowExpansion: true,
    maxFontSize: hero.src.trim() ? 22 : 24,
  });
  const section1Body = fitTextBox({
    text: componentTextSlot(slotBindings, "section1-body", ""),
    width: hero.src.trim() ? 560 : 638,
    height: hero.src.trim() ? 34 : 96,
    baseFontSize: hero.src.trim() ? 15 : 19,
    minFontSize: 12,
    lineHeight: 1.46,
    maxLines: hero.src.trim() ? 2 : 6,
    allowExpansion: true,
    maxFontSize: hero.src.trim() ? 18 : 22,
  });
  const section2Body = fitTextBox({
    text: componentTextSlot(slotBindings, "section2-body", ""),
    width: hero.src.trim() ? 560 : 638,
    height: hero.src.trim() ? 34 : 96,
    baseFontSize: hero.src.trim() ? 15 : 19,
    minFontSize: 12,
    lineHeight: 1.46,
    maxLines: hero.src.trim() ? 2 : 6,
    allowExpansion: true,
    maxFontSize: hero.src.trim() ? 18 : 22,
  });
  const section3Body = fitTextBox({
    text: componentTextSlot(slotBindings, "section3-body", ""),
    width: hero.src.trim() ? 560 : 638,
    height: hero.src.trim() ? 34 : 72,
    baseFontSize: hero.src.trim() ? 15 : 19,
    minFontSize: 12,
    lineHeight: 1.46,
    maxLines: hero.src.trim() ? 2 : 5,
    allowExpansion: true,
    maxFontSize: hero.src.trim() ? 18 : 22,
  });
  const takeaways = fitListTextBox({
    items: componentListSlot(slotBindings, "takeaways", []),
    width: hero.src.trim() ? 268 : 286,
    height: hero.src.trim() ? 150 : 118,
    baseFontSize: hero.src.trim() ? 16 : 17,
    minFontSize: 12,
    lineHeight: 1.42,
    maxLines: hero.src.trim() ? 8 : 7,
    bulletPrefix: "• ",
    allowExpansion: true,
    maxFontSize: hero.src.trim() ? 19 : 20,
  });

  if (hero.src.trim()) {
    return [
      makeRect(frame, componentId, {
        suffix: "canvas-bg",
        x: 72,
        y: 56,
        width: 1136,
        height: 608,
        fill: "#ffffff",
        stroke: stylePreset.colors.secondary,
        strokeWidth: 2,
      }),
      makeRect(frame, componentId, {
        suffix: "eyebrow-bg",
        x: 96,
        y: 80,
        width: 188,
        height: 34,
        fill: stylePreset.colors.secondary,
        stroke: stylePreset.colors.primary,
        strokeWidth: 2,
      }),
      makeText(frame, componentId, {
        suffix: "eyebrow",
        x: 114,
        y: 88,
        width: 152,
        height: 18,
        text: componentTextSlot(slotBindings, "eyebrow", ""),
        color: stylePreset.colors.background,
        fontSize: 15,
        fontWeight: "700",
        textAlign: "center",
      }),
      makeRect(frame, componentId, {
        suffix: "hero-frame",
        x: 96,
        y: 132,
        width: 318,
        height: 224,
        fill: stylePreset.colors.backgroundAlt,
        stroke: stylePreset.colors.primary,
        strokeWidth: 2,
      }),
      makeImage(frame, componentId, {
        suffix: "hero-image",
        x: 108,
        y: 144,
        width: 294,
        height: 200,
        src: hero.src,
        alt: hero.alt,
        mediaShape: heroFrameStyle?.mediaShape,
        mediaCornerRadius: heroFrameStyle?.mediaCornerRadius,
      }),
      makeRect(frame, componentId, {
        suffix: "takeaways-card",
        x: 96,
        y: 380,
        width: 318,
        height: 228,
        fill: stylePreset.colors.backgroundAlt,
        stroke: stylePreset.colors.secondary,
        strokeWidth: 2,
      }),
      makeText(frame, componentId, {
        suffix: "takeaways-title",
        x: 120,
        y: 404,
        width: 182,
        height: 24,
        text: componentTextSlot(slotBindings, "takeaways-title", ""),
        color: stylePreset.colors.primary,
        fontSize: 20,
        fontWeight: "700",
      }),
      makeText(frame, componentId, {
        suffix: "takeaways",
        x: 120,
        y: 440,
        width: 270,
        height: 148,
        text: takeaways.text,
        color: stylePreset.colors.text,
        fontSize: takeaways.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "500",
        lineHeight: 1.42,
      }),
      makeText(frame, componentId, {
        suffix: "title",
        x: 454,
        y: 108,
        width: 610,
        height: 74,
        text: title.text,
        color: stylePreset.colors.text,
        fontSize: title.fontSize,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
        lineHeight: 1.12,
      }),
      makeText(frame, componentId, {
        suffix: "intro",
        x: 454,
        y: 192,
        width: 610,
        height: 108,
        text: intro.text,
        color: stylePreset.colors.textMuted,
        fontSize: intro.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "500",
        lineHeight: 1.5,
      }),
      ...[
        {
          suffix: "section-1",
          y: 322,
          heading: componentTextSlot(slotBindings, "section1-heading", ""),
          body: section1Body,
          accent: stylePreset.colors.primary,
        },
        {
          suffix: "section-2",
          y: 422,
          heading: componentTextSlot(slotBindings, "section2-heading", ""),
          body: section2Body,
          accent: stylePreset.colors.secondary,
        },
        {
          suffix: "section-3",
          y: 522,
          heading: componentTextSlot(slotBindings, "section3-heading", ""),
          body: section3Body,
          accent: stylePreset.colors.cardBg[2] ?? stylePreset.colors.primary,
        },
      ].flatMap((section) => [
        makeRect(frame, componentId, {
          suffix: `${section.suffix}-card`,
          x: 454,
          y: section.y,
          width: 628,
          height: 82,
          fill: "#ffffff",
          stroke: "#dbeafe",
          strokeWidth: 2,
        }),
        makeRect(frame, componentId, {
          suffix: `${section.suffix}-bar`,
          x: 454,
          y: section.y,
          width: 8,
          height: 82,
          fill: section.accent,
        }),
        makeText(frame, componentId, {
          suffix: `${section.suffix}-heading`,
          x: 484,
          y: section.y + 14,
          width: 560,
          height: 22,
          text: section.heading,
          color: stylePreset.colors.primary,
          fontSize: 20,
          fontWeight: "700",
        }),
        makeText(frame, componentId, {
          suffix: `${section.suffix}-body`,
          x: 484,
          y: section.y + 42,
          width: 560,
          height: 34,
          text: section.body.text,
          color: stylePreset.colors.text,
          fontSize: section.body.fontSize,
          fontFamily: stylePreset.typography.bodyFontFamily,
          fontWeight: "500",
          lineHeight: 1.44,
        }),
      ]),
    ];
  }

  return [
    makeRect(frame, componentId, {
      suffix: "canvas-bg",
      x: 72,
      y: 64,
      width: 1136,
      height: 592,
      fill: "rgba(248,250,252,0.98)",
      stroke: stylePreset.colors.secondary,
      strokeWidth: 2,
    }),
    makeRect(frame, componentId, {
      suffix: "eyebrow-bg",
      x: 96,
      y: 90,
      width: 200,
      height: 34,
      fill: stylePreset.colors.secondary,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "eyebrow",
      x: 116,
      y: 98,
      width: 160,
      height: 18,
      text: componentTextSlot(slotBindings, "eyebrow", ""),
      color: stylePreset.colors.background,
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, componentId, {
      suffix: "title",
      x: 96,
      y: 140,
      width: 1030,
      height: 58,
      text: title.text,
      color: stylePreset.colors.text,
      fontSize: title.fontSize,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: 1.1,
    }),
    makeRect(frame, componentId, {
      suffix: "intro-card",
      x: 96,
      y: 214,
      width: 330,
      height: 212,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "intro",
      x: 120,
      y: 236,
      width: 282,
      height: 168,
      text: intro.text,
      color: stylePreset.colors.text,
      fontSize: intro.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.5,
    }),
    makeRect(frame, componentId, {
      suffix: "takeaways-card",
      x: 96,
      y: 444,
      width: 330,
      height: 176,
      fill: "#ffffff",
      stroke: stylePreset.colors.secondary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "takeaways-title",
      x: 120,
      y: 464,
      width: 184,
      height: 24,
      text: componentTextSlot(slotBindings, "takeaways-title", ""),
      color: stylePreset.colors.primary,
      fontSize: 19,
      fontWeight: "700",
    }),
    makeText(frame, componentId, {
      suffix: "takeaways",
      x: 120,
      y: 498,
      width: 282,
      height: 108,
      text: takeaways.text,
      color: stylePreset.colors.text,
      fontSize: takeaways.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.42,
    }),
    makeRect(frame, componentId, {
      suffix: "sections-card",
      x: 458,
      y: 214,
      width: 654,
      height: 406,
      fill: "#ffffff",
      stroke: "#cbd5e1",
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "section-1-heading",
      x: 486,
      y: 240,
      width: 590,
      height: 24,
      text: componentTextSlot(slotBindings, "section1-heading", ""),
      color: stylePreset.colors.primary,
      fontSize: 24,
      fontWeight: "700",
    }),
    makeText(frame, componentId, {
      suffix: "section-1-body",
      x: 486,
      y: 272,
      width: 590,
      height: 94,
      text: section1Body.text,
      color: stylePreset.colors.text,
      fontSize: section1Body.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.46,
    }),
    makeRect(frame, componentId, {
      suffix: "section-1-divider",
      x: 486,
      y: 380,
      width: 590,
      height: 2,
      fill: "#e2e8f0",
    }),
    makeText(frame, componentId, {
      suffix: "section-2-heading",
      x: 486,
      y: 398,
      width: 590,
      height: 24,
      text: componentTextSlot(slotBindings, "section2-heading", ""),
      color: stylePreset.colors.primary,
      fontSize: 24,
      fontWeight: "700",
    }),
    makeText(frame, componentId, {
      suffix: "section-2-body",
      x: 486,
      y: 430,
      width: 590,
      height: 94,
      text: section2Body.text,
      color: stylePreset.colors.text,
      fontSize: section2Body.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.46,
    }),
    makeRect(frame, componentId, {
      suffix: "section-2-divider",
      x: 486,
      y: 538,
      width: 590,
      height: 2,
      fill: "#e2e8f0",
    }),
    makeText(frame, componentId, {
      suffix: "section-3-heading",
      x: 486,
      y: 556,
      width: 590,
      height: 24,
      text: componentTextSlot(slotBindings, "section3-heading", ""),
      color: stylePreset.colors.primary,
      fontSize: 24,
      fontWeight: "700",
    }),
    makeText(frame, componentId, {
      suffix: "section-3-body",
      x: 486,
      y: 588,
      width: 590,
      height: 72,
      text: section3Body.text,
      color: stylePreset.colors.text,
      fontSize: section3Body.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.44,
    }),
  ];
}

function buildArticleFocusFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  if (isPortraitContentArea(contentArea)) {
    const frame = getPortraitDocumentFrame(contentArea);
    const keyPoints = componentListSlot(slotBindings, "key-points", []);
    const hero = componentImageSlot(slotBindings, "hero", { src: "", alt: "Hero visual" });
    const heroFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["article-focus"]?.hero;
    const titleFit = fitTextBox({
      text: componentTextSlot(slotBindings, "title", ""),
      width: 586, height: 118, baseFontSize: 50, minFontSize: 30, lineHeight: 1.06, maxLines: 3,
    });
    const leadFit = fitTextBox({
      text: componentTextSlot(slotBindings, "lead", ""),
      width: 586, height: 128, baseFontSize: 24, minFontSize: 15, lineHeight: 1.34, maxLines: 5,
    });
    const keyPointsFit = fitListTextBox({
      items: keyPoints.slice(0, 6),
      width: 196, height: 240, baseFontSize: 18, minFontSize: 12, lineHeight: 1.42, maxLines: 12, bulletPrefix: "• ",
    });
    const bodyFit = fitTextBox({
      text: componentTextSlot(slotBindings, "body", ""),
      width: 888, height: 350, baseFontSize: 21, minFontSize: 13, lineHeight: 1.42, maxLines: 16,
    });
    const heroElements = hero.src.trim()
      ? [
        makeImage(frame, componentId, {
          suffix: "hero-image",
          x: 56,
          y: 54,
          width: 888,
          height: 470,
          src: hero.src,
          alt: hero.alt,
          mediaShape: heroFrameStyle?.mediaShape,
          mediaCornerRadius: heroFrameStyle?.mediaCornerRadius,
        }),
      ]
      : [
        makeRect(frame, componentId, {
          suffix: "hero-frame",
          x: 56,
          y: 54,
          width: 888,
          height: 470,
          fill: "#E2E8F0",
        }),
        makeText(frame, componentId, {
          suffix: "hero-placeholder",
          x: 204,
          y: 258,
          width: 592,
          height: 54,
          text: "Hero Image",
          color: "#475569",
          fontSize: 36,
          fontFamily: stylePreset.typography.titleFontFamily,
          fontWeight: "700",
          textAlign: "center",
        }),
      ];

    return [
      makeRect(frame, componentId, {
        suffix: "bg",
        x: 0,
        y: 0,
        width: PORTRAIT_LAYOUT_WIDTH,
        height: PORTRAIT_LAYOUT_HEIGHT,
        fill: "#FFFCF7",
      }),
      ...heroElements,
      makeRect(frame, componentId, {
        suffix: "eyebrow-bg",
        x: 56,
        y: 556,
        width: 196,
        height: 44,
        fill: "#D1FAE5",
      }),
      makeText(frame, componentId, {
        suffix: "eyebrow",
        x: 76,
        y: 568,
        width: 156,
        height: 18,
        text: componentTextSlot(slotBindings, "eyebrow", ""),
        fontSize: 18,
        fontWeight: "700",
        color: "#047857",
        textAlign: "center",
      }),
      makeText(frame, componentId, {
        suffix: "title",
        x: 56,
        y: 624,
        width: 586,
        height: 118,
        text: titleFit.text,
        fontSize: titleFit.fontSize,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
        color: "#0F172A",
        lineHeight: 1.06,
      }),
      makeText(frame, componentId, {
        suffix: "lead",
        x: 56,
        y: 758,
        width: 586,
        height: 128,
        text: leadFit.text,
        fontSize: leadFit.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "500",
        color: "#475569",
        lineHeight: 1.34,
      }),
      makeRect(frame, componentId, {
        suffix: "key-points-card",
        x: 676,
        y: 624,
        width: 268,
        height: 358,
        fill: "#F0FDF4",
      }),
      makeText(frame, componentId, {
        suffix: "key-points-title",
        x: 712,
        y: 658,
        width: 196,
        height: 28,
        text: componentTextSlot(slotBindings, "key-points-title", "Key Points"),
        fontSize: 22,
        fontWeight: "700",
        color: "#047857",
      }),
      makeText(frame, componentId, {
        suffix: "key-points",
        x: 712,
        y: 706,
        width: 196,
        height: 240,
        text: keyPointsFit.text,
        fontSize: keyPointsFit.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "500",
        color: "#334155",
        lineHeight: 1.42,
      }),
      makeText(frame, componentId, {
        suffix: "body",
        x: 56,
        y: 926,
        width: 888,
        height: 350,
        text: bodyFit.text,
        fontSize: bodyFit.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        color: "#334155",
        lineHeight: 1.42,
      }),
      makeText(frame, componentId, {
        suffix: "footnote",
        x: 56,
        y: 1324,
        width: 888,
        height: 24,
        text: componentTextSlot(slotBindings, "footnote", ""),
        fontSize: 14,
        fontFamily: stylePreset.typography.bodyFontFamily,
        color: "#94A3B8",
      }),
    ];
  }
  const frame = getLayoutFrame(contentArea);
  const hero = componentImageSlot(slotBindings, "hero", { src: "", alt: "Hero visual" });
  const heroFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["article-focus"]?.hero;
  const title = fitTextBox({
    text: componentTextSlot(slotBindings, "title", ""),
    width: hero.src.trim() ? 644 : 660,
    height: hero.src.trim() ? 74 : 52,
    baseFontSize: hero.src.trim() ? 34 : 28,
    minFontSize: 22,
    lineHeight: 1.18,
    maxLines: hero.src.trim() ? 2 : 2,
  });
  const lead = fitTextBox({
    text: componentTextSlot(slotBindings, "lead", ""),
    width: 644,
    height: hero.src.trim() ? 118 : 240,
    baseFontSize: hero.src.trim() ? 18 : 20,
    minFontSize: 13,
    lineHeight: 1.5,
    maxLines: hero.src.trim() ? 6 : 12,
  });
  const body = fitTextBox({
    text: componentTextSlot(slotBindings, "body", ""),
    width: 644,
    height: hero.src.trim() ? 286 : 280,
    baseFontSize: hero.src.trim() ? 17 : 18,
    minFontSize: 12,
    lineHeight: 1.52,
    maxLines: hero.src.trim() ? 14 : 16,
  });
  const keyPoints = fitListTextBox({
    items: componentListSlot(slotBindings, "key-points", []),
    width: hero.src.trim() ? 330 : 290,
    height: hero.src.trim() ? 152 : 240,
    baseFontSize: 16,
    minFontSize: 12,
    lineHeight: 1.42,
    maxLines: hero.src.trim() ? 8 : 10,
    bulletPrefix: "• ",
  });
  if (hero.src.trim()) {
    return [
      makeRect(frame, componentId, {
        suffix: "canvas-bg",
        x: 72, y: 64, width: 1136, height: 592,
        fill: "#ffffff",
        stroke: stylePreset.colors.secondary,
        strokeWidth: 2,
      }),
      makeRect(frame, componentId, {
        suffix: "eyebrow-bg",
        x: 96, y: 82, width: 136, height: 28,
        fill: stylePreset.colors.backgroundAlt,
      }),
      makeText(frame, componentId, {
        suffix: "eyebrow",
        x: 104, y: 85, width: 120, height: 22,
        text: componentTextSlot(slotBindings, "eyebrow", "Article"),
        color: stylePreset.colors.primary,
        fontSize: 14, fontWeight: "600",
      }),
      makeText(frame, componentId, {
        suffix: "title",
        x: 96, y: 122, width: 644, height: 74,
        text: title.text,
        color: stylePreset.colors.primary,
        fontSize: title.fontSize,
        fontWeight: "700",
        fontFamily: stylePreset.typography.titleFontFamily,
        lineHeight: 1.18,
      }),
      makeText(frame, componentId, {
        suffix: "lead",
        x: 96, y: 208, width: 644, height: 118,
        text: lead.text,
        color: stylePreset.colors.text,
        fontSize: lead.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        lineHeight: 1.5,
      }),
      makeText(frame, componentId, {
        suffix: "body",
        x: 96, y: 340, width: 644, height: 286,
        text: body.text,
        color: stylePreset.colors.text,
        fontSize: body.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        lineHeight: 1.52,
      }),
      makeRect(frame, componentId, {
        suffix: "hero-frame",
        x: 780, y: 118, width: 372, height: 246,
        fill: stylePreset.colors.backgroundAlt,
        stroke: stylePreset.colors.primary,
        strokeWidth: 2,
      }),
      makeImage(frame, componentId, {
        suffix: "hero-image",
        x: 792, y: 130, width: 348, height: 222,
        src: hero.src,
        alt: hero.alt,
        mediaShape: heroFrameStyle?.mediaShape,
        mediaCornerRadius: heroFrameStyle?.mediaCornerRadius,
      }),
      makeRect(frame, componentId, {
        suffix: "key-points-card",
        x: 780, y: 390, width: 372, height: 236,
        fill: stylePreset.colors.secondary,
      }),
      makeText(frame, componentId, {
        suffix: "key-points-title",
        x: 808, y: 416, width: 316, height: 24,
        text: componentTextSlot(slotBindings, "key-points-title", "Key Points"),
        color: stylePreset.colors.primary,
        fontSize: 20, fontWeight: "700",
      }),
      makeText(frame, componentId, {
        suffix: "key-points",
        x: 808, y: 454, width: 316, height: 150,
        text: keyPoints.text,
        color: stylePreset.colors.text,
        fontSize: keyPoints.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        lineHeight: 1.42,
      }),
      makeText(frame, componentId, {
        suffix: "footnote",
        x: 96, y: 636, width: 644, height: 20,
        text: componentTextSlot(slotBindings, "footnote", ""),
        color: "#94a3b8",
        fontSize: 13, fontFamily: stylePreset.typography.bodyFontFamily,
      }),
    ];
  }
  return [
    makeRect(frame, componentId, {
      suffix: "canvas-bg",
      x: 72, y: 64, width: 1136, height: 592,
      fill: "rgba(248,250,252,0.98)",
      stroke: stylePreset.colors.secondary,
      strokeWidth: 2,
    }),
    makeRect(frame, componentId, {
      suffix: "eyebrow-bg",
      x: 96, y: 82, width: 120, height: 28,
      fill: stylePreset.colors.secondary,
    }),
    makeText(frame, componentId, {
      suffix: "eyebrow",
      x: 102, y: 85, width: 108, height: 22,
      text: componentTextSlot(slotBindings, "eyebrow", "Article"),
      color: stylePreset.colors.primary,
      fontSize: 14, fontWeight: "600",
    }),
    makeText(frame, componentId, {
      suffix: "title",
      x: 96, y: 118, width: 660, height: 52,
      text: title.text,
      color: stylePreset.colors.primary,
      fontSize: title.fontSize, fontWeight: "700", lineHeight: 1.2,
    }),
    makeText(frame, componentId, {
      suffix: "lead",
      x: 96, y: 180, width: 660, height: 120,
      text: lead.text,
      color: stylePreset.colors.text,
      fontSize: lead.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      lineHeight: 1.5,
    }),
    makeText(frame, componentId, {
      suffix: "body",
      x: 96, y: 312, width: 660, height: 280,
      text: body.text,
      color: stylePreset.colors.text,
      fontSize: body.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      lineHeight: 1.52,
    }),
    makeRect(frame, componentId, {
      suffix: "key-points-card",
      x: 792, y: 118, width: 394, height: 520,
      fill: stylePreset.colors.secondary,
    }),
    makeText(frame, componentId, {
      suffix: "key-points-title",
      x: 816, y: 138, width: 346, height: 24,
      text: componentTextSlot(slotBindings, "key-points-title", "Key Points"),
      color: stylePreset.colors.primary,
      fontSize: 20, fontWeight: "700",
    }),
    makeText(frame, componentId, {
      suffix: "key-points",
      x: 816, y: 174, width: 346, height: 440,
      text: keyPoints.text,
      color: stylePreset.colors.text,
      fontSize: keyPoints.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      lineHeight: 1.42,
    }),
    makeText(frame, componentId, {
      suffix: "footnote",
      x: 96, y: 628, width: 660, height: 20,
      text: componentTextSlot(slotBindings, "footnote", ""),
      color: "#94a3b8",
      fontSize: 13, fontFamily: stylePreset.typography.bodyFontFamily,
    }),
  ];
}

function buildTwoColumnArticleFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  if (isPortraitContentArea(contentArea)) {
    const frame = getPortraitDocumentFrame(contentArea);
    const takeaways = componentListSlot(slotBindings, "takeaways", []);
    const hero = componentImageSlot(slotBindings, "hero", { src: "", alt: "Hero visual" });
    const heroFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["two-column-article"]?.hero;
    const titleFit = fitTextBox({
      text: componentTextSlot(slotBindings, "title", ""),
      width: 534, height: 152, baseFontSize: 50, minFontSize: 30, lineHeight: 1.04, maxLines: 3,
    });
    const introFit = fitTextBox({
      text: componentTextSlot(slotBindings, "intro", ""),
      width: 534, height: 98, baseFontSize: 22, minFontSize: 14, lineHeight: 1.34, maxLines: 4,
    });
    const leftBodyFit = fitTextBox({
      text: componentTextSlot(slotBindings, "left-body", ""),
      width: 348, height: 448, baseFontSize: 19, minFontSize: 12, lineHeight: 1.42, maxLines: 22,
    });
    const rightBodyFit = fitTextBox({
      text: componentTextSlot(slotBindings, "right-body", ""),
      width: 348, height: 448, baseFontSize: 19, minFontSize: 12, lineHeight: 1.42, maxLines: 22,
    });
    const takeawaysFit = fitListTextBox({
      items: takeaways.slice(0, 4),
      width: 560, height: 132, baseFontSize: 18, minFontSize: 12, lineHeight: 1.42, maxLines: 8, bulletPrefix: "• ",
    });
    const heroElements = hero.src.trim()
      ? [
        makeImage(frame, componentId, {
          suffix: "hero-image",
          x: 636,
          y: 58,
          width: 308,
          height: 312,
          src: hero.src,
          alt: hero.alt,
          mediaShape: heroFrameStyle?.mediaShape,
          mediaCornerRadius: heroFrameStyle?.mediaCornerRadius,
        }),
      ]
      : [
        makeRect(frame, componentId, {
          suffix: "hero-frame",
          x: 636,
          y: 58,
          width: 308,
          height: 312,
          fill: "#E0E7FF",
        }),
        makeText(frame, componentId, {
          suffix: "hero-placeholder",
          x: 686,
          y: 186,
          width: 208,
          height: 42,
          text: "Document Visual",
          color: "#4338CA",
          fontSize: 28,
          fontFamily: stylePreset.typography.titleFontFamily,
          fontWeight: "700",
          textAlign: "center",
        }),
      ];

    return [
      makeRect(frame, componentId, {
        suffix: "bg",
        x: 0,
        y: 0,
        width: PORTRAIT_LAYOUT_WIDTH,
        height: PORTRAIT_LAYOUT_HEIGHT,
        fill: "#FFFFFF",
      }),
      makeRect(frame, componentId, {
        suffix: "eyebrow-bg",
        x: 56,
        y: 58,
        width: 220,
        height: 44,
        fill: "#EEF2FF",
      }),
      makeText(frame, componentId, {
        suffix: "eyebrow",
        x: 82,
        y: 70,
        width: 168,
        height: 18,
        text: componentTextSlot(slotBindings, "eyebrow", ""),
        fontSize: 18,
        fontWeight: "700",
        color: "#4338CA",
        textAlign: "center",
      }),
      makeText(frame, componentId, {
        suffix: "title",
        x: 56,
        y: 130,
        width: 534,
        height: 152,
        text: titleFit.text,
        fontSize: titleFit.fontSize,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
        color: "#0F172A",
        lineHeight: 1.04,
      }),
      makeText(frame, componentId, {
        suffix: "intro",
        x: 56,
        y: 304,
        width: 534,
        height: 98,
        text: introFit.text,
        fontSize: introFit.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "500",
        color: "#475569",
        lineHeight: 1.34,
      }),
      ...heroElements,
      makeRect(frame, componentId, {
        suffix: "left-card",
        x: 56,
        y: 446,
        width: 420,
        height: 600,
        fill: "#F8FAFC",
      }),
      makeText(frame, componentId, {
        suffix: "left-title",
        x: 92,
        y: 486,
        width: 348,
        height: 52,
        text: componentTextSlot(slotBindings, "left-title", ""),
        fontSize: 28,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
        color: "#0F172A",
        lineHeight: 1.14,
      }),
      makeText(frame, componentId, {
        suffix: "left-body",
        x: 92,
        y: 554,
        width: 348,
        height: 448,
        text: leftBodyFit.text,
        fontSize: leftBodyFit.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        color: "#334155",
        lineHeight: 1.42,
      }),
      makeRect(frame, componentId, {
        suffix: "right-card",
        x: 524,
        y: 446,
        width: 420,
        height: 600,
        fill: "#F8FAFC",
      }),
      makeText(frame, componentId, {
        suffix: "right-title",
        x: 560,
        y: 486,
        width: 348,
        height: 52,
        text: componentTextSlot(slotBindings, "right-title", ""),
        fontSize: 28,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
        color: "#0F172A",
        lineHeight: 1.14,
      }),
      makeText(frame, componentId, {
        suffix: "right-body",
        x: 560,
        y: 554,
        width: 348,
        height: 448,
        text: rightBodyFit.text,
        fontSize: rightBodyFit.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        color: "#334155",
        lineHeight: 1.42,
      }),
      makeRect(frame, componentId, {
        suffix: "takeaways-card",
        x: 56,
        y: 1092,
        width: 888,
        height: 220,
        fill: "#EEF2FF",
      }),
      makeText(frame, componentId, {
        suffix: "takeaways-title",
        x: 92,
        y: 1130,
        width: 220,
        height: 28,
        text: componentTextSlot(slotBindings, "takeaways-title", "Key Takeaways"),
        fontSize: 22,
        fontWeight: "700",
        color: "#4338CA",
      }),
      makeText(frame, componentId, {
        suffix: "takeaways",
        x: 332,
        y: 1128,
        width: 560,
        height: 132,
        text: takeawaysFit.text,
        fontSize: takeawaysFit.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        color: "#334155",
        lineHeight: 1.42,
      }),
    ];
  }
  const frame = getLayoutFrame(contentArea);
  const hero = componentImageSlot(slotBindings, "hero", { src: "", alt: "Hero visual" });
  const heroFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["two-column-article"]?.hero;
  const takeaways = componentListSlot(slotBindings, "takeaways", []);
  const title = fitTextBox({
    text: componentTextSlot(slotBindings, "title", ""),
    width: hero.src.trim() ? 592 : 924,
    height: hero.src.trim() ? 76 : 58,
    baseFontSize: hero.src.trim() ? 34 : 36,
    minFontSize: 22,
    lineHeight: 1.12,
    maxLines: 2,
  });
  const intro = fitTextBox({
    text: componentTextSlot(slotBindings, "intro", ""),
    width: hero.src.trim() ? 592 : 964,
    height: hero.src.trim() ? 80 : 52,
    baseFontSize: 18,
    minFontSize: 13,
    lineHeight: 1.4,
    maxLines: hero.src.trim() ? 4 : 3,
    allowExpansion: true,
    maxFontSize: hero.src.trim() ? 21 : 19,
  });
  const leftBody = fitTextBox({
    text: componentTextSlot(slotBindings, "left-body", ""),
    width: hero.src.trim() ? 236 : 392,
    height: hero.src.trim() ? 108 : 150,
    baseFontSize: hero.src.trim() ? 15 : 17,
    minFontSize: 11,
    lineHeight: 1.42,
    maxLines: hero.src.trim() ? 6 : 8,
    allowExpansion: true,
    maxFontSize: hero.src.trim() ? 18 : 20,
  });
  const rightBody = fitTextBox({
    text: componentTextSlot(slotBindings, "right-body", ""),
    width: hero.src.trim() ? 236 : 392,
    height: hero.src.trim() ? 108 : 150,
    baseFontSize: hero.src.trim() ? 15 : 17,
    minFontSize: 11,
    lineHeight: 1.42,
    maxLines: hero.src.trim() ? 6 : 8,
    allowExpansion: true,
    maxFontSize: hero.src.trim() ? 18 : 20,
  });
  const takeawaysText = fitListTextBox({
    items: takeaways,
    width: hero.src.trim() ? 554 : 700,
    height: 54,
    baseFontSize: 14,
    minFontSize: 11,
    lineHeight: 1.3,
    maxLines: 4,
    bulletPrefix: "• ",
    allowExpansion: true,
    maxFontSize: 16,
  });

  if (hero.src.trim()) {
    return [
      makeRect(frame, componentId, {
        suffix: "bg",
        x: 92,
        y: 64,
        width: 1096,
        height: 596,
        fill: "#FFFFFF",
        stroke: stylePreset.colors.primary,
        strokeWidth: 2,
      }),
      makeRect(frame, componentId, {
        suffix: "hero-frame",
        x: 132,
        y: 124,
        width: 280,
        height: 360,
        fill: stylePreset.colors.backgroundAlt,
        stroke: stylePreset.colors.secondary,
        strokeWidth: 2,
      }),
      makeImage(frame, componentId, {
        suffix: "hero-image",
        x: 144,
        y: 136,
        width: 256,
        height: 336,
        src: hero.src,
        alt: hero.alt,
        mediaShape: heroFrameStyle?.mediaShape,
        mediaCornerRadius: heroFrameStyle?.mediaCornerRadius,
      }),
      makeRect(frame, componentId, {
        suffix: "eyebrow-bg",
        x: 454,
        y: 102,
        width: 176,
        height: 36,
        fill: stylePreset.colors.backgroundAlt,
        stroke: stylePreset.colors.secondary,
        strokeWidth: 2,
      }),
      makeText(frame, componentId, {
        suffix: "eyebrow",
        x: 476,
        y: 110,
        width: 132,
        height: 20,
        text: componentTextSlot(slotBindings, "eyebrow", ""),
        color: stylePreset.colors.secondary,
        fontSize: 17,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "700",
        textAlign: "center",
      }),
      makeText(frame, componentId, {
        suffix: "title",
        x: 454,
        y: 150,
        width: 592,
        height: 76,
        text: title.text,
        color: stylePreset.colors.text,
        fontSize: title.fontSize,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
        lineHeight: 1.12,
      }),
      makeText(frame, componentId, {
        suffix: "intro",
        x: 454,
        y: 236,
        width: 592,
        height: 80,
        text: intro.text,
        color: stylePreset.colors.textMuted,
        fontSize: intro.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "500",
        lineHeight: 1.4,
      }),
      ...[
        {
          suffix: "left",
          x: 454,
          title: componentTextSlot(slotBindings, "left-title", ""),
          body: leftBody,
          accent: stylePreset.colors.primary,
        },
        {
          suffix: "right",
          x: 752,
          title: componentTextSlot(slotBindings, "right-title", ""),
          body: rightBody,
          accent: stylePreset.colors.secondary,
        },
      ].flatMap((column) => [
        makeRect(frame, componentId, {
          suffix: `${column.suffix}-card`,
          x: column.x,
          y: 336,
          width: 266,
          height: 188,
          fill: stylePreset.colors.backgroundAlt,
          stroke: column.accent,
          strokeWidth: 2,
        }),
        makeText(frame, componentId, {
          suffix: `${column.suffix}-title`,
          x: column.x + 24,
          y: 360,
          width: 218,
          height: 48,
          text: column.title,
          color: stylePreset.colors.text,
          fontSize: 22,
          fontFamily: stylePreset.typography.titleFontFamily,
          fontWeight: "700",
          lineHeight: 1.16,
        }),
        makeText(frame, componentId, {
          suffix: `${column.suffix}-body`,
          x: column.x + 24,
          y: 412,
          width: 218,
          height: 96,
          text: column.body.text,
          color: stylePreset.colors.textMuted,
          fontSize: column.body.fontSize,
          fontFamily: stylePreset.typography.bodyFontFamily,
          fontWeight: "500",
          lineHeight: 1.42,
        }),
      ]),
      makeRect(frame, componentId, {
        suffix: "takeaways-card",
        x: 454,
        y: 544,
        width: 592,
        height: 82,
        fill: stylePreset.colors.backgroundAlt,
        stroke: stylePreset.colors.secondary,
        strokeWidth: 2,
      }),
      makeText(frame, componentId, {
        suffix: "takeaways-title",
        x: 480,
        y: 564,
        width: 160,
        height: 18,
        text: componentTextSlot(slotBindings, "takeaways-title", "Key Takeaways"),
        color: stylePreset.colors.secondary,
        fontSize: 15,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "700",
      }),
      makeText(frame, componentId, {
        suffix: "takeaways",
        x: 650,
        y: 560,
        width: 366,
        height: 44,
        text: takeawaysText.text,
        color: stylePreset.colors.textMuted,
        fontSize: takeawaysText.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "500",
        lineHeight: 1.3,
      }),
    ];
  }

  return [
    makeRect(frame, componentId, {
      suffix: "bg",
      x: 92,
      y: 72,
      width: 1096,
      height: 586,
      fill: "#FFFFFF",
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeRect(frame, componentId, {
      suffix: "eyebrow-bg",
      x: 132,
      y: 104,
      width: 196,
      height: 38,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.secondary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "eyebrow",
      x: 156,
      y: 112,
      width: 148,
      height: 22,
      text: componentTextSlot(slotBindings, "eyebrow", ""),
      color: stylePreset.colors.secondary,
      fontSize: 18,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, componentId, {
      suffix: "title",
      x: 132,
      y: 162,
      width: 924,
      height: 58,
      text: title.text,
      color: stylePreset.colors.text,
      fontSize: title.fontSize,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: 1.12,
    }),
    makeText(frame, componentId, {
      suffix: "intro",
      x: 132,
      y: 232,
      width: 964,
      height: 52,
      text: intro.text,
      color: stylePreset.colors.textMuted,
      fontSize: intro.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.4,
    }),
    makeRect(frame, componentId, {
      suffix: "left-card",
      x: 132,
      y: 312,
      width: 448,
      height: 232,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "left-title",
      x: 160,
      y: 334,
      width: 392,
      height: 28,
      text: componentTextSlot(slotBindings, "left-title", ""),
      color: stylePreset.colors.text,
      fontSize: 24,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
    }),
    makeText(frame, componentId, {
      suffix: "left-body",
      x: 160,
      y: 378,
      width: 392,
      height: 150,
      text: leftBody.text,
      color: stylePreset.colors.textMuted,
      fontSize: leftBody.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.45,
    }),
    makeRect(frame, componentId, {
      suffix: "right-card",
      x: 608,
      y: 312,
      width: 448,
      height: 232,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.secondary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "right-title",
      x: 636,
      y: 334,
      width: 392,
      height: 28,
      text: componentTextSlot(slotBindings, "right-title", ""),
      color: stylePreset.colors.text,
      fontSize: 24,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
    }),
    makeText(frame, componentId, {
      suffix: "right-body",
      x: 636,
      y: 378,
      width: 392,
      height: 150,
      text: rightBody.text,
      color: stylePreset.colors.textMuted,
      fontSize: rightBody.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.45,
    }),
    makeRect(frame, componentId, {
      suffix: "takeaways-card",
      x: 132,
      y: 566,
      width: 924,
      height: 60,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.secondary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "takeaways-title",
      x: 158,
      y: 584,
      width: 168,
      height: 22,
      text: componentTextSlot(slotBindings, "takeaways-title", "Key Takeaways"),
      color: stylePreset.colors.secondary,
      fontSize: 16,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "700",
    }),
    makeText(frame, componentId, {
      suffix: "takeaways",
      x: 344,
      y: 580,
      width: 680,
      height: 32,
      text: takeawaysText.text,
      color: stylePreset.colors.textMuted,
      fontSize: takeawaysText.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.3,
    }),
  ];
}

function buildProfileBoardFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  if (isPortraitContentArea(contentArea)) {
    const frame = getPortraitDocumentFrame(contentArea);
    const portrait = componentImageSlot(slotBindings, "portrait", { src: "", alt: "Portrait" });
    const experienceItems = componentListSlot(slotBindings, "experience-items", []);
    const skillItems = componentListSlot(slotBindings, "skills-items", []);
    const contactItems = componentListSlot(slotBindings, "contact-items", []);
    const nameFit = fitTextBox({
      text: componentTextSlot(slotBindings, "name", ""),
      width: 620, height: 70, baseFontSize: 54, minFontSize: 32, lineHeight: 1.1, maxLines: 2,
    });
    const bioBodyFit = fitTextBox({
      text: componentTextSlot(slotBindings, "bio-body", ""),
      width: 300, height: 262, baseFontSize: 18, minFontSize: 12, lineHeight: 1.38, maxLines: 14,
    });
    const experienceFit = fitListTextBox({
      items: experienceItems.slice(0, 6),
      width: 528, height: 372, baseFontSize: 18, minFontSize: 12, lineHeight: 1.42, maxLines: 18, bulletPrefix: "• ",
    });
    const skillsFit = fitListTextBox({
      items: skillItems.slice(0, 8),
      width: 528, height: 182, baseFontSize: 18, minFontSize: 12, lineHeight: 1.42, maxLines: 10, bulletPrefix: "• ",
    });
    const contactFit = fitListTextBox({
      items: contactItems.slice(0, 4),
      width: 636, height: 96, baseFontSize: 18, minFontSize: 12, lineHeight: 1.42, maxLines: 6, bulletPrefix: "• ",
    });
    const portraitElements = portrait.src.trim()
      ? [
        makeImage(frame, componentId, {
          suffix: "portrait-image",
          x: 60,
          y: 108,
          width: 300,
          height: 360,
          src: portrait.src,
          alt: portrait.alt,
          mediaShape: "rounded",
          mediaCornerRadius: 28,
        }),
      ]
      : [
        makeRect(frame, componentId, {
          suffix: "portrait-frame",
          x: 60,
          y: 108,
          width: 300,
          height: 360,
          fill: "#E2E8F0",
        }),
        makeText(frame, componentId, {
          suffix: "portrait-placeholder",
          x: 94,
          y: 262,
          width: 232,
          height: 52,
          text: "Portrait",
          color: "#475569",
          fontSize: 30,
          fontFamily: stylePreset.typography.titleFontFamily,
          fontWeight: "700",
          textAlign: "center",
        }),
      ];

    return [
      makeRect(frame, componentId, {
        suffix: "bg",
        x: 0,
        y: 0,
        width: PORTRAIT_LAYOUT_WIDTH,
        height: PORTRAIT_LAYOUT_HEIGHT,
        fill: "#FFFFFF",
      }),
      makeText(frame, componentId, {
        suffix: "name",
        x: 60,
        y: 48,
        width: 620,
        height: 70,
        text: nameFit.text,
        fontSize: nameFit.fontSize,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
        color: "#4B3F39",
      }),
      makeRect(frame, componentId, {
        suffix: "role-bg",
        x: 384,
        y: 126,
        width: 250,
        height: 44,
        fill: "#F1F5F9",
      }),
      makeText(frame, componentId, {
        suffix: "role",
        x: 410,
        y: 138,
        width: 198,
        height: 18,
        text: componentTextSlot(slotBindings, "role", ""),
        fontSize: 20,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "700",
        color: "#475569",
        textAlign: "center",
      }),
      ...portraitElements,
      makeText(frame, componentId, {
        suffix: "bio-title",
        x: 60,
        y: 514,
        width: 200,
        height: 28,
        text: componentTextSlot(slotBindings, "bio-title", "About"),
        fontSize: 20,
        fontWeight: "700",
        color: "#4B3F39",
      }),
      makeText(frame, componentId, {
        suffix: "bio-body",
        x: 60,
        y: 556,
        width: 300,
        height: 262,
        text: bioBodyFit.text,
        fontSize: bioBodyFit.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        color: "#475569",
        lineHeight: 1.38,
      }),
      makeText(frame, componentId, {
        suffix: "experience-title",
        x: 412,
        y: 212,
        width: 220,
        height: 28,
        text: componentTextSlot(slotBindings, "experience-title", "Experience"),
        fontSize: 24,
        fontWeight: "700",
        color: "#4B3F39",
      }),
      makeText(frame, componentId, {
        suffix: "experience-items",
        x: 412,
        y: 252,
        width: 528,
        height: 372,
        text: experienceFit.text,
        fontSize: experienceFit.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        color: "#475569",
        lineHeight: 1.42,
      }),
      makeText(frame, componentId, {
        suffix: "skills-title",
        x: 412,
        y: 668,
        width: 180,
        height: 28,
        text: componentTextSlot(slotBindings, "skills-title", "Skills"),
        fontSize: 24,
        fontWeight: "700",
        color: "#4B3F39",
      }),
      makeText(frame, componentId, {
        suffix: "skills-items",
        x: 412,
        y: 708,
        width: 528,
        height: 182,
        text: skillsFit.text,
        fontSize: skillsFit.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        color: "#475569",
        lineHeight: 1.42,
      }),
      makeRect(frame, componentId, {
        suffix: "contact-title-bg",
        x: 60,
        y: 1172,
        width: 220,
        height: 42,
        fill: "#F1F5F9",
      }),
      makeText(frame, componentId, {
        suffix: "contact-title",
        x: 88,
        y: 1184,
        width: 164,
        height: 18,
        text: componentTextSlot(slotBindings, "contact-title", "Contact"),
        fontSize: 18,
        fontWeight: "700",
        color: "#4B3F39",
        textAlign: "center",
      }),
      makeText(frame, componentId, {
        suffix: "contact-items",
        x: 304,
        y: 1178,
        width: 636,
        height: 96,
        text: contactFit.text,
        fontSize: contactFit.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        color: "#475569",
        lineHeight: 1.42,
      }),
    ];
  }
  const frame = getLayoutFrame(contentArea);
  const bioBody = fitTextBox({
    text: componentTextSlot(slotBindings, "bio-body", ""),
    width: 540,
    height: 160,
    baseFontSize: 18,
    minFontSize: 13,
    lineHeight: 1.5,
    maxLines: 9,
  });
  const experienceItems = fitListTextBox({
    items: componentListSlot(slotBindings, "experience-items", []),
    width: 340,
    height: 130,
    baseFontSize: 16,
    minFontSize: 12,
    lineHeight: 1.42,
    maxLines: 8,
    bulletPrefix: "• ",
  });
  const skillItems = fitListTextBox({
    items: componentListSlot(slotBindings, "skills-items", []),
    width: 340,
    height: 100,
    baseFontSize: 15,
    minFontSize: 12,
    lineHeight: 1.38,
    maxLines: 6,
    bulletPrefix: "• ",
  });
  const contactItems = fitListTextBox({
    items: componentListSlot(slotBindings, "contact-items", []),
    width: 340,
    height: 80,
    baseFontSize: 15,
    minFontSize: 12,
    lineHeight: 1.38,
    maxLines: 5,
    bulletPrefix: "• ",
  });
  return [
    makeRect(frame, componentId, {
      suffix: "canvas-bg",
      x: 72, y: 64, width: 1136, height: 592,
      fill: "rgba(248,250,252,0.98)",
      stroke: stylePreset.colors.secondary,
      strokeWidth: 2,
    }),
    makeRect(frame, componentId, {
      suffix: "portrait-placeholder",
      x: 96, y: 86, width: 160, height: 180,
      fill: stylePreset.colors.secondary,
    }),
    makeText(frame, componentId, {
      suffix: "name",
      x: 280, y: 86, width: 400, height: 38,
      text: componentTextSlot(slotBindings, "name", ""),
      color: stylePreset.colors.primary,
      fontSize: 30, fontWeight: "700", lineHeight: 1.2,
    }),
    makeRect(frame, componentId, {
      suffix: "role-bg",
      x: 280, y: 130, width: 200, height: 28,
      fill: stylePreset.colors.secondary,
    }),
    makeText(frame, componentId, {
      suffix: "role",
      x: 286, y: 133, width: 188, height: 22,
      text: componentTextSlot(slotBindings, "role", ""),
      color: stylePreset.colors.primary,
      fontSize: 15, fontWeight: "600",
    }),
    makeText(frame, componentId, {
      suffix: "bio-title",
      x: 280, y: 174, width: 400, height: 24,
      text: componentTextSlot(slotBindings, "bio-title", "About"),
      color: stylePreset.colors.primary,
      fontSize: 20, fontWeight: "700",
    }),
    makeText(frame, componentId, {
      suffix: "bio-body",
      x: 280, y: 204, width: 540, height: 160,
      text: bioBody.text,
      color: stylePreset.colors.text,
      fontSize: bioBody.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      lineHeight: 1.5,
    }),
    makeRect(frame, componentId, {
      suffix: "divider",
      x: 96, y: 382, width: 1090, height: 2,
      fill: "#e2e8f0",
    }),
    makeText(frame, componentId, {
      suffix: "experience-title",
      x: 96, y: 400, width: 340, height: 22,
      text: componentTextSlot(slotBindings, "experience-title", "Experience"),
      color: stylePreset.colors.primary,
      fontSize: 18, fontWeight: "700",
    }),
    makeText(frame, componentId, {
      suffix: "experience-items",
      x: 96, y: 428, width: 340, height: 200,
      text: experienceItems.text,
      color: stylePreset.colors.text,
      fontSize: experienceItems.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      lineHeight: 1.42,
    }),
    makeText(frame, componentId, {
      suffix: "skills-title",
      x: 470, y: 400, width: 340, height: 22,
      text: componentTextSlot(slotBindings, "skills-title", "Skills"),
      color: stylePreset.colors.primary,
      fontSize: 18, fontWeight: "700",
    }),
    makeText(frame, componentId, {
      suffix: "skills-items",
      x: 470, y: 428, width: 340, height: 200,
      text: skillItems.text,
      color: stylePreset.colors.text,
      fontSize: skillItems.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      lineHeight: 1.38,
    }),
    makeText(frame, componentId, {
      suffix: "contact-title",
      x: 844, y: 400, width: 340, height: 22,
      text: componentTextSlot(slotBindings, "contact-title", "Contact"),
      color: stylePreset.colors.primary,
      fontSize: 18, fontWeight: "700",
    }),
    makeText(frame, componentId, {
      suffix: "contact-items",
      x: 844, y: 428, width: 340, height: 200,
      text: contactItems.text,
      color: stylePreset.colors.text,
      fontSize: contactItems.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      lineHeight: 1.38,
    }),
  ];
}

function buildFaqStackFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  if (isPortraitContentArea(contentArea)) {
    const frame = getPortraitDocumentFrame(contentArea);
    const titleFit = fitTextBox({
      text: componentTextSlot(slotBindings, "title", ""),
      width: 888, height: 116, baseFontSize: 48, minFontSize: 29, lineHeight: 1.08, maxLines: 3,
    });
    const introFit = fitTextBox({
      text: componentTextSlot(slotBindings, "intro", ""),
      width: 888, height: 90, baseFontSize: 22, minFontSize: 14, lineHeight: 1.38, maxLines: 4,
    });
    const cards = [
      { y: 386, accent: "#2563EB", questionSlot: "faq1-question", answerSlot: "faq1-answer" },
      { y: 662, accent: "#0F766E", questionSlot: "faq2-question", answerSlot: "faq2-answer" },
      { y: 938, accent: "#7C3AED", questionSlot: "faq3-question", answerSlot: "faq3-answer" },
    ] as const;

    return [
      makeRect(frame, componentId, {
        suffix: "bg",
        x: 0,
        y: 0,
        width: PORTRAIT_LAYOUT_WIDTH,
        height: PORTRAIT_LAYOUT_HEIGHT,
        fill: "#FFFFFF",
      }),
      makeRect(frame, componentId, {
        suffix: "eyebrow-bg",
        x: 56,
        y: 52,
        width: 188,
        height: 42,
        fill: "#EFF6FF",
      }),
      makeText(frame, componentId, {
        suffix: "eyebrow",
        x: 82,
        y: 64,
        width: 136,
        height: 18,
        text: componentTextSlot(slotBindings, "eyebrow", "FAQ"),
        color: "#2563EB",
        fontSize: 18,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "700",
        textAlign: "center",
      }),
      makeText(frame, componentId, {
        suffix: "title",
        x: 56,
        y: 118,
        width: 888,
        height: 116,
        text: titleFit.text,
        color: "#0F172A",
        fontSize: titleFit.fontSize,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
        lineHeight: 1.08,
      }),
      makeText(frame, componentId, {
        suffix: "intro",
        x: 56,
        y: 258,
        width: 888,
        height: 90,
        text: introFit.text,
        color: "#475569",
        fontSize: introFit.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "500",
        lineHeight: 1.38,
      }),
      ...cards.flatMap((card, index) => {
        const qFit = fitTextBox({
          text: componentTextSlot(slotBindings, card.questionSlot, ""),
          width: 776, height: 50, baseFontSize: 26, minFontSize: 16, lineHeight: 1.16, maxLines: 2,
        });
        const aFit = fitTextBox({
          text: componentTextSlot(slotBindings, card.answerSlot, ""),
          width: 776, height: 58, baseFontSize: 18, minFontSize: 12, lineHeight: 1.42, maxLines: 3,
        });
        return [
          makeRect(frame, componentId, {
            suffix: `faq-${index + 1}-card`,
            x: 56,
            y: card.y,
            width: 888,
            height: 220,
            fill: "#F8FAFC",
            stroke: "#E2E8F0",
            strokeWidth: 2,
          }),
          makeRect(frame, componentId, {
            suffix: `faq-${index + 1}-q-bg`,
            x: 88,
            y: card.y + 28,
            width: 152,
            height: 40,
            fill: card.accent,
          }),
          makeText(frame, componentId, {
            suffix: `faq-${index + 1}-q`,
            x: 112,
            y: card.y + 80,
            width: 776,
            height: 50,
            text: qFit.text,
            color: "#0F172A",
            fontSize: qFit.fontSize,
            fontFamily: stylePreset.typography.titleFontFamily,
            fontWeight: "700",
            lineHeight: 1.16,
          }),
          makeText(frame, componentId, {
            suffix: `faq-${index + 1}-a`,
            x: 112,
            y: card.y + 142,
            width: 776,
            height: 58,
            text: aFit.text,
            color: "#475569",
            fontSize: aFit.fontSize,
            fontFamily: stylePreset.typography.bodyFontFamily,
            fontWeight: "500",
            lineHeight: 1.42,
          }),
        ];
      }),
    ];
  }
  const frame = getLayoutFrame(contentArea);
  const intro = fitTextBox({
    text: componentTextSlot(slotBindings, "intro", ""),
    width: 1112,
    height: 74,
    baseFontSize: 19,
    minFontSize: 14,
    lineHeight: 1.45,
    maxLines: 4,
  });
  const answers = [1, 2, 3].map((index) => fitTextBox({
    text: componentTextSlot(slotBindings, `faq${index}-answer`, ""),
    width: 1030,
    height: 82,
    baseFontSize: 17,
    minFontSize: 13,
    lineHeight: 1.42,
    maxLines: 4,
  }));
  const cards = [
    { y: 254, accent: stylePreset.colors.primary, questionSlot: "faq1-question", answer: answers[0]! },
    { y: 396, accent: stylePreset.colors.secondary, questionSlot: "faq2-question", answer: answers[1]! },
    { y: 538, accent: stylePreset.colors.cardBg[2] ?? stylePreset.colors.primary, questionSlot: "faq3-question", answer: answers[2]! },
  ] as const;

  return [
    makeRect(frame, componentId, {
      suffix: "bg",
      x: 20,
      y: 20,
      width: 1240,
      height: 680,
      fill: "#FFFFFF",
      stroke: "#CBD5E1",
    }),
    makeRect(frame, componentId, {
      suffix: "eyebrow-bg",
      x: 44,
      y: 36,
      width: 158,
      height: 36,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "eyebrow",
      x: 60,
      y: 44,
      width: 126,
      height: 20,
      text: componentTextSlot(slotBindings, "eyebrow", "FAQ"),
      color: stylePreset.colors.primary,
      fontSize: 18,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, componentId, {
      suffix: "title",
      x: 44,
      y: 92,
      width: 1116,
      height: 58,
      text: componentTextSlot(slotBindings, "title", ""),
      color: stylePreset.colors.text,
      fontSize: 34,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: 1.14,
    }),
    makeText(frame, componentId, {
      suffix: "intro",
      x: 44,
      y: 162,
      width: 1112,
      height: 74,
      text: intro.text,
      color: stylePreset.colors.textMuted,
      fontSize: intro.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.45,
    }),
    ...cards.flatMap((card, index) => [
      makeRect(frame, componentId, {
        suffix: `faq-${index + 1}-card`,
        x: 44,
        y: card.y,
        width: 1112,
        height: 118,
        fill: "#F8FAFC",
        stroke: "#E2E8F0",
        strokeWidth: 2,
      }),
      makeRect(frame, componentId, {
        suffix: `faq-${index + 1}-q-bg`,
        x: 70,
        y: card.y + 20,
        width: 118,
        height: 34,
        fill: card.accent,
      }),
      makeText(frame, componentId, {
        suffix: `faq-${index + 1}-q`,
        x: 90,
        y: card.y + 28,
        width: 1040,
        height: 24,
        text: componentTextSlot(slotBindings, card.questionSlot, ""),
        color: stylePreset.colors.text,
        fontSize: 20,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
      }),
      makeText(frame, componentId, {
        suffix: `faq-${index + 1}-a`,
        x: 90,
        y: card.y + 62,
        width: 1030,
        height: 82,
        text: card.answer.text,
        color: stylePreset.colors.textMuted,
        fontSize: card.answer.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "500",
        lineHeight: 1.42,
      }),
    ]),
  ];
}

function buildProfileSummaryFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  const frame = getLayoutFrame(contentArea);
  const portrait = componentImageSlot(slotBindings, "portrait", { src: "", alt: "Portrait" });
  const contactItems = componentListSlot(slotBindings, "contact-items", []);
  const highlightItems = componentListSlot(slotBindings, "highlights-items", []);
  const portraitFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["profile-summary"]?.portrait;

  const portraitElements = portrait.src.trim()
    ? [
      makeImage(frame, componentId, {
        suffix: "portrait-image",
        x: 180,
        y: 140,
        width: 200,
        height: 180,
        src: portrait.src,
        alt: portrait.alt,
        mediaShape: portraitFrameStyle?.mediaShape,
        mediaCornerRadius: portraitFrameStyle?.mediaCornerRadius,
      }),
    ]
    : [
      makeRect(frame, componentId, {
        suffix: "portrait-frame",
        x: 180,
        y: 140,
        width: 200,
        height: 180,
        fill: stylePreset.colors.secondary,
        stroke: stylePreset.colors.primary,
        strokeWidth: 2,
      }),
      makeText(frame, componentId, {
        suffix: "portrait-placeholder",
        x: 208,
        y: 212,
        width: 144,
        height: 40,
        text: "Photo",
        color: stylePreset.colors.text,
        fontSize: 28,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
        textAlign: "center",
      }),
    ];

  return [
    makeRect(frame, componentId, {
      suffix: "sidebar-bg",
      x: 126,
      y: 104,
      width: 304,
      height: 500,
      fill: stylePreset.colors.secondary,
      stroke: stylePreset.colors.primary,
      strokeWidth: 3,
    }),
    ...portraitElements,
    makeText(frame, componentId, {
      suffix: "name",
      x: 158,
      y: 332,
      width: 240,
      height: 42,
      text: componentTextSlot(slotBindings, "name", ""),
      color: stylePreset.colors.text,
      fontSize: 32,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeRect(frame, componentId, {
      suffix: "role-bg",
      x: 168,
      y: 388,
      width: 220,
      height: 40,
      fill: stylePreset.colors.primary,
    }),
    makeText(frame, componentId, {
      suffix: "role",
      x: 180,
      y: 396,
      width: 196,
      height: 24,
      text: componentTextSlot(slotBindings, "role", ""),
      color: stylePreset.colors.background,
      fontSize: 20,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, componentId, {
      suffix: "contact-title",
      x: 168,
      y: 454,
      width: 220,
      height: 24,
      text: componentTextSlot(slotBindings, "contact-title", ""),
      color: stylePreset.colors.textMuted,
      fontSize: 18,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, componentId, {
      suffix: "contact-items",
      x: 166,
      y: 486,
      width: 224,
      height: 88,
      text: contactItems.join("\n"),
      color: stylePreset.colors.text,
      fontSize: 18,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      textAlign: "center",
      lineHeight: 1.45,
    }),
    makeRect(frame, componentId, {
      suffix: "about-bg",
      x: 478,
      y: 104,
      width: 676,
      height: 180,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "about-title",
      x: 522,
      y: 138,
      width: 580,
      height: 48,
      text: componentTextSlot(slotBindings, "about-title", ""),
      color: stylePreset.colors.text,
      fontSize: 36,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
    }),
    makeText(frame, componentId, {
      suffix: "about-body",
      x: 522,
      y: 190,
      width: 574,
      height: 62,
      text: componentTextSlot(slotBindings, "about-body", ""),
      color: stylePreset.colors.textMuted,
      fontSize: 22,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.32,
    }),
    makeRect(frame, componentId, {
      suffix: "highlights-bg",
      x: 478,
      y: 314,
      width: 676,
      height: 290,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "highlights-title",
      x: 522,
      y: 346,
      width: 260,
      height: 34,
      text: componentTextSlot(slotBindings, "highlights-title", ""),
      color: stylePreset.colors.primary,
      fontSize: 28,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
    }),
    makeText(frame, componentId, {
      suffix: "highlights-items",
      x: 522,
      y: 398,
      width: 560,
      height: 120,
      text: highlightItems.map((item) => `• ${item}`).join("\n"),
      color: stylePreset.colors.text,
      fontSize: 21,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.42,
    }),
  ];
}

function buildProcessStepsFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  const frame = getLayoutFrame(contentArea);
  const titleLineHeight = 1.08;
  const subtitleLineHeight = 1.26;
  const cardTitleLineHeight = 1.16;
  const cardBodyLineHeight = 1.32;
  const fittedTitle = fitTextBox({
    text: componentTextSlot(slotBindings, "title", ""),
    width: 760,
    height: 76,
    baseFontSize: 50,
    minFontSize: 34,
    lineHeight: titleLineHeight,
    maxLines: 2,
  });
  const fittedSubtitle = fitTextBox({
    text: componentTextSlot(slotBindings, "subtitle", ""),
    width: 780,
    height: 40,
    baseFontSize: 22,
    minFontSize: 16,
    lineHeight: subtitleLineHeight,
    maxLines: 2,
  });
  const cards = [
    { y: 188, labelSlot: "step1-label", titleSlot: "step1-title", bodySlot: "step1-body", color: stylePreset.colors.primary },
    { y: 314, labelSlot: "step2-label", titleSlot: "step2-title", bodySlot: "step2-body", color: stylePreset.colors.secondary },
    { y: 440, labelSlot: "step3-label", titleSlot: "step3-title", bodySlot: "step3-body", color: stylePreset.colors.cardBg[2] },
  ] as const;

  return [
    makeText(frame, componentId, {
      suffix: "title",
      x: 168,
      y: 72,
      width: 760,
      height: 76,
      text: fittedTitle.text,
      color: stylePreset.colors.text,
      fontSize: fittedTitle.fontSize,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: titleLineHeight,
    }),
    makeText(frame, componentId, {
      suffix: "subtitle",
      x: 168,
      y: 132,
      width: 780,
      height: 40,
      text: fittedSubtitle.text,
      color: stylePreset.colors.textMuted,
      fontSize: fittedSubtitle.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: subtitleLineHeight,
    }),
    ...cards.flatMap((card, index) => [
      makeRect(frame, componentId, {
        suffix: `card-${index + 1}-bg`,
        x: 168,
        y: card.y,
        width: 944,
        height: 96,
        fill: stylePreset.colors.backgroundAlt,
        stroke: card.color,
        strokeWidth: 3,
      }),
      makeText(frame, componentId, {
        suffix: `card-${index + 1}-label`,
        x: 278,
        y: card.y + 18,
        width: 180,
        height: 30,
        text: componentTextSlot(slotBindings, card.labelSlot, ""),
        color: card.color,
        fontSize: 24,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "700",
      }),
      (() => {
        const fittedCardTitle = fitTextBox({
          text: componentTextSlot(slotBindings, card.titleSlot, ""),
          width: 320,
          height: 40,
          baseFontSize: 28,
          minFontSize: 18,
          lineHeight: cardTitleLineHeight,
          maxLines: 2,
        });
        return makeText(frame, componentId, {
          suffix: `card-${index + 1}-title`,
          x: 278,
          y: card.y + 40,
          width: 320,
          height: 40,
          text: fittedCardTitle.text,
          color: stylePreset.colors.text,
          fontSize: fittedCardTitle.fontSize,
          fontFamily: stylePreset.typography.titleFontFamily,
          fontWeight: "700",
          lineHeight: cardTitleLineHeight,
        });
      })(),
      (() => {
        const fittedCardBody = fitTextBox({
          text: componentTextSlot(slotBindings, card.bodySlot, ""),
          width: 460,
          height: 48,
          baseFontSize: 18,
          minFontSize: 12,
          lineHeight: cardBodyLineHeight,
          maxLines: 2,
        });
        return makeText(frame, componentId, {
          suffix: `card-${index + 1}-body`,
          x: 612,
          y: card.y + 24,
          width: 460,
          height: 48,
          text: fittedCardBody.text,
          color: stylePreset.colors.textMuted,
          fontSize: fittedCardBody.fontSize,
          fontFamily: stylePreset.typography.bodyFontFamily,
          fontWeight: "500",
          lineHeight: cardBodyLineHeight,
        });
      })(),
    ]),
  ];
}

function buildTimelineFlowFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  const frame = getLayoutFrame(contentArea);
  const milestones = [
    { x: 140, color: stylePreset.colors.primary, dateSlot: "milestone1-date", titleSlot: "milestone1-title", bodySlot: "milestone1-body" },
    { x: 470, color: stylePreset.colors.secondary, dateSlot: "milestone2-date", titleSlot: "milestone2-title", bodySlot: "milestone2-body" },
    { x: 800, color: stylePreset.colors.cardBg[2], dateSlot: "milestone3-date", titleSlot: "milestone3-title", bodySlot: "milestone3-body" },
  ] as const;

  return [
    makeRect(frame, componentId, {
      suffix: "eyebrow-bg",
      x: 140,
      y: 88,
      width: 180,
      height: 40,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "eyebrow",
      x: 160,
      y: 96,
      width: 140,
      height: 24,
      text: componentTextSlot(slotBindings, "eyebrow", ""),
      color: stylePreset.colors.primary,
      fontSize: 20,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, componentId, {
      suffix: "title",
      x: 140,
      y: 150,
      width: 760,
      height: 70,
      text: componentTextSlot(slotBindings, "title", ""),
      color: stylePreset.colors.text,
      fontSize: 44,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: 1.12,
    }),
    makeText(frame, componentId, {
      suffix: "subtitle",
      x: 140,
      y: 224,
      width: 760,
      height: 46,
      text: componentTextSlot(slotBindings, "subtitle", ""),
      color: stylePreset.colors.textMuted,
      fontSize: 20,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.35,
    }),
    makeRect(frame, componentId, {
      suffix: "timeline-line",
      x: 210,
      y: 356,
      width: 700,
      height: 6,
      fill: stylePreset.colors.backgroundAlt,
    }),
    ...milestones.flatMap((milestone, index) => [
      makeRect(frame, componentId, {
        suffix: `milestone-${index + 1}-marker`,
        x: milestone.x + 44,
        y: 338,
        width: 20,
        height: 20,
        fill: milestone.color,
      }),
      makeRect(frame, componentId, {
        suffix: `milestone-${index + 1}-date-pill`,
        x: milestone.x,
        y: 386,
        width: 108,
        height: 34,
        fill: stylePreset.colors.background,
        stroke: milestone.color,
        strokeWidth: 2,
      }),
      makeText(frame, componentId, {
        suffix: `milestone-${index + 1}-date`,
        x: milestone.x + 12,
        y: 394,
        width: 84,
        height: 18,
        text: componentTextSlot(slotBindings, milestone.dateSlot, ""),
        color: milestone.color,
        fontSize: 18,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "700",
        textAlign: "center",
      }),
      makeText(frame, componentId, {
        suffix: `milestone-${index + 1}-title`,
        x: milestone.x,
        y: 434,
        width: 230,
        height: 40,
        text: componentTextSlot(slotBindings, milestone.titleSlot, ""),
        color: stylePreset.colors.text,
        fontSize: 28,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
      }),
      makeText(frame, componentId, {
        suffix: `milestone-${index + 1}-body`,
        x: milestone.x,
        y: 480,
        width: 240,
        height: 58,
        text: componentTextSlot(slotBindings, milestone.bodySlot, ""),
        color: stylePreset.colors.textMuted,
        fontSize: 18,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "500",
        lineHeight: 1.35,
      }),
    ]),
  ];
}

function buildTimelineReportFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  if (isPortraitContentArea(contentArea)) {
    const frame = getPortraitDocumentFrame(contentArea);
    const titleFit = fitTextBox({
      text: componentTextSlot(slotBindings, "title", ""),
      width: 884, height: 108, baseFontSize: 48, minFontSize: 29, lineHeight: 1.06, maxLines: 3,
    });
    const summaryFit = fitTextBox({
      text: componentTextSlot(slotBindings, "summary", ""),
      width: 884, height: 112, baseFontSize: 22, minFontSize: 14, lineHeight: 1.36, maxLines: 5,
    });
    const nextStepsFit = fitListTextBox({
      items: componentListSlot(slotBindings, "next-steps", []),
      width: 812, height: 108, baseFontSize: 18, minFontSize: 12, lineHeight: 1.42, maxLines: 6, bulletPrefix: "• ",
    });
    const phases = [
      { y: 430, accent: "#2563eb", dateSlot: "phase1-date", titleSlot: "phase1-title", bodySlot: "phase1-body" },
      { y: 632, accent: "#0f766e", dateSlot: "phase2-date", titleSlot: "phase2-title", bodySlot: "phase2-body" },
      { y: 834, accent: "#7c3aed", dateSlot: "phase3-date", titleSlot: "phase3-title", bodySlot: "phase3-body" },
    ] as const;

    return [
      makeRect(frame, componentId, {
        suffix: "canvas-bg",
        x: 0,
        y: 0,
        width: PORTRAIT_LAYOUT_WIDTH,
        height: PORTRAIT_LAYOUT_HEIGHT,
        fill: "#FFFFFF",
      }),
      makeRect(frame, componentId, {
        suffix: "eyebrow-bg",
        x: 58,
        y: 54,
        width: 218,
        height: 44,
        fill: "#DBEAFE",
      }),
      makeText(frame, componentId, {
        suffix: "eyebrow",
        x: 86,
        y: 66,
        width: 162,
        height: 18,
        text: componentTextSlot(slotBindings, "eyebrow", ""),
        color: "#2563EB",
        fontSize: 18,
        fontWeight: "700",
        textAlign: "center",
      }),
      makeText(frame, componentId, {
        suffix: "title",
        x: 58,
        y: 126,
        width: 884,
        height: 108,
        text: titleFit.text,
        color: "#0F172A",
        fontSize: titleFit.fontSize,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
        lineHeight: 1.06,
      }),
      makeText(frame, componentId, {
        suffix: "summary",
        x: 58,
        y: 258,
        width: 884,
        height: 112,
        text: summaryFit.text,
        color: "#475569",
        fontSize: summaryFit.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "500",
        lineHeight: 1.36,
      }),
      makeRect(frame, componentId, {
        suffix: "timeline-line",
        x: 128,
        y: 436,
        width: 6,
        height: 618,
        fill: "#CBD5E1",
      }),
      ...phases.flatMap((phase, index) => {
        const phaseTitleFit = fitTextBox({
          text: componentTextSlot(slotBindings, phase.titleSlot, ""),
          width: 678, height: 48, baseFontSize: 28, minFontSize: 17, lineHeight: 1.14, maxLines: 2,
        });
        const phaseBodyFit = fitTextBox({
          text: componentTextSlot(slotBindings, phase.bodySlot, ""),
          width: 678, height: 116, baseFontSize: 19, minFontSize: 12, lineHeight: 1.4, maxLines: 6,
        });
        return [
          makeRect(frame, componentId, {
            suffix: `phase-${index + 1}-date-bg`,
            x: 96,
            y: phase.y,
            width: 70,
            height: 70,
            fill: phase.accent,
          }),
          makeText(frame, componentId, {
            suffix: `phase-${index + 1}-date`,
            x: 78,
            y: phase.y + 84,
            width: 108,
            height: 34,
            text: componentTextSlot(slotBindings, phase.dateSlot, ""),
            color: phase.accent,
            fontSize: 16,
            fontFamily: stylePreset.typography.bodyFontFamily,
            fontWeight: "700",
            textAlign: "center",
          }),
          makeText(frame, componentId, {
            suffix: `phase-${index + 1}-title`,
            x: 216,
            y: phase.y + 4,
            width: 678,
            height: 48,
            text: phaseTitleFit.text,
            color: "#0F172A",
            fontSize: phaseTitleFit.fontSize,
            fontFamily: stylePreset.typography.titleFontFamily,
            fontWeight: "700",
            lineHeight: 1.14,
          }),
          makeText(frame, componentId, {
            suffix: `phase-${index + 1}-body`,
            x: 216,
            y: phase.y + 62,
            width: 678,
            height: 116,
            text: phaseBodyFit.text,
            color: "#334155",
            fontSize: phaseBodyFit.fontSize,
            fontFamily: stylePreset.typography.bodyFontFamily,
            fontWeight: "500",
            lineHeight: 1.4,
          }),
        ];
      }),
      makeRect(frame, componentId, {
        suffix: "next-steps-card",
        x: 58,
        y: 1128,
        width: 884,
        height: 216,
        fill: "#EFF6FF",
      }),
      makeText(frame, componentId, {
        suffix: "next-steps-title",
        x: 94,
        y: 1164,
        width: 220,
        height: 28,
        text: componentTextSlot(slotBindings, "next-steps-title", ""),
        color: "#1D4ED8",
        fontSize: 22,
        fontWeight: "700",
      }),
      makeText(frame, componentId, {
        suffix: "next-steps",
        x: 94,
        y: 1212,
        width: 812,
        height: 108,
        text: nextStepsFit.text,
        color: "#334155",
        fontSize: nextStepsFit.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "500",
        lineHeight: 1.42,
      }),
    ];
  }
  const frame = getLayoutFrame(contentArea);
  const summary = fitTextBox({
    text: componentTextSlot(slotBindings, "summary", ""),
    width: 726,
    height: 74,
    baseFontSize: 20,
    minFontSize: 16,
    lineHeight: 1.4,
    maxLines: 4,
  });
  const nextSteps = fitListTextBox({
    items: componentListSlot(slotBindings, "next-steps", []),
    width: 220,
    height: 380,
    baseFontSize: 17,
    minFontSize: 13,
    lineHeight: 1.42,
    maxLines: 10,
    bulletPrefix: "• ",
  });
  const phases = [
    { y: 266, color: stylePreset.colors.primary, dateSlot: "phase1-date", titleSlot: "phase1-title", bodySlot: "phase1-body" },
    { y: 404, color: stylePreset.colors.secondary, dateSlot: "phase2-date", titleSlot: "phase2-title", bodySlot: "phase2-body" },
    { y: 542, color: stylePreset.colors.cardBg[2], dateSlot: "phase3-date", titleSlot: "phase3-title", bodySlot: "phase3-body" },
  ] as const;

  return [
    makeRect(frame, componentId, {
      suffix: "canvas-bg",
      x: 52,
      y: 28,
      width: 1176,
      height: 664,
      fill: stylePreset.colors.background,
      stroke: stylePreset.colors.secondary,
      strokeWidth: 2,
    }),
    makeRect(frame, componentId, {
      suffix: "eyebrow-bg",
      x: 84,
      y: 54,
      width: 168,
      height: 34,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "eyebrow",
      x: 102,
      y: 62,
      width: 132,
      height: 18,
      text: componentTextSlot(slotBindings, "eyebrow", ""),
      color: stylePreset.colors.primary,
      fontSize: 16,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, componentId, {
      suffix: "title",
      x: 84,
      y: 104,
      width: 760,
      height: 72,
      text: componentTextSlot(slotBindings, "title", ""),
      color: stylePreset.colors.text,
      fontSize: 38,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: 1.14,
    }),
    makeText(frame, componentId, {
      suffix: "summary",
      x: 84,
      y: 188,
      width: 726,
      height: 74,
      text: summary.text,
      color: stylePreset.colors.textMuted,
      fontSize: summary.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.4,
    }),
    makeRect(frame, componentId, {
      suffix: "next-steps-card",
      x: 904,
      y: 104,
      width: 276,
      height: 522,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "next-steps-title",
      x: 930,
      y: 128,
      width: 224,
      height: 22,
      text: componentTextSlot(slotBindings, "next-steps-title", ""),
      color: stylePreset.colors.primary,
      fontSize: 20,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
    }),
    makeText(frame, componentId, {
      suffix: "next-steps",
      x: 930,
      y: 166,
      width: 216,
      height: 394,
      text: nextSteps.text,
      color: stylePreset.colors.text,
      fontSize: nextSteps.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.42,
    }),
    makeRect(frame, componentId, {
      suffix: "timeline-line",
      x: 138,
      y: 292,
      width: 4,
      height: 350,
      fill: stylePreset.colors.backgroundAlt,
    }),
    ...phases.flatMap((phase, index) => ([
      makeRect(frame, componentId, {
        suffix: `phase-${index + 1}-marker`,
        x: 128,
        y: phase.y + 18,
        width: 24,
        height: 24,
        fill: phase.color,
      }),
      makeRect(frame, componentId, {
        suffix: `phase-${index + 1}-date-bg`,
        x: 176,
        y: phase.y,
        width: 118,
        height: 32,
        fill: stylePreset.colors.background,
        stroke: phase.color,
        strokeWidth: 2,
      }),
      makeText(frame, componentId, {
        suffix: `phase-${index + 1}-date`,
        x: 188,
        y: phase.y + 8,
        width: 94,
        height: 16,
        text: componentTextSlot(slotBindings, phase.dateSlot, ""),
        color: phase.color,
        fontSize: 16,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "700",
        textAlign: "center",
      }),
      makeText(frame, componentId, {
        suffix: `phase-${index + 1}-title`,
        x: 314,
        y: phase.y - 2,
        width: 520,
        height: 28,
        text: componentTextSlot(slotBindings, phase.titleSlot, ""),
        color: stylePreset.colors.text,
        fontSize: 24,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
        lineHeight: 1.2,
      }),
      makeText(frame, componentId, {
        suffix: `phase-${index + 1}-body`,
        x: 314,
        y: phase.y + 38,
        width: 520,
        height: 76,
        text: componentTextSlot(slotBindings, phase.bodySlot, ""),
        color: stylePreset.colors.textMuted,
        fontSize: 18,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "500",
        lineHeight: 1.4,
      }),
    ])),
  ];
}

function buildFeatureHighlightsFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  const frame = getLayoutFrame(contentArea);
  const features = [
    { x: 140, titleSlot: "feature1-title", bodySlot: "feature1-body", color: stylePreset.colors.primary },
    { x: 455, titleSlot: "feature2-title", bodySlot: "feature2-body", color: stylePreset.colors.secondary },
    { x: 770, titleSlot: "feature3-title", bodySlot: "feature3-body", color: stylePreset.colors.cardBg[2] },
  ] as const;

  return [
    makeRect(frame, componentId, {
      suffix: "badge-bg",
      x: 140,
      y: 92,
      width: 208,
      height: 40,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "badge-text",
      x: 160,
      y: 100,
      width: 180,
      height: 24,
      text: componentTextSlot(slotBindings, "badge", ""),
      color: stylePreset.colors.primary,
      fontSize: 20,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, componentId, {
      suffix: "title",
      x: 140,
      y: 158,
      width: 820,
      height: 76,
      text: componentTextSlot(slotBindings, "title", ""),
      color: stylePreset.colors.text,
      fontSize: 44,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: 1.12,
    }),
    ...features.flatMap((feature, index) => [
      makeRect(frame, componentId, {
        suffix: `feature-${index + 1}-bg`,
        x: feature.x,
        y: 292,
        width: 260,
        height: 238,
        fill: stylePreset.colors.backgroundAlt,
        stroke: feature.color,
        strokeWidth: 3,
      }),
      makeText(frame, componentId, {
        suffix: `feature-${index + 1}-title`,
        x: feature.x + 28,
        y: 396,
        width: 200,
        height: 34,
        text: componentTextSlot(slotBindings, feature.titleSlot, ""),
        color: stylePreset.colors.text,
        fontSize: 28,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
      }),
      makeText(frame, componentId, {
        suffix: `feature-${index + 1}-body`,
        x: feature.x + 28,
        y: 440,
        width: 204,
        height: 56,
        text: componentTextSlot(slotBindings, feature.bodySlot, ""),
        color: stylePreset.colors.textMuted,
        fontSize: 19,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "500",
        lineHeight: 1.35,
      }),
    ]),
  ];
}

function buildInfographicGridFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  const frame = getLayoutFrame(contentArea);
  const items = [
    { x: 140, y: 306, color: stylePreset.colors.primary, titleSlot: "item1-title", bodySlot: "item1-body" },
    { x: 498, y: 306, color: stylePreset.colors.secondary, titleSlot: "item2-title", bodySlot: "item2-body" },
    { x: 140, y: 474, color: stylePreset.colors.cardBg[2], titleSlot: "item3-title", bodySlot: "item3-body" },
    { x: 498, y: 474, color: stylePreset.colors.cardBg[2] ?? stylePreset.colors.cardBg[0] ?? stylePreset.colors.primary, titleSlot: "item4-title", bodySlot: "item4-body" },
  ] as const;

  return [
    makeRect(frame, componentId, {
      suffix: "eyebrow-bg",
      x: 140,
      y: 88,
      width: 168,
      height: 40,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "eyebrow",
      x: 158,
      y: 96,
      width: 132,
      height: 24,
      text: componentTextSlot(slotBindings, "eyebrow", ""),
      color: stylePreset.colors.primary,
      fontSize: 20,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, componentId, {
      suffix: "title",
      x: 140,
      y: 150,
      width: 760,
      height: 72,
      text: componentTextSlot(slotBindings, "title", ""),
      color: stylePreset.colors.text,
      fontSize: 44,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: 1.12,
    }),
    makeText(frame, componentId, {
      suffix: "summary",
      x: 140,
      y: 226,
      width: 780,
      height: 44,
      text: componentTextSlot(slotBindings, "summary", ""),
      color: stylePreset.colors.textMuted,
      fontSize: 20,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.35,
    }),
    ...items.flatMap((item, index) => [
      makeRect(frame, componentId, {
        suffix: `item-${index + 1}-card`,
        x: item.x,
        y: item.y,
        width: 302,
        height: 132,
        fill: stylePreset.colors.backgroundAlt,
        stroke: item.color,
        strokeWidth: 3,
      }),
      makeRect(frame, componentId, {
        suffix: `item-${index + 1}-accent`,
        x: item.x,
        y: item.y,
        width: 302,
        height: 12,
        fill: item.color,
      }),
      makeText(frame, componentId, {
        suffix: `item-${index + 1}-title`,
        x: item.x + 26,
        y: item.y + 30,
        width: 220,
        height: 34,
        text: componentTextSlot(slotBindings, item.titleSlot, ""),
        color: stylePreset.colors.text,
        fontSize: 26,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
      }),
      makeText(frame, componentId, {
        suffix: `item-${index + 1}-body`,
        x: item.x + 26,
        y: item.y + 72,
        width: 236,
        height: 42,
        text: componentTextSlot(slotBindings, item.bodySlot, ""),
        color: stylePreset.colors.textMuted,
        fontSize: 18,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "500",
        lineHeight: 1.35,
      }),
    ]),
  ];
}

function buildStatCardsFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  const frame = getLayoutFrame(contentArea);
  const cards = [
    { x: 132, valueSlot: "stat1-value", labelSlot: "stat1-label", color: stylePreset.colors.primary },
    { x: 435, valueSlot: "stat2-value", labelSlot: "stat2-label", color: stylePreset.colors.secondary },
    { x: 738, valueSlot: "stat3-value", labelSlot: "stat3-label", color: stylePreset.colors.cardBg[2] },
  ] as const;

  return [
    makeRect(frame, componentId, {
      suffix: "eyebrow-bg",
      x: 132,
      y: 92,
      width: 216,
      height: 40,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "eyebrow",
      x: 152,
      y: 100,
      width: 176,
      height: 24,
      text: componentTextSlot(slotBindings, "eyebrow", ""),
      color: stylePreset.colors.primary,
      fontSize: 20,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, componentId, {
      suffix: "title",
      x: 132,
      y: 156,
      width: 820,
      height: 88,
      text: componentTextSlot(slotBindings, "title", ""),
      color: stylePreset.colors.text,
      fontSize: 44,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: 1.1,
    }),
    ...cards.flatMap((card, index) => [
      makeRect(frame, componentId, {
        suffix: `stat-${index + 1}-card`,
        x: card.x,
        y: 306,
        width: 248,
        height: 224,
        fill: stylePreset.colors.backgroundAlt,
        stroke: card.color,
        strokeWidth: 3,
      }),
      makeText(frame, componentId, {
        suffix: `stat-${index + 1}-value`,
        x: card.x + 28,
        y: 382,
        width: 192,
        height: 54,
        text: componentTextSlot(slotBindings, card.valueSlot, ""),
        color: card.color,
        fontSize: 46,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
      }),
      makeText(frame, componentId, {
        suffix: `stat-${index + 1}-label`,
        x: card.x + 28,
        y: 452,
        width: 192,
        height: 48,
        text: componentTextSlot(slotBindings, card.labelSlot, ""),
        color: stylePreset.colors.textMuted,
        fontSize: 20,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "500",
        lineHeight: 1.35,
      }),
    ]),
  ];
}

function buildQuoteCalloutFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  const frame = getLayoutFrame(contentArea);
  return [
    makeRect(frame, componentId, {
      suffix: "quote-bg",
      x: 150,
      y: 176,
      width: 980,
      height: 312,
      fill: stylePreset.colors.secondary,
      stroke: stylePreset.colors.primary,
      strokeWidth: 3,
    }),
    makeText(frame, componentId, {
      suffix: "quote",
      x: 300,
      y: 224,
      width: 740,
      height: 128,
      text: componentTextSlot(slotBindings, "quote", ""),
      color: stylePreset.colors.text,
      fontSize: 42,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: 1.14,
    }),
    makeRect(frame, componentId, {
      suffix: "eyebrow-bg",
      x: 300,
      y: 382,
      width: 228,
      height: 42,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "eyebrow",
      x: 320,
      y: 390,
      width: 188,
      height: 24,
      text: componentTextSlot(slotBindings, "eyebrow", ""),
      color: stylePreset.colors.primary,
      fontSize: 20,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, componentId, {
      suffix: "attribution",
      x: 300,
      y: 442,
      width: 520,
      height: 28,
      text: componentTextSlot(slotBindings, "attribution", ""),
      color: stylePreset.colors.textMuted,
      fontSize: 20,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
    }),
    makeRect(frame, componentId, {
      suffix: "accent-line",
      x: 840,
      y: 438,
      width: 184,
      height: 8,
      fill: stylePreset.colors.primary,
    }),
  ];
}

function buildVideoSpotlightFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  const frame = getLayoutFrame(contentArea);
  const clip = componentVideoSlot(slotBindings, "clip", { src: "", poster: "", title: "Promo clip" });
  const benefits = componentListSlot(slotBindings, "benefits", []);
  const clipFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["video-spotlight"]?.clip;

  const mediaElements = clip.src.trim()
    ? [
      makeVideo(frame, componentId, {
        suffix: "clip-video",
        x: 676,
        y: 118,
        width: 438,
        height: 484,
        src: clip.src,
        poster: clip.poster,
        title: clip.title,
        mediaShape: clipFrameStyle?.mediaShape,
        mediaCornerRadius: clipFrameStyle?.mediaCornerRadius,
      }),
    ]
    : [
      makeRect(frame, componentId, {
        suffix: "clip-frame",
        x: 676,
        y: 118,
        width: 438,
        height: 484,
        fill: stylePreset.colors.secondary,
        stroke: stylePreset.colors.primary,
        strokeWidth: 3,
      }),
      makeText(frame, componentId, {
        suffix: "clip-icon",
        x: 832,
        y: 280,
        width: 110,
        height: 48,
        text: "VIDEO",
        color: stylePreset.colors.primary,
        fontSize: 26,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
        textAlign: "center",
      }),
      makeText(frame, componentId, {
        suffix: "clip-placeholder",
        x: 750,
        y: 404,
        width: 286,
        height: 32,
        text: "Drop or pick a video clip",
        color: stylePreset.colors.text,
        fontSize: 22,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "700",
        textAlign: "center",
      }),
    ];

  return [
    makeRect(frame, componentId, {
      suffix: "canvas-bg",
      x: 124,
      y: 102,
      width: 1032,
      height: 516,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeRect(frame, componentId, {
      suffix: "tag-bg",
      x: 174,
      y: 146,
      width: 180,
      height: 40,
      fill: stylePreset.colors.secondary,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "tag",
      x: 192,
      y: 154,
      width: 144,
      height: 24,
      text: componentTextSlot(slotBindings, "tag", ""),
      color: stylePreset.colors.text,
      fontSize: 20,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, componentId, {
      suffix: "headline",
      x: 174,
      y: 218,
      width: 432,
      height: 96,
      text: componentTextSlot(slotBindings, "headline", ""),
      color: stylePreset.colors.text,
      fontSize: 44,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: 1.12,
    }),
    makeText(frame, componentId, {
      suffix: "body",
      x: 174,
      y: 330,
      width: 414,
      height: 84,
      text: componentTextSlot(slotBindings, "body", ""),
      color: stylePreset.colors.textMuted,
      fontSize: 22,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.35,
    }),
    makeRect(frame, componentId, {
      suffix: "benefits-bg",
      x: 174,
      y: 448,
      width: 418,
      height: 126,
      fill: stylePreset.colors.background,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "benefits",
      x: 198,
      y: 472,
      width: 360,
      height: 78,
      text: benefits.map((item) => `• ${item}`).join("\n"),
      color: stylePreset.colors.text,
      fontSize: 20,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.38,
    }),
    ...mediaElements,
  ];
}

function buildPosterSpotlightFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  const frame = getLayoutFrame(contentArea);
  const hero = componentImageSlot(slotBindings, "hero", { src: "", alt: "Hero visual" });
  const benefits = componentListSlot(slotBindings, "benefits", []);
  const heroFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["poster-spotlight"]?.hero;
  const headlineText = componentTextSlot(slotBindings, "headline", "");
  const subheadText = componentTextSlot(slotBindings, "subhead", "");
  const ctaText = componentTextSlot(slotBindings, "cta", "");
  const denseLayout = countTextCharacters([
    headlineText,
    subheadText,
    ctaText,
    ...benefits,
  ]) >= 150 || benefits.length >= 4;
  const layout = denseLayout
    ? {
        canvas: { x: 48, y: 46, width: 1184, height: 628 },
        eyebrow: { x: 96, y: 86, width: 220, height: 40 },
        headline: { x: 96, y: 154, width: 620, height: 168 },
        subhead: { x: 96, y: 336, width: 604, height: 120 },
        benefits: { x: 96, y: 476, width: 604, height: 132 },
        cta: { x: 96, y: 622, width: 320, height: 40 },
        hero: { x: 766, y: 86, width: 360, height: 540 },
      }
    : {
        canvas: { x: 96, y: 64, width: 1088, height: 592 },
        eyebrow: { x: 140, y: 108, width: 208, height: 38 },
        headline: { x: 140, y: 180, width: 506, height: 140 },
        subhead: { x: 140, y: 336, width: 492, height: 82 },
        benefits: { x: 140, y: 452, width: 456, height: 126 },
        cta: { x: 140, y: 596, width: 286, height: 40 },
        hero: { x: 728, y: 84, width: 384, height: 552 },
      };
  const fittedHeadline = fitTextBox({
    text: headlineText,
    width: layout.headline.width,
    height: layout.headline.height,
    baseFontSize: denseLayout ? 48 : 50,
    minFontSize: denseLayout ? 28 : 30,
    lineHeight: 1.06,
    maxLines: denseLayout ? 4 : 3,
  });
  const fittedSubhead = fitTextBox({
    text: subheadText,
    width: layout.subhead.width,
    height: layout.subhead.height,
    baseFontSize: 22,
    minFontSize: 16,
    lineHeight: 1.34,
    maxLines: denseLayout ? 5 : 3,
  });
  const fittedBenefits = fitListTextBox({
    items: benefits,
    width: layout.benefits.width - 52,
    height: layout.benefits.height - 36,
    baseFontSize: 20,
    minFontSize: 15,
    lineHeight: 1.34,
    maxLines: denseLayout ? 7 : 5,
  });
  const fittedCta = fitTextBox({
    text: ctaText,
    width: layout.cta.width - 48,
    height: layout.cta.height - 12,
    baseFontSize: 18,
    minFontSize: 14,
    lineHeight: 1.16,
    maxLines: 2,
  });

  const mediaElements = hero.src.trim()
    ? [
      makeImage(frame, componentId, {
        suffix: "hero-image",
        x: layout.hero.x,
        y: layout.hero.y,
        width: layout.hero.width,
        height: layout.hero.height,
        src: hero.src,
        alt: hero.alt,
        mediaShape: heroFrameStyle?.mediaShape,
        mediaCornerRadius: heroFrameStyle?.mediaCornerRadius,
      }),
    ]
    : [
      makeRect(frame, componentId, {
        suffix: "hero-frame",
        x: layout.hero.x,
        y: layout.hero.y,
        width: layout.hero.width,
        height: layout.hero.height,
        fill: stylePreset.colors.secondary,
        stroke: stylePreset.colors.primary,
        strokeWidth: 3,
      }),
      makeText(frame, componentId, {
        suffix: "hero-placeholder",
        x: layout.hero.x + 60,
        y: layout.hero.y + Math.round((layout.hero.height / 2) - 26),
        width: layout.hero.width - 120,
        height: 42,
        text: "Drop or pick a hero image",
        color: stylePreset.colors.text,
        fontSize: 24,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "700",
        textAlign: "center",
      }),
    ];

  return [
    makeRect(frame, componentId, {
      suffix: "canvas-bg",
      x: layout.canvas.x,
      y: layout.canvas.y,
      width: layout.canvas.width,
      height: layout.canvas.height,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeRect(frame, componentId, {
      suffix: "eyebrow-bg",
      x: layout.eyebrow.x,
      y: layout.eyebrow.y,
      width: layout.eyebrow.width,
      height: layout.eyebrow.height,
      fill: stylePreset.colors.secondary,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "eyebrow",
      x: layout.eyebrow.x + 16,
      y: layout.eyebrow.y + 8,
      width: layout.eyebrow.width - 32,
      height: 22,
      text: componentTextSlot(slotBindings, "eyebrow", ""),
      color: stylePreset.colors.text,
      fontSize: 18,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, componentId, {
      suffix: "headline",
      x: layout.headline.x,
      y: layout.headline.y,
      width: layout.headline.width,
      height: layout.headline.height,
      text: fittedHeadline.text,
      color: stylePreset.colors.text,
      fontSize: fittedHeadline.fontSize,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: 1.06,
    }),
    makeText(frame, componentId, {
      suffix: "subhead",
      x: layout.subhead.x,
      y: layout.subhead.y,
      width: layout.subhead.width,
      height: layout.subhead.height,
      text: fittedSubhead.text,
      color: stylePreset.colors.textMuted,
      fontSize: fittedSubhead.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.34,
    }),
    makeRect(frame, componentId, {
      suffix: "benefits-panel",
      x: layout.benefits.x,
      y: layout.benefits.y,
      width: layout.benefits.width,
      height: layout.benefits.height,
      fill: stylePreset.colors.background,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "benefits",
      x: layout.benefits.x + 24,
      y: layout.benefits.y + 24,
      width: layout.benefits.width - 52,
      height: layout.benefits.height - 36,
      text: fittedBenefits.text,
      color: stylePreset.colors.text,
      fontSize: fittedBenefits.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.34,
    }),
    makeRect(frame, componentId, {
      suffix: "cta-bg",
      x: layout.cta.x,
      y: layout.cta.y,
      width: layout.cta.width,
      height: layout.cta.height,
      fill: stylePreset.colors.primary,
      stroke: stylePreset.colors.secondary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "cta",
      x: layout.cta.x + 24,
      y: layout.cta.y + 8,
      width: layout.cta.width - 48,
      height: 22,
      text: fittedCta.text,
      color: stylePreset.colors.background,
      fontSize: fittedCta.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "700",
      textAlign: "center",
    }),
    ...mediaElements,
  ];
}

function buildFramedImageStoryFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  const frame = getLayoutFrame(contentArea);
  const photo = componentImageSlot(slotBindings, "photo", { src: "", alt: "Story image" });
  const highlights = componentListSlot(slotBindings, "highlights", []);
  const photoFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["framed-image-story"]?.photo;
  const headlineText = componentTextSlot(slotBindings, "headline", "");
  const storyText = componentTextSlot(slotBindings, "story", "");
  const captionText = componentTextSlot(slotBindings, "caption", "");
  const denseLayout = countTextCharacters([
    headlineText,
    storyText,
    captionText,
    ...highlights,
  ]) >= 170 || highlights.length >= 2;
  const layout = denseLayout
    ? {
        canvas: { x: 44, y: 44, width: 1192, height: 632 },
        photo: { x: 72, y: 92, width: 360, height: 304 },
        kicker: { x: 468, y: 92, width: 214, height: 38 },
        headline: { x: 468, y: 152, width: 668, height: 124 },
        story: { x: 468, y: 290, width: 668, height: 156 },
        caption: { x: 72, y: 420, width: 360, height: 64 },
        highlights: { x: 72, y: 506, width: 1064, height: 112 },
      }
    : {
        canvas: { x: 88, y: 78, width: 1104, height: 564 },
        photo: { x: 120, y: 112, width: 424, height: 420 },
        kicker: { x: 606, y: 118, width: 204, height: 36 },
        headline: { x: 606, y: 178, width: 470, height: 114 },
        story: { x: 606, y: 308, width: 470, height: 114 },
        caption: { x: 120, y: 552, width: 424, height: 42 },
        highlights: { x: 606, y: 452, width: 470, height: 142 },
      };
  const fittedHeadline = fitTextBox({
    text: headlineText,
    width: layout.headline.width,
    height: layout.headline.height,
    baseFontSize: denseLayout ? 42 : 44,
    minFontSize: denseLayout ? 28 : 30,
    lineHeight: 1.1,
    maxLines: denseLayout ? 4 : 3,
  });
  const fittedStory = fitTextBox({
    text: storyText,
    width: layout.story.width,
    height: layout.story.height,
    baseFontSize: 21,
    minFontSize: 15,
    lineHeight: 1.38,
    maxLines: denseLayout ? 7 : 5,
  });
  const fittedCaption = fitTextBox({
    text: captionText,
    width: layout.caption.width - 44,
    height: layout.caption.height - 14,
    baseFontSize: 17,
    minFontSize: 13,
    lineHeight: 1.22,
    maxLines: denseLayout ? 3 : 2,
  });
  const fittedHighlights = fitListTextBox({
    items: highlights,
    width: layout.highlights.width - 56,
    height: layout.highlights.height - 44,
    baseFontSize: 19,
    minFontSize: 15,
    lineHeight: 1.34,
    maxLines: denseLayout ? 6 : 5,
  });

  const photoElements = photo.src.trim()
    ? [
      makeImage(frame, componentId, {
        suffix: "photo-image",
        x: layout.photo.x,
        y: layout.photo.y,
        width: layout.photo.width,
        height: layout.photo.height,
        src: photo.src,
        alt: photo.alt,
        mediaShape: photoFrameStyle?.mediaShape,
        mediaCornerRadius: photoFrameStyle?.mediaCornerRadius,
      }),
    ]
    : [
      makeRect(frame, componentId, {
        suffix: "photo-frame",
        x: layout.photo.x,
        y: layout.photo.y,
        width: layout.photo.width,
        height: layout.photo.height,
        fill: stylePreset.colors.backgroundAlt,
        stroke: stylePreset.colors.textMuted,
        strokeWidth: 4,
      }),
      makeText(frame, componentId, {
        suffix: "photo-placeholder",
        x: layout.photo.x + 42,
        y: layout.photo.y + Math.round((layout.photo.height / 2) - 20),
        width: layout.photo.width - 84,
        height: 40,
        text: "Drop or pick a story image",
        color: stylePreset.colors.text,
        fontSize: 24,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "700",
        textAlign: "center",
      }),
    ];

  return [
    makeRect(frame, componentId, {
      suffix: "canvas-bg",
      x: layout.canvas.x,
      y: layout.canvas.y,
      width: layout.canvas.width,
      height: layout.canvas.height,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    ...photoElements,
    makeRect(frame, componentId, {
      suffix: "kicker-bg",
      x: layout.kicker.x,
      y: layout.kicker.y,
      width: layout.kicker.width,
      height: layout.kicker.height,
      fill: stylePreset.colors.background,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "kicker",
      x: layout.kicker.x + 20,
      y: layout.kicker.y + 8,
      width: layout.kicker.width - 40,
      height: 20,
      text: componentTextSlot(slotBindings, "kicker", ""),
      color: stylePreset.colors.primary,
      fontSize: 17,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, componentId, {
      suffix: "headline",
      x: layout.headline.x,
      y: layout.headline.y,
      width: layout.headline.width,
      height: layout.headline.height,
      text: fittedHeadline.text,
      color: stylePreset.colors.text,
      fontSize: fittedHeadline.fontSize,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: 1.1,
    }),
    makeText(frame, componentId, {
      suffix: "story",
      x: layout.story.x,
      y: layout.story.y,
      width: layout.story.width,
      height: layout.story.height,
      text: fittedStory.text,
      color: stylePreset.colors.textMuted,
      fontSize: fittedStory.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.38,
    }),
    makeRect(frame, componentId, {
      suffix: "caption-bg",
      x: layout.caption.x,
      y: layout.caption.y,
      width: layout.caption.width,
      height: layout.caption.height,
      fill: stylePreset.colors.secondary,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "caption",
      x: layout.caption.x + 22,
      y: layout.caption.y + 10,
      width: layout.caption.width - 44,
      height: layout.caption.height - 14,
      text: fittedCaption.text,
      color: stylePreset.colors.text,
      fontSize: fittedCaption.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "600",
      textAlign: "center",
      lineHeight: 1.22,
    }),
    makeRect(frame, componentId, {
      suffix: "highlights-panel",
      x: layout.highlights.x,
      y: layout.highlights.y,
      width: layout.highlights.width,
      height: layout.highlights.height,
      fill: stylePreset.colors.background,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "highlights",
      x: layout.highlights.x + 28,
      y: layout.highlights.y + 24,
      width: layout.highlights.width - 56,
      height: layout.highlights.height - 44,
      text: fittedHighlights.text,
      color: stylePreset.colors.text,
      fontSize: fittedHighlights.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.34,
    }),
  ];
}

function buildPhotoCollageFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  if (isPortraitContentArea(contentArea)) {
    const frame = getPortraitDocumentFrame(contentArea);
    const primaryPhoto = componentImageSlot(slotBindings, "primary-photo", { src: "", alt: "Primary photo" });
    const secondaryPhoto = componentImageSlot(slotBindings, "secondary-photo", { src: "", alt: "Secondary photo" });
    const primaryFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["photo-collage"]?.["primary-photo"];
    const secondaryFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["photo-collage"]?.["secondary-photo"];
    const headlineFit = fitTextBox({
      text: componentTextSlot(slotBindings, "headline", ""),
      width: 888, height: 72, baseFontSize: 48, minFontSize: 29, lineHeight: 1.06, maxLines: 2,
    });
    const bodyFit = fitTextBox({
      text: componentTextSlot(slotBindings, "body", ""),
      width: 284, height: 344, baseFontSize: 20, minFontSize: 13, lineHeight: 1.38, maxLines: 16,
    });
    const captionFit = fitTextBox({
      text: componentTextSlot(slotBindings, "caption", ""),
      width: 824, height: 56, baseFontSize: 22, minFontSize: 14, lineHeight: 1.3, maxLines: 2,
    });

    const primaryElements = primaryPhoto.src.trim()
      ? [
        makeImage(frame, componentId, {
          suffix: "primary-image",
          x: 56,
          y: 150,
          width: 568,
          height: 706,
          src: primaryPhoto.src,
          alt: primaryPhoto.alt,
          mediaShape: primaryFrameStyle?.mediaShape,
          mediaCornerRadius: primaryFrameStyle?.mediaCornerRadius,
        }),
      ]
      : [
        makeRect(frame, componentId, {
          suffix: "primary-frame",
          x: 56,
          y: 150,
          width: 568,
          height: 706,
          fill: "#E2E8F0",
        }),
        makeText(frame, componentId, {
          suffix: "primary-placeholder",
          x: 162,
          y: 476,
          width: 356,
          height: 44,
          text: "Primary Photo",
          color: "#334155",
          fontSize: 30,
          fontFamily: stylePreset.typography.titleFontFamily,
          fontWeight: "700",
          textAlign: "center",
        }),
      ];

    const secondaryElements = secondaryPhoto.src.trim()
      ? [
        makeImage(frame, componentId, {
          suffix: "secondary-image",
          x: 660,
          y: 150,
          width: 284,
          height: 320,
          src: secondaryPhoto.src,
          alt: secondaryPhoto.alt,
          mediaShape: secondaryFrameStyle?.mediaShape,
          mediaCornerRadius: secondaryFrameStyle?.mediaCornerRadius,
        }),
      ]
      : [
        makeRect(frame, componentId, {
          suffix: "secondary-frame",
          x: 660,
          y: 150,
          width: 284,
          height: 320,
          fill: "#DBEAFE",
        }),
        makeText(frame, componentId, {
          suffix: "secondary-placeholder",
          x: 704,
          y: 288,
          width: 196,
          height: 40,
          text: "Detail Photo",
          color: "#1D4ED8",
          fontSize: 24,
          fontFamily: stylePreset.typography.titleFontFamily,
          fontWeight: "700",
          textAlign: "center",
        }),
      ];

    return [
      makeRect(frame, componentId, {
        suffix: "canvas-bg",
        x: 0,
        y: 0,
        width: PORTRAIT_LAYOUT_WIDTH,
        height: PORTRAIT_LAYOUT_HEIGHT,
        fill: "#FFFCF7",
      }),
      makeRect(frame, componentId, {
        suffix: "kicker-bg",
        x: 56,
        y: 54,
        width: 210,
        height: 42,
        fill: "#EEF2FF",
      }),
      makeText(frame, componentId, {
        suffix: "kicker",
        x: 84,
        y: 66,
        width: 154,
        height: 18,
        text: componentTextSlot(slotBindings, "kicker", ""),
        color: "#4338CA",
        fontSize: 18,
        fontWeight: "700",
        textAlign: "center",
      }),
      makeText(frame, componentId, {
        suffix: "headline",
        x: 56,
        y: 108,
        width: 888,
        height: 72,
        text: headlineFit.text,
        color: "#0F172A",
        fontSize: headlineFit.fontSize,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
        lineHeight: 1.06,
      }),
      ...primaryElements,
      ...secondaryElements,
      makeText(frame, componentId, {
        suffix: "body",
        x: 660,
        y: 512,
        width: 284,
        height: 344,
        text: bodyFit.text,
        color: "#475569",
        fontSize: bodyFit.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "500",
        lineHeight: 1.38,
      }),
      makeRect(frame, componentId, {
        suffix: "caption-bg",
        x: 56,
        y: 1116,
        width: 888,
        height: 176,
        fill: "#111827",
      }),
      makeText(frame, componentId, {
        suffix: "caption",
        x: 88,
        y: 1174,
        width: 824,
        height: 56,
        text: captionFit.text,
        color: "#F8FAFC",
        fontSize: captionFit.fontSize,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "600",
        textAlign: "center",
        lineHeight: 1.3,
      }),
    ];
  }
  const frame = getLayoutFrame(contentArea);
  const primaryPhoto = componentImageSlot(slotBindings, "primary-photo", { src: "", alt: "Primary photo" });
  const secondaryPhoto = componentImageSlot(slotBindings, "secondary-photo", { src: "", alt: "Secondary photo" });
  const primaryFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["photo-collage"]?.["primary-photo"];
  const secondaryFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["photo-collage"]?.["secondary-photo"];
  const headlineText = componentTextSlot(slotBindings, "headline", "");
  const bodyText = componentTextSlot(slotBindings, "body", "");
  const captionText = componentTextSlot(slotBindings, "caption", "");
  const denseLayout = countTextCharacters([
    headlineText,
    bodyText,
    captionText,
  ]) >= 150;
  const layout = denseLayout
    ? {
        canvas: { x: 44, y: 44, width: 1192, height: 632 },
        kicker: { x: 72, y: 72, width: 204, height: 38 },
        primary: { x: 72, y: 132, width: 360, height: 274 },
        secondary: { x: 72, y: 430, width: 220, height: 146 },
        headline: { x: 468, y: 126, width: 660, height: 118 },
        body: { x: 468, y: 270, width: 660, height: 186 },
        caption: { x: 468, y: 486, width: 660, height: 72 },
      }
    : {
        canvas: { x: 72, y: 78, width: 1136, height: 564 },
        kicker: { x: 112, y: 96, width: 188, height: 36 },
        primary: { x: 112, y: 152, width: 494, height: 360 },
        secondary: { x: 864, y: 108, width: 248, height: 198 },
        headline: { x: 112, y: 530, width: 520, height: 72 },
        body: { x: 656, y: 346, width: 456, height: 126 },
        caption: { x: 864, y: 524, width: 248, height: 44 },
      };
  const fittedHeadline = fitTextBox({
    text: headlineText,
    width: layout.headline.width,
    height: layout.headline.height,
    baseFontSize: denseLayout ? 40 : 40,
    minFontSize: denseLayout ? 26 : 28,
    lineHeight: 1.1,
    maxLines: denseLayout ? 4 : 3,
  });
  const fittedBody = fitTextBox({
    text: bodyText,
    width: layout.body.width,
    height: layout.body.height,
    baseFontSize: 21,
    minFontSize: 15,
    lineHeight: 1.36,
    maxLines: denseLayout ? 8 : 6,
  });
  const fittedCaption = fitTextBox({
    text: captionText,
    width: layout.caption.width - 44,
    height: layout.caption.height - 16,
    baseFontSize: 16,
    minFontSize: 13,
    lineHeight: 1.22,
    maxLines: denseLayout ? 3 : 2,
  });

  const primaryElements = primaryPhoto.src.trim()
    ? [
      makeImage(frame, componentId, {
        suffix: "primary-image",
        x: layout.primary.x,
        y: layout.primary.y,
        width: layout.primary.width,
        height: layout.primary.height,
        src: primaryPhoto.src,
        alt: primaryPhoto.alt,
        mediaShape: primaryFrameStyle?.mediaShape,
        mediaCornerRadius: primaryFrameStyle?.mediaCornerRadius,
      }),
    ]
    : [
      makeRect(frame, componentId, {
        suffix: "primary-frame",
        x: layout.primary.x,
        y: layout.primary.y,
        width: layout.primary.width,
        height: layout.primary.height,
        fill: stylePreset.colors.backgroundAlt,
        stroke: stylePreset.colors.primary,
        strokeWidth: 3,
      }),
      makeText(frame, componentId, {
        suffix: "primary-placeholder",
        x: layout.primary.x + 36,
        y: layout.primary.y + Math.round((layout.primary.height / 2) - 20),
        width: layout.primary.width - 72,
        height: 40,
        text: "Drop a primary image",
        color: stylePreset.colors.text,
        fontSize: 24,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "700",
        textAlign: "center",
      }),
    ];

  const secondaryElements = secondaryPhoto.src.trim()
    ? [
      makeImage(frame, componentId, {
        suffix: "secondary-image",
        x: layout.secondary.x,
        y: layout.secondary.y,
        width: layout.secondary.width,
        height: layout.secondary.height,
        src: secondaryPhoto.src,
        alt: secondaryPhoto.alt,
        mediaShape: secondaryFrameStyle?.mediaShape,
        mediaCornerRadius: secondaryFrameStyle?.mediaCornerRadius,
      }),
    ]
    : [
      makeRect(frame, componentId, {
        suffix: "secondary-frame",
        x: layout.secondary.x,
        y: layout.secondary.y,
        width: layout.secondary.width,
        height: layout.secondary.height,
        fill: stylePreset.colors.backgroundAlt,
        stroke: stylePreset.colors.secondary,
        strokeWidth: 3,
      }),
      makeText(frame, componentId, {
        suffix: "secondary-placeholder",
        x: layout.secondary.x + 20,
        y: layout.secondary.y + Math.round((layout.secondary.height / 2) - 16),
        width: layout.secondary.width - 40,
        height: 34,
        text: "Detail image",
        color: stylePreset.colors.secondary,
        fontSize: 20,
        fontFamily: stylePreset.typography.bodyFontFamily,
        fontWeight: "700",
        textAlign: "center",
      }),
    ];

  return [
    makeRect(frame, componentId, {
      suffix: "canvas-bg",
      x: layout.canvas.x,
      y: layout.canvas.y,
      width: layout.canvas.width,
      height: layout.canvas.height,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeRect(frame, componentId, {
      suffix: "kicker-bg",
      x: layout.kicker.x,
      y: layout.kicker.y,
      width: layout.kicker.width,
      height: layout.kicker.height,
      fill: stylePreset.colors.background,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "kicker",
      x: layout.kicker.x + 18,
      y: layout.kicker.y + 8,
      width: layout.kicker.width - 36,
      height: 20,
      text: componentTextSlot(slotBindings, "kicker", ""),
      color: stylePreset.colors.primary,
      fontSize: 17,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "700",
      textAlign: "center",
    }),
    ...primaryElements,
    ...secondaryElements,
    makeText(frame, componentId, {
      suffix: "headline",
      x: layout.headline.x,
      y: layout.headline.y,
      width: layout.headline.width,
      height: layout.headline.height,
      text: fittedHeadline.text,
      color: stylePreset.colors.text,
      fontSize: fittedHeadline.fontSize,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: 1.1,
    }),
    makeText(frame, componentId, {
      suffix: "body",
      x: layout.body.x,
      y: layout.body.y,
      width: layout.body.width,
      height: layout.body.height,
      text: fittedBody.text,
      color: stylePreset.colors.textMuted,
      fontSize: fittedBody.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.36,
    }),
    makeRect(frame, componentId, {
      suffix: "caption-bg",
      x: layout.caption.x,
      y: layout.caption.y,
      width: layout.caption.width,
      height: layout.caption.height,
      fill: stylePreset.colors.background,
      stroke: stylePreset.colors.secondary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "caption",
      x: layout.caption.x + 22,
      y: layout.caption.y + 10,
      width: layout.caption.width - 44,
      height: layout.caption.height - 16,
      text: fittedCaption.text,
      color: stylePreset.colors.text,
      fontSize: fittedCaption.fontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "600",
      textAlign: "center",
      lineHeight: 1.22,
    }),
  ];
}

function buildA4PhotoGridFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  const frame = getPortraitDocumentFrame(contentArea);
  const photoSlots = [
    { slotId: "hero-photo", suffix: "hero", x: 56, y: 154, width: 560, height: 624, label: "Hero Photo" },
    { slotId: "detail-photo-1", suffix: "detail-1", x: 650, y: 154, width: 294, height: 294, label: "Detail Photo 1" },
    { slotId: "detail-photo-2", suffix: "detail-2", x: 650, y: 484, width: 294, height: 294, label: "Detail Photo 2" },
    { slotId: "detail-photo-3", suffix: "detail-3", x: 56, y: 948, width: 280, height: 230, label: "Detail Photo 3" },
    { slotId: "detail-photo-4", suffix: "detail-4", x: 354, y: 948, width: 280, height: 230, label: "Detail Photo 4" },
  ] as const;

  const photoElements: PresentationSlideElement[] = photoSlots.flatMap((photoConfig): PresentationSlideElement[] => {
    const photo = componentImageSlot(slotBindings, photoConfig.slotId, { src: "", alt: photoConfig.label });
    const frameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["a4-photo-grid"]?.[photoConfig.slotId];
    if (photo.src.trim()) {
      return [
        makeImage(frame, componentId, {
          suffix: `${photoConfig.suffix}-image`,
          x: photoConfig.x,
          y: photoConfig.y,
          width: photoConfig.width,
          height: photoConfig.height,
          src: photo.src,
          alt: photo.alt,
          mediaShape: frameStyle?.mediaShape,
          mediaCornerRadius: frameStyle?.mediaCornerRadius,
        }),
      ];
    }
    return [
      makeRect(frame, componentId, {
        suffix: `${photoConfig.suffix}-frame`,
        x: photoConfig.x,
        y: photoConfig.y,
        width: photoConfig.width,
        height: photoConfig.height,
        fill: photoConfig.slotId === "hero-photo" ? "#E2E8F0" : "#E0F2FE",
        stroke: photoConfig.slotId === "hero-photo" ? "#CBD5E1" : "#BFDBFE",
        strokeWidth: 2,
      }),
      makeText(frame, componentId, {
        suffix: `${photoConfig.suffix}-placeholder`,
        x: photoConfig.x + 20,
        y: photoConfig.y + (photoConfig.height / 2) - 18,
        width: photoConfig.width - 40,
        height: 36,
        text: photoConfig.label,
        color: photoConfig.slotId === "hero-photo" ? "#334155" : "#1D4ED8",
        fontSize: photoConfig.slotId === "hero-photo" ? 28 : 20,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
        textAlign: "center",
      }),
    ];
  });

  return [
    makeRect(frame, componentId, {
      suffix: "canvas-bg",
      x: 0,
      y: 0,
      width: PORTRAIT_LAYOUT_WIDTH,
      height: PORTRAIT_LAYOUT_HEIGHT,
      fill: "#FFFCF7",
    }),
    makeRect(frame, componentId, {
      suffix: "eyebrow-bg",
      x: 56,
      y: 58,
      width: 240,
      height: 42,
      fill: "#EEF2FF",
    }),
    makeText(frame, componentId, {
      suffix: "eyebrow",
      x: 82,
      y: 70,
      width: 188,
      height: 18,
      text: componentTextSlot(slotBindings, "eyebrow", ""),
      color: "#4338CA",
      fontSize: 18,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, componentId, {
      suffix: "headline",
      x: 56,
      y: 112,
      width: 888,
      height: 72,
      text: componentTextSlot(slotBindings, "headline", ""),
      color: "#0F172A",
      fontSize: 46,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: 1.06,
    }),
    ...photoElements,
    makeRect(frame, componentId, {
      suffix: "summary-card",
      x: 652,
      y: 810,
      width: 292,
      height: 368,
      fill: "#FFFFFF",
      stroke: "#E2E8F0",
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "summary",
      x: 682,
      y: 852,
      width: 232,
      height: 244,
      text: componentTextSlot(slotBindings, "summary", ""),
      color: "#475569",
      fontSize: 21,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.38,
    }),
    makeRect(frame, componentId, {
      suffix: "caption-bar",
      x: 56,
      y: 1222,
      width: 888,
      height: 112,
      fill: "#111827",
    }),
    makeText(frame, componentId, {
      suffix: "caption",
      x: 94,
      y: 1258,
      width: 812,
      height: 40,
      text: componentTextSlot(slotBindings, "caption", ""),
      color: "#F8FAFC",
      fontSize: 20,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "600",
      textAlign: "center",
      lineHeight: 1.26,
    }),
  ];
}

function buildLandscapePhotoStoryFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  const frame = getLayoutFrame(contentArea);
  const photoSlots = [
    { slotId: "hero-photo", suffix: "hero", x: 72, y: 78, width: 620, height: 422, label: "Hero Showcase Image" },
    { slotId: "detail-photo-1", suffix: "detail-1", x: 740, y: 96, width: 444, height: 156, label: "Supporting Photo 1" },
    { slotId: "detail-photo-2", suffix: "detail-2", x: 740, y: 276, width: 444, height: 156, label: "Supporting Photo 2" },
    { slotId: "detail-photo-3", suffix: "detail-3", x: 740, y: 456, width: 444, height: 156, label: "Supporting Photo 3" },
  ] as const;
  const photoElements: PresentationSlideElement[] = photoSlots.flatMap((photoConfig): PresentationSlideElement[] => {
    const photo = componentImageSlot(slotBindings, photoConfig.slotId, { src: "", alt: photoConfig.label });
    const frameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["landscape-photo-story"]?.[photoConfig.slotId];
    if (photo.src.trim()) {
      return [
        makeImage(frame, componentId, {
          suffix: `${photoConfig.suffix}-image`,
          x: photoConfig.x,
          y: photoConfig.y,
          width: photoConfig.width,
          height: photoConfig.height,
          src: photo.src,
          alt: photo.alt,
          mediaShape: frameStyle?.mediaShape,
          mediaCornerRadius: frameStyle?.mediaCornerRadius,
        }),
      ];
    }
    return [
      makeRect(frame, componentId, {
        suffix: `${photoConfig.suffix}-frame`,
        x: photoConfig.x,
        y: photoConfig.y,
        width: photoConfig.width,
        height: photoConfig.height,
        fill: photoConfig.slotId === "hero-photo" ? "#E2E8F0" : "#F1F5F9",
        stroke: "#CBD5E1",
        strokeWidth: 2,
      }),
      makeText(frame, componentId, {
        suffix: `${photoConfig.suffix}-placeholder`,
        x: photoConfig.x + 24,
        y: photoConfig.y + (photoConfig.height / 2) - 18,
        width: photoConfig.width - 48,
        height: 36,
        text: photoConfig.label,
        color: "#334155",
        fontSize: photoConfig.slotId === "hero-photo" ? 28 : 20,
        fontFamily: stylePreset.typography.titleFontFamily,
        fontWeight: "700",
        textAlign: "center",
      }),
    ];
  });
  const highlights = componentListSlot(slotBindings, "highlights", [])
    .slice(0, 4)
    .map((item) => `• ${item}`)
    .join("\n");

  return [
    makeRect(frame, componentId, {
      suffix: "canvas-bg",
      x: 40,
      y: 40,
      width: 1200,
      height: 640,
      fill: "#FFFCF7",
      stroke: "#E2E8F0",
      strokeWidth: 2,
    }),
    ...photoElements,
    makeRect(frame, componentId, {
      suffix: "eyebrow-bg",
      x: 72,
      y: 530,
      width: 220,
      height: 34,
      fill: "#EEF2FF",
    }),
    makeText(frame, componentId, {
      suffix: "eyebrow",
      x: 94,
      y: 538,
      width: 176,
      height: 18,
      text: componentTextSlot(slotBindings, "eyebrow", ""),
      color: "#4338CA",
      fontSize: 17,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, componentId, {
      suffix: "headline",
      x: 72,
      y: 572,
      width: 520,
      height: 66,
      text: componentTextSlot(slotBindings, "headline", ""),
      color: "#0F172A",
      fontSize: 38,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: 1.08,
    }),
    makeText(frame, componentId, {
      suffix: "body",
      x: 608,
      y: 552,
      width: 300,
      height: 86,
      text: componentTextSlot(slotBindings, "body", ""),
      color: "#475569",
      fontSize: 18,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.34,
    }),
    makeText(frame, componentId, {
      suffix: "highlights-title",
      x: 934,
      y: 550,
      width: 210,
      height: 24,
      text: componentTextSlot(slotBindings, "highlights-title", ""),
      color: "#0F172A",
      fontSize: 18,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeRect(frame, componentId, {
      suffix: "highlights-panel",
      x: 928,
      y: 580,
      width: 222,
      height: 72,
      fill: "#FFFFFF",
      stroke: "#CBD5E1",
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "highlights",
      x: 952,
      y: 596,
      width: 174,
      height: 44,
      text: highlights,
      color: "#334155",
      fontSize: 14,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.32,
    }),
  ];
}

function buildFullpageImageFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  canvasWidth: number,
  canvasHeight: number,
): PresentationSlideElement[] {
  const imageSlot = slotBindings.find((s) => s.slotId === "fullpage" && s.type === "image") as PresentationComponentImageSlotBinding | undefined;
  const fullFrame: LayoutFrame = { scale: 1, offsetX: 0, offsetY: 0 };
  return [
    makeImage(fullFrame, componentId, {
      suffix: "fullpage-image",
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight,
      src: imageSlot?.src ?? "",
      alt: imageSlot?.alt ?? "Full-page image",
      mediaShape: "rect",
    }),
  ];
}

function buildFullpageVideoFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  canvasWidth: number,
  canvasHeight: number,
): PresentationSlideElement[] {
  const videoSlot = slotBindings.find((s) => s.slotId === "fullpage" && s.type === "video") as PresentationComponentVideoSlotBinding | undefined;
  const fullFrame: LayoutFrame = { scale: 1, offsetX: 0, offsetY: 0 };
  return [
    makeVideo(fullFrame, componentId, {
      suffix: "fullpage-video",
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight,
      src: videoSlot?.src ?? "",
      poster: videoSlot?.poster ?? "",
      title: videoSlot?.title ?? "Full-page video",
      mediaShape: "rect",
    }),
  ];
}

export function buildAIRecipeComponentInstance(input: {
  slideData: AIPresentationSlide;
  stylePreset: SlideStylePreset;
  contentArea: ContentArea;
  mediaUrl: string | null;
  mediaUrls?: Array<string | null>;
  canvasWidth?: number;
  canvasHeight?: number;
}): PresentationComponentInstance | null {
  const recipeId = input.slideData.componentRecipeId;
  if (!recipeId) {
    return null;
  }

  const componentId = `ai-recipe-${recipeId}-${crypto.randomUUID()}`;
  let slotBindings: PresentationComponentSlotBinding[];
  let fallbackElements: PresentationSlideElement[];

  switch (recipeId) {
    case "process-steps":
      slotBindings = createProcessStepsSlotBindings(input.slideData);
      fallbackElements = buildProcessStepsFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "timeline-flow":
      slotBindings = createTimelineFlowSlotBindings(input.slideData);
      fallbackElements = buildTimelineFlowFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "timeline-report":
      slotBindings = createTimelineReportSlotBindings(input.slideData);
      fallbackElements = buildTimelineReportFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "feature-highlights":
      slotBindings = createFeatureHighlightsSlotBindings(input.slideData);
      fallbackElements = buildFeatureHighlightsFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "infographic-grid":
      slotBindings = createInfographicGridSlotBindings(input.slideData);
      fallbackElements = buildInfographicGridFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "stat-cards":
      slotBindings = createStatCardsSlotBindings(input.slideData);
      fallbackElements = buildStatCardsFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "sectioned-explainer":
      slotBindings = createSectionedExplainerSlotBindings(input.slideData, input.mediaUrl);
      fallbackElements = buildSectionedExplainerFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "faq-stack":
      slotBindings = createFaqStackSlotBindings(input.slideData);
      fallbackElements = buildFaqStackFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "profile-summary":
      slotBindings = createProfileSummarySlotBindings(input.slideData, input.mediaUrl);
      fallbackElements = buildProfileSummaryFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "quote-callout":
      slotBindings = createQuoteCalloutSlotBindings(input.slideData);
      fallbackElements = buildQuoteCalloutFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "video-spotlight":
      slotBindings = createVideoSpotlightSlotBindings(input.slideData, input.mediaUrl);
      fallbackElements = buildVideoSpotlightFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "poster-spotlight":
      slotBindings = createPosterSpotlightSlotBindings(input.slideData, input.mediaUrl);
      fallbackElements = buildPosterSpotlightFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "framed-image-story":
      slotBindings = createFramedImageStorySlotBindings(input.slideData, input.mediaUrl);
      fallbackElements = buildFramedImageStoryFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "photo-collage":
      slotBindings = createPhotoCollageSlotBindings(input.slideData, input.mediaUrls ?? [input.mediaUrl]);
      fallbackElements = buildPhotoCollageFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "a4-photo-grid":
      slotBindings = createA4PhotoGridSlotBindings(input.slideData, input.mediaUrls ?? [input.mediaUrl]);
      fallbackElements = buildA4PhotoGridFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "landscape-photo-story":
      slotBindings = createLandscapePhotoStorySlotBindings(input.slideData, input.mediaUrls ?? [input.mediaUrl]);
      fallbackElements = buildLandscapePhotoStoryFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "article-focus":
      slotBindings = createArticleFocusSlotBindings(input.slideData, input.mediaUrl);
      fallbackElements = buildArticleFocusFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "two-column-article":
      slotBindings = createTwoColumnArticleSlotBindings(input.slideData, input.mediaUrl);
      fallbackElements = buildTwoColumnArticleFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "profile-board":
      slotBindings = createProfileBoardSlotBindings(input.slideData, input.mediaUrl);
      fallbackElements = buildProfileBoardFallback(componentId, slotBindings, input.stylePreset, input.contentArea);
      break;
    case "fullpage-image":
    case "fullpage-image-landscape": {
      const fpImgW = input.canvasWidth ?? (input.contentArea.x * 2 + input.contentArea.width);
      const fpImgH = input.canvasHeight ?? (input.contentArea.y * 2 + input.contentArea.height);
      slotBindings = [{ slotId: "fullpage", type: "image", src: input.mediaUrl ?? "", alt: input.slideData.title?.trim() || "Full-page image" }];
      fallbackElements = buildFullpageImageFallback(componentId, slotBindings, fpImgW, fpImgH);
      break;
    }
    case "fullpage-video":
    case "fullpage-video-landscape": {
      const fpVidW = input.canvasWidth ?? (input.contentArea.x * 2 + input.contentArea.width);
      const fpVidH = input.canvasHeight ?? (input.contentArea.y * 2 + input.contentArea.height);
      slotBindings = [{ slotId: "fullpage", type: "video", src: input.mediaUrl ?? "", poster: "", title: input.slideData.title?.trim() || "Full-page video" }];
      fallbackElements = buildFullpageVideoFallback(componentId, slotBindings, fpVidW, fpVidH);
      break;
    }
    default:
      return null;
  }

  return {
    id: componentId,
    componentId: recipeId,
    componentType: "built-in",
    definitionRevision: BUILT_IN_COMPONENT_REVISION,
    slotBindings,
    fallbackElements,
  };
}

function mapElementsWithMediaMetadata(
  elements: PresentationSlideElement[],
  input: {
    mediaType: "image" | "video";
    prompt?: string;
    modelId?: string;
    referenceUrls?: string[];
    extraParams?: Record<string, unknown>;
  },
): PresentationSlideElement[] {
  return elements.map((element) => {
    if (!("src" in element) || !(element as { src?: string }).src?.trim()) {
      return element;
    }

    if (input.mediaType === "video" && element.type === "video") {
      return {
        ...element,
        ...(input.prompt ? { videoPrompt: input.prompt.slice(0, 4000) } : {}),
        ...(input.modelId ? { videoModelId: input.modelId.slice(0, 256) } : {}),
        ...(input.referenceUrls?.length ? { videoReferenceUrls: input.referenceUrls.slice(0, 5) } : {}),
        ...(input.extraParams && Object.keys(input.extraParams).length > 0
          ? { videoExtraParams: input.extraParams }
          : {}),
      };
    }

    if (input.mediaType === "image" && element.type === "image") {
      return {
        ...element,
        ...(input.prompt ? { imagePrompt: input.prompt.slice(0, 4000) } : {}),
        ...(input.modelId ? { imageModelId: input.modelId.slice(0, 256) } : {}),
        ...(input.referenceUrls?.length ? { imageReferenceUrls: input.referenceUrls.slice(0, 5) } : {}),
        ...(input.extraParams && Object.keys(input.extraParams).length > 0
          ? { imageExtraParams: input.extraParams }
          : {}),
      };
    }

    return element;
  });
}

export function applyAIRecipeMediaMetadata(
  slideContent: PresentationSlideContent,
  input: {
    mediaType: "image" | "video";
    prompt?: string;
    modelId?: string;
    referenceUrls?: string[];
    extraParams?: Record<string, unknown>;
  },
): PresentationSlideContent {
  return {
    ...slideContent,
    elements: mapElementsWithMediaMetadata(slideContent.elements, input),
    ...(slideContent.components?.length
      ? {
          components: slideContent.components.map((component) => ({
            ...component,
            fallbackElements: mapElementsWithMediaMetadata(component.fallbackElements, input),
          })),
        }
      : {}),
  };
}

function findComponentTargetBySuffix(
  component: PresentationComponentInstance,
  suffixes: readonly string[],
): PresentationSlideElement | null {
  for (const suffix of suffixes) {
    const element = component.fallbackElements.find((candidate) => candidate.id.endsWith(`::${suffix}`));
    if (element) {
      return element;
    }
  }
  return null;
}

export function findAIRecipePendingMediaTarget(
  slideContent: PresentationSlideContent,
): {
  elementId?: string;
  slotId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  for (const component of slideContent.components ?? []) {
    const componentId = component.componentId as keyof typeof PRESENTATION_COMPONENT_MEDIA_SLOTS;
    const mediaSlots = PRESENTATION_COMPONENT_MEDIA_SLOTS[componentId];
    if (!mediaSlots?.length) {
      continue;
    }
    for (const slotId of mediaSlots) {
      const candidateSuffixes =
        (PRESENTATION_COMPONENT_SLOT_TARGETS[componentId] as Record<string, readonly string[]> | undefined)?.[slotId] ?? [];
      const target = findComponentTargetBySuffix(
        component,
        candidateSuffixes.filter((suffix: string) => suffix.endsWith("-image") || suffix.endsWith("-frame") || suffix.endsWith("-video")),
      );
      if (!target) {
        continue;
      }
      return {
        elementId: target.id,
        slotId,
        x: target.x,
        y: target.y,
        width: target.width,
        height: target.height,
      };
    }
  }
  return null;
}

export function findAIRecipePendingMediaTargets(
  slideContent: PresentationSlideContent,
): Array<{
  elementId?: string;
  slotId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const targets: Array<{
    elementId?: string;
    slotId?: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];

  for (const component of slideContent.components ?? []) {
    const componentId = component.componentId as keyof typeof PRESENTATION_COMPONENT_MEDIA_SLOTS;
    const mediaSlots = PRESENTATION_COMPONENT_MEDIA_SLOTS[componentId];
    if (!mediaSlots?.length) {
      continue;
    }
    for (const slotId of mediaSlots) {
      const candidateSuffixes =
        (PRESENTATION_COMPONENT_SLOT_TARGETS[componentId] as Record<string, readonly string[]> | undefined)?.[slotId] ?? [];
      const target = findComponentTargetBySuffix(
        component,
        candidateSuffixes.filter((suffix: string) => suffix.endsWith("-image") || suffix.endsWith("-frame") || suffix.endsWith("-video")),
      );
      if (!target) {
        continue;
      }
      targets.push({
        elementId: target.id,
        slotId,
        x: target.x,
        y: target.y,
        width: target.width,
        height: target.height,
      });
    }
  }

  return targets;
}

function replaceOrAppendSlotBinding(
  slotBindings: PresentationComponentSlotBinding[],
  nextBinding: PresentationComponentSlotBinding,
): PresentationComponentSlotBinding[] {
  const filtered = slotBindings.filter((binding) => !(
    binding.slotId === nextBinding.slotId
    && (binding.type === "image" || binding.type === "video")
    && (nextBinding.type === "image" || nextBinding.type === "video")
  ));
  const index = filtered.findIndex((binding) => (
    binding.slotId === nextBinding.slotId && binding.type === nextBinding.type
  ));
  if (index < 0) {
    return [...filtered, nextBinding];
  }
  const next = [...filtered];
  next[index] = nextBinding;
  return next;
}

function getComponentElementSuffix(elementId: string): string {
  const delimiter = elementId.indexOf("::");
  return delimiter >= 0 ? elementId.slice(delimiter + 2) : elementId;
}

function resolveComponentMediaSlotId(
  component: PresentationComponentInstance,
  mediaType: "image" | "video",
  targetElementId: string,
): string | null {
  const targetSuffix = getComponentElementSuffix(targetElementId);
  const componentId = component.componentId as keyof typeof PRESENTATION_COMPONENT_MEDIA_SLOT_TYPES;
  const mediaSlotTypes = PRESENTATION_COMPONENT_MEDIA_SLOT_TYPES[componentId] as
    | Record<string, PresentationComponentMediaSlotType>
    | undefined;
  if (!mediaSlotTypes) {
    return null;
  }

  for (const [slotId, slotMediaType] of Object.entries(mediaSlotTypes)) {
    if (!presentationMediaSlotSupportsType(slotMediaType, mediaType)) {
      continue;
    }
    const suffixes =
      (PRESENTATION_COMPONENT_SLOT_TARGETS[componentId] as Record<string, readonly string[]> | undefined)?.[slotId] ?? [];
    if (suffixes.includes(targetSuffix)) {
      return slotId;
    }
  }

  return null;
}

export function applyResolvedMediaToAIRecipeSlideContent(
  slideContent: PresentationSlideContent,
  job: PresentationPendingMediaJob,
  sourceUrl: string,
  slideTitle: string,
): PresentationSlideContent {
  if (!job.targetElementId) {
    return slideContent;
  }

  let componentUpdated = false;
  const nextComponents = slideContent.components?.map((component) => {
    const targetIndex = component.fallbackElements.findIndex((element) => element.id === job.targetElementId);
    if (targetIndex < 0) {
      return component;
    }

    componentUpdated = true;
    const target = component.fallbackElements[targetIndex]!;
    const resolvedSlotId = job.targetSlotId
      || resolveComponentMediaSlotId(component, job.mediaType, target.id);
    const componentId = component.componentId as keyof typeof PRESENTATION_COMPONENT_SLOT_TARGETS;
    const slotTargetSuffixes = resolvedSlotId
      ? new Set(
          (PRESENTATION_COMPONENT_SLOT_TARGETS[componentId] as Record<string, readonly string[]> | undefined)?.[resolvedSlotId] ?? [],
        )
      : null;
    const nextFallbackElements = component.fallbackElements.filter((element) => {
      if (!slotTargetSuffixes?.size) {
        return true;
      }
      const suffix = getComponentElementSuffix(element.id);
      return !slotTargetSuffixes.has(suffix) || element.id === target.id;
    });
    const replacement: PresentationSlideElement = job.mediaType === "video"
      ? {
          id: target.id,
          type: "video",
          x: target.x,
          y: target.y,
          width: target.width,
          height: target.height,
          src: sourceUrl,
          poster: "",
          title: slideTitle,
          muted: true,
          loop: true,
          videoFit: "cover",
          videoPositionX: 50,
          videoPositionY: 50,
          videoZoom: 1,
          ...(job.prompt ? { videoPrompt: job.prompt.slice(0, 4000) } : {}),
          ...(job.modelId ? { videoModelId: job.modelId.slice(0, 256) } : {}),
        }
      : {
          id: target.id,
          type: "image",
          x: target.x,
          y: target.y,
          width: target.width,
          height: target.height,
          src: sourceUrl,
          alt: slideTitle.slice(0, 512) || "Image",
          imageFit: "cover",
          imagePositionX: 50,
          imagePositionY: 50,
          imageZoom: 1,
          ...(job.prompt ? { imagePrompt: job.prompt.slice(0, 4000) } : {}),
          ...(job.modelId ? { imageModelId: job.modelId.slice(0, 256) } : {}),
        };
    const nextTargetIndex = nextFallbackElements.findIndex((element) => element.id === target.id);
    if (nextTargetIndex >= 0) {
      nextFallbackElements[nextTargetIndex] = replacement;
    } else {
      nextFallbackElements.push(replacement);
    }

    let nextSlotBindings = component.slotBindings;
    if (resolvedSlotId && job.mediaType === "image") {
      nextSlotBindings = replaceOrAppendSlotBinding(nextSlotBindings, {
        slotId: resolvedSlotId,
        type: "image",
        src: sourceUrl,
        alt: slideTitle.slice(0, 512) || "Image",
      });
    } else if (resolvedSlotId && job.mediaType === "video") {
      nextSlotBindings = replaceOrAppendSlotBinding(nextSlotBindings, {
        slotId: resolvedSlotId,
        type: "video",
        src: sourceUrl,
        poster: "",
        title: slideTitle.slice(0, 512) || "Video clip",
      });
    }

    return {
      ...component,
      slotBindings: nextSlotBindings,
      fallbackElements: nextFallbackElements,
    };
  });

  if (componentUpdated) {
    return {
      ...slideContent,
      ...(nextComponents ? { components: nextComponents } : {}),
    };
  }

  return slideContent;
}
