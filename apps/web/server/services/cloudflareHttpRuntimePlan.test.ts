import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpApplicationNamespace } from "./cloudflareHttpApplicationBindings";
const state = vi.hoisted(() => ({ job: null as any, packet: null as any, target: null as any, settings: null as any,
  module: true, verified: true, providerFailure: false, unsafe: false, oldRole: false, prior: null as any, previousApplicationAcceptance: null as any,
  desired: null as any, m1Fixture: null as any, m1Evidence: null as any }));
const scope = { tenantId: "tenant-fixture", projectId: "project-fixture", actorUserId: 17 };
const secret = "fixture-application-secret-with-at-least-32-characters";
vi.mock("node:fs/promises", async original => ({ ...(await original<any>()), readFile: async () =>
  `JWT_SECRET=${secret}\nSECRET_KEY=${secret}\nENCRYPTION_MASTER_KEY=${secret}\nSMARTSPEC_WEB_GATEWAY_TOKEN=${secret}\n` }));
vi.mock("./cloudflareHttpCandidatePreparation", () => ({ assertHttpCandidateOwner: async (_db: any, s: any) => {
  if (s.tenantId !== "tenant-fixture" || s.actorUserId !== 17) throw Error("OWNER_SCOPE_DENIED"); },
  resolveHttpCandidatePackage: async (_db: any, _scope: any, baseline: any) => baseline?.submissionId ? state.desired : baseline ? ({ packet: state.packet, target: state.target, settings: state.settings,
    publishedPair: state.desired?.publishedPair ?? { submissionId: "baseline-pair", sourceSha: state.settings.sourceSha, verified: true } })
    : state.desired ?? ({ packet: state.packet, target: state.target, settings: state.settings, publishedPair: { sourceSha: state.settings.sourceSha } }) }));
vi.mock("./cloudflareHttpDatabaseNetwork", () => ({ readHttpDatabaseNetwork: async () => ({ transport: "private-vpc-websocket-v1",
  providerReadbackVerified: true, m1Preserved: true, tunnelId: "191d047e-674a-48f4-b105-b37269c2dad6", hostname: "db.smartaihub.app", port: 5433, databaseName: "fixture" }) }));
vi.mock("./cloudflareStagingArtifactAuthority", () => ({ resolveLatestPublishedCloudflareStagingArtifact: async () => ({ artifactRef: `sha256:${"a".repeat(64)}`, sourceSha: "b".repeat(40) }),
  resolveCloudflareStagingArtifact: async (ref: string, sha: string) => ({ artifactRef: ref, sourceSha: sha }),
  resolveCloudflareStagingModules: async () => ({ moduleFiles: state.module ? { "applicationHttpCandidateEntrypoint.js": { bytes: Buffer.from("export class ApplicationDatabaseBridge {}") } } : {} }) }));
vi.mock("./cloudflareCredentialCenter", () => ({ withCloudflareDeploymentCredential: async () => {
  if (state.providerFailure) throw Error("provider transport detail that must not reach the UI");
  return { status: "CONFIGURED", value: { verified: state.verified } };
} }));
vi.mock("./cloudflareHttpRuntimeContinuation", async original => ({ ...(await original<any>()), readCompensatedHttpRuntime: async () => state.prior,
  readCompensatedHttpApplicationAcceptance: async () => state.previousApplicationAcceptance }));
