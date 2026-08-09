import { and, eq } from "drizzle-orm";

import {
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
  await persistEpisodePreviewState(owner, {
    ...current,
    status: "completed",
    pendingJobId: undefined,
    videoUrl: outputUrl,
    completedAt: new Date().toISOString(),
    error: undefined,
  });
  return { reconciled: true, status: "completed" };
}
