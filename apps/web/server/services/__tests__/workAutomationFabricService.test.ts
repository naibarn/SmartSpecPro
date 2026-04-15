import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  workAutomationRunCheckpoints,
  workAutomationRunEvents,
  workAutomationRunSteps,
  workAutomationRuns,
  workCases,
  workRequests,
} from "../../../drizzle/schema";

const { mockGetDb } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
}));
vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

import {
  buildAutomationTimelineEntries,
  createAutomationRun,
  getAutomationProjectionForCase,
  recordAutomationCheckpoint,
  recordAutomationModeChange,
  recordAutomationRunStepProgress,
  resumeAutomationRunFromCheckpoint,
} from "../workAutomationFabricService";

function returning<T>(value: T) {
  return {
    async returning() {
      return Array.isArray(value) ? value : [value];
    },
  };
}

function buildDbMock(config: {
  caseRows?: any[];
  requestRows?: any[];
  runRows?: any[];
  stepRows?: any[];
  checkpointRows?: any[];
  eventRows?: any[];
  inserted?: Array<{ table: string; values: unknown }>;
}) {
  const inserted = config.inserted ?? [];
  return {
    select() {
      return {
        from(table: any) {
          if (table === workCases) {
            return {
              where: () => ({
                limit: async () => config.caseRows ?? [],
              }),
            };
          }
          if (table === workRequests) {
            return {
              where: () => ({
                limit: async () => config.requestRows ?? [],
              }),
            };
          }
          if (table === workAutomationRuns) {
            return {
              where: () => ({
                limit: async () => config.runRows ?? [],
                orderBy: () => ({
                  limit: async () => config.runRows ?? [],
                }),
              }),
            };
          }
          if (table === workAutomationRunSteps) {
            return {
              where: () => ({
                orderBy: async () => config.stepRows ?? [],
              }),
            };
          }
          if (table === workAutomationRunCheckpoints) {
            return {
              where: () => ({
                orderBy: async () => config.checkpointRows ?? [],
                limit: async () => config.checkpointRows ?? [],
              }),
            };
          }
          if (table === workAutomationRunEvents) {
            return {
              where: () => ({
                orderBy: async () => config.eventRows ?? [],
              }),
            };
          }
          return {
            where: () => ({
              orderBy: async () => [],
              limit: async () => [],
            }),
          };
        },
      };
    },
    insert(table: any) {
      return {
        values(payload: unknown) {
          inserted.push({
            table:
              table === workAutomationRuns ? "workAutomationRuns"
                : table === workAutomationRunSteps ? "workAutomationRunSteps"
                  : table === workAutomationRunCheckpoints ? "workAutomationRunCheckpoints"
                    : table === workAutomationRunEvents ? "workAutomationRunEvents"
                      : "other",
            values: payload,
          });
          if (table === workAutomationRuns) {
            const record = payload as Record<string, unknown>;
            return returning({
              ...record,
              id: "run-1",
              tenantId: "tenant-1",
              caseId: "case-1",
              requestId: "req-1",
              templateKey: record.templateKey ?? "content-production",
              templateVersion: record.templateVersion ?? "v1",
              templateFamily: record.templateFamily ?? "content-production",
              templateSource: record.templateSource ?? "case_intake",
              title: "Generate launch assets",
              objective: "Create research, copy, storyboard, media, and video",
              currentMode: record.currentMode ?? "semi_auto",
              status: record.status ?? "pending",
              currentStepId: null,
              currentCheckpointId: null,
              finalDisposition: null,
              finalDispositionReason: null,
              resumeCursor: null,
              policyJson: record.policyJson ?? {},
              resolvedAt: record.resolvedAt ?? new Date("2026-04-10T00:00:00.000Z"),
              createdByUserId: 42,
              createdByAssistantId: null,
              startedAt: null,
              completedAt: null,
              createdAt: new Date("2026-04-10T00:00:00.000Z"),
              updatedAt: new Date("2026-04-10T00:00:00.000Z"),
            });
          }
          if (table === workAutomationRunSteps) {
            return returning({
              ...(payload as Record<string, unknown>),
              id: "step-1",
              tenantId: "tenant-1",
              requestId: "req-1",
              caseId: "case-1",
              runId: "run-1",
              stepKey: "research",
              stepIndex: 0,
              title: "Research",
              status: "running",
              riskTier: "medium",
              surface: "agency",
              inputRefsJson: [],
              outputRefsJson: [],
              retryCount: 0,
              idempotencyKey: "idem-1",
              summary: "Research started",
              detailJson: {},
              actorUserId: 42,
              actorAssistantId: null,
              startedAt: new Date("2026-04-10T00:00:00.000Z"),
              completedAt: null,
              createdAt: new Date("2026-04-10T00:00:00.000Z"),
              updatedAt: new Date("2026-04-10T00:00:00.000Z"),
            });
          }
          if (table === workAutomationRunCheckpoints) {
            const record = payload as Record<string, unknown>;
            return returning({
              ...record,
              id: "checkpoint-1",
              tenantId: "tenant-1",
              requestId: "req-1",
              caseId: "case-1",
              runId: "run-1",
              stepId: record.stepId ?? "step-1",
              stepKey: record.stepKey ?? "research",
              checkpointKey: record.checkpointKey ?? "research-approval",
              resumeCursor: record.resumeCursor ?? "resume:research",
              approvalState: record.approvalState ?? "approved",
              checkpointStatus: record.checkpointStatus ?? "approved",
              editSnapshotRefsJson: record.editSnapshotRefsJson ?? ["doc-1"],
              snapshotJson: record.snapshotJson ?? {},
              detailJson: record.detailJson ?? {},
              requestedByUserId: record.requestedByUserId ?? 42,
              approvedByUserId: record.approvedByUserId ?? 42,
              actorAssistantId: record.actorAssistantId ?? null,
              requestedAt: record.requestedAt ?? new Date("2026-04-10T00:05:00.000Z"),
              approvedAt: record.approvedAt ?? new Date("2026-04-10T00:06:00.000Z"),
              resumedAt: record.resumedAt ?? null,
              createdAt: new Date("2026-04-10T00:05:00.000Z"),
              updatedAt: new Date("2026-04-10T00:05:00.000Z"),
            });
          }
          if (table === workAutomationRunEvents) {
            return returning({
              ...(payload as Record<string, unknown>),
              id: "evt-1",
              tenantId: "tenant-1",
              requestId: "req-1",
              caseId: "case-1",
              runId: "run-1",
              stepId: null,
              checkpointId: null,
              eventType: "automation_run_created",
              fromMode: null,
              toMode: "semi_auto",
              status: "pending",
              detailJson: {},
              actorUserId: 42,
              actorAssistantId: null,
              createdAt: new Date("2026-04-10T00:00:00.000Z"),
            });
          }
          return returning(payload);
        },
      };
    },
    update() {
      return {
        set(payload: any) {
          return {
            where() {
              return returning({
                ...(payload as Record<string, unknown>),
                id: "case-1",
                currentMode: (payload as Record<string, unknown>)?.currentMode ?? "semi_auto",
                automationRunId: "run-1",
                automationMode: (payload as Record<string, unknown>)?.automationMode ?? "semi_auto",
                automationStepId: "step-1",
                automationCheckpointId: "checkpoint-1",
                automationDisposition: "approved",
                automationSummary: "Create research, copy, storyboard, media, and video",
                automationUpdatedAt: new Date("2026-04-10T00:00:00.000Z"),
                updatedAt: new Date("2026-04-10T00:00:00.000Z"),
              });
            },
          };
        },
      };
    },
    inserted,
  };
}

