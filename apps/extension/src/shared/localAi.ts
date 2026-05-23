import type { ImageCandidate, MarketplacePlatform, ProductCapturePayload } from "./types";

export type PromptAPIAvailability = "available" | "downloadable" | "downloading" | "unavailable" | "unknown";
export type LocalAIProviderId = "chrome_prompt_api" | "server_ai" | "noop" | "manual";
export type LocalInsightType = "product_brief" | "review_insight" | "tiktok_shop_trend" | "video_brief" | "combined_opportunity" | "storytelling_handoff";
export type AnalysisLanguagePreference = "auto" | "th" | "en" | "mixed";
export type LocalAIWorkflowState =
  | "idle"
  | "capture_ready"
  | "local_ai_ready"
  | "fallback_ready"
  | "detecting_ai"
  | "download_required"
  | "downloading"
  | "analyzing_local"
  | "analyzing_server"
  | "insight_ready"
  | "needs_review"
  | "syncing"
  | "synced"
  | "failed"
  | "cancelled"
  | "raw_capture_only";

export interface LocalAICapability {
  provider: "chrome_prompt_api";
  apiExposed: boolean;
  available: boolean;
  availability: PromptAPIAvailability;
  supportsText: boolean;
  supportsImageInput?: boolean;
  supportsAudioInput?: boolean;
  supportedLanguages?: string[];
  reason?: string;
}

export interface LocalAIProviderDecision {
  provider: LocalAIProviderId;
  state: LocalAIWorkflowState;
  canAnalyze: boolean;
  reason: string;
}

export interface LocalAISettings {
  preferLocalAI: boolean;
  sendStructuredInsightsOnly: boolean;
  includeRawCaptureOnSync: boolean;
  includeReviewsOnSync: boolean;
  saveDebugAIOutputs: boolean;
  enableServerFallback: boolean;
  languagePreference: AnalysisLanguagePreference;
}

export interface EvidenceItem {
  id: string;
  type: "title" | "description" | "price" | "rating" | "review" | "comment" | "hashtag" | "caption" | "metric" | "image_alt" | "seller_info" | "specification" | "image";
  text: string;
  sourceSelector?: string;
  confidence?: number;
}

export interface SanitizedLocalAIInput {
  schemaVersion: "1.0";
  captureId?: string;
  platform: MarketplacePlatform;
  sourceUrl: string;
  capturedAt: string;
  pageTitle?: string;
  product: {
    title?: string;
    price?: string;
    originalPrice?: string;
    discount?: string;
    commissionRatePercent?: number | null;
    rating?: string;
    soldCount?: string;
    description?: string;
    category?: string;
    variants?: string;
    stock?: string;
    selectedImageUrls: string[];
    selectedImages?: Array<Record<string, unknown>>;
    categoryPath?: string[];
  };
  shop?: {
    name?: string;
    location?: string;
    isMall?: boolean | null;
  };
  reviews: Array<{ id: string; rating?: number; text: string; variant?: string; createdAtText?: string }>;
  tiktok?: {
    caption?: string;
    author?: string;
    hashtags: string[];
    likeCount?: string;
    commentCount?: string;
    shareCount?: string;
    saveCount?: string;
    musicTitle?: string;
  };
  comments: Array<{ id: string; author?: string; text: string; likeCount?: string }>;
  evidence: EvidenceItem[];
  sourceIds?: {
    externalProductId?: string | null;
    externalShopId?: string | null;
    canonicalSourceUrl?: string | null;
  };
  sanitizerVersion?: string;
  payloadHash: string;
}

export interface ProductBrief {
  schemaVersion: "1.0";
  source: { platform: MarketplacePlatform; captureId?: string; url: string };
  productName: string;
  category?: string;
  shortSummary: string;
  keySellingPoints: string[];
  targetAudiences: string[];
  buyerPainPoints: string[];
  buyerObjections: string[];
  trustSignals: string[];
  contentAngles: string[];
  suggestedHooks: string[];
  suggestedCTAs: string[];
  confidence: number;
  evidenceIds: string[];
}

export interface VideoBriefScene {
  order: number;
  startSec: number;
  endSec: number;
  sceneGoal: string;
  visualSuggestion: string;
  onScreenText: string;
  voiceover?: string;
  assetRole?: "product_image" | "demo_video" | "screenshot" | "ugc_clip" | "text_only";
}

