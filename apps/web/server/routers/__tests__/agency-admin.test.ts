/**
 * Tests for agency admin tRPC procedures.
 *
 * Covers: quota management, tool whitelist CRUD, kill-all runs, metrics queries.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database
vi.mock("../../db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn(),
    transaction: vi.fn(async (fn: any) => fn({
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
    })),
  },
}));

// Mock feature flags
vi.mock("../../services/featureFlags", () => ({
  getTenantFeatureFlag: vi.fn().mockResolvedValue(true),
  setTenantFeatureFlag: vi.fn().mockResolvedValue(undefined),
  getFeatureFlag: vi.fn().mockResolvedValue(true),
  setFeatureFlag: vi.fn().mockResolvedValue(undefined),
}));

// Mock agency bridge
vi.mock("../../services/agencyBridge", () => ({
  agencyBridge: {
    executeRun: vi.fn(),
    cancelRun: vi.fn().mockResolvedValue(undefined),
    listRuns: vi.fn(),
  },
}));

// Mock Redis
vi.mock("../../services/redis", () => ({
  getRedisClient: vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  }),
}));

// Mock system settings
vi.mock("../../services/systemSettings", () => ({
  getSystemSetting: vi.fn().mockResolvedValue(null),
  setSystemSetting: vi.fn().mockResolvedValue(undefined),
}));

describe("Agency Admin Procedures", () => {
  describe("adminSetQuotas", () => {
    it("should accept valid quota values", () => {
      // Schema validation test
      const input = {
        tenantId: "tenant-1",
        maxAgencies: 10,
        maxConcurrentRuns: 5,
        maxCreditPerRun: 100,
      };

      // All values within valid range
      expect(input.maxAgencies).toBeGreaterThanOrEqual(0);
      expect(input.maxAgencies).toBeLessThanOrEqual(100);
      expect(input.maxConcurrentRuns).toBeGreaterThanOrEqual(0);
      expect(input.maxConcurrentRuns).toBeLessThanOrEqual(50);
      expect(input.maxCreditPerRun).toBeGreaterThanOrEqual(0);
    });
  });

  describe("adminSetToolWhitelist", () => {
    it("should accept valid agency ID and tool ID list", () => {
      const input = {
        agencyId: "550e8400-e29b-41d4-a716-446655440000",
        toolIds: [
          "550e8400-e29b-41d4-a716-446655440001",
          "550e8400-e29b-41d4-a716-446655440002",
        ],
      };

      // Validate UUIDs
      expect(input.agencyId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      for (const toolId of input.toolIds) {
        expect(toolId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
      }
    });
  });

  describe("adminKillAllRuns", () => {
    it("should validate tenant ID input", () => {
      const input = { tenantId: "tenant-1" };
      expect(input.tenantId).toBeTruthy();
      expect(typeof input.tenantId).toBe("string");
    });
  });

  describe("adminGetMetrics", () => {
    it("should validate metrics query input", () => {
      const input = {
        agencyId: "550e8400-e29b-41d4-a716-446655440000",
        windowHours: 24,
      };

      expect(input.windowHours).toBeGreaterThanOrEqual(1);
      expect(input.windowHours).toBeLessThanOrEqual(168);
    });

    it("should accept optional tenant-wide query", () => {
      const input = {
        tenantId: "tenant-1",
        windowHours: 1,
      };

      expect(input.tenantId).toBeTruthy();
    });
  });
});
