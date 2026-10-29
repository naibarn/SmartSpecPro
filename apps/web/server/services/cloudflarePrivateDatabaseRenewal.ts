import { and, desc, eq, sql } from "drizzle-orm";
import { ZodError } from "zod";
import { getDb, type DrizzleDB } from "../db";
import { systemSettings, workerJobAttempts, workerJobs } from "../../drizzle/schema";
import { decrypt } from "./crypto";
import { getCloudflareOriginConfiguration } from "./cloudflareOriginConfiguration";
import { resolveProviderDeploymentTarget, type DeploymentTargetIdentity } from "./providerDeploymentTargetAuthority";
import { createCloudflareNativeProvisionRuntime } from "./cloudflareNativeProvisionExecutor";
import { assertPrivateDatabaseProvisionReceipt, verifyPrivateDatabaseProviderResources, type PrivateDatabaseBinding } from "./cloudflarePrivateDatabaseBinding";
import { privateDatabaseCheckpointSchema } from "./cloudflarePrivateDatabaseTransport";
import { privateDatabaseRenewalPlanDigest, privateDatabaseRenewalPlanSchema,
  canonicalJobAdmissionSchemaReady, privateDatabaseRole,
  PRIVATE_DATABASE_RENEWAL_CONTRACT, PRIVATE_DATABASE_RENEWAL_JOB, type PrivateDatabaseRenewalPlan } from "./cloudflarePrivateDatabaseContract";

export type PrivateDatabaseRenewalIdentity = DeploymentTargetIdentity & { provider: "cloudflare"; environment: "staging" };
export type PrivateDatabaseRenewalPreflight = {
  ready: boolean; reason: string | null; failureStage: string | null; failureDetail: string | null; checkedAt: string; configurationRef: string; configurationDigest: string;
  accountRef: string;
  plan: PrivateDatabaseRenewalPlan | null; planDigest: string | null; leaseExpiresAt: string | null;
  existingJob: { jobId: string; status: string; errorCode: string | null; heartbeatAt: string | null; retryable: boolean } | null;
};

export function isSafeUnstartedPrivateDatabaseRenewalExpiry(job: {
  status: string; errorCode: string | null; startedAt: Date | null; heartbeatAt: Date | null;
  leaseExpiresAt: Date | null; fencingVersion: number; attempt: number; maxAttempts: number;
  idempotencyKey: string | null; planDigest: string | null;
}, attemptCount: number, checkpointCount: number): boolean {
  return job.status === "expired" && job.errorCode === "JOB_DEADLINE_EXPIRED"
    && job.startedAt === null && job.heartbeatAt === null && job.leaseExpiresAt === null
    && job.fencingVersion === 0 && job.attempt === 1 && job.maxAttempts >= 2
    && Boolean(job.planDigest) && job.idempotencyKey === `cloudflare-staging-private-db-renewal:${job.planDigest}`
    && attemptCount === 0 && checkpointCount === 0;
}

export function projectPrivateDatabaseRenewalJobStatus(job: {
  jobId: string; status: string; errorCode: string | null; workerId: string | null;
  attempt: number; maxAttempts: number; progress: unknown; heartbeatAt: Date | null;
  leaseExpiresAt: Date | null; createdAt: Date; startedAt: Date | null; finishedAt: Date | null;
}) {
  const progress = job.progress && typeof job.progress === "object" && !Array.isArray(job.progress)
    ? job.progress as Record<string, unknown> : {};
  const rawStage = progress.stage;
  const progressStage = typeof rawStage === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(rawStage) ? rawStage : null;
  const rawProgress = progress.progress;
  const progressPercent = typeof rawProgress === "number" && Number.isInteger(rawProgress) && rawProgress >= 0 && rawProgress <= 100
    ? rawProgress : null;
  const lastStatusUpdateAt = job.finishedAt ?? job.heartbeatAt ?? job.startedAt ?? job.createdAt;
  return {
    jobId: job.jobId, status: job.status,
    errorCode: typeof job.errorCode === "string" && /^[A-Z0-9_]{1,100}$/.test(job.errorCode) ? job.errorCode : null,
    workerId: job.workerId, attempt: job.attempt, maxAttempts: job.maxAttempts, progressStage, progressPercent,
    heartbeatAt: job.heartbeatAt?.toISOString() ?? null, leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(), startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null, lastStatusUpdateAt: lastStatusUpdateAt.toISOString(),
  };
}

