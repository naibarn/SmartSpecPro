import { detectShopeePage } from "./adapters/shopee";
import { detectTikTokShopPage } from "./adapters/tiktokShop";
import { captureShopeeAffiliateDomDiagnostics, getLastShopeeAffiliateScanDiagnostics, isShopeeAffiliateProductOfferPage, resolveShopeeAffiliateLink, scanShopeeCategoryPage } from "./capture/categoryScanner";
import { scanShopeeProductPage } from "./capture/productPageScanner";
import { collectTikTokShowcaseImagesForProduct, scanTikTokShopCategoryPage, scanTikTokShopProductPage } from "./capture/tiktokShopScanner";

declare const chrome: any;

const SMARTAIHUB_DIAGNOSTIC_LOG_KEY = "smartaihubDiagnosticLogs";
const SMARTAIHUB_DIAGNOSTIC_LOG_LIMIT = 200;

let marketplaceObserver: MutationObserver | null = null;
let observerTimer: number | null = null;
let lastSnapshotKey = "";
let observedUrl = location.href;
let urlPollTimer: number | null = null;

function compactLogValue(value: unknown): unknown {
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map(compactLogValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 40).map(([key, item]) => [key, compactLogValue(item)]));
  }
  return value;
}

async function recordDiagnosticLog(event: string, details: Record<string, unknown> = {}) {
  try {
    const result = await chrome.storage.local.get([SMARTAIHUB_DIAGNOSTIC_LOG_KEY]);
    const existing = Array.isArray(result[SMARTAIHUB_DIAGNOSTIC_LOG_KEY]) ? result[SMARTAIHUB_DIAGNOSTIC_LOG_KEY] : [];
    const entry = {
      at: new Date().toISOString(),
      source: "content",
      host: location.hostname,
      path: location.pathname,
      event,
      details: compactLogValue(details),
    };
    await chrome.storage.local.set({ [SMARTAIHUB_DIAGNOSTIC_LOG_KEY]: [...existing, entry].slice(-SMARTAIHUB_DIAGNOSTIC_LOG_LIMIT) });
  } catch {
    // Diagnostics must never interrupt marketplace or drag workflows.
  }
}

function detectMarketplacePage() {
  const shopee = detectShopeePage();
  if (shopee.platform) return shopee;
  return detectTikTokShopPage();
}

function getScanFunction(platform: string) {
  return platform === "shopee" ? scanShopeeCategoryPage : scanTikTokShopCategoryPage;
}

async function buildMarketplaceSnapshot(reason: string) {
  const page = detectMarketplacePage();
  const candidates = page.platform ? getScanFunction(page.platform)(120).sort((a, b) => b.score - a.score) : [];
  const product = page.pageType === "product"
    ? page.platform === "shopee"
      ? await scanShopeeProductPage({ interactive: false })
      : page.platform === "tiktok_shop"
        ? scanTikTokShopProductPage()
        : null
    : null;
  return {
    ok: true,
    reason,
    observedAt: new Date().toISOString(),
    page,
    candidates,
    product,
  };
}

async function sendMarketplaceSnapshot(reason: string) {
  const snapshot = await buildMarketplaceSnapshot(reason);
  const key = JSON.stringify({
    url: snapshot.page.url,
    pageType: snapshot.page.pageType,
    candidateCount: snapshot.candidates.length,
    topUrls: snapshot.candidates.slice(0, 12).map((candidate) => candidate.url),
    productImageCount: snapshot.product?.imageCandidates.length ?? 0,
    productImageUrls: snapshot.product?.imageCandidates.slice(0, 40).map((image) => `${image.kind}:${image.url}`) ?? [],
    variantsText: snapshot.product?.variantsText ?? "",
    descriptionLength: snapshot.product?.descriptionText?.length ?? 0,
  });
  if (key === lastSnapshotKey) return snapshot;
  lastSnapshotKey = key;
  chrome.runtime.sendMessage({ type: "MARKETPLACE_PAGE_SNAPSHOT", ...snapshot }).catch(() => undefined);
  return snapshot;
}

