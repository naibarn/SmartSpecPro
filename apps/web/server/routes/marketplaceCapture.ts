import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import multer from "multer";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  libraryItems,
  marketplaceAutoReviewRuns,
  marketplaceProducts,
  mediaProductionRuns,
  mediaProductionSpaces,
  mediaStudioStoryboardReviews,
  storyboardPreviewMatchCaptureJobs,
} from "../../drizzle/schema";
import type { ProductionFlowNode, ProductionReferenceInput, ProductionShot, ProductionSpace } from "../../shared/mediaProduction";
import { createMarketplaceCaptureDraft, getMarketplaceCaptureForUser, getMarketplaceCandidateBatchForUser, saveMarketplaceCandidateBatch } from "../services/marketplaceCaptureService";
import { uploadMarketplaceCaptureAsset } from "../services/marketplaceAssetService";
import { analyzeMarketplaceCapture } from "../services/marketplaceExtractionService";
import { confirmMarketplaceCapture, lookupMarketplaceProductHistory } from "../services/marketplaceProductService";
import { marketplacePlatforms } from "../../shared/marketplaceCapture";
import {
  applyMarketplaceClaimResolution,
  buildBasicStorytellingHandoffFromCapture,
  generateMarketplaceServerInsight,
  getMarketplaceInsightForUser,
  listMarketplaceInsightsByCapture,
  listMarketplaceInsightsByProduct,
  syncMarketplaceInsight,
} from "../services/marketplaceInsightService";
import { getMarketplaceCaptureConfig, isAllowedMarketplaceOrigin } from "../services/marketplaceCaptureConfig";
import { requireMarketplaceAuth } from "../services/marketplaceExtensionAuthService";
import { marketplaceOwnerTenantScope } from "../services/marketplaceTenantScope";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { getProductionSpace, isProductionSpaceStorageUnavailable } from "../services/productionSpaceService";
import {
  listDramaSeriesProjectsForExtension,
  listDramaSeriesEpisodesForExtension,
  getDramaSeriesEpisodeDetailForExtension,
} from "../services/verticalDramaExtensionReadService";
import {
  listMarketplaceAutoReviewProjectsForExtension,
  getMarketplaceAutoReviewProjectForExtension,
} from "../services/marketplaceAutoReviewExtensionReadService";

function sendError(res: Response, error: any) {
  const status = Number(error?.status || (error instanceof z.ZodError ? 400 : 500));
  const code = String(error?.code || (error instanceof z.ZodError ? "invalid_request" : "internal_error"));
  res.status(status).json({
    error: {
      code,
      message: error instanceof z.ZodError ? error.errors[0]?.message ?? "Invalid request" : String(error?.message ?? "Internal server error"),
      retryable: Boolean(error?.retryable),
      requestId: res.locals.requestId ?? undefined,
    },
  });
}

const optionalLookupText = (max: number) =>
  z.preprocess(
    value => (typeof value === "string" && value.trim() ? value.trim() : undefined),
    z.string().max(max).optional()
  );

const productHistoryLookupQuerySchema = z.object({
  platform: z.enum(marketplacePlatforms),
  externalProductId: optionalLookupText(128),
  externalShopId: optionalLookupText(128),
  sourceUrl: optionalLookupText(2048),
});

function marketplaceCors(req: Request, res: Response, next: NextFunction) {
  const origin = String(req.headers.origin ?? "");
  if (origin && isAllowedMarketplaceOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With, X-Marketplace-Device-Id, X-Marketplace-Extension-Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") {
    return res.sendStatus(origin && !isAllowedMarketplaceOrigin(origin) ? 403 : 204);
  }
  next();
}

function compactProductionText(value: unknown, max = 2400): string {
  const textValue = typeof value === "string"
    ? value
    : (() => {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value ?? "");
      }
    })();
  const text = typeof textValue === "string" ? textValue : "";
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function readProductionPromptFromConfig(config: Record<string, unknown> | undefined): string {
  if (!config) return "";
  const keys = [
    "storyboardPrompt",
    "videoPrompt",
    "prompt",
    "mainPrompt",
    "finalPrompt",
    "imagePrompt",
    "scenePrompt",
    "visualPrompt",
  ];
  for (const key of keys) {
    const value = compactProductionText(config[key], 4000);
    if (value) return value;
  }
  return "";
}

function productionReferenceImagesFromRefs(refs: ProductionReferenceInput[] | undefined) {
  return (refs ?? [])
    .filter((ref) => ref.url || ref.thumbnailUrl)
    .filter((ref) => ["reference_image", "product_image", "character_asset", "generated_media", "marketplace_product"].includes(ref.kind))
    .map((ref) => ({
      id: ref.id,
      title: ref.title,
      url: ref.url ?? ref.thumbnailUrl ?? "",
      thumbnailUrl: ref.thumbnailUrl ?? ref.url ?? "",
      kind: ref.kind,
      role: ref.role ?? ref.zone ?? "",
      source: ref.source,
    }))
    .filter((ref) => ref.url);
}

function asProductionRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function productionStoryboardPromptItems(space: ProductionSpace): Record<string, unknown>[] {
  const storyboardNode = space.flowNodes.find((node) => node.id === "storyboard-card" || node.kind === "storyboard_planning");
  const latestOutput = storyboardNode?.outputRefs?.at(-1)?.metadata;
  const candidates = [
    latestOutput?.storyboardPrompts,
    storyboardNode?.configSnapshot?.config?.storyboardPrompts,
    storyboardNode?.metadata?.storyboardPrompts,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    return candidate.filter((item): item is Record<string, unknown> => Boolean(asProductionRecord(item)));
  }
  return [];
}

