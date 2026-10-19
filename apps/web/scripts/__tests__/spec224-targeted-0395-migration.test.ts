import { describe, expect, it } from "vitest";
import {
  evaluateSpec224Targeted0395Preflight,
  fingerprintDatabase,
  SPEC224_0395_TARGET,
} from "../spec224-targeted-0395-migration";

const migrations = [
  { tag: "0394_project_wiki_pages_mini_app", when: 1791400000004, hash: "predecessor-hash" },
  { tag: SPEC224_0395_TARGET.tag, when: 1791700523400, hash: "target-hash" },
  { tag: "0396_project_wiki_package_candidate", when: 1791743719177, hash: "later-hash" },
];

const facts = {
  database: "smartspec",
  schema: "public",
  role: "smartspec",
  serverAddress: "10.0.0.5",
  serverPort: 5432,
  clusterName: "cluster-a",
  serverVersion: "15.17",
  sessionRoleMatches: true,
  writableSession: true,
  migrationRoleCanAlterEnum: true,
  canInspectMigrationActivity: true,
};

function input(overrides: Partial<Parameters<typeof evaluateSpec224Targeted0395Preflight>[0]> = {}) {
  return {
    facts,
    actualFingerprint: SPEC224_0395_TARGET.expectedFingerprint,
    environment: "production",
    enumExists: true,
    enumLabels: ["local_llm_worker"],
    migrations,
    applied: [{ hash: "predecessor-hash", created_at: migrations[0].when }],
    activeMigrationCandidates: 0,
    ...overrides,
  };
}

describe("SPEC-224 targeted 0395 migration preflight", () => {
  it("allows only the exact production target when the prior journal timestamp exists", () => {
    expect(evaluateSpec224Targeted0395Preflight(input())).toEqual({
      status: "READY",
      target: migrations[1],
      predecessorHashMismatches: 0,
    });
  });

  it("allows known predecessor timestamps but records hash drift without treating it as a missing dependency", () => {
    expect(evaluateSpec224Targeted0395Preflight(input({
      applied: [{ hash: "legacy-unknown-hash", created_at: migrations[0].when }],
    }))).toMatchObject({ status: "READY", predecessorHashMismatches: 1 });
  });

  it.each([
    ["wrong target", { actualFingerprint: "sha256:wrong" }, "database_fingerprint_mismatch"],
    ["wrong environment", { environment: "staging" }, "environment_mismatch"],
    ["missing predecessor", { applied: [] }, "pending_migration_before_target"],
    ["migration active", { activeMigrationCandidates: 1 }, "concurrent_migration_detected"],
    ["hidden migration activity", { facts: { ...facts, canInspectMigrationActivity: false } }, "migration_activity_visibility_unverified"],
    ["ledger already ahead", { applied: [
      { hash: "predecessor-hash", created_at: migrations[0].when },
      { hash: "later-hash", created_at: migrations[2].when },
    ] }, "ledger_already_ahead_of_target"],
    ["enum already changed without matching ledger", { enumLabels: ["local_llm_worker", "external_runtime"] }, "enum_present_but_migration_not_consistently_recorded"],
    ["wrong target hash", { applied: [
      { hash: "predecessor-hash", created_at: migrations[0].when },
      { hash: "unexpected", created_at: migrations[1].when },
    ] }, "target_migration_hash_mismatch"],
  ])("fails closed for %s", (_name, overrides, expectedReason) => {
    const result = evaluateSpec224Targeted0395Preflight(input(overrides as Partial<Parameters<typeof evaluateSpec224Targeted0395Preflight>[0]>));
    expect(result.status).toBe("BLOCKED");
    expect(result.status === "BLOCKED" ? result.reasons : []).toContain(expectedReason);
  });

  it("recognizes a fully recorded migration without applying it again", () => {
    expect(evaluateSpec224Targeted0395Preflight(input({
      enumLabels: ["local_llm_worker", "external_runtime"],
      applied: [
        { hash: "predecessor-hash", created_at: migrations[0].when },
        { hash: "target-hash", created_at: migrations[1].when },
      ],
    }))).toMatchObject({ status: "ALREADY_APPLIED" });
  });

  it("uses the same stable, non-secret fingerprint composition as Admin diagnostics", () => {
    const expected = fingerprintDatabase(facts);
    expect(expected).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(fingerprintDatabase({ ...facts })).toBe(expected);
  });
});
