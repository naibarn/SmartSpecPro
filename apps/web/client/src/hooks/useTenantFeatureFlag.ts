/**
 * Hook to check if a Claw tenant feature flag is enabled.
 *
 * Reads tenant featureFlags from the /api/tenant/current endpoint
 * and returns a boolean for the requested flag.
 * Falls back to FEATURE_FLAG_DEFAULTS for missing or unavailable flags.
 *
 * Usage:
 *   const canvasEnabled = useTenantFeatureFlag("canvas");
 *   if (canvasEnabled) { ... }
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FEATURE_FLAG_DEFAULTS,
  type TenantFeatureFlagKey,
} from "@shared/featureFlags.ts";

interface TenantCurrentResponse {
  tenant?: {
    settings?: Record<string, unknown>;
    featureFlags?: Record<string, boolean>;
  };
}

async function fetchTenantCurrent(): Promise<TenantCurrentResponse> {
  const res = await fetch("/api/tenant/current");
  if (!res.ok) return {};
  return res.json();
}

/**
 * Returns whether the given Claw feature flag is enabled for the current tenant.
 *
 * Uses FEATURE_FLAG_DEFAULTS as fallback when the tenant has no override.
 */
export function useTenantFeatureFlag(flag: TenantFeatureFlagKey): boolean {
  const { data } = useQuery({
    queryKey: ["tenant", "current"],
    queryFn: fetchTenantCurrent,
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000,
  });

  const storedFlags = data?.tenant?.featureFlags;

  if (!storedFlags || typeof storedFlags[flag] !== "boolean") {
    return FEATURE_FLAG_DEFAULTS[flag];
  }

  return storedFlags[flag];
}

/**
 * Returns a resolved map of all Claw tenant feature flags.
 *
 * Each flag falls back to FEATURE_FLAG_DEFAULTS when not set.
 */
export function useTenantFeatureFlags(): Record<TenantFeatureFlagKey, boolean> {
  const { data } = useQuery({
    queryKey: ["tenant", "current"],
    queryFn: fetchTenantCurrent,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const storedFlags = data?.tenant?.featureFlags;

  return useMemo(() => {
    const result = { ...FEATURE_FLAG_DEFAULTS };
    if (storedFlags) {
      for (const key of Object.keys(FEATURE_FLAG_DEFAULTS) as TenantFeatureFlagKey[]) {
        const stored = storedFlags[key];
        if (typeof stored === "boolean") {
          result[key] = stored;
        }
      }
    }
    return result;
  }, [storedFlags]);
}
