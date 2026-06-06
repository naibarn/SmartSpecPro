import { z } from "zod";

export const marketplacePlatforms = ["shopee", "tiktok_shop"] as const;
export const marketplacePageTypes = ["product", "category", "search", "shop", "unknown"] as const;
export const marketplaceCaptureStatuses = [
  "captured",
  "uploading_assets",
  "analyzing",
  "analyzed",
  "confirmed",
  "failed",
  "discarded",
] as const;
export const marketplaceAssetKinds = [
  "screenshot",
  "main_image",
  "description_image",
  "review_image",
  "html_snapshot",
  "raw_payload",
  "category_grid_screenshot",
] as const;
export const marketplaceUrlFormats = [
  "seo_url",
  "product_url",
  "shop_home",
  "category_url",
  "pdp_url",
  "view_product_url",
  "not_found",
] as const;

export const MARKETPLACE_CAPTURE_DEFAULTS = {
  platform: "shopee",
  maxCategoryCards: 60,
  maxRecommendedCards: 20,
  minRecommendedScore: 50,
  maxScreenshots: 6,
  maxMainImages: 12,
  maxDescriptionImages: 20,
  screenshotFormat: "png",
  screenshotQuality: 0.92,
  scrollDelayMs: 800,
  thumbnailClickDelayMs: 500,
  llmLanguage: "th",
} as const;

export const MARKETPLACE_CAPTURE_LIMITS = {
  maxCategoryCards: 100,
  maxScrollSteps: 8,
  maxScreenshots: 8,
  maxImageCandidates: 50,
  maxDomTextChars: 80_000,
  maxHtmlBlockChars: 20_000,
  maxUploadBytes: 10 * 1024 * 1024,
  maxCaptureBytes: 50 * 1024 * 1024,
  localAIProductTitleChars: 300,
  localAIDescriptionChars: 4_000,
  localAIReviewCount: 30,
  localAIReviewChars: 500,
  localAICommentCount: 30,
  localAICommentChars: 300,
  localAIEvidenceCount: 80,
  localAIPromptPayloadChars: 25_000,
} as const;

export const localInsightTypes = [
  "product_brief",
  "review_insight",
  "tiktok_shop_trend",
  "video_brief",
  "combined_opportunity",
  "storytelling_handoff",
] as const;

export const localAIProviders = ["chrome_prompt_api", "ollama", "lm_studio", "localai", "llama_cpp", "custom_http", "native_messaging", "server_ai", "noop", "manual"] as const;
export const promptAPIAvailabilities = ["available", "downloadable", "downloading", "unavailable", "unknown"] as const;
export const marketplaceInsightStatuses = ["draft", "ready", "needs_review", "synced", "stale", "failed"] as const;
export const storytellingReadinessStates = ["ready_for_storytelling", "ready_with_warnings", "needs_user_review", "insufficient_evidence"] as const;
export const customerJourneyStages = [
  "awareness",
  "problem_recognition",
  "consideration",
  "proof_review_demo",
  "objection_handling",
  "trust_building",
  "conversion_cta",
  "retention_brand_recall",
] as const;

export const productReferenceCategorySchema = z.enum([
  "auto",
  "household_product",
  "computer_laptop",
  "electrical_appliance",
  "food_beverage",
  "electronics",
  "fashion_clothing",
  "shoes",
  "watch_eyewear",
  "mobile_tablet",
  "jewelry",
  "mother_baby",
  "pet_supplies",
  "sports_equipment",
  "camera_photography",
  "gaming_accessories",
  "automotive",
  "stationery",
  "books",
  "furniture",
  "cosmetics",
]);

