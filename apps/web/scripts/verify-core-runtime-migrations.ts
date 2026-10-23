import "dotenv/config";

import pg from "pg";

const { Client } = pg;

type Catalog = {
  tables: string[];
  columns: string[];
  constraints: string[];
  indexes: string[];
  enumLabels: string[];
};

const required = {
  tables: [
    "canonical_projects",
    "app_identities",
    "mini_app_project_wiki_pages",
    "user_github_connections",
  ],
  columns: [
    "mini_app_project_wiki_pages.page_id",
    "mini_app_project_wiki_pages.tenant_id",
    "mini_app_project_wiki_pages.project_id",
    "mini_app_project_wiki_pages.app_id",
    "mini_app_project_wiki_pages.owner_principal_id",
    "mini_app_project_wiki_pages.path",
    "mini_app_project_wiki_pages.content_hash",
    "user_github_connections.user_id",
    "user_github_connections.tenant_id",
    "user_github_connections.github_login",
    "user_github_connections.token_encrypted",
  ],
  constraints: [
    "mini_app_project_wiki_pages_tenant_page_unique",
    "mini_app_project_wiki_pages_project_fk",
    "mini_app_project_wiki_pages_app_fk",
    "mini_app_project_wiki_pages_lifecycle_check",
    "mini_app_project_wiki_pages_path_nonempty_check",
    "mini_app_project_wiki_pages_content_hash_check",
    "user_github_connections_user_id_users_id_fk",
  ],
  indexes: [
    "mini_app_project_wiki_pages_stable_id_unique",
    "mini_app_project_wiki_pages_active_path_unique",
    "mini_app_project_wiki_pages_updated_idx",
    "user_github_connections_user_unique",
  ],
  enumLabels: ["external_runtime"],
} as const;

export function evaluateCoreRuntimeMigrationPostconditions(catalog: Catalog) {
  const missing = {
    tables: required.tables.filter(name => !catalog.tables.includes(name)),
    columns: required.columns.filter(name => !catalog.columns.includes(name)),
    constraints: required.constraints.filter(
      name => !catalog.constraints.includes(name)
    ),
    indexes: required.indexes.filter(name => !catalog.indexes.includes(name)),
    enumLabels: required.enumLabels.filter(
      name => !catalog.enumLabels.includes(name)
    ),
  };
  return {
    status: Object.values(missing).some(values => values.length)
      ? "BLOCKED"
      : "READY",
    missing,
  } as const;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    application_name: "smartaihub-core-runtime-migration-check",
  });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const [tables, columns, constraints, indexes, enumLabels] =
      await Promise.all([
        client.query<{ name: string }>(
          "SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')"
        ),
        client.query<{ name: string }>(
          "SELECT table_name || '.' || column_name AS name FROM information_schema.columns WHERE table_schema='public'"
        ),
        client.query<{ name: string }>(
          "SELECT conname AS name FROM pg_constraint WHERE connamespace='public'::regnamespace"
        ),
        client.query<{ name: string }>(
          "SELECT indexname AS name FROM pg_indexes WHERE schemaname='public'"
        ),
        client.query<{ name: string }>(
          "SELECT e.enumlabel AS name FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public' AND t.typname='worker_runtime_type'"
        ),
      ]);
    const report = evaluateCoreRuntimeMigrationPostconditions({
      tables: tables.rows.map(row => row.name),
      columns: columns.rows.map(row => row.name),
      constraints: constraints.rows.map(row => row.name),
      indexes: indexes.rows.map(row => row.name),
      enumLabels: enumLabels.rows.map(row => row.name),
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          schema: "core-runtime-migration-postconditions.v1",
          database: (await client.query("SELECT current_database() AS name"))
            .rows[0].name,
          access: "read_only",
          ...report,
        },
        null,
        2
      )}\n`
    );
    await client.query("ROLLBACK");
    if (report.status !== "READY") process.exitCode = 1;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("verify-core-runtime-migrations.ts")) {
  await main().catch(error => {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "VERIFICATION_FAILED";
    console.error(
      JSON.stringify({
        schema: "core-runtime-migration-postconditions.v1",
        error: code,
      })
    );
    process.exitCode = 1;
  });
}
