import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, type DrizzleDB } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { encrypt, decrypt } from "./crypto";
import { createCloudflareNativeProvisionRuntime } from "./cloudflareNativeProvisionExecutor";
import type { DeploymentTargetIdentity } from "./providerDeploymentTargetAuthority";
import { createCloudflareStagingExecutorProof, verifyCloudflareStagingExecutorProof, type CloudflareStagingExecutorAttemptBinding } from "./cloudflareStagingExecutorIdentityService";
import { getEffectiveWorkerJobDeadlineMs } from "./workerJobDeadlinePolicy";
import { withCloudflareStagingLeaseHeartbeat } from "./cloudflareStagingLeaseHeartbeat";
import type { JobExecutor } from "./jobExecutor";
import { HTTP_IMAGE_PROVISION_CONTRACT, HTTP_IMAGE_PROVISION_JOB, httpImageProvisionGrantSchema,
  httpImageProvisionJobSchema, type HttpImageProvisionGrant } from "./cloudflareHttpImageProvisionContract";
import { HttpImageError, createHttpImageRegistryTransport, publishHttpImage, httpImageCheckpointSchema,
  type HttpImageCheckpoint, type HttpImagePublicationPorts } from "./cloudflareHttpImagePublication";
import { createHttpImageBuildOperator } from "./cloudflareHttpImageBuildOperator";

export function httpImageProvisionCredentialRef(scope: DeploymentTargetIdentity) {
  if (scope.provider !== "cloudflare" || scope.environment !== "staging") throw new HttpImageError("HTTP_IMAGE_CREDENTIAL_SCOPE_DENIED");
  return `cloudflare:http-image-provision:${encodeURIComponent(scope.tenantId)}:${encodeURIComponent(scope.projectId)}:staging`;
}

/** Explicit owner setup of a separate encrypted purpose profile. It neither
 * broadens the Worker deployment token nor mutates provider IAM. */
