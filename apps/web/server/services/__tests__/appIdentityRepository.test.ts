import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("../../db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => {
        const queryBuilder = {
          where: () => ({
            limit: async () => query.rows,
          }),
          innerJoin: () => ({
            where: () => ({
              limit: async () => query.rows,
            }),
          }),
        };
        return queryBuilder;
      },
    }),
  }),
}));

import { canViewMiniApp, resolveAppRouteForTenant, resolveMiniAppForViewer } from "../appIdentityRepository";

const activeRow = {
  aliasId: "alias_research",
  aliasTenantId: "tenant-a",
  aliasAppId: "app_research",
  kind: "slug",
  value: "research-notes",
  status: "ACTIVE",
  appId: "app_research",
  publicAppId: "public_research",
  appTenantId: "tenant-a",
  publisherId: "publisher-a",
  lifecycle: "active",
  canonicalProductId: "product_research",
  policyRefs: [],
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  parentAppId: null,
};

describe("resolveAppRouteForTenant", () => {
  beforeEach(() => {
    query.rows = [activeRow];
  });

  it("resolves an active tenant-bound alias without changing stable identity", async () => {
    await expect(resolveAppRouteForTenant({
      tenantId: "tenant-a",
      kind: "slug",
      value: " Research-Notes ",
    })).resolves.toEqual({
      appId: "app_research",
      publicAppId: "public_research",
      tenantId: "tenant-a",
    });
  });

  it("fails closed when the App is suspended", async () => {
    query.rows = [{ ...activeRow, lifecycle: "suspended" }];
    await expect(resolveAppRouteForTenant({
      tenantId: "tenant-a",
      kind: "slug",
      value: "research-notes",
    })).resolves.toBeNull();
  });

  it("fails closed when alias and App tenant ownership do not match", async () => {
    query.rows = [{ ...activeRow, appTenantId: "tenant-b" }];
    await expect(resolveAppRouteForTenant({
      tenantId: "tenant-a",
      kind: "slug",
      value: "research-notes",
    })).resolves.toBeNull();
  });
});

describe("Mini App visibility policy", () => {
  const privateDraft = {
    tenantId: "tenant-a",
    ownerUserId: 7,
    visibility: "private",
    lifecycle: "draft",
  };

  it("allows only the authenticated owner in the owning tenant to view private development previews", () => {
    expect(canViewMiniApp(privateDraft, { tenantId: "tenant-a", userId: 7 })).toBe(true);
    expect(canViewMiniApp(privateDraft, { tenantId: "tenant-a", userId: 8 })).toBe(false);
    expect(canViewMiniApp(privateDraft, { tenantId: "tenant-b", userId: 7 })).toBe(false);
    expect(canViewMiniApp(privateDraft, { tenantId: null, userId: null })).toBe(false);
  });

  it("allows anonymous access only to active public apps and immediately revokes on unpublish", () => {
    expect(canViewMiniApp({ ...privateDraft, visibility: "public", lifecycle: "active" }, {})).toBe(true);
    expect(canViewMiniApp({ ...privateDraft, visibility: "private", lifecycle: "active" }, {})).toBe(false);
    expect(canViewMiniApp({ ...privateDraft, visibility: "public", lifecycle: "draft" }, {})).toBe(false);
  });

  it("fails closed for same-tenant non-owners and cross-tenant viewers in the resolver", async () => {
    query.rows = [{
      appId: "app_private",
      publicAppId: "mini_private",
      tenantId: "tenant-a",
      ownerUserId: 7,
      visibility: "private",
      deploymentVersion: 1,
      lastKnownGoodArtifactRef: "r2://preview/app_private/v1/index.html",
      lifecycle: "active",
    }];
    await expect(resolveMiniAppForViewer({ appId: "app_private", tenantId: "tenant-a", userId: 7 }))
      .resolves.toMatchObject({ appId: "app_private" });
    await expect(resolveMiniAppForViewer({ appId: "app_private", tenantId: "tenant-a", userId: 8 })).resolves.toBeNull();
    await expect(resolveMiniAppForViewer({ appId: "app_private", tenantId: "tenant-b", userId: 7 })).resolves.toBeNull();
    await expect(resolveMiniAppForViewer({ appId: "app_private" })).resolves.toBeNull();
  });
});
