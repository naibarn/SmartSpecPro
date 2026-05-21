import type { CategoryProductCandidate } from "../../shared/types";
import { parseDiscountPercent, parseShopeeProductUrl, parseSoldCount, parseThaiPrice } from "../utils/number";

function rectLike(rect: DOMRect): Record<string, number> {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom };
}

function closestCard(anchor: HTMLAnchorElement): HTMLElement {
  let node: HTMLElement | null = anchor;
  for (let i = 0; i < 5 && node?.parentElement; i += 1) {
    const rect = node.getBoundingClientRect();
    if (rect.width >= 120 && rect.height >= 160) return node;
    node = node.parentElement;
  }
  return anchor;
}

function scoreCandidate(input: {
  soldCountNormalized: number | null;
  priceCurrent: number | null;
  discountPercent: number | null;
  isMall: boolean;
  hasFreeShippingBadge: boolean;
  hasClearImage: boolean;
  rankOnPage: number;
}) {
  let score = 0;
  const reasons: string[] = [];
  if (input.soldCountNormalized != null && input.soldCountNormalized > 0) {
    score += Math.min(40, Math.log10(input.soldCountNormalized + 1) * 8);
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
  if (input.rankOnPage <= 10) {
    score += 5;
    reasons.push("อยู่ในอันดับบนของหน้า");
  }
  return { score: Math.round(Math.min(100, score)), reasons };
}

export function scanShopeeCategoryPage(limit = 60): CategoryProductCandidate[] {
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .filter((a) => /i\.\d+\.\d+/.test(a.href) || /\/product\/\d+\/\d+/.test(a.href))
    .slice(0, limit);
  const seen = new Set<string>();
  const candidates: CategoryProductCandidate[] = [];

  for (const anchor of anchors) {
    const shopeeUrl = parseShopeeProductUrl(anchor.href);
    const canonicalUrl = shopeeUrl.canonicalUrl ?? shopeeUrl.cleanUrl;
    if (seen.has(canonicalUrl)) continue;
    seen.add(canonicalUrl);
    const card = closestCard(anchor);
    const text = card.innerText || anchor.innerText || "";
    const title = text.split("\n").map((line) => line.trim()).find((line) => line.length > 8 && !line.startsWith("฿")) || anchor.title || anchor.href;
    const priceText = text.match(/฿\s?[\d,.]+/)?.[0] ?? null;
    const soldCountText = text.match(/(?:ขายแล้ว|sold)\s?[^\n\r|]+/i)?.[0] ?? null;
    const discountText = text.match(/-\d+%/)?.[0] ?? null;
    const originalPriceText = text.match(/฿\s?[\d,.]+(?=.*฿\s?[\d,.]+)/)?.[0] ?? null;
    const ratingText = text.match(/\b\d(?:\.\d)?\b(?=\s*(?:ดาว|stars?|rating)?)/i)?.[0] ?? null;
    const image = card.querySelector<HTMLImageElement>("img[src], img[srcset]");
    const imageUrl = image?.currentSrc || image?.src || null;
    const isMall = /mall|official|ร้านแนะนำ|preferred/i.test(text);
    const hasFreeShippingBadge = /ส่งฟรี|free shipping|โค้ดส่งฟรี|voucher/i.test(text);
    const isSponsored = /โฆษณา|sponsored/i.test(text);
    const score = scoreCandidate({
      soldCountNormalized: parseSoldCount(soldCountText),
      priceCurrent: parseThaiPrice(priceText),
      discountPercent: parseDiscountPercent(discountText),
      isMall,
      hasFreeShippingBadge,
      hasClearImage: Boolean(imageUrl),
      rankOnPage: candidates.length + 1,
    });

    candidates.push({
      platform: "shopee",
      sourceUrl: location.href,
      externalProductId: shopeeUrl.itemId,
      externalShopId: shopeeUrl.shopId,
      title,
      url: canonicalUrl,
      priceText,
      originalPriceText,
      discountText,
      soldCountText,
      ratingText,
      imageUrl,
      badges: [
        isMall ? "mall_or_official" : "",
        hasFreeShippingBadge ? "free_shipping_or_promotion" : "",
        isSponsored ? "sponsored" : "",
      ].filter(Boolean),
      position: candidates.length,
      boundingBox: rectLike(card.getBoundingClientRect()),
      score: score.score,
      scoreReasons: score.reasons,
      originalUrl: shopeeUrl.originalUrl,
      cleanUrl: shopeeUrl.cleanUrl,
      canonicalUrl: shopeeUrl.canonicalUrl,
      urlFormat: shopeeUrl.format,
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}
