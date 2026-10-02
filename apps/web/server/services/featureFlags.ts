/**
 * Feature flags for Cloud Tasks migration.
 *
 * Reads/writes durable overrides in PostgreSQL with environment fallback for global flags.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { runtimeFeatureFlags } from "../../drizzle/schema";

const PLAYWRIGHT_BACKED_FLAGS = new Set([
  "browserTool",
  "automationCopilot",
  "liveBrowser",
  "chatBrowserSessionEntry",
]);
const FALSE_ENV_VALUES = new Set(["0", "false", "no", "off", "disabled"]);
const RETIRED_FEATURE_FLAGS = new Set([
  "crossAgency",
  "agencyBrowserSessionUi",
  "workflowBrowserSessionNodes",
  "agencyCustomTools",
  "agencyGuardrails",
  "agencyStreaming",
  "agencyToolApi",
  "agencyAgenticModeEnabled",
  "agencyReactExecutorEnabled",
  "agencyAutonomousAgentEnabled",
  "agencyLongTermMemoryEnabled",
  "agencyHybridAdk",
  "agencyHybridAdkKillSwitch",
  "agentExperienceAgencyPreview",
  "taskPlannerAgencyEscalation",
  "orchestratorEnabled",
  "workpacksEnabled",
  "workpackAutonomousPilot",
  "workpackOpsConsole",
  "mcpStdio",
]);

function isPlaywrightGloballyDisabled(): boolean {
  const raw = process.env.SMARTSPEC_PLAYWRIGHT_ENABLED ?? "true";
  return FALSE_ENV_VALUES.has(raw.trim().toLowerCase());
}

function isPlaywrightBackedFlag(flagName: string): boolean {
  return PLAYWRIGHT_BACKED_FLAGS.has(flagName);
}

/**
 * Read a feature flag value.
 *
 * Checks the PostgreSQL override first.
 * Falls back to process.env[flagName] when no override exists.
 * Returns false by default — features are opt-in unless explicitly enabled.
 */
export async function getFeatureFlag(flagName: string): Promise<boolean> {
  if (flagName === "USE_CLOUD_TASKS" || RETIRED_FEATURE_FLAGS.has(flagName)) {
    // This flag belonged to the retired Google runtime. Keep reads
    // fail-closed so stale Redis/DB values cannot reactivate it.
    return false;
  }
  if (isPlaywrightBackedFlag(flagName) && isPlaywrightGloballyDisabled()) {
    return false;
  }

  const row = (await getDb().select({ value: runtimeFeatureFlags.value })
    .from(runtimeFeatureFlags)
    .where(eq(runtimeFeatureFlags.scopeKey, `global:${flagName}`))
    .limit(1))[0];
  if (row) return row.value === true;

  // Fallback to environment variable
  const envValue = process.env[flagName];
  if (envValue !== undefined) {
    return envValue !== "false";
  }

  return false;
}

/**
 * Write a global feature flag override to PostgreSQL.
 */
export async function setFeatureFlag(
  flagName: string,
  value: boolean,
): Promise<void> {
  if (flagName === "USE_CLOUD_TASKS") {
    throw new Error("GOOGLE_CLOUD_RUNTIME_RETIRED");
  }
  if (RETIRED_FEATURE_FLAGS.has(flagName)) {
    throw new Error("RETIRED_FEATURE_FLAG");
  }
  await getDb().insert(runtimeFeatureFlags).values({
    scopeKey: `global:${flagName}`,
    flagName,
    value,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: runtimeFeatureFlags.scopeKey,
    set: { value, updatedAt: new Date() },
  });
}

/**
 * Read a tenant-scoped feature flag value.
 *
 * Checks the PostgreSQL tenant override first, then the global flag.
 */
export async function getTenantFeatureFlag(
  flagName: string,
  tenantId: string,
): Promise<boolean> {
  if (RETIRED_FEATURE_FLAGS.has(flagName)) {
    return false;
  }
  if (isPlaywrightBackedFlag(flagName) && isPlaywrightGloballyDisabled()) {
    return false;
  }

  const row = (await getDb().select({ value: runtimeFeatureFlags.value })
    .from(runtimeFeatureFlags)
    .where(eq(runtimeFeatureFlags.scopeKey, `tenant:${tenantId}:${flagName}`))
    .limit(1))[0];
  if (row) return row.value === true;

  // Fall back to global flag
  return getFeatureFlag(flagName);
}

/**
 * Write a tenant-scoped feature flag override to PostgreSQL.
 */
export async function setTenantFeatureFlag(
  flagName: string,
  tenantId: string,
  value: boolean,
): Promise<void> {
  if (RETIRED_FEATURE_FLAGS.has(flagName)) {
    throw new Error("RETIRED_FEATURE_FLAG");
  }
  await getDb().insert(runtimeFeatureFlags).values({
    scopeKey: `tenant:${tenantId}:${flagName}`,
    flagName,
    value,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: runtimeFeatureFlags.scopeKey,
    set: { value, updatedAt: new Date() },
  });
}

/** String-valued feature flag keys (not boolean, so separate from TenantFeatureFlags) */
export type StringValuedFeatureFlag = "skillOrchestratorMaxLevel";

/**
 * Read a raw string value from the PostgreSQL feature-flag namespace.
 *
 * Used for string-valued settings like `skillOrchestratorMaxLevel` that cannot
 * be stored in the boolean-only TenantFeatureFlags interface.
 *
 * Returns null if the key is not set (caller should apply its own default).
 */
export async function getTenantFeatureFlagValue(
  flagName: StringValuedFeatureFlag,
  tenantId: string,
): Promise<string | null> {
  const row = (await getDb().select({ value: runtimeFeatureFlags.value })
    .from(runtimeFeatureFlags)
    .where(eq(runtimeFeatureFlags.scopeKey, `tenant:${tenantId}:${flagName}`))
    .limit(1))[0];
  return typeof row?.value === "string" ? row.value : null;
}

/**
 * Write a raw string value to the PostgreSQL feature-flag namespace.
 *
 * Used for string-valued settings like `skillOrchestratorMaxLevel`.
 */
export async function setTenantFeatureFlagValue(
  flagName: StringValuedFeatureFlag,
  tenantId: string,
  value: string,
): Promise<void> {
  await getDb().insert(runtimeFeatureFlags).values({
    scopeKey: `tenant:${tenantId}:${flagName}`,
    flagName,
    value,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: runtimeFeatureFlags.scopeKey,
    set: { value, updatedAt: new Date() },
  });
}
