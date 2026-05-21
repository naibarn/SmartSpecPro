import { describe, expect, it } from "vitest";
import {
  parseDiscountPercent,
  parseShopeeProductUrl,
  parseShopeeIds,
  parseTikTokShopUrl,
  parseSoldCount,
  parseThaiPrice,
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
    expect(parseTikTokShopUrl("https://www.tiktok.com/shop/th/pdp/1735105127894976061")).toMatchObject({
      productId: "1735105127894976061",
      region: "th",
      format: "pdp_url",
      canonicalUrl: "https://www.tiktok.com/shop/th/pdp/1735105127894976061",
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
});
