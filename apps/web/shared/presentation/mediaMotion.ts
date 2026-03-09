import type {
  PresentationMediaMotion,
  PresentationMediaMotionEasing,
  PresentationMediaMotionPreset,
  PresentationMediaMotionSegment,
  PresentationMediaMotionTimingMode,
} from "./contracts";

export const DEFAULT_MEDIA_MOTION_INTENSITY = 0.6;
export const DEFAULT_MEDIA_MOTION_EASING = "ease-in-out" as const;
export const DEFAULT_MEDIA_MOTION_TIMING_MODE = "duration" as const;
export const DEFAULT_MEDIA_MOTION_DURATION_MS = 3000;
export const MAX_MEDIA_MOTION_ANIMATION_WINDOW_MS = 3000;
export const MAX_MEDIA_MOTION_PAN_TRAVEL_PERCENT = 12;
export const MAX_MEDIA_MOTION_ZOOM_DELTA = 0.18;
export const MAX_MEDIA_MOTION_PAN_OVERSCAN_DELTA = 0.12;
export const PRESENTATION_MEDIA_MOTION_EASING_VALUES = [
  "linear",
  "ease-in-out",
] as const;
export const PRESENTATION_MEDIA_MOTION_TIMING_MODE_VALUES = [
  "duration",
  "until-slide-end",
] as const;

interface MediaMotionVectorDefinition {
  x: number;
  y: number;
}

type MediaMotionPhase = "intro" | "outro";

export interface NormalizedPresentationMediaMotionSegment {
  preset: PresentationMediaMotionPreset;
  intensity: number;
  easing: PresentationMediaMotionEasing;
  timingMode: PresentationMediaMotionTimingMode;
  durationMs: number;
}

export interface NormalizedPresentationMediaMotion {
  intro: NormalizedPresentationMediaMotionSegment;
  outro: NormalizedPresentationMediaMotionSegment;
}

export const PRESENTATION_MEDIA_MOTION_PRESET_LABELS: Record<PresentationMediaMotionPreset, string> = {
  none: "None",
  "zoom-in": "Zoom In",
  "zoom-out": "Zoom Out",
  "pan-left": "Pan Left",
  "pan-right": "Pan Right",
  "pan-up": "Pan Up",
  "pan-down": "Pan Down",
  "pan-up-left": "Pan Up Left",
  "pan-up-right": "Pan Up Right",
  "pan-down-left": "Pan Down Left",
  "pan-down-right": "Pan Down Right",
};

export const PRESENTATION_MEDIA_MOTION_PAN_VECTORS: Partial<Record<PresentationMediaMotionPreset, MediaMotionVectorDefinition>> = {
  "pan-left": { x: -1, y: 0 },
  "pan-right": { x: 1, y: 0 },
  "pan-up": { x: 0, y: -1 },
  "pan-down": { x: 0, y: 1 },
  "pan-up-left": { x: -1, y: -1 },
  "pan-up-right": { x: 1, y: -1 },
  "pan-down-left": { x: -1, y: 1 },
  "pan-down-right": { x: 1, y: 1 },
};

export const PRESENTATION_MEDIA_MOTION_PRESET_OPTIONS = (
  Object.entries(PRESENTATION_MEDIA_MOTION_PRESET_LABELS) as Array<[PresentationMediaMotionPreset, string]>
).map(([value, label]) => ({ value, label }));
export const PRESENTATION_MEDIA_MOTION_PRESET_VALUES = PRESENTATION_MEDIA_MOTION_PRESET_OPTIONS.map(({ value }) => value);

const PRESENTATION_MEDIA_MOTION_PRESET_SET = new Set<PresentationMediaMotionPreset>(
  PRESENTATION_MEDIA_MOTION_PRESET_VALUES,
);
const PRESENTATION_MEDIA_MOTION_EASING_SET = new Set<PresentationMediaMotionEasing>(
  PRESENTATION_MEDIA_MOTION_EASING_VALUES,
);
const PRESENTATION_MEDIA_MOTION_TIMING_MODE_SET = new Set<PresentationMediaMotionTimingMode>(
  PRESENTATION_MEDIA_MOTION_TIMING_MODE_VALUES,
);

export const PRESENTATION_MEDIA_MOTION_RUNTIME_CONFIG = {
  defaultIntensity: DEFAULT_MEDIA_MOTION_INTENSITY,
  defaultEasing: DEFAULT_MEDIA_MOTION_EASING,
  defaultTimingMode: DEFAULT_MEDIA_MOTION_TIMING_MODE,
  defaultDurationMs: DEFAULT_MEDIA_MOTION_DURATION_MS,
  maxAnimationWindowMs: MAX_MEDIA_MOTION_ANIMATION_WINDOW_MS,
  maxPanTravelPercent: MAX_MEDIA_MOTION_PAN_TRAVEL_PERCENT,
  maxZoomDelta: MAX_MEDIA_MOTION_ZOOM_DELTA,
  maxPanOverscanDelta: MAX_MEDIA_MOTION_PAN_OVERSCAN_DELTA,
  validPresets: PRESENTATION_MEDIA_MOTION_PRESET_VALUES,
  validEasings: PRESENTATION_MEDIA_MOTION_EASING_VALUES,
  validTimingModes: PRESENTATION_MEDIA_MOTION_TIMING_MODE_VALUES,
  panVectors: PRESENTATION_MEDIA_MOTION_PAN_VECTORS,
} as const;

