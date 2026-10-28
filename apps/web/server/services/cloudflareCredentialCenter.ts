import { and, eq, inArray, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { canonicalProjects, providerDeploymentCredentials, providerDeploymentTargets, systemSettings } from "../../drizzle/schema";
import type { DrizzleDB } from "../db";
import { decrypt, encrypt } from "./crypto";
import { deploymentCredentialRef, type DeploymentTargetIdentity } from "./providerDeploymentTargetAuthority";
import {
  CLOUDFLARE_PROBE_SERVICES,
  CLOUDFLARE_ZONE_PROBE_SERVICES,
  type CloudflareCredentialProfileId,
  type CloudflareProbeStatus,
  type CloudflareProductRequirement,
} from "../../shared/cloudflareCredentialCatalog";

const CREDENTIALS_KEY = "cloudflare_api_credentials_v1";
const PERMISSION_CATALOG_CACHE_KEY = "cloudflare_permission_catalog_cache_v1";
const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const PLATFORM_CREDENTIAL_BINDING_PREFIX = "cloudflare_platform_credential_binding_v1_";
const PLATFORM_DEPLOYMENT_WORKERS = {
  staging: "smartspec-cloudflare-staging",
  production: "smartspec-cloudflare-runtime",
} as const;

function platformCredentialBindingPrefixPredicate() {
  return sql`left(${systemSettings.key}, ${PLATFORM_CREDENTIAL_BINDING_PREFIX.length}) = ${PLATFORM_CREDENTIAL_BINDING_PREFIX}`;
}

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

/** Platform deployment references must point only to the encrypted Credential Center profile. */
async function readEncryptedPlatformDeploymentToken(db: DrizzleDB): Promise<string | null> {
  const rows = await db.select({ value: systemSettings.value, isSensitive: systemSettings.isSensitive })
    .from(systemSettings).where(and(eq(systemSettings.category, "infrastructure"), eq(systemSettings.key, CREDENTIALS_KEY))).limit(2);
  if (rows.length !== 1) return null;
  const [row] = rows;
  if (!row?.value || row.isSensitive !== true) return null;
  try {
    const credentials = JSON.parse(decrypt(row.value)) as StoredCredentials;
    const token = credentials?.deployment?.token;
    return typeof token === "string" && token.trim() ? token : null;
  } catch {
    return null;
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
    if (profileId === "deployment") await db.delete(systemSettings).where(and(eq(systemSettings.category, "infrastructure"),
      platformCredentialBindingPrefixPredicate()));
    return;
  }
  await upsertCredentialSetting(db, JSON.stringify(credentials), userId);
  if (profileId === "deployment") await db.delete(systemSettings).where(and(eq(systemSettings.category, "infrastructure"),
    platformCredentialBindingPrefixPredicate()));
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

type PlatformCredentialBinding = {
  version: 1;
  profileId: "deployment";
  tenantId: string;
  projectId: string;
  environment: "staging" | "production";
  provider: "cloudflare";
  targetRowId: string;
  targetId: string;
  accountId: string;
  workerRef: string;
  zoneId: string;
  boundAt: string;
};

function platformCredentialBindingKey(identity: DeploymentTargetIdentity) {
  const scope = [identity.tenantId, identity.projectId, identity.environment, identity.provider].join("\0");
  return `${PLATFORM_CREDENTIAL_BINDING_PREFIX}${createHash("sha256").update(scope).digest("hex").slice(0, 48)}`;
}

function expectedPlatformWorker(environment: string) {
  return environment === "staging" || environment === "production"
    ? PLATFORM_DEPLOYMENT_WORKERS[environment]
    : null;
}

async function readSavedCloudflareAccountId(db: DrizzleDB): Promise<string> {
  const rows = await db.select({ value: systemSettings.value, isSensitive: systemSettings.isSensitive })
    .from(systemSettings).where(and(eq(systemSettings.category, "vectordb"), eq(systemSettings.key, "vectorizeAccountId"))).limit(2);
  if (rows.length > 1) return "";
  const [row] = rows;
  return secretValue(row ?? { value: null, isSensitive: false }).trim() ||
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || process.env.CF_ACCOUNT_ID?.trim() || "";
}

async function resolvePlatformCredentialBinding(db: DrizzleDB, identity: DeploymentTargetIdentity, credentialRef: string): Promise<
  { status: DeploymentCredentialState; token?: string; savedAt?: string | null }
> {
  if (identity.provider !== "cloudflare" || credentialRef !== deploymentCredentialRef(identity))
    return { status: "PERMISSION_DENIED" };
  const expectedWorker = expectedPlatformWorker(identity.environment);
  if (!expectedWorker) return { status: "PERMISSION_DENIED" };
  try {
    const [project] = await db.select({ projectType: canonicalProjects.projectType, lifecycle: canonicalProjects.lifecycle })
      .from(canonicalProjects).where(and(eq(canonicalProjects.tenantId, identity.tenantId), eq(canonicalProjects.projectId, identity.projectId))).limit(1);
    if (!project || project.projectType !== "platform-deployment" || project.lifecycle !== "ACTIVE") return { status: "PERMISSION_DENIED" };
    const targets = await db.select({ id: providerDeploymentTargets.id, enabled: providerDeploymentTargets.enabled,
      deploymentTargetId: providerDeploymentTargets.deploymentTargetId, accountRef: providerDeploymentTargets.accountRef,
      workerRef: providerDeploymentTargets.workerRef, credentialRef: providerDeploymentTargets.credentialRef })
      .from(providerDeploymentTargets).where(and(eq(providerDeploymentTargets.tenantId, identity.tenantId),
        eq(providerDeploymentTargets.projectId, identity.projectId), eq(providerDeploymentTargets.environment, identity.environment),
        eq(providerDeploymentTargets.provider, "cloudflare"))).limit(2);
    const target = targets.length === 1 ? targets[0] : undefined;
    if (!target || !target.enabled || target.deploymentTargetId !== expectedWorker || target.workerRef !== expectedWorker ||
        !target.accountRef || !/^[a-f0-9]{32}$/i.test(target.accountRef) || target.credentialRef !== credentialRef)
      return { status: "PERMISSION_DENIED" };
    const bindingRows = await db.select({ value: systemSettings.value, updatedAt: systemSettings.updatedAt })
      .from(systemSettings).where(and(eq(systemSettings.category, "infrastructure"),
        eq(systemSettings.key, platformCredentialBindingKey(identity)))).limit(2);
    if (bindingRows.length > 1) return { status: "PERMISSION_DENIED" };
    const bindingRow = bindingRows[0];
    if (!bindingRow?.value) return { status: "NOT_CONFIGURED" };
    let binding: PlatformCredentialBinding;
    try { binding = JSON.parse(bindingRow.value) as PlatformCredentialBinding; }
    catch { return { status: "PERMISSION_DENIED" }; }
    if (binding.version !== 1 || binding.profileId !== "deployment" || binding.tenantId !== identity.tenantId ||
        binding.projectId !== identity.projectId || binding.environment !== identity.environment || binding.provider !== "cloudflare" ||
        binding.targetRowId !== target.id || binding.targetId !== target.deploymentTargetId || binding.workerRef !== target.workerRef ||
        binding.accountId !== target.accountRef || !/^[a-f0-9]{32}$/i.test(binding.zoneId)) return { status: "PERMISSION_DENIED" };
    const accountId = await readSavedCloudflareAccountId(db);
    if (!accountId || accountId !== target.accountRef) return { status: "PERMISSION_DENIED" };
    const token = await readEncryptedPlatformDeploymentToken(db);
    if (!token) return { status: "NOT_CONFIGURED" };
    return { status: "CONFIGURED", token, savedAt: bindingRow.updatedAt instanceof Date ? bindingRow.updatedAt.toISOString() : null };
  } catch {
    return { status: "UNAVAILABLE" };
  }
}

/** Metadata-only eligibility for binding the existing platform profile to one platform deployment target. */
export async function getPlatformCloudflareCredentialBindingState(db: DrizzleDB, identity: DeploymentTargetIdentity) {
  const expectedWorker = expectedPlatformWorker(identity.environment);
  if (identity.provider !== "cloudflare" || !expectedWorker) return { eligible: false, bound: false as const };
  const resolved = await resolvePlatformCredentialBinding(db, identity, deploymentCredentialRef(identity));
  if (resolved.status === "CONFIGURED") return { eligible: true, bound: true as const, source: "platform-credential-center" as const };
  if (resolved.status === "PERMISSION_DENIED") return { eligible: false, bound: false as const };
  const [project] = await db.select({ projectType: canonicalProjects.projectType, lifecycle: canonicalProjects.lifecycle })
    .from(canonicalProjects).where(and(eq(canonicalProjects.tenantId, identity.tenantId), eq(canonicalProjects.projectId, identity.projectId))).limit(1);
  const targets = await db.select({ id: providerDeploymentTargets.id, enabled: providerDeploymentTargets.enabled, deploymentTargetId: providerDeploymentTargets.deploymentTargetId,
    workerRef: providerDeploymentTargets.workerRef, accountRef: providerDeploymentTargets.accountRef, credentialRef: providerDeploymentTargets.credentialRef })
    .from(providerDeploymentTargets).where(and(eq(providerDeploymentTargets.tenantId, identity.tenantId),
      eq(providerDeploymentTargets.projectId, identity.projectId), eq(providerDeploymentTargets.environment, identity.environment),
      eq(providerDeploymentTargets.provider, identity.provider))).limit(2);
  const target = targets.length === 1 ? targets[0] : undefined;
  const accountId = await readSavedCloudflareAccountId(db).catch(() => "");
  const hasDeploymentProfile = Boolean(await readEncryptedPlatformDeploymentToken(db));
  const eligible = project?.projectType === "platform-deployment" && project.lifecycle === "ACTIVE" &&
    target?.enabled === true && target.deploymentTargetId === expectedWorker && target.workerRef === expectedWorker &&
    target.accountRef === accountId && target.credentialRef === deploymentCredentialRef(identity) && hasDeploymentProfile;
  return { eligible, bound: false as const, ...(eligible ? { source: "platform-credential-center" as const } : {}) };
}

/** Explicitly bind the existing saved profile by reference; no token is copied or returned. */
export async function bindPlatformCloudflareCredentialProfile(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; actorUserId: number; fetchImpl?: typeof fetch;
}) {
  const eligibility = await getPlatformCloudflareCredentialBindingState(db, input.identity);
  if (!eligibility.eligible) throw new Error("PLATFORM_CREDENTIAL_BINDING_SCOPE_INVALID");
  const workerRef = expectedPlatformWorker(input.identity.environment)!;
  const [target] = await db.select({ id: providerDeploymentTargets.id, deploymentTargetId: providerDeploymentTargets.deploymentTargetId,
    accountRef: providerDeploymentTargets.accountRef, workerRef: providerDeploymentTargets.workerRef, credentialRef: providerDeploymentTargets.credentialRef })
    .from(providerDeploymentTargets).where(and(eq(providerDeploymentTargets.tenantId, input.identity.tenantId),
      eq(providerDeploymentTargets.projectId, input.identity.projectId), eq(providerDeploymentTargets.environment, input.identity.environment),
      eq(providerDeploymentTargets.provider, "cloudflare"), eq(providerDeploymentTargets.enabled, true))).limit(1);
  if (!target?.accountRef || target.workerRef !== workerRef || target.deploymentTargetId !== workerRef ||
      target.credentialRef !== deploymentCredentialRef(input.identity)) throw new Error("PLATFORM_CREDENTIAL_BINDING_TARGET_MISMATCH");
  const accountId = await readSavedCloudflareAccountId(db);
  if (!accountId || accountId !== target.accountRef || !/^[a-f0-9]{32}$/i.test(accountId)) throw new Error("PLATFORM_CREDENTIAL_BINDING_ACCOUNT_MISMATCH");
  const token = await readEncryptedPlatformDeploymentToken(db);
  if (!token) throw new Error("PLATFORM_CREDENTIAL_PROFILE_MISSING");
  const verification = await verifyCloudflareToken(token, input.fetchImpl ?? fetch, accountId);
  if (verification.status !== "granted") throw new Error(`PLATFORM_CREDENTIAL_PROVIDER_AUTH_${verification.httpStatus ?? "UNAVAILABLE"}`);
  const [zoneResponse, workerResponse] = await Promise.all([
    (input.fetchImpl ?? fetch)(`${CLOUDFLARE_API_BASE}/zones?name=smartaihub.app&per_page=50`, { method: "GET",
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) }),
    (input.fetchImpl ?? fetch)(`${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(accountId)}/workers/scripts?page=1&per_page=100`, { method: "GET",
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) }),
  ]).catch(() => { throw new Error("PLATFORM_CREDENTIAL_PROVIDER_READ_UNAVAILABLE"); });
  const zoneBody = await zoneResponse.json().catch(() => null) as { success?: boolean; result?: Array<{ id?: string; name?: string; account?: { id?: string } }> } | null;
  const workerBody = await workerResponse.json().catch(() => null) as { success?: boolean; result?: Array<{ id?: string; script?: string; name?: string }> } | null;
  if (zoneResponse.status !== 200 || zoneBody?.success !== true) throw new Error(`PLATFORM_CREDENTIAL_ZONE_READ_${zoneResponse.status}`);
  const zones = Array.isArray(zoneBody.result) ? zoneBody.result.filter(zone => zone.name === "smartaihub.app") : [];
  if (zones.length !== 1 || !zones[0]?.id || !/^[a-f0-9]{32}$/i.test(zones[0].id) || zones[0].account?.id !== accountId)
    throw new Error("PLATFORM_CREDENTIAL_ZONE_IDENTITY_MISMATCH");
  if (workerResponse.status !== 200 || workerBody?.success !== true) throw new Error(`PLATFORM_CREDENTIAL_WORKER_READ_${workerResponse.status}`);
  const workers = Array.isArray(workerBody.result) ? workerBody.result : [];
  if (!workers.some(worker => worker.id === workerRef || worker.script === workerRef || worker.name === workerRef))
    throw new Error("PLATFORM_CREDENTIAL_WORKER_IDENTITY_MISMATCH");
  const identity = input.identity;
  const binding: PlatformCredentialBinding = { version: 1, profileId: "deployment", ...identity,
    targetRowId: target.id, targetId: target.deploymentTargetId, accountId, workerRef, zoneId: zones[0].id, boundAt: new Date().toISOString() };
  const key = platformCredentialBindingKey(identity);
  await db.transaction(async tx => {
    // system_settings has no unique constraint on category/key. Serialize this
    // scoped reference so parallel Owner clicks cannot create duplicate rows.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`cloudflare-platform-credential:${key}`}, 0))`);
    const currentTargets = await tx.select({ id: providerDeploymentTargets.id, enabled: providerDeploymentTargets.enabled,
      deploymentTargetId: providerDeploymentTargets.deploymentTargetId, accountRef: providerDeploymentTargets.accountRef,
      workerRef: providerDeploymentTargets.workerRef, credentialRef: providerDeploymentTargets.credentialRef })
      .from(providerDeploymentTargets).where(and(eq(providerDeploymentTargets.tenantId, identity.tenantId),
        eq(providerDeploymentTargets.projectId, identity.projectId), eq(providerDeploymentTargets.environment, identity.environment),
        eq(providerDeploymentTargets.provider, "cloudflare"))).limit(2);
    if (currentTargets.length !== 1 || !currentTargets[0]?.enabled || currentTargets[0].id !== target.id ||
        currentTargets[0].deploymentTargetId !== workerRef || currentTargets[0].workerRef !== workerRef ||
        currentTargets[0].accountRef !== accountId || currentTargets[0].credentialRef !== deploymentCredentialRef(identity))
      throw new Error("PLATFORM_CREDENTIAL_BINDING_TARGET_MISMATCH");
    const existingRows = await tx.select({ id: systemSettings.id, value: systemSettings.value }).from(systemSettings)
      .where(and(eq(systemSettings.category, "infrastructure"), eq(systemSettings.key, key))).limit(2);
    if (existingRows.length > 1) throw new Error("PLATFORM_CREDENTIAL_BINDING_CONFLICT");
    const existing = existingRows[0];
    if (existing?.value) {
      let prior: PlatformCredentialBinding;
      try { prior = JSON.parse(existing.value) as PlatformCredentialBinding; }
      catch { throw new Error("PLATFORM_CREDENTIAL_BINDING_CONFLICT"); }
      if (prior.version !== 1 || prior.profileId !== "deployment" || prior.tenantId !== identity.tenantId || prior.projectId !== identity.projectId ||
          prior.environment !== identity.environment || prior.provider !== "cloudflare" || prior.targetRowId !== target.id ||
          prior.targetId !== target.deploymentTargetId || prior.accountId !== accountId || prior.workerRef !== workerRef || prior.zoneId !== zones[0].id)
        throw new Error("PLATFORM_CREDENTIAL_BINDING_CONFLICT");
      await tx.update(systemSettings).set({ value: JSON.stringify(binding), isSensitive: false, updatedBy: input.actorUserId,
        updatedAt: new Date() }).where(eq(systemSettings.id, existing.id));
    } else {
      await tx.insert(systemSettings).values({ category: "infrastructure", key, value: JSON.stringify(binding), isSensitive: false,
        description: "Reference to the platform Cloudflare deployment credential for one verified platform target", updatedBy: input.actorUserId });
    }
  });
  return { status: "BOUND" as const, accountId, zoneId: zones[0].id, workerRef, environment: identity.environment };
}

