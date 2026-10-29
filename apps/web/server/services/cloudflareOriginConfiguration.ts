import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleDB } from "../db";
import { providerDeploymentTargets, systemSettings, workerJobs } from "../../drizzle/schema";
import { assertNativeProvisionReceipt, validateNativeBindingScope } from "./cloudflareNativeBindingDescriptor";
import { assertPrivateDatabaseProvisionReceipt, assertPrivateDatabaseRenewalReceipt } from "./cloudflarePrivateDatabaseBinding";
import { PRIVATE_DATABASE_RENEWAL_CONTRACT, PRIVATE_DATABASE_RENEWAL_JOB } from "./cloudflarePrivateDatabaseContract";
import { assertHttpImageProvisionReceipt, validateHttpApplicationSettings } from "./cloudflareHttpApplicationBindings";
import { encrypt, decrypt } from "./crypto";
import { authorizeDeploymentTarget, resolveProviderDeploymentTarget, type DeploymentTargetIdentity } from "./providerDeploymentTargetAuthority";
import { parseCloudflarePublicOrigin, parseCloudflarePublicOrigins } from "./cloudflareOriginContracts";

export { cloudflareOriginSecretsSchema, cloudflareOriginSettingsSchema } from "./cloudflareOriginVersionBindings";
import {
  cloudflareOriginSecretsSchema, cloudflareOriginSettingsSchema,
  cloudflareOriginDescriptorSchema as descriptorSchema,
  cloudflareOriginDescriptorDigest as digest,
  type CloudflareOriginDescriptor as Descriptor,
  assertCloudflareWorkflowConfiguration,
} from "./cloudflareOriginVersionBindings";
const category = "cloudflare_origin_versions";
const targetForEnvironment = (environment: string) => environment === "staging"
  ? "smartspec-cloudflare-staging"
  : environment === "production" ? "smartspec-cloudflare-runtime" : null;
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
  if (descriptor.applicationHttp) {
    if (!actorUserId) denied();
    validateHttpApplicationSettings(descriptor.applicationHttp, descriptor, now || Date.parse(descriptor.applicationHttp.issuedAt), descriptor.applicationHttpPhase === "namespace-only");
    for (const runtime of ["node", "python"] as const) {
      const [imageReceipt] = await db.select({ id: workerJobs.id, tenantId: workerJobs.tenantId, requestedByUserId: workerJobs.requestedByUserId,
        jobType: workerJobs.jobType, contractVersion: workerJobs.contractVersion, status: workerJobs.status,
        operatorReviewRequired: workerJobs.operatorReviewRequired, inputJson: workerJobs.inputJson, outputJson: workerJobs.outputJson })
        .from(workerJobs).where(eq(workerJobs.id, descriptor.applicationHttp[runtime].provisionJobId)).limit(1);
      assertHttpImageProvisionReceipt(descriptor.applicationHttp, runtime, imageReceipt, { ...descriptor, actorUserId });
    }
  }
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
    if (privateDatabase.leaseRenewal) {
      const [renewalReceipt] = await db.select({ id: workerJobs.id, tenantId: workerJobs.tenantId, requestedByUserId: workerJobs.requestedByUserId,
        jobType: workerJobs.jobType, contractVersion: workerJobs.contractVersion, status: workerJobs.status,
        operatorReviewRequired: workerJobs.operatorReviewRequired, inputJson: workerJobs.inputJson, outputJson: workerJobs.outputJson })
        .from(workerJobs).where(eq(workerJobs.id, privateDatabase.leaseRenewal.jobId)).limit(1);
      if (!renewalReceipt || renewalReceipt.jobType !== PRIVATE_DATABASE_RENEWAL_JOB || renewalReceipt.contractVersion !== PRIVATE_DATABASE_RENEWAL_CONTRACT) denied();
      const checkpoints = await db.select({ value: systemSettings.value, isSensitive: systemSettings.isSensitive, updatedBy: systemSettings.updatedBy })
        .from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_private_database_renewals"),
          eq(systemSettings.key, privateDatabase.leaseRenewal.jobId))).limit(2);
      if (checkpoints.length !== 1 || !checkpoints[0].isSensitive || !checkpoints[0].value || checkpoints[0].updatedBy !== actorUserId) denied();
      let renewalCheckpoint: unknown;
      try { renewalCheckpoint = JSON.parse(decrypt(checkpoints[0].value)); } catch { denied(); }
      assertPrivateDatabaseRenewalReceipt(privateDatabase, renewalReceipt, { ...descriptor, actorUserId },
        { jobId: privateDatabase.leaseRenewal.jobId, actorUserId, state: renewalCheckpoint });
    }
  }
}

