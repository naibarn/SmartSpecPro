export type MediaTransport = "gateway_api" | "mcp";
export type MediaAssetType = "image" | "video";
export type MediaOriginSurface =
  | "media_studio"
  | "auto_storyboard_review"
  | "marketplace_capture"
  | "storyboard_review";
export type McpCreditPolicy = "smartspec_credits" | "provider_credits_tracked";
export type McpConnectionScope = "personal" | "shared";

export interface MediaTaskTransportMetadata {
  transport: MediaTransport;
  originSurface: MediaOriginSurface;
  assetType: MediaAssetType;
  providerKey?: "magnific" | "higgsfield" | string;
  providerDisplayName?: string;
  tenantId?: string;
  actorUserId?: number;
  ownerUserId?: number;
  connectionId?: string;
  shareId?: string;
  sharedGroupId?: number;
  connectionScope?: McpConnectionScope;
  providerJobId?: string;
  providerModelId?: string;
  toolName?: string;
  argumentShape?: string;
  schemaHash?: string;
  attemptCount?: number;
  idempotencyKey?: string;
  creditPolicy: McpCreditPolicy;
  fallback?: {
    approved: boolean;
    fromTransport: "mcp";
    toTransport: "gateway_api";
    approvedByUserId?: number;
    approvedAt?: string;
    reasonCode?: string;
  };
}

export function readMediaTaskTransportMetadata(
  value: unknown,
): MediaTaskTransportMetadata {
  const maybe = value as { transportMetadata?: MediaTaskTransportMetadata } | null | undefined;
  if (maybe?.transportMetadata?.transport) return maybe.transportMetadata;
  return {
    transport: "gateway_api",
    originSurface: "media_studio",
    assetType: "image",
    creditPolicy: "smartspec_credits",
  };
}
