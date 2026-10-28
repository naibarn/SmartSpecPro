import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, chmodSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg, { type Client as PgClient } from "pg";
import { fingerprintMigrationDatabase, type ScopedMigration } from "./scopedMigrationPreflight";
import { DRIZZLE_MIGRATION_ADVISORY_LOCK } from "../server/services/migrationExecutionLock";

const { Client } = pg;
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationDirectory = path.join(appRoot, "drizzle");

export const WORKSPACE_BINDINGS_0415_TARGET = Object.freeze({
  tag: "0415_spec293_canonical_project_workspace_bindings",
  when: 1793145600000,
  hash: "b635602614ef429255fd006ca40a6dbaf02be44eb1860edadd0a5b27942752f2",
  productionFingerprint: "sha256:67a8ab64ed2fab25355103df7e256b941bd3c2140ac62b7c797e106054ef5f83",
  productionConfirmation: "apply-core-0415-to-confirmed-production-database",
  lockKey: DRIZZLE_MIGRATION_ADVISORY_LOCK,
});

type AppliedMigration = { hash: string; created_at: number | string | null };
type MigrationReceipt = Record<string, unknown>;
type TargetFacts = {
  database: string;
  schema: string;
  role: string;
  serverAddress: string | null;
  serverPort: number | null;
  clusterName: string | null;
  serverVersion: string;
  sessionRoleMatches: boolean;
  writableSession: boolean;
  activeMigrationCandidates: number;
};
type WorkspaceSchemaState = {
  prerequisites: { runnerNodes: boolean; runnerIdentityColumns: boolean; canonicalProjects: boolean; canonicalProjectCompositeKey: boolean; auditEvents: boolean };
  duplicateRunnerIdentityGroups: number;
  bindingTableExists: boolean;
  bindingColumns: Array<{ name: string; type: string; maxLength: number | null; nullable: boolean; defaultValue: string | null }>;
  bindingConstraints: Array<{ name: string; valid: boolean; definition: string }>;
  bindingIndexes: Array<{ name: string; valid: boolean; unique: boolean; definition: string }>;
};
type WorkspaceBindingPreflight =
  | { status: "READY"; fingerprint: string; schema: WorkspaceSchemaState }
  | { status: "ALREADY_APPLIED"; fingerprint: string; schema: WorkspaceSchemaState }
  | { status: "BLOCKED"; reasons: string[]; fingerprint: string; schema: WorkspaceSchemaState };

const requiredColumns = [
  "id", "tenant_id", "project_id", "repository_id", "scope", "runner_id", "workspace_id",
  "lifecycle", "created_by_principal_id", "created_at", "updated_at", "revoked_at",
].sort();
const requiredConstraints = [
  "canonical_project_workspace_bindings_pkey",
  "canonical_project_workspace_bindings_project_fk",
  "canonical_project_workspace_bindings_runner_fk",
  "canonical_project_workspace_bindings_identity_unique",
  "canonical_project_workspace_bindings_scope_check",
  "canonical_project_workspace_bindings_lifecycle_check",
  "canonical_project_workspace_bindings_creator_check",
].sort();
const requiredIndexes = [
  "canonical_project_workspace_bindings_pkey",
  "canonical_project_workspace_bindings_identity_unique",
  "canonical_project_workspace_bindings_scope_idx",
  "runner_nodes_tenant_runner_unique",
].sort();
const expectedColumnTypes: Record<string, { type: string; maxLength: number | null; nullable: boolean }> = {
  id: { type: "varchar", maxLength: 36, nullable: false },
  tenant_id: { type: "varchar", maxLength: 36, nullable: false },
  project_id: { type: "varchar", maxLength: 36, nullable: false },
  repository_id: { type: "varchar", maxLength: 160, nullable: false },
  scope: { type: "varchar", maxLength: 32, nullable: false },
  runner_id: { type: "varchar", maxLength: 160, nullable: false },
  workspace_id: { type: "varchar", maxLength: 200, nullable: false },
  lifecycle: { type: "varchar", maxLength: 16, nullable: false },
  created_by_principal_id: { type: "varchar", maxLength: 160, nullable: false },
  created_at: { type: "timestamptz", maxLength: null, nullable: false },
  updated_at: { type: "timestamptz", maxLength: null, nullable: false },
  revoked_at: { type: "timestamptz", maxLength: null, nullable: true },
};

