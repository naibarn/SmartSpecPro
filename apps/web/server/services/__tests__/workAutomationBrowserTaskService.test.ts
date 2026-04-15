import { beforeEach, describe, expect, it, vi } from "vitest";
import { workAutomationBrowserTaskClaims } from "../../../drizzle/schema";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getAutomationCopilotTaskStatus: vi.fn(),
  finalizeAutomationCopilotTaskReservation: vi.fn(),
  getAutomationRunProjection: vi.fn(),
  recordAutomationRunStepProgress: vi.fn(),
  updateAutomationRunStepProgress: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mocks.getDb,
}));

vi.mock("../automationCopilotExecutionService", () => ({
  getAutomationCopilotTaskStatus: mocks.getAutomationCopilotTaskStatus,
  finalizeAutomationCopilotTaskReservation: mocks.finalizeAutomationCopilotTaskReservation,
}));

vi.mock("../workAutomationFabricService", () => ({
  getAutomationRunProjection: mocks.getAutomationRunProjection,
  recordAutomationRunStepProgress: mocks.recordAutomationRunStepProgress,
  updateAutomationRunStepProgress: mocks.updateAutomationRunStepProgress,
}));

import {
  claimBrowserAutomationTask,
  getBrowserAutomationHealth,
  mapAutomationCopilotStatusToBrowserClaimStatus,
  reconcileBrowserAutomationTaskClaims,
} from "../workAutomationBrowserTaskService";

