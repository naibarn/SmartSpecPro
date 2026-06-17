/**
 * Video Editor Projects tRPC Router
 * CRUD operations for persistent video editor project storage with auto-save support.
 */

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  marketplaceAutoReviewRuns,
  marketplaceProducts,
  mediaStudioStoryboardReviews,
  videoEditorProjects,
} from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  UpdateStoryboardReviewHyperframesFinalCompositeInputSchema,
  mergeStoryboardReviewHyperframesFinalCompositeState,
} from "../../shared/hyperframes/storyboardReviewState";
import {
  storageKeyFromManagedHyperframesMediaUrl,
  transcribeHyperframesStoryboardShot,
} from "../services/hyperframesTranscriptionService";

const STORYBOARD_REVIEW_SERVER_DEBUG_BUILD = "storyboard-review-server-audio-debug-20260527-2245";
const STORYBOARD_REVIEW_CLIENT_DEBUG_BUILD = "storyboard-review-client-lifecycle-debug-20260527-2325";

export function getReviewDataUpdatedAt(reviewData: unknown): number {
  if (!reviewData || typeof reviewData !== "object") return 0;
  const updatedAt = (reviewData as { updatedAt?: unknown }).updatedAt;
  return typeof updatedAt === "number" && Number.isFinite(updatedAt) ? updatedAt : 0;
}

function getTaskUpdatedAt(task: unknown): number {
  if (!task || typeof task !== "object") return 0;
  const updatedAt = (task as { updatedAt?: unknown }).updatedAt;
  return typeof updatedAt === "number" && Number.isFinite(updatedAt) ? updatedAt : 0;
}

function getTaskId(task: unknown): string | null {
  if (!task || typeof task !== "object") return null;
  const id = (task as { id?: unknown }).id;
  return typeof id === "string" && id.trim().length > 0 ? id : null;
}

function getTaskUrl(task: unknown): string {
  if (!task || typeof task !== "object") return "";
  const url = (task as { url?: unknown }).url;
  return typeof url === "string" ? url : "";
}

function isStoryboardReviewRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getStoryboardReviewServerOwnedHyperframesFinalComposite(
  reviewData: unknown,
): Record<string, unknown> | null {
  if (!isStoryboardReviewRecord(reviewData)) return null;
  const state = reviewData.hyperframesFinalComposite;
  return isStoryboardReviewRecord(state) ? state : null;
}

function stripClientOwnedHyperframesFinalComposite(reviewData: unknown): unknown {
  if (!isStoryboardReviewRecord(reviewData) || !("hyperframesFinalComposite" in reviewData)) {
    return reviewData;
  }
  const safeReviewData = { ...reviewData };
  delete safeReviewData.hyperframesFinalComposite;
  return safeReviewData;
}

function applyServerOwnedHyperframesFinalComposite(
  existingReviewData: unknown,
  incomingReviewData: unknown,
): unknown {
  const safeIncomingReviewData = stripClientOwnedHyperframesFinalComposite(incomingReviewData);
  const serverOwnedState = getStoryboardReviewServerOwnedHyperframesFinalComposite(existingReviewData);
  if (!serverOwnedState || !isStoryboardReviewRecord(safeIncomingReviewData)) {
    return safeIncomingReviewData;
  }
  return {
    ...safeIncomingReviewData,
    hyperframesFinalComposite: serverOwnedState,
  };
}

