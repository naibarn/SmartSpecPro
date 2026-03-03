import type {
  GenerateAIDraftInput,
  AIPresentationSlide,
  AIDraftProgress,
  AIWatermark,
  SlideStylePreset,
} from "@shared/presentation/aiTypes";
import {
  AI_GEOMETRIC_ACCENT_SHAPES,
  AIWatermarkSchema,
  AIPresentationSchema,
  AI_GEOMETRIC_CROP_SHAPES,
  AI_LAYOUT_TEMPLATE_IDS,
  AI_STYLE_PRESET_IDS,
  AI_SVG_CATEGORIES,
} from "@shared/presentation/aiTypes";
import { BUILT_IN_PRESETS, getBuiltInPreset } from "@shared/presentation/aiStylePresets";
import { pickRandomSvgFromCategory } from "@shared/presentation/svgGraphicsCatalog";
import { PRESENTATION_ERROR_CODE } from "@shared/presentation/constants";
import {
  presentationSlideContentSchema,
  type PresentationSlideContent,
  type PresentationPendingMediaJob,
} from "@shared/presentation/contracts";
import { randomBytes } from "node:crypto";

import { callLLMStructured } from "./callLLMStructured";
import { getSkillByIdAsync } from "./skillRegistry";
import { mediaGenerationService, type ImageModel, type TaskStatus } from "./mediaGenerationService";
import { getModelsByTypeAsync, type ModelDefinition } from "./modelRegistry";
import {
  addSlideToDeck,
  getPresentationDeckDetail,
  updateSlideInDeck,
  type PresentationActor,
} from "./presentationService";
import { hasEnoughCredits } from "./creditService";
import { getRedisClient } from "./redis";
import { auditLogger } from "./auditLogger";
import { getDb, type DrizzleDB } from "../db";
import { generateSlide } from "./aiPresentationLayoutEngine";
import { executeWithFallback, resolveProviders } from "./llmRouter";
import { llmProviders, modelProviderMap, presentationDecks } from "../../drizzle/schema";
import { and, asc, eq } from "drizzle-orm";
import {
  applyWatermarkToSlideContent,
  extractWatermarkFromSlideContent,
} from "./presentationWatermarkService";

// ── Constants ──────────────────────────────────────────────

const IMAGE_POLL_INTERVAL_MS = 2000;
const IMAGE_POLL_BASE_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_IMAGE_POLL_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 5000) {
    return raw;
  }
  return 90000;
})();
const IMAGE_POLL_TIMEOUT_PER_SLIDE_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_IMAGE_POLL_TIMEOUT_PER_SLIDE_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  return 4000;
})();
const IMAGE_POLL_TIMEOUT_MAX_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_IMAGE_POLL_TIMEOUT_MAX_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 5000) {
    return raw;
  }
  return 300000;
})();
const VIDEO_POLL_BASE_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_VIDEO_POLL_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 10000) {
    return raw;
  }
  return 480000;
})();
const VIDEO_POLL_TIMEOUT_PER_SLIDE_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_VIDEO_POLL_TIMEOUT_PER_SLIDE_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  return 90000;
})();
const VIDEO_POLL_TIMEOUT_MAX_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_VIDEO_POLL_TIMEOUT_MAX_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 10000) {
    return raw;
  }
  return 3600000;
})();
const VIDEO_POLL_ACTIVE_GRACE_BASE_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_VIDEO_ACTIVE_GRACE_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  return 600000;
})();
const VIDEO_POLL_ACTIVE_GRACE_PER_SLIDE_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_VIDEO_ACTIVE_GRACE_PER_SLIDE_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  return 120000;
})();
const VIDEO_POLL_ACTIVE_GRACE_MAX_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_VIDEO_ACTIVE_GRACE_MAX_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  return 1800000;
})();
const LOCK_TTL_SECONDS = 300;
const PROGRESS_TTL_SECONDS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_PROGRESS_TTL_SECONDS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 300) {
    return raw;
  }
  return 3600;
})();
const HEARTBEAT_INTERVAL_MS = 30000;
const SLIDE_SPLIT_MIN_WORDS = 2400;
const SLIDE_SPLIT_MAX_WORDS = 6000;
const ARTICLE_TARGET_WORDS_MIN = 320;
const ARTICLE_TARGET_WORDS_MAX = 3600;
const ARTICLE_WORDS_PER_SLIDE_EN = 108;
const ARTICLE_WORDS_PER_SLIDE_TH = 92;
const ARTICLE_WORD_PRESET_TARGETS: Record<string, number> = {
  short: 400,
  medium: 700,
  long: 1200,
};
const MAX_IMAGE_CONCURRENCY = 3;
const MEDIA_SUBMIT_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_MEDIA_SUBMIT_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 5000) {
    return raw;
  }
  return 45000;
})();
const MEDIA_STATUS_FETCH_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_MEDIA_STATUS_FETCH_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 2000) {
    return raw;
  }
  return 15000;
})();
const IMAGE_PROMPT_ENHANCE_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_IMAGE_PROMPT_ENHANCE_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 5000) {
    return raw;
  }
  return 30000;
})();

const CREDIT_ARTICLE = 30;
const CREDIT_SPLIT = 10;
const CREDIT_IMAGE_SKILL = 75;
const CREDIT_IMAGE_GEN = 40;
const CREDIT_BUFFER_MULTIPLIER = 1.2;
const DEFAULT_TEXT_MODEL = "claude-sonnet-4-6";

const FALLBACK_IMAGE_MODEL: ImageModel = "flux-2.0";
const FALLBACK_VIDEO_MODEL: ImageModel = "veo-3-1";
const DEFAULT_CANVAS_WIDTH = 1280;
const DEFAULT_CANVAS_HEIGHT = 720;
const MIN_CANVAS_DIMENSION = 64;
const MAX_CANVAS_DIMENSION = 10_000;

const CANVAS_PRESET_BY_RATIO: Record<string, "16:9" | "9:16" | "4:3" | "3:4" | "4:5" | "5:4" | "1:1"> = {
  "16:9": "16:9",
  "9:16": "9:16",
  "4:3": "4:3",
  "3:4": "3:4",
  "4:5": "4:5",
  "5:4": "5:4",
  "1:1": "1:1",
};

type LayoutTemplateId = (typeof AI_LAYOUT_TEMPLATE_IDS)[number];
type GraphicCategoryId = (typeof AI_SVG_CATEGORIES)[number];
type StylePresetId = (typeof AI_STYLE_PRESET_IDS)[number];
type GeometricCropShapeId = (typeof AI_GEOMETRIC_CROP_SHAPES)[number];
type GeometricAccentShapeId = (typeof AI_GEOMETRIC_ACCENT_SHAPES)[number];
type SlideElement = PresentationSlideContent["elements"][number];
type SlideTextElement = Extract<SlideElement, { type: "text" }>;
type SlideImageElement = Extract<SlideElement, { type: "image" }>;
type SlideRectElement = Extract<SlideElement, { type: "rect" }>;
type SlideVideoElement = Extract<SlideElement, { type: "video" }>;
type SlidePendingMediaJob = PresentationPendingMediaJob;

interface DeferredMediaTaskInfo {
  mediaType: "image" | "video";
  mediaTaskId: string;
  providerTaskId?: string;
  modelId?: string;
  prompt?: string;
  reason?: string;
}

interface RelayoutSlideInput {
  slideTitle: string;
  slideContent: PresentationSlideContent;
  deckTitle?: string;
  slideIndex: number;
  totalSlides: number;
  stylePresetId?: StylePresetId;
  templateId?: LayoutTemplateId;
  includeSvg?: boolean;
  includeGeometricCrop?: boolean;
  geometricCropShape?: GeometricCropShapeId;
  includeGeometricAccents?: boolean;
  geometricAccentShape?: GeometricAccentShapeId;
  layoutSeed?: number;
  watermark?: AIWatermark;
}

interface RelayoutSlideOutput {
  slideContent: PresentationSlideContent;
  warnings: string[];
  applied: {
    templateId: LayoutTemplateId;
    stylePresetId: StylePresetId;
    graphicCategory: GraphicCategoryId;
    reusedImage: boolean;
  };
}

interface RGBColor {
  r: number;
  g: number;
  b: number;
}

function parseCssColorToRgb(value: string | undefined | null): RGBColor | null {
  if (!value) {
    return null;
  }
  const color = value.trim().toLowerCase();
  if (color.length === 0) {
    return null;
  }
  const hex3 = color.match(/^#([0-9a-f]{3})$/i);
  if (hex3) {
    const [, digits] = hex3;
    return {
      r: Number.parseInt(digits[0] + digits[0], 16),
      g: Number.parseInt(digits[1] + digits[1], 16),
      b: Number.parseInt(digits[2] + digits[2], 16),
    };
  }
  const hex6 = color.match(/^#([0-9a-f]{6})$/i);
  if (hex6) {
    const [, digits] = hex6;
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
    };
  }
  const rgb = color.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every((num) => Number.isFinite(num))) {
      return {
        r: Math.max(0, Math.min(255, Math.round(parts[0]))),
        g: Math.max(0, Math.min(255, Math.round(parts[1]))),
        b: Math.max(0, Math.min(255, Math.round(parts[2]))),
      };
    }
  }
  return null;
}

function colorDistance(a: RGBColor, b: RGBColor): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function resolveSlideCanvasDimensions(slideContent: PresentationSlideContent): {
  width: number;
  height: number;
  preset?: "16:9" | "9:16" | "4:3" | "3:4" | "4:5" | "5:4" | "1:1";
} {
  const canvasWidth = sanitizeCanvasDimension(slideContent.canvas?.width);
  const canvasHeight = sanitizeCanvasDimension(slideContent.canvas?.height);
  if (canvasWidth && canvasHeight) {
    return {
      width: canvasWidth,
      height: canvasHeight,
      preset: slideContent.canvas?.preset,
    };
  }

  let inferredWidth = 0;
  let inferredHeight = 0;
  for (const element of slideContent.elements) {
    inferredWidth = Math.max(inferredWidth, element.x + element.width);
    inferredHeight = Math.max(inferredHeight, element.y + element.height);
  }
  const width = sanitizeCanvasDimension(inferredWidth) ?? DEFAULT_CANVAS_WIDTH;
  const height = sanitizeCanvasDimension(inferredHeight) ?? DEFAULT_CANVAS_HEIGHT;
  return { width, height };
}

function normalizeTextLines(raw: string): string[] {
  return raw
    .replace(/[•▪◦·]/g, "\n")
    .split(/\r?\n+/)
    .map((line) => normalizeSlideText(line))
    .filter((line) => line.length > 0);
}

function normalizeThaiNumberSpacing(value: string): string {
  return value
    .replace(/([0-9])([\u0e00-\u0e7f])/g, "$1 $2")
    .replace(/([\u0e00-\u0e7f])([0-9])/g, "$1 $2");
}

function normalizeSlideText(value: string): string {
  const collapsed = value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!collapsed) {
    return "";
  }
  return normalizeThaiNumberSpacing(collapsed);
}

function resolveTextWeightScore(weight?: "normal" | "500" | "600" | "700"): number {
  switch (weight) {
    case "700":
      return 700;
    case "600":
      return 600;
    case "500":
      return 500;
    default:
      return 400;
  }
}

function extractSlideNarrative(slideTitle: string, slideContent: PresentationSlideContent): {
  title: string;
  body: string[];
} {
  const textElements = slideContent.elements
    .filter((element): element is SlideTextElement => element.type === "text")
    .map((element) => ({
      ...element,
      rawText: String(element.text ?? ""),
      normalizedText: normalizeSlideText(String(element.text ?? "")),
      score:
        ((Number.isFinite(element.fontSize) ? Number(element.fontSize) : 28) * 2.4)
        + (resolveTextWeightScore(element.fontWeight) * 0.03)
        + (Math.max(0, element.width) * 0.02)
        - (Math.max(0, element.y) * 0.015),
    }))
    .filter((element) => element.normalizedText.length > 0)
    .sort((a, b) => b.score - a.score);

  const titleCandidate = textElements[0]?.normalizedText
    || normalizeSlideText(slideTitle)
    || "Key message";

  const body: string[] = [];
  const seen = new Set<string>();
  const titleKey = titleCandidate.toLowerCase();
  const sortedBodyCandidates = textElements
    .slice(1)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
  for (const element of sortedBodyCandidates) {
    for (const line of normalizeTextLines(element.rawText)) {
      const key = line.toLowerCase();
      if (seen.has(key) || key === titleKey) {
        continue;
      }
      seen.add(key);
      body.push(line);
      if (body.length >= 8) {
        return { title: titleCandidate, body };
      }
    }
  }

  if (body.length === 0) {
    body.push(titleCandidate);
  }
  return { title: titleCandidate, body };
}

function pickLargestImageElement(slideContent: PresentationSlideContent): SlideImageElement | null {
  const candidates = slideContent.elements
    .filter((element): element is SlideImageElement => element.type === "image")
    .filter((element) => Boolean(element.src && element.src.trim().length > 0))
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));
  return candidates[0] ?? null;
}

