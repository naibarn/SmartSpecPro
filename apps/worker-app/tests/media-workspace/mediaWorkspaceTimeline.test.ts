import { describe, expect, it } from "vitest";
import {
  advancePlayableTimeMs,
  canMoveTimelineClip,
  canPlaceMediaOnTrack,
  chooseAudioTrackIndex,
  chooseAssetTargetTrack,
  chooseRenderSourcePath,
  getAudioTrackLabel,
  getPlaybackSilenceRanges,
  getNoiseThresholdDb,
  getPlayableTimeMs,
  getWaveformThresholdTopPercent,
  getTimelineVideoSources,
  normalizeSilenceRanges,
  normalizeTimelineDropAsset,
  normalizeWaveformBinsForDisplay,
  normalizeWaveformPeaksForDisplay,
  moveTimelineClip,
  shouldCommitLoadedMetadataToSourceTimeline,
} from "../../src/screens/media-workspace/mediaWorkspaceTimeline";
import type { NleClip, NleTrack } from "../../src/types/nleProject";

describe("media workspace dead-air timeline", () => {
  const cuts = [{ startMs: 1_000, endMs: 2_000 }, { startMs: 4_000, endMs: 5_000 }];

  it("merges overlapping ranges and seeks past a cut", () => {
    expect(normalizeSilenceRanges([{ startMs: 1_000, endMs: 1_500 }, { startMs: 1_520, endMs: 2_000 }], 6_000))
      .toEqual([{ startMs: 1_000, endMs: 2_000 }]);
    expect(getPlayableTimeMs(1_500, cuts, 6_000)).toBe(2_001);
  });

  it("advances over multiple dead-air ranges without changing playable duration", () => {
    expect(advancePlayableTimeMs(900, 2_200, cuts, 6_000)).toBe(5_102);
  });

  it("uses analyzed ranges for playback but preserves explicit manual cuts", () => {
    const ranges = [
      { startMs: 1_000, endMs: 2_000, isManual: false },
      { startMs: 3_000, endMs: 3_500, isManual: true },
    ];
    expect(getPlaybackSilenceRanges(ranges, false)).toEqual([ranges[1]]);
    expect(getPlaybackSilenceRanges(ranges, true)).toEqual(ranges);
  });

  it("keeps the visual threshold tied to the profile mapping", () => {
    expect(getNoiseThresholdDb(30)).toBeCloseTo(-39.5, 5);
    expect(getWaveformThresholdTopPercent(30)).toBe(70);
  });

  it("prefers the default embedded audio track and labels its useful metadata", () => {
    const tracks = [
      { streamIndex: 1, audioOrdinal: 0, title: "Music", language: "en", channels: 2, isDefault: false },
      { streamIndex: 3, audioOrdinal: 1, title: "Dialogue", language: "th", channelLayout: "stereo", codec: "aac", isDefault: true },
    ];
    expect(chooseAudioTrackIndex(tracks)).toBe(3);
    expect(getAudioTrackLabel(tracks[1])).toContain("Dialogue · th · stereo · aac");
  });

  it("finds a V2 video when V1 is empty and keeps V1 as the preferred source", () => {
    const sources = getTimelineVideoSources({
      tracks: [
        { id: "track_v2", name: "V2 B-Roll", type: "video_broll", clips: [{ id: "b", name: "broll.mp4", sourcePath: "D:/broll.mp4" }] },
        { id: "track_v1", name: "V1 Main", type: "video_main", clips: [] },
      ],
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ trackId: "track_v2", path: "D:/broll.mp4" });

    const withV1 = getTimelineVideoSources({
      tracks: [
        ...sources.map((source) => ({ id: source.trackId, name: source.trackName, type: "video_broll", clips: [{ id: source.clipId, name: source.name, sourcePath: source.path }] })),
        { id: "track_v1", name: "V1 Main", type: "video_main", clips: [{ id: "a", name: "main.mp4", sourcePath: "D:/main.mp4" }] },
      ],
    });
    expect(withV1[0]?.trackId).toBe("track_v1");
  });

  it("uses the exact timeline analysis source for render before falling back to the opened file", () => {
    expect(chooseRenderSourcePath("D:/timeline-main.mp4", "D:/opened-project-source.mp4"))
      .toBe("D:/timeline-main.mp4");
    expect(chooseRenderSourcePath("", "D:/opened-source.mp4")).toBe("D:/opened-source.mp4");
  });

  it("does not let rendered-output metadata overwrite the source timeline on rerender", () => {
    expect(shouldCommitLoadedMetadataToSourceTimeline(true)).toBe(false);
    expect(shouldCommitLoadedMetadataToSourceTimeline(false)).toBe(true);
  });

  it("skips a project file and resolves the real media source for a loaded project", () => {
    expect(chooseRenderSourcePath(
      "D:/C2177-ขวดดูดนม/C2177-ขวดดูดนม.videoproject.json",
      "D:/C2177-ขวดดูดนม/C2177-ขวดดูดนม.videoproject.json",
      ["D:/C2177-ขวดดูดนม/C3800.MP4"],
    )).toBe("D:/C2177-ขวดดูดนม/C3800.MP4");
  });

  it("normalizes Media Bin payloads that use name and filePath", () => {
    expect(normalizeTimelineDropAsset({ name: "C3784.MP4", filePath: "D:/C3784.MP4", mediaType: "video", durationMs: 105600 }))
      .toEqual({ name: "C3784.MP4", path: "D:/C3784.MP4", mediaType: "video", durationMs: 105600 });
    expect(normalizeTimelineDropAsset({ name: "C3784.MP4", path: "D:/C3784.MP4", mediaType: "video" }))
      .toEqual({ name: "C3784.MP4", path: "D:/C3784.MP4", mediaType: "video", durationMs: undefined });
    expect(normalizeTimelineDropAsset({ title: "clip", sourceUrl: "https://example.test/clip.mp4" }))
      .toMatchObject({ name: "clip", path: "https://example.test/clip.mp4" });
    expect(normalizeTimelineDropAsset({
      name: "portrait.mp4",
      filePath: "D:/portrait.mp4",
      mediaType: "video",
      width: 1080.4,
      height: 1920.6,
    })).toMatchObject({ width: 1080, height: 1921 });
  });

  it("keeps quiet or missing waveform data visibly rendered", () => {
    expect(normalizeWaveformPeaksForDisplay([], 4)).toEqual([0.06, 0.06, 0.06, 0.06]);
    const visible = normalizeWaveformPeaksForDisplay([0.001, 0.004, 0.0005, 0.002], 4);
    expect(visible).toHaveLength(4);
    expect(Math.max(...visible)).toBe(1);
    expect(Math.min(...visible)).toBeGreaterThanOrEqual(0.06);
  });

  it("normalizes real min/max waveform bins symmetrically and keeps RMS silence state", () => {
    const visible = normalizeWaveformBinsForDisplay([
      { min: -0.8, max: 0.7, rms: 0.5, peak: 0.8 },
      { min: -0.01, max: 0.01, rms: 0.001, peak: 0.01 },
    ], 2, -41);
    expect(visible).toHaveLength(2);
    expect(visible[0]?.min).toBe(-1);
    expect(visible[0]?.max).toBeCloseTo(0.875, 5);
    expect(visible[0]?.isSilence).toBe(false);
    expect(visible[1]?.min).toBeCloseTo(-0.0125, 5);
    expect(visible[1]?.max).toBeCloseTo(0.0125, 5);
    expect(visible[1]?.isSilence).toBe(true);
  });

  it("moves a V2 clip to V1 without losing clip metadata", () => {
    const clip: NleClip = {
      id: "clip-v2",
      name: "C3784.MP4",
      timelineStartMs: 500,
      durationMs: 4_000,
      sourceType: "local_file",
      sourcePath: "D:/C3784.MP4",
      trimInMs: 120,
      trimOutMs: 4_120,
      transform: { x: 0.5, y: 0.5, scale: 1.2, opacity: 1 },
    };
    const tracks: NleTrack[] = [
      { id: "track_v2", name: "V2", type: "video_broll", muted: false, locked: false, volume: 1, clips: [clip] },
      { id: "track_v1", name: "V1", type: "video_main", muted: false, locked: false, volume: 1, clips: [] },
    ];

    expect(canMoveTimelineClip(tracks[0], tracks[1])).toBe(true);
    const moved = moveTimelineClip(tracks, "track_v2", "clip-v2", "track_v1", -50);
    expect(moved[0].clips).toEqual([]);
    expect(moved[1].clips[0]).toMatchObject({ ...clip, timelineStartMs: 0 });
  });

  it("rejects moves into locked or incompatible tracks", () => {
    const video = { id: "v", type: "video_broll" as const, locked: false, clips: [] as NleClip[] };
    const locked = { id: "locked", type: "video_main" as const, locked: true, clips: [] as NleClip[] };
    const audio = { id: "a", type: "audio_music" as const, locked: false, clips: [] as NleClip[] };
    expect(canMoveTimelineClip(video, locked)).toBe(false);
    expect(canMoveTimelineClip(video, audio)).toBe(false);
    expect(canPlaceMediaOnTrack(locked, "video")).toBe(false);
  });

  it("uses an explicitly selected track, then prefers an empty V1 for video Bin placement", () => {
    const tracks: Array<Pick<NleTrack, "id" | "type" | "locked" | "clips">> = [
      { id: "track_v2", type: "video_broll", locked: false, clips: [{ id: "existing" } as NleClip] },
      { id: "track_v1", type: "video_main", locked: false, clips: [] },
    ];
    expect(chooseAssetTargetTrack(tracks, "video")).toBe("track_v1");
    expect(chooseAssetTargetTrack(tracks, "video", "track_v2")).toBe("track_v2");
  });
});
