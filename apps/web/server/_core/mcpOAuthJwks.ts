import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import { parseScopes } from "./tokens";
import { getMcpOAuthPublicJwks } from "../services/mcpOAuthAuthorizationService";
import { getCachedMcpRuntimeConfig } from "../services/mcpRuntimeConfig";

export type McpOAuthIdentity = {
  sub: string;
  tenantId: string;
  userId: number;
  scopes: string[];
  grantId?: string;
  jti?: string;
  issuer: string;
};

type McpOAuthConfig = {
  issuer: string;
  audience: string;
  jwksUri: string;
  resource: string;
};

let cachedRemoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedRemoteJwksUri = "";

function safeUrl(value: string | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function getMcpOAuthJwksConfig(): McpOAuthConfig | null {
  const runtime = getCachedMcpRuntimeConfig();
  if (!runtime.oauthInboundEnabled) return null;
  const issuer = safeUrl(runtime.oauthIssuer);
  const jwksUri = safeUrl(runtime.oauthJwksUri);
  const resource = safeUrl(runtime.oauthResource);
  const audience = runtime.oauthAudience.trim();
  if (!issuer || !jwksUri || !resource || !audience || audience.length > 256) return null;
  return { issuer, audience, jwksUri, resource };
}

function remoteJwks(uri: string) {
  if (!cachedRemoteJwks || cachedRemoteJwksUri !== uri) {
    cachedRemoteJwks = createRemoteJWKSet(new URL(uri));
    cachedRemoteJwksUri = uri;
  }
  return cachedRemoteJwks;
}

async function verificationKey(config: McpOAuthConfig): Promise<any> {
  // First-party deployments verify against the configured key in-process. This
  // avoids a self-request through the public proxy on every MCP call. External
  // issuers continue to use the cached remote JWKS resolver below.
  if (config.issuer === getCachedMcpRuntimeConfig().oauthIssuer.replace(/\/$/, "")) {
    const jwks = await getMcpOAuthPublicJwks();
    if (jwks?.keys.length) return createLocalJWKSet(jwks);
  }
  return remoteJwks(config.jwksUri);
}

function positiveUserId(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function scopesFromClaims(payload: JWTPayload): string[] {
  const arrayScopes = Array.isArray(payload.scopes)
    ? payload.scopes.filter((scope): scope is string => typeof scope === "string")
    : [];
  const stringScopes = typeof payload.scope === "string" ? parseScopes(payload.scope) : [];
  return Array.from(new Set([...arrayScopes, ...stringScopes])).slice(0, 128);
}

/**
 * Verify an inbound OAuth access token using the deployment's JWKS endpoint.
 * This is deliberately opt-in and requires all issuer/audience/JWKS values;
 * a partially configured deployment must never advertise OAuth or accept a
 * token without a verifiable tenant/user mapping.
 */
export async function verifyMcpOAuthBearerToken(token: string): Promise<McpOAuthIdentity> {
  const config = getMcpOAuthJwksConfig();
  if (!config) throw new Error("MCP OAuth JWKS verification is not configured");

  const { payload } = await jwtVerify(token, await verificationKey(config), {
    issuer: config.issuer,
    audience: config.audience,
    algorithms: ["RS256", "ES256"],
  });

  const declaredResource = payload.resource;
  const resources = Array.isArray(declaredResource)
    ? declaredResource.filter((value): value is string => typeof value === "string")
    : typeof declaredResource === "string" ? [declaredResource] : [];
  if (!resources.includes(config.resource)) throw new Error("MCP OAuth token resource does not match");

  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  const tenantId = typeof payload.tenantId === "string"
    ? payload.tenantId.trim()
    : typeof payload.tenant_id === "string"
      ? payload.tenant_id.trim()
      : "";
  const userId = positiveUserId(payload.userId ?? payload.user_id ?? sub);
  const grantId = typeof payload.grantId === "string" ? payload.grantId.trim() : "";
  const firstPartyGrantRequired = getCachedMcpRuntimeConfig().oauthAuthorizationServerEnabled;
  if (!sub || !tenantId || !userId || firstPartyGrantRequired && !grantId) throw new Error("MCP OAuth token has no valid tenant/user context");

  return {
    sub,
    tenantId,
    userId,
    scopes: scopesFromClaims(payload),
    ...(grantId ? { grantId } : {}),
    ...(typeof payload.jti === "string" && payload.jti ? { jti: payload.jti } : {}),
    issuer: config.issuer,
  };
}

export function resetMcpOAuthJwksCacheForTests(): void {
  cachedRemoteJwks = null;
  cachedRemoteJwksUri = "";
}
