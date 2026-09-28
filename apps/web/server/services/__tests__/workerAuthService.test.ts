import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET ??= "worker-auth-service-test-secret-0123456789";

const { mockGetTenantFeatureFlags, mockIsJtiRevoked, mockRevokeJti } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
  mockIsJtiRevoked: vi.fn(),
  mockRevokeJti: vi.fn(),
}));

vi.mock("../tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

vi.mock("../../_core/revocation", () => ({
  isJtiRevoked: mockIsJtiRevoked,
  revokeJti: mockRevokeJti,
}));

import { signBearerToken } from "../../_core/tokens";

describe("workerAuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
      hermesAgentRuntime: true,
    });
    mockIsJtiRevoked.mockResolvedValue(false);
    mockRevokeJti.mockResolvedValue(undefined);
  });

  it("rejects generic bearer tokens for registration flows", async () => {
    const { verifyWorkerRegistrationToken } = await import("../workerAuthService");
    const token = signBearerToken(
      {
        sub: "user-1",
        type: "access",
        scopes: ["llm:chat"],
        jti: "generic-bearer",
      } as any,
      "15m",
    );

    await expect(verifyWorkerRegistrationToken(token)).rejects.toMatchObject({
      code: "worker_auth_invalid",
      statusCode: 401,
    });
  });

  it("accepts bootstrap registration credentials and keeps tenant/runtime binding", async () => {
    const {
      createWorkerRegistrationToken,
      verifyWorkerRegistrationToken,
      WORKER_REGISTRATION_AUDIENCE,
    } = await import("../workerAuthService");

    const token = createWorkerRegistrationToken({
      tenantId: "tenant-1",
      runtimeType: "openclaw_gateway",
      teamId: "team-1",
      registeredByUserId: 7,
      externalReference: "openclaw://main-node",
    });

    const auth = await verifyWorkerRegistrationToken(token, {
      runtimeType: "openclaw_gateway",
    });

    expect(auth.tenantId).toBe("tenant-1");
    expect(auth.teamId).toBe("team-1");
    expect(auth.runtimeType).toBe("openclaw_gateway");
    expect(auth.registeredByUserId).toBe(7);
    expect(auth.audience).toBe(WORKER_REGISTRATION_AUDIENCE);
  });

  it("preserves Hermes provider routing on registration tokens", async () => {
    const {
      createWorkerRegistrationToken,
      verifyWorkerRegistrationToken,
    } = await import("../workerAuthService");

    const token = createWorkerRegistrationToken({
      tenantId: "tenant-1",
      runtimeType: "hermes_agent_gateway",
      registeredByUserId: 7,
      llmRoutingMode: "pinned_provider",
      preferredProviderId: 42,
      preferredProviderName: "SmartSpecPro Gateway",
    });

    const auth = await verifyWorkerRegistrationToken(token, {
      runtimeType: "hermes_agent_gateway",
    });

    expect(auth.llmRoutingMode).toBe("pinned_provider");
    expect(auth.preferredProviderId).toBe(42);
    expect(auth.preferredProviderName).toBe("SmartSpecPro Gateway");
  });

  it("preserves worker access permissions and quotas on registration tokens", async () => {
    const {
      createWorkerRegistrationToken,
      verifyWorkerRegistrationToken,
    } = await import("../workerAuthService");

    const token = createWorkerRegistrationToken({
      tenantId: "tenant-1",
      runtimeType: "hermes_agent_gateway",
      registeredByUserId: 7,
      permissionPreset: "custom",
      permissionScopes: ["workers:register", "llm:chat", "workos:write"],
      quotaHourly: 12,
      quotaDaily: 120,
      quotaWeekly: 700,
      quotaMonthly: 2_500,
    });

    const auth = await verifyWorkerRegistrationToken(token, {
      runtimeType: "hermes_agent_gateway",
    });

    expect(auth.permissionPreset).toBe("custom");
    expect(auth.permissionScopes).toEqual(["workers:register", "llm:chat", "workos:write"]);
    expect(auth.quotaHourly).toBe(12);
    expect(auth.quotaDaily).toBe(120);
    expect(auth.quotaWeekly).toBe(700);
    expect(auth.quotaMonthly).toBe(2_500);
  });

  it("rejects invalid worker registration routing combinations", async () => {
    const { createWorkerRegistrationToken } = await import("../workerAuthService");

    expect(() =>
      createWorkerRegistrationToken({
        tenantId: "tenant-1",
        runtimeType: "hermes_agent_gateway",
        registeredByUserId: 7,
        llmRoutingMode: "pinned_provider",
      } as any),
    ).toThrow(/preferredProviderId/i);
  });

  it("issues worker-bound execution and upload tokens with the required claims", async () => {
    const {
      issueWorkerAccessTokens,
      verifyWorkerAccessToken,
      WORKER_CONTROL_PLANE_AUDIENCE,
    } = await import("../workerAuthService");

    const tokens = issueWorkerAccessTokens({
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "openclaw_gateway",
      teamId: "team-1",
    });

    const execution = await verifyWorkerAccessToken(tokens.executionToken, {
      workerId: "worker-1",
      requiredScopes: ["workers:claim"],
      allowedTokenUses: ["worker_execution"],
    });

    const upload = await verifyWorkerAccessToken(tokens.uploadToken, {
      workerId: "worker-1",
      requiredScopes: ["workers:report"],
      allowedTokenUses: ["worker_upload"],
    });

    expect(execution.tenantId).toBe("tenant-1");
    expect(execution.workerId).toBe("worker-1");
    expect(execution.runtimeType).toBe("openclaw_gateway");
    expect(execution.audience).toBe(WORKER_CONTROL_PLANE_AUDIENCE);
    expect(execution.scopes).toContain("workers:jobs:read");
    expect(upload.tokenUse).toBe("worker_upload");
  });

  it("fails closed when the tenant feature flag is disabled", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: false,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
      hermesAgentRuntime: true,
    });

    const {
      createWorkerRegistrationToken,
      verifyWorkerRegistrationToken,
    } = await import("../workerAuthService");

    const token = createWorkerRegistrationToken({
      tenantId: "tenant-disabled",
      runtimeType: "openclaw_gateway",
    });

    await expect(verifyWorkerRegistrationToken(token)).rejects.toMatchObject({
      code: "feature_disabled",
      statusCode: 403,
    });
  });

  it("fails closed per runtime family when a desktop worker rollout flag is disabled", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: false,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    });

    const {
      createWorkerRegistrationToken,
      verifyWorkerRegistrationToken,
    } = await import("../workerAuthService");

    const token = createWorkerRegistrationToken({
      tenantId: "tenant-desktop-disabled",
      runtimeType: "desktop_zeroclaw_managed",
    });

    await expect(verifyWorkerRegistrationToken(token)).rejects.toMatchObject({
      code: "feature_disabled",
      statusCode: 403,
    });
  });

  it("rejects registration tokens when the request runtime mismatches the token runtime", async () => {
    const {
      createWorkerRegistrationToken,
      verifyWorkerRegistrationToken,
    } = await import("../workerAuthService");

    const token = createWorkerRegistrationToken({
      tenantId: "tenant-1",
      runtimeType: "openclaw_gateway",
    });

    await expect(
      verifyWorkerRegistrationToken(token, {
        runtimeType: "desktop_zeroclaw_managed",
      }),
    ).rejects.toMatchObject({
      code: "worker_scope_mismatch",
      statusCode: 403,
    });
  });

  it("rejects upload tokens on execution-only endpoints", async () => {
    const {
      issueWorkerAccessTokens,
      verifyWorkerAccessToken,
    } = await import("../workerAuthService");

    const tokens = issueWorkerAccessTokens({
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "openclaw_gateway",
      teamId: "team-1",
    });

    await expect(
      verifyWorkerAccessToken(tokens.uploadToken, {
        workerId: "worker-1",
        allowedTokenUses: ["worker_execution"],
        requiredScopes: ["workers:claim"],
      }),
    ).rejects.toMatchObject({
      code: "worker_auth_invalid",
      statusCode: 401,
    });
  });

  it("rejects worker access tokens when the requested worker id does not match the token binding", async () => {
    const {
      issueWorkerAccessTokens,
      verifyWorkerAccessToken,
    } = await import("../workerAuthService");

    const tokens = issueWorkerAccessTokens({
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "openclaw_gateway",
      teamId: "team-1",
    });

    await expect(
      verifyWorkerAccessToken(tokens.executionToken, {
        workerId: "worker-2",
        allowedTokenUses: ["worker_execution"],
      }),
    ).rejects.toMatchObject({
      code: "worker_scope_mismatch",
      statusCode: 403,
    });
  });

  it("rejects revoked worker access tokens before scope checks", async () => {
    mockIsJtiRevoked.mockResolvedValueOnce(true);

    const {
      issueWorkerAccessTokens,
      verifyWorkerAccessToken,
    } = await import("../workerAuthService");

    const tokens = issueWorkerAccessTokens({
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "openclaw_gateway",
    });

    await expect(
      verifyWorkerAccessToken(tokens.executionToken, {
        workerId: "worker-1",
      }),
    ).rejects.toMatchObject({
      code: "worker_auth_invalid",
      statusCode: 401,
    });
  });

  it("binds worker token sets to the first approved device and accepts the same device proof", async () => {
    const {
      issueWorkerAccessTokens,
      signWorkerDeviceProofForTest,
      verifyWorkerAccessToken,
      resetWorkerDeviceBindingStateForTest,
    } = await import("../workerAuthService");
    resetWorkerDeviceBindingStateForTest();

    const deviceKey = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const publicKey = await crypto.subtle.exportKey("spki", deviceKey.publicKey);
    const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(publicKey).toString("base64").match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
    const tokens = issueWorkerAccessTokens({
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "openclaw_gateway",
      deviceBinding: {
        deviceId: "worker-app-install-1",
        machineFingerprint: "machine-a",
        publicKey: publicKeyPem,
      },
    });
    const proof = await signWorkerDeviceProofForTest({
      token: tokens.executionToken,
      method: "POST",
      path: "/api/workers/worker-1/heartbeat",
      nonce: "nonce-1",
      privateKey: deviceKey.privateKey,
    });

    const auth = await verifyWorkerAccessToken(tokens.executionToken, {
      workerId: "worker-1",
      allowedTokenUses: ["worker_execution"],
      requiredScopes: ["workers:heartbeat"],
      requestProof: proof,
    });

    expect(auth.deviceId).toBe("worker-app-install-1");
    expect(auth.workerConnectionId).toBeTruthy();
  });

  it("rejects and revokes a copied worker token signed by a different device", async () => {
    const {
      issueWorkerAccessTokens,
      signWorkerDeviceProofForTest,
      verifyWorkerAccessToken,
      resetWorkerDeviceBindingStateForTest,
    } = await import("../workerAuthService");
    resetWorkerDeviceBindingStateForTest();

    const originalKey = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const otherKey = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const originalPublicKey = await crypto.subtle.exportKey("spki", originalKey.publicKey);
    const otherPublicKey = await crypto.subtle.exportKey("spki", otherKey.publicKey);
    const originalPublicKeyPem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(originalPublicKey).toString("base64").match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
    const otherPublicKeyPem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(otherPublicKey).toString("base64").match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
    const tokens = issueWorkerAccessTokens({
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "openclaw_gateway",
      deviceBinding: {
        deviceId: "worker-app-install-1",
        machineFingerprint: "machine-a",
        publicKey: originalPublicKeyPem,
      },
    });
    const proof = await signWorkerDeviceProofForTest({
      token: tokens.executionToken,
      method: "POST",
      path: "/api/workers/worker-1/heartbeat",
      nonce: "nonce-2",
      privateKey: otherKey.privateKey,
      publicKey: otherPublicKeyPem,
    });

    await expect(
      verifyWorkerAccessToken(tokens.executionToken, {
        workerId: "worker-1",
        allowedTokenUses: ["worker_execution"],
        requiredScopes: ["workers:heartbeat"],
        requestProof: proof,
      }),
    ).rejects.toMatchObject({
      code: "worker_device_mismatch",
      statusCode: 401,
    });
    expect(mockRevokeJti).toHaveBeenCalled();
  });

  it("rejects refresh replay from a different device and blocks the worker connection", async () => {
    const {
      issueWorkerAccessTokens,
      refreshWorkerAccessTokens,
      signWorkerDeviceProofForTest,
      verifyWorkerAccessToken,
      resetWorkerDeviceBindingStateForTest,
    } = await import("../workerAuthService");
    resetWorkerDeviceBindingStateForTest();

    const originalKey = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const otherKey = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const originalPublicKey = await crypto.subtle.exportKey("spki", originalKey.publicKey);
    const otherPublicKey = await crypto.subtle.exportKey("spki", otherKey.publicKey);
    const originalPublicKeyPem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(originalPublicKey).toString("base64").match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
    const otherPublicKeyPem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(otherPublicKey).toString("base64").match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
    const tokens = issueWorkerAccessTokens({
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "openclaw_gateway",
      deviceBinding: {
        deviceId: "worker-app-install-1",
        machineFingerprint: "machine-a",
        publicKey: originalPublicKeyPem,
      },
    });
    const replayProof = await signWorkerDeviceProofForTest({
      token: tokens.refreshToken,
      method: "POST",
      path: "/api/workers/connect/refresh",
      nonce: "refresh-replay-1",
      privateKey: otherKey.privateKey,
      publicKey: otherPublicKeyPem,
    });

    await expect(
      refreshWorkerAccessTokens(tokens.refreshToken, {
        requestProof: replayProof,
      }),
    ).rejects.toMatchObject({
      code: "worker_device_mismatch",
      statusCode: 401,
    });

    const originalProofAfterBlock = await signWorkerDeviceProofForTest({
      token: tokens.executionToken,
      method: "POST",
      path: "/api/workers/worker-1/heartbeat",
      nonce: "after-block-1",
      privateKey: originalKey.privateKey,
    });
    await expect(
      verifyWorkerAccessToken(tokens.executionToken, {
        workerId: "worker-1",
        requestProof: originalProofAfterBlock,
      }),
    ).rejects.toMatchObject({
      code: "worker_connection_blocked",
      statusCode: 401,
    });
  });

  // Rotation is single-use AND non-atomic across the network: the server
  // revokes the presented jti before the client can persist the replacement.
  // Without a grace window, a client that never receives or never stores that
  // response is locked out for the token's full 7-day life, and two of the
  // Worker App's own refresh drivers racing produces the same 401 on a
  // perfectly valid connection.
  describe("refresh reuse grace window", () => {
    /**
     * Marks every TOKEN jti as revoked while leaving the
     * `worker_connection:<id>` denylist key alone. Blanket-revoking would also
     * trip `assertConnectionNotBlocked`, which reuses the same denylist and
     * would fail these cases for the wrong reason.
     */
    function revokeEveryTokenJti(): void {
      mockIsJtiRevoked.mockImplementation(async (jti: string) =>
        !String(jti).startsWith("worker_connection:"),
      );
    }

    it("returns the SAME token set when a rotated refresh token is replayed", async () => {
      const {
        __clearWorkerRefreshGraceForTests,
        issueWorkerAccessTokens,
        refreshWorkerAccessTokens,
      } = await import("../workerAuthService");
      __clearWorkerRefreshGraceForTests();

      const tokens = issueWorkerAccessTokens({
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "openclaw_gateway",
      });

      const first = await refreshWorkerAccessTokens(tokens.refreshToken);
      // The real server now reports this jti as revoked — the replay must
      // survive that, which is the whole point of the window.
      revokeEveryTokenJti();
      const second = await refreshWorkerAccessTokens(tokens.refreshToken);

      expect(second).toEqual(first);
    });

    it("does not rotate again on a replay", async () => {
      const {
        __clearWorkerRefreshGraceForTests,
        issueWorkerAccessTokens,
        refreshWorkerAccessTokens,
      } = await import("../workerAuthService");
      __clearWorkerRefreshGraceForTests();

      const tokens = issueWorkerAccessTokens({
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "openclaw_gateway",
      });

      await refreshWorkerAccessTokens(tokens.refreshToken);
      const revokeCallsAfterFirst = mockRevokeJti.mock.calls.length;
      revokeEveryTokenJti();
      await refreshWorkerAccessTokens(tokens.refreshToken);

      expect(mockRevokeJti.mock.calls.length).toBe(revokeCallsAfterFirst);
    });

    it("still rejects a revoked token that was never rotated through this process", async () => {
      const { __clearWorkerRefreshGraceForTests, issueWorkerAccessTokens, refreshWorkerAccessTokens } =
        await import("../workerAuthService");
      __clearWorkerRefreshGraceForTests();

      const tokens = issueWorkerAccessTokens({
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "openclaw_gateway",
      });
      // No prior rotation → nothing in the grace map → the denylist is absolute.
      revokeEveryTokenJti();

      await expect(refreshWorkerAccessTokens(tokens.refreshToken)).rejects.toMatchObject({
        code: "worker_auth_invalid",
        statusCode: 401,
      });
    });

    it("does not extend the grace window to execution tokens", async () => {
      const {
        __clearWorkerRefreshGraceForTests,
        issueWorkerAccessTokens,
        refreshWorkerAccessTokens,
        verifyWorkerAccessToken,
      } = await import("../workerAuthService");
      __clearWorkerRefreshGraceForTests();

      const tokens = issueWorkerAccessTokens({
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "openclaw_gateway",
      });
      await refreshWorkerAccessTokens(tokens.refreshToken);
      revokeEveryTokenJti();

      // The grace window is a refresh-path concession only. A revoked
      // execution token must stay dead on every other route.
      await expect(
        verifyWorkerAccessToken(tokens.executionToken, { workerId: "worker-1" }),
      ).rejects.toMatchObject({
        code: "worker_auth_invalid",
        statusCode: 401,
      });
    });

    it("issues a fresh set for a DIFFERENT refresh token while one is in grace", async () => {
      const {
        __clearWorkerRefreshGraceForTests,
        issueWorkerAccessTokens,
        refreshWorkerAccessTokens,
      } = await import("../workerAuthService");
      __clearWorkerRefreshGraceForTests();

      const first = issueWorkerAccessTokens({
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "openclaw_gateway",
      });
      const second = issueWorkerAccessTokens({
        tenantId: "tenant-1",
        workerId: "worker-2",
        runtimeType: "openclaw_gateway",
      });

      const firstRotation = await refreshWorkerAccessTokens(first.refreshToken);
      const secondRotation = await refreshWorkerAccessTokens(second.refreshToken);

      expect(secondRotation.executionToken).not.toBe(firstRotation.executionToken);
    });
  });
});
