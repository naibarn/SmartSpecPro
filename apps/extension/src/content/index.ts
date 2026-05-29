import { detectShopeePage } from "./adapters/shopee";
import { detectTikTokShopPage } from "./adapters/tiktokShop";
import { captureShopeeAffiliateDomDiagnostics, getLastShopeeAffiliateScanDiagnostics, isShopeeAffiliateProductOfferPage, resolveShopeeAffiliateLink, scanShopeeCategoryPage } from "./capture/categoryScanner";
import { scanShopeeProductPage } from "./capture/productPageScanner";
import { scanTikTokShopCategoryPage, scanTikTokShopProductPage } from "./capture/tiktokShopScanner";

declare const chrome: any;

const SMARTAIHUB_DRAG_MEDIA_MIME = "application/x-smartaihub-drag-media-id";
const SMARTAIHUB_DIAGNOSTIC_LOG_KEY = "smartaihubDiagnosticLogs";
const SMARTAIHUB_DIAGNOSTIC_LOG_LIMIT = 200;

let marketplaceObserver: MutationObserver | null = null;
let activeDragMediaId: string | null = null;
const bridgedDragEvents = new WeakSet<DragEvent>();
const dragMediaFileCache = new Map<string, Promise<File | null>>();
let lastDragPreviewKey = "";
let lastDragPreviewAt = 0;
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

function dataUrlToFile(dataUrl: string, name: string, type: string) {
  const [header, base64] = dataUrl.split(",");
  const mime = type || header.match(/data:(.*?);base64/)?.[1] || "application/octet-stream";
  const bytes = atob(base64 || "");
  const array = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
  return new File([array], name || "smartaihub-media", { type: mime });
}

function isLikelyUploadElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const text = [
    element.getAttribute("aria-label"),
    element.getAttribute("data-testid"),
    element.getAttribute("role"),
    typeof element.className === "string" ? element.className : "",
    element.textContent,
  ].join(" ").toLowerCase();
  return /upload|drop|file|image|media|reference|start|end|frame|drag|วาง|อัปโหลด|อัพโหลด|ลาก/.test(text);
}

function findUploadTarget(start: EventTarget | null): HTMLElement {
  const element = start instanceof Element ? start : document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  const explicit = element?.closest?.("input[type='file'], [data-testid*='upload' i], [aria-label*='upload' i], [role='button'], button, label");
  if (explicit instanceof HTMLElement) return explicit;
  let current: Element | null | undefined = element;
  while (current && current !== document.body) {
    if (isLikelyUploadElement(current)) return current;
    current = current.parentElement;
  }
  return element instanceof HTMLElement ? element : document.body;
}

function setNearestFileInput(target: HTMLElement, files: FileList) {
  const nearby = findNearestFileInput(target, files);
  if (!nearby) return false;
  return setFileInputFiles(nearby, files);
}

function freshFileList(files: FileList) {
  const transfer = new DataTransfer();
  for (const file of Array.from(files)) transfer.items.add(file);
  return transfer.files;
}

function setFileInputFiles(input: HTMLInputElement, files: FileList) {
  try {
    const nextFiles = freshFileList(files);
    input.value = "";
    input.files = nextFiles;
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return (input.files?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

function fileInputAcceptsFile(input: HTMLInputElement, file: File | undefined) {
  const accept = input.accept.toLowerCase().split(",").map((item) => item.trim()).filter(Boolean);
  if (!accept.length || !file) return true;
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return accept.some((item) => {
    if (item === type) return true;
    if (item.endsWith("/*")) return type.startsWith(item.slice(0, -1));
    if (item.startsWith(".")) return name.endsWith(item);
    return false;
  });
}

function findNearestFileInput(target: HTMLElement, files: FileList) {
  const candidates = Array.from(new Set<HTMLInputElement>([
    ...(target instanceof HTMLInputElement && target.type === "file" ? [target] : []),
    ...Array.from(target.querySelectorAll?.("input[type='file']") ?? []) as HTMLInputElement[],
    ...Array.from(document.querySelectorAll<HTMLInputElement>("input[type='file']")),
  ]));
  return candidates.find((input) => fileInputAcceptsFile(input, files[0])) || candidates[0] || null;
}

function isGoogleFlowHost(hostname: string) {
  return hostname === "labs.google"
    || hostname.endsWith(".labs.google")
    || hostname === "flow.google"
    || hostname.endsWith(".flow.google")
    || hostname.endsWith(".google.com");
}

function isMagnificHost(hostname: string) {
  return hostname === "magnific.ai"
    || hostname.endsWith(".magnific.ai")
    || hostname === "magnific.com"
    || hostname.endsWith(".magnific.com");
}

function canUseFileInputFallback(target: HTMLElement, files: FileList) {
  const hostname = location.hostname.toLowerCase();
  if (isGoogleFlowHost(hostname)) return false;
  if (target instanceof HTMLInputElement && target.type === "file") return true;
  return isMagnificHost(hostname) && Boolean(findNearestFileInput(target, files));
}

function dispatchFileDragEvents(target: HTMLElement, file: File, originalEvent: DragEvent, types: Array<"dragenter" | "dragover" | "drop">) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  const eventTargets = Array.from(new Set<EventTarget>([target, document, window]));
  let dropWasHandled = false;
  for (const type of types) {
    const targetsForType = type === "drop" ? [target] : eventTargets;
    for (const eventTarget of targetsForType) {
      const event = new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: originalEvent.clientX,
        clientY: originalEvent.clientY,
        dataTransfer: transfer,
      });
      bridgedDragEvents.add(event);
      const wasNotCanceled = eventTarget.dispatchEvent(event);
      if (type === "drop" && !wasNotCanceled) dropWasHandled = true;
    }
  }
  if (types.includes("drop") && !dropWasHandled && canUseFileInputFallback(target, transfer.files)) {
    setNearestFileInput(target, transfer.files);
  }
}

