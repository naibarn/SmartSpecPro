import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { mediaModels } from "../../drizzle/schema";
import { createInternalTokenFromAuth } from "../_core/tokens";
import { db } from "../db";
import {
  deductCredits,
  hasEnoughCredits,
  refundCredits,
} from "./creditService";
import { resolveEnabledMediaModelSelection } from "./enabledMediaModelSelection";
import { ensureMarketplaceAutoReviewTaskResultDurable } from "./marketplaceAutoReviewMediaAssetService";
import {
  generateMarketplaceSocialImagePrompt,
  type MarketplaceSocialImageVariant,
} from "./marketplaceAutoReviewSocialImagePromptSkillRunner";
import {
  mediaGenerationService,
  type MediaTask,
} from "./mediaGenerationService";
import { resolveAdBannerImageModelPricing } from "./verticalDramaAdBanner";

const IMAGE_TASK_TIMEOUT_MS = 15 * 60_000;
const IMAGE_TASK_POLL_INTERVAL_MS = 2_500;

export type MarketplaceSocialPostAspectRatio = "4:5" | "9:16";

export type GenerateMarketplaceSocialPostImageInput = {
  userId: number;
  tenantId: string;
  publicUrl?: string | null;
  runId: string;
  batchId: string;
  requestIdempotencyKey: string;
  modelId: string;
  aspectRatio: MarketplaceSocialPostAspectRatio;
  variant: MarketplaceSocialImageVariant;
  language: "th" | "en";
  caption: string;
  product: {
    productName: string;
    description?: string | null;
    specs?: Record<string, unknown>;
  };
  source: {
    label: string;
    imageUrl: string;
    context?: string;
  };
  onProgress?: (progress: {
    progress: number;
    stage: string;
    message: string;
  }) => Promise<void>;
};

export type MarketplaceSocialPostImageResult = {
  imageStorageKey: string;
  taskId: string;
  modelId: string;
  aspectRatio: MarketplaceSocialPostAspectRatio;
  imageCreditsUsed: number;
  promptCreditsUsed: number;
  imagePrompt: string;
  negativePrompt: string;
  promptModel: string;
  promptProvider: string;
};

