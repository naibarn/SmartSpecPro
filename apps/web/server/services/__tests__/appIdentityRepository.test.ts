import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("../../db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: async () => query.rows,
          }),
        }),
      }),
    }),
  }),
}));

import { resolveAppRouteForTenant } from "../appIdentityRepository";

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
