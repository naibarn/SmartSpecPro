import { TRPCError } from "@trpc/server";
import type {
  MediaAssetType,
  MediaOriginSurface,
  MediaTransport,
  MediaTaskTransportMetadata,
} from "../../shared/mcpConnectTypes";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import { assertMcpSharePolicyAllowed } from "./mcpConnectionSharingService";
import { getDb } from "../db";
import { mcpProviderTemplates } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export interface MediaTransportResolveInput {
  tenantId: string;
  actorUserId: number;
  originSurface: MediaOriginSurface;
  assetType: MediaAssetType;
  requestedTransport?: MediaTransport;
  mcpConnectionId?: string;
  sharedGroupId?: number;
  approvalId?: string;
  providerKey?: string;
  providerModelId?: string;
  model?: string;
  toolName?: string;
  argumentShape?: string;
  idempotencyKey?: string;
}

function surfaceFlag(surface: MediaOriginSurface) {
  switch (surface) {
    case "media_studio":
      return "mcpMediaStudioEnabled";
    case "auto_storyboard_review":
      return "mcpAutoStoryboardReviewEnabled";
    case "marketplace_capture":
      return "mcpMarketplaceCaptureEnabled";
    case "storyboard_review":
      return "mcpStoryboardReviewEnabled";
  }
}

export function defaultMcpToolNameForProvider(input: {
  providerKey?: string | null;
  assetType: MediaAssetType;
}): string {
  const providerKey = String(input.providerKey ?? "").trim().toLowerCase();
  if (providerKey === "higgsfield") {
    return input.assetType === "image" ? "generate_image" : "generate_video";
  }
  if (providerKey === "magnific") {
    return input.assetType === "image" ? "images_generate" : "video_generate";
  }
  return input.assetType === "image" ? "images_generate" : "video_generate";
}

export async function resolveMediaTransport(input: MediaTransportResolveInput): Promise<MediaTaskTransportMetadata> {
  if (!input.requestedTransport || input.requestedTransport === "gateway_api") {
    if (input.mcpConnectionId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "mcpConnectionId requires transport=mcp" });
    }
    return {
      transport: "gateway_api",
      tenantId: input.tenantId,
      originSurface: input.originSurface,
      assetType: input.assetType,
      actorUserId: input.actorUserId,
      creditPolicy: "smartspec_credits",
      idempotencyKey: input.idempotencyKey,
    };
  }
  const flags = await getTenantFeatureFlags(input.tenantId);
  if (!flags.mcpConnectEnabled || !flags[surfaceFlag(input.originSurface)]) {
    throw new TRPCError({ code: "FORBIDDEN", message: "MCP transport is disabled for this surface" });
  }
  if (input.assetType === "image" && !flags.mcpMediaImageEnabled) {
    throw new TRPCError({ code: "FORBIDDEN", message: "MCP image generation is disabled" });
  }
  if (input.assetType === "video" && !flags.mcpMediaVideoEnabled) {
    throw new TRPCError({ code: "FORBIDDEN", message: "MCP video generation is disabled" });
  }
  if (!flags.mcpProviderCreditsTrackedEnabled) {
    throw new TRPCError({ code: "FORBIDDEN", message: "MCP provider credit tracking is disabled" });
  }
  if (!input.mcpConnectionId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "MCP connection is required" });
  }
  const toolName =
    input.toolName ??
    defaultMcpToolNameForProvider({
      providerKey: input.providerKey,
      assetType: input.assetType,
    });
  const policy = await assertMcpSharePolicyAllowed({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    connectionId: input.mcpConnectionId,
    groupId: input.sharedGroupId,
    assetType: input.assetType,
    toolName,
    model: input.model,
    approvalId: input.approvalId,
  });
  const db = getDb();
  const [providerTemplate] = await db
    .select({
      providerKey: mcpProviderTemplates.providerKey,
      displayName: mcpProviderTemplates.displayName,
    })
    .from(mcpProviderTemplates)
    .where(eq(mcpProviderTemplates.id, policy.connection.providerTemplateId))
    .limit(1);
  if (input.providerKey && providerTemplate?.providerKey && providerTemplate.providerKey !== input.providerKey) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Selected MCP account is for ${providerTemplate.providerKey}, but model requires ${input.providerKey}`,
    });
  }
  return {
    transport: "mcp",
    tenantId: input.tenantId,
    originSurface: input.originSurface,
    assetType: input.assetType,
    actorUserId: input.actorUserId,
    ownerUserId: policy.connection.ownerUserId,
    connectionId: input.mcpConnectionId,
    sharedGroupId: input.sharedGroupId,
    shareId: policy.share?.id,
    connectionScope: policy.scope,
    providerKey: providerTemplate?.providerKey ?? input.providerKey,
    providerDisplayName: providerTemplate?.displayName,
    providerModelId: input.providerModelId,
    toolName,
    argumentShape: input.argumentShape,
    creditPolicy: "provider_credits_tracked",
    idempotencyKey: input.idempotencyKey,
  };
}
