import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

import {
  getMcpOAuthJwksConfig,
  resetMcpOAuthJwksCacheForTests,
  verifyMcpOAuthBearerToken,
} from "../mcpOAuthJwks";

const savedEnv = { ...process.env };

afterEach(() => {
  process.env = { ...savedEnv };
  resetMcpOAuthJwksCacheForTests();
});

describe("MCP inbound OAuth JWKS verification", () => {
  it("fails closed when inbound verification is only partially configured", () => {
    process.env.MCP_OAUTH_INBOUND_ENABLED = "true";
    process.env.MCP_OAUTH_ISSUER = "https://issuer.example.test";
    process.env.MCP_OAUTH_AUDIENCE = "smartaihub-mcp";
    process.env.MCP_OAUTH_RESOURCE = "https://smartaihub.app/v1/mcp";
    delete process.env.MCP_OAUTH_JWKS_URI;
    expect(getMcpOAuthJwksConfig()).toBeNull();
  });

  it("verifies issuer, audience, signature, tenant, user, and scopes from a JWKS endpoint", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "mcp-test-key";
    const server = http.createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("JWKS test server did not start");

    process.env.MCP_OAUTH_INBOUND_ENABLED = "true";
    process.env.MCP_OAUTH_ISSUER = "https://issuer.example.test";
    process.env.MCP_OAUTH_AUDIENCE = "smartaihub-mcp";
    process.env.MCP_OAUTH_JWKS_URI = `https://127.0.0.1:${address.port}/jwks`;
    process.env.MCP_OAUTH_RESOURCE = "https://smartaihub.app/v1/mcp";

    // jose requires an HTTPS JWKS URL in production configuration. The test
    // uses a mocked fetch boundary so no plaintext URL can be deployed.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input, init) => {
      const response = await originalFetch(`http://127.0.0.1:${address.port}/jwks`, init);
      return response;
    }) as typeof fetch;
    try {
      const token = await new SignJWT({
        tenant_id: "tenant-1",
        user_id: 24,
        scope: "mcp:read media:download",
        resource: "https://smartaihub.app/v1/mcp",
      })
        .setProtectedHeader({ alg: "RS256", kid: "mcp-test-key" })
        .setSubject("user-24")
        .setIssuer("https://issuer.example.test")
        .setAudience("smartaihub-mcp")
        .setIssuedAt()
        .setExpirationTime("5m")
        .setJti("oauth-jti-1")
        .sign(privateKey);

      await expect(verifyMcpOAuthBearerToken(token)).resolves.toMatchObject({
        sub: "user-24",
        tenantId: "tenant-1",
        userId: 24,
        scopes: ["mcp:read", "media:download"],
        jti: "oauth-jti-1",
      });
    } finally {
      globalThis.fetch = originalFetch;
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("rejects a token with the wrong audience", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "wrong-audience-key";
    const server = http.createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("JWKS test server did not start");
    process.env.MCP_OAUTH_INBOUND_ENABLED = "true";
    process.env.MCP_OAUTH_ISSUER = "https://issuer.example.test";
    process.env.MCP_OAUTH_AUDIENCE = "smartaihub-mcp";
    process.env.MCP_OAUTH_JWKS_URI = `https://127.0.0.1:${address.port}/jwks`;
    process.env.MCP_OAUTH_RESOURCE = "https://smartaihub.app/v1/mcp";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input, init) => originalFetch(`http://127.0.0.1:${address.port}/jwks`, init)) as typeof fetch;
    try {
      const token = await new SignJWT({ tenant_id: "tenant-1", user_id: 24 })
        .setProtectedHeader({ alg: "RS256", kid: "wrong-audience-key" })
        .setSubject("user-24")
        .setIssuer("https://issuer.example.test")
        .setAudience("another-service")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
      await expect(verifyMcpOAuthBearerToken(token)).rejects.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