export const evidenceItemSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.enum(["title", "description", "price", "rating", "review", "comment", "hashtag", "caption", "metric", "image_alt", "seller_info", "specification", "image"]),
  text: z.string().max(1200),
  sourceSelector: z.string().max(300).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const sanitizedLocalAIInputSchema = z.object({
  schemaVersion: z.literal("1.0"),
  captureId: z.string().max(64).optional(),
  platform: z.enum(marketplacePlatforms),
  sourceUrl: z.string().url(),
  affiliateUrl: z.string().url().nullable().optional(),
  capturedAt: z.string().max(80),
  pageTitle: z.string().max(500).optional(),
  locale: z.string().max(16).optional(),
  product: z.object({
    title: z.string().max(MARKETPLACE_CAPTURE_LIMITS.localAIProductTitleChars).optional(),
    price: z.string().max(128).optional(),
    originalPrice: z.string().max(128).optional(),
    discount: z.string().max(64).optional(),
    commissionRatePercent: z.number().min(0).max(100).nullable().optional(),
    rating: z.string().max(64).optional(),
    soldCount: z.string().max(128).optional(),
    description: z.string().max(MARKETPLACE_CAPTURE_LIMITS.localAIDescriptionChars).optional(),
    category: z.string().max(300).optional(),
    productCategory: productReferenceCategorySchema.optional(),
    categoryPath: z.array(z.string().max(120)).max(8).optional(),
    variants: z.string().max(1000).optional(),
    stock: z.string().max(300).optional(),
    selectedImageUrls: z.array(z.string().max(4096)).max(30).default([]),
  }).default({}),
  shop: z.object({
    name: z.string().max(300).optional(),
    location: z.string().max(300).optional(),
    isMall: z.boolean().nullable().optional(),
  }).optional(),
  reviews: z.array(z.object({
    id: z.string().max(120),
    rating: z.number().min(0).max(5).optional(),
    text: z.string().max(MARKETPLACE_CAPTURE_LIMITS.localAIReviewChars),
    variant: z.string().max(200).optional(),
    createdAtText: z.string().max(120).optional(),
  })).max(MARKETPLACE_CAPTURE_LIMITS.localAIReviewCount).default([]),
  tiktok: z.object({
    caption: z.string().max(1000).optional(),
    author: z.string().max(200).optional(),
    hashtags: z.array(z.string().max(120)).max(40).default([]),
    likeCount: z.string().max(80).optional(),
    commentCount: z.string().max(80).optional(),
    shareCount: z.string().max(80).optional(),
    saveCount: z.string().max(80).optional(),
    musicTitle: z.string().max(300).optional(),
  }).optional(),
  comments: z.array(z.object({
    id: z.string().max(120),
    author: z.string().max(200).optional(),
    text: z.string().max(MARKETPLACE_CAPTURE_LIMITS.localAICommentChars),
    likeCount: z.string().max(80).optional(),
  })).max(MARKETPLACE_CAPTURE_LIMITS.localAICommentCount).default([]),
  evidence: z.array(evidenceItemSchema).max(MARKETPLACE_CAPTURE_LIMITS.localAIEvidenceCount).default([]),
  payloadHash: z.string().max(128),
});

const sourceRefSchema = z.object({
  platform: z.enum(marketplacePlatforms),
  captureId: z.string().max(64).optional(),
  url: z.string().url(),
  affiliateUrl: z.string().url().nullable().optional(),
});

const boundedStringArray = (maxItems = 12, maxChars = 220) => z.array(z.string().max(maxChars)).max(maxItems).default([]);

const marketplaceInsightSyncMetadataSchema = z.object({
  providerDecision: z.enum(localAIProviders).optional(),
  sanitizerVersion: z.string().max(40).optional(),
  generationRunId: z.string().max(120).optional(),
  inputEvidenceIds: z.array(z.string().max(120)).max(120).default([]),
  sourceIds: z.object({
    externalProductId: z.string().max(120).nullable().optional(),
    externalShopId: z.string().max(120).nullable().optional(),
    canonicalSourceUrl: z.string().url().nullable().optional(),
  }).optional(),
  sourceIdentity: z.object({
    platform: z.enum(marketplacePlatforms),
    canonicalSourceUrl: z.string().url().optional(),
    externalProductId: z.string().max(120).nullable().optional(),
    externalShopId: z.string().max(120).nullable().optional(),
  }).optional(),
  sourceIdentityHash: z.string().max(80).optional(),
  semanticKey: z.string().max(160).optional(),
  semanticPayloadHash: z.string().max(80).optional(),
  selectedImageQuality: z.array(z.object({
    evidenceId: z.string().max(120).optional(),
    url: z.string().max(4096),
    role: z.string().max(80).optional(),
    kind: z.string().max(80).optional(),
    quality: z.string().max(80).optional(),
    qualityLabel: z.string().max(120).optional(),
    width: z.number().min(0).max(20_000).optional(),
    height: z.number().min(0).max(20_000).optional(),
    warning: z.string().max(240).optional(),
  })).max(30).default([]),
  dataQualityWarnings: z.array(z.string().max(300)).max(50).default([]),
  storyOptionCount: z.number().int().min(0).max(12).optional(),
  storyOptionVideoBriefCount: z.number().int().min(0).max(12).optional(),
}).default({});

export const productBriefSchema = z.object({
  schemaVersion: z.literal("1.0"),
  source: sourceRefSchema,
  productName: z.string().min(1).max(300),
  category: z.string().max(200).optional(),
  productCategory: productReferenceCategorySchema.optional(),
  shortSummary: z.string().max(800),
  keySellingPoints: boundedStringArray(),
  targetAudiences: boundedStringArray(),
  buyerPainPoints: boundedStringArray(),
  buyerObjections: boundedStringArray(),
  trustSignals: boundedStringArray(),
  contentAngles: boundedStringArray(),
  suggestedHooks: boundedStringArray(),
  suggestedCTAs: boundedStringArray(),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string().max(120)).max(80).default([]),
}).strict();

