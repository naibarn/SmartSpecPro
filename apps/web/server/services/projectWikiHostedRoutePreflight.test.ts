import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MigrationEvidence } from "./drizzleMigrationEvidence";
import {
  buildProjectWikiHostedRoutePreflight,
  composeProjectWikiHostedRoutePreflight,
  PROJECT_WIKI_MIGRATION_0394,
  type AuthorityFact,
  type HostedRouteIdentity,
  type ProjectWikiHostedRouteAuthorities,
  type ProjectWikiHostedRoutePreflightProviders,
} from "./projectWikiHostedRoutePreflight";

const identity: HostedRouteIdentity = {
  tenantId: "8de1a509-6177-49b7-b57d-5d3b5228d75f",
  projectId: "2fe8a309-8be6-4370-9813-8fb9cc4645a0",
  appId: "app_project_wiki_pages",
  environment: "staging",
};
const targetId = "wiki-staging-container";
const databaseId = "wiki-staging-postgres";
const databaseIdentity = "project-wiki-staging/schema";
const sourceRevision = "1".repeat(40);
const packageDigest = `spaas-package-v1:sha256:${"2".repeat(64)}`;
const archiveSha256 = "3".repeat(64);
const observedAt = "2026-10-11T12:00:00.000Z";
const testNow = new Date("2026-10-11T13:00:00.000Z");

function scoped<T>(
  value: T | null,
  options: {
    state?: AuthorityFact<T>["state"];
    scope?: Partial<HostedRouteIdentity> & {
      targetId?: string;
      databaseId?: string;
    };
    source?: string;
    reason?: string;
  } = {}
): AuthorityFact<T> {
  return {
    state: options.state ?? "OBSERVED",
    source: options.source ?? "test-fixture",
    observedAt,
    scope: options.scope ?? identity,
    evidenceRef: "test-fixture:evidence-1",
    value,
    ...(options.reason ? { reason: options.reason } : {}),
  };
}

