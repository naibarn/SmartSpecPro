import { activeSchemaContract } from "./schema-audit-policy";

type SchemaColumn = { name: string; default?: string | number | boolean };
type SchemaTable = {
  name: string;
  columns: Record<string, SchemaColumn>;
  foreignKeys?: Record<string, { tableTo?: string }>;
};
type ActiveSchema = {
  tables: Record<string, SchemaTable>;
  enums: Record<string, unknown>;
};

const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

function requiredSequences(schema: ActiveSchema) {
  const result = new Map<string, { table: string; column: string }>();
  for (const table of Object.values(schema.tables)) {
    for (const column of Object.values(table.columns)) {
      const expression = String(column.default ?? "");
      const match = expression.match(/^nextval\('((?:public\.)?[a-z_][a-z0-9_]*)'(?:::[a-z_][a-z0-9_.]*)?\)$/i);
      if (!match) continue;
      const sequence = match[1].replace(/^public\./, "");
      if (result.has(sequence)) throw new Error("DEV_ACTIVE_SCHEMA_SEQUENCE_DUPLICATE");
      result.set(sequence, { table: table.name, column: column.name });
    }
  }
  return result;
}

function statementKind(statement: string) {
  const normalized = statement.trim();
  if (/^CREATE\s+TYPE\b/i.test(normalized)) return "type";
  if (/^CREATE\s+TABLE\b/i.test(normalized)) return "table";
  if (/^CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(normalized)) return "index";
  if (/^ALTER\s+TABLE\b[\s\S]*\bADD\s+CONSTRAINT\b/i.test(normalized)) return "constraint";
  return "other";
}

function normalizeGeneratedCustomTypes(statement: string) {
  return statement.replace(/"(geography|geometry|vector)\(([^"\n]+)\)"/gi, "$1($2)");
}

export function buildDevActiveSchemaBaseline(input: {
  schema: ActiveSchema;
  migrationStatements: string[];
  securityStatements: string[];
}) {
  const { contract } = activeSchemaContract(input.schema);
  const sequences = requiredSequences(contract as ActiveSchema);
  const buckets: Record<"type" | "table" | "index" | "constraint" | "other", string[]> = {
    type: [], table: [], index: [], constraint: [], other: [],
  };
  for (const statement of input.migrationStatements) {
    const kind = statementKind(statement);
    if (/^CREATE\s+SEQUENCE\b/i.test(statement.trim())) continue;
    buckets[kind].push(normalizeGeneratedCustomTypes(statement.trim()).replace(/;+\s*$/, ""));
  }

  const createdTables = new Set(buckets.table.flatMap(statement => {
    const match = statement.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/i);
    return match ? [match[1]] : [];
  }));
  const expectedTables = new Set(Object.values(contract.tables).map(table => table.name));
  if (createdTables.size !== expectedTables.size || [...expectedTables].some(name => !createdTables.has(name))) {
    throw new Error("DEV_ACTIVE_SCHEMA_TABLE_SET_MISMATCH");
  }
  for (const table of Object.values(contract.tables)) {
    for (const foreignKey of Object.values(table.foreignKeys ?? {})) {
      if (foreignKey.tableTo && !expectedTables.has(foreignKey.tableTo)) {
        throw new Error("DEV_ACTIVE_SCHEMA_RETIRED_FOREIGN_KEY");
      }
    }
  }

  const sequenceEntries = [...sequences];
  const statements = [
    "CREATE EXTENSION IF NOT EXISTS pgcrypto",
    "CREATE EXTENSION IF NOT EXISTS vector",
    "CREATE EXTENSION IF NOT EXISTS postgis",
    ...buckets.type,
    ...sequenceEntries.map(([name]) => `CREATE SEQUENCE IF NOT EXISTS "public".${quoteIdentifier(name)}`),
    ...buckets.table,
    ...buckets.index,
    ...buckets.constraint,
    ...sequenceEntries.map(([name, owner]) =>
      `ALTER SEQUENCE "public".${quoteIdentifier(name)} OWNED BY "public".${quoteIdentifier(owner.table)}.${quoteIdentifier(owner.column)}`),
    ...buckets.other,
    ...input.securityStatements.map(statement => statement.trim().replace(/;+\s*$/, "")),
  ];
  const migrationBlock = statements.map((statement, index) => {
    const tag = `$dev_active_ddl_${index}$`;
    return `EXECUTE ${tag}${statement};${tag};`;
  }).join("\n");
  return [
    "DO $dev_active_schema_guard$ BEGIN",
    "  IF current_database() !~ '_dev(_web)?$' THEN RAISE EXCEPTION 'DEV_ACTIVE_SCHEMA_TARGET_REQUIRED'; END IF;",
    "  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')) THEN RAISE EXCEPTION 'DEV_ACTIVE_SCHEMA_TARGET_NOT_EMPTY'; END IF;",
    "END $dev_active_schema_guard$;",
    "DO $dev_active_schema_apply$ BEGIN",
    migrationBlock,
    "END $dev_active_schema_apply$;",
  ].join("\n");
}

