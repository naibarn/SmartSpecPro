import { expect, it } from "vitest";
import { applyGlobalTimelineCuts, splitTimelineClip, trimTimelineClip } from "../../src/screens/media-workspace/timelineEdits";
import type { NleClip } from "../../src/types/nleProject";
const clip: NleClip = {id: "c", name: "clip", timelineStartMs: 2000, durationMs: 4000, sourceType: "local_file", trimInMs: 1000, trimOutMs: 9000, speed: 2};
it("splits source time using playback speed", () => {
  const [left, right] = splitTimelineClip(clip, 4000);
  expect(left.trimOutMs).toBe(5000); expect(right.trimInMs).toBe(5000);
  expect(left.durationMs + right.durationMs).toBe(4000);
});
it("limits left trim to available source while keeping the timeline end fixed", () => {
  const result = trimTimelineClip(clip, "left", -10000);
  expect(result.trimInMs).toBe(0);
  expect(result.timelineStartMs).toBe(1500);
  expect(result.timelineStartMs + result.durationMs).toBe(6000);
});
it("prevents left handles crossing the end of a clip", () => {
  const result = trimTimelineClip(clip, "left", 20000);
  expect(result.durationMs).toBe(300); expect(result.timelineStartMs + result.durationMs).toBe(6000);
});
it("bounds right trim by known source duration", () => {
  const result = trimTimelineClip(clip, "right", 10000, 11000);
  expect(result.durationMs).toBe(5000); expect(result.trimOutMs).toBe(11000);
});
it("does not destructively split or trim compound clips", () => {
  const compound = {...clip, isCompound: true};
  expect(splitTimelineClip(compound, 4000)).toEqual([compound]);
  expect(trimTimelineClip(compound, "left", 1000)).toBe(compound);
});
import { preserveLockedClips } from "../../src/screens/media-workspace/timelineEdits";
import { createDefaultProjectDraft } from "../../src/types/nleProject";
it("protects locked clips from every editor update while allowing mixer changes", () => {
  const before = createDefaultProjectDraft({projectId:'p',title:'v',videoPath:'/v.mp4',videoDurationMs:1000});
  before.tracks[3].locked = true;
  const after = {...before, tracks: before.tracks.map(track => ({...track, muted: true, clips: []}))};
  const result = preserveLockedClips(before, after)!;
  expect(result.tracks[3].clips).toEqual(before.tracks[3].clips);
  expect(result.tracks[3].muted).toBe(true);
  expect(result.tracks[4].clips).toEqual([]);
});
it("does not carry locked content into a different project", () => {
  const before = createDefaultProjectDraft({projectId:'p',title:'v',videoPath:'/v.mp4',videoDurationMs:1000});
  before.tracks[3].locked = true;
  const next = {...before, projectId:'other', tracks: []};
  expect(preserveLockedClips(before, next)).toBe(next);
});

it("remaps every track, including locked overlays, through the same global cuts", () => {
  const project = createDefaultProjectDraft({ projectId: "global", title: "v", videoPath: "/v.mp4", videoDurationMs: 10_000 });
  project.tracks[2].clips = [{
    id: "overlay",
    name: "overlay",
    timelineStartMs: 2_000,
    durationMs: 6_000,
    sourceType: "generated_code",
    componentCode: "<span />",
  }];
  project.tracks[2].locked = true;
  project.tracks[3].clips[0].words = [
    { word: "hello", startMs: 1_000, endMs: 2_000 },
    { word: "world", startMs: 5_000, endMs: 6_000 },
  ];

  const result = applyGlobalTimelineCuts(project, [{ startMs: 3_000, endMs: 4_000 }], "3000-4000", 0);
  expect(result.canvas.durationMs).toBe(9_000);
  expect(result.tracks[2].clips.map((clip) => [clip.timelineStartMs, clip.durationMs])).toEqual([[2_000, 1_000], [3_000, 4_000]]);
  expect(result.tracks[3].clips.flatMap((clip) => clip.words ?? []).map((word) => [word.startMs, word.endMs])).toEqual([[1_000, 2_000], [4_000, 5_000]]);
  expect(result.metadata?.deadAirCutFingerprint).toBe("3000-4000");
  expect(applyGlobalTimelineCuts(result, [{ startMs: 3_000, endMs: 4_000 }], "3000-4000")).toBe(result);
});
