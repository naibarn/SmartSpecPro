/**
 * Vertical Drama Series — Ad Banner Overlay: series-level banner PROMPT and
 * IMAGE generation (spec feature 131, task #30-A,
 * `planning/vertical-drama-ad-banner-overlay/plan.md` §1, §5, §7).
 *
 * This is the OVERLAY ADS layer — a deliberate ad layer composited ON TOP of
 * a rendered clip, distinct from the existing in-story product tie-in system
 * (`verticalDramaProductTieIn.ts`). Per plan.md §1, the banner prompt path
 * INTENTIONALLY does NOT go through `sanitizeBrandMentionsInPrompt` or
 * append `VD_PRODUCT_LOCK_INSTRUCTION` — those guards exist so an IN-STORY
 * shot never reads like an ad poster; an overlay banner is deliberately an
 * ad, so naming the brand/product and showing price/CTA text is allowed.
 * What DOES still apply: `forbiddenClaims` screening (deterministic,
 * `containsForbiddenClaim` from `@shared/verticalDramaSeries/adBannerPresets`)
 * and the `regulatedCategory` + `requireHumanApproval` manual-review gate
 * (`resolveAdBannerApprovalGate`, reusing `isRegulatedCategory` from the
 * existing tie-in service).
 *
 * Two independently-credited paid calls, mirroring this codebase's
 * established "prompt generation is a separate charge from image rendering"
 * convention (`verticalDramaCharacterImageGeneration.ts` /
 * `verticalDramaCharacters.ts`'s `generateCharacterImage`):
 *  - `generateAdBannerPrompt` — a credit-gated LLM call (self-contained
 *    credit check/deduct, mirrors `generateCharacterVisualPrompts`).
 *  - `resolveAdBannerImageModelPricing` + `submitAdBannerImageGeneration` —
 *    the image render; credit check/reserve/refund lifecycle stays in the
 *    ROUTER (`server/routers/verticalDramaSeries.ts`), mirroring
 *    `generateCharacterImage`'s own inline credit handling exactly.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { parseSkillFile } from "@smartspec/skills";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "./skillFiles";
import {
  hasEnoughCredits,
  deductCredits,
  calculateCreditsForLLM,
} from "./creditService";
import { mediaGenerationLimiter } from "./rateLimiter";
import { executeWithFallback } from "./llmRouter";
import { loadEnabledLlmModelRows } from "./enabledLlmModels";
import { selectBestLlmModel } from "./intelligentModelSelector";
import {
  extractJson,
  VdSchemaValidationError,
  InsufficientCreditsError,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "./verticalDramaImproveScript";
import { resolveVerticalDramaSeriesModel } from "./verticalDramaLlmModelPolicy";
import {
  isRegulatedCategory,
  resolveMarketplaceCaptureProductImageUrls,
  resolveProductReferenceImageUrls,
} from "./verticalDramaProductTieIn";
import { mediaGenerationService } from "./mediaGenerationService";
import { resolveVerticalDramaCapabilities } from "./modelRegistry";
import { calculateCreditCost } from "./pricingCalculator";
import { db } from "../db";
import { mediaModels } from "../../drizzle/schema";
import {
  containsForbiddenClaim,
  type VdAdBannerCopy,
  type VdAdBannerStylePreset,
  type VdAdBannerPlacementPreset,
} from "@shared/verticalDramaSeries/adBannerPresets";

// Re-exported so callers of this service don't need a second import for the
// shared credit/schema error classes (mirrors `verticalDramaCharacterImageGeneration.ts`'s
// own `export { InsufficientCreditsError, VdSchemaValidationError };`).
export { InsufficientCreditsError, VdSchemaValidationError };

/* -------------------------------------------------------------------------- */
/* Error classes                                                              */
/* -------------------------------------------------------------------------- */

/** Mirrors `verticalDramaVideoMotionPromptGeneration.ts`'s own `RateLimitExceededError` shape exactly, scoped to this feature's own rate-limit key/message. */
export class AdBannerRateLimitExceededError extends Error {
  code = "VD_AD_BANNER_RATE_LIMIT_EXCEEDED" as const;
  constructor(retryAfterMs: number) {
    super(
      `Rate limit exceeded for ad banner prompt generation. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`
    );
    this.name = "AdBannerRateLimitExceededError";
  }
}