/** Metadata-only credential state; never returns ciphertext or plaintext. */
export async function getCloudflareDeploymentCredentialState(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; credentialRef: string;
}): Promise<{ status: DeploymentCredentialState; credentialRef: string; savedAt: string | null; source?: "target" | "platform-credential-center"; canBindPlatformCredential?: boolean }> {
  if (input.identity.provider !== "cloudflare" || input.credentialRef !== deploymentCredentialRef(input.identity))
    return { status: "PERMISSION_DENIED", credentialRef: input.credentialRef, savedAt: null };
  try {
    const [row] = await db.select({ status: providerDeploymentCredentials.status, encryptedSecret: providerDeploymentCredentials.encryptedSecret,
      updatedAt: providerDeploymentCredentials.updatedAt })
      .from(providerDeploymentCredentials).where(and(
        eq(providerDeploymentCredentials.tenantId, input.identity.tenantId),
        eq(providerDeploymentCredentials.projectId, input.identity.projectId),
        eq(providerDeploymentCredentials.environment, input.identity.environment),
        eq(providerDeploymentCredentials.provider, input.identity.provider),
        eq(providerDeploymentCredentials.credentialRef, input.credentialRef),
      )).limit(1);
    if (!row) {
      const binding = await resolvePlatformCredentialBinding(db, input.identity, input.credentialRef);
      if (binding.status === "CONFIGURED") return { status: "CONFIGURED", credentialRef: input.credentialRef,
        savedAt: binding.savedAt ?? null, source: "platform-credential-center", canBindPlatformCredential: false };
      if (binding.status === "PERMISSION_DENIED") return { status: "NOT_CONFIGURED", credentialRef: input.credentialRef, savedAt: null };
      const eligibility = await getPlatformCloudflareCredentialBindingState(db, input.identity).catch(() => ({ eligible: false, bound: false as const }));
      return { status: binding.status, credentialRef: input.credentialRef, savedAt: null, canBindPlatformCredential: eligibility.eligible };
    }
    const savedAt = row.updatedAt instanceof Date && Number.isFinite(row.updatedAt.getTime()) ? row.updatedAt.toISOString() : null;
    if (row.status === "REVOKED") return { status: "REVOKED", credentialRef: input.credentialRef, savedAt, source: "target" };
    if (row.status !== "CONFIGURED" || !row.encryptedSecret) return { status: "UNAVAILABLE", credentialRef: input.credentialRef, savedAt, source: "target" };
    try { if (!decrypt(row.encryptedSecret)) return { status: "UNAVAILABLE", credentialRef: input.credentialRef, savedAt, source: "target" }; }
    catch { return { status: "UNAVAILABLE", credentialRef: input.credentialRef, savedAt, source: "target" }; }
    return { status: "CONFIGURED", credentialRef: input.credentialRef, savedAt, source: "target" };
  } catch {
    return { status: "UNAVAILABLE", credentialRef: input.credentialRef, savedAt: null };
  }
}

