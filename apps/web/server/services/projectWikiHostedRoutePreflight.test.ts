import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildProjectWikiHostedRoutePreflight, PROJECT_WIKI_MIGRATION_0394 } from "./projectWikiHostedRoutePreflight";
import type { MigrationEvidence } from "./drizzleMigrationEvidence";

const sourceRevision = "a".repeat(40);
const migration: MigrationEvidence = {
  status: "OBSERVED",
  source: "drizzle.__drizzle_migrations",
  observedAt: "2026-10-11T00:00:00.000Z",
  value: {
    environment: "test",
    databaseIdentity: "loopback:miniapp_test",
    expectedMigrationHead: { tag: "0394_project_wiki_pages_mini_app", hash: PROJECT_WIKI_MIGRATION_0394.expectedSha256 },
    observedAppliedHead: { tag: "0394_project_wiki_pages_mini_app", hash: PROJECT_WIKI_MIGRATION_0394.expectedSha256, appliedAt: 1 },
    pendingMigrations: [],
    currentState: "APPLIED",
    failureHistory: "TRACKED",
    failedMigration: { state: "NONE", source: "synthetic", migration: null, observedAt: "2026-10-11T00:00:00.000Z" },
    failureTracking: "TRACKED",
    latestExecution: { tag: "0394_project_wiki_pages_mini_app", hash: PROJECT_WIKI_MIGRATION_0394.expectedSha256, result: "APPLIED", executedAt: 1 },
    executionReconciliation: { state: "CONSISTENT", receiptState: "SUCCEEDED", idempotencyKey: "test", executionId: "test", sourceSha: sourceRevision, startedAt: null, completedAt: null, failureCategory: null },
  },
};

describe("Project Wiki hosted-route staging preflight", () => {
  it("binds migration evidence to the current SQL checksum and its 0392/0393 prerequisites", () => {
    const sql = readFileSync(new URL("../../drizzle/0394_project_wiki_pages_mini_app.sql", import.meta.url));
    const checksum = createHash("sha256").update(sql).digest("hex");

    expect(PROJECT_WIKI_MIGRATION_0394).toMatchObject({
      expectedSha256: checksum,
      prerequisites: ["0392_spec304_app_identity_and_route_aliases", "0393_spec302_canonical_project_identity"],
    });
    expect(sql.toString("utf8")).toMatch(/^-- Project Wiki Pages[\s\S]*?BEGIN;/);
    expect(sql.toString("utf8")).toMatch(/COMMIT;\s*$/);
    expect(sql.toString("utf8")).not.toMatch(/\bDROP\s+TABLE\b/i);
  });

  it("keeps missing target, database, recovery and trusted-verifier authority explicit", () => {
    const result = buildProjectWikiHostedRoutePreflight({
      sourceRevision,
      localHostCompatibilityVerified: true,
      targetCompatibility: "UNKNOWN",
      targetAuthorized: false,
      dedicatedDatabaseAuthorized: false,
      migration,
      stagingRecoveryPolicyAuthorized: false,
      trustedEvidenceVerifierAvailable: false,
    });

    expect(result).toMatchObject({
      localHostCompatibility: "VERIFIED",
      stagingTarget: "REQUIRED",
      dedicatedDatabase: "REQUIRED",
      migration: { migration0394: "APPLIED", reverseSqlMigration: "UNSUPPORTED", stagingRecoveryPolicy: "REQUIRED" },
      trustedEvidenceVerifier: "REQUIRED",
      outcomes: [
        "HOST_COMPATIBILITY_VERIFIED",
        "TARGET_AUTHORITY_REQUIRED",
        "DATABASE_AUTHORITY_REQUIRED",
        "MIGRATION_RECOVERY_REQUIRED",
        "TRUSTED_EVIDENCE_REQUIRED",
      ],
    });
    expect(result.outcomes).not.toContain("READY_FOR_AUTHORIZED_STAGING");
  });

  it("fails closed for an incompatible target and missing source revision", () => {
    const result = buildProjectWikiHostedRoutePreflight({
      sourceRevision: "not-a-source-sha",
      localHostCompatibilityVerified: true,
      targetCompatibility: "INCOMPATIBLE",
      targetAuthorized: true,
      dedicatedDatabaseAuthorized: true,
      migration,
      stagingRecoveryPolicyAuthorized: true,
      trustedEvidenceVerifierAvailable: true,
    });

    expect(result.sourceRevision).toBeNull();
    expect(result.localHostCompatibility).toBe("UNKNOWN");
    expect(result.stagingTarget).toBe("INCOMPATIBLE");
    expect(result.outcomes).toContain("TARGET_INCOMPATIBLE");
    expect(result.outcomes).toContain("TRUSTED_EVIDENCE_REQUIRED");
    expect(result.outcomes).not.toContain("READY_FOR_AUTHORIZED_STAGING");
  });

  it("recognizes 0394 as applied from a consistent later Drizzle head when it is not pending", () => {
    const laterHead: MigrationEvidence = {
      ...migration,
      value: {
        ...migration.value!,
        expectedMigrationHead: { tag: "0395_spec224_external_runtime_job_type", hash: "c".repeat(64) },
        observedAppliedHead: { tag: "0395_spec224_external_runtime_job_type", hash: "c".repeat(64), appliedAt: 2 },
      },
    };
    const result = buildProjectWikiHostedRoutePreflight({
      sourceRevision,
      localHostCompatibilityVerified: true,
      targetCompatibility: "UNKNOWN",
      targetAuthorized: false,
      dedicatedDatabaseAuthorized: false,
      migration: laterHead,
      stagingRecoveryPolicyAuthorized: false,
      trustedEvidenceVerifierAvailable: false,
    });

    expect(result.migration.migration0394).toBe("APPLIED");
  });

  it("emits READY only when every host, target, DB, migration and verifier gate is met", () => {
    const result = buildProjectWikiHostedRoutePreflight({
      sourceRevision,
      localHostCompatibilityVerified: true,
      targetCompatibility: "COMPATIBLE",
      targetAuthorized: true,
      dedicatedDatabaseAuthorized: true,
      migration,
      stagingRecoveryPolicyAuthorized: true,
      trustedEvidenceVerifierAvailable: true,
    });

    expect(result.outcomes).toEqual(["HOST_COMPATIBILITY_VERIFIED", "READY_FOR_AUTHORIZED_STAGING"]);
  });
});
