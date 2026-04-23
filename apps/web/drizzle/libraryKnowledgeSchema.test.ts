import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";

import {
  libraryContextPackReviewEvents,
  libraryIndexJobs,
  libraryKnowledgeBackfillRuns,
  libraryKnowledgeBackfillRunStatusEnum,
  libraryKnowledgeReleaseGateOverrides,
  libraryKnowledgeMatchedByEnum,
  libraryKnowledgeNotes,
  libraryKnowledgeRelationKindEnum,
  libraryKnowledgeRelations,
  libraryKnowledgeResolutionStatusEnum,
  libraryKnowledgeTelemetryEvents,
  libraryKnowledgeTelemetryRollups,
} from "./schema";

describe("library knowledge schema", () => {
  it("defines index-job payload and knowledge refresh tracking columns", () => {
    const columns = getTableColumns(libraryIndexJobs);

    expect(columns.payloadVersion).toBeDefined();
    expect(columns.payloadJson).toBeDefined();
    expect(columns.source).toBeDefined();
    expect(columns.sourceMetadataJson).toBeDefined();
    expect(columns.dedupeKey).toBeDefined();
    expect(columns.knowledgeRefreshReason).toBeDefined();
    expect(columns.knowledgeRefreshStatus).toBeDefined();
    expect(columns.knowledgeRefreshAttemptCount).toBeDefined();
    expect(columns.knowledgeRefreshRequestedAt).toBeDefined();
    expect(columns.knowledgeRefreshCompletedAt).toBeDefined();
    expect(columns.knowledgeRefreshError).toBeDefined();
  });

  it("defines knowledge note state columns for extracted markdown metadata", () => {
    const columns = getTableColumns(libraryKnowledgeNotes);

    expect(columns.libraryItemId).toBeDefined();
    expect(columns.tenantId).toBeDefined();
    expect(columns.logicalPath).toBeDefined();
    expect(columns.normalizedTitle).toBeDefined();
    expect(columns.aliases).toBeDefined();
    expect(columns.tags).toBeDefined();
    expect(columns.properties).toBeDefined();
    expect(columns.headings).toBeDefined();
    expect(columns.diagnostics).toBeDefined();
    expect(columns.sourceUpdatedAt).toBeDefined();
    expect(columns.lastExtractedAt).toBeDefined();
    expect(columns.isStale).toBeDefined();
    expect(columns.staleReason).toBeDefined();
  });

  it("defines knowledge relation cache columns for explainable link resolution", () => {
    const columns = getTableColumns(libraryKnowledgeRelations);

    expect(columns.id).toBeDefined();
    expect(columns.sourceLibraryItemId).toBeDefined();
    expect(columns.targetLibraryItemId).toBeDefined();
    expect(columns.relationKind).toBeDefined();
    expect(columns.rawReference).toBeDefined();
    expect(columns.targetPath).toBeDefined();
    expect(columns.targetHeading).toBeDefined();
    expect(columns.resolutionStatus).toBeDefined();
    expect(columns.matchedBy).toBeDefined();
    expect(columns.candidateLibraryItemIds).toBeDefined();
    expect(columns.diagnostics).toBeDefined();
  });

  it("defines backfill run progress columns for tenant rebuild tracking", () => {
    const columns = getTableColumns(libraryKnowledgeBackfillRuns);

    expect(columns.id).toBeDefined();
    expect(columns.tenantId).toBeDefined();
    expect(columns.requestedByUserId).toBeDefined();
    expect(columns.status).toBeDefined();
    expect(columns.totalNotes).toBeDefined();
    expect(columns.processedNotes).toBeDefined();
    expect(columns.successfulNotes).toBeDefined();
    expect(columns.failedNotes).toBeDefined();
    expect(columns.retryCount).toBeDefined();
    expect(columns.lastCursorLibraryItemId).toBeDefined();
    expect(columns.lastError).toBeDefined();
    expect(columns.startedAt).toBeDefined();
    expect(columns.completedAt).toBeDefined();
  });

  it("defines append-only review history columns for context-pack workflow actions", () => {
    const columns = getTableColumns(libraryContextPackReviewEvents);

    expect(columns.contextPackId).toBeDefined();
    expect(columns.actorUserId).toBeDefined();
    expect(columns.action).toBeDefined();
    expect(columns.previousReadinessStatus).toBeDefined();
    expect(columns.nextReadinessStatus).toBeDefined();
    expect(columns.previousApprovedForAgents).toBeDefined();
    expect(columns.nextApprovedForAgents).toBeDefined();
    expect(columns.reason).toBeDefined();
    expect(columns.metadata).toBeDefined();
    expect(columns.createdAt).toBeDefined();
  });

  it("defines telemetry, rollup, and release-gate override ledgers", () => {
    const telemetryColumns = getTableColumns(libraryKnowledgeTelemetryEvents);
    const rollupColumns = getTableColumns(libraryKnowledgeTelemetryRollups);
    const overrideColumns = getTableColumns(libraryKnowledgeReleaseGateOverrides);

    expect(telemetryColumns.eventType).toBeDefined();
    expect(telemetryColumns.sampleCount).toBeDefined();
    expect(telemetryColumns.metricJson).toBeDefined();

    expect(rollupColumns.windowStart).toBeDefined();
    expect(rollupColumns.windowEnd).toBeDefined();
    expect(rollupColumns.sampleCount).toBeDefined();

    expect(overrideColumns.actorUserId).toBeDefined();
    expect(overrideColumns.approvedByUserId).toBeDefined();
    expect(overrideColumns.overrideMode).toBeDefined();
    expect(overrideColumns.reason).toBeDefined();
    expect(overrideColumns.scopeType).toBeDefined();
    expect(overrideColumns.scopeId).toBeDefined();
    expect(overrideColumns.expiresAt).toBeDefined();
    expect(overrideColumns.approvedAt).toBeDefined();
    expect(overrideColumns.approvalReason).toBeDefined();
    expect(overrideColumns.rejectedAt).toBeDefined();
    expect(overrideColumns.rejectedByUserId).toBeDefined();
    expect(overrideColumns.rejectedReason).toBeDefined();
    expect(overrideColumns.revokedAt).toBeDefined();
  });

  it("exposes deterministic enums for relation resolution and backfill lifecycle", () => {
    expect(libraryKnowledgeRelationKindEnum.enumValues).toEqual([
      "wikilink",
      "markdown",
    ]);
    expect(libraryKnowledgeResolutionStatusEnum.enumValues).toEqual([
      "resolved",
      "ambiguous",
      "unresolved",
      "forbidden",
    ]);
    expect(libraryKnowledgeMatchedByEnum.enumValues).toEqual([
      "logical_path",
      "title",
      "alias",
    ]);
    expect(libraryKnowledgeBackfillRunStatusEnum.enumValues).toEqual([
      "queued",
      "running",
      "completed",
      "failed",
      "cancelled",
    ]);
  });
});
