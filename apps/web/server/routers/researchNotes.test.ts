import { describe, expect, it, vi } from "vitest";
import { createResearchNotesRouter } from "./researchNotes";

function setup(user: any = { id: 7, currentTenantId: "tenant-account" }, overrides: Record<string, unknown> = {}) {
  const service = {
    createResearchProject: vi.fn(async (input: any) => input),
    listResearchProjects: vi.fn(async (input: any) => [input]),
    listResearchNotes: vi.fn(async (input: any) => [input]),
    createResearchNote: vi.fn(async (input: any) => input),
    updateResearchNote: vi.fn(async (input: any) => input),
    archiveResearchNote: vi.fn(async (input: any) => input),
    ...overrides,
  };
  return {
    service,
    caller: createResearchNotesRouter(service as any).createCaller({
      user,
      tenantId: "tenant-from-host",
      req: { ip: "127.0.0.1" },
    } as any),
  };
}

describe("researchNotes router", () => {
  it("uses authenticated account tenant and principal for project and note operations", async () => {
    const { caller, service } = setup();
    await caller.createProject({ appId: "app-1", title: "Launch research" });
    await caller.createNote({ appId: "app-1", projectId: "project-1", title: "Source", content: "Notes" });
    expect(service.createResearchProject).toHaveBeenCalledWith({
      tenantId: "tenant-account",
      principalId: "user:7",
      appId: "app-1",
      title: "Launch research",
    });
    expect(service.createResearchNote).toHaveBeenCalledWith({
      tenantId: "tenant-account",
      principalId: "user:7",
      appId: "app-1",
      projectId: "project-1",
      title: "Source",
      content: "Notes",
    });
  });

  it("requires authenticated tenant context", async () => {
    const anonymous = createResearchNotesRouter().createCaller({ user: null, tenantId: "host-tenant" } as any);
    await expect(anonymous.listProjects({ appId: "app-1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const noTenant = setup({ id: 8, currentTenantId: null }).caller;
    await expect(noTenant.listProjects({ appId: "app-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects client-supplied tenant authority and unexpected fields", async () => {
    const { caller, service } = setup();
    await expect(caller.createProject({ appId: "app-1", title: "A", tenantId: "victim" } as any))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(service.createResearchProject).not.toHaveBeenCalled();
  });
});
