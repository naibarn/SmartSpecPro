import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { httpApplicationNamespace, type HttpApplicationSettings } from "./cloudflareHttpApplicationBindings";
import { HTTP_IMAGE_PROVISION_CONTRACT, HTTP_IMAGE_PROVISION_JOB } from "./cloudflareHttpImageProvisionContract";
const state = vi.hoisted(() => ({ pair: null as any, target: null as any, module: true, responseLost: false, admissionDenied: false,
  sourceSha: "8".repeat(40), artifactRef: `sha256:${"7".repeat(64)}` }));
vi.mock("./cloudflareHttpPublishedPair", async original => ({ ...(await original<any>()), resolveVerifiedHttpImagePair: async () => ({ pair: state.pair, diagnostics: [] }) }));
vi.mock("./cloudflareProductionDeploymentContract", async original => ({ ...(await original<any>()), resolveCloudflareProductionDeploymentTarget: async () => state.target }));
vi.mock("./cloudflareStagingArtifactAuthority", async original => ({ ...(await original<any>()),
  resolveLatestPublishedCloudflareStagingArtifact: async () => ({ artifactRef: state.artifactRef, sourceSha: state.sourceSha }),
  resolveCloudflareStagingArtifact: async (ref: string, source: string) => ref === `sha256:${"7".repeat(64)}` && source === "8".repeat(40)
    ? { artifactRef: ref, sourceSha: source } : null,
  resolveCloudflareStagingModules: async () => ({ moduleFiles: state.module ? { "applicationHttpCandidateEntrypoint.js": { bytes: new Uint8Array([1]) } } : {} }) }));
vi.mock("./cloudflareCredentialCenter", async original => ({ ...(await original<any>()), withCloudflareDeploymentCredential: async (_db: any, _scope: any, operation: any) =>
  ({ status: "CONFIGURED", value: await operation("fixture-token") }) }));
vi.mock("./cloudflareHttpCandidateProvider", () => ({ probeHttpCandidateProvider: async () => ({ readAccessVerified: true, writeAccessVerified: false }) }));
vi.mock("./jobControlPlaneGateway", async original => { const actual = await original<any>(); return { ...actual, createControlPlaneJob: async (input: any) => {
  if (state.admissionDenied) { state.admissionDenied = false; throw Error("FIXTURE_ADMISSION_REJECTED"); }
  const result = await actual.createControlPlaneJob(input);
  if (state.responseLost) { state.responseLost = false; throw Error("FIXTURE_RESPONSE_LOST"); }
  return result;
} }; });
function fixture() {
  const scope = { tenantId: "tenant-fixture", projectId: "project-fixture", actorUserId: 1,
    accountRef: "a".repeat(32), environment: "production" as const };
  const settings: HttpApplicationSettings = { mode: "private-canary", sourceSha: "b".repeat(40),
    namespace: httpApplicationNamespace(scope.tenantId, scope.projectId, "production"),
    node: { provisionJobId: "00000000-0000-4000-8000-000000000001", planDigest: "c".repeat(64),
      image: `registry.cloudflare.com/${scope.accountRef}/${httpApplicationNamespace(scope.tenantId, scope.projectId)}-node-http@sha256:${"d".repeat(64)}` },
    python: { provisionJobId: "00000000-0000-4000-8000-000000000002", planDigest: "e".repeat(64),
      image: `registry.cloudflare.com/${scope.accountRef}/${httpApplicationNamespace(scope.tenantId, scope.projectId)}-python-http@sha256:${"f".repeat(64)}` },
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString(),
    maxStarts: 2, maxComputeSeconds: 1200, hardLifetimeSeconds: 600, idleTimeoutSeconds: 10, instance: "basic" };
  const receipt = (runtime: "node" | "python") => ({ id: settings[runtime].provisionJobId, tenantId: scope.tenantId,
    requestedByUserId: scope.actorUserId, jobType: HTTP_IMAGE_PROVISION_JOB, contractVersion: HTTP_IMAGE_PROVISION_CONTRACT,
    status: "succeeded", operatorReviewRequired: false,
    inputJson: { contractVersion: HTTP_IMAGE_PROVISION_CONTRACT, grantRef: "00000000-0000-4000-8000-000000000003",
      projectId: scope.projectId, planDigest: settings[runtime].planDigest },
    outputJson: { schemaVersion: "cloudflare-http-image-receipt-v1", jobId: settings[runtime].provisionJobId,
      planDigest: settings[runtime].planDigest, sourceSha: settings.sourceSha, runtime: `${runtime}-http`, accountRef: scope.accountRef,
      namespace: httpApplicationNamespace(scope.tenantId, scope.projectId), image: settings[runtime].image,
      registryVerified: true, containerStarts: 0, applicationCreated: false, activation: "disabled" } });
  return { scope, settings, receipts: { node: receipt("node"), python: receipt("python") } };
}

