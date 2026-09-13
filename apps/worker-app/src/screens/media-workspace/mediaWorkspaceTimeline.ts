import type { NleClip, NleTrack, ProjectAsset } from "../../types/nleProject";
import type { CameraMotionPlan } from "@smartspec/shared";

export interface SilenceRange {
  startMs: number;
  endMs?: number | null;
  isManual?: boolean;
}

export interface AudioTrackInfo {
  streamIndex: number;
  audioOrdinal: number;
  title?: string;
  language?: string;
  codec?: string;
  channels?: number;
  channelLayout?: string;
  isDefault: boolean;
}

export interface TimelineVideoSource {
  trackId: string;
  trackName: string;
  clipId: string;
  name: string;
  path: string;
}

export interface WaveformBin {
  min: number;
  max: number;
  rms: number;
  peak: number;
}

export interface DisplayWaveformBin extends WaveformBin {
  isSilence: boolean;
}

const VIDEO_TRACK_TYPES = new Set(["video_main", "video_broll"]);
const AUDIO_TRACK_TYPES = new Set(["audio_voice", "audio_music", "audio_sfx"]);

export function canPlaceMediaOnTrack(
  track: Pick<NleTrack, "type" | "locked">,
  mediaType: ProjectAsset["mediaType"] | string,
): boolean {
  if (track.locked) return false;
  if (mediaType === "audio") return AUDIO_TRACK_TYPES.has(track.type);
  if (mediaType === "image") return track.type === "video_broll";
  return VIDEO_TRACK_TYPES.has(track.type);
}

export function canMoveTimelineClip(
  sourceTrack: Pick<NleTrack, "type" | "locked">,
  targetTrack: Pick<NleTrack, "type" | "locked">,
): boolean {
  if (sourceTrack.locked || targetTrack.locked) return false;
  if (sourceTrack.type === targetTrack.type) return true;
  if (VIDEO_TRACK_TYPES.has(sourceTrack.type) && VIDEO_TRACK_TYPES.has(targetTrack.type)) return true;
  if (AUDIO_TRACK_TYPES.has(sourceTrack.type) && AUDIO_TRACK_TYPES.has(targetTrack.type)) return true;
  return false;
}

export function chooseAssetTargetTrack(
  tracks: Array<Pick<NleTrack, "id" | "type" | "locked" | "clips">>,
  mediaType: ProjectAsset["mediaType"] | string,
  selectedTrackId?: string | null,
): string | null {
  const compatible = tracks.filter((track) => canPlaceMediaOnTrack(track, mediaType));
  const selected = compatible.find((track) => track.id === selectedTrackId);
  if (selected) return selected.id;

  const preferredIds = mediaType === "audio"
    ? ["track_a1", "track_a2", "track_a3"]
    : mediaType === "image"
      ? ["track_v2", "track_v1"]
      : ["track_v1", "track_v2"];
  const ordered = [
    ...preferredIds.map((id) => compatible.find((track) => track.id === id)).filter(Boolean),
    ...compatible.filter((track) => !preferredIds.includes(track.id)),
  ] as Array<Pick<NleTrack, "id" | "type" | "locked" | "clips">>;
  return ordered.find((track) => track.clips.length === 0)?.id ?? ordered[0]?.id ?? null;
}

