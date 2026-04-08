import type {
  LocalAiCatalogEntry,
  LocalAiPlatform,
  LocalAiPolicy,
  LocalAiPolicyCatalogResponse,
} from "../../../../packages/local-ai-core/src/index";
import type { TenantFeatureFlags as AppTenantFeatureFlags } from "../../shared/featureFlags";
import { listLocalAiCatalog } from "./localAiCatalog";

export function resolveLocalAiPolicy(input: {
  tenantFlags: Pick<AppTenantFeatureFlags, "localClientLlmMode">;
  platform: LocalAiPlatform;
  forceCloudOnly?: boolean;
  allowProfileIds?: string[] | null;
  revokedProfileIds?: string[];
}): LocalAiPolicyCatalogResponse {
  const forceCloudOnly = input.forceCloudOnly === true;

  if (!input.tenantFlags.localClientLlmMode) {
    return {
      policy: {
        state: "tenant_disabled",
        featureEnabled: false,
        forceCloudOnly: true,
        defaultExecutionMode: "off",
        allowedProfileIds: null,
        reason: "tenant_disabled",
      },
      catalog: [],
    };
  }

  const allowSet =
    Array.isArray(input.allowProfileIds) && input.allowProfileIds.length > 0
      ? new Set(input.allowProfileIds)
      : null;
  const revokedSet = new Set(input.revokedProfileIds ?? []);

  const catalog = listLocalAiCatalog(input.platform)
    .filter((entry) => (allowSet ? allowSet.has(entry.id) : true))
    .map((entry): LocalAiCatalogEntry => {
      if (!revokedSet.has(entry.id)) {
        return entry;
      }
      return {
        ...entry,
        status: "revoked",
        statusReason: "revoked_by_policy",
      };
    });

  return {
    policy: {
      state: forceCloudOnly ? "force_cloud_only" : "enabled",
      featureEnabled: true,
      forceCloudOnly,
      defaultExecutionMode: forceCloudOnly ? "cloud_only" : "auto",
      allowedProfileIds: allowSet ? [...allowSet] : null,
      reason: forceCloudOnly ? "force_cloud_only" : null,
    },
    catalog,
  };
}
