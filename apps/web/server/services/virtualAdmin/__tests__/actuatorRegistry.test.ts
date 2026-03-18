import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  };
  return { getDb: vi.fn().mockResolvedValue(mockDb) };
});

vi.mock("../../redis", () => ({
  getRedisClient: vi.fn().mockReturnValue({
    publish: vi.fn().mockResolvedValue(1),
  }),
}));

import {
  registerActuator,
  getActuator,
  executeAction,
  decideApproval,
  expireStaleApprovals,
} from "../actuatorRegistry";
import { getDb } from "../../../db";
import type { ActuatorFn } from "../types";

describe("ActuatorRegistry", () => {
  let mockDb: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDb = await getDb();
  });

  describe("auto-fix actions", () => {
    it("executes registered auto-fix action and updates incident", async () => {
      const testFn: ActuatorFn = vi.fn().mockResolvedValue({
        success: true,
        message: "Fixed",
      });
      registerActuator("test_auto_fix", testFn);

      const result = await executeAction(
        "test_auto_fix",
        { key: "val" },
        { id: 1, severity: "warning" },
      );

      expect(result.success).toBe(true);
      expect(testFn).toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("returns error for unknown action type", async () => {
      const result = await executeAction(
        "nonexistent_action",
        {},
        { id: 1, severity: "info" },
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("Unknown action type");
    });

    it("handles auto-fix execution failure gracefully", async () => {
      const failFn: ActuatorFn = vi.fn().mockRejectedValue(new Error("Boom"));
      registerActuator("test_fail_fix", failFn);

      const result = await executeAction(
        "test_fail_fix",
        {},
        { id: 1, severity: "warning" },
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("Boom");
    });
  });

  describe("approval gate", () => {
    it("creates approval record for approval-required actions", async () => {
      registerActuator("pause_queue", vi.fn().mockResolvedValue({ success: true, message: "paused" }));

      const result = await executeAction(
        "pause_queue",
        { queueName: "media" },
        { id: 1, severity: "critical" },
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe("Approval requested");
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("sets expiresAt to 4 hours for critical severity incidents", async () => {
      registerActuator("kill_stuck_task", vi.fn());

      await executeAction(
        "kill_stuck_task",
        {},
        { id: 1, severity: "critical" },
      );

      const insertCall = mockDb.values.mock.calls[0]?.[0];
      expect(insertCall).toBeDefined();
      const expiresAt = new Date(insertCall.expiresAt).getTime();
      const expectedMin = Date.now() + 3.9 * 60 * 60 * 1000; // ~4h
      const expectedMax = Date.now() + 4.1 * 60 * 60 * 1000;
      expect(expiresAt).toBeGreaterThan(expectedMin);
      expect(expiresAt).toBeLessThan(expectedMax);
    });

    it("sets expiresAt to 24 hours for non-critical severity", async () => {
      registerActuator("emergency_maintenance", vi.fn());

      await executeAction(
        "emergency_maintenance",
        {},
        { id: 1, severity: "warning" },
      );

      const insertCall = mockDb.values.mock.calls[0]?.[0];
      expect(insertCall).toBeDefined();
      const expiresAt = new Date(insertCall.expiresAt).getTime();
      const expectedMin = Date.now() + 23.9 * 60 * 60 * 1000;
      expect(expiresAt).toBeGreaterThan(expectedMin);
    });
  });

  describe("approval decisions", () => {
    it("transitions pending -> approved", async () => {
      mockDb.returning.mockResolvedValue([{ id: 10 }]);
      // Mock select for approval and incident lookup
      mockDb.limit
        .mockResolvedValueOnce([{ id: 10 }]) // returning from update
        .mockResolvedValueOnce([{
          id: 10,
          incidentId: 1,
          actionType: "test_auto_fix",
          actionParamsJson: {},
          status: "approved",
        }])
        .mockResolvedValueOnce([{
          id: 1,
          tenantId: null,
          severity: "warning",
        }]);

      const result = await decideApproval(10, "approved", 1);
      expect(result.success).toBe(true);
    });

    it("returns conflict when approval already decided", async () => {
      mockDb.returning.mockResolvedValue([]); // 0 rows updated

      const result = await decideApproval(10, "approved", 1);
      expect(result.success).toBe(false);
      expect(result.message).toContain("already decided");
    });
  });

  describe("action execution failure", () => {
    it("returns failure when auto-fix action throws", async () => {
      const throwFn: ActuatorFn = vi.fn().mockRejectedValue(new Error("Kaboom"));
      registerActuator("test_throw_direct", throwFn);

      const result = await executeAction(
        "test_throw_direct",
        {},
        { id: 1, severity: "warning" },
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("Kaboom");
    });
  });
});
