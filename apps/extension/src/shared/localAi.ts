import type { ImageCandidate, MarketplacePlatform, ProductCapturePayload } from "./types";

export type PromptAPIAvailability = "available" | "downloadable" | "downloading" | "unavailable" | "unknown";
export type LocalAIProviderId = "chrome_prompt_api" | "ollama" | "lm_studio" | "localai" | "llama_cpp" | "custom_http" | "native_messaging" | "server_ai" | "noop" | "manual";
export type LocalAIProviderMode = "auto" | "chrome_prompt_api" | "ollama" | "lm_studio" | "localai" | "llama_cpp" | "custom_http" | "native_messaging";
export type LocalVisionImageTransport = "base64" | "url";
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
  autoGenerateInsights: boolean;
  preferLocalAI: boolean;
  localProviderMode: LocalAIProviderMode;
  localEndpointUrl: string;
  localModel: string;
  nativeHostName: string;
  localVisionEnabled: boolean;
  localVisionImageLimit: number;
  localVisionImageTransport: LocalVisionImageTransport;
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

export interface StoryOptionVideoShot {
  order: number;
  startSec: number;
  endSec: number;
  title: string;
  videoPrompt: string;
  subShots: string[];
  thaiVoiceover: string;
}

export interface StoryOptionVideoBrief {
  schemaVersion: "1.0";
  durationSec: 30;
  aspectRatio: "9:16";
  language: "th";
  structureLabel: "30 วินาที | 3 Shot | Shot ละ 10 วินาที";
  noOnScreenText: true;
  shots: StoryOptionVideoShot[];
}

export type UserStoryInsightCategory =
  | "audience_pain_problem"
  | "selling_points"
  | "hooks"
  | "objections_trust"
  | "example_use_case";

export interface UserStoryInsightAddition {
  category: UserStoryInsightCategory;
  values: string[];
  rawText: string;
  source: "user_confirmed";
  confirmedAt: string;
  confidence: number;
}

export interface UserStoryInsightDraft {
  schemaVersion: "1.0";
  rawText: string;
  summary: string;
  targetOptionId: string;
  targetOptionTitle: string;
  additions: Array<{
    category: UserStoryInsightCategory;
    label: string;
    values: string[];
    confidence: number;
  }>;
  confidence: number;
  needsUserConfirmation: true;
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
  storyOptions: Array<{
    id: string;
    title: string;
    audience: string;
    customerNeed: string;
    problemToSolve: string;
    useCase: string;
    angle: string;
    storyFormat: MarketplaceStorytellingHandoff["storyFormat"];
    journeyStages: MarketplaceStorytellingHandoff["customerJourneyStages"];
    hook: string;
    storyboardOutline: string[];
    primaryClaimIds: string[];
    evidenceIds: string[];
    confidence: number;
    autoSelected: boolean;
    decisionReason?: string;
    source?: "ai_detected" | "user_confirmed" | "mixed";
    userAdditions?: UserStoryInsightAddition[];
    videoBrief?: StoryOptionVideoBrief;
  }>;
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
  autoGenerateInsights: true,
  preferLocalAI: true,
  localProviderMode: "auto",
  localEndpointUrl: "http://localhost:11434/api/chat",
  localModel: "llama3.1",
  nativeHostName: "",
  localVisionEnabled: false,
  localVisionImageLimit: 3,
  localVisionImageTransport: "base64",
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
  return Array.from(new Set(images.filter((image) => image.selected !== false && image.kind !== "related").map((image) => image.url))).slice(0, 30);
}

function selectedImageEvidence(images: ImageCandidate[]) {
  return Array.from(new Map(images
    .filter((image) => image.selected !== false && image.kind !== "related")
    .map((image) => [image.url, image])).values())
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

async function stableSanitizedInputHash(value: Record<string, unknown>): Promise<string> {
  const stable = {
    ...value,
    captureId: undefined,
    capturedAt: undefined,
  };
  return hashLocalAIInput(stable);
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
  return { ...base, payloadHash: await stableSanitizedInputHash(base) };
}

export function decideLocalAIProvider(input: {
  capability: LocalAICapability;
  settings: LocalAISettings;
  hasToken: boolean;
}): LocalAIProviderDecision {
  if (input.settings.preferLocalAI && input.settings.localProviderMode !== "auto" && input.settings.localProviderMode !== "chrome_prompt_api") {
    const mode = input.settings.localProviderMode;
    const ready = mode === "native_messaging"
      ? Boolean(input.settings.nativeHostName.trim())
      : Boolean(input.settings.localEndpointUrl.trim());
    return {
      provider: mode,
      state: ready ? "local_ai_ready" : "raw_capture_only",
      canAnalyze: ready,
      reason: ready ? `Using configured local AI provider: ${mode}` : "Configured local AI provider is missing endpoint/host config",
    };
  }
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
    "Price rule: if you mention price, use only Captured data.product.price exactly. Do not infer price from description text, SKU codes, promotion text, or unrelated numbers.",
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
  const selectedImages = Array.from(new Map((imageMeta.length > 0 ? imageMeta : fallbackImages)
    .filter((image) => image.url)
    .map((image) => [image.url, image])).values())
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
  const storyOptions = buildStoryOptions(productBrief, videoBrief, claims);
  const storyQuality = storyOptionsQuality(storyOptions);
  const blockers = [
    ...(selectedImages.length === 0 ? ["missing_selected_product_image"] : []),
    ...(selectedImages.some((image) => image.fidelity === "mismatch_risk") ? ["low_resolution_or_mismatch_risk_image"] : []),
    ...(claims.some((claim) => claim.status === "needs_review") ? ["unsupported_claims_need_review"] : []),
    ...(storyQuality.ok ? [] : ["story_options_need_more_specific_input"]),
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
    storyOptions,
    claims,
    selectedImages,
    evidenceIds: productBrief.evidenceIds,
    confidence: Math.min(productBrief.confidence, selectedImages.length > 0 && storyQuality.ok ? 0.8 : 0.5),
  };
}

function includesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function distinctList(values: string[], limit = 8) {
  return Array.from(new Set(values.map((value) => cleanText(value, 240)).filter(Boolean))).slice(0, limit);
}

function tokenSet(value: string) {
  return new Set(cleanText(value, 1200).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 3));
}

function jaccardSimilarity(left: string, right: string) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / Math.max(1, new Set([...a, ...b]).size);
}

function storyOptionComparisonText(option: MarketplaceStorytellingHandoff["storyOptions"][number]) {
  return [
    option.title,
    option.audience,
    option.customerNeed,
    option.problemToSolve,
    option.useCase,
    option.angle,
    option.hook,
    ...option.storyboardOutline,
  ].join(" ");
}

