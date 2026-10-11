import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("../db", () => ({ getDb: getDbMock }));

import { infrastructureRouter } from "./infrastructure";
import { projectWikiHostedRoutePreflightProviders } from "../services/projectWikiHostedRoutePreflight";
import { deploymentCredentialRef } from "../services/providerDeploymentTargetAuthority";

const tenantId = "8de1a509-6177-49b7-b57d-5d3b5228d75f";
const projectId = "2fe8a309-8be6-4370-9813-8fb9cc4645a0";

describe("infrastructure deployment target project selector", () => {
  beforeEach(() => getDbMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("lists active canonical project identities only for an exact admin", async () => {
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
      admin.listDeploymentTargetProjects({ tenantId })
    ).resolves.toEqual(projects);
    expect(from).toHaveBeenCalled();
    expect(where).toHaveBeenCalled();
    expect(orderBy).toHaveBeenCalled();

    const systemAgent = infrastructureRouter.createCaller({
      user: { id: 2, role: "system_agent" },
    } as any);
    await expect(
      systemAgent.listDeploymentTargetProjects({ tenantId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("enforces the UUID tenant contract before reading project identities", async () => {
    const admin = infrastructureRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as any);
    await expect(
      admin.listDeploymentTargetProjects({ tenantId: "tenant-demo" })
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
        expiresAt: "2026-10-12T00:00:00.000Z",
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
