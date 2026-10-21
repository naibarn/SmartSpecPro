import { describe, expect, it, vi } from "vitest";
import { createCloudflareProductionDeploymentExecutor, type CloudflareProductionDeploymentRuntime } from "./cloudflareProductionDeploymentExecutor";
import {
  CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT,
  CLOUDFLARE_PRODUCTION_DEPLOYMENT_JOB,
  CLOUDFLARE_PRODUCTION_DEPLOYMENT_GRANT,
  CLOUDFLARE_PRODUCTION_TARGET_ID,
} from "./cloudflareProductionDeploymentContract";

const digest = "a".repeat(64);
const sourceSha = "b".repeat(40);
const jobId = "11111111-1111-4111-8111-111111111111";
const grantRef = "22222222-2222-4222-8222-222222222222";
const configurationRef = `cf-origin:${digest}`;
const grant = {
  schemaVersion: CLOUDFLARE_PRODUCTION_DEPLOYMENT_GRANT,
  grantRef, tenantId: "tenant-a", requesterUserId: 7, projectId: "project-a", executorId: "prod-executor-a",
  targetId: CLOUDFLARE_PRODUCTION_TARGET_ID, environment: "production", accountRef: "c".repeat(32),
  zoneId: "9".repeat(32), routePattern: "smartaihub.app/*", expectedRouteId: "route-a",
  expectedRouteScript: CLOUDFLARE_PRODUCTION_TARGET_ID, rolloutStage: "canary",
  canaryGrantRef: null, canaryDeploymentId: null, canaryVerifiedAt: null, candidateVersionId: null,
  jobId, artifactRef: `sha256:${digest}`, sourceSha, buildDigest: digest,
  configurationRef, configurationDigest: digest, actions: ["deploy"],
  rollbackDeploymentId: "33333333-3333-4333-8333-333333333333", rollbackArtifactRef: `sha256:${"d".repeat(64)}`,
  rollbackSourceSha: "e".repeat(40), rollbackBuildDigest: "d".repeat(64), rollbackConfigurationRef: `cf-origin:${"f".repeat(64)}`,
  rollbackConfigurationDigest: "f".repeat(64), canaryRequired: true, maxDurationSeconds: 300,
  expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(), revokedAt: null, revoked: false as const,
};
const job = {
  contractVersion: CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT, action: "deploy",
  targetId: CLOUDFLARE_PRODUCTION_TARGET_ID, environment: "production", zoneId: grant.zoneId,
  routePattern: grant.routePattern, expectedRouteId: grant.expectedRouteId, expectedRouteScript: grant.expectedRouteScript,
  rolloutStage: "canary", canaryGrantRef: null, canaryDeploymentId: null, canaryVerifiedAt: null,
  candidateVersionId: null, grantRef, projectId: grant.projectId, artifactRef: grant.artifactRef,
  sourceSha, buildDigest: digest, configurationRef, configurationDigest: digest,
};
const target = { targetId: CLOUDFLARE_PRODUCTION_TARGET_ID, tenantId: "tenant-a", projectId: "project-a",
  environment: "production" as const, accountRef: grant.accountRef, workerRef: CLOUDFLARE_PRODUCTION_TARGET_ID,
  credentialRef: "credential-ref", runtimePolicy: configurationRef, enabled: true as const };
const artifact = { artifactRef: grant.artifactRef, sourceSha, buildDigest: digest, immutable: true as const };
const prepared = { versionId: "44444444-4444-4444-8444-444444444444", sourceSha, buildDigest: digest,
  configurationDigest: digest, trafficShifted: false as const };

function runtime(overrides: Partial<CloudflareProductionDeploymentRuntime> = {}) {
  const value: CloudflareProductionDeploymentRuntime = {
    resolveExecutorId: () => "prod-executor-a",
    resolveGrant: async () => grant,
    resolveTarget: async () => target,
    resolveArtifact: async () => artifact,
    withOriginConfiguration: async ({ operation }) => operation({ configurationRef,
      configurationDigest: digest, descriptor: {} as never, secrets: {} as never }),
    withCredential: async ({ operation }) => ({ status: "CONFIGURED", value: await operation("provider-token") }),
    prepareVersion: async () => prepared,
    canary: async () => ({ deploymentId: "55555555-5555-4555-8555-555555555555",
      versions: [{ version_id: prepared.versionId, percentage: 1 }] }),
    promote: async () => ({ deploymentId: "66666666-6666-4666-8666-666666666666", versions: [] }),
    rollback: async () => ({ deploymentId: "77777777-7777-4777-8777-777777777777", versions: [] }),
    now: () => new Date(),
    ...overrides,
  };
  return value;
}

function executionInput(input: unknown = job) {
  return {
    context: { jobId, jobType: CLOUDFLARE_PRODUCTION_DEPLOYMENT_JOB,
      contractVersion: CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT, tenantId: "tenant-a",
      requestedByUserId: 7, createdAt: new Date(Date.now() - 1_000).toISOString(), attempt: 1,
      executionClass: "long", runtimeType: "node_job_worker", timeoutSeconds: 900,
      retryPolicy: { deadlineMs: 15 * 60_000, deadlineMode: "fixed" }, input } as never,
    lease: { jobId, attemptId: "attempt-a", leaseToken: "lease-a", fencingVersion: 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString() },
    reporter: { assertActive: vi.fn(async () => undefined), heartbeat: vi.fn(async () => undefined) } as never,
    controlPlane: {} as never,
  };
}

describe("Cloudflare production worker_jobs executor", () => {
  it("prepares an immutable version then opens only the approved canary", async () => {
    const canary = vi.fn(async () => ({ deploymentId: "55555555-5555-4555-8555-555555555555", versions: [] }));
    const prepareVersion = vi.fn(async () => prepared);
    const withCredential = vi.fn(async ({ operation }: Parameters<CloudflareProductionDeploymentRuntime["withCredential"]>[0]) =>
      ({ status: "CONFIGURED" as const, value: await operation("provider-token") }));
    const executor = createCloudflareProductionDeploymentExecutor(() => runtime({ canary, prepareVersion, withCredential }));
    const result = await executor(executionInput() as never);
    expect(prepareVersion).toHaveBeenCalledOnce();
    expect(canary).toHaveBeenCalledWith(expect.objectContaining({ grant, target, candidate: {
      versionId: prepared.versionId, sourceSha, buildDigest: digest, configurationDigest: digest,
    } }));
    expect(result.output).toMatchObject({ rolloutStage: "canary", candidateVersionId: prepared.versionId,
      deploymentId: "55555555-5555-4555-8555-555555555555" });
  });

  it("stops before provider credentials or writes when the approved grant is absent", async () => {
    const withCredential = vi.fn();
    const executor = createCloudflareProductionDeploymentExecutor(() => runtime({ resolveGrant: async () => null,
      withCredential: withCredential as never }));
    await expect(executor(executionInput() as never)).rejects.toThrow("CLOUDFLARE_PRODUCTION_GRANT_OR_ARTIFACT_MISSING");
    expect(withCredential).not.toHaveBeenCalled();
  });

  it("rejects route drift in the job binding before provider credentials are resolved", async () => {
    const withCredential = vi.fn();
    const executor = createCloudflareProductionDeploymentExecutor(() => runtime({ withCredential: withCredential as never }));
    await expect(executor(executionInput({ ...job, routePattern: "*.smartaihub.app/*" }) as never))
      .rejects.toThrow("CLOUDFLARE_PRODUCTION_JOB_INVALID");
    expect(withCredential).not.toHaveBeenCalled();
  });
});