function productionPromptItemForShot(space: ProductionSpace, shot: ProductionShot): Record<string, unknown> | undefined {
  return productionStoryboardPromptItems(space).find((item) => (
    compactProductionText(item.shotId, 120) === shot.id
    || Number(item.order) === Number(shot.order)
  ));
}

function productionPromptField(item: Record<string, unknown> | undefined, key: string, max = 4000): string {
  return compactProductionText(item?.[key], max);
}

function productionMediaString(value: unknown, max = 2_000_000): string {
  if (typeof value !== "string") return compactProductionText(value, max);
  return value.trim().slice(0, max);
}

function productionStoryboardGridFrames(item: Record<string, unknown> | undefined) {
  const value = item?.storyboardGridFrames;
  if (!Array.isArray(value)) return [];
  return value
    .map((frame, fallbackIndex) => {
      const record = asProductionRecord(frame);
      const url = productionMediaString(record?.url);
      if (!record || !url) return null;
      return {
        index: Number.isFinite(Number(record.index)) ? Number(record.index) : fallbackIndex,
        row: Number.isFinite(Number(record.row)) ? Number(record.row) : Math.floor(fallbackIndex / 3),
        col: Number.isFinite(Number(record.col)) ? Number(record.col) : fallbackIndex % 3,
        url,
        name: compactProductionText(record.name, 160) || `Frame ${fallbackIndex + 1}`,
        sourceGridUrl: productionMediaString(record.sourceGridUrl) || undefined,
      };
    })
    .filter((frame): frame is NonNullable<typeof frame> => Boolean(frame))
    .sort((left, right) => left.index - right.index)
    .slice(0, 9);
}

function buildProductionReferencePromptLine(ref: { title: string; role?: string; kind: string; source?: string }, index: number): string {
  const label = [ref.role, ref.kind].filter(Boolean).join("/");
  return `Image ${index + 1}: ${ref.title || label || "reference image"}${label ? ` (${label})` : ""}${ref.source ? `, source: ${ref.source}` : ""}`;
}

function buildGenerationReadyStoryboardPrompt(input: {
  space: ProductionSpace;
  shot: ProductionShot;
  promptItem?: Record<string, unknown>;
  referenceImages: Array<{ title: string; role?: string; kind: string; source?: string }>;
}) {
  const { space, shot, promptItem, referenceImages } = input;
  const shots = [...space.shots].sort((left, right) => left.order - right.order);
  const nextShot = shots.find((item) => item.order === shot.order + 1);
  const nextPromptItem = nextShot ? productionPromptItemForShot(space, nextShot) : undefined;
  const productNames = (space.productEvidenceManifest?.products ?? [])
    .map((product) => compactProductionText(product.title, 160))
    .filter(Boolean)
    .slice(0, 5);
  const mustShow = [
    ...(shot.mustShow ?? []),
    ...((space.productEvidenceManifest?.products ?? []).flatMap((product) => product.reviewNotes ?? [])),
  ].map((item) => compactProductionText(item, 180)).filter(Boolean).slice(0, 8);
  const mustAvoid = (shot.mustAvoid ?? []).map((item) => compactProductionText(item, 180)).filter(Boolean).slice(0, 8);
  const script = productionPromptField(promptItem, "script", 1200) || compactProductionText(shot.script, 1200);
  const imageIntent = productionPromptField(promptItem, "imagePrompt", 4000) || compactProductionText(shot.visualIntent, 4000) || compactProductionText(shot.storyBeat, 4000);
  const videoIntent = productionPromptField(promptItem, "videoPrompt", 4000) || imageIntent;
  const promptLines = [
    `Create a generation-ready storyboard video shot using the attached reference images.`,
    `Shot ${shot.order}: ${shot.title || productionPromptField(promptItem, "title", 180) || "Untitled shot"}`,
    `Duration: ${Number(promptItem?.durationSeconds ?? shot.durationSeconds ?? 10) || 10} seconds`,
    `Format: ${compactProductionText(space.brief.aspectRatio, 40) || "vertical social video"}${space.brief.platform ? ` for ${compactProductionText(space.brief.platform, 80)}` : ""}`,
    space.brief.language ? `Language: ${compactProductionText(space.brief.language, 40)}` : "",
    space.brief.summary ? `Project brief: ${compactProductionText(space.brief.summary, 1200)}` : "",
    space.brief.creativeDirection ? `Creative direction: ${compactProductionText(space.brief.creativeDirection, 1200)}` : "",
    productNames.length ? `Product / subject truth: ${productNames.join(", ")}. Preserve the product design, proportions, color, materials, and visible details from the product reference.` : "",
    shot.storyBeat ? `Story beat: ${compactProductionText(shot.storyBeat, 1200)}` : "",
    videoIntent ? `Video action prompt: ${videoIntent}` : "",
    shot.cameraIntent ? `Camera and motion: ${compactProductionText(shot.cameraIntent, 1200)}` : "Camera and motion: use a clear, stable product-focused composition with natural motion that supports the story beat.",
    script ? `Spoken line / voiceover to include exactly as narration or dialogue: "${script}"` : "",
    shot.audioIntent ? `Audio direction: ${compactProductionText(shot.audioIntent, 1200)}` : "",
    referenceImages.length ? `Attached reference images to use: ${referenceImages.map(buildProductionReferencePromptLine).join("; ")}.` : "",
    referenceImages.length ? `Reference rules: use the product image for exact product appearance, use environment references for setting/mood only, and use character references for identity/wardrobe continuity only.` : "",
    mustShow.length ? `Must show: ${mustShow.join("; ")}` : "",
    mustAvoid.length ? `Must avoid: ${mustAvoid.join("; ")}` : "",
    nextShot ? `Continuity into next shot: end with a clean frame that can lead into Shot ${nextShot.order} (${nextShot.title}) - ${productionPromptField(nextPromptItem, "videoPrompt", 800) || compactProductionText(nextShot.storyBeat, 800)}` : "Continuity: end on a clean usable final frame for the next edit.",
    space.brief.constraintsText ? `Constraints: ${compactProductionText(space.brief.constraintsText, 1200)}` : "",
    `Do not invent unsupported product claims, logos, labels, or features. Avoid unreadable text overlays unless the storyboard explicitly requests text.`,
  ].filter(Boolean);
  return promptLines.join("\n");
}

