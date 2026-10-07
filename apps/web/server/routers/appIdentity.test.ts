import { describe, expect, it, vi } from "vitest";
import { createAppIdentityRouter } from "./appIdentity";

function setup(user: any = { id: 1, currentTenantId: "tenant-account" }) {
  const service = {
    resolveAppRouteForTenant: vi.fn(async () => ({
      appId: "app_research",
      publicAppId: "public_research",
      tenantId: "tenant-account",
    })),
    resolveActiveAppByPublicId: vi.fn(async () => ({
      appId: "app_research",
      publicAppId: "public_research",
      tenantId: "tenant-account",
    })),
  };
  const caller = createAppIdentityRouter(service).createCaller({
    user,
    tenantId: "tenant-from-host",
  } as any);
  return { caller, service };
}

describe("appIdentity runtime router", () => {
  it("uses authenticated account tenant rather than host or caller input", async () => {
    const { caller, service } = setup();
    await expect(caller.resolveRoute({ kind: "slug", value: "research-notes" })).resolves.toMatchObject({
      appId: "app_research",
      tenantId: "tenant-account",
    });
    expect(service.resolveAppRouteForTenant).toHaveBeenCalledWith({
      tenantId: "tenant-account",
      kind: "slug",
      value: "research-notes",
    });
  });

  it("requires authentication and an account tenant", async () => {
    const anonymous = createAppIdentityRouter().createCaller({ user: null, tenantId: "tenant-host" } as any);
    await expect(anonymous.resolveRoute({ kind: "slug", value: "research-notes" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const noTenant = setup({ id: 2, currentTenantId: null }).caller;
    await expect(noTenant.resolveRoute({ kind: "slug", value: "research-notes" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects extra tenant authority in input", async () => {
    const { caller, service } = setup();
    await expect(caller.resolveRoute({ kind: "slug", value: "research-notes", tenantId: "tenant-victim" } as any))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(service.resolveAppRouteForTenant).not.toHaveBeenCalled();
  });

  it("resolves the canonical public App identifier within authenticated tenant scope", async () => {
    const { caller, service } = setup();
    await expect(caller.resolvePublicApp({ publicAppId: "public_research" })).resolves.toMatchObject({
      appId: "app_research",
      tenantId: "tenant-account",
    });
    expect(service.resolveActiveAppByPublicId).toHaveBeenCalledWith({
      tenantId: "tenant-account",
      publicAppId: "public_research",
    });
  });
});