export const reviewInsightSchema = z.object({
  schemaVersion: z.literal("1.0"),
  source: sourceRefSchema,
  positiveThemes: boundedStringArray(),
  negativeThemes: boundedStringArray(),
  repeatedPhrases: boundedStringArray(20, 160),
  commonBuyerQuestions: boundedStringArray(),
  objectionsToAddress: boundedStringArray(),
  recommendedFAQ: z.array(z.object({
    question: z.string().max(240),
    answerDraft: z.string().max(500),
  })).max(12).default([]),
  contentRecommendations: boundedStringArray(),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string().max(120)).max(80).default([]),
}).strict();

export const tiktokShopTrendBriefSchema = z.object({
  schemaVersion: z.literal("1.0"),
  source: sourceRefSchema,
  contentType: z.enum(["product_review", "demo", "before_after", "storytelling", "trend", "educational", "unknown"]),
  hookPattern: z.string().max(300),
  structure: boundedStringArray(12, 220),
  hashtags: z.array(z.string().max(120)).max(40).default([]),
  audience: boundedStringArray(),
  engagementDrivers: boundedStringArray(),
  replicableIdeas: boundedStringArray(),
  risks: boundedStringArray(),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string().max(120)).max(80).default([]),
}).strict();

export const videoBriefSceneSchema = z.object({
  order: z.number().int().min(1).max(30),
  startSec: z.number().min(0).max(120),
  endSec: z.number().min(0).max(120),
  sceneGoal: z.string().max(300),
  visualSuggestion: z.string().max(500),
  onScreenText: z.string().max(220),
  voiceover: z.string().max(500).optional(),
  assetRole: z.enum(["product_image", "demo_video", "screenshot", "ugc_clip", "text_only"]).optional(),
}).refine((scene) => scene.endSec > scene.startSec, "Scene endSec must be after startSec");

export const videoBriefSchema = z.object({
  schemaVersion: z.literal("1.0"),
  sourceCaptureIds: z.array(z.string().max(64)).max(10).default([]),
  targetFormat: z.enum(["tiktok_short", "reels_short", "shopee_video", "generic_social"]),
  durationSec: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]),
  aspectRatio: z.enum(["9:16", "1:1", "16:9"]),
  language: z.enum(["th", "en", "mixed"]),
  title: z.string().max(240),
  hook: z.string().max(300),
  scenes: z.array(videoBriefSceneSchema).min(1).max(20),
  captions: boundedStringArray(20, 220),
  cta: z.string().max(220),
  assetsNeeded: boundedStringArray(20, 160),
  hyperframesHint: z.object({
    visualStyle: z.string().max(160),
    transitionStyle: z.string().max(160),
    textOverlayStyle: z.string().max(160),
    pacing: z.enum(["slow", "medium", "fast"]),
  }).optional(),
  confidence: z.number().min(0).max(1),
}).strict();

export const storyOptionVideoShotSchema = z.object({
  order: z.number().int().min(1).max(3),
  startSec: z.number().min(0).max(30),
  endSec: z.number().min(0).max(30),
  title: z.string().max(240),
  videoPrompt: z.string().max(1400),
  subShots: z.array(z.string().max(500)).length(3),
  thaiVoiceover: z.string().max(600),
}).refine((shot) => shot.endSec > shot.startSec, "Shot endSec must be after startSec");

export const storyOptionVideoBriefSchema = z.object({
  schemaVersion: z.literal("1.0"),
  durationSec: z.literal(30),
  aspectRatio: z.literal("9:16"),
  language: z.literal("th"),
  structureLabel: z.string().max(120),
  noOnScreenText: z.literal(true),
  shots: z.array(storyOptionVideoShotSchema).length(3),
}).strict();

export const combinedOpportunityBriefSchema = z.object({
  schemaVersion: z.literal("1.0"),
  shopeeCaptureId: z.string().max(64).optional(),
  tiktokCaptureId: z.string().max(64).optional(),
  opportunitySummary: z.string().max(800),
  productTrendFitScore: z.number().min(0).max(100),
  recommendedContentFormat: z.string().max(200),
  suggestedPositioning: z.string().max(500),
  risks: boundedStringArray(),
  nextActions: z.array(z.enum(["create_video_brief", "send_to_ai_video_studio", "save_to_product_library", "create_ad_copy"])).max(8).default([]),
}).strict();

export const evidenceBackedClaimSchema = z.object({
  id: z.string().min(1).max(120),
  text: z.string().max(300),
  evidenceIds: z.array(z.string().max(120)).max(20).default([]),
  status: z.enum(["supported", "needs_review", "user_approved", "removed"]).default("needs_review"),
  confidence: z.number().min(0).max(1).default(0),
});