export interface PresentationMediaMotionFrame {
  scaleMultiplier: number;
  translateXPercent: number;
  translateYPercent: number;
  progress: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeIntensity(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MEDIA_MOTION_INTENSITY;
  }
  return clamp(parsed, 0, 1);
}

function normalizeDurationMs(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MEDIA_MOTION_DURATION_MS;
  }
  return Math.round(clamp(parsed, 250, 120_000));
}

function normalizePreset(value: unknown): PresentationMediaMotionPreset {
  if (typeof value === "string" && PRESENTATION_MEDIA_MOTION_PRESET_SET.has(value as PresentationMediaMotionPreset)) {
    return value as PresentationMediaMotionPreset;
  }
  return "none";
}

function normalizeEasing(value: unknown): PresentationMediaMotionEasing {
  if (typeof value === "string" && PRESENTATION_MEDIA_MOTION_EASING_SET.has(value as PresentationMediaMotionEasing)) {
    return value as PresentationMediaMotionEasing;
  }
  return DEFAULT_MEDIA_MOTION_EASING;
}

function normalizeTimingMode(value: unknown): PresentationMediaMotionTimingMode {
  if (typeof value === "string" && PRESENTATION_MEDIA_MOTION_TIMING_MODE_SET.has(value as PresentationMediaMotionTimingMode)) {
    return value as PresentationMediaMotionTimingMode;
  }
  return DEFAULT_MEDIA_MOTION_TIMING_MODE;
}

function resolvePanMotionVector(
  preset: PresentationMediaMotionPreset,
): MediaMotionVectorDefinition | null {
  return PRESENTATION_MEDIA_MOTION_PAN_VECTORS[preset] ?? null;
}

function emptyMediaMotionSegment(): NormalizedPresentationMediaMotionSegment {
  return {
    preset: "none",
    intensity: DEFAULT_MEDIA_MOTION_INTENSITY,
    easing: DEFAULT_MEDIA_MOTION_EASING,
    timingMode: DEFAULT_MEDIA_MOTION_TIMING_MODE,
    durationMs: DEFAULT_MEDIA_MOTION_DURATION_MS,
  };
}

export function normalizeMediaMotionSegment(
  motion: {
    preset?: unknown;
    intensity?: unknown;
    easing?: unknown;
    timingMode?: unknown;
    durationMs?: unknown;
  } | null | undefined,
): NormalizedPresentationMediaMotionSegment {
  return {
    preset: normalizePreset(motion?.preset),
    intensity: normalizeIntensity(motion?.intensity),
    easing: normalizeEasing(motion?.easing),
    timingMode: normalizeTimingMode(motion?.timingMode),
    durationMs: normalizeDurationMs(motion?.durationMs),
  };
}

export function normalizeMediaMotion(
  motion: PresentationMediaMotion | null | undefined,
): NormalizedPresentationMediaMotion {
  const source = motion && typeof motion === "object"
    ? motion as PresentationMediaMotion
    : undefined;
  const hasSegmentShape = Boolean(source && ("intro" in source || "outro" in source));

  return {
    intro: hasSegmentShape
      ? normalizeMediaMotionSegment(source?.intro)
      : normalizeMediaMotionSegment(source),
    outro: hasSegmentShape
      ? normalizeMediaMotionSegment(source?.outro)
      : emptyMediaMotionSegment(),
  };
}

export function serializeMediaMotion(
  motion: NormalizedPresentationMediaMotion,
): PresentationMediaMotion | undefined {
  const introActive = motion.intro.preset !== "none";
  const outroActive = motion.outro.preset !== "none";

  if (!introActive && !outroActive) {
    return undefined;
  }

  return {
    ...(introActive ? {
      intro: {
        preset: motion.intro.preset,
        intensity: motion.intro.intensity,
        easing: motion.intro.easing,
        timingMode: motion.intro.timingMode,
        durationMs: motion.intro.durationMs,
      },
    } : {}),
    ...(outroActive ? {
      outro: {
        preset: motion.outro.preset,
        intensity: motion.outro.intensity,
        easing: motion.outro.easing,
        timingMode: motion.outro.timingMode,
        durationMs: motion.outro.durationMs,
      },
    } : {}),
  };
}

export function hasActiveMediaMotion(
  motion: PresentationMediaMotion | null | undefined,
): boolean {
  const normalized = normalizeMediaMotion(motion);
  return normalized.intro.preset !== "none" || normalized.outro.preset !== "none";
}

