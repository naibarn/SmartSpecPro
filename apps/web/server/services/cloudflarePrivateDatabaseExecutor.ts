import { reusePublicCatalogCheckpoint, preparePublicCatalogView } from "./cloudflarePublicCatalogAccess";
import { createHash, randomBytes, X509Certificate } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, type DrizzleDB } from "../db";
import { systemSettings, workerJobs } from "../../drizzle/schema";
import { encrypt, decrypt } from "./crypto";
import type { DeploymentTargetIdentity } from "./providerDeploymentTargetAuthority";
import { createCloudflareNativeProvisionRuntime, nativeProvisionCredentialRef } from "./cloudflareNativeProvisionExecutor";
import { createCloudflareStagingExecutorProof, verifyCloudflareStagingExecutorProof, type CloudflareStagingExecutorAttemptBinding } from "./cloudflareStagingExecutorIdentityService";
import { getEffectiveWorkerJobDeadlineMs } from "./workerJobDeadlinePolicy";
import type { JobExecutor } from "./jobExecutor";
import { PRIVATE_DATABASE_CONTRACT, PRIVATE_DATABASE_JOB, certificateDigest, privateDatabaseGrantSchema,
  privateDatabaseJobSchema, privateDatabasePlanSchema, privateDatabasePlanDigest, privateDatabaseRole,
  type PrivateDatabaseGrant, type PrivateDatabasePlan } from "./cloudflarePrivateDatabaseContract";
import { PrivateDatabaseError, privateDatabaseCheckpointSchema, provisionCloudflarePrivateDatabase, type PrivateDatabaseCheckpoint } from "./cloudflarePrivateDatabaseTransport";

const inputKey = (scope: DeploymentTargetIdentity, digest: string) =>
  createHash("sha256").update(`${nativeProvisionCredentialRef(scope)}|${digest}`).digest("hex");

/** Server-only certificate input. Database/API credentials never enter job input/output. */
export async function savePrivateDatabaseCertificate(db: DrizzleDB, input: {
  identity: DeploymentTargetIdentity; actorUserId: number; plan: PrivateDatabasePlan; caCertificate: string;
}) {
  const plan = privateDatabasePlanSchema.parse(input.plan), digest = privateDatabasePlanDigest(plan);
  const cert = new X509Certificate(input.caCertificate);
  if (!cert.ca || certificateDigest(cert.raw) !== plan.caSha256 || !Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0)
    throw new PrivateDatabaseError("PRIVATE_DATABASE_CERTIFICATE_INPUT_DENIED");
  const key = inputKey(input.identity, digest);
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
    const where = and(eq(systemSettings.category, "cloudflare_private_database_inputs"), eq(systemSettings.key, key));
    const rows = await tx.select().from(systemSettings).where(where).limit(2);
    if (rows.length > 1 || rows[0] && rows[0].updatedBy !== input.actorUserId) throw new PrivateDatabaseError("PRIVATE_DATABASE_CERTIFICATE_INPUT_DENIED");
    const value = encrypt(JSON.stringify({ ...input.identity, actorUserId: input.actorUserId, planDigest: digest, caCertificate: input.caCertificate }));
    if (rows[0]) await tx.update(systemSettings).set({ value, isSensitive: true, valueJson: null, updatedBy: input.actorUserId, updatedAt: new Date() }).where(eq(systemSettings.id, rows[0].id));
    else await tx.insert(systemSettings).values({ category: "cloudflare_private_database_inputs", key, value, isSensitive: true,
      updatedBy: input.actorUserId, description: "Pinned private PostgreSQL CA for exact staging connection plan" });
  });
}

type Runtime = {
  resolveGrant(ref: string): Promise<unknown>;
  resolveAccount(scope: DeploymentTargetIdentity): Promise<string | null>;
  withCredential<T>(scope: DeploymentTargetIdentity, operation: (token: string) => Promise<T>): Promise<T>;
  verifyExecutor(grant: PrivateDatabaseGrant): Promise<string>;
  certificate(grant: PrivateDatabaseGrant): Promise<string>;
  prepareDatabase(grant: PrivateDatabaseGrant): Promise<void>;
  loadCheckpoint(grant: PrivateDatabaseGrant): Promise<PrivateDatabaseCheckpoint>;
  saveCheckpoint(grant: PrivateDatabaseGrant, checkpoint: PrivateDatabaseCheckpoint): Promise<void>;
  continueCheckpoint?(grant: PrivateDatabaseGrant, sourceJobId: string): Promise<void>;
  fetchImpl?: typeof fetch;
};

