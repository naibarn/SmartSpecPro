import { describe, expect, it } from "vitest";
import {
  CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT,
  CLOUDFLARE_PRODUCTION_DEPLOYMENT_GRANT,
  CLOUDFLARE_PRODUCTION_TARGET_ID,
  resolveCloudflareProductionDeploymentTarget,
  cloudflareProductionDeploymentGrantSchema,
  cloudflareProductionDeploymentJobSchema,
  cloudflareProductionGrantAllowsJob,
} from "./cloudflareProductionDeploymentContract";
import { deploymentCredentialRef } from "./providerDeploymentTargetAuthority";

const digest = "a".repeat(64);
const source = "b".repeat(40);
const grant = {
  schemaVersion: CLOUDFLARE_PRODUCTION_DEPLOYMENT_GRANT,
  grantRef: "11111111-1111-4111-8111-111111111111",
  tenantId: "tenant-a", requesterUserId: 7, projectId: "project-a", executorId: "executor-a",
  targetId: CLOUDFLARE_PRODUCTION_TARGET_ID, environment: "production",
  accountRef: "c".repeat(32), zoneId: "9".repeat(32), routePattern: "smartaihub.app/*",
  expectedRouteId: null, expectedRouteScript: null, rolloutStage: "canary",
  canaryGrantRef: null, canaryDeploymentId: null, canaryVerifiedAt: null,
  candidateVersionId: null,
  jobId: "22222222-2222-4222-8222-222222222222",
  artifactRef: `sha256:${digest}`, sourceSha: source, buildDigest: digest,
  configurationRef: `cf-origin:${digest}`, configurationDigest: digest,
  actions: ["deploy"], rollbackDeploymentId: "33333333-3333-4333-8333-333333333333",
  rollbackArtifactRef: `sha256:${"d".repeat(64)}`, rollbackSourceSha: "e".repeat(40),
  rollbackBuildDigest: "d".repeat(64), rollbackConfigurationRef: `cf-origin:${"f".repeat(64)}`,
  rollbackConfigurationDigest: "f".repeat(64), canaryRequired: true, maxDurationSeconds: 300,
  expiresAt: "2026-10-22T10:00:00Z", revokedAt: null,
};
const job = {
  contractVersion: CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT,
  action: "deploy", targetId: CLOUDFLARE_PRODUCTION_TARGET_ID, environment: "production",
  zoneId: grant.zoneId, routePattern: grant.routePattern,
  expectedRouteId: grant.expectedRouteId, expectedRouteScript: grant.expectedRouteScript,
  rolloutStage: grant.rolloutStage,
  canaryGrantRef: grant.canaryGrantRef, canaryDeploymentId: grant.canaryDeploymentId,
  canaryVerifiedAt: grant.canaryVerifiedAt,
  candidateVersionId: grant.candidateVersionId,
  grantRef: grant.grantRef, projectId: grant.projectId, artifactRef: grant.artifactRef,
  sourceSha: grant.sourceSha, buildDigest: grant.buildDigest,
  configurationRef: grant.configurationRef, configurationDigest: grant.configurationDigest,
} as const;

