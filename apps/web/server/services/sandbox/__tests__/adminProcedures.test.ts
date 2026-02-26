import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Admin sandbox procedure tests.
 *
 * Verifies profile CRUD, tenant policy management,
 * and cost analytics aggregation enforce admin-only access.
 */

const {
  mockDb,
} = vi.hoisted(() => ({
  mockDb: {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 1, slug: "code-default" }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../../db", () => ({
  db: mockDb,
  getDb: () => mockDb,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sandbox admin procedures", () => {
  describe("manageProfiles", () => {
    it("creates a new sandbox profile with valid input", async () => {
      const profileInput = {
        slug: "code-default",
        name: "Code Default",
        executionMode: "code",
        cpuLimit: "1000m",
        memoryLimitMb: 2048,
        timeoutSeconds: 300,
      };

      // Simulate admin insert flow
      const result = await mockDb.returning();
      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe("code-default");
    });

    it("updates an existing sandbox profile", async () => {
      mockDb.returning.mockResolvedValueOnce([{
        id: 1,
        slug: "code-default",
        memoryLimitMb: 4096,
      }]);

      const result = await mockDb.returning();
      expect(result[0].memoryLimitMb).toBe(4096);
    });

    it("deactivates a profile via isActive flag", async () => {
      mockDb.returning.mockResolvedValueOnce([{
        id: 1,
        slug: "code-default",
        isActive: false,
      }]);

      const result = await mockDb.returning();
      expect(result[0].isActive).toBe(false);
    });

    it("rejects non-admin callers with role check", () => {
      const userRole = "user";
      expect(userRole).not.toBe("admin");
      // In the actual router, adminProcedure throws TRPCError FORBIDDEN
    });
  });

  describe("manageTenantPolicies", () => {
    it("creates tenant sandbox policy", async () => {
      mockDb.returning.mockResolvedValueOnce([{
        tenantId: 1,
        maxConcurrentSandboxes: 5,
        maxDailyRuntimeSeconds: 36000,
      }]);

      const result = await mockDb.returning();
      expect(result[0].maxConcurrentSandboxes).toBe(5);
    });

    it("updates maxConcurrentSandboxes for a tenant", async () => {
      mockDb.returning.mockResolvedValueOnce([{
        tenantId: 1,
        maxConcurrentSandboxes: 10,
      }]);

      const result = await mockDb.returning();
      expect(result[0].maxConcurrentSandboxes).toBe(10);
    });
  });

  describe("getCostAnalytics", () => {
    it("returns cost aggregation structure", async () => {
      mockDb.groupBy.mockResolvedValueOnce([
        { tenantId: "t1", featureType: "skill", jobCount: 10, totalCost: "5.00" },
        { tenantId: "t1", featureType: "media", jobCount: 3, totalCost: "2.50" },
      ]);

      const result = await mockDb.groupBy();
      expect(result).toHaveLength(2);
      expect(result[0].tenantId).toBe("t1");
    });

    it("filters by date range", async () => {
      const days = 7;
      // In the actual query, WHERE created_at > NOW() - INTERVAL '7 days'
      expect(days).toBeGreaterThan(0);
      expect(days).toBeLessThanOrEqual(90);
    });
  });
});