function buildProductionDirectorShotView(space: ProductionSpace, shot: ProductionShot) {
  const nodeById = new Map(space.flowNodes.map((node) => [node.id, node]));
  const shotNodes = shot.nodeIds.map((nodeId) => nodeById.get(nodeId)).filter(Boolean) as ProductionFlowNode[];
  const promptNode = shotNodes.find((node) => node.kind === "prompt_packaging")
    ?? shotNodes.find((node) => ["video", "video_generate", "image_to_video", "image", "image_generate"].includes(node.kind));
  const prompt = readProductionPromptFromConfig(promptNode?.configSnapshot?.config)
    || compactProductionText((promptNode?.metadata as any)?.prompt, 4000)
    || compactProductionText(shot.visualIntent, 4000)
    || compactProductionText(shot.storyBeat, 4000);
  const nodeReferences = shotNodes.flatMap((node) => productionReferenceImagesFromRefs(node.referenceInputs));
  const productReferences = (space.productEvidenceManifest?.products ?? [])
    .filter((product) => !shot.productAssetIds?.length || shot.productAssetIds.includes(product.id))
    .map((product) => ({
      id: product.id,
      title: product.title,
      url: product.imageUrl ?? "",
      thumbnailUrl: product.imageUrl ?? "",
      kind: "product_image",
      role: product.role ?? "product",
      source: "production_product_evidence",
    }))
    .filter((ref) => ref.url);
  const contextReferences = productionReferenceImagesFromRefs(space.contextAssets)
    .filter((ref) => !shot.characterAssetIds?.length || shot.characterAssetIds.includes(ref.id) || ref.role === "product" || ref.kind === "product_image");
  const referenceImages = Array.from(new Map([...nodeReferences, ...productReferences, ...contextReferences]
    .map((ref) => [ref.url, ref])).values()).slice(0, 12);
  const promptItem = productionPromptItemForShot(space, shot);
  const storyboardGridPrompt = productionPromptField(promptItem, "referenceStoryboardPrompt", 8000)
    || productionPromptField(promptItem, "storyboardGridPrompt", 8000)
    || productionPromptField(promptItem, "imagePrompt", 8000)
    || prompt;
  const videoPrompt = productionPromptField(promptItem, "videoPrompt", 8000)
    || compactProductionText(shot.visualIntent, 8000)
    || compactProductionText(shot.storyBeat, 8000)
    || prompt;
  const storyboardGridFrames = productionStoryboardGridFrames(promptItem);
  const firstGridFrameUrl = storyboardGridFrames[0]?.url ?? "";
  const lastGridFrameUrl = storyboardGridFrames.at(-1)?.url ?? "";
  return {
    id: shot.id,
    order: shot.order,
    title: shot.title,
    durationSeconds: shot.durationSeconds ?? null,
    shotType: shot.shotType ?? null,
    storyBeat: shot.storyBeat ?? "",
    storyboardPrompt: buildGenerationReadyStoryboardPrompt({ space, shot, promptItem, referenceImages }) || prompt,
    storyboardGridPrompt,
    videoPrompt,
    storyboardGridImageUrl: productionMediaString(promptItem?.storyboardGridImageUrl),
    storyboardGridFrames,
    referenceImageUrl: productionMediaString(promptItem?.referenceImageUrl) || referenceImages[0]?.url || firstGridFrameUrl,
    startFrameUrl: productionMediaString(promptItem?.startFrameUrl) || firstGridFrameUrl,
    stopFrameUrl: productionMediaString(promptItem?.stopFrameUrl) || lastGridFrameUrl,
    script: shot.script ?? "",
    cameraIntent: shot.cameraIntent ?? "",
    visualIntent: shot.visualIntent ?? "",
    audioIntent: shot.audioIntent ?? "",
    customerJourneyStage: shot.customerJourneyStage ?? "",
    status: shot.status ?? "draft",
    referenceImages,
  };
}

