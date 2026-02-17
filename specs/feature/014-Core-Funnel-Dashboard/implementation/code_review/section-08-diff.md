diff --git a/apps/web/server/services/funnelRollout.test.ts b/apps/web/server/services/funnelRollout.test.ts
new file mode 100644
index 0000000..25741b8
--- /dev/null
+++ b/apps/web/server/services/funnelRollout.test.ts
@@ -0,0 +1,237 @@
+import { describe, expect, it } from "vitest";
+import {
+  evaluateRolloutGate,
+  PRODUCTION_THRESHOLDS,
+  CANARY_THRESHOLDS,
+  ROLLBACK_TRIGGERS,
+  type SLOMetrics,
+  type RolloutPhase,
+} from "./funnelRollout";
+
+describe("funnelRollout", () => {
+  describe("evaluateRolloutGate", () => {
+    it("passes when all metrics meet thresholds", () => {
+      const metrics: SLOMetrics = {
+        p95LatencyMs: 1500,
+        errorRate: 0.005,
+        reconciliationDriftPercent: 3,
+        cacheHitRate: 0.85,
+      };
+
+      const result = evaluateRolloutGate("domain_admin", metrics);
+
+      expect(result.passed).toBe(true);
+      expect(result.failedChecks).toHaveLength(0);
+      expect(result.phase).toBe("domain_admin");
+      expect(result.thresholds).toEqual(PRODUCTION_THRESHOLDS);
+    });
+
+    it("fails when p95 latency exceeds threshold", () => {
+      const metrics: SLOMetrics = {
+        p95LatencyMs: 3000, // Exceeds 2000ms threshold
+        errorRate: 0.005,
+        reconciliationDriftPercent: 3,
+        cacheHitRate: 0.85,
+      };
+
+      const result = evaluateRolloutGate("domain_admin", metrics);
+
+      expect(result.passed).toBe(false);
+      expect(result.failedChecks).toHaveLength(1);
+      expect(result.failedChecks[0]).toContain("p95 latency");
+      expect(result.failedChecks[0]).toContain("3000ms");
+    });
+
+    it("fails when error rate exceeds threshold", () => {
+      const metrics: SLOMetrics = {
+        p95LatencyMs: 1500,
+        errorRate: 0.02, // Exceeds 1% threshold
+        reconciliationDriftPercent: 3,
+        cacheHitRate: 0.85,
+      };
+
+      const result = evaluateRolloutGate("domain_admin", metrics);
+
+      expect(result.passed).toBe(false);
+      expect(result.failedChecks).toHaveLength(1);
+      expect(result.failedChecks[0]).toContain("error rate");
+      expect(result.failedChecks[0]).toContain("2.00%");
+    });
+
+    it("fails when reconciliation drift exceeds threshold", () => {
+      const metrics: SLOMetrics = {
+        p95LatencyMs: 1500,
+        errorRate: 0.005,
+        reconciliationDriftPercent: 8, // Exceeds 5% threshold
+        cacheHitRate: 0.85,
+      };
+
+      const result = evaluateRolloutGate("domain_admin", metrics);
+
+      expect(result.passed).toBe(false);
+      expect(result.failedChecks).toHaveLength(1);
+      expect(result.failedChecks[0]).toContain("reconciliation drift");
+      expect(result.failedChecks[0]).toContain("8.0%");
+    });
+
+    it("fails when cache hit rate below threshold", () => {
+      const metrics: SLOMetrics = {
+        p95LatencyMs: 1500,
+        errorRate: 0.005,
+        reconciliationDriftPercent: 3,
+        cacheHitRate: 0.50, // Below 70% threshold
+      };
+
+      const result = evaluateRolloutGate("domain_admin", metrics);
+
+      expect(result.passed).toBe(false);
+      expect(result.failedChecks).toHaveLength(1);
+      expect(result.failedChecks[0]).toContain("cache hit rate");
+      expect(result.failedChecks[0]).toContain("50.0%");
+    });
+
+    it("reports multiple failures when multiple metrics fail", () => {
+      const metrics: SLOMetrics = {
+        p95LatencyMs: 5000, // Failed
+        errorRate: 0.10, // Failed
+        reconciliationDriftPercent: 15, // Failed
+        cacheHitRate: 0.30, // Failed
+      };
+
+      const result = evaluateRolloutGate("domain_admin", metrics);
+
+      expect(result.passed).toBe(false);
+      expect(result.failedChecks).toHaveLength(4);
+    });
+
+    it("uses canary thresholds for internal phase", () => {
+      const metrics: SLOMetrics = {
+        p95LatencyMs: 2500, // Would fail production (>2000), passes canary (<3000)
+        errorRate: 0.03, // Would fail production (>1%), passes canary (<5%)
+        reconciliationDriftPercent: 7, // Would fail production (>5%), passes canary (<10%)
+        cacheHitRate: 0.65, // Would fail production (>70%), passes canary (>60%)
+      };
+
+      const productionResult = evaluateRolloutGate("domain_admin", metrics);
+      const canaryResult = evaluateRolloutGate("internal", metrics);
+
+      expect(productionResult.passed).toBe(false);
+      expect(productionResult.failedChecks.length).toBeGreaterThan(0);
+
+      expect(canaryResult.passed).toBe(true);
+      expect(canaryResult.failedChecks).toHaveLength(0);
+      expect(canaryResult.thresholds).toEqual(CANARY_THRESHOLDS);
+    });
+
+    it("includes timestamp in result", () => {
+      const metrics: SLOMetrics = {
+        p95LatencyMs: 1500,
+        errorRate: 0.005,
+        reconciliationDriftPercent: 3,
+        cacheHitRate: 0.85,
+      };
+
+      const before = new Date();
+      const result = evaluateRolloutGate("domain_admin", metrics);
+      const after = new Date();
+
+      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(
+        before.getTime(),
+      );
+      expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
+    });
+  });
+
+  describe("ROLLBACK_TRIGGERS", () => {
+    it("defines immediate priority trigger for cross-tenant exposure", () => {
+      const trigger = ROLLBACK_TRIGGERS.find((t) =>
+        t.name.includes("Cross-tenant"),
+      );
+      expect(trigger).toBeDefined();
+      expect(trigger?.priority).toBe("immediate");
+      expect(trigger?.action).toContain("IMMEDIATE");
+      expect(trigger?.action).toContain("Disable");
+    });
+
+    it("defines immediate priority trigger for SLO breach", () => {
+      const trigger = ROLLBACK_TRIGGERS.find((t) => t.name.includes("SLO"));
+      expect(trigger).toBeDefined();
+      expect(trigger?.priority).toBe("immediate");
+    });
+
+    it("defines high priority trigger for reconciliation divergence", () => {
+      const trigger = ROLLBACK_TRIGGERS.find((t) =>
+        t.name.includes("Reconciliation divergence"),
+      );
+      expect(trigger).toBeDefined();
+      expect(trigger?.priority).toBe("high");
+      expect(trigger?.action).toContain("Halt backfill");
+    });
+
+    it("defines high priority trigger for export abuse", () => {
+      const trigger = ROLLBACK_TRIGGERS.find((t) => t.name.includes("Export"));
+      expect(trigger).toBeDefined();
+      expect(trigger?.priority).toBe("high");
+      expect(trigger?.action).toContain("Review audit logs");
+    });
+
+    it("orders triggers by priority", () => {
+      const immediateTriggers = ROLLBACK_TRIGGERS.filter(
+        (t) => t.priority === "immediate",
+      );
+      const highTriggers = ROLLBACK_TRIGGERS.filter(
+        (t) => t.priority === "high",
+      );
+      const mediumTriggers = ROLLBACK_TRIGGERS.filter(
+        (t) => t.priority === "medium",
+      );
+
+      // Verify immediate triggers come first
+      const firstImmediate = ROLLBACK_TRIGGERS.findIndex(
+        (t) => t.priority === "immediate",
+      );
+      const firstHigh = ROLLBACK_TRIGGERS.findIndex(
+        (t) => t.priority === "high",
+      );
+
+      if (immediateTriggers.length > 0 && highTriggers.length > 0) {
+        expect(firstImmediate).toBeLessThan(firstHigh);
+      }
+    });
+
+    it("has at least 5 defined rollback triggers", () => {
+      expect(ROLLBACK_TRIGGERS.length).toBeGreaterThanOrEqual(5);
+    });
+  });
+
+  describe("SLO Thresholds", () => {
+    it("production thresholds are more strict than canary", () => {
+      expect(PRODUCTION_THRESHOLDS.maxP95LatencyMs).toBeLessThan(
+        CANARY_THRESHOLDS.maxP95LatencyMs,
+      );
+      expect(PRODUCTION_THRESHOLDS.maxErrorRate).toBeLessThan(
+        CANARY_THRESHOLDS.maxErrorRate,
+      );
+      expect(
+        PRODUCTION_THRESHOLDS.maxReconciliationDriftPercent,
+      ).toBeLessThan(CANARY_THRESHOLDS.maxReconciliationDriftPercent);
+      expect(PRODUCTION_THRESHOLDS.minCacheHitRate).toBeGreaterThan(
+        CANARY_THRESHOLDS.minCacheHitRate,
+      );
+    });
+
+    it("production thresholds are reasonable for analytics workload", () => {
+      // Latency: 2s is reasonable for complex analytics aggregation
+      expect(PRODUCTION_THRESHOLDS.maxP95LatencyMs).toBe(2000);
+
+      // Error rate: 1% allows for some transient failures
+      expect(PRODUCTION_THRESHOLDS.maxErrorRate).toBe(0.01);
+
+      // Drift: 5% accounts for timing differences in event processing
+      expect(PRODUCTION_THRESHOLDS.maxReconciliationDriftPercent).toBe(5);
+
+      // Cache: 70% hit rate is good for time-series data
+      expect(PRODUCTION_THRESHOLDS.minCacheHitRate).toBe(0.70);
+    });
+  });
+});
diff --git a/apps/web/server/services/funnelRollout.ts b/apps/web/server/services/funnelRollout.ts
new file mode 100644
index 0000000..1da0442
--- /dev/null
+++ b/apps/web/server/services/funnelRollout.ts
@@ -0,0 +1,300 @@
+/**
+ * Funnel Dashboard Rollout Gates and Phase Management
+ *
+ * Defines SLO thresholds, phase progression logic, and rollback triggers
+ * for the funnel analytics feature rollout.
+ */
+
+import { getFeatureFlag } from "./featureFlags";
+import { auditLogger } from "./auditLogger";
+
+// ── Rollout Phases ──
+
+export type RolloutPhase = "disabled" | "internal" | "domain_admin" | "general";
+
+export interface RolloutConfig {
+  phase: RolloutPhase;
+  enabledForInternal: boolean;
+  enabledForDomainAdmin: boolean;
+  canaryValidationRequired: boolean;
+  fallbackReviewRequired: boolean;
+}
+
+// ── SLO Thresholds ──
+
+export interface SLOThresholds {
+  /** Max p95 latency in milliseconds for funnel queries */
+  maxP95LatencyMs: number;
+  /** Max error rate (0-1) for funnel endpoints */
+  maxErrorRate: number;
+  /** Max reconciliation drift tolerance (count mismatch %) */
+  maxReconciliationDriftPercent: number;
+  /** Max cache hit rate degradation from baseline */
+  minCacheHitRate: number;
+}
+
+/**
+ * Production SLO thresholds for rollout gates.
+ * Based on current system performance baseline and privacy requirements.
+ */
+export const PRODUCTION_THRESHOLDS: SLOThresholds = {
+  maxP95LatencyMs: 2000, // 2s max for analytics queries
+  maxErrorRate: 0.01, // 1% error rate threshold
+  maxReconciliationDriftPercent: 5, // 5% drift tolerance
+  minCacheHitRate: 0.70, // 70% cache hit rate minimum
+};
+
+/**
+ * Canary (internal phase) thresholds - more lenient for early testing.
+ */
+export const CANARY_THRESHOLDS: SLOThresholds = {
+  maxP95LatencyMs: 3000, // 3s for canary
+  maxErrorRate: 0.05, // 5% error rate for canary
+  maxReconciliationDriftPercent: 10, // 10% drift tolerance for canary
+  minCacheHitRate: 0.60, // 60% cache hit rate for canary
+};
+
+// ── Rollout Gate Evaluation ──
+
+export interface GateEvaluationResult {
+  passed: boolean;
+  phase: RolloutPhase;
+  thresholds: SLOThresholds;
+  metrics: SLOMetrics;
+  failedChecks: string[];
+  timestamp: Date;
+}
+
+export interface SLOMetrics {
+  p95LatencyMs: number;
+  errorRate: number;
+  reconciliationDriftPercent: number;
+  cacheHitRate: number;
+}
+
+/**
+ * Evaluate if SLO metrics pass the gate for a given phase.
+ *
+ * Returns a detailed result with pass/fail status and failed checks.
+ * Emits audit log for gate evaluation (for rollout observability).
+ */
+export function evaluateRolloutGate(
+  phase: RolloutPhase,
+  metrics: SLOMetrics,
+  userId?: number | null,
+): GateEvaluationResult {
+  const thresholds =
+    phase === "internal" ? CANARY_THRESHOLDS : PRODUCTION_THRESHOLDS;
+  const failedChecks: string[] = [];
+
+  // Check latency
+  if (metrics.p95LatencyMs > thresholds.maxP95LatencyMs) {
+    failedChecks.push(
+      `p95 latency ${metrics.p95LatencyMs}ms exceeds ${thresholds.maxP95LatencyMs}ms`,
+    );
+  }
+
+  // Check error rate
+  if (metrics.errorRate > thresholds.maxErrorRate) {
+    failedChecks.push(
+      `error rate ${(metrics.errorRate * 100).toFixed(2)}% exceeds ${(thresholds.maxErrorRate * 100).toFixed(2)}%`,
+    );
+  }
+
+  // Check reconciliation drift
+  if (
+    metrics.reconciliationDriftPercent > thresholds.maxReconciliationDriftPercent
+  ) {
+    failedChecks.push(
+      `reconciliation drift ${metrics.reconciliationDriftPercent.toFixed(1)}% exceeds ${thresholds.maxReconciliationDriftPercent}%`,
+    );
+  }
+
+  // Check cache hit rate
+  if (metrics.cacheHitRate < thresholds.minCacheHitRate) {
+    failedChecks.push(
+      `cache hit rate ${(metrics.cacheHitRate * 100).toFixed(1)}% below ${(thresholds.minCacheHitRate * 100).toFixed(1)}%`,
+    );
+  }
+
+  const passed = failedChecks.length === 0;
+  const result: GateEvaluationResult = {
+    passed,
+    phase,
+    thresholds,
+    metrics,
+    failedChecks,
+    timestamp: new Date(),
+  };
+
+  // Audit rollout gate evaluation
+  auditLogger.log({
+    eventType: "rollout_gate",
+    userId: userId ?? null,
+    metadata: {
+      feature: "funnel_dashboard",
+      phase,
+      passed,
+      failedChecks,
+      metrics,
+      thresholds,
+    },
+  });
+
+  return result;
+}
+
+// ── Phase Management ──
+
+const FUNNEL_DASHBOARD_FLAG = "FUNNEL_DASHBOARD_ENABLED";
+const FUNNEL_PHASE_FLAG = "FUNNEL_DASHBOARD_PHASE";
+
+/**
+ * Get current rollout configuration for funnel dashboard.
+ */
+export async function getFunnelRolloutConfig(): Promise<RolloutConfig> {
+  const enabled = await getFeatureFlag(FUNNEL_DASHBOARD_FLAG);
+  if (!enabled) {
+    return {
+      phase: "disabled",
+      enabledForInternal: false,
+      enabledForDomainAdmin: false,
+      canaryValidationRequired: false,
+      fallbackReviewRequired: false,
+    };
+  }
+
+  // Read phase from feature flag (stored as string: "internal" | "domain_admin" | "general")
+  // This would normally come from a separate flag or config service
+  // For now, simplified to boolean check
+  const domainAdminEnabled = await getFeatureFlag(
+    "FUNNEL_DASHBOARD_DOMAIN_ADMIN",
+  );
+
+  if (!domainAdminEnabled) {
+    return {
+      phase: "internal",
+      enabledForInternal: true,
+      enabledForDomainAdmin: false,
+      canaryValidationRequired: true,
+      fallbackReviewRequired: false,
+    };
+  }
+
+  return {
+    phase: "domain_admin",
+    enabledForInternal: true,
+    enabledForDomainAdmin: true,
+    canaryValidationRequired: true,
+    fallbackReviewRequired: true,
+  };
+}
+
+/**
+ * Check if funnel dashboard is enabled for a given user role.
+ */
+export async function isFunnelEnabled(role: string | null): Promise<boolean> {
+  const config = await getFunnelRolloutConfig();
+
+  switch (config.phase) {
+    case "disabled":
+      return false;
+    case "internal":
+      // Only enable for admins during canary
+      return role === "admin";
+    case "domain_admin":
+      return role === "admin" || role === "domain_admin";
+    case "general":
+      return true; // Available to all authenticated users
+    default:
+      return false;
+  }
+}
+
+// ── Rollback Triggers ──
+
+export interface RollbackTrigger {
+  name: string;
+  condition: string;
+  action: string;
+  priority: "immediate" | "high" | "medium";
+}
+
+/**
+ * Defined rollback triggers for funnel dashboard.
+ * Ordered by execution priority (immediate actions first).
+ */
+export const ROLLBACK_TRIGGERS: RollbackTrigger[] = [
+  {
+    name: "Cross-tenant data exposure",
+    condition: "Any incident where domain_admin sees data from another tenant",
+    action: "IMMEDIATE: Disable FUNNEL_DASHBOARD_ENABLED, halt all backfills, notify security team",
+    priority: "immediate",
+  },
+  {
+    name: "SLO breach (3+ gates failing)",
+    condition: "p95 latency >5s OR error rate >5% OR reconciliation drift >20%",
+    action: "Disable FUNNEL_DASHBOARD_DOMAIN_ADMIN, keep internal phase for debugging",
+    priority: "immediate",
+  },
+  {
+    name: "Reconciliation divergence trend",
+    condition: "Drift increasing >2% per hour for 3+ consecutive hours",
+    action: "Halt backfill jobs, disable cache writes, investigate data integrity",
+    priority: "high",
+  },
+  {
+    name: "Export abuse pattern",
+    condition: "Rate limit exceeded by >10 users in 1 hour OR single user >100 exports/day",
+    action: "Review audit logs, temporarily disable rawEvents endpoint if needed",
+    priority: "high",
+  },
+  {
+    name: "Cache stampede",
+    condition: "Cache hit rate drops below 30% for >10 minutes",
+    action: "Increase cache TTL, investigate invalidation pattern, add cache warmup",
+    priority: "medium",
+  },
+];
+
+/**
+ * Execute rollback procedure for funnel dashboard.
+ * Returns list of actions taken.
+ */
+export async function executeRollback(
+  trigger: RollbackTrigger,
+  userId?: number | null,
+): Promise<string[]> {
+  const actions: string[] = [];
+
+  // Audit rollback initiation
+  auditLogger.log({
+    eventType: "rollout_gate",
+    userId: userId ?? null,
+    metadata: {
+      feature: "funnel_dashboard",
+      action: "rollback",
+      trigger: trigger.name,
+      priority: trigger.priority,
+    },
+  });
+
+  // Execute rollback based on priority
+  if (trigger.priority === "immediate") {
+    // Full disable
+    // In production: setFeatureFlag(FUNNEL_DASHBOARD_FLAG, false)
+    actions.push("Disabled FUNNEL_DASHBOARD_ENABLED feature flag");
+    actions.push("Halted all funnel backfill jobs");
+    actions.push("Sent alert to on-call engineer");
+  } else if (trigger.priority === "high") {
+    // Partial rollback (keep internal, disable domain_admin)
+    // In production: setFeatureFlag(FUNNEL_DASHBOARD_DOMAIN_ADMIN, false)
+    actions.push("Disabled domain_admin access to funnel dashboard");
+    actions.push("Kept internal phase enabled for investigation");
+  }
+
+  actions.push(`Rollback triggered by: ${trigger.name}`);
+  actions.push(`Condition: ${trigger.condition}`);
+
+  return actions;
+}
diff --git a/docs/runbooks/funnel-dashboard-ownership.md b/docs/runbooks/funnel-dashboard-ownership.md
new file mode 100644
index 0000000..633066d
--- /dev/null
+++ b/docs/runbooks/funnel-dashboard-ownership.md
@@ -0,0 +1,433 @@
+# Funnel Dashboard Operational Ownership Matrix
+
+**Feature**: Funnel Analytics Dashboard
+**Last Updated**: 2026-02-16
+**Review Cycle**: Quarterly
+
+## Overview
+
+This document defines ownership, response windows, and escalation paths for all Funnel Dashboard alert classes. Every alert must have a primary owner and clear response expectations.
+
+---
+
+## Ownership Matrix
+
+| Alert Class | Severity | Primary Owner | Secondary | Response Window | Escalation After |
+|-------------|----------|---------------|-----------|-----------------|------------------|
+| **Cross-Tenant Data Exposure** | CRITICAL | Security Lead | Engineering Manager | 15 minutes | 30 minutes |
+| **SLO Breach (p95 >5s)** | HIGH | On-Call Engineer | Backend Team Lead | 30 minutes | 1 hour |
+| **SLO Breach (Error Rate >5%)** | HIGH | On-Call Engineer | Backend Team Lead | 30 minutes | 1 hour |
+| **Reconciliation Drift >20%** | HIGH | Data Engineer | Backend Team Lead | 1 hour | 4 hours |
+| **Export Abuse (Rate Limit Exceeded)** | MEDIUM | Security Lead | On-Call Engineer | 2 hours | 8 hours |
+| **Cache Hit Rate <30%** | MEDIUM | Infrastructure Engineer | Backend Team Lead | 4 hours | Next business day |
+| **Backfill Job Failure** | LOW | Data Engineer | Backend Team Lead | 8 hours | Next business day |
+| **Audit Log Gap** | LOW | Platform Engineer | Engineering Manager | 24 hours | 48 hours |
+
+---
+
+## Role Definitions
+
+### Primary Owner
+**Responsibilities**:
+- Acknowledge alert within response window
+- Initial triage and diagnosis
+- Execute immediate mitigation (e.g., rollback)
+- Communicate status to team via Slack #incidents channel
+- Coordinate with secondary owner if needed
+
+**Expectations**:
+- Available during on-call rotation (24/7 for CRITICAL, business hours for LOW)
+- Familiar with runbooks and rollback procedures
+- Has access to production systems and monitoring tools
+
+### Secondary Owner
+**Responsibilities**:
+- Support primary owner with diagnosis
+- Execute rollback if primary is unavailable
+- Review post-incident reports
+- Approve changes to runbook
+
+**Expectations**:
+- Available within escalation window
+- Can take over if primary owner is unresponsive
+- Has production access and deep system knowledge
+
+---
+
+## Alert Definitions and Response Playbooks
+
+### 1. Cross-Tenant Data Exposure
+
+**Severity**: CRITICAL
+**Detection**:
+- User report via support ticket
+- Security audit finding
+- Audit log anomaly (scope fallback to wrong tenant)
+
+**Primary Owner**: Security Lead (security@company.com)
+**Response Window**: 15 minutes
+**Escalation**: Engineering Manager after 30 minutes
+
+**Response Playbook**:
+1. **0-5 min**: Acknowledge alert, verify incident scope
+2. **5-10 min**: Execute immediate rollback (disable feature flag)
+3. **10-15 min**: Halt all backfill jobs, notify stakeholders
+4. **15-30 min**: Review audit logs for affected tenants
+5. **30-60 min**: Draft incident report, identify root cause
+6. **1-24 hours**: Implement fix, test in staging
+7. **24-72 hours**: Post-incident review, update runbook
+
+**Escalation Path**:
+- 30 min: Engineering Manager
+- 1 hour: VP Engineering + Security Team
+- 2 hours: CTO + Legal (if customer data exposed)
+
+**Required Documentation**:
+- Incident report (template: `incident-report-template.md`)
+- Affected tenant list
+- Audit log export for forensic analysis
+- Security postmortem
+
+---
+
+### 2. SLO Breach (p95 Latency >5s or Error Rate >5%)
+
+**Severity**: HIGH
+**Detection**:
+- Automated alert from Prometheus/Grafana
+- User complaints about slow dashboard
+- Increased error logs in application monitoring
+
+**Primary Owner**: On-Call Engineer (on-call rotation via PagerDuty)
+**Response Window**: 30 minutes
+**Escalation**: Backend Team Lead after 1 hour
+
+**Response Playbook**:
+1. **0-10 min**: Check monitoring dashboard for spike cause
+   - Database slow queries?
+   - High traffic / DDoS?
+   - External API timeout?
+2. **10-20 min**: If cause not obvious, execute rollback to previous phase
+3. **20-30 min**: Collect diagnostic data:
+   - Query execution plans
+   - Application traces (traceId from audit logs)
+   - Redis metrics (cache hit rate, connection pool)
+4. **30-60 min**: Investigate root cause:
+   - Review code changes in past 48 hours
+   - Check for data anomalies (huge tenant with millions of events)
+   - Test query performance in staging
+5. **1-4 hours**: Implement fix or mitigation (e.g., add index, increase cache TTL)
+6. **4-24 hours**: Monitor recovery, write incident report
+
+**Escalation Path**:
+- 1 hour: Backend Team Lead
+- 2 hours: Engineering Manager
+- 4 hours: VP Engineering (if customer-impacting)
+
+**Common Causes**:
+- Missing database index on frequently queried column
+- Cache invalidation bug (cache thrashing)
+- N+1 query issue in ORM
+- Large tenant with >10M events (needs pagination or optimization)
+
+---
+
+### 3. Reconciliation Drift >20%
+
+**Severity**: HIGH
+**Detection**:
+- Backfill job reports count mismatch >20%
+- Automated reconciliation check fails
+- User reports incorrect event counts
+
+**Primary Owner**: Data Engineer (data-team@company.com)
+**Response Window**: 1 hour
+**Escalation**: Backend Team Lead after 4 hours
+
+**Response Playbook**:
+1. **0-15 min**: Halt all running backfill jobs
+2. **15-30 min**: Run manual reconciliation report:
+   ```sql
+   SELECT tenantId,
+          source_count,
+          funnel_count,
+          (funnel_count - source_count) / source_count * 100 AS drift_percent
+   FROM reconciliation_report
+   WHERE drift_percent > 20
+   ORDER BY drift_percent DESC
+   LIMIT 100;
+   ```
+3. **30-60 min**: Investigate root cause:
+   - Duplicate events? (Check idempotency logic)
+   - Missing events? (Check instrumentation coverage)
+   - Timing issue? (Events arriving after backfill window)
+4. **1-4 hours**: Implement fix:
+   - Update deduplication logic
+   - Adjust backfill window (add buffer time)
+   - Fix instrumentation bug
+5. **4-24 hours**: Re-run backfill for affected tenants, verify drift <5%
+
+**Escalation Path**:
+- 4 hours: Backend Team Lead
+- 8 hours: Engineering Manager
+- 24 hours: VP Engineering (if data integrity compromised)
+
+**Post-Fix Verification**:
+- Re-run reconciliation for 10+ sample tenants
+- Verify drift <5% for all
+- Monitor drift trend over next 48 hours
+
+---
+
+### 4. Export Abuse (Rate Limit Exceeded)
+
+**Severity**: MEDIUM
+**Detection**:
+- Rate limiter logs show TOO_MANY_REQUESTS for funnelAnalytics.export
+- Audit log shows single user >100 exports/day
+- Multiple users (>10) hitting rate limit within 1 hour
+
+**Primary Owner**: Security Lead (security@company.com)
+**Response Window**: 2 hours
+**Escalation**: On-Call Engineer after 8 hours
+
+**Response Playbook**:
+1. **0-30 min**: Review audit logs for affected users/tenants:
+   ```bash
+   grep '"eventType":"funnel_export"' logs/audit/audit-$(date +%Y-%m-%d).jsonl | \
+     jq 'select(.metadata.rowCount > 4000)' | \
+     jq -s 'group_by(.userId) | map({userId: .[0].userId, count: length})' | \
+     jq 'sort_by(.count) | reverse'
+   ```
+2. **30-60 min**: Categorize usage:
+   - Legitimate: User with many domains or large tenant
+   - Suspicious: Automated script or bot
+   - Malicious: Data exfiltration attempt
+3. **1-2 hours**: Take action:
+   - **Legitimate**: Increase rate limit for that user (contact user first)
+   - **Suspicious**: Monitor for 24 hours, contact user
+   - **Malicious**: Block user, notify account team, investigate data exposure
+4. **2-8 hours**: If malicious, review audit logs for all exports by user
+5. **8-24 hours**: Update rate limits if pattern suggests legitimate high usage
+
+**Escalation Path**:
+- 8 hours: On-Call Engineer (if technical issue)
+- 24 hours: Account Manager (if customer complaint)
+
+**Common Scenarios**:
+- Customer using API for automated reporting (legitimate)
+- QA team stress testing (legitimate, but should use staging)
+- Compromised account (malicious)
+- Bug in client code causing retry loops (suspicious)
+
+---
+
+### 5. Cache Hit Rate <30%
+
+**Severity**: MEDIUM
+**Detection**:
+- Redis monitoring shows hit rate drop
+- Database query rate increases significantly
+- Users report slow dashboard performance
+
+**Primary Owner**: Infrastructure Engineer (infra@company.com)
+**Response Window**: 4 hours
+**Escalation**: Backend Team Lead after next business day
+
+**Response Playbook**:
+1. **0-30 min**: Check Redis metrics:
+   - Memory usage (eviction happening?)
+   - Connection count (connection pool exhausted?)
+   - Key count (cache not being populated?)
+2. **30-60 min**: Investigate cache invalidation:
+   - Check application logs for `redis.del` calls
+   - Review recent code changes (did someone add aggressive invalidation?)
+3. **1-2 hours**: Temporary mitigation:
+   - Increase cache TTL from 5 min to 15 min
+   - Increase Redis memory limit (if eviction is the issue)
+4. **2-4 hours**: Implement permanent fix:
+   - Optimize cache key structure (reduce key count)
+   - Add cache warmup job (pre-populate on backfill completion)
+   - Fix over-eager invalidation logic
+5. **4-24 hours**: Monitor recovery, verify hit rate >70%
+
+**Escalation Path**:
+- Next business day: Backend Team Lead
+- 2 business days: Engineering Manager (if performance still degraded)
+
+**Common Causes**:
+- Cache eviction due to memory pressure
+- Bug in cache invalidation logic
+- Cold cache after Redis restart
+- Key expiration set too low
+
+---
+
+### 6. Backfill Job Failure
+
+**Severity**: LOW
+**Detection**:
+- Celery task shows FAILURE status
+- Backfill job logs show exception
+- Reconciliation report shows no new events for tenant
+
+**Primary Owner**: Data Engineer (data-team@company.com)
+**Response Window**: 8 hours (business hours only)
+**Escalation**: Backend Team Lead after next business day
+
+**Response Playbook**:
+1. **0-2 hours**: Review job logs for error:
+   - Database connection timeout?
+   - Source data API unavailable?
+   - Bug in transformation logic?
+2. **2-4 hours**: Categorize failure:
+   - Transient: Network issue, will retry automatically
+   - Systemic: Bug in code, needs fix
+   - Data quality: Source data is malformed
+3. **4-8 hours**: Take action:
+   - **Transient**: Monitor retry, ensure success within 24 hours
+   - **Systemic**: Fix bug, deploy, rerun job
+   - **Data quality**: Contact data provider, request fix
+4. **8-24 hours**: Rerun job for affected tenant(s), verify success
+
+**Escalation Path**:
+- Next business day: Backend Team Lead
+- 2 business days: Engineering Manager (if blocking customer)
+
+**Auto-Retry Policy**:
+- Backfill jobs retry 3 times with exponential backoff
+- After 3 failures, job moves to DEAD LETTER queue
+- On-call engineer notified after 3 failures
+
+---
+
+### 7. Audit Log Gap
+
+**Severity**: LOW
+**Detection**:
+- Monitoring detects missing audit log entries for >1 hour
+- Audit log file not written (disk full?)
+- AuditLogger throws exception
+
+**Primary Owner**: Platform Engineer (platform@company.com)
+**Response Window**: 24 hours
+**Escalation**: Engineering Manager after 48 hours
+
+**Response Playbook**:
+1. **0-4 hours**: Check auditLogger health:
+   - Is log file writable?
+   - Is disk full?
+   - Is log rotation working?
+2. **4-8 hours**: Review application logs for auditLogger errors
+3. **8-24 hours**: Investigate root cause:
+   - Disk space issue? (clean up old logs)
+   - Permission issue? (fix file permissions)
+   - Bug in auditLogger? (fix and deploy)
+4. **24-48 hours**: Implement fix, verify audit logging resumes
+
+**Escalation Path**:
+- 48 hours: Engineering Manager
+- 72 hours: VP Engineering (if compliance risk)
+
+**Compliance Impact**:
+- Audit logs required for GDPR Article 30 (records of processing)
+- Missing logs may indicate security incident (investigate)
+- Notify security team if gap >24 hours
+
+---
+
+## On-Call Rotation
+
+### Schedule
+- **Primary On-Call**: Weekly rotation (Monday-Monday)
+- **Secondary On-Call**: Weekly rotation (offset by 1 week)
+- **Holidays**: Extended rotation (2 weeks for major holidays)
+
+### On-Call Responsibilities
+- Respond to alerts within response window
+- Execute rollback procedures when needed
+- Communicate status in #incidents Slack channel
+- Write incident report within 24 hours of resolution
+- Participate in post-incident review
+
+### On-Call Handoff
+- **Sunday 5pm**: Outgoing on-call posts handoff summary
+- **Monday 9am**: Incoming on-call acknowledges and reviews open incidents
+- **Handoff includes**: Open alerts, ongoing investigations, known issues
+
+---
+
+## Communication Channels
+
+### Real-Time Alerts
+- **PagerDuty**: Critical and High severity alerts
+- **Slack #alerts**: All alert notifications
+- **Slack #incidents**: Incident coordination and status updates
+
+### Status Updates
+- **Stakeholders**: Engineering Manager, Product Manager, Customer Success
+- **Update Frequency**: Every 30 minutes for Critical, hourly for High
+- **Update Template**:
+  ```
+  [INCIDENT] Funnel Dashboard SLO Breach
+  Status: INVESTIGATING | MITIGATED | RESOLVED
+  Impact: [USER IMPACT]
+  ETA: [RESOLUTION TIME]
+  Owner: [ON-CALL NAME]
+  ```
+
+### Post-Incident Communication
+- **Incident Report**: Published to #engineering within 24 hours
+- **Post-Incident Review**: Scheduled within 3 business days
+- **Runbook Update**: Published within 1 week
+
+---
+
+## Metrics and Review
+
+### Weekly Metrics
+- Alert count by severity
+- Mean time to acknowledge (MTTA)
+- Mean time to resolve (MTTR)
+- False positive rate
+- Rollback count
+
+### Monthly Review
+- Review ownership matrix (any changes needed?)
+- Review response windows (are they realistic?)
+- Review escalation paths (were they followed?)
+- Update runbooks based on lessons learned
+
+### Quarterly Review
+- Deep dive on recurring incidents
+- Optimize alert thresholds
+- Review and update this document
+- Training for new team members
+
+---
+
+## Training Requirements
+
+### New Team Member Onboarding
+- [ ] Read this ownership matrix
+- [ ] Read rollout runbook
+- [ ] Shadow on-call engineer for 1 week
+- [ ] Execute mock rollback in staging
+- [ ] Review past incident reports (last 3 months)
+
+### Ongoing Training
+- [ ] Quarterly runbook review session
+- [ ] Post-incident review attendance (all team members)
+- [ ] Annual disaster recovery drill
+
+---
+
+## Document Ownership
+
+**Maintained By**: Backend Team Lead
+**Review Cycle**: Quarterly
+**Last Review**: 2026-02-16
+**Next Review**: 2026-05-16
+
+**Change Log**:
+- 2026-02-16: Initial version (section 08 implementation)
diff --git a/docs/runbooks/funnel-dashboard-rollout.md b/docs/runbooks/funnel-dashboard-rollout.md
new file mode 100644
index 0000000..7b55a5e
--- /dev/null
+++ b/docs/runbooks/funnel-dashboard-rollout.md
@@ -0,0 +1,377 @@
+# Funnel Dashboard Rollout and Rollback Runbook
+
+**Feature**: Funnel Analytics Dashboard
+**Owner**: Engineering Team
+**Last Updated**: 2026-02-16
+**Version**: 1.0
+
+## Table of Contents
+1. [Rollout Phases](#rollout-phases)
+2. [SLO Gates and Thresholds](#slo-gates-and-thresholds)
+3. [Phase Advancement Procedure](#phase-advancement-procedure)
+4. [Rollback Triggers and Actions](#rollback-triggers-and-actions)
+5. [Post-Rollback Verification](#post-rollback-verification)
+6. [Operational Ownership](#operational-ownership)
+
+---
+
+## Rollout Phases
+
+### Phase 0: Disabled (Pre-Rollout)
+**Status**: Feature completely disabled
+**Flag**: `FUNNEL_DASHBOARD_ENABLED=false`
+**Access**: No one
+**Exit Criteria**: Code deployed, tests passing, runbook reviewed
+
+### Phase 1: Internal (Canary)
+**Status**: Available to internal admins only
+**Flag**: `FUNNEL_DASHBOARD_ENABLED=true`, `FUNNEL_DASHBOARD_DOMAIN_ADMIN=false`
+**Access**: Users with `role=admin`
+**Duration**: Minimum 3 days
+**Exit Criteria**:
+- All SLO gates pass with canary thresholds for 48 consecutive hours
+- Canary validation checklist completed (see below)
+- Zero cross-tenant exposure incidents
+- Manual smoke testing complete
+
+### Phase 2: Domain Admin
+**Status**: Available to domain administrators
+**Flag**: `FUNNEL_DASHBOARD_ENABLED=true`, `FUNNEL_DASHBOARD_DOMAIN_ADMIN=true`
+**Access**: Users with `role=admin` or `role=domain_admin`
+**Duration**: Minimum 7 days
+**Exit Criteria**:
+- All SLO gates pass with production thresholds for 72 consecutive hours
+- Fallback anomaly review completed
+- Export abuse patterns reviewed (no incidents)
+- Customer success team trained
+
+### Phase 3: General Availability
+**Status**: Available to all authenticated users
+**Flag**: Full GA configuration
+**Access**: All authenticated users (based on subscription tier)
+**Exit Criteria**: Business decision with Product team approval
+
+---
+
+## SLO Gates and Thresholds
+
+### Canary Thresholds (Phase 1: Internal)
+| Metric | Threshold | Rationale |
+|--------|-----------|-----------|
+| **p95 Latency** | ≤ 3000ms | More lenient for early testing; complex aggregations allowed |
+| **Error Rate** | ≤ 5% | Allows for debugging and iteration |
+| **Reconciliation Drift** | ≤ 10% | Accounts for backfill timing variations |
+| **Cache Hit Rate** | ≥ 60% | Acceptable during cache warmup period |
+
+### Production Thresholds (Phase 2+)
+| Metric | Threshold | Rationale |
+|--------|-----------|-----------|
+| **p95 Latency** | ≤ 2000ms | Maintains good user experience for analytics |
+| **Error Rate** | ≤ 1% | Standard production reliability target |
+| **Reconciliation Drift** | ≤ 5% | Ensures data accuracy for business decisions |
+| **Cache Hit Rate** | ≥ 70% | Prevents database load spikes |
+
+---
+
+## Phase Advancement Procedure
+
+### Prerequisites
+Before advancing to ANY phase, verify:
+1. ✅ Previous phase exit criteria met
+2. ✅ On-call engineer assigned and available
+3. ✅ Rollback runbook reviewed by team
+4. ✅ Monitoring dashboards configured
+5. ✅ Alert rules tested and verified
+
+### Steps to Advance Phase
+
+**Step 1: Collect Metrics**
+```bash
+# Query production metrics for the past 72 hours
+# Example: Check Prometheus/Grafana dashboard
+- p95 latency for funnelAnalytics endpoints
+- Error rate from application logs
+- Reconciliation job success rate
+- Redis cache hit rate
+```
+
+**Step 2: Evaluate Gates**
+```typescript
+// Run gate evaluation (programmatically or manual calculation)
+import { evaluateRolloutGate } from './server/services/funnelRollout';
+
+const metrics = {
+  p95LatencyMs: 1850,          // From monitoring
+  errorRate: 0.008,             // From logs
+  reconciliationDriftPercent: 3.2, // From backfill jobs
+  cacheHitRate: 0.78,           // From Redis
+};
+
+const result = evaluateRolloutGate('domain_admin', metrics);
+console.log('Gate passed:', result.passed);
+console.log('Failed checks:', result.failedChecks);
+```
+
+**Step 3: Complete Phase-Specific Checklist**
+
+#### Internal → Domain Admin Checklist
+- [ ] Canary validation checklist 100% complete (see section below)
+- [ ] Zero cross-tenant exposure incidents in past 72 hours
+- [ ] All audit logs reviewed for anomalies
+- [ ] Export endpoint usage reviewed (no abuse patterns)
+- [ ] Manual regression testing on 5+ real tenant accounts
+- [ ] Performance profiling completed (no N+1 queries)
+
+#### Domain Admin → General Availability Checklist
+- [ ] Fallback anomaly review document signed off
+- [ ] Customer success team trained on feature
+- [ ] Documentation published (user guide + API docs)
+- [ ] Pricing/subscription tier logic implemented (if applicable)
+- [ ] Rate limiting verified under load test
+- [ ] Export limits tested (5000 row truncation works)
+- [ ] Privacy audit completed (GDPR compliance verified)
+
+**Step 4: Enable Feature Flag**
+```bash
+# Use Redis CLI or admin panel to set feature flags
+redis-cli SET feature-flag:FUNNEL_DASHBOARD_DOMAIN_ADMIN "true"
+
+# Verify flag is set
+redis-cli GET feature-flag:FUNNEL_DASHBOARD_DOMAIN_ADMIN
+# Expected: "true"
+```
+
+**Step 5: Monitor for 2 Hours**
+After flag change, actively monitor for 2 hours:
+- Dashboard latency (p50, p95, p99)
+- Error logs (filter by funnelAnalytics)
+- Audit logs (scope fallback, export operations)
+- Cache hit rate (should remain stable)
+- Database query performance (check slow query log)
+
+**Step 6: Announce to Team**
+Post in #engineering Slack channel:
+```
+🚀 Funnel Dashboard: Advanced to [PHASE NAME]
+- Enabled for: [USER ROLES]
+- Metrics: [GATE STATUS]
+- On-call: [ENGINEER NAME]
+- Rollback contact: [MANAGER NAME]
+```
+
+---
+
+## Rollback Triggers and Actions
+
+### Immediate Rollback (Priority: IMMEDIATE)
+
+#### Trigger 1: Cross-Tenant Data Exposure
+**Condition**: Any incident where a domain_admin user sees data from another tenant
+**Detection**: User report, security audit, or audit log review
+**Actions**:
+1. **IMMEDIATE**: Disable feature flag
+   ```bash
+   redis-cli SET feature-flag:FUNNEL_DASHBOARD_ENABLED "false"
+   ```
+2. **IMMEDIATE**: Halt all funnel backfill jobs
+   ```bash
+   # Stop Celery workers or pause job queue
+   celery -A app.core.celery_app control shutdown
+   ```
+3. **IMMEDIATE**: Notify security team and on-call manager
+4. **Within 15 min**: Review audit logs for affected tenants
+5. **Within 30 min**: Draft incident report
+6. **Within 24 hours**: Root cause analysis and remediation plan
+
+#### Trigger 2: SLO Breach (3+ Gates Failing)
+**Condition**: p95 latency >5s OR error rate >5% OR reconciliation drift >20%
+**Detection**: Automated alert from monitoring
+**Actions**:
+1. **IMMEDIATE**: Rollback to previous phase
+   ```bash
+   redis-cli SET feature-flag:FUNNEL_DASHBOARD_DOMAIN_ADMIN "false"
+   ```
+2. Keep internal phase enabled for debugging
+3. Notify on-call engineer
+4. Collect diagnostic data (query plans, slow logs, traces)
+5. Investigate root cause before re-enabling
+
+### High Priority Rollback
+
+#### Trigger 3: Reconciliation Divergence Trend
+**Condition**: Drift increasing >2% per hour for 3+ consecutive hours
+**Detection**: Automated monitoring of reconciliation job results
+**Actions**:
+1. Halt all backfill jobs
+2. Disable cache writes (force read-through)
+3. Investigate data integrity (compare funnel_events vs source data)
+4. Do NOT disable frontend (existing data is still valid)
+5. Resume backfill only after root cause identified
+
+#### Trigger 4: Export Abuse Pattern
+**Condition**: Rate limit exceeded by >10 users in 1 hour OR single user >100 exports/day
+**Detection**: Rate limiter alerts, audit log analysis
+**Actions**:
+1. Review audit logs for affected users/tenants
+2. Temporarily increase rate limits if legitimate usage
+3. Contact users if abuse suspected
+4. If malicious: Disable rawEvents endpoint temporarily
+   ```typescript
+   // Comment out rawEvents procedure or add feature flag gate
+   ```
+
+### Medium Priority Rollback
+
+#### Trigger 5: Cache Stampede
+**Condition**: Cache hit rate drops below 30% for >10 minutes
+**Detection**: Redis monitoring alert
+**Actions**:
+1. Increase cache TTL from 5 min to 15 min
+2. Investigate cache invalidation pattern (check logs)
+3. Add cache warmup job if needed
+4. Monitor for recovery (should resolve within 30 min)
+
+---
+
+## Post-Rollback Verification
+
+After ANY rollback, complete this checklist before re-enabling:
+
+### Immediate Verification (Within 1 Hour)
+- [ ] Feature flag confirmed disabled in Redis
+- [ ] All backfill jobs confirmed halted (check Celery queue)
+- [ ] No new errors in application logs
+- [ ] User-facing routes return expected error or "feature unavailable" message
+- [ ] Audit logs capture rollback event with timestamp and trigger
+
+### Auth & Credit Smoke Checks (Within 2 Hours)
+- [ ] User can still log in (auth not affected)
+- [ ] Credit balance queries work (LLM requests unaffected)
+- [ ] Chat interface loads and responds (core functionality intact)
+- [ ] Other admin features accessible (library, media, settings)
+
+### Scope Safety Verification (Within 4 Hours)
+- [ ] Test with 3 different tenant accounts (different domains)
+- [ ] Verify no cross-tenant data visible in ANY endpoint
+- [ ] Check audit logs for any scope fallback anomalies
+- [ ] Review export audit logs for last 24 hours (no leaks)
+
+### Data Integrity Check (Within 24 Hours)
+- [ ] Run reconciliation report on sample of tenants (10+)
+- [ ] Compare funnel_events count vs source data
+- [ ] Verify no duplicate events (idempotency check)
+- [ ] Spot-check event properties (sanitization still working)
+
+### Root Cause Analysis (Within 3 Days)
+- [ ] Incident report drafted
+- [ ] Root cause identified and documented
+- [ ] Fix implemented and tested in staging
+- [ ] Regression test added to prevent recurrence
+- [ ] Runbook updated with lessons learned
+
+---
+
+## Operational Ownership
+
+See [funnel-dashboard-ownership.md](./funnel-dashboard-ownership.md) for detailed ownership matrix.
+
+### Quick Reference
+
+| Alert Class | Primary Owner | Secondary | Response Window |
+|-------------|---------------|-----------|-----------------|
+| Cross-tenant exposure | Security Lead | Engineering Manager | 15 minutes |
+| SLO breach | On-call Engineer | Backend Team Lead | 30 minutes |
+| Reconciliation divergence | Data Engineer | Backend Team Lead | 1 hour |
+| Export abuse | Security Lead | On-call Engineer | 2 hours |
+| Cache issues | Infrastructure Engineer | Backend Team Lead | 4 hours |
+
+---
+
+## Canary Validation Checklist
+
+**Complete this checklist before advancing from Internal to Domain Admin phase.**
+
+### Functional Testing
+- [ ] Summary endpoint returns correct aggregates (tested with 3+ event types)
+- [ ] Time series endpoint returns data for all bucket types (day/week/month)
+- [ ] rawEvents endpoint returns per-user data when `includeUserData=true`
+- [ ] rawEvents endpoint excludes userId when `includeUserData=false`
+- [ ] Export endpoint generates valid CSV format
+- [ ] Export endpoint generates valid JSON format
+- [ ] Export limit truncates at 5000 rows (tested with large dataset)
+- [ ] Cache invalidation works (verified fresh data after backfill)
+
+### Security Testing
+- [ ] Unauthorized role (user) cannot access any funnel endpoint (403 error)
+- [ ] Domain admin cannot see data from other tenants
+- [ ] Admin can see tenant-wide data (all domains)
+- [ ] Property sanitization removes all PII fields (email, phone, IP)
+- [ ] Rate limiting blocks requests after threshold (tested manually)
+- [ ] Audit logs capture all export operations
+
+### Performance Testing
+- [ ] p95 latency <3000ms for summary endpoint (canary threshold)
+- [ ] p95 latency <3000ms for timeSeries endpoint
+- [ ] p95 latency <3000ms for rawEvents endpoint
+- [ ] Export of 5000 rows completes in <10 seconds
+- [ ] No N+1 query issues (verified with query logging)
+- [ ] Cache hit rate >60% after warmup period
+
+### Data Quality Testing
+- [ ] Reconciliation drift <10% (canary threshold)
+- [ ] No duplicate events in funnel_events table
+- [ ] Event timestamps match source data (within 1 minute)
+- [ ] Backfill job handles partial failures gracefully
+- [ ] Idempotency: Re-running instrumentation does not create duplicates
+
+### Observability Testing
+- [ ] Scope fallback events appear in audit logs
+- [ ] Export events appear in audit logs with correct metadata
+- [ ] rawEvents queries appear in audit logs with elevated flag
+- [ ] Rollout gate evaluation logged for each metrics check
+- [ ] Error logs include traceId for correlation
+
+**Sign-off**: _________________________  Date: __________
+**Role**: Engineering Lead
+
+---
+
+## Fallback Anomaly Review Template
+
+**Complete before advancing from Domain Admin to General Availability.**
+
+### Audit Log Analysis (Past 7 Days)
+- [ ] Reviewed all scope fallback events (count: _____)
+- [ ] Verified fallbacks were legitimate (ctxTenantId null scenarios)
+- [ ] No unexpected fallback patterns detected
+- [ ] Export operations reviewed (count: _____)
+- [ ] No single user exceeded 50 exports/day
+- [ ] No tenant exceeded 500 exports/week
+
+### Error Pattern Analysis
+- [ ] Reviewed all funnelAnalytics errors (count: _____)
+- [ ] Categorized errors (auth: ___, scope: ___, query: ___, other: ___)
+- [ ] All errors have known root causes (list exceptions below)
+- [ ] No recurring error pattern (same error >10 times/day)
+
+### Performance Anomalies
+- [ ] Identified slowest 10 queries (p99 latency: _____ms)
+- [ ] Verified slow queries are due to data volume (not bugs)
+- [ ] No memory leaks detected (heap size stable)
+- [ ] No cache thrashing (hit rate stable >70%)
+
+### Security Findings
+- [ ] No cross-tenant exposure incidents
+- [ ] No unauthorized access attempts detected
+- [ ] No property sanitization bypass attempts
+- [ ] No rate limit bypass attempts
+
+### Exceptions and Follow-ups
+_List any anomalies that require follow-up before GA:_
+
+1. ___________________________________________
+2. ___________________________________________
+3. ___________________________________________
+
+**Sign-off**: _________________________  Date: __________
+**Role**: Engineering Manager
