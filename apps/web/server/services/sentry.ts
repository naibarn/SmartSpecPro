/**
 * Sentry Error Tracking - Node.js Backend
 *
 * Initializes Sentry for the Express backend with:
 * - PII scrubbing (headers, body fields)
 * - Express integration
 * - Configurable sample rate
 */
import * as Sentry from "@sentry/node";

const SENSITIVE_HEADERS = ["authorization", "cookie", "x-proxy-token"];
const SENSITIVE_BODY_PATTERN = /password|token|secret|apiKey|encr/i;

/**
 * Scrub PII from Sentry events before sending.
 * Removes sensitive headers and body fields.
 */
export function beforeSend(event: Sentry.Event): Sentry.Event | null {
  // Scrub sensitive headers
  if (event.request?.headers) {
    for (const header of SENSITIVE_HEADERS) {
      if (header in event.request.headers) {
        event.request.headers[header] = "[FILTERED]";
      }
    }
  }

  // Scrub sensitive body fields
  if (event.request?.data && typeof event.request.data === "string") {
    try {
      const body = JSON.parse(event.request.data);
      let modified = false;
      for (const key of Object.keys(body)) {
        if (SENSITIVE_BODY_PATTERN.test(key)) {
          body[key] = "[FILTERED]";
          modified = true;
        }
      }
      if (modified) {
        event.request.data = JSON.stringify(body);
      }
    } catch {
      // Not valid JSON, skip body scrubbing
    }
  }

  return event;
}

/**
 * Initialize Sentry for the Node.js backend.
 * Only initializes if SENTRY_DSN_NODE is set.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN_NODE;
  if (!dsn) {
    console.log("[Sentry] No SENTRY_DSN_NODE set, skipping initialization");
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.ENVIRONMENT || process.env.NODE_ENV || "development",
    release: process.env.RELEASE || process.env.GIT_COMMIT_SHA || undefined,
    tracesSampleRate: 0.05,
    beforeSend,
    integrations: [Sentry.expressIntegration()],
  });

  console.log("[Sentry] Initialized for Node.js backend");
}

/** Re-export Sentry for use in other modules */
export { Sentry };