export async function saveCloudflareHttpImageProvisionCredential(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; token: string; actorUserId: number;
}) {
  const credentialRef = httpImageProvisionCredentialRef(input.identity);
  if (!input.token || !Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0) throw new HttpImageError("HTTP_IMAGE_CREDENTIAL_INVALID");
  const key = createHash("sha256").update(credentialRef).digest("hex");
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${credentialRef}))`);
    const where = and(eq(systemSettings.category, "cloudflare_http_image_credentials"), eq(systemSettings.key, key));
    const rows = await tx.select({ id: systemSettings.id }).from(systemSettings).where(where).limit(2);
    if (rows.length > 1) throw new HttpImageError("HTTP_IMAGE_CREDENTIAL_AMBIGUOUS");
    const value = encrypt(JSON.stringify({ ...input.identity, credentialRef, token: input.token, revokedAt: null }));
    if (rows[0]) await tx.update(systemSettings).set({ value, valueJson: null, isSensitive: true, updatedBy: input.actorUserId, updatedAt: new Date() }).where(eq(systemSettings.id, rows[0].id));
    else await tx.insert(systemSettings).values({ category: "cloudflare_http_image_credentials", key, value, isSensitive: true,
      updatedBy: input.actorUserId, description: "Exact staging HTTP image publication credential; no app activation" });
  });
  return { credentialRef, status: "CONFIGURED" as const };
}

type Runtime = {
  resolveGrant(ref: string): Promise<unknown>;
  verifyExecutor(grant: HttpImageProvisionGrant): Promise<string>;
  resolveAccount(scope: DeploymentTargetIdentity): Promise<string | null>;
  withCredential<T>(scope: DeploymentTargetIdentity, operation: (token: string) => Promise<T>): Promise<T>;
  loadCheckpoint(grant: HttpImageProvisionGrant): Promise<unknown>;
  saveCheckpoint(grant: HttpImageProvisionGrant, state: HttpImageCheckpoint): Promise<void>;
  createPorts(token: string, assertAuthorized: () => Promise<void>): Omit<HttpImagePublicationPorts, "saveCheckpoint">;
};

export function createCloudflareHttpImageProvisionRuntime(options: { fetchImpl?: typeof fetch } = {}): Runtime {
  const db = getDb(), authority = createCloudflareNativeProvisionRuntime(options);
  const where = (g: HttpImageProvisionGrant) => and(eq(systemSettings.category, "cloudflare_http_image_runs"), eq(systemSettings.key, g.jobId));
  return {
    resolveGrant: authority.resolveGrant, resolveAccount: authority.resolveAccount,
    async verifyExecutor(g) {
      const binding: CloudflareStagingExecutorAttemptBinding = { jobId: g.jobId, tenantId: g.tenantId, target: g.targetId,
        artifactSha256: g.planDigest, action: "provision", provisionContract: HTTP_IMAGE_PROVISION_CONTRACT,
        idempotencyKey: `cloudflare-http-image:${g.jobId}`,
        provisionAuthority: { projectId: g.projectId, grantRef: g.grantRef, accountRef: g.accountRef, planDigest: g.planDigest } };
      return (await verifyCloudflareStagingExecutorProof(await createCloudflareStagingExecutorProof(binding), { expectedBinding: binding })).executorId;
    },
    async withCredential(scope, operation) {
      const ref = httpImageProvisionCredentialRef(scope), key = createHash("sha256").update(ref).digest("hex");
      const rows = await db.select().from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_http_image_credentials"), eq(systemSettings.key, key))).limit(2);
      if (rows.length !== 1 || !rows[0].isSensitive || !rows[0].value) throw new HttpImageError("HTTP_IMAGE_CREDENTIAL_DENIED");
      let value: any;
      try { value = JSON.parse(decrypt(rows[0].value)); } catch { throw new HttpImageError("HTTP_IMAGE_CREDENTIAL_DENIED"); }
      if (value.credentialRef !== ref || value.tenantId !== scope.tenantId || value.projectId !== scope.projectId ||
          value.provider !== "cloudflare" || value.environment !== "staging" || value.revokedAt !== null || !value.token || typeof value.token !== "string")
        throw new HttpImageError("HTTP_IMAGE_CREDENTIAL_DENIED");
      return operation(value.token);
    },
    async loadCheckpoint(g) {
      const rows = await db.select().from(systemSettings).where(where(g)).limit(2);
      if (!rows.length) return null;
      if (rows.length !== 1 || !rows[0].isSensitive || !rows[0].value || rows[0].updatedBy !== g.requesterUserId)
        throw new HttpImageError("HTTP_IMAGE_CHECKPOINT_DENIED");
      return httpImageCheckpointSchema.parse(JSON.parse(decrypt(rows[0].value)));
    },
    async saveCheckpoint(g, state) {
      await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${g.jobId}))`);
        const rows = await tx.select({ id: systemSettings.id, updatedBy: systemSettings.updatedBy }).from(systemSettings).where(where(g)).limit(2);
        if (rows.length > 1 || rows[0] && rows[0].updatedBy !== g.requesterUserId) throw new HttpImageError("HTTP_IMAGE_CHECKPOINT_DENIED");
        const value = encrypt(JSON.stringify(httpImageCheckpointSchema.parse(state)));
        if (rows[0]) await tx.update(systemSettings).set({ value, valueJson: null, isSensitive: true, updatedBy: g.requesterUserId, updatedAt: new Date() }).where(eq(systemSettings.id, rows[0].id));
        else await tx.insert(systemSettings).values({ category: "cloudflare_http_image_runs", key: g.jobId, value, isSensitive: true,
          updatedBy: g.requesterUserId, description: "Canonical HTTP image publication intent/readback; no app activation" });
      });
    },
    createPorts(token, assertAuthorized) {
      return { assertAuthorized, ...createHttpImageRegistryTransport(token, assertAuthorized, options.fetchImpl), ...createHttpImageBuildOperator(assertAuthorized) };
    },
  };
}

