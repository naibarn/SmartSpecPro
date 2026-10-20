import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, closeSync, mkdirSync, openSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { userInfo, homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg, { type Client } from "pg";
import { DRIZZLE_MIGRATION_ADVISORY_LOCK } from "../server/services/migrationExecutionLock";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export type AdditiveSchemaCatalog = Record<string, any>;
export type TargetedAdditiveSchemaPlan = {
  endpoint: string;
  sources: readonly { tag: string; hash: string; statements: number }[];
  tables: readonly string[];
  enums?: readonly string[];
  driftError?: string;
  selectSql: (contents: string[]) => string[];
  validateBefore?: (catalog: AdditiveSchemaCatalog) => void;
  validateAfter?: (catalog: AdditiveSchemaCatalog) => void;
};

export const schemaDigest = (value: string) => createHash("sha256").update(value).digest("hex");
const digest = schemaDigest;

async function catalog(client: Client, plan: TargetedAdditiveSchemaPlan) {
  const result: AdditiveSchemaCatalog = {};
  for (const table of plan.tables) {
    const relation = await client.query(`SELECT c.oid, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
      pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=$1`, [table]);
    if (!relation.rows.length) { result[table] = null; continue; }
    const { oid, ...facts } = relation.rows[0];
    const columns = await client.query(`SELECT a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type,
      a.attnotnull AS not_null, pg_get_expr(d.adbin,d.adrelid) AS default_value
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=$1 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`, [oid]);
    const constraints = await client.query(`SELECT conname AS name, pg_get_constraintdef(oid,true) AS definition
      FROM pg_constraint WHERE conrelid=$1 ORDER BY conname`, [oid]);
    const indexes = await client.query(`SELECT pg_get_indexdef(indexrelid) AS definition, indisvalid AS valid
      FROM pg_index WHERE indrelid=$1 ORDER BY pg_get_indexdef(indexrelid)`, [oid]);
    result[table] = { ...facts, columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows };
  }
  for (const name of plan.enums ?? []) {
    const rows = await client.query(`SELECT t.typtype AS kind, pg_get_userbyid(t.typowner) AS owner,
      array_agg(e.enumlabel::text ORDER BY e.enumsortorder) FILTER (WHERE e.enumlabel IS NOT NULL) AS labels
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_enum e ON e.enumtypid=t.oid
      WHERE n.nspname='public' AND t.typname=$1 GROUP BY t.typtype,t.typowner`, [name]);
    result[name] = rows.rows[0] ?? null;
  }
  return result;
}

export async function inspectTargetedAdditiveSchema(client: Client, plan: TargetedAdditiveSchemaPlan) {
  const { rows: [facts] } = await client.query(`SELECT current_database() AS database, current_schema() AS schema,
    current_user AS role, session_user=current_user AS same_role, inet_server_addr()::text AS address,
    inet_server_port() AS port, current_setting('cluster_name',true) AS cluster,
    current_setting('server_version') AS version,
    has_schema_privilege(current_user,'public','CREATE') AS can_create,
    current_setting('transaction_read_only')='off' AS writable,
    to_regclass('public.tenants') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AS dependencies_present,
    to_regclass('public.api_audit_events') IS NOT NULL AS audit_present`);
  const fingerprint = `sha256:${digest([facts.address, facts.port, facts.cluster, facts.database, facts.schema, facts.role, facts.version].join("\u0000"))}`;
  return { fingerprint, database: facts.database, schema: facts.schema, role: facts.role,
    ready: facts.same_role && facts.schema === "public" && facts.can_create && facts.writable && facts.dependencies_present && facts.audit_present,
    catalog: await catalog(client, plan) };
}

export type AdditiveSchemaApplyOptions = {
  expectedFingerprint: string;
  authorizationReference: string;
  sourceSha: string;
  actor: string;
  writeReceipt: (receipt: Record<string, unknown>) => void;
};

export async function applyTargetedAdditiveSchema(client: Client, plan: TargetedAdditiveSchemaPlan, options: AdditiveSchemaApplyOptions) {
  const { endpoint, sources, tables } = plan;
  const scopeKey = `${endpoint}:${digest(JSON.stringify(sources))}`;
  if (!/^sha256:[a-f0-9]{64}$/.test(options.expectedFingerprint) || !/^[a-f0-9]{40}$/.test(options.sourceSha) ||
      !options.actor.trim() || options.authorizationReference.trim().length < 8) throw new Error("SCHEMA_EXECUTION_CONTEXT_INVALID");
  const contents = await Promise.all(sources.map(source => readFile(path.join(appRoot, "drizzle", `${source.tag}.sql`), "utf8")));
  const statements = plan.selectSql(contents);
  const base = { schemaVersion: "migration-execution-receipt.v1", idempotencyKey: scopeKey,
    executionId: randomUUID(), attemptNumber: 1, authorityScope: "PLATFORM_WIDE",
    operation: "targeted_additive_schema_repair", objects: [...tables, ...(plan.enums ?? [])], sourceMigrations: sources,
    sourceSha: options.sourceSha, actor: options.actor, authorizationReference: options.authorizationReference,
    databaseTargetId: options.expectedFingerprint, startedAt: new Date().toISOString(), journalAdvanced: false };
  let locked = false;
  let transaction = false;
  let started = false;
  let committed = false;
  try {
    const lock = await client.query(`SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired`, [DRIZZLE_MIGRATION_ADVISORY_LOCK]);
    locked = lock.rows[0]?.acquired === true;
    if (!locked) throw new Error("MIGRATION_LOCK_BUSY");
    await client.query("BEGIN");
    transaction = true;
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query("SET LOCAL statement_timeout='30s'");
    const before = await inspectTargetedAdditiveSchema(client, plan);
    if (before.fingerprint !== options.expectedFingerprint) throw new Error("DATABASE_FINGERPRINT_MISMATCH");
    if (!before.ready) throw new Error("SCHEMA_DEPENDENCIES_OR_PRIVILEGES_MISSING");
    plan.validateBefore?.(before.catalog);
    const existing = await client.query(`SELECT metadata FROM public.api_audit_events
      WHERE "eventType"='migration_execution_receipt' AND endpoint=$1 AND metadata->>'idempotencyKey'=$2
      AND metadata->>'phase'='SETTLED' AND metadata->>'result'='SUCCEEDED' ORDER BY id DESC LIMIT 1`, [endpoint, scopeKey]);
    if (existing.rows.length) {
      if (existing.rows[0].metadata.catalogDigest !== digest(JSON.stringify(before.catalog))) throw new Error(plan.driftError ?? "SCHEMA_DRIFT");
      await client.query("ROLLBACK"); transaction = false;
      return { status: "ALREADY_APPLIED" as const, fingerprint: before.fingerprint, journalAdvanced: false };
    }
    if (tables.some(table => before.catalog[table] !== null)) throw new Error("SCHEMA_PRESENT_WITHOUT_MATCHING_RECEIPT");
    const ledgerBefore = await client.query("SELECT count(*)::int AS count,max(created_at) AS head FROM drizzle.__drizzle_migrations");
    options.writeReceipt({ ...base, phase: "STARTED" }); started = true;
    for (const statement of statements) await client.query(statement);
    const after = await catalog(client, plan);
    if (Object.values(after).some(value => value === null)) throw new Error("SCHEMA_POSTCONDITION_MISSING");
    plan.validateAfter?.(after);
    const ledgerAfter = await client.query("SELECT count(*)::int AS count,max(created_at) AS head FROM drizzle.__drizzle_migrations");
    if (JSON.stringify(ledgerBefore.rows) !== JSON.stringify(ledgerAfter.rows)) throw new Error("MIGRATION_JOURNAL_CHANGED");
    const settled = { ...base, phase: "SETTLED", result: "SUCCEEDED", completedAt: new Date().toISOString(),
      catalogDigest: digest(JSON.stringify(after)), ledger: ledgerAfter.rows[0], statementCount: statements.length };
    await client.query(`INSERT INTO public.api_audit_events ("traceId","eventType",provider,endpoint,"statusCode",metadata)
      VALUES ($1,'migration_execution_receipt','drizzle',$2,200,$3::json)`,
    [randomUUID().replaceAll("-", "").slice(0, 32), endpoint, JSON.stringify(settled)]);
    await client.query("COMMIT"); transaction = false; committed = true;
    options.writeReceipt(settled);
    return { status: "APPLIED" as const, fingerprint: before.fingerprint, journalAdvanced: false, statementCount: statements.length };
  } catch (error) {
    if (transaction) await client.query("ROLLBACK").catch(() => undefined);
    if (committed) throw new Error("SCHEMA_APPLIED_RECEIPT_EXPORT_FAILED");
    if (started) options.writeReceipt({ ...base, phase: "SETTLED", result: "FAILED", completedAt: new Date().toISOString(),
      failureCode: error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "SCHEMA_EXECUTION_FAILED" });
    throw error;
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [DRIZZLE_MIGRATION_ADVISORY_LOCK]).catch(() => undefined);
  }
}

