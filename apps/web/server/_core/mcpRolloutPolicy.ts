import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import { getCachedMcpRuntimeConfig } from "../services/mcpRuntimeConfig";

export type McpRolloutPolicy = {
  modern: boolean;
  legacy: boolean;
  resources: boolean;
  guideAliases: boolean;
  protectedResourceMetadata: boolean;
  authorizationServer: boolean;
  modernStatelessLegacyFallback: boolean;
  tasks: false;
  subscriptions: false;
  legacyBroadScopeCompatibility: boolean;
};

const SENSITIVE_DEFAULTS: McpRolloutPolicy = {
  modern: false,
  legacy: true,
  resources: false,
  guideAliases: false,
  protectedResourceMetadata: false,
  authorizationServer: false,
  modernStatelessLegacyFallback: false,
  tasks: false,
  subscriptions: false,
  legacyBroadScopeCompatibility: true,
};

/**
 * Resolve the MCP rollout policy from the deployment kill switch and the
 * authenticated tenant.  New capabilities fail closed when the feature store
 * cannot provide a tenant decision; legacy compatibility remains available so
 * existing clients are not silently removed during migration.
 */
export async function resolveMcpRolloutPolicy(tenantId: string | null | undefined): Promise<McpRolloutPolicy> {
  const runtime = getCachedMcpRuntimeConfig();
  if (!tenantId) {
    return {
      ...SENSITIVE_DEFAULTS,
      modern: false,
      resources: false,
      guideAliases: false,
    };
  }

  try {
    const flags = await getTenantFeatureFlags(tenantId);
    return {
      modern: runtime.modernProtocolEnabled && flags.mcpModernProtocolEnabled,
      legacy: flags.mcpLegacyCompatibilityEnabled,
      resources: flags.mcpResourcesEnabled,
      guideAliases: flags.mcpGuideToolAliasesEnabled,
      protectedResourceMetadata: flags.mcpOAuthProtectedResourceEnabled,
      authorizationServer: runtime.oauthAuthorizationServerEnabled && flags.mcpOAuthAuthorizationServerEnabled,
      modernStatelessLegacyFallback: flags.mcpModernStatelessLegacyFallbackEnabled,
      tasks: false,
      subscriptions: false,
      legacyBroadScopeCompatibility: flags.mcpLegacyBroadScopeCompatibilityEnabled,
    };
  } catch {
    return { ...SENSITIVE_DEFAULTS };
  }
}

export function mcpTenantIdFromAuth(auth: any): string | null {
  const tenantId = auth?.tenantId || auth?.user?.currentTenantId;
  return typeof tenantId === "string" && tenantId.trim() ? tenantId.trim() : null;
}

export function mcpRolloutError(policyKey: "modern" | "legacy" | "resources" | "guideAliases") {
  const labels = {
    modern: "Modern MCP protocol is not enabled for this tenant",
    legacy: "Legacy MCP compatibility is not enabled for this tenant",
    resources: "MCP documentation resources are not enabled for this tenant",
    guideAliases: "MCP guide aliases are not enabled for this tenant",
  } as const;
  return { code: -32004, message: labels[policyKey] };
}
