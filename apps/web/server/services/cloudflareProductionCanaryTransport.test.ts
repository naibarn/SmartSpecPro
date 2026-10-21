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
  return new Response(JSON.stringify({ success: true, result }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("Cloudflare production canary transport", () => {
  it("rechecks the exact route and known 100% baseline before creating a 1% deployment", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([{ id: "route-1", pattern: grant.routePattern, script: grant.targetId }]))
      .mockResolvedValueOnce(response({ deployments: [{ id: grant.rollbackDeploymentId,
        versions: [{ version_id: baseline.versionId, percentage: 100 }] }] }))
      .mockResolvedValueOnce(response({ id: baseline.versionId, annotations: { "workers/message": `SmartAIHub production ${baseline.sourceSha} ${baseline.buildDigest} origin ${baseline.configurationDigest}` } }))
      .mockResolvedValueOnce(response({ id: candidate.versionId, annotations: { "workers/message": `SmartAIHub production ${candidate.sourceSha} ${candidate.buildDigest} origin ${candidate.configurationDigest}` } }))
      .mockResolvedValueOnce(response({ id: canaryDeploymentId, versions: [
        { version_id: baseline.versionId, percentage: 99 }, { version_id: candidate.versionId, percentage: 1 },
      ], annotations: { "workers/message": `SmartAIHub production canary grant ${grant.grantRef}` } }))
      .mockResolvedValueOnce(response({ id: canaryDeploymentId, versions: [
        { version_id: baseline.versionId, percentage: 99 }, { version_id: candidate.versionId, percentage: 1 },
      ], annotations: { "workers/message": `SmartAIHub production canary grant ${grant.grantRef}` } }));
    const transport = createCloudflareProductionCanaryTransport({ fetchImpl });
    const assertMutationAuthorized = vi.fn(async () => undefined);
    await expect(transport.canary({ token: "test-token", target, grant, candidate, assertMutationAuthorized }))
      .resolves.toMatchObject({ deploymentId: canaryDeploymentId });
    expect(fetchImpl.mock.calls.filter(([request, init]) => new URL(String(request)).pathname.endsWith("/deployments") && init?.method === "POST")).toHaveLength(1);
    expect(assertMutationAuthorized).toHaveBeenCalledTimes(1);
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

  it("refuses to proceed when the Worker baseline does not match the rollback grant", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([{ id: "route-1", pattern: grant.routePattern, script: grant.targetId }]))
      .mockResolvedValueOnce(response({ deployments: [{ id: "77777777-7777-4777-8777-777777777777",
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
      .mockResolvedValueOnce(response({ deployments: [{ id: "99999999-9999-4999-8999-999999999999",
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
