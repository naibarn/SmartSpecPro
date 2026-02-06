import type {
  MediaJobSpec,
  MediaJobProgress,
  MediaJobResult,
  MediaJobError,
  MediaAsset,
  MediaTimeline,
} from "@shared/types/mediaJob";

// ========================================
// Engine Adapter Interface
// ========================================

export interface IEngineAdapter {
  submitJob(spec: MediaJobSpec): Promise<string>;
  getStatus(jobId: string): Promise<MediaJobProgress>;
  cancelJob(jobId: string): Promise<void>;
  onProgress(
    jobId: string,
    callback: (progress: MediaJobProgress) => void,
  ): () => void;
}

// ========================================
// Helper Types for Convenience Methods
// ========================================

export interface RenderParams {
  codec?: string;
  bitrate?: number;
  audioBitrate?: number;
}

export interface WaveformResult {
  bucketMs: number;
  peaks: number[];
  durationMs: number;
}

export interface ThumbnailResult {
  thumbnails: Array<{ timeMs: number; uri: string }>;
}

export interface DeadAirParams {
  thresholdDb?: number;
  minSilenceMs?: number;
}

export interface DeadAirResult {
  silenceSegments: Array<{
    startMs: number;
    endMs: number;
    durationMs: number;
  }>;
  keepSegments: Array<{ startMs: number; endMs: number }>;
}

export interface SilenceSegment {
  startMs: number;
  endMs: number;
}

export interface ConcatClip {
  uri: string;
  inMs?: number;
  outMs?: number;
}

// ========================================
// JobId Generation
// ========================================

