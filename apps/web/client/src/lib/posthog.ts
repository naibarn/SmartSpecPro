/**
 * PostHog Client-Side SDK Initialization
 *
 * Provides product analytics with:
 * - Manual pageview tracking (SPA-aware)
 * - Identity management (anonymous -> identified)
 * - Event capture helpers
 */

import posthog from "posthog-js";

const ANALYTICS_CONSENT_STORAGE_KEY = "smartspec:analytics-consent";
let initialized = false;

function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) === "granted";
  } catch {
    return false;
  }
}

export function initPostHog(): void {
  const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;
  if (!apiKey || initialized || !hasAnalyticsConsent()) return;

  posthog.init(apiKey, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",
    person_profiles: "identified_only",
    autocapture: false,
    capture_pageview: false,
    opt_out_capturing_by_default: true,
    session_recording: { maskAllInputs: true },
  });

  initialized = true;
  posthog.opt_in_capturing();
}

/** Analytics remains off until a user explicitly grants optional analytics consent. */
export function setAnalyticsConsent(granted: boolean): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      granted ? "granted" : "denied",
    );
  } catch {
    // If consent cannot be durably remembered, fail closed for this browser.
    if (granted) {
      if (initialized) {
        posthog.opt_out_capturing();
        posthog.reset();
      }
      return;
    }
  }

  if (!granted) {
    if (initialized) {
      posthog.opt_out_capturing();
      posthog.reset();
    }
    return;
  }

  if (initialized) {
    posthog.opt_in_capturing();
    return;
  }

  initPostHog();
}

/**
 * Returns the PostHog instance, or null if not initialized.
 * All client-side PostHog calls should go through this getter.
 */
export function getPostHog(): typeof posthog | null {
  if (!initialized || !hasAnalyticsConsent()) return null;
  return posthog;
}