/** Store an immutable encrypted version. This neither binds nor deploys it. */
export async function saveCloudflareOriginConfiguration(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; settings: OriginSettings; secrets: OriginSecrets; actorUserId: number;
}) {
  const settings = validateSettings(input.settings, Date.now());
  const secrets = cloudflareOriginSecretsSchema.parse(input.secrets);
  assertCloudflareWorkflowConfiguration(settings, secrets);
  const expectedTargetId = targetForEnvironment(input.identity.environment);
  if (input.identity.provider !== "cloudflare" || !expectedTargetId ||
      !Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0) denied();
  // Production application HTTP Containers use the same independently bounded
  // image receipts and on-demand runtime profiles as staging. Background
  // resource/job capabilities retain their separate admission contracts.
  if (input.identity.environment === "production" && (settings.nativeResources || settings.workflowExecution ||
      settings.workflowDatabase || settings.runnerReleaseCatalog || settings.jobTransport || settings.retentionSchedule || settings.mediaProbe)) denied();
  return db.transaction(async tx => {
    // Serialize against target disable/rebinding without a new lock registry.
    const rows = await tx.select().from(providerDeploymentTargets).where(and(
      eq(providerDeploymentTargets.tenantId, input.identity.tenantId),
      eq(providerDeploymentTargets.projectId, input.identity.projectId),
      eq(providerDeploymentTargets.environment, input.identity.environment), eq(providerDeploymentTargets.provider, "cloudflare"),
      eq(providerDeploymentTargets.enabled, true),
    )).for("update");
    if (rows.length !== 1 || rows[0]!.deploymentTargetId !== expectedTargetId || rows[0]!.workerRef !== expectedTargetId ||
        rows[0]!.containerApplicationRef || authorizeDeploymentTarget({ target: rows[0]!, callerTenantId: input.identity.tenantId,
          projectId: input.identity.projectId, environment: input.identity.environment, provider: "cloudflare" }) !== "AUTHORIZED") denied();
    const descriptor = descriptorSchema.parse({ ...settings, schemaVersion: "cloudflare.origin-configuration.v1",
      versionId: randomUUID(), ...input.identity, accountRef: rows[0]!.accountRef, targetId: expectedTargetId });
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

/**
 * Activate the minimum staging intake profile from the exact currently bound
 * immutable configuration. Missing internal secrets are generated on the
 * server; existing secrets are reused without rotation. Secrets are copied only
 * after the target row is locked and its binding is rechecked. This stores and
 * binds a new version; deployment still requires a separate staging grant/job.
 */
export async function activateCloudflareStagingQueueProfile(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; configurationRef: string; actorUserId: number;
  workflowRuntimeToken?: string; controlPlaneToken?: string;
}) {
  if (input.identity.provider !== "cloudflare" || input.identity.environment !== "staging" ||
      !Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0) denied();
  return db.transaction(async tx => {
    const rows = await tx.select().from(providerDeploymentTargets).where(and(
      eq(providerDeploymentTargets.tenantId, input.identity.tenantId),
      eq(providerDeploymentTargets.projectId, input.identity.projectId),
      eq(providerDeploymentTargets.environment, "staging"),
      eq(providerDeploymentTargets.provider, "cloudflare"),
      eq(providerDeploymentTargets.enabled, true),
    )).for("update");
    const target = rows[0];
    if (rows.length !== 1 || !target || target.runtimePolicy !== input.configurationRef ||
        target.deploymentTargetId !== "smartspec-cloudflare-staging" || target.workerRef !== "smartspec-cloudflare-staging" ||
        target.containerApplicationRef || authorizeDeploymentTarget({ target, callerTenantId: input.identity.tenantId,
          projectId: input.identity.projectId, environment: "staging", provider: "cloudflare" }) !== "AUTHORIZED") denied();

    const { stored } = await readVersion(tx, input.identity, input.configurationRef);
    if (stored.revokedAt || Date.parse(stored.descriptor.expiresAt) <= Date.now()) denied();
    const previous = stored.descriptor;
    if (!previous.nativeResources?.privateDatabase) throw new Error("STAGING_PRIVATE_DATABASE_BINDING_REQUIRED");
    const needsRuntimeSecrets = !stored.secrets.workflowRuntimeToken || !stored.secrets.controlPlaneToken;
    const suppliedAnyRuntimeSecret = Boolean(input.workflowRuntimeToken || input.controlPlaneToken);
    if (suppliedAnyRuntimeSecret && (!input.workflowRuntimeToken || !input.controlPlaneToken)) throw new Error("STAGING_WORKFLOW_RUNTIME_SECRETS_REQUIRED");
    if (!needsRuntimeSecrets && suppliedAnyRuntimeSecret) throw new Error("STAGING_WORKFLOW_RUNTIME_SECRETS_ALREADY_CONFIGURED");
    const secrets = needsRuntimeSecrets ? cloudflareOriginSecretsSchema.parse({ ...stored.secrets,
      workflowRuntimeToken: input.workflowRuntimeToken ?? randomBytes(32).toString("hex"),
      controlPlaneToken: input.controlPlaneToken ?? randomBytes(32).toString("hex") }) : stored.secrets;
    if (previous.workflowExecution === "emergency-intake" && previous.jobTransport === "queues") {
      return { status: "ALREADY_CONFIGURED" as const, configurationRef: input.configurationRef,
        configurationDigest: digest(previous), descriptor: previous, deploymentAuthorized: false as const };
    }

    const settings = cloudflareOriginSettingsSchema.parse({
      origin: previous.origin, allowedPublicOrigins: previous.allowedPublicOrigins,
      accessApplicationId: previous.accessApplicationId, accessTeamName: previous.accessTeamName,
      accessAudience: previous.accessAudience, expiresAt: previous.expiresAt,
      ...(previous.nativeResources ? { nativeResources: previous.nativeResources } : {}),
      workflowExecution: "emergency-intake", jobTransport: "queues",
      ...(previous.workflowDatabase ? { workflowDatabase: previous.workflowDatabase } : {}),
      ...(previous.runnerReleaseCatalog ? { runnerReleaseCatalog: previous.runnerReleaseCatalog } : {}),
      ...(previous.retentionSchedule ? { retentionSchedule: previous.retentionSchedule } : {}),
      ...(previous.applicationHttp ? { applicationHttp: previous.applicationHttp } : {}),
      ...(previous.applicationHttpPhase ? { applicationHttpPhase: previous.applicationHttpPhase } : {}),
    });
    assertCloudflareWorkflowConfiguration(settings, secrets);
    validateSettings(settings, Date.now());
    const descriptor = descriptorSchema.parse({ ...settings, schemaVersion: "cloudflare.origin-configuration.v1",
      versionId: randomUUID(), ...input.identity, accountRef: target.accountRef, targetId: "smartspec-cloudflare-staging" });
    await verifyNativeReceipt(tx, descriptor, input.actorUserId);
    const configurationRef = reference(descriptor);
    const existing = await tx.select({ id: systemSettings.id }).from(systemSettings)
      .where(and(eq(systemSettings.category, category), eq(systemSettings.key, configurationRef))).limit(1);
    if (existing.length) denied();
    await tx.insert(systemSettings).values({ category, key: configurationRef, isSensitive: true,
      value: encrypt(JSON.stringify({ descriptor, secrets, revokedAt: null })), valueJson: null,
      updatedBy: input.actorUserId, description: "Scoped immutable staging queue activation profile; deployment requires a separate grant" });
    const rebound = await tx.update(providerDeploymentTargets).set({ runtimePolicy: configurationRef, updatedBy: input.actorUserId, updatedAt: new Date() })
      .where(and(eq(providerDeploymentTargets.id, target.id), eq(providerDeploymentTargets.runtimePolicy, input.configurationRef)))
      .returning({ id: providerDeploymentTargets.id });
    if (rebound.length !== 1) denied();
    return { status: "STORED_AND_BOUND" as const, configurationRef, configurationDigest: digest(descriptor), descriptor,
      deploymentAuthorized: false as const };
  });
}

/** Bind a new immutable staging config to a verified lease-renewal receipt. */
export async function saveCloudflareStagingConfigurationAfterDatabaseRenewal(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; configurationRef: string; renewalJobId: string; actorUserId: number;
}) {
  if (input.identity.provider !== "cloudflare" || input.identity.environment !== "staging" || !Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0) denied();
  return db.transaction(async tx => {
    const targets = await tx.select().from(providerDeploymentTargets).where(and(
      eq(providerDeploymentTargets.tenantId, input.identity.tenantId), eq(providerDeploymentTargets.projectId, input.identity.projectId),
      eq(providerDeploymentTargets.environment, "staging"), eq(providerDeploymentTargets.provider, "cloudflare"), eq(providerDeploymentTargets.enabled, true),
    )).for("update");
    const target = targets[0];
    if (targets.length !== 1 || !target || target.runtimePolicy !== input.configurationRef || target.deploymentTargetId !== "smartspec-cloudflare-staging"
      || target.workerRef !== "smartspec-cloudflare-staging" || target.containerApplicationRef || authorizeDeploymentTarget({ target,
        callerTenantId: input.identity.tenantId, projectId: input.identity.projectId, environment: "staging", provider: "cloudflare" }) !== "AUTHORIZED") denied();
    const { stored } = await readVersion(tx as DrizzleDB, input.identity, input.configurationRef);
    if (stored.revokedAt || Date.parse(stored.descriptor.expiresAt) > Date.now()) denied();
    const sourceBinding = stored.descriptor.nativeResources?.privateDatabase;
    if (!sourceBinding || sourceBinding.leaseRenewal) throw new Error("PRIVATE_DATABASE_RENEWAL_SOURCE_BINDING_INVALID");
    const [job] = await tx.select({ id: workerJobs.id, tenantId: workerJobs.tenantId, requestedByUserId: workerJobs.requestedByUserId,
      jobType: workerJobs.jobType, contractVersion: workerJobs.contractVersion, status: workerJobs.status,
      operatorReviewRequired: workerJobs.operatorReviewRequired, inputJson: workerJobs.inputJson, outputJson: workerJobs.outputJson })
      .from(workerJobs).where(eq(workerJobs.id, input.renewalJobId)).limit(1);
    const output = job?.outputJson as Record<string, unknown> | null;
    if (!job || job.tenantId !== input.identity.tenantId || job.requestedByUserId !== input.actorUserId
      || job.jobType !== PRIVATE_DATABASE_RENEWAL_JOB || job.contractVersion !== PRIVATE_DATABASE_RENEWAL_CONTRACT
      || job.status !== "succeeded" || job.operatorReviewRequired || output?.status !== "verified"
      || output.configurationRef !== input.configurationRef || output.configurationDigest !== digest(stored.descriptor)
      || typeof output.leaseExpiresAt !== "string" || Date.parse(output.leaseExpiresAt) <= Date.now()) throw new Error("PRIVATE_DATABASE_RENEWAL_JOB_NOT_VERIFIED");
    const renewal = { jobId: input.renewalJobId, leaseExpiresAt: output.leaseExpiresAt as string,
      planDigest: output.planDigest as string, sourceConfigurationRef: input.configurationRef,
      sourceConfigurationDigest: digest(stored.descriptor) };
    const nativeResources = { ...stored.descriptor.nativeResources, privateDatabase: { ...sourceBinding, leaseRenewal: renewal } };
    const settings = cloudflareOriginSettingsSchema.parse({
      origin: stored.descriptor.origin, allowedPublicOrigins: stored.descriptor.allowedPublicOrigins,
      accessApplicationId: stored.descriptor.accessApplicationId, accessTeamName: stored.descriptor.accessTeamName,
      accessAudience: stored.descriptor.accessAudience, expiresAt: output.leaseExpiresAt,
      nativeResources, ...(stored.descriptor.workflowExecution ? { workflowExecution: stored.descriptor.workflowExecution } : {}),
      ...(stored.descriptor.jobTransport ? { jobTransport: stored.descriptor.jobTransport } : {}),
      ...(stored.descriptor.workflowDatabase ? { workflowDatabase: stored.descriptor.workflowDatabase } : {}),
      ...(stored.descriptor.runnerReleaseCatalog ? { runnerReleaseCatalog: stored.descriptor.runnerReleaseCatalog } : {}),
      ...(stored.descriptor.retentionSchedule ? { retentionSchedule: stored.descriptor.retentionSchedule } : {}),
      ...(stored.descriptor.mediaProbe ? { mediaProbe: stored.descriptor.mediaProbe } : {}),
      ...(stored.descriptor.applicationHttp ? { applicationHttp: stored.descriptor.applicationHttp } : {}),
      ...(stored.descriptor.applicationHttpPhase ? { applicationHttpPhase: stored.descriptor.applicationHttpPhase } : {}),
    });
    assertCloudflareWorkflowConfiguration(settings, stored.secrets);
    const descriptor = descriptorSchema.parse({ ...settings, schemaVersion: "cloudflare.origin-configuration.v1", versionId: randomUUID(),
      ...input.identity, accountRef: target.accountRef, targetId: "smartspec-cloudflare-staging" });
    await verifyNativeReceipt(tx as DrizzleDB, descriptor, input.actorUserId);
    const configurationRef = reference(descriptor);
    const existing = await tx.select({ id: systemSettings.id }).from(systemSettings)
      .where(and(eq(systemSettings.category, category), eq(systemSettings.key, configurationRef))).limit(1);
    if (existing.length) denied();
    await tx.insert(systemSettings).values({ category, key: configurationRef, isSensitive: true,
      value: encrypt(JSON.stringify({ descriptor, secrets: stored.secrets, revokedAt: null })), valueJson: null,
      updatedBy: input.actorUserId, description: "Immutable staging configuration bound to verified private database lease renewal" });
    const rebound = await tx.update(providerDeploymentTargets).set({ runtimePolicy: configurationRef, updatedBy: input.actorUserId, updatedAt: new Date() })
      .where(and(eq(providerDeploymentTargets.id, target.id), eq(providerDeploymentTargets.runtimePolicy, input.configurationRef))).returning({ id: providerDeploymentTargets.id });
    if (rebound.length !== 1) denied();
    return { status: "STORED" as const, configurationRef, configurationDigest: digest(descriptor), descriptor,
      deploymentAuthorized: false as const };
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
    ...(stored.descriptor.applicationHttp ? { applicationHttp: stored.descriptor.applicationHttp } : {}),
    ...(stored.descriptor.applicationHttpPhase ? { applicationHttpPhase: stored.descriptor.applicationHttpPhase } : {}),
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
    descriptor: stored.descriptor,
    workflowRuntimeTokenConfigured: Boolean(stored.secrets.workflowRuntimeToken),
    controlPlaneTokenConfigured: Boolean(stored.secrets.controlPlaneToken),
    providerAccessVerified: false as const, deploymentAuthorized: false as const };
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
  const expectedTargetId = targetForEnvironment(input.identity.environment);
  if (stored.revokedAt || Date.parse(stored.descriptor.expiresAt) <= Date.now() ||
      (stored.descriptor.applicationHttp && !stored.descriptor.applicationHttpPhase && Date.parse(stored.descriptor.applicationHttp.expiresAt) <= Date.now()) ||
      digest(stored.descriptor) !== input.configurationDigest || target.status !== "CONFIGURED" ||
      target.target.runtimePolicy !== input.activeConfigurationRef || target.target.accountRef !== stored.descriptor.accountRef ||
      !expectedTargetId || target.target.workerRef !== expectedTargetId || target.target.deploymentTargetId !== expectedTargetId || target.target.containerApplicationRef) denied();
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