export function applyMediaMotionEasing(
  motion: PresentationMediaMotionSegment | null | undefined,
  progress: number,
): number {
  const normalized = normalizeMediaMotionSegment(motion);
  const clampedProgress = clamp(progress, 0, 1);
  if (normalized.easing === "linear") {
    return clampedProgress;
  }
  return 0.5 - (Math.cos(Math.PI * clampedProgress) / 2);
}

export function computeMediaMotionPlaybackProgress(
  elapsedMs: number,
  slideDurationMs: number,
): number {
  const clampedElapsedMs = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const normalizedSlideDurationMs = clamp(
    Number.isFinite(slideDurationMs) ? slideDurationMs : MAX_MEDIA_MOTION_ANIMATION_WINDOW_MS,
    250,
    120_000,
  );
  const effectiveDurationMs = Math.max(
    1,
    Math.min(normalizedSlideDurationMs, MAX_MEDIA_MOTION_ANIMATION_WINDOW_MS),
  );
  return clamp(clampedElapsedMs / effectiveDurationMs, 0, 1);
}

function computeMediaMotionPhaseProgress(
  segment: NormalizedPresentationMediaMotionSegment,
  phase: MediaMotionPhase,
  elapsedMs: number,
  slideDurationMs: number,
): number {
  const clampedElapsedMs = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const safeSlideDurationMs = clamp(
    Number.isFinite(slideDurationMs) ? slideDurationMs : DEFAULT_MEDIA_MOTION_DURATION_MS,
    250,
    120_000,
  );

  if (segment.timingMode === "until-slide-end") {
    return clamp(clampedElapsedMs / safeSlideDurationMs, 0, 1);
  }

  const effectiveDurationMs = Math.max(250, Math.min(segment.durationMs, safeSlideDurationMs));
  if (phase === "intro") {
    return clamp(clampedElapsedMs / effectiveDurationMs, 0, 1);
  }

  const startMs = Math.max(0, safeSlideDurationMs - effectiveDurationMs);
  return clamp((clampedElapsedMs - startMs) / effectiveDurationMs, 0, 1);
}

export function computeMediaMotionFrame(
  motion: PresentationMediaMotionSegment | null | undefined,
  progress: number,
): PresentationMediaMotionFrame {
  const normalized = normalizeMediaMotionSegment(motion);
  const easedProgress = applyMediaMotionEasing(normalized, progress);
  const panTravelPercent = MAX_MEDIA_MOTION_PAN_TRAVEL_PERCENT * normalized.intensity;
  const zoomDelta = MAX_MEDIA_MOTION_ZOOM_DELTA * normalized.intensity;
  const panVector = resolvePanMotionVector(normalized.preset);

  if (panVector) {
    const vectorMagnitude = Math.min(Math.hypot(panVector.x, panVector.y), Math.SQRT2);
    const overscanDelta = MAX_MEDIA_MOTION_PAN_OVERSCAN_DELTA * normalized.intensity * vectorMagnitude;
    return {
      scaleMultiplier: 1 + overscanDelta,
      translateXPercent: panVector.x * panTravelPercent * easedProgress,
      translateYPercent: panVector.y * panTravelPercent * easedProgress,
      progress: easedProgress,
    };
  }

  switch (normalized.preset) {
    case "zoom-in":
      return {
        scaleMultiplier: 1 + (zoomDelta * easedProgress),
        translateXPercent: 0,
        translateYPercent: 0,
        progress: easedProgress,
      };
    case "zoom-out":
      return {
        scaleMultiplier: 1 + (zoomDelta * (1 - easedProgress)),
        translateXPercent: 0,
        translateYPercent: 0,
        progress: easedProgress,
      };
    case "none":
    default:
      return {
        scaleMultiplier: 1,
        translateXPercent: 0,
        translateYPercent: 0,
        progress: easedProgress,
      };
  }
}

export function computeMediaMotionTimelineFrame(
  motion: PresentationMediaMotion | null | undefined,
  elapsedMs: number,
  slideDurationMs: number,
): PresentationMediaMotionFrame {
  const normalized = normalizeMediaMotion(motion);
  const introFrame = computeMediaMotionFrame(
    normalized.intro,
    computeMediaMotionPhaseProgress(normalized.intro, "intro", elapsedMs, slideDurationMs),
  );
  const outroFrame = computeMediaMotionFrame(
    normalized.outro,
    computeMediaMotionPhaseProgress(normalized.outro, "outro", elapsedMs, slideDurationMs),
  );

  return {
    scaleMultiplier: introFrame.scaleMultiplier * outroFrame.scaleMultiplier,
    translateXPercent: introFrame.translateXPercent + outroFrame.translateXPercent,
    translateYPercent: introFrame.translateYPercent + outroFrame.translateYPercent,
    progress: Math.max(introFrame.progress, outroFrame.progress),
  };
}
