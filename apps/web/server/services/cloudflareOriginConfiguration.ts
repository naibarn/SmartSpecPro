import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleDB } from "../db";
import { providerDeploymentTargets, systemSettings, workerJobs } from "../../drizzle/schema";
import { assertNativeProvisionReceipt, validateNativeBindingScope } from "./cloudflareNativeBindingDescriptor";
import { assertPrivateDatabaseProvisionReceipt } from "./cloudflarePrivateDatabaseBinding";
import { encrypt, decrypt } from "./crypto";
import { authorizeDeploymentTarget, resolveProviderDeploymentTarget, type DeploymentTargetIdentity } from "./providerDeploymentTargetAuthority";
import { parseCloudflarePublicOrigin, parseCloudflarePublicOrigins } from "@smartspec/shared/src/cloudflareOrigin";

export { cloudflareOriginSecretsSchema, cloudflareOriginSettingsSchema } from "./cloudflareOriginVersionBindings";
import {
  cloudflareOriginSecretsSchema, cloudflareOriginSettingsSchema,
  cloudflareOriginDescriptorSchema as descriptorSchema,
  cloudflareOriginDescriptorDigest as digest,
  type CloudflareOriginDescriptor as Descriptor,
  assertCloudflareWorkflowConfiguration,
} from "./cloudflareOriginVersionBindings";
const category = "cloudflare_origin_versions";
const targetId = "smartspec-cloudflare-staging";
type OriginSettings = z.infer<typeof cloudflareOriginSettingsSchema>;
type OriginSecrets = z.infer<typeof cloudflareOriginSecretsSchema>;
const storedSchema = z.object({ descriptor: descriptorSchema, secrets: cloudflareOriginSecretsSchema,
  revokedAt: z.string().datetime({ offset: true }).nullable() }).strict();

function denied(): never { throw new Error("CLOUDFLARE_ORIGIN_CONFIGURATION_DENIED"); }
function validateSettings(settings: OriginSettings, now: number) {
  const parsed = cloudflareOriginSettingsSchema.parse(settings);
  const origin = parseCloudflarePublicOrigin(parsed.origin);
  const allowed = parseCloudflarePublicOrigins(JSON.stringify(parsed.allowedPublicOrigins));
  if (!origin || !allowed || allowed.includes(origin.origin) || Date.parse(parsed.expiresAt) <= now) denied();
  return { ...parsed, allowedPublicOrigins: [...allowed].sort() };
}
function reference(descriptor: Descriptor) { return `cf-origin:${digest(descriptor)}`; }
function matches(descriptor: Descriptor, identity: DeploymentTargetIdentity) {
  return descriptor.tenantId === identity.tenantId && descriptor.projectId === identity.projectId &&
    descriptor.environment === identity.environment && descriptor.provider === identity.provider;
}

async function verifyNativeReceipt(db: Pick<DrizzleDB, "select">, descriptor: Descriptor, actorUserId: number | null, now = Date.now()) {
  if (!descriptor.nativeResources) return;
  if (!actorUserId) denied();
  validateNativeBindingScope(descriptor.nativeResources, descriptor, now);
  const [receipt] = await db.select({ id: workerJobs.id, tenantId: workerJobs.tenantId, requestedByUserId: workerJobs.requestedByUserId,
    jobType: workerJobs.jobType, contractVersion: workerJobs.contractVersion, status: workerJobs.status,
    operatorReviewRequired: workerJobs.operatorReviewRequired, inputJson: workerJobs.inputJson, outputJson: workerJobs.outputJson })
    .from(workerJobs).where(eq(workerJobs.id, descriptor.nativeResources.provisionJobId)).limit(1);
  assertNativeProvisionReceipt(descriptor.nativeResources, receipt, { ...descriptor, actorUserId });
  if (descriptor.nativeResources.privateDatabase) {
    const privateDatabase = descriptor.nativeResources.privateDatabase;
    const [databaseReceipt] = await db.select({ id: workerJobs.id, tenantId: workerJobs.tenantId, requestedByUserId: workerJobs.requestedByUserId,
      jobType: workerJobs.jobType, contractVersion: workerJobs.contractVersion, status: workerJobs.status,
      operatorReviewRequired: workerJobs.operatorReviewRequired, inputJson: workerJobs.inputJson, outputJson: workerJobs.outputJson })
      .from(workerJobs).where(eq(workerJobs.id, privateDatabase.provisionJobId)).limit(1);
    let checkpoint: { jobId: string; actorUserId: number; state: unknown } | undefined;
    if ((databaseReceipt?.outputJson as Record<string, unknown> | null)?.serviceTokenId === "[REDACTED]") {
      const rows = await db.select({ value: systemSettings.value, isSensitive: systemSettings.isSensitive, updatedBy: systemSettings.updatedBy })
        .from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_private_database_runs"), eq(systemSettings.key, privateDatabase.provisionJobId))).limit(2);
      if (rows.length !== 1 || !rows[0].isSensitive || !rows[0].value || rows[0].updatedBy !== actorUserId) denied();
      try { checkpoint = { jobId: privateDatabase.provisionJobId, actorUserId, state: JSON.parse(decrypt(rows[0].value)) }; }
      catch { denied(); }
    }
    assertPrivateDatabaseProvisionReceipt(privateDatabase, databaseReceipt, { ...descriptor, actorUserId }, checkpoint);
  }
}