export function moveTimelineClip(
  tracks: NleTrack[],
  sourceTrackId: string,
  clipId: string,
  targetTrackId: string,
  timelineStartMs: number,
): NleTrack[] {
  const sourceTrack = tracks.find((track) => track.id === sourceTrackId);
  const targetTrack = tracks.find((track) => track.id === targetTrackId);
  const clip = sourceTrack?.clips.find((candidate) => candidate.id === clipId);
  if (!sourceTrack || !targetTrack || !clip || !canMoveTimelineClip(sourceTrack, targetTrack)) return tracks;

  const nextStartMs = Math.max(0, Math.round(timelineStartMs));
  if (sourceTrackId === targetTrackId) {
    return tracks.map((track) => track.id === sourceTrackId
      ? { ...track, clips: track.clips.map((candidate) => candidate.id === clipId ? { ...candidate, timelineStartMs: nextStartMs } : candidate) }
      : track);
  }

  return tracks.map((track) => {
    if (track.id === sourceTrackId) {
      return { ...track, clips: track.clips.filter((candidate) => candidate.id !== clipId) };
    }
    if (track.id === targetTrackId) {
      return { ...track, clips: [...track.clips, { ...clip, timelineStartMs: nextStartMs }] };
    }
    return track;
  });
}

/**
 * Returns video files that are actually present on the NLE timeline.
 * V1 is the default source, with V2 as the fallback for projects that only
 * contain a B-roll/overlay clip.
 */
export function getTimelineVideoSources(
  project: {
    tracks?: Array<{
      id: string;
      name: string;
      type?: string;
      clips?: Array<{
        id: string;
        name?: string;
        sourcePath?: string;
        sourceUrl?: string;
      }>;
    }>;
  } | null | undefined,
): TimelineVideoSource[] {
  if (!project?.tracks) return [];

  const priority = (trackId: string) => (
    trackId === "track_v1" ? 0 : trackId === "track_v2" ? 1 : 2
  );

  return project.tracks
    .filter((track) => track.id === "track_v1" || track.id === "track_v2" || track.type === "video_main" || track.type === "video_broll")
    .flatMap((track) => {
      const clip = track.clips?.find((candidate) => Boolean(candidate.sourcePath || candidate.sourceUrl));
      if (!clip) return [];
      const path = (clip.sourcePath || clip.sourceUrl || "").trim();
      if (!path) return [];
      return [{
        trackId: track.id,
        trackName: track.name,
        clipId: clip.id,
        name: clip.name?.trim() || path.split(/[\\/]/).pop() || track.name,
        path,
      }];
    })
    .sort((left, right) => priority(left.trackId) - priority(right.trackId));
}

export function normalizeTimelineDropAsset(asset: unknown): {
  name: string;
  path: string;
  mediaType?: string;
  durationMs?: number;
} | null {
  if (!asset || typeof asset !== "object") return null;
  const value = asset as Record<string, unknown>;
  const name = [value.title, value.name, value.filename]
    .find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)
    ?.trim();
  const path = [value.filePath, value.sourcePath, value.sourceUrl, value.url, value.path]
    .find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)
    ?.trim();
  if (!name || !path) return null;

  return {
    name,
    path,
    mediaType: typeof value.mediaType === "string" ? value.mediaType : undefined,
    durationMs: typeof value.durationMs === "number" && Number.isFinite(value.durationMs) ? value.durationMs : undefined,
  };
}

/**
 * Convert native/WebAudio peaks into a stable, visible display shape.
 * Quiet recordings are normalized for visualization only; dead-air decisions
 * continue to use the unscaled analyzer values and silence segments.
 */
export function normalizeWaveformPeaksForDisplay(
  peaks: number[],
  desiredBars = 200,
): number[] {
  const barCount = Math.max(1, Math.round(desiredBars));
  const clean = peaks.filter((peak) => Number.isFinite(peak) && peak >= 0);
  if (clean.length === 0) return Array.from({ length: barCount }, () => 0.06);

  let maxPeak = 0;
  for (const peak of clean) maxPeak = Math.max(maxPeak, peak);
  const hasSignal = maxPeak > 0.0001;
  return Array.from({ length: barCount }, (_, index) => {
    const start = Math.floor((index * clean.length) / barCount);
    const end = Math.max(start + 1, Math.ceil(((index + 1) * clean.length) / barCount));
    let bucketPeak = 0;
    for (let cursor = start; cursor < Math.min(end, clean.length); cursor += 1) {
      bucketPeak = Math.max(bucketPeak, clean[cursor]);
    }
    if (!hasSignal) return 0.06;
    return Math.max(0.06, Math.min(1, Math.sqrt(bucketPeak / maxPeak)));
  });
}

