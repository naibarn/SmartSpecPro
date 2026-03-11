/**
 * Planner Telemetry — Shadow mode validation queries.
 *
 * Read-only queries that compare planner-recommended models vs actual models used,
 * track cost deltas, and measure planner latency overhead. Used for validating
 * shadow mode accuracy before switching to active mode.
 */

import { getDb } from "../db";
import { taskRuns, taskStepAttempts } from "../../drizzle/schema";
import { sql, desc, gte } from "drizzle-orm";

// ── Types ────────────────────────────────────────────────────────────

export interface PlannerAccuracyReport {
  totalRuns: number;
  modelMatches: number;
  modelMismatches: number;
  accuracyPercent: number;
  avgLatencyMs: number;
  byTaskType: Record<
    string,
    {
      runs: number;
      matches: number;
      avgCostDelta: number;
    }
  >;
}

export interface CostComparisonReport {
  totalPlannerCredits: number;
  totalActualCredits: number;
  deltaPercent: number;
  outliers: Array<{
    taskRunId: number;
    plannerCredits: number;
    actualCredits: number;
  }>;
}

export interface LatencyReport {
  avgPlannerMs: number;
  p95PlannerMs: number;
  p99PlannerMs: number;
  totalRequests: number;
}

// ── Accuracy Report ──────────────────────────────────────────────────

/**
 * Compare planner-recommended model vs actual model used (shadow mode).
 */
export async function getPlannerAccuracyReport(
  hoursBack: number = 24,
): Promise<PlannerAccuracyReport> {
  const db = await getDb();
  if (!db) {
    return {
      totalRuns: 0,
      modelMatches: 0,
      modelMismatches: 0,
      accuracyPercent: 0,
      avgLatencyMs: 0,
      byTaskType: {},
    };
  }

  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const rows = await db
    .select({
      taskType: taskRuns.taskType,
      planJson: taskRuns.planJson,
      effectiveModel: taskStepAttempts.effectiveModel,
      creditsUsed: taskStepAttempts.creditsUsed,
      durationMs: taskStepAttempts.durationMs,
    })
    .from(taskRuns)
    .innerJoin(
      taskStepAttempts,
      sql`${taskStepAttempts.taskRunId} = ${taskRuns.id}`,
    )
    .where(gte(taskRuns.createdAt, since))
    .orderBy(desc(taskRuns.createdAt));

  const byTaskType: PlannerAccuracyReport["byTaskType"] = {};
  let totalMatches = 0;
  let totalMismatches = 0;
  let totalLatencyMs = 0;
  let latencyCount = 0;

  for (const row of rows) {
    const plan = row.planJson as Record<string, unknown> | null;
    const recommendedModel = (plan as any)?.recommendedModel ?? null;

    // Skip rows without a planner recommendation — they don't measure accuracy
    if (!recommendedModel) continue;

    const isMatch = recommendedModel === row.effectiveModel;

    if (isMatch) totalMatches++;
    else totalMismatches++;

    if (row.durationMs != null) {
      totalLatencyMs += row.durationMs;
      latencyCount++;
    }

    const tt = row.taskType ?? "unknown";
    if (!byTaskType[tt]) {
      byTaskType[tt] = { runs: 0, matches: 0, avgCostDelta: 0 };
    }
    byTaskType[tt].runs++;
    if (isMatch) byTaskType[tt].matches++;
  }

  const totalRuns = totalMatches + totalMismatches;
  return {
    totalRuns,
    modelMatches: totalMatches,
    modelMismatches: totalMismatches,
    accuracyPercent: totalRuns > 0 ? (totalMatches / totalRuns) * 100 : 0,
    avgLatencyMs: latencyCount > 0 ? totalLatencyMs / latencyCount : 0,
    byTaskType,
  };
}

// ── Cost Comparison ──────────────────────────────────────────────────

/**
 * Shadow mode cost comparison: planner-tracked vs actual credits used.
 * Identifies outliers where planner estimate differs by >10%.
 */
export async function getCostComparisonReport(
  hoursBack: number = 24,
): Promise<CostComparisonReport> {
  const db = await getDb();
  if (!db) {
    return {
      totalPlannerCredits: 0,
      totalActualCredits: 0,
      deltaPercent: 0,
      outliers: [],
    };
  }

  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const rows = await db
    .select({
      taskRunId: taskRuns.id,
      totalCreditsUsed: taskRuns.totalCreditsUsed,
      stepCredits: sql<number>`COALESCE(SUM(${taskStepAttempts.creditsUsed}), 0)`,
    })
    .from(taskRuns)
    .leftJoin(
      taskStepAttempts,
      sql`${taskStepAttempts.taskRunId} = ${taskRuns.id}`,
    )
    .where(gte(taskRuns.createdAt, since))
    .groupBy(taskRuns.id)
    .orderBy(desc(taskRuns.createdAt));

  let totalPlannerCredits = 0;
  let totalActualCredits = 0;
  const outliers: CostComparisonReport["outliers"] = [];

  for (const row of rows) {
    const plannerCredits = Number(row.totalCreditsUsed ?? 0);
    const actualCredits = Number(row.stepCredits ?? 0);
    totalPlannerCredits += plannerCredits;
    totalActualCredits += actualCredits;

    if (actualCredits > 0) {
      const delta = Math.abs(plannerCredits - actualCredits) / actualCredits;
      if (delta > 0.1) {
        outliers.push({
          taskRunId: row.taskRunId,
          plannerCredits,
          actualCredits,
        });
      }
    }
  }

  const deltaPercent =
    totalActualCredits > 0
      ? ((totalPlannerCredits - totalActualCredits) / totalActualCredits) * 100
      : 0;

  return {
    totalPlannerCredits,
    totalActualCredits,
    deltaPercent,
    outliers,
  };
}

// ── Latency Report ───────────────────────────────────────────────────

/**
 * Planner latency overhead: time spent in planner per request.
 * Approximated via step attempt durationMs.
 */
export async function getPlannerLatencyReport(
  hoursBack: number = 24,
): Promise<LatencyReport> {
  const db = await getDb();
  if (!db) {
    return { avgPlannerMs: 0, p95PlannerMs: 0, p99PlannerMs: 0, totalRequests: 0 };
  }

  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const rows = await db
    .select({
      durationMs: taskStepAttempts.durationMs,
    })
    .from(taskStepAttempts)
    .innerJoin(taskRuns, sql`${taskRuns.id} = ${taskStepAttempts.taskRunId}`)
    .where(gte(taskRuns.createdAt, since))
    .orderBy(taskStepAttempts.durationMs);

  const durations = rows
    .map((r) => r.durationMs)
    .filter((d): d is number => d != null && d > 0);

  if (durations.length === 0) {
    return { avgPlannerMs: 0, p95PlannerMs: 0, p99PlannerMs: 0, totalRequests: 0 };
  }

  const sorted = durations.sort((a, b) => a - b);
  const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const p95Idx = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
  const p99Idx = Math.min(Math.floor(sorted.length * 0.99), sorted.length - 1);

  return {
    avgPlannerMs: Math.round(avg),
    p95PlannerMs: sorted[p95Idx],
    p99PlannerMs: sorted[p99Idx],
    totalRequests: sorted.length,
  };
}
