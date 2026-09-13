import type { NleClip, SmartSpecProjectDraft } from "../../types/nleProject";

export interface GlobalTimelineCutRange {
  startMs: number;
  endMs: number;
}

function normalizeGlobalCutRanges(ranges: GlobalTimelineCutRange[], durationMs: number): GlobalTimelineCutRange[] {
  const boundedDuration = Math.max(0, Math.round(durationMs));
  return ranges
    .map((range) => ({
      startMs: Math.max(0, Math.min(boundedDuration, Math.round(range.startMs))),
      endMs: Math.max(0, Math.min(boundedDuration, Math.round(range.endMs))),
    }))
    .filter((range) => range.endMs > range.startMs)
    .sort((left, right) => left.startMs - right.startMs)
    .reduce<GlobalTimelineCutRange[]>((merged, range) => {
      const previous = merged[merged.length - 1];
      if (previous && range.startMs <= previous.endMs + 50) {
        previous.endMs = Math.max(previous.endMs, range.endMs);
      } else {
        merged.push({ ...range });
      }
      return merged;
    }, []);
}

function mapTimelineTimeMs(timeMs: number, cuts: GlobalTimelineCutRange[]): number {
  let removedMs = 0;
  for (const cut of cuts) {
    if (timeMs <= cut.startMs) break;
    if (timeMs < cut.endMs) return Math.max(0, cut.startMs - removedMs);
    removedMs += cut.endMs - cut.startMs;
  }
  return Math.max(0, timeMs - removedMs);
}

function remapClipWords(clip: NleClip, sourceStartMs: number, sourceEndMs: number, cuts: GlobalTimelineCutRange[]): NleClip["words"] {
  if (!clip.words?.length) return clip.words;
  return clip.words
    .filter((word) => word.endMs > sourceStartMs && word.startMs < sourceEndMs)
    .map((word) => {
      const startMs = Math.max(sourceStartMs, word.startMs);
      const endMs = Math.min(sourceEndMs, word.endMs);
      return {
        ...word,
        startMs: mapTimelineTimeMs(startMs, cuts),
        endMs: mapTimelineTimeMs(endMs, cuts),
      };
    })
    .filter((word) => word.endMs > word.startMs);
}

function remapClipAcrossCuts(clip: NleClip, cuts: GlobalTimelineCutRange[]): NleClip[] {
  const clipStart = Math.max(0, clip.timelineStartMs);
  const clipEnd = Math.max(clipStart, clip.timelineStartMs + clip.durationMs);
  if (clipEnd <= clipStart) return [];

  const boundaries = [clipStart, ...cuts.flatMap((cut) => [cut.startMs, cut.endMs]), clipEnd]
    .filter((value) => value > clipStart && value < clipEnd)
    .sort((left, right) => left - right);
  const slices: NleClip[] = [];
  const speed = Number.isFinite(clip.speed) && (clip.speed ?? 1) > 0 ? Math.max(0.001, clip.speed ?? 1) : 1;
  const trimInMs = clip.trimInMs ?? 0;

  for (let index = 0; index < boundaries.length + 1; index += 1) {
    const sourceStartMs = index === 0 ? clipStart : boundaries[index - 1];
    const sourceEndMs = index === boundaries.length ? clipEnd : boundaries[index];
    if (sourceEndMs <= sourceStartMs) continue;
    const isCut = cuts.some((cut) => sourceStartMs >= cut.startMs && sourceEndMs <= cut.endMs);
    if (isCut) continue;

    const pieceOffsetMs = sourceStartMs - clipStart;
    const pieceDurationMs = sourceEndMs - sourceStartMs;
    const nextTrimInMs = clip.sourcePath ? trimInMs + pieceOffsetMs * speed : clip.trimInMs;
    const nextTrimOutMs = clip.sourcePath
      ? trimInMs + (pieceOffsetMs + pieceDurationMs) * speed
      : clip.trimOutMs;
    const nextClip: NleClip = {
      ...clip,
      id: index === 0 ? clip.id : `${clip.id}__dead-air-${index}`,
      timelineStartMs: mapTimelineTimeMs(sourceStartMs, cuts),
      durationMs: Math.max(1, Math.round(pieceDurationMs)),
      trimInMs: nextTrimInMs,
      trimOutMs: nextTrimOutMs,
      words: remapClipWords(clip, sourceStartMs, sourceEndMs, cuts),
    };
    slices.push(nextClip);
  }
  return slices;
}