/**
 * Resample real min/max/RMS bins for a symmetric waveform display.
 * Scaling is display-only; the raw RMS value is retained for silence coloring.
 */
export function normalizeWaveformBinsForDisplay(
  bins: WaveformBin[],
  desiredBars = 200,
  thresholdDb = -41,
): DisplayWaveformBin[] {
  const barCount = Math.max(1, Math.round(desiredBars));
  const clean = bins.filter((bin) => (
    Number.isFinite(bin.min)
    && Number.isFinite(bin.max)
    && Number.isFinite(bin.rms)
    && Number.isFinite(bin.peak)
    && bin.min <= bin.max
    && bin.rms >= 0
    && bin.peak >= 0
  ));
  const thresholdAmplitude = Math.pow(10, thresholdDb / 20);
  if (clean.length === 0) {
    return Array.from({ length: barCount }, () => ({
      min: -0.06,
      max: 0.06,
      rms: 0,
      peak: 0.06,
      isSilence: true,
    }));
  }

  const resampled = Array.from({ length: barCount }, (_, index) => {
    const start = Math.min(clean.length - 1, Math.floor((index * clean.length) / barCount));
    const end = Math.max(start + 1, Math.min(clean.length, Math.ceil(((index + 1) * clean.length) / barCount)));
    const source = clean.slice(start, end);
    const min = source.reduce((value, bin) => Math.min(value, bin.min), Number.POSITIVE_INFINITY);
    const max = source.reduce((value, bin) => Math.max(value, bin.max), Number.NEGATIVE_INFINITY);
    const rms = Math.sqrt(source.reduce((sum, bin) => sum + bin.rms * bin.rms, 0) / Math.max(1, source.length));
    const peak = source.reduce((value, bin) => Math.max(value, bin.peak), 0);
    return { min, max, rms, peak, isSilence: rms <= thresholdAmplitude };
  });

  const maxAbs = resampled.reduce(
    (value, bin) => Math.max(value, Math.abs(bin.min), Math.abs(bin.max), bin.peak),
    0,
  );
  if (maxAbs <= 0.0001) {
    return resampled.map((bin) => ({ ...bin, min: -0.06, max: 0.06, peak: 0.06, isSilence: true }));
  }

  return resampled.map((bin) => ({
    ...bin,
    min: Math.max(-1, bin.min / maxAbs),
    max: Math.min(1, bin.max / maxAbs),
    peak: Math.min(1, bin.peak / maxAbs),
  }));
}

export function getAudioTrackLabel(track: AudioTrackInfo): string {
  const name = track.title?.trim() || `Audio ${track.audioOrdinal + 1}`;
  const details = [
    track.language?.trim(),
    track.channelLayout?.trim() || (track.channels ? `${track.channels}ch` : undefined),
    track.codec?.trim(),
  ].filter(Boolean);
  return details.length > 0 ? `${name} · ${details.join(" · ")}` : name;
}

export function chooseAudioTrackIndex(tracks: AudioTrackInfo[]): number | null {
  return tracks.find((track) => track.isDefault)?.streamIndex ?? tracks[0]?.streamIndex ?? null;
}

export interface DeadAirRenderSelection {
  enabled: boolean;
  volumeThresholdPct: number;
  minDurationSec: number;
  softeningBufferSec: number;
  silenceSegments: SilenceRange[];
  cameraMotionPlan?: CameraMotionPlan | null;
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

export function getDeadAirCutFingerprint(ranges: SilenceRange[], durationMs: number): string {
  return normalizeSilenceRanges(ranges, durationMs)
    .map((range) => `${range.startMs}-${range.endMs}`)
    .join(",");
}