function storyOptionsQuality(options: MarketplaceStorytellingHandoff["storyOptions"]) {
  if (options.length < 4) return { ok: false, reason: "too_few_options" };
  const optionTexts = options.map(storyOptionComparisonText);
  if (optionTexts.some((text) => tokenSet(text).size < 12)) return { ok: false, reason: "thin_outline" };
  const weakOutlineCount = options.filter((option) => option.storyboardOutline.length < 2).length;
  if (weakOutlineCount > 0) return { ok: false, reason: "thin_outline" };
  const weakVideoBriefCount = options.filter((option) =>
    !option.videoBrief
    || option.videoBrief.shots.length !== 3
    || option.videoBrief.shots.some((shot) => shot.subShots.length !== 3 || !shot.thaiVoiceover.includes("พูดเป็นภาษาไทยว่า"))
  ).length;
  if (weakVideoBriefCount > 0) return { ok: false, reason: "missing_option_video_brief" };
  const genericPattern = /ต้องการเห็น(ประโยชน์|จุดเด่น)|ใช้เมื่อลูกค้าต้องการแก้ปัญหาหลัก/i;
  const genericCount = optionTexts.filter((text) => genericPattern.test(text)).length;
  let highSimilarityPairs = 0;
  for (let i = 0; i < optionTexts.length; i += 1) {
    for (let j = i + 1; j < optionTexts.length; j += 1) {
      if (jaccardSimilarity(optionTexts[i], optionTexts[j]) >= 0.58) highSimilarityPairs += 1;
    }
  }
  return {
    ok: highSimilarityPairs <= 1 && genericCount <= 1,
    reason: highSimilarityPairs > 1 ? "duplicate_options" : genericCount > 1 ? "too_generic" : "ok",
  };
}