const suite = process.env.RUN_CLOUDFLARE_PRODUCTION_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("native candidate authenticated intent and real canonical admission", () => {
  const f = fixture(), scope = f.scope;
  let disposable: any, client: any, db: any, closeDb: any, service: typeof import("./cloudflareHttpCandidatePreparation");
  const previous = new Map<string, string | undefined>();
  beforeAll(async () => {
    for (const k of ["DATABASE_URL", "NODE_ENV", "CLOUDFLARE_PRODUCTION_EXECUTOR_ID"]) previous.set(k, process.env[k]);
    disposable = await (await import("./__tests__/support/spec277DisposablePostgres")).createSpec277DisposablePostgres();
    Object.assign(process.env, { DATABASE_URL: disposable.databaseUrl, NODE_ENV: "test", CLOUDFLARE_PRODUCTION_EXECUTOR_ID: "fixture-production-executor" });
    client = (await import("postgres")).default(disposable.databaseUrl, { max: 3 });
    const schema = await import("../../drizzle/schema");
    await (await import("./__tests__/support/spec277AutoTeamRuntimeSchema")).installSpec277AutoTeamRuntimeSchema(client,
      [schema.systemSettings, schema.users, schema.tenants, schema.tenantDataTransferPlans, schema.tenantIdentityActions, schema.workerJobActions]);
    await client.unsafe("CREATE TABLE canonical_projects(tenant_id text,project_id text,lifecycle text,owner_principal_id text)");
    await client`INSERT INTO users(id,"openId",role) VALUES(1,'native-owner','admin'),(2,'native-user','user')`;
    await client`INSERT INTO tenants(id,slug,name,"ownerId") VALUES(${scope.tenantId},'native-fixture','Disposable native fixture',1)`;
    await client`INSERT INTO canonical_projects VALUES(${scope.tenantId},${scope.projectId},'ACTIVE','user:1')`;
    for (const r of Object.values(f.receipts)) await client`INSERT INTO worker_jobs(id,"tenantId","runtimeType","jobType","contractVersion","requestedByUserId",status,attempt,"maxAttempts","inputJson","outputJson")
      VALUES(${r.id},${scope.tenantId},'node_job_worker',${r.jobType},${r.contractVersion},1,'succeeded',1,1,${client.json(r.inputJson)},${client.json(r.outputJson)})`;
    state.pair = { published: true, sourceSha: f.settings.sourceSha, jobs: Object.values(f.receipts).map(r => ({ jobId: r.id })) };
    state.target = { ...scope, accountRef: scope.accountRef, credentialRef: 'fixture-production-credential', targetId: 'smartspec-cloudflare-runtime' };
    const connection = await import("../db"); db = connection.getDb(); closeDb = connection.closeDb;
    service = await import("./cloudflareHttpCandidatePreparation");
  }, 30_000);
  afterAll(async () => { if (closeDb) await closeDb(); if (client) await client.end({ timeout: 3 }); if (disposable) await disposable.close();
    for (const [k, v] of previous) if (v === undefined) delete process.env[k]; else process.env[k] = v; }, 20_000);
  it("requires the real matching Owner and exact published artifact before any intent is persisted", async () => {
    await expect(service.getHttpCandidatePreparationPreflight(db, { ...scope, actorUserId: 2 })).rejects.toThrow("OWNER_SCOPE_DENIED");
    await expect(service.getHttpCandidatePreparationPreflight(db, { ...scope, tenantId: 'foreign' })).rejects.toThrow("OWNER_SCOPE_DENIED");
    state.module = false;
    expect(await service.getHttpCandidatePreparationPreflight(db, scope)).toMatchObject({ ready: false, reason: 'HTTP_CANDIDATE_CANONICAL_MODULE_REQUIRED', dnsRequired: false });
    state.module = true;
    const p = await service.getHttpCandidatePreparationPreflight(db, scope); expect(p.ready).toBe(true);
    await expect(service.prepareHttpCandidate(db, { ...scope, submissionId: randomUUID(), planDigest: 'f'.repeat(64), correlationId: 'fixture' })).rejects.toThrow('PLAN_CHANGED');
    const rows = await client`SELECT * FROM system_settings WHERE category='cloudflare_production_native_preparations'`;
    expect(rows).toHaveLength(0);
  });
  it("retains a rejected exact admission intent and reconciles a lost successful response without duplicate jobs or outboxes", async () => {
    const p = await service.getHttpCandidatePreparationPreflight(db, scope); if (!p.ready) throw Error(p.reason);
    const request = { ...scope, submissionId: randomUUID(), planDigest: p.planDigest, correlationId: 'fixture-stable-submission',
      artifactRef: p.plan.artifactRef, workerSourceSha: p.plan.workerSourceSha };
    // A later canonical Admin artifact must not spend an Owner attempt on a
    // different build or force the same reviewed request to be approved again.
    state.artifactRef = `sha256:${"9".repeat(64)}`; state.sourceSha = "a".repeat(40);
    state.admissionDenied = true;
    await expect(service.prepareHttpCandidate(db, request)).rejects.toThrow('FIXTURE_ADMISSION_REJECTED');
    expect(await client`SELECT * FROM system_settings WHERE category='cloudflare_production_native_preparations'`).toHaveLength(1);
    expect(await client`SELECT * FROM worker_jobs WHERE id=${request.submissionId}`).toHaveLength(0);
    state.responseLost = true;
    await expect(service.prepareHttpCandidate(db, request)).rejects.toThrow('FIXTURE_RESPONSE_LOST');
    const reconciled = await service.prepareHttpCandidate(db, request); expect(reconciled.jobId).toBe(request.submissionId);
    const [job] = await client`SELECT * FROM worker_jobs WHERE id=${request.submissionId}`;
    expect(job.status).toBe('queued'); expect(job.runtimeType).toBe('node_job_worker'); expect(job.requestedByUserId).toBe(1); expect(job.maxAttempts).toBe(1);
    expect(await client`SELECT * FROM worker_job_outbox WHERE "workerJobId"=${request.submissionId}`).toHaveLength(1);
    const status = await service.readHttpCandidatePreparation(db, scope); expect(status?.jobId).toBe(request.submissionId);
    await expect(service.prepareHttpCandidate(db, { ...request, submissionId: randomUUID() })).rejects.toThrow('EXISTING_SUBMISSION_RECONCILE_REQUIRED');
  });
});
