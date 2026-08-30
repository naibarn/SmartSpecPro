export const CAPACITY_POLICY_VERSION = "2026-08-21.v2";

export const CAPACITY_THRESHOLDS = {
  cpuPercent: { watch: 70, action: 85, critical: 95 },
  memoryPercent: { watch: 70, action: 85, critical: 90 },
  diskUsedPercent: { watch: 75, action: 85, critical: 90 },
  queueLength: { watch: 50, action: 100, critical: 1000 },
  oldestQueuedAgeMs: {
    watch: 5 * 60_000,
    action: 15 * 60_000,
    critical: 60 * 60_000,
  },
  activeJobCount: { watch: 5, action: 10, critical: 20 },
  longRunningJobMs: {
    watch: 15 * 60_000,
    action: 60 * 60_000,
    critical: 4 * 60 * 60_000,
  },
} as const;

export type CapacityStatus =
  | "healthy"
  | "watch"
  | "action"
  | "critical"
  | "insufficient_data";
export type CapacityDecision =
  | "continue_observe"
  | "optimize_home_server"
  | "upgrade_home_server"
  | "migrate_to_cloud"
  | "insufficient_data";

export function classifyCapacityMetric(
  value: number | null | undefined,
  thresholds: { watch: number; action: number; critical: number }
): CapacityStatus {
  if (value == null || !Number.isFinite(value)) return "insufficient_data";
  if (value >= thresholds.critical) return "critical";
  if (value >= thresholds.action) return "action";
  if (value >= thresholds.watch) return "watch";
  return "healthy";
}

export function worstCapacityStatus(
  statuses: CapacityStatus[]
): CapacityStatus {
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("action")) return "action";
  if (statuses.includes("watch")) return "watch";
  if (statuses.includes("insufficient_data")) return "insufficient_data";
  return "healthy";
}

export function decisionForCapacityStatus(
  status: CapacityStatus,
  input: {
    multiAreaPressure?: boolean;
    forecastImminent?: boolean;
    coverageComplete?: boolean;
  } = {}
): CapacityDecision {
  if (!input.coverageComplete || status === "insufficient_data")
    return "insufficient_data";
  if (input.multiAreaPressure || input.forecastImminent)
    return "migrate_to_cloud";
  if (status === "critical" || status === "action")
    return "upgrade_home_server";
  if (status === "watch") return "optimize_home_server";
  return "continue_observe";
}

export const capacityPolicy = {
  version: CAPACITY_POLICY_VERSION,
  thresholds: CAPACITY_THRESHOLDS,
  staleAfterMs: 15 * 60_000,
  forecast: { minimumSamples: 3, minimumWindowHours: 6, maxHorizonDays: 30 },
  retention: { fullSnapshotDays: 14, compactHistoryDays: 90 },
} as const;