function hasStoryboardMarketplaceContext(value: unknown): value is Record<string, unknown> {
  if (!isStoryboardReviewRecord(value)) return false;
  return [
    "productId",
    "marketplaceProductId",
    "itemId",
    "productItemId",
    "externalProductId",
    "shopId",
    "externalShopId",
    "sourceUrl",
    "productSourceUrl",
    "productName",
    "productTitle",
    "title",
  ].some((key) => {
    const item = value[key];
    return (typeof item === "string" && item.trim().length > 0) || typeof item === "number";
  });
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const STORYBOARD_REVIEW_CHARACTER_GENDER_PROMPT_LABELS: Record<string, string> = {
  female: "female presenter/woman",
  male: "male presenter/man",
  gender_neutral: "gender-neutral adult presenter",
};

const STORYBOARD_REVIEW_CHARACTER_AGE_PROMPT_LABELS: Record<string, string> = {
  young_adult_20_29: "20-29 years old",
  adult_30_39: "30-39 years old",
  middle_age_40_59: "40-59 years old",
  teen_16_19: "16-19 years old",
};

const STORYBOARD_REVIEW_CHARACTER_APPEARANCE_PROMPT_LABELS: Record<string, string> = {
  thai: "Thai",
  southeast_asian: "Southeast Asian",
  east_asian: "East Asian",
  international: "international",
};

const STORYBOARD_REVIEW_CHARACTER_ROLE_PROMPT_LABELS: Record<string, string> = {
  reviewer: "reviewer",
  buyer: "real buyer",
  mom_parent: "parent/guardian reviewer",
  office_worker: "office worker reviewer",
  technician: "practical expert/technician",
  creator_host: "creator host",
};

const STORYBOARD_REVIEW_CHARACTER_STYLE_PROMPT_LABELS: Record<string, string> = {
  casual_home: "casual home style",
  clean_ugc: "clean UGC style",
  premium_neat: "premium neat style",
  friendly_everyday: "friendly everyday style",
  expert_practical: "practical expert style",
};

function storyboardReviewPromptLabelFromChoice(
  id: unknown,
  label: unknown,
  lookup: Record<string, string>,
): string {
  const mapped = lookup[cleanString(id).toLowerCase()];
  if (mapped) return mapped;
  const text = cleanString(label);
  return /^auto$/i.test(text) ? "" : text;
}

function storyboardReviewPromptAgeLabel(id: unknown, label: unknown): string {
  const mapped =
    STORYBOARD_REVIEW_CHARACTER_AGE_PROMPT_LABELS[
      cleanString(id).toLowerCase()
    ];
  if (mapped) return mapped;
  const text = cleanString(label);
  if (!text || /^auto$/i.test(text)) return "";
  return /^\d{2}\s*[-–]\s*\d{2}$/.test(text) ? `${text} years old` : text;
}

function storyboardReviewCharacterPresetFromContext(
  autoReviewContext: Record<string, unknown> | null,
): Record<string, unknown> {
  const metadata = isStoryboardReviewRecord(autoReviewContext?.metadataJson)
    ? autoReviewContext.metadataJson
    : {};
  const anchors = isStoryboardReviewRecord(autoReviewContext?.referenceAnchors)
    ? autoReviewContext.referenceAnchors
    : isStoryboardReviewRecord(metadata.referenceAnchors)
      ? metadata.referenceAnchors
      : {};
  return isStoryboardReviewRecord(anchors.characterPreset)
    ? anchors.characterPreset
    : {};
}

function storyboardReviewReferenceAnchorsFromContext(
  autoReviewContext: Record<string, unknown> | null,
): Record<string, unknown> {
  const metadata = isStoryboardReviewRecord(autoReviewContext?.metadataJson)
    ? autoReviewContext.metadataJson
    : {};
  return isStoryboardReviewRecord(autoReviewContext?.referenceAnchors)
    ? autoReviewContext.referenceAnchors
    : isStoryboardReviewRecord(metadata.referenceAnchors)
      ? metadata.referenceAnchors
      : {};
}

function storyboardReviewCharacterSubjectFromContext(
  autoReviewContext: Record<string, unknown> | null,
): string {
  const preset = storyboardReviewCharacterPresetFromContext(autoReviewContext);
  return [
    storyboardReviewPromptLabelFromChoice(
      preset.appearance,
      preset.appearanceLabel,
      STORYBOARD_REVIEW_CHARACTER_APPEARANCE_PROMPT_LABELS,
    ),
    storyboardReviewPromptLabelFromChoice(
      preset.gender,
      preset.genderLabel,
      STORYBOARD_REVIEW_CHARACTER_GENDER_PROMPT_LABELS,
    ),
    storyboardReviewPromptAgeLabel(preset.age, preset.ageLabel),
    storyboardReviewPromptLabelFromChoice(
      preset.role,
      preset.roleLabel,
      STORYBOARD_REVIEW_CHARACTER_ROLE_PROMPT_LABELS,
    ),
    storyboardReviewPromptLabelFromChoice(
      preset.style,
      preset.styleLabel,
      STORYBOARD_REVIEW_CHARACTER_STYLE_PROMPT_LABELS,
    ),
  ]
    .map(cleanString)
    .filter(Boolean)
    .join(", ");
}

function storyboardReviewCharacterVisualDetailsFromContext(
  autoReviewContext: Record<string, unknown> | null,
): string {
  const preset = storyboardReviewCharacterPresetFromContext(autoReviewContext);
  return [
    cleanString(preset.primaryCharacterDetails)
      ? `Character 1 additional details: ${cleanString(preset.primaryCharacterDetails)}`
      : "",
    cleanString(preset.secondaryCharacterDetails)
      ? `Character 2 details: ${cleanString(preset.secondaryCharacterDetails)}`
      : "",
    cleanString(preset.propDetails)
      ? `Prop details: ${cleanString(preset.propDetails)}`
      : "",
  ]
    .map(cleanString)
    .filter(Boolean)
    .join("; ");
}

function buildStoryboardReviewCharacterVideoLockFromContext(
  autoReviewContext: Record<string, unknown> | null,
): string {
  const anchors = storyboardReviewReferenceAnchorsFromContext(autoReviewContext);
  const preset = storyboardReviewCharacterPresetFromContext(autoReviewContext);
  const characterMode = cleanString(anchors.characterMode) || cleanString(preset.mode);
  const hasCharacterImage = Boolean(
    cleanString(anchors.characterImageUrl) ||
      cleanString(anchors.characterImageRef) ||
      cleanString(anchors.characterImageProvidedRef),
  );
  if (characterMode === "uploaded_reference" && hasCharacterImage) {
    return [
      "VIDEO CHARACTER LOCK:",
      "The uploaded character reference image is the presenter source of truth.",
      "For Veo 3.1, infer the presenter's apparent gender presentation, age range, maturity, styling, and reviewer persona from the uploaded character image and visible reference frames.",
      "The spoken Thai voice must match that apparent character from the image; hidden/default character-choice values must not override the uploaded reference.",
    ].join(" ");
  }
  const subject = storyboardReviewCharacterSubjectFromContext(autoReviewContext);
  const characterBrief = cleanString(anchors.characterBrief);
  const visualDetails =
    storyboardReviewCharacterVisualDetailsFromContext(autoReviewContext);
  if (!subject && !characterBrief && !visualDetails) return "";
  return [
    "VIDEO CHARACTER LOCK:",
    "The selected character choices are the presenter source of truth.",
    subject
      ? `For Veo 3.1, any visible presenter/reviewer must be ${subject}.`
      : "",
    visualDetails ? `User-selected visual details: ${visualDetails}.` : "",
    characterBrief ? `User-selected character brief: ${characterBrief}` : "",
    "Keep the presenter's gender, age range, appearance, role, wardrobe family, and identity consistent with the selected image/frame references across shots.",
    "Do not let a generic audio profile override the selected presenter demographics.",
  ].filter(Boolean).join(" ");
}

function buildStoryboardReviewCharacterVoiceLockFromContext(
  autoReviewContext: Record<string, unknown> | null,
): string {
  const anchors = storyboardReviewReferenceAnchorsFromContext(autoReviewContext);
  const preset = storyboardReviewCharacterPresetFromContext(autoReviewContext);
  const characterMode = cleanString(anchors.characterMode) || cleanString(preset.mode);
  const hasCharacterImage = Boolean(
    cleanString(anchors.characterImageUrl) ||
      cleanString(anchors.characterImageRef) ||
      cleanString(anchors.characterImageProvidedRef),
  );
  if (characterMode === "uploaded_reference" && hasCharacterImage) {
    return [
      "Uploaded character reference voice lock: infer the Thai spoken voice from the visible presenter in the uploaded character reference image and current frame references.",
      "Match the presenter's apparent gender presentation, age range, maturity, and reviewer persona from that image.",
      "Do not use any default demographic voice profile unless it matches the uploaded character reference.",
      "Voice style: natural clear Thai delivery, central Thai accent, ecommerce review tone.",
    ].join(" ");
  }
  const subject = storyboardReviewCharacterSubjectFromContext(autoReviewContext);
  if (!subject) return "";
  return [
    `Selected presenter voice lock: ${subject}.`,
    "Use a voice that matches the selected presenter gender and age range.",
    "Voice style: natural clear Thai delivery, central Thai accent, ecommerce review tone.",
  ].join(" ");
}

function storyboardReviewPromptHasGenericFemaleVoice(prompt: string): boolean {
  return /\bfemale presenter\b|\byoung female host\b|\byoung mother-style female voice\b|\bfemale voice\b/i.test(prompt);
}

function removeStoryboardReviewPerShotCreativeDirectionLock(prompt: string): string {
  return prompt
    .replace(
      /\s*USER-SELECTED CREATIVE DIRECTION LOCK:\s*(?:Review tone:\s*.*?\.\s*)?(?:Storytelling structure:\s*.*?\.\s*)?Preserve this tone and story arc in rewritten video prompts unless it conflicts with product truth, policy, shot timing, or reference anchors\.\s*/gi,
      " ",
    )
    .replace(
      /\s*USER-SELECTED CREATIVE DIRECTION LOCK:\s*(?:Review tone:\s*.*?\.\s*)?Storytelling structure:\s*.*?(?=\s+(?:VIDEO CHARACTER LOCK:|Uploaded character reference voice lock:|Selected presenter voice lock:|Create an?\s+\d|Scene:|Characters:|Action:|Camera:|Lighting\s*\/\s*Style:|Audio:|Dialogue:)|$)/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function repairStoryboardReviewPromptCharacterLock(
  prompt: string,
  autoReviewContext: Record<string, unknown> | null,
): string {
  let next = removeStoryboardReviewPerShotCreativeDirectionLock(prompt);
  const videoLock = buildStoryboardReviewCharacterVideoLockFromContext(autoReviewContext);
  const voiceLock = buildStoryboardReviewCharacterVoiceLockFromContext(autoReviewContext);
  if (!videoLock && !voiceLock) return next;
  if (videoLock && !/VIDEO CHARACTER LOCK:/i.test(next)) {
    next = /Characters:\s*/i.test(next)
      ? next.replace(/Characters:\s*/i, match => `${match}${videoLock} `)
      : `${videoLock} ${next}`;
  }
  if (voiceLock && storyboardReviewPromptHasGenericFemaleVoice(next)) {
    const voicePattern =
      /Voice:\s*[\s\S]*?(?=\s+Dialogue must be spoken|\s+Lip-sync clearly|\s+Dialogue pacing:|\s+No subtitles|\s+Dialogue:|$)/i;
    next = voicePattern.test(next)
      ? next.replace(voicePattern, `Voice: ${voiceLock}`)
      : `${next} Voice: ${voiceLock}`;
  }
  return next;
}

function repairStoryboardReviewPromptRecord(
  value: unknown,
  autoReviewContext: Record<string, unknown> | null,
): unknown {
  if (!isStoryboardReviewRecord(value)) return value;
  const prompt = cleanString(value.prompt);
  if (!prompt) return value;
  const nextPrompt = repairStoryboardReviewPromptCharacterLock(
    prompt,
    autoReviewContext,
  );
  return nextPrompt === prompt ? value : { ...value, prompt: nextPrompt };
}

export function repairStoryboardReviewMarketplacePromptLocks(
  reviewData: unknown,
  autoReviewContext: Record<string, unknown> | null,
): unknown {
  if (!isStoryboardReviewRecord(reviewData)) return reviewData;
  let changed = false;
  const repairList = (value: unknown): unknown => {
    if (!Array.isArray(value)) return value;
    let listChanged = false;
    const next = value.map(item => {
      const repaired = repairStoryboardReviewPromptRecord(item, autoReviewContext);
      if (repaired !== item) listChanged = true;
      return repaired;
    });
    if (listChanged) changed = true;
    return listChanged ? next : value;
  };
  const nextTasks = repairList(reviewData.tasks);
  const nextClips = repairList(reviewData.clips);
  const output = isStoryboardReviewRecord(reviewData.output)
    ? reviewData.output
    : null;
  const nextOutputClips = output ? repairList(output.clips) : null;
  if (!changed) return reviewData;
  return {
    ...reviewData,
    tasks: nextTasks,
    clips: nextClips,
    output: output && nextOutputClips !== output.clips
      ? { ...output, clips: nextOutputClips }
      : reviewData.output,
    marketplacePromptRepair: {
      ...(isStoryboardReviewRecord(reviewData.marketplacePromptRepair)
        ? reviewData.marketplacePromptRepair
        : {}),
      characterVoiceLock: "metadata_reference_anchors",
    },
  };
}

function getStoryboardReviewMarketplaceProductId(reviewData: unknown): string {
  if (!isStoryboardReviewRecord(reviewData)) return "";
  const contexts = [
    reviewData.marketplaceContext,
    reviewData.marketplaceProduct,
  ];
  for (const context of contexts) {
    if (!isStoryboardReviewRecord(context)) continue;
    const productId =
      cleanString(context.productId) ||
      cleanString(context.marketplaceProductId) ||
      cleanString(context.id);
    if (productId) return productId;
  }
  return "";
}

function normalizeStoryboardReviewManagedMediaUrl(value: unknown): string {
  const text = cleanString(value);
  const key = storageKeyFromManagedHyperframesMediaUrl(text);
  return key ? `/api/storage/files/${encodeURI(key)}` : text;
}

function storyboardReviewContainsManagedVideoUrl(reviewData: unknown, sourceVideoUrl: string): boolean {
  if (!isStoryboardReviewRecord(reviewData)) return false;
  const target = normalizeStoryboardReviewManagedMediaUrl(sourceVideoUrl);
  if (!storageKeyFromManagedHyperframesMediaUrl(target)) return false;
  const candidates: unknown[] = [];
  const collectFromRecord = (record: Record<string, unknown>) => {
    for (const key of [
      "url",
      "sourceUrl",
      "sourceVideoUrl",
      "videoUrl",
      "resultUrl",
      "storageRef",
    ]) {
      if (record[key]) candidates.push(record[key]);
    }
  };
  const collectList = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      if (isStoryboardReviewRecord(item)) collectFromRecord(item);
    }
  };

  collectList(reviewData.tasks);
  collectList(reviewData.clips);
  if (isStoryboardReviewRecord(reviewData.output)) {
    collectList(reviewData.output.clips);
  }
  if (isStoryboardReviewRecord(reviewData.hyperframesFinalComposite)) {
    collectList(reviewData.hyperframesFinalComposite.shotMediaAssignments);
  }

  return candidates.some(candidate => normalizeStoryboardReviewManagedMediaUrl(candidate) === target);
}

function getStoryboardReviewTaskAutoReviewRunIds(reviewData: unknown): Set<string> {
  const runIds = new Set<string>();
  if (!isStoryboardReviewRecord(reviewData)) return runIds;
  const tasks = Array.isArray(reviewData.tasks) ? reviewData.tasks : [];
  for (const task of tasks) {
    if (!isStoryboardReviewRecord(task)) continue;
    const storyboardContext = isStoryboardReviewRecord(task.storyboardContext)
      ? task.storyboardContext
      : null;
    const extraParams = isStoryboardReviewRecord(storyboardContext?.extraParams)
      ? storyboardContext.extraParams
      : null;
    const runId =
      cleanString(extraParams?.autoReviewRunId) ||
      cleanString(extraParams?.marketplaceAutoReviewRunId);
    if (runId) runIds.add(runId);
  }
  return runIds;
}

export function getStoryboardReviewAutoReviewRunId(reviewData: unknown): string {
  if (!isStoryboardReviewRecord(reviewData)) return "";
  const topLevelRunId =
    cleanString(reviewData.autoReviewRunId) ||
    cleanString(reviewData.marketplaceAutoReviewRunId);
  if (topLevelRunId) return topLevelRunId;

  const directContext = isStoryboardReviewRecord(reviewData.marketplaceContext)
    ? reviewData.marketplaceContext
    : null;
  const directRunId =
    cleanString(directContext?.autoReviewRunId) ||
    cleanString(directContext?.marketplaceAutoReviewRunId);
  if (directRunId) return directRunId;

  const taskRunIds = getStoryboardReviewTaskAutoReviewRunIds(reviewData);
  return taskRunIds.size === 1 ? [...taskRunIds][0]! : "";
}

function parseStoryboardReviewId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  const parsed = Number(cleanString(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

export function mergeStoryboardReviewMarketplaceContext(
  reviewData: unknown,
  marketplaceContext: Record<string, unknown> | null,
): unknown {
  if (!isStoryboardReviewRecord(reviewData)) return reviewData;
  const existingContext = hasStoryboardMarketplaceContext(reviewData.marketplaceContext)
    ? reviewData.marketplaceContext
    : null;
  if (existingContext) return reviewData;

  const embeddedProduct = hasStoryboardMarketplaceContext(reviewData.marketplaceProduct)
    ? reviewData.marketplaceProduct
    : null;
  const resolvedContext = embeddedProduct
    ? { ...(marketplaceContext ?? {}), ...embeddedProduct }
    : marketplaceContext;
  if (!resolvedContext || !hasStoryboardMarketplaceContext(resolvedContext)) return reviewData;

  return {
    ...reviewData,
    marketplaceContext: resolvedContext,
    marketplaceProduct: reviewData.marketplaceProduct ?? resolvedContext,
  };
}

async function getStoryboardReviewAutoReviewContext(params: {
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  userId: number;
  reviewId: number;
  reviewData: unknown;
}) {
  const autoReviewRunId = getStoryboardReviewAutoReviewRunId(params.reviewData);
  const where = autoReviewRunId
    ? and(
        eq(marketplaceAutoReviewRuns.id, autoReviewRunId),
        eq(marketplaceAutoReviewRuns.userId, params.userId),
      )
    : and(
        eq(marketplaceAutoReviewRuns.storyboardReviewId, String(params.reviewId)),
        eq(marketplaceAutoReviewRuns.userId, params.userId),
      );

  const [autoReviewProduct] = await params.db
    .select({
      runId: marketplaceAutoReviewRuns.id,
      currentStoryboardReviewId: marketplaceAutoReviewRuns.storyboardReviewId,
      metadataJson: marketplaceAutoReviewRuns.metadataJson,
      productId: marketplaceProducts.id,
      platform: marketplaceProducts.platform,
      itemId: marketplaceProducts.externalProductId,
      productItemId: marketplaceProducts.externalProductId,
      externalProductId: marketplaceProducts.externalProductId,
      shopId: marketplaceProducts.externalShopId,
      externalShopId: marketplaceProducts.externalShopId,
      sourceUrl: marketplaceProducts.sourceUrl,
      productSourceUrl: marketplaceProducts.sourceUrl,
      affiliateUrl: marketplaceProducts.affiliateUrl,
      productName: marketplaceProducts.productName,
      productTitle: marketplaceProducts.productName,
      title: marketplaceProducts.productName,
      brand: marketplaceProducts.brand,
      shopName: marketplaceProducts.shopName,
      productCategory: marketplaceProducts.productCategory,
    })
    .from(marketplaceAutoReviewRuns)
    .innerJoin(
      marketplaceProducts,
      eq(marketplaceProducts.id, marketplaceAutoReviewRuns.productId),
    )
    .where(where)
    .orderBy(desc(marketplaceAutoReviewRuns.updatedAt))
    .limit(1);

  if (!autoReviewProduct) return null;
  const currentStoryboardReviewId = parseStoryboardReviewId(
    autoReviewProduct.currentStoryboardReviewId,
  );
  const metadata = isStoryboardReviewRecord(autoReviewProduct.metadataJson)
    ? autoReviewProduct.metadataJson
    : {};
  const referenceAnchors = isStoryboardReviewRecord(metadata.referenceAnchors)
    ? metadata.referenceAnchors
    : null;
  return {
    ...autoReviewProduct,
    referenceAnchors,
    currentStoryboardReviewId,
    isSuperseded:
      currentStoryboardReviewId !== null &&
      currentStoryboardReviewId !== params.reviewId,
  };
}

async function normalizeStoryboardReviewCanonicalLinks(params: {
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  userId: number;
  reviewData: unknown;
}) {
  if (!isStoryboardReviewRecord(params.reviewData)) return params.reviewData;
  const autoReviewRunId = getStoryboardReviewAutoReviewRunId(params.reviewData);
  if (!autoReviewRunId) return params.reviewData;
  const taskRunIds = getStoryboardReviewTaskAutoReviewRunIds(params.reviewData);
  if ([...taskRunIds].some(runId => runId !== autoReviewRunId)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Storyboard Review contains mixed Auto Review run IDs.",
    });
  }

  const [runProduct] = await params.db
    .select({
      runId: marketplaceAutoReviewRuns.id,
      storyboardReviewId: marketplaceAutoReviewRuns.storyboardReviewId,
      productId: marketplaceProducts.id,
      platform: marketplaceProducts.platform,
      itemId: marketplaceProducts.externalProductId,
      productItemId: marketplaceProducts.externalProductId,
      externalProductId: marketplaceProducts.externalProductId,
      shopId: marketplaceProducts.externalShopId,
      externalShopId: marketplaceProducts.externalShopId,
      sourceUrl: marketplaceProducts.sourceUrl,
      productSourceUrl: marketplaceProducts.sourceUrl,
      affiliateUrl: marketplaceProducts.affiliateUrl,
      productName: marketplaceProducts.productName,
      productTitle: marketplaceProducts.productName,
      title: marketplaceProducts.productName,
      brand: marketplaceProducts.brand,
      shopName: marketplaceProducts.shopName,
      productCategory: marketplaceProducts.productCategory,
    })
    .from(marketplaceAutoReviewRuns)
    .innerJoin(
      marketplaceProducts,
      eq(marketplaceProducts.id, marketplaceAutoReviewRuns.productId),
    )
    .where(
      and(
        eq(marketplaceAutoReviewRuns.id, autoReviewRunId),
        eq(marketplaceAutoReviewRuns.userId, params.userId),
      ),
    )
    .limit(1);

  if (!runProduct) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Auto review run linked to this Storyboard Review was not found.",
    });
  }

  const existingProductId = getStoryboardReviewMarketplaceProductId(params.reviewData);
  if (existingProductId && existingProductId !== runProduct.productId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Storyboard Review product does not match its Auto Review run.",
    });
  }

  const existingContext = isStoryboardReviewRecord(params.reviewData.marketplaceContext)
    ? params.reviewData.marketplaceContext
    : {};
  const existingProduct = isStoryboardReviewRecord(params.reviewData.marketplaceProduct)
    ? params.reviewData.marketplaceProduct
    : {};
  const canonicalContext = {
    ...runProduct,
    ...existingProduct,
    ...existingContext,
    productId: runProduct.productId,
    marketplaceProductId: runProduct.productId,
    autoReviewRunId,
    marketplaceAutoReviewRunId: autoReviewRunId,
  };

  return {
    ...params.reviewData,
    autoReviewRunId,
    marketplaceAutoReviewRunId: autoReviewRunId,
    sourceProductId: runProduct.productId,
    marketplaceContext: canonicalContext,
    marketplaceProduct: {
      ...canonicalContext,
      ...existingProduct,
      productId: runProduct.productId,
      marketplaceProductId: runProduct.productId,
      autoReviewRunId,
      marketplaceAutoReviewRunId: autoReviewRunId,
    },
  };
}

