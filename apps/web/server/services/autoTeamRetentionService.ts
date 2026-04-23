import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  autoTeamArtifactRefs,
  autoTeamExecutionStages,
  autoTeamFinalResults,
  autoTeamMediaJobRefs,
  autoTeamReviewRecords,
  autoTeamRouteDecisions,
  autoTeamTraceEvents,
  teamRooms,
  teamRuns,
} from "../../drizzle/schema";
import {
  getAutoTeamRolloutFlags,
  shouldRunAutoTeamRetentionCleanup,
} from "./autoTeamFeatureFlags";

const DEFAULT_RETENTION_DAYS = 30;
const TERMINAL_RUN_STATUSES = ["completed", "failed", "stopped"] as const;

export interface AutoTeamRetentionSummary {
  tenantId: string;
  retentionDays: number;
  cutoffAt: string;
  featureEnabled: boolean;
  eligibleRunIds: string[];
  eligibleRunCount: number;
  expiredCounts: {
    routeDecisions: number;
    executionStages: number;
    mediaJobs: number;
    reviewRecords: number;
    finalResults: number;
    traceEvents: number;
    artifactRefs: number;
  };
  cleanupComplete: boolean;
}

export interface AutoTeamRetentionCleanupResult extends AutoTeamRetentionSummary {
  dryRun: boolean;
  deletedCounts: AutoTeamRetentionSummary["expiredCounts"];
}

function buildCutoffDate(retentionDays: number): Date {
  const safeDays = Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : DEFAULT_RETENTION_DAYS;
  return new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
}

async function listEligibleRunIds(
  tenantId: string,
  cutoffAt: Date,
): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const roomRows = await db
    .select({ id: teamRooms.id })
    .from(teamRooms)
    .where(eq(teamRooms.tenantId, tenantId));
  const roomIds = roomRows.map((row) => row.id);
  if (roomIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({ id: teamRuns.id })
    .from(teamRuns)
    .where(
      and(
        inArray(teamRuns.roomId, roomIds),
        eq(teamRuns.executionMode, "auto_team"),
        inArray(teamRuns.status, [...TERMINAL_RUN_STATUSES]),
        sql`${teamRuns.endedAt} IS NOT NULL`,
        lte(teamRuns.endedAt, cutoffAt),
      ),
    )
    .orderBy(desc(teamRuns.endedAt));

  return rows.map((row) => row.id);
}

async function countRowsForRuns(
  tenantId: string,
  runIds: string[],
): Promise<AutoTeamRetentionSummary["expiredCounts"]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (runIds.length === 0) {
    return {
      routeDecisions: 0,
      executionStages: 0,
      mediaJobs: 0,
      reviewRecords: 0,
      finalResults: 0,
      traceEvents: 0,
      artifactRefs: 0,
    };
  }

  const [routeDecisions, executionStages, mediaJobs, reviewRecords, finalResults, traceEvents, artifactRefs] =
    await Promise.all([
      db.select({ id: autoTeamRouteDecisions.id }).from(autoTeamRouteDecisions).where(and(eq(autoTeamRouteDecisions.tenantId, tenantId), inArray(autoTeamRouteDecisions.runId, runIds))),
      db.select({ id: autoTeamExecutionStages.id }).from(autoTeamExecutionStages).where(and(eq(autoTeamExecutionStages.tenantId, tenantId), inArray(autoTeamExecutionStages.runId, runIds))),
      db.select({ id: autoTeamMediaJobRefs.id }).from(autoTeamMediaJobRefs).where(and(eq(autoTeamMediaJobRefs.tenantId, tenantId), inArray(autoTeamMediaJobRefs.runId, runIds))),
      db.select({ id: autoTeamReviewRecords.id }).from(autoTeamReviewRecords).where(and(eq(autoTeamReviewRecords.tenantId, tenantId), inArray(autoTeamReviewRecords.runId, runIds))),
      db.select({ id: autoTeamFinalResults.id }).from(autoTeamFinalResults).where(and(eq(autoTeamFinalResults.tenantId, tenantId), inArray(autoTeamFinalResults.runId, runIds))),
      db.select({ id: autoTeamTraceEvents.id }).from(autoTeamTraceEvents).where(and(eq(autoTeamTraceEvents.tenantId, tenantId), inArray(autoTeamTraceEvents.runId, runIds))),
      db.select({ id: autoTeamArtifactRefs.id }).from(autoTeamArtifactRefs).where(and(eq(autoTeamArtifactRefs.tenantId, tenantId), inArray(autoTeamArtifactRefs.runId, runIds))),
    ]);

  return {
    routeDecisions: routeDecisions.length,
    executionStages: executionStages.length,
    mediaJobs: mediaJobs.length,
    reviewRecords: reviewRecords.length,
    finalResults: finalResults.length,
    traceEvents: traceEvents.length,
    artifactRefs: artifactRefs.length,
  };
}

export async function getAutoTeamRetentionSummary(input: {
  tenantId: string;
  retentionDays?: number;
}): Promise<AutoTeamRetentionSummary> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const flags = await getAutoTeamRolloutFlags();
  const cutoffAt = buildCutoffDate(input.retentionDays ?? DEFAULT_RETENTION_DAYS);
  const eligibleRunIds = await listEligibleRunIds(input.tenantId, cutoffAt);
  const expiredCounts = await countRowsForRuns(input.tenantId, eligibleRunIds);

  return {
    tenantId: input.tenantId,
    retentionDays: input.retentionDays ?? DEFAULT_RETENTION_DAYS,
    cutoffAt: cutoffAt.toISOString(),
    featureEnabled: shouldRunAutoTeamRetentionCleanup(flags),
    eligibleRunIds,
    eligibleRunCount: eligibleRunIds.length,
    expiredCounts,
    cleanupComplete: eligibleRunIds.length === 0,
  };
}

