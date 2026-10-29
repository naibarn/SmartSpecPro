import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, type DrizzleDB } from "../db";
import { systemSettings, workerJobs } from "../../drizzle/schema";
import { decrypt } from "./crypto";
import { getCloudflareOriginConfiguration } from "./cloudflareOriginConfiguration";
import { resolveProviderDeploymentTarget, type DeploymentTargetIdentity } from "./providerDeploymentTargetAuthority";
import { createCloudflareNativeProvisionRuntime } from "./cloudflareNativeProvisionExecutor";
import { assertPrivateDatabaseProvisionReceipt, verifyPrivateDatabaseProviderResources, type PrivateDatabaseBinding } from "./cloudflarePrivateDatabaseBinding";
import { privateDatabaseCheckpointSchema } from "./cloudflarePrivateDatabaseTransport";
import { privateDatabaseRenewalPlanDigest, privateDatabaseRenewalPlanSchema,
  privateDatabaseRole,
  PRIVATE_DATABASE_RENEWAL_CONTRACT, PRIVATE_DATABASE_RENEWAL_JOB, type PrivateDatabaseRenewalPlan } from "./cloudflarePrivateDatabaseContract";

export type PrivateDatabaseRenewalIdentity = DeploymentTargetIdentity & { provider: "cloudflare"; environment: "staging" };
export type PrivateDatabaseRenewalPreflight = {
  ready: boolean; reason: string | null; failureStage: string | null; checkedAt: string; configurationRef: string; configurationDigest: string;
  accountRef: string;
  plan: PrivateDatabaseRenewalPlan | null; planDigest: string | null; leaseExpiresAt: string | null;
  existingJob: { jobId: string; status: string; errorCode: string | null; heartbeatAt: string | null } | null;
};

function result(input: Omit<PrivateDatabaseRenewalPreflight, "checkedAt" | "failureStage"> & { failureStage?: string | null }): PrivateDatabaseRenewalPreflight {
  return { ...input, failureStage: input.failureStage ?? null, checkedAt: new Date().toISOString() };
}
function reason(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (/^[A-Z0-9_]+$/.test(code)) return code;
  const causeCode = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof causeCode === "string" && /^(ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|CERT_HAS_EXPIRED|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE)$/.test(causeCode)
    ? `PRIVATE_DATABASE_RENEWAL_IO_${causeCode}` : "PRIVATE_DATABASE_RENEWAL_PREFLIGHT_FAILED";
}
async function atStage<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    throw Object.assign(new Error(reason(error)), { preflightStage: stage });
  }
}

async function verifyExpiredRole(db: DrizzleDB, plan: PrivateDatabaseRenewalPlan["sourcePlan"], now = Date.now()) {
  const role = privateDatabaseRole(plan.namespace);
  const current: any = await db.execute(sql`SELECT current_database() AS name`);
  if (current[0]?.name !== plan.databaseName) throw new Error("PRIVATE_DATABASE_RENEWAL_DATABASE_SCOPE_DENIED");
  const roles: any = await db.execute(sql`SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolcanlogin, rolconnlimit, rolconfig, rolvaliduntil FROM pg_roles WHERE rolname=${role}`);
  const r = roles[0];
  if (!r || r.rolsuper || r.rolcreaterole || r.rolcreatedb || r.rolreplication || r.rolbypassrls || !r.rolcanlogin || r.rolconnlimit !== 5
    || !r.rolconfig?.includes("default_transaction_read_only=on") || !r.rolvaliduntil
    || Date.parse(r.rolvaliduntil) !== Date.parse(plan.configurationExpiresAt) || Date.parse(r.rolvaliduntil) > now)
    throw new Error("PRIVATE_DATABASE_RENEWAL_ROLE_DRIFT");
}