function inferStoryOptionDetails(productBrief: ProductBrief) {
  const text = [
    productBrief.productName,
    productBrief.shortSummary,
    ...productBrief.keySellingPoints,
    ...productBrief.buyerPainPoints,
    ...productBrief.buyerObjections,
    ...productBrief.trustSignals,
    ...productBrief.contentAngles,
  ].join(" ");
  const isBasket = includesAny(text, [/ตะกร้า|basket|laundry basket|เก็บของ|storage|container/i]);
  const isApparel = includesAny(text, [/เสื้อ|กางเกง|ชุด|แฟชั่น|สวมใส่|ใส่สบาย|ผ้า|รองเท้า|apparel|fashion|pants|shirt|dress|shoe/i]);
  const isBeauty = includesAny(text, [/ครีม|เซรั่ม|สกินแคร์|ผิว|สิว|กันแดด|เครื่องสำอาง|beauty|skincare|serum|cream|makeup|sunscreen/i]);
  const isElectronics = includesAny(text, [/ไฟฟ้า|เครื่อง|แบต|ชาร์จ|ไร้สาย|usb|power|electric|wireless|charger|battery|device/i]);
  const isFoodSupplement = includesAny(text, [/อาหาร|ขนม|เครื่องดื่ม|วิตามิน|เสริม|สมุนไพร|สุขภาพ|food|snack|drink|supplement|vitamin/i]);
  const isFitness = includesAny(text, [/ออกกำลังกาย|ฟิตเนส|บริหาร|กล้ามเนื้อ|stepper|ลู่วิ่ง|จักรยาน|fitness|exercise|workout|gym/i]);
  const isHomeDecor = includesAny(text, [/วอลเปเปอร์|แผ่นปู|แต่งห้อง|ตกแต่ง|บ้าน|ห้องน้ำ|ห้องนอน|kitchen|home|decor|wallpaper|mat|tile/i]);
  const hasFold = includesAny(text, [/พับ|fold|ประหยัดพื้นที่|พื้นที่จำกัด|คอนโด|หอพัก/i]);
  const hasWheel = includesAny(text, [/ล้อ|ลาก|เข็น|เคลื่อนย้าย|wheel|caster/i]);
  const hasVent = includesAny(text, [/ระบาย|อากาศ|โปร่ง|อับ|กลิ่น|vent/i]);
  const hasPP = includesAny(text, [/polypropylene|\bPP\b|พลาสติก|วัสดุ/i]);
  const hasSize = includesAny(text, [/\b(M|L|XL|2808)\b|หลายขนาด|ขนาด|size/i]);
  const hasNeutralColor = includesAny(text, [/ขาว|ครีม|มินิมอล|white|cream|minimal/i]);
  const hasSocialProof = productBrief.trustSignals.some((item) => /rating|รีวิว|ขายแล้ว|sold|คะแนน|\d/i.test(item))
    || includesAny(text, [/rating|รีวิว|ขายแล้ว|sold|คะแนน/i]);

  const problemSolutions = distinctList([
    isBasket ? "ปัญหา: บ้าน/ห้องน้ำ/ห้องซักผ้ารก เสื้อผ้าและของใช้กระจัดกระจาย → ทางออก: ใช้ตะกร้าเก็บของอเนกประสงค์รวมของให้เป็นที่เดียว ดูเป็นระเบียบขึ้น" : "",
    hasFold ? "ปัญหา: พื้นที่จำกัด วางตะกร้าถาวรแล้วเกะกะ → ทางออก: ตะกร้าพับเก็บได้ ประหยัดพื้นที่เมื่อไม่ใช้งาน" : "",
    hasWheel ? "ปัญหา: ยกตะกร้าผ้าหนักหรือย้ายของลำบาก → ทางออก: มีล้อ ช่วยลากไปซักผ้าหรือย้ายของในบ้านได้สะดวกขึ้น" : "",
    hasVent ? "ปัญหา: ตะกร้าทึบ อับชื้น มีกลิ่น → ทางออก: ดีไซน์ระบายอากาศได้ดี เหมาะกับเสื้อผ้า ผ้าขนหนู และของใช้ทั่วไป" : "",
    isApparel ? "ปัญหา: กลัวใส่แล้วไม่พอดีหรือไม่เข้ากับรูปร่าง → ทางออก: สื่อขนาด ทรง และภาพใส่จริงให้เห็นก่อนตัดสินใจ" : "",
    isBeauty ? "ปัญหา: ไม่แน่ใจว่าสูตรเหมาะกับสภาพผิวหรือปัญหาผิวของตัวเองไหม → ทางออก: แยกสรรพคุณ วิธีใช้ และข้อควรระวังตามข้อมูลหน้าสินค้าอย่างชัดเจน" : "",
    isElectronics ? "ปัญหา: กลัวใช้งานยากหรือสเปกไม่ตรงความต้องการ → ทางออก: เดโมขั้นตอนใช้งานจริง พร้อมชี้สเปกสำคัญที่ตรวจจากหน้าสินค้าได้" : "",
    isFoodSupplement ? "ปัญหา: ไม่แน่ใจเรื่องรสชาติ ส่วนผสม หรือความเหมาะสมกับผู้ใช้ → ทางออก: สรุปส่วนผสม วิธีรับประทาน/ใช้งาน และคำเตือนว่าให้ตรวจฉลากก่อนซื้อ" : "",
    isFitness ? "ปัญหา: อยากออกกำลังกายที่บ้านแต่พื้นที่จำกัดหรือไม่รู้จะเริ่มอย่างไร → ทางออก: โชว์ท่าใช้งานง่าย ระดับแรง และพื้นที่ที่ต้องใช้จริง" : "",
    isHomeDecor ? "ปัญหา: อยากให้บ้าน/ห้องดูดีขึ้นแต่กลัวติดตั้งยากหรือไม่เข้ากับพื้นที่ → ทางออก: โชว์ before/after วิธีติดตั้ง และมุมใช้งานจริง" : "",
    ...productBrief.buyerPainPoints.map((pain, index) => `ปัญหา: ${pain} → ทางออก: ${productBrief.keySellingPoints[index] || productBrief.keySellingPoints[0] || productBrief.shortSummary}`),
  ], 8);

  const objectionsTrust = distinctList([
    hasPP ? "ข้อกังวล: ไม่แน่ใจว่าสินค้าแข็งแรงไหม → ความมั่นใจ: วัสดุ Polypropylene/PP หรือพลาสติกสำหรับของใช้ในบ้าน ช่วยสื่อความทนทานได้" : "",
    hasSize ? "ข้อกังวล: กลัวเลือกขนาดผิด → ความมั่นใจ: มีหลายขนาดให้เลือก ควรเพิ่มตารางเทียบขนาดและคำแนะนำว่าแต่ละขนาดเหมาะกับใคร" : "",
    hasNeutralColor ? "ข้อกังวล: สีจะเข้ากับบ้านไหม → ความมั่นใจ: โทนขาว/ครีม/มินิมอล เข้ากับห้องน้ำ ห้องซักผ้า หอพัก และคอนโดได้ง่าย" : "",
    hasSocialProof ? `ข้อกังวล: ซื้อแล้วใช้งานจริงดีไหม → ความมั่นใจ: ใช้คะแนน/รีวิว/ยอดขายจากหน้าสินค้าเป็น proof เช่น ${productBrief.trustSignals[0] || "rating และรีวิว"}` : "",
    isApparel ? "ข้อกังวล: กลัวไซซ์หรือทรงไม่ตรงใจ → ความมั่นใจ: แนะนำให้โชว์ตารางไซซ์ ภาพใส่จริง และวิธีวัดก่อนซื้อ" : "",
    isBeauty ? "ข้อกังวล: กลัวแพ้หรือคาดหวังผลเกินจริง → ความมั่นใจ: ใช้คำอธิบายตามฉลาก/หน้าสินค้า และหลีกเลี่ยง claim รักษาโรคหรือผลลัพธ์เกินหลักฐาน" : "",
    isElectronics ? "ข้อกังวล: กลัวเสียเร็ว ใช้กับอุปกรณ์ตัวเองไม่ได้ หรือไม่มีประกัน → ความมั่นใจ: ชี้สเปก ความเข้ากันได้ รีวิว และเงื่อนไขร้าน/ประกันที่พบ" : "",
    isFoodSupplement ? "ข้อกังวล: กลัวส่วนผสมไม่เหมาะกับเด็ก ผู้สูงอายุ หรือคนมีโรคประจำตัว → ความมั่นใจ: แนะนำให้ตรวจฉลาก ข้อห้าม และหลีกเลี่ยงคำตอบเชิงการแพทย์เกินหลักฐาน" : "",
    isFitness ? "ข้อกังวล: กลัวรับน้ำหนักไม่ไหวหรือใช้แล้วไม่ปลอดภัย → ความมั่นใจ: ชี้น้ำหนักรองรับ วัสดุ พื้นกันลื่น และรีวิวการใช้งานจริง" : "",
    isHomeDecor ? "ข้อกังวล: กลัวสี/ขนาดไม่ตรงพื้นที่หรือติดตั้งแล้วไม่สวย → ความมั่นใจ: ให้เทียบขนาดจริง สีจริง และภาพก่อนหลังจากหน้าสินค้า/รีวิว" : "",
    ...productBrief.buyerObjections.map((objection, index) => `ข้อกังวล: ${objection} → ความมั่นใจ: ${productBrief.trustSignals[index] || productBrief.trustSignals[0] || "ใช้หลักฐานจากหน้าสินค้าและภาพจริงช่วยยืนยัน"}`),
  ], 8);

  const demoSteps = distinctList([
    hasFold ? "กางสินค้าออกมาใช้งาน แล้วพับเก็บให้เห็นว่าบางและประหยัดพื้นที่" : "",
    isBasket ? "ใส่เสื้อผ้า ผ้าขนหนู ของเล่น หรือของใช้ในบ้านให้เห็นการเก็บของเป็นหมวดหมู่" : "",
    hasWheel ? "ลากด้วยล้อให้เห็นว่าเคลื่อนย้ายง่าย ไม่ต้องยกหนัก" : "",
    hasVent ? "ซูมดีไซน์ช่องระบายอากาศเพื่อลดความอับ" : "",
    hasNeutralColor ? "วางเทียบในห้องน้ำ ห้องซักผ้า หรือข้างตู้ให้เห็นว่าเข้ากับบ้านง่าย" : "",
    isApparel ? "โชว์ภาพใส่จริงด้านหน้า/ด้านข้าง พร้อมซูมเนื้อผ้า ทรง และรายละเอียดตะเข็บ" : "",
    isBeauty ? "โชว์ texture วิธีใช้ ปริมาณที่ใช้ และผลลัพธ์ที่อ้างได้จากหน้าสินค้าเท่านั้น" : "",
    isElectronics ? "เปิดเครื่อง/เชื่อมต่อ/ใช้งานจริง 1 รอบ แล้วซูมปุ่ม พอร์ต หรือหน้าจอที่สำคัญ" : "",
    isFoodSupplement ? "โชว์แพ็กเกจ ฉลาก ส่วนผสม วิธีชง/กิน/ใช้ และขนาดบรรจุให้เห็นชัด" : "",
    isFitness ? "โชว์ท่าเริ่มต้น ท่าใช้งานจริง การพับ/เก็บ และพื้นที่ที่ต้องใช้" : "",
    isHomeDecor ? "โชว์ก่อนใช้ ระหว่างติดตั้ง/จัดวาง และภาพหลังใช้ในห้องจริง" : "",
    ...productBrief.keySellingPoints.slice(0, 5).map((point) => `โชว์ประโยชน์หลัก: ${point}`),
  ], 8);

  const useCases = distinctList([
    isBasket ? "ห้องน้ำ: ใช้ใส่ผ้าใช้แล้วหรือผ้าขนหนู รอซักได้เป็นระเบียบ" : "",
    isBasket || hasWheel ? "ห้องซักผ้า: ลากตะกร้าไปหน้าเครื่องซักผ้าได้สะดวก ไม่ต้องยกหนัก" : "",
    isBasket ? "ห้องนอน: ใช้เก็บเสื้อผ้า ผ้าห่ม หรือของใช้ส่วนตัว" : "",
    hasFold ? "หอพัก/คอนโด: เหมาะกับพื้นที่เล็ก เพราะพับเก็บได้เมื่อไม่ใช้งาน" : "",
    isBasket ? "บ้านที่มีเด็ก: ใช้เก็บของเล่น ตุ๊กตา หรือของใช้เด็กให้เป็นที่" : "",
    isBasket ? "มุมเก็บของในบ้าน: ใช้แยกหมวดหมู่ของ เช่น ผ้าสะอาด ผ้ารอซัก หรือของใช้เบ็ดเตล็ด" : "",
    isApparel ? "ใส่ไปทำงาน/เรียน/เที่ยว: เลือกเล่า occasion ที่ตรงกับทรง สี และเนื้อผ้าที่เห็นในสินค้า" : "",
    isBeauty ? "รูทีนเช้า/ก่อนนอน/ก่อนแต่งหน้า: เลือกใช้ตามวิธีใช้ที่หน้าสินค้าระบุ" : "",
    isElectronics ? "โต๊ะทำงาน รถ บ้าน หรือเดินทาง: เลือกบริบทที่ตรงกับสเปกและขนาดสินค้า" : "",
    isFoodSupplement ? "ใช้ในมื้อเช้า หลังออกกำลังกาย หรือเป็นของฝาก: ต้องอิงฉลากและคำเตือนของสินค้า" : "",
    isFitness ? "บ้าน/คอนโด/มุมออกกำลังกายเล็ก ๆ: เหมาะกับคนที่อยากขยับร่างกายโดยไม่ใช้อุปกรณ์ใหญ่" : "",
    isHomeDecor ? "ห้องน้ำ ห้องครัว ห้องนอน หรือคอนโด: ใช้สื่อ before/after และการจับคู่สี/ขนาดกับพื้นที่จริง" : "",
    ...productBrief.contentAngles.slice(0, 5),
  ], 8);

  let positioning = productBrief.contentAngles[0] || productBrief.shortSummary;
  if (isBasket) positioning = "ตะกร้าเก็บของมินิมอลสำหรับบ้านพื้นที่จำกัด ช่วยให้บ้านเป็นระเบียบ เคลื่อนย้ายง่าย และพับเก็บได้เมื่อไม่ใช้งาน";
  else if (isApparel) positioning = "สินค้าแฟชั่นที่ควรเล่าด้วย fit, occasion, comfort และภาพใส่จริงเพื่อช่วยให้ลูกค้าตัดสินใจเรื่องไซซ์และสไตล์";
  else if (isBeauty) positioning = "สินค้าบิวตี้/สกินแคร์ที่ควรเล่าด้วยปัญหาผิว วิธีใช้ ส่วนผสม และ trust signal โดยไม่กล่าวอ้างเกินหลักฐาน";
  else if (isElectronics) positioning = "สินค้าอุปกรณ์ไฟฟ้า/อิเล็กทรอนิกส์ที่ควรเล่าด้วยเดโมใช้งานจริง สเปกสำคัญ ความเข้ากันได้ และความคุ้มค่า";
  else if (isFoodSupplement) positioning = "สินค้าอาหาร/อาหารเสริมที่ควรเล่าด้วยส่วนผสม วิธีใช้ รสชาติ และข้อควรระวังตามฉลาก";
  else if (isFitness) positioning = "สินค้าออกกำลังกายที่ควรเล่าด้วยสถานการณ์ใช้งานจริง ความปลอดภัย พื้นที่ใช้ และผลลัพธ์ที่ไม่เกินหลักฐาน";
  else if (isHomeDecor) positioning = "สินค้าบ้านและตกแต่งที่ควรเล่าด้วย before/after วิธีติดตั้ง ขนาดจริง และความเข้ากับพื้นที่";

  return { problemSolutions, objectionsTrust, demoSteps, useCases, positioning };
}

