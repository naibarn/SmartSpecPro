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

import { useEffect, useMemo } from "react";
import { useQuery, queryOptions } from "@tanstack/react-query";
import {
  FEATURE_FLAG_DEFAULTS,
  type TenantFeatureFlagKey,
} from "@shared/featureFlags.ts";
import { fetchWithTimeout } from "@/lib/authBootstrap";
import {
  clearTenantServiceRecoveryState,
  isTransientTenantServiceError,
  removeTenantServiceRecoveryQueryParam,
  TENANT_SERVICE_RECOVERY_QUERY_PARAM,
} from "@/lib/tenantServiceRecovery";

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
    const error = new Error(`tenant/current ${res.status}`) as Error & {
      status: number;
    };
    error.status = res.status;
    throw error;
  }
  return res.json();
}

/**
 * Shared react-query options for the `["tenant", "current"]` query, reused
 * by every hook below so they observe one cached query with identical
 * staleness behavior. Retry policy is inherited from the application's shared
 * query client so transient service restarts get the full idempotent-query
 * recovery budget without changing the policy in test clients.
 */
const TENANT_CURRENT_QUERY_OPTIONS = queryOptions({
  queryKey: ["tenant", "current"],
  queryFn: fetchTenantCurrent,
  staleTime: 60_000, // 1 minute
  gcTime: 5 * 60_000,
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
  error: unknown;
  isTransientError: boolean;
  retry: () => Promise<unknown>;
} {
  const { data, isSuccess, isError, error, refetch } = useQuery(
    TENANT_CURRENT_QUERY_OPTIONS,
  );

  useEffect(() => {
    if (!isSuccess) return;
    clearTenantServiceRecoveryState();

    if (typeof window !== "undefined") {
      try {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.has(TENANT_SERVICE_RECOVERY_QUERY_PARAM)) {
          window.history.replaceState(
            window.history.state,
            "",
            removeTenantServiceRecoveryQueryParam(window.location.href),
          );
        }
      } catch {
        // URL cleanup is cosmetic; route rendering must continue if unavailable.
      }
    }
  }, [isSuccess]);

  const storedFlags = data?.tenant?.featureFlags;
  const enabled =
    !storedFlags || typeof storedFlags[flag] !== "boolean"
      ? FEATURE_FLAG_DEFAULTS[flag]
      : storedFlags[flag];

  return {
    enabled,
    isResolved: isSuccess,
    isError,
    error,
    isTransientError: isError && isTransientTenantServiceError(error),
    retry: refetch,
  };
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
