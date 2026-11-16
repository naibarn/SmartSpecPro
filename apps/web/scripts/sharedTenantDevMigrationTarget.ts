export const SINGLE_OWNER_DEV_ADMIN_APPLICATION_NAME = "spec312-r124-single-owner-dev-admin";

export type SharedTenantDevMigrationProfile = "single-owner-dev-admin" | "least-privilege";

export interface SharedTenantDevMigrationIdentity {
  database_name: string;
  server_version_num: number | string;
  role_can_login: boolean;
  role_is_superuser: boolean;
  role_can_create_role: boolean;
  role_can_create_database: boolean;
  role_can_replicate: boolean;
  role_can_bypass_rls: boolean;
  role_inherit: boolean;
  application_name: string | null;
}

export interface SharedTenantDevMigrationLedgerRow {
  hash: string;
  created_at: number | string | null;
}

export interface SharedTenantDevMigrationSource {
  tag: string;
  when: number;
  hash: string;
}

export function assertMissionMigrationLedger(
  migrations: SharedTenantDevMigrationSource[],
  rows: SharedTenantDevMigrationLedgerRow[],
): void {
  const sourceByTag = new Map(migrations.map(migration => [migration.tag, migration]));
  const required = [
    ["0439_modular_chat_output_artifacts", "SHARED_DEVELOPMENT_MIGRATION_0439_MISMATCH"],
    ["0440_seedream_5_5_unified_model", "SHARED_DEVELOPMENT_MIGRATION_0440_MISMATCH"],
  ] as const;
  for (const [tag, error] of required) {
    const source = sourceByTag.get(tag);
    if (!source || rows.filter(row => Number(row.created_at) === source.when && row.hash === source.hash).length !== 1) {
      throw new Error(error);
    }
  }
  const missionMigration = sourceByTag.get("0441_modular_chat_missions");
  if (!missionMigration) throw new Error("SHARED_DEVELOPMENT_MIGRATION_0441_SOURCE_MISSING");
  const migration0440 = sourceByTag.get("0440_seedream_5_5_unified_model");
  if (!migration0440) {
    throw new Error("SHARED_DEVELOPMENT_MIGRATION_HEAD_MISMATCH");
  }

  // 0441 bootstrap used this gate before that migration existed in the target.
  // Later shared-tenant DEV migrations must accept the exact applied 0441 and
  // only a contiguous, hash-matching suffix from the canonical journal.
  const missionEvidence = rows.filter(row => row.hash === missionMigration.hash || Number(row.created_at) === missionMigration.when);
  if (missionEvidence.length === 0) {
    const latestTimestamp = rows.reduce((latest, row) => {
      const timestamp = Number(row.created_at);
      return Number.isSafeInteger(timestamp) ? Math.max(latest, timestamp) : latest;
    }, Number.MIN_SAFE_INTEGER);
    if (latestTimestamp !== migration0440.when) throw new Error("SHARED_DEVELOPMENT_MIGRATION_HEAD_MISMATCH");
    return;
  }
  if (missionEvidence.length !== 1 || missionEvidence[0]?.hash !== missionMigration.hash ||
    Number(missionEvidence[0]?.created_at) !== missionMigration.when) {
    throw new Error("SHARED_DEVELOPMENT_MIGRATION_0441_MISMATCH");
  }

  const orderedSuffix = migrations.filter(migration => migration.when > migration0440.when)
    .sort((left, right) => left.when - right.when);
  const appliedSuffix = rows.filter(row => Number(row.created_at) > migration0440.when)
    .sort((left, right) => Number(left.created_at) - Number(right.created_at));
  if (appliedSuffix.length > orderedSuffix.length || appliedSuffix.some((row, index) =>
    Number(row.created_at) !== orderedSuffix[index]?.when || row.hash !== orderedSuffix[index]?.hash)) {
    throw new Error("SHARED_DEVELOPMENT_MIGRATION_HEAD_MISMATCH");
  }
}

function profileFromEnvironment(environment: NodeJS.ProcessEnv): SharedTenantDevMigrationProfile {
  const profile = environment.SMARTSPEC_DEV_MIGRATION_PROFILE;
  if (profile === "single-owner-dev-admin" || profile === "least-privilege") return profile;
  throw new Error("SHARED_DEVELOPMENT_MIGRATION_PROFILE_REQUIRED");
}

export function validateSharedTenantDevMigrationTarget(environment: NodeJS.ProcessEnv): SharedTenantDevMigrationProfile {
  try {
    const databaseUrl = new URL(environment.DATABASE_URL ?? "");
    const appUrl = new URL(environment.APP_URL ?? "");
    const profile = profileFromEnvironment(environment);
    if (
      environment.NODE_ENV !== "development" ||
      environment.SMARTSPEC_ENVIRONMENT !== "development" ||
      environment.SMARTSPEC_DEV_DATABASE_MODE !== "shared-tenant" ||
      environment.DATABASE_TARGET_ID !== "modular-debian-dev" ||
      !/^(postgres|postgresql):$/.test(databaseUrl.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname) ||
      databaseUrl.pathname !== "/smartspec" ||
      environment.SMARTSPEC_DEV_TENANT_DOMAIN !== "aimarkethubs.com" ||
      appUrl.hostname !== "aimarkethubs.com"
    ) throw new Error("SHARED_DEVELOPMENT_MIGRATION_TARGET_REQUIRED");

    if (profile === "single-owner-dev-admin" &&
      databaseUrl.searchParams.get("application_name") !== SINGLE_OWNER_DEV_ADMIN_APPLICATION_NAME) {
      throw new Error("SHARED_DEVELOPMENT_MIGRATION_PROFILE_REQUIRED");
    }
    return profile;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("SHARED_DEVELOPMENT_")) throw error;
    throw new Error("SHARED_DEVELOPMENT_MIGRATION_TARGET_REQUIRED");
  }
}

export function assertSharedTenantDevMigrationIdentity(
  environment: NodeJS.ProcessEnv,
  identity: SharedTenantDevMigrationIdentity,
): void {
  const profile = validateSharedTenantDevMigrationTarget(environment);
  if (identity.database_name !== "smartspec") throw new Error("SHARED_DEVELOPMENT_DATABASE_MISMATCH");
  const serverVersion = Number(identity.server_version_num);
  if (!Number.isInteger(serverVersion) || Math.floor(serverVersion / 10000) !== 15) {
    throw new Error("SHARED_DEVELOPMENT_POSTGRES_VERSION_UNSUPPORTED");
  }
  if (!identity.role_can_login) throw new Error("SHARED_DEVELOPMENT_LOGIN_REQUIRED");

  if (profile === "single-owner-dev-admin") {
    if (!identity.role_is_superuser) throw new Error("SHARED_DEVELOPMENT_ADMIN_PRIVILEGE_REQUIRED");
    if (identity.application_name !== SINGLE_OWNER_DEV_ADMIN_APPLICATION_NAME) {
      throw new Error("SHARED_DEVELOPMENT_ADMIN_PROFILE_MARKER_REQUIRED");
    }
    return;
  }

  if (identity.role_is_superuser || identity.role_can_create_role || identity.role_can_create_database ||
    identity.role_can_replicate || identity.role_can_bypass_rls || identity.role_inherit) {
    throw new Error("SHARED_DEVELOPMENT_LEAST_PRIVILEGE_ROLE_REQUIRED");
  }
}