async function listProductionDirectorProjectsForExtension(auth: { userId: number; tenantId?: string }, input: { query?: string; limit?: number }) {
  const db = getDb();
  const tenantId = resolveTenantIdVarchar(auth.tenantId, undefined);
  if (!tenantId) throw Object.assign(new Error("Tenant context is required"), { status: 400, code: "tenant_required" });
  const limit = Math.min(Math.max(Number(input.limit ?? 30) || 30, 1), 30);
  const rows = await db
    .select({
      productionRunId: mediaProductionRuns.productionRunId,
      status: mediaProductionRuns.status,
      goal: mediaProductionRuns.goal,
      productionBible: mediaProductionRuns.productionBible,
      createdAt: mediaProductionRuns.createdAt,
      updatedAt: mediaProductionRuns.updatedAt,
    })
    .from(mediaProductionRuns)
    .where(and(
      eq(mediaProductionRuns.tenantId, tenantId),
      eq(mediaProductionRuns.userId, auth.userId),
    ))
    .orderBy(desc(mediaProductionRuns.updatedAt))
    .limit(100);

  let spaceRows: any[] = [];
  try {
    spaceRows = await db
      .select()
      .from(mediaProductionSpaces)
      .where(and(
        eq(mediaProductionSpaces.tenantId, tenantId),
        eq(mediaProductionSpaces.userId, auth.userId),
      ))
      .orderBy(desc(mediaProductionSpaces.updatedAt))
      .limit(300);
  } catch (error) {
    if (!isProductionSpaceStorageUnavailable(error)) throw error;
  }
  const latestSpaceByRun = new Map<string, any>();
  for (const row of spaceRows) {
    if (!latestSpaceByRun.has(row.productionRunId)) latestSpaceByRun.set(row.productionRunId, row);
  }

  const query = compactProductionText(input.query, 120).toLowerCase();
  const projects = rows.map((row) => {
    const latestSpace = latestSpaceByRun.get(row.productionRunId);
    const space = latestSpace?.space as ProductionSpace | undefined;
    const goal = (row.goal && typeof row.goal === "object") ? row.goal as Record<string, any> : {};
    const brief = space?.brief ?? (goal.productionSpaceBrief && typeof goal.productionSpaceBrief === "object" ? goal.productionSpaceBrief as Record<string, any> : {});
    const title = compactProductionText(brief.title ?? goal.title ?? goal.projectTitle ?? brief.summary ?? goal.summary ?? row.productionRunId, 256);
    const summary = compactProductionText(brief.summary ?? goal.summary ?? goal.goalSummary ?? "", 600);
    const previewImage = space?.contextAssets?.find((asset) => asset.thumbnailUrl || asset.url);
    return {
      productionRunId: row.productionRunId,
      title,
      summary,
      status: space?.status ?? row.status,
      shotCount: space?.shots?.length ?? 0,
      referenceImageCount: space?.contextAssets?.filter((asset) => asset.url || asset.thumbnailUrl).length ?? 0,
      platform: compactProductionText(brief.platform ?? goal.platform ?? "", 80) || null,
      audience: compactProductionText(brief.audience ?? goal.audience ?? "", 120) || null,
      thumbnailUrl: previewImage?.thumbnailUrl ?? previewImage?.url ?? null,
      updatedAt: latestSpace?.updatedAt ?? space?.updatedAt ?? row.updatedAt,
      createdAt: row.createdAt,
      archivedAt: latestSpace?.archivedAt ?? null,
      deletedAt: latestSpace?.deletedAt ?? null,
    };
  })
    .filter((project) => !project.archivedAt && !project.deletedAt)
    .filter((project) => !query || [
      project.productionRunId,
      project.title,
      project.summary,
      project.status,
      project.platform ?? "",
      project.audience ?? "",
    ].join(" ").toLowerCase().includes(query))
    .slice(0, limit);

  return { projects };
}

async function getProductionDirectorProjectForExtension(auth: { userId: number; tenantId?: string }, productionRunId: string) {
  const db = getDb();
  const tenantId = resolveTenantIdVarchar(auth.tenantId, undefined);
  if (!tenantId) throw Object.assign(new Error("Tenant context is required"), { status: 400, code: "tenant_required" });
  const current = await getProductionSpace({ db, tenantId, userId: auth.userId, productionRunId });
  if (!current) throw Object.assign(new Error("Production Director project not found"), { status: 404, code: "production_project_not_found" });
  if (current.archivedAt || current.deletedAt) throw Object.assign(new Error("Production Director project is not active"), { status: 410, code: "production_project_inactive" });
  const space = current.space;
  return {
    project: {
      productionRunId,
      title: compactProductionText(space.brief?.title ?? space.brief?.summary ?? productionRunId, 256),
      summary: compactProductionText(space.brief?.summary ?? "", 1200),
      status: space.status,
      version: current.version,
      updatedAt: space.updatedAt ?? null,
      platform: compactProductionText(space.brief?.platform ?? "", 80) || null,
      audience: compactProductionText(space.brief?.audience ?? "", 120) || null,
      referenceImages: productionReferenceImagesFromRefs(space.contextAssets).slice(0, 30),
      shots: space.shots
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((shot) => buildProductionDirectorShotView(space, shot)),
    },
  };
}

function asStoryboardRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function storyboardMediaString(value: unknown, max = 2_000_000): string {
  if (typeof value === "string") return value.trim().slice(0, max);
  return compactProductionText(value, max);
}

