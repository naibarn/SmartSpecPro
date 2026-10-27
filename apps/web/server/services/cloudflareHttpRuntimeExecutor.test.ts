import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
const state = vi.hoisted(() => ({ plan: null as any, intent: null as any, package: null as any, checkpoint: null as any,
  bindings: [] as any[], phase: "baseline", expired: false, revoked: false, probeFailure: false, uncertainWrite: false, paginatedHistory: false, paginatedApps: false, imageMismatch: false,
  commands: vi.fn(), role: vi.fn(), owner: vi.fn(), assertActive: vi.fn(), updates: vi.fn() }));
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const db: any = { execute: vi.fn(async () => []), transaction: async (fn: any) => fn(db),
  select: () => ({ from: () => ({ where: () => ({ limit: async () => state.checkpoint ? [state.checkpoint] : [] }) }) }),
  insert: () => ({ values: async (value: any) => { state.checkpoint = { ...value, id: 1 }; } }),
  update: () => ({ set: (value: any) => ({ where: async () => { state.updates(value); state.checkpoint = { ...state.checkpoint, ...value }; } }) }) };
vi.mock("../db", () => ({ getDb: () => db }));
vi.mock("./cloudflareHttpCandidatePreparation", () => ({ assertHttpCandidateOwner: async () => { state.owner(); }, resolveHttpCandidatePackage: async () => state.package }));
vi.mock("./cloudflareHttpRuntimeAdmission", () => ({ readHttpRuntimeIntent: async () => ({ updatedBy: 17, valueJson: { ...state.intent,
  ...(state.expired ? { expiresAt: "2020-01-01T00:00:00Z" } : {}), ...(state.revoked ? { revokedAt: "2026-01-01T00:00:00Z" } : {}) } }) }));
vi.mock("./cloudflareHttpRuntimePlan", () => ({ getHttpRuntimePlan: async () => ({ plan: state.plan }),
  loadHttpRuntimeEnvironments: async () => ({ nodeEnvironment: {}, pythonEnvironment: {} }),
  planHttpApplicationRelations: async () => state.plan.relations }));
vi.mock("./cloudflareApplicationDatabaseRole", () => ({ prepareApplicationDatabaseRole: async (_db: any, input: any) => {
  await input.assertAuthorized(); state.role(input.plan); await input.saveSecret(db, { role: state.plan.role, password: "never-log-runtime-password", planDigest: "role-plan" });
  return { role: state.plan.role, policiesChanged: false }; } }));
vi.mock("./cloudflareHttpRuntimeComposition", () => ({ composeHttpRuntime: (input: any) => ({
  secrets: { node: { DATABASE_URL: "never-log-runtime-password" }, python: {} },
  bindings: state.bindings, vpcNetworks: [{ binding: "DATABASE_NETWORK", tunnel_id: state.plan.network.tunnelId }],
}) }));
vi.mock("./cloudflareStagingArtifactAuthority", () => ({ resolveCloudflareStagingModules: async () => ({
  moduleFiles: { "applicationHttpCandidateEntrypoint.js": { bytes: new TextEncoder().encode("export default {}") } } }) }));
vi.mock("./cloudflareCredentialCenter", () => ({ withCloudflareDeploymentCredential: async (_db: any, _scope: any, fn: any) =>
  ({ status: "CONFIGURED", value: await fn("never-log-provider-token") }) }));
