/**
 * Comprehensive tests for validateProjectStructure in projectManager.ts.
 * Tests all validation rules: structural, limits, security, and sanitization.
 */
import { describe, it, expect, vi } from "vitest";

// Mock Tauri APIs before importing
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn(), open: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

import { validateProjectStructure } from "../projectManager";
import { createEmptyProject } from "../../types/videoEditor";

/**
 * Helper: creates a valid minimal project for modification.
 */
function validProject(): any {
  return JSON.parse(JSON.stringify(createEmptyProject("Test")));
}

// ========================================
// Top-level structure validation
// ========================================

describe("validateProjectStructure — top-level", () => {
  it("accepts a valid project", () => {
    const project = validProject();
    const result = validateProjectStructure(project);
    expect(result).toBeTruthy();
    expect(result.version).toBe("1.0");
  });

  it("rejects null input", () => {
    expect(() => validateProjectStructure(null)).toThrow("must be an object");
  });

  it("rejects non-object input", () => {
    expect(() => validateProjectStructure("string")).toThrow(
      "must be an object",
    );
    expect(() => validateProjectStructure(42)).toThrow("must be an object");
  });

  it("rejects invalid version format", () => {
    const p = validProject();
    p.version = "abc";
    expect(() => validateProjectStructure(p)).toThrow("Invalid version format");
  });

  it("rejects missing version", () => {
    const p = validProject();
    delete p.version;
    expect(() => validateProjectStructure(p)).toThrow("Invalid version format");
  });

  it("rejects empty project name", () => {
    const p = validProject();
    p.name = "";
    expect(() => validateProjectStructure(p)).toThrow(
      "name must be 1-256 characters",
    );
  });

  it("rejects project name over 256 chars", () => {
    const p = validProject();
    p.name = "A".repeat(257);
    expect(() => validateProjectStructure(p)).toThrow(
      "name must be 1-256 characters",
    );
  });

  it("rejects unsupported text contract version by default", () => {
    const p = validProject();
    p.contractVersion = "3.0";
    expect(() => validateProjectStructure(p)).toThrow(
      'Unsupported text contractVersion "3.0" (policy: reject_with_clear_error)',
    );
  });

  it("allows gated downgrade for unsupported contract only when text semantics are absent", () => {
    const p = validProject();
    p.contractVersion = "3.0";
    p.compatibilityPolicy = { unsupportedContractPolicy: "gated_downgrade" };
    p.timeline.tracks = [
      {
        id: "track-v1",
        type: "video",
        name: "V1",
        clips: [],
        muted: false,
        locked: false,
        visible: true,
      },
      {
        id: "track-a1",
        type: "audio",
        name: "A1",
        clips: [],
        muted: false,
        locked: false,
        visible: true,
      },
    ];

    expect(() => validateProjectStructure(p)).not.toThrow();
  });
});

// ========================================
// Settings validation
// ========================================

describe("validateProjectStructure — settings", () => {
  it("rejects missing settings object", () => {
    const p = validProject();
    delete p.settings;
    expect(() => validateProjectStructure(p)).toThrow("Missing settings");
  });

  it("rejects width < 1", () => {
    const p = validProject();
    p.settings.width = 0;
    expect(() => validateProjectStructure(p)).toThrow("Invalid width");
  });

  it("rejects width > 7680", () => {
    const p = validProject();
    p.settings.width = 8000;
    expect(() => validateProjectStructure(p)).toThrow("Invalid width");
  });

  it("rejects height < 1", () => {
    const p = validProject();
    p.settings.height = 0;
    expect(() => validateProjectStructure(p)).toThrow("Invalid height");
  });

  it("rejects height > 4320", () => {
    const p = validProject();
    p.settings.height = 5000;
    expect(() => validateProjectStructure(p)).toThrow("Invalid height");
  });

  it("rejects fps < 1", () => {
    const p = validProject();
    p.settings.fps = 0;
    expect(() => validateProjectStructure(p)).toThrow("Invalid FPS");
  });

  it("rejects fps > 120", () => {
    const p = validProject();
    p.settings.fps = 144;
    expect(() => validateProjectStructure(p)).toThrow("Invalid FPS");
  });

  it("rejects sampleRate < 8000", () => {
    const p = validProject();
    p.settings.sampleRate = 4000;
    expect(() => validateProjectStructure(p)).toThrow("Invalid sample rate");
  });

  it("rejects sampleRate > 192000", () => {
    const p = validProject();
    p.settings.sampleRate = 200000;
    expect(() => validateProjectStructure(p)).toThrow("Invalid sample rate");
  });

  it("accepts boundary settings values", () => {
    const p = validProject();
    p.settings.width = 1;
    p.settings.height = 1;
    p.settings.fps = 1;
    p.settings.sampleRate = 8000;
    expect(() => validateProjectStructure(p)).not.toThrow();

    const p2 = validProject();
    p2.settings.width = 7680;
    p2.settings.height = 4320;
    p2.settings.fps = 120;
    p2.settings.sampleRate = 192000;
    expect(() => validateProjectStructure(p2)).not.toThrow();
  });
});

