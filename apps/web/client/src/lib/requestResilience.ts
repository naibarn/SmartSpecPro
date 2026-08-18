/**
 * System-wide client resilience policy for react-query + the tRPC fetch
 * transport.
 *
 * Fixed, user-approved policy — do not widen without explicit re-approval.
 * Re-approved 2026-07-28 (feedback ticket #150): the user explicitly asked
 * that the client quietly wait out a smartspec-web service-restart window
 * (~20-30s) instead of surfacing an error mid-restart. As a result,
 * RETRYABLE_QUERY_MAX_ATTEMPTS and RETRYABLE_MUTATION_MAX_ATTEMPTS were
 * widened (see below) so the query retry schedule alone accumulates
 * >=60s of cumulative backoff delay (see retryDelayMs) — comfortably
 * covering a ~25s restart plus per-attempt request time. This widening
 * ONLY changes the attempt counts; the mutation double-charge invariant
 * in point 2 below is unchanged.
 *
 *  1. QUERIES (reads, idempotent) retry any TRANSIENT error — i.e.
 *     `classifyError(error) === "system"` (network failure, restart-time
 *     HTML-instead-of-JSON error page, 5xx, or TIMEOUT) — up to
 *     RETRYABLE_QUERY_MAX_ATTEMPTS times. 4xx user errors and auth errors
 *     are never retried.
 *  2. MUTATIONS (writes, may have side effects such as charging credits)
 *     retry ONLY a pure network-connection failure (the request never
 *     reached the server) up to RETRYABLE_MUTATION_MAX_ATTEMPTS times.
 *     5xx/TIMEOUT are deliberately excluded for mutations — the server may
 *     already have processed the write, so blindly retrying risks
 *     double-charging credits or double-creating records.
 *  3. Both use the same capped exponential backoff (retryDelayMs).
 *  4. The tRPC httpLink fetch wrapper (see main.tsx) enforces a bounded
 *     request timeout (TRPC_REQUEST_TIMEOUT_MS) so a hung connection
 *     eventually surfaces as an AbortError instead of hanging forever. An
 *     AbortError is not a network-failure TypeError, so per policy (2)
 *     mutations correctly do NOT retry a timeout — that is intentional.
 *
 * Kept pure and dependency-light (only imports the already dependency-light
 * systemErrorMonitor classifiers) so it is safe to unit test directly and
 * to import from main.tsx without pulling in any react-query/trpc runtime
 * wiring.
 */
import { classifyError, isNetworkFailure } from "@/lib/systemErrorMonitor";
import { isTransientTenantServiceError } from "@/lib/tenantServiceRecovery";

/** Max number of RETRY attempts (on top of the initial call) for queries. */
export const RETRYABLE_QUERY_MAX_ATTEMPTS = 14;

/** Max number of RETRY attempts (on top of the initial call) for mutations. */
export const RETRYABLE_MUTATION_MAX_ATTEMPTS = 10;

/**
 * Ceiling for a single tRPC HTTP request before it is aborted client-side.
 * Deliberately generous (3 minutes) because some legitimate synchronous
 * operations (LLM / skill / media prompt generation) can legitimately take
 * 60-120s — this timeout exists only to bound a truly hung connection, not
 * to police normal slow requests.
 */
export const TRPC_REQUEST_TIMEOUT_MS = 180_000;

/**
 * Capped exponential backoff shared by queries and mutations:
 * attempt 0 -> 1000ms, 1 -> 2000ms, 2 -> 4000ms, 3+ -> capped at 5000ms.
 */
export function retryDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 5000);
}

/**
 * react-query v5 semantics (verified against
 * `@tanstack/query-core`'s `createRetryer` source): the retryer keeps a
 * closure-scoped `failureCount` that starts at 0 and is passed to
 * `retry(failureCount, error)` *before* being incremented, once per failed
 * attempt. Only if `retry()` returns true does it increment and perform
 * another attempt. So the values this function is called with are
 * 0-indexed retry-decision-points: 0 on the first failure (deciding
 * whether to run retry #1), 1 on the second failure (deciding retry #2),
 * etc. `failureCount < RETRYABLE_QUERY_MAX_ATTEMPTS` therefore permits up
 * to RETRYABLE_QUERY_MAX_ATTEMPTS retries after the initial failed call
 * (i.e. up to RETRYABLE_QUERY_MAX_ATTEMPTS + 1 total network calls if every
 * attempt keeps failing).
 */
export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  return (
    (classifyError(error) === "system" || isTransientTenantServiceError(error))
    && failureCount < RETRYABLE_QUERY_MAX_ATTEMPTS
  );
}

/**
 * Re-exported/aliased from systemErrorMonitor's `isNetworkFailure` so both
 * modules share one source of truth for "the request never reached the
 * server" (a `TypeError` matching /failed to fetch|networkerror|load
 * failed/i) rather than duplicating the regex.
 */
export const isNetworkConnectionError = isNetworkFailure;

/**
 * See shouldRetryQuery's doc comment for react-query's 0-indexed
 * failureCount semantics. Mutations only retry a pure network-connection
 * failure (never 5xx/TIMEOUT — the write may have already landed).
 */
export function shouldRetryMutation(
  failureCount: number,
  error: unknown,
): boolean {
  return (
    isNetworkConnectionError(error)
    && failureCount < RETRYABLE_MUTATION_MAX_ATTEMPTS
  );
}
