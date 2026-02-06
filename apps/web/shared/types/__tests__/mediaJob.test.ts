import { describe, it, expect } from "vitest";
import {
  validateJobSpec,
  projectToTimeline,
  timelineToProject,
  msToSeconds,
  secondsToMs,
  VALID_JOB_TYPES,
} from "../mediaJob";
import type {
  MediaJobSpec,
  MediaAsset,
  MediaTimeline,
  MediaTrack,
  MediaClip,
  MediaJobProgress,
  MediaJobResult,
  MediaJobError,
  MediaArtifact,
  MediaJobType,
  MediaJobStatus,
  MediaStream,
} from "../mediaJob";
import type { VideoEditorProject } from "../../../client/src/types/videoEditor";
import { createEmptyProject } from "../../../client/src/types/videoEditor";

function makeMinimalSpec(
  overrides: Partial<MediaJobSpec> = {},
): MediaJobSpec {
  return {
    specVersion: "0.1",
    jobId: "job-001",
    jobType: "probe",
    inputs: {
      assets: [
        {
          assetId: "a1",
          kind: "video",
          uri: "file:///tmp/test.mp4",
        },
      ],
    },
    output: { mode: "file", target: "/tmp/out.json" },
    ...overrides,
  };
}

function makeRenderSpec(): MediaJobSpec {
  return {
    specVersion: "0.1",
    jobId: "job-002",
    jobType: "render_mp4_h264",
    inputs: {
      assets: [
        { assetId: "a1", kind: "video", uri: "file:///tmp/test.mp4" },
      ],
      project: {
        projectId: "proj-1",
        fps: 30,
        width: 1920,
        height: 1080,
        tracks: [
          {
            trackId: "t1",
            type: "video",
            clips: [
              {
                clipId: "c1",
                assetId: "a1",
                startMs: 0,
                inMs: 0,
                outMs: 5000,
              },
            ],
          },
        ],
      },
    },
    output: { mode: "file", target: "/tmp/out.mp4" },
  };
}

describe("validateJobSpec", () => {
  it("accepts a valid probe job spec", () => {
    const result = validateJobSpec(makeMinimalSpec());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts a valid render_mp4_h264 job spec", () => {
    const result = validateJobSpec(makeRenderSpec());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects missing jobType", () => {
    const spec = makeMinimalSpec();
    // @ts-expect-error testing invalid input
    delete spec.jobType;
    const result = validateJobSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /jobType/i.test(e))).toBe(true);
  });

  it("rejects missing specVersion", () => {
    const spec = makeMinimalSpec();
    // @ts-expect-error testing invalid input
    delete spec.specVersion;
    const result = validateJobSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /specVersion/i.test(e))).toBe(true);
  });

  it("rejects outMs <= inMs on a clip", () => {
    const spec = makeRenderSpec();
    spec.inputs.project!.tracks[0].clips[0].inMs = 5000;
    spec.inputs.project!.tracks[0].clips[0].outMs = 3000;
    const result = validateJobSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /outMs.*inMs/i.test(e))).toBe(true);
  });

  it("rejects bucketMs outside 10-500 range", () => {
    const spec = makeMinimalSpec({
      jobType: "waveform_peaks",
      params: { bucketMs: 5 },
    });
    const result = validateJobSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /bucketMs/i.test(e))).toBe(true);

    const spec2 = makeMinimalSpec({
      jobType: "waveform_peaks",
      params: { bucketMs: 600 },
    });
    const result2 = validateJobSpec(spec2);
    expect(result2.valid).toBe(false);
    expect(result2.errors.some((e) => /bucketMs/i.test(e))).toBe(true);
  });

  it("rejects unknown jobType", () => {
    const spec = makeMinimalSpec();
    // @ts-expect-error testing invalid input
    spec.jobType = "unknown_type";
    const result = validateJobSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /jobType/i.test(e))).toBe(true);
  });

  it("rejects invalid URI format (contains shell chars)", () => {
    const spec = makeMinimalSpec({
      inputs: {
        assets: [
          {
            assetId: "a1",
            kind: "video",
            uri: "file:///tmp/test.mp4; rm -rf /",
          },
        ],
      },
    });
    const result = validateJobSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /uri/i.test(e))).toBe(true);
  });

  it("accepts valid bucketMs in range", () => {
    const spec = makeMinimalSpec({
      jobType: "waveform_peaks",
      params: { bucketMs: 100 },
    });
    const result = validateJobSpec(spec);
    expect(result.valid).toBe(true);
  });

  it("rejects segmentSeconds outside 2-10 range", () => {
    const spec = makeMinimalSpec({
      jobType: "render_hls",
      params: { segmentSeconds: 1 },
    });
    const result = validateJobSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /segmentSeconds/i.test(e))).toBe(true);
  });
});

