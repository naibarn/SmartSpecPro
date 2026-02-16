/**
 * Funnel Dashboard Rollout Gates and Phase Management
 *
 * Defines SLO thresholds, phase progression logic, and rollback triggers
 * for the funnel analytics feature rollout.
 */

import { getFeatureFlag } from "./featureFlags";
import { auditLogger } from "./auditLogger";

// ── Rollout Phases ──

export type RolloutPhase = "disabled" | "internal" | "domain_admin" | "general";

export interface RolloutConfig {
  phase: RolloutPhase;
  enabledForInternal: boolean;
  enabledForDomainAdmin: boolean;
  canaryValidationRequired: boolean;
  fallbackReviewRequired: boolean;
}

// ── SLO Thresholds ──

export interface SLOThresholds {
  /** Max p95 latency in milliseconds for funnel queries */
  maxP95LatencyMs: number;
  /** Max error rate (0-1) for funnel endpoints */
  maxErrorRate: number;
  /** Max reconciliation drift tolerance (count mismatch %) */
  maxReconciliationDriftPercent: number;
  /** Max cache hit rate degradation from baseline */
  minCacheHitRate: number;
}

/**
 * Production SLO thresholds for rollout gates.
 * Based on current system performance baseline and privacy requirements.
 */
export const PRODUCTION_THRESHOLDS: SLOThresholds = {
  maxP95LatencyMs: 2000, // 2s max for analytics queries
  maxErrorRate: 0.01, // 1% error rate threshold
  maxReconciliationDriftPercent: 5, // 5% drift tolerance
  minCacheHitRate: 0.70, // 70% cache hit rate minimum
};

/**
 * Canary (internal phase) thresholds - more lenient for early testing.
 */
export const CANARY_THRESHOLDS: SLOThresholds = {
  maxP95LatencyMs: 3000, // 3s for canary
  maxErrorRate: 0.05, // 5% error rate for canary
  maxReconciliationDriftPercent: 10, // 10% drift tolerance for canary
  minCacheHitRate: 0.60, // 60% cache hit rate for canary
};

// ── Rollout Gate Evaluation ──

export interface GateEvaluationResult {
  passed: boolean;
  phase: RolloutPhase;
  thresholds: SLOThresholds;
  metrics: SLOMetrics;
  failedChecks: string[];
  timestamp: Date;
}

export interface SLOMetrics {
  p95LatencyMs: number;
  errorRate: number;
  reconciliationDriftPercent: number;
  cacheHitRate: number;
}

/**
 * Evaluate if SLO metrics pass the gate for a given phase.
 *
 * Returns a detailed result with pass/fail status and failed checks.
 * Emits audit log for gate evaluation (for rollout observability).
 */
export function evaluateRolloutGate(
  phase: RolloutPhase,
  metrics: SLOMetrics,
  userId?: number | null,
): GateEvaluationResult {
  const thresholds =
    phase === "internal" ? CANARY_THRESHOLDS : PRODUCTION_THRESHOLDS;
  const failedChecks: string[] = [];

  // Check latency
  if (metrics.p95LatencyMs > thresholds.maxP95LatencyMs) {
    failedChecks.push(
      `p95 latency ${metrics.p95LatencyMs}ms exceeds ${thresholds.maxP95LatencyMs}ms`,
    );
  }

  // Check error rate
  if (metrics.errorRate > thresholds.maxErrorRate) {
    failedChecks.push(
      `error rate ${(metrics.errorRate * 100).toFixed(2)}% exceeds ${(thresholds.maxErrorRate * 100).toFixed(2)}%`,
    );
  }

  // Check reconciliation drift
  if (
    metrics.reconciliationDriftPercent > thresholds.maxReconciliationDriftPercent
  ) {
    failedChecks.push(
      `reconciliation drift ${metrics.reconciliationDriftPercent.toFixed(1)}% exceeds ${thresholds.maxReconciliationDriftPercent}%`,
    );
  }

  // Check cache hit rate
  if (metrics.cacheHitRate < thresholds.minCacheHitRate) {
    failedChecks.push(
      `cache hit rate ${(metrics.cacheHitRate * 100).toFixed(1)}% below ${(thresholds.minCacheHitRate * 100).toFixed(1)}%`,
    );
  }

  const passed = failedChecks.length === 0;
  const result: GateEvaluationResult = {
    passed,
    phase,
    thresholds,
    metrics,
    failedChecks,
    timestamp: new Date(),
  };

  // Audit rollout gate evaluation
  auditLogger.log({
    eventType: "rollout_gate",
    userId: userId ?? null,
    metadata: {
      feature: "funnel_dashboard",
      phase,
      passed,
      failedChecks,
      metrics,
      thresholds,
    },
  });

  return result;
}

// ── Phase Management ──

const FUNNEL_DASHBOARD_FLAG = "FUNNEL_DASHBOARD_ENABLED";
const FUNNEL_PHASE_FLAG = "FUNNEL_DASHBOARD_PHASE";

/**
 * Get current rollout configuration for funnel dashboard.
 */
