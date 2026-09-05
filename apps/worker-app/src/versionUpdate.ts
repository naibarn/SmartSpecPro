export type WorkerAppRelease = {
  version: string;
  fileName: string;
  fileSizeBytes: number;
  updatedAt: string;
  downloadUrl: string;
};

export type RuntimeUpdateCheck = {
  runtimeId: string;
  channel: "stable" | "preview" | string;
  currentVersion: string | null;
  currentRuntimeProfileHash: string | null;
  latestVersion: string | null;
  latestRuntimeProfileHash: string | null;
  latestAllowed: boolean;
  updateAvailable: boolean;
  reason: "not_installed" | "version_older" | "profile_changed" | "current" | "latest_unavailable" | string;
  checkedAt: string;
};

export type RuntimeSetupStatus = {
  status: "not_started" | "running" | "succeeded" | "failed" | string;
  message: string;
  version?: string | null;
  logPath?: string | null;
  updatedAt?: string | null;
};

export type RuntimeInstallResult = {
  status: string;
  message: string;
  manifest?: {
    version?: string | null;
  } | null;
  doctor?: {
    status: string;
  } | null;
};

export function compareVersionStrings(left: string, right: string): number {
  const leftSegments = left.trim().split(/[.+-]/).filter(Boolean);
  const rightSegments = right.trim().split(/[.+-]/).filter(Boolean);
  const length = Math.max(leftSegments.length, rightSegments.length);

  for (let index = 0; index < length; index += 1) {
    const leftSegment = leftSegments[index] ?? "0";
    const rightSegment = rightSegments[index] ?? "0";
    const leftNumeric = /^\d+$/.test(leftSegment);
    const rightNumeric = /^\d+$/.test(rightSegment);

    if (leftNumeric && rightNumeric) {
      const difference = Number(leftSegment) - Number(rightSegment);
      if (difference !== 0) return difference > 0 ? 1 : -1;
      continue;
    }

    const lexical = leftSegment.localeCompare(rightSegment, undefined, {
      sensitivity: "base",
      numeric: true,
    });
    if (lexical !== 0) return lexical > 0 ? 1 : -1;
  }

  return 0;
}

export function isNewerVersion(current: string | null | undefined, latest: string | null | undefined): boolean {
  if (!latest?.trim() || !current?.trim()) return false;
  return compareVersionStrings(latest, current) > 0;
}

export function resolveSameOriginUrl(baseUrl: string, candidate: string): string | null {
  try {
    const base = new URL(baseUrl);
    const resolved = new URL(candidate, base);
    if (resolved.origin !== base.origin) return null;
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

export async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Update check failed with ${response.status}`);
    }
    return payload as T;
  } finally {
    window.clearTimeout(timeout);
  }
}
