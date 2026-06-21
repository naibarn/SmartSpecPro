import crypto from "crypto";
import { encrypt } from "./crypto";
import { assertMcpProviderConfigReady, getMcpProviderRuntimeConfig } from "./mcpProviderConfigService";
import { getMcpProviderTemplateSeed, type McpProviderKey } from "./mcpProviderRegistry";

export interface McpOAuthStateRecord {
  state: string;
  nonce: string;
  tenantId: string;
  userId: number;
  providerKey: McpProviderKey;
  reconnectConnectionId?: string;
  expiresAt: Date;
  codeVerifier?: string;
  redirectUri?: string;
  tokenEndpoint?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  consumedAt?: Date;
}

export interface McpOAuthSessionResult {
  encryptedTokenRef: string;
  encryptionKeyVersion: string;
  providerAccountLabel: string;
  providerAccountHash: string;
  scopes: string[];
  tokenExpiresAt: Date | null;
  reconnectConnectionId?: string;
}

const states = new Map<string, McpOAuthStateRecord>();
const STATE_TTL_MS = 10 * 60 * 1000;

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function makeSessionRef(payload: Record<string, unknown>): { encryptedTokenRef: string; encryptionKeyVersion: string } {
  try {
    return {
      encryptedTokenRef: encrypt(JSON.stringify(payload)),
      encryptionKeyVersion: "LLM_ENCRYPTION_KEY:v1",
    };
  } catch {
    return {
      encryptedTokenRef: `unavailable:${hash(JSON.stringify(payload))}`,
      encryptionKeyVersion: "encryption-key-unavailable:forced-reconnect",
    };
  }
}

function base64Url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function makePkcePair() {
  const codeVerifier = base64Url(crypto.randomBytes(48));
  const codeChallenge = base64Url(crypto.createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

function parseBearerChallenge(header: string | null): Record<string, string> {
  if (!header) return {};
  const value = header.replace(/^Bearer\s+/i, "");
  const entries: Record<string, string> = {};
  for (const part of value.match(/(?:[^,\"]+|\"[^\"]*\")+/g) ?? []) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey || rawValue.length === 0) continue;
    entries[rawKey] = rawValue.join("=").replace(/^"|"$/g, "");
  }
  return entries;
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`MCP OAuth discovery failed for ${url}: ${response.status}`);
  }
  return response.json();
}

async function discoverProtectedResourceMetadata(mcpUrl: string) {
  const endpoint = new URL(mcpUrl);
  const wellKnown = `${endpoint.origin}/.well-known/oauth-protected-resource`;
  try {
    return await fetchJson(wellKnown);
  } catch {
    const response = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "SmartSpecPro", version: "1.0" },
        },
      }),
    });
    const challenge = parseBearerChallenge(response.headers.get("www-authenticate"));
    if (challenge.resource_metadata) {
      return fetchJson(challenge.resource_metadata);
    }
    throw new Error("MCP provider did not expose OAuth protected resource metadata");
  }
}

async function discoverAuthorizationServerMetadata(mcpUrl: string, authorizationServers: string[] = []) {
  const endpoint = new URL(mcpUrl);
  const candidateUrls = [
    `${endpoint.origin}/.well-known/oauth-authorization-server`,
    ...authorizationServers.map((issuer) => `${issuer.replace(/\/$/, "")}/.well-known/oauth-authorization-server`),
    ...authorizationServers.map((issuer) => `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`),
  ];
  let lastError: unknown;
  for (const url of candidateUrls) {
    try {
      return await fetchJson(url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("MCP provider did not expose OAuth authorization metadata");
}

async function registerDynamicClient(metadata: any, redirectUri: string, providerKey: McpProviderKey) {
  if (!metadata.registration_endpoint) {
    throw new Error("MCP provider does not support dynamic client registration");
  }
  const tokenAuthMethods = Array.isArray(metadata.token_endpoint_auth_methods_supported)
    ? metadata.token_endpoint_auth_methods_supported
    : [];
  const tokenEndpointAuthMethod = tokenAuthMethods.includes("none") ? "none" : "client_secret_post";
  const response = await fetch(metadata.registration_endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_name: `SmartSpecPro ${providerKey} MCP Connect`,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: tokenEndpointAuthMethod,
      application_type: "web",
    }),
  });
  if (!response.ok) {
    throw new Error(`MCP dynamic client registration failed: ${response.status}`);
  }
  const client = await response.json();
  if (!client.client_id) {
    throw new Error("MCP dynamic client registration did not return client_id");
  }
  return {
    clientId: String(client.client_id),
    clientSecret: typeof client.client_secret === "string" ? client.client_secret : undefined,
  };
}

