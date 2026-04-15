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
vi.mock("../workItemService", () => ({
  createWorkItem: mockCreateWorkItem,
}));

import { createWorkRequest, createWorkTask, projectTaskAsCase } from "../workOsService";

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
  });

  it("creates linked request and case records", async () => {
    const inserted: Array<{ table: string; values: unknown }> = [];

    const tx = {
      insert(table: any) {
        return {
          values(payload: unknown) {
            inserted.push({
              table:
                table === workRequests ? "workRequests"
                  : table === workCases ? "workCases"
                    : table === workAssignments ? "workAssignments"
                      : "other",
              values: payload,
            });
            if (table === workRequests) return buildReturning({ id: "req-1", tenantId: "tenant-1", currentState: "new" });
            if (table === workCases) return buildReturning({ id: "case-1", tenantId: "tenant-1", requestId: "req-1", currentState: "new", title: "Process invoice" });
            if (table === workAssignments) return buildReturning({ id: "assignment-1", tenantId: "tenant-1" });
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
    expect(inserted.map((item) => item.table)).toEqual(["workRequests", "workCases", "workAssignments", "other"]);
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
      limit: async () => [{ id: "task-1", tenantId: "tenant-1", status: "planned", title: "Follow up", objective: "Collect invoice data", priority: "normal", riskClass: "medium", createdAt: new Date("2026-04-10T00:00:00.000Z"), updatedAt: new Date("2026-04-10T00:00:00.000Z") }],
    };

    const caseSelect = {
      limit: async () => [{ id: "case-1", tenantId: "tenant-1", requestId: "req-1", currentState: "new", title: "Process invoice", summary: "Collect invoice data", priority: "normal", riskLevel: "medium", dataClassification: "internal", linkedConversationIdsJson: [], linkedWorkpackRunIdsJson: [], linkedRoleRoutineRunIdsJson: [], createdAt: new Date("2026-04-10T00:00:00.000Z"), updatedAt: new Date("2026-04-10T00:00:00.000Z") }],
    };

    const db = {
      select() {
        return {
          from(table: any) {
            if (table === workCases) {
              return { where: () => caseSelect };
            }
            if (table === workRequests) {
              return { where: () => ({ limit: async () => [{ id: "req-1", tenantId: "tenant-1", currentState: "new" }] }) };
            }
            if (table === teamWorkItems) {
              return { where: () => taskSelect, orderBy: () => taskSelect };
            }
            if (table === workItemEvents) {
              return { where: () => ({ orderBy: async () => [] }) };
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

    expect(mockCreateWorkItem).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      sourceType: "work_os",
      title: "Follow up",
    }));
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
              return { where: () => ({ orderBy: async () => [{ id: "evt-legacy-1", eventType: "created", createdAt: new Date("2026-04-10T00:00:00.000Z"), detailJson: { ok: true } }] }) };
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
              return { where: () => ({ limit: async () => [{ id: "task-1", tenantId: "tenant-1", runId: "run-1", status: "planned", title: "Follow up", objective: "Collect invoice data", priority: "normal", riskClass: "medium", createdAt: new Date("2026-04-10T00:00:00.000Z"), updatedAt: new Date("2026-04-10T00:00:00.000Z") }] }) };
            }
            if (table === workCases) {
              return { where: () => ({ limit: async () => [caseRecord] }) };
            }
            if (table === workRequests) {
              return { where: () => ({ limit: async () => [{ id: "req-1", tenantId: "tenant-1", currentState: "new" }] }) };
            }
            if (table === workAssignments || table === workOsEvents || table === workItemEvents) {
              return { where: () => ({ orderBy: async () => [] }) };
            }
            if (table === workpackRecords) {
              return { where: () => ({ orderBy: async () => [workPackRecord] }) };
            }
            return { where: () => ({ orderBy: async () => [], limit: async () => [] }) };
          },
        };
      },
    };

    mockGetDb.mockResolvedValue(db as any);

    const projection = await projectTaskAsCase("task-1", "tenant-1");
    const workpackEntry = projection.timeline.find((entry) => entry.source === "workpack_record");
    const teamRunEntry = projection.timeline.find((entry) => entry.source === "team_run");

    expect(workpackEntry?.eventType).toBe("workpack_run");
    expect(teamRunEntry?.eventType).toBe("team_run_snapshot");
    expect(workpackEntry?.detailJson).toEqual(expect.objectContaining({ recordId: "wpr-1" }));
    expect(teamRunEntry?.detailJson).toEqual(expect.objectContaining({ runId: "run-1" }));
  });
});