function mergeStoryboardPlannerMetadata(existingValue: unknown, incomingValue: unknown): unknown {
  if (!isStoryboardReviewRecord(existingValue) && !isStoryboardReviewRecord(incomingValue)) {
    return existingValue ?? incomingValue;
  }
  if (!isStoryboardReviewRecord(existingValue)) return incomingValue;
  if (!isStoryboardReviewRecord(incomingValue)) return existingValue;
  return {
    ...incomingValue,
    ...existingValue,
    productionContext: existingValue.productionContext ?? incomingValue.productionContext,
    voiceoverFullScript: existingValue.voiceoverFullScript ?? incomingValue.voiceoverFullScript,
    soundFullBrief: existingValue.soundFullBrief ?? incomingValue.soundFullBrief,
  };
}

function mergeStoryboardExtraParamsMetadata(existingValue: unknown, incomingValue: unknown): unknown {
  if (!isStoryboardReviewRecord(existingValue) && !isStoryboardReviewRecord(incomingValue)) {
    return existingValue ?? incomingValue;
  }
  if (!isStoryboardReviewRecord(existingValue)) return incomingValue;
  if (!isStoryboardReviewRecord(incomingValue)) return existingValue;

  const merged: Record<string, unknown> = {
    ...incomingValue,
    ...existingValue,
    productionContext: existingValue.productionContext ?? incomingValue.productionContext,
    productionRunId: existingValue.productionRunId ?? incomingValue.productionRunId,
    productionStoryConceptId: existingValue.productionStoryConceptId ?? incomingValue.productionStoryConceptId,
    productionStoryConceptTitle: existingValue.productionStoryConceptTitle ?? incomingValue.productionStoryConceptTitle,
    productionVideoConcept: existingValue.productionVideoConcept ?? incomingValue.productionVideoConcept,
    productionConceptDetails: existingValue.productionConceptDetails ?? incomingValue.productionConceptDetails,
    storyboardGuide: existingValue.storyboardGuide ?? incomingValue.storyboardGuide,
    voiceoverFullScript: existingValue.voiceoverFullScript ?? incomingValue.voiceoverFullScript,
  };

  const planner = mergeStoryboardPlannerMetadata(
    existingValue.storyboardPromptPlanner,
    incomingValue.storyboardPromptPlanner,
  );
  if (planner) merged.storyboardPromptPlanner = planner;

  return merged;
}

