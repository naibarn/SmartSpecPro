import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("../db", () => ({ getDb: getDbMock }));

import { infrastructureRouter } from "./infrastructure";
import { projectWikiHostedRoutePreflightProviders } from "../services/projectWikiHostedRoutePreflight";
import { deploymentCredentialRef } from "../services/providerDeploymentTargetAuthority";
import * as httpRuntimeAdmission from "../services/cloudflareHttpRuntimeAdmission";

const tenantId = "8de1a509-6177-49b7-b57d-5d3b5228d75f";
const projectId = "2fe8a309-8be6-4370-9813-8fb9cc4645a0";

describe("infrastructure deployment target project selector", () => {
  beforeEach(() => getDbMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("keeps native candidate preparation behind exact Admin and matching active tenant", async () => {
    const request = { tenantId: "tenant-ZCSKEM9s", projectId, submissionId: "11111111-1111-4111-8111-111111111111", planDigest: "a".repeat(64) };
    for (const user of [null, { id: 2, role: "user" }, { id: 3, role: "system_agent" }]) {
      const caller = infrastructureRouter.createCaller({ user, tenantId: request.tenantId } as any);
      await expect(caller.prepareCloudflareHttpCandidate(request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    const otherTenant = infrastructureRouter.createCaller({ user: { id: 1, role: "admin", currentTenantId: "tenant-other" }, tenantId: "tenant-other" } as any);
    await expect(otherTenant.prepareCloudflareHttpCandidate(request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("keeps native runtime review and execution behind exact Admin and the authenticated tenant", async () => {
    const request = { tenantId: "tenant-ZCSKEM9s", projectId, candidateJobId: "22222222-2222-4222-8222-222222222222",
      submissionId: "11111111-1111-4111-8111-111111111111", planDigest: "a".repeat(64),
      artifactRef: `sha256:${"b".repeat(64)}`, workerSourceSha: "c".repeat(40) };
    for (const user of [null, { id: 2, role: "user" }, { id: 3, role: "system_agent" }, { id: 1, role: "admin", currentTenantId: "tenant-other" }]) {
      const caller = infrastructureRouter.createCaller({ user, tenantId: user?.currentTenantId ?? request.tenantId } as any);
      await expect(caller.prepareCloudflareHttpRuntime(request)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.getCloudflareHttpRuntimeOperation({ tenantId: request.tenantId, projectId, candidateJobId: request.candidateJobId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("returns a sanitized canonical registry stage for preflight lookup failures", async () => {
    getDbMock.mockResolvedValue({});
    vi.spyOn(httpRuntimeAdmission, "readHttpRuntimeOperation").mockRejectedValueOnce(new Error("database driver detail must not reach the UI"));
    const caller = infrastructureRouter.createCaller({ user: { id: 1, role: "admin", currentTenantId: "tenant-ZCSKEM9s" },
      tenantId: "tenant-ZCSKEM9s" } as any);
    const result = await caller.getCloudflareHttpRuntimeOperation({ tenantId: "tenant-ZCSKEM9s", projectId,
      candidateJobId: "22222222-2222-4222-8222-222222222222", operation: "application" });
    expect(result.preflight).toMatchObject({ ready: false, reason: "HTTP_RUNTIME_PREFLIGHT_REGISTRY_UNAVAILABLE" });
    expect(JSON.stringify(result)).not.toContain("database driver detail");
  });

  it("accepts the complete automatic activation request through the serving API parser", async () => {
    getDbMock.mockResolvedValue(null);
    const caller = infrastructureRouter.createCaller({ user: { id: 1, role: "admin", currentTenantId: "tenant-ZCSKEM9s" },
      tenantId: "tenant-ZCSKEM9s" } as any);
    await expect(caller.activateCloudflareStagingQueueProfile({ tenantId: "tenant-ZCSKEM9s", projectId,
      environment: "staging", provider: "cloudflare", configurationRef: `cf-origin:${"a".repeat(64)}` }))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    expect(getDbMock).toHaveBeenCalledOnce();
  });

  it.each([
    { provider: undefined }, { provider: "other" }, { environment: "production" },
    { workflowRuntimeToken: "w".repeat(32) }, { revokedAt: null },
  ])("rejects malformed activation contracts before database access: %j", async changes => {
    const caller = infrastructureRouter.createCaller({ user: { id: 1, role: "admin", currentTenantId: "tenant-ZCSKEM9s" },
      tenantId: "tenant-ZCSKEM9s" } as any);
    await expect(caller.activateCloudflareStagingQueueProfile({ tenantId: "tenant-ZCSKEM9s", projectId,
      environment: "staging", provider: "cloudflare", configurationRef: `cf-origin:${"a".repeat(64)}`, ...changes } as any))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("requires the authenticated owner session before creating a staging policy or job", async () => {
    const caller = infrastructureRouter.createCaller({ user: { id: 1, role: "admin", currentTenantId: "tenant-ZCSKEM9s" },
      tenantId: "tenant-ZCSKEM9s", userToken: null } as any);
    await expect(caller.queueCloudflareStagingDeploy({ tenantId: "tenant-ZCSKEM9s", projectId, environment: "staging" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("keeps Production Worker deployment unavailable to an Admin who does not own the selected tenant", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ limit }));
    const innerJoin = vi.fn(() => ({ where }));
    const from = vi.fn(() => ({ innerJoin }));
    getDbMock.mockResolvedValue({ select: vi.fn(() => ({ from })) });
    const caller = infrastructureRouter.createCaller({ user: { id: 7, role: "admin", currentTenantId: tenantId },
      tenantId, userToken: "owner-scoped-session" } as any);
    await expect(caller.getCloudflareProductionWorkerCanaryPreflight({ tenantId, projectId, environment: "production" }))
      .resolves.toEqual({ ready: false, reason: "PRODUCTION_TENANT_OWNER_REQUIRED" });
    await expect(caller.queueCloudflareProductionWorkerCanary({ tenantId, projectId, environment: "production",
      submissionId: "11111111-1111-4111-8111-111111111111", planDigest: "a".repeat(64) }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "PRODUCTION_TENANT_OWNER_REQUIRED" });
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("returns null for an empty canary registry and a stable error when its database is unavailable", async () => {
    const caller = infrastructureRouter.createCaller({ user: { id: 7, role: "admin", currentTenantId: tenantId }, tenantId } as any);
    getDbMock.mockResolvedValueOnce(null);
    await expect(caller.getLatestCloudflareProductionWorkerCanaryJob({ tenantId, projectId, environment: "production" }))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "DATABASE_UNAVAILABLE" });

    const limit = vi.fn().mockResolvedValue([]);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    getDbMock.mockResolvedValueOnce({ select: vi.fn(() => ({ from })) });
    await expect(caller.getLatestCloudflareProductionWorkerCanaryJob({ tenantId, projectId, environment: "production" }))
      .resolves.toBeNull();
  });

  it("sanitizes a database connection initialization failure for the canary job query", async () => {
    getDbMock.mockRejectedValueOnce(Object.assign(new Error("database connection string unavailable"), { code: "08001" }));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const caller = infrastructureRouter.createCaller({ user: { id: 7, role: "admin", currentTenantId: tenantId }, tenantId,
      req: { requestId: "trace-canary-db-init" } } as any);
    await expect(caller.getLatestCloudflareProductionWorkerCanaryJob({ tenantId, projectId, environment: "production" }))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "PRODUCTION_WORKER_CANARY_JOB_READ_UNAVAILABLE" });
    expect(log).toHaveBeenCalledWith("[CloudflareProductionWorkerCanaryJobRead]", expect.stringContaining('"sqlState":"08001"'));
    expect(log.mock.calls[0]?.[1]).not.toContain("database connection string unavailable");
  });

  it("sanitizes a canary job registry SQL failure and logs only trace and SQLSTATE", async () => {
    const failure = Object.assign(new Error("secret-bearing database detail"), { code: "08006" });
    const limit = vi.fn().mockRejectedValue(failure);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    getDbMock.mockResolvedValue({ select: vi.fn(() => ({ from })) });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const caller = infrastructureRouter.createCaller({ user: { id: 7, role: "admin", currentTenantId: tenantId }, tenantId,
      req: { requestId: "trace-canary-read" } } as any);
    await expect(caller.getLatestCloudflareProductionWorkerCanaryJob({ tenantId, projectId, environment: "production" }))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "PRODUCTION_WORKER_CANARY_JOB_READ_UNAVAILABLE" });
    expect(log).toHaveBeenCalledWith("[CloudflareProductionWorkerCanaryJobRead]", expect.stringContaining('"sqlState":"08006"'));
    expect(log.mock.calls[0]?.[1]).toContain('"requestId":"trace-canary-read"');
    expect(log.mock.calls[0]?.[1]).not.toContain("secret-bearing database detail");
  });

  it("keeps origin versions and secret writes behind the exact-admin guard", async () => {
    const identity = { tenantId: "tenant-ZCSKEM9s", projectId, environment: "staging" as const, provider: "cloudflare" as const };
    const reference = { ...identity, configurationRef: `cf-origin:${"a".repeat(64)}` };
    for (const user of [null, { id: 2, role: "user" }, { id: 3, role: "domain_admin" }, { id: 4, role: "system_agent" }]) {
      const caller = infrastructureRouter.createCaller({ user } as any);
      await expect(caller.getCloudflareOriginConfiguration(reference)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.revokeCloudflareOriginConfiguration(reference)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.activateCloudflareStagingQueueProfile(reference)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.saveCloudflareOriginConfiguration({ ...identity,
        settings: { origin: "https://origin-staging.smartaihub.app", allowedPublicOrigins: ["https://staging.account.workers.dev"],
          accessApplicationId: "11111111-1111-4111-8111-111111111111", accessTeamName: "fixture-team", accessAudience: "fixture",
          expiresAt: "2030-01-01T00:00:00Z" },
        secrets: { token: "fixture-origin-token-not-a-real-secret", clientId: "fixture-client.access", secret: "fixture-access-secret" },
      })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("keeps Cloudflare credential metadata behind the exact-admin guard", async () => {
    for (const user of [null, { id: 2, role: "user" }, { id: 3, role: "system_agent" }]) {
      const caller = infrastructureRouter.createCaller({ user } as any);
      await expect(caller.getCloudflareCredentialCenter()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("resolves an exact production target before probing its deployment credential", async () => {
    const where = vi.fn().mockResolvedValue([]);
    const from = vi.fn(() => ({ where }));
    getDbMock.mockResolvedValue({ select: vi.fn(() => ({ from })) });
    const admin = infrastructureRouter.createCaller({
      user: { id: 1, role: "admin", currentTenantId: "tenant-ZCSKEM9s" },
      tenantId: "tenant-ZCSKEM9s",
    } as any);

    await expect(admin.probeCloudflareDeploymentCredential({
      tenantId: "tenant-ZCSKEM9s",
      projectId,
      environment: "production",
      provider: "cloudflare",
    })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "ENABLED_CLOUDFLARE_TARGET_REQUIRED",
    });
    expect(where).toHaveBeenCalledOnce();
  });

  it.each([tenantId, "tenant-ZCSKEM9s"])("lists active canonical project identities for an exact admin with tenant %s", async (selectedTenantId) => {
    const projects = [
      {
        projectId: "2fe8a309-8be6-4370-9813-8fb9cc4645a0",
        title: "Wiki",
        projectType: "workspace",
      },
    ];
    const orderBy = vi.fn().mockResolvedValue(projects);
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    getDbMock.mockResolvedValue({ select: vi.fn(() => ({ from })) });
    const admin = infrastructureRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as any);

    await expect(
      admin.listDeploymentTargetProjects({ tenantId: selectedTenantId })
    ).resolves.toEqual(projects);
    expect(from).toHaveBeenCalled();
    expect(where).toHaveBeenCalled();
    expect(orderBy).toHaveBeenCalled();

    const systemAgent = infrastructureRouter.createCaller({
      user: { id: 2, role: "system_agent" },
    } as any);
    await expect(
      systemAgent.listDeploymentTargetProjects({ tenantId: selectedTenantId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["", " ", "t".repeat(37)])("rejects an invalid varchar tenant before reading project identities: %j", async (invalidTenantId) => {
    const admin = infrastructureRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as any);
    await expect(
      admin.listDeploymentTargetProjects({ tenantId: invalidTenantId })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("keeps Cloudflare Worker targets incompatible and exact-admin-only", async () => {
    const target = {
      targetId: "target-1",
      provider: "cloudflare",
      shape: "worker" as const,
      targetAuthorized: true,
      deploymentApproval: "APPROVED" as const,
    };
    vi.spyOn(
      projectWikiHostedRoutePreflightProviders,
      "observeProject"
    ).mockResolvedValue({
      state: "OBSERVED",
      source: "test-fixture",
      observedAt: new Date().toISOString(),
      scope: {
        tenantId,
        projectId,
        appId: "app_project_wiki_pages",
        environment: "staging",
      },
      value: { active: true, appBound: true },
    });
    vi.spyOn(
      projectWikiHostedRoutePreflightProviders,
      "observeTarget"
    ).mockResolvedValue({
      state: "OBSERVED",
      source: "test-fixture",
      observedAt: new Date().toISOString(),
      scope: {
        tenantId,
        projectId,
        appId: "app_project_wiki_pages",
        environment: "staging",
        targetId: "target-1",
      },
      value: target,
    });
    vi.spyOn(
      projectWikiHostedRoutePreflightProviders,
      "observeHost"
    ).mockResolvedValue({
      state: "OBSERVED",
      source: "test-fixture",
      observedAt: new Date().toISOString(),
      scope: {
        tenantId,
        projectId,
        appId: "app_project_wiki_pages",
        environment: "staging",
        targetId: "target-1",
      },
      value: {
        targetId: "target-1",
        hostRequirement: "smartspec-web",
        compatibility: "COMPATIBLE",
        hostSourceRevision: "4".repeat(40),
      },
    });
    getDbMock.mockResolvedValue({});
    const admin = infrastructureRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as any);

    const result = await admin.getProjectWikiHostedRoutePreflight({
      tenantId,
      projectId,
    });

    expect(result).toMatchObject({
      identity: {
        tenantId,
        projectId,
        appId: "app_project_wiki_pages",
        environment: "staging",
      },
      target: {
        state: "OBSERVED",
        targetId: "target-1",
        shape: "worker",
        compatibility: "INCOMPATIBLE",
      },
      outcomes: expect.arrayContaining([
        "TARGET_INCOMPATIBLE",
        "DATABASE_AUTHORITY_REQUIRED",
        "TRUSTED_EVIDENCE_REQUIRED",
      ]),
    });

    const systemAgent = infrastructureRouter.createCaller({
      user: { id: 2, role: "system_agent" },
    } as any);
    await expect(
      systemAgent.getProjectWikiHostedRoutePreflight({ tenantId, projectId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("leaves an existing Container target unresolved until host compatibility is verified", async () => {
    vi.spyOn(
      projectWikiHostedRoutePreflightProviders,
      "observeProject"
    ).mockResolvedValue({
      state: "OBSERVED",
      source: "test-fixture",
      observedAt: new Date().toISOString(),
      scope: {
        tenantId,
        projectId,
        appId: "app_project_wiki_pages",
        environment: "staging",
      },
      value: { active: true, appBound: true },
    });
    vi.spyOn(
      projectWikiHostedRoutePreflightProviders,
      "observeTarget"
    ).mockResolvedValue({
      state: "OBSERVED",
      source: "test-fixture",
      observedAt: new Date().toISOString(),
      scope: {
        tenantId,
        projectId,
        appId: "app_project_wiki_pages",
        environment: "staging",
        targetId: "target-1",
      },
      value: {
        targetId: "target-1",
        provider: "cloudflare",
        shape: "container",
        targetAuthorized: true,
        deploymentApproval: "APPROVED",
      },
    });
    vi.spyOn(
      projectWikiHostedRoutePreflightProviders,
      "observeHost"
    ).mockResolvedValue({
      state: "UNKNOWN",
      source: "test-fixture",
      observedAt: null,
      scope: {
        tenantId,
        projectId,
        appId: "app_project_wiki_pages",
        environment: "staging",
        targetId: "target-1",
      },
      value: null,
      reason: "container_capability_not_proven",
    });
    getDbMock.mockResolvedValue({});
    const admin = infrastructureRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as any);

    const result = await admin.getProjectWikiHostedRoutePreflight({
      tenantId,
      projectId,
    });

    expect(result.target).toMatchObject({
      shape: "container",
      compatibility: "UNKNOWN",
    });
    expect(result.outcomes).toContain("HOST_COMPATIBILITY_REQUIRED");
    expect(result.outcomes).not.toContain("READY_FOR_AUTHORIZED_STAGING");
  });

  it("composes an approved pre-deployment READY result only from scoped authority provider facts", async () => {
    const observedAt = new Date().toISOString();
    const packageDigest = `spaas-package-v1:sha256:${"2".repeat(64)}`;
    const sourceRevision = "1".repeat(40);
    const archiveSha256 = "3".repeat(64);
    const scope = {
      tenantId,
      projectId,
      appId: "app_project_wiki_pages" as const,
      environment: "staging" as const,
    };
    const targetScope = { ...scope, targetId: "target-1" };
    const databaseScope = { ...scope, databaseId: "db-1" };
    vi.spyOn(
      projectWikiHostedRoutePreflightProviders,
      "observeProject"
    ).mockResolvedValue({
      state: "OBSERVED",
      source: "test-fixture",
      observedAt,
      scope,
      value: { active: true, appBound: true },
    });
    vi.spyOn(
      projectWikiHostedRoutePreflightProviders,
      "observeTarget"
    ).mockResolvedValue({
      state: "OBSERVED",
      source: "test-fixture",
      observedAt,
      scope: targetScope,
      value: {
        targetId: "target-1",
        provider: "cloudflare",
        shape: "container",
        targetAuthorized: true,
        deploymentApproval: "APPROVED",
      },
    });
    vi.spyOn(
      projectWikiHostedRoutePreflightProviders,
      "observeHost"
    ).mockResolvedValue({
      state: "OBSERVED",
      source: "test-fixture",
      observedAt,
      scope: targetScope,
      value: {
        targetId: "target-1",
        hostRequirement: "smartspec-web",
        compatibility: "COMPATIBLE",
        hostSourceRevision: "4".repeat(40),
      },
    });
    vi.spyOn(
      projectWikiHostedRoutePreflightProviders,
      "observePackage"
    ).mockResolvedValue({
      state: "OBSERVED",
      source: "test-fixture",
      observedAt,
      scope,
      value: {
        sourceRevision,
        packageDigest,
        archiveSha256,
        contentVerified: true,
        appId: "app_project_wiki_pages",
      },
    });
    vi.spyOn(
      projectWikiHostedRoutePreflightProviders,
      "observeDatabase"
    ).mockResolvedValue({
      state: "OBSERVED",
      source: "test-fixture",
      observedAt,
      scope: databaseScope,
      value: {
        databaseId: "db-1",
        databaseIdentity: "wiki-staging/schema",
        dedicated: true,
        authorized: true,
      },
    });
    vi.spyOn(
      projectWikiHostedRoutePreflightProviders,
      "observeMigration"
    ).mockResolvedValue({
      state: "OBSERVED",
      source: "test-fixture",
      observedAt,
      scope: databaseScope,
      value: {
        databaseId: "db-1",
        evidence: {
          status: "OBSERVED",
          source: "test-fixture",
          observedAt,
          value: {
            environment: "staging",
            databaseIdentity: "wiki-staging/schema",
            expectedMigrationHead: {
              tag: "0394_project_wiki_pages_mini_app",
              hash: "a".repeat(64),
            },
            expectedMigrations: [
              {
                tag: "0392_spec304_app_identity_and_route_aliases",
                hash: "f2069748b46f8024a8cf8d89bd7440803318f46da6871dfb47c7932610ded0fd",
              },
              {
                tag: "0393_spec302_canonical_project_identity",
                hash: "6e5237357edde02315244dc69cf50ebf450f71d43d8f11927007f50df4c67738",
              },
              {
                tag: "0394_project_wiki_pages_mini_app",
                hash: "a49d23e221cdd2efac1ed426530e4d8643dc7446224c3959ab1f97ffa792afc7",
              },
            ],
            observedAppliedHead: {
              tag: "0393_spec302_canonical_project_identity",
              hash: "6e5237357edde02315244dc69cf50ebf450f71d43d8f11927007f50df4c67738",
              appliedAt: 1,
            },
            appliedMigrations: [
              {
                tag: "0392_spec304_app_identity_and_route_aliases",
                hash: "f2069748b46f8024a8cf8d89bd7440803318f46da6871dfb47c7932610ded0fd",
                appliedAt: 1,
              },
              {
                tag: "0393_spec302_canonical_project_identity",
                hash: "6e5237357edde02315244dc69cf50ebf450f71d43d8f11927007f50df4c67738",
                appliedAt: 1,
              },
            ],
            pendingMigrations: [
              {
                tag: "0394_project_wiki_pages_mini_app",
                hash: "a49d23e221cdd2efac1ed426530e4d8643dc7446224c3959ab1f97ffa792afc7",
              },
            ],
            currentState: "PENDING",
            failureHistory: "TRACKED",
            failedMigration: {
              state: "NONE",
              source: "test-fixture",
              migration: null,
              observedAt,
            },
            failureTracking: "TRACKED",
            latestExecution: null,
            executionReconciliation: {
              state: "FAILURE_HISTORY_UNAVAILABLE",
              receiptState: "NONE",
              idempotencyKey: null,
              executionId: null,
              sourceSha: null,
              startedAt: null,
              completedAt: null,
              failureCategory: null,
            },
          },
        },
        prerequisites: [
          {
            tag: "0392_spec304_app_identity_and_route_aliases",
            sha256:
              "f2069748b46f8024a8cf8d89bd7440803318f46da6871dfb47c7932610ded0fd",
            state: "APPLIED",
          },
          {
            tag: "0393_spec302_canonical_project_identity",
            sha256:
              "6e5237357edde02315244dc69cf50ebf450f71d43d8f11927007f50df4c67738",
            state: "APPLIED",
          },
        ],
      },
    });
    vi.spyOn(
      projectWikiHostedRoutePreflightProviders,
      "observeRecovery"
    ).mockResolvedValue({
      state: "OBSERVED",
      source: "test-fixture",
      observedAt,
      scope: { ...targetScope, databaseId: "db-1" },
      value: {
        databaseId: "db-1",
        targetId: "target-1",
        approved: true,
        strategyId: "backup-pitr-17",
      },
    });
    vi.spyOn(
      projectWikiHostedRoutePreflightProviders,
      "observeTrustedQualification"
    ).mockResolvedValue({
      state: "OBSERVED",
      source: "test-fixture",
      observedAt,
      scope: { ...targetScope, databaseId: "db-1" },
      value: {
        verifierId: "trusted-verifier-1",
        sourceRevision,
        packageDigest,
        archiveSha256,
        v5TargetId: "target-1",
        v6TargetId: "target-1",
        v6DatabaseId: "db-1",
        v5EvidenceRef: "v5-evidence-1",
        v6EvidenceRef: "v6-evidence-1",
        expiresAt: "2030-10-12T00:00:00.000Z",
        outcome: "PASS",
      },
    });
    vi.spyOn(
      projectWikiHostedRoutePreflightProviders,
      "observeDeployment"
    ).mockResolvedValue({
      state: "NOT_FOUND",
      source: "test-fixture",
      observedAt,
      scope: targetScope,
      value: null,
    });
    vi.spyOn(
      projectWikiHostedRoutePreflightProviders,
      "observeSmoke"
    ).mockResolvedValue({
      state: "NOT_FOUND",
      source: "test-fixture",
      observedAt,
      scope: targetScope,
      value: null,
    });
    vi.spyOn(
      projectWikiHostedRoutePreflightProviders,
      "observeUat"
    ).mockResolvedValue({
      state: "NOT_FOUND",
      source: "test-fixture",
      observedAt,
      scope: targetScope,
      value: null,
    });
    getDbMock.mockResolvedValue({});
    const admin = infrastructureRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as any);
    const result = await admin.getProjectWikiHostedRoutePreflight({
      tenantId,
      projectId,
    });
    expect(result.stages.STAGING_PREFLIGHT_READY).toBe("PASS");
    expect(result.stages.DEPLOYMENT_COMPLETED).toBe("PENDING");
    expect(result.migration.migration0394).toBe("PENDING");
    expect(result.outcomes).toEqual(["READY_FOR_AUTHORIZED_STAGING"]);
    expect(
      projectWikiHostedRoutePreflightProviders.observeTarget
    ).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ tenantId, projectId, environment: "staging" })
    );
    expect(result.currentProcessDiagnostic.scope).toBe(
      "PREFLIGHT_API_PROCESS_ONLY"
    );
  });

  it("requires canonical UUID project identity", async () => {
    const admin = infrastructureRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as any);
    await expect(
      admin.getProjectWikiHostedRoutePreflight({
        tenantId,
        projectId: "wiki-project",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("reads only the exact staging target credential and rejects stale or revoked target authority", async () => {
    const identity = {
      tenantId,
      projectId,
      appId: "app_project_wiki_pages" as const,
      environment: "staging" as const,
    };
    const target = {
      id: "row-1",
      tenantId,
      projectId,
      environment: "staging",
      provider: "cloudflare",
      deploymentTargetId: "target-1",
      accountRef: "account-1",
      workerRef: null,
      containerApplicationRef: "container-1",
      credentialRef: deploymentCredentialRef({
        tenantId,
        projectId,
        environment: "staging",
        provider: "cloudflare",
      }),
      enabled: true,
      provenance: "admin-created",
      region: null,
      runtimePolicy: null,
      verificationVersion: 1,
      lastVerifiedAt: new Date(Date.now() - 1_000),
      createdBy: 1,
      updatedBy: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const resolveDb = (
      credential: { status: string; revokedAt: Date | null },
      row = target
    ) => {
      let query = 0;
      return {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => {
              query += 1;
              return query === 1
                ? Promise.resolve([row])
                : { limit: async () => [credential] };
            }),
          })),
        })),
      };
    };
    const configured =
      await projectWikiHostedRoutePreflightProviders.observeTarget(
        resolveDb({ status: "CONFIGURED", revokedAt: null }) as any,
        identity
      );
    expect(configured).toMatchObject({
      state: "OBSERVED",
      scope: {
        tenantId,
        projectId,
        environment: "staging",
        targetId: "target-1",
      },
      value: { targetAuthorized: true, deploymentApproval: "UNKNOWN" },
    });

    const stale = await projectWikiHostedRoutePreflightProviders.observeTarget(
      resolveDb(
        { status: "CONFIGURED", revokedAt: null },
        {
          ...target,
          lastVerifiedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        }
      ) as any,
      identity
    );
    expect(stale.state).toBe("STALE");
    expect(stale.value?.targetAuthorized).toBe(false);

    const revoked =
      await projectWikiHostedRoutePreflightProviders.observeTarget(
        resolveDb({ status: "REVOKED", revokedAt: new Date() }) as any,
        identity
      );
    expect(revoked.state).toBe("REVOKED");
    expect(revoked.value?.targetAuthorized).toBe(false);
  });
});
