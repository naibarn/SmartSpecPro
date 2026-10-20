import { readFile } from "node:fs/promises";
import pg from "pg";
import { getTableColumns } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { desktopDevices, desktopDeviceHealthStatusEnum } from "../../drizzle/schema";
import { applyDesktopDeviceSchema, inspectDesktopDeviceSchema, selectDesktopDeviceSchemaSql,
  desktopColumnContracts, DESKTOP_DEVICE_SCHEMA_SOURCE } from "../desktop-device-schema";
import { DRIZZLE_MIGRATION_ADVISORY_LOCK } from "../../server/services/migrationExecutionLock";
import { createSpec277DisposablePostgres } from "../../server/services/__tests__/support/spec277DisposablePostgres";

const readSql = () => readFile(new URL("../../drizzle/0409_desktop_device_registry.sql", import.meta.url), "utf8");

describe("desktop registry migration source contract", () => {
  it("pins exactly the additive enum, table and two index statements", async () => {
    const source = await readSql();
    expect(selectDesktopDeviceSchemaSql([source])).toHaveLength(4);
    expect(source).not.toMatch(/^\s*(?:DROP|ALTER|DELETE|UPDATE|INSERT|TRUNCATE)\s/im);
    expect(() => selectDesktopDeviceSchemaSql([source + "\n"])).toThrow("SCHEMA_SOURCE_HASH_MISMATCH");
    expect(() => selectDesktopDeviceSchemaSql([])).toThrow("SCHEMA_SOURCE_COUNT_INVALID");
  });

  it("matches every existing ORM column type/nullability and health enum", () => {
    const normalize = (type: string) => type.replace(/^varchar/, "character varying");
    const columns = Object.values(getTableColumns(desktopDevices));
    expect(columns.map(column => [column.name, normalize(column.getSQLType()), column.notNull]))
      .toEqual(desktopColumnContracts.map(([name, type, notNull]) => [name, type, notNull]));
    expect(desktopDeviceHealthStatusEnum.enumValues).toEqual(["online", "offline", "unhealthy", "disabled"]);
  });

  it("registers a new journal entry without rewriting earlier migration identities", async () => {
    const journal = JSON.parse(await readFile(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8"));
    const entries = journal.entries.filter((entry: { tag: string }) => entry.tag === DESKTOP_DEVICE_SCHEMA_SOURCE.tag);
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry).toMatchObject({ idx: 409, version: "7", tag: DESKTOP_DEVICE_SCHEMA_SOURCE.tag, breakpoints: true });
    expect(entry.when).toBeGreaterThan(journal.entries.find((previous: { idx: number }) => previous.idx === 408).when);
  });
});

const suite = process.env.RUN_DESKTOP_SCHEMA_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("desktop registry scoped repair in owner-marked disposable PostgreSQL", () => {
  let disposable: Awaited<ReturnType<typeof createSpec277DisposablePostgres>>;
  let client: InstanceType<typeof pg.Client>;
  const receipts: Record<string, unknown>[] = [];
  let options: Parameters<typeof applyDesktopDeviceSchema>[1];

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
    options = { expectedFingerprint: (await inspectDesktopDeviceSchema(client)).fingerprint,
      sourceSha: "a".repeat(40), authorizationReference: "disposable-test-only", actor: "disposable-test",
      writeReceipt: receipt => { receipts.push(receipt); } };
  }, 30_000);
  afterAll(async () => { if (client) await client.end(); if (disposable) await disposable.close(); }, 20_000);

  it("rejects mismatched target and absent authorization context before DDL", async () => {
    await expect(applyDesktopDeviceSchema(client, { ...options, expectedFingerprint: `sha256:${"b".repeat(64)}` }))
      .rejects.toThrow("DATABASE_FINGERPRINT_MISMATCH");
    await expect(applyDesktopDeviceSchema(client, { ...options, authorizationReference: "" }))
      .rejects.toThrow("SCHEMA_EXECUTION_CONTEXT_INVALID");
    expect(receipts).toHaveLength(0);
    expect(Object.values((await inspectDesktopDeviceSchema(client)).catalog)).toEqual([null, null]);
  });

  it("honors the same lock as the full Drizzle and Cloudflare migration authorities", async () => {
    const other = new pg.Client({ connectionString: disposable.databaseUrl });
    await other.connect();
    try {
      await other.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [DRIZZLE_MIGRATION_ADVISORY_LOCK]);
      await expect(applyDesktopDeviceSchema(client, options)).rejects.toThrow("MIGRATION_LOCK_BUSY");
    } finally { await other.end(); }
    expect(receipts).toHaveLength(0);
  });

  it("rolls back both new enum and table if an index postcondition fails", async () => {
    await client.query(`CREATE TABLE index_name_collision (id integer);
      CREATE INDEX desktop_devices_tenant_user_idx ON index_name_collision (id)`);
    await expect(applyDesktopDeviceSchema(client, options)).rejects.toThrow("DESKTOP_SCHEMA_CONSTRAINTS_OR_INDEXES_INVALID");
    expect(Object.values((await inspectDesktopDeviceSchema(client)).catalog)).toEqual([null, null]);
    expect(receipts.at(-1)).toMatchObject({ result: "FAILED", phase: "SETTLED" });
    expect((await client.query("SELECT count(*)::int AS count FROM api_audit_events")).rows[0].count).toBe(0);
    await client.query("DROP TABLE index_name_collision");
  });

  it("refuses an incompatible existing enum without altering it", async () => {
    await client.query("CREATE TYPE desktop_device_health_status AS ENUM ('wrong')");
    const count = receipts.length;
    await expect(applyDesktopDeviceSchema(client, options)).rejects.toThrow("DESKTOP_HEALTH_ENUM_INCOMPATIBLE");
    expect(receipts).toHaveLength(count);
    expect((await inspectDesktopDeviceSchema(client)).catalog.desktop_device_health_status.labels).toEqual(["wrong"]);
    await client.query("DROP TYPE desktop_device_health_status");
  });

  it("creates the exact schema, leaves devices unseeded and retains parents/journal", async () => {
    // A compatible type from another additive rollout is preserved.
    await client.query("CREATE TYPE desktop_device_health_status AS ENUM ('online','offline','unhealthy','disabled')");
    await expect(applyDesktopDeviceSchema(client, options)).resolves.toMatchObject({ status: "APPLIED", statementCount: 4, journalAdvanced: false });
    expect((await client.query("SELECT * FROM desktop_devices")).rows).toEqual([]);
    expect((await client.query("SELECT * FROM tenants")).rows).toEqual([{ id: "retained-tenant" }]);
    expect((await client.query("SELECT * FROM users")).rows).toEqual([{ id: 42 }]);
    expect((await client.query("SELECT hash,created_at FROM drizzle.__drizzle_migrations")).rows)
      .toEqual([{ hash: "retained-ledger-hash", created_at: "123" }]);
    expect((await client.query("SELECT count(*)::int AS count FROM api_audit_events")).rows[0].count).toBe(1);
    expect(receipts.at(-1)).toMatchObject({ result: "SUCCEEDED", journalAdvanced: false, statementCount: 4 });
  });

  it("enforces defaults and FK retention behavior in the disposable fixture", async () => {
    await client.query("INSERT INTO tenants VALUES ('temporary-tenant'); INSERT INTO users VALUES (43)");
    await client.query(`INSERT INTO desktop_devices (id,"tenantId","userId","displayName") VALUES ('test-device','temporary-tenant',43,'Test')`);
    expect((await client.query(`SELECT "healthStatus","workerProjectionEnabled",platform,"pendingActionsJson","accessState" FROM desktop_devices`)).rows)
      .toEqual([{ healthStatus: "offline", workerProjectionEnabled: false, platform: {}, pendingActionsJson: [], accessState: "active" }]);
    await client.query("DELETE FROM users WHERE id=43");
    expect((await client.query(`SELECT "userId" FROM desktop_devices`)).rows[0].userId).toBeNull();
    await client.query("DELETE FROM tenants WHERE id='temporary-tenant'");
    expect((await client.query("SELECT * FROM desktop_devices")).rows).toEqual([]);
  });

  it("supports future journal replay and receipt-backed retry without duplicated writes", async () => {
    const count = receipts.length;
    const before = (await inspectDesktopDeviceSchema(client)).catalog;
    for (const statement of selectDesktopDeviceSchemaSql([await readSql()])) await client.query(statement);
    expect((await inspectDesktopDeviceSchema(client)).catalog).toEqual(before);
    await expect(applyDesktopDeviceSchema(client, options)).resolves.toMatchObject({ status: "ALREADY_APPLIED", journalAdvanced: false });
    expect(receipts).toHaveLength(count);
    expect((await client.query("SELECT count(*)::int AS count FROM api_audit_events")).rows[0].count).toBe(1);
  });

  it("refuses later schema drift rather than silently claiming idempotent success", async () => {
    await client.query('ALTER TABLE desktop_devices DROP COLUMN "policyCursor"');
    const count = receipts.length;
    await expect(applyDesktopDeviceSchema(client, options)).rejects.toThrow("DESKTOP_SCHEMA_DRIFT");
    expect(receipts).toHaveLength(count);
  });
});
