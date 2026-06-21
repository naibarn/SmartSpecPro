import type { MediaTaskTransportMetadata } from "../../shared/mcpConnectTypes";

// Higgsfield's web UI exposes "Enhanced Seedance 2.0 Fast Unlimited"
// as a web/account entitlement. MCP does not accept `seedance_unlimited`
// as a provider-native generation model, and it must not be silently routed
// to Seedance Fast because the user sees different credit behavior.
const HIGGSFIELD_LEGACY_VIDEO_MODEL_ALIASES: Record<string, string> = {};

export function normalizeMcpProviderModelIdForProvider(input: {
  providerKey?: string | null;
  providerModelId?: string | null;
  assetType?: MediaTaskTransportMetadata["assetType"] | null;
  argumentShape?: string | null;
}): string | undefined {
  const rawValue = typeof input.providerModelId === "string"
    ? input.providerModelId.trim()
    : "";
  if (!rawValue) return undefined;

  const providerKey = String(input.providerKey ?? "").trim().toLowerCase();
  const argumentShape = String(input.argumentShape ?? "").trim().toLowerCase();
  const isHiggsfieldVideo =
    providerKey === "higgsfield" ||
    argumentShape === "higgsfield.generate_video";
  if (isHiggsfieldVideo && input.assetType === "video") {
    return HIGGSFIELD_LEGACY_VIDEO_MODEL_ALIASES[rawValue] ?? rawValue;
  }

  return rawValue;
}
