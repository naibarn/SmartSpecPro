import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleDB } from "../db";
import { providerDeploymentTargets, systemSettings, workerJobs } from "../../drizzle/schema";
import { assertNativeProvisionReceipt, validateNativeBindingScope } from "./cloudflareNativeBindingDescriptor";
import { assertPrivateDatabaseProvisionReceipt, assertPrivateDatabaseRenewalReceipt, privateDatabaseEffectiveLeaseExpiresAt } from "./cloudflarePrivateDatabaseBinding";
import { PRIVATE_DATABASE_RENEWAL_CONTRACT, PRIVATE_DATABASE_RENEWAL_JOB } from "./cloudflarePrivateDatabaseContract";
import { assertHttpImageProvisionReceipt, validateHttpApplicationSettings, httpApplicationNamespace,
  httpApplicationVersionBindings, type HttpApplicationSettings } from "./cloudflareHttpApplicationBindings";
import { stagingApplicationHttpProfileExpiresAt } from "./cloudflareStagingDispatchReadiness";
import { resolveVerifiedHttpImagePair, HttpPublishedPairRequired } from "./cloudflareHttpPublishedPair";
import { HTTP_IMAGE_PROVISION_CONTRACT, HTTP_IMAGE_PROVISION_JOB } from "./cloudflareHttpImageProvisionContract";
import { getStagingApplicationPreparation } from "./cloudflareStagingApplicationPreparation";
import { resolveStagingApplicationSecrets } from "./cloudflareStagingApplicationSecrets";
import { applicationDatabaseRoleName, prepareApplicationDatabaseRole } from "./cloudflareApplicationDatabaseRole";
import { planHttpApplicationRelations } from "./cloudflareHttpRuntimePlan";
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
export function canRotateExpiredStagingApplicationRole(
  profile: Pick<HttpApplicationSettings, "expiresAt"> | undefined, now = Date.now(),
): boolean {
  const expiresAt = profile ? Date.parse(profile.expiresAt) : Number.NaN;
  return Number.isFinite(expiresAt) && expiresAt <= now;
}
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

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

/**
 * Staging deployments at or within seven days of expiry remain usable as
 * rollback baselines only across the exact private-database lease renewal that
 * produced the currently bound immutable config. All other fields stay equal.
 */
