import { sql } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import type { ProductionDatabaseResourcePlan } from "./cloudflareProductionDatabaseProvision";

const ROLE_MARKER_PREFIX = "smartspec:cloudflare-production-runtime:v1:";
const FENCE_FUNCTION = "cloudflare_validate_emergency_intake_v1";
const FENCE_MARKER_PREFIX = "smartspec:cloudflare-production-fence:v1:";
const rolePattern = /^sah_cf_prod_[a-f0-9]{12}$/;
const passwordPattern = /^[A-Za-z0-9_-]{32,1024}$/;

const selectedColumns = {
  emergency_reports: ["id", "tenantId", "workerJobId", "status"],
  emergency_cases: ["id", "tenantId", "reportId", "revision", "caseContextJson"],
  emergency_case_events: ["caseId", "tenantId", "revision", "eventHash"],
} as const;

const fenceColumns = {
  worker_jobs: ["id", "tenantId", "attempt", "fencingVersion", "leaseOwnerToken", "status", "operatorReviewRequired", "leaseExpiresAt", "startedAt", "createdAt", "timeoutPolicyJson", "timeoutSeconds", "jobType", "executionClass", "runtimeType", "contractVersion", "inputJson"],
  worker_job_attempts: ["workerJobId", "attempt", "id", "leaseGeneration", "leaseTokenHash", "leaseExpiresAt"],
  worker_job_dispatches: ["workerJobId", "id", "dedupeKey", "adapter", "publicationStatus", "publishedAt", "failedAt"],
  worker_job_outbox: ["id", "workerJobId", "dedupeKey", "publishedAt", "cancelledAt", "quarantinedAt", "envelopeJson"],
} as const;

const updateColumns = {
  emergency_reports: ["status", "updatedAt"],
  emergency_cases: ["revision", "caseContextJson", "updatedAt"],
} as const;

const insertColumns = {
  emergency_case_events: ["tenantId", "caseId", "eventIdempotencyKey", "actorType", "actorRef", "eventType", "reason", "revision", "previousHash", "eventHash", "payloadJson", "createdAt"],
} as const;

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function tableName(table: string) {
  return `public.${quoteIdentifier(table)}`;
}

export function buildCloudflareProductionRuntimeRoleStatements(input: {
  role: string;
  databaseName: string;
  databasePassword: string;
  planDigest: string;
  existing: boolean;
}) {
  if (!rolePattern.test(input.role) || !/^[a-zA-Z0-9_]{1,63}$/.test(input.databaseName) ||
      !passwordPattern.test(input.databasePassword) || !/^[a-f0-9]{64}$/.test(input.planDigest)) {
    throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_ROLE_PLAN_INVALID");
  }
  const role = quoteIdentifier(input.role);
  const marker = `${ROLE_MARKER_PREFIX}${input.planDigest}`;
  const statements = [input.existing
    ? `ALTER ROLE ${role} LOGIN PASSWORD ${quoteLiteral(input.databasePassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5`
    : `CREATE ROLE ${role} LOGIN PASSWORD ${quoteLiteral(input.databasePassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5`];
  statements.push(`COMMENT ON ROLE ${role} IS ${quoteLiteral(marker)}`);
  statements.push(`REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${role}`);
  statements.push(`GRANT USAGE ON SCHEMA public TO ${role}`);
  statements.push(`GRANT CONNECT ON DATABASE ${quoteIdentifier(input.databaseName)} TO ${role}`);
  statements.push(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${role}`);
  statements.push(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${role}`);

  statements.push(`REVOKE ALL PRIVILEGES ON FUNCTION public.${FENCE_FUNCTION}(text,text,integer,text,integer,text,text,text,jsonb,text) FROM ${role}`);
  statements.push(`GRANT EXECUTE ON FUNCTION public.${FENCE_FUNCTION}(text,text,integer,text,integer,text,text,text,jsonb,text) TO ${role}`);

  for (const [table, columns] of Object.entries(selectedColumns)) {
    statements.push(`REVOKE ALL PRIVILEGES ON ${tableName(table)} FROM ${role}`);
    statements.push(`GRANT SELECT (${columns.map(quoteIdentifier).join(", ")}) ON ${tableName(table)} TO ${role}`);
  }
  for (const [table, columns] of Object.entries(updateColumns)) {
    statements.push(`GRANT UPDATE (${columns.map(quoteIdentifier).join(", ")}) ON ${tableName(table)} TO ${role}`);
  }
  for (const [table, columns] of Object.entries(insertColumns)) {
    statements.push(`GRANT INSERT (${columns.map(quoteIdentifier).join(", ")}) ON ${tableName(table)} TO ${role}`);
  }
  return { marker, statements };
}

