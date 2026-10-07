import { afterEach, describe, expect, it, vi } from "vitest";

import { encrypt } from "./crypto";
import {
  getCloudflareDeploymentCredentialState,
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
});
