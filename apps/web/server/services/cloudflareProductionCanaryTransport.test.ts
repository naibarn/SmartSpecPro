import { describe, expect, it, vi } from "vitest";
import { createCloudflareProductionCanaryTransport } from "./cloudflareProductionCanaryTransport";
import type { CloudflareProductionDeploymentGrant, CloudflareProductionDeploymentTarget } from "./cloudflareProductionDeploymentContract";

const grant = {
  schemaVersion: "cloudflare.production-deployment-grant.v2",
  grantRef: "11111111-1111-4111-8111-111111111111", tenantId: "tenant-a", requesterUserId: 7,
  projectId: "project-a", executorId: "prod-executor", targetId: "smartspec-cloudflare-runtime",
  environment: "production", accountRef: "c".repeat(32), zoneId: "9".repeat(32),
  routePattern: "smartaihub.app/*", expectedRouteId: "route-1", expectedRouteScript: "smartspec-cloudflare-runtime",
  rolloutStage: "canary", canaryGrantRef: null, canaryDeploymentId: null,
  canaryVerifiedAt: null,
  candidateVersionId: null,
  jobId: "22222222-2222-4222-8222-222222222222",
  artifactRef: `sha256:${"e".repeat(64)}`, sourceSha: "d".repeat(40), buildDigest: "e".repeat(64),
  configurationRef: `cf-origin:${"f".repeat(64)}`, configurationDigest: "f".repeat(64), actions: ["deploy"],
  rollbackDeploymentId: "33333333-3333-4333-8333-333333333333",
  rollbackArtifactRef: `sha256:${"b".repeat(64)}`, rollbackSourceSha: "a".repeat(40),
  rollbackBuildDigest: "b".repeat(64), rollbackConfigurationRef: `cf-origin:${"c".repeat(64)}`,
  rollbackConfigurationDigest: "c".repeat(64), canaryRequired: true, maxDurationSeconds: 300,
  expiresAt: "2026-10-22T10:00:00Z", revokedAt: null, revoked: false,
} as CloudflareProductionDeploymentGrant;
const target: CloudflareProductionDeploymentTarget = {
  targetId: "smartspec-cloudflare-runtime", tenantId: "tenant-a", projectId: "project-a",
  environment: "production", accountRef: grant.accountRef, workerRef: "smartspec-cloudflare-runtime",
  credentialRef: "cloudflare:credential:test", enabled: true,
};
const baseline = {
  versionId: "44444444-4444-4444-8444-444444444444", sourceSha: grant.rollbackSourceSha,
  buildDigest: grant.rollbackBuildDigest, configurationDigest: grant.rollbackConfigurationDigest,
  deploymentId: grant.rollbackDeploymentId,
};
const candidate = {
  versionId: "55555555-5555-4555-8555-555555555555", sourceSha: grant.sourceSha,
  buildDigest: grant.buildDigest, configurationDigest: grant.configurationDigest,
};
const canaryDeploymentId = "66666666-6666-4666-8666-666666666666";

function response(result: unknown) {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const value = result as { annotations?: Record<string, string>; resources?: unknown };
    if (value.annotations?.["workers/message"]?.includes(` ${grant.sourceSha} ${grant.buildDigest} origin `) && !value.resources) {
      value.resources = { bindings: [
        { name: "JOB_QUEUE", type: "queue", queue_name: "smartspec-canonical-job-queue-production" },
        { name: "CF_VERSION_METADATA", type: "version_metadata" },
      ] };
    }
  }
  return new Response(JSON.stringify({ success: true, result }), { status: 200, headers: { "content-type": "application/json" } });
}