/** Create or reconcile the narrowly scoped login referenced by the canonical Hyperdrive config. */
export async function prepareCloudflareProductionRuntimeRole(input: {
  db: DrizzleDB;
  plan: ProductionDatabaseResourcePlan;
  databasePassword: string;
  planDigest: string;
}) {
  const { plan, databasePassword, planDigest } = input;
  if (!rolePattern.test(plan.databaseUser) || !/^[a-f0-9]{64}$/.test(planDigest)) {
    throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_ROLE_PLAN_INVALID");
  }
  const marker = `${ROLE_MARKER_PREFIX}${planDigest}`;
  try {
    return await input.db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cloudflare-production-role:${plan.databaseUser}`}))`);
      const database = await tx.execute(sql`SELECT current_database() AS name`);
      if (database[0]?.name !== plan.databaseName) throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_ROLE_DATABASE_SCOPE_DENIED");
      const executor = await tx.execute(sql`SELECT rolsuper, rolcreaterole FROM pg_roles WHERE rolname=current_user`);
      if (executor[0]?.rolsuper !== true && executor[0]?.rolcreaterole !== true) {
        throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_ROLE_EXECUTOR_PRIVILEGE_MISSING");
      }
      const requiredColumns = [...Object.entries(selectedColumns), ...Object.entries(fenceColumns)]
        .flatMap(([table, columns]) => columns.map(column => [table, column] as const))
        .concat(Object.entries(updateColumns).flatMap(([table, columns]) => columns.map(column => [table, column] as const)))
        .concat(Object.entries(insertColumns).flatMap(([table, columns]) => columns.map(column => [table, column] as const)));
      const requiredTableNames = [...new Set([...Object.keys(selectedColumns), ...Object.keys(fenceColumns)])];
      const tableNameList = requiredTableNames.map(quoteLiteral).join(", ");
      const columnRows = await tx.execute(sql.raw(`SELECT table_name,column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name IN (${tableNameList})`));
      const available = new Set(columnRows.map((row: any) => `${row.table_name}.${row.column_name}`));
      if (requiredColumns.some(([table, column]) => !available.has(`${table}.${column}`))) {
        throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_ROLE_SCHEMA_MISMATCH");
      }
      const existingRows = await tx.execute(sql`SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolreplication,
        rolbypassrls, rolcanlogin, rolinherit, rolconnlimit, shobj_description(oid,'pg_authid') AS marker
        FROM pg_roles WHERE rolname=${plan.databaseUser}`);
      const existing = existingRows[0];
      if (existing && existing.marker !== marker) {
        throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_ROLE_OWNERSHIP_UNVERIFIED");
      }
      if (existing) {
        const memberships = await tx.execute(sql`SELECT 1 FROM pg_auth_members
          WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname=${plan.databaseUser})
             OR member=(SELECT oid FROM pg_roles WHERE rolname=${plan.databaseUser}) LIMIT 1`);
        if (memberships.length) throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_ROLE_MEMBERSHIP_UNVERIFIED");
      }
      const existingFunctionRows = await tx.execute(sql`SELECT p.prosecdef, p.proargtypes::text AS argument_types, obj_description(p.oid,'pg_proc') AS marker
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname=${FENCE_FUNCTION}`);
      const existingFunction = existingFunctionRows.find((row: any) => row.argument_types === "25 25 23 25 23 25 25 25 3802 25");
      const functionMarker = `${FENCE_MARKER_PREFIX}${planDigest}`;
      if (existingFunctionRows.length > 1 || (existingFunctionRows.length === 1 && !existingFunction)) {
        throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_ROLE_FENCE_FUNCTION_SIGNATURE_CONFLICT");
      }
      if (existingFunction && (existingFunction.marker !== functionMarker || existingFunction.prosecdef !== true)) {
        throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_ROLE_FENCE_FUNCTION_OWNERSHIP_UNVERIFIED");
      }
      if (!existingFunction) {
        await tx.execute(sql.raw(`CREATE FUNCTION public.${FENCE_FUNCTION}(
          p_job_id text,p_tenant_id text,p_attempt integer,p_attempt_id text,p_fencing_version integer,p_lease_hash text,
          p_dispatch_id text,p_dedupe_key text,p_input jsonb,p_adapter text
        ) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
        BEGIN
          PERFORM 1 FROM public.worker_jobs w
          JOIN public.worker_job_attempts a ON a."workerJobId"=w.id AND a.attempt=w.attempt
          JOIN public.worker_job_dispatches d ON d."workerJobId"=w.id AND d.id=p_dispatch_id AND d."dedupeKey"=p_dedupe_key
          JOIN public.worker_job_outbox o ON o.id=d.id AND o."workerJobId"=w.id AND o."dedupeKey"=d."dedupeKey"
          WHERE w.id=p_job_id AND w."tenantId"=p_tenant_id AND w.attempt=p_attempt AND a.id=p_attempt_id
            AND w."fencingVersion"=p_fencing_version AND a."leaseGeneration"=p_fencing_version
            AND w."leaseOwnerToken"=p_lease_hash AND a."leaseTokenHash"=p_lease_hash
            AND w.status='running' AND w."operatorReviewRequired"=false
            AND w."leaseExpiresAt">clock_timestamp() AND a."leaseExpiresAt">clock_timestamp()
            AND EXTRACT(EPOCH FROM (clock_timestamp()-COALESCE(w."startedAt",w."createdAt")))*1000 <
              CASE WHEN (w."timeoutPolicyJson"->>'hardTimeoutMs') ~ '^[0-9]+([.][0-9]+)?$'
                AND (w."timeoutPolicyJson"->>'hardTimeoutMs')::numeric>0
              THEN (w."timeoutPolicyJson"->>'hardTimeoutMs')::numeric ELSE w."timeoutSeconds"::numeric*1000 END
            AND w."jobType"='emergency.report.intake' AND w."executionClass"='short'
            AND w."runtimeType"='node_job_worker' AND w."contractVersion"='feature-186-v1'
            AND w."inputJson"=p_input AND d.adapter=p_adapter
            AND d."publicationStatus" IN ('published','consumed') AND d."publishedAt" IS NOT NULL AND d."failedAt" IS NULL
            AND o."publishedAt" IS NOT NULL AND o."cancelledAt" IS NULL AND o."quarantinedAt" IS NULL
            AND (o."envelopeJson"->>'businessAttempt') ~ '^[0-9]+$'
            AND (o."envelopeJson"->>'businessAttempt')::int=p_attempt
          FOR UPDATE OF w,a;
          RETURN FOUND;
        END;
        $function$`));
        await tx.execute(sql.raw(`COMMENT ON FUNCTION public.${FENCE_FUNCTION}(text,text,integer,text,integer,text,text,text,jsonb,text) IS '${functionMarker}'`));
        await tx.execute(sql.raw(`REVOKE ALL ON FUNCTION public.${FENCE_FUNCTION}(text,text,integer,text,integer,text,text,text,jsonb,text) FROM PUBLIC`));
      }
      const { statements } = buildCloudflareProductionRuntimeRoleStatements({ role: plan.databaseUser,
        databaseName: plan.databaseName, databasePassword, planDigest, existing: Boolean(existing) });
      const managedTables = new Set([...Object.keys(selectedColumns), ...Object.keys(updateColumns), ...Object.keys(insertColumns)]);
      const columnsByTable = new Map<string, string[]>();
      for (const row of columnRows as any[]) {
        if (!managedTables.has(row.table_name)) continue;
        const columns = columnsByTable.get(row.table_name) ?? [];
        columns.push(row.column_name);
        columnsByTable.set(row.table_name, columns);
      }
      const columnRevokes = [...columnsByTable].map(([table, columns]) =>
        `REVOKE ALL PRIVILEGES (${columns.map(quoteIdentifier).join(", ")}) ON ${tableName(table)} FROM ${quoteIdentifier(plan.databaseUser)}`);
      for (const [index, statement] of statements.entries()) {
        if (index === 1) for (const revoke of columnRevokes) await tx.execute(sql.raw(revoke));
        await tx.execute(sql.raw(statement));
      }
      const verified = await tx.execute(sql`SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls,
        rolcanlogin, rolinherit, rolconnlimit, shobj_description(oid,'pg_authid') AS marker
        FROM pg_roles WHERE rolname=${plan.databaseUser}`);
      const role = verified[0];
      if (!role || role.rolsuper || role.rolcreaterole || role.rolcreatedb || role.rolreplication || role.rolbypassrls ||
          !role.rolcanlogin || role.rolinherit || role.rolconnlimit !== plan.connectionLimit || role.marker !== marker) {
        throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_ROLE_READBACK_MISMATCH");
      }
      const forbidden = await tx.execute(sql`SELECT
        has_table_privilege(${plan.databaseUser}, 'public.worker_jobs', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS jobs_access,
        has_table_privilege(${plan.databaseUser}, 'public.worker_job_attempts', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS attempts_access,
        has_table_privilege(${plan.databaseUser}, 'public.worker_job_dispatches', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS dispatches_access,
        has_table_privilege(${plan.databaseUser}, 'public.worker_job_outbox', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS outbox_access,
        has_table_privilege(${plan.databaseUser}, 'public.worker_jobs', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS control_write,
        has_table_privilege(${plan.databaseUser}, 'public.emergency_reports', 'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS report_forbidden,
        has_table_privilege(${plan.databaseUser}, 'public.emergency_cases', 'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS case_forbidden,
        has_table_privilege(${plan.databaseUser}, 'public.emergency_case_events', 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS event_forbidden`);
      if (forbidden[0]?.jobs_access || forbidden[0]?.attempts_access || forbidden[0]?.dispatches_access || forbidden[0]?.outbox_access ||
          forbidden[0]?.control_write || forbidden[0]?.report_forbidden || forbidden[0]?.case_forbidden || forbidden[0]?.event_forbidden) {
        throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_ROLE_PRIVILEGE_EXCESS");
      }
      const functionAccess = await tx.execute(sql`SELECT has_function_privilege(${plan.databaseUser},
        ${`public.${FENCE_FUNCTION}(text,text,integer,text,integer,text,text,text,jsonb,text)`}, 'EXECUTE') AS allowed`);
      if (functionAccess[0]?.allowed !== true) throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_ROLE_FENCE_FUNCTION_PRIVILEGE_MISSING");
      return { role: plan.databaseUser, databaseName: plan.databaseName, connectionLimit: plan.connectionLimit,
        rolePrepared: true as const, leastPrivilegeScope: "cloudflare_emergency_intake_v1" as const,
        tableCount: Object.keys(selectedColumns).length, ownershipMarker: marker };
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CLOUDFLARE_PRODUCTION_DATABASE_ROLE_")) throw error;
    throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_ROLE_PREPARATION_FAILED", { cause: error });
  }
}
