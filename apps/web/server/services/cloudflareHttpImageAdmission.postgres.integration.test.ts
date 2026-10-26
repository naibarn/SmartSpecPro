import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
const state = vi.hoisted(() => ({ sourceSha: "a".repeat(40), account: "b".repeat(32), grants: new Map<string, any>(),
  afterCommit: false, losePolicyResponse: false, rejectPolicy: false, credential: true, calls: [] as string[] }));
vi.mock("./cloudflareHttpImageBuildOperator", async original => ({ ...(await original<any>()), resolveHttpImageCanonicalSource: async () => ({
  sourceSha: state.sourceSha, buildId: state.sourceSha+"-11111111-1111-4111-8111-111111111111" }) }));
vi.mock("./cloudflareHttpImageProvisionExecutor", async original => ({ ...(await original<any>()), createCloudflareHttpImageProvisionRuntime: () => ({
  resolveAccount: async () => state.account,
  loadCheckpoint: async () => null,
  withCredential: async (_scope: any, operation: any) => { if (!state.credential) throw Error("HTTP_IMAGE_CREDENTIAL_DENIED"); return operation("fixture"); },
  verifyExecutor: async () => "cf-staging-executor:fixture",
  resolveGrant: async (ref: string) => [...state.grants.values()].find(g => g.grantRef === ref),
}) }));
vi.mock("./appRuntimeConfig", () => ({ getAppRuntimeConfig: async () => ({ pythonBackendUrl: "https://approval.fixture.invalid" }) }));
vi.mock("./jobControlPlaneGateway", async original => {
  const actual = await original<any>();
  return { ...actual, createControlPlaneJob: async (input: any) => {
    const result = await actual.createControlPlaneJob(input);
    if (state.afterCommit) { state.afterCommit = false; throw Error("FIXTURE_RESPONSE_LOST"); }
    return result;
  } };
});
const suite = process.env.RUN_CLOUDFLARE_PRODUCTION_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("paired images: Owner admission with real PostgreSQL canonical job/outbox", () => {
  let disposable: any, client: any, db: any, service: typeof import("./cloudflareHttpImageAdmission"), closeDb: any;
  const previous = new Map<string, string | undefined>();
  const scope = { tenantId: "tenant-images-fixture", projectId: "project-images-fixture", actorUserId: 17 };
  beforeAll(async () => {
    for (const k of ["DATABASE_URL", "NODE_ENV", "CLOUDFLARE_STAGING_EXECUTOR_ID"]) previous.set(k, process.env[k]);
    disposable = await (await import("./__tests__/support/spec277DisposablePostgres")).createSpec277DisposablePostgres();
    Object.assign(process.env, { DATABASE_URL: disposable.databaseUrl, NODE_ENV: "test", CLOUDFLARE_STAGING_EXECUTOR_ID: "cf-staging-executor:fixture" });
    client = (await import("postgres")).default(disposable.databaseUrl, { max: 2 });
    const schema = await import("../../drizzle/schema");
    await (await import("./__tests__/support/spec277AutoTeamRuntimeSchema")).installSpec277AutoTeamRuntimeSchema(client,
      [schema.systemSettings, schema.users, schema.tenants, schema.tenantDataTransferPlans, schema.tenantIdentityActions, schema.runnerNodes, schema.workerJobActions]);
    await client.unsafe(`CREATE TABLE canonical_projects (tenant_id text,project_id text,lifecycle text,owner_principal_id text);
      CREATE TABLE approval_rules(id text PRIMARY KEY,tenant_id text,project_id text,is_active boolean,conditions jsonb);`);
    await client`INSERT INTO users(id,"openId",role) VALUES(17,'image-owner','admin'),(18,'image-other','user')`;
    await client`INSERT INTO tenants(id,slug,name,"ownerId") VALUES(${scope.tenantId},'image-fixture','Disposable image fixture',17)`;
    await client`INSERT INTO canonical_projects VALUES(${scope.tenantId},${scope.projectId},'ACTIVE','user:17')`;
    await client`INSERT INTO runner_nodes("tenantId","runnerId","ownerUserId",profile,"nodeKind","displayName","trustState","snapshotExpiresAt")
      VALUES(${scope.tenantId},'cf-staging-executor:fixture',17,'cloudflare_staging_executor','cloudflare','Disposable executor','trusted',now()+interval '2 hours')`;
    const connection = await import("../db"); db = connection.getDb(); closeDb = connection.closeDb;
    service = await import("./cloudflareHttpImageAdmission");
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      if (!url.startsWith("https://approval.fixture.invalid/") || init.method !== "POST" || init.headers.Authorization !== "Bearer fixture-owner-token")
        throw Error("UNEXPECTED_FIXTURE_NETWORK");
      const body = JSON.parse(init.body); state.calls.push(new URL(url).pathname);
      if (url.endsWith("/cloudflare-staging-policies")) {
        if (state.rejectPolicy) return new Response('{}', { status: 403 });
        const id = randomUUID();
        await client`INSERT INTO approval_rules VALUES(${id},${scope.tenantId},${scope.projectId},true,${client.json({definition:body.definition})})`;
        if (state.losePolicyResponse) { state.losePolicyResponse = false; throw Error("FIXTURE_POLICY_RESPONSE_LOST"); }
        return Response.json({ policyId: id });
      }
      if (!url.endsWith("/cloudflare-staging-http-image-grants/policy")) throw Error("UNEXPECTED_FIXTURE_ENDPOINT");
      let grant = state.grants.get(body.idempotencyKey);
      if (!grant) {
        grant = { schemaVersion: "cloudflare.staging-http-image-provision-grant.v1", grantRef: randomUUID(), tenantId: scope.tenantId,
          projectId: scope.projectId, requesterUserId: 17, executorId: body.executorId, jobId: body.jobId, accountRef: body.accountRef,
          targetId: "smartspec-cloudflare-staging", environment: "staging", actions: ["provision"], plan: body.plan, planDigest: body.planDigest,
          expiresAt: body.expiresAt, revokedAt: null };
        state.grants.set(body.idempotencyKey, grant);
      }
      return Response.json({ id: grant.grantRef, status: "approved" });
    }));
  }, 30_000);
  afterAll(async () => {
    vi.unstubAllGlobals(); if (closeDb) await closeDb(); if (client) await client.end({ timeout: 5 }); if (disposable) await disposable.close();
    for (const [k, v] of previous) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }, 20_000);
  async function request() {
    const preflight = await service.getHttpImagePairPreflight(db, scope);
    if (!preflight.ready) throw Error(preflight.reason);
    return { ...scope, submissionId: randomUUID(), planDigest: preflight.planDigest, userToken: "fixture-owner-token", correlationId: "fixture-trace" };
  }
  it("admits two exact jobs/outboxes and reconciles a lost committed response without duplicate grants or jobs", async () => {
    const input = await request(); state.afterCommit = true; state.losePolicyResponse = true;
    const result = await service.queueHttpImagePair(db, input);
    expect(result?.jobs).toHaveLength(2);
    expect(result?.jobs.every(j => j.status === "queued")).toBe(true);
    const calls = state.calls.length, grants = state.grants.size;
    expect(await service.queueHttpImagePair(db, input)).toEqual(result);
    expect(state.calls).toHaveLength(calls); expect(state.grants.size).toBe(grants);
    expect(await service.queueHttpImagePair(db, { ...input, submissionId: randomUUID() })).toEqual(result);
    expect(state.calls).toHaveLength(calls); expect(state.grants.size).toBe(grants);
    const ids = result!.jobs.map(j => j.jobId);
    const jobs = await client`SELECT id,"inputJson","requestedByUserId" FROM worker_jobs WHERE id IN ${client(ids)}`;
    expect(jobs).toHaveLength(2); expect(jobs.every((j: any) => j.requestedByUserId === 17)).toBe(true);
    expect(await client`SELECT id FROM worker_job_outbox WHERE "workerJobId" IN ${client(ids)}`).toHaveLength(2);
    expect(result?.published).toBe(false); expect(result?.trafficMutation).toBe(false);
    expect(await service.readHttpImagePairSubmission(db, scope)).toEqual(result);
    await expect(service.readHttpImagePairSubmission(db, { ...scope, actorUserId: 18 })).rejects.toThrow("OWNER_SCOPE_DENIED");
  });
  it("recovers only the admitted same-grant prebuild failure through real job/outbox persistence", async () => {
    const { createJobControlPlane } = await import("./jobControlPlane");
    const cp = createJobControlPlane();
    const [job] = await client`SELECT id FROM worker_jobs WHERE "jobType"='cloudflare.staging.http.image.provision' ORDER BY id LIMIT 1`;
    const lease = await cp.claim({ jobId: job.id, runnerId: "fixture-image-worker", adapter: "postgres-pull" });
    expect(lease).not.toBeNull();
    await cp.start(lease!);
    await cp.fail(lease!, { code: "CloudflareHttpImageError", message: "HTTP_IMAGE_AUTHORITY_DENIED", class: "unknown", operatorReviewRequired: true });
    const { recoverHttpImagePrebuildRateLimit } = await import("./cloudflareHttpImageRecovery");
    const grants = state.grants.size, calls = state.calls.length;
    expect(await recoverHttpImagePrebuildRateLimit(db, job.id)).toMatchObject({ jobId: job.id, accepted: true, newGrantIssued: false, maxAttempts: 2 });
    const [current] = await client`SELECT status,attempt,"maxAttempts","retryPolicyJson" FROM worker_jobs WHERE id=${job.id}`;
    expect(current).toMatchObject({ status: "queued", attempt: 2, maxAttempts: 2 });
    expect(current.retryPolicyJson.httpImagePrebuildRecovery.attempt).toBe(2);
    expect(await client`SELECT id FROM worker_job_outbox WHERE "workerJobId"=${job.id}`).toHaveLength(2);
    expect(state.grants.size).toBe(grants); expect(state.calls.length).toBe(calls);
    await expect(recoverHttpImagePrebuildRateLimit(db, job.id)).rejects.toThrow("RECOVERY_JOB_DENIED");
    const recoveredLease = await cp.claim({ jobId: job.id, runnerId: "fixture-image-worker", adapter: "postgres-pull" });
    expect(recoveredLease?.fencingVersion).toBe(2);
  });
  it("rejects foreign Owner/tenant, changed plan, and absent Owner token before approval writes", async () => {
    const input = await request(), count = state.calls.length;
    await expect(service.queueHttpImagePair(db, { ...input, actorUserId: 18 })).rejects.toThrow("OWNER_SCOPE_DENIED");
    await expect(service.queueHttpImagePair(db, { ...input, tenantId: "foreign" })).rejects.toThrow("OWNER_SCOPE_DENIED");
    await expect(service.queueHttpImagePair(db, { ...input, planDigest: "f".repeat(64) })).rejects.toThrow("PLAN_CHANGED");
    await expect(service.queueHttpImagePair(db, { ...input, userToken: "" })).rejects.toThrow("OWNER_SESSION_REQUIRED");
    expect(state.calls).toHaveLength(count);
  });
  it("reports credential failure before any policy and cannot adopt another Owner's submission", async () => {
    state.credential = false;
    expect(await service.getHttpImagePairPreflight(db, scope)).toEqual({ ready: false, reason: "HTTP_IMAGE_CREDENTIAL_DENIED" });
    state.credential = true;
    const first = await client`SELECT key FROM system_settings WHERE category='cloudflare_http_image_submissions' LIMIT 1`;
    await expect(service.readHttpImagePairSubmission(db, { ...scope, actorUserId: 18, submissionId: first[0].key })).rejects.toThrow("OWNER_SCOPE_DENIED");
  });
  it("shows a definitive rejection and recovers the same intent after its cause is repaired", async () => {
    state.sourceSha = "d".repeat(40);
    const input = await request(); state.rejectPolicy = true;
    await expect(service.queueHttpImagePair(db, input)).rejects.toThrow("HTTP_IMAGE_APPROVAL_HTTP_403");
    expect((await service.readHttpImagePairSubmission(db, input))?.jobs.every(j => j.status === "NOT_ADMITTED")).toBe(true);
    expect((await service.readHttpImagePairSubmission(db, input))?.diagnostics).toEqual([{ runtime: "node-http", stage: "POLICY_CREATE", code: "HTTP_IMAGE_APPROVAL_HTTP_403" }]);
    state.rejectPolicy = false;
    const accepted = await service.queueHttpImagePair(db, input);
    expect(accepted?.submissionId).toBe(input.submissionId);
    expect(accepted?.jobs.every(j => j.status === "queued")).toBe(true);
    expect(accepted?.diagnostics).toEqual([]);
  });
});