function mergeStoryboardContextMetadata(existingValue: unknown, incomingValue: unknown): unknown {
  if (!isStoryboardReviewRecord(existingValue) && !isStoryboardReviewRecord(incomingValue)) {
    return existingValue ?? incomingValue;
  }
  if (!isStoryboardReviewRecord(existingValue)) return incomingValue;
  if (!isStoryboardReviewRecord(incomingValue)) return existingValue;

  return {
    ...incomingValue,
    ...existingValue,
    marketplaceProduct: existingValue.marketplaceProduct ?? incomingValue.marketplaceProduct,
    productionContext: existingValue.productionContext ?? incomingValue.productionContext,
    extraParams: mergeStoryboardExtraParamsMetadata(existingValue.extraParams, incomingValue.extraParams),
  };
}

function mergeFresherTaskMediaWithIncomingMetadata(existingTask: unknown, incomingTask: unknown): unknown {
  if (!isStoryboardReviewRecord(existingTask) || !isStoryboardReviewRecord(incomingTask)) {
    return existingTask;
  }
  return {
    ...incomingTask,
    ...existingTask,
    marketplaceProduct: existingTask.marketplaceProduct ?? incomingTask.marketplaceProduct,
    productionContext: existingTask.productionContext ?? incomingTask.productionContext,
    storyboardContext: mergeStoryboardContextMetadata(existingTask.storyboardContext, incomingTask.storyboardContext),
  };
}