/**
 * Thrown when the LLM's OWN output (imagePrompt or textInImage) contains a
 * forbidden claim (plan.md §8) — a content-policy violation distinct from a
 * schema-parse failure. Deliberately thrown BEFORE crediting the call (see
 * `generateAdBannerPrompt`'s doc comment) so the user is never charged for
 * output they cannot legally use.
 */
export class VdAdBannerForbiddenClaimError extends Error {
  code = "VD_AD_BANNER_FORBIDDEN_CLAIM" as const;
  constructor(
    message = "The generated ad banner prompt/copy contains a forbidden claim"
  ) {
    super(message);
    this.name = "VdAdBannerForbiddenClaimError";
  }
}

/* -------------------------------------------------------------------------- */
/* Approval gate (plan.md §1, §8)                                             */
/* -------------------------------------------------------------------------- */

/**
 * True when this series' product tie-in config requires manual human
 * approval before a banner using it can render an image — reuses the SAME
 * `isRegulatedCategory` the in-story tie-in system already uses, applied to
 * the ad-banner-specific `regulatedCategory`/`requireHumanApproval` fields
 * read off the `productTieIn` jsonb blob (see `readAdBannerProductContext`
 * in `@shared/verticalDramaSeries/adBannerPresets`).
 */
export function resolveAdBannerApprovalGate(
  regulatedCategory: string | undefined,
  requireHumanApproval: boolean
): boolean {
  return (
    isRegulatedCategory(regulatedCategory) && requireHumanApproval === true
  );
}

/* -------------------------------------------------------------------------- */
/* Product reference images                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the effective product reference image URLs for a series' ad
 * banners — same 2-source union (Marketplace Capture selected images +
 * the series' own `productImageUrl`) as the in-story tie-in system's own
 * `resolveProductReferenceImageUrls`, reusing it directly rather than
 * reimplementing the same dedupe/cap-at-3 logic. See
 * `verticalDramaEpisodePipeline.ts`'s matching call site for the exact same
 * two-step shape this mirrors.
 */
export async function resolveAdBannerProductReferenceImageUrls(
  rawProductTieIn: Record<string, unknown> | null | undefined,
  owner: { userId: number; tenantId: string }
): Promise<string[]> {
  const productImageUrl =
    typeof rawProductTieIn?.productImageUrl === "string" &&
    rawProductTieIn.productImageUrl
      ? rawProductTieIn.productImageUrl
      : undefined;
  const marketplaceCaptureId =
    typeof rawProductTieIn?.marketplaceCaptureId === "string" &&
    rawProductTieIn.marketplaceCaptureId
      ? rawProductTieIn.marketplaceCaptureId
      : undefined;

  const captureSelectedImageUrls =
    await resolveMarketplaceCaptureProductImageUrls(
      marketplaceCaptureId,
      owner
    );
  return resolveProductReferenceImageUrls({
    productImageUrl,
    captureSelectedImageUrls,
  });
}

/* -------------------------------------------------------------------------- */
/* Skill file loading (mirrors verticalDramaStoryBible.ts's                   */
/* loadSeasonCritiqueSystemPrompt EXACTLY — never throws, in-process cache,   */
/* only caches on success, inline fallback constant)                         */
/* -------------------------------------------------------------------------- */

const AD_BANNER_PROMPT_SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-ad-banner-prompt"
);

let cachedAdBannerPromptSystemPrompt: string | null = null;

/**
 * Fallback system prompt — used only when `skills/vertical-drama-ad-banner-prompt/skill.md`
 * cannot be located/read (e.g. a deploy missing the `skills/` folder). Kept
 * as a named constant, never inlined, so a broken skill file never
 * hard-crashes the ad banner studio in production. Deliberately compact —
 * the full persona/rules live in the real skill.md; this is a safety net.
 */
