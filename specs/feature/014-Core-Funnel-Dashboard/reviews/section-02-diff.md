diff --git a/apps/web/server/services/funnelTracker.test.ts b/apps/web/server/services/funnelTracker.test.ts
new file mode 100644
index 0000000..1361bda
--- /dev/null
+++ b/apps/web/server/services/funnelTracker.test.ts
@@ -0,0 +1,165 @@
+import { beforeEach, describe, expect, it, vi } from "vitest";
+
+import {
+  buildFunnelEventKey,
+  trackFunnelEvent,
+  type FunnelTelemetryEvent,
+} from "./funnelTracker";
+
+function createDbInsertMock(options: { rows?: Array<{ id: number }>; error?: Error }) {
+  const returning = vi.fn();
+  if (options.error) {
+    returning.mockRejectedValue(options.error);
+  } else {
+    returning.mockResolvedValue(options.rows ?? []);
+  }
+
+  const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
+  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
+  const insert = vi.fn().mockReturnValue({ values });
+
+  return {
+    db: { insert } as any,
+    values,
+    onConflictDoNothing,
+    returning,
+  };
+}
+
+describe("buildFunnelEventKey", () => {
+  it("is deterministic for identical input", () => {
+    const eventTime = new Date("2026-02-16T12:34:56.000Z");
+
+    const a = buildFunnelEventKey({
+      tenantId: "tenant-001",
+      userId: 42,
+      eventName: "signup_completed",
+      eventTime,
+    });
+    const b = buildFunnelEventKey({
+      tenantId: "tenant-001",
+      userId: 42,
+      eventName: "signup_completed",
+      eventTime,
+    });
+
+    expect(a).toBe(b);
+  });
+});
+
+describe("trackFunnelEvent", () => {
+  const now = new Date("2026-02-16T08:00:00.000Z");
+
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("writes canonical event shape with defaults", async () => {
+    const insertMock = createDbInsertMock({ rows: [{ id: 1 }] });
+
+    const result = await trackFunnelEvent(
+      {
+        tenantId: "tenant-001",
+        domain: "example.com",
+        userId: 123,
+        eventName: "signup_completed",
+      },
+      {
+        db: insertMock.db,
+        analyticsProvider: "none",
+        now: () => now,
+      },
+    );
+
+    expect(result.status).toBe("inserted");
+    expect(insertMock.values).toHaveBeenCalledWith(
+      expect.objectContaining({
+        tenantId: "tenant-001",
+        domain: "example.com",
+        userId: 123,
+        eventName: "signup_completed",
+        eventTime: now,
+        eventKey: expect.any(String),
+        properties: {},
+      }),
+    );
+  });
+
+  it("returns duplicate_ignored on dedup conflict", async () => {
+    const insertMock = createDbInsertMock({ rows: [] });
+    const emitTelemetry = vi.fn<(event: FunnelTelemetryEvent, payload: Record<string, unknown>) => void>();
+
+    const result = await trackFunnelEvent(
+      {
+        tenantId: "tenant-001",
+        userId: 7,
+        eventName: "email_verified",
+      },
+      {
+        db: insertMock.db,
+        analyticsProvider: "none",
+        now: () => now,
+        emitTelemetry,
+      },
+    );
+
+    expect(result.status).toBe("duplicate_ignored");
+    expect(emitTelemetry).toHaveBeenCalledWith(
+      "funnel_tracker_duplicate",
+      expect.objectContaining({
+        tenantId: "tenant-001",
+        eventName: "email_verified",
+      }),
+    );
+  });
+
+  it("keeps primary insert successful when side channels fail", async () => {
+    const insertMock = createDbInsertMock({ rows: [{ id: 99 }] });
+    const capturePosthogEvent = vi.fn().mockImplementation(() => {
+      throw new Error("posthog down");
+    });
+    const sendGa4Event = vi.fn().mockRejectedValue(new Error("ga4 down"));
+    const logger = { warn: vi.fn() };
+
+    const result = await trackFunnelEvent(
+      {
+        tenantId: "tenant-001",
+        userId: 9,
+        eventName: "first_llm_request",
+      },
+      {
+        db: insertMock.db,
+        analyticsProvider: "both",
+        now: () => now,
+        capturePosthogEvent,
+        sendGa4Event,
+        logger,
+      },
+    );
+
+    expect(result.status).toBe("inserted");
+    expect(result.sideChannelErrors).toEqual(
+      expect.arrayContaining(["posthog", "ga4"]),
+    );
+  });
+
+  it("returns failed when insert throws", async () => {
+    const insertMock = createDbInsertMock({ error: new Error("db unavailable") });
+
+    const result = await trackFunnelEvent(
+      {
+        tenantId: "tenant-001",
+        userId: 9,
+        eventName: "first_media_generation",
+      },
+      {
+        db: insertMock.db,
+        analyticsProvider: "none",
+        now: () => now,
+      },
+    );
+
+    expect(result.status).toBe("failed");
+    expect(result.error).toContain("db unavailable");
+  });
+});
diff --git a/apps/web/server/services/funnelTracker.ts b/apps/web/server/services/funnelTracker.ts
new file mode 100644
index 0000000..a722a95
--- /dev/null
+++ b/apps/web/server/services/funnelTracker.ts
@@ -0,0 +1,315 @@
+import { funnelEvents } from "../../drizzle/schema";
+import { getDb } from "../db";
+import { captureServerEvent } from "./posthog";
+
+export type AnalyticsProvider = "posthog" | "ga4" | "both" | "none";
+export type FunnelTrackStatus = "inserted" | "duplicate_ignored" | "failed";
+export type FunnelTelemetryEvent =
+  | "funnel_tracker_inserted"
+  | "funnel_tracker_duplicate"
+  | "funnel_tracker_failed"
+  | "funnel_tracker_sidechannel_error";
+
+export interface FunnelTrackInput {
+  tenantId: string;
+  domain?: string | null;
+  userId?: number | null;
+  eventName: string;
+  eventTime?: Date;
+  properties?: Record<string, unknown>;
+}
+
+export interface FunnelTrackResult {
+  status: FunnelTrackStatus;
+  eventKey: string;
+  sideChannelErrors: string[];
+  durationMs: number;
+  error?: string;
+}
+
+type FunnelTrackerDb = {
+  insert: (...args: any[]) => any;
+};
+
+interface Ga4SendInput {
+  distinctId: string;
+  userId?: string;
+  eventName: string;
+  eventTime: Date;
+  properties: Record<string, unknown>;
+}
+
+export interface FunnelTrackerDeps {
+  db?: FunnelTrackerDb | null;
+  now?: () => Date;
+  analyticsProvider?: AnalyticsProvider;
+  capturePosthogEvent?: (
+    distinctId: string,
+    eventName: string,
+    properties: Record<string, unknown>,
+  ) => void | Promise<void>;
+  sendGa4Event?: (input: Ga4SendInput) => Promise<void>;
+  emitTelemetry?: (event: FunnelTelemetryEvent, payload: Record<string, unknown>) => void;
+  logger?: Pick<Console, "warn">;
+}
+
+export function buildFunnelEventKey(input: {
+  tenantId: string;
+  userId?: number | null;
+  eventName: string;
+  eventTime: Date;
+}): string {
+  const dayBucket = toUtcDayBucket(input.eventTime);
+  const userPart = input.userId == null ? "anon" : String(input.userId);
+  return `${input.tenantId}:${userPart}:${input.eventName}:${dayBucket}`;
+}
+
+export async function trackFunnelEvent(
+  input: FunnelTrackInput,
+  deps: FunnelTrackerDeps = {},
+): Promise<FunnelTrackResult> {
+  const now = deps.now ?? (() => new Date());
+  const startedAt = Date.now();
+  const eventTime = input.eventTime ?? now();
+  const eventKey = buildFunnelEventKey({
+    tenantId: input.tenantId,
+    userId: input.userId ?? null,
+    eventName: input.eventName,
+    eventTime,
+  });
+
+  const emitTelemetry = deps.emitTelemetry ?? (() => undefined);
+  const logger = deps.logger ?? console;
+  const analyticsProvider = resolveAnalyticsProvider(deps.analyticsProvider);
+
+  const db = deps.db ?? (await getDb());
+  if (!db) {
+    const durationMs = Date.now() - startedAt;
+    emitTelemetry("funnel_tracker_failed", {
+      tenantId: input.tenantId,
+      eventName: input.eventName,
+      reason: "db_unavailable",
+      durationMs,
+    });
+    return {
+      status: "failed",
+      eventKey,
+      sideChannelErrors: [],
+      durationMs,
+      error: "database unavailable",
+    };
+  }
+
+  try {
+    const inserted = await db
+      .insert(funnelEvents)
+      .values({
+        tenantId: input.tenantId,
+        domain: input.domain ?? null,
+        userId: input.userId ?? null,
+        eventName: input.eventName,
+        eventTime,
+        eventKey,
+        properties: input.properties ?? {},
+      })
+      .onConflictDoNothing({ target: funnelEvents.eventKey })
+      .returning({ id: funnelEvents.id });
+
+    const insertedRow = inserted.length > 0;
+    const sideChannelErrors: string[] = [];
+
+    if (insertedRow) {
+      await emitSideChannels({
+        analyticsProvider,
+        input,
+        eventKey,
+        eventTime,
+        deps,
+        sideChannelErrors,
+        emitTelemetry,
+        logger,
+      });
+      emitTelemetry("funnel_tracker_inserted", {
+        tenantId: input.tenantId,
+        eventName: input.eventName,
+      });
+    } else {
+      emitTelemetry("funnel_tracker_duplicate", {
+        tenantId: input.tenantId,
+        eventName: input.eventName,
+        eventKey,
+      });
+    }
+
+    return {
+      status: insertedRow ? "inserted" : "duplicate_ignored",
+      eventKey,
+      sideChannelErrors,
+      durationMs: Date.now() - startedAt,
+    };
+  } catch (error) {
+    const message = toErrorMessage(error);
+    emitTelemetry("funnel_tracker_failed", {
+      tenantId: input.tenantId,
+      eventName: input.eventName,
+      reason: message,
+    });
+
+    return {
+      status: "failed",
+      eventKey,
+      sideChannelErrors: [],
+      durationMs: Date.now() - startedAt,
+      error: message,
+    };
+  }
+}
+
+async function emitSideChannels(args: {
+  analyticsProvider: AnalyticsProvider;
+  input: FunnelTrackInput;
+  eventKey: string;
+  eventTime: Date;
+  deps: FunnelTrackerDeps;
+  sideChannelErrors: string[];
+  emitTelemetry: (event: FunnelTelemetryEvent, payload: Record<string, unknown>) => void;
+  logger: Pick<Console, "warn">;
+}): Promise<void> {
+  const { analyticsProvider } = args;
+  const distinctId =
+    args.input.userId == null
+      ? `tenant-${args.input.tenantId}`
+      : `user-${args.input.userId}`;
+  const baseProperties: Record<string, unknown> = {
+    ...(args.input.properties ?? {}),
+    tenantId: args.input.tenantId,
+    domain: args.input.domain ?? undefined,
+    eventKey: args.eventKey,
+    eventTime: args.eventTime.toISOString(),
+  };
+
+  if (analyticsProvider === "posthog" || analyticsProvider === "both") {
+    try {
+      const capture = args.deps.capturePosthogEvent ?? captureServerEvent;
+      await capture(distinctId, args.input.eventName, baseProperties);
+    } catch (error) {
+      args.sideChannelErrors.push("posthog");
+      args.emitTelemetry("funnel_tracker_sidechannel_error", {
+        provider: "posthog",
+        tenantId: args.input.tenantId,
+        eventName: args.input.eventName,
+        error: toErrorMessage(error),
+      });
+      args.logger.warn("[FunnelTracker] PostHog side-channel failure", {
+        tenantId: args.input.tenantId,
+        eventName: args.input.eventName,
+        error: toErrorMessage(error),
+      });
+    }
+  }
+
+  if (analyticsProvider === "ga4" || analyticsProvider === "both") {
+    try {
+      const sendGa4 = args.deps.sendGa4Event ?? defaultGa4Sender;
+      await sendGa4({
+        distinctId,
+        userId: args.input.userId == null ? undefined : String(args.input.userId),
+        eventName: args.input.eventName,
+        eventTime: args.eventTime,
+        properties: baseProperties,
+      });
+    } catch (error) {
+      args.sideChannelErrors.push("ga4");
+      args.emitTelemetry("funnel_tracker_sidechannel_error", {
+        provider: "ga4",
+        tenantId: args.input.tenantId,
+        eventName: args.input.eventName,
+        error: toErrorMessage(error),
+      });
+      args.logger.warn("[FunnelTracker] GA4 side-channel failure", {
+        tenantId: args.input.tenantId,
+        eventName: args.input.eventName,
+        error: toErrorMessage(error),
+      });
+    }
+  }
+}
+
+async function defaultGa4Sender(input: Ga4SendInput): Promise<void> {
+  const measurementId = process.env.GA4_MEASUREMENT_ID;
+  const apiSecret = process.env.GA4_API_SECRET;
+  if (!measurementId || !apiSecret) {
+    return;
+  }
+
+  const fetchImpl = globalThis.fetch?.bind(globalThis);
+  if (!fetchImpl) {
+    throw new Error("fetch unavailable");
+  }
+
+  const endpoint = new URL("https://www.google-analytics.com/mp/collect");
+  endpoint.searchParams.set("measurement_id", measurementId);
+  endpoint.searchParams.set("api_secret", apiSecret);
+
+  const controller = new AbortController();
+  const timeout = setTimeout(() => controller.abort(), 1500);
+
+  try {
+    const response = await fetchImpl(endpoint, {
+      method: "POST",
+      headers: {
+        "content-type": "application/json",
+      },
+      body: JSON.stringify({
+        client_id: input.distinctId,
+        user_id: input.userId,
+        timestamp_micros: Number(input.eventTime.getTime()) * 1000,
+        events: [
+          {
+            name: toGa4EventName(input.eventName),
+            params: sanitizeGa4Params(input.properties),
+          },
+        ],
+      }),
+      signal: controller.signal,
+    });
+
+    if (!response.ok) {
+      throw new Error(`ga4_http_${response.status}`);
+    }
+  } finally {
+    clearTimeout(timeout);
+  }
+}
+
+function sanitizeGa4Params(input: Record<string, unknown>): Record<string, string | number | boolean> {
+  const params: Record<string, string | number | boolean> = {};
+  for (const [key, value] of Object.entries(input)) {
+    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
+      params[key] = value;
+    }
+  }
+  return params;
+}
+
+function resolveAnalyticsProvider(provider?: AnalyticsProvider): AnalyticsProvider {
+  if (provider) return provider;
+  const envProvider = process.env.ANALYTICS_PROVIDER;
+  if (envProvider === "posthog" || envProvider === "ga4" || envProvider === "both" || envProvider === "none") {
+    return envProvider;
+  }
+  return "posthog";
+}
+
+function toUtcDayBucket(date: Date): string {
+  return date.toISOString().slice(0, 10);
+}
+
+function toGa4EventName(eventName: string): string {
+  return eventName.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40);
+}
+
+function toErrorMessage(error: unknown): string {
+  if (error instanceof Error) return error.message;
+  return String(error);
+}
diff --git a/specs/feature/014-Core-Funnel-Dashboard/implementation-decision-log.md b/specs/feature/014-Core-Funnel-Dashboard/implementation-decision-log.md
index 75ecf19..146b579 100644
--- a/specs/feature/014-Core-Funnel-Dashboard/implementation-decision-log.md
+++ b/specs/feature/014-Core-Funnel-Dashboard/implementation-decision-log.md
@@ -36,3 +36,21 @@
 
 ### Rationale
 - Keeps migration additive with lower lock/write overhead while covering core funnel milestone query paths.