function buildVideoPrompt(setting: string) {
  return [
    "Vertical video 9:16, realistic product lifestyle video, soft natural light, clean composition, no text on screen, no subtitles.",
    setting,
    "Use natural hand movement, practical product demo, and marketplace-safe visuals. Keep product identity faithful to selected product images.",
  ].join(" ");
}

function voiceover(text: string) {
  const line = cleanText(text, 260).replace(/^พูดเป็นภาษาไทยว่า\s*/i, "");
  return `พูดเป็นภาษาไทยว่า “${line.replace(/[“”"]/g, "")}”`;
}

function buildStoryOptionVideoBrief(
  option: Omit<MarketplaceStorytellingHandoff["storyOptions"][number], "videoBrief">,
  productBrief: ProductBrief,
): StoryOptionVideoBrief {
  const productName = productBrief.productName || "สินค้านี้";
  const outline = option.storyboardOutline.length ? option.storyboardOutline : [option.problemToSolve, option.angle, option.useCase];
  const first = outline[0] || option.problemToSolve;
  const second = outline[1] || option.angle;
  const third = outline[2] || option.useCase;
  const cta = productBrief.suggestedCTAs[0] || "ดูรายละเอียดสินค้า";
  const shotsByType: Record<string, StoryOptionVideoShot[]> = {
    "story_option:problem_solution": [
      {
        order: 1,
        startSec: 0,
        endSec: 10,
        title: "เปิดด้วยปัญหาที่ลูกค้ากำลังเจอ",
        videoPrompt: buildVideoPrompt("Show the customer's everyday problem in a real home or lifestyle context before the product appears."),
        subShots: [
          `เห็นสถานการณ์ปัญหา: ${first}`,
          "ลูกค้าหยุดมองหรือแสดงสีหน้ากังวลกับปัญหานั้น",
          "Close-up รายละเอียดของปัญหาให้รู้สึกว่าเป็นเรื่องที่พบได้จริง",
        ],
        thaiVoiceover: voiceover(`${first} ถ้าเจอแบบนี้ ${productName} อาจช่วยแก้ปัญหาให้เป็นเรื่องง่ายขึ้น`),
      },
      {
        order: 2,
        startSec: 10,
        endSec: 20,
        title: "โชว์สินค้าเป็นทางออก",
        videoPrompt: buildVideoPrompt("Realistic product demo, hands introduce the product naturally, no text overlays."),
        subShots: [
          `หยิบหรือวาง ${productName} เข้ามาในเฟรมให้เห็นชัด`,
          `โชว์วิธีใช้หรือจุดเด่นหลัก: ${second}`,
          "เชื่อมปัญหากับการใช้งานสินค้าให้เห็นทางออกในภาพ",
        ],
        thaiVoiceover: voiceover(`จุดเด่นของ ${productName} คือ ${second} ช่วยเปลี่ยนปัญหาเดิมให้จัดการได้ง่ายขึ้น`),
      },
      {
        order: 3,
        startSec: 20,
        endSec: 30,
        title: "ผลลัพธ์หลังใช้และ CTA",
        videoPrompt: buildVideoPrompt("Show the after state, clean and satisfying result, realistic product placement, no text overlays."),
        subShots: [
          "โชว์สภาพหลังใช้ที่ดูดีขึ้นหรือเป็นระเบียบขึ้น",
          `ซูมสินค้าและบริบทการใช้งานจริง: ${option.useCase}`,
          `ปิดด้วยภาพสินค้าและจังหวะชวน ${cta}`,
        ],
        thaiVoiceover: voiceover(`ใช้ในสถานการณ์แบบนี้ได้จริง ${option.useCase} สนใจดูรายละเอียดสินค้าเพิ่มเติมได้เลย`),
      },
    ],
    "story_option:objection_trust": [
      {
        order: 1,
        startSec: 0,
        endSec: 10,
        title: "ลูกค้าลังเลก่อนซื้อ",
        videoPrompt: buildVideoPrompt("Realistic online shopping scene, customer compares product details on phone, no text overlays."),
        subShots: [
          "คนถือมือถือดูหน้าสินค้าหรือดูรูปสินค้าอย่างลังเล",
          `มองบริบทที่ทำให้เกิดความกังวล: ${option.problemToSolve}`,
          "Close-up การเลื่อนดูรายละเอียดสินค้า รีวิว หรือรูปสินค้า",
        ],
        thaiVoiceover: voiceover(`ก่อนซื้อ หลายคนอาจกังวลเรื่อง ${option.problemToSolve}`),
      },
      {
        order: 2,
        startSec: 10,
        endSec: 20,
        title: "ตอบข้อกังวลด้วยหลักฐาน",
        videoPrompt: buildVideoPrompt("Close-up product detail and proof signals from the product page context, no text overlays."),
        subShots: [
          `ซูมรายละเอียดสินค้าหรือวัสดุที่เกี่ยวข้องกับความมั่นใจ`,
          `โชว์ proof หรือ trust signal: ${second}`,
          "โชว์การใช้งานจริงแบบสั้นเพื่อยืนยันว่าข้อกังวลนั้นตรวจได้",
        ],
        thaiVoiceover: voiceover(`ให้มั่นใจขึ้นด้วยข้อมูลที่ตรวจได้จากหน้าสินค้า เช่น ${second}`),
      },
      {
        order: 3,
        startSec: 20,
        endSec: 30,
        title: "สรุปความมั่นใจก่อนตัดสินใจ",
        videoPrompt: buildVideoPrompt("Customer uses the product with a satisfied expression, clean trustworthy product shot, no text overlays."),
        subShots: [
          `โชว์สินค้าในบริบทใช้งานจริง: ${option.useCase}`,
          "ลูกค้าลองใช้หรือหยิบจับสินค้าอย่างมั่นใจ",
          `ปิดด้วยภาพสินค้าชัด ๆ พร้อมจังหวะชวน ${cta}`,
        ],
        thaiVoiceover: voiceover(`${productName} เหมาะกับคนที่อยากมั่นใจก่อนซื้อ และควรตรวจรายละเอียดสินค้าให้ตรงกับการใช้งานของตัวเอง`),
      },
    ],
    "story_option:quick_demo": [
      {
        order: 1,
        startSec: 0,
        endSec: 10,
        title: "เริ่มเดโมให้เห็นว่าใช้งานง่าย",
        videoPrompt: buildVideoPrompt("Fast satisfying product demo, clean home or lifestyle setup, no text overlays."),
        subShots: [
          `หยิบ ${productName} เข้ามาในเฟรม`,
          `เริ่มใช้งานขั้นแรก: ${first}`,
          "ซูมภาพสินค้าให้เห็นรูปทรง รายละเอียด หรือส่วนใช้งานหลัก",
        ],
        thaiVoiceover: voiceover(`${productName} ใช้งานง่าย เริ่มจาก ${first}`),
      },
      {
        order: 2,
        startSec: 10,
        endSec: 20,
        title: "รวมประโยชน์หลักแบบเร็ว",
        videoPrompt: buildVideoPrompt("Fast-cut montage of product benefits and practical uses, no text overlays."),
        subShots: [
          `โชว์ประโยชน์ที่หนึ่ง: ${second}`,
          `โชว์ประโยชน์ที่สอง: ${third}`,
          `สลับภาพใช้งานจริงให้เห็นความคุ้มค่า: ${option.angle}`,
        ],
        thaiVoiceover: voiceover(`จุดที่น่าสนใจคือ ${second} และ ${third}`),
      },
      {
        order: 3,
        startSec: 20,
        endSec: 30,
        title: "จบด้วยภาพใช้งานจริงและ CTA",
        videoPrompt: buildVideoPrompt("Smooth final demo shot, product in real context, clear ending product beauty shot, no text overlays."),
        subShots: [
          `ใช้งานสินค้าในบริบทจริง: ${option.useCase}`,
          "โชว์ผลลัพธ์หลังใช้แบบรวดเร็วและเข้าใจง่าย",
          `ปิดด้วยภาพสินค้าเด่น พร้อมจังหวะชวน ${cta}`,
        ],
        thaiVoiceover: voiceover(`ถ้าต้องการตัวช่วยที่ใช้งานง่ายและเห็นประโยชน์เร็ว ลองดู ${productName} ได้เลย`),
      },
    ],
    "story_option:use_case_moment": [
      {
        order: 1,
        startSec: 0,
        endSec: 10,
        title: "สถานการณ์ใช้งานที่หนึ่ง",
        videoPrompt: buildVideoPrompt("Realistic lifestyle context, show where and when the customer would use the product, no text overlays."),
        subShots: [
          `เปิดด้วยสถานการณ์จริง: ${first}`,
          "คนในฉากเริ่มใช้งานสินค้าอย่างเป็นธรรมชาติ",
          "ซูมสินค้าในบริบทนั้นให้เห็นว่าเข้ากับพื้นที่หรือชีวิตประจำวัน",
        ],
        thaiVoiceover: voiceover(`${productName} ใช้ได้ในสถานการณ์แบบนี้: ${first}`),
      },
      {
        order: 2,
        startSec: 10,
        endSec: 20,
        title: "สถานการณ์ใช้งานที่สอง",
        videoPrompt: buildVideoPrompt("Second practical lifestyle context, different angle and setting, no text overlays."),
        subShots: [
          `เปลี่ยนไปอีกบริบทการใช้งาน: ${second}`,
          "โชว์การหยิบ ใช้ วาง หรือจัดเก็บสินค้าในบริบทนั้น",
          "ให้เห็นประโยชน์ที่ต่างจาก shot แรกอย่างชัดเจน",
        ],
        thaiVoiceover: voiceover(`อีกมุมที่ใช้ได้คือ ${second}`),
      },
      {
        order: 3,
        startSec: 20,
        endSec: 30,
        title: "สรุปว่าเหมาะกับใคร",
        videoPrompt: buildVideoPrompt("Montage of realistic use cases, final product hero shot in clean environment, no text overlays."),
        subShots: [
          `โชว์บริบทใช้งานเพิ่มเติม: ${third}`,
          `สรุปกลุ่มคนหรือสถานการณ์ที่เหมาะ: ${option.audience}`,
          `ปิดด้วยภาพสินค้าในบริบทจริงและจังหวะชวน ${cta}`,
        ],
        thaiVoiceover: voiceover(`โดยรวมแล้วเหมาะกับ ${option.audience} และคนที่ต้องการ ${option.customerNeed}`),
      },
    ],
  };
  return {
    schemaVersion: "1.0",
    durationSec: 30,
    aspectRatio: "9:16",
    language: "th",
    structureLabel: "30 วินาที | 3 Shot | Shot ละ 10 วินาที",
    noOnScreenText: true,
    shots: shotsByType[option.id] ?? shotsByType["story_option:quick_demo"],
  };
}

