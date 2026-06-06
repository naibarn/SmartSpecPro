import { describe, expect, it } from "vitest";
import {
  parseDiscountPercent,
  parseShopeeProductUrl,
  parseShopeeIds,
  parseTikTokShopUrl,
  parseSoldCount,
  parseThaiPrice,
  marketplaceCaptureInsightSyncSchema,
  marketplaceConfirmProductSchema,
  marketplaceServerInsightGenerationSchema,
  marketplaceServerInsightGenerationResponseSchema,
  marketplaceStorytellingHandoffSchema,
  productBriefSchema,
  sanitizedLocalAIInputSchema,
  scoreCandidate,
} from "./marketplaceCapture";

describe("marketplace capture parsers", () => {
  it("parses Thai marketplace price text", () => {
    expect(parseThaiPrice("฿74")).toBe(74);
    expect(parseThaiPrice("฿ 1,250.50")).toBe(1250.5);
    expect(parseThaiPrice("no price")).toBeNull();
  });

  it("parses Thai and English sold count shorthand conservatively", () => {
    expect(parseSoldCount("ขายแล้ว 100+ ชิ้น")).toBe(100);
    expect(parseSoldCount("sold 1.2k+")).toBe(1200);
    expect(parseSoldCount("ขายแล้ว 3พัน+ ชิ้น")).toBe(3000);
    expect(parseSoldCount("ขายแล้ว 2ล้าน+ ชิ้น")).toBe(2000000);
  });

  it("parses discount percent and Shopee ids", () => {
    expect(parseDiscountPercent("-90%")).toBe(90);
    expect(parseShopeeIds("https://shopee.co.th/product-name-i.12345.98765")).toEqual({ shopId: "12345", itemId: "98765" });
  });

  it("parses Shopee SEO and product URLs with canonical URL", () => {
    const seo = parseShopeeProductUrl("https://shopee.co.th/-%E0%B8%A1%E0%B8%B5-Colgate-i.43431223.24360295261?sp_atk=x#hash");
    expect(seo).toMatchObject({
      shopId: "43431223",
      itemId: "24360295261",
      format: "seo_url",
      cleanUrl: "https://shopee.co.th/-%E0%B8%A1%E0%B8%B5-Colgate-i.43431223.24360295261",
      canonicalUrl: "https://shopee.co.th/product/43431223/24360295261",
    });

    const product = parseShopeeProductUrl("https://shopee.co.th/product/43431223/24360295261");
    expect(product).toMatchObject({
      shopId: "43431223",
      itemId: "24360295261",
      format: "product_url",
      canonicalUrl: "https://shopee.co.th/product/43431223/24360295261",
    });

    const provided = parseShopeeProductUrl("https://shopee.co.th/-%E0%B8%A1%E0%B8%B5-4-%E0%B9%81%E0%B8%9E%E0%B9%87%E0%B8%84%E0%B9%83%E0%B8%AB%E0%B9%89%E0%B9%80%E0%B8%A5%E0%B8%B7%E0%B8%AD%E0%B8%81-%E0%B8%A2%E0%B8%B2%E0%B8%AA%E0%B8%B5%E0%B8%9F%E0%B8%B1%E0%B8%99-%E0%B8%84%E0%B8%AD%E0%B8%A5%E0%B9%80%E0%B8%81%E0%B8%95-%E0%B8%AD%E0%B9%8A%E0%B8%AD%E0%B8%9E%E0%B8%95%E0%B8%B4%E0%B8%84-%E0%B9%84%E0%B8%A7%E0%B8%97%E0%B9%8C-%E0%B9%80%E0%B8%9E%E0%B8%AD%E0%B8%A3%E0%B9%8C%E0%B9%80%E0%B8%9E%E0%B8%B4%E0%B8%A5-100-%E0%B8%81%E0%B8%A3%E0%B8%B1%E0%B8%A1-Colgate-Optic-White-Purple-100g-i.43431223.24360295261");
    expect(provided.shopId).toBe("43431223");
    expect(provided.itemId).toBe("24360295261");
    expect(provided.format).toBe("seo_url");
    expect(provided.canonicalUrl).toBe("https://shopee.co.th/product/43431223/24360295261");
  });

  it("parses TikTok Shop home, category, pdp, and view product URLs", () => {
    expect(parseTikTokShopUrl("https://www.tiktok.com/shop/th?source=ecommerce_shoppingguide")).toMatchObject({
      productId: null,
      categorySlug: null,
      categoryId: null,
      region: "th",
      format: "shop_home",
      canonicalUrl: "https://www.tiktok.com/shop/th",
    });
    expect(parseTikTokShopUrl("https://www.tiktok.com/shop/th/c/home-supplies/600001")).toMatchObject({
      productId: null,
      categorySlug: "home-supplies",
      categoryId: "600001",
      region: "th",
      format: "category_url",
      canonicalUrl: "https://www.tiktok.com/shop/th/c/home-supplies/600001",
    });
    expect(parseTikTokShopUrl("https://shop.tiktok.com/th/c/baby-maternity/602284?source=ecommerce_mall")).toMatchObject({
      productId: null,
      categorySlug: "baby-maternity",
      categoryId: "602284",
      region: "th",
      format: "category_url",
      canonicalUrl: "https://shop.tiktok.com/th/c/baby-maternity/602284",
    });
    expect(parseTikTokShopUrl("https://www.tiktok.com/shop/th/pdp/1735105127894976061")).toMatchObject({
      productId: "1735105127894976061",
      region: "th",
      format: "pdp_url",
      canonicalUrl: "https://www.tiktok.com/shop/th/pdp/1735105127894976061",
    });
    expect(parseTikTokShopUrl("https://shop.tiktok.com/th/pdp/demo-product/1735105127894976061")).toMatchObject({
      productId: "1735105127894976061",
      region: "th",
      format: "pdp_url",
      canonicalUrl: "https://shop.tiktok.com/th/pdp/1735105127894976061",
    });
    expect(parseTikTokShopUrl("https://www.tiktok.com/view/product/1729798722653554943?region=TH&locale=th-TH")).toMatchObject({
      productId: "1729798722653554943",
      format: "view_product_url",
      canonicalUrl: "https://www.tiktok.com/view/product/1729798722653554943",
    });
  });

  it("scores a strong category candidate with reasons", () => {
    const result = scoreCandidate({
      soldCountNormalized: 100000,
      priceCurrent: 74,
      discountPercent: 90,
      isMall: true,
      hasFreeShippingBadge: false,
      hasClearImage: true,
      rankOnPage: 3,
      titleKeywordMatches: 2,
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.reasons.join(" ")).toContain("ยอดขายสูง");
  });

  it("validates local AI sanitized input and rejects raw tiktok platform", () => {
    expect(sanitizedLocalAIInputSchema.parse({
      schemaVersion: "1.0",
      platform: "tiktok_shop",
      sourceUrl: "https://www.tiktok.com/shop/th/pdp/1735105127894976061",
      capturedAt: new Date().toISOString(),
      product: { title: "Demo", selectedImageUrls: [], commissionRatePercent: 12.5 },
      reviews: [],
      comments: [],
      evidence: [{ id: "title:product", type: "title", text: "Demo" }],
      payloadHash: "hash_12345678",
    }).platform).toBe("tiktok_shop");

    expect(() => sanitizedLocalAIInputSchema.parse({
      schemaVersion: "1.0",
      platform: "tiktok",
      sourceUrl: "https://www.tiktok.com/shop/th",
      capturedAt: new Date().toISOString(),
      product: { selectedImageUrls: [] },
      reviews: [],
      comments: [],
      evidence: [],
      payloadHash: "hash_12345678",
    })).toThrow();
  });

  it("validates optional user-entered commission rate percentage", () => {
    const payload = marketplaceConfirmProductSchema.parse({
      product: {
        productName: "Demo product",
        commissionRatePercent: 12.5,
      },
    });
    expect(payload.product.commissionRatePercent).toBe(12.5);
    expect(() => marketplaceConfirmProductSchema.parse({
      product: {
        productName: "Demo product",
        commissionRatePercent: 120,
      },
    })).toThrow();
  });

  it("validates product brief and insight sync payloads", () => {
    const brief = productBriefSchema.parse({
      schemaVersion: "1.0",
      source: { platform: "shopee", captureId: "cap_1", url: "https://shopee.co.th/product/1/2" },
      productName: "Demo product",
      shortSummary: "Short summary",
      keySellingPoints: ["point"],
      targetAudiences: [],
      buyerPainPoints: [],
      buyerObjections: [],
      trustSignals: [],
      contentAngles: [],
      suggestedHooks: [],
      suggestedCTAs: [],
      confidence: 0.8,
      evidenceIds: ["title:product"],
    });
    const sync = marketplaceCaptureInsightSyncSchema.parse({
      extensionVersion: "0.1.16",
      idempotencyKey: "idem_12345678",
      schemaVersion: "1.0",
      insightCreatedAt: new Date().toISOString(),
      payloadHash: "payload_hash_12345678",
      source: {
        platform: "shopee",
        url: "https://shopee.co.th/product/1/2",
        capturedAt: new Date().toISOString(),
        captureId: "cap_1",
      },
      insightType: "product_brief",
      provider: "chrome_prompt_api",
      metadata: {
        semanticKey: "shopee:source-hash:product_brief:chrome_prompt_api:v1:payload-hash",
        semanticPayloadHash: "payload-hash",
        sourceIdentityHash: "source-hash",
        sourceIdentity: {
          platform: "shopee",
          canonicalSourceUrl: "https://shopee.co.th/product/1/2",
          externalShopId: "1",
          externalProductId: "2",
        },
      },
      payload: brief,
      rawCaptureIncluded: false,
    });
    expect(sync.insightType).toBe("product_brief");
    expect(sync.metadata.semanticKey).toContain("product_brief");
    expect(sync.metadata.sourceIdentity?.canonicalSourceUrl).toBe("https://shopee.co.th/product/1/2");
  });

  it("validates server AI generation request and response contracts", () => {
    const source = sanitizedLocalAIInputSchema.parse({
      schemaVersion: "1.0",
      platform: "shopee",
      sourceUrl: "https://shopee.co.th/product/1/2",
      capturedAt: new Date().toISOString(),
      product: { title: "Demo", selectedImageUrls: [] },
      reviews: [],
      comments: [],
      evidence: [{ id: "title:product", type: "title", text: "Demo" }],
      payloadHash: "payload_hash_12345678",
    });
    const request = marketplaceServerInsightGenerationSchema.parse({
      extensionVersion: "0.1.16",
      insightType: "product_brief",
      languagePreference: "th",
      source,
    });
    const payload = productBriefSchema.parse({
      schemaVersion: "1.0",
      source: { platform: "shopee", url: "https://shopee.co.th/product/1/2" },
      productName: "Demo",
      shortSummary: "สินค้า demo",
      keySellingPoints: ["ราคาอ่านได้"],
      targetAudiences: [],
      buyerPainPoints: [],
      buyerObjections: [],
      trustSignals: [],
      contentAngles: [],
      suggestedHooks: [],
      suggestedCTAs: [],
      confidence: 0.7,
      evidenceIds: ["title:product"],
    });
    const response = marketplaceServerInsightGenerationResponseSchema.parse({
      ok: true,
      provider: "server_ai",
      insightType: "product_brief",
      fallbackMode: "deterministic_fallback",
      payload,
    });
    expect(request.source.platform).toBe("shopee");
    expect(response.payload?.productName).toBe("Demo");
  });

  it("validates storytelling handoff readiness gates", () => {
    const handoff = marketplaceStorytellingHandoffSchema.parse({
      schemaVersion: "1.0",
      sourceCaptureIds: ["cap_1"],
      insightIds: ["ins_1"],
      productName: "Demo product",
      sourceUrl: "https://shopee.co.th/product/1/2",
      platform: "shopee",
      storyFormat: "sales_demo",
      readiness: "needs_user_review",
      blockers: ["unsupported_claims_need_review"],
      customerJourneyStages: ["awareness", "consideration", "conversion_cta"],
      storyOptions: [{
        id: "story_option:problem_solution",
        title: "Problem -> Solution",
        audience: "ผู้ซื้อที่กำลังเปรียบเทียบสินค้า",
        customerNeed: "ต้องการแก้ปัญหาให้เร็วขึ้น",
        problemToSolve: "ยังไม่มั่นใจว่าสินค้าช่วยอะไร",
        useCase: "ใช้เมื่อลูกค้าต้องการเห็นประโยชน์หลักก่อนซื้อ",
        angle: "โชว์ประโยชน์และหลักฐานจากหน้าสินค้า",
        storyFormat: "customer_journey",
        journeyStages: ["problem_recognition", "consideration", "proof_review_demo", "conversion_cta"],
        hook: "ดูว่าสินค้านี้ช่วยอะไรได้บ้าง",
        storyboardOutline: ["เปิดด้วย pain point", "โชว์จุดเด่น", "เสริม proof", "ปิด CTA"],
        primaryClaimIds: ["claim:1"],
        evidenceIds: [],
        confidence: 0.62,
        autoSelected: true,
        decisionReason: "เลือกอัตโนมัติจาก confidence สูงสุด",
        videoBrief: {
          schemaVersion: "1.0",
          durationSec: 30,
          aspectRatio: "9:16",
          language: "th",
          structureLabel: "30 วินาที | 3 Shot | Shot ละ 10 วินาที",
          noOnScreenText: true,
          shots: [
            {
              order: 1,
              startSec: 0,
              endSec: 10,
              title: "เปิดปัญหา",
              videoPrompt: "Vertical video 9:16, realistic home, no text on screen, no subtitles.",
              subShots: ["เห็นปัญหา", "คนลังเล", "Close-up ปัญหา"],
              thaiVoiceover: "พูดเป็นภาษาไทยว่า “ปัญหานี้แก้ได้ง่ายขึ้น”",
            },
            {
              order: 2,
              startSec: 10,
              endSec: 20,
              title: "โชว์ทางออก",
              videoPrompt: "Vertical video 9:16, realistic product demo, no text on screen, no subtitles.",
              subShots: ["หยิบสินค้า", "โชว์จุดเด่น", "ใช้จริง"],
              thaiVoiceover: "พูดเป็นภาษาไทยว่า “สินค้านี้ช่วยให้ใช้งานง่ายขึ้น”",
            },
            {
              order: 3,
              startSec: 20,
              endSec: 30,
              title: "สรุปผลลัพธ์",
              videoPrompt: "Vertical video 9:16, clean product ending, no text on screen, no subtitles.",
              subShots: ["หลังใช้", "สินค้าในบริบทจริง", "ปิด CTA"],
              thaiVoiceover: "พูดเป็นภาษาไทยว่า “ดูรายละเอียดสินค้าเพิ่มเติมได้เลย”",
            },
          ],
        },
      }],
      claims: [{ id: "claim:1", text: "Claim", evidenceIds: [], status: "needs_review", confidence: 0.4 }],
      selectedImages: [{ url: "https://img.example/demo.jpg", role: "hero", fidelity: "likely_product" }],
      evidenceIds: [],
      confidence: 0.4,
    });
    expect(handoff.readiness).toBe("needs_user_review");
    expect(handoff.storyOptions[0]?.autoSelected).toBe(true);
    expect(handoff.storyOptions[0]?.videoBrief?.shots).toHaveLength(3);
    expect(handoff.storyOptions[0]?.videoBrief?.shots[0]?.subShots).toHaveLength(3);
    const sync = marketplaceCaptureInsightSyncSchema.parse({
      extensionVersion: "0.1.34",
      idempotencyKey: "idem_storytelling_video_brief_12345678",
      schemaVersion: "1.0",
      insightCreatedAt: new Date().toISOString(),
      payloadHash: "payload_hash_story_video_12345678",
      source: {
        platform: "shopee",
        url: "https://shopee.co.th/product/1/2",
        capturedAt: new Date().toISOString(),
        captureId: "cap_1",
      },
      insightType: "storytelling_handoff",
      provider: "chrome_prompt_api",
      metadata: {
        storyOptionCount: 1,
        storyOptionVideoBriefCount: 1,
      },
      payload: handoff,
      rawCaptureIncluded: false,
    });
    expect(sync.payload.storyOptions[0]?.videoBrief?.shots[0]?.thaiVoiceover).toContain("พูดเป็นภาษาไทยว่า");
  });

  it("reports invalid local insight payload field details", () => {
    const parsed = marketplaceCaptureInsightSyncSchema.safeParse({
      extensionVersion: "0.1.19",
      idempotencyKey: "idem_storytelling_12345678",
      schemaVersion: "1.0",
      insightCreatedAt: new Date().toISOString(),
      payloadHash: "payload_hash_12345678",
      source: {
        platform: "shopee",
        url: "https://shopee.co.th/product/1/2",
        capturedAt: new Date().toISOString(),
      },
      insightType: "storytelling_handoff",
      provider: "chrome_prompt_api",
      payload: {
        schemaVersion: "1.0",
        sourceUrl: "https://shopee.co.th/product/1/2",
        platform: "shopee",
        storyOptions: [{ id: "old_cached_option", title: "Old cached option", journeyStages: ["awareness"] }],
      },
      rawCaptureIncluded: false,
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain("Invalid storytelling_handoff payload");
    expect(parsed.error?.issues[0]?.message).toContain("productName");
  });

  it("accepts configured localhost local AI providers for synced insights", () => {
    const brief = productBriefSchema.parse({
      schemaVersion: "1.0",
      source: { platform: "shopee", captureId: "cap_1", url: "https://shopee.co.th/product/1/2" },
      productName: "Demo product",
      shortSummary: "Short summary",
      keySellingPoints: ["point"],
      targetAudiences: [],
      buyerPainPoints: [],
      buyerObjections: [],
      trustSignals: [],
      contentAngles: [],
      suggestedHooks: [],
      suggestedCTAs: [],
      confidence: 0.8,
      evidenceIds: ["title:product"],
    });
    const sync = marketplaceCaptureInsightSyncSchema.parse({
      extensionVersion: "0.1.19",
      idempotencyKey: "idem_ollama_12345678",
      schemaVersion: "1.0",
      insightCreatedAt: new Date().toISOString(),
      payloadHash: "payload_hash_12345678",
      source: {
        platform: "shopee",
        url: "https://shopee.co.th/product/1/2",
        capturedAt: new Date().toISOString(),
        captureId: "cap_1",
      },
      insightType: "product_brief",
      provider: "ollama",
      payload: brief,
      rawCaptureIncluded: false,
    });
    expect(sync.provider).toBe("ollama");
  });
});
