import {
  EXTENSION_NATIVE_UPDATE_KEY,
  persistNativeExtensionUpdateAvailability,
} from "../shared/extensionUpdate";
import { isSupportedCompanionTokenMessage } from "../shared/companionIdentity";

declare const chrome: any;

const DEVICE_ID_KEY = "deviceId";
const DRAG_MEDIA_TTL_MS = 10 * 60 * 1000;
const DRAG_MEDIA_CHUNK_SIZE = 1_000_000;
const LOCAL_AI_MAX_CHARS = 30_000;
const LOCAL_AI_MAX_IMAGES = 5;
const LOCAL_AI_MAX_IMAGE_BYTES = 4_000_000;
const LOCAL_AI_PROVIDERS = new Set(["ollama", "lm_studio", "localai", "llama_cpp", "custom_http"]);
const IMAGE_HOST_PATTERNS = [
  /(^|\.)shopee\.(co\.th|com|sg|co\.id|com\.my|ph|vn|tw|br|mx|cl|com\.co)$/i,
  /(^|\.)shopeemobile\.com$/i,
  /(^|\.)alicdn\.com$/i,
  /(^|\.)tiktokcdn\.com$/i,
  /(^|\.)tiktokcdn-us\.com$/i,
  /(^|\.)tiktokcdn-eu\.com$/i,
  /(^|\.)byteimg\.com$/i,
  /(^|\.)ibytedtos\.com$/i,
];
type DragMediaItem = {
  dataUrl?: string;
  chunks?: string[];
  sourceUrl?: string;
  headers?: Record<string, string>;
  name: string;
  type: string;
  expiresAt: number;
};
const dragMediaStore = new Map<string, DragMediaItem>();
let activeDragMedia: { id: string; expiresAt: number } | null = null;
let activeDragMediaClearTimer: ReturnType<typeof setTimeout> | null = null;

function randomHex(bytes: number) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function ensureDragMediaChunks(item: DragMediaItem) {
  if (item.chunks?.length) return item.chunks;
  if (item.dataUrl) {
    const [, payload = ""] = item.dataUrl.split(",");
    item.chunks = payload.match(new RegExp(`.{1,${DRAG_MEDIA_CHUNK_SIZE}}`, "g")) ?? [payload];
    return item.chunks;
  }
  if (!item.sourceUrl) throw new Error("drag_media_source_missing");
  const response = await fetch(item.sourceUrl, { headers: item.headers ?? {} });
  if (!response.ok) throw new Error(`drag_media_fetch_${response.status}`);
  const blob = await response.blob();
  item.type = blob.type || item.type || "application/octet-stream";
  const base64 = arrayBufferToBase64(await blob.arrayBuffer());
  item.chunks = base64.match(new RegExp(`.{1,${DRAG_MEDIA_CHUNK_SIZE}}`, "g")) ?? [base64];
  return item.chunks;
}

