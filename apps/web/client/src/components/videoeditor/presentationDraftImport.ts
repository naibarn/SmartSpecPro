import type {
  PresentationPlayDeckPayload,
  PresentationSlideContent,
  PresentationSlideElement,
  ResolvedAudioTrack,
} from "@shared/presentation/contracts";

const DEFAULT_SEGMENT_DURATION_SECONDS = 3;

export interface PresentationDraftImportSlide {
  id: number;
  orderIndex: number;
  title: string;
  slideContent: PresentationSlideContent;
}

export interface PresentationDraftImportVisual {
  type: "image" | "video";
  src: string;
  title: string;
  prompt?: string;
  modelId?: string;
  referenceUrls?: string[];
}

export interface PresentationDraftImportSegment {
  slideId: number;
  orderIndex: number;
  title: string;
  startTime: number;
  duration: number;
  hasExplicitDuration: boolean;
  visual: PresentationDraftImportVisual | null;
  audio: ResolvedAudioTrack | null;
}

function isVisualElement(
  element: PresentationSlideElement,
): element is Extract<PresentationSlideElement, { type: "image" | "video" }> {
  return element.type === "image" || element.type === "video";
}

function hasUsableSource(src: string | undefined): boolean {
  const normalized = String(src || "").trim();
  return normalized.startsWith("/") || /^https?:\/\//i.test(normalized);
}

export function findPrimaryVisualElement(
  slideContent: PresentationSlideContent,
): Extract<PresentationSlideElement, { type: "image" | "video" }> | null {
  const elements = slideContent.elements.filter(isVisualElement);
  const videoElement = elements.find(
    (element) => element.type === "video" && hasUsableSource(element.src),
  );
  if (videoElement) {
    return videoElement;
  }

  const imageElement = elements.find(
    (element) => element.type === "image" && hasUsableSource(element.src),
  );
  if (imageElement) {
    return imageElement;
  }

  return null;
}

export function resolvePresentationSegmentDurationSeconds(
  slideContent: PresentationSlideContent,
  playDeckSlide?: { durationMs?: number | null } | null,
): number {
  const fromContent = Number(slideContent.durationMs);
  if (Number.isFinite(fromContent) && fromContent > 0) {
    return Math.max(0.25, fromContent / 1000);
  }

  const fromPlayDeck = Number(playDeckSlide?.durationMs);
  if (Number.isFinite(fromPlayDeck) && fromPlayDeck > 0) {
    return DEFAULT_SEGMENT_DURATION_SECONDS;
  }

  return DEFAULT_SEGMENT_DURATION_SECONDS;
}

export function buildPresentationDraftImportSegments(args: {
  slides: PresentationDraftImportSlide[];
  playDeck: PresentationPlayDeckPayload;
  startTime?: number;
}): PresentationDraftImportSegment[] {
  const slideMap = new Map(args.slides.map((slide) => [slide.id, slide]));
  const orderedPlaySlides = [...args.playDeck.slides].sort(
    (left, right) => left.orderIndex - right.orderIndex,
  );

  const segments: PresentationDraftImportSegment[] = [];
  let cursor = Math.max(0, args.startTime ?? 0);

  for (const playSlide of orderedPlaySlides) {
    const slide = slideMap.get(playSlide.slideId);
    if (!slide) {
      continue;
    }

    const visualElement = findPrimaryVisualElement(slide.slideContent);
    const visual = visualElement
      ? visualElement.type === "video"
        ? {
            type: "video" as const,
            src: visualElement.src,
            title: visualElement.title || slide.title,
            prompt: visualElement.videoPrompt,
            modelId: visualElement.videoModelId,
            referenceUrls: visualElement.videoReferenceUrls,
          }
        : {
            type: "image" as const,
            src: visualElement.src,
            title: slide.title,
            prompt: visualElement.imagePrompt,
            modelId: visualElement.imageModelId,
            referenceUrls: visualElement.imageReferenceUrls,
          }
      : null;
    const audio = playSlide.audioTrack ?? null;

    if (!visual && !audio) {
      continue;
    }

    const duration = resolvePresentationSegmentDurationSeconds(slide.slideContent, playSlide);
    segments.push({
      slideId: slide.id,
      orderIndex: slide.orderIndex,
      title: slide.title,
      startTime: cursor,
      duration,
      hasExplicitDuration: Number.isFinite(Number(slide.slideContent.durationMs))
        && Number(slide.slideContent.durationMs) > 0,
      visual,
      audio,
    });
    cursor += duration;
  }

  return segments;
}