export class MarketplaceSocialPostImageFailure extends Error {
  constructor(
    message: string,
    readonly promptCreditsUsed: number,
    readonly imageCreditsUsed: number
  ) {
    super(message);
    this.name = "MarketplaceSocialPostImageFailure";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function supportedAspectRatios(input: {
  aspectRatios: unknown;
  configJson: unknown;
}): string[] {
  const config = asRecord(input.configJson);
  const configured = Array.isArray(input.aspectRatios)
    ? input.aspectRatios
    : Array.isArray(config.aspectRatios)
      ? config.aspectRatios
      : Array.isArray(config.allowedAspectRatios)
        ? config.allowedAspectRatios
        : [];
  return configured.filter(
    (ratio): ratio is string =>
      typeof ratio === "string" && ratio.trim().length > 0
  );
}

export async function resolveMarketplaceSocialPostImageModel(input: {
  modelId: string;
  aspectRatio: MarketplaceSocialPostAspectRatio;
}) {
  const selection = await resolveEnabledMediaModelSelection({
    mediaType: "image",
    requestedModel: input.modelId,
    requireConfiguredProvider: true,
    allowSubstitution: false,
  });
  if (!selection.ok || selection.modelId !== input.modelId) {
    throw new Error("MARKETPLACE_SOCIAL_POST_IMAGE_MODEL_UNAVAILABLE");
  }

  const pricing = await resolveAdBannerImageModelPricing(input.modelId);
  if (pricing.modelId !== input.modelId || pricing.maxReferenceImages < 1) {
    throw new Error(
      "MARKETPLACE_SOCIAL_POST_IMAGE_MODEL_NEEDS_REFERENCE_SUPPORT"
    );
  }
  const [row] = await db
    .select({
      aspectRatios: mediaModels.aspectRatios,
      configJson: mediaModels.configJson,
    })
    .from(mediaModels)
    .where(eq(mediaModels.modelId, input.modelId))
    .limit(1);
  const ratios = supportedAspectRatios({
    aspectRatios: row?.aspectRatios,
    configJson: row?.configJson ?? pricing.configJson,
  });
  if (!ratios.includes(input.aspectRatio)) {
    throw new Error("MARKETPLACE_SOCIAL_POST_IMAGE_ASPECT_RATIO_UNSUPPORTED");
  }
  if (!Number.isFinite(pricing.creditCost) || pricing.creditCost < 0) {
    throw new Error("MARKETPLACE_SOCIAL_POST_IMAGE_MODEL_PRICING_INVALID");
  }
  return {
    modelId: input.modelId,
    creditCost: pricing.creditCost,
    aspectRatio: input.aspectRatio,
  };
}

function reservationKey(input: GenerateMarketplaceSocialPostImageInput) {
  const digest = createHash("sha256")
    .update(
      `${input.tenantId}\n${input.runId}\n${input.batchId}\n${input.requestIdempotencyKey}\n${input.variant}`
    )
    .digest("hex");
  return `marketplace-social-post-image:${digest}`;
}

function mediaAuditContext(input: GenerateMarketplaceSocialPostImageInput) {
  return {
    userId: input.userId,
    tenantId: input.tenantId,
    traceId: randomUUID(),
    source: "marketplace_auto_review.social_post_image",
    stage: "submission" as const,
  };
}

function reportVariantProgress(input: {
  request: GenerateMarketplaceSocialPostImageInput;
  progress: number;
  message: string;
}) {
  return input.request.onProgress?.({
    progress: input.progress,
    stage: `social_post_image:${input.request.variant}`,
    message: input.message,
  });
}

async function waitForImageTask(input: {
  request: GenerateMarketplaceSocialPostImageInput;
  task: MediaTask;
  userToken: string;
}): Promise<MediaTask> {
  const deadline = Date.now() + IMAGE_TASK_TIMEOUT_MS;
  let task = input.task;
  while (["pending", "processing"].includes(task.status)) {
    if (Date.now() > deadline) {
      throw new Error("MARKETPLACE_SOCIAL_POST_IMAGE_PROVIDER_TIMEOUT");
    }
    await new Promise(resolve =>
      setTimeout(resolve, IMAGE_TASK_POLL_INTERVAL_MS)
    );
    task = await mediaGenerationService.getTask(
      task.id,
      input.userToken,
      mediaAuditContext(input.request)
    );
  }
  if (task.status !== "completed") {
    throw new Error("MARKETPLACE_SOCIAL_POST_IMAGE_PROVIDER_FAILED");
  }
  return task;
}

export async function generateMarketplaceSocialPostImage(
  input: GenerateMarketplaceSocialPostImageInput
): Promise<MarketplaceSocialPostImageResult> {
  const model = await resolveMarketplaceSocialPostImageModel({
    modelId: input.modelId,
    aspectRatio: input.aspectRatio,
  });
  if (
    model.creditCost > 0 &&
    !(await hasEnoughCredits(input.userId, model.creditCost))
  ) {
    throw new Error("MARKETPLACE_SOCIAL_POST_IMAGE_INSUFFICIENT_CREDITS");
  }

  const key = reservationKey(input);
  let imageReservationCreated = false;
  let providerCompleted = false;
  let taskId: string | null = null;
  let promptCreditsUsed = 0;
  if (model.creditCost > 0) {
    await deductCredits({
      userId: input.userId,
      tenantId: input.tenantId,
      amount: model.creditCost,
      idempotencyKey: `${key}:reserve`,
      description: `Marketplace social post image · ${input.variant} (reserved)`,
      sourceType: "media_image",
      metadata: {
        feature: "marketplace_social_post_images",
        runId: input.runId,
        batchId: input.batchId,
        variant: input.variant,
        modelId: model.modelId,
        aspectRatio: model.aspectRatio,
        type: "reservation",
      },
    });
    imageReservationCreated = true;
  }

  try {
    await reportVariantProgress({
      request: input,
      progress: 10,
      message: "กำลังสร้าง prompt ภาพโฆษณาจาก Caption และภาพอ้างอิง",
    });
    const prompt = await generateMarketplaceSocialImagePrompt({
      userId: input.userId,
      tenantId: input.tenantId,
      publicUrl: input.publicUrl,
      runId: input.runId,
      requestIdempotencyKey: input.requestIdempotencyKey,
      variant: input.variant,
      language: input.language,
      caption: input.caption,
      product: input.product,
      source: input.source,
      aspectRatio: input.aspectRatio,
    });
    promptCreditsUsed = prompt.creditsUsed;
    const userToken = createInternalTokenFromAuth(
      { userId: input.userId, tenantId: input.tenantId },
      ["media:generate"]
    );
    const unitId = `social-post-${input.batchId}-${input.variant}`;
    const mediaRequestKey = `${key}:render`;
    const auditContext = mediaAuditContext(input);
    await reportVariantProgress({
      request: input,
      progress: 25,
      message: "กำลังส่งภาพไปสร้างและรอผลจากโมเดลภาพ",
    });
    const submittedTask = await mediaGenerationService.generateImageAsync(
      {
        prompt: prompt.imagePrompt,
        negativePrompt: prompt.negativePrompt,
        model: model.modelId,
        strictModelSelection: true,
        numImages: 1,
        aspectRatio: model.aspectRatio,
        outputFormat: "png",
        referenceImageUrls: [input.source.imageUrl],
        publicUrl: input.publicUrl ?? undefined,
        controlPlaneOperationKey: mediaRequestKey,
        extraParams: {
          __auto_review_run_id: input.runId,
          __unit_id: unitId,
        },
        auditContext,
      },
      userToken
    );
    taskId = submittedTask.id;
    const completedTask = await waitForImageTask({
      request: input,
      task: submittedTask,
      userToken,
    });
    providerCompleted = true;
    const durable = await ensureMarketplaceAutoReviewTaskResultDurable({
      tenantId: input.tenantId,
      userId: input.userId,
      task: completedTask,
    });
    if (!durable?.durableUrl?.trim()) {
      throw new Error("MARKETPLACE_SOCIAL_POST_IMAGE_OUTPUT_UNAVAILABLE");
    }
    await reportVariantProgress({
      request: input,
      progress: 95,
      message: "บันทึกภาพสำหรับโพสต์เรียบร้อยแล้ว",
    });
    return {
      imageStorageKey: durable.storageKey,
      taskId: completedTask.id,
      modelId: model.modelId,
      aspectRatio: model.aspectRatio,
      imageCreditsUsed: model.creditCost,
      promptCreditsUsed: prompt.creditsUsed,
      imagePrompt: prompt.imagePrompt,
      negativePrompt: prompt.negativePrompt,
      promptModel: prompt.model,
      promptProvider: prompt.provider,
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "MarketplaceSocialImagePromptFailure" &&
      "creditsUsed" in error &&
      Number.isFinite(Number(error.creditsUsed)) &&
      Number(error.creditsUsed) >= 0
    ) {
      promptCreditsUsed = Number(error.creditsUsed);
    }
    if (imageReservationCreated && !providerCompleted) {
      await refundCredits({
        userId: input.userId,
        tenantId: input.tenantId,
        idempotencyKey: `${key}:refund`,
        amount: model.creditCost,
        description: `Marketplace social post image refund · ${input.variant}`,
        sourceType: "media_image",
        metadata: {
          feature: "marketplace_social_post_images",
          runId: input.runId,
          batchId: input.batchId,
          variant: input.variant,
          modelId: model.modelId,
          taskId,
          type: "reservation_refund",
        },
      });
    }
    throw new MarketplaceSocialPostImageFailure(
      error instanceof Error
        ? error.message
        : "MARKETPLACE_SOCIAL_POST_IMAGE_GENERATION_FAILED",
      promptCreditsUsed,
      providerCompleted ? model.creditCost : 0
    );
  }
}
