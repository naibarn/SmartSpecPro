import { createHash } from "node:crypto";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import { systemSettings, workerJobs } from "../../drizzle/schema";
import { appendJobEvent } from "./jobControlPlane";
import { createCloudflareProductionDatabaseRuntime, CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT, CLOUDFLARE_PRODUCTION_DATABASE_JOB } from "./cloudflareProductionDatabaseExecutor";
import { inspectProductionDatabaseRecovery } from "./cloudflareProductionDatabaseRecovery";
import { readProductionDatabaseReadbackObservation, productionDatabaseEvidenceDigest } from "./cloudflareProductionDatabaseReconciliation";

const CATEGORY = "cloudflare_production_tenant_fixtures";
export const M1_ISOLATION_TABLES = ["emergency_reports", "emergency_cases", "emergency_case_events"] as const;
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** Bind the role to an immutable tenant, not just a user-settable GUC. A
 * restrictive policy ANDs with every permissive policy, so SETting another
 * tenant cannot widen access. PUBLIC's permissive policy preserves existing
 * privileges for unrelated Linux roles; it grants no table/column privileges. */
export function buildProductionTenantIsolationPolicy(input: { role: string; tenantId: string; planDigest: string }) {
  if (!/^sah_cf_prod_[a-f0-9]{12}$/.test(input.role) || !/^[A-Za-z0-9_.-]{1,36}$/.test(input.tenantId) || !/^[a-f0-9]{64}$/.test(input.planDigest))
    throw Error("M1_ISOLATION_SCOPE_INVALID");
  const binding = productionDatabaseEvidenceDigest(input);
  const allowName = "cloudflare_existing_privileges_v1", restrictName = `cloudflare_tenant_${input.role.slice(-12)}`;
  const marker = `smartspec:cloudflare-tenant-isolation:v1:${binding}`;
  const predicate = `("tenantId" = ${quote(input.tenantId)} AND current_setting('smartspec.tenant_id', true) = ${quote(input.tenantId)})`;
  const statements = M1_ISOLATION_TABLES.flatMap(table => [
    `CREATE POLICY "${allowName}" ON public."${table}" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true)`,
    `COMMENT ON POLICY "${allowName}" ON public."${table}" IS 'smartspec:cloudflare-existing-privileges:v1'`,
    `CREATE POLICY "${restrictName}" ON public."${table}" AS RESTRICTIVE FOR ALL TO "${input.role}" USING ${predicate} WITH CHECK ${predicate}`,
    `COMMENT ON POLICY "${restrictName}" ON public."${table}" IS ${quote(marker)}`,
    `ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY`,
  ]);
  return { binding, marker, allowName, restrictName, statements };
}

