export const TENANT_SERVICE_RECOVERY_STORAGE_KEY =
  "__smartspec_tenant_service_recovery_v1__";
export const TENANT_SERVICE_RECOVERY_QUERY_PARAM = "__smartspec_recovery";
export const TENANT_SERVICE_RECOVERY_WINDOW_MS = 5 * 60_000;
export const TENANT_SERVICE_RECOVERY_MAX_NAVIGATIONS = 2;
export const TENANT_SERVICE_RECOVERY_DELAY_MS = 2_000;

const TRANSIENT_UPSTREAM_STATUSES = new Set([502, 503, 504, 522, 524]);

interface RecoveryState {
  startedAt: number;
  attempts: number;
}

interface StatusError {
  status?: unknown;
  httpStatus?: unknown;
  name?: unknown;
  message?: unknown;
}

function asStatusError(error: unknown): StatusError | undefined {
  return error && typeof error === "object"
    ? (error as StatusError)
    : undefined;
}

export function getTenantServiceErrorStatus(
  error: unknown
): number | undefined {
  const candidate = asStatusError(error);
  for (const value of [candidate?.status, candidate?.httpStatus]) {
    if (typeof value === "number" && Number.isInteger(value)) return value;
  }

  const message =
    typeof candidate?.message === "string" ? candidate.message : "";
  const match = message.match(/(?:tenant\/current|HTTP)\s+(\d{3})\b/i);
  return match ? Number(match[1]) : undefined;
}

/**
 * Returns true only for failures that commonly occur while the web service or
 * its upstream gateway is restarting. Application 500s and client errors are
 * deliberately excluded so a real defect is not silently refreshed forever.
 */
export function isTransientTenantServiceError(error: unknown): boolean {
  if (
    error instanceof TypeError &&
    /failed to fetch|networkerror|load failed/i.test(error.message)
  ) {
    return true;
  }

  const candidate = asStatusError(error);
  if (candidate?.name === "AbortError") return true;

  const status = getTenantServiceErrorStatus(error);
  return status !== undefined && TRANSIENT_UPSTREAM_STATUSES.has(status);
}

function readRecoveryState(): RecoveryState | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const raw = window.sessionStorage.getItem(
      TENANT_SERVICE_RECOVERY_STORAGE_KEY
    );
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<RecoveryState>;
    if (
      typeof parsed.startedAt !== "number" ||
      !Number.isFinite(parsed.startedAt) ||
      typeof parsed.attempts !== "number" ||
      !Number.isInteger(parsed.attempts)
    ) {
      return undefined;
    }
    return { startedAt: parsed.startedAt, attempts: parsed.attempts };
  } catch {
    return undefined;
  }
}

function writeRecoveryState(state: RecoveryState): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.sessionStorage.setItem(
      TENANT_SERVICE_RECOVERY_STORAGE_KEY,
      JSON.stringify(state)
    );
    return true;
  } catch {
    // Private browsing or a disabled storage area should not break the route.
    return false;
  }
}

/** Consumes one bounded automatic navigation slot. */
export function consumeTenantServiceRecoveryAttempt(now = Date.now()): boolean {
  const previous = readRecoveryState();
  const state =
    !previous || now - previous.startedAt >= TENANT_SERVICE_RECOVERY_WINDOW_MS
      ? { startedAt: now, attempts: 1 }
      : { ...previous, attempts: previous.attempts + 1 };

  if (state.attempts > TENANT_SERVICE_RECOVERY_MAX_NAVIGATIONS) return false;
  return writeRecoveryState(state);
}

export function clearTenantServiceRecoveryState(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(TENANT_SERVICE_RECOVERY_STORAGE_KEY);
  } catch {
    // Best effort only; storage availability must not affect route rendering.
  }
}

export function buildTenantServiceRecoveryUrl(
  currentHref: string,
  now = Date.now()
): string {
  const url = new URL(currentHref, "http://localhost");
  url.searchParams.set(TENANT_SERVICE_RECOVERY_QUERY_PARAM, String(now));
  return url.href;
}

export function removeTenantServiceRecoveryQueryParam(
  currentHref: string
): string {
  const url = new URL(currentHref, "http://localhost");
  url.searchParams.delete(TENANT_SERVICE_RECOVERY_QUERY_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
