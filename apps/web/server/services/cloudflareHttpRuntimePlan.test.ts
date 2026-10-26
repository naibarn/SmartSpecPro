import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpApplicationNamespace } from "./cloudflareHttpApplicationBindings";
const state = vi.hoisted(() => ({ job: null as any, packet: null as any, target: null as any, settings: null as any,
  module: true, verified: true, unsafe: false, oldRole: false }));
const scope = { tenantId: "tenant-fixture", projectId: "project-fixture", actorUserId: 17 };
const secret = "fixture-application-secret-with-at-least-32-characters";
vi.mock("node:fs/promises", async original => ({ ...(await original<any>()), readFile: async () =>
  `JWT_SECRET=${secret}\nSECRET_KEY=${secret}\nENCRYPTION_MASTER_KEY=${secret}\nSMARTSPEC_WEB_GATEWAY_TOKEN=${secret}\n` }));
vi.mock("./cloudflareHttpCandidatePreparation", () => ({ assertHttpCandidateOwner: async (_db: any, s: any) => {
  if (s.tenantId !== "tenant-fixture" || s.actorUserId !== 17) throw Error("OWNER_SCOPE_DENIED"); },
  resolveHttpCandidatePackage: async () => ({ packet: state.packet, target: state.target, settings: state.settings }) }));
vi.mock("./cloudflareHttpDatabaseNetwork", () => ({ readHttpDatabaseNetwork: async () => ({ transport: "private-vpc-websocket-v1",
  providerReadbackVerified: true, m1Preserved: true, tunnelId: "191d047e-674a-48f4-b105-b37269c2dad6", hostname: "db.smartaihub.app", port: 5433, databaseName: "fixture" }) }));
vi.mock("./cloudflareStagingArtifactAuthority", () => ({ resolveLatestPublishedCloudflareStagingArtifact: async () => ({ artifactRef: `sha256:${"a".repeat(64)}`, sourceSha: "b".repeat(40) }),
  resolveCloudflareStagingArtifact: async (ref: string, sha: string) => ({ artifactRef: ref, sourceSha: sha }),
  resolveCloudflareStagingModules: async () => ({ moduleFiles: state.module ? { "applicationHttpCandidateEntrypoint.js": { bytes: Buffer.from("export class ApplicationDatabaseBridge {}") } } : {} }) }));
vi.mock("./cloudflareCredentialCenter", () => ({ withCloudflareDeploymentCredential: async () => ({ status: "CONFIGURED", value: { verified: state.verified } }) }));
import { getHttpRuntimePlan } from "./cloudflareHttpRuntimePlan";
import { HTTP_CANDIDATE_JOB, HTTP_CANDIDATE_CONTRACT } from "./cloudflareHttpCandidateContract";
beforeEach(() => {
  Object.assign(process.env, { JWT_SECRET: secret, API_KEY_HMAC_SECRET: secret, LLM_ENCRYPTION_KEY: secret, CONTROL_PLANE_API_KEY: secret,
    CLOUDFLARE_PRODUCTION_EXECUTOR_ID: "fixture-executor" });
  state.module = true; state.verified = true; state.unsafe = false; state.oldRole = false;
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
function db() {
  let n = 0;
  const tables = ["users", "tenants", "system_settings", "worker_jobs", "credit_transactions", "model_provider_map"];
  return { execute: vi.fn(async () => {
    n++; if (n === 1) return [state.job]; if (n === 2) return tables.map(relname => ({ relname }));
    if (n === 3) return [{ relname: "delegated_worker_concurrency_leases_fencingToken_seq" }];
    if (n === 5) return state.unsafe ? [{ unsafe: true }] : [];
    if (n === 7) return state.oldRole ? [{ existing: true }] : [];
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
  it.each(["artifact", "provider", "public-privileges", "existing-role", "foreign-owner", "foreign-job"])("rejects %s before any runtime authority", async mode => {
    if (mode === "artifact") state.module = false;
    if (mode === "provider") state.verified = false;
    if (mode === "public-privileges") state.unsafe = true;
    if (mode === "existing-role") state.oldRole = true;
    if (mode === "foreign-job") state.job.requestedByUserId = 18;
    await expect(getHttpRuntimePlan(db(), mode === "foreign-owner" ? { ...scope, actorUserId: 18 } : scope, state.job.id)).rejects.toThrow();
  });
});
