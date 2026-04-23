import { describe, expect, it } from "vitest";
import {
  autoTeamArtifactRefs,
  autoTeamExecutionStages,
  autoTeamFinalResults,
  autoTeamMediaJobRefs,
  autoTeamRouteDecisions,
  autoTeamTraceEvents,
  autoTeamReviewRecords,
} from "../schema";

describe("auto-team execution schema", () => {
  it("exports canonical tables with tenant-scoped columns", () => {
    for (const table of [
      autoTeamRouteDecisions,
      autoTeamExecutionStages,
      autoTeamMediaJobRefs,
      autoTeamReviewRecords,
      autoTeamFinalResults,
      autoTeamTraceEvents,
      autoTeamArtifactRefs,
    ]) {
      expect(table.tenantId).toBeDefined();
    }
  });

  it("includes required route decision columns", () => {
    expect(autoTeamRouteDecisions.routeClass).toBeDefined();
    expect(autoTeamRouteDecisions.allowedCapabilityFamiliesJson).toBeDefined();
    expect(autoTeamRouteDecisions.selectedOrchestratorPersonaId).toBeDefined();
    expect(autoTeamRouteDecisions.language).toBeDefined();
    expect(autoTeamRouteDecisions.blockedReason).toBeDefined();
    expect(autoTeamRouteDecisions.idempotencyKey).toBeDefined();
  });

  it("includes required stage columns", () => {
    expect(autoTeamExecutionStages.stageType).toBeDefined();
    expect(autoTeamExecutionStages.status).toBeDefined();
    expect(autoTeamExecutionStages.workItemId).toBeDefined();
    expect(autoTeamExecutionStages.planStepKey).toBeDefined();
    expect(autoTeamExecutionStages.expectedCapabilityFamily).toBeDefined();
    expect(autoTeamExecutionStages.selectedSkillId).toBeDefined();
    expect(autoTeamExecutionStages.jobRefIdsJson).toBeDefined();
    expect(autoTeamExecutionStages.blockedReason).toBeDefined();
    expect(autoTeamExecutionStages.idempotencyKey).toBeDefined();
  });

  it("includes required media job columns", () => {
    expect(autoTeamMediaJobRefs.mediaType).toBeDefined();
    expect(autoTeamMediaJobRefs.provider).toBeDefined();
    expect(autoTeamMediaJobRefs.model).toBeDefined();
    expect(autoTeamMediaJobRefs.providerTaskId).toBeDefined();
    expect(autoTeamMediaJobRefs.providerStatus).toBeDefined();
    expect(autoTeamMediaJobRefs.submittedPromptArtifactRef).toBeDefined();
    expect(autoTeamMediaJobRefs.resultArtifactRefsJson).toBeDefined();
    expect(autoTeamMediaJobRefs.idempotencyKey).toBeDefined();
  });

  it("includes review, final result, trace, and artifact ref columns", () => {
    expect(autoTeamReviewRecords.reviewerPersonaId).toBeDefined();
    expect(autoTeamReviewRecords.score).toBeDefined();
    expect(autoTeamReviewRecords.passThreshold).toBeDefined();
    expect(autoTeamReviewRecords.passed).toBeDefined();
    expect(autoTeamReviewRecords.comments).toBeDefined();
    expect(autoTeamReviewRecords.repairInstructions).toBeDefined();

    expect(autoTeamFinalResults.routeDecisionId).toBeDefined();
    expect(autoTeamFinalResults.status).toBeDefined();
    expect(autoTeamFinalResults.finalArtifactRefsJson).toBeDefined();
    expect(autoTeamFinalResults.mediaJobRefIdsJson).toBeDefined();
    expect(autoTeamFinalResults.reviewRecordRefIdsJson).toBeDefined();
    expect(autoTeamFinalResults.humanApprovalStatus).toBeDefined();
    expect(autoTeamFinalResults.summary).toBeDefined();
    expect(autoTeamFinalResults.failureReason).toBeDefined();

    expect(autoTeamTraceEvents.eventName).toBeDefined();
    expect(autoTeamTraceEvents.sequence).toBeDefined();
    expect(autoTeamTraceEvents.sourceComponent).toBeDefined();
    expect(autoTeamTraceEvents.idempotencyKey).toBeDefined();
    expect(autoTeamTraceEvents.traceEventId).toBeDefined();
    expect(autoTeamTraceEvents.severity).toBeDefined();
    expect(autoTeamTraceEvents.summary).toBeDefined();
    expect(autoTeamTraceEvents.redactedMetadataJson).toBeDefined();

    expect(autoTeamArtifactRefs.artifactType).toBeDefined();
    expect(autoTeamArtifactRefs.artifactRole).toBeDefined();
    expect(autoTeamArtifactRefs.storageRef).toBeDefined();
    expect(autoTeamArtifactRefs.externalRef).toBeDefined();
    expect(autoTeamArtifactRefs.contentHash).toBeDefined();
    expect(autoTeamArtifactRefs.visibility).toBeDefined();
    expect(autoTeamArtifactRefs.retentionPolicyJson).toBeDefined();
    expect(autoTeamArtifactRefs.safetyStatus).toBeDefined();
  });

  it("exposes idempotency and sequence indexes in the migration text", async () => {
    const migration = await import(
      "../0155_auto_team_execution_records.sql?raw"
    ).catch(() => null);
    const text = String(migration?.default ?? migration ?? "");
    expect(text).toContain("auto_team_route_decisions_tenant_run_idempotency_unique");
    expect(text).toContain("auto_team_execution_stages_tenant_run_idempotency_unique");
    expect(text).toContain("auto_team_trace_events_tenant_run_sequence_unique");
  });
});