export function applyGlobalTimelineCuts(
  project: SmartSpecProjectDraft,
  ranges: GlobalTimelineCutRange[],
  fingerprint: string,
  selectedAudioStreamIndex?: number | null,
): SmartSpecProjectDraft {
  const nextSelectedAudioStreamIndex = selectedAudioStreamIndex === undefined
    ? project.metadata?.deadAirAudioStreamIndex
    : selectedAudioStreamIndex ?? undefined;
  if (project.metadata?.deadAirCutFingerprint === fingerprint) {
    if (project.metadata.deadAirAudioStreamIndex === nextSelectedAudioStreamIndex) return project;
    return {
      ...project,
      metadata: {
        ...project.metadata,
        deadAirAudioStreamIndex: nextSelectedAudioStreamIndex,
      },
    };
  }
  const durationMs = Math.max(
    project.canvas.durationMs,
    ...project.tracks.flatMap((track) => track.clips.map((clip) => clip.timelineStartMs + clip.durationMs)),
  );
  const cuts = normalizeGlobalCutRanges(ranges, durationMs);
  if (cuts.length === 0) {
    return {
      ...project,
      updatedAt: new Date().toISOString(),
      metadata: {
        ...project.metadata,
        deadAirCutCount: 0,
        timeSavedMs: 0,
        deadAirCutFingerprint: "",
        deadAirAudioStreamIndex: nextSelectedAudioStreamIndex,
        deadAirCutRanges: [],
      },
    };
  }
  const timeSavedMs = cuts.reduce((sum, cut) => sum + cut.endMs - cut.startMs, 0);
  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.flatMap((clip) => remapClipAcrossCuts(clip, cuts)),
  }));
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    canvas: {
      ...project.canvas,
      durationMs: Math.max(0, durationMs - timeSavedMs),
    },
    tracks,
    metadata: {
      ...project.metadata,
      deadAirCutCount: cuts.length,
      timeSavedMs,
      deadAirCutFingerprint: fingerprint,
      deadAirAudioStreamIndex: nextSelectedAudioStreamIndex,
      deadAirCutRanges: cuts,
    },
  };
}

export function trimTimelineClip(clip: NleClip, edge: "left" | "right", deltaMs: number, sourceDurationMs?: number): NleClip {
  if (!Number.isFinite(deltaMs) || clip.isCompound) return clip;
  const rawSpeed = clip.speed ?? 1;
  const speed = Number.isFinite(rawSpeed) && rawSpeed > 0 ? Math.max(0.001, rawSpeed) : 1;
  const trimIn = clip.trimInMs ?? 0;
  const sourceEnd = clip.trimOutMs ?? trimIn + clip.durationMs * speed;
  const minDuration = Math.min(300, Math.max(100, clip.durationMs));

  if (edge === "left") {
    const maxLeftTrim = Math.min(deltaMs, clip.durationMs - minDuration);
    const minLeftTrim = Math.max(-clip.timelineStartMs, -trimIn / speed);
    const delta = Math.max(minLeftTrim, maxLeftTrim);
    const newStart = Math.max(0, clip.timelineStartMs + delta);
    const newDuration = Math.max(minDuration, clip.durationMs - delta);
    const newTrimIn = Math.max(0, trimIn + delta * speed);
    return { ...clip, timelineStartMs: newStart, durationMs: newDuration, trimInMs: newTrimIn };
  }

  const maxDuration = sourceDurationMs === undefined ? Infinity : Math.max(minDuration, (sourceDurationMs - trimIn) / speed);
  const durationMs = Math.max(minDuration, Math.min(maxDuration, clip.durationMs + deltaMs));
  const newTrimOut = Math.max(trimIn + durationMs * speed, sourceEnd + (durationMs - clip.durationMs) * speed);
  return { ...clip, durationMs, trimOutMs: newTrimOut };
}

export function splitTimelineClip(clip: NleClip, timeMs: number): NleClip[] {
  const endMs = clip.timelineStartMs + clip.durationMs;
  if (clip.isCompound || timeMs <= clip.timelineStartMs + 200 || timeMs >= endMs - 200) return [clip];
  const leftDuration = timeMs - clip.timelineStartMs;
  const speed = Number.isFinite(clip.speed) && (clip.speed ?? 1) > 0 ? Math.max(0.001, clip.speed ?? 1) : 1;
  const sourceSplit = (clip.trimInMs ?? 0) + leftDuration * speed;

  const baseId = clip.id.replace(/_pt\d+(_pt\d+)*$/, "");
  const uniqueId = `${baseId}_${Date.now().toString(36)}`;

  return [
    { ...clip, id: `${uniqueId}_pt1`, durationMs: leftDuration, trimOutMs: sourceSplit },
    { ...clip, id: `${uniqueId}_pt2`, timelineStartMs: timeMs, durationMs: clip.durationMs - leftDuration, trimInMs: sourceSplit, trimOutMs: clip.trimOutMs },
  ];
}

export function preserveLockedClips(previous: import("../../types/nleProject").SmartSpecProjectDraft | null, next: import("../../types/nleProject").SmartSpecProjectDraft | null) {
  if (!previous || !next || previous.projectId !== next.projectId) return next;
  const tracks = next.tracks.map((track) => {
    const old = previous.tracks.find((item) => item.id === track.id && item.type === track.type);
    return old?.locked ? { ...track, clips: old.clips } : track;
  });
  for (const [index, track] of previous.tracks.entries()) {
    if (track.locked && !tracks.some((item) => item.id === track.id && item.type === track.type)) {
      tracks.splice(Math.min(index, tracks.length), 0, track);
    }
  }
  return { ...next, tracks };
}

export function detectClipOverlaps(clips: NleClip[]): Array<{ clip1: NleClip; clip2: NleClip }> {
  if (!Array.isArray(clips) || clips.length < 2) return [];
  const sorted = [...clips].sort((a, b) => a.timelineStartMs - b.timelineStartMs);
  const overlaps: Array<{ clip1: NleClip; clip2: NleClip }> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const c1 = sorted[i];
    const c2 = sorted[i + 1];
    if (c1.timelineStartMs + c1.durationMs > c2.timelineStartMs) {
      overlaps.push({ clip1: c1, clip2: c2 });
    }
  }
  return overlaps;
}