function getCompanionAudioUpdatedAt(reviewData: unknown): number {
  if (!reviewData || typeof reviewData !== "object") return 0;
  const value = (reviewData as { companionAudioUpdatedAt?: unknown }).companionAudioUpdatedAt;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

function summarizeCompanionAudio(reviewData: unknown) {
  if (!reviewData || typeof reviewData !== "object") {
    return { draftUpdatedAt: 0, companionAudioUpdatedAt: 0, count: 0, audio: [] };
  }
  const companionAudio = (reviewData as { companionAudio?: unknown }).companionAudio;
  const audioItems = Array.isArray(companionAudio) ? companionAudio : [];
  return {
    draftUpdatedAt: getReviewDataUpdatedAt(reviewData),
    companionAudioUpdatedAt: getCompanionAudioUpdatedAt(reviewData),
    hasExplicitCompanionAudioUpdatedAt: typeof (reviewData as { companionAudioUpdatedAt?: unknown }).companionAudioUpdatedAt === "number",
    count: audioItems.length,
    audio: audioItems.slice(0, 4).map((item) => {
      const audio = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const url = typeof audio.url === "string" ? audio.url : "";
      return {
        id: typeof audio.id === "string" ? audio.id : null,
        kind: typeof audio.kind === "string" ? audio.kind : null,
        title: typeof audio.title === "string" ? audio.title.slice(0, 120) : null,
        model: typeof audio.model === "string" ? audio.model.slice(0, 80) : null,
        urlTail: url ? url.slice(-160) : null,
      };
    }),
  };
}

function getDebugHeaderValue(headers: Record<string, unknown> | undefined, key: string): string | null {
  const value = headers?.[key.toLowerCase()] ?? headers?.[key];
  if (Array.isArray(value)) return value.join(", ").slice(0, 240);
  return typeof value === "string" ? value.slice(0, 240) : null;
}

function summarizeDebugRequest(ctx: { req?: { headers?: Record<string, unknown>; ip?: string; originalUrl?: string; socket?: { remoteAddress?: string } } }) {
  const headers = ctx.req?.headers;
  return {
    ip: ctx.req?.ip ?? ctx.req?.socket?.remoteAddress ?? null,
    xForwardedFor: getDebugHeaderValue(headers, "x-forwarded-for"),
    origin: getDebugHeaderValue(headers, "origin"),
    referer: getDebugHeaderValue(headers, "referer"),
    userAgent: getDebugHeaderValue(headers, "user-agent"),
    methodPath: ctx.req?.originalUrl ?? null,
  };
}

function writeStoryboardReviewDebugLog(entry: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "test" || process.env.STORYBOARD_REVIEW_DEBUG_LOG === "0") return;
  const logPath = path.resolve(process.cwd(), process.env.STORYBOARD_REVIEW_DEBUG_LOG_PATH || "logs/storyboard-review-save-debug.ndjson");
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify({
      ts: new Date().toISOString(),
      serverBuild: STORYBOARD_REVIEW_SERVER_DEBUG_BUILD,
      ...entry,
    })}\n`, "utf8");
  } catch {
    // Debug logging must never block user saves.
  }
}

export function sanitizeStoryboardReviewClientDebugPayload(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") return String(value).slice(0, 120);
  if (depth >= 5) return "[MaxDepth]";

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeStoryboardReviewClientDebugPayload(item, depth + 1));
  }

  const sensitiveKeyPattern = /(authorization|cookie|password|secret|token|sig|signature|url|uri)$/i;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
    output[key] = sensitiveKeyPattern.test(key)
      ? "[redacted]"
      : sanitizeStoryboardReviewClientDebugPayload(item, depth + 1);
  }
  return output;
}

function writeStoryboardReviewClientDebugLog(entry: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "test" || process.env.STORYBOARD_REVIEW_CLIENT_DEBUG_LOG === "0") return;
  const logPath = path.resolve(process.cwd(), process.env.STORYBOARD_REVIEW_CLIENT_DEBUG_LOG_PATH || "logs/storyboard-review-client-debug.ndjson");
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify({
      ts: new Date().toISOString(),
      serverBuild: STORYBOARD_REVIEW_SERVER_DEBUG_BUILD,
      clientDebugBuild: STORYBOARD_REVIEW_CLIENT_DEBUG_BUILD,
      ...entry,
    })}\n`, "utf8");
  } catch {
    // Debug logging must never block the review page.
  }
}

