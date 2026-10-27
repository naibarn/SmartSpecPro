import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
const state = vi.hoisted(() => ({ preflightDenied: false, admissionDenied: false, responseLost: false,
  recoveryId: null as string | null, planDigest: "a".repeat(64), artifactRef: `sha256:${"b".repeat(64)}`, workerSourceSha: "c".repeat(40) }));
vi.mock("./cloudflareHttpRuntimePlan", () => ({ getHttpRuntimePlan: async (_db: any, scope: any, candidateJobId: string, reviewed: any) => {
  if (state.preflightDenied) throw Error("HTTP_RUNTIME_VPC_ARTIFACT_REQUIRED");
  if (reviewed.artifactRef !== state.artifactRef || reviewed.workerSourceSha !== state.workerSourceSha) throw Error("HTTP_RUNTIME_ARTIFACT_CHANGED");
  return { ready: true, planDigest: state.planDigest, plan: { candidateJobId, artifactRef: state.artifactRef, workerSourceSha: state.workerSourceSha,
    previousRuntime: state.recoveryId ? { jobId: state.recoveryId } : null,
    ...(reviewed.operation === "application" ? { operation: "application", applicationAcceptance: true, fixtureCreation: true,
      applicationFixture: { m1JobId: "44444444-4444-4444-8444-444444444444", foreignTestTenantId: "tenant-codex-fixture", evidenceDigest: "d".repeat(64) } } : {}),
    role: "sah_cf_app_abcdef012345", maxStartsPerRuntime: 2, maxComputeSecondsPerRuntime: 1200, trafficMutation: false } };
} }));
vi.mock("./jobControlPlaneGateway", async original => { const actual = await original<any>(); return { ...actual, createControlPlaneJob: async (input: any) => {
  if (state.admissionDenied) { state.admissionDenied = false; throw Error("FIXTURE_ADMISSION_REJECTED"); }
  const result = await actual.createControlPlaneJob(input);
  if (state.responseLost) { state.responseLost = false; throw Error("FIXTURE_RESPONSE_LOST"); }
  return result;
} }; });
import { HTTP_RUNTIME_CONTRACT, HTTP_RUNTIME_JOB } from "./cloudflareHttpRuntimeContract";
import { PostgresPullJobTransportAdapter } from "./jobTransportAdapters";
import { isPostgresNodeJobType } from "../jobs/feature186JobTypes";
const suite = process.env.RUN_CLOUDFLARE_PRODUCTION_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("Owner bounded runtime admission with real canonical PostgreSQL/outbox", () => {
  let disposable: any, client: any, db: any, closeDb: any, service: typeof import("./cloudflareHttpRuntimeAdmission");
  const old = { url: process.env.DATABASE_URL, env: process.env.NODE_ENV };
  const scope = { tenantId: "tenant-runtime-fixture", projectId: "project-runtime-fixture", actorUserId: 1 };
  const request = () => ({ ...scope, candidateJobId: "22222222-2222-4222-8222-222222222222", submissionId: randomUUID(),
    planDigest: state.planDigest, artifactRef: state.artifactRef, workerSourceSha: state.workerSourceSha, correlationId: "runtime-owner-request-fixture" });
  beforeAll(async () => {
    disposable = await (await import("./__tests__/support/spec277DisposablePostgres")).createSpec277DisposablePostgres();
    process.env.DATABASE_URL = disposable.databaseUrl; process.env.NODE_ENV = "test";
    client = (await import("postgres")).default(disposable.databaseUrl, { max: 3 });
    const schema = await import("../../drizzle/schema");
    await (await import("./__tests__/support/spec277AutoTeamRuntimeSchema")).installSpec277AutoTeamRuntimeSchema(client,
      [schema.systemSettings, schema.users, schema.tenants, schema.tenantDataTransferPlans, schema.tenantIdentityActions, schema.workerJobActions]);
    await client.unsafe("CREATE TABLE canonical_projects(tenant_id text,project_id text,lifecycle text,owner_principal_id text)");
    await client`INSERT INTO users(id,"openId",role) VALUES(1,'runtime-owner','admin'),(2,'runtime-user','user')`;
    await client`INSERT INTO tenants(id,slug,name,"ownerId") VALUES(${scope.tenantId},'runtime-fixture','Disposable runtime fixture',1)`;
    await client`INSERT INTO canonical_projects VALUES(${scope.tenantId},${scope.projectId},'ACTIVE','user:1')`;
    const connection = await import("../db"); db = connection.getDb(); closeDb = connection.closeDb;
    service = await import("./cloudflareHttpRuntimeAdmission");
  }, 30_000);
  afterAll(async () => { if (closeDb) await closeDb(); if (client) await client.end({ timeout: 2 }); if (disposable) await disposable.close();
    if (old.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = old.url;
    if (old.env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old.env;
  }, 20_000);
  it("admits the exact contract through Node claim and PostgreSQL-pull, not an unrelated queue", () => {
    expect(isPostgresNodeJobType(HTTP_RUNTIME_JOB)).toBe(true);
    expect(new PostgresPullJobTransportAdapter().supports({ jobType: HTTP_RUNTIME_JOB, executionClass: "long", contractVersion: HTTP_RUNTIME_CONTRACT })).toBe(true);
  });
  it("keeps authenticated application acceptance distinct from the prior boot-test submission", async () => {
    const input = { ...request(), operation: "application" as const };
    expect((await service.prepareHttpRuntime(db, input)).jobId).toBe(input.submissionId);
    const [job] = await client`SELECT * FROM worker_jobs WHERE id=${input.submissionId}`;
    expect(job.inputJson).toMatchObject({ operation: "application", planDigest: state.planDigest });
    expect(await client`SELECT 1 FROM worker_job_outbox WHERE "workerJobId"=${input.submissionId}`).toHaveLength(1);
    expect((await service.readHttpRuntimeOperation(db, scope, "application"))?.jobId).toBe(input.submissionId);
    expect(await service.readHttpRuntimeOperation(db, scope, "runtime")).toBeNull();
    const [intent] = await client`SELECT "valueJson" FROM system_settings WHERE category='cloudflare_production_native_runtime' AND key=${input.submissionId}`;
    expect(intent.valueJson).toMatchObject({ operation: "application", authority: "existing-candidate-bounded-application-acceptance-v1",
      fixtureCreation: true, trafficMutation: false, dnsMutation: false, imagePublication: false, applicationCreation: false });
    await client`UPDATE worker_jobs SET status='failed',"finishedAt"=now() WHERE id=${input.submissionId}`;
  });
  it("rejects foreign identity/scope and technical preflight failures before persisting an intent", async () => {
    await expect(service.prepareHttpRuntime(db, { ...request(), actorUserId: 2 })).rejects.toThrow("OWNER_SCOPE_DENIED");
    await expect(service.prepareHttpRuntime(db, { ...request(), tenantId: "foreign" })).rejects.toThrow("OWNER_SCOPE_DENIED");
    state.preflightDenied = true;
    await expect(service.prepareHttpRuntime(db, request())).rejects.toThrow("VPC_ARTIFACT_REQUIRED"); state.preflightDenied = false;
    await expect(service.prepareHttpRuntime(db, { ...request(), planDigest: "f".repeat(64) })).rejects.toThrow("REVIEWED_PLAN_CHANGED");
    expect(await client`SELECT 1 FROM system_settings WHERE category='cloudflare_production_native_runtime'
      AND COALESCE("valueJson"->>'operation','runtime')='runtime'`).toHaveLength(0);
  });
  it("reconciles rejected admission and a lost successful response into one job, one intent and one outbox", async () => {
    const input = request(); state.admissionDenied = true;
    await expect(service.prepareHttpRuntime(db, input)).rejects.toThrow("FIXTURE_ADMISSION_REJECTED");
    expect(await client`SELECT 1 FROM system_settings WHERE category='cloudflare_production_native_runtime'
      AND COALESCE("valueJson"->>'operation','runtime')='runtime'`).toHaveLength(1);
    expect(await client`SELECT 1 FROM worker_jobs WHERE id=${input.submissionId}`).toHaveLength(0);
    state.responseLost = true;
    await expect(service.prepareHttpRuntime(db, input)).rejects.toThrow("FIXTURE_RESPONSE_LOST");
    expect((await service.prepareHttpRuntime(db, input)).jobId).toBe(input.submissionId);
    const [job] = await client`SELECT * FROM worker_jobs WHERE id=${input.submissionId}`;
    expect(job).toMatchObject({ status: "queued", runtimeType: "node_job_worker", requestedByUserId: 1, maxAttempts: 1,
      jobType: HTTP_RUNTIME_JOB, contractVersion: HTTP_RUNTIME_CONTRACT });
    expect(await client`SELECT 1 FROM worker_job_outbox WHERE "workerJobId"=${input.submissionId}`).toHaveLength(1);
    expect((await service.readHttpRuntimeOperation(db, scope))?.jobId).toBe(input.submissionId);
    await expect(service.prepareHttpRuntime(db, request())).rejects.toThrow("EXISTING_SUBMISSION_RECONCILE_REQUIRED");
    await expect(service.prepareHttpRuntime(db, { ...input, candidateJobId: randomUUID() })).rejects.toThrow("SUBMISSION_SCOPE_DENIED");
    const [intent] = await client`SELECT "valueJson" FROM system_settings WHERE category='cloudflare_production_native_runtime' AND key=${input.submissionId}`;
    expect(intent.valueJson).toMatchObject({ trafficMutation: false, dnsMutation: false, imagePublication: false, applicationCreation: false });
  });
  it("admits a fresh exact Owner-reviewed corrected plan once while leaving the exhausted historical job unchanged", async () => {
    const [old] = await client`SELECT id,attempt,"maxAttempts" FROM worker_jobs WHERE "jobType"=${HTTP_RUNTIME_JOB}
      AND COALESCE("inputJson"->>'operation','runtime')='runtime' LIMIT 1`;
    await client`UPDATE worker_jobs SET status='failed',"finishedAt"=now() WHERE id=${old.id}`;
    state.recoveryId = old.id;
    const input = request();
    expect((await service.prepareHttpRuntime(db, input)).jobId).toBe(input.submissionId);
    expect((await service.prepareHttpRuntime(db, input)).jobId).toBe(input.submissionId);
    expect(await client`SELECT 1 FROM worker_job_outbox WHERE "workerJobId"=${input.submissionId}`).toHaveLength(1);
    expect((await client`SELECT status,attempt,"maxAttempts" FROM worker_jobs WHERE id=${old.id}`)[0]).toEqual({ status: 'failed', attempt: old.attempt, maxAttempts: old.maxAttempts });
    await expect(service.prepareHttpRuntime(db, request())).rejects.toThrow("EXISTING_SUBMISSION_RECONCILE_REQUIRED");
    state.recoveryId = null;
  });
  it("exposes the known immutable Node incompatibility only from the matching canonical failed intent", async () => {
    const [row] = await client`SELECT id,"inputJson" FROM worker_jobs WHERE "jobType"=${HTTP_RUNTIME_JOB}
      AND COALESCE("inputJson"->>'operation','runtime')='runtime' ORDER BY "createdAt" DESC LIMIT 1`;
    const [saved] = await client`SELECT "valueJson" FROM system_settings WHERE category='cloudflare_production_native_runtime' AND key=${row.id}`;
    const plan = { ...saved.valueJson.plan, candidate: { imageSourceSha: "d".repeat(40), applications: [{ images: {
      node: `registry.cloudflare.com/${"a".repeat(32)}/smartspec-staging-abcdef012345-node-http@sha256:d8d5b38fca643300119684f11576b4b94c5bfa6e043f75e6a3bf7f471690140f` } }] } };
    const planDigest = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
    const value = { ...saved.valueJson, plan, planDigest };
    await client`UPDATE worker_jobs SET status='failed',"errorCode"='HTTP_RUNTIME_PROBE_NODE_HEALTH_HTTP_503',"inputJson"=${client.json({ ...row.inputJson, planDigest })} WHERE id=${row.id}`;
    await client`UPDATE system_settings SET "valueJson"=${JSON.stringify(value)}::json WHERE category='cloudflare_production_native_runtime' AND key=${row.id}`;
    const persisted = await service.readHttpRuntimeIntent(db, row.id);
    expect(persisted?.updatedBy).toBe(scope.actorUserId);
    expect(createHash("sha256").update(JSON.stringify(persisted?.valueJson?.plan)).digest("hex")).toBe(planDigest);
    const operation = await service.readHttpRuntimeOperation(db, scope);
    expect(operation?.imageRepair).toMatchObject({ code: "HTTP_IMAGE_NODE_RUNTIME_UNSUPPORTED", observedVersion: "22.22.3", sourceSha: "d".repeat(40) });
    await client`UPDATE system_settings SET "valueJson"=${JSON.stringify({ ...value, actorUserId: 2 })}::json WHERE category='cloudflare_production_native_runtime' AND key=${row.id}`;
    expect((await service.readHttpRuntimeOperation(db, scope))?.imageRepair).toBeNull();
  });
  it("serializes boot and application operations against the same Candidate", async () => {
    state.preflightDenied = false;
    state.recoveryId = null;
    await client`DELETE FROM worker_job_outbox WHERE "workerJobId" IN (SELECT id FROM worker_jobs WHERE "tenantId"=${scope.tenantId}
      AND "jobType"=${HTTP_RUNTIME_JOB} AND "inputJson"->>'projectId'=${scope.projectId})`;
    await client`DELETE FROM worker_jobs WHERE "tenantId"=${scope.tenantId} AND "jobType"=${HTTP_RUNTIME_JOB} AND "inputJson"->>'projectId'=${scope.projectId}`;
    await client`DELETE FROM system_settings WHERE category='cloudflare_production_native_runtime'
      AND "valueJson"->>'tenantId'=${scope.tenantId} AND "valueJson"->>'projectId'=${scope.projectId}`;
    const boot = request();
    expect((await service.prepareHttpRuntime(db, boot)).jobId).toBe(boot.submissionId);
    const acceptance = { ...request(), operation: "application" as const };
    await expect(service.prepareHttpRuntime(db, acceptance)).rejects.toThrow("HTTP_RUNTIME_CANDIDATE_BUSY");
    expect(await client`SELECT 1 FROM worker_jobs WHERE id=${acceptance.submissionId}`).toHaveLength(0);
    expect(await client`SELECT 1 FROM system_settings WHERE category='cloudflare_production_native_runtime' AND key=${acceptance.submissionId}`).toHaveLength(0);
  });
});
