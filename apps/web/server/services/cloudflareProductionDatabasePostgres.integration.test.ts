import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./cloudflareExecutionReadiness", () => ({ checkCloudflareExecutionReadiness: async () => ({ ready: true, reason: null }) }));
import { randomUUID } from "node:crypto";

const scope = vi.hoisted(() => ({ target: null as any }));
vi.mock("./cloudflareProductionDeploymentContract", async original => ({
  ...await original<typeof import("./cloudflareProductionDeploymentContract")>(),
  resolveCloudflareProductionDeploymentTarget: async () => scope.target,
}));
vi.mock("./cloudflareCredentialCenter", async original => ({
  ...await original<typeof import("./cloudflareCredentialCenter")>(),
  getCloudflareDeploymentCredentialState: async () => ({ status: "CONFIGURED" }),
}));

const suite = process.env.RUN_CLOUDFLARE_PRODUCTION_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("Production DB dispatch and same-job recovery in disposable PostgreSQL", () => {
  let disposable: Awaited<ReturnType<typeof import("./__tests__/support/spec277DisposablePostgres").createSpec277DisposablePostgres>>;
  let client: import("postgres").Sql;
  let original: Record<string, string | undefined>;
  let closeDb: typeof import("../db").closeDb;
  beforeEach(async () => {
    original = { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: process.env.NODE_ENV, LLM_ENCRYPTION_KEY: process.env.LLM_ENCRYPTION_KEY };
    disposable = await (await import("./__tests__/support/spec277DisposablePostgres")).createSpec277DisposablePostgres();
    process.env.DATABASE_URL = disposable.databaseUrl;
    process.env.NODE_ENV = "test";
    process.env.LLM_ENCRYPTION_KEY = "production-db-disposable-fixture-only";
    (await import("prom-client")).register.clear();
    vi.resetModules();
    client = (await import("postgres")).default(disposable.databaseUrl, { max: 2 });
    const schema = await import("../../drizzle/schema");
    await (await import("./__tests__/support/spec277AutoTeamRuntimeSchema")).installSpec277AutoTeamRuntimeSchema(client, [
      schema.systemSettings, schema.users, schema.tenants, schema.tenantDataTransferPlans, schema.tenantIdentityActions, schema.workerJobActions,
      schema.providerDeploymentCredentials,
    ]);
    // Only the intake columns used by the production role are required here;
    // no geospatial workload or PostGIS dependency belongs to this dispatch proof.
    await client.unsafe(`CREATE TABLE emergency_reports (id text PRIMARY KEY,"tenantId" text,"workerJobId" text,status text,"updatedAt" timestamptz);
      CREATE TABLE emergency_cases (id text PRIMARY KEY,"tenantId" text,"reportId" text,revision integer,"caseContextJson" jsonb,"updatedAt" timestamptz);
      CREATE TABLE emergency_case_events ("tenantId" text,"caseId" text,"eventIdempotencyKey" text,"actorType" text,"actorRef" text,
        "eventType" text,reason text,revision integer,"previousHash" text,"eventHash" text,"payloadJson" jsonb,"createdAt" timestamptz)`);
    await client`INSERT INTO users(id,"openId",role) VALUES (17,'production-db-isolated-owner','admin')`;
    ({ closeDb } = await import("../db"));
  }, 30_000);
  afterEach(async () => {
    if (closeDb) await closeDb();
    if (client) await client.end({ timeout: 5 });
    if (disposable) await disposable.close();
    for (const [key, value] of Object.entries(original ?? {})) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }, 20_000);

  it.each([false, true, "provider"])("executes real recovery, credentials and role SQL; recover corrected guard failure: %s", async recoverGuardFailure => {
    const { getDb } = await import("../db");
    const db = getDb();
    const executorModule = await import("./cloudflareProductionDatabaseExecutor");
    const { createJobControlPlane } = await import("./jobControlPlane");
    const { publishJobOutboxRow } = await import("./jobOutboxPublisher");
    const { PostgresPullJobTransportAdapter } = await import("./jobTransportAdapters");
    const { JobExecutorRegistry, defaultJobExecutorRegistry } = await import("./jobExecutorRegistry");
    const { POSTGRES_NODE_JOB_TYPES } = await import("../jobs/feature186JobTypes");
    const { executeCanonicalJobEnvelope } = await import("../jobs/unifiedJobConsumer");
    const { infrastructureRouter } = await import("../routers/infrastructure");
    const { encrypt } = await import("./crypto");
    const jobId = randomUUID(), tunnelId = randomUUID(), tenantId = "tenant-production-db-fixture", projectId = randomUUID();
    const plan = { tunnelId, databaseHostname: "db.smartaihub.app" as const, databaseName: disposable.database,
      databaseUser: `sah_cf_prod_${jobId.replaceAll("-", "").slice(0, 12)}`, vpcTcpPort: 5433 as const, connectionLimit: 5 as const, tlsVerification: "verify_full" as const };
    const identity = { tenantId, projectId, provider: "cloudflare", environment: "production" } as const;
    const { deploymentCredentialRef } = await import("./providerDeploymentTargetAuthority");
    scope.target = { tenantId, projectId, targetId: "smartspec-cloudflare-runtime", workerRef: "smartspec-cloudflare-runtime",
      accountRef: "a".repeat(32), credentialRef: deploymentCredentialRef(identity), environment: "production", enabled: true };
    const { saveCloudflareDeploymentCredential } = await import("./cloudflareCredentialCenter");
    await saveCloudflareDeploymentCredential(db, { identity, token: "isolated-provider-fixture-token", actorUserId: 17 });
    const { grant, databasePassword } = executorModule.createProductionDatabaseGrant({ jobId, tenantId, projectId,
      requesterUserId: 17, accountRef: scope.target.accountRef, plan });
    await executorModule.saveCloudflareProductionDatabaseGrant(db, grant, databasePassword);
    const controlPlane = createJobControlPlane();
    const jobType = executorModule.CLOUDFLARE_PRODUCTION_DATABASE_JOB;
    const contractVersion = executorModule.CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT;
    expect(POSTGRES_NODE_JOB_TYPES.has(jobType)).toBe(true);
    expect(defaultJobExecutorRegistry.resolve(jobType, contractVersion)).toBeDefined();
    await controlPlane.create({ contractVersion, tenantId, requestedByUserId: 17, jobType, executionClass: "long",
      input: { contractVersion, projectId, targetId: scope.target.targetId, environment: "production", grantRef: grant.grantRef, planDigest: grant.planDigest },
      idempotencyKey: `production-db-fixture:${jobId}`, retryPolicy: { maxAttempts: 2, baseDelayMs: 2000, maxDelayMs: 5000,
        jitter: "bounded", deadlineMs: 600000, deadlineMode: "fixed", allowedErrorClasses: ["retryable"] },
      timeoutPolicy: { softTimeoutMs: 30000, hardTimeoutMs: 720000 } }, { canonicalJobId: jobId, runtimeType: "node_job_worker" });
    const [originalOutbox] = await client`SELECT id FROM worker_job_outbox WHERE "workerJobId"=${jobId}`;
    await publishJobOutboxRow(originalOutbox.id, new PostgresPullJobTransportAdapter(new Set()));
    // Time passage is simulated only inside this disposable cluster.
    await client`UPDATE worker_jobs SET "createdAt"=now()-interval '5 days' WHERE id=${jobId}`;
    await expect(controlPlane.expireDeadline(jobId, new Date())).resolves.toBe("expired");
    const expiredGrant = { ...grant, expiresAt: new Date(Date.now() - 60000).toISOString() };
    await client`UPDATE system_settings SET value=${encrypt(JSON.stringify({ grant: expiredGrant, databasePassword }))}
      WHERE category='cloudflare_production_database_grants' AND key=${jobId}`;
    const [oldOutbox] = await client`SELECT "failedReason","cancelledAt","quarantinedAt" FROM worker_job_outbox WHERE id=${originalOutbox.id}`;
    expect(oldOutbox.failedReason).toBe("expired:job_deadline");
    expect(oldOutbox.quarantinedAt).not.toBeNull();
    const caller = infrastructureRouter.createCaller({ user: { id: 17, role: "admin", currentTenantId: tenantId }, tenantId,
      req: { requestId: "disposable-production-db-recovery" } } as any);
    await expect(caller.resumeExpiredCloudflareProductionDatabaseJob({ tenantId, projectId, environment: "production", jobId, tunnelId }))
      .resolves.toMatchObject({ jobId, attempt: 2, status: "queued" });
    await expect(controlPlane.expireDeadline(jobId, new Date())).resolves.toBe("ignored");
    const renewed = await executorModule.readCloudflareProductionDatabaseGrant(db, jobId);
    expect(renewed).toMatchObject({ jobId, grantRef: jobId, planDigest: grant.planDigest });
    let [outbox] = await client`SELECT * FROM worker_job_outbox WHERE "workerJobId"=${jobId} AND id<>${originalOutbox.id}`;
    await expect(publishJobOutboxRow(outbox.id, new PostgresPullJobTransportAdapter())).resolves.toMatchObject({ state: "published" });
    let service: any, hyperdrive: any;
    let rejectHyperdrive = recoverGuardFailure === "provider";
    const providerWrites: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      let result: any;
      if (init?.method === "POST") {
        providerWrites.push(path);
        const body = JSON.parse(String(init.body));
        if (path.endsWith("/services")) result = service = { ...body, service_id: randomUUID() };
        else if (path.endsWith("/configs")) {
          if (rejectHyperdrive) {
            rejectHyperdrive = false;
            return new Response(JSON.stringify({ success: false, errors: [{ code: 2015, message: "Generic connection failure" }] }), { status: 400 });
          }
          result = hyperdrive = { ...body, id: "b".repeat(32) };
        }
        else throw new Error("UNEXPECTED_FIXTURE_PROVIDER_WRITE");
      } else if (path.endsWith(tunnelId)) result = { id: tunnelId, status: "healthy" };
      else if (path.endsWith("/services")) result = service ? [service] : [];
      else if (path.endsWith("/configs")) result = hyperdrive ? [hyperdrive] : [];
      else if (service && path.endsWith(service.service_id)) result = service;
      else if (hyperdrive && path.endsWith(hyperdrive.id)) result = hyperdrive;
      else throw new Error("UNEXPECTED_FIXTURE_PROVIDER_READ");
      return new Response(JSON.stringify({ success: true, result }), { status: 200 });
    });
    const runtime = executorModule.createCloudflareProductionDatabaseRuntime({ db, fetchImpl });
    const registry = new JobExecutorRegistry();
    registry.register({ jobType, executionClass: "long", contractVersions: new Set([contractVersion]),
      executor: executorModule.createCloudflareProductionDatabaseExecutor(runtime) });
    if (recoverGuardFailure) {
      const fixedCredential = runtime.withCredential.bind(runtime);
      runtime.withCredential = async (...args) => {
        const result = await fixedCredential(...args);
        if (result === undefined) throw new executorModule.CloudflareProductionDatabaseJobError("CLOUDFLARE_PRODUCTION_DATABASE_CREDENTIAL_UNAVAILABLE");
        return result;
      };
      await expect(executeCanonicalJobEnvelope(outbox.envelopeJson, { controlPlane, executorRegistry: registry,
        runnerId: "old-guard-fixture", adapter: "postgres-pull" })).rejects.toThrow("CLOUDFLARE_PRODUCTION_DATABASE_CREDENTIAL_UNAVAILABLE");
      expect(providerWrites).toHaveLength(0);
      expect((await client`SELECT id FROM system_settings WHERE category='cloudflare_production_database_runs' AND key=${jobId}`).length).toBe(0);
      await expect(caller.resumeExpiredCloudflareProductionDatabaseJob({ tenantId, projectId, environment: "production", jobId, tunnelId }))
        .rejects.toMatchObject({ message: "CLOUDFLARE_PRODUCTION_DATABASE_JOB_NOT_RECOVERABLE" });
      await expect(caller.resumeExpiredCloudflareProductionDatabaseJob({ tenantId, projectId, environment: "production", jobId, tunnelId,
        authorizeAdditionalAttempt: true })).resolves.toMatchObject({ jobId, attempt: 3, status: "queued" });
      await expect(controlPlane.expireDeadline(jobId, new Date())).resolves.toBe("ignored");
      [outbox] = await client`SELECT * FROM worker_job_outbox WHERE "workerJobId"=${jobId} AND "publishedAt" IS NULL AND "cancelledAt" IS NULL`;
      await publishJobOutboxRow(outbox.id, new PostgresPullJobTransportAdapter());
      runtime.withCredential = fixedCredential;
    }
    if (recoverGuardFailure === "provider") {
      await expect(executeCanonicalJobEnvelope(outbox.envelopeJson, { controlPlane, executorRegistry: registry,
        runnerId: "provider-rejection-worker", adapter: "postgres-pull" })).rejects.toThrow("CLOUDFLARE_PRODUCTION_DATABASE_HTTP_400_CF_2015");
      const checkpoint = await runtime.checkpoint(jobId, 17, grant.planDigest);
      expect(checkpoint).toMatchObject({ pending: "hyperdrive", vpcServiceId: service.service_id });
      const before = await runtime.resolveGrant(jobId);
      const { inspectProductionDatabaseRecovery } = await import("./cloudflareProductionDatabaseRecovery");
      const readback = await inspectProductionDatabaseRecovery({ runtime, jobId, tenantId, projectId, requesterUserId: 17, planDigest: grant.planDigest });
      expect(readback).toMatchObject({ vpcServiceId: service.service_id, providerReadbackVerified: true, databaseConnectionVerified: false });
      await expect(caller.resumeExpiredCloudflareProductionDatabaseJob({ tenantId, projectId, environment: "production", jobId, tunnelId }))
        .rejects.toMatchObject({ message: "CLOUDFLARE_PRODUCTION_DATABASE_JOB_NOT_RECOVERABLE" });
      // The live router uses the same credential port; only provider HTTP is
      // substituted here. The grant, checkpoint, admission and SQL are real PG.
      const realFactory = executorModule.createCloudflareProductionDatabaseRuntime;
      const spy = vi.spyOn(executorModule, "createCloudflareProductionDatabaseRuntime").mockImplementation(options => realFactory({ ...options, fetchImpl }));
      try {
        await expect(caller.resumeExpiredCloudflareProductionDatabaseJob({ tenantId, projectId, environment: "production", jobId, tunnelId,
          authorizeAdditionalAttempt: true })).resolves.toMatchObject({ jobId, attempt: 4, status: "queued" });
        // Response loss reuses the accepted canonical attempt and grant.
        await expect(caller.resumeExpiredCloudflareProductionDatabaseJob({ tenantId, projectId, environment: "production", jobId, tunnelId,
          authorizeAdditionalAttempt: true })).resolves.toMatchObject({ jobId, attempt: 4, status: "queued" });
        expect((await client`SELECT count(*)::int AS n FROM worker_job_outbox WHERE "workerJobId"=${jobId} AND "publishedAt" IS NULL AND "cancelledAt" IS NULL`)[0].n).toBe(1);
      } finally { spy.mockRestore(); }
      expect((await runtime.resolveGrant(jobId))!.databasePassword).toBe(before!.databasePassword);
      expect(await runtime.checkpoint(jobId, 17, grant.planDigest)).toEqual(checkpoint);
      [outbox] = await client`SELECT * FROM worker_job_outbox WHERE "workerJobId"=${jobId} AND "publishedAt" IS NULL AND "cancelledAt" IS NULL`;
      await publishJobOutboxRow(outbox.id, new PostgresPullJobTransportAdapter());
    }
    await expect(executeCanonicalJobEnvelope(outbox.envelopeJson, { controlPlane, executorRegistry: registry,
      runnerId: "production-db-isolated-worker", adapter: "postgres-pull" })).resolves.toMatchObject({ state: "succeeded", jobId });
    const [completed] = await client`SELECT status,attempt,"fencingVersion","outputJson","createdAt" FROM worker_jobs WHERE id=${jobId}`;
    expect(completed).toMatchObject({ status: "succeeded", attempt: recoverGuardFailure === "provider" ? 4 : recoverGuardFailure ? 3 : 2, fencingVersion: recoverGuardFailure === "provider" ? 3 : recoverGuardFailure ? 2 : 1,
      outputJson: { providerConfigurationVerified: true, runtimeRolePrepared: true, databaseConnectionVerified: false } });
    expect(new Date(completed.createdAt).getTime()).toBeLessThan(Date.now() - 4 * 86400_000);
    expect(providerWrites).toHaveLength(recoverGuardFailure === "provider" ? 3 : 2);
    await expect(executeCanonicalJobEnvelope(outbox.envelopeJson, { controlPlane, executorRegistry: registry,
      runnerId: "duplicate-delivery", adapter: "postgres-pull" })).resolves.toMatchObject({ state: "ignored" });
    expect(providerWrites).toHaveLength(recoverGuardFailure === "provider" ? 3 : 2);
    expect((await client`SELECT count(*)::int AS n FROM worker_jobs WHERE "jobType"=${jobType}`)[0].n).toBe(1);
    const readerUrl = new URL(disposable.databaseUrl); readerUrl.username = plan.databaseUser; readerUrl.password = databasePassword;
    const reader = (await import("postgres")).default(readerUrl.toString(), { max: 1 });
    try {
      await expect(reader`SELECT 1 AS ok`).resolves.toMatchObject([{ ok: 1 }]);
      await expect(reader`SELECT id FROM worker_jobs`).rejects.toMatchObject({ code: "42501" });
      await expect(reader.begin(async tx => { await tx`SELECT 1`; throw new Error("ROLLBACK_FIXTURE"); })).rejects.toThrow("ROLLBACK_FIXTURE");
      await expect(reader`SELECT 2 AS ok`).resolves.toMatchObject([{ ok: 2 }]);
      // Exercise the installed SECURITY DEFINER fence under the restricted
      // login: matching tenant + canonical lease succeeds; foreign/stale scope fails.
      const intakeInput = { reportId: "isolated-intake-report" };
      const intake = await controlPlane.create({ contractVersion: "feature-186-v1", tenantId, requestedByUserId: 17,
        jobType: "emergency.report.intake", executionClass: "short", input: intakeInput,
        retryPolicy: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitter: "none", deadlineMs: 600000,
          deadlineMode: "fixed", allowedErrorClasses: [] }, timeoutPolicy: { softTimeoutMs: 0, hardTimeoutMs: 600000 } });
      const [intakeOutbox] = await client`SELECT * FROM worker_job_outbox WHERE "workerJobId"=${intake.jobId}`;
      await publishJobOutboxRow(intakeOutbox.id, new PostgresPullJobTransportAdapter());
      const lease = await controlPlane.claim({ jobId: intake.jobId, runnerId: "tenant-fence-fixture", adapter: "postgres-pull" });
      expect(lease).not.toBeNull(); await controlPlane.start(lease!);
      const [intakeJob] = await client`SELECT "leaseOwnerToken","fencingVersion" FROM worker_jobs WHERE id=${intake.jobId}`;
      for (const [scopeTenant, fence, expected] of [[tenantId, intakeJob.fencingVersion, true],
        ["another-tenant", intakeJob.fencingVersion, false], [tenantId, intakeJob.fencingVersion + 1, false]] as const) {
        const [result] = await reader`SELECT public.cloudflare_validate_emergency_intake_v1(${intake.jobId},${scopeTenant},
          ${1},${lease!.attemptId},${fence},${intakeJob.leaseOwnerToken},${intakeOutbox.id},${intakeOutbox.dedupeKey},
          ${reader.json(intakeInput)},'postgres-pull') AS allowed`;
        expect(result.allowed).toBe(expected);
      }
    } finally { await reader.end({ timeout: 2 }); }
  }, 30_000);
});
