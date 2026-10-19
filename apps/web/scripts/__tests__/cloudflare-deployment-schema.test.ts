import { readFile } from "node:fs/promises";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyCloudflareDeploymentSchema, inspectCloudflareDeploymentSchema, selectCloudflareDeploymentSchemaSql } from "../cloudflare-deployment-schema";
import { DRIZZLE_MIGRATION_ADVISORY_LOCK } from "../../server/services/migrationExecutionLock";
import { createSpec277DisposablePostgres } from "../../server/services/__tests__/support/spec277DisposablePostgres";

describe("Cloudflare deployment schema scope", () => {
  it("selects five exact statements without the unrelated audit index or journal writes", async () => {
    const contents = await Promise.all([
      "0389_spec288_provider_deployment_target_authority", "0391_tenant_deployment_credentials",
    ].map(tag => readFile(new URL(`../../drizzle/${tag}.sql`, import.meta.url), "utf8")));
    const statements = selectCloudflareDeploymentSchemaSql(contents);
    expect(statements).toHaveLength(5);
    expect(statements.join("\n")).not.toMatch(/api_audit_migration|__drizzle_migrations|^(?:DROP|ALTER|DELETE) /m);
    expect(() => selectCloudflareDeploymentSchemaSql([contents[0] + "\n", contents[1]])).toThrow("SCHEMA_SOURCE_HASH_MISMATCH");
  });
});

const suite = process.env.RUN_CLOUDFLARE_STAGING_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("Cloudflare additive schema repair in disposable PostgreSQL", () => {
  let disposable: Awaited<ReturnType<typeof createSpec277DisposablePostgres>>;
  let client: InstanceType<typeof pg.Client>;
  const receipts: Record<string, unknown>[] = [];
  let options: Parameters<typeof applyCloudflareDeploymentSchema>[1];

  beforeAll(async () => {
    disposable = await createSpec277DisposablePostgres();
    client = new pg.Client({ connectionString: disposable.databaseUrl });
    await client.connect();
    await client.query(`CREATE TABLE tenants (id varchar(36) PRIMARY KEY);
      CREATE TABLE users (id integer PRIMARY KEY);
      INSERT INTO tenants VALUES ('retained-tenant'); INSERT INTO users VALUES (42);
      CREATE TABLE api_audit_events (id bigserial PRIMARY KEY,"traceId" text,"eventType" text,
        provider text,endpoint text,"statusCode" integer,metadata json);
      CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations (id serial,hash text,created_at bigint);
      INSERT INTO drizzle.__drizzle_migrations (hash,created_at) VALUES ('retained-ledger-hash',123);`);
    options = { expectedFingerprint: (await inspectCloudflareDeploymentSchema(client)).fingerprint,
      sourceSha: "a".repeat(40), authorizationReference: "disposable-test-only", actor: "disposable-test",
      writeReceipt: receipt => { receipts.push(receipt); } };
  }, 30_000);
  afterAll(async () => { if (client) await client.end(); if (disposable) await disposable.close(); }, 20_000);

  it("rejects the wrong database before writes", async () => {
    await expect(applyCloudflareDeploymentSchema(client, { ...options, expectedFingerprint: `sha256:${"b".repeat(64)}` }))
      .rejects.toThrow("DATABASE_FINGERPRINT_MISMATCH");
    expect(receipts).toHaveLength(0);
    expect(Object.values((await inspectCloudflareDeploymentSchema(client)).catalog)).toEqual([null, null]);
  });

  it("respects the existing migration lock", async () => {
    const other = new pg.Client({ connectionString: disposable.databaseUrl });
    await other.connect();
    try {
      await other.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [DRIZZLE_MIGRATION_ADVISORY_LOCK]);
      await expect(applyCloudflareDeploymentSchema(client, options)).rejects.toThrow("MIGRATION_LOCK_BUSY");
    } finally { await other.end(); }
    expect(receipts).toHaveLength(0);
  });

  it("rolls back both tables atomically when a later statement fails", async () => {
    await client.query(`CREATE TABLE index_name_collision (id integer);
      CREATE INDEX provider_deployment_credentials_scope_unique ON index_name_collision (id)`);
    await expect(applyCloudflareDeploymentSchema(client, options)).rejects.toMatchObject({ code: "42P07" });
    expect(Object.values((await inspectCloudflareDeploymentSchema(client)).catalog)).toEqual([null, null]);
    expect(receipts.at(-1)).toMatchObject({ phase: "SETTLED", result: "FAILED" });
    expect((await client.query("SELECT count(*)::int AS count FROM api_audit_events")).rows[0].count).toBe(0);
    await client.query("DROP TABLE index_name_collision");
  });

  it("creates only the requested objects, preserves data and journal, and records success", async () => {
    await expect(applyCloudflareDeploymentSchema(client, options)).resolves.toMatchObject({ status: "APPLIED", statementCount: 5, journalAdvanced: false });
    expect((await client.query("SELECT * FROM tenants")).rows).toEqual([{ id: "retained-tenant" }]);
    expect((await client.query("SELECT * FROM users")).rows).toEqual([{ id: 42 }]);
    expect((await client.query("SELECT hash,created_at FROM drizzle.__drizzle_migrations")).rows)
      .toEqual([{ hash: "retained-ledger-hash", created_at: "123" }]);
    expect((await client.query("SELECT count(*)::int AS count FROM api_audit_events")).rows[0].count).toBe(1);
    expect(receipts.at(-1)).toMatchObject({ result: "SUCCEEDED", journalAdvanced: false });
    await expect(client.query(`INSERT INTO provider_deployment_targets ("tenantId","projectId",environment,provider,"deploymentTargetId","credentialRef",provenance)
      VALUES ('retained-tenant','','staging','cloudflare','test','test','test')`)).rejects.toMatchObject({ code: "23514" });
  });

  it("retries without writes and refuses subsequent schema drift", async () => {
    const count = receipts.length;
    await expect(applyCloudflareDeploymentSchema(client, options)).resolves.toMatchObject({ status: "ALREADY_APPLIED" });
    expect(receipts).toHaveLength(count);
    await client.query("ALTER TABLE provider_deployment_targets DROP CONSTRAINT provider_deployment_targets_identity_nonempty");
    await expect(applyCloudflareDeploymentSchema(client, options)).rejects.toThrow("DEPLOYMENT_SCHEMA_DRIFT");
    expect(receipts).toHaveLength(count);
  });
});