+
+---
+
+### Section / Step
+- Section 02 side-channel execution policy
+
+### Options Considered
+- Block primary insert on side-channel failures
+- Keep primary insert authoritative; side channels best-effort only
+
+### Decision Taken
+- Keep side channels non-blocking and record failures via telemetry
+
+### Mode Used
+- `auto` (`smart_auto`, low-impact)
+
+### Rationale
+- Protects auth/usage flows from analytics provider outages while preserving first-event persistence guarantees.
diff --git a/specs/feature/014-Core-Funnel-Dashboard/implementation-progress.md b/specs/feature/014-Core-Funnel-Dashboard/implementation-progress.md
index b67f87b..7c07559 100644
--- a/specs/feature/014-Core-Funnel-Dashboard/implementation-progress.md
+++ b/specs/feature/014-Core-Funnel-Dashboard/implementation-progress.md
@@ -2,7 +2,7 @@
 
 ## Section 01: Data Schema, Migration, and Index Foundation
 - Status: completed
-- Commit: pending
+- Commit: `8f8c996`
 - Test command: `npm --workspace @smartspec/web test`
 - Section test run:
   - `npm --workspace @smartspec/web test -- server/__tests__/funnelEvents.schema.test.ts server/__tests__/funnelEvents.migration.test.ts` (pass)
