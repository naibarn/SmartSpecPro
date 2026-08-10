import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaEpisodes,
  verticalDramaSeries,
  workerJobs,
  type WorkerJob,
} from "../../drizzle/schema";
import type {
  VerticalDramaMotionPromptPack,
  VerticalDramaProductionEpisodeGroupState,
  VerticalDramaProductionEpisodesManifest,
} from "@shared/verticalDramaSeries";
import {
  listEnabledWatermarkSlots,
  parseSeriesWatermarkConfig,
} from "@shared/verticalDramaSeries/textOverlay";
import {
  extractClipSourcesFromMotionPromptPack,
  type EpisodeClipSource,
} from "./verticalDramaEpisodeVideoAssembly";
import {
  partitionProductionEpisodeRange,
  type ProductionEpisodeSourceMode,
  type ProductionEpisodeRangeGroup,
} from "./verticalDramaProductionEpisodeAssembly";
import {
  resolveRemotionOutputRef,
  submitVdProductionEpisodeAssembly,
  type ProductionEpisodeRemotionBgmOptions,
  type VdRemotionWatermarkText,
} from "./verticalDramaRemotionRender";
import type { ProductionEpisodeBgmOptions } from "./verticalDramaProductionEpisodeAssembly";
import type { ProductionEpisodeOverlayItem } from "./verticalDramaFinalRenderGraph";

export interface AssembleProductionEpisodesRemotionArgs {
  tenantId: string;
  userId: number;
  seriesId: number;
  startSubEpisode: number;
  endSubEpisode: number;
  subEpisodesPerProductionEpisode: number;
  remainderPolicy: "create" | "skip";
  sourceMode: ProductionEpisodeSourceMode;
  showEpisodeIndicator: boolean;
  showSeriesTitle: boolean;
  useSeriesWatermarks: boolean;
  bgm?: ProductionEpisodeRemotionBgmOptions | ProductionEpisodeBgmOptions;
  credits?: { text: string };
  overlays?: ProductionEpisodeOverlayItem[];
  internalBaseUrl: string;
  publicBaseUrl?: string | null;
}

export interface AssembleProductionEpisodesRemotionResult {
  groupsCreated: number;
  groupsSkipped: number;
  manifest: VerticalDramaProductionEpisodesManifest;
}

export interface ProductionEpisodeSourceSubEpisode {
  id: number;
  episodeNumber: number;
  compiledVideoUrl: string | null;
  motionPromptPack: VerticalDramaMotionPromptPack | null;
}

export function resolveProductionEpisodeSource(
  row: ProductionEpisodeSourceSubEpisode,
  sourceMode: ProductionEpisodeSourceMode
): EpisodeClipSource[] {
  if (sourceMode !== "shot_assembly" && row.compiledVideoUrl) {
    return [
      {
        clipNumber: row.episodeNumber,
        videoUrl: row.compiledVideoUrl,
      },
    ];
  }
  if (sourceMode === "compiled_only") return [];
  return extractClipSourcesFromMotionPromptPack(row.motionPromptPack);
}

function sourceModeError(
  row: ProductionEpisodeSourceSubEpisode,
  sourceMode: ProductionEpisodeSourceMode
): string | null {
  const clips = resolveProductionEpisodeSource(row, sourceMode);
  if (clips.some(clip => (clip.videoUrl ?? "").trim().length > 0)) return null;
  return `vertical_drama_production_source_missing: Sub-Episode ${row.episodeNumber} has no usable ${sourceMode === "compiled_only" ? "compiled video" : "shot assembly clips"}.`;
}

function groupRequestMatches(
  existing: VerticalDramaProductionEpisodeGroupState,
  group: ProductionEpisodeRangeGroup,
  args: AssembleProductionEpisodesRemotionArgs,
  settingsKey: string
): boolean {
  return (
    existing.renderer === "remotion" &&
    existing.startSubEpisode === group.subEpisodeNumbers[0] &&
    existing.endSubEpisode ===
      group.subEpisodeNumbers[group.subEpisodeNumbers.length - 1] &&
    existing.groupSize === args.subEpisodesPerProductionEpisode &&
    existing.sourceMode === args.sourceMode &&
    existing.showEpisodeIndicator === args.showEpisodeIndicator &&
    existing.showSeriesTitle === args.showSeriesTitle &&
    existing.useSeriesWatermarks === args.useSeriesWatermarks &&
    existing.renderSettingsKey === settingsKey
  );
}