function deliverMagnificFileDrop(target: HTMLElement, file: File, originalEvent: DragEvent) {
  dispatchFileDragEvents(target, file, originalEvent, ["dragenter", "dragover"]);
  const transfer = new DataTransfer();
  transfer.items.add(file);
  const inputSet = setNearestFileInput(target, transfer.files);
  if (!inputSet) {
    dispatchFileDragEvents(target, file, originalEvent, ["drop"]);
  }
  void recordDiagnosticLog("magnific_drag_delivery", {
    strategy: inputSet ? "file_input_first" : "synthetic_drop_fallback",
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    targetTag: target.tagName,
    targetClass: typeof target.className === "string" ? target.className : "",
  });
  return inputSet;
}

function eventDragMediaId(event: DragEvent): string {
  try {
    return event.dataTransfer?.getData(SMARTAIHUB_DRAG_MEDIA_MIME) || activeDragMediaId || "";
  } catch {
    return activeDragMediaId || "";
  }
}

async function activeDragMediaIdFromBackground(): Promise<string> {
  if (activeDragMediaId) return activeDragMediaId;
  const response = await chrome.runtime.sendMessage({ type: "SMARTAIHUB_GET_ACTIVE_DRAG_MEDIA" }).catch(() => null);
  return response?.ok && response.id ? String(response.id) : "";
}

function dragMediaFileFromBackground(id: string): Promise<File | null> {
  const existing = dragMediaFileCache.get(id);
  if (existing) return existing;
  const pending = chrome.runtime.sendMessage({ type: "SMARTAIHUB_GET_DRAG_MEDIA", id })
    .then((response: any) => response?.ok && response.dataUrl ? dataUrlToFile(response.dataUrl, response.name, response.type) : null)
    .catch(() => null);
  dragMediaFileCache.set(id, pending);
  return pending;
}

function finishSmartAIHubDrag(id: string) {
  activeDragMediaId = null;
  lastDragPreviewKey = "";
  dragMediaFileCache.delete(id);
  void chrome.runtime.sendMessage({ type: "SMARTAIHUB_COMPLETE_DRAG_MEDIA", id }).catch(() => undefined);
}

async function replaySmartAIHubDragPreview(event: DragEvent, id: string) {
  const target = findUploadTarget(event.target);
  const now = performance.now();
  const key = `${id}:${event.type}:${Math.round(event.clientX / 12)}:${Math.round(event.clientY / 12)}`;
  if (event.type === "dragover" && key === lastDragPreviewKey && now - lastDragPreviewAt < 120) return;
  lastDragPreviewKey = key;
  lastDragPreviewAt = now;
  const file = await dragMediaFileFromBackground(id);
  if (!file) return;
  if (!activeDragMediaId && !event.dataTransfer?.types?.includes(SMARTAIHUB_DRAG_MEDIA_MIME)) return;
  dispatchFileDragEvents(target, file, event, event.type === "dragenter" ? ["dragenter", "dragover"] : ["dragover"]);
}

function primeSmartAIHubDrop(event: DragEvent) {
  if (bridgedDragEvents.has(event)) return;
  const hasBridgePayload = event.dataTransfer?.types?.includes(SMARTAIHUB_DRAG_MEDIA_MIME) || Boolean(activeDragMediaId);
  const id = eventDragMediaId(event);
  if (!id) {
    if (hasBridgePayload) {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }
    void activeDragMediaIdFromBackground().then((activeId) => {
      if (!activeId) return;
      activeDragMediaId = activeId;
      void replaySmartAIHubDragPreview(event, activeId);
    });
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  void replaySmartAIHubDragPreview(event, id);
}

async function handleSmartAIHubMediaDrop(event: DragEvent) {
  if (bridgedDragEvents.has(event)) return;
  const hasBridgePayload = event.dataTransfer?.types?.includes(SMARTAIHUB_DRAG_MEDIA_MIME) || Boolean(activeDragMediaId);
  let id = eventDragMediaId(event);
  if (hasBridgePayload) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }
  if (!id) id = await activeDragMediaIdFromBackground();
  if (!id) return;
  if (!hasBridgePayload) {
    event.preventDefault();
    event.stopPropagation();
  }
  const file = await dragMediaFileFromBackground(id);
  if (!file) return;
  const target = findUploadTarget(event.target);
  if (isMagnificHost(location.hostname.toLowerCase())) {
    deliverMagnificFileDrop(target, file, event);
  } else {
    dispatchFileDragEvents(target, file, event, ["dragenter", "dragover", "drop"]);
  }
  finishSmartAIHubDrag(id);
}

window.addEventListener("dragenter", (event) => {
  primeSmartAIHubDrop(event);
}, true);

window.addEventListener("dragover", (event) => {
  primeSmartAIHubDrop(event);
}, true);

window.addEventListener("drop", (event) => {
  void handleSmartAIHubMediaDrop(event);
}, true);

chrome.runtime.onMessage.addListener((message: any) => {
  if (message?.type === "SMARTAIHUB_ACTIVE_DRAG_MEDIA") {
    activeDragMediaId = typeof message.id === "string" && message.id ? message.id : null;
    lastDragPreviewKey = "";
    if (!activeDragMediaId) dragMediaFileCache.clear();
  }
  return false;
});

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
