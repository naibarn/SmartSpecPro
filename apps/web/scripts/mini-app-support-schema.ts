import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";
import {
  inspectTargetedAdditiveSchema,
  runTargetedSchemaCli,
  schemaDigest,
  type AdditiveSchemaCatalog,
  type TargetedAdditiveSchemaPlan,
} from "./targeted-additive-schema";

export const MINI_APP_SUPPORT_MIGRATIONS = {
  "0394": {
    endpoint: "mini-app-project-wiki-schema",
    tag: "0394_project_wiki_pages_mini_app",
    hash: "a49d23e221cdd2efac1ed426530e4d8643dc7446224c3959ab1f97ffa792afc7",
    table: "mini_app_project_wiki_pages",
  },
  "0410": {
    endpoint: "mini-app-github-connections-schema",
    tag: "0410_mini_app_github_connections",
    hash: "afda0b4743ca4d08224651dea23dfe59cfbb2c02568d6230addc18b670ecc2b6",
    table: "user_github_connections",
  },
} as const;

type MiniAppMigration = keyof typeof MINI_APP_SUPPORT_MIGRATIONS;

function validateTable(
  catalog: AdditiveSchemaCatalog,
  tableName: string,
  requiredColumns: string[],
  requiredConstraints: string[],
  requiredIndexes: string[]
) {
  const table = catalog[tableName];
  if (!table || table.relkind !== "r" || table.relrowsecurity) {
    throw new Error("MINI_APP_SCHEMA_TABLE_POSTCONDITION_FAILED");
  }
  const columns = new Set(
    table.columns.map((column: { name: string }) => column.name)
  );
  const constraints = new Set(
    table.constraints.map((item: { name: string }) => item.name)
  );
  const indexes = table.indexes.map(
    (item: { definition: string; valid: boolean }) =>
      item.valid ? item.definition : ""
  );
  if (
    requiredColumns.some(name => !columns.has(name)) ||
    requiredConstraints.some(name => !constraints.has(name)) ||
    requiredIndexes.some(
      name =>
        !indexes.some(
          definition =>
            definition.includes(` ${name} `) ||
            definition.includes(` ${name}\n`)
        )
    )
  ) {
    throw new Error("MINI_APP_SCHEMA_OBJECT_POSTCONDITION_FAILED");
  }
}

export function selectMiniAppSupportMigrationSql(
  migration: MiniAppMigration,
  contents: string[]
) {
  const source = MINI_APP_SUPPORT_MIGRATIONS[migration];
  if (contents.length !== 1 || schemaDigest(contents[0]) !== source.hash) {
    throw new Error("SCHEMA_SOURCE_HASH_MISMATCH");
  }
  const rawStatements =
    migration === "0394"
      ? contents[0]
          .replace(/^(?:--[^\n]*\n)*BEGIN;\s*/i, "")
          .replace(/\s*COMMIT;\s*$/i, "")
          .split(";")
      : contents[0].split("--> statement-breakpoint");
  const statements = rawStatements
    .map(statement => statement.trim())
    .filter(Boolean);
  const expectedCount = migration === "0394" ? 4 : 2;
  if (statements.length !== expectedCount)
    throw new Error("SCHEMA_STATEMENT_COUNT_INVALID");
  const allowed =
    migration === "0394"
      ? statements[0].startsWith(`CREATE TABLE "${source.table}"`) &&
        statements
          .slice(1)
          .every(statement =>
            new RegExp(
              `^CREATE (?:UNIQUE )?INDEX "${source.table}_[a-z_]+"\\s+ON "${source.table}"`
            ).test(statement)
          )
      : statements[0].startsWith(`CREATE TABLE "${source.table}"`) &&
        statements[1].startsWith(
          `CREATE UNIQUE INDEX "${source.table}_user_unique" ON "${source.table}"`
        );
  if (!allowed) throw new Error("SCHEMA_STATEMENT_SCOPE_INVALID");
  return statements;
}

export function createMiniAppSupportMigrationPlan(
  migration: MiniAppMigration
): TargetedAdditiveSchemaPlan {
  const source = MINI_APP_SUPPORT_MIGRATIONS[migration];
  const sources = [
    {
      tag: source.tag,
      hash: source.hash,
      statements: migration === "0394" ? 4 : 2,
    },
  ] as const;
  const required =
    migration === "0394"
      ? {
          columns: [
            "page_id",
            "stable_id",
            "tenant_id",
            "project_id",
            "app_id",
            "owner_principal_id",
            "path",
            "title",
            "content",
            "content_hash",
            "lifecycle",
            "created_at",
            "updated_at",
          ],
          constraints: [
            "mini_app_project_wiki_pages_pkey",
            "mini_app_project_wiki_pages_tenant_page_unique",
            "mini_app_project_wiki_pages_project_fk",
            "mini_app_project_wiki_pages_app_fk",
            "mini_app_project_wiki_pages_lifecycle_check",
            "mini_app_project_wiki_pages_path_nonempty_check",
            "mini_app_project_wiki_pages_path_lowercase_check",
            "mini_app_project_wiki_pages_title_nonempty_check",
            "mini_app_project_wiki_pages_owner_nonempty_check",
            "mini_app_project_wiki_pages_content_hash_check",
            "mini_app_project_wiki_pages_content_size_check",
          ],
          indexes: [
            "mini_app_project_wiki_pages_stable_id_unique",
            "mini_app_project_wiki_pages_active_path_unique",
            "mini_app_project_wiki_pages_updated_idx",
          ],
        }
      : {
          columns: [
            "id",
            "user_id",
            "tenant_id",
            "github_login",
            "token_encrypted",
            "created_at",
            "updated_at",
          ],
          constraints: [
            "user_github_connections_pkey",
            "user_github_connections_user_id_users_id_fk",
          ],
          indexes: ["user_github_connections_user_unique"],
        };
  const tableNames = [source.table];
  return {
    endpoint: source.endpoint,
    sources,
    tables: tableNames,
    selectSql: contents =>
      selectMiniAppSupportMigrationSql(migration, contents),
    validateAfter: catalog =>
      validateTable(
        catalog,
        source.table,
        required.columns,
        required.constraints,
        required.indexes
      ),
    driftError: "MINI_APP_SCHEMA_DRIFT",
  };
}

export async function inspectMiniAppSupportMigration(
  client: Client,
  migration: MiniAppMigration
) {
  return inspectTargetedAdditiveSchema(
    client,
    createMiniAppSupportMigrationPlan(migration)
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const migration = process.argv
    .find(value => value.startsWith("--migration="))
    ?.split("=")[1] as MiniAppMigration | undefined;
  if (!migration || !(migration in MINI_APP_SUPPORT_MIGRATIONS)) {
    console.error("MINI_APP_SCHEMA_MIGRATION_REQUIRED_0394_OR_0410");
    process.exitCode = 1;
  } else {
    runTargetedSchemaCli(createMiniAppSupportMigrationPlan(migration), {
      fingerprintVariable: "MINI_APP_SCHEMA_EXPECTED_FINGERPRINT",
      sourceFile: "scripts/mini-app-support-schema.ts",
    }).catch(error => {
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
}
