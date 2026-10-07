import { describe, expect, it, vi } from "vitest";
import type { MigrationEvidence, MigrationEvidenceSource } from "./drizzleMigrationEvidence";

const migration = { status: "OBSERVED", source: "drizzle.__drizzle_migrations", observedAt: "2026-10-07T12:00:00.000Z", value: { databaseIdentity: "db/public" } };
const credentialState = {
  profiles: { deployment: { configured: true } },
  runtime: { workerUrlConfigured: false, runtimeTokenConfigured: false },
};

vi.mock("./drizzleMigrationEvidence", () => ({ drizzleMigrationEvidenceSource: { observe: vi.fn(async () => migration) } }));
vi.mock("./runtimeHealthMonitor", () => ({ collectRuntimeHealthEvidence: vi.fn(() => ({ status: "OBSERVED", value: { readiness: "UNKNOWN" } })) }));
vi.mock("./applicationReadiness", () => ({ evaluateApplicationReadiness: vi.fn(async () => ({ status: "ready", checks: { db: "ok" }, observedAt: "2026-10-07T12:00:00.000Z", evidenceSource: "application_readiness_probe" })) }));
vi.mock("./cloudflareCredentialCenter", () => ({ getCloudflareCredentialCenterState: vi.fn(async () => credentialState) }));

import { getInternalRuntimeEvidence } from "./internalRuntimeEvidence";

describe("internal runtime evidence aggregation", () => {
  it("combines normalized internal sources without exposing provider secrets or claiming production verification", async () => {
    const result = await getInternalRuntimeEvidence({ db: {} as never, now: new Date("2026-10-07T12:00:00.000Z") });
    expect(result).toMatchObject({ scope: "INTERNAL_RUNTIME_ONLY", migration, runtime: { status: "OBSERVED", readiness: { status: "READY", evidenceSource: "application_readiness_probe" } },
      providerConfiguration: { cloudflareDeployment: { status: "CONFIGURED" } }, externalRuntimeVerification: "NOT_VERIFIED" });
    expect(JSON.stringify(result)).not.toContain("plaintext-provider-token");
    expect(JSON.stringify(result)).not.toContain("credential-value");
  });

  it("reports not configured when neither credential center nor runtime secret references are configured", async () => {
    credentialState.profiles.deployment.configured = false;
    await expect(getInternalRuntimeEvidence({ db: {} as never })).resolves.toMatchObject({
      providerConfiguration: { cloudflareDeployment: { status: "NOT_CONFIGURED" } },
    });
  });

  it("accepts another normalized migration source through the provider boundary", async () => {
    const alternateMigration: MigrationEvidence = {
      status: "OBSERVED",
      source: "alternate-migration-provider",
      observedAt: "2026-10-07T12:01:00.000Z",
      value: {
        environment: "staging",
        databaseIdentity: "d1/app",
        expectedMigrationHead: { tag: "0012_add_index", hash: "expected-hash" },
        observedAppliedHead: { hash: "previous-hash", appliedAt: 1_791_360_000_000 },
        pendingMigrations: [{ tag: "0012_add_index", hash: "expected-hash" }],
        failedMigration: {
          state: "FAILED",
          source: "deployment_migration_events",
          migration: { tag: "0012_add_index", hash: "expected-hash" },
          observedAt: "2026-10-07T12:00:30.000Z",
          reason: "execution_failed",
        },
        failureTracking: "TRACKED",
        latestExecution: { hash: "expected-hash", result: "FAILED", executedAt: 1_791_360_030_000 },
      },
    };
    const migrationSource: MigrationEvidenceSource = { observe: vi.fn(async () => alternateMigration) };
    const result = await getInternalRuntimeEvidence({ db: {} as never, migrationSource });
    expect(migrationSource.observe).toHaveBeenCalledOnce();
    expect(result.migration).toEqual(alternateMigration);
    expect(result.migration.value?.failedMigration).toMatchObject({ state: "FAILED", migration: { tag: "0012_add_index" } });
  });

  it("keeps known absence distinct from an untracked failure history", async () => {
    const knownNoFailure: MigrationEvidence = {
      status: "OBSERVED",
      source: "deployment_migration_events",
      observedAt: "2026-10-07T12:01:00.000Z",
      value: {
        environment: "staging",
        databaseIdentity: "postgres/staging",
        expectedMigrationHead: { tag: "0012_add_index", hash: "expected-hash" },
        observedAppliedHead: { hash: "expected-hash", appliedAt: 1_791_360_030_000 },
        pendingMigrations: [],
        failedMigration: {
          state: "NONE",
          source: "deployment_migration_events",
          migration: null,
          observedAt: "2026-10-07T12:01:00.000Z",
        },
        failureTracking: "TRACKED",
        latestExecution: { hash: "expected-hash", result: "APPLIED", executedAt: 1_791_360_030_000 },
      },
    };
    const migrationSource: MigrationEvidenceSource = { observe: vi.fn(async () => knownNoFailure) };
    const result = await getInternalRuntimeEvidence({ db: {} as never, migrationSource });
    expect(result.migration.value?.failedMigration).toMatchObject({ state: "NONE", source: "deployment_migration_events" });
    expect(result.migration.value?.failureTracking).toBe("TRACKED");
  });
});
