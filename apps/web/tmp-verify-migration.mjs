import pg from "pg";
import { config } from "dotenv";

config();

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();

  // Check if tables exist
  const result = await client.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN ('funnel_backfill_runs', 'funnel_backfill_checkpoints')
    ORDER BY tablename
  `);

  console.log("Tables found:", result.rows.map(r => r.tablename));

  // Check enums
  const enums = await client.query(`
    SELECT typname FROM pg_type
    WHERE typname IN ('backfill_run_status', 'reconciliation_status')
    ORDER BY typname
  `);

  console.log("Enums found:", enums.rows.map(r => r.typname));

  // Count rows in funnel_events
  const count = await client.query(`SELECT COUNT(*) as count FROM funnel_events`);
  console.log("funnel_events row count:", count.rows[0].count);

} catch (error) {
  console.error("Verification failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
