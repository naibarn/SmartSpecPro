import { desc, eq, inArray } from "drizzle-orm";

import {
  skillImprovementRecommendations,
  skillImprovementRuns,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import { applySkillUpgradeRecommendation } from "../server/services/skillUpgradeApplier";

const ACTIVE_RUN_STATUSES = ["queued", "running"] as const;

function parseArg(name: string, fallback: string): string {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
}

function isStale(run: {
  status: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
}, now: Date, thresholdMinutes: number): boolean {
  if (!(ACTIVE_RUN_STATUSES as readonly string[]).includes(run.status)) {
    return false;
  }
  const activityAt = new Date(run.updatedAt ?? run.startedAt ?? run.createdAt).getTime();
  return Number.isFinite(activityAt) && now.getTime() - activityAt >= thresholdMinutes * 60 * 1000;
}

function buildRecoveryLogs(logsJson: unknown, recoveredAt: Date): Record<string, unknown> {
  const current = logsJson && typeof logsJson === "object" ? logsJson as Record<string, unknown> : {};
  return {
    ...current,
    failureCode: "stale_apply_task",
    staleTaskRecovered: true,
    recoveredAt: recoveredAt.toISOString(),
    resultError: "Apply task was queued or running past the recovery threshold and was retried automatically.",
  };
}

async function main() {
  const db = getDb();
  const now = new Date();
  const thresholdMinutes = Math.max(5, Number.parseInt(parseArg("older-than-minutes", "30"), 10));
  const limit = Math.max(1, Math.min(200, Number.parseInt(parseArg("limit", "100"), 10)));
  const dryRun = process.argv.includes("--dry-run");

  const rows = await db
    .select()
    .from(skillImprovementRuns)
    .where(inArray(skillImprovementRuns.status, [...ACTIVE_RUN_STATUSES]))
    .orderBy(desc(skillImprovementRuns.updatedAt))
    .limit(limit);

  const candidates = rows.filter((row) => (
    row.runType === "apply"
    && row.recommendationId != null
    && isStale(row, now, thresholdMinutes)
  ));

  if (dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      scanned: rows.length,
      stale: candidates.length,
      candidates: candidates.map((row) => ({
        runId: row.id,
        recommendationId: row.recommendationId,
        status: row.status,
        summary: row.summary,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        startedAt: row.startedAt,
      })),
    }, null, 2));
    return;
  }

  const results: Array<{
    runId: number;
    recommendationId: number | null;
    success: boolean;
    taskId?: string | null;
    error?: string;
  }> = [];

  for (const row of candidates) {
    try {
      await db
        .update(skillImprovementRuns)
        .set({
          status: "failed",
          summary: row.summary || "Apply task became stale and was queued for automatic retry",
          errorMessage: "Apply task exceeded the recovery threshold before completion.",
          logsJson: buildRecoveryLogs(row.logsJson, now),
          endedAt: now,
          updatedAt: now,
        })
        .where(eq(skillImprovementRuns.id, row.id));

      await db
        .update(skillImprovementRecommendations)
        .set({
          status: "failed",
          updatedAt: now,
        })
        .where(eq(skillImprovementRecommendations.id, row.recommendationId!));

      const retryResult = await applySkillUpgradeRecommendation({
        db,
        recommendationId: row.recommendationId!,
        requestedBy: null,
        tenantId: row.tenantId,
        userRole: "admin",
        userToken: null,
        publicUrl: process.env.PUBLIC_URL ?? null,
        sourceRunId: row.id,
        retryReason: `Automatic retry after stale apply run ${row.id}`,
      });

      results.push({
        runId: row.id,
        recommendationId: row.recommendationId,
        success: true,
        taskId: retryResult.taskId ?? null,
      });
    } catch (error) {
      results.push({
        runId: row.id,
        recommendationId: row.recommendationId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify({
    scanned: rows.length,
    stale: candidates.length,
    recovered: results.filter((item) => item.success).length,
    failed: results.filter((item) => !item.success).length,
    results,
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
