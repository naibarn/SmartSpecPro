import { and, eq, inArray } from "drizzle-orm";
import { providerDeploymentCredentials, systemSettings } from "../../drizzle/schema";
import type { DrizzleDB } from "../db";
import { decrypt, encrypt } from "./crypto";
import { deploymentCredentialRef, type DeploymentTargetIdentity } from "./providerDeploymentTargetAuthority";
import {
  CLOUDFLARE_PROBE_SERVICES,
  CLOUDFLARE_ZONE_PROBE_SERVICES,
  type CloudflareCredentialProfileId,
  type CloudflareProbeStatus,
} from "../../shared/cloudflareCredentialCatalog";

const CREDENTIALS_KEY = "cloudflare_api_credentials_v1";
const PERMISSION_CATALOG_CACHE_KEY = "cloudflare_permission_catalog_cache_v1";
const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

type StoredProfile = { label: string; token: string; updatedAt: string };
type StoredCredentials = Partial<Record<"audit" | "deployment", StoredProfile>>;

function secretValue(row: { value: string | null; isSensitive: boolean | null }): string {
  if (!row.value) return "";
  if (!row.isSensitive) return row.value;
  try {
    return decrypt(row.value);
  } catch {
    return "";
  }
}

async function readStoredCredentials(db: DrizzleDB): Promise<StoredCredentials> {
  const [row] = await db.select({ value: systemSettings.value, isSensitive: systemSettings.isSensitive })
    .from(systemSettings)
    .where(and(eq(systemSettings.category, "infrastructure"), eq(systemSettings.key, CREDENTIALS_KEY)))
    .limit(1);
  if (!row?.value) return {};
  try {
    const parsed = JSON.parse(secretValue(row)) as StoredCredentials;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function getCloudflareCredentialCenterState(db: DrizzleDB) {
  const [legacyRows, stored, centerRow] = await Promise.all([
    db.select({ key: systemSettings.key, value: systemSettings.value, isSensitive: systemSettings.isSensitive })
      .from(systemSettings)
      .where(and(eq(systemSettings.category, "vectordb"), inArray(systemSettings.key, ["vectorizeAccountId", "vectorizeApiToken"]))),
    readStoredCredentials(db),
    db.select({ updatedAt: systemSettings.updatedAt }).from(systemSettings)
      .where(and(eq(systemSettings.category, "infrastructure"), eq(systemSettings.key, CREDENTIALS_KEY))).limit(1),
  ]);
  const legacy = Object.fromEntries(legacyRows.map((row) => [row.key, secretValue(row)]));
  const accountId = legacy.vectorizeAccountId || process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || "";
  const legacyTokenConfigured = Boolean(legacy.vectorizeApiToken || process.env.VECTORIZE_API_TOKEN);

  return {
    accountId,
    accountIdSource: legacy.vectorizeAccountId ? "vectordb" as const : accountId ? "environment" as const : "none" as const,
    legacyVectorize: { configured: legacyTokenConfigured, source: legacy.vectorizeApiToken ? "vectordb" as const : process.env.VECTORIZE_API_TOKEN ? "environment" as const : "none" as const },
    profiles: {
      audit: { configured: Boolean(stored.audit?.token), label: stored.audit?.label ?? "", updatedAt: stored.audit?.updatedAt ?? null },
      deployment: { configured: Boolean(stored.deployment?.token), label: stored.deployment?.label ?? "", updatedAt: stored.deployment?.updatedAt ?? null },
    },
    lastSavedAt: centerRow[0]?.updatedAt?.toISOString() ?? null,
    runtime: {
      workerUrlConfigured: Boolean(process.env.CLOUDFLARE_RUNTIME_URL?.trim()),
      runtimeTokenConfigured: Boolean(process.env.CLOUDFLARE_RUNTIME_TOKEN?.trim()),
      searchCacheTokenConfigured: Boolean(process.env.CLOUDFLARE_SEARCH_CACHE_TOKEN?.trim()),
      secretSource: "deployment environment / secret manager" as const,
    },
  };
}

export async function saveCloudflareCredentialProfile(
  db: DrizzleDB,
  profileId: "audit" | "deployment",
  token: string,
  label: string,
  userId?: number,
) {
  const credentials = await readStoredCredentials(db);
  credentials[profileId] = { label, token, updatedAt: new Date().toISOString() };
  await upsertCredentialSetting(db, JSON.stringify(credentials), userId);
}

export async function removeCloudflareCredentialProfile(
  db: DrizzleDB,
  profileId: "audit" | "deployment",
  userId?: number,
) {
  const credentials = await readStoredCredentials(db);
  delete credentials[profileId];
  if (Object.keys(credentials).length === 0) {
    await db.delete(systemSettings).where(and(eq(systemSettings.category, "infrastructure"), eq(systemSettings.key, CREDENTIALS_KEY)));
    return;
  }
  await upsertCredentialSetting(db, JSON.stringify(credentials), userId);
}

async function upsertCredentialSetting(db: DrizzleDB, value: string, userId?: number) {
  const [existing] = await db.select({ id: systemSettings.id }).from(systemSettings)
    .where(and(eq(systemSettings.category, "infrastructure"), eq(systemSettings.key, CREDENTIALS_KEY))).limit(1);
  const encrypted = encrypt(value);
  if (existing) {
    await db.update(systemSettings).set({ value: encrypted, isSensitive: true, updatedBy: userId, updatedAt: new Date() })
      .where(eq(systemSettings.id, existing.id));
  } else {
    await db.insert(systemSettings).values({
      category: "infrastructure", key: CREDENTIALS_KEY, value: encrypted, isSensitive: true,
      description: "Encrypted Cloudflare API credential profiles", updatedBy: userId,
    });
  }
}

async function readProfileToken(db: DrizzleDB, profileId: CloudflareCredentialProfileId): Promise<string> {
  if (profileId === "vectorize") {
    const [row] = await db.select({ value: systemSettings.value, isSensitive: systemSettings.isSensitive })
      .from(systemSettings).where(and(eq(systemSettings.category, "vectordb"), eq(systemSettings.key, "vectorizeApiToken"))).limit(1);
    return secretValue(row ?? { value: null, isSensitive: false }) || process.env.VECTORIZE_API_TOKEN?.trim() || "";
  }
  const stored = await readStoredCredentials(db);
  return stored[profileId]?.token ?? "";
}

/** Runs a provider request with a credential resolved from the encrypted credential center. */
export async function withCloudflareCredential<T>(
  db: DrizzleDB,
  profileId: Exclude<CloudflareCredentialProfileId, "vectorize">,
  operation: (token: string) => Promise<T>,
): Promise<{ configured: false } | { configured: true; value: T }> {
  const token = await readProfileToken(db, profileId);
  if (!token) return { configured: false };
  return { configured: true, value: await operation(token) };
}

export type DeploymentCredentialState = "CONFIGURED" | "NOT_CONFIGURED" | "PERMISSION_DENIED" | "REVOKED" | "UNAVAILABLE";

/** Metadata-only credential state; never returns ciphertext or plaintext. */
export async function getCloudflareDeploymentCredentialState(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; credentialRef: string;
}): Promise<{ status: DeploymentCredentialState; credentialRef: string }> {
  if (input.identity.provider !== "cloudflare" || input.credentialRef !== deploymentCredentialRef(input.identity))
    return { status: "PERMISSION_DENIED", credentialRef: input.credentialRef };
  try {
    const [row] = await db.select({ status: providerDeploymentCredentials.status, encryptedSecret: providerDeploymentCredentials.encryptedSecret })
      .from(providerDeploymentCredentials).where(and(
        eq(providerDeploymentCredentials.tenantId, input.identity.tenantId),
        eq(providerDeploymentCredentials.projectId, input.identity.projectId),
        eq(providerDeploymentCredentials.environment, input.identity.environment),
        eq(providerDeploymentCredentials.provider, input.identity.provider),
        eq(providerDeploymentCredentials.credentialRef, input.credentialRef),
      )).limit(1);
    if (!row) return { status: "NOT_CONFIGURED", credentialRef: input.credentialRef };
    if (row.status === "REVOKED") return { status: "REVOKED", credentialRef: input.credentialRef };
    if (row.status !== "CONFIGURED" || !row.encryptedSecret) return { status: "UNAVAILABLE", credentialRef: input.credentialRef };
    try { if (!decrypt(row.encryptedSecret)) return { status: "UNAVAILABLE", credentialRef: input.credentialRef }; }
    catch { return { status: "UNAVAILABLE", credentialRef: input.credentialRef }; }
    return { status: "CONFIGURED", credentialRef: input.credentialRef };
  } catch {
    return { status: "UNAVAILABLE", credentialRef: input.credentialRef };
  }
}

/** Resolves a scoped secret only for an exact target binding and keeps it inside the provider callback. */
export async function withCloudflareDeploymentCredential<T>(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; credentialRef: string;
}, operation: (token: string) => Promise<T>): Promise<{ status: DeploymentCredentialState; value?: T }> {
  if (input.identity.provider !== "cloudflare" || input.credentialRef !== deploymentCredentialRef(input.identity))
    return { status: "PERMISSION_DENIED" };
  try {
    const [row] = await db.select({ status: providerDeploymentCredentials.status, encryptedSecret: providerDeploymentCredentials.encryptedSecret })
      .from(providerDeploymentCredentials).where(and(
        eq(providerDeploymentCredentials.tenantId, input.identity.tenantId),
        eq(providerDeploymentCredentials.projectId, input.identity.projectId),
        eq(providerDeploymentCredentials.environment, input.identity.environment),
        eq(providerDeploymentCredentials.provider, input.identity.provider),
        eq(providerDeploymentCredentials.credentialRef, input.credentialRef),
      )).limit(1);
    if (!row) return { status: "NOT_CONFIGURED" };
    if (row.status === "REVOKED") return { status: "REVOKED" };
    if (row.status !== "CONFIGURED" || !row.encryptedSecret) return { status: "UNAVAILABLE" };
    let token: string;
    try { token = decrypt(row.encryptedSecret); } catch { return { status: "UNAVAILABLE" }; }
    if (!token) return { status: "UNAVAILABLE" };
    return { status: "CONFIGURED", value: await operation(token) };
  } catch {
    return { status: "UNAVAILABLE" };
  }
}