export const storytellingOptionSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().max(160),
  audience: z.string().max(300),
  customerNeed: z.string().max(500),
  problemToSolve: z.string().max(500),
  useCase: z.string().max(500),
  angle: z.string().max(500),
  storyFormat: z.enum(["product_review", "sales_demo", "brand_awareness", "before_after", "customer_journey", "tiktok_shop_trend", "shopee_support", "ugc_review", "cinematic_brand_story"]),
  journeyStages: z.array(z.enum(customerJourneyStages)).min(1).max(12),
  hook: z.string().max(300),
  storyboardOutline: boundedStringArray(8, 320),
  primaryClaimIds: z.array(z.string().max(120)).max(20).default([]),
  evidenceIds: z.array(z.string().max(120)).max(80).default([]),
  confidence: z.number().min(0).max(1).default(0),
  autoSelected: z.boolean().default(false),
  decisionReason: z.string().max(300).optional(),
  source: z.enum(["ai_detected", "user_confirmed", "mixed"]).optional(),
  userAdditions: z.array(z.object({
    category: z.enum(["audience_pain_problem", "selling_points", "hooks", "objections_trust", "example_use_case"]),
    values: z.array(z.string().max(300)).max(8).default([]),
    rawText: z.string().max(1400),
    source: z.literal("user_confirmed"),
    confirmedAt: z.string().max(80),
    confidence: z.number().min(0).max(1).default(0),
  })).max(20).default([]),
  videoBrief: storyOptionVideoBriefSchema.optional(),
}).strict();

export const marketplaceStorytellingHandoffSchema = z.object({
  schemaVersion: z.literal("1.0"),
  sourceCaptureIds: z.array(z.string().max(64)).max(10).default([]),
  insightIds: z.array(z.string().max(64)).max(20).default([]),
  productName: z.string().max(300),
  productCategory: productBriefSchema.shape.productCategory,
  sourceUrl: z.string().url(),
  affiliateUrl: z.string().url().nullable().optional(),
  platform: z.enum(marketplacePlatforms),
  storyFormat: z.enum(["product_review", "sales_demo", "brand_awareness", "before_after", "customer_journey", "tiktok_shop_trend", "shopee_support", "ugc_review", "cinematic_brand_story"]),
  readiness: z.enum(storytellingReadinessStates),
  blockers: boundedStringArray(20, 240),
  customerJourneyStages: z.array(z.enum(customerJourneyStages)).min(1).max(20),
  storyOptions: z.array(storytellingOptionSchema).max(12).default([]),
  claims: z.array(evidenceBackedClaimSchema).max(80).default([]),
  selectedImages: z.array(z.object({
    url: z.string().max(4096),
    role: z.enum(["hero", "detail", "review", "proof", "background"]).default("hero"),
    fidelity: z.enum(["confirmed_product", "likely_product", "unknown", "mismatch_risk"]).default("unknown"),
  })).max(30).default([]),
  videoBrief: videoBriefSchema.optional(),
  evidenceIds: z.array(z.string().max(120)).max(120).default([]),
  confidence: z.number().min(0).max(1).default(0),
}).strict();

export const localInsightPayloadSchemas = {
  product_brief: productBriefSchema,
  review_insight: reviewInsightSchema,
  tiktok_shop_trend: tiktokShopTrendBriefSchema,
  video_brief: videoBriefSchema,
  combined_opportunity: combinedOpportunityBriefSchema,
  storytelling_handoff: marketplaceStorytellingHandoffSchema,
} as const;

export const marketplaceCaptureInsightSyncSchema = z.object({
  extensionVersion: z.string().max(80),
  idempotencyKey: z.string().min(8).max(160),
  schemaVersion: z.literal("1.0"),
  insightCreatedAt: z.string().max(80),
  payloadHash: z.string().min(8).max(128),
  source: z.object({
    platform: z.enum(marketplacePlatforms),
    url: z.string().url(),
    affiliateUrl: z.string().url().nullable().optional(),
    capturedAt: z.string().max(80),
    captureId: z.string().max(64).optional(),
    marketplaceProductId: z.string().max(64).optional(),
  }),
  insightType: z.enum(localInsightTypes),
  provider: z.enum(localAIProviders),
  status: z.enum(marketplaceInsightStatuses).optional().default("ready"),
  parentInsightIds: z.array(z.string().max(64)).max(20).optional().default([]),
  metadata: marketplaceInsightSyncMetadataSchema.optional().default({}),
  payload: z.unknown(),
  rawCaptureIncluded: z.boolean().default(false),
  rawCapture: z.unknown().optional(),
}).superRefine((value, ctx) => {
  const schema = localInsightPayloadSchemas[value.insightType];
  const parsed = schema.safeParse(value.payload);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`)
      .join("; ");
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid ${value.insightType} payload${detail ? ` (${detail})` : ""}` });
  }
});