function generateJobId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `mj-${crypto.randomUUID()}`;
  }
  return `mj-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// ========================================
// MediaJobClient
// ========================================

export class MediaJobClient {
  private adapter: IEngineAdapter;

  constructor(adapter: IEngineAdapter) {
    this.adapter = adapter;
  }

  async submitJob(spec: MediaJobSpec): Promise<string> {
    if (!spec.jobId) {
      (spec as any).jobId = generateJobId();
    }
    if (!spec.specVersion) {
      (spec as any).specVersion = "0.1";
    }
    return this.adapter.submitJob(spec);
  }

  async waitForCompletion(
    jobId: string,
    onProgress?: (progress: MediaJobProgress) => void,
  ): Promise<MediaJobResult> {
    return new Promise<MediaJobResult>((resolve, reject) => {
      let resolved = false;

      const cleanup = () => {
        resolved = true;
        unsubscribe();
        clearInterval(pollInterval);
      };

      const handleProgress = (p: MediaJobProgress) => {
        if (resolved) return;
        if (onProgress) onProgress(p);
        if (p.status === "done") {
          cleanup();
          resolve({
            jobId,
            status: "done",
            artifacts: [],
            derived: (p as any).derived,
          });
        } else if (p.status === "error") {
          cleanup();
          reject(new Error(p.message || `Job ${jobId} failed with error`));
        }
      };

      const unsubscribe = this.adapter.onProgress(jobId, handleProgress);

      const pollInterval = setInterval(async () => {
        if (resolved) return;
        try {
          const status = await this.adapter.getStatus(jobId);
          handleProgress(status);
        } catch {
          // Retry silently — polling is best-effort
        }
      }, 1000);
    });
  }

  async cancelJob(jobId: string): Promise<void> {
    return this.adapter.cancelJob(jobId);
  }

  // ========================================
  // Convenience Methods
  // ========================================

  async probe(assetUri: string): Promise<MediaJobResult> {
    const jobId = generateJobId();
    const spec: MediaJobSpec = {
      specVersion: "0.1",
      jobId,
      jobType: "probe",
      inputs: {
        assets: [{ assetId: "input", kind: "video", uri: assetUri }],
      },
      output: { mode: "memory", target: "" },
    };
    await this.submitJob(spec);
    return this.waitForCompletion(jobId);
  }

  async renderMp4(
    project: MediaTimeline,
    outputTarget: string,
    params?: RenderParams,
  ): Promise<MediaJobResult> {
    const jobId = generateJobId();
    const spec: MediaJobSpec = {
      specVersion: "0.1",
      jobId,
      jobType: "render_mp4_h264",
      inputs: { project },
      params: params ? { ...params } : undefined,
      output: { mode: "file", target: outputTarget },
    };
    await this.submitJob(spec);
    return this.waitForCompletion(jobId);
  }

  async getWaveformPeaks(
    assetUri: string,
    bucketMs: number = 100,
  ): Promise<MediaJobResult> {
    const jobId = generateJobId();
    const spec: MediaJobSpec = {
      specVersion: "0.1",
      jobId,
      jobType: "waveform_peaks",
      inputs: {
        assets: [{ assetId: "input", kind: "audio", uri: assetUri }],
      },
      params: { bucketMs },
      output: { mode: "memory", target: "" },
    };
    await this.submitJob(spec);
    return this.waitForCompletion(jobId);
  }

  async getThumbnails(
    assetUri: string,
    intervalMs: number = 5000,
  ): Promise<MediaJobResult> {
    const jobId = generateJobId();
    const spec: MediaJobSpec = {
      specVersion: "0.1",
      jobId,
      jobType: "thumbnails",
      inputs: {
        assets: [{ assetId: "input", kind: "video", uri: assetUri }],
      },
      params: { intervalMs },
      output: { mode: "dir", target: "" },
    };
    await this.submitJob(spec);
    return this.waitForCompletion(jobId);
  }

  async detectDeadAir(
    assetUri: string,
    params?: DeadAirParams,
  ): Promise<MediaJobResult> {
    const jobId = generateJobId();
    const spec: MediaJobSpec = {
      specVersion: "0.1",
      jobId,
      jobType: "dead_air_detect",
      inputs: {
        assets: [{ assetId: "input", kind: "audio", uri: assetUri }],
      },
      params: {
        thresholdDb: params?.thresholdDb ?? -40,
        minSilenceMs: params?.minSilenceMs ?? 500,
      },
      output: { mode: "memory", target: "" },
    };
    await this.submitJob(spec);
    return this.waitForCompletion(jobId);
  }

  async cutDeadAir(
    assetUri: string,
    segments: SilenceSegment[],
    mode: "remove" | "compress" = "remove",
  ): Promise<MediaJobResult> {
    const jobId = generateJobId();
    const spec: MediaJobSpec = {
      specVersion: "0.1",
      jobId,
      jobType: "dead_air_cut",
      inputs: {
        assets: [{ assetId: "input", kind: "video", uri: assetUri }],
      },
      params: { segments, mode },
      output: { mode: "file", target: "" },
    };
    await this.submitJob(spec);
    return this.waitForCompletion(jobId);
  }

  async extractSubtitles(
    assetUri: string,
    format: "srt" | "vtt" = "srt",
  ): Promise<MediaJobResult> {
    const jobId = generateJobId();
    const spec: MediaJobSpec = {
      specVersion: "0.1",
      jobId,
      jobType: "subtitles_extract",
      inputs: {
        assets: [{ assetId: "input", kind: "video", uri: assetUri }],
      },
      params: { format },
      output: { mode: "file", target: "" },
    };
    await this.submitJob(spec);
    return this.waitForCompletion(jobId);
  }

  async concat(
    clips: ConcatClip[],
    strategy: "concat_copy" | "concat_reencode" = "concat_reencode",
  ): Promise<MediaJobResult> {
    const jobId = generateJobId();
    const spec: MediaJobSpec = {
      specVersion: "0.1",
      jobId,
      jobType: "concat",
      inputs: {
        assets: clips.map((c, i) => ({
          assetId: `clip-${i}`,
          kind: "video" as const,
          uri: c.uri,
        })),
      },
      params: {
        strategy,
        clips: clips.map((c) => ({ inMs: c.inMs, outMs: c.outMs })),
      },
      output: { mode: "file", target: "" },
    };
    await this.submitJob(spec);
    return this.waitForCompletion(jobId);
  }
}

// ========================================
// Stub Adapter (used when actual adapters not yet available)
// ========================================

class StubEngineAdapter implements IEngineAdapter {
  async submitJob(spec: MediaJobSpec): Promise<string> {
    console.warn("[StubEngineAdapter] No engine adapter available. Job not submitted:", spec.jobId);
    return spec.jobId;
  }
  async getStatus(jobId: string): Promise<MediaJobProgress> {
    return { jobId, status: "error", progress: 0, message: "No engine adapter configured" };
  }
  async cancelJob(): Promise<void> {}
  onProgress(): () => void {
    return () => {};
  }
}

// ========================================
// Factory
// ========================================

export async function createMediaJobClient(): Promise<MediaJobClient> {
  if (typeof window !== "undefined" && (window as any).__TAURI__) {
    try {
      const { TauriEngineAdapter } = await import("./tauriEngineAdapter");
      return new MediaJobClient(new TauriEngineAdapter());
    } catch {
      // TauriEngineAdapter not yet available (section-03)
    }
  } else {
    try {
      const { WebEngineAdapter } = await import("./webEngineAdapter");
      return new MediaJobClient(new WebEngineAdapter());
    } catch {
      // WebEngineAdapter not yet available (section-04)
    }
  }
  // Fallback to stub when adapters are not yet implemented
  return new MediaJobClient(new StubEngineAdapter());
}
