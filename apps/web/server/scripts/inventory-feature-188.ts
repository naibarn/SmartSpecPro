import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

export async function buildFeature188Inventory(environment = process.env.FEATURE_188_ENVIRONMENT?.trim() || "dev-mini") {
  const database = await getDb();
  if (!database) throw new Error("DATABASE_UNAVAILABLE");
  const signingKey = process.env.FEATURE_188_MANIFEST_SIGNING_KEY?.trim();
  if (!signingKey && process.env.NODE_ENV === "production") throw new Error("MANIFEST_SIGNING_KEY_REQUIRED");
  const rows = await database.execute(sql`
    SELECT n.nspname AS "schema", c.relname AS "table", c.reltuples::bigint AS "estimatedRows"
    FROM pg_class c
    INNER JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY n.nspname, c.relname
    LIMIT 2000
  `);
  const inventory = {
    manifestVersion: "feature-188-inventory-v1",
    environment,
    generatedAt: new Date().toISOString(),
    sourceAuthority: environment === "dev-mini" ? "dev-server-postgresql" : "declared-by-operator",
    schemaVersion: process.env.FEATURE_188_SCHEMA_VERSION?.trim() || "unknown-until-migration-check",
    tables: rows.map((row: any) => ({ schema: row.schema, table: row.table, estimatedRows: Number(row.estimatedRows ?? 0), disposition: "TRANSFER" })),
    dispositions: {
      durableBusinessData: "TRANSFER_OR_EXPLICIT_OWNER_APPROVED_DISPOSITION",
      queues: "RETAIN_ONLY",
      sessions: "REGENERATE",
      secrets: "PROHIBITED",
      signedUrls: "PROHIBITED",
    },
  };
  const body = JSON.stringify(inventory);
  const signature = createHmac("sha256", signingKey || "local-only-manifest-key").update(body).digest("hex");
  return { ...inventory, signature };
}

if (process.argv[1]?.endsWith("inventory-feature-188.ts")) {
  buildFeature188Inventory().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
