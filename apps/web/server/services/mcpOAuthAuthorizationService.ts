import crypto from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { importJWK, SignJWT, type JWK } from "jose";

import {
  mcpOAuthClients,
  mcpOAuthGrants,
  mcpOAuthRefreshTokens,
  mcpOAuthTransactions,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import {
  MCP_OAUTH_DEFAULT_SCOPES,
  MCP_OAUTH_LEGACY_SCOPE_ALIASES,
} from "./mcpOAuthScopes";
import { getCachedMcpRuntimeConfig } from "./mcpRuntimeConfig";

export {
  MCP_OAUTH_DEFAULT_SCOPES,
  MCP_OAUTH_LEGACY_SCOPE_ALIASES,
} from "./mcpOAuthScopes";

export const MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const AUTHORIZATION_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CLIENT_NAME = 255;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

type OAuthSigningKey = Parameters<SignJWT["sign"]>[0];
type OAuthKeyPair = {
  privateKey: OAuthSigningKey;
  publicJwk: JWK;
  algorithm: "RS256" | "ES256";
  kid: string;
};

export type McpOAuthServerConfig = {
  issuer: string;
  resource: string;
  audience: string;
  jwksUri: string;
  scopesSupported: string[];
};

export type RegisteredMcpOAuthClient = {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: "none";
};

export type McpOAuthAuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  resource: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scopes: string[];
  state: string | null;
};

let cachedKeyConfig = "";
let cachedKeyPair: OAuthKeyPair | null = null;

function normalizeBaseUrl(value: string | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.search
    )
      return "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function getMcpOAuthServerConfig(): McpOAuthServerConfig | null {
  const runtime = getCachedMcpRuntimeConfig();
  const issuer = normalizeBaseUrl(runtime.oauthIssuer);
  const resource = normalizeBaseUrl(
    runtime.oauthResource || (issuer ? `${issuer}/v1/mcp` : "")
  );
  const jwksUri = normalizeBaseUrl(
    runtime.oauthJwksUri || (issuer ? `${issuer}/.well-known/jwks.json` : "")
  );
  const audience = runtime.oauthAudience.trim();
  if (!issuer || !resource || !jwksUri || !audience || audience.length > 256)
    return null;
  const configured = runtime.oauthScopesSupported.join(",");
  const scopesSupported: string[] = Array.from(
    new Set<string>(
      (configured ? configured.split(",") : [...MCP_OAUTH_DEFAULT_SCOPES])
        .map(scope => scope.trim())
        .map(
          scope =>
            MCP_OAUTH_LEGACY_SCOPE_ALIASES[
              scope as keyof typeof MCP_OAUTH_LEGACY_SCOPE_ALIASES
            ] ?? scope
        )
        .filter(scope => /^[a-zA-Z0-9:_-]{1,80}$/.test(scope))
    )
  ).slice(0, 128);
  if (!scopesSupported.includes("mcp:read")) return null;
  return { issuer, resource, audience, jwksUri, scopesSupported };
}

export function isMcpOAuthAuthorizationServerEnabled(): boolean {
  return (
    getCachedMcpRuntimeConfig().oauthAuthorizationServerEnabled &&
    Boolean(getMcpOAuthServerConfig()) &&
    Boolean(parsePrivateJwk())
  );
}

export async function isMcpOAuthTenantEnabled(
  tenantId: string
): Promise<boolean> {
  if (!tenantId.trim()) return false;
  try {
    const flags = await getTenantFeatureFlags(tenantId);
    return flags.mcpOAuthAuthorizationServerEnabled;
  } catch {
    return false;
  }
}

