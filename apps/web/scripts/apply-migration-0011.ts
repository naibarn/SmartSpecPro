import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as fs from "fs";
import * as crypto from "crypto";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

const migration = fs.readFileSync("./drizzle/0011_add_audit_logging.sql", "utf-8");
const statements = migration
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

async function run() {
  for (const stmt of statements) {
    try {
      await db.execute(sql.raw(stmt));
      console.log("OK:", stmt.substring(0, 80));
    } catch (e: any) {
      if (
        e.message?.includes("already exists") ||
        e.message?.includes("duplicate")
      ) {
        console.log("SKIP (already exists):", stmt.substring(0, 80));
      } else {
        console.error("FAIL:", stmt.substring(0, 80));
        console.error(e.message);
      }
    }
  }

  // Seed hash into __drizzle_migrations
  const migrationContent = fs.readFileSync(
    "./drizzle/0011_add_audit_logging.sql",
    "utf-8"
  );
  const hash = crypto
    .createHash("sha256")
    .update(migrationContent)
    .digest("hex");
  try {
    await db.execute(
      sql.raw(
        `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ('${hash}', ${Date.now()}) ON CONFLICT DO NOTHING`
      )
    );
    console.log("Migration hash seeded:", hash.substring(0, 16) + "...");
  } catch (e: any) {
    console.error("Hash seed error:", e.message);
  }

  // Verify
  const result = await db.execute(
    sql.raw("SELECT count(*) as c FROM api_audit_events")
  );
  console.log("api_audit_events exists, row count:", result.rows[0]);

  const cols = await db.execute(
    sql.raw(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'provider_usage_log' AND column_name IN ('traceId', 'errorMessage', 'requestType') ORDER BY column_name`
    )
  );
  console.log(
    "New providerUsageLog columns:",
    cols.rows.map((r: any) => r.column_name)
  );

  await client.end();
  process.exit(0);
}
run();
