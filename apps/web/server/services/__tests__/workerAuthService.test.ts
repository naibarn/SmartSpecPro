import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET ??= "worker-auth-service-test-secret-0123456789";

const { mockGetTenantFeatureFlags, mockIsJtiRevoked } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
  mockIsJtiRevoked: vi.fn(),
}));

vi.mock("../tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

vi.mock("../../_core/revocation", () => ({
  isJtiRevoked: mockIsJtiRevoked,
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
});