export async function saveCloudflareDeploymentCredential(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; token: string; actorUserId?: number;
}) {
  if (input.identity.provider !== "cloudflare") throw new Error("UNSUPPORTED_DEPLOYMENT_TARGET_PROVIDER");
  const credentialRef = deploymentCredentialRef(input.identity);
  await db.insert(providerDeploymentCredentials).values({
    ...input.identity, credentialRef, encryptedSecret: encrypt(input.token), status: "CONFIGURED", revokedAt: null,
    createdBy: input.actorUserId ?? null, updatedBy: input.actorUserId ?? null,
  }).onConflictDoUpdate({ target: providerDeploymentCredentials.credentialRef,
    set: { encryptedSecret: encrypt(input.token), status: "CONFIGURED", revokedAt: null, updatedBy: input.actorUserId ?? null, updatedAt: new Date() } });
  return { status: "CONFIGURED" as const, credentialRef };
}

export async function revokeCloudflareDeploymentCredential(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; credentialRef: string; actorUserId?: number;
}) {
  if (input.identity.provider !== "cloudflare" || input.credentialRef !== deploymentCredentialRef(input.identity))
    return { status: "PERMISSION_DENIED" as const };
  const rows = await db.update(providerDeploymentCredentials).set({ status: "REVOKED", revokedAt: new Date(), updatedBy: input.actorUserId ?? null, updatedAt: new Date() })
    .where(and(eq(providerDeploymentCredentials.tenantId, input.identity.tenantId),
      eq(providerDeploymentCredentials.projectId, input.identity.projectId),
      eq(providerDeploymentCredentials.environment, input.identity.environment),
      eq(providerDeploymentCredentials.provider, input.identity.provider),
      eq(providerDeploymentCredentials.credentialRef, input.credentialRef)))
    .returning({ id: providerDeploymentCredentials.id });
  return { status: rows.length ? "REVOKED" as const : "NOT_CONFIGURED" as const };
}

