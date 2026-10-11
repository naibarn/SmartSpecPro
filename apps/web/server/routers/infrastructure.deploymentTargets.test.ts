import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("../db", () => ({ getDb: getDbMock }));

import { infrastructureRouter } from "./infrastructure";

const tenantId = "8de1a509-6177-49b7-b57d-5d3b5228d75f";

describe("infrastructure deployment target project selector", () => {
  beforeEach(() => getDbMock.mockReset());

  it("lists active canonical project identities only for an exact admin", async () => {
    const projects = [{ projectId: "2fe8a309-8be6-4370-9813-8fb9cc4645a0", title: "Wiki", projectType: "workspace" }];
    const orderBy = vi.fn().mockResolvedValue(projects);
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    getDbMock.mockResolvedValue({ select: vi.fn(() => ({ from })) });
    const admin = infrastructureRouter.createCaller({ user: { id: 1, role: "admin" } } as any);

    await expect(admin.listDeploymentTargetProjects({ tenantId })).resolves.toEqual(projects);
    expect(from).toHaveBeenCalled();
    expect(where).toHaveBeenCalled();
    expect(orderBy).toHaveBeenCalled();

    const systemAgent = infrastructureRouter.createCaller({ user: { id: 2, role: "system_agent" } } as any);
    await expect(systemAgent.listDeploymentTargetProjects({ tenantId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("enforces the UUID tenant contract before reading project identities", async () => {
    const admin = infrastructureRouter.createCaller({ user: { id: 1, role: "admin" } } as any);
    await expect(admin.listDeploymentTargetProjects({ tenantId: "tenant-demo" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("returns scoped Project Wiki preflight facts and keeps Cloudflare Worker targets incompatible", async () => {
    const targets = [{ enabled: true, workerRef: "worker:wiki", containerApplicationRef: null }];
    const where = vi.fn().mockResolvedValue(targets);
    const from = vi.fn(() => ({ where }));
    getDbMock.mockResolvedValue({ select: vi.fn(() => ({ from })) });
    const admin = infrastructureRouter.createCaller({ user: { id: 1, role: "admin" } } as any);

    const result = await admin.getProjectWikiHostedRoutePreflight({ tenantId, projectId: "wiki-project" });

    expect(result).toMatchObject({
      appId: "app_project_wiki_pages",
      hostRequirement: "smartspec-web",
      stagingTarget: "INCOMPATIBLE",
      dedicatedDatabase: "REQUIRED",
      trustedEvidenceVerifier: "REQUIRED",
      targetInventory: { source: "provider_deployment_targets", matchingRows: 1, enabledRows: 1, shapes: ["worker"] },
      outcomes: expect.arrayContaining(["TARGET_INCOMPATIBLE", "DATABASE_AUTHORITY_REQUIRED", "TRUSTED_EVIDENCE_REQUIRED"]),
    });
    expect(where).toHaveBeenCalled();

    const systemAgent = infrastructureRouter.createCaller({ user: { id: 2, role: "system_agent" } } as any);
    await expect(systemAgent.getProjectWikiHostedRoutePreflight({ tenantId, projectId: "wiki-project" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("leaves an existing Container target unresolved until host compatibility is verified", async () => {
    const targets = [{ enabled: true, workerRef: null, containerApplicationRef: "container:wiki" }];
    const where = vi.fn().mockResolvedValue(targets);
    const from = vi.fn(() => ({ where }));
    getDbMock.mockResolvedValue({ select: vi.fn(() => ({ from })) });
    const admin = infrastructureRouter.createCaller({ user: { id: 1, role: "admin" } } as any);

    const result = await admin.getProjectWikiHostedRoutePreflight({ tenantId, projectId: "wiki-project" });

    expect(result.stagingTarget).toBe("REQUIRED");
    expect(result.targetInventory).toMatchObject({ shapes: ["container"], containerHostCompatibility: "UNKNOWN" });
    expect(result.outcomes).toContain("TARGET_AUTHORITY_REQUIRED");
    expect(result.outcomes).not.toContain("READY_FOR_AUTHORIZED_STAGING");
  });
});
