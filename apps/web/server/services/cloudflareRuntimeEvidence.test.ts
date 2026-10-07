import { afterEach, describe, expect, it, vi } from "vitest";

import { encrypt } from "./crypto";
import { getAuthorizedCloudflareContainerEvidence, getAuthorizedCloudflareWorkerDeploymentEvidence, getCloudflareContainerInstanceEvidence, getCloudflareWorkerDeploymentEvidence, getPersistedCloudflareContainerEvidence, getPersistedCloudflareWorkerDeploymentEvidence, resolveCloudflareDeploymentTarget } from "./cloudflareRuntimeEvidence";
import { deploymentCredentialRef } from "./providerDeploymentTargetAuthority";

const encryptionKey = "wu4c-cloudflare-test-encryption-key";
const previousKey = process.env.LLM_ENCRYPTION_KEY;

function credentialDb(token?: string) {
  const profileJson = token ? JSON.stringify({ deployment: { label: "test", token, updatedAt: "2026-10-07T00:00:00.000Z" } }) : null;
  const row = profileJson ? { value: encrypt(profileJson, encryptionKey), isSensitive: true } : undefined;
  const query = {
    from: vi.fn(() => query),
    where: vi.fn(() => query),
    limit: vi.fn(async () => row ? [row] : []),
  };
  return { select: vi.fn(() => query) } as never;
}

function persistedDb(targetRow?: Record<string, unknown>, credentialRow?: { status: string; encryptedSecret: string }) {
  let selection = 0;
  return { select: () => {
    const current = ++selection;
    const query: { from: () => typeof query; where: () => Promise<unknown[]> | typeof query; limit: () => Promise<unknown[]> } = {
      from: () => query,
      where: () => current === 1 ? Promise.resolve(targetRow ? [targetRow] : []) : query,
      limit: async () => credentialRow ? [credentialRow] : [],
    };
    return query;
  } } as never;
}

