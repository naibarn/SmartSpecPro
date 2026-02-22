import type { PresentationSlide } from "../../drizzle/schema";
import type {
  PresentationExportWarning,
  PresentationTransition,
} from "@shared/presentation/contracts";

const ALLOWED_ELEMENT_TYPES = new Set(["text", "image", "rect", "line"]);
const WARNING_PRECEDENCE: Record<PresentationExportWarning["code"], number> = {
  SLIDE_TRANSITION_UNSUPPORTED: 1,
  SLIDE_DURATION_INVALID: 2,
  SLIDE_ELEMENT_UNSUPPORTED: 3,
  SLIDE_IMAGE_SOURCE_MISSING: 4,
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

  warnings.push({
    code: "SLIDE_TRANSITION_UNSUPPORTED",
    slideId,
    detail: `transition=${String(raw)}`,
  });
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
    warnings.push({
      code: "SLIDE_DURATION_INVALID",
      slideId,
      detail: `durationMs=${String(raw)}`,
    });
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
      const src = String((element as any).src || "").trim();
      if (!src) {
        hasMissingImageSource = true;
      }
    }
  }

  if (hasUnsupportedElement) {
    warnings.push({
      code: "SLIDE_ELEMENT_UNSUPPORTED",
      slideId,
    });
  }
  if (hasMissingImageSource) {
    warnings.push({
      code: "SLIDE_IMAGE_SOURCE_MISSING",
      slideId,
    });
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
    return WARNING_PRECEDENCE[left.code] - WARNING_PRECEDENCE[right.code];
  });

  return {
    slides: degraded,
    warnings: sortedWarnings,
  };
}