function scheduleMarketplaceSnapshot(reason: string) {
  if (observerTimer != null) window.clearTimeout(observerTimer);
  observerTimer = window.setTimeout(() => {
    observerTimer = null;
    sendMarketplaceSnapshot(reason).catch(() => undefined);
  }, 1200);
}

function scheduleInitialSnapshots(reason: string) {
  lastSnapshotKey = "";
  scheduleMarketplaceSnapshot(reason);
  window.setTimeout(() => sendMarketplaceSnapshot(`${reason}_settled`).catch(() => undefined), 2500);
  window.setTimeout(() => sendMarketplaceSnapshot(`${reason}_lazy`).catch(() => undefined), 6000);
}

function detectUrlChange() {
  if (observedUrl === location.href) return;
  observedUrl = location.href;
  lastSnapshotKey = "";
  scheduleMarketplaceSnapshot("url_change");
}

function startMarketplaceObserver() {
  if (marketplaceObserver) return;
  if (!document.body) {
    window.setTimeout(startMarketplaceObserver, 500);
    return;
  }
  observedUrl = location.href;
  marketplaceObserver = new MutationObserver(() => scheduleMarketplaceSnapshot("dom_change"));
  marketplaceObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset", "href", "style", "class"] });
  window.addEventListener("scroll", onObservedScroll, { passive: true });
  window.addEventListener("resize", onObservedScroll, { passive: true });
  window.addEventListener("click", onObservedClick, true);
  window.addEventListener("popstate", detectUrlChange);
  urlPollTimer = window.setInterval(detectUrlChange, 1000);
  scheduleInitialSnapshots("observer_started");
}

function stopMarketplaceObserver() {
  marketplaceObserver?.disconnect();
  marketplaceObserver = null;
  if (observerTimer != null) window.clearTimeout(observerTimer);
  observerTimer = null;
  if (urlPollTimer != null) window.clearInterval(urlPollTimer);
  urlPollTimer = null;
  window.removeEventListener("scroll", onObservedScroll);
  window.removeEventListener("resize", onObservedScroll);
  window.removeEventListener("click", onObservedClick, true);
  window.removeEventListener("popstate", detectUrlChange);
}

function onObservedScroll() {
  scheduleMarketplaceSnapshot("scroll");
}

function onObservedClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest("button, a, [role='button'], [aria-label], [tabindex]")) return;
  window.setTimeout(() => scheduleMarketplaceSnapshot("click"), 700);
  window.setTimeout(() => scheduleMarketplaceSnapshot("click_settled"), 1800);
}

chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response: any) => void) => {
  try {
    if (message?.type === "DETECT_PAGE") {
      sendResponse({ ok: true, page: detectMarketplacePage() });
      return true;
    }
    if (message?.type === "PING_MARKETPLACE_CONTENT") {
      sendResponse({ ok: true, ready: true, url: location.href });
      return true;
    }
    if (message?.type === "SCAN_CATEGORY") {
      const page = detectMarketplacePage();
      if (!page.platform) throw new Error("unsupported_page");
      const candidates = getScanFunction(page.platform)(message.limit ?? 60);
      const scanner = isShopeeAffiliateProductOfferPage() ? getLastShopeeAffiliateScanDiagnostics() : null;
      const domDiagnostics = isShopeeAffiliateProductOfferPage() && candidates.length === 0
        ? captureShopeeAffiliateDomDiagnostics()
        : null;
      if (isShopeeAffiliateProductOfferPage()) {
        void recordDiagnosticLog("shopee_affiliate_scan", {
          candidateCount: candidates.length,
          withImages: candidates.filter((candidate) => Boolean(candidate.imageUrl)).length,
          withLinkButtons: candidates.filter((candidate) => Boolean(candidate.affiliateLinkAvailable)).length,
          withAffiliateUrls: candidates.filter((candidate) => Boolean(candidate.affiliateUrl)).length,
          minObservedSold: candidates.length > 0
            ? candidates.reduce((min, candidate) => Math.min(min, candidate.soldCountValue ?? min), candidates[0]?.soldCountValue ?? 0)
            : null,
          scanner,
        });
        if (domDiagnostics) {
          void recordDiagnosticLog("shopee_affiliate_zero_scan_dom", domDiagnostics);
        }
      }
      sendResponse({ ok: true, candidates, diagnostics: scanner, domDiagnostics });
      return true;
    }
    if (message?.type === "CAPTURE_AFFILIATE_DOM_DIAGNOSTICS") {
      const diagnostics = captureShopeeAffiliateDomDiagnostics();
      void recordDiagnosticLog("shopee_affiliate_manual_dom", diagnostics);
      sendResponse({ ok: true, diagnostics });
      return true;
    }
    if (message?.type === "GET_SHOPEE_AFFILIATE_LINK") {
      (async () => {
        const result = await resolveShopeeAffiliateLink({
          affiliateCardKey: typeof message.affiliateCardKey === "string" ? message.affiliateCardKey : null,
          productUrl: typeof message.productUrl === "string" ? message.productUrl : null,
          commissionCheckUrl: typeof message.commissionCheckUrl === "string" ? message.commissionCheckUrl : null,
          externalProductId: typeof message.externalProductId === "string" ? message.externalProductId : null,
          externalShopId: typeof message.externalShopId === "string" ? message.externalShopId : null,
          title: typeof message.title === "string" ? message.title : null,
          imageUrl: typeof message.imageUrl === "string" ? message.imageUrl : null,
          priceText: typeof message.priceText === "string" ? message.priceText : null,
          soldCountText: typeof message.soldCountText === "string" ? message.soldCountText : null,
        });
        void recordDiagnosticLog("shopee_affiliate_link_request", {
          ok: Boolean(result.affiliateUrl),
          requestedKey: message.affiliateCardKey ?? null,
          title: message.title ?? null,
          diagnostics: result.diagnostics,
        });
        sendResponse({ ok: true, ...result });
      })().catch((error) => {
        void recordDiagnosticLog("shopee_affiliate_link_request_failed", {
          requestedKey: message.affiliateCardKey ?? null,
          title: message.title ?? null,
          error: error?.message || "affiliate_link_failed",
        });
        sendResponse({ ok: false, error: error?.message || "affiliate_link_failed" });
      });
      return true;
    }
    if (message?.type === "COLLECT_TIKTOK_SHOWCASE_IMAGES") {
      (async () => {
        const page = detectMarketplacePage();
        if (page.platform !== "tiktok_shop") throw new Error("unsupported_page");
        const productId = typeof message.productId === "string" ? message.productId.trim() : "";
        if (!productId) throw new Error("missing_product_id");
        const candidate = await collectTikTokShowcaseImagesForProduct(productId);
        void recordDiagnosticLog("tiktok_showcase_image_collect", {
          productId,
          imageCount: candidate.imageUrls?.length ?? 0,
          priceText: candidate.priceText ?? null,
          commissionRateText: candidate.commissionRateText ?? null,
          url: candidate.url,
          source: "visible_rows",
        });
        sendResponse({ ok: true, candidate });
      })().catch((error) => {
        void recordDiagnosticLog("tiktok_showcase_image_collect_failed", {
          productId: message.productId ?? null,
          error: error?.message || "showcase_image_collect_failed",
        });
        sendResponse({ ok: false, error: error?.message || "showcase_image_collect_failed" });
      });
      return true;
    }
    if (message?.type === "SCROLL_AND_SCAN_CATEGORY") {
      const steps = Math.min(Math.max(Number(message.steps ?? 3), 1), 8);
      const delayMs = Math.min(Math.max(Number(message.delayMs ?? 800), 200), 2000);
      (async () => {
        const collected = new Map<string, any>();
        for (let i = 0; i < steps; i += 1) {
          const page = detectMarketplacePage();
          if (!page.platform) throw new Error("unsupported_page");
          const scan = getScanFunction(page.platform);
          for (const candidate of scan(message.limit ?? 100)) collected.set(candidate.url, candidate);
          window.scrollBy({ top: Math.max(600, Math.round(window.innerHeight * 0.85)), behavior: "smooth" });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        const page = detectMarketplacePage();
        if (!page.platform) throw new Error("unsupported_page");
        const scan = getScanFunction(page.platform);
        for (const candidate of scan(message.limit ?? 100)) collected.set(candidate.url, candidate);
        const candidates = Array.from(collected.values()).sort((a, b) => b.score - a.score);
        const scanner = isShopeeAffiliateProductOfferPage() ? getLastShopeeAffiliateScanDiagnostics() : null;
        const domDiagnostics = isShopeeAffiliateProductOfferPage() && candidates.length === 0
          ? captureShopeeAffiliateDomDiagnostics()
          : null;
        if (isShopeeAffiliateProductOfferPage()) {
          void recordDiagnosticLog("shopee_affiliate_scroll_scan", {
            candidateCount: candidates.length,
            withImages: candidates.filter((candidate) => Boolean(candidate.imageUrl)).length,
            withLinkButtons: candidates.filter((candidate) => Boolean(candidate.affiliateLinkAvailable)).length,
            withAffiliateUrls: candidates.filter((candidate) => Boolean(candidate.affiliateUrl)).length,
            scanner,
          });
          if (domDiagnostics) {
            void recordDiagnosticLog("shopee_affiliate_zero_scroll_dom", domDiagnostics);
          }
        }
        sendResponse({ ok: true, candidates, diagnostics: scanner, domDiagnostics });
      })().catch((error) => sendResponse({ ok: false, error: error?.message || "scroll_scan_failed" }));
      return true;
    }
    if (message?.type === "START_MARKETPLACE_OBSERVER") {
      startMarketplaceObserver();
      sendResponse({ ok: true, observing: true });
      return true;
    }
    if (message?.type === "STOP_MARKETPLACE_OBSERVER") {
      stopMarketplaceObserver();
      sendResponse({ ok: true, observing: false });
      return true;
    }
    if (message?.type === "GET_MARKETPLACE_SNAPSHOT") {
      buildMarketplaceSnapshot("manual_refresh")
        .then((snapshot) => {
          lastSnapshotKey = "";
          sendMarketplaceSnapshot("manual_refresh").catch(() => undefined);
          sendResponse(snapshot);
        })
        .catch((error) => sendResponse({ ok: false, error: error?.message || "snapshot_failed" }));
      return true;
    }
    if (message?.type === "SCAN_PRODUCT") {
      (async () => {
        const page = detectMarketplacePage();
        if (!page.platform) throw new Error("unsupported_page");
        const product = page.platform === "shopee" ? await scanShopeeProductPage({ interactive: true }) : scanTikTokShopProductPage();
        sendResponse({ ok: true, product });
      })().catch((error) => sendResponse({ ok: false, error: error?.message || "product_scan_failed" }));
      return true;
    }
    if (message?.type === "MERGE_VISIBLE_PRODUCT_IMAGES") {
      (async () => {
        const page = detectMarketplacePage();
        if (page.pageType !== "product" || !page.platform) throw new Error("unsupported_product_page");
        const product = page.platform === "shopee" ? await scanShopeeProductPage({ interactive: false }) : scanTikTokShopProductPage();
        sendResponse({ ok: true, product });
      })().catch((error) => sendResponse({ ok: false, error: error?.message || "merge_image_scan_failed" }));
      return true;
    }
    if (message?.type === "SCROLL_PRODUCT_HEADER") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      sendResponse({ ok: true });
      return true;
    }
    if (message?.type === "SCROLL_PRODUCT_DESCRIPTION") {
      const node = Array.from(document.querySelectorAll<HTMLElement>("section, div"))
        .find((el) => /รายละเอียดสินค้า|เกี่ยวกับสินค้ารายการนี้|คำอธิบายสินค้า|Product Description|Description/i.test(el.innerText || "") && el.innerText.length > 80);
      if (node) node.scrollIntoView({ block: "start", behavior: "smooth" });
      sendResponse({ ok: true, found: Boolean(node) });
      return true;
    }
    sendResponse({ ok: false, error: "unknown_message" });
  } catch (error: any) {
    sendResponse({ ok: false, error: error?.message || "content_script_error" });
  }
  return true;
});