describe("Cloudflare runtime evidence adapters", () => {
  const target = {
    targetId: "target-1", tenantId: "tenant-a", projectId: "project-a", environment: "production",
    provider: "cloudflare" as const, accountRef: "acct-1", workerRef: "worker-a", containerApplicationRef: null,
    credentialRef: deploymentCredentialRef({ tenantId: "tenant-a", projectId: "project-a", environment: "production", provider: "cloudflare" }), enabled: true, provenance: "provider-resource-registry",
    lastVerifiedAt: "2026-10-07T11:00:00.000Z",
  };

  afterEach(() => {
    if (previousKey === undefined) delete process.env.LLM_ENCRYPTION_KEY;
    else process.env.LLM_ENCRYPTION_KEY = previousKey;
  });

  it("resolves only exact tenant/project/environment target identity and rejects disabled or stale targets", () => {
    expect(resolveCloudflareDeploymentTarget({ targets: [target], tenantId: "tenant-a", projectId: "project-a", environment: "production", now: new Date("2026-10-07T12:00:00Z") })).toMatchObject({ status: "CONFIGURED", target });
    expect(resolveCloudflareDeploymentTarget({ targets: [target], tenantId: "tenant-a", projectId: "project-b", environment: "production" }).status).toBe("NOT_CONFIGURED");
    expect(resolveCloudflareDeploymentTarget({ targets: [{ ...target, enabled: false }], tenantId: "tenant-a", projectId: "project-a", environment: "production" })).toMatchObject({ status: "PERMISSION_DENIED", target: null });
    expect(resolveCloudflareDeploymentTarget({ targets: [{ ...target, lastVerifiedAt: "2026-10-01T00:00:00Z" }], tenantId: "tenant-a", projectId: "project-a", environment: "production", now: new Date("2026-10-07T12:00:00Z") })).toMatchObject({ status: "STALE", target: null });
  });

  it("does not query Cloudflare when an authorized Worker target is absent", async () => {
    const fetchImpl = vi.fn();
    await expect(getAuthorizedCloudflareWorkerDeploymentEvidence({ db: credentialDb(), target: null, fetchImpl })).resolves.toMatchObject({ status: "NOT_CONFIGURED", value: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("distinguishes absent Container authority from a target missing its application identity", async () => {
    process.env.LLM_ENCRYPTION_KEY = encryptionKey;
    const fetchImpl = vi.fn();
    await expect(getAuthorizedCloudflareContainerEvidence({ db: credentialDb(), target: null, fetchImpl })).resolves.toMatchObject({ status: "NOT_CONFIGURED", value: null });
    await expect(getAuthorizedCloudflareContainerEvidence({ db: credentialDb(), target, fetchImpl })).resolves.toMatchObject({ status: "INVALID_TARGET_CONFIGURATION", value: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports missing encrypted provider configuration without claiming health", async () => {
    process.env.LLM_ENCRYPTION_KEY = encryptionKey;
    await expect(getCloudflareWorkerDeploymentEvidence({ db: credentialDb(), accountId: "acct", scriptName: "worker" }))
      .resolves.toMatchObject({ status: "NOT_CONFIGURED", value: null });
  });

  it("resolves an encrypted tenant credential and calls the adapter without logging the token", async () => {
    process.env.LLM_ENCRYPTION_KEY = encryptionKey;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer secret-token");
      return new Response(JSON.stringify({ success: true, result: { deployments: [{ id: "deployment-1", created_on: "2026-10-07T10:00:00Z", versions: [{ version_id: "version-1", percentage: 100 }] }] } }), { status: 200 });
    });
    const result = await getCloudflareWorkerDeploymentEvidence({ db: credentialDb("secret-token"), accountId: "acct", scriptName: "worker", fetchImpl });
    expect(result).toMatchObject({ status: "OBSERVED", source: "cloudflare_workers_api", value: { deploymentId: "deployment-1", versions: [{ versionId: "version-1", percentage: 100 }] } });
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("uses the persisted Worker and Container target plus exact scoped credential binding", async () => {
    process.env.LLM_ENCRYPTION_KEY = encryptionKey;
    const targetRow = { id: "row-1", tenantId: "tenant-a", projectId: "project-a", environment: "production", provider: "cloudflare",
      deploymentTargetId: "target-1", accountRef: "acct-1", workerRef: "worker-a", containerApplicationRef: "app-1",
      credentialRef: target.credentialRef, enabled: true, provenance: target.provenance, lastVerifiedAt: null, region: null, runtimePolicy: null };
    const credentialRow = { status: "CONFIGURED", encryptedSecret: encrypt("tenant-token", encryptionKey) };
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer tenant-token");
      const result = url.includes("instances-v2") ? [{ id: "instance-1" }] : { deployments: [{ id: "deployment-1", versions: [] }] };
      return new Response(JSON.stringify({ success: true, result }), { status: 200 });
    });
    const worker = await getPersistedCloudflareWorkerDeploymentEvidence({ db: persistedDb(targetRow, credentialRow), callerTenantId: "tenant-a", projectId: "project-a", environment: "production", fetchImpl });
    expect(worker).toMatchObject({ status: "OBSERVED", value: { targetId: "target-1", deploymentId: "deployment-1" } });
    const container = await getPersistedCloudflareContainerEvidence({ db: persistedDb(targetRow, credentialRow), callerTenantId: "tenant-a", projectId: "project-a", environment: "production", fetchImpl });
    expect(container).toMatchObject({ status: "OBSERVED", value: { targetId: "target-1", instances: [{ id: "instance-1" }] } });
    await expect(getPersistedCloudflareWorkerDeploymentEvidence({ db: persistedDb(targetRow, credentialRow), callerTenantId: "tenant-b", projectId: "project-a", environment: "production", fetchImpl }))
      .resolves.toMatchObject({ status: "PERMISSION_DENIED", value: null });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("maps denied access and normalizes Container instance output", async () => {
    process.env.LLM_ENCRYPTION_KEY = encryptionKey;
    const denied = await getCloudflareWorkerDeploymentEvidence({ db: credentialDb("secret-token"), accountId: "acct", scriptName: "worker", fetchImpl: async () => new Response("{}", { status: 403 }) });
    expect(denied.status).toBe("PERMISSION_DENIED");
    const container = await getCloudflareContainerInstanceEvidence({ db: credentialDb("secret-token"), accountId: "acct", applicationId: "app", fetchImpl: async () => new Response(JSON.stringify({ success: true, result: [{ id: "instance-1" }] }), { status: 200 }) });
    expect(container).toMatchObject({ status: "OBSERVED", value: { instances: [{ id: "instance-1", image: null, status: null, state: null, updatedAt: null }] } });
  });
});