// ========================================
// Timeline & Track validation
// ========================================

describe("validateProjectStructure — timeline & tracks", () => {
  it("rejects missing timeline", () => {
    const p = validProject();
    delete p.timeline;
    expect(() => validateProjectStructure(p)).toThrow("Invalid timeline");
  });

  it("rejects timeline without tracks array", () => {
    const p = validProject();
    p.timeline.tracks = "not array";
    expect(() => validateProjectStructure(p)).toThrow("Invalid timeline");
  });

  it("rejects more than 50 tracks", () => {
    const p = validProject();
    p.timeline.tracks = Array.from({ length: 51 }, (_, i) => ({
      id: `track-${i}`,
      type: "video",
      name: `T${i}`,
      clips: [],
      muted: false,
      locked: false,
    }));
    expect(() => validateProjectStructure(p)).toThrow("Too many tracks");
  });

  it("accepts exactly 50 tracks", () => {
    const p = validProject();
    p.timeline.tracks = Array.from({ length: 50 }, (_, i) => ({
      id: `track-${i}`,
      type: "video",
      name: `T${i}`,
      clips: [],
      muted: false,
      locked: false,
    }));
    expect(() => validateProjectStructure(p)).not.toThrow();
  });

  it("rejects track without id", () => {
    const p = validProject();
    p.timeline.tracks[0].id = "";
    expect(() => validateProjectStructure(p)).toThrow("Track must have valid id");
  });

  it("rejects track with invalid type", () => {
    const p = validProject();
    p.timeline.tracks[0].type = "subtitle";
    expect(() => validateProjectStructure(p)).toThrow(
      'Track type must be "video", "audio", "overlay", or "text"',
    );
  });

  it("accepts text track type", () => {
    const p = validProject();
    p.timeline.tracks.push({
      id: "track-t2",
      type: "text",
      name: "T2",
      clips: [],
      muted: false,
      locked: false,
      visible: true,
    });
    expect(() => validateProjectStructure(p)).not.toThrow();
  });

  it("accepts overlay track type", () => {
    const p = validProject();
    p.timeline.tracks.push({
      id: "track-ov1",
      type: "overlay",
      name: "OV1",
      clips: [],
      muted: false,
      locked: false,
    });
    expect(() => validateProjectStructure(p)).not.toThrow();
  });

  it("rejects track name longer than 256 chars", () => {
    const p = validProject();
    p.timeline.tracks[0].name = "N".repeat(257);
    expect(() => validateProjectStructure(p)).toThrow(
      "Track name must be valid string",
    );
  });
});

// ========================================
// Clip validation
// ========================================