type Scope = { jobId: string; tenantId: string; projectId: string; actorUserId: number };
async function authority(db: DrizzleDB, scope: Scope) {
  const [job] = await db.select().from(workerJobs).where(eq(workerJobs.id, scope.jobId)).limit(1);
  if (!job || job.jobType !== CLOUDFLARE_PRODUCTION_DATABASE_JOB || job.contractVersion !== CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT ||
      job.status !== "failed" || job.attempt !== 4 || job.maxAttempts !== 4 || job.leaseExpiresAt ||
      job.tenantId !== scope.tenantId || job.requestedByUserId !== scope.actorUserId || job.inputJson?.projectId !== scope.projectId)
    throw Error("M1_ISOLATION_ORIGINAL_JOB_SCOPE_DENIED");
  const owners = await db.execute(sql`SELECT 1 FROM tenants t JOIN users u ON u.id=${scope.actorUserId}
    JOIN canonical_projects p ON p.tenant_id=t.id AND p.project_id=${scope.projectId}
    WHERE t.id=${scope.tenantId} AND t."ownerId"=u.id AND t."isActive" AND u.role='admin' AND NOT u."isDisabled"
      AND p.lifecycle='ACTIVE' AND p.owner_principal_id=${`user:${scope.actorUserId}`}`);
  if (owners.length !== 1) throw Error("M1_ISOLATION_OWNER_REQUIRED");
  const planDigest = String(job.inputJson?.planDigest ?? "");
  const observed = await readProductionDatabaseReadbackObservation(db, { jobId: scope.jobId, tenantId: scope.tenantId, projectId: scope.projectId, planDigest });
  if (!observed?.databaseConnectionVerified || !observed.restrictedRoleVerified) throw Error("M1_ISOLATION_CANONICAL_SQL_REQUIRED");
  const runtime = createCloudflareProductionDatabaseRuntime({ db });
  const identity = await runtime.resolveGrant(job.id);
  if (!identity || identity.grant.requesterUserId !== scope.actorUserId || identity.grant.planDigest !== planDigest)
    throw Error("M1_ISOLATION_ORIGINAL_PLAN_REQUIRED");
  // The expired provisioning grant supplies identity only. A NEW authenticated
  // Owner Admin action authorizes this bounded database hardening/fixture step.
  const readback = await inspectProductionDatabaseRecovery({ runtime, ...scope, requesterUserId: scope.actorUserId, planDigest });
  if (!readback.hyperdriveId) throw Error("M1_ISOLATION_HYPERDRIVE_REQUIRED");
  const role = identity.grant.plan.databaseUser;
  const rows = await db.execute(sql`SELECT (SELECT current_database()) AS database,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit,
    shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=${role}`);
  if (rows.length !== 1 || rows[0].database !== identity.grant.plan.databaseName || rows[0].rolsuper || rows[0].rolbypassrls ||
      rows[0].rolcreaterole || rows[0].rolcreatedb || rows[0].rolinherit || rows[0].marker !== `smartspec:cloudflare-production-runtime:v1:${planDigest}`)
    throw Error("M1_ISOLATION_ROLE_IDENTITY_DENIED");
  const functions = await db.execute(sql`SELECT n.nspname,p.proname,p.proargtypes::text AS argument_types,obj_description(p.oid,'pg_proc') AS marker
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema')
    AND has_function_privilege(${role},p.oid,'EXECUTE')`);
  if (functions.length !== 1 || functions[0].nspname !== "public" || functions[0].proname !== "cloudflare_validate_emergency_intake_v1" ||
      functions[0].argument_types !== "25 25 23 25 23 25 25 25 3802 25" || functions[0].marker !== `smartspec:cloudflare-production-fence:v1:${planDigest}`)
    throw Error("M1_ISOLATION_SECURITY_DEFINER_REVIEW_REQUIRED");
  return { job, role, planDigest, readback };
}

export async function getProductionTenantIsolationPreflight(db: DrizzleDB, scope: Scope) {
  const bound = await authority(db, scope);
  const [existing] = await db.select().from(systemSettings).where(and(eq(systemSettings.category, CATEGORY), eq(systemSettings.key, scope.jobId))).limit(1);
  if (existing) {
    const value = existing.valueJson as Record<string, any>;
    if (existing.updatedBy !== scope.actorUserId || value.tenantId !== scope.tenantId || value.projectId !== scope.projectId || value.planDigest !== bound.planDigest)
      throw Error("M1_ISOLATION_FIXTURE_SCOPE_DENIED");
    return { ready: true as const, prepared: true as const, fixture: value };
  }
  const fixtures = await db.execute(sql`SELECT id FROM tenants WHERE id LIKE 'tenant-codex-%' AND slug ~ '^codex-uat(-|$)'
    AND "ownerId"=${scope.actorUserId} AND id<>${scope.tenantId} ORDER BY id LIMIT 1`);
  const fixtureSuffix = createHash("sha256").update(`m1-isolation-tenant:${scope.jobId}:${scope.actorUserId}`).digest("hex").slice(0,12);
  const foreignTestTenantId = fixtures[0] ? String(fixtures[0].id) : `tenant-codex-${fixtureSuffix}`;
  const foreignTestTenantSlug = `codex-uat-cloudflare-${fixtureSuffix}`;
  if (!fixtures[0]) {
    const collision = await db.execute(sql`SELECT 1 FROM tenants WHERE id=${foreignTestTenantId} OR slug=${foreignTestTenantSlug}`);
    if (collision.length) throw Error("M1_ISOLATION_FIXTURE_TENANT_COLLISION");
  }
  const schema = await db.execute(sql`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('emergency_reports','emergency_cases','emergency_case_events')`);
  const policies = await db.execute(sql`SELECT policyname FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('emergency_reports','emergency_cases','emergency_case_events')`);
  const triggers = await db.execute(sql`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN
    ('public.emergency_reports'::regclass,'public.emergency_cases'::regclass,'public.emergency_case_events'::regclass)`);
  if (schema.length !== 3 || schema.some(row => row.relrowsecurity || row.relforcerowsecurity || row.owner === bound.role) || policies.length || triggers.length)
    throw Error("M1_ISOLATION_EXISTING_POLICY_OR_TRIGGER_REVIEW_REQUIRED");
  const plan = { jobId: scope.jobId, tenantId: scope.tenantId, projectId: scope.projectId, actorUserId: scope.actorUserId,
    role: bound.role, planDigest: bound.planDigest, foreignTestTenantId, foreignTestTenantSlug,
    createInactiveTestTenant: !fixtures[0],
    originalFencingVersion: bound.job.fencingVersion, originalInputDigest: productionDatabaseEvidenceDigest(bound.job.inputJson),
    vpcServiceId: bound.readback.vpcServiceId, hyperdriveId: bound.readback.hyperdriveId };
  return { ready: true as const, prepared: false as const, plan, actionDigest: productionDatabaseEvidenceDigest(plan),
    syntheticRows: 6, businessRowsRead: 0, businessRowsWritten: 0, trafficMutation: false };
}

