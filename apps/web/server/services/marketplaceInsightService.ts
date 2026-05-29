import crypto from "node:crypto";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { getDb } from "../db";
import { marketplaceCaptureInsights, marketplaceCaptureSessions, marketplaceProducts } from "../../drizzle/schema";
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
  const normalized = productBriefSchema.parse({
    schemaVersion: "1.0",
    source: { platform: source.platform, captureId: source.captureId, url: source.sourceUrl, affiliateUrl: source.affiliateUrl ?? null },
    productName: cleanText(raw.productName || source.product.title || source.pageTitle, 300) || "Untitled product",
    category: cleanText(raw.category || source.product.category, 200) || undefined,
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

function buildServerProductBriefPrompt(source: SanitizedLocalAIInput, languagePreference: string) {
  return [
    "You are SmartSpecPro server AI fallback for marketplace capture insights.",
    "Task: create a ProductBrief JSON object from sanitized marketplace evidence.",
    `Required output language: ${languagePreference === "auto" ? "match source language; prefer concise Thai when source is Thai" : languagePreference}.`,
    "Rules: use only provided data, do not invent claims, return JSON only, include evidenceIds that exist in the evidence list.",
    "Price rule: if you mention price, use only source.product.price exactly. Do not infer price from description text, SKU codes, promotion text, or unrelated numbers.",
    `Sanitized input:\n${JSON.stringify(source, null, 2).slice(0, 25_000)}`,
  ].join("\n\n");
}

async function maybeRunServerProductBriefLlm(source: SanitizedLocalAIInput, languagePreference: string): Promise<ProductBrief | null> {
  if (process.env.MARKETPLACE_CAPTURE_LLM_ENABLED !== "true") return null;
  const token = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN || process.env.WEB_GATEWAY_TOKEN;
  if (!token) return null;
  const baseUrl = (process.env.MARKETPLACE_CAPTURE_LLM_GATEWAY_URL || process.env.PUBLIC_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, "");
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
        { role: "user", content: buildServerProductBriefPrompt(source, languagePreference) },
      ],
      temperature: 0,
    }),
  });
  if (!response.ok) throw new Error(`gateway_${response.status}`);
  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("missing_llm_content");
  return normalizeProductBriefFromServer(parseLlmJson(content), source);
}

export async function generateMarketplaceServerInsight(input: unknown, _auth: MarketplaceInsightAuth): Promise<MarketplaceServerInsightGenerationResponse> {
  const parsed = marketplaceServerInsightGenerationSchema.parse(input);
  try {
    const llmBrief = await maybeRunServerProductBriefLlm(parsed.source, parsed.languagePreference);
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
  const [product] = await db.select({
    id: marketplaceProducts.id,
    platform: marketplaceProducts.platform,
    sourceUrl: marketplaceProducts.sourceUrl,
  }).from(marketplaceProducts)
    .where(and(eq(marketplaceProducts.id, productId), tenantScope(marketplaceProducts, auth)))
    .limit(1);
  if (!product) throw marketplaceCaptureError("marketplace_product_not_found", "Marketplace product not found", 404);
  const rows = await db.select().from(marketplaceCaptureInsights)
    .where(and(
      tenantScope(marketplaceCaptureInsights, auth),
      or(
        eq(marketplaceCaptureInsights.productId, productId),
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
