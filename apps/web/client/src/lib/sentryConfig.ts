export type SentryRuntimeOptions = {
  enabledFlag?: string;
  dsn?: string;
  mode?: string;
  hostname?: string;
  allowDevFlag?: string;
};

export function parseSampleRate(raw: unknown, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, parsed));
}

export function isLocalHostname(hostname?: string): boolean {
  if (!hostname) return false;

  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".local")
  );
}

export function shouldEnableBrowserSentry({
  enabledFlag,
  dsn,
  mode,
  hostname,
  allowDevFlag,
}: SentryRuntimeOptions): boolean {
  if (enabledFlag === "false") {
    return false;
  }

  if (!dsn) {
    return false;
  }

  if (allowDevFlag === "true") {
    return true;
  }

  const normalizedMode = (mode || "production").toLowerCase();
  if (normalizedMode === "development" || normalizedMode === "test") {
    return false;
  }

  if (isLocalHostname(hostname)) {
    return false;
  }

  return true;
}
