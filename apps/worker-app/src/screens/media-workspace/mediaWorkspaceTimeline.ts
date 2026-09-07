export interface SilenceRange {
  startMs: number;
  endMs?: number | null;
  isManual?: boolean;
}

export interface DeadAirRenderSelection {
  enabled: boolean;
  volumeThresholdPct: number;
  minDurationSec: number;
  softeningBufferSec: number;
  silenceSegments: SilenceRange[];
}

export function normalizeSilenceRanges(
  ranges: SilenceRange[],
  durationMs: number,
): Array<{ startMs: number; endMs: number }> {
  const boundedDuration = Math.max(0, Math.round(durationMs));
  const sorted = ranges
    .map((range) => ({
      startMs: Math.max(0, Math.min(boundedDuration, Math.round(range.startMs))),
      endMs: Math.max(0, Math.min(boundedDuration, Math.round(range.endMs ?? boundedDuration))),
    }))
    .filter((range) => range.endMs > range.startMs)
    .sort((left, right) => left.startMs - right.startMs);

  return sorted.reduce<Array<{ startMs: number; endMs: number }>>((merged, range) => {
    const previous = merged[merged.length - 1];
    if (previous && range.startMs <= previous.endMs + 50) {
      previous.endMs = Math.max(previous.endMs, range.endMs);
    } else {
      merged.push({ ...range });
    }
    return merged;
  }, []);
}

/** Jump a seek/playhead destination out of a dead-air range. */
export function getPlayableTimeMs(
  timeMs: number,
  ranges: SilenceRange[],
  durationMs: number,
): number {
  const boundedDuration = Math.max(0, Math.round(durationMs));
  let next = Math.max(0, Math.min(boundedDuration, Math.round(timeMs)));
  for (const range of normalizeSilenceRanges(ranges, boundedDuration)) {
    if (next < range.startMs) break;
    if (next < range.endMs) next = Math.min(boundedDuration, range.endMs + 1);
  }
  return next;
}

/** Advance a virtual/native playhead while skipping any crossed cut ranges. */
export function advancePlayableTimeMs(
  timeMs: number,
  deltaMs: number,
  ranges: SilenceRange[],
  durationMs: number,
): number {
  const boundedDuration = Math.max(0, Math.round(durationMs));
  let current = getPlayableTimeMs(timeMs, ranges, boundedDuration);
  let remaining = Math.max(0, Math.round(deltaMs));
  for (const range of normalizeSilenceRanges(ranges, boundedDuration)) {
    if (range.endMs <= current) continue;
    if (range.startMs > current && current + remaining < range.startMs) {
      return Math.min(boundedDuration, current + remaining);
    }
    if (range.startMs > current) {
      remaining -= range.startMs - current;
      current = range.startMs;
    }
    current = Math.min(boundedDuration, range.endMs + 1);
  }
  return Math.min(boundedDuration, current + remaining);
}

/** Keep the visual guide tied to the same profile value used by Rust. */
export function getNoiseThresholdDb(volumeThresholdPct: number): number {
  const pct = Math.max(0, Math.min(100, volumeThresholdPct));
  return -50 + (pct / 100) * 35;
}

/** Waveform is displayed bottom-up; the profile percentage is its guide level. */
export function getWaveformThresholdTopPercent(volumeThresholdPct: number): number {
  const pct = Math.max(5, Math.min(95, volumeThresholdPct));
  return 100 - pct;
}
