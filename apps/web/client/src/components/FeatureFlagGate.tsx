/**
 * FeatureFlagGate
 *
 * Conditionally renders children based on a Claw tenant feature flag.
 *
 * Props:
 *   flag: TenantFeatureFlagKey — which flag to check
 *   fallback?: ReactNode — content to render when flag is disabled (default: null)
 *   children: ReactNode — content to render when flag is enabled
 *
 * Falls back to FEATURE_FLAG_DEFAULTS when tenant context is unavailable.
 */

import type { ReactNode } from "react";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import type { TenantFeatureFlagKey } from "@shared/featureFlags";

interface FeatureFlagGateProps {
  flag: TenantFeatureFlagKey;
  fallback?: ReactNode;
  children: ReactNode;
}

export function FeatureFlagGate({ flag, fallback = null, children }: FeatureFlagGateProps) {
  const enabled = useTenantFeatureFlag(flag);
  return enabled ? <>{children}</> : <>{fallback}</>;
}