function buildStoryOptions(
  productBrief: ProductBrief,
  videoBrief: VideoBrief,
  claims: MarketplaceStorytellingHandoff["claims"],
): MarketplaceStorytellingHandoff["storyOptions"] {
  const claimIds = claims.map((claim) => claim.id).slice(0, 4);
  const evidenceIds = productBrief.evidenceIds.slice(0, 20);
  const audience = productBrief.targetAudiences[0] || "ผู้ซื้อที่กำลังเปรียบเทียบสินค้า";
  const pain = productBrief.buyerPainPoints[0] || "ต้องการเห็นประโยชน์และความน่าเชื่อถืออย่างรวดเร็ว";
  const objection = productBrief.buyerObjections[0] || "ยังลังเลเรื่องความคุ้มค่าและคุณภาพ";
  const sellingPoint = productBrief.keySellingPoints[0] || productBrief.shortSummary || productBrief.productName;
  const secondarySellingPoint = productBrief.keySellingPoints[1] || productBrief.contentAngles[1] || sellingPoint;
  const trust = productBrief.trustSignals[0] || "มีข้อมูลจากหน้าสินค้าเป็นหลักฐาน";
  const inferred = inferStoryOptionDetails(productBrief);
  const hooks = productBrief.suggestedHooks.length > 0
    ? productBrief.suggestedHooks
    : [videoBrief.hook, `ทำไม ${productBrief.productName} ถึงน่าสนใจ`].filter(Boolean);
  const baseConfidence = clamp01(productBrief.confidence);
  const evidenceBoost = evidenceIds.length > 0 ? 0.04 : -0.08;
  const options: MarketplaceStorytellingHandoff["storyOptions"] = [
    {
      id: "story_option:problem_solution",
      title: "ปัญหา → ทางออก",
      audience,
      customerNeed: pain,
      problemToSolve: inferred.problemSolutions[0] || pain,
      useCase: inferred.positioning || productBrief.contentAngles[0] || "ใช้เมื่อลูกค้าต้องการแก้ปัญหาหลักของสินค้า",
      angle: sellingPoint,
      storyFormat: "customer_journey" as const,
      journeyStages: ["problem_recognition", "consideration", "proof_review_demo", "conversion_cta"] as MarketplaceStorytellingHandoff["customerJourneyStages"],
      hook: hooks[0] || sellingPoint,
      storyboardOutline: inferred.problemSolutions.length ? inferred.problemSolutions : [
        `เปิดด้วย pain point: ${pain}`,
        `โชว์สินค้าและจุดเด่น: ${sellingPoint}`,
        `เสริม proof/trust: ${trust}`,
        `ปิดด้วย CTA: ${productBrief.suggestedCTAs[0] || videoBrief.cta}`,
      ],
      primaryClaimIds: claimIds,
      evidenceIds,
      confidence: clamp01(Math.min(baseConfidence + evidenceBoost, 0.86)),
      autoSelected: false,
    },
    {
      id: "story_option:objection_trust",
      title: "ข้อกังวล → ความมั่นใจ",
      audience,
      customerNeed: inferred.objectionsTrust[0] || `ต้องการมั่นใจก่อนซื้อ: ${objection}`,
      problemToSolve: objection,
      useCase: "ใช้เมื่อลูกค้าลังเลเรื่องราคา คุณภาพ รีวิว หรือความน่าเชื่อถือ",
      angle: trust,
      storyFormat: "product_review" as const,
      journeyStages: ["awareness", "objection_handling", "trust_building", "conversion_cta"] as MarketplaceStorytellingHandoff["customerJourneyStages"],
      hook: hooks[1] || hooks[0] || objection,
      storyboardOutline: inferred.objectionsTrust.length ? inferred.objectionsTrust : [
        `เริ่มจากข้อกังวล: ${objection}`,
        `ตอบด้วยจุดขาย/รายละเอียดที่ตรวจได้`,
        `โชว์ trust signal: ${trust}`,
        `จบด้วยเหตุผลว่าทำไมควรลอง`,
      ],
      primaryClaimIds: claimIds,
      evidenceIds,
      confidence: clamp01(Math.min(baseConfidence * 0.95 + evidenceBoost, 0.82)),
      autoSelected: false,
    },
    {
      id: "story_option:quick_demo",
      title: "เดโมเร็ว / รวมประโยชน์",
      audience,
      customerNeed: "อยากเห็นเดโมและประโยชน์หลักแบบรวดเร็ว",
      problemToSolve: inferred.demoSteps[0] || pain,
      useCase: "ใช้ทำคลิปสั้นเน้นภาพสินค้า จุดเด่น และ CTA แบบเร็ว",
      angle: secondarySellingPoint,
      storyFormat: "sales_demo" as const,
      journeyStages: ["awareness", "consideration", "proof_review_demo", "conversion_cta"] as MarketplaceStorytellingHandoff["customerJourneyStages"],
      hook: hooks[2] || hooks[0] || sellingPoint,
      storyboardOutline: inferred.demoSteps.length ? inferred.demoSteps : videoBrief.scenes.slice(0, 4).map((scene) => `${scene.startSec}-${scene.endSec}s: ${scene.sceneGoal} / ${scene.onScreenText}`),
      primaryClaimIds: claimIds,
      evidenceIds,
      confidence: clamp01(Math.min(baseConfidence * 0.9 + evidenceBoost, 0.78)),
      autoSelected: false,
    },
    {
      id: "story_option:use_case_moment",
      title: "สถานการณ์ใช้งานจริง",
      audience,
      customerNeed: `อยากรู้ว่า ${productBrief.productName} เหมาะกับสถานการณ์ไหน`,
      problemToSolve: inferred.useCases[0] || pain,
      useCase: inferred.useCases[0] || productBrief.contentAngles[2] || "ใช้เมื่อต้องการเล่าให้เห็นบริบทการใช้งานจริงก่อนตัดสินใจซื้อ",
      angle: secondarySellingPoint,
      storyFormat: "customer_journey" as const,
      journeyStages: ["awareness", "problem_recognition", "consideration", "conversion_cta"] as MarketplaceStorytellingHandoff["customerJourneyStages"],
      hook: hooks[3] || `ถ้าเจอสถานการณ์นี้ ${productBrief.productName} อาจช่วยได้`,
      storyboardOutline: inferred.useCases.length ? inferred.useCases : [
        `เปิดด้วยสถานการณ์ของกลุ่มเป้าหมาย: ${audience}`,
        `ชี้ปัญหาหรือความต้องการ: ${pain}`,
        `โยงเข้ากับประโยชน์สินค้า: ${secondarySellingPoint}`,
        `สรุปว่าเหมาะกับใครและควรซื้อเมื่อไร`,
      ],
      primaryClaimIds: claimIds.slice(0, 3),
      evidenceIds,
      confidence: clamp01(Math.min(baseConfidence * 0.88 + evidenceBoost, 0.76)),
      autoSelected: false,
    },
  ];
  const candidates = options.filter((option) => option.storyboardOutline.length > 0).slice(0, 4);
  if (candidates.length === 0) return [];
  const bestIndex = candidates.reduce((best, option, index) => (
    option.confidence > candidates[best].confidence ? index : best
  ), 0);
  return candidates.map((option, index) => {
    const nextOption = {
      ...option,
      autoSelected: index === bestIndex,
      decisionReason: index === bestIndex
        ? "ระบบเลือกเป็นตัวเลือกแนะนำอัตโนมัติจาก confidence, evidence และความพร้อมของ claim"
        : "เก็บเป็นทางเลือกสำหรับสร้าง storytelling/storyboard ภายหลัง",
    };
    return {
      ...nextOption,
      videoBrief: buildStoryOptionVideoBrief(nextOption, productBrief),
    };
  });
}

