import { eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  marketplaceAutoReviewProviderEvents,
  marketplaceAutoReviewRuns,
  marketplaceAutoReviewStages,
} from "../../drizzle/schema";
import {
  ensureMarketplaceAutoReviewMediaUrlDurable,
  type MarketplaceAutoReviewMediaUrlDurability,
} from "../services/marketplaceAutoReviewMediaAssetService";

type MediaType = "image" | "video";
type BackfillMode = "dry-run" | "apply";

type BackfillStats = {
  runsScanned: number;
  rowsChanged: number;
  urlsFound: number;
  urlsMigrated: number;
  unavailable: number;
  skipped: number;
  errors: Array<{ runId: string; url: string; message: string }>;
};

const IMAGE_KEYS = new Set([
  "storyboardFrameUrls",
  "startFrameUrls",
  "stopFrameUrls",
  "storyboardGridUrl",
  "imageUrls",
  "resultUrls",
  "frameUrls",
  "imageAttemptReviews",
  "sequentialImageEditCandidates",
  "imageArtifactUrl",
  "thumbnailUrl",
  "thumbnailUrls",
]);
const VIDEO_KEYS = new Set([
  "videoClipUrls",
  "videoUrls",
  "videoArtifactUrl",
  "renderUrl",
  "outputUrl",
]);
const URL_KEYS = new Set(["resultUrl", "afterUrl", "url", "src", "uri"]);

function isUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (/^https?:\/\//i.test(value.trim()) ||
      value.trim().startsWith("/api/storage/files/"))
  );
}

function inferType(key: string, inherited: MediaType | null): MediaType | null {
  if (IMAGE_KEYS.has(key)) return "image";
  if (VIDEO_KEYS.has(key)) return "video";
  if (key === "audioUrl" || key === "audioArtifactUrl") return null;
  return inherited;
}

function stageMediaType(stageKey: string): MediaType | null {
  if (stageKey.includes("image")) return "image";
  if (stageKey.includes("video") || stageKey === "render") return "video";
  return null;
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        cloneValue(child),
      ])
    );
  }
  return value;
}

async function rewriteMediaUrls(params: {
  value: unknown;
  key: string;
  inheritedType: MediaType | null;
  runId: string;
  tenantId?: string | null;
  userId: number;
  mode: BackfillMode;
  stats: BackfillStats;
}): Promise<unknown> {
  const type = inferType(params.key, params.inheritedType);
  if (isUrl(params.value) && type && URL_KEYS.has(params.key)) {
    params.stats.urlsFound += 1;
    if (params.value.startsWith("/api/storage/files/")) {
      params.stats.skipped += 1;
      return params.value;
    }
    if (params.mode === "dry-run") {
      params.stats.skipped += 1;
      return params.value;
    }
    try {
      const durable: MarketplaceAutoReviewMediaUrlDurability =
        await ensureMarketplaceAutoReviewMediaUrlDurable({
          tenantId: params.tenantId,
          runId: params.runId,
          sourceUrl: params.value,
          mediaType: type,
          purpose: params.key,
          identity: `${params.key}:${params.value}`,
        });
      params.stats.urlsMigrated += 1;
      return durable.durableUrl;
    } catch (error) {
      params.stats.unavailable += 1;
      params.stats.errors.push({
        runId: params.runId,
        url: params.value,
        message: error instanceof Error ? error.message : String(error),
      });
      return params.value;
    }
  }
  if (Array.isArray(params.value)) {
    return Promise.all(
      params.value.map((child, index) =>
        rewriteMediaUrls({
          ...params,
          value: child,
          key: typeof child === "string" ? "url" : params.key || String(index),
          inheritedType: type,
        })
      )
    );
  }
  if (params.value && typeof params.value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(
      params.value as Record<string, unknown>
    )) {
      output[key] = await rewriteMediaUrls({
        ...params,
        value: child,
        key,
        inheritedType:
          key === "directImageTasks"
            ? "image"
            : key === "directVideoTasks"
              ? "video"
              : type,
      });
    }
    return output;
  }
  return params.value;
}

async function rewriteDocument(params: {
  value: Record<string, unknown>;
  runId: string;
  tenantId?: string | null;
  userId: number;
  mode: BackfillMode;
  stats: BackfillStats;
  mediaType?: MediaType | null;
}) {
  return (await rewriteMediaUrls({
    value: params.value,
    key: "document",
    inheritedType: params.mediaType ?? null,
    runId: params.runId,
    tenantId: params.tenantId,
    userId: params.userId,
    mode: params.mode,
    stats: params.stats,
  })) as Record<string, unknown>;
}

