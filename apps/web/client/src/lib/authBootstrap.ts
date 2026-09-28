/**
 * Bounded fetch helper for requests that gate the initial route render.
 *
 * This is intentionally separate from the global tRPC timeout. Auth and
 * tenant bootstrap requests must fail visibly within a page-sized window
 * instead of keeping every protected route blank indefinitely.
 */
export const AUTH_BOOTSTRAP_TIMEOUT_MS = 10_000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = AUTH_BOOTSTRAP_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
