export const DEFAULT_MIN_SLIDE_DURATION_MS = 250;
export const DEFAULT_MAX_SLIDE_DURATION_MS = 120_000;

export interface FitProjectAudioSlideInput {
  slideId: number;
  currentDurationMs: number;
  hasVideo: boolean;
  videoDurationMs: number | null;
}

export interface FitSlidesToProjectAudioDurationInput {
  targetAudioDurationMs: number;
  slides: FitProjectAudioSlideInput[];
  minSlideDurationMs?: number;
  maxSlideDurationMs?: number;
}

export type FitSlidesToProjectAudioDurationFailureCode =
  | "no_slides"
  | "invalid_target_duration"
  | "video_duration_unknown"
  | "video_duration_exceeds_max"
  | "target_shorter_than_locked_slides"
  | "target_outside_adjustable_range"
  | "no_adjustable_slides";

export interface FitSlidesToProjectAudioDurationFailure {
  ok: false;
  code: FitSlidesToProjectAudioDurationFailureCode;
  slideIds?: number[];
  targetDurationMs?: number;
  lockedDurationMs?: number;
  minAdjustableDurationMs?: number;
  maxAdjustableDurationMs?: number;
}

export interface FitSlidesToProjectAudioDurationSuccess {
  ok: true;
  targetDurationMs: number;
  lockedVideoSlideIds: number[];
  durationBySlideId: Map<number, number>;
}

export type FitSlidesToProjectAudioDurationResult =
  | FitSlidesToProjectAudioDurationSuccess
  | FitSlidesToProjectAudioDurationFailure;

function sanitizePositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.round(value);
  if (rounded <= 0) {
    return fallback;
  }
  return rounded;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function allocateWeightedDurationsWithBounds(
  targetDurationMs: number,
  weights: number[],
  minDurationMs: number,
  maxDurationMs: number,
): number[] | null {
  if (weights.length === 0) {
    return targetDurationMs === 0 ? [] : null;
  }

  const minTotal = minDurationMs * weights.length;
  const maxTotal = maxDurationMs * weights.length;
  if (targetDurationMs < minTotal || targetDurationMs > maxTotal) {
    return null;
  }

  const safeWeights = weights.map((weight) => Math.max(1, sanitizePositiveInteger(weight, 1)));
  const cappedSum = (multiplier: number): number => safeWeights.reduce(
    (sum, weight) => sum + clamp(weight * multiplier, minDurationMs, maxDurationMs),
    0,
  );

  let low = 0;
  let high = 1;
  for (let i = 0; i < 80 && cappedSum(high) < targetDurationMs; i += 1) {
    high *= 2;
  }

  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    if (cappedSum(mid) >= targetDurationMs) {
      high = mid;
    } else {
      low = mid;
    }
  }

  const continuous = safeWeights.map((weight) => clamp(weight * high, minDurationMs, maxDurationMs));
  const integers = continuous.map((value) => Math.floor(value));
  let assigned = integers.reduce((sum, value) => sum + value, 0);
  let remainder = targetDurationMs - assigned;

  if (remainder > 0) {
    const order = integers
      .map((value, index) => ({
        index,
        fraction: continuous[index] - value,
        weight: safeWeights[index],
      }))
      .sort((a, b) => {
        if (b.fraction !== a.fraction) {
          return b.fraction - a.fraction;
        }
        if (b.weight !== a.weight) {
          return b.weight - a.weight;
        }
        return a.index - b.index;
      });

    for (const entry of order) {
      if (remainder <= 0) {
        break;
      }
      const capacity = maxDurationMs - integers[entry.index];
      if (capacity <= 0) {
        continue;
      }
      const delta = Math.min(capacity, remainder);
      integers[entry.index] += delta;
      remainder -= delta;
    }
  } else if (remainder < 0) {
    const order = integers
      .map((value, index) => ({
        index,
        fraction: continuous[index] - value,
        weight: safeWeights[index],
      }))
      .sort((a, b) => {
        if (a.fraction !== b.fraction) {
          return a.fraction - b.fraction;
        }
        if (a.weight !== b.weight) {
          return a.weight - b.weight;
        }
        return a.index - b.index;
      });

    for (const entry of order) {
      if (remainder >= 0) {
        break;
      }
      const capacity = integers[entry.index] - minDurationMs;
      if (capacity <= 0) {
        continue;
      }
      const delta = Math.min(capacity, Math.abs(remainder));
      integers[entry.index] -= delta;
      remainder += delta;
    }
  }

  assigned = integers.reduce((sum, value) => sum + value, 0);
  if (remainder !== 0 || assigned !== targetDurationMs) {
    return null;
  }

  return integers;
}

export function resolveProjectAudioPlayableDurationMs(
  projectAudioTrack: {
    startAtMs?: number;
    endAtMs?: number | null;
  } | null | undefined,
  sourceDurationMs: number | null,
): number | null {
  if (!projectAudioTrack) {
    return null;
  }
  const startAtMs = Math.max(0, sanitizePositiveInteger(projectAudioTrack.startAtMs ?? 0, 0));
  const explicitEndAtMs =
    projectAudioTrack.endAtMs != null && Number.isFinite(projectAudioTrack.endAtMs)
      ? Math.max(0, Math.round(projectAudioTrack.endAtMs))
      : null;

  if (explicitEndAtMs != null) {
    if (explicitEndAtMs <= startAtMs) {
      return null;
    }
    return explicitEndAtMs - startAtMs;
  }

  if (sourceDurationMs == null || !Number.isFinite(sourceDurationMs)) {
    return null;
  }
  const totalSourceDurationMs = Math.max(0, Math.round(sourceDurationMs));
  if (totalSourceDurationMs <= startAtMs) {
    return null;
  }
  return totalSourceDurationMs - startAtMs;
}