/** Store an immutable encrypted version. This neither binds nor deploys it. */
export async function saveCloudflareOriginConfiguration(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; settings: OriginSettings; secrets: OriginSecrets; actorUserId: number;
}) {
  const settings = validateSettings(input.settings, Date.now());
  const secrets = cloudflareOriginSecretsSchema.parse(input.secrets);
  assertCloudflareWorkflowConfiguration(settings, secrets);
  if (input.identity.provider !== "cloudflare" || input.identity.environment !== "staging" ||
      !Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0) denied();
  return db.transaction(async tx => {
    // Serialize against target disable/rebinding without a new lock registry.
    const rows = await tx.select().from(providerDeploymentTargets).where(and(
      eq(providerDeploymentTargets.tenantId, input.identity.tenantId),
      eq(providerDeploymentTargets.projectId, input.identity.projectId),
      eq(providerDeploymentTargets.environment, "staging"), eq(providerDeploymentTargets.provider, "cloudflare"),
      eq(providerDeploymentTargets.enabled, true),
    )).for("update");
    if (rows.length !== 1 || rows[0]!.deploymentTargetId !== targetId || rows[0]!.workerRef !== targetId ||
        rows[0]!.containerApplicationRef || authorizeDeploymentTarget({ target: rows[0]!, callerTenantId: input.identity.tenantId,
          projectId: input.identity.projectId, environment: "staging", provider: "cloudflare" }) !== "AUTHORIZED") denied();
    const descriptor = descriptorSchema.parse({ ...settings, schemaVersion: "cloudflare.origin-configuration.v1",
      versionId: randomUUID(), ...input.identity, accountRef: rows[0]!.accountRef, targetId });
    await verifyNativeReceipt(tx, descriptor, input.actorUserId);
    const configurationRef = reference(descriptor);
    const existing = await tx.select({ id: systemSettings.id }).from(systemSettings)
      .where(and(eq(systemSettings.category, category), eq(systemSettings.key, configurationRef))).limit(1);
    if (existing.length) denied();
    await tx.insert(systemSettings).values({ category, key: configurationRef, isSensitive: true,
      value: encrypt(JSON.stringify({ descriptor, secrets, revokedAt: null })), valueJson: null,
      updatedBy: input.actorUserId, description: "Scoped immutable origin version; stored only, not deployment authority" });
    return { status: "STORED" as const, configurationRef, configurationDigest: digest(descriptor), descriptor,
      providerAccessVerified: false as const, deploymentAuthorized: false as const };
  });
}