function parsePrivateJwk(): JWK | null {
  const raw = getCachedMcpRuntimeConfig().oauthPrivateJwk.trim();
  if (!raw || raw.length > 16_384) return null;
  try {
    const parsed = JSON.parse(raw) as JWK;
    if (parsed.kty !== "RSA" && parsed.kty !== "EC") return null;
    if (parsed.kty === "RSA" && parsed.alg !== "RS256") return null;
    if (parsed.kty === "EC" && parsed.alg !== "ES256") return null;
    if (
      typeof parsed.d !== "string" ||
      (typeof parsed.n !== "string" && parsed.kty === "RSA")
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

async function getSigningKeyPair(): Promise<OAuthKeyPair | null> {
  const runtime = getCachedMcpRuntimeConfig();
  const raw = runtime.oauthPrivateJwk;
  const kid = runtime.oauthKeyId.trim();
  const cacheKey = `${raw}:${kid}`;
  if (cachedKeyPair && cachedKeyConfig === cacheKey) return cachedKeyPair;
  const jwk = parsePrivateJwk();
  if (!jwk) return null;
  const algorithm = jwk.kty === "RSA" ? "RS256" : "ES256";
  try {
    const privateKey = await importJWK(jwk, algorithm);
    // WebCrypto marks imported private keys non-extractable. Derive the public
    // JWK from the supplied key material instead of exporting the private key.
    const publicJwk = { ...jwk } as JWK;
    delete publicJwk.d;
    delete publicJwk.p;
    delete publicJwk.q;
    delete publicJwk.dp;
    delete publicJwk.dq;
    delete publicJwk.qi;
    publicJwk.alg = algorithm;
    publicJwk.use = "sig";
    publicJwk.kid =
      kid ||
      crypto
        .createHash("sha256")
        .update(JSON.stringify(publicJwk))
        .digest("hex")
        .slice(0, 16);
    cachedKeyPair = { privateKey, publicJwk, algorithm, kid: publicJwk.kid };
    cachedKeyConfig = cacheKey;
    return cachedKeyPair;
  } catch {
    return null;
  }
}

export async function getMcpOAuthPublicJwks(): Promise<{ keys: JWK[] } | null> {
  const pair = await getSigningKeyPair();
  if (!pair) return null;
  const additional = parseAdditionalPublicJwks(pair.algorithm);
  return { keys: [pair.publicJwk, ...additional] };
}

function parseAdditionalPublicJwks(algorithm: "RS256" | "ES256"): JWK[] {
  const raw = getCachedMcpRuntimeConfig().oauthAdditionalPublicJwks.trim();
  if (!raw || raw.length > 64_000) return [];
  try {
    const parsed = JSON.parse(raw) as { keys?: JWK[] } | JWK[];
    const keys = Array.isArray(parsed) ? parsed : parsed.keys;
    if (!Array.isArray(keys)) return [];
    return keys
      .filter(
        key =>
          key &&
          key.kty &&
          key.alg === algorithm &&
          typeof key.kid === "string" &&
          !key.d &&
          !key.p &&
          !key.q &&
          !key.dp &&
          !key.dq &&
          !key.qi
      )
      .slice(0, 8);
  } catch {
    return [];
  }
}

export function resetMcpOAuthSigningKeyCacheForTests(): void {
  cachedKeyConfig = "";
  cachedKeyPair = null;
}

export function hashMcpOAuthSecret(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function createMcpOAuthOpaqueToken(prefix: "code" | "refresh"): string {
  return `${prefix}_${crypto.randomBytes(48).toString("base64url")}`;
}

export function normalizeMcpOAuthScopes(
  requested: string | string[] | undefined,
  supported = getMcpOAuthServerConfig()?.scopesSupported ?? [
    ...MCP_OAUTH_DEFAULT_SCOPES,
  ]
): string[] {
  const values = Array.isArray(requested)
    ? requested
    : String(requested || "").split(/[\s,]+/);
  return Array.from(
    new Set(
      values
        .map(value => value.trim())
        .map(value => {
          const canonical =
            MCP_OAUTH_LEGACY_SCOPE_ALIASES[
              value as keyof typeof MCP_OAUTH_LEGACY_SCOPE_ALIASES
            ];
          return canonical && supported.includes(canonical) ? canonical : value;
        })
        .filter(value => supported.includes(value))
    )
  ).slice(0, 64);
}

export function validateMcpOAuthRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      url.hostname.includes("*")
    )
      return false;
    if (url.protocol === "https:")
      return Boolean((url.hostname && !url.port) || url.port.length <= 5);
    if (url.protocol !== "http:") return false;
    return LOOPBACK_HOSTS.has(url.hostname.toLowerCase()) && Boolean(url.port);
  } catch {
    return false;
  }
}

export function verifyMcpOAuthPkce(
  codeVerifier: string,
  codeChallenge: string
): boolean {
  if (
    !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier) ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)
  )
    return false;
  const actual = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return crypto.timingSafeEqual(
    Buffer.from(actual),
    Buffer.from(codeChallenge)
  );
}

