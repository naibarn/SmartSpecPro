import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRunSnapshot: vi.fn(),
  evaluateStageTimeout: vi.fn(),
  getRun: vi.fn(),
  getRoom: vi.fn(),
  getMessages: vi.fn(),
  listWorkItemsByRoom: vi.fn(),
  getTeam: vi.fn(),
  getWorkRequest: vi.fn(),
  getWorkCaseProjection: vi.fn(),
  getContextEngineHealth: vi.fn(),
  getAutoTeamRetentionSummary: vi.fn(),
  verifyAutoTeamMigrationBaseline: vi.fn(),
  evaluateCompletionEvidence: vi.fn(),
  summarizeMissingEvidence: vi.fn(),
  evaluateAutoTeamLoopGuard: vi.fn(),
}));

vi.mock("../autoTeamExecutionService", () => ({
  getRunSnapshot: mocks.getRunSnapshot,
  evaluateStageTimeout: mocks.evaluateStageTimeout,
}));

vi.mock("../roomService", () => ({
  getRoom: mocks.getRoom,
  getMessages: mocks.getMessages,
}));

vi.mock("../workItemService", () => ({
  listWorkItemsByRoom: mocks.listWorkItemsByRoom,
}));

vi.mock("../runEngine", () => ({
  getRun: mocks.getRun,
}));

vi.mock("../teamService", () => ({
  getTeam: mocks.getTeam,
}));

vi.mock("../workOsService", () => ({
  getWorkRequest: mocks.getWorkRequest,
  getWorkCaseProjection: mocks.getWorkCaseProjection,
}));

vi.mock("../monitoringService", () => ({
  getContextEngineHealth: mocks.getContextEngineHealth,
}));

vi.mock("../autoTeamRetentionService", () => ({
  getAutoTeamRetentionSummary: mocks.getAutoTeamRetentionSummary,
}));

vi.mock("../autoTeamMigrationVerificationService", () => ({
  verifyAutoTeamMigrationBaseline: mocks.verifyAutoTeamMigrationBaseline,
}));

vi.mock("../autoTeamCompletionEvidence", () => ({
  evaluateCompletionEvidence: mocks.evaluateCompletionEvidence,
  summarizeMissingEvidence: mocks.summarizeMissingEvidence,
}));

vi.mock("../autoTeamLoopGuard", () => ({
  evaluateAutoTeamLoopGuard: mocks.evaluateAutoTeamLoopGuard,
}));

import { getAutoTeamDebugSnapshot } from "../autoTeamDebugSnapshotService";

