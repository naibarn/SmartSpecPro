import { describe, it, expect } from "vitest";
import {
  validateJobSpec,
  projectToTimeline,
  timelineToProject,
  msToSeconds,
  secondsToMs,
  MEDIA_TIMELINE_CONTRACT_VERSION,
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
    const videoTrack = project.timeline.tracks.find((t) => t.id === "track-v1")!;
    const audioTrack = project.timeline.tracks.find((t) => t.id === "track-a1")!;
    videoTrack.clips.push({
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
    audioTrack.clips.push({
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

    const mappedVideoTrack = timeline.tracks.find((t) => t.trackId === "track-v1");
    const mappedAudioTrack = timeline.tracks.find((t) => t.trackId === "track-a1");

    expect(timeline.contractVersion).toBe(MEDIA_TIMELINE_CONTRACT_VERSION);
    expect(timeline.tracks.length).toBeGreaterThanOrEqual(4);
    expect(mappedVideoTrack).toBeDefined();
    expect(mappedVideoTrack!.type).toBe("video");
    expect(mappedVideoTrack!.clips[0].clipId).toBe("clip-v1");
    expect(mappedVideoTrack!.clips[0].assetId).toBe("asset-v1");
    expect(mappedVideoTrack!.clips[0].playbackRate).toBe(1.5);
    expect(mappedVideoTrack!.clips[0].volume).toBe(1.0);

    expect(mappedAudioTrack).toBeDefined();
    expect(mappedAudioTrack!.type).toBe("audio");
    expect(mappedAudioTrack!.clips[0].clipId).toBe("clip-a1");
    expect(mappedAudioTrack!.clips[0].volume).toBe(0.6);
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

  it("includes clip transform when present", () => {
    const project = createEmptyProject("Transform");
    project.timeline.tracks[0].clips.push({
      id: "clip-v1",
      assetId: "asset-v1",
      trackId: "track-v1",
      startTime: 0,
      duration: 5.0,
      trimIn: 0,
      trimOut: 5.0,
      volume: 1.0,
      speed: 1.0,
      effects: [],
      transform: {
        x: 0.2,
        y: 0.8,
        scaleX: 1.5,
        scaleY: 1.3,
        rotation: 0,
        opacity: 1,
        keyframes: [],
      },
    });

    const timeline = projectToTimeline(project);
    expect(timeline.tracks[0].clips[0].transform).toMatchObject({
      x: 0.2,
      y: 0.8,
      scaleX: 1.5,
      scaleY: 1.3,
    });
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

  it("restores clip transform from timeline", () => {
    const timeline: MediaTimeline = {
      projectId: "proj-transform",
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
              outMs: 2000,
              transform: {
                x: 0.7,
                y: 0.4,
                scaleX: 2.0,
                scaleY: 1.6,
                rotation: 0,
                opacity: 1,
                keyframes: [],
              },
            },
          ],
        },
      ],
    };

    const project = timelineToProject(timeline);
    expect(project.timeline.tracks[0].clips[0].transform).toMatchObject({
      x: 0.7,
      y: 0.4,
      scaleX: 2.0,
      scaleY: 1.6,
    });
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

  it("contains all 11 defined job types", () => {
    const expected: MediaJobType[] = [
      "probe",
      "render_mp4_h264",
      "render_hls",
      "waveform_peaks",
      "thumbnails",
      "subtitles_extract",
      "subtitles_burnin",
      "concat",
      "dead_air_detect",
      "dead_air_cut",
      "generate_clip_from_api",
      "transcode_h264",
      "extract_audio",
    ];
    for (const type of expected) {
      expect(VALID_JOB_TYPES).toContain(type);
    }
    expect(VALID_JOB_TYPES).toHaveLength(expected.length);
  });
});

// ========================================
// Additional validateJobSpec edge cases
// ========================================

describe("validateJobSpec — additional edge cases", () => {
  it("rejects missing jobId", () => {
    const spec = makeMinimalSpec();
    // @ts-expect-error testing invalid input
    delete spec.jobId;
    const result = validateJobSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /jobId/i.test(e))).toBe(true);
  });

  it("rejects missing inputs", () => {
    const spec = makeMinimalSpec();
    // @ts-expect-error testing invalid input
    delete spec.inputs;
    const result = validateJobSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /inputs/i.test(e))).toBe(true);
  });

  it("rejects missing output", () => {
    const spec = makeMinimalSpec();
    // @ts-expect-error testing invalid input
    delete spec.output;
    const result = validateJobSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /output/i.test(e))).toBe(true);
  });

  it("rejects wrong specVersion value", () => {
    const spec = makeMinimalSpec();
    (spec as any).specVersion = "2.0";
    const result = validateJobSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /specVersion.*0\.1/i.test(e))).toBe(true);
  });

  it("accepts all valid job types", () => {
    for (const jobType of VALID_JOB_TYPES) {
      const spec = makeMinimalSpec({ jobType });
      const result = validateJobSpec(spec);
      // Some job types may have param requirements, but jobType itself should be valid
      expect(result.errors.some((e) => /jobType.*not valid/i.test(e))).toBe(false);
    }
  });

  it("accepts segmentSeconds within range", () => {
    const spec = makeMinimalSpec({
      jobType: "render_hls",
      params: { segmentSeconds: 6 },
    });
    const result = validateJobSpec(spec);
    expect(result.valid).toBe(true);
  });

  it("accepts segmentSeconds at boundaries (2 and 10)", () => {
    const low = makeMinimalSpec({
      jobType: "render_hls",
      params: { segmentSeconds: 2 },
    });
    expect(validateJobSpec(low).valid).toBe(true);

    const high = makeMinimalSpec({
      jobType: "render_hls",
      params: { segmentSeconds: 10 },
    });
    expect(validateJobSpec(high).valid).toBe(true);
  });

  it("accepts bucketMs at boundaries (10 and 500)", () => {
    const low = makeMinimalSpec({
      jobType: "waveform_peaks",
      params: { bucketMs: 10 },
    });
    expect(validateJobSpec(low).valid).toBe(true);

    const high = makeMinimalSpec({
      jobType: "waveform_peaks",
      params: { bucketMs: 500 },
    });
    expect(validateJobSpec(high).valid).toBe(true);
  });

  it("rejects multiple shell metacharacters", () => {
    const metacharTests = [
      "file:///tmp/test.mp4|cat /etc/passwd",
      "file:///tmp/test.mp4&echo pwned",
      "file:///tmp/test.mp4`id`",
      "file:///tmp/$HOME/test.mp4",
      "file:///tmp/test.mp4()",
      "file:///tmp/test.mp4{}",
      "file:///tmp/test.mp4>log",
      "file:///tmp/test.mp4<input",
    ];

    for (const uri of metacharTests) {
      const spec = makeMinimalSpec({
        inputs: {
          assets: [{ assetId: "a1", kind: "video", uri }],
        },
      });
      const result = validateJobSpec(spec);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /metacharacter/i.test(e))).toBe(true);
    }
  });

  it("allows spec with no assets (project-only input)", () => {
    const spec = makeMinimalSpec({
      inputs: {
        project: {
          projectId: "p1",
          fps: 30,
          width: 1920,
          height: 1080,
          tracks: [],
        },
      },
    });
    const result = validateJobSpec(spec);
    expect(result.valid).toBe(true);
  });

  it("validates outMs = inMs as invalid (must be strictly greater)", () => {
    const spec = makeRenderSpec();
    spec.inputs.project!.tracks[0].clips[0].inMs = 3000;
    spec.inputs.project!.tracks[0].clips[0].outMs = 3000;
    const result = validateJobSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /outMs.*inMs/i.test(e))).toBe(true);
  });

  it("reports multiple errors at once", () => {
    const spec = makeMinimalSpec();
    // @ts-expect-error testing invalid input
    delete spec.specVersion;
    // @ts-expect-error testing invalid input
    delete spec.jobType;
    // @ts-expect-error testing invalid input
    delete spec.jobId;
    const result = validateJobSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ========================================
// Additional timelineToProject edge cases
// ========================================

describe("timelineToProject — additional cases", () => {
  it("maps subtitle track type to text", () => {
    const timeline: MediaTimeline = {
      projectId: "p1",
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [
        {
          trackId: "sub-1",
          type: "subtitle",
          clips: [],
        },
      ],
    };

    const project = timelineToProject(timeline);
    expect(project.timeline.tracks[0].type).toBe("text");
  });

  it("handles clips with undefined inMs/outMs", () => {
    const timeline: MediaTimeline = {
      projectId: "p1",
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
              startMs: 2000,
              // No inMs, outMs — should default to 0
            },
          ],
        },
      ],
    };

    const project = timelineToProject(timeline);
    const clip = project.timeline.tracks[0].clips[0];
    expect(clip.startTime).toBe(2);
    expect(clip.trimIn).toBe(0);
    expect(clip.trimOut).toBe(0);
    expect(clip.duration).toBe(0);
  });

  it("preserves default volume and speed when not set", () => {
    const timeline: MediaTimeline = {
      projectId: "p1",
      fps: 24,
      width: 1280,
      height: 720,
      tracks: [
        {
          trackId: "t1",
          type: "audio",
          clips: [
            {
              clipId: "c1",
              assetId: "a1",
              startMs: 0,
              inMs: 0,
              outMs: 10000,
              // No volume, no playbackRate
            },
          ],
        },
      ],
    };

    const project = timelineToProject(timeline);
    const clip = project.timeline.tracks[0].clips[0];
    expect(clip.volume).toBe(1.0);
    expect(clip.speed).toBe(1.0);
  });

  it("sets project name from timeline projectId", () => {
    const timeline: MediaTimeline = {
      projectId: "My Cool Project",
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [],
    };

    const project = timelineToProject(timeline);
    expect(project.name).toBe("My Cool Project");
  });
});