export async function registerMcpOAuthClient(input: {
  clientName: string;
  clientUri?: string | null;
  logoUri?: string | null;
  redirectUris: string[];
  metadata?: Record<string, unknown>;
}): Promise<RegisteredMcpOAuthClient> {
  if (!input.clientName.trim() || input.clientName.length > MAX_CLIENT_NAME)
    throw new Error("invalid_client_metadata");
  const redirectUris = Array.from(
    new Set(input.redirectUris.map(uri => uri.trim()))
  );
  if (
    !redirectUris.length ||
    redirectUris.length > 32 ||
    redirectUris.some(uri => !validateMcpOAuthRedirectUri(uri))
  ) {
    throw new Error("invalid_redirect_uris");
  }
  const db = await getDb();
  const clientId = `mcpc_${crypto.randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .insert(mcpOAuthClients)
    .values({
      clientId,
      clientName: input.clientName.trim(),
      clientUri: input.clientUri?.trim() || null,
      logoUri: input.logoUri?.trim() || null,
      redirectUris,
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "none",
      metadataJson: input.metadata ?? {},
      status: "active",
    })
    .returning();
  if (!row) throw new Error("client_registration_failed");
  return toRegisteredClient(row);
}

function toRegisteredClient(
  row: typeof mcpOAuthClients.$inferSelect
): RegisteredMcpOAuthClient {
  return {
    client_id: row.clientId,
    client_name: row.clientName,
    redirect_uris: row.redirectUris,
    grant_types: row.grantTypes,
    response_types: row.responseTypes,
    token_endpoint_auth_method: "none",
  };
}

export async function getActiveMcpOAuthClient(clientId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(mcpOAuthClients)
    .where(
      and(
        eq(mcpOAuthClients.clientId, clientId),
        eq(mcpOAuthClients.status, "active")
      )
    )
    .limit(1);
  return row ?? null;
}

export async function createMcpOAuthTransaction(
  input: McpOAuthAuthorizeRequest
): Promise<string> {
  const config = getMcpOAuthServerConfig();
  if (
    !config ||
    input.resource !== config.resource ||
    input.codeChallengeMethod !== "S256"
  )
    throw new Error("invalid_request");
  if (
    !input.clientId ||
    !validateMcpOAuthRedirectUri(input.redirectUri) ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(input.codeChallenge) ||
    (input.state && input.state.length > 2048)
  )
    throw new Error("invalid_request");
  const client = await getActiveMcpOAuthClient(input.clientId);
  if (!client || !client.redirectUris.includes(input.redirectUri))
    throw new Error("invalid_client");
  const scopes = normalizeMcpOAuthScopes(input.scopes, config.scopesSupported);
  if (!scopes.includes("mcp:read")) throw new Error("invalid_scope");
  const db = await getDb();
  const [row] = await db
    .insert(mcpOAuthTransactions)
    .values({
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      resource: input.resource,
      state: input.state,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: "S256",
      requestedScopes: scopes,
      status: "pending",
      expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
    })
    .returning({ id: mcpOAuthTransactions.id });
  if (!row) throw new Error("authorization_transaction_failed");
  return row.id;
}

export async function getMcpOAuthTransaction(id: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(mcpOAuthTransactions)
    .where(eq(mcpOAuthTransactions.id, id))
    .limit(1);
  return row ?? null;
}

export async function approveMcpOAuthTransaction(input: {
  transactionId: string;
  userId: number;
  tenantId: string;
  scopes: string[];
}) {
  const db = await getDb();
  if (!(await isMcpOAuthTenantEnabled(input.tenantId)))
    throw new Error("oauth_not_enabled");
  const tx = await getMcpOAuthTransaction(input.transactionId);
  if (!tx || tx.status !== "pending" || tx.expiresAt.getTime() <= Date.now())
    throw new Error("invalid_request");
  const approvedScopes = normalizeMcpOAuthScopes(input.scopes).filter(scope =>
    tx.requestedScopes.includes(scope)
  );
  if (!approvedScopes.includes("mcp:read")) throw new Error("invalid_scope");
  const code = createMcpOAuthOpaqueToken("code");
  const [updated] = await db
    .update(mcpOAuthTransactions)
    .set({
      userId: input.userId,
      tenantId: input.tenantId,
      approvedScopes,
      authorizationCodeHash: hashMcpOAuthSecret(code),
      status: "approved",
      approvedAt: new Date(),
    })
    .where(
      and(
        eq(mcpOAuthTransactions.id, input.transactionId),
        eq(mcpOAuthTransactions.status, "pending")
      )
    )
    .returning();
  if (!updated) throw new Error("authorization_transaction_race");
  return { transaction: updated, code };
}

export async function denyMcpOAuthTransaction(
  transactionId: string
): Promise<void> {
  const db = await getDb();
  await db
    .update(mcpOAuthTransactions)
    .set({ status: "denied" })
    .where(
      and(
        eq(mcpOAuthTransactions.id, transactionId),
        eq(mcpOAuthTransactions.status, "pending")
      )
    );
}

async function signMcpOAuthAccessToken(input: {
  grantId: string;
  userId: number;
  tenantId: string;
  clientId: string;
  scopes: string[];
}) {
  const config = getMcpOAuthServerConfig();
  const pair = await getSigningKeyPair();
  if (!config || !pair) throw new Error("oauth_signing_not_ready");
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS;
  const token = await new SignJWT({
    tenantId: input.tenantId,
    userId: input.userId,
    grantId: input.grantId,
    scope: input.scopes.join(" "),
    resource: config.resource,
    tokenUse: "mcp_oauth",
  })
    .setProtectedHeader({ alg: pair.algorithm, kid: pair.kid, typ: "at+jwt" })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setSubject(String(input.userId))
    .setJti(crypto.randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(pair.privateKey);
  return { token, expiresAt: new Date(expiresAt * 1000) };
}

async function issueRefreshToken(
  grantId: string,
  familyId: string,
  parentTokenHash: string | null,
  expiresAt: Date
) {
  const db = await getDb();
  const token = createMcpOAuthOpaqueToken("refresh");
  await db.insert(mcpOAuthRefreshTokens).values({
    grantId,
    familyId,
    tokenHash: hashMcpOAuthSecret(token),
    parentTokenHash,
    expiresAt,
  });
  return token;
}

export async function exchangeMcpOAuthAuthorizationCode(input: {
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const db = await getDb();
  const codeHash = hashMcpOAuthSecret(input.code);
  const [tx] = await db
    .select()
    .from(mcpOAuthTransactions)
    .where(
      and(
        eq(mcpOAuthTransactions.clientId, input.clientId),
        eq(mcpOAuthTransactions.authorizationCodeHash, codeHash),
        eq(mcpOAuthTransactions.status, "approved")
      )
    )
    .limit(1);
  if (
    !tx ||
    tx.redirectUri !== input.redirectUri ||
    !tx.userId ||
    !tx.tenantId ||
    !tx.approvedScopes ||
    tx.expiresAt.getTime() <= Date.now() ||
    !verifyMcpOAuthPkce(input.codeVerifier, tx.codeChallenge)
  ) {
    throw new Error("invalid_grant");
  }
  if (!(await isMcpOAuthTenantEnabled(tx.tenantId)))
    throw new Error("oauth_not_enabled");
  const client = await getActiveMcpOAuthClient(tx.clientId);
  if (!client) throw new Error("invalid_client");
  const consumedAt = new Date();
  const [consumed] = await db
    .update(mcpOAuthTransactions)
    .set({ status: "consumed", consumedAt })
    .where(
      and(
        eq(mcpOAuthTransactions.id, tx.id),
        eq(mcpOAuthTransactions.status, "approved")
      )
    )
    .returning();
  if (!consumed) throw new Error("invalid_grant");
  const grantId = crypto.randomUUID();
  const familyId = crypto.randomBytes(32).toString("base64url");
  const refreshExpiresAt = new Date(
    Date.now() + MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS * 1000
  );
  await db.insert(mcpOAuthGrants).values({
    id: grantId,
    clientId: tx.clientId,
    redirectUri: tx.redirectUri,
    userId: tx.userId,
    tenantId: tx.tenantId,
    deviceIdHash: crypto
      .createHash("sha256")
      .update(`${tx.clientId}:${grantId}`)
      .digest("hex"),
    scopesJson: tx.approvedScopes,
    refreshFamilyId: familyId,
    accessTokenExpiresAt: new Date(
      Date.now() + MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS * 1000
    ),
    refreshTokenExpiresAt: refreshExpiresAt,
  });
  const refreshToken = await issueRefreshToken(
    grantId,
    familyId,
    null,
    refreshExpiresAt
  );
  const access = await signMcpOAuthAccessToken({
    grantId,
    userId: tx.userId,
    tenantId: tx.tenantId,
    clientId: tx.clientId,
    scopes: tx.approvedScopes,
  });
  await db
    .update(mcpOAuthClients)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(mcpOAuthClients.clientId, tx.clientId));
  return {
    ...access,
    refreshToken,
    refreshTokenExpiresAt: refreshExpiresAt,
    grantId,
    userId: tx.userId,
    tenantId: tx.tenantId,
    clientId: tx.clientId,
    clientName: client.clientName,
    redirectUri: tx.redirectUri,
    scopes: tx.approvedScopes,
  };
}

export async function rotateMcpOAuthRefreshToken(refreshToken: string) {
  const db = await getDb();
  const tokenHash = hashMcpOAuthSecret(refreshToken);
  const [row] = await db
    .select()
    .from(mcpOAuthRefreshTokens)
    .where(eq(mcpOAuthRefreshTokens.tokenHash, tokenHash))
    .limit(1);
  if (!row) throw new Error("invalid_grant");
  if (row.usedAt || row.revokedAt || row.expiresAt.getTime() <= Date.now()) {
    await db
      .update(mcpOAuthGrants)
      .set({
        status: "revoked",
        revokedAt: new Date(),
        revocationReason: "refresh_reuse_or_expired",
        updatedAt: new Date(),
      })
      .where(eq(mcpOAuthGrants.id, row.grantId));
    await db
      .update(mcpOAuthRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(mcpOAuthRefreshTokens.familyId, row.familyId),
          isNull(mcpOAuthRefreshTokens.revokedAt)
        )
      );
    throw new Error("invalid_grant");
  }
  const [grant] = await db
    .select()
    .from(mcpOAuthGrants)
    .where(
      and(
        eq(mcpOAuthGrants.id, row.grantId),
        eq(mcpOAuthGrants.status, "active")
      )
    )
    .limit(1);
  if (
    !grant ||
    (grant.refreshTokenExpiresAt &&
      grant.refreshTokenExpiresAt.getTime() <= Date.now())
  )
    throw new Error("invalid_grant");
  const now = new Date();
  const [used] = await db
    .update(mcpOAuthRefreshTokens)
    .set({ usedAt: now, revokedAt: now })
    .where(
      and(
        eq(mcpOAuthRefreshTokens.id, row.id),
        isNull(mcpOAuthRefreshTokens.usedAt),
        isNull(mcpOAuthRefreshTokens.revokedAt)
      )
    )
    .returning();
  if (!used) throw new Error("invalid_grant");
  const nextRefreshToken = await issueRefreshToken(
    grant.id,
    grant.refreshFamilyId,
    row.tokenHash,
    grant.refreshTokenExpiresAt!
  );
  const access = await signMcpOAuthAccessToken({
    grantId: grant.id,
    userId: grant.userId,
    tenantId: grant.tenantId,
    clientId: grant.clientId,
    scopes: grant.scopesJson,
  });
  await db
    .update(mcpOAuthGrants)
    .set({
      lastUsedAt: now,
      accessTokenExpiresAt: access.expiresAt,
      updatedAt: now,
    })
    .where(eq(mcpOAuthGrants.id, grant.id));
  const client = await getActiveMcpOAuthClient(grant.clientId);
  return {
    ...access,
    refreshToken: nextRefreshToken,
    refreshTokenExpiresAt: grant.refreshTokenExpiresAt,
    grantId: grant.id,
    userId: grant.userId,
    tenantId: grant.tenantId,
    clientId: grant.clientId,
    clientName: client?.clientName ?? grant.clientId,
    redirectUri: grant.redirectUri,
    scopes: grant.scopesJson,
  };
}

export async function revokeMcpOAuthGrant(input: {
  grantId: string;
  userId?: number;
  tenantId?: string;
  reason?: string;
}): Promise<boolean> {
  const db = await getDb();
  const predicates = [eq(mcpOAuthGrants.id, input.grantId)];
  if (input.userId != null)
    predicates.push(eq(mcpOAuthGrants.userId, input.userId));
  if (input.tenantId)
    predicates.push(eq(mcpOAuthGrants.tenantId, input.tenantId));
  const [updated] = await db
    .update(mcpOAuthGrants)
    .set({
      status: "revoked",
      revokedAt: new Date(),
      revokedByUserId: input.userId ?? null,
      revocationReason: input.reason || "revoked",
      updatedAt: new Date(),
    })
    .where(and(...predicates))
    .returning({ id: mcpOAuthGrants.id });
  if (updated)
    await db
      .update(mcpOAuthRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(mcpOAuthRefreshTokens.grantId, updated.id),
          isNull(mcpOAuthRefreshTokens.revokedAt)
        )
      );
  return Boolean(updated);
}

export async function isMcpOAuthGrantActive(input: {
  grantId: string;
  userId: number;
  tenantId: string;
}): Promise<boolean> {
  const db = await getDb();
  const [grant] = await db
    .select({ id: mcpOAuthGrants.id })
    .from(mcpOAuthGrants)
    .where(
      and(
        eq(mcpOAuthGrants.id, input.grantId),
        eq(mcpOAuthGrants.userId, input.userId),
        eq(mcpOAuthGrants.tenantId, input.tenantId),
        eq(mcpOAuthGrants.status, "active"),
        isNull(mcpOAuthGrants.revokedAt)
      )
    )
    .limit(1);
  return Boolean(grant);
}

export async function revokeMcpOAuthToken(token: string): Promise<void> {
  const db = await getDb();
  const tokenHash = hashMcpOAuthSecret(token);
  await db
    .update(mcpOAuthRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(mcpOAuthRefreshTokens.tokenHash, tokenHash),
        isNull(mcpOAuthRefreshTokens.revokedAt)
      )
    );
}
