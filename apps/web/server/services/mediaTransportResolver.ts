import { TRPCError } from "@trpc/server";
import type {
  MediaAssetType,
  MediaOriginSurface,
  MediaTransport,
  MediaTaskTransportMetadata,
} from "../../shared/mcpConnectTypes";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import { assertMcpSharePolicyAllowed } from "./mcpConnectionSharingService";
import { listMcpConnections } from "./mcpConnectionService";
import { getDb } from "../db";
import { mcpProviderTemplates } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
// Feature 135 — Hermes Grok media worker transport arm. `getHermesWorkerSettings`
// is the global kill switch reader; `formatHermesErrorMessage` is the shared
// typed error-code wire convention (section 01). This resolver performs no DB
// reads and no connection-ownership checks for the hermes_worker arm — the
// hermes media scheduler (section 05) is the single authority for that.
import { getHermesWorkerSettings } from "./hermesWorkerSettings";
import { formatHermesErrorMessage } from "../../shared/hermesMedia";

export interface MediaTransportResolveInput {
  tenantId: string;
  actorUserId: number;
  originSurface: MediaOriginSurface;
  assetType: MediaAssetType;
  requestedTransport?: MediaTransport;
  mcpConnectionId?: string;
  hermesConnectionId?: string;
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
    if (input.hermesConnectionId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "hermesConnectionId requires transport=hermes_worker" });
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

  // Feature 135 — Hermes Grok media worker transport arm. Inserted after the
  // gateway early-return and before any MCP flag logic below. Shallow
  // validation only — no DB reads, no connection ownership check. The
  // hermes media scheduler (section 05) is the single authority that
  // authorizes/admits a specific hermesConnectionId; duplicating that check
  // here would create two sources of truth.
  if (input.requestedTransport === "hermes_worker") {
    if (input.mcpConnectionId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "mcpConnectionId requires transport=mcp" });
    }
    const flags = await getTenantFeatureFlags(input.tenantId);
    if (!flags.hermesMediaWorker) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: formatHermesErrorMessage("HERMES_DISABLED", "tenant flag disabled"),
      });
    }
    const settings = await getHermesWorkerSettings();
    if (!settings.enabled) {
      // Global kill switch. The hermes media scheduler re-checks per-scope
      // flags on submit — duplication here is deliberate defense in depth.
      throw new TRPCError({
        code: "FORBIDDEN",
        message: formatHermesErrorMessage("HERMES_DISABLED", "worker disabled"),
      });
    }
    if (!input.hermesConnectionId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: formatHermesErrorMessage("HERMES_CONNECTION_REQUIRED"),
      });
    }
    return {
      transport: "hermes_worker",
      tenantId: input.tenantId,
      originSurface: input.originSurface,
      assetType: input.assetType,
      actorUserId: input.actorUserId,
      connectionId: input.hermesConnectionId,
      providerKey: "hermes-grok",
      providerModelId: input.providerModelId,
      creditPolicy: "provider_account",
      idempotencyKey: input.idempotencyKey,
    };
  }

  // MCP branch (requestedTransport === "mcp"): a request can never carry
  // both connection ids.
  if (input.hermesConnectionId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "hermesConnectionId requires transport=hermes_worker" });
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
  // Browser/localStorage state is never authoritative for MCP execution.
  // Always query the actor's current personal + actively shared connections.
  // `listMcpConnections` enforces tenant/owner or enabled-share + ACTIVE group
  // membership, and `assertMcpSharePolicyAllowed` below revalidates the chosen
  // row plus its tool/model/budget policy immediately before task creation.
  const eligible = (
    await listMcpConnections({ tenantId: input.tenantId, userId: input.actorUserId })
  ).filter((candidate) => (
    candidate.status === "connected" &&
    (!input.providerKey || candidate.providerKey === input.providerKey) &&
    (!candidate.allowedAssetTypes?.length || candidate.allowedAssetTypes.includes(input.assetType))
  ));

  // A physical connection may appear once per active group share. Treat those
  // rows as one provider account for selection; the policy service chooses the
  // actual authorizing share and returns its authoritative group metadata.
  const eligibleById = new Map(eligible.map((candidate) => [candidate.id, candidate]));
  const uniqueEligible = [...eligibleById.values()];
  const callerSelection = input.mcpConnectionId
    ? eligibleById.get(input.mcpConnectionId)
    : undefined;
  const personalDefault = uniqueEligible.find((candidate) => (
    candidate.connectionScope === "personal" &&
    (input.assetType === "image" ? candidate.defaultForImage : candidate.defaultForVideo)
  ));
  const resolved =
    uniqueEligible.length === 1
      ? uniqueEligible[0]
      : callerSelection ?? personalDefault;
  if (!resolved) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: uniqueEligible.length > 1
        ? `Select an MCP account — several ${input.providerKey ?? "MCP"} accounts are available.`
        : `This model requires a connected ${input.providerKey ?? "MCP"} MCP account. Connect one (or ask the owner to share theirs with your group) first.`,
    });
  }
  const connectionId = resolved.id;
  const toolName =
    input.toolName ??
    defaultMcpToolNameForProvider({
      providerKey: input.providerKey,
      assetType: input.assetType,
    });
  const policy = await assertMcpSharePolicyAllowed({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    connectionId,
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
    connectionId,
    // Use the group the policy actually resolved (see
    // `assertMcpSharePolicyAllowed`) so task metadata + usage events record the
    // authorizing group even when the client submitted no/stale `sharedGroupId`
    // — falls back to the client value for owner/personal use where there's no
    // share.
    sharedGroupId: policy.share?.groupId ?? input.sharedGroupId,
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
