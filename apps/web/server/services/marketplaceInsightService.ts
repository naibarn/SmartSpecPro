import crypto from "node:crypto";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { getDb } from "../db";
import { marketplaceCaptureInsights, marketplaceCaptureSessions, marketplaceProductImages, marketplaceProducts } from "../../drizzle/schema";
import {
  marketplaceCaptureInsightSyncSchema,
  marketplaceClaimResolutionSchema,
  marketplaceServerInsightGenerationSchema,
  marketplaceStorytellingHandoffSchema,
  productBriefSchema,
  type MarketplaceServerInsightGenerationResponse,
  type ProductBrief,
  type SanitizedLocalAIInput,
  type MarketplaceCaptureInsightSyncInput,
} from "@shared/marketplaceCapture";
import { createMarketplaceId, getMarketplaceCaptureForUser } from "./marketplaceCaptureService";
import { marketplaceCaptureError } from "./marketplaceCaptureConfig";
import { getMarketplaceProductWithAccess } from "./marketplaceProductService";
import { marketplaceOwnerTenantScope } from "./marketplaceTenantScope";
import { executeSkillLlmWithFallback } from "./skillModelFallback";
import { loadEnabledLlmModelRows } from "./enabledLlmModels";
import { selectBestLlmModel } from "./intelligentModelSelector";
import { buildWebSearchParams, detectProviderFamily } from "./webSearchToolInjector";
import { getProviderForModel } from "./llmRouter";

type MarketplaceInsightAuth = { userId: number; tenantId?: string };

function tenantScope(table: { userId: any; tenantId: any }, auth: MarketplaceInsightAuth) {
  return and(
    eq(table.userId, auth.userId),
    auth.tenantId ? eq(table.tenantId, auth.tenantId) : isNull(table.tenantId),
  );
}

function sanitizeInsightRow<T extends { rawCaptureJson?: unknown }>(row: T) {
  const { rawCaptureJson: _rawCaptureJson, ...safe } = row;
  return safe;
}

function parseInsightCreatedAt(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function getStorytellingReadiness(payload: unknown): string | null {
  const parsed = marketplaceStorytellingHandoffSchema.safeParse(payload);
  return parsed.success ? parsed.data.readiness : null;
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJsonStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function sha256Short(value: unknown, length = 32) {
  return crypto.createHash("sha256").update(stableJsonStringify(value)).digest("hex").slice(0, length);
}

function md5Text(value: string) {
  return crypto.createHash("md5").update(value).digest("hex");
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

function removeVolatilePayloadFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeVolatilePayloadFields);
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (["__syncMetadata", "captureId", "sourceCaptureIds", "insightIds"].includes(key)) continue;
    if (key === "source" && raw && typeof raw === "object") {
      const sourceValue = { ...(raw as Record<string, unknown>) };
      delete sourceValue.captureId;
      output[key] = removeVolatilePayloadFields(sourceValue);
      continue;
    }
    output[key] = removeVolatilePayloadFields(raw);
  }
  return output;
}

function insightSemanticPayloadHash(payload: unknown) {
  return sha256Short(removeVolatilePayloadFields(payload), 20);
}

function insightSourceIdentity(input: MarketplaceCaptureInsightSyncInput) {
  const metadata = input.metadata ?? {};
  const sourceIdentity = (metadata.sourceIdentity ?? {}) as {
    canonicalSourceUrl?: string | null;
    externalProductId?: string | null;
    externalShopId?: string | null;
  };
  const sourceIds = metadata.sourceIds ?? {};
  return {
    platform: input.source.platform,
    canonicalSourceUrl: normalizeSourceIdentityUrl(
      sourceIdentity.canonicalSourceUrl
        ?? sourceIds.canonicalSourceUrl
        ?? input.source.url,
    ),
    externalProductId: sourceIdentity.externalProductId ?? sourceIds.externalProductId ?? null,
    externalShopId: sourceIdentity.externalShopId ?? sourceIds.externalShopId ?? null,
  };
}

function buildInsightSemanticKey(input: MarketplaceCaptureInsightSyncInput, normalizedPayload: unknown) {
  const source = insightSourceIdentity(input);
  const payloadHash = typeof input.metadata?.semanticPayloadHash === "string" && input.metadata.semanticPayloadHash.trim()
    ? input.metadata.semanticPayloadHash.trim()
    : insightSemanticPayloadHash(normalizedPayload);
  return `insight:${md5Text([
    source.platform,
    source.canonicalSourceUrl,
    source.externalProductId ?? "",
    source.externalShopId ?? "",
    input.insightType,
    input.provider,
    input.schemaVersion,
    payloadHash,
  ].join("|"))}`;
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function arrayOfStrings(value: unknown, maxItems: number, maxChars = 220): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, maxChars)).filter(Boolean).slice(0, maxItems);
}