function definitionMatches(name: string, definition: string) {
  const normalized = definition.toLowerCase().replaceAll('"', "").replace(/\s+/g, " ")
    .replace(/\(([_a-z][a-z0-9_]*)\)::text/g, "$1");
  const requiredFragments: Record<string, string[]> = {
    canonical_project_workspace_bindings_project_fk: ["foreign key (tenant_id, project_id)", "references canonical_projects(tenant_id, project_id) on delete cascade"],
    canonical_project_workspace_bindings_runner_fk: ["foreign key (tenant_id, runner_id)", "references runner_nodes(tenantid, runnerid) on delete restrict"],
    canonical_project_workspace_bindings_identity_unique: ["unique (tenant_id, project_id, repository_id, scope, runner_id, workspace_id)"],
    canonical_project_workspace_bindings_scope_check: ["scope", "platform_engineering", "platform_managed", "admin_creator", "tenant", "user", "customer_external_org"],
    canonical_project_workspace_bindings_lifecycle_check: ["lifecycle", "active", "revoked_at", "revoked"],
    canonical_project_workspace_bindings_creator_check: ["length(btrim(created_by_principal_id)) > 0"],
  };
  return (requiredFragments[name] ?? []).every(fragment => normalized.includes(fragment));
}

function indexDefinitionMatches(name: string, definition: string) {
  const normalized = definition.toLowerCase().replaceAll('"', "").replace(/\s+/g, " ");
  const expected: Record<string, string> = {
    canonical_project_workspace_bindings_pkey: "using btree (id)",
    canonical_project_workspace_bindings_identity_unique: "using btree (tenant_id, project_id, repository_id, scope, runner_id, workspace_id)",
    canonical_project_workspace_bindings_scope_idx: "using btree (tenant_id, scope, lifecycle)",
    runner_nodes_tenant_runner_unique: "using btree (tenantid, runnerid)",
  };
  return normalized.includes(expected[name] ?? "__missing_index_definition__");
}

function schemaMismatchReasons(schema: WorkspaceSchemaState) {
  const reasons: string[] = [];
  if (!schema.prerequisites.runnerNodes) reasons.push("runner_nodes");
  if (!schema.prerequisites.runnerIdentityColumns) reasons.push("runner_identity_columns");
  if (!schema.prerequisites.canonicalProjects) reasons.push("canonical_projects");
  if (!schema.prerequisites.canonicalProjectCompositeKey) reasons.push("canonical_project_composite_key");
  if (!schema.prerequisites.auditEvents) reasons.push("api_audit_events");
  if (!schema.bindingTableExists) reasons.push("binding_table");
  if (JSON.stringify(schema.bindingColumns.map(column => column.name).sort()) !== JSON.stringify(requiredColumns)) reasons.push("binding_column_set");
  for (const column of schema.bindingColumns) {
      const expected = expectedColumnTypes[column.name];
      if (!expected || column.type !== expected.type || column.maxLength !== expected.maxLength || column.nullable !== expected.nullable) {
        reasons.push(`binding_column_contract:${column.name}`);
        continue;
      }
      const defaultValue = column.defaultValue?.toLowerCase().replace(/::[a-z ]+$/, "") ?? null;
      const expectedDefaults: Record<string, string | null> = {
        id: "gen_random_uuid()", lifecycle: "'active'", created_at: "now()", updated_at: "now()",
        tenant_id: null, project_id: null, repository_id: null, scope: null, runner_id: null,
        workspace_id: null, created_by_principal_id: null, revoked_at: null,
      };
      if (defaultValue !== expectedDefaults[column.name]) reasons.push(`binding_column_default:${column.name}`);
  }
  for (const name of requiredConstraints) {
    if (!schema.bindingConstraints.some(item => item.name === name && item.valid && definitionMatches(name, item.definition))) reasons.push(`constraint:${name}`);
  }
  for (const name of requiredIndexes) {
    const shouldBeUnique = ["canonical_project_workspace_bindings_pkey", "canonical_project_workspace_bindings_identity_unique", "runner_nodes_tenant_runner_unique"].includes(name);
    if (!schema.bindingIndexes.some(item => item.name === name && item.valid && item.unique === shouldBeUnique && indexDefinitionMatches(name, item.definition))) reasons.push(`index:${name}`);
  }
  return reasons;
}

