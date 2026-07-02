import crypto from "crypto";
import { and, desc, eq } from "drizzle-orm";
import type { AuthResult } from "../_core/authz";
import {
  marketplaceConnectorGrantEvents,
  marketplaceConnectorGrants,
} from "../../drizzle/schema";
import type {
  MarketplaceConnectorGrantStatus,
  MarketplaceConnectorGrantStatusResponse,
  MarketplaceConnectorProvider,
} from "../../shared/marketplaceIntelligence";
import { getDb, type DrizzleDB } from "../db";

type SessionAuth = Extract<AuthResult, { ok: true; mode: "session" }>;

export type ConnectorGrantTenantContext = {
  requestTenantId?: string | null;
  explicitTenantId?: string | null;
};

type GrantRecord = {
  provider: MarketplaceConnectorProvider;
  tenantId: string;
  userId: number;
  status: MarketplaceConnectorGrantStatus;
  grantHash: string | null;
  authorizationAttemptHash: string | null;
  authorizationAttemptId: string | null;
  scopes: string[];
  providerAccountLabel: string | null;
  startedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  events: ConnectorGrantEvent[];
};

export type ConnectorGrantEvent = {
  type: "authorization_started" | "authorization_completed" | "revoked" | "expired" | "writeback_token_issued";
  at: string;
  provider: MarketplaceConnectorProvider;
  status: MarketplaceConnectorGrantStatus;
  message: string;
};

const DEFAULT_SCOPES = ["marketplace.search.read", "marketplace.field_discovery.read", "marketplace.writeback.write"];
const AUTHORIZATION_TTL_MS = 30 * 60 * 1000;
const DEFAULT_ACTIVE_GRANT_TTL_DAYS = 90;
const WRITEBACK_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const WRITEBACK_TOKEN_PREFIX = "mci_wb_";
const grants = new Map<string, GrantRecord>();

function getOptionalDb(): DrizzleDB | null {
  if (!process.env.DATABASE_URL) return null;
  return getDb();
}

function isConnectorGrantStorageError(error: unknown): boolean {
  const code = typeof (error as { code?: unknown })?.code === "string"
    ? (error as { code: string }).code
    : "";
  if (code === "42P01" || code === "42703") return true;

  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("marketplace_connector_grants")
    && (
      message.includes("does not exist")
      || message.includes("Failed query")
      || message.includes("column")
      || message.includes("relation")
    );
}

function connectorGrantStorageUnavailableError() {
  return new ConnectorGrantError(
    503,
    "connector_grant_storage_unavailable",
    "Marketplace connector storage is not ready. Run the latest database migrations before authorizing the connector.",
  );
}

