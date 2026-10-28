import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createJob: vi.fn(),
  grantRequest: null as Record<string, any> | null,
  storedJob: null as Record<string, any> | null,
  readCount: 0,
  workerReadbackReason: null as string | null,
}));

vi.mock("./cloudflareProductionDeploymentContract", async original => ({
  ...await original<typeof import("./cloudflareProductionDeploymentContract")>(),
  resolveCloudflareProductionDeploymentTarget: async () => ({
    targetId: "smartspec-cloudflare-runtime", tenantId: "tenant-a", projectId: "project-a", environment: "production",
    accountRef: "c".repeat(32), workerRef: "smartspec-cloudflare-runtime", credentialRef: "encrypted-ref",
    runtimePolicy: `cf-origin:${"d".repeat(64)}`, enabled: true,
  }),
}));
vi.mock("./cloudflareProductionProviderInventory", () => ({ probeCloudflareProductionProviderInventory: async () => ({
  status: "CHECKED", accessChecks: { zone: { complete: true }, routes: { complete: true }, workerDeployments: { complete: true,
    ...(mocks.workerReadbackReason ? { diagnosticCode: mocks.workerReadbackReason } : {}) },
    workerVersions: [{ complete: true }] },
  domainRoute: { zoneId: "9".repeat(32), routeId: "route-1", script: "smartspec-cloudflare-runtime", attached: true, conflicting: false },
  worker: { activeDeploymentId: "11111111-1111-4111-8111-111111111111", deploymentInventoryComplete: !mocks.workerReadbackReason,
    readbackReason: mocks.workerReadbackReason, versions: [{
    versionId: "22222222-2222-4222-8222-222222222222", deploymentId: "11111111-1111-4111-8111-111111111111",
    percentage: 100, sourceSha: "e".repeat(40), buildDigest: "f".repeat(64), configurationDigest: "d".repeat(64),
    hasVerifiedReleaseIdentity: true, bindingNames: [],
    hasProductionQueueBinding: false, hasVersionMetadataBinding: false, checked: true,
  }] },
  productionQueueConsumerInventory: { complete: true, consumers: [{ consumerId: "33333333333333333333333333333333",
    queueName: "smartspec-canonical-job-queue-production", scriptName: "smartspec-cloudflare-runtime",
    deadLetterQueueName: "smartspec-canonical-job-queue-production-dlq" }] },
}) }));
vi.mock("./cloudflareStagingArtifactAuthority", () => ({ resolveLatestPublishedCloudflareStagingArtifact: async () => ({
  artifactRef: `sha256:${"a".repeat(64)}`, sourceSha: "b".repeat(40), buildDigest: "a".repeat(64), immutable: true,
}) }));
vi.mock("./cloudflareOriginConfiguration", () => ({ getCloudflareOriginConfiguration: async () => ({ status: "STORED",
  configurationDigest: "d".repeat(64), descriptor: { expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() } }) }));
vi.mock("./appRuntimeConfig", () => ({ getAppRuntimeConfig: async () => ({ pythonBackendUrl: "https://approval.example", webGatewayToken: "internal-test-token" }) }));
vi.mock("./cloudflareExecutionReadiness", () => ({ checkCloudflareExecutionReadiness: async () => ({ ready: true }) }));
vi.mock("./jobControlPlaneGateway", () => ({ createControlPlaneJob: mocks.createJob }));

function database() {
  const jobQuery = () => ({ from() { return this; }, where() { return this; }, limit: async () => {
    mocks.readCount += 1;
    return mocks.readCount > 1 && mocks.storedJob ? [mocks.storedJob] : [];
  } });
  const settingsQuery = () => ({ from() { return this; }, where() { return this; }, limit: async () => [] });
  const tx = { execute: vi.fn(async () => undefined), select: settingsQuery,
    insert: () => ({ values: async () => undefined }) };
  return { select: jobQuery, transaction: async (callback: (tx: typeof tx) => Promise<unknown>) => callback(tx) };
}