function inferGraphicCategoryFromText(text: string): GraphicCategoryId {
  const normalized = text.toLowerCase();
  const categoryPatterns: Array<{ category: GraphicCategoryId; pattern: RegExp }> = [
    { category: "Health", pattern: /(health|medical|doctor|patient|hospital|wellness|vaccine|โรค|สุขภาพ|แพทย์|คนไข้|ยา|ทารก|เด็ก)/i },
    { category: "Education", pattern: /(education|school|learn|teaching|course|training|knowledge|การศึกษา|เรียน|โรงเรียน|ครู|ความรู้)/i },
    { category: "Finance", pattern: /(finance|money|investment|bank|budget|revenue|cost|ตลาด|การเงิน|ลงทุน|งบประมาณ|รายได้|กำไร)/i },
    { category: "Technology", pattern: /(technology|digital|software|ai|automation|data|cloud|tech|เทคโนโลยี|ดิจิทัล|ซอฟต์แวร์|ปัญญาประดิษฐ์|ข้อมูล)/i },
    { category: "Nature", pattern: /(nature|eco|environment|green|organic|sustain|ธรรมชาติ|สิ่งแวดล้อม|สีเขียว|ยั่งยืน)/i },
    { category: "Communication", pattern: /(communication|message|team|collaboration|social|community|สื่อสาร|ทีม|ชุมชน|เครือข่าย)/i },
    { category: "Media", pattern: /(media|video|audio|music|photo|content|สื่อ|วิดีโอ|เสียง|เพลง|ภาพ)/i },
    { category: "Navigation", pattern: /(route|direction|map|path|step|navigate|เส้นทาง|ขั้นตอน|ทิศทาง|นำทาง)/i },
    { category: "Arrows", pattern: /(growth|increase|decrease|upward|trend|ลูกศร|เติบโต|แนวโน้ม|เพิ่มขึ้น|ลดลง)/i },
    { category: "Shapes", pattern: /(design|visual|layout|shape|pattern|ดีไซน์|รูปทรง|แพทเทิร์น)/i },
  ];
  for (const entry of categoryPatterns) {
    if (entry.pattern.test(normalized)) {
      return entry.category;
    }
  }
  return "Business";
}

function inferStylePresetIdFromSlide(slideContent: PresentationSlideContent): StylePresetId {
  const largestRect = slideContent.elements
    .filter((element): element is SlideRectElement => element.type === "rect")
    .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
  const rectColor = parseCssColorToRgb(largestRect?.fill);
  if (!rectColor) {
    return "dark-professional";
  }

  let bestPreset: StylePresetId = "dark-professional";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const preset of BUILT_IN_PRESETS) {
    const bg = parseCssColorToRgb(preset.colors.background);
    const bgAlt = parseCssColorToRgb(preset.colors.backgroundAlt);
    if (!bg || !bgAlt) {
      continue;
    }
    const distance = Math.min(colorDistance(rectColor, bg), colorDistance(rectColor, bgAlt));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPreset = preset.id as StylePresetId;
    }
  }
  return bestPreset;
}

function applyRelayoutChromePolicy(preset: SlideStylePreset): SlideStylePreset {
  const nextPreset: SlideStylePreset = {
    ...preset,
    ...(preset.header ? { header: { ...preset.header } } : {}),
    ...(preset.footer ? { footer: { ...preset.footer } } : {}),
  };

  if (nextPreset.header) {
    nextPreset.header.enabled = false;
  }
  if (nextPreset.footer) {
    nextPreset.footer.enabled = false;
  }

  return nextPreset;
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;");
}

function resolveGeometricCropShape(shape: GeometricCropShapeId | undefined, seed: number): Exclude<GeometricCropShapeId, "auto"> {
  if (shape && shape !== "auto") {
    return shape;
  }
  const variants: Array<Exclude<GeometricCropShapeId, "auto">> = ["rect", "circle", "triangle"];
  const index = Math.abs(Math.round(seed)) % variants.length;
  return variants[index];
}

function resolveGeometricAccentShape(shape: GeometricAccentShapeId | undefined, seed: number): Exclude<GeometricAccentShapeId, "auto"> {
  if (shape && shape !== "auto") {
    return shape;
  }
  const variants: Array<Exclude<GeometricAccentShapeId, "auto">> = ["rect", "circle", "triangle"];
  const index = Math.abs(Math.round(seed)) % variants.length;
  return variants[index];
}

function withAlpha(color: string, alpha: number): string {
  const rgb = parseCssColorToRgb(color);
  if (!rgb) {
    return color;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function buildGeometricCropSvg(options: {
  src: string;
  width: number;
  height: number;
  shape: Exclude<GeometricCropShapeId, "auto">;
}): string {
  const width = Math.max(8, Math.round(options.width));
  const height = Math.max(8, Math.round(options.height));
  const escapedSrc = escapeXmlAttribute(options.src);
  const shapeMarkup = (() => {
    if (options.shape === "circle") {
      const radius = Math.round(Math.min(width, height) * 0.5);
      return `<circle cx="${Math.round(width / 2)}" cy="${Math.round(height / 2)}" r="${radius}" />`;
    }
    if (options.shape === "triangle") {
      return `<polygon points="${Math.round(width / 2)},0 ${width},${height} 0,${height}" />`;
    }
    const radius = Math.max(8, Math.round(Math.min(width, height) * 0.08));
    return `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" />`;
  })();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs><clipPath id="shapeCrop">${shapeMarkup}</clipPath></defs><image href="${escapedSrc}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#shapeCrop)" /></svg>`;
}

function buildGeometricShapeSvg(options: {
  width: number;
  height: number;
  shape: Exclude<GeometricAccentShapeId, "auto">;
  fill: string;
  stroke: string;
  strokeWidth: number;
}): string {
  const width = Math.max(8, Math.round(options.width));
  const height = Math.max(8, Math.round(options.height));
  const fill = options.fill || "#ffffff";
  const stroke = options.stroke || "transparent";
  const strokeWidth = Math.max(0, options.strokeWidth || 0);
  const shapeMarkup = (() => {
    if (options.shape === "circle") {
      const radius = Math.round(Math.min(width, height) * 0.5);
      const safeRadius = Math.max(1, radius - Math.round(strokeWidth / 2));
      return `<circle cx="${Math.round(width / 2)}" cy="${Math.round(height / 2)}" r="${safeRadius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }
    if (options.shape === "triangle") {
      const inset = Math.round(strokeWidth);
      const topX = Math.round(width / 2);
      return `<polygon points="${topX},${inset} ${Math.max(0, width - inset)},${Math.max(inset + 1, height - inset)} ${inset},${Math.max(inset + 1, height - inset)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }
    const radius = Math.max(8, Math.round(Math.min(width, height) * 0.12));
    return `<rect x="${Math.round(strokeWidth / 2)}" y="${Math.round(strokeWidth / 2)}" width="${Math.max(1, width - strokeWidth)}" height="${Math.max(1, height - strokeWidth)}" rx="${radius}" ry="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  })();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${shapeMarkup}</svg>`;
}

function applyGeometricImageCrop(
  elements: PresentationSlideContent["elements"],
  options: { requestedShape?: GeometricCropShapeId; seed: number },
): {
  elements: PresentationSlideContent["elements"];
  appliedShape: Exclude<GeometricCropShapeId, "auto"> | null;
} {
  const candidates = elements
    .filter((element): element is SlideImageElement => (
      element.type === "image"
      && typeof element.src === "string"
      && element.src.trim().length > 0
      && !(typeof element.svgContent === "string" && element.svgContent.trim().length > 0)
    ))
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));

  const target = candidates[0];
  if (!target) {
    return { elements, appliedShape: null };
  }

  const shape = resolveGeometricCropShape(options.requestedShape, options.seed);
  const nextElements = elements.map((element) => {
    if (element.type !== "image" || element.id !== target.id) {
      return element;
    }
    return {
      ...element,
      imageFit: "cover" as const,
      svgContent: buildGeometricCropSvg({
        src: target.src,
        width: target.width,
        height: target.height,
        shape,
      }),
    };
  });
  return { elements: nextElements, appliedShape: shape };
}

function buildGeometricAccentElements(options: {
  canvasWidth: number;
  canvasHeight: number;
  seed: number;
  requestedShape?: GeometricAccentShapeId;
  stylePreset: SlideStylePreset;
}): {
  elements: SlideImageElement[];
  appliedShape: Exclude<GeometricAccentShapeId, "auto">;
} {
  const shortEdge = Math.max(120, Math.min(options.canvasWidth, options.canvasHeight));
  const largeSize = Math.round(shortEdge * 0.24);
  const smallSize = Math.round(shortEdge * 0.15);
  const margin = Math.round(shortEdge * 0.03);
  const shape = resolveGeometricAccentShape(options.requestedShape, options.seed);

  const positionSets = [
    {
      primary: { x: margin, y: margin, width: largeSize, height: largeSize },
      secondary: {
        x: options.canvasWidth - smallSize - margin,
        y: options.canvasHeight - smallSize - margin,
        width: smallSize,
        height: smallSize,
      },
    },
    {
      primary: { x: options.canvasWidth - largeSize - margin, y: margin, width: largeSize, height: largeSize },
      secondary: { x: margin, y: options.canvasHeight - smallSize - margin, width: smallSize, height: smallSize },
    },
    {
      primary: { x: margin, y: options.canvasHeight - largeSize - margin, width: largeSize, height: largeSize },
      secondary: { x: options.canvasWidth - smallSize - margin, y: margin, width: smallSize, height: smallSize },
    },
  ] as const;
  const positionSet = positionSets[Math.abs(Math.round(options.seed)) % positionSets.length];
  const secondaryShape = resolveGeometricAccentShape("auto", options.seed + 17);

  const primaryBaseColor = options.stylePreset.colors.secondary
    || options.stylePreset.colors.primary
    || "#0f3460";
  const secondaryBaseColor = options.stylePreset.colors.primary
    || options.stylePreset.colors.text
    || "#e94560";
  const primarySvg = buildGeometricShapeSvg({
    width: positionSet.primary.width,
    height: positionSet.primary.height,
    shape,
    fill: withAlpha(primaryBaseColor, 0.3),
    stroke: withAlpha(primaryBaseColor, 0.62),
    strokeWidth: Math.max(2, Math.round(shortEdge * 0.01)),
  });
  const secondarySvg = buildGeometricShapeSvg({
    width: positionSet.secondary.width,
    height: positionSet.secondary.height,
    shape: secondaryShape,
    fill: withAlpha(secondaryBaseColor, 0.22),
    stroke: withAlpha(secondaryBaseColor, 0.5),
    strokeWidth: Math.max(2, Math.round(shortEdge * 0.008)),
  });

  return {
    appliedShape: shape,
    elements: [
      {
        id: `accent-primary-${Math.abs(Math.round(options.seed))}-${options.canvasWidth}-${options.canvasHeight}`,
        type: "image",
        x: positionSet.primary.x,
        y: positionSet.primary.y,
        width: positionSet.primary.width,
        height: positionSet.primary.height,
        src: "",
        alt: "Geometric accent",
        svgContent: primarySvg,
        opacity: 1,
      },
      {
        id: `accent-secondary-${Math.abs(Math.round(options.seed + 1))}-${options.canvasWidth}-${options.canvasHeight}`,
        type: "image",
        x: positionSet.secondary.x,
        y: positionSet.secondary.y,
        width: positionSet.secondary.width,
        height: positionSet.secondary.height,
        src: "",
        alt: "Geometric accent",
        svgContent: secondarySvg,
        opacity: 1,
      },
    ],
  };
}

function resolveRelayoutTemplateId(options: {
  requestedTemplateId?: LayoutTemplateId;
  bodyCount: number;
  hasImage: boolean;
  canvasWidth: number;
  canvasHeight: number;
  seed: number;
}): LayoutTemplateId {
  if (options.requestedTemplateId) {
    return options.requestedTemplateId;
  }
  if (!options.hasImage) {
    return options.bodyCount >= 4 ? "feature_boxes_right" : "hero_center";
  }

  const portrait = options.canvasHeight > options.canvasWidth;
  if (options.bodyCount <= 2) {
    return portrait ? "split_right_image" : "hero_center";
  }
  if (options.bodyCount >= 5) {
    return "feature_boxes_right";
  }

  const splitTemplates: LayoutTemplateId[] = [
    "split_right_image",
    "split_left_image",
    "top_image_text_bottom",
    "bottom_image_text_top",
  ];
  const index = Math.abs(Math.round(options.seed)) % splitTemplates.length;
  return splitTemplates[index];
}

function clampBodyLinesForTemplate(body: string[], templateId: LayoutTemplateId): string[] {
  const limits: Record<LayoutTemplateId, { min: number; max: number }> = {
    hero_center: { min: 2, max: 4 },
    split_left_image: { min: 3, max: 6 },
    split_right_image: { min: 3, max: 6 },
    top_image_text_bottom: { min: 3, max: 6 },
    bottom_image_text_top: { min: 3, max: 6 },
    feature_boxes_right: { min: 3, max: 5 },
  };
  const { min, max } = limits[templateId];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const line of body) {
    const normalized = line.trim();
    const key = normalized.toLowerCase();
    if (normalized.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(normalized);
    if (unique.length >= max) {
      break;
    }
  }
  while (unique.length < min) {
    unique.push(unique[0] ?? "Key point");
  }
  return unique;
}

function sanitizeErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : "Unknown error";
  return msg
    .replace(/https?:\/\/[^\s]+/g, "[redacted-url]")
    .replace(/\/[\w/.-]+\.(ts|js|json)/g, "[redacted-path]")
    .slice(0, 200);
}