export async function runTargetedSchemaCli(plan: TargetedAdditiveSchemaPlan, input: {
  fingerprintVariable: string; sourceFile: string;
}) {
  const { endpoint, sources } = plan;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_MISSING");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: `smartaihub-${endpoint}-migration` });
  await client.connect();
  try {
    if (!process.argv.includes("--apply")) {
      console.log(JSON.stringify(await inspectTargetedAdditiveSchema(client, plan)));
      return;
    }
    const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: appRoot, encoding: "utf8" }).trim();
    execFileSync("git", ["merge-base", "--is-ancestor", sourceSha, "origin/main"], { cwd: appRoot });
    execFileSync("git", ["diff", "--exit-code", "HEAD", "--", input.sourceFile, "scripts/targeted-additive-schema.ts", "server/services/migrationExecutionLock.ts", ...sources.map(source => `drizzle/${source.tag}.sql`)], { cwd: appRoot });
    const receiptDirectory = path.join(homedir(), ".local/state/smartspecpro/artifacts/migration-receipts");
    mkdirSync(receiptDirectory, { recursive: true, mode: 0o700 });
    const receiptFile = path.join(receiptDirectory, `${endpoint}-${Date.now()}.jsonl`);
    const receiptFd = openSync(receiptFile, "wx", 0o600);
    try {
      const result = await applyTargetedAdditiveSchema(client, plan, {
        expectedFingerprint: process.env[input.fingerprintVariable] ?? "",
        authorizationReference: process.env.MIGRATION_AUTHORIZATION_REF ?? "",
        sourceSha, actor: userInfo().username,
        writeReceipt: receipt => appendFileSync(receiptFd, `${JSON.stringify(receipt)}\n`),
      });
      console.log(JSON.stringify({ ...result, receiptFile }));
    } finally { closeSync(receiptFd); }
  } finally { await client.end(); }
}
