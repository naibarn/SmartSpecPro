import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import { existsSync, readFileSync } from "node:fs";

const DEFAULT_CGROUP_ROOTS = [
  process.env.SMARTSPEC_WEB_CGROUP_PATH,
  "/sys/fs/cgroup/system.slice/smartspec-web.service",
  "/sys/fs/cgroup",
].filter((value): value is string => Boolean(value));

export interface RuntimeMemoryMetrics {
  rssBytes: number;
  heapTotalBytes: number;
  heapUsedBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
}

export interface EventLoopMetrics {
  meanMs: number | null;
  p95Ms: number | null;
  maxMs: number | null;
  minMs: number | null;
}

export interface CgroupMemoryMetrics {
  root: string | null;
  currentBytes: number | null;
  highBytes: number | null;
  maxBytes: number | null;
  events: Record<string, number>;
}

export interface RuntimeHealthSnapshot {
  timestamp: string;
  memory: RuntimeMemoryMetrics;
  eventLoop: EventLoopMetrics;
  cgroup: CgroupMemoryMetrics;
}

export interface RuntimeHealthEvidence {
  status: "OBSERVED" | "UNAVAILABLE";
  observedAt: string;
  value: {
    runtimeIdentity: string;
    expectedRevision: string | null;
    observedRevision: string | null;
    readiness: "UNKNOWN";
    health: "HEALTHY" | "DEGRADED";
    freshness: "FRESH";
    evidenceSource: "web_process_self_attestation";
    metrics: Pick<RuntimeHealthSnapshot, "memory" | "eventLoop" | "cgroup">;
  } | null;
}

function parseCgroupValue(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "max") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseCgroupEvents(value: string): Record<string, number> {
  const events: Record<string, number> = {};
  for (const line of value.split(/\r?\n/)) {
    const [name, rawCount] = line.trim().split(/\s+/, 2);
    const count = Number(rawCount);
    if (name && Number.isFinite(count)) events[name] = count;
  }
  return events;
}

function readOptionalFile(root: string, name: string): string | null {
  try {
    return readFileSync(`${root}/${name}`, "utf8");
  } catch {
    return null;
  }
}

function resolveCgroupRoot(): string | null {
  return DEFAULT_CGROUP_ROOTS.find((root) => existsSync(`${root}/memory.current`)) ?? null;
}

export function readCgroupMemoryMetrics(root = resolveCgroupRoot()): CgroupMemoryMetrics {
  if (!root) {
    return { root: null, currentBytes: null, highBytes: null, maxBytes: null, events: {} };
  }

  return {
    root,
    currentBytes: parseCgroupValue(readOptionalFile(root, "memory.current")),
    highBytes: parseCgroupValue(readOptionalFile(root, "memory.high")),
    maxBytes: parseCgroupValue(readOptionalFile(root, "memory.max")),
    events: parseCgroupEvents(readOptionalFile(root, "memory.events") ?? ""),
  };
}

export function getRuntimeMemoryMetrics(
  memoryUsage: NodeJS.MemoryUsage = process.memoryUsage(),
): RuntimeMemoryMetrics {
  return {
    rssBytes: memoryUsage.rss,
    heapTotalBytes: memoryUsage.heapTotal,
    heapUsedBytes: memoryUsage.heapUsed,
    externalBytes: memoryUsage.external,
    arrayBuffersBytes: memoryUsage.arrayBuffers ?? 0,
  };
}

function histogramValue(value: number): number | null {
  return Number.isFinite(value) ? Number((value / 1e6).toFixed(2)) : null;
}

export function getEventLoopMetrics(histogram?: IntervalHistogram): EventLoopMetrics {
  if (!histogram || histogram.count === 0) {
    return { meanMs: null, p95Ms: null, maxMs: null, minMs: null };
  }

  return {
    meanMs: histogramValue(histogram.mean),
    p95Ms: histogramValue(histogram.percentile(95)),
    maxMs: histogramValue(histogram.max),
    minMs: histogramValue(histogram.min),
  };
}

export function collectRuntimeHealthSnapshot(options: {
  memoryUsage?: NodeJS.MemoryUsage;
  eventLoop?: IntervalHistogram;
  cgroupRoot?: string | null;
} = {}): RuntimeHealthSnapshot {
  return {
    timestamp: new Date().toISOString(),
    memory: getRuntimeMemoryMetrics(options.memoryUsage),
    eventLoop: getEventLoopMetrics(options.eventLoop),
    cgroup: readCgroupMemoryMetrics(options.cgroupRoot),
  };
}

/** Normalizes evidence from this live web process without treating it as deployment proof. */
export function collectRuntimeHealthEvidence(input: {
  snapshot?: RuntimeHealthSnapshot;
  env?: NodeJS.ProcessEnv;
  now?: Date;
} = {}): RuntimeHealthEvidence {
  const observedAt = (input.now ?? new Date()).toISOString();
  try {
    const snapshot = input.snapshot ?? collectRuntimeHealthSnapshot();
    const env = input.env ?? process.env;
    const observedRevision = env.RELEASE?.trim() || env.COMMIT_SHA?.trim() || null;
    const expectedRevision = env.SMARTSPEC_EXPECTED_REVISION?.trim() || null;
    const hasMemory = Number.isFinite(snapshot.memory.rssBytes) && snapshot.memory.rssBytes > 0;
    return {
      status: "OBSERVED",
      observedAt: snapshot.timestamp,
      value: {
        runtimeIdentity: env.SMARTSPEC_RUNTIME_ID?.trim() || `${env.NODE_ENV ?? "unknown"}:${process.pid}`,
        expectedRevision,
        observedRevision,
        // The web process monitor does not probe dependencies or a readiness route.
        readiness: "UNKNOWN",
        health: hasMemory ? "HEALTHY" : "DEGRADED",
        freshness: "FRESH",
        evidenceSource: "web_process_self_attestation",
        metrics: { memory: snapshot.memory, eventLoop: snapshot.eventLoop, cgroup: snapshot.cgroup },
      },
    };
  } catch {
    return { status: "UNAVAILABLE", observedAt, value: null };
  }
}

export interface RuntimeHealthMonitor {
  start: () => void;
  stop: () => void;
  collect: () => RuntimeHealthSnapshot;
}

export function createRuntimeHealthMonitor(options: {
  intervalMs?: number;
  cgroupRoot?: string | null;
  logger?: Pick<Console, "info" | "warn">;
} = {}): RuntimeHealthMonitor {
  const intervalMs = options.intervalMs ?? 60_000;
  const logger = options.logger ?? console;
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  let timer: NodeJS.Timeout | undefined;

  const collect = () => collectRuntimeHealthSnapshot({
    eventLoop: histogram,
    cgroupRoot: options.cgroupRoot,
  });

  const logSnapshot = () => {
    const snapshot = collect();
    logger.info("[RuntimeHealth]", snapshot);
  };

  return {
    start() {
      if (timer) return;
      histogram.enable();
      logSnapshot();
      timer = setInterval(logSnapshot, intervalMs);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      histogram.disable();
    },
    collect,
  };
}

const defaultRuntimeHealthMonitor = createRuntimeHealthMonitor();

export function startRuntimeHealthMonitor(): void {
  defaultRuntimeHealthMonitor.start();
}

export function stopRuntimeHealthMonitor(): void {
  defaultRuntimeHealthMonitor.stop();
}
