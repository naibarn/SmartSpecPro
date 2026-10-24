import { afterEach, describe, expect, it, vi } from "vitest";

import { encrypt } from "./crypto";
import {
  getCloudflareDeploymentCredentialState,
  probeCloudflareDeploymentCredential,
  revokeCloudflareDeploymentCredential,
  saveCloudflareDeploymentCredential,
  withCloudflareDeploymentCredential,
} from "./cloudflareCredentialCenter";
import { deploymentCredentialRef } from "./providerDeploymentTargetAuthority";

const key = "tenant-deployment-credential-test-key";
const previousKey = process.env.LLM_ENCRYPTION_KEY;
const identity = { tenantId: "tenant-a", projectId: "project-a", environment: "staging", provider: "cloudflare" };
const ref = deploymentCredentialRef(identity);

function dbFor(row?: { status: string; encryptedSecret: string }) {
  const query = { from: vi.fn(() => query), where: vi.fn(() => query), limit: vi.fn(async () => row ? [row] : []) };
  return { select: vi.fn(() => query) } as never;
}

describe("tenant-bound Cloudflare deployment credentials", () => {
  afterEach(() => {
    if (previousKey === undefined) delete process.env.LLM_ENCRYPTION_KEY;
    else process.env.LLM_ENCRYPTION_KEY = previousKey;
  });

  it("resolves an encrypted token only for its exact tenant/project/environment reference", async () => {
    process.env.LLM_ENCRYPTION_KEY = key;
    const db = dbFor({ status: "CONFIGURED", encryptedSecret: encrypt("secret-token", key) });
    const operation = vi.fn(async token => ({ accepted: token === "secret-token" }));
    await expect(withCloudflareDeploymentCredential(db, { identity, credentialRef: ref }, operation))
      .resolves.toEqual({ status: "CONFIGURED", value: { accepted: true } });
    await expect(withCloudflareDeploymentCredential(db, { identity: { ...identity, tenantId: "tenant-b" }, credentialRef: ref }, operation))
      .resolves.toEqual({ status: "PERMISSION_DENIED" });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("preserves provider errors so the job reports the real API failure", async () => {
    process.env.LLM_ENCRYPTION_KEY = key;
    const providerError = new Error("CLOUDFLARE_QUEUE_HTTP_403");
    const operation = vi.fn(async () => { throw providerError; });

    await expect(withCloudflareDeploymentCredential(
      dbFor({ status: "CONFIGURED", encryptedSecret: encrypt("secret-token", key) }),
      { identity, credentialRef: ref },
      operation,
    )).rejects.toBe(providerError);
    expect(operation).toHaveBeenCalledOnce();
  });

  it("distinguishes missing, revoked, and undecryptable credentials without exposing secrets", async () => {
    process.env.LLM_ENCRYPTION_KEY = key;
    await expect(getCloudflareDeploymentCredentialState(dbFor(), { identity, credentialRef: ref }))
      .resolves.toEqual({ status: "NOT_CONFIGURED", credentialRef: ref });
    await expect(withCloudflareDeploymentCredential(dbFor({ status: "REVOKED", encryptedSecret: "cipher" }), { identity, credentialRef: ref }, async () => "never"))
      .resolves.toEqual({ status: "REVOKED" });
    await expect(withCloudflareDeploymentCredential(dbFor({ status: "CONFIGURED", encryptedSecret: "invalid-ciphertext" }), { identity, credentialRef: ref }, async () => "never"))
      .resolves.toEqual({ status: "UNAVAILABLE" });
    const state = await getCloudflareDeploymentCredentialState(dbFor({ status: "CONFIGURED", encryptedSecret: encrypt("secret-token", key) }), { identity, credentialRef: ref });
    expect(state).toEqual({ status: "CONFIGURED", credentialRef: ref });
    expect(JSON.stringify(state)).not.toContain("secret-token");
  });

  it("stores encrypted credential material and revokes only the exact binding", async () => {
    process.env.LLM_ENCRYPTION_KEY = key;
    let inserted: Record<string, unknown> | undefined;
    const saveDb = { insert: () => ({ values: (value: Record<string, unknown>) => { inserted = value; return { onConflictDoUpdate: async () => undefined }; } }) } as never;
    await expect(saveCloudflareDeploymentCredential(saveDb, { identity, token: "secret-token", actorUserId: 4 }))
      .resolves.toEqual({ status: "CONFIGURED", credentialRef: ref });
    expect(inserted?.credentialRef).toBe(ref);
    expect(inserted?.encryptedSecret).not.toBe("secret-token");

    const revoked = Object.assign(new Error("no row"), { returning: true });
    const revokeDb = { update: () => ({ set: () => ({ where: () => ({ returning: async () => [revoked] }) }) }) } as never;
    await expect(revokeCloudflareDeploymentCredential(revokeDb, { identity, credentialRef: ref, actorUserId: 4 }))
      .resolves.toEqual({ status: "REVOKED" });
    await expect(revokeCloudflareDeploymentCredential(revokeDb, { identity: { ...identity, projectId: "project-b" }, credentialRef: ref }))
      .resolves.toEqual({ status: "PERMISSION_DENIED" });
  });

  it("probes read permissions with the exact target credential and never returns its secret", async () => {
    process.env.LLM_ENCRYPTION_KEY = key;
    const accountId = "0123456789abcdef0123456789abcdef";
    const db = dbFor({ status: "CONFIGURED", encryptedSecret: encrypt("target-secret-token", key) });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/user/tokens/verify")) return new Response(JSON.stringify({ success: true, result: { status: "active" } }), { status: 200 });
      if (url.includes("/zones?name=smartaihub.app")) return new Response(JSON.stringify({ success: true, result: [{ id: "zone-123", name: "smartaihub.app" }] }), { status: 200 });
      if (url.endsWith(`/accounts/${accountId}/queues`)) return new Response(JSON.stringify({ success: false }), { status: 403 });
      if (url.endsWith(`/accounts/${accountId}/connectivity/directory/services`)) return new Response(JSON.stringify({ success: true, result: [] }), { status: 200 });
      return new Response(JSON.stringify({ success: true, result: [] }), { status: 200 });
    });

    const result = await probeCloudflareDeploymentCredential(db, identity, accountId, fetchMock);

    expect(result.accountId).toBe(accountId);
    expect(result.zoneId).toBe("zone-123");
    expect(result.checks.find(check => check.id === "queues")).toMatchObject({
      status: "missing_permission", permission: "Queues Read", httpStatus: 403,
    });
    expect(result.checks.find(check => check.id === "vpcServices")).toMatchObject({
      status: "granted", permission: "Connectivity Directory Read", httpStatus: 200,
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith(`/accounts/${accountId}/connectivity/directory/services`))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("target-secret-token");
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });
});
