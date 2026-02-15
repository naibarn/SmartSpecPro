/**
 * PostHog Client-Side SDK Initialization
 *
 * Provides product analytics with:
 * - Manual pageview tracking (SPA-aware)
 * - Identity management (anonymous -> identified)
 * - Event capture helpers
 */

import posthog from "posthog-js";

let initialized = false;

export function initPostHog(): void {
  const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;
  if (!apiKey || initialized) return;

  posthog.init(apiKey, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",
    person_profiles: "identified_only",
    autocapture: false,
    capture_pageview: false,
    session_recording: { maskAllInputs: true },
  });

  initialized = true;
}

/**
 * Returns the PostHog instance, or null if not initialized.
 * All client-side PostHog calls should go through this getter.
 */
export function getPostHog(): typeof posthog | null {
  if (!initialized) return null;
  return posthog;
}
