import { sql } from "drizzle-orm";
import { getDb } from "../db";

export interface AutoTeamMigrationTableStatus {
  name: string;
  present: boolean;
}

export interface AutoTeamMigrationColumnStatus {
  table: string;
  name: string;
  present: boolean;
}

export interface AutoTeamMigrationIndexStatus {
  table: string;
  name: string;
  present: boolean;
}

export interface AutoTeamMigrationVerificationSummary {
  tenantId: string;
  checkedAt: string;
  ok: boolean;
  tables: AutoTeamMigrationTableStatus[];
  workCaseAutomationColumns: AutoTeamMigrationColumnStatus[];
  teamRoomsLanguageColumn: AutoTeamMigrationColumnStatus;
  indexes: AutoTeamMigrationIndexStatus[];
  missingTables: string[];
  missingColumns: AutoTeamMigrationColumnStatus[];
  missingIndexes: AutoTeamMigrationIndexStatus[];
}

const REQUIRED_TABLES = [
  "auto_team_route_decisions",
  "auto_team_execution_stages",
  "auto_team_media_job_refs",
  "auto_team_review_records",
  "auto_team_final_results",
  "auto_team_trace_events",
  "auto_team_artifact_refs",
] as const;

const WORK_CASE_AUTOMATION_COLUMNS = [
  "automationRunId",
  "automationMode",
  "automationTemplateKey",
  "automationTemplateFamily",
  "automationTemplateSource",
  "automationPolicyJson",
  "automationStepId",
  "automationCheckpointId",
  "automationDisposition",
  "automationSummary",
  "automationUpdatedAt",
] as const;

const REQUIRED_INDEXES: Array<AutoTeamMigrationIndexStatus> = [
  { table: "auto_team_route_decisions", name: "auto_team_route_decisions_tenant_run_idempotency_unique", present: false },
  { table: "auto_team_execution_stages", name: "auto_team_execution_stages_tenant_run_step_attempt_unique", present: false },
  { table: "auto_team_execution_stages", name: "auto_team_execution_stages_tenant_run_idempotency_unique", present: false },
  { table: "auto_team_media_job_refs", name: "auto_team_media_job_refs_tenant_idempotency_unique", present: false },
  { table: "auto_team_review_records", name: "auto_team_review_records_tenant_run_review_idempotency_unique", present: false },
  { table: "auto_team_final_results", name: "auto_team_final_results_tenant_run_idempotency_unique", present: false },
  { table: "auto_team_trace_events", name: "auto_team_trace_events_tenant_run_sequence_unique", present: false },
  { table: "auto_team_trace_events", name: "auto_team_trace_events_tenant_run_idempotency_unique", present: false },
  { table: "auto_team_artifact_refs", name: "auto_team_artifact_refs_tenant_run_idempotency_unique", present: false },
];

async function tableExists(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  tableName: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
  `);
  return result.length > 0;
}

async function columnExists(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
      AND column_name = ${columnName}
  `);
  return result.length > 0;
}

async function indexExists(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  tableName: string,
  indexName: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = ${tableName}
      AND indexname = ${indexName}
  `);
  return result.length > 0;
}

export async function verifyAutoTeamMigrationBaseline(input: {
  tenantId: string;
}): Promise<AutoTeamMigrationVerificationSummary> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const tables = await Promise.all(
    REQUIRED_TABLES.map(async (name) => ({
      name,
      present: await tableExists(db, name),
    })),
  );

  const workCaseAutomationColumns = await Promise.all(
    WORK_CASE_AUTOMATION_COLUMNS.map(async (name) => ({
      table: "work_cases",
      name,
      present: await columnExists(db, "work_cases", name),
    })),
  );

  const teamRoomsLanguageColumn: AutoTeamMigrationColumnStatus = {
    table: "team_rooms",
    name: "language",
    present: await columnExists(db, "team_rooms", "language"),
  };

  const indexes = await Promise.all(
    REQUIRED_INDEXES.map(async (index) => ({
      ...index,
      present: await indexExists(db, index.table, index.name),
    })),
  );

  const missingTables = tables.filter((table) => !table.present).map((table) => table.name);
  const missingColumns = [
    ...workCaseAutomationColumns,
    teamRoomsLanguageColumn,
  ].filter((column) => !column.present);
  const missingIndexes = indexes.filter((index) => !index.present);

  return {
    tenantId: input.tenantId,
    checkedAt: new Date().toISOString(),
    ok: missingTables.length === 0 && missingColumns.length === 0 && missingIndexes.length === 0,
    tables,
    workCaseAutomationColumns,
    teamRoomsLanguageColumn,
    indexes,
    missingTables,
    missingColumns,
    missingIndexes,
  };
}