// ========================================
// Additional projectToTimeline edge cases
// ========================================

describe("projectToTimeline — additional cases", () => {
  it("uses project name as projectId", () => {
    const project = createEmptyProject("My Project");
    const timeline = projectToTimeline(project);
    expect(timeline.projectId).toBe("My Project");
  });

  it("converts empty project without errors", () => {
    const project = createEmptyProject();
    const timeline = projectToTimeline(project);
    expect(timeline.tracks).toHaveLength(4);
    expect(timeline.tracks[0].clips).toHaveLength(0);
    expect(timeline.tracks[1].clips).toHaveLength(0);
  });

  it("rejects unsupported future contract version by default", () => {
    const spec = makeRenderSpec();
    spec.inputs.project!.contractVersion = "3.0";
    const result = validateJobSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /Unsupported media timeline contractVersion/i.test(e))).toBe(true);
  });

  it("allows gated downgrade for unsupported future version without text semantics", () => {
    const timeline: MediaTimeline = {
      projectId: "legacy-safe",
      fps: 30,
      width: 1920,
      height: 1080,
      contractVersion: "3.0",
      compatibilityPolicy: { unsupportedContractPolicy: "gated_downgrade" },
      tracks: [
        {
          trackId: "v1",
          type: "video",
          clips: [],
        },
      ],
    };

    expect(() => timelineToProject(timeline)).not.toThrow();
  });

  it("round-trips through projectToTimeline and timelineToProject", () => {
    const project = createEmptyProject("Round Trip");
    project.timeline.tracks[0].clips.push({
      id: "c1",
      assetId: "a1",
      trackId: "track-v1",
      startTime: 2.5,
      duration: 5.0,
      trimIn: 0.5,
      trimOut: 5.5,
      volume: 0.8,
      speed: 1.25,
      effects: [],
    });

    const timeline = projectToTimeline(project);
    const roundTripped = timelineToProject(timeline);

    const originalClip = project.timeline.tracks[0].clips[0];
    const newClip = roundTripped.timeline.tracks[0].clips[0];

    expect(newClip.startTime).toBe(originalClip.startTime);
    expect(newClip.trimIn).toBe(originalClip.trimIn);
    expect(newClip.trimOut).toBe(originalClip.trimOut);
    expect(newClip.volume).toBe(originalClip.volume);
    expect(newClip.speed).toBe(originalClip.speed);
  });
});