export function fitSlidesToProjectAudioDuration(
  input: FitSlidesToProjectAudioDurationInput,
): FitSlidesToProjectAudioDurationResult {
  const minSlideDurationMs = sanitizePositiveInteger(
    input.minSlideDurationMs ?? DEFAULT_MIN_SLIDE_DURATION_MS,
    DEFAULT_MIN_SLIDE_DURATION_MS,
  );
  const requestedMaxSlideDurationMs = sanitizePositiveInteger(
    input.maxSlideDurationMs ?? DEFAULT_MAX_SLIDE_DURATION_MS,
    DEFAULT_MAX_SLIDE_DURATION_MS,
  );
  const maxSlideDurationMs = Math.max(minSlideDurationMs, requestedMaxSlideDurationMs);

  if (!input.slides.length) {
    return {
      ok: false,
      code: "no_slides",
    };
  }

  const targetDurationMs = sanitizePositiveInteger(input.targetAudioDurationMs, -1);
  if (targetDurationMs <= 0) {
    return {
      ok: false,
      code: "invalid_target_duration",
    };
  }

  const unknownVideoSlides = input.slides
    .filter((slide) => slide.hasVideo && (slide.videoDurationMs == null || slide.videoDurationMs <= 0))
    .map((slide) => slide.slideId);
  if (unknownVideoSlides.length) {
    return {
      ok: false,
      code: "video_duration_unknown",
      slideIds: unknownVideoSlides,
    };
  }

  const durationBySlideId = new Map<number, number>();
  const adjustableSlides: Array<{ slideId: number; weight: number }> = [];
  const lockedVideoSlideIds: number[] = [];
  let lockedTotalDurationMs = 0;

  for (const slide of input.slides) {
    const currentDurationMs = clamp(
      sanitizePositiveInteger(slide.currentDurationMs, minSlideDurationMs),
      minSlideDurationMs,
      maxSlideDurationMs,
    );

    if (slide.hasVideo) {
      const videoDurationMs = Math.round(slide.videoDurationMs ?? 0);
      if (videoDurationMs > maxSlideDurationMs) {
        return {
          ok: false,
          code: "video_duration_exceeds_max",
          slideIds: [slide.slideId],
        };
      }
      const lockedDurationMs = Math.max(currentDurationMs, videoDurationMs);
      if (lockedDurationMs > maxSlideDurationMs) {
        return {
          ok: false,
          code: "video_duration_exceeds_max",
          slideIds: [slide.slideId],
        };
      }
      durationBySlideId.set(slide.slideId, lockedDurationMs);
      lockedVideoSlideIds.push(slide.slideId);
      lockedTotalDurationMs += lockedDurationMs;
      continue;
    }

    adjustableSlides.push({
      slideId: slide.slideId,
      weight: currentDurationMs,
    });
  }

  if (targetDurationMs < lockedTotalDurationMs) {
    return {
      ok: false,
      code: "target_shorter_than_locked_slides",
      targetDurationMs,
      lockedDurationMs: lockedTotalDurationMs,
    };
  }

  if (adjustableSlides.length === 0) {
    if (targetDurationMs !== lockedTotalDurationMs) {
      return {
        ok: false,
        code: "no_adjustable_slides",
        targetDurationMs,
        lockedDurationMs: lockedTotalDurationMs,
      };
    }
    return {
      ok: true,
      targetDurationMs,
      lockedVideoSlideIds,
      durationBySlideId,
    };
  }

  const targetAdjustableDurationMs = targetDurationMs - lockedTotalDurationMs;
  const minAdjustableDurationMs = adjustableSlides.length * minSlideDurationMs;
  const maxAdjustableDurationMs = adjustableSlides.length * maxSlideDurationMs;
  if (
    targetAdjustableDurationMs < minAdjustableDurationMs
    || targetAdjustableDurationMs > maxAdjustableDurationMs
  ) {
    return {
      ok: false,
      code: "target_outside_adjustable_range",
      targetDurationMs,
      lockedDurationMs: lockedTotalDurationMs,
      minAdjustableDurationMs,
      maxAdjustableDurationMs,
    };
  }

  const allocated = allocateWeightedDurationsWithBounds(
    targetAdjustableDurationMs,
    adjustableSlides.map((slide) => slide.weight),
    minSlideDurationMs,
    maxSlideDurationMs,
  );

  if (!allocated) {
    return {
      ok: false,
      code: "target_outside_adjustable_range",
      targetDurationMs,
      lockedDurationMs: lockedTotalDurationMs,
      minAdjustableDurationMs,
      maxAdjustableDurationMs,
    };
  }

  for (let index = 0; index < adjustableSlides.length; index += 1) {
    durationBySlideId.set(adjustableSlides[index].slideId, allocated[index]);
  }

  return {
    ok: true,
    targetDurationMs,
    lockedVideoSlideIds,
    durationBySlideId,
  };
}