export function evaluateWorkspaceBindings0415Preflight(input: {
  environment: string;
  expectedFingerprint: string;
  actualFingerprint: string;
  databaseTargetId: string;
  databaseUrlHost: string;
  targetFacts: { database: string; schema: string; role: string; sessionRoleMatches: boolean; writableSession: boolean };
  workflowRef: string;
  workflowPath: string;
  githubActions: boolean;
  sourceSha: string;
  journal: ScopedMigration[];
  applied: AppliedMigration[];
  schema: WorkspaceSchemaState;
  successfulReceiptExists: boolean;
  activeMigrationCandidates: number;
}): WorkspaceBindingPreflight {
  const reasons: string[] = [];
  const targetIndex = input.journal.findIndex(migration => migration.tag === WORKSPACE_BINDINGS_0415_TARGET.tag);
  const target = input.journal[targetIndex];
  if (!target || targetIndex < 1) reasons.push("target_migration_not_in_journal");
  if (target && (target.when !== WORKSPACE_BINDINGS_0415_TARGET.when || target.hash !== WORKSPACE_BINDINGS_0415_TARGET.hash)) {
    reasons.push("target_migration_checksum_or_timestamp_mismatch");
  }
  if (targetIndex !== input.journal.length - 1) reasons.push("later_migration_exists");
  if (!/^[a-f0-9]{40}$/.test(input.sourceSha)) reasons.push("source_sha_invalid");
  if (input.expectedFingerprint !== input.actualFingerprint) reasons.push("database_fingerprint_mismatch");
  if (input.targetFacts.schema !== "public") reasons.push("database_identity_mismatch");
  if (!input.targetFacts.sessionRoleMatches) reasons.push("session_role_switch_forbidden");
  if (!input.targetFacts.writableSession) reasons.push("database_session_read_only");
  if (input.activeMigrationCandidates !== 0) reasons.push("concurrent_migration_detected");
  if (input.applied.some(row => row.created_at == null)) reasons.push("migration_ledger_timestamp_invalid");
  const targetRows = input.applied.filter(row => Number(row.created_at) === WORKSPACE_BINDINGS_0415_TARGET.when);
  if (targetRows.length > 1) reasons.push("target_migration_ledger_duplicate");
  if (targetRows.some(row => row.hash !== WORKSPACE_BINDINGS_0415_TARGET.hash)) reasons.push("target_migration_hash_mismatch");
  if (input.applied.some(row => row.hash === WORKSPACE_BINDINGS_0415_TARGET.hash && Number(row.created_at) !== WORKSPACE_BINDINGS_0415_TARGET.when)) {
    reasons.push("target_hash_recorded_at_wrong_timestamp");
  }
  if (input.applied.some(row => Number(row.created_at) > WORKSPACE_BINDINGS_0415_TARGET.when)) reasons.push("ledger_ahead_of_target");
  const predecessor = input.journal[targetIndex - 1];
  const predecessorRows = predecessor ? input.applied.filter(row => Number(row.created_at) === predecessor.when) : [];
  if (predecessorRows.length !== 1) reasons.push("predecessor_ledger_missing_or_duplicated");
  if (predecessor && predecessorRows[0]?.hash !== predecessor.hash) reasons.push("predecessor_migration_checksum_mismatch");

  if (input.environment === "production") {
    if (input.targetFacts.database !== "smartspec" || input.targetFacts.role !== "smartspec") reasons.push("database_identity_mismatch");
    if (input.workflowRef !== "refs/heads/main") reasons.push("production_source_not_main");
    if (!input.githubActions || !input.workflowPath.endsWith("/.github/workflows/apply-core-0412-targeted-migration.yml@refs/heads/main")) reasons.push("production_authority_workflow_invalid");
    if (input.expectedFingerprint !== WORKSPACE_BINDINGS_0415_TARGET.productionFingerprint) reasons.push("production_fingerprint_not_allowlisted");
    if (input.databaseTargetId !== `smartaihub:production:${WORKSPACE_BINDINGS_0415_TARGET.productionFingerprint}`) reasons.push("production_target_id_mismatch");
    if (!input.databaseUrlHost.toLowerCase().endsWith(".neon.tech")) reasons.push("production_database_host_not_allowlisted");
  } else if (input.environment === "development") {
    if (!/(?:^|_)dev(?:_|$)/i.test(input.targetFacts.database) || !input.targetFacts.role.toLowerCase().endsWith("_dev")) {
      reasons.push("development_database_identity_mismatch");
    }
    if (input.databaseTargetId !== `smartaihub:development:${input.actualFingerprint}`) reasons.push("development_target_id_mismatch");
    if (!/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(input.databaseUrlHost)) reasons.push("development_database_not_loopback");
  } else {
    reasons.push("environment_not_allowed");
  }

  const schemaMismatches = schemaMismatchReasons(input.schema);
  const targetIsApplied = targetRows.length === 1 && targetRows[0].hash === WORKSPACE_BINDINGS_0415_TARGET.hash;
  if (input.schema.duplicateRunnerIdentityGroups > 0) reasons.push("duplicate_runner_identities_block_unique_index");
  if (!input.schema.prerequisites.runnerNodes) reasons.push("runner_nodes_prerequisite_missing");
  if (!input.schema.prerequisites.runnerIdentityColumns) reasons.push("runner_identity_columns_missing");
  if (!input.schema.prerequisites.canonicalProjects) reasons.push("canonical_projects_prerequisite_missing");
  if (!input.schema.prerequisites.canonicalProjectCompositeKey) reasons.push("canonical_project_composite_key_missing");
  if (!input.schema.prerequisites.auditEvents) reasons.push("migration_receipt_table_missing");
  if (targetIsApplied && schemaMismatches.length) reasons.push(`applied_ledger_schema_postcondition_mismatch:${schemaMismatches.join(",")}`);
  if (!targetIsApplied && input.schema.bindingTableExists) reasons.push("binding_table_exists_without_applied_migration");
  if (targetIsApplied && !input.successfulReceiptExists) reasons.push("successful_migration_receipt_missing");

  if (reasons.length) return { status: "BLOCKED", reasons: [...new Set(reasons)], fingerprint: input.actualFingerprint, schema: input.schema };
  if (targetIsApplied) return { status: "ALREADY_APPLIED", fingerprint: input.actualFingerprint, schema: input.schema };
  return { status: "READY", fingerprint: input.actualFingerprint, schema: input.schema };
}