function result(input: Omit<PrivateDatabaseRenewalPreflight, "checkedAt" | "failureStage" | "failureDetail"> & { failureStage?: string | null; failureDetail?: string | null }): PrivateDatabaseRenewalPreflight {
  return { ...input, failureStage: input.failureStage ?? null, failureDetail: input.failureDetail ?? null, checkedAt: new Date().toISOString() };
}
const SAFE_PLAN_PATHS = new Set(["configurationRef", "configurationDigest", "sourceProvisionJobId", "sourcePlan", "sourcePlanDigest", "resources",
  "hyperdriveId", "caId", "accessApplicationId", "accessPolicyId", "serviceTokenId", "dnsRecordId", "serviceTokenExpiresAt",
  "refreshServiceTokenExpiry", "leaseExpiresAt", "authorizationExpiresAt",
  "namespace", "hostname", "zoneId", "tunnelId", "databaseName", "caSha256", "connectionLimit", "configurationExpiresAt"]);
const SAFE_ZOD_CODES = new Set(["invalid_type", "invalid_format", "too_small", "too_big", "custom", "unrecognized_keys", "invalid_union", "not_multiple_of"]);
export function privateDatabaseRenewalPlanFailureDetail(error: unknown): string | null {
  if (!(error instanceof ZodError)) return null;
  const issue = error.issues[0];
  if (!issue) return "plan (invalid)";
  const path = issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number")
    .filter(part => typeof part === "number" || SAFE_PLAN_PATHS.has(part)).map(String).join(".");
  const code = SAFE_ZOD_CODES.has(issue.code) ? issue.code : "invalid";
  return `${path || "plan"} (${code})`;
}
export function privateDatabaseProviderFailureDetail(error: unknown): string | null {
  const detail = (error as { diagnosticDetail?: unknown } | null)?.diagnosticDetail;
  return typeof detail === "string" && /^(hyperdrive|ca|accessApplication|serviceToken|accessPolicy|dnsRecord|tunnel|zone)\.[a-zA-Z0-9_.]+ \(mismatch\)$/.test(detail)
    ? detail : null;
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
    throw Object.assign(new Error(stage === "PLAN_BINDING" && error instanceof ZodError
      ? "PRIVATE_DATABASE_RENEWAL_PLAN_BINDING_INVALID" : reason(error)), {
      preflightStage: stage,
      ...(stage === "PLAN_BINDING" ? { preflightFailureDetail: privateDatabaseRenewalPlanFailureDetail(error) } :
        stage === "CLOUDFLARE_PROVIDER_READBACK" ? { preflightFailureDetail: privateDatabaseProviderFailureDetail(error) } : {}),
    });
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

/** Stable for a UTC day while keeping the lease within the existing 30-day policy limit. */
export function stagingPrivateDatabaseRenewalLeaseExpiresAt(now: number): string {
  const dayMs = 24 * 60 * 60_000;
  return new Date(Math.floor((now + 30 * dayMs) / dayMs) * dayMs).toISOString();
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

  const [jobSchema] = await atStage("CANONICAL_JOB_SCHEMA_READBACK", () => db.execute(sql`SELECT
    to_regclass('public.conversation_threads') IS NOT NULL AS conversation_threads,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = 'worker_jobs' AND column_name = 'thread_id') AS worker_job_thread_id`));
  const jobSchemaRow = jobSchema as unknown as { conversation_threads?: boolean; worker_job_thread_id?: boolean } | undefined;
  if (!canonicalJobAdmissionSchemaReady(jobSchemaRow && { conversationThreads: jobSchemaRow.conversation_threads,
    workerJobThreadId: jobSchemaRow.worker_job_thread_id })) {
    return result({ ...base, ready: false, reason: "CANONICAL_JOB_SCHEMA_NOT_READY", failureStage: "CANONICAL_JOB_SCHEMA_READBACK",
      failureDetail: "worker_jobs.thread_id (missing)", plan: null, planDigest: null, leaseExpiresAt: null, existingJob: null });
  }

  const leaseExpiresAt = stagingPrivateDatabaseRenewalLeaseExpiresAt(now);
  const authorizationExpiresAt = new Date(now + 10 * 60_000).toISOString();
  const [existing] = await atStage("RENEWAL_JOB_READBACK", () => db.select({ id: workerJobs.id, status: workerJobs.status, errorCode: workerJobs.errorCode,
    heartbeatAt: workerJobs.heartbeatAt, startedAt: workerJobs.startedAt, leaseExpiresAt: workerJobs.leaseExpiresAt,
    fencingVersion: workerJobs.fencingVersion, attempt: workerJobs.attempt, maxAttempts: workerJobs.maxAttempts,
    idempotencyKey: workerJobs.idempotencyKey, planDigest: sql<string | null>`${workerJobs.inputJson}->>'planDigest'` })
    .from(workerJobs).where(and(eq(workerJobs.tenantId, input.identity.tenantId), eq(workerJobs.jobType, PRIVATE_DATABASE_RENEWAL_JOB),
      eq(workerJobs.contractVersion, PRIVATE_DATABASE_RENEWAL_CONTRACT), sql`${workerJobs.inputJson}->>'projectId' = ${input.identity.projectId}`,
      sql`${workerJobs.inputJson}->>'configurationRef' = ${input.configurationRef}`)).orderBy(desc(workerJobs.createdAt)).limit(1));
  let retryableExpiredJob: PrivateDatabaseRenewalPreflight["existingJob"] = null;
  if (existing) {
    const [attemptRows, checkpointRows] = await Promise.all([
      atStage("RENEWAL_JOB_ATTEMPT_READBACK", () => db.select({ id: workerJobAttempts.id }).from(workerJobAttempts)
        .where(eq(workerJobAttempts.workerJobId, existing.id)).limit(1)),
      atStage("RENEWAL_JOB_CHECKPOINT_READBACK", () => db.select({ id: systemSettings.id }).from(systemSettings)
        .where(and(eq(systemSettings.category, "cloudflare_private_database_renewals"), eq(systemSettings.key, existing.id))).limit(1)),
    ]);
    const safeUnstartedDeadlineExpiry = isSafeUnstartedPrivateDatabaseRenewalExpiry(existing, attemptRows.length, checkpointRows.length);
    const previousJob = { jobId: existing.id, status: existing.status, errorCode: existing.errorCode,
      heartbeatAt: existing.heartbeatAt?.toISOString() ?? null, retryable: safeUnstartedDeadlineExpiry };
    if (!safeUnstartedDeadlineExpiry) return result({ ...base, ready: false, reason: existing.status === "expired"
      ? "PRIVATE_DATABASE_RENEWAL_PREVIOUS_JOB_REQUIRES_REVIEW" : "PRIVATE_DATABASE_RENEWAL_JOB_EXISTS",
      plan: null, planDigest: null, leaseExpiresAt, existingJob: previousJob });
    retryableExpiredJob = previousJob;
  }

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
  const providerState = await atStage("CLOUDFLARE_PROVIDER_READBACK", () => runtime.withCredential(scope, async token => verifyPrivateDatabaseProviderResources({ descriptor: binding,
    accountRef: config.descriptor.accountRef, token, fetchImpl: runtime.fetchImpl, effectiveLeaseExpiresAt: leaseExpiresAt, allowServiceTokenExpiryRefresh: true })));
  if (!providerState.serviceTokenExpiresAt) return result({ ...base, ready: false, reason: "PRIVATE_DATABASE_SERVICE_TOKEN_EXPIRY_UNAVAILABLE",
    plan: null, planDigest: null, leaseExpiresAt, existingJob: null });
  const plan = await atStage("PLAN_BINDING", async () => privateDatabaseRenewalPlanSchema.parse({ configurationRef: config.configurationRef, configurationDigest: config.configurationDigest,
    sourceProvisionJobId: binding.provisionJobId, sourcePlan: binding.plan, sourcePlanDigest: binding.planDigest,
    resources: { hyperdriveId: binding.hyperdriveId, caId: binding.caId, accessApplicationId: binding.accessApplicationId,
      accessPolicyId: binding.accessPolicyId, serviceTokenId: binding.serviceTokenId, dnsRecordId: binding.dnsRecordId },
    serviceTokenExpiresAt: providerState.serviceTokenExpiresAt,
    refreshServiceTokenExpiry: providerState.serviceTokenExpiryRefreshRequired,
    leaseExpiresAt, authorizationExpiresAt }));
  const planDigest = privateDatabaseRenewalPlanDigest(plan);
  return result({ ...base, ready: true, reason: null, plan, planDigest, leaseExpiresAt, existingJob: retryableExpiredJob });
}