async function readSeriesState(
  owner: Pick<
    AssembleProductionEpisodesRemotionArgs,
    "tenantId" | "userId" | "seriesId"
  >
) {
  const [row] = await db
    .select({
      title: verticalDramaSeries.title,
      watermark: verticalDramaSeries.watermark,
      productionEpisodesManifest:
        verticalDramaSeries.productionEpisodesManifest,
    })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, owner.seriesId),
        eq(verticalDramaSeries.tenantId, owner.tenantId),
        eq(verticalDramaSeries.userId, owner.userId)
      )
    )
    .limit(1);
  if (!row) throw new Error("vertical_drama_series_not_found");
  return row;
}

async function persistManifest(
  owner: Pick<
    AssembleProductionEpisodesRemotionArgs,
    "tenantId" | "userId" | "seriesId"
  >,
  manifest: VerticalDramaProductionEpisodesManifest
): Promise<void> {
  await db
    .update(verticalDramaSeries)
    .set({
      productionEpisodesManifest: manifest as unknown as object,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaSeries.id, owner.seriesId),
        eq(verticalDramaSeries.tenantId, owner.tenantId),
        eq(verticalDramaSeries.userId, owner.userId)
      )
    );
}

async function patchGroup(
  owner: Pick<
    AssembleProductionEpisodesRemotionArgs,
    "tenantId" | "userId" | "seriesId"
  >,
  groupIndex: number,
  patch: Partial<VerticalDramaProductionEpisodeGroupState>
): Promise<void> {
  const row = await readSeriesState(owner);
  const manifest =
    row.productionEpisodesManifest as VerticalDramaProductionEpisodesManifest | null;
  if (!manifest) return;
  const next = {
    ...manifest,
    episodes: manifest.episodes.map(group =>
      group.index === groupIndex ? { ...group, ...patch } : group
    ),
  } satisfies VerticalDramaProductionEpisodesManifest;
  await persistManifest(owner, next);
}

async function resolvePlayableOutput(job: WorkerJob): Promise<string> {
  const raw = await resolveRemotionOutputRef(job);
  if (!raw) return "";
  if (/^(https?:\/\/|\/)/i.test(raw)) return raw;
  try {
    const { storageGet } = await import("../storage");
    const resolved = await storageGet(raw);
    return String(resolved?.url ?? "").trim() || raw;
  } catch {
    return raw;
  }
}

function buildWatermarkInputs(
  rawConfig: unknown,
  enabled: boolean
): {
  images: Array<{
    slotId: "primary" | "secondary";
    imageUrl: string;
    position:
      | "top_left"
      | "top_center"
      | "top_right"
      | "middle_left"
      | "middle_center"
      | "middle_right"
      | "bottom_left"
      | "bottom_center"
      | "bottom_right";
    opacity: number;
    scalePct: number;
    marginPx: number;
  }>;
  texts: VdRemotionWatermarkText[];
} {
  if (!enabled) return { images: [], texts: [] };
  const images: Array<{
    slotId: "primary" | "secondary";
    imageUrl: string;
    position:
      | "top_left"
      | "top_center"
      | "top_right"
      | "middle_left"
      | "middle_center"
      | "middle_right"
      | "bottom_left"
      | "bottom_center"
      | "bottom_right";
    opacity: number;
    scalePct: number;
    marginPx: number;
  }> = [];
  const texts: VdRemotionWatermarkText[] = [];
  for (const { slotId, slot } of listEnabledWatermarkSlots(
    parseSeriesWatermarkConfig(rawConfig)
  )) {
    const common = {
      slotId,
      position: slot.position,
      opacity: slot.opacity,
      scalePct: slot.scalePct,
      marginPx: slot.marginPx,
    };
    if (slot.type === "image" && slot.imageUrl?.trim()) {
      images.push({ ...common, imageUrl: slot.imageUrl.trim() });
    } else if (slot.type === "text" && slot.text?.trim()) {
      texts.push({ ...common, text: slot.text.trim() });
    }
  }
  return { images, texts };
}

function normalizeProductionEpisodeBgm(
  bgm: AssembleProductionEpisodesRemotionArgs["bgm"]
): ProductionEpisodeRemotionBgmOptions | undefined {
  if (!bgm) return undefined;
  if ("tracks" in bgm) return bgm;
  return {
    tracks: [
      {
        id: "legacy-bgm-1",
        url: bgm.url,
        startSeconds: 0,
        endSeconds: undefined,
        volumePercent: bgm.volumePercent,
        loopUntilEnd: true,
        duckUnderVideoAudio: bgm.duckUnderVideoAudio,
      },
    ],
  };
}