/** Resolves a scoped secret only for an exact target binding and keeps it inside the provider callback. */
export async function withCloudflareDeploymentCredential<T>(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; credentialRef: string;
}, operation: (token: string) => Promise<T>): Promise<{ status: DeploymentCredentialState; value?: T }> {
  if (input.identity.provider !== "cloudflare" || input.credentialRef !== deploymentCredentialRef(input.identity))
    return { status: "PERMISSION_DENIED" };
  let row: { status: string; encryptedSecret: string } | undefined;
  try {
    [row] = await db.select({ status: providerDeploymentCredentials.status, encryptedSecret: providerDeploymentCredentials.encryptedSecret })
      .from(providerDeploymentCredentials).where(and(
        eq(providerDeploymentCredentials.tenantId, input.identity.tenantId),
        eq(providerDeploymentCredentials.projectId, input.identity.projectId),
        eq(providerDeploymentCredentials.environment, input.identity.environment),
        eq(providerDeploymentCredentials.provider, input.identity.provider),
        eq(providerDeploymentCredentials.credentialRef, input.credentialRef),
      )).limit(1);
  } catch {
    return { status: "UNAVAILABLE" };
  }

  if (!row) {
    const binding = await resolvePlatformCredentialBinding(db, input.identity, input.credentialRef);
    if (binding.status !== "CONFIGURED" || !binding.token) return { status: binding.status };
    return { status: "CONFIGURED", value: await operation(binding.token) };
  }
  if (row.status === "REVOKED") return { status: "REVOKED" };
  if (row.status !== "CONFIGURED" || !row.encryptedSecret) return { status: "UNAVAILABLE" };
  let token: string;
  try { token = decrypt(row.encryptedSecret); } catch { return { status: "UNAVAILABLE" }; }
  if (!token) return { status: "UNAVAILABLE" };
  // Provider failures must reach the job classifier. Treating exceptions from
  // the callback as credential failures hides actionable HTTP/API diagnostics.
  return { status: "CONFIGURED", value: await operation(token) };
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
  // An explicitly saved target credential takes precedence and removes any
  // reference to the platform profile, avoiding duplicate active sources.
  await db.delete(systemSettings).where(and(eq(systemSettings.category, "infrastructure"),
    eq(systemSettings.key, platformCredentialBindingKey(input.identity))));
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
  if (rows.length) return { status: "REVOKED" as const };
  const bindingRows = await db.delete(systemSettings).where(and(eq(systemSettings.category, "infrastructure"),
    eq(systemSettings.key, platformCredentialBindingKey(input.identity)))).returning({ id: systemSettings.id });
  return { status: bindingRows.length ? "REVOKED" as const : "NOT_CONFIGURED" as const };
}