export function computeImagePollTimeoutMs(numSlides: number): number {
  const safeSlides = Number.isFinite(numSlides)
    ? Math.max(1, Math.round(numSlides))
    : 1;
  const scaledTimeout = IMAGE_POLL_BASE_TIMEOUT_MS
    + ((safeSlides - 1) * IMAGE_POLL_TIMEOUT_PER_SLIDE_MS);
  return Math.min(IMAGE_POLL_TIMEOUT_MAX_MS, scaledTimeout);
}

export function computeVideoPollTimeoutMs(numSlides: number): number {
  const safeSlides = Number.isFinite(numSlides)
    ? Math.max(1, Math.round(numSlides))
    : 1;
  const scaledTimeout = VIDEO_POLL_BASE_TIMEOUT_MS
    + ((safeSlides - 1) * VIDEO_POLL_TIMEOUT_PER_SLIDE_MS);
  return Math.min(VIDEO_POLL_TIMEOUT_MAX_MS, scaledTimeout);
}

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function selectVideoDuration(
  model: ModelDefinition | undefined,
  extraParams: Record<string, unknown> | undefined,
): number | undefined {
  const fromDurationField = parsePositiveNumber(extraParams?.duration);
  if (fromDurationField) {
    return Math.round(fromDurationField);
  }

  const fromFramesField = parsePositiveNumber(extraParams?.n_frames);
  if (fromFramesField) {
    return Math.round(fromFramesField);
  }

  const supported = Array.isArray(model?.durations)
    ? model.durations.filter((value) => Number.isFinite(value) && value > 0)
    : [];
  if (supported.length > 0) {
    return Math.min(...supported);
  }

  return undefined;
}

function toIsoNow(): string {
  return new Date().toISOString();
}

function createPendingMediaJobId(): string {
  return `pmj_${Date.now()}_${randomBytes(6).toString("hex")}`;
}

function findLargestRectElement(elements: SlideElement[]): SlideRectElement | null {
  let best: SlideRectElement | null = null;
  let bestArea = -1;
  for (const element of elements) {
    if (element.type !== "rect") {
      continue;
    }
    const area = Math.max(0, element.width) * Math.max(0, element.height);
    if (area > bestArea) {
      best = element as SlideRectElement;
      bestArea = area;
    }
  }
  return best;
}

function buildPendingMediaJob(
  task: DeferredMediaTaskInfo,
  target: {
    elementId?: string;
    x: number;
    y: number;
    width: number;
    height: number;
  },
): SlidePendingMediaJob {
  return {
    id: createPendingMediaJobId(),
    mediaType: task.mediaType,
    mediaTaskId: task.mediaTaskId,
    ...(task.providerTaskId ? { providerTaskId: task.providerTaskId } : {}),
    ...(target.elementId ? { targetElementId: target.elementId } : {}),
    targetX: target.x,
    targetY: target.y,
    targetWidth: target.width,
    targetHeight: target.height,
    ...(task.modelId ? { modelId: task.modelId } : {}),
    ...(task.prompt ? { prompt: task.prompt.slice(0, 4000) } : {}),
    status: "pending",
    ...(task.reason ? { reason: task.reason.slice(0, 256) } : {}),
    createdAt: toIsoNow(),
    lastCheckedAt: toIsoNow(),
  };
}

function findPendingMediaTarget(
  elements: SlideElement[],
  templateId: LayoutTemplateId | undefined,
  canvasWidth: number,
  canvasHeight: number,
): {
  elementId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  const rects = elements.filter((element): element is SlideRectElement => element.type === "rect");
  if (rects.length === 0) {
    return null;
  }

  const canvasArea = Math.max(1, canvasWidth * canvasHeight);
  const majorAreaThreshold = canvasArea * 0.18;
  const majorRects = rects.filter((rect) => (rect.width * rect.height) >= majorAreaThreshold);
  const searchPool = majorRects.length > 0 ? majorRects : rects;

  const pick = (predicate: (rect: SlideRectElement) => boolean): SlideRectElement | null => {
    for (const rect of searchPool) {
      if (predicate(rect)) {
        return rect;
      }
    }
    return null;
  };

  let target: SlideRectElement | null = null;
  switch (templateId) {
    case "split_right_image":
      target = pick((rect) => (rect.x + (rect.width * 0.5)) >= (canvasWidth * 0.52));
      break;
    case "split_left_image":
    case "feature_boxes_right":
      target = pick((rect) => (rect.x + (rect.width * 0.5)) <= (canvasWidth * 0.48));
      break;
    case "top_image_text_bottom":
      target = pick((rect) => (rect.y + (rect.height * 0.5)) <= (canvasHeight * 0.48));
      break;
    case "bottom_image_text_top":
      target = pick((rect) => (rect.y + (rect.height * 0.5)) >= (canvasHeight * 0.52));
      break;
    case "hero_center":
      target = pick((rect) => (rect.width * rect.height) >= (canvasArea * 0.55));
      break;
    default:
      target = null;
      break;
  }

  if (!target) {
    target = findLargestRectElement(searchPool);
  }
  if (!target) {
    return null;
  }
  return {
    elementId: target.id,
    x: target.x,
    y: target.y,
    width: target.width,
    height: target.height,
  };
}

function buildResolvedMediaElement(
  mediaType: "image" | "video",
  sourceUrl: string,
  target: {
    elementId?: string;
    x: number;
    y: number;
    width: number;
    height: number;
  },
  title?: string,
): SlideImageElement | SlideVideoElement {
  const elementId = target.elementId || createPendingMediaJobId();
  if (mediaType === "video") {
    return {
      id: elementId,
      type: "video",
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height,
      src: sourceUrl,
      poster: "",
      title: title || "Video",
      muted: true,
      loop: true,
    } satisfies SlideVideoElement;
  }

  return {
    id: elementId,
    type: "image",
    x: target.x,
    y: target.y,
    width: target.width,
    height: target.height,
    src: sourceUrl,
    alt: title || "Image",
    imageFit: "cover",
    imagePositionX: 50,
    imagePositionY: 50,
    imageZoom: 1,
  } satisfies SlideImageElement;
}

function applyResolvedMediaToElements(
  elements: SlideElement[],
  job: SlidePendingMediaJob,
  sourceUrl: string,
  slideTitle: string,
): SlideElement[] {
  const target = {
    elementId: job.targetElementId,
    x: job.targetX,
    y: job.targetY,
    width: job.targetWidth,
    height: job.targetHeight,
  };
  const replacement = buildResolvedMediaElement(job.mediaType, sourceUrl, target, slideTitle);
  const targetIndex = job.targetElementId
    ? elements.findIndex((element) => element.id === job.targetElementId)
    : -1;
  if (targetIndex >= 0) {
    const next = [...elements];
    next[targetIndex] = replacement as SlideElement;
    return next;
  }
  return [...elements, replacement as SlideElement];
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutLabel: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(timeoutLabel));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function resolveSkillModel(skill?: { llmModelId?: string; defaultModel?: string; models?: string[] }): string {
  if (skill?.llmModelId && skill.llmModelId.trim().length > 0) {
    return skill.llmModelId.trim();
  }
  if (skill?.defaultModel && skill.defaultModel.trim().length > 0) {
    return skill.defaultModel.trim();
  }
  const firstModel = skill?.models?.find((m) => typeof m === "string" && m.trim().length > 0);
  if (firstModel) {
    return firstModel.trim();
  }
  return DEFAULT_TEXT_MODEL;
}

function normalizeGenerateType(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function isTextToImageModel(model: ModelDefinition): boolean {
  const generateType = normalizeGenerateType(model.configJson?.generateType);
  if (!generateType) {
    return true; // treat unknown as compatible for backward compatibility
  }
  return [
    "text-to-image",
    "text2image",
    "txt2img",
    "t2i",
  ].includes(generateType);
}

function buildImageApiConfig(model?: ModelDefinition): Record<string, string> | undefined {
  if (!model) {
    return undefined;
  }

  const apiConfig: Record<string, string> = {};
  const configJson = model.configJson as Record<string, unknown> | undefined;

  if (typeof model.provider === "string" && model.provider.trim().length > 0) {
    apiConfig.provider = model.provider.trim();
  }
  if (configJson) {
    if (typeof configJson.apiEndpoint === "string") {
      apiConfig.endpoint = configJson.apiEndpoint;
    }
    if (typeof configJson.apiQueryEndpoint === "string") {
      apiConfig.query_endpoint = configJson.apiQueryEndpoint;
    }
    if (typeof configJson.apiPayloadFormat === "string") {
      apiConfig.payload_format = configJson.apiPayloadFormat;
    }
    if (typeof configJson.kieModelId === "string") {
      apiConfig.kie_model_id = configJson.kieModelId;
    }
    if (typeof configJson.provider === "string") {
      apiConfig.provider = configJson.provider;
    }
  }

  return Object.keys(apiConfig).length > 0 ? apiConfig : undefined;
}

function buildImageExtraParams(model?: ModelDefinition): Record<string, unknown> | undefined {
  const configJson = model?.configJson as { inputFields?: unknown } | undefined;
  const inputFields = Array.isArray(configJson?.inputFields) ? configJson.inputFields : [];
  if (inputFields.length === 0) {
    return undefined;
  }

  const extraParams: Record<string, unknown> = {};
  for (const field of inputFields) {
    if (!field || typeof field !== "object") {
      continue;
    }
    const key = (field as { key?: unknown }).key;
    const defaultValue = (field as { default?: unknown }).default;
    if (typeof key === "string" && key.trim().length > 0 && defaultValue !== undefined) {
      extraParams[key] = defaultValue;
    }
  }

  return Object.keys(extraParams).length > 0 ? extraParams : undefined;
}

function sanitizeCanvasDimension(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  if (rounded < MIN_CANVAS_DIMENSION || rounded > MAX_CANVAS_DIMENSION) {
    return null;
  }
  return rounded;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const temp = x % y;
    x = y;
    y = temp;
  }
  return x || 1;
}

function toAspectRatio(width: number, height: number): string {
  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function parseAspectRatio(value: string): { width: number; height: number; ratio: number } | null {
  const match = value.trim().match(/^(\d+)\s*:\s*(\d+)$/);
  if (!match) {
    return null;
  }
  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height, ratio: width / height };
}