@@ -12,3 +12,16 @@
   - Supporting indexes were limited to `registration_events`, `messages`, and `credit_transactions`.
 - Blocked tasks resolved/remaining:
   - none / none
+
+## Section 02: Tracker Service, Dedup, and Analytics Side Channels
+- Status: completed
+- Commit: pending
+- Test command: `npm --workspace @smartspec/web test`
+- Section test run:
+  - `npm --workspace @smartspec/web test -- server/services/funnelTracker.test.ts` (pass)
+- Regression subset:
+  - `npm --workspace @smartspec/web test -- server/services/funnelTracker.test.ts server/services/__tests__/posthogEvents.test.ts server/services/__tests__/posthogIdentity.test.ts server/__tests__/funnelEvents.schema.test.ts server/__tests__/funnelEvents.migration.test.ts` (pass)
+- Notable deviations:
+  - provider selection resolved from runtime env for minimal write-path overhead.
+- Blocked tasks resolved/remaining:
+  - none / none
diff --git a/specs/feature/014-Core-Funnel-Dashboard/reviews/section-02-review.md b/specs/feature/014-Core-Funnel-Dashboard/reviews/section-02-review.md
new file mode 100644
index 0000000..8ac7ce3
--- /dev/null
+++ b/specs/feature/014-Core-Funnel-Dashboard/reviews/section-02-review.md
@@ -0,0 +1,15 @@
+# Section 02 Review
+
+## Scope Reviewed
+- `apps/web/server/services/funnelTracker.ts`
+- `apps/web/server/services/funnelTracker.test.ts`
+
+## Findings
+- No blocking correctness issues identified in the tracker service slice.
+- Dedup and insert-once semantics are explicitly enforced in both service logic and Section 01 schema constraints.
+- Side-channel failures are isolated from primary persistence and are observable through telemetry hooks.
+- Result model is explicit and test-covered for inserted, duplicate, and failure paths.
+
+## Risks / Follow-Ups
+- GA4 sender currently uses direct fetch with timeout; confirm production egress behavior and retry policy when moving into milestone instrumentation (section 03).
+- Telemetry currently uses injected hook/console; wire to centralized metrics sink in hardening phases if required.
diff --git a/specs/feature/014-Core-Funnel-Dashboard/sections/section-02-tracker-service-dedup-and-analytics-sidechannels.md b/specs/feature/014-Core-Funnel-Dashboard/sections/section-02-tracker-service-dedup-and-analytics-sidechannels.md
new file mode 100644
index 0000000..5c2d790
--- /dev/null
+++ b/specs/feature/014-Core-Funnel-Dashboard/sections/section-02-tracker-service-dedup-and-analytics-sidechannels.md
@@ -0,0 +1,74 @@
+# Section 02: Tracker Service, Dedup, and Analytics Side Channels
+
+## Objective
+Implement a unified server funnel tracker that writes canonical milestone events reliably, enforces deterministic first-event dedup semantics, and emits non-blocking analytics side-channel events.
+
+## Scope
+- Create funnel tracking service with standardized event write contract.
+- Implement deterministic dedup key construction and conflict-handling policy (`insert-once`).
+- Integrate PostHog server capture and GA4 sender as optional non-blocking side channels.
+- Add conflict/health telemetry for dedup and side-channel failures.
+
+## Out of Scope
+- Wiring tracker into all business flows.
+- Analytics router query procedures.
+- Dashboard UI rendering.
+- Backfill orchestration.
+
+## Dependencies
+- section-01-data-schema-migration-and-index-foundation
+
+## Implementation Tasks
+1. Introduce a tracker module that accepts a normalized event payload and persists to `funnel_events`.
+2. Define canonical dedup key generation (tenant scope + user + event name + first-occurrence bucket rules).
+3. Enforce conflict behavior at write time: preserve first write, ignore duplicate conflict updates.
+4. Add service-level result model indicating `inserted`, `duplicate_ignored`, or `failed` states.
+5. Implement PostHog and GA4 sender adapters behind existing analytics settings.
+6. Ensure side-channel failures never block primary event persistence.
+7. Emit structured logs/metrics for conflict rate, side-channel errors, and write latency.
+
+## TDD-First Test Stubs
+- Test: tracker writes canonical event shape with required fields and defaults.
+- Test: deterministic dedup key generation is stable for identical input.
+- Test: duplicate first-event write resolves to conflict-ignored behavior (no second row).
+- Test: side-channel adapter failures do not fail primary insert path.
+- Test: tracker result model distinguishes inserted vs duplicate vs failure outcomes.
+- Test: dedup conflict telemetry is emitted with expected labels.
+
+## Risk Controls
+- Keep write path minimal and non-blocking for auth-critical transactions.
+- Guard side channels by feature/config toggles and bounded timeout behavior.
+- Avoid mutable overwrite semantics for first-event milestones.
+
+## Deliverables
+- Funnel tracker service and dedup key helper.
+- GA4 sender integration and PostHog side-channel hook.
+- Unit tests for dedup, conflict handling, and fail-safe side-channel behavior.
+
+## Done Criteria
+- Primary event persistence works independently of external analytics providers.
+- Dedup contract is enforced in both service logic and DB constraint behavior.
+- Telemetry exists for insert outcomes and failure diagnostics.
+
+## As-Built Update (2026-02-16)
+
+### Files Changed
+- `apps/web/server/services/funnelTracker.ts`
+- `apps/web/server/services/funnelTracker.test.ts`
+
+### Implementation Notes
+- Added `trackFunnelEvent` service with deterministic event-key generation and insert-once conflict behavior (`onConflictDoNothing` on `eventKey`).
+- Implemented result model states: `inserted`, `duplicate_ignored`, and `failed`.
+- Added optional, non-blocking PostHog and GA4 side-channel dispatch with provider gating from `ANALYTICS_PROVIDER`.
+- Added telemetry hooks for insert, duplicate, failed, and side-channel-error outcomes.
+
+### Deviation From Plan
+- Analytics provider configuration currently resolves from process env (`ANALYTICS_PROVIDER`, `GA4_MEASUREMENT_ID`, `GA4_API_SECRET`) rather than dynamic settings reads to keep write-path latency minimal.
+
+### Tests Added
+- `apps/web/server/services/funnelTracker.test.ts`
+  - canonical event payload and defaults
+  - deterministic dedup key stability
+  - duplicate conflict handling
+  - non-blocking side-channel failures
+  - explicit failure result on DB write errors