export const AD_BANNER_PROMPT_SYSTEM_PROMPT_FALLBACK = [
  "You are an expert Thai advertising ad-banner prompt engineer for a vertical-drama video overlay ad system — you write IMAGE-GENERATION prompts for a standalone advertising banner that will be composited on top of a video (bottom band / side vertical / fullscreen interstitial), NOT an in-story product placement.",
  "This banner IS an advertisement by design — unlike in-story product placements, you MAY name the brand/product and include price/CTA text; there is no product-lock or brand-neutral requirement here.",
  "You are given: product info (name, category, user-authored copy fields, forbidden claims), optional attached product reference image(s) to analyze (color palette, packaging shape, material, mood) for photorealistic product fidelity, a style preset's prompt tokens (style/composition/texture/lighting) and negative tokens, and a placement's composition guidance that your composition instructions MUST respect.",
  'Any text you intend to appear rendered INSIDE the generated image (e.g. a short headline or price) must be listed in "textInImage" as SHORT, quoted strings and also referenced as quoted text inside "imagePrompt" — keep in-image text minimal, because AI image generation renders non-Latin script (including Thai) unreliably.',
  "NEVER include any of the given forbidden claims, in any form, anywhere in your output.",
  "Respond with ONLY a single JSON object (no markdown, no commentary) matching exactly this shape:",
  '{"imagePrompt": string, "negativePrompt": string, "textInImage": string[], "compositionNotes": string, "complianceNotes": string}',
].join("\n");

/**
 * Read the `vertical-drama-ad-banner-prompt` skill's markdown body verbatim,
 * to use as the ad-banner prompt LLM call's system prompt. Same resolution
 * strategy as `verticalDramaStoryBible.ts`'s `loadSeasonCritiqueSystemPrompt`
 * (`resolveSkillDirCandidates`/`resolveSkillManifestPath` from
 * `./skillFiles`, in-process cache, only caches on SUCCESS). Never throws —
 * a missing/unreadable skill file falls back to
 * `AD_BANNER_PROMPT_SYSTEM_PROMPT_FALLBACK` (logged via `console.warn`), and
 * the fallback itself is deliberately NOT cached so a transient failure can
 * self-heal on a later call.
 */
export function loadAdBannerPromptSystemPrompt(): string {
  if (cachedAdBannerPromptSystemPrompt) return cachedAdBannerPromptSystemPrompt;

  for (const dir of resolveSkillDirCandidates(
    AD_BANNER_PROMPT_SKILL_FOLDER_PATH
  )) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) {
        cachedAdBannerPromptSystemPrompt = content;
        return cachedAdBannerPromptSystemPrompt;
      }
    }
  }

  console.warn(
    '[verticalDramaAdBanner] Could not locate skill.md for "vertical-drama-ad-banner-prompt" — falling back to the inline ad-banner-prompt system prompt.'
  );
  return AD_BANNER_PROMPT_SYSTEM_PROMPT_FALLBACK;
}

/* -------------------------------------------------------------------------- */
/* Capability-based model resolution (mirrors                                 */
/* verticalDramaVideoMotionPromptGeneration.ts's resolveShotVideoPromptModel  */
/* EXACTLY — never a hardcoded model id)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a vision-capable model when reference images are attached; a
 * structured-output-only model otherwise. Falls back to
 * `resolveQualityLargeContextModelId()`'s non-capability-gated default (same
 * quality tier as "Improve script usage" — Phase 6,
 * `planning/vertical-drama-centralized-model-policy/plan.md`) when no enabled
 * model satisfies the requirement (or the lookup itself fails) — see
 * `resolveShotVideoPromptModel` in `verticalDramaVideoMotionPromptGeneration.ts`
 * for the identical shape/rationale this mirrors. The non-capability-gated
 * fallback routes through the centralized per-series override resolver
 * (`planning/vertical-drama-centralized-model-policy/plan.md`, Phase 3) so a
 * series-wide `llmModelPolicy.defaultModelId` override wins there too — the
 * capability requirements above are left untouched, mirroring
 * `resolveShotVideoPromptModel`'s identical shape.
 */
export async function resolveAdBannerPromptModel(
  hasReferenceImages: boolean,
  seriesId: number
): Promise<{ model: string; hasVision: boolean }> {
  try {
    const rows = await loadEnabledLlmModelRows();
    if (rows.length > 0) {
      const requirements = hasReferenceImages
        ? { supportsVision: true, supportsStructuredOutputs: true }
        : { supportsStructuredOutputs: true };
      const selected = selectBestLlmModel(requirements, rows);
      if (selected) return { model: selected, hasVision: hasReferenceImages };
    }
  } catch {
    // Fall through to the non-capability-gated default below.
  }
  const fallbackModel = await resolveVerticalDramaSeriesModel(seriesId, resolveQualityLargeContextModelId);
  return { model: fallbackModel, hasVision: false };
}