vi.mock("./crypto", () => ({ encrypt: (value: string) => `encrypted:${value}`, decrypt: (value: string) => value.slice("encrypted:".length) }));
vi.mock("./cloudflareHttpImageBuildOperator", () => ({ runHttpImageOperatorCommand: async (input: any) => {
  await input.assertAuthorized(); state.commands(input.args);
  expect(input.args).not.toContain("--containers-rollout");
  const config = JSON.parse(await readFile(input.args[input.args.indexOf("--config") + 1], "utf8"));
  const secretsPath = input.args[input.args.indexOf("--secrets-file") + 1], secrets = JSON.parse(await readFile(secretsPath, "utf8"));
  expect((await stat(secretsPath)).mode & 0o777).toBe(0o600);
  expect(config.name).toBe(state.plan.candidate.workerName); expect(config.routes).toEqual([]);
  expect(config.migrations).toBeUndefined(); expect(JSON.stringify(config)).not.toContain("never-log");
  expect(secrets.CLOUDFLARE_NODE_HTTP_SECRETS).toBe("never-log-runtime-password");
  expect(input.env.DATABASE_URL).toBeUndefined();
  if (!input.args.includes("--dry-run")) { state.phase = "runtime"; if (state.uncertainWrite) throw Error("HTTP_IMAGE_OPERATOR_RESPONSE_LOST"); }
  return "stdout is not a deployment receipt";
} }));
import { createHttpRuntimeExecutor } from "./cloudflareHttpRuntimeExecutor";
import { HTTP_RUNTIME_JOB, HTTP_RUNTIME_CONTRACT } from "./cloudflareHttpRuntimeContract";
beforeEach(() => {
  vi.clearAllMocks(); state.phase = "baseline"; state.expired = false; state.revoked = false; state.probeFailure = false; state.uncertainWrite = false; state.checkpoint = null;
  state.paginatedHistory = false; state.paginatedApps = false; state.imageMismatch = false;
  process.env.CLOUDFLARE_PRODUCTION_EXECUTOR_ID = "fixture-executor";
  state.bindings = [{ name: "CLOUDFLARE_ENVIRONMENT", type: "plain_text", text: "production" },
    { name: "CLOUDFLARE_NODE_HTTP_SECRETS", type: "secret_text", text: "never-log-runtime-password" }];
  state.plan = { publication: { sourceSha: "c".repeat(40) }, candidateJobId: "22222222-2222-4222-8222-222222222222", role: "sah_cf_app_abcdef012345",
    network: { tunnelId: "191d047e-674a-48f4-b105-b37269c2dad6", databaseName: "fixture", transport: "private-vpc-websocket-v1" },
    candidate: { workerName: "smartspec-production-abcdef012345-candidate", deploymentId: "baseline-deployment", versionId: "baseline-version",
      applications: [{ applicationId: "node-app", namespaceId: "node-ns", name: "node-app" }, { applicationId: "python-app", namespaceId: "python-ns", name: "python-app" }] },
    relations: { tables: ["users"], sequences: [], rlsBaselineDigest: "baseline", rlsMutations: false },
    artifactRef: `sha256:${"a".repeat(64)}`, workerSourceSha: "b".repeat(40), executorId: "fixture-executor" };
  state.package = { target: { accountRef: "a".repeat(32), credentialRef: "fixture-credential" }, settings: { node: { image: "node-image" }, python: { image: "python-image" } }, packet: {
    config: { name: state.plan.candidate.workerName, routes: [], migrations: [{ tag: "never-recreate" }], containers: ["node", "python"].map(runtime => ({ class_name: runtime + "-class", images: { [runtime]: { image: runtime + "-image" } } })) } } };
  state.intent = { tenantId: "tenant-fixture", projectId: "project-fixture", actorUserId: 17, submissionId: "11111111-1111-4111-8111-111111111111",
    plan: state.plan, planDigest: hash(state.plan), expiresAt: new Date(Date.now() + 2_700_000).toISOString(), revokedAt: null,
    authority: "existing-candidate-bounded-runtime-test-v1", trafficMutation: false, dnsMutation: false, imagePublication: false, applicationCreation: false, fixtureCreation: false };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
    const path = new URL(url).pathname;
    const success = (result: unknown) => Response.json({ success: true, result });
    if (path.includes("application-canary")) {
      expect(init.headers["x-smartaihub-application-canary-token"]).toHaveLength(64);
      if (path.endsWith("/stop")) return Response.json({ stopped: true });
      if (path.endsWith("/status")) return Response.json({ running: !state.probeFailure, starts: 1, reservedSeconds: 600, configurationMatches: true, image: path.endsWith("node/status") ? "node-image" : "python-image",
        failure: state.probeFailure ? { code: "APPLICATION_HTTP_CONTAINER_EXITED_BEFORE_READY", kind: "Error", phase: "readiness", at: Date.now(), exitCode: 1 } : null,
        token: "never-log-provider-token", environment: { PASSWORD: "never-log-runtime-password" } });
      if (path.endsWith("node/auth")) return Response.json({ result: { data: { json: null } } });
      if (path.endsWith("python/auth")) return Response.json({ error: "unauthorized" }, { status: 401 });
      return Response.json({ status: "ready" }, { status: state.probeFailure ? 503 : 200, headers: { "cf-ray": "fixture-SIN" } });
    }
    if (path.endsWith("workers/routes")) return success([{ id: "accepted-route", pattern: "smartaihub.app/*", script: "smartspec-cloudflare-runtime" }]);
    if (path.endsWith("smartspec-cloudflare-runtime/deployments")) return Response.json({ success: true,
      result_info: { page: 1, total_pages: state.paginatedHistory ? 2 : 1 }, result: { deployments: [{ id: "m2-accepted", versions: [{ version_id: "m2-version", percentage: 100 }] }] } });
    if (path.endsWith("workers/subdomain")) return success({ subdomain: "fixture" });
    if (path.endsWith("/deployments")) {
      if (init.method === "POST") { expect(JSON.parse(init.body).versions).toEqual([{ version_id: "baseline-version", percentage: 100 }]); state.phase = "baseline"; }
      return success({ deployments: [{ id: `${state.phase}-deployment`, versions: [{ version_id: `${state.phase}-version`, percentage: 100 }] }] });
    }
    if (path.endsWith("/versions/runtime-version")) return success({ annotations: { "workers/message": `canonical-native-runtime:${state.intent.submissionId}:${state.intent.planDigest}` }, resources: {
      script_runtime: { containers: ["node", "python"].map(runtime => ({ class_name: runtime + "-class", images: { [runtime]: state.imageMismatch ? "stale-image" : runtime + "-image" } })) }, bindings: [...state.bindings.map(({ text, ...b }) => b.type === "plain_text" ? { ...b, text } : b),
        { name: "DATABASE_NETWORK", type: "vpc_network", tunnel_id: state.plan.network.tunnelId },
        ...state.plan.candidate.applications.map((a: any) => ({ type: "durable_object_namespace", namespace_id: a.namespaceId }))] } });
    if (path.endsWith("containers/applications")) return Response.json({ success: true, result_info: { total_pages: state.paginatedApps ? 2 : 1 },
      result: state.plan.candidate.applications.map((a: any) => ({ id: a.applicationId, name: a.name, scheduling_policy: "durable_object", durable_objects: { namespace_id: a.namespaceId } })) });
    throw Error("UNEXPECTED_PROVIDER_CALL");
  }));
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.CLOUDFLARE_PRODUCTION_EXECUTOR_ID; });
const run = (overrides: Record<string, unknown> = {}) => createHttpRuntimeExecutor()({ context: { jobId: state.intent.submissionId, tenantId: "tenant-fixture", requestedByUserId: 17,
  jobType: HTTP_RUNTIME_JOB, contractVersion: HTTP_RUNTIME_CONTRACT, executionClass: "long", input: { contractVersion: HTTP_RUNTIME_CONTRACT,
    projectId: "project-fixture", candidateJobId: state.plan.candidateJobId, submissionId: state.intent.submissionId, planDigest: state.intent.planDigest }, ...overrides },
  lease: { expiresAt: new Date(Date.now() + 60_000).toISOString() }, reporter: { assertActive: state.assertActive, heartbeat: vi.fn(), progress: vi.fn() } } as never);