/** Short, atomic Owner-admin operation, not a provisioning retry. No new job,
 * grant, VPC or Hyperdrive. LOCK/statement timeouts bound its DDL transaction. */
export async function prepareProductionTenantIsolation(db: DrizzleDB, scope: Scope & { actionDigest: string }) {
  const preflight = await getProductionTenantIsolationPreflight(db, scope);
  if (preflight.prepared) return preflight.fixture;
  if (preflight.actionDigest !== scope.actionDigest) throw Error("M1_ISOLATION_PLAN_CHANGED");
  return db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL lock_timeout='2s'`);
    await tx.execute(sql`SET LOCAL statement_timeout='5s'`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`m1-isolation:${scope.jobId}`}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cloudflare-production-role:${preflight.plan.role}`}))`);
    const [existing] = await tx.select().from(systemSettings).where(and(eq(systemSettings.category, CATEGORY), eq(systemSettings.key, scope.jobId))).limit(1);
    if (existing) return existing.valueJson;
    const [current] = await tx.select().from(workerJobs).where(eq(workerJobs.id, scope.jobId)).for("update");
    if (!current || current.tenantId !== scope.tenantId || current.requestedByUserId !== scope.actorUserId || current.status !== "failed" ||
        current.attempt !== 4 || current.maxAttempts !== 4 || current.leaseExpiresAt || current.fencingVersion !== preflight.plan.originalFencingVersion ||
        productionDatabaseEvidenceDigest(current.inputJson) !== preflight.plan.originalInputDigest) throw Error("M1_ISOLATION_JOB_CHANGED");
    const owners = await tx.execute(sql`SELECT t.id FROM tenants t JOIN users u ON u.id=${scope.actorUserId}
      WHERE t.id=${scope.tenantId} AND t."ownerId"=u.id AND t."isActive" AND u.role='admin' AND NOT u."isDisabled" FOR UPDATE OF t,u`);
    const role = await tx.execute(sql`SELECT rolname FROM pg_roles WHERE rolname=${preflight.plan.role}
      AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolinherit
      AND shobj_description(oid,'pg_authid')=${`smartspec:cloudflare-production-runtime:v1:${preflight.plan.planDigest}`}`);
    if (owners.length !== 1 || role.length !== 1) throw Error("M1_ISOLATION_AUTHORITY_CHANGED");
    const projects = await tx.execute(sql`SELECT project_id FROM canonical_projects WHERE project_id=${scope.projectId} AND tenant_id=${scope.tenantId}
      AND lifecycle='ACTIVE' AND owner_principal_id=${`user:${scope.actorUserId}`} FOR KEY SHARE`);
    if (projects.length !== 1) throw Error("M1_ISOLATION_PROJECT_CHANGED");
    // Fail closed on concurrent DDL instead of changing an unknown baseline.
    const policies = await tx.execute(sql`SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename IN ('emergency_reports','emergency_cases','emergency_case_events')`);
    if (policies.length) throw Error("M1_ISOLATION_BASELINE_CHANGED");
    const policy = buildProductionTenantIsolationPolicy({ role: preflight.plan.role, tenantId: scope.tenantId, planDigest: preflight.plan.planDigest });
    for (const statement of policy.statements) await tx.execute(sql.raw(statement));
    if (preflight.plan.createInactiveTestTenant) {
      await tx.execute(sql`INSERT INTO tenants(id,slug,name,"ownerId","isActive") VALUES(${preflight.plan.foreignTestTenantId},
        ${preflight.plan.foreignTestTenantSlug},'Cloudflare migration isolated synthetic fixture',${scope.actorUserId},false)`);
    } else {
      const fixtureTenant = await tx.execute(sql`SELECT id FROM tenants WHERE id=${preflight.plan.foreignTestTenantId}
        AND "ownerId"=${scope.actorUserId} AND id LIKE 'tenant-codex-%' AND slug ~ '^codex-uat(-|$)' FOR KEY SHARE`);
      if (fixtureTenant.length !== 1) throw Error("M1_ISOLATION_FIXTURE_TENANT_CHANGED");
    }
    const fixtures = [];
    for (const tenantId of [scope.tenantId, preflight.plan.foreignTestTenantId]) {
      const id = (kind: string) => {
        const h = createHash("sha256").update(`m1-isolation:v1:${scope.jobId}:${tenantId}:${kind}`).digest("hex");
        return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
      };
      const reportId = id("report"), caseId = id("case"), eventId = id("event"), marker = `m1-isolation:${scope.jobId}`;
      await tx.execute(sql`INSERT INTO emergency_reports(id,"tenantId","publicRef","idempotencyKeyHash","reportType",status,summary,"detailsJson")
        VALUES(${reportId},${tenantId},${reportId.replaceAll("-", "").slice(0,24)},${productionDatabaseEvidenceDigest({reportId})},
          'cloudflare_migration_test','closed','Synthetic Cloudflare tenant isolation fixture',${JSON.stringify({marker,synthetic:true})}::jsonb)`);
      await tx.execute(sql`INSERT INTO emergency_cases(id,"tenantId","reportId",status,"caseContextJson")
        VALUES(${caseId},${tenantId},${reportId},'closed',${JSON.stringify({marker,synthetic:true})}::jsonb)`);
      await tx.execute(sql`INSERT INTO emergency_case_events(id,"tenantId","caseId","eventIdempotencyKey","actorType","actorRef","eventType",reason,revision,"eventHash","payloadJson")
        VALUES(${eventId},${tenantId},${caseId},${marker},'system','cloudflare-migration','migration.isolation.fixture',
          'Synthetic acceptance fixture only',1,${productionDatabaseEvidenceDigest({eventId})},${JSON.stringify({marker,synthetic:true})}::jsonb)`);
      fixtures.push({ tenantId, reportId, caseId, eventId });
    }
    // Fail atomically before recording approval success if the real restricted
    // role cannot read its fixture or can see the foreign fixture. This is a
    // local preparation guard, never Cloudflare acceptance evidence.
    await tx.execute(sql.raw(`SET LOCAL ROLE "${preflight.plan.role}"`));
    for (const context of [scope.tenantId, preflight.plan.foreignTestTenantId, ""]) {
      await tx.execute(sql`SELECT set_config('smartspec.tenant_id',${context},true)`);
      for (const table of M1_ISOLATION_TABLES) {
        const column = table === "emergency_case_events" ? "caseId" : "id";
        const ids = fixtures.map(f => table === "emergency_reports" ? f.reportId : f.caseId);
        const rows = await tx.execute(sql`SELECT "tenantId" FROM ${sql.identifier(table)} WHERE ${sql.identifier(column)} IN (${ids[0]},${ids[1]}) LIMIT 3`);
        if (context === scope.tenantId ? rows.length !== 1 || rows[0]?.tenantId !== scope.tenantId : rows.length !== 0)
          throw Error("M1_ISOLATION_LOCAL_FIXTURE_GUARD_FAILED");
      }
    }
    await tx.execute(sql`RESET ROLE`);
    const receipt = { schemaVersion: "cloudflare-production-tenant-fixtures-v1", ...preflight.plan, actionDigest: preflight.actionDigest,
      preparedBy: scope.actorUserId, preparedAt: new Date().toISOString(), fixtures, isolationPolicyBinding: policy.binding,
      syntheticRows: 6, businessRowsRead: 0, businessRowsWritten: 0, trafficMutation: false, acceptance: "NOT_ACCEPTED" };
    await tx.insert(systemSettings).values({ category: CATEGORY, key: scope.jobId, valueJson: receipt, updatedBy: scope.actorUserId,
      description: "Owner-authorized exact M1 role isolation and six synthetic fixtures; no provisioning retry" });
    await appendJobEvent(tx, { workerJobId: scope.jobId, eventType: "PRODUCTION_DATABASE_TENANT_FIXTURES_PREPARED",
      eventIdempotencyKey: `m1-tenant-fixtures:${scope.jobId}:${preflight.actionDigest}`, payloadJson: receipt });
    return receipt;
  }).catch((error: unknown) => {
    if (error instanceof Error && /^M1_ISOLATION_[A-Z0-9_]+$/.test(error.message)) throw error;
    let cause: any = error;
    for (let depth=0; depth<4 && cause; depth++,cause=cause.cause) {
      if (typeof cause.code === "string" && /^[A-Z0-9]{5}$/.test(cause.code))
        throw Error(`M1_ISOLATION_DATABASE_SQLSTATE_${cause.code}`);
    }
    throw Error("M1_ISOLATION_TRANSACTION_FAILED");
  });
}

const isolationObservationSchema = z.object({
  runtime: z.literal("cloudflare-remote-preview"), colo: z.string().regex(/^[A-Z]{3}$/),
  cfRay: z.string().regex(/^[a-f0-9]{16,32}-[A-Z]{3}$/i), diagnosticBundleDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  observedAt: z.string().datetime(), planDigest: z.string().regex(/^[a-f0-9]{64}$/),
  database: z.string(), role: z.string(), sql: z.literal("PASS"), restrictedRoleVerified: z.literal(true), deniedSchemaAccessVerified: z.literal(true),
  readOnly: z.literal(true), isolation: z.object({ schemaVersion: z.literal("cloudflare-production-tenant-isolation-probe-v1"),
    tenantId: z.string(), foreignTestTenantId: z.string(), reportA: z.string().uuid(), reportB: z.string().uuid(), caseA: z.string().uuid(), caseB: z.string().uuid(),
    checks: z.array(z.object({ context: z.enum(["tenant-a","missing","invalid","cross-tenant"]), passed: z.literal(true),
      tables: z.array(z.object({ table: z.enum(M1_ISOLATION_TABLES), own: z.number().int().min(0).max(1), foreign: z.literal(0), passed: z.literal(true) }).strict()).length(3) }).strict()).length(4),
    passed: z.literal(true), fixtureOnly: z.literal(true), syntheticRowsWritten: z.literal(0), businessRowsRead: z.literal(0), businessWrites: z.literal(0),
  }).strict(),
}).strict();

export function projectProductionTenantIsolationObservation(payload: unknown, scope: {
  jobId: string; tenantId: string; projectId: string; planDigest: string; vpcServiceId: string; hyperdriveId: string;
}) {
  if (!payload || typeof payload !== "object") return null;
  const { evidenceDigest, ...evidence } = payload as Record<string, any>;
  if (evidence.evidenceHashFormat !== "canonical-json-v1" || productionDatabaseEvidenceDigest(evidence) !== evidenceDigest ||
      Object.entries(scope).some(([k,v]) => evidence[k] !== v) || evidence.schemaVersion !== "cloudflare-production-tenant-isolation-observation-v1" ||
      evidence.acceptance !== "M1_ACCEPTED" || evidence.tenantIsolationVerified !== true || evidence.fixtureOnly !== true ||
      evidence.providerMutations !== 0 || evidence.provisioningAttemptConsumed !== false || evidence.grantRenewed !== false ||
      evidence.businessRowsRead !== 0 || evidence.businessWrites !== 0) return null;
  const result = isolationObservationSchema.safeParse(evidence.sqlObservation);
  if (!result.success || result.data.planDigest !== scope.planDigest || result.data.isolation.tenantId !== scope.tenantId ||
      new Set(result.data.isolation.checks.map(c => c.context)).size !== 4 || result.data.isolation.checks.some(c =>
        new Set(c.tables.map(t => t.table)).size !== 3 || c.tables.some(t => t.own !== (c.context === "tenant-a" ? 1 : 0)))) return null;
  return { evidenceDigest: String(evidenceDigest), observedAt: result.data.observedAt, tenantIsolationVerified: true as const, acceptance: "M1_ACCEPTED" as const };
}

/** Service-only observation intake after the remote diagnostic. No API accepts
 * caller-supplied PASS assertions. Preserves the historical failed4/4 job. */
export async function recordProductionTenantIsolationObservation(db: DrizzleDB, input: {
  jobId: string; tenantId: string; projectId: string; observation: unknown;
}) {
  const [job] = await db.select().from(workerJobs).where(eq(workerJobs.id, input.jobId)).limit(1);
  if (!job?.requestedByUserId) throw Error("M1_ISOLATION_ORIGINAL_JOB_REQUIRED");
  const scope = { jobId: input.jobId, tenantId: input.tenantId, projectId: input.projectId, actorUserId: job.requestedByUserId };
  // Checking the recorded requester's scope is not impersonation: this branch
  // only reads already-authorized fixtures/provider state and records evidence.
  const bound = await authority(db, scope);
  const prepared = await getProductionTenantIsolationPreflight(db, scope);
  if (!prepared.prepared) throw Error("M1_ISOLATION_OWNER_FIXTURES_REQUIRED");
  const observed = isolationObservationSchema.parse(input.observation), fixture = prepared.fixture;
  const own = fixture.fixtures.find((f: any) => f.tenantId === input.tenantId);
  const foreign = fixture.fixtures.find((f: any) => f.tenantId === fixture.foreignTestTenantId);
  if (!own || !foreign || observed.planDigest !== bound.planDigest || observed.role !== bound.role ||
      observed.database !== (await createCloudflareProductionDatabaseRuntime({ db }).resolveGrant(input.jobId))?.grant.plan.databaseName ||
      Math.abs(Date.now()-Date.parse(observed.observedAt)) > 15*60_000 || observed.isolation.tenantId !== input.tenantId ||
      observed.isolation.foreignTestTenantId !== fixture.foreignTestTenantId || observed.isolation.reportA !== own.reportId ||
      observed.isolation.reportB !== foreign.reportId || observed.isolation.caseA !== own.caseId || observed.isolation.caseB !== foreign.caseId ||
      new Set(observed.isolation.checks.map(c => c.context)).size !== 4 || observed.isolation.checks.some(c =>
        new Set(c.tables.map(t => t.table)).size !== 3 || c.tables.some(t => t.own !== (c.context === "tenant-a" ? 1 : 0))))
    throw Error("M1_ISOLATION_OBSERVATION_SCOPE_DENIED");
  const evidence = { schemaVersion: "cloudflare-production-tenant-isolation-observation-v1", evidenceHashFormat: "canonical-json-v1",
    jobId: input.jobId, tenantId: input.tenantId, projectId: input.projectId, planDigest: bound.planDigest,
    vpcServiceId: bound.readback.vpcServiceId, hyperdriveId: bound.readback.hyperdriveId,
    fixtureActionDigest: fixture.actionDigest, isolationPolicyBinding: fixture.isolationPolicyBinding,
    observedBy: "authorized_service_cli", observedAt: observed.observedAt, sqlObservation: observed,
    tenantIsolationVerified: true, fixtureOnly: true, providerMutations: 0, provisioningAttemptConsumed: false,
    grantRenewed: false, businessRowsRead: 0, businessWrites: 0, acceptance: "M1_ACCEPTED" };
  const evidenceDigest = productionDatabaseEvidenceDigest(evidence);
  await db.transaction(async tx => {
    const [current] = await tx.select().from(workerJobs).where(eq(workerJobs.id, input.jobId)).for("update");
    if (!current || current.status !== job.status || current.attempt !== job.attempt || current.maxAttempts !== job.maxAttempts ||
        current.fencingVersion !== job.fencingVersion || current.leaseExpiresAt) throw Error("M1_ISOLATION_JOB_CHANGED");
    await appendJobEvent(tx, { workerJobId: input.jobId, eventType: "PRODUCTION_DATABASE_TENANT_ISOLATION_VERIFIED",
      eventIdempotencyKey: `m1-isolation-accepted:${input.jobId}:${evidenceDigest}`, payloadJson: { ...evidence, evidenceDigest } });
  });
  return { ...evidence, evidenceDigest, canonicalEvidenceRecorded: true };
}