/* -------------------------------------------------------------------------- */
/* Ad banner prompt generation                                                */
/* -------------------------------------------------------------------------- */

const adBannerPromptOutputSchema = z.object({
  imagePrompt: z.string().min(1),
  negativePrompt: z.string().optional().default(""),
  textInImage: z.array(z.string()).optional().default([]),
  compositionNotes: z.string().optional().default(""),
  complianceNotes: z.string().optional().default(""),
});

export interface GenerateAdBannerPromptParams {
  userId: number;
  tenantId: string;
  seriesId: number;
  bannerId: string;
  product: {
    name?: string;
    category?: string;
    copy: VdAdBannerCopy;
    forbiddenClaims: string[];
  };
  stylePreset: VdAdBannerStylePreset;
  placement: VdAdBannerPlacementPreset;
  sideAlign?: "left" | "right";
  /** Already resolved + deduped + capped (see `resolveAdBannerProductReferenceImageUrls`). */
  referenceImageUrls: string[];
}

export interface GenerateAdBannerPromptResult {
  imagePrompt: string;
  negativePrompt: string;
  textInImage: string[];
  compositionNotes: string;
  complianceNotes: string;
  model: string;
  usedVision: boolean;
  creditsUsed: number;
}

function buildAdBannerPromptUserPrompt(
  params: GenerateAdBannerPromptParams,
  hasVision: boolean
): string {
  const lines = [
    `Product name: ${params.product.name || "(unspecified)"}`,
    params.product.category
      ? `Product category: ${params.product.category}`
      : null,
    `User-authored copy fields (use as textInImage candidates when short enough — never invent new claims): ${JSON.stringify(params.product.copy)}`,
    params.product.forbiddenClaims.length > 0
      ? `Forbidden claims (NEVER use these, in any form): ${JSON.stringify(params.product.forbiddenClaims)}`
      : "No forbidden claims configured for this product.",
    `Style preset: ${params.stylePreset.nameEn} — ${params.stylePreset.essenceTh}`,
    `Style prompt tokens (weave naturally into imagePrompt): ${JSON.stringify(params.stylePreset.promptTokens)}`,
    `Style negative tokens (fold into negativePrompt): ${JSON.stringify(params.stylePreset.negativeTokens)}`,
    `Placement: ${params.placement.id} (target aspect ${params.placement.targetAspect}).`,
    `Composition guidance (MUST respect): ${params.placement.compositionGuidance}`,
    params.placement.id === "side_vertical" && params.sideAlign
      ? `This banner is anchored to the ${params.sideAlign} edge of the frame — keep the most important content weighted toward that side.`
      : null,
    hasVision
      ? "One or more product reference images are attached — analyze their color palette, packaging/container shape, material, and mood, and anchor the generated product's appearance to them for photorealistic fidelity."
      : "No product reference image is attached — infer a plausible, generic photorealistic product appearance from the product name/category only; never invent a specific real brand's actual packaging.",
    "This banner IS an advertisement — you may name the brand/product and include price/CTA text; do not apply any in-story product-lock or brand-neutral phrasing.",
    "Language: the copy fields above are typically Thai; keep any quoted in-image text in its original language exactly as given. Write imagePrompt/negativePrompt/compositionNotes/complianceNotes in English.",
    VD_COMPACT_JSON_INSTRUCTION,
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * Generate ONE ad banner design's image-generation prompt via the
 * `vertical-drama-ad-banner-prompt` skill. Self-contained credit handling
 * (check -> call -> deduct), mirroring `generateCharacterVisualPrompts`'s
 * own convention — the caller (router) does NOT separately charge for this
 * call. Deliberately does NOT call `sanitizeBrandMentionsInPrompt` /
 * append `VD_PRODUCT_LOCK_INSTRUCTION` (see this file's header doc comment,
 * plan.md §1) — this path is exempt by design.
 *
 * Forbidden-claim screening runs BEFORE crediting: a policy-violating
 * response throws `VdAdBannerForbiddenClaimError` WITHOUT deducting credits,
 * so the user is never charged for output they cannot use.
 */
export async function generateAdBannerPrompt(
  params: GenerateAdBannerPromptParams
): Promise<GenerateAdBannerPromptResult> {
  const rateLimitKey = `user:${params.userId}`;
  if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
    throw new AdBannerRateLimitExceededError(
      mediaGenerationLimiter.getResetTime(rateLimitKey)
    );
  }

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const { model, hasVision } = await resolveAdBannerPromptModel(
    params.referenceImageUrls.length > 0,
    params.seriesId
  );
  const systemPrompt = loadAdBannerPromptSystemPrompt();
  const userPromptText = buildAdBannerPromptUserPrompt(params, hasVision);

  const userContent = hasVision
    ? [
        { type: "text" as const, text: userPromptText },
        ...params.referenceImageUrls.map(url => ({
          type: "image_url" as const,
          image_url: { url, detail: "high" as const },
        })),
      ]
    : userPromptText;

  const attempt = async (content: typeof userContent, maxTokens: number) => {
    const result = await executeWithFallback({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      stream: false,
      userId: params.userId,
      maxTokens,
      temperature: 0.7,
    });

    if (result.type !== "success") {
      throw new Error(
        result.type === "error"
          ? `LLM request failed: ${result.error}`
          : "LLM request did not reach a successful provider response"
      );
    }

    const responseContent =
      result.response.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(responseContent);
    const validation = adBannerPromptOutputSchema.safeParse(parsed);
    if (!validation.success) {
      throw new VdSchemaValidationError(
        "Ad banner prompt response failed schema validation",
        validation.error
      );
    }
    return { data: validation.data, response: result.response };
  };

  let outcome: Awaited<ReturnType<typeof attempt>>;
  try {
    outcome = await attempt(userContent, 1500);
  } catch (firstError) {
    if (!(firstError instanceof VdSchemaValidationError)) throw firstError;
    const retryText = `${userPromptText}\n\nYour previous response was truncated or was not valid JSON. Return ONLY complete, valid, compact JSON (no markdown fences, no commentary, no trailing text).`;
    const retryContent = hasVision
      ? [
          { type: "text" as const, text: retryText },
          ...params.referenceImageUrls.map(url => ({
            type: "image_url" as const,
            image_url: { url, detail: "high" as const },
          })),
        ]
      : retryText;
    outcome = await attempt(retryContent, 3000);
  }

  const { data, response } = outcome;

  const combinedForbiddenCheckText = [
    data.imagePrompt,
    ...data.textInImage,
  ].join(" \n ");
  if (
    containsForbiddenClaim(
      combinedForbiddenCheckText,
      params.product.forbiddenClaims
    )
  ) {
    throw new VdAdBannerForbiddenClaimError();
  }

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model
  );

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: `Vertical Drama — generate ad banner prompt (series #${params.seriesId}, banner ${params.bannerId})`,
    sourceType: "skill",
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_ad_banner",
      seriesId: params.seriesId,
      bannerId: params.bannerId,
      usedVision: hasVision,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  return {
    imagePrompt: data.imagePrompt,
    negativePrompt: data.negativePrompt,
    textInImage: data.textInImage,
    compositionNotes: data.compositionNotes,
    complianceNotes: data.complianceNotes,
    model,
    usedVision: hasVision,
    creditsUsed,
  };
}

