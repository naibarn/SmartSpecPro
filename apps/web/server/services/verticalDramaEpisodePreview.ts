import { and, eq } from "drizzle-orm";

import {
  mediaAssets,
  verticalDramaEpisodes,
  workerJobs,
  type WorkerJob,
} from "../../drizzle/schema";
import {
  readVerticalDramaEpisodePreviews,
  upsertVerticalDramaEpisodePreview,
  type VerticalDramaEpisodePreviewState,
} from "../../shared/verticalDramaSeries/episodePreview";
import { db } from "../db";
import {
  ensureVerticalDramaManagedMediaAsset,
  extractVerticalDramaManagedMediaKey,
  ingestVerticalDramaMediaAsset,
  reconcileVerticalDramaMediaAsset,
} from "./verticalDramaMediaAssetService";
import {
  resolveRemotionOutputRef,
  VD_REMOTION_QUEUED_TTL_MS,
} from "./verticalDramaRemotionRender";
import type { AssembleEpisodeVideoOwner } from "./verticalDramaEpisodeVideoAssembly";

export function readEpisodePreviewStates(
  assemblyManifest: unknown
): VerticalDramaEpisodePreviewState[] {
  const manifest =
    assemblyManifest && typeof assemblyManifest === "object"
      ? (assemblyManifest as { episodePreviews?: unknown })
      : null;
  return readVerticalDramaEpisodePreviews(manifest?.episodePreviews);
}

export async function persistEpisodePreviewState(
  owner: AssembleEpisodeVideoOwner,
  next: VerticalDramaEpisodePreviewState
): Promise<void> {
  const [row] = await db
    .select({ assemblyManifest: verticalDramaEpisodes.assemblyManifest })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, owner.episodeId),
        eq(verticalDramaEpisodes.tenantId, owner.tenantId),
        eq(verticalDramaEpisodes.userId, owner.userId),
        eq(verticalDramaEpisodes.seriesId, owner.seriesId)
      )
    )
    .limit(1);
  if (!row) return;

  const existingManifest =
    row.assemblyManifest && typeof row.assemblyManifest === "object"
      ? (row.assemblyManifest as Record<string, unknown>)
      : {};
  const episodePreviews = upsertVerticalDramaEpisodePreview(
    readEpisodePreviewStates(existingManifest),
    next
  );
  await db
    .update(verticalDramaEpisodes)
    .set({
      assemblyManifest: {
        ...existingManifest,
        episodePreviews,
      } as unknown as object,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaEpisodes.id, owner.episodeId),
        eq(verticalDramaEpisodes.tenantId, owner.tenantId),
        eq(verticalDramaEpisodes.userId, owner.userId),
        eq(verticalDramaEpisodes.seriesId, owner.seriesId)
      )
    );
}

export type ReconcileEpisodePreviewResult = {
  reconciled: boolean;
  status?: "completed" | "failed";
};

type EpisodePreviewJobReference = {
  seriesId: number;
  episodeId: number;
  slotId: 1 | 2 | 3 | 4;
};

function readEpisodePreviewJobReference(
  inputJson: unknown,
): EpisodePreviewJobReference | null {
  if (!inputJson || typeof inputJson !== "object" || Array.isArray(inputJson)) {
    return null;
  }
  const input = inputJson as Record<string, unknown>;
  const projectId = typeof input.videoProjectId === "string"
    ? input.videoProjectId.trim()
    : "";
  const match = /^vd-episode-preview:(\d+):(\d+)$/.exec(projectId);
  const seriesId = Number(match?.[1]);
  const episodeId = Number(match?.[2]);
  const slotId = Number(input.projectRevision);
  if (
    !match ||
    !Number.isSafeInteger(seriesId) ||
    seriesId <= 0 ||
    !Number.isSafeInteger(episodeId) ||
    episodeId <= 0 ||
    !Number.isInteger(slotId) ||
    slotId < 1 ||
    slotId > 4
  ) {
    return null;
  }
  return { seriesId, episodeId, slotId: slotId as 1 | 2 | 3 | 4 };
}

/**
 * Immediately releases a canceled preview slot. The episode-detail read path
 * still reconciles failed/expired jobs, but cancellation happens from the
 * separate Render Jobs page, so waiting for the user to revisit the episode
 * leaves the preview card showing "pending" and blocks the retry button.
 *
 * The persisted slot's pending job id is checked before writing so canceling
 * an old job cannot clear a newer retry that has already claimed the same slot.
 */
