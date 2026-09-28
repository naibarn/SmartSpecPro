import { describe, expect, it } from "vitest";
import {
  evaluateTargetFacts,
  TARGET_FACTS_QUERY,
  validateTargetSpec,
} from "../spec224-postgres-preflight.mjs";

const targetSpec = {
  targetId: "cert-pg15-20260923-a",
  environment: "non-production",
  serverAddress: "127.0.0.1",
  port: 55432,
  database: "spec224_certification",
  role: "spec224_migrator",
  rolePurpose: "migration",
  migrationRole: "spec224_migrator",
  runtimeRole: "spec224_runtime",
  manifestSha256: "d6f7d27026b147a8361644fef7727414d86011f1aed2104b76453d1a1dba72f3",
  baselinePolicy: "preflight-catalog-checks-v1",
  allowedExtensions: ["plpgsql"],
};

function facts(overrides: Record<string, unknown> = {}) {
  return {
    database: targetSpec.database,
    server_address: targetSpec.serverAddress,
    server_port: targetSpec.port,
    server_version_num: 150017,
    database_comment: `smartaihub-spec224-certification|environment=non-production|target=${targetSpec.targetId}|manifest=${targetSpec.manifestSha256}`,
    role: targetSpec.role,
    role_can_login: true,
    role_is_superuser: false,
    role_can_create_database: false,
    role_can_create_role: false,
    role_can_replicate: false,
    role_can_bypass_rls: false,
    current_session_role_matches: true,
    database_owned_by_current_role: false,
    database_owner_role: "spec224_dba",
    database_connect: true,
    database_create: true,
    database_create_grantees: ["spec224_migrator"],
    public_schema_create: true,
    public_schema_usage: true,
    public_schema_owned_by_current_role: false,
    public_schema_owner_role: "pg_database_owner",
    public_schema_create_grantees: ["spec224_migrator"],
    role_memberships: [],
    non_public_schema_names: [],
    user_relation_count: 0,
    user_procedure_count: 0,
    user_type_count: 0,
    default_acl_count: 0,
    extension_names: ["plpgsql"],
    user_event_trigger_count: 0,
    user_large_object_count: 0,
    foreign_data_wrapper_count: 0,
    foreign_server_count: 0,
    role_owned_object_count: 0,
    drizzle_migrations_exists: false,
    ...overrides,
  };
}

describe("Spec 224 PostgreSQL target preflight policy", () => {
  it("passes only an exact PG15 non-production migration target and labels approval unverified", () => {
    const result = evaluateTargetFacts(targetSpec, facts());

    expect(result.status).toBe("PREFLIGHT_PASS_NOT_APPROVAL");
    expect(result.evidence).toMatchObject({
      targetId: targetSpec.targetId,
      checkedCatalogBaseline: true,
      ownerBaselineAttestationRequired: true,
      databaseCatalogFingerprint: null,
      databaseMutation: false,
      ownerApprovalVerified: false,
      migrationAppliedStatus: "not_checked",
    });
  });

  it.each([
    [{ database: "shared_test" }, "database_identity_mismatch"],
    [{ server_address: "10.0.0.9" }, "server_address_mismatch"],
    [{ server_version_num: 160000 }, "postgresql_15_required"],
    [{ database_comment: "production" }, "nonproduction_target_marker_mismatch"],
    [{ role_is_superuser: true }, "superuser_role_forbidden"],
    [{ role_can_create_role: true }, "createrole_privilege_forbidden"],
    [{ role_memberships: ["pg_read_all_data"] }, "inherited_or_set_role_membership_forbidden"],
    [{ current_session_role_matches: false }, "session_role_switch_forbidden"],
    [{ database_owned_by_current_role: true }, "database_owner_role_forbidden"],
    [{ database_owner_role: "spec224_migrator" }, "application_role_owns_database"],
    [{ database_create_grantees: ["spec224_migrator", "another_role"] }, "database_create_grantee_allowlist_mismatch"],
    [{ non_public_schema_names: ["scratch"] }, "unexpected_user_schema"],
    [{ public_schema_create_grantees: ["spec224_migrator", "another_role"] }, "public_schema_create_grantee_allowlist_mismatch"],
    [{ user_relation_count: 1 }, "database_not_empty"],
    [{ user_procedure_count: 1 }, "user_procedures_present"],
    [{ default_acl_count: 1 }, "default_acl_present"],
    [{ extension_names: ["plpgsql", "unapproved_ext"] }, "extension_allowlist_mismatch"],
    [{ role_owned_object_count: 1 }, "role_owns_catalog_objects"],
    [{ drizzle_migrations_exists: true }, "migration_history_already_exists"],
  ])("blocks target facts that violate isolation or least privilege", (overrides, expectedError) => {
    const result = evaluateTargetFacts(targetSpec, facts(overrides));

    expect(result.status).toBe("BLOCKED");
    expect(result.failedChecks).toContain(expectedError);
  });

  it("requires runtime role to have no public schema DDL privilege", () => {
    const runtimeSpec = { ...targetSpec, role: "spec224_runtime", rolePurpose: "runtime" };

    expect(evaluateTargetFacts(runtimeSpec, facts({
      role: runtimeSpec.role,
      database_create: false,
      database_create_grantees: ["spec224_migrator"],
      public_schema_create: false,
      public_schema_create_grantees: ["spec224_migrator"],
    })).status)
      .toBe("PREFLIGHT_PASS_NOT_APPROVAL");
    expect(evaluateTargetFacts(runtimeSpec, facts({
      role: runtimeSpec.role,
      database_create: false,
      database_create_grantees: ["spec224_migrator"],
      public_schema_create: true,
      public_schema_create_grantees: ["spec224_migrator"],
    }))
      .failedChecks).toContain("runtime_schema_create_forbidden");
  });

  it("rejects target specs containing unapproved fields or credentials", () => {
    expect(validateTargetSpec({ ...targetSpec, databaseUrl: "postgres://user:secret@host/db" }))
      .toContain("target_spec_has_unapproved_field");
  });

  it("uses a SELECT-only query and has no migration or provisioning command", () => {
    expect(TARGET_FACTS_QUERY.trimStart().startsWith("SELECT")).toBe(true);
    expect(TARGET_FACTS_QUERY).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|GRANT|REVOKE|TRUNCATE)\b/im);
  });
});