/* -------------------------------------------------------------------------- */
/* Ad banner image generation                                                 */
/* -------------------------------------------------------------------------- */

export interface AdBannerImageModelPricing {
  modelId: string;
  creditCost: number;
  maxReferenceImages: number;
  /**
   * Feature 135 — Hermes Grok media worker (section 09, remediation row
   * 10). Reuses the SAME `media_models` row already read here for
   * pricing/capabilities — the router's transport-decision helper needs
   * this to detect a `hermes_worker`/`mcp` model without a second DB read.
   */
  configJson: Record<string, unknown> | null;
}

/**
 * Resolve pricing + reference-image capability for a caller-selected image
 * model in one DB read — the router uses this BEFORE deciding whether/how
 * much to charge and how many reference images to attach, mirroring
 * `generateCharacterImage`'s own pricing-row lookup + `resolveVerticalDramaCapabilities`
 * call, centralized here so the router's own test double stays a single
 * mockable call instead of duplicating the DB + capability logic inline.
 */
export async function resolveAdBannerImageModelPricing(
  modelId: string
): Promise<AdBannerImageModelPricing> {
  const [row] = await db
    .select({
      modelType: mediaModels.modelType,
      creditCost: mediaModels.creditCost,
      configJson: mediaModels.configJson,
      aspectRatios: mediaModels.aspectRatios,
    })
    .from(mediaModels)
    .where(eq(mediaModels.modelId, modelId))
    .limit(1);

  const pricingModel = row ?? { creditCost: 10, configJson: null };
  const creditCost = calculateCreditCost(pricingModel, { numImages: 1 });
  const capabilities = resolveVerticalDramaCapabilities(modelId, {
    type: row?.modelType ?? "image",
    aspectRatios: row?.aspectRatios ?? undefined,
    configJson: row?.configJson ?? undefined,
  });

  return {
    modelId,
    creditCost,
    maxReferenceImages: capabilities.maxReferenceImages ?? 0,
    configJson: (row?.configJson as Record<string, unknown> | null | undefined) ?? null,
  };
}

