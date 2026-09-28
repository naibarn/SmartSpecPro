import { describe, expect, it } from "vitest";
import crypto from "node:crypto";

import {
  __clearRunnerRefreshGraceForTests,
  createRunnerControlToken,
  createRunnerRegistrationToken,
  issueRunnerAccessTokens,
  refreshRunnerAccessTokens,
  runnerDeviceProofPayload,
  rotateRunnerControlToken,
  verifyRunnerAccessToken,
  verifyRunnerRegistrationToken,
  verifyRunnerControlToken,
} from "../runnerAuthService";
import { verifyBearerToken } from "../../_core/tokens";
import { InMemoryRunnerRepository, RunnerGateway } from "../runnerGateway";

const now = new Date("2026-09-18T00:00:00.000Z");
const validTestPublicKey = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
}).publicKey;
const localDeviceBinding = {
  deviceId: "device-1",
  machineFingerprint: "test-machine",
  publicKey: validTestPublicKey,
};

function snapshot(revision: string, runnerId = "runner-1") {
  return {
    runnerId,
    revision,
    observedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    capabilities: ["agent.execute"],
    workspaceIds: ["workspace-1"],
    resourceClass: "medium" as const,
    toolInventory: [],
    capabilityInventory: [],
  };
}

describe("RunnerGateway", () => {
  it("rejects malformed device public keys before issuing Runner credentials", () => {
    expect(() =>
      createRunnerControlToken({
        runnerId: "runner-invalid-key",
        tenantId: "tenant-a",
        profile: "local_device",
        nodeKind: "local_device",
        deviceBinding: {
          ...localDeviceBinding,
          publicKey: "not-a-public-key",
        },
      })
    ).toThrow("runner_device_public_key_invalid");
  });

  it("keeps Runner auth namespace separate and binds tenant/runner", async () => {
    const token = createRunnerControlToken({
      runnerId: "runner-1",
      tenantId: "tenant-a",
      profile: "local_device",
      nodeKind: "local_device",
      deviceBinding: localDeviceBinding,
    });
    await expect(
      verifyRunnerControlToken(token, {
        runnerId: "runner-1",
        tenantId: "tenant-a",
      })
    ).resolves.toMatchObject({
      runnerId: "runner-1",
      tenantId: "tenant-a",
      tokenUse: "runner_control",
    });
    await expect(
      verifyRunnerControlToken(token, { runnerId: "runner-2" })
    ).rejects.toMatchObject({ code: "runner_scope_mismatch" });
  });

  it("rejects a Worker token at the Runner boundary", async () => {
    const { createWorkerRegistrationToken } =
      await import("../workerAuthService");
    const workerToken = createWorkerRegistrationToken({ tenantId: "tenant-a" });
    await expect(verifyRunnerControlToken(workerToken)).rejects.toMatchObject({
      code: "runner_auth_invalid",
    });
  });

  it("keeps bootstrap, execution and upload token uses separate", async () => {
    const registration = createRunnerRegistrationToken({
      runnerId: "runner-bootstrap",
      tenantId: "tenant-a",
      profile: "local_device",
      nodeKind: "local_device",
      deviceBinding: localDeviceBinding,
    });
    await expect(
      verifyRunnerRegistrationToken(registration)
    ).resolves.toMatchObject({ tokenUse: "runner_registration" });
    await expect(verifyRunnerControlToken(registration)).rejects.toMatchObject({
      code: "runner_auth_invalid",
    });
    const tokens = issueRunnerAccessTokens({
      runnerId: "runner-bootstrap",
      tenantId: "tenant-a",
      profile: "local_device",
      nodeKind: "local_device",
      deviceBinding: localDeviceBinding,
    });
    await expect(
      verifyRunnerAccessToken(tokens.executionToken, undefined, [
        "runner_execution",
      ])
    ).resolves.toMatchObject({ tokenUse: "runner_execution" });
    await expect(
      verifyRunnerAccessToken(tokens.refreshToken)
    ).rejects.toMatchObject({ code: "runner_auth_invalid" });
  });

  it("enforces operation scopes at the Runner token boundary", async () => {
    const controlToken = createRunnerControlToken({
      runnerId: "runner-scope",
      tenantId: "tenant-a",
      profile: "local_device",
      nodeKind: "local_device",
      scopes: ["runner:heartbeat"],
    });
    await expect(
      verifyRunnerControlToken(controlToken, {
        runnerId: "runner-scope",
        requiredScopes: ["runner:capabilities"],
      })
    ).rejects.toMatchObject({ code: "runner_permission_denied" });

    const registration = createRunnerRegistrationToken({
      runnerId: "runner-registration-scope",
      tenantId: "tenant-a",
      profile: "local_device",
      nodeKind: "local_device",
      deviceBinding: localDeviceBinding,
      scopes: [],
    });
    await expect(
      verifyRunnerRegistrationToken(registration, {
        requiredScopes: ["runner:enroll"],
      })
    ).rejects.toMatchObject({ code: "runner_permission_denied" });
  });

  it("requires runner-specific device proof for a device-bound local token", async () => {
    const token = createRunnerControlToken({
      runnerId: "runner-device-proof",
      tenantId: "tenant-a",
      profile: "local_device",
      nodeKind: "local_device",
      deviceBinding: {
        deviceId: "device-proof-1",
        machineFingerprint: "machine-proof-1",
        publicKey: validTestPublicKey,
      },
    });
    await expect(
      verifyRunnerControlToken(token, { requestProof: null })
    ).rejects.toMatchObject({
      code: "runner_device_proof_required",
    });
  });

  it("accepts one valid runner proof and rejects its replay", async () => {
    const keyPair = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const token = createRunnerControlToken({
      runnerId: "runner-proof-valid",
      tenantId: "tenant-a",
      profile: "local_device",
      nodeKind: "local_device",
      deviceBinding: {
        deviceId: "device-proof-valid",
        machineFingerprint: "machine-proof-valid",
        publicKey: keyPair.publicKey,
      },
    });
    const claims = await verifyBearerToken(token);
    const timestamp = new Date().toISOString();
    const nonce = "proof-nonce-1";
    const bodyHash = crypto.createHash("sha256").update("{}").digest("hex");
    const payload = runnerDeviceProofPayload({
      bodyHash,
      jti: String(claims.jti),
      method: "POST",
      nonce,
      path: "/api/runners/runner-proof-valid/heartbeat",
      timestamp,
    });
    const signer = crypto.createSign("sha256");
    signer.update(payload);
    signer.end();
    const proof = {
      bodyHash,
      deviceId: "device-proof-valid",
      machineFingerprint: "machine-proof-valid",
      nonce,
      path: "/api/runners/runner-proof-valid/heartbeat",
      publicKey: keyPair.publicKey,
      signature: signer.sign(keyPair.privateKey).toString("base64"),
      method: "POST",
      timestamp,
    };
    await expect(
      verifyRunnerControlToken(token, { requestProof: proof })
    ).resolves.toMatchObject({ runnerId: "runner-proof-valid" });
    await expect(
      verifyRunnerControlToken(token, { requestProof: proof })
    ).rejects.toMatchObject({ code: "runner_device_mismatch" });
  });

  it("rotates refresh tokens while converging bounded replay to one token set", async () => {
    const tokens = issueRunnerAccessTokens({
      runnerId: "runner-refresh",
      tenantId: "tenant-a",
      profile: "local_device",
      nodeKind: "local_device",
      deviceBinding: localDeviceBinding,
    });
    const first = await refreshRunnerAccessTokens(tokens.refreshToken);
    const replay = await refreshRunnerAccessTokens(tokens.refreshToken);
    expect(replay).toEqual(first);
    await expect(
      verifyRunnerAccessToken(first.executionToken, undefined, [
        "runner_execution",
      ])
    ).resolves.toMatchObject({ runnerId: "runner-refresh" });
    __clearRunnerRefreshGraceForTests();
    await expect(
      refreshRunnerAccessTokens(tokens.refreshToken)
    ).rejects.toMatchObject({
      code: "runner_auth_invalid",
    });
  });

  it("preserves the authenticated Runner session fence across token refresh", async () => {
    const tokens = issueRunnerAccessTokens({
      runnerId: "runner-session-refresh",
      tenantId: "tenant-a",
      profile: "local_device",
      nodeKind: "local_device",
      runnerSessionId: "session-refresh",
      deviceBinding: localDeviceBinding,
    });
    const refreshed = await refreshRunnerAccessTokens(tokens.refreshToken);
    await expect(
      verifyRunnerAccessToken(refreshed.executionToken, { runnerSessionId: "session-refresh" }, ["runner_execution"]),
    ).resolves.toMatchObject({ runnerSessionId: "session-refresh" });
  });

  it("rotates a Runner token and revokes the previous token", async () => {
    const token = createRunnerControlToken({
      runnerId: "runner-rotate",
      tenantId: "tenant-a",
      profile: "local_device",
      nodeKind: "local_device",
      deviceBinding: localDeviceBinding,
    });
    const replacement = await rotateRunnerControlToken(token);
    await expect(verifyRunnerControlToken(token)).rejects.toMatchObject({
      code: "runner_auth_invalid",
    });
    await expect(
      verifyRunnerControlToken(replacement, { requestProof: null })
    ).rejects.toMatchObject({ code: "runner_device_proof_required" });
  });

  it("enrolls once, accepts newer snapshots, rejects rollback and makes repeats idempotent", async () => {
    const repository = new InMemoryRunnerRepository();
    const gateway = new RunnerGateway(repository);
    const auth = await verifyRunnerControlToken(
      createRunnerControlToken({
        runnerId: "runner-1",
        tenantId: "tenant-a",
        profile: "local_device",
        nodeKind: "local_device",
        deviceBinding: localDeviceBinding,
      })
    );
    await gateway.enroll({
      auth,
      deviceId: "device-1",
      displayName: "Test Runner",
    });
    await expect(
      gateway.publishCapabilities({
        auth,
        snapshot: snapshot("1"),
        idempotencyKey: "snapshot-1",
      })
    ).resolves.toMatchObject({ status: "accepted", acceptedRevision: "1" });
    await expect(
      gateway.publishCapabilities({
        auth,
        snapshot: snapshot("1"),
        idempotencyKey: "snapshot-1",
      })
    ).resolves.toMatchObject({ status: "duplicate" });
    await expect(
      gateway.publishCapabilities({
        auth,
        snapshot: snapshot("0"),
        idempotencyKey: "snapshot-0",
      })
    ).rejects.toMatchObject({ code: "RUNNER_SNAPSHOT_OLD" });
    await expect(
      gateway.publishCapabilities({
        auth,
        snapshot: snapshot("2"),
        idempotencyKey: "snapshot-2",
      })
    ).resolves.toMatchObject({
      acceptedRevision: "2",
      staleEntriesMarkedUnavailable: 0,
    });
  });

  it("does not allow a shared Container to become a device", async () => {
    const gateway = new RunnerGateway(new InMemoryRunnerRepository());
    const auth = await verifyRunnerControlToken(
      createRunnerControlToken({
        runnerId: "container-1",
        tenantId: "tenant-a",
        profile: "shared_container",
        nodeKind: "managed_container",
      })
    );
    await expect(
      gateway.enroll({
        auth,
        deviceId: "user-device",
        displayName: "bad container",
      })
    ).rejects.toMatchObject({ code: "RUNNER_PROFILE_MISMATCH" });
  });

  it("rejects a capability publication from a reconnected local Runner session", async () => {
    const gateway = new RunnerGateway(new InMemoryRunnerRepository());
    const authOne = await verifyRunnerControlToken(
      createRunnerControlToken({
        runnerId: "runner-session-fence",
        tenantId: "tenant-a",
        profile: "local_device",
        nodeKind: "local_device",
        runnerSessionId: "session-one",
        deviceBinding: localDeviceBinding,
      }),
    );
    await gateway.enroll({ auth: authOne, deviceId: "device-1", displayName: "Fenced Runner", ownerUserId: 7 });
    await gateway.bindSession({ runnerId: "runner-session-fence", tenantId: "tenant-a", ownerUserId: 7, runnerSessionId: "session-one" });
    const authTwo = await verifyRunnerControlToken(
      createRunnerControlToken({
        runnerId: "runner-session-fence",
        tenantId: "tenant-a",
        profile: "local_device",
        nodeKind: "local_device",
        runnerSessionId: "session-two",
        deviceBinding: localDeviceBinding,
      }),
    );
    await gateway.bindSession({ runnerId: "runner-session-fence", tenantId: "tenant-a", ownerUserId: 7, runnerSessionId: "session-two" });
    await expect(
      gateway.publishCapabilities({ auth: authOne, snapshot: snapshot("1", "runner-session-fence"), idempotencyKey: "old-session" }),
    ).rejects.toMatchObject({ code: "RUNNER_SESSION_STALE" });
    await expect(
      gateway.publishCapabilities({ auth: authTwo, snapshot: snapshot("2", "runner-session-fence"), idempotencyKey: "new-session" }),
    ).resolves.toMatchObject({ status: "accepted" });
  });

  it("revokes an owned Runner and rejects another owner", async () => {
    const gateway = new RunnerGateway(new InMemoryRunnerRepository());
    const auth = await verifyRunnerControlToken(
      createRunnerControlToken({
        runnerId: "runner-revoke",
        tenantId: "tenant-a",
        profile: "local_device",
        nodeKind: "local_device",
        deviceBinding: localDeviceBinding,
      })
    );
    await gateway.enroll({
      auth,
      deviceId: "device-1",
      displayName: "Owned Runner",
      ownerUserId: 7,
    });
    await expect(
      gateway.revoke({
        runnerId: "runner-revoke",
        tenantId: "tenant-a",
        ownerUserId: 8,
      })
    ).rejects.toMatchObject({ code: "RUNNER_PERMISSION_DENIED" });
    await expect(
      gateway.revoke({
        runnerId: "runner-revoke",
        tenantId: "tenant-a",
        ownerUserId: 7,
      })
    ).resolves.toMatchObject({ status: "revoked", trustState: "revoked" });
  });

  it("does not let a different owner re-enroll an existing Runner", async () => {
    const gateway = new RunnerGateway(new InMemoryRunnerRepository());
    const firstAuth = await verifyRunnerRegistrationToken(
      createRunnerRegistrationToken({
        runnerId: "runner-owned",
        tenantId: "tenant-a",
        profile: "local_device",
        nodeKind: "local_device",
        deviceBinding: localDeviceBinding,
        ownerUserId: 7,
      })
    );
    await gateway.enroll({
      auth: firstAuth,
      deviceId: "device-1",
      displayName: "Owned Runner",
    });
    const secondAuth = await verifyRunnerRegistrationToken(
      createRunnerRegistrationToken({
        runnerId: "runner-owned",
        tenantId: "tenant-a",
        profile: "local_device",
        nodeKind: "local_device",
        deviceBinding: localDeviceBinding,
        ownerUserId: 8,
      })
    );
    await expect(
      gateway.enroll({
        auth: secondAuth,
        deviceId: "device-1",
        displayName: "Hijack Attempt",
      })
    ).rejects.toMatchObject({ code: "RUNNER_PERMISSION_DENIED" });
  });
});