const USER_STORY_CATEGORY_LABELS: Record<UserStoryInsightCategory, string> = {
  audience_pain_problem: "Audience / Pain point / Problem",
  selling_points: "Selling points",
  hooks: "Hooks",
  objections_trust: "Objections / trust",
  example_use_case: "Example use case",
};

function splitUserInsightLines(rawText: string): string[] {
  return rawText
    .split(/[\n\r]+|[•\-]+|[.!?。]+/g)
    .map((item) => cleanText(item, 220))
    .filter((item) => item.length >= 3)
    .slice(0, 12);
}

function classifyUserInsightLine(line: string): UserStoryInsightCategory {
  const lower = line.toLowerCase();
  if (/(hook|เปิด|คำโปรย|ดึงดูด|สะดุด|เริ่มคลิป|headline)/i.test(line)) return "hooks";
  if (/(กังวล|ลังเล|แพง|กลัว|ไม่มั่นใจ|เชื่อ|รีวิว|rating|ยอดขาย|รับประกัน|ของแท้|trust|proof)/i.test(line)) return "objections_trust";
  if (/(ใช้|เวลา|ตอน|กรณี|สถานการณ์|ตัวอย่าง|เหมาะกับ|สำหรับ|use case)/i.test(line)) return "example_use_case";
  if (/(จุดเด่น|ขาย|ดี|ช่วย|ประโยชน์|วัสดุ|ทน|คุ้ม|เร็ว|ง่าย|ประหยัด|selling|benefit)/i.test(line)) return "selling_points";
  if (/(ลูกค้า|คนที่|กลุ่ม|ปัญหา|pain|problem|ต้องการ|ไม่อยาก|อยาก)/i.test(line)) return "audience_pain_problem";
  return "selling_points";
}

