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
} from "@shared/presentation/componentRecipes";
import { buildPresentationComponentRecipeSlotBindings } from "@shared/presentation/componentRecipeSlotBindings";
import type {
  AIPresentationComponentRecipeId,
  AIPresentationSlide,
  SlideStylePreset,
} from "@shared/presentation/aiTypes";

const BASE_RECIPE_WIDTH = 1280;
const BASE_RECIPE_HEIGHT = 720;
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

function px(frame: LayoutFrame, value: number): number {
  return frame.offsetX + Math.round(value * frame.scale);
}

function py(frame: LayoutFrame, value: number): number {
  return frame.offsetY + Math.round(value * frame.scale);
}

function ps(frame: LayoutFrame, value: number, min: number = 1): number {
  return Math.max(min, Math.round(value * frame.scale));
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
    height: ps(frame, config.height),
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
}): { text: string; fontSize: number } {
  const cleanedText = config.text.trim();
  if (!cleanedText) {
    return { text: "", fontSize: config.baseFontSize };
  }
  for (let size = config.baseFontSize; size >= config.minFontSize; size -= 1) {
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
    height: ps(frame, config.height),
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
    height: ps(frame, config.height),
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
    height: ps(frame, config.height),
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
  return buildPresentationComponentRecipeSlotBindings("timeline-flow", {
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
  return buildPresentationComponentRecipeSlotBindings("stat-cards", {
    title: slideData.title,
    body: slideData.body,
    notes: slideData.notes,
    sections: slideData.sections,
    graphicCategory: slideData.graphicCategory,
  });
}

function createQuoteCalloutSlotBindings(
  slideData: AIPresentationSlide,
): PresentationComponentSlotBinding[] {
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
    { x: 498, y: 474, color: stylePreset.colors.cardBg[3] ?? stylePreset.colors.cardBg[0] ?? stylePreset.colors.primary, titleSlot: "item4-title", bodySlot: "item4-body" },
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

  const mediaElements = hero.src.trim()
    ? [
      makeImage(frame, componentId, {
        suffix: "hero-image",
        x: 728,
        y: 84,
        width: 384,
        height: 552,
        src: hero.src,
        alt: hero.alt,
        mediaShape: heroFrameStyle?.mediaShape,
        mediaCornerRadius: heroFrameStyle?.mediaCornerRadius,
      }),
    ]
    : [
      makeRect(frame, componentId, {
        suffix: "hero-frame",
        x: 728,
        y: 84,
        width: 384,
        height: 552,
        fill: stylePreset.colors.secondary,
        stroke: stylePreset.colors.primary,
        strokeWidth: 3,
      }),
      makeText(frame, componentId, {
        suffix: "hero-placeholder",
        x: 788,
        y: 332,
        width: 264,
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
      x: 96,
      y: 64,
      width: 1088,
      height: 592,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeRect(frame, componentId, {
      suffix: "eyebrow-bg",
      x: 140,
      y: 108,
      width: 208,
      height: 38,
      fill: stylePreset.colors.secondary,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "eyebrow",
      x: 156,
      y: 116,
      width: 176,
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
      x: 140,
      y: 180,
      width: 506,
      height: 140,
      text: componentTextSlot(slotBindings, "headline", ""),
      color: stylePreset.colors.text,
      fontSize: 50,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: 1.05,
    }),
    makeText(frame, componentId, {
      suffix: "subhead",
      x: 140,
      y: 336,
      width: 492,
      height: 82,
      text: componentTextSlot(slotBindings, "subhead", ""),
      color: stylePreset.colors.textMuted,
      fontSize: 22,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.34,
    }),
    makeRect(frame, componentId, {
      suffix: "benefits-panel",
      x: 140,
      y: 452,
      width: 456,
      height: 126,
      fill: stylePreset.colors.background,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "benefits",
      x: 168,
      y: 478,
      width: 404,
      height: 76,
      text: benefits.map((item) => `• ${item}`).join("\n"),
      color: stylePreset.colors.text,
      fontSize: 20,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.36,
    }),
    makeRect(frame, componentId, {
      suffix: "cta-bg",
      x: 140,
      y: 596,
      width: 286,
      height: 40,
      fill: stylePreset.colors.primary,
      stroke: stylePreset.colors.secondary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "cta",
      x: 164,
      y: 604,
      width: 238,
      height: 22,
      text: componentTextSlot(slotBindings, "cta", ""),
      color: stylePreset.colors.background,
      fontSize: 18,
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

  const photoElements = photo.src.trim()
    ? [
      makeImage(frame, componentId, {
        suffix: "photo-image",
        x: 120,
        y: 112,
        width: 424,
        height: 420,
        src: photo.src,
        alt: photo.alt,
        mediaShape: photoFrameStyle?.mediaShape,
        mediaCornerRadius: photoFrameStyle?.mediaCornerRadius,
      }),
    ]
    : [
      makeRect(frame, componentId, {
        suffix: "photo-frame",
        x: 120,
        y: 112,
        width: 424,
        height: 420,
        fill: stylePreset.colors.backgroundAlt,
        stroke: stylePreset.colors.textMuted,
        strokeWidth: 4,
      }),
      makeText(frame, componentId, {
        suffix: "photo-placeholder",
        x: 184,
        y: 300,
        width: 296,
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
      x: 88,
      y: 78,
      width: 1104,
      height: 564,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    ...photoElements,
    makeRect(frame, componentId, {
      suffix: "kicker-bg",
      x: 606,
      y: 118,
      width: 204,
      height: 36,
      fill: stylePreset.colors.background,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "kicker",
      x: 626,
      y: 126,
      width: 164,
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
      x: 606,
      y: 178,
      width: 470,
      height: 114,
      text: componentTextSlot(slotBindings, "headline", ""),
      color: stylePreset.colors.text,
      fontSize: 44,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: 1.1,
    }),
    makeText(frame, componentId, {
      suffix: "story",
      x: 606,
      y: 308,
      width: 470,
      height: 114,
      text: componentTextSlot(slotBindings, "story", ""),
      color: stylePreset.colors.textMuted,
      fontSize: 21,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.4,
    }),
    makeRect(frame, componentId, {
      suffix: "caption-bg",
      x: 120,
      y: 552,
      width: 424,
      height: 42,
      fill: stylePreset.colors.secondary,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "caption",
      x: 146,
      y: 562,
      width: 372,
      height: 22,
      text: componentTextSlot(slotBindings, "caption", ""),
      color: stylePreset.colors.text,
      fontSize: 17,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "600",
      textAlign: "center",
    }),
    makeRect(frame, componentId, {
      suffix: "highlights-panel",
      x: 606,
      y: 452,
      width: 470,
      height: 142,
      fill: stylePreset.colors.background,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "highlights",
      x: 634,
      y: 480,
      width: 414,
      height: 86,
      text: highlights.map((item) => `• ${item}`).join("\n"),
      color: stylePreset.colors.text,
      fontSize: 19,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.38,
    }),
  ];
}

function buildPhotoCollageFallback(
  componentId: string,
  slotBindings: PresentationComponentSlotBinding[],
  stylePreset: SlideStylePreset,
  contentArea: ContentArea,
): PresentationSlideElement[] {
  const frame = getLayoutFrame(contentArea);
  const primaryPhoto = componentImageSlot(slotBindings, "primary-photo", { src: "", alt: "Primary photo" });
  const secondaryPhoto = componentImageSlot(slotBindings, "secondary-photo", { src: "", alt: "Secondary photo" });
  const primaryFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["photo-collage"]?.["primary-photo"];
  const secondaryFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["photo-collage"]?.["secondary-photo"];

  const primaryElements = primaryPhoto.src.trim()
    ? [
      makeImage(frame, componentId, {
        suffix: "primary-image",
        x: 112,
        y: 152,
        width: 494,
        height: 360,
        src: primaryPhoto.src,
        alt: primaryPhoto.alt,
        imageFit: "cover",
        mediaShape: primaryFrameStyle?.mediaShape,
        mediaCornerRadius: primaryFrameStyle?.mediaCornerRadius,
      }),
    ]
    : [
      makeRect(frame, componentId, {
        suffix: "primary-frame",
        x: 112,
        y: 152,
        width: 494,
        height: 360,
        fill: stylePreset.colors.backgroundAlt,
        stroke: stylePreset.colors.primary,
        strokeWidth: 3,
      }),
      makeText(frame, componentId, {
        suffix: "primary-placeholder",
        x: 216,
        y: 318,
        width: 286,
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
        x: 864,
        y: 108,
        width: 248,
        height: 198,
        src: secondaryPhoto.src,
        alt: secondaryPhoto.alt,
        imageFit: "cover",
        mediaShape: secondaryFrameStyle?.mediaShape,
        mediaCornerRadius: secondaryFrameStyle?.mediaCornerRadius,
      }),
    ]
    : [
      makeRect(frame, componentId, {
        suffix: "secondary-frame",
        x: 864,
        y: 108,
        width: 248,
        height: 198,
        fill: stylePreset.colors.backgroundAlt,
        stroke: stylePreset.colors.secondary,
        strokeWidth: 3,
      }),
      makeText(frame, componentId, {
        suffix: "secondary-placeholder",
        x: 900,
        y: 190,
        width: 176,
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
      x: 72,
      y: 78,
      width: 1136,
      height: 564,
      fill: stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeRect(frame, componentId, {
      suffix: "kicker-bg",
      x: 112,
      y: 96,
      width: 188,
      height: 36,
      fill: stylePreset.colors.background,
      stroke: stylePreset.colors.primary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "kicker",
      x: 130,
      y: 104,
      width: 152,
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
      x: 112,
      y: 530,
      width: 520,
      height: 72,
      text: componentTextSlot(slotBindings, "headline", ""),
      color: stylePreset.colors.text,
      fontSize: 40,
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "700",
      lineHeight: 1.1,
    }),
    makeText(frame, componentId, {
      suffix: "body",
      x: 656,
      y: 346,
      width: 456,
      height: 126,
      text: componentTextSlot(slotBindings, "body", ""),
      color: stylePreset.colors.textMuted,
      fontSize: 21,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "500",
      lineHeight: 1.38,
    }),
    makeRect(frame, componentId, {
      suffix: "caption-bg",
      x: 864,
      y: 524,
      width: 248,
      height: 44,
      fill: stylePreset.colors.background,
      stroke: stylePreset.colors.secondary,
      strokeWidth: 2,
    }),
    makeText(frame, componentId, {
      suffix: "caption",
      x: 888,
      y: 534,
      width: 200,
      height: 22,
      text: componentTextSlot(slotBindings, "caption", ""),
      color: stylePreset.colors.text,
      fontSize: 16,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "600",
      textAlign: "center",
    }),
  ];
}

export function buildAIRecipeComponentInstance(input: {
  slideData: AIPresentationSlide;
  stylePreset: SlideStylePreset;
  contentArea: ContentArea;
  mediaUrl: string | null;
  mediaUrls?: Array<string | null>;
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
    if (!element.src?.trim()) {
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
    const mediaSlots = PRESENTATION_COMPONENT_MEDIA_SLOTS[component.componentId];
    if (!mediaSlots?.length) {
      continue;
    }
    for (const slotId of mediaSlots) {
      const candidateSuffixes = PRESENTATION_COMPONENT_SLOT_TARGETS[component.componentId]?.[slotId] ?? [];
      const target = findComponentTargetBySuffix(
        component,
        candidateSuffixes.filter((suffix) => suffix.endsWith("-image") || suffix.endsWith("-frame") || suffix.endsWith("-video")),
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
    const mediaSlots = PRESENTATION_COMPONENT_MEDIA_SLOTS[component.componentId];
    if (!mediaSlots?.length) {
      continue;
    }
    for (const slotId of mediaSlots) {
      const candidateSuffixes = PRESENTATION_COMPONENT_SLOT_TARGETS[component.componentId]?.[slotId] ?? [];
      const target = findComponentTargetBySuffix(
        component,
        candidateSuffixes.filter((suffix) => suffix.endsWith("-image") || suffix.endsWith("-frame") || suffix.endsWith("-video")),
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
  const index = slotBindings.findIndex((binding) => (
    binding.slotId === nextBinding.slotId && binding.type === nextBinding.type
  ));
  if (index < 0) {
    return [...slotBindings, nextBinding];
  }
  const next = [...slotBindings];
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
  const mediaSlotTypes = PRESENTATION_COMPONENT_MEDIA_SLOT_TYPES[component.componentId];
  if (!mediaSlotTypes) {
    return null;
  }

  for (const [slotId, slotMediaType] of Object.entries(mediaSlotTypes)) {
    if (slotMediaType !== mediaType) {
      continue;
    }
    const suffixes = PRESENTATION_COMPONENT_SLOT_TARGETS[component.componentId]?.[slotId] ?? [];
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
    const slotTargetSuffixes = resolvedSlotId
      ? new Set(PRESENTATION_COMPONENT_SLOT_TARGETS[component.componentId]?.[resolvedSlotId] ?? [])
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
