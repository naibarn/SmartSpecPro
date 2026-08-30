/**
 * Client-side rate-limit (429) backoff helpers.
 *
 * The Python RateLimitMiddleware returns HTTP 429 (per-user/per-IP) when
 * background pollers fire too frequently. The tRPC layer maps that to a
 * `TOO_MANY_REQUESTS` error and — when the upstream sends a `Retry-After`
 * header — surfaces the delay as `error.data.retryAfter` (seconds) via the
 * server errorFormatter. These helpers let pollers detect that case and pause
 * for the right amount of time instead of hammering the endpoint (which only
 * deepens the rate-limit window).
 *
 * Dependency-light on purpose (only `@trpc/client`) so any poller can import it.
 */
import { TRPCClientError } from "@trpc/client";

/** Fallback cooldown when the server didn't provide a Retry-After value. */
const DEFAULT_BACKOFF_SECONDS = 60;
/** Hard ceiling so a misbehaving upstream can't freeze polling for minutes. */
const MAX_BACKOFF_SECONDS = 300;

type RateLimitErrorData = {
  code?: string;
  httpStatus?: number;
  retryAfter?: number;
};

function getData(error: unknown): RateLimitErrorData | undefined {
  if (!(error instanceof TRPCClientError)) return undefined;
  return error.data as RateLimitErrorData | undefined;
}

/** True when the error is a 429 / rate-limit error from the API. */
export function isRateLimitError(error: unknown): boolean {
  const data = getData(error);
  if (data?.code === "TOO_MANY_REQUESTS" || data?.httpStatus === 429) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  // Older server versions wrapped the upstream 429 as NOT_FOUND/404 or as
  // INTERNAL_SERVER_ERROR/500. Keep already-running clients quiet while they
  // roll forward by recognizing the preserved upstream message too.
  return /\b429\b|rate[ -]?limit|too many requests/i.test(message);
}

/**
 * Milliseconds a poller should wait before its next attempt after a rate-limit
 * error. Prefers the server-provided `retryAfter` (seconds); otherwise uses a
 * sane default. Always clamped to [1, MAX] seconds. Returns 0 for non
 * rate-limit errors so callers can `Math.max(0, ...)` unconditionally.
 */
export function rateLimitBackoffMs(error: unknown): number {
  if (!isRateLimitError(error)) return 0;
  const data = getData(error);
  const raw =
    typeof data?.retryAfter === "number" &&
    Number.isFinite(data.retryAfter) &&
    data.retryAfter > 0
      ? data.retryAfter
      : Number(
          (error instanceof Error ? error.message : String(error ?? "")).match(
            /(?:retry[- ]after|try again in)\s+(\d+(?:\.\d+)?)\s*seconds?/i
          )?.[1]
        ) || DEFAULT_BACKOFF_SECONDS;
  const seconds = Math.min(Math.max(1, Math.ceil(raw)), MAX_BACKOFF_SECONDS);
  return seconds * 1000;
}
