import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";

const { mockGetDb } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../services/skillStudioService", () => ({
  applyIscProposal: vi.fn(),
  applyIscProposalDiff: vi.fn(),
  launchSkillStudioTask: vi.fn(),
  listIscProposalsWithOwners: vi.fn(),
  readIscProposalContent: vi.fn(),
}));

const { mockApplySkillUpgradeRecommendation } = vi.hoisted(() => ({
  mockApplySkillUpgradeRecommendation: vi.fn(),
}));

vi.mock("../../services/skillUpgradeApplier", () => ({
  applySkillUpgradeRecommendation: mockApplySkillUpgradeRecommendation,
}));

import { skillsRouter } from "../skills";

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "admin-42",
      email: "admin@example.com",
      name: "Admin",
      loginMethod: "email",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    userToken: null,
    tenantId: null,
    publicUrl: null,
  };
}

function buildDb(rows: any[], skillRows: any[], latestRunRows: any[] = []) {
  const recommendationQuery = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    from: vi.fn(() => recommendationQuery),
  };

  const skillsQuery = {
    where: vi.fn().mockResolvedValue(skillRows),
    from: vi.fn(() => skillsQuery),
  };

  const latestRunQuery = {
    where: vi.fn(() => latestRunQuery),
    orderBy: vi.fn().mockResolvedValue(latestRunRows),
    from: vi.fn(() => latestRunQuery),
  };

  return {
    select: vi.fn()
      .mockReturnValueOnce(recommendationQuery)
      .mockReturnValueOnce(skillsQuery)
      .mockReturnValueOnce(latestRunQuery),
  };
}

function buildSummaryDb(count: number) {
  const summaryQuery = {
    where: vi.fn().mockReturnThis(),
    from: vi.fn(() => summaryQuery),
  };

  summaryQuery.where.mockResolvedValue([{ count }]);

  return {
    select: vi.fn().mockReturnValue(summaryQuery),
  };
}

function buildApplyRunsDb(rows: any[]) {
  const applyRunsQuery = {
    from: vi.fn(() => applyRunsQuery),
    leftJoin: vi.fn(() => applyRunsQuery),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };

  return {
    select: vi.fn().mockReturnValue(applyRunsQuery),
  };
}

function buildNormalizeDb(rows: any[]) {
  const applyRunsQuery = {
    from: vi.fn(() => applyRunsQuery),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };

  const updateSetCalls: any[] = [];
  const updateQuery = {
    set: vi.fn((payload) => {
      updateSetCalls.push(payload);
      return updateQuery;
    }),
    where: vi.fn().mockResolvedValue(undefined),
  };

  return {
    select: vi.fn().mockReturnValue(applyRunsQuery),
    update: vi.fn().mockReturnValue(updateQuery),
    updateSetCalls,
  };
}

function buildRecoverStaleDb(rows: any[]) {
  const applyRunsQuery = {
    from: vi.fn(() => applyRunsQuery),
    where: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn(() => applyRunsQuery),
    limit: vi.fn().mockResolvedValue(rows),
  };

  const updateSetCalls: any[] = [];
  const updateQuery = {
    set: vi.fn((payload) => {
      updateSetCalls.push(payload);
      return updateQuery;
    }),
    where: vi.fn().mockResolvedValue(undefined),
  };

  return {
    select: vi.fn().mockReturnValue(applyRunsQuery),
    update: vi.fn().mockReturnValue(updateQuery),
    updateSetCalls,
  };
}

