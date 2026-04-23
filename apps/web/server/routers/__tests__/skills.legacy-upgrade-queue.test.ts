import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";

const { mockGetDb } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../services/skillStudioService", () => ({
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

function buildDb(rows: any[], skillRows: any[]) {
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
    orderBy: vi.fn().mockResolvedValue([]),
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
});