export function mergeFresherExistingReviewTasks(
  existingReviewData: unknown,
  incomingReviewData: unknown,
): unknown {
  if (!existingReviewData || typeof existingReviewData !== "object") {
    return stripClientOwnedHyperframesFinalComposite(incomingReviewData);
  }
  if (!incomingReviewData || typeof incomingReviewData !== "object") return incomingReviewData;

  const safeIncomingReviewData = stripClientOwnedHyperframesFinalComposite(incomingReviewData);
  const existingTasks = (existingReviewData as { tasks?: unknown }).tasks;
  const incomingTasks = (safeIncomingReviewData as { tasks?: unknown }).tasks;
  if (!Array.isArray(existingTasks) || !Array.isArray(incomingTasks)) {
    return applyServerOwnedHyperframesFinalComposite(existingReviewData, safeIncomingReviewData);
  }
  const existingCompanionAudioUpdatedAt = getCompanionAudioUpdatedAt(existingReviewData);
  const incomingCompanionAudioUpdatedAt = getCompanionAudioUpdatedAt(safeIncomingReviewData);

  const existingTaskById = new Map<string, unknown>();
  for (const task of existingTasks) {
    const id = getTaskId(task);
    if (id) existingTaskById.set(id, task);
  }

  let changed = false;
  const mergedTasks = incomingTasks.map((incomingTask) => {
    const id = getTaskId(incomingTask);
    if (!id) return incomingTask;
    const existingTask = existingTaskById.get(id);
    if (!existingTask) return incomingTask;

    const existingTaskUpdatedAt = getTaskUpdatedAt(existingTask);
    const incomingTaskUpdatedAt = getTaskUpdatedAt(incomingTask);
    if (
      existingTaskUpdatedAt > incomingTaskUpdatedAt
      && getTaskUrl(existingTask) !== getTaskUrl(incomingTask)
    ) {
      changed = true;
      return mergeFresherTaskMediaWithIncomingMetadata(existingTask, incomingTask);
    }
    return incomingTask;
  });

  const existingCompanionAudio = (existingReviewData as { companionAudio?: unknown }).companionAudio;
  const incomingCompanionAudio = (safeIncomingReviewData as { companionAudio?: unknown }).companionAudio;
  const existingAudioItems = Array.isArray(existingCompanionAudio) ? existingCompanionAudio : [];
  const incomingAudioItems = Array.isArray(incomingCompanionAudio) ? incomingCompanionAudio : [];
  const shouldUseExistingCompanionAudio = existingCompanionAudioUpdatedAt > incomingCompanionAudioUpdatedAt;
  if (shouldUseExistingCompanionAudio) {
    changed = true;
  }

  const mergedReviewData = changed
    ? {
        ...(safeIncomingReviewData as Record<string, unknown>),
        tasks: mergedTasks,
        ...(Array.isArray(incomingCompanionAudio)
          ? {
              companionAudio: shouldUseExistingCompanionAudio ? existingAudioItems : incomingAudioItems,
              companionAudioUpdatedAt: Math.max(existingCompanionAudioUpdatedAt, incomingCompanionAudioUpdatedAt),
            }
          : {}),
      }
    : safeIncomingReviewData;
  return applyServerOwnedHyperframesFinalComposite(existingReviewData, mergedReviewData);
}

function getReviewThumbnailUrl(reviewData: unknown, fallback: string | null | undefined): string | undefined {
  if (reviewData && typeof reviewData === "object") {
    const tasks = (reviewData as { tasks?: unknown }).tasks;
    if (Array.isArray(tasks)) {
      for (const task of tasks) {
        const url = getTaskUrl(task).trim();
        if (url) return url;
      }
    }
  }
  return fallback ?? undefined;
}

