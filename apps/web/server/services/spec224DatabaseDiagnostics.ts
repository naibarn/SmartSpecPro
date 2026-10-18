import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";

import type { DrizzleDB } from "../db";
import { getSpec224BackendRuntimeIdentity } from "./spec224BackendRuntimeIdentity";
import { getDrizzleMigrationEvidence } from "./drizzleMigrationEvidence";

type DiagnosticDb = Pick<DrizzleDB, "execute">;

type DatabaseIdentityRow = {
  database_name: string | null;
  schema_name: string | null;
  effective_role: string | null;
  server_address: string | null;
  server_port: number | null;
  cluster_name: string | null;
  server_version: string | null;
};

type EnumRow = { labels: string[] | null };
type MigrationConcurrencyRow = { active_candidates: number | string };

type FailedRunRow = {
  trace_id: string;
  created_at: Date | string;
  run_id: string | null;
  error_code: string | null;
  backend_environment: string | null;
  backend_revision: string | null;
  backend_instance_id: string | null;
};

function migrationLedgerProjection(
  evidence: Awaited<ReturnType<typeof getDrizzleMigrationEvidence>>
) {
  const value = evidence.value;
  const target = value?.expectedMigrations?.find(
    migration => migration.tag === "0395_spec224_external_runtime_job_type"
  );
  const targetApplied =
    target &&
    value?.appliedMigrations?.some(migration => migration.hash === target.hash);
  const target0395 =
    evidence.status !== "OBSERVED" || !value || !target
      ? "UNKNOWN"
      : targetApplied
        ? "APPLIED"
        : value.pendingMigrations.some(
              migration => migration.hash === target.hash
            )
          ? "PENDING"
          : "UNKNOWN";

  return {
    status: evidence.status,
    currentState: value?.currentState ?? "UNKNOWN",
    appliedHead: value?.observedAppliedHead?.tag ?? null,
    pendingCount: value?.pendingMigrations.length ?? null,
    unknownAppliedCount:
      value?.appliedMigrations?.filter(migration => migration.tag === null)
        .length ?? null,
    target0395,
    reconciliationState: value?.executionReconciliation.state ?? "UNKNOWN",
    latestExecutionState: value?.latestExecution?.result ?? "UNKNOWN",
  };
}

/** Read-only, exact-admin diagnostics for identifying the DB used by SPEC-224 run creation. */
export async function getSpec224DatabaseDiagnostics(input: {
  db: DiagnosticDb;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const runtime = getSpec224BackendRuntimeIdentity(input.env);
  const identityRows = (await input.db.execute(sql<Array<DatabaseIdentityRow>>`
    SELECT
      current_database() AS database_name,
      current_schema() AS schema_name,
      current_user AS effective_role,
      inet_server_addr()::text AS server_address,
      inet_server_port() AS server_port,
      current_setting('cluster_name', true) AS cluster_name,
      current_setting('server_version') AS server_version
  `)) as unknown as Array<DatabaseIdentityRow>;
  const identity = identityRows[0];

  const fingerprintParts = [
    identity?.server_address ?? "unknown-address",
    identity?.server_port == null
      ? "unknown-port"
      : String(identity.server_port),
    identity?.cluster_name ?? "unknown-cluster",
    identity?.database_name ?? "unknown-database",
    identity?.schema_name ?? "unknown-schema",
    identity?.effective_role ?? "unknown-role",
    identity?.server_version ?? "unknown-version",
  ];
  const instanceFingerprint = `sha256:${createHash("sha256").update(fingerprintParts.join("\u0000")).digest("hex")}`;

  const enumRows = (await input.db.execute(sql<Array<EnumRow>>`
    SELECT array_agg(enum_value.enumlabel ORDER BY enum_value.enumsortorder) AS labels
    FROM pg_type AS enum_type
    JOIN pg_namespace AS enum_namespace ON enum_namespace.oid = enum_type.typnamespace
    JOIN pg_enum AS enum_value ON enum_value.enumtypid = enum_type.oid
    WHERE enum_namespace.nspname = 'public'
      AND enum_type.typname = 'worker_runtime_type'
    GROUP BY enum_type.oid
  `)) as unknown as Array<EnumRow>;

  let migrationConcurrency: {
    status: "OBSERVED" | "UNAVAILABLE";
    activeCandidates: number | null;
  } = {
    status: "UNAVAILABLE",
    activeCandidates: null,
  };
  try {
    const activeRows = (await input.db.execute(sql<
      Array<MigrationConcurrencyRow>
    >`
      SELECT count(*)::int AS active_candidates
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND state <> 'idle'
        AND (
          application_name ILIKE '%migrat%'
          OR query ILIKE '%__drizzle_migrations%'
          OR query ILIKE '%worker_runtime_type%'
        )
    `)) as unknown as Array<MigrationConcurrencyRow>;
    migrationConcurrency = {
      status: "OBSERVED",
      activeCandidates: Number(activeRows[0]?.active_candidates ?? 0),
    };
  } catch {
    // A restricted database role may not be able to inspect concurrent activity.
  }

  const migrationEvidence = await getDrizzleMigrationEvidence({
    db: input.db,
    environment: runtime.environment,
    now,
  });
  let failedRun: FailedRunRow | null = null;
  let runCreationErrorCorrelationStatus:
    "OBSERVED" | "TABLE_UNAVAILABLE" | "PERMISSION_DENIED" = "OBSERVED";
  try {
    const failures = (await input.db.execute(sql<Array<FailedRunRow>>`
      SELECT
        "traceId" AS trace_id,
        "createdAt" AS created_at,
        "metadata"->>'runId' AS run_id,
        "metadata"->>'errorCode' AS error_code,
        "metadata"->'backendRuntime'->>'environment' AS backend_environment,
        "metadata"->'backendRuntime'->>'runtimeRevision' AS backend_revision,
        "metadata"->'backendRuntime'->>'instanceId' AS backend_instance_id
      FROM "api_audit_events"
      WHERE "eventType" = 'spec226_development_control'
        AND "metadata"->>'action' = 'start_workspace_run'
        AND "metadata"->>'accepted' = 'false'
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 1
    `)) as unknown as FailedRunRow[];
    failedRun = failures[0] ?? null;
  } catch (error) {
    // Some historical databases predate this audit table. Do not let that hide DB identity.
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code === "42P01")
      runCreationErrorCorrelationStatus = "TABLE_UNAVAILABLE";
    else if (code === "42501")
      runCreationErrorCorrelationStatus = "PERMISSION_DENIED";
    else throw error;
  }

  return {
    observedAt: now.toISOString(),
    backend: runtime,
    database: {
      instanceFingerprint,
      name: identity?.database_name ?? null,
      schema: identity?.schema_name ?? null,
      effectiveRole: identity?.effective_role ?? null,
    },
    migrationLedger: migrationLedgerProjection(migrationEvidence),
    migrationConcurrency,
    runCreationErrorCorrelationStatus,
    workerRuntimeType: {
      exists: enumRows.length > 0,
      labels: enumRows[0]?.labels ?? [],
    },
    runCreationErrorCorrelation: failedRun
      ? {
          traceId: failedRun.trace_id,
          observedAt: new Date(failedRun.created_at).toISOString(),
          runId: failedRun.run_id,
          errorCode: failedRun.error_code,
          backendEnvironment: failedRun.backend_environment,
          backendRevision: failedRun.backend_revision,
          backendInstanceId: failedRun.backend_instance_id,
          instanceCorrelation: failedRun.backend_instance_id
            ? "EXACT_INSTANCE"
            : "TRACE_ONLY",
        }
      : null,
  };
}
