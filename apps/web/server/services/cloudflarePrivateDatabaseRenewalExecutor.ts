import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { systemSettings, workerJobs } from "../../drizzle/schema";
import { decrypt, encrypt } from "./crypto";
import { getEffectiveWorkerJobDeadlineMs } from "./workerJobDeadlinePolicy";
import type { JobExecutor } from "./jobExecutor";
import { createCloudflareNativeProvisionRuntime, nativeProvisionCredentialRef } from "./cloudflareNativeProvisionExecutor";
import { createCloudflareStagingExecutorProof, verifyCloudflareStagingExecutorProof, type CloudflareStagingExecutorAttemptBinding } from "./cloudflareStagingExecutorIdentityService";
import { assertPrivateDatabaseProvisionReceipt, refreshPrivateDatabaseServiceToken, verifyPrivateDatabaseProviderResources, type PrivateDatabaseBinding } from "./cloudflarePrivateDatabaseBinding";
import { privateDatabaseCheckpointSchema } from "./cloudflarePrivateDatabaseTransport";
import { privateDatabaseResourceDigest, privateDatabaseRole, privateDatabaseRenewalGrantSchema, privateDatabaseRenewalJobSchema,
  privateDatabaseRenewalPlanDigest, PRIVATE_DATABASE_RENEWAL_CONTRACT, PRIVATE_DATABASE_RENEWAL_JOB, type PrivateDatabaseRenewalGrant } from "./cloudflarePrivateDatabaseContract";
import { CLOUDFLARE_STAGING_EXECUTOR_TARGET } from "./cloudflareStagingExecutorIdentityService";

type Runtime = {
  resolveGrant(ref: string): Promise<unknown>;
  resolveAccount(scope: { tenantId: string; projectId: string; provider: "cloudflare"; environment: "staging" }): Promise<string | null>;
  withCredential<T>(scope: { tenantId: string; projectId: string; provider: "cloudflare"; environment: "staging" }, operation: (token: string) => Promise<T>): Promise<T>;
  verifyExecutor(grant: PrivateDatabaseRenewalGrant): Promise<string>;
  loadSource(grant: PrivateDatabaseRenewalGrant): Promise<{ receipt: any; checkpoint: any; renewalCheckpoint: unknown | null }>;
  saveCheckpoint(grant: PrivateDatabaseRenewalGrant, value: Record<string, unknown>): Promise<void>;
  renewRole(grant: PrivateDatabaseRenewalGrant): Promise<void>;
  fetchImpl?: typeof fetch;
};

const renewalExecutionCheckpointSchema = z.object({
  status: z.enum(["service_token_refresh_pending", "service_token_refreshed", "succeeded"]),
  jobId: z.string().uuid(), planDigest: z.string().regex(/^[a-f0-9]{64}$/), serviceTokenId: z.string(),
  leaseExpiresAt: z.string().datetime({ offset: true }), serviceTokenExpiresAt: z.string().datetime({ offset: true }).optional(),
}).passthrough();

export function reconcilePrivateDatabaseServiceTokenRefresh(input: {
  checkpoint: unknown | null | undefined; jobId: string; planDigest: string; serviceTokenId: string;
  leaseExpiresAt: string; serviceTokenExpiresAt: string; refreshRequired: boolean;
}): { refreshRequiredNow: boolean; refreshReconciled: boolean } {
  const parsed = input.checkpoint == null ? null : renewalExecutionCheckpointSchema.safeParse(input.checkpoint);
  if (parsed && (!parsed.success || parsed.data.jobId !== input.jobId || parsed.data.planDigest !== input.planDigest
    || parsed.data.serviceTokenId !== input.serviceTokenId || parsed.data.leaseExpiresAt !== input.leaseExpiresAt
    || (parsed.data.status !== "service_token_refresh_pending" && !parsed.data.serviceTokenExpiresAt)))
    fail("PRIVATE_DATABASE_RENEWAL_CHECKPOINT_DENIED");
  const prior = parsed?.success ? parsed.data : null;
  const observedExpiry = Date.parse(input.serviceTokenExpiresAt), leaseExpiry = Date.parse(input.leaseExpiresAt);
  if (!Number.isFinite(observedExpiry) || !Number.isFinite(leaseExpiry)) fail("PRIVATE_DATABASE_RENEWAL_CHECKPOINT_DENIED");
  if (!input.refreshRequired) return { refreshRequiredNow: false, refreshReconciled: false };
  if (observedExpiry >= leaseExpiry) return { refreshRequiredNow: false, refreshReconciled: true };
  if (prior?.status === "service_token_refreshed" || prior?.status === "succeeded")
    fail("PRIVATE_DATABASE_SERVICE_TOKEN_REFRESH_READBACK_MISMATCH");
  return { refreshRequiredNow: true, refreshReconciled: false };
}