function selectAspectRatioForModel(
  targetAspectRatio: string,
  supportedAspectRatios?: string[],
): string {
  if (!Array.isArray(supportedAspectRatios) || supportedAspectRatios.length === 0) {
    return targetAspectRatio;
  }

  const normalizedSupported = supportedAspectRatios
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (normalizedSupported.length === 0) {
    return targetAspectRatio;
  }
  if (normalizedSupported.some((value) => value === targetAspectRatio)) {
    return targetAspectRatio;
  }
  if (normalizedSupported.some((value) => value.toLowerCase() === "auto")) {
    return "auto";
  }

  const target = parseAspectRatio(targetAspectRatio);
  if (!target) {
    return normalizedSupported[0];
  }

  let best = normalizedSupported[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of normalizedSupported) {
    const parsed = parseAspectRatio(candidate);
    if (!parsed) {
      continue;
    }
    // Compare ratio proximity in log space for symmetry (portrait vs landscape).
    const distance = Math.abs(Math.log(parsed.ratio / target.ratio));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

function sanitizePromptContext(value?: string): string | null {
  if (!value) {
    return null;
  }
  const sanitized = value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, 1000);
  return sanitized.length > 0 ? sanitized : null;
}

function appendPromptContext(prompt: string, context?: string | null): string {
  const cleanedPrompt = prompt.trim();
  if (!context) {
    return cleanedPrompt;
  }
  const normalizedContext = context.toLowerCase();
  if (cleanedPrompt.toLowerCase().includes(normalizedContext)) {
    return cleanedPrompt;
  }
  return `${cleanedPrompt}\n\nAdditional visual requirements:\n${context}`;
}

function normalizeReferenceImageUrls(referenceImageUrls?: string[]): string[] {
  if (!Array.isArray(referenceImageUrls) || referenceImageUrls.length === 0) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const raw of referenceImageUrls) {
    if (typeof raw !== "string") {
      continue;
    }
    const url = raw.trim();
    if (
      url.length === 0
      || url.length > 2048
      || (!url.startsWith("/") && !/^https?:\/\//i.test(url))
    ) {
      continue;
    }
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    normalized.push(url);
    if (normalized.length >= 5) {
      break;
    }
  }

  return normalized;
}

function inferWatermarkFileExtension(sourceUrl: string): string | null {
  const trimmed = sourceUrl.trim();
  if (!trimmed) {
    return null;
  }
  const withoutQuery = trimmed.split(/[?#]/, 1)[0] ?? "";
  const ext = withoutQuery.slice(withoutQuery.lastIndexOf(".") + 1).toLowerCase();
  return ext.length > 0 ? ext : null;
}

function normalizeWatermarkInput(
  value: unknown,
  warnings: string[],
): AIWatermark | null {
  if (!value) {
    return null;
  }

  const parsed = AIWatermarkSchema.safeParse(value);
  if (!parsed.success) {
    warnings.push("Invalid watermark input detected; skipping watermark.");
    return null;
  }

  const normalized = parsed.data;
  const extension = inferWatermarkFileExtension(normalized.sourceUrl);
  if (extension !== "png" && extension !== "jpg" && extension !== "jpeg") {
    warnings.push("Watermark must use PNG/JPG source URL; skipping watermark.");
    return null;
  }

  const normalizedFormat = extension === "png" ? "png" : "jpg";
  if (normalized.format !== normalizedFormat) {
    warnings.push(
      `Watermark format "${normalized.format}" mismatched source extension "${extension}". Using "${normalizedFormat}".`,
    );
  }

  return {
    sourceUrl: normalized.sourceUrl,
    format: normalizedFormat,
    clarityPercent: normalized.clarityPercent,
  };
}

interface FieldSyncValues {
  referenceImageUrls?: string[];
  prompt?: string;
  aspectRatio?: string;
}

/**
 * Injects runtime context values into extraParams for fields that declare a syncWith target.
 * Also handles the legacy `type === "image_urls"` convention for reference images.
 */
function applyFieldSyncTargets(
  baseExtraParams: Record<string, unknown> | undefined,
  model: ModelDefinition | undefined,
  syncValues: FieldSyncValues,
): Record<string, unknown> | undefined {
  if (!model) {
    return baseExtraParams;
  }

  const configJson = model.configJson as { inputFields?: unknown } | undefined;
  const inputFields = Array.isArray(configJson?.inputFields) ? (configJson.inputFields as Record<string, unknown>[]) : [];
  if (inputFields.length === 0) {
    return baseExtraParams;
  }

  let next: Record<string, unknown> | undefined = baseExtraParams;

  for (const field of inputFields) {
    if (!field || typeof field !== "object") continue;
    const key = field.key;
    if (typeof key !== "string" || key.trim().length === 0) continue;

    const type = field.type;
    const syncWith = field.syncWith;

    // reference_images: explicit syncWith OR legacy type="image_urls"
    if (
      (syncWith === "reference_images" || type === "image_urls") &&
      syncValues.referenceImageUrls &&
      syncValues.referenceImageUrls.length > 0
    ) {
      next = next ?? {};
      if (next[key] === undefined || next[key] === null || next[key] === "") {
        next = { ...next, [key]: syncValues.referenceImageUrls };
      }
      continue;
    }

    if (syncWith === "prompt" && syncValues.prompt) {
      next = next ?? {};
      if (next[key] === undefined || next[key] === null || next[key] === "") {
        next = { ...next, [key]: syncValues.prompt };
      }
      continue;
    }

    if (syncWith === "aspect_ratio" && syncValues.aspectRatio) {
      next = next ?? {};
      if (next[key] === undefined || next[key] === null || next[key] === "") {
        next = { ...next, [key]: syncValues.aspectRatio };
      }
    }
  }

  return next;
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "type" in part && (part as { type?: unknown }).type === "text") {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

async function invokeSkillTextLLM(params: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  userId: number;
  preferredProviderId?: number;
  strictProviderPin?: boolean;
}): Promise<string> {
  if (params.strictProviderPin && params.preferredProviderId) {
    const candidates = await resolveProviders(params.model).catch(() => []);
    const providerMatched = candidates.some((c) => c.providerId === params.preferredProviderId);
    if (!providerMatched) {
      throw new Error(`No providers available for model: ${params.model} with preferred provider ${params.preferredProviderId}`);
    }
  }

  const result = await executeWithFallback({
    model: params.model,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userPrompt },
    ],
    stream: false,
    userId: params.userId,
    preferredProvider: params.preferredProviderId,
  });

  if (result.type === "error") {
    if (result.error === "No providers available for model") {
      throw new Error(`No providers available for model: ${params.model}`);
    }
    throw new Error(result.error);
  }
  if (result.type === "fallback_required") {
    throw new Error("LLM provider requires fallback consent");
  }

  const content = result.response?.choices?.[0]?.message?.content;
  return extractTextContent(content) || JSON.stringify(content);
}

async function resolveRoutableTextModel(
  preferredModel: string,
  preferredProviderId?: number,
  strictProviderPin?: boolean,
): Promise<string> {
  const preferred = preferredModel.trim();

  const preferredProviders = await resolveProviders(preferred).catch(() => []);
  if (preferredProviderId && preferredProviders.some((p) => p.providerId === preferredProviderId)) {
    return preferred;
  }
  if (preferredProviders.length > 0) {
    return preferred;
  }

  const db = await getDb();
  if (db) {
    const byProviderModelId = await db
      .select({ modelId: modelProviderMap.modelId })
      .from(modelProviderMap)
      .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
      .where(
        and(
          eq(modelProviderMap.providerModelId, preferred),
          ...(preferredProviderId ? [eq(modelProviderMap.providerId, preferredProviderId)] : []),
          eq(modelProviderMap.isEnabled, true),
          eq(llmProviders.isEnabled, true),
        ),
      )
      .orderBy(asc(modelProviderMap.priority))
      .limit(1);
    if (byProviderModelId[0]?.modelId) {
      return byProviderModelId[0].modelId;
    }
  }

  if (strictProviderPin && preferredProviderId) {
    throw new Error(`No providers available for model: ${preferred} with preferred provider ${preferredProviderId}`);
  }

  if (preferred !== DEFAULT_TEXT_MODEL) {
    const defaultProviders = await resolveProviders(DEFAULT_TEXT_MODEL).catch(() => []);
    if (defaultProviders.length > 0) {
      return DEFAULT_TEXT_MODEL;
    }
  }

  if (db) {
    const rows = await db
      .select({ modelId: modelProviderMap.modelId })
      .from(modelProviderMap)
      .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
      .where(
        and(
          eq(modelProviderMap.isEnabled, true),
          eq(llmProviders.isEnabled, true),
        ),
      )
      .orderBy(asc(modelProviderMap.priority))
      .limit(1);
    if (rows[0]?.modelId) {
      return rows[0].modelId;
    }
  }

  return preferred;
}

export function relayoutExistingSlide(input: RelayoutSlideInput): RelayoutSlideOutput {
  const parsedContent = presentationSlideContentSchema.parse(input.slideContent);
  const warnings: string[] = [];
  const canvas = resolveSlideCanvasDimensions(parsedContent);
  const narrative = extractSlideNarrative(input.slideTitle, parsedContent);
  const imageElement = pickLargestImageElement(parsedContent);
  const combinedText = `${narrative.title}\n${narrative.body.join("\n")}`;
  const inheritedWatermark = extractWatermarkFromSlideContent(parsedContent);
  const watermark = normalizeWatermarkInput(input.watermark ?? inheritedWatermark, warnings);
  const inferredStylePresetId = inferStylePresetIdFromSlide(parsedContent);
  const stylePresetId = input.stylePresetId ?? inferredStylePresetId;
  const baseStylePreset = getBuiltInPreset(stylePresetId) ?? getBuiltInPreset("dark-professional")!;
  const stylePreset = applyRelayoutChromePolicy(baseStylePreset);
  const graphicCategory = inferGraphicCategoryFromText(combinedText);
  const templateId = resolveRelayoutTemplateId({
    requestedTemplateId: input.templateId,
    bodyCount: narrative.body.length,
    hasImage: Boolean(imageElement?.src),
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    seed: input.layoutSeed ?? Date.now(),
  });

  const slideData: AIPresentationSlide = {
    templateId,
    title: narrative.title.slice(0, 200),
    body: clampBodyLinesForTemplate(narrative.body, templateId).map((line) => line.slice(0, 240)),
    graphicCategory,
    imagePromptKeywords: combinedText.slice(0, 500) || narrative.title.slice(0, 500),
  };
  const svgGraphic = input.includeSvg === false
    ? null
    : pickRandomSvgFromCategory(graphicCategory);

  const result = generateSlide({
    slideData,
    imageUrl: imageElement?.src ?? null,
    svgGraphic,
    stylePreset,
    deckTitle: input.deckTitle,
    slideIndex: input.slideIndex,
    totalSlides: input.totalSlides,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
  });

  const imagePrompt = imageElement?.imagePrompt;
  const imageModelId = imageElement?.imageModelId;
  const imageReferenceUrls = imageElement?.imageReferenceUrls;
  let elements = result.slideContent.elements.map((element) => {
    if (element.type !== "image") {
      return element;
    }
    if (!element.src || !imageElement?.src || element.src !== imageElement.src) {
      return element;
    }
    return {
      ...element,
      ...(imagePrompt ? { imagePrompt } : {}),
      ...(imageModelId ? { imageModelId } : {}),
      ...(Array.isArray(imageReferenceUrls) && imageReferenceUrls.length > 0
        ? { imageReferenceUrls }
        : {}),
    };
  });
  let appliedCropShape: Exclude<GeometricCropShapeId, "auto"> | null = null;
  if (input.includeGeometricCrop) {
    const cropResult = applyGeometricImageCrop(elements, {
      requestedShape: input.geometricCropShape,
      seed: input.layoutSeed ?? Date.now(),
    });
    elements = cropResult.elements;
    appliedCropShape = cropResult.appliedShape;
  }
  let appliedAccentShape: Exclude<GeometricAccentShapeId, "auto"> | null = null;
  if (input.includeGeometricAccents) {
    const accentResult = buildGeometricAccentElements({
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      seed: (input.layoutSeed ?? Date.now()) + 101,
      requestedShape: input.geometricAccentShape,
      stylePreset,
    });
    const firstTextIndex = elements.findIndex((element) => element.type === "text");
    const nonBackgroundImageIndexes = elements
      .map((element, index) => ({ element, index }))
      .filter(({ element }) => (
        element.type === "image"
        && (
          element.x > 0
          || element.y > 0
          || element.width < canvas.width
          || element.height < canvas.height
        )
      ))
      .map(({ index }) => index);
    const lastNonBackgroundImageIndex = nonBackgroundImageIndexes.length > 0
      ? nonBackgroundImageIndexes[nonBackgroundImageIndexes.length - 1]!
      : -1;
    const insertionIndex = firstTextIndex >= 0
      ? firstTextIndex
      : (lastNonBackgroundImageIndex >= 0 ? lastNonBackgroundImageIndex + 1 : elements.length);
    elements = [
      ...elements.slice(0, insertionIndex),
      ...accentResult.elements,
      ...elements.slice(insertionIndex),
    ];
    appliedAccentShape = accentResult.appliedShape;
  }

  let relayoutContent: PresentationSlideContent = {
    ...result.slideContent,
    elements,
    transition: parsedContent.transition,
    durationMs: parsedContent.durationMs,
    canvas: {
      ...(canvas.preset ? { preset: canvas.preset } : {}),
      width: canvas.width,
      height: canvas.height,
    },
  };
  if (watermark) {
    const watermarkApplied = applyWatermarkToSlideContent(relayoutContent, watermark);
    relayoutContent = watermarkApplied.slideContent;
    warnings.push(...watermarkApplied.warnings);
    if (watermarkApplied.applied) {
      warnings.push(`Applied watermark (${watermark.format.toUpperCase()}, ${watermark.clarityPercent}%).`);
    }
  }

  warnings.push(...result.warnings);
  if (!imageElement?.src) {
    warnings.push("No reusable image found on this slide; used visual placeholder layout.");
  }
  if (input.includeGeometricCrop && appliedCropShape) {
    warnings.push(`Applied geometric image crop shape "${appliedCropShape}".`);
  } else if (input.includeGeometricCrop && !appliedCropShape) {
    warnings.push("Geometric crop requested but no eligible image was found on this slide.");
  }
  if (input.includeGeometricAccents && appliedAccentShape) {
    warnings.push(`Added geometric accents using "${appliedAccentShape}" shape.`);
  }
  warnings.push(`Applied template "${templateId}" with preset "${stylePresetId}".`);

  return {
    slideContent: relayoutContent,
    warnings,
    applied: {
      templateId,
      stylePresetId,
      graphicCategory,
      reusedImage: Boolean(imageElement?.src),
    },
  };
}

// ── Slide Split System Prompt ──────────────────────────────

const SLIDE_SPLIT_SYSTEM_PROMPT = `You are a presentation content structurer. Your job is to split an article into individual presentation slides.

For each slide, produce a JSON object with these fields:
- templateId: one of ${JSON.stringify(AI_LAYOUT_TEMPLATE_IDS)}
- title: a short, compelling title for the slide (max 200 chars)
- body: an array of 1-10 bullet point strings summarizing the key points
- sections (optional but strongly recommended): an array of section objects with:
  - heading: medium-size subheading text (max 180 chars)
  - details: array of 1-4 supporting detail lines (max 260 chars each)
- graphicCategory: one of ${JSON.stringify(AI_SVG_CATEGORIES)} - pick the most relevant category for a decorative SVG icon
- imagePromptKeywords: a descriptive prompt (max 500 chars) for generating a relevant background/hero image

Output ONLY a valid JSON array. No markdown code fences, no explanatory text.

You MUST return exactly the number of slides requested by the user message.

The first slide MUST use templateId "hero_center" as the title/intro slide.
Distribute remaining slides among "split_left_image", "split_right_image", "top_image_text_bottom", "bottom_image_text_top", and "feature_boxes_right" for visual variety.

Coverage and quality requirements:
- Preserve all major ideas from the source article across the full deck; do not drop sections.
- Keep slide text concise but substantive:
  - hero_center: 2-4 body points
  - split_left_image / split_right_image / top_image_text_bottom / bottom_image_text_top: 3-6 body points
  - feature_boxes_right: 3-5 body points
- Body points should be short, information-dense phrases (not full paragraphs).
- Prefer 3-level readable hierarchy when possible:
  - Level 1: title (largest)
  - Level 2: sections[].heading (medium)
  - Level 3: sections[].details[] (small detail text)`;

function buildSlideSplitUserPrompt(articleText: string, requestedSlides: number): string {
  return `Target slide count: ${requestedSlides}

Article:
${articleText}`;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function inferArticleLanguage(language: string, topic: string): "th" | "en" {
  if (language === "th") {
    return "th";
  }
  if (language === "en") {
    return "en";
  }
  return /[\u0e00-\u0e7f]/.test(topic) ? "th" : "en";
}

function computeSlideRecommendedWords(
  language: "th" | "en",
  numSlides: number,
): number {
  const wordsPerSlide = language === "th"
    ? ARTICLE_WORDS_PER_SLIDE_TH
    : ARTICLE_WORDS_PER_SLIDE_EN;
  return clampInteger(
    Math.max(1, numSlides) * wordsPerSlide,
    ARTICLE_TARGET_WORDS_MIN,
    ARTICLE_TARGET_WORDS_MAX,
  );
}

function resolveExplicitWordCount(
  skillParams?: Record<string, unknown>,
): number | null {
  if (!skillParams) {
    return null;
  }
  const candidateKeys = [
    "word_count",
    "wordCount",
    "max_words",
    "maxWords",
    "target_words",
    "targetWords",
  ];
  for (const key of candidateKeys) {
    const parsed = parsePositiveInteger(skillParams[key]);
    if (parsed && parsed >= 120) {
      return clampInteger(parsed, 120, 8000);
    }
  }
  return null;
}

function resolveLengthPresetTarget(
  skillParams?: Record<string, unknown>,
): { preset: "short" | "medium" | "long"; words: number } | null {
  const rawLength = typeof skillParams?.length === "string"
    ? skillParams.length.trim().toLowerCase()
    : "";
  if (rawLength === "short" || rawLength === "medium" || rawLength === "long") {
    return {
      preset: rawLength,
      words: ARTICLE_WORD_PRESET_TARGETS[rawLength],
    };
  }
  return null;
}

function buildArticleWordPlan(
  topic: string,
  language: string,
  numSlides: number,
  skillParams?: Record<string, unknown>,
): {
  targetWords: number;
  perSectionWords: number;
  slideRecommendedWords: number;
  hardMaxWords: number | null;
  lengthPreset: "short" | "medium" | "long" | null;
} {
  const resolvedLanguage = inferArticleLanguage(language, topic);
  const slideRecommendedWords = computeSlideRecommendedWords(resolvedLanguage, numSlides);
  const explicitWordCount = resolveExplicitWordCount(skillParams);
  const lengthPresetTarget = resolveLengthPresetTarget(skillParams);

  let targetWords = slideRecommendedWords;
  let hardMaxWords: number | null = null;
  let lengthPreset: "short" | "medium" | "long" | null = null;

  if (explicitWordCount) {
    hardMaxWords = explicitWordCount;
    targetWords = Math.min(slideRecommendedWords, explicitWordCount);
  } else if (lengthPresetTarget) {
    targetWords = lengthPresetTarget.words;
    lengthPreset = lengthPresetTarget.preset;
  }

  const perSectionWords = clampInteger(
    targetWords / Math.max(1, numSlides),
    40,
    180,
  );

  return {
    targetWords,
    perSectionWords,
    slideRecommendedWords,
    hardMaxWords,
    lengthPreset,
  };
}

function buildSlideSplitArticleExcerpt(
  articleText: string,
  requestedSlides: number,
  warnings: string[],
): string {
  const tokens = articleText.split(/\s+/).filter((token) => token.trim().length > 0);
  const dynamicLimit = Math.round(requestedSlides * 450);
  const maxWords = Math.max(
    SLIDE_SPLIT_MIN_WORDS,
    Math.min(SLIDE_SPLIT_MAX_WORDS, dynamicLimit),
  );
  if (tokens.length <= maxWords) {
    return tokens.join(" ");
  }

  const headCount = Math.max(1, Math.round(maxWords * 0.72));
  const tailCount = Math.max(1, maxWords - headCount);
  const excerpt = [
    ...tokens.slice(0, headCount),
    "[...continued summary context...]",
    ...tokens.slice(Math.max(0, tokens.length - tailCount)),
  ].join(" ");
  warnings.push(
    `Article is long (${tokens.length} words). Slide split used ${maxWords} words with head+tail sampling for better coverage.`,
  );
  return excerpt;
}

function splitWords(value: string): string[] {
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function countApproxWords(value: string): number {
  return splitWords(value).length;
}

function trimToMaxWords(value: string, maxWords: number): string {
  const tokens = splitWords(value);
  if (tokens.length <= maxWords) {
    return value;
  }
  return tokens.slice(0, maxWords).join(" ");
}

function parseStructuredSectionFromLine(line: string): { heading: string; details: string[] } | null {
  const normalized = normalizeCoverageText(line);
  if (!normalized) {
    return null;
  }

  const separators = [":", " - ", " — ", " – ", "|"];
  for (const separator of separators) {
    const index = normalized.indexOf(separator);
    if (index <= 0) {
      continue;
    }
    const heading = normalizeCoverageText(normalized.slice(0, index));
    const detailText = normalizeCoverageText(normalized.slice(index + separator.length));
    if (heading.length < 3 || detailText.length < 4) {
      continue;
    }
    return { heading, details: [detailText] };
  }

  return null;
}

function buildSlideSectionsFromBody(
  body: string[],
  templateId: (typeof AI_LAYOUT_TEMPLATE_IDS)[number],
): Array<{ heading: string; details: string[] }> {
  const sections: Array<{ heading: string; details: string[] }> = [];
  const maxSections = templateId === "hero_center" ? 2 : (templateId === "feature_boxes_right" ? 5 : 4);
  let index = 0;

  while (index < body.length && sections.length < maxSections) {
    const current = normalizeCoverageText(body[index] ?? "");
    if (!current) {
      index += 1;
      continue;
    }

    const parsed = parseStructuredSectionFromLine(current);
    if (parsed) {
      sections.push({
        heading: parsed.heading.slice(0, 180),
        details: parsed.details.map((detail) => detail.slice(0, 260)),
      });
      index += 1;
      continue;
    }

    const next = normalizeCoverageText(body[index + 1] ?? "");
    if (next.length >= 12 && next.toLowerCase() !== current.toLowerCase()) {
      sections.push({
        heading: current.slice(0, 180),
        details: [next.slice(0, 260)],
      });
      index += 2;
      continue;
    }

    sections.push({
      heading: current.slice(0, 180),
      details: [current.slice(0, 260)],
    });
    index += 1;
  }

  return sections;
}

function normalizeSlideHierarchy(slide: AIPresentationSlide): AIPresentationSlide {
  const title = normalizeSlideText(slide.title).slice(0, 200) || "Key Insight";
  const body = clampBodyLinesForTemplate(slide.body, slide.templateId)
    .map((line) => normalizeSlideText(line).slice(0, 240))
    .filter((line) => line.length > 0);
  const maxSections = slide.templateId === "hero_center" ? 2 : 6;

  const explicitSections = (slide.sections ?? [])
    .map((section) => {
      const heading = normalizeSlideText(section.heading).slice(0, 180);
      const details = section.details
        .map((detail) => normalizeSlideText(detail).slice(0, 260))
        .filter((detail) => detail.length > 0)
        .slice(0, 4);
      if (!heading || details.length === 0) {
        return null;
      }
      return { heading, details };
    })
    .filter((section): section is { heading: string; details: string[] } => Boolean(section))
    .slice(0, maxSections);

  const sectionKeys = new Set(
    explicitSections.flatMap((section) => [
      section.heading.toLowerCase(),
      ...section.details.map((detail) => detail.toLowerCase()),
    ]),
  );
  const uncoveredBodyLines = body.filter((line) => !sectionKeys.has(line.toLowerCase()));
  const derivedFallback = buildSlideSectionsFromBody(uncoveredBodyLines, slide.templateId);
  const mergedSections = [...explicitSections];
  for (const candidate of derivedFallback) {
    if (mergedSections.length >= maxSections) {
      break;
    }
    const key = `${candidate.heading}||${candidate.details.join("||")}`.toLowerCase();
    if (sectionKeys.has(candidate.heading.toLowerCase()) || sectionKeys.has(key)) {
      continue;
    }
    mergedSections.push(candidate);
    sectionKeys.add(candidate.heading.toLowerCase());
    sectionKeys.add(key);
  }

  const sections = mergedSections.length > 0
    ? mergedSections
    : buildSlideSectionsFromBody(body, slide.templateId);

  return {
    ...slide,
    title,
    body: body.length > 0 ? body : ["Key point"],
    ...(sections.length > 0 ? { sections } : {}),
  };
}

function buildFallbackSlide(index: number, seed?: AIPresentationSlide): AIPresentationSlide {
  const nonIntroTemplates: Array<(typeof AI_LAYOUT_TEMPLATE_IDS)[number]> = [
    "split_right_image",
    "split_left_image",
    "top_image_text_bottom",
    "bottom_image_text_top",
    "feature_boxes_right",
  ];
  const templateId =
    index === 0
      ? "hero_center"
      : nonIntroTemplates[(index - 1) % nonIntroTemplates.length];
  const baseTitle = seed?.title?.trim() || "Key Insight";
  const title =
    index === 0
      ? baseTitle.slice(0, 200)
      : `${baseTitle} (Part ${index + 1})`.slice(0, 200);
  const body =
    seed?.body?.filter((line) => line.trim().length > 0).slice(0, 5)
    ?? [];
  return {
    templateId,
    title,
    body: body.length > 0 ? body : [`Key point ${index + 1}`],
    sections: body.length > 0
      ? buildSlideSectionsFromBody(body, templateId)
      : [{
          heading: `Key insight ${index + 1}`,
          details: [`Key point ${index + 1}`],
        }],
    graphicCategory: seed?.graphicCategory ?? "Business",
    imagePromptKeywords:
      seed?.imagePromptKeywords?.trim().slice(0, 500)
      || `${baseTitle}, presentation visual, professional style`,
  };
}

function normalizeSlidesToRequestedCount(
  slides: AIPresentationSlide[],
  requestedCount: number,
  warnings: string[],
): AIPresentationSlide[] {
  if (slides.length === requestedCount) {
    return slides;
  }

  if (slides.length > requestedCount) {
    warnings.push(
      `Slide structuring returned ${slides.length} slides; trimmed to requested ${requestedCount}.`,
    );
    return slides.slice(0, requestedCount);
  }

  warnings.push(
    `Slide structuring returned ${slides.length} slides; padded to requested ${requestedCount}.`,
  );
  const padded = [...slides];
  while (padded.length < requestedCount) {
    const seed = slides.length > 0
      ? slides[padded.length % slides.length]
      : undefined;
    padded.push(buildFallbackSlide(padded.length, seed));
  }
  return padded;
}

function normalizeCoverageText(value: string): string {
  return value
    .replace(/^[\s\u2022\-*•]+/, "")
    .replace(/^\d+[\).:\-\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCoveragePointsFromArticle(articleText: string, maxPoints: number): string[] {
  const rawLines = articleText
    .split(/\r?\n/)
    .map((line) => normalizeCoverageText(line))
    .filter((line) => line.length >= 18);

  const linePoints = rawLines
    .filter((line) => !/^(title|บทนำ|introduction)\s*[:\-]/i.test(line))
    .slice(0, maxPoints * 2);

  const sentencePoints = articleText
    .replace(/\r/g, " ")
    .split(/[.!?。！？\n]+/)
    .map((sentence) => normalizeCoverageText(sentence))
    .filter((sentence) => sentence.length >= 24)
    .slice(0, maxPoints * 2);

  const merged = [...linePoints, ...sentencePoints];
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const point of merged) {
    const key = point.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(point);
    }
    if (deduped.length >= maxPoints) {
      break;
    }
  }
  return deduped;
}

function tokenizeCoverage(value: string): string[] {
  const matches = value
    .toLowerCase()
    .match(/[a-z0-9\u0e00-\u0e7f]{2,}/g);
  if (!matches) {
    return [];
  }
  return matches.filter((token) => token.length >= 2);
}

interface SlideCoverageStats {
  score: number;
  coveredPoints: number;
  totalPoints: number;
  avgBulletsPerSlide: number;
}

export function assessSlideCoverage(
  articleText: string,
  slides: AIPresentationSlide[],
): SlideCoverageStats {
  if (slides.length === 0) {
    return { score: 0, coveredPoints: 0, totalPoints: 0, avgBulletsPerSlide: 0 };
  }

  const coveragePoints = extractCoveragePointsFromArticle(
    articleText,
    Math.max(slides.length * 3, 8),
  );
  if (coveragePoints.length === 0) {
    const totalBullets = slides.reduce((sum, slide) => sum + slide.body.length, 0);
    return {
      score: 1,
      coveredPoints: 0,
      totalPoints: 0,
      avgBulletsPerSlide: totalBullets / slides.length,
    };
  }

  const slideTokenSets = slides.map((slide) => {
    const sectionText = (slide.sections ?? [])
      .map((section) => `${section.heading} ${section.details.join(" ")}`)
      .join(" ");
    return new Set(tokenizeCoverage(`${slide.title} ${slide.body.join(" ")} ${sectionText}`));
  });

  let coveredPoints = 0;
  for (const point of coveragePoints) {
    const pointTokens = tokenizeCoverage(point);
    if (pointTokens.length === 0) {
      continue;
    }
    const uniquePointTokens = Array.from(new Set(pointTokens));
    let isCovered = false;
    for (const slideTokens of slideTokenSets) {
      let overlap = 0;
      for (const token of uniquePointTokens) {
        if (slideTokens.has(token)) {
          overlap += 1;
        }
      }
      const overlapRatio = overlap / uniquePointTokens.length;
      if (overlap >= 2 || overlapRatio >= 0.34) {
        isCovered = true;
        break;
      }
    }
    if (isCovered) {
      coveredPoints += 1;
    }
  }

  const totalBullets = slides.reduce((sum, slide) => sum + slide.body.length, 0);
  return {
    score: coveragePoints.length > 0 ? coveredPoints / coveragePoints.length : 1,
    coveredPoints,
    totalPoints: coveragePoints.length,
    avgBulletsPerSlide: totalBullets / slides.length,
  };
}

function topUpSlideBodiesFromArticle(
  articleText: string,
  slides: AIPresentationSlide[],
): AIPresentationSlide[] {
  const coveragePoints = extractCoveragePointsFromArticle(
    articleText,
    Math.max(slides.length * 4, 12),
  );
  if (coveragePoints.length === 0) {
    return slides;
  }

  const used = new Set<string>();
  const perSlideCandidates = slides.map((_, index) => {
    const start = Math.floor((index * coveragePoints.length) / slides.length);
    const end = Math.floor(((index + 1) * coveragePoints.length) / slides.length);
    return coveragePoints.slice(start, Math.max(start + 1, end));
  });

  return slides.map((slide, index) => {
    const normalizedBody = slide.body
      .map((line) => normalizeCoverageText(line))
      .filter((line) => line.length > 0)
      .slice(0, 8);

    const bodySet = new Set(normalizedBody.map((line) => line.toLowerCase()));
    const titleTokens = new Set(tokenizeCoverage(slide.title));
    const maxBody = slide.templateId === "hero_center" ? 5 : 7;
    const minBody = slide.templateId === "hero_center" ? 2 : 3;

    function tryAppendCandidate(candidate: string): boolean {
      const normalized = normalizeCoverageText(candidate);
      if (normalized.length < 14 || normalized.length > 240) {
        return false;
      }
      const key = normalized.toLowerCase();
      if (bodySet.has(key) || used.has(key)) {
        return false;
      }
      bodySet.add(key);
      used.add(key);
      normalizedBody.push(normalized);
      return true;
    }

    while (normalizedBody.length < minBody && normalizedBody.length < maxBody) {
      const localCandidates = [...perSlideCandidates[index], ...coveragePoints];
      let bestCandidate: string | null = null;
      let bestScore = -1;
      for (const candidate of localCandidates) {
        const normalized = normalizeCoverageText(candidate);
        if (normalized.length === 0) {
          continue;
        }
        const key = normalized.toLowerCase();
        if (bodySet.has(key) || used.has(key)) {
          continue;
        }
        const candidateTokens = tokenizeCoverage(normalized);
        let score = 0;
        for (const token of candidateTokens) {
          if (titleTokens.has(token)) {
            score += 2;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = normalized;
        }
      }
      if (!bestCandidate || !tryAppendCandidate(bestCandidate)) {
        break;
      }
    }

    if (normalizedBody.length === 0) {
      normalizedBody.push(`Key point ${index + 1}`);
    }

    return {
      ...slide,
      body: normalizedBody.slice(0, maxBody),
    };
  });
}

// ── Public Functions ───────────────────────────────────────

export function estimateCreditCost(numSlides: number): number {
  const base = CREDIT_ARTICLE + CREDIT_SPLIT + (CREDIT_IMAGE_SKILL + CREDIT_IMAGE_GEN) * numSlides;
  return Math.round(base * CREDIT_BUFFER_MULTIPLIER);
}

export function buildArticlePrompt(
  topic: string,
  language: string,
  numSlides: number,
  skillParams?: Record<string, unknown>,
): string {
  const langInstruction =
    language === "auto"
      ? "Write in the same language as the topic. If the topic is in Thai, write in Thai. If in English, write in English."
      : language === "th"
        ? "Write the entire article in Thai."
        : "Write the entire article in English.";

  let paramSection = "";
  if (skillParams && Object.keys(skillParams).length > 0) {
    const lines = Object.entries(skillParams)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `- ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    if (lines.length > 0) {
      paramSection = `\n\nAdditional parameters provided by the user:\n${lines.join("\n")}`;
    }
  }

  const wordPlan = buildArticleWordPlan(topic, language, numSlides, skillParams);
  const wordPlanLines = [
    `- Slide-based recommendation (${numSlides} slides): around ${wordPlan.slideRecommendedWords} words total.`,
    `- Target draft length: around ${wordPlan.targetWords} words.`,
    `- Suggested section size: around ${wordPlan.perSectionWords} words per section.`,
  ];
  if (wordPlan.lengthPreset) {
    wordPlanLines.push(
      `- Length preset "${wordPlan.lengthPreset}" detected. Keep behavior consistent with this preset unless constraints conflict.`,
    );
  }
  if (wordPlan.hardMaxWords) {
    wordPlanLines.push(
      `- STRICT LIMIT: The article MUST NOT exceed ${wordPlan.hardMaxWords} words.`,
    );
  }

  return `Write a well-structured article about: ${topic}

${langInstruction}

The article will be split into approximately ${numSlides} presentation slides, so organize the content into ${numSlides} clearly numbered sections. Each section should cover one main idea and be 2-4 sentences long.

Word planning instructions:
${wordPlanLines.join("\n")}

Include a clear, descriptive title at the top.${paramSection}`;
}

// ── Main Pipeline ──────────────────────────────────────────

export async function generateAIDraft(
  input: GenerateAIDraftInput,
  actor: PresentationActor,
  userToken: string,
  taskId: string,
): Promise<void> {
  const redis = getRedisClient();
  const progressKey = `ai_draft_progress:${taskId}`;
  const lockKey = `ai_draft_lock:${actor.userId}`;
  const cancelKey = `ai_draft_cancel:${taskId}`;
  const warnings: string[] = [];

  async function updateProgress(partial: Partial<AIDraftProgress>): Promise<void> {
    const progress: AIDraftProgress & { userId: number } = {
      userId: actor.userId,
      phase: 0,
      phaseLabel: "Initializing...",
      slidesCompleted: 0,
      totalSlides: input.numSlides,
      slidePreview: [],
      completed: false,
      ...partial,
    };
    await redis.set(progressKey, JSON.stringify(progress), "EX", PROGRESS_TTL_SECONDS);
  }

  async function isCancelled(): Promise<boolean> {
    const val = await redis.get(cancelKey);
    return val !== null;
  }

  async function setCancelled(): Promise<void> {
    await updateProgress({
      completed: true,
      cancelled: true,
      phaseLabel: "Cancelled",
    });
  }

  async function refreshLockIfOwned(): Promise<void> {
    const owner = await redis.get(lockKey);
    if (owner === taskId) {
      await redis.expire(lockKey, LOCK_TTL_SECONDS);
    }
  }

  async function releaseLockIfOwned(): Promise<void> {
    const owner = await redis.get(lockKey);
    if (owner === taskId) {
      await redis.del(lockKey);
    }
  }

  // ── Heartbeat ─────────────────────────────────────────
  const heartbeat = setInterval(() => {
    refreshLockIfOwned().catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);

  try {
    // Sanitize user inputs
    const sanitizedPrompt = input.prompt.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 1000);
    const sanitizedImagePromptContext = sanitizePromptContext(input.imagePromptContext);
    const normalizedReferenceImageUrls = normalizeReferenceImageUrls(input.referenceImageUrls);
    const normalizedWatermark = normalizeWatermarkInput(input.watermark, warnings);
    const canvasWidth = sanitizeCanvasDimension(input.canvasWidth) ?? DEFAULT_CANVAS_WIDTH;
    const canvasHeight = sanitizeCanvasDimension(input.canvasHeight) ?? DEFAULT_CANVAS_HEIGHT;
    const canvasAspectRatio = toAspectRatio(canvasWidth, canvasHeight);
    const canvasPreset = CANVAS_PRESET_BY_RATIO[canvasAspectRatio];
    const requestedImageModel = input.imageModel?.trim();

    // Load image skill early to determine media type (image vs video)
    const preloadedImageSkill = input.imageSkillId
      ? await getSkillByIdAsync(input.imageSkillId)
      : undefined;
    const isVideoSkill =
      preloadedImageSkill?.type === "video-generation" ||
      preloadedImageSkill?.type === "image-video-generation";
    const mediaModelQueryType = isVideoSkill ? "video" : "image";

    const availableImageModels = await getModelsByTypeAsync(mediaModelQueryType);
    const textToImageModels = isVideoSkill ? [] : availableImageModels.filter(isTextToImageModel);
    const requestedModelMatch = requestedImageModel
      ? availableImageModels.find((model) => model.id === requestedImageModel)
      : undefined;

    let selectedImageModel =
      requestedModelMatch
      ?? (isVideoSkill ? availableImageModels[0] : (textToImageModels[0] ?? availableImageModels[0]));

    if (requestedImageModel && !requestedModelMatch) {
      warnings.push(
        `${isVideoSkill ? "Video" : "Image"} model "${requestedImageModel}" not found; using "${selectedImageModel?.id ?? (isVideoSkill ? FALLBACK_VIDEO_MODEL : FALLBACK_IMAGE_MODEL)}"`,
      );
    }

    if (!isVideoSkill && selectedImageModel && !isTextToImageModel(selectedImageModel) && textToImageModels[0]) {
      const generateType = String((selectedImageModel.configJson as Record<string, unknown> | undefined)?.generateType || "unknown");
      warnings.push(
        `Image model "${selectedImageModel.id}" uses generateType "${generateType}" and is not text-to-image; using "${textToImageModels[0].id}" instead`,
      );
      selectedImageModel = textToImageModels[0];
    }

    const imageModelToUse: ImageModel = (
      selectedImageModel?.id
      || (isVideoSkill ? FALLBACK_VIDEO_MODEL : FALLBACK_IMAGE_MODEL)
    ) as ImageModel;
    const mediaApiConfig = buildImageApiConfig(selectedImageModel);
    const imageAspectRatio = selectAspectRatioForModel(
      canvasAspectRatio,
      selectedImageModel?.aspectRatios,
    );
    if (imageAspectRatio !== canvasAspectRatio) {
      warnings.push(
        `${isVideoSkill ? "Video" : "Image"} model "${imageModelToUse}" does not list aspect ratio "${canvasAspectRatio}"; using "${imageAspectRatio}"`,
      );
    }
    // Base extra params: field defaults + reference_images + aspect_ratio sync targets.
    // Prompt sync is applied per-slide (see below) since the prompt varies per slide.
    const mediaExtraParams = applyFieldSyncTargets(
      buildImageExtraParams(selectedImageModel),
      selectedImageModel,
      { referenceImageUrls: normalizedReferenceImageUrls, aspectRatio: imageAspectRatio },
    );
    const selectedVideoDuration = isVideoSkill
      ? selectVideoDuration(selectedImageModel, mediaExtraParams)
      : undefined;

    // ── Credit pre-check (UX fast-fail; actual deductions happen in downstream LLM/media services)
    const estimatedCost = estimateCreditCost(input.numSlides);
    const hasCredits = await hasEnoughCredits(actor.userId, estimatedCost);
    if (!hasCredits) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_INSUFFICIENT_CREDITS,
          message: "Insufficient credits for AI presentation generation",
        },
      });
      return;
    }

    // ── Phase 1: Article Generation ───────────────────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({ phase: 1, phaseLabel: "Writing article..." });

    auditLogger.log({
      traceId: taskId,
      timestamp: new Date().toISOString(),
      eventType: "skill_execute",
      userId: actor.userId,
      requestPayload: { phase: 1, skillId: input.articleSkillId, topic: sanitizedPrompt },
    });

    // Skills are system-level (filesystem-based), already validated by Zod in router.
    // No per-user scoping needed — all enabled skills are visible to all users.
    const articleSkill = await getSkillByIdAsync(input.articleSkillId);
    if (!articleSkill?.systemPrompt) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
          message: `Article skill not found: ${input.articleSkillId}`,
        },
      });
      return;
    }
    const articleModel = await resolveRoutableTextModel(
      resolveSkillModel(articleSkill),
      articleSkill?.preferredProviderId,
      articleSkill?.strictProviderPin,
    );

    let articleText: string;
    try {
      articleText = await invokeSkillTextLLM({
        model: articleModel,
        systemPrompt: articleSkill.systemPrompt,
        userPrompt: buildArticlePrompt(sanitizedPrompt, input.language, input.numSlides, input.articleSkillParams),
        userId: actor.userId,
        preferredProviderId: articleSkill.preferredProviderId,
        strictProviderPin: articleSkill.strictProviderPin,
      });
    } catch (err) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
          message: `Article generation failed: ${sanitizeErrorMessage(err)}`,
        },
      });
      return;
    }

    const explicitWordLimit = resolveExplicitWordCount(input.articleSkillParams);
    if (explicitWordLimit) {
      const originalWordCount = countApproxWords(articleText);
      if (originalWordCount > explicitWordLimit) {
        articleText = trimToMaxWords(articleText, explicitWordLimit);
        warnings.push(
          `Applied explicit article word limit: ${explicitWordLimit} words (original ${originalWordCount}).`,
        );
      }
    }

    // ── Phase 2: Article to Slide Split ───────────────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({ phase: 2, phaseLabel: "Splitting into slides..." });

    const splitArticleExcerpt = buildSlideSplitArticleExcerpt(articleText, input.numSlides, warnings);

    let slides: AIPresentationSlide[];
    try {
      const splitResult = await callLLMStructured({
        systemPrompt: SLIDE_SPLIT_SYSTEM_PROMPT,
        userMessage: buildSlideSplitUserPrompt(splitArticleExcerpt, input.numSlides),
        model: articleModel,
        preferredProviderId: articleSkill.preferredProviderId,
        strictProviderPin: articleSkill.strictProviderPin,
        zodSchema: AIPresentationSchema,
        userId: actor.userId,
        tenantId: actor.tenantId,
      });
      slides = normalizeSlidesToRequestedCount(splitResult.data, input.numSlides, warnings)
        .map((slide) => normalizeSlideHierarchy(slide));
    } catch (err) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE,
          message: `Article split failed: ${sanitizeErrorMessage(err)}`,
        },
      });
      return;
    }

    // Force slide 1 to hero_center
    if (slides.length > 0 && slides[0].templateId !== "hero_center") {
      slides[0] = normalizeSlideHierarchy({ ...slides[0], templateId: "hero_center" });
    }

    const initialCoverage = assessSlideCoverage(articleText, slides);
    if (initialCoverage.score < 0.68 || initialCoverage.avgBulletsPerSlide < 2.2) {
      const enrichedSlides = topUpSlideBodiesFromArticle(articleText, slides)
        .map((slide) => normalizeSlideHierarchy(slide));
      const enrichedCoverage = assessSlideCoverage(articleText, enrichedSlides);
      if (enrichedCoverage.score > initialCoverage.score
        || enrichedCoverage.avgBulletsPerSlide > initialCoverage.avgBulletsPerSlide) {
        slides = enrichedSlides;
      }
      warnings.push(
        `Slide coverage check: ${Math.round(initialCoverage.score * 100)}% -> ${Math.round(enrichedCoverage.score * 100)}%, avg bullets ${initialCoverage.avgBulletsPerSlide.toFixed(1)} -> ${enrichedCoverage.avgBulletsPerSlide.toFixed(1)}.`,
      );
    }

    // Build slide preview
    const slidePreview: Array<{ title: string; imageStatus: "pending" | "done" | "placeholder" }> = slides.map((s) => ({
      title: s.title,
      imageStatus: "pending" as const,
    }));

    await updateProgress({
      phase: 2,
      phaseLabel: "Slides structured",
      totalSlides: slides.length,
      slidePreview,
    });

    // ── Phase 3+4: Media Enhancement + Generation ─────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({ phase: 3, phaseLabel: isVideoSkill ? "Generating videos..." : "Generating images..." });
    const mediaPollTimeoutMs = isVideoSkill
      ? computeVideoPollTimeoutMs(input.numSlides)
      : computeImagePollTimeoutMs(input.numSlides);
    const mediaActiveGraceMs = isVideoSkill
      ? Math.min(
          VIDEO_POLL_ACTIVE_GRACE_MAX_MS,
          VIDEO_POLL_ACTIVE_GRACE_BASE_MS + (Math.max(1, Math.round(input.numSlides)) * VIDEO_POLL_ACTIVE_GRACE_PER_SLIDE_MS),
        )
      : 0;

    // Use preloaded image skill (already fetched above for media type detection)
    let imageSkillSystemPrompt: string | null = null;
    let imageSkillModel = DEFAULT_TEXT_MODEL;
    let imageSkillPreferredProviderId: number | undefined;
    let imageSkillStrictProviderPin: boolean | undefined;
    if (preloadedImageSkill) {
      imageSkillSystemPrompt = preloadedImageSkill.systemPrompt ?? null;
      imageSkillPreferredProviderId = preloadedImageSkill.preferredProviderId;
      imageSkillStrictProviderPin = preloadedImageSkill.strictProviderPin;
      imageSkillModel = await resolveRoutableTextModel(
        resolveSkillModel(preloadedImageSkill),
        imageSkillPreferredProviderId,
        imageSkillStrictProviderPin,
      );
    }

    const imageUrls: (string | null)[] = [];
    const imagePrompts: string[] = [];
    const mediaFailureReasons: Array<string | null> = new Array(slides.length).fill(null);
    const deferredMediaTasks: Array<DeferredMediaTaskInfo | null> = new Array(slides.length).fill(null);
    let mediaSlidesFinalized = 0;

    // Process slides with bounded concurrency
    await mapWithConcurrency(
      slides,
      async (slide, index) => {
        if (await isCancelled()) {
          imageUrls[index] = null;
          return;
        }

        // Phase 3: Image prompt enhancement
        const baseImagePrompt = appendPromptContext(slide.imagePromptKeywords, sanitizedImagePromptContext);
        let imagePrompt = baseImagePrompt;

        await updateProgress({
          phase: 4,
          phaseLabel: `${isVideoSkill ? "Videos" : "Images"}: preparing ${index + 1}/${slides.length}`,
          slidesCompleted: mediaSlidesFinalized,
          totalSlides: slides.length,
          slidePreview,
        });

        if (imageSkillSystemPrompt) {
          try {
            imagePrompt = await withTimeout(
              invokeSkillTextLLM({
                model: imageSkillModel,
                systemPrompt: imageSkillSystemPrompt,
                userPrompt: baseImagePrompt,
                userId: actor.userId,
                preferredProviderId: imageSkillPreferredProviderId,
                strictProviderPin: imageSkillStrictProviderPin,
              }),
              IMAGE_PROMPT_ENHANCE_TIMEOUT_MS,
              "image_prompt_enhancement_timeout",
            );
            imagePrompt = appendPromptContext(imagePrompt, sanitizedImagePromptContext);
          } catch (err) {
            warnings.push(`Slide ${index + 1}: image prompt enhancement failed (${sanitizeErrorMessage(err)}), using raw keywords`);
          }
        }
        imagePrompts[index] = imagePrompt;

        // Apply per-slide prompt sync (fields with syncWith="prompt" receive the final prompt).
        const slideExtraParams = applyFieldSyncTargets(
          mediaExtraParams,
          selectedImageModel,
          { prompt: imagePrompt },
        );

        // Phase 4: Media generation (image or video depending on skill type)
        let imageUrl: string | null = null;
        try {
          const mediaTask = await withTimeout(
            isVideoSkill
              ? mediaGenerationService.generateVideoAsync(
                  {
                    prompt: imagePrompt,
                    model: imageModelToUse as string,
                    ...(selectedVideoDuration ? { duration: selectedVideoDuration } : {}),
                    aspectRatio: imageAspectRatio,
                    ...(normalizedReferenceImageUrls.length > 0
                      ? { referenceImageUrls: normalizedReferenceImageUrls }
                      : {}),
                    ...(mediaApiConfig ? { apiConfig: mediaApiConfig } : {}),
                    ...(slideExtraParams ? { extraParams: slideExtraParams } : {}),
                  },
                  userToken,
                )
              : mediaGenerationService.generateImageAsync(
                  {
                    prompt: imagePrompt,
                    model: imageModelToUse,
                    aspectRatio: imageAspectRatio,
                    ...(normalizedReferenceImageUrls.length > 0
                      ? { referenceImageUrls: normalizedReferenceImageUrls }
                      : {}),
                    ...(mediaApiConfig ? { apiConfig: mediaApiConfig } : {}),
                    ...(slideExtraParams ? { extraParams: slideExtraParams } : {}),
                  },
                  userToken,
                ),
            MEDIA_SUBMIT_TIMEOUT_MS,
            "media_submit_timeout",
          );
          const pollResult = await pollMediaTask(
            mediaTask.id,
            userToken,
            mediaPollTimeoutMs,
            { activeGraceMs: mediaActiveGraceMs },
          );
          imageUrl = pollResult.url;
          if (!imageUrl) {
            const reason = (pollResult.reason || "no output URL")
              .replace(/\s+/g, " ")
              .slice(0, 160);
            mediaFailureReasons[index] = reason;
            const taskRef = mediaTask.taskId || mediaTask.id;
            warnings.push(`Slide ${index + 1}: ${isVideoSkill ? "video" : "image"} generation returned no media (${reason}) [task=${taskRef}]`);
            if (
              pollResult.status === "timeout"
              || pollResult.status === "pending"
              || pollResult.status === "processing"
            ) {
              deferredMediaTasks[index] = {
                mediaType: isVideoSkill ? "video" : "image",
                mediaTaskId: mediaTask.id,
                providerTaskId: mediaTask.taskId,
                modelId: imageModelToUse,
                prompt: imagePrompt,
                reason,
              };
            }
          }
        } catch (err) {
          const reason = sanitizeErrorMessage(err);
          mediaFailureReasons[index] = reason;
          warnings.push(`Slide ${index + 1}: ${isVideoSkill ? "video" : "image"} generation failed (${reason})`);
        }

        imageUrls[index] = imageUrl;

        // Update slide preview
        slidePreview[index] = {
          ...slidePreview[index],
          imageStatus: imageUrl ? "done" : "placeholder",
        };
        mediaSlidesFinalized += 1;

        await updateProgress({
          phase: 4,
          phaseLabel: `${isVideoSkill ? "Videos" : "Images"}: ${mediaSlidesFinalized}/${slides.length}`,
          slidesCompleted: mediaSlidesFinalized,
          totalSlides: slides.length,
          slidePreview,
        });
      },
      MAX_IMAGE_CONCURRENCY,
    );

    // ── Phase 5: Layout Compilation ───────────────────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({ phase: 5, phaseLabel: "Compiling layouts..." });

    const preset = getBuiltInPreset(input.stylePresetId);
    if (!preset) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
          message: `Unknown style preset: ${input.stylePresetId}`,
        },
      });
      return;
    }

    // Override footer text if provided (sanitize user input)
    const presetCopy = JSON.parse(JSON.stringify(preset));
    if (input.headerCustomText) {
      if (!presetCopy.header) {
        presetCopy.header = { enabled: false, height: 60, backgroundColor: "transparent" };
      }
      presetCopy.header.customTitle = escapeHtml(input.headerCustomText.slice(0, 200));
      presetCopy.header.showDeckTitle = true;
    }
    if (input.footerCustomText && presetCopy.footer) {
      presetCopy.footer.customText = escapeHtml(input.footerCustomText.slice(0, 200));
      presetCopy.footer.showCustomText = true;
    }

    // Apply style overrides from user (header/footer toggles)
    if (input.styleOverrides) {
      const ov = input.styleOverrides;
      if (ov.headerEnabled !== undefined) {
        if (!presetCopy.header) {
          presetCopy.header = { enabled: false, height: 60, backgroundColor: "transparent" };
        }
        presetCopy.header.enabled = ov.headerEnabled;
      }
      if (ov.showDeckTitle !== undefined && presetCopy.header) {
        presetCopy.header.showDeckTitle = ov.showDeckTitle;
      }
      if (ov.footerEnabled !== undefined) {
        if (!presetCopy.footer) {
          presetCopy.footer = { enabled: false, height: 40, backgroundColor: "transparent" };
        }
        presetCopy.footer.enabled = ov.footerEnabled;
      }
      if (ov.showPageNumber !== undefined && presetCopy.footer) {
        presetCopy.footer.showPageNumber = ov.showPageNumber;
      }
    }

    const compiledSlides: PresentationSlideContent[] = [];
    for (let i = 0; i < slides.length; i++) {
      const svg = pickRandomSvgFromCategory(slides[i].graphicCategory);
      const { slideContent, warnings: layoutWarnings } = generateSlide({
        slideData: slides[i],
        imageUrl: imageUrls[i] ?? null,
        svgGraphic: svg,
        stylePreset: presetCopy,
        deckTitle: i === 0 ? sanitizedPrompt.slice(0, 36) : undefined,
        slideIndex: i,
        totalSlides: slides.length,
        canvasWidth,
        canvasHeight,
      });
      const promptForSlide = imagePrompts[i]?.trim();
      const imageModelIdForSlide = selectedImageModel?.id ?? imageModelToUse;
      const elementsWithImageMetadata = slideContent.elements.map((element) => {
        if (element.type !== "image") {
          return element;
        }
        if (!element.src || !element.src.trim()) {
          return element;
        }
        if (isVideoSkill) {
          return {
            id: element.id,
            type: "video" as const,
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
            ...(element.opacity !== undefined ? { opacity: element.opacity } : {}),
            ...(element.rotation !== undefined ? { rotation: element.rotation } : {}),
            src: element.src,
            title: slides[i].title,
            muted: true,
            loop: true,
          };
        }
        return {
          ...element,
          ...(promptForSlide ? { imagePrompt: promptForSlide.slice(0, 4000) } : {}),
          ...(imageModelIdForSlide ? { imageModelId: imageModelIdForSlide } : {}),
          ...(normalizedReferenceImageUrls.length > 0
            ? { imageReferenceUrls: normalizedReferenceImageUrls }
            : {}),
        };
      });
      const deferredTask = deferredMediaTasks[i];
      const pendingMediaJobs: SlidePendingMediaJob[] = [];
      if (deferredTask) {
        const target = findPendingMediaTarget(
          elementsWithImageMetadata,
          slides[i].templateId,
          canvasWidth,
          canvasHeight,
        );
        if (target) {
          pendingMediaJobs.push(buildPendingMediaJob(deferredTask, target));
          const taskRef = deferredTask.providerTaskId || deferredTask.mediaTaskId;
          warnings.push(`Slide ${i + 1}: queued deferred ${deferredTask.mediaType} task for later fetch [task=${taskRef}]`);
        } else {
          warnings.push(`Slide ${i + 1}: deferred media task could not find a target region on slide`);
        }
      }
      let slideWithCanvas: PresentationSlideContent = {
        ...slideContent,
        elements: elementsWithImageMetadata,
        canvas: {
          ...(canvasPreset ? { preset: canvasPreset } : {}),
          width: canvasWidth,
          height: canvasHeight,
        },
        ...(pendingMediaJobs.length > 0 ? { pendingMediaJobs } : {}),
      };
      if (normalizedWatermark) {
        const watermarkApplied = applyWatermarkToSlideContent(slideWithCanvas, normalizedWatermark);
        slideWithCanvas = watermarkApplied.slideContent;
        warnings.push(...watermarkApplied.warnings.map((warning) => `Slide ${i + 1}: ${warning}`));
      }
      compiledSlides.push(slideWithCanvas);
      if (mediaFailureReasons[i]) {
        warnings.push(
          ...layoutWarnings.filter((warning) => !warning.toLowerCase().includes("placeholder")),
        );
      } else {
        warnings.push(...layoutWarnings);
      }
    }

    // ── Phase 6: Deck Insertion ───────────────────────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({ phase: 6, phaseLabel: "Saving slides..." });

    const db = await getDb();
    if (!db) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
          message: "Database not available",
        },
      });
      return;
    }

    let insertionBaseVersion = input.expectedVersion;
    try {
      await db.transaction(async (tx) => {
        const deckRows = await tx
          .select({ version: presentationDecks.version })
          .from(presentationDecks)
          .where(
            and(
              eq(presentationDecks.id, input.deckId),
              eq(presentationDecks.tenantId, actor.tenantId),
            ),
          )
          .limit(1);

        const deckRow = deckRows[0];
        if (!deckRow) {
          throw new Error(`${PRESENTATION_ERROR_CODE.NOT_FOUND}: deck ${input.deckId} not found`);
        }

        let expectedVersion = deckRow.version;
        insertionBaseVersion = expectedVersion;
        for (const slideContent of compiledSlides) {
          await addSlideToDeck(
            { deckId: input.deckId, expectedVersion, slideContent: slideContent as Record<string, unknown> },
            actor,
            tx as unknown as DrizzleDB,
          );
          expectedVersion++;
        }
      });
    } catch (err) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
          message: `Slide insertion failed: ${sanitizeErrorMessage(err)}`,
        },
      });
      return;
    }

    // ── Success ─────────────────────────────────────────
    await updateProgress({
      phase: 6,
      phaseLabel: "Complete",
      completed: true,
      slidesCompleted: compiledSlides.length,
      totalSlides: compiledSlides.length,
      slidePreview,
      result: {
        slidesAdded: compiledSlides.length,
        newDeckVersion: insertionBaseVersion + compiledSlides.length,
        articlePreview: articleText.slice(0, 200),
        warnings,
      },
    });

    auditLogger.log({
      traceId: taskId,
      timestamp: new Date().toISOString(),
      eventType: "skill_execute",
      userId: actor.userId,
      responsePayload: {
        phase: "complete",
        slidesAdded: compiledSlides.length,
        warnings: warnings.length,
      },
    });
  } catch (err) {
    // Unexpected error — catch-all
    await updateProgress({
      completed: true,
      error: {
        code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
        message: `Unexpected error: ${sanitizeErrorMessage(err)}`,
      },
    }).catch(() => {});
  } finally {
    clearInterval(heartbeat);
    await releaseLockIfOwned().catch(() => {});
  }
}

export interface ResolvePendingMediaForDeckInput {
  deckId: number;
  maxJobs?: number;
}

export interface ResolvePendingMediaForDeckResult {
  slidesUpdated: number;
  jobsChecked: number;
  jobsResolved: number;
  jobsRemaining: number;
  warnings: string[];
}

export async function resolvePendingMediaForDeck(
  input: ResolvePendingMediaForDeckInput,
  actor: PresentationActor,
  userToken: string,
): Promise<ResolvePendingMediaForDeckResult> {
  const maxJobs = Number.isFinite(input.maxJobs)
    ? Math.max(1, Math.min(200, Math.round(input.maxJobs as number)))
    : 30;
  const warnings: string[] = [];
  let slidesUpdated = 0;
  let jobsChecked = 0;
  let jobsResolved = 0;
  let jobsRemaining = 0;

  const detail = await getPresentationDeckDetail(input.deckId, actor);
  const orderedSlides = [...detail.slides].sort((a, b) => a.orderIndex - b.orderIndex);

  for (const slide of orderedSlides) {
    const parsed = presentationSlideContentSchema.safeParse(slide.slideContent);
    if (!parsed.success) {
      warnings.push(`Slide ${slide.orderIndex + 1}: invalid slide content, skipped pending media resolution`);
      continue;
    }

    const baseContent = parsed.data;
    const existingJobs = baseContent.pendingMediaJobs ?? [];
    if (existingJobs.length === 0) {
      continue;
    }
    if (jobsChecked >= maxJobs) {
      jobsRemaining += existingJobs.length;
      continue;
    }

    let nextElements = [...baseContent.elements];
    const nextJobs: Array<SlidePendingMediaJob | null> = [...existingJobs];
    let slideMutated = false;
    let slideResolvedCount = 0;

    for (let i = 0; i < nextJobs.length; i++) {
      if (jobsChecked >= maxJobs) {
        break;
      }
      const job = nextJobs[i];
      if (!job) {
        continue;
      }
      jobsChecked += 1;
      const checkedAt = toIsoNow();

      let task;
      try {
        task = await withTimeout(
          mediaGenerationService.getTask(job.mediaTaskId, userToken),
          MEDIA_STATUS_FETCH_TIMEOUT_MS,
          "media_status_fetch_timeout",
        );
      } catch (err) {
        const reason = sanitizeErrorMessage(err).slice(0, 256);
        nextJobs[i] = {
          ...job,
          status: "pending",
          reason,
          lastCheckedAt: checkedAt,
        };
        slideMutated = true;
        warnings.push(`Slide ${slide.orderIndex + 1}: failed to fetch task ${job.mediaTaskId} (${reason})`);
        continue;
      }

      if (task.status === "completed") {
        const resolvedUrl = task.resultUrl || extractMediaUrlFromResultData(task.resultData);
        if (resolvedUrl) {
          nextElements = applyResolvedMediaToElements(nextElements, job, resolvedUrl, slide.title);
          nextJobs[i] = null;
          slideMutated = true;
          slideResolvedCount += 1;
          continue;
        }

        warnings.push(`Slide ${slide.orderIndex + 1}: task ${job.mediaTaskId} completed without media URL`);
        nextJobs[i] = null;
        slideMutated = true;
        continue;
      }

      if (task.status === "failed" || task.status === "cancelled") {
        const reason = (task.errorMessage || `task_${task.status}`).slice(0, 256);
        warnings.push(`Slide ${slide.orderIndex + 1}: task ${job.mediaTaskId} ${task.status} (${reason})`);
        nextJobs[i] = null;
        slideMutated = true;
        continue;
      }

      const nextStatus = task.status === "processing" ? "processing" : "pending";
      const nextReason = task.errorMessage?.slice(0, 256);
      const hasStatusChange = job.status !== nextStatus;
      const hasReasonChange = (job.reason || "") !== (nextReason || "");
      if (hasStatusChange || hasReasonChange || job.lastCheckedAt !== checkedAt) {
        nextJobs[i] = {
          ...job,
          status: nextStatus,
          ...(nextReason ? { reason: nextReason } : {}),
          lastCheckedAt: checkedAt,
        };
        slideMutated = true;
      }
    }

    if (!slideMutated) {
      jobsRemaining += existingJobs.length;
      continue;
    }

    const compactJobs = nextJobs.filter((job): job is SlidePendingMediaJob => Boolean(job));
    const { pendingMediaJobs: _existingPendingMediaJobs, ...contentWithoutPending } = baseContent;
    const nextSlideContent: PresentationSlideContent = {
      ...contentWithoutPending,
      elements: nextElements,
      ...(compactJobs.length > 0 ? { pendingMediaJobs: compactJobs } : {}),
    };

    try {
      await updateSlideInDeck(
        {
          deckId: input.deckId,
          slideId: slide.id,
          expectedVersion: slide.version,
          saveMode: "autosave",
          title: slide.title,
          notes: slide.notes,
          slideContent: nextSlideContent,
        },
        actor,
      );
      slidesUpdated += 1;
      jobsResolved += slideResolvedCount;
      jobsRemaining += compactJobs.length;
    } catch (err) {
      warnings.push(`Slide ${slide.orderIndex + 1}: failed to save resolved media (${sanitizeErrorMessage(err)})`);
      jobsRemaining += existingJobs.length;
    }
  }

  return {
    slidesUpdated,
    jobsChecked,
    jobsResolved,
    jobsRemaining,
    warnings,
  };
}

// ── Helpers ────────────────────────────────────────────────

interface PollMediaTaskResult {
  url: string | null;
  status: TaskStatus | "timeout";
  reason?: string;
}

interface PollMediaTaskOptions {
  activeGraceMs?: number;
}

function extractMediaUrlFromResultData(resultData: unknown): string | null {
  const seen = new Set<unknown>();
  const directUrlKeys = [
    "url",
    "result_url",
    "output_url",
    "video_url",
    "image_url",
    "file_url",
    "download_url",
  ];
  const nestedKeys = [
    "data",
    "result",
    "output",
    "response",
    "media",
    "assets",
    "files",
    "items",
    "urls",
  ];

  const walk = (value: unknown, depth: number): string | null => {
    if (depth > 6 || value === null || value === undefined) {
      return null;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      if (trimmed.startsWith("/") || /^https?:\/\//i.test(trimmed)) {
        return trimmed;
      }
      return null;
    }
    if (typeof value !== "object") {
      return null;
    }
    if (seen.has(value)) {
      return null;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = walk(item, depth + 1);
        if (nested) {
          return nested;
        }
      }
      return null;
    }

    const obj = value as Record<string, unknown>;
    for (const key of directUrlKeys) {
      const nested = walk(obj[key], depth + 1);
      if (nested) {
        return nested;
      }
    }
    for (const key of nestedKeys) {
      const nested = walk(obj[key], depth + 1);
      if (nested) {
        return nested;
      }
    }
    return null;
  };

  return walk(resultData, 0);
}

async function pollMediaTask(
  mediaTaskId: string,
  userToken: string,
  timeoutMs: number,
  options?: PollMediaTaskOptions,
): Promise<PollMediaTaskResult> {
  const start = Date.now();
  let deadline = start + timeoutMs;
  let remainingActiveGraceMs = Math.max(0, options?.activeGraceMs ?? 0);
  const initialActiveGraceMs = remainingActiveGraceMs;
  let lastStatusError: string | null = null;
  let lastObservedStatus: TaskStatus | null = null;
  while (true) {
    if (Date.now() > deadline) {
      if (
        remainingActiveGraceMs > 0
        && (lastObservedStatus === "pending" || lastObservedStatus === "processing")
      ) {
        const extensionMs = Math.min(remainingActiveGraceMs, 30000);
        remainingActiveGraceMs -= extensionMs;
        deadline += extensionMs;
      } else {
        break;
      }
    }

    let task;
    try {
      task = await withTimeout(
        mediaGenerationService.getTask(mediaTaskId, userToken),
        MEDIA_STATUS_FETCH_TIMEOUT_MS,
        "media_status_fetch_timeout",
      );
    } catch (err) {
      lastStatusError = sanitizeErrorMessage(err);
      await sleep(IMAGE_POLL_INTERVAL_MS);
      continue;
    }
    lastObservedStatus = task.status;

    if (task.status === "completed") {
      const resolvedUrl = task.resultUrl || extractMediaUrlFromResultData(task.resultData);
      if (resolvedUrl) {
        return { url: resolvedUrl, status: "completed" };
      }
      return {
        url: null,
        status: "completed",
        reason: task.errorMessage || "completed_without_output_url",
      };
    }
    if (task.status === "failed" || task.status === "cancelled") {
      return {
        url: null,
        status: task.status,
        reason: task.errorMessage || `task_${task.status}`,
      };
    }
    await sleep(IMAGE_POLL_INTERVAL_MS);
  }
  const elapsedMs = Date.now() - start;
  const usedGraceMs = Math.max(0, initialActiveGraceMs - remainingActiveGraceMs);
  return {
    url: null,
    status: "timeout",
    reason: lastStatusError
      ? `timeout_waiting_for_result status=${lastObservedStatus || "unknown"} elapsed_ms=${elapsedMs} grace_ms=${usedGraceMs} (${lastStatusError})`
      : `timeout_waiting_for_result status=${lastObservedStatus || "unknown"} elapsed_ms=${elapsedMs} grace_ms=${usedGraceMs}`,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