function requiredEnvironment(name: string, env: NodeJS.ProcessEnv) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`MIGRATION_CONTEXT_MISSING_${name}`);
  return value;
}

async function readJournal(): Promise<{ entries: ScopedMigration[]; sql: string }> {
  const journal = JSON.parse(await readFile(path.join(migrationDirectory, "meta", "_journal.json"), "utf8")) as {
    entries?: Array<{ tag?: string; when?: number }>;
  };
  if (!Array.isArray(journal.entries)) throw new Error("MIGRATION_JOURNAL_INVALID");
  const entries = await Promise.all(journal.entries.map(async entry => {
    if (typeof entry.tag !== "string" || !Number.isSafeInteger(entry.when)) throw new Error("MIGRATION_JOURNAL_INVALID");
    const bytes = await readFile(path.join(migrationDirectory, `${entry.tag}.sql`));
    return { tag: entry.tag, when: entry.when as number, hash: createHash("sha256").update(bytes).digest("hex") };
  }));
  const target = entries.find(item => item.tag === WORKSPACE_BINDINGS_0415_TARGET.tag);
  if (!target) throw new Error("TARGET_MIGRATION_NOT_IN_JOURNAL");
  const source = await readFile(path.join(migrationDirectory, `${target.tag}.sql`), "utf8");
  if (!/^--[\s\S]*?BEGIN;[\s\S]*COMMIT;\s*$/.test(source.trim())) throw new Error("TARGET_MIGRATION_SHAPE_INVALID");
  const statements = source.replace(/^--.*$/gm, "").match(/[^;]+;/g)?.map(statement => statement.trim()) ?? [];
  const statementKinds = statements.map(statement => statement.match(/^([A-Z]+)/i)?.[1]?.toUpperCase());
  if (statementKinds.some(kind => !["BEGIN", "CREATE", "COMMIT"].includes(kind ?? "")) ||
      statements.some(statement => /^CREATE\s+(?:TEMP|TEMPORARY|UNLOGGED|OR\s+REPLACE)\b/i.test(statement))) {
    throw new Error("TARGET_MIGRATION_NOT_ADDITIVE_DDL");
  }
  return { entries, sql: source.trim().replace(/^--[^\n]*\n/, "").replace(/^BEGIN;\s*/i, "").replace(/\s*COMMIT;\s*$/i, "") };
}