export interface VideoBrief {
  schemaVersion: "1.0";
  sourceCaptureIds: string[];
  targetFormat: "tiktok_short" | "reels_short" | "shopee_video" | "generic_social";
  durationSec: 15 | 30 | 45 | 60;
  aspectRatio: "9:16" | "1:1" | "16:9";
  language: "th" | "en" | "mixed";
  title: string;
  hook: string;
  scenes: VideoBriefScene[];
  captions: string[];
  cta: string;
  assetsNeeded: string[];
  hyperframesHint?: {
    visualStyle: string;
    transitionStyle: string;
    textOverlayStyle: string;
    pacing: "slow" | "medium" | "fast";
  };
  confidence: number;
}

export interface MarketplaceStorytellingHandoff {
  schemaVersion: "1.0";
  sourceCaptureIds: string[];
  insightIds: string[];
  productName: string;
  sourceUrl: string;
  platform: MarketplacePlatform;
  storyFormat: "product_review" | "sales_demo" | "brand_awareness" | "before_after" | "customer_journey" | "tiktok_shop_trend" | "shopee_support" | "ugc_review" | "cinematic_brand_story";
  readiness: "ready_for_storytelling" | "ready_with_warnings" | "needs_user_review" | "insufficient_evidence";
  blockers: string[];
  customerJourneyStages: Array<"awareness" | "problem_recognition" | "consideration" | "proof_review_demo" | "objection_handling" | "trust_building" | "conversion_cta" | "retention_brand_recall">;
  claims: Array<{ id: string; text: string; evidenceIds: string[]; status: "supported" | "needs_review" | "user_approved" | "removed"; confidence: number }>;
  selectedImages: Array<{ url: string; role: "hero" | "detail" | "review" | "proof" | "background"; fidelity: "confirmed_product" | "likely_product" | "unknown" | "mismatch_risk" }>;
  videoBrief?: VideoBrief;
  evidenceIds: string[];
  confidence: number;
}

export interface StructuredGenerationResult<T> {
  ok: boolean;
  provider: LocalAIProviderId;
  data?: T;
  rawText?: string;
  error?: { code: string; message: string; recoverable: boolean };
}

export interface ServerProductBriefGenerationResponse {
  ok: boolean;
  provider: "server_ai";
  insightType: "product_brief";
  payload?: ProductBrief;
  fallbackMode?: "llm_gateway" | "deterministic_fallback";
  error?: { code: string; message: string; recoverable: boolean };
}

export const defaultLocalAISettings: LocalAISettings = {
  preferLocalAI: true,
  sendStructuredInsightsOnly: true,
  includeRawCaptureOnSync: false,
  includeReviewsOnSync: false,
  saveDebugAIOutputs: false,
  enableServerFallback: true,
  languagePreference: "auto",
};

const TEXT_LIMITS = {
  title: 300,
  description: 4000,
  reviews: 30,
  reviewText: 500,
  comments: 30,
  commentText: 300,
  evidence: 80,
  promptPayload: 25000,
} as const;

function cleanText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\b(?:token|cookie|authorization|password|payment|checkout|order|chat|message)[=:][^\s]+/gi, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function addEvidence(items: EvidenceItem[], type: EvidenceItem["type"], seed: string, text: unknown, confidence = 0.8) {
  const cleaned = cleanText(text, 1200);
  if (!cleaned) return;
  items.push({ id: `${type}:${seed}`, type, text: cleaned, confidence });
}

function selectedUrls(images: ImageCandidate[]) {
  return images.filter((image) => image.selected !== false && image.kind !== "related").map((image) => image.url).slice(0, 30);
}

function selectedImageEvidence(images: ImageCandidate[]) {
  return images
    .filter((image) => image.selected !== false && image.kind !== "related")
    .slice(0, 30)
    .map((image, index) => ({
      id: cleanText(image.metadata?.evidenceId || image.evidenceId || `image:selected_${index + 1}`, 120),
      url: image.url,
      kind: image.kind,
      role: cleanText(image.metadata?.role || image.role || (index === 0 ? "hero" : image.kind), 80),
      quality: cleanText(image.metadata?.quality || image.quality || "unknown", 80),
      qualityLabel: cleanText(image.metadata?.qualityLabel || "", 120) || undefined,
      width: typeof image.width === "number" ? image.width : undefined,
      height: typeof image.height === "number" ? image.height : undefined,
      warning: cleanText(image.metadata?.warning, 240) || undefined,
    }));
}