const productionQueue = [{ queue_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", queue_name: "smartspec-canonical-job-queue-production" }];
const productionQueueConsumer = [{ consumer_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  queue_name: "smartspec-canonical-job-queue-production", script_name: "smartspec-cloudflare-runtime",
  dead_letter_queue: "smartspec-canonical-job-queue-production-dlq", type: "worker" }];

describe("Cloudflare production canary transport", () => {
  it("rechecks the exact route and known 100% baseline before creating a 1% deployment", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([{ id: "route-1", pattern: grant.routePattern, script: grant.targetId }]))
      .mockResolvedValueOnce(response({ deployments: [{ id: grant.rollbackDeploymentId, created_on: "2026-10-20T00:00:00Z",
        versions: [{ version_id: baseline.versionId, percentage: 100 }] }] }))
      .mockResolvedValueOnce(response({ id: baseline.versionId, annotations: { "workers/message": `SmartAIHub production ${baseline.sourceSha} ${baseline.buildDigest} origin ${baseline.configurationDigest}` } }))
      .mockResolvedValueOnce(response({ id: candidate.versionId, annotations: { "workers/message": `SmartAIHub production ${candidate.sourceSha} ${candidate.buildDigest} origin ${candidate.configurationDigest}` } }))
      .mockResolvedValueOnce(response(productionQueue))
      .mockResolvedValueOnce(response(productionQueueConsumer))
      .mockResolvedValueOnce(response({ id: canaryDeploymentId, versions: [
        { version_id: baseline.versionId, percentage: 99 }, { version_id: candidate.versionId, percentage: 1 },
      ], annotations: { "workers/message": `SmartAIHub production canary grant ${grant.grantRef}` } }))
      .mockResolvedValueOnce(response({ id: canaryDeploymentId, versions: [
        { version_id: baseline.versionId, percentage: 99 }, { version_id: candidate.versionId, percentage: 1 },
      ], annotations: { "workers/message": `SmartAIHub production canary grant ${grant.grantRef}` } }));
    const transport = createCloudflareProductionCanaryTransport({ fetchImpl });
    const assertMutationAuthorized = vi.fn(async () => undefined);
    await expect(transport.canary({ token: "test-token", target, grant, candidate, assertMutationAuthorized }))
      .resolves.toMatchObject({ deploymentId: canaryDeploymentId, queueConsumer: { consumerId: productionQueueConsumer[0]!.consumer_id } });
    expect(fetchImpl.mock.calls.filter(([request, init]) => new URL(String(request)).pathname.endsWith("/deployments") && init?.method === "POST")).toHaveLength(1);
    const activeList = fetchImpl.mock.calls.map(([request]) => new URL(String(request))).find(url =>
      url.pathname.endsWith("/deployments") && url.searchParams.get("page") === "1");
    expect(activeList?.searchParams.get("per_page")).toBe("100");
    expect(assertMutationAuthorized).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(8);
  });

  it("attaches only the grant-bound first route after verifying the 100% baseline", async () => {
    const firstRouteGrant = { ...grant, expectedRouteId: null, expectedRouteScript: null } as CloudflareProductionDeploymentGrant;
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ deployments: [{ id: grant.rollbackDeploymentId, created_on: "2026-10-20T00:00:00Z",
        versions: [{ version_id: baseline.versionId, percentage: 100 }] }] }))
      .mockResolvedValueOnce(response({ id: baseline.versionId, annotations: { "workers/message": `SmartAIHub production ${baseline.sourceSha} ${baseline.buildDigest} origin ${baseline.configurationDigest}` } }))
      .mockResolvedValueOnce(response({ id: candidate.versionId, annotations: { "workers/message": `SmartAIHub production ${candidate.sourceSha} ${candidate.buildDigest} origin ${candidate.configurationDigest}` } }))
      .mockResolvedValueOnce(response(productionQueue))
      .mockResolvedValueOnce(response(productionQueueConsumer))
      .mockResolvedValueOnce(response({ id: "route-new", pattern: grant.routePattern, script: grant.targetId }))
      .mockResolvedValueOnce(response([{ id: "route-new", pattern: grant.routePattern, script: grant.targetId }]))
      .mockResolvedValueOnce(response({ id: canaryDeploymentId, versions: [
        { version_id: baseline.versionId, percentage: 99 }, { version_id: candidate.versionId, percentage: 1 },
      ], annotations: { "workers/message": `SmartAIHub production canary grant ${grant.grantRef}` } }))
      .mockResolvedValueOnce(response({ id: canaryDeploymentId, versions: [
        { version_id: baseline.versionId, percentage: 99 }, { version_id: candidate.versionId, percentage: 1 },
      ], annotations: { "workers/message": `SmartAIHub production canary grant ${grant.grantRef}` } }));
    const transport = createCloudflareProductionCanaryTransport({ fetchImpl });
    const assertMutationAuthorized = vi.fn(async () => undefined);

    await expect(transport.canary({ token: "test-token", target, grant: firstRouteGrant, candidate, assertMutationAuthorized }))
      .resolves.toMatchObject({ deploymentId: canaryDeploymentId });
    const writes = fetchImpl.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(writes.map(([request]) => new URL(String(request)).pathname)).toEqual([
      `/client/v4/zones/${grant.zoneId}/workers/routes`,
      `/client/v4/accounts/${grant.accountRef}/workers/scripts/${grant.targetId}/deployments`,
    ]);
    expect(JSON.parse(String(writes[0]?.[1]?.body))).toEqual({ pattern: grant.routePattern, script: grant.targetId });
    expect(assertMutationAuthorized).toHaveBeenCalledTimes(2);
  });

  it("does not attach the first route unless the exact baseline and candidate versions were verified", async () => {
    const firstRouteGrant = { ...grant, expectedRouteId: null, expectedRouteScript: null } as CloudflareProductionDeploymentGrant;
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ deployments: [{ id: "77777777-7777-4777-8777-777777777777", created_on: "2026-10-20T00:00:00Z",
        versions: [{ version_id: baseline.versionId, percentage: 100 }] }] }));
    const transport = createCloudflareProductionCanaryTransport({ fetchImpl });
    await expect(transport.canary({ token: "test-token", target, grant: firstRouteGrant, candidate,
      assertMutationAuthorized: async () => undefined })).rejects.toThrow("CLOUDFLARE_PRODUCTION_BASELINE_NOT_ACTIVE");
    expect(fetchImpl.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  });

  it("performs no provider write when the live route differs from the approved snapshot", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(response([
      { id: "route-1", pattern: grant.routePattern, script: "smartspec-cloudflare-staging" },
    ]));
    const transport = createCloudflareProductionCanaryTransport({ fetchImpl });
    await expect(transport.canary({ token: "test-token", target, grant, candidate,
      assertMutationAuthorized: async () => undefined })).rejects.toThrow("CLOUDFLARE_PRODUCTION_ROUTE_STATE_MISMATCH");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe("GET");
  });

  it("does not deploy a candidate with missing Queue/version metadata bindings", async () => {
    const brokenCandidate = { ...candidate, versionId: candidate.versionId };
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([{ id: "route-1", pattern: grant.routePattern, script: grant.targetId }]))
      .mockResolvedValueOnce(response({ deployments: [{ id: grant.rollbackDeploymentId, created_on: "2026-10-20T00:00:00Z",
        versions: [{ version_id: baseline.versionId, percentage: 100 }] }] }))
      .mockResolvedValueOnce(response({ id: baseline.versionId, annotations: { "workers/message": `SmartAIHub production ${baseline.sourceSha} ${baseline.buildDigest} origin ${baseline.configurationDigest}` } }))
      .mockResolvedValueOnce(response({ id: brokenCandidate.versionId,
        annotations: { "workers/message": `SmartAIHub production ${brokenCandidate.sourceSha} ${brokenCandidate.buildDigest} origin ${brokenCandidate.configurationDigest}` },
        resources: { bindings: [] } }));
    const transport = createCloudflareProductionCanaryTransport({ fetchImpl });
    await expect(transport.canary({ token: "test-token", target, grant, candidate: brokenCandidate,
      assertMutationAuthorized: async () => undefined })).rejects.toThrow("CLOUDFLARE_PRODUCTION_VERSION_REQUIRED_BINDINGS_MISMATCH");
    expect(fetchImpl.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  });

  it("requires the already-authorized production Queue consumer and DLQ before canary traffic changes", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([{ id: "route-1", pattern: grant.routePattern, script: grant.targetId }]))
      .mockResolvedValueOnce(response({ deployments: [{ id: grant.rollbackDeploymentId, created_on: "2026-10-20T00:00:00Z",
        versions: [{ version_id: baseline.versionId, percentage: 100 }] }] }))
      .mockResolvedValueOnce(response({ id: baseline.versionId, annotations: { "workers/message": `SmartAIHub production ${baseline.sourceSha} ${baseline.buildDigest} origin ${baseline.configurationDigest}` } }))
      .mockResolvedValueOnce(response({ id: candidate.versionId, annotations: { "workers/message": `SmartAIHub production ${candidate.sourceSha} ${candidate.buildDigest} origin ${candidate.configurationDigest}` } }))
      .mockResolvedValueOnce(response(productionQueue))
      .mockResolvedValueOnce(response([{ ...productionQueueConsumer[0], script_name: "other-worker" }]));
    const transport = createCloudflareProductionCanaryTransport({ fetchImpl });
    await expect(transport.canary({ token: "test-token", target, grant, candidate,
      assertMutationAuthorized: async () => undefined })).rejects.toThrow("CLOUDFLARE_PRODUCTION_QUEUE_CONSUMER_WORKER_MISMATCH");
    expect(fetchImpl.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  });

  it("builds the consumer readback URL from Cloudflare queue_id", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([{ id: "route-1", pattern: grant.routePattern, script: grant.targetId }]))
      .mockResolvedValueOnce(response({ deployments: [{ id: grant.rollbackDeploymentId, created_on: "2026-10-20T00:00:00Z",
        versions: [{ version_id: baseline.versionId, percentage: 100 }] }] }))
      .mockResolvedValueOnce(response({ id: baseline.versionId, annotations: { "workers/message": `SmartAIHub production ${baseline.sourceSha} ${baseline.buildDigest} origin ${baseline.configurationDigest}` } }))
      .mockResolvedValueOnce(response({ id: candidate.versionId, annotations: { "workers/message": `SmartAIHub production ${candidate.sourceSha} ${candidate.buildDigest} origin ${candidate.configurationDigest}` } }))
      .mockResolvedValueOnce(response(productionQueue))
      .mockResolvedValueOnce(response(productionQueueConsumer))
      .mockResolvedValueOnce(response({ id: canaryDeploymentId, versions: [
        { version_id: baseline.versionId, percentage: 99 }, { version_id: candidate.versionId, percentage: 1 },
      ], annotations: { "workers/message": `SmartAIHub production canary grant ${grant.grantRef}` } }))
      .mockResolvedValueOnce(response({ id: canaryDeploymentId, versions: [
        { version_id: baseline.versionId, percentage: 99 }, { version_id: candidate.versionId, percentage: 1 },
      ], annotations: { "workers/message": `SmartAIHub production canary grant ${grant.grantRef}` } }));
    const transport = createCloudflareProductionCanaryTransport({ fetchImpl });
    await expect(transport.canary({ token: "test-token", target, grant, candidate,
      assertMutationAuthorized: async () => undefined })).resolves.toMatchObject({ deploymentId: canaryDeploymentId });
    expect(new URL(String(fetchImpl.mock.calls[5]?.[0])).pathname)
      .toBe(`/client/v4/accounts/${grant.accountRef}/queues/${productionQueue[0]!.queue_id}/consumers`);
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it.each([
    [{ queue_name: "smartspec-canonical-job-queue-production" }],
    [{ queue_id: "invalid", queue_name: "smartspec-canonical-job-queue-production" }],
  ])("rejects a missing or invalid queue_id before consumer lookup", async queueRow => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([{ id: "route-1", pattern: grant.routePattern, script: grant.targetId }]))
      .mockResolvedValueOnce(response({ deployments: [{ id: grant.rollbackDeploymentId, created_on: "2026-10-20T00:00:00Z",
        versions: [{ version_id: baseline.versionId, percentage: 100 }] }] }))
      .mockResolvedValueOnce(response({ id: baseline.versionId, annotations: { "workers/message": `SmartAIHub production ${baseline.sourceSha} ${baseline.buildDigest} origin ${baseline.configurationDigest}` } }))
      .mockResolvedValueOnce(response({ id: candidate.versionId, annotations: { "workers/message": `SmartAIHub production ${candidate.sourceSha} ${candidate.buildDigest} origin ${candidate.configurationDigest}` } }))
      .mockResolvedValueOnce(response([queueRow]));
    const transport = createCloudflareProductionCanaryTransport({ fetchImpl });
    await expect(transport.canary({ token: "test-token", target, grant, candidate,
      assertMutationAuthorized: async () => undefined })).rejects.toThrow("CLOUDFLARE_PRODUCTION_QUEUE_ID_INVALID");
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(fetchImpl.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  });

  it("reports a missing DLQ distinctly from a consumer Worker mismatch", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([{ id: "route-1", pattern: grant.routePattern, script: grant.targetId }]))
      .mockResolvedValueOnce(response({ deployments: [{ id: grant.rollbackDeploymentId, created_on: "2026-10-20T00:00:00Z",
        versions: [{ version_id: baseline.versionId, percentage: 100 }] }] }))
      .mockResolvedValueOnce(response({ id: baseline.versionId, annotations: { "workers/message": `SmartAIHub production ${baseline.sourceSha} ${baseline.buildDigest} origin ${baseline.configurationDigest}` } }))
      .mockResolvedValueOnce(response({ id: candidate.versionId, annotations: { "workers/message": `SmartAIHub production ${candidate.sourceSha} ${candidate.buildDigest} origin ${candidate.configurationDigest}` } }))
      .mockResolvedValueOnce(response(productionQueue))
      .mockResolvedValueOnce(response([{ ...productionQueueConsumer[0], dead_letter_queue: "" }]));
    const transport = createCloudflareProductionCanaryTransport({ fetchImpl });
    await expect(transport.canary({ token: "test-token", target, grant, candidate,
      assertMutationAuthorized: async () => undefined })).rejects.toThrow("CLOUDFLARE_PRODUCTION_QUEUE_DLQ_MISSING_OR_INVALID");
    expect(fetchImpl.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  });

  it("refuses to proceed when the Worker baseline does not match the rollback grant", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([{ id: "route-1", pattern: grant.routePattern, script: grant.targetId }]))
      .mockResolvedValueOnce(response({ deployments: [{ id: "77777777-7777-4777-8777-777777777777", created_on: "2026-10-20T00:00:00Z",
        versions: [{ version_id: baseline.versionId, percentage: 100 }] }] }));
    const transport = createCloudflareProductionCanaryTransport({ fetchImpl });
    await expect(transport.canary({ token: "test-token", target, grant, candidate,
      assertMutationAuthorized: async () => undefined })).rejects.toThrow("CLOUDFLARE_PRODUCTION_BASELINE_NOT_ACTIVE");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it("rolls back only to the exact immutable grant-bound baseline", async () => {
    const rollbackGrant = { ...grant, grantRef: "77777777-7777-4777-8777-777777777777",
      rolloutStage: "rollback", actions: ["rollback"], canaryGrantRef: null,
      canaryDeploymentId: null, candidateVersionId: null } as CloudflareProductionDeploymentGrant;
    const rollbackDeploymentId = "88888888-8888-4888-8888-888888888888";
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([{ id: "route-1", pattern: grant.routePattern, script: grant.targetId }]))
      .mockResolvedValueOnce(response({ deployments: [{ id: "99999999-9999-4999-8999-999999999999", created_on: "2026-10-20T00:00:00Z",
        versions: [{ version_id: candidate.versionId, percentage: 100 }] }] }))
      .mockResolvedValueOnce(response({ id: grant.rollbackDeploymentId,
        versions: [{ version_id: baseline.versionId, percentage: 100 }] }))
      .mockResolvedValueOnce(response({ id: baseline.versionId, annotations: { "workers/message": `SmartAIHub production ${baseline.sourceSha} ${baseline.buildDigest} origin ${baseline.configurationDigest}` } }))
      .mockResolvedValueOnce(response({ id: rollbackDeploymentId, versions: [{ version_id: baseline.versionId, percentage: 100 }],
        annotations: { "workers/message": `SmartAIHub production rollback grant ${rollbackGrant.grantRef}` } }))
      .mockResolvedValueOnce(response({ id: rollbackDeploymentId, versions: [{ version_id: baseline.versionId, percentage: 100 }],
        annotations: { "workers/message": `SmartAIHub production rollback grant ${rollbackGrant.grantRef}` } }));
    const transport = createCloudflareProductionCanaryTransport({ fetchImpl });
    const assertMutationAuthorized = vi.fn(async () => undefined);
    await expect(transport.rollback({ token: "test-token", target, grant: rollbackGrant, assertMutationAuthorized }))
      .resolves.toMatchObject({ deploymentId: rollbackDeploymentId });
    expect(assertMutationAuthorized).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
});