describe("validateProjectStructure — clips", () => {
  function getTrack(project: any, trackId: string): any {
    const track = project.timeline.tracks.find((t: any) => t.id === trackId);
    if (!track) throw new Error(`Missing track ${trackId}`);
    return track;
  }

  function projectWithClip(clipOverrides: any = {}): any {
    const p = validProject();
    getTrack(p, "track-v1").clips.push({
      id: "clip-1",
      assetId: "a1",
      trackId: "track-v1",
      startTime: 0,
      duration: 5,
      trimIn: 0,
      trimOut: 5,
      volume: 1.0,
      speed: 1.0,
      effects: [],
      ...clipOverrides,
    });
    return p;
  }

  it("rejects clip without id", () => {
    expect(() => validateProjectStructure(projectWithClip({ id: 42 }))).toThrow(
      "Clip must have valid id",
    );
  });

  it("rejects clip without assetId", () => {
    expect(() =>
      validateProjectStructure(projectWithClip({ assetId: 123 })),
    ).toThrow("Clip must have valid assetId");
  });

  it("rejects negative startTime (V1)", () => {
    expect(() =>
      validateProjectStructure(projectWithClip({ startTime: -1 })),
    ).toThrow("startTime must be non-negative");
  });

  it("rejects zero duration (V1)", () => {
    expect(() =>
      validateProjectStructure(projectWithClip({ duration: 0 })),
    ).toThrow("duration must be 0-7200");
  });

  it("rejects duration > 7200 seconds (V1)", () => {
    expect(() =>
      validateProjectStructure(projectWithClip({ duration: 7201 })),
    ).toThrow("duration must be 0-7200");
  });

  it("rejects volume < 0", () => {
    expect(() =>
      validateProjectStructure(projectWithClip({ volume: -0.5 })),
    ).toThrow("volume must be 0-2");
  });

  it("rejects volume > 2", () => {
    expect(() =>
      validateProjectStructure(projectWithClip({ volume: 3 })),
    ).toThrow("volume must be 0-2");
  });

  it("accepts volume at boundaries (0 and 2)", () => {
    expect(() =>
      validateProjectStructure(projectWithClip({ volume: 0 })),
    ).not.toThrow();
    expect(() =>
      validateProjectStructure(projectWithClip({ volume: 2 })),
    ).not.toThrow();
  });

  it("rejects more than 1000 total clips", () => {
    const p = validProject();
    const clips = Array.from({ length: 1001 }, (_, i) => ({
      id: `clip-${i}`,
      assetId: `a${i}`,
      trackId: "track-v1",
      startTime: i,
      duration: 1,
      trimIn: 0,
      trimOut: 1,
      volume: 1,
      speed: 1,
      effects: [],
    }));
    getTrack(p, "track-v1").clips = clips;
    expect(() => validateProjectStructure(p)).toThrow("Too many clips");
  });

  it("validates V2 ms-based clips correctly", () => {
    const p = validProject();
    p.version = "2.0";
    getTrack(p, "track-v1").clips.push({
      id: "c1",
      assetId: "a1",
      trackId: "track-v1",
      startMs: 0,
      durationMs: 5000,
      inMs: 0,
      outMs: 5000,
      volume: 1.0,
      speed: 1.0,
      effects: [],
    });
    expect(() => validateProjectStructure(p)).not.toThrow();
  });

  it("rejects V2 clip with negative startMs", () => {
    const p = validProject();
    p.version = "2.0";
    getTrack(p, "track-v1").clips.push({
      id: "c1",
      assetId: "a1",
      trackId: "track-v1",
      startMs: -100,
      durationMs: 5000,
      volume: 1.0,
      effects: [],
    });
    expect(() => validateProjectStructure(p)).toThrow("startMs must be non-negative");
  });

  it("rejects V2 clip with durationMs > 7200000", () => {
    const p = validProject();
    p.version = "2.0";
    getTrack(p, "track-v1").clips.push({
      id: "c1",
      assetId: "a1",
      trackId: "track-v1",
      startMs: 0,
      durationMs: 7200001,
      volume: 1.0,
      effects: [],
    });
    expect(() => validateProjectStructure(p)).toThrow(
      "durationMs must be 0-7200000",
    );
  });

  it("defaults missing text clip fields on validation", () => {
    const p = validProject();
    getTrack(p, "track-t1").clips.push({
      id: "text-1",
      assetId: "text-asset-1",
      trackId: "track-t1",
      startTime: 0,
      duration: 3,
      trimIn: 0,
      trimOut: 3,
      textConfig: {
        text: "Hello",
      },
    });

    const result = validateProjectStructure(p);
    const clip = getTrack(result, "track-t1").clips[0] as any;
    expect(clip.volume).toBe(0);
    expect(clip.speed).toBe(1);
    expect(Array.isArray(clip.effects)).toBe(true);
    expect(clip.textConfig.fontFamily).toBe("Noto Sans");
    expect(clip.textConfig.effect).toBe("none");
  });

  it("normalizes legacy text payload snapshot for backward-compatible load/save", () => {
    const p = validProject();
    getTrack(p, "track-t1").clips.push({
      id: "text-legacy-1",
      assetId: "text-asset-legacy",
      trackId: "track-t1",
      startTime: 1.25,
      duration: 2.5,
      trimIn: 0,
      trimOut: 2.5,
      textConfig: {
        text: "  Legacy HELLO  ",
        color: "#ABCDEF",
      },
    });

    const result = validateProjectStructure(p);
    const clip = getTrack(result, "track-t1").clips[0] as any;

    expect({
      id: clip.id,
      trackId: clip.trackId,
      startTime: clip.startTime,
      duration: clip.duration,
      trimIn: clip.trimIn,
      trimOut: clip.trimOut,
      volume: clip.volume,
      speed: clip.speed,
      textConfig: clip.textConfig,
    }).toMatchInlineSnapshot(`
      {
        "duration": 2.5,
        "id": "text-legacy-1",
        "speed": 1,
        "startTime": 1.25,
        "textConfig": {
          "backgroundColor": "transparent",
          "color": "#abcdef",
          "effect": "none",
          "effectColor": "#000000",
          "fontFamily": "Noto Sans",
          "fontSize": 48,
          "fontStyle": "normal",
          "fontWeight": 700,
          "text": "Legacy HELLO",
          "textAlign": "center",
        },
        "trackId": "track-t1",
        "trimIn": 0,
        "trimOut": 2.5,
        "volume": 0,
      }
    `);
  });

  it("rejects unsupported text effects under strict parity", () => {
    const p = validProject();
    getTrack(p, "track-t1").clips.push({
      id: "text-1",
      assetId: "text-asset-1",
      trackId: "track-t1",
      startTime: 0,
      duration: 3,
      trimIn: 0,
      trimOut: 3,
      textConfig: {
        text: "Hello",
        effect: "typewriter",
      },
    });

    expect(() => validateProjectStructure(p)).toThrow("not supported in strict_parity mode");
  });

  it("rejects duplicate text keyframe timestamps", () => {
    const p = validProject();
    getTrack(p, "track-t1").clips.push({
      id: "text-1",
      assetId: "text-asset-1",
      trackId: "track-t1",
      startTime: 0,
      duration: 3,
      trimIn: 0,
      trimOut: 3,
      textConfig: {
        text: "Hello",
      },
      transform: {
        x: 0.5,
        y: 0.5,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        keyframes: [
          { time: 0.5, x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
          { time: 0.5, x: 0.6, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
        ],
      },
    });

    expect(() => validateProjectStructure(p)).toThrow("unique time markers");
  });

  it("normalizes and preserves per-property easing overrides on text keyframes", () => {
    const p = validProject();
    getTrack(p, "track-t1").clips.push({
      id: "text-1",
      assetId: "text-asset-1",
      trackId: "track-t1",
      startTime: 0,
      duration: 3,
      trimIn: 0,
      trimOut: 3,
      textConfig: {
        text: "Hello",
      },
      transform: {
        x: 0.5,
        y: 0.5,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        keyframes: [
          {
            time: 0.5,
            x: 0.5,
            y: 0.5,
            scaleX: 1.2,
            scaleY: 1.2,
            rotation: 15,
            opacity: 0.8,
            easing: "ease-in-out",
            easingOverrides: {
              x: "ease-out",
              scaleX: "ease-in",
              opacity: "invalid-mode",
              unknownProperty: "ease-in",
            },
          },
        ],
      },
    });

    const result = validateProjectStructure(p);
    const keyframe = getTrack(result, "track-t1").clips[0].transform.keyframes[0] as any;

    expect(keyframe.easing).toBe("ease-in-out");
    expect(keyframe.easingOverrides).toEqual({
      x: "ease-out",
      scaleX: "ease-in",
    });
  });
});

// ========================================
// Asset validation
// ========================================

describe("validateProjectStructure — assets", () => {
  it("rejects invalid asset type", () => {
    const p = validProject();
    p.assets["a1"] = {
      id: "a1",
      type: "document",
      source: "imported",
      path: "/test.doc",
      filename: "test.doc",
      format: "doc",
      duration: 0,
    };
    expect(() => validateProjectStructure(p)).toThrow(
      'Asset type must be "video", "audio", or "image"',
    );
  });

  it("rejects asset with empty path", () => {
    const p = validProject();
    p.assets["a1"] = {
      id: "a1",
      type: "video",
      source: "imported",
      path: "",
      filename: "v.mp4",
      format: "mp4",
      duration: 10,
    };
    expect(() => validateProjectStructure(p)).toThrow("must have valid path");
  });

  it("rejects asset with path traversal (..)", () => {
    const p = validProject();
    p.assets["a1"] = {
      id: "a1",
      type: "video",
      source: "imported",
      path: "../../etc/passwd",
      filename: "passwd",
      format: "txt",
      duration: 0,
    };
    expect(() => validateProjectStructure(p)).toThrow("Invalid asset path");
  });

  it("rejects asset with null byte in path", () => {
    const p = validProject();
    p.assets["a1"] = {
      id: "a1",
      type: "video",
      source: "imported",
      path: "/video\0.mp4",
      filename: "video.mp4",
      format: "mp4",
      duration: 10,
    };
    expect(() => validateProjectStructure(p)).toThrow("Invalid asset path");
  });

  it("rejects more than 500 assets", () => {
    const p = validProject();
    for (let i = 0; i < 501; i++) {
      p.assets[`a${i}`] = {
        id: `a${i}`,
        type: "video",
        source: "imported",
        path: `/video${i}.mp4`,
        filename: `video${i}.mp4`,
        format: "mp4",
        duration: 1,
      };
    }
    expect(() => validateProjectStructure(p)).toThrow("Too many assets");
  });

  it("accepts valid video, audio, and image assets", () => {
    const p = validProject();
    p.assets["v1"] = {
      id: "v1",
      type: "video",
      source: "imported",
      path: "/video.mp4",
      filename: "video.mp4",
      format: "mp4",
      duration: 10,
    };
    p.assets["a1"] = {
      id: "a1",
      type: "audio",
      source: "imported",
      path: "/audio.wav",
      filename: "audio.wav",
      format: "wav",
      duration: 30,
    };
    p.assets["i1"] = {
      id: "i1",
      type: "image",
      source: "imported",
      path: "/image.png",
      filename: "image.png",
      format: "png",
      duration: 0,
    };
    expect(() => validateProjectStructure(p)).not.toThrow();
  });

  it("accepts generated text placeholder asset with empty path", () => {
    const p = validProject();
    p.assets["txt1"] = {
      id: "txt1",
      type: "image",
      source: "generated",
      path: "",
      filename: "Text",
      format: "text",
      duration: 5,
    };
    expect(() => validateProjectStructure(p)).not.toThrow();
  });
});

// ========================================
// Export settings validation
// ========================================

describe("validateProjectStructure — export settings", () => {
  it("rejects missing export object", () => {
    const p = validProject();
    delete p.export;
    expect(() => validateProjectStructure(p)).toThrow("Missing export settings");
  });

  it("rejects bitrate < 1000", () => {
    const p = validProject();
    p.export.bitrate = 500;
    expect(() => validateProjectStructure(p)).toThrow(
      "Video bitrate must be 1000-50000",
    );
  });

  it("rejects bitrate > 50000", () => {
    const p = validProject();
    p.export.bitrate = 60000;
    expect(() => validateProjectStructure(p)).toThrow(
      "Video bitrate must be 1000-50000",
    );
  });

  it("rejects audioBitrate < 64", () => {
    const p = validProject();
    p.export.audioBitrate = 32;
    expect(() => validateProjectStructure(p)).toThrow(
      "Audio bitrate must be 64-320",
    );
  });

  it("rejects audioBitrate > 320", () => {
    const p = validProject();
    p.export.audioBitrate = 512;
    expect(() => validateProjectStructure(p)).toThrow(
      "Audio bitrate must be 64-320",
    );
  });

  it("accepts boundary export values", () => {
    const p = validProject();
    p.export.bitrate = 1000;
    p.export.audioBitrate = 64;
    expect(() => validateProjectStructure(p)).not.toThrow();

    const p2 = validProject();
    p2.export.bitrate = 50000;
    p2.export.audioBitrate = 320;
    expect(() => validateProjectStructure(p2)).not.toThrow();
  });
});

// ========================================
// XSS sanitization
// ========================================

describe("validateProjectStructure — XSS sanitization", () => {
  it("sanitizes project name with HTML tags", () => {
    const p = validProject();
    p.name = '<script>alert("xss")</script>';
    const result = validateProjectStructure(p);
    expect(result.name).not.toContain("<script>");
    expect(result.name).toContain("&lt;");
    expect(result.name).toContain("&gt;");
  });

  it("sanitizes project name with quotes", () => {
    const p = validProject();
    p.name = 'Test "project\' name';
    const result = validateProjectStructure(p);
    expect(result.name).not.toContain('"');
    expect(result.name).not.toContain("'");
    expect(result.name).toContain("&quot;");
    expect(result.name).toContain("&#x27;");
  });

  it("sanitizes forward slashes in name", () => {
    const p = validProject();
    p.name = "path/traversal/attempt";
    const result = validateProjectStructure(p);
    expect(result.name).not.toContain("/");
    expect(result.name).toContain("&#x2F;");
  });
});