type ProbeResult = { id: string; label: string; scope: string; permission: string; status: CloudflareProbeStatus; httpStatus: number | null };

function statusFor(httpStatus: number, success: boolean): CloudflareProbeStatus {
  if (httpStatus === 200 && success) return "granted";
  if (httpStatus === 401) return "invalid_token";
  if (httpStatus === 403) return "missing_permission";
  if (httpStatus === 404) return "resource_not_found";
  if (httpStatus === 429) return "rate_limited";
  if (httpStatus === 400) return "unsupported_or_invalid_request";
  return "unavailable";
}

export type CloudflarePermissionGroup = {
  id: string;
  name: string;
  category: string;
  scopes: string[];
  description: string;
  selectable: boolean | null;
};

export type CloudflarePermissionCatalogResult = {
  status: CloudflareProbeStatus;
  checkedAt: string;
  httpStatus: number | null;
  groups: CloudflarePermissionGroup[];
  totalCount: number;
  complete: boolean;
  stale: boolean;
  lastSuccessAt: string | null;
  sources: Array<{ scope: "account" | "user"; status: CloudflareProbeStatus; httpStatus: number | null; groupCount: number; complete: boolean }>;
};

type PermissionGroupSourceResult = Omit<CloudflarePermissionCatalogResult, "sources" | "stale" | "lastSuccessAt">;