export const marketplaceServerInsightGenerationSchema = z.object({
  extensionVersion: z.string().max(80),
  insightType: z.literal("product_brief"),
  languagePreference: z.enum(["auto", "th", "en", "mixed"]).optional().default("auto"),
  source: sanitizedLocalAIInputSchema,
}).strict();

export const marketplaceServerInsightGenerationResponseSchema = z.object({
  ok: z.boolean(),
  provider: z.literal("server_ai"),
  insightType: z.literal("product_brief"),
  payload: productBriefSchema.optional(),
  fallbackMode: z.enum(["llm_gateway", "deterministic_fallback"]).optional(),
  error: z.object({
    code: z.string().max(80),
    message: z.string().max(500),
    recoverable: z.boolean(),
  }).optional(),
}).strict();

export const marketplaceClaimResolutionSchema = z.object({
  insightId: z.string().min(1).max(64),
  claimId: z.string().min(1).max(120),
  decision: z.enum(["approve", "edit", "remove", "request_more_evidence", "mark_unresolved"]),
  editedText: z.string().max(300).optional(),
  reason: z.string().max(500).optional(),
});

export const domRectLikeSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  top: z.number().optional(),
  left: z.number().optional(),
  right: z.number().optional(),
  bottom: z.number().optional(),
}).passthrough();

export const htmlBlockSchema = z.object({
  name: z.string().min(1).max(100),
  text: z.string().max(MARKETPLACE_CAPTURE_LIMITS.maxHtmlBlockChars).optional().default(""),
  outerHTML: z.string().max(MARKETPLACE_CAPTURE_LIMITS.maxHtmlBlockChars).optional(),
  metadata: z.record(z.unknown()).optional().default({}),
});

