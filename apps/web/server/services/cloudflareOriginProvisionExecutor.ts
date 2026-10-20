import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import { getDb } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { encrypt, decrypt } from "./crypto";
import { resolveProviderDeploymentTarget, type DeploymentTargetIdentity } from "./providerDeploymentTargetAuthority";
import { getAppRuntimeConfig } from "./appRuntimeConfig";
import { saveCloudflareOriginConfiguration } from "./cloudflareOriginConfiguration";
import { createCloudflareStagingExecutorProof, verifyCloudflareStagingExecutorProof } from "./cloudflareStagingExecutorIdentityService";
import { getEffectiveWorkerJobDeadlineMs } from "./workerJobDeadlinePolicy";
import type { JobExecutor } from "./jobExecutor";
import { ORIGIN_PROVISION_CONTRACT, ORIGIN_PROVISION_JOB, originProvisionJobSchema,
  originProvisionGrantSchema, type OriginProvisionGrant } from "./cloudflareOriginProvisionContract";
import { OriginProvisionError, originProvisionCheckpointSchema, provisionCloudflareOrigin,
  type OriginProvisionCheckpoint } from "./cloudflareOriginProvisionTransport";

export function originProvisionCredentialRef(identity: DeploymentTargetIdentity) {
  if (identity.provider !== "cloudflare" || identity.environment !== "staging") throw new OriginProvisionError("ORIGIN_PROVISION_CREDENTIAL_SCOPE_DENIED");
  return `cloudflare:origin-provision:${encodeURIComponent(identity.tenantId)}:${encodeURIComponent(identity.projectId)}:staging`;
}