function optionScoreForUserInsight(
  option: MarketplaceStorytellingHandoff["storyOptions"][number],
  categories: UserStoryInsightCategory[],
): number {
  let score = option.autoSelected ? 0.2 : 0;
  if (categories.includes("objections_trust") && /trust|proof|กังวล|มั่นใจ/i.test(`${option.title} ${option.useCase}`)) score += 1;
  if (categories.includes("example_use_case") && /use|case|สถานการณ์|customer_journey/i.test(`${option.title} ${option.storyFormat} ${option.useCase}`)) score += 1;
  if (categories.includes("hooks") && option.hook) score += 0.5;
  if (categories.includes("audience_pain_problem") && /problem|ปัญหา|ทางออก|customer_journey/i.test(`${option.title} ${option.storyFormat}`)) score += 1;
  if (categories.includes("selling_points") && /demo|ประโยชน์|sales_demo/i.test(`${option.title} ${option.storyFormat}`)) score += 0.8;
  return score + option.confidence;
}

export function createUserStoryInsightDraft(
  rawText: string,
  handoff: MarketplaceStorytellingHandoff,
): UserStoryInsightDraft {
  const cleanRaw = cleanText(rawText, 1400);
  const lines = splitUserInsightLines(cleanRaw);
  const additions = new Map<UserStoryInsightCategory, string[]>();
  for (const line of lines) {
    const category = classifyUserInsightLine(line);
    const current = additions.get(category) || [];
    if (!current.includes(line)) additions.set(category, [...current, line].slice(0, 5));
  }
  const categories = Array.from(additions.keys());
  const fallbackOption = handoff.storyOptions.find((option) => option.autoSelected) || handoff.storyOptions[0];
  const targetOption = handoff.storyOptions
    .slice()
    .sort((a, b) => optionScoreForUserInsight(b, categories) - optionScoreForUserInsight(a, categories))[0] || fallbackOption;
  const draftAdditions = Array.from(additions.entries()).map(([category, values]) => ({
    category,
    label: USER_STORY_CATEGORY_LABELS[category],
    values,
    confidence: Math.min(0.9, 0.55 + values.length * 0.08),
  }));
  return {
    schemaVersion: "1.0",
    rawText: cleanRaw,
    summary: draftAdditions
      .map((item) => `${item.label}: ${item.values.slice(0, 2).join(" / ")}`)
      .join(" | ")
      .slice(0, 700),
    targetOptionId: targetOption?.id || "",
    targetOptionTitle: targetOption?.title || "Recommended story option",
    additions: draftAdditions,
    confidence: draftAdditions.length > 0 ? Math.min(0.9, 0.5 + draftAdditions.length * 0.1) : 0.35,
    needsUserConfirmation: true,
  };
}