vi.mock("./cloudflareApplicationDatabaseRole", async original => ({ ...(await original<any>()), assertReusableApplicationDatabaseRole: async () => {} }));
import { getHttpRuntimePlan } from "./cloudflareHttpRuntimePlan";
import { HTTP_CANDIDATE_JOB, HTTP_CANDIDATE_CONTRACT } from "./cloudflareHttpCandidateContract";
import { productionDatabaseEvidenceDigest } from "./cloudflareProductionDatabaseReconciliation";
beforeEach(() => {
  Object.assign(process.env, { JWT_SECRET: secret, API_KEY_HMAC_SECRET: secret, LLM_ENCRYPTION_KEY: secret, CONTROL_PLANE_API_KEY: secret,
    CLOUDFLARE_PRODUCTION_EXECUTOR_ID: "fixture-executor" });
  state.module = true; state.verified = true; state.providerFailure = false; state.unsafe = false; state.oldRole = false; state.prior = null; state.previousApplicationAcceptance = null;
  state.desired = null; state.m1Fixture = null; state.m1Evidence = null;
  const namespace = httpApplicationNamespace(scope.tenantId, scope.projectId), prod = httpApplicationNamespace(scope.tenantId, scope.projectId, "production");
  const account = "a".repeat(32), image = (runtime: string) => `registry.cloudflare.com/${account}/${namespace}-${runtime}-http@sha256:${"d".repeat(64)}`;
  state.settings = { mode: "private-canary", namespace: prod, sourceSha: "c".repeat(40), issuedAt: new Date(Date.now()-1000).toISOString(),
    expiresAt: new Date(Date.now()+600_000).toISOString(), maxStarts: 2, maxComputeSeconds: 1200, hardLifetimeSeconds: 600, idleTimeoutSeconds: 10, instance: "basic",
    node: { provisionJobId: "11111111-1111-4111-8111-111111111111", planDigest: "e".repeat(64), image: image("node") },
    python: { provisionJobId: "22222222-2222-4222-8222-222222222222", planDigest: "f".repeat(64), image: image("python") } };
  state.target = { accountRef: account, credentialRef: "fixture-credential" };
  state.packet = { manifestDigest: "e".repeat(64), imageSourceSha: "c".repeat(40), config: { name: `${prod}-candidate` } };
  state.job = { id: "33333333-3333-4333-8333-333333333333", tenantId: scope.tenantId, requestedByUserId: 17, status: "succeeded",
    jobType: HTTP_CANDIDATE_JOB, contractVersion: HTTP_CANDIDATE_CONTRACT, operatorReviewRequired: false, inputJson: { projectId: scope.projectId },
    outputJson: { schemaVersion: "cloudflare-production-native-preparation-receipt-v1", workerName: state.packet.config.name, accountRef: account,
      deploymentId: "44444444-4444-4444-8444-444444444444", versionId: "55555555-5555-4555-8555-555555555555", workerSourceSha: "b".repeat(40),
      imageSourceSha: "c".repeat(40), manifestDigest: "e".repeat(64), applications: ["node", "python"].map(runtime => ({
        applicationId: "f".repeat(32), namespaceId: "f".repeat(32), name: `${prod}-${runtime}-http`, images: { [runtime]: image(runtime) } })),
      containerStarts: 0, runtimeConfigured: false, runtimeAcceptance: false, dnsMutation: false, trafficMutation: false, m2Preserved: true } };
});
function db(application = false) {
  let n = 0;
  const tables = ["users", "tenants", "system_settings", "worker_jobs", "credit_transactions", "model_provider_map"];
  return { execute: vi.fn(async () => {
    n++; if (n === 1) return [state.job];
    if (application && n === 2) return [{ id: "77777777-7777-4777-8777-777777777777", fixture: state.m1Fixture, fixture_owner: 17, evidence: state.m1Evidence }];
    if (application && n === 3) return [{ id: "88888888-8888-4888-8888-888888888888" }];
    const offset = application ? 2 : 0;
    if (n === 2 + offset) return tables.map(relname => ({ relname }));
    if (n === 3 + offset) return [{ relname: "delegated_worker_concurrency_leases_fencingToken_seq" }];
    if (n === 5 + offset || n === 6 + offset) return state.unsafe ? [{ unsafe: true }] : [];
    if (n === 7 + offset) return state.oldRole ? [{ existing: true }] : [];
    return [];
  }) } as any;
}
describe("non-mutating exact native runtime review", () => {
  it("produces a stable secret-free plan from the existing verified pair/network and accepts an enriched router scope", async () => {
    const enriched = { ...scope, candidateJobId: state.job.id, artifactRef: `sha256:${"a".repeat(64)}`, workerSourceSha: "b".repeat(40) };
    const first = await getHttpRuntimePlan(db(), enriched, state.job.id), second = await getHttpRuntimePlan(db(), enriched, state.job.id);
    expect(first.planDigest).toBe(second.planDigest); expect(first.ready).toBe(true);
    expect(first.plan).toMatchObject({ trafficMutation: false, dnsMutation: false, imagePublication: false, fixtureCreation: false });
    expect(first.plan.relations.sequences).toContain("delegated_worker_concurrency_leases_fencingToken_seq");
    expect(JSON.stringify(first)).not.toContain(secret); expect(first.runtimeAcceptance).toBe(false);
  });
  it("selects the corrected verified pair while preserving the existing Candidate and compensated role baseline", async () => {
    state.oldRole = true;
    const database = db();
    state.prior = { jobId: "66666666-6666-4666-8666-666666666666", rolePlan: {
      tables: ["users", "tenants", "system_settings", "worker_jobs", "credit_transactions", "model_provider_map"],
      sequences: ["delegated_worker_concurrency_leases_fencingToken_seq"] }, restoredBaseline: { deploymentId: "restored", versionId: state.job.outputJson.versionId } };
    state.desired = { target: state.target, packet: state.packet, settings: { ...state.settings, sourceSha: "f".repeat(40), node: { ...state.settings.node, image: state.settings.node.image.replace("d".repeat(64), "e".repeat(64)) } },
      publishedPair: { submissionId: "new-pair", sourceSha: "f".repeat(40), verified: true } };
    state.prior.relationsDigest = (await import("node:crypto")).createHash("sha256").update(JSON.stringify({
      tables: state.prior.rolePlan.tables, sequences: state.prior.rolePlan.sequences,
      rlsBaselineDigest: (await import("node:crypto")).createHash("sha256").update(JSON.stringify([])).digest("hex"), rlsPolicyCount: 0, rlsMutations: false })).digest("hex");
    const result = await getHttpRuntimePlan(database, scope, state.job.id);
    expect(result.plan.previousRuntime?.jobId).toBe(state.prior.jobId);
    expect(result.plan.candidate).toEqual(state.job.outputJson);
    expect(result.plan.publication).toEqual(state.desired.publishedPair);
    expect(result.plan.trafficMutation).toBe(false);
  });
  it("prepares application acceptance only from the exact M1 synthetic fixture and accepted isolation evidence", async () => {
    const tables = ["users", "tenants", "system_settings", "worker_jobs", "credit_transactions", "model_provider_map"];
    const sequences = ["delegated_worker_concurrency_leases_fencingToken_seq"], relationPolicies = [];
    const relations = { tables, sequences, rlsBaselineDigest: (await import("node:crypto")).createHash("sha256").update(JSON.stringify(relationPolicies)).digest("hex"),
      rlsPolicyCount: 0, rlsMutations: false };
    state.oldRole = true;
    const evidenceBody = { tenantId: scope.tenantId, projectId: scope.projectId, observedBy: "authorized_service_cli", tenantIsolationVerified: true,
      fixtureOnly: true, providerMutations: 0, businessRowsRead: 0, businessWrites: 0, acceptance: "M1_ACCEPTED" };
    state.m1Fixture = { tenantId: scope.tenantId, foreignTestTenantId: "tenant-codex-123456abcdef", acceptance: "NOT_ACCEPTED" };
    state.m1Evidence = { ...evidenceBody, evidenceDigest: productionDatabaseEvidenceDigest(evidenceBody) };
    state.prior = { jobId: "88888888-8888-4888-8888-888888888888", imageSourceSha: state.settings.sourceSha, workerSourceSha: "b".repeat(40),
      rolePlan: { tables, sequences }, relationsDigest: (await import("node:crypto")).createHash("sha256").update(JSON.stringify(relations)).digest("hex"),
      restoredBaseline: { deploymentId: "restored", versionId: state.job.outputJson.versionId } };
    // The original Candidate is restored; application acceptance must select
    // the corrected pair from the successful bounded runtime receipt.
    state.desired = { target: state.target, packet: state.packet, settings: { ...state.settings, sourceSha: "f".repeat(40) },
      publishedPair: { submissionId: "corrected-pair", sourceSha: "f".repeat(40), verified: true } };
    state.prior.verifiedPublication = state.desired.publishedPair;
    state.prior.relationsDigest = (await import("node:crypto")).createHash("sha256").update(JSON.stringify(relations)).digest("hex");
    const result = await getHttpRuntimePlan(db(true), scope, state.job.id, { operation: "application" });
    expect(result.ready).toBe(true);
    expect(result.plan).toMatchObject({ operation: "application", applicationAcceptance: true, fixtureCreation: true,
      applicationFixture: { m1JobId: "77777777-7777-4777-8777-777777777777", foreignTestTenantId: state.m1Fixture.foreignTestTenantId,
        evidenceDigest: state.m1Evidence.evidenceDigest }, trafficMutation: false, dnsMutation: false });
    expect(result.plan.publication.sourceSha).toBe("f".repeat(40));
    expect(result.plan.testScope).toContain("authenticated-gateway-model-routing");
    expect(result.plan.previousApplicationAcceptance).toBeNull();
    state.previousApplicationAcceptance = { jobId: "99999999-9999-4999-8999-999999999999", planDigest: "9".repeat(64),
      rolePlan: { tables, sequences }, relationsDigest: "8".repeat(64), imageSourceSha: state.settings.sourceSha,
      workerSourceSha: "b".repeat(40), restoredBaseline: { deploymentId: "77777777-7777-4777-8777-777777777777", versionId: state.job.outputJson.versionId } };
    const retry = await getHttpRuntimePlan(db(true), scope, state.job.id, { operation: "application" });
    expect(retry.plan.previousApplicationAcceptance?.jobId).toBe(state.previousApplicationAcceptance.jobId);
    state.desired.publishedPair = { ...state.desired.publishedPair, submissionId: "foreign-pair" };
    await expect(getHttpRuntimePlan(db(true), scope, state.job.id, { operation: "application" })).rejects.toThrow("HTTP_APPLICATION_RUNTIME_PUBLICATION_CHANGED");
  });
  it("reports a safe preflight phase when a non-coded Cloudflare readback failure is wrapped", async () => {
    state.providerFailure = true;
    await expect(getHttpRuntimePlan(db(), scope, state.job.id)).rejects.toThrow("HTTP_RUNTIME_PREFLIGHT_CLOUDFLARE_READBACK_UNAVAILABLE");
    await expect(getHttpRuntimePlan(db(), scope, state.job.id)).rejects.not.toThrow("provider transport detail");
  });
  it("preserves sanitized provider HTTP status diagnostics instead of collapsing them", async () => {
    state.verified = false;
    await expect(getHttpRuntimePlan(db(), scope, state.job.id)).rejects.toThrow("HTTP_RUNTIME_CANDIDATE_READBACK_REQUIRED");
  });
  it("rejects a known incompatible published image before spending another runtime attempt", async () => {
    state.settings.node.image = state.settings.node.image.replace("d".repeat(64), "d8d5b38fca643300119684f11576b4b94c5bfa6e043f75e6a3bf7f471690140f");
    await expect(getHttpRuntimePlan(db(), scope, state.job.id)).rejects.toThrow("CORRECTED_PUBLISHED_IMAGES_REQUIRED");
  });
  it.each(["artifact", "provider", "public-privileges", "existing-role", "foreign-owner", "foreign-job"])("rejects %s before any runtime authority", async mode => {
    if (mode === "artifact") state.module = false;
    if (mode === "provider") state.verified = false;
    if (mode === "public-privileges") state.unsafe = true;
    if (mode === "existing-role") state.oldRole = true;
    if (mode === "foreign-job") state.job.requestedByUserId = 18;
    await expect(getHttpRuntimePlan(db(), mode === "foreign-owner" ? { ...scope, actorUserId: 18 } : scope, state.job.id)).rejects.toThrow();
  });
});
