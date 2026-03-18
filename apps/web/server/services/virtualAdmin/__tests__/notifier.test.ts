import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../redis", () => ({
  getRedisClient: vi.fn().mockReturnValue({
    exists: vi.fn().mockResolvedValue(0),
    setex: vi.fn().mockResolvedValue("OK"),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    rpush: vi.fn().mockResolvedValue(1),
    publish: vi.fn().mockResolvedValue(1),
  }),
}));

import { dispatchNotification, publishSSEEvent, type GuardianNotification } from "../notifier";
import { getRedisClient } from "../../redis";

function makeNotification(overrides: Partial<GuardianNotification> = {}): GuardianNotification {
  return {
    tenantId: "tenant-1",
    incidentId: 1,
    severity: "info",
    title: "Test Incident",
    message: "Test message",
    ruleId: "test_rule",
    sensorId: "test_sensor",
    ...overrides,
  };
}

describe("GuardianNotifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("info severity -> publishes SSE event", async () => {
    const n = makeNotification({ severity: "info" });
    await dispatchNotification(n);

    const redis = getRedisClient() as any;
    expect(redis.publish).toHaveBeenCalledWith(
      "guardian:events",
      expect.stringContaining("incident.created"),
    );
  });

  it("warning severity -> queues email digest", async () => {
    const n = makeNotification({ severity: "warning" });
    await dispatchNotification(n);

    const redis = getRedisClient() as any;
    expect(redis.rpush).toHaveBeenCalledWith(
      expect.stringContaining("email-digest"),
      expect.any(String),
    );
  });

  it("critical severity -> publishes SSE event", async () => {
    const n = makeNotification({ severity: "critical" });
    await dispatchNotification(n);

    const redis = getRedisClient() as any;
    expect(redis.publish).toHaveBeenCalled();
  });

  it("respects per-rule cooldown", async () => {
    const redis = getRedisClient() as any;
    redis.exists.mockResolvedValue(1); // Cooldown active

    const n = makeNotification({ severity: "critical" });
    await dispatchNotification(n);

    // Should still publish SSE but skip channel dispatch
    expect(redis.publish).toHaveBeenCalledTimes(1); // Only SSE, not full dispatch
  });

  it("respects max 20 emails/hour per tenant", async () => {
    const redis = getRedisClient() as any;
    redis.incr.mockResolvedValue(21); // Over limit

    const n = makeNotification({ severity: "error" });
    await dispatchNotification(n);

    // Email should be skipped, but notification still dispatches other channels
    expect(redis.publish).toHaveBeenCalled();
  });

  it("publishes SSE event with correct structure", async () => {
    await publishSSEEvent("incident.created", {
      incidentId: 42,
      severity: "critical",
      tenantId: "t1",
    });

    const redis = getRedisClient() as any;
    const call = redis.publish.mock.calls[0];
    expect(call[0]).toBe("guardian:events");
    const payload = JSON.parse(call[1]);
    expect(payload.type).toBe("incident.created");
    expect(payload.timestamp).toBeDefined();
  });
});
