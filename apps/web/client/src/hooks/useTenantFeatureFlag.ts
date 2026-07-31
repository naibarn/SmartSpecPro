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
import { useQuery, queryOptions } from "@tanstack/react-query";
import {
  FEATURE_FLAG_DEFAULTS,
  type TenantFeatureFlagKey,
} from "@shared/featureFlags.ts";
import { fetchWithTimeout } from "@/lib/authBootstrap";

interface TenantCurrentResponse {
  tenant?: {
    settings?: Record<string, unknown>;
    featureFlags?: Record<string, boolean>;
  };
}

async function fetchTenantCurrent(): Promise<TenantCurrentResponse> {
  const res = await fetchWithTimeout("/api/tenant/current", {
    credentials: "include",
  });
  if (!res.ok) {
    // Throw instead of returning `{}` so a transient outage (e.g. a 502 from
    // nginx while smartspec-web.service restarts) surfaces as a retryable
    // react-query error rather than a fake-successful empty response. A
    // fake "successful" `{}` would resolve every flag straight to
    // FEATURE_FLAG_DEFAULTS, which is fail-closed for flags such as
    // verticalDramaSeries — incorrectly showing the "not available" denial
    // during a routine restart instead of recovering automatically.
    throw new Error(`tenant/current ${res.status}`);
  }
  return res.json();
}

/**
 * Shared react-query options for the `["tenant", "current"]` query, reused
 * by every hook below so they observe one cached query with identical
 * staleness/retry behavior. Retry twice with capped exponential backoff so a
 * short restart window can recover without leaving a route gate unresolved
 * indefinitely; after that, callers can show an explicit retry action.
 */
const TENANT_CURRENT_QUERY_OPTIONS = queryOptions({
  queryKey: ["tenant", "current"],
  queryFn: fetchTenantCurrent,
  staleTime: 60_000, // 1 minute
  gcTime: 5 * 60_000,
  retry: (failureCount: number) => failureCount < 2,
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 5000),
});

/**
 * Returns the resolved enabled/disabled state of a Claw feature flag along
 * with whether the underlying tenant query has definitively resolved
 * (`isResolved`).
 *
 * Callers that must not show a fail-closed "not available" denial while the
 * flag's true state is still unknown (query loading, or the backend is
 * briefly unreachable) should gate on `isResolved` before trusting
 * `enabled === false`.
 */
export function useTenantFeatureFlagStatus(flag: TenantFeatureFlagKey): {
  enabled: boolean;
  isResolved: boolean;
  isError: boolean;
  retry: () => Promise<unknown>;
} {
  const { data, isSuccess, isError, refetch } = useQuery(
    TENANT_CURRENT_QUERY_OPTIONS,
  );

  const storedFlags = data?.tenant?.featureFlags;
  const enabled =
    !storedFlags || typeof storedFlags[flag] !== "boolean"
      ? FEATURE_FLAG_DEFAULTS[flag]
      : storedFlags[flag];

  return { enabled, isResolved: isSuccess, isError, retry: refetch };
}

/**
 * Returns whether the given Claw feature flag is enabled for the current tenant.
 *
 * Uses FEATURE_FLAG_DEFAULTS as fallback when the tenant has no override.
 */
export function useTenantFeatureFlag(flag: TenantFeatureFlagKey): boolean {
  return useTenantFeatureFlagStatus(flag).enabled;
}

/**
 * Returns a resolved map of all Claw tenant feature flags.
 *
 * Each flag falls back to FEATURE_FLAG_DEFAULTS when not set.
 */
export function useTenantFeatureFlags(): Record<TenantFeatureFlagKey, boolean> {
  const { data } = useQuery(TENANT_CURRENT_QUERY_OPTIONS);

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
