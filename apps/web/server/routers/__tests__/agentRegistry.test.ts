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
    adminProcedure: createProcedure(),
    domainAdminProcedure: createProcedure(),
    middleware: (fn: any) => fn,
  };
});

const serviceMocks = vi.hoisted(() => ({
  createAgentRegistry: vi.fn(),
  publishAgentVersion: vi.fn(),
  resolveAgentVersion: vi.fn(),
  recordAgentOutcomeMemory: vi.fn(),
  freezeAgentVersion: vi.fn(),
  rollbackAgentVersion: vi.fn(),
  listAgentRegistries: vi.fn(),
  getAgentRegistry: vi.fn(),
}));

vi.mock("../../services/agentRegistryService", () => serviceMocks);

import { agentRegistryRouter } from "../agentRegistry";

describe("agentRegistryRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates registries through the service boundary", async () => {
    serviceMocks.createAgentRegistry.mockResolvedValue({ id: "agr_1", registryKey: "planner.default" });

    const result = await agentRegistryRouter.createRegistry({
      input: {
        tenantId: "tenant-1",
        registryKey: "planner.default",
        agentKind: "planner",
        title: "Planner",
        description: "",
        owningTeamId: "team-1",
        modelFamilies: ["gpt-5.4"],
        metadata: {},
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 7, role: "admin" },
      },
    } as any);

    expect(serviceMocks.createAgentRegistry).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      registryKey: "planner.default",
      owningUserId: 7,
    }));
    expect(result).toEqual({ id: "agr_1", registryKey: "planner.default" });
  });

  it("resolves versions through the service boundary", async () => {
    serviceMocks.resolveAgentVersion.mockResolvedValue({
      registryId: "agr_1",
      registryKey: "planner.default",
      selectedVersionId: "agv_1",
    });

    const result = await agentRegistryRouter.resolve({
      input: {
        tenantId: "tenant-1",
        registryId: "agr_1",
        requestedToolClasses: ["read"],
        requestedActionClasses: [],
        workloadClass: "weekly-planning",
        allowDraftVersions: false,
        allowEvidencePreference: true,
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 7, role: "user" },
      },
    } as any);

    expect(serviceMocks.resolveAgentVersion).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      registryId: "agr_1",
      allowEvidencePreference: true,
    }));
    expect(result.selectedVersionId).toBe("agv_1");
  });
});