function makeMigrationEvidence(applied = false): MigrationEvidence {
  return {
    status: "OBSERVED",
    source: "test-fixture:drizzleMigrationEvidence",
    observedAt,
    value: {
      environment: "staging",
      databaseIdentity,
      expectedMigrationHead: {
        tag: PROJECT_WIKI_MIGRATION_0394.prerequisites[1],
        hash: "6e5237357edde02315244dc69cf50ebf450f71d43d8f11927007f50df4c67738",
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
          hash: PROJECT_WIKI_MIGRATION_0394.expectedSha256,
        },
      ],
      observedAppliedHead: applied
        ? {
            tag: "0394_project_wiki_pages_mini_app",
            hash: PROJECT_WIKI_MIGRATION_0394.expectedSha256,
            appliedAt: 1,
          }
        : {
            tag: PROJECT_WIKI_MIGRATION_0394.prerequisites[1],
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
        ...(applied
          ? [
              {
                tag: "0394_project_wiki_pages_mini_app",
                hash: PROJECT_WIKI_MIGRATION_0394.expectedSha256,
                appliedAt: 2,
              },
            ]
          : []),
      ],
      pendingMigrations: applied
        ? []
        : [
            {
              tag: "0394_project_wiki_pages_mini_app",
              hash: PROJECT_WIKI_MIGRATION_0394.expectedSha256,
            },
          ],
      currentState: applied ? "APPLIED" : "PENDING",
      failureHistory: "TRACKED",
      failedMigration: {
        state: "NONE",
        source: "test-fixture",
        migration: null,
        observedAt,
      },
      failureTracking: "TRACKED",
      latestExecution: applied
        ? {
            tag: "0394_project_wiki_pages_mini_app",
            hash: PROJECT_WIKI_MIGRATION_0394.expectedSha256,
            result: "APPLIED",
            executedAt: 2,
          }
        : null,
      executionReconciliation: applied
        ? {
            state: "CONSISTENT",
            receiptState: "SUCCEEDED",
            idempotencyKey: "migration-0394",
            executionId: "receipt-0394",
            sourceSha: sourceRevision,
            startedAt: observedAt,
            completedAt: observedAt,
            failureCategory: null,
          }
        : {
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
  };
}

function validAuthorities(
  options: { applied?: boolean } = {}
): ProjectWikiHostedRouteAuthorities {
  return {
    project: scoped({ active: true, appBound: true }),
    target: scoped(
      {
        targetId,
        provider: "cloudflare",
        shape: "container",
        targetAuthorized: true,
        deploymentApproval: "APPROVED",
      },
      { scope: { ...identity, targetId } }
    ),
    host: scoped(
      {
        targetId,
        hostRequirement: "smartspec-web",
        compatibility: "COMPATIBLE",
        hostSourceRevision: "4".repeat(40),
      },
      { scope: { ...identity, targetId } }
    ),
    package: scoped({
      sourceRevision,
      packageDigest,
      archiveSha256,
      contentVerified: true,
      appId: identity.appId,
    }),
    database: scoped(
      { databaseId, databaseIdentity, dedicated: true, authorized: true },
      { scope: { ...identity, databaseId } }
    ),
    migration: scoped(
      {
        databaseId,
        evidence: makeMigrationEvidence(options.applied),
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
      { scope: { ...identity, databaseId } }
    ),
    recovery: scoped(
      {
        databaseId,
        targetId,
        approved: true,
        strategyId: "backup-pitr-approval-17",
      },
      { scope: { ...identity, targetId, databaseId } }
    ),
    trustedQualification: scoped(
      {
        verifierId: "verifier:trusted-2",
        sourceRevision,
        packageDigest,
        archiveSha256,
        v5TargetId: targetId,
        v6TargetId: targetId,
        v6DatabaseId: databaseId,
        v5EvidenceRef: "evidence:v5-17",
        v6EvidenceRef: "evidence:v6-18",
        expiresAt: "2026-10-12T00:00:00.000Z",
        outcome: "PASS",
      },
      { scope: { ...identity, targetId, databaseId } }
    ),
    deployment: options.applied
      ? scoped(
          {
            targetId,
            packageDigest,
            sourceRevision,
            deploymentId: "deployment-29",
          },
          { scope: { ...identity, targetId } }
        )
      : scoped(null, { state: "NOT_FOUND" }),
    smoke: scoped(null, { state: "NOT_FOUND" }),
    uat: scoped(null, { state: "NOT_FOUND" }),
  };
}

function testProviders(
  authorities: ProjectWikiHostedRouteAuthorities
): ProjectWikiHostedRoutePreflightProviders {
  return {
    observeProject: async () => authorities.project,
    observeTarget: async () => authorities.target,
    observeHost: async () => authorities.host,
    observePackage: async () => authorities.package,
    observeDatabase: async () => authorities.database,
    observeMigration: async () => authorities.migration,
    observeRecovery: async () => authorities.recovery,
    observeTrustedQualification: async () => authorities.trustedQualification,
    observeDeployment: async () => authorities.deployment,
    observeSmoke: async () => authorities.smoke,
    observeUat: async () => authorities.uat,
  };
}

describe("Project Wiki hosted-route staging preflight", () => {
  it("binds migration 0394 and its two prerequisite checks to current SQL hashes", () => {
    const migrationSql = readFileSync(
      new URL(
        "../../drizzle/0394_project_wiki_pages_mini_app.sql",
        import.meta.url
      )
    );
    const prerequisiteNames = PROJECT_WIKI_MIGRATION_0394.prerequisites.map(
      name => name.replace("_", "_")
    );
    const checksums = [
      createHash("sha256")
        .update(
          readFileSync(
            new URL(
              "../../drizzle/0392_spec304_app_identity_and_route_aliases.sql",
              import.meta.url
            )
          )
        )
        .digest("hex"),
      createHash("sha256")
        .update(
          readFileSync(
            new URL(
              "../../drizzle/0393_spec302_canonical_project_identity.sql",
              import.meta.url
            )
          )
        )
        .digest("hex"),
      createHash("sha256").update(migrationSql).digest("hex"),
    ];
    expect(prerequisiteNames).toEqual([
      "0392_spec304_app_identity_and_route_aliases",
      "0393_spec302_canonical_project_identity",
    ]);
    expect(checksums).toEqual([
      "f2069748b46f8024a8cf8d89bd7440803318f46da6871dfb47c7932610ded0fd",
      "6e5237357edde02315244dc69cf50ebf450f71d43d8f11927007f50df4c67738",
      PROJECT_WIKI_MIGRATION_0394.expectedSha256,
    ]);
    expect(migrationSql.toString("utf8")).toMatch(
      /^-- Project Wiki Pages[\s\S]*?BEGIN;/
    );
    expect(migrationSql.toString("utf8")).toMatch(/COMMIT;\s*$/);
    expect(migrationSql.toString("utf8")).not.toMatch(/\bDROP\s+TABLE\b/i);
  });

  it("keeps all lifecycle milestones distinct and admits valid pending migration before deployment", () => {
    const result = buildProjectWikiHostedRoutePreflight({
      identity,
      authorities: validAuthorities(),
      now: testNow,
    });
    expect(result.stages).toEqual({
      PACKAGE_CONTENT_VERIFIED: "PASS",
      STAGING_PREFLIGHT_READY: "PASS",
      DEPLOYMENT_COMPLETED: "PENDING",
      MIGRATION_COMPLETED: "PENDING",
      SMOKE_READY: "PENDING",
      UAT_COMPLETED: "PENDING",
      FACTORY_COMPLETED: "PENDING",
    });
    expect(result.migration.migration0394).toBe("PENDING");
    expect(result.outcomes).toEqual(["READY_FOR_AUTHORIZED_STAGING"]);
  });

  it("fails closed when canonical Project/App binding or target authority is missing", () => {
    const facts = validAuthorities();
    facts.project = scoped(null, { state: "NOT_FOUND" });
    facts.target = scoped(null, { state: "NOT_FOUND" });
    const result = buildProjectWikiHostedRoutePreflight({
      identity,
      authorities: facts,
      now: testNow,
    });
    expect(result.outcomes).toContain("PROJECT_BINDING_REQUIRED");
    expect(result.outcomes).toContain("TARGET_AUTHORITY_REQUIRED");
    expect(result.stages.STAGING_PREFLIGHT_READY).toBe("PENDING");
  });

  it("rejects Cloudflare Workers and leaves unverified Containers unknown", () => {
    const worker = validAuthorities();
    worker.target = scoped(
      {
        targetId,
        provider: "cloudflare",
        shape: "worker",
        targetAuthorized: true,
        deploymentApproval: "APPROVED",
      },
      { scope: { ...identity, targetId } }
    );
    expect(
      buildProjectWikiHostedRoutePreflight({
        identity,
        authorities: worker,
        now: testNow,
      }).target.compatibility
    ).toBe("INCOMPATIBLE");
    const container = validAuthorities();
    container.host = scoped(null, {
      state: "UNKNOWN",
      scope: { ...identity, targetId },
      reason: "container_capability_not_proven",
    });
    const result = buildProjectWikiHostedRoutePreflight({
      identity,
      authorities: container,
      now: testNow,
    });
    expect(result.target.compatibility).toBe("UNKNOWN");
    expect(result.outcomes).toContain("HOST_COMPATIBILITY_REQUIRED");
    expect(result.stages.STAGING_PREFLIGHT_READY).toBe("PENDING");
  });

  it("requires an exact approved target and rejects stale or revoked authority", () => {
    for (const state of ["STALE", "REVOKED"] as const) {
      const facts = validAuthorities();
      facts.target = scoped(null, { state, scope: { ...identity, targetId } });
      const result = buildProjectWikiHostedRoutePreflight({
        identity,
        authorities: facts,
        now: testNow,
      });
      expect(result.stages.STAGING_PREFLIGHT_READY).toBe("PENDING");
      expect(result.outcomes).toContain("TARGET_AUTHORITY_REQUIRED");
    }
    const unapproved = validAuthorities();
    unapproved.target = scoped(
      {
        targetId,
        provider: "cloudflare",
        shape: "container",
        targetAuthorized: true,
        deploymentApproval: "REQUIRED",
      },
      { scope: { ...identity, targetId } }
    );
    expect(
      buildProjectWikiHostedRoutePreflight({
        identity,
        authorities: unapproved,
        now: testNow,
      }).outcomes
    ).toContain("DEPLOYMENT_APPROVAL_REQUIRED");
  });

  it("requires a dedicated staging database and matching scoped migration evidence", () => {
    const noDb = validAuthorities();
    noDb.database = scoped(null, { state: "UNKNOWN" });
    expect(
      buildProjectWikiHostedRoutePreflight({
        identity,
        authorities: noDb,
        now: testNow,
      }).outcomes
    ).toContain("DATABASE_AUTHORITY_REQUIRED");
    const productionDb = validAuthorities();
    const productionEvidence = makeMigrationEvidence();
    productionEvidence.value!.environment = "production";
    productionDb.migration = scoped(
      {
        databaseId,
        evidence: productionEvidence,
        prerequisites: validAuthorities().migration.value!.prerequisites,
      },
      { scope: { ...identity, databaseId } }
    );
    expect(
      buildProjectWikiHostedRoutePreflight({
        identity,
        authorities: productionDb,
        now: testNow,
      }).migration.migration0394
    ).toBe("UNKNOWN");
  });

  it("blocks incorrect 0394 and prerequisite checksums", () => {
    for (const mutate of [
      (facts: ProjectWikiHostedRouteAuthorities) => {
        facts.migration.value!.evidence.value!.pendingMigrations[0]!.hash =
          "f".repeat(64);
      },
      (facts: ProjectWikiHostedRouteAuthorities) => {
        facts.migration.value!.prerequisites[0]!.sha256 = "f".repeat(64);
      },
    ]) {
      const facts = validAuthorities();
      mutate(facts);
      const result = buildProjectWikiHostedRoutePreflight({
        identity,
        authorities: facts,
        now: testNow,
      });
      expect(result.migration.qualification).toBe("INVALID");
      expect(result.migration.migration0394).toBe("INVALID");
    }
  });

  it("requires current backup/recovery approval and trusted V5/V6 qualification", () => {
    const noRecovery = validAuthorities();
    noRecovery.recovery = scoped(null, { state: "UNKNOWN" });
    expect(
      buildProjectWikiHostedRoutePreflight({
        identity,
        authorities: noRecovery,
        now: testNow,
      }).outcomes
    ).toContain("MIGRATION_RECOVERY_REQUIRED");
    const noVerifier = validAuthorities();
    noVerifier.trustedQualification = scoped(null, { state: "UNKNOWN" });
    expect(
      buildProjectWikiHostedRoutePreflight({
        identity,
        authorities: noVerifier,
        now: testNow,
      }).outcomes
    ).toContain("TRUSTED_EVIDENCE_REQUIRED");
    const staleVerifier = validAuthorities();
    staleVerifier.trustedQualification.value!.expiresAt =
      "2026-10-11T12:59:59.000Z";
    expect(
      buildProjectWikiHostedRoutePreflight({
        identity,
        authorities: staleVerifier,
        now: testNow,
      }).trustedVerifier.verifierId
    ).toBeNull();
  });

  it("rejects tenant, project, target and package identity mismatches", () => {
    const wrongTenant = validAuthorities();
    wrongTenant.target = scoped(wrongTenant.target.value, {
      scope: {
        ...identity,
        tenantId: "9de1a509-6177-49b7-b57d-5d3b5228d75f",
        targetId,
      },
    });
    expect(
      buildProjectWikiHostedRoutePreflight({
        identity,
        authorities: wrongTenant,
        now: testNow,
      }).target.targetId
    ).toBeNull();
    const wrongProject = validAuthorities();
    wrongProject.database = scoped(wrongProject.database.value, {
      scope: {
        ...identity,
        projectId: "3fe8a309-8be6-4370-9813-8fb9cc4645a0",
        databaseId,
      },
    });
    expect(
      buildProjectWikiHostedRoutePreflight({
        identity,
        authorities: wrongProject,
        now: testNow,
      }).dedicatedDatabase.authorized
    ).toBe(false);
    const wrongPackage = validAuthorities();
    wrongPackage.trustedQualification.value!.sourceRevision = "5".repeat(40);
    expect(
      buildProjectWikiHostedRoutePreflight({
        identity,
        authorities: wrongPackage,
        now: testNow,
      }).outcomes
    ).toContain("TRUSTED_EVIDENCE_REQUIRED");
  });

  it("requires a receipt and reconciled staging schema for post-migration completion", () => {
    const withoutDeployment = validAuthorities({ applied: true });
    withoutDeployment.deployment = scoped(null, {
      state: "NOT_FOUND",
      scope: { ...identity, targetId },
    });
    const unqualified = buildProjectWikiHostedRoutePreflight({
      identity,
      authorities: withoutDeployment,
      now: testNow,
    });
    expect(unqualified.stages.MIGRATION_COMPLETED).toBe("PENDING");
    const applied = validAuthorities({ applied: true });
    applied.deployment = scoped(
      {
        targetId,
        packageDigest,
        sourceRevision,
        deploymentId: "deployment-29",
      },
      { scope: { ...identity, targetId } }
    );
    const ready = buildProjectWikiHostedRoutePreflight({
      identity,
      authorities: applied,
      now: testNow,
    });
    expect(ready.migration.migration0394).toBe("APPLIED");
    expect(ready.stages.MIGRATION_COMPLETED).toBe("PASS");
    expect(ready.migration.receiptReference).toBe("receipt-0394");
  });

  it("reaches READY through the same provider composition used by the exact-admin endpoint", async () => {
    const authorities = validAuthorities();
    const composed = await composeProjectWikiHostedRoutePreflight({
      db: {} as never,
      ...identity,
      providers: testProviders(authorities),
      now: testNow,
    });
    expect(composed.stages.STAGING_PREFLIGHT_READY).toBe("PASS");
    expect(composed.identity).toEqual(identity);
    expect(composed.packageSourceRevision).toBe(sourceRevision);
    expect(composed.hostSourceRevision).toBe("4".repeat(40));
    expect(composed.archiveSha256).toBe(archiveSha256);
    expect(composed.outcomes).toContain("READY_FOR_AUTHORIZED_STAGING");
    expect(composed.stages.DEPLOYMENT_COMPLETED).toBe("PENDING");
  });
});
