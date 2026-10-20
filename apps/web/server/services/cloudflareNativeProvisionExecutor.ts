import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, type DrizzleDB } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { encrypt, decrypt } from "./crypto";
import { getAppRuntimeConfig } from "./appRuntimeConfig";
import { resolveProviderDeploymentTarget, type DeploymentTargetIdentity } from "./providerDeploymentTargetAuthority";
import { createCloudflareStagingExecutorProof, verifyCloudflareStagingExecutorProof, type CloudflareStagingExecutorAttemptBinding } from "./cloudflareStagingExecutorIdentityService";
import { getEffectiveWorkerJobDeadlineMs } from "./workerJobDeadlinePolicy";
import type { JobExecutor } from "./jobExecutor";
import { NATIVE_PROVISION_CONTRACT, NATIVE_PROVISION_JOB, nativeProvisionJobSchema,
  nativeProvisionGrantSchema, type NativeProvisionGrant } from "./cloudflareNativeProvisionContract";
import { NativeProvisionError, nativeProvisionCheckpointSchema, provisionCloudflareNative,
  type NativeProvisionCheckpoint } from "./cloudflareNativeProvisionTransport";

export function nativeProvisionCredentialRef(identity: DeploymentTargetIdentity) {
  if (identity.provider !== "cloudflare" || identity.environment !== "staging") throw new NativeProvisionError("NATIVE_PROVISION_SCOPE_DENIED");
  return `cloudflare:native-provision:${encodeURIComponent(identity.tenantId)}:${encodeURIComponent(identity.projectId)}:staging`;
}

/** Same server-only scoped setup as the protected-origin executor; no IAM changes. */
export async function saveCloudflareNativeProvisionCredential(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; token: string; actorUserId: number;
}) {
  const credentialRef = nativeProvisionCredentialRef(input.identity);
  if (!input.token || !Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0) throw new NativeProvisionError("NATIVE_CREDENTIAL_INVALID");
  const key = createHash("sha256").update(credentialRef).digest("hex");
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${credentialRef}))`);
    const where = and(eq(systemSettings.category, "cloudflare_native_provision_credentials"), eq(systemSettings.key, key));
    const rows = await tx.select({ id: systemSettings.id }).from(systemSettings).where(where).limit(2);
    if (rows.length > 1) throw new NativeProvisionError("NATIVE_CREDENTIAL_AMBIGUOUS");
    const value = encrypt(JSON.stringify({ ...input.identity, credentialRef, token: input.token, revokedAt: null }));
    if (rows[0]) await tx.update(systemSettings).set({ value, valueJson: null, isSensitive: true, updatedBy: input.actorUserId, updatedAt: new Date() }).where(eq(systemSettings.id, rows[0].id));
    else await tx.insert(systemSettings).values({ category: "cloudflare_native_provision_credentials", key,
      value, isSensitive: true, updatedBy: input.actorUserId, description: "Exact staging native metadata provisioning credential" });
  });
  return { credentialRef, status: "CONFIGURED" as const };
}

type Runtime = {
  resolveGrant(ref: string): Promise<unknown>;
  verifyExecutor(grant: NativeProvisionGrant): Promise<string>;
  resolveAccount(scope: DeploymentTargetIdentity): Promise<string | null>;
  withCredential<T>(scope: DeploymentTargetIdentity, operation: (token: string) => Promise<T>): Promise<T>;
  loadCheckpoint(grant: NativeProvisionGrant): Promise<NativeProvisionCheckpoint | null>;
  saveCheckpoint(grant: NativeProvisionGrant, state: NativeProvisionCheckpoint): Promise<void>;
  fetchImpl?: typeof fetch;
};

export function createCloudflareNativeProvisionRuntime(options: { fetchImpl?: typeof fetch } = {}): Runtime {
  const db = getDb(), fetchImpl = options.fetchImpl ?? fetch;
  const where = (g: NativeProvisionGrant) => and(eq(systemSettings.category, "cloudflare_native_provision_runs"), eq(systemSettings.key, g.jobId));
  return {
    fetchImpl,
    async resolveGrant(ref) {
      const config = await getAppRuntimeConfig();
      if (!config.webGatewayToken) throw new NativeProvisionError("NATIVE_GRANT_AUTH_UNAVAILABLE");
      const r = await fetchImpl(`${config.pythonBackendUrl}/api/v1/approvals/internal/cloudflare-staging-grants/${encodeURIComponent(ref)}`, {
        headers: { "x-internal-token": config.webGatewayToken }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000),
      });
      return r.ok ? (await r.json() as { grant?: unknown }).grant : null;
    },
    async verifyExecutor(g) {
      const binding: CloudflareStagingExecutorAttemptBinding = { jobId: g.jobId, tenantId: g.tenantId, target: g.targetId, artifactSha256: g.planDigest,
        action: "provision" as const, provisionContract: NATIVE_PROVISION_CONTRACT,
        idempotencyKey: `cloudflare-native-provision:${g.jobId}`,
        provisionAuthority: { projectId: g.projectId, grantRef: g.grantRef, accountRef: g.accountRef, planDigest: g.planDigest } };
      return (await verifyCloudflareStagingExecutorProof(await createCloudflareStagingExecutorProof(binding), { expectedBinding: binding })).executorId;
    },
    async resolveAccount(scope) {
      const target = await resolveProviderDeploymentTarget(db, scope);
      return target.status === "CONFIGURED" && target.target.deploymentTargetId === "smartspec-cloudflare-staging"
        && target.target.workerRef === "smartspec-cloudflare-staging" && !target.target.containerApplicationRef ? target.target.accountRef : null;
    },
    async withCredential(scope, operation) {
      const ref = nativeProvisionCredentialRef(scope), key = createHash("sha256").update(ref).digest("hex");
      const rows = await db.select().from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_native_provision_credentials"), eq(systemSettings.key, key))).limit(2);
      if (rows.length !== 1 || !rows[0].isSensitive || !rows[0].value) throw new NativeProvisionError("NATIVE_CREDENTIAL_DENIED");
      let value: any;
      try { value = JSON.parse(decrypt(rows[0].value)); } catch { throw new NativeProvisionError("NATIVE_CREDENTIAL_DENIED"); }
      if (value.credentialRef !== ref || value.tenantId !== scope.tenantId || value.projectId !== scope.projectId
        || value.environment !== "staging" || value.provider !== "cloudflare" || value.revokedAt !== null || !value.token || typeof value.token !== "string")
        throw new NativeProvisionError("NATIVE_CREDENTIAL_DENIED");
      return operation(value.token);
    },
    async loadCheckpoint(g) {
      const rows = await db.select().from(systemSettings).where(where(g)).limit(2);
      if (!rows.length) return null;
      if (rows.length !== 1 || !rows[0].isSensitive || !rows[0].value || rows[0].updatedBy !== g.requesterUserId)
        throw new NativeProvisionError("NATIVE_CHECKPOINT_DENIED");
      return nativeProvisionCheckpointSchema.parse(JSON.parse(decrypt(rows[0].value)));
    },
    async saveCheckpoint(g, state) {
      await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${g.jobId}))`);
        const rows = await tx.select({ id: systemSettings.id, updatedBy: systemSettings.updatedBy }).from(systemSettings).where(where(g)).limit(2);
        if (rows.length > 1 || (rows[0] && rows[0].updatedBy !== g.requesterUserId)) throw new NativeProvisionError("NATIVE_CHECKPOINT_DENIED");
        const value = encrypt(JSON.stringify(nativeProvisionCheckpointSchema.parse(state)));
        if (rows[0]) await tx.update(systemSettings).set({ value, valueJson: null, isSensitive: true, updatedBy: g.requesterUserId, updatedAt: new Date() }).where(eq(systemSettings.id, rows[0].id));
        else await tx.insert(systemSettings).values({ category: "cloudflare_native_provision_runs", key: g.jobId, value, isSensitive: true,
          updatedBy: g.requesterUserId, description: "Canonical native staging provisioning progress; no production activation" });
      });
    },
  };
}