describe("Production Worker canary admission", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); mocks.grantRequest = null; mocks.storedJob = null; mocks.readCount = 0; mocks.workerReadbackReason = null; });

  it("preflights the exact active route, single-version rollback, immutable artifact and Queue consumer", async () => {
    vi.stubEnv("CLOUDFLARE_PRODUCTION_EXECUTOR_ID", "production-executor-fixture");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ grantSchemas: ["cloudflare.production-deployment-grant.v2"] })));
    const { getProductionWorkerCanaryPreflight } = await import("./cloudflareProductionWorkerDeploymentAdmission");
    const plan = await getProductionWorkerCanaryPreflight(database() as never, { tenantId: "tenant-a", projectId: "project-a" });
    expect(plan).toMatchObject({ ready: true, routePreserved: true, candidateTrafficPercent: 1,
      rollback: { deploymentId: "11111111-1111-4111-8111-111111111111", versionId: "22222222-2222-4222-8222-222222222222" },
      queue: { name: "smartspec-canonical-job-queue-production" } });
  });

  it("returns the exact sanitized deployment readback blocker instead of a generic incomplete message", async () => {
    vi.stubEnv("CLOUDFLARE_PRODUCTION_EXECUTOR_ID", "production-executor-fixture");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ grantSchemas: ["cloudflare.production-deployment-grant.v2"] })));
    mocks.workerReadbackReason = "WORKER_DEPLOYMENT_PAGINATION_INCOMPLETE";
    const { getProductionWorkerCanaryPreflight } = await import("./cloudflareProductionWorkerDeploymentAdmission");
    await expect(getProductionWorkerCanaryPreflight(database() as never, { tenantId: "tenant-a", projectId: "project-a" }))
      .resolves.toMatchObject({ ready: false, reason: "WORKER_DEPLOYMENT_PAGINATION_INCOMPLETE" });
  });

  it("creates one scoped canonical job from the authenticated Owner grant and reconciles the same submission", async () => {
    vi.stubEnv("CLOUDFLARE_PRODUCTION_EXECUTOR_ID", "production-executor-fixture");
    const grantRef = "44444444-4444-4444-8444-444444444444";
    mocks.storedJob = { id: "55555555-5555-4555-8555-555555555555", tenantId: "tenant-a", requestedByUserId: 17,
      jobType: "cloudflare.production.deploy", contractVersion: "cloudflare-production-deploy-v1",
      inputJson: { projectId: "project-a" }, status: "queued" };
    mocks.createJob.mockResolvedValue({ created: true, jobId: mocks.storedJob.id });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        mocks.grantRequest = JSON.parse(String(init.body));
        const { idempotencyKey: _idempotencyKey, ...grantPayload } = mocks.grantRequest!;
        return Response.json({ payload: { ...grantPayload, schemaVersion: "cloudflare.production-deployment-grant.v2",
          grantRef, tenantId: "tenant-a", requesterUserId: 17, revokedAt: null } }, { status: 201 });
      }
      return Response.json({ grantSchemas: ["cloudflare.production-deployment-grant.v2"] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { queueProductionWorkerCanary } = await import("./cloudflareProductionWorkerDeploymentAdmission");
    const { getProductionWorkerCanaryPreflight } = await import("./cloudflareProductionWorkerDeploymentAdmission");
    const reviewedPlan = await getProductionWorkerCanaryPreflight(database() as never, { tenantId: "tenant-a", projectId: "project-a" });
    if (!reviewedPlan.ready) throw new Error(reviewedPlan.reason);
    const db = database() as never;
    const input = { tenantId: "tenant-a", projectId: "project-a", actorUserId: 17, userToken: "owner-session-token",
      submissionId: mocks.storedJob.id, planDigest: reviewedPlan.planDigest, correlationId: "request-trace" };
    // The same database read sequence reconciles the already-created job after the canonical admission call.
    const result = await queueProductionWorkerCanary(db, input);
    expect(result).toEqual({ jobId: mocks.storedJob.id, status: "queued" });
    const reconciled = await queueProductionWorkerCanary(db, input);
    expect(reconciled).toEqual(result);
    expect(mocks.createJob).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(mocks.createJob).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ tenantId: "tenant-a", actorId: 17,
        authorizationScope: "infrastructure.cloudflare_production_worker_deployment" }),
      definition: expect.objectContaining({ contractVersion: "cloudflare-production-deploy-v1",
        jobType: "cloudflare.production.deploy", retryPolicy: expect.objectContaining({ maxAttempts: 1 }) }),
      createOptions: expect.objectContaining({ canonicalJobId: mocks.storedJob.id, admissionMode: "durable_queue" }),
    }));
    expect(mocks.grantRequest).toMatchObject({ jobId: mocks.storedJob.id, targetId: "smartspec-cloudflare-runtime",
      environment: "production", actions: ["deploy"], candidateVersionId: null,
      rollbackDeploymentId: "11111111-1111-4111-8111-111111111111" });
  });
});