async function readSchemaState(client: PgClient): Promise<WorkspaceSchemaState> {
  const prereq = await client.query<{ runner_nodes: boolean; canonical_projects: boolean; audit_events: boolean }>(`
    SELECT to_regclass('public.runner_nodes') IS NOT NULL AS runner_nodes,
      to_regclass('public.canonical_projects') IS NOT NULL AS canonical_projects,
      to_regclass('public.api_audit_events') IS NOT NULL AS audit_events`);
  const runnerColumns = prereq.rows[0]?.runner_nodes
    ? await client.query<{ count: number | string }>(`SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'runner_nodes' AND column_name IN ('tenantId', 'runnerId')`)
    : { rows: [{ count: 0 }] };
  const projectKey = prereq.rows[0]?.canonical_projects
    ? await client.query<{ exists: boolean }>(`SELECT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class t ON t.oid = i.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = 'public' AND t.relname = 'canonical_projects' AND i.indisunique AND i.indisvalid AND pg_get_indexdef(i.indexrelid) ILIKE '%(tenant_id, project_id)%') AS exists`)
    : { rows: [{ exists: false }] };
  const duplicateResult = prereq.rows[0]?.runner_nodes
    ? await client.query<{ count: number | string }>(`SELECT count(*)::int AS count FROM (
        SELECT "tenantId", "runnerId" FROM public.runner_nodes GROUP BY 1, 2 HAVING count(*) > 1
      ) duplicate_groups`)
    : { rows: [{ count: -1 }] };
  const tableExistsResult = await client.query<{ exists: boolean }>(`SELECT to_regclass('public.canonical_project_workspace_bindings') IS NOT NULL AS exists`);
  const bindingTableExists = Boolean(tableExistsResult.rows[0]?.exists);
  if (!bindingTableExists) {
    return {
      prerequisites: { runnerNodes: Boolean(prereq.rows[0]?.runner_nodes), runnerIdentityColumns: Number(runnerColumns.rows[0]?.count ?? 0) === 2, canonicalProjects: Boolean(prereq.rows[0]?.canonical_projects), canonicalProjectCompositeKey: Boolean(projectKey.rows[0]?.exists), auditEvents: Boolean(prereq.rows[0]?.audit_events) },
      duplicateRunnerIdentityGroups: Number(duplicateResult.rows[0]?.count ?? -1),
      bindingTableExists: false,
      bindingColumns: [], bindingConstraints: [], bindingIndexes: [],
    };
  }
  const columns = await client.query<{ column_name: string; type: string; max_length: number | null; nullable: boolean; default_value: string | null }>(`SELECT column_name, data_type AS type, character_maximum_length AS max_length, is_nullable = 'YES' AS nullable, column_default AS default_value FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'canonical_project_workspace_bindings' ORDER BY column_name`);
  const constraints = await client.query<{ name: string; valid: boolean; definition: string }>(`SELECT conname AS name, convalidated AS valid, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'public.canonical_project_workspace_bindings'::regclass`);
  const indexes = await client.query<{ name: string; valid: boolean; unique: boolean; definition: string }>(`SELECT i.relname AS name, x.indisvalid AS valid, x.indisunique AS "unique", pg_get_indexdef(i.oid) AS definition FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid WHERE x.indrelid IN ('public.canonical_project_workspace_bindings'::regclass, 'public.runner_nodes'::regclass)`);
  return {
    prerequisites: { runnerNodes: Boolean(prereq.rows[0]?.runner_nodes), runnerIdentityColumns: Number(runnerColumns.rows[0]?.count ?? 0) === 2, canonicalProjects: Boolean(prereq.rows[0]?.canonical_projects), canonicalProjectCompositeKey: Boolean(projectKey.rows[0]?.exists), auditEvents: Boolean(prereq.rows[0]?.audit_events) },
    duplicateRunnerIdentityGroups: Number(duplicateResult.rows[0]?.count ?? -1),
    bindingTableExists,
    bindingColumns: columns.rows.map(row => ({ name: row.column_name, type: row.type === "character varying" ? "varchar" : row.type === "timestamp with time zone" ? "timestamptz" : row.type, maxLength: row.max_length == null ? null : Number(row.max_length), nullable: row.nullable, defaultValue: row.default_value })),
    bindingConstraints: constraints.rows,
    bindingIndexes: indexes.rows,
  };
}