function boundedString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

/**
 * Fetch the current account API token permission groups without mutating Cloudflare.
 * Cloudflare documents this endpoint as requiring Account API Tokens Read (or Write).
 */
async function fetchPermissionGroupsFromEndpoint(
  token: string,
  endpoint: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PermissionGroupSourceResult> {
  const checkedAt = new Date().toISOString();
  try {
    const readPage = async (page: number) => {
      const url = `${CLOUDFLARE_API_BASE}${endpoint}?page=${page}&per_page=100`;
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8_000),
      });
      const body = await response.json().catch(() => null) as { success?: boolean; result?: unknown; result_info?: { total_count?: number; page?: number; per_page?: number } } | null;
      return { response, body };
    };
    const first = await readPage(1);
    const firstPageValid = first.response.status === 200 && first.body?.success === true && Array.isArray(first.body.result);
    const reportedStatus = statusFor(first.response.status, first.body?.success === true);
    const status = reportedStatus === "granted" && !firstPageValid ? "unavailable" : reportedStatus;
    const rawFirstPage = firstPageValid ? first.body!.result as unknown[] : [];
    const paginated = Boolean(first.body?.result_info);
    const totalCount = Number.isInteger(first.body?.result_info?.total_count) && (first.body?.result_info?.total_count ?? -1) >= 0
      ? first.body!.result_info!.total_count!
      : rawFirstPage.length;
    const reportedPerPage = first.body?.result_info?.per_page;
    const perPage = Math.min(Math.max(reportedPerPage ?? (rawFirstPage.length || 100), 1), 100);
    const pageCount = paginated ? Math.min(Math.ceil(totalCount / perPage), 20) : 1;
    const laterPages: Awaited<ReturnType<typeof readPage>>[] = [];
    for (let page = 2; page <= pageCount; page += 4) {
      const batchSize = Math.min(4, pageCount - page + 1);
      const batch = await Promise.all(Array.from({ length: batchSize }, (_, index) => readPage(page + index)));
      laterPages.push(...batch);
      if (batch.some(({ response, body }) => response.status !== 200 || body?.success !== true || !Array.isArray(body.result))) break;
    }
    const failedPage = laterPages.find(({ response, body }) => response.status !== 200 || body?.success !== true || !Array.isArray(body.result));
    const rawGroups = [...rawFirstPage, ...laterPages.flatMap(({ body }) => Array.isArray(body?.result) ? body.result : [])];
    const mappedGroups = rawGroups.flatMap((value): CloudflarePermissionGroup[] => {
      if (!value || typeof value !== "object") return [];
      const group = value as Record<string, unknown>;
      const id = boundedString(group.id, 128);
      const name = boundedString(group.name, 180);
      if (!id || !name) return [];
      return [{
        id,
        name,
        category: boundedString(group.category, 80),
        scopes: Array.isArray(group.scopes) ? group.scopes.slice(0, 8).flatMap((scope) => typeof scope === "string" ? [scope.slice(0, 100)] : []) : [],
        description: boundedString(group.description, 500),
        selectable: typeof group.is_selectable === "boolean" ? group.is_selectable : null,
      }];
    });
    const uniqueGroups = [...new Map(mappedGroups.map((group) => [group.id, group])).values()];
    const groups = uniqueGroups.slice(0, 2_000);
    const complete = status === "granted" && firstPageValid && !failedPage
      && (pageCount < 20 || groups.length >= totalCount)
      && (paginated ? groups.length >= totalCount : groups.length === totalCount);
    return { status: failedPage ? statusFor(failedPage.response.status, failedPage.body?.success === true) : status, checkedAt, httpStatus: failedPage?.response.status ?? first.response.status, groups, totalCount, complete };
  } catch {
    return { status: "unavailable", checkedAt, httpStatus: null, groups: [], totalCount: 0, complete: false };
  }
}

