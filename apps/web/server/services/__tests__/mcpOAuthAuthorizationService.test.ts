import { afterEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";

import {
  getMcpOAuthServerConfig,
  hashMcpOAuthSecret,
  normalizeMcpOAuthScopes,
  validateMcpOAuthRedirectUri,
  verifyMcpOAuthPkce,
} from "../mcpOAuthAuthorizationService";

const saved = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in saved)) delete process.env[key];
  }
  Object.assign(process.env, saved);
});

describe("MCP OAuth authorization contract", () => {
  it("fails closed when the issuer is not HTTPS", () => {
    process.env.MCP_OAUTH_ISSUER = "http://smartaihub.app";
    process.env.MCP_OAUTH_RESOURCE = "http://smartaihub.app/v1/mcp";
    expect(getMcpOAuthServerConfig()).toBeNull();
  });

  it("accepts only exact HTTPS or explicit loopback redirect URIs", () => {
    expect(validateMcpOAuthRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(validateMcpOAuthRedirectUri("http://127.0.0.1:43123/callback")).toBe(true);
    expect(validateMcpOAuthRedirectUri("http://localhost/callback")).toBe(false);
    expect(validateMcpOAuthRedirectUri("https://example.com/callback?next=http://evil")).toBe(false);
    expect(validateMcpOAuthRedirectUri("https://*.example.com/callback")).toBe(false);
  });

  it("normalizes scopes to the server allow-list", () => {
    expect(normalizeMcpOAuthScopes("mcp:read unknown media:read mcp:read", ["mcp:read", "media:read"])).toEqual(["mcp:read", "media:read"]);
  });

  it("maps legacy model and render names to registry-canonical scopes", () => {
    expect(normalizeMcpOAuthScopes(
      "mcp:read models:read render:submit render:read render:cancel",
      ["mcp:read", "llm:chat", "remotion:submit", "remotion:read", "remotion:cancel"],
    )).toEqual([
      "mcp:read",
      "llm:chat",
      "remotion:submit",
      "remotion:read",
      "remotion:cancel",
    ]);
  });

  it("canonicalizes legacy names in deployment scope metadata", () => {
    process.env.MCP_OAUTH_ISSUER = "https://smartaihub.app";
    process.env.MCP_OAUTH_RESOURCE = "https://smartaihub.app/v1/mcp";
    process.env.MCP_OAUTH_JWKS_URI = "https://smartaihub.app/.well-known/jwks.json";
    process.env.MCP_OAUTH_SCOPES_SUPPORTED = "mcp:read,models:read,render:submit,render:read,render:cancel";
    expect(getMcpOAuthServerConfig()?.scopesSupported).toEqual([
      "mcp:read",
      "llm:chat",
      "remotion:submit",
      "remotion:read",
      "remotion:cancel",
    ]);
  });

  it("verifies RFC 7636 S256 and hashes opaque secrets", () => {
    const verifier = "a".repeat(43);
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    expect(verifyMcpOAuthPkce(verifier, challenge)).toBe(true);
    expect(verifyMcpOAuthPkce(verifier, "not-a-valid-challenge")).toBe(false);
    expect(hashMcpOAuthSecret("refresh_secret")).toMatch(/^[a-f0-9]{64}$/);
  });
});
