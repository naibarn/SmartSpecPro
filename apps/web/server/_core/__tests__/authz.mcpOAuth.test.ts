import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyMcpOAuthBearerToken: vi.fn(),
  verifyBearerToken: vi.fn(),
}));

vi.mock("../env", () => ({ ENV: { mcpServerToken: "", webGatewayToken: "" } }));
vi.mock("../sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));
vi.mock("../tokens", () => ({ verifyBearerToken: mocks.verifyBearerToken, hasScope: vi.fn() }));
vi.mock("../revocation", () => ({ isJtiRevoked: vi.fn(async () => false) }));
vi.mock("../../services/apiKeyService", () => ({ validateKey: vi.fn(async () => null) }));
vi.mock("../../services/redis", () => ({ getRedisClient: vi.fn(() => null) }));
vi.mock("../../services/appRuntimeConfig", () => ({
  getCachedMcpServerToken: vi.fn(() => ""),
  getCachedPreferredInternalToken: vi.fn(() => ""),
}));
vi.mock("../../services/workerDelegationService", () => ({ verifyDelegatedWorkerBearerToken: vi.fn() }));
vi.mock("../../services/mcpOAuthAuthorizationService", () => ({
  isMcpOAuthGrantActive: vi.fn(async () => true),
}));
vi.mock("../../services/hermesAgentPairingService", () => ({ hermesAgentDeviceRevocationKey: vi.fn(() => "revocation-key") }));
const connectedDeviceMocks = vi.hoisted(() => ({
  isConnectedDeviceRevoked: vi.fn(async () => false),
  applyConnectedDeviceScopePolicy: vi.fn(async (input: { grantedScopes: string[] }) => input.grantedScopes),
}));
vi.mock("../../services/connectedDeviceService", () => connectedDeviceMocks);
vi.mock("../mcpOAuthJwks", () => ({
  getMcpOAuthJwksConfig: vi.fn(() => ({ issuer: "https://issuer.example.test", audience: "smartaihub-mcp", jwksUri: "https://issuer.example.test/jwks", resource: "https://smartaihub.app/v1/mcp" })),
  verifyMcpOAuthBearerToken: mocks.verifyMcpOAuthBearerToken,
}));

import { authorizeRequest } from "../authz";

function requestWithToken(token: string, path = "/v1/mcp") {
  return { headers: { authorization: `Bearer ${token}` }, originalUrl: path, path } as any;
}

describe("authorizeRequest inbound MCP OAuth integration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps a verified JWKS identity into the normal MCP bearer principal", async () => {
    mocks.verifyMcpOAuthBearerToken.mockResolvedValue({
      sub: "user-24",
      tenantId: "tenant-1",
      userId: 24,
      scopes: ["mcp:read", "media:download"],
      jti: "oauth-jti-1",
      issuer: "https://issuer.example.test",
    });
    await expect(authorizeRequest(requestWithToken("oauth-token"), { allowBearer: true, allowSession: false }))
      .resolves.toMatchObject({
        ok: true,
        mode: "bearer",
        sub: "user-24",
        tenantId: "tenant-1",
        userId: 24,
        scopes: ["mcp:read", "media:download"],
        tokenUse: "mcp_oauth",
      });
  });

  it("does not fall back to local JWT authorization when configured OAuth verification fails", async () => {
    mocks.verifyMcpOAuthBearerToken.mockRejectedValue(new Error("bad signature"));
    await expect(authorizeRequest(requestWithToken("oauth-token"), { allowBearer: true, allowSession: false }))
      .resolves.toEqual({ ok: false, error: "Invalid OAuth token" });
  });

  it("keeps Hermes pairing on the local verifier when OAuth is enabled", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ tokenUse: "mcp_agent_pairing" })).toString("base64url");
    const pairingToken = `${header}.${payload}.signature`;
    mocks.verifyBearerToken.mockResolvedValue({
      sub: "24",
      tenantId: "tenant-1",
      userId: 24,
      deviceIdHash: "a".repeat(64),
      tokenUse: "mcp_agent_pairing",
      type: "access",
      jti: "pairing-jti",
      scopes: ["mcp:read", "media:download"],
    });
    connectedDeviceMocks.applyConnectedDeviceScopePolicy.mockResolvedValue(["mcp:read"]);
    await expect(authorizeRequest(requestWithToken(pairingToken), { allowBearer: true, allowSession: false }))
      .resolves.toMatchObject({ ok: true, mode: "agent_pairing", scopes: ["mcp:read"] });
    expect(mocks.verifyMcpOAuthBearerToken).not.toHaveBeenCalled();
  });

  it("applies the current per-device permission policy to OAuth scopes", async () => {
    mocks.verifyMcpOAuthBearerToken.mockResolvedValue({
      sub: "user-24",
      tenantId: "tenant-1",
      userId: 24,
      grantId: "grant-1",
      scopes: ["mcp:read", "media:download"],
    });
    connectedDeviceMocks.applyConnectedDeviceScopePolicy.mockResolvedValue(["mcp:read"]);
    await expect(authorizeRequest(requestWithToken("oauth-token"), { allowBearer: true, allowSession: false }))
      .resolves.toMatchObject({ ok: true, scopes: ["mcp:read"] });
    expect(connectedDeviceMocks.applyConnectedDeviceScopePolicy).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      ownerUserId: 24,
      authKind: "mcp_oauth",
      grantedScopes: ["mcp:read", "media:download"],
      grantId: "grant-1",
    });
  });

  it("does not let MCP OAuth configuration break local bearer auth on non-MCP routes", async () => {
    mocks.verifyMcpOAuthBearerToken.mockResolvedValue({
      sub: "oauth-user",
      tenantId: "tenant-1",
      userId: 24,
      scopes: ["mcp:read"],
    });
    mocks.verifyBearerToken.mockResolvedValue({
      sub: "24",
      tenantId: "tenant-1",
      userId: 24,
      scopes: ["jobs:read"],
      type: "access",
    });
    await expect(authorizeRequest(requestWithToken("local-token", "/api/worker-jobs"), { allowBearer: true, allowSession: false }))
      .resolves.toMatchObject({ ok: true, mode: "bearer", userId: 24, scopes: ["jobs:read"] });
    expect(mocks.verifyMcpOAuthBearerToken).not.toHaveBeenCalled();
  });
});
