import type { PresentationSlide } from "../../drizzle/schema";
import type {
  PresentationExportWarning,
  PresentationTransition,
} from "@shared/presentation/contracts";
import { categorizePresentationExportWarningCode } from "@shared/presentation/exportWarnings";

const ALLOWED_ELEMENT_TYPES = new Set(["text", "image", "video", "rect", "line"]);
const WARNING_PRECEDENCE: Record<string, number> = {
  SLIDE_TRANSITION_UNSUPPORTED: 1,
  SLIDE_DURATION_INVALID: 2,
  SLIDE_ELEMENT_UNSUPPORTED: 3,
  SLIDE_IMAGE_SOURCE_MISSING: 4,
  W_SVG_LOAD_FAILED: 5,
  W_SVG_PARSE_FAILED: 6,
  W_SVG_RASTERIZED: 7,
  W_SVG_PLACEHOLDER: 8,
  W_SLIDE_READY_TIMEOUT: 9,
};

export interface DegradedSlideshowSlide {
  slideId: number;
  orderIndex: number;
  title: string;
  durationMs: number;
  transition: PresentationTransition;
}

export interface DegradedSlideshowResult {
  slides: DegradedSlideshowSlide[];
  warnings: PresentationExportWarning[];
}

function pushWarning(
  warnings: PresentationExportWarning[],
  code: string,
  slideId: number,
  detail?: string,
): void {
  warnings.push({
    code,
    slideId,
    ...(detail ? { detail } : {}),
    category: categorizePresentationExportWarningCode(code),
  });
}

function normalizeTransition(
  raw: unknown,
  warnings: PresentationExportWarning[],
  slideId: number,
): PresentationTransition {
  if (raw === undefined || raw === null || raw === "") {
    return "cut";
  }
  if (raw === "cut" || raw === "fade") {
    return raw;
  }

  pushWarning(warnings, "SLIDE_TRANSITION_UNSUPPORTED", slideId, `transition=${String(raw)}`);
  return "cut";
}

function normalizeDurationMs(
  raw: unknown,
  fallback: number,
  warnings: PresentationExportWarning[],
  slideId: number,
): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 250 && raw <= 120_000) {
    return Math.round(raw);
  }

  if (raw !== undefined) {
    pushWarning(warnings, "SLIDE_DURATION_INVALID", slideId, `durationMs=${String(raw)}`);
  }
  return fallback;
}

function collectElementWarnings(
  rawElements: unknown,
  warnings: PresentationExportWarning[],
  slideId: number,
): void {
  if (!Array.isArray(rawElements)) {
    return;
  }

  let hasUnsupportedElement = false;
  let hasMissingImageSource = false;
  let hasSvgLoadFailed = false;
  let hasSvgParseFailed = false;
  let hasSvgRasterized = false;
  let hasSvgPlaceholder = false;

  const isLikelySvgMarkup = (value: string): boolean => {
    const normalized = value.trim().toLowerCase();
    return normalized.includes("<svg") && normalized.includes("</svg>");
  };

  const isSvgSource = (value: string): boolean => {
    const normalized = value.trim().toLowerCase();
    return (
      normalized.endsWith(".svg")
      || normalized.includes(".svg?")
      || normalized.startsWith("data:image/svg+xml")
    );
  };

  for (const element of rawElements) {
    if (!element || typeof element !== "object") {
      hasUnsupportedElement = true;
      continue;
    }

    const type = String((element as any).type || "");
    if (!ALLOWED_ELEMENT_TYPES.has(type)) {
      hasUnsupportedElement = true;
      continue;
    }

    if (type === "image") {
      const svgContent = String((element as any).svgContent || "").trim();
      if (svgContent) {
        if (!isLikelySvgMarkup(svgContent)) {
          hasSvgParseFailed = true;
          hasSvgPlaceholder = true;
        }
        continue;
      }
      const src = String((element as any).src || "").trim();
      if (!src) {
        hasMissingImageSource = true;
        if (String((element as any).imageFormat || "").toLowerCase() === "svg") {
          hasSvgLoadFailed = true;
          hasSvgPlaceholder = true;
        }
        continue;
      }
      if (isSvgSource(src)) {
        hasSvgRasterized = true;
      }
    }
  }

  if (hasUnsupportedElement) {
    pushWarning(warnings, "SLIDE_ELEMENT_UNSUPPORTED", slideId);
  }
  if (hasMissingImageSource) {
    pushWarning(warnings, "SLIDE_IMAGE_SOURCE_MISSING", slideId);
  }
  if (hasSvgLoadFailed) {
    pushWarning(warnings, "W_SVG_LOAD_FAILED", slideId);
  }
  if (hasSvgParseFailed) {
    pushWarning(warnings, "W_SVG_PARSE_FAILED", slideId);
  }
  if (hasSvgRasterized) {
    pushWarning(warnings, "W_SVG_RASTERIZED", slideId);
  }
  if (hasSvgPlaceholder) {
    pushWarning(warnings, "W_SVG_PLACEHOLDER", slideId);
  }
}

export function degradeSlidesForExport(
  slides: PresentationSlide[],
  defaultDurationMs: number,
): DegradedSlideshowResult {
  const sorted = [...slides].sort((a, b) => {
    if (a.orderIndex === b.orderIndex) {
      return a.id - b.id;
    }
    return a.orderIndex - b.orderIndex;
  });

  const warnings: PresentationExportWarning[] = [];
  const degraded = sorted.map((slide) => {
    const content =
      slide.slideContent && typeof slide.slideContent === "object" && !Array.isArray(slide.slideContent)
        ? (slide.slideContent as Record<string, unknown>)
        : {};
    const transition = normalizeTransition(content.transition, warnings, slide.id);
    const durationMs = normalizeDurationMs(content.durationMs, defaultDurationMs, warnings, slide.id);
    collectElementWarnings(content.elements, warnings, slide.id);

    return {
      slideId: slide.id,
      orderIndex: slide.orderIndex,
      title: slide.title || `Slide ${slide.orderIndex + 1}`,
      durationMs,
      transition,
    };
  });

  const sortedWarnings = [...warnings].sort((left, right) => {
    if (left.slideId !== right.slideId) {
      return left.slideId - right.slideId;
    }
    return (WARNING_PRECEDENCE[left.code] ?? 999) - (WARNING_PRECEDENCE[right.code] ?? 999);
  });

  return {
    slides: degraded,
    warnings: sortedWarnings,
  };
}