function extractBoundedReviews(product: ProductCapturePayload) {
  const lines = product.rawDomText.split(/\n+/).map((line) => cleanText(line, 500)).filter(Boolean);
  const reviews: Array<{ id: string; rating?: number; text: string; variant?: string; createdAtText?: string }> = [];
  for (let index = 0; index < lines.length && reviews.length < TEXT_LIMITS.reviews; index += 1) {
    const line = lines[index];
    const looksReview = /คุณภาพ|การใช้งาน|รีวิว|ความคิดเห็น|จัดส่ง|สินค้า|น่ารัก|ดีมาก|ตรงปก|verified purchase|review/i.test(line);
    const hasNoise = /ซื้อเลย|เพิ่มลงรถเข็น|รายละเอียดสินค้า|สินค้าแนะนำ|Shopee|TikTok Shop/i.test(line);
    if (!looksReview || hasNoise || line.length < 12 || line.length > TEXT_LIMITS.reviewText) continue;
    const nearby = lines.slice(Math.max(0, index - 2), index + 3).join(" ");
    const rating = Number(nearby.match(/([1-5])\s*(?:ดาว|★|⭐)/i)?.[1]);
    reviews.push({
      id: `review:${reviews.length + 1}`,
      rating: Number.isFinite(rating) ? rating : undefined,
      text: line,
      variant: cleanText(nearby.match(/(?:ตัวเลือกสินค้า|variant)\s*[:：]?\s*([^|]{1,80})/i)?.[1], 120) || undefined,
      createdAtText: cleanText(nearby.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0], 80) || undefined,
    });
  }
  return reviews;
}

