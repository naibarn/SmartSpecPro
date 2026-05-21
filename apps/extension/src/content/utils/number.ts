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
  if (/m\+?/.test(text) || /ล้าน/.test(text)) return Math.round(value * 1_000_000);
  if (/k\+?/.test(text) || /พัน/.test(text)) return Math.round(value * 1_000);
  if (/หมื่น/.test(text)) return Math.round(value * 10_000);
  return Math.round(value);
}

export function parseShopeeIds(url: string): { shopId: string | null; itemId: string | null } {
  const parsed = parseShopeeProductUrl(url);
  return { shopId: parsed.shopId, itemId: parsed.itemId };
}

export type ShopeeUrlFormat = "seo_url" | "product_url" | "not_found";

export interface ShopeeProductIds {
  shopId: string | null;
  itemId: string | null;
  format: ShopeeUrlFormat;
  originalUrl: string;
  cleanUrl: string;
  canonicalUrl: string | null;
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
