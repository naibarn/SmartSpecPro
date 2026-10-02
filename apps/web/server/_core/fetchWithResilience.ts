/**
 * Server-side HTTP resilience helper — the Node/undici sibling of the
 * frontend's `client/src/lib/requestResilience.ts` (Phase 1).
 *
 * Wraps global `fetch` with:
 *  - a bounded per-attempt timeout (`AbortSignal.timeout`, composed with any
 *    caller-supplied `signal` via `AbortSignal.any`);
 *  - bounded retry with the same capped-exponential backoff as Phase 1, for
 *    TRANSIENT failures only (network error / 5xx / timeout);
 *  - an anti-double-side-effect default: non-idempotent methods
 *    (POST/PUT/PATCH/DELETE) do NOT retry by default, because a 5xx or a
 *    timeout does not prove the write never landed. They may opt into
 *    `retryPolicy: "connect-only"`, which retries ONLY when the request
 *    never reached the server (pure connection failure) — never on 5xx or a
 *    generic mid-request network error.
 *
 * See `planning/backend-resilience-phase2/plan.md` (sections 2, 2.1, 4) for
 * the full design and the Phase-1 parity table. This file intentionally
 * mirrors that plan's "Helper design (exact spec)" 1:1 — Wave 2 (call-site
 * migration) depends on this exact API surface.
 *
 * Does NOT log secrets: only `label`, `method`, `host` (URL origin — never
 * the full URL/query, headers, or body), attempt number, and error
 * name/code are logged on retry/exhaustion (see root CLAUDE.md "Secret
 * Exposure Prevention").
 */
import { debugLog } from "./logger";

/**
 * How a failed attempt may be retried:
 *  - "transient": retry network errors, 5xx responses, and our own timeout.
 *    Safe for idempotent reads — the default for GET/HEAD/OPTIONS.
 *  - "connect-only": retry ONLY when the request never reached the server
 *    (a pure connection failure). Never retries on 5xx or timeout, since the
 *    write may already have landed. Opt-in for non-idempotent methods that
 *    are safe to re-send when nothing was received server-side.
 *  - "off": never retry (timeout-only). The default for
 *    POST/PUT/PATCH/DELETE.
 */
export type RetryPolicy = "transient" | "connect-only" | "off";

export interface ResilientFetchOptions extends RequestInit {
  /** Per-attempt ceiling before the internal AbortSignal fires. Default 30_000. */
  timeoutMs?: number;
  /** Max RETRY attempts on top of the initial call. Default 3 (ignored when policy resolves to "off"). */
  maxRetries?: number;
  /** Override the retry policy. Default is derived from the HTTP method — see `defaultPolicyForMethod`. */
  retryPolicy?: RetryPolicy;
  /** Short label for structured logging on retry/exhaustion. Never put secrets in this. */
  label?: string;
  /** Test seam: injectable backoff. Defaults to `defaultRetryDelayMs`. */
  backoffMs?: (attempt: number) => number;
  /** Test seam: injectable fetch implementation. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** Per-attempt timeout when the caller does not specify one. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Retry attempts (on top of the initial call) when the caller does not specify one. */
const DEFAULT_MAX_RETRIES = 3;

/** How many `.cause` links `getErrorCode` will walk looking for a `.code`. */
const MAX_CAUSE_DEPTH = 5;

const LOG_CATEGORY = "fetchWithResilience";

/**
 * undici classifies a failure as "the request never reached the server" via
 * one of these `cause.code` values. Safe to retry even a non-idempotent
 * write, because nothing was sent.
 */
export const CONNECT_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/**
 * Other network-level failures where the request MAY have reached the
 * server (mid-request reset, broken pipe, low-level socket timeout) — only
 * safe to retry under the full "transient" policy, never "connect-only".
 */
const TRANSIENT_NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_SOCKET",
]);

