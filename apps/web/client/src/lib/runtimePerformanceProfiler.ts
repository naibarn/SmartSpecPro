export interface RendererPerformanceSnapshot {
  active: boolean;
  sampleCount: number;
  averageFps: number | null;
  averageFrameTimeMs: number | null;
  worstFrameTimeMs: number | null;
  slowFrameCount: number;
  updatedAt: string | null;
}

export interface LocalRuntimeOperationSnapshot {
  operation: string;
  count: number;
  successCount: number;
  errorCount: number;
  averageDurationMs: number;
  p95DurationMs: number;
  lastDurationMs: number;
  lastStatus: "success" | "error";
  updatedAt: string;
}

export interface LocalRuntimePerformanceSnapshot {
  sampleCount: number;
  updatedAt: string | null;
  operations: LocalRuntimeOperationSnapshot[];
}

export interface RuntimePerformanceSnapshot {
  renderer: RendererPerformanceSnapshot;
  localRuntime: LocalRuntimePerformanceSnapshot;
}

interface LocalRuntimeMeasurement {
  operation: string;
  durationMs: number;
  success: boolean;
  updatedAt: string;
}

const MAX_RENDERER_FRAME_SAMPLES = 180;
const MAX_LOCAL_RUNTIME_SAMPLES = 80;
const SLOW_FRAME_THRESHOLD_MS = 1000 / 30;

const EMPTY_RENDERER_SNAPSHOT: RendererPerformanceSnapshot = {
  active: false,
  sampleCount: 0,
  averageFps: null,
  averageFrameTimeMs: null,
  worstFrameTimeMs: null,
  slowFrameCount: 0,
  updatedAt: null,
};

const EMPTY_LOCAL_RUNTIME_SNAPSHOT: LocalRuntimePerformanceSnapshot = {
  sampleCount: 0,
  updatedAt: null,
  operations: [],
};

let snapshot: RuntimePerformanceSnapshot = {
  renderer: EMPTY_RENDERER_SNAPSHOT,
  localRuntime: EMPTY_LOCAL_RUNTIME_SNAPSHOT,
};

const listeners = new Set<() => void>();
let frameSamples: number[] = [];
let lastFrameAt: number | null = null;
let animationFrameId: number | null = null;
let localRuntimeMeasurements: LocalRuntimeMeasurement[] = [];

function nowMs(): number {
  if (
    typeof globalThis.performance !== "undefined" &&
    typeof globalThis.performance.now === "function"
  ) {
    return globalThis.performance.now();
  }
  return Date.now();
}

function emitSnapshot(): void {
  for (const listener of listeners) {
    listener();
  }
}