async function setGrokFileInputInMainWorld(dataUrl: string, name: string, type: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const file = new File([blob], name || "smartaihub-image", { type: type || blob.type || "image/png" });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[type='file']"))
    .filter((input) => !input.disabled && (!input.accept || input.accept.split(",").some((item) => {
      const accept = item.trim().toLowerCase();
      return !accept || accept === file.type.toLowerCase() || (accept.endsWith("/*") && file.type.toLowerCase().startsWith(accept.slice(0, -1))) || (accept.startsWith(".") && file.name.toLowerCase().endsWith(accept));
    })));
  // Grok mounts hidden inputs for Uploads, Connectors, Generations, and the
  // composer. Writing to all of them creates duplicate attachments. Select
  // only the input structurally associated with the prompt/reference composer,
  // rather than relying on brittle DOM order.
  const composerInput = inputs
    .map((candidate, index) => {
      let ancestor: HTMLElement | null = candidate.parentElement;
      let composerDepth = -1;
      let depth = 0;
      while (ancestor && depth < 12) {
        if (ancestor.querySelector("textarea, [contenteditable='true']")) {
          composerDepth = depth;
          break;
        }
        ancestor = ancestor.parentElement;
        depth += 1;
      }
      const context = [
        candidate.accept,
        candidate.getAttribute("aria-label"),
        candidate.getAttribute("data-testid"),
        candidate.className,
        candidate.parentElement?.className,
        ancestor?.className,
      ].filter((value) => typeof value === "string").join(" ").toLowerCase();
      const semanticScore = /composer|prompt|reference|imagine|attachment/.test(context) ? 100 : 0;
      return { candidate, index, score: semanticScore + (composerDepth >= 0 ? 1_000 - composerDepth : 0) };
    })
    .sort((a, b) => b.score - a.score || b.index - a.index)[0]?.candidate ?? null;
  const input = composerInput;
  if (!input) return { inputSet: false, inputCount: 0 };
  // Use the browser-native setter, not a potentially wrapped instance setter.
  // Grok's controlled uploader rejects the direct assignment used previously,
  // leaving input.files empty and forcing an unsupported synthetic drop.
  const filesSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files")?.set;
  if (!filesSetter) return { inputSet: false, inputCount: inputs.length, error: "files_setter_unavailable" };
  filesSetter.call(input, transfer.files);
  // Grok consumes the File in its React change handler and immediately clears
  // the native input. Capture acceptance before dispatching that handler: a
  // post-change `input.files` check is a false negative that replays the same
  // upload through every fallback path.
  const filesLengthBeforeChange = input.files?.length ?? 0;
  if (!filesLengthBeforeChange) {
    return { inputSet: false, inputCount: inputs.length, setStrategy: "native_files_setter", filesLengthBeforeChange };
  }
  input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  return {
    inputSet: true,
    inputCount: inputs.length,
    setStrategy: "native_files_setter",
    filesLengthBeforeChange,
    filesLengthAfterChange: input.files?.length ?? 0,
  };
}

async function getOrCreateDeviceId(): Promise<string> {
  const result = await chrome.storage.local.get([DEVICE_ID_KEY]);
  const existing = String(result[DEVICE_ID_KEY] || "");
  if (/^mdev_[a-f0-9]{64}$/.test(existing)) return existing;
  const next = `mdev_${randomHex(32)}`;
  await chrome.storage.local.set({ [DEVICE_ID_KEY]: next });
  return next;
}