function makeSnapshot() {
  return {
    tenantId: "tenant-1",
    teamId: "team-1",
    roomId: "room-1",
    runId: "run-1",
    routeDecision: {
      id: "route-1",
      routeClass: "media.video",
      language: "th",
      selectedPolicyJson: {
        executionModeSnapshot: {
          executionMode: "enforced",
          frozenAt: "2026-04-17T12:00:00.000Z",
        },
      },
      createdAt: new Date("2026-04-17T12:00:00.000Z"),
    },
    currentStage: {
      id: "stage-1",
      stageType: "review",
      status: "in_progress",
    },
    stages: [
      {
        id: "stage-1",
        stageType: "review",
        status: "in_progress",
        expectedCapabilityFamily: "writing.review",
        blockedReason: null,
        startedAt: new Date("2026-04-17T12:05:00.000Z"),
        completedAt: null,
        deadlineAt: new Date("2026-04-17T12:10:00.000Z"),
        selectedSkillId: "reviewer-skill",
        selectedProvider: "openai",
        jobRefIdsJson: ["job-1"],
        outputArtifactRefsJson: ["artifact-1"],
        metadataJson: { step: "review" },
        workItemId: "work-1",
        attempt: 1,
      },
    ],
    mediaJobs: [
      {
        id: "job-1",
        tenantId: "tenant-1",
        teamId: "team-1",
        roomId: "room-1",
        runId: "run-1",
        stageId: "stage-1",
        workItemId: "work-1",
        mediaType: "video",
        provider: "google",
        model: "veo-3.1",
        providerTaskId: "task-1",
        providerStatus: "succeeded",
        submittedPromptArtifactRef: "prompt-1",
        resultArtifactRefsJson: ["video-1"],
        providerRequestHash: "hash-1",
        idempotencyKey: "idempotency-1",
        lastPolledAt: new Date("2026-04-17T12:07:00.000Z"),
        completedAt: new Date("2026-04-17T12:08:00.000Z"),
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        metadataJson: { durationSeconds: 28 },
        createdAt: new Date("2026-04-17T12:06:00.000Z"),
        updatedAt: new Date("2026-04-17T12:08:00.000Z"),
      },
    ],
    reviews: [
      {
        id: "review-1",
        passed: true,
        reviewType: "final",
      },
    ],
    finalResult: {
      id: "final-1",
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      runId: "run-1",
      routeDecisionId: "route-1",
      status: "completed",
      finalArtifactRefsJson: ["video-1"],
      mediaJobRefIdsJson: ["job-1"],
      reviewRecordRefIdsJson: ["review-1"],
      humanApprovalStatus: "approved",
      summary: "Songkran video completed",
      failureReason: null,
      blockedReason: null,
      idempotencyKey: "final-idempotency",
      createdAt: new Date("2026-04-17T12:08:30.000Z"),
      updatedAt: new Date("2026-04-17T12:08:30.000Z"),
    },
    traceEvents: [
      {
        sequence: 1,
        traceEventId: "trace-1",
        eventName: "route.decision.created",
        severity: "info",
        summary: "Route created",
        idempotencyKey: "trace-1",
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.getWorkRequest.mockResolvedValue({
    request: {
      id: "request-1",
      title: "Songkran video",
      summary: "Create a 24-30 second Songkran video using Veo 3.1",
      objective: "Create a 24-30 second Songkran video using Veo 3.1",
    },
    case: {
      id: "case-1",
      automationRunId: "run-1",
      title: "Songkran video",
      summary: "Create a 24-30 second Songkran video using Veo 3.1",
    },
    editable: false,
  });
  mocks.getWorkCaseProjection.mockResolvedValue({
    case: {
      id: "case-1",
      automationRunId: "run-1",
      title: "Songkran video",
      summary: "Create a 24-30 second Songkran video using Veo 3.1",
    },
  });
  mocks.getRun.mockResolvedValue({
    id: "run-1",
    tenantId: "tenant-1",
    roomId: "room-1",
    teamId: "team-1",
    initiatedByUserId: 42,
  });
  mocks.getRoom.mockResolvedValue({
    id: "room-1",
    tenantId: "tenant-1",
    teamId: "team-1",
    roomType: "auto_team",
    language: "th",
    goalPrompt: "Create a 24-30 second Songkran video using Veo 3.1",
    orchestratorUserId: 42,
    lastRunId: "run-1",
  });
  mocks.getMessages.mockResolvedValue([
    {
      id: "msg-1",
      senderType: "assistant",
      senderAssistantId: "asst-1",
      createdAt: new Date("2026-04-17T12:00:00.000Z"),
      content: "Songkran storyboard draft",
    },
  ]);
  mocks.listWorkItemsByRoom.mockResolvedValue([
    {
      id: "work-1",
      title: "Research Songkran video",
      status: "in_progress",
      revisionVersion: 2,
      assignedMemberId: "member-1",
      reviewerMemberId: "member-2",
      approverMemberId: "member-3",
      runId: "run-1",
      sourceType: "auto_team",
      sourceRef: "request-1",
      threadRootMessageId: "msg-1",
      activeDraftArtifactId: "draft-1",
      createdAt: new Date("2026-04-17T12:00:00.000Z"),
      updatedAt: new Date("2026-04-17T12:08:00.000Z"),
    },
  ]);
  mocks.getTeam.mockResolvedValue({
    id: "team-1",
    tenantId: "tenant-1",
    name: "Creative Content",
  });
  mocks.getRunSnapshot.mockResolvedValue(makeSnapshot());
  mocks.evaluateStageTimeout.mockReturnValue({
    stageType: "review",
    status: "in_progress",
    timedOut: false,
    graceExpired: false,
    deadlineAt: "2026-04-17T12:10:00.000Z",
    secondsRemaining: 120,
  } as any);
  mocks.getContextEngineHealth.mockResolvedValue({
    scope: { tenantId: "tenant-1", teamId: "team-1", roomId: "room-1", runId: "run-1", userId: 42, since: "2026-04-17T00:00:00.000Z", limit: 8 },
    window: { matchedChecks: 1, latestCreatedAt: "2026-04-17T12:08:00.000Z" },
    totals: { total: 1, ok: 1, warning: 0, critical: 0, error: 0 },
    latest: null,
    recentChecks: [],
    averages: {
      healthScore: 0.95,
      groundingScore: 0.82,
      retrievalCoverage: 0.75,
      freshnessScore: 0.88,
      staleContextRatio: 0.05,
      tokenPressureRatio: 0.22,
      latencyMs: 420,
    },
    sourceBreakdown: [{ source: "team_run", count: 1 }],
  });
  mocks.getAutoTeamRetentionSummary.mockResolvedValue({
    tenantId: "tenant-1",
    retentionDays: 30,
    cutoffAt: "2026-03-18T00:00:00.000Z",
    featureEnabled: true,
    eligibleRunIds: [],
    eligibleRunCount: 0,
    expiredCounts: {
      routeDecisions: 0,
      executionStages: 0,
      mediaJobs: 0,
      reviewRecords: 0,
      finalResults: 0,
      traceEvents: 0,
      artifactRefs: 0,
    },
    cleanupComplete: true,
  });
  mocks.verifyAutoTeamMigrationBaseline.mockResolvedValue({
    tenantId: "tenant-1",
    checkedAt: "2026-04-17T12:10:00.000Z",
    ok: true,
    tables: [
      { name: "auto_team_route_decisions", present: true },
      { name: "auto_team_execution_stages", present: true },
      { name: "auto_team_media_job_refs", present: true },
      { name: "auto_team_review_records", present: true },
      { name: "auto_team_final_results", present: true },
      { name: "auto_team_trace_events", present: true },
      { name: "auto_team_artifact_refs", present: true },
    ],
    workCaseAutomationColumns: [
      { table: "work_cases", name: "automationRunId", present: true },
      { table: "work_cases", name: "automationMode", present: true },
      { table: "work_cases", name: "automationTemplateKey", present: true },
      { table: "work_cases", name: "automationTemplateFamily", present: true },
      { table: "work_cases", name: "automationTemplateSource", present: true },
      { table: "work_cases", name: "automationPolicyJson", present: true },
      { table: "work_cases", name: "automationStepId", present: true },
      { table: "work_cases", name: "automationCheckpointId", present: true },
      { table: "work_cases", name: "automationDisposition", present: true },
      { table: "work_cases", name: "automationSummary", present: true },
      { table: "work_cases", name: "automationUpdatedAt", present: true },
    ],
    teamRoomsLanguageColumn: {
      table: "team_rooms",
      name: "language",
      present: true,
    },
    indexes: [],
    missingTables: [],
    missingColumns: [],
    missingIndexes: [],
  });
  mocks.evaluateCompletionEvidence.mockReturnValue({
    ok: true,
    routeClass: "media.video",
    missingEvidence: [],
    blockingStageIds: [],
    userMessage: "Completion evidence is sufficient.",
    diagnostics: { required: {} },
  });
  mocks.summarizeMissingEvidence.mockReturnValue("none");
  mocks.evaluateAutoTeamLoopGuard.mockReturnValue({
    blocked: false,
    reason: null,
    loopCount: 1,
    maxRounds: 12,
  });
});

describe("autoTeamDebugSnapshotService", () => {
  it("builds a rich snapshot for an authorized debug caller", async () => {
    const snapshot = await getAutoTeamDebugSnapshot({
      tenantId: "tenant-1",
      caller: {
        tenantId: "tenant-1",
        userId: 42,
        isTenantAdmin: true,
        isDebugUser: true,
      },
      workRequestId: "request-1",
    });

    expect(snapshot.room?.id).toBe("room-1");
    expect(snapshot.team?.id).toBe("team-1");
    expect(snapshot.run?.id).toBe("run-1");
    expect(snapshot.execution.executionMode).toBe("enforced");
    expect(snapshot.execution.frozenAt).toBe("2026-04-17T12:00:00.000Z");
    expect(snapshot.memoryContinuity.roomLanguage).toBe("th");
    expect(snapshot.memoryContinuity.initiatorUserId).toBe(42);
    expect(snapshot.finalResult?.status).toBe("completed");
    expect(snapshot.workItems).toHaveLength(1);
    expect(snapshot.observability.budgetDecision?.allowed).toBe(true);
    expect(snapshot.observability.providerDecision?.selectedModel).toBe("veo-3-1");
    expect(snapshot.observability.safetyStatus).toBe("safe");
    expect(snapshot.migrationVerification?.ok).toBe(true);
    expect(snapshot.missingEvidenceSummary).toBe("none");
    expect(snapshot.rawDiagnostics).not.toBeNull();
    expect(snapshot.contextEngineHealth?.averages.healthScore).toBe(0.95);
    expect(snapshot.retention.featureEnabled).toBe(true);
    expect(snapshot.traceSummary).toHaveLength(1);
  });

  it("keeps the debug snapshot readable when retention diagnostic tables are missing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.getAutoTeamRetentionSummary.mockRejectedValueOnce(
      new Error('relation "auto_team_route_decisions" does not exist'),
    );

    const snapshot = await getAutoTeamDebugSnapshot({
      tenantId: "tenant-1",
      caller: {
        tenantId: "tenant-1",
        userId: 42,
        isTenantAdmin: true,
        isDebugUser: true,
      },
      roomId: "room-1",
      runId: "run-1",
    });

    expect(snapshot.room?.id).toBe("room-1");
    expect(snapshot.retention.featureEnabled).toBe(false);
    expect(snapshot.retention.expiredCounts.routeDecisions).toBe(0);
    expect(snapshot.rawDiagnostics?.retentionUnavailableReason).toContain(
      "auto_team_route_decisions",
    );
    warnSpy.mockRestore();
  });

  it("redacts raw diagnostics for non-debug callers", async () => {
    const snapshot = await getAutoTeamDebugSnapshot({
      tenantId: "tenant-1",
      caller: {
        tenantId: "tenant-1",
        userId: 42,
        isTenantAdmin: false,
        isDebugUser: false,
      },
      roomId: "room-1",
      runId: "run-1",
    });

    expect(snapshot.rawDiagnostics).toBeNull();
    expect(snapshot.execution.executionMode).toBe("enforced");
    expect(snapshot.loopGuard?.blocked).toBe(false);
  });
});