function roundMetric(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildRendererSnapshot(
  samples: number[],
  active: boolean,
): RendererPerformanceSnapshot {
  if (samples.length === 0) {
    return {
      ...EMPTY_RENDERER_SNAPSHOT,
      active,
    };
  }

  const totalFrameTime = samples.reduce((sum, sample) => sum + sample, 0);
  const averageFrameTimeMs = totalFrameTime / samples.length;
  const worstFrameTimeMs = Math.max(...samples);
  const slowFrameCount = samples.filter(
    (sample) => sample >= SLOW_FRAME_THRESHOLD_MS,
  ).length;

  return {
    active,
    sampleCount: samples.length,
    averageFps:
      averageFrameTimeMs > 0 ? roundMetric(1000 / averageFrameTimeMs) : null,
    averageFrameTimeMs: roundMetric(averageFrameTimeMs),
    worstFrameTimeMs: roundMetric(worstFrameTimeMs),
    slowFrameCount,
    updatedAt: new Date().toISOString(),
  };
}

function buildLocalRuntimeSnapshot(
  measurements: LocalRuntimeMeasurement[],
): LocalRuntimePerformanceSnapshot {
  if (measurements.length === 0) {
    return EMPTY_LOCAL_RUNTIME_SNAPSHOT;
  }

  const grouped = new Map<string, LocalRuntimeMeasurement[]>();
  for (const measurement of measurements) {
    const entries = grouped.get(measurement.operation) ?? [];
    entries.push(measurement);
    grouped.set(measurement.operation, entries);
  }

  const operations = Array.from(grouped.entries())
    .map(([operation, entries]) => {
      const sortedDurations = entries
        .map((entry) => entry.durationMs)
        .sort((left, right) => left - right);
      const totalDuration = sortedDurations.reduce(
        (sum, duration) => sum + duration,
        0,
      );
      const p95Index = Math.min(
        sortedDurations.length - 1,
        Math.floor(sortedDurations.length * 0.95),
      );
      const latest = entries[entries.length - 1];
      const successCount = entries.filter((entry) => entry.success).length;
      const errorCount = entries.length - successCount;

      return {
        operation,
        count: entries.length,
        successCount,
        errorCount,
        averageDurationMs: roundMetric(totalDuration / entries.length),
        p95DurationMs: roundMetric(sortedDurations[p95Index]),
        lastDurationMs: roundMetric(latest.durationMs),
        lastStatus: latest.success ? "success" : "error",
        updatedAt: latest.updatedAt,
      } satisfies LocalRuntimeOperationSnapshot;
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return {
    sampleCount: measurements.length,
    updatedAt: measurements[measurements.length - 1]?.updatedAt ?? null,
    operations,
  };
}

function publishRendererSnapshot(active: boolean): void {
  snapshot = {
    ...snapshot,
    renderer: buildRendererSnapshot(frameSamples, active),
  };
  emitSnapshot();
}

function publishLocalRuntimeSnapshot(): void {
  snapshot = {
    ...snapshot,
    localRuntime: buildLocalRuntimeSnapshot(localRuntimeMeasurements),
  };
  emitSnapshot();
}

function startRendererLoop(): void {
  if (
    animationFrameId !== null ||
    typeof window === "undefined" ||
    typeof window.requestAnimationFrame !== "function"
  ) {
    return;
  }

  const onFrame = (timestamp: number) => {
    if (lastFrameAt != null) {
      frameSamples = [...frameSamples, timestamp - lastFrameAt].slice(
        -MAX_RENDERER_FRAME_SAMPLES,
      );
      publishRendererSnapshot(true);
    }
    lastFrameAt = timestamp;
    animationFrameId = window.requestAnimationFrame(onFrame);
  };

  animationFrameId = window.requestAnimationFrame(onFrame);
  publishRendererSnapshot(true);
}

function stopRendererLoop(): void {
  if (animationFrameId !== null && typeof window !== "undefined") {
    window.cancelAnimationFrame(animationFrameId);
  }
  animationFrameId = null;
  lastFrameAt = null;
  frameSamples = [];
  publishRendererSnapshot(false);
}

function inferMeasurementSuccess(result: unknown): boolean {
  if (
    typeof result === "object" &&
    result !== null &&
    "success" in result &&
    typeof (result as { success?: unknown }).success === "boolean"
  ) {
    return Boolean((result as { success: boolean }).success);
  }
  return true;
}

export function getRuntimePerformanceSnapshot(): RuntimePerformanceSnapshot {
  return snapshot;
}

export function subscribeRuntimePerformance(
  listener: () => void,
): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    startRendererLoop();
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopRendererLoop();
    }
  };
}

export function recordLocalRuntimeMeasurement(input: {
  operation: string;
  durationMs: number;
  success: boolean;
  updatedAt?: string;
}): void {
  localRuntimeMeasurements = [
    ...localRuntimeMeasurements,
    {
      operation: input.operation,
      durationMs: input.durationMs,
      success: input.success,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
    },
  ].slice(-MAX_LOCAL_RUNTIME_SAMPLES);
  publishLocalRuntimeSnapshot();
}

export async function measureLocalRuntimeCall<T>(
  operation: string,
  run: () => Promise<T>,
  options?: {
    isSuccess?: (result: T) => boolean;
  },
): Promise<T> {
  const startedAt = nowMs();
  try {
    const result = await run();
    recordLocalRuntimeMeasurement({
      operation,
      durationMs: nowMs() - startedAt,
      success: options?.isSuccess
        ? options.isSuccess(result)
        : inferMeasurementSuccess(result),
    });
    return result;
  } catch (error) {
    recordLocalRuntimeMeasurement({
      operation,
      durationMs: nowMs() - startedAt,
      success: false,
    });
    throw error;
  }
}

export function resetRuntimePerformanceProfilerForTests(): void {
  if (animationFrameId !== null && typeof window !== "undefined") {
    window.cancelAnimationFrame(animationFrameId);
  }
  animationFrameId = null;
  lastFrameAt = null;
  frameSamples = [];
  localRuntimeMeasurements = [];
  snapshot = {
    renderer: EMPTY_RENDERER_SNAPSHOT,
    localRuntime: EMPTY_LOCAL_RUNTIME_SNAPSHOT,
  };
}
