import type { PageDetection } from "../../shared/types";

export function detectTikTokShopPage(): PageDetection {
  const host = location.hostname;
  const isTikTokShop = /shop\.tiktok\.com$/.test(host)
    || /tiktokglobalshop\.com$/.test(host)
    || /www\.tiktok\.com$/.test(host);
  if (!isTikTokShop) return { platform: null, pageType: "unknown", title: document.title, url: location.href };
  if (/\/(cart|checkout|account|orders?|seller|chat|messages?)(\/|$)/i.test(location.pathname)) {
    return { platform: "tiktok_shop", pageType: "unknown", title: document.title, url: location.href };
  }
  const text = document.body.innerText || "";
  const hasShowcaseProductListUrl = /^\/streamer\/showcase\/product\/list\/?$/i.test(location.pathname);
  const supportsRootRegionPath = host === "shop.tiktok.com" || host.endsWith(".tiktokglobalshop.com");
  const productPathPattern = supportsRootRegionPath
    ? /\/view\/product\/\d+|\/(?:shop\/)?[^/]+\/pdp\/(?:[^/]+\/)?\d+/i
    : /\/view\/product\/\d+|\/shop\/[^/]+\/pdp\/(?:[^/]+\/)?\d+/i;
  const shopHomePathPattern = supportsRootRegionPath ? /^\/(?:shop\/)?[^/]+\/?$/i : /^\/shop\/[^/]+\/?$/i;
  const categoryPathPattern = supportsRootRegionPath ? /^\/(?:shop\/)?[^/]+\/c\/[^/]+\/\d+\/?$/i : /^\/shop\/[^/]+\/c\/[^/]+\/\d+\/?$/i;
  const hasProductUrl = productPathPattern.test(location.pathname);
  const hasShopHomeUrl = shopHomePathPattern.test(location.pathname);
  const hasCategoryUrl = categoryPathPattern.test(location.pathname);
  const hasProductSignals = hasProductUrl || /add to cart|buy now|เพิ่มลงรถเข็น|ซื้อเลย|สินค้านี้|เกี่ยวกับสินค้ารายการนี้|sold by|product/i.test(text);
  const hasListingSignals = document.querySelectorAll("a[href]").length > 20 && /shop|สินค้า|products?|search/i.test(text);
  return {
    platform: "tiktok_shop",
    pageType: hasShowcaseProductListUrl ? "category" : hasProductSignals ? "product" : hasCategoryUrl ? "category" : hasShopHomeUrl ? "shop" : hasListingSignals ? "category" : "unknown",
    title: document.title,
    url: location.href,
  };
}