export interface SubmitAdBannerImageGenerationParams {
  userId: number;
  seriesId: number;
  bannerId: string;
  prompt: string;
  negativePrompt?: string;
  modelId: string;
  aspectRatio?: string;
  size?: string;
  /** Full candidate list (already deduped/capped at `VD_PRODUCT_REFERENCE_IMAGE_CAP`) — trimmed here to `maxReferenceImages`. */
  referenceImageUrls: string[];
  maxReferenceImages: number;
  publicUrl?: string;
  userToken: string;
  /**
   * Feature 135 — Hermes Grok media worker (section 09, remediation row
   * 10). Mirrors `generateCharacterImage`'s `transportMetadata` param —
   * when the router resolved an MCP-transport model, it passes the
   * resolved `MediaTaskTransportMetadata` through here so
   * `mediaGenerationService.generateImageAsync`'s own MCP branch submits
   * through the connected provider account instead of the gateway_api/
   * Python-backend path. `undefined` for gateway_api models (byte-identical
   * to before this param existed).
   */
  transportMetadata?: import("../../shared/mcpConnectTypes").MediaTaskTransportMetadata;
}

export interface SubmitAdBannerImageGenerationResult {
  taskId: string;
}

/**
 * Submit the banner's image render through `mediaGenerationService`'s async
 * image path — mirrors `generateCharacterImage`'s `generateImageAsync` call
 * shape exactly (series/banner provenance tagged into `extraParams`,
 * `auditContext` for end-to-end tracing). Does NOT check/deduct/refund
 * credits itself — the caller (router) owns that lifecycle, same as
 * `generateCharacterImage`'s own convention.
 */
export async function submitAdBannerImageGeneration(
  params: SubmitAdBannerImageGenerationParams
): Promise<SubmitAdBannerImageGenerationResult> {
  const trimmedReferenceImageUrls =
    params.maxReferenceImages > 0
      ? params.referenceImageUrls.slice(0, params.maxReferenceImages)
      : [];

  const task = await mediaGenerationService.generateImageAsync(
    {
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      model: params.modelId,
      numImages: 1,
      aspectRatio: params.aspectRatio,
      size: params.size,
      ...(trimmedReferenceImageUrls.length > 0
        ? { referenceImageUrls: trimmedReferenceImageUrls }
        : {}),
      extraParams: {
        __vd_series_id: String(params.seriesId),
        __vd_ad_banner_id: params.bannerId,
      },
      publicUrl: params.publicUrl,
      ...(params.transportMetadata ? { transportMetadata: params.transportMetadata } : {}),
      auditContext: {
        userId: params.userId,
        traceId: crypto.randomUUID(),
        source: "trpc.verticalDramaSeries.generateAdBannerImage",
        stage: "submission",
      },
    },
    params.userToken
  );

  return { taskId: task.id };
}
