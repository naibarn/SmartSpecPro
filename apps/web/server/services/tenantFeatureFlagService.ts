/**
 * Tenant Feature Flag Service
 *
 * Provides utility functions for validating, reading, and writing
 * tenant feature flags stored in tenants.featureFlags (JSON column).
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { tenants } from "../../drizzle/schema";
import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  type TenantFeatureFlagKey,
  type TenantFeatureFlags,
} from "../../shared/featureFlags";
import { assertBrowserPolicyFeaturePromotionReady } from "./browserPolicyReleaseControl";
import { setTenantFeatureFlag } from "./featureFlags";

const FALSE_ENV_VALUES = new Set(["0", "false", "no", "off", "disabled"]);

function isPlaywrightGloballyEnabled(): boolean {
  const raw = process.env.SMARTSPEC_PLAYWRIGHT_ENABLED ?? "true";
  return !FALSE_ENV_VALUES.has(raw.trim().toLowerCase());
}

function applyPlaywrightGlobalKillSwitch(flags: TenantFeatureFlags): TenantFeatureFlags {
  if (isPlaywrightGloballyEnabled()) {
    return flags;
  }

  return {
    ...flags,
    browserTool: false,
    automationCopilot: false,
    liveBrowser: false,
    chatBrowserSessionEntry: false,
    agencyBrowserSessionUi: false,
    workflowBrowserSessionNodes: false,
  };
}

/**
 * Flag keys that are also checked via Redis by backend route guards.
 * When these flags are updated in the DB, we sync to Redis so that
 * getTenantFeatureFlag() in featureFlags.ts picks up the admin toggle.
 */
const REDIS_SYNCED_FLAGS: ReadonlySet<TenantFeatureFlagKey> = new Set<TenantFeatureFlagKey>([
  "browserTool",
  "automationCopilot",
  "liveBrowser",
  "responsesApi",
  "chatWidget",
  "webhookTriggers",
  "voiceChat",
  "channelRouter",
  "taskPlannerEnabled",
  "taskPlannerAgencyEscalation",
  "chatBrowserSessionEntry",
  "agencyBrowserSessionUi",
  "workflowBrowserSessionNodes",
  "publicApi",
  "multimodalMemory",
  "skillOrchestrator",
  "agencyCustomTools",
  "agencyGuardrails",
  "agencyStreaming",
  "agencyMcpBridge",
  "agencyToolApi",
  "UPLOAD_POST_GATEWAY_ENABLED",
  "localClientLlmMode",
  "workerLocalLlmModels",
  "openClawExternalRuntime",
  "desktopZeroClawWorker",
  "nemoClawSecureWorkerPool",
  "hiClawClusterRuntime",
  "desktopHostEnabled",
  "desktopAdvancedLocalMode",
  "desktopPackageSync",
  "desktopAgencyRuntime",
  "desktopWorkerProjection",
  "remotionDedicatedExecutorEnabled",
  "agencyHybridAdk",
  "agencyHybridAdkKillSwitch",
  "documentOcrExternalProcessing",
  "agentRegistryEnabled",
  "voiceAgents",
  "marketplaceHyperframesEnabled",
  "marketplaceHyperframesWorkerEnabled",
  "hyperframesWorkerFinalComposite",
  "marketplaceHyperframesLibrarySaveEnabled",
  "marketplaceHyperframesOperatorEnabled",
  "storyboardPreviewMatchCaptureEnabled",
  "storyboardPreviewMatchCaptureServerWorkerEnabled",
  "storyboardPreviewMatchCaptureHighEnabled",
  "storyboardClientCaptureExperimentEnabled",
  "mcpConnectEnabled",
  "mcpModernProtocolEnabled",
  "mcpLegacyCompatibilityEnabled",
  "mcpResourcesEnabled",
  "mcpGuideToolAliasesEnabled",
  "mcpOAuthProtectedResourceEnabled",
  "mcpOAuthAuthorizationServerEnabled",
  "mcpOAuthDynamicRegistrationEnabled",
  "mcpOAuthCimdEnabled",
  "mcpModernStatelessLegacyFallbackEnabled",
  "mcpTasksEnabled",
  "mcpSubscriptionsEnabled",
  "mcpLegacyBroadScopeCompatibilityEnabled",
  "mcpConnectMagnificEnabled",
  "mcpConnectHiggsfieldEnabled",
  "mcpConnectGroupSharingEnabled",
  "mcpMediaStudioEnabled",
  "mcpAutoStoryboardReviewEnabled",
  "mcpMarketplaceCaptureEnabled",
  "mcpStoryboardReviewEnabled",
  "mcpMediaImageEnabled",
  "mcpMediaVideoEnabled",
  "mcpToolSchemaCacheEnabled",
  "mcpAutoFallbackToGatewayApiEnabled",
  "mcpProviderCreditsTrackedEnabled",
  "META_CHANNELS_ENABLED",
]);