describe("workAutomationBrowserTaskService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps Automation Copilot statuses to browser claim statuses", () => {
    expect(mapAutomationCopilotStatusToBrowserClaimStatus("success")).toBe("completed");
    expect(mapAutomationCopilotStatusToBrowserClaimStatus("executing")).toBe("running");
    expect(mapAutomationCopilotStatusToBrowserClaimStatus("failed")).toBe("failed");
    expect(mapAutomationCopilotStatusToBrowserClaimStatus("cancelled")).toBe("cancelled");
  });

  it("reconciles a terminal browser task and finalizes the claim", async () => {
    const claim = {
      id: "claim-1",
      tenantId: "tenant-1",
      requestId: null,
      caseId: "case-1",
      runId: "run-1",
      stepId: "step-1",
      stepKey: "research",
      stepIndex: 0,
      title: "Research",
      idempotencyKey: "idem-1",
      claimToken: "token-1",
      status: "queued",
      taskId: "run-1:research",
      executionId: "run-1:research:browser",
      reservationId: "reservation-1",
      inputRefsJson: ["input:1"],
      outputRefsJson: ["browser-task:browser-task-1"],
      detailJson: { note: "browser queued" },
      errorMessage: null,
      claimedAt: new Date("2026-04-10T00:00:00.000Z"),
      dispatchedAt: new Date("2026-04-10T00:00:10.000Z"),
      lastPolledAt: null,
      nextPollAt: null,
      completedAt: null,
      pollCount: 0,
      createdByUserId: 42,
      createdByAssistantId: null,
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    };

    const updatePayloads: any[] = [];
    const claimQuery = {
      orderBy() {
        return {
          limit: async () => [claim],
        };
      },
      limit: async () => [claim],
    };
    const db = {
      select() {
        return {
          from(table: any) {
            if (table === workAutomationBrowserTaskClaims) {
              return {
                where: () => claimQuery,
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
      update(table: any) {
        return {
          set(payload: any) {
            updatePayloads.push({ table, payload });
            return {
              where() {
                return {
                  returning: async () => [{ ...claim, ...payload }],
                };
              },
            };
          },
        };
      },
    };

    mocks.getDb.mockResolvedValue(db as any);
    mocks.getAutomationCopilotTaskStatus.mockResolvedValue({
      status: "success",
      actual_credits_used: 3,
      steps_completed: 4,
      steps_total: 4,
    });
    mocks.getAutomationRunProjection.mockResolvedValue({
      run: {
        id: "run-1",
        tenantId: "tenant-1",
        caseId: "case-1",
        templateKey: "content-production",
        templateVersion: "content-production.v1",
        templateFamily: "content-production",
        templateSource: "case_intake",
        currentMode: "semi_auto",
      },
      steps: [
        {
          id: "step-1",
          stepKey: "research",
          idempotencyKey: "idem-1",
        },
      ],
      checkpoints: [],
      events: [],
    });
    mocks.finalizeAutomationCopilotTaskReservation.mockResolvedValue(undefined);
    mocks.updateAutomationRunStepProgress.mockResolvedValue({
      run: { id: "run-1" },
      step: { id: "step-1" },
    });

    const result = await reconcileBrowserAutomationTaskClaims("tenant-1", { limit: 5, now: new Date("2026-04-10T00:10:00.000Z") });

    expect(result).toEqual({
      processed: 1,
      completed: 1,
      failed: 0,
      cancelled: 0,
      pending: 0,
    });
    expect(mocks.getAutomationCopilotTaskStatus).toHaveBeenCalledWith("tenant-1", "run-1:research");
    expect(mocks.updateAutomationRunStepProgress).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      stepId: "step-1",
      status: "succeeded",
    }));
    expect(mocks.finalizeAutomationCopilotTaskReservation).toHaveBeenCalledWith("run-1:research", "success");
    expect(updatePayloads.length).toBeGreaterThan(0);
  });

  it("creates a browser claim with a deterministic task id", async () => {
    const db = {
      insert() {
        return {
          values() {
            return {
              onConflictDoNothing() {
                return {
                  returning: async () => [{
                    id: "claim-1",
                    tenantId: "tenant-1",
                    requestId: null,
                    caseId: "case-1",
                    runId: "run-1",
                    stepId: null,
                    stepKey: "research",
                    stepIndex: 0,
                    title: "Research",
                    idempotencyKey: "idem-1",
                    claimToken: "token-1",
                    status: "claimed",
                    taskId: "run-1:research",
                    executionId: "run-1:research:browser",
                    reservationId: null,
                    inputRefsJson: [],
                    outputRefsJson: [],
                    detailJson: {},
                    errorMessage: null,
                    claimedAt: new Date("2026-04-10T00:00:00.000Z"),
                    dispatchedAt: null,
                    lastPolledAt: null,
                    nextPollAt: null,
                    completedAt: null,
                    pollCount: 0,
                    createdByUserId: 42,
                    createdByAssistantId: null,
                    createdAt: new Date("2026-04-10T00:00:00.000Z"),
                    updatedAt: new Date("2026-04-10T00:00:00.000Z"),
                  }],
                };
              },
            };
          },
        };
      },
      select() {
        return {
          from() {
            return {
              where: () => ({
                limit: async () => [{ id: "claim-1" }],
              }),
            };
          },
        };
      },
    };

    mocks.getDb.mockResolvedValue(db as any);

    const result = await claimBrowserAutomationTask({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      stepKey: "research",
      stepIndex: 0,
      title: "Research",
      idempotencyKey: "idem-1",
      taskId: "run-1:research",
      executionId: "run-1:research:browser",
      inputRefsJson: [],
      detailJson: { prompt: "Research the launch" },
      createdByUserId: 42,
    });

    expect(result.created).toBe(true);
    expect(result.claim.taskId).toBe("run-1:research");
  });

  it("returns browser automation health summary for the tenant", async () => {
    const claims = [
      {
        id: "claim-1",
        tenantId: "tenant-1",
        caseId: "case-1",
        status: "claimed",
        claimedAt: new Date("2026-04-10T00:00:00.000Z"),
        lastPolledAt: new Date("2026-04-10T00:01:00.000Z"),
        updatedAt: new Date("2026-04-10T00:01:30.000Z"),
        completedAt: null,
        nextPollAt: new Date("2026-04-10T00:02:00.000Z"),
      },
      {
        id: "claim-2",
        tenantId: "tenant-1",
        caseId: "case-2",
        status: "running",
        claimedAt: new Date("2026-04-10T00:02:00.000Z"),
        lastPolledAt: new Date("2026-04-10T00:03:00.000Z"),
        updatedAt: new Date("2026-04-10T00:03:30.000Z"),
        completedAt: null,
        nextPollAt: new Date("2026-04-10T00:06:00.000Z"),
      },
      {
        id: "claim-3",
        tenantId: "tenant-1",
        caseId: "case-3",
        status: "completed",
        claimedAt: new Date("2026-04-09T23:50:00.000Z"),
        lastPolledAt: new Date("2026-04-10T00:04:00.000Z"),
        updatedAt: new Date("2026-04-10T00:04:30.000Z"),
        completedAt: new Date("2026-04-10T00:04:30.000Z"),
        nextPollAt: null,
      },
    ];

    const db = {
      select() {
        return {
          from() {
            return {
              where: () => claims,
            };
          },
        };
      },
    };

    mocks.getDb.mockResolvedValue(db as any);

    const result = await getBrowserAutomationHealth("tenant-1", new Date("2026-04-10T00:05:00.000Z"));

    expect(result).toEqual(expect.objectContaining({
      totalClaims: 3,
      pendingClaims: 2,
      claimedClaims: 1,
      queuedClaims: 0,
      runningClaims: 1,
      completedClaims: 1,
      failedClaims: 0,
      cancelledClaims: 0,
      staleClaims: 1,
      distinctCases: 3,
    }));
    expect(result.latestUpdatedAt).toEqual(new Date("2026-04-10T00:04:30.000Z"));
    expect(result.nextPollAt).toEqual(new Date("2026-04-10T00:02:00.000Z"));
  });
});