async function deleteRowsForRuns(
  tenantId: string,
  runIds: string[],
): Promise<AutoTeamRetentionSummary["expiredCounts"]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (runIds.length === 0) {
    return {
      routeDecisions: 0,
      executionStages: 0,
      mediaJobs: 0,
      reviewRecords: 0,
      finalResults: 0,
      traceEvents: 0,
      artifactRefs: 0,
    };
  }

  return db.transaction(async (tx) => {
    const scrubbedArtifactRefs = await tx
      .update(autoTeamArtifactRefs)
      .set({
        storageRef: null,
        externalRef: null,
        safetyStatus: "redacted",
        retentionPolicyJson: {
          purgedAt: new Date().toISOString(),
          reason: "auto_team_retention_cleanup",
        },
        updatedAt: new Date(),
      })
      .where(and(eq(autoTeamArtifactRefs.tenantId, tenantId), inArray(autoTeamArtifactRefs.runId, runIds)))
      .returning({ id: autoTeamArtifactRefs.id });
    const scrubbedArtifactCount = scrubbedArtifactRefs.length;
    void scrubbedArtifactCount;
    const scrubbedMediaJobs = await tx
      .update(autoTeamMediaJobRefs)
      .set({
        resultArtifactRefsJson: [],
        updatedAt: new Date(),
      })
      .where(and(eq(autoTeamMediaJobRefs.tenantId, tenantId), inArray(autoTeamMediaJobRefs.runId, runIds)))
      .returning({ id: autoTeamMediaJobRefs.id });
    const scrubbedMediaJobCount = scrubbedMediaJobs.length;
    void scrubbedMediaJobCount;
    const deletedArtifactRefs = await tx.delete(autoTeamArtifactRefs).where(and(eq(autoTeamArtifactRefs.tenantId, tenantId), inArray(autoTeamArtifactRefs.runId, runIds))).returning({ id: autoTeamArtifactRefs.id });
    const deletedTraceEvents = await tx.delete(autoTeamTraceEvents).where(and(eq(autoTeamTraceEvents.tenantId, tenantId), inArray(autoTeamTraceEvents.runId, runIds))).returning({ id: autoTeamTraceEvents.id });
    const deletedMediaJobs = await tx.delete(autoTeamMediaJobRefs).where(and(eq(autoTeamMediaJobRefs.tenantId, tenantId), inArray(autoTeamMediaJobRefs.runId, runIds))).returning({ id: autoTeamMediaJobRefs.id });
    const deletedReviewRecords = await tx.delete(autoTeamReviewRecords).where(and(eq(autoTeamReviewRecords.tenantId, tenantId), inArray(autoTeamReviewRecords.runId, runIds))).returning({ id: autoTeamReviewRecords.id });
    const deletedFinalResults = await tx.delete(autoTeamFinalResults).where(and(eq(autoTeamFinalResults.tenantId, tenantId), inArray(autoTeamFinalResults.runId, runIds))).returning({ id: autoTeamFinalResults.id });
    const deletedExecutionStages = await tx.delete(autoTeamExecutionStages).where(and(eq(autoTeamExecutionStages.tenantId, tenantId), inArray(autoTeamExecutionStages.runId, runIds))).returning({ id: autoTeamExecutionStages.id });
    const deletedRouteDecisions = await tx.delete(autoTeamRouteDecisions).where(and(eq(autoTeamRouteDecisions.tenantId, tenantId), inArray(autoTeamRouteDecisions.runId, runIds))).returning({ id: autoTeamRouteDecisions.id });

    return {
      routeDecisions: deletedRouteDecisions.length,
      executionStages: deletedExecutionStages.length,
      mediaJobs: deletedMediaJobs.length,
      reviewRecords: deletedReviewRecords.length,
      finalResults: deletedFinalResults.length,
      traceEvents: deletedTraceEvents.length,
      artifactRefs: deletedArtifactRefs.length,
    };
  });
}

export async function runAutoTeamRetentionCleanup(input: {
  tenantId: string;
  retentionDays?: number;
  dryRun?: boolean;
}): Promise<AutoTeamRetentionCleanupResult> {
  const summary = await getAutoTeamRetentionSummary({
    tenantId: input.tenantId,
    retentionDays: input.retentionDays,
  });

  if (!summary.featureEnabled) {
    return {
      ...summary,
      dryRun: true,
      deletedCounts: {
        routeDecisions: 0,
        executionStages: 0,
        mediaJobs: 0,
        reviewRecords: 0,
        finalResults: 0,
        traceEvents: 0,
        artifactRefs: 0,
      },
    };
  }

  if (input.dryRun) {
    return {
      ...summary,
      dryRun: true,
      deletedCounts: summary.expiredCounts,
    };
  }

  const deletedCounts = await deleteRowsForRuns(input.tenantId, summary.eligibleRunIds);
  return {
    ...summary,
    dryRun: false,
    deletedCounts,
  };
}