export function fetchCloudflarePermissionGroups(token: string, accountId: string, fetchImpl: typeof fetch = fetch): Promise<PermissionGroupSourceResult> {
  return fetchPermissionGroupsFromEndpoint(token, `/accounts/${encodeURIComponent(accountId)}/tokens/permission_groups`, fetchImpl);
}

export function fetchCloudflareUserPermissionGroups(token: string, fetchImpl: typeof fetch = fetch): Promise<PermissionGroupSourceResult> {
  return fetchPermissionGroupsFromEndpoint(token, "/user/tokens/permission_groups", fetchImpl);
}

export function combineCloudflarePermissionCatalogs(
  account: PermissionGroupSourceResult,
  user: PermissionGroupSourceResult,
): CloudflarePermissionCatalogResult {
  const byId = new Map([...account.groups, ...user.groups].map((group) => [group.id, group]));
  const groups = [...byId.values()];
  const complete = account.status === "granted" && account.complete && user.status === "granted" && user.complete;
  const status: CloudflareProbeStatus = complete ? "granted"
    : account.status === "granted" || user.status === "granted" ? "partial"
      : account.status !== "granted" ? account.status : user.status;
  const failedSource = account.status === "granted" && account.complete ? user : account;
  const checkedAt = new Date().toISOString();
  return {
    status,
    checkedAt,
    httpStatus: complete ? 200 : failedSource.httpStatus,
    groups,
    totalCount: groups.length,
    complete,
    stale: false,
    lastSuccessAt: complete ? checkedAt : null,
    sources: [
      { scope: "account", status: account.status, httpStatus: account.httpStatus, groupCount: account.groups.length, complete: account.complete },
      { scope: "user", status: user.status, httpStatus: user.httpStatus, groupCount: user.groups.length, complete: user.complete },
    ],
  };
}

export async function probeCloudflarePermissionCatalog(
  db: DrizzleDB,
  profileId: CloudflareCredentialProfileId,
): Promise<CloudflarePermissionCatalogResult> {
  const token = await readProfileToken(db, profileId);
  if (!token) return { status: "unavailable", checkedAt: new Date().toISOString(), httpStatus: null, groups: [], totalCount: 0, complete: false, stale: false, lastSuccessAt: null, sources: [] };
  const [accountRow] = await db.select({ value: systemSettings.value, isSensitive: systemSettings.isSensitive })
    .from(systemSettings).where(and(eq(systemSettings.category, "vectordb"), eq(systemSettings.key, "vectorizeAccountId"))).limit(1);
  const accountId = secretValue(accountRow ?? { value: null, isSensitive: false }) || process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || "";
  if (!accountId) return { status: "unavailable", checkedAt: new Date().toISOString(), httpStatus: null, groups: [], totalCount: 0, complete: false, stale: false, lastSuccessAt: null, sources: [] };
  const [accountCatalog, userCatalog] = await Promise.all([
    fetchCloudflarePermissionGroups(token, accountId),
    fetchCloudflareUserPermissionGroups(token),
  ]);
  const result = combineCloudflarePermissionCatalogs(accountCatalog, userCatalog);
  if (result.status === "granted" && result.complete) {
    const cacheValue = JSON.stringify({ accountId, checkedAt: result.checkedAt, totalCount: result.totalCount, groups: result.groups, sources: result.sources });
    const [existing] = await db.select({ id: systemSettings.id }).from(systemSettings)
      .where(and(eq(systemSettings.category, "infrastructure"), eq(systemSettings.key, PERMISSION_CATALOG_CACHE_KEY))).limit(1);
    if (existing) {
      await db.update(systemSettings).set({ value: cacheValue, isSensitive: false, updatedAt: new Date() }).where(eq(systemSettings.id, existing.id));
    } else {
      await db.insert(systemSettings).values({ category: "infrastructure", key: PERMISSION_CATALOG_CACHE_KEY, value: cacheValue, isSensitive: false, description: "Non-secret Cloudflare permission-group catalog cache" });
    }
    return result;
  }
  const [cachedRow] = await db.select({ value: systemSettings.value }).from(systemSettings)
    .where(and(eq(systemSettings.category, "infrastructure"), eq(systemSettings.key, PERMISSION_CATALOG_CACHE_KEY))).limit(1);
  try {
    const cached = cachedRow?.value ? JSON.parse(cachedRow.value) as { accountId?: string; checkedAt?: string; totalCount?: number; groups?: CloudflarePermissionGroup[]; sources?: CloudflarePermissionCatalogResult["sources"] } : null;
    if (cached?.accountId === accountId && Array.isArray(cached.groups) && cached.checkedAt) {
      return { ...result, groups: cached.groups, totalCount: cached.totalCount ?? cached.groups.length, sources: cached.sources ?? result.sources, complete: true, stale: true, lastSuccessAt: cached.checkedAt };
    }
  } catch {
    // An optional malformed cache must not hide the real API probe result.
  }
  return result;
}

