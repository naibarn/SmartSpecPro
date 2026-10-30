import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
const state = vi.hoisted(() => ({ intent: null as any, packet: null as any, target: null as any, deployed: false,
  expired: false, revoked: false, fence: false, revokeAfterDryRun: false, progress: vi.fn(), commands: vi.fn() }));
vi.mock("../db", () => ({ getDb: () => ({}) }));
vi.mock("./cloudflareHttpCandidatePreparation", () => ({
  assertHttpCandidateOwner: async (_db: any, scope: any) => { if (scope.actorUserId !== 17 || scope.tenantId !== "tenant-fixture") throw Error("OWNER_SCOPE_DENIED"); },
  readHttpCandidateIntent: async () => ({ updatedBy: 17, valueJson: { ...state.intent,
    expiresAt: state.expired ? "2020-01-01T00:00:00Z" : state.intent.expiresAt, revokedAt: state.revoked ? "2026-01-01T00:00:00Z" : null } }),
  resolveHttpCandidatePackage: async () => ({ target: state.target, packet: state.packet }),
}));
vi.mock("./cloudflareStagingArtifactAuthority", () => ({ resolveCloudflareStagingModules: async () => ({
  moduleFiles: { "applicationHttpCandidateEntrypoint.js": { bytes: new TextEncoder().encode("export default {}") } } }) }));
vi.mock("./cloudflareCredentialCenter", () => ({ withCloudflareDeploymentCredential: async (_db: any, _scope: any, operation: any) =>
  ({ status: "CONFIGURED", value: await operation("scoped-fixture-token") }) }));
