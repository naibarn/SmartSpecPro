import { desc, eq, inArray, or } from "drizzle-orm";

import {
  skillImprovementRecommendations,
  skillImprovementRuns,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import { applySkillUpgradeRecommendation } from "../server/services/skillUpgradeApplier";

const LEGACY_UPGRADE_TYPES = ["native-bundle-upgrade", "migrate-to-native-bundle"] as const;
const ACTIVE_RUN_STATUSES = ["queued", "running"] as const;
const ACTIONABLE_STATUSES = ["pending_review", "approved", "blocked", "failed"] as const;

function isNoChangeRun(run: {
  summary: string | null;
  errorMessage: string | null;
  logsJson: unknown;
} | null): boolean {
  if (!run) {
    return false;
  }

  const logs = run.logsJson && typeof run.logsJson === "object"
    ? run.logsJson as Record<string, unknown>
    : {};
  const combined = [
    run.summary,
    run.errorMessage,
    logs.resultMessage,
    logs.resultError,
    logs.completionMode,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return combined.includes("no patches generated")
    || combined.includes("no code changes")
    || combined.includes("without code changes")
    || combined.includes("no changes required")
    || combined.includes("no_changes");
}

function isCompletedProposalRun(run: {
  runType: string;
  status: string;
  summary: string | null;
  errorMessage: string | null;
  logsJson: unknown;
} | null): boolean {
  if (!run) {
    return false;
  }
  const logs = run.logsJson && typeof run.logsJson === "object"
    ? run.logsJson as Record<string, unknown>
    : {};
  const combined = [
    run.summary,
    run.errorMessage,
    logs.resultMessage,
    logs.applyStrategy,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return run.runType === "apply"
    && run.status === "completed"
    && (logs.applyStrategy === "proposal" || combined.includes("proposal generated"));
}

async function main() {
  const db = getDb();
  const limit = Number.parseInt(process.argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) || "50", 10);
  const dryRun = process.argv.includes("--dry-run");

  const recommendations = await db
    .select()
    .from(skillImprovementRecommendations)
    .where(or(
      eq(skillImprovementRecommendations.recommendationType, LEGACY_UPGRADE_TYPES[0]),
      eq(skillImprovementRecommendations.recommendationType, LEGACY_UPGRADE_TYPES[1]),
    ))
    .orderBy(desc(skillImprovementRecommendations.analyzedAt))
    .limit(Math.max(1, Math.min(limit, 200)));

  const actionable = recommendations.filter((item) => (
    (ACTIONABLE_STATUSES as readonly string[]).includes(item.status)
  ));
  const recommendationIds = actionable.map((item) => item.id);
  const latestRuns = recommendationIds.length > 0
    ? await db
      .select()
      .from(skillImprovementRuns)
      .where(inArray(skillImprovementRuns.recommendationId, recommendationIds))
      .orderBy(desc(skillImprovementRuns.createdAt))
    : [];

  const latestRunByRecommendationId = new Map<number, (typeof latestRuns)[number]>();
  for (const run of latestRuns) {
    if (run.recommendationId == null || latestRunByRecommendationId.has(run.recommendationId)) {
      continue;
    }
    latestRunByRecommendationId.set(run.recommendationId, run);
  }

  const candidates = actionable.filter((item) => {
    const latestRun = latestRunByRecommendationId.get(item.id) ?? null;
    if (latestRun && (ACTIVE_RUN_STATUSES as readonly string[]).includes(latestRun.status)) {
      return false;
    }
    if (isCompletedProposalRun(latestRun)) {
      return false;
    }
    if (latestRun?.runType === "apply" && isNoChangeRun(latestRun)) {
      return false;
    }
    return true;
  });

  const results: Array<{
    recommendationId: number;
    success: boolean;
    mode?: string;
    applyStrategy?: string;
    taskId?: string | null;
    error?: string;
  }> = [];

  if (dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      scanned: recommendations.length,
      actionable: actionable.length,
      skippedActiveNoChangeOrProposal: actionable.length - candidates.length,
      candidates: candidates.map((item) => ({
        recommendationId: item.id,
        skillId: item.skillId,
        status: item.status,
        type: item.recommendationType,
        autoApplySafe: item.isAutoApplySafe,
        latestRun: latestRunByRecommendationId.get(item.id)
          ? {
            id: latestRunByRecommendationId.get(item.id)?.id,
            runType: latestRunByRecommendationId.get(item.id)?.runType,
            status: latestRunByRecommendationId.get(item.id)?.status,
            summary: latestRunByRecommendationId.get(item.id)?.summary,
          }
          : null,
      })),
    }, null, 2));
    return;
  }

  for (const item of candidates) {
    try {
      const result = await applySkillUpgradeRecommendation({
        db,
        recommendationId: item.id,
        requestedBy: null,
        tenantId: item.tenantId,
        userRole: "admin",
        userToken: null,
        publicUrl: process.env.PUBLIC_URL ?? null,
      });

      results.push({
        recommendationId: item.id,
        success: true,
        mode: result.mode,
        applyStrategy: result.applyStrategy,
        taskId: result.taskId ?? null,
      });
    } catch (error) {
      results.push({
        recommendationId: item.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify({
    scanned: recommendations.length,
    actionable: actionable.length,
    skippedActiveNoChangeOrProposal: actionable.length - candidates.length,
    attempted: candidates.length,
    succeeded: results.filter((item) => item.success).length,
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