describe("projectToTimeline", () => {
  it("converts seconds to ms correctly", () => {
    const project = createEmptyProject("Test");
    project.timeline.tracks[0].clips.push({
      id: "clip-1",
      assetId: "asset-1",
      trackId: "track-v1",
      startTime: 1.5,
      duration: 3.0,
      trimIn: 0.5,
      trimOut: 4.0,
      volume: 0.8,
      speed: 1.0,
      effects: [],
    });

    const timeline = projectToTimeline(project);
    const clip = timeline.tracks[0].clips[0];

    expect(clip.startMs).toBe(1500);
    expect(clip.inMs).toBe(500);
    expect(clip.outMs).toBe(4000);
    expect(timeline.fps).toBe(30);
    expect(timeline.width).toBe(1920);
    expect(timeline.height).toBe(1080);
  });

  it("preserves all track and clip data", () => {
    const project = createEmptyProject("Multi");
    project.timeline.tracks[0].clips.push({
      id: "clip-v1",
      assetId: "asset-v1",
      trackId: "track-v1",
      startTime: 0,
      duration: 5.0,
      trimIn: 0,
      trimOut: 5.0,
      volume: 1.0,
      speed: 1.5,
      effects: [],
    });
    project.timeline.tracks[1].clips.push({
      id: "clip-a1",
      assetId: "asset-a1",
      trackId: "track-a1",
      startTime: 0,
      duration: 5.0,
      trimIn: 0,
      trimOut: 5.0,
      volume: 0.6,
      speed: 1.0,
      effects: [],
    });

    const timeline = projectToTimeline(project);

    expect(timeline.tracks).toHaveLength(2);
    expect(timeline.tracks[0].trackId).toBe("track-v1");
    expect(timeline.tracks[0].type).toBe("video");
    expect(timeline.tracks[0].clips[0].clipId).toBe("clip-v1");
    expect(timeline.tracks[0].clips[0].assetId).toBe("asset-v1");
    expect(timeline.tracks[0].clips[0].playbackRate).toBe(1.5);
    expect(timeline.tracks[0].clips[0].volume).toBe(1.0);

    expect(timeline.tracks[1].trackId).toBe("track-a1");
    expect(timeline.tracks[1].type).toBe("audio");
    expect(timeline.tracks[1].clips[0].clipId).toBe("clip-a1");
    expect(timeline.tracks[1].clips[0].volume).toBe(0.6);
  });

  it("maps overlay track type to video", () => {
    const project = createEmptyProject("Overlay");
    project.timeline.tracks.push({
      id: "track-ov1",
      type: "overlay",
      name: "OV1",
      clips: [],
      muted: false,
      locked: false,
    });

    const timeline = projectToTimeline(project);
    const overlayTrack = timeline.tracks.find(
      (t) => t.trackId === "track-ov1",
    );
    expect(overlayTrack).toBeDefined();
    expect(overlayTrack!.type).toBe("video");
  });
});

describe("timelineToProject", () => {
  it("converts ms to seconds correctly", () => {
    const timeline: MediaTimeline = {
      projectId: "proj-1",
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [
        {
          trackId: "t1",
          type: "video",
          clips: [
            {
              clipId: "c1",
              assetId: "a1",
              startMs: 1500,
              inMs: 500,
              outMs: 4000,
            },
          ],
        },
      ],
    };

    const project = timelineToProject(timeline);
    const clip = project.timeline.tracks[0].clips[0];

    expect(clip.startTime).toBe(1.5);
    expect(clip.trimIn).toBe(0.5);
    expect(clip.trimOut).toBe(4.0);
    expect(project.settings.fps).toBe(30);
    expect(project.settings.width).toBe(1920);
    expect(project.settings.height).toBe(1080);
    expect(project.version).toBe("2.0");
  });
});

describe("msToSeconds / secondsToMs", () => {
  it("msToSeconds and secondsToMs are inverse operations", () => {
    const original = 1500;
    expect(secondsToMs(msToSeconds(original))).toBe(original);
    expect(msToSeconds(secondsToMs(1.5))).toBe(1.5);
  });

  it("secondsToMs rounds to avoid floating-point drift", () => {
    expect(secondsToMs(1.0005)).toBe(1001);
    expect(secondsToMs(0.1 + 0.2)).toBe(300);
  });
});

describe("VALID_JOB_TYPES", () => {
  it("exports a non-empty array of job types", () => {
    expect(Array.isArray(VALID_JOB_TYPES)).toBe(true);
    expect(VALID_JOB_TYPES.length).toBeGreaterThan(0);
    expect(VALID_JOB_TYPES).toContain("probe");
    expect(VALID_JOB_TYPES).toContain("render_mp4_h264");
  });
});
