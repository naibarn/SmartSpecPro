import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getDbMock,
  analyzeSkillForMaintenanceMock,
  persistSkillMaintenanceAnalysisMock,
} = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  analyzeSkillForMaintenanceMock: vi.fn(),
  persistSkillMaintenanceAnalysisMock: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: getDbMock,
}));

vi.mock("../skillMaintenanceAnalyzer", () => ({
  analyzeSkillForMaintenance: analyzeSkillForMaintenanceMock,
}));

vi.mock("../skillUpgradePlanner", () => ({
  persistSkillMaintenanceAnalysis: persistSkillMaintenanceAnalysisMock,
}));

import {
  executeSkillMaintenanceSweep,
  resolveMaintenanceScheduleInput,
  resolveMaintenanceSweepInput,
  runDueSkillMaintenanceSchedules,
} from "../skillMaintenanceScheduler";

function buildSweepDb(skillsRows: any[]) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(skillsRows),
      })),
    })),
  };
}

describe("skillMaintenanceScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes recurring schedules and computes next run", () => {
    const resolved = resolveMaintenanceScheduleInput({
      name: "Nightly sweep",
      cronExpression: "0 2 * * *",
      scopeType: "genjs_candidates",
      scopeJson: { limit: 25, category: "slide_generation" },
      status: "active",
    });

    expect(resolved.cronExpression).toBe("0 2 * * *");
    expect(resolved.scopeType).toBe("genjs_candidates");
    expect(resolved.nextRunAt).toBeInstanceOf(Date);
  });

  it("derives sweep filters from a schedule scope", () => {
    const filters = resolveMaintenanceSweepInput({
      scopeType: "genjs_candidates",
      scopeJson: {
        category: "slide_generation",
        executionMode: "sandbox-command",
        limit: 10,
      },
    } as any);

    expect(filters).toEqual({
      category: "slide_generation",
      executionMode: "sandbox-command",
      genjsCandidatesOnly: true,
      limit: 10,
    });
  });

  it("filters non-GenJS candidates out of a candidate-only sweep", async () => {
    const db = buildSweepDb([
      { id: 1, slug: "a", name: "A", description: null, folderPath: "/a", executionMode: "sandbox-command", configJson: {}, sandboxProfileSlug: null, requiresNetwork: null, requiresBrowser: null },
      { id: 2, slug: "b", name: "B", description: null, folderPath: "/b", executionMode: "sandbox-command", configJson: {}, sandboxProfileSlug: null, requiresNetwork: null, requiresBrowser: null },
    ]);

    analyzeSkillForMaintenanceMock
      .mockReturnValueOnce({ isGenjsCandidate: false })
      .mockReturnValueOnce({ isGenjsCandidate: true });
    persistSkillMaintenanceAnalysisMock.mockResolvedValue({
      analysis: { qualityScore: 88, isGenjsCandidate: true },
      recommendations: [{ id: 1 }],
    });

    const result = await executeSkillMaintenanceSweep({
      db,
      requestedBy: 5,
      filters: {
        genjsCandidatesOnly: true,
        limit: 20,
      },
    });

    expect(result.scannedCount).toBe(2);
    expect(result.analyzedCount).toBe(1);
    expect(result.results[0]?.skillSlug).toBe("b");
  });

  it("runs due schedules from the scheduler loop", async () => {
    const schedule = {
      id: 91,
      tenantId: "tenant-1",
      createdBy: 7,
      status: "active",
      cronExpression: "0 2 * * *",
      nextRunAt: new Date(Date.now() - 60_000),
      scopeType: "all_skills",
      scopeJson: { limit: 10 },
      lockExpiresAt: null,
    };

    const releaseWhereMock = vi.fn().mockResolvedValue(undefined);
    analyzeSkillForMaintenanceMock.mockReturnValue({ isGenjsCandidate: true });
    persistSkillMaintenanceAnalysisMock.mockResolvedValue({
      analysis: { qualityScore: 91, isGenjsCandidate: true },
      recommendations: [{ id: 1 }],
    });

    const skillSweepDb = {
      select: vi.fn()
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockResolvedValue([schedule]),
          })),
        })
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue([
              {
                id: 5,
                slug: "storyboard",
                name: "Storyboard",
                description: null,
                folderPath: "/storyboard",
                executionMode: "sandbox-command",
                configJson: {},
                sandboxProfileSlug: null,
                requiresNetwork: null,
                requiresBrowser: null,
                tenantId: "tenant-1",
              },
            ]),
          })),
        }),
      update: vi.fn()
        .mockImplementationOnce(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([{ ...schedule, lockToken: "claimed-token" }]),
            })),
          })),
        }))
        .mockImplementationOnce(() => ({
          set: vi.fn(() => ({
            where: releaseWhereMock,
          })),
        })),
    };

    getDbMock.mockResolvedValue(skillSweepDb);

    const result = await runDueSkillMaintenanceSchedules(new Date());

    expect(result.scannedSchedules).toBe(1);
    expect(result.executedSchedules).toBe(1);
    expect(releaseWhereMock).toHaveBeenCalled();
  });
});
