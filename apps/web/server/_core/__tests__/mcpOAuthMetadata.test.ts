import { describe, expect, it, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import {
  getMcpProtectedResourceMetadata,
  mcpBearerChallenge,
  setMcpBearerChallenge,
} from "../mcpOAuthMetadata";

const savedEnv = {
  resource: process.env.MCP_OAUTH_RESOURCE,
  issuer: process.env.MCP_OAUTH_ISSUER,
  baseUrl: process.env.MCP_PUBLIC_BASE_URL,
  inboundEnabled: process.env.MCP_OAUTH_INBOUND_ENABLED,
  jwksUri: process.env.MCP_OAUTH_JWKS_URI,
  audience: process.env.MCP_OAUTH_AUDIENCE,
  nodeEnv: process.env.NODE_ENV,
};

afterEach(() => {
  for (const [key, value] of Object.entries({
    MCP_OAUTH_RESOURCE: savedEnv.resource,
    MCP_OAUTH_ISSUER: savedEnv.issuer,
    MCP_PUBLIC_BASE_URL: savedEnv.baseUrl,
    MCP_OAUTH_INBOUND_ENABLED: savedEnv.inboundEnabled,
    MCP_OAUTH_JWKS_URI: savedEnv.jwksUri,
    MCP_OAUTH_AUDIENCE: savedEnv.audience,
    NODE_ENV: savedEnv.nodeEnv,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("MCP protected-resource OAuth metadata", () => {
  it("fails closed when the resource or authorization server is missing", () => {
    delete process.env.MCP_OAUTH_RESOURCE;
    delete process.env.MCP_OAUTH_ISSUER;
    delete process.env.MCP_OAUTH_INBOUND_ENABLED;
    delete process.env.MCP_OAUTH_JWKS_URI;
    delete process.env.MCP_OAUTH_AUDIENCE;
    expect(getMcpProtectedResourceMetadata()).toBeNull();
  });

  it("rejects non-http issuer values and returns bounded metadata", () => {
    process.env.MCP_OAUTH_RESOURCE = "https://smartaihub.app/v1/mcp";
    process.env.MCP_OAUTH_ISSUER = "file:///etc/passwd,https://user:secret@issuer.example.test/,https://issuer.example.test/";
    process.env.MCP_OAUTH_INBOUND_ENABLED = "true";
    process.env.MCP_OAUTH_JWKS_URI = "https://issuer.example.test/.well-known/jwks.json";
    process.env.MCP_OAUTH_AUDIENCE = "smartaihub-mcp";
    const metadata = getMcpProtectedResourceMetadata();
    expect(metadata?.authorization_servers).toEqual(["https://issuer.example.test"]);
    expect(metadata?.bearer_methods_supported).toEqual(["header"]);
  });

  it("creates a Bearer challenge with deployment-configured metadata only", async () => {
    process.env.MCP_PUBLIC_BASE_URL = "https://smartaihub.app/";
    process.env.MCP_OAUTH_INBOUND_ENABLED = "true";
    process.env.MCP_OAUTH_JWKS_URI = "https://issuer.example.test/.well-known/jwks.json";
    process.env.MCP_OAUTH_AUDIENCE = "smartaihub-mcp";
    expect(mcpBearerChallenge({ error: "insufficient_scope", scope: "mcp:read" })).toContain(
      'resource_metadata="https://smartaihub.app/.well-known/oauth-protected-resource"',
    );
    expect(mcpBearerChallenge()).not.toContain("undefined");

    const app = express();
    app.get("/v1/mcp", (req, res) => {
      setMcpBearerChallenge(req, res, { error: "invalid_token" });
      res.status(401).json({ error: "invalid_token" });
    });
    const response = await request(app).get("/v1/mcp");
    expect(response.headers["www-authenticate"]).toContain('error="invalid_token"');
  });

  it("keeps the canonical production discovery link when the base URL is missing", () => {
    delete process.env.MCP_PUBLIC_BASE_URL;
    process.env.NODE_ENV = "production";
    process.env.MCP_OAUTH_INBOUND_ENABLED = "true";
    process.env.MCP_OAUTH_JWKS_URI = "https://smartaihub.app/.well-known/jwks.json";
    process.env.MCP_OAUTH_AUDIENCE = "smartaihub-mcp";
    expect(mcpBearerChallenge()).toContain(
      'resource_metadata="https://smartaihub.app/.well-known/oauth-protected-resource"',
    );
  });
});
