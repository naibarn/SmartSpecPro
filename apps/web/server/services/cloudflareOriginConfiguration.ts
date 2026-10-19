import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleDB } from "../db";
import { providerDeploymentTargets, systemSettings } from "../../drizzle/schema";
import { encrypt, decrypt } from "./crypto";
import { authorizeDeploymentTarget, resolveProviderDeploymentTarget, type DeploymentTargetIdentity } from "./providerDeploymentTargetAuthority";
import { parseCloudflarePublicOrigin, parseCloudflarePublicOrigins } from "../../../../packages/shared/src/cloudflareOrigin";

const category = "cloudflare_origin_versions";
const targetId = "smartspec-cloudflare-staging";
const credential = z.string().min(16).max(4096).regex(/^[\x21-\x7e]+$/);
export const cloudflareOriginSecretsSchema = z.object({ token: credential.min(32), clientId: credential, secret: credential }).strict()
  .refine(value => new Set([value.token, value.clientId, value.secret]).size === 3, "Origin and Access credentials must be separate");
export const cloudflareOriginSettingsSchema = z.object({
  origin: z.string().max(2048),
  allowedPublicOrigins: z.array(z.string().max(2048)).min(1).max(32),
  accessApplicationId: z.string().uuid(),
  accessTeamName: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  accessAudience: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();
type OriginSettings = z.infer<typeof cloudflareOriginSettingsSchema>;
type OriginSecrets = z.infer<typeof cloudflareOriginSecretsSchema>;
const descriptorSchema = cloudflareOriginSettingsSchema.extend({
  schemaVersion: z.literal("cloudflare.origin-configuration.v1"),
  versionId: z.string().uuid(),
  tenantId: z.string().min(1).max(36), projectId: z.string().min(1).max(100),
  environment: z.literal("staging"), provider: z.literal("cloudflare"),
  accountRef: z.string().regex(/^[a-f0-9]{32}$/), targetId: z.literal(targetId),
}).strict();
type Descriptor = z.infer<typeof descriptorSchema>;
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
function digest(descriptor: Descriptor) {
  // Every descriptor field, including the immutable secret version, is bound.
  const canonical = Object.fromEntries(Object.entries(descriptor).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
function reference(descriptor: Descriptor) { return `cf-origin:${digest(descriptor)}`; }
function matches(descriptor: Descriptor, identity: DeploymentTargetIdentity) {
  return descriptor.tenantId === identity.tenantId && descriptor.projectId === identity.projectId &&
    descriptor.environment === identity.environment && descriptor.provider === identity.provider;
}

/** Store an immutable encrypted version. This neither binds nor deploys it. */
export async function saveCloudflareOriginConfiguration(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; settings: OriginSettings; secrets: OriginSecrets; actorUserId: number;
}) {
  const settings = validateSettings(input.settings, Date.now());
  const secrets = cloudflareOriginSecretsSchema.parse(input.secrets);
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
  const rows = await db.select({ id: systemSettings.id, value: systemSettings.value, isSensitive: systemSettings.isSensitive })
    .from(systemSettings).where(and(eq(systemSettings.category, category), eq(systemSettings.key, configurationRef))).limit(2);
  if (rows.length !== 1 || !rows[0]!.isSensitive || !rows[0]!.value) denied();
  let stored: z.infer<typeof storedSchema>;
  try { stored = storedSchema.parse(JSON.parse(decrypt(rows[0]!.value!))); }
  catch { return denied(); }
  if (!matches(stored.descriptor, identity) || reference(stored.descriptor) !== configurationRef) denied();
  validateSettings(cloudflareOriginSettingsSchema.parse({ origin: stored.descriptor.origin,
    allowedPublicOrigins: stored.descriptor.allowedPublicOrigins, accessApplicationId: stored.descriptor.accessApplicationId,
    accessTeamName: stored.descriptor.accessTeamName, accessAudience: stored.descriptor.accessAudience,
    expiresAt: stored.descriptor.expiresAt }), 0);
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
  const { stored } = await readVersion(db, input.identity, input.configurationRef);
  const target = await resolveProviderDeploymentTarget(db, input.identity);
  if (stored.revokedAt || Date.parse(stored.descriptor.expiresAt) <= Date.now() ||
      digest(stored.descriptor) !== input.configurationDigest || target.status !== "CONFIGURED" ||
      target.target.runtimePolicy !== input.configurationRef || target.target.accountRef !== stored.descriptor.accountRef ||
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
