import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildFunnelEventKey,
  trackFunnelEvent,
  type FunnelTelemetryEvent,
} from "./funnelTracker";

function createDbInsertMock(options: { rows?: Array<{ id: number }>; error?: Error }) {
  const returning = vi.fn();
  if (options.error) {
    returning.mockRejectedValue(options.error);
  } else {
    returning.mockResolvedValue(options.rows ?? []);
  }

  const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  const insert = vi.fn().mockReturnValue({ values });

  return {
    db: { insert } as any,
    values,
    onConflictDoNothing,
    returning,
  };
}

describe("buildFunnelEventKey", () => {
  it("is deterministic for identical input", () => {
    const eventTime = new Date("2026-02-16T12:34:56.000Z");

    const a = buildFunnelEventKey({
      tenantId: "tenant-001",
      userId: 42,
      eventName: "signup_completed",
      eventTime,
    });
    const b = buildFunnelEventKey({
      tenantId: "tenant-001",
      userId: 42,
      eventName: "signup_completed",
      eventTime,
    });

    expect(a).toBe(b);
  });
});

describe("trackFunnelEvent", () => {
  const now = new Date("2026-02-16T08:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes canonical event shape with defaults", async () => {
    const insertMock = createDbInsertMock({ rows: [{ id: 1 }] });

    const result = await trackFunnelEvent(
      {
        tenantId: "tenant-001",
        domain: "example.com",
        userId: 123,
        eventName: "signup_completed",
      },
      {
        db: insertMock.db,
        analyticsProvider: "none",
        now: () => now,
      },
    );

    expect(result.status).toBe("inserted");
    expect(insertMock.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-001",
        domain: "example.com",
        userId: 123,
        eventName: "signup_completed",
        eventTime: now,
        eventKey: expect.any(String),
        properties: {},
      }),
    );
  });

  it("returns duplicate_ignored on dedup conflict", async () => {
    const insertMock = createDbInsertMock({ rows: [] });
    const emitTelemetry = vi.fn<(event: FunnelTelemetryEvent, payload: Record<string, unknown>) => void>();

    const result = await trackFunnelEvent(
      {
        tenantId: "tenant-001",
        userId: 7,
        eventName: "email_verified",
      },
      {
        db: insertMock.db,
        analyticsProvider: "none",
        now: () => now,
        emitTelemetry,
      },
    );

    expect(result.status).toBe("duplicate_ignored");
    expect(emitTelemetry).toHaveBeenCalledWith(
      "funnel_tracker_duplicate",
      expect.objectContaining({
        tenantId: "tenant-001",
        eventName: "email_verified",
      }),
    );
  });

  it("keeps primary insert successful when side channels fail", async () => {
    const insertMock = createDbInsertMock({ rows: [{ id: 99 }] });
    const capturePosthogEvent = vi.fn().mockImplementation(() => {
      throw new Error("posthog down");
    });
    const sendGa4Event = vi.fn().mockRejectedValue(new Error("ga4 down"));
    const logger = { warn: vi.fn() };

    const result = await trackFunnelEvent(
      {
        tenantId: "tenant-001",
        userId: 9,
        eventName: "first_llm_request",
      },
      {
        db: insertMock.db,
        analyticsProvider: "both",
        now: () => now,
        capturePosthogEvent,
        sendGa4Event,
        logger,
      },
    );

    expect(result.status).toBe("inserted");
    expect(result.sideChannelErrors).toEqual(
      expect.arrayContaining(["posthog", "ga4"]),
    );
  });

  it("returns failed when insert throws", async () => {
    const insertMock = createDbInsertMock({ error: new Error("db unavailable") });

    const result = await trackFunnelEvent(
      {
        tenantId: "tenant-001",
        userId: 9,
        eventName: "first_media_generation",
      },
      {
        db: insertMock.db,
        analyticsProvider: "none",
        now: () => now,
      },
    );

    expect(result.status).toBe("failed");
    expect(result.error).toContain("db unavailable");
  });
});