describe("Cloudflare production deployment contract", () => {
  it("resolves only a tenant-scoped production Worker target without making provider calls", async () => {
    const identity = { tenantId: "tenant-a", projectId: "project-a", environment: "production", provider: "cloudflare" };
    const row = { ...identity, id: "target-row", deploymentTargetId: CLOUDFLARE_PRODUCTION_TARGET_ID,
      accountRef: "c".repeat(32), workerRef: CLOUDFLARE_PRODUCTION_TARGET_ID, containerApplicationRef: null,
      credentialRef: deploymentCredentialRef(identity), enabled: true, provenance: "admin-configured",
      region: null, runtimePolicy: null, verificationVersion: 1, lastVerifiedAt: new Date(),
      createdBy: 7, updatedBy: 7, createdAt: new Date(), updatedAt: new Date() };
    const db = { select: () => ({ from: () => ({ where: async () => [row] }) }) } as never;
    await expect(resolveCloudflareProductionDeploymentTarget({ db, tenantId: "tenant-a", projectId: "project-a" }))
      .resolves.toMatchObject({ targetId: CLOUDFLARE_PRODUCTION_TARGET_ID, environment: "production", accountRef: row.accountRef });
    await expect(resolveCloudflareProductionDeploymentTarget({ db, tenantId: "tenant-b", projectId: "project-a" }))
      .resolves.toBeNull();
    const wrongWorker = { ...row, workerRef: "smartspec-cloudflare-staging" };
    const wrongDb = { select: () => ({ from: () => ({ where: async () => [wrongWorker] }) }) } as never;
    await expect(resolveCloudflareProductionDeploymentTarget({ db: wrongDb, tenantId: "tenant-a", projectId: "project-a" }))
      .resolves.toBeNull();
  });

  it("accepts only a complete production grant bound to the intended production Worker", () => {
    expect(cloudflareProductionDeploymentGrantSchema.safeParse(grant).success).toBe(true);
    expect(cloudflareProductionDeploymentGrantSchema.safeParse({ ...grant, environment: "staging" }).success).toBe(false);
    expect(cloudflareProductionDeploymentGrantSchema.safeParse({ ...grant, targetId: "smartspec-cloudflare-staging" }).success).toBe(false);
    expect(cloudflareProductionDeploymentGrantSchema.safeParse({ ...grant, workerRoute: "smartaihub.app/*" }).success).toBe(false);
    expect(cloudflareProductionDeploymentGrantSchema.safeParse({ ...grant, maxDurationSeconds: 901 }).success).toBe(false);
    expect(cloudflareProductionDeploymentGrantSchema.safeParse({ ...grant, rolloutStage: "promote",
      canaryGrantRef: "22222222-2222-4222-8222-222222222222",
      canaryDeploymentId: "33333333-3333-4333-8333-333333333333",
      canaryVerifiedAt: "2026-10-22T09:30:00Z",
      candidateVersionId: "66666666-6666-4666-8666-666666666666" }).success).toBe(true);
    expect(cloudflareProductionDeploymentGrantSchema.safeParse({ ...grant, rolloutStage: "promote" }).success).toBe(false);
    expect(cloudflareProductionDeploymentGrantSchema.safeParse({ ...grant, rolloutStage: "rollback",
      actions: ["rollback"], candidateVersionId: null }).success).toBe(true);
  });

  it("accepts only a digest-bound production job", () => {
    expect(cloudflareProductionDeploymentJobSchema.safeParse(job).success).toBe(true);
    expect(cloudflareProductionDeploymentJobSchema.safeParse({ ...job, environment: "staging" }).success).toBe(false);
    expect(cloudflareProductionDeploymentJobSchema.safeParse({ ...job, buildDigest: "9".repeat(64) }).success).toBe(false);
    expect(cloudflareProductionDeploymentJobSchema.safeParse({ ...job, rolloutStage: "unknown" }).success).toBe(false);
  });

  it("binds execution to the exact tenant, job, executor, account, action, and expiry", () => {
    const parsedGrant = { ...grant, revoked: false } as never;
    const parsedJob = cloudflareProductionDeploymentJobSchema.parse(job);
    const binding = { tenantId: "tenant-a", jobId: grant.jobId, executorId: "executor-a", accountRef: grant.accountRef, now: new Date("2026-10-22T09:00:00Z") };
    expect(cloudflareProductionGrantAllowsJob(parsedGrant, parsedJob, binding)).toBe(true);
    expect(cloudflareProductionGrantAllowsJob(parsedGrant, parsedJob, { ...binding, tenantId: "tenant-b" })).toBe(false);
    expect(cloudflareProductionGrantAllowsJob(parsedGrant, parsedJob, { ...binding, executorId: "other" })).toBe(false);
    expect(cloudflareProductionGrantAllowsJob(parsedGrant, parsedJob, { ...binding, accountRef: "9".repeat(32) })).toBe(false);
    expect(cloudflareProductionGrantAllowsJob(parsedGrant, parsedJob, { ...binding, now: new Date("2026-10-22T11:00:00Z") })).toBe(false);
    expect(cloudflareProductionGrantAllowsJob(parsedGrant, cloudflareProductionDeploymentJobSchema.parse({ ...job, rolloutStage: "promote",
      canaryGrantRef: "22222222-2222-4222-8222-222222222222",
      canaryDeploymentId: "33333333-3333-4333-8333-333333333333",
      canaryVerifiedAt: "2026-10-22T09:30:00Z",
      candidateVersionId: "66666666-6666-4666-8666-666666666666" }), binding)).toBe(false);
  });
});
