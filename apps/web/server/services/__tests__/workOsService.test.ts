import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  teamWorkItems,
  workAssignments,
  workCases,
  workOsEvents,
  workRequests,
  workItemEvents,
  workpackRecords,
  teamRuns,
  workAutomationRuns,
  workAutomationRunEvents,
} from "../../../drizzle/schema";

const { mockGetDb } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
}));
vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

const { mockCreateWorkItem } = vi.hoisted(() => ({
  mockCreateWorkItem: vi.fn(),
}));
const { mockGetWorkItem } = vi.hoisted(() => ({
  mockGetWorkItem: vi.fn(),
}));
vi.mock("../workItemService", () => ({
  createWorkItem: mockCreateWorkItem,
  getWorkItem: mockGetWorkItem,
}));

const { mockGetRoleRoutineRun, mockListRoleRoutineRunsForRoutine } = vi.hoisted(
  () => ({
    mockGetRoleRoutineRun: vi.fn(),
    mockListRoleRoutineRunsForRoutine: vi.fn(),
  })
);
vi.mock("../rolePersistence", () => ({
  getRoleRoutineRun: mockGetRoleRoutineRun,
  listRoleRoutineRunsForRoutine: mockListRoleRoutineRunsForRoutine,
}));

const { mockBuildBrowserAutomationTimelineEntries } = vi.hoisted(() => ({
  mockBuildBrowserAutomationTimelineEntries: vi.fn().mockResolvedValue([]),
}));
vi.mock("../workAutomationBrowserTaskService", () => ({
  buildBrowserAutomationTimelineEntries:
    mockBuildBrowserAutomationTimelineEntries,
}));

const { mockGetLatestRunSnapshot, mockExtractRunPlanArtifact } = vi.hoisted(
  () => ({
    mockGetLatestRunSnapshot: vi.fn(),
    mockExtractRunPlanArtifact: vi.fn(),
  })
);
vi.mock("../monitoringService", () => ({
  getLatestRunSnapshot: mockGetLatestRunSnapshot,
  extractRunPlanArtifact: mockExtractRunPlanArtifact,
}));

import {
  createWorkRequest,
  createWorkTask,
  getWorkCaseProjection,
  listMyWorkRequests,
  projectTaskAsCase,
} from "../workOsService";
import { getInbox } from "../workOsService";

function buildReturning<T>(value: T) {
  return {
    async returning() {
      return Array.isArray(value) ? value : [value];
    },
  };
}

