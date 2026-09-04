import type { NleClip } from "../../types/nleProject";

export function trimTimelineClip(clip: NleClip, edge: "left" | "right", deltaMs: number, sourceDurationMs?: number): NleClip {
  if (!Number.isFinite(deltaMs) || clip.isCompound) return clip;
  const speed = clip.speed ?? 1;
  const trimIn = clip.trimInMs ?? 0;
  const sourceEnd = clip.trimOutMs ?? trimIn + clip.durationMs * speed;
  const minDuration = Math.min(300, clip.durationMs);
  if (edge === "left") {
    const delta = Math.max(-clip.timelineStartMs, -trimIn / speed, Math.min(deltaMs, clip.durationMs - minDuration));
    return { ...clip, timelineStartMs: clip.timelineStartMs + delta, durationMs: clip.durationMs - delta, trimInMs: trimIn + delta * speed };
  }
  const maxDuration = sourceDurationMs === undefined ? Infinity : Math.max(minDuration, (sourceDurationMs - trimIn) / speed);
  const durationMs = Math.max(minDuration, Math.min(maxDuration, clip.durationMs + deltaMs));
  return { ...clip, durationMs, trimOutMs: sourceEnd + (durationMs - clip.durationMs) * speed };
}

export function splitTimelineClip(clip: NleClip, timeMs: number): NleClip[] {
  const endMs = clip.timelineStartMs + clip.durationMs;
  if (clip.isCompound || timeMs <= clip.timelineStartMs + 200 || timeMs >= endMs - 200) return [clip];
  const leftDuration = timeMs - clip.timelineStartMs;
  const sourceSplit = (clip.trimInMs ?? 0) + leftDuration * (clip.speed ?? 1);
  return [
    { ...clip, id: `${clip.id}_pt1`, durationMs: leftDuration, trimOutMs: sourceSplit },
    { ...clip, id: `${clip.id}_pt2`, timelineStartMs: timeMs, durationMs: clip.durationMs - leftDuration, trimInMs: sourceSplit },
  ];
}

export function preserveLockedClips(previous: import("../../types/nleProject").SmartSpecProjectDraft | null, next: import("../../types/nleProject").SmartSpecProjectDraft | null) {
  if (!previous || !next || previous.projectId !== next.projectId) return next;
  const tracks = next.tracks.map((track) => {
    const old = previous.tracks.find((item) => item.id === track.id);
    return old?.locked ? { ...track, clips: old.clips } : track;
  });
  for (const [index, track] of previous.tracks.entries()) {
    if (track.locked && !tracks.some((item) => item.id === track.id)) tracks.splice(Math.min(index, tracks.length), 0, track);
  }
  return { ...next, tracks };
}