type ProbeResult = { id: string; label: string; scope: string; permission: string; status: CloudflareProbeStatus; httpStatus: number | null; validityIssue?: "not_yet_valid" | "expired" | "invalid_window";
  verificationScope?: "catalog"; visibleResourceCount?: number | null; resourceAccessVerified?: false;
  productRequirement?: CloudflareProductRequirement };

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
  /** A verified account-owned token has no user-owned permission catalog. */
  userCatalogApplicable?: false;
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
  user: PermissionGroupSourceResult | null,
): CloudflarePermissionCatalogResult {
  const byId = new Map([...account.groups, ...(user?.groups ?? [])].map((group) => [group.id, group]));
  const groups = [...byId.values()];
  const complete = account.status === "granted" && account.complete && (!user || (user.status === "granted" && user.complete));
  const status: CloudflareProbeStatus = complete ? "granted"
    : account.status === "granted" || user?.status === "granted" ? "partial"
      : account.status !== "granted" ? account.status : user?.status ?? account.status;
  const failedSource = account.status === "granted" && account.complete && user ? user : account;
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
    ...(!user ? { userCatalogApplicable: false as const } : {}),
    sources: [
      { scope: "account", status: account.status, httpStatus: account.httpStatus, groupCount: account.groups.length, complete: account.complete },
      ...(user ? [{ scope: "user" as const, status: user.status, httpStatus: user.httpStatus, groupCount: user.groups.length, complete: user.complete }] : []),
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
  const verification = await verifyCloudflareToken(token, fetch, accountId);
  const accountOwned = verification.status === "granted" && verification.verificationEndpoint === "account";
  const [accountCatalog, userCatalog] = await Promise.all([
    fetchCloudflarePermissionGroups(token, accountId),
    accountOwned ? Promise.resolve(null) : fetchCloudflareUserPermissionGroups(token),
  ]);
  const result = combineCloudflarePermissionCatalogs(accountCatalog, userCatalog);
  if (result.status === "granted" && result.complete) {
    const cacheValue = JSON.stringify({ accountId, checkedAt: result.checkedAt, totalCount: result.totalCount, groups: result.groups, sources: result.sources, userCatalogApplicable: result.userCatalogApplicable });
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
    const cached = cachedRow?.value ? JSON.parse(cachedRow.value) as { accountId?: string; checkedAt?: string; totalCount?: number; groups?: CloudflarePermissionGroup[]; sources?: CloudflarePermissionCatalogResult["sources"]; userCatalogApplicable?: false } : null;
    if (cached?.accountId === accountId && (cached.userCatalogApplicable !== false) === (result.userCatalogApplicable !== false) && Array.isArray(cached.groups) && cached.checkedAt) {
      return { ...result, groups: cached.groups, totalCount: cached.totalCount ?? cached.groups.length, sources: cached.sources ?? result.sources, complete: true, stale: true, lastSuccessAt: cached.checkedAt };
    }
  } catch {
    // An optional malformed cache must not hide the real API probe result.
  }
  return result;
}

async function getProbe(token: string, path: string, fetchImpl: typeof fetch = fetch): Promise<{ status: CloudflareProbeStatus; httpStatus: number | null; result?: unknown; productRequirement?: CloudflareProductRequirement }> {
  try {
    const response = await fetchImpl(`${CLOUDFLARE_API_BASE}/${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    const body = await response.json().catch(() => null) as { success?: boolean; result?: unknown; errors?: Array<{ code?: number; message?: string }> } | null;
    // Classify only the provider's explicit product denials at their exact
    // endpoints. A plan denial is neither an expired token nor proof of a
    // missing IAM scope; never return the provider's untrusted error text.
    const errors = Array.isArray(body?.errors) ? body.errors : [];
    const productRequirement: CloudflareProductRequirement | undefined =
      /^accounts\/[^/]+\/workers\/dispatch\/namespaces$/.test(path) && response.status === 403 &&
      errors.some(error => error.code === 10121)
        ? "workers_for_platforms"
        : /^accounts\/[^/]+\/containers\/applications$/.test(path) && response.status === 401 &&
          errors.some(error => error.code === 1000 && typeof error.message === "string" &&
            error.message.includes("You do not have access to Cloudflare Containers") &&
            error.message.includes("Workers Paid plan"))
          ? "workers_paid" : undefined;
    if (productRequirement) return { status: "product_unavailable", httpStatus: response.status, productRequirement };
    // A Tunnel resource can return 401/1001 for authorization while this token
    // verifies active and its list endpoint returns 200. Do not call it expired.
    const resourceDenied = path.startsWith("accounts/") && !/^accounts\/[^/]+\/tokens(?:\/|$)/.test(path) && response.status === 401 &&
      Array.isArray(body?.errors) && body.errors.some(error => error.code === 1001);
    return { status: resourceDenied ? "missing_permission" : statusFor(response.status, body?.success === true), httpStatus: response.status, result: body?.result };
  } catch {
    return { status: "unavailable", httpStatus: null };
  }
}

/** Verify the saved API token itself without returning its identifier or value. */
export async function verifyCloudflareToken(token: string, fetchImpl: typeof fetch = fetch, accountId?: string): Promise<{
  status: Exclude<CloudflareProbeStatus, "partial">;
  httpStatus: number | null;
  validityIssue?: ProbeResult["validityIssue"];
  verificationEndpoint?: "account";
}> {
  let result = await getProbe(token, "user/tokens/verify", fetchImpl);
  let endpoint: { verificationEndpoint?: "account" } = {};
  // Account-owned API tokens authenticate against their account endpoint.
  // A user-endpoint 401 is not proof that the saved account token is invalid.
  // Never fall back from an explicit token state/TTL denial or provider outage.
  if ((result.httpStatus === 401 || result.httpStatus === 403) && accountId && /^[a-f0-9]{32}$/i.test(accountId)) {
    result = await getProbe(token, `accounts/${accountId}/tokens/verify`, fetchImpl);
    endpoint = { verificationEndpoint: "account" };
  }
  if (result.status !== "granted") return { status: result.status === "partial" ? "unavailable" : result.status, httpStatus: result.httpStatus, ...endpoint };
  const metadata = result.result && typeof result.result === "object"
    ? result.result as Record<string, unknown> : {};
  const tokenStatus = metadata.status;
  if (tokenStatus === "active") {
    const parseBoundary = (value: unknown) => value == null ? null
      : typeof value === "string" && value.trim() ? Date.parse(value) : NaN;
    const start = parseBoundary(metadata.not_before);
    const end = parseBoundary(metadata.expires_on);
    if ((start !== null && !Number.isFinite(start)) || (end !== null && !Number.isFinite(end)) ||
        (start !== null && end !== null && start >= end)) {
      return { status: "unavailable", httpStatus: result.httpStatus, validityIssue: "invalid_window", ...endpoint };
    }
    const now = Date.now();
    if (end !== null && end <= now) return { status: "invalid_token", httpStatus: result.httpStatus, validityIssue: "expired", ...endpoint };
    if (start !== null && start > now) return { status: "invalid_token", httpStatus: result.httpStatus, validityIssue: "not_yet_valid", ...endpoint };
  }
  return {
    status: tokenStatus === "active" ? "granted"
      : tokenStatus === "disabled" || tokenStatus === "expired" ? "invalid_token"
        : "unavailable",
    httpStatus: result.httpStatus,
    ...endpoint,
  };
}

export async function probeCloudflareServiceCatalog(
  token: string,
  accountId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult[]> {
  return Promise.all(CLOUDFLARE_PROBE_SERVICES.map(async (service) => {
    const result = await getProbe(token, `accounts/${encodeURIComponent(accountId)}/${service.path}`, fetchImpl);
    return { id: service.id, label: service.label, scope: service.scope, permission: service.permission, status: result.status, httpStatus: result.httpStatus,
      verificationScope: "catalog", visibleResourceCount: Array.isArray(result.result) ? result.result.length : null, resourceAccessVerified: false,
      ...(result.productRequirement ? { productRequirement: result.productRequirement } : {}) };
  }));
}

export async function probeCloudflareZoneServiceCatalog(
  token: string,
  zoneId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult[]> {
  return Promise.all(CLOUDFLARE_ZONE_PROBE_SERVICES.map(async (service) => {
    const result = await getProbe(token, `zones/${encodeURIComponent(zoneId)}/${service.path}`, fetchImpl);
    return { id: service.id, label: service.label, scope: "Zone", permission: service.permission, status: result.status, httpStatus: result.httpStatus,
      verificationScope: "catalog", visibleResourceCount: Array.isArray(result.result) ? result.result.length : null, resourceAccessVerified: false,
      ...(result.productRequirement ? { productRequirement: result.productRequirement } : {}) };
  }));
}

export async function probeCloudflareCredential(
  db: DrizzleDB,
  profileId: CloudflareCredentialProfileId,
  fetchImpl: typeof fetch = fetch,
) {
  const token = await readProfileToken(db, profileId);
  if (!token) return { profileId, checkedAt: new Date().toISOString(), error: "credential_not_configured", accountId: null, zoneId: null, checks: [] as ProbeResult[] };
  const [accountRow] = await db.select({ value: systemSettings.value, isSensitive: systemSettings.isSensitive })
    .from(systemSettings).where(and(eq(systemSettings.category, "vectordb"), eq(systemSettings.key, "vectorizeAccountId"))).limit(1);
  const accountId = secretValue(accountRow ?? { value: null, isSensitive: false }) || process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || "";
  return { profileId, ...await probeCloudflareTokenAccess(token, accountId, fetchImpl) };
}

/** Probe the credential bound to one exact deployment target without exposing its token. */
export async function probeCloudflareDeploymentCredential(
  db: DrizzleDB,
  identity: DeploymentTargetIdentity,
  accountId: string,
  fetchImpl: typeof fetch = fetch,
) {
  if (identity.provider !== "cloudflare" || !/^[a-f0-9]{32}$/i.test(accountId)) {
    return { checkedAt: new Date().toISOString(), error: "target_account_id_invalid", accountId: null, zoneId: null, checks: [] as ProbeResult[] };
  }
  const scoped = await withCloudflareDeploymentCredential(db, {
    identity,
    credentialRef: deploymentCredentialRef(identity),
  }, token => probeCloudflareTokenAccess(token, accountId, fetchImpl));
  if (scoped.status !== "CONFIGURED" || !scoped.value) {
    return { checkedAt: new Date().toISOString(), error: `credential_${scoped.status.toLowerCase()}`, accountId, zoneId: null, checks: [] as ProbeResult[] };
  }
  return scoped.value;
}

async function probeCloudflareTokenAccess(token: string, accountId: string, fetchImpl: typeof fetch) {
  const checkedAt = new Date().toISOString();
  const tokenVerification = await verifyCloudflareToken(token, fetchImpl, accountId);
  const tokenCheck: ProbeResult = {
    id: "tokenVerification",
    label: "Cloudflare API token verification",
    scope: tokenVerification.verificationEndpoint === "account" ? "Account API token" : "Token",
    permission: "Valid API token",
    status: tokenVerification.status,
    httpStatus: tokenVerification.httpStatus,
    ...(tokenVerification.validityIssue ? { validityIssue: tokenVerification.validityIssue } : {}),
  };
  if (tokenVerification.status !== "granted") {
    return { checkedAt, error: null, accountId: accountId || null, zoneId: null, checks: [tokenCheck] };
  }
  if (!accountId) return { checkedAt, error: "account_id_not_configured", accountId: null, zoneId: null, checks: [tokenCheck] };

  const accountChecks = await probeCloudflareServiceCatalog(token, accountId, fetchImpl);

  const zones = await getProbe(token, "zones?name=smartaihub.app&per_page=50", fetchImpl);
  const zoneRows = Array.isArray(zones.result) ? zones.result as Array<{ id?: string; name?: string }> : [];
  const zoneId = zoneRows.find((zone) => zone.name === "smartaihub.app")?.id;
  const zoneChecks: ProbeResult[] = [];
  if (zoneId) {
    zoneChecks.push({ id: "zoneInventory", label: "Zone inventory (smartaihub.app)", scope: "Zone", permission: "Zone Read", status: zones.status, httpStatus: zones.httpStatus });
    zoneChecks.push(...await probeCloudflareZoneServiceCatalog(token, zoneId, fetchImpl));
  } else {
    zoneChecks.push({ id: "dns", label: "DNS / zone resources (smartaihub.app)", scope: "Zone", permission: "Zone Read + DNS Read", status: zones.status === "granted" ? "resource_not_found" : zones.status, httpStatus: zones.httpStatus });
  }

  return { checkedAt, error: null, accountId, zoneId: zoneId ?? null, checks: [tokenCheck, ...accountChecks, ...zoneChecks] };
}
