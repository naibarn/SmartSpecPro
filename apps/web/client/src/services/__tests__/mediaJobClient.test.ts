import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MediaJobClient,
  createMediaJobClient,
  type IEngineAdapter,
} from "../mediaJobClient";
import type {
  MediaJobSpec,
  MediaJobProgress,
} from "@shared/types/mediaJob";

class MockEngineAdapter implements IEngineAdapter {
  submitJobCalls: MediaJobSpec[] = [];
  getStatusCalls: string[] = [];
  cancelJobCalls: string[] = [];
  progressSubscriptions: Map<string, (p: MediaJobProgress) => void> = new Map();

  private statusSequence: MediaJobProgress[] = [];
  private statusIndex = 0;

  setStatusSequence(seq: MediaJobProgress[]) {
    this.statusSequence = seq;
    this.statusIndex = 0;
  }

  async submitJob(spec: MediaJobSpec): Promise<string> {
    this.submitJobCalls.push(spec);
    return spec.jobId;
  }

  async getStatus(jobId: string): Promise<MediaJobProgress> {
    this.getStatusCalls.push(jobId);
    if (this.statusIndex < this.statusSequence.length) {
      return this.statusSequence[this.statusIndex++];
    }
    return {
      jobId,
      status: "done",
      progress: 1.0,
    };
  }

  async cancelJob(jobId: string): Promise<void> {
    this.cancelJobCalls.push(jobId);
  }

  onProgress(
    jobId: string,
    callback: (progress: MediaJobProgress) => void,
  ): () => void {
    this.progressSubscriptions.set(jobId, callback);
    return () => {
      this.progressSubscriptions.delete(jobId);
    };
  }
}