/** Server-only Admin setup. A distinct reference prevents use as Worker credentials. */
export async function saveCloudflareOriginProvisionCredential(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; token: string; actorUserId: number;
}) {
  const credentialRef = originProvisionCredentialRef(input.identity);
  if (!input.token || !Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0)
    throw new OriginProvisionError("ORIGIN_PROVISION_CREDENTIAL_INVALID");
  const key = createHash("sha256").update(credentialRef).digest("hex");
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${credentialRef}))`);
    const rows = await tx.select({ id: systemSettings.id }).from(systemSettings).where(and(
      eq(systemSettings.category, "cloudflare_origin_provision_credentials"), eq(systemSettings.key, key),
    )).limit(2);
    if (rows.length > 1) throw new OriginProvisionError("ORIGIN_PROVISION_CREDENTIAL_DENIED");
    const value = encrypt(JSON.stringify({ ...input.identity, credentialRef, token: input.token, revokedAt: null }));
    if (rows[0]) await tx.update(systemSettings).set({ value, isSensitive: true, valueJson: null,
      updatedBy: input.actorUserId, updatedAt: new Date() }).where(eq(systemSettings.id, rows[0].id));
    else await tx.insert(systemSettings).values({ category: "cloudflare_origin_provision_credentials", key,
      value, isSensitive: true, valueJson: null, updatedBy: input.actorUserId,
      description: "Scoped protected staging ingress credential; separate from Worker deployment" });
  });
  return { credentialRef, status: "CONFIGURED" as const };
}

type Runtime = {
  resolveGrant: (ref: string) => Promise<unknown>;
  verifyExecutor: (grant: OriginProvisionGrant) => Promise<string>;
  resolveAccount: (identity: DeploymentTargetIdentity) => Promise<string | null>;
  withCredential: <T>(identity: DeploymentTargetIdentity, operation: (token: string) => Promise<T>) => Promise<T>;
  loadCheckpoint: (grant: OriginProvisionGrant) => Promise<OriginProvisionCheckpoint | null>;
  saveCheckpoint: (grant: OriginProvisionGrant, state: OriginProvisionCheckpoint) => Promise<void>;
  saveConfiguration: (grant: OriginProvisionGrant, value: { appId: string; audience: string; token: string; clientId: string; secret: string }) => Promise<{ configurationRef: string; configurationDigest: string }>;
  fetchImpl?: typeof fetch;
};

export function createCloudflareOriginProvisionRuntime(options: { fetchImpl?: typeof fetch } = {}): Runtime {
  const db = getDb();
  const fetchImpl = options.fetchImpl ?? fetch;
  const identity = (g: OriginProvisionGrant) => ({ tenantId: g.tenantId, projectId: g.projectId, provider: "cloudflare", environment: "staging" });
  const checkpointWhere = (g: OriginProvisionGrant) => and(eq(systemSettings.category, "cloudflare_origin_provision_runs"), eq(systemSettings.key, g.jobId));
  return {
    fetchImpl,
    resolveGrant: async ref => {
      const config = await getAppRuntimeConfig();
      if (!config.webGatewayToken) throw new OriginProvisionError("ORIGIN_PROVISION_AUTH_UNAVAILABLE");
      const response = await fetchImpl(`${config.pythonBackendUrl}/api/v1/approvals/internal/cloudflare-staging-grants/${encodeURIComponent(ref)}`, {
        headers: { "x-internal-token": config.webGatewayToken, Accept: "application/json" }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return null;
      return (await response.json() as { grant?: unknown }).grant;
    },
    verifyExecutor: async grant => {
      const binding = { jobId: grant.jobId, tenantId: grant.tenantId, target: grant.targetId, artifactSha256: grant.planDigest,
        action: "provision" as const, idempotencyKey: `cloudflare-origin-provision:${grant.jobId}`,
        provisionAuthority: { projectId: grant.projectId, grantRef: grant.grantRef, accountRef: grant.accountRef, planDigest: grant.planDigest } };
      const proof = await createCloudflareStagingExecutorProof(binding);
      return (await verifyCloudflareStagingExecutorProof(proof, { expectedBinding: binding })).executorId;
    },
    resolveAccount: async scope => {
      const target = await resolveProviderDeploymentTarget(db, scope);
      return target.status === "CONFIGURED" && target.target.deploymentTargetId === "smartspec-cloudflare-staging" &&
        target.target.workerRef === "smartspec-cloudflare-staging" && !target.target.containerApplicationRef ? target.target.accountRef : null;
    },
    withCredential: async (scope, operation) => {
      const credentialRef = originProvisionCredentialRef(scope);
      const key = createHash("sha256").update(credentialRef).digest("hex");
      const rows = await db.select().from(systemSettings).where(and(
        eq(systemSettings.category, "cloudflare_origin_provision_credentials"), eq(systemSettings.key, key),
      )).limit(2);
      const row = rows[0];
      if (rows.length !== 1 || !row?.isSensitive || !row.value)
        throw new OriginProvisionError("ORIGIN_PROVISION_CREDENTIAL_DENIED");
      const credential = JSON.parse(decrypt(row.value));
      if (credential.credentialRef !== credentialRef || credential.tenantId !== scope.tenantId ||
          credential.projectId !== scope.projectId || credential.environment !== "staging" || credential.provider !== "cloudflare" ||
          credential.revokedAt !== null || typeof credential.token !== "string" || !credential.token)
        throw new OriginProvisionError("ORIGIN_PROVISION_CREDENTIAL_DENIED");
      return operation(credential.token);
    },
    loadCheckpoint: async grant => {
      const rows = await db.select().from(systemSettings).where(checkpointWhere(grant)).limit(2);
      if (!rows.length) return null;
      if (rows.length !== 1 || !rows[0]?.isSensitive || !rows[0].value || rows[0].updatedBy !== grant.requesterUserId)
        throw new OriginProvisionError("ORIGIN_PROVISION_CHECKPOINT_DENIED");
      return originProvisionCheckpointSchema.parse(JSON.parse(decrypt(rows[0].value)));
    },
    saveCheckpoint: async (grant, state) => {
      const value = encrypt(JSON.stringify(originProvisionCheckpointSchema.parse(state)));
      const rows = await db.select({ id: systemSettings.id }).from(systemSettings).where(checkpointWhere(grant)).limit(2);
      if (rows.length > 1) throw new OriginProvisionError("ORIGIN_PROVISION_CHECKPOINT_DENIED");
      if (rows[0]) await db.update(systemSettings).set({ value, isSensitive: true, valueJson: null,
        updatedBy: grant.requesterUserId, updatedAt: new Date() }).where(eq(systemSettings.id, rows[0].id));
      else await db.insert(systemSettings).values({ category: "cloudflare_origin_provision_runs", key: grant.jobId,
        value, isSensitive: true, valueJson: null, updatedBy: grant.requesterUserId,
        description: "Encrypted exact staging ingress progress; secrets excluded from job output" });
    },
    saveConfiguration: async (grant, value) => {
      const saved = await saveCloudflareOriginConfiguration(db, {
      identity: identity(grant), actorUserId: grant.requesterUserId,
      settings: { origin: `https://${grant.plan.hostname}`, allowedPublicOrigins: [grant.plan.publicOrigin],
        accessApplicationId: value.appId, accessAudience: value.audience, accessTeamName: grant.plan.teamName,
        expiresAt: grant.plan.configurationExpiresAt },
      secrets: { token: value.token, clientId: value.clientId, secret: value.secret },
      });
      return { configurationRef: saved.configurationRef, configurationDigest: saved.configurationDigest };
    },
  };
}

