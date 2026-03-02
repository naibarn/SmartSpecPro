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
  if (!storedFlags) {
    return { ...FEATURE_FLAG_DEFAULTS };
  }

  const result = { ...FEATURE_FLAG_DEFAULTS };

  for (const key of Object.keys(FEATURE_FLAG_DEFAULTS) as TenantFeatureFlagKey[]) {
    const stored = storedFlags[key];
    if (typeof stored === "boolean") {
      result[key] = stored;
    }
  }

  return result;
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
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  return db.transaction(async (tx) => {
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
    const merged: TenantFeatureFlags = { ...currentFlags, ...flagUpdates };

    // Step 3: Write back only the featureFlags column
    await tx
      .update(tenants)
      .set({ featureFlags: merged as unknown as Record<string, boolean> })
      .where(eq(tenants.id, tenantId));

    return merged;
  });
}