describe("MediaJobClient", () => {
  let mockAdapter: MockEngineAdapter;
  let client: MediaJobClient;

  beforeEach(() => {
    mockAdapter = new MockEngineAdapter();
    client = new MediaJobClient(mockAdapter);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("submitJob calls adapter.submitJob with correct spec", async () => {
    const spec: MediaJobSpec = {
      specVersion: "0.1",
      jobId: "job-1",
      jobType: "probe",
      inputs: {
        assets: [{ assetId: "a1", kind: "video", uri: "file:///test.mp4" }],
      },
      output: { mode: "memory", target: "" },
    };

    const jobId = await client.submitJob(spec);
    expect(jobId).toBe("job-1");
    expect(mockAdapter.submitJobCalls).toHaveLength(1);
    expect(mockAdapter.submitJobCalls[0].jobType).toBe("probe");
  });

  it("waitForCompletion resolves when status is done", async () => {
    mockAdapter.setStatusSequence([
      { jobId: "j1", status: "running", progress: 0.5 },
      { jobId: "j1", status: "done", progress: 1.0 },
    ]);

    const promise = client.waitForCompletion("j1");
    await vi.advanceTimersByTimeAsync(3100);
    await vi.advanceTimersByTimeAsync(3100);
    const result = await promise;
    expect(result.status).toBe("done");
  });

  it("waitForCompletion rejects when status is error", async () => {
    mockAdapter.setStatusSequence([
      { jobId: "j1", status: "running", progress: 0.3 },
      {
        jobId: "j1",
        status: "error",
        progress: 0.3,
        message: "FFmpeg failed",
      },
    ]);

    const promise = client.waitForCompletion("j1");
    // Attach rejection assertion before advancing timers to prevent unhandled rejection
    const assertion = expect(promise).rejects.toThrow(/FFmpeg failed/i);
    await vi.advanceTimersByTimeAsync(3100);
    await vi.advanceTimersByTimeAsync(3100);
    await assertion;
  });

  it("waitForCompletion calls onProgress callback", async () => {
    const progressCalls: MediaJobProgress[] = [];
    mockAdapter.setStatusSequence([
      { jobId: "j1", status: "running", progress: 0.25 },
      { jobId: "j1", status: "running", progress: 0.75 },
      { jobId: "j1", status: "done", progress: 1.0 },
    ]);

    const promise = client.waitForCompletion("j1", (p) =>
      progressCalls.push(p),
    );
    await vi.advanceTimersByTimeAsync(3100);
    await vi.advanceTimersByTimeAsync(3100);
    await vi.advanceTimersByTimeAsync(3100);
    await promise;
    expect(progressCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("cancelJob calls adapter.cancelJob", async () => {
    await client.cancelJob("j1");
    expect(mockAdapter.cancelJobCalls).toContain("j1");
  });

  it("probe convenience method builds correct job spec", async () => {
    mockAdapter.setStatusSequence([
      { jobId: "any", status: "done", progress: 1.0 },
    ]);

    const promise = client.probe("file:///test.mp4");
    await vi.advanceTimersByTimeAsync(3100);
    await promise;

    expect(mockAdapter.submitJobCalls).toHaveLength(1);
    const spec = mockAdapter.submitJobCalls[0];
    expect(spec.jobType).toBe("probe");
    expect(spec.specVersion).toBe("0.1");
    expect(spec.inputs.assets?.[0].uri).toBe("file:///test.mp4");
    expect(spec.output.mode).toBe("memory");
  });

  it("renderMp4 convenience method builds correct job spec with timeline", async () => {
    mockAdapter.setStatusSequence([
      { jobId: "any", status: "done", progress: 1.0 },
    ]);

    const timeline = {
      projectId: "p1",
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [],
    };

    const promise = client.renderMp4(timeline, "/tmp/out.mp4");
    await vi.advanceTimersByTimeAsync(3100);
    await promise;

    const spec = mockAdapter.submitJobCalls[0];
    expect(spec.jobType).toBe("render_mp4_h264");
    expect(spec.inputs.project).toEqual(timeline);
    expect(spec.output.target).toBe("/tmp/out.mp4");
  });

  it("getWaveformPeaks convenience method builds correct job spec", async () => {
    mockAdapter.setStatusSequence([
      { jobId: "any", status: "done", progress: 1.0 },
    ]);

    const promise = client.getWaveformPeaks("file:///test.wav", 50);
    await vi.advanceTimersByTimeAsync(3100);
    await promise;

    const spec = mockAdapter.submitJobCalls[0];
    expect(spec.jobType).toBe("waveform_peaks");
    expect(spec.params?.bucketMs).toBe(50);
    expect(spec.inputs.assets?.[0].uri).toBe("file:///test.wav");
  });

  it("detectDeadAir convenience method builds correct job spec", async () => {
    mockAdapter.setStatusSequence([
      { jobId: "any", status: "done", progress: 1.0 },
    ]);

    const promise = client.detectDeadAir("file:///test.wav", {
      thresholdDb: -35,
      minSilenceMs: 800,
    });
    await vi.advanceTimersByTimeAsync(3100);
    await promise;

    const spec = mockAdapter.submitJobCalls[0];
    expect(spec.jobType).toBe("dead_air_detect");
    expect(spec.params?.thresholdDb).toBe(-35);
    expect(spec.params?.minSilenceMs).toBe(800);
  });

  it("detectDeadAir uses default params when none provided", async () => {
    mockAdapter.setStatusSequence([
      { jobId: "any", status: "done", progress: 1.0 },
    ]);

    const promise = client.detectDeadAir("file:///test.wav");
    await vi.advanceTimersByTimeAsync(3100);
    await promise;

    const spec = mockAdapter.submitJobCalls[0];
    expect(spec.params?.thresholdDb).toBe(-40);
    expect(spec.params?.minSilenceMs).toBe(500);
  });

  it("cutDeadAir convenience method builds correct job spec", async () => {
    mockAdapter.setStatusSequence([
      { jobId: "any", status: "done", progress: 1.0 },
    ]);

    const segments = [
      { startMs: 0, endMs: 2000 },
      { startMs: 5000, endMs: 7000 },
    ];
    const promise = client.cutDeadAir("file:///test.mp4", segments, "remove");
    await vi.advanceTimersByTimeAsync(3100);
    await promise;

    const spec = mockAdapter.submitJobCalls[0];
    expect(spec.jobType).toBe("dead_air_cut");
    expect(spec.params?.segments).toEqual(segments);
    expect(spec.params?.mode).toBe("remove");
    expect(spec.inputs.assets?.[0].uri).toBe("file:///test.mp4");
  });

  it("cutDeadAir defaults to remove mode", async () => {
    mockAdapter.setStatusSequence([
      { jobId: "any", status: "done", progress: 1.0 },
    ]);

    const promise = client.cutDeadAir("file:///test.mp4", []);
    await vi.advanceTimersByTimeAsync(3100);
    await promise;

    const spec = mockAdapter.submitJobCalls[0];
    expect(spec.params?.mode).toBe("remove");
  });

  it("getThumbnails convenience method builds correct job spec", async () => {
    mockAdapter.setStatusSequence([
      { jobId: "any", status: "done", progress: 1.0 },
    ]);

    const promise = client.getThumbnails("file:///test.mp4", 3000);
    await vi.advanceTimersByTimeAsync(3100);
    await promise;

    const spec = mockAdapter.submitJobCalls[0];
    expect(spec.jobType).toBe("thumbnails");
    expect(spec.params?.intervalMs).toBe(3000);
    expect(spec.inputs.assets?.[0].uri).toBe("file:///test.mp4");
    expect(spec.output.mode).toBe("dir");
  });

  it("getThumbnails defaults to 5000ms interval", async () => {
    mockAdapter.setStatusSequence([
      { jobId: "any", status: "done", progress: 1.0 },
    ]);

    const promise = client.getThumbnails("file:///test.mp4");
    await vi.advanceTimersByTimeAsync(3100);
    await promise;

    const spec = mockAdapter.submitJobCalls[0];
    expect(spec.params?.intervalMs).toBe(5000);
  });

  it("extractSubtitles convenience method builds correct job spec", async () => {
    mockAdapter.setStatusSequence([
      { jobId: "any", status: "done", progress: 1.0 },
    ]);

    const promise = client.extractSubtitles("file:///test.mp4", "vtt");
    await vi.advanceTimersByTimeAsync(3100);
    await promise;

    const spec = mockAdapter.submitJobCalls[0];
    expect(spec.jobType).toBe("subtitles_extract");
    expect(spec.params?.format).toBe("vtt");
  });

  it("extractSubtitles defaults to srt format", async () => {
    mockAdapter.setStatusSequence([
      { jobId: "any", status: "done", progress: 1.0 },
    ]);

    const promise = client.extractSubtitles("file:///test.mp4");
    await vi.advanceTimersByTimeAsync(3100);
    await promise;

    const spec = mockAdapter.submitJobCalls[0];
    expect(spec.params?.format).toBe("srt");
  });

  it("concat convenience method builds correct multi-clip spec", async () => {
    mockAdapter.setStatusSequence([
      { jobId: "any", status: "done", progress: 1.0 },
    ]);

    const clips = [
      { uri: "file:///a.mp4", inMs: 0, outMs: 5000 },
      { uri: "file:///b.mp4" },
      { uri: "file:///c.mp4", inMs: 1000, outMs: 4000 },
    ];

    const promise = client.concat(clips, "concat_reencode");
    await vi.advanceTimersByTimeAsync(3100);
    await promise;

    const spec = mockAdapter.submitJobCalls[0];
    expect(spec.jobType).toBe("concat");
    expect(spec.inputs.assets).toHaveLength(3);
    expect(spec.inputs.assets?.[0].assetId).toBe("clip-0");
    expect(spec.inputs.assets?.[1].assetId).toBe("clip-1");
    expect(spec.inputs.assets?.[2].assetId).toBe("clip-2");
    expect(spec.params?.strategy).toBe("concat_reencode");
  });

  it("submitJob auto-generates jobId when empty", async () => {
    const spec: MediaJobSpec = {
      specVersion: "0.1",
      jobId: "",
      jobType: "probe",
      inputs: { assets: [] },
      output: { mode: "memory", target: "" },
    };

    await client.submitJob(spec);
    expect(mockAdapter.submitJobCalls[0].jobId).toBeTruthy();
    expect(mockAdapter.submitJobCalls[0].jobId.length).toBeGreaterThan(0);
  });

  it("submitJob auto-sets specVersion when falsy", async () => {
    const spec = {
      specVersion: undefined as any,
      jobId: "test-id",
      jobType: "probe" as const,
      inputs: { assets: [] },
      output: { mode: "memory" as const, target: "" },
    };

    await client.submitJob(spec);
    expect(mockAdapter.submitJobCalls[0].specVersion).toBe("0.1");
  });

  it("renderMp4 passes optional render params", async () => {
    mockAdapter.setStatusSequence([
      { jobId: "any", status: "done", progress: 1.0 },
    ]);

    const timeline = {
      projectId: "p1",
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [],
    };

    const promise = client.renderMp4(timeline, "/out.mp4", {
      codec: "libx265",
      bitrate: 8000,
      audioBitrate: 256,
    });
    await vi.advanceTimersByTimeAsync(3100);
    await promise;

    const spec = mockAdapter.submitJobCalls[0];
    expect(spec.params?.codec).toBe("libx265");
    expect(spec.params?.bitrate).toBe(8000);
    expect(spec.params?.audioBitrate).toBe(256);
  });

  it("getWaveformPeaks uses default bucketMs when not specified", async () => {
    mockAdapter.setStatusSequence([
      { jobId: "any", status: "done", progress: 1.0 },
    ]);

    const promise = client.getWaveformPeaks("file:///test.wav");
    await vi.advanceTimersByTimeAsync(3100);
    await promise;

    const spec = mockAdapter.submitJobCalls[0];
    expect(spec.params?.bucketMs).toBe(100);
  });
});

describe("createMediaJobClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a MediaJobClient instance", async () => {
    const client = await createMediaJobClient();
    expect(client).toBeInstanceOf(MediaJobClient);
  });
});
