import { getRedisClient } from "./redis";

const LIVE_BROWSER_READINESS_KEY = "live-browser:readiness";
const LIVE_BROWSER_READINESS_MAX_AGE_MS = 2 * 60 * 1000;

export interface LiveBrowserReadinessSnapshot {
  runtimeReady: boolean;
  providerReady: boolean;
  runtimeFailures: string[];
  providerFailures: string[];
  checkedAt: string | null;
  publisher: string | null;
  owner: string | null;
  runbookUrl: string | null;
  publishIntervalSeconds: number | null;
  maxAgeSeconds: number | null;
}

export interface LiveBrowserEntryReadinessStatus {
  ready: boolean;
  failedChecks: string[];
  snapshot: LiveBrowserReadinessSnapshot;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function parseBoolean(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

function parseCheckedAt(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function parsePositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function parseSnapshot(raw: string | null): LiveBrowserReadinessSnapshot {
  if (!raw) {
    return {
      runtimeReady: false,
      providerReady: false,
      runtimeFailures: ["live_readiness_snapshot_missing"],
      providerFailures: [],
      checkedAt: null,
      publisher: null,
      owner: null,
      runbookUrl: null,
      publishIntervalSeconds: null,
      maxAgeSeconds: null,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      runtimeReady: parseBoolean(parsed.runtimeReady, false),
      providerReady: parseBoolean(parsed.providerReady, false),
      runtimeFailures: parseStringArray(parsed.runtimeFailures),
      providerFailures: parseStringArray(parsed.providerFailures),
      checkedAt: parseCheckedAt(parsed.checkedAt),
      publisher: parseString(parsed.publisher),
      owner: parseString(parsed.owner),
      runbookUrl: parseString(parsed.runbookUrl),
      publishIntervalSeconds: parsePositiveNumber(parsed.publishIntervalSeconds),
      maxAgeSeconds: parsePositiveNumber(parsed.maxAgeSeconds),
    };
  } catch {
    return {
      runtimeReady: false,
      providerReady: false,
      runtimeFailures: ["live_readiness_snapshot_invalid"],
      providerFailures: [],
      checkedAt: null,
      publisher: null,
      owner: null,
      runbookUrl: null,
      publishIntervalSeconds: null,
      maxAgeSeconds: null,
    };
  }
}

export function evaluateLiveBrowserEntryReadiness(
  snapshot: LiveBrowserReadinessSnapshot,
): LiveBrowserEntryReadinessStatus {
  const failedChecks = [
    ...snapshot.runtimeFailures,
    ...snapshot.providerFailures,
  ];

  if (!snapshot.runtimeReady && snapshot.runtimeFailures.length === 0) {
    failedChecks.push("live_runtime_unready");
  }

  if (!snapshot.providerReady && snapshot.providerFailures.length === 0) {
    failedChecks.push("provider_unready");
  }

  if (!snapshot.publisher) {
    failedChecks.push("live_readiness_publisher_missing");
  }

  if (!snapshot.owner) {
    failedChecks.push("live_readiness_owner_missing");
  }

  if (!snapshot.runbookUrl) {
    failedChecks.push("live_readiness_runbook_missing");
  }

  if (!snapshot.publishIntervalSeconds) {
    failedChecks.push("live_readiness_publish_interval_missing");
  }

  if (!snapshot.maxAgeSeconds) {
    failedChecks.push("live_readiness_max_age_missing");
  }

  if (snapshot.checkedAt) {
    const checkedAtMs = Date.parse(snapshot.checkedAt);
    const maxAgeMs = (snapshot.maxAgeSeconds ?? LIVE_BROWSER_READINESS_MAX_AGE_MS / 1000) * 1000;
    if (!Number.isNaN(checkedAtMs) && Date.now() - checkedAtMs > maxAgeMs) {
      failedChecks.push("live_readiness_snapshot_stale");
    }
  }

  return {
    ready: failedChecks.length === 0,
    failedChecks,
    snapshot,
  };
}

export async function getLiveBrowserEntryReadiness(): Promise<LiveBrowserEntryReadinessStatus> {
  let raw: string | null = null;
  try {
    raw = await getRedisClient().get(LIVE_BROWSER_READINESS_KEY);
  } catch {
    raw = null;
  }
  return evaluateLiveBrowserEntryReadiness(parseSnapshot(raw));
}

export async function assertLiveBrowserEntryReady(): Promise<void> {
  const status = await getLiveBrowserEntryReadiness();
  if (status.ready) {
    return;
  }

  throw new Error(
    [
      "Live Browser entry is blocked by readiness checks",
      `failed_checks=${status.failedChecks.join(",") || "none"}`,
      `checked_at=${status.snapshot.checkedAt ?? "unknown"}`,
      `publisher=${status.snapshot.publisher ?? "unknown"}`,
      `owner=${status.snapshot.owner ?? "unknown"}`,
      `runbook_url=${status.snapshot.runbookUrl ?? "unknown"}`,
    ].join(" "),
  );
}
