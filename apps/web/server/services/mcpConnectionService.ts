import { and, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  mcpProviderTemplates,
  userMcpConnections,
  mcpConnectionGroupShares,
  mcpConnectionUsageEvents,
  groupMembers,
  type UserMcpConnection,
} from "../../drizzle/schema";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import { completeMcpOAuth, startMcpOAuth } from "./mcpOAuthBroker";
import { getMcpProviderTemplateSeed, type McpProviderKey } from "./mcpProviderRegistry";
import type { MediaAssetType } from "../../shared/mcpConnectTypes";

export interface SafeMcpConnection {
  id: string;
  providerKey: string;
  providerDisplayName: string;
  displayName: string;
  status: string;
  providerAccountLabel: string | null;
  defaultForImage: boolean;
  defaultForVideo: boolean;
  createdAt: Date;
  updatedAt: Date;
  tokenExpiresAt: Date | null;
  ownerUserId: number;
  connectionScope: "personal" | "shared";
  sharedGroupId?: number;
  shareId?: string;
  allowedAssetTypes?: MediaAssetType[];
}

function tenantRequired(tenantId: string | undefined | null): string {
  if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
  return tenantId;
}

export async function assertMcpConnectProviderEnabled(tenantId: string, providerKey: McpProviderKey) {
  const flags = await getTenantFeatureFlags(tenantId);
  if (!flags.mcpConnectEnabled) throw new TRPCError({ code: "FORBIDDEN", message: "MCP Connect is disabled" });
  const providerFlag = providerKey === "magnific" ? "mcpConnectMagnificEnabled" : "mcpConnectHiggsfieldEnabled";
  if (!flags[providerFlag]) throw new TRPCError({ code: "FORBIDDEN", message: "MCP provider is disabled" });
}

async function assertMcpProviderTemplateEnabled(providerKey: McpProviderKey) {
  const db = getDb();
  const [template] = await db
    .select({
      id: mcpProviderTemplates.id,
      providerKey: mcpProviderTemplates.providerKey,
      displayName: mcpProviderTemplates.displayName,
      mcpUrl: mcpProviderTemplates.mcpUrl,
      allowedAssetTypes: mcpProviderTemplates.allowedAssetTypes,
      isEnabled: mcpProviderTemplates.isEnabled,
    })
    .from(mcpProviderTemplates)
    .where(eq(mcpProviderTemplates.providerKey, providerKey))
    .limit(1);
  if (!template) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "MCP provider template is not seeded" });
  }
  if (!template.isEnabled) {
    throw new TRPCError({ code: "FORBIDDEN", message: "MCP provider template is disabled" });
  }
  return template;
}

