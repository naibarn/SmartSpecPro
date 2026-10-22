import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { userInfo, homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg, { type Client } from "pg";
import { DRIZZLE_MIGRATION_ADVISORY_LOCK } from "../server/services/migrationExecutionLock";

export const CONTENT_COMPOSER_MIGRATION = {
  tag: "0121_content_composer_drafts",
  hash: "e4a169a42a60c902078961e5ad0495f6567179eac9546f9145e3c904d4537cc5",
  statements: 6,
} as const;
const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const endpoint = "content-composer-schema-repair";
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** Select only the immutable additive statements from the orphaned 0121 migration. */
export function selectContentComposerSchemaSql(contents: string[]): string[] {
  if (
    contents.length !== 1 ||
    digest(contents[0]) !== CONTENT_COMPOSER_MIGRATION.hash
  ) {
    throw new Error("SCHEMA_SOURCE_HASH_MISMATCH");
  }
  const statements = contents[0]
    .split("--> statement-breakpoint")
    .map(value => value.trim())
    .filter(Boolean);
  if (
    statements.length !== CONTENT_COMPOSER_MIGRATION.statements ||
    !statements[0].startsWith(
      'CREATE TABLE IF NOT EXISTS "content_composer_drafts"'
    ) ||
    !statements[1].startsWith('ALTER TABLE "content_composer_drafts"') ||
    !statements[2].startsWith('ALTER TABLE "content_composer_drafts"') ||
    !statements[3].startsWith(
      'CREATE INDEX IF NOT EXISTS "ccd_tenant_user_status_idx"'
    ) ||
    !statements[4].startsWith(
      'CREATE INDEX IF NOT EXISTS "ccd_tenant_updated_at_idx"'
    ) ||
    !statements[5].startsWith('ALTER TABLE "blog_posts"')
  ) {
    throw new Error("SCHEMA_STATEMENT_SCOPE_INVALID");
  }
  return statements;
}

async function readState(client: Client) {
  const {
    rows: [facts],
  } =
    await client.query(`SELECT current_database() AS database, current_schema() AS schema,
    current_user AS role, inet_server_addr()::text AS address, inet_server_port() AS port,
    current_setting('cluster_name',true) AS cluster, current_setting('server_version') AS version,
    has_schema_privilege(current_user,'public','CREATE') AS can_create,
    (SELECT pg_has_role(current_user,c.relowner,'USAGE') FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='blog_posts') AS can_alter_blog_posts,
    has_table_privilege(current_user,'public.tenants','REFERENCES') AND
      has_table_privilege(current_user,'public.users','REFERENCES') AS can_reference_dependencies,
    to_regclass('public.tenants') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AS dependencies_present,
    to_regclass('public.blog_posts') IS NOT NULL AS blog_posts_present,
    to_regclass('public.content_composer_drafts') IS NOT NULL AS drafts_present,
    to_regclass('public.api_audit_events') IS NOT NULL AS audit_present,
    to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS ledger_present`);
  const fingerprint = `sha256:${digest([facts.address, facts.port, facts.cluster, facts.database, facts.schema, facts.role, facts.version].join("\u0000"))}`;
  const { rows: columns } =
    await client.query(`SELECT table_name, column_name, data_type, character_maximum_length, is_nullable
    FROM information_schema.columns WHERE table_schema='public' AND
    ((table_name='blog_posts' AND column_name='mediaAttachments') OR
     (table_name='tenants' AND column_name='id') OR (table_name='users' AND column_name='id'))
    ORDER BY table_name,column_name`);
  return { fingerprint, facts, columns };
}

export async function inspectContentComposerSchema(client: Client) {
  const state = await readState(client);
  const blogColumn = state.columns.find(
    row =>
      row.table_name === "blog_posts" && row.column_name === "mediaAttachments"
  );
  const dependenciesMatch =
    state.columns.some(
      row =>
        row.table_name === "tenants" &&
        row.column_name === "id" &&
        row.data_type === "character varying" &&
        row.character_maximum_length === 36
    ) &&
    state.columns.some(
      row =>
        row.table_name === "users" &&
        row.column_name === "id" &&
        row.data_type === "integer"
    );
  const ready =
    state.facts.schema === "public" &&
    state.facts.can_create &&
    state.facts.can_alter_blog_posts &&
    state.facts.can_reference_dependencies &&
    state.facts.dependencies_present &&
    state.facts.blog_posts_present &&
    state.facts.audit_present &&
    state.facts.ledger_present &&
    dependenciesMatch &&
    (!blogColumn || blogColumn.data_type === "json");
  return {
    fingerprint: state.fingerprint,
    ready,
    facts: {
      schema: state.facts.schema,
      can_create: state.facts.can_create,
      can_alter_blog_posts: state.facts.can_alter_blog_posts,
      can_reference_dependencies: state.facts.can_reference_dependencies,
      dependencies_present: state.facts.dependencies_present,
      blog_posts_present: state.facts.blog_posts_present,
      drafts_present: state.facts.drafts_present,
      audit_present: state.facts.audit_present,
      ledger_present: state.facts.ledger_present,
      media_attachments: blogColumn?.data_type ?? null,
    },
  };
}

export async function repairContentComposerSchema(
  client: Client,
  options: {
    expectedFingerprint: string;
    authorizationReference: string;
    sourceSha: string;
    writeReceipt: (receipt: Record<string, unknown>) => void;
  }
) {
  if (
    !/^sha256:[a-f0-9]{64}$/.test(options.expectedFingerprint) ||
    !/^[a-f0-9]{40}$/.test(options.sourceSha) ||
    options.authorizationReference.trim().length < 8
  )
    throw new Error("SCHEMA_EXECUTION_CONTEXT_INVALID");
  const sqlSource = await readFile(
    path.join(appRoot, "drizzle", `${CONTENT_COMPOSER_MIGRATION.tag}.sql`),
    "utf8"
  );
  const statements = selectContentComposerSchemaSql([sqlSource]);
  const scopeKey = `${endpoint}:${CONTENT_COMPOSER_MIGRATION.hash}`;
  const base = {
    schemaVersion: "migration-execution-receipt.v1",
    idempotencyKey: scopeKey,
    executionId: randomUUID(),
    attemptNumber: 1,
    authorityScope: "PLATFORM_WIDE",
    operation: "targeted_additive_schema_repair",
    objects: [
      "public.content_composer_drafts",
      "public.blog_posts.mediaAttachments",
    ],
    sourceMigrations: [{ ...CONTENT_COMPOSER_MIGRATION }],
    sourceSha: options.sourceSha,
    actor: userInfo().username,
    authorizationReference: options.authorizationReference,
    databaseTargetId: options.expectedFingerprint,
    startedAt: new Date().toISOString(),
    journalAdvanced: false,
  };
  let locked = false,
    transaction = false,
    started = false,
    committed = false;
  try {
    const lock = await client.query(
      `SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired`,
      [DRIZZLE_MIGRATION_ADVISORY_LOCK]
    );
    locked = lock.rows[0]?.acquired === true;
    if (!locked) throw new Error("MIGRATION_LOCK_BUSY");
    await client.query("BEGIN");
    transaction = true;
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query("SET LOCAL statement_timeout='30s'");
    const before = await inspectContentComposerSchema(client);
    if (before.fingerprint !== options.expectedFingerprint)
      throw new Error("DATABASE_FINGERPRINT_MISMATCH");
    if (!before.ready)
      throw new Error("SCHEMA_DEPENDENCIES_OR_PRIVILEGES_MISSING");
    const prior = await client.query(
      `SELECT metadata FROM public.api_audit_events
      WHERE "eventType"='migration_execution_receipt' AND endpoint=$1 AND metadata->>'idempotencyKey'=$2
      AND metadata->>'phase'='SETTLED' AND metadata->>'result'='SUCCEEDED' ORDER BY id DESC LIMIT 1`,
      [endpoint, scopeKey]
    );
    if (prior.rows.length) {
      if (
        !before.facts.drafts_present ||
        before.facts.media_attachments !== "json" ||
        prior.rows[0].metadata.catalogDigest !==
          digest(JSON.stringify(before.facts))
      )
        throw new Error("SCHEMA_DRIFT");
      await client.query("ROLLBACK");
      transaction = false;
      return {
        status: "ALREADY_APPLIED" as const,
        fingerprint: before.fingerprint,
        journalAdvanced: false,
      };
    }
    if (before.facts.drafts_present || before.facts.media_attachments !== null)
      throw new Error("SCHEMA_PRESENT_WITHOUT_MATCHING_RECEIPT");
    const ledgerBefore = await client.query(
      "SELECT count(*)::int AS count,max(created_at) AS head FROM drizzle.__drizzle_migrations"
    );
    options.writeReceipt({ ...base, phase: "STARTED" });
    started = true;
    for (const statement of statements) await client.query(statement);
    const after = await inspectContentComposerSchema(client);
    if (
      !after.ready ||
      !after.facts.drafts_present ||
      after.facts.media_attachments !== "json"
    )
      throw new Error("SCHEMA_POSTCONDITION_MISSING");
    const ledgerAfter = await client.query(
      "SELECT count(*)::int AS count,max(created_at) AS head FROM drizzle.__drizzle_migrations"
    );
    if (JSON.stringify(ledgerBefore.rows) !== JSON.stringify(ledgerAfter.rows))
      throw new Error("MIGRATION_JOURNAL_CHANGED");
    const settled = {
      ...base,
      phase: "SETTLED",
      result: "SUCCEEDED",
      completedAt: new Date().toISOString(),
      catalogDigest: digest(JSON.stringify(after.facts)),
      ledger: ledgerAfter.rows[0],
      statementCount: statements.length,
    };
    await client.query(
      `INSERT INTO public.api_audit_events ("traceId","eventType",provider,endpoint,"statusCode",metadata)
      VALUES ($1,'migration_execution_receipt','drizzle',$2,200,$3::json)`,
      [
        randomUUID().replaceAll("-", "").slice(0, 32),
        endpoint,
        JSON.stringify(settled),
      ]
    );
    await client.query("COMMIT");
    transaction = false;
    committed = true;
    options.writeReceipt(settled);
    return {
      status: "APPLIED" as const,
      fingerprint: after.fingerprint,
      journalAdvanced: false,
      statementCount: statements.length,
    };
  } catch (error) {
    if (transaction) await client.query("ROLLBACK").catch(() => undefined);
    if (committed) throw new Error("SCHEMA_APPLIED_RECEIPT_EXPORT_FAILED");
    if (started)
      options.writeReceipt({
        ...base,
        phase: "SETTLED",
        result: "FAILED",
        completedAt: new Date().toISOString(),
        failureCode:
          error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
            ? error.message
            : "SCHEMA_EXECUTION_FAILED",
      });
    throw error;
  } finally {
    if (locked)
      await client
        .query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [
          DRIZZLE_MIGRATION_ADVISORY_LOCK,
        ])
        .catch(() => undefined);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_MISSING");
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    application_name: "smartaihub-content-composer-schema",
  });
  await client.connect();
  try {
    if (!process.argv.includes("--apply")) {
      await client.query("BEGIN READ ONLY");
      try {
        console.log(JSON.stringify(await inspectContentComposerSchema(client)));
      } finally {
        await client.query("ROLLBACK");
      }
      return;
    }
    const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: appRoot,
      encoding: "utf8",
    }).trim();
    execFileSync(
      "git",
      ["merge-base", "--is-ancestor", sourceSha, "origin/main"],
      { cwd: appRoot }
    );
    execFileSync(
      "git",
      [
        "diff",
        "--exit-code",
        "HEAD",
        "--",
        "scripts/content-composer-schema-repair.ts",
        "server/services/migrationExecutionLock.ts",
        `drizzle/${CONTENT_COMPOSER_MIGRATION.tag}.sql`,
      ],
      { cwd: appRoot }
    );
    const receiptDirectory = path.join(
      homedir(),
      ".local/state/smartspecpro/artifacts/migration-receipts"
    );
    mkdirSync(receiptDirectory, { recursive: true, mode: 0o700 });
    const receiptPath = path.join(
      receiptDirectory,
      `${endpoint}-${Date.now()}.jsonl`
    );
    const writeReceipt = (receipt: Record<string, unknown>) =>
      appendFileSync(receiptPath, `${JSON.stringify(receipt)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
    const result = await repairContentComposerSchema(client, {
      expectedFingerprint:
        process.env.CONTENT_COMPOSER_SCHEMA_EXPECTED_FINGERPRINT ?? "",
      authorizationReference: process.env.MIGRATION_AUTHORIZATION_REF ?? "",
      sourceSha,
      writeReceipt,
    });
    console.log(JSON.stringify({ ...result, receiptPath }));
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(error => {
    console.error(
      JSON.stringify({
        status: "FAILED",
        code:
          error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
            ? error.message
            : "SCHEMA_EXECUTION_FAILED",
      })
    );
    process.exitCode = 1;
  });
}
