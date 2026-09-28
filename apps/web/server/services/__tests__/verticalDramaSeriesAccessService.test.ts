import { describe, expect, it } from "vitest";

import {
  isWorkerSeriesActionAllowed,
  projectWorkerSeries,
  resolveWorkerSeriesPrincipal,
} from "../verticalDramaSeriesAccessService";

describe("verticalDramaSeriesAccessService", () => {
  const worker = {
    id: "worker-1",
    tenantId: "tenant-1",
    registeredByUserId: 7,
    teamId: "team-1",
    status: "online",
  };

  it("resolves owner principal from persisted worker state", () => {
    const principal = resolveWorkerSeriesPrincipal({
      worker,
      grantedScopes: ["series:read"],
      authorityRevision: "connection-1",
      policyRevision: "policy-1",
    });
    expect(principal).toMatchObject({ userId: 7, accessMode: "read", accessSource: "owner" });
    expect(isWorkerSeriesActionAllowed(principal!, "bind")).toBe(false);
  });

  it("fails closed for unowned or cross-tenant series", () => {
    const principal = resolveWorkerSeriesPrincipal({
      worker,
      grantedScopes: ["series:read", "series:bind"],
      authorityRevision: "connection-1",
      policyRevision: "policy-1",
    });
    expect(projectWorkerSeries({
      principal: principal!,
      series: { id: 9, tenantId: "tenant-2", userId: 7, title: "Hidden", status: "draft", updatedAt: new Date() },
    })).toBeNull();
    expect(projectWorkerSeries({
      principal: principal!,
      series: { id: 9, tenantId: "tenant-1", userId: 8, title: "Other", status: "draft", updatedAt: new Date() },
    })).toBeNull();
  });

  it("projects only safe Series fields", () => {
    const principal = resolveWorkerSeriesPrincipal({ worker, grantedScopes: ["series:read", "series:bind"], authorityRevision: "connection-1", policyRevision: "policy-1" });
    const projection = projectWorkerSeries({
      principal: principal!,
      series: { id: 9, tenantId: "tenant-1", userId: 7, title: "Drama", status: "active", updatedAt: "2026-08-25T00:00:00.000Z" },
      bindingStatus: "active",
      bindingRevision: 3,
    });
    expect(projection).toEqual(expect.objectContaining({ seriesId: "9", title: "Drama", bindingStatus: "active", bindingRevision: 3 }));
    expect(Object.keys(projection!)).not.toContain("policy");
  });

  it("honors tenant, group, and explicit user sharing without leaking policy fields", () => {
    const sharedPrincipal = resolveWorkerSeriesPrincipal({
      worker: { ...worker, registeredByUserId: 8 },
      grantedScopes: ["series:read", "series:media:process"],
      authorityRevision: "connection-2",
      policyRevision: "policy-2",
    });
    const explicit = projectWorkerSeries({
      principal: sharedPrincipal!,
      series: {
        id: 10,
        tenantId: "tenant-1",
        userId: 7,
        title: "Shared drama",
        status: "draft",
        updatedAt: "2026-08-25T00:00:00.000Z",
        policy: { workerAccess: { mode: "private", userIds: [8], groupIds: [], revision: "access-2" } },
      },
    });
    expect(explicit).toEqual(expect.objectContaining({ accessSource: "explicit_binding", accessMode: "operate", canProcess: true }));

    const groupPrincipal = resolveWorkerSeriesPrincipal({
      worker,
      grantedScopes: ["series:read"],
      authorityRevision: "connection-3",
      policyRevision: "policy-3",
    });
    expect(projectWorkerSeries({
      principal: groupPrincipal!,
      series: {
        id: 11,
        tenantId: "tenant-1",
        userId: 8,
        title: "Group drama",
        status: "active",
        updatedAt: new Date(),
        policy: { workerAccess: { mode: "group", userIds: [], groupIds: ["team-1"], revision: "access-3" } },
      },
    })).toEqual(expect.objectContaining({ accessSource: "group", accessMode: "read", canProcess: false }));

    expect(projectWorkerSeries({
      principal: groupPrincipal!,
      series: {
        id: 12,
        tenantId: "tenant-1",
        userId: 8,
        title: "Tenant drama",
        status: "active",
        updatedAt: new Date(),
        policy: { workerAccess: { mode: "tenant", userIds: [], groupIds: [], revision: "access-4" } },
      },
    })).not.toBeNull();
  });
});