export async function resetEpisodePreviewStateOnCancel(input: {
  tenantId: string;
  userId: number;
  jobId: string;
  inputJson: unknown;
}): Promise<boolean> {
  const reference = readEpisodePreviewJobReference(input.inputJson);
  if (!reference) return false;

  const owner: AssembleEpisodeVideoOwner = {
    tenantId: input.tenantId,
    userId: input.userId,
    seriesId: reference.seriesId,
    episodeId: reference.episodeId,
  };
  const [row] = await db
    .select({ assemblyManifest: verticalDramaEpisodes.assemblyManifest })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, owner.episodeId),
        eq(verticalDramaEpisodes.tenantId, owner.tenantId),
        eq(verticalDramaEpisodes.userId, owner.userId),
        eq(verticalDramaEpisodes.seriesId, owner.seriesId),
      ),
    )
    .limit(1);
  if (!row) return false;

  const current = readEpisodePreviewStates(row.assemblyManifest).find(
    preview => preview.slotId === reference.slotId,
  );
  if (
    !current ||
    current.status !== "pending" ||
    current.pendingJobId !== input.jobId
  ) {
    return false;
  }

  await persistEpisodePreviewState(owner, {
    ...current,
    status: "failed",
    pendingJobId: undefined,
    error: "ยกเลิกงาน preview แล้ว — กดสร้างชุดนี้ใหม่ได้",
  });
  return true;
}

/** Resolve one preview's worker row and merge its terminal result into the
 * slot. This intentionally mirrors the full-assembly reconciler but writes
 * only `episodePreviews[slotId]`, so a preview cannot overwrite the main
 * `compiledVideo` state. */
export async function reconcileEpisodePreview(
  owner: AssembleEpisodeVideoOwner,
  current: VerticalDramaEpisodePreviewState
): Promise<ReconcileEpisodePreviewResult> {
  if (current.status !== "pending" || !current.pendingJobId) {
    return { reconciled: false };
  }
  const [job] = await db
    .select()
    .from(workerJobs)
    .where(eq(workerJobs.id, current.pendingJobId))
    .limit(1);
  if (!job) {
    await persistEpisodePreviewState(owner, {
      ...current,
      status: "failed",
      pendingJobId: undefined,
      error: "งาน preview หายไปจากคิว render-jobs",
    });
    return { reconciled: true, status: "failed" };
  }

  if (job.status === "queued") {
    const submittedAt = Date.parse(current.createdAt ?? "");
    if (
      !Number.isFinite(submittedAt) ||
      Date.now() - submittedAt <= VD_REMOTION_QUEUED_TTL_MS
    ) {
      return { reconciled: false };
    }
    await persistEpisodePreviewState(owner, {
      ...current,
      status: "failed",
      pendingJobId: undefined,
      error: "ไม่มีเครื่อง Worker ออนไลน์รับงาน preview Remotion",
    });
    return { reconciled: true, status: "failed" };
  }

  if (
    !["completed", "failed", "cancelled", "canceled", "expired"].includes(
      job.status
    )
  ) {
    return { reconciled: false };
  }
  if (job.status !== "completed") {
    await persistEpisodePreviewState(owner, {
      ...current,
      status: "failed",
      pendingJobId: undefined,
      error: job.failureReason || "Remotion preview render failed",
    });
    return { reconciled: true, status: "failed" };
  }

  const rawOutputUrl = await resolveRemotionOutputRef(job as WorkerJob);
  if (!rawOutputUrl) {
    await persistEpisodePreviewState(owner, {
      ...current,
      status: "failed",
      pendingJobId: undefined,
      error: "Remotion preview เสร็จแล้วแต่ไม่พบ output URL",
    });
    return { reconciled: true, status: "failed" };
  }
  const outputUrl = /^(https?:\/\/|\/)/i.test(rawOutputUrl)
    ? rawOutputUrl
    : await (async () => {
        try {
          const { storageGet } = await import("../storage");
          const resolved = await storageGet(rawOutputUrl);
          return String(resolved?.url ?? "").trim() || rawOutputUrl;
        } catch {
          return rawOutputUrl;
        }
      })();
  const managedKey = extractVerticalDramaManagedMediaKey(outputUrl);
  let durableAsset = null;
  try {
    durableAsset = managedKey
      ? await ensureVerticalDramaManagedMediaAsset({
          tenantId: owner.tenantId,
          userId: owner.userId,
          sourceUrl: outputUrl,
          mediaType: "video",
          mimeType: "video/mp4",
        })
      : await ingestVerticalDramaMediaAsset({
          tenantId: owner.tenantId,
          userId: owner.userId,
          seriesId: owner.seriesId,
          mediaType: "video",
          sourceUrl: outputUrl,
          mimeType: "video/mp4",
          identity: `episode-preview:${owner.episodeId}:${current.slotId}`,
          purpose: "episode_preview",
        });
  } catch {
    durableAsset = null;
  }

  await persistEpisodePreviewState(owner, {
    ...current,
    status: "completed",
    pendingJobId: undefined,
    ...(durableAsset
      ? {
          mediaAssetId: String(durableAsset.mediaAssetId),
          videoUrl: durableAsset.url,
          durabilityStatus: "ready" as const,
        }
      : {
          mediaAssetId: undefined,
          videoUrl: undefined,
          durabilityStatus: "expired" as const,
        }),
    completedAt: new Date().toISOString(),
    error: durableAsset ? undefined : "Preview output is no longer available",
  });
  return { reconciled: true, status: "completed" };
}

