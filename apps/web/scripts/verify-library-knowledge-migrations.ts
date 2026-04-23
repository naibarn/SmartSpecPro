import "dotenv/config";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import postgres from "postgres";

const migrationNames = [
  "0157_library_md_knowledge_vault.sql",
  "0158_library_index_job_payloads.sql",
  "0159_library_context_pack_review_events.sql",
  "0160_library_knowledge_telemetry_events.sql",
  "0161_library_knowledge_release_gate_overrides.sql",
  "0162_library_knowledge_override_governance.sql",
] as const;

const requiredTables = [
  "library_knowledge_notes",
  "library_knowledge_relations",
  "library_knowledge_backfill_runs",
  "library_knowledge_telemetry_events",
  "library_knowledge_release_gate_overrides",
] as const;

const requiredColumns: Record<(typeof requiredTables)[number], readonly string[]> = {
  library_knowledge_notes: [
    "library_item_id",
    "tenant_id",
    "logical_path",
    "normalized_title",
    "aliases",
    "tags",
    "properties",
    "headings",
    "diagnostics",
    "content_fingerprint",
    "source_updated_at",
    "last_extracted_at",
    "last_visibility_refresh_at",
    "last_backfilled_at",
    "is_stale",
    "stale_reason",
    "created_at",
    "updated_at",
  ],
  library_knowledge_relations: [
    "id",
    "tenant_id",
    "source_library_item_id",
    "target_library_item_id",
    "relation_kind",
    "raw_reference",
    "display_text",
    "target_path",
    "target_heading",
    "resolution_status",
    "matched_by",
    "matched_value",
    "candidate_library_item_ids",
    "diagnostics",
    "extracted_at",
    "updated_at",
  ],
  library_knowledge_backfill_runs: [
    "id",
    "tenant_id",
    "requested_by_user_id",
    "status",
    "total_notes",
    "processed_notes",
    "successful_notes",
    "failed_notes",
    "retry_count",
    "last_cursor_library_item_id",
    "last_error",
    "started_at",
    "completed_at",
    "created_at",
    "updated_at",
  ],
  library_knowledge_telemetry_events: [
    "id",
    "tenant_id",
    "event_type",
    "surface",
    "sample_count",
    "metric_json",
    "created_at",
  ],
  library_knowledge_release_gate_overrides: [
    "id",
    "tenant_id",
    "status",
    "override_mode",
    "reason",
    "scope_type",
    "scope_id",
    "actor_user_id",
    "approved_by_user_id",
    "approved_at",
    "approval_reason",
    "rejected_at",
    "rejected_by_user_id",
    "rejected_reason",
    "expires_at",
    "metadata",
    "created_at",
    "updated_at",
  ],
};

