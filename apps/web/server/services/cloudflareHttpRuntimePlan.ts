import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { is, sql } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../../drizzle/schema";
import type { DrizzleDB } from "../db";
import { assertHttpCandidateOwner, resolveHttpCandidatePackage } from "./cloudflareHttpCandidatePreparation";
import { readHttpDatabaseNetwork } from "./cloudflareHttpDatabaseNetwork";
import { applicationDatabaseRoleName, applicationDatabaseRolePlanDigest, assertReusableApplicationDatabaseRole } from "./cloudflareApplicationDatabaseRole";
import { readCompensatedHttpApplicationAcceptance, readCompensatedHttpRuntime } from "./cloudflareHttpRuntimeContinuation";
import { knownHttpNodeImageFailure } from "./cloudflareHttpImageCompatibility";
import { composeHttpRuntime } from "./cloudflareHttpRuntimeComposition";
import { httpCandidateReceiptSchema, verifyHttpCandidateProviderReceipt } from "./cloudflareHttpCandidateReadback";
import { HTTP_CANDIDATE_JOB, HTTP_CANDIDATE_CONTRACT, CANDIDATE_MODULE } from "./cloudflareHttpCandidateContract";
import { resolveLatestPublishedCloudflareStagingArtifact, resolveCloudflareStagingArtifact, resolveCloudflareStagingModules } from "./cloudflareStagingArtifactAuthority";
import { withCloudflareDeploymentCredential } from "./cloudflareCredentialCenter";
import { CLOUDFLARE_PRODUCTION_DATABASE_JOB, CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT } from "./cloudflareProductionDatabaseExecutor";
import { productionDatabaseEvidenceDigest } from "./cloudflareProductionDatabaseReconciliation";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Scope = { tenantId: string; projectId: string; actorUserId: number };

/** Same protected env file used by the running Linux Python service. Only
 * composeHttpRuntime's explicit application keys can leave this process.
 * This never exports the existing DB owner URL or provider provisioning token. */
export async function loadHttpRuntimeEnvironments() {
  const python = parseEnv(await readFile("/home/dev/projects/SmartSpecPro/python-backend/.env", "utf8"));
  return { nodeEnvironment: process.env, pythonEnvironment: python };
}

/** Full first-party application DML on an exact EXISTING canonical relation
 * snapshot, never database ownership, ALL TABLES, future/default grants or
 * arbitrary operator-selected schemas. Retired systems remain excluded.
 * Existing RLS applies unchanged and is independently tested before activation. */
export async function planHttpApplicationRelations(db: DrizzleDB) {
  const retired = /(?:agency|agencies|sandbox|workpack|workflow|work_request)/i;
  const names = [...new Set(Object.values(schema).filter(value => is(value, PgTable))
    .map(table => getTableConfig(table as PgTable)).filter(table => (!table.schema || table.schema === "public") && !retired.test(table.name))
    .map(table => table.name))].sort();
  const tables = await db.execute(sql`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname IN (${sql.join(names.map(name => sql`${name}`), sql`,`)}) ORDER BY c.relname`);
  const selected = tables.map(row => String(row.relname));
  for (const name of ["users", "tenants", "system_settings", "worker_jobs", "credit_transactions", "model_provider_map"])
    if (!selected.includes(name)) throw Error("HTTP_RUNTIME_REQUIRED_RELATION_MISSING");
  if (selected.length > 1024) throw Error("HTTP_RUNTIME_RELATION_BUDGET_EXCEEDED");
  const sequences = await db.execute(sql`SELECT DISTINCT s.relname FROM pg_class s JOIN pg_namespace n ON n.oid=s.relnamespace
    JOIN pg_depend d ON d.objid=s.oid AND d.deptype IN ('a','i') JOIN pg_class t ON t.oid=d.refobjid
    JOIN pg_namespace tn ON tn.oid=t.relnamespace WHERE s.relkind='S' AND n.nspname='public' AND tn.nspname='public'
    AND t.relname IN (${sql.join(selected.map(name => sql`${name}`), sql`,`)}) ORDER BY s.relname`);
  const policies = await db.execute(sql`SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
    WHERE schemaname='public' AND tablename IN (${sql.join(selected.map(name => sql`${name}`), sql`,`)}) ORDER BY tablename,policyname`);
  return { tables: selected, sequences: sequences.map(row => String(row.relname)), rlsBaselineDigest: hash(policies),
    rlsPolicyCount: policies.length, rlsMutations: false as const };
}

