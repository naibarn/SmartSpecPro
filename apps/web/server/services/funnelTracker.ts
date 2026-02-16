import { funnelEvents } from "../../drizzle/schema";
import { getDb } from "../db";
import { captureServerEvent } from "./posthog";

export type AnalyticsProvider = "posthog" | "ga4" | "both" | "none";
export type FunnelTrackStatus = "inserted" | "duplicate_ignored" | "failed";
export type FunnelTelemetryEvent =
  | "funnel_tracker_inserted"
  | "funnel_tracker_duplicate"
  | "funnel_tracker_failed"
  | "funnel_tracker_sidechannel_error";

export interface FunnelTrackInput {
  tenantId: string;
  domain?: string | null;
  userId?: number | null;
  eventName: string;
  eventTime?: Date;
  properties?: Record<string, unknown>;
}

export interface FunnelTrackResult {
  status: FunnelTrackStatus;
  eventKey: string;
  sideChannelErrors: string[];
  durationMs: number;
  error?: string;
}

type FunnelTrackerDb = {
  insert: (...args: any[]) => any;
};

interface Ga4SendInput {
  distinctId: string;
  userId?: string;
  eventName: string;
  eventTime: Date;
  properties: Record<string, unknown>;
}

export interface FunnelTrackerDeps {
  db?: FunnelTrackerDb | null;
  now?: () => Date;
  analyticsProvider?: AnalyticsProvider;
  capturePosthogEvent?: (
    distinctId: string,
    eventName: string,
    properties: Record<string, unknown>,
  ) => void | Promise<void>;
  sendGa4Event?: (input: Ga4SendInput) => Promise<void>;
  emitTelemetry?: (event: FunnelTelemetryEvent, payload: Record<string, unknown>) => void;
  logger?: Pick<Console, "warn">;
}

export function buildFunnelEventKey(input: {
  tenantId: string;
  userId?: number | null;
  eventName: string;
  eventTime: Date;
}): string {
  const dayBucket = toUtcDayBucket(input.eventTime);
  const userPart = input.userId == null ? "anon" : String(input.userId);
  return `${input.tenantId}:${userPart}:${input.eventName}:${dayBucket}`;
}

