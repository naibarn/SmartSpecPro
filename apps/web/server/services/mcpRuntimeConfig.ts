import { eq } from "drizzle-orm";

import { systemSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { decrypt } from "./crypto";
import {
  MCP_OAUTH_DEFAULT_SCOPES,
  MCP_OAUTH_LEGACY_SCOPE_ALIASES,
} from "./mcpOAuthScopes";

export const MCP_RUNTIME_CATEGORY = "mcp" as const;
// Early versions of the admin router accidentally persisted MCP settings in
// the shared infrastructure category. Read those rows as a compatibility
// fallback so existing production configuration is not lost; new writes use
// MCP_RUNTIME_CATEGORY exclusively.
const MCP_LEGACY_RUNTIME_CATEGORY = "infrastructure" as const;

const MCP_RUNTIME_KEYS = [
  "modern_protocol_enabled",
  "oauth_inbound_enabled",
  "oauth_protected_resource_enabled",
  "oauth_authorization_server_enabled",
  "oauth_dynamic_registration_enabled",
  "public_base_url",
  "oauth_issuer",
  "oauth_resource",
  "oauth_jwks_uri",
  "oauth_audience",
  "oauth_authorization_servers",
  "oauth_scopes_supported",
  "cors_allowed_origins",
  "session_allowed_origins",
  "session_ttl_seconds",
  "oauth_private_jwk",
  "oauth_key_id",
  "oauth_additional_public_jwks",
  "workspace_root",
  "workspace_write_enabled",
  "workspace_write_token",
  "max_read_bytes",
  "max_write_bytes",
  "extension_allowlist",
  "mcp_rpm",
] as const;

const SENSITIVE_KEYS = new Set(["oauth_private_jwk", "workspace_write_token"]);

export type McpRuntimeConfig = {
  source: "db" | "env" | "none";
  modernProtocolEnabled: boolean;
  oauthInboundEnabled: boolean;
  oauthProtectedResourceEnabled: boolean;
  oauthAuthorizationServerEnabled: boolean;
  oauthDynamicRegistrationEnabled: boolean;
  publicBaseUrl: string;
  oauthIssuer: string;
  oauthResource: string;
  oauthJwksUri: string;
  oauthAudience: string;
  oauthAuthorizationServers: string[];
  oauthScopesSupported: string[];
  corsAllowedOrigins: string[];
  sessionAllowedOrigins: string[];
  sessionTtlSeconds: number;
  oauthPrivateJwk: string;
  oauthKeyId: string;
  oauthAdditionalPublicJwks: string;
  workspaceRoot: string;
  workspaceWriteEnabled: boolean;
  workspaceWriteToken: string;
  maxReadBytes: number;
  maxWriteBytes: number;
  extensionAllowlist: string[];
  mcpRpm: number;
};

let runtimeConfigCache: McpRuntimeConfig = {
  source: "none",
  modernProtocolEnabled: false,
  oauthInboundEnabled: false,
  oauthProtectedResourceEnabled: false,
  oauthAuthorizationServerEnabled: false,
  oauthDynamicRegistrationEnabled: false,
  publicBaseUrl: "",
  oauthIssuer: "",
  oauthResource: "",
  oauthJwksUri: "",
  oauthAudience: "smartaihub-mcp",
  oauthAuthorizationServers: [],
  oauthScopesSupported: [...MCP_OAUTH_DEFAULT_SCOPES],
  corsAllowedOrigins: [],
  sessionAllowedOrigins: [],
  sessionTtlSeconds: 1800,
  oauthPrivateJwk: "",
  oauthKeyId: "",
  oauthAdditionalPublicJwks: "",
  workspaceRoot: "",
  workspaceWriteEnabled: false,
  workspaceWriteToken: "",
  maxReadBytes: 1_048_576,
  maxWriteBytes: 1_048_576,
  extensionAllowlist: [".md", ".txt", ".json", ".yaml", ".yml", ".ts", ".tsx", ".js", ".py", ".css", ".html"],
  mcpRpm: 240,
};
let refreshPromise: Promise<McpRuntimeConfig> | null = null;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function isTestRuntime(): boolean {
  return process.env.VITEST === "true" || process.env.NODE_ENV === "test";
}

function splitList(value: string | undefined): string[] {
  return Array.from(new Set(
    String(value ?? "")
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}

function canonicalScopes(value: string | undefined): string[] {
  const configured = splitList(value).map((scope) =>
    MCP_OAUTH_LEGACY_SCOPE_ALIASES[scope as keyof typeof MCP_OAUTH_LEGACY_SCOPE_ALIASES] ?? scope,
  );
  return Array.from(new Set(configured.length ? configured : MCP_OAUTH_DEFAULT_SCOPES))
    .filter((scope) => /^[a-zA-Z0-9:_-]{1,80}$/.test(scope))
    .slice(0, 128);
}

function readRowValue(row?: { value: string | null; isSensitive: boolean | null }): string {
  if (!row?.value) return "";
  if (!row.isSensitive) return row.value;
  try {
    return decrypt(row.value) || "";
  } catch {
    return "";
  }
}

function envValue(key: string): string {
  if (isProduction() && !isTestRuntime()) return "";
  return String(process.env[key] ?? "").trim();
}

function boolValue(value: string, fallback = false): boolean {
  return value ? value === "true" : fallback;
}

function normalizeTtl(value: string): number {
  const parsed = Number.parseInt(value || "1800", 10);
  return Number.isInteger(parsed) && parsed >= 300 && parsed <= 86_400 ? parsed : 1800;
}

function normalizeBoundedInteger(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value || String(fallback), 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function buildConfig(values: Map<string, string>, source: McpRuntimeConfig["source"]): McpRuntimeConfig {
  const read = (key: string, fallback = "") => values.get(key) || fallback;
  const publicBaseUrl = read("public_base_url", envValue("MCP_PUBLIC_BASE_URL") || envValue("PUBLIC_URL") || envValue("APP_PUBLIC_URL"));
  const issuer = read("oauth_issuer", envValue("MCP_OAUTH_ISSUER") || publicBaseUrl);
  const resource = read("oauth_resource", envValue("MCP_OAUTH_RESOURCE") || envValue("MCP_RESOURCE_URI") || (issuer ? `${issuer}/v1/mcp` : ""));
  const jwksUri = read("oauth_jwks_uri", envValue("MCP_OAUTH_JWKS_URI"));
  const authorizationServers = splitList(read("oauth_authorization_servers", envValue("MCP_OAUTH_AUTHORIZATION_SERVERS") || envValue("MCP_OAUTH_ISSUER")) || issuer);

  return {
    source,
    modernProtocolEnabled: boolValue(read("modern_protocol_enabled", envValue("MCP_MODERN_PROTOCOL_ENABLED"))),
    oauthInboundEnabled: boolValue(read("oauth_inbound_enabled", envValue("MCP_OAUTH_INBOUND_ENABLED"))),
    oauthProtectedResourceEnabled: boolValue(read("oauth_protected_resource_enabled", envValue("MCP_OAUTH_PROTECTED_RESOURCE_ENABLED"))),
    oauthAuthorizationServerEnabled: boolValue(read("oauth_authorization_server_enabled", envValue("MCP_OAUTH_AUTHORIZATION_SERVER_ENABLED"))),
    oauthDynamicRegistrationEnabled: boolValue(read("oauth_dynamic_registration_enabled", envValue("MCP_OAUTH_DYNAMIC_REGISTRATION_ENABLED"))),
    publicBaseUrl,
    oauthIssuer: issuer,
    oauthResource: resource,
    oauthJwksUri: jwksUri,
    oauthAudience: read("oauth_audience", envValue("MCP_OAUTH_AUDIENCE") || "smartaihub-mcp"),
    oauthAuthorizationServers: authorizationServers,
    oauthScopesSupported: canonicalScopes(read("oauth_scopes_supported", envValue("MCP_OAUTH_SCOPES_SUPPORTED"))),
    corsAllowedOrigins: splitList(read("cors_allowed_origins", envValue("MCP_CORS_ALLOWED_ORIGINS"))),
    sessionAllowedOrigins: splitList(read("session_allowed_origins", envValue("MCP_SESSION_ALLOWED_ORIGINS"))),
    sessionTtlSeconds: normalizeTtl(read("session_ttl_seconds", envValue("MCP_SESSION_TTL_SECONDS"))),
    oauthPrivateJwk: read("oauth_private_jwk", envValue("MCP_OAUTH_PRIVATE_JWK")),
    oauthKeyId: read("oauth_key_id", envValue("MCP_OAUTH_KEY_ID")),
    oauthAdditionalPublicJwks: read("oauth_additional_public_jwks", envValue("MCP_OAUTH_ADDITIONAL_PUBLIC_JWKS")),
    workspaceRoot: read("workspace_root", envValue("WORKSPACE_ROOT") || ""),
    workspaceWriteEnabled: boolValue(read("workspace_write_enabled", envValue("MCP_ENABLE_WORKSPACE_WRITE") === "1" || envValue("MCP_REQUIRE_WRITE_TOKEN") === "1" ? "true" : "false")),
    workspaceWriteToken: read("workspace_write_token", envValue("MCP_WRITE_TOKEN")),
    maxReadBytes: normalizeBoundedInteger(read("max_read_bytes", envValue("MCP_MAX_READ_BYTES")), 1_048_576, 1_024, 50 * 1024 * 1024),
    maxWriteBytes: normalizeBoundedInteger(read("max_write_bytes", envValue("MCP_MAX_WRITE_BYTES")), 1_048_576, 1_024, 50 * 1024 * 1024),
    extensionAllowlist: splitList(read("extension_allowlist", envValue("MCP_EXT_ALLOWLIST") || ".md,.txt,.json,.yaml,.yml,.ts,.tsx,.js,.py,.css,.html")),
    mcpRpm: normalizeBoundedInteger(read("mcp_rpm", envValue("WEB_MCP_RPM")), 240, 10, 10_000),
  };
}

async function loadConfig(): Promise<McpRuntimeConfig> {
  try {
    const db = await getDb();
    const [primaryRows, legacyRows] = db
      ? await Promise.all([
          db.select().from(systemSettings).where(eq(systemSettings.category, MCP_RUNTIME_CATEGORY)),
          db.select().from(systemSettings).where(eq(systemSettings.category, MCP_LEGACY_RUNTIME_CATEGORY)),
        ])
      : [[], []];
    // Primary MCP rows override legacy rows key-by-key. This also lets the
    // newly generated signing key combine with older flag/URL values until
    // the administrator saves the complete MCP profile once.
    const recognized = [...legacyRows, ...primaryRows].filter((row) => MCP_RUNTIME_KEYS.includes(row.key as typeof MCP_RUNTIME_KEYS[number]));
    if (recognized.length > 0) {
      const values = new Map(recognized.map((row) => [row.key, readRowValue(row)]));
      return buildConfig(values, "db");
    }
  } catch {
    // A database outage must not make a production process silently consume
    // MCP env configuration. It remains disabled until the UI-backed config
    // can be loaded again.
  }
  return buildConfig(new Map(), isProduction() && !isTestRuntime() ? "none" : "env");
}

export async function refreshMcpRuntimeConfigCache(): Promise<McpRuntimeConfig> {
  if (!refreshPromise) {
    refreshPromise = loadConfig()
      .then((config) => {
        runtimeConfigCache = config;
        return config;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export function getCachedMcpRuntimeConfig(): McpRuntimeConfig {
  // Test/dev suites commonly mutate process.env between cases. Keep that
  // fallback dynamic while the DB-backed production cache remains authoritative.
  return runtimeConfigCache.source === "db" || (isProduction() && !isTestRuntime())
    ? runtimeConfigCache
    : buildConfig(new Map(), "env");
}

export function getMcpRuntimeConfigForAdmin(): {
  config: Omit<McpRuntimeConfig, "oauthPrivateJwk" | "workspaceWriteToken">;
  keyConfigured: boolean;
  workspaceWriteTokenConfigured: boolean;
  source: McpRuntimeConfig["source"];
} {
  const config = getCachedMcpRuntimeConfig();
  const { oauthPrivateJwk, workspaceWriteToken, ...safeConfig } = config;
  return { config: safeConfig, keyConfigured: Boolean(oauthPrivateJwk), workspaceWriteTokenConfigured: Boolean(workspaceWriteToken), source: config.source };
}

export function resetMcpRuntimeConfigCacheForTests(): void {
  runtimeConfigCache = { ...runtimeConfigCache, source: "none" };
  refreshPromise = null;
}

export function mcpRuntimeSettingKeys(): readonly string[] {
  return MCP_RUNTIME_KEYS;
}

export function mcpRuntimeSensitiveKeys(): ReadonlySet<string> {
  return SENSITIVE_KEYS;
}
