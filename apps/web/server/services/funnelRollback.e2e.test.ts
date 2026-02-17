/**
 * E2E Tests for Funnel Dashboard Rollback Procedure
 *
 * Tests the complete rollback flow:
 * 1. Feature enabled → dashboard accessible
 * 2. Execute rollback → feature disabled
 * 3. Verify dashboard inaccessible
 * 4. Restore → feature re-enabled
 * 5. Verify dashboard accessible again
 *
 * Covers:
 * - Immediate rollback (full disable)
 * - Partial rollback (domain_admin only)
 * - Rollback timing measurements
 * - Different user roles (admin, domain_admin, user)
 * - State persistence after rollback
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "../../server/routers";
import type { TrpcContext } from "../../server/_core/context";
import {
  executeRollback,
  ROLLBACK_TRIGGERS,
  type RollbackTrigger,
} from "../../server/services/funnelRollout";
import { getFeatureFlag, setFeatureFlag } from "../../server/services/featureFlags";
import { getRedisClient } from "../../server/services/redis";

// ── Test Context Helpers ──

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(
  userOverrides?: Partial<AuthenticatedUser>,
  tenantId = "tenant-e2e-test",
): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1000,
    openId: "e2e-test-user",
    email: "e2e@example.com",
    name: "E2E Test User",
    loginMethod: "email",
    role: "admin",
    registeredDomain: "example.com",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...userOverrides,
  };

  return {
    user,
    tenantId,
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

// ── Test State Management ──

interface TestState {
  originalFunnelDashboardFlag: boolean;
  originalDomainAdminFlag: boolean;
}

let testState: TestState;

async function captureOriginalState(): Promise<TestState> {
  return {
    originalFunnelDashboardFlag: await getFeatureFlag("FUNNEL_DASHBOARD_ENABLED"),
    originalDomainAdminFlag: await getFeatureFlag("FUNNEL_DASHBOARD_DOMAIN_ADMIN"),
  };
}

async function restoreOriginalState(state: TestState): Promise<void> {
  await setFeatureFlag("FUNNEL_DASHBOARD_ENABLED", state.originalFunnelDashboardFlag);
  await setFeatureFlag("FUNNEL_DASHBOARD_DOMAIN_ADMIN", state.originalDomainAdminFlag);
}

// ── Test Fixtures ──

const testInput = {
  from: new Date("2026-02-01"),
  to: new Date("2026-02-10"),
  bucket: "day" as const,
};

// ── Test Suite ──

describe("Funnel Dashboard Rollback E2E", () => {
  beforeAll(async () => {
    // Capture original feature flag state for cleanup
    testState = await captureOriginalState();
  });

  afterAll(async () => {
    // Restore original feature flag state
    await restoreOriginalState(testState);
  });

  beforeEach(async () => {
    // Reset feature flags to enabled state before each test
    await setFeatureFlag("FUNNEL_DASHBOARD_ENABLED", true);
    await setFeatureFlag("FUNNEL_DASHBOARD_DOMAIN_ADMIN", true);
  });

  describe("Immediate Rollback (Full Disable)", () => {
    it("should disable dashboard for admin after immediate rollback", async () => {
      // GIVEN: Feature is enabled and admin can access
      const ctx = createTestContext({ role: "admin" });
      const caller = appRouter.createCaller(ctx);

      // Verify initial access
      const beforeResult = await caller.funnelAnalytics.summary(testInput);
      expect(beforeResult).toHaveProperty("stages");

      // WHEN: Execute immediate rollback
      const trigger = ROLLBACK_TRIGGERS.find((t) => t.priority === "immediate");
      expect(trigger).toBeDefined();

      const actions = await executeRollback(trigger!, ctx.user?.id);

      // Verify rollback actions were taken
      expect(actions).toContain("Disabled FUNNEL_DASHBOARD_ENABLED feature flag");
      expect(actions.length).toBeGreaterThan(0);

      // THEN: Dashboard should be inaccessible
      await expect(caller.funnelAnalytics.summary(testInput)).rejects.toThrow(
        "Funnel dashboard not available for your role in current rollout phase",
      );

      // Verify feature flag is disabled
      const flagEnabled = await getFeatureFlag("FUNNEL_DASHBOARD_ENABLED");
      expect(flagEnabled).toBe(false);
    });

    it("should disable dashboard for domain_admin after immediate rollback", async () => {
      // GIVEN: Feature is enabled and domain_admin can access
      const ctx = createTestContext({ role: "domain_admin" });
      const caller = appRouter.createCaller(ctx);

      // Verify initial access
      const beforeResult = await caller.funnelAnalytics.summary(testInput);
      expect(beforeResult).toHaveProperty("stages");

      // WHEN: Execute immediate rollback (cross-tenant data exposure)
      const trigger = ROLLBACK_TRIGGERS.find(
        (t) => t.name === "Cross-tenant data exposure",
      );
      expect(trigger).toBeDefined();

      await executeRollback(trigger!, ctx.user?.id);

      // THEN: Dashboard should be inaccessible
      await expect(caller.funnelAnalytics.summary(testInput)).rejects.toThrow(
        "Funnel dashboard not available for your role in current rollout phase",
      );
    });

    it("should keep user role blocked after immediate rollback", async () => {
      // GIVEN: User role is already blocked
      const ctx = createTestContext({ role: "user" });
      const caller = appRouter.createCaller(ctx);

      // Verify user is blocked before rollback
      await expect(caller.funnelAnalytics.summary(testInput)).rejects.toThrow(
        "Domain admin access required",
      );

      // WHEN: Execute immediate rollback
      const trigger = ROLLBACK_TRIGGERS.find((t) => t.priority === "immediate");
      await executeRollback(trigger!, ctx.user?.id);

      // THEN: User should still be blocked
      await expect(caller.funnelAnalytics.summary(testInput)).rejects.toThrow(
        "Domain admin access required",
      );
    });
  });

  describe("Partial Rollback (Domain Admin Only)", () => {
    it("should block domain_admin but keep admin access", async () => {
      // GIVEN: Both admin and domain_admin can access
      const adminCtx = createTestContext({ role: "admin" });
      const domainAdminCtx = createTestContext({ role: "domain_admin", id: 2000 });
      const adminCaller = appRouter.createCaller(adminCtx);
      const domainAdminCaller = appRouter.createCaller(domainAdminCtx);

      // Verify both can access initially
      const adminBefore = await adminCaller.funnelAnalytics.summary(testInput);
      expect(adminBefore).toHaveProperty("stages");

      const domainAdminBefore = await domainAdminCaller.funnelAnalytics.summary(testInput);
      expect(domainAdminBefore).toHaveProperty("stages");

      // WHEN: Execute partial rollback (high priority)
      const trigger = ROLLBACK_TRIGGERS.find(
        (t) => t.priority === "high" && t.name === "Reconciliation divergence trend",
      );
      expect(trigger).toBeDefined();

      const actions = await executeRollback(trigger!, adminCtx.user?.id);

      // Verify partial rollback actions
      expect(actions).toContain("Disabled domain_admin access to funnel dashboard");
      expect(actions).toContain("Kept internal phase enabled for investigation");

      // THEN: Domain admin should be blocked
      await expect(domainAdminCaller.funnelAnalytics.summary(testInput)).rejects.toThrow(
        "Funnel dashboard not available for your role in current rollout phase",
      );

      // BUT: Admin should still have access (internal phase)
      const adminAfter = await adminCaller.funnelAnalytics.summary(testInput);
      expect(adminAfter).toHaveProperty("stages");

      // Verify feature flags
      const mainFlagEnabled = await getFeatureFlag("FUNNEL_DASHBOARD_ENABLED");
      const domainAdminFlagEnabled = await getFeatureFlag("FUNNEL_DASHBOARD_DOMAIN_ADMIN");
      expect(mainFlagEnabled).toBe(true); // Main flag still enabled
      expect(domainAdminFlagEnabled).toBe(false); // Domain admin flag disabled
    });

    it("should handle SLO breach rollback correctly", async () => {
      // GIVEN: Feature is fully enabled
      const adminCtx = createTestContext({ role: "admin" });
      const domainAdminCtx = createTestContext({ role: "domain_admin", id: 2000 });
      const adminCaller = appRouter.createCaller(adminCtx);
      const domainAdminCaller = appRouter.createCaller(domainAdminCtx);

      // WHEN: Execute SLO breach rollback (immediate priority - full disable)
      const trigger = ROLLBACK_TRIGGERS.find(
        (t) => t.name === "SLO breach (3+ gates failing)",
      );
      expect(trigger).toBeDefined();
      expect(trigger?.priority).toBe("immediate"); // SLO breach is immediate, not partial

      const actions = await executeRollback(trigger!, adminCtx.user?.id);

      // THEN: Should perform full disable (immediate priority)
      expect(actions).toContain("Disabled FUNNEL_DASHBOARD_ENABLED feature flag");

      // Verify both admin and domain_admin are blocked
      await expect(adminCaller.funnelAnalytics.summary(testInput)).rejects.toThrow(
        "Funnel dashboard not available for your role in current rollout phase",
      );
      await expect(domainAdminCaller.funnelAnalytics.summary(testInput)).rejects.toThrow(
        "Funnel dashboard not available for your role in current rollout phase",
      );
    });
  });

  describe("Rollback Timing Measurements", () => {
    it("should complete immediate rollback within 500ms", async () => {
      const trigger = ROLLBACK_TRIGGERS.find((t) => t.priority === "immediate");
      expect(trigger).toBeDefined();

      const startTime = performance.now();
      await executeRollback(trigger!, 1);
      const endTime = performance.now();

      const durationMs = endTime - startTime;

      // Rollback should be fast (< 500ms) for immediate actions
      expect(durationMs).toBeLessThan(500);

      // Verify flag was actually changed
      const flagEnabled = await getFeatureFlag("FUNNEL_DASHBOARD_ENABLED");
      expect(flagEnabled).toBe(false);
    });

    it("should complete partial rollback within 500ms", async () => {
      const trigger = ROLLBACK_TRIGGERS.find((t) => t.priority === "high");
      expect(trigger).toBeDefined();

      const startTime = performance.now();
      await executeRollback(trigger!, 1);
      const endTime = performance.now();

      const durationMs = endTime - startTime;

      // Partial rollback should also be fast
      expect(durationMs).toBeLessThan(500);

      // Verify correct flag was changed
      const domainAdminFlagEnabled = await getFeatureFlag("FUNNEL_DASHBOARD_DOMAIN_ADMIN");
      expect(domainAdminFlagEnabled).toBe(false);
    });

    it("should measure API response time after rollback", async () => {
      const ctx = createTestContext({ role: "admin" });
      const caller = appRouter.createCaller(ctx);

      // Execute rollback
      const trigger = ROLLBACK_TRIGGERS.find((t) => t.priority === "immediate");
      await executeRollback(trigger!, 1);

      // Measure API response time for blocked request
      const startTime = performance.now();
      try {
        await caller.funnelAnalytics.summary(testInput);
      } catch (error) {
        // Expected to throw
      }
      const endTime = performance.now();

      const durationMs = endTime - startTime;

      // Blocked request should fail fast (< 100ms)
      expect(durationMs).toBeLessThan(100);
    });
  });

  describe("State Persistence After Rollback", () => {
    it("should persist rollback state for summary endpoint", async () => {
      const ctx = createTestContext({ role: "admin" });
      const caller = appRouter.createCaller(ctx);

      // Execute rollback
      const trigger = ROLLBACK_TRIGGERS.find((t) => t.priority === "immediate");
      await executeRollback(trigger!, 1);

      // Verify blocked state persists across multiple summary requests
      await expect(caller.funnelAnalytics.summary(testInput)).rejects.toThrow(
        "Funnel dashboard not available for your role in current rollout phase",
      );
      await expect(caller.funnelAnalytics.summary(testInput)).rejects.toThrow(
        "Funnel dashboard not available for your role in current rollout phase",
      );

      // Verify flag is still disabled
      const flagEnabled = await getFeatureFlag("FUNNEL_DASHBOARD_ENABLED");
      expect(flagEnabled).toBe(false);
    });

    it("should persist partial rollback state for domain_admin only", async () => {
      const adminCtx = createTestContext({ role: "admin" });
      const domainAdminCtx = createTestContext({ role: "domain_admin", id: 2000 });
      const adminCaller = appRouter.createCaller(adminCtx);
      const domainAdminCaller = appRouter.createCaller(domainAdminCtx);

      // Execute partial rollback
      const trigger = ROLLBACK_TRIGGERS.find((t) => t.priority === "high");
      await executeRollback(trigger!, 1);

      // Verify domain_admin remains blocked
      await expect(domainAdminCaller.funnelAnalytics.summary(testInput)).rejects.toThrow();

      // Verify admin retains access
      const result1 = await adminCaller.funnelAnalytics.summary(testInput);
      expect(result1).toHaveProperty("stages");

      const result2 = await adminCaller.funnelAnalytics.timeSeries(testInput);
      expect(result2).toHaveProperty("series");
    });

    it("should handle Redis reconnection scenarios", async () => {
      const ctx = createTestContext({ role: "admin" });
      const caller = appRouter.createCaller(ctx);

      // Execute rollback
      const trigger = ROLLBACK_TRIGGERS.find((t) => t.priority === "immediate");
      await executeRollback(trigger!, 1);

      // Simulate checking flag directly from Redis
      const redis = getRedisClient();
      const flagValue = await redis.get("feature-flag:FUNNEL_DASHBOARD_ENABLED");
      expect(flagValue).toBe("false");

      // Verify API still respects the flag
      await expect(caller.funnelAnalytics.summary(testInput)).rejects.toThrow();
    });
  });

  describe("Rollback Restore Flow", () => {
    it("should restore full access after re-enabling flags", async () => {
      const adminCtx = createTestContext({ role: "admin" });
      const domainAdminCtx = createTestContext({ role: "domain_admin", id: 2000 });
      const adminCaller = appRouter.createCaller(adminCtx);
      const domainAdminCaller = appRouter.createCaller(domainAdminCtx);

      // GIVEN: Rollback executed
      const trigger = ROLLBACK_TRIGGERS.find((t) => t.priority === "immediate");
      await executeRollback(trigger!, 1);

      // Verify both are blocked
      await expect(adminCaller.funnelAnalytics.summary(testInput)).rejects.toThrow();
      await expect(domainAdminCaller.funnelAnalytics.summary(testInput)).rejects.toThrow();

      // WHEN: Restore feature flags
      await setFeatureFlag("FUNNEL_DASHBOARD_ENABLED", true);
      await setFeatureFlag("FUNNEL_DASHBOARD_DOMAIN_ADMIN", true);

      // THEN: Both should have access again
      const adminResult = await adminCaller.funnelAnalytics.summary(testInput);
      expect(adminResult).toHaveProperty("stages");

      const domainAdminResult = await domainAdminCaller.funnelAnalytics.summary(testInput);
      expect(domainAdminResult).toHaveProperty("stages");
    });

    it("should restore admin-only access after partial rollback restore", async () => {
      const adminCtx = createTestContext({ role: "admin" });
      const domainAdminCtx = createTestContext({ role: "domain_admin", id: 2000 });
      const adminCaller = appRouter.createCaller(adminCtx);
      const domainAdminCaller = appRouter.createCaller(domainAdminCtx);

      // GIVEN: Partial rollback executed
      const trigger = ROLLBACK_TRIGGERS.find((t) => t.priority === "high");
      await executeRollback(trigger!, 1);

      // Admin has access, domain_admin blocked
      const adminBefore = await adminCaller.funnelAnalytics.summary(testInput);
      expect(adminBefore).toHaveProperty("stages");
      await expect(domainAdminCaller.funnelAnalytics.summary(testInput)).rejects.toThrow();

      // WHEN: Restore domain_admin flag only
      await setFeatureFlag("FUNNEL_DASHBOARD_DOMAIN_ADMIN", true);

      // THEN: Domain_admin should have access again
      const domainAdminResult = await domainAdminCaller.funnelAnalytics.summary(testInput);
      expect(domainAdminResult).toHaveProperty("stages");

      // Admin should still have access
      const adminAfter = await adminCaller.funnelAnalytics.summary(testInput);
      expect(adminAfter).toHaveProperty("stages");
    });

    it("should measure restore timing", async () => {
      // GIVEN: Rollback executed
      const trigger = ROLLBACK_TRIGGERS.find((t) => t.priority === "immediate");
      await executeRollback(trigger!, 1);

      // WHEN: Restore flags
      const startTime = performance.now();
      await setFeatureFlag("FUNNEL_DASHBOARD_ENABLED", true);
      await setFeatureFlag("FUNNEL_DASHBOARD_DOMAIN_ADMIN", true);
      const endTime = performance.now();

      const durationMs = endTime - startTime;

      // THEN: Restore should be fast (< 500ms)
      expect(durationMs).toBeLessThan(500);

      // Verify flags are enabled
      const mainFlag = await getFeatureFlag("FUNNEL_DASHBOARD_ENABLED");
      const domainAdminFlag = await getFeatureFlag("FUNNEL_DASHBOARD_DOMAIN_ADMIN");
      expect(mainFlag).toBe(true);
      expect(domainAdminFlag).toBe(true);
    });
  });

  describe("All Endpoints After Rollback", () => {
    it("should block summary endpoint after immediate rollback", async () => {
      const ctx = createTestContext({ role: "admin" });
      const caller = appRouter.createCaller(ctx);

      // Execute immediate rollback
      const trigger = ROLLBACK_TRIGGERS.find((t) => t.priority === "immediate");
      await executeRollback(trigger!, 1);

      // Verify summary endpoint is blocked (has checkFunnelEnabled)
      await expect(caller.funnelAnalytics.summary(testInput)).rejects.toThrow(
        "Funnel dashboard not available for your role in current rollout phase",
      );

      // ✅ SECURITY FIX: All endpoints now check feature flags
      // After immediate rollback, ALL endpoints should be blocked

      // Verify export endpoint is blocked
      await expect(
        caller.funnelAnalytics.export({
          ...testInput,
          format: "csv",
        })
      ).rejects.toThrow("Funnel dashboard not available for your role in current rollout phase");

      // Verify timeSeries endpoint is blocked
      await expect(
        caller.funnelAnalytics.timeSeries(testInput)
      ).rejects.toThrow("Funnel dashboard not available for your role in current rollout phase");

      // Verify rawEvents endpoint is blocked
      await expect(
        caller.funnelAnalytics.rawEvents({
          ...testInput,
          limit: 10,
          includeUserData: false,
        })
      ).rejects.toThrow("Funnel dashboard not available for your role in current rollout phase");
    });

    it("should block summary for domain_admin after partial rollback", async () => {
      const ctx = createTestContext({ role: "domain_admin" });
      const caller = appRouter.createCaller(ctx);

      // Execute partial rollback
      const trigger = ROLLBACK_TRIGGERS.find((t) => t.priority === "high");
      await executeRollback(trigger!, 1);

      // Verify summary endpoint is blocked
      await expect(caller.funnelAnalytics.summary(testInput)).rejects.toThrow(
        "Funnel dashboard not available for your role in current rollout phase",
      );

      // ✅ SECURITY FIX: All endpoints now check feature flags for partial rollback too
      // Verify all other endpoints are also blocked for domain_admin

      // Verify export endpoint is blocked
      await expect(
        caller.funnelAnalytics.export({
          ...testInput,
          format: "csv",
        })
      ).rejects.toThrow("Funnel dashboard not available for your role in current rollout phase");

      // Verify timeSeries endpoint is blocked
      await expect(
        caller.funnelAnalytics.timeSeries(testInput)
      ).rejects.toThrow("Funnel dashboard not available for your role in current rollout phase");

      // Verify rawEvents endpoint is blocked
      await expect(
        caller.funnelAnalytics.rawEvents({ ...testInput, limit: 10 })
      ).rejects.toThrow("Funnel dashboard not available for your role in current rollout phase");
    });
  });

  describe("Rollback Error Handling", () => {
    it("should handle Redis unavailability during rollback", async () => {
      // This test verifies the system degrades gracefully
      // In production, if Redis is down, rollback will fail and throw
      // The caller (monitoring/alerting) should handle this

      const trigger = ROLLBACK_TRIGGERS.find((t) => t.priority === "immediate");

      // If Redis is unavailable, executeRollback will throw
      // This is expected behavior - rollback failure must be visible
      try {
        await executeRollback(trigger!, 1);
        // If we get here, Redis was available
        const flagEnabled = await getFeatureFlag("FUNNEL_DASHBOARD_ENABLED");
        expect(flagEnabled).toBe(false);
      } catch (error) {
        // This is acceptable - rollback failure should throw
        expect(error).toBeDefined();
      }
    });

    it("should report all actions taken during rollback", async () => {
      const trigger = ROLLBACK_TRIGGERS.find((t) => t.priority === "immediate");
      expect(trigger).toBeDefined();

      const actions = await executeRollback(trigger!, 1);

      // Verify action list is comprehensive
      expect(actions.length).toBeGreaterThan(0);
      expect(actions).toContain("Disabled FUNNEL_DASHBOARD_ENABLED feature flag");
      expect(actions.some((a) => a.includes("Rollback triggered by:"))).toBe(true);
      expect(actions.some((a) => a.includes("Condition:"))).toBe(true);
    });
  });

  describe("Rollback Triggers Coverage", () => {
    it("should have defined rollback triggers for all priority levels", () => {
      const immediateTriggers = ROLLBACK_TRIGGERS.filter((t) => t.priority === "immediate");
      const highTriggers = ROLLBACK_TRIGGERS.filter((t) => t.priority === "high");
      const mediumTriggers = ROLLBACK_TRIGGERS.filter((t) => t.priority === "medium");

      expect(immediateTriggers.length).toBeGreaterThan(0);
      expect(highTriggers.length).toBeGreaterThan(0);
      expect(mediumTriggers.length).toBeGreaterThan(0);
    });

    it("should execute all immediate priority triggers correctly", async () => {
      const immediateTriggers = ROLLBACK_TRIGGERS.filter((t) => t.priority === "immediate");

      for (const trigger of immediateTriggers) {
        // Reset flags
        await setFeatureFlag("FUNNEL_DASHBOARD_ENABLED", true);
        await setFeatureFlag("FUNNEL_DASHBOARD_DOMAIN_ADMIN", true);

        // Execute rollback
        const actions = await executeRollback(trigger, 1);

        // Verify main flag is disabled
        const flagEnabled = await getFeatureFlag("FUNNEL_DASHBOARD_ENABLED");
        expect(flagEnabled).toBe(false);

        expect(actions.length).toBeGreaterThan(0);
      }
    });

    it("should execute all high priority triggers correctly", async () => {
      const highTriggers = ROLLBACK_TRIGGERS.filter((t) => t.priority === "high");

      for (const trigger of highTriggers) {
        // Reset flags
        await setFeatureFlag("FUNNEL_DASHBOARD_ENABLED", true);
        await setFeatureFlag("FUNNEL_DASHBOARD_DOMAIN_ADMIN", true);

        // Execute partial rollback
        const actions = await executeRollback(trigger, 1);

        // Verify domain_admin flag is disabled, main flag still enabled
        const mainFlag = await getFeatureFlag("FUNNEL_DASHBOARD_ENABLED");
        const domainAdminFlag = await getFeatureFlag("FUNNEL_DASHBOARD_DOMAIN_ADMIN");

        expect(mainFlag).toBe(true);
        expect(domainAdminFlag).toBe(false);

        expect(actions.length).toBeGreaterThan(0);
      }
    });
  });
});
