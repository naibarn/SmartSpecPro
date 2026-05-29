import type { PageDetection } from "../../shared/types";
import { parseShopeeProductUrl } from "../utils/number";

export function detectShopeePage(): PageDetection {
  const isShopee = /shopee\.co\.th$/.test(location.hostname) || /\.shopee\.co\.th$/.test(location.hostname);
  if (!isShopee) return { platform: null, pageType: "unknown", title: document.title, url: location.href };
  if (location.hostname === "affiliate.shopee.co.th" && /^\/offer\/product_offer\/?$/i.test(location.pathname)) {
    return { platform: "shopee", pageType: "category", title: document.title, url: location.href };
  }
  if (/\/(cart|checkout|buyer|user|account|orders?|seller|chat|messages?)(\/|$)/i.test(location.pathname)) {
    return { platform: "shopee", pageType: "unknown", title: document.title, url: location.href };
  }
  const text = document.body.innerText || "";
  const parsedProductUrl = parseShopeeProductUrl(location.href);
  const hasProductUrl = Boolean(parsedProductUrl.itemId) || /i\.\d+\.\d+/.test(location.href);
  const hasListingCards = document.querySelectorAll("a[href*='i.']").length >= 6;
  const hasSort = /ยอดนิยม|สินค้าขายดี|ราคา|ล่าสุด/.test(text);
  return {
    platform: "shopee",
    pageType: hasProductUrl ? "product" : hasListingCards && hasSort ? "category" : "unknown",
    title: document.title,
    url: location.href,
  };
}