function fail(code: string): never { throw Object.assign(new Error(code), { diagnosticCode: code, class: "permanent" }); }

export function createCloudflarePrivateDatabaseRenewalRuntime(options: { fetchImpl?: typeof fetch } = {}): Runtime {
  const db = getDb(), native = createCloudflareNativeProvisionRuntime(options);
  return {
    resolveGrant: native.resolveGrant,
    resolveAccount: native.resolveAccount,
    withCredential: native.withCredential,
    fetchImpl: options.fetchImpl,
    async verifyExecutor(g) {
      const binding: CloudflareStagingExecutorAttemptBinding = { jobId: g.jobId, tenantId: g.tenantId,
        target: CLOUDFLARE_STAGING_EXECUTOR_TARGET, artifactSha256: g.planDigest, action: "renew_lease",
        provisionContract: PRIVATE_DATABASE_RENEWAL_CONTRACT, idempotencyKey: `cloudflare-private-db-renewal:${g.jobId}`,
        provisionAuthority: { projectId: g.projectId, grantRef: g.grantRef, accountRef: g.accountRef, planDigest: g.planDigest } };
      return (await verifyCloudflareStagingExecutorProof(await createCloudflareStagingExecutorProof(binding), { expectedBinding: binding })).executorId;
    },
    async loadSource(g) {
      const [receipt] = await db.select({ id: workerJobs.id, tenantId: workerJobs.tenantId, requestedByUserId: workerJobs.requestedByUserId,
        jobType: workerJobs.jobType, contractVersion: workerJobs.contractVersion, status: workerJobs.status,
        operatorReviewRequired: workerJobs.operatorReviewRequired, inputJson: workerJobs.inputJson, outputJson: workerJobs.outputJson })
        .from(workerJobs).where(eq(workerJobs.id, g.plan.sourceProvisionJobId)).limit(1);
      const rows = await db.select({ value: systemSettings.value, isSensitive: systemSettings.isSensitive, updatedBy: systemSettings.updatedBy })
        .from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_private_database_runs"), eq(systemSettings.key, g.plan.sourceProvisionJobId))).limit(2);
      if (rows.length !== 1 || !rows[0].isSensitive || !rows[0].value || rows[0].updatedBy !== g.requesterUserId) fail("PRIVATE_DATABASE_RENEWAL_SOURCE_CHECKPOINT_UNAVAILABLE");
      let checkpoint: unknown;
      try { checkpoint = JSON.parse(decrypt(rows[0].value)); } catch { return fail("PRIVATE_DATABASE_RENEWAL_SOURCE_CHECKPOINT_INVALID"); }
      const renewalRows = await db.select({ value: systemSettings.value, isSensitive: systemSettings.isSensitive, updatedBy: systemSettings.updatedBy })
        .from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_private_database_renewals"), eq(systemSettings.key, g.jobId))).limit(2);
      if (renewalRows.length > 1 || (renewalRows[0] && (!renewalRows[0].isSensitive || !renewalRows[0].value || renewalRows[0].updatedBy !== g.requesterUserId)))
        fail("PRIVATE_DATABASE_RENEWAL_CHECKPOINT_DENIED");
      let renewalCheckpoint: unknown | null = null;
      if (renewalRows[0]?.value) {
        try { renewalCheckpoint = JSON.parse(decrypt(renewalRows[0].value)); } catch { return fail("PRIVATE_DATABASE_RENEWAL_CHECKPOINT_DENIED"); }
      }
      return { receipt, checkpoint, renewalCheckpoint };
    },
    async saveCheckpoint(g, state) {
      const key = g.jobId;
      await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
        const rows = await tx.select({ id: systemSettings.id, value: systemSettings.value, isSensitive: systemSettings.isSensitive, updatedBy: systemSettings.updatedBy })
          .from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_private_database_renewals"), eq(systemSettings.key, key))).limit(2);
        if (rows.length > 1 || (rows[0] && (!rows[0].isSensitive || rows[0].updatedBy !== g.requesterUserId))) fail("PRIVATE_DATABASE_RENEWAL_CHECKPOINT_DENIED");
        if (rows[0]?.value) {
          let prior: any;
          try { prior = JSON.parse(decrypt(rows[0].value)); } catch { return fail("PRIVATE_DATABASE_RENEWAL_CHECKPOINT_DENIED"); }
          if (prior.planDigest !== g.planDigest || prior.jobId !== g.jobId) fail("PRIVATE_DATABASE_RENEWAL_CHECKPOINT_DENIED");
          if (prior.status === "succeeded" && JSON.stringify(prior) !== JSON.stringify(state)) fail("PRIVATE_DATABASE_RENEWAL_RECEIPT_IMMUTABLE");
        }
        const value = encrypt(JSON.stringify({ ...state, jobId: g.jobId, planDigest: g.planDigest }));
        if (rows[0]) await tx.update(systemSettings).set({ value, valueJson: null, isSensitive: true, updatedBy: g.requesterUserId, updatedAt: new Date() }).where(eq(systemSettings.id, rows[0].id));
        else await tx.insert(systemSettings).values({ category: "cloudflare_private_database_renewals", key, value,
          isSensitive: true, updatedBy: g.requesterUserId, description: "Encrypted private database lease renewal execution receipt" });
      });
    },
    async renewRole(g) {
      const role = privateDatabaseRole(g.plan.sourcePlan.namespace);
      const expiresAt = new Date(g.plan.leaseExpiresAt).toISOString();
      await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cloudflare-private-database-role:${role}`}))`);
        const current: any = await tx.execute(sql`SELECT current_database() AS name`);
        if (current[0]?.name !== g.plan.sourcePlan.databaseName) fail("PRIVATE_DATABASE_RENEWAL_DATABASE_SCOPE_DENIED");
        const roles: any = await tx.execute(sql`SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolcanlogin, rolconnlimit, rolconfig, rolvaliduntil FROM pg_roles WHERE rolname=${role}`);
        const r = roles[0], oldExpiry = Date.parse(g.plan.sourcePlan.configurationExpiresAt);
        if (!r || r.rolsuper || r.rolcreaterole || r.rolcreatedb || r.rolreplication || r.rolbypassrls || !r.rolcanlogin || r.rolconnlimit !== 5
          || !r.rolconfig?.includes("default_transaction_read_only=on") || !r.rolvaliduntil || Date.parse(expiresAt) <= Date.now()) fail("PRIVATE_DATABASE_RENEWAL_ROLE_DRIFT");
        if (Date.parse(r.rolvaliduntil) !== Date.parse(expiresAt)) {
          if (Date.parse(r.rolvaliduntil) !== oldExpiry || Date.parse(r.rolvaliduntil) > Date.now()) fail("PRIVATE_DATABASE_RENEWAL_ROLE_DRIFT");
          const safeExpiry = expiresAt.replace(/'/g, "");
          await tx.execute(sql.raw(`ALTER ROLE "${role}" VALID UNTIL '${safeExpiry}'`));
        }
        const readback: any = await tx.execute(sql`SELECT rolvaliduntil, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolcanlogin, rolconnlimit, rolconfig FROM pg_roles WHERE rolname=${role}`);
        const updated = readback[0];
        if (!updated || Date.parse(updated.rolvaliduntil) !== Date.parse(expiresAt) || updated.rolsuper || updated.rolcreaterole || updated.rolcreatedb
          || updated.rolreplication || updated.rolbypassrls || !updated.rolcanlogin || updated.rolconnlimit !== 5
          || !updated.rolconfig?.includes("default_transaction_read_only=on")) fail("PRIVATE_DATABASE_RENEWAL_ROLE_READBACK_FAILED");
      });
    },
  };
}

