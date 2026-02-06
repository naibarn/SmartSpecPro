import { describe, it, expect, vi, beforeEach } from "vitest";
import { MediaJobClient } from "../mediaJobClient";
import { MockEngineAdapter } from "./MockEngineAdapter";
import type {
  MediaJobProgress,
  MediaTimeline,
} from "@shared/types/mediaJob";

describe("MediaJobClient Integration", () => {
  let adapter: MockEngineAdapter;
  let client: MediaJobClient;

  beforeEach(() => {
    adapter = new MockEngineAdapter();
    client = new MediaJobClient(adapter);
  });

  it("full probe lifecycle — submit, progress, result", async () => {
    // The probe method generates its own jobId internally, so we need to
    // capture it after submission
    const progressCalls: MediaJobProgress[] = [];

    // Set up the adapter to auto-complete any job that comes in
    const originalSubmit = adapter.submitJob.bind(adapter);
    adapter.submitJob = async (spec) => {
      const jobId = await originalSubmit(spec);
      adapter.setJobProgression(jobId, [
        { jobId, status: "queued", progress: 0 },
        { jobId, status: "running", progress: 0.5, stage: "probing" },
        {
          jobId,
          status: "done",
          progress: 1.0,
          derived: {
            duration: 120.5,
            width: 1920,
            height: 1080,
          },
        },
      ]);
      return jobId;
    };

    const result = await client.probe("https://cdn.example.com/clip.mp4");
    expect(result.status).toBe("done");
    expect(adapter.submittedSpecs).toHaveLength(1);
    expect(adapter.submittedSpecs[0].jobType).toBe("probe");
  });

  it("error propagation — adapter returns error status", async () => {
    const originalSubmit = adapter.submitJob.bind(adapter);
    adapter.submitJob = async (spec) => {
      const jobId = await originalSubmit(spec);
      adapter.setJobProgression(jobId, [
        { jobId, status: "queued", progress: 0 },
        {
          jobId,
          status: "error",
          progress: 0,
          message: "FFmpeg crashed: segfault",
        },
      ]);
      return jobId;
    };

    await expect(
      client.probe("https://cdn.example.com/broken.mp4"),
    ).rejects.toThrow(/FFmpeg crashed/);
  });

  it("cancellation flow", async () => {
    const originalSubmit = adapter.submitJob.bind(adapter);
    let capturedJobId = "";

    adapter.submitJob = async (spec) => {
      const jobId = await originalSubmit(spec);
      capturedJobId = jobId;
      // Don't set any progression — job stays queued
      return jobId;
    };

    // Start a probe but don't await it
    const probePromise = client.probe("https://cdn.example.com/clip.mp4");

    // Wait a tick for submission to complete
    await new Promise((r) => setTimeout(r, 10));

    // Cancel the job
    await client.cancelJob(capturedJobId);

    expect(adapter.canceledJobs).toContain(capturedJobId);
  });

  it("convenience method — probe builds correct spec", async () => {
    const originalSubmit = adapter.submitJob.bind(adapter);
    adapter.submitJob = async (spec) => {
      const jobId = await originalSubmit(spec);
      adapter.setJobProgression(jobId, [
        { jobId, status: "done", progress: 1 },
      ]);
      return jobId;
    };

    await client.probe("https://cdn.example.com/clip.mp4");

    const spec = adapter.submittedSpecs[0];
    expect(spec.jobType).toBe("probe");
    expect(spec.inputs.assets).toHaveLength(1);
    expect(spec.inputs.assets![0].uri).toBe("https://cdn.example.com/clip.mp4");
    expect(spec.output.mode).toBe("memory");
  });

  it("convenience method — renderMp4 builds correct spec", async () => {
    const originalSubmit = adapter.submitJob.bind(adapter);
    adapter.submitJob = async (spec) => {
      const jobId = await originalSubmit(spec);
      adapter.setJobProgression(jobId, [
        { jobId, status: "done", progress: 1 },
      ]);
      return jobId;
    };

    const timeline: MediaTimeline = {
      projectId: "test-project",
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [],
    };

    await client.renderMp4(timeline, "/tmp/output.mp4", {
      codec: "libx264",
      bitrate: 5000,
    });

    const spec = adapter.submittedSpecs[0];
    expect(spec.jobType).toBe("render_mp4_h264");
    expect(spec.inputs.project).toEqual(timeline);
    expect(spec.output.target).toBe("/tmp/output.mp4");
    expect(spec.params?.codec).toBe("libx264");
  });

  it("convenience method — getWaveformPeaks builds correct spec", async () => {
    const originalSubmit = adapter.submitJob.bind(adapter);
    adapter.submitJob = async (spec) => {
      const jobId = await originalSubmit(spec);
      adapter.setJobProgression(jobId, [
        { jobId, status: "done", progress: 1 },
      ]);
      return jobId;
    };

    await client.getWaveformPeaks("https://cdn.example.com/audio.wav", 50);

    const spec = adapter.submittedSpecs[0];
    expect(spec.jobType).toBe("waveform_peaks");
    expect(spec.params?.bucketMs).toBe(50);
  });

  it("convenience method — detectDeadAir builds correct spec", async () => {
    const originalSubmit = adapter.submitJob.bind(adapter);
    adapter.submitJob = async (spec) => {
      const jobId = await originalSubmit(spec);
      adapter.setJobProgression(jobId, [
        { jobId, status: "done", progress: 1 },
      ]);
      return jobId;
    };

    await client.detectDeadAir("https://cdn.example.com/audio.wav", {
      thresholdDb: -35,
      minSilenceMs: 1000,
    });

    const spec = adapter.submittedSpecs[0];
    expect(spec.jobType).toBe("dead_air_detect");
    expect(spec.params?.thresholdDb).toBe(-35);
    expect(spec.params?.minSilenceMs).toBe(1000);
  });

  it("convenience method — extractSubtitles builds correct spec", async () => {
    const originalSubmit = adapter.submitJob.bind(adapter);
    adapter.submitJob = async (spec) => {
      const jobId = await originalSubmit(spec);
      adapter.setJobProgression(jobId, [
        { jobId, status: "done", progress: 1 },
      ]);
      return jobId;
    };

    await client.extractSubtitles("https://cdn.example.com/video.mp4", "vtt");

    const spec = adapter.submittedSpecs[0];
    expect(spec.jobType).toBe("subtitles_extract");
    expect(spec.params?.format).toBe("vtt");
  });

  it("convenience method — concat builds correct spec", async () => {
    const originalSubmit = adapter.submitJob.bind(adapter);
    adapter.submitJob = async (spec) => {
      const jobId = await originalSubmit(spec);
      adapter.setJobProgression(jobId, [
        { jobId, status: "done", progress: 1 },
      ]);
      return jobId;
    };

    await client.concat(
      [
        { uri: "https://cdn.example.com/a.mp4", inMs: 0, outMs: 5000 },
        { uri: "https://cdn.example.com/b.mp4" },
      ],
      "concat_copy",
    );

    const spec = adapter.submittedSpecs[0];
    expect(spec.jobType).toBe("concat");
    expect(spec.inputs.assets).toHaveLength(2);
    expect(spec.params?.strategy).toBe("concat_copy");
    expect(spec.params?.clips).toEqual([
      { inMs: 0, outMs: 5000 },
      { inMs: undefined, outMs: undefined },
    ]);
  });

  it("waitForCompletion rejects on timeout", async () => {
    const originalSubmit = adapter.submitJob.bind(adapter);
    adapter.submitJob = async (spec) => {
      const jobId = await originalSubmit(spec);
      // Don't set progression — job stays queued, never completes
      return jobId;
    };

    const spec = {
      specVersion: "0.1" as const,
      jobId: "timeout-test",
      jobType: "probe" as const,
      inputs: {
        assets: [
          {
            assetId: "a1",
            kind: "video" as const,
            uri: "https://cdn.example.com/clip.mp4",
          },
        ],
      },
      output: { mode: "memory" as const, target: "" },
    };
    await client.submitJob(spec);

    await expect(
      client.waitForCompletion("timeout-test", undefined, { timeoutMs: 100 }),
    ).rejects.toThrow(/timed out/);
  }, 5000);

  it("waitForCompletion extracts artifacts from result", async () => {
    const originalSubmit = adapter.submitJob.bind(adapter);
    adapter.submitJob = async (spec) => {
      const jobId = await originalSubmit(spec);
      adapter.setJobProgression(jobId, [
        {
          jobId,
          status: "done",
          progress: 1,
          result: {
            artifacts: [
              { kind: "video", uri: "/tmp/out.mp4", mime: "video/mp4" },
            ],
          },
        } as any,
      ]);
      return jobId;
    };

    const result = await client.probe("https://cdn.example.com/clip.mp4");
    expect(result.status).toBe("done");
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].uri).toBe("/tmp/out.mp4");
  });
});
