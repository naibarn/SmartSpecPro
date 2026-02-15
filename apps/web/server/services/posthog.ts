/**
 * PostHog Server-Side SDK (Node.js)
 *
 * Provides server-side event capture, identity management, and
 * a no-op stub when the API key is not configured.
 */

import { PostHog } from "posthog-node";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (client) return client;
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) return null;

  client = new PostHog(apiKey, {
    host: "https://us.i.posthog.com",
    flushAt: 20,
    flushInterval: 10000,
  });
  return client;
}

/** Returns the PostHog client, or null if not configured. */
export function getPostHogServer(): PostHog | null {
  return getClient();
}

/** Capture a server-side event with standard properties. */
export function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): void {
  const ph = getClient();
  if (!ph) return;

  ph.capture({
    distinctId,
    event,
    properties: {
      ...properties,
      environment: process.env.ENVIRONMENT || process.env.NODE_ENV || "development",
      release: process.env.RELEASE || process.env.GIT_COMMIT_SHA || undefined,
    },
  });
}

/** Identify a user with person properties. */
export function identifyUser(
  userId: string,
  properties?: Record<string, unknown>,
): void {
  const ph = getClient();
  if (!ph) return;

  ph.identify({ distinctId: userId, properties });
}

/** Alias an anonymous ID to a user ID (called once on signup). */
export function aliasUser(anonymousId: string, userId: string): void {
  const ph = getClient();
  if (!ph) return;

  ph.alias({ distinctId: userId, alias: anonymousId });
}

/** Flush remaining events and shut down. Called on SIGTERM/SIGINT. */
export async function shutdownPostHog(): Promise<void> {
  if (!client) return;
  await client.shutdown();
  client = null;
}