/**
 * Validate and sanitize a raw feature flags input.
 *
 * Strips unrecognized keys (those not in ALLOWED_FEATURE_FLAGS).
 * Validates that all values are booleans.
 * Returns only the recognized, valid keys.
 */
export function validateFeatureFlags(
  input: Record<string, unknown>,
): Partial<TenantFeatureFlags> {
  const result: Partial<TenantFeatureFlags> = {};

  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_FEATURE_FLAGS.has(key)) {
      continue; // Strip unrecognized keys silently
    }

    const parsed = z.boolean().safeParse(value);
    if (!parsed.success) {
      continue; // Strip non-boolean values
    }

    result[key as TenantFeatureFlagKey] = parsed.data;
  }

  return result;
}

/**
 * Resolve a complete TenantFeatureFlags from a raw DB value.
 *
 * Merges the stored flags with FEATURE_FLAG_DEFAULTS for any missing keys.
 */
export function resolveFeatureFlags(
  storedFlags: Record<string, boolean> | null | undefined,
): TenantFeatureFlags {
  let resolved: TenantFeatureFlags;
  if (!storedFlags) {
    resolved = { ...FEATURE_FLAG_DEFAULTS };
  } else {
    resolved = { ...FEATURE_FLAG_DEFAULTS };

    for (const key of Object.keys(FEATURE_FLAG_DEFAULTS) as TenantFeatureFlagKey[]) {
      const stored = storedFlags[key];
      if (typeof stored === "boolean") {
        resolved[key] = stored;
      }
    }
  }

  return applyPlaywrightGlobalKillSwitch(resolved);
}

/**
 * Check if a single feature flag is enabled for the given stored flags.
 *
 * Falls back to FEATURE_FLAG_DEFAULTS for missing or null flags.
 */
export function isFeatureEnabled(
  storedFlags: Record<string, boolean> | null | undefined,
  flag: TenantFeatureFlagKey,
): boolean {
  if (!storedFlags || typeof storedFlags[flag] !== "boolean") {
    return FEATURE_FLAG_DEFAULTS[flag];
  }
  return storedFlags[flag];
}

/**
 * Read the current feature flags for a tenant from the database.
 */
export async function getTenantFeatureFlags(
  tenantId: string,
): Promise<TenantFeatureFlags> {
  const db = await getDb();
  if (!db) {
    return { ...FEATURE_FLAG_DEFAULTS };
  }

  const [row] = await db
    .select({ featureFlags: tenants.featureFlags })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!row) {
    return { ...FEATURE_FLAG_DEFAULTS };
  }

  return resolveFeatureFlags(row.featureFlags as Record<string, boolean> | null);
}

/**
 * Update tenant feature flags using a read-modify-write pattern wrapped in a
 * transaction to prevent lost updates from concurrent modifications.
 *
 * Only the provided flag keys are changed; all others remain as-is.
 * Returns the complete resolved TenantFeatureFlags after the update.
 */
export async function updateTenantFeatureFlags(
  tenantId: string,
  flagUpdates: Partial<TenantFeatureFlags>,
): Promise<TenantFeatureFlags> {
  for (const [key, value] of Object.entries(flagUpdates) as [TenantFeatureFlagKey, boolean][]) {
    await assertBrowserPolicyFeaturePromotionReady({
      tenantId,
      flagName: key,
      nextValue: value,
    });
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  const merged = await db.transaction(async (tx) => {
    // Step 1: Read current flags inside transaction
    const [row] = await tx
      .select({ featureFlags: tenants.featureFlags })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!row) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    // Step 2: Merge updates into existing flags
    const currentFlags = resolveFeatureFlags(
      row.featureFlags as Record<string, boolean> | null,
    );
    const result: TenantFeatureFlags = { ...currentFlags, ...flagUpdates };

    // Step 3: Write back only the featureFlags column
    await tx
      .update(tenants)
      .set({ featureFlags: result as unknown as Record<string, boolean> })
      .where(eq(tenants.id, tenantId));

    return result;
  });

  // Step 4: Sync changed flags to Redis (outside transaction — best-effort)
  // This bridges the admin panel (DB) with backend route guards (Redis).
  const syncPromises: Promise<void>[] = [];
  for (const [key, value] of Object.entries(flagUpdates) as [TenantFeatureFlagKey, boolean][]) {
    if (REDIS_SYNCED_FLAGS.has(key)) {
      syncPromises.push(
        setTenantFeatureFlag(key, tenantId, value).catch(() => {
          // Redis sync is best-effort — DB is the source of truth
        }),
      );
    }
  }
  if (syncPromises.length > 0) {
    await Promise.all(syncPromises);
  }

  return merged;
}