export function createCloudflareHttpImageProvisionExecutor(runtime: Runtime | (() => Runtime) = createCloudflareHttpImageProvisionRuntime): JobExecutor {
  return withCloudflareStagingLeaseHeartbeat(async ({ context, lease, reporter, controlPlane }) => {
    if (process.env.SMARTAIHUB_APPLICATION_RUNTIME === "cloudflare-http") throw new HttpImageError("HTTP_IMAGE_OPERATOR_RUNTIME_REQUIRED");
    if (context.jobType !== HTTP_IMAGE_PROVISION_JOB || context.contractVersion !== HTTP_IMAGE_PROVISION_CONTRACT)
      throw new HttpImageError("HTTP_IMAGE_JOB_INVALID");
    const job = httpImageProvisionJobSchema.parse(context.input), active = typeof runtime === "function" ? runtime() : runtime;
    const grant = httpImageProvisionGrantSchema.parse(await active.resolveGrant(job.grantRef));
    const scope = { tenantId: context.tenantId, projectId: job.projectId, provider: "cloudflare", environment: "staging" };
    let fingerprint: string | undefined;
    const assertAuthorized = async () => {
      await reporter.assertActive(lease);
      const status = await controlPlane.getStatus(context.jobId, { tenantId: context.tenantId });
      const now = Date.now(), created = Date.parse(context.createdAt);
      if (!status?.lease.active || status.lease.stale || !status.lease.expiresAt || !Number.isFinite(Date.parse(status.lease.expiresAt)) ||
          Date.parse(status.lease.expiresAt) <= now || status.lease.fencingVersion !== lease.fencingVersion || status.attempt !== context.attempt ||
          !Number.isFinite(created) || created + getEffectiveWorkerJobDeadlineMs({ ...context, runtimeType: "node_job_worker" }) <= now ||
          Date.parse(grant.expiresAt) <= now || Date.parse(grant.plan.configurationExpiresAt) <= now)
        throw new HttpImageError("HTTP_IMAGE_AUTHORITY_EXPIRED");
      const live = httpImageProvisionGrantSchema.safeParse(await active.resolveGrant(job.grantRef));
      if (!live.success || JSON.stringify(live.data) !== JSON.stringify(grant) || grant.jobId !== context.jobId ||
          grant.tenantId !== context.tenantId || grant.requesterUserId !== context.requestedByUserId || grant.projectId !== job.projectId ||
          grant.planDigest !== job.planDigest || await active.resolveAccount(scope) !== grant.accountRef)
        throw new HttpImageError("HTTP_IMAGE_AUTHORITY_DENIED");
      if (fingerprint && fingerprint !== await active.withCredential(scope, async token => createHash("sha256").update(token).digest("hex")))
        throw new HttpImageError("HTTP_IMAGE_CREDENTIAL_CHANGED");
    };
    await assertAuthorized();
    if (await active.verifyExecutor(grant) !== grant.executorId) throw new HttpImageError("HTTP_IMAGE_EXECUTOR_DENIED");
    const checkpoint = await active.loadCheckpoint(grant);
    const output = await active.withCredential(scope, async token => {
      fingerprint = createHash("sha256").update(token).digest("hex");
      await assertAuthorized();
      return publishHttpImage({ grant, checkpoint, readOnly: context.attempt > 1 && !(context.attempt === 2 && !checkpoint &&
          (context.retryPolicy as { httpImagePrebuildRecovery?: { attempt: number; grantRef: string } }).httpImagePrebuildRecovery?.attempt === 2 &&
          (context.retryPolicy as { httpImagePrebuildRecovery?: { grantRef: string } }).httpImagePrebuildRecovery?.grantRef === grant.grantRef),
        ports: { ...active.createPorts(token, assertAuthorized), saveCheckpoint: async state => {
          await assertAuthorized(); await active.saveCheckpoint(grant, state);
        } } });
    });
    return { output };
  });
}
