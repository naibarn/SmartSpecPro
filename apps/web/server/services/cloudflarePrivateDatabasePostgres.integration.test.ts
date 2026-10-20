import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { nativeProvisionNamespace } from "./cloudflareNativeProvisionContract";
import { PRIVATE_DATABASE_GRANT, privateDatabaseRole, privateDatabasePlanDigest, type PrivateDatabaseGrant } from "./cloudflarePrivateDatabaseContract";

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
    await (await import("./__tests__/support/spec277AutoTeamRuntimeSchema")).installSpec277AutoTeamRuntimeSchema(client, [schema.systemSettings]);
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
});
