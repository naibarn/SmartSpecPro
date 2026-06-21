import { and, count, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  groupMembers,
  mcpConnectionGroupShares,
  mcpConnectionUsageEvents,
  mcpMediaTasks,
  mcpSharedVideoApprovals,
  userMcpConnections,
} from "../../drizzle/schema";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import { recordMcpUsageEvent, redactMcpUsageSummary } from "./mcpConnectionService";
import type { MediaAssetType } from "../../shared/mcpConnectTypes";

export interface McpSharePolicyRequest {
  tenantId: string;
  actorUserId: number;
  connectionId: string;
  assetType: MediaAssetType;
  toolName?: string;
  model?: string;
  groupId?: number;
  approvalId?: string;
}

export async function listMcpConnectionShares(params: { tenantId: string; ownerUserId: number; connectionId?: string }) {
  const db = getDb();
  const conditions = [eq(mcpConnectionGroupShares.tenantId, params.tenantId), isNull(mcpConnectionGroupShares.deletedAt)];
  if (params.connectionId) conditions.push(eq(mcpConnectionGroupShares.connectionId, params.connectionId));
  return db
    .select({
      id: mcpConnectionGroupShares.id,
      connectionId: mcpConnectionGroupShares.connectionId,
      groupId: mcpConnectionGroupShares.groupId,
      enabled: mcpConnectionGroupShares.enabled,
      allowedAssetTypes: mcpConnectionGroupShares.allowedAssetTypes,
      allowedTools: mcpConnectionGroupShares.allowedTools,
      allowedModels: mcpConnectionGroupShares.allowedModels,
      dailyUseLimit: mcpConnectionGroupShares.dailyUseLimit,
      concurrencyLimit: mcpConnectionGroupShares.concurrencyLimit,
      requiresVideoApproval: mcpConnectionGroupShares.requiresVideoApproval,
      updatedAt: mcpConnectionGroupShares.updatedAt,
    })
    .from(mcpConnectionGroupShares)
    .innerJoin(userMcpConnections, eq(mcpConnectionGroupShares.connectionId, userMcpConnections.id))
    .where(and(...conditions, eq(userMcpConnections.ownerUserId, params.ownerUserId)))
    .orderBy(desc(mcpConnectionGroupShares.updatedAt));
}

export async function upsertMcpConnectionShare(params: {
  tenantId: string;
  ownerUserId: number;
  connectionId: string;
  groupId: number;
  enabled: boolean;
  allowedAssetTypes: MediaAssetType[];
  allowedTools?: string[];
  allowedModels?: string[];
  dailyUseLimit?: number | null;
  concurrencyLimit?: number | null;
  requiresVideoApproval?: boolean;
}) {
  const flags = await getTenantFeatureFlags(params.tenantId);
  if (!flags.mcpConnectGroupSharingEnabled) {
    throw new TRPCError({ code: "FORBIDDEN", message: "MCP group sharing is disabled" });
  }
  const db = getDb();
  const [connection] = await db
    .select()
    .from(userMcpConnections)
    .where(and(eq(userMcpConnections.id, params.connectionId), eq(userMcpConnections.tenantId, params.tenantId), eq(userMcpConnections.ownerUserId, params.ownerUserId)))
    .limit(1);
  if (!connection) throw new TRPCError({ code: "NOT_FOUND", message: "Connection not found" });

  const [existing] = await db
    .select()
    .from(mcpConnectionGroupShares)
    .where(and(eq(mcpConnectionGroupShares.tenantId, params.tenantId), eq(mcpConnectionGroupShares.connectionId, params.connectionId), eq(mcpConnectionGroupShares.groupId, params.groupId), isNull(mcpConnectionGroupShares.deletedAt)))
    .limit(1);
  const payload = {
    enabled: params.enabled,
    allowedAssetTypes: params.allowedAssetTypes,
    allowedTools: params.allowedTools,
    allowedModels: params.allowedModels,
    dailyUseLimit: params.dailyUseLimit,
    concurrencyLimit: params.concurrencyLimit,
    requiresVideoApproval: params.requiresVideoApproval ?? true,
    updatedAt: new Date(),
    disabledAt: params.enabled ? null : new Date(),
  };
  const [share] = existing
    ? await db.update(mcpConnectionGroupShares).set(payload).where(eq(mcpConnectionGroupShares.id, existing.id)).returning()
    : await db.insert(mcpConnectionGroupShares).values({
        tenantId: params.tenantId,
        connectionId: params.connectionId,
        groupId: params.groupId,
        createdByUserId: params.ownerUserId,
        ...payload,
      }).returning();
  await recordMcpUsageEvent({
    tenantId: params.tenantId,
    connectionId: params.connectionId,
    ownerUserId: params.ownerUserId,
    actorUserId: params.ownerUserId,
    groupId: params.groupId,
    eventType: params.enabled ? "share_update" : "share_disable",
    status: "success",
  });
  return share;
}