function clampConfidence(value: unknown, fallback = 0.55): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
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

function parseLlmJson(content: string): Record<string, unknown> {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = (fenced || content).trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("invalid_llm_json");
    return JSON.parse(raw.slice(start, end + 1));
  }
}

function normalizeProductBriefFromServer(value: unknown, source: SanitizedLocalAIInput): ProductBrief {
  const evidenceIds = new Set(source.evidence.map((item) => item.id));
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const productCategory = productBriefSchema.shape.productCategory.safeParse(raw.productCategory).success
    ? raw.productCategory
    : source.product.productCategory;
  const normalized = productBriefSchema.parse({
    schemaVersion: "1.0",
    source: { platform: source.platform, captureId: source.captureId, url: source.sourceUrl, affiliateUrl: source.affiliateUrl ?? null },
    productName: cleanText(raw.productName || source.product.title || source.pageTitle, 300) || "Untitled product",
    category: cleanText(raw.category || source.product.category, 200) || undefined,
    productCategory,
    shortSummary: cleanText(raw.shortSummary, 800) || cleanText(source.product.description || source.product.title, 500),
    keySellingPoints: normalizePriceSensitiveList(arrayOfStrings(raw.keySellingPoints, 12), source),
    targetAudiences: arrayOfStrings(raw.targetAudiences, 12),
    buyerPainPoints: arrayOfStrings(raw.buyerPainPoints, 12),
    buyerObjections: arrayOfStrings(raw.buyerObjections, 12),
    trustSignals: normalizePriceSensitiveList(arrayOfStrings(raw.trustSignals, 12), source),
    contentAngles: arrayOfStrings(raw.contentAngles, 12),
    suggestedHooks: arrayOfStrings(raw.suggestedHooks, 12),
    suggestedCTAs: arrayOfStrings(raw.suggestedCTAs, 12),
    confidence: clampConfidence(raw.confidence),
    evidenceIds: arrayOfStrings(raw.evidenceIds, 80).filter((id) => evidenceIds.has(id)),
  });
  if (source.product.price && !normalized.keySellingPoints.some((item) => item.includes(source.product.price ?? ""))) {
    return { ...normalized, keySellingPoints: [`ราคา ${source.product.price}`, ...normalized.keySellingPoints].slice(0, 12) };
  }
  return normalized;
}

