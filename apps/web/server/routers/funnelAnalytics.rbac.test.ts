import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.CONTROL_PLANE_API_KEY = "test-control-plane-key-0001";
});

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("../services/funnelRollout", () => ({
  isFunnelEnabled: vi.fn().mockResolvedValue(true),
}));

import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(userOverrides?: Partial<AuthenticatedUser>): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "email",
    role: "user",
    registeredDomain: "example.com",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...userOverrides,
  };

  return {
    user,
    tenantId: "tenant-123",
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createUnauthenticatedContext(): TrpcContext {
  return {
    user: null,
    tenantId: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("funnelAnalytics RBAC", () => {
  const testInput = {
    from: new Date("2026-01-01"),
    to: new Date("2026-01-31"),
    bucket: "day" as const,
  };

  describe("unauthorized access", () => {
    it("rejects unauthenticated requests to summary", async () => {
      const ctx = createUnauthenticatedContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.funnelAnalytics.summary(testInput),
      ).rejects.toThrow("Domain admin access required");
    });

    it("rejects user role requests to summary", async () => {
      const ctx = createTestContext({ role: "user" });
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.funnelAnalytics.summary(testInput),
      ).rejects.toThrow("Domain admin access required");
    });

    it("rejects unauthenticated requests to timeSeries", async () => {
      const ctx = createUnauthenticatedContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.funnelAnalytics.timeSeries(testInput),
      ).rejects.toThrow("Domain admin access required");
    });

    it("rejects user role requests to export", async () => {
      const ctx = createTestContext({ role: "user" });
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.funnelAnalytics.export({ ...testInput, format: "csv" }),
      ).rejects.toThrow("Domain admin access required");
    });

    it("rejects user role requests to rawEvents", async () => {
      const ctx = createTestContext({ role: "user" });
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.funnelAnalytics.rawEvents({ ...testInput, limit: 10 }),
      ).rejects.toThrow("Domain admin access required");
    });
  });

  describe("authorized access", () => {
    it("allows admin role to access summary", async () => {
      const ctx = createTestContext({ role: "admin" });
      const caller = appRouter.createCaller(ctx);

      // Should not throw - returns empty data if no DB
      const result = await caller.funnelAnalytics.summary(testInput);
      expect(result).toHaveProperty("stages");
      expect(result).toHaveProperty("rangeClamped");
      expect(result).toHaveProperty("cached");
      expect(result.provenance).toMatchObject({
        freshnessState: "unknown",
        watermarkAvailable: false,
        latestObservedEventAt: null,
      });
      expect(Number.isNaN(Date.parse(result.provenance.computedAt))).toBe(false);
    });

    it("allows domain_admin role to access summary", async () => {
      const ctx = createTestContext({ role: "domain_admin" });
      const caller = appRouter.createCaller(ctx);

      const result = await caller.funnelAnalytics.summary(testInput);
      expect(result).toHaveProperty("stages");
      expect(result).toHaveProperty("rangeClamped");
      expect(result).toHaveProperty("cached");
      expect(result.provenance.freshnessState).toBe("unknown");
    });

    it("allows admin role to access export", async () => {
      const ctx = createTestContext({ role: "admin" });
      const caller = appRouter.createCaller(ctx);

      const result = await caller.funnelAnalytics.export({
        ...testInput,
        format: "csv",
      });
      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("mimeType");
      expect(result).toHaveProperty("filename");
    });

    it("allows domain_admin role to access rawEvents", async () => {
      const ctx = createTestContext({ role: "domain_admin" });
      const caller = appRouter.createCaller(ctx);

      const result = await caller.funnelAnalytics.rawEvents({
        ...testInput,
        limit: 10,
      });
      expect(result).toHaveProperty("events");
      expect(result).toHaveProperty("total");
    });
  });

  describe("tenant scope isolation", () => {
    it("admin role operates on tenantId without domain filter", async () => {
      const ctx = createTestContext({
        role: "admin",
        registeredDomain: "example.com",
      });
      const caller = appRouter.createCaller(ctx);

      // The scope should be tenantId-wide (no domain filter)
      // Verification happens in the actual query - this test ensures no error
      const result = await caller.funnelAnalytics.summary(testInput);
      expect(result).toBeDefined();
    });

    it("domain_admin role operates with domain filter", async () => {
      const ctx = createTestContext({
        role: "domain_admin",
        registeredDomain: "corp.io",
      });
      const caller = appRouter.createCaller(ctx);

      // The scope should include domain filter
      const result = await caller.funnelAnalytics.summary(testInput);
      expect(result).toBeDefined();
    });
  });
});