function isStoryboardImageMedia(value: string): boolean {
  const text = value.trim().toLowerCase();
  if (!text) return false;
  if (text.startsWith("data:image/")) return true;
  if (text.startsWith("data:video/")) return false;
  return !/\.(mp4|webm|mov|m4v|avi|mkv)(?:[?#].*)?$/i.test(text);
}

function storyboardTextFromRecord(record: Record<string, unknown> | undefined, keys: string[], max = 8000): string {
  if (!record) return "";
  for (const key of keys) {
    const value = compactProductionText(record[key], max);
    if (value) return value;
  }
  return "";
}

function storyboardMediaFromRecord(record: Record<string, unknown> | undefined, keys: string[]): string {
  if (!record) return "";
  for (const key of keys) {
    const value = storyboardMediaString(record[key]);
    if (value) return value;
    const nested = asStoryboardRecord(record[key]);
    const nestedUrl = storyboardMediaString(nested?.url ?? nested?.thumbnailUrl ?? nested?.sourceUrl);
    if (nestedUrl) return nestedUrl;
  }
  return "";
}

function isStoryboardVideoMedia(value: string): boolean {
  const text = value.trim().toLowerCase();
  if (!text) return false;
  if (text.startsWith("data:video/")) return true;
  return /\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(text);
}

function findStoryboardVideoUrl(value: unknown, depth = 0): string {
  if (depth > 5 || value == null) return "";
  if (typeof value === "string") return isStoryboardVideoMedia(value) ? value.trim() : "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStoryboardVideoUrl(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  const record = asStoryboardRecord(value);
  if (!record) return "";
  const preferredKeys = [
    "finalVideoUrl",
    "final_video_url",
    "videoUrl",
    "video_url",
    "resultUrl",
    "result_url",
    "outputUrl",
    "output_url",
    "sourceUrl",
    "source_url",
    "url",
  ];
  for (const key of preferredKeys) {
    const candidate = storyboardMediaString(record[key]);
    if (isStoryboardVideoMedia(candidate)) return candidate;
  }
  for (const item of Object.values(record)) {
    const found = findStoryboardVideoUrl(item, depth + 1);
    if (found) return found;
  }
  return "";
}

function findAffiliateUrl(value: unknown, depth = 0): string {
  if (depth > 5 || value == null) return "";
  if (typeof value === "string") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAffiliateUrl(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  const record = asStoryboardRecord(value);
  if (!record) return "";
  for (const key of ["affiliateUrl", "affiliate_url", "latestAffiliateUrl", "latest_affiliate_url", "trackingUrl", "tracking_url"]) {
    const candidate = compactProductionText(record[key], 4096);
    if (/^https?:\/\//i.test(candidate)) return candidate;
  }
  for (const item of Object.values(record)) {
    const found = findAffiliateUrl(item, depth + 1);
    if (found) return found;
  }
  return "";
}

async function getStoryboardReviewMarketplaceMetadataForExtension(auth: { userId: number; tenantId?: string }, reviewId: number, reviewData: unknown) {
  const tenantId = auth.tenantId?.trim();
  if (!tenantId) throw Object.assign(new Error("Tenant context is required"), { status: 400, code: "tenant_required" });
  const db = getDb();
  const [run] = await db
    .select({
      resultJson: marketplaceAutoReviewRuns.resultJson,
      metadataJson: marketplaceAutoReviewRuns.metadataJson,
      updatedAt: marketplaceAutoReviewRuns.updatedAt,
      productAffiliateUrl: marketplaceProducts.affiliateUrl,
      productName: marketplaceProducts.productName,
      libraryTitle: libraryItems.title,
      librarySourceUrl: libraryItems.sourceUrl,
      libraryThumbnailUrl: libraryItems.thumbnailUrl,
      libraryItemType: libraryItems.itemType,
    })
    .from(marketplaceAutoReviewRuns)
    .leftJoin(marketplaceProducts, and(
      eq(marketplaceProducts.id, marketplaceAutoReviewRuns.productId),
      marketplaceOwnerTenantScope(marketplaceProducts.tenantId, tenantId),
    ))
    .leftJoin(libraryItems, and(
      eq(libraryItems.id, marketplaceAutoReviewRuns.resultLibraryItemId),
      eq(libraryItems.tenantId, tenantId),
      eq(libraryItems.ownerUserId, auth.userId),
    ))
    .where(and(
      eq(marketplaceAutoReviewRuns.userId, auth.userId),
      marketplaceOwnerTenantScope(marketplaceAutoReviewRuns.tenantId, tenantId),
      eq(marketplaceAutoReviewRuns.storyboardReviewId, String(reviewId)),
    ))
    .orderBy(desc(marketplaceAutoReviewRuns.updatedAt))
    .limit(1);
  const [captureJob] = await db
    .select({
      outputJson: storyboardPreviewMatchCaptureJobs.outputJson,
      updatedAt: storyboardPreviewMatchCaptureJobs.updatedAt,
    })
    .from(storyboardPreviewMatchCaptureJobs)
    .where(and(
      eq(storyboardPreviewMatchCaptureJobs.userId, auth.userId),
      eq(storyboardPreviewMatchCaptureJobs.tenantId, tenantId),
      eq(storyboardPreviewMatchCaptureJobs.storyboardReviewId, String(reviewId)),
    ))
    .orderBy(desc(storyboardPreviewMatchCaptureJobs.updatedAt))
    .limit(1);
  const captureLibraryRows = await db
    .select({
      title: libraryItems.title,
      sourceUrl: libraryItems.sourceUrl,
      thumbnailUrl: libraryItems.thumbnailUrl,
      metadata: libraryItems.metadata,
      updatedAt: libraryItems.updatedAt,
    })
    .from(libraryItems)
    .where(and(
      eq(libraryItems.ownerUserId, auth.userId),
      eq(libraryItems.tenantId, tenantId),
      eq(libraryItems.itemType, "video"),
      eq(libraryItems.source, "storyboard_preview_match_capture"),
    ))
    .orderBy(desc(libraryItems.updatedAt))
    .limit(30);
  const captureLibraryItem = captureLibraryRows.find((item) => {
    const metadata = asStoryboardRecord(item.metadata);
    return compactProductionText(metadata?.storyboard_review_id, 128) === String(reviewId)
      || compactProductionText(metadata?.storyboardReviewId, 128) === String(reviewId);
  });
  const finalVideoUrl = [
    run?.libraryItemType === "video" ? run.librarySourceUrl : "",
    captureLibraryItem?.sourceUrl,
    findStoryboardVideoUrl(captureJob?.outputJson),
    findStoryboardVideoUrl(run?.resultJson),
    findStoryboardVideoUrl(run?.metadataJson),
    findStoryboardVideoUrl(reviewData),
  ].find((url): url is string => Boolean(url && isStoryboardVideoMedia(url))) ?? null;
  const affiliateUrl = [
    run?.productAffiliateUrl,
    findAffiliateUrl(run?.metadataJson),
    findAffiliateUrl(run?.resultJson),
    findAffiliateUrl(reviewData),
  ].find((url): url is string => Boolean(url && /^https?:\/\//i.test(url))) ?? null;
  return {
    affiliateUrl,
    finalVideoUrl,
    finalVideoTitle: finalVideoUrl ? compactProductionText(captureLibraryItem?.title ?? run?.libraryTitle ?? run?.productName ?? "Storyboard final video", 180) || "Storyboard final video" : null,
    finalVideoThumbnailUrl: captureLibraryItem?.thumbnailUrl ?? run?.libraryThumbnailUrl ?? null,
    autoReviewUpdatedAt: captureJob?.updatedAt ?? captureLibraryItem?.updatedAt ?? run?.updatedAt ?? null,
  };
}

function storyboardReferenceImagesFromTask(task: Record<string, unknown> | undefined) {
  const context = asStoryboardRecord(task?.storyboardContext);
  const images = Array.isArray(context?.referenceImages)
    ? context?.referenceImages
    : Array.isArray(task?.referenceImages)
      ? task?.referenceImages
      : [];
  return images
    .map((item, index) => {
      const record = asStoryboardRecord(item);
      const url = storyboardMediaString(record?.url ?? item);
      if (!url) return null;
      return {
        id: compactProductionText(record?.id, 120) || `reference-${index + 1}`,
        title: compactProductionText(record?.name ?? record?.title, 160) || `Reference ${index + 1}`,
        url,
        role: compactProductionText(record?.role, 80) || (index === 0 ? "start" : index === 1 ? "stop" : "reference"),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function buildStoryboardReviewClipView(task: Record<string, unknown>, fallbackIndex: number) {
  const context = asStoryboardRecord(task.storyboardContext);
  const referenceImages = storyboardReferenceImagesFromTask(task);
  const startReferenceImage = referenceImages.find((image) => image.role === "start") ?? referenceImages[0];
  const stopReferenceImage = referenceImages.find((image) => image.role === "stop") ?? referenceImages[1];
  const referenceUrls = Array.isArray(task.referenceUrls)
    ? task.referenceUrls.map((url) => storyboardMediaString(url)).filter(Boolean)
    : [];
  const startFrameUrl = startReferenceImage?.url
    || storyboardMediaFromRecord(context, ["startFrameUrl", "start_frame_url", "startImageUrl"])
    || storyboardMediaFromRecord(task, ["startFrameUrl", "start_frame_url", "startImageUrl"])
    || referenceUrls[0]
    || "";
  const stopFrameUrl = stopReferenceImage?.url
    || storyboardMediaFromRecord(context, ["stopFrameUrl", "endFrameUrl", "stopImageUrl", "endImageUrl"])
    || storyboardMediaFromRecord(task, ["stopFrameUrl", "endFrameUrl", "stopImageUrl", "endImageUrl"])
    || referenceUrls[1]
    || "";
  const referenceImageUrl = storyboardMediaFromRecord(task, ["referenceImageUrl", "thumbnailUrl", "posterUrl"])
    || referenceImages[0]?.url
    || referenceUrls[0]
    || startFrameUrl
    || "";
  return {
    id: compactProductionText(task.id, 160) || `clip-${fallbackIndex + 1}`,
    order: Number.isFinite(Number(task.index)) ? Number(task.index) + 1 : fallbackIndex + 1,
    status: compactProductionText(task.status, 80) || "queued",
    statusDetail: compactProductionText(task.statusDetail, 240) || "",
    durationSeconds: Number.isFinite(Number(task.durationSeconds ?? context?.duration)) ? Number(task.durationSeconds ?? context?.duration) : null,
    model: compactProductionText(task.model ?? context?.model, 120) || null,
    videoPrompt: storyboardTextFromRecord(task, ["prompt", "videoPrompt", "finalPrompt", "generationPrompt"], 12000),
    videoUrl: storyboardMediaFromRecord(task, ["url", "videoUrl", "resultUrl"]),
    referenceImageUrl,
    startFrameUrl,
    stopFrameUrl,
    referenceImages: referenceImages.slice(0, 12),
  };
}

function storyboardTasksFromReviewData(reviewData: unknown): Record<string, unknown>[] {
  const data = asStoryboardRecord(reviewData);
  const rawTasks = Array.isArray(data?.tasks) ? data?.tasks : [];
  const taskById = new Map(rawTasks
    .map((task) => asStoryboardRecord(task))
    .filter((task): task is Record<string, unknown> => Boolean(task))
    .map((task) => [compactProductionText(task.id, 160), task]));
  const taskIds = Array.isArray(data?.taskIds) ? data?.taskIds.map((id) => compactProductionText(id, 160)).filter(Boolean) : [];
  const ordered = taskIds.map((id) => taskById.get(id)).filter((task): task is Record<string, unknown> => Boolean(task));
  const orderedIds = new Set(ordered.map((task) => compactProductionText(task.id, 160)));
  return [
    ...ordered,
    ...Array.from(taskById.values()).filter((task) => !orderedIds.has(compactProductionText(task.id, 160))),
  ];
}

function buildStoryboardReviewProjectSummary(row: {
  id: number;
  name: string;
  status: string;
  clipCount: number | null;
  completedClipCount: number | null;
  thumbnailUrl: string | null;
  reviewData: unknown;
  videoEditorProjectId: number | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const clips = storyboardTasksFromReviewData(row.reviewData).map(buildStoryboardReviewClipView);
  const firstImage = clips.find((clip) => [clip.referenceImageUrl, clip.startFrameUrl, clip.stopFrameUrl].some((url) => url && isStoryboardImageMedia(url)));
  const thumbnailUrl = [
    row.thumbnailUrl,
    firstImage?.referenceImageUrl,
    firstImage?.startFrameUrl,
    firstImage?.stopFrameUrl,
  ].find((url): url is string => Boolean(url && isStoryboardImageMedia(url)));
  return {
    id: row.id,
    title: row.name,
    status: row.status,
    clipCount: row.clipCount ?? clips.length,
    completedClipCount: row.completedClipCount ?? clips.filter((clip) => clip.status === "completed").length,
    thumbnailUrl: thumbnailUrl ?? null,
    videoEditorProjectId: row.videoEditorProjectId,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}

async function listStoryboardReviewProjectsForExtension(auth: { userId: number }, input: { query?: string; limit?: number }) {
  const db = getDb();
  const limit = Math.min(Math.max(Number(input.limit ?? 30) || 30, 1), 30);
  const query = compactProductionText(input.query, 120).toLowerCase();
  const rows = await db
    .select({
      id: mediaStudioStoryboardReviews.id,
      name: mediaStudioStoryboardReviews.name,
      status: mediaStudioStoryboardReviews.status,
      clipCount: mediaStudioStoryboardReviews.clipCount,
      completedClipCount: mediaStudioStoryboardReviews.completedClipCount,
      thumbnailUrl: mediaStudioStoryboardReviews.thumbnailUrl,
      reviewData: mediaStudioStoryboardReviews.reviewData,
      videoEditorProjectId: mediaStudioStoryboardReviews.videoEditorProjectId,
      createdAt: mediaStudioStoryboardReviews.createdAt,
      updatedAt: mediaStudioStoryboardReviews.updatedAt,
    })
    .from(mediaStudioStoryboardReviews)
    .where(and(
      eq(mediaStudioStoryboardReviews.userId, auth.userId),
      eq(mediaStudioStoryboardReviews.status, "active"),
    ))
    .orderBy(desc(mediaStudioStoryboardReviews.updatedAt))
    .limit(100);

  const projects = rows
    .map(buildStoryboardReviewProjectSummary)
    .filter((project) => !query || [
      project.id,
      project.title,
      project.status,
      project.clipCount,
      project.completedClipCount,
    ].join(" ").toLowerCase().includes(query))
    .slice(0, limit);

  return { projects };
}

async function getStoryboardReviewProjectForExtension(auth: { userId: number }, reviewId: number) {
  const db = getDb();
  const [row] = await db
    .select({
      id: mediaStudioStoryboardReviews.id,
      name: mediaStudioStoryboardReviews.name,
      status: mediaStudioStoryboardReviews.status,
      clipCount: mediaStudioStoryboardReviews.clipCount,
      completedClipCount: mediaStudioStoryboardReviews.completedClipCount,
      thumbnailUrl: mediaStudioStoryboardReviews.thumbnailUrl,
      reviewData: mediaStudioStoryboardReviews.reviewData,
      videoEditorProjectId: mediaStudioStoryboardReviews.videoEditorProjectId,
      createdAt: mediaStudioStoryboardReviews.createdAt,
      updatedAt: mediaStudioStoryboardReviews.updatedAt,
    })
    .from(mediaStudioStoryboardReviews)
    .where(and(
      eq(mediaStudioStoryboardReviews.id, reviewId),
      eq(mediaStudioStoryboardReviews.userId, auth.userId),
      eq(mediaStudioStoryboardReviews.status, "active"),
    ))
    .limit(1);
  if (!row) throw Object.assign(new Error("Storyboard review project not found"), { status: 404, code: "storyboard_review_project_not_found" });
  const summary = buildStoryboardReviewProjectSummary(row);
  const marketplaceMetadata = await getStoryboardReviewMarketplaceMetadataForExtension(auth, reviewId, row.reviewData);
  return {
    project: {
      ...summary,
      ...marketplaceMetadata,
      conceptDetails: compactProductionText(asStoryboardRecord(row.reviewData)?.conceptDetails, 3000),
      clips: storyboardTasksFromReviewData(row.reviewData).map(buildStoryboardReviewClipView),
    },
  };
}

export function registerMarketplaceCaptureRoutes(app: Express) {
  const router = express.Router();
  const config = getMarketplaceCaptureConfig();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: config.maxUploadBytes,
      files: 1,
      fields: 8,
    },
  });

  router.use(marketplaceCors);

  router.get("/health", (_req, res) => {
    res.json({ ok: true, enabled: getMarketplaceCaptureConfig().enabled });
  });

  router.post("/captures", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:capture");
      const result = await createMarketplaceCaptureDraft(req.body, auth);
      res.status(201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/captures/:captureId", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      res.json(await getMarketplaceCaptureForUser(req.params.captureId, auth));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/captures/:captureId/status", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      const { capture } = await getMarketplaceCaptureForUser(req.params.captureId, auth);
      res.json({
        captureId: capture.id,
        status: capture.status,
        errorMessage: capture.errorMessage,
        previewUrl: `/marketplace-capture/captures/${capture.id}/preview`,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/insights", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:capture");
      res.status(201).json(await syncMarketplaceInsight(req.body, auth));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/insights/server-generate", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:capture");
      res.json(await generateMarketplaceServerInsight(req.body, auth));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/insights/:insightId", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      res.json(await getMarketplaceInsightForUser(req.params.insightId, auth));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/insights/:insightId/claim-resolution", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:write");
      res.json(await applyMarketplaceClaimResolution({ ...req.body, insightId: req.params.insightId }, auth));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/captures/:captureId/insights", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      res.json(await listMarketplaceInsightsByCapture(req.params.captureId, auth));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/captures/:captureId/storytelling-handoff", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      const insights = await listMarketplaceInsightsByCapture(req.params.captureId, auth);
      const syncedHandoff = insights.find((insight) => insight.insightType === "storytelling_handoff");
      res.json(syncedHandoff?.payloadJson ?? await buildBasicStorytellingHandoffFromCapture(req.params.captureId, auth));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/production-director/projects", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      res.json(await listProductionDirectorProjectsForExtension(auth, {
        query: typeof req.query.query === "string" ? req.query.query : "",
        limit: Number(req.query.limit ?? 30),
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/production-director/project", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      const productionRunId = typeof req.query.productionRunId === "string" ? req.query.productionRunId : "";
      res.json(await getProductionDirectorProjectForExtension(auth, productionRunId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/production-director/projects/:productionRunId", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      res.json(await getProductionDirectorProjectForExtension(auth, req.params.productionRunId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/storyboard-review/projects", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      res.json(await listStoryboardReviewProjectsForExtension(auth, {
        query: typeof req.query.query === "string" ? req.query.query : "",
        limit: Number(req.query.limit ?? 30),
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/storyboard-review/project", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      const reviewId = Number(req.query.reviewId ?? 0);
      res.json(await getStoryboardReviewProjectForExtension(auth, reviewId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/storyboard-review/projects/:reviewId", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      res.json(await getStoryboardReviewProjectForExtension(auth, Number(req.params.reviewId)));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/drama-series/projects", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      res.json(await listDramaSeriesProjectsForExtension(auth, {
        query: typeof req.query.query === "string" ? req.query.query : "",
        limit: Number(req.query.limit ?? 50),
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/drama-series/episodes", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      const seriesId = Number(req.query.seriesId ?? 0);
      if (!Number.isFinite(seriesId) || !Number.isInteger(seriesId) || seriesId <= 0) {
        throw Object.assign(new Error("A valid seriesId is required"), { status: 400, code: "invalid_request" });
      }
      res.json(await listDramaSeriesEpisodesForExtension(auth, seriesId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/drama-series/episode", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      const seriesId = Number(req.query.seriesId ?? 0);
      const episodeId = Number(req.query.episodeId ?? 0);
      if (!Number.isFinite(seriesId) || !Number.isInteger(seriesId) || seriesId <= 0) {
        throw Object.assign(new Error("A valid seriesId is required"), { status: 400, code: "invalid_request" });
      }
      if (!Number.isFinite(episodeId) || !Number.isInteger(episodeId) || episodeId <= 0) {
        throw Object.assign(new Error("A valid episodeId is required"), { status: 400, code: "invalid_request" });
      }
      res.json(await getDramaSeriesEpisodeDetailForExtension(auth, seriesId, episodeId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/auto-review/projects", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      res.json(await listMarketplaceAutoReviewProjectsForExtension(auth, {
        query: typeof req.query.query === "string" ? req.query.query : "",
        limit: Number(req.query.limit ?? 30),
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/auto-review/project", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      const runId = typeof req.query.runId === "string" ? req.query.runId : "";
      if (!runId) {
        throw Object.assign(new Error("A valid runId is required"), { status: 400, code: "invalid_request" });
      }
      res.json(await getMarketplaceAutoReviewProjectForExtension(auth, runId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/products/lookup", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      const query = productHistoryLookupQuerySchema.parse({
        platform: req.query.platform,
        externalProductId: req.query.externalProductId,
        externalShopId: req.query.externalShopId,
        sourceUrl: req.query.sourceUrl,
      });
      res.json(await lookupMarketplaceProductHistory(query, auth));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/products/:productId/insights", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      res.json(await listMarketplaceInsightsByProduct(req.params.productId, auth));
    } catch (error) {
      sendError(res, error);
    }
  });

  const handleUploadAsset = async (req: Request, res: Response) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:capture");
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) throw Object.assign(new Error("Missing file"), { status: 400, code: "asset_file_missing" });
      const metadata = req.body.metadata ? JSON.parse(String(req.body.metadata)) : {};
      const result = await uploadMarketplaceCaptureAsset({
        captureId: String(req.params.captureId),
        userId: auth.userId,
        tenantId: auth.tenantId,
        file,
        kind: String(req.body.kind || ""),
        section: String(req.body.section || "general"),
        sourceUrl: req.body.sourceUrl ? String(req.body.sourceUrl) : null,
        metadata,
      });
      res.status(201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  };

  router.post("/captures/:captureId/assets", upload.single("file") as any, handleUploadAsset);
  router.post("/:captureId/assets", upload.single("file") as any, handleUploadAsset);

  const handleAnalyzeCapture = async (req: Request, res: Response) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:capture");
      res.json(await analyzeMarketplaceCapture(req.params.captureId, req.body, auth));
    } catch (error) {
      sendError(res, error);
    }
  };

  router.post("/captures/:captureId/analyze", handleAnalyzeCapture);
  router.post("/:captureId/analyze", handleAnalyzeCapture);

  router.post("/captures/:captureId/confirm", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:write");
      res.json(await confirmMarketplaceCapture(req.params.captureId, req.body, auth));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/category-candidates", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:capture");
      res.status(201).json(await saveMarketplaceCandidateBatch(req.body, auth));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/category-candidates/:batchId", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      res.json(await getMarketplaceCandidateBatchForUser(req.params.batchId, auth));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.use("/api/marketplace-captures", router);
}