export async function backfillMarketplaceAutoReviewMedia(
  input: {
    mode?: BackfillMode;
    runId?: string;
  } = {}
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const mode = input.mode ?? "dry-run";
  const stats: BackfillStats = {
    runsScanned: 0,
    rowsChanged: 0,
    urlsFound: 0,
    urlsMigrated: 0,
    unavailable: 0,
    skipped: 0,
    errors: [],
  };

  const runs = await db
    .select({
      id: marketplaceAutoReviewRuns.id,
      tenantId: marketplaceAutoReviewRuns.tenantId,
      userId: marketplaceAutoReviewRuns.userId,
      metadataJson: marketplaceAutoReviewRuns.metadataJson,
      resultJson: marketplaceAutoReviewRuns.resultJson,
    })
    .from(marketplaceAutoReviewRuns)
    .where(
      input.runId ? eq(marketplaceAutoReviewRuns.id, input.runId) : undefined
    );

  for (const run of runs) {
    stats.runsScanned += 1;
    const metadataJson = await rewriteDocument({
      value: cloneValue(run.metadataJson) as Record<string, unknown>,
      runId: run.id,
      tenantId: run.tenantId,
      userId: run.userId,
      mode,
      stats,
    });
    const resultJson = await rewriteDocument({
      value: cloneValue(run.resultJson) as Record<string, unknown>,
      runId: run.id,
      tenantId: run.tenantId,
      userId: run.userId,
      mode,
      stats,
      mediaType: "video",
    });
    if (
      mode === "apply" &&
      JSON.stringify(metadataJson) !== JSON.stringify(run.metadataJson)
    ) {
      await db
        .update(marketplaceAutoReviewRuns)
        .set({ metadataJson, resultJson, updatedAt: new Date() })
        .where(eq(marketplaceAutoReviewRuns.id, run.id));
      stats.rowsChanged += 1;
    }

    const stages = await db
      .select({
        id: marketplaceAutoReviewStages.id,
        stageKey: marketplaceAutoReviewStages.stageKey,
        outputJson: marketplaceAutoReviewStages.outputJson,
      })
      .from(marketplaceAutoReviewStages)
      .where(eq(marketplaceAutoReviewStages.runId, run.id));
    for (const stage of stages) {
      const outputJson = await rewriteDocument({
        value: cloneValue(stage.outputJson) as Record<string, unknown>,
        runId: run.id,
        tenantId: run.tenantId,
        userId: run.userId,
        mode,
        stats,
        mediaType: stageMediaType(stage.stageKey),
      });
      if (
        mode === "apply" &&
        JSON.stringify(outputJson) !== JSON.stringify(stage.outputJson)
      ) {
        await db
          .update(marketplaceAutoReviewStages)
          .set({ outputJson, updatedAt: new Date() })
          .where(eq(marketplaceAutoReviewStages.id, stage.id));
        stats.rowsChanged += 1;
      }
    }

    const events = await db
      .select({
        id: marketplaceAutoReviewProviderEvents.id,
        stageKey: marketplaceAutoReviewProviderEvents.stageKey,
        resultUrl: marketplaceAutoReviewProviderEvents.resultUrl,
      })
      .from(marketplaceAutoReviewProviderEvents)
      .where(eq(marketplaceAutoReviewProviderEvents.runId, run.id));
    for (const event of events) {
      if (!isUrl(event.resultUrl)) continue;
      const type = stageMediaType(event.stageKey);
      if (!type || mode === "dry-run") continue;
      try {
        const durable = await ensureMarketplaceAutoReviewMediaUrlDurable({
          tenantId: run.tenantId,
          runId: run.id,
          sourceUrl: event.resultUrl,
          mediaType: type,
          purpose: "provider-event",
          identity: event.id,
        });
        if (durable.durableUrl !== event.resultUrl) {
          await db
            .update(marketplaceAutoReviewProviderEvents)
            .set({ resultUrl: durable.durableUrl, updatedAt: new Date() })
            .where(eq(marketplaceAutoReviewProviderEvents.id, event.id));
          stats.rowsChanged += 1;
        }
      } catch (error) {
        stats.unavailable += 1;
        stats.errors.push({
          runId: run.id,
          url: event.resultUrl,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return stats;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode: BackfillMode = process.argv.includes("--apply")
    ? "apply"
    : "dry-run";
  const runArgIndex = process.argv.indexOf("--run-id");
  const runId = runArgIndex >= 0 ? process.argv[runArgIndex + 1] : undefined;
  backfillMarketplaceAutoReviewMedia({ mode, runId })
    .then(stats => {
      console.log(JSON.stringify(stats, null, 2));
      if (stats.unavailable > 0) process.exitCode = 2;
    })
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}
