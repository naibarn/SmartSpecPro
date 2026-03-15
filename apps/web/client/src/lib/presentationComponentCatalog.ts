import type { PresentationCanvasSize } from "@/presentation-canvas/constants";
import {
  clampPresentationTextToUnits,
  getPresentationComponentSlotBudget,
  PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES,
  PRESENTATION_COMPONENT_MEDIA_SLOTS,
  PRESENTATION_COMPONENT_SLOT_TARGETS,
  PRESENTATION_COMPONENT_MEDIA_SLOT_TYPES,
  presentationMediaSlotSupportsType,
  type BuiltInPresentationComponentId,
  type PresentationComponentMediaSlotType,
} from "@shared/presentation/componentRecipes";
export type { BuiltInPresentationComponentId };
import {
  buildPresentationComponentRecipeSlotBindings,
  type PresentationRecipeNarrativeInput,
} from "@shared/presentation/componentRecipeSlotBindings";
import type {
  PresentationComponentImageSlotBinding,
  PresentationComponentInstance,
  PresentationComponentListSlotBinding,
  PresentationComponentSlotBinding,
  PresentationComponentTextSlotBinding,
  PresentationComponentVideoSlotBinding,
  PresentationSlideElement,
} from "@shared/presentation/contracts";
import { SVG_GRAPHICS } from "@shared/presentation/svgGraphicsCatalog";

const BASE_CANVAS_WIDTH = 1280;
const BASE_CANVAS_HEIGHT = 720;
const PORTRAIT_LAYOUT_WIDTH = 1000;
const PORTRAIT_LAYOUT_HEIGHT = 1414;
const BUILT_IN_COMPONENT_REVISION = 1;
const SVG_BY_ID = new Map(SVG_GRAPHICS.map((graphic) => [graphic.id, graphic.svg]));

type ComponentCategory = "Process" | "Marketing" | "Data" | "Profile" | "Storytelling" | "Long-form" | "Document";

interface LayoutFrame {
  scale: number;
  offsetX: number;
  offsetY: number;
  yStretch?: number;
}

export type BuiltInPresentationComponentSlotDefinition =
  | {
    id: string;
    label: string;
    type: "text";
    multiline?: boolean;
    placeholder?: string;
  }
  | {
    id: string;
    label: string;
    type: "image";
    placeholder?: string;
    altLabel?: string;
  }
  | {
    id: string;
    label: string;
    type: "media";
    placeholder?: string;
    altLabel?: string;
    posterLabel?: string;
    titleLabel?: string;
  }
  | {
    id: string;
    label: string;
    type: "video";
    placeholder?: string;
    posterLabel?: string;
    titleLabel?: string;
  }
  | {
    id: string;
    label: string;
    type: "list";
    placeholder?: string;
  };

export type BuiltInPresentationComponentCanvasIntent = "adaptive" | "portrait-document" | "landscape-16:9";

export interface BuiltInPresentationComponentPreviewMediaZone {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  slotType: PresentationComponentMediaSlotType;
}

export interface BuiltInPresentationComponentDefinition {
  id: BuiltInPresentationComponentId;
  label: string;
  category: ComponentCategory;
  description: string;
  accentColor: string;
  previewSvg: string;
  slotDefinitions: readonly BuiltInPresentationComponentSlotDefinition[];
  canvasIntent: BuiltInPresentationComponentCanvasIntent;
  previewMediaZones?: readonly BuiltInPresentationComponentPreviewMediaZone[];
}

export interface PresentationComponentCanvasSlotArea {
  slotId: string;
  label: string;
  type: BuiltInPresentationComponentSlotDefinition["type"];
  multiline?: boolean;
  targetElementIds: string[];
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface BuildComponentInstanceOptions {
  canvas: PresentationCanvasSize;
  instanceId: string;
}

export interface BuiltInPresentationComponentMediaProfile {
  slotCount: number;
  acceptsImages: boolean;
  acceptsVideos: boolean;
}

function cloneSlotBinding(binding: PresentationComponentSlotBinding): PresentationComponentSlotBinding {
  if (binding.type === "list") {
    return {
      ...binding,
      items: [...binding.items],
    };
  }
  return {
    ...binding,
  };
}

function getLayoutFrame(canvas: PresentationCanvasSize): LayoutFrame {
  const scale = Math.min(canvas.width / BASE_CANVAS_WIDTH, canvas.height / BASE_CANVAS_HEIGHT);
  return {
    scale,
    offsetX: Math.round((canvas.width - (BASE_CANVAS_WIDTH * scale)) / 2),
    offsetY: Math.round((canvas.height - (BASE_CANVAS_HEIGHT * scale)) / 2),
  };
}

function isPortraitCanvas(canvas: PresentationCanvasSize): boolean {
  return canvas.height > canvas.width;
}

function getPortraitDocumentFrame(canvas: PresentationCanvasSize): LayoutFrame {
  const insetX = Math.max(20, Math.round(canvas.width * 0.04));
  const insetY = Math.max(28, Math.round(canvas.height * 0.03));
  const availableWidth = Math.max(280, canvas.width - (insetX * 2));
  const availableHeight = Math.max(420, canvas.height - (insetY * 2));
  const scale = availableWidth / PORTRAIT_LAYOUT_WIDTH;
  const yStretch = availableHeight / (PORTRAIT_LAYOUT_HEIGHT * scale);
  const width = PORTRAIT_LAYOUT_WIDTH * scale;
  return {
    scale,
    offsetX: Math.round((canvas.width - width) / 2),
    offsetY: insetY,
    yStretch,
  };
}

function px(frame: LayoutFrame, x: number): number {
  return frame.offsetX + Math.round(x * frame.scale);
}

function py(frame: LayoutFrame, y: number): number {
  const stretched = y * (frame.yStretch ?? 1);
  return frame.offsetY + Math.round(stretched * frame.scale);
}

function ps(frame: LayoutFrame, value: number, min: number = 1): number {
  return Math.max(min, Math.round(value * frame.scale));
}

function phs(frame: LayoutFrame, value: number, min: number = 1): number {
  const stretched = value * (frame.yStretch ?? 1);
  return Math.max(min, Math.round(stretched * frame.scale));
}

function componentElementId(componentInstanceId: string, suffix: string): string {
  return `${componentInstanceId}::${suffix}`;
}

function textBinding(slotBindings: PresentationComponentSlotBinding[], slotId: string, fallback: string): string {
  const binding = slotBindings.find((slot): slot is PresentationComponentTextSlotBinding => (
    slot.slotId === slotId && slot.type === "text"
  ));
  return binding?.text ?? fallback;
}

function imageBinding(
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

type PresentationRenderableMediaBinding =
  | { type: "image"; src: string; alt: string }
  | { type: "video"; src: string; poster?: string; title: string };

function mediaBinding(
  slotBindings: PresentationComponentSlotBinding[],
  slotId: string,
): PresentationRenderableMediaBinding | null {
  const binding = slotBindings.find((slot) => slot.slotId === slotId && (slot.type === "image" || slot.type === "video"));
  if (!binding) {
    return null;
  }
  if (binding.type === "image") {
    return {
      type: "image",
      src: binding.src,
      alt: binding.alt ?? "",
    };
  }
  return {
    type: "video",
    src: binding.src,
    poster: binding.poster,
    title: binding.title ?? "",
  };
}

function videoBinding(
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

function listBinding(
  slotBindings: PresentationComponentSlotBinding[],
  slotId: string,
  fallback: string[],
): string[] {
  const binding = slotBindings.find((slot): slot is PresentationComponentListSlotBinding => (
    slot.slotId === slotId && slot.type === "list"
  ));
  return binding?.items ?? fallback;
}

function sanitizeSlotBindingsToBudget(
  componentId: BuiltInPresentationComponentId,
  slotBindings: PresentationComponentSlotBinding[],
): PresentationComponentSlotBinding[] {
  return slotBindings.map((binding) => {
    const budget = getPresentationComponentSlotBudget(componentId, binding.slotId);
    if (binding.type === "text") {
      return {
        ...binding,
        text: clampPresentationTextToUnits(binding.text, budget.maxChars),
      };
    }
    if (binding.type === "list") {
      const limitedItems = binding.items
        .map((item) => clampPresentationTextToUnits(item, budget.maxChars))
        .filter((item) => item.length > 0);
      return {
        ...binding,
        items: typeof budget.maxItems === "number"
          ? limitedItems.slice(0, budget.maxItems)
          : limitedItems,
      };
    }
    return binding;
  });
}

// ─── Text-fit helpers (mirrored from server aiPresentationComponentRecipes) ───

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

function fitListTextBox(config: {
  items: string[];
  width: number;
  height: number;
  baseFontSize: number;
  minFontSize: number;
  lineHeight: number;
  maxLines: number;
  bulletPrefix?: string;
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
  });
}

// ─────────────────────────────────────────────────────────────────────────────

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
    fontWeight?: "normal" | "500" | "600" | "700";
    textAlign?: "left" | "center" | "right" | "justify";
    lineHeight?: number;
    backgroundColor?: string;
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
    fontWeight: config.fontWeight,
    textAlign: config.textAlign,
    lineHeight: config.lineHeight,
    backgroundColor: config.backgroundColor,
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
    height: phs(frame, config.height),
    rotation: 0,
    fill: config.fill,
    stroke: config.stroke,
    strokeWidth: config.strokeWidth === undefined ? undefined : ps(frame, config.strokeWidth),
  };
}

function makeSvgGraphic(
  frame: LayoutFrame,
  componentInstanceId: string,
  config: {
    suffix: string;
    x: number;
    y: number;
    size: number;
    graphicId: string;
    alt: string;
    color: string;
  },
): Extract<PresentationSlideElement, { type: "image" }> {
  const svgContent = SVG_BY_ID.get(config.graphicId);
  if (!svgContent) {
    throw new Error(`Unknown SVG graphic: ${config.graphicId}`);
  }

  const size = ps(frame, config.size);
  return {
    id: componentElementId(componentInstanceId, config.suffix),
    type: "image",
    x: px(frame, config.x),
    y: py(frame, config.y),
    width: size,
    height: size,
    rotation: 0,
    src: "",
    alt: config.alt,
    svgContent,
    svgColor: config.color,
    imageFit: "contain",
    imagePositionX: 50,
    imagePositionY: 50,
    imageZoom: 1,
    imagePrompt: "",
    imageReferenceUrls: [],
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
    imageFit?: "cover" | "contain" | "fill";
    mediaShape?: "rect" | "rounded" | "circle" | "ellipse" | "diamond" | "star";
    mediaCornerRadius?: number;
    svgContent?: string;
    svgColor?: string;
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
    svgContent: config.svgContent,
    svgColor: config.svgColor,
    imageFit: config.imageFit ?? "cover",
    mediaShape: config.mediaShape,
    mediaCornerRadius: config.mediaCornerRadius,
    imagePositionX: 50,
    imagePositionY: 50,
    imageZoom: 1,
    imagePrompt: "",
    imageReferenceUrls: [],
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
    videoFit?: "cover" | "contain" | "fill";
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
    poster: config.poster,
    title: config.title,
    muted: true,
    loop: true,
    videoFit: config.videoFit ?? "cover",
    mediaShape: config.mediaShape,
    mediaCornerRadius: config.mediaCornerRadius,
    videoPositionX: 50,
    videoPositionY: 50,
    videoZoom: 1,
  };
}

function buildMediaSlotElements(
  frame: LayoutFrame,
  componentInstanceId: string,
  slotBindings: PresentationComponentSlotBinding[],
  config: {
    slotId: string;
    suffixBase: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fallbackAlt: string;
    placeholderText: string;
    placeholderColor: string;
    placeholderFontSize: number;
    placeholderFill: string;
    placeholderStroke?: string;
    placeholderStrokeWidth?: number;
    mediaShape?: "rect" | "rounded" | "circle" | "ellipse" | "diamond" | "star";
    mediaCornerRadius?: number;
    placeholderKind?: "image" | "video";
  },
): PresentationSlideElement[] {
  const current = mediaBinding(slotBindings, config.slotId);
  if (current?.src.trim()) {
    if (current.type === "video") {
      return [
        makeVideo(frame, componentInstanceId, {
          suffix: `${config.suffixBase}-video`,
          x: config.x,
          y: config.y,
          width: config.width,
          height: config.height,
          src: current.src,
          poster: current.poster,
          title: current.title || config.fallbackAlt,
          videoFit: "cover",
          mediaShape: config.mediaShape,
          mediaCornerRadius: config.mediaCornerRadius,
        }),
      ];
    }
    return [
      makeImage(frame, componentInstanceId, {
        suffix: `${config.suffixBase}-image`,
        x: config.x,
        y: config.y,
        width: config.width,
        height: config.height,
        src: current.src,
        alt: current.alt || config.fallbackAlt,
        imageFit: "cover",
        mediaShape: config.mediaShape,
        mediaCornerRadius: config.mediaCornerRadius,
      }),
    ];
  }

  const placeholderKind = config.placeholderKind ?? "image";

  return [
    makeRect(frame, componentInstanceId, {
      suffix: `${config.suffixBase}-frame`,
      x: config.x,
      y: config.y,
      width: config.width,
      height: config.height,
      fill: config.placeholderFill,
      stroke: config.placeholderStroke,
      strokeWidth: config.placeholderStrokeWidth,
    }),
    placeholderKind === "video"
      ? makeVideo(frame, componentInstanceId, {
        suffix: `${config.suffixBase}-video`,
        x: config.x,
        y: config.y,
        width: config.width,
        height: config.height,
        src: "",
        title: config.fallbackAlt,
        videoFit: "cover",
        mediaShape: config.mediaShape,
        mediaCornerRadius: config.mediaCornerRadius,
      })
      : makeImage(frame, componentInstanceId, {
        suffix: `${config.suffixBase}-image`,
        x: config.x,
        y: config.y,
        width: config.width,
        height: config.height,
        src: "",
        alt: config.fallbackAlt,
        imageFit: "contain",
        mediaShape: config.mediaShape,
        mediaCornerRadius: config.mediaCornerRadius,
      }),
  ];
}

function defaultSlotBindingsFor(componentId: BuiltInPresentationComponentId): PresentationComponentSlotBinding[] {
  switch (componentId) {
    case "process-steps":
      return [
        { slotId: "title", type: "text", text: "3-Step Process" },
        { slotId: "subtitle", type: "text", text: "A reusable block for tutorials, explainers, and standard operating flows." },
        { slotId: "step1-label", type: "text", text: "Step 01" },
        { slotId: "step1-title", type: "text", text: "Prepare inputs" },
        { slotId: "step1-body", type: "text", text: "Collect the brief, assets, and target outcome before arranging the slide story." },
        { slotId: "step2-label", type: "text", text: "Step 02" },
        { slotId: "step2-title", type: "text", text: "Structure the story" },
        { slotId: "step2-body", type: "text", text: "Split the message into short beats so each slide carries one clear decision or takeaway." },
        { slotId: "step3-label", type: "text", text: "Step 03" },
        { slotId: "step3-title", type: "text", text: "Ship the message" },
        { slotId: "step3-body", type: "text", text: "Use strong visual anchors, then tighten the copy until the sequence feels effortless." },
      ];
    case "timeline-flow":
      return [
        { slotId: "eyebrow", type: "text", text: "Timeline" },
        { slotId: "title", type: "text", text: "Show milestones, launches, or roadmap phases in one balanced flow." },
        { slotId: "subtitle", type: "text", text: "Useful for quarter plans, transformation journeys, product roadmaps, and before-to-after narratives." },
        { slotId: "milestone1-date", type: "text", text: "Q1" },
        { slotId: "milestone1-title", type: "text", text: "Align the brief" },
        { slotId: "milestone1-body", type: "text", text: "Clarify audience, scope, and launch conditions before committing the story." },
        { slotId: "milestone2-date", type: "text", text: "Q2" },
        { slotId: "milestone2-title", type: "text", text: "Build the proof" },
        { slotId: "milestone2-body", type: "text", text: "Create assets, validate the message, and package the strongest evidence." },
        { slotId: "milestone3-date", type: "text", text: "Q3" },
        { slotId: "milestone3-title", type: "text", text: "Scale the rollout" },
        { slotId: "milestone3-body", type: "text", text: "Launch the system, monitor adoption, and tune the narrative around outcomes." },
      ];
    case "timeline-report":
      return [
        { slotId: "eyebrow", type: "text", text: "Timeline Report" },
        { slotId: "title", type: "text", text: "Use this long-form roadmap layout when each phase needs more explanation than a compact milestone card can carry." },
        { slotId: "summary", type: "text", text: "The summary gives the audience the overall arc before they move through the phase-by-phase report and next-step list." },
        { slotId: "phase1-date", type: "text", text: "Q1 2026" },
        { slotId: "phase1-title", type: "text", text: "Discover the bottlenecks" },
        { slotId: "phase1-body", type: "text", text: "Use the first phase for research, context, or the baseline you must establish before the change begins." },
        { slotId: "phase2-date", type: "text", text: "Q2 2026" },
        { slotId: "phase2-title", type: "text", text: "Pilot the workflow" },
        { slotId: "phase2-body", type: "text", text: "Use the second phase for the rollout, validation, or learning loop that turns the idea into a repeatable system." },
        { slotId: "phase3-date", type: "text", text: "Q3 2026" },
        { slotId: "phase3-title", type: "text", text: "Scale and govern" },
        { slotId: "phase3-body", type: "text", text: "Finish with the scale-up phase, ownership model, and the operating rules needed after launch." },
        { slotId: "next-steps-title", type: "text", text: "Next Steps" },
        { slotId: "next-steps", type: "list", items: [
          "Confirm the owners for each phase before the deck goes live",
          "Keep the language specific enough to show progress, not just aspiration",
          "Use the next-step list for the actions that follow this timeline immediately",
        ] },
      ];
    case "feature-highlights":
      return [
        { slotId: "badge", type: "text", text: "Feature Highlights" },
        { slotId: "title", type: "text", text: "A simple block for marketing points, differentiators, or service pillars." },
        { slotId: "feature1-title", type: "text", text: "Metrics first" },
        { slotId: "feature1-body", type: "text", text: "Show impact using one concrete metric and one supporting sentence." },
        { slotId: "feature2-title", type: "text", text: "Human proof" },
        { slotId: "feature2-body", type: "text", text: "Pair the claim with the audience, customer, or team it helps most." },
        { slotId: "feature3-title", type: "text", text: "Fast action" },
        { slotId: "feature3-body", type: "text", text: "End with a clear next move so the slide pushes toward a decision." },
      ];
    case "infographic-grid":
      return [
        { slotId: "eyebrow", type: "text", text: "Framework" },
        { slotId: "title", type: "text", text: "Turn four related ideas into one infographic-style grid." },
        { slotId: "summary", type: "text", text: "Best when each block carries one concept, category, or short explanation with equal weight." },
        { slotId: "item1-title", type: "text", text: "Discover" },
        { slotId: "item1-body", type: "text", text: "Start with the audience problem, constraint, or signal that matters most." },
        { slotId: "item2-title", type: "text", text: "Design" },
        { slotId: "item2-body", type: "text", text: "Convert the insight into a simple system the audience can quickly read." },
        { slotId: "item3-title", type: "text", text: "Deliver" },
        { slotId: "item3-body", type: "text", text: "Package the message into a repeatable slide, workflow, or campaign unit." },
        { slotId: "item4-title", type: "text", text: "Measure" },
        { slotId: "item4-body", type: "text", text: "Finish with the signal that proves the framework is working in practice." },
      ];
    case "stat-cards":
      return [
        { slotId: "eyebrow", type: "text", text: "KPI Snapshot" },
        { slotId: "title", type: "text", text: "Show a few strong numbers before the audience reads the rest of the story." },
        { slotId: "stat1-value", type: "text", text: "42%" },
        { slotId: "stat1-label", type: "text", text: "Conversion lift after launch" },
        { slotId: "stat2-value", type: "text", text: "12d" },
        { slotId: "stat2-label", type: "text", text: "Average time to first win" },
        { slotId: "stat3-value", type: "text", text: "3.1x" },
        { slotId: "stat3-label", type: "text", text: "Return on campaign spend" },
      ];
    case "sectioned-explainer":
      return [
        { slotId: "eyebrow", type: "text", text: "Sectioned Explainer" },
        { slotId: "title", type: "text", text: "Use this long-form layout when one slide still needs structured explanation, not compact cards." },
        { slotId: "intro", type: "text", text: "The intro panel can carry a longer setup paragraph, context, or reader framing before the audience moves into the section-by-section detail.", },
        { slotId: "section1-heading", type: "text", text: "What usually goes wrong" },
        { slotId: "section1-body", type: "text", text: "Use the first section for the most important explanation, common mistake, or audience concern that needs nuance." },
        { slotId: "section2-heading", type: "text", text: "Who this applies to" },
        { slotId: "section2-body", type: "text", text: "Use the second section for audience scope, criteria, or the context readers need before acting on the advice." },
        { slotId: "section3-heading", type: "text", text: "What to do next" },
        { slotId: "section3-body", type: "text", text: "Finish with the practical recommendation, checklist, or interpretation that turns the dense copy into a usable decision." },
        { slotId: "takeaways-title", type: "text", text: "Key Takeaways" },
        { slotId: "takeaways", type: "list", items: [
          "Supports longer Thai and English explanatory copy without squeezing it into three-card marketing layouts",
          "Keeps the copy editable as structured slots instead of flattening everything into one text box",
          "Works for guides, article-style explainers, FAQ summaries, and educational slides",
        ] },
      ];
    case "profile-summary":
      return [
        { slotId: "portrait", type: "image", src: "", alt: "Portrait" },
        { slotId: "name", type: "text", text: "Adora Montminy" },
        { slotId: "role", type: "text", text: "Marketing / Digital" },
        { slotId: "contact-title", type: "text", text: "CONTACT" },
        { slotId: "contact-items", type: "list", items: ["123 Anywhere St.", "hello@company.com", "+66 123 456 789"] },
        { slotId: "about-title", type: "text", text: "About This Speaker" },
        { slotId: "about-body", type: "text", text: "Use this block for bio slides, speaker intros, team profiles, or resume-style summaries." },
        { slotId: "highlights-title", type: "text", text: "Highlights" },
        { slotId: "highlights-items", type: "list", items: [
          "Bilingual communicator with cross-channel campaign experience",
          "Strong fit for speaker, mentor, or candidate overview slides",
          "Works well with contact details, achievements, and CTA rows",
        ] },
      ];
    case "quote-callout":
      return [
        { slotId: "quote", type: "text", text: "\"Lead with one idea per slide and let the visual support the sentence, not fight it.\"" },
        { slotId: "eyebrow", type: "text", text: "Editorial Callout" },
        { slotId: "attribution", type: "text", text: "Use for testimonials, opinion slides, quotes, or narrative breaks." },
      ];
    case "video-spotlight":
      return [
        { slotId: "tag", type: "text", text: "Video Spotlight" },
        { slotId: "headline", type: "text", text: "Pair one short message with one strong clip." },
        { slotId: "body", type: "text", text: "Use this for promos, feature reveals, product demos, or narrative slides where motion is the primary proof." },
        { slotId: "clip", type: "video", src: "", poster: "", title: "Promo clip" },
        { slotId: "benefits", type: "list", items: [
          "Keep the headline short so the clip stays dominant",
          "Use the supporting list for benefits, cues, or CTA bullets",
          "Works with autoplay muted preview and exported motion",
        ] },
      ];
    case "poster-spotlight":
      return [
        { slotId: "eyebrow", type: "text", text: "Campaign Spotlight" },
        { slotId: "headline", type: "text", text: "Make one strong promise and let the image carry the emotion." },
        { slotId: "subhead", type: "text", text: "This layout works well for launches, promos, membership offers, and bold announcement slides." },
        { slotId: "hero", type: "image", src: "", alt: "Hero visual" },
        { slotId: "benefits", type: "list", items: [
          "Lead with one audience-facing benefit",
          "Keep the copy short enough to feel poster-like",
          "Use the CTA badge for the next step or offer",
        ] },
        { slotId: "cta", type: "text", text: "Book a free consult" },
      ];
    case "framed-image-story":
      return [
        { slotId: "kicker", type: "text", text: "Editorial Story" },
        { slotId: "headline", type: "text", text: "Combine one framed image with a short story and a crisp takeaway." },
        { slotId: "story", type: "text", text: "Use this for explainers, case studies, campaign retrospectives, or slides where the visual sets context before the details." },
        { slotId: "photo", type: "image", src: "", alt: "Story image" },
        { slotId: "caption", type: "text", text: "Caption or source line" },
        { slotId: "highlights", type: "list", items: [
          "Editorial feel with stronger visual framing",
          "Works well for explainers and case studies",
          "Keeps one image and one narrative block in balance",
        ] },
      ];
    case "article-focus":
      return [
        { slotId: "eyebrow", type: "text", text: "Article" },
        { slotId: "title", type: "text", text: "Use this layout for long-form narrative content that needs a single flowing article feel." },
        { slotId: "lead", type: "text", text: "The lead paragraph sets the tone. Use it for the opening context, a hook, or the key question the article addresses." },
        { slotId: "body", type: "text", text: "The main body carries the bulk of the narrative. This slot supports longer text passages — guides, analyses, editorials — without forcing content into cards or bullet grids." },
        { slotId: "key-points-title", type: "text", text: "Key Points" },
        { slotId: "key-points", type: "list", items: [
          "Ideal for guides, editorials, and long-form explainers",
          "Keeps narrative flow intact instead of fragmenting into cards",
          "Key points sidebar provides scannable takeaways",
        ] },
        { slotId: "footnote", type: "text", text: "" },
      ];
    case "two-column-article":
      return [
        { slotId: "eyebrow", type: "text", text: "Editorial Report" },
        { slotId: "title", type: "text", text: "Use this layout when two strong sections need to sit side by side without collapsing into small cards." },
        { slotId: "intro", type: "text", text: "The intro frames the topic before the audience moves into the two-column comparison, article split, or report-style explanation." },
        { slotId: "left-title", type: "text", text: "Section One" },
        { slotId: "left-body", type: "text", text: "Use the left column for the first major section, context block, or historical phase that needs fuller paragraph treatment." },
        { slotId: "right-title", type: "text", text: "Section Two" },
        { slotId: "right-body", type: "text", text: "Use the right column for the second major section, response, implication, or current-state interpretation of the same topic." },
        { slotId: "takeaways-title", type: "text", text: "Key Takeaways" },
        { slotId: "takeaways", type: "list", items: [
          "Works for report-style slides with two dominant sections",
          "Keeps longer article copy editable instead of flattening it into one text box",
          "Adds a takeaway strip for the points the audience should remember",
        ] },
      ];
    case "faq-stack":
      return [
        { slotId: "eyebrow", type: "text", text: "FAQ" },
        { slotId: "title", type: "text", text: "Use this layout when the slide should answer a few big audience questions without collapsing into tiny cards." },
        { slotId: "intro", type: "text", text: "The intro frames the theme before the audience scans the question-and-answer stack below." },
        { slotId: "faq1-question", type: "text", text: "Why does this issue happen so often?" },
        { slotId: "faq1-answer", type: "text", text: "Use the first answer for the root cause, context, or misconception that needs the clearest explanation." },
        { slotId: "faq2-question", type: "text", text: "What should the audience do first?" },
        { slotId: "faq2-answer", type: "text", text: "Use the second answer for the first practical move, decision rule, or recommended sequence." },
        { slotId: "faq3-question", type: "text", text: "When should someone ask for more help?" },
        { slotId: "faq3-answer", type: "text", text: "Finish with the boundary case, warning sign, or next-step guidance that turns the explanation into an action plan." },
      ];
    case "profile-board":
      return [
        { slotId: "name", type: "text", text: "Jordan Rivera" },
        { slotId: "role", type: "text", text: "Product Design Lead" },
        { slotId: "portrait", type: "image", src: "", alt: "Portrait" },
        { slotId: "bio-title", type: "text", text: "About" },
        { slotId: "bio-body", type: "text", text: "Use this block for structured bio slides, team profiles, or resume-style summaries with experience, skills, and contact details." },
        { slotId: "experience-title", type: "text", text: "Experience" },
        { slotId: "experience-items", type: "list", items: ["Senior Designer, Acme Inc.", "Lead UX, StartupCo", "Design Intern, BigCorp"] },
        { slotId: "skills-title", type: "text", text: "Skills" },
        { slotId: "skills-items", type: "list", items: ["Figma", "User Research", "Design Systems", "Prototyping", "A/B Testing"] },
        { slotId: "contact-title", type: "text", text: "Contact" },
        { slotId: "contact-items", type: "list", items: ["jordan@example.com", "+1 555 123 4567", "linkedin.com/in/jordan"] },
      ];
    case "photo-collage":
      return [
        { slotId: "kicker", type: "text", text: "Photo Story" },
        { slotId: "headline", type: "text", text: "Pair two related visuals with a short editorial-style narrative." },
        { slotId: "body", type: "text", text: "Use this for lookbooks, campaign moodboards, event recaps, or slides where one supporting detail image changes the story." },
        { slotId: "primary-photo", type: "image", src: "", alt: "Primary photo" },
        { slotId: "secondary-photo", type: "image", src: "", alt: "Secondary photo" },
        { slotId: "caption", type: "text", text: "Caption, source line, or supporting detail" },
      ];
    case "a4-photo-grid":
      return [
        { slotId: "eyebrow", type: "text", text: "Multi Photo Board" },
        { slotId: "headline", type: "text", text: "Show one strong hero image with four supporting details in a full-page portrait board." },
        { slotId: "summary", type: "text", text: "Use this for property sheets, travel recaps, product flyers, or moodboards where the page should feel like an editorial A4 poster instead of a floating card." },
        { slotId: "hero-photo", type: "image", src: "", alt: "Hero photo" },
        { slotId: "detail-photo-1", type: "image", src: "", alt: "Detail photo 1" },
        { slotId: "detail-photo-2", type: "image", src: "", alt: "Detail photo 2" },
        { slotId: "detail-photo-3", type: "image", src: "", alt: "Detail photo 3" },
        { slotId: "detail-photo-4", type: "image", src: "", alt: "Detail photo 4" },
        { slotId: "caption", type: "text", text: "Use the footer caption for contact, CTA, or one concise source line." },
      ];
    case "landscape-photo-story":
      return [
        { slotId: "eyebrow", type: "text", text: "Landscape Showcase" },
        { slotId: "headline", type: "text", text: "Use one dominant image plus three supporting photos in a clean 16:9 editorial board." },
        { slotId: "body", type: "text", text: "This layout suits case studies, interior lookbooks, property overviews, and product storytelling when the page should feel composed instead of stacking overlay cards on top of a background image." },
        { slotId: "hero-photo", type: "image", src: "", alt: "Hero photo" },
        { slotId: "detail-photo-1", type: "image", src: "", alt: "Supporting photo 1" },
        { slotId: "detail-photo-2", type: "image", src: "", alt: "Supporting photo 2" },
        { slotId: "detail-photo-3", type: "image", src: "", alt: "Supporting photo 3" },
        { slotId: "highlights-title", type: "text", text: "Highlights" },
        { slotId: "highlights", type: "list", items: [
          "Use the hero for the main establishing shot",
          "Keep the three detail frames visually distinct",
          "Use the highlight list for short features or selling points",
        ] },
      ];
  }
}

function buildProcessStepsComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const cards = [
    { y: 188, icon: "briefcase", labelSlot: "step1-label", titleSlot: "step1-title", bodySlot: "step1-body", color: "#f59e0b" },
    { y: 314, icon: "presentation-chart", labelSlot: "step2-label", titleSlot: "step2-title", bodySlot: "step2-body", color: "#0ea5e9" },
    { y: 440, icon: "rocket-launch", labelSlot: "step3-label", titleSlot: "step3-title", bodySlot: "step3-body", color: "#ef4444" },
  ] as const;

  return [
    makeText(frame, options.instanceId, {
      suffix: "title",
      x: 168,
      y: 72,
      width: 760,
      height: 76,
      text: textBinding(slotBindings, "title", "3-Step Process"),
      color: "#102a43",
      fontSize: 50,
      fontWeight: "700",
    }),
    makeText(frame, options.instanceId, {
      suffix: "subtitle",
      x: 168,
      y: 132,
      width: 780,
      height: 40,
      text: textBinding(slotBindings, "subtitle", ""),
      color: "#475569",
      fontSize: 22,
      fontWeight: "500",
    }),
    ...cards.flatMap((card, index) => ([
      makeRect(frame, options.instanceId, {
        suffix: `card-${index + 1}-bg`,
        x: 168,
        y: card.y,
        width: 944,
        height: 108,
        fill: "rgba(255,248,235,0.96)",
        stroke: "#d6b58d",
        strokeWidth: 3,
      }),
      makeSvgGraphic(frame, options.instanceId, {
        suffix: `card-${index + 1}-icon`,
        x: 196,
        y: card.y + 20,
        size: 56,
        graphicId: card.icon,
        alt: textBinding(slotBindings, card.titleSlot, ""),
        color: card.color,
      }),
      makeText(frame, options.instanceId, {
        suffix: `card-${index + 1}-label`,
        x: 278,
        y: card.y + 18,
        width: 180,
        height: 30,
        text: textBinding(slotBindings, card.labelSlot, ""),
        color: card.color,
        fontSize: 24,
        fontWeight: "700",
      }),
      makeText(frame, options.instanceId, {
        suffix: `card-${index + 1}-title`,
        x: 278,
        y: card.y + 42,
        width: 320,
        height: 40,
        text: textBinding(slotBindings, card.titleSlot, ""),
        color: "#102a43",
        fontSize: 28,
        fontWeight: "700",
      }),
      makeText(frame, options.instanceId, {
        suffix: `card-${index + 1}-body`,
        x: 612,
        y: card.y + 22,
        width: 460,
        height: 60,
        text: textBinding(slotBindings, card.bodySlot, ""),
        color: "#475569",
        fontSize: 18,
        fontWeight: "500",
        lineHeight: 1.35,
      }),
    ])),
  ];
}

function buildTimelineFlowComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const milestones = [
    { x: 140, color: "#0ea5e9", dateSlot: "milestone1-date", titleSlot: "milestone1-title", bodySlot: "milestone1-body" },
    { x: 470, color: "#14b8a6", dateSlot: "milestone2-date", titleSlot: "milestone2-title", bodySlot: "milestone2-body" },
    { x: 800, color: "#8b5cf6", dateSlot: "milestone3-date", titleSlot: "milestone3-title", bodySlot: "milestone3-body" },
  ] as const;

  return [
    makeRect(frame, options.instanceId, {
      suffix: "eyebrow-bg",
      x: 140,
      y: 88,
      width: 180,
      height: 40,
      fill: "#e0f2fe",
      stroke: "#7dd3fc",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "eyebrow",
      x: 160,
      y: 96,
      width: 140,
      height: 24,
      text: textBinding(slotBindings, "eyebrow", ""),
      color: "#0369a1",
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "title",
      x: 140,
      y: 150,
      width: 760,
      height: 70,
      text: textBinding(slotBindings, "title", ""),
      color: "#0f172a",
      fontSize: 44,
      fontWeight: "700",
      lineHeight: 1.12,
    }),
    makeText(frame, options.instanceId, {
      suffix: "subtitle",
      x: 140,
      y: 224,
      width: 760,
      height: 46,
      text: textBinding(slotBindings, "subtitle", ""),
      color: "#475569",
      fontSize: 20,
      fontWeight: "500",
      lineHeight: 1.35,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "timeline-line",
      x: 210,
      y: 356,
      width: 700,
      height: 6,
      fill: "#cbd5e1",
    }),
    ...milestones.flatMap((milestone, index) => ([
      makeRect(frame, options.instanceId, {
        suffix: `milestone-${index + 1}-marker`,
        x: milestone.x + 44,
        y: 338,
        width: 20,
        height: 20,
        fill: milestone.color,
      }),
      makeRect(frame, options.instanceId, {
        suffix: `milestone-${index + 1}-date-pill`,
        x: milestone.x,
        y: 386,
        width: 108,
        height: 34,
        fill: "#ffffff",
        stroke: milestone.color,
        strokeWidth: 2,
      }),
      makeText(frame, options.instanceId, {
        suffix: `milestone-${index + 1}-date`,
        x: milestone.x + 12,
        y: 394,
        width: 84,
        height: 18,
        text: textBinding(slotBindings, milestone.dateSlot, ""),
        color: milestone.color,
        fontSize: 18,
        fontWeight: "700",
        textAlign: "center",
      }),
      makeText(frame, options.instanceId, {
        suffix: `milestone-${index + 1}-title`,
        x: milestone.x,
        y: 434,
        width: 230,
        height: 40,
        text: textBinding(slotBindings, milestone.titleSlot, ""),
        color: "#0f172a",
        fontSize: 28,
        fontWeight: "700",
      }),
      makeText(frame, options.instanceId, {
        suffix: `milestone-${index + 1}-body`,
        x: milestone.x,
        y: 480,
        width: 240,
        height: 58,
        text: textBinding(slotBindings, milestone.bodySlot, ""),
        color: "#475569",
        fontSize: 18,
        fontWeight: "500",
        lineHeight: 1.35,
      }),
    ])),
  ];
}

function buildTimelineReportComponent(
  options: BuildComponentInstanceOptions,
  slotBindings: PresentationComponentSlotBinding[],
): PresentationSlideElement[] {
  if (isPortraitCanvas(options.canvas)) {
    const frame = getPortraitDocumentFrame(options.canvas);
    const titleFit = fitTextBox({
      text: textBinding(slotBindings, "title", ""),
      width: 884, height: 108, baseFontSize: 48, minFontSize: 29, lineHeight: 1.06, maxLines: 3,
    });
    const summaryFit = fitTextBox({
      text: textBinding(slotBindings, "summary", ""),
      width: 884, height: 112, baseFontSize: 22, minFontSize: 14, lineHeight: 1.36, maxLines: 5,
    });
    const nextStepsFit = fitListTextBox({
      items: listBinding(slotBindings, "next-steps", []),
      width: 812, height: 108, baseFontSize: 18, minFontSize: 12, lineHeight: 1.42, maxLines: 6, bulletPrefix: "• ",
    });
    const phases = [
      { y: 430, accent: "#2563eb", dateSlot: "phase1-date", titleSlot: "phase1-title", bodySlot: "phase1-body" },
      { y: 632, accent: "#0f766e", dateSlot: "phase2-date", titleSlot: "phase2-title", bodySlot: "phase2-body" },
      { y: 834, accent: "#7c3aed", dateSlot: "phase3-date", titleSlot: "phase3-title", bodySlot: "phase3-body" },
    ] as const;

    return [
      makeRect(frame, options.instanceId, {
        suffix: "canvas-bg",
        x: 0,
        y: 0,
        width: PORTRAIT_LAYOUT_WIDTH,
        height: PORTRAIT_LAYOUT_HEIGHT,
        fill: "#FFFFFF",
      }),
      makeRect(frame, options.instanceId, {
        suffix: "eyebrow-bg",
        x: 58,
        y: 54,
        width: 218,
        height: 44,
        fill: "#DBEAFE",
      }),
      makeText(frame, options.instanceId, {
        suffix: "eyebrow",
        x: 86,
        y: 66,
        width: 162,
        height: 18,
        text: textBinding(slotBindings, "eyebrow", ""),
        color: "#2563EB",
        fontSize: 18,
        fontWeight: "700",
        textAlign: "center",
      }),
      makeText(frame, options.instanceId, {
        suffix: "title",
        x: 58,
        y: 126,
        width: 884,
        height: 108,
        text: titleFit.text,
        color: "#0F172A",
        fontSize: titleFit.fontSize,
        fontWeight: "700",
        lineHeight: 1.06,
      }),
      makeText(frame, options.instanceId, {
        suffix: "summary",
        x: 58,
        y: 258,
        width: 884,
        height: 112,
        text: summaryFit.text,
        color: "#475569",
        fontSize: summaryFit.fontSize,
        fontWeight: "500",
        lineHeight: 1.36,
      }),
      makeRect(frame, options.instanceId, {
        suffix: "timeline-line",
        x: 128,
        y: 436,
        width: 6,
        height: 618,
        fill: "#CBD5E1",
      }),
      ...phases.flatMap((phase, index) => {
        const phaseTitleFit = fitTextBox({
          text: textBinding(slotBindings, phase.titleSlot, ""),
          width: 678, height: 48, baseFontSize: 28, minFontSize: 17, lineHeight: 1.14, maxLines: 2,
        });
        const phaseBodyFit = fitTextBox({
          text: textBinding(slotBindings, phase.bodySlot, ""),
          width: 678, height: 116, baseFontSize: 19, minFontSize: 12, lineHeight: 1.4, maxLines: 6,
        });
        return [
          makeRect(frame, options.instanceId, {
            suffix: `phase-${index + 1}-date-bg`,
            x: 96,
            y: phase.y,
            width: 70,
            height: 70,
            fill: phase.accent,
          }),
          makeText(frame, options.instanceId, {
            suffix: `phase-${index + 1}-date`,
            x: 78,
            y: phase.y + 84,
            width: 108,
            height: 34,
            text: textBinding(slotBindings, phase.dateSlot, ""),
            color: phase.accent,
            fontSize: 16,
            fontWeight: "700",
            textAlign: "center",
          }),
          makeText(frame, options.instanceId, {
            suffix: `phase-${index + 1}-title`,
            x: 216,
            y: phase.y + 4,
            width: 678,
            height: 48,
            text: phaseTitleFit.text,
            color: "#0F172A",
            fontSize: phaseTitleFit.fontSize,
            fontWeight: "700",
            lineHeight: 1.14,
          }),
          makeText(frame, options.instanceId, {
            suffix: `phase-${index + 1}-body`,
            x: 216,
            y: phase.y + 62,
            width: 678,
            height: 116,
            text: phaseBodyFit.text,
            color: "#334155",
            fontSize: phaseBodyFit.fontSize,
            fontWeight: "500",
            lineHeight: 1.4,
          }),
        ];
      }),
      makeRect(frame, options.instanceId, {
        suffix: "next-steps-card",
        x: 58,
        y: 1128,
        width: 884,
        height: 216,
        fill: "#EFF6FF",
      }),
      makeText(frame, options.instanceId, {
        suffix: "next-steps-title",
        x: 94,
        y: 1164,
        width: 220,
        height: 28,
        text: textBinding(slotBindings, "next-steps-title", ""),
        color: "#1D4ED8",
        fontSize: 22,
        fontWeight: "700",
      }),
      makeText(frame, options.instanceId, {
        suffix: "next-steps",
        x: 94,
        y: 1212,
        width: 812,
        height: 108,
        text: nextStepsFit.text,
        color: "#334155",
        fontSize: nextStepsFit.fontSize,
        fontWeight: "500",
        lineHeight: 1.42,
      }),
    ];
  }
  const frame = getLayoutFrame(options.canvas);
  const phases = [
    { y: 266, accent: "#2563eb", dateSlot: "phase1-date", titleSlot: "phase1-title", bodySlot: "phase1-body" },
    { y: 404, accent: "#0f766e", dateSlot: "phase2-date", titleSlot: "phase2-title", bodySlot: "phase2-body" },
    { y: 542, accent: "#7c3aed", dateSlot: "phase3-date", titleSlot: "phase3-title", bodySlot: "phase3-body" },
  ] as const;
  const nextSteps = listBinding(slotBindings, "next-steps", [])
    .map((item) => `• ${item}`)
    .join("\n");

  return [
    makeRect(frame, options.instanceId, {
      suffix: "canvas-bg",
      x: 52,
      y: 28,
      width: 1176,
      height: 664,
      fill: "#ffffff",
      stroke: "#cbd5e1",
      strokeWidth: 2,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "eyebrow-bg",
      x: 84,
      y: 54,
      width: 168,
      height: 34,
      fill: "#dbeafe",
      stroke: "#93c5fd",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "eyebrow",
      x: 102,
      y: 62,
      width: 132,
      height: 18,
      text: textBinding(slotBindings, "eyebrow", ""),
      color: "#2563eb",
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "title",
      x: 84,
      y: 104,
      width: 760,
      height: 74,
      text: textBinding(slotBindings, "title", ""),
      color: "#0f172a",
      fontSize: 38,
      fontWeight: "700",
      lineHeight: 1.14,
    }),
    makeText(frame, options.instanceId, {
      suffix: "summary",
      x: 84,
      y: 188,
      width: 760,
      height: 62,
      text: textBinding(slotBindings, "summary", ""),
      color: "#475569",
      fontSize: 19,
      fontWeight: "500",
      lineHeight: 1.4,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "next-steps-card",
      x: 904,
      y: 104,
      width: 276,
      height: 522,
      fill: "#eff6ff",
      stroke: "#bfdbfe",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "next-steps-title",
      x: 930,
      y: 128,
      width: 224,
      height: 22,
      text: textBinding(slotBindings, "next-steps-title", ""),
      color: "#1d4ed8",
      fontSize: 20,
      fontWeight: "700",
    }),
    makeText(frame, options.instanceId, {
      suffix: "next-steps",
      x: 930,
      y: 166,
      width: 216,
      height: 430,
      text: nextSteps,
      color: "#334155",
      fontSize: 17,
      fontWeight: "500",
      lineHeight: 1.42,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "timeline-line",
      x: 138,
      y: 292,
      width: 4,
      height: 350,
      fill: "#cbd5e1",
    }),
    ...phases.flatMap((phase, index) => ([
      makeRect(frame, options.instanceId, {
        suffix: `phase-${index + 1}-marker`,
        x: 128,
        y: phase.y + 18,
        width: 24,
        height: 24,
        fill: phase.accent,
      }),
      makeRect(frame, options.instanceId, {
        suffix: `phase-${index + 1}-date-bg`,
        x: 176,
        y: phase.y,
        width: 118,
        height: 32,
        fill: "#ffffff",
        stroke: phase.accent,
        strokeWidth: 2,
      }),
      makeText(frame, options.instanceId, {
        suffix: `phase-${index + 1}-date`,
        x: 188,
        y: phase.y + 8,
        width: 94,
        height: 16,
        text: textBinding(slotBindings, phase.dateSlot, ""),
        color: phase.accent,
        fontSize: 16,
        fontWeight: "700",
        textAlign: "center",
      }),
      makeText(frame, options.instanceId, {
        suffix: `phase-${index + 1}-title`,
        x: 314,
        y: phase.y - 2,
        width: 520,
        height: 30,
        text: textBinding(slotBindings, phase.titleSlot, ""),
        color: "#0f172a",
        fontSize: 24,
        fontWeight: "700",
        lineHeight: 1.2,
      }),
      makeText(frame, options.instanceId, {
        suffix: `phase-${index + 1}-body`,
        x: 314,
        y: phase.y + 38,
        width: 520,
        height: 76,
        text: textBinding(slotBindings, phase.bodySlot, ""),
        color: "#475569",
        fontSize: 18,
        fontWeight: "500",
        lineHeight: 1.4,
      }),
    ])),
  ];
}

function buildFeatureHighlightsComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const features = [
    { x: 140, icon: "chart-bar", titleSlot: "feature1-title", bodySlot: "feature1-body", color: "#0f766e" },
    { x: 455, icon: "users", titleSlot: "feature2-title", bodySlot: "feature2-body", color: "#2563eb" },
    { x: 770, icon: "rocket-launch", titleSlot: "feature3-title", bodySlot: "feature3-body", color: "#7c3aed" },
  ] as const;

  return [
    makeRect(frame, options.instanceId, {
      suffix: "badge-bg",
      x: 140,
      y: 92,
      width: 208,
      height: 40,
      fill: "#dbeafe",
      stroke: "#93c5fd",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "badge-text",
      x: 160,
      y: 100,
      width: 180,
      height: 24,
      text: textBinding(slotBindings, "badge", ""),
      color: "#1d4ed8",
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "title",
      x: 140,
      y: 158,
      width: 820,
      height: 104,
      text: textBinding(slotBindings, "title", ""),
      color: "#0f172a",
      fontSize: 44,
      fontWeight: "700",
      lineHeight: 1.12,
    }),
    ...features.flatMap((feature, index) => ([
      makeRect(frame, options.instanceId, {
        suffix: `feature-${index + 1}-bg`,
        x: feature.x,
        y: 292,
        width: 260,
        height: 252,
        fill: "rgba(255,255,255,0.94)",
        stroke: "#cbd5e1",
        strokeWidth: 3,
      }),
      makeSvgGraphic(frame, options.instanceId, {
        suffix: `feature-${index + 1}-icon`,
        x: feature.x + 28,
        y: 324,
        size: 52,
        graphicId: feature.icon,
        alt: textBinding(slotBindings, feature.titleSlot, ""),
        color: feature.color,
      }),
      makeText(frame, options.instanceId, {
        suffix: `feature-${index + 1}-title`,
        x: feature.x + 28,
        y: 396,
        width: 200,
        height: 40,
        text: textBinding(slotBindings, feature.titleSlot, ""),
        color: "#0f172a",
        fontSize: 28,
        fontWeight: "700",
      }),
      makeText(frame, options.instanceId, {
        suffix: `feature-${index + 1}-body`,
        x: feature.x + 28,
        y: 440,
        width: 204,
        height: 76,
        text: textBinding(slotBindings, feature.bodySlot, ""),
        color: "#475569",
        fontSize: 19,
        fontWeight: "500",
        lineHeight: 1.35,
      }),
    ])),
  ];
}

function buildInfographicGridComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const items = [
    { x: 140, y: 306, color: "#f59e0b", titleSlot: "item1-title", bodySlot: "item1-body" },
    { x: 498, y: 306, color: "#0ea5e9", titleSlot: "item2-title", bodySlot: "item2-body" },
    { x: 140, y: 474, color: "#10b981", titleSlot: "item3-title", bodySlot: "item3-body" },
    { x: 498, y: 474, color: "#8b5cf6", titleSlot: "item4-title", bodySlot: "item4-body" },
  ] as const;

  return [
    makeRect(frame, options.instanceId, {
      suffix: "eyebrow-bg",
      x: 140,
      y: 88,
      width: 168,
      height: 40,
      fill: "#ede9fe",
      stroke: "#c4b5fd",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "eyebrow",
      x: 158,
      y: 96,
      width: 132,
      height: 24,
      text: textBinding(slotBindings, "eyebrow", ""),
      color: "#6d28d9",
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "title",
      x: 140,
      y: 150,
      width: 760,
      height: 72,
      text: textBinding(slotBindings, "title", ""),
      color: "#0f172a",
      fontSize: 44,
      fontWeight: "700",
      lineHeight: 1.12,
    }),
    makeText(frame, options.instanceId, {
      suffix: "summary",
      x: 140,
      y: 226,
      width: 780,
      height: 44,
      text: textBinding(slotBindings, "summary", ""),
      color: "#475569",
      fontSize: 20,
      fontWeight: "500",
      lineHeight: 1.35,
    }),
    ...items.flatMap((item, index) => ([
      makeRect(frame, options.instanceId, {
        suffix: `item-${index + 1}-card`,
        x: item.x,
        y: item.y,
        width: 302,
        height: 132,
        fill: "rgba(255,255,255,0.96)",
        stroke: item.color,
        strokeWidth: 3,
      }),
      makeRect(frame, options.instanceId, {
        suffix: `item-${index + 1}-accent`,
        x: item.x,
        y: item.y,
        width: 302,
        height: 12,
        fill: item.color,
      }),
      makeText(frame, options.instanceId, {
        suffix: `item-${index + 1}-title`,
        x: item.x + 26,
        y: item.y + 30,
        width: 220,
        height: 34,
        text: textBinding(slotBindings, item.titleSlot, ""),
        color: "#0f172a",
        fontSize: 26,
        fontWeight: "700",
      }),
      makeText(frame, options.instanceId, {
        suffix: `item-${index + 1}-body`,
        x: item.x + 26,
        y: item.y + 72,
        width: 236,
        height: 42,
        text: textBinding(slotBindings, item.bodySlot, ""),
        color: "#475569",
        fontSize: 18,
        fontWeight: "500",
        lineHeight: 1.35,
      }),
    ])),
  ];
}

function buildStatCardsComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const stats = [
    { x: 132, valueSlot: "stat1-value", labelSlot: "stat1-label", color: "#2563eb", icon: "chart-bar" },
    { x: 435, valueSlot: "stat2-value", labelSlot: "stat2-label", color: "#0f766e", icon: "presentation-chart" },
    { x: 738, valueSlot: "stat3-value", labelSlot: "stat3-label", color: "#7c3aed", icon: "rocket-launch" },
  ] as const;

  return [
    makeRect(frame, options.instanceId, {
      suffix: "eyebrow-bg",
      x: 132,
      y: 92,
      width: 216,
      height: 40,
      fill: "#eff6ff",
      stroke: "#93c5fd",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "eyebrow",
      x: 152,
      y: 100,
      width: 176,
      height: 24,
      text: textBinding(slotBindings, "eyebrow", ""),
      color: "#1d4ed8",
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "title",
      x: 132,
      y: 156,
      width: 820,
      height: 88,
      text: textBinding(slotBindings, "title", ""),
      color: "#0f172a",
      fontSize: 44,
      fontWeight: "700",
      lineHeight: 1.1,
    }),
    ...stats.flatMap((stat, index) => ([
      makeRect(frame, options.instanceId, {
        suffix: `stat-${index + 1}-card`,
        x: stat.x,
        y: 306,
        width: 248,
        height: 224,
        fill: "rgba(255,255,255,0.95)",
        stroke: "#cbd5e1",
        strokeWidth: 3,
      }),
      makeSvgGraphic(frame, options.instanceId, {
        suffix: `stat-${index + 1}-icon`,
        x: stat.x + 28,
        y: 330,
        size: 44,
        graphicId: stat.icon,
        alt: textBinding(slotBindings, stat.labelSlot, ""),
        color: stat.color,
      }),
      makeText(frame, options.instanceId, {
        suffix: `stat-${index + 1}-value`,
        x: stat.x + 28,
        y: 394,
        width: 192,
        height: 52,
        text: textBinding(slotBindings, stat.valueSlot, ""),
        color: stat.color,
        fontSize: 46,
        fontWeight: "700",
      }),
      makeText(frame, options.instanceId, {
        suffix: `stat-${index + 1}-label`,
        x: stat.x + 28,
        y: 460,
        width: 192,
        height: 44,
        text: textBinding(slotBindings, stat.labelSlot, ""),
        color: "#475569",
        fontSize: 20,
        fontWeight: "500",
        lineHeight: 1.35,
      }),
    ])),
  ];
}

function buildProfileSummaryComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const portrait = imageBinding(slotBindings, "portrait", { src: "", alt: "Portrait" });
  const contactItems = listBinding(slotBindings, "contact-items", []);
  const highlightItems = listBinding(slotBindings, "highlights-items", []);
  const portraitFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["profile-summary"]?.portrait;

  const portraitElements = portrait.src.trim()
    ? [
      makeImage(frame, options.instanceId, {
        suffix: "portrait-image",
        x: 180,
        y: 140,
        width: 200,
        height: 180,
        src: portrait.src,
        alt: portrait.alt,
        imageFit: "cover",
        mediaShape: portraitFrameStyle?.mediaShape,
        mediaCornerRadius: portraitFrameStyle?.mediaCornerRadius,
      }),
    ]
    : [
      makeRect(frame, options.instanceId, {
        suffix: "portrait-frame",
        x: 180,
        y: 140,
        width: 200,
        height: 180,
        fill: "#27476c",
        stroke: "#7dd3fc",
        strokeWidth: 2,
      }),
      makeSvgGraphic(frame, options.instanceId, {
        suffix: "portrait-placeholder",
        x: 214,
        y: 166,
        size: 128,
        graphicId: "users",
        alt: portrait.alt,
        color: "#f8fafc",
      }),
    ];

  return [
    makeRect(frame, options.instanceId, {
      suffix: "sidebar-bg",
      x: 126,
      y: 104,
      width: 304,
      height: 500,
      fill: "#1e3a5f",
      stroke: "#4b6b8b",
      strokeWidth: 3,
    }),
    ...portraitElements,
    makeText(frame, options.instanceId, {
      suffix: "name",
      x: 158,
      y: 332,
      width: 240,
      height: 42,
      text: textBinding(slotBindings, "name", ""),
      color: "#f8fafc",
      fontSize: 32,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeRect(frame, options.instanceId, {
      suffix: "role-bg",
      x: 168,
      y: 388,
      width: 220,
      height: 40,
      fill: "#f4d58d",
      stroke: "#eab308",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "role",
      x: 180,
      y: 396,
      width: 196,
      height: 24,
      text: textBinding(slotBindings, "role", ""),
      color: "#334155",
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "contact-title",
      x: 168,
      y: 454,
      width: 220,
      height: 24,
      text: textBinding(slotBindings, "contact-title", ""),
      color: "#bfdbfe",
      fontSize: 18,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "contact-items",
      x: 166,
      y: 486,
      width: 224,
      height: 88,
      text: contactItems.join("\n"),
      color: "#e2e8f0",
      fontSize: 18,
      fontWeight: "500",
      textAlign: "center",
      lineHeight: 1.45,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "about-bg",
      x: 478,
      y: 104,
      width: 676,
      height: 180,
      fill: "rgba(255,255,255,0.96)",
      stroke: "#cbd5e1",
      strokeWidth: 3,
    }),
    makeText(frame, options.instanceId, {
      suffix: "about-title",
      x: 522,
      y: 138,
      width: 580,
      height: 48,
      text: textBinding(slotBindings, "about-title", ""),
      color: "#0f172a",
      fontSize: 36,
      fontWeight: "700",
    }),
    makeText(frame, options.instanceId, {
      suffix: "about-body",
      x: 522,
      y: 190,
      width: 574,
      height: 62,
      text: textBinding(slotBindings, "about-body", ""),
      color: "#475569",
      fontSize: 22,
      fontWeight: "500",
      lineHeight: 1.32,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "highlights-bg",
      x: 478,
      y: 314,
      width: 676,
      height: 290,
      fill: "rgba(248,250,252,0.96)",
      stroke: "#cbd5e1",
      strokeWidth: 3,
    }),
    makeText(frame, options.instanceId, {
      suffix: "highlights-title",
      x: 522,
      y: 346,
      width: 260,
      height: 34,
      text: textBinding(slotBindings, "highlights-title", ""),
      color: "#1d4ed8",
      fontSize: 28,
      fontWeight: "700",
    }),
    makeText(frame, options.instanceId, {
      suffix: "highlights-items",
      x: 522,
      y: 398,
      width: 560,
      height: 120,
      text: highlightItems.map((item) => `• ${item}`).join("\n"),
      color: "#334155",
      fontSize: 21,
      fontWeight: "500",
      lineHeight: 1.42,
    }),
  ];
}

function buildQuoteCalloutComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);

  return [
    makeRect(frame, options.instanceId, {
      suffix: "quote-bg",
      x: 150,
      y: 176,
      width: 980,
      height: 344,
      fill: "rgba(15,23,42,0.88)",
      stroke: "#475569",
      strokeWidth: 3,
    }),
    makeSvgGraphic(frame, options.instanceId, {
      suffix: "quote-icon",
      x: 198,
      y: 232,
      size: 72,
      graphicId: "chat-bubble",
      alt: "Quote",
      color: "#c084fc",
    }),
    makeText(frame, options.instanceId, {
      suffix: "quote",
      x: 300,
      y: 224,
      width: 740,
      height: 160,
      text: textBinding(slotBindings, "quote", ""),
      color: "#f8fafc",
      fontSize: 42,
      fontWeight: "700",
      lineHeight: 1.14,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "eyebrow-bg",
      x: 300,
      y: 398,
      width: 228,
      height: 42,
      fill: "#ede9fe",
      stroke: "#c4b5fd",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "eyebrow",
      x: 320,
      y: 406,
      width: 188,
      height: 28,
      text: textBinding(slotBindings, "eyebrow", ""),
      color: "#6d28d9",
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "attribution",
      x: 300,
      y: 462,
      width: 520,
      height: 48,
      text: textBinding(slotBindings, "attribution", ""),
      color: "#cbd5e1",
      fontSize: 20,
      fontWeight: "500",
    }),
    makeRect(frame, options.instanceId, {
      suffix: "accent-line",
      x: 840,
      y: 458,
      width: 184,
      height: 8,
      fill: "#a855f7",
    }),
  ];
}

function buildVideoSpotlightComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const benefits = listBinding(slotBindings, "benefits", []);
  const clipFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["video-spotlight"]?.clip;

  const mediaElements = buildMediaSlotElements(frame, options.instanceId, slotBindings, {
    slotId: "clip",
    suffixBase: "clip",
    x: 676,
    y: 118,
    width: 438,
    height: 484,
    fallbackAlt: "Promo clip",
    placeholderText: "Drop or pick a video clip",
    placeholderColor: "#38bdf8",
    placeholderFontSize: 22,
    placeholderFill: "rgba(15,23,42,0.94)",
    placeholderStroke: "#38bdf8",
    placeholderStrokeWidth: 3,
    mediaShape: clipFrameStyle?.mediaShape,
    mediaCornerRadius: clipFrameStyle?.mediaCornerRadius,
    placeholderKind: "video",
  });

  return [
    makeRect(frame, options.instanceId, {
      suffix: "canvas-bg",
      x: 124,
      y: 102,
      width: 1032,
      height: 516,
      fill: "rgba(248,250,252,0.96)",
      stroke: "#cbd5e1",
      strokeWidth: 3,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "tag-bg",
      x: 174,
      y: 146,
      width: 180,
      height: 40,
      fill: "#082f49",
      stroke: "#0ea5e9",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "tag",
      x: 192,
      y: 154,
      width: 144,
      height: 24,
      text: textBinding(slotBindings, "tag", ""),
      color: "#e0f2fe",
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "headline",
      x: 174,
      y: 218,
      width: 432,
      height: 108,
      text: textBinding(slotBindings, "headline", ""),
      color: "#0f172a",
      fontSize: 44,
      fontWeight: "700",
      lineHeight: 1.12,
    }),
    makeText(frame, options.instanceId, {
      suffix: "body",
      x: 174,
      y: 330,
      width: 414,
      height: 96,
      text: textBinding(slotBindings, "body", ""),
      color: "#475569",
      fontSize: 22,
      fontWeight: "500",
      lineHeight: 1.35,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "benefits-bg",
      x: 174,
      y: 448,
      width: 418,
      height: 144,
      fill: "#eff6ff",
      stroke: "#93c5fd",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "benefits",
      x: 198,
      y: 472,
      width: 360,
      height: 102,
      text: benefits.map((item) => `• ${item}`).join("\n"),
      color: "#1e3a8a",
      fontSize: 20,
      fontWeight: "500",
      lineHeight: 1.38,
    }),
    ...mediaElements,
  ];
}

function buildPosterSpotlightComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const benefits = listBinding(slotBindings, "benefits", []);
  const heroFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["poster-spotlight"]?.hero;

  const mediaElements = buildMediaSlotElements(frame, options.instanceId, slotBindings, {
    slotId: "hero",
    suffixBase: "hero",
    x: 728,
    y: 84,
    width: 384,
    height: 552,
    fallbackAlt: "Hero visual",
    placeholderText: "Drop image or video",
    placeholderColor: "#e0f2fe",
    placeholderFontSize: 24,
    placeholderFill: "rgba(15,23,42,0.92)",
    placeholderStroke: "#7dd3fc",
    placeholderStrokeWidth: 3,
    mediaShape: heroFrameStyle?.mediaShape,
    mediaCornerRadius: heroFrameStyle?.mediaCornerRadius,
  });

  return [
    makeRect(frame, options.instanceId, {
      suffix: "canvas-bg",
      x: 96,
      y: 64,
      width: 1088,
      height: 592,
      fill: "rgba(239,246,255,0.96)",
      stroke: "#93c5fd",
      strokeWidth: 3,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "eyebrow-bg",
      x: 140,
      y: 108,
      width: 208,
      height: 38,
      fill: "#0f766e",
      stroke: "#34d399",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "eyebrow",
      x: 156,
      y: 116,
      width: 176,
      height: 22,
      text: textBinding(slotBindings, "eyebrow", ""),
      color: "#ecfeff",
      fontSize: 18,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "headline",
      x: 140,
      y: 180,
      width: 506,
      height: 140,
      text: textBinding(slotBindings, "headline", ""),
      color: "#0f172a",
      fontSize: 50,
      fontWeight: "700",
      lineHeight: 1.05,
    }),
    makeText(frame, options.instanceId, {
      suffix: "subhead",
      x: 140,
      y: 336,
      width: 492,
      height: 82,
      text: textBinding(slotBindings, "subhead", ""),
      color: "#475569",
      fontSize: 22,
      fontWeight: "500",
      lineHeight: 1.34,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "benefits-panel",
      x: 140,
      y: 452,
      width: 456,
      height: 126,
      fill: "rgba(255,255,255,0.9)",
      stroke: "#cbd5e1",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "benefits",
      x: 168,
      y: 478,
      width: 404,
      height: 76,
      text: benefits.map((item) => `• ${item}`).join("\n"),
      color: "#1e293b",
      fontSize: 20,
      fontWeight: "500",
      lineHeight: 1.36,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "cta-bg",
      x: 140,
      y: 596,
      width: 286,
      height: 40,
      fill: "#1d4ed8",
      stroke: "#60a5fa",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "cta",
      x: 164,
      y: 604,
      width: 238,
      height: 22,
      text: textBinding(slotBindings, "cta", ""),
      color: "#eff6ff",
      fontSize: 18,
      fontWeight: "700",
      textAlign: "center",
    }),
    ...mediaElements,
  ];
}

function buildFramedImageStoryComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const highlights = listBinding(slotBindings, "highlights", []);
  const photoFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["framed-image-story"]?.photo;

  const photoElements = buildMediaSlotElements(frame, options.instanceId, slotBindings, {
    slotId: "photo",
    suffixBase: "photo",
    x: 120,
    y: 112,
    width: 424,
    height: 420,
    fallbackAlt: "Story image",
    placeholderText: "Drop image or video",
    placeholderColor: "#334155",
    placeholderFontSize: 24,
    placeholderFill: "rgba(226,232,240,0.92)",
    placeholderStroke: "#64748b",
    placeholderStrokeWidth: 4,
    mediaShape: photoFrameStyle?.mediaShape,
    mediaCornerRadius: photoFrameStyle?.mediaCornerRadius,
  });

  return [
    makeRect(frame, options.instanceId, {
      suffix: "canvas-bg",
      x: 88,
      y: 78,
      width: 1104,
      height: 564,
      fill: "rgba(248,250,252,0.98)",
      stroke: "#cbd5e1",
      strokeWidth: 3,
    }),
    ...photoElements,
    makeRect(frame, options.instanceId, {
      suffix: "kicker-bg",
      x: 606,
      y: 118,
      width: 204,
      height: 36,
      fill: "#ede9fe",
      stroke: "#c4b5fd",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "kicker",
      x: 626,
      y: 126,
      width: 164,
      height: 20,
      text: textBinding(slotBindings, "kicker", ""),
      color: "#6d28d9",
      fontSize: 17,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "headline",
      x: 606,
      y: 178,
      width: 470,
      height: 114,
      text: textBinding(slotBindings, "headline", ""),
      color: "#0f172a",
      fontSize: 44,
      fontWeight: "700",
      lineHeight: 1.1,
    }),
    makeText(frame, options.instanceId, {
      suffix: "story",
      x: 606,
      y: 308,
      width: 470,
      height: 114,
      text: textBinding(slotBindings, "story", ""),
      color: "#475569",
      fontSize: 21,
      fontWeight: "500",
      lineHeight: 1.4,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "caption-bg",
      x: 120,
      y: 552,
      width: 424,
      height: 42,
      fill: "#0f172a",
      stroke: "#334155",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "caption",
      x: 146,
      y: 562,
      width: 372,
      height: 22,
      text: textBinding(slotBindings, "caption", ""),
      color: "#e2e8f0",
      fontSize: 17,
      fontWeight: "600",
      textAlign: "center",
    }),
    makeRect(frame, options.instanceId, {
      suffix: "highlights-panel",
      x: 606,
      y: 452,
      width: 470,
      height: 142,
      fill: "rgba(255,255,255,0.92)",
      stroke: "#cbd5e1",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "highlights",
      x: 634,
      y: 480,
      width: 414,
      height: 86,
      text: highlights.map((item) => `• ${item}`).join("\n"),
      color: "#334155",
      fontSize: 19,
      fontWeight: "500",
      lineHeight: 1.38,
    }),
  ];
}

function buildPhotoCollageComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  if (isPortraitCanvas(options.canvas)) {
    const frame = getPortraitDocumentFrame(options.canvas);
    const primaryFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["photo-collage"]?.["primary-photo"];
    const secondaryFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["photo-collage"]?.["secondary-photo"];
    const headlineFit = fitTextBox({
      text: textBinding(slotBindings, "headline", ""),
      width: 888, height: 72, baseFontSize: 48, minFontSize: 29, lineHeight: 1.06, maxLines: 2,
    });
    const bodyFit = fitTextBox({
      text: textBinding(slotBindings, "body", ""),
      width: 284, height: 344, baseFontSize: 20, minFontSize: 13, lineHeight: 1.38, maxLines: 16,
    });
    const captionFit = fitTextBox({
      text: textBinding(slotBindings, "caption", ""),
      width: 824, height: 56, baseFontSize: 22, minFontSize: 14, lineHeight: 1.3, maxLines: 2,
    });

    const primaryElements = buildMediaSlotElements(frame, options.instanceId, slotBindings, {
      slotId: "primary-photo",
      suffixBase: "primary",
      x: 56,
      y: 150,
      width: 568,
      height: 706,
      fallbackAlt: "Primary photo",
      placeholderText: "Primary Document media",
      placeholderColor: "#334155",
      placeholderFontSize: 30,
      placeholderFill: "#E2E8F0",
      mediaShape: primaryFrameStyle?.mediaShape,
      mediaCornerRadius: primaryFrameStyle?.mediaCornerRadius,
    });

    const secondaryElements = buildMediaSlotElements(frame, options.instanceId, slotBindings, {
      slotId: "secondary-photo",
      suffixBase: "secondary",
      x: 660,
      y: 150,
      width: 284,
      height: 320,
      fallbackAlt: "Secondary photo",
      placeholderText: "Detail media",
      placeholderColor: "#1D4ED8",
      placeholderFontSize: 24,
      placeholderFill: "#DBEAFE",
      mediaShape: secondaryFrameStyle?.mediaShape,
      mediaCornerRadius: secondaryFrameStyle?.mediaCornerRadius,
    });

    return [
      makeRect(frame, options.instanceId, {
        suffix: "canvas-bg",
        x: 0,
        y: 0,
        width: PORTRAIT_LAYOUT_WIDTH,
        height: PORTRAIT_LAYOUT_HEIGHT,
        fill: "#FFFCF7",
      }),
      makeRect(frame, options.instanceId, {
        suffix: "kicker-bg",
        x: 56,
        y: 54,
        width: 210,
        height: 42,
        fill: "#EEF2FF",
      }),
      makeText(frame, options.instanceId, {
        suffix: "kicker",
        x: 84,
        y: 66,
        width: 154,
        height: 18,
        text: textBinding(slotBindings, "kicker", ""),
        color: "#4338CA",
        fontSize: 18,
        fontWeight: "700",
        textAlign: "center",
      }),
      makeText(frame, options.instanceId, {
        suffix: "headline",
        x: 56,
        y: 108,
        width: 888,
        height: 72,
        text: headlineFit.text,
        color: "#0F172A",
        fontSize: headlineFit.fontSize,
        fontWeight: "700",
        lineHeight: 1.06,
      }),
      ...primaryElements,
      ...secondaryElements,
      makeText(frame, options.instanceId, {
        suffix: "body",
        x: 660,
        y: 512,
        width: 284,
        height: 344,
        text: bodyFit.text,
        color: "#475569",
        fontSize: bodyFit.fontSize,
        fontWeight: "500",
        lineHeight: 1.38,
      }),
      makeRect(frame, options.instanceId, {
        suffix: "caption-bg",
        x: 56,
        y: 1116,
        width: 888,
        height: 176,
        fill: "#111827",
      }),
      makeText(frame, options.instanceId, {
        suffix: "caption",
        x: 88,
        y: 1174,
        width: 824,
        height: 56,
        text: captionFit.text,
        color: "#F8FAFC",
        fontSize: captionFit.fontSize,
        fontWeight: "600",
        textAlign: "center",
        lineHeight: 1.3,
      }),
    ];
  }
  const frame = getLayoutFrame(options.canvas);
  const primaryFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["photo-collage"]?.["primary-photo"];
  const secondaryFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["photo-collage"]?.["secondary-photo"];

  const primaryElements = buildMediaSlotElements(frame, options.instanceId, slotBindings, {
    slotId: "primary-photo",
    suffixBase: "primary",
    x: 112,
    y: 152,
    width: 494,
    height: 360,
    fallbackAlt: "Primary photo",
    placeholderText: "Drop primary media",
    placeholderColor: "#334155",
    placeholderFontSize: 24,
    placeholderFill: "rgba(226,232,240,0.92)",
    placeholderStroke: "#64748b",
    placeholderStrokeWidth: 4,
    mediaShape: primaryFrameStyle?.mediaShape,
    mediaCornerRadius: primaryFrameStyle?.mediaCornerRadius,
  });

  const secondaryElements = buildMediaSlotElements(frame, options.instanceId, slotBindings, {
    slotId: "secondary-photo",
    suffixBase: "secondary",
    x: 864,
    y: 108,
    width: 248,
    height: 198,
    fallbackAlt: "Secondary photo",
    placeholderText: "Detail media",
    placeholderColor: "#6d28d9",
    placeholderFontSize: 20,
    placeholderFill: "rgba(224,231,255,0.9)",
    placeholderStroke: "#8b5cf6",
    placeholderStrokeWidth: 3,
    mediaShape: secondaryFrameStyle?.mediaShape,
    mediaCornerRadius: secondaryFrameStyle?.mediaCornerRadius,
  });

  return [
    makeRect(frame, options.instanceId, {
      suffix: "canvas-bg",
      x: 72,
      y: 78,
      width: 1136,
      height: 564,
      fill: "rgba(248,250,252,0.98)",
      stroke: "#cbd5e1",
      strokeWidth: 3,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "kicker-bg",
      x: 112,
      y: 96,
      width: 188,
      height: 36,
      fill: "#dbeafe",
      stroke: "#93c5fd",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "kicker",
      x: 130,
      y: 104,
      width: 152,
      height: 20,
      text: textBinding(slotBindings, "kicker", ""),
      color: "#1d4ed8",
      fontSize: 17,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "headline",
      x: 112,
      y: 530,
      width: 520,
      height: 72,
      text: textBinding(slotBindings, "headline", ""),
      color: "#0f172a",
      fontSize: 40,
      fontWeight: "700",
      lineHeight: 1.1,
    }),
    makeText(frame, options.instanceId, {
      suffix: "body",
      x: 656,
      y: 346,
      width: 456,
      height: 126,
      text: textBinding(slotBindings, "body", ""),
      color: "#475569",
      fontSize: 21,
      fontWeight: "500",
      lineHeight: 1.38,
    }),
    ...primaryElements,
    ...secondaryElements,
    makeRect(frame, options.instanceId, {
      suffix: "caption-bg",
      x: 864,
      y: 524,
      width: 248,
      height: 44,
      fill: "#0f172a",
      stroke: "#334155",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "caption",
      x: 888,
      y: 534,
      width: 200,
      height: 22,
      text: textBinding(slotBindings, "caption", ""),
      color: "#e2e8f0",
      fontSize: 16,
      fontWeight: "600",
      textAlign: "center",
    }),
  ];
}

function buildA4PhotoGridComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getPortraitDocumentFrame(options.canvas);
  const photoSlots = [
    { slotId: "hero-photo", suffix: "hero", x: 56, y: 154, width: 560, height: 624, label: "Hero Photo" },
    { slotId: "detail-photo-1", suffix: "detail-1", x: 650, y: 154, width: 294, height: 294, label: "Detail Photo 1" },
    { slotId: "detail-photo-2", suffix: "detail-2", x: 650, y: 484, width: 294, height: 294, label: "Detail Photo 2" },
    { slotId: "detail-photo-3", suffix: "detail-3", x: 56, y: 948, width: 280, height: 230, label: "Detail Photo 3" },
    { slotId: "detail-photo-4", suffix: "detail-4", x: 354, y: 948, width: 280, height: 230, label: "Detail Photo 4" },
  ] as const;

  const photoElements = photoSlots.flatMap((photoConfig) => {
    const frameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["a4-photo-grid"]?.[photoConfig.slotId];
    return buildMediaSlotElements(frame, options.instanceId, slotBindings, {
      slotId: photoConfig.slotId,
      suffixBase: photoConfig.suffix,
      x: photoConfig.x,
      y: photoConfig.y,
      width: photoConfig.width,
      height: photoConfig.height,
      fallbackAlt: photoConfig.label,
      placeholderText: photoConfig.slotId === "hero-photo" ? "Hero image or video" : photoConfig.label,
      placeholderColor: photoConfig.slotId === "hero-photo" ? "#334155" : "#1D4ED8",
      placeholderFontSize: photoConfig.slotId === "hero-photo" ? 28 : 20,
      placeholderFill: photoConfig.slotId === "hero-photo" ? "#E2E8F0" : "#E0F2FE",
      placeholderStroke: photoConfig.slotId === "hero-photo" ? "#CBD5E1" : "#BFDBFE",
      placeholderStrokeWidth: 2,
      mediaShape: frameStyle?.mediaShape,
      mediaCornerRadius: frameStyle?.mediaCornerRadius,
    });
  });

  return [
    makeRect(frame, options.instanceId, {
      suffix: "canvas-bg",
      x: 0,
      y: 0,
      width: PORTRAIT_LAYOUT_WIDTH,
      height: PORTRAIT_LAYOUT_HEIGHT,
      fill: "#FFFCF7",
    }),
    makeRect(frame, options.instanceId, {
      suffix: "eyebrow-bg",
      x: 56,
      y: 58,
      width: 240,
      height: 42,
      fill: "#EEF2FF",
    }),
    makeText(frame, options.instanceId, {
      suffix: "eyebrow",
      x: 82,
      y: 70,
      width: 188,
      height: 18,
      text: textBinding(slotBindings, "eyebrow", ""),
      color: "#4338CA",
      fontSize: 18,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "headline",
      x: 56,
      y: 112,
      width: 888,
      height: 72,
      text: textBinding(slotBindings, "headline", ""),
      color: "#0F172A",
      fontSize: 46,
      fontWeight: "700",
      lineHeight: 1.06,
    }),
    ...photoElements,
    makeRect(frame, options.instanceId, {
      suffix: "summary-card",
      x: 652,
      y: 810,
      width: 292,
      height: 368,
      fill: "#FFFFFF",
      stroke: "#E2E8F0",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "summary",
      x: 682,
      y: 852,
      width: 232,
      height: 244,
      text: textBinding(slotBindings, "summary", ""),
      color: "#475569",
      fontSize: 21,
      fontWeight: "500",
      lineHeight: 1.38,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "caption-bar",
      x: 56,
      y: 1222,
      width: 888,
      height: 112,
      fill: "#111827",
    }),
    makeText(frame, options.instanceId, {
      suffix: "caption",
      x: 94,
      y: 1258,
      width: 812,
      height: 40,
      text: textBinding(slotBindings, "caption", ""),
      color: "#F8FAFC",
      fontSize: 20,
      fontWeight: "600",
      textAlign: "center",
      lineHeight: 1.26,
    }),
  ];
}

function buildLandscapePhotoStoryComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const photoSlots = [
    { slotId: "hero-photo", suffix: "hero", x: 72, y: 78, width: 620, height: 422, label: "Hero Showcase Image" },
    { slotId: "detail-photo-1", suffix: "detail-1", x: 740, y: 96, width: 444, height: 156, label: "Supporting Photo 1" },
    { slotId: "detail-photo-2", suffix: "detail-2", x: 740, y: 276, width: 444, height: 156, label: "Supporting Photo 2" },
    { slotId: "detail-photo-3", suffix: "detail-3", x: 740, y: 456, width: 444, height: 156, label: "Supporting Photo 3" },
  ] as const;

  const photoElements = photoSlots.flatMap((photoConfig) => {
    const frameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["landscape-photo-story"]?.[photoConfig.slotId];
    return buildMediaSlotElements(frame, options.instanceId, slotBindings, {
      slotId: photoConfig.slotId,
      suffixBase: photoConfig.suffix,
      x: photoConfig.x,
      y: photoConfig.y,
      width: photoConfig.width,
      height: photoConfig.height,
      fallbackAlt: photoConfig.label,
      placeholderText: photoConfig.slotId === "hero-photo" ? "Hero image or video" : photoConfig.label,
      placeholderColor: "#334155",
      placeholderFontSize: photoConfig.slotId === "hero-photo" ? 28 : 20,
      placeholderFill: photoConfig.slotId === "hero-photo" ? "#E2E8F0" : "#F1F5F9",
      placeholderStroke: "#CBD5E1",
      placeholderStrokeWidth: 2,
      mediaShape: frameStyle?.mediaShape,
      mediaCornerRadius: frameStyle?.mediaCornerRadius,
    });
  });

  const highlights = listBinding(slotBindings, "highlights", [])
    .slice(0, 4)
    .map((item) => `• ${item}`)
    .join("\n");

  return [
    makeRect(frame, options.instanceId, {
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
    makeRect(frame, options.instanceId, {
      suffix: "eyebrow-bg",
      x: 72,
      y: 530,
      width: 220,
      height: 34,
      fill: "#EEF2FF",
    }),
    makeText(frame, options.instanceId, {
      suffix: "eyebrow",
      x: 94,
      y: 538,
      width: 176,
      height: 18,
      text: textBinding(slotBindings, "eyebrow", ""),
      color: "#4338CA",
      fontSize: 17,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "headline",
      x: 72,
      y: 572,
      width: 520,
      height: 66,
      text: textBinding(slotBindings, "headline", ""),
      color: "#0F172A",
      fontSize: 38,
      fontWeight: "700",
      lineHeight: 1.08,
    }),
    makeText(frame, options.instanceId, {
      suffix: "body",
      x: 608,
      y: 552,
      width: 300,
      height: 86,
      text: textBinding(slotBindings, "body", ""),
      color: "#475569",
      fontSize: 18,
      fontWeight: "500",
      lineHeight: 1.34,
    }),
    makeText(frame, options.instanceId, {
      suffix: "highlights-title",
      x: 934,
      y: 550,
      width: 210,
      height: 24,
      text: textBinding(slotBindings, "highlights-title", ""),
      color: "#0F172A",
      fontSize: 18,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeRect(frame, options.instanceId, {
      suffix: "highlights-panel",
      x: 928,
      y: 580,
      width: 222,
      height: 72,
      fill: "#FFFFFF",
      stroke: "#CBD5E1",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "highlights",
      x: 952,
      y: 596,
      width: 174,
      height: 44,
      text: highlights,
      color: "#334155",
      fontSize: 14,
      fontWeight: "500",
      lineHeight: 1.32,
    }),
  ];
}

function buildArticleFocusComponent(
  options: BuildComponentInstanceOptions,
  slotBindings: PresentationComponentSlotBinding[],
): PresentationSlideElement[] {
  if (isPortraitCanvas(options.canvas)) {
    const frame = getPortraitDocumentFrame(options.canvas);
    const keyPoints = listBinding(slotBindings, "key-points", []);
    const heroFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["article-focus"]?.hero;
    const titleFit = fitTextBox({
      text: textBinding(slotBindings, "title", ""),
      width: 586, height: 118, baseFontSize: 50, minFontSize: 30, lineHeight: 1.06, maxLines: 3,
    });
    const leadFit = fitTextBox({
      text: textBinding(slotBindings, "lead", ""),
      width: 586, height: 128, baseFontSize: 24, minFontSize: 15, lineHeight: 1.34, maxLines: 5,
    });
    const keyPointsFit = fitListTextBox({
      items: keyPoints.slice(0, 6),
      width: 196, height: 240, baseFontSize: 18, minFontSize: 12, lineHeight: 1.42, maxLines: 12, bulletPrefix: "• ",
    });
    const bodyFit = fitTextBox({
      text: textBinding(slotBindings, "body", ""),
      width: 888, height: 350, baseFontSize: 21, minFontSize: 13, lineHeight: 1.42, maxLines: 16,
    });
    const heroElements = buildMediaSlotElements(frame, options.instanceId, slotBindings, {
      slotId: "hero",
      suffixBase: "hero",
      x: 56,
      y: 54,
      width: 888,
      height: 470,
      fallbackAlt: "Hero visual",
      placeholderText: "Hero image or video",
      placeholderColor: "#475569",
      placeholderFontSize: 36,
      placeholderFill: "#E2E8F0",
      mediaShape: heroFrameStyle?.mediaShape,
      mediaCornerRadius: heroFrameStyle?.mediaCornerRadius,
    });

    return [
      makeRect(frame, options.instanceId, {
        suffix: "bg",
        x: 0,
        y: 0,
        width: PORTRAIT_LAYOUT_WIDTH,
        height: PORTRAIT_LAYOUT_HEIGHT,
        fill: "#FFFCF7",
      }),
      ...heroElements,
      makeRect(frame, options.instanceId, {
        suffix: "eyebrow-bg",
        x: 56,
        y: 556,
        width: 196,
        height: 44,
        fill: "#D1FAE5",
      }),
      makeText(frame, options.instanceId, {
        suffix: "eyebrow",
        x: 76,
        y: 568,
        width: 156,
        height: 18,
        text: textBinding(slotBindings, "eyebrow", ""),
        fontSize: 18,
        fontWeight: "700",
        color: "#047857",
        textAlign: "center",
      }),
      makeText(frame, options.instanceId, {
        suffix: "title",
        x: 56,
        y: 624,
        width: 586,
        height: 118,
        text: titleFit.text,
        fontSize: titleFit.fontSize,
        fontWeight: "700",
        color: "#0F172A",
        lineHeight: 1.06,
      }),
      makeText(frame, options.instanceId, {
        suffix: "lead",
        x: 56,
        y: 758,
        width: 586,
        height: 128,
        text: leadFit.text,
        fontSize: leadFit.fontSize,
        fontWeight: "500",
        color: "#475569",
        lineHeight: 1.34,
      }),
      makeRect(frame, options.instanceId, {
        suffix: "key-points-card",
        x: 676,
        y: 624,
        width: 268,
        height: 358,
        fill: "#F0FDF4",
      }),
      makeText(frame, options.instanceId, {
        suffix: "key-points-title",
        x: 712,
        y: 658,
        width: 196,
        height: 28,
        text: textBinding(slotBindings, "key-points-title", "Key Points"),
        fontSize: 22,
        fontWeight: "700",
        color: "#047857",
      }),
      makeText(frame, options.instanceId, {
        suffix: "key-points",
        x: 712,
        y: 706,
        width: 196,
        height: 240,
        text: keyPointsFit.text,
        fontSize: keyPointsFit.fontSize,
        fontWeight: "500",
        color: "#334155",
        lineHeight: 1.42,
      }),
      makeText(frame, options.instanceId, {
        suffix: "body",
        x: 56,
        y: 926,
        width: 888,
        height: 350,
        text: bodyFit.text,
        fontSize: bodyFit.fontSize,
        color: "#334155",
        lineHeight: 1.42,
      }),
      makeText(frame, options.instanceId, {
        suffix: "footnote",
        x: 56,
        y: 1324,
        width: 888,
        height: 24,
        text: textBinding(slotBindings, "footnote", ""),
        fontSize: 14,
        color: "#94A3B8",
      }),
    ];
  }
  const frame = getLayoutFrame(options.canvas);
  const keyPoints = listBinding(slotBindings, "key-points", []);
  return [
    makeRect(frame, "article-focus-bg", {
      suffix: "bg", x: 20, y: 20, width: 1240, height: 680,
      fill: "#FFFFFF", stroke: "#CBD5E1",
    }),
    makeText(frame, "article-focus-eyebrow", {
      suffix: "eyebrow", x: 44, y: 36, width: 200, height: 24,
      text: textBinding(slotBindings, "eyebrow", ""),
      fontSize: 14, fontWeight: "600", color: "#059669",
    }),
    makeText(frame, "article-focus-title", {
      suffix: "title", x: 44, y: 64, width: 560, height: 48,
      text: textBinding(slotBindings, "title", ""),
      fontSize: 32, fontWeight: "700", color: "#0F172A", lineHeight: 1.15,
    }),
    makeText(frame, "article-focus-lead", {
      suffix: "lead", x: 44, y: 124, width: 560, height: 60,
      text: textBinding(slotBindings, "lead", ""),
      fontSize: 18, fontWeight: "500", color: "#334155", lineHeight: 1.4,
    }),
    makeText(frame, "article-focus-body", {
      suffix: "body", x: 44, y: 196, width: 560, height: 460,
      text: textBinding(slotBindings, "body", ""),
      fontSize: 16, color: "#475569", lineHeight: 1.5,
    }),
    makeRect(frame, "article-focus-kp-card", {
      suffix: "kp-card", x: 640, y: 64, width: 580, height: 592,
      fill: "#F0FDF4", stroke: "#86EFAC",
    }),
    makeText(frame, "article-focus-kp-title", {
      suffix: "kp-title", x: 668, y: 84, width: 520, height: 28,
      text: textBinding(slotBindings, "key-points-title", "Key Points"),
      fontSize: 18, fontWeight: "700", color: "#059669",
    }),
    ...keyPoints.slice(0, 8).map((point, i) =>
      makeText(frame, `article-focus-kp-${i}`, {
        suffix: `kp-${i}`, x: 668, y: 124 + i * 36, width: 520, height: 30,
        text: `• ${point}`,
        fontSize: 15, color: "#334155", lineHeight: 1.34,
      }),
    ),
    makeText(frame, "article-focus-footnote", {
      suffix: "footnote", x: 44, y: 668, width: 560, height: 20,
      text: textBinding(slotBindings, "footnote", ""),
      fontSize: 12, color: "#94A3B8",
    }),
  ];
}

function buildTwoColumnArticleComponent(
  options: BuildComponentInstanceOptions,
  slotBindings: PresentationComponentSlotBinding[],
): PresentationSlideElement[] {
  if (isPortraitCanvas(options.canvas)) {
    const frame = getPortraitDocumentFrame(options.canvas);
    const heroFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["two-column-article"]?.hero;
    const titleFit = fitTextBox({
      text: textBinding(slotBindings, "title", ""),
      width: 534, height: 152, baseFontSize: 50, minFontSize: 30, lineHeight: 1.04, maxLines: 3,
    });
    const introFit = fitTextBox({
      text: textBinding(slotBindings, "intro", ""),
      width: 534, height: 98, baseFontSize: 22, minFontSize: 14, lineHeight: 1.34, maxLines: 4,
    });
    const leftBodyFit = fitTextBox({
      text: textBinding(slotBindings, "left-body", ""),
      width: 348, height: 448, baseFontSize: 19, minFontSize: 12, lineHeight: 1.42, maxLines: 22,
    });
    const rightBodyFit = fitTextBox({
      text: textBinding(slotBindings, "right-body", ""),
      width: 348, height: 448, baseFontSize: 19, minFontSize: 12, lineHeight: 1.42, maxLines: 22,
    });
    const takeawaysFit = fitListTextBox({
      items: listBinding(slotBindings, "takeaways", []).slice(0, 4),
      width: 560, height: 132, baseFontSize: 18, minFontSize: 12, lineHeight: 1.42, maxLines: 8, bulletPrefix: "• ",
    });
    const heroElements = buildMediaSlotElements(frame, options.instanceId, slotBindings, {
      slotId: "hero",
      suffixBase: "hero",
      x: 636,
      y: 58,
      width: 308,
      height: 312,
      fallbackAlt: "Hero visual",
      placeholderText: "Document media",
      placeholderColor: "#4338CA",
      placeholderFontSize: 28,
      placeholderFill: "#E0E7FF",
      mediaShape: heroFrameStyle?.mediaShape,
      mediaCornerRadius: heroFrameStyle?.mediaCornerRadius,
    });

    return [
      makeRect(frame, options.instanceId, {
        suffix: "bg",
        x: 0,
        y: 0,
        width: PORTRAIT_LAYOUT_WIDTH,
        height: PORTRAIT_LAYOUT_HEIGHT,
        fill: "#FFFFFF",
      }),
      makeRect(frame, options.instanceId, {
        suffix: "eyebrow-bg",
        x: 56,
        y: 58,
        width: 220,
        height: 44,
        fill: "#EEF2FF",
      }),
      makeText(frame, options.instanceId, {
        suffix: "eyebrow",
        x: 82,
        y: 70,
        width: 168,
        height: 18,
        text: textBinding(slotBindings, "eyebrow", ""),
        fontSize: 18,
        fontWeight: "700",
        color: "#4338CA",
        textAlign: "center",
      }),
      makeText(frame, options.instanceId, {
        suffix: "title",
        x: 56,
        y: 130,
        width: 534,
        height: 152,
        text: titleFit.text,
        fontSize: titleFit.fontSize,
        fontWeight: "700",
        color: "#0F172A",
        lineHeight: 1.04,
      }),
      makeText(frame, options.instanceId, {
        suffix: "intro",
        x: 56,
        y: 304,
        width: 534,
        height: 98,
        text: introFit.text,
        fontSize: introFit.fontSize,
        fontWeight: "500",
        color: "#475569",
        lineHeight: 1.34,
      }),
      ...heroElements,
      makeRect(frame, options.instanceId, {
        suffix: "left-card",
        x: 56,
        y: 446,
        width: 420,
        height: 600,
        fill: "#F8FAFC",
      }),
      makeText(frame, options.instanceId, {
        suffix: "left-title",
        x: 92,
        y: 486,
        width: 348,
        height: 52,
        text: textBinding(slotBindings, "left-title", ""),
        fontSize: 28,
        fontWeight: "700",
        color: "#0F172A",
        lineHeight: 1.14,
      }),
      makeText(frame, options.instanceId, {
        suffix: "left-body",
        x: 92,
        y: 554,
        width: 348,
        height: 448,
        text: leftBodyFit.text,
        fontSize: leftBodyFit.fontSize,
        color: "#334155",
        lineHeight: 1.42,
      }),
      makeRect(frame, options.instanceId, {
        suffix: "right-card",
        x: 524,
        y: 446,
        width: 420,
        height: 600,
        fill: "#F8FAFC",
      }),
      makeText(frame, options.instanceId, {
        suffix: "right-title",
        x: 560,
        y: 486,
        width: 348,
        height: 52,
        text: textBinding(slotBindings, "right-title", ""),
        fontSize: 28,
        fontWeight: "700",
        color: "#0F172A",
        lineHeight: 1.14,
      }),
      makeText(frame, options.instanceId, {
        suffix: "right-body",
        x: 560,
        y: 554,
        width: 348,
        height: 448,
        text: rightBodyFit.text,
        fontSize: rightBodyFit.fontSize,
        color: "#334155",
        lineHeight: 1.42,
      }),
      makeRect(frame, options.instanceId, {
        suffix: "takeaways-card",
        x: 56,
        y: 1092,
        width: 888,
        height: 220,
        fill: "#EEF2FF",
      }),
      makeText(frame, options.instanceId, {
        suffix: "takeaways-title",
        x: 92,
        y: 1130,
        width: 220,
        height: 28,
        text: textBinding(slotBindings, "takeaways-title", "Key Takeaways"),
        fontSize: 22,
        fontWeight: "700",
        color: "#4338CA",
      }),
      makeText(frame, options.instanceId, {
        suffix: "takeaways",
        x: 332,
        y: 1128,
        width: 560,
        height: 132,
        text: takeawaysFit.text,
        fontSize: takeawaysFit.fontSize,
        color: "#334155",
        lineHeight: 1.42,
      }),
    ];
  }
  const frame = getLayoutFrame(options.canvas);
  const takeaways = listBinding(slotBindings, "takeaways", []);
  return [
    makeRect(frame, "two-column-article-bg", {
      suffix: "bg", x: 20, y: 20, width: 1240, height: 680,
      fill: "#FFFFFF", stroke: "#CBD5E1",
    }),
    makeRect(frame, "two-column-article-eyebrow-bg", {
      suffix: "eyebrow-bg", x: 44, y: 36, width: 176, height: 34,
      fill: "#EEF2FF", stroke: "#A5B4FC",
    }),
    makeText(frame, "two-column-article-eyebrow", {
      suffix: "eyebrow", x: 68, y: 44, width: 128, height: 18,
      text: textBinding(slotBindings, "eyebrow", ""),
      fontSize: 18, fontWeight: "700", color: "#4338CA", textAlign: "center",
    }),
    makeText(frame, "two-column-article-title", {
      suffix: "title", x: 44, y: 92, width: 1040, height: 54,
      text: textBinding(slotBindings, "title", ""),
      fontSize: 34, fontWeight: "700", color: "#0F172A", lineHeight: 1.12,
    }),
    makeText(frame, "two-column-article-intro", {
      suffix: "intro", x: 44, y: 160, width: 1110, height: 54,
      text: textBinding(slotBindings, "intro", ""),
      fontSize: 18, fontWeight: "500", color: "#475569", lineHeight: 1.42,
    }),
    makeRect(frame, "two-column-article-left-card", {
      suffix: "left-card", x: 44, y: 244, width: 530, height: 328,
      fill: "#F8FAFC", stroke: "#E2E8F0",
    }),
    makeText(frame, "two-column-article-left-title", {
      suffix: "left-title", x: 72, y: 268, width: 460, height: 30,
      text: textBinding(slotBindings, "left-title", ""),
      fontSize: 24, fontWeight: "700", color: "#0F172A",
    }),
    makeText(frame, "two-column-article-left-body", {
      suffix: "left-body", x: 72, y: 314, width: 460, height: 224,
      text: textBinding(slotBindings, "left-body", ""),
      fontSize: 16, color: "#475569", lineHeight: 1.48,
    }),
    makeRect(frame, "two-column-article-right-card", {
      suffix: "right-card", x: 604, y: 244, width: 530, height: 328,
      fill: "#F8FAFC", stroke: "#E2E8F0",
    }),
    makeText(frame, "two-column-article-right-title", {
      suffix: "right-title", x: 632, y: 268, width: 460, height: 30,
      text: textBinding(slotBindings, "right-title", ""),
      fontSize: 24, fontWeight: "700", color: "#0F172A",
    }),
    makeText(frame, "two-column-article-right-body", {
      suffix: "right-body", x: 632, y: 314, width: 460, height: 224,
      text: textBinding(slotBindings, "right-body", ""),
      fontSize: 16, color: "#475569", lineHeight: 1.48,
    }),
    makeRect(frame, "two-column-article-takeaways-card", {
      suffix: "takeaways-card", x: 44, y: 594, width: 1090, height: 72,
      fill: "#EEF2FF", stroke: "#C7D2FE",
    }),
    makeText(frame, "two-column-article-takeaways-title", {
      suffix: "takeaways-title", x: 72, y: 610, width: 180, height: 22,
      text: textBinding(slotBindings, "takeaways-title", "Key Takeaways"),
      fontSize: 16, fontWeight: "700", color: "#4338CA",
    }),
    ...takeaways.slice(0, 4).map((item, index) =>
      makeText(frame, `two-column-article-takeaway-${index}`, {
        suffix: `takeaway-${index}`, x: 286 + (index % 2) * 384, y: 608 + Math.floor(index / 2) * 24,
        width: 320, height: 20, text: `• ${item}`,
        fontSize: 14, color: "#334155", lineHeight: 1.34,
      }),
    ),
  ];
}

function buildFaqStackComponent(
  options: BuildComponentInstanceOptions,
  slotBindings: PresentationComponentSlotBinding[],
): PresentationSlideElement[] {
  if (isPortraitCanvas(options.canvas)) {
    const frame = getPortraitDocumentFrame(options.canvas);
    const titleFit = fitTextBox({
      text: textBinding(slotBindings, "title", ""),
      width: 888, height: 116, baseFontSize: 48, minFontSize: 29, lineHeight: 1.08, maxLines: 3,
    });
    const introFit = fitTextBox({
      text: textBinding(slotBindings, "intro", ""),
      width: 888, height: 90, baseFontSize: 22, minFontSize: 14, lineHeight: 1.38, maxLines: 4,
    });
    const portraitCards = [
      { y: 386, accent: "#2563EB", questionSlot: "faq1-question", answerSlot: "faq1-answer" },
      { y: 662, accent: "#0F766E", questionSlot: "faq2-question", answerSlot: "faq2-answer" },
      { y: 938, accent: "#7C3AED", questionSlot: "faq3-question", answerSlot: "faq3-answer" },
    ] as const;

    return [
      makeRect(frame, options.instanceId, {
        suffix: "bg",
        x: 0, y: 0, width: PORTRAIT_LAYOUT_WIDTH, height: PORTRAIT_LAYOUT_HEIGHT,
        fill: "#FFFFFF",
      }),
      makeRect(frame, options.instanceId, {
        suffix: "eyebrow-bg",
        x: 56, y: 52, width: 188, height: 42,
        fill: "#EFF6FF",
      }),
      makeText(frame, options.instanceId, {
        suffix: "eyebrow",
        x: 82, y: 64, width: 136, height: 18,
        text: textBinding(slotBindings, "eyebrow", "FAQ"),
        color: "#2563EB", fontSize: 18, fontWeight: "700", textAlign: "center",
      }),
      makeText(frame, options.instanceId, {
        suffix: "title",
        x: 56, y: 118, width: 888, height: 116,
        text: titleFit.text,
        color: "#0F172A", fontSize: titleFit.fontSize, fontWeight: "700", lineHeight: 1.08,
      }),
      makeText(frame, options.instanceId, {
        suffix: "intro",
        x: 56, y: 258, width: 888, height: 90,
        text: introFit.text,
        color: "#475569", fontSize: introFit.fontSize, fontWeight: "500", lineHeight: 1.38,
      }),
      ...portraitCards.flatMap((card, index) => {
        const qFit = fitTextBox({
          text: textBinding(slotBindings, card.questionSlot, ""),
          width: 776, height: 50, baseFontSize: 26, minFontSize: 16, lineHeight: 1.16, maxLines: 2,
        });
        const aFit = fitTextBox({
          text: textBinding(slotBindings, card.answerSlot, ""),
          width: 776, height: 58, baseFontSize: 18, minFontSize: 12, lineHeight: 1.42, maxLines: 3,
        });
        return [
          makeRect(frame, options.instanceId, {
            suffix: `faq-${index + 1}-card`,
            x: 56, y: card.y, width: 888, height: 220,
            fill: "#F8FAFC", stroke: "#E2E8F0",
          }),
          makeRect(frame, options.instanceId, {
            suffix: `faq-${index + 1}-q-bg`,
            x: 88, y: card.y + 28, width: 152, height: 40,
            fill: card.accent,
          }),
          makeText(frame, options.instanceId, {
            suffix: `faq-${index + 1}-q`,
            x: 112, y: card.y + 80, width: 776, height: 50,
            text: qFit.text,
            color: "#0F172A", fontSize: qFit.fontSize, fontWeight: "700", lineHeight: 1.16,
          }),
          makeText(frame, options.instanceId, {
            suffix: `faq-${index + 1}-a`,
            x: 112, y: card.y + 142, width: 776, height: 58,
            text: aFit.text,
            color: "#475569", fontSize: aFit.fontSize, fontWeight: "500", lineHeight: 1.42,
          }),
        ];
      }),
    ];
  }
  const frame = getLayoutFrame(options.canvas);
  const cards = [
    { y: 248, accent: "#2563EB", questionSlot: "faq1-question", answerSlot: "faq1-answer" },
    { y: 390, accent: "#0F766E", questionSlot: "faq2-question", answerSlot: "faq2-answer" },
    { y: 532, accent: "#7C3AED", questionSlot: "faq3-question", answerSlot: "faq3-answer" },
  ] as const;
  return [
    makeRect(frame, "faq-stack-bg", {
      suffix: "bg", x: 20, y: 20, width: 1240, height: 680,
      fill: "#FFFFFF", stroke: "#CBD5E1",
    }),
    makeRect(frame, "faq-stack-eyebrow-bg", {
      suffix: "eyebrow-bg", x: 44, y: 36, width: 148, height: 34,
      fill: "#EFF6FF", stroke: "#93C5FD",
    }),
    makeText(frame, "faq-stack-eyebrow", {
      suffix: "eyebrow", x: 66, y: 44, width: 104, height: 18,
      text: textBinding(slotBindings, "eyebrow", "FAQ"),
      fontSize: 18, fontWeight: "700", color: "#2563EB", textAlign: "center",
    }),
    makeText(frame, "faq-stack-title", {
      suffix: "title", x: 44, y: 92, width: 1100, height: 54,
      text: textBinding(slotBindings, "title", ""),
      fontSize: 34, fontWeight: "700", color: "#0F172A", lineHeight: 1.12,
    }),
    makeText(frame, "faq-stack-intro", {
      suffix: "intro", x: 44, y: 160, width: 1116, height: 64,
      text: textBinding(slotBindings, "intro", ""),
      fontSize: 18, fontWeight: "500", color: "#475569", lineHeight: 1.42,
    }),
    ...cards.flatMap((card, index) => [
      makeRect(frame, `faq-stack-card-${index + 1}`, {
        suffix: `faq-${index + 1}-card`, x: 44, y: card.y, width: 1112, height: 118,
        fill: "#F8FAFC", stroke: "#E2E8F0",
      }),
      makeRect(frame, `faq-stack-q-bg-${index + 1}`, {
        suffix: `faq-${index + 1}-q-bg`, x: 70, y: card.y + 18, width: 118, height: 32,
        fill: card.accent,
      }),
      makeText(frame, `faq-stack-q-${index + 1}`, {
        suffix: `faq-${index + 1}-q`, x: 90, y: card.y + 24, width: 1028, height: 24,
        text: textBinding(slotBindings, card.questionSlot, ""),
        fontSize: 20, fontWeight: "700", color: "#0F172A", lineHeight: 1.18,
      }),
      makeText(frame, `faq-stack-a-${index + 1}`, {
        suffix: `faq-${index + 1}-a`, x: 90, y: card.y + 60, width: 1028, height: 74,
        text: textBinding(slotBindings, card.answerSlot, ""),
        fontSize: 17, fontWeight: "500", color: "#475569", lineHeight: 1.4,
      }),
    ]),
  ];
}

function buildProfileBoardComponent(
  options: BuildComponentInstanceOptions,
  slotBindings: PresentationComponentSlotBinding[],
): PresentationSlideElement[] {
  if (isPortraitCanvas(options.canvas)) {
    const frame = getPortraitDocumentFrame(options.canvas);
    const portrait = imageBinding(slotBindings, "portrait", { src: "", alt: "Portrait" });
    const experienceItems = listBinding(slotBindings, "experience-items", []);
    const skillItems = listBinding(slotBindings, "skills-items", []);
    const contactItems = listBinding(slotBindings, "contact-items", []);
    const nameFit = fitTextBox({
      text: textBinding(slotBindings, "name", ""),
      width: 620, height: 70, baseFontSize: 54, minFontSize: 32, lineHeight: 1.1, maxLines: 2,
    });
    const bioBodyFit = fitTextBox({
      text: textBinding(slotBindings, "bio-body", ""),
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
        makeImage(frame, options.instanceId, {
          suffix: "portrait-image",
          x: 60,
          y: 108,
          width: 300,
          height: 360,
          src: portrait.src,
          alt: portrait.alt,
          imageFit: "cover",
          mediaShape: "rounded",
          mediaCornerRadius: 28,
        }),
      ]
      : [
        makeRect(frame, options.instanceId, {
          suffix: "portrait-frame",
          x: 60,
          y: 108,
          width: 300,
          height: 360,
          fill: "#E2E8F0",
        }),
        makeText(frame, options.instanceId, {
          suffix: "portrait-placeholder",
          x: 94,
          y: 262,
          width: 232,
          height: 52,
          text: "Portrait",
          color: "#475569",
          fontSize: 30,
          fontWeight: "700",
          textAlign: "center",
        }),
      ];

    return [
      makeRect(frame, options.instanceId, {
        suffix: "bg",
        x: 0,
        y: 0,
        width: PORTRAIT_LAYOUT_WIDTH,
        height: PORTRAIT_LAYOUT_HEIGHT,
        fill: "#FFFFFF",
      }),
      makeText(frame, options.instanceId, {
        suffix: "name",
        x: 60,
        y: 48,
        width: 620,
        height: 70,
        text: nameFit.text,
        fontSize: nameFit.fontSize,
        fontWeight: "700",
        color: "#4B3F39",
      }),
      makeRect(frame, options.instanceId, {
        suffix: "role-bg",
        x: 384,
        y: 126,
        width: 250,
        height: 44,
        fill: "#F1F5F9",
      }),
      makeText(frame, options.instanceId, {
        suffix: "role",
        x: 410,
        y: 138,
        width: 198,
        height: 18,
        text: textBinding(slotBindings, "role", ""),
        fontSize: 20,
        fontWeight: "700",
        color: "#475569",
        textAlign: "center",
      }),
      ...portraitElements,
      makeText(frame, options.instanceId, {
        suffix: "bio-title",
        x: 60,
        y: 514,
        width: 200,
        height: 28,
        text: textBinding(slotBindings, "bio-title", "About"),
        fontSize: 20,
        fontWeight: "700",
        color: "#4B3F39",
      }),
      makeText(frame, options.instanceId, {
        suffix: "bio-body",
        x: 60,
        y: 556,
        width: 300,
        height: 262,
        text: bioBodyFit.text,
        fontSize: bioBodyFit.fontSize,
        color: "#475569",
        lineHeight: 1.38,
      }),
      makeText(frame, options.instanceId, {
        suffix: "experience-title",
        x: 412,
        y: 212,
        width: 220,
        height: 28,
        text: textBinding(slotBindings, "experience-title", "Experience"),
        fontSize: 24,
        fontWeight: "700",
        color: "#4B3F39",
      }),
      makeText(frame, options.instanceId, {
        suffix: "experience-items",
        x: 412,
        y: 252,
        width: 528,
        height: 372,
        text: experienceFit.text,
        fontSize: experienceFit.fontSize,
        color: "#475569",
        lineHeight: 1.42,
      }),
      makeText(frame, options.instanceId, {
        suffix: "skills-title",
        x: 412,
        y: 668,
        width: 180,
        height: 28,
        text: textBinding(slotBindings, "skills-title", "Skills"),
        fontSize: 24,
        fontWeight: "700",
        color: "#4B3F39",
      }),
      makeText(frame, options.instanceId, {
        suffix: "skills-items",
        x: 412,
        y: 708,
        width: 528,
        height: 182,
        text: skillsFit.text,
        fontSize: skillsFit.fontSize,
        color: "#475569",
        lineHeight: 1.42,
      }),
      makeRect(frame, options.instanceId, {
        suffix: "contact-title-bg",
        x: 60,
        y: 1172,
        width: 220,
        height: 42,
        fill: "#F1F5F9",
      }),
      makeText(frame, options.instanceId, {
        suffix: "contact-title",
        x: 88,
        y: 1184,
        width: 164,
        height: 18,
        text: textBinding(slotBindings, "contact-title", "Contact"),
        fontSize: 18,
        fontWeight: "700",
        color: "#4B3F39",
        textAlign: "center",
      }),
      makeText(frame, options.instanceId, {
        suffix: "contact-items",
        x: 304,
        y: 1178,
        width: 636,
        height: 96,
        text: contactFit.text,
        fontSize: contactFit.fontSize,
        color: "#475569",
        lineHeight: 1.42,
      }),
    ];
  }
  const frame = getLayoutFrame(options.canvas);
  const portrait = imageBinding(slotBindings, "portrait", { src: "", alt: "Portrait" });
  const experienceItems = listBinding(slotBindings, "experience-items", []);
  const skillItems = listBinding(slotBindings, "skills-items", []);
  const contactItems = listBinding(slotBindings, "contact-items", []);
  const elements: PresentationSlideElement[] = [
    makeRect(frame, "pb-bg", {
      suffix: "bg", x: 20, y: 20, width: 1240, height: 680,
      fill: "#FFFFFF", stroke: "#CBD5E1",
    }),
  ];
  if (portrait.src.trim()) {
    elements.push(makeImage(frame, "pb-portrait", {
      suffix: "portrait", x: 44, y: 44, width: 100, height: 100,
      src: portrait.src, alt: portrait.alt,
      imageFit: "cover", mediaShape: "circle",
    }));
  } else {
    elements.push(makeRect(frame, "pb-portrait-placeholder", {
      suffix: "portrait-ph", x: 44, y: 44, width: 100, height: 100,
      fill: "#E2E8F0", stroke: "#94A3B8",
    }));
  }
  elements.push(
    makeText(frame, "pb-name", {
      suffix: "name", x: 164, y: 52, width: 400, height: 36,
      text: textBinding(slotBindings, "name", ""),
      fontSize: 28, fontWeight: "700", color: "#0F172A",
    }),
    makeText(frame, "pb-role", {
      suffix: "role", x: 164, y: 92, width: 400, height: 24,
      text: textBinding(slotBindings, "role", ""),
      fontSize: 16, fontWeight: "500", color: "#475569",
    }),
    makeText(frame, "pb-bio-title", {
      suffix: "bio-title", x: 164, y: 124, width: 200, height: 20,
      text: textBinding(slotBindings, "bio-title", "About"),
      fontSize: 14, fontWeight: "700", color: "#334155",
    }),
    makeText(frame, "pb-bio-body", {
      suffix: "bio-body", x: 164, y: 148, width: 1060, height: 60,
      text: textBinding(slotBindings, "bio-body", ""),
      fontSize: 15, color: "#64748B", lineHeight: 1.4,
    }),
  );
  // Experience column
  const colY = 232;
  const colW = 370;
  elements.push(
    makeRect(frame, "pb-exp-card", { suffix: "exp-card", x: 44, y: colY, width: colW, height: 430, fill: "#F8FAFC", stroke: "#E2E8F0" }),
    makeText(frame, "pb-exp-title", { suffix: "exp-title", x: 64, y: colY + 16, width: 200, height: 20, text: textBinding(slotBindings, "experience-title", "Experience"), fontSize: 14, fontWeight: "700", color: "#334155" }),
    ...experienceItems.slice(0, 6).map((item, i) =>
      makeText(frame, `pb-exp-${i}`, { suffix: `exp-${i}`, x: 64, y: colY + 48 + i * 28, width: colW - 40, height: 24, text: `• ${item}`, fontSize: 14, color: "#64748B", lineHeight: 1.3 }),
    ),
  );
  // Skills column
  elements.push(
    makeRect(frame, "pb-skills-card", { suffix: "skills-card", x: 44 + colW + 16, y: colY, width: colW, height: 430, fill: "#F8FAFC", stroke: "#E2E8F0" }),
    makeText(frame, "pb-skills-title", { suffix: "skills-title", x: 64 + colW + 16, y: colY + 16, width: 200, height: 20, text: textBinding(slotBindings, "skills-title", "Skills"), fontSize: 14, fontWeight: "700", color: "#334155" }),
    ...skillItems.slice(0, 8).map((item, i) =>
      makeText(frame, `pb-skill-${i}`, { suffix: `skill-${i}`, x: 64 + colW + 16, y: colY + 48 + i * 28, width: colW - 40, height: 24, text: `• ${item}`, fontSize: 14, color: "#64748B", lineHeight: 1.3 }),
    ),
  );
  // Contact column
  elements.push(
    makeRect(frame, "pb-contact-card", { suffix: "contact-card", x: 44 + (colW + 16) * 2, y: colY, width: colW, height: 430, fill: "#F8FAFC", stroke: "#E2E8F0" }),
    makeText(frame, "pb-contact-title", { suffix: "contact-title", x: 64 + (colW + 16) * 2, y: colY + 16, width: 200, height: 20, text: textBinding(slotBindings, "contact-title", "Contact"), fontSize: 14, fontWeight: "700", color: "#334155" }),
    ...contactItems.slice(0, 4).map((item, i) =>
      makeText(frame, `pb-contact-${i}`, { suffix: `contact-${i}`, x: 64 + (colW + 16) * 2, y: colY + 48 + i * 28, width: colW - 40, height: 24, text: `• ${item}`, fontSize: 14, color: "#64748B", lineHeight: 1.3 }),
    ),
  );
  return elements;
}

function buildSectionedExplainerComponent(
  options: BuildComponentInstanceOptions,
  slotBindings: PresentationComponentSlotBinding[],
): PresentationSlideElement[] {
  if (isPortraitCanvas(options.canvas)) {
    const frame = getPortraitDocumentFrame(options.canvas);
    const heroFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["sectioned-explainer"]?.hero;
    const titleFit = fitTextBox({
      text: textBinding(slotBindings, "title", ""),
      width: 888, height: 108, baseFontSize: 48, minFontSize: 30, lineHeight: 1.08, maxLines: 3,
    });
    const introFit = fitTextBox({
      text: textBinding(slotBindings, "intro", ""),
      width: 888, height: 110, baseFontSize: 22, minFontSize: 14, lineHeight: 1.36, maxLines: 5,
    });
    const s1Body = fitTextBox({
      text: textBinding(slotBindings, "section1-body", ""),
      width: 258, height: 234, baseFontSize: 18, minFontSize: 12, lineHeight: 1.42, maxLines: 12,
    });
    const s2Body = fitTextBox({
      text: textBinding(slotBindings, "section2-body", ""),
      width: 258, height: 234, baseFontSize: 18, minFontSize: 12, lineHeight: 1.42, maxLines: 12,
    });
    const s3Body = fitTextBox({
      text: textBinding(slotBindings, "section3-body", ""),
      width: 258, height: 234, baseFontSize: 18, minFontSize: 12, lineHeight: 1.42, maxLines: 12,
    });
    const takeawaysFit = fitListTextBox({
      items: listBinding(slotBindings, "takeaways", []),
      width: 816, height: 108, baseFontSize: 18, minFontSize: 12, lineHeight: 1.42, maxLines: 6, bulletPrefix: "• ",
    });
    const heroElements = buildMediaSlotElements(frame, options.instanceId, slotBindings, {
      slotId: "hero",
      suffixBase: "hero",
      x: 56,
      y: 54,
      width: 888,
      height: 370,
      fallbackAlt: "Hero visual",
      placeholderText: "Explainer image or video",
      placeholderColor: "#1D4ED8",
      placeholderFontSize: 30,
      placeholderFill: "#DBEAFE",
      mediaShape: heroFrameStyle?.mediaShape,
      mediaCornerRadius: heroFrameStyle?.mediaCornerRadius,
    });

    return [
      makeRect(frame, options.instanceId, {
        suffix: "canvas-bg",
        x: 0,
        y: 0,
        width: PORTRAIT_LAYOUT_WIDTH,
        height: PORTRAIT_LAYOUT_HEIGHT,
        fill: "#FFFFFF",
      }),
      ...heroElements,
      makeRect(frame, options.instanceId, {
        suffix: "eyebrow-bg",
        x: 56,
        y: 454,
        width: 230,
        height: 42,
        fill: "#DBEAFE",
      }),
      makeText(frame, options.instanceId, {
        suffix: "eyebrow",
        x: 86,
        y: 466,
        width: 170,
        height: 16,
        text: textBinding(slotBindings, "eyebrow", ""),
        color: "#1D4ED8",
        fontSize: 18,
        fontWeight: "700",
        textAlign: "center",
      }),
      makeText(frame, options.instanceId, {
        suffix: "title",
        x: 56,
        y: 520,
        width: 888,
        height: 108,
        text: titleFit.text,
        color: "#0F172A",
        fontSize: titleFit.fontSize,
        fontWeight: "700",
        lineHeight: 1.08,
      }),
      makeText(frame, options.instanceId, {
        suffix: "intro",
        x: 56,
        y: 652,
        width: 888,
        height: 110,
        text: introFit.text,
        color: "#475569",
        fontSize: introFit.fontSize,
        fontWeight: "500",
        lineHeight: 1.36,
      }),
      makeText(frame, options.instanceId, {
        suffix: "section-1-heading",
        x: 56,
        y: 794,
        width: 258,
        height: 30,
        text: textBinding(slotBindings, "section1-heading", ""),
        color: "#0F172A",
        fontSize: 24,
        fontWeight: "700",
      }),
      makeText(frame, options.instanceId, {
        suffix: "section-1-body",
        x: 56,
        y: 836,
        width: 258,
        height: 234,
        text: s1Body.text,
        color: "#334155",
        fontSize: s1Body.fontSize,
        lineHeight: 1.42,
      }),
      makeText(frame, options.instanceId, {
        suffix: "section-2-heading",
        x: 370,
        y: 794,
        width: 258,
        height: 30,
        text: textBinding(slotBindings, "section2-heading", ""),
        color: "#0F172A",
        fontSize: 24,
        fontWeight: "700",
      }),
      makeText(frame, options.instanceId, {
        suffix: "section-2-body",
        x: 370,
        y: 836,
        width: 258,
        height: 234,
        text: s2Body.text,
        color: "#334155",
        fontSize: s2Body.fontSize,
        lineHeight: 1.42,
      }),
      makeText(frame, options.instanceId, {
        suffix: "section-3-heading",
        x: 686,
        y: 794,
        width: 258,
        height: 30,
        text: textBinding(slotBindings, "section3-heading", ""),
        color: "#0F172A",
        fontSize: 24,
        fontWeight: "700",
      }),
      makeText(frame, options.instanceId, {
        suffix: "section-3-body",
        x: 686,
        y: 836,
        width: 258,
        height: 234,
        text: s3Body.text,
        color: "#334155",
        fontSize: s3Body.fontSize,
        lineHeight: 1.42,
      }),
      makeRect(frame, options.instanceId, {
        suffix: "takeaways-card",
        x: 56,
        y: 1124,
        width: 888,
        height: 220,
        fill: "#EEF2FF",
      }),
      makeText(frame, options.instanceId, {
        suffix: "takeaways-title",
        x: 92,
        y: 1160,
        width: 220,
        height: 28,
        text: textBinding(slotBindings, "takeaways-title", "Key Takeaways"),
        color: "#4338CA",
        fontSize: 22,
        fontWeight: "700",
      }),
      makeText(frame, options.instanceId, {
        suffix: "takeaways",
        x: 92,
        y: 1208,
        width: 816,
        height: 108,
        text: takeawaysFit.text,
        color: "#334155",
        fontSize: takeawaysFit.fontSize,
        lineHeight: 1.42,
      }),
    ];
  }
  const frame = getLayoutFrame(options.canvas);
  const takeaways = listBinding(slotBindings, "takeaways", [])
    .map((item) => `• ${item}`)
    .join("\n");

  return [
    makeRect(frame, options.instanceId, {
      suffix: "canvas-bg",
      x: 72,
      y: 64,
      width: 1136,
      height: 592,
      fill: "rgba(248,250,252,0.98)",
      stroke: "#cbd5e1",
      strokeWidth: 2,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "eyebrow-bg",
      x: 96,
      y: 90,
      width: 200,
      height: 34,
      fill: "#dbeafe",
      stroke: "#60a5fa",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "eyebrow",
      x: 116,
      y: 98,
      width: 160,
      height: 18,
      text: textBinding(slotBindings, "eyebrow", ""),
      color: "#1d4ed8",
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "title",
      x: 96,
      y: 140,
      width: 1030,
      height: 58,
      text: textBinding(slotBindings, "title", ""),
      color: "#0f172a",
      fontSize: 42,
      fontWeight: "700",
      lineHeight: 1.1,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "intro-card",
      x: 96,
      y: 214,
      width: 330,
      height: 212,
      fill: "#e0f2fe",
      stroke: "#7dd3fc",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "intro",
      x: 120,
      y: 236,
      width: 282,
      height: 168,
      text: textBinding(slotBindings, "intro", ""),
      color: "#0f172a",
      fontSize: 18,
      fontWeight: "500",
      lineHeight: 1.5,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "takeaways-card",
      x: 96,
      y: 444,
      width: 330,
      height: 176,
      fill: "#ffffff",
      stroke: "#cbd5e1",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "takeaways-title",
      x: 120,
      y: 464,
      width: 184,
      height: 24,
      text: textBinding(slotBindings, "takeaways-title", ""),
      color: "#2563eb",
      fontSize: 19,
      fontWeight: "700",
    }),
    makeText(frame, options.instanceId, {
      suffix: "takeaways",
      x: 120,
      y: 498,
      width: 282,
      height: 108,
      text: takeaways,
      color: "#0f172a",
      fontSize: 16,
      fontWeight: "500",
      lineHeight: 1.42,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "sections-card",
      x: 458,
      y: 214,
      width: 654,
      height: 406,
      fill: "#ffffff",
      stroke: "#cbd5e1",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "section-1-heading",
      x: 486,
      y: 240,
      width: 590,
      height: 24,
      text: textBinding(slotBindings, "section1-heading", ""),
      color: "#2563eb",
      fontSize: 24,
      fontWeight: "700",
    }),
    makeText(frame, options.instanceId, {
      suffix: "section-1-body",
      x: 486,
      y: 272,
      width: 590,
      height: 94,
      text: textBinding(slotBindings, "section1-body", ""),
      color: "#0f172a",
      fontSize: 18,
      fontWeight: "500",
      lineHeight: 1.46,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "section-1-divider",
      x: 486,
      y: 380,
      width: 590,
      height: 2,
      fill: "#e2e8f0",
    }),
    makeText(frame, options.instanceId, {
      suffix: "section-2-heading",
      x: 486,
      y: 398,
      width: 590,
      height: 24,
      text: textBinding(slotBindings, "section2-heading", ""),
      color: "#2563eb",
      fontSize: 24,
      fontWeight: "700",
    }),
    makeText(frame, options.instanceId, {
      suffix: "section-2-body",
      x: 486,
      y: 430,
      width: 590,
      height: 94,
      text: textBinding(slotBindings, "section2-body", ""),
      color: "#0f172a",
      fontSize: 18,
      fontWeight: "500",
      lineHeight: 1.46,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "section-2-divider",
      x: 486,
      y: 538,
      width: 590,
      height: 2,
      fill: "#e2e8f0",
    }),
    makeText(frame, options.instanceId, {
      suffix: "section-3-heading",
      x: 486,
      y: 556,
      width: 590,
      height: 24,
      text: textBinding(slotBindings, "section3-heading", ""),
      color: "#2563eb",
      fontSize: 24,
      fontWeight: "700",
    }),
    makeText(frame, options.instanceId, {
      suffix: "section-3-body",
      x: 486,
      y: 588,
      width: 590,
      height: 72,
      text: textBinding(slotBindings, "section3-body", ""),
      color: "#0f172a",
      fontSize: 18,
      fontWeight: "500",
      lineHeight: 1.44,
    }),
  ];
}

function buildFullpageImageComponent(
  options: BuildComponentInstanceOptions,
  slotBindings: PresentationComponentSlotBinding[],
): PresentationSlideElement[] {
  const image = imageBinding(slotBindings, "fullpage", { src: "", alt: "Full-page image" });
  return buildMediaSlotElements(
    { scale: 1, offsetX: 0, offsetY: 0 },
    options.instanceId,
    slotBindings,
    {
      slotId: "fullpage",
      suffix: "fullpage",
      x: 0,
      y: 0,
      width: options.canvas.width,
      height: options.canvas.height,
      defaultSrc: image.src,
      defaultAlt: image.alt,
      mediaType: "image",
    },
    undefined,
  );
}

function buildFullpageVideoComponent(
  options: BuildComponentInstanceOptions,
  slotBindings: PresentationComponentSlotBinding[],
): PresentationSlideElement[] {
  const video = videoBinding(slotBindings, "fullpage", { src: "", poster: "", title: "Full-page video" });
  return buildMediaSlotElements(
    { scale: 1, offsetX: 0, offsetY: 0 },
    options.instanceId,
    slotBindings,
    {
      slotId: "fullpage",
      suffix: "fullpage",
      x: 0,
      y: 0,
      width: options.canvas.width,
      height: options.canvas.height,
      defaultSrc: video.src,
      defaultAlt: video.title,
      mediaType: "video",
    },
    undefined,
  );
}

function buildFallbackElementsForComponent(
  componentId: BuiltInPresentationComponentId,
  options: BuildComponentInstanceOptions,
  slotBindings: PresentationComponentSlotBinding[],
): PresentationSlideElement[] {
  switch (componentId) {
    case "process-steps":
      return buildProcessStepsComponent(options, slotBindings);
    case "timeline-flow":
      return buildTimelineFlowComponent(options, slotBindings);
    case "timeline-report":
      return buildTimelineReportComponent(options, slotBindings);
    case "feature-highlights":
      return buildFeatureHighlightsComponent(options, slotBindings);
    case "infographic-grid":
      return buildInfographicGridComponent(options, slotBindings);
    case "stat-cards":
      return buildStatCardsComponent(options, slotBindings);
    case "sectioned-explainer":
      return buildSectionedExplainerComponent(options, slotBindings);
    case "profile-summary":
      return buildProfileSummaryComponent(options, slotBindings);
    case "quote-callout":
      return buildQuoteCalloutComponent(options, slotBindings);
    case "video-spotlight":
      return buildVideoSpotlightComponent(options, slotBindings);
    case "poster-spotlight":
      return buildPosterSpotlightComponent(options, slotBindings);
    case "framed-image-story":
      return buildFramedImageStoryComponent(options, slotBindings);
    case "photo-collage":
      return buildPhotoCollageComponent(options, slotBindings);
    case "a4-photo-grid":
      return buildA4PhotoGridComponent(options, slotBindings);
    case "landscape-photo-story":
      return buildLandscapePhotoStoryComponent(options, slotBindings);
    case "article-focus":
      return buildArticleFocusComponent(options, slotBindings);
    case "two-column-article":
      return buildTwoColumnArticleComponent(options, slotBindings);
    case "faq-stack":
      return buildFaqStackComponent(options, slotBindings);
    case "profile-board":
      return buildProfileBoardComponent(options, slotBindings);
    case "fullpage-image":
    case "fullpage-image-landscape":
      return buildFullpageImageComponent(options, slotBindings);
    case "fullpage-video":
    case "fullpage-video-landscape":
      return buildFullpageVideoComponent(options, slotBindings);
  }
}

const COMPONENT_SLOT_DEFINITIONS: Record<BuiltInPresentationComponentId, readonly BuiltInPresentationComponentSlotDefinition[]> = {
  "process-steps": [
    { id: "title", label: "Title", type: "text" },
    { id: "subtitle", label: "Subtitle", type: "text", multiline: true },
    { id: "step1-label", label: "Step 1 Label", type: "text" },
    { id: "step1-title", label: "Step 1 Title", type: "text" },
    { id: "step1-body", label: "Step 1 Body", type: "text", multiline: true },
    { id: "step2-label", label: "Step 2 Label", type: "text" },
    { id: "step2-title", label: "Step 2 Title", type: "text" },
    { id: "step2-body", label: "Step 2 Body", type: "text", multiline: true },
    { id: "step3-label", label: "Step 3 Label", type: "text" },
    { id: "step3-title", label: "Step 3 Title", type: "text" },
    { id: "step3-body", label: "Step 3 Body", type: "text", multiline: true },
  ],
  "timeline-flow": [
    { id: "eyebrow", label: "Eyebrow", type: "text" },
    { id: "title", label: "Title", type: "text", multiline: true },
    { id: "subtitle", label: "Subtitle", type: "text", multiline: true },
    { id: "milestone1-date", label: "Milestone 1 Date", type: "text" },
    { id: "milestone1-title", label: "Milestone 1 Title", type: "text" },
    { id: "milestone1-body", label: "Milestone 1 Body", type: "text", multiline: true },
    { id: "milestone2-date", label: "Milestone 2 Date", type: "text" },
    { id: "milestone2-title", label: "Milestone 2 Title", type: "text" },
    { id: "milestone2-body", label: "Milestone 2 Body", type: "text", multiline: true },
    { id: "milestone3-date", label: "Milestone 3 Date", type: "text" },
    { id: "milestone3-title", label: "Milestone 3 Title", type: "text" },
    { id: "milestone3-body", label: "Milestone 3 Body", type: "text", multiline: true },
  ],
  "timeline-report": [
    { id: "eyebrow", label: "Eyebrow", type: "text" },
    { id: "title", label: "Title", type: "text", multiline: true },
    { id: "summary", label: "Summary", type: "text", multiline: true },
    { id: "phase1-date", label: "Phase 1 Marker", type: "text" },
    { id: "phase1-title", label: "Phase 1 Title", type: "text", multiline: true },
    { id: "phase1-body", label: "Phase 1 Body", type: "text", multiline: true },
    { id: "phase2-date", label: "Phase 2 Marker", type: "text" },
    { id: "phase2-title", label: "Phase 2 Title", type: "text", multiline: true },
    { id: "phase2-body", label: "Phase 2 Body", type: "text", multiline: true },
    { id: "phase3-date", label: "Phase 3 Marker", type: "text" },
    { id: "phase3-title", label: "Phase 3 Title", type: "text", multiline: true },
    { id: "phase3-body", label: "Phase 3 Body", type: "text", multiline: true },
    { id: "next-steps-title", label: "Next Steps Title", type: "text" },
    { id: "next-steps", label: "Next Steps", type: "list", placeholder: "One bullet per line" },
  ],
  "feature-highlights": [
    { id: "badge", label: "Badge", type: "text" },
    { id: "title", label: "Headline", type: "text", multiline: true },
    { id: "feature1-title", label: "Feature 1 Title", type: "text" },
    { id: "feature1-body", label: "Feature 1 Body", type: "text", multiline: true },
    { id: "feature2-title", label: "Feature 2 Title", type: "text" },
    { id: "feature2-body", label: "Feature 2 Body", type: "text", multiline: true },
    { id: "feature3-title", label: "Feature 3 Title", type: "text" },
    { id: "feature3-body", label: "Feature 3 Body", type: "text", multiline: true },
  ],
  "infographic-grid": [
    { id: "eyebrow", label: "Eyebrow", type: "text" },
    { id: "title", label: "Headline", type: "text", multiline: true },
    { id: "summary", label: "Summary", type: "text", multiline: true },
    { id: "item1-title", label: "Item 1 Title", type: "text" },
    { id: "item1-body", label: "Item 1 Body", type: "text", multiline: true },
    { id: "item2-title", label: "Item 2 Title", type: "text" },
    { id: "item2-body", label: "Item 2 Body", type: "text", multiline: true },
    { id: "item3-title", label: "Item 3 Title", type: "text" },
    { id: "item3-body", label: "Item 3 Body", type: "text", multiline: true },
    { id: "item4-title", label: "Item 4 Title", type: "text" },
    { id: "item4-body", label: "Item 4 Body", type: "text", multiline: true },
  ],
  "stat-cards": [
    { id: "eyebrow", label: "Eyebrow", type: "text" },
    { id: "title", label: "Headline", type: "text", multiline: true },
    { id: "stat1-value", label: "Stat 1 Value", type: "text" },
    { id: "stat1-label", label: "Stat 1 Label", type: "text", multiline: true },
    { id: "stat2-value", label: "Stat 2 Value", type: "text" },
    { id: "stat2-label", label: "Stat 2 Label", type: "text", multiline: true },
    { id: "stat3-value", label: "Stat 3 Value", type: "text" },
    { id: "stat3-label", label: "Stat 3 Label", type: "text", multiline: true },
  ],
  "sectioned-explainer": [
    { id: "hero", label: "Hero Media", type: "media", placeholder: "https://..." },
    { id: "eyebrow", label: "Eyebrow", type: "text" },
    { id: "title", label: "Headline", type: "text", multiline: true },
    { id: "intro", label: "Intro", type: "text", multiline: true },
    { id: "section1-heading", label: "Section 1 Heading", type: "text" },
    { id: "section1-body", label: "Section 1 Body", type: "text", multiline: true },
    { id: "section2-heading", label: "Section 2 Heading", type: "text" },
    { id: "section2-body", label: "Section 2 Body", type: "text", multiline: true },
    { id: "section3-heading", label: "Section 3 Heading", type: "text" },
    { id: "section3-body", label: "Section 3 Body", type: "text", multiline: true },
    { id: "takeaways-title", label: "Takeaways Title", type: "text" },
    { id: "takeaways", label: "Takeaways", type: "list", placeholder: "One bullet per line" },
  ],
  "profile-summary": [
    { id: "portrait", label: "Portrait Image", type: "image", placeholder: "https://..." },
    { id: "name", label: "Name", type: "text" },
    { id: "role", label: "Role", type: "text" },
    { id: "contact-title", label: "Contact Heading", type: "text" },
    { id: "contact-items", label: "Contact Items", type: "list", placeholder: "One item per line" },
    { id: "about-title", label: "About Title", type: "text" },
    { id: "about-body", label: "About Body", type: "text", multiline: true },
    { id: "highlights-title", label: "Highlights Title", type: "text" },
    { id: "highlights-items", label: "Highlights", type: "list", placeholder: "One bullet per line" },
  ],
  "article-focus": [
    { id: "hero", label: "Hero Media", type: "media", placeholder: "https://..." },
    { id: "eyebrow", label: "Eyebrow", type: "text" },
    { id: "title", label: "Title", type: "text", multiline: true },
    { id: "lead", label: "Lead Paragraph", type: "text", multiline: true },
    { id: "body", label: "Body", type: "text", multiline: true },
    { id: "key-points-title", label: "Key Points Title", type: "text" },
    { id: "key-points", label: "Key Points", type: "list", placeholder: "One point per line" },
    { id: "footnote", label: "Footnote", type: "text" },
  ],
  "two-column-article": [
    { id: "hero", label: "Hero Media", type: "media", placeholder: "https://..." },
    { id: "eyebrow", label: "Eyebrow", type: "text" },
    { id: "title", label: "Title", type: "text", multiline: true },
    { id: "intro", label: "Intro", type: "text", multiline: true },
    { id: "left-title", label: "Left Title", type: "text", multiline: true },
    { id: "left-body", label: "Left Body", type: "text", multiline: true },
    { id: "right-title", label: "Right Title", type: "text", multiline: true },
    { id: "right-body", label: "Right Body", type: "text", multiline: true },
    { id: "takeaways-title", label: "Takeaways Title", type: "text" },
    { id: "takeaways", label: "Takeaways", type: "list", placeholder: "One bullet per line" },
  ],
  "faq-stack": [
    { id: "eyebrow", label: "Eyebrow", type: "text" },
    { id: "title", label: "Title", type: "text", multiline: true },
    { id: "intro", label: "Intro", type: "text", multiline: true },
    { id: "faq1-question", label: "Question 1", type: "text", multiline: true },
    { id: "faq1-answer", label: "Answer 1", type: "text", multiline: true },
    { id: "faq2-question", label: "Question 2", type: "text", multiline: true },
    { id: "faq2-answer", label: "Answer 2", type: "text", multiline: true },
    { id: "faq3-question", label: "Question 3", type: "text", multiline: true },
    { id: "faq3-answer", label: "Answer 3", type: "text", multiline: true },
  ],
  "profile-board": [
    { id: "name", label: "Name", type: "text" },
    { id: "role", label: "Role", type: "text" },
    { id: "portrait", label: "Portrait Image", type: "image", placeholder: "https://..." },
    { id: "bio-title", label: "Bio Title", type: "text" },
    { id: "bio-body", label: "Bio", type: "text", multiline: true },
    { id: "experience-title", label: "Experience Title", type: "text" },
    { id: "experience-items", label: "Experience", type: "list", placeholder: "One item per line" },
    { id: "skills-title", label: "Skills Title", type: "text" },
    { id: "skills-items", label: "Skills", type: "list", placeholder: "One item per line" },
    { id: "contact-title", label: "Contact Title", type: "text" },
    { id: "contact-items", label: "Contact", type: "list", placeholder: "One item per line" },
  ],
  "quote-callout": [
    { id: "quote", label: "Quote", type: "text", multiline: true },
    { id: "eyebrow", label: "Eyebrow", type: "text" },
    { id: "attribution", label: "Supporting Line", type: "text", multiline: true },
  ],
  "video-spotlight": [
    { id: "tag", label: "Tag", type: "text" },
    { id: "headline", label: "Headline", type: "text", multiline: true },
    { id: "body", label: "Body", type: "text", multiline: true },
    { id: "clip", label: "Video Clip", type: "video", placeholder: "https://..." },
    { id: "benefits", label: "Benefit List", type: "list", placeholder: "One bullet per line" },
  ],
  "poster-spotlight": [
    { id: "eyebrow", label: "Eyebrow", type: "text" },
    { id: "headline", label: "Headline", type: "text", multiline: true },
    { id: "subhead", label: "Subhead", type: "text", multiline: true },
    { id: "hero", label: "Hero Media", type: "media", placeholder: "https://..." },
    { id: "benefits", label: "Benefits", type: "list", placeholder: "One bullet per line" },
    { id: "cta", label: "CTA", type: "text" },
  ],
  "framed-image-story": [
    { id: "kicker", label: "Kicker", type: "text" },
    { id: "headline", label: "Headline", type: "text", multiline: true },
    { id: "story", label: "Story Body", type: "text", multiline: true },
    { id: "photo", label: "Media", type: "media", placeholder: "https://..." },
    { id: "caption", label: "Caption", type: "text" },
    { id: "highlights", label: "Highlights", type: "list", placeholder: "One bullet per line" },
  ],
  "photo-collage": [
    { id: "kicker", label: "Kicker", type: "text" },
    { id: "headline", label: "Headline", type: "text", multiline: true },
    { id: "body", label: "Body", type: "text", multiline: true },
    { id: "primary-photo", label: "Primary Media", type: "media", placeholder: "https://..." },
    { id: "secondary-photo", label: "Secondary Media", type: "media", placeholder: "https://..." },
    { id: "caption", label: "Caption", type: "text" },
  ],
  "a4-photo-grid": [
    { id: "eyebrow", label: "Eyebrow", type: "text" },
    { id: "headline", label: "Headline", type: "text", multiline: true },
    { id: "summary", label: "Summary", type: "text", multiline: true },
    { id: "hero-photo", label: "Hero Media", type: "media", placeholder: "https://..." },
    { id: "detail-photo-1", label: "Detail Media 1", type: "media", placeholder: "https://..." },
    { id: "detail-photo-2", label: "Detail Media 2", type: "media", placeholder: "https://..." },
    { id: "detail-photo-3", label: "Detail Media 3", type: "media", placeholder: "https://..." },
    { id: "detail-photo-4", label: "Detail Media 4", type: "media", placeholder: "https://..." },
    { id: "caption", label: "Caption", type: "text" },
  ],
  "landscape-photo-story": [
    { id: "eyebrow", label: "Eyebrow", type: "text" },
    { id: "headline", label: "Headline", type: "text", multiline: true },
    { id: "body", label: "Body", type: "text", multiline: true },
    { id: "hero-photo", label: "Hero Media", type: "media", placeholder: "https://..." },
    { id: "detail-photo-1", label: "Detail Media 1", type: "media", placeholder: "https://..." },
    { id: "detail-photo-2", label: "Detail Media 2", type: "media", placeholder: "https://..." },
    { id: "detail-photo-3", label: "Detail Media 3", type: "media", placeholder: "https://..." },
    { id: "highlights-title", label: "Highlights Title", type: "text" },
    { id: "highlights", label: "Highlights", type: "list", placeholder: "One bullet per line" },
  ],
  "fullpage-image": [
    { id: "fullpage", label: "Image", type: "media", placeholder: "https://..." },
  ],
  "fullpage-image-landscape": [
    { id: "fullpage", label: "Image", type: "media", placeholder: "https://..." },
  ],
  "fullpage-video": [
    { id: "fullpage", label: "Video", type: "media", placeholder: "https://..." },
  ],
  "fullpage-video-landscape": [
    { id: "fullpage", label: "Video", type: "media", placeholder: "https://..." },
  ],
};

function getComponentElementSuffix(elementId: string): string {
  const delimiter = elementId.indexOf("::");
  return delimiter >= 0 ? elementId.slice(delimiter + 2) : elementId;
}

function unionElementBounds(elements: PresentationSlideElement[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (!elements.length) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const element of elements) {
    minX = Math.min(minX, element.x);
    minY = Math.min(minY, element.y);
    maxX = Math.max(maxX, element.x + element.width);
    maxY = Math.max(maxY, element.y + Math.max(2, element.height));
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(16, maxX - minX),
    height: Math.max(16, maxY - minY),
  };
}

const COMPONENT_PREVIEWS: Record<BuiltInPresentationComponentId, string> = {
  "process-steps": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#FFF9ED"/>
      <rect x="28" y="22" width="168" height="14" rx="7" fill="#102A43"/>
      <rect x="28" y="44" width="196" height="8" rx="4" fill="#94A3B8"/>
      <rect x="28" y="70" width="264" height="28" rx="12" fill="#FFF4DD" stroke="#D6B58D"/>
      <circle cx="50" cy="84" r="10" fill="#F59E0B"/>
      <rect x="68" y="78" width="70" height="8" rx="4" fill="#102A43"/>
      <rect x="164" y="78" width="104" height="8" rx="4" fill="#64748B"/>
      <rect x="28" y="108" width="264" height="28" rx="12" fill="#F0F9FF" stroke="#7DD3FC"/>
      <circle cx="50" cy="122" r="10" fill="#0EA5E9"/>
      <rect x="68" y="116" width="74" height="8" rx="4" fill="#102A43"/>
      <rect x="164" y="116" width="98" height="8" rx="4" fill="#64748B"/>
      <rect x="28" y="146" width="264" height="22" rx="11" fill="#FEF2F2" stroke="#FECACA"/>
      <circle cx="50" cy="157" r="8" fill="#EF4444"/>
      <rect x="68" y="153" width="150" height="8" rx="4" fill="#102A43"/>
    </svg>
  `,
  "timeline-flow": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="22" y="20" width="72" height="18" rx="9" fill="#E0F2FE"/>
      <rect x="34" y="26" width="48" height="6" rx="3" fill="#0284C7"/>
      <rect x="22" y="48" width="180" height="16" rx="8" fill="#0F172A"/>
      <rect x="22" y="72" width="200" height="8" rx="4" fill="#64748B"/>
      <rect x="56" y="104" width="208" height="6" rx="3" fill="#CBD5E1"/>
      <circle cx="74" cy="107" r="10" fill="#0EA5E9"/>
      <circle cx="160" cy="107" r="10" fill="#14B8A6"/>
      <circle cx="246" cy="107" r="10" fill="#8B5CF6"/>
      <rect x="34" y="126" width="68" height="14" rx="7" fill="#FFFFFF" stroke="#7DD3FC"/>
      <rect x="42" y="130" width="52" height="6" rx="3" fill="#0284C7"/>
      <rect x="126" y="126" width="68" height="14" rx="7" fill="#FFFFFF" stroke="#5EEAD4"/>
      <rect x="134" y="130" width="52" height="6" rx="3" fill="#0F766E"/>
      <rect x="218" y="126" width="68" height="14" rx="7" fill="#FFFFFF" stroke="#C4B5FD"/>
      <rect x="226" y="130" width="52" height="6" rx="3" fill="#7C3AED"/>
    </svg>
  `,
  "timeline-report": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="18" y="18" width="284" height="144" rx="18" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="28" y="28" width="76" height="14" rx="7" fill="#DBEAFE"/>
      <rect x="38" y="32" width="56" height="6" rx="3" fill="#2563EB"/>
      <rect x="28" y="50" width="176" height="10" rx="5" fill="#0F172A"/>
      <rect x="28" y="66" width="164" height="6" rx="3" fill="#64748B"/>
      <rect x="28" y="78" width="156" height="6" rx="3" fill="#64748B"/>
      <rect x="220" y="50" width="66" height="88" rx="10" fill="#EFF6FF" stroke="#BFDBFE"/>
      <rect x="230" y="58" width="42" height="6" rx="3" fill="#1D4ED8"/>
      <rect x="230" y="72" width="46" height="5" rx="2.5" fill="#475569"/>
      <rect x="230" y="82" width="42" height="5" rx="2.5" fill="#475569"/>
      <rect x="230" y="92" width="48" height="5" rx="2.5" fill="#475569"/>
      <rect x="86" y="96" width="4" height="52" rx="2" fill="#CBD5E1"/>
      <circle cx="88" cy="106" r="8" fill="#2563EB"/>
      <circle cx="88" cy="126" r="8" fill="#0F766E"/>
      <circle cx="88" cy="146" r="8" fill="#7C3AED"/>
      <rect x="106" y="98" width="42" height="10" rx="5" fill="#FFFFFF" stroke="#2563EB"/>
      <rect x="156" y="98" width="54" height="6" rx="3" fill="#0F172A"/>
      <rect x="156" y="110" width="56" height="5" rx="2.5" fill="#64748B"/>
      <rect x="106" y="118" width="42" height="10" rx="5" fill="#FFFFFF" stroke="#0F766E"/>
      <rect x="156" y="118" width="56" height="6" rx="3" fill="#0F172A"/>
      <rect x="156" y="130" width="54" height="5" rx="2.5" fill="#64748B"/>
      <rect x="106" y="138" width="42" height="10" rx="5" fill="#FFFFFF" stroke="#7C3AED"/>
      <rect x="156" y="138" width="56" height="6" rx="3" fill="#0F172A"/>
      <rect x="156" y="150" width="52" height="5" rx="2.5" fill="#64748B"/>
    </svg>
  `,
  "feature-highlights": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="22" y="20" width="86" height="18" rx="9" fill="#DBEAFE"/>
      <rect x="32" y="26" width="66" height="6" rx="3" fill="#2563EB"/>
      <rect x="22" y="48" width="196" height="16" rx="8" fill="#0F172A"/>
      <rect x="22" y="72" width="84" height="74" rx="14" fill="white" stroke="#CBD5E1"/>
      <circle cx="48" cy="94" r="10" fill="#0F766E"/>
      <rect x="64" y="88" width="30" height="7" rx="3.5" fill="#0F172A"/>
      <rect x="34" y="108" width="54" height="6" rx="3" fill="#64748B"/>
      <rect x="34" y="120" width="42" height="6" rx="3" fill="#64748B"/>
      <rect x="118" y="72" width="84" height="74" rx="14" fill="white" stroke="#CBD5E1"/>
      <circle cx="144" cy="94" r="10" fill="#2563EB"/>
      <rect x="160" y="88" width="26" height="7" rx="3.5" fill="#0F172A"/>
      <rect x="130" y="108" width="56" height="6" rx="3" fill="#64748B"/>
      <rect x="130" y="120" width="44" height="6" rx="3" fill="#64748B"/>
      <rect x="214" y="72" width="84" height="74" rx="14" fill="white" stroke="#CBD5E1"/>
      <circle cx="240" cy="94" r="10" fill="#7C3AED"/>
      <rect x="256" y="88" width="24" height="7" rx="3.5" fill="#0F172A"/>
      <rect x="226" y="108" width="54" height="6" rx="3" fill="#64748B"/>
      <rect x="226" y="120" width="42" height="6" rx="3" fill="#64748B"/>
    </svg>
  `,
  "infographic-grid": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="22" y="20" width="82" height="18" rx="9" fill="#EDE9FE"/>
      <rect x="34" y="26" width="58" height="6" rx="3" fill="#7C3AED"/>
      <rect x="22" y="48" width="204" height="16" rx="8" fill="#0F172A"/>
      <rect x="22" y="72" width="196" height="8" rx="4" fill="#64748B"/>
      <rect x="22" y="94" width="128" height="30" rx="10" fill="#FFFFFF" stroke="#F59E0B"/>
      <rect x="34" y="104" width="68" height="7" rx="3.5" fill="#0F172A"/>
      <rect x="34" y="116" width="82" height="5" rx="2.5" fill="#64748B"/>
      <rect x="170" y="94" width="128" height="30" rx="10" fill="#FFFFFF" stroke="#0EA5E9"/>
      <rect x="182" y="104" width="68" height="7" rx="3.5" fill="#0F172A"/>
      <rect x="182" y="116" width="82" height="5" rx="2.5" fill="#64748B"/>
      <rect x="22" y="132" width="128" height="30" rx="10" fill="#FFFFFF" stroke="#10B981"/>
      <rect x="34" y="142" width="68" height="7" rx="3.5" fill="#0F172A"/>
      <rect x="34" y="154" width="82" height="5" rx="2.5" fill="#64748B"/>
      <rect x="170" y="132" width="128" height="30" rx="10" fill="#FFFFFF" stroke="#8B5CF6"/>
      <rect x="182" y="142" width="68" height="7" rx="3.5" fill="#0F172A"/>
      <rect x="182" y="154" width="82" height="5" rx="2.5" fill="#64748B"/>
    </svg>
  `,
  "stat-cards": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="20" y="20" width="90" height="18" rx="9" fill="#DBEAFE"/>
      <rect x="32" y="26" width="66" height="6" rx="3" fill="#2563EB"/>
      <rect x="20" y="50" width="196" height="16" rx="8" fill="#0F172A"/>
      <rect x="20" y="78" width="84" height="76" rx="14" fill="#FFFFFF" stroke="#CBD5E1"/>
      <circle cx="46" cy="98" r="10" fill="#2563EB"/>
      <rect x="34" y="118" width="42" height="12" rx="6" fill="#2563EB"/>
      <rect x="34" y="136" width="52" height="6" rx="3" fill="#64748B"/>
      <rect x="118" y="78" width="84" height="76" rx="14" fill="#FFFFFF" stroke="#CBD5E1"/>
      <circle cx="144" cy="98" r="10" fill="#0F766E"/>
      <rect x="132" y="118" width="38" height="12" rx="6" fill="#0F766E"/>
      <rect x="132" y="136" width="54" height="6" rx="3" fill="#64748B"/>
      <rect x="216" y="78" width="84" height="76" rx="14" fill="#FFFFFF" stroke="#CBD5E1"/>
      <circle cx="242" cy="98" r="10" fill="#7C3AED"/>
      <rect x="230" y="118" width="40" height="12" rx="6" fill="#7C3AED"/>
      <rect x="230" y="136" width="52" height="6" rx="3" fill="#64748B"/>
    </svg>
  `,
  "sectioned-explainer": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="18" y="18" width="284" height="144" rx="18" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="30" y="30" width="86" height="16" rx="8" fill="#DBEAFE"/>
      <rect x="42" y="35" width="62" height="6" rx="3" fill="#2563EB"/>
      <rect x="30" y="56" width="204" height="10" rx="5" fill="#0F172A"/>
      <rect x="30" y="72" width="188" height="10" rx="5" fill="#0F172A"/>
      <rect x="30" y="92" width="92" height="64" rx="12" fill="#E0F2FE" stroke="#7DD3FC"/>
      <rect x="42" y="104" width="64" height="6" rx="3" fill="#334155"/>
      <rect x="42" y="116" width="70" height="6" rx="3" fill="#334155"/>
      <rect x="42" y="128" width="62" height="6" rx="3" fill="#334155"/>
      <rect x="132" y="92" width="156" height="64" rx="12" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="146" y="104" width="74" height="7" rx="3.5" fill="#2563EB"/>
      <rect x="146" y="118" width="126" height="6" rx="3" fill="#334155"/>
      <rect x="146" y="130" width="120" height="6" rx="3" fill="#334155"/>
      <rect x="146" y="142" width="112" height="6" rx="3" fill="#334155"/>
    </svg>
  `,
  "article-focus": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="18" y="18" width="284" height="144" rx="18" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="30" y="28" width="72" height="14" rx="7" fill="#D1FAE5"/>
      <rect x="38" y="32" width="56" height="6" rx="3" fill="#059669"/>
      <rect x="30" y="50" width="180" height="10" rx="5" fill="#0F172A"/>
      <rect x="30" y="66" width="160" height="8" rx="4" fill="#475569"/>
      <rect x="30" y="82" width="170" height="6" rx="3" fill="#64748B"/>
      <rect x="30" y="92" width="155" height="6" rx="3" fill="#64748B"/>
      <rect x="30" y="102" width="165" height="6" rx="3" fill="#64748B"/>
      <rect x="30" y="112" width="140" height="6" rx="3" fill="#64748B"/>
      <rect x="220" y="50" width="72" height="96" rx="10" fill="#F0FDF4" stroke="#86EFAC"/>
      <rect x="228" y="58" width="56" height="6" rx="3" fill="#059669"/>
      <rect x="228" y="70" width="52" height="5" rx="2.5" fill="#334155"/>
      <rect x="228" y="80" width="48" height="5" rx="2.5" fill="#334155"/>
      <rect x="228" y="90" width="54" height="5" rx="2.5" fill="#334155"/>
      <rect x="228" y="100" width="44" height="5" rx="2.5" fill="#334155"/>
      <rect x="228" y="110" width="50" height="5" rx="2.5" fill="#334155"/>
    </svg>
  `,
  "two-column-article": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="18" y="18" width="284" height="144" rx="18" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="30" y="28" width="86" height="14" rx="7" fill="#EEF2FF"/>
      <rect x="40" y="32" width="66" height="6" rx="3" fill="#4338CA"/>
      <rect x="30" y="50" width="188" height="10" rx="5" fill="#0F172A"/>
      <rect x="30" y="66" width="174" height="6" rx="3" fill="#64748B"/>
      <rect x="30" y="82" width="120" height="64" rx="10" fill="#F8FAFC" stroke="#E2E8F0"/>
      <rect x="40" y="92" width="68" height="6" rx="3" fill="#0F172A"/>
      <rect x="40" y="104" width="96" height="5" rx="2.5" fill="#64748B"/>
      <rect x="40" y="114" width="90" height="5" rx="2.5" fill="#64748B"/>
      <rect x="40" y="124" width="84" height="5" rx="2.5" fill="#64748B"/>
      <rect x="170" y="82" width="120" height="64" rx="10" fill="#F8FAFC" stroke="#E2E8F0"/>
      <rect x="180" y="92" width="68" height="6" rx="3" fill="#0F172A"/>
      <rect x="180" y="104" width="96" height="5" rx="2.5" fill="#64748B"/>
      <rect x="180" y="114" width="88" height="5" rx="2.5" fill="#64748B"/>
      <rect x="180" y="124" width="82" height="5" rx="2.5" fill="#64748B"/>
      <rect x="30" y="152" width="260" height="12" rx="6" fill="#EEF2FF"/>
      <rect x="42" y="155" width="70" height="5" rx="2.5" fill="#4338CA"/>
      <rect x="124" y="155" width="72" height="5" rx="2.5" fill="#334155"/>
      <rect x="208" y="155" width="64" height="5" rx="2.5" fill="#334155"/>
    </svg>
  `,
  "faq-stack": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="18" y="18" width="284" height="144" rx="18" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="30" y="28" width="54" height="12" rx="6" fill="#DBEAFE"/>
      <rect x="38" y="32" width="38" height="4" rx="2" fill="#2563EB"/>
      <rect x="30" y="50" width="190" height="10" rx="5" fill="#0F172A"/>
      <rect x="30" y="66" width="168" height="6" rx="3" fill="#64748B"/>
      <rect x="30" y="78" width="160" height="6" rx="3" fill="#64748B"/>
      <rect x="30" y="94" width="260" height="24" rx="8" fill="#F8FAFC" stroke="#E2E8F0"/>
      <rect x="38" y="100" width="42" height="8" rx="4" fill="#2563EB"/>
      <rect x="90" y="100" width="170" height="6" rx="3" fill="#0F172A"/>
      <rect x="90" y="110" width="156" height="5" rx="2.5" fill="#64748B"/>
      <rect x="30" y="124" width="260" height="24" rx="8" fill="#F8FAFC" stroke="#E2E8F0"/>
      <rect x="38" y="130" width="42" height="8" rx="4" fill="#0F766E"/>
      <rect x="90" y="130" width="166" height="6" rx="3" fill="#0F172A"/>
      <rect x="90" y="140" width="150" height="5" rx="2.5" fill="#64748B"/>
    </svg>
  `,
  "profile-board": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="18" y="18" width="284" height="144" rx="18" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="30" y="28" width="56" height="56" rx="28" fill="#E2E8F0" stroke="#94A3B8"/>
      <circle cx="58" cy="52" r="14" fill="#CBD5E1"/>
      <rect x="96" y="32" width="100" height="10" rx="5" fill="#0F172A"/>
      <rect x="96" y="48" width="64" height="8" rx="4" fill="#475569"/>
      <rect x="96" y="62" width="140" height="6" rx="3" fill="#64748B"/>
      <rect x="96" y="72" width="130" height="6" rx="3" fill="#64748B"/>
      <rect x="30" y="96" width="80" height="56" rx="8" fill="#F1F5F9" stroke="#E2E8F0"/>
      <rect x="38" y="104" width="52" height="6" rx="3" fill="#334155"/>
      <rect x="38" y="116" width="60" height="5" rx="2.5" fill="#64748B"/>
      <rect x="38" y="126" width="56" height="5" rx="2.5" fill="#64748B"/>
      <rect x="38" y="136" width="48" height="5" rx="2.5" fill="#64748B"/>
      <rect x="120" y="96" width="80" height="56" rx="8" fill="#F1F5F9" stroke="#E2E8F0"/>
      <rect x="128" y="104" width="40" height="6" rx="3" fill="#334155"/>
      <rect x="128" y="116" width="48" height="5" rx="2.5" fill="#64748B"/>
      <rect x="128" y="126" width="52" height="5" rx="2.5" fill="#64748B"/>
      <rect x="128" y="136" width="44" height="5" rx="2.5" fill="#64748B"/>
      <rect x="210" y="96" width="80" height="56" rx="8" fill="#F1F5F9" stroke="#E2E8F0"/>
      <rect x="218" y="104" width="48" height="6" rx="3" fill="#334155"/>
      <rect x="218" y="116" width="56" height="5" rx="2.5" fill="#64748B"/>
      <rect x="218" y="126" width="52" height="5" rx="2.5" fill="#64748B"/>
    </svg>
  `,
  "profile-summary": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="18" y="16" width="92" height="148" rx="18" fill="#1E3A5F"/>
      <rect x="34" y="28" width="60" height="52" rx="14" fill="#27476C" stroke="#7DD3FC"/>
      <circle cx="64" cy="54" r="14" fill="#E2E8F0"/>
      <rect x="34" y="92" width="60" height="8" rx="4" fill="#F8FAFC"/>
      <rect x="42" y="108" width="44" height="12" rx="6" fill="#F4D58D"/>
      <rect x="34" y="130" width="56" height="6" rx="3" fill="#BFDBFE"/>
      <rect x="34" y="142" width="46" height="6" rx="3" fill="#94A3B8"/>
      <rect x="122" y="20" width="180" height="52" rx="16" fill="white" stroke="#CBD5E1"/>
      <rect x="138" y="34" width="104" height="8" rx="4" fill="#0F172A"/>
      <rect x="138" y="48" width="132" height="6" rx="3" fill="#64748B"/>
      <rect x="122" y="84" width="180" height="80" rx="16" fill="white" stroke="#CBD5E1"/>
      <rect x="138" y="98" width="74" height="8" rx="4" fill="#2563EB"/>
      <rect x="138" y="116" width="134" height="6" rx="3" fill="#334155"/>
      <rect x="138" y="128" width="126" height="6" rx="3" fill="#334155"/>
      <rect x="138" y="140" width="118" height="6" rx="3" fill="#334155"/>
    </svg>
  `,
  "quote-callout": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="26" y="42" width="268" height="96" rx="18" fill="#0F172A" fill-opacity=".92"/>
      <circle cx="58" cy="74" r="14" fill="#C084FC"/>
      <rect x="82" y="62" width="154" height="10" rx="5" fill="#F8FAFC"/>
      <rect x="82" y="78" width="170" height="10" rx="5" fill="#F8FAFC"/>
      <rect x="82" y="94" width="132" height="10" rx="5" fill="#F8FAFC"/>
      <rect x="82" y="114" width="82" height="16" rx="8" fill="#EDE9FE"/>
      <rect x="186" y="118" width="76" height="6" rx="3" fill="#A855F7"/>
    </svg>
  `,
  "video-spotlight": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="18" y="18" width="284" height="144" rx="18" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="34" y="34" width="72" height="16" rx="8" fill="#082F49"/>
      <rect x="44" y="39" width="52" height="6" rx="3" fill="#E0F2FE"/>
      <rect x="34" y="62" width="118" height="10" rx="5" fill="#0F172A"/>
      <rect x="34" y="78" width="132" height="10" rx="5" fill="#0F172A"/>
      <rect x="34" y="98" width="110" height="6" rx="3" fill="#64748B"/>
      <rect x="34" y="110" width="100" height="6" rx="3" fill="#64748B"/>
      <rect x="34" y="126" width="120" height="24" rx="10" fill="#EFF6FF" stroke="#93C5FD"/>
      <rect x="184" y="34" width="100" height="116" rx="14" fill="#0F172A"/>
      <polygon points="224,76 224,108 252,92" fill="#38BDF8"/>
    </svg>
  `,
  "poster-spotlight": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#EFF6FF"/>
      <rect x="16" y="16" width="288" height="148" rx="18" fill="#F8FAFC" stroke="#93C5FD"/>
      <rect x="34" y="32" width="84" height="16" rx="8" fill="#0F766E"/>
      <rect x="46" y="37" width="60" height="6" rx="3" fill="#ECFEFF"/>
      <rect x="34" y="60" width="122" height="10" rx="5" fill="#0F172A"/>
      <rect x="34" y="76" width="130" height="10" rx="5" fill="#0F172A"/>
      <rect x="34" y="96" width="110" height="6" rx="3" fill="#64748B"/>
      <rect x="34" y="108" width="96" height="6" rx="3" fill="#64748B"/>
      <rect x="34" y="126" width="116" height="20" rx="10" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="34" y="152" width="92" height="12" rx="6" fill="#2563EB"/>
      <rect x="190" y="26" width="98" height="128" rx="14" fill="#0F172A"/>
      <rect x="204" y="40" width="70" height="96" rx="10" fill="#38BDF8" fill-opacity=".45"/>
      <rect x="214" y="146" width="50" height="4" rx="2" fill="#E0F2FE"/>
    </svg>
  `,
  "framed-image-story": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="18" y="18" width="284" height="144" rx="18" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="30" y="30" width="106" height="102" rx="12" fill="#E2E8F0" stroke="#64748B"/>
      <rect x="40" y="40" width="86" height="82" rx="8" fill="#CBD5E1"/>
      <rect x="30" y="140" width="106" height="12" rx="6" fill="#0F172A"/>
      <rect x="164" y="30" width="72" height="16" rx="8" fill="#EDE9FE"/>
      <rect x="176" y="35" width="48" height="6" rx="3" fill="#7C3AED"/>
      <rect x="164" y="56" width="108" height="9" rx="4.5" fill="#0F172A"/>
      <rect x="164" y="71" width="120" height="9" rx="4.5" fill="#0F172A"/>
      <rect x="164" y="90" width="112" height="6" rx="3" fill="#64748B"/>
      <rect x="164" y="102" width="104" height="6" rx="3" fill="#64748B"/>
      <rect x="164" y="126" width="116" height="28" rx="12" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="178" y="136" width="86" height="6" rx="3" fill="#334155"/>
      <rect x="178" y="146" width="78" height="6" rx="3" fill="#334155"/>
    </svg>
  `,
  "photo-collage": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="18" y="18" width="284" height="144" rx="18" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="30" y="30" width="80" height="16" rx="8" fill="#DBEAFE"/>
      <rect x="42" y="35" width="56" height="6" rx="3" fill="#2563EB"/>
      <rect x="30" y="56" width="154" height="84" rx="14" fill="#CBD5E1" stroke="#64748B"/>
      <rect x="194" y="38" width="92" height="66" rx="12" fill="#E9D5FF" stroke="#8B5CF6"/>
      <rect x="194" y="116" width="92" height="18" rx="9" fill="#0F172A"/>
      <rect x="46" y="146" width="148" height="8" rx="4" fill="#0F172A"/>
      <rect x="194" y="146" width="82" height="6" rx="3" fill="#64748B"/>
    </svg>
  `,
  "a4-photo-grid": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#FFFDF8"/>
      <rect x="20" y="20" width="280" height="140" rx="18" fill="#FFFFFF" stroke="#E2E8F0"/>
      <rect x="32" y="30" width="72" height="14" rx="7" fill="#EEF2FF"/>
      <rect x="42" y="34" width="52" height="6" rx="3" fill="#4338CA"/>
      <rect x="32" y="50" width="156" height="10" rx="5" fill="#0F172A"/>
      <rect x="32" y="66" width="148" height="8" rx="4" fill="#475569"/>
      <rect x="32" y="82" width="112" height="54" rx="10" fill="#CBD5E1"/>
      <rect x="150" y="82" width="60" height="26" rx="8" fill="#DBEAFE"/>
      <rect x="218" y="82" width="60" height="26" rx="8" fill="#DBEAFE"/>
      <rect x="150" y="114" width="60" height="22" rx="8" fill="#E9D5FF"/>
      <rect x="218" y="114" width="60" height="22" rx="8" fill="#E9D5FF"/>
      <rect x="32" y="144" width="176" height="8" rx="4" fill="#111827"/>
      <rect x="218" y="142" width="60" height="12" rx="6" fill="#F1F5F9" stroke="#CBD5E1"/>
    </svg>
  `,
  "landscape-photo-story": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#FFFDF8"/>
      <rect x="20" y="22" width="280" height="136" rx="18" fill="#FFFFFF" stroke="#E2E8F0"/>
      <rect x="30" y="34" width="118" height="92" rx="10" fill="#CBD5E1"/>
      <rect x="160" y="34" width="128" height="24" rx="8" fill="#DBEAFE"/>
      <rect x="168" y="40" width="84" height="6" rx="3" fill="#2563EB"/>
      <rect x="160" y="66" width="128" height="20" rx="8" fill="#E2E8F0"/>
      <rect x="160" y="92" width="128" height="20" rx="8" fill="#E2E8F0"/>
      <rect x="160" y="118" width="128" height="20" rx="8" fill="#E2E8F0"/>
      <rect x="30" y="134" width="116" height="8" rx="4" fill="#0F172A"/>
      <rect x="154" y="144" width="64" height="6" rx="3" fill="#64748B"/>
      <rect x="226" y="140" width="62" height="12" rx="6" fill="#F8FAFC" stroke="#CBD5E1"/>
    </svg>
  `,
  "fullpage-image": `
    <svg viewBox="0 0 180 320" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="180" height="320" fill="#CBD5E1"/>
      <circle cx="90" cy="140" r="28" fill="#94A3B8"/>
      <polygon points="50,180 130,180 90,150" fill="#94A3B8"/>
      <rect x="40" y="170" width="100" height="40" fill="#94A3B8" opacity="0.5"/>
    </svg>
  `,
  "fullpage-image-landscape": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" fill="#CBD5E1"/>
      <circle cx="160" cy="76" r="28" fill="#94A3B8"/>
      <polygon points="120,116 200,116 160,86" fill="#94A3B8"/>
      <rect x="100" y="106" width="120" height="40" fill="#94A3B8" opacity="0.5"/>
    </svg>
  `,
  "fullpage-video": `
    <svg viewBox="0 0 180 320" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="180" height="320" fill="#1E1B4B"/>
      <circle cx="90" cy="160" r="32" fill="none" stroke="#A78BFA" stroke-width="3"/>
      <polygon points="80,146 80,174 106,160" fill="#A78BFA"/>
    </svg>
  `,
  "fullpage-video-landscape": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" fill="#1E1B4B"/>
      <circle cx="160" cy="90" r="32" fill="none" stroke="#A78BFA" stroke-width="3"/>
      <polygon points="150,76 150,104 176,90" fill="#A78BFA"/>
    </svg>
  `,
};

const COMPONENT_CANVAS_INTENTS: Record<BuiltInPresentationComponentId, BuiltInPresentationComponentCanvasIntent> = {
  "process-steps": "adaptive",
  "timeline-flow": "adaptive",
  "timeline-report": "portrait-document",
  "feature-highlights": "adaptive",
  "infographic-grid": "adaptive",
  "stat-cards": "adaptive",
  "sectioned-explainer": "portrait-document",
  "article-focus": "portrait-document",
  "two-column-article": "portrait-document",
  "faq-stack": "portrait-document",
  "profile-board": "portrait-document",
  "profile-summary": "adaptive",
  "quote-callout": "adaptive",
  "video-spotlight": "landscape-16:9",
  "poster-spotlight": "adaptive",
  "framed-image-story": "adaptive",
  "photo-collage": "portrait-document",
  "a4-photo-grid": "portrait-document",
  "landscape-photo-story": "landscape-16:9",
  "fullpage-image": "portrait-document",
  "fullpage-image-landscape": "landscape-16:9",
  "fullpage-video": "portrait-document",
  "fullpage-video-landscape": "landscape-16:9",
};

const COMPONENT_PREVIEW_MEDIA_ZONES: Partial<Record<BuiltInPresentationComponentId, readonly BuiltInPresentationComponentPreviewMediaZone[]>> = {
  "profile-summary": [
    { x: 16, y: 26, width: 22, height: 48, label: "Portrait", slotType: "image" },
  ],
  "sectioned-explainer": [
    { x: 18, y: 10, width: 84, height: 42, label: "Hero", slotType: "media" },
  ],
  "article-focus": [
    { x: 18, y: 8, width: 84, height: 44, label: "Hero", slotType: "media" },
  ],
  "two-column-article": [
    { x: 66, y: 10, width: 28, height: 30, label: "Hero", slotType: "media" },
  ],
  "profile-board": [
    { x: 8, y: 18, width: 22, height: 42, label: "Portrait", slotType: "image" },
  ],
  "video-spotlight": [
    { x: 54, y: 18, width: 42, height: 48, label: "Video", slotType: "video" },
  ],
  "poster-spotlight": [
    { x: 62, y: 16, width: 32, height: 58, label: "Hero", slotType: "media" },
  ],
  "framed-image-story": [
    { x: 10, y: 18, width: 34, height: 44, label: "Media", slotType: "media" },
  ],
  "photo-collage": [
    { x: 10, y: 20, width: 42, height: 48, label: "Primary", slotType: "media" },
    { x: 66, y: 12, width: 20, height: 22, label: "Detail", slotType: "media" },
  ],
  "a4-photo-grid": [
    { x: 10, y: 18, width: 42, height: 62, label: "Hero", slotType: "media" },
    { x: 60, y: 18, width: 26, height: 26, label: "1", slotType: "media" },
    { x: 60, y: 50, width: 26, height: 26, label: "2", slotType: "media" },
    { x: 10, y: 96, width: 20, height: 18, label: "3", slotType: "media" },
    { x: 34, y: 96, width: 20, height: 18, label: "4", slotType: "media" },
  ],
  "landscape-photo-story": [
    { x: 8, y: 18, width: 46, height: 48, label: "Hero", slotType: "media" },
    { x: 64, y: 16, width: 28, height: 16, label: "1", slotType: "media" },
    { x: 64, y: 38, width: 28, height: 16, label: "2", slotType: "media" },
    { x: 64, y: 60, width: 28, height: 16, label: "3", slotType: "media" },
  ],
  "fullpage-image": [
    { x: 0, y: 0, width: 100, height: 100, label: "Image", slotType: "image" },
  ],
  "fullpage-image-landscape": [
    { x: 0, y: 0, width: 100, height: 100, label: "Image", slotType: "image" },
  ],
  "fullpage-video": [
    { x: 0, y: 0, width: 100, height: 100, label: "Video", slotType: "video" },
  ],
  "fullpage-video-landscape": [
    { x: 0, y: 0, width: 100, height: 100, label: "Video", slotType: "video" },
  ],
};

export function getBuiltInPresentationComponentMediaProfile(
  componentId: BuiltInPresentationComponentId,
): BuiltInPresentationComponentMediaProfile {
  const slotTypes = Object.values(PRESENTATION_COMPONENT_MEDIA_SLOT_TYPES[componentId] ?? {});
  return {
    slotCount: (PRESENTATION_COMPONENT_MEDIA_SLOTS[componentId] ?? []).length,
    acceptsImages: slotTypes.some((slotType) => presentationMediaSlotSupportsType(slotType, "image")),
    acceptsVideos: slotTypes.some((slotType) => presentationMediaSlotSupportsType(slotType, "video")),
  };
}

export const BUILT_IN_PRESENTATION_COMPONENTS: readonly BuiltInPresentationComponentDefinition[] = ([
  {
    id: "process-steps",
    label: "Process Steps",
    category: "Process",
    description: "Stacked cards for tutorials, SOPs, or explainers.",
    accentColor: "#f59e0b",
    previewSvg: COMPONENT_PREVIEWS["process-steps"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["process-steps"],
  },
  {
    id: "timeline-flow",
    label: "Timeline Flow",
    category: "Process",
    description: "Milestone timeline for roadmaps, phase plans, and chronological stories.",
    accentColor: "#0ea5e9",
    previewSvg: COMPONENT_PREVIEWS["timeline-flow"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["timeline-flow"],
  },
  {
    id: "timeline-report",
    label: "Timeline Report",
    category: "Document",
    description: "Full-page roadmap board for milestone narratives that need more context than compact timeline cards.",
    accentColor: "#2563eb",
    previewSvg: COMPONENT_PREVIEWS["timeline-report"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["timeline-report"],
  },
  {
    id: "feature-highlights",
    label: "Feature Highlights",
    category: "Marketing",
    description: "Three-column value props with icons and supporting copy.",
    accentColor: "#0ea5e9",
    previewSvg: COMPONENT_PREVIEWS["feature-highlights"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["feature-highlights"],
  },
  {
    id: "infographic-grid",
    label: "Infographic Grid",
    category: "Data",
    description: "Four-cell framework layout for comparisons, pillars, and balanced explainers.",
    accentColor: "#7c3aed",
    previewSvg: COMPONENT_PREVIEWS["infographic-grid"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["infographic-grid"],
  },
  {
    id: "stat-cards",
    label: "Stat Cards",
    category: "Data",
    description: "Three up metric cards for KPIs, campaign numbers, or proof points.",
    accentColor: "#2563eb",
    previewSvg: COMPONENT_PREVIEWS["stat-cards"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["stat-cards"],
  },
  {
    id: "sectioned-explainer",
    label: "Sectioned Explainer",
    category: "Document",
    description: "Full-page explanatory board for dense multi-section slides that still need editable structure.",
    accentColor: "#2563eb",
    previewSvg: COMPONENT_PREVIEWS["sectioned-explainer"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["sectioned-explainer"],
  },
  {
    id: "profile-summary",
    label: "Profile Summary",
    category: "Profile",
    description: "Speaker, team member, or resume-style intro block with editable portrait slot.",
    accentColor: "#334155",
    previewSvg: COMPONENT_PREVIEWS["profile-summary"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["profile-summary"],
  },
  {
    id: "quote-callout",
    label: "Quote Callout",
    category: "Storytelling",
    description: "Editorial pull-quote with attribution and accent line.",
    accentColor: "#8b5cf6",
    previewSvg: COMPONENT_PREVIEWS["quote-callout"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["quote-callout"],
  },
  {
    id: "video-spotlight",
    label: "Video Spotlight",
    category: "Storytelling",
    description: "Headline plus autoplay-ready video slot for promos, demos, or motion-led slides.",
    accentColor: "#0ea5e9",
    previewSvg: COMPONENT_PREVIEWS["video-spotlight"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["video-spotlight"],
  },
  {
    id: "poster-spotlight",
    label: "Poster Spotlight",
    category: "Marketing",
    description: "Campaign-style hero block with one dominant image, short benefits, and a CTA.",
    accentColor: "#2563eb",
    previewSvg: COMPONENT_PREVIEWS["poster-spotlight"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["poster-spotlight"],
  },
  {
    id: "framed-image-story",
    label: "Framed Image Story",
    category: "Storytelling",
    description: "Editorial image-and-copy block with framed photo, caption, and narrative highlights.",
    accentColor: "#7c3aed",
    previewSvg: COMPONENT_PREVIEWS["framed-image-story"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["framed-image-story"],
  },
  {
    id: "photo-collage",
    label: "Photo Board",
    category: "Document",
    description: "Full-page photo-first board with editorial copy and a supporting caption.",
    accentColor: "#2563eb",
    previewSvg: COMPONENT_PREVIEWS["photo-collage"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["photo-collage"],
  },
  {
    id: "a4-photo-grid",
    label: "Multi-Photo Board",
    category: "Document",
    description: "Full-page portrait board with one hero photo, four supporting images, and short editorial copy.",
    accentColor: "#4338ca",
    previewSvg: COMPONENT_PREVIEWS["a4-photo-grid"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["a4-photo-grid"],
  },
  {
    id: "landscape-photo-story",
    label: "Landscape Showcase",
    category: "Document",
    description: "Landscape editorial board with one dominant image, three supporting images, and a concise highlights panel.",
    accentColor: "#0f766e",
    previewSvg: COMPONENT_PREVIEWS["landscape-photo-story"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["landscape-photo-story"],
  },
  {
    id: "article-focus",
    label: "Editorial",
    category: "Document",
    description: "Full-page editorial layout for guides, editorials, and long-form explanatory content with key points sidebar.",
    accentColor: "#059669",
    previewSvg: COMPONENT_PREVIEWS["article-focus"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["article-focus"],
  },
  {
    id: "two-column-article",
    label: "Split Article",
    category: "Document",
    description: "Full-page editorial/report layout for two strong sections with a takeaway strip across the bottom.",
    accentColor: "#4338ca",
    previewSvg: COMPONENT_PREVIEWS["two-column-article"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["two-column-article"],
  },
  {
    id: "faq-stack",
    label: "FAQ Stack",
    category: "Document",
    description: "Full-page question-and-answer stack for support topics, myths, objections, and dense audience FAQ slides.",
    accentColor: "#2563eb",
    previewSvg: COMPONENT_PREVIEWS["faq-stack"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["faq-stack"],
  },
  {
    id: "profile-board",
    label: "Profile Sheet",
    category: "Document",
    description: "Full-page bio/resume layout with portrait, experience, skills, and contact sections.",
    accentColor: "#334155",
    previewSvg: COMPONENT_PREVIEWS["profile-board"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["profile-board"],
  },
  {
    id: "fullpage-image",
    label: "Full-Page Image",
    category: "Document",
    description: "Edge-to-edge image covering the entire page — no text, no overlay.",
    accentColor: "#0284c7",
    previewSvg: COMPONENT_PREVIEWS["fullpage-image"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["fullpage-image"],
  },
  {
    id: "fullpage-image-landscape",
    label: "Full-Page Image (Landscape)",
    category: "Document",
    description: "Landscape edge-to-edge image covering the entire page — no text, no overlay.",
    accentColor: "#0284c7",
    previewSvg: COMPONENT_PREVIEWS["fullpage-image-landscape"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["fullpage-image-landscape"],
  },
  {
    id: "fullpage-video",
    label: "Full-Page Video",
    category: "Document",
    description: "Edge-to-edge video covering the entire page — no text, no overlay.",
    accentColor: "#7c3aed",
    previewSvg: COMPONENT_PREVIEWS["fullpage-video"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["fullpage-video"],
  },
  {
    id: "fullpage-video-landscape",
    label: "Full-Page Video (Landscape)",
    category: "Document",
    description: "Landscape edge-to-edge video covering the entire page — no text, no overlay.",
    accentColor: "#7c3aed",
    previewSvg: COMPONENT_PREVIEWS["fullpage-video-landscape"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["fullpage-video-landscape"],
  },
] as const).map((component) => ({
  ...component,
  canvasIntent: COMPONENT_CANVAS_INTENTS[component.id],
  previewMediaZones: COMPONENT_PREVIEW_MEDIA_ZONES[component.id],
}));

export function getBuiltInPresentationComponentDefinition(
  componentId: string,
): BuiltInPresentationComponentDefinition | null {
  return BUILT_IN_PRESENTATION_COMPONENTS.find((component) => component.id === componentId) ?? null;
}

export function buildBuiltInPresentationComponentInstance(
  componentId: BuiltInPresentationComponentId,
  options: BuildComponentInstanceOptions,
): PresentationComponentInstance {
  const slotBindings = sanitizeSlotBindingsToBudget(componentId, defaultSlotBindingsFor(componentId));
  return {
    id: options.instanceId,
    componentId,
    componentType: componentId,
    definitionRevision: BUILT_IN_COMPONENT_REVISION,
    slotBindings,
    fallbackElements: buildFallbackElementsForComponent(componentId, options, slotBindings),
  };
}

export function buildBuiltInPresentationComponentInstanceFromSlotBindings(
  componentId: BuiltInPresentationComponentId,
  options: BuildComponentInstanceOptions & {
    slotBindings: PresentationComponentSlotBinding[];
  },
): PresentationComponentInstance {
  const slotBindings = sanitizeSlotBindingsToBudget(
    componentId,
    options.slotBindings.map(cloneSlotBinding),
  );
  return {
    id: options.instanceId,
    componentId,
    componentType: componentId,
    definitionRevision: BUILT_IN_COMPONENT_REVISION,
    slotBindings,
    fallbackElements: buildFallbackElementsForComponent(componentId, options, slotBindings),
  };
}

export function rebuildBuiltInPresentationComponentInstance(
  component: PresentationComponentInstance,
  canvas: PresentationCanvasSize,
): PresentationComponentInstance {
  const definition = getBuiltInPresentationComponentDefinition(component.componentId);
  if (!definition) {
    return component;
  }

  const sanitizedSlotBindings = sanitizeSlotBindingsToBudget(definition.id, component.slotBindings);
  const rebuiltFallbackElements = buildFallbackElementsForComponent(definition.id, {
    canvas,
    instanceId: component.id,
  }, sanitizedSlotBindings);
  const previousById = new Map(component.fallbackElements.map((element) => [element.id, element] as const));

  return {
    ...component,
    slotBindings: sanitizedSlotBindings,
    definitionRevision: BUILT_IN_COMPONENT_REVISION,
    fallbackElements: rebuiltFallbackElements.map((element) => {
      const previous = previousById.get(element.id);
      if (!previous) {
        return element;
      }
      return {
        ...element,
        x: previous.x,
        y: previous.y,
        width: previous.width,
        height: previous.height,
        rotation: previous.rotation,
      };
    }),
  };
}

export function buildBuiltInPresentationComponentInstanceFromNarrative(
  componentId: BuiltInPresentationComponentId,
  options: BuildComponentInstanceOptions & {
    narrative: PresentationRecipeNarrativeInput;
  },
): PresentationComponentInstance {
  return buildBuiltInPresentationComponentInstanceFromSlotBindings(componentId, {
    ...options,
    slotBindings: buildPresentationComponentRecipeSlotBindings(componentId, options.narrative),
  });
}

export function getPresentationComponentCanvasSlotAreas(
  component: PresentationComponentInstance,
): PresentationComponentCanvasSlotArea[] {
  const definition = getBuiltInPresentationComponentDefinition(component.componentId);
  if (!definition) {
    return [];
  }

  const slotTargets = PRESENTATION_COMPONENT_SLOT_TARGETS[definition.id];
  const fallbackBySuffix = new Map(
    component.fallbackElements.map((element) => [getComponentElementSuffix(element.id), element] as const),
  );

  return definition.slotDefinitions.flatMap((slot) => {
    const suffixes = slotTargets[slot.id] ?? [];
    const matched = suffixes
      .map((suffix) => fallbackBySuffix.get(suffix))
      .filter((element): element is PresentationSlideElement => Boolean(element));
    const bounds = unionElementBounds(matched);
    if (!bounds) {
      return [];
    }
    return [{
      slotId: slot.id,
      label: slot.label,
      type: slot.type,
      multiline: slot.type === "text" ? slot.multiline : undefined,
      targetElementIds: matched.map((element) => element.id),
      bounds,
    }];
  });
}
