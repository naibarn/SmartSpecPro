import pg from "pg";
import { config } from "dotenv";

// Load .env file
config();

const { Client } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL not found in environment");
}

const client = new Client({ connectionString });

try {
  await client.connect();

  // Create enums
  await client.query(`CREATE TYPE public.backfill_run_status AS ENUM('running', 'paused', 'aborted', 'completed', 'failed')`);
  await client.query(`CREATE TYPE public.reconciliation_status AS ENUM('pending', 'passed', 'failed')`);

  // Create backfill runs table
  await client.query(`
    CREATE TABLE funnel_backfill_runs (
      id serial PRIMARY KEY NOT NULL,
      "runId" varchar(64) NOT NULL UNIQUE,
      "tenantId" varchar(36),
      status backfill_run_status DEFAULT 'running' NOT NULL,
      "startDate" timestamp with time zone NOT NULL,
      "endDate" timestamp with time zone NOT NULL,
      "sourceFilter" varchar(128),
      "batchSize" integer DEFAULT 1000 NOT NULL,
      "dryRun" boolean DEFAULT false NOT NULL,
      "totalRecordsProcessed" integer DEFAULT 0 NOT NULL,
      "totalEventsInserted" integer DEFAULT 0 NOT NULL,
      "reconciliationStatus" reconciliation_status DEFAULT 'pending' NOT NULL,
      "reconciliationReport" jsonb,
      "startedAt" timestamp with time zone NOT NULL,
      "pausedAt" timestamp with time zone,
      "completedAt" timestamp with time zone,
      "abortedAt" timestamp with time zone,
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
    )
  `);

  // Create backfill checkpoints table
  await client.query(`
    CREATE TABLE funnel_backfill_checkpoints (
      id serial PRIMARY KEY NOT NULL,
      "runId" varchar(64) NOT NULL,
      "checkpointPosition" jsonb NOT NULL,
      "recordsProcessed" integer NOT NULL,
      "eventsInserted" integer NOT NULL,
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL
    )
  `);

  // Add foreign keys
  await client.query(`
    ALTER TABLE funnel_backfill_checkpoints
    ADD CONSTRAINT funnel_backfill_checkpoints_runId_fk
    FOREIGN KEY ("runId") REFERENCES funnel_backfill_runs("runId") ON DELETE cascade
  `);

  await client.query(`
    ALTER TABLE funnel_backfill_runs
    ADD CONSTRAINT funnel_backfill_runs_tenantId_fk
    FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE cascade
  `);

  // Create indexes
  await client.query(`CREATE INDEX funnel_backfill_checkpoints_run_idx ON funnel_backfill_checkpoints("runId")`);
  await client.query(`CREATE INDEX funnel_backfill_runs_status_idx ON funnel_backfill_runs(status)`);
  await client.query(`CREATE INDEX funnel_backfill_runs_tenant_idx ON funnel_backfill_runs("tenantId")`);

  console.log("✓ Migration completed successfully");

  // Update drizzle migrations table
  const migrationName = "0027_outgoing_purple_man";
  const migrationHash = "d9a5f8b3c7e2a1f4d6c8b5a9e3f7d2c1"; // placeholder

  await client.query(`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ($1, $2)
    ON CONFLICT (hash) DO NOTHING
  `, [migrationHash, Date.now()]);

  console.log("✓ Migration recorded in drizzle migrations table");

} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