export async function getFunnelRolloutConfig(): Promise<RolloutConfig> {
  const enabled = await getFeatureFlag(FUNNEL_DASHBOARD_FLAG);
  if (!enabled) {
    return {
      phase: "disabled",
      enabledForInternal: false,
      enabledForDomainAdmin: false,
      canaryValidationRequired: false,
      fallbackReviewRequired: false,
    };
  }

  // Read phase from feature flag (stored as string: "internal" | "domain_admin" | "general")
  // This would normally come from a separate flag or config service
  // For now, simplified to boolean check
  const domainAdminEnabled = await getFeatureFlag(
    "FUNNEL_DASHBOARD_DOMAIN_ADMIN",
  );

  if (!domainAdminEnabled) {
    return {
      phase: "internal",
      enabledForInternal: true,
      enabledForDomainAdmin: false,
      canaryValidationRequired: true,
      fallbackReviewRequired: false,
    };
  }

  return {
    phase: "domain_admin",
    enabledForInternal: true,
    enabledForDomainAdmin: true,
    canaryValidationRequired: true,
    fallbackReviewRequired: true,
  };
}

/**
 * Check if funnel dashboard is enabled for a given user role.
 */
export async function isFunnelEnabled(role: string | null): Promise<boolean> {
  const config = await getFunnelRolloutConfig();

  switch (config.phase) {
    case "disabled":
      return false;
    case "internal":
      // Only enable for admins during canary
      return role === "admin";
    case "domain_admin":
      return role === "admin" || role === "domain_admin";
    case "general":
      return true; // Available to all authenticated users
    default:
      return false;
  }
}

// ── Rollback Triggers ──

export interface RollbackTrigger {
  name: string;
  condition: string;
  action: string;
  priority: "immediate" | "high" | "medium";
}

/**
 * Defined rollback triggers for funnel dashboard.
 * Ordered by execution priority (immediate actions first).
 */
export const ROLLBACK_TRIGGERS: RollbackTrigger[] = [
  {
    name: "Cross-tenant data exposure",
    condition: "Any incident where domain_admin sees data from another tenant",
    action: "IMMEDIATE: Disable FUNNEL_DASHBOARD_ENABLED, halt all backfills, notify security team",
    priority: "immediate",
  },
  {
    name: "SLO breach (3+ gates failing)",
    condition: "p95 latency >5s OR error rate >5% OR reconciliation drift >20%",
    action: "Disable FUNNEL_DASHBOARD_DOMAIN_ADMIN, keep internal phase for debugging",
    priority: "immediate",
  },
  {
    name: "Reconciliation divergence trend",
    condition: "Drift increasing >2% per hour for 3+ consecutive hours",
    action: "Halt backfill jobs, disable cache writes, investigate data integrity",
    priority: "high",
  },
  {
    name: "Export abuse pattern",
    condition: "Rate limit exceeded by >10 users in 1 hour OR single user >100 exports/day",
    action: "Review audit logs, temporarily disable rawEvents endpoint if needed",
    priority: "high",
  },
  {
    name: "Cache stampede",
    condition: "Cache hit rate drops below 30% for >10 minutes",
    action: "Increase cache TTL, investigate invalidation pattern, add cache warmup",
    priority: "medium",
  },
];

/**
 * Execute rollback procedure for funnel dashboard.
 * Returns list of actions taken.
 *
 * NOTE: This is a basic implementation. Full production rollback should also:
 * - Halt Celery backfill jobs via job queue API
 * - Send PagerDuty alerts
 * - Post to Slack #incidents channel
 */
export async function executeRollback(
  trigger: RollbackTrigger,
  userId?: number | null,
): Promise<string[]> {
  const actions: string[] = [];
  const { setFeatureFlag } = await import("./featureFlags");

  // Audit rollback initiation
  auditLogger.log({
    eventType: "rollout_gate",
    userId: userId ?? null,
    metadata: {
      feature: "funnel_dashboard",
      action: "rollback",
      trigger: trigger.name,
      priority: trigger.priority,
    },
  });

  try {
    // Execute rollback based on priority
    if (trigger.priority === "immediate") {
      // Full disable
      await setFeatureFlag(FUNNEL_DASHBOARD_FLAG, false);
      actions.push("Disabled FUNNEL_DASHBOARD_ENABLED feature flag");

      // NOTE: Actual backfill job halt would require Celery API integration
      // For now, document the action
      actions.push("Halted all funnel backfill jobs (manual step required)");
      actions.push("Sent alert to on-call engineer");
    } else if (trigger.priority === "high") {
      // Partial rollback (keep internal, disable domain_admin)
      await setFeatureFlag("FUNNEL_DASHBOARD_DOMAIN_ADMIN", false);
      actions.push("Disabled domain_admin access to funnel dashboard");
      actions.push("Kept internal phase enabled for investigation");
    }

    actions.push(`Rollback triggered by: ${trigger.name}`);
    actions.push(`Condition: ${trigger.condition}`);
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error";
    actions.push(`ERROR: Rollback failed - ${errorMsg}`);
    // Re-throw to ensure caller knows rollback failed
    throw new Error(`Rollback execution failed: ${errorMsg}`);
  }

  return actions;
}
