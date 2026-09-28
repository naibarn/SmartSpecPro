import { and, eq, or, sql } from "drizzle-orm";

import { getDb } from "../db";
import {
  desktopInstallerReleases,
  feedbackTicketAttachments,
  feedbackTicketComments,
  feedbackTickets,
  groupMembers,
  libraryItems,
  marketplaceAutoReviewRuns,
  marketplaceCaptureAssets,
  marketplaceProductGroupShares,
  marketplaceProductImages,
  marketplaceProducts,
  mediaAssets,
  workerArtifacts,
  workerJobs,
  mcpMediaTasks,
  presentationExports,
  userGroups,
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

  // Marketplace Capture images are tenant-protected R2 objects. They are
  // returned to the picker as managed storage URLs, so authorize the same
  // owner/group access that powers the product list before streaming them.
  if (normalizedKey.startsWith("marketplace-captures/")) {
    const [ownedCaptureAsset] = await db
      .select({ id: marketplaceCaptureAssets.id })
      .from(marketplaceCaptureAssets)
      .where(
        and(
          eq(marketplaceCaptureAssets.storageKey, normalizedKey),
          or(
            eq(marketplaceCaptureAssets.tenantId, viewer.tenantId),
            sql`${marketplaceCaptureAssets.tenantId} IS NULL`,
          ),
          eq(marketplaceCaptureAssets.userId, viewer.userId)
        )
      )
      .limit(1);
    if (ownedCaptureAsset) return true;

    const [ownedProductImage] = await db
      .select({ id: marketplaceProductImages.id })
      .from(marketplaceProductImages)
      .innerJoin(
        marketplaceProducts,
        eq(marketplaceProducts.id, marketplaceProductImages.productId),
      )
      .where(
        and(
          eq(marketplaceProductImages.storageKey, normalizedKey),
          eq(marketplaceProducts.userId, viewer.userId),
          or(
            eq(marketplaceProducts.tenantId, viewer.tenantId),
            sql`${marketplaceProducts.tenantId} IS NULL`,
          ),
        ),
      )
      .limit(1);
    if (ownedProductImage) return true;

    const [sharedProductImage] = await db
      .select({ id: marketplaceProductImages.id })
      .from(marketplaceProductImages)
      .innerJoin(
        marketplaceProducts,
        eq(marketplaceProducts.id, marketplaceProductImages.productId)
      )
      .innerJoin(
        marketplaceProductGroupShares,
        eq(marketplaceProductGroupShares.productId, marketplaceProducts.id)
      )
      .leftJoin(
        marketplaceCaptureAssets,
        eq(marketplaceCaptureAssets.id, marketplaceProductImages.captureAssetId),
      )
      .innerJoin(
        groupMembers,
        eq(groupMembers.groupId, marketplaceProductGroupShares.groupId)
      )
      .innerJoin(userGroups, eq(userGroups.id, groupMembers.groupId))
      .where(
        and(
          or(
            eq(marketplaceProductImages.storageKey, normalizedKey),
            eq(marketplaceCaptureAssets.storageKey, normalizedKey),
          ),
          or(
            eq(marketplaceProducts.tenantId, viewer.tenantId),
            sql`${marketplaceProducts.tenantId} IS NULL`,
          ),
          or(
            eq(marketplaceCaptureAssets.tenantId, viewer.tenantId),
            sql`${marketplaceCaptureAssets.tenantId} IS NULL`,
          ),
          eq(marketplaceProductGroupShares.tenantId, viewer.tenantId),
          or(
            eq(marketplaceProductGroupShares.permission, "read"),
            eq(marketplaceProductGroupShares.permission, "read_update")
          ),
          eq(groupMembers.userId, viewer.userId),
          eq(groupMembers.status, "active"),
          sql`${userGroups.deletedAt} IS NULL`
        )
      )
      .limit(1);
    return Boolean(sharedProductImage);
  }

  // Auto Review images, manual uploads, storyboard frames, and HyperFrames
  // renders use both the legacy `.../{runId}/...` layout and the newer
  // tenant-bound `.../{tenantId}/{runId}/...` layout. Resolve the run id from
  // either segment and authorize the persisted owner/tenant, never the path
  // alone.
  if (normalizedKey.startsWith("marketplace-auto-review/")) {
    const segments = normalizedKey.split("/");
    const legacyRunDirectories = new Set([
      "manual-uploads",
      "overlay",
      "reference-uploads",
      "artifacts",
    ]);
    const tenantBoundRunDirectories = new Set([
      "frames",
      "media",
      "hyperframes",
    ]);
    const runId = legacyRunDirectories.has(segments[2] ?? "")
      ? segments[1]
      : tenantBoundRunDirectories.has(segments[3] ?? "")
        ? segments[2]
        : null;
    if (!runId) return false;
    const [ownedRun] = await db
      .select({ id: marketplaceAutoReviewRuns.id })
      .from(marketplaceAutoReviewRuns)
      .where(
        and(
          eq(marketplaceAutoReviewRuns.id, runId),
          eq(marketplaceAutoReviewRuns.userId, viewer.userId),
          or(
            eq(marketplaceAutoReviewRuns.tenantId, viewer.tenantId),
            sql`${marketplaceAutoReviewRuns.tenantId} IS NULL`,
          ),
        ),
      )
      .limit(1);
    return Boolean(ownedRun);
  }

  const verticalDramaWatermarkMatch = normalizedKey.match(
    /^vertical-drama\/(\d+)\/watermark\/[^/]+$/
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
          eq(verticalDramaSeries.userId, viewer.userId)
        )
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
      return (
        normalizeManagedMediaKey(value.slice(prefix.length)) === normalizedKey
      );
    });
  }

  // `ai.upload` stores Media Studio/chat uploads under an owner-scoped key.
  // New keys include the tenant; legacy keys only include the user id and are
  // retained for existing references created before tenant scoping was added.
  const tenantScopedChatUpload = normalizedKey.match(
    /^chat\/uploads\/([^/]+)\/(\d+)\/[^/]+$/
  );
  if (tenantScopedChatUpload) {
    return (
      tenantScopedChatUpload[1] === viewer.tenantId &&
      Number(tenantScopedChatUpload[2]) === viewer.userId
    );
  }

  const legacyChatUpload = normalizedKey.match(/^chat\/uploads\/(\d+)\/[^/]+$/);
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
        internalComment: feedbackTicketComments.isInternal,
      })
      .from(feedbackTicketAttachments)
      .innerJoin(
        feedbackTickets,
        eq(feedbackTickets.id, feedbackTicketAttachments.ticketId)
      )
      .leftJoin(
        feedbackTicketComments,
        eq(feedbackTicketComments.id, feedbackTicketAttachments.commentId)
      )
      .where(eq(feedbackTicketAttachments.fileUrl, normalizedKey))
      .limit(1);

    if (!feedbackAttachment) return false;

    const isAdmin = viewer.role === "admin" || viewer.role === "domain_admin";
    if (!isAdmin && feedbackAttachment.internalComment === true) return false;
    const sameTenant = feedbackAttachment.ticketTenantId === viewer.tenantId;
    const legacySystemTicket =
      feedbackAttachment.submittedByType === "system" &&
      feedbackAttachment.ticketTenantId === null;

    if (isAdmin) return sameTenant || legacySystemTicket;
    return sameTenant && feedbackAttachment.submittedBy === viewer.userId;
  }

  const mcpMediaMatch = normalizedKey.match(
    /^mcp-media\/([^/]+)\/(\d+)\/([^/]+)\//
  );
  if (mcpMediaMatch) {
    const [, mediaTenantId, mediaUserId, taskId] = mcpMediaMatch;
    if (
      mediaTenantId !== viewer.tenantId ||
      Number(mediaUserId) !== viewer.userId
    ) {
      return false;
    }
    const [ownedMcpTask] = await db
      .select({ id: mcpMediaTasks.id })
      .from(mcpMediaTasks)
      .where(
        and(
          eq(mcpMediaTasks.id, taskId),
          eq(mcpMediaTasks.tenantId, viewer.tenantId),
          eq(mcpMediaTasks.userId, viewer.userId)
        )
      )
      .limit(1);
    return Boolean(ownedMcpTask);
  }

  // Presentation exports are durable R2 objects keyed by deck/task, so the
  // key itself does not contain tenant or user identity. Resolve ownership
  // from the completed export row before allowing the storage proxy to read it.
  if (normalizedKey.startsWith("presentation-exports/")) {
    const [ownedPresentationExport] = await db
      .select({ id: presentationExports.id })
      .from(presentationExports)
      .where(
        and(
          eq(presentationExports.outputStorageKey, normalizedKey),
          eq(presentationExports.tenantId, viewer.tenantId),
          eq(presentationExports.userId, viewer.userId),
          eq(presentationExports.status, "done")
        )
      )
      .limit(1);
    return Boolean(ownedPresentationExport);
  }

  // Python media-job worker outputs are namespaced by tenant and user before
  // the job id. Keep the proxy boundary tenant/user-scoped even when the
  // worker has not yet materialized a media_assets row for the output.
  const mediaJobOutputMatch = normalizedKey.match(
    /^media-jobs\/([^/]+)\/(\d+)\/[^/]+\/[^/]+\.(?:avif|gif|heic|heif|jpe?g|m4a|mkv|mov|mp3|mp4|oga|ogg|png|svg|wav|webm|webp)$/i
  );
  if (mediaJobOutputMatch) {
    return (
      mediaJobOutputMatch[1] === viewer.tenantId &&
      Number(mediaJobOutputMatch[2]) === viewer.userId
    );
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
