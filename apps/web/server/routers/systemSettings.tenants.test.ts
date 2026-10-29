import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("../db", () => ({ getDb: getDbMock }));
vi.mock("../_core/tokens", () => ({ signBearerToken: vi.fn() }));

import { systemSettingsRouter } from "./systemSettings";

describe("admin tenant selector inventory", () => {
  beforeEach(() => getDbMock.mockReset());

  it("classifies retained fixtures and system tenants without hiding or deleting inventory", async () => {
    const from = vi.fn().mockResolvedValue([
      { id: "tenant-ZCSKEM9s", slug: "smart-ai-hub", name: "Smart AI Hub", domain: "smartaihub.app", isActive: true, status: "ACTIVE" },
      { id: "tenant-codex-a0970983e432", slug: "codex-uat-a0970983e432", name: "Renamed fixture", domain: null, isActive: true, status: "ACTIVE" },
      { id: "tenant-codex-r-a0970983e432", slug: "codex-uat-r-a0970983e432", name: "Codex UAT Isolated Tenant", domain: null, isActive: true, status: "ACTIVE" },
      { id: "__system__", slug: "__system__", name: "System", domain: null, isActive: true, status: "ACTIVE" },
      { id: "disabled", slug: "disabled", name: "Disabled", domain: null, isActive: false, status: "ACTIVE" },
      { id: "suspended", slug: "suspended", name: "Suspended", domain: null, isActive: true, status: "SUSPENDED" },
      { id: "business", slug: "codex-uat-business", name: "Codex UAT Services", domain: "example.com", isActive: true, status: "ACTIVE" },
      { id: "tenant-codex-customer", slug: "customer", name: "Customer", domain: null, isActive: true, status: "ACTIVE" },
    ]);
    const select = vi.fn(() => ({ from }));
    getDbMock.mockResolvedValue({ select });
    const caller = systemSettingsRouter.createCaller({ user: { id: 1, role: "admin" } } as any);

    const result = await caller.listTenants();
    expect(result.map(row => [row.id, row.selectorKind])).toEqual([
      ["tenant-ZCSKEM9s", "operational"],
      ["tenant-codex-a0970983e432", "test"],
      ["tenant-codex-r-a0970983e432", "test"],
      ["__system__", "system"],
      ["disabled", "inactive"],
      ["suspended", "inactive"],
      ["business", "operational"],
      ["tenant-codex-customer", "operational"],
    ]);
    expect(result[0]).toMatchObject({ name: "Smart AI Hub", domain: "smartaihub.app" });
    expect(result[0]).not.toHaveProperty("slug");
    expect(select).toHaveBeenCalledOnce();
  });

  it("keeps the inventory admin-only", async () => {
    for (const user of [null, { id: 2, role: "user" }, { id: 3, role: "domain_admin" }]) {
      const caller = systemSettingsRouter.createCaller({ user } as any);
      await expect(caller.listTenants()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("reports an unavailable database instead of disguising it as an empty tenant inventory", async () => {
    getDbMock.mockResolvedValue(null);
    const caller = systemSettingsRouter.createCaller({ user: { id: 1, role: "admin" } } as any);
    await expect(caller.listTenants()).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Tenant inventory is temporarily unavailable" });
  });
});
