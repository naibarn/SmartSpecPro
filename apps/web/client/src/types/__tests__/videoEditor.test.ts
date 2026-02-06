/**
 * Comprehensive tests for videoEditor.ts helper functions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createEmptyProject,
  generateId,
  formatTime,
  formatTimeMs,
  calculateProjectDuration,
  calculateProjectDurationMs,
  addAssetToProject,
  addClipToTrack,
  findTrackByType,
  validateProject,
  migrateProjectV1ToV2,
  type VideoEditorProject,
  type Track,
  type Asset,
  type MediaLibraryAsset,
} from "../videoEditor";

// ========================================
// createEmptyProject
// ========================================

describe("createEmptyProject", () => {
  it("creates a project with correct default settings", () => {
    const project = createEmptyProject("My Project");

    expect(project.name).toBe("My Project");
    expect(project.version).toBe("1.0");
    expect(project.settings.width).toBe(1920);
    expect(project.settings.height).toBe(1080);
    expect(project.settings.fps).toBe(30);
    expect(project.settings.sampleRate).toBe(48000);
    expect(project.settings.duration).toBe(0);
  });

  it("creates default video and audio tracks", () => {
    const project = createEmptyProject();

    expect(project.timeline.tracks).toHaveLength(2);

    const videoTrack = project.timeline.tracks[0];
    expect(videoTrack.id).toBe("track-v1");
    expect(videoTrack.type).toBe("video");
    expect(videoTrack.name).toBe("V1");
    expect(videoTrack.clips).toEqual([]);
    expect(videoTrack.muted).toBe(false);
    expect(videoTrack.locked).toBe(false);

    const audioTrack = project.timeline.tracks[1];
    expect(audioTrack.id).toBe("track-a1");
    expect(audioTrack.type).toBe("audio");
    expect(audioTrack.name).toBe("A1");
  });

  it("creates correct audio mixing defaults", () => {
    const project = createEmptyProject();

    expect(project.audioMixing.masterVolume).toBe(1.0);
    expect(project.audioMixing.ducking.enabled).toBe(false);
    expect(project.audioMixing.ducking.voiceoverTrackId).toBe("track-a1");
    expect(project.audioMixing.ducking.threshold).toBe(0.03);
    expect(project.audioMixing.ducking.ratio).toBe(6.0);
  });

  it("creates correct export settings", () => {
    const project = createEmptyProject();

    expect(project.export.codec).toBe("h264_videotoolbox");
    expect(project.export.bitrate).toBe(6000);
    expect(project.export.audioCodec).toBe("aac");
    expect(project.export.audioBitrate).toBe(192);
  });

  it("uses default name when none provided", () => {
    const project = createEmptyProject();
    expect(project.name).toBe("Untitled Project");
  });

  it("sets createdAt and modifiedAt to valid ISO dates", () => {
    const before = new Date().toISOString();
    const project = createEmptyProject();
    const after = new Date().toISOString();

    expect(project.createdAt >= before).toBe(true);
    expect(project.createdAt <= after).toBe(true);
    expect(project.modifiedAt >= before).toBe(true);
    expect(project.modifiedAt <= after).toBe(true);
  });

  it("starts with empty assets object", () => {
    const project = createEmptyProject();
    expect(project.assets).toEqual({});
    expect(Object.keys(project.assets)).toHaveLength(0);
  });
});

// ========================================
// generateId
// ========================================

describe("generateId", () => {
  it("generates string IDs with default prefix", () => {
    const id = generateId();
    expect(typeof id).toBe("string");
    expect(id.startsWith("id-")).toBe(true);
  });

  it("generates IDs with custom prefix", () => {
    const id = generateId("clip");
    expect(id.startsWith("clip-")).toBe(true);
  });

  it("generates unique IDs on consecutive calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId("test")));
    expect(ids.size).toBe(50);
  });

  it("generates IDs containing timestamp component", () => {
    const before = Date.now();
    const id = generateId("x");
    // ID format: prefix-timestamp-random
    const parts = id.split("-");
    expect(parts.length).toBeGreaterThanOrEqual(2);
    const timestamp = parseInt(parts[1], 10);
    expect(timestamp).toBeGreaterThanOrEqual(before);
  });
});

// ========================================
// formatTime (seconds-based)
// ========================================

describe("formatTime", () => {
  it("formats zero seconds", () => {
    expect(formatTime(0)).toBe("0:00.00");
  });

  it("formats seconds less than a minute", () => {
    expect(formatTime(5)).toBe("0:05.00");
    expect(formatTime(59)).toBe("0:59.00");
  });

  it("formats minutes and seconds", () => {
    expect(formatTime(65)).toBe("1:05.00");
    expect(formatTime(120)).toBe("2:00.00");
  });

  it("formats hours, minutes, and seconds", () => {
    expect(formatTime(3661)).toBe("1:01:01.00");
    expect(formatTime(7200)).toBe("2:00:00.00");
  });

  it("formats fractional seconds as centiseconds", () => {
    expect(formatTime(1.5)).toBe("0:01.50");
    expect(formatTime(0.25)).toBe("0:00.25");
    expect(formatTime(65.5)).toBe("1:05.50");
  });

  it("handles small fractional values", () => {
    expect(formatTime(0.01)).toBe("0:00.01");
    expect(formatTime(0.99)).toBe("0:00.99");
  });
});

// ========================================
// formatTimeMs (millisecond-based)
// ========================================

describe("formatTimeMs", () => {
  it("formats zero milliseconds", () => {
    expect(formatTimeMs(0)).toBe("0:00.00");
  });

  it("formats sub-second values", () => {
    expect(formatTimeMs(500)).toBe("0:00.50");
    expect(formatTimeMs(1000)).toBe("0:01.00");
  });

  it("formats multi-minute values", () => {
    expect(formatTimeMs(65500)).toBe("1:05.50");
  });

  it("formats values with hours", () => {
    expect(formatTimeMs(3661000)).toBe("1:01:01.00");
  });
});

// ========================================
// calculateProjectDuration (seconds)
// ========================================

describe("calculateProjectDuration", () => {
  it("returns 0 for empty timeline", () => {
    const project = createEmptyProject();
    expect(calculateProjectDuration(project.timeline)).toBe(0);
  });

  it("calculates duration from single clip", () => {
    const project = createEmptyProject();
    project.timeline.tracks[0].clips.push({
      id: "c1",
      assetId: "a1",
      trackId: "track-v1",
      startTime: 0,
      duration: 10,
      trimIn: 0,
      trimOut: 10,
      volume: 1,
      speed: 1,
      effects: [],
    });
    expect(calculateProjectDuration(project.timeline)).toBe(10);
  });

  it("calculates duration from multiple clips on same track", () => {
    const project = createEmptyProject();
    project.timeline.tracks[0].clips.push(
      {
        id: "c1",
        assetId: "a1",
        trackId: "track-v1",
        startTime: 0,
        duration: 5,
        trimIn: 0,
        trimOut: 5,
        volume: 1,
        speed: 1,
        effects: [],
      },
      {
        id: "c2",
        assetId: "a2",
        trackId: "track-v1",
        startTime: 5,
        duration: 8,
        trimIn: 0,
        trimOut: 8,
        volume: 1,
        speed: 1,
        effects: [],
      },
    );
    expect(calculateProjectDuration(project.timeline)).toBe(13);
  });

  it("calculates duration across multiple tracks (takes maximum)", () => {
    const project = createEmptyProject();
    project.timeline.tracks[0].clips.push({
      id: "c1",
      assetId: "a1",
      trackId: "track-v1",
      startTime: 0,
      duration: 5,
      trimIn: 0,
      trimOut: 5,
      volume: 1,
      speed: 1,
      effects: [],
    });
    project.timeline.tracks[1].clips.push({
      id: "c2",
      assetId: "a2",
      trackId: "track-a1",
      startTime: 0,
      duration: 20,
      trimIn: 0,
      trimOut: 20,
      volume: 1,
      speed: 1,
      effects: [],
    });
    expect(calculateProjectDuration(project.timeline)).toBe(20);
  });

  it("considers clip startTime + duration for end position", () => {
    const project = createEmptyProject();
    project.timeline.tracks[0].clips.push({
      id: "c1",
      assetId: "a1",
      trackId: "track-v1",
      startTime: 10,
      duration: 5,
      trimIn: 0,
      trimOut: 5,
      volume: 1,
      speed: 1,
      effects: [],
    });
    // End position is 10 + 5 = 15
    expect(calculateProjectDuration(project.timeline)).toBe(15);
  });
});

// ========================================
// calculateProjectDurationMs (ms-based)
// ========================================

describe("calculateProjectDurationMs", () => {
  it("returns 0 for empty timeline", () => {
    const project = createEmptyProject();
    expect(calculateProjectDurationMs(project.timeline)).toBe(0);
  });

  it("uses ms-based fields when present", () => {
    const project = createEmptyProject();
    project.timeline.tracks[0].clips.push({
      id: "c1",
      assetId: "a1",
      trackId: "track-v1",
      startMs: 0,
      durationMs: 5000,
      startTime: 0,
      duration: 5,
      trimIn: 0,
      trimOut: 5,
      volume: 1,
      speed: 1,
      effects: [],
    } as any);
    expect(calculateProjectDurationMs(project.timeline)).toBe(5000);
  });

  it("falls back to seconds-based fields when ms fields missing", () => {
    const project = createEmptyProject();
    project.timeline.tracks[0].clips.push({
      id: "c1",
      assetId: "a1",
      trackId: "track-v1",
      startTime: 2,
      duration: 3,
      trimIn: 0,
      trimOut: 3,
      volume: 1,
      speed: 1,
      effects: [],
    });
    // Falls back to (2 * 1000) + (3 * 1000) = 5000
    expect(calculateProjectDurationMs(project.timeline)).toBe(5000);
  });
});

// ========================================
// addAssetToProject
// ========================================

describe("addAssetToProject", () => {
  it("adds asset to project assets map and returns the asset", () => {
    const project = createEmptyProject();
    const mediaAsset: MediaLibraryAsset = {
      id: "media-1",
      type: "video",
      title: "Test Video",
      thumbnailUrl: "https://example.com/thumb.jpg",
      duration: 30,
      url: "https://example.com/video.mp4",
      model: "test-model",
      createdAt: new Date(),
      format: "mp4",
    };

    const result = addAssetToProject(project, mediaAsset, "/workspace/video.mp4");

    expect(result.type).toBe("video");
    expect(result.source).toBe("generated");
    expect(result.path).toBe("/workspace/video.mp4");
    expect(result.originalPath).toBe("https://example.com/video.mp4");
    expect(result.duration).toBe(30);
    expect(result.format).toBe("mp4");
    expect(result.taskId).toBe("media-1");
    expect(result.model).toBe("test-model");

    // Verify it was added to the project
    expect(project.assets[result.id]).toBe(result);
    expect(Object.keys(project.assets)).toHaveLength(1);
  });

  it("extracts filename from local path", () => {
    const project = createEmptyProject();
    const asset: MediaLibraryAsset = {
      id: "m1",
      type: "audio",
      title: "Audio",
      thumbnailUrl: "",
      duration: 60,
      url: "https://example.com/audio.wav",
      model: "tts",
      createdAt: new Date(),
      format: "wav",
    };

    const result = addAssetToProject(project, asset, "/some/path/audio-output.wav");
    expect(result.filename).toBe("audio-output.wav");
  });

  it("adds multiple assets with unique IDs", () => {
    const project = createEmptyProject();
    const makeMedia = (id: string): MediaLibraryAsset => ({
      id,
      type: "video",
      title: id,
      thumbnailUrl: "",
      duration: 10,
      url: `https://example.com/${id}.mp4`,
      model: "model",
      createdAt: new Date(),
      format: "mp4",
    });

    const a1 = addAssetToProject(project, makeMedia("m1"), "/p/v1.mp4");
    const a2 = addAssetToProject(project, makeMedia("m2"), "/p/v2.mp4");

    expect(a1.id).not.toBe(a2.id);
    expect(Object.keys(project.assets)).toHaveLength(2);
  });
});

// ========================================
// addClipToTrack
// ========================================

describe("addClipToTrack", () => {
  it("adds clip to track with correct asset reference", () => {
    const project = createEmptyProject();
    const track = project.timeline.tracks[0];
    const asset: Asset = {
      id: "asset-1",
      type: "video",
      source: "imported",
      path: "/video.mp4",
      filename: "video.mp4",
      format: "mp4",
      duration: 15,
    };

    const clip = addClipToTrack(track, asset);

    expect(clip.assetId).toBe("asset-1");
    expect(clip.trackId).toBe("track-v1");
    expect(clip.duration).toBe(15);
    expect(clip.startTime).toBe(0);
    expect(clip.trimIn).toBe(0);
    expect(clip.trimOut).toBe(15);
    expect(clip.volume).toBe(1.0);
    expect(clip.speed).toBe(1.0);
    expect(clip.effects).toEqual([]);
  });

  it("places clip at specified startTime", () => {
    const project = createEmptyProject();
    const track = project.timeline.tracks[0];
    const asset: Asset = {
      id: "a1",
      type: "video",
      source: "imported",
      path: "/v.mp4",
      filename: "v.mp4",
      format: "mp4",
      duration: 10,
    };

    const clip = addClipToTrack(track, asset, 5.5);
    expect(clip.startTime).toBe(5.5);
  });

  it("sorts clips by startTime after insertion", () => {
    const project = createEmptyProject();
    const track = project.timeline.tracks[0];
    const makeAsset = (id: string): Asset => ({
      id,
      type: "video",
      source: "imported",
      path: `/${id}.mp4`,
      filename: `${id}.mp4`,
      format: "mp4",
      duration: 5,
    });

    // Add clips out of order
    addClipToTrack(track, makeAsset("a3"), 10);
    addClipToTrack(track, makeAsset("a1"), 0);
    addClipToTrack(track, makeAsset("a2"), 5);

    expect(track.clips[0].startTime).toBe(0);
    expect(track.clips[1].startTime).toBe(5);
    expect(track.clips[2].startTime).toBe(10);
  });

  it("generates unique clip IDs", () => {
    const project = createEmptyProject();
    const track = project.timeline.tracks[0];
    const asset: Asset = {
      id: "a1",
      type: "video",
      source: "imported",
      path: "/v.mp4",
      filename: "v.mp4",
      format: "mp4",
      duration: 5,
    };

    const c1 = addClipToTrack(track, asset, 0);
    const c2 = addClipToTrack(track, asset, 5);
    expect(c1.id).not.toBe(c2.id);
  });
});

// ========================================
// findTrackByType
// ========================================

describe("findTrackByType", () => {
  it("finds first video track that is not muted or locked", () => {
    const project = createEmptyProject();
    const track = findTrackByType(project.timeline, "video");
    expect(track).toBeDefined();
    expect(track!.type).toBe("video");
    expect(track!.id).toBe("track-v1");
  });

  it("finds first audio track that is not muted or locked", () => {
    const project = createEmptyProject();
    const track = findTrackByType(project.timeline, "audio");
    expect(track).toBeDefined();
    expect(track!.type).toBe("audio");
    expect(track!.id).toBe("track-a1");
  });

  it("skips muted tracks", () => {
    const project = createEmptyProject();
    project.timeline.tracks[0].muted = true;
    project.timeline.tracks.push({
      id: "track-v2",
      type: "video",
      name: "V2",
      clips: [],
      muted: false,
      locked: false,
    });

    const track = findTrackByType(project.timeline, "video");
    expect(track).toBeDefined();
    expect(track!.id).toBe("track-v2");
  });

  it("skips locked tracks", () => {
    const project = createEmptyProject();
    project.timeline.tracks[0].locked = true;
    project.timeline.tracks.push({
      id: "track-v2",
      type: "video",
      name: "V2",
      clips: [],
      muted: false,
      locked: false,
    });

    const track = findTrackByType(project.timeline, "video");
    expect(track!.id).toBe("track-v2");
  });

  it("returns undefined if no matching track available", () => {
    const project = createEmptyProject();
    project.timeline.tracks[0].muted = true; // mute video track
    project.timeline.tracks[1].muted = true; // mute audio track

    expect(findTrackByType(project.timeline, "video")).toBeUndefined();
    expect(findTrackByType(project.timeline, "audio")).toBeUndefined();
  });
});

// ========================================
// validateProject
// ========================================

describe("validateProject", () => {
  it("rejects project with no clips", () => {
    const project = createEmptyProject();
    const result = validateProject(project);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Project has no clips");
  });

  it("rejects project with zero duration", () => {
    const project = createEmptyProject();
    const result = validateProject(project);
    expect(result.errors).toContain("Project duration is zero");
  });

  it("detects clips referencing missing assets", () => {
    const project = createEmptyProject();
    project.timeline.tracks[0].clips.push({
      id: "c1",
      assetId: "nonexistent-asset",
      trackId: "track-v1",
      startTime: 0,
      duration: 5,
      trimIn: 0,
      trimOut: 5,
      volume: 1,
      speed: 1,
      effects: [],
    });

    const result = validateProject(project);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /missing asset/.test(e))).toBe(true);
  });

  it("accepts a valid project with clips and matching assets", () => {
    const project = createEmptyProject();
    project.assets["a1"] = {
      id: "a1",
      type: "video",
      source: "imported",
      path: "/video.mp4",
      filename: "video.mp4",
      format: "mp4",
      duration: 10,
    };
    project.timeline.tracks[0].clips.push({
      id: "c1",
      assetId: "a1",
      trackId: "track-v1",
      startTime: 0,
      duration: 10,
      trimIn: 0,
      trimOut: 10,
      volume: 1,
      speed: 1,
      effects: [],
    });

    const result = validateProject(project);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("reports multiple errors simultaneously", () => {
    const project = createEmptyProject();
    // No clips → "Project has no clips" + "Project duration is zero"
    const result = validateProject(project);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ========================================
// migrateProjectV1ToV2 (additional cases)
// ========================================

describe("migrateProjectV1ToV2 (additional edge cases)", () => {
  it("returns null/undefined input unchanged", () => {
    expect(migrateProjectV1ToV2(null)).toBeNull();
    expect(migrateProjectV1ToV2(undefined)).toBeUndefined();
  });

  it("handles clips without transitions", () => {
    const v1 = createEmptyProject("No Transitions");
    v1.timeline.tracks[0].clips.push({
      id: "c1",
      assetId: "a1",
      trackId: "track-v1",
      startTime: 1.5,
      duration: 3.0,
      trimIn: 0,
      trimOut: 3.0,
      volume: 1,
      speed: 1,
      effects: [],
      // No transitions
    });

    const v2 = migrateProjectV1ToV2(v1);
    const clip = v2.timeline.tracks[0].clips[0];
    expect(clip.startMs).toBe(1500);
    expect(clip.durationMs).toBe(3000);
    expect(clip.transitions).toBeUndefined();
  });

  it("handles empty tracks", () => {
    const v1 = createEmptyProject("Empty");
    const v2 = migrateProjectV1ToV2(v1);
    expect(v2.version).toBe("2.0");
    expect(v2.timeline.tracks[0].clips).toHaveLength(0);
  });

  it("preserves non-time fields during migration", () => {
    const v1 = createEmptyProject("Preserve");
    v1.timeline.tracks[0].clips.push({
      id: "c1",
      assetId: "a1",
      trackId: "track-v1",
      startTime: 2,
      duration: 5,
      trimIn: 0.5,
      trimOut: 4.5,
      volume: 0.75,
      speed: 1.5,
      effects: [{ type: "fadeIn", parameters: { duration: 0.5 } }],
    });

    const v2 = migrateProjectV1ToV2(v1);
    const clip = v2.timeline.tracks[0].clips[0];
    expect(clip.volume).toBe(0.75);
    expect(clip.speed).toBe(1.5);
    expect(clip.effects).toHaveLength(1);
    expect(clip.id).toBe("c1");
    expect(clip.assetId).toBe("a1");
  });

  it("does not mutate original project", () => {
    const v1 = createEmptyProject("Original");
    v1.settings.duration = 10;
    const v1Copy = JSON.parse(JSON.stringify(v1));

    migrateProjectV1ToV2(v1);

    expect(v1).toEqual(v1Copy);
  });
});