export async function listMcpProviderTemplates(tenantId?: string | null) {
  const db = getDb();
  let rows: Array<{
    id: string;
    providerKey: string;
    displayName: string;
    mcpUrl: string;
    allowedAssetTypes: MediaAssetType[];
    isEnabled: boolean;
  }> = [];
  try {
    rows = await db
      .select({
        id: mcpProviderTemplates.id,
        providerKey: mcpProviderTemplates.providerKey,
        displayName: mcpProviderTemplates.displayName,
        mcpUrl: mcpProviderTemplates.mcpUrl,
        allowedAssetTypes: mcpProviderTemplates.allowedAssetTypes,
        isEnabled: mcpProviderTemplates.isEnabled,
      })
      .from(mcpProviderTemplates)
      .orderBy(mcpProviderTemplates.displayName);
  } catch {
    rows = [];
  }
  const fallback = rows.length > 0
    ? rows
    : (["magnific", "higgsfield"] as const).map((key) => ({
        id: key,
        ...getMcpProviderTemplateSeed(key),
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
  return fallback.map((row: any) => ({
    id: row.id,
    providerKey: row.providerKey,
    displayName: row.displayName,
    mcpUrl: row.mcpUrl,
    allowedAssetTypes: row.allowedAssetTypes,
    isEnabled: Boolean(row.isEnabled),
  }));
}

export async function startConnectionOAuth(params: {
  tenantId?: string | null;
  userId: number;
  providerKey: McpProviderKey;
  reconnectConnectionId?: string;
  publicUrl?: string | null;
}) {
  const tenantId = tenantRequired(params.tenantId);
  return startMcpOAuth({
    tenantId,
    userId: params.userId,
    providerKey: params.providerKey,
    reconnectConnectionId: params.reconnectConnectionId,
    publicUrl: params.publicUrl,
  });
}

export async function completeConnectionOAuth(params: {
  tenantId?: string | null;
  userId: number;
  providerKey: McpProviderKey;
  code: string;
  state: string;
}) {
  const tenantId = tenantRequired(params.tenantId);
  await assertMcpConnectProviderEnabled(tenantId, params.providerKey);
  const template = await assertMcpProviderTemplateEnabled(params.providerKey);
  const session = await completeMcpOAuth({
    tenantId,
    userId: params.userId,
    providerKey: params.providerKey,
    code: params.code,
    state: params.state,
  });
  const db = getDb();
  if (session.reconnectConnectionId) {
    const [connection] = await db
      .update(userMcpConnections)
      .set({
        status: "connected",
        encryptedTokenRef: session.encryptedTokenRef,
        encryptionKeyVersion: session.encryptionKeyVersion,
        providerAccountLabel: session.providerAccountLabel,
        providerAccountHash: session.providerAccountHash,
        scopes: session.scopes,
        tokenExpiresAt: session.tokenExpiresAt,
        lastErrorCode: null,
        lastErrorAt: null,
        lastHealthCheckAt: new Date(),
        revokedAt: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(userMcpConnections.id, session.reconnectConnectionId),
        eq(userMcpConnections.tenantId, tenantId),
        eq(userMcpConnections.ownerUserId, params.userId),
        eq(userMcpConnections.providerTemplateId, template.id),
      ))
      .returning();
    if (!connection) throw new TRPCError({ code: "NOT_FOUND", message: "MCP connection to reconnect was not found" });
    await recordMcpUsageEvent({
      tenantId,
      connectionId: connection.id,
      ownerUserId: params.userId,
      actorUserId: params.userId,
      eventType: "reconnect",
      providerKey: params.providerKey,
      status: "success",
    });
    return toSafeConnection(connection as UserMcpConnection, template.providerKey, template.displayName);
  }
  const [connection] = await db
    .insert(userMcpConnections)
    .values({
      tenantId,
      ownerUserId: params.userId,
      providerTemplateId: template.id,
      displayName: `${template.displayName} connection`,
      status: "connected",
      encryptedTokenRef: session.encryptedTokenRef,
      encryptionKeyVersion: session.encryptionKeyVersion,
      providerAccountLabel: session.providerAccountLabel,
      providerAccountHash: session.providerAccountHash,
      scopes: session.scopes,
      tokenExpiresAt: session.tokenExpiresAt,
    })
    .returning();
  await recordMcpUsageEvent({
    tenantId,
    connectionId: connection.id,
    ownerUserId: params.userId,
    actorUserId: params.userId,
    eventType: "connect",
    providerKey: params.providerKey,
    status: "success",
  });
  return toSafeConnection(connection as UserMcpConnection, template.providerKey, template.displayName);
}

export async function listMcpConnections(params: { tenantId?: string | null; userId: number }): Promise<SafeMcpConnection[]> {
  const tenantId = tenantRequired(params.tenantId);
  const db = getDb();
  const rows = await db
    .select({ connection: userMcpConnections, template: mcpProviderTemplates })
    .from(userMcpConnections)
    .innerJoin(mcpProviderTemplates, eq(userMcpConnections.providerTemplateId, mcpProviderTemplates.id))
    .where(and(eq(userMcpConnections.tenantId, tenantId), eq(userMcpConnections.ownerUserId, params.userId), isNull(userMcpConnections.revokedAt)))
    .orderBy(desc(userMcpConnections.updatedAt));
  const personal = rows.map(({ connection, template }) => (
    toSafeConnection(connection, template.providerKey, template.displayName, {
      connectionScope: "personal",
      allowedAssetTypes: template.allowedAssetTypes,
    })
  ));

  const sharedRows = await db
    .select({ connection: userMcpConnections, template: mcpProviderTemplates, share: mcpConnectionGroupShares })
    .from(mcpConnectionGroupShares)
    .innerJoin(userMcpConnections, eq(mcpConnectionGroupShares.connectionId, userMcpConnections.id))
    .innerJoin(mcpProviderTemplates, eq(userMcpConnections.providerTemplateId, mcpProviderTemplates.id))
    .innerJoin(groupMembers, and(
      eq(groupMembers.groupId, mcpConnectionGroupShares.groupId),
      eq(groupMembers.userId, params.userId),
      eq(groupMembers.status, "active"),
    ))
    .where(and(
      eq(mcpConnectionGroupShares.tenantId, tenantId),
      eq(mcpConnectionGroupShares.enabled, true),
      isNull(mcpConnectionGroupShares.deletedAt),
      eq(userMcpConnections.tenantId, tenantId),
      eq(userMcpConnections.status, "connected"),
      isNull(userMcpConnections.revokedAt),
      eq(mcpProviderTemplates.isEnabled, true),
    ))
    .orderBy(desc(mcpConnectionGroupShares.updatedAt));

  const personalKeys = new Set(personal.map((connection) => `${connection.id}:personal`));
  const shared = sharedRows
    .map(({ connection, template, share }) => (
      toSafeConnection(connection, template.providerKey, template.displayName, {
        connectionScope: "shared",
        sharedGroupId: share.groupId,
        shareId: share.id,
        allowedAssetTypes: share.allowedAssetTypes.length > 0
          ? share.allowedAssetTypes
          : template.allowedAssetTypes,
      })
    ))
    .filter((connection) => !personalKeys.has(`${connection.id}:personal`));

  return [...personal, ...shared];
}

export async function disconnectMcpConnection(params: { tenantId?: string | null; userId: number; connectionId: string }) {
  const tenantId = tenantRequired(params.tenantId);
  const db = getDb();
  const [connection] = await db
    .update(userMcpConnections)
    .set({
      status: "revoked",
      encryptedTokenRef: null,
      revokedAt: new Date(),
      updatedAt: new Date(),
      defaultForImage: false,
      defaultForVideo: false,
    })
    .where(and(eq(userMcpConnections.id, params.connectionId), eq(userMcpConnections.tenantId, tenantId), eq(userMcpConnections.ownerUserId, params.userId)))
    .returning();
  if (!connection) throw new TRPCError({ code: "NOT_FOUND", message: "Connection not found" });
  await db
    .update(mcpConnectionGroupShares)
    .set({ enabled: false, disabledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(mcpConnectionGroupShares.tenantId, tenantId), eq(mcpConnectionGroupShares.connectionId, params.connectionId)));
  await recordMcpUsageEvent({
    tenantId,
    connectionId: params.connectionId,
    ownerUserId: params.userId,
    actorUserId: params.userId,
    eventType: "disconnect",
    status: "success",
  });
  return { ok: true };
}

export async function updateMcpConnectionDefaults(params: {
  tenantId?: string | null;
  userId: number;
  connectionId: string;
  defaultForImage?: boolean;
  defaultForVideo?: boolean;
}) {
  const tenantId = tenantRequired(params.tenantId);
  const db = getDb();
  const [connection] = await db
    .select()
    .from(userMcpConnections)
    .where(and(eq(userMcpConnections.id, params.connectionId), eq(userMcpConnections.tenantId, tenantId), eq(userMcpConnections.ownerUserId, params.userId)))
    .limit(1);
  if (!connection) throw new TRPCError({ code: "NOT_FOUND", message: "Connection not found" });
  if (connection.revokedAt || connection.status !== "connected" || !connection.encryptedTokenRef) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only connected MCP connections can be used as defaults" });
  }
  if (params.defaultForImage) {
    await db.update(userMcpConnections).set({ defaultForImage: false }).where(and(
      eq(userMcpConnections.tenantId, tenantId),
      eq(userMcpConnections.ownerUserId, params.userId),
      eq(userMcpConnections.providerTemplateId, connection.providerTemplateId),
      isNull(userMcpConnections.revokedAt),
    ));
  }
  if (params.defaultForVideo) {
    await db.update(userMcpConnections).set({ defaultForVideo: false }).where(and(
      eq(userMcpConnections.tenantId, tenantId),
      eq(userMcpConnections.ownerUserId, params.userId),
      eq(userMcpConnections.providerTemplateId, connection.providerTemplateId),
      isNull(userMcpConnections.revokedAt),
    ));
  }
  const [updated] = await db
    .update(userMcpConnections)
    .set({
      defaultForImage: params.defaultForImage ?? connection.defaultForImage,
      defaultForVideo: params.defaultForVideo ?? connection.defaultForVideo,
      updatedAt: new Date(),
    })
    .where(eq(userMcpConnections.id, params.connectionId))
    .returning();
  return updated;
}

export async function testMcpConnection(params: { tenantId?: string | null; userId: number; connectionId: string }) {
  const tenantId = tenantRequired(params.tenantId);
  const db = getDb();
  const [connection] = await db
    .select()
    .from(userMcpConnections)
    .where(and(eq(userMcpConnections.id, params.connectionId), eq(userMcpConnections.tenantId, tenantId), eq(userMcpConnections.ownerUserId, params.userId)))
    .limit(1);
  if (!connection) throw new TRPCError({ code: "NOT_FOUND", message: "Connection not found" });
  if (!connection.encryptedTokenRef || connection.status === "revoked") {
    await db.update(userMcpConnections).set({ status: "requires_reauth", updatedAt: new Date() }).where(eq(userMcpConnections.id, params.connectionId));
    return { status: "requires_reauth" as const, ok: false };
  }
  if (connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() <= Date.now()) {
    await db.update(userMcpConnections).set({
      status: "requires_reauth",
      lastErrorCode: "MCP connection token has expired; reconnect required",
      lastErrorAt: new Date(),
      lastHealthCheckAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(userMcpConnections.id, params.connectionId));
    return { status: "requires_reauth" as const, ok: false };
  }
  await db.update(userMcpConnections).set({ lastHealthCheckAt: new Date(), status: "connected", updatedAt: new Date() }).where(eq(userMcpConnections.id, params.connectionId));
  return { status: "connected" as const, ok: true };
}

export async function recordMcpUsageEvent(input: {
  tenantId: string;
  connectionId?: string | null;
  ownerUserId?: number | null;
  actorUserId?: number | null;
  groupId?: number | null;
  mediaTaskId?: string | null;
  eventType: string;
  assetType?: string | null;
  providerKey?: string | null;
  status?: string | null;
  redactedSummary?: Record<string, unknown>;
  schemaHash?: string | null;
}) {
  const db = getDb();
  await db.insert(mcpConnectionUsageEvents).values({
    ...input,
    redactedSummary: redactMcpUsageSummary(input.redactedSummary ?? {}),
  });
}

export async function listMcpUsage(params: { tenantId?: string | null; userId: number; connectionId?: string }) {
  const tenantId = tenantRequired(params.tenantId);
  const db = getDb();
  const conditions = [eq(mcpConnectionUsageEvents.tenantId, tenantId), eq(mcpConnectionUsageEvents.ownerUserId, params.userId)];
  if (params.connectionId) conditions.push(eq(mcpConnectionUsageEvents.connectionId, params.connectionId));
  return db
    .select()
    .from(mcpConnectionUsageEvents)
    .where(and(...conditions))
    .orderBy(desc(mcpConnectionUsageEvents.occurredAt))
    .limit(50);
}

export function redactMcpUsageSummary(input: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (/token|secret|session|prompt|url|payload|response/i.test(key)) continue;
    redacted[key] = typeof value === "string" && value.length > 256 ? `${value.slice(0, 256)}...` : value;
  }
  return redacted;
}

function toSafeConnection(
  connection: UserMcpConnection,
  providerKey: string,
  providerDisplayName: string,
  extras: Partial<Pick<SafeMcpConnection, "connectionScope" | "sharedGroupId" | "shareId" | "allowedAssetTypes">> = {},
): SafeMcpConnection {
  return {
    id: connection.id,
    providerKey,
    providerDisplayName,
    displayName: connection.displayName,
    status: connection.status,
    providerAccountLabel: connection.providerAccountLabel,
    defaultForImage: connection.defaultForImage,
    defaultForVideo: connection.defaultForVideo,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    tokenExpiresAt: connection.tokenExpiresAt,
    ownerUserId: connection.ownerUserId,
    connectionScope: extras.connectionScope ?? "personal",
    sharedGroupId: extras.sharedGroupId,
    shareId: extras.shareId,
    allowedAssetTypes: extras.allowedAssetTypes,
  };
}
