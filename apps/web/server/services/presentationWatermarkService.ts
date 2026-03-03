import crypto from "node:crypto";

import {
  presentationSlideContentSchema,
  type PresentationSlideContent,
  type PresentationSlideElement,
} from "@shared/presentation/contracts";
import type { AIWatermark } from "@shared/presentation/aiTypes";

const WATERMARK_ID_PREFIX = "watermark__";
const WATERMARK_ALT_PREFIX = "watermark:";
const DEFAULT_CANVAS_WIDTH = 1920;
const DEFAULT_CANVAS_HEIGHT = 1080;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeCanvasSize(content: PresentationSlideContent): { width: number; height: number } {
  const width = Number(content.canvas?.width);
  const height = Number(content.canvas?.height);
  return {
    width: Number.isFinite(width) && width > 0 ? width : DEFAULT_CANVAS_WIDTH,
    height: Number.isFinite(height) && height > 0 ? height : DEFAULT_CANVAS_HEIGHT,
  };
}

function isWatermarkElement(element: PresentationSlideElement): boolean {
  if (element.type !== "image") {
    return false;
  }
  const alt = String(element.alt || "").trim().toLowerCase();
  return element.id.startsWith(WATERMARK_ID_PREFIX) || alt.startsWith(WATERMARK_ALT_PREFIX);
}

function buildWatermarkElementId(sourceUrl: string): string {
  const digest = crypto.createHash("sha1").update(sourceUrl).digest("hex").slice(0, 12);
  return `${WATERMARK_ID_PREFIX}${digest}`;
}

function buildWatermarkElement(
  content: PresentationSlideContent,
  watermark: AIWatermark,
): PresentationSlideElement {
  const canvas = normalizeCanvasSize(content);
  const shortEdge = Math.min(canvas.width, canvas.height);
  const isPortrait = canvas.height > canvas.width;
  const margin = clamp(Math.round(shortEdge * 0.03), 12, 72);
  const widthFactor = isPortrait ? 0.28 : 0.2;
  const heightRatio = 0.36;
  const width = clamp(
    Math.round(canvas.width * widthFactor),
    Math.round(shortEdge * 0.16),
    Math.round(shortEdge * 0.46),
  );
  const height = clamp(
    Math.round(width * heightRatio),
    Math.round(shortEdge * 0.08),
    Math.round(shortEdge * 0.24),
  );
  const x = clamp(canvas.width - width - margin, 0, canvas.width);
  const y = clamp(canvas.height - height - margin, 0, canvas.height);

  return {
    id: buildWatermarkElementId(watermark.sourceUrl),
    type: "image",
    x,
    y,
    width,
    height,
    src: watermark.sourceUrl,
    alt: `${WATERMARK_ALT_PREFIX}${watermark.format}`,
    imageFit: "contain",
    imagePositionX: 50,
    imagePositionY: 50,
    imageZoom: 1,
    opacity: clamp(watermark.clarityPercent / 100, 0, 1),
    rotation: 0,
  };
}

export interface ApplyWatermarkResult {
  slideContent: PresentationSlideContent;
  warnings: string[];
  removedCount: number;
  applied: boolean;
}

export function extractWatermarkFromSlideContent(
  content: PresentationSlideContent,
): AIWatermark | null {
  const watermarkElement = content.elements.find(isWatermarkElement);
  if (!watermarkElement || watermarkElement.type !== "image") {
    return null;
  }
  const alt = String(watermarkElement.alt || "").trim().toLowerCase();
  const format = alt.endsWith("png") ? "png" : "jpg";
  const rawClarityPercent = clamp(Math.round((watermarkElement.opacity ?? 0.2) * 100), 5, 100);
  const clarityPercent = clamp(Math.round(rawClarityPercent / 5) * 5, 5, 100);
  return {
    sourceUrl: watermarkElement.src,
    format,
    clarityPercent,
  };
}

export function applyWatermarkToSlideContent(
  content: PresentationSlideContent,
  watermark: AIWatermark,
): ApplyWatermarkResult {
  const warnings: string[] = [];
  const preservedElements = content.elements.filter((element) => !isWatermarkElement(element));
  const removedCount = content.elements.length - preservedElements.length;
  const watermarkElement = buildWatermarkElement(content, watermark);
  const next: PresentationSlideContent = {
    ...content,
    elements: [...preservedElements, watermarkElement],
  };

  const parsed = presentationSlideContentSchema.safeParse(next);
  if (!parsed.success) {
    warnings.push("Watermark could not be applied due to slide content validation failure.");
    return {
      slideContent: content,
      warnings,
      removedCount,
      applied: false,
    };
  }

  return {
    slideContent: parsed.data,
    warnings,
    removedCount,
    applied: true,
  };
}
