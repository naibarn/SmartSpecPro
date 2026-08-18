import { and, eq, or, sql } from "drizzle-orm";

import { getDb } from "../db";
import {
  desktopInstallerReleases,
  feedbackTicketAttachments,
  feedbackTickets,
  libraryItems,
  mediaAssets,
  workerArtifacts,
  workerJobs,
  mcpMediaTasks,
  verticalDramaSeries,
} from "../../drizzle/schema";
import { getLibraryItemById, type LibraryActor } from "./libraryService";
import { normalizeManagedMediaKey } from "./managedMediaAccessService";

export interface ManagedStorageViewer {
  tenantId: string;
  userId: number;
  role?: string | null;
}

/**
 * Public files are explicitly published desktop releases. Every other managed
 * object must be tied to a tenant/user-owned record before the raw compatibility
 * storage route is allowed to stream it.
 */
export async function canReadManagedStorageKey(
  storageKey: string,
  viewer?: ManagedStorageViewer | null
): Promise<boolean> {
  const normalizedKey = storageKey.trim();
  if (!normalizedKey) return false;

  const db = await getDb();
  if (!db) return false;

  const [publicRelease] = await db
    .select({ id: desktopInstallerReleases.id })
    .from(desktopInstallerReleases)
    .where(
      and(
        eq(desktopInstallerReleases.storageKey, normalizedKey),
        eq(desktopInstallerReleases.isPublished, true)
      )
    )
    .limit(1);
  if (publicRelease) return true;

  if (
    !viewer?.tenantId ||
    !Number.isInteger(viewer.userId) ||
    viewer.userId <= 0
  ) {
    return false;
  }

  const verticalDramaWatermarkMatch = normalizedKey.match(
    /^vertical-drama\/(\d+)\/watermark\/[^/]+$/,
  );
  if (verticalDramaWatermarkMatch) {
    const seriesId = Number(verticalDramaWatermarkMatch[1]);
    const [series] = await db
      .select({ watermark: verticalDramaSeries.watermark })
      .from(verticalDramaSeries)
      .where(
        and(
          eq(verticalDramaSeries.id, seriesId),
          eq(verticalDramaSeries.tenantId, viewer.tenantId),
          eq(verticalDramaSeries.userId, viewer.userId),
        ),
      )
      .limit(1);
    if (!series) return false;

    const watermark =
      series.watermark && typeof series.watermark === "object"
        ? (series.watermark as Record<string, unknown>)
        : null;
    const secondary =
      watermark?.secondary && typeof watermark.secondary === "object"
        ? (watermark.secondary as Record<string, unknown>)
        : null;
    const configuredUrls = [watermark?.imageUrl, secondary?.imageUrl];
    return configuredUrls.some(value => {
      if (typeof value !== "string") return false;
      const prefix = "/api/storage/files/";
      if (!value.startsWith(prefix)) return false;
      return normalizeManagedMediaKey(value.slice(prefix.length)) === normalizedKey;
    });
  }

  // `ai.upload` stores Media Studio/chat uploads under an owner-scoped key.
  // New keys include the tenant; legacy keys only include the user id and are
  // retained for existing references created before tenant scoping was added.
  const tenantScopedChatUpload = normalizedKey.match(
    /^chat\/uploads\/([^/]+)\/(\d+)\/[^/]+$/,
  );
  if (tenantScopedChatUpload) {
    return (
      tenantScopedChatUpload[1] === viewer.tenantId &&
      Number(tenantScopedChatUpload[2]) === viewer.userId
    );
  }

  const legacyChatUpload = normalizedKey.match(
    /^chat\/uploads\/(\d+)\/[^/]+$/,
  );
  if (legacyChatUpload) {
    return Number(legacyChatUpload[1]) === viewer.userId;
  }

  if (normalizedKey.startsWith("feedback/")) {
    // Feedback uploads are stored as `feedback/<ticketId>/<filename>`. Keep
    // their read authorization tied to the ticket rather than treating the
    // storage key as a public or user-owned media asset.
    const [feedbackAttachment] = await db
      .select({
        ticketTenantId: feedbackTickets.tenantId,
        submittedBy: feedbackTickets.submittedBy,
        submittedByType: feedbackTickets.submittedByType,
      })
      .from(feedbackTicketAttachments)
      .innerJoin(
        feedbackTickets,
        eq(feedbackTickets.id, feedbackTicketAttachments.ticketId)
      )
      .where(eq(feedbackTicketAttachments.fileUrl, normalizedKey))
      .limit(1);

    if (!feedbackAttachment) return false;

    const isAdmin = viewer.role === "admin" || viewer.role === "domain_admin";
    const sameTenant = feedbackAttachment.ticketTenantId === viewer.tenantId;
    const legacySystemTicket =
      feedbackAttachment.submittedByType === "system" &&
      feedbackAttachment.ticketTenantId === null;

    if (isAdmin) return sameTenant || legacySystemTicket;
    return sameTenant && feedbackAttachment.submittedBy === viewer.userId;
  }

  const mcpMediaMatch = normalizedKey.match(
    /^mcp-media\/([^/]+)\/(\d+)\/([^/]+)\//,
  );
  if (mcpMediaMatch) {
    const [, mediaTenantId, mediaUserId, taskId] = mcpMediaMatch;
    if (mediaTenantId !== viewer.tenantId || Number(mediaUserId) !== viewer.userId) {
      return false;
    }
    const [ownedMcpTask] = await db
      .select({ id: mcpMediaTasks.id })
      .from(mcpMediaTasks)
      .where(
        and(
          eq(mcpMediaTasks.id, taskId),
          eq(mcpMediaTasks.tenantId, viewer.tenantId),
          eq(mcpMediaTasks.userId, viewer.userId),
        ),
      )
      .limit(1);
    return Boolean(ownedMcpTask);
  }

  const [ownedMediaAsset] = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.tenantId, viewer.tenantId),
        eq(mediaAssets.userId, viewer.userId),
        eq(mediaAssets.storageKey, normalizedKey)
      )
    )
    .limit(1);
  if (ownedMediaAsset) return true;

  const libraryRows = await db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.tenantId, viewer.tenantId),
        sql`${libraryItems.deletedAt} IS NULL`,
        or(
          eq(libraryItems.sourceUrl, normalizedKey),
          sql`${libraryItems.metadata}->>'source_key' = ${normalizedKey}`
        )
      )
    )
    .limit(5);

  const actor: LibraryActor = {
    tenantId: viewer.tenantId,
    userId: viewer.userId,
    role: viewer.role === "admin" ? "admin" : "user",
  };
  for (const row of libraryRows) {
    if (await getLibraryItemById(row.id, actor)) return true;
  }

  const [ownedWorkerArtifact] = await db
    .select({ id: workerArtifacts.id })
    .from(workerArtifacts)
    .innerJoin(workerJobs, eq(workerJobs.id, workerArtifacts.workerJobId))
    .where(
      and(
        eq(workerArtifacts.storageRef, normalizedKey),
        eq(workerJobs.tenantId, viewer.tenantId),
        eq(workerJobs.requestedByUserId, viewer.userId),
        sql`${workerJobs.status} IN ('completed', 'failed', 'canceled', 'expired')`
      )
    )
    .limit(1);
  return Boolean(ownedWorkerArtifact);
}