export type DevActiveSchemaTargetEnvironment = {
  NODE_ENV?: string;
  SMARTSPEC_ENVIRONMENT?: string;
  SMARTSPEC_DEV_DATABASE_MODE?: string;
  DATABASE_URL?: string;
};

export function validateDevActiveSchemaTarget(environment: DevActiveSchemaTargetEnvironment) {
  try {
    const url = new URL(environment.DATABASE_URL ?? "");
    const databaseName = url.pathname.replace(/^\/+/, "");
    if (
      environment.NODE_ENV !== "development" ||
      environment.SMARTSPEC_ENVIRONMENT !== "development" ||
      environment.SMARTSPEC_DEV_DATABASE_MODE !== "development" ||
      !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) ||
      !/^[a-z0-9_-]*_dev(?:_web)?$/i.test(databaseName) ||
      !url.username
    ) throw new Error("DEV_ACTIVE_SCHEMA_TARGET_REQUIRED");
    return { host: url.hostname, databaseName, username: decodeURIComponent(url.username) };
  } catch (error) {
    if (error instanceof Error && error.message === "DEV_ACTIVE_SCHEMA_TARGET_REQUIRED") throw error;
    throw new Error("DEV_ACTIVE_SCHEMA_TARGET_REQUIRED");
  }
}

export function shouldBootstrapDevActiveSchema(input: {
  nodeEnv: string;
  environment: string;
  databaseMode: string;
  databaseName: string;
  applicationTableCount: number;
  migrationCount: number;
}) {
  return input.nodeEnv === "development" && input.environment === "development" &&
    input.databaseMode === "development" && /^[a-z0-9_-]*_dev(?:_web)?$/i.test(input.databaseName) &&
    input.applicationTableCount === 0 && input.migrationCount === 0;
}

export function selectDevMigrationProfile(input: {
  nodeEnv: string;
  environment: string;
  databaseMode: string;
  databaseName: string;
  applicationTableCount: number;
  migrationCount: number;
  baselineApplied?: boolean;
}): "dev-active-baseline" | "canonical" {
  const developmentTarget = input.nodeEnv === "development" && input.environment === "development" &&
    input.databaseMode === "development" && /^[a-z0-9_-]*_dev(?:_web)?$/i.test(input.databaseName);
  return developmentTarget && (input.baselineApplied === true || shouldBootstrapDevActiveSchema(input))
    ? "dev-active-baseline" : "canonical";
}

export function extractDevActiveSecurityStatements(
  migrations: Array<{ tag: string; sql: string }>,
  activeTableNames: Set<string>,
) {
  const statements: string[] = [];
  const allowedSecurityMigrations = new Set([
    "0139_private_personal_finance_security_backstop",
    "0141_private_personal_finance_counterparties",
    "0142_private_personal_finance_payment_instruments",
    "0353_spec231_inference_plans_attempts",
    "0354_spec231_policy_authority",
    "0355_spec231_qualification_profiles",
    "0356_spec231_inference_probe_runs",
    "0357_spec231_policy_revision_rollback_events",
    "0358_spec231_signed_rollout_bundles",
    "0381_spec265_266_durable_foundation",
    "0388_worker_job_event_context",
    "0396_project_wiki_package_candidate",
  ]);
  for (const migration of migrations) {
    if (!allowedSecurityMigrations.has(migration.tag)) continue;
    for (const statement of migration.sql.split(/-->\s*statement-breakpoint/i)) {
      const normalized = statement.trim();
      if (!normalized) continue;
      const rls = normalized.match(/^ALTER\s+TABLE\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+(?:ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/i);
      const policy = normalized.match(/^CREATE\s+POLICY\s+.+?\s+ON\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s/i);
      const trigger = normalized.match(/^(?:CREATE\s+TRIGGER\s+\S+[\s\S]*?\s+ON|DROP\s+TRIGGER\s+IF\s+EXISTS\s+\S+\s+ON)\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\b/i);
      const functionDefinition = /^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/i.test(normalized);
      if (rls || policy || trigger) {
        const table = (rls ?? policy ?? trigger)![1];
        if (activeTableNames.has(table)) statements.push(normalized.replace(/;+\s*$/, ""));
      } else if (functionDefinition) {
        const retiredRefs = [...normalized.matchAll(/(?:FROM|JOIN|UPDATE|INTO|ON)\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)]
          .map(match => match[1]).filter(name => /^(agency|agency_|sandbox_|workpack_|workflow_templates$|workflow_runs$|workflow_executions$|workflows$)/i.test(name));
        if (!retiredRefs.length) statements.push(normalized.replace(/;+\s*$/, ""));
      }
    }
  }
  return statements;
}