/** Reconcile a completed preview on episode-detail reads. */
export async function reconcileCompletedEpisodePreviewMedia(
  owner: AssembleEpisodeVideoOwner,
  current: VerticalDramaEpisodePreviewState,
): Promise<{ state: VerticalDramaEpisodePreviewState; reconciled: boolean }> {
  if (current.status !== "completed") return { state: current, reconciled: false };

  let durableAsset: {
    mediaAssetId: number;
    storageKey: string;
    url: string;
    mimeType: string;
    status?: "ready" | "expired";
  } | null = null;

  const numericAssetId = Number(current.mediaAssetId);
  if (Number.isInteger(numericAssetId) && numericAssetId > 0) {
    const [row] = await db
      .select({
        id: mediaAssets.id,
        storageKey: mediaAssets.storageKey,
        mimeType: mediaAssets.mimeType,
        status: mediaAssets.status,
        originalUrl: mediaAssets.originalUrl,
      })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, numericAssetId),
          eq(mediaAssets.tenantId, owner.tenantId),
          eq(mediaAssets.userId, owner.userId),
        ),
      )
      .limit(1);
    if (row) {
      const reconciled = await reconcileVerticalDramaMediaAsset({
        tenantId: owner.tenantId,
        userId: owner.userId,
        mediaAssetId: row.id,
        storageKey: row.storageKey,
        mediaType: "video",
        mimeType: row.mimeType,
        status: row.status,
        originalUrl: row.originalUrl,
      });
      if (reconciled.status === "ready") durableAsset = reconciled;
    }
  }

  if (!durableAsset && current.videoUrl) {
    const managedKey = extractVerticalDramaManagedMediaKey(current.videoUrl);
    if (managedKey) {
      durableAsset = await ensureVerticalDramaManagedMediaAsset({
        tenantId: owner.tenantId,
        userId: owner.userId,
        sourceUrl: current.videoUrl,
        mediaType: "video",
        mimeType: "video/mp4",
      });
    } else {
      try {
        durableAsset = await ingestVerticalDramaMediaAsset({
          tenantId: owner.tenantId,
          userId: owner.userId,
          seriesId: owner.seriesId,
          mediaType: "video",
          sourceUrl: current.videoUrl,
          mimeType: "video/mp4",
          identity: `episode-preview:${owner.episodeId}:${current.slotId}`,
          purpose: "episode_preview_legacy_repair",
        });
      } catch {
        durableAsset = null;
      }
    }
  }

  const next = durableAsset
    ? {
        ...current,
        mediaAssetId: String(durableAsset.mediaAssetId),
        videoUrl: durableAsset.url,
        durabilityStatus: "ready" as const,
        error: undefined,
      }
    : {
        ...current,
        mediaAssetId: undefined,
        videoUrl: undefined,
        durabilityStatus: "expired" as const,
        error: current.error || "Preview output is no longer available",
      };
  const reconciled =
    next.mediaAssetId !== current.mediaAssetId ||
    next.videoUrl !== current.videoUrl ||
    next.durabilityStatus !== current.durabilityStatus ||
    next.error !== current.error;
  if (reconciled) await persistEpisodePreviewState(owner, next);
  return { state: next, reconciled };
}
