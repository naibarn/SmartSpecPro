import { describe, expect, it } from "vitest";
import {
  evaluateRolloutGate,
  PRODUCTION_THRESHOLDS,
  CANARY_THRESHOLDS,
  ROLLBACK_TRIGGERS,
  type SLOMetrics,
  type RolloutPhase,
} from "./funnelRollout";

describe("funnelRollout", () => {
  describe("evaluateRolloutGate", () => {
    it("passes when all metrics meet thresholds", () => {
      const metrics: SLOMetrics = {
        p95LatencyMs: 1500,
        errorRate: 0.005,
        reconciliationDriftPercent: 3,
        cacheHitRate: 0.85,
      };

      const result = evaluateRolloutGate("domain_admin", metrics);

      expect(result.passed).toBe(true);
      expect(result.failedChecks).toHaveLength(0);
      expect(result.phase).toBe("domain_admin");
      expect(result.thresholds).toEqual(PRODUCTION_THRESHOLDS);
    });

    it("fails when p95 latency exceeds threshold", () => {
      const metrics: SLOMetrics = {
        p95LatencyMs: 3000, // Exceeds 2000ms threshold
        errorRate: 0.005,
        reconciliationDriftPercent: 3,
        cacheHitRate: 0.85,
      };

      const result = evaluateRolloutGate("domain_admin", metrics);

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toHaveLength(1);
      expect(result.failedChecks[0]).toContain("p95 latency");
      expect(result.failedChecks[0]).toContain("3000ms");
    });

    it("fails when error rate exceeds threshold", () => {
      const metrics: SLOMetrics = {
        p95LatencyMs: 1500,
        errorRate: 0.02, // Exceeds 1% threshold
        reconciliationDriftPercent: 3,
        cacheHitRate: 0.85,
      };

      const result = evaluateRolloutGate("domain_admin", metrics);

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toHaveLength(1);
      expect(result.failedChecks[0]).toContain("error rate");
      expect(result.failedChecks[0]).toContain("2.00%");
    });

    it("fails when reconciliation drift exceeds threshold", () => {
      const metrics: SLOMetrics = {
        p95LatencyMs: 1500,
        errorRate: 0.005,
        reconciliationDriftPercent: 8, // Exceeds 5% threshold
        cacheHitRate: 0.85,
      };

      const result = evaluateRolloutGate("domain_admin", metrics);

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toHaveLength(1);
      expect(result.failedChecks[0]).toContain("reconciliation drift");
      expect(result.failedChecks[0]).toContain("8.0%");
    });

    it("fails when cache hit rate below threshold", () => {
      const metrics: SLOMetrics = {
        p95LatencyMs: 1500,
        errorRate: 0.005,
        reconciliationDriftPercent: 3,
        cacheHitRate: 0.50, // Below 70% threshold
      };

      const result = evaluateRolloutGate("domain_admin", metrics);

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toHaveLength(1);
      expect(result.failedChecks[0]).toContain("cache hit rate");
      expect(result.failedChecks[0]).toContain("50.0%");
    });

    it("reports multiple failures when multiple metrics fail", () => {
      const metrics: SLOMetrics = {
        p95LatencyMs: 5000, // Failed
        errorRate: 0.10, // Failed
        reconciliationDriftPercent: 15, // Failed
        cacheHitRate: 0.30, // Failed
      };

      const result = evaluateRolloutGate("domain_admin", metrics);

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toHaveLength(4);
    });

    it("uses canary thresholds for internal phase", () => {
      const metrics: SLOMetrics = {
        p95LatencyMs: 2500, // Would fail production (>2000), passes canary (<3000)
        errorRate: 0.03, // Would fail production (>1%), passes canary (<5%)
        reconciliationDriftPercent: 7, // Would fail production (>5%), passes canary (<10%)
        cacheHitRate: 0.65, // Would fail production (>70%), passes canary (>60%)
      };

      const productionResult = evaluateRolloutGate("domain_admin", metrics);
      const canaryResult = evaluateRolloutGate("internal", metrics);

      expect(productionResult.passed).toBe(false);
      expect(productionResult.failedChecks.length).toBeGreaterThan(0);

      expect(canaryResult.passed).toBe(true);
      expect(canaryResult.failedChecks).toHaveLength(0);
      expect(canaryResult.thresholds).toEqual(CANARY_THRESHOLDS);
    });

    it("includes timestamp in result", () => {
      const metrics: SLOMetrics = {
        p95LatencyMs: 1500,
        errorRate: 0.005,
        reconciliationDriftPercent: 3,
        cacheHitRate: 0.85,
      };

      const before = new Date();
      const result = evaluateRolloutGate("domain_admin", metrics);
      const after = new Date();

      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("ROLLBACK_TRIGGERS", () => {
    it("defines immediate priority trigger for cross-tenant exposure", () => {
      const trigger = ROLLBACK_TRIGGERS.find((t) =>
        t.name.includes("Cross-tenant"),
      );
      expect(trigger).toBeDefined();
      expect(trigger?.priority).toBe("immediate");
      expect(trigger?.action).toContain("IMMEDIATE");
      expect(trigger?.action).toContain("Disable");
    });

    it("defines immediate priority trigger for SLO breach", () => {
      const trigger = ROLLBACK_TRIGGERS.find((t) => t.name.includes("SLO"));
      expect(trigger).toBeDefined();
      expect(trigger?.priority).toBe("immediate");
    });

    it("defines high priority trigger for reconciliation divergence", () => {
      const trigger = ROLLBACK_TRIGGERS.find((t) =>
        t.name.includes("Reconciliation divergence"),
      );
      expect(trigger).toBeDefined();
      expect(trigger?.priority).toBe("high");
      expect(trigger?.action).toContain("Halt backfill");
    });

    it("defines high priority trigger for export abuse", () => {
      const trigger = ROLLBACK_TRIGGERS.find((t) => t.name.includes("Export"));
      expect(trigger).toBeDefined();
      expect(trigger?.priority).toBe("high");
      expect(trigger?.action).toContain("Review audit logs");
    });

    it("orders triggers by priority", () => {
      const immediateTriggers = ROLLBACK_TRIGGERS.filter(
        (t) => t.priority === "immediate",
      );
      const highTriggers = ROLLBACK_TRIGGERS.filter(
        (t) => t.priority === "high",
      );
      const mediumTriggers = ROLLBACK_TRIGGERS.filter(
        (t) => t.priority === "medium",
      );

      // Verify immediate triggers come first
      const firstImmediate = ROLLBACK_TRIGGERS.findIndex(
        (t) => t.priority === "immediate",
      );
      const firstHigh = ROLLBACK_TRIGGERS.findIndex(
        (t) => t.priority === "high",
      );

      if (immediateTriggers.length > 0 && highTriggers.length > 0) {
        expect(firstImmediate).toBeLessThan(firstHigh);
      }
    });

    it("has at least 5 defined rollback triggers", () => {
      expect(ROLLBACK_TRIGGERS.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("SLO Thresholds", () => {
    it("production thresholds are more strict than canary", () => {
      expect(PRODUCTION_THRESHOLDS.maxP95LatencyMs).toBeLessThan(
        CANARY_THRESHOLDS.maxP95LatencyMs,
      );
      expect(PRODUCTION_THRESHOLDS.maxErrorRate).toBeLessThan(
        CANARY_THRESHOLDS.maxErrorRate,
      );
      expect(
        PRODUCTION_THRESHOLDS.maxReconciliationDriftPercent,
      ).toBeLessThan(CANARY_THRESHOLDS.maxReconciliationDriftPercent);
      expect(PRODUCTION_THRESHOLDS.minCacheHitRate).toBeGreaterThan(
        CANARY_THRESHOLDS.minCacheHitRate,
      );
    });

    it("production thresholds are reasonable for analytics workload", () => {
      // Latency: 2s is reasonable for complex analytics aggregation
      expect(PRODUCTION_THRESHOLDS.maxP95LatencyMs).toBe(2000);

      // Error rate: 1% allows for some transient failures
      expect(PRODUCTION_THRESHOLDS.maxErrorRate).toBe(0.01);

      // Drift: 5% accounts for timing differences in event processing
      expect(PRODUCTION_THRESHOLDS.maxReconciliationDriftPercent).toBe(5);

      // Cache: 70% hit rate is good for time-series data
      expect(PRODUCTION_THRESHOLDS.minCacheHitRate).toBe(0.70);
    });
  });
});