export const imageCandidateSchema = z.object({
  url: z.string().min(1).max(4096),
  kind: z.enum(["main", "description", "review", "related", "unknown"]).default("unknown"),
  source: z.enum(["dom", "screenshot", "manual", "remote"]).default("dom"),
  position: z.number().int().min(0).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  selected: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const categoryCandidateSchema = z.object({
  platform: z.enum(marketplacePlatforms),
  sourceUrl: z.string().url(),
  externalProductId: z.string().max(128).nullable().optional(),
  externalShopId: z.string().max(128).nullable().optional(),
  title: z.string().min(1).max(1000),
  url: z.string().url(),
  priceText: z.string().max(128).nullable().optional(),
  originalPriceText: z.string().max(128).nullable().optional(),
  discountText: z.string().max(64).nullable().optional(),
  soldCountText: z.string().max(128).nullable().optional(),
  soldCountValue: z.number().int().min(0).nullable().optional(),
  ratingText: z.string().max(128).nullable().optional(),
  commissionRatePercent: z.number().min(0).max(100).nullable().optional(),
  commissionRateText: z.string().max(128).nullable().optional(),
  affiliateUrl: z.string().url().nullable().optional(),
  commissionCheckUrl: z.string().url().nullable().optional(),
  affiliateLinkAvailable: z.boolean().nullable().optional(),
  affiliateCardKey: z.string().max(512).nullable().optional(),
  imageUrl: z.string().max(4096).nullable().optional(),
  imageUrls: z.array(z.string().max(4096)).max(60).optional(),
  originalUrl: z.string().max(4096).optional(),
  cleanUrl: z.string().max(4096).optional(),
  canonicalUrl: z.string().max(4096).nullable().optional(),
  urlFormat: z.enum(marketplaceUrlFormats).optional(),
  badges: z.array(z.string().max(80)).default([]),
  position: z.number().int().min(0).default(0),
  boundingBox: domRectLikeSchema.optional(),
  score: z.number().int().min(0).max(100).default(0),
  scoreReasons: z.array(z.string().max(200)).default([]),
});

export const createMarketplaceCaptureDraftSchema = z.object({
  platform: z.enum(marketplacePlatforms),
  sourceUrl: z.string().url(),
  affiliateUrl: z.string().url().nullable().optional(),
  originalSourceUrl: z.string().max(4096).optional(),
  cleanSourceUrl: z.string().max(4096).optional(),
  canonicalSourceUrl: z.string().max(4096).nullable().optional(),
  productPageUrl: z.string().max(4096).nullable().optional(),
  sourceUrlFormat: z.enum(marketplaceUrlFormats).optional(),
  pageType: z.enum(marketplacePageTypes),
  externalProductId: z.string().max(128).nullable().optional(),
  externalShopId: z.string().max(128).nullable().optional(),
  pageTitle: z.string().max(1000).nullable().optional(),
  domText: z.string().max(MARKETPLACE_CAPTURE_LIMITS.maxDomTextChars).optional().default(""),
  htmlBlocks: z.array(htmlBlockSchema).max(30).optional().default([]),
  imageCandidates: z.array(imageCandidateSchema).max(MARKETPLACE_CAPTURE_LIMITS.maxImageCandidates).optional().default([]),
  rawPayload: z.record(z.unknown()).optional().default({}),
  categoryContext: z.record(z.unknown()).optional(),
});

export const analyzeMarketplaceCaptureSchema = z.object({
  modelPreference: z.string().max(100).optional().default("vision_best_available"),
  forceRerun: z.boolean().optional().default(false),
  language: z.string().max(16).optional().default("th"),
  options: z.object({
    extractIngredients: z.boolean().optional().default(true),
    extractClaims: z.boolean().optional().default(true),
    extractPrice: z.boolean().optional().default(true),
    classifyImages: z.boolean().optional().default(true),
  }).optional().default({}),
});

export const marketplaceConfirmProductSchema = z.object({
  product: z.object({
    productName: z.string().min(1).max(1000),
    brand: z.string().max(300).nullable().optional(),
    shopName: z.string().max(300).nullable().optional(),
    isMall: z.boolean().nullable().optional(),
    price: z.object({
      current: z.number().nullable().optional(),
      original: z.number().nullable().optional(),
      currency: z.string().max(16).optional().default("THB"),
      discountText: z.string().max(64).nullable().optional(),
    }).optional().default({}),
    affiliateUrl: z.string().url().nullable().optional(),
    productCategory: productReferenceCategorySchema.nullable().optional(),
    commissionRatePercent: z.number().min(0).max(100).nullable().optional(),
    rating: z.object({
      score: z.number().min(0).max(5).nullable().optional(),
      reviewCountText: z.string().max(128).nullable().optional(),
      soldCountText: z.string().max(128).nullable().optional(),
    }).optional().default({}),
    description: z.object({
      rawText: z.string().optional().default(""),
      ingredients: z.array(z.string()).optional().default([]),
      claims: z.array(z.string()).optional().default([]),
      specs: z.record(z.unknown()).optional().default({}),
    }).optional().default({}),
    images: z.object({
      main: z.array(z.string()).optional().default([]),
      description: z.array(z.string()).optional().default([]),
      review: z.array(z.string()).optional().default([]),
      relatedExcluded: z.array(z.string()).optional().default([]),
      coverAssetId: z.string().nullable().optional(),
    }).optional().default({}),
    platformRawJson: z.record(z.unknown()).optional().default({}),
  }),
});

export const categoryCandidatesUploadSchema = z.object({
  platform: z.enum(marketplacePlatforms),
  sourceUrl: z.string().url(),
  categoryName: z.string().max(500).nullable().optional(),
  sortMode: z.string().max(100).nullable().optional(),
  filters: z.record(z.unknown()).optional().default({}),
  candidates: z.array(categoryCandidateSchema).max(MARKETPLACE_CAPTURE_LIMITS.maxCategoryCards),
});

export type MarketplacePlatform = typeof marketplacePlatforms[number];
export type MarketplacePageType = typeof marketplacePageTypes[number];
export type MarketplaceCaptureStatus = typeof marketplaceCaptureStatuses[number];
export type MarketplaceAssetKind = typeof marketplaceAssetKinds[number];
export type MarketplaceUrlFormat = typeof marketplaceUrlFormats[number];
export type LocalInsightType = typeof localInsightTypes[number];
export type LocalAIProviderId = typeof localAIProviders[number];
export type PromptAPIAvailability = typeof promptAPIAvailabilities[number];
export type MarketplaceInsightStatus = typeof marketplaceInsightStatuses[number];
export type StorytellingReadinessState = typeof storytellingReadinessStates[number];
export type CustomerJourneyStage = typeof customerJourneyStages[number];
export type HtmlBlock = z.infer<typeof htmlBlockSchema>;
export type ImageCandidate = z.infer<typeof imageCandidateSchema>;
export type CategoryCandidate = z.infer<typeof categoryCandidateSchema>;
export type CreateMarketplaceCaptureDraftInput = z.infer<typeof createMarketplaceCaptureDraftSchema>;
export type AnalyzeMarketplaceCaptureInput = z.infer<typeof analyzeMarketplaceCaptureSchema>;
export type MarketplaceConfirmProductInput = z.infer<typeof marketplaceConfirmProductSchema>;
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;
export type SanitizedLocalAIInput = z.infer<typeof sanitizedLocalAIInputSchema>;
export type ProductBrief = z.infer<typeof productBriefSchema>;
export type ReviewInsight = z.infer<typeof reviewInsightSchema>;
export type TikTokShopTrendBrief = z.infer<typeof tiktokShopTrendBriefSchema>;
export type VideoBrief = z.infer<typeof videoBriefSchema>;
export type CombinedOpportunityBrief = z.infer<typeof combinedOpportunityBriefSchema>;
export type StorytellingOption = z.infer<typeof storytellingOptionSchema>;
export type MarketplaceStorytellingHandoff = z.infer<typeof marketplaceStorytellingHandoffSchema>;
export type MarketplaceCaptureInsightSyncInput = z.infer<typeof marketplaceCaptureInsightSyncSchema>;
export type MarketplaceServerInsightGenerationInput = z.infer<typeof marketplaceServerInsightGenerationSchema>;
export type MarketplaceServerInsightGenerationResponse = z.infer<typeof marketplaceServerInsightGenerationResponseSchema>;
export type MarketplaceClaimResolutionInput = z.infer<typeof marketplaceClaimResolutionSchema>;

export type ShopeeUrlFormat = "seo_url" | "product_url" | "not_found";

export interface ShopeeProductIds {
  shopId: string | null;
  itemId: string | null;
  format: ShopeeUrlFormat;
  originalUrl: string;
  cleanUrl: string;
  canonicalUrl: string | null;
}

export interface TikTokShopUrlParts {
  productId: string | null;
  categorySlug: string | null;
  categoryId: string | null;
  region: string | null;
  format: MarketplaceUrlFormat;
  originalUrl: string;
  cleanUrl: string;
  canonicalUrl: string | null;
}

export function parseThaiPrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/฿\s*(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function parseDiscountPercent(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/-(\d+)%/);
  return m ? Number(m[1]) : null;
}

export function parseSoldCount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = raw.toLowerCase().replace(/,/g, "").replace(/\s+/g, "");
  const n = text.match(/\d+(?:\.\d+)?/);
  if (!n) return null;
  const value = Number(n[0]);
  if (!Number.isFinite(value)) return null;
  if (/m\+?/.test(text) || /ล้าน/.test(text)) return Math.round(value * 1_000_000);
  if (/k\+?/.test(text) || /พัน/.test(text)) return Math.round(value * 1_000);
  if (/หมื่น/.test(text)) return Math.round(value * 10_000);
  return Math.round(value);
}

export function parseReviewCount(raw: string | null | undefined): number | null {
  return parseSoldCount(raw);
}

export function parseShopeeProductUrl(inputUrl: string): ShopeeProductIds {
  const originalUrl = inputUrl.trim();

  let cleanUrl = originalUrl;
  let hostname = "shopee.co.th";
  let pathname = originalUrl;

  try {
    const parsed = new URL(originalUrl);
    hostname = parsed.hostname;
    pathname = parsed.pathname;
    cleanUrl = `${parsed.origin}${parsed.pathname}`;
  } catch {
    const withoutQuery = originalUrl.split("?")[0] ?? originalUrl;
    const withoutHash = withoutQuery.split("#")[0] ?? withoutQuery;
    pathname = withoutHash;
    cleanUrl = withoutHash;
  }

  const seoMatch = pathname.match(/(?:^|[-/])i\.(\d+)\.(\d+)\/?$/);
  if (seoMatch) {
    const shopId = seoMatch[1];
    const itemId = seoMatch[2];
    return {
      shopId,
      itemId,
      format: "seo_url",
      originalUrl,
      cleanUrl,
      canonicalUrl: `https://${hostname}/product/${shopId}/${itemId}`,
    };
  }

  const productMatch = pathname.match(/\/product\/(\d+)\/(\d+)\/?$/);
  if (productMatch) {
    const shopId = productMatch[1];
    const itemId = productMatch[2];
    return {
      shopId,
      itemId,
      format: "product_url",
      originalUrl,
      cleanUrl,
      canonicalUrl: `https://${hostname}/product/${shopId}/${itemId}`,
    };
  }

  return {
    shopId: null,
    itemId: null,
    format: "not_found",
    originalUrl,
    cleanUrl,
    canonicalUrl: null,
  };
}

export function parseShopeeIds(url: string): { shopId: string | null; itemId: string | null } {
  const parsed = parseShopeeProductUrl(url);
  return { shopId: parsed.shopId, itemId: parsed.itemId };
}

export function parseTikTokShopUrl(inputUrl: string): TikTokShopUrlParts {
  const originalUrl = inputUrl.trim();
  let origin = "https://www.tiktok.com";
  let hostname = "www.tiktok.com";
  let pathname = originalUrl.split("?")[0]?.split("#")[0] ?? originalUrl;
  let cleanUrl = pathname;
  let productIdFromQuery: string | null = null;

  try {
    const parsed = new URL(originalUrl);
    origin = parsed.origin;
    hostname = parsed.hostname.toLowerCase();
    pathname = parsed.pathname;
    cleanUrl = `${parsed.origin}${parsed.pathname}`;
    productIdFromQuery = parsed.searchParams.get("product_id") || parsed.searchParams.get("productId");
  } catch {
    if (pathname.startsWith("/")) cleanUrl = `${origin}${pathname}`;
  }
  const supportsRootRegionPath = hostname === "shop.tiktok.com" || hostname.endsWith(".tiktokglobalshop.com");
  const canonicalRegionalPath = (region: string, suffix = "") => `${origin}${supportsRootRegionPath ? "" : "/shop"}/${region}${suffix}`;

  const pdpMatch = pathname.match(supportsRootRegionPath
    ? /^\/(?:shop\/)?([^/]+)\/pdp\/(?:[^/]+\/)?(\d+)\/?$/i
    : /^\/shop\/([^/]+)\/pdp\/(?:[^/]+\/)?(\d+)\/?$/i);
  if (pdpMatch) {
    const region = pdpMatch[1];
    const productId = pdpMatch[2];
    return {
      productId,
      categorySlug: null,
      categoryId: null,
      region,
      format: "pdp_url",
      originalUrl,
      cleanUrl,
      canonicalUrl: canonicalRegionalPath(region, `/pdp/${productId}`),
    };
  }

  const viewMatch = pathname.match(/^\/view\/product\/(\d+)\/?$/i);
  if (viewMatch) {
    const productId = viewMatch[1];
    return {
      productId,
      categorySlug: null,
      categoryId: null,
      region: null,
      format: "view_product_url",
      originalUrl,
      cleanUrl,
      canonicalUrl: `${origin}/view/product/${productId}`,
    };
  }

  const categoryMatch = pathname.match(supportsRootRegionPath
    ? /^\/(?:shop\/)?([^/]+)\/c\/([^/]+)\/(\d+)\/?$/i
    : /^\/shop\/([^/]+)\/c\/([^/]+)\/(\d+)\/?$/i);
  if (categoryMatch) {
    const region = categoryMatch[1];
    const categorySlug = categoryMatch[2];
    const categoryId = categoryMatch[3];
    return {
      productId: null,
      categorySlug,
      categoryId,
      region,
      format: "category_url",
      originalUrl,
      cleanUrl,
      canonicalUrl: canonicalRegionalPath(region, `/c/${categorySlug}/${categoryId}`),
    };
  }

  const shopHomeMatch = pathname.match(supportsRootRegionPath
    ? /^\/(?:shop\/)?([^/]+)\/?$/i
    : /^\/shop\/([^/]+)\/?$/i);
  if (shopHomeMatch) {
    const region = shopHomeMatch[1];
    return {
      productId: null,
      categorySlug: null,
      categoryId: null,
      region,
      format: "shop_home",
      originalUrl,
      cleanUrl,
      canonicalUrl: canonicalRegionalPath(region),
    };
  }

  if (productIdFromQuery) {
    return {
      productId: productIdFromQuery,
      categorySlug: null,
      categoryId: null,
      region: null,
      format: "view_product_url",
      originalUrl,
      cleanUrl,
      canonicalUrl: `${origin}/view/product/${productIdFromQuery}`,
    };
  }

  return {
    productId: null,
    categorySlug: null,
    categoryId: null,
    region: null,
    format: "not_found",
    originalUrl,
    cleanUrl,
    canonicalUrl: null,
  };
}

export interface CandidateScoreInput {
  soldCountNormalized: number | null;
  priceCurrent: number | null;
  discountPercent: number | null;
  isMall: boolean;
  hasFreeShippingBadge: boolean;
  hasClearImage: boolean;
  rankOnPage: number;
  titleKeywordMatches: number;
}

export function scoreCandidate(input: CandidateScoreInput): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (input.soldCountNormalized != null && input.soldCountNormalized > 0) {
    const soldScore = Math.min(40, Math.log10(input.soldCountNormalized + 1) * 8);
    score += soldScore;
    reasons.push(`ยอดขายสูง: ${input.soldCountNormalized.toLocaleString("th-TH")}`);
  }
  if (input.discountPercent != null && input.discountPercent >= 30) {
    score += Math.min(15, (input.discountPercent / 100) * 15);
    reasons.push(`ส่วนลด ${input.discountPercent}%`);
  }
  if (input.isMall) {
    score += 15;
    reasons.push("Mall / official badge");
  }
  if (input.priceCurrent != null) {
    score += 10;
    reasons.push("ราคาอ่านได้ชัดเจน");
  }
  if (input.hasFreeShippingBadge) {
    score += 5;
    reasons.push("มี free shipping/promotion badge");
  }
  if (input.hasClearImage) {
    score += 5;
    reasons.push("มีรูปสินค้าชัดเจน");
  }
  if (input.titleKeywordMatches > 0) {
    score += Math.min(10, input.titleKeywordMatches * 2);
    reasons.push("ตรง keyword ที่สนใจ");
  }
  if (input.rankOnPage <= 10) {
    score += 5;
    reasons.push("อยู่ในอันดับบนของหน้า");
  }

  return { score: Math.round(Math.min(100, score)), reasons };
}

export function normalizeTextSnippet(value: string | null | undefined, max = 5000): string {
  return String(value ?? "").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim().slice(0, max);
}
