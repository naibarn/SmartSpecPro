import { describe, expect, it } from "vitest";
import {
  SINGLE_OWNER_DEV_ADMIN_APPLICATION_NAME,
  assertMissionMigrationLedger,
  assertSharedTenantDevMigrationIdentity,
  validateSharedTenantDevMigrationTarget,
} from "../sharedTenantDevMigrationTarget";

function environment(overrides: Record<string, string> = {}) {
  return {
    NODE_ENV: "development",
    SMARTSPEC_ENVIRONMENT: "development",
    SMARTSPEC_DEV_DATABASE_MODE: "shared-tenant",
    SMARTSPEC_DEV_MIGRATION_PROFILE: "single-owner-dev-admin",
    DATABASE_TARGET_ID: "modular-debian-dev",
    SMARTSPEC_DEV_TENANT_DOMAIN: "aimarkethubs.com",
    APP_URL: "https://aimarkethubs.com",
    DATABASE_URL: `postgresql://smartspec:secret@localhost:5432/smartspec?application_name=${SINGLE_OWNER_DEV_ADMIN_APPLICATION_NAME}`,
    ...overrides,
  };
}

describe("shared-tenant DEV migration target", () => {
  it("accepts explicit single-owner admin mode based on target metadata, not a _dev username", () => {
    expect(() => validateSharedTenantDevMigrationTarget(environment())).not.toThrow();
  });

  it("requires explicit execution profile even when the login name ends in _dev", () => {
    expect(() => validateSharedTenantDevMigrationTarget(environment({
      SMARTSPEC_DEV_MIGRATION_PROFILE: "",
      DATABASE_URL: "postgresql://some_dev:secret@localhost:5432/smartspec",
    }))).toThrow("SHARED_DEVELOPMENT_MIGRATION_PROFILE_REQUIRED");
  });

  it("rejects an admin profile without its database application marker", () => {
    expect(() => validateSharedTenantDevMigrationTarget(environment({
      DATABASE_URL: "postgresql://smartspec:secret@localhost:5432/smartspec",
    }))).toThrow("SHARED_DEVELOPMENT_MIGRATION_PROFILE_REQUIRED");
  });

  it("requires a real DEV database superuser for the single-owner admin profile", () => {
    expect(() => assertSharedTenantDevMigrationIdentity(environment(), {
      database_name: "smartspec",
      server_version_num: 150017,
      role_can_login: true,
      role_is_superuser: true,
      role_can_create_role: true,
      role_can_create_database: true,
      role_can_replicate: false,
      role_can_bypass_rls: false,
      role_inherit: true,
      application_name: SINGLE_OWNER_DEV_ADMIN_APPLICATION_NAME,
    })).not.toThrow();
  });

  it.each([
    [{ database_name: "smartspec_prod" }, "SHARED_DEVELOPMENT_DATABASE_MISMATCH"],
    [{ server_version_num: 160000 }, "SHARED_DEVELOPMENT_POSTGRES_VERSION_UNSUPPORTED"],
    [{ role_is_superuser: false }, "SHARED_DEVELOPMENT_ADMIN_PRIVILEGE_REQUIRED"],
    [{ application_name: "smartaihub-db-migrate" }, "SHARED_DEVELOPMENT_ADMIN_PROFILE_MARKER_REQUIRED"],
  ])("rejects live identity mismatch %j", (facts, error) => {
    expect(() => assertSharedTenantDevMigrationIdentity(environment(), {
      database_name: "smartspec",
      server_version_num: 150017,
      role_can_login: true,
      role_is_superuser: true,
      role_can_create_role: true,
      role_can_create_database: true,
      role_can_replicate: false,
      role_can_bypass_rls: false,
      role_inherit: true,
      application_name: SINGLE_OWNER_DEV_ADMIN_APPLICATION_NAME,
      ...facts,
    })).toThrow(error);
  });

  it("rejects production environment metadata before contacting the database", () => {
    expect(() => validateSharedTenantDevMigrationTarget(environment({
      NODE_ENV: "production",
    }))).toThrow("SHARED_DEVELOPMENT_MIGRATION_TARGET_REQUIRED");
  });

  it.each([
    [{ DATABASE_TARGET_ID: "modular-cloudflare-prod" }, "SHARED_DEVELOPMENT_MIGRATION_TARGET_REQUIRED"],
    [{ SMARTSPEC_DEV_TENANT_DOMAIN: "smartsihub.com", APP_URL: "https://smartsihub.com" }, "SHARED_DEVELOPMENT_MIGRATION_TARGET_REQUIRED"],
    [{ APP_URL: "https://aimarkethubs.com.attacker.example" }, "SHARED_DEVELOPMENT_MIGRATION_TARGET_REQUIRED"],
  ])("rejects a non-registered DEV target %j", (facts, error) => {
    expect(() => validateSharedTenantDevMigrationTarget(environment(facts))).toThrow(error);
  });
});

describe("shared-tenant Mission migration ledger preflight", () => {
  const migrations = [
    { tag: "0439_modular_chat_output_artifacts", when: 439, hash: "hash-439" },
    { tag: "0440_seedream_5_5_unified_model", when: 440, hash: "hash-440" },
    { tag: "0441_modular_chat_missions", when: 441, hash: "hash-441" },
  ];
  const applied = [
    { created_at: 439, hash: "hash-439" },
    { created_at: 440, hash: "hash-440" },
  ];

  it("accepts exact 0439/0440 source hashes with 0441 pending", () => {
    expect(() => assertMissionMigrationLedger(migrations, applied)).not.toThrow();
  });

  it.each([
    [[{ created_at: 439, hash: "wrong" }, applied[1]], "SHARED_DEVELOPMENT_MIGRATION_0439_MISMATCH"],
    [[applied[0], { created_at: 440, hash: "wrong" }], "SHARED_DEVELOPMENT_MIGRATION_0440_MISMATCH"],
    [[...applied, { created_at: 441, hash: "hash-441" }], "SHARED_DEVELOPMENT_MIGRATION_0441_ALREADY_APPLIED"],
    [[...applied, { created_at: 442, hash: "future" }], "SHARED_DEVELOPMENT_MIGRATION_HEAD_MISMATCH"],
  ])("rejects an inconsistent migration ledger", (rows, error) => {
    expect(() => assertMissionMigrationLedger(migrations, rows)).toThrow(error);
  });
});