vi.mock("./cloudflareHttpImageBuildOperator", () => ({ runHttpImageOperatorCommand: async (input: any) => {
  await input.assertAuthorized(); state.commands(input);
  const config = JSON.parse(await readFile(input.args[input.args.indexOf("--config") + 1], "utf8"));
  expect(config.name).toBe("isolated-candidate"); expect(config.routes).toEqual([]); expect(config).not.toHaveProperty("secrets");
  expect(input.env.CLOUDFLARE_API_TOKEN).toBe("scoped-fixture-token"); expect(input.env).not.toHaveProperty("DATABASE_URL");
  if (input.args.includes("--dry-run")) { if (state.revokeAfterDryRun) state.fence = true; }
  else state.deployed = true;
  return "provider stdout is not a receipt";
} }));
import { createHttpCandidateExecutor } from "./cloudflareHttpCandidateExecutor";
import { HTTP_CANDIDATE_CONTRACT, HTTP_CANDIDATE_JOB } from "./cloudflareHttpCandidateContract";
beforeEach(() => {
  state.expired = false; state.revoked = false; state.fence = false; state.revokeAfterDryRun = false; state.deployed = false;
  state.progress.mockReset(); state.commands.mockReset();
  process.env.CLOUDFLARE_PRODUCTION_EXECUTOR_ID = "fixture-executor";
  state.target = { accountRef: "a".repeat(32), credentialRef: "fixture-production-credential" };
  state.packet = { manifestDigest: "b".repeat(64), imageSourceSha: "c".repeat(40), config: {
    name: "isolated-candidate", routes: [], vars: { CLOUDFLARE_ENVIRONMENT: "production", CLOUDFLARE_ACTIVATION: "disabled", CLOUDFLARE_CONTAINER_POLICY: "on-demand" },
    containers: ["node", "python"].map(runtime => ({ name: `fixture-${runtime}`, class_name: runtime === "node" ? "ProductionNodeHttpContainer" : "ProductionPythonHttpContainer",
      images: { [runtime]: { image: `registry.cloudflare.com/fixture/${runtime}@sha256:${"d".repeat(64)}` } } })) } };
  state.intent = { tenantId: "tenant-fixture", projectId: "project-fixture", actorUserId: 17,
    submissionId: "11111111-1111-4111-8111-111111111111", planDigest: "e".repeat(64), expiresAt: new Date(Date.now() + 300000).toISOString(), revokedAt: null,
    containerStarts: 0, dnsMutation: false, trafficMutation: false, plan: { ...state.target, executorId: "fixture-executor", workerName: "isolated-candidate",
      artifactRef: `sha256:${"f".repeat(64)}`, workerSourceSha: "1".repeat(40), manifestDigest: state.packet.manifestDigest, imageSourceSha: state.packet.imageSourceSha,
      workerBaseline: null } };
  vi.stubGlobal("fetch", vi.fn(async (request: any, init: any) => {
    expect(init.method).toBe("GET"); const path = new URL(String(request)).pathname;
    if (path.includes("dns_records")) throw Error("DNS_MUST_NOT_BE_REQUIRED");
    if (path.endsWith(`/accounts/${state.target.accountRef}`)) return Response.json({ success: true, result: { id: state.target.accountRef } });
    if (path.endsWith("/deployments")) return state.deployed ? Response.json({ success: true, result: { deployments: [{ id: "deployment-receipt", versions: [{ version_id: "version-receipt", percentage: 100 }] }] } })
      : Response.json({ success: false }, { status: 404 });
    if (path.endsWith("/workers/routes")) return Response.json({ success: true, result: [{ id: "accepted-route", pattern: "smartaihub.app/*", script: "smartspec-cloudflare-runtime" }] });
    if (path.endsWith("/workers/subdomain")) return Response.json({ success: true, result: { subdomain: "fixture" } });
    if (path.endsWith("/containers/applications")) return Response.json({ success: true, result: state.deployed ? ["node", "python"].map((runtime, index) => ({
      id: `application-${runtime}`, name: `fixture-${runtime}`, scheduling_policy: "durable_object", durable_objects: { namespace_id: String(index + 1).repeat(32) } })) : [] });
    if (path.endsWith("/versions/version-receipt")) return Response.json({ success: true, result: { resources: {
      bindings: state.packet.config.containers.map((item: any, index: number) => ({ type: "durable_object_namespace", name: index === 0 ? "NODE_HTTP" : "PYTHON_HTTP", class_name: item.class_name,
        script_name: "isolated-candidate", namespace_id: String(index + 1).repeat(32) })), script_runtime: { containers: state.packet.config.containers.map((item: any) => ({
          class_name: item.class_name, images: Object.fromEntries(Object.entries(item.images).map(([name, value]: any) => [name, value.image])) })) } } } });
    throw Error("UNEXPECTED_PROVIDER_READ");
  }));
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.CLOUDFLARE_PRODUCTION_EXECUTOR_ID; });
function run() {
  return createHttpCandidateExecutor()({ context: { jobId: state.intent.submissionId, tenantId: "tenant-fixture", requestedByUserId: 17,
    createdAt: new Date().toISOString(), jobType: HTTP_CANDIDATE_JOB, contractVersion: HTTP_CANDIDATE_CONTRACT, executionClass: "long",
    input: { contractVersion: HTTP_CANDIDATE_CONTRACT, projectId: "project-fixture", submissionId: state.intent.submissionId, planDigest: state.intent.planDigest } },
    lease: { expiresAt: new Date(Date.now() + 60000).toISOString() }, reporter: { heartbeat: vi.fn(), progress: state.progress,
      assertActive: async () => { if (state.fence) throw Error("LEASE_FENCED"); } } } as never);
}
describe("canonical isolated metadata executor", () => {
  it("runs fixed Wrangler commands under live authority and records real provider readbacks, not CLI success", async () => {
    const result = await run(); expect(result.output).toMatchObject({ deploymentId: "deployment-receipt", versionId: "version-receipt",
      containerStarts: 0, runtimeConfigured: false, runtimeAcceptance: false, m2Preserved: true });
    expect((result.output as any).applications).toHaveLength(2); expect(state.commands).toHaveBeenCalledTimes(2);
    expect(state.progress).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ stage: "NATIVE_CANDIDATE_PROVIDER_WRITE_INTENT" }));
  });
  it.each(["expired", "revoked"] as const)("rejects %s authorization before provider writes", async property => {
    state[property] = true; await expect(run()).rejects.toThrow("AUTHORIZATION_EXPIRED_OR_CHANGED"); expect(state.commands).not.toHaveBeenCalled();
  });
  it("stops on fencing between dry-run and deploy without spending a provider write", async () => {
    state.revokeAfterDryRun = true; await expect(run()).rejects.toThrow("LEASE_FENCED");
    expect(state.commands).toHaveBeenCalledTimes(1); expect(state.deployed).toBe(false);
  });
  it("rejects an immutable configuration mismatch before a CLI command", async () => {
    state.intent.plan.manifestDigest = "0".repeat(64); await expect(run()).rejects.toThrow("PLAN_CHANGED"); expect(state.commands).not.toHaveBeenCalled();
  });
});
