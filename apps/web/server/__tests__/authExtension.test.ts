import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock tokens.ts to avoid JWT_SECRET module-level check
vi.mock("../_core/tokens", () => ({
  verifyBearerToken: vi.fn().mockRejectedValue(new Error("Invalid token")),
  signBearerToken: vi.fn().mockReturnValue("mock-token"),
}));

// Mock apiKeyService before importing authz
vi.mock("../services/apiKeyService", () => ({
  validateKey: vi.fn(),
}));

// Mock sdk
vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(),
  },
}));

// Mock revocation
vi.mock("../_core/revocation", () => ({
  isJtiRevoked: vi.fn().mockResolvedValue(false),
}));

// Mock ENV
vi.mock("../_core/env", () => ({
  ENV: {
    mcpServerToken: "test-mcp-token",
    webGatewayToken: "test-gateway-token",
    apiKeyHmacSecret: "test-hmac-key.short",
  },
}));

import { authorizeRequest } from "../_core/authz";
import { validateKey } from "../services/apiKeyService";
import { sdk } from "../_core/sdk";

function makeReq(headers: Record<string, string> = {}, cookies: Record<string, string> = {}) {
  return {
    headers,
    cookies,
  } as any;
}

describe("authExtension — API key auth in authorizeRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects sk-ssp_ prefix and routes to API key validation", async () => {
    (validateKey as any).mockResolvedValue({
      userId: 42,
      tenantId: "tenant-uuid-abc",
      mode: "api_key",
      apiKeyId: "key-id-123",
      scopes: ["skills:execute"],
    });

    const req = makeReq({ authorization: "Bearer sk-ssp_abc12345_someRandomKeyData123" });
    const result = await authorizeRequest(req, { allowBearer: true, allowSession: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mode).toBe("api_key");
    }
    expect(validateKey).toHaveBeenCalledWith("sk-ssp_abc12345_someRandomKeyData123");
  });

  it("falls through to JWT for non-sk-ssp_ tokens", async () => {
    const req = makeReq({ authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.test" });
    // JWT verify will fail, but validateKey should NOT be called
    await authorizeRequest(req, { allowBearer: true, allowSession: false });

    expect(validateKey).not.toHaveBeenCalled();
  });

  it("returns mode='api_key' with correct AuthContext fields", async () => {
    (validateKey as any).mockResolvedValue({
      userId: 42,
      tenantId: "tenant-uuid-abc",
      mode: "api_key",
      apiKeyId: "key-id-123",
      scopes: ["skills:execute", "skills:list"],
    });

    const req = makeReq({ authorization: "Bearer sk-ssp_abc12345_someRandomKeyData123" });
    const result = await authorizeRequest(req, { allowBearer: true, allowSession: false });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        mode: "api_key",
        sub: "42",
        tenantId: "tenant-uuid-abc",
        apiKeyId: "key-id-123",
        scopes: ["skills:execute", "skills:list"],
        userId: 42,
      }),
    );
  });

  it("returns tenantId as string (varchar(36))", async () => {
    (validateKey as any).mockResolvedValue({
      userId: 1,
      tenantId: "a1b2c3d4-e5f6-7890-abcd-ef0123456789",
      mode: "api_key",
      apiKeyId: "kid",
      scopes: [],
    });

    const req = makeReq({ authorization: "Bearer sk-ssp_a1b2c3d4_test" });
    const result = await authorizeRequest(req, { allowBearer: true, allowSession: false });

    expect(result.ok).toBe(true);
    if (result.ok && result.mode === "api_key") {
      expect(typeof result.tenantId).toBe("string");
    }
  });

  it("existing static token auth still works after API key auth is added", async () => {
    const req = makeReq({ authorization: "Bearer test-mcp-token" });
    const result = await authorizeRequest(req, { allowBearer: true, allowSession: false });

    expect(result).toEqual({
      ok: true,
      mode: "bearer",
      sub: "static",
      scopes: ["mcp:read", "mcp:write"],
    });
    expect(validateKey).not.toHaveBeenCalled();
  });

  it("existing session auth still works after API key auth is added", async () => {
    (sdk.authenticateRequest as any).mockResolvedValue({ id: 5, openId: "open-5" });
    const req = makeReq({}, { session: "valid" });
    const result = await authorizeRequest(req, { allowBearer: false, allowSession: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mode).toBe("session");
    }
  });

  it("returns ok: false when API key is invalid", async () => {
    (validateKey as any).mockResolvedValue(null);

    const req = makeReq({ authorization: "Bearer sk-ssp_abc12345_invalid" });
    const result = await authorizeRequest(req, { allowBearer: true, allowSession: false });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid API key");
    }
  });

  it("handles malformed sk-ssp_ key (too short)", async () => {
    (validateKey as any).mockResolvedValue(null);

    const req = makeReq({ authorization: "Bearer sk-ssp_" });
    const result = await authorizeRequest(req, { allowBearer: true, allowSession: false });

    expect(result.ok).toBe(false);
  });
});