export async function trackFunnelEvent(
  input: FunnelTrackInput,
  deps: FunnelTrackerDeps = {},
): Promise<FunnelTrackResult> {
  const now = deps.now ?? (() => new Date());
  const startedAt = Date.now();
  const eventTime = input.eventTime ?? now();
  const eventKey = buildFunnelEventKey({
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    eventName: input.eventName,
    eventTime,
  });

  const emitTelemetry = deps.emitTelemetry ?? (() => undefined);
  const logger = deps.logger ?? console;
  const analyticsProvider = resolveAnalyticsProvider(deps.analyticsProvider);

  const db = deps.db ?? (await getDb());
  if (!db) {
    const durationMs = Date.now() - startedAt;
    emitTelemetry("funnel_tracker_failed", {
      tenantId: input.tenantId,
      eventName: input.eventName,
      reason: "db_unavailable",
      durationMs,
    });
    return {
      status: "failed",
      eventKey,
      sideChannelErrors: [],
      durationMs,
      error: "database unavailable",
    };
  }

  try {
    const inserted = await db
      .insert(funnelEvents)
      .values({
        tenantId: input.tenantId,
        domain: input.domain ?? null,
        userId: input.userId ?? null,
        eventName: input.eventName,
        eventTime,
        eventKey,
        properties: input.properties ?? {},
      })
      .onConflictDoNothing({ target: funnelEvents.eventKey })
      .returning({ id: funnelEvents.id });

    const insertedRow = inserted.length > 0;
    const sideChannelErrors: string[] = [];

    if (insertedRow) {
      await emitSideChannels({
        analyticsProvider,
        input,
        eventKey,
        eventTime,
        deps,
        sideChannelErrors,
        emitTelemetry,
        logger,
      });
      emitTelemetry("funnel_tracker_inserted", {
        tenantId: input.tenantId,
        eventName: input.eventName,
      });
    } else {
      emitTelemetry("funnel_tracker_duplicate", {
        tenantId: input.tenantId,
        eventName: input.eventName,
        eventKey,
      });
    }

    return {
      status: insertedRow ? "inserted" : "duplicate_ignored",
      eventKey,
      sideChannelErrors,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = toErrorMessage(error);
    emitTelemetry("funnel_tracker_failed", {
      tenantId: input.tenantId,
      eventName: input.eventName,
      reason: message,
    });

    return {
      status: "failed",
      eventKey,
      sideChannelErrors: [],
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
}

async function emitSideChannels(args: {
  analyticsProvider: AnalyticsProvider;
  input: FunnelTrackInput;
  eventKey: string;
  eventTime: Date;
  deps: FunnelTrackerDeps;
  sideChannelErrors: string[];
  emitTelemetry: (event: FunnelTelemetryEvent, payload: Record<string, unknown>) => void;
  logger: Pick<Console, "warn">;
}): Promise<void> {
  const { analyticsProvider } = args;
  const distinctId =
    args.input.userId == null
      ? `tenant-${args.input.tenantId}`
      : `user-${args.input.userId}`;
  const baseProperties: Record<string, unknown> = {
    ...(args.input.properties ?? {}),
    tenantId: args.input.tenantId,
    domain: args.input.domain ?? undefined,
    eventKey: args.eventKey,
    eventTime: args.eventTime.toISOString(),
  };

  if (analyticsProvider === "posthog" || analyticsProvider === "both") {
    try {
      const capture = args.deps.capturePosthogEvent ?? captureServerEvent;
      await capture(distinctId, args.input.eventName, baseProperties);
    } catch (error) {
      args.sideChannelErrors.push("posthog");
      args.emitTelemetry("funnel_tracker_sidechannel_error", {
        provider: "posthog",
        tenantId: args.input.tenantId,
        eventName: args.input.eventName,
        error: toErrorMessage(error),
      });
      args.logger.warn("[FunnelTracker] PostHog side-channel failure", {
        tenantId: args.input.tenantId,
        eventName: args.input.eventName,
        error: toErrorMessage(error),
      });
    }
  }

  if (analyticsProvider === "ga4" || analyticsProvider === "both") {
    try {
      const sendGa4 = args.deps.sendGa4Event ?? defaultGa4Sender;
      await sendGa4({
        distinctId,
        userId: args.input.userId == null ? undefined : String(args.input.userId),
        eventName: args.input.eventName,
        eventTime: args.eventTime,
        properties: baseProperties,
      });
    } catch (error) {
      args.sideChannelErrors.push("ga4");
      args.emitTelemetry("funnel_tracker_sidechannel_error", {
        provider: "ga4",
        tenantId: args.input.tenantId,
        eventName: args.input.eventName,
        error: toErrorMessage(error),
      });
      args.logger.warn("[FunnelTracker] GA4 side-channel failure", {
        tenantId: args.input.tenantId,
        eventName: args.input.eventName,
        error: toErrorMessage(error),
      });
    }
  }
}

async function defaultGa4Sender(input: Ga4SendInput): Promise<void> {
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;
  if (!measurementId || !apiSecret) {
    return;
  }

  const fetchImpl = globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) {
    throw new Error("fetch unavailable");
  }

  const endpoint = new URL("https://www.google-analytics.com/mp/collect");
  endpoint.searchParams.set("measurement_id", measurementId);
  endpoint.searchParams.set("api_secret", apiSecret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        client_id: input.distinctId,
        user_id: input.userId,
        timestamp_micros: Number(input.eventTime.getTime()) * 1000,
        events: [
          {
            name: toGa4EventName(input.eventName),
            params: sanitizeGa4Params(input.properties),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ga4_http_${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeGa4Params(input: Record<string, unknown>): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      params[key] = value;
    }
  }
  return params;
}

function resolveAnalyticsProvider(provider?: AnalyticsProvider): AnalyticsProvider {
  if (provider) return provider;
  const envProvider = process.env.ANALYTICS_PROVIDER;
  if (envProvider === "posthog" || envProvider === "ga4" || envProvider === "both" || envProvider === "none") {
    return envProvider;
  }
  return "posthog";
}

function toUtcDayBucket(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toGa4EventName(eventName: string): string {
  return eventName.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