export function createCloudflarePrivateDatabaseRenewalExecutor(runtime: Runtime | (() => Runtime) = createCloudflarePrivateDatabaseRenewalRuntime): JobExecutor {
  return async ({ context, lease, reporter, controlPlane }) => {
    if (context.jobType !== PRIVATE_DATABASE_RENEWAL_JOB || context.contractVersion !== PRIVATE_DATABASE_RENEWAL_CONTRACT) fail("PRIVATE_DATABASE_RENEWAL_JOB_DENIED");
    const input = privateDatabaseRenewalJobSchema.parse(context.input), active = typeof runtime === "function" ? runtime() : runtime;
    const grant = privateDatabaseRenewalGrantSchema.parse(await active.resolveGrant(input.grantRef));
    const scope = { tenantId: grant.tenantId, projectId: grant.projectId, provider: "cloudflare" as const, environment: "staging" as const };
    let heartbeatAt = Date.now(), tokenFingerprint: string | undefined;
    const assertAuthorized = async () => {
      await reporter.assertActive(lease);
      const current = await controlPlane.getStatus(context.jobId, { tenantId: context.tenantId });
      if (!current?.lease.active || current.lease.stale || current.lease.fencingVersion !== lease.fencingVersion
        || current.attempt !== context.attempt || Date.parse(current.lease.expiresAt ?? "") <= Date.now()) fail("PRIVATE_DATABASE_RENEWAL_LEASE_FENCED");
      if (Date.now() - heartbeatAt >= 20_000) { await reporter.heartbeat(lease); heartbeatAt = Date.now(); }
      const live = privateDatabaseRenewalGrantSchema.safeParse(await active.resolveGrant(input.grantRef));
      if (!live.success || JSON.stringify(live.data) !== JSON.stringify(grant) || grant.jobId !== context.jobId || grant.tenantId !== context.tenantId
        || grant.requesterUserId !== context.requestedByUserId || grant.projectId !== input.projectId || grant.plan.configurationRef !== input.configurationRef || grant.planDigest !== input.planDigest
        || privateDatabaseRenewalPlanDigest(input.plan) !== grant.planDigest
        || Date.parse(grant.expiresAt) <= Date.now() || Date.parse(grant.plan.leaseExpiresAt) <= Date.now()
        || Date.parse(context.createdAt) + getEffectiveWorkerJobDeadlineMs({ ...context, runtimeType: "node_job_worker" }) <= Date.now()
        || await active.resolveAccount(scope) !== grant.accountRef) fail("PRIVATE_DATABASE_RENEWAL_AUTHORITY_DENIED");
      const fingerprint = await active.withCredential(scope, async token => createHash("sha256").update(token).digest("hex"));
      if (tokenFingerprint && tokenFingerprint !== fingerprint) fail("PRIVATE_DATABASE_RENEWAL_CREDENTIAL_CHANGED");
      tokenFingerprint = fingerprint;
    };
    await assertAuthorized();
    if (await active.verifyExecutor(grant) !== grant.executorId) fail("PRIVATE_DATABASE_RENEWAL_EXECUTOR_DENIED");
    const { receipt, checkpoint: rawCheckpoint, renewalCheckpoint: rawRenewalCheckpoint } = await active.loadSource(grant);
    const checkpoint = privateDatabaseCheckpointSchema.parse(rawCheckpoint), plan = grant.plan.sourcePlan;
    const descriptor: PrivateDatabaseBinding = { provisionJobId: grant.plan.sourceProvisionJobId, plan,
      planDigest: grant.plan.sourcePlanDigest, ...grant.plan.resources };
    assertPrivateDatabaseProvisionReceipt(descriptor, receipt, { tenantId: grant.tenantId, projectId: grant.projectId,
      accountRef: grant.accountRef, actorUserId: grant.requesterUserId }, { jobId: receipt?.id, actorUserId: grant.requesterUserId, state: checkpoint });
    if (!checkpoint.databaseRolePrepared || !checkpoint.databasePassword || checkpoint.planDigest !== grant.plan.sourcePlanDigest
      || checkpoint.hyperdriveId !== descriptor.hyperdriveId || checkpoint.caId !== descriptor.caId || checkpoint.appId !== descriptor.accessApplicationId
      || checkpoint.policyId !== descriptor.accessPolicyId || checkpoint.dnsRecordId !== descriptor.dnsRecordId
      || checkpoint.serviceToken?.id !== descriptor.serviceTokenId) fail("PRIVATE_DATABASE_RENEWAL_SOURCE_RECEIPT_DENIED");
    const providerDescriptor = { ...descriptor } as PrivateDatabaseBinding;
    const beforeProvider = await active.withCredential(scope, async token => verifyPrivateDatabaseProviderResources({ descriptor: providerDescriptor,
      accountRef: grant.accountRef, token, effectiveLeaseExpiresAt: grant.plan.leaseExpiresAt, fetchImpl: active.fetchImpl,
      allowServiceTokenExpiryRefresh: grant.plan.refreshServiceTokenExpiry }));
    const plannedTokenExpiry = Date.parse(grant.plan.serviceTokenExpiresAt);
    const observedTokenExpiry = Date.parse(beforeProvider.serviceTokenExpiresAt ?? "");
    if (!Number.isFinite(observedTokenExpiry) || (observedTokenExpiry !== plannedTokenExpiry
      && !(grant.plan.refreshServiceTokenExpiry && observedTokenExpiry > plannedTokenExpiry && observedTokenExpiry >= Date.parse(grant.plan.leaseExpiresAt))))
      fail("PRIVATE_DATABASE_RENEWAL_PLAN_STALE");
    // A previous attempt may have lost its response after Cloudflare applied the
    // refresh. Reconcile the exact token readback before deciding to write again.
    const tokenRefresh = reconcilePrivateDatabaseServiceTokenRefresh({ checkpoint: rawRenewalCheckpoint, jobId: grant.jobId,
      planDigest: grant.planDigest, serviceTokenId: descriptor.serviceTokenId, leaseExpiresAt: grant.plan.leaseExpiresAt,
      serviceTokenExpiresAt: beforeProvider.serviceTokenExpiresAt!, refreshRequired: grant.plan.refreshServiceTokenExpiry });
    let serviceTokenRefreshed = tokenRefresh.refreshReconciled;
    if (tokenRefresh.refreshRequiredNow) {
      const marker = `${plan.namespace}-database-${privateDatabaseResourceDigest(plan).slice(0, 12)}`;
      const priorRefresh = rawRenewalCheckpoint == null ? null : renewalExecutionCheckpointSchema.parse(rawRenewalCheckpoint);
      if (priorRefresh?.status !== "service_token_refresh_pending") await active.saveCheckpoint(grant, { status: "service_token_refresh_pending", planDigest: grant.planDigest,
        serviceTokenId: descriptor.serviceTokenId, leaseExpiresAt: grant.plan.leaseExpiresAt });
      await assertAuthorized();
      const refreshed = await active.withCredential(scope, token => refreshPrivateDatabaseServiceToken({ accountRef: grant.accountRef,
        serviceTokenId: descriptor.serviceTokenId, expectedClientId: checkpoint.serviceToken!.clientId, expectedName: marker,
        effectiveLeaseExpiresAt: grant.plan.leaseExpiresAt, token, fetchImpl: active.fetchImpl }));
      await assertAuthorized();
      serviceTokenRefreshed = true;
      await active.saveCheckpoint(grant, { status: "service_token_refreshed", planDigest: grant.planDigest,
        serviceTokenId: descriptor.serviceTokenId, serviceTokenExpiresAt: refreshed.expiresAt, leaseExpiresAt: grant.plan.leaseExpiresAt });
    }
    const afterProvider = await active.withCredential(scope, async token => verifyPrivateDatabaseProviderResources({ descriptor: providerDescriptor,
      accountRef: grant.accountRef, token, effectiveLeaseExpiresAt: grant.plan.leaseExpiresAt, fetchImpl: active.fetchImpl }));
    if (!afterProvider.serviceTokenExpiresAt || Date.parse(afterProvider.serviceTokenExpiresAt) < Date.parse(grant.plan.leaseExpiresAt))
      fail("PRIVATE_DATABASE_SERVICE_TOKEN_REFRESH_INSUFFICIENT");
    if (grant.plan.refreshServiceTokenExpiry) serviceTokenRefreshed = true;
    await assertAuthorized();
    await active.renewRole(grant);
    await assertAuthorized();
    const output = { status: "verified" as const, configurationRef: grant.plan.configurationRef,
      configurationDigest: grant.plan.configurationDigest, sourceProvisionJobId: grant.plan.sourceProvisionJobId,
      sourcePlanDigest: grant.plan.sourcePlanDigest, planDigest: grant.planDigest,
      resourceIds: grant.plan.resources, leaseExpiresAt: grant.plan.leaseExpiresAt,
      serviceTokenRefreshed, serviceTokenExpiresAt: afterProvider.serviceTokenExpiresAt,
      providerResourcesVerified: true as const, databaseRoleReadbackVerified: true as const };
    await active.saveCheckpoint(grant, { ...output, status: "succeeded" });
    return { output };
  };
}