describe("skills router legacy upgrade queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApplySkillUpgradeRecommendation.mockResolvedValue({
      recommendation: { id: 11 },
      run: { id: 1 },
      compatibilityReport: null,
      mode: "queued",
      applyStrategy: "proposal",
      taskId: "task-1",
    });
  });

  it("returns legacy upgrade recommendations sorted by computed priority", async () => {
    mockGetDb.mockResolvedValue(buildDb(
      [
        {
          id: 11,
          skillId: 2,
          recommendationType: "native-bundle-upgrade",
          title: "Low priority",
          summary: "Low",
          status: "pending_review",
          riskLevel: "medium",
          qualityScore: 65,
          analyzedAt: new Date("2026-04-22T10:00:00.000Z"),
          recommendationJson: {
            upgradePriorityScore: 25,
            upgradePriorityTier: "low",
            parallelUpgradeEligible: true,
            legacyUpgradeSignals: { hasRunScript: false },
          },
        },
        {
          id: 12,
          skillId: 1,
          recommendationType: "native-bundle-upgrade",
          title: "High priority",
          summary: "High",
          status: "pending_review",
          riskLevel: "critical",
          qualityScore: 72,
          analyzedAt: new Date("2026-04-22T09:00:00.000Z"),
          recommendationJson: {
            upgradePriorityScore: 95,
            upgradePriorityTier: "critical",
            parallelUpgradeEligible: true,
            legacyUpgradeSignals: { hasRunScript: false },
          },
        },
      ],
      [
        { id: 1, slug: "high-priority", name: "High Priority", category: "automation", executionMode: "llm-only", sandboxProfileSlug: null },
        { id: 2, slug: "low-priority", name: "Low Priority", category: "automation", executionMode: "llm-only", sandboxProfileSlug: null },
      ],
    ));

    const caller = skillsRouter.createCaller(createAdminContext());
    const queue = await caller.getLegacyUpgradeQueue({ limit: 50 });

    expect(queue).toHaveLength(2);
    expect(queue[0]?.skill?.slug).toBe("high-priority");
    expect(queue[0]?.upgradePriorityScore).toBe(95);
    expect(queue[0]?.upgradePriorityTier).toBe("critical");
    expect(queue[1]?.skill?.slug).toBe("low-priority");
    expect(queue[1]?.upgradePriorityScore).toBe(25);
  });

  it("hides completed proposal history from the default legacy upgrade queue", async () => {
    const rows = [
      {
        id: 11,
        skillId: 1,
        recommendationType: "native-bundle-upgrade",
        title: "Proposal already generated",
        summary: "Done",
        status: "approved",
        riskLevel: "critical",
        qualityScore: 90,
        analyzedAt: new Date("2026-04-22T10:00:00.000Z"),
        recommendationJson: {
          upgradePriorityScore: 95,
          upgradePriorityTier: "critical",
          parallelUpgradeEligible: true,
          legacyUpgradeSignals: { hasRunScript: false },
        },
      },
      {
        id: 12,
        skillId: 2,
        recommendationType: "native-bundle-upgrade",
        title: "Still pending",
        summary: "Pending",
        status: "pending_review",
        riskLevel: "high",
        qualityScore: 72,
        analyzedAt: new Date("2026-04-22T09:00:00.000Z"),
        recommendationJson: {
          upgradePriorityScore: 80,
          upgradePriorityTier: "high",
          parallelUpgradeEligible: true,
          legacyUpgradeSignals: { hasRunScript: false },
        },
      },
    ];
    const skillRows = [
      { id: 1, slug: "proposal-ready", name: "Proposal Ready", category: "automation", executionMode: "llm-only", sandboxProfileSlug: null },
      { id: 2, slug: "still-pending", name: "Still Pending", category: "automation", executionMode: "llm-only", sandboxProfileSlug: null },
    ];
    const latestRunRows = [
      {
        id: 901,
        recommendationId: 11,
        runType: "apply",
        status: "completed",
        summary: "Proposal generated and ready for admin review",
        errorMessage: null,
        verificationJson: {},
        logsJson: { applyStrategy: "proposal" },
        startedAt: new Date("2026-04-22T10:01:00.000Z"),
        endedAt: new Date("2026-04-22T10:02:00.000Z"),
        createdAt: new Date("2026-04-22T10:01:00.000Z"),
        updatedAt: new Date("2026-04-22T10:02:00.000Z"),
      },
    ];

    mockGetDb.mockResolvedValue(buildDb(rows, skillRows, latestRunRows));

    const caller = skillsRouter.createCaller(createAdminContext());
    const queue = await caller.getLegacyUpgradeQueue({ limit: 50 });

    expect(queue).toHaveLength(1);
    expect(queue[0]?.id).toBe(12);
    expect(queue[0]?.skill?.slug).toBe("still-pending");
  });

  it("queues multiple legacy upgrade recommendations in bulk", async () => {
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
        from: vi.fn().mockReturnThis(),
      }),
    });

    const caller = skillsRouter.createCaller(createAdminContext());
    const result = await caller.applyLegacyUpgradeRecommendations({
      recommendationIds: [11, 12, 12],
    });

    expect(result.requestedIds).toEqual([11, 12]);
    expect(result.appliedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(mockApplySkillUpgradeRecommendation).toHaveBeenCalledTimes(2);
    expect(mockApplySkillUpgradeRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({ recommendationId: 11, requestedBy: 42, userRole: "admin" }),
    );
  });

  it("returns a legacy upgrade summary count", async () => {
    mockGetDb.mockResolvedValue(buildSummaryDb(7));

    const caller = skillsRouter.createCaller(createAdminContext());
    const summary = await caller.getLegacyUpgradeQueueSummary();

    expect(summary.count).toBe(7);
  });

  it("returns latest queued apply runs with task ids and reasons", async () => {
    mockGetDb.mockResolvedValue(buildApplyRunsDb([
      {
        id: 902,
        recommendationId: 11,
        skillId: 1,
        runType: "apply",
        status: "running",
        summary: "Queued for execution",
        errorMessage: null,
        verificationJson: {},
        logsJson: {
          taskId: "task-queue-123",
          applyStrategy: "proposal",
          lineage: {
            role: "orchestrator",
            parentRunId: null,
            childRunIds: ["903"],
            checkpointVersion: 4,
            verificationState: "running",
            artifactRefs: ["out/plan.md"],
            resumeCursor: "resume-plan",
          },
        },
        startedAt: new Date("2026-04-22T10:00:00.000Z"),
        endedAt: null,
        createdAt: new Date("2026-04-22T10:00:00.000Z"),
        updatedAt: new Date("2026-04-22T10:00:00.000Z"),
        recommendationType: "native-bundle-upgrade",
        recommendationStatus: "approved",
        recommendationTitle: "Upgrade bundle",
        recommendationRiskLevel: "critical",
        recommendationCompatibilityStatus: "blocked",
        recommendationQualityScore: 88,
        recommendationCurrentRuntime: "markdown-only",
        recommendationProposedRuntime: "native-bundle",
        recommendationProposedAction: "upgrade",
        recommendationIsAutoApplySafe: false,
        recommendationJson: {},
        skillSlug: "queued-skill",
        skillName: "Queued Skill",
        skillExecutionMode: "markdown-only",
      },
      {
        id: 903,
        recommendationId: 12,
        skillId: 2,
        runType: "apply",
        status: "failed",
        summary: "Proposal generation failed",
        errorMessage: "Unknown proposal generation error",
        verificationJson: {},
        logsJson: {
          resultError: "Improvement failed: /repo/apps/web/skills/intelligence-skill-creator/runs/workspaces/demo/123/skills/intelligence-skill-creator",
          workspaceRoot: "/repo/apps/web/skills/intelligence-skill-creator/runs/workspaces/demo/123",
          entrypointRoot: "/repo/apps/web/skills/intelligence-skill-creator/runs/workspaces/demo/123/skills/intelligence-skill-creator",
        },
        startedAt: new Date("2026-04-22T09:00:00.000Z"),
        endedAt: new Date("2026-04-22T09:05:00.000Z"),
        createdAt: new Date("2026-04-22T09:00:00.000Z"),
        updatedAt: new Date("2026-04-22T09:05:00.000Z"),
        recommendationType: "native-bundle-upgrade",
        recommendationStatus: "failed",
        recommendationTitle: "Upgrade bundle",
        recommendationRiskLevel: "high",
        recommendationCompatibilityStatus: "warning",
        recommendationQualityScore: 70,
        recommendationCurrentRuntime: "markdown-only",
        recommendationProposedRuntime: "native-bundle",
        recommendationProposedAction: "upgrade",
        recommendationIsAutoApplySafe: false,
        recommendationJson: {},
        skillSlug: "failed-skill",
        skillName: "Failed Skill",
        skillExecutionMode: "python",
      },
    ]));

    const caller = skillsRouter.createCaller(createAdminContext());
    const result = await caller.getLegacyUpgradeApplyRuns({ state: "all", limit: 100 });

    expect(result.counts).toEqual({
      total: 2,
      queued: 0,
      running: 1,
      failed: 1,
      completed: 0,
      blocked: 0,
      canceled: 0,
    });
        expect(result.items).toHaveLength(2);
        expect(result.items[0]?.queueState).toBe("running");
        expect(result.items[0]?.taskId).toBe("task-queue-123");
        expect(result.items[0]?.latestRun.status).toBe("running");
        expect(result.items[0]?.latestRun.lineage?.role).toBe("orchestrator");
        expect(result.items[1]?.queueState).toBe("failed");
        expect(result.items[1]?.latestRun.errorMessage).toBe("Unknown proposal generation error");
        expect(result.items[1]?.workspaceRootIssue).toBe(true);
        expect(result.items[1]?.diagnosticCode).toBe("isc_workspace_root_pollution");
        expect(result.items[1]?.workspaceRoot).toContain("/runs/workspaces/");
      });

  it("hides completed apply runs from the default all monitor", async () => {
    mockGetDb.mockResolvedValue(buildApplyRunsDb([
      {
        id: 910,
        recommendationId: 31,
        skillId: 3,
        runType: "apply",
        status: "completed",
        summary: "Native Agents Python improve complete",
        errorMessage: null,
        verificationJson: {},
        logsJson: { resultMessage: "Files updated" },
        startedAt: new Date("2026-05-08T12:00:00.000Z"),
        endedAt: new Date("2026-05-08T12:05:00.000Z"),
        createdAt: new Date("2026-05-08T12:00:00.000Z"),
        updatedAt: new Date("2026-05-08T12:05:00.000Z"),
        recommendationType: "native-bundle-upgrade",
        recommendationStatus: "approved",
        recommendationTitle: "Upgrade bundle",
        recommendationRiskLevel: "high",
        recommendationCompatibilityStatus: "warning",
        recommendationQualityScore: 70,
        recommendationCurrentRuntime: "markdown-only",
        recommendationProposedRuntime: "native-bundle",
        recommendationProposedAction: "upgrade",
        recommendationIsAutoApplySafe: false,
        recommendationJson: {},
        skillSlug: "completed-skill",
        skillName: "Completed Skill",
        skillExecutionMode: "python",
      },
      {
        id: 911,
        recommendationId: 32,
        skillId: 4,
        runType: "apply",
        status: "running",
        summary: "Upgrade task queued",
        errorMessage: null,
        verificationJson: {},
        logsJson: { taskId: "task-running" },
        startedAt: new Date("2026-05-08T12:10:00.000Z"),
        endedAt: null,
        createdAt: new Date("2026-05-08T12:10:00.000Z"),
        updatedAt: new Date("2026-05-08T12:10:00.000Z"),
        recommendationType: "native-bundle-upgrade",
        recommendationStatus: "approved",
        recommendationTitle: "Upgrade bundle",
        recommendationRiskLevel: "high",
        recommendationCompatibilityStatus: "warning",
        recommendationQualityScore: 70,
        recommendationCurrentRuntime: "markdown-only",
        recommendationProposedRuntime: "native-bundle",
        recommendationProposedAction: "upgrade",
        recommendationIsAutoApplySafe: false,
        recommendationJson: {},
        skillSlug: "running-skill",
        skillName: "Running Skill",
        skillExecutionMode: "python",
      },
    ]));

    const caller = skillsRouter.createCaller(createAdminContext());
    const allResult = await caller.getLegacyUpgradeApplyRuns({ state: "all", limit: 100 });

    expect(allResult.counts.total).toBe(1);
    expect(allResult.counts.completed).toBe(1);
    expect(allResult.items).toHaveLength(1);
    expect(allResult.items[0]?.skill?.slug).toBe("running-skill");

    mockGetDb.mockResolvedValue(buildApplyRunsDb([
      {
        id: 910,
        recommendationId: 31,
        skillId: 3,
        runType: "apply",
        status: "completed",
        summary: "Native Agents Python improve complete",
        errorMessage: null,
        verificationJson: {},
        logsJson: { resultMessage: "Files updated" },
        startedAt: new Date("2026-05-08T12:00:00.000Z"),
        endedAt: new Date("2026-05-08T12:05:00.000Z"),
        createdAt: new Date("2026-05-08T12:00:00.000Z"),
        updatedAt: new Date("2026-05-08T12:05:00.000Z"),
        recommendationType: "native-bundle-upgrade",
        recommendationStatus: "approved",
        recommendationTitle: "Upgrade bundle",
        recommendationRiskLevel: "high",
        recommendationCompatibilityStatus: "warning",
        recommendationQualityScore: 70,
        recommendationCurrentRuntime: "markdown-only",
        recommendationProposedRuntime: "native-bundle",
        recommendationProposedAction: "upgrade",
        recommendationIsAutoApplySafe: false,
        recommendationJson: {},
        skillSlug: "completed-skill",
        skillName: "Completed Skill",
        skillExecutionMode: "python",
      },
    ]));

    const completedResult = await caller.getLegacyUpgradeApplyRuns({ state: "completed", limit: 100 });

    expect(completedResult.items).toHaveLength(1);
    expect(completedResult.items[0]?.skill?.slug).toBe("completed-skill");
  });

  it("retries legacy apply runs using the originating recommendation", async () => {
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          {
            id: 801,
            recommendationId: 55,
            runType: "apply",
            status: "failed",
          },
        ]),
      }),
    });

    const caller = skillsRouter.createCaller(createAdminContext());
    const result = await caller.retryLegacyUpgradeApplyRuns({
      runIds: [801],
    });

    expect(result.requestedRunIds).toEqual([801]);
    expect(result.appliedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(mockApplySkillUpgradeRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        recommendationId: 55,
        sourceRunId: 801,
        retryReason: "Retry from apply run 801",
        requestedBy: 42,
      }),
    );
  });

  it("recovers stale running apply runs and queues automatic retries", async () => {
    const staleTime = new Date(Date.now() - 61 * 60 * 1000);
    const db = buildRecoverStaleDb([
      {
        id: 812,
        recommendationId: 56,
        runType: "apply",
        status: "running",
        summary: "Upgrade task queued",
        errorMessage: null,
        logsJson: { taskId: "task-stale-812" },
        startedAt: staleTime,
        createdAt: staleTime,
        updatedAt: staleTime,
      },
    ]);
    mockGetDb.mockResolvedValue(db);

    const caller = skillsRouter.createCaller(createAdminContext());
    const result = await caller.recoverStaleLegacyUpgradeApplyRuns({
      runIds: [812],
      olderThanMinutes: 30,
    });

    expect(result.scannedCount).toBe(1);
    expect(result.staleCount).toBe(1);
    expect(result.recoveredCount).toBe(1);
    expect(result.retriedCount).toBe(1);
    expect(db.update).toHaveBeenCalledTimes(2);
    expect(db.updateSetCalls[0]).toEqual(expect.objectContaining({
      status: "failed",
      errorMessage: "Apply task exceeded the recovery threshold before completion.",
    }));
    expect(db.updateSetCalls[0].logsJson).toEqual(expect.objectContaining({
      failureCode: "stale_apply_task",
      staleTaskRecovered: true,
    }));
    expect(db.updateSetCalls[1]).toEqual(expect.objectContaining({
      status: "failed",
    }));
    expect(mockApplySkillUpgradeRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        recommendationId: 56,
        sourceRunId: 812,
        retryReason: "Automatic retry after stale apply run 812",
        requestedBy: 42,
      }),
    );
  });

  it("normalizes failed no-change apply runs into completed runs", async () => {
    const db = buildNormalizeDb([
      {
        id: 910,
        recommendationId: 77,
        status: "failed",
        summary: "ISC improve complete — no patches generated",
        errorMessage: "Unknown proposal generation error",
        logsJson: {
          taskId: "task-910",
          resultMessage: "ISC improve complete — no patches generated",
          resultError: "Unknown proposal generation error",
        },
        createdAt: new Date("2026-04-22T11:00:00.000Z"),
      },
    ]);
    mockGetDb.mockResolvedValue(db);

    const caller = skillsRouter.createCaller(createAdminContext());
    const result = await caller.normalizeLegacyUpgradeApplyRuns();

    expect(result.scannedCount).toBe(1);
    expect(result.normalizedCount).toBe(1);
    expect(result.normalizedRunIds).toEqual([910]);
    expect(db.update).toHaveBeenCalledTimes(2);
    expect(db.updateSetCalls).toEqual([
      expect.objectContaining({
        status: "approved",
        reviewedBy: 42,
        approvedBy: 42,
      }),
      expect.objectContaining({
        status: "completed",
        errorMessage: null,
        summary: "ISC improve complete — no patches generated",
      }),
    ]);
  });

  it("does not normalize workspace-root failures without no-change evidence", async () => {
    const db = buildNormalizeDb([
      {
        id: 911,
        recommendationId: 78,
        status: "failed",
        summary: "Proposal generation failed",
        errorMessage: "Improvement failed: /repo/apps/web/skills/intelligence-skill-creator/runs/workspaces/demo/123/skills/intelligence-skill-creator",
        logsJson: {
          workspaceRoot: "/repo/apps/web/skills/intelligence-skill-creator/runs/workspaces/demo/123",
          resultError: "Improvement failed: /repo/apps/web/skills/intelligence-skill-creator/runs/workspaces/demo/123/skills/intelligence-skill-creator",
        },
        createdAt: new Date("2026-04-22T11:00:00.000Z"),
      },
    ]);
    mockGetDb.mockResolvedValue(db);

    const caller = skillsRouter.createCaller(createAdminContext());
    const result = await caller.normalizeLegacyUpgradeApplyRuns();

    expect(result.scannedCount).toBe(1);
    expect(result.normalizedCount).toBe(0);
    expect(result.normalizedRunIds).toEqual([]);
    expect(db.update).not.toHaveBeenCalled();
  });
});
