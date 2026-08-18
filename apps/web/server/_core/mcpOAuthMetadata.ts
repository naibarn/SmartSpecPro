import type { Request, Response } from "express";
import {
  MCP_OAUTH_DEFAULT_SCOPES,
  MCP_OAUTH_LEGACY_SCOPE_ALIASES,
} from "../services/mcpOAuthAuthorizationService";
import { getCachedMcpRuntimeConfig } from "../services/mcpRuntimeConfig";

type ProtectedResourceMetadata = {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: ["header"];
  scopes_supported: string[];
  resource_name: string;
};

function splitConfiguredList(value: string | undefined): string[] {
  return Array.from(new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}

function absoluteUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || url.hash) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/**
 * Inbound MCP OAuth metadata is intentionally configuration-driven.  A
 * protected-resource document without a real authorization server would make
 * clients believe OAuth is supported when the server cannot verify tokens.
 */
export function getMcpProtectedResourceMetadata(): ProtectedResourceMetadata | null {
  const runtime = getCachedMcpRuntimeConfig();
  // Do not publish OAuth discovery until this process is also configured to
  // verify the resulting access tokens. A metadata-only deployment creates a
  // false-positive capability for MCP clients and can cause unsafe retries.
  if (
    !runtime.oauthInboundEnabled
    || !runtime.oauthJwksUri
    || !runtime.oauthAudience
  ) return null;
  const resource = absoluteUrl(runtime.oauthResource);
  const authorizationServers = runtime.oauthAuthorizationServers
    .map(absoluteUrl).filter((value): value is string => Boolean(value));
  if (!resource || authorizationServers.length === 0) return null;

  const configuredScopes = Array.from(new Set(
    runtime.oauthScopesSupported.map(
      scope => MCP_OAUTH_LEGACY_SCOPE_ALIASES[
        scope as keyof typeof MCP_OAUTH_LEGACY_SCOPE_ALIASES
      ] ?? scope,
    ),
  ));
  return {
    resource,
    authorization_servers: authorizationServers,
    bearer_methods_supported: ["header"],
    scopes_supported: configuredScopes.length > 0
      ? configuredScopes
      : [...MCP_OAUTH_DEFAULT_SCOPES],
    resource_name: "SmartAIHub MCP",
  };
}

function configuredPublicOrigin(): string | null {
  const configured = absoluteUrl(getCachedMcpRuntimeConfig().publicBaseUrl);
  if (configured) return configured;
  if (process.env.VITEST === "true") return process.env.NODE_ENV === "production" ? "https://smartaihub.app" : null;
  return null;
}

export function mcpProtectedResourceMetadataUrl(): string | null {
  const origin = configuredPublicOrigin();
  return origin ? `${origin}/.well-known/oauth-protected-resource` : null;
}

export function mcpBearerChallenge(options: {
  error?: "invalid_token" | "insufficient_scope";
  scope?: string;
} = {}): string {
  const fields = [`realm="SmartAIHub MCP"`];
  const metadataUrl = mcpProtectedResourceMetadataUrl();
  if (metadataUrl) fields.push(`resource_metadata="${metadataUrl}"`);
  if (options.error) fields.push(`error="${options.error}"`);
  if (options.scope) fields.push(`scope="${options.scope.replace(/[^A-Za-z0-9:_ -]/g, "")}"`);
  return `Bearer ${fields.join(", ")}`;
}

export function setMcpBearerChallenge(
  req: Request,
  res: Response,
  options: { error?: "invalid_token" | "insufficient_scope"; scope?: string } = {},
): void {
  const path = req.originalUrl.split("?", 1)[0];
  if (path === "/v1/mcp" || path === "/mcp") {
    res.setHeader("WWW-Authenticate", mcpBearerChallenge(options));
  }
}
