#!/usr/bin/env tsx
/**
 * Manually apply migration 0013 (Telegram columns)
 * This script uses IF NOT EXISTS logic to safely apply the migration
 * even if some columns already exist in the database.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is not set");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql);

async function applyMigration() {
  const migrationPath = path.join(__dirname, "../drizzle/0013_apply_telegram_columns.sql");
  const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

  console.log("Applying migration 0013 (Telegram columns + fixes)...");

  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(migrationSQL);
    });
    console.log("✓ Migration applied successfully");

    // Verify Telegram columns were added
    const result = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name LIKE 'telegram%'
      ORDER BY column_name;
    `;

    console.log("\n✓ Telegram columns in users table:");
    result.forEach((row: any) => console.log(`  - ${row.column_name}`));

    // Verify passwordChangedAt was added
    const passwordCol = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name = 'passwordChangedAt';
    `;

    if (passwordCol.length > 0) {
      console.log("\n✓ passwordChangedAt column exists (drift fixed)");
    }

    // Row count check
    const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM users;`;
    console.log(`\n✓ Users table has ${count} rows (verify this matches pre-migration count)`);

  } catch (error) {
    console.error("✗ Migration failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

applyMigration();
