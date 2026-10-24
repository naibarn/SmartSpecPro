import { describe, expect, it } from "vitest";
import {
  evaluateScopedPendingMigrations,
  fingerprintMigrationDatabase,
  parseExpectedPendingTags,
} from "../scopedMigrationPreflight";

const journal = [
  { tag: "0411_active_schema_additive_reconciliation", when: 100, hash: "hash-0411" },
  { tag: "0412_active_shared_schema_contract_repair", when: 200, hash: "hash-0412" },
];

describe("scoped production migration preflight", () => {
  it("accepts only the exact pending migration set", () => {
    expect(evaluateScopedPendingMigrations({
      journal,
      latestAppliedAt: 100,
      expectedTags: ["0412_active_shared_schema_contract_repair"],
    })).toEqual({ status: "READY", pending: [journal[1]] });
  });

  it.each([
    [null, ["0412_active_shared_schema_contract_repair"]],
    [100, ["0411_active_schema_additive_reconciliation", "0412_active_shared_schema_contract_repair"]],
    [200, ["0412_active_shared_schema_contract_repair"]],
  ])("fails closed when the pending set differs from the expected set", (latestAppliedAt, expectedTags) => {
    expect(evaluateScopedPendingMigrations({ journal, latestAppliedAt, expectedTags })).toEqual({
      status: "BLOCKED",
      reason: "pending_migration_set_mismatch",
    });
  });

  it("rejects invalid or duplicate expected tags", () => {
    expect(() => parseExpectedPendingTags("0412_bad tag")).toThrow("MIGRATION_EXPECTED_PENDING_TAGS_INVALID");
    expect(() => parseExpectedPendingTags("0412_one,0412_one")).toThrow("MIGRATION_EXPECTED_PENDING_TAGS_DUPLICATE");
    expect(parseExpectedPendingTags(undefined)).toBeNull();
  });

  it("binds the database fingerprint to network, cluster, database, schema, role and version", () => {
    const facts = {
      serverAddress: "127.0.0.1",
      serverPort: 5432,
      clusterName: "production",
      database: "smartspec",
      schema: "public",
      role: "smartspec",
      serverVersion: "15.17",
    };
    expect(fingerprintMigrationDatabase(facts)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(fingerprintMigrationDatabase({ ...facts, role: "other" })).not.toBe(fingerprintMigrationDatabase(facts));
  });
});