export function applyUserStoryInsightDraft(
  handoff: MarketplaceStorytellingHandoff,
  draft: UserStoryInsightDraft,
): MarketplaceStorytellingHandoff {
  const confirmedAt = new Date().toISOString();
  const targetOptionId = draft.targetOptionId || handoff.storyOptions.find((option) => option.autoSelected)?.id || handoff.storyOptions[0]?.id;
  return {
    ...handoff,
    storyOptions: handoff.storyOptions.map((option) => {
      if (option.id !== targetOptionId) return option;
      const additions: UserStoryInsightAddition[] = draft.additions.map((addition) => ({
        category: addition.category,
        values: addition.values,
        rawText: draft.rawText,
        source: "user_confirmed",
        confirmedAt,
        confidence: addition.confidence,
      }));
      const audience = draft.additions.find((item) => item.category === "audience_pain_problem")?.values[0] || option.audience;
      const selling = draft.additions.find((item) => item.category === "selling_points")?.values[0] || option.angle;
      const hook = draft.additions.find((item) => item.category === "hooks")?.values[0] || option.hook;
      const objection = draft.additions.find((item) => item.category === "objections_trust")?.values[0];
      const useCase = draft.additions.find((item) => item.category === "example_use_case")?.values[0] || option.useCase;
      return {
        ...option,
        audience,
        customerNeed: audience,
        problemToSolve: objection || option.problemToSolve,
        useCase,
        angle: selling,
        hook,
        storyboardOutline: [
          ...draft.additions.flatMap((addition) => addition.values.map((value) => `${USER_STORY_CATEGORY_LABELS[addition.category]}: ${value}`)),
          ...option.storyboardOutline,
        ].slice(0, 8),
        confidence: Math.min(0.95, option.confidence + 0.06),
        source: "mixed",
        userAdditions: [...(option.userAdditions || []), ...additions].slice(-20),
        decisionReason: "มีข้อมูลเพิ่มเติมจาก user ที่ confirm แล้ว จึงใช้เป็น option ที่ควรพิจารณาใน storytelling/storyboard",
      };
    }),
    confidence: Math.min(0.95, handoff.confidence + 0.04),
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
    keySellingPoints: normalizePriceSensitiveList(toStringList(value?.keySellingPoints, 12), source),
    targetAudiences: toStringList(value?.targetAudiences, 12),
    buyerPainPoints: toStringList(value?.buyerPainPoints, 12),
    buyerObjections: toStringList(value?.buyerObjections, 12),
    trustSignals: normalizePriceSensitiveList(toStringList(value?.trustSignals, 12), source),
    contentAngles: toStringList(value?.contentAngles, 12),
    suggestedHooks: toStringList(value?.suggestedHooks, 12),
    suggestedCTAs: toStringList(value?.suggestedCTAs, 12),
    confidence: clamp01(value?.confidence ?? 0.55),
    evidenceIds: toStringList(value?.evidenceIds, 80).filter((id) => evidenceIds.has(id)),
  };
  if (source.product.price && !brief.keySellingPoints.some((item) => item.includes(source.product.price ?? ""))) {
    brief.keySellingPoints = [`ราคา ${source.product.price}`, ...brief.keySellingPoints].slice(0, 12);
  }
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

function parseMoneyFromText(value: string | undefined) {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  const parsed = match ? Number(match[0]) : NaN;
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function textHasPriceSignal(value: string) {
  return /(ราคา|฿|บาท|thb)/i.test(value);
}

function priceClaimMatchesSource(value: string, sourcePrice: number | null) {
  if (!textHasPriceSignal(value) || sourcePrice == null) return true;
  const claimPrice = parseMoneyFromText(value);
  if (claimPrice == null) return true;
  return Math.abs(claimPrice - sourcePrice) < 0.01;
}

function normalizePriceSensitiveList(values: string[], source: SanitizedLocalAIInput) {
  const sourcePrice = parseMoneyFromText(source.product.price);
  return values.filter((value) => priceClaimMatchesSource(value, sourcePrice));
}

function clamp01(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJsonStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function shortSyncHash(value: unknown) {
  const text = stableJsonStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeSourceIdentityUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw.replace(/[?#].*$/, "").replace(/\/$/, "");
  }
}

function buildInsightSourceIdentity(input: {
  platform: MarketplacePlatform;
  sourceUrl: string;
  sourceIds?: SanitizedLocalAIInput["sourceIds"];
  rawCapture?: ProductCapturePayload;
}) {
  const canonicalSourceUrl = normalizeSourceIdentityUrl(
    input.rawCapture?.canonicalSourceUrl
      ?? input.sourceIds?.canonicalSourceUrl
      ?? input.sourceUrl,
  );
  return {
    platform: input.platform,
    canonicalSourceUrl,
    externalProductId: input.rawCapture?.externalProductId ?? input.sourceIds?.externalProductId ?? undefined,
    externalShopId: input.rawCapture?.externalShopId ?? input.sourceIds?.externalShopId ?? undefined,
  };
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
  deviceId?: string;
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
        ...(input.deviceId ? { "X-Marketplace-Device-Id": input.deviceId } : {}),
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
  const storyOptions = input.insightType === "storytelling_handoff" && input.payload && typeof input.payload === "object" && Array.isArray((input.payload as any).storyOptions)
    ? (input.payload as any).storyOptions as Array<{ videoBrief?: unknown }>
    : [];
  const idempotencySchema = input.insightType === "storytelling_handoff" ? "story_options_video_v1" : "v1";
  const payloadSyncHash = shortSyncHash(input.payload);
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
  const sourceIdentity = buildInsightSourceIdentity({
    platform: input.source.platform,
    sourceUrl: input.source.sourceUrl,
    sourceIds: input.source.sourceIds,
    rawCapture: input.rawCapture,
  });
  const sourceIdentityHash = shortSyncHash(sourceIdentity);
  const semanticKey = `${input.source.platform}:${sourceIdentityHash}:${input.insightType}:${input.provider}:${idempotencySchema}:${payloadSyncHash}`;
  return {
    extensionVersion: input.extensionVersion,
    idempotencyKey: semanticKey,
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
      sourceIdentity,
      sourceIdentityHash,
      semanticKey,
      semanticPayloadHash: payloadSyncHash,
      selectedImageQuality,
      dataQualityWarnings,
      storyOptionCount: storyOptions.length,
      storyOptionVideoBriefCount: storyOptions.filter((option) => option.videoBrief).length,
    },
    payload: input.payload,
    rawCaptureIncluded: false,
    rawCapture: undefined,
  };
}
