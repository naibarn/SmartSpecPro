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
    mockGetTenantFeatureFlags.mockResolvedValue({ openClawExternalRuntime: true });
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
    mockGetTenantFeatureFlags.mockResolvedValue({ openClawExternalRuntime: false });

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
});