function productionRenderSettingsKey(
  args: Pick<
    AssembleProductionEpisodesRemotionArgs,
    "bgm" | "credits" | "overlays"
  >
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        bgm: normalizeProductionEpisodeBgm(args.bgm) ?? null,
        credits: args.credits ?? null,
        overlays: args.overlays ?? [],
      })
    )
    .digest("hex");
}

export async function assembleProductionEpisodesWithRemotion(
  args: AssembleProductionEpisodesRemotionArgs
): Promise<AssembleProductionEpisodesRemotionResult> {
  const rangeGroups = partitionProductionEpisodeRange(args);
  const [seriesState, episodeRows] = await Promise.all([
    readSeriesState(args),
    db
      .select({
        id: verticalDramaEpisodes.id,
        episodeNumber: verticalDramaEpisodes.episodeNumber,
        assemblyManifest: verticalDramaEpisodes.assemblyManifest,
        motionPromptPack: verticalDramaEpisodes.motionPromptPack,
      })
      .from(verticalDramaEpisodes)
      .where(
        and(
          eq(verticalDramaEpisodes.tenantId, args.tenantId),
          eq(verticalDramaEpisodes.userId, args.userId),
          eq(verticalDramaEpisodes.seriesId, args.seriesId)
        )
      )
      .orderBy(asc(verticalDramaEpisodes.episodeNumber)),
  ]);
  const rowsByNumber = new Map<number, ProductionEpisodeSourceSubEpisode>();
  for (const row of episodeRows) {
    const manifest = row.assemblyManifest as Record<string, unknown> | null;
    const compiled = manifest?.compiledVideo as
      | Record<string, unknown>
      | undefined;
    rowsByNumber.set(row.episodeNumber, {
      id: row.id,
      episodeNumber: row.episodeNumber,
      compiledVideoUrl:
        compiled?.status === "completed" &&
        typeof compiled.videoUrl === "string"
          ? compiled.videoUrl
          : null,
      motionPromptPack:
        row.motionPromptPack as VerticalDramaMotionPromptPack | null,
    });
  }

  const selectedRows = new Map<number, ProductionEpisodeSourceSubEpisode>();
  for (
    let number = args.startSubEpisode;
    number <= args.endSubEpisode;
    number += 1
  ) {
    const row = rowsByNumber.get(number);
    if (!row) {
      throw new Error(
        `vertical_drama_production_subepisode_not_found: ${number}`
      );
    }
    const missing = sourceModeError(row, args.sourceMode);
    if (missing) throw new Error(missing);
    selectedRows.set(number, row);
  }

  const requestedGroups = rangeGroups.filter(
    group => args.remainderPolicy === "create" || !group.isRemainder
  );
  if (requestedGroups.length === 0) {
    throw new Error(
      "vertical_drama_production_no_groups_after_remainder_policy"
    );
  }

  const existingManifest =
    (seriesState.productionEpisodesManifest as VerticalDramaProductionEpisodesManifest | null) ??
    null;
  const existingEpisodes = existingManifest?.episodes ?? [];
  const nextIndex =
    existingEpisodes.reduce((max, group) => Math.max(max, group.index), -1) + 1;
  const nextEpisodeNumber =
    existingEpisodes.reduce(
      (max, group) =>
        Math.max(max, group.productionEpisodeNumber ?? group.index + 1),
      0
    ) + 1;
  const wm = buildWatermarkInputs(
    seriesState.watermark,
    args.useSeriesWatermarks
  );
  const settingsKey = productionRenderSettingsKey(args);
  const normalizedBgm = normalizeProductionEpisodeBgm(args.bgm);
  const planned: Array<{
    group: ProductionEpisodeRangeGroup;
    state: VerticalDramaProductionEpisodeGroupState;
    reuse: boolean;
  }> = [];
  let newIndex = nextIndex;
  let newEpisodeNumber = nextEpisodeNumber;
  for (const group of requestedGroups) {
    const existing = existingEpisodes.find(existingGroup =>
      groupRequestMatches(existingGroup, group, args, settingsKey)
    );
    if (
      existing &&
      (existing.status === "completed" ||
        (existing.status === "pending" && Boolean(existing.renderJobId)))
    ) {
      planned.push({ group, state: existing, reuse: true });
      continue;
    }
    const state: VerticalDramaProductionEpisodeGroupState = {
      index: newIndex++,
      groupSize: args.subEpisodesPerProductionEpisode,
      subEpisodeNumbers: group.subEpisodeNumbers,
      productionEpisodeNumber: newEpisodeNumber++,
      startSubEpisode: group.subEpisodeNumbers[0],
      endSubEpisode:
        group.subEpisodeNumbers[group.subEpisodeNumbers.length - 1],
      renderer: "remotion",
      sourceMode: args.sourceMode,
      showEpisodeIndicator: args.showEpisodeIndicator,
      showSeriesTitle: args.showSeriesTitle,
      useSeriesWatermarks: args.useSeriesWatermarks,
      seriesTitle: seriesState.title ?? undefined,
      renderSettingsKey: settingsKey,
      bgm: normalizedBgm,
      credits: args.credits,
      overlays: args.overlays,
      status: "pending",
    };
    planned.push({ group, state, reuse: false });
  }
  const manifest: VerticalDramaProductionEpisodesManifest = {
    groupSize: args.subEpisodesPerProductionEpisode,
    episodes: [
      ...existingEpisodes.filter(
        existing => !planned.some(item => item.state.index === existing.index)
      ),
      ...planned.map(item => item.state),
    ],
  };
  await persistManifest(args, manifest);

  let groupsCreated = 0;
  let groupsSkipped = planned.filter(item => item.reuse).length;
  for (const item of planned.filter(plannedItem => !plannedItem.reuse)) {
    const productionEpisodeNumber = item.state.productionEpisodeNumber!;
    const segments = item.group.subEpisodeNumbers.map(subEpisodeNumber => {
      const row = selectedRows.get(subEpisodeNumber)!;
      return {
        subEpisodeNumber,
        clips: resolveProductionEpisodeSource(row, args.sourceMode),
      };
    });
    try {
      const result = await submitVdProductionEpisodeAssembly({
        owner: {
          tenantId: args.tenantId,
          userId: args.userId,
          seriesId: args.seriesId,
        },
        productionEpisodeNumber,
        segments,
        internalBaseUrl: args.internalBaseUrl,
        publicBaseUrl: args.publicBaseUrl,
        seriesTitle: args.showSeriesTitle ? seriesState.title : null,
        showEpisodeIndicator: args.showEpisodeIndicator,
        showSeriesTitle: args.showSeriesTitle,
        watermarkImages: wm.images,
        watermarkTexts: wm.texts,
        bgm: normalizedBgm,
        credits: args.credits,
        overlays: args.overlays,
        idempotencyKey: `vd-production-episode:${args.seriesId}:${productionEpisodeNumber}:${item.state.startSubEpisode}-${item.state.endSubEpisode}:${args.sourceMode}:${settingsKey}`,
      });
      await patchGroup(args, item.state.index, {
        renderJobId: result.jobId,
        durationSeconds: result.durationSeconds,
      });
      groupsCreated += 1;
    } catch (error) {
      await patchGroup(args, item.state.index, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const finalState = await readSeriesState(args);
  return {
    groupsCreated,
    groupsSkipped,
    manifest:
      (finalState.productionEpisodesManifest as VerticalDramaProductionEpisodesManifest) ??
      manifest,
  };
}

export async function reconcileProductionEpisodeRemotionJobs(
  owner: Pick<
    AssembleProductionEpisodesRemotionArgs,
    "tenantId" | "userId" | "seriesId"
  >
): Promise<void> {
  const row = await readSeriesState(owner);
  const manifest =
    row.productionEpisodesManifest as VerticalDramaProductionEpisodesManifest | null;
  for (const group of manifest?.episodes ?? []) {
    if (
      group.renderer !== "remotion" ||
      group.status !== "pending" ||
      !group.renderJobId
    )
      continue;
    const [job] = await db
      .select()
      .from(workerJobs)
      .where(eq(workerJobs.id, group.renderJobId))
      .limit(1);
    if (
      !job ||
      [
        "queued",
        "claimed",
        "preparing",
        "running",
        "uploading",
        "publishing",
        "indexing",
      ].includes(job.status)
    )
      continue;
    if (job.status !== "completed") {
      await patchGroup(owner, group.index, {
        status: "failed",
        renderJobId: undefined,
        error: job.failureReason || `Remotion render ${job.status}`,
      });
      continue;
    }
    const videoUrl = await resolvePlayableOutput(job);
    if (!videoUrl) {
      await patchGroup(owner, group.index, {
        status: "failed",
        renderJobId: undefined,
        error: "Remotion render completed but produced no output URL",
      });
      continue;
    }
    await patchGroup(owner, group.index, {
      status: "completed",
      renderJobId: undefined,
      videoUrl,
      assembledAt: new Date().toISOString(),
      error: undefined,
    });
  }
}
