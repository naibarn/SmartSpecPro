/**
 * MockEngineAdapter for integration testing.
 * Allows tests to script job status progression and capture submitted specs.
 */

import type { IEngineAdapter } from "../mediaJobClient";
import type {
  MediaJobSpec,
  MediaJobProgress,
  MediaJobResult,
  MediaJobError,
} from "@shared/types/mediaJob";

export class MockEngineAdapter implements IEngineAdapter {
  /** All specs submitted to this adapter */
  submittedSpecs: MediaJobSpec[] = [];
  /** Canceled job IDs */
  canceledJobs: string[] = [];

  private progressions = new Map<string, MediaJobProgress[]>();
  private results = new Map<string, MediaJobResult>();
  private errors = new Map<string, MediaJobError>();
  private callbacks = new Map<string, Set<(p: MediaJobProgress) => void>>();

  /** Configure what status sequence a job goes through */
  setJobProgression(jobId: string, steps: MediaJobProgress[]): void {
    this.progressions.set(jobId, steps);
  }

  /** Configure the final result for a job */
  setJobResult(jobId: string, result: MediaJobResult): void {
    this.results.set(jobId, result);
  }

  /** Configure an error for a job */
  setJobError(jobId: string, error: MediaJobError): void {
    this.errors.set(jobId, error);
  }

  async submitJob(spec: MediaJobSpec): Promise<string> {
    this.submittedSpecs.push(spec);

    // Auto-emit progression via microtasks
    const steps = this.progressions.get(spec.jobId);
    if (steps) {
      queueMicrotask(() => this._emitProgression(spec.jobId, steps));
    }

    return spec.jobId;
  }

  async getStatus(jobId: string): Promise<MediaJobProgress> {
    const steps = this.progressions.get(jobId);
    if (steps && steps.length > 0) {
      return steps[steps.length - 1];
    }
    return { jobId, status: "queued", progress: 0 };
  }

  async cancelJob(jobId: string): Promise<void> {
    this.canceledJobs.push(jobId);
    // Remove pending steps
    this.progressions.delete(jobId);
    // Notify callbacks about cancellation
    const cbs = this.callbacks.get(jobId);
    if (cbs) {
      const cancelProgress: MediaJobProgress = {
        jobId,
        status: "canceled",
        progress: 0,
        message: "Canceled",
      };
      for (const cb of cbs) {
        cb(cancelProgress);
      }
    }
  }

  onProgress(
    jobId: string,
    callback: (progress: MediaJobProgress) => void,
  ): () => void {
    if (!this.callbacks.has(jobId)) {
      this.callbacks.set(jobId, new Set());
    }
    this.callbacks.get(jobId)!.add(callback);

    return () => {
      this.callbacks.get(jobId)?.delete(callback);
    };
  }

  private _emitProgression(jobId: string, steps: MediaJobProgress[]): void {
    const cbs = this.callbacks.get(jobId);
    if (!cbs || cbs.size === 0) return;

    let i = 0;
    const emit = () => {
      if (i >= steps.length) return;
      const step = steps[i++];
      for (const cb of cbs) {
        cb(step);
      }
      if (i < steps.length) {
        queueMicrotask(emit);
      }
    };
    emit();
  }
}