function extractTikTokSignals(product: ProductCapturePayload): SanitizedLocalAIInput["tiktok"] | undefined {
  if (product.platform !== "tiktok_shop") return undefined;
  const text = product.rawDomText;
  const hashtags = Array.from(new Set(Array.from(text.matchAll(/#[\p{L}\p{N}_]+/gu)).map((match) => match[0]).slice(0, 20)));
  return {
    caption: cleanText(text.match(/(?:caption|คำบรรยาย)\s*[:：]?\s*([^\n]{1,500})/i)?.[1], 500) || undefined,
    author: cleanText(text.match(/(?:Sold by|ขายโดย)\s+([^\n\r|]+)/i)?.[1] || product.shopName, 200) || undefined,
    hashtags,
    likeCount: cleanText(text.match(/([\d.,]+[kKmM]?)\s*(?:likes?|ถูกใจ)/i)?.[1], 80) || undefined,
    commentCount: cleanText(text.match(/([\d.,]+[kKmM]?)\s*(?:comments?|ความคิดเห็น)/i)?.[1], 80) || undefined,
    shareCount: cleanText(text.match(/([\d.,]+[kKmM]?)\s*(?:shares?|แชร์)/i)?.[1], 80) || undefined,
    saveCount: cleanText(text.match(/([\d.,]+[kKmM]?)\s*(?:saves?|บันทึก)/i)?.[1], 80) || undefined,
  };
}

export async function hashLocalAIInput(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sanitizeCaptureForLocalAI(product: ProductCapturePayload, captureId?: string): Promise<SanitizedLocalAIInput> {
  const evidence: EvidenceItem[] = [];
  addEvidence(evidence, "title", "product", product.productName || product.pageTitle, 0.9);
  addEvidence(evidence, "price", "current", product.priceCurrentText, 0.85);
  if (product.commissionRatePercent != null) addEvidence(evidence, "metric", "commission_rate", `Commission rate ${product.commissionRatePercent}%`, 0.95);
  addEvidence(evidence, "rating", "score", product.ratingScoreText, 0.75);
  addEvidence(evidence, "metric", "sold", product.soldCountText, 0.75);
  addEvidence(evidence, "description", "product", product.descriptionText, 0.7);
  addEvidence(evidence, "specification", "product", product.specificationText, 0.65);
  addEvidence(evidence, "seller_info", "shop", [product.shopName, product.sellerLocationText].filter(Boolean).join(" | "), 0.7);
  const selectedImageMeta = selectedImageEvidence(product.imageCandidates);
  for (const image of selectedImageMeta) {
    addEvidence(evidence, "image", image.id.replace(/^image:/, ""), [image.url, image.kind, image.role, image.qualityLabel].filter(Boolean).join(" | "), image.quality === "low_resolution" ? 0.35 : 0.65);
  }
  const reviews = extractBoundedReviews(product);
  for (const review of reviews.slice(0, 12)) addEvidence(evidence, "review", review.id.replace(/^review:/, ""), review.text, review.rating ? 0.75 : 0.55);
  const tiktok = extractTikTokSignals(product);
  for (const hashtag of tiktok?.hashtags ?? []) addEvidence(evidence, "hashtag", hashtag.replace(/^#/, ""), hashtag, 0.65);

  const base = {
    schemaVersion: "1.0" as const,
    captureId,
    platform: product.platform,
    sourceUrl: product.sourceUrl,
    capturedAt: new Date().toISOString(),
    pageTitle: cleanText(product.pageTitle, 500) || undefined,
    product: {
      title: cleanText(product.productName || product.pageTitle, TEXT_LIMITS.title) || undefined,
      price: cleanText(product.priceCurrentText, 128) || undefined,
      originalPrice: cleanText(product.priceOriginalText, 128) || undefined,
      discount: cleanText(product.discountText, 64) || undefined,
      commissionRatePercent: product.commissionRatePercent ?? null,
      rating: cleanText(product.ratingScoreText, 64) || undefined,
      soldCount: cleanText(product.soldCountText, 128) || undefined,
      description: cleanText(product.descriptionText, TEXT_LIMITS.description) || undefined,
      category: cleanText(product.categoryText, 300) || undefined,
      categoryPath: Array.isArray((product as any).categoryPath) ? (product as any).categoryPath.map((part: unknown) => cleanText(part, 120)).filter(Boolean).slice(0, 8) : undefined,
      variants: cleanText(product.variantsText, 1000) || undefined,
      stock: cleanText(product.stockText, 300) || undefined,
      selectedImageUrls: selectedUrls(product.imageCandidates),
      selectedImages: selectedImageMeta,
    },
    shop: {
      name: cleanText(product.shopName, 300) || undefined,
      location: cleanText(product.sellerLocationText, 300) || undefined,
      isMall: product.isMall,
    },
    reviews,
    tiktok,
    comments: [],
    evidence: evidence.slice(0, TEXT_LIMITS.evidence),
    sourceIds: {
      externalProductId: product.externalProductId,
      externalShopId: product.externalShopId,
      canonicalSourceUrl: product.canonicalSourceUrl,
    },
    sanitizerVersion: "2026-05-23",
  };
  return { ...base, payloadHash: await hashLocalAIInput(base) };
}

export function decideLocalAIProvider(input: {
  capability: LocalAICapability;
  settings: LocalAISettings;
  hasToken: boolean;
}): LocalAIProviderDecision {
  if (input.settings.preferLocalAI && input.capability.available) {
    return { provider: "chrome_prompt_api", state: "local_ai_ready" as LocalAIWorkflowState, canAnalyze: true, reason: "Local AI ready" };
  }
  if (input.settings.preferLocalAI && input.capability.availability === "downloadable") {
    return { provider: "chrome_prompt_api", state: "download_required", canAnalyze: true, reason: "Chrome needs to download the local AI model" };
  }
  if (input.settings.preferLocalAI && input.capability.availability === "downloading") {
    return { provider: "chrome_prompt_api", state: "downloading", canAnalyze: false, reason: "Local AI model is downloading" };
  }
  if (input.settings.enableServerFallback && input.hasToken) {
    return { provider: "server_ai", state: "fallback_ready", canAnalyze: true, reason: "Using SmartSpecPro AI fallback" };
  }
  return { provider: "noop", state: "raw_capture_only", canAnalyze: false, reason: "Capture remains available without AI analysis" };
}

export async function detectChromePromptAPI(): Promise<LocalAICapability> {
  const LanguageModel = (globalThis as any).LanguageModel;
  if (!LanguageModel) {
    return {
      provider: "chrome_prompt_api",
      apiExposed: false,
      available: false,
      availability: "unavailable",
      supportsText: false,
      reason: "LanguageModel API is not exposed in this Chrome runtime.",
    };
  }
  try {
    const availability = await LanguageModel.availability({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
    });
    return {
      provider: "chrome_prompt_api",
      apiExposed: true,
      available: availability === "available",
      availability,
      supportsText: availability !== "unavailable",
      supportedLanguages: ["en"],
      reason: availability === "available" ? undefined : `Prompt API status is ${availability}.`,
    };
  } catch (error) {
    return {
      provider: "chrome_prompt_api",
      apiExposed: true,
      available: false,
      availability: "unknown",
      supportsText: false,
      reason: error instanceof Error ? error.message : "Unknown Prompt API detection error.",
    };
  }
}

export function buildProductBriefPrompt(payload: SanitizedLocalAIInput, languagePreference: AnalysisLanguagePreference) {
  return [
    "You are analyzing a marketplace product page for SmartSpecPro.",
    "Task: Create a structured product marketing brief from the captured page data.",
    `Required output language: ${languagePreference === "auto" ? "match source language; prefer concise Thai when source is Thai" : languagePreference}.`,
    "Rules: use only the provided data; do not invent claims; return JSON only; include evidenceIds whenever possible.",
    "Return a ProductBrief JSON object with schemaVersion 1.0.",
    `Captured data:\n${JSON.stringify(payload, null, 2).slice(0, TEXT_LIMITS.promptPayload)}`,
  ].join("\n\n");
}

export function buildVideoBriefFromProduct(productBrief: ProductBrief, source: SanitizedLocalAIInput): VideoBrief {
  const hook = productBrief.suggestedHooks[0] || productBrief.shortSummary;
  return {
    schemaVersion: "1.0",
    sourceCaptureIds: source.captureId ? [source.captureId] : [],
    targetFormat: source.platform === "tiktok_shop" ? "tiktok_short" : "shopee_video",
    durationSec: 30,
    aspectRatio: "9:16",
    language: /[\u0E00-\u0E7F]/.test(productBrief.shortSummary) ? "th" : "mixed",
    title: `${productBrief.productName} brief`,
    hook: hook.slice(0, 300),
    scenes: [
      { order: 1, startSec: 0, endSec: 4, sceneGoal: "Stop scroll", visualSuggestion: "Show product hero image", onScreenText: hook.slice(0, 80), assetRole: "product_image" },
      { order: 2, startSec: 4, endSec: 18, sceneGoal: "Explain value", visualSuggestion: "Show product details and key benefits", onScreenText: (productBrief.keySellingPoints[0] || productBrief.shortSummary).slice(0, 80), assetRole: "product_image" },
      { order: 3, startSec: 18, endSec: 30, sceneGoal: "Convert", visualSuggestion: "Show trust signal and CTA", onScreenText: (productBrief.suggestedCTAs[0] || "ดูรายละเอียดสินค้า").slice(0, 80), assetRole: "text_only" },
    ],
    captions: productBrief.suggestedHooks.slice(0, 3),
    cta: productBrief.suggestedCTAs[0] || "ดูรายละเอียดสินค้า",
    assetsNeeded: ["product_image"],
    hyperframesHint: { visualStyle: "marketplace product clean", transitionStyle: "quick cuts", textOverlayStyle: "bold readable captions", pacing: "fast" },
    confidence: Math.min(productBrief.confidence, 0.8),
  };
}

export function buildStorytellingHandoff(productBrief: ProductBrief, videoBrief: VideoBrief, source: SanitizedLocalAIInput): MarketplaceStorytellingHandoff {
  const imageMeta = Array.isArray((source.product as any).selectedImages) ? (source.product as any).selectedImages as Array<{ url: string; role?: string; kind?: string; quality?: string }> : [];
  const fallbackImages: Array<{ url: string; role?: string; kind?: string; quality?: string }> = source.product.selectedImageUrls.map((url, index) => ({ url, role: index === 0 ? "hero" : "detail", kind: index === 0 ? "main" : "description", quality: "unknown" }));
  const selectedImages = (imageMeta.length > 0 ? imageMeta : fallbackImages)
    .map((image, index) => ({
      url: image.url,
      role: (image.role === "hero" || index === 0 ? "hero" : image.kind === "review" ? "review" : image.kind === "description" ? "detail" : "detail") as "hero" | "detail" | "review" | "proof" | "background",
      fidelity: (image.quality === "low_resolution" ? "mismatch_risk" : "likely_product") as "confirmed_product" | "likely_product" | "unknown" | "mismatch_risk",
    }));
  const claims = productBrief.keySellingPoints.slice(0, 8).map((text, index) => ({
    id: `claim:${index + 1}`,
    text,
    evidenceIds: productBrief.evidenceIds,
    status: productBrief.evidenceIds.length > 0 ? "supported" as const : "needs_review" as const,
    confidence: productBrief.confidence,
  }));
  const blockers = [
    ...(selectedImages.length === 0 ? ["missing_selected_product_image"] : []),
    ...(selectedImages.some((image) => image.fidelity === "mismatch_risk") ? ["low_resolution_or_mismatch_risk_image"] : []),
    ...(claims.some((claim) => claim.status === "needs_review") ? ["unsupported_claims_need_review"] : []),
  ];
  return {
    schemaVersion: "1.0",
    sourceCaptureIds: source.captureId ? [source.captureId] : [],
    insightIds: [],
    productName: productBrief.productName,
    sourceUrl: source.sourceUrl,
    platform: source.platform,
    storyFormat: source.platform === "tiktok_shop" ? "tiktok_shop_trend" : "sales_demo",
    readiness: blockers.length === 0 ? "ready_for_storytelling" : "needs_user_review",
    blockers,
    customerJourneyStages: ["awareness", "consideration", "proof_review_demo", "conversion_cta"],
    claims,
    selectedImages,
    videoBrief,
    evidenceIds: productBrief.evidenceIds,
    confidence: Math.min(productBrief.confidence, selectedImages.length > 0 ? 0.8 : 0.5),
  };
}

export function normalizeProductBrief(value: any, source: SanitizedLocalAIInput): ProductBrief {
  const evidenceIds = new Set(source.evidence.map((item) => item.id));
  const brief: ProductBrief = {
    schemaVersion: "1.0",
    source: { platform: source.platform, captureId: source.captureId, url: source.sourceUrl },
    productName: cleanText(value?.productName || source.product.title, 300) || "Untitled product",
    category: cleanText(value?.category || source.product.category, 200) || undefined,
    shortSummary: cleanText(value?.shortSummary, 800) || cleanText(source.product.description || source.product.title, 300),
    keySellingPoints: toStringList(value?.keySellingPoints, 12),
    targetAudiences: toStringList(value?.targetAudiences, 12),
    buyerPainPoints: toStringList(value?.buyerPainPoints, 12),
    buyerObjections: toStringList(value?.buyerObjections, 12),
    trustSignals: toStringList(value?.trustSignals, 12),
    contentAngles: toStringList(value?.contentAngles, 12),
    suggestedHooks: toStringList(value?.suggestedHooks, 12),
    suggestedCTAs: toStringList(value?.suggestedCTAs, 12),
    confidence: clamp01(value?.confidence ?? 0.55),
    evidenceIds: toStringList(value?.evidenceIds, 80).filter((id) => evidenceIds.has(id)),
  };
  if (brief.evidenceIds.length === 0 && source.evidence[0]) brief.evidenceIds = [source.evidence[0].id];
  return brief;
}

export function validateProductBrief(value: any, source: SanitizedLocalAIInput): ProductBrief {
  const evidenceIds = new Set(source.evidence.map((item) => item.id));
  const unknownKeys = Object.keys(value && typeof value === "object" ? value : {})
    .filter((key) => ![
      "schemaVersion",
      "source",
      "productName",
      "category",
      "shortSummary",
      "keySellingPoints",
      "targetAudiences",
      "buyerPainPoints",
      "buyerObjections",
      "trustSignals",
      "contentAngles",
      "suggestedHooks",
      "suggestedCTAs",
      "confidence",
      "evidenceIds",
    ].includes(key));
  if (unknownKeys.length > 0) throw new Error(`Unexpected ProductBrief fields: ${unknownKeys.join(", ")}`);
  if (!value || typeof value !== "object") throw new Error("ProductBrief must be an object");
  if (value.schemaVersion !== "1.0") throw new Error("ProductBrief schemaVersion must be 1.0");
  if (typeof value.productName !== "string" || !value.productName.trim()) throw new Error("ProductBrief productName is required");
  if (typeof value.shortSummary !== "string") throw new Error("ProductBrief shortSummary is required");
  if (typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1) throw new Error("ProductBrief confidence must be between 0 and 1");
  for (const field of ["keySellingPoints", "targetAudiences", "buyerPainPoints", "buyerObjections", "trustSignals", "contentAngles", "suggestedHooks", "suggestedCTAs", "evidenceIds"]) {
    if (!Array.isArray(value[field])) throw new Error(`ProductBrief ${field} must be an array`);
  }
  const rawEvidenceIds = value.evidenceIds.map((item: unknown) => cleanText(item, 120)).filter(Boolean);
  const invalidEvidence = rawEvidenceIds.filter((id: string) => !evidenceIds.has(id));
  if (invalidEvidence.length > 0) throw new Error(`ProductBrief evidenceIds not found: ${invalidEvidence.join(", ")}`);
  const normalized = normalizeProductBrief(value, source);
  return normalized;
}

function toStringList(value: unknown, max: number) {
  return (Array.isArray(value) ? value : []).map((item) => cleanText(item, 220)).filter(Boolean).slice(0, max);
}

function clamp01(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

export async function createPromptAPISession(onProgress?: (progress: number) => void, signal?: AbortSignal) {
  const LanguageModel = (globalThis as any).LanguageModel;
  if (!LanguageModel) throw new Error("LanguageModel API is not available.");
  return LanguageModel.create({
    signal,
    monitor(m: EventTarget) {
      m.addEventListener("downloadprogress", (event: Event) => {
        const progressEvent = event as unknown as { loaded?: number };
        onProgress?.(typeof progressEvent.loaded === "number" ? progressEvent.loaded : 0);
      });
    },
  });
}

export async function generateProductBriefWithPromptAPI(input: {
  source: SanitizedLocalAIInput;
  languagePreference: AnalysisLanguagePreference;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}): Promise<StructuredGenerationResult<ProductBrief>> {
  try {
    const session = await createPromptAPISession(input.onProgress, input.signal);
    const rawText = await session.prompt(buildProductBriefPrompt(input.source, input.languagePreference), {
      responseConstraint: {
        type: "object",
        properties: {
          schemaVersion: { type: "string" },
          productName: { type: "string" },
          shortSummary: { type: "string" },
          keySellingPoints: { type: "array", items: { type: "string" } },
          targetAudiences: { type: "array", items: { type: "string" } },
          buyerPainPoints: { type: "array", items: { type: "string" } },
          buyerObjections: { type: "array", items: { type: "string" } },
          trustSignals: { type: "array", items: { type: "string" } },
          contentAngles: { type: "array", items: { type: "string" } },
          suggestedHooks: { type: "array", items: { type: "string" } },
          suggestedCTAs: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
      },
    });
    const parsed = JSON.parse(String(rawText));
    return { ok: true, provider: "chrome_prompt_api", data: validateProductBrief(parsed, input.source), rawText: String(rawText) };
  } catch (error) {
    return {
      ok: false,
      provider: "chrome_prompt_api",
      error: { code: "PROMPT_API_ERROR", message: error instanceof Error ? error.message : "Unknown Prompt API error", recoverable: true },
    };
  }
}

export function createDeterministicProductBrief(source: SanitizedLocalAIInput): ProductBrief {
  const sellingPoints = [
    source.product.price ? `ราคา ${source.product.price}` : "",
    source.product.soldCount ? `มีสัญญาณยอดขาย ${source.product.soldCount}` : "",
    source.product.rating ? `มี rating ${source.product.rating}` : "",
    source.shop?.name ? `ร้าน ${source.shop.name}` : "",
  ].filter(Boolean);
  return normalizeProductBrief({
    productName: source.product.title || source.pageTitle || "Untitled product",
    shortSummary: source.product.description || source.product.title || "Marketplace product captured for SmartSpecPro.",
    keySellingPoints: sellingPoints,
    targetAudiences: ["ผู้ซื้อที่กำลังเปรียบเทียบสินค้าใน marketplace"],
    buyerPainPoints: ["ต้องการเห็นจุดเด่น ราคา และความน่าเชื่อถืออย่างรวดเร็ว"],
    buyerObjections: ["ยังต้องตรวจสอบ claims และภาพสินค้าก่อนใช้ในงานโฆษณา"],
    trustSignals: [source.product.rating, source.product.soldCount, source.shop?.name].filter(Boolean),
    contentAngles: ["สรุปจุดเด่นจากหน้าสินค้า", "ทำคลิปสั้นแบบ product demo"],
    suggestedHooks: [`ทำไม ${source.product.title || "สินค้านี้"} ถึงน่าสนใจ`],
    suggestedCTAs: ["ดูรายละเอียดสินค้า"],
    confidence: 0.55,
    evidenceIds: source.evidence.map((item) => item.id).slice(0, 12),
  }, source);
}

export async function generateProductBriefWithServerAI(input: {
  serverBaseUrl: string;
  token: string;
  extensionVersion: string;
  source: SanitizedLocalAIInput;
  languagePreference: AnalysisLanguagePreference;
}): Promise<StructuredGenerationResult<ProductBrief>> {
  try {
    const response = await fetch(`${input.serverBaseUrl}/api/marketplace-captures/insights/server-generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.token}`,
      },
      body: JSON.stringify({
        extensionVersion: input.extensionVersion,
        insightType: "product_brief",
        languagePreference: input.languagePreference,
        source: input.source,
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const json = await response.json() as ServerProductBriefGenerationResponse;
    if (!json.ok || !json.payload) {
      throw new Error(json.error?.message || "Server AI fallback did not return a ProductBrief");
    }
    return { ok: true, provider: "server_ai", data: validateProductBrief(json.payload, input.source) };
  } catch (error) {
    return {
      ok: false,
      provider: "server_ai",
      error: {
        code: "SERVER_AI_ERROR",
        message: error instanceof Error ? error.message : "Unknown server AI error",
        recoverable: true,
      },
    };
  }
}

export function buildInsightSyncRequest(input: {
  extensionVersion: string;
  insightType: LocalInsightType;
  provider: LocalAIProviderId;
  source: SanitizedLocalAIInput;
  payload: unknown;
  rawCapture?: ProductCapturePayload;
  settings: LocalAISettings;
}) {
  const generationRunId = `${input.insightType}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  const selectedImageQuality = (input.source.product.selectedImages ?? []).map((image) => ({
    evidenceId: typeof image.id === "string" ? image.id : undefined,
    url: String(image.url ?? ""),
    role: typeof image.role === "string" ? image.role : undefined,
    kind: typeof image.kind === "string" ? image.kind : undefined,
    quality: typeof image.quality === "string" ? image.quality : undefined,
    qualityLabel: typeof image.qualityLabel === "string" ? image.qualityLabel : undefined,
    width: typeof image.width === "number" ? image.width : undefined,
    height: typeof image.height === "number" ? image.height : undefined,
    warning: typeof image.warning === "string" ? image.warning : undefined,
  })).filter((image) => image.url).slice(0, 30);
  const dataQualityWarnings = Array.isArray((input.rawCapture as any)?.dataQualityWarnings)
    ? (input.rawCapture as any).dataQualityWarnings.map((item: unknown) => String(item ?? "").trim()).filter(Boolean).slice(0, 50)
    : [];
  const sourceIds = {
    externalProductId: input.rawCapture?.externalProductId ?? input.source.sourceIds?.externalProductId,
    externalShopId: input.rawCapture?.externalShopId ?? input.source.sourceIds?.externalShopId,
    canonicalSourceUrl: input.rawCapture?.canonicalSourceUrl ?? input.source.sourceIds?.canonicalSourceUrl,
  };
  return {
    extensionVersion: input.extensionVersion,
    idempotencyKey: `${input.source.platform}:${input.source.payloadHash}:${input.insightType}:${input.provider}`,
    schemaVersion: "1.0",
    insightCreatedAt: new Date().toISOString(),
    payloadHash: input.source.payloadHash,
    source: {
      platform: input.source.platform,
      url: input.source.sourceUrl,
      capturedAt: input.source.capturedAt,
      captureId: input.source.captureId,
    },
    insightType: input.insightType,
    provider: input.provider,
    metadata: {
      providerDecision: input.provider,
      sanitizerVersion: input.source.sanitizerVersion ?? "2026-05-23",
      generationRunId,
      inputEvidenceIds: input.source.evidence.map((item) => item.id),
      sourceIds,
      selectedImageQuality,
      dataQualityWarnings,
    },
    payload: input.payload,
    rawCaptureIncluded: false,
    rawCapture: undefined,
  };
}