describe("workAutomationFabricService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a tenant-scoped automation run and writes a case snapshot", async () => {
    const inserted: Array<{ table: string; values: unknown }> = [];
    mockGetDb.mockResolvedValue(buildDbMock({
      caseRows: [{
        id: "case-1",
        tenantId: "tenant-1",
        requestId: "req-1",
        primaryTaskId: "task-1",
        title: "Generate launch assets",
        summary: "Create research, copy, storyboard, media, and video",
        ownerType: "queue",
        ownerId: "queue-1",
        priority: "normal",
        riskLevel: "medium",
        dataClassification: "internal",
        currentState: "planned",
        automationRunId: null,
        automationMode: "manual_assist",
        automationStepId: null,
        automationCheckpointId: null,
        automationDisposition: null,
        automationSummary: null,
        automationUpdatedAt: null,
        linkedConversationIdsJson: [],
        linkedWorkpackRunIdsJson: [],
        linkedRoleRoutineRunIdsJson: [],
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      }],
      requestRows: [{
        id: "req-1",
        tenantId: "tenant-1",
        projectId: null,
        sourceType: "chat",
        sourceRef: null,
        requesterType: "human",
        requesterId: "42",
        workType: "content",
        businessDomain: "marketing",
        urgency: "normal",
        riskLevel: "medium",
        classificationConfidence: 0.93,
        defaultOwnerType: "queue",
        defaultOwnerId: "queue-1",
        defaultQueueId: "queue-1",
        title: "Generate launch assets",
        objective: "Create research, copy, storyboard, media, and video",
        currentState: "new",
        linkedConversationIdsJson: [],
        linkedWorkpackRunIdsJson: [],
        linkedRoleRoutineRunIdsJson: [],
        linkedCaseId: "case-1",
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      }],
      inserted,
    }) as any);

    const run = await createAutomationRun({
      tenantId: "tenant-1",
      caseId: "case-1",
      requestId: "req-1",
      taskId: "task-1",
      templateKey: "content-production",
      templateVersion: "v1",
      title: "Generate launch assets",
      objective: "Create research, copy, storyboard, media, and video",
      mode: "semi_auto",
      createdByUserId: 42,
    });

    expect(run.id).toBe("run-1");
    expect(run.currentMode).toBe("semi_auto");
    expect(inserted.map((item) => item.table)).toEqual(["workAutomationRuns", "workAutomationRunEvents"]);
    expect((inserted[0]?.values as Record<string, unknown>)?.templateFamily).toBe("content-production");
    expect((inserted[0]?.values as Record<string, unknown>)?.policyJson).toMatchObject({
      templateKey: "content-production",
    });
  });

  it("records step, checkpoint, and mode changes with immutable history", async () => {
    const inserted: Array<{ table: string; values: unknown }> = [];
    mockGetDb.mockResolvedValue(buildDbMock({
      caseRows: [{
        id: "case-1",
        tenantId: "tenant-1",
        requestId: "req-1",
        primaryTaskId: "task-1",
        title: "Generate launch assets",
        summary: "Create research, copy, storyboard, media, and video",
        ownerType: "queue",
        ownerId: "queue-1",
        priority: "normal",
        riskLevel: "medium",
        dataClassification: "internal",
        currentState: "planned",
        automationRunId: "run-1",
        automationMode: "semi_auto",
        automationStepId: "step-1",
        automationCheckpointId: null,
        automationDisposition: null,
        automationSummary: null,
        automationUpdatedAt: null,
        linkedConversationIdsJson: [],
        linkedWorkpackRunIdsJson: [],
        linkedRoleRoutineRunIdsJson: [],
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      }],
      requestRows: [{
        id: "req-1",
        tenantId: "tenant-1",
        projectId: null,
        sourceType: "chat",
        sourceRef: null,
        requesterType: "human",
        requesterId: "42",
        workType: "content",
        businessDomain: "marketing",
        urgency: "normal",
        riskLevel: "medium",
        classificationConfidence: 0.92,
        defaultOwnerType: "queue",
        defaultOwnerId: "queue-1",
        defaultQueueId: "queue-1",
        title: "Generate launch assets",
        objective: "Create research, copy, storyboard, media, and video",
        currentState: "new",
        linkedConversationIdsJson: [],
        linkedWorkpackRunIdsJson: [],
        linkedRoleRoutineRunIdsJson: [],
        linkedCaseId: "case-1",
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      }],
      runRows: [{
        id: "run-1",
        tenantId: "tenant-1",
        requestId: "req-1",
        caseId: "case-1",
        taskId: "task-1",
        templateKey: "content-production",
        templateVersion: "v1",
        templateFamily: "content-production",
        templateSource: "case_intake",
        title: "Generate launch assets",
        objective: "Create research, copy, storyboard, media, and video",
        currentMode: "semi_auto",
        status: "pending",
        currentStepId: null,
        currentCheckpointId: null,
        finalDisposition: null,
        finalDispositionReason: null,
        resumeCursor: null,
        policyJson: {},
        resolvedAt: new Date("2026-04-10T00:00:00.000Z"),
        createdByUserId: 42,
        createdByAssistantId: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      }],
      inserted,
    }) as any);

    const stepResult = await recordAutomationRunStepProgress({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      stepKey: "research",
      stepIndex: 0,
      title: "Research",
      status: "running",
      surface: "agency",
      summary: "Research started",
      createdByUserId: 42,
    });

    const checkpointResult = await recordAutomationCheckpoint({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      stepId: stepResult.step.id,
      stepKey: "research",
      checkpointKey: "research-approval",
      resumeCursor: "resume:research",
      approvalState: "approved",
      checkpointStatus: "approved",
      requestedByUserId: 42,
      approvedByUserId: 42,
    });

    const modeChangeResult = await recordAutomationModeChange({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      fromMode: "semi_auto",
      toMode: "fully_auto",
      reason: "confidence threshold reached",
      actorUserId: 42,
    });

    expect(stepResult.step.stepKey).toBe("research");
    expect(checkpointResult.checkpoint.checkpointKey).toBe("research-approval");
    expect(modeChangeResult.run.currentMode).toBe("fully_auto");
    expect(inserted.map((item) => item.table)).toEqual([
      "workAutomationRunSteps",
      "workAutomationRunEvents",
      "workAutomationRunCheckpoints",
      "workAutomationRunEvents",
      "workAutomationRunEvents",
    ]);
  });

  it("keeps automation case access tenant-scoped", async () => {
    mockGetDb.mockResolvedValue(buildDbMock({
      caseRows: [],
      requestRows: [],
    }) as any);

    await expect(createAutomationRun({
      tenantId: "tenant-1",
      caseId: "missing-case",
      templateKey: "content-production",
      title: "Missing case",
    })).rejects.toThrow("Work case missing-case not found");
  });

  it("projects automation evidence for a case timeline", async () => {
    mockGetDb.mockResolvedValue(buildDbMock({
      runRows: [{
        id: "run-1",
        tenantId: "tenant-1",
        requestId: "req-1",
        caseId: "case-1",
        taskId: null,
        templateKey: "content-production",
        templateVersion: "v1",
        templateFamily: "content-production",
        templateSource: "case_intake",
        title: "Generate launch assets",
        objective: "Create research, copy, storyboard, media, and video",
        currentMode: "semi_auto",
        status: "running",
        currentStepId: "step-1",
        currentCheckpointId: "checkpoint-1",
        finalDisposition: null,
        finalDispositionReason: null,
        resumeCursor: "cursor-1",
        policyJson: {},
        resolvedAt: new Date("2026-04-10T00:00:00.000Z"),
        createdByUserId: 42,
        createdByAssistantId: null,
        startedAt: new Date("2026-04-10T00:00:00.000Z"),
        completedAt: null,
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      }],
      requestRows: [{
        id: "req-1",
        tenantId: "tenant-1",
        projectId: null,
        sourceType: "chat",
        sourceRef: null,
        requesterType: "human",
        requesterId: "42",
        workType: "content",
        businessDomain: "marketing",
        urgency: "normal",
        riskLevel: "medium",
        classificationConfidence: 0.92,
        defaultOwnerType: "queue",
        defaultOwnerId: "queue-1",
        defaultQueueId: "queue-1",
        title: "Generate launch assets",
        objective: "Create research, copy, storyboard, media, and video",
        currentState: "new",
        linkedConversationIdsJson: [],
        linkedWorkpackRunIdsJson: [],
        linkedRoleRoutineRunIdsJson: [],
        linkedCaseId: "case-1",
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      }],
      stepRows: [{
        id: "step-1",
        tenantId: "tenant-1",
        requestId: "req-1",
        caseId: "case-1",
        runId: "run-1",
        stepKey: "research",
        stepIndex: 0,
        title: "Research",
        status: "running",
        riskTier: "medium",
        surface: "agency",
        inputRefsJson: ["doc-1"],
        outputRefsJson: [],
        retryCount: 0,
        idempotencyKey: "idem-1",
        summary: "Research started",
        detailJson: { scope: "launch" },
        actorUserId: 42,
        actorAssistantId: null,
        startedAt: new Date("2026-04-10T00:01:00.000Z"),
        completedAt: null,
        createdAt: new Date("2026-04-10T00:01:00.000Z"),
        updatedAt: new Date("2026-04-10T00:01:00.000Z"),
      }],
      checkpointRows: [{
        id: "checkpoint-1",
        tenantId: "tenant-1",
        requestId: "req-1",
        caseId: "case-1",
        runId: "run-1",
        stepId: "step-1",
        stepKey: "research",
        checkpointKey: "research-approval",
        resumeCursor: "resume:research",
        approvalState: "approved",
        checkpointStatus: "approved",
        editSnapshotRefsJson: ["doc-2"],
        snapshotJson: { revision: 2 },
        detailJson: { note: "human review" },
        requestedByUserId: 42,
        approvedByUserId: 42,
        actorAssistantId: null,
        requestedAt: new Date("2026-04-10T00:05:00.000Z"),
        approvedAt: new Date("2026-04-10T00:06:00.000Z"),
        resumedAt: new Date("2026-04-10T00:07:00.000Z"),
        createdAt: new Date("2026-04-10T00:05:00.000Z"),
        updatedAt: new Date("2026-04-10T00:05:00.000Z"),
      }],
      eventRows: [{
        id: "evt-1",
        tenantId: "tenant-1",
        requestId: "req-1",
        caseId: "case-1",
        runId: "run-1",
        stepId: null,
        checkpointId: null,
        eventType: "automation_run_created",
        fromMode: null,
        toMode: "semi_auto",
        status: "running",
        detailJson: { templateKey: "content-production" },
        actorUserId: 42,
        actorAssistantId: null,
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
      }],
    }) as any);

    const projection = await getAutomationProjectionForCase("case-1", "tenant-1");
    const entries = await buildAutomationTimelineEntries("case-1", "tenant-1");

    expect(projection.run?.id).toBe("run-1");
    expect(projection.steps[0]?.id).toBe("step-1");
    expect(projection.checkpoints[0]?.id).toBe("checkpoint-1");
    expect(entries.some((entry) => entry.eventType === "automation_step_running")).toBe(true);
    expect(entries.some((entry) => entry.eventType === "automation_checkpoint_approved")).toBe(true);
  });

  it("resumes an automation checkpoint without mutating the prior snapshot", async () => {
    const inserted: Array<{ table: string; values: unknown }> = [];
    mockGetDb.mockResolvedValue(buildDbMock({
      caseRows: [{
        id: "case-1",
        tenantId: "tenant-1",
        requestId: "req-1",
        primaryTaskId: "task-1",
        title: "Generate launch assets",
        summary: "Create research, copy, storyboard, media, and video",
        ownerType: "queue",
        ownerId: "queue-1",
        priority: "normal",
        riskLevel: "medium",
        dataClassification: "internal",
        currentState: "planned",
        automationRunId: "run-1",
        automationMode: "semi_auto",
        automationTemplateKey: "content-production",
        automationTemplateFamily: "content-production",
        automationTemplateSource: "case_intake",
        automationPolicyJson: {},
        automationStepId: "step-1",
        automationCheckpointId: "checkpoint-1",
        automationDisposition: null,
        automationSummary: null,
        automationUpdatedAt: null,
        linkedConversationIdsJson: [],
        linkedWorkpackRunIdsJson: [],
        linkedRoleRoutineRunIdsJson: [],
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      }],
      requestRows: [{
        id: "req-1",
        tenantId: "tenant-1",
        projectId: null,
        sourceType: "chat",
        sourceRef: null,
        requesterType: "human",
        requesterId: "42",
        workType: "content",
        businessDomain: "marketing",
        urgency: "normal",
        riskLevel: "medium",
        classificationConfidence: 0.92,
        defaultOwnerType: "queue",
        defaultOwnerId: "queue-1",
        defaultQueueId: "queue-1",
        title: "Generate launch assets",
        objective: "Create research, copy, storyboard, media, and video",
        currentState: "new",
        linkedConversationIdsJson: [],
        linkedWorkpackRunIdsJson: [],
        linkedRoleRoutineRunIdsJson: [],
        linkedCaseId: "case-1",
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      }],
      runRows: [{
        id: "run-1",
        tenantId: "tenant-1",
        requestId: "req-1",
        caseId: "case-1",
        taskId: "task-1",
        templateKey: "content-production",
        templateVersion: "v1",
        templateFamily: "content-production",
        templateSource: "case_intake",
        title: "Generate launch assets",
        objective: "Create research, copy, storyboard, media, and video",
        currentMode: "semi_auto",
        status: "waiting_for_approval",
        currentStepId: "step-1",
        currentCheckpointId: "checkpoint-1",
        finalDisposition: null,
        finalDispositionReason: null,
        resumeCursor: null,
        policyJson: {},
        resolvedAt: new Date("2026-04-10T00:00:00.000Z"),
        createdByUserId: 42,
        createdByAssistantId: null,
        startedAt: new Date("2026-04-10T00:00:00.000Z"),
        completedAt: null,
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      }],
      checkpointRows: [{
        id: "checkpoint-1",
        tenantId: "tenant-1",
        requestId: "req-1",
        caseId: "case-1",
        runId: "run-1",
        stepId: "step-1",
        stepKey: "research",
        checkpointKey: "research-approval",
        resumeCursor: "resume:research",
        approvalState: "pending",
        checkpointStatus: "open",
        editSnapshotRefsJson: ["doc-1"],
        snapshotJson: { revision: 1 },
        detailJson: { note: "original checkpoint" },
        requestedByUserId: 42,
        approvedByUserId: null,
        actorAssistantId: null,
        requestedAt: new Date("2026-04-10T00:05:00.000Z"),
        approvedAt: null,
        resumedAt: null,
        createdAt: new Date("2026-04-10T00:05:00.000Z"),
        updatedAt: new Date("2026-04-10T00:05:00.000Z"),
      }],
      inserted,
    }) as any);

    const result = await resumeAutomationRunFromCheckpoint({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      checkpointId: "checkpoint-1",
      requestedByUserId: 42,
    });

    expect(result.checkpoint.checkpointStatus).toBe("resumed");
    expect(result.checkpoint.approvalState).toBe("approved");
    expect(result.checkpoint.detailJson).toMatchObject({
      resumedFromCheckpointId: "checkpoint-1",
      resumedFromCheckpointKey: "research-approval",
    });
    expect(inserted.map((item) => item.table)).toContain("workAutomationRunCheckpoints");
  });
});