async function getProbe(token: string, path: string, fetchImpl: typeof fetch = fetch): Promise<{ status: CloudflareProbeStatus; httpStatus: number | null; result?: unknown }> {
  try {
    const response = await fetchImpl(`${CLOUDFLARE_API_BASE}/${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    const body = await response.json().catch(() => null) as { success?: boolean; result?: unknown } | null;
    return { status: statusFor(response.status, body?.success === true), httpStatus: response.status, result: body?.result };
  } catch {
    return { status: "unavailable", httpStatus: null };
  }
}

export async function probeCloudflareServiceCatalog(
  token: string,
  accountId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult[]> {
  return Promise.all(CLOUDFLARE_PROBE_SERVICES.map(async (service) => {
    const result = await getProbe(token, `accounts/${encodeURIComponent(accountId)}/${service.path}`, fetchImpl);
    return { id: service.id, label: service.label, scope: service.scope, permission: service.permission, status: result.status, httpStatus: result.httpStatus };
  }));
}

export async function probeCloudflareZoneServiceCatalog(
  token: string,
  zoneId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult[]> {
  return Promise.all(CLOUDFLARE_ZONE_PROBE_SERVICES.map(async (service) => {
    const result = await getProbe(token, `zones/${encodeURIComponent(zoneId)}/${service.path}`, fetchImpl);
    return { id: service.id, label: service.label, scope: "Zone", permission: service.permission, status: result.status, httpStatus: result.httpStatus };
  }));
}

export async function probeCloudflareCredential(
  db: DrizzleDB,
  profileId: CloudflareCredentialProfileId,
) {
  const token = await readProfileToken(db, profileId);
  if (!token) return { profileId, checkedAt: new Date().toISOString(), error: "credential_not_configured", checks: [] as ProbeResult[] };
  const [accountRow] = await db.select({ value: systemSettings.value, isSensitive: systemSettings.isSensitive })
    .from(systemSettings).where(and(eq(systemSettings.category, "vectordb"), eq(systemSettings.key, "vectorizeAccountId"))).limit(1);
  const accountId = secretValue(accountRow ?? { value: null, isSensitive: false }) || process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || "";
  if (!accountId) return { profileId, checkedAt: new Date().toISOString(), error: "account_id_not_configured", checks: [] as ProbeResult[] };

  const accountChecks = await probeCloudflareServiceCatalog(token, accountId);

  const zones = await getProbe(token, "zones?name=smartaihub.app&per_page=50");
  const zoneRows = Array.isArray(zones.result) ? zones.result as Array<{ id?: string; name?: string }> : [];
  const zoneId = zoneRows.find((zone) => zone.name === "smartaihub.app")?.id;
  const zoneChecks: ProbeResult[] = [];
  if (zoneId) {
    zoneChecks.push({ id: "zoneInventory", label: "Zone inventory (smartaihub.app)", scope: "Zone", permission: "Zone Read", status: zones.status, httpStatus: zones.httpStatus });
    zoneChecks.push(...await probeCloudflareZoneServiceCatalog(token, zoneId));
  } else {
    zoneChecks.push({ id: "dns", label: "DNS / zone resources (smartaihub.app)", scope: "Zone", permission: "Zone Read + DNS Read", status: zones.status === "granted" ? "resource_not_found" : zones.status, httpStatus: zones.httpStatus });
  }

  return { profileId, checkedAt: new Date().toISOString(), error: null, checks: [...accountChecks, ...zoneChecks] };
}