export const videoEditorProjectsRouter = router({
  /** Browser lifecycle debug events for storyboard review audio persistence. */
  debugStoryboardReviewClient: protectedProcedure
    .input(
      z.object({
        event: z.string().min(1).max(160),
        reviewId: z.number().int().positive().nullable().optional(),
        pageBuild: z.string().max(160).nullable().optional(),
        route: z.string().max(300).nullable().optional(),
        payload: z.unknown().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      writeStoryboardReviewClientDebugLog({
        event: input.event,
        reviewId: input.reviewId ?? null,
        userId: ctx.user.id,
        pageBuild: input.pageBuild ?? null,
        route: input.route ?? null,
        request: summarizeDebugRequest(ctx),
        payload: sanitizeStoryboardReviewClientDebugPayload(input.payload),
      });
      return { ok: true };
    }),

  /** List persistent Media Studio storyboard review workspaces */
  listStoryboardReviews: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        includeArchived: z.boolean().default(false),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { reviews: [], total: 0 };

      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;
      const includeArchived = input?.includeArchived ?? false;
      const where = includeArchived
        ? eq(mediaStudioStoryboardReviews.userId, ctx.user.id)
        : and(
            eq(mediaStudioStoryboardReviews.userId, ctx.user.id),
            eq(mediaStudioStoryboardReviews.status, "active"),
          );

      const [reviews, [{ total }]] = await Promise.all([
        db
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
          .where(where)
          .orderBy(desc(mediaStudioStoryboardReviews.updatedAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(mediaStudioStoryboardReviews)
          .where(where),
      ]);

      return { reviews, total };
    }),

  /** Get a storyboard review workspace by ID */
  getStoryboardReview: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      const [review] = await db
        .select()
        .from(mediaStudioStoryboardReviews)
        .where(
          and(
            eq(mediaStudioStoryboardReviews.id, input.id),
            eq(mediaStudioStoryboardReviews.userId, ctx.user.id),
          ),
        )
          .limit(1);

      writeStoryboardReviewDebugLog({
        event: "getStoryboardReview",
        reviewId: input.id,
        userId: ctx.user.id,
        found: Boolean(review),
        request: summarizeDebugRequest(ctx),
        stored: summarizeCompanionAudio(review?.reviewData),
      });

      if (!review) return null;

      const autoReviewProduct = await getStoryboardReviewAutoReviewContext({
        db,
        userId: ctx.user.id,
        reviewId: input.id,
        reviewData: review.reviewData,
      });
      const marketplaceContext = autoReviewProduct
        ? Object.fromEntries(
            Object.entries(autoReviewProduct).filter(
              ([key]) => key !== "metadataJson" && key !== "referenceAnchors",
            ),
          )
        : null;
      const reviewDataWithMarketplaceContext =
        mergeStoryboardReviewMarketplaceContext(
          review.reviewData,
          marketplaceContext,
        );

      return {
        ...review,
        reviewData: repairStoryboardReviewMarketplacePromptLocks(
          reviewDataWithMarketplaceContext,
          autoReviewProduct ?? null,
        ),
        autoReview: autoReviewProduct
          ? {
              runId: autoReviewProduct.runId,
              currentStoryboardReviewId:
                autoReviewProduct.currentStoryboardReviewId,
              isSuperseded: autoReviewProduct.isSuperseded,
            }
          : null,
      };
    }),

  /** Persist server-owned HyperFrames Final Composite state for Storyboard Review. */
  updateStoryboardReviewHyperframesFinalComposite: protectedProcedure
    .input(UpdateStoryboardReviewHyperframesFinalCompositeInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [existing] = await db
        .select({
          id: mediaStudioStoryboardReviews.id,
          reviewData: mediaStudioStoryboardReviews.reviewData,
        })
        .from(mediaStudioStoryboardReviews)
        .where(
          and(
            eq(mediaStudioStoryboardReviews.id, input.storyboardReviewProjectId),
            eq(mediaStudioStoryboardReviews.userId, ctx.user.id),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Storyboard Review project was not found.",
        });
      }

      const normalizedReviewData = await normalizeStoryboardReviewCanonicalLinks({
        db,
        userId: ctx.user.id,
        reviewData: existing.reviewData,
      });
      const canonicalProductId =
        getStoryboardReviewMarketplaceProductId(normalizedReviewData);
      const canonicalRunId = getStoryboardReviewAutoReviewRunId(normalizedReviewData);
      if (canonicalProductId !== input.productId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Storyboard Review product does not match HyperFrames input.",
        });
      }
      if (canonicalRunId !== input.runId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Storyboard Review Auto Review run does not match HyperFrames input.",
        });
      }

      try {
        const now = new Date();
        const merged = mergeStoryboardReviewHyperframesFinalCompositeState({
          reviewData: normalizedReviewData,
          input,
          nowIso: now.toISOString(),
        });

        await db
          .update(mediaStudioStoryboardReviews)
          .set({
            reviewData: merged.reviewData,
            updatedAt: now,
          })
          .where(eq(mediaStudioStoryboardReviews.id, input.storyboardReviewProjectId));

        return {
          state: merged.state,
          reviewData: merged.reviewData,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid HyperFrames state update.";
        throw new TRPCError({
          code: message.includes("revision conflict") ? "CONFLICT" : "BAD_REQUEST",
          message,
        });
      }
    }),

  /** Create editable subtitle text from a Storyboard Review shot MP4 via HyperFrames transcribe. */
  transcribeStoryboardReviewShotSubtitle: protectedProcedure
    .input(
      z.object({
        storyboardReviewProjectId: z.number().int().positive(),
        productId: z.string().trim().min(1).max(180),
        runId: z.string().trim().min(1).max(180),
        shotId: z.string().trim().min(1).max(180),
        sourceVideoUrl: z.string().trim().min(1).max(4096),
        language: z.string().trim().min(2).max(12).default("th"),
        model: z.string().trim().min(1).max(80).optional(),
      }).strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [existing] = await db
        .select({
          id: mediaStudioStoryboardReviews.id,
          reviewData: mediaStudioStoryboardReviews.reviewData,
        })
        .from(mediaStudioStoryboardReviews)
        .where(
          and(
            eq(mediaStudioStoryboardReviews.id, input.storyboardReviewProjectId),
            eq(mediaStudioStoryboardReviews.userId, ctx.user.id),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Storyboard Review project was not found.",
        });
      }

      const normalizedReviewData = await normalizeStoryboardReviewCanonicalLinks({
        db,
        userId: ctx.user.id,
        reviewData: existing.reviewData,
      });
      const canonicalProductId =
        getStoryboardReviewMarketplaceProductId(normalizedReviewData);
      const canonicalRunId = getStoryboardReviewAutoReviewRunId(normalizedReviewData);
      if (canonicalProductId !== input.productId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Storyboard Review product does not match HyperFrames transcribe input.",
        });
      }
      if (canonicalRunId !== input.runId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Storyboard Review Auto Review run does not match HyperFrames transcribe input.",
        });
      }
      if (!storyboardReviewContainsManagedVideoUrl(normalizedReviewData, input.sourceVideoUrl)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "HyperFrames transcribe source video is not a managed clip in this Storyboard Review.",
        });
      }

      try {
        const result = await transcribeHyperframesStoryboardShot({
          sourceVideoUrl: input.sourceVideoUrl,
          language: input.language,
          model: input.model,
        });
        return {
          shotId: input.shotId,
          sourceVideoUrl: input.sourceVideoUrl,
          ...result,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "HyperFrames transcribe failed.";
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message,
        });
      }
    }),

  /** Save a Media Studio storyboard review workspace */
  saveStoryboardReview: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string().min(1).max(256),
        reviewData: z.any(),
        clipCount: z.number().min(0).optional(),
        completedClipCount: z.number().min(0).optional(),
        thumbnailUrl: z.string().optional().nullable(),
        videoEditorProjectId: z.number().optional().nullable(),
        debugSource: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const now = new Date();
      if (input.id) {
        const [existing] = await db
          .select({
            id: mediaStudioStoryboardReviews.id,
            reviewData: mediaStudioStoryboardReviews.reviewData,
          })
          .from(mediaStudioStoryboardReviews)
          .where(
            and(
              eq(mediaStudioStoryboardReviews.id, input.id),
              eq(mediaStudioStoryboardReviews.userId, ctx.user.id),
            ),
          )
          .limit(1);
        if (!existing) throw new Error("Storyboard review not found");
        const reviewData = await normalizeStoryboardReviewCanonicalLinks({
          db,
          userId: ctx.user.id,
          reviewData: mergeFresherExistingReviewTasks(existing.reviewData, input.reviewData),
        });
        writeStoryboardReviewDebugLog({
          event: "saveStoryboardReview.update",
          reviewId: input.id,
          userId: ctx.user.id,
          debugSource: input.debugSource ?? null,
          request: summarizeDebugRequest(ctx),
          existing: summarizeCompanionAudio(existing.reviewData),
          incoming: summarizeCompanionAudio(input.reviewData),
          merged: summarizeCompanionAudio(reviewData),
        });

        await db
          .update(mediaStudioStoryboardReviews)
          .set({
            name: input.name,
            reviewData,
            clipCount: input.clipCount,
            completedClipCount: input.completedClipCount,
            thumbnailUrl: getReviewThumbnailUrl(reviewData, input.thumbnailUrl),
            videoEditorProjectId: input.videoEditorProjectId ?? undefined,
            status: "active",
            updatedAt: now,
          })
          .where(eq(mediaStudioStoryboardReviews.id, input.id));

        return { id: input.id, reviewData };
      }

      const reviewData = await normalizeStoryboardReviewCanonicalLinks({
        db,
        userId: ctx.user.id,
        reviewData: stripClientOwnedHyperframesFinalComposite(input.reviewData),
      });
      const [inserted] = await db
        .insert(mediaStudioStoryboardReviews)
        .values({
          userId: ctx.user.id,
          name: input.name,
          reviewData,
          clipCount: input.clipCount,
          completedClipCount: input.completedClipCount,
          thumbnailUrl: input.thumbnailUrl ?? undefined,
          videoEditorProjectId: input.videoEditorProjectId ?? undefined,
          status: "active",
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: mediaStudioStoryboardReviews.id });
      writeStoryboardReviewDebugLog({
        event: "saveStoryboardReview.insert",
        reviewId: inserted.id,
        userId: ctx.user.id,
        debugSource: input.debugSource ?? null,
        request: summarizeDebugRequest(ctx),
        incoming: summarizeCompanionAudio(reviewData),
      });

      return { id: inserted.id, reviewData };
    }),

  /** Delete a storyboard review workspace after it is no longer needed */
  deleteStoryboardReview: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db
        .delete(mediaStudioStoryboardReviews)
        .where(
          and(
            eq(mediaStudioStoryboardReviews.id, input.id),
            eq(mediaStudioStoryboardReviews.userId, ctx.user.id),
          ),
        );

      return { success: true };
    }),

  /** List user's projects, sorted by most recently updated */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { projects: [], total: 0 };

      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;

      const [projects, [{ total }]] = await Promise.all([
        db
          .select({
            id: videoEditorProjects.id,
            name: videoEditorProjects.name,
            thumbnailUrl: videoEditorProjects.thumbnailUrl,
            duration: videoEditorProjects.duration,
            resolution: videoEditorProjects.resolution,
            trackCount: videoEditorProjects.trackCount,
            clipCount: videoEditorProjects.clipCount,
            isAutoSave: videoEditorProjects.isAutoSave,
            createdAt: videoEditorProjects.createdAt,
            updatedAt: videoEditorProjects.updatedAt,
          })
          .from(videoEditorProjects)
          .where(eq(videoEditorProjects.userId, ctx.user.id))
          .orderBy(desc(videoEditorProjects.updatedAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(videoEditorProjects)
          .where(eq(videoEditorProjects.userId, ctx.user.id)),
      ]);

      return { projects, total };
    }),

  /** Get a single project by ID (with ownership check) */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      const [project] = await db
        .select()
        .from(videoEditorProjects)
        .where(
          and(
            eq(videoEditorProjects.id, input.id),
            eq(videoEditorProjects.userId, ctx.user.id)
          )
        )
        .limit(1);

      return project ?? null;
    }),

  /** Save (create or update) a project */
  save: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string().min(1).max(256),
        projectData: z.any(),
        thumbnailUrl: z.string().optional(),
        duration: z.number().optional(),
        resolution: z.string().optional(),
        trackCount: z.number().optional(),
        clipCount: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const now = new Date();

      if (input.id) {
        // Update — verify ownership first
        const [existing] = await db
          .select({ id: videoEditorProjects.id })
          .from(videoEditorProjects)
          .where(
            and(
              eq(videoEditorProjects.id, input.id),
              eq(videoEditorProjects.userId, ctx.user.id)
            )
          )
          .limit(1);

        if (!existing) throw new Error("Project not found");

        await db
          .update(videoEditorProjects)
          .set({
            name: input.name,
            projectData: input.projectData,
            thumbnailUrl: input.thumbnailUrl,
            duration: input.duration?.toString(),
            resolution: input.resolution,
            trackCount: input.trackCount,
            clipCount: input.clipCount,
            isAutoSave: false,
            updatedAt: now,
          })
          .where(eq(videoEditorProjects.id, input.id));

        return { id: input.id };
      } else {
        // Create new
        const [inserted] = await db
          .insert(videoEditorProjects)
          .values({
            userId: ctx.user.id,
            name: input.name,
            projectData: input.projectData,
            thumbnailUrl: input.thumbnailUrl,
            duration: input.duration?.toString(),
            resolution: input.resolution,
            trackCount: input.trackCount,
            clipCount: input.clipCount,
            isAutoSave: false,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: videoEditorProjects.id });

        return { id: inserted.id };
      }
    }),

  /** Auto-save — lightweight update of projectData only */
  autoSave: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        projectData: z.any(),
        clipCount: z.number().optional(),
        duration: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const result = await db
        .update(videoEditorProjects)
        .set({
          projectData: input.projectData,
          clipCount: input.clipCount,
          duration: input.duration?.toString(),
          isAutoSave: true,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(videoEditorProjects.id, input.id),
            eq(videoEditorProjects.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),

  /** Delete a project (with ownership check) */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db
        .delete(videoEditorProjects)
        .where(
          and(
            eq(videoEditorProjects.id, input.id),
            eq(videoEditorProjects.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),

  /** Rename a project */
  rename: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(256),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db
        .update(videoEditorProjects)
        .set({
          name: input.name,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(videoEditorProjects.id, input.id),
            eq(videoEditorProjects.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),
});