function warnConnectorGrantStorage(operation: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error ?? "unknown error");
  console.warn(`[MarketplaceConnector] Grant storage unavailable during ${operation}: ${detail}`);
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmacSha256(value: string): string {
  return crypto.createHmac("sha256", writebackTokenSecret()).update(value).digest("base64url");
}

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(18).toString("base64url")}`;
}

function writebackTokenSecret(): string {
  const secret = String(process.env.MARKETPLACE_CONNECTOR_WRITEBACK_SECRET
    || process.env.JWT_SECRET
    || process.env.SESSION_SECRET
    || "").trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new ConnectorGrantError(
      500,
      "writeback_token_secret_missing",
      "Marketplace write-back token signing secret is not configured.",
    );
  }
  return "dev-marketplace-writeback-token-secret";
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function parseBase64UrlJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function cleanTenantId(value: unknown): string {
  return String(value || "").trim();
}

function tenantIdFromAuth(auth: SessionAuth, context: ConnectorGrantTenantContext = {}): string {
  const requestTenant = cleanTenantId(context.requestTenantId);
  if (requestTenant) return requestTenant;

  const direct = String(auth.tenantId || "").trim();
  const userTenant = String((auth.user as any)?.currentTenantId || (auth.user as any)?.tenantId || "").trim();
  const explicitTenant = cleanTenantId(context.explicitTenantId);
  return direct || userTenant || explicitTenant;
}

function userIdFromAuth(auth: SessionAuth): number {
  const direct = Number(auth.userId);
  const userId = Number((auth.user as any)?.id);
  const value = Number.isInteger(direct) && direct > 0 ? direct : userId;
  if (!Number.isInteger(value) || value <= 0) {
    throw new ConnectorGrantError(400, "user_required", "Could not resolve the current user for connector authorization.");
  }
  return value;
}

function subjectFromAuth(auth: SessionAuth, context: ConnectorGrantTenantContext = {}) {
  const tenantId = tenantIdFromAuth(auth, context);
  if (!tenantId) {
    throw new ConnectorGrantError(
      400,
      "tenant_required",
      "Could not resolve a workspace from the current session or request URL before authorizing the connector.",
    );
  }
  return {
    tenantId,
    userId: userIdFromAuth(auth),
  };
}

function grantKey(provider: MarketplaceConnectorProvider, tenantId: string, userId: number): string {
  return `${provider}:${tenantId}:${userId}`;
}

function grantIdFor(provider: MarketplaceConnectorProvider, tenantId: string, userId: number): string {
  return `mcg_${sha256(grantKey(provider, tenantId, userId)).slice(0, 24)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isPast(iso: string | null): boolean {
  return Boolean(iso && Date.parse(iso) <= Date.now());
}

function activeGrantTtlMs(days?: number | null): number {
  const normalizedDays = Number.isInteger(days) && Number(days) > 0
    ? Math.min(Number(days), 365)
    : DEFAULT_ACTIVE_GRANT_TTL_DAYS;
  return normalizedDays * 24 * 60 * 60 * 1000;
}

function activeGrantExpiresAt(days?: number | null): string {
  return new Date(Date.now() + activeGrantTtlMs(days)).toISOString();
}

function addEvent(record: GrantRecord, event: ConnectorGrantEvent) {
  record.events = [event, ...record.events].slice(0, 20);
}

function isoToDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateToIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function recordFromRow(row: typeof marketplaceConnectorGrants.$inferSelect, memoryRecord?: GrantRecord): GrantRecord {
  return {
    provider: row.provider as MarketplaceConnectorProvider,
    tenantId: row.tenantId,
    userId: row.userId,
    status: row.status as MarketplaceConnectorGrantStatus,
    grantHash: row.grantHash,
    authorizationAttemptHash: row.authorizationAttemptHash,
    authorizationAttemptId: memoryRecord?.authorizationAttemptId ?? null,
    scopes: row.scopesJson as string[],
    providerAccountLabel: row.providerAccountLabel,
    startedAt: dateToIso(row.startedAt) ?? new Date().toISOString(),
    expiresAt: dateToIso(row.expiresAt),
    revokedAt: dateToIso(row.revokedAt),
    events: memoryRecord?.events ?? [],
  };
}

async function persistGrantRecord(record: GrantRecord) {
  const db = getOptionalDb();
  if (!db) return;
  await db.insert(marketplaceConnectorGrants)
    .values({
      id: grantIdFor(record.provider, record.tenantId, record.userId),
      tenantId: record.tenantId,
      userId: record.userId,
      provider: record.provider,
      status: record.status,
      grantHash: record.grantHash,
      authorizationAttemptHash: record.authorizationAttemptHash,
      scopesJson: record.scopes,
      providerAccountLabel: record.providerAccountLabel,
      startedAt: isoToDate(record.startedAt) ?? new Date(),
      expiresAt: isoToDate(record.expiresAt),
      revokedAt: isoToDate(record.revokedAt),
      lastStatusRefreshAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        marketplaceConnectorGrants.tenantId,
        marketplaceConnectorGrants.userId,
        marketplaceConnectorGrants.provider,
      ],
      set: {
        status: record.status,
        grantHash: record.grantHash,
        authorizationAttemptHash: record.authorizationAttemptHash,
        scopesJson: record.scopes,
        providerAccountLabel: record.providerAccountLabel,
        startedAt: isoToDate(record.startedAt) ?? new Date(),
        expiresAt: isoToDate(record.expiresAt),
        revokedAt: isoToDate(record.revokedAt),
        lastStatusRefreshAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

async function persistGrantEvent(record: GrantRecord, event: ConnectorGrantEvent) {
  const db = getOptionalDb();
  if (!db) return;
  await db.insert(marketplaceConnectorGrantEvents)
    .values({
      id: `mcge_${sha256(`${record.tenantId}:${record.userId}:${record.provider}:${event.type}:${event.at}:${event.status}`).slice(0, 24)}`,
      grantId: grantIdFor(record.provider, record.tenantId, record.userId),
      tenantId: record.tenantId,
      userId: record.userId,
      provider: record.provider,
      eventType: event.type,
      status: event.status,
      safeMessage: event.message,
      metadataJson: {},
      createdAt: isoToDate(event.at) ?? new Date(),
    })
    .onConflictDoNothing();
}

async function loadGrantRecord(
  provider: MarketplaceConnectorProvider,
  tenantId: string,
  userId: number,
): Promise<GrantRecord | null> {
  const memoryRecord = grants.get(grantKey(provider, tenantId, userId));
  const db = getOptionalDb();
  if (!db) return memoryRecord ?? null;
  const [row] = await db.select()
    .from(marketplaceConnectorGrants)
    .where(and(
      eq(marketplaceConnectorGrants.provider, provider),
      eq(marketplaceConnectorGrants.tenantId, tenantId),
      eq(marketplaceConnectorGrants.userId, userId),
    ))
    .limit(1);
  if (!row) return memoryRecord ?? null;
  const record = recordFromRow(row, memoryRecord);
  grants.set(grantKey(provider, tenantId, userId), record);
  return record;
}

function responseFromRecord(record: GrantRecord): MarketplaceConnectorGrantStatusResponse {
  let status = record.status;
  if ((status === "active" || status === "pending") && isPast(record.expiresAt)) {
    status = "expired";
    record.status = "expired";
    addEvent(record, {
      type: "expired",
      at: nowIso(),
      provider: record.provider,
      status,
      message: "Connector grant expired.",
    });
  }
  return {
    provider: record.provider,
    status,
    scopes: record.scopes,
    providerAccountLabel: record.providerAccountLabel,
    startedAt: record.startedAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    grantHashPrefix: record.grantHash ? record.grantHash.slice(0, 12) : null,
    authorizationAttemptId: status === "pending" ? record.authorizationAttemptId : null,
    message: status === "active"
      ? "Connector grant is active for lab testing."
      : status === "pending"
        ? "Authorization page was opened. Complete authorization after returning from the provider."
        : null,
  };
}

type MarketplaceConnectorWriteBackTokenClaims = {
  v: 1;
  typ: "marketplace_connector_writeback";
  provider: MarketplaceConnectorProvider;
  tenantId: string;
  userId: number;
  grantHash: string;
  scopes: string[];
  iat: number;
  exp: number;
  jti: string;
};

export type MarketplaceConnectorWriteBackTokenIssue = {
  provider: MarketplaceConnectorProvider;
  token: string;
  tokenType: "Bearer";
  expiresAt: string;
  scopes: string[];
  tenantId: string;
  userId: number;
  grantHashPrefix: string;
};

export type MarketplaceConnectorWriteBackTokenAuth = {
  auth: SessionAuth;
  provider: MarketplaceConnectorProvider;
  context: ConnectorGrantTenantContext;
  claims: MarketplaceConnectorWriteBackTokenClaims;
};

function notConnected(provider: MarketplaceConnectorProvider, message: string | null = null): MarketplaceConnectorGrantStatusResponse {
  return {
    provider,
    status: "not_connected",
    scopes: [],
    providerAccountLabel: null,
    startedAt: null,
    expiresAt: null,
    revokedAt: null,
    grantHashPrefix: null,
    authorizationAttemptId: null,
    message,
  };
}

export class ConnectorGrantError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function getConnectorGrantStatus(
  auth: SessionAuth,
  provider: MarketplaceConnectorProvider,
  context: ConnectorGrantTenantContext = {},
) {
  const subject = subjectFromAuth(auth, context);
  let record: GrantRecord | null = null;
  try {
    record = await loadGrantRecord(provider, subject.tenantId, subject.userId);
  } catch (error) {
    if (!isConnectorGrantStorageError(error)) throw error;
    warnConnectorGrantStorage("status lookup", error);
    return notConnected(
      provider,
      "Marketplace connector storage is not ready. Run the latest database migrations before authorizing the connector.",
    );
  }
  const response = record ? responseFromRecord(record) : notConnected(provider);
  if (record) {
    try {
      await persistGrantRecord(record);
    } catch (error) {
      if (!isConnectorGrantStorageError(error)) throw error;
      warnConnectorGrantStorage("status refresh", error);
    }
  }
  return response;
}

export async function assertActiveConnectorGrant(
  auth: SessionAuth,
  provider: MarketplaceConnectorProvider,
  context: ConnectorGrantTenantContext = {},
) {
  const status = await getConnectorGrantStatus(auth, provider, context);
  if (status.status !== "active") {
    throw new ConnectorGrantError(
      403,
      "connector_grant_not_active",
      status.status === "pending"
        ? "Connector authorization is pending. Complete authorization before writing marketplace data."
        : "Authorize the connector in Settings before writing marketplace data.",
    );
  }
  return status;
}

export async function issueConnectorWriteBackToken(params: {
  auth: SessionAuth;
  provider: MarketplaceConnectorProvider;
  context?: ConnectorGrantTenantContext;
  ttlMs?: number | null;
}): Promise<MarketplaceConnectorWriteBackTokenIssue> {
  const subject = subjectFromAuth(params.auth, params.context);
  const record = await loadGrantRecord(params.provider, subject.tenantId, subject.userId);
  if (!record || responseFromRecord(record).status !== "active" || !record.grantHash) {
    throw new ConnectorGrantError(
      403,
      "connector_grant_not_active",
      "Authorize the connector in Settings before issuing a write-back token.",
    );
  }
  const ttlMs = Number.isInteger(params.ttlMs) && Number(params.ttlMs) > 0
    ? Math.min(Number(params.ttlMs), WRITEBACK_TOKEN_TTL_MS)
    : WRITEBACK_TOKEN_TTL_MS;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const exp = nowSeconds + Math.floor(ttlMs / 1000);
  const claims: MarketplaceConnectorWriteBackTokenClaims = {
    v: 1,
    typ: "marketplace_connector_writeback",
    provider: params.provider,
    tenantId: subject.tenantId,
    userId: subject.userId,
    grantHash: record.grantHash,
    scopes: Array.from(new Set([...record.scopes, "marketplace.writeback.write"])),
    iat: nowSeconds,
    exp,
    jti: randomId("mciwbt"),
  };
  const encodedClaims = base64UrlJson(claims);
  const token = `${WRITEBACK_TOKEN_PREFIX}${encodedClaims}.${hmacSha256(encodedClaims)}`;
  const event: ConnectorGrantEvent = {
    type: "writeback_token_issued",
    at: nowIso(),
    provider: params.provider,
    status: "active",
    message: "Marketplace connector write-back token issued.",
  };
  addEvent(record, event);
  try {
    await persistGrantEvent(record, event);
  } catch (error) {
    if (!isConnectorGrantStorageError(error)) throw error;
    warnConnectorGrantStorage("write-back token event", error);
  }
  grants.set(grantKey(params.provider, subject.tenantId, subject.userId), record);
  return {
    provider: params.provider,
    token,
    tokenType: "Bearer",
    expiresAt: new Date(exp * 1000).toISOString(),
    scopes: claims.scopes,
    tenantId: subject.tenantId,
    userId: subject.userId,
    grantHashPrefix: record.grantHash.slice(0, 12),
  };
}

export async function verifyConnectorWriteBackToken(token: string): Promise<MarketplaceConnectorWriteBackTokenAuth> {
  const trimmed = token.trim();
  if (!trimmed.startsWith(WRITEBACK_TOKEN_PREFIX)) {
    throw new ConnectorGrantError(401, "invalid_writeback_token", "Invalid marketplace write-back token.");
  }
  const compact = trimmed.slice(WRITEBACK_TOKEN_PREFIX.length);
  const [encodedClaims, signature, extra] = compact.split(".");
  if (!encodedClaims || !signature || extra !== undefined) {
    throw new ConnectorGrantError(401, "invalid_writeback_token", "Invalid marketplace write-back token.");
  }
  const expectedSignature = hmacSha256(encodedClaims);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new ConnectorGrantError(401, "invalid_writeback_token", "Invalid marketplace write-back token.");
  }
  let claims: MarketplaceConnectorWriteBackTokenClaims;
  try {
    claims = parseBase64UrlJson<MarketplaceConnectorWriteBackTokenClaims>(encodedClaims);
  } catch {
    throw new ConnectorGrantError(401, "invalid_writeback_token", "Invalid marketplace write-back token.");
  }
  if (claims.v !== 1 || claims.typ !== "marketplace_connector_writeback" || claims.provider !== "shopee") {
    throw new ConnectorGrantError(401, "invalid_writeback_token", "Invalid marketplace write-back token.");
  }
  if (!claims.tenantId || !Number.isInteger(claims.userId) || claims.userId <= 0 || !claims.grantHash) {
    throw new ConnectorGrantError(401, "invalid_writeback_token", "Invalid marketplace write-back token.");
  }
  if (claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new ConnectorGrantError(401, "writeback_token_expired", "Marketplace write-back token has expired. Generate a new token from Connector Lab.");
  }
  const record = await loadGrantRecord(claims.provider, claims.tenantId, claims.userId);
  if (!record || responseFromRecord(record).status !== "active" || record.grantHash !== claims.grantHash) {
    throw new ConnectorGrantError(
      403,
      "connector_grant_not_active",
      "Connector grant is no longer active for this write-back token.",
    );
  }
  const auth: SessionAuth = {
    ok: true,
    mode: "session",
    user: {
      id: claims.userId,
      currentTenantId: claims.tenantId,
    },
    userId: claims.userId,
    tenantId: claims.tenantId,
    sub: String(claims.userId),
    scopes: claims.scopes,
  };
  return {
    auth,
    provider: claims.provider,
    context: { requestTenantId: claims.tenantId },
    claims,
  };
}

export async function refreshActiveConnectorGrantTtl(params: {
  auth: SessionAuth;
  provider: MarketplaceConnectorProvider;
  context?: ConnectorGrantTenantContext;
  activeGrantTtlDays?: number | null;
}) {
  const subject = subjectFromAuth(params.auth, params.context);
  const record = await loadGrantRecord(params.provider, subject.tenantId, subject.userId);
  if (!record || record.status !== "active") return record ? responseFromRecord(record) : notConnected(params.provider);
  const targetExpiresAt = activeGrantExpiresAt(params.activeGrantTtlDays);
  const currentTime = record.expiresAt ? Date.parse(record.expiresAt) : 0;
  const targetTime = Date.parse(targetExpiresAt);
  if (!Number.isFinite(currentTime) || currentTime < targetTime - 60 * 60 * 1000) {
    record.expiresAt = targetExpiresAt;
    try {
      await persistGrantRecord(record);
    } catch (error) {
      if (!isConnectorGrantStorageError(error)) throw error;
      warnConnectorGrantStorage("active grant TTL refresh", error);
    }
    grants.set(grantKey(params.provider, subject.tenantId, subject.userId), record);
  }
  return responseFromRecord(record);
}

export async function startConnectorAuthorization(params: {
  auth: SessionAuth;
  provider: MarketplaceConnectorProvider;
  authorizationUrl: string;
  context?: ConnectorGrantTenantContext;
}) {
  const subject = subjectFromAuth(params.auth, params.context);
  const attemptId = randomId("mcga");
  const startedAt = nowIso();
  const expiresAt = new Date(Date.now() + AUTHORIZATION_TTL_MS).toISOString();
  const record: GrantRecord = {
    provider: params.provider,
    tenantId: subject.tenantId,
    userId: subject.userId,
    status: "pending",
    grantHash: null,
    authorizationAttemptHash: sha256(attemptId),
    authorizationAttemptId: attemptId,
    scopes: DEFAULT_SCOPES,
    providerAccountLabel: "Shopee connector",
    startedAt,
    expiresAt,
    revokedAt: null,
    events: [],
  };
  const event: ConnectorGrantEvent = {
    type: "authorization_started",
    at: startedAt,
    provider: params.provider,
    status: "pending",
    message: "Browser authorization page opened.",
  };
  addEvent(record, event);
  try {
    await persistGrantRecord(record);
    await persistGrantEvent(record, event);
  } catch (error) {
    if (!isConnectorGrantStorageError(error)) throw error;
    warnConnectorGrantStorage("authorization start", error);
    throw connectorGrantStorageUnavailableError();
  }
  grants.set(grantKey(params.provider, subject.tenantId, subject.userId), record);
  return {
    ...responseFromRecord(record),
    authorizationUrl: params.authorizationUrl,
    nextAction: "open_browser" as const,
  };
}

export async function completeConnectorAuthorization(params: {
  auth: SessionAuth;
  provider: MarketplaceConnectorProvider;
  authorizationAttemptId?: string | null;
  context?: ConnectorGrantTenantContext;
  activeGrantTtlDays?: number | null;
}) {
  const subject = subjectFromAuth(params.auth, params.context);
  const key = grantKey(params.provider, subject.tenantId, subject.userId);
  const record = await loadGrantRecord(params.provider, subject.tenantId, subject.userId);
  if (!record || record.status !== "pending") {
    throw new ConnectorGrantError(409, "authorization_not_started", "Start connector authorization before completing it.");
  }
  if (isPast(record.expiresAt)) {
    record.status = "expired";
    throw new ConnectorGrantError(410, "authorization_expired", "Connector authorization attempt has expired.");
  }
  if (params.authorizationAttemptId && sha256(params.authorizationAttemptId) !== record.authorizationAttemptHash) {
    throw new ConnectorGrantError(403, "authorization_attempt_mismatch", "Connector authorization attempt does not match this session.");
  }
  const grantId = randomId("mcg");
  record.status = "active";
  record.grantHash = sha256(`${params.provider}:${subject.tenantId}:${subject.userId}:${grantId}`);
  record.authorizationAttemptHash = null;
  record.authorizationAttemptId = null;
  record.expiresAt = activeGrantExpiresAt(params.activeGrantTtlDays);
  record.revokedAt = null;
  const event: ConnectorGrantEvent = {
    type: "authorization_completed",
    at: nowIso(),
    provider: params.provider,
    status: "active",
    message: "User confirmed connector authorization completion.",
  };
  addEvent(record, event);
  try {
    await persistGrantRecord(record);
    await persistGrantEvent(record, event);
  } catch (error) {
    if (!isConnectorGrantStorageError(error)) throw error;
    warnConnectorGrantStorage("authorization completion", error);
    throw connectorGrantStorageUnavailableError();
  }
  grants.set(key, record);
  return responseFromRecord(record);
}

export async function revokeConnectorGrant(
  auth: SessionAuth,
  provider: MarketplaceConnectorProvider,
  context: ConnectorGrantTenantContext = {},
) {
  const subject = subjectFromAuth(auth, context);
  const key = grantKey(provider, subject.tenantId, subject.userId);
  const record = await loadGrantRecord(provider, subject.tenantId, subject.userId);
  if (!record) return notConnected(provider);
  record.status = "revoked";
  record.revokedAt = nowIso();
  record.expiresAt = null;
  record.authorizationAttemptHash = null;
  record.authorizationAttemptId = null;
  const event: ConnectorGrantEvent = {
    type: "revoked",
    at: record.revokedAt,
    provider,
    status: "revoked",
    message: "Connector grant revoked by user.",
  };
  addEvent(record, event);
  try {
    await persistGrantRecord(record);
    await persistGrantEvent(record, event);
  } catch (error) {
    if (!isConnectorGrantStorageError(error)) throw error;
    warnConnectorGrantStorage("grant revoke", error);
    throw connectorGrantStorageUnavailableError();
  }
  grants.set(key, record);
  return responseFromRecord(record);
}

export async function listConnectorGrantEvents(
  auth: SessionAuth,
  provider: MarketplaceConnectorProvider,
  context: ConnectorGrantTenantContext = {},
): Promise<ConnectorGrantEvent[]> {
  const subject = subjectFromAuth(auth, context);
  const record = grants.get(grantKey(provider, subject.tenantId, subject.userId));
  const db = getOptionalDb();
  if (!db) return record?.events ?? [];
  let rows: Array<typeof marketplaceConnectorGrantEvents.$inferSelect>;
  try {
    rows = await db.select()
      .from(marketplaceConnectorGrantEvents)
      .where(and(
        eq(marketplaceConnectorGrantEvents.provider, provider),
        eq(marketplaceConnectorGrantEvents.tenantId, subject.tenantId),
        eq(marketplaceConnectorGrantEvents.userId, subject.userId),
      ))
      .orderBy(desc(marketplaceConnectorGrantEvents.createdAt))
      .limit(20);
  } catch (error) {
    if (!isConnectorGrantStorageError(error)) throw error;
    warnConnectorGrantStorage("event lookup", error);
    return record?.events ?? [];
  }
  return rows.map((row) => ({
    type: row.eventType as ConnectorGrantEvent["type"],
    at: dateToIso(row.createdAt) ?? new Date().toISOString(),
    provider: row.provider as MarketplaceConnectorProvider,
    status: row.status as MarketplaceConnectorGrantStatus,
    message: row.safeMessage ?? "",
  }));
}

export function clearConnectorGrantStoreForTest() {
  grants.clear();
}