type SqlClient = ReturnType<typeof postgres>;

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function readPresentKnowledgeTables(sql: SqlClient) {
  return sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name = any(${requiredTables as unknown as string[]})
    order by table_name
  `;
}

async function repairKnowledgeSchema(
  sql: SqlClient,
  tableNames: Set<string>,
): Promise<void> {
  if (tableNames.has("library_knowledge_notes")) {
    await sql.unsafe(`
      ALTER TABLE IF EXISTS "library_knowledge_notes"
        ADD COLUMN IF NOT EXISTS "logical_path" varchar(512),
        ADD COLUMN IF NOT EXISTS "normalized_title" varchar(512) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "aliases" json NOT NULL DEFAULT '[]'::json,
        ADD COLUMN IF NOT EXISTS "tags" json NOT NULL DEFAULT '[]'::json,
        ADD COLUMN IF NOT EXISTS "properties" json NOT NULL DEFAULT '{}'::json,
        ADD COLUMN IF NOT EXISTS "headings" json NOT NULL DEFAULT '[]'::json,
        ADD COLUMN IF NOT EXISTS "diagnostics" json NOT NULL DEFAULT '{}'::json,
        ADD COLUMN IF NOT EXISTS "content_fingerprint" varchar(128),
        ADD COLUMN IF NOT EXISTS "source_updated_at" timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "last_extracted_at" timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "last_visibility_refresh_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "last_backfilled_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "is_stale" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "stale_reason" varchar(64),
        ADD COLUMN IF NOT EXISTS "created_at" timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now()
    `);
    await sql.unsafe(`
      UPDATE "library_knowledge_notes" AS notes
      SET
        "normalized_title" = CASE
          WHEN coalesce(notes."normalized_title", '') = '' THEN lower(trim(items."title"))
          ELSE notes."normalized_title"
        END,
        "source_updated_at" = coalesce(notes."source_updated_at", items."updated_at", now()),
        "last_extracted_at" = coalesce(notes."last_extracted_at", now()),
        "created_at" = coalesce(notes."created_at", now()),
        "updated_at" = coalesce(notes."updated_at", items."updated_at", now())
      FROM "library_items" AS items
      WHERE items."id" = notes."library_item_id"
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS "library_knowledge_notes_tenant_logical_path_idx"
        ON "library_knowledge_notes" ("tenant_id", "logical_path")
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS "library_knowledge_notes_tenant_title_idx"
        ON "library_knowledge_notes" ("tenant_id", "normalized_title")
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS "library_knowledge_notes_tenant_stale_idx"
        ON "library_knowledge_notes" ("tenant_id", "is_stale", "updated_at")
    `);
  }

  if (tableNames.has("library_knowledge_relations")) {
    await sql.unsafe(`
      ALTER TABLE IF EXISTS "library_knowledge_relations"
        ADD COLUMN IF NOT EXISTS "display_text" text,
        ADD COLUMN IF NOT EXISTS "target_path" varchar(512),
        ADD COLUMN IF NOT EXISTS "target_heading" varchar(255),
        ADD COLUMN IF NOT EXISTS "matched_by" varchar(64),
        ADD COLUMN IF NOT EXISTS "matched_value" varchar(512),
        ADD COLUMN IF NOT EXISTS "candidate_library_item_ids" json NOT NULL DEFAULT '[]'::json,
        ADD COLUMN IF NOT EXISTS "diagnostics" json NOT NULL DEFAULT '{}'::json,
        ADD COLUMN IF NOT EXISTS "extracted_at" timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now()
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS "library_knowledge_relations_source_idx"
        ON "library_knowledge_relations" ("source_library_item_id", "relation_kind")
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS "library_knowledge_relations_target_idx"
        ON "library_knowledge_relations" ("target_library_item_id", "relation_kind")
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS "library_knowledge_relations_resolution_idx"
        ON "library_knowledge_relations" ("tenant_id", "resolution_status", "updated_at")
    `);
  }

  if (tableNames.has("library_knowledge_backfill_runs")) {
    await sql.unsafe(`
      ALTER TABLE IF EXISTS "library_knowledge_backfill_runs"
        ADD COLUMN IF NOT EXISTS "retry_count" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "last_cursor_library_item_id" integer,
        ADD COLUMN IF NOT EXISTS "last_error" text,
        ADD COLUMN IF NOT EXISTS "started_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "completed_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "created_at" timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now()
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS "library_knowledge_backfill_runs_tenant_status_idx"
        ON "library_knowledge_backfill_runs" ("tenant_id", "status", "updated_at")
    `);
  }
}

function migrationHash(name: (typeof migrationNames)[number]): string {
  const filePath = path.join(process.cwd(), "drizzle", name);
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath, "utf8"))
    .digest("hex");
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const repairLedger = hasFlag("--repair-ledger");
  const repairSchema = hasFlag("--repair-schema");
  const sql = postgres(databaseUrl, {
    max: 1,
  });

  try {
    const presentTablesBeforeRepair = await readPresentKnowledgeTables(sql);
    const presentTableSetBeforeRepair = new Set(
      presentTablesBeforeRepair.map((row) => row.table_name),
    );

    if (repairSchema) {
      await repairKnowledgeSchema(sql, presentTableSetBeforeRepair);
    }

    const presentTables = await readPresentKnowledgeTables(sql);

    const drizzleSchemaRows = await sql<{ schema_name: string }[]>`
      select schema_name
      from information_schema.schemata
      where schema_name = 'drizzle'
      limit 1
    `;
    const ledgerRows = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'drizzle'
        and table_name = '__drizzle_migrations'
      limit 1
    `;

    if (repairLedger) {
      await sql.unsafe(`create schema if not exists drizzle`);
      await sql.unsafe(`
        create table if not exists drizzle.__drizzle_migrations (
          id serial primary key,
          hash text not null unique,
          created_at bigint
        )
      `);

      for (const [index, name] of migrationNames.entries()) {
        const hash = migrationHash(name);
        const existingRows = await sql<{ hash: string }[]>`
          select hash
          from drizzle.__drizzle_migrations
          where hash = ${hash}
          limit 1
        `;

        if (existingRows.length === 0) {
          await sql`
            insert into drizzle.__drizzle_migrations (hash, created_at)
            values (${hash}, ${Date.now() + index})
          `;
        }
      }
    }

    const presentColumns = await sql<{
      table_name: string;
      column_name: string;
    }[]>`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = any(${requiredTables as unknown as string[]})
      order by table_name, ordinal_position
    `;
    const presentColumnsByTable = presentColumns.reduce<Record<string, Set<string>>>(
      (accumulator, row) => {
        accumulator[row.table_name] ??= new Set<string>();
        accumulator[row.table_name]?.add(row.column_name);
        return accumulator;
      },
      {},
    );
    const missingColumns = Object.fromEntries(
      Object.entries(requiredColumns).map(([tableName, columns]) => [
        tableName,
        columns.filter(
          (columnName) => !presentColumnsByTable[tableName]?.has(columnName),
        ),
      ]),
    ) as Record<(typeof requiredTables)[number], string[]>;

    const ledgerHashes = await sql<{ hash: string }[]>`
      select hash
      from drizzle.__drizzle_migrations
      order by created_at asc
    `.catch(() => []);

    const notesCount = presentTables.some((row) => row.table_name === "library_knowledge_notes")
      ? await sql<{ count: number }[]>`
          select count(*)::int as count
          from library_knowledge_notes
        `
      : [{ count: 0 }];
    const relationsCount = presentTables.some((row) => row.table_name === "library_knowledge_relations")
      ? await sql<{ count: number }[]>`
          select count(*)::int as count
          from library_knowledge_relations
        `
      : [{ count: 0 }];
    const lastBackfill = presentTables.some((row) => row.table_name === "library_knowledge_backfill_runs")
      ? await sql<{ id: number; tenant_id: string; status: string; updated_at: string }[]>`
          select id, tenant_id, status, updated_at::text
          from library_knowledge_backfill_runs
          order by updated_at desc
          limit 1
        `
      : [];

    const expectedHashes = migrationNames.map((name) => migrationHash(name));
    const recordedHashes = new Set(ledgerHashes.map((row) => row.hash));

    const summary = {
      repairSchema,
      repairLedger,
      requiredTables,
      tablesPresent: presentTables.map((row) => row.table_name),
      missingTables: requiredTables.filter(
        (tableName) => !presentTables.some((row) => row.table_name === tableName),
      ),
      missingColumns,
      drizzleSchemaPresent: drizzleSchemaRows.length > 0 || repairLedger,
      ledgerPresent: ledgerRows.length > 0 || repairLedger,
      expectedMigrationHashes: expectedHashes.length,
      recordedKnowledgeMigrationHashes: expectedHashes.filter((hash) =>
        recordedHashes.has(hash),
      ).length,
      missingKnowledgeMigrationHashes: expectedHashes.filter((hash) =>
        !recordedHashes.has(hash),
      ),
      knowledgeCounts: {
        notes: notesCount[0]?.count ?? 0,
        relations: relationsCount[0]?.count ?? 0,
      },
      lastBackfillRun: lastBackfill[0] ?? null,
    };

    console.log(JSON.stringify(summary, null, 2));

    const healthy =
      summary.missingTables.length === 0 &&
      Object.values(summary.missingColumns).every((columns) => columns.length === 0) &&
      summary.ledgerPresent &&
      summary.recordedKnowledgeMigrationHashes === expectedHashes.length;

    if (!healthy) {
      process.exitCode = 1;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("[verify-library-knowledge-migrations] failed:", error);
  process.exit(1);
});