export function createCloudflarePrivateDatabaseRuntime(options: { fetchImpl?: typeof fetch } = {}): Runtime {
  const native = createCloudflareNativeProvisionRuntime(options), db = getDb();
  const where = (g: PrivateDatabaseGrant) => and(eq(systemSettings.category, "cloudflare_private_database_runs"), eq(systemSettings.key, g.jobId));
  async function load(store: any, g: PrivateDatabaseGrant): Promise<PrivateDatabaseCheckpoint> {
    const rows = await store.select().from(systemSettings).where(where(g)).limit(2);
    if (!rows.length) return { planDigest: g.planDigest };
    if (rows.length !== 1 || !rows[0].isSensitive || !rows[0].value || rows[0].updatedBy !== g.requesterUserId) throw new PrivateDatabaseError("PRIVATE_DATABASE_CHECKPOINT_DENIED");
    let state: PrivateDatabaseCheckpoint;
    try { state = privateDatabaseCheckpointSchema.parse(JSON.parse(decrypt(rows[0].value))); }
    catch { throw new PrivateDatabaseError("PRIVATE_DATABASE_CHECKPOINT_DENIED"); }
    if (state.planDigest !== g.planDigest) throw new PrivateDatabaseError("PRIVATE_DATABASE_CHECKPOINT_DENIED");
    return state;
  }
  async function save(store: any, g: PrivateDatabaseGrant, checkpoint: PrivateDatabaseCheckpoint) {
    await load(store, g);
    if (checkpoint.planDigest !== g.planDigest) throw new PrivateDatabaseError("PRIVATE_DATABASE_CHECKPOINT_DENIED");
    const value = encrypt(JSON.stringify(privateDatabaseCheckpointSchema.parse(checkpoint)));
    const rows = await store.select({ id: systemSettings.id }).from(systemSettings).where(where(g));
    if (rows[0]) await store.update(systemSettings).set({ value, valueJson: null, isSensitive: true, updatedBy: g.requesterUserId, updatedAt: new Date() }).where(eq(systemSettings.id, rows[0].id));
    else await store.insert(systemSettings).values({ category: "cloudflare_private_database_runs", key: g.jobId, value,
      isSensitive: true, updatedBy: g.requesterUserId, description: "Encrypted canonical private database provisioning progress" });
  }
  return {
    resolveGrant: native.resolveGrant, resolveAccount: native.resolveAccount, withCredential: native.withCredential, fetchImpl: options.fetchImpl,
    async verifyExecutor(g) {
      const binding: CloudflareStagingExecutorAttemptBinding = { jobId: g.jobId, tenantId: g.tenantId, target: g.targetId,
        artifactSha256: g.planDigest, action: "provision", provisionContract: PRIVATE_DATABASE_CONTRACT,
        idempotencyKey: `cloudflare-private-database:${g.jobId}`,
        provisionAuthority: { projectId: g.projectId, grantRef: g.grantRef, accountRef: g.accountRef, planDigest: g.planDigest } };
      return (await verifyCloudflareStagingExecutorProof(await createCloudflareStagingExecutorProof(binding), { expectedBinding: binding })).executorId;
    },
    async certificate(g) {
      const scope = { tenantId: g.tenantId, projectId: g.projectId, provider: "cloudflare", environment: "staging" };
      const rows = await db.select().from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_private_database_inputs"), eq(systemSettings.key, inputKey(scope, g.planDigest)))).limit(2);
      if (rows.length !== 1 || !rows[0].isSensitive || rows[0].updatedBy !== g.requesterUserId || !rows[0].value) throw new PrivateDatabaseError("PRIVATE_DATABASE_CERTIFICATE_INPUT_DENIED");
      let value: any;
      try { value = JSON.parse(decrypt(rows[0].value)); } catch { throw new PrivateDatabaseError("PRIVATE_DATABASE_CERTIFICATE_INPUT_DENIED"); }
      if (value.tenantId !== g.tenantId || value.projectId !== g.projectId || value.actorUserId !== g.requesterUserId
        || value.environment !== "staging" || value.provider !== "cloudflare" || value.planDigest !== g.planDigest) throw new PrivateDatabaseError("PRIVATE_DATABASE_CERTIFICATE_INPUT_DENIED");
      return value.caCertificate;
    },
    async loadCheckpoint(g) { return load(db, g); },
    async saveCheckpoint(g, checkpoint) {
      await db.transaction(async tx => { await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${g.jobId}))`); await save(tx, g, checkpoint); });
    },
    async continueCheckpoint(g, sourceJobId) {
      // A new bounded grant/job may receive the exact failed job's encrypted
      // state once. Never reset its deadline, silently adopt resources or chain
      // continuations. Lock the source before the destination in every caller.
      if (sourceJobId === g.jobId) throw new PrivateDatabaseError("PRIVATE_DATABASE_CONTINUATION_DENIED");
      await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${sourceJobId}))`);
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${g.jobId}))`);
        const [source] = await tx.select().from(workerJobs).where(eq(workerJobs.id, sourceJobId)).for("update");
        const [target] = await tx.select().from(workerJobs).where(eq(workerJobs.id, g.jobId)).for("update");
        const sourceInput = privateDatabaseJobSchema.safeParse(source?.inputJson);
        const targetInput = privateDatabaseJobSchema.safeParse(target?.inputJson);
        if (!source || !target || !sourceInput.success || !targetInput.success
          || source.jobType !== PRIVATE_DATABASE_JOB || target.jobType !== PRIVATE_DATABASE_JOB
          || source.contractVersion !== PRIVATE_DATABASE_CONTRACT || target.contractVersion !== PRIVATE_DATABASE_CONTRACT
          || source.tenantId !== g.tenantId || target.tenantId !== g.tenantId
          || source.requestedByUserId !== g.requesterUserId || target.requestedByUserId !== g.requesterUserId
          || sourceInput.data.projectId !== g.projectId || targetInput.data.projectId !== g.projectId
          || sourceInput.data.planDigest !== g.planDigest || targetInput.data.planDigest !== g.planDigest
          || sourceInput.data.resumeFromJobId || targetInput.data.resumeFromJobId !== sourceJobId
          || targetInput.data.grantRef !== g.grantRef || source.status !== "failed"
          || source.errorCode !== "PRIVATE_DATABASE_DNS_NOT_READY" || source.outputJson || source.leaseOwnerToken
          || source.createdAt.getTime() + getEffectiveWorkerJobDeadlineMs({ ...source, input: source.inputJson, retryPolicy: source.retryPolicyJson }) > Date.now()
          || !["leased", "running"].includes(target.status) || !target.leaseOwnerToken
          || !target.leaseExpiresAt || target.leaseExpiresAt.getTime() <= Date.now()
          || Date.parse(g.expiresAt) <= Date.now()) throw new PrivateDatabaseError("PRIVATE_DATABASE_CONTINUATION_DENIED");
        const sourceGrant = { ...g, jobId: sourceJobId };
        const oldState = await load(tx, sourceGrant), current = await load(tx, g);
        if (oldState.pending || oldState.hyperdriveId || oldState.resumedFromJobId
          || oldState.continuedByJobId && oldState.continuedByJobId !== g.jobId
          || !oldState.databaseRolePrepared || !oldState.databasePassword || !oldState.caId || !oldState.appId
          || !oldState.policyId || !oldState.dnsRecordId || !oldState.serviceToken
          || Date.parse(oldState.serviceToken.expiresAt) < Date.parse(g.plan.configurationExpiresAt))
          throw new PrivateDatabaseError("PRIVATE_DATABASE_CONTINUATION_DENIED");
        if (current.resumedFromJobId === sourceJobId && oldState.continuedByJobId === g.jobId) return;
        if (Object.keys(current).length !== 1 || oldState.continuedByJobId)
          throw new PrivateDatabaseError("PRIVATE_DATABASE_CONTINUATION_DENIED");
        await save(tx, sourceGrant, { ...oldState, continuedByJobId: g.jobId });
        await save(tx, g, { ...oldState, resumedFromJobId: sourceJobId });
      });
    },
    async prepareDatabase(g) {
      try {
        await db.transaction(async tx => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${g.jobId}))`);
          let state = await load(tx, g);
          const role = privateDatabaseRole(g.plan.namespace);
          if (g.plan.publicRunnerCatalogSourceJobId && !state.databaseRolePrepared) state = await reusePublicCatalogCheckpoint(tx, g, load);
          if (state.continuedByJobId) throw new PrivateDatabaseError("PRIVATE_DATABASE_CHECKPOINT_CONTINUED");
          const current: any = await tx.execute(sql`SELECT current_database() AS name`);
          if (current[0]?.name !== g.plan.databaseName) throw new PrivateDatabaseError("PRIVATE_DATABASE_LOCAL_SCOPE_DENIED");
          const roles: any = await tx.execute(sql`SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolcanlogin, rolconnlimit, rolconfig, rolvaliduntil FROM pg_roles WHERE rolname=${role}`);
          if (state.databaseRolePrepared) {
            const r = roles[0];
            if (!r || r.rolsuper || r.rolcreaterole || r.rolcreatedb || r.rolreplication || r.rolbypassrls || !r.rolcanlogin || r.rolconnlimit !== 5
              || !r.rolconfig?.includes("default_transaction_read_only=on") || new Date(r.rolvaliduntil).getTime() !== Date.parse(g.plan.configurationExpiresAt)) throw new PrivateDatabaseError("PRIVATE_DATABASE_ROLE_DRIFT");
            if (g.plan.publicRunnerCatalogSourceJobId) {
              state = await preparePublicCatalogView(tx, g, state, role);
              await save(tx, g, state);
            }
            return;
          }
          if (roles.length) throw new PrivateDatabaseError("PRIVATE_DATABASE_EXISTING_ROLE_REVIEW_REQUIRED");
          const password = randomBytes(48).toString("base64url");
          // These DDL statements cannot bind identifiers/passwords. All values
          // are generated here or strictly parsed by the exact plan schema.
          await tx.execute(sql.raw(`CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5 PASSWORD '${password}' VALID UNTIL '${g.plan.configurationExpiresAt}'`));
          await tx.execute(sql.raw(`ALTER ROLE "${role}" SET default_transaction_read_only = on`));
          await tx.execute(sql.raw(`GRANT CONNECT ON DATABASE "${g.plan.databaseName}" TO "${role}"`));
          // Role DDL and its encrypted ownership/password commit atomically.
          await save(tx, g, { ...state, databasePassword: password, databaseRolePrepared: true });
        });
      } catch (error) {
        if (error instanceof PrivateDatabaseError) throw error;
        throw new PrivateDatabaseError("PRIVATE_DATABASE_ROLE_PREPARATION_FAILED");
      }
    },
  };
}