async function readVersion(db: DrizzleDB, identity: DeploymentTargetIdentity, configurationRef: string) {
  if (!/^cf-origin:[a-f0-9]{64}$/.test(configurationRef)) denied();
  const rows = await db.select({ id: systemSettings.id, value: systemSettings.value, isSensitive: systemSettings.isSensitive, updatedBy: systemSettings.updatedBy })
    .from(systemSettings).where(and(eq(systemSettings.category, category), eq(systemSettings.key, configurationRef))).limit(2);
  if (rows.length !== 1 || !rows[0]!.isSensitive || !rows[0]!.value) denied();
  let stored: z.infer<typeof storedSchema>;
  try { stored = storedSchema.parse(JSON.parse(decrypt(rows[0]!.value!))); }
  catch { return denied(); }
  if (!matches(stored.descriptor, identity) || reference(stored.descriptor) !== configurationRef) denied();
  assertCloudflareWorkflowConfiguration(stored.descriptor, stored.secrets);
  validateSettings(cloudflareOriginSettingsSchema.parse({ origin: stored.descriptor.origin,
    allowedPublicOrigins: stored.descriptor.allowedPublicOrigins, accessApplicationId: stored.descriptor.accessApplicationId,
    accessTeamName: stored.descriptor.accessTeamName, accessAudience: stored.descriptor.accessAudience,
    expiresAt: stored.descriptor.expiresAt, ...(stored.descriptor.nativeResources ? { nativeResources: stored.descriptor.nativeResources } : {}) }), 0);
  await verifyNativeReceipt(db, stored.descriptor, rows[0]!.updatedBy, 0);
  return { rowId: rows[0]!.id, stored };
}

/** Metadata only; never returns plaintext/ciphertext or treats storage as proof. */
export async function getCloudflareOriginConfiguration(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; configurationRef: string;
}) {
  const { stored } = await readVersion(db, input.identity, input.configurationRef);
  const status = stored.revokedAt ? "REVOKED" : Date.parse(stored.descriptor.expiresAt) <= Date.now() ? "EXPIRED" : "STORED";
  return { status, configurationRef: input.configurationRef, configurationDigest: digest(stored.descriptor),
    descriptor: stored.descriptor, providerAccessVerified: false as const, deploymentAuthorized: false as const };
}

/** Exact target + expected immutable digest are mandatory for server execution. */
export async function withCloudflareOriginConfiguration<T>(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; configurationRef: string; configurationDigest: string;
}, operation: (value: { descriptor: Descriptor; secrets: OriginSecrets }) => Promise<T>): Promise<T> {
  return withCloudflareOriginConfigurationForTransition(db, { ...input, activeConfigurationRef: input.configurationRef }, operation);
}

/** Server-only transition callback: an explicit grant must bind both references. */
export async function withCloudflareOriginConfigurationForTransition<T>(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; configurationRef: string; configurationDigest: string; activeConfigurationRef: string;
}, operation: (value: { descriptor: Descriptor; secrets: OriginSecrets }) => Promise<T>): Promise<T> {
  const { stored } = await readVersion(db, input.identity, input.configurationRef);
  const target = await resolveProviderDeploymentTarget(db, input.identity);
  if (stored.revokedAt || Date.parse(stored.descriptor.expiresAt) <= Date.now() ||
      digest(stored.descriptor) !== input.configurationDigest || target.status !== "CONFIGURED" ||
      target.target.runtimePolicy !== input.activeConfigurationRef || target.target.accountRef !== stored.descriptor.accountRef ||
      target.target.workerRef !== targetId || target.target.deploymentTargetId !== targetId || target.target.containerApplicationRef) denied();
  return operation({ descriptor: stored.descriptor, secrets: stored.secrets });
}

/** Revoke a saved version without deleting its audit/recovery metadata. */
export async function revokeCloudflareOriginConfiguration(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; configurationRef: string; actorUserId: number;
}) {
  if (!Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0) denied();
  const { rowId, stored } = await readVersion(db, input.identity, input.configurationRef);
  if (!stored.revokedAt) {
    await db.update(systemSettings).set({ value: encrypt(JSON.stringify({ ...stored, revokedAt: new Date().toISOString() })),
      updatedBy: input.actorUserId, updatedAt: new Date() }).where(eq(systemSettings.id, rowId));
  }
  return { status: "REVOKED" as const, configurationRef: input.configurationRef };
}
