import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
      use: () => proc,
    };
    return proc;
  };

  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
  };
});

vi.mock("../../_core/rateLimitedProcedure", () => ({
  createRateLimitMiddleware: vi.fn(() => async ({ next }: { next: () => Promise<unknown> }) => next()),
}));

const { mockResolveTenantIdVarchar } = vi.hoisted(() => ({
  mockResolveTenantIdVarchar: vi.fn(() => "tenant-1"),
}));

vi.mock("../../services/tenantContext", () => ({
  resolveTenantIdVarchar: mockResolveTenantIdVarchar,
}));

const {
  mockCreateTeam,
  mockCreateFromTemplate,
  mockCreateTeamFromBlueprint,
  mockListTeamTemplates,
  mockListTeams,
  mockGetTeam,
  mockArchiveTeam,
  mockAddTeamMember,
  mockUpdateTeamMember,
} = vi.hoisted(() => ({
  mockCreateTeam: vi.fn(),
  mockCreateFromTemplate: vi.fn(),
  mockCreateTeamFromBlueprint: vi.fn(),
  mockListTeamTemplates: vi.fn(),
  mockListTeams: vi.fn(),
  mockGetTeam: vi.fn(),
  mockArchiveTeam: vi.fn(),
  mockAddTeamMember: vi.fn(),
  mockUpdateTeamMember: vi.fn(),
}));

vi.mock("../../services/teamService", () => ({
  createTeam: mockCreateTeam,
  createFromTemplate: mockCreateFromTemplate,
  createTeamFromBlueprint: mockCreateTeamFromBlueprint,
  listTeamTemplates: mockListTeamTemplates,
  listTeams: mockListTeams,
  getTeam: mockGetTeam,
  archiveTeam: mockArchiveTeam,
  addTeamMember: mockAddTeamMember,
  updateTeamMember: mockUpdateTeamMember,
}));

const { mockAuditLog } = vi.hoisted(() => ({
  mockAuditLog: vi.fn(),
}));

vi.mock("../../services/auditLogger", () => ({
  auditLogger: {
    log: mockAuditLog,
  },
}));

import { teamRouter } from "../team";

describe("teamRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTenantIdVarchar.mockReturnValue("tenant-1");
  });

  it("createFromBlueprint delegates to the service and emits an audit event", async () => {
    mockCreateTeamFromBlueprint.mockResolvedValue({
      teamId: "team-1",
      agencyId: "agency-1",
      members: [],
    });

    const result = await teamRouter.createFromBlueprint({
      input: {
        blueprintId: "creative-content-studio",
        name: "Creative Desk",
        description: "Daily social content",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mockCreateTeamFromBlueprint).toHaveBeenCalledWith(
      "creative-content-studio",
      "tenant-1",
      42,
      {
        name: "Creative Desk",
        description: "Daily social content",
        category: undefined,
      },
    );
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "team_blueprint_created",
      userId: 42,
      metadata: expect.objectContaining({
        teamId: "team-1",
        blueprintId: "creative-content-studio",
        tenantId: "tenant-1",
      }),
    }));
    expect(result.teamId).toBe("team-1");
  });

  it("cloneFromTemplate delegates to compatibility flow and emits an audit event", async () => {
    mockCreateFromTemplate.mockResolvedValue({
      teamId: "team-legacy",
      agencyId: "agency-legacy",
      members: [],
    });

    const result = await teamRouter.cloneFromTemplate({
      input: {
        templateId: "tmpl-team-content-creation",
        name: "Legacy Content Team",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mockCreateFromTemplate).toHaveBeenCalledWith(
      "tmpl-team-content-creation",
      "tenant-1",
      42,
      {
        name: "Legacy Content Team",
        description: undefined,
      },
    );
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "team_template_cloned",
      userId: 42,
      metadata: expect.objectContaining({
        teamId: "team-legacy",
        templateId: "tmpl-team-content-creation",
      }),
    }));
    expect(result.teamId).toBe("team-legacy");
  });

  it("listBlueprints returns the shared blueprint catalog", async () => {
    const result = await teamRouter.listBlueprints({
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(Array.isArray(result)).toBe(true);
    expect(result.some((blueprint: any) => blueprint.id === "creative-content-studio")).toBe(true);
  });
});