/** Read-only plan construction. It proves exact existing provider IDs and the role state before an Owner action is shown. */
export async function getCloudflarePrivateDatabaseRenewalPreflight(db: DrizzleDB, input: {
  identity: PrivateDatabaseRenewalIdentity; configurationRef: string; actorUserId: number;
}, options: { now?: number; runtime?: ReturnType<typeof createCloudflareNativeProvisionRuntime> } = {}): Promise<PrivateDatabaseRenewalPreflight> {
  const now = options.now ?? Date.now(), config = await atStage("CONFIGURATION_READBACK", () =>
    getCloudflareOriginConfiguration(db, { identity: input.identity, configurationRef: input.configurationRef }));
  const base = { configurationRef: config.configurationRef, configurationDigest: config.configurationDigest, accountRef: config.descriptor.accountRef };
  if (config.status === "REVOKED") return result({ ...base, ready: false, reason: "STAGING_ORIGIN_CONFIGURATION_REVOKED", plan: null, planDigest: null, leaseExpiresAt: null, existingJob: null });
  if (config.status !== "EXPIRED") return result({ ...base, ready: false, reason: "STAGING_ORIGIN_CONFIGURATION_NOT_EXPIRED", plan: null, planDigest: null, leaseExpiresAt: null, existingJob: null });
  const binding = config.descriptor.nativeResources?.privateDatabase as PrivateDatabaseBinding | undefined;
  if (!binding || binding.leaseRenewal) return result({ ...base, ready: false, reason: binding?.leaseRenewal ? "PRIVATE_DATABASE_RENEWAL_ALREADY_RECORDED" : "STAGING_PRIVATE_DATABASE_BINDING_REQUIRED", plan: null, planDigest: null, leaseExpiresAt: null, existingJob: null });
  const target = await atStage("STAGING_TARGET_READBACK", () => resolveProviderDeploymentTarget(db, input.identity));
  if (target.status !== "CONFIGURED" || target.target.deploymentTargetId !== "smartspec-cloudflare-staging"
    || target.target.workerRef !== "smartspec-cloudflare-staging" || target.target.containerApplicationRef
    || target.target.accountRef !== config.descriptor.accountRef) return result({ ...base, ready: false, reason: "STAGING_TARGET_AUTHORITY_CONFLICT", plan: null, planDigest: null, leaseExpiresAt: null, existingJob: null });

  const leaseExpiresAt = new Date(Math.floor((now + 30 * 24 * 60 * 60_000) / 60_000) * 60_000).toISOString();
  const authorizationExpiresAt = new Date(now + 10 * 60_000).toISOString();
  const plan = await atStage("PLAN_BINDING", async () => privateDatabaseRenewalPlanSchema.parse({ configurationRef: config.configurationRef, configurationDigest: config.configurationDigest,
    sourceProvisionJobId: binding.provisionJobId, sourcePlan: binding.plan, sourcePlanDigest: binding.planDigest,
    resources: { hyperdriveId: binding.hyperdriveId, caId: binding.caId, accessApplicationId: binding.accessApplicationId,
      accessPolicyId: binding.accessPolicyId, serviceTokenId: binding.serviceTokenId, dnsRecordId: binding.dnsRecordId }, leaseExpiresAt, authorizationExpiresAt }));
  const planDigest = privateDatabaseRenewalPlanDigest(plan);
  const [existing] = await atStage("RENEWAL_JOB_READBACK", () => db.select({ id: workerJobs.id, status: workerJobs.status, errorCode: workerJobs.errorCode, heartbeatAt: workerJobs.heartbeatAt })
    .from(workerJobs).where(and(eq(workerJobs.tenantId, input.identity.tenantId), eq(workerJobs.jobType, PRIVATE_DATABASE_RENEWAL_JOB),
      eq(workerJobs.contractVersion, PRIVATE_DATABASE_RENEWAL_CONTRACT), sql`${workerJobs.inputJson}->>'projectId' = ${input.identity.projectId}`,
      sql`${workerJobs.inputJson}->>'configurationRef' = ${input.configurationRef}`)).orderBy(desc(workerJobs.createdAt)).limit(1));
  if (existing) return result({ ...base, ready: false, reason: "PRIVATE_DATABASE_RENEWAL_JOB_EXISTS", plan, planDigest, leaseExpiresAt,
    existingJob: { jobId: existing.id, status: existing.status, errorCode: existing.errorCode, heartbeatAt: existing.heartbeatAt?.toISOString() ?? null } });

  const runtime = options.runtime ?? createCloudflareNativeProvisionRuntime(), scope = input.identity;
  const receiptRows = await atStage("SOURCE_RECEIPT_READBACK", () => db.select({ id: workerJobs.id, tenantId: workerJobs.tenantId, requestedByUserId: workerJobs.requestedByUserId,
    jobType: workerJobs.jobType, contractVersion: workerJobs.contractVersion, status: workerJobs.status,
    operatorReviewRequired: workerJobs.operatorReviewRequired, inputJson: workerJobs.inputJson, outputJson: workerJobs.outputJson })
    .from(workerJobs).where(eq(workerJobs.id, binding.provisionJobId)).limit(1));
  const checkpointRows = await atStage("SOURCE_CHECKPOINT_READBACK", () => db.select({ value: systemSettings.value, isSensitive: systemSettings.isSensitive, updatedBy: systemSettings.updatedBy })
    .from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_private_database_runs"), eq(systemSettings.key, binding.provisionJobId))).limit(2));
  if (checkpointRows.length !== 1 || !checkpointRows[0].isSensitive || !checkpointRows[0].value || checkpointRows[0].updatedBy !== input.actorUserId)
    return result({ ...base, ready: false, reason: "PRIVATE_DATABASE_RENEWAL_SOURCE_CHECKPOINT_UNAVAILABLE", plan: null, planDigest: null, leaseExpiresAt: null, existingJob: null });
  let checkpoint;
  try { checkpoint = privateDatabaseCheckpointSchema.parse(JSON.parse(decrypt(checkpointRows[0].value))); }
  catch { return result({ ...base, ready: false, reason: "PRIVATE_DATABASE_RENEWAL_SOURCE_CHECKPOINT_INVALID", plan: null, planDigest: null, leaseExpiresAt: null, existingJob: null }); }
  await atStage("SOURCE_RECEIPT_VALIDATION", async () => assertPrivateDatabaseProvisionReceipt(binding, receiptRows[0], { tenantId: input.identity.tenantId, projectId: input.identity.projectId,
    accountRef: config.descriptor.accountRef, actorUserId: input.actorUserId }, { jobId: binding.provisionJobId, actorUserId: input.actorUserId, state: checkpoint }));
  if (checkpoint.planDigest !== binding.planDigest || !checkpoint.databaseRolePrepared || !checkpoint.databasePassword)
    return result({ ...base, ready: false, reason: "PRIVATE_DATABASE_RENEWAL_SOURCE_RECEIPT_DENIED", plan: null, planDigest: null, leaseExpiresAt: null, existingJob: null });
  await atStage("DATABASE_ROLE_READBACK", () => verifyExpiredRole(db, binding.plan, now));
  await atStage("CLOUDFLARE_PROVIDER_READBACK", () => runtime.withCredential(scope, async token => verifyPrivateDatabaseProviderResources({ descriptor: binding,
    accountRef: config.descriptor.accountRef, token, fetchImpl: runtime.fetchImpl, effectiveLeaseExpiresAt: leaseExpiresAt })));
  return result({ ...base, ready: true, reason: null, plan, planDigest, leaseExpiresAt, existingJob: null });
}