function isAllowedExternalSender(url: string | undefined) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (
      parsed.hostname === "smartaihub.app"
      || parsed.hostname.endsWith(".smartaihub.app")
      || parsed.hostname.endsWith(".smartspec.pro")
    );
  } catch {
    return false;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split(".");
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function decodeJwtOrigin(token: string): string {
  const decoded = decodeJwtPayload(token);
  return typeof decoded?.origin === "string" ? decoded.origin.trim() : "";
}

function assertTokenMatchesExtensionOrigin(token: string) {
  const tokenOrigin = decodeJwtOrigin(token);
  const localOrigin = `chrome-extension://${chrome.runtime.id}`;
  if (tokenOrigin && tokenOrigin !== localOrigin) {
    throw new Error("extension_origin_mismatch");
  }
}

function isExtensionPageSender(sender: any) {
  return sender?.id === chrome.runtime.id
    && !sender?.tab
    && typeof sender?.url === "string"
    && sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`);
}

function isDragBridgeContentSender(sender: any) {
  return sender?.id === chrome.runtime.id && Boolean(sender?.tab?.url) && isDragBridgeTargetUrl(sender.tab.url);
}

function cleanString(value: unknown, max: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeLocalAIProvider(value: unknown) {
  const provider = cleanString(value, 40);
  return LOCAL_AI_PROVIDERS.has(provider) ? provider : "";
}

function validateLocalAIEndpoint(rawUrl: unknown, provider: string) {
  const urlText = cleanString(rawUrl, 300);
  const url = new URL(urlText);
  const host = url.hostname.toLowerCase();
  const localHost = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  if (url.protocol !== "http:" || !localHost) throw new Error("local_ai_endpoint_must_be_localhost_http");
  if (url.username || url.password) throw new Error("local_ai_endpoint_must_not_include_credentials");
  if (url.search || url.hash) throw new Error("local_ai_endpoint_must_not_include_query_or_hash");
  const allowedPaths: Record<string, string[]> = {
    ollama: ["/api/chat"],
    lm_studio: ["/v1/chat/completions"],
    localai: ["/v1/chat/completions"],
    llama_cpp: ["/v1/chat/completions"],
    custom_http: ["/api/chat", "/v1/chat/completions"],
  };
  if (!allowedPaths[provider]?.includes(url.pathname)) throw new Error("local_ai_endpoint_path_not_allowed");
  return url.toString();
}

function normalizeLocalAIMessages(value: unknown) {
  if (!Array.isArray(value)) throw new Error("local_ai_messages_invalid");
  let total = 0;
  return value.slice(0, 12).map((item) => {
    const role = cleanString((item as any)?.role, 20);
    const content = cleanString((item as any)?.content, LOCAL_AI_MAX_CHARS);
    if (!["system", "user", "assistant"].includes(role) || !content) throw new Error("local_ai_message_invalid");
    total += content.length;
    if (total > LOCAL_AI_MAX_CHARS) throw new Error("local_ai_payload_too_large");
    return { role, content };
  });
}

function validateMarketplaceImageUrl(rawUrl: unknown) {
  const urlText = cleanString(rawUrl, 4096);
  const url = new URL(urlText);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("local_ai_image_url_not_allowed");
  if (!IMAGE_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) throw new Error("local_ai_image_host_not_allowed");
  return url.toString();
}

function pruneDragMediaStore() {
  const now = Date.now();
  for (const [id, item] of dragMediaStore.entries()) {
    if (item.expiresAt <= now) dragMediaStore.delete(id);
  }
  if (activeDragMedia && activeDragMedia.expiresAt <= now) activeDragMedia = null;
}

function clearActiveDragMedia(id: string | null = null) {
  if (activeDragMediaClearTimer) {
    clearTimeout(activeDragMediaClearTimer);
    activeDragMediaClearTimer = null;
  }
  if (!id || activeDragMedia?.id === id) {
    activeDragMedia = null;
    broadcastActiveDragMedia(null);
  }
}

function scheduleActiveDragMediaClear(id: string | null = null) {
  if (activeDragMediaClearTimer) clearTimeout(activeDragMediaClearTimer);
  activeDragMediaClearTimer = setTimeout(() => {
    activeDragMediaClearTimer = null;
    if (!id || activeDragMedia?.id === id) {
      activeDragMedia = null;
      broadcastActiveDragMedia(null);
    }
  }, 2500);
}

function isDragBridgeTargetUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (
      parsed.hostname === "labs.google"
      || parsed.hostname.endsWith(".labs.google")
      || parsed.hostname === "flow.google"
      || parsed.hostname.endsWith(".flow.google")
      || parsed.hostname.endsWith(".google.com")
      || parsed.hostname === "facebook.com"
      || parsed.hostname.endsWith(".facebook.com")
      || (parsed.hostname === "www.tiktok.com" && parsed.pathname.startsWith("/tiktokstudio"))
      || parsed.hostname === "magnific.ai"
      || parsed.hostname.endsWith(".magnific.ai")
      || parsed.hostname === "magnific.com"
      || parsed.hostname.endsWith(".magnific.com")
      || parsed.hostname === "higgsfield.ai"
      || parsed.hostname.endsWith(".higgsfield.ai")
      || parsed.hostname === "grok.com"
      || parsed.hostname.endsWith(".grok.com")
    );
  } catch {
    return false;
  }
}

function sendActiveDragMediaToTab(tab: any, id: string | null) {
  if (!tab?.id) return;
  const message = { type: "SMARTAIHUB_ACTIVE_DRAG_MEDIA", id };
  const sendMessage = () => chrome.tabs.sendMessage(tab.id, message).catch(() => undefined);
  if (id && isDragBridgeTargetUrl(tab.url)) {
    chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["assets/dragBridge.js"] })
      .then(sendMessage)
      .catch(sendMessage);
    return;
  }
  chrome.tabs.sendMessage(tab.id, message).catch(() => {
    if (!id || !isDragBridgeTargetUrl(tab.url)) return;
    chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["assets/dragBridge.js"] })
      .then(sendMessage)
      .catch(() => undefined);
  });
}

function broadcastActiveDragMedia(id: string | null) {
  chrome.tabs.query({}, (tabs: any[]) => {
    for (const tab of tabs || []) {
      sendActiveDragMediaToTab(tab, id);
    }
  });
}

async function imageUrlToBase64(rawUrl: unknown) {
  const url = validateMarketplaceImageUrl(rawUrl);
  const response = await fetch(url, { method: "GET", redirect: "follow" });
  if (!response.ok) throw new Error(`local_ai_image_http_${response.status}`);
  const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("image/")) throw new Error("local_ai_image_content_type_invalid");
  const blob = await response.blob();
  if (blob.size > LOCAL_AI_MAX_IMAGE_BYTES) throw new Error("local_ai_image_too_large");
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  return { url, mimeType: contentType, base64: btoa(binary) };
}

function normalizeVisionTransport(value: unknown) {
  return value === "url" ? "url" : "base64";
}

async function normalizeVisionImages(value: unknown, transport: "base64" | "url") {
  if (!Array.isArray(value)) return [];
  const urls = Array.from(new Set(value.map((item) => typeof item === "string" ? item : (item as any)?.url).filter(Boolean))).slice(0, LOCAL_AI_MAX_IMAGES);
  if (transport === "url") return urls.map((url) => ({ url: validateMarketplaceImageUrl(url), mimeType: "", base64: "" }));
  const images = [];
  for (const url of urls) images.push(await imageUrlToBase64(url));
  return images;
}

async function handleLocalAIChat(message: any, sender: any) {
  if (!isExtensionPageSender(sender)) throw new Error("local_ai_sender_not_allowed");
  const provider = normalizeLocalAIProvider(message.provider);
  if (!provider) throw new Error("local_ai_provider_not_allowed");
  const endpointUrl = validateLocalAIEndpoint(message.endpointUrl, provider);
  const model = cleanString(message.model, 120) || (provider === "ollama" ? "llama3.1" : "local-model");
  const messages = normalizeLocalAIMessages(message.messages);
  const visionTransport = normalizeVisionTransport(message.imageTransport);
  const images = await normalizeVisionImages(message.imageUrls, visionTransport);
  const temperature = Number.isFinite(Number(message.temperature)) ? Math.max(0, Math.min(1, Number(message.temperature))) : 0.2;
  const openAICompatible = provider !== "ollama";
  const openAIMessages = images.length > 0
    ? messages.map((item, index) => index === messages.length - 1 && item.role === "user"
      ? {
        role: item.role,
        content: [
          { type: "text", text: item.content },
          ...images.map((image) => ({ type: "image_url", image_url: { url: visionTransport === "url" ? image.url : `data:${image.mimeType};base64,${image.base64}` } })),
        ],
      }
      : item)
    : messages;
  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(openAICompatible
      ? { model, messages: openAIMessages, temperature, stream: false }
      : { model, messages: messages.map((item, index) => index === messages.length - 1 && item.role === "user" && images.length > 0 ? { ...item, images: images.map((image) => visionTransport === "url" ? image.url : image.base64) } : item), stream: false, options: { temperature } }),
  });
  if (!response.ok) {
    if (provider === "ollama" && response.status === 403) throw new Error("local_ai_ollama_origin_forbidden");
    throw new Error(`local_ai_http_${response.status}`);
  }
  const json = await response.json();
  const content = openAICompatible
    ? json?.choices?.[0]?.message?.content
    : json?.message?.content ?? json?.response;
  if (typeof content !== "string" || !content.trim()) throw new Error("local_ai_empty_response");
  return { ok: true, content: content.slice(0, LOCAL_AI_MAX_CHARS), provider, model };
}

async function handleNativeLocalAI(message: any, sender: any) {
  if (!isExtensionPageSender(sender)) throw new Error("local_ai_sender_not_allowed");
  const hostName = cleanString(message.hostName, 120);
  if (!/^[a-z0-9_.-]+$/i.test(hostName)) throw new Error("native_host_name_invalid");
  const model = cleanString(message.model, 120);
  const messages = normalizeLocalAIMessages(message.messages);
  const visionTransport = normalizeVisionTransport(message.imageTransport);
  const images = await normalizeVisionImages(message.imageUrls, visionTransport);
  const temperature = Number.isFinite(Number(message.temperature)) ? Math.max(0, Math.min(1, Number(message.temperature))) : 0.2;
  return await new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(hostName, {
      type: "SMARTAIHUB_LOCAL_AI_CHAT",
      model,
      messages,
      images,
      imageTransport: visionTransport,
      temperature,
    }, (response: any) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove(EXTENSION_NATIVE_UPDATE_KEY).catch(() => undefined);
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.runtime.onUpdateAvailable?.addListener((details: { version?: unknown }) => {
  persistNativeExtensionUpdateAvailability(chrome.storage.local, details?.version).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response: any) => void) => {
  if (message?.type !== "CAPTURE_VISIBLE_TAB") return false;
  chrome.tabs.captureVisibleTab({ format: "png" }, (dataUrl: string) => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    sendResponse({ ok: true, dataUrl });
  });
  return true;
});

chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: (response: any) => void) => {
  if (
    message?.type !== "SMARTAIHUB_STORE_DRAG_MEDIA"
    && message?.type !== "SMARTAIHUB_GET_DRAG_MEDIA"
    && message?.type !== "SMARTAIHUB_GET_DRAG_MEDIA_CHUNK"
    && message?.type !== "SMARTAIHUB_START_DRAG_MEDIA"
    && message?.type !== "SMARTAIHUB_END_DRAG_MEDIA"
    && message?.type !== "SMARTAIHUB_COMPLETE_DRAG_MEDIA"
    && message?.type !== "SMARTAIHUB_GET_ACTIVE_DRAG_MEDIA"
    && message?.type !== "SMARTAIHUB_DELIVER_GROK_MEDIA_TO_MAIN_WORLD"
  ) return false;
  try {
    pruneDragMediaStore();
    if (message.type === "SMARTAIHUB_STORE_DRAG_MEDIA") {
      if (!isExtensionPageSender(sender)) throw new Error("drag_media_sender_not_allowed");
      const id = cleanString(message.id, 160);
      const dataUrl = String(message.dataUrl || "");
      const name = cleanString(message.name, 240) || "smartaihub-media";
      const type = cleanString(message.mimeType, 120) || "application/octet-stream";
      const sourceUrl = cleanString(message.sourceUrl, 4096);
      const rawHeaders = message.headers && typeof message.headers === "object" ? message.headers as Record<string, unknown> : {};
      const headers = Object.fromEntries(Object.entries(rawHeaders)
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => [cleanString(key, 120), cleanString(value, 4096)])
        .filter(([key, value]) => key && value));
      const metadataOnly = message.metadataOnly === true;
      const hasDataUrl = dataUrl.startsWith("data:") && dataUrl.length <= 12_000_000;
      if (!id || (!metadataOnly && !sourceUrl && !hasDataUrl)) throw new Error("drag_media_invalid");
      // Keep a prepared payload when available. The panel may have obtained it
      // through the app proxy because the original provider URL is not
      // fetchable from the service worker. Preferring this payload avoids a
      // second, lossy fetch during cross-tab drag delivery.
      const item = { ...(metadataOnly || !hasDataUrl ? {} : { dataUrl }), sourceUrl, headers, name, type, expiresAt: Date.now() + DRAG_MEDIA_TTL_MS };
      dragMediaStore.set(id, item);
      if (sourceUrl) void ensureDragMediaChunks(item).catch(() => undefined);
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === "SMARTAIHUB_START_DRAG_MEDIA") {
      if (!isExtensionPageSender(sender)) throw new Error("drag_media_sender_not_allowed");
      const id = cleanString(message.id, 160);
      if (!id || !dragMediaStore.has(id)) throw new Error("drag_media_not_found");
      if (activeDragMediaClearTimer) {
        clearTimeout(activeDragMediaClearTimer);
        activeDragMediaClearTimer = null;
      }
      activeDragMedia = { id, expiresAt: Date.now() + 60_000 };
      broadcastActiveDragMedia(id);
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === "SMARTAIHUB_END_DRAG_MEDIA") {
      if (!isExtensionPageSender(sender)) throw new Error("drag_media_sender_not_allowed");
      const id = cleanString(message.id, 160);
      if (!id || activeDragMedia?.id === id) {
        scheduleActiveDragMediaClear(id || null);
      }
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === "SMARTAIHUB_COMPLETE_DRAG_MEDIA") {
      if (!isDragBridgeContentSender(sender)) throw new Error("drag_media_sender_not_allowed");
      const id = cleanString(message.id, 160);
      if (!id || activeDragMedia?.id === id) {
        clearActiveDragMedia(id || null);
      }
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === "SMARTAIHUB_DELIVER_GROK_MEDIA_TO_MAIN_WORLD") {
      if (!isDragBridgeContentSender(sender) || !sender.tab?.id || !isDragBridgeTargetUrl(sender.tab.url)) throw new Error("drag_media_sender_not_allowed");
      const id = cleanString(message.id, 160);
      const item = id ? dragMediaStore.get(id) : undefined;
      if (!item) throw new Error("drag_media_not_found");
      ensureDragMediaChunks(item)
        .then(async (chunks) => {
          const dataUrl = `data:${item.type || "application/octet-stream"};base64,${chunks.join("")}`;
          const results = await chrome.scripting.executeScript({
            target: { tabId: sender.tab.id, frameIds: sender.frameId == null ? undefined : [sender.frameId] },
            world: "MAIN",
            func: setGrokFileInputInMainWorld,
            args: [dataUrl, item.name, item.type],
          });
          sendResponse({ ok: true, ...(results[0]?.result ?? { inputSet: false, inputCount: 0 }) });
        })
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "grok_main_world_delivery_failed" }));
      return true;
    }
    if (message.type === "SMARTAIHUB_GET_ACTIVE_DRAG_MEDIA") {
      sendResponse(activeDragMedia ? { ok: true, id: activeDragMedia.id } : { ok: false, error: "active_drag_media_not_found" });
      return true;
    }
    if (message.type === "SMARTAIHUB_GET_DRAG_MEDIA_CHUNK") {
      if (!isDragBridgeContentSender(sender)) throw new Error("drag_media_sender_not_allowed");
      const id = cleanString(message.id, 160);
      const index = Math.max(0, Math.floor(Number(message.index) || 0));
      const item = id ? dragMediaStore.get(id) : undefined;
      if (!item) throw new Error("drag_media_not_found");
      ensureDragMediaChunks(item)
        .then((chunks) => sendResponse({ ok: true, chunk: chunks[index] ?? "", index, count: chunks.length, name: item.name, type: item.type }))
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "drag_media_chunk_failed" }));
      return true;
    }
    const id = cleanString(message.id, 160);
    const item = id ? dragMediaStore.get(id) : undefined;
    sendResponse(item ? { ok: true, dataUrl: item.dataUrl, chunked: Boolean(item.sourceUrl || item.chunks), name: item.name, type: item.type } : { ok: false, error: "drag_media_not_found" });
  } catch (error) {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : "drag_media_failed" });
  }
  return true;
});

chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: (response: any) => void) => {
  if (message?.type !== "LOCAL_AI_CHAT" && message?.type !== "LOCAL_AI_NATIVE_CHAT") return false;
  void (async () => {
    const result: any = message.type === "LOCAL_AI_NATIVE_CHAT"
      ? await handleNativeLocalAI(message, sender)
      : await handleLocalAIChat(message, sender);
    sendResponse(result?.ok === false ? result : { ok: true, ...(result && typeof result === "object" ? result : { content: String(result ?? "") }) });
  })().catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "local_ai_request_failed" }));
  return true;
});

chrome.runtime.onMessageExternal.addListener((message: any, sender: any, sendResponse: (response: any) => void) => {
  if (!isSupportedCompanionTokenMessage(message?.type)) return false;
  if (!isAllowedExternalSender(sender?.url)) {
    sendResponse({ ok: false, error: "external_sender_not_allowed" });
    return true;
  }
  void (async () => {
    const token = String(message.accessToken || "").trim();
    const tokenExpiresAt = String(message.expiresAt || "").trim();
    const baseUrl = String(message.baseUrl || "https://smartaihub.app").replace(/\/$/, "");
    const messageDeviceId = String(message.deviceId || "").trim();
    const localDeviceId = await getOrCreateDeviceId();
    if (!token || !tokenExpiresAt) {
      sendResponse({ ok: false, error: "missing_token" });
      return;
    }
    if (messageDeviceId !== localDeviceId) {
      sendResponse({ ok: false, error: "device_binding_mismatch" });
      return;
    }
    assertTokenMatchesExtensionOrigin(token);
    chrome.storage.local.set({ baseUrl, token, tokenExpiresAt, [DEVICE_ID_KEY]: localDeviceId }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true });
    });
  })().catch((error) => sendResponse({ ok: false, error: error?.message || "token_store_failed" }));
  return true;
});
