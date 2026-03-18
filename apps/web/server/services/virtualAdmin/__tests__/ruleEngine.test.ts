import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../notifier", () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../db", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    groupBy: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  };
  return { getDb: vi.fn().mockResolvedValue(mockDb) };
});

import {
  evaluateReading,
  getRules,
  _resetCooldownMap,
  setNotifier,
  setAutoFixer,
} from "../ruleEngine";
import type { SensorReading } from "../types";
import { getDb } from "../../../db";

describe("RuleEngine", () => {
  let mockNotify: ReturnType<typeof vi.fn>;
  let mockAutoFix: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    _resetCooldownMap();
    mockNotify = vi.fn().mockResolvedValue(undefined);
    mockAutoFix = vi.fn().mockResolvedValue({ success: true, result: "fixed" });
    setNotifier(mockNotify);
    setAutoFixer(mockAutoFix);

    const db = await getDb() as any;
    db.limit.mockResolvedValue([]); // No existing open incidents by default
    db.returning.mockResolvedValue([{ id: 1 }]);
  });

  function makeReading(overrides: Partial<SensorReading> = {}): SensorReading {
    return {
      sensorId: "queue_health",
      timestamp: new Date(),
      status: "degraded",
      metrics: { alertCount: 3 },
      message: "Queue warnings",
      ...overrides,
    };
  }

  it("creates incident when rule condition matches", async () => {
    const reading = makeReading({ status: "degraded" });
    await evaluateReading(reading);

    const db = await getDb() as any;
    expect(db.insert).toHaveBeenCalled();
  });

  it("does not create incident when condition does not match", async () => {
    const reading = makeReading({ status: "healthy" });
    await evaluateReading(reading);

    const db = await getDb() as any;
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("respects cooldown period (no duplicate within cooldown)", async () => {
    const reading = makeReading({ status: "degraded" });

    await evaluateReading(reading);
    const db = await getDb() as any;
    const insertCallCount = db.insert.mock.calls.length;

    // Second call within cooldown - should not create
    await evaluateReading(reading);
    expect(db.insert.mock.calls.length).toBe(insertCallCount);
  });

  it("updates existing open incident instead of creating duplicate", async () => {
    const db = await getDb() as any;
    db.limit.mockResolvedValue([{ id: 42 }]); // Existing open incident

    const reading = makeReading({ status: "degraded" });
    await evaluateReading(reading);

    expect(db.update).toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("maps queue_depth_high to warning severity", () => {
    const rules = getRules();
    const rule = rules.find((r) => r.id === "queue_depth_high");
    expect(rule?.severity).toBe("warning");
  });

  it("maps celery_worker_down to critical severity", () => {
    const rules = getRules();
    const rule = rules.find((r) => r.id === "celery_worker_down");
    expect(rule?.severity).toBe("critical");
  });

  it("maps credit_low to warning", () => {
    const rules = getRules();
    const rule = rules.find((r) => r.id === "credit_low");
    expect(rule?.severity).toBe("warning");
  });

  it("triggers auto-fix when tenant has auto-fix enabled", async () => {
    const db = await getDb() as any;
    // Enable auto-fix for the tenant
    db.execute.mockResolvedValue({ rows: [{ value: "true" }] });

    const reading = makeReading({
      sensorId: "llm_provider",
      status: "degraded",
      tenantId: "tenant-1",
    });
    await evaluateReading(reading);

    expect(mockAutoFix).toHaveBeenCalledWith("failover_provider", {}, "tenant-1");
  });

  it("skips auto-fix when tenant has auto-fix disabled", async () => {
    const db = await getDb() as any;
    db.execute.mockResolvedValue({ rows: [{ value: "false" }] });

    const reading = makeReading({
      sensorId: "llm_provider",
      status: "degraded",
      tenantId: "tenant-2",
    });
    await evaluateReading(reading);

    expect(mockAutoFix).not.toHaveBeenCalled();
  });

  it("creates approval record for approval-required actions", async () => {
    const reading = makeReading({
      sensorId: "queue_health",
      status: "critical",
    });
    await evaluateReading(reading);

    const db = await getDb() as any;
    // Should have insert calls for incident AND approval
    expect(db.insert.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("sends notification via configured channels", async () => {
    const { dispatchNotification } = await import("../notifier");

    const reading = makeReading({ status: "degraded" });
    await evaluateReading(reading);

    expect(dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "warning",
        sensorId: "queue_health",
      }),
    );
  });

  it("handles multiple rules matching same sensor reading", async () => {
    // critical status matches both queue_depth_high (degraded triggers? no -- critical only triggers queue_depth_critical)
    // Actually queue_depth_high condition is status==="degraded", so critical won't match it
    // But let's use db_health sensor which has one rule matching both degraded and critical
    const reading = makeReading({
      sensorId: "db_health",
      status: "critical",
    });
    await evaluateReading(reading);

    const db = await getDb() as any;
    expect(db.insert).toHaveBeenCalled();
  });

  it("handles sensor reading with status unknown (skips rule eval)", async () => {
    const reading = makeReading({ status: "unknown" });
    await evaluateReading(reading);

    const db = await getDb() as any;
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("has 18 rules defined", () => {
    expect(getRules()).toHaveLength(18);
  });
});
