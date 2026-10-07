import { describe, expect, it } from "vitest";
import { authorizeDeploymentTarget, deploymentCredentialRef, disableProviderDeploymentTarget, listProviderDeploymentTargets, resolveProviderDeploymentTarget, updateProviderDeploymentTarget } from "./providerDeploymentTargetAuthority";

const identity = { tenantId: "tenant-a", projectId: "project-a", environment: "staging", provider: "cloudflare" };
const row = { ...identity, id: "target-1", deploymentTargetId: "target-a", accountRef: "account-a", workerRef: "worker-a",
  containerApplicationRef: null, credentialRef: deploymentCredentialRef(identity), enabled: true, provenance: "admin-configured",
  region: null, runtimePolicy: null, verificationVersion: 1, lastVerifiedAt: null, createdBy: 1, updatedBy: 1,
  createdAt: new Date(0), updatedAt: new Date(0) };

function fakeDb(rows: typeof row[]) {
  const query = { where: async () => rows };
  return { select: () => ({ from: () => query }) } as never;
}

describe("persisted deployment target authority", () => {
  it("resolves an exact tenant/project/environment/provider identity", async () => {
    await expect(resolveProviderDeploymentTarget(fakeDb([row]), identity)).resolves.toMatchObject({ status: "CONFIGURED", target: row });
    await expect(resolveProviderDeploymentTarget(fakeDb([]), { ...identity, tenantId: "tenant-b" })).resolves.toEqual({ status: "NOT_CONFIGURED", target: null });
    await expect(resolveProviderDeploymentTarget(fakeDb([]), { ...identity, environment: "production" })).resolves.toEqual({ status: "NOT_CONFIGURED", target: null });
  });

  it("fails closed on duplicate active authority and disabled targets", async () => {
    await expect(resolveProviderDeploymentTarget(fakeDb([row, { ...row, id: "target-2" }]), identity)).resolves.toEqual({ status: "TARGET_AUTHORITY_CONFLICT", target: null });
    await expect(resolveProviderDeploymentTarget(fakeDb([{ ...row, enabled: false }]), identity)).resolves.toEqual({ status: "PERMISSION_DENIED", target: null });
  });

  it("binds credential reference to tenant/project/environment and rejects cross-scope use", () => {
    expect(authorizeDeploymentTarget({ target: row, callerTenantId: "tenant-a", projectId: "project-a", environment: "staging", provider: "cloudflare" })).toBe("AUTHORIZED");
    expect(authorizeDeploymentTarget({ target: row, callerTenantId: "tenant-b", projectId: "project-a", environment: "staging", provider: "cloudflare" })).toBe("PERMISSION_DENIED");
    expect(authorizeDeploymentTarget({ target: row, callerTenantId: "tenant-a", projectId: "project-a", environment: "production", provider: "cloudflare" })).toBe("PERMISSION_DENIED");
    expect(authorizeDeploymentTarget({ target: { ...row, credentialRef: "cloudflare:deployment" }, callerTenantId: "tenant-a", projectId: "project-a", environment: "staging", provider: "cloudflare" })).toBe("PERMISSION_DENIED");
  });

  it("lists targets in tenant/project/environment scope and updates or disables only scoped rows", async () => {
    let whereClause: unknown;
    let changes: unknown;
    const updated = { ...row, enabled: false };
    const db = {
      select: () => ({ from: () => ({ where: async (where: unknown) => { whereClause = where; return [row]; } }) }),
      update: () => ({ set: (set: unknown) => ({ where: (where: unknown) => ({ returning: async () => { changes = set; whereClause = where; return [updated]; } }) }) }),
    } as never;
    await expect(listProviderDeploymentTargets(db, identity)).resolves.toEqual([row]);
    expect(whereClause).toBeDefined();
    await expect(updateProviderDeploymentTarget(db, { identity, targetRowId: row.id, changes: { workerRef: "worker-b" }, actorUserId: 2 }))
      .resolves.toMatchObject({ status: "DISABLED", target: updated });
    expect(changes).toMatchObject({ workerRef: "worker-b", updatedBy: 2 });
    await expect(disableProviderDeploymentTarget(db, { identity, targetRowId: row.id })).resolves.toMatchObject({ status: "DISABLED" });
    await expect(updateProviderDeploymentTarget(db, { identity, targetRowId: row.id, changes: { credentialRef: "cloudflare:deployment" } }))
      .resolves.toEqual({ status: "PERMISSION_DENIED", target: null });
  });
});
