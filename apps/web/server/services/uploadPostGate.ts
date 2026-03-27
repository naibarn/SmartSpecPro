import { TRPCError } from "@trpc/server";

import { getTenantFeatureFlags } from "./tenantFeatureFlagService";

export async function assertUploadPostGatewayEnabled(tenantId: string): Promise<void> {
  const flags = await getTenantFeatureFlags(tenantId);
  if (!flags.UPLOAD_POST_GATEWAY_ENABLED) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Upload-Post Gateway is not enabled for this tenant",
    });
  }
}

export async function isUploadPostGatewayEnabled(tenantId: string): Promise<boolean> {
  const flags = await getTenantFeatureFlags(tenantId);
  return flags.UPLOAD_POST_GATEWAY_ENABLED;
}
