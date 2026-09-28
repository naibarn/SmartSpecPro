export const SILENCE_CUT_MAP_VERSION = "silence.cut-map.v1" as const;
export const SILENCE_RANGE_MERGE_TOLERANCE_MS = 50;

export type SilenceCutRange = { startMs: number; endMs: number };
export type SilenceCutMap = {
  version: typeof SILENCE_CUT_MAP_VERSION;
  sourceDurationMs: number;
  ranges: SilenceCutRange[];
  editedDurationMs: number;
  sourceFingerprint: string;
  revisionId: string;
  audioStreamIndex: number | null;
  detectionFingerprint: string;
  fingerprint: string;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function normalizeSilenceRanges(
  ranges: ReadonlyArray<Partial<SilenceCutRange>>,
  sourceDurationMs: number,
): SilenceCutRange[] {
  const duration = Math.max(0, Math.round(sourceDurationMs));
  const sorted = ranges
    .filter(
      (range) => Number.isFinite(range.startMs) && Number.isFinite(range.endMs),
    )
    .map((range) => ({
      startMs: clamp(Math.round(range.startMs!), 0, duration),
      endMs: clamp(Math.round(range.endMs!), 0, duration),
    }))
    .filter((range) => range.endMs > range.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const merged: SilenceCutRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.startMs <= last.endMs + SILENCE_RANGE_MERGE_TOLERANCE_MS)
      last.endMs = Math.max(last.endMs, range.endMs);
    else merged.push({ ...range });
  }
  return merged;
}

export function buildSilenceCutMap(
  input: Omit<SilenceCutMap, "version" | "editedDurationMs" | "fingerprint">,
): SilenceCutMap {
  const ranges = normalizeSilenceRanges(input.ranges, input.sourceDurationMs);
  const removedMs = ranges.reduce(
    (sum, range) => sum + range.endMs - range.startMs,
    0,
  );
  const editedDurationMs = Math.max(
    0,
    Math.max(0, Math.round(input.sourceDurationMs)) - removedMs,
  );
  const fingerprint = JSON.stringify({
    version: SILENCE_CUT_MAP_VERSION,
    sourceDurationMs: Math.round(input.sourceDurationMs),
    ranges,
    sourceFingerprint: input.sourceFingerprint,
    revisionId: input.revisionId,
    audioStreamIndex: input.audioStreamIndex,
    detectionFingerprint: input.detectionFingerprint,
  });
  return {
    ...input,
    version: SILENCE_CUT_MAP_VERSION,
    ranges,
    editedDurationMs,
    fingerprint,
  };
}

export function sourceToEditedTime(
  map: Pick<SilenceCutMap, "ranges">,
  sourceMs: number,
): number | null {
  let removed = 0;
  const time = Math.max(0, Math.round(sourceMs));
  for (const range of map.ranges) {
    if (time < range.startMs) break;
    if (time < range.endMs) return null;
    removed += range.endMs - range.startMs;
  }
  return Math.max(0, time - removed);
}

export function editedToSourceTime(
  map: Pick<SilenceCutMap, "ranges">,
  editedMs: number,
): number {
  let removed = 0;
  const time = Math.max(0, Math.round(editedMs));
  for (const range of map.ranges) {
    const editedStart = range.startMs - removed;
    if (time < editedStart) return time + removed;
    removed += range.endMs - range.startMs;
  }
  return time + removed;
}

export function cutMapMatchesSource(
  map: Pick<
    SilenceCutMap,
    "sourceDurationMs" | "audioStreamIndex" | "sourceFingerprint" | "revisionId"
  >,
  input: Pick<
    SilenceCutMap,
    "sourceDurationMs" | "audioStreamIndex" | "sourceFingerprint" | "revisionId"
  >,
): boolean {
  return (
    Math.round(map.sourceDurationMs) === Math.round(input.sourceDurationMs) &&
    map.audioStreamIndex === input.audioStreamIndex &&
    map.sourceFingerprint === input.sourceFingerprint &&
    map.revisionId === input.revisionId
  );
}