async function readPreflight(client: PgClient, env: NodeJS.ProcessEnv, journal: ScopedMigration[]): Promise<WorkspaceBindingPreflight> {
  const identity = await client.query<TargetFacts>(`
    SELECT current_database() AS database, current_schema() AS schema, current_user AS role,
      inet_server_addr()::text AS "serverAddress", inet_server_port() AS "serverPort",
      current_setting('cluster_name', true) AS "clusterName", current_setting('server_version') AS "serverVersion",
      session_user = current_user AS "sessionRoleMatches",
      current_setting('transaction_read_only') = 'off' AS "writableSession",
      (SELECT count(*)::int FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND state <> 'idle'
        AND (application_name ILIKE '%migrat%' OR query ILIKE '%__drizzle_migrations%')) AS "activeMigrationCandidates"`);
  const facts = identity.rows[0];
  if (!facts) throw new Error("DATABASE_IDENTITY_UNAVAILABLE");
  const actualFingerprint = fingerprintMigrationDatabase(facts);
  const ledger = await client.query<AppliedMigration>(`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC NULLS FIRST, id ASC`);
  const schema = await readSchemaState(client);
  const receipts = await client.query<{ metadata: MigrationReceipt | null }>(`SELECT "metadata" FROM public.api_audit_events WHERE "eventType" = 'migration_execution_receipt' ORDER BY "createdAt" DESC, "id" DESC LIMIT 500`);
  const successfulReceiptExists = receipts.rows.some(row => {
    const receipt = row.metadata;
    const requested = receipt?.requestedMigrationSet;
    return receipt?.phase === "SETTLED" && ["SUCCEEDED", "RECOVERED"].includes(String(receipt.result)) &&
      Array.isArray(requested) && requested.length === 1 && requested[0] === WORKSPACE_BINDINGS_0415_TARGET.tag &&
      receipt.expectedMigrationHead === WORKSPACE_BINDINGS_0415_TARGET.tag &&
      receipt.expectedMigrationHash === WORKSPACE_BINDINGS_0415_TARGET.hash &&
      receipt.appliedHash === WORKSPACE_BINDINGS_0415_TARGET.hash &&
      receipt.databaseTargetId === env.DATABASE_TARGET_ID && Boolean(receipt.authorizationReference);
  });
  const databaseUrl = new URL(env.DATABASE_URL ?? "");
  return evaluateWorkspaceBindings0415Preflight({
    environment: env.DEPLOY_ENVIRONMENT ?? "",
    expectedFingerprint: env.MIGRATION_EXPECTED_DATABASE_FINGERPRINT ?? "",
    actualFingerprint,
    databaseTargetId: env.DATABASE_TARGET_ID ?? "",
    databaseUrlHost: databaseUrl.hostname,
    targetFacts: { database: facts.database, schema: facts.schema, role: facts.role, sessionRoleMatches: facts.sessionRoleMatches, writableSession: facts.writableSession },
    workflowRef: env.GITHUB_REF ?? "local",
    workflowPath: env.GITHUB_WORKFLOW_REF ?? "",
    githubActions: env.GITHUB_ACTIONS === "true",
    sourceSha: env.GITHUB_SHA ?? env.SOURCE_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: appRoot, encoding: "utf8" }).trim(),
    journal,
    applied: ledger.rows,
    schema,
    successfulReceiptExists,
    activeMigrationCandidates: Number(facts.activeMigrationCandidates ?? -1),
  });
}

function writeExternalReceipt(receipt: MigrationReceipt, receiptPath: string) {
  mkdirSync(path.dirname(receiptPath), { recursive: true, mode: 0o700 });
  try { chmodSync(path.dirname(receiptPath), 0o700); } catch { /* best effort */ }
  appendFileSync(receiptPath, `${JSON.stringify(receipt)}\n`, { encoding: "utf8", mode: 0o600 });
  try { chmodSync(receiptPath, 0o600); } catch { /* best effort */ }
}

async function writeDbReceipt(client: PgClient, receipt: MigrationReceipt) {
  await client.query(`INSERT INTO public.api_audit_events ("traceId", "eventType", provider, endpoint, "statusCode", metadata)
    VALUES ($1, 'migration_execution_receipt', 'drizzle', 'core-0415-workspace-bindings', $2, $3::json)
    ON CONFLICT DO NOTHING`, [randomUUID().replaceAll("-", "").slice(0, 32), receipt.result === "FAILED" ? 500 : 200, JSON.stringify(receipt)]);
}

function verifyEnvironment(env: NodeJS.ProcessEnv, fingerprint: string) {
  const environment = requiredEnvironment("DEPLOY_ENVIRONMENT", env);
  const expectedFingerprint = requiredEnvironment("MIGRATION_EXPECTED_DATABASE_FINGERPRINT", env);
  const targetId = requiredEnvironment("DATABASE_TARGET_ID", env);
  requiredEnvironment("MIGRATION_AUTHORIZATION_REF", env);
  if (environment === "production") {
    if (env.GITHUB_REF !== "refs/heads/main" || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "")) throw new Error("PRODUCTION_SOURCE_NOT_CANONICAL_MAIN");
    if (env.GITHUB_ACTIONS !== "true" || !env.GITHUB_WORKFLOW_REF?.endsWith("/.github/workflows/apply-core-0412-targeted-migration.yml@refs/heads/main")) throw new Error("PRODUCTION_AUTHORITY_WORKFLOW_INVALID");
    if (env.CORE_0415_CONFIRMATION !== WORKSPACE_BINDINGS_0415_TARGET.productionConfirmation) throw new Error("PRODUCTION_CONFIRMATION_INVALID");
    if (expectedFingerprint !== WORKSPACE_BINDINGS_0415_TARGET.productionFingerprint || fingerprint !== expectedFingerprint) throw new Error("PRODUCTION_FINGERPRINT_NOT_ALLOWLISTED");
    if (targetId !== `smartaihub:production:${expectedFingerprint}`) throw new Error("PRODUCTION_TARGET_ID_INVALID");
    if (!new URL(requiredEnvironment("DATABASE_URL", env)).hostname.toLowerCase().endsWith(".neon.tech")) throw new Error("PRODUCTION_DATABASE_HOST_NOT_ALLOWLISTED");
  } else if (environment === "development") {
    const databaseUrl = new URL(requiredEnvironment("DATABASE_URL", env));
    if (!/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(databaseUrl.hostname)) throw new Error("DEVELOPMENT_DATABASE_NOT_LOOPBACK");
    if (expectedFingerprint !== fingerprint || targetId !== `smartaihub:development:${fingerprint}`) throw new Error("DEVELOPMENT_TARGET_ID_INVALID");
  } else {
    throw new Error("MIGRATION_ENVIRONMENT_NOT_ALLOWED");
  }
}