/** Non-mutating technical plan. Clock-derived runtime/role expiry is assigned
 * by the eventual canonical operation, not regenerated into the review digest.
 * A new Admin release cannot silently replace the reviewed immutable artifact. */
export async function getHttpRuntimePlan(db: DrizzleDB, scope: Scope, candidateJobId: string,
  reviewed?: Partial<{ artifactRef: string; workerSourceSha: string; previousRuntime: { jobId: string } | null; publication: { sourceSha: string };
    operation: "runtime" | "application" }>) {
  await assertHttpCandidateOwner(db, scope);
  const [job] = await db.execute(sql`SELECT id,"tenantId","requestedByUserId","jobType","contractVersion",status,"inputJson","outputJson","operatorReviewRequired"
    FROM worker_jobs WHERE id=${candidateJobId}`);
  if (!job || job.tenantId !== scope.tenantId || job.requestedByUserId !== scope.actorUserId || job.status !== "succeeded" ||
      job.jobType !== HTTP_CANDIDATE_JOB || job.contractVersion !== HTTP_CANDIDATE_CONTRACT || job.operatorReviewRequired ||
      (job.inputJson as any)?.projectId !== scope.projectId) throw Error("HTTP_RUNTIME_CANDIDATE_JOB_DENIED");
  const candidate = httpCandidateReceiptSchema.parse(job.outputJson), pkg = await resolveHttpCandidatePackage(db, scope, { imageSourceSha: candidate.imageSourceSha });
  if (candidate.accountRef !== pkg.target.accountRef || candidate.workerName !== pkg.packet.config.name ||
      candidate.manifestDigest !== pkg.packet.manifestDigest || candidate.imageSourceSha !== pkg.packet.imageSourceSha)
    throw Error("HTTP_RUNTIME_CANDIDATE_RECEIPT_CHANGED");
  const operation = reviewed?.operation ?? "runtime";
  let applicationFixture: { m1JobId: string; foreignTestTenantId: string; evidenceDigest: string } | undefined;
  let previousApplicationAcceptance: Awaited<ReturnType<typeof readCompensatedHttpApplicationAcceptance>> = null;
  let priorRuntimeJobId = reviewed?.previousRuntime?.jobId;
  if (operation === "application") {
    const m1 = await db.execute(sql`SELECT j.id, s."valueJson" AS fixture, s."updatedBy" AS fixture_owner, e."payloadJson" AS evidence
      FROM worker_jobs j JOIN system_settings s ON s.category='cloudflare_production_tenant_fixtures' AND s.key=j.id
      JOIN worker_job_events e ON e."workerJobId"=j.id AND e."eventType"='PRODUCTION_DATABASE_TENANT_ISOLATION_VERIFIED'
      WHERE j."tenantId"=${scope.tenantId} AND j."requestedByUserId"=${scope.actorUserId} AND j."jobType"=${CLOUDFLARE_PRODUCTION_DATABASE_JOB}
        AND j."contractVersion"=${CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT} AND j."status"='failed' AND j."attempt"=4 AND j."maxAttempts"=4
        AND j."inputJson"->>'projectId'=${scope.projectId} AND e."payloadJson"->>'acceptance'='M1_ACCEPTED'
      ORDER BY e."createdAt" DESC LIMIT 2`);
    if (m1.length !== 1) throw Error("HTTP_APPLICATION_M1_ACCEPTANCE_EVIDENCE_REQUIRED");
    const fixture = m1[0].fixture as Record<string, any>, observed = m1[0].evidence as Record<string, any>;
    const { evidenceDigest, ...evidenceBody } = observed ?? {};
    if (typeof evidenceDigest !== "string" || productionDatabaseEvidenceDigest(evidenceBody) !== evidenceDigest ||
        observed.tenantId !== scope.tenantId || observed.projectId !== scope.projectId || observed.observedBy !== "authorized_service_cli" ||
        observed.tenantIsolationVerified !== true || observed.fixtureOnly !== true || observed.providerMutations !== 0 ||
        observed.businessRowsRead !== 0 || observed.businessWrites !== 0 || fixture.tenantId !== scope.tenantId ||
        m1[0].fixture_owner !== scope.actorUserId || fixture.acceptance !== "NOT_ACCEPTED" ||
        typeof fixture.foreignTestTenantId !== "string" || fixture.foreignTestTenantId === scope.tenantId ||
        !/^tenant-codex-[a-f0-9-]{1,24}$/.test(fixture.foreignTestTenantId)) throw Error("HTTP_APPLICATION_M1_FIXTURE_EVIDENCE_INVALID");
    applicationFixture = { m1JobId: String(m1[0].id), foreignTestTenantId: fixture.foreignTestTenantId, evidenceDigest };
    const prior = await db.execute(sql`SELECT id FROM worker_jobs WHERE "tenantId"=${scope.tenantId} AND "requestedByUserId"=${scope.actorUserId}
      AND "jobType"='cloudflare.production.native.runtime.verify' AND "contractVersion"='cloudflare-native-runtime-verify-v1'
      AND "status"='succeeded' AND "inputJson"->>'candidateJobId'=${candidateJobId}
      AND "outputJson"->>'runtimeBootVerified'='true' AND "outputJson"->'cleanup'->>'roleLoginRevoked'='true'
      ORDER BY "createdAt" DESC LIMIT 1`);
    if (prior.length !== 1) throw Error("HTTP_APPLICATION_BOUNDED_RUNTIME_EVIDENCE_REQUIRED");
    priorRuntimeJobId = String(prior[0].id);
    previousApplicationAcceptance = await readCompensatedHttpApplicationAcceptance(db, scope, candidateJobId);
  }
  const network = await readHttpDatabaseNetwork(db, scope), relations = await planHttpApplicationRelations(db);
  const unsafeSchemas = await db.execute(sql`SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema'
    AND EXISTS(SELECT 1 FROM aclexplode(COALESCE(nspacl,acldefault('n',nspowner))) a WHERE a.grantee=0 AND a.privilege_type='CREATE')`);
  const unsafeDefiners = await db.execute(sql`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema')
    AND EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')`);
  if (unsafeSchemas.length || unsafeDefiners.length) throw Error("HTTP_RUNTIME_PUBLIC_PRIVILEGE_BASELINE_DENIED");
  const oldRole = await db.execute(sql`SELECT 1 FROM pg_roles WHERE rolname=${applicationDatabaseRoleName(scope)}`);
  const previousRuntime = oldRole.length ? await readCompensatedHttpRuntime(db, scope, candidateJobId, priorRuntimeJobId) : null;
  if (oldRole.length && !previousRuntime) throw Error("HTTP_RUNTIME_EXISTING_APPLICATION_ROLE_RECONCILE_REQUIRED");
  if (previousRuntime) {
    if (previousRuntime.relationsDigest !== hash(relations) || JSON.stringify(previousRuntime.rolePlan.tables) !== JSON.stringify(relations.tables) ||
        JSON.stringify(previousRuntime.rolePlan.sequences) !== JSON.stringify(relations.sequences)) throw Error("HTTP_RUNTIME_ROLE_RELATIONS_CHANGED");
    await assertReusableApplicationDatabaseRole(db, previousRuntime.rolePlan);
  }
  // Application acceptance tests the exact images already deployed to the
  // existing Candidate. It must not demand a second image transition merely
  // because the bounded boot test has already restored that accepted pair.
  const desired = operation === "application" ? pkg :
    await resolveHttpCandidatePackage(db, scope, reviewed?.publication ? { imageSourceSha: reviewed.publication.sourceSha } : undefined);
  if (desired.target.accountRef !== pkg.target.accountRef || desired.packet.config.name !== candidate.workerName)
    throw Error("HTTP_RUNTIME_IMAGE_TARGET_CHANGED");
  if (knownHttpNodeImageFailure(desired.settings.node.image)) throw Error("HTTP_RUNTIME_CORRECTED_PUBLISHED_IMAGES_REQUIRED");
  if (operation === "runtime" && previousRuntime && desired.settings.node.image === pkg.settings.node.image)
    throw Error("HTTP_RUNTIME_CORRECTED_PUBLISHED_IMAGES_REQUIRED");
  const environments = await loadHttpRuntimeEnvironments();
  if (operation === "application" && (!environments.nodeEnvironment.JWT_SECRET ||
      environments.nodeEnvironment.JWT_SECRET !== environments.pythonEnvironment.JWT_SECRET))
    throw Error("HTTP_APPLICATION_CROSS_RUNTIME_SESSION_SECRET_MISMATCH");
  const rolePlan = { tenantId: scope.tenantId, projectId: scope.projectId, databaseName: network.databaseName, tables: relations.tables, sequences: relations.sequences,
    connectionLimit: 10 as const, expiresAt: new Date(Date.now() + 45 * 60_000).toISOString() };
  const settings = { ...desired.settings, expiresAt: new Date(Date.now() + 9 * 60_000).toISOString() };
  const composition = composeHttpRuntime({ scope: { ...scope, accountRef: pkg.target.accountRef, environment: "production" },
    configurationRef: `cf-origin:${"0".repeat(64)}`, settings, network, rolePlan,
    roleSecret: { role: applicationDatabaseRoleName(scope), password: "0".repeat(64), planDigest: applicationDatabaseRolePlanDigest(rolePlan) },
    ...environments, canaryToken: "1".repeat(64) });
  // Only the allowlisted secret subset participates. The public plan contains
  // its fingerprint, never the secret values or the placeholder role password.
  const { DATABASE_URL: _nodeUrl, ...node } = composition.secrets.node;
  const { DATABASE_URL: _pythonUrl, ...python } = composition.secrets.python;
  const artifact = reviewed?.artifactRef && reviewed.workerSourceSha ? await resolveCloudflareStagingArtifact(reviewed.artifactRef, reviewed.workerSourceSha)
    : await resolveLatestPublishedCloudflareStagingArtifact();
  if (!artifact) throw Error("HTTP_RUNTIME_ARTIFACT_REQUIRED");
  if (operation === "runtime" && previousRuntime && previousRuntime.imageSourceSha === desired.settings.sourceSha && previousRuntime.workerSourceSha === artifact.sourceSha)
    throw Error("HTTP_RUNTIME_UNCHANGED_FAILED_PLAN_RECONCILE_REQUIRED");
  const bundle = await resolveCloudflareStagingModules(artifact.artifactRef, artifact.sourceSha);
  const module = bundle?.moduleFiles[CANDIDATE_MODULE];
  if (!module || !Buffer.from(module.bytes).includes(Buffer.from("ApplicationDatabaseBridge"))) throw Error("HTTP_RUNTIME_VPC_ARTIFACT_REQUIRED");
  const access = await withCloudflareDeploymentCredential(db, { identity: { ...scope, provider: "cloudflare", environment: "production" },
    credentialRef: pkg.target.credentialRef }, token => verifyHttpCandidateProviderReceipt({ receipt: candidate, accountRef: pkg.target.accountRef, token,
      restoredBaseline: previousRuntime?.restoredBaseline }));
  if (access.status !== "CONFIGURED" || !access.value?.verified) throw Error("HTTP_RUNTIME_CANDIDATE_READBACK_REQUIRED");
  const plan = { candidateJobId, candidate, previousRuntime, publication: desired.publishedPair, network, relations, role: applicationDatabaseRoleName(scope), roleLifetimeSeconds: 2700,
    maxStartsPerRuntime: 2, maxComputeSecondsPerRuntime: 1200, hardLifetimeSeconds: 600, instance: "basic",
    secretFingerprint: hash({ node, python }), artifactRef: artifact.artifactRef, workerSourceSha: artifact.sourceSha,
    credentialRef: pkg.target.credentialRef, executorId: process.env.CLOUDFLARE_PRODUCTION_EXECUTOR_ID?.trim(),
    trafficMutation: false, dnsMutation: false, accessApplicationCreated: false, imagePublication: false,
    testScope: ["node-health", "node-database-readiness", "python-health", "python-database-readiness", "missing-auth-denied", "bounded-recovery",
      ...(operation === "application" ? ["synthetic-login-session-lifecycle", "authenticated-credit-read", "authenticated-gateway-model-routing",
        "cross-tenant-api-denial", "python-authenticated-api-read"] : [])],
    ...(operation === "application" ? { operation, applicationFixture, previousApplicationAcceptance } : {}),
    applicationAcceptance: operation === "application", fixtureCreation: operation === "application", restoreCandidateDeployment: true, revokeApplicationLogin: true };
  if (!plan.executorId) throw Error("HTTP_RUNTIME_EXECUTOR_REQUIRED");
  return { ready: true as const, plan, planDigest: hash(plan), providerReadbackVerified: true as const,
    applicationRolePrepared: false as const, runtimeAcceptance: false as const, activationAuthorized: false as const };
}