function createServerDeterministicProductBrief(source: SanitizedLocalAIInput): ProductBrief {
  const sellingPoints = [
    source.product.price ? `ราคา ${source.product.price}` : "",
    source.product.soldCount ? `มีสัญญาณยอดขาย ${source.product.soldCount}` : "",
    source.product.rating ? `มี rating ${source.product.rating}` : "",
    source.shop?.name ? `ร้าน ${source.shop.name}` : "",
  ].filter(Boolean);
  return normalizeProductBriefFromServer({
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

function sourceRef(source: SanitizedLocalAIInput) {
  return { platform: source.platform, captureId: source.captureId, url: source.sourceUrl, affiliateUrl: source.affiliateUrl ?? null };
}

function buildSupplementalInsightPayloads(source: SanitizedLocalAIInput, brief: ProductBrief) {
  const evidenceIds = source.evidence.map((item) => item.id).slice(0, 20);
  return [
    {
      insightType: "review_insight" as const,
      payload: {
        schemaVersion: "1.0",
        source: sourceRef(source),
        positiveThemes: brief.trustSignals.length ? brief.trustSignals : brief.keySellingPoints.slice(0, 3),
        negativeThemes: [],
        repeatedPhrases: [],
        commonBuyerQuestions: brief.buyerObjections.map((objection) => `ลูกค้าอาจถามเรื่อง ${objection}`),
        objectionsToAddress: brief.buyerObjections,
        recommendedFAQ: brief.buyerObjections.slice(0, 4).map((objection) => ({
          question: `ควรอธิบายเรื่อง ${objection} อย่างไร?`,
          answerDraft: "ใช้ข้อมูลจากหน้าสินค้าและหลักฐานที่เลือกเท่านั้นก่อนเผยแพร่",
        })),
        contentRecommendations: brief.contentAngles,
        confidence: Math.min(brief.confidence, source.reviews.length > 0 ? 0.75 : 0.45),
        evidenceIds,
      },
    },
    {
      insightType: "combined_opportunity" as const,
      payload: {
        schemaVersion: "1.0",
        shopeeCaptureId: source.platform === "shopee" ? source.captureId : undefined,
        tiktokCaptureId: source.platform === "tiktok_shop" ? source.captureId : undefined,
        opportunitySummary: brief.shortSummary,
        productTrendFitScore: Math.round(Math.min(brief.confidence, 1) * 100),
        recommendedContentFormat: source.platform === "tiktok_shop" ? "TikTok Shop short" : "Shopee product support video",
        suggestedPositioning: brief.contentAngles[0] || brief.keySellingPoints[0] || brief.shortSummary,
        risks: brief.buyerObjections,
        nextActions: ["create_video_brief", "send_to_ai_video_studio", "save_to_product_library"],
      },
    },
  ];
}

function safeInsightUrl(value: unknown, productId: string) {
  const raw = String(value ?? "").trim();
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return `${(process.env.PUBLIC_URL || "https://smartaihub.app").replace(/\/$/, "")}/marketplace-capture/products/${productId}`;
  }
}

function addEvidence(evidence: SanitizedLocalAIInput["evidence"], type: SanitizedLocalAIInput["evidence"][number]["type"], id: string, text: unknown, confidence = 0.7) {
  const normalized = String(text ?? "").trim();
  if (!normalized) return;
  evidence.push({ id: `${type}:${id}`, type, text: normalized.slice(0, 1200), confidence });
}

async function buildSanitizedInputFromProduct(productId: string, auth: MarketplaceInsightAuth): Promise<SanitizedLocalAIInput> {
  const bundle = await getMarketplaceProductWithAccess(productId, auth);
  const product = bundle.product as any;
  const description = product.descriptionText || "";
  const images = (bundle.images ?? []).map((image: any) => String(image.url ?? "")).filter(Boolean).slice(0, 30);
  const descriptionJson = product.descriptionJson && typeof product.descriptionJson === "object" ? product.descriptionJson as Record<string, unknown> : {};
  const platformRaw = product.platformRawJson && typeof product.platformRawJson === "object" ? product.platformRawJson as Record<string, unknown> : {};
  const evidence: SanitizedLocalAIInput["evidence"] = [];
  addEvidence(evidence, "title", "product", product.productName, 0.9);
  addEvidence(evidence, "price", "current", product.priceCurrent ? `${product.priceCurrent} ${product.currency ?? "THB"}` : "", 0.85);
  addEvidence(evidence, "metric", "commission_rate", product.commissionRatePercent ? `Commission rate ${product.commissionRatePercent}%` : "", 0.8);
  addEvidence(evidence, "rating", "score", product.ratingScore, 0.75);
  addEvidence(evidence, "metric", "sold", product.soldCountText, 0.7);
  addEvidence(evidence, "description", "product", description, 0.7);
  addEvidence(evidence, "seller_info", "shop", product.shopName, 0.7);
  addEvidence(evidence, "specification", "category", descriptionJson.categoryText ?? platformRaw.categoryText, 0.65);
  images.slice(0, 12).forEach((url, index) => addEvidence(evidence, "image", String(index + 1), url, 0.55));
  return {
    schemaVersion: "1.0",
    captureId: product.captureId ?? undefined,
    platform: product.platform,
    sourceUrl: safeInsightUrl(product.sourceUrl, productId),
    affiliateUrl: product.affiliateUrl ?? null,
    capturedAt: new Date().toISOString(),
    product: {
      title: product.productName ?? undefined,
      price: product.priceCurrent ? `${product.priceCurrent} ${product.currency ?? "THB"}` : undefined,
      commissionRatePercent: product.commissionRatePercent != null ? Number(product.commissionRatePercent) : undefined,
      rating: product.ratingScore ? String(product.ratingScore) : undefined,
      soldCount: product.soldCountText ?? undefined,
      description,
      category: String(descriptionJson.categoryText ?? platformRaw.categoryText ?? ""),
      productCategory: product.productCategory ?? descriptionJson.productCategory ?? "auto",
      selectedImageUrls: images,
    },
    shop: { name: product.shopName ?? undefined },
    reviews: [],
    comments: [],
    evidence,
    payloadHash: sha256Short({ productId, updatedAt: product.updatedAt, evidence }, 32),
  };
}

async function executeMarketplaceJsonLlm(input: {
  userId: number;
  skillSlug: string;
  systemPrompt: string;
  userPrompt: string;
  requiresWebSearch?: boolean;
}) {
  const requirements = {
    supportsJsonMode: true,
    ...(input.requiresWebSearch ? { supportsWebSearch: true } : {}),
  };
  const rows = await loadEnabledLlmModelRows();
  const modelId = selectBestLlmModel(requirements, rows);
  if (!modelId) {
    throw new Error(input.requiresWebSearch ? "no_web_search_model_available" : "no_json_model_available");
  }
  const provider = modelId ? await getProviderForModel(modelId, { allowFreeModels: false }) : null;
  const webSearch = input.requiresWebSearch && provider
    ? buildWebSearchParams(detectProviderFamily(provider.providerName))
    : { bodyParams: {}, systemPromptSuffix: "" };
  const result = await executeSkillLlmWithFallback({
    skillSlug: input.skillSlug,
    userId: input.userId,
    executionPolicy: {
      modelId,
      allowFreeModels: false,
      modelSource: "requirements_match",
      matchedCapabilities: Object.keys(requirements),
    },
    maxModelAttempts: 3,
    temperature: 0,
    extraBodyParams: webSearch.bodyParams,
    messages: [
      { role: "system", content: `${input.systemPrompt}${webSearch.systemPromptSuffix ?? ""}` },
      { role: "user", content: input.userPrompt },
    ],
  });
  if (!result.success || !result.content) throw new Error(result.error || "llm_failed");
  return { content: result.content, modelId: result.modelId, providerName: result.provider?.providerName };
}

function buildServerProductBriefPrompt(source: SanitizedLocalAIInput, languagePreference: string) {
  return [
    "You are SmartSpecPro server AI fallback for marketplace capture insights.",
    "Task: create a ProductBrief JSON object from sanitized marketplace evidence.",
    `Required output language: ${languagePreference === "auto" ? "match source language; prefer concise Thai when source is Thai" : languagePreference}.`,
    "Rules: use only provided data, do not invent claims, return JSON only, include evidenceIds that exist in the evidence list.",
    "Price rule: if you mention price, use only source.product.price exactly. Do not infer price from description text, SKU codes, promotion text, or unrelated numbers.",
    "Choose productCategory from the product-reference-storyboard enum only. Use source.product.category and source.product.categoryPath as marketplace subcategory evidence. Keep category as the captured marketplace subcategory text.",
    `Sanitized input:\n${JSON.stringify(source, null, 2).slice(0, 25_000)}`,
  ].join("\n\n");
}

async function maybeRunServerProductBriefLlm(source: SanitizedLocalAIInput, languagePreference: string, auth: MarketplaceInsightAuth): Promise<ProductBrief | null> {
  const result = await executeMarketplaceJsonLlm({
    userId: auth.userId,
    skillSlug: "marketplace-capture-product-brief",
    systemPrompt: "Return valid JSON only.",
    userPrompt: buildServerProductBriefPrompt(source, languagePreference),
  });
  return normalizeProductBriefFromServer(parseLlmJson(result.content), source);
}

export async function generateMarketplaceServerInsight(input: unknown, auth: MarketplaceInsightAuth): Promise<MarketplaceServerInsightGenerationResponse> {
  const parsed = marketplaceServerInsightGenerationSchema.parse(input);
  try {
    const llmBrief = await maybeRunServerProductBriefLlm(parsed.source, parsed.languagePreference, auth);
    if (llmBrief) {
      return { ok: true, provider: "server_ai", insightType: "product_brief", payload: llmBrief, fallbackMode: "llm_gateway" };
    }
  } catch {
    // Fall through to deterministic server fallback. The user still receives a validated ProductBrief.
  }
  return {
    ok: true,
    provider: "server_ai",
    insightType: "product_brief",
    payload: createServerDeterministicProductBrief(parsed.source),
    fallbackMode: "deterministic_fallback",
  };
}

export async function enhanceMarketplaceProductDescription(
  productId: string,
  auth: MarketplaceInsightAuth,
) {
  const db = getDb();
  const bundle = await getMarketplaceProductWithAccess(productId, auth);
  const product = bundle.product as any;
  if (product.accessType === "group" && product.groupShare?.permission !== "read_update") {
    throw marketplaceCaptureError("product_read_only", "Product is shared read-only", 403);
  }
  const source = await buildSanitizedInputFromProduct(productId, auth);
  const result = await executeMarketplaceJsonLlm({
    userId: auth.userId,
    skillSlug: "marketplace-product-description-web-enrichment",
    requiresWebSearch: true,
    systemPrompt: [
      "Return valid JSON only.",
      "You improve marketplace product descriptions using web search grounding.",
      "Do not invent unavailable price, warranty, compatibility, or certification claims.",
      "Prefer Thai output when the existing product text is Thai.",
      "Return shape: {\"descriptionText\":\"...\", \"sources\":[\"https://...\"]}.",
    ].join("\n"),
    userPrompt: [
      "Find additional public product details for this marketplace item and merge them into a clearer description.",
      "Keep seller-specific warnings/conditions from the existing description if present.",
      "Use concise sections and keep claims source-grounded.",
      `Product evidence:\n${JSON.stringify(source, null, 2).slice(0, 18_000)}`,
    ].join("\n\n"),
  });
  const parsed = parseLlmJson(result.content);
  const descriptionText = String(parsed.descriptionText ?? parsed.description ?? "").trim();
  if (!descriptionText) throw marketplaceCaptureError("description_enrichment_empty", "LLM did not return an improved description", 502);
  const updatedAt = new Date();
  const platformRaw = product.platformRawJson && typeof product.platformRawJson === "object" ? product.platformRawJson as Record<string, unknown> : {};
  await db.update(marketplaceProducts)
    .set({
      descriptionText: descriptionText.slice(0, 80_000),
      platformRawJson: {
        ...platformRaw,
        descriptionEnrichedAt: updatedAt.toISOString(),
        descriptionEnrichedByUserId: auth.userId,
        descriptionEnrichmentModel: result.modelId ?? null,
        descriptionEnrichmentProvider: result.providerName ?? null,
        descriptionEnrichmentSources: Array.isArray(parsed.sources) ? parsed.sources.slice(0, 8) : [],
      },
      updatedAt,
    })
    .where(and(
      eq(marketplaceProducts.id, productId),
      eq(marketplaceProducts.userId, auth.userId),
      marketplaceOwnerTenantScope(marketplaceProducts.tenantId, auth.tenantId),
    ));
  return {
    ok: true,
    productId,
    descriptionText: descriptionText.slice(0, 80_000),
    updatedAt,
    modelId: result.modelId ?? null,
    providerName: result.providerName ?? null,
    sources: Array.isArray(parsed.sources) ? parsed.sources.slice(0, 8) : [],
  };
}

export async function analyzeMarketplaceProductInsights(productId: string, auth: MarketplaceInsightAuth) {
  await getMarketplaceProductWithAccess(productId, auth);
  const source = await buildSanitizedInputFromProduct(productId, auth);
  const brief = (await maybeRunServerProductBriefLlm(source, "auto", auth)
    .catch(() => null)) ?? createServerDeterministicProductBrief(source);
  const payloads = [
    { insightType: "product_brief" as const, payload: brief },
    ...buildSupplementalInsightPayloads(source, brief),
  ];
  const synced = [];
  for (const item of payloads) {
    const payloadHash = sha256Short(item.payload, 64);
    synced.push(await syncMarketplaceInsight({
      extensionVersion: "web-product-detail",
      idempotencyKey: `web:${productId}:${item.insightType}:${payloadHash}`.slice(0, 160),
      schemaVersion: "1.0",
      insightCreatedAt: new Date().toISOString(),
      payloadHash,
      source: {
        platform: source.platform,
        url: source.sourceUrl,
        affiliateUrl: source.affiliateUrl ?? null,
        capturedAt: source.capturedAt,
        captureId: source.captureId,
        marketplaceProductId: productId,
      },
      insightType: item.insightType,
      provider: "server_ai",
      status: "ready",
      metadata: {
        sourceIdentity: {
          platform: source.platform,
          canonicalSourceUrl: source.sourceUrl,
        },
        sourceIds: {
          canonicalSourceUrl: source.sourceUrl,
        },
        inputEvidenceIds: source.evidence.map((evidence) => evidence.id),
        providerDecision: "server_ai",
      },
      payload: item.payload,
      rawCaptureIncluded: false,
    }, auth));
  }
  return { ok: true, productId, insightIds: synced.map((item) => item.insightId), count: synced.length };
}

async function resolveProductId(input: MarketplaceCaptureInsightSyncInput, auth: MarketplaceInsightAuth) {
  if (input.source.marketplaceProductId) {
    const db = getDb();
    const [product] = await db.select({ id: marketplaceProducts.id }).from(marketplaceProducts)
      .where(and(eq(marketplaceProducts.id, input.source.marketplaceProductId), tenantScope(marketplaceProducts, auth)))
      .limit(1);
    if (!product) throw marketplaceCaptureError("marketplace_product_not_found", "Marketplace product not found", 404);
    return product.id;
  }
  return null;
}

async function resolveCaptureId(input: MarketplaceCaptureInsightSyncInput, auth: MarketplaceInsightAuth) {
  if (input.source.captureId) return input.source.captureId;
  const db = getDb();
  const [capture] = await db.select({ id: marketplaceCaptureSessions.id }).from(marketplaceCaptureSessions)
    .where(and(
      tenantScope(marketplaceCaptureSessions, auth),
      eq(marketplaceCaptureSessions.platform, input.source.platform),
      eq(marketplaceCaptureSessions.sourceUrl, input.source.url),
    ))
    .orderBy(desc(marketplaceCaptureSessions.updatedAt))
    .limit(1);
  return capture?.id ?? null;
}

export async function syncMarketplaceInsight(input: unknown, auth: MarketplaceInsightAuth) {
  const parsed = marketplaceCaptureInsightSyncSchema.parse(input);
  if (parsed.rawCaptureIncluded || parsed.rawCapture) {
    throw marketplaceCaptureError("raw_capture_sync_disabled", "Raw capture sync is disabled for structured insights", 400);
  }
  const normalizedPayload = normalizeInsightPayloadForPersistence(parsed.payload, parsed.insightType, parsed.metadata);
  const semanticKey = buildInsightSemanticKey(parsed, normalizedPayload);
  const captureId = await resolveCaptureId(parsed, auth);
  if (captureId) await getMarketplaceCaptureForUser(captureId, auth);
  const productId = await resolveProductId(parsed, auth);
  const db = getDb();
  const now = new Date();
  const readiness = getStorytellingReadiness(parsed.payload);
  const [existing] = await db.select().from(marketplaceCaptureInsights)
    .where(and(
      tenantScope(marketplaceCaptureInsights, auth),
      or(
        eq(marketplaceCaptureInsights.idempotencyKey, parsed.idempotencyKey),
        eq(marketplaceCaptureInsights.semanticKey, semanticKey),
      ),
    ))
    .orderBy(desc(marketplaceCaptureInsights.createdAt))
    .limit(1);
  if (existing) {
    const sameRequest = existing.insightType === parsed.insightType
      && existing.provider === parsed.provider
      && (existing.idempotencyKey === parsed.idempotencyKey || existing.semanticKey === semanticKey);
    if (!sameRequest) {
      throw marketplaceCaptureError("insight_idempotency_conflict", "Idempotency key already exists with a different insight payload", 409);
    }
    const patch: Partial<typeof marketplaceCaptureInsights.$inferInsert> = {};
    if (!existing.captureId && captureId) patch.captureId = captureId;
    if (!existing.productId && productId) patch.productId = productId;
    if (!existing.semanticKey) patch.semanticKey = semanticKey;
    if (existing.payloadHash !== parsed.payloadHash) patch.payloadHash = parsed.payloadHash;
    if (existing.extensionVersion !== parsed.extensionVersion) patch.extensionVersion = parsed.extensionVersion;
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = now;
      await db.update(marketplaceCaptureInsights)
        .set(patch)
        .where(and(eq(marketplaceCaptureInsights.id, existing.id), tenantScope(marketplaceCaptureInsights, auth)));
    }
    return {
      ok: true,
      insightId: existing.id,
      captureId: patch.captureId ?? existing.captureId,
      productId: patch.productId ?? existing.productId,
      status: existing.status,
      openUrl: `/marketplace-capture/insights/${existing.id}`,
      storytellingReadiness: existing.storytellingReadiness,
      idempotent: true,
    };
  }

  const values = {
    tenantId: auth.tenantId ?? null,
    captureId,
    productId,
    platform: parsed.source.platform,
    sourceUrl: parsed.source.url,
    insightType: parsed.insightType,
    provider: parsed.provider,
    status: parsed.status,
    schemaVersion: parsed.schemaVersion,
    payloadHash: parsed.payloadHash,
    idempotencyKey: parsed.idempotencyKey,
    semanticKey,
    parentInsightIdsJson: parsed.parentInsightIds ?? [],
    payloadJson: normalizedPayload,
    rawCaptureJson: null,
    rawCaptureIncluded: false,
    storytellingReadiness: getStorytellingReadiness(normalizedPayload) ?? readiness,
    extensionVersion: parsed.extensionVersion,
    insightCreatedAt: parseInsightCreatedAt(parsed.insightCreatedAt),
    updatedAt: now,
  };

  const insightId = createMarketplaceId("ins");
  await db.insert(marketplaceCaptureInsights).values({
    id: insightId,
    userId: auth.userId,
    createdAt: now,
    claimResolutionsJson: [],
    ...values,
  });

  return {
    ok: true,
    insightId,
    captureId,
    productId,
    status: parsed.status,
    openUrl: `/marketplace-capture/insights/${insightId}`,
    storytellingReadiness: values.storytellingReadiness,
    idempotent: false,
  };
}

export async function getMarketplaceInsightForUser(insightId: string, auth: MarketplaceInsightAuth) {
  const db = getDb();
  const [insight] = await db.select().from(marketplaceCaptureInsights)
    .where(and(eq(marketplaceCaptureInsights.id, insightId), tenantScope(marketplaceCaptureInsights, auth)))
    .limit(1);
  if (!insight) throw marketplaceCaptureError("insight_not_found", "Marketplace insight not found", 404);
  return sanitizeInsightRow(insight);
}

async function canReadInsightThroughAccessibleProduct(
  insight: typeof marketplaceCaptureInsights.$inferSelect,
  auth: MarketplaceInsightAuth,
) {
  const db = getDb();
  const productIds = new Set<string>();
  if (insight.productId) productIds.add(insight.productId);

  const relatedProducts = await db.select({ id: marketplaceProducts.id })
    .from(marketplaceProducts)
    .where(and(
      marketplaceOwnerTenantScope(marketplaceProducts.tenantId, auth.tenantId),
      or(
        insight.captureId ? eq(marketplaceProducts.captureId, insight.captureId) : undefined,
        and(
          eq(marketplaceProducts.platform, insight.platform),
          eq(marketplaceProducts.sourceUrl, insight.sourceUrl),
        ),
      ),
    ))
    .limit(10);
  for (const product of relatedProducts) productIds.add(product.id);

  for (const productId of productIds) {
    try {
      await getMarketplaceProductWithAccess(productId, auth);
      return true;
    } catch {
      // Keep probing other related products without leaking which product matched.
    }
  }
  return false;
}

export async function getMarketplaceInsightReadableForUser(insightId: string, auth: MarketplaceInsightAuth) {
  const db = getDb();
  const [ownedInsight] = await db.select().from(marketplaceCaptureInsights)
    .where(and(eq(marketplaceCaptureInsights.id, insightId), tenantScope(marketplaceCaptureInsights, auth)))
    .limit(1);
  if (ownedInsight) return sanitizeInsightRow(ownedInsight);

  const [insight] = await db.select().from(marketplaceCaptureInsights)
    .where(eq(marketplaceCaptureInsights.id, insightId))
    .limit(1);
  if (!insight || !(await canReadInsightThroughAccessibleProduct(insight, auth))) {
    throw marketplaceCaptureError("insight_not_found", "Marketplace insight not found", 404);
  }
  return sanitizeInsightRow(insight);
}

export async function listMarketplaceInsightsByCapture(captureId: string, auth: MarketplaceInsightAuth) {
  await getMarketplaceCaptureForUser(captureId, auth);
  const db = getDb();
  const rows = await db.select().from(marketplaceCaptureInsights)
    .where(and(eq(marketplaceCaptureInsights.captureId, captureId), tenantScope(marketplaceCaptureInsights, auth)))
    .orderBy(desc(marketplaceCaptureInsights.createdAt));
  return rows.map(sanitizeInsightRow);
}

export async function listMarketplaceInsightsByProduct(productId: string, auth: MarketplaceInsightAuth) {
  const db = getDb();
  let productBundle: Awaited<ReturnType<typeof getMarketplaceProductWithAccess>>;
  try {
    productBundle = await getMarketplaceProductWithAccess(productId, auth);
  } catch {
    throw marketplaceCaptureError("marketplace_product_not_found", "Marketplace product not found", 404);
  }
  const product = productBundle.product;
  const ownerScope = and(
    eq(marketplaceCaptureInsights.userId, product.userId),
    product.tenantId
      ? eq(marketplaceCaptureInsights.tenantId, product.tenantId)
      : isNull(marketplaceCaptureInsights.tenantId),
  );
  const rows = await db.select().from(marketplaceCaptureInsights)
    .where(and(
      ownerScope,
      or(
        eq(marketplaceCaptureInsights.productId, productId),
        product.captureId
          ? eq(marketplaceCaptureInsights.captureId, product.captureId)
          : undefined,
        and(
          eq(marketplaceCaptureInsights.platform, product.platform),
          eq(marketplaceCaptureInsights.sourceUrl, product.sourceUrl),
        ),
      ),
    ))
    .orderBy(desc(marketplaceCaptureInsights.createdAt));
  return rows.map(sanitizeInsightRow);
}

export async function applyMarketplaceClaimResolution(input: unknown, auth: MarketplaceInsightAuth) {
  const parsed = marketplaceClaimResolutionSchema.parse(input);
  const insight = await getMarketplaceInsightForUser(parsed.insightId, auth);
  const resolutions = Array.isArray(insight.claimResolutionsJson) ? insight.claimResolutionsJson : [];
  const nextResolution = {
    claimId: parsed.claimId,
    decision: parsed.decision,
    editedText: parsed.editedText ?? null,
    reason: parsed.reason ?? null,
    resolvedAt: new Date().toISOString(),
    resolvedByUserId: auth.userId,
  };
  const payload = { ...(insight.payloadJson as Record<string, any>) };
  if (Array.isArray(payload.claims)) {
    payload.claims = payload.claims.map((claim: any) => {
      if (claim?.id !== parsed.claimId) return claim;
      if (parsed.decision === "remove") return { ...claim, status: "removed" };
      if (parsed.decision === "approve") return { ...claim, status: "user_approved" };
      if (parsed.decision === "edit") return { ...claim, text: parsed.editedText ?? claim.text, status: "user_approved", previousText: claim.text };
      return { ...claim, status: "needs_review" };
    });
  }
  const readiness = getStorytellingReadiness(payload);
  const db = getDb();
  await db.update(marketplaceCaptureInsights)
    .set({
      payloadJson: payload,
      claimResolutionsJson: [...resolutions, nextResolution],
      status: readiness === "ready_for_storytelling" ? "ready" : "needs_review",
      storytellingReadiness: readiness ?? insight.storytellingReadiness,
      updatedAt: new Date(),
    })
    .where(and(eq(marketplaceCaptureInsights.id, parsed.insightId), tenantScope(marketplaceCaptureInsights, auth)));
  return {
    ok: true,
    insightId: parsed.insightId,
    claimId: parsed.claimId,
    status: readiness === "ready_for_storytelling" ? "ready" : "needs_review",
    storytellingReadiness: readiness ?? insight.storytellingReadiness,
  };
}

function attachSyncMetadata(payload: Record<string, unknown>, metadata: MarketplaceCaptureInsightSyncInput["metadata"]) {
  const hasUsefulMetadata = metadata
    && (metadata.inputEvidenceIds.length > 0
      || metadata.selectedImageQuality.length > 0
      || metadata.dataQualityWarnings.length > 0
      || Boolean(metadata.storyOptionCount || metadata.storyOptionVideoBriefCount)
      || Boolean(metadata.providerDecision || metadata.sanitizerVersion || metadata.generationRunId || metadata.sourceIds));
  return hasUsefulMetadata ? { ...payload, __syncMetadata: metadata } : payload;
}

function normalizeInsightPayloadForPersistence(payload: unknown, insightType: string, metadata: MarketplaceCaptureInsightSyncInput["metadata"]): Record<string, unknown> {
  const value = payload && typeof payload === "object" ? { ...(payload as Record<string, any>) } : {};
  if (insightType !== "storytelling_handoff") return attachSyncMetadata(value, metadata);
  const parsed = marketplaceStorytellingHandoffSchema.parse(value);
  const unsafeClaim = parsed.claims.some((claim) => !["supported", "user_approved"].includes(claim.status) || claim.evidenceIds.length === 0);
  const unsafeImage = parsed.selectedImages.some((image) => image.fidelity === "mismatch_risk");
  const blockers = new Set(parsed.blockers);
  if (unsafeClaim) blockers.add("unsupported_claims_need_review");
  if (unsafeImage) blockers.add("product_image_mismatch_risk");
  if (parsed.selectedImages.length === 0) blockers.add("missing_selected_product_image");
  const readiness = blockers.size === 0
    ? parsed.readiness
    : parsed.readiness === "ready_for_storytelling"
      ? "needs_user_review"
      : parsed.readiness;
  return attachSyncMetadata({
    ...parsed,
    readiness,
    blockers: Array.from(blockers),
  }, metadata);
}

export async function buildBasicStorytellingHandoffFromCapture(captureId: string, auth: MarketplaceInsightAuth) {
  const { capture } = await getMarketplaceCaptureForUser(captureId, auth);
  const raw = (capture.rawPayloadJson ?? {}) as Record<string, any>;
  const images = Array.isArray(capture.imageCandidatesJson) ? capture.imageCandidatesJson as any[] : [];
  const productName = String(raw.productName ?? capture.pageTitle ?? "Untitled product").slice(0, 300);
  const selectedImages = images
    .filter((img) => img?.selected !== false && img?.kind !== "related")
    .slice(0, 12)
    .map((img, index) => ({
      url: String(img.url ?? ""),
      role: index === 0 ? "hero" : "detail",
      fidelity: "likely_product",
    }))
    .filter((img) => img.url);
  return {
    schemaVersion: "1.0",
    sourceCaptureIds: [capture.id],
    insightIds: [],
    productName,
    sourceUrl: capture.sourceUrl,
    platform: capture.platform,
    storyFormat: "sales_demo",
    readiness: selectedImages.length > 0 ? "ready_with_warnings" : "insufficient_evidence",
    blockers: selectedImages.length > 0 ? ["missing_local_or_server_insight"] : ["missing_selected_product_image", "missing_local_or_server_insight"],
    customerJourneyStages: ["awareness", "consideration", "proof_review_demo", "conversion_cta"],
    claims: [],
    selectedImages,
    evidenceIds: ["raw_payload"],
    confidence: selectedImages.length > 0 ? 0.45 : 0.2,
  };
}