export async function assertMcpSharePolicyAllowed(request: McpSharePolicyRequest) {
  const flags = await getTenantFeatureFlags(request.tenantId);
  if (!flags.mcpConnectEnabled) throw new TRPCError({ code: "FORBIDDEN", message: "MCP Connect is disabled" });
  const db = getDb();
  const [connection] = await db
    .select()
    .from(userMcpConnections)
    .where(and(eq(userMcpConnections.id, request.connectionId), eq(userMcpConnections.tenantId, request.tenantId)))
    .limit(1);
  if (!connection || connection.status !== "connected") {
    await recordPolicyDeny(request, "connection_unavailable");
    throw new TRPCError({ code: "FORBIDDEN", message: "MCP connection is not available" });
  }
  if (connection.ownerUserId === request.actorUserId) {
    return { scope: "personal" as const, connection, share: null };
  }
  if (!flags.mcpConnectGroupSharingEnabled || !request.groupId) {
    await recordPolicyDeny(request, "sharing_disabled");
    throw new TRPCError({ code: "FORBIDDEN", message: "MCP shared connection is not available" });
  }
  const [share] = await db
    .select()
    .from(mcpConnectionGroupShares)
    .where(and(eq(mcpConnectionGroupShares.connectionId, request.connectionId), eq(mcpConnectionGroupShares.tenantId, request.tenantId), eq(mcpConnectionGroupShares.groupId, request.groupId), eq(mcpConnectionGroupShares.enabled, true), isNull(mcpConnectionGroupShares.deletedAt)))
    .limit(1);
  if (!share) {
    await recordPolicyDeny(request, "share_not_found");
    throw new TRPCError({ code: "FORBIDDEN", message: "MCP shared connection is not available" });
  }
  const [membership] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, request.groupId), eq(groupMembers.userId, request.actorUserId), eq(groupMembers.status, "active")))
    .limit(1);
  if (!membership) {
    await recordPolicyDeny(request, "inactive_group_member");
    throw new TRPCError({ code: "FORBIDDEN", message: "MCP shared connection is not available" });
  }
  if (!share.allowedAssetTypes.includes(request.assetType)) {
    await recordPolicyDeny(request, "asset_type_denied");
    throw new TRPCError({ code: "FORBIDDEN", message: "MCP shared connection does not allow this asset type" });
  }
  if (request.toolName && share.allowedTools?.length && !share.allowedTools.includes(request.toolName)) {
    await recordPolicyDeny(request, "tool_denied");
    throw new TRPCError({ code: "FORBIDDEN", message: "MCP shared connection does not allow this tool" });
  }
  if (request.model && share.allowedModels?.length && !share.allowedModels.includes(request.model)) {
    await recordPolicyDeny(request, "model_denied");
    throw new TRPCError({ code: "FORBIDDEN", message: "MCP shared connection does not allow this model" });
  }
  await assertShareBudgetAndConcurrency({ request, shareId: share.id, dailyUseLimit: share.dailyUseLimit, concurrencyLimit: share.concurrencyLimit });
  if (request.assetType === "video" && share.requiresVideoApproval) {
    await consumeSharedVideoApproval({ ...request, shareId: share.id, ownerUserId: connection.ownerUserId });
  }
  return { scope: "shared" as const, connection, share };
}

export function resolveMcpDailyWindowStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function assertShareBudgetAndConcurrency(params: {
  request: McpSharePolicyRequest;
  shareId: string;
  dailyUseLimit?: number | null;
  concurrencyLimit?: number | null;
}) {
  const { request } = params;
  const db = getDb();
  if (params.dailyUseLimit && params.dailyUseLimit > 0) {
    const [daily] = await db
      .select({ value: count() })
      .from(mcpMediaTasks)
      .where(and(
        eq(mcpMediaTasks.tenantId, request.tenantId),
        eq(mcpMediaTasks.connectionId, request.connectionId),
        eq(mcpMediaTasks.shareId, params.shareId),
        gte(mcpMediaTasks.createdAt, resolveMcpDailyWindowStart()),
      ));
    if ((daily?.value ?? 0) >= params.dailyUseLimit) {
      await recordPolicyDeny(request, "daily_budget_exceeded");
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "MCP shared connection daily limit reached" });
    }
  }
  if (params.concurrencyLimit && params.concurrencyLimit > 0) {
    const [active] = await db
      .select({ value: count() })
      .from(mcpMediaTasks)
      .where(and(
        eq(mcpMediaTasks.tenantId, request.tenantId),
        eq(mcpMediaTasks.connectionId, request.connectionId),
        eq(mcpMediaTasks.shareId, params.shareId),
        inArray(mcpMediaTasks.status, ["pending", "processing"]),
      ));
    if ((active?.value ?? 0) >= params.concurrencyLimit) {
      await recordPolicyDeny(request, "concurrency_limit_exceeded");
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "MCP shared connection concurrency limit reached" });
    }
  }
}

