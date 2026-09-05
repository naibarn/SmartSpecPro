import type { NleClip } from "../../types/nleProject";

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

