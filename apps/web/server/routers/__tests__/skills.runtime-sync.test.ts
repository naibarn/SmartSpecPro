import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";

const {
  mockAutoSyncSkillsFromFolder,
  mockGetAvailableSkills,
  mockGetAvailableSkillsAsync,
  mockGetUserVisibleSkills,
  mockGetDb,
  mockRefreshSkillCache,
} = vi.hoisted(() => ({
  mockAutoSyncSkillsFromFolder: vi.fn(),
  mockGetAvailableSkills: vi.fn(),
  mockGetAvailableSkillsAsync: vi.fn(),
  mockGetUserVisibleSkills: vi.fn(),
  mockGetDb: vi.fn(),
  mockRefreshSkillCache: vi.fn(),
}));

vi.mock("../../db", () => ({
  db: null,
  getDb: mockGetDb,
}));

vi.mock("../../services/skillRegistry", () => ({
  autoSyncSkillsFromFolder: mockAutoSyncSkillsFromFolder,
  getAvailableSkills: mockGetAvailableSkills,
  getAvailableSkillsAsync: mockGetAvailableSkillsAsync,
  getSkillById: vi.fn(),
  getSkillByIdOrType: vi.fn(),
  getDefaultEnabledSkills: vi.fn(),
  refreshSkillCache: mockRefreshSkillCache,
  syncSingleSkillIfChanged: vi.fn(),
}));

vi.mock("../../services/userSkillService", () => ({
  getUserVisibleSkills: mockGetUserVisibleSkills,
  getAllSkillsForUser: vi.fn(),
  setSkillVisibility: vi.fn(),
  batchSetVisibility: vi.fn(),
  setAutoTrigger: vi.fn(),
}));

import { skillsRouter } from "../skills";

function createProtectedContext(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "user-7",
      email: "user7@example.com",
      name: "User Seven",
      loginMethod: "email",
      role: "user",
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

function createAdminContext(): TrpcContext {
  return {
    ...createProtectedContext(),
    user: {
      ...createProtectedContext().user!,
      role: "admin",
    },
  };
}

describe("skills router runtime sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAutoSyncSkillsFromFolder.mockResolvedValue({ synced: [], skipped: [], errors: [] });
    mockGetAvailableSkills.mockReturnValue([]);
    mockGetAvailableSkillsAsync.mockResolvedValue([]);
    mockGetUserVisibleSkills.mockResolvedValue({ skills: [], total: 0 });
    mockGetDb.mockReset();
    mockRefreshSkillCache.mockReset();
  });

  it("auto-syncs skill metadata before returning user-visible skills", async () => {
    const caller = skillsRouter.createCaller(createProtectedContext());

    await caller.getUserVisibleSkills({ limit: 10, offset: 0 });

    expect(mockAutoSyncSkillsFromFolder).toHaveBeenCalledTimes(1);
    expect(mockGetUserVisibleSkills).toHaveBeenCalledWith(7, { limit: 10, offset: 0 });
  });

  it("uses the async skill registry for list queries so cold starts still return skills", async () => {
    mockGetAvailableSkillsAsync.mockResolvedValue([
      {
        id: "image_prompt_engineer",
        name: "Image Prompt Engineer",
        description: "Create image prompts",
        icon: "sparkles",
        type: "prompt-enhancement",
        creditMultiplier: 1,
        enabledByDefault: true,
        priority: 50,
        executionMode: "enhance-prompt",
      },
    ]);

    const caller = skillsRouter.createCaller(createProtectedContext());
    const result = await caller.list({ enabledOnly: true });

    expect(mockGetAvailableSkillsAsync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      expect.objectContaining({
        id: "image_prompt_engineer",
        executionMode: "enhance-prompt",
      }),
    ]);
  });

  it("updates mixed pricing rows in one admin transaction", async () => {
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 10 }, { id: 11 }]),
    };
    const tx = {
      update: vi.fn().mockReturnValue(updateChain),
    };
    const db = {
      transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    mockGetDb.mockResolvedValue(db);

    const caller = skillsRouter.createCaller(createAdminContext());
    const result = await caller.bulkUpdatePricing({
      updates: [
        { id: 10, tenantCreditCost: 4 },
        { id: 11, skillOwnerCreditCost: 3 },
      ],
    });

    expect(result).toEqual({ requestedCount: 2, updatedCount: 2, missingSkillIds: [] });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(updateChain.set).toHaveBeenCalledTimes(1);
    expect(mockRefreshSkillCache).toHaveBeenCalledTimes(1);
  });

  it("rejects a bulk pricing update with no pricing fields", async () => {
    const caller = skillsRouter.createCaller(createAdminContext());

    await expect(caller.bulkUpdatePricing({ updates: [{ id: 10 }] })).rejects.toThrow();
    expect(mockGetDb).not.toHaveBeenCalled();
  });
});
