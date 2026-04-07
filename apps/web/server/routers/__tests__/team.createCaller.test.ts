import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateTeamFromBlueprint,
  mockCreateFromTemplate,
  mockAuditLog,
} = vi.hoisted(() => ({
  mockCreateTeamFromBlueprint: vi.fn(),
  mockCreateFromTemplate: vi.fn(),
  mockAuditLog: vi.fn(),
}));

vi.mock("../../services/teamService", () => ({
  createTeam: vi.fn(),
  createFromTemplate: mockCreateFromTemplate,
  createTeamFromBlueprint: mockCreateTeamFromBlueprint,
  listTeamTemplates: vi.fn().mockResolvedValue([]),
  listBindableWorkers: vi.fn().mockResolvedValue([]),
  listTeams: vi.fn().mockResolvedValue([]),
  getTeam: vi.fn().mockResolvedValue(null),
  archiveTeam: vi.fn().mockResolvedValue(undefined),
  addTeamMember: vi.fn(),
  updateTeamMember: vi.fn(),
}));

vi.mock("../../services/workerBudgetService", () => ({
  getWorkerBudgetSettings: vi.fn(),
  updateWorkerBudgetSettings: vi.fn(),
}));

vi.mock("../../services/auditLogger", () => ({
  auditLogger: {
    log: mockAuditLog,
    readEntries: vi.fn().mockResolvedValue([]),
    flush: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  },
  initAuditLogger: vi.fn(),
}));

import { appRouter } from "../../routers";

function createProtectedContext() {
  return {
    user: {
      id: 42,
      openId: "user-42",
      email: "user@example.com",
      name: "Blueprint User",
      loginMethod: "email",
      role: "user",
      currentTenantId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      ip: "127.0.0.1",
      protocol: "https",
      headers: {},
    },
    res: {
      clearCookie: vi.fn(),
    },
    userToken: null,
    tenantId: "tenant-1",
    publicUrl: "https://tenant.example.com",
  } as any;
}

describe("team router createCaller integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createFromBlueprint resolves through the app router caller and emits an audit event", async () => {
    mockCreateTeamFromBlueprint.mockResolvedValue({
      teamId: "team-creative-1",
      agencyId: "agency-creative-1",
      members: [],
    });

    const caller = appRouter.createCaller(createProtectedContext());

    const result = await caller.team.createFromBlueprint({
      blueprintId: "creative-content-studio",
      name: "Creative Content Studio",
      description: "Daily creative pipeline",
      category: "creative",
    });

    expect(result).toEqual(expect.objectContaining({
      teamId: "team-creative-1",
      agencyId: "agency-creative-1",
    }));
    expect(mockCreateTeamFromBlueprint).toHaveBeenCalledWith(
      "creative-content-studio",
      "tenant-1",
      42,
      {
        name: "Creative Content Studio",
        description: "Daily creative pipeline",
        category: "creative",
      },
    );
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "team_blueprint_created",
      userId: 42,
      metadata: expect.objectContaining({
        teamId: "team-creative-1",
        blueprintId: "creative-content-studio",
        tenantId: "tenant-1",
      }),
    }));
  });

  it("cloneFromTemplate resolves through compatibility flow and emits an audit event", async () => {
    mockCreateFromTemplate.mockResolvedValue({
      teamId: "team-legacy-1",
      agencyId: "agency-legacy-1",
      members: [],
    });

    const caller = appRouter.createCaller(createProtectedContext());

    const result = await caller.team.cloneFromTemplate({
      templateId: "tmpl-team-content-creation",
      name: "Legacy Content Team",
      description: "Migrated preset",
    });

    expect(result).toEqual(expect.objectContaining({
      teamId: "team-legacy-1",
    }));
    expect(mockCreateFromTemplate).toHaveBeenCalledWith(
      "tmpl-team-content-creation",
      "tenant-1",
      42,
      {
        name: "Legacy Content Team",
        description: "Migrated preset",
      },
    );
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "team_template_cloned",
      userId: 42,
      metadata: expect.objectContaining({
        teamId: "team-legacy-1",
        templateId: "tmpl-team-content-creation",
        tenantId: "tenant-1",
      }),
    }));
  });
});