describe("canonical bounded existing-Candidate runtime executor", () => {
  it("resumes only a proven pre-write checkpoint using the canonical same-intent recovery contract", async () => {
    state.checkpoint = { id: 1, isSensitive: true, updatedBy: 17, value: "encrypted:" + JSON.stringify({
      jobId: state.intent.submissionId, tenantId: state.intent.tenantId, projectId: state.intent.projectId, actorUserId: 17,
      planDigest: state.intent.planDigest, stage: "PREPARING", rolePrepared: false, providerWriteIntent: false }) };
    await expect(run()).rejects.toThrow("CHECKPOINT_RECONCILE_REQUIRED");
    const result = await run({ attempt: 2, maxAttempts: 2, retryPolicy: { httpRuntimePrewriteRecovery: { attempt: 2,
      intentId: state.intent.submissionId, planDigest: state.intent.planDigest, expiresAt: state.intent.expiresAt } } });
    expect((result.output as any).runtimeBootVerified).toBe(true); expect(state.role).toHaveBeenCalledOnce();
  });
  it.each(["rolePrepared", "providerWriteIntent", "configurationRef"])("refuses recovery of an uncertain %s checkpoint", async key => {
    state.checkpoint = { id: 1, isSensitive: true, updatedBy: 17, value: "encrypted:" + JSON.stringify({
      jobId: state.intent.submissionId, tenantId: state.intent.tenantId, projectId: state.intent.projectId, actorUserId: 17,
      planDigest: state.intent.planDigest, stage: "PREPARING", rolePrepared: false, providerWriteIntent: false, [key]: true }) };
    await expect(run({ attempt: 2, maxAttempts: 2, retryPolicy: { httpRuntimePrewriteRecovery: { attempt: 2,
      intentId: state.intent.submissionId, planDigest: state.intent.planDigest, expiresAt: state.intent.expiresAt } } })).rejects.toThrow("CHECKPOINT_RECONCILE_REQUIRED");
    expect(state.role).not.toHaveBeenCalled();
  });
  it("reads the active M2 deployment from paginated history without requiring unrelated older pages", async () => {
    state.paginatedHistory = true; expect(((await run()).output as any).cleanup.m2Preserved).toBe(true);
  });
  it("keeps genuinely incomplete application inventory fail-closed and compensates", async () => {
    state.paginatedApps = true; await expect(run()).rejects.toThrow("PROVIDER_INVENTORY_INCOMPLETE"); expect(state.phase).toBe("baseline");
  });
  it("rejects stale named image metadata before starting a Container and compensates the existing Candidate", async () => {
    state.imageMismatch = true;
    await expect(run()).rejects.toThrow("IMAGE_REFERENCE_TRANSITION_READBACK_MISMATCH");
    expect(state.phase).toBe("baseline");
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("node/health"))).toBe(false);
  });
  it("tests actual runtime endpoints and compensates without claiming full application acceptance", async () => {
    const result = (await run()).output as any;
    expect(result).toMatchObject({ runtimeBootVerified: true, runtimeAcceptance: false, m3Accepted: false, trafficMutation: false,
      cleanup: { nodeStopped: true, pythonStopped: true, candidateRestored: true, roleLoginRevoked: true, m2Preserved: true } });
    expect(result.probes).toHaveLength(6); expect(state.role).toHaveBeenCalledOnce(); expect(state.commands).toHaveBeenCalledTimes(2);
    const probes = vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url)).pathname).filter(path => path.includes("application-canary") && !path.endsWith("/stop"));
    expect(probes.map(path => path.split("application-canary/")[1])).toEqual([
      "node/status", "python/status", "node/health", "node/database", "node/auth", "node/status", "python/health", "python/database", "python/auth", "python/status"]);
    expect(JSON.stringify(result)).not.toContain("never-log"); expect(state.phase).toBe("baseline");
  });
  it.each(["expired", "revoked"] as const)("rejects %s intent before role or provider mutation", async mode => {
    state[mode] = true; await expect(run()).rejects.toThrow(/AUTHORIZATION/); expect(state.role).not.toHaveBeenCalled(); expect(state.commands).not.toHaveBeenCalled();
  });
  it("rejects changed reviewed plan without consuming an authorized start", async () => {
    state.plan.candidateJobId = "33333333-3333-4333-8333-333333333333";
    await expect(run()).rejects.toThrow("AUTHORIZATION_DENIED"); expect(state.role).not.toHaveBeenCalled();
  });
  it("compensates an actual failed health probe and keeps the precise sanitized error", async () => {
    state.probeFailure = true; await expect(run()).rejects.toThrow("HTTP_RUNTIME_PROBE_NODE_HEALTH_HTTP_503");
    expect(state.phase).toBe("baseline"); expect(state.commands).toHaveBeenCalledTimes(2);
    const saved = JSON.parse(state.checkpoint.value.slice("encrypted:".length));
    expect(saved.preStartDiagnostics).toHaveLength(2);
    expect(saved.runtimeDiagnostics).toHaveLength(2);
    expect(saved.runtimeDiagnostics[0]).toMatchObject({ runtime: "node", http: 200, starts: 1,
      failure: { code: "APPLICATION_HTTP_CONTAINER_EXITED_BEFORE_READY", phase: "readiness", exitCode: 1 } });
    expect(JSON.stringify(saved.runtimeDiagnostics)).not.toMatch(/never-log|PASSWORD|environment/);
    const calls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(calls.findIndex(url => url.endsWith("node/status"))).toBeLessThan(calls.findIndex(url => url.endsWith("node/stop")));
    expect(state.updates).toHaveBeenCalledWith(expect.objectContaining({ isSensitive: true, valueJson: null }));
  });
  it("reconciles a successful provider write with lost CLI response without deploying again", async () => {
    state.uncertainWrite = true; await expect(run()).rejects.toThrow("HTTP_IMAGE_OPERATOR_RESPONSE_LOST");
    expect(state.phase).toBe("baseline"); expect(state.commands).toHaveBeenCalledTimes(2);
  });
});
