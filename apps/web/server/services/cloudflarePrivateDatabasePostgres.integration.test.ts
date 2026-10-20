import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { nativeProvisionNamespace } from "./cloudflareNativeProvisionContract";
import { PRIVATE_DATABASE_CONTRACT, PRIVATE_DATABASE_JOB, PRIVATE_DATABASE_GRANT, privateDatabaseRole, privateDatabasePlanDigest, type PrivateDatabaseGrant } from "./cloudflarePrivateDatabaseContract";

const suite = process.env.RUN_CLOUDFLARE_STAGING_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("private staging database role atomicity in disposable PostgreSQL", () => {
  let disposable: Awaited<ReturnType<typeof import("./__tests__/support/spec277DisposablePostgres").createSpec277DisposablePostgres>>;
  let client: import("postgres").Sql;
  let runtime: ReturnType<typeof import("./cloudflarePrivateDatabaseExecutor").createCloudflarePrivateDatabaseRuntime>;
  let closeDb: typeof import("../db").closeDb;
  let original: Record<string, string | undefined>;
  beforeAll(async () => {
    original = { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: process.env.NODE_ENV, LLM_ENCRYPTION_KEY: process.env.LLM_ENCRYPTION_KEY };
    disposable = await (await import("./__tests__/support/spec277DisposablePostgres")).createSpec277DisposablePostgres();
    process.env.DATABASE_URL = disposable.databaseUrl;
    process.env.NODE_ENV = "test"; process.env.LLM_ENCRYPTION_KEY = "disposable-private-db-fixture-key-only";
    vi.resetModules();
    client = (await import("postgres")).default(disposable.databaseUrl, { max: 2 });
    const schema = await import("../../drizzle/schema");
    await (await import("./__tests__/support/spec277AutoTeamRuntimeSchema")).installSpec277AutoTeamRuntimeSchema(client, [schema.systemSettings,
      schema.users, schema.tenants, schema.tenantDataTransferPlans, schema.tenantIdentityActions]);
    await client`INSERT INTO users(id,"openId",role) VALUES (17,'private-db-disposable-fixture','admin')`;
    ({ closeDb } = await import("../db"));
    runtime = (await import("./cloudflarePrivateDatabaseExecutor")).createCloudflarePrivateDatabaseRuntime();
  }, 30_000);
  afterAll(async () => {
    if (closeDb) await closeDb();
    if (client) await client.end({ timeout: 5 });
    if (disposable) await disposable.close();
    for (const [key, value] of Object.entries(original ?? {})) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }, 20_000);
  function grant(projectId: string): PrivateDatabaseGrant {
    const plan = { namespace: nativeProvisionNamespace("tenant-fixture", projectId), hostname: "db-staging.smartaihub.app" as const,
      zoneId: "a".repeat(32), tunnelId: "11111111-1111-4111-8111-111111111111", databaseName: disposable.database,
      caSha256: "b".repeat(64), connectionLimit: 5 as const, configurationExpiresAt: new Date(Date.now() + 86400_000).toISOString() };
    return { schemaVersion: PRIVATE_DATABASE_GRANT, grantRef: randomUUID(), jobId: randomUUID(), tenantId: "tenant-fixture", projectId,
      requesterUserId: 17, executorId: "cf-staging-executor:test", targetId: "smartspec-cloudflare-staging", environment: "staging",
      accountRef: "a".repeat(32), actions: ["provision"], expiresAt: new Date(Date.now() + 3600_000).toISOString(), revokedAt: null,
      plan, planDigest: privateDatabasePlanDigest(plan) };
  }
  it("creates a non-admin role, atomically encrypts its credentials, and reuses the same owned state", async () => {
    const g = grant("owned"), role = privateDatabaseRole(g.plan.namespace);
    await runtime.prepareDatabase(g);
    const state = await runtime.loadCheckpoint(g);
    expect(state.databaseRolePrepared).toBe(true); expect(state.databasePassword?.length).toBeGreaterThanOrEqual(32);
    const [r] = await client`SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication, rolconnlimit, rolconfig FROM pg_roles WHERE rolname=${role}`;
    expect(r).toMatchObject({ rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false, rolreplication: false, rolconnlimit: 5 });
    expect(r.rolconfig).toContain("default_transaction_read_only=on");
    const [stored] = await client`SELECT value, "isSensitive", "updatedBy" FROM system_settings WHERE category='cloudflare_private_database_runs' AND key=${g.jobId}`;
    expect(stored.isSensitive).toBe(true); expect(stored.updatedBy).toBe(17); expect(stored.value).not.toContain(state.databasePassword);
    await runtime.prepareDatabase(g);
    expect((await runtime.loadCheckpoint(g)).databasePassword).toBe(state.databasePassword);
  });
  it("rolls role DDL back if encrypted ownership persistence cannot commit", async () => {
    const g = grant("rollback"), role = privateDatabaseRole(g.plan.namespace);
    await client.unsafe(`CREATE FUNCTION reject_private_db_state() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture persistence denied'; END $$`);
    await client.unsafe(`CREATE TRIGGER reject_private_db_state BEFORE INSERT ON system_settings FOR EACH ROW EXECUTE FUNCTION reject_private_db_state()`);
    try {
      await expect(runtime.prepareDatabase(g)).rejects.toThrow("ROLE_PREPARATION_FAILED");
      expect(await client`SELECT 1 FROM pg_roles WHERE rolname=${role}`).toHaveLength(0);
    } finally { await client.unsafe(`DROP TRIGGER reject_private_db_state ON system_settings`); }
  });
  it("does not adopt an existing role with the same derived name", async () => {
    const g = grant("collision"), role = privateDatabaseRole(g.plan.namespace);
    await client.unsafe(`CREATE ROLE "${role}" NOLOGIN`);
    await expect(runtime.prepareDatabase(g)).rejects.toThrow("EXISTING_ROLE_REVIEW_REQUIRED");
    expect((await client`SELECT rolcanlogin FROM pg_roles WHERE rolname=${role}`)[0].rolcanlogin).toBe(false);
  });
  it("rejects database substitution before creating a role", async () => {
    const g = grant("wrong-database"); g.plan.databaseName = "foreign_database";
    await expect(runtime.prepareDatabase(g)).rejects.toThrow("LOCAL_SCOPE_DENIED");
    expect(await client`SELECT 1 FROM pg_roles WHERE rolname=${privateDatabaseRole(g.plan.namespace)}`).toHaveLength(0);
  });
  it("admits and publishes the exact new contract through the real canonical outbox and default transport", async () => {
    const g = grant("canonical-admission");
    const { createJobControlPlane } = await import("./jobControlPlane");
    const { defaultJobExecutorRegistry } = await import("./jobExecutorRegistry");
    expect(defaultJobExecutorRegistry.resolve(PRIVATE_DATABASE_JOB, PRIVATE_DATABASE_CONTRACT)).toBeDefined();
    const controlPlane = createJobControlPlane();
    const created = await controlPlane.create({ contractVersion: PRIVATE_DATABASE_CONTRACT, tenantId: g.tenantId,
      requestedByUserId: g.requesterUserId, jobType: PRIVATE_DATABASE_JOB, executionClass: "long",
      input: { contractVersion: PRIVATE_DATABASE_CONTRACT, projectId: g.projectId, grantRef: g.grantRef, planDigest: g.planDigest },
      idempotencyKey: `private-db-fixture-${g.jobId}`, retryPolicy: { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 5000,
        jitter: "none", deadlineMs: 600000, deadlineMode: "fixed", allowedErrorClasses: ["transient"] },
      timeoutPolicy: { softTimeoutMs: 0, hardTimeoutMs: 600000 } });
    const [outbox] = await client`SELECT id FROM worker_job_outbox WHERE "workerJobId"=${created.jobId}`;
    const { publishJobOutboxRow } = await import("./jobOutboxPublisher");
    const { PostgresPullJobTransportAdapter } = await import("./jobTransportAdapters");
    expect(await publishJobOutboxRow(outbox.id, new PostgresPullJobTransportAdapter())).toMatchObject({ state: "published" });
    const [row] = await client`SELECT "publishedAt", "quarantinedAt" FROM worker_job_outbox WHERE id=${outbox.id}`;
    expect(row.publishedAt).not.toBeNull(); expect(row.quarantinedAt).toBeNull();
  });
  async function continuationFixture(projectId: string) {
    await client`UPDATE worker_jobs SET status='canceled' WHERE status IN ('queued','leased','running')`;
    const g = grant(projectId), source = { ...g, jobId: randomUUID(), grantRef: randomUUID() };
    const controlPlane = (await import("./jobControlPlane")).createJobControlPlane();
    for (const current of [source, g]) await controlPlane.create({ contractVersion: PRIVATE_DATABASE_CONTRACT,
      tenantId: current.tenantId, requestedByUserId: current.requesterUserId, jobType: PRIVATE_DATABASE_JOB, executionClass: "long",
      input: { contractVersion: PRIVATE_DATABASE_CONTRACT, projectId: current.projectId, grantRef: current.grantRef, planDigest: current.planDigest,
        ...(current === g ? { resumeFromJobId: source.jobId } : {}) }, idempotencyKey: `continuation-fixture-${current.jobId}`,
      retryPolicy: { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 5000, jitter: "none", deadlineMs: 600000,
        deadlineMode: "fixed", allowedErrorClasses: ["retryable"] }, timeoutPolicy: { softTimeoutMs: 0, hardTimeoutMs: 600000 } }, { canonicalJobId: current.jobId });
    await runtime.prepareDatabase(source);
    const checkpoint = { ...await runtime.loadCheckpoint(source), caId: "c".repeat(32), appId: randomUUID(), policyId: randomUUID(),
      dnsRecordId: "d".repeat(32), serviceToken: { id: randomUUID(), clientId: "disposable-service-token-id", secret: "disposable-service-token-secret", expiresAt: g.plan.configurationExpiresAt } };
    await runtime.saveCheckpoint(source, checkpoint);
    await client`UPDATE worker_jobs SET status='failed', "errorCode"='PRIVATE_DATABASE_DNS_NOT_READY',
      "createdAt"=now()-interval '2 hours', "finishedAt"=now() WHERE id=${source.jobId}`;
    const lease = await controlPlane.claim({ jobId: g.jobId, runnerId: "disposable-continuation", adapter: "postgres-pull" });
    expect(lease).not.toBeNull(); await controlPlane.start(lease!);
    return { g, source, checkpoint };
  }
  it("continues one expired definite rejection under a fresh canonical job without rewriting history or duplicating secrets", async () => {
    const { g, source, checkpoint } = await continuationFixture("continuation-owned");
    await runtime.continueCheckpoint(g, source.jobId);
    await runtime.continueCheckpoint(g, source.jobId);
    const state = await runtime.loadCheckpoint(g);
    expect(state).toMatchObject({ ...checkpoint, resumedFromJobId: source.jobId });
    expect((await runtime.loadCheckpoint(source)).continuedByJobId).toBe(g.jobId);
    await runtime.prepareDatabase(g);
    await expect(runtime.prepareDatabase(source)).rejects.toThrow("CHECKPOINT_CONTINUED");
    const [old] = await client`SELECT status, "errorCode", "createdAt" FROM worker_jobs WHERE id=${source.jobId}`;
    expect(old).toMatchObject({ status: "failed", errorCode: "PRIVATE_DATABASE_DNS_NOT_READY" });
    expect(Date.now() - old.createdAt.getTime()).toBeGreaterThan(3600000);
  });
  it.each(["pending", "foreign-owner", "unexpired", "already-created", "continuation-chain"])("refuses unsafe continuation: %s", async kind => {
    const { g, source, checkpoint } = await continuationFixture("continuation-" + kind);
    if (kind === "foreign-owner") await client`UPDATE worker_jobs SET "requestedByUserId"=NULL WHERE id=${source.jobId}`;
    else if (kind === "unexpired") await client`UPDATE worker_jobs SET "createdAt"=now() WHERE id=${source.jobId}`;
    else await runtime.saveCheckpoint(source, { ...checkpoint, ...(kind === "pending" ? { pending: "hyperdrive.create" }
      : kind === "already-created" ? { hyperdriveId: "e".repeat(32) } : { resumedFromJobId: randomUUID() }) });
    await expect(runtime.continueCheckpoint(g, source.jobId)).rejects.toThrow("CONTINUATION_DENIED");
    expect((await runtime.loadCheckpoint(g)).databasePassword).toBeUndefined();
    expect((await runtime.loadCheckpoint(source)).continuedByJobId).toBeUndefined();
  });
});