/** One canonical job owns the four writes; no provider action runs at admission. */
export function createCloudflareOriginProvisionExecutor(runtime: Runtime | (() => Runtime) = createCloudflareOriginProvisionRuntime): JobExecutor {
  return async ({ context, lease, reporter }) => {
    if (context.jobType !== ORIGIN_PROVISION_JOB || context.contractVersion !== ORIGIN_PROVISION_CONTRACT)
      throw new OriginProvisionError("ORIGIN_PROVISION_JOB_INVALID");
    const job = originProvisionJobSchema.parse(context.input);
    const active = typeof runtime === "function" ? runtime() : runtime;
    const grant = originProvisionGrantSchema.parse(await active.resolveGrant(job.grantRef));
    const scope = { tenantId: context.tenantId, projectId: job.projectId, provider: "cloudflare", environment: "staging" };
    let credentialFingerprint: string | undefined;
    const assertAuthorized = async () => {
      await reporter.assertActive(lease);
      const now = Date.now();
      if (Date.parse(grant.expiresAt) <= now || Date.parse(context.createdAt) + getEffectiveWorkerJobDeadlineMs({ ...context, runtimeType: "node_job_worker" }) <= now ||
          !Number.isFinite(Date.parse(context.createdAt)) || (lease.expiresAt && Date.parse(lease.expiresAt) <= now))
        throw new OriginProvisionError("ORIGIN_PROVISION_AUTHORITY_EXPIRED");
      const live = originProvisionGrantSchema.safeParse(await active.resolveGrant(job.grantRef));
      if (!live.success || JSON.stringify(live.data) !== JSON.stringify(grant) || grant.jobId !== context.jobId ||
          grant.tenantId !== context.tenantId || grant.requesterUserId !== context.requestedByUserId ||
          grant.projectId !== job.projectId || grant.planDigest !== job.planDigest ||
          await active.resolveAccount(scope) !== grant.accountRef)
        throw new OriginProvisionError("ORIGIN_PROVISION_AUTHORITY_DENIED");
      if (credentialFingerprint !== undefined && await active.withCredential(scope,
        async token => createHash("sha256").update(token).digest("hex")) !== credentialFingerprint)
        throw new OriginProvisionError("ORIGIN_PROVISION_CREDENTIAL_CHANGED");
    };
    await assertAuthorized();
    if (await active.verifyExecutor(grant) !== grant.executorId) throw new OriginProvisionError("ORIGIN_PROVISION_EXECUTOR_DENIED");
    const checkpoint = await active.loadCheckpoint(grant) ?? { planDigest: grant.planDigest };
    const output = await active.withCredential(scope, token => {
      credentialFingerprint = createHash("sha256").update(token).digest("hex");
      return provisionCloudflareOrigin({ grant, token, checkpoint,
      assertAuthorized, fetchImpl: active.fetchImpl,
      saveCheckpoint: async state => { await reporter.assertActive(lease); await active.saveCheckpoint(grant, state); },
      saveConfiguration: value => active.saveConfiguration(grant, value),
      });
    });
    return { output };
  };
}
