import { describe, expect, it, vi } from "vitest";
import crypto from "crypto";

process.env.JWT_SECRET ??= "worker-route-policy-test-secret-0123456789";

const { mockEffectiveScopes } = vi.hoisted(() => ({
  mockEffectiveScopes: vi.fn(),
}));

vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn().mockResolvedValue({
    openClawExternalRuntime: true,
    desktopZeroClawWorker: true,
    nemoClawSecureWorkerPool: true,
    hiClawClusterRuntime: true,
  }),
}));

vi.mock("../../_core/revocation", () => ({
  isJtiRevoked: vi.fn().mockResolvedValue(false),
  revokeJti: vi.fn(),
}));

vi.mock("../../services/connectedDeviceService", async () => {
  const actual = await vi.importActual<
    typeof import("../../services/connectedDeviceService")
  >("../../services/connectedDeviceService");
  return {
    ...actual,
    getConnectedWorkerEffectiveScopes: mockEffectiveScopes,
    isConnectedDeviceRevoked: vi.fn().mockResolvedValue(false),
  };
});

import { issueWorkerAccessTokens } from "../../services/workerAuthService";
import { signWorkerDeviceProofForTest } from "../../services/workerAuthService";
import {
  verifyWorkerRouteAccessToken,
} from "../workerRuntime";

describe("worker route connected-device policy", () => {
  it("denies a required scope removed from the device policy", async () => {
    mockEffectiveScopes.mockResolvedValue(["workers:heartbeat"]);
    const token = issueWorkerAccessTokens({
      tenantId: "tenant-a",
      workerId: "worker-a",
      runtimeType: "desktop_zeroclaw_managed",
      scopes: ["workers:heartbeat", "series:read"],
    }).executionToken;

    await expect(
      verifyWorkerRouteAccessToken(
        {
          headers: { authorization: `Bearer ${token}` },
          method: "GET",
          originalUrl: "/api/workers/worker-a/series",
        } as any,
        token,
        { requiredScopes: ["series:read"] },
      ),
    ).rejects.toMatchObject({
      code: "worker_permission_denied",
      statusCode: 403,
    });
  });

  it("returns the token claims narrowed to the effective device policy", async () => {
    mockEffectiveScopes.mockResolvedValue(["workers:heartbeat"]);
    const token = issueWorkerAccessTokens({
      tenantId: "tenant-a",
      workerId: "worker-a",
      runtimeType: "desktop_zeroclaw_managed",
      scopes: ["workers:heartbeat", "series:read"],
    }).executionToken;

    const claims = await verifyWorkerRouteAccessToken(
      {
        headers: { authorization: `Bearer ${token}` },
        method: "POST",
        originalUrl: "/api/workers/worker-a/heartbeat",
      } as any,
      token,
      { requiredScopes: ["workers:heartbeat"] },
    );
    expect(claims.scopes).toEqual(["workers:heartbeat"]);
  });

  it("fails closed when a device-bound token has no durable device record", async () => {
    mockEffectiveScopes.mockResolvedValue(null);
    const deviceKey = await crypto.webcrypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const publicKey = await crypto.webcrypto.subtle.exportKey("spki", deviceKey.publicKey);
    const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(publicKey).toString("base64").match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
    const token = issueWorkerAccessTokens({
      tenantId: "tenant-a",
      workerId: "worker-a",
      runtimeType: "desktop_zeroclaw_managed",
      scopes: ["workers:heartbeat", "series:read"],
      deviceBinding: {
        deviceId: "device-a",
        machineFingerprint: "machine-a",
        publicKey: publicKeyPem,
      },
    }).executionToken;
    const proof = await signWorkerDeviceProofForTest({
      token,
      method: "GET",
      path: "/api/workers/worker-a/series",
      nonce: "missing-device-record-1",
      privateKey: deviceKey.privateKey,
    });

    await expect(
      verifyWorkerRouteAccessToken(
        {
          headers: {
            authorization: `Bearer ${token}`,
            "x-worker-device-id": proof.deviceId,
            "x-worker-device-public-key": proof.publicKey,
            "x-worker-device-nonce": proof.nonce,
            "x-worker-device-timestamp": proof.timestamp,
            "x-worker-device-signature": proof.signature,
          },
          method: "GET",
          originalUrl: "/api/workers/worker-a/series",
        } as any,
        token,
        { requiredScopes: ["series:read"] },
      ),
    ).rejects.toMatchObject({
      code: "worker_connection_blocked",
      statusCode: 401,
    });
  });
});