/**
 * Capped exponential backoff — identical formula to Phase 1's
 * `requestResilience.ts#retryDelayMs`: attempt 0 -> 1000ms, 1 -> 2000ms,
 * 2 -> 4000ms, 3+ -> capped at 5000ms.
 */
export function defaultRetryDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 5000);
}

/**
 * Idempotent reads default to "transient" (safe to retry network/5xx/
 * timeout failures). Everything else defaults to "off" (no auto-retry — a
 * write may have already landed server-side).
 */
export function defaultPolicyForMethod(method: string): RetryPolicy {
  switch (method.toUpperCase()) {
    case "GET":
    case "HEAD":
    case "OPTIONS":
      return "transient";
    default:
      return "off";
  }
}

/**
 * Walks `err.code`, then `err.cause.code`, then `err.cause.cause.code`, ...
 * (up to MAX_CAUSE_DEPTH hops) looking for a string `.code`. undici's
 * `TypeError: fetch failed` puts the actionable errno-style code on
 * `.cause` (sometimes nested one level deeper), not on the top-level error.
 */
export function getErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current != null; depth += 1) {
    if (typeof current !== "object") return undefined;
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function isGenericFetchFailedTypeError(err: unknown): boolean {
  return err instanceof TypeError && /fetch failed/i.test(err.message);
}

/**
 * True when the caller's OWN signal (not our internal timeout) is what
 * aborted this attempt. Always rethrow immediately in this case — never
 * retry a cancellation the caller asked for.
 */
export function isCallerAbort(
  err: unknown,
  callerSignal?: AbortSignal | null
): boolean {
  if (!callerSignal?.aborted) return false;
  const name = (err as { name?: unknown } | null | undefined)?.name;
  return name === "AbortError";
}

/**
 * True when this attempt failed because OUR per-attempt ceiling
 * (`AbortSignal.timeout`) fired — distinct from a caller-initiated abort.
 */
export function isTimeoutError(err: unknown): boolean {
  const name = (err as { name?: unknown } | null | undefined)?.name;
  return name === "TimeoutError";
}

/** True when the request never reached the server — see CONNECT_ERROR_CODES. */
export function isConnectError(err: unknown): boolean {
  const code = getErrorCode(err);
  return code !== undefined && CONNECT_ERROR_CODES.has(code);
}

/**
 * True for other network-level failures where the request MAY have reached
 * the server (mid-request reset / broken pipe / socket timeout), or a
 * generic undici "fetch failed" TypeError that we can't attribute to a
 * specific known connect-error code.
 */
export function isTransientNetworkError(err: unknown): boolean {
  const code = getErrorCode(err);
  if (code !== undefined && CONNECT_ERROR_CODES.has(code)) return false;
  if (code !== undefined && TRANSIENT_NETWORK_ERROR_CODES.has(code))
    return true;
  return isGenericFetchFailedTypeError(err);
}

/** Decide whether a thrown (non-Response) failure should be retried under `policy`. */
function shouldRetryThrown(err: unknown, policy: RetryPolicy): boolean {
  if (isTimeoutError(err)) return policy === "transient";
  if (isConnectError(err))
    return policy === "transient" || policy === "connect-only";
  if (isTransientNetworkError(err)) return policy === "transient";
  return false;
}

function describeError(err: unknown): {
  errorName?: string;
  errorCode?: string;
} {
  const name = (err as { name?: unknown } | null | undefined)?.name;
  return {
    errorName: typeof name === "string" ? name : undefined,
    errorCode: getErrorCode(err),
  };
}

/** URL origin only — never log the full URL (query strings can carry tokens/PII). */
function safeHost(url: string | URL): string {
  try {
    return new URL(url).origin;
  } catch {
    return "unknown";
  }
}

function logResilienceEvent(
  kind: "retry" | "exhausted",
  info: {
    label?: string;
    method: string;
    host: string;
    attempt: number;
    status?: number;
    errorName?: string;
    errorCode?: string;
  }
): void {
  const message =
    kind === "retry"
      ? "retrying transient failure"
      : "retry attempts exhausted";
  debugLog(LOG_CATEGORY, message, {
    label: info.label,
    method: info.method,
    host: info.host,
    attempt: info.attempt,
    ...(info.status !== undefined ? { status: info.status } : {}),
    ...(info.errorName !== undefined ? { errorName: info.errorName } : {}),
    ...(info.errorCode !== undefined ? { errorCode: info.errorCode } : {}),
  });
}

function toAbortReason(signal: AbortSignal): unknown {
  return (
    signal.reason ??
    new DOMException("The operation was aborted.", "AbortError")
  );
}

/** Backoff sleep, abortable by the caller's signal (never our internal per-attempt timeout). */
function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(toAbortReason(signal));
      return;
    }

    const timer = setTimeout(
      () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      },
      Math.max(0, ms)
    );

    function onAbort(): void {
      clearTimeout(timer);
      reject(toAbortReason(signal as AbortSignal));
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function buildAttemptSignal(
  callerSignal: AbortSignal | null | undefined,
  timeoutMs: number
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal;
}

/**
 * `fetch` wrapped with a bounded per-attempt timeout and bounded retry for
 * transient failures. See the file header and
 * `planning/backend-resilience-phase2/plan.md` section 4 for the full
 * behavior spec.
 */
export async function fetchWithResilience(
  url: string | URL,
  options: ResilientFetchOptions = {}
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryPolicy,
    label,
    backoffMs = defaultRetryDelayMs,
    fetchImpl = fetch,
    signal: callerSignal,
    ...restInit
  } = options;

  const method = (restInit.method ?? "GET").toUpperCase();
  const policy: RetryPolicy = retryPolicy ?? defaultPolicyForMethod(method);
  const effectiveMaxRetries = policy === "off" ? 0 : Math.max(0, maxRetries);
  const host = safeHost(url);

  for (let attempt = 0; ; attempt += 1) {
    const attemptsRemain = attempt < effectiveMaxRetries;
    const attemptSignal = buildAttemptSignal(callerSignal, timeoutMs);

    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...restInit,
        method,
        signal: attemptSignal,
      });
    } catch (err) {
      // A caller cancellation is never retried, regardless of policy or
      // remaining attempts — propagate immediately.
      if (isCallerAbort(err, callerSignal)) {
        throw err;
      }

      const retryable = shouldRetryThrown(err, policy);
      const { errorName, errorCode } = describeError(err);

      if (retryable && attemptsRemain) {
        logResilienceEvent("retry", {
          label,
          method,
          host,
          attempt,
          errorName,
          errorCode,
        });
        await sleep(backoffMs(attempt), callerSignal);
        continue;
      }
      if (retryable) {
        logResilienceEvent("exhausted", {
          label,
          method,
          host,
          attempt,
          errorName,
          errorCode,
        });
      }
      throw err;
    }

    // Only a CONFIRMED numeric 5xx is a retryable server error. Everything
    // else — 2xx/3xx/4xx, or a response whose `status` is not a number (never
    // produced by a real `fetch`, but possible from a partial test mock or an
    // exotic Response) — is returned as-is, untouched, and never retried, so
    // the caller's existing status handling runs unchanged. (Guarding on the
    // number type matters: `undefined < 500` is `false`, which would otherwise
    // misclassify a statusless response as a retryable 5xx.)
    if (!(typeof response.status === "number" && response.status >= 500)) {
      return response;
    }

    // status >= 500 — only the "transient" policy ever retries a 5xx.
    if (policy === "transient" && attemptsRemain) {
      logResilienceEvent("retry", {
        label,
        method,
        host,
        attempt,
        status: response.status,
      });
      await sleep(backoffMs(attempt), callerSignal);
      continue;
    }
    if (policy === "transient") {
      logResilienceEvent("exhausted", {
        label,
        method,
        host,
        attempt,
        status: response.status,
      });
    }
    return response;
  }
}