async function startDiscoveredMcpOAuth(params: {
  tenantId: string;
  userId: number;
  providerKey: McpProviderKey;
  reconnectConnectionId?: string;
  publicUrl?: string | null;
}) {
  const seed = getMcpProviderTemplateSeed(params.providerKey);
  if (!seed?.mcpUrl) throw new Error("MCP provider URL is not available");
  const callbackBase = (params.publicUrl || process.env.PUBLIC_URL || "").replace(/\/$/, "");
  if (!callbackBase) throw new Error("PUBLIC_URL is required for MCP OAuth callback");
  const redirectUri = `${callbackBase}/auth/callback/mcp-connect?providerKey=${params.providerKey}`;
  const protectedResource = await discoverProtectedResourceMetadata(seed.mcpUrl);
  const metadata = await discoverAuthorizationServerMetadata(seed.mcpUrl, protectedResource.authorization_servers);
  const resource = typeof protectedResource.resource === "string" && protectedResource.resource
    ? protectedResource.resource
    : seed.mcpUrl;
  const client = await registerDynamicClient(metadata, redirectUri, params.providerKey);
  const { codeVerifier, codeChallenge } = makePkcePair();
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const scopes = Array.isArray(protectedResource.scopes_supported) && protectedResource.scopes_supported.length > 0
    ? protectedResource.scopes_supported.join(" ")
    : Array.isArray(metadata.scopes_supported) && metadata.scopes_supported.length > 0
      ? metadata.scopes_supported.filter((scope: string) => ["openid", "profile", "email", "offline_access", "mcp:custom-audience"].includes(scope)).join(" ")
      : "openid email";

  states.set(state, {
    state,
    nonce,
    tenantId: params.tenantId,
    userId: params.userId,
    providerKey: params.providerKey,
    reconnectConnectionId: params.reconnectConnectionId,
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
    codeVerifier,
    redirectUri,
    tokenEndpoint: metadata.token_endpoint,
    clientId: client.clientId,
    clientSecret: client.clientSecret,
    scope: scopes,
  });

  const authorizationUrl = new URL(metadata.authorization_endpoint);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", client.clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("scope", scopes);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("nonce", nonce);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("resource", resource);
  if (
    Array.isArray(metadata.response_modes_supported) &&
    metadata.response_modes_supported.includes("query")
  ) {
    authorizationUrl.searchParams.set("response_mode", "query");
  }

  return { authorizationUrl: authorizationUrl.toString(), state, mode: "oauth_pkce" as const };
}

export async function startMcpOAuth(params: {
  tenantId: string;
  userId: number;
  providerKey: McpProviderKey;
  reconnectConnectionId?: string;
  publicUrl?: string | null;
}) {
  try {
    return await startDiscoveredMcpOAuth(params);
  } catch (discoveryError) {
    await assertMcpProviderConfigReady(params.providerKey);
    const runtime = await getMcpProviderRuntimeConfig(params.providerKey);
    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    states.set(state, {
      state,
      nonce,
      tenantId: params.tenantId,
      userId: params.userId,
      providerKey: params.providerKey,
      reconnectConnectionId: params.reconnectConnectionId,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    });
    const authorizationUrl = new URL(runtime.provider.authorizationUrl ?? "");
    authorizationUrl.searchParams.set("client_id", runtime.provider.clientId ?? "");
    const redirectUri = new URL(`${runtime.callbackBaseUrl}/auth/callback/mcp-connect`);
    redirectUri.searchParams.set("providerKey", params.providerKey);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri.toString());
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("nonce", nonce);
    return { authorizationUrl: authorizationUrl.toString(), state, mode: "configured_oauth" as const };
  }
}

async function exchangeDiscoveredToken(record: McpOAuthStateRecord, code: string) {
  if (!record.tokenEndpoint || !record.clientId || !record.redirectUri || !record.codeVerifier) return null;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: record.redirectUri,
    client_id: record.clientId,
    code_verifier: record.codeVerifier,
  });
  if (record.clientSecret) body.set("client_secret", record.clientSecret);
  const response = await fetch(record.tokenEndpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`MCP token exchange failed: ${response.status}`);
  }
  return response.json();
}

export async function completeMcpOAuth(params: {
  tenantId: string;
  userId: number;
  providerKey: McpProviderKey;
  code: string;
  state: string;
}): Promise<McpOAuthSessionResult> {
  const record = states.get(params.state);
  if (!record || record.consumedAt || record.expiresAt.getTime() < Date.now()) {
    throw new Error("OAuth state is expired or already used");
  }
  if (
    record.tenantId !== params.tenantId ||
    record.userId !== params.userId ||
    record.providerKey !== params.providerKey
  ) {
    throw new Error("OAuth state does not match this session");
  }
  record.consumedAt = new Date();
  const token = await exchangeDiscoveredToken(record, params.code);
  const safeAccountHash = hash(`${params.providerKey}:${params.tenantId}:${params.userId}:${token?.access_token ?? params.code}`);
  const session = makeSessionRef({
    providerKey: params.providerKey,
    codeHash: hash(params.code),
    accessToken: token?.access_token,
    refreshToken: token?.refresh_token,
    tokenType: token?.token_type,
    scope: token?.scope ?? record.scope,
    userId: params.userId,
    tenantId: params.tenantId,
    createdAt: new Date().toISOString(),
  });
  return {
    ...session,
    reconnectConnectionId: record.reconnectConnectionId,
    providerAccountLabel: `${params.providerKey} account ${safeAccountHash.slice(0, 8)}`,
    providerAccountHash: safeAccountHash,
    scopes: typeof token?.scope === "string" ? token.scope.split(/\s+/).filter(Boolean) : ["media.generate", "media.status"],
    tokenExpiresAt: typeof token?.expires_in === "number"
      ? new Date(Date.now() + token.expires_in * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
}

export function purgeExpiredMcpOAuthStates(now = new Date()): number {
  let purged = 0;
  for (const [state, record] of states.entries()) {
    if (record.expiresAt <= now || record.consumedAt) {
      states.delete(state);
      purged += 1;
    }
  }
  return purged;
}