export function isCompatibleCloudflareOriginRenewalRevision(input: {
  previousRef: string; previous: Descriptor; previousSecrets: OriginSecrets; previousRevokedAt: string | null;
  activeRef: string; active: Descriptor; activeSecrets: OriginSecrets; activeRevokedAt: string | null;
  now?: number;
}): boolean {
  const now = input.now ?? Date.now();
  const previousDatabase = input.previous.nativeResources?.privateDatabase;
  const activeDatabase = input.active.nativeResources?.privateDatabase;
  const renewal = activeDatabase?.leaseRenewal;
  if (input.previous.environment !== "staging" || input.active.environment !== "staging" ||
      input.previousRevokedAt || input.activeRevokedAt ||
      Date.parse(input.active.expiresAt) <= now || input.previousRef !== reference(input.previous) ||
      input.activeRef !== reference(input.active) || !previousDatabase || !activeDatabase ||
      previousDatabase.leaseRenewal || !renewal || renewal.sourceConfigurationRef !== input.previousRef ||
      renewal.sourceConfigurationDigest !== digest(input.previous) || renewal.leaseExpiresAt !== input.active.expiresAt ||
      !/^[a-f0-9]{64}$/.test(renewal.planDigest) || !z.string().uuid().safeParse(renewal.jobId).success ||
      (input.previous.applicationHttp && !input.previous.applicationHttpPhase && Date.parse(input.previous.applicationHttp.expiresAt) <= now) ||
      (input.active.applicationHttp && !input.active.applicationHttpPhase && Date.parse(input.active.applicationHttp.expiresAt) <= now)) return false;
  const previousValidityExpiresAt = Math.min(Date.parse(input.previous.expiresAt), Date.parse(previousDatabase.plan.configurationExpiresAt));
  if (previousValidityExpiresAt > now + 7 * 86_400_000) return false;

  const comparable = (descriptor: Descriptor) => {
    const value = structuredClone(descriptor) as Record<string, any>;
    delete value.versionId;
    delete value.expiresAt;
    if (value.nativeResources?.privateDatabase) delete value.nativeResources.privateDatabase.leaseRenewal;
    return value;
  };
  return canonicalJson(comparable(input.previous)) === canonicalJson(comparable(input.active)) &&
    canonicalJson(input.previousSecrets) === canonicalJson(input.activeSecrets);
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
  profile?: "namespace-only" | "full-application-http";
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
    if (input.profile === "full-application-http") {
      const published = await resolveVerifiedHttpImagePair(tx as unknown as DrizzleDB, { ...input.identity, actorUserId: input.actorUserId });
      if (!published.pair) {
        if (published.diagnostics.length) throw new Error(published.diagnostics[0]!.code);
        throw new HttpPublishedPairRequired(published.diagnostics);
      }
      if (published.pair.accountRef !== target.accountRef) throw new Error("STAGING_HTTP_IMAGE_ACCOUNT_MISMATCH");
      const imageJob = async (runtime: "node-http" | "python-http") => {
        const receipt = published.pair!.jobs.find(item => item.runtime === runtime);
        if (!receipt) throw new Error("STAGING_HTTP_IMAGE_RECEIPTS_REQUIRED");
        const [job] = await tx.select().from(workerJobs).where(eq(workerJobs.id, receipt.jobId)).limit(1);
        if (!job || job.status !== "succeeded" || job.operatorReviewRequired || job.tenantId !== input.identity.tenantId ||
            job.requestedByUserId !== input.actorUserId || job.jobType !== HTTP_IMAGE_PROVISION_JOB || job.contractVersion !== HTTP_IMAGE_PROVISION_CONTRACT ||
            typeof job.inputJson?.planDigest !== "string" || typeof job.outputJson?.image !== "string") {
          throw new Error("STAGING_HTTP_IMAGE_RECEIPT_INVALID");
        }
        return { provisionJobId: job.id, planDigest: job.inputJson.planDigest, image: job.outputJson.image };
      };
      const issuedAt = new Date();
      const expiresAt = new Date(stagingApplicationHttpProfileExpiresAt(previous.expiresAt, issuedAt));
      const applicationHttp: HttpApplicationSettings = {
        mode: "private-canary", namespace: httpApplicationNamespace(input.identity.tenantId, input.identity.projectId, "staging"),
        sourceSha: published.pair.sourceSha, traffic: "staging-full-http-v1",
        node: await imageJob("node-http"), python: await imageJob("python-http"),
        issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString(), maxStarts: 2, maxComputeSeconds: 1200,
        hardLifetimeSeconds: 600, idleTimeoutSeconds: 10, instance: "basic", startupDiagnostics: "container-logs",
      };
      validateHttpApplicationSettings(applicationHttp, { ...input.identity, accountRef: target.accountRef }, issuedAt.getTime());
      // Prepare the existing least-privilege application identity inside this
      // authenticated Owner operation. The read-only staging probe role is not
      // suitable for application DML. Role DDL and the encrypted config commit
      // share the outer transaction, so a failed profile never leaves a new login.
      const privateDatabase = previous.nativeResources?.privateDatabase;
      const privateDatabasePlan = privateDatabase?.plan;
      if (!privateDatabase || !privateDatabasePlan || privateDatabasePlan.databaseName !== "smartspec")
        throw new Error("STAGING_APPLICATION_DATABASE_IDENTITY_REQUIRED");
      const databaseName = privateDatabasePlan.databaseName;
      // A finalized renewal is an immutable receipt layered over the original
      // provisioning plan. Use its verified effective lease, not the source
      // plan's historical expiry, when bounding the application role.
      const databaseLeaseExpiresAt = privateDatabaseEffectiveLeaseExpiresAt(privateDatabase);
      const roleExpiresAt = Math.min(Date.now() + 30 * 86_400_000, Date.parse(previous.expiresAt),
        Date.parse(databaseLeaseExpiresAt));
      if (roleExpiresAt <= Date.now() + 7 * 86_400_000) throw new Error("STAGING_APPLICATION_DATABASE_ROLE_VALIDITY_TOO_SHORT");
      const relations = await planHttpApplicationRelations(tx as unknown as DrizzleDB);
      const rolePlan = { tenantId: input.identity.tenantId, projectId: input.identity.projectId, databaseName,
        tables: relations.tables, sequences: relations.sequences, expiresAt: new Date(roleExpiresAt).toISOString(), connectionLimit: 10 as const };
      const roleName = applicationDatabaseRoleName(input.identity);
      const existingRole = await tx.execute(sql`SELECT 1 FROM pg_roles WHERE rolname=${roleName}`);
      // The Container deadline is bounded by profile.expiresAt. Once that
      // deadline passes, allow the exact scoped role to rotate immediately;
      // the role helper still rejects live DB sessions and grants outside plan.
      const priorHttp = previous.applicationHttp;
      const allowExpiredStagingProfileRotation = canRotateExpiredStagingApplicationRole(priorHttp);
      const roleSecretHolder: { value?: { role: string; password: string; planDigest: string } } = {};
      await prepareApplicationDatabaseRole(tx as unknown as DrizzleDB, { plan: rolePlan, purpose: "staging-application",
        pythonAuthReadOnly: true, ...(existingRole.length ? { reuse: rolePlan } : {}),
        ...(allowExpiredStagingProfileRotation ? { allowExpiredStagingProfileRotation: true } : {}),
        assertAuthorized: async () => {
          const current = await tx.select({ id: providerDeploymentTargets.id }).from(providerDeploymentTargets).where(and(
            eq(providerDeploymentTargets.id, target.id), eq(providerDeploymentTargets.runtimePolicy, input.configurationRef),
            eq(providerDeploymentTargets.enabled, true))).limit(1);
          if (current.length !== 1) denied();
        },
        saveSecret: async (_roleTx, secret) => { roleSecretHolder.value = secret; },
      });
      const applicationRole = roleSecretHolder.value;
      if (!applicationRole) throw new Error("STAGING_APPLICATION_DATABASE_ROLE_SECRET_REQUIRED");
      // Resolve the allowlisted app environment and verified app-role secret
      // server-side. Plaintext is persisted only inside the encrypted config.
      const resolvedRuntime = await resolveStagingApplicationSecrets({ db: tx as unknown as DrizzleDB, identity: input.identity,
        actorUserId: input.actorUserId, applicationHttp, configurationRef: input.configurationRef,
        applicationDatabaseRole: applicationRole, applicationDatabaseRolePlan: rolePlan });
      const applicationSecrets = resolvedRuntime.secrets;
      const { workflowRuntimeToken: _workflowRuntimeToken, controlPlaneToken: _controlPlaneToken, ...applicationBaseSecrets } = stored.secrets;
      const secrets = cloudflareOriginSecretsSchema.parse({ ...applicationBaseSecrets, applicationHttp: applicationSecrets,
        applicationCanaryToken: stored.secrets.applicationCanaryToken ?? randomBytes(32).toString("hex") });
      const settings = cloudflareOriginSettingsSchema.parse({
        origin: previous.origin, allowedPublicOrigins: previous.allowedPublicOrigins,
        accessApplicationId: previous.accessApplicationId, accessTeamName: previous.accessTeamName,
        accessAudience: previous.accessAudience, expiresAt: previous.expiresAt,
        ...(previous.nativeResources ? { nativeResources: previous.nativeResources } : {}),
        applicationHttp,
      });
      assertCloudflareWorkflowConfiguration(settings, secrets);
      validateSettings(settings, Date.now());
      const descriptor = descriptorSchema.parse({ ...settings, schemaVersion: "cloudflare.origin-configuration.v1",
        versionId: randomUUID(), ...input.identity, accountRef: target.accountRef, targetId: "smartspec-cloudflare-staging" });
      const configurationRef = reference(descriptor);
      const existing = await tx.select({ id: systemSettings.id }).from(systemSettings)
        .where(and(eq(systemSettings.category, category), eq(systemSettings.key, configurationRef))).limit(1);
      if (existing.length) denied();
      // Exercise the exact binding/profile validator now, while secrets remain
      // server-side, so an incomplete Full HTTP config never becomes deployable.
      httpApplicationVersionBindings(applicationHttp, { ...input.identity, accountRef: target.accountRef, configurationRef }, applicationSecrets);
      await tx.insert(systemSettings).values({ category, key: configurationRef, isSensitive: true,
        value: encrypt(JSON.stringify({ descriptor, secrets, revokedAt: null })), valueJson: null,
        updatedBy: input.actorUserId, description: "Immutable Staging Full Application HTTP candidate; existing image receipts and encrypted app secrets" });
      const rebound = await tx.update(providerDeploymentTargets).set({ runtimePolicy: configurationRef, updatedBy: input.actorUserId, updatedAt: new Date() })
        .where(and(eq(providerDeploymentTargets.id, target.id), eq(providerDeploymentTargets.runtimePolicy, input.configurationRef)))
        .returning({ id: providerDeploymentTargets.id });
      if (rebound.length !== 1) denied();
      return { status: "STORED_AND_BOUND" as const, profile: "FULL_APPLICATION_HTTP" as const, configurationRef,
        configurationDigest: digest(descriptor), descriptor, imagePair: { submissionId: published.pair.submissionId,
        sourceSha: published.pair.sourceSha, verified: true as const }, secretResolution: resolvedRuntime.safeReceipt,
        deploymentAuthorized: false as const };
    }
    const needsRuntimeSecrets = !stored.secrets.workflowRuntimeToken || !stored.secrets.controlPlaneToken;
    const suppliedAnyRuntimeSecret = Boolean(input.workflowRuntimeToken || input.controlPlaneToken);
    if (suppliedAnyRuntimeSecret && (!input.workflowRuntimeToken || !input.controlPlaneToken)) throw new Error("STAGING_WORKFLOW_RUNTIME_SECRETS_REQUIRED");
    if (!needsRuntimeSecrets && suppliedAnyRuntimeSecret) throw new Error("STAGING_WORKFLOW_RUNTIME_SECRETS_ALREADY_CONFIGURED");
    const baseSecrets = needsRuntimeSecrets ? cloudflareOriginSecretsSchema.parse({ ...stored.secrets,
      workflowRuntimeToken: input.workflowRuntimeToken ?? randomBytes(32).toString("hex"),
      controlPlaneToken: input.controlPlaneToken ?? randomBytes(32).toString("hex") }) : stored.secrets;
    const secrets = baseSecrets;
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
    return { status: "STORED_AND_BOUND" as const, profile: "NAMESPACE_ONLY" as const, configurationRef, configurationDigest: digest(descriptor), descriptor,
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
    if (stored.revokedAt) denied();
    const sourceBinding = stored.descriptor.nativeResources?.privateDatabase;
    if (!sourceBinding || sourceBinding.leaseRenewal) throw new Error("PRIVATE_DATABASE_RENEWAL_SOURCE_BINDING_INVALID");
    const sourceValidityExpiresAt = Math.min(Date.parse(stored.descriptor.expiresAt), Date.parse(sourceBinding.plan.configurationExpiresAt));
    if (sourceValidityExpiresAt > Date.now() + 7 * 86_400_000) throw new Error("STAGING_ORIGIN_CONFIGURATION_NOT_EXPIRED");
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
    applicationPreparation: input.identity.environment === "staging"
      ? getStagingApplicationPreparation(stored.descriptor, stored.secrets, input.configurationRef) : null,
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

/**
 * Read the exact prior configuration used by an already active Staging
 * deployment. An expired version is accepted only as immutable rollback
 * metadata when the currently bound version is its verified lease renewal.
 * This never authorizes deploying or reactivating the expired configuration.
 */
export async function withCloudflareOriginRollbackConfiguration<T>(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; rollbackConfigurationRef: string; rollbackConfigurationDigest: string;
  activeConfigurationRef: string; activeConfigurationDigest: string;
}, operation: (value: { descriptor: Descriptor; secrets: OriginSecrets }) => Promise<T>): Promise<T> {
  const [{ stored: rollback }, { stored: active }] = await Promise.all([
    readVersion(db, input.identity, input.rollbackConfigurationRef),
    readVersion(db, input.identity, input.activeConfigurationRef),
  ]);
  const target = await resolveProviderDeploymentTarget(db, input.identity);
  const expectedTargetId = targetForEnvironment(input.identity.environment);
  const now = Date.now();
  const rollbackUsable = !rollback.revokedAt && Date.parse(rollback.descriptor.expiresAt) > now &&
    (!rollback.descriptor.applicationHttp || rollback.descriptor.applicationHttpPhase || Date.parse(rollback.descriptor.applicationHttp.expiresAt) > now);
  const rollbackCompatible = isCompatibleCloudflareOriginRenewalRevision({ previousRef: input.rollbackConfigurationRef,
    previous: rollback.descriptor, previousSecrets: rollback.secrets, previousRevokedAt: rollback.revokedAt,
    activeRef: input.activeConfigurationRef, active: active.descriptor, activeSecrets: active.secrets,
    activeRevokedAt: active.revokedAt, now });
  if (input.rollbackConfigurationRef !== `cf-origin:${input.rollbackConfigurationDigest}` ||
      digest(rollback.descriptor) !== input.rollbackConfigurationDigest ||
      input.activeConfigurationRef !== `cf-origin:${input.activeConfigurationDigest}` ||
      digest(active.descriptor) !== input.activeConfigurationDigest || active.revokedAt ||
      Date.parse(active.descriptor.expiresAt) <= now || (!rollbackUsable && !rollbackCompatible) ||
      target.status !== "CONFIGURED" || target.target.runtimePolicy !== input.activeConfigurationRef ||
      target.target.accountRef !== active.descriptor.accountRef || rollback.descriptor.accountRef !== active.descriptor.accountRef ||
      !expectedTargetId || target.target.workerRef !== expectedTargetId || target.target.deploymentTargetId !== expectedTargetId ||
      target.target.containerApplicationRef) denied();
  return operation({ descriptor: rollback.descriptor, secrets: rollback.secrets });
}

/** Metadata-only predicate used by the Staging preflight projection. */
export async function isCloudflareOriginRollbackConfigurationUsable(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; rollbackConfigurationRef: string; rollbackConfigurationDigest: string;
  activeConfigurationRef: string; activeConfigurationDigest: string;
}): Promise<boolean> {
  try {
    return await withCloudflareOriginRollbackConfiguration(db, input, async () => true);
  } catch { return false; }
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
