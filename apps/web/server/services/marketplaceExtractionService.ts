import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { marketplaceCaptureSessions } from "../../drizzle/schema";
import {
  analyzeMarketplaceCaptureSchema,
  normalizeTextSnippet,
  parseDiscountPercent,
  parseSoldCount,
  parseThaiPrice,
} from "@shared/marketplaceCapture";
import { getMarketplaceCaptureForUser } from "./marketplaceCaptureService";
import { buildMarketplaceExtractionPrompt } from "./marketplacePromptService";

function matchFirst(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1]) return normalizeTextSnippet(m[1], 500);
  }
  return null;
}

function extractTitle(capture: any, domText: string): string | null {
  const raw = String(capture.rawPayloadJson?.productName ?? capture.rawPayloadJson?.title ?? "").trim();
  if (raw) return raw.slice(0, 1000);
  const firstLine = domText.split(/\n+/).map((line) => line.trim()).find((line) => line.length >= 8 && !/^฿/.test(line));
  return firstLine ? firstLine.slice(0, 1000) : capture.pageTitle ?? null;
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

function clampConfidence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function isGenericMarketplaceCategory(value: unknown): boolean {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return true;
  if (/^(?:หมวดหมู่\s*)?(?:Shopee|TikTok Shop)$/i.test(text)) return true;
  if (/^(?:Category|Marketplace|Uncategorized)$/i.test(text)) return true;
  return false;
}

function normalizeLlmResult(parsed: Record<string, unknown>, fallback: Record<string, any>) {
  const parsedAffiliateUrl = typeof (parsed as any).affiliateUrl === "string" && (parsed as any).affiliateUrl.trim()
    ? (parsed as any).affiliateUrl.trim()
    : null;
  const confidence = {
    ...fallback.confidence,
    ...((parsed as any).confidence ?? {}),
  };
  for (const key of Object.keys(confidence)) confidence[key] = clampConfidence(confidence[key]);

  const images = {
    ...fallback.images,
    ...((parsed as any).images ?? {}),
  };
  if (!Array.isArray(images.main) || images.main.length === 0) images.main = fallback.images?.main ?? [];
  if (!Array.isArray(images.description)) images.description = fallback.images?.description ?? [];
  if (!Array.isArray(images.review)) images.review = fallback.images?.review ?? [];
  if (!Array.isArray(images.excludedRelated)) images.excludedRelated = fallback.images?.excludedRelated ?? [];

  const parsedSpecs = (parsed as any).specs && typeof (parsed as any).specs === "object" ? (parsed as any).specs : {};
  const fallbackSpecs = fallback.specs ?? {};
  const specs = {
    ...fallbackSpecs,
    ...parsedSpecs,
    categoryText: isGenericMarketplaceCategory(parsedSpecs.categoryText) ? fallbackSpecs.categoryText ?? null : parsedSpecs.categoryText,
  };

  return {
    ...fallback,
    ...parsed,
    affiliateUrl: parsedAffiliateUrl ?? fallback.affiliateUrl ?? null,
    specs,
    confidence,
    images,
    extractionMode: "llm_gateway",
    warnings: Array.isArray((parsed as any).warnings) ? (parsed as any).warnings : fallback.warnings ?? [],
  };
}

export async function analyzeMarketplaceCapture(captureId: string, input: unknown, auth: { userId: number }) {
  analyzeMarketplaceCaptureSchema.parse(input);
  const { capture, assets } = await getMarketplaceCaptureForUser(captureId, auth);
  const db = getDb();
  await db.update(marketplaceCaptureSessions)
    .set({ status: "analyzing", updatedAt: new Date() })
    .where(eq(marketplaceCaptureSessions.id, captureId));

  const domText = normalizeTextSnippet(capture.rawDomText ?? "", 80_000);
  const raw = (capture.rawPayloadJson ?? {}) as Record<string, any>;
  const imageCandidates = Array.isArray(capture.imageCandidatesJson) ? capture.imageCandidatesJson as any[] : [];
  const productName = extractTitle(capture, domText);
  const priceRaw = String(raw.priceCurrentText ?? raw.priceText ?? matchFirst(domText, [/(฿\s*[\d,.]+)/]) ?? "");
  const soldText = String(raw.soldCountText ?? matchFirst(domText, [/(ขายแล้ว\s*[^\n\r|]+)/, /(sold\s*[^\n\r|]+)/i]) ?? "");
  const discountText = String(raw.discountText ?? matchFirst(domText, [/(-\d+%)/]) ?? "");
  const ratingScoreText = String(raw.ratingScoreText ?? matchFirst(domText, [/(\d(?:\.\d)?)\s*(?:ดาว|stars?)/i]) ?? "");
  const categoryText = isGenericMarketplaceCategory(raw.categoryText) ? null : raw.categoryText ?? null;
  const affiliateUrl = typeof raw.affiliateUrl === "string" && raw.affiliateUrl.trim()
    ? raw.affiliateUrl.trim()
    : capture.affiliateUrl ?? null;
  const mainImages = imageCandidates
    .filter((img) => img && (img.kind === "main" || img.kind === "unknown"))
    .map((img) => String(img.url || ""))
    .filter(Boolean)
    .slice(0, 20);
  const descriptionImages = imageCandidates
    .filter((img) => img && img.kind === "description")
    .map((img) => String(img.url || ""))
    .filter(Boolean)
    .slice(0, 20);
  const reviewImages = imageCandidates
    .filter((img) => img && img.kind === "review")
    .map((img) => String(img.url || ""))
    .filter(Boolean)
    .slice(0, 30);

  const current = parseThaiPrice(priceRaw);
  const soldCountNormalized = parseSoldCount(soldText);
  const scoreMatch = ratingScoreText.match(/\d(?:\.\d+)?/);
  const ratingScore = scoreMatch ? Number(scoreMatch[0]) : null;
  const warnings: string[] = [];
  if (!productName) warnings.push("ไม่พบ product name ที่มั่นใจได้");
  if (current == null && priceRaw) warnings.push("พบข้อความราคาแต่ parse เป็นตัวเลขไม่ได้");
  if (mainImages.length === 0) warnings.push("ไม่มี main image ที่ user เลือกไว้ใน payload");

  const result = {
    platform: capture.platform,
    sourceUrl: capture.sourceUrl,
    affiliateUrl,
    externalProductId: capture.externalProductId,
    externalShopId: capture.externalShopId,
    productName,
    brand: raw.brand ?? null,
    shop: {
      name: raw.shopName ?? null,
      isMall: raw.isMall ?? null,
    },
    price: {
      current,
      original: parseThaiPrice(String(raw.priceOriginalText ?? "")),
      currency: "THB",
      discountText: discountText || null,
      discountPercent: parseDiscountPercent(discountText),
      rawText: priceRaw || null,
    },
    commissionRatePercent: typeof raw.commissionRatePercent === "number" && raw.commissionRatePercent >= 0 && raw.commissionRatePercent <= 100
      ? raw.commissionRatePercent
      : null,
    rating: {
      score: Number.isFinite(ratingScore) ? ratingScore : null,
      reviewCountText: raw.reviewCountText ?? null,
      soldCountText: soldText || null,
      soldCountNormalized,
    },
    description: {
      rawText: normalizeTextSnippet(String(raw.descriptionText ?? ""), 40_000),
      summary: "",
      ingredients: [],
      claims: [],
      registrationNo: null,
      volume: null,
      shelfLife: null,
      warnings: [],
    },
    images: {
      main: mainImages,
      description: descriptionImages,
      review: reviewImages,
      excludedRelated: imageCandidates.filter((img) => img?.kind === "related").map((img) => img.url).filter(Boolean),
    },
    specs: {
      categoryText,
      stockText: raw.stockText ?? null,
      variantsText: raw.variantsText ?? null,
      sellerLocationText: raw.sellerLocationText ?? null,
    },
    confidence: {
      productName: productName ? 0.75 : 0,
      price: current != null ? 0.8 : 0.2,
      rating: ratingScore != null ? 0.55 : 0,
      soldCount: soldCountNormalized != null ? 0.7 : 0,
      description: raw.descriptionText ? 0.7 : 0.2,
      images: mainImages.length > 0 ? 0.8 : 0,
    },
    evidence: {
      productName: ["dom:product_header", "raw_payload"],
      price: ["dom:product_header"],
      rating: ["dom:product_header"],
      soldCount: ["dom:product_header"],
      description: ["dom:description"],
      images: ["user_selected_image_candidates", ...assets.map((asset) => `asset:${asset.id}`)],
    },
    warnings,
    extractionMode: "deterministic_fallback",
  };

  const llmResult = await maybeRunMarketplaceLlm({
    userId: auth.userId,
    capture,
    domText,
    imageCandidates,
    fallback: result,
  });

  await db.update(marketplaceCaptureSessions)
    .set({
      status: "analyzed",
      llmResultJson: llmResult,
      normalizedResultJson: llmResult,
      confidenceJson: (llmResult as any).confidence ?? result.confidence,
      validationWarningsJson: (llmResult as any).warnings ?? warnings,
      updatedAt: new Date(),
    })
    .where(eq(marketplaceCaptureSessions.id, captureId));

  return {
    captureId,
    status: "analyzed",
    llmResult,
    previewUrl: `/marketplace-capture/captures/${captureId}/preview`,
  };
}

async function maybeRunMarketplaceLlm(input: {
  userId: number;
  capture: any;
  domText: string;
  imageCandidates: unknown;
  fallback: Record<string, unknown>;
}) {
  if (process.env.MARKETPLACE_CAPTURE_LLM_ENABLED !== "true") return input.fallback;
  const token = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN || process.env.WEB_GATEWAY_TOKEN;
  if (!token) return { ...input.fallback, warnings: [...((input.fallback as any).warnings ?? []), "LLM disabled: missing gateway token"] };
  try {
    const baseUrl = (process.env.MARKETPLACE_CAPTURE_LLM_GATEWAY_URL || process.env.PUBLIC_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, "");
    const prompt = buildMarketplaceExtractionPrompt({
      platform: input.capture.platform,
      sourceUrl: input.capture.sourceUrl,
      domText: input.domText,
      htmlBlocks: input.capture.htmlBlocksJson,
      imageCandidates: input.imageCandidates,
    });
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: process.env.MARKETPLACE_CAPTURE_LLM_MODEL || "gpt-4.1-mini",
        messages: [
          { role: "system", content: "Return valid JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0,
      }),
    });
    if (!response.ok) throw new Error(`gateway_${response.status}`);
    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? parseLlmJson(content) : null;
    if (!parsed || typeof parsed !== "object") throw new Error("invalid_llm_json");
    return normalizeLlmResult(parsed, input.fallback as Record<string, any>);
  } catch (error: any) {
    return {
      ...input.fallback,
      warnings: [...((input.fallback as any).warnings ?? []), `LLM fallback used: ${String(error?.message ?? error).slice(0, 160)}`],
    };
  }
}