export async function runWorkspaceBindings0415Migration(env: NodeJS.ProcessEnv = process.env, mode: "preflight" | "apply" = "apply") {
  const databaseUrl = requiredEnvironment("DATABASE_URL", env);
  const authorizationReference = requiredEnvironment("MIGRATION_AUTHORIZATION_REF", env);
  if (authorizationReference.length < 8 || authorizationReference.length > 200) throw new Error("MIGRATION_AUTHORIZATION_REFERENCE_INVALID");
  const { entries: journal, sql } = await readJournal();
  const target = journal.find(migration => migration.tag === WORKSPACE_BINDINGS_0415_TARGET.tag)!;
  if (target.hash !== WORKSPACE_BINDINGS_0415_TARGET.hash) throw new Error("TARGET_MIGRATION_CHECKSUM_MISMATCH");
  const idempotencyKey = requiredEnvironment("MIGRATION_IDEMPOTENCY_KEY", env);
  const receiptPath = requiredEnvironment("MIGRATION_RECEIPT_FILE", env);
  const sourceSha = env.GITHUB_SHA ?? env.SOURCE_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: appRoot, encoding: "utf8" }).trim();
  const actor = env.GITHUB_ACTOR ?? env.USER ?? "development-operator";
  const base: MigrationReceipt = {
    schemaVersion: "migration-execution-receipt.v1", idempotencyKey, attemptNumber: 1,
    tenantId: null, projectId: "SmartAIHub", authorityScope: "PLATFORM_WIDE",
    environment: env.DEPLOY_ENVIRONMENT, databaseTargetId: env.DATABASE_TARGET_ID,
    databaseFingerprint: env.MIGRATION_EXPECTED_DATABASE_FINGERPRINT,
    migrationProvider: "drizzle", migrationRange: { from: "0414_spec224_mini_app_deployment_idempotency", to: target.tag },
    expectedMigrationHead: target.tag, expectedMigrationHash: target.hash, requestedMigrationSet: [target.tag],
    sourceSha, deploymentId: env.GITHUB_RUN_ID ?? null,
    executionId: env.GITHUB_RUN_ID ? `${env.GITHUB_RUN_ID}:${env.GITHUB_RUN_ATTEMPT ?? "1"}:core-0415` : idempotencyKey,
    startedAt: new Date().toISOString(), actor, authorizationReference,
  };
  const client = new Client({ connectionString: databaseUrl, application_name: "smartaihub-core-0415-workspace-bindings" });
  let connected = false;
  let lockAcquired = false;
  let transactionOpen = false;
  try {
    await client.connect();
    connected = true;
    const lock = await client.query<{ acquired: boolean }>(`SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired`, [WORKSPACE_BINDINGS_0415_TARGET.lockKey]);
    lockAcquired = lock.rows[0]?.acquired === true;
    if (!lockAcquired) throw new Error("MIGRATION_LOCK_BUSY");
    const initial = await readPreflight(client, env, journal);
    verifyEnvironment(env, initial.fingerprint);
    if (initial.status === "BLOCKED") throw new Error(`MIGRATION_PREFLIGHT_BLOCKED:${initial.reasons.join(",")}`);
    const priorRows = await client.query<{ metadata: MigrationReceipt | null }>(`SELECT "metadata" FROM public.api_audit_events WHERE "eventType" = 'migration_execution_receipt' AND "metadata"->>'idempotencyKey' = $1 ORDER BY "createdAt" DESC, "id" DESC`, [idempotencyKey]);
    const prior = priorRows.rows.find(row => row.metadata)?.metadata;
    if (prior) {
      if (prior.environment !== env.DEPLOY_ENVIRONMENT || prior.databaseTargetId !== env.DATABASE_TARGET_ID || prior.expectedMigrationHead !== target.tag || JSON.stringify(prior.requestedMigrationSet) !== JSON.stringify([target.tag])) {
        throw new Error("MIGRATION_IDEMPOTENCY_KEY_CONFLICT");
      }
      if (prior.phase === "SETTLED" && ["SUCCEEDED", "ALREADY_APPLIED"].includes(String(prior.result)) && initial.status === "ALREADY_APPLIED") {
        return { status: "ALREADY_APPLIED", receipt: prior, schema: initial.schema };
      }
      throw new Error(prior.phase === "STARTED" ? "MIGRATION_ATTEMPT_IN_PROGRESS" : "MIGRATION_ATTEMPT_ALREADY_FAILED");
    }
    if (mode === "preflight") {
      const receipt = initial.status === "ALREADY_APPLIED"
        ? { ...base, phase: "SETTLED", result: "ALREADY_APPLIED", outcome: "VERIFIED_EXISTING_RECEIPT_AND_SCHEMA", databaseFingerprint: initial.fingerprint, completedAt: new Date().toISOString() }
        : undefined;
      if (receipt) writeExternalReceipt(receipt, receiptPath);
      return { status: initial.status, ...(receipt ? { receipt } : {}), fingerprint: initial.fingerprint, migration: target, schema: initial.schema };
    }
    if (initial.status === "ALREADY_APPLIED") {
      const verified = { ...base, phase: "SETTLED", result: "ALREADY_APPLIED", outcome: "VERIFIED_EXISTING_RECEIPT_AND_SCHEMA", databaseFingerprint: initial.fingerprint, completedAt: new Date().toISOString() };
      await writeDbReceipt(client, verified);
      try { writeExternalReceipt(verified, receiptPath); } catch { console.error("MIGRATION_EXTERNAL_RECEIPT_WRITE_FAILED"); }
      return { status: initial.status, receipt: verified, schema: initial.schema };
    }
    if (!initial.schema.prerequisites.runnerNodes || !initial.schema.prerequisites.runnerIdentityColumns || !initial.schema.prerequisites.canonicalProjects || !initial.schema.prerequisites.canonicalProjectCompositeKey || !initial.schema.prerequisites.auditEvents) throw new Error("MIGRATION_PREREQUISITE_MISSING");
    if (initial.schema.duplicateRunnerIdentityGroups !== 0) throw new Error("DUPLICATE_RUNNER_IDENTITIES_BLOCK_UNIQUE_INDEX");
    const started = { ...base, phase: "STARTED", databaseFingerprint: initial.fingerprint, preflight: initial };
    await writeDbReceipt(client, started);
    writeExternalReceipt(started, receiptPath);
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    const locked = await readPreflight(client, env, journal);
    if (locked.status !== "READY" || locked.fingerprint !== initial.fingerprint) throw new Error("MIGRATION_PREFLIGHT_CHANGED");
    await client.query(sql);
    await client.query(`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`, [target.hash, target.when]);
    const appliedReceipt = { ...base, phase: "SETTLED", result: "SUCCEEDED", outcome: "APPLIED_AND_VERIFIED", databaseFingerprint: initial.fingerprint, appliedHash: target.hash, appliedHead: target.tag, completedAt: new Date().toISOString() };
    await writeDbReceipt(client, appliedReceipt);
    const post = await readPreflight(client, env, journal);
    if (post.status !== "ALREADY_APPLIED") throw new Error(`MIGRATION_POSTCONDITION_FAILED:${post.status === "BLOCKED" ? post.reasons.join(",") : "not-recorded"}`);
    const settled = { ...appliedReceipt, databaseFingerprint: post.fingerprint, schema: post.schema };
    await writeDbReceipt(client, settled);
    await client.query("COMMIT");
    transactionOpen = false;
    try { writeExternalReceipt(settled, receiptPath); } catch { console.error("MIGRATION_EXTERNAL_RECEIPT_WRITE_FAILED"); }
    return { status: "APPLIED", receipt: settled, schema: post.schema };
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    transactionOpen = false;
    const failureCode = error instanceof Error ? error.message.slice(0, 240) : "UNKNOWN";
    const failed = { ...base, phase: "SETTLED", result: "FAILED", failureCode, completedAt: new Date().toISOString() };
    try { writeExternalReceipt(failed, receiptPath); } catch { /* keep the original error */ }
    if (connected) await writeDbReceipt(client, failed).catch(() => undefined);
    throw new Error(`CORE_0415_MIGRATION_FAILED:${failureCode}`);
  } finally {
    if (lockAcquired) await client.query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [WORKSPACE_BINDINGS_0415_TARGET.lockKey]).catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const mode = process.argv.includes("--preflight") ? "preflight" : "apply";
  runWorkspaceBindings0415Migration(process.env, mode).then(result => console.log(JSON.stringify(result))).catch(error => {
    const message = error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[DATABASE_URL]").slice(0, 500) : "CORE_0415_MIGRATION_FAILED";
    console.error(message);
    process.exitCode = 1;
  });
}