export function createCloudflareNativeProvisionExecutor(runtime: Runtime | (() => Runtime) = createCloudflareNativeProvisionRuntime): JobExecutor {
  return async ({ context, lease, reporter }) => {
    if (context.jobType !== NATIVE_PROVISION_JOB || context.contractVersion !== NATIVE_PROVISION_CONTRACT) throw new NativeProvisionError("NATIVE_JOB_INVALID");
    const job = nativeProvisionJobSchema.parse(context.input), active = typeof runtime === "function" ? runtime() : runtime;
    const grant = nativeProvisionGrantSchema.parse(await active.resolveGrant(job.grantRef));
    const scope = { tenantId: context.tenantId, projectId: job.projectId, provider: "cloudflare", environment: "staging" };
    let fingerprint: string | undefined;
    if (lease.expiresAt && (!Number.isFinite(Date.parse(lease.expiresAt)) || Date.parse(lease.expiresAt) <= Date.now()))
      throw new NativeProvisionError("NATIVE_AUTHORITY_EXPIRED");
    let lastHeartbeat = Date.now();
    const assertAuthorized = async () => {
      await reporter.assertActive(lease);
      if (Date.now() - lastHeartbeat >= 20_000) {
        await reporter.heartbeat(lease);
        lastHeartbeat = Date.now();
      }
      const now = Date.now(), createdAt = Date.parse(context.createdAt);
      if (!Number.isFinite(createdAt) || Date.parse(grant.expiresAt) <= now || Date.parse(grant.plan.configurationExpiresAt) <= now
        || createdAt + getEffectiveWorkerJobDeadlineMs({ ...context, runtimeType: "node_job_worker" }) <= now) throw new NativeProvisionError("NATIVE_AUTHORITY_EXPIRED");
      const live = nativeProvisionGrantSchema.safeParse(await active.resolveGrant(job.grantRef));
      if (!live.success || JSON.stringify(live.data) !== JSON.stringify(grant) || grant.jobId !== context.jobId
        || grant.tenantId !== context.tenantId || grant.requesterUserId !== context.requestedByUserId || grant.projectId !== job.projectId
        || grant.planDigest !== job.planDigest || await active.resolveAccount(scope) !== grant.accountRef)
        throw new NativeProvisionError("NATIVE_AUTHORITY_DENIED");
      if (fingerprint && fingerprint !== await active.withCredential(scope, async token => createHash("sha256").update(token).digest("hex")))
        throw new NativeProvisionError("NATIVE_CREDENTIAL_CHANGED");
    };
    await assertAuthorized();
    if (await active.verifyExecutor(grant) !== grant.executorId) throw new NativeProvisionError("NATIVE_EXECUTOR_DENIED");
    const checkpoint = await active.loadCheckpoint(grant) ?? { planDigest: grant.planDigest, metadata: [] };
    const output = await active.withCredential(scope, token => {
      fingerprint = createHash("sha256").update(token).digest("hex");
      return provisionCloudflareNative({ grant, token, checkpoint, assertAuthorized, fetchImpl: active.fetchImpl,
        readOnly: context.attempt > 1,
        saveCheckpoint: async state => { await reporter.assertActive(lease); await active.saveCheckpoint(grant, state); } });
    });
    return { output };
  };
}
