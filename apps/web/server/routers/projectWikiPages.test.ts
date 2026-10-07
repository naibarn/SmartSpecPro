import { describe, expect, it, vi } from "vitest";
import { createProjectWikiPagesRouter } from "./projectWikiPages";

function setup(user: any = { id: 7, currentTenantId: "tenant-account" }) {
  const service = {
    listProjectWikiProjects: vi.fn(async (input: any) => [input]),
    listProjectWikiPages: vi.fn(async (input: any) => [input]),
    getProjectWikiPage: vi.fn(async (input: any) => input),
    createProjectWikiPage: vi.fn(async (input: any) => input),
    updateProjectWikiPage: vi.fn(async (input: any) => input),
    archiveProjectWikiPage: vi.fn(async (input: any) => input),
  };
  return {
    service,
    caller: createProjectWikiPagesRouter(service as any).createCaller({ user, req: { ip: "127.0.0.1" } } as any),
  };
}

describe("projectWikiPages router", () => {
  it("derives tenant and principal from authenticated context for headless actions", async () => {
    const { caller, service } = setup();
    await caller.createPage({ appId: "app_project_wiki_pages", projectId: "project-1", title: "Home", path: "home", content: "Welcome" });
    expect(service.createProjectWikiPage).toHaveBeenCalledWith({
      tenantId: "tenant-account", principalId: "user:7", appId: "app_project_wiki_pages", projectId: "project-1", title: "Home", path: "home", content: "Welcome",
    });
  });

  it("rejects missing tenant context and caller-selected tenant identity", async () => {
    const noTenant = setup({ id: 8, currentTenantId: null }).caller;
    await expect(noTenant.listPages({ appId: "app_project_wiki_pages", projectId: "project-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const { caller, service } = setup();
    await expect(caller.createPage({ appId: "app_project_wiki_pages", projectId: "project-1", title: "Home", path: "home", content: "", tenantId: "tenant-victim" } as any))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(service.createProjectWikiPage).not.toHaveBeenCalled();
  });
});