// ========================================
// msToSeconds / secondsToMs additional cases
// ========================================

describe("msToSeconds / secondsToMs — additional edge cases", () => {
  it("handles zero correctly", () => {
    expect(msToSeconds(0)).toBe(0);
    expect(secondsToMs(0)).toBe(0);
  });

  it("handles large values", () => {
    expect(msToSeconds(7200000)).toBe(7200);
    expect(secondsToMs(7200)).toBe(7200000);
  });

  it("msToSeconds handles fractional milliseconds", () => {
    expect(msToSeconds(1500)).toBe(1.5);
    expect(msToSeconds(333)).toBeCloseTo(0.333, 3);
  });
});

describe("projectToTimeline — text semantics", () => {
  it("preserves text payload and deterministic z-order metadata", () => {
    const project = createEmptyProject("Text Render");
    const textTrack = project.timeline.tracks.find((track) => track.type === "text");
    expect(textTrack).toBeDefined();

    textTrack!.clips.push(
      {
        id: "txt-1",
        assetId: "asset-text-1",
        trackId: textTrack!.id,
        startTime: 1.0,
        duration: 3.0,
        trimIn: 0,
        trimOut: 3.0,
        volume: 0,
        speed: 1,
        effects: [],
        transform: {
          x: 0.25,
          y: 0.35,
          scaleX: 1.0,
          scaleY: 1.0,
          rotation: 0,
          opacity: 1,
          keyframes: [
            {
              time: 0,
              x: 0.25,
              y: 0.35,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
              opacity: 1,
              easing: "linear",
            },
          ],
        },
        textConfig: {
          text: "Hello",
          fontFamily: "Noto Sans",
          fontSize: 48,
          fontWeight: 700,
          fontStyle: "normal",
          color: "#FFFFFF",
          backgroundColor: "transparent",
          textAlign: "center",
          effect: "none",
        },
      },
      {
        id: "txt-2",
        assetId: "asset-text-2",
        trackId: textTrack!.id,
        startTime: 1.5,
        duration: 2.0,
        trimIn: 0,
        trimOut: 2.0,
        volume: 0,
        speed: 1,
        effects: [],
        transform: {
          x: 0.6,
          y: 0.7,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          opacity: 1,
          keyframes: [],
        },
        textConfig: {
          text: "World",
          fontFamily: "Roboto",
          fontSize: 36,
          fontWeight: 400,
          fontStyle: "italic",
          color: "#FFCC00",
          backgroundColor: "transparent",
          textAlign: "left",
          effect: "shadow",
          effectColor: "#000000",
        },
      },
    );

    const timeline = projectToTimeline(project);
    const subtitleTrack = timeline.tracks.find((track) => track.type === "subtitle");
    expect(subtitleTrack).toBeDefined();
    expect(subtitleTrack!.clips).toHaveLength(2);

    expect(subtitleTrack!.clips[0].clipId).toBe("txt-1");
    expect(subtitleTrack!.clips[0].zOrder).toBe(0);
    expect(subtitleTrack!.clips[0].textConfig?.text).toBe("Hello");
    expect(subtitleTrack!.clips[0].transform?.keyframes?.[0].easing).toBe("linear");

    expect(subtitleTrack!.clips[1].clipId).toBe("txt-2");
    expect(subtitleTrack!.clips[1].zOrder).toBe(1);
    expect(subtitleTrack!.clips[1].textConfig?.fontFamily).toBe("Roboto");
    expect(subtitleTrack!.clips[1].textConfig?.effect).toBe("shadow");
  });
});
