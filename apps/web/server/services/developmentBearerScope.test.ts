import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => { process.env.JWT_SECRET = "development-scope-fixture-only-0123456789"; return { revoked: vi.fn(async () => false) }; });
vi.mock("../_core/revocation", () => ({ isJtiRevoked: mocks.revoked }));
import { signBearerToken } from "../_core/tokens";
import { rejectScopedAdminMutation, requireDevelopmentBearerScope } from "./developmentBearerScope";
const request = (scopes: string[], changes = {}) => ({ headers: { authorization: `Bearer ${signBearerToken({ sub: "owner-fixture", userId: 17, type: "access", scopes, jti: "test-jti", ...changes })}` } });
describe("existing user consent bounds engineering bearer operations", () => {
  beforeEach(() => { mocks.revoked.mockReset().mockResolvedValue(false); });
  it("requires development consent rather than reusing a read or MCP write token", async () => {
    await expect(requireDevelopmentBearerScope(request(["mcp:read"]))).rejects.toThrow("DEVELOPMENT_RUN_SCOPE_REQUIRED");
    await expect(requireDevelopmentBearerScope(request(["mcp:write", "llm:chat"]))).rejects.toThrow("DEVELOPMENT_RUN_SCOPE_REQUIRED");
    await expect(requireDevelopmentBearerScope(request(["development:run"])) ).resolves.toBeUndefined();
  });
  it("preserves normal authenticated Owner cookie and session-shaped bearer access", async () => {
    await expect(requireDevelopmentBearerScope({ headers: {} })).resolves.toBeUndefined();
    await expect(rejectScopedAdminMutation({ headers: {} })).resolves.toBeUndefined();
    const token = signBearerToken({ sub: "owner-fixture", openId: "owner-fixture", appId: "app" } as any);
    await expect(requireDevelopmentBearerScope({ headers: { authorization: `Bearer ${token}` } })).resolves.toBeUndefined();
  });
  it("never turns engineering or MCP consent into Production Admin mutation authority", async () => {
    for (const scopes of [["development:run"], ["mcp:read"], ["mcp:write"]])
      await expect(rejectScopedAdminMutation(request(scopes))).rejects.toThrow("SCOPED_TOKEN_ADMIN_MUTATION_DENIED");
  });
  it("rejects expired, revoked, unsigned and refresh credentials", async () => {
    const expired = signBearerToken({ sub: "owner-fixture", userId: 17, type: "access", scopes: ["development:run"] }, -60);
    await expect(requireDevelopmentBearerScope({ headers: { authorization: `Bearer ${expired}` } })).rejects.toThrow();
    await expect(requireDevelopmentBearerScope(request(["development:run"], { type: "refresh" }))).rejects.toThrow("ACCESS_TOKEN_REQUIRED");
    await expect(requireDevelopmentBearerScope({ headers: { authorization: "Bearer invalid" } })).rejects.toThrow("BEARER_INVALID");
    mocks.revoked.mockResolvedValue(true);
    await expect(requireDevelopmentBearerScope(request(["development:run"])) ).rejects.toThrow("BEARER_INVALID");
  });
});