export function createCloudflarePrivateDatabaseExecutor(runtime: Runtime | (() => Runtime) = createCloudflarePrivateDatabaseRuntime): JobExecutor {
  return async ({ context, lease, reporter, controlPlane }) => {
    if (context.jobType !== PRIVATE_DATABASE_JOB || context.contractVersion !== PRIVATE_DATABASE_CONTRACT) throw new PrivateDatabaseError("PRIVATE_DATABASE_JOB_DENIED");
    const input = privateDatabaseJobSchema.parse(context.input), active = typeof runtime === "function" ? runtime() : runtime;
    if (lease.expiresAt && (!Number.isFinite(Date.parse(lease.expiresAt)) || Date.parse(lease.expiresAt) <= Date.now()))
      throw new PrivateDatabaseError("PRIVATE_DATABASE_LEASE_EXPIRED");
    const grant = privateDatabaseGrantSchema.parse(await active.resolveGrant(input.grantRef));
    const scope = { tenantId: context.tenantId, projectId: input.projectId, provider: "cloudflare", environment: "staging" };
    let fingerprint: string | undefined, heartbeatAt = Date.now();
    const assertAuthorized = async () => {
      await reporter.assertActive(lease);
      const status = await controlPlane.getStatus(context.jobId, { tenantId: context.tenantId });
      if (!status?.lease.active || status.lease.stale || Date.parse(status.lease.expiresAt ?? "") <= Date.now()
        || !Number.isFinite(Date.parse(status.lease.expiresAt ?? "")) || status.lease.fencingVersion !== lease.fencingVersion || status.attempt !== context.attempt)
        throw new PrivateDatabaseError("PRIVATE_DATABASE_LEASE_EXPIRED");
      if (Date.now() - heartbeatAt >= 20_000) { await reporter.heartbeat(lease); heartbeatAt = Date.now(); }
      const live = privateDatabaseGrantSchema.safeParse(await active.resolveGrant(input.grantRef));
      if (!live.success || JSON.stringify(live.data) !== JSON.stringify(grant) || grant.jobId !== context.jobId || grant.tenantId !== context.tenantId
        || grant.requesterUserId !== context.requestedByUserId || grant.projectId !== input.projectId || grant.planDigest !== input.planDigest
        || Date.parse(grant.expiresAt) <= Date.now() || Date.parse(grant.plan.configurationExpiresAt) <= Date.now()
        || !Number.isFinite(Date.parse(context.createdAt)) || Date.parse(context.createdAt) + getEffectiveWorkerJobDeadlineMs({ ...context, runtimeType: "node_job_worker" }) <= Date.now()
        || await active.resolveAccount(scope) !== grant.accountRef) throw new PrivateDatabaseError("PRIVATE_DATABASE_AUTHORITY_DENIED");
      if (fingerprint && fingerprint !== await active.withCredential(scope, async token => createHash("sha256").update(token).digest("hex"))) throw new PrivateDatabaseError("PRIVATE_DATABASE_CREDENTIAL_CHANGED");
    };
    await assertAuthorized();
    if (await active.verifyExecutor(grant) !== grant.executorId) throw new PrivateDatabaseError("PRIVATE_DATABASE_EXECUTOR_DENIED");
    const caCertificate = await active.certificate(grant);
    try {
      const cert = new X509Certificate(caCertificate);
      if (!cert.ca || certificateDigest(cert.raw) !== grant.plan.caSha256 || Date.parse(cert.validFrom) > Date.now()
        || Date.parse(cert.validTo) < Date.parse(grant.plan.configurationExpiresAt)) throw Error();
    } catch { throw new PrivateDatabaseError("PRIVATE_DATABASE_CA_INVALID"); }
    // A definite pre-submission failure may resume the same bounded plan.
    // Uncertain provider writes remain fenced before any local/provider work.
    if (input.resumeFromJobId) {
      if (!active.continueCheckpoint) throw new PrivateDatabaseError("PRIVATE_DATABASE_CONTINUATION_DENIED");
      await active.continueCheckpoint(grant, input.resumeFromJobId); await assertAuthorized();
    }
    const checkpoint = await active.loadCheckpoint(grant);
    if (checkpoint.continuedByJobId) throw new PrivateDatabaseError("PRIVATE_DATABASE_CHECKPOINT_CONTINUED");
    if (checkpoint.pending)
      throw new PrivateDatabaseError("PRIVATE_DATABASE_AMBIGUOUS_WRITE_REVIEW_REQUIRED");
    await assertAuthorized(); await active.prepareDatabase(grant); await assertAuthorized();
    const output = await active.withCredential(scope, async token => {
      fingerprint = createHash("sha256").update(token).digest("hex");
      return provisionCloudflarePrivateDatabase({ grant, token, caCertificate, checkpoint: await active.loadCheckpoint(grant),
        assertAuthorized, saveCheckpoint: state => active.saveCheckpoint(grant, state), fetchImpl: active.fetchImpl,
        readOnly: Boolean(grant.plan.publicRunnerCatalogSourceJobId) });
    });
    await assertAuthorized(); await active.prepareDatabase(grant);
    return { output };
  };
}