describe("workOsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLatestRunSnapshot.mockResolvedValue(null);
    mockExtractRunPlanArtifact.mockReturnValue(null);
    mockGetWorkItem.mockReset();
  });

  it("creates linked request and case records", async () => {
    const inserted: Array<{ table: string; values: unknown }> = [];

    const tx = {
      insert(table: any) {
        return {
          values(payload: unknown) {
            inserted.push({
              table:
                table === workRequests
                  ? "workRequests"
                  : table === workCases
                    ? "workCases"
                    : table === workAssignments
                      ? "workAssignments"
                      : "other",
              values: payload,
            });
            if (table === workRequests)
              return buildReturning({
                id: "req-1",
                tenantId: "tenant-1",
                currentState: "new",
              });
            if (table === workCases)
              return buildReturning({
                id: "case-1",
                tenantId: "tenant-1",
                requestId: "req-1",
                currentState: "new",
                title: "Process invoice",
              });
            if (table === workAssignments)
              return buildReturning({
                id: "assignment-1",
                tenantId: "tenant-1",
              });
            if (table === workOsEvents) return buildReturning({ id: "evt-1" });
            return buildReturning({ id: "unknown" });
          },
        };
      },
      update() {
        return {
          set() {
            return {
              where() {
                return buildReturning({ id: "req-1", linkedCaseId: "case-1" });
              },
            };
          },
        };
      },
    };

    mockGetDb.mockResolvedValue({
      transaction: async (fn: any) => fn(tx),
    });

    const result = await createWorkRequest({
      tenantId: "tenant-1",
      sourceType: "chat",
      title: "Process invoice",
      objective: "Collect invoice data",
      requesterType: "human",
      defaultQueueId: "queue-1",
      linkedConversationIds: ["conv-1"],
    });

    expect(result.request.id).toBe("req-1");
    expect(result.case.id).toBe("case-1");
    expect(inserted.map(item => item.table)).toEqual([
      "workRequests",
      "workCases",
      "workAssignments",
      "other",
    ]);
  });

  it("replays an existing request when an idempotency key was already used", async () => {
    const transaction = vi.fn();
    mockGetDb.mockResolvedValue({
      select() {
        return {
          from() {
            return {
              innerJoin() {
                return {
                  where() {
                    return {
                      async limit() {
                        return [
                          {
                            request: {
                              id: "req-existing",
                              tenantId: "tenant-1",
                              idempotencyKey: "idem-1",
                              idempotencyFingerprint: null,
                            },
                            workCase: {
                              id: "case-existing",
                              tenantId: "tenant-1",
                              requestId: "req-existing",
                            },
                          },
                        ];
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
      transaction,
    });

    const result = await createWorkRequest({
      tenantId: "tenant-1",
      sourceType: "chat",
      title: "Process invoice",
      requesterType: "human",
      idempotencyKey: "idem-1",
    });

    expect(result.request.id).toBe("req-existing");
    expect(result.case.id).toBe("case-existing");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects an idempotency key reused for a different work request", async () => {
    mockGetDb.mockResolvedValue({
      select() {
        return {
          from() {
            return {
              innerJoin() {
                return {
                  where() {
                    return {
                      async limit() {
                        return [
                          {
                            request: {
                              id: "req-existing",
                              tenantId: "tenant-1",
                              idempotencyKey: "idem-1",
                              idempotencyFingerprint: "different-payload",
                            },
                            workCase: {
                              id: "case-existing",
                              tenantId: "tenant-1",
                              requestId: "req-existing",
                            },
                          },
                        ];
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
      transaction: vi.fn(),
    });

    await expect(
      createWorkRequest({
        tenantId: "tenant-1",
        sourceType: "chat",
        title: "Process invoice",
        requesterType: "human",
        idempotencyKey: "idem-1",
      }),
    ).rejects.toThrow("WORK_REQUEST_IDEMPOTENCY_CONFLICT");
  });

  it("lists my requests with the latest execution trail for handed off work", async () => {
    mockGetWorkItem.mockResolvedValue({
      id: "task-1",
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      runId: "team-run-1",
      routineId: null,
      sourceType: "work_os",
      sourceRef: "case-1",
      title: "Kickoff: Generate launch assets",
      objective: "Create a concise launch plan",
      status: "in_progress",
      revisionVersion: 1,
      threadRootMessageId: null,
      activeDraftArtifactId: null,
      priority: "high",
      riskClass: "medium",
      assignedMemberId: null,
      reviewerMemberId: null,
      approverMemberId: null,
      artifactRefsJson: null,
      approvalState: "not_required",
      dueAt: null,
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      supersededByWorkItemId: null,
      completedAt: null,
    } as any);

    const db = {
      select() {
        return {
          from(table: any) {
            if (table === workRequests) {
              return {
                where: () => ({
                  orderBy: () => ({
                    limit: async () => [
                      {
                        id: "req-1",
                        tenantId: "tenant-1",
                        currentState: "new",
                        title: "Review refund request",
                        objective: "Check refund eligibility",
                        sourceType: "chat",
                        requesterId: "42",
                        requesterType: "human",
                        businessDomain: "finance",
                        urgency: "high",
                        riskLevel: "medium",
                        defaultOwnerType: "queue",
                        defaultOwnerId: "queue-1",
                        defaultQueueId: "team-1",
                        linkedCaseId: "case-1",
                        createdAt: new Date("2026-04-11T10:00:00.000Z"),
                        updatedAt: new Date("2026-04-11T10:00:00.000Z"),
                      },
                    ],
                  }),
                }),
              };
            }
            if (table === workCases) {
              return {
                where: () => ({
                  limit: async () => [
                    {
                      id: "case-1",
                      tenantId: "tenant-1",
                      requestId: "req-1",
                      primaryTaskId: "task-1",
                      title: "Review refund request",
                      summary: "Check refund eligibility",
                      ownerType: "queue",
                      ownerId: "team-1",
                      currentState: "in_progress",
                    },
                  ],
                }),
              };
            }
            if (table === teamRuns) {
              return {
                innerJoin: () => ({
                  where: () => ({
                    limit: async () => [
                      {
                        run: {
                          id: "team-run-1",
                          tenantId: "tenant-1",
                          roomId: "room-1",
                          teamId: "team-1",
                          status: "running",
                          executionMode: "auto_team",
                        },
                      },
                    ],
                  }),
                }),
              };
            }
            return { where: () => ({ limit: async () => [] }) };
          },
        };
      },
    };

    mockGetDb.mockResolvedValue(db as any);

    const requests = await listMyWorkRequests({
      tenantId: "tenant-1",
      requesterId: "42",
      limit: 10,
    });

    expect(requests).toEqual([
      expect.objectContaining({
        id: "req-1",
        executionTrail: expect.objectContaining({
          teamId: "team-1",
          roomId: "room-1",
          teamRunId: "team-run-1",
          teamRunStatus: "running",
          teamRunMode: "auto_team",
          workItemId: "task-1",
          workItemStatus: "in_progress",
        }),
      }),
    ]);
  });

  it("creates a task through the legacy work-item service and links the case", async () => {
    mockCreateWorkItem.mockResolvedValue({
      id: "task-1",
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      title: "Follow up",
      status: "in_progress",
      priority: "normal",
      riskClass: "medium",
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    });

    const taskSelect = {
      limit: async () => [
        {
          id: "task-1",
          tenantId: "tenant-1",
          status: "planned",
          title: "Follow up",
          objective: "Collect invoice data",
          priority: "normal",
          riskClass: "medium",
          createdAt: new Date("2026-04-10T00:00:00.000Z"),
          updatedAt: new Date("2026-04-10T00:00:00.000Z"),
        },
      ],
    };

    const caseSelect = {
      limit: async () => [
        {
          id: "case-1",
          tenantId: "tenant-1",
          requestId: "req-1",
          currentState: "new",
          title: "Process invoice",
          summary: "Collect invoice data",
          priority: "normal",
          riskLevel: "medium",
          dataClassification: "internal",
          linkedConversationIdsJson: [],
          linkedWorkpackRunIdsJson: [],
          linkedRoleRoutineRunIdsJson: [],
          createdAt: new Date("2026-04-10T00:00:00.000Z"),
          updatedAt: new Date("2026-04-10T00:00:00.000Z"),
        },
      ],
    };

    const db = {
      select() {
        return {
          from(table: any) {
            if (table === workCases) {
              return { where: () => caseSelect };
            }
            if (table === workRequests) {
              return {
                where: () => ({
                  limit: async () => [
                    { id: "req-1", tenantId: "tenant-1", currentState: "new" },
                  ],
                }),
              };
            }
            if (table === teamWorkItems) {
              return { where: () => taskSelect, orderBy: () => taskSelect };
            }
            if (table === workItemEvents) {
              return { where: () => ({ orderBy: async () => [] }) };
            }
            if (table === workAutomationRuns) {
              return {
                where: () => ({ orderBy: () => ({ limit: async () => [] }) }),
              };
            }
            return { where: () => ({ limit: async () => [] }) };
          },
        };
      },
      insert(table: any) {
        return {
          values(payload: any) {
            if (table === workOsEvents) {
              return buildReturning({ id: "evt-1", ...payload });
            }
            return buildReturning({ id: "unknown", ...payload });
          },
        };
      },
      update() {
        return {
          set() {
            return {
              where() {
                return buildReturning({ id: "case-1" });
              },
            };
          },
        };
      },
    };

    mockGetDb.mockResolvedValue(db as any);

    const result = await createWorkTask({
      tenantId: "tenant-1",
      caseId: "case-1",
      teamId: "team-1",
      roomId: "room-1",
      title: "Follow up",
      objective: "Collect invoice data",
      actorUserId: 42,
    });

    expect(mockCreateWorkItem).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        teamId: "team-1",
        roomId: "room-1",
        sourceType: "work_os",
        title: "Follow up",
      }),
      expect.any(Object)
    );
    expect(result.case.id).toBe("case-1");
    expect(result.task.id).toBe("task-1");
  });

  it("projects legacy work-item events into a deterministic case timeline when no canonical case exists", async () => {
    const legacyTask = {
      id: "task-legacy-1",
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      status: "in_progress",
      title: "Legacy task",
      objective: "Do the thing",
      priority: "normal",
      riskClass: "medium",
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    };

    const db = {
      select() {
        return {
          from(table: any) {
            if (table === teamWorkItems) {
              return { where: () => ({ limit: async () => [legacyTask] }) };
            }
            if (table === workCases) {
              return { where: () => ({ limit: async () => [] }) };
            }
            if (table === workItemEvents) {
              return {
                where: () => ({
                  orderBy: async () => [
                    {
                      id: "evt-legacy-1",
                      eventType: "created",
                      createdAt: new Date("2026-04-10T00:00:00.000Z"),
                      detailJson: { ok: true },
                    },
                  ],
                }),
              };
            }
            if (table === workAutomationRuns) {
              return {
                where: () => ({ orderBy: () => ({ limit: async () => [] }) }),
              };
            }
            return { where: () => ({ limit: async () => [] }) };
          },
        };
      },
    };

    mockGetDb.mockResolvedValue(db as any);

    const projection = await projectTaskAsCase("task-legacy-1", "tenant-1");
    expect(projection.case.id).toBe("legacy-task-legacy-1");
    expect(projection.timeline[0]?.eventType).toBe("created");
    expect(projection.timeline[0]?.source).toBe("legacy_work_item");
  });

  it("includes workpack and team-run evidence in the case timeline", async () => {
    const workPackRecord = {
      id: 1,
      tenantId: "tenant-1",
      recordType: "workpack_run",
      recordId: "wpr-1",
      workpackId: "workpack-1",
      sortTimestamp: new Date("2026-04-10T02:00:00.000Z"),
      payloadJson: { status: "succeeded" },
      createdAt: new Date("2026-04-10T02:00:00.000Z"),
      updatedAt: new Date("2026-04-10T02:00:00.000Z"),
    };
    const teamRun = {
      id: "run-1",
      roomId: "room-1",
      teamId: "team-1",
      backingAgencyRunId: null,
      initiatedByUserId: 42,
      executionMode: "supervised",
      objective: "Do the thing",
      constraintsJson: null,
      status: "running",
      activeAssistantId: null,
      stopPolicyJson: null,
      approvalPolicyJson: null,
      budgetSnapshotJson: null,
      summaryArtifactId: null,
      stopReason: null,
      startedAt: new Date("2026-04-10T03:00:00.000Z"),
      endedAt: null,
    };
    const caseRecord = {
      id: "case-1",
      tenantId: "tenant-1",
      requestId: "req-1",
      primaryTaskId: "task-1",
      currentState: "in_progress",
      title: "Process invoice",
      summary: "Collect invoice data",
      priority: "normal",
      riskLevel: "medium",
      dataClassification: "internal",
      ownerType: "queue",
      ownerId: "queue-1",
      linkedConversationIdsJson: [],
      linkedWorkpackRunIdsJson: ["wpr-1"],
      linkedRoleRoutineRunIdsJson: ["run-1"],
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    };

    const db = {
      select(fields?: any) {
        if (fields?.run === teamRuns) {
          return {
            from() {
              return {
                innerJoin() {
                  return {
                    where() {
                      return {
                        orderBy: async () => [{ run: teamRun }],
                      };
                    },
                  };
                },
              };
            },
          };
        }

        return {
          from(table: any) {
            if (table === teamWorkItems) {
              return {
                where: () => ({
                  limit: async () => [
                    {
                      id: "task-1",
                      tenantId: "tenant-1",
                      runId: "run-1",
                      status: "planned",
                      title: "Follow up",
                      objective: "Collect invoice data",
                      priority: "normal",
                      riskClass: "medium",
                      createdAt: new Date("2026-04-10T00:00:00.000Z"),
                      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
                    },
                  ],
                }),
              };
            }
            if (table === workCases) {
              return { where: () => ({ limit: async () => [caseRecord] }) };
            }
            if (table === workRequests) {
              return {
                where: () => ({
                  limit: async () => [
                    { id: "req-1", tenantId: "tenant-1", currentState: "new" },
                  ],
                }),
              };
            }
            if (
              table === workAssignments ||
              table === workOsEvents ||
              table === workItemEvents
            ) {
              return { where: () => ({ orderBy: async () => [] }) };
            }
            if (table === workpackRecords) {
              return {
                where: () => ({ orderBy: async () => [workPackRecord] }),
              };
            }
            if (table === workAutomationRuns) {
              return {
                where: () => ({ orderBy: () => ({ limit: async () => [] }) }),
              };
            }
            return {
              where: () => ({ orderBy: async () => [], limit: async () => [] }),
            };
          },
        };
      },
    };

    mockGetDb.mockResolvedValue(db as any);
    mockGetLatestRunSnapshot.mockResolvedValue({
      artifactCountJson: {
        traceEnvelope: {
          version: 1,
          traceId: "trace-123",
          tenantId: "tenant-1",
          source: "team_run_snapshot",
          entityId: "run-1",
          eventType: "run_snapshot",
          generatedAt: "2026-04-10T03:10:00.000Z",
          summary: "Do the thing · running",
          evidenceRefs: [],
        },
        governedContext: {
          version: 1,
          tenantId: "tenant-1",
          principalScope: "team-1",
          objective: "Do the thing",
          generatedAt: "2026-04-10T03:10:00.000Z",
          selectedCount: 1,
          excludedCount: 0,
          summary: "1 context item(s) selected, 0 excluded for Do the thing",
          items: [],
        },
        readinessRecord: {
          version: 1,
          kind: "team_run",
          entityId: "run-1",
          generatedAt: "2026-04-10T03:10:00.000Z",
          score: 0.82,
          status: "ready",
          reason: "Ready to continue",
          evidenceRefs: [],
        },
        planArtifact: {
          exploration: {
            selectedCandidateId: "balanced-hybrid",
            selectionReason: "Choose the balanced path for best coverage.",
            criteria: ["safety", "speed"],
            candidates: [
              {
                candidateId: "workflow-first",
                title: "Workflow first",
                strategy: "deterministic",
                summary: "Keep the path narrow.",
                strengths: ["tight control"],
                tradeoffs: ["less breadth"],
                riskClass: "medium",
              },
            ],
          },
        },
        runtimeState: {
          finalReview: {
            reviewerPersona: "qa_validator",
            score: 0.88,
            recommendation: "Proceed",
            comment: "Strong final result.",
          },
        },
      },
    } as any);
    mockExtractRunPlanArtifact.mockImplementation(
      (snapshot: any) => snapshot?.artifactCountJson?.planArtifact ?? null
    );

    const projection = await projectTaskAsCase("task-1", "tenant-1");
    const workpackEntry = projection.timeline.find(
      entry => entry.source === "workpack_record"
    );
    const teamRunEntry = projection.timeline.find(
      entry => entry.source === "team_run"
    );

    expect(workpackEntry?.eventType).toBe("workpack_run");
    expect(teamRunEntry?.eventType).toBe("team_run_snapshot");
    expect(workpackEntry?.detailJson).toEqual(
      expect.objectContaining({ recordId: "wpr-1" })
    );
    expect(teamRunEntry?.detailJson).toEqual(
      expect.objectContaining({
        runId: "run-1",
        status: "running",
        workOsState: "in_progress",
        statusBridge: expect.objectContaining({
          teamRunStatus: "running",
          workOsState: "in_progress",
        }),
        exploration: expect.objectContaining({
          selectedCandidateId: "balanced-hybrid",
          candidateCount: 1,
          selectionReason: "Choose the balanced path for best coverage.",
        }),
        finalReview: expect.objectContaining({
          reviewerPersona: "qa_validator",
          score: 0.88,
          recommendation: "Proceed",
          comment: "Strong final result.",
        }),
      })
    );
  });

  it("includes final review evidence in the inbox even when the run has no exploration payload", async () => {
    const teamRun = {
      id: "run-final-1",
      roomId: "room-1",
      teamId: "team-1",
      backingAgencyRunId: null,
      initiatedByUserId: 42,
      executionMode: "supervised",
      objective: "Do the thing",
      constraintsJson: null,
      status: "running",
      activeAssistantId: null,
      stopPolicyJson: null,
      approvalPolicyJson: null,
      budgetSnapshotJson: null,
      summaryArtifactId: null,
      stopReason: null,
      startedAt: new Date("2026-04-10T03:00:00.000Z"),
      endedAt: null,
    };
    const caseRecord = {
      id: "case-final-1",
      tenantId: "tenant-1",
      requestId: "req-final-1",
      primaryTaskId: "task-final-1",
      currentState: "in_progress",
      title: "Finalize invoice",
      summary: "Review final output",
      priority: "normal",
      riskLevel: "medium",
      dataClassification: "internal",
      ownerType: "queue",
      ownerId: "queue-1",
      linkedConversationIdsJson: [],
      linkedWorkpackRunIdsJson: [],
      linkedRoleRoutineRunIdsJson: ["run-final-1"],
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    };
    const task = {
      id: "task-final-1",
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      routineId: null,
      runId: null,
      status: "planned",
      title: "Finalize invoice",
      objective: "Review final output",
      priority: "normal",
      riskClass: "medium",
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    };

    const db = {
      select(fields?: any) {
        if (fields?.run === teamRuns) {
          return {
            from() {
              return {
                innerJoin() {
                  return {
                    where() {
                      return {
                        orderBy: async () => [{ run: teamRun }],
                      };
                    },
                  };
                },
              };
            },
          };
        }

        return {
          from(table: any) {
            if (table === teamWorkItems) {
              return { where: () => ({ limit: async () => [task] }) };
            }
            if (table === workCases) {
              return { where: () => ({ orderBy: async () => [caseRecord] }) };
            }
            if (table === workRequests) {
              return {
                where: () => ({
                  limit: async () => [
                    {
                      id: "req-final-1",
                      tenantId: "tenant-1",
                      currentState: "new",
                    },
                  ],
                }),
              };
            }
            if (
              table === workAssignments ||
              table === workOsEvents ||
              table === workItemEvents ||
              table === workpackRecords
            ) {
              return { where: () => ({ orderBy: async () => [] }) };
            }
            if (table === workAutomationRuns) {
              return {
                where: () => ({ orderBy: () => ({ limit: async () => [] }) }),
              };
            }
            return { where: () => ({ orderBy: async () => [] }) };
          },
        };
      },
    };

    mockGetDb.mockResolvedValue(db as any);
    mockGetLatestRunSnapshot.mockResolvedValue({
      artifactCountJson: {
        runtimeState: {
          finalReview: {
            reviewerPersona: "qa_validator",
            score: 0.71,
            recommendation: "Revise",
            comment: "Needs one more pass.",
          },
        },
      },
    } as any);
    mockExtractRunPlanArtifact.mockReturnValue(null);

    const inbox = await getInbox("tenant-1");
    expect(inbox[0]?.latestFinalReview).toEqual({
      reviewerPersona: "qa_validator",
      score: 0.71,
      recommendation: "Revise",
      comment: "Needs one more pass.",
    });
    expect(inbox[0]?.latestTeamId).toBe("team-1");
    expect(inbox[0]?.latestTeamRoomId).toBe("room-1");
    expect(inbox[0]?.latestTeamRunId).toBe("run-final-1");
    expect(inbox[0]?.latestTeamRunStatus).toBe("running");
    expect(inbox[0]?.latestTeamRunMode).toBe("supervised");
    expect(inbox[0]?.latestExploration).toBeNull();
  });

  it("includes final review evidence in the inbox even when the run has no exploration payload", async () => {
    const teamRun = {
      id: "run-final-1",
      roomId: "room-1",
      teamId: "team-1",
      backingAgencyRunId: null,
      initiatedByUserId: 42,
      executionMode: "supervised",
      objective: "Do the thing",
      constraintsJson: null,
      status: "running",
      activeAssistantId: null,
      stopPolicyJson: null,
      approvalPolicyJson: null,
      budgetSnapshotJson: null,
      summaryArtifactId: null,
      stopReason: null,
      startedAt: new Date("2026-04-10T03:00:00.000Z"),
      endedAt: null,
    };
    const caseRecord = {
      id: "case-final-1",
      tenantId: "tenant-1",
      requestId: "req-final-1",
      primaryTaskId: "task-final-1",
      currentState: "in_progress",
      title: "Finalize invoice",
      summary: "Review final output",
      priority: "normal",
      riskLevel: "medium",
      dataClassification: "internal",
      ownerType: "queue",
      ownerId: "queue-1",
      linkedConversationIdsJson: [],
      linkedWorkpackRunIdsJson: [],
      linkedRoleRoutineRunIdsJson: ["run-final-1"],
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    };
    const task = {
      id: "task-final-1",
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      routineId: null,
      runId: null,
      status: "planned",
      title: "Finalize invoice",
      objective: "Review final output",
      priority: "normal",
      riskClass: "medium",
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    };

    const db = {
      select(fields?: any) {
        if (fields?.run === teamRuns) {
          return {
            from() {
              return {
                innerJoin() {
                  return {
                    where() {
                      return {
                        orderBy: async () => [{ run: teamRun }],
                      };
                    },
                  };
                },
              };
            },
          };
        }

        return {
          from(table: any) {
            if (table === teamWorkItems) {
              return { where: () => ({ limit: async () => [task] }) };
            }
            if (table === workCases) {
              return { where: () => ({ orderBy: async () => [caseRecord] }) };
            }
            if (table === workRequests) {
              return { where: () => ({ limit: async () => [{ id: "req-final-1", tenantId: "tenant-1", currentState: "new" }] }) };
            }
            if (table === workAssignments || table === workOsEvents || table === workItemEvents || table === workpackRecords) {
              return { where: () => ({ orderBy: async () => [] }) };
            }
            if (table === workAutomationRuns) {
              return { where: () => ({ orderBy: () => ({ limit: async () => [] }) }) };
            }
            return { where: () => ({ orderBy: async () => [] }) };
          },
        };
      },
    };

    mockGetDb.mockResolvedValue(db as any);
    mockGetLatestRunSnapshot.mockResolvedValue({
      artifactCountJson: {
        runtimeState: {
          finalReview: {
            reviewerPersona: "qa_validator",
            score: 0.71,
            recommendation: "Revise",
            comment: "Needs one more pass.",
          },
        },
      },
    } as any);
    mockExtractRunPlanArtifact.mockReturnValue(null);

    const inbox = await getInbox("tenant-1");
    expect(inbox[0]?.latestFinalReview).toEqual({
      reviewerPersona: "qa_validator",
      score: 0.71,
      recommendation: "Revise",
      comment: "Needs one more pass.",
    });
    expect(inbox[0]?.latestExploration).toBeNull();
  });

  it("includes role-routine evidence in the case timeline", async () => {
    const roleRun = {
      id: "rrun-1",
      tenantId: "tenant-1",
      roleId: "role-1",
      routineId: "routine-1",
      contractId: "contract-1",
      status: "running",
      triggerSource: "schedule",
      idempotencyKey: "idem-1",
      selectedWorkpackFamily: "family-1",
      resolvedWorkpackVersionId: "wpv-1",
      linkedWorkpackRunIds: ["wpr-1"],
      checkpointId: "checkpoint-1",
      recoveryState: "fresh",
      resolutionPolicy: "pinned_version",
      previousResolvedVersionId: null,
      rollbackBaselineVersionId: null,
      partitionKey: null,
      blockerCodes: ["waiting_on_input"],
      currentObjectiveSummary: "Review invoice",
      approvalRequestIds: [],
      startedAt: "2026-04-10T04:00:00.000Z",
      endedAt: null,
      createdAt: "2026-04-10T04:00:00.000Z",
      updatedAt: "2026-04-10T04:05:00.000Z",
    };

    const caseRecord = {
      id: "case-1",
      tenantId: "tenant-1",
      requestId: "req-1",
      primaryTaskId: "task-1",
      currentState: "in_progress",
      title: "Process invoice",
      summary: "Collect invoice data",
      priority: "normal",
      riskLevel: "medium",
      dataClassification: "internal",
      ownerType: "queue",
      ownerId: "queue-1",
      linkedConversationIdsJson: [],
      linkedWorkpackRunIdsJson: [],
      linkedRoleRoutineRunIdsJson: ["rrun-1"],
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    };

    const task = {
      id: "task-1",
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      routineId: "routine-1",
      runId: null,
      status: "planned",
      title: "Follow up",
      objective: "Collect invoice data",
      priority: "normal",
      riskClass: "medium",
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    };

    mockGetRoleRoutineRun.mockResolvedValue(roleRun);
    mockListRoleRoutineRunsForRoutine.mockResolvedValue([roleRun]);

    const db = {
      select(fields?: any) {
        if (fields?.run === teamRuns) {
          return {
            from() {
              return {
                innerJoin() {
                  return {
                    where() {
                      return {
                        orderBy: async () => [],
                      };
                    },
                  };
                },
              };
            },
          };
        }

        return {
          from(table: any) {
            if (table === teamWorkItems) {
              return { where: () => ({ limit: async () => [task] }) };
            }
            if (table === workCases) {
              return { where: () => ({ limit: async () => [caseRecord] }) };
            }
            if (table === workRequests) {
              return {
                where: () => ({
                  limit: async () => [
                    { id: "req-1", tenantId: "tenant-1", currentState: "new" },
                  ],
                }),
              };
            }
            if (
              table === workAssignments ||
              table === workOsEvents ||
              table === workItemEvents ||
              table === workpackRecords
            ) {
              return { where: () => ({ orderBy: async () => [] }) };
            }
            if (table === workAutomationRuns) {
              return {
                where: () => ({ orderBy: () => ({ limit: async () => [] }) }),
              };
            }
            return {
              where: () => ({ orderBy: async () => [], limit: async () => [] }),
            };
          },
        };
      },
    };

    mockGetDb.mockResolvedValue(db as any);

    const projection = await getWorkCaseProjection("case-1", "tenant-1");
    const roleRoutineEntry = projection.timeline.find(
      entry => entry.source === "role_routine"
    );

    expect(roleRoutineEntry?.eventType).toBe("role_routine_running");
    expect(roleRoutineEntry?.detailJson).toEqual(
      expect.objectContaining({
        routineId: "routine-1",
        routineRunId: "rrun-1",
        selectedWorkpackFamily: "family-1",
      })
    );
  });

  it("enriches inbox cases with latest exploration summary when linked runs have plan comparisons", async () => {
    const workCase = {
      id: "case-1",
      tenantId: "tenant-1",
      requestId: "req-1",
      primaryTaskId: "task-1",
      currentState: "in_progress",
      title: "Process invoice",
      summary: "Collect invoice data",
      priority: "normal",
      riskLevel: "medium",
      dataClassification: "internal",
      ownerType: "queue",
      ownerId: "queue-1",
      linkedConversationIdsJson: [],
      linkedWorkpackRunIdsJson: [],
      linkedRoleRoutineRunIdsJson: ["run-1"],
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    };
    const teamRun = {
      id: "run-1",
      roomId: "room-1",
      teamId: "team-1",
      backingAgencyRunId: null,
      initiatedByUserId: 42,
      executionMode: "supervised",
      objective: "Do the thing",
      constraintsJson: null,
      status: "running",
      activeAssistantId: null,
      stopPolicyJson: null,
      approvalPolicyJson: null,
      budgetSnapshotJson: null,
      summaryArtifactId: null,
      stopReason: null,
      startedAt: new Date("2026-04-10T03:00:00.000Z"),
      endedAt: null,
    };

    const db = {
      select(fields?: any) {
        if (fields?.run === teamRuns) {
          return {
            from() {
              return {
                innerJoin() {
                  return {
                    where() {
                      return {
                        orderBy: async () => [{ run: teamRun }],
                      };
                    },
                  };
                },
              };
            },
          };
        }

        return {
          from(table: any) {
            if (table === workCases) {
              return { where: () => ({ orderBy: async () => [workCase] }) };
            }
            if (table === workRequests) {
              return { where: () => ({ limit: async () => [] }) };
            }
            return {
              where: () => ({ orderBy: async () => [], limit: async () => [] }),
            };
          },
        };
      },
    };

    mockGetDb.mockResolvedValue(db as any);
    mockGetLatestRunSnapshot.mockResolvedValue({
      artifactCountJson: {
        traceEnvelope: {
          version: 1,
          traceId: "trace-123",
          tenantId: "tenant-1",
          source: "team_run_snapshot",
          entityId: "run-1",
          eventType: "run_snapshot",
          generatedAt: "2026-04-10T03:10:00.000Z",
          summary: "Do the thing · running",
          evidenceRefs: [],
        },
        governedContext: {
          version: 1,
          tenantId: "tenant-1",
          principalScope: "team-1",
          objective: "Do the thing",
          generatedAt: "2026-04-10T03:10:00.000Z",
          selectedCount: 1,
          excludedCount: 0,
          summary: "1 context item(s) selected, 0 excluded for Do the thing",
          items: [],
        },
        readinessRecord: {
          version: 1,
          kind: "team_run",
          entityId: "run-1",
          generatedAt: "2026-04-10T03:10:00.000Z",
          score: 0.82,
          status: "ready",
          reason: "Ready to continue",
          evidenceRefs: [],
        },
        planArtifact: {
          exploration: {
            selectedCandidateId: "balanced-hybrid",
            selectionReason: "Choose the balanced path for best coverage.",
            criteria: ["safety", "speed"],
            candidates: [
              {
                candidateId: "balanced-hybrid",
                title: "Balanced hybrid",
                strategy: "bounded exploration",
                summary: "Explore enough to avoid brittle decisions.",
                strengths: ["balanced"],
                tradeoffs: ["slightly slower"],
                riskClass: "medium",
              },
            ],
          },
        },
      },
    } as any);
    mockExtractRunPlanArtifact.mockImplementation(
      (snapshot: any) => snapshot?.artifactCountJson?.planArtifact ?? null
    );

    const inbox = await getInbox("tenant-1");
    expect(inbox[0]?.latestExploration).toEqual(
      expect.objectContaining({
        selectedCandidateId: "balanced-hybrid",
        candidateCount: 1,
        selectionReason: "Choose the balanced path for best coverage.",
      })
    );
    expect(inbox[0]?.latestTraceId).toBe("trace-123");
    expect(inbox[0]?.latestContext).toEqual(
      expect.objectContaining({
        tenantId: "tenant-1",
        selectedCount: 1,
      })
    );
    expect(inbox[0]?.latestTeamId).toBe("team-1");
    expect(inbox[0]?.latestTeamRoomId).toBe("room-1");
    expect(inbox[0]?.latestTeamRunId).toBe("run-1");
    expect(inbox[0]?.latestReadiness).toEqual(
      expect.objectContaining({
        status: "ready",
        score: 0.82,
      })
    );
  });

  it("enriches inbox cases with latest exploration summary when linked runs have plan comparisons", async () => {
    const workCase = {
      id: "case-1",
      tenantId: "tenant-1",
      requestId: "req-1",
      primaryTaskId: "task-1",
      currentState: "in_progress",
      title: "Process invoice",
      summary: "Collect invoice data",
      priority: "normal",
      riskLevel: "medium",
      dataClassification: "internal",
      ownerType: "queue",
      ownerId: "queue-1",
      linkedConversationIdsJson: [],
      linkedWorkpackRunIdsJson: [],
      linkedRoleRoutineRunIdsJson: ["run-1"],
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    };
    const teamRun = {
      id: "run-1",
      roomId: "room-1",
      teamId: "team-1",
      backingAgencyRunId: null,
      initiatedByUserId: 42,
      executionMode: "supervised",
      objective: "Do the thing",
      constraintsJson: null,
      status: "running",
      activeAssistantId: null,
      stopPolicyJson: null,
      approvalPolicyJson: null,
      budgetSnapshotJson: null,
      summaryArtifactId: null,
      stopReason: null,
      startedAt: new Date("2026-04-10T03:00:00.000Z"),
      endedAt: null,
    };

    const db = {
      select(fields?: any) {
        if (fields?.run === teamRuns) {
          return {
            from() {
              return {
                innerJoin() {
                  return {
                    where() {
                      return {
                        orderBy: async () => [{ run: teamRun }],
                      };
                    },
                  };
                },
              };
            },
          };
        }

        return {
          from(table: any) {
            if (table === workCases) {
              return { where: () => ({ orderBy: async () => [workCase] }) };
            }
            if (table === workRequests) {
              return { where: () => ({ limit: async () => [] }) };
            }
            return { where: () => ({ orderBy: async () => [], limit: async () => [] }) };
          },
        };
      },
    };

    mockGetDb.mockResolvedValue(db as any);
    mockGetLatestRunSnapshot.mockResolvedValue({
      artifactCountJson: {
        traceEnvelope: {
          version: 1,
          traceId: "trace-123",
          tenantId: "tenant-1",
          source: "team_run_snapshot",
          entityId: "run-1",
          eventType: "run_snapshot",
          generatedAt: "2026-04-10T03:10:00.000Z",
          summary: "Do the thing · running",
          evidenceRefs: [],
        },
        governedContext: {
          version: 1,
          tenantId: "tenant-1",
          principalScope: "team-1",
          objective: "Do the thing",
          generatedAt: "2026-04-10T03:10:00.000Z",
          selectedCount: 1,
          excludedCount: 0,
          summary: "1 context item(s) selected, 0 excluded for Do the thing",
          items: [],
        },
        readinessRecord: {
          version: 1,
          kind: "team_run",
          entityId: "run-1",
          generatedAt: "2026-04-10T03:10:00.000Z",
          score: 0.82,
          status: "ready",
          reason: "Ready to continue",
          evidenceRefs: [],
        },
        planArtifact: {
          exploration: {
            selectedCandidateId: "balanced-hybrid",
            selectionReason: "Choose the balanced path for best coverage.",
            criteria: ["safety", "speed"],
            candidates: [
              {
                candidateId: "balanced-hybrid",
                title: "Balanced hybrid",
                strategy: "bounded exploration",
                summary: "Explore enough to avoid brittle decisions.",
                strengths: ["balanced"],
                tradeoffs: ["slightly slower"],
                riskClass: "medium",
              },
            ],
          },
        },
      },
    } as any);
    mockExtractRunPlanArtifact.mockImplementation((snapshot: any) => snapshot?.artifactCountJson?.planArtifact ?? null);

    const inbox = await getInbox("tenant-1");
    expect(inbox[0]?.latestExploration).toEqual(expect.objectContaining({
      selectedCandidateId: "balanced-hybrid",
      candidateCount: 1,
      selectionReason: "Choose the balanced path for best coverage.",
    }));
    expect(inbox[0]?.latestTraceId).toBe("trace-123");
    expect(inbox[0]?.latestContext).toEqual(expect.objectContaining({
      tenantId: "tenant-1",
      selectedCount: 1,
    }));
    expect(inbox[0]?.latestReadiness).toEqual(expect.objectContaining({
      status: "ready",
      score: 0.82,
    }));
  });

  it("includes automation run evidence in the case timeline", async () => {
    const automationRun = {
      id: "run-automation-1",
      tenantId: "tenant-1",
      requestId: "req-1",
      caseId: "case-1",
      taskId: "task-1",
      templateKey: "content-production",
      templateVersion: "v1",
      title: "Generate launch assets",
      objective: "Create research, copy, storyboard, media, and video",
      currentMode: "semi_auto",
      status: "running",
      currentStepId: "step-automation-1",
      currentCheckpointId: "checkpoint-automation-1",
      finalDisposition: null,
      finalDispositionReason: null,
      resumeCursor: "resume:automation",
      createdByUserId: 42,
      createdByAssistantId: null,
      startedAt: new Date("2026-04-10T05:00:00.000Z"),
      completedAt: null,
      createdAt: new Date("2026-04-10T05:00:00.000Z"),
      updatedAt: new Date("2026-04-10T05:05:00.000Z"),
    };

    const automationEvent = {
      id: "automation-event-1",
      tenantId: "tenant-1",
      requestId: "req-1",
      caseId: "case-1",
      runId: "run-automation-1",
      stepId: null,
      checkpointId: null,
      eventType: "automation_run_created",
      fromMode: null,
      toMode: "semi_auto",
      status: "running",
      detailJson: { templateKey: "content-production" },
      actorUserId: 42,
      actorAssistantId: null,
      createdAt: new Date("2026-04-10T05:00:00.000Z"),
    };

    const caseRecord = {
      id: "case-1",
      tenantId: "tenant-1",
      requestId: "req-1",
      primaryTaskId: "task-1",
      currentState: "in_progress",
      title: "Process invoice",
      summary: "Collect invoice data",
      priority: "normal",
      riskLevel: "medium",
      dataClassification: "internal",
      ownerType: "queue",
      ownerId: "queue-1",
      automationRunId: "run-automation-1",
      automationMode: "semi_auto",
      automationStepId: "step-automation-1",
      automationCheckpointId: "checkpoint-automation-1",
      automationDisposition: null,
      automationSummary: "Create research, copy, storyboard, media, and video",
      automationUpdatedAt: new Date("2026-04-10T05:05:00.000Z"),
      linkedConversationIdsJson: [],
      linkedWorkpackRunIdsJson: [],
      linkedRoleRoutineRunIdsJson: [],
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T05:05:00.000Z"),
    };

    const task = {
      id: "task-1",
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      status: "planned",
      title: "Follow up",
      objective: "Collect invoice data",
      priority: "normal",
      riskClass: "medium",
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    };

    const db = {
      select(fields?: any) {
        if (fields?.run === teamRuns) {
          return {
            from() {
              return {
                innerJoin() {
                  return {
                    where() {
                      return {
                        orderBy: async () => [],
                      };
                    },
                  };
                },
              };
            },
          };
        }

        return {
          from(table: any) {
            if (table === teamWorkItems) {
              return { where: () => ({ limit: async () => [task] }) };
            }
            if (table === workCases) {
              return { where: () => ({ limit: async () => [caseRecord] }) };
            }
            if (table === workRequests) {
              return {
                where: () => ({
                  limit: async () => [
                    { id: "req-1", tenantId: "tenant-1", currentState: "new" },
                  ],
                }),
              };
            }
            if (
              table === workAssignments ||
              table === workOsEvents ||
              table === workItemEvents ||
              table === workpackRecords
            ) {
              return { where: () => ({ orderBy: async () => [] }) };
            }
            if (table === workAutomationRuns) {
              return {
                where: () => ({
                  orderBy: () => ({ limit: async () => [automationRun] }),
                }),
              };
            }
            if (table === workAutomationRunEvents) {
              return {
                where: () => ({ orderBy: async () => [automationEvent] }),
              };
            }
            return {
              where: () => ({ orderBy: async () => [], limit: async () => [] }),
            };
          },
        };
      },
    };

    mockGetDb.mockResolvedValue(db as any);

    const projection = await getWorkCaseProjection("case-1", "tenant-1");
    const automationEntry = projection.timeline.find(
      entry => entry.eventType === "automation_run_created"
    );

    expect(projection.automation.run?.id).toBe("run-automation-1");
    expect(automationEntry?.source).toBe("work_os");
    expect(automationEntry?.detailJson).toEqual(
      expect.objectContaining({
        runId: "run-automation-1",
        templateKey: "content-production",
      })
    );
  });
});