export async function createSharedVideoApproval(params: {
  tenantId: string;
  connectionId: string;
  shareId: string;
  groupId: number;
  ownerUserId: number;
  actorUserId: number;
  promptHash: string;
  requestHash: string;
  redactedRequestSummary: Record<string, unknown>;
}) {
  const db = getDb();
  const [approval] = await db.insert(mcpSharedVideoApprovals).values({
    ...params,
    redactedRequestSummary: redactMcpUsageSummary(params.redactedRequestSummary),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  }).returning();
  return approval;
}

export async function listSharedVideoApprovals(params: {
  tenantId: string;
  userId: number;
  role: "owner" | "actor";
  status?: "pending" | "approved" | "denied" | "expired" | "used";
}) {
  const db = getDb();
  const conditions = [eq(mcpSharedVideoApprovals.tenantId, params.tenantId)];
  conditions.push(
    params.role === "owner"
      ? eq(mcpSharedVideoApprovals.ownerUserId, params.userId)
      : eq(mcpSharedVideoApprovals.actorUserId, params.userId),
  );
  if (params.status) conditions.push(eq(mcpSharedVideoApprovals.status, params.status));
  return db
    .select()
    .from(mcpSharedVideoApprovals)
    .where(and(...conditions))
    .orderBy(desc(mcpSharedVideoApprovals.createdAt))
    .limit(50);
}

export async function decideSharedVideoApproval(params: {
  tenantId: string;
  ownerUserId: number;
  approvalId: string;
  status: "approved" | "denied";
}) {
  const db = getDb();
  const [approval] = await db
    .update(mcpSharedVideoApprovals)
    .set({ status: params.status, updatedAt: new Date() })
    .where(and(
      eq(mcpSharedVideoApprovals.id, params.approvalId),
      eq(mcpSharedVideoApprovals.tenantId, params.tenantId),
      eq(mcpSharedVideoApprovals.ownerUserId, params.ownerUserId),
      eq(mcpSharedVideoApprovals.status, "pending"),
      gte(mcpSharedVideoApprovals.expiresAt, new Date()),
    ))
    .returning();
  if (!approval) throw new TRPCError({ code: "NOT_FOUND", message: "Approval request not found or already decided" });
  await recordMcpUsageEvent({
    tenantId: params.tenantId,
    connectionId: approval.connectionId,
    ownerUserId: params.ownerUserId,
    actorUserId: approval.actorUserId,
    groupId: approval.groupId,
    eventType: params.status === "approved" ? "approval_approved" : "approval_denied",
    assetType: "video",
    status: params.status,
  });
  return approval;
}

export async function consumeSharedVideoApproval(params: McpSharePolicyRequest & { shareId: string; ownerUserId: number }) {
  if (!params.approvalId) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Owner approval required for shared MCP video" });
  }
  const db = getDb();
  const [approval] = await db
    .update(mcpSharedVideoApprovals)
    .set({ status: "used", consumedAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(mcpSharedVideoApprovals.id, params.approvalId),
      eq(mcpSharedVideoApprovals.tenantId, params.tenantId),
      eq(mcpSharedVideoApprovals.connectionId, params.connectionId),
      eq(mcpSharedVideoApprovals.shareId, params.shareId),
      eq(mcpSharedVideoApprovals.groupId, params.groupId!),
      eq(mcpSharedVideoApprovals.ownerUserId, params.ownerUserId),
      eq(mcpSharedVideoApprovals.actorUserId, params.actorUserId),
      eq(mcpSharedVideoApprovals.status, "approved"),
      gte(mcpSharedVideoApprovals.expiresAt, new Date()),
    ))
    .returning();
  if (!approval) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Owner approval is expired or already used" });
  return approval;
}

async function recordPolicyDeny(request: McpSharePolicyRequest, reason: string) {
  await recordMcpUsageEvent({
    tenantId: request.tenantId,
    connectionId: request.connectionId,
    actorUserId: request.actorUserId,
    groupId: request.groupId,
    eventType: "policy_deny",
    assetType: request.assetType,
    status: reason,
  });
}
