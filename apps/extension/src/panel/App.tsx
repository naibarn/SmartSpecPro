import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { CategoryProductCandidate, ImageCandidate, PageDetection, ProductCapturePayload } from "../shared/types";
import {
  buildInsightSyncRequest,
  buildProductBriefPrompt,
  buildStorytellingHandoff,
  buildVideoBriefFromProduct,
  applyUserStoryInsightDraft,
  createDeterministicProductBrief,
  createUserStoryInsightDraft,
  createPromptAPISession,
  decideLocalAIProvider,
  defaultLocalAISettings,
  detectChromePromptAPI,
  generateProductBriefWithPromptAPI,
  generateProductBriefWithServerAI,
  sanitizeCaptureForLocalAI,
  validateProductBrief,
  type LocalAICapability,
  type LocalAIProviderId,
  type LocalAISettings,
  type LocalAIWorkflowState,
  type MarketplaceStorytellingHandoff,
  type ProductBrief,
  type SanitizedLocalAIInput,
  type UserStoryInsightDraft,
  type VideoBrief,
} from "../shared/localAi";

declare const chrome: any;

interface Settings {
  baseUrl: string;
  token: string;
  tokenExpiresAt?: string;
  deviceId: string;
}

interface CandidateFilters {
  keyword: string;
  minScore: string;
  minRating: string;
  priceMax: string;
  discountMin: string;
  mallOnly: boolean;
  freeShippingOnly: boolean;
  excludeSponsored: boolean;
}

interface EditableProduct {
  productName: string;
  brand: string;
  shopName: string;
  priceCurrentText: string;
  commissionRateText: string;
  affiliateUrl: string;
  soldCountText: string;
  ratingScoreText: string;
  reviewCountText: string;
  categoryText: string;
  stockText: string;
  variantsText: string;
  sellerLocationText: string;
  descriptionText: string;
}

interface EvidenceSelection {
  domHeader: boolean;
  domDescription: boolean;
  rawHtmlBlocks: boolean;
  headerScreenshot: boolean;
  descriptionScreenshot: boolean;
}

interface ReviewDraft {
  editable: EditableProduct;
  evidence: EvidenceSelection;
  selectedImages: Record<string, boolean>;
  heroImageUrl: string;
  updatedAt: string;
}

interface ProgressStep {
  label: string;
  status: "pending" | "active" | "done" | "error";
}

type PanelTab = "capture" | "products" | "localAI" | "production" | "storyboard" | "ask" | "config";
type ImageFilter = "all" | ImageCandidate["kind"];

interface AskResult {
  answer: string;
  source: "local_ai" | "assistant_rules";
  shopeeKeywords: string[];
  googleKeywords: string[];
  cautions: string[];
}

interface ConfigTestResult {
  status: "idle" | "testing" | "success" | "failed";
  message: string;
  error?: string;
  checkedAt?: string;
}

interface LocalModelPreset {
  name: string;
  vision?: boolean;
  cloud?: boolean;
}

interface MarketplaceLiveSnapshot {
  page: PageDetection;
  candidates: CategoryProductCandidate[];
  product: ProductCapturePayload | null;
  observedAt: string;
  reason: string;
}

interface DiagnosticLogEntry {
  at: string;
  source: string;
  host?: string;
  path?: string;
  event: string;
  details?: unknown;
}

interface CategoryScanResponse {
  candidates: CategoryProductCandidate[];
  diagnostics?: Record<string, unknown> | null;
  domDiagnostics?: Record<string, unknown> | null;
}

interface ProductionDirectorReferenceImage {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  kind: string;
  role?: string;
  source?: string;
}

interface ProductionDirectorStoryboardGridFrame {
  index: number;
  row: number;
  col: number;
  url: string;
  name?: string;
  sourceGridUrl?: string;
}

interface ProductionDirectorProjectSummary {
  productionRunId: string;
  title: string;
  summary: string;
  status: string;
  shotCount: number;
  referenceImageCount: number;
  platform: string | null;
  audience: string | null;
  thumbnailUrl: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

interface ProductionDirectorShot {
  id: string;
  order: number;
  title: string;
  durationSeconds: number | null;
  shotType: string | null;
  storyBeat: string;
  storyboardPrompt: string;
  storyboardGridPrompt?: string;
  videoPrompt?: string;
  storyboardGridImageUrl?: string;
  storyboardGridFrames?: ProductionDirectorStoryboardGridFrame[];
  referenceImageUrl?: string;
  startFrameUrl?: string;
  stopFrameUrl?: string;
  script: string;
  cameraIntent: string;
  visualIntent: string;
  audioIntent: string;
  customerJourneyStage: string;
  status: string;
  referenceImages: ProductionDirectorReferenceImage[];
}

interface ProductionDirectorProjectDetail extends ProductionDirectorProjectSummary {
  version: number;
  referenceImages: ProductionDirectorReferenceImage[];
  shots: ProductionDirectorShot[];
}

interface StoryboardReviewReferenceImage {
  id: string;
  title: string;
  url: string;
  role: string;
}

interface StoryboardReviewProjectSummary {
  id: number;
  title: string;
  status: string;
  clipCount: number;
  completedClipCount: number;
  thumbnailUrl: string | null;
  videoEditorProjectId: number | null;
  updatedAt: string | null;
  createdAt: string | null;
}

interface StoryboardReviewClip {
  id: string;
  order: number;
  status: string;
  statusDetail: string;
  durationSeconds: number | null;
  model: string | null;
  videoPrompt: string;
  videoUrl?: string;
  referenceImageUrl?: string;
  startFrameUrl?: string;
  stopFrameUrl?: string;
  referenceImages: StoryboardReviewReferenceImage[];
}

interface StoryboardReviewProjectDetail extends StoryboardReviewProjectSummary {
  conceptDetails: string;
  clips: StoryboardReviewClip[];
}

interface ProductionMediaFileEntry {
  status: "loading" | "ready" | "failed";
  file?: File;
  objectUrl?: string;
  dragId?: string;
  dataUrl?: string;
}

type ProductionMediaPrepareJob = { url?: string | null; title: string; kind?: "image" | "video" };

const CAPTURE_STEPS = [
  "Detecting page",
  "Collecting DOM text",
  "Showing local review",
  "Applying edits/selections",
  "Uploading selected evidence",
  "Calling LLM extraction",
  "Preview ready",
];
const DEFAULT_SMARTSPEC_BASE_URL = "https://smartaihub.app";
const DEVICE_ID_KEY = "deviceId";
const LOCAL_AI_SETTINGS_KEY = "localAISettings";
const LOCAL_AI_CACHE_KEY = "localAIInsightCache";
const DIAGNOSTIC_LOG_KEY = "smartaihubDiagnosticLogs";
const DIAGNOSTIC_LOG_LIMIT = 200;
const LOCAL_AI_CACHE_SCHEMA_VERSION = "1.3";
const REVIEW_DRAFT_PREFIX = "marketplaceReviewDraft:";
const TOKEN_RENEWAL_WARNING_MS = 24 * 60 * 60 * 1000;
const EXTENSION_VERSION = "0.1.72";
const EXTENSION_BUILD_LABEL = "2026-05-29 20:43 +07";
const MIN_AUTO_SELECTED_IMAGE_SIDE = 100;
const SMARTAIHUB_DRAG_MEDIA_MIME = "application/x-smartaihub-drag-media-id";
const SMARTAIHUB_DRAG_MEDIA_PREFIX = "smartaihubDragMedia:";

function getLocalAIStatusView(input: {
  capability: LocalAICapability;
  provider: string;
  state: LocalAIWorkflowState;
  hasToken: boolean;
}) {
  const { capability, provider, state, hasToken } = input;
  if (state === "detecting_ai") {
    return {
      tone: "info",
      label: "Checking Chrome Prompt API",
      headline: "Checking local AI support...",
      description: "SmartSpecPro is checking whether this Chrome profile exposes Gemini Nano through Prompt API.",
      nextAction: "You can still capture the page while this check runs.",
    };
  }
  if (state === "downloading") {
    return {
      tone: "info",
      label: "Downloading",
      headline: "Chrome is downloading the local AI model",
      description: "The first local analysis may need Gemini Nano to be downloaded by Chrome.",
      nextAction: "Keep this panel open, or cancel and use SmartSpecPro AI fallback.",
    };
  }
  if (state === "analyzing_local") {
    return {
      tone: "success",
      label: "Running locally",
      headline: "Chrome Prompt API is analyzing on this device",
      description: "Captured marketplace data is being summarized locally before sync.",
      nextAction: "Wait for the Product Brief preview.",
    };
  }
  if (state === "analyzing_server") {
    return {
      tone: "fallback",
      label: "Server fallback",
      headline: "Using SmartSpecPro AI fallback",
      description: "Local AI is unavailable or failed, so the structured brief is generated by SmartSpecPro AI.",
      nextAction: "Existing capture continues normally.",
    };
  }
  if (state === "download_required" || capability.availability === "downloadable") {
    return {
      tone: "warning",
      label: "Download required",
      headline: "Chrome Prompt API is supported, but the model is not ready",
      description: "Chrome needs to download Gemini Nano before local AI analysis can run.",
      nextAction: "Click Generate AI Insight to start the user-triggered download, or use server fallback.",
    };
  }
  if (state === "local_ai_ready" && provider !== "chrome_prompt_api") {
    return {
      tone: "success",
      label: "Ready",
      headline: `Configured Local AI is ready (${provider})`,
      description: "Extension will ask the background service worker to call your configured localhost/native provider for structured analysis.",
      nextAction: "Scan a product, then AI Insight will use this provider before server fallback.",
    };
  }
  if (state === "local_ai_ready" || capability.availability === "available") {
    return {
      tone: "success",
      label: "Ready",
      headline: "Chrome Prompt API is ready",
      description: "Local AI can create structured Product Briefs on this device.",
      nextAction: "Scan a product, then AI Insight will run automatically when ready.",
    };
  }
  if (state === "fallback_ready" || provider === "server_ai") {
    return {
      tone: "fallback",
      label: "Fallback ready",
      headline: "Chrome Prompt API is not active here",
      description: "SmartSpecPro AI fallback is available because this extension is connected.",
      nextAction: "AI Insight will use server AI and keep raw capture sync off.",
    };
  }
  if (state === "synced") {
    return {
      tone: "success",
      label: "Synced",
      headline: "Structured insights were sent to SmartSpecPro",
      description: "Only validated structured insight payloads were synced.",
      nextAction: "Upload/confirm the capture next; these insights will be attached for downstream content work.",
    };
  }
  if (state === "cancelled") {
    return {
      tone: "warning",
      label: "Cancelled",
      headline: "Local AI analysis was cancelled",
      description: "The captured product is still available.",
      nextAction: "Run local AI again or use server fallback.",
    };
  }
  if (state === "failed") {
    return {
      tone: "danger",
      label: "Failed",
      headline: "AI analysis failed",
      description: "The captured data is still saved locally in this panel.",
      nextAction: "Try again, check Local AI, or use server fallback.",
    };
  }
  if (!capability.apiExposed || capability.availability === "unavailable") {
    return {
      tone: hasToken ? "fallback" : "neutral",
      label: hasToken ? "Fallback ready" : "Unavailable",
      headline: "Chrome Prompt API is unavailable in this Chrome profile",
      description: hasToken
        ? "Local Gemini Nano is not exposed here, but SmartSpecPro AI fallback can still create briefs."
        : "Local Gemini Nano is not exposed here. Capture still works, and connecting SmartSpecPro enables server AI fallback.",
      nextAction: hasToken ? "Generate AI Insight will use SmartSpecPro AI fallback." : "Connect SmartSpecPro to enable server AI fallback.",
    };
  }
  return {
    tone: "neutral",
    label: "Raw capture only",
    headline: "AI analysis is not active",
    description: "Marketplace capture still works without Chrome Prompt API.",
    nextAction: "You can upload selected evidence or connect SmartSpecPro for fallback.",
  };
}

function normalizeServerBaseUrl(raw: string | null | undefined): string {
  const value = (raw || "").trim();
  if (!value) return DEFAULT_SMARTSPEC_BASE_URL;

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
    const isIpv6 = hostname.includes(":");
    const isLocalhost = hostname === "localhost" || hostname.endsWith(".localhost");

    if (parsed.protocol !== "https:" || isIpv4 || isIpv6 || isLocalhost) {
      return DEFAULT_SMARTSPEC_BASE_URL;
    }

    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_SMARTSPEC_BASE_URL;
  }
}

function dataUrlToBlob(dataUrl: string) {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/data:(.*?);base64/)?.[1] || "image/png";
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) array[i] = bytes.charCodeAt(i);
  return new Blob([array], { type: mime });
}

function isLikelyImageBase64(value: string): boolean {
  const compact = value.replace(/\s+/g, "");
  return compact.length > 200
    && compact.length % 4 === 0
    && /^[A-Za-z0-9+/]+={0,2}$/.test(compact)
    && (compact.startsWith("/9j/") || compact.startsWith("iVBOR") || compact.startsWith("UklGR") || compact.startsWith("R0lGOD"));
}

function normalizeInlineImageSource(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("data:image/")) return trimmed;
  if (isLikelyImageBase64(trimmed)) {
    const compact = trimmed.replace(/\s+/g, "");
    const mime = compact.startsWith("/9j/") ? "image/jpeg"
      : compact.startsWith("iVBOR") ? "image/png"
      : compact.startsWith("UklGR") ? "image/webp"
      : "image/gif";
    return `data:${mime};base64,${compact}`;
  }
  return trimmed;
}

function resolveServerUrl(baseUrl: string, pathOrUrl: string): string {
  const value = normalizeInlineImageSource(pathOrUrl);
  if (!value) return "";
  if (value.startsWith("data:image/") || value.startsWith("blob:")) return value;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return `${baseUrl}${value.startsWith("/") ? "" : "/"}${value}`;
  }
}

function parseNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function parsePercent(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/-(\d+)%/);
  return m ? Number(m[1]) : null;
}

function parseSold(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = raw.toLowerCase().replace(/,/g, "").replace(/\s+/g, "");
  const m = text.match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  if (/m|ล้าน/.test(text)) return Math.round(n * 1_000_000);
  if (/k|พัน/.test(text)) return Math.round(n * 1_000);
  if (/หมื่น/.test(text)) return Math.round(n * 10_000);
  return Math.round(n);
}

function formatFullNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function appendNormalizedCount(raw: string | null | undefined): string {
  const value = raw?.trim();
  if (!value) return "";
  if (/\(\s*[\d,]+\s*\)/.test(value)) return value;
  const normalized = parseSold(value);
  if (normalized == null) return value;
  const rawNumber = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/)?.[0];
  const rawPlainNumber = rawNumber ? Number(rawNumber) : null;
  if (rawPlainNumber != null && Number.isFinite(rawPlainNumber) && Math.round(rawPlainNumber) === normalized && !/[kKmM]|พัน|หมื่น|ล้าน/i.test(value)) {
    return value;
  }
  return `${value} (${formatFullNumber(normalized)})`;
}

function parsePercentInput(value: string): number | null {
  const cleaned = value.replace("%", "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function businessMetrics(editable: EditableProduct) {
  const price = parseNumber(editable.priceCurrentText);
  const commissionRate = parsePercentInput(editable.commissionRateText);
  const commissionAmount = price != null && commissionRate != null ? price * commissionRate / 100 : null;
  return { price, commissionRate, commissionAmount };
}

function formatMoney(value: number | null): string {
  return value == null ? "-" : new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(value);
}

function reviewDraftKey(sourceUrl: string) {
  return `${REVIEW_DRAFT_PREFIX}${sourceUrl}`;
}

async function loadReviewDraft(sourceUrl: string): Promise<ReviewDraft | null> {
  const result = await chrome.storage.local.get([reviewDraftKey(sourceUrl)]);
  const draft = result[reviewDraftKey(sourceUrl)];
  return draft && typeof draft === "object" ? draft as ReviewDraft : null;
}

async function saveReviewDraft(sourceUrl: string, draft: ReviewDraft) {
  await chrome.storage.local.set({ [reviewDraftKey(sourceUrl)]: draft });
}

async function clearReviewDraft(sourceUrl: string) {
  await chrome.storage.local.remove([reviewDraftKey(sourceUrl)]);
}

function parseRating(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/[1-5](?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomHex(bytes: number) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getOrCreateDeviceId(): Promise<string> {
  const result = await chrome.storage.local.get([DEVICE_ID_KEY]);
  const existing = String(result[DEVICE_ID_KEY] || "");
  if (/^mdev_[a-f0-9]{64}$/.test(existing)) return existing;
  const next = `mdev_${randomHex(32)}`;
  await chrome.storage.local.set({ [DEVICE_ID_KEY]: next });
  return next;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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

function decodeJwtExpiresAt(token: string): string | null {
  const decoded = decodeJwtPayload(token);
  return typeof decoded?.exp === "number" ? new Date(decoded.exp * 1000).toISOString() : null;
}

function decodeJwtDeviceHash(token: string): string {
  const decoded = decodeJwtPayload(token);
  return typeof decoded?.deviceIdHash === "string" ? decoded.deviceIdHash.trim() : "";
}

function decodeJwtOrigin(token: string): string {
  const decoded = decodeJwtPayload(token);
  return typeof decoded?.origin === "string" ? decoded.origin.trim() : "";
}

async function assertTokenMatchesExtensionBinding(token: string, deviceId: string) {
  const tokenDeviceHash = decodeJwtDeviceHash(token);
  if (!tokenDeviceHash) {
    throw new Error("Token นี้ยังไม่ได้ผูกกับเครื่อง กรุณากด Connect และ generate token ใหม่จาก extension บนเครื่องนี้");
  }
  const localHash = await sha256Hex(deviceId);
  if (tokenDeviceHash !== localHash) {
    throw new Error("Token นี้ผูกกับเครื่องอื่น กรุณา generate token ใหม่บนเครื่องนี้");
  }
  const tokenOrigin = decodeJwtOrigin(token);
  const localOrigin = `chrome-extension://${chrome.runtime.id}`;
  if (tokenOrigin && tokenOrigin !== localOrigin) {
    throw new Error(`Token นี้ออกให้ Chrome Extension ID คนละตัว (${tokenOrigin}) แต่ตัวที่กำลังใช้อยู่คือ ${localOrigin} กรุณากด Connect SmartAIHub จาก extension ตัวนี้ใหม่`);
  }
}

function userFriendlyErrorMessage(error: unknown, extensionOrigin?: string): string {
  const raw = error instanceof Error ? error.message : String(error || "");
  if (raw === "local_ai_provider_not_allowed") {
    return "Local AI provider is not selected. Choose Ollama for /api/chat, choose an OpenAI-compatible provider for /v1/chat/completions, or keep Auto with one of those endpoint paths.";
  }
  if (raw === "local_ai_ollama_origin_forbidden" || raw === "local_ai_http_403") {
    const origin = extensionOrigin || "chrome-extension://<extension-id>";
    return `Ollama rejected the Chrome extension origin (403). Set OLLAMA_ORIGINS=${origin} or use OLLAMA_ORIGINS=* for development only, then restart Ollama.`;
  }
  if (raw.startsWith("local_ai_http_")) {
    return `Local AI endpoint returned HTTP ${raw.replace("local_ai_http_", "")}. Check that the server is running, the endpoint path is correct, and the model name exists.`;
  }
  if (raw === "local_ai_endpoint_path_not_allowed") return "Local AI endpoint path is not allowed. Ollama must use /api/chat. OpenAI-compatible servers must use /v1/chat/completions.";
  if (raw === "local_ai_endpoint_must_be_localhost_http") return "Local AI endpoint must be http://localhost or http://127.0.0.1.";
  try {
    const parsed = JSON.parse(raw);
    const code = parsed?.error?.code ?? parsed?.code;
    const message = parsed?.error?.message ?? parsed?.message;
    if (code === "extension_device_required") {
      return "Token ยังไม่หมดอายุ แต่ request นี้ไม่มี device binding header กรุณากด Save connection อีกครั้ง ถ้ายังไม่หายให้กด Connect SmartAIHub เพื่อออก token ใหม่จาก extension นี้";
    }
    if (code === "extension_device_mismatch") {
      return "Token นี้ผูกกับ Chrome Extension คนละตัว/คนละเครื่อง กรุณากด Connect SmartAIHub เพื่อออก token ใหม่จาก extension นี้";
    }
    if (code === "extension_origin_mismatch") {
      const origin = extensionOrigin || "chrome-extension://<extension-id>";
      return `Token นี้ออกให้ Chrome Extension ID คนละตัวกับตัวที่กำลังใช้อยู่ (${origin}) กรุณากด Replace token หรือ Connect SmartAIHub เพื่อออก token ใหม่จาก extension นี้`;
    }
    if (code === "extension_token_mismatch" || code === "extension_pairing_expired" || code === "extension_pairing_inactive") {
      return "Token นี้ถูก revoke หรือ pairing ไม่ตรงแล้ว กรุณากด Connect SmartAIHub เพื่อออก token ใหม่";
    }
    if (message === "local_ai_ollama_origin_forbidden" || message === "local_ai_http_403") {
      const origin = extensionOrigin || "chrome-extension://<extension-id>";
      return `Ollama rejected the Chrome extension origin (403). Set OLLAMA_ORIGINS=${origin} or use OLLAMA_ORIGINS=* for development only, then restart Ollama.`;
    }
    if (message === "local_ai_provider_not_allowed") {
      return "Local AI provider is not selected. Choose Ollama for /api/chat, choose an OpenAI-compatible provider for /v1/chat/completions, or keep Auto with one of those endpoint paths.";
    }
    if (typeof message === "string" && message.trim()) return message;
  } catch {
    // Raw message is already plain text.
  }
  return raw || "Unexpected error";
}

function extensionAuthErrorCode(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || "");
  try {
    const parsed = JSON.parse(raw);
    return String(parsed?.error?.code ?? parsed?.code ?? "");
  } catch {
    return "";
  }
}

function shouldReplaceExtensionToken(error: unknown): boolean {
  return [
    "extension_origin_mismatch",
    "extension_device_mismatch",
    "extension_device_required",
    "extension_token_mismatch",
    "extension_pairing_expired",
    "extension_pairing_inactive",
    "extension_pairing_not_found",
  ].includes(extensionAuthErrorCode(error));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "-";
  return new Date(time).toLocaleString();
}

function tokenExpiryStatus(expiresAt: string | null | undefined) {
  if (!expiresAt) return { label: "ไม่พบวันหมดอายุ กรุณาขอ token ใหม่", warning: true };
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return { label: "Token หมดอายุแล้ว กรุณาขอ token ใหม่", warning: true };
  if (remainingMs <= TOKEN_RENEWAL_WARNING_MS) return { label: "Token ใกล้หมดอายุใน 1 วัน กรุณาขอ token ใหม่", warning: true };
  const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  return { label: `Token ใช้งานได้อีกประมาณ ${remainingDays} วัน`, warning: false };
}

function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    const lastSegment = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) || "");
    const cleaned = lastSegment.replace(/[\\/:*?"<>|]+/g, "-");
    const fallbackExtension = fallback.match(/\.([a-z0-9]+)$/i)?.[1] || "";
    if (cleaned.length <= 180 && /\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i.test(cleaned)) return cleaned;
    if (cleaned && fallbackExtension && !cleaned.includes(";base64")) return `${cleaned}.${fallbackExtension}`;
    return fallback;
  } catch {
    return fallback;
  }
}

function startProductionMediaDrag(event: DragEvent<HTMLElement>, input: { url: string; title: string; kind: "image" | "video"; file?: File; dragId?: string }) {
  event.dataTransfer.effectAllowed = "copy";
  if (input.file) {
    try {
      event.dataTransfer.clearData();
      event.dataTransfer.items.clear();
      if (input.dragId) {
        event.dataTransfer.setData(SMARTAIHUB_DRAG_MEDIA_MIME, input.dragId);
      }
      event.dataTransfer.items.add(input.file);
      if (input.dragId) {
        void chrome.runtime.sendMessage({ type: "SMARTAIHUB_START_DRAG_MEDIA", id: input.dragId });
      }
      return;
    } catch {
      event.preventDefault();
      return;
    }
  }
  event.preventDefault();
}

function endProductionMediaDrag(input: { dragId?: string }) {
  if (!input.dragId) return;
  void chrome.runtime.sendMessage({ type: "SMARTAIHUB_END_DRAG_MEDIA", id: input.dragId });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read media"));
    reader.readAsDataURL(blob);
  });
}

function createDragMediaId() {
  const random = new Uint32Array(4);
  crypto.getRandomValues(random);
  return `${SMARTAIHUB_DRAG_MEDIA_PREFIX}${Array.from(random, (value) => value.toString(16).padStart(8, "0")).join("")}`;
}

function toEditableProduct(product: ProductCapturePayload): EditableProduct {
  return {
    productName: product.productName || "",
    brand: "",
    shopName: product.shopName || "",
    priceCurrentText: product.priceCurrentText || "",
    commissionRateText: product.commissionRatePercent != null ? String(product.commissionRatePercent) : product.commissionRateText || "",
    affiliateUrl: product.affiliateUrl || "",
    soldCountText: appendNormalizedCount(product.soldCountText),
    ratingScoreText: product.ratingScoreText || "",
    reviewCountText: appendNormalizedCount(product.reviewCountText),
    categoryText: product.categoryText || "",
    stockText: product.stockText || "",
    variantsText: product.variantsText || "",
    sellerLocationText: product.sellerLocationText || "",
    descriptionText: product.descriptionText || "",
  };
}

function selectedImagesFromProduct(product: ProductCapturePayload) {
  return Object.fromEntries(product.imageCandidates.map((img) => [img.url, img.kind === "main" && img.selected !== false && canAutoSelectImage(img)]));
}

function selectedImagesForProduct(product: ProductCapturePayload, selected: Record<string, boolean>) {
  const urls = new Set(product.imageCandidates.map((image) => image.url));
  return Object.fromEntries(Object.entries(selected).filter(([url]) => urls.has(url)));
}

function imageDimension(image: ImageCandidate, axis: "width" | "height"): number | null {
  const direct = Number(image[axis]);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const metadataValue = Number(image.metadata?.[axis]);
  return Number.isFinite(metadataValue) && metadataValue > 0 ? metadataValue : null;
}

function isBelowAutoSelectResolution(image: ImageCandidate): boolean {
  const width = imageDimension(image, "width");
  const height = imageDimension(image, "height");
  return (width != null && width < MIN_AUTO_SELECTED_IMAGE_SIDE) || (height != null && height < MIN_AUTO_SELECTED_IMAGE_SIDE);
}

function canAutoSelectImage(image: ImageCandidate): boolean {
  return !isBelowAutoSelectResolution(image);
}

function isLowQualityImage(image: ImageCandidate): boolean {
  const width = imageDimension(image, "width");
  const height = imageDimension(image, "height");
  if (width == null || height == null) return false;
  return Math.min(width, height) < 300 || width * height < 160_000;
}

function imageQualityLabel(image: ImageCandidate): string {
  const width = imageDimension(image, "width");
  const height = imageDimension(image, "height");
  if (width == null || height == null) return "quality unknown";
  return `${Math.round(width)}x${Math.round(height)} ${isLowQualityImage(image) ? "low" : "ok"}`;
}

function imageResolutionScore(image: ImageCandidate): number {
  const width = imageDimension(image, "width") ?? 0;
  const height = imageDimension(image, "height") ?? 0;
  return width * height;
}

function imageKindPriority(kind: ImageCandidate["kind"]): number {
  if (kind === "main") return 0;
  if (kind === "description") return 1;
  if (kind === "review") return 2;
  if (kind === "unknown") return 3;
  return 4;
}

function sortProductImagesForReview(images: ImageCandidate[]): ImageCandidate[] {
  return images.slice().sort((left, right) => {
    const kindDiff = imageKindPriority(left.kind) - imageKindPriority(right.kind);
    if (kindDiff !== 0) return kindDiff;
    const resolutionDiff = imageResolutionScore(right) - imageResolutionScore(left);
    if (resolutionDiff !== 0) return resolutionDiff;
    return (left.position ?? 9999) - (right.position ?? 9999);
  });
}

function fieldEvidenceText(product: ProductCapturePayload | null, field: string): string {
  const item = product?.fieldEvidence?.[field];
  if (!item) return "source: manual / not detected";
  const confidence = `${Math.round(item.confidence * 100)}%`;
  const normalized = item.normalized != null ? ` | normalized: ${Array.isArray(item.normalized) ? item.normalized.join(" > ") : String(item.normalized)}` : "";
  return `source: ${item.source} | confidence ${confidence}${normalized}`;
}

function imageBadges(image: ImageCandidate, heroImageUrl: string): string[] {
  const badges = new Set<string>();
  if (image.url === heroImageUrl) badges.add("Hero");
  if (image.kind === "main") badges.add("Product");
  if (image.kind === "review") badges.add("Review proof");
  if (image.kind === "description") badges.add("Description");
  if (image.kind === "related") badges.add("Related");
  if (image.kind === "unknown") badges.add("Unknown");
  if (isLowQualityImage(image) || image.quality === "low" || image.metadata?.quality === "low_resolution") badges.add("Low-res");
  if (image.metadata?.warning) badges.add(String(image.metadata.warning));
  return Array.from(badges);
}

function imageSelectionReason(image: ImageCandidate, heroImageUrl: string): string {
  const badges = imageBadges(image, heroImageUrl);
  if (badges.includes("Related")) return "Avoid as hero unless you need related-product context";
  if (badges.includes("Low-res")) return "Low resolution; may be weak for video or ads";
  if (badges.includes("Review proof")) return "Useful as proof, not ideal as hero";
  if (badges.includes("Hero")) return "Selected as downstream hero image";
  if (badges.includes("Product")) return "Good candidate for catalog/media";
  return "Verify this is the product before syncing";
}

function qualityGroups(input: {
  editable: EditableProduct;
  selectedImageCount: number;
  heroImageUrl: string;
  selectedEvidenceCount: number;
}) {
  const { editable, selectedImageCount, heroImageUrl, selectedEvidenceCount } = input;
  return [
    {
      label: "Catalog required",
      items: [
        { label: "Name", ok: Boolean(editable.productName.trim()) },
        { label: "Price", ok: Boolean(editable.priceCurrentText.trim()) },
        { label: "Category", ok: Boolean(editable.categoryText.trim()) },
        { label: "Selected image", ok: selectedImageCount > 0 },
      ],
    },
    {
      label: "Content / Video required",
      items: [
        { label: "Hero image", ok: Boolean(heroImageUrl) },
        { label: "Description", ok: Boolean(editable.descriptionText.trim()) },
        { label: "Evidence group", ok: selectedEvidenceCount > 0 },
        { label: "Seller or review signal", ok: Boolean(editable.shopName.trim() || editable.ratingScoreText.trim() || editable.reviewCountText.trim()) },
      ],
    },
    {
      label: "Business optional",
      items: [
        { label: "Commission rate", ok: parsePercentInput(editable.commissionRateText) != null },
        { label: "Sold count", ok: Boolean(editable.soldCountText.trim()) },
        { label: "Stock", ok: Boolean(editable.stockText.trim()) },
        { label: "Variants", ok: Boolean(editable.variantsText.trim()) },
      ],
    },
  ];
}

function withReviewedImages(product: ProductCapturePayload, selectedImages: Record<string, boolean>, heroImageUrl: string): ImageCandidate[] {
  return product.imageCandidates.map((img, position) => ({
    ...img,
    position,
    selected: Boolean(selectedImages[img.url]),
    metadata: {
      ...img.metadata,
      evidenceId: img.metadata?.evidenceId || `image:${position + 1}`,
      selectedByUser: Boolean(selectedImages[img.url]),
      role: img.url === heroImageUrl ? "hero" : img.kind,
      quality: isLowQualityImage(img) ? "low_resolution" : "usable",
      qualityLabel: imageQualityLabel(img),
    },
  }));
}

function buildReviewedProductPayload(input: {
  product: ProductCapturePayload;
  editable: EditableProduct;
  selectedImages: Record<string, boolean>;
  heroImageUrl: string;
}): ProductCapturePayload {
  const { product, editable, selectedImages, heroImageUrl } = input;
  const affiliateUrl = normalizedAffiliateUrl(editable.affiliateUrl);
  return {
    ...product,
    productName: editable.productName,
    shopName: editable.shopName,
    priceCurrentText: editable.priceCurrentText,
    commissionRatePercent: parsePercentInput(editable.commissionRateText),
    commissionRateText: editable.commissionRateText,
    affiliateUrl,
    soldCountText: editable.soldCountText,
    ratingScoreText: editable.ratingScoreText,
    reviewCountText: editable.reviewCountText,
    categoryText: editable.categoryText,
    stockText: editable.stockText,
    variantsText: editable.variantsText,
    sellerLocationText: editable.sellerLocationText,
    descriptionText: editable.descriptionText,
    imageCandidates: withReviewedImages(product, selectedImages, heroImageUrl),
    fieldWarnings: [
      ...(editable.brand ? [] : ["missing_brand"]),
      ...(editable.priceCurrentText ? [] : ["missing_price"]),
      ...(editable.categoryText ? [] : ["missing_category"]),
      ...(editable.descriptionText ? [] : ["missing_description"]),
      ...(editable.commissionRateText && parsePercentInput(editable.commissionRateText) == null ? ["invalid_commission_rate"] : []),
      ...(editable.affiliateUrl && !normalizedAffiliateUrl(editable.affiliateUrl) ? ["invalid_affiliate_url"] : []),
    ],
    fieldEvidence: {
      ...((product as any).fieldEvidence ?? {}),
      productName: { text: editable.productName, source: "user_review", confidence: 0.95 },
      brand: { text: editable.brand, source: "user_review", confidence: editable.brand ? 0.95 : 0.2 },
      shopName: { text: editable.shopName, source: "user_review", confidence: editable.shopName ? 0.9 : 0.2 },
      priceCurrentText: { text: editable.priceCurrentText, source: "user_review", confidence: editable.priceCurrentText ? 0.95 : 0.2, normalized: parseNumber(editable.priceCurrentText) },
      commissionRate: { text: editable.commissionRateText, source: "user_review", confidence: editable.commissionRateText ? 0.95 : 0.2, normalized: parsePercentInput(editable.commissionRateText) },
      affiliateUrl: { text: affiliateUrl ?? "", source: "user_review", confidence: affiliateUrl ? 0.95 : 0.2, normalized: affiliateUrl },
      soldCountText: { text: editable.soldCountText, source: "user_review", confidence: editable.soldCountText ? 0.9 : 0.2, normalized: parseSold(editable.soldCountText) },
      ratingScoreText: { text: editable.ratingScoreText, source: "user_review", confidence: editable.ratingScoreText ? 0.9 : 0.2, normalized: parseRating(editable.ratingScoreText) },
      reviewCountText: { text: editable.reviewCountText, source: "user_review", confidence: editable.reviewCountText ? 0.9 : 0.2, normalized: parseSold(editable.reviewCountText) },
      categoryText: { text: editable.categoryText, source: "user_review", confidence: editable.categoryText ? 0.9 : 0.2 },
      stockText: { text: editable.stockText, source: "user_review", confidence: editable.stockText ? 0.85 : 0.2 },
      sellerLocationText: { text: editable.sellerLocationText, source: "user_review", confidence: editable.sellerLocationText ? 0.85 : 0.2 },
      variantsText: { text: editable.variantsText, source: "user_review", confidence: editable.variantsText ? 0.85 : 0.2 },
      descriptionText: { text: editable.descriptionText.slice(0, 1200), source: "user_review", confidence: editable.descriptionText ? 0.85 : 0.2 },
    },
  } as ProductCapturePayload;
}

function buildDataQualityWarnings(input: {
  product: ProductCapturePayload | null;
  editable: EditableProduct;
  selectedImageCount: number;
  selectedEvidenceCount: number;
  lowQualityImageCount: number;
  selectedProductImages: ImageCandidate[];
  heroImageUrl: string;
}): string[] {
  const { product, editable, selectedImageCount, selectedEvidenceCount, lowQualityImageCount, selectedProductImages, heroImageUrl } = input;
  if (!product) return [];
  const heroImage = selectedProductImages.find((image) => image.url === heroImageUrl);
  const selectedReviewAsHero = heroImage?.kind === "review";
  return [
    !editable.productName.trim() ? "ยังไม่มีชื่อสินค้า" : "",
    !editable.priceCurrentText.trim() ? "ยังไม่มีราคา" : "",
    editable.commissionRateText.trim() && parsePercentInput(editable.commissionRateText) == null ? "Commission rate ต้องเป็นเปอร์เซ็นต์ 0-100" : "",
    editable.affiliateUrl.trim() && !normalizedAffiliateUrl(editable.affiliateUrl) ? "Affiliate link ต้องเป็น URL แบบ http(s)" : "",
    editable.commissionRateText.trim() && !editable.priceCurrentText.trim() ? "มี commission rate แต่ยังไม่มีราคา จึงคำนวณ commission amount ไม่ได้" : "",
    !editable.categoryText.trim() ? "ยังไม่มีหมวดหมู่" : "",
    !editable.descriptionText.trim() ? "ยังไม่มีคำอธิบายสินค้า" : "",
    editable.soldCountText.trim() && !editable.ratingScoreText.trim() ? "มียอดขายแต่ยังไม่มี rating ควรตรวจสอบก่อนใช้ทำคอนเทนต์" : "",
    selectedImageCount === 0 ? "ยังไม่ได้เลือกรูปสินค้า" : "",
    heroImageUrl && !heroImage ? "Hero image ไม่อยู่ในภาพที่เลือก" : "",
    selectedReviewAsHero ? "Hero image เป็นรูปรีวิว ควรใช้เป็น proof มากกว่าภาพหลัก" : "",
    selectedEvidenceCount === 0 ? "ยังไม่ได้เลือก evidence ที่จะส่ง" : "",
    lowQualityImageCount > 0 ? `มีรูปที่ความละเอียดต่ำ ${lowQualityImageCount} รูป อาจไม่คมพอสำหรับวิดีโอ/โฆษณา` : "",
    product.imageCandidates.length > 80 ? `มีรูปทั้งหมด ${product.imageCandidates.length} รูป แต่แสดงทีละ 80 รูปตาม filter` : "",
  ].filter(Boolean);
}

function storytellingReadinessLabel(readiness: string) {
  if (readiness === "ready_for_storytelling") return "พร้อมแนบเป็น insight สำหรับงานวิดีโอ";
  if (readiness === "ready_with_warnings") return "แนบได้ แต่มีคำเตือน";
  if (readiness === "needs_user_review") return "ต้องตรวจ claim/รูปก่อน";
  if (readiness === "insufficient_evidence") return "หลักฐานยังไม่พอ";
  return readiness;
}

function storytellingBlockerLabel(blocker: string) {
  const labels: Record<string, string> = {
    low_resolution_or_mismatch_risk_image: "รูปที่เลือกอาจความละเอียดต่ำหรือเสี่ยงไม่ตรงสินค้า ให้กลับไปเลือก hero/main image ที่ชัดกว่า หรือดึงรูปเพิ่ม",
    product_image_mismatch_risk: "มีรูปที่เสี่ยงไม่ใช่สินค้านี้ ให้เปลี่ยน/เอารูปนั้นออกก่อน",
    missing_selected_product_image: "ยังไม่มีรูปสินค้าที่เลือกสำหรับส่งต่อไปทำวิดีโอ",
    unsupported_claims_need_review: "มี claim ที่ยังไม่มีหลักฐานพอ ให้ Approve/Edit/Remove ก่อนส่งต่อ",
    missing_local_or_server_insight: "ยังไม่มี AI Insight ที่ sync แล้ว ให้ Generate AI Insight หรือ Sync to backend",
    story_options_need_more_specific_input: "Story options ยังซ้ำหรือกว้างเกินไป ให้เพิ่มข้อมูลสินค้า/use case หรือ Generate AI Insight ใหม่ก่อนใช้ต่อ",
  };
  return labels[blocker] ?? blocker;
}

function canAttachStorytellingInsight(readiness?: string) {
  return readiness === "ready_for_storytelling" || readiness === "ready_with_warnings";
}

function compactAskText(value: unknown, max = 220) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function uniqueList(items: string[], max = 6) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items.map((value) => compactAskText(value, 120)).filter(Boolean)) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
    if (result.length >= max) break;
  }
  return result;
}

function buildSearchUrl(kind: "shopee" | "google", keyword: string) {
  const encoded = encodeURIComponent(keyword);
  return kind === "shopee"
    ? `https://shopee.co.th/search?keyword=${encoded}`
    : `https://www.google.com/search?q=${encoded}`;
}

function likelyHealthOrChildClaim(question: string) {
  return /(ท้องอืด|เด็ก|ทารก|ป่วย|รักษา|ยา|แพ้|ผื่น|โรค|medical|health|cure|treat)/i.test(question);
}

function buildAskContext(input: {
  editable: EditableProduct;
  product: ProductCapturePayload | null;
  productBrief: ProductBrief | null;
  storytellingHandoff: MarketplaceStorytellingHandoff | null;
}) {
  const { editable, product, productBrief, storytellingHandoff } = input;
  return [
    editable.productName || product?.productName ? `สินค้า: ${editable.productName || product?.productName}` : "",
    editable.categoryText ? `หมวดหมู่: ${editable.categoryText}` : "",
    editable.priceCurrentText ? `ราคา: ${editable.priceCurrentText}` : "",
    editable.ratingScoreText ? `Rating: ${editable.ratingScoreText}` : "",
    editable.soldCountText ? `ยอดขาย: ${editable.soldCountText}` : "",
    editable.descriptionText ? `รายละเอียด: ${compactAskText(editable.descriptionText, 900)}` : "",
    productBrief?.keySellingPoints.length ? `จุดขาย: ${productBrief.keySellingPoints.slice(0, 5).join("; ")}` : "",
    productBrief?.buyerObjections.length ? `ข้อกังวล: ${productBrief.buyerObjections.slice(0, 4).join("; ")}` : "",
    storytellingHandoff?.storyOptions.length ? `Story options: ${storytellingHandoff.storyOptions.slice(0, 4).map((option) => `${option.title}: ${option.audience} / ${option.useCase}`).join("; ")}` : "",
  ].filter(Boolean).join("\n");
}

function buildAskKeywords(question: string, editable: EditableProduct, productBrief: ProductBrief | null) {
  const productName = compactAskText(editable.productName, 80);
  const category = compactAskText(editable.categoryText, 80);
  const questionCore = compactAskText(question.replace(/[?？]/g, ""), 120);
  const queryIntent = compactAskText(question
    .replace(/(มี|หา|ค้นหา|ช่วยหา|อยากได้|อันไหน|แบบไหน|เหมาะกับ|ใช้กับ|สำหรับ|ได้ไหม|ไหม|บ้าง|ที่|จะ|เป็น|หรือ)/gi, " ")
    .replace(/\s+/g, " "), 80);
  const isBathroom = /(ห้องน้ำ|bathroom|toilet)/i.test(question);
  const isGift = /(ของฝาก|ของขวัญ|gift)/i.test(question);
  const isElderly = /(ผู้สูงอายุ|คนแก่|elderly|senior)/i.test(question);
  const isWheelchair = /(รถเข็น|wheelchair|วีลแชร์|ผู้ป่วย)/i.test(question);
  const isTissue = /(ทิชชู่|กระดาษ|tissue)/i.test(`${question} ${category} ${productName}`);
  const isWallMounted = /(แขวนผนัง|ติดผนัง|wall|ตั้งโต๊ะ|โต๊ะ)/i.test(question);
  const highLoad = /(รับน้ำหนัก|น้ำหนัก|heavy|100\s*กก|kg|กิโล)/i.test(question);
  const shopee = uniqueList([
    isBathroom ? "กระดาษทิชชู่ ห้องน้ำ" : "",
    isBathroom ? "ทิชชู่เปียก ห้องน้ำ" : "",
    isWheelchair && highLoad ? "รถเข็นผู้สูงอายุ รับน้ำหนักมาก" : "",
    isWheelchair ? "รถเข็นผู้ป่วย ผู้สูงอายุ" : "",
    isWheelchair ? "วีลแชร์ผู้สูงอายุ พับได้" : "",
    isTissue && isWallMounted ? "กระดาษทิชชู่แบบแขวนผนัง" : "",
    isTissue && isWallMounted ? "กล่องทิชชู่ติดผนัง วางโต๊ะ" : "",
    isGift && category ? `${category} ของฝาก` : "",
    isElderly && category ? `${category} ผู้สูงอายุ` : "",
    productName && isElderly ? `${productName} ผู้สูงอายุ` : "",
    productName && isGift ? `${productName} ของฝาก` : "",
    category && queryIntent ? `${category} ${queryIntent}` : "",
    !category && queryIntent ? queryIntent : "",
    !queryIntent && questionCore ? questionCore : "",
  ].map((item) => compactAskText(item, 90)));
  const google = uniqueList([
    productName ? `${productName} รีวิว` : "",
    category ? `${category} วิธีเลือก` : "",
    isWheelchair ? "วิธีเลือกรถเข็นผู้สูงอายุ รับน้ำหนัก" : "",
    isTissue && isWallMounted ? "กระดาษทิชชู่แบบแขวนผนัง วิธีเลือก" : "",
    isElderly && category ? `${category} เหมาะกับผู้สูงอายุไหม` : "",
    isGift && category ? `${category} เหมาะเป็นของฝากไหม` : "",
    likelyHealthOrChildClaim(question) ? `${questionCore} คำแนะนำแพทย์ เภสัชกร` : "",
    productBrief?.buyerObjections[0] ? `${productBrief.buyerObjections[0]} วิธีตรวจสอบ` : "",
    queryIntent || questionCore,
  ].map((item) => compactAskText(item, 100)));
  return { shopeeKeywords: shopee, googleKeywords: google };
}

function parseAskAIJson(text: string, fallback: AskResult): AskResult | null {
  const raw = text.trim();
  const jsonText = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
    || raw.match(/\{[\s\S]*\}/)?.[0]
    || raw;
  try {
    const parsed = JSON.parse(jsonText);
    const arrayOfText = (value: unknown, max: number) => Array.isArray(value)
      ? uniqueList(value.map((item) => compactAskText(item, 100)).filter(Boolean)).slice(0, max)
      : [];
    const answer = compactAskText(parsed?.answer, 1400);
    const shopeeKeywords = arrayOfText(parsed?.shopeeKeywords, 6);
    const googleKeywords = arrayOfText(parsed?.googleKeywords, 6);
    const cautions = arrayOfText(parsed?.cautions, 5);
    if (!answer && shopeeKeywords.length === 0 && googleKeywords.length === 0) return null;
    return {
      answer: answer || fallback.answer,
      source: "local_ai",
      shopeeKeywords: shopeeKeywords.length > 0 ? shopeeKeywords : fallback.shopeeKeywords,
      googleKeywords: googleKeywords.length > 0 ? googleKeywords : fallback.googleKeywords,
      cautions: uniqueList([...fallback.cautions, ...cautions]).slice(0, 6),
    };
  } catch {
    return null;
  }
}

function isConfiguredLocalAIProvider(provider: LocalAIProviderId | string) {
  return provider === "ollama"
    || provider === "lm_studio"
    || provider === "localai"
    || provider === "llama_cpp"
    || provider === "custom_http"
    || provider === "native_messaging";
}

function configuredProviderLabel(provider: string) {
  const labels: Record<string, string> = {
    auto: "Auto",
    chrome_prompt_api: "Chrome Gemini Nano",
    ollama: "Ollama",
    lm_studio: "LM Studio",
    localai: "LocalAI",
    llama_cpp: "llama.cpp server",
    custom_http: "Custom localhost HTTP",
    native_messaging: "Native Messaging",
  };
  return labels[provider] || provider;
}

function defaultEndpointForProvider(provider: string) {
  if (provider === "ollama") return "http://localhost:11434/api/chat";
  if (provider === "custom_http") return "http://localhost:8000/api/chat";
  return "http://localhost:1234/v1/chat/completions";
}

function modelPreset(name: string, options: Pick<LocalModelPreset, "vision" | "cloud"> = {}): LocalModelPreset {
  return { name, ...options };
}

function expandOllamaVisionModel(name: string, sizes: string[], options: { cloud?: boolean } = {}) {
  const localTags = [modelPreset(name, { vision: true }), ...sizes.map((size) => modelPreset(`${name}:${size}`, { vision: true }))];
  return options.cloud
    ? [modelPreset(`${name}:cloud`, { vision: true, cloud: true }), ...localTags]
    : localTags;
}

function uniqueModelPresets(presets: LocalModelPreset[]) {
  const seen = new Set<string>();
  return presets.filter((preset) => {
    if (seen.has(preset.name)) return false;
    seen.add(preset.name);
    return true;
  });
}

function ollamaVisionModelPresets() {
  return uniqueModelPresets([
    ...expandOllamaVisionModel("gemma4", ["e2b", "e4b", "26b", "31b"], { cloud: true }),
    ...expandOllamaVisionModel("qwen3.5", ["0.8b", "2b", "4b", "9b", "27b", "35b", "122b"], { cloud: true }),
    ...expandOllamaVisionModel("qwen3.6", ["27b", "35b"]),
    ...expandOllamaVisionModel("qwen3-vl", ["2b", "4b", "8b", "30b", "32b", "235b"], { cloud: true }),
    ...expandOllamaVisionModel("gemma3", ["270m", "1b", "4b", "12b", "27b"], { cloud: true }),
    ...expandOllamaVisionModel("ministral-3", ["3b", "8b", "14b"], { cloud: true }),
    ...expandOllamaVisionModel("translategemma", ["4b", "12b", "27b"]),
    ...expandOllamaVisionModel("medgemma", ["4b", "27b"]),
    ...expandOllamaVisionModel("medgemma1.5", ["4b"]),
    ...expandOllamaVisionModel("llava", ["7b", "13b", "34b"]),
    ...expandOllamaVisionModel("mistral-small3.2", ["24b"]),
    ...expandOllamaVisionModel("deepseek-ocr", ["3b"]),
    ...expandOllamaVisionModel("glm-ocr", ["latest"]),
    ...expandOllamaVisionModel("nemotron3", ["33b"]),
    ...expandOllamaVisionModel("mistral-medium-3.5", ["128b"]),
    ...expandOllamaVisionModel("gemini-3-flash-preview", ["latest"], { cloud: true }),
    ...expandOllamaVisionModel("kimi-k2.6", ["latest"], { cloud: true }),
    ...expandOllamaVisionModel("devstral-small-2", ["24b"], { cloud: true }),
    ...expandOllamaVisionModel("kimi-k2.5", ["latest"], { cloud: true }),
    ...expandOllamaVisionModel("mistral-large-3", ["latest"], { cloud: true }),
  ]);
}

function modelPresetsForProvider(provider: string): LocalModelPreset[] {
  const common = [
    modelPreset("gemma3:4b", { vision: true }),
    modelPreset("gemma3:12b", { vision: true }),
    modelPreset("qwen3-vl:8b", { vision: true }),
    modelPreset("qwen2.5:7b"),
    modelPreset("qwen2.5vl:7b", { vision: true }),
    modelPreset("llama3.1:8b"),
    modelPreset("llava:7b", { vision: true }),
    modelPreset("llava-llama3:8b", { vision: true }),
    modelPreset("minicpm-v:8b", { vision: true }),
  ];
  if (provider === "ollama") {
    return uniqueModelPresets([
      ...ollamaVisionModelPresets(),
      modelPreset("qwen2.5:7b"),
      modelPreset("qwen2.5:14b"),
      modelPreset("llama3.1:8b"),
      modelPreset("llama3.2:3b"),
      modelPreset("mistral:7b"),
      modelPreset("phi3:mini"),
    ]);
  }
  if (provider === "lm_studio" || provider === "localai" || provider === "llama_cpp" || provider === "custom_http") {
    return uniqueModelPresets([
      modelPreset("local-model"),
      modelPreset("qwen2.5-vl-7b-instruct", { vision: true }),
      modelPreset("qwen2.5-7b-instruct"),
      modelPreset("gemma-3-4b-it", { vision: true }),
      modelPreset("gemma-3-12b-it", { vision: true }),
      modelPreset("llama-3.1-8b-instruct"),
      modelPreset("llava-v1.6-vicuna-7b", { vision: true }),
      modelPreset("minicpm-v-2_6", { vision: true }),
      ...common,
    ]);
  }
  return common;
}

function localProviderEndpointAllowed(settings: LocalAISettings) {
  if (settings.localProviderMode === "native_messaging") return Boolean(settings.nativeHostName.trim());
  if (settings.localProviderMode === "auto" || settings.localProviderMode === "chrome_prompt_api") return true;
  if (!isConfiguredLocalAIProvider(settings.localProviderMode) && settings.localProviderMode !== "auto") return true;
  try {
    const url = new URL(settings.localEndpointUrl);
    const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname.toLowerCase());
    if (!local) return false;
    return true;
  } catch {
    return false;
  }
}

function effectiveConfiguredProvider(settings: LocalAISettings): LocalAIProviderId | "" {
  if (isConfiguredLocalAIProvider(settings.localProviderMode)) return settings.localProviderMode as LocalAIProviderId;
  if (settings.localProviderMode !== "auto") return "";
  try {
    const url = new URL(settings.localEndpointUrl);
    if (url.pathname === "/api/chat") return "ollama";
    if (url.pathname === "/v1/chat/completions") return "custom_http";
  } catch {
    return "";
  }
  return "";
}

function localAIConfigTroubleshooting(error: string, provider: string, extensionOrigin?: string) {
  const normalized = error.toLowerCase();
  if (normalized.includes("ollama_origin_forbidden") || normalized.includes("http_403") || normalized.includes("403")) {
    const origin = extensionOrigin || "chrome-extension://<extension-id>";
    return [
      "Ollama rejected the Chrome extension origin. Set OLLAMA_ORIGINS to this extension origin, then restart Ollama.",
      `Example: OLLAMA_ORIGINS=${origin} ollama serve`,
      "For development only, you can use OLLAMA_ORIGINS=* and restart Ollama.",
    ];
  }
  if (normalized.includes("provider_not_allowed")) {
    return [
      "If the endpoint is Ollama /api/chat, select Provider = Ollama or keep Auto with the /api/chat path.",
      "If the endpoint is OpenAI-compatible /v1/chat/completions, select LM Studio, LocalAI, llama.cpp, or Custom localhost HTTP.",
      "After changing provider or endpoint, run Test config again.",
    ];
  }
  if (normalized.includes("404") || normalized.includes("endpoint_path")) {
    return [
      "Check the endpoint path. Ollama must use /api/chat. OpenAI-compatible servers must use /v1/chat/completions.",
      "Confirm the selected provider matches the endpoint type.",
    ];
  }
  if (normalized.includes("connection") || normalized.includes("failed to fetch") || normalized.includes("network") || normalized.includes("http_000")) {
    return [
      "Make sure the local AI server is running.",
      "Confirm the host and port are reachable from Chrome, for example http://localhost:11434/api/chat for Ollama.",
    ];
  }
  if (normalized.includes("model")) {
    return [
      "Check that the model name is installed and spelled exactly as your local server expects.",
      provider === "ollama" ? "Run `ollama list` to see installed model names." : "Use the model identifier shown by your local server UI/API.",
    ];
  }
  return [
    "Verify provider, endpoint URL, and model name.",
    "Use Test config after every change.",
    "If the model supports vision, enable vision only after text-only testing works.",
  ];
}

function buildRuleBasedAskAnswer(input: {
  question: string;
  editable: EditableProduct;
  product: ProductCapturePayload | null;
  productBrief: ProductBrief | null;
  storytellingHandoff: MarketplaceStorytellingHandoff | null;
}): AskResult {
  const { question, editable, product, productBrief, storytellingHandoff } = input;
  const { shopeeKeywords, googleKeywords } = buildAskKeywords(question, editable, productBrief);
  const productName = editable.productName || product?.productName || "สินค้านี้";
  const contextAvailable = Boolean(editable.productName || editable.descriptionText || productBrief);
  const cautions = [
    likelyHealthOrChildClaim(question) ? "คำถามนี้เกี่ยวกับสุขภาพ/เด็ก ระบบไม่ควรฟันธงผลลัพธ์ ให้ตรวจฉลาก คำเตือน ส่วนประกอบ และถามแพทย์หรือเภสัชกรก่อนใช้จริง" : "",
    !contextAvailable ? "ยังไม่มีข้อมูลสินค้าที่ review มากพอ คำตอบจึงเน้นแนวทางค้นหาเพิ่มเติม" : "",
  ].filter(Boolean);
  let answer = "";
  if (/(อันไหน|หา|ค้น|search|ทิชชู่|กระดาษ)/i.test(question) && /(ห้องน้ำ|bathroom|toilet)/i.test(question)) {
    answer = "ถ้าต้องการใช้ในห้องน้ำ ให้ลองค้นหาด้วยคำที่เจาะจงเรื่องการใช้งาน เช่น กระดาษทิชชู่ ห้องน้ำ, ทิชชู่เปียก ห้องน้ำ หรือ tissue bathroom เพื่อเทียบสินค้าโดยดูความนุ่ม ความเหนียว จำนวนแผ่น ราคา/ชิ้น และรีวิวเรื่องการใช้งานจริง";
  } else if (/(ผู้สูงอายุ|คนแก่|elderly|senior)/i.test(question)) {
    answer = `${productName} อาจเหมาะกับผู้สูงอายุถ้ามีคุณสมบัติที่ใส่ง่าย เคลื่อนไหวง่าย ไม่รัด ไม่ลื่น และดูแลซักง่าย จากข้อมูลที่มีควรตรวจรายละเอียดไซซ์ วัสดุ เอวยาง/ความยืดหยุ่น และรีวิวผู้ซื้อก่อนตัดสินใจ`;
  } else if (/(ของฝาก|ของขวัญ|gift)/i.test(question)) {
    answer = `${productName} อาจเหมาะเป็นของฝากถ้าบรรจุภัณฑ์ดูดี ใช้งานง่าย ไม่ต้องรู้ไซซ์/รสนิยมเฉพาะมาก และราคาเหมาะกับผู้รับ ลองเทียบกับกลุ่มเป้าหมาย เช่น เพื่อนร่วมงาน ผู้ใหญ่ ครอบครัว หรือคนที่มี pain point ตรงกับสินค้า`;
  } else if (likelyHealthOrChildClaim(question)) {
    answer = `${productName} ยังไม่ควรถูกสรุปว่าใช้แก้ปัญหาสุขภาพได้จากข้อมูล marketplace เพียงอย่างเดียว โดยเฉพาะเด็ก ควรตรวจฉลาก ส่วนประกอบ วิธีใช้ ข้อห้าม และแหล่งข้อมูลทางการแพทย์/ผู้เชี่ยวชาญก่อน`;
  } else if (storytellingHandoff?.storyOptions.length) {
    const option = storytellingHandoff.storyOptions.find((item) => item.autoSelected) || storytellingHandoff.storyOptions[0];
    answer = `จาก insight ปัจจุบัน ${productName} น่าจะเล่าได้ในมุม "${option.title}" โดยเน้นกลุ่ม ${option.audience}, need คือ ${option.customerNeed}, use case คือ ${option.useCase}. ถ้ายังไม่มั่นใจ ลองค้นต่อด้วย keyword ด้านล่าง`;
  } else {
    answer = contextAvailable
      ? `จากข้อมูลที่ review อยู่ ให้ประเมิน ${productName} โดยดูว่า pain point ของลูกค้าตรงกับจุดขายจริงไหม มีรีวิว/หลักฐานสนับสนุนหรือไม่ และมีข้อกังวลเรื่องราคา คุณภาพ หรือวิธีใช้หรือเปล่า`
      : "ยังไม่มีข้อมูลสินค้าเพียงพอ ให้ลอง scan/review สินค้าก่อน หรือใช้ keyword ด้านล่างเพื่อค้นหาสินค้าที่ใกล้เคียงกว่า";
  }
  return { answer, source: "assistant_rules", shopeeKeywords, googleKeywords, cautions };
}

function mergeImageCandidates(existing: ImageCandidate[], incoming: ImageCandidate[]) {
  const byUrl = new Map<string, ImageCandidate>();
  const merged: ImageCandidate[] = [];
  for (const image of existing.filter((candidate) => candidate.kind !== "related")) {
    byUrl.set(image.url, image);
    merged.push(image);
  }
  for (const image of incoming.filter((candidate) => candidate.kind !== "related")) {
    const previous = byUrl.get(image.url);
    if (!previous) {
      const nextImage = { ...image, selected: false };
      byUrl.set(image.url, nextImage);
      merged.push(nextImage);
      continue;
    }
    const incomingHasSpecificZone = image.kind !== "main" && image.kind !== "unknown";
    const previousWasGeneric = previous.kind === "main" || previous.kind === "unknown";
    const updated = {
      ...previous,
      ...image,
      kind: incomingHasSpecificZone && previousWasGeneric ? image.kind : previous.kind,
      selected: previous.selected,
      metadata: { ...(previous.metadata ?? {}), ...(image.metadata ?? {}) },
    };
    byUrl.set(image.url, updated);
    const index = merged.findIndex((candidate) => candidate.url === image.url);
    if (index >= 0) merged[index] = updated;
  }
  return merged;
}

function withoutRelatedProductImages(product: ProductCapturePayload): ProductCapturePayload {
  return {
    ...product,
    imageCandidates: product.imageCandidates.filter((image) => image.kind !== "related"),
  };
}

function compactIdentityText(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizedUrlKey(value: string | null | undefined): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, "https://affiliate.shopee.co.th");
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const offerMatch = url.pathname.match(/\/offer\/product_offer\/(\d+)/i);
    if (host.endsWith("shopee.co.th") && offerMatch?.[1]) return `shopee-offer:${offerMatch[1]}`;
    const productMatch = url.pathname.match(/(?:^|[./-])i\.(\d+)\.(\d+)(?:$|[/?#-])/i) || url.pathname.match(/\/product\/(\d+)\/(\d+)/i);
    if (host.endsWith("shopee.co.th") && productMatch?.[1] && productMatch?.[2]) return `shopee-product:${productMatch[1]}:${productMatch[2]}`;
    url.search = "";
    url.hash = "";
    return `${host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return raw.split(/[?#]/, 1)[0].replace(/\/+$/, "").toLowerCase();
  }
}

function isGenericListUrlKey(urlKey: string) {
  return [
    "affiliate.shopee.co.th/offer/product_offer",
    "shopee.co.th",
    "shopee.co.th/",
    "shopee.co.th/search",
  ].includes(urlKey.replace(/\/+$/, ""));
}

function candidateUrlIdentityKey(candidate: CategoryProductCandidate): string {
  const sourceKey = normalizedUrlKey(candidate.sourceUrl);
  const urls = [
    candidate.canonicalUrl,
    candidate.cleanUrl,
    candidate.originalUrl,
    candidate.url,
    candidate.affiliateUrl,
  ];
  for (const value of urls) {
    const key = normalizedUrlKey(value);
    if (!key || key === sourceKey || isGenericListUrlKey(key)) continue;
    return key;
  }
  return "";
}

function candidateContentKey(candidate: CategoryProductCandidate): string {
  const titleKey = compactIdentityText(candidate.title);
  const imageKey = normalizedUrlKey(candidate.imageUrl);
  const priceKey = compactIdentityText(candidate.priceText);
  const soldKey = compactIdentityText(candidate.soldCountText);
  if (titleKey.length < 8 || !imageKey || !priceKey) return "";
  return `${titleKey}:${imageKey}:${priceKey}:${soldKey}`;
}

function normalizedAffiliateUrl(value: string | null | undefined): string | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function candidateStableKey(candidate: CategoryProductCandidate): string {
  if (candidate.externalProductId) return `${candidate.platform}:product:${candidate.externalShopId || "*"}:${candidate.externalProductId}`;
  const urlKey = candidateUrlIdentityKey(candidate);
  if (urlKey) return `${candidate.platform}:url:${urlKey}`;
  const contentKey = candidateContentKey(candidate);
  if (contentKey) return `${candidate.platform}:content:${contentKey}`;
  return `${candidate.platform}:fallback:${normalizedUrlKey(candidate.sourceUrl)}:${candidate.position}:${compactIdentityText(candidate.title)}:${candidate.priceText || ""}`;
}

function candidateIdentity(candidate: CategoryProductCandidate) {
  return candidateStableKey(candidate);
}

function candidateMergeKeys(candidate: CategoryProductCandidate): string[] {
  const keys: string[] = [];
  if (candidate.externalProductId) keys.push(`${candidate.platform}:product:${candidate.externalShopId || "*"}:${candidate.externalProductId}`);
  const urlKey = candidateUrlIdentityKey(candidate);
  if (urlKey) keys.push(`${candidate.platform}:url:${urlKey}`);
  const contentKey = candidateContentKey(candidate);
  if (contentKey) keys.push(`${candidate.platform}:content:${contentKey}`);
  if (candidate.affiliateCardKey) keys.push(`${candidate.platform}:card:${candidate.affiliateCardKey}`);
  return keys.length ? Array.from(new Set(keys)) : [candidateStableKey(candidate)];
}

function mergeCandidateRecord(previous: CategoryProductCandidate, candidate: CategoryProductCandidate): CategoryProductCandidate {
  const score = Math.max(previous.score, candidate.score);
  const previousHasAffiliate = Boolean(previous.affiliateUrl);
  const candidateHasAffiliate = Boolean(candidate.affiliateUrl);
  const base = candidateHasAffiliate || (!previousHasAffiliate && candidate.score >= previous.score) ? candidate : previous;
  const previousHasIdentityUrl = Boolean(candidateUrlIdentityKey(previous));
  const candidateHasIdentityUrl = Boolean(candidateUrlIdentityKey(candidate));
  const identityUrlSource = previousHasIdentityUrl ? previous : candidateHasIdentityUrl ? candidate : null;
  const baseUrl = normalizedAffiliateUrl(base.url) && base.url === base.affiliateUrl
    ? (previous.url === previous.affiliateUrl ? candidate.url : previous.url)
    : base.url;
  return {
    ...previous,
    ...candidate,
    ...base,
    externalProductId: previous.externalProductId || candidate.externalProductId,
    externalShopId: previous.externalShopId || candidate.externalShopId,
    url: candidateUrlIdentityKey(base) ? baseUrl : identityUrlSource?.url || baseUrl,
    priceText: previous.priceText || candidate.priceText,
    originalPriceText: previous.originalPriceText || candidate.originalPriceText,
    discountText: previous.discountText || candidate.discountText,
    soldCountText: previous.soldCountText || candidate.soldCountText,
    soldCountValue: previous.soldCountValue ?? candidate.soldCountValue,
    ratingText: previous.ratingText || candidate.ratingText,
    commissionRatePercent: previous.commissionRatePercent ?? candidate.commissionRatePercent,
    commissionRateText: previous.commissionRateText || candidate.commissionRateText,
    affiliateUrl: normalizedAffiliateUrl(previous.affiliateUrl) || normalizedAffiliateUrl(candidate.affiliateUrl),
    affiliateLinkAvailable: Boolean(previous.affiliateLinkAvailable || candidate.affiliateLinkAvailable),
    affiliateCardKey: previous.affiliateCardKey || candidate.affiliateCardKey,
    imageUrl: previous.imageUrl || candidate.imageUrl,
    originalUrl: identityUrlSource?.originalUrl || previous.originalUrl || candidate.originalUrl,
    cleanUrl: identityUrlSource?.cleanUrl || previous.cleanUrl || candidate.cleanUrl,
    canonicalUrl: identityUrlSource?.canonicalUrl || previous.canonicalUrl || candidate.canonicalUrl,
    badges: Array.from(new Set([...(previous.badges ?? []), ...(candidate.badges ?? [])])),
    score,
    scoreReasons: Array.from(new Set([...(previous.scoreReasons ?? []), ...(candidate.scoreReasons ?? [])])),
    position: Math.min(previous.position ?? candidate.position, candidate.position ?? previous.position),
  };
}

function mergeCandidates(existing: CategoryProductCandidate[], incoming: CategoryProductCandidate[]) {
  const byKey = new Map<string, CategoryProductCandidate>();
  const records: CategoryProductCandidate[] = [];
  const upsert = (candidate: CategoryProductCandidate) => {
    const incomingKeys = candidateMergeKeys(candidate);
    const previous = incomingKeys.map((key) => byKey.get(key)).find(Boolean);
    const next = previous ? mergeCandidateRecord(previous, candidate) : candidate;
    if (previous) {
      const index = records.indexOf(previous);
      if (index >= 0) records[index] = next;
    } else {
      records.push(next);
    }
    const keys = new Set([
      ...(previous ? candidateMergeKeys(previous) : []),
      ...incomingKeys,
      ...candidateMergeKeys(next),
    ]);
    for (const key of keys) byKey.set(key, next);
  };
  for (const candidate of existing) upsert(candidate);
  for (const candidate of incoming) upsert(candidate);
  return records.sort((a, b) => b.score - a.score);
}

function candidateListSignature(candidates: CategoryProductCandidate[]) {
  return candidates
    .slice(0, 80)
    .map((candidate) => [
      candidateStableKey(candidate),
      candidate.affiliateUrl,
      candidate.title,
      candidate.priceText,
      candidate.soldCountText,
      candidate.imageUrl,
    ].filter(Boolean).join("~"))
    .join("|");
}

function findMatchingCandidateForProduct(product: ProductCapturePayload, candidates: CategoryProductCandidate[]): { candidate: CategoryProductCandidate; basis: "externalProductId" | "url" } | null {
  if (product.externalProductId) {
    const matched = candidates.find((candidate) => {
      if (candidate.platform !== product.platform || candidate.externalProductId !== product.externalProductId) return false;
      if (product.externalShopId && candidate.externalShopId && product.externalShopId !== candidate.externalShopId) return false;
      return true;
    });
    if (matched) return { candidate: matched, basis: "externalProductId" };
  }
  const productUrlKeys = new Set([
    normalizedUrlKey(product.canonicalSourceUrl),
    normalizedUrlKey(product.cleanSourceUrl),
    normalizedUrlKey(product.originalSourceUrl),
    normalizedUrlKey(product.sourceUrl),
  ].filter((key) => key && !isGenericListUrlKey(key)));
  if (!productUrlKeys.size) return null;
  const matched = candidates.find((candidate) => {
    if (candidate.platform !== product.platform) return false;
    const key = candidateUrlIdentityKey(candidate);
    return Boolean(key && productUrlKeys.has(key));
  });
  return matched ? { candidate: matched, basis: "url" } : null;
}

function enrichProductWithMatchedCandidate(product: ProductCapturePayload, candidates: CategoryProductCandidate[]): ProductCapturePayload {
  const match = findMatchingCandidateForProduct(product, candidates);
  if (!match) return product;
  const { candidate, basis } = match;
  const affiliateUrl = normalizedAffiliateUrl(product.affiliateUrl) || normalizedAffiliateUrl(candidate.affiliateUrl);
  const commissionRatePercent = product.commissionRatePercent ?? candidate.commissionRatePercent ?? null;
  const commissionRateText = product.commissionRateText || candidate.commissionRateText || (commissionRatePercent != null ? String(commissionRatePercent) : null);
  return {
    ...product,
    commissionRatePercent,
    commissionRateText,
    affiliateUrl,
    affiliateMatch: {
      candidateKey: candidateStableKey(candidate),
      basis,
      confidence: 1,
      listSourceUrl: candidate.sourceUrl,
      matchedAt: new Date().toISOString(),
    },
    fieldEvidence: {
      ...(product.fieldEvidence ?? {}),
      ...(commissionRateText ? {
        commissionRate: {
          text: commissionRateText,
          source: `product_list_exact_match:${basis}`,
          confidence: 1,
          normalized: commissionRatePercent,
        },
      } : {}),
      ...(affiliateUrl ? {
        affiliateUrl: {
          text: affiliateUrl,
          source: `product_list_exact_match:${basis}`,
          confidence: 1,
          normalized: affiliateUrl,
        },
      } : {}),
    },
  };
}

function hasCandidateEnrichmentChange(before: ProductCapturePayload, after: ProductCapturePayload): boolean {
  return (before.commissionRatePercent ?? null) !== (after.commissionRatePercent ?? null)
    || (before.commissionRateText || "") !== (after.commissionRateText || "")
    || (normalizedAffiliateUrl(before.affiliateUrl) || "") !== (normalizedAffiliateUrl(after.affiliateUrl) || "")
    || (before.affiliateMatch?.candidateKey || "") !== (after.affiliateMatch?.candidateKey || "");
}

function isScannableListPage(page: PageDetection | null | undefined) {
  return page?.pageType === "category" || page?.pageType === "shop" || page?.pageType === "search";
}

async function getActiveTab(): Promise<{ id: number; url: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("ไม่พบ active tab");
  return { id: tab.id, url: tab.url || "" };
}

async function getActiveTabId(): Promise<number> {
  return (await getActiveTab()).id;
}

async function getActiveTabUrl(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url || "";
}

async function sendToContent<T>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
  const tab = await getActiveTab();
  let response: any;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "PING_MARKETPLACE_CONTENT" });
    response = await chrome.tabs.sendMessage(tab.id, { type, ...payload });
  } catch (error: any) {
    if (!/^https:\/\/(shopee\.co\.th|[^/]+\.shopee\.co\.th|www\.tiktok\.com|shop\.tiktok\.com|[^/]+\.tiktokglobalshop\.com)\//i.test(tab.url)) {
      throw new Error("กรุณาเปิดหน้า Shopee หรือ TikTok Shop ก่อนใช้งาน Detect");
    }
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["assets/content.js"] });
      await new Promise((resolve) => setTimeout(resolve, 150));
      response = await chrome.tabs.sendMessage(tab.id, { type, ...payload });
    } catch (retryError: any) {
      throw new Error(retryError?.message || error?.message || "content script failed");
    }
  }
  if (!response?.ok) throw new Error(response?.error || "content script failed");
  return response;
}

async function loadSettings(): Promise<Settings> {
  const deviceId = await getOrCreateDeviceId();
  const result = await chrome.storage.local.get(["baseUrl", "token", "tokenExpiresAt", "queuedCandidates"]);
  const token = result.token || "";
  return {
    baseUrl: normalizeServerBaseUrl(result.baseUrl),
    token,
    tokenExpiresAt: result.tokenExpiresAt || decodeJwtExpiresAt(token) || undefined,
    deviceId,
  };
}

async function saveSettings(settings: Settings) {
  const deviceId = settings.deviceId || await getOrCreateDeviceId();
  await chrome.storage.local.set({
    baseUrl: normalizeServerBaseUrl(settings.baseUrl),
    token: settings.token,
    tokenExpiresAt: settings.tokenExpiresAt || "",
    [DEVICE_ID_KEY]: deviceId,
  });
}

async function saveQueue(queue: CategoryProductCandidate[]) {
  await chrome.storage.local.set({ queuedCandidates: queue });
}

async function loadQueue(): Promise<CategoryProductCandidate[]> {
  const result = await chrome.storage.local.get(["queuedCandidates"]);
  return Array.isArray(result.queuedCandidates) ? mergeCandidates([], result.queuedCandidates) : [];
}

async function loadLocalAISettings(): Promise<LocalAISettings> {
  const result = await chrome.storage.local.get([LOCAL_AI_SETTINGS_KEY]);
  return { ...defaultLocalAISettings, ...(result[LOCAL_AI_SETTINGS_KEY] || {}) };
}

async function saveLocalAISettings(settings: LocalAISettings) {
  await chrome.storage.local.set({ [LOCAL_AI_SETTINGS_KEY]: settings });
}

async function loadLocalAIInsightCache(): Promise<Record<string, unknown>> {
  const result = await chrome.storage.local.get([LOCAL_AI_CACHE_KEY]);
  return result[LOCAL_AI_CACHE_KEY] && typeof result[LOCAL_AI_CACHE_KEY] === "object" ? result[LOCAL_AI_CACHE_KEY] : {};
}

async function saveLocalAIInsightCache(cache: Record<string, unknown>) {
  await chrome.storage.local.set({ [LOCAL_AI_CACHE_KEY]: cache });
}

function compactDiagnosticValue(value: unknown): unknown {
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map(compactDiagnosticValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 40).map(([key, item]) => [key, compactDiagnosticValue(item)]));
  }
  return value;
}

async function appendDiagnosticLog(event: string, details: Record<string, unknown> = {}) {
  const result = await chrome.storage.local.get([DIAGNOSTIC_LOG_KEY]);
  const existing = Array.isArray(result[DIAGNOSTIC_LOG_KEY]) ? result[DIAGNOSTIC_LOG_KEY] as DiagnosticLogEntry[] : [];
  const entry: DiagnosticLogEntry = {
    at: new Date().toISOString(),
    source: "panel",
    event,
    details: compactDiagnosticValue(details),
  };
  await chrome.storage.local.set({ [DIAGNOSTIC_LOG_KEY]: [...existing, entry].slice(-DIAGNOSTIC_LOG_LIMIT) });
}

const TIKTOK_START_URLS = [
  { label: "TikTok Shop TH", url: "https://www.tiktok.com/shop/th?source=ecommerce_shoppingguide" },
  { label: "TikTok Home Supplies", url: "https://www.tiktok.com/shop/th/c/home-supplies/600001" },
];

const SHOPEE_AFFILIATE_PRODUCT_OFFER_URL = "https://affiliate.shopee.co.th/offer/product_offer";

const SHOPEE_START_URLS = [
  { label: "Shopee Home", url: "https://shopee.co.th/" },
  { label: "Shopee Mall", url: "https://shopee.co.th/mall" },
];

export default function App() {
  const [settings, setSettings] = useState<Settings>({ baseUrl: DEFAULT_SMARTSPEC_BASE_URL, token: "", deviceId: "" });
  const [tokenInput, setTokenInput] = useState("");
  const [tokenEditorOpen, setTokenEditorOpen] = useState(true);
  const [connectFlowStarted, setConnectFlowStarted] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>("capture");
  const [page, setPage] = useState<PageDetection | null>(null);
  const [candidates, setCandidates] = useState<CategoryProductCandidate[]>([]);
  const [ignoredUrls, setIgnoredUrls] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<CategoryProductCandidate[]>([]);
  const [filters, setFilters] = useState<CandidateFilters>({
    keyword: "",
    minScore: "50",
    minRating: "",
    priceMax: "",
    discountMin: "",
    mallOnly: false,
    freeShippingOnly: false,
    excludeSponsored: true,
  });
  const [starterKeyword, setStarterKeyword] = useState("");
  const [product, setProduct] = useState<ProductCapturePayload | null>(null);
  const [liveProduct, setLiveProduct] = useState<ProductCapturePayload | null>(null);
  const [autoDetectEnabled, setAutoDetectEnabled] = useState(true);
  const [lastObservedAt, setLastObservedAt] = useState("");
  const [lastObserveReason, setLastObserveReason] = useState("");
  const [editable, setEditable] = useState<EditableProduct>({ productName: "", brand: "", shopName: "", priceCurrentText: "", commissionRateText: "", affiliateUrl: "", soldCountText: "", ratingScoreText: "", reviewCountText: "", categoryText: "", stockText: "", variantsText: "", sellerLocationText: "", descriptionText: "" });
  const [evidence, setEvidence] = useState<EvidenceSelection>({
    domHeader: true,
    domDescription: true,
    rawHtmlBlocks: false,
    headerScreenshot: true,
    descriptionScreenshot: true,
  });
  const [selectedImages, setSelectedImages] = useState<Record<string, boolean>>({});
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [visionImageUrls, setVisionImageUrls] = useState<string[]>([]);
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [reviewDraftStatus, setReviewDraftStatus] = useState("");
  const [progress, setProgress] = useState<ProgressStep[]>(CAPTURE_STEPS.map((label) => ({ label, status: "pending" })));
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [localAISettings, setLocalAISettings] = useState<LocalAISettings>(defaultLocalAISettings);
  const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;
  const wildcardExtensionOrigin = "chrome-extension://*";
  const extensionId = chrome.runtime.id;
  const ollamaOriginsCommand = `OLLAMA_ORIGINS=${extensionOrigin} ollama serve`;
  const ollamaWildcardOriginsCommand = `OLLAMA_ORIGINS="${wildcardExtensionOrigin}" ollama serve`;
  const windowsOllamaSetxCommand = `setx OLLAMA_ORIGINS "${extensionOrigin}"`;
  const windowsOllamaWildcardSetxCommand = `setx OLLAMA_ORIGINS "${wildcardExtensionOrigin}"`;
  const windowsOllamaSessionCommand = `$env:OLLAMA_ORIGINS="${extensionOrigin}"`;
  const windowsOllamaWildcardSessionCommand = `$env:OLLAMA_ORIGINS="${wildcardExtensionOrigin}"`;
  const windowsOllamaCheckCommand = "$env:OLLAMA_ORIGINS";
  const macOllamaLaunchctlCommand = `launchctl setenv OLLAMA_ORIGINS "${extensionOrigin}"`;
  const macOllamaWildcardLaunchctlCommand = `launchctl setenv OLLAMA_ORIGINS "${wildcardExtensionOrigin}"`;
  const macOllamaCheckCommand = "launchctl getenv OLLAMA_ORIGINS";
  const macOllamaServeCommand = `OLLAMA_ORIGINS="${extensionOrigin}" ollama serve`;
  const macOllamaWildcardServeCommand = `OLLAMA_ORIGINS="${wildcardExtensionOrigin}" ollama serve`;
  const [localAICapability, setLocalAICapability] = useState<LocalAICapability>({
    provider: "chrome_prompt_api",
    apiExposed: false,
    available: false,
    availability: "unknown",
    supportsText: false,
    reason: "Not checked yet.",
  });
  const [localAIState, setLocalAIState] = useState<LocalAIWorkflowState>("idle");
  const [localAIProgress, setLocalAIProgress] = useState<number | null>(null);
  const [sanitizedAIInput, setSanitizedAIInput] = useState<SanitizedLocalAIInput | null>(null);
  const [productBrief, setProductBrief] = useState<ProductBrief | null>(null);
  const [videoBrief, setVideoBrief] = useState<VideoBrief | null>(null);
  const [storytellingHandoff, setStorytellingHandoff] = useState<MarketplaceStorytellingHandoff | null>(null);
  const [userInsightText, setUserInsightText] = useState("");
  const [userInsightDraft, setUserInsightDraft] = useState<UserStoryInsightDraft | null>(null);
  const [askQuestion, setAskQuestion] = useState("");
  const [askResult, setAskResult] = useState<AskResult | null>(null);
  const [askBusy, setAskBusy] = useState(false);
  const [productionProjectSearch, setProductionProjectSearch] = useState("");
  const [productionProjects, setProductionProjects] = useState<ProductionDirectorProjectSummary[]>([]);
  const [selectedProductionProjectId, setSelectedProductionProjectId] = useState("");
  const [selectedProductionProject, setSelectedProductionProject] = useState<ProductionDirectorProjectDetail | null>(null);
  const [productionProjectsBusy, setProductionProjectsBusy] = useState(false);
  const [productionProjectBusy, setProductionProjectBusy] = useState(false);
  const [productionMediaFiles, setProductionMediaFiles] = useState<Record<string, ProductionMediaFileEntry>>({});
  const [storyboardProjectSearch, setStoryboardProjectSearch] = useState("");
  const [storyboardProjects, setStoryboardProjects] = useState<StoryboardReviewProjectSummary[]>([]);
  const [selectedStoryboardProjectId, setSelectedStoryboardProjectId] = useState<number | null>(null);
  const [selectedStoryboardProject, setSelectedStoryboardProject] = useState<StoryboardReviewProjectDetail | null>(null);
  const [storyboardProjectsBusy, setStoryboardProjectsBusy] = useState(false);
  const [storyboardProjectBusy, setStoryboardProjectBusy] = useState(false);
  const [configTestResult, setConfigTestResult] = useState<ConfigTestResult>({ status: "idle", message: "Not tested yet." });
  const [diagnosticLogs, setDiagnosticLogs] = useState<DiagnosticLogEntry[]>([]);
  const [affiliateLinkBusy, setAffiliateLinkBusy] = useState<Record<string, boolean>>({});
  const [localAIProvider, setLocalAIProvider] = useState("noop");
  const abortLocalAIRef = useRef<AbortController | null>(null);
  const autoInsightKeyRef = useRef<string | null>(null);
  const autoInsightRunningRef = useRef(false);
  const productSourceRef = useRef<string | null>(null);
  const pageUrlRef = useRef<string | null>(null);
  const candidateListSignatureRef = useRef("");
  const candidateListSourceUrlRef = useRef("");
  const autoProductListScanUrlRef = useRef("");
  const productionMediaFilesRef = useRef<Record<string, ProductionMediaFileEntry>>({});
  const localAIBusy = ["detecting_ai", "downloading", "analyzing_local", "analyzing_server", "syncing"].includes(localAIState);
  const serverBaseUrl = useMemo(() => normalizeServerBaseUrl(settings.baseUrl), [settings.baseUrl]);
  const localAIStatusView = useMemo(() => getLocalAIStatusView({
    capability: localAICapability,
    provider: localAIProvider,
    state: localAIState,
    hasToken: Boolean(settings.token),
  }), [localAICapability, localAIProvider, localAIState, settings.token]);
  const tokenExpiresAt = useMemo(() => settings.tokenExpiresAt || decodeJwtExpiresAt(settings.token), [settings.token, settings.tokenExpiresAt]);
  const tokenStatus = useMemo(() => tokenExpiryStatus(tokenExpiresAt), [tokenExpiresAt]);
  const tokenInputExpiresAt = useMemo(() => decodeJwtExpiresAt(tokenInput.trim()), [tokenInput]);
  const canSaveConnection = tokenEditorOpen ? Boolean(tokenInputExpiresAt) : Boolean(settings.token);

  useEffect(() => {
    loadSettings()
      .then((loaded) => {
        setSettings(loaded);
        setTokenEditorOpen(!loaded.token);
        setConnectFlowStarted(false);
        setTokenInput("");
      })
      .catch(() => undefined);
    loadQueue().then(setQueue).catch(() => undefined);
    loadLocalAISettings().then(setLocalAISettings).catch(() => undefined);
    refreshLocalAICapability().catch(() => undefined);
  }, []);

  useEffect(() => {
    const decision = decideLocalAIProvider({ capability: localAICapability, settings: localAISettings, hasToken: Boolean(settings.token) });
    const configuredProvider = localAISettings.preferLocalAI ? effectiveConfiguredProvider(localAISettings) : "";
    setLocalAIProvider(configuredProvider || decision.provider);
    if (!["analyzing_local", "analyzing_server", "syncing", "synced", "failed", "cancelled"].includes(localAIState)) {
      setLocalAIState(configuredProvider ? "local_ai_ready" : decision.state);
    }
  }, [localAICapability, localAISettings, settings.token]);

  useEffect(() => {
    if (!product || !localAISettings.autoGenerateInsights || localAIBusy) return;
    const hasToken = Boolean(settings.token);
    const decision = decideLocalAIProvider({ capability: localAICapability, settings: localAISettings, hasToken });
    const configuredProvider = localAISettings.preferLocalAI ? effectiveConfiguredProvider(localAISettings) : "";
    const autoProvider = configuredProvider || decision.provider;
    if ((!configuredProvider && !decision.canAnalyze) || autoProvider === "noop") return;
    if (!configuredProvider && autoProvider === "server_ai" && !hasToken) return;
    if (autoProvider === "chrome_prompt_api" && localAICapability.availability !== "available") return;
    const selectedImageUrls = Object.entries(selectedImages)
      .filter(([, selected]) => selected)
      .map(([url]) => url)
      .sort()
      .join("|");
    const autoKey = [
      product.platform,
      product.sourceUrl,
      editable.productName,
      editable.priceCurrentText,
      editable.categoryText,
      editable.descriptionText.length,
      selectedImageUrls,
      heroImageUrl,
      autoProvider,
    ].join("::");
    if (autoInsightKeyRef.current === autoKey || autoInsightRunningRef.current) return;
    autoInsightKeyRef.current = autoKey;
    autoInsightRunningRef.current = true;
    const timer = window.setTimeout(() => {
      run(() => createLocalProductBrief({ autoSync: hasToken, openTab: false }))
        .finally(() => {
          autoInsightRunningRef.current = false;
        });
    }, 900);
    return () => {
      window.clearTimeout(timer);
      autoInsightRunningRef.current = false;
    };
  }, [
    product,
    settings.token,
    localAISettings,
    localAICapability,
    localAIBusy,
    selectedImages,
    heroImageUrl,
    editable.productName,
    editable.priceCurrentText,
    editable.categoryText,
    editable.descriptionText,
  ]);

  useEffect(() => {
    if (activeTab !== "production" || productionProjects.length > 0 || productionProjectsBusy || !settings.token) return;
    run(() => loadProductionDirectorProjects());
  }, [activeTab, settings.token]);

  useEffect(() => {
    if (activeTab !== "storyboard" || storyboardProjects.length > 0 || storyboardProjectsBusy || !settings.token) return;
    run(() => loadStoryboardReviewProjects());
  }, [activeTab, settings.token]);

  useEffect(() => {
    productionMediaFilesRef.current = productionMediaFiles;
  }, [productionMediaFiles]);

  useEffect(() => () => {
    for (const entry of Object.values(productionMediaFilesRef.current)) {
      if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
    }
  }, []);

  useEffect(() => {
    const handler = (changes: Record<string, any>, areaName: string) => {
      if (areaName !== "local") return;
      if (!changes.token && !changes.baseUrl && !changes.tokenExpiresAt && !changes[DEVICE_ID_KEY]) return;
      loadSettings()
        .then((loaded) => {
          setSettings(loaded);
          if (loaded.token) {
            setTokenInput("");
            setTokenEditorOpen(false);
            setConnectFlowStarted(false);
            setStatus("Connection saved");
          }
        })
        .catch(() => undefined);
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  useEffect(() => {
    const current = product ?? liveProduct;
    if (!current || candidates.length === 0) return;
    const enriched = withoutRelatedProductImages(enrichProductWithMatchedCandidate(current, candidates));
    if (!hasCandidateEnrichmentChange(current, enriched)) return;

    const applyIfSameProduct = (existing: ProductCapturePayload | null) => {
      if (!existing || existing.sourceUrl !== current.sourceUrl) return existing;
      const next = withoutRelatedProductImages(enrichProductWithMatchedCandidate(existing, candidates));
      return hasCandidateEnrichmentChange(existing, next) ? next : existing;
    };

    setProduct(applyIfSameProduct);
    setLiveProduct(applyIfSameProduct);
    setEditable((existing) => {
      const incoming = toEditableProduct(enriched);
      return {
        ...existing,
        commissionRateText: existing.commissionRateText || incoming.commissionRateText,
        affiliateUrl: existing.affiliateUrl || incoming.affiliateUrl,
      };
    });
  }, [candidates, product, liveProduct]);

  function applyProductForReview(nextProduct: ProductCapturePayload) {
    nextProduct = withoutRelatedProductImages(enrichProductWithMatchedCandidate(nextProduct, candidates));
    productSourceRef.current = nextProduct.sourceUrl;
    setReviewDraftStatus("");
    setProduct(nextProduct);
    setLiveProduct(nextProduct);
    const baseEditable = toEditableProduct(nextProduct);
    setEditable(baseEditable);
    const nextSelectedImages = selectedImagesFromProduct(nextProduct);
    setSelectedImages(nextSelectedImages);
    setHeroImageUrl(nextProduct.imageCandidates.find((img) => nextSelectedImages[img.url])?.url || "");
    loadReviewDraft(nextProduct.sourceUrl)
      .then((draft) => {
        if (!draft || productSourceRef.current !== nextProduct.sourceUrl) return;
        setEditable({ ...baseEditable, ...draft.editable });
        setEvidence(draft.evidence);
        const restoredSelection = selectedImagesForProduct(nextProduct, { ...nextSelectedImages, ...draft.selectedImages });
        setSelectedImages(restoredSelection);
        const restoredHero = draft.heroImageUrl && nextProduct.imageCandidates.some((img) => img.url === draft.heroImageUrl)
          ? draft.heroImageUrl
          : nextProduct.imageCandidates.find((img) => restoredSelection[img.url])?.url || "";
        setHeroImageUrl(restoredHero);
        setReviewDraftStatus(`Resumed local draft: ${formatDateTime(draft.updatedAt)}`);
      })
      .catch(() => undefined);
    updateProgress("Showing local review", ["Detecting page", "Collecting DOM text"]);
  }

  function mergeProductImagesForReview(nextProduct: ProductCapturePayload) {
    nextProduct = withoutRelatedProductImages(enrichProductWithMatchedCandidate(nextProduct, candidates));
    productSourceRef.current = productSourceRef.current || nextProduct.sourceUrl;
    const mergeInto = (current: ProductCapturePayload | null) => {
      if (!current || current.sourceUrl !== nextProduct.sourceUrl) return nextProduct;
      const currentFieldEvidence = current.fieldEvidence ?? {};
      const nextFieldEvidence = nextProduct.fieldEvidence ?? {};
      const currentWarnings = current.fieldWarnings ?? [];
      const nextWarnings = nextProduct.fieldWarnings ?? [];
      return {
        ...current,
        pageTitle: nextProduct.pageTitle || current.pageTitle,
        rawDomText: nextProduct.rawDomText || current.rawDomText,
        htmlBlocks: nextProduct.htmlBlocks.length > current.htmlBlocks.length ? nextProduct.htmlBlocks : current.htmlBlocks,
        productName: current.productName || nextProduct.productName,
        priceCurrentText: current.priceCurrentText || nextProduct.priceCurrentText,
        priceCurrentValue: current.priceCurrentValue ?? nextProduct.priceCurrentValue,
        priceOriginalText: current.priceOriginalText || nextProduct.priceOriginalText,
        priceOriginalValue: current.priceOriginalValue ?? nextProduct.priceOriginalValue,
        currency: current.currency || nextProduct.currency,
        discountText: current.discountText || nextProduct.discountText,
        discountPercent: current.discountPercent ?? nextProduct.discountPercent,
        ratingScoreText: current.ratingScoreText || nextProduct.ratingScoreText,
        ratingScoreValue: current.ratingScoreValue ?? nextProduct.ratingScoreValue,
        reviewCountText: current.reviewCountText || nextProduct.reviewCountText,
        reviewCountValue: current.reviewCountValue ?? nextProduct.reviewCountValue,
        soldCountText: current.soldCountText || nextProduct.soldCountText,
        soldCountValue: current.soldCountValue ?? nextProduct.soldCountValue,
        shopName: current.shopName || nextProduct.shopName,
        isMall: current.isMall || nextProduct.isMall,
        categoryText: current.categoryText || nextProduct.categoryText,
        categoryPath: current.categoryPath?.length ? current.categoryPath : nextProduct.categoryPath,
        brandText: current.brandText || nextProduct.brandText,
        stockText: current.stockText || nextProduct.stockText,
        variantsText: current.variantsText || nextProduct.variantsText,
        sellerLocationText: current.sellerLocationText || nextProduct.sellerLocationText,
        descriptionText: current.descriptionText || nextProduct.descriptionText,
        affiliateUrl: current.affiliateUrl || nextProduct.affiliateUrl,
        affiliateMatch: current.affiliateMatch || nextProduct.affiliateMatch,
        specificationText: current.specificationText || nextProduct.specificationText,
        imageCandidates: mergeImageCandidates(current.imageCandidates, nextProduct.imageCandidates),
        fieldEvidence: { ...nextFieldEvidence, ...currentFieldEvidence },
        fieldWarnings: Array.from(new Set([...currentWarnings, ...nextWarnings])),
      };
    };
    setProduct((current) => mergeInto(current));
    setLiveProduct((current) => mergeInto(current));
    setEditable((current) => {
      const incoming = toEditableProduct(nextProduct);
      return {
        ...current,
        productName: current.productName || incoming.productName,
        shopName: current.shopName || incoming.shopName,
        priceCurrentText: current.priceCurrentText || incoming.priceCurrentText,
        commissionRateText: current.commissionRateText || incoming.commissionRateText,
        affiliateUrl: current.affiliateUrl || incoming.affiliateUrl,
        soldCountText: current.soldCountText || incoming.soldCountText,
        ratingScoreText: current.ratingScoreText || incoming.ratingScoreText,
        reviewCountText: current.reviewCountText || incoming.reviewCountText,
        categoryText: current.categoryText || incoming.categoryText,
        stockText: current.stockText || incoming.stockText,
        variantsText: current.variantsText || incoming.variantsText,
        sellerLocationText: current.sellerLocationText || incoming.sellerLocationText,
        descriptionText: current.descriptionText || incoming.descriptionText,
      };
    });
    setSelectedImages((current) => {
      const hasCurrentSelection = Object.values(current).some(Boolean);
      const next = { ...current };
      for (const image of nextProduct.imageCandidates) {
        if (next[image.url] == null) next[image.url] = !hasCurrentSelection && image.kind === "main" && image.selected !== false && canAutoSelectImage(image);
      }
      return next;
    });
    setHeroImageUrl((current) => current || nextProduct.imageCandidates.find((img) => img.kind === "main" && img.selected !== false && canAutoSelectImage(img))?.url || nextProduct.imageCandidates.find((img) => img.kind === "main" && canAutoSelectImage(img))?.url || "");
  }

  function clearDetectedState(options: { keepCandidates?: boolean } = {}) {
    productSourceRef.current = null;
    pageUrlRef.current = null;
    if (!options.keepCandidates) {
      candidateListSignatureRef.current = "";
      candidateListSourceUrlRef.current = "";
      autoProductListScanUrlRef.current = "";
      setCandidates([]);
      setIgnoredUrls(new Set());
    }
    setProduct(null);
    setLiveProduct(null);
    setSelectedImages({});
    setHeroImageUrl("");
    setImageFilter("all");
    setReviewDraftStatus("");
    setEditable({ productName: "", brand: "", shopName: "", priceCurrentText: "", commissionRateText: "", affiliateUrl: "", soldCountText: "", ratingScoreText: "", reviewCountText: "", categoryText: "", stockText: "", variantsText: "", sellerLocationText: "", descriptionText: "" });
  }

  function applyLiveSnapshot(snapshot: MarketplaceLiveSnapshot, options: { replace?: boolean; updateCandidates?: boolean } = {}) {
    const pageChanged = Boolean(pageUrlRef.current && pageUrlRef.current !== snapshot.page.url);
    pageUrlRef.current = snapshot.page.url;
    setPage(snapshot.page);

    const incomingListSignature = candidateListSignature(snapshot.candidates);
    const hasIncomingList = snapshot.candidates.length > 0;
    const shouldUseIncomingList = Boolean(options.updateCandidates && hasIncomingList && isScannableListPage(snapshot.page));
    const incomingListChanged = Boolean(
      shouldUseIncomingList
      && candidateListSignatureRef.current
      && candidateListSignatureRef.current !== incomingListSignature,
    );

    if (shouldUseIncomingList && (options.replace || incomingListChanged || !candidateListSignatureRef.current)) {
      candidateListSignatureRef.current = incomingListSignature;
      candidateListSourceUrlRef.current = snapshot.page.url;
      setCandidates(mergeCandidates([], snapshot.candidates));
      setIgnoredUrls(new Set());
    } else if (shouldUseIncomingList) {
      candidateListSignatureRef.current = incomingListSignature;
      candidateListSourceUrlRef.current = snapshot.page.url;
      setCandidates((current) => mergeCandidates(current, snapshot.candidates));
    }

    if (snapshot.product) {
      const currentSource = productSourceRef.current;
      const shouldReplaceProduct = pageChanged || !currentSource || currentSource !== snapshot.product.sourceUrl;
      if (shouldReplaceProduct) {
        applyProductForReview(snapshot.product);
      } else {
        mergeProductImagesForReview(snapshot.product);
      }
    } else if (pageChanged && snapshot.page.pageType !== "product") {
      setProduct(null);
      setLiveProduct(null);
      setSelectedImages({});
      productSourceRef.current = null;
    }
    setLastObservedAt(snapshot.observedAt);
    setLastObserveReason(snapshot.reason);
    const candidateText = snapshot.candidates.length > 0
      ? "product list page; Product List unchanged"
      : snapshot.product
        ? `${snapshot.product.imageCandidates.length} product images`
        : candidateListSignatureRef.current
          ? "no new product cards; keeping Product List"
          : "no product cards";
    setStatus(`Live detected ${candidateText}`);
  }

  useEffect(() => {
    if (product || !liveProduct || liveProduct.imageCandidates.length === 0) return;
    applyProductForReview(liveProduct);
    setStatus("Review latest detected images before upload");
  }, [liveProduct, product]);

  useEffect(() => {
    const handler = (message: any) => {
      if (message?.type !== "MARKETPLACE_PAGE_SNAPSHOT" || !message.page) return;
      applyLiveSnapshot({
        page: message.page,
        candidates: Array.isArray(message.candidates) ? message.candidates : [],
        product: message.product ?? null,
        observedAt: message.observedAt || new Date().toISOString(),
        reason: message.reason || "update",
      });
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  useEffect(() => {
    if (!autoDetectEnabled) {
      sendToContent("STOP_MARKETPLACE_OBSERVER").catch(() => undefined);
      return;
    }
    sendToContent("START_MARKETPLACE_OBSERVER").catch(() => undefined);
    const restartObserver = (reason: string) => {
      window.setTimeout(() => {
        clearDetectedState({ keepCandidates: true });
        sendToContent("START_MARKETPLACE_OBSERVER")
          .then(() => sendToContent<MarketplaceLiveSnapshot>("GET_MARKETPLACE_SNAPSHOT"))
          .then((snapshot) => applyLiveSnapshot(snapshot, { replace: true }))
          .catch(() => undefined);
      }, reason === "tab_complete" ? 900 : 250);
    };
    const handleTabUpdated = (tabId: number, changeInfo: any) => {
      if (changeInfo.status !== "complete") return;
      getActiveTabId()
        .then((activeTabId) => {
          if (activeTabId === tabId) restartObserver("tab_complete");
        })
        .catch(() => undefined);
    };
    const handleActivated = () => restartObserver("tab_activated");
    chrome.tabs.onUpdated?.addListener(handleTabUpdated);
    chrome.tabs.onActivated?.addListener(handleActivated);
    return () => {
      chrome.tabs.onUpdated?.removeListener(handleTabUpdated);
      chrome.tabs.onActivated?.removeListener(handleActivated);
      sendToContent("STOP_MARKETPLACE_OBSERVER").catch(() => undefined);
    };
  }, [autoDetectEnabled]);

  const filteredCandidates = useMemo(() => {
    const keyword = filters.keyword.trim().toLowerCase();
    const minScore = Number(filters.minScore) || 0;
    const minRating = Number(filters.minRating) || 0;
    const priceMax = Number(filters.priceMax) || 0;
    const discountMin = Number(filters.discountMin) || 0;
    return candidates
      .filter((item) => !ignoredUrls.has(candidateStableKey(item)))
      .filter((item) => item.score >= minScore)
      .filter((item) => !keyword || item.title.toLowerCase().includes(keyword))
      .filter((item) => !filters.mallOnly || item.badges.some((badge) => /mall|official/i.test(badge)))
      .filter((item) => !filters.freeShippingOnly || item.badges.some((badge) => /free[_\s-]?shipping|ส่งฟรี/i.test(badge)))
      .filter((item) => !filters.excludeSponsored || !item.badges.some((badge) => /sponsored/i.test(badge)))
      .filter((item) => !minRating || (parseRating(item.ratingText) ?? 0) >= minRating)
      .filter((item) => !priceMax || (parseNumber(item.priceText) ?? Number.POSITIVE_INFINITY) <= priceMax)
      .filter((item) => !discountMin || (parsePercent(item.discountText) ?? 0) >= discountMin)
      .sort((a, b) => b.score - a.score);
  }, [candidates, filters, ignoredUrls]);

  useEffect(() => {
    if (activeTab !== "products" || filteredCandidates.length === 0) return;
    const timer = window.setTimeout(() => {
      void prepareProductTabMediaFiles(filteredCandidates);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeTab, filteredCandidates]);

  useEffect(() => {
    if (activeTab !== "products" || candidates.length > 0 || !isScannableListPage(page) || !page?.url) return;
    if (autoProductListScanUrlRef.current === page.url) return;
    autoProductListScanUrlRef.current = page.url;
    const timer = window.setTimeout(() => {
      void run(scanCategory);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [activeTab, candidates.length, page?.pageType, page?.url]);

  const selectedImageCount = useMemo(() => (
    product
      ? product.imageCandidates.filter((image) => selectedImages[image.url]).length
      : Object.values(selectedImages).filter(Boolean).length
  ), [product, selectedImages]);
  const visibleProductImages = useMemo(() => {
    if (!product) return [];
    return sortProductImagesForReview(product.imageCandidates.filter((img) => imageFilter === "all" || img.kind === imageFilter));
  }, [product, imageFilter]);
  const displayedProductImages = visibleProductImages.slice(0, 80);
  const selectedProductImages = useMemo(() => (
    product?.imageCandidates.filter((img) => selectedImages[img.url]) ?? []
  ), [product, selectedImages]);
  const visionEligibleImages = useMemo(() => (
    selectedProductImages
      .filter((img) => img.kind !== "related" && !isLowQualityImage(img))
      .slice(0, 20)
  ), [selectedProductImages]);
  const effectiveLocalProvider = useMemo(() => effectiveConfiguredProvider(localAISettings), [localAISettings]);
  const activeVisionImageUrls = useMemo(() => (
    localAISettings.localVisionEnabled && Boolean(effectiveLocalProvider)
      ? visionImageUrls.filter((url) => visionEligibleImages.some((image) => image.url === url)).slice(0, Math.min(5, Math.max(1, Number(localAISettings.localVisionImageLimit) || 1)))
      : []
  ), [effectiveLocalProvider, localAISettings.localVisionEnabled, localAISettings.localVisionImageLimit, visionImageUrls, visionEligibleImages]);
  const lowQualitySelectedImages = useMemo(() => (
    selectedProductImages.filter((img) => isLowQualityImage(img))
  ), [selectedProductImages]);
  const localModelPresets = useMemo(() => modelPresetsForProvider(effectiveLocalProvider || localAISettings.localProviderMode), [effectiveLocalProvider, localAISettings.localProviderMode]);
  const selectedEvidenceCount = [
    evidence.domHeader,
    evidence.domDescription,
    evidence.rawHtmlBlocks,
    evidence.headerScreenshot,
    evidence.descriptionScreenshot,
  ].filter(Boolean).length;
  const businessSummary = useMemo(() => businessMetrics(editable), [editable.priceCurrentText, editable.commissionRateText]);
  const qualityGroupSummary = useMemo(() => qualityGroups({
    editable,
    selectedImageCount,
    heroImageUrl,
    selectedEvidenceCount,
  }), [editable, selectedImageCount, heroImageUrl, selectedEvidenceCount]);
  const imageKindCounts = useMemo(() => {
    const counts: Record<string, number> = { main: 0, description: 0, review: 0, related: 0, unknown: 0 };
    for (const image of product?.imageCandidates ?? []) counts[image.kind] = (counts[image.kind] ?? 0) + 1;
    return counts;
  }, [product]);
  const fieldEvidenceCount = useMemo(() => Object.keys(product?.fieldEvidence ?? {}).length, [product]);
  const commissionRateInvalid = Boolean(editable.commissionRateText.trim() && parsePercentInput(editable.commissionRateText) == null);
  const affiliateUrlInvalid = Boolean(editable.affiliateUrl.trim() && !normalizedAffiliateUrl(editable.affiliateUrl));
  const queuedCurrentProduct = useMemo(() => {
    if (!product) return null;
    return findMatchingCandidateForProduct(product, queue)?.candidate ?? null;
  }, [product, queue]);
  const dataQualityWarnings = useMemo(() => buildDataQualityWarnings({
    product,
    editable,
    selectedImageCount,
    selectedEvidenceCount,
    lowQualityImageCount: lowQualitySelectedImages.length,
    selectedProductImages,
    heroImageUrl,
  }), [product, editable, selectedImageCount, selectedEvidenceCount, lowQualitySelectedImages.length, selectedProductImages, heroImageUrl]);
  const preUploadStoryOptions = useMemo(() => (
    storytellingHandoff?.storyOptions.slice(0, 4) ?? []
  ), [storytellingHandoff]);
  const aiInsightReadyForUpload = Boolean(productBrief && storytellingHandoff?.storyOptions.length);

  useEffect(() => {
    if (!product) return;
    const timer = window.setTimeout(() => {
      saveReviewDraft(product.sourceUrl, {
        editable,
        evidence,
        selectedImages,
        heroImageUrl,
        updatedAt: new Date().toISOString(),
      })
        .then(() => {
          if (productSourceRef.current === product.sourceUrl) setReviewDraftStatus("Draft saved locally");
        })
        .catch(() => undefined);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [product, editable, evidence, selectedImages, heroImageUrl]);

  function updateProgress(activeLabel: string, doneLabels: string[] = []) {
    setProgress(CAPTURE_STEPS.map((label) => ({
      label,
      status: doneLabels.includes(label) ? "done" : label === activeLabel ? "active" : "pending",
    })));
  }

  function markProgressDone() {
    setProgress(CAPTURE_STEPS.map((label) => ({ label, status: "done" })));
  }

  async function openConnectPage() {
    const origin = `chrome-extension://${chrome.runtime.id}`;
    const deviceId = settings.deviceId || await getOrCreateDeviceId();
    if (!settings.deviceId) setSettings((current) => ({ ...current, deviceId }));
    setTokenEditorOpen(true);
    setConnectFlowStarted(true);
    chrome.tabs.create({ url: `${serverBaseUrl}/marketplace-capture/connect?origin=${encodeURIComponent(origin)}&deviceId=${encodeURIComponent(deviceId)}` });
  }

  function openStarterUrl(url: string) {
    chrome.tabs.update({ url });
  }

  function openShopeeSearch() {
    const keyword = starterKeyword.trim();
    openStarterUrl(keyword ? `https://shopee.co.th/search?keyword=${encodeURIComponent(keyword)}` : "https://shopee.co.th/");
  }

  function openShopeeAffiliateOffer() {
    openStarterUrl(SHOPEE_AFFILIATE_PRODUCT_OFFER_URL);
  }

  function openTikTokSearch() {
    const keyword = starterKeyword.trim();
    openStarterUrl(keyword ? `https://www.tiktok.com/shop/th/search?q=${encodeURIComponent(keyword)}` : "https://www.tiktok.com/shop/th?source=ecommerce_shoppingguide");
  }

  async function clearConnection() {
    const next = { ...settings, token: "", tokenExpiresAt: undefined };
    setSettings(next);
    setTokenInput("");
    setTokenEditorOpen(true);
    setConnectFlowStarted(false);
    await saveSettings(next);
  }

  async function saveConnection() {
    const nextToken = tokenEditorOpen ? tokenInput.trim() : settings.token.trim();
    if (!nextToken) throw new Error("กรุณาใส่ extension token ก่อน");
    const nextExpiresAt = decodeJwtExpiresAt(nextToken);
    if (!nextExpiresAt) throw new Error("Token ไม่ถูกต้อง หรือไม่พบวันหมดอายุ");
    const deviceId = settings.deviceId || await getOrCreateDeviceId();
    await assertTokenMatchesExtensionBinding(nextToken, deviceId);
    const next = { ...settings, baseUrl: serverBaseUrl, token: nextToken, tokenExpiresAt: nextExpiresAt, deviceId };
    setSettings(next);
    setTokenInput("");
    setTokenEditorOpen(false);
    setConnectFlowStarted(false);
    await saveSettings(next);
    setStatus("Connection saved");
  }

  async function refreshLocalAICapability() {
    setLocalAIState("detecting_ai");
    const capability = await detectChromePromptAPI();
    setLocalAICapability(capability);
    const decision = decideLocalAIProvider({ capability, settings: localAISettings, hasToken: Boolean(settings.token) });
    setLocalAIProvider(decision.provider);
    setLocalAIState(decision.state);
  }

  function updateLocalAISetting<K extends keyof LocalAISettings>(key: K, value: LocalAISettings[K]) {
    const next = { ...localAISettings, [key]: value };
    setLocalAISettings(next);
    saveLocalAISettings(next).catch(() => undefined);
  }

  function updateVisionImageSelection(url: string, checked: boolean) {
    const limit = Math.min(5, Math.max(1, Number(localAISettings.localVisionImageLimit) || 1));
    setVisionImageUrls((current) => {
      const without = current.filter((item) => item !== url);
      return checked ? [url, ...without].slice(0, limit) : without;
    });
  }

  function updateLocalProviderMode(mode: LocalAISettings["localProviderMode"]) {
    const next = {
      ...localAISettings,
      localProviderMode: mode,
      localEndpointUrl: mode === "native_messaging" || mode === "auto" || mode === "chrome_prompt_api"
        ? localAISettings.localEndpointUrl
        : defaultEndpointForProvider(mode),
    };
    setLocalAISettings(next);
    saveLocalAISettings(next).catch(() => undefined);
    setConfigTestResult({ status: "idle", message: "Provider changed. Run Test config again." });
  }

  async function promptConfiguredLocalAI(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, imageUrls: string[] = []) {
    if (!localProviderEndpointAllowed(localAISettings)) throw new Error("Local AI config is invalid. Use a localhost/127.0.0.1 endpoint with an allowed path, or configure a native host.");
    const provider = effectiveConfiguredProvider(localAISettings);
    if (!provider) throw new Error("local_ai_provider_not_allowed");
    const response = await chrome.runtime.sendMessage(provider === "native_messaging" ? {
      type: "LOCAL_AI_NATIVE_CHAT",
      hostName: localAISettings.nativeHostName,
      model: localAISettings.localModel,
      messages,
      imageUrls,
      imageTransport: localAISettings.localVisionImageTransport,
      temperature: 0.2,
    } : {
      type: "LOCAL_AI_CHAT",
      provider,
      endpointUrl: localAISettings.localEndpointUrl,
      model: localAISettings.localModel,
      messages,
      imageUrls,
      imageTransport: localAISettings.localVisionImageTransport,
      temperature: 0.2,
    });
    if (!response?.ok) throw new Error(response?.error || "Configured Local AI request failed");
    const content = typeof response.content === "string"
      ? response.content
      : typeof response.message?.content === "string"
        ? response.message.content
        : typeof response.response === "string"
          ? response.response
          : "";
    if (!content.trim()) throw new Error("Configured Local AI returned empty response");
    return content;
  }

  async function generateProductBriefWithConfiguredLocalAI(source: SanitizedLocalAIInput): Promise<ProductBrief> {
    const prompt = buildProductBriefPrompt(source, localAISettings.languagePreference);
    const rawText = await promptConfiguredLocalAI([
      { role: "system", content: "Return valid JSON only. Do not include markdown." },
      { role: "user", content: activeVisionImageUrls.length > 0 ? `${prompt}\n\nVision context: analyze the attached product images only as supporting evidence. Do not infer unsupported claims from images alone.` : prompt },
    ], activeVisionImageUrls);
    const jsonText = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
      || rawText.match(/\{[\s\S]*\}/)?.[0]
      || rawText;
    return validateProductBrief(JSON.parse(jsonText), source);
  }

  async function testConfiguredLocalAI() {
    setError("");
    setConfigTestResult({ status: "testing", message: "Testing local AI connection..." });
    setStatus("Testing Local AI config");
    const testChromePromptAPI = async () => {
      const capability = await detectChromePromptAPI();
      setLocalAICapability(capability);
      if (!capability.apiExposed) throw new Error(capability.reason || "Chrome Prompt API is not exposed.");
      if (capability.availability !== "available") {
        throw new Error(capability.reason || `Chrome Prompt API status is ${capability.availability}.`);
      }
      setLocalAIProvider("chrome_prompt_api");
      setLocalAIState("analyzing_local");
      const session = await createPromptAPISession(undefined, abortLocalAIRef.current?.signal);
      try {
        return await session.prompt("Say exactly: Chrome Gemini Nano is ready.");
      } finally {
        session?.destroy?.();
      }
    };
    try {
      let content = "";
      let testedProviderLabel = configuredProviderLabel(localAISettings.localProviderMode);
      if (localAISettings.localProviderMode === "chrome_prompt_api") {
        content = await testChromePromptAPI();
        testedProviderLabel = "Chrome Gemini Nano";
      } else if (localAISettings.localProviderMode === "auto") {
        const provider = effectiveConfiguredProvider(localAISettings);
        if (provider) {
          try {
            content = await promptConfiguredLocalAI([
              { role: "system", content: "You are a local AI connectivity test. Return one short English sentence." },
              { role: "user", content: "Say that Local AI is ready. Do not add extra explanation." },
            ]);
            testedProviderLabel = configuredProviderLabel(provider);
          } catch {
            content = await testChromePromptAPI();
            testedProviderLabel = "Chrome Gemini Nano";
          }
        } else {
          content = await testChromePromptAPI();
          testedProviderLabel = "Chrome Gemini Nano";
        }
      } else {
        content = await promptConfiguredLocalAI([
          { role: "system", content: "You are a local AI connectivity test. Return one short English sentence." },
          { role: "user", content: "Say that Local AI is ready. Do not add extra explanation." },
        ]);
      }
      const message = `Connection OK (${testedProviderLabel}): ${compactAskText(content, 100)}`;
      setConfigTestResult({ status: "success", message, checkedAt: new Date().toLocaleTimeString() });
      setStatus(message);
      setError("");
    } catch (err) {
      const message = userFriendlyErrorMessage(err, extensionOrigin);
      setConfigTestResult({ status: "failed", message: "Connection failed.", error: message, checkedAt: new Date().toLocaleTimeString() });
      setStatus("Local AI config test failed");
      setError("");
    }
  }

  async function extensionAuthHeaders(contentType?: string) {
    const deviceId = settings.deviceId || await getOrCreateDeviceId();
    if (!settings.deviceId) {
      setSettings((current) => ({ ...current, deviceId }));
      await saveSettings({ ...settings, deviceId });
    }
    if (settings.token) {
      try {
        await assertTokenMatchesExtensionBinding(settings.token, deviceId);
      } catch (error) {
        setTokenEditorOpen(true);
        throw error;
      }
    }
    return {
      ...(contentType ? { "Content-Type": contentType } : {}),
      Authorization: `Bearer ${settings.token}`,
      "X-Marketplace-Device-Id": deviceId,
      "X-Marketplace-Extension-Origin": extensionOrigin,
    };
  }

  async function detect() {
    setError("");
    setStatus("Detecting page");
    clearDetectedState({ keepCandidates: true });
    updateProgress("Detecting page");
    const snapshot = await sendToContent<MarketplaceLiveSnapshot>("GET_MARKETPLACE_SNAPSHOT");
    applyLiveSnapshot(snapshot, { replace: true });
    setActiveTab(snapshot.product ? "capture" : snapshot.candidates.length > 0 ? "products" : "capture");
    setStatus(snapshot.product
      ? "Review latest detected details before upload"
      : snapshot.candidates.length > 0
        ? `Detected product list page. Click Scan visible products to refresh the Product List.`
        : candidates.length > 0
          ? "No new candidates detected; keeping current Product List"
          : "Detected 0 candidates");
  }

  async function scanCategory() {
    setError("");
    setStatus("Scanning visible products");
    const response = await sendToContent<CategoryScanResponse>("SCAN_CATEGORY", { limit: 100 });
    if (response.candidates.length > 0) {
      const mergedCandidates = mergeCandidates([], response.candidates);
      candidateListSignatureRef.current = candidateListSignature(mergedCandidates);
      candidateListSourceUrlRef.current = page?.url || mergedCandidates[0]?.sourceUrl || "";
      setCandidates(mergedCandidates);
      setIgnoredUrls(new Set());
    }
    setActiveTab("products");
    setStatus(response.candidates.length > 0 ? `Found ${response.candidates.length} candidates` : "No candidates found; keeping current Product List");
    await appendDiagnosticLog("product_list_scan", {
      pageUrl: page?.url,
      count: response.candidates.length,
      keptExistingList: response.candidates.length === 0 && candidates.length > 0,
      withAffiliateButtons: response.candidates.filter((candidate) => Boolean(candidate.affiliateLinkAvailable)).length,
      withAffiliateUrls: response.candidates.filter((candidate) => Boolean(candidate.affiliateUrl)).length,
      diagnostics: response.diagnostics ?? null,
      domDiagnostics: response.domDiagnostics ?? null,
    }).catch(() => undefined);
  }

  async function scrollScanCategory() {
    setError("");
    setStatus("Scrolling and scanning");
    const response = await sendToContent<CategoryScanResponse>("SCROLL_AND_SCAN_CATEGORY", { steps: 5, limit: 100 });
    if (response.candidates.length > 0) {
      const mergedCandidates = mergeCandidates([], response.candidates);
      candidateListSignatureRef.current = candidateListSignature(mergedCandidates);
      candidateListSourceUrlRef.current = page?.url || mergedCandidates[0]?.sourceUrl || "";
      setCandidates(mergedCandidates);
      setIgnoredUrls(new Set());
    }
    setActiveTab("products");
    setStatus(response.candidates.length > 0 ? `Found ${response.candidates.length} candidates` : "No candidates found; keeping current Product List");
    await appendDiagnosticLog("product_list_scroll_scan", {
      pageUrl: page?.url,
      count: response.candidates.length,
      keptExistingList: response.candidates.length === 0 && candidates.length > 0,
      withAffiliateButtons: response.candidates.filter((candidate) => Boolean(candidate.affiliateLinkAvailable)).length,
      withAffiliateUrls: response.candidates.filter((candidate) => Boolean(candidate.affiliateUrl)).length,
      diagnostics: response.diagnostics ?? null,
      domDiagnostics: response.domDiagnostics ?? null,
    }).catch(() => undefined);
  }

  async function captureAffiliateDiagnostics() {
    setError("");
    setStatus("Capturing page diagnostics");
    const response = await sendToContent<{ diagnostics?: Record<string, unknown> | null }>("CAPTURE_AFFILIATE_DOM_DIAGNOSTICS");
    await appendDiagnosticLog("affiliate_dom_manual_capture", {
      pageUrl: page?.url,
      diagnostics: response.diagnostics ?? null,
    }).catch(() => undefined);
    await loadDiagnosticLogs();
    setActiveTab("config");
    setStatus("Captured diagnostics in Config");
  }

  async function openProductListTab() {
    setActiveTab("products");
    setError("");
    setStatus(candidates.length > 0 ? "Product List kept. Click Scan visible products to refresh." : "Click Scan visible products to collect Product List.");
    try {
      const snapshot = await sendToContent<MarketplaceLiveSnapshot>("GET_MARKETPLACE_SNAPSHOT");
      applyLiveSnapshot(snapshot, { replace: false });
      setStatus(isScannableListPage(snapshot.page)
        ? "Product List ready. Click Scan visible products to refresh."
        : candidates.length > 0
          ? "Product List kept from previous scan"
          : "Open a Shopee/TikTok list page, then click Scan visible products.");
    } catch (error) {
      if (candidates.length > 0) {
        setStatus("Product List kept from previous scan");
        return;
      }
      throw error;
    }
  }

  async function requestShopeeAffiliateLink(candidate: CategoryProductCandidate) {
    const key = candidateIdentity(candidate);
    setAffiliateLinkBusy((current) => ({ ...current, [key]: true }));
    setStatus("Getting Shopee affiliate link");
    try {
      const response = await sendToContent<{ affiliateUrl: string | null; diagnostics?: Record<string, unknown> }>("GET_SHOPEE_AFFILIATE_LINK", {
        affiliateCardKey: candidate.affiliateCardKey,
        title: candidate.title,
        imageUrl: candidate.imageUrl,
        priceText: candidate.priceText,
        soldCountText: candidate.soldCountText,
      });
      await appendDiagnosticLog("affiliate_link_panel_request", {
        ok: Boolean(response.affiliateUrl),
        key,
        title: candidate.title,
        diagnostics: response.diagnostics ?? null,
      }).catch(() => undefined);
      if (!response.affiliateUrl) {
        setStatus("Shopee did not expose an affiliate URL after click");
        setError("กดปุ่มเอา ลิงก์แล้ว แต่หน้า Shopee ยังไม่เปิดเผย URL ใน DOM/ช่องข้อความให้ extension อ่านได้");
        return;
      }
      const updateCandidate = (item: CategoryProductCandidate) => candidateStableKey(item) === key
        ? {
          ...item,
          affiliateUrl: response.affiliateUrl,
          badges: Array.from(new Set([...item.badges, "affiliate_url"])),
          scoreReasons: Array.from(new Set([...item.scoreReasons, "พบ affiliate URL"])),
        }
        : item;
      setCandidates((current) => mergeCandidates([], current.map(updateCandidate)));
      setQueue((current) => {
        const next = mergeCandidates([], current.map(updateCandidate));
        saveQueue(next).catch(() => undefined);
        return next;
      });
      const enrichedCandidate = updateCandidate(candidate);
      setProduct((current) => current ? enrichProductWithMatchedCandidate(current, [enrichedCandidate]) : current);
      setLiveProduct((current) => current ? enrichProductWithMatchedCandidate(current, [enrichedCandidate]) : current);
      setEditable((current) => current.affiliateUrl ? current : { ...current, affiliateUrl: response.affiliateUrl || "" });
      setStatus("Shopee affiliate link ready");
    } finally {
      setAffiliateLinkBusy((current) => ({ ...current, [key]: false }));
    }
  }

  async function refreshLiveSnapshot() {
    const snapshot = await sendToContent<MarketplaceLiveSnapshot>("GET_MARKETPLACE_SNAPSHOT");
    applyLiveSnapshot(snapshot, { replace: true });
  }

  async function mergeVisibleProductImages() {
    setError("");
    setStatus("Detecting visible product images");
    const before = product?.imageCandidates.length ?? liveProduct?.imageCandidates.length ?? 0;
    const response = await sendToContent<{ product: ProductCapturePayload }>("MERGE_VISIBLE_PRODUCT_IMAGES");
    if (!product) {
      applyProductForReview(response.product);
      setStatus(`Detected ${response.product.imageCandidates.length} product images`);
      return;
    }
    mergeProductImagesForReview(response.product);
    const merged = mergeImageCandidates(product?.imageCandidates ?? liveProduct?.imageCandidates ?? [], response.product.imageCandidates);
    const added = Math.max(0, merged.length - before);
    setStatus(added > 0 ? `Merged ${added} new images from current view` : "No new images found in current view");
  }

  async function sendCandidatesToSmartSpec() {
    if (!settings.token) throw new Error("กรุณาใส่ extension token ก่อน");
    const sourceUrl = page?.url || filteredCandidates[0]?.sourceUrl || await getActiveTabUrl();
    if (!sourceUrl) throw new Error("ไม่พบ URL ของหน้า marketplace");
    const response = await fetch(`${serverBaseUrl}/api/marketplace-captures/category-candidates`, {
      method: "POST",
      headers: await extensionAuthHeaders("application/json"),
      body: JSON.stringify({
        platform: filteredCandidates[0]?.platform || page?.platform || "shopee",
        sourceUrl,
        filters,
        candidates: filteredCandidates.slice(0, 100),
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    setStatus(`Sent ${filteredCandidates.length} candidates`);
  }

  function addQueue(candidate: CategoryProductCandidate) {
    const key = candidateStableKey(candidate);
    const next = mergeCandidates(queue.filter((item) => candidateStableKey(item) !== key), [candidate]);
    setQueue(next);
    saveQueue(next).catch(() => undefined);
  }

  function removeQueue(key: string) {
    const next = queue.filter((item) => candidateStableKey(item) !== key);
    setQueue(next);
    saveQueue(next).catch(() => undefined);
  }

  async function scanProduct() {
    setError("");
    setStatus("Scanning product page");
    updateProgress("Collecting DOM text", ["Detecting page"]);
    const response = await sendToContent<{ product: ProductCapturePayload }>("SCAN_PRODUCT");
    applyProductForReview(response.product);
    setStatus("Review before upload");
  }

  function useLiveProductForReview() {
    if (!liveProduct) return;
    applyProductForReview(liveProduct);
    setStatus("Review latest detected details before upload");
  }

  async function uploadAndAnalyze() {
    if (!product) return;
    if (!settings.token) throw new Error("กรุณาใส่ extension token ก่อน");
    if (commissionRateInvalid) throw new Error("Commission rate ต้องเป็นเปอร์เซ็นต์ 0-100");
    if (affiliateUrlInvalid) throw new Error("Affiliate link ต้องเป็น URL แบบ http(s)");
    const reviewedProduct = buildReviewedProductPayload({ product, editable, selectedImages, heroImageUrl });
    const selected = reviewedProduct.imageCandidates.filter((img) => img.selected).map((img, position) => ({ ...img, position, selected: true }));
    const insightPreviewLines = productBrief ? [
      "",
      "AI Insight ที่จะแนบไปกับ capture:",
      `Summary: ${productBrief.shortSummary || "-"}`,
      productBrief.keySellingPoints.length ? `Selling points: ${productBrief.keySellingPoints.slice(0, 3).join(" | ")}` : "",
      productBrief.targetAudiences.length ? `Audience/Pain: ${productBrief.targetAudiences.slice(0, 2).join(" | ")}${productBrief.buyerPainPoints.length ? ` / ${productBrief.buyerPainPoints.slice(0, 2).join(" | ")}` : ""}` : "",
      preUploadStoryOptions.length ? `Story options: ${preUploadStoryOptions.map((option) => option.title).join(" | ")}` : "",
    ].filter(Boolean) : [
      "",
      "AI Insight: ยังไม่ได้ generate/sync ก่อน upload รอบนี้",
    ];
    const confirmed = window.confirm([
      "ยืนยัน upload รายการสินค้านี้หรือไม่?",
      "",
      `สินค้า: ${reviewedProduct.productName || "Untitled product"}`,
      `URL: ${reviewedProduct.sourceUrl}`,
      reviewedProduct.affiliateUrl ? `Affiliate link: ${reviewedProduct.affiliateUrl}` : "Affiliate link: -",
      `จำนวนภาพที่จะ upload: ${selected.length}`,
      dataQualityWarnings.length ? `คำเตือนคุณภาพข้อมูล: ${dataQualityWarnings.length} รายการ` : "",
      ...insightPreviewLines,
    ].join("\n"));
    if (!confirmed) {
      setStatus("Upload cancelled");
      return;
    }
    setStatus("Creating capture draft");
    updateProgress("Applying edits/selections", ["Detecting page", "Collecting DOM text", "Showing local review"]);
    const domText = [
      evidence.domHeader ? product.rawDomText.slice(0, 30_000) : "",
      evidence.domDescription ? editable.descriptionText : "",
    ].filter(Boolean).join("\n\n");
    const htmlBlocks = evidence.rawHtmlBlocks ? product.htmlBlocks : product.htmlBlocks.map((block) => ({ ...block, outerHTML: undefined }));
    const draft = await fetch(`${serverBaseUrl}/api/marketplace-captures/captures`, {
      method: "POST",
      headers: await extensionAuthHeaders("application/json"),
      body: JSON.stringify({
        platform: product.platform,
        sourceUrl: product.sourceUrl,
        originalSourceUrl: product.originalSourceUrl,
        cleanSourceUrl: product.cleanSourceUrl,
        canonicalSourceUrl: product.canonicalSourceUrl,
        sourceUrlFormat: product.sourceUrlFormat,
        pageType: product.pageType,
        externalProductId: product.externalProductId,
        externalShopId: product.externalShopId,
        affiliateUrl: reviewedProduct.affiliateUrl,
        pageTitle: product.pageTitle,
        domText,
        htmlBlocks,
        imageCandidates: selected,
        rawPayload: {
          ...reviewedProduct,
          imageCandidates: selected,
          brand: editable.brand,
          heroImageUrl,
          dataQualityWarnings,
        },
      }),
    });
    if (!draft.ok) throw new Error(await draft.text());
    const draftJson = await draft.json();
    const captureId = typeof draftJson.captureId === "string" ? draftJson.captureId : "";
    if (captureId && productBrief && sanitizedAIInput) {
      try {
        setStatus("Syncing AI insights to capture");
        const linkedSource = await sanitizeCaptureForLocalAI(reviewedProduct, captureId);
        const linkedBrief: ProductBrief = {
          ...productBrief,
          source: { ...productBrief.source, captureId, url: linkedSource.sourceUrl },
        };
        const linkedHandoff: MarketplaceStorytellingHandoff | null = storytellingHandoff
          ? { ...storytellingHandoff, sourceCaptureIds: [captureId], sourceUrl: linkedSource.sourceUrl }
          : null;
        setSanitizedAIInput(linkedSource);
        setProductBrief(linkedBrief);
        if (linkedHandoff) setStorytellingHandoff(linkedHandoff);
        await syncStructuredInsight({
          source: linkedSource,
          brief: linkedBrief,
          handoff: linkedHandoff,
          rawCapture: reviewedProduct,
          provider: localAIProvider as LocalAIProviderId,
          openResult: false,
        });
      } catch (err) {
        setError(`AI insight sync failed: ${userFriendlyErrorMessage(err, extensionOrigin)}`);
      }
    }
    updateProgress("Uploading selected evidence", ["Detecting page", "Collecting DOM text", "Showing local review", "Applying edits/selections"]);

    async function uploadScreenshot(section: "product_header" | "description", fileName: string, sortOrder: number) {
      if (section === "product_header") {
        await sendToContent("SCROLL_PRODUCT_HEADER").catch(() => undefined);
        await delay(600);
      }
      if (section === "description") {
        await sendToContent("SCROLL_PRODUCT_DESCRIPTION").catch(() => undefined);
        await delay(800);
      }
      const screenshot = await chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE_TAB" });
      if (screenshot?.ok) {
        const form = new FormData();
        form.set("file", dataUrlToBlob(screenshot.dataUrl), fileName);
        form.set("kind", "screenshot");
        form.set("section", section);
        form.set("metadata", JSON.stringify({ source: "visible_tab", sortOrder }));
        const upload = await fetch(`${serverBaseUrl}${draftJson.next.uploadAssets}`, {
          method: "POST",
          headers: await extensionAuthHeaders(),
          body: form,
        });
        if (!upload.ok) throw new Error(await upload.text());
      }
    }
    if (evidence.headerScreenshot) {
      setStatus("Capturing header screenshot");
      await uploadScreenshot("product_header", "product_header.png", 0);
    }
    if (evidence.descriptionScreenshot) {
      setStatus("Capturing description screenshot");
      await uploadScreenshot("description", "description.png", 1);
    }

    setStatus("Analyzing capture");
    updateProgress("Calling LLM extraction", ["Detecting page", "Collecting DOM text", "Showing local review", "Applying edits/selections", "Uploading selected evidence"]);
    const analyze = await fetch(`${serverBaseUrl}${draftJson.next.analyze}`, {
      method: "POST",
      headers: await extensionAuthHeaders("application/json"),
      body: JSON.stringify({ forceRerun: false, language: "th" }),
    });
    if (!analyze.ok) throw new Error(await analyze.text());
    const analyzeJson = await analyze.json();
    setStatus("Preview ready");
    markProgressDone();
    if (queuedCurrentProduct) removeQueue(candidateStableKey(queuedCurrentProduct));
    await clearReviewDraft(product.sourceUrl).catch(() => undefined);
    setReviewDraftStatus("");
    chrome.tabs.create({
      url: resolveServerUrl(serverBaseUrl, analyzeJson.previewUrl),
      active: false,
    });
  }

  async function createLocalProductBrief(options: { autoSync?: boolean; openTab?: boolean } = {}) {
    if (!product) throw new Error("กรุณา Scan & Review สินค้าก่อน");
    setError("");
    if (options.openTab !== false) setActiveTab("localAI");
    setStatus("Generating product insight");
    const reviewedProduct = buildReviewedProductPayload({ product, editable, selectedImages, heroImageUrl });
    const source = await sanitizeCaptureForLocalAI(reviewedProduct);
    setSanitizedAIInput(source);
    const cacheKey = `${source.platform}:${source.sourceUrl}:${source.payloadHash}:product_brief:${LOCAL_AI_CACHE_SCHEMA_VERSION}`;
    const cache = await loadLocalAIInsightCache();
    const decision = decideLocalAIProvider({ capability: localAICapability, settings: localAISettings, hasToken: Boolean(settings.token) });
    const configuredProvider = localAISettings.preferLocalAI ? effectiveConfiguredProvider(localAISettings) : "";
    setLocalAIProvider(configuredProvider || decision.provider);
    if (cache[cacheKey]) {
      const cached = cache[cacheKey] as any;
      setProductBrief(cached.productBrief);
      setVideoBrief(cached.videoBrief);
      setStorytellingHandoff(cached.storytellingHandoff);
      setLocalAIState("insight_ready");
      setStatus("Loaded cached local insight");
      if (options.autoSync && settings.token) {
        await syncStructuredInsight({
          source,
          brief: cached.productBrief,
          video: cached.videoBrief,
          handoff: cached.storytellingHandoff,
          rawCapture: reviewedProduct,
          provider: configuredProvider || decision.provider,
          openResult: false,
        });
      }
      return;
    }
    let brief: ProductBrief;
    let resolvedProvider: LocalAIProviderId = configuredProvider || decision.provider;
    const runServerFallback = async () => {
      if (!settings.token) {
        setLocalAIProvider("noop");
        resolvedProvider = "noop";
        return createDeterministicProductBrief(source);
      }
      const deviceId = settings.deviceId || await getOrCreateDeviceId();
      await assertTokenMatchesExtensionBinding(settings.token, deviceId);
      const result = await generateProductBriefWithServerAI({
        serverBaseUrl,
        token: settings.token,
        deviceId,
        extensionOrigin,
        extensionVersion: EXTENSION_VERSION,
        source,
        languagePreference: localAISettings.languagePreference,
      });
      if (!result.ok || !result.data) {
        throw new Error(result.error?.message || "Server AI fallback failed");
      }
      setLocalAIProvider("server_ai");
      resolvedProvider = "server_ai";
      return result.data;
    };
    if (configuredProvider) {
      setLocalAIState("analyzing_local");
      try {
        brief = await generateProductBriefWithConfiguredLocalAI(source);
        resolvedProvider = configuredProvider;
      } catch (error) {
        if (!localAISettings.enableServerFallback) throw error;
        setLocalAIState("analyzing_server");
        brief = await runServerFallback();
      }
    } else if (decision.provider === "chrome_prompt_api") {
      setLocalAIState(localAICapability.availability === "downloadable" ? "download_required" : "analyzing_local");
      abortLocalAIRef.current = new AbortController();
      const result = await generateProductBriefWithPromptAPI({
        source,
        languagePreference: localAISettings.languagePreference,
        signal: abortLocalAIRef.current.signal,
        onProgress: (progressValue) => {
          setLocalAIProgress(progressValue);
          setLocalAIState("downloading");
        },
      });
      if (!result.ok || !result.data) {
        if (!localAISettings.enableServerFallback) throw new Error(result.error?.message || "Local AI analysis failed");
        setLocalAIState("analyzing_server");
        brief = await runServerFallback();
      } else {
        brief = result.data;
        resolvedProvider = "chrome_prompt_api";
      }
    } else if (decision.provider === "server_ai") {
      setLocalAIState("analyzing_server");
      brief = await runServerFallback();
    } else {
      setLocalAIState("raw_capture_only");
      brief = createDeterministicProductBrief(source);
      resolvedProvider = "noop";
    }
    const nextVideoBrief = buildVideoBriefFromProduct(brief, source);
    const nextHandoff = buildStorytellingHandoff(brief, nextVideoBrief, source);
    setProductBrief(brief);
    setVideoBrief(nextVideoBrief);
    setStorytellingHandoff(nextHandoff);
    setLocalAIState(nextHandoff.readiness === "ready_for_storytelling" ? "insight_ready" : "needs_review");
    await saveLocalAIInsightCache({ ...cache, [cacheKey]: { productBrief: brief, videoBrief: nextVideoBrief, storytellingHandoff: nextHandoff, cachedAt: new Date().toISOString() } });
    if (settings.token && (options.autoSync || localAISettings.autoGenerateInsights)) {
      await syncStructuredInsight({
        source,
        brief,
        video: nextVideoBrief,
        handoff: nextHandoff,
        rawCapture: reviewedProduct,
        provider: resolvedProvider,
        openResult: false,
      });
      return;
    }
    setStatus("AI insight ready");
  }

  async function downloadLocalAIModel() {
    setError("");
    setLocalAIProvider("chrome_prompt_api");
    setLocalAIState("downloading");
    setLocalAIProgress(0);
    setStatus("Downloading Gemini Nano");
    abortLocalAIRef.current = new AbortController();
    const session = await createPromptAPISession((progressValue) => {
      setLocalAIProgress(progressValue);
      setLocalAIState("downloading");
    }, abortLocalAIRef.current.signal);
    session?.destroy?.();
    abortLocalAIRef.current = null;
    setLocalAIProgress(null);
    await refreshLocalAICapability();
    setStatus("Local AI model ready");
  }

  function cancelLocalAI() {
    abortLocalAIRef.current?.abort();
    abortLocalAIRef.current = null;
    setLocalAIState("cancelled");
    setStatus("Local AI cancelled");
  }

  function updateStorytellingClaim(claimId: string, action: "approve" | "remove" | "edit") {
    setStorytellingHandoff((current) => {
      if (!current) return current;
      const claims = current.claims.map((claim) => {
        if (claim.id !== claimId) return claim;
        if (action === "approve") return { ...claim, status: "user_approved" as const, confidence: Math.max(claim.confidence, 0.8) };
        if (action === "remove") return { ...claim, status: "removed" as const };
        const nextText = window.prompt("แก้ claim ก่อนแนบเป็น AI Insight", claim.text)?.trim();
        return nextText ? { ...claim, text: nextText, status: "user_approved" as const, confidence: Math.max(claim.confidence, 0.75) } : claim;
      });
      const activeClaims = claims.filter((claim) => claim.status !== "removed");
      const blockers = [
        ...(current.selectedImages.length === 0 ? ["missing_selected_product_image"] : []),
        ...(current.selectedImages.some((image) => image.fidelity === "mismatch_risk") ? ["low_resolution_or_mismatch_risk_image"] : []),
        ...(activeClaims.some((claim) => claim.status === "needs_review" || claim.evidenceIds.length === 0) ? ["unsupported_claims_need_review"] : []),
      ];
      return {
        ...current,
        claims,
        blockers,
        readiness: blockers.length === 0 ? "ready_for_storytelling" : "needs_user_review",
      };
    });
  }

  function analyzeUserAddedInsight() {
    if (!storytellingHandoff) throw new Error("กรุณา Generate AI Insight ก่อน เพื่อให้ระบบรู้ว่าจะเติมข้อมูลเข้า option ไหน");
    const rawText = userInsightText.trim();
    if (rawText.length < 3) throw new Error("กรุณาใส่ข้อมูลสินค้าที่ user รู้เพิ่มเติมก่อน");
    const draft = createUserStoryInsightDraft(rawText, storytellingHandoff);
    if (draft.additions.length === 0) throw new Error("ยังแยกหมวดข้อมูลไม่ได้ กรุณาเพิ่มรายละเอียดให้ชัดขึ้น");
    setUserInsightDraft(draft);
    setStatus("Review user-added insight before storing");
  }

  function mergeUserDraftIntoProductBrief(brief: ProductBrief, draft: UserStoryInsightDraft): ProductBrief {
    const addUnique = (current: string[], values: string[], limit = 12) => {
      const next = [...current];
      for (const value of values) {
        if (value && !next.includes(value)) next.push(value);
      }
      return next.slice(0, limit);
    };
    let next = { ...brief };
    for (const addition of draft.additions) {
      if (addition.category === "audience_pain_problem") {
        next = {
          ...next,
          targetAudiences: addUnique(next.targetAudiences, addition.values.filter((value) => /(ลูกค้า|คนที่|กลุ่ม|สำหรับ|เหมาะกับ)/i.test(value))),
          buyerPainPoints: addUnique(next.buyerPainPoints, addition.values),
        };
      }
      if (addition.category === "selling_points") {
        next = { ...next, keySellingPoints: addUnique(next.keySellingPoints, addition.values) };
      }
      if (addition.category === "hooks") {
        next = { ...next, suggestedHooks: addUnique(next.suggestedHooks, addition.values) };
      }
      if (addition.category === "objections_trust") {
        next = {
          ...next,
          buyerObjections: addUnique(next.buyerObjections, addition.values.filter((value) => /(กังวล|ลังเล|แพง|กลัว|ไม่มั่นใจ)/i.test(value))),
          trustSignals: addUnique(next.trustSignals, addition.values),
        };
      }
      if (addition.category === "example_use_case") {
        next = { ...next, contentAngles: addUnique(next.contentAngles, addition.values) };
      }
    }
    return { ...next, confidence: Math.min(0.95, next.confidence + 0.04) };
  }

  function confirmUserAddedInsight() {
    if (!storytellingHandoff || !userInsightDraft) return;
    const nextHandoff = applyUserStoryInsightDraft(storytellingHandoff, userInsightDraft);
    setStorytellingHandoff(nextHandoff);
    if (productBrief) setProductBrief(mergeUserDraftIntoProductBrief(productBrief, userInsightDraft));
    if (videoBrief) {
      const hook = userInsightDraft.additions.find((item) => item.category === "hooks")?.values[0];
      if (hook) setVideoBrief({ ...videoBrief, hook, captions: [hook, ...videoBrief.captions.filter((item) => item !== hook)].slice(0, 20) });
    }
    setUserInsightDraft(null);
    setUserInsightText("");
    setStatus("User-added insight confirmed");
  }

  async function askAboutProduct() {
    const question = askQuestion.trim();
    if (!question) throw new Error("กรุณาพิมพ์คำถามก่อน");
    setError("");
    setAskBusy(true);
    setStatus("Answering Ask");
    const fallback = buildRuleBasedAskAnswer({ question, editable, product, productBrief, storytellingHandoff });
    try {
      if (localAISettings.preferLocalAI && effectiveConfiguredProvider(localAISettings)) {
        const context = buildAskContext({ editable, product, productBrief, storytellingHandoff });
        const answer = await promptConfiguredLocalAI([
          { role: "system", content: "You are SmartAIHub Ask. Return JSON only with answer, shopeeKeywords, googleKeywords, cautions. Rewrite search keywords; do not copy the full question." },
          { role: "user", content: [`Product context:\n${context || "No reviewed product context yet."}`, activeVisionImageUrls.length > 0 ? "Use attached selected product images as supporting context only." : "", `Question:\n${question}`].filter(Boolean).join("\n\n") },
        ], activeVisionImageUrls);
        setAskResult(parseAskAIJson(answer, fallback) || { ...fallback, source: "local_ai", answer: compactAskText(answer, 1400) || fallback.answer });
      } else if (localAISettings.preferLocalAI && localAICapability.availability === "available") {
        const context = buildAskContext({ editable, product, productBrief, storytellingHandoff });
        const session = await createPromptAPISession(undefined, abortLocalAIRef.current?.signal);
        try {
          const answer = await session.prompt([
            "You are SmartAIHub Ask, a read-only marketplace product assistant.",
            "Return JSON only.",
            "Schema: {\"answer\":\"concise Thai answer\",\"shopeeKeywords\":[\"2-6 optimized Thai marketplace search keywords\"],\"googleKeywords\":[\"1-5 research keywords\"],\"cautions\":[\"optional safety or evidence caveats\"]}.",
            "Do not store data, do not say you saved anything, and do not create product insights.",
            "Use only the provided product context and general shopping reasoning.",
            "Do not copy the user's full question as a search keyword. Rewrite it into short buyer/search phrases.",
            "Shopee keywords should be product/category terms with buyer constraints, not natural-language questions.",
            "For medical, child, safety, or health claims, do not diagnose or promise results; recommend checking labels and professional advice.",
            "If the user needs another product, suggest what keywords to search for.",
            `Product context:\n${context || "No reviewed product context yet."}`,
            `Question:\n${question}`,
          ].join("\n\n"));
          setAskResult(parseAskAIJson(answer, fallback) || { ...fallback, source: "local_ai", answer: compactAskText(answer, 1400) || fallback.answer });
        } finally {
          session?.destroy?.();
        }
      } else {
        setAskResult(fallback);
      }
      setError("");
      setStatus("Ask answer ready");
    } catch {
      setAskResult(fallback);
      setError("");
      setStatus("Ask answered with fallback");
    } finally {
      setAskBusy(false);
    }
  }

  async function loadProductionDirectorProjects(search = productionProjectSearch) {
    if (!settings.token) throw new Error("กรุณาใส่ extension token ก่อน");
    setProductionProjectsBusy(true);
    setStatus("Loading Production Director projects");
    try {
      const params = new URLSearchParams();
      params.set("limit", "30");
      if (search.trim()) params.set("query", search.trim());
      const response = await fetch(`${serverBaseUrl}/api/marketplace-captures/production-director/projects?${params.toString()}`, {
        method: "GET",
        headers: await extensionAuthHeaders(),
      });
      if (!response.ok) throw new Error(await response.text());
      const json = await response.json();
      const projects = Array.isArray(json.projects) ? json.projects as ProductionDirectorProjectSummary[] : [];
      setProductionProjects(projects);
      setStatus(`Loaded ${projects.length} Production Director projects`);
      if (projects.length === 0) {
        setSelectedProductionProjectId("");
        setSelectedProductionProject(null);
      } else if (!selectedProductionProjectId || !projects.some((project) => project.productionRunId === selectedProductionProjectId)) {
        await loadProductionDirectorProject(projects[0].productionRunId);
      }
    } finally {
      setProductionProjectsBusy(false);
    }
  }

  async function loadProductionDirectorProject(productionRunId: string) {
    if (!settings.token) throw new Error("กรุณาใส่ extension token ก่อน");
    setProductionProjectBusy(true);
    setSelectedProductionProjectId(productionRunId);
    setProductionMediaFiles({});
    setStatus("Loading storyboard prompts");
    try {
      const params = new URLSearchParams();
      params.set("productionRunId", productionRunId);
      const response = await fetch(`${serverBaseUrl}/api/marketplace-captures/production-director/project?${params.toString()}`, {
        method: "GET",
        headers: await extensionAuthHeaders(),
      });
      if (!response.ok) throw new Error(await response.text());
      const json = await response.json();
      const project = json.project as ProductionDirectorProjectDetail | null | undefined;
      setSelectedProductionProject(project ?? null);
      if (project) {
        void prepareProductionProjectMediaFiles(project);
      }
      setStatus("Production Director storyboard ready");
    } finally {
      setProductionProjectBusy(false);
    }
  }

  async function loadStoryboardReviewProjects(search = storyboardProjectSearch) {
    if (!settings.token) throw new Error("กรุณาใส่ extension token ก่อน");
    setStoryboardProjectsBusy(true);
    setStatus("Loading Storyboard Review projects");
    try {
      const params = new URLSearchParams();
      params.set("limit", "30");
      if (search.trim()) params.set("query", search.trim());
      const response = await fetch(`${serverBaseUrl}/api/marketplace-captures/storyboard-review/projects?${params.toString()}`, {
        method: "GET",
        headers: await extensionAuthHeaders(),
      });
      if (!response.ok) throw new Error(await response.text());
      const json = await response.json();
      const projects = Array.isArray(json.projects) ? json.projects as StoryboardReviewProjectSummary[] : [];
      setStoryboardProjects(projects);
      setStatus(`Loaded ${projects.length} Storyboard Review projects`);
      if (projects.length === 0) {
        setSelectedStoryboardProjectId(null);
        setSelectedStoryboardProject(null);
      } else if (!selectedStoryboardProjectId || !projects.some((project) => project.id === selectedStoryboardProjectId)) {
        await loadStoryboardReviewProject(projects[0].id);
      }
    } finally {
      setStoryboardProjectsBusy(false);
    }
  }

  async function loadStoryboardReviewProject(reviewId: number) {
    if (!settings.token) throw new Error("กรุณาใส่ extension token ก่อน");
    setStoryboardProjectBusy(true);
    setSelectedStoryboardProjectId(reviewId);
    setProductionMediaFiles({});
    setStatus("Loading storyboard review clips");
    try {
      const params = new URLSearchParams();
      params.set("reviewId", String(reviewId));
      const response = await fetch(`${serverBaseUrl}/api/marketplace-captures/storyboard-review/project?${params.toString()}`, {
        method: "GET",
        headers: await extensionAuthHeaders(),
      });
      if (!response.ok) throw new Error(await response.text());
      const json = await response.json();
      const project = json.project as StoryboardReviewProjectDetail | null | undefined;
      setSelectedStoryboardProject(project ?? null);
      if (project) {
        void prepareStoryboardReviewProjectMediaFiles(project);
      }
      setStatus("Storyboard Review clips ready");
    } finally {
      setStoryboardProjectBusy(false);
    }
  }

  function productionMediaFileName(url: string, title: string, kind: "image" | "video", mimeType: string) {
    const fallbackExtension = kind === "video" ? "mp4" : mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
    const fallback = `${title || kind}.${fallbackExtension}`.replace(/[\\/:*?"<>|]+/g, "-");
    return fileNameFromUrl(url, fallback);
  }

  async function prepareProductionMediaFile(rawUrl: string | null | undefined, title: string, kind: "image" | "video" = "image") {
    const sourceUrl = rawUrl?.trim();
    if (!sourceUrl) return;
    const url = resolveServerUrl(serverBaseUrl, sourceUrl);
    if (!url || productionMediaFiles[url]?.status === "ready" || productionMediaFiles[url]?.status === "loading") return;
    setProductionMediaFiles((current) => ({ ...current, [url]: { status: "loading" } }));
    try {
      let blob: Blob;
      if (url.startsWith("data:image/")) {
        blob = dataUrlToBlob(url);
      } else {
        let response = await fetch(url);
        if (!response.ok) {
          response = await fetch(url, { headers: await extensionAuthHeaders() });
        }
        if (!response.ok) throw new Error(`Unable to fetch media ${response.status}`);
        blob = await response.blob();
      }
      const mimeType = blob.type || (kind === "video" ? "video/mp4" : "image/png");
      const file = new File([blob], productionMediaFileName(url, title, kind, mimeType), { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      let dragId: string | undefined;
      let dataUrl: string | undefined;
      try {
        dataUrl = await blobToDataUrl(blob);
        dragId = createDragMediaId();
        await chrome.runtime.sendMessage({
          type: "SMARTAIHUB_STORE_DRAG_MEDIA",
          id: dragId,
          dataUrl,
          name: file.name,
          mimeType,
        });
      } catch {
        dragId = undefined;
        dataUrl = undefined;
      }
      setProductionMediaFiles((current) => {
        const previous = current[url];
        if (previous?.objectUrl) URL.revokeObjectURL(previous.objectUrl);
        return { ...current, [url]: { status: "ready", file, objectUrl, dragId, dataUrl } };
      });
    } catch {
      setProductionMediaFiles((current) => ({ ...current, [url]: { status: "failed" } }));
    }
  }

  async function prepareDragMediaFiles(jobs: ProductionMediaPrepareJob[]) {
    await Promise.allSettled(jobs.map((job) => prepareProductionMediaFile(job.url, job.title, job.kind ?? "image")));
  }

  async function prepareProductTabMediaFiles(items: CategoryProductCandidate[]) {
    const jobs: ProductionMediaPrepareJob[] = items
      .slice(0, 30)
      .filter((item) => Boolean(item.imageUrl))
      .map((item) => ({ url: item.imageUrl, title: item.title || "product-image", kind: "image" }));
    await prepareDragMediaFiles(jobs);
  }

  async function prepareProductionProjectMediaFiles(project: ProductionDirectorProjectDetail) {
    const jobs: ProductionMediaPrepareJob[] = [
      ...project.referenceImages.map((image) => ({ url: image.url, title: image.title || image.role || image.kind })),
      ...project.shots.flatMap((shot) => [
        { url: shot.referenceImageUrl, title: `shot-${shot.order}-reference-frame` },
        { url: shot.startFrameUrl, title: `shot-${shot.order}-start-frame` },
        { url: shot.stopFrameUrl, title: `shot-${shot.order}-stop-frame` },
        ...(shot.storyboardGridFrames ?? []).map((frame) => ({ url: frame.url, title: frame.name || `shot-${shot.order}-grid-frame-${frame.index + 1}` })),
        ...shot.referenceImages.map((image) => ({ url: image.url, title: image.title || image.role || image.kind })),
      ]),
    ];
    await prepareDragMediaFiles(jobs);
  }

  async function prepareStoryboardReviewProjectMediaFiles(project: StoryboardReviewProjectDetail) {
    const jobs: ProductionMediaPrepareJob[] = [
      ...project.clips.flatMap((clip) => [
        { url: clip.referenceImageUrl, title: `clip-${clip.order}-reference-frame` },
        { url: clip.startFrameUrl, title: `clip-${clip.order}-start-frame` },
        { url: clip.stopFrameUrl, title: `clip-${clip.order}-stop-frame` },
        ...clip.referenceImages.map((image) => ({ url: image.url, title: image.title || image.role })),
      ]),
    ];
    await prepareDragMediaFiles(jobs);
  }

  async function syncStructuredInsight(input: {
    source?: SanitizedLocalAIInput;
    brief?: ProductBrief;
    video?: VideoBrief | null;
    handoff?: MarketplaceStorytellingHandoff | null;
    rawCapture?: ProductCapturePayload;
    provider?: LocalAIProviderId;
    openResult?: boolean;
  } = {}) {
    if (!settings.token) throw new Error("กรุณาใส่ extension token ก่อน");
    const source = input.source ?? sanitizedAIInput;
    const rawBrief = input.brief ?? productBrief;
    if (!source || !rawBrief) throw new Error("กรุณาสร้าง AI Insight ก่อน");
    const brief = validateProductBrief(rawBrief, source);
    const video = (input.video ?? videoBrief) ? buildVideoBriefFromProduct(brief, source) : null;
    const handoff = (input.handoff ?? storytellingHandoff) && video ? buildStorytellingHandoff(brief, video, source) : null;
    setLocalAIState("syncing");
    const reviewedProduct = input.rawCapture ?? (product ? buildReviewedProductPayload({ product, editable, selectedImages, heroImageUrl }) : undefined);
    const supportPayloads = buildSupplementalInsightPayloads(source, brief);
    const payloads: Array<{ insightType: "product_brief" | "review_insight" | "tiktok_shop_trend" | "combined_opportunity" | "storytelling_handoff"; payload: unknown }> = [
      { insightType: "product_brief", payload: brief },
      ...supportPayloads,
      ...(handoff ? [{ insightType: "storytelling_handoff" as const, payload: handoff }] : []),
    ];
    let lastResponse: any = null;
    let storytellingResponse: any = null;
    for (const item of payloads) {
      const response = await fetch(`${serverBaseUrl}/api/marketplace-captures/insights`, {
        method: "POST",
        headers: await extensionAuthHeaders("application/json"),
        body: JSON.stringify(buildInsightSyncRequest({
          extensionVersion: EXTENSION_VERSION,
          insightType: item.insightType,
          provider: input.provider ?? localAIProvider as any,
          source,
          payload: item.payload,
          rawCapture: reviewedProduct,
          settings: localAISettings,
        })),
      });
      if (!response.ok) throw new Error(await response.text());
      lastResponse = await response.json();
      if (item.insightType === "storytelling_handoff") storytellingResponse = lastResponse;
    }
    setLocalAIState("synced");
    setStatus("AI insights generated and synced");
    if (input.openResult !== false && lastResponse?.openUrl) {
      chrome.tabs.create({ url: resolveServerUrl(serverBaseUrl, lastResponse.openUrl), active: false });
    }
    return { lastResponse, storytellingResponse };
  }

  function buildSupplementalInsightPayloads(source: SanitizedLocalAIInput, brief: ProductBrief) {
    const evidenceIds = source.evidence.map((item) => item.id).slice(0, 20);
    const reviewInsight = {
      schemaVersion: "1.0",
      source: { platform: source.platform, captureId: source.captureId, url: source.sourceUrl, affiliateUrl: source.affiliateUrl ?? null },
      positiveThemes: brief.trustSignals.length ? brief.trustSignals : brief.keySellingPoints.slice(0, 3),
      negativeThemes: [],
      repeatedPhrases: [],
      commonBuyerQuestions: brief.buyerObjections.map((objection) => `ลูกค้าอาจถามเรื่อง ${objection}`),
      objectionsToAddress: brief.buyerObjections,
      recommendedFAQ: brief.buyerObjections.slice(0, 4).map((objection) => ({
        question: `ควรอธิบายเรื่อง ${objection} อย่างไร?`,
        answerDraft: "ใช้ข้อมูลจากหน้าสินค้าและหลักฐานที่เลือกเท่านั้นก่อนเผยแพร่",
      })),
      contentRecommendations: brief.contentAngles,
      confidence: Math.min(brief.confidence, source.reviews.length > 0 ? 0.75 : 0.45),
      evidenceIds,
    };
    const trendBrief = {
      schemaVersion: "1.0",
      source: { platform: source.platform, captureId: source.captureId, url: source.sourceUrl, affiliateUrl: source.affiliateUrl ?? null },
      contentType: source.platform === "tiktok_shop" ? "product_review" : "unknown",
      hookPattern: brief.suggestedHooks[0] || brief.shortSummary,
      structure: ["hook", "product proof", "objection handling", "CTA"],
      hashtags: source.tiktok?.hashtags ?? [],
      audience: brief.targetAudiences,
      engagementDrivers: brief.keySellingPoints,
      replicableIdeas: brief.contentAngles,
      risks: brief.buyerObjections,
      confidence: Math.min(brief.confidence, source.platform === "tiktok_shop" ? 0.65 : 0.35),
      evidenceIds,
    };
    const combined = {
      schemaVersion: "1.0",
      shopeeCaptureId: source.platform === "shopee" ? source.captureId : undefined,
      tiktokCaptureId: source.platform === "tiktok_shop" ? source.captureId : undefined,
      opportunitySummary: brief.shortSummary,
      productTrendFitScore: Math.round(Math.min(brief.confidence, 1) * 100),
      recommendedContentFormat: source.platform === "tiktok_shop" ? "TikTok Shop short" : "Shopee product support video",
      suggestedPositioning: brief.contentAngles[0] || brief.keySellingPoints[0] || brief.shortSummary,
      risks: brief.buyerObjections,
      nextActions: ["create_video_brief", "send_to_ai_video_studio", "save_to_product_library"],
    };
    return [
      { insightType: "review_insight" as const, payload: reviewInsight },
      ...(source.platform === "tiktok_shop" ? [{ insightType: "tiktok_shop_trend" as const, payload: trendBrief }] : []),
      { insightType: "combined_opportunity" as const, payload: combined },
    ];
  }

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (err: any) {
      setError(userFriendlyErrorMessage(err, extensionOrigin));
      if (shouldReplaceExtensionToken(err)) {
        setTokenEditorOpen(true);
        setConnectFlowStarted(false);
        setActiveTab("capture");
      }
      setStatus("Error");
      setProgress((current) => current.map((step) => step.status === "active" ? { ...step, status: "error" } : step));
    }
  }

  async function loadDiagnosticLogs() {
    const result = await chrome.storage.local.get([DIAGNOSTIC_LOG_KEY]);
    const logs = Array.isArray(result[DIAGNOSTIC_LOG_KEY]) ? result[DIAGNOSTIC_LOG_KEY] as DiagnosticLogEntry[] : [];
    setDiagnosticLogs(logs.slice(-80).reverse());
    setStatus(`Loaded ${logs.length} diagnostic logs`);
  }

  async function clearDiagnosticLogs() {
    await chrome.storage.local.remove([DIAGNOSTIC_LOG_KEY]);
    setDiagnosticLogs([]);
    setStatus("Diagnostic logs cleared");
  }

  const updateFilter = (key: keyof CandidateFilters, value: string | boolean) => setFilters((current) => ({ ...current, [key]: value }));
  const updateEditable = (key: keyof EditableProduct, value: string) => setEditable((current) => ({ ...current, [key]: value }));
  const updateEvidence = (key: keyof EvidenceSelection, value: boolean) => setEvidence((current) => ({ ...current, [key]: value }));
  const canDownloadLocalAIModel = localAISettings.preferLocalAI && localAICapability.availability === "downloadable";
  const storytellingInsightAttachable = canAttachStorytellingInsight(storytellingHandoff?.readiness);
  const tabButtonClass = (tab: PanelTab) => `tab-button${activeTab === tab ? " active" : ""}`;
  async function copyProductionPrompt(label: string, value: string) {
    const prompt = value.trim();
    if (!prompt) {
      setStatus("No prompt to copy");
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(prompt);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = prompt;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setStatus(`Copied ${label}`);
    } catch {
      setStatus("Copy failed");
    }
  }
  const productionPromptBox = (label: string, value: string | undefined, empty: string) => {
    const prompt = value?.trim() ?? "";
    return (
      <div className="production-prompt-box">
        <div className="production-prompt-header">
          <strong>{label}</strong>
          <button className="button production-copy-button" type="button" disabled={!prompt} onClick={() => copyProductionPrompt(label, prompt)}>
            Copy
          </button>
        </div>
        <div>{prompt || empty}</div>
      </div>
    );
  };
  const productionMediaCard = (input: { label: string; url?: string | null; urls?: Array<string | null | undefined>; title: string; kind?: "image" | "video" }) => {
    const candidateUrls = (input.urls ?? [input.url])
      .map((candidate) => candidate?.trim() ?? "")
      .filter(Boolean)
      .filter((candidate, index, list) => list.indexOf(candidate) === index);
    const rawUrl = candidateUrls.find((candidate) => {
      const resolved = resolveServerUrl(serverBaseUrl, candidate);
      return productionMediaFiles[resolved]?.status !== "failed";
    }) ?? candidateUrls[0] ?? "";
    if (!rawUrl) {
      return (
        <div className="production-media-card empty">
          <div className="production-media-empty">{input.kind === "video" ? "No video yet" : "No image yet"}</div>
          <span>{input.label}</span>
        </div>
      );
    }
    const url = resolveServerUrl(serverBaseUrl, rawUrl);
    const kind = input.kind ?? "image";
    const fileEntry = productionMediaFiles[url];
    const displayUrl = fileEntry?.objectUrl || url;
    return (
      <div
        role="button"
        tabIndex={0}
        className={`production-media-card${fileEntry?.status === "loading" ? " loading" : ""}${fileEntry?.status === "failed" ? " failed" : ""}`}
        draggable={Boolean(fileEntry?.file)}
        onPointerDown={() => void prepareProductionMediaFile(rawUrl, input.title || input.label, kind)}
        onMouseEnter={() => {
          for (const candidate of candidateUrls) {
            void prepareProductionMediaFile(candidate, input.title || input.label, kind);
          }
        }}
        onDragStart={(event) => startProductionMediaDrag(event, { url, title: input.title || input.label, kind, file: fileEntry?.file, dragId: fileEntry?.dragId })}
        onDragEnd={() => endProductionMediaDrag({ dragId: fileEntry?.dragId })}
        onDoubleClick={() => chrome.tabs.create({ url })}
        onKeyDown={(event) => {
          if (event.key === "Enter") chrome.tabs.create({ url });
        }}
        title={fileEntry?.file ? "Drag this image as a file into an upload drop zone. Double-click to open." : "Preparing file drag. Wait for file ready, or double-click to open."}
      >
        {kind === "video" ? (
          <div className="production-video-thumb">▶</div>
        ) : (
          <img src={displayUrl} alt={input.title || input.label} draggable={false} />
        )}
        <span>{input.label}{fileEntry?.status === "loading" ? " · preparing" : fileEntry?.status === "ready" ? " · file ready" : ""}</span>
      </div>
    );
  };
  const draggableProductImage = (input: { url: string; className: string; alt: string; title: string; loading?: "eager" | "lazy" }) => {
    const url = resolveServerUrl(serverBaseUrl, input.url);
    const fileEntry = productionMediaFiles[url];
    const displayUrl = fileEntry?.objectUrl || url;
    return (
      <img
        className={input.className}
        src={displayUrl}
        alt={input.alt}
        loading={input.loading ?? "lazy"}
        decoding="async"
        draggable={Boolean(fileEntry?.file)}
        onPointerDown={() => void prepareProductionMediaFile(input.url, input.title, "image")}
        onMouseEnter={() => void prepareProductionMediaFile(input.url, input.title, "image")}
        onDragStart={(event) => startProductionMediaDrag(event, {
          url,
          title: input.title,
          kind: "image",
          file: fileEntry?.file,
          dragId: fileEntry?.dragId,
        })}
        onDragEnd={() => endProductionMediaDrag({ dragId: fileEntry?.dragId })}
        title={fileEntry?.file ? "Drag this image as a file into an upload drop zone." : "Preparing file drag. Hover or press once, then drag after file ready."}
      />
    );
  };
  const productionShotFrameUrls = (shot: ProductionDirectorShot, slot: "reference" | "start" | "stop") => {
    const referenceUrls = shot.referenceImages.map((image) => image.url);
    const gridUrls = (shot.storyboardGridFrames ?? []).map((frame) => frame.url);
    if (slot === "reference") return [shot.referenceImageUrl, ...referenceUrls, gridUrls[0]];
    if (slot === "start") return [shot.startFrameUrl, gridUrls[0], ...referenceUrls];
    return [shot.stopFrameUrl, gridUrls.at(-1), ...referenceUrls];
  };
  const storyboardClipFrameUrls = (clip: StoryboardReviewClip, slot: "reference" | "start" | "stop") => {
    const referenceUrls = clip.referenceImages.map((image) => image.url);
    if (slot === "reference") return [clip.referenceImageUrl, ...referenceUrls, clip.startFrameUrl, clip.stopFrameUrl];
    if (slot === "start") return [clip.startFrameUrl, clip.referenceImageUrl, ...referenceUrls];
    return [clip.stopFrameUrl, referenceUrls[1], clip.referenceImageUrl, ...referenceUrls];
  };

  return (
    <div className="app">
      <div className="row">
        <div>
          <strong>SmartAIHub Capture</strong>
          <div className="muted" aria-live="polite" role="status">{status}</div>
          <div className="muted">Extension v{EXTENSION_VERSION} | build {EXTENSION_BUILD_LABEL}</div>
        </div>
        <button className="button" onClick={() => run(detect)}>Detect</button>
      </div>

      <div className="tab-list" role="tablist" aria-label="SmartAIHub panel sections">
        <button
          className={tabButtonClass("capture")}
          role="tab"
          aria-selected={activeTab === "capture"}
          onClick={() => setActiveTab("capture")}
        >
          Capture Review
        </button>
        <button
          className={tabButtonClass("products")}
          role="tab"
          aria-selected={activeTab === "products"}
          onClick={() => run(openProductListTab)}
        >
          Product List
        </button>
        <button
          className={tabButtonClass("localAI")}
          role="tab"
          aria-selected={activeTab === "localAI"}
          onClick={() => setActiveTab("localAI")}
        >
          AI Insights
        </button>
        <button
          className={tabButtonClass("production")}
          role="tab"
          aria-selected={activeTab === "production"}
          onClick={() => setActiveTab("production")}
        >
          Production
        </button>
        <button
          className={tabButtonClass("storyboard")}
          role="tab"
          aria-selected={activeTab === "storyboard"}
          onClick={() => setActiveTab("storyboard")}
        >
          Storyboard
        </button>
        <button
          className={tabButtonClass("ask")}
          role="tab"
          aria-selected={activeTab === "ask"}
          onClick={() => setActiveTab("ask")}
        >
          Ask
        </button>
        <button
          className={tabButtonClass("config")}
          role="tab"
          aria-selected={activeTab === "config"}
          onClick={() => setActiveTab("config")}
        >
          Config
        </button>
      </div>

      {error ? <div className="section error">{error}</div> : null}

      {activeTab === "config" ? (
      <div className="tab-panel" role="tabpanel" aria-label="Config">
        <div className="section">
          <strong>Local AI Config</strong>
          <div className="muted">Choose the local model you want to use instead of Chrome Gemini Nano. Reviewed product text and selected images are sent only to the endpoint or host configured here.</div>
          <div className="warning" style={{ marginTop: 8 }}>
            Security: the background service worker accepts requests only from this extension page. Endpoints must be localhost/127.0.0.1, POST only, and one of the allowed paths. Content scripts cannot provide arbitrary URLs.
          </div>
          <div className="section">
            <div className="row">
              <div>
                <strong>Diagnostics</strong>
                <div className="muted">Local logs for Shopee Affiliate scanning, affiliate-link clicks, and Magnific drag/drop delivery.</div>
              </div>
              <div className="row" style={{ justifyContent: "flex-start" }}>
                <button className="button" type="button" onClick={() => run(loadDiagnosticLogs)}>Load logs</button>
                <button className="button" type="button" onClick={() => run(clearDiagnosticLogs)}>Clear</button>
              </div>
            </div>
            {diagnosticLogs.length > 0 ? (
              <div className="diagnostic-log-list">
                {diagnosticLogs.map((entry, index) => (
                  <pre className="diagnostic-log-entry" key={`${entry.at}-${entry.event}-${index}`}>
                    {JSON.stringify(entry, null, 2)}
                  </pre>
                ))}
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 8 }}>No logs loaded. Click Load logs after reproducing a scan, link click, or Magnific drop.</div>
            )}
          </div>
          <div className="grid" style={{ marginTop: 10 }}>
            <label>
              <div className="muted">Provider</div>
              <select className="input" value={localAISettings.localProviderMode} onChange={(e) => updateLocalProviderMode(e.target.value as LocalAISettings["localProviderMode"])}>
                <option value="auto">Auto: infer endpoint → Chrome Local AI → Server fallback</option>
                <option value="chrome_prompt_api">Chrome Gemini Nano only</option>
                <option value="ollama">Ollama /api/chat</option>
                <option value="lm_studio">LM Studio OpenAI-compatible</option>
                <option value="localai">LocalAI OpenAI-compatible</option>
                <option value="llama_cpp">llama.cpp server OpenAI-compatible</option>
                <option value="custom_http">Custom localhost HTTP</option>
                <option value="native_messaging">Native Messaging host</option>
              </select>
            </label>
            {localAISettings.localProviderMode !== "native_messaging" ? (
              <label>
                <div className="muted">Local endpoint URL</div>
                <input
                  className="input"
                  value={localAISettings.localEndpointUrl}
                  placeholder="http://localhost:11434/api/chat"
                  onChange={(e) => updateLocalAISetting("localEndpointUrl", e.target.value)}
                />
                <div className="field-evidence">
                  Allowed: Ollama `/api/chat`, OpenAI-compatible `/v1/chat/completions`, custom `/api/chat` or `/v1/chat/completions` on localhost only.
                  If Ollama returns 403, allow this extension origin and restart Ollama.
                </div>
              </label>
            ) : (
              <label>
                <div className="muted">Native host name</div>
                <input
                  className="input"
                  value={localAISettings.nativeHostName}
                  placeholder="com.smartaihub.local_ai"
                  onChange={(e) => updateLocalAISetting("nativeHostName", e.target.value)}
                />
                <div className="field-evidence">A native messaging host must be installed on this computer before the extension can call it.</div>
              </label>
            )}
            <label>
              <div className="muted">Model</div>
              <input
                className="input"
                list="local-ai-model-presets"
                value={localAISettings.localModel}
                placeholder="Type a model name or choose a preset"
                onChange={(e) => updateLocalAISetting("localModel", e.target.value)}
              />
              <datalist id="local-ai-model-presets">
                {localModelPresets.map((model) => <option value={model.name} key={model.name} />)}
              </datalist>
              <div className="model-chip-row">
                {localModelPresets.map((model) => (
                  <button className={localAISettings.localModel === model.name ? "model-chip selected" : "model-chip"} type="button" key={model.name} onClick={() => updateLocalAISetting("localModel", model.name)}>
                    <span>{model.name}</span>
                    {model.vision ? <span className="model-badge vision">Vision</span> : null}
                    {model.cloud ? <span className="model-badge cloud">Cloud</span> : null}
                  </button>
                ))}
              </div>
              <div className="field-evidence">Choose a preset or type the exact model name installed in Ollama, LM Studio, LocalAI, llama.cpp, or your custom server. Vision-capable Ollama models are marked, and cloud-capable families include a :cloud preset.</div>
            </label>
            <label className="muted">
              <input type="checkbox" checked={localAISettings.preferLocalAI} onChange={(e) => updateLocalAISetting("preferLocalAI", e.target.checked)} /> Use configured/local AI before server fallback
            </label>
            <label className="muted">
              <input type="checkbox" checked={localAISettings.enableServerFallback} onChange={(e) => updateLocalAISetting("enableServerFallback", e.target.checked)} /> Use SmartSpecPro server fallback if local provider fails
            </label>
            <label className="muted">
              <input
                type="checkbox"
                checked={localAISettings.localVisionEnabled}
                disabled={!effectiveLocalProvider}
                onChange={(e) => updateLocalAISetting("localVisionEnabled", e.target.checked)}
              /> Enable LLM vision for configured local provider
            </label>
            <label>
              <div className="muted">Vision image limit</div>
              <input
                className="input"
                type="number"
                min={1}
                max={5}
                disabled={!localAISettings.localVisionEnabled}
                value={localAISettings.localVisionImageLimit}
                onChange={(e) => updateLocalAISetting("localVisionImageLimit", Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
              />
              <div className="field-evidence">Send 1-5 images. Only user-selected product images are eligible.</div>
            </label>
            <label>
              <div className="muted">Vision image transport</div>
              <select
                className="input"
                disabled={!localAISettings.localVisionEnabled}
                value={localAISettings.localVisionImageTransport}
                onChange={(e) => updateLocalAISetting("localVisionImageTransport", e.target.value === "url" ? "url" : "base64")}
              >
                <option value="base64">Base64 via extension (recommended)</option>
                <option value="url">Direct image URL</option>
              </select>
              <div className="field-evidence">{localAISettings.localVisionImageTransport === "url" ? "Send direct image URLs after HTTPS and marketplace CDN allowlist validation. Use this only when your provider can fetch image URLs itself." : "The background service worker fetches each image, checks content type and size, then sends base64. Recommended for most Ollama/OpenAI-compatible local setups."}</div>
            </label>
          </div>
          <div className="section">
            <strong>Test & Troubleshooting</strong>
            <div className="muted">Run a text-only test first. Enable vision only after text generation works.</div>
            <div className="config-code-grid">
              <div>
                <div className="muted">Extension ID</div>
                <code className="inline-code">{extensionId}</code>
              </div>
              <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(extensionId).then(() => setStatus("Extension ID copied")).catch(() => setStatus("Could not copy extension ID"))}>Copy ID</button>
              <div>
                <div className="muted">Extension origin for Ollama</div>
                <code className="inline-code">{extensionOrigin}</code>
              </div>
              <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(extensionOrigin).then(() => setStatus("Extension origin copied")).catch(() => setStatus("Could not copy extension origin"))}>Copy origin</button>
              <div>
                <div className="muted">Ollama launch command</div>
                <code className="inline-code">{ollamaOriginsCommand}</code>
              </div>
              <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(ollamaOriginsCommand).then(() => setStatus("Ollama command copied")).catch(() => setStatus("Could not copy Ollama command"))}>Copy command</button>
              <div>
                <div className="muted">Wildcard origin for trusted local networks</div>
                <code className="inline-code">{wildcardExtensionOrigin}</code>
              </div>
              <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(wildcardExtensionOrigin).then(() => setStatus("Wildcard origin copied")).catch(() => setStatus("Could not copy wildcard origin"))}>Copy wildcard</button>
              <div>
                <div className="muted">Wildcard Ollama launch command</div>
                <code className="inline-code">{ollamaWildcardOriginsCommand}</code>
              </div>
              <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(ollamaWildcardOriginsCommand).then(() => setStatus("Wildcard Ollama command copied")).catch(() => setStatus("Could not copy command"))}>Copy command</button>
            </div>
            <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", marginTop: 8 }}>
              <button className="button primary" disabled={!localProviderEndpointAllowed(localAISettings)} onClick={() => run(testConfiguredLocalAI)}>Test config</button>
            </div>
            <div className="config-guide">
              <strong>Ollama origin setup guide</strong>
              <div className="muted">
                Use this when Ollama returns HTTP 403 or rejects the Chrome extension origin. The commands below already include this extension ID.
              </div>
              <div className="warning" style={{ marginTop: 8 }}>
                Optional trusted-network shortcut: use <code className="inline-code">{wildcardExtensionOrigin}</code> when this machine runs inside a trusted local network and you do not want to bind Ollama to one extension ID. The specific extension origin is safer and remains recommended for shared or untrusted machines.
              </div>
              <div className="guide-grid">
                <div className="guide-card">
                  <strong>Windows PowerShell</strong>
                  <ol className="guide-steps">
                    <li>
                      <div>Set OLLAMA_ORIGINS permanently for future PowerShell/Ollama launches.</div>
                      <div className="command-row">
                        <code className="inline-code">{windowsOllamaSetxCommand}</code>
                        <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(windowsOllamaSetxCommand).then(() => setStatus("Windows setx command copied")).catch(() => setStatus("Could not copy command"))}>Copy</button>
                      </div>
                      <div className="muted">Trusted local-network alternative</div>
                      <div className="command-row">
                        <code className="inline-code">{windowsOllamaWildcardSetxCommand}</code>
                        <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(windowsOllamaWildcardSetxCommand).then(() => setStatus("Windows wildcard setx command copied")).catch(() => setStatus("Could not copy command"))}>Copy</button>
                      </div>
                    </li>
                    <li>
                      <div>If you need it in the current PowerShell window immediately, set the current session too.</div>
                      <div className="command-row">
                        <code className="inline-code">{windowsOllamaSessionCommand}</code>
                        <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(windowsOllamaSessionCommand).then(() => setStatus("Windows session command copied")).catch(() => setStatus("Could not copy command"))}>Copy</button>
                      </div>
                      <div className="muted">Trusted local-network alternative</div>
                      <div className="command-row">
                        <code className="inline-code">{windowsOllamaWildcardSessionCommand}</code>
                        <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(windowsOllamaWildcardSessionCommand).then(() => setStatus("Windows wildcard session command copied")).catch(() => setStatus("Could not copy command"))}>Copy</button>
                      </div>
                    </li>
                    <li>
                      <div>Check the value in PowerShell. A new PowerShell window is recommended after using setx.</div>
                      <div className="command-row">
                        <code className="inline-code">{windowsOllamaCheckCommand}</code>
                        <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(windowsOllamaCheckCommand).then(() => setStatus("Windows check command copied")).catch(() => setStatus("Could not copy command"))}>Copy</button>
                      </div>
                      <div className="expected-block">
                        <div className="muted">Expected output</div>
                        <code className="inline-code">{extensionOrigin}</code>
                        <div className="muted">or, if you used the trusted-network shortcut</div>
                        <code className="inline-code">{wildcardExtensionOrigin}</code>
                      </div>
                    </li>
                    <li>
                      <div>Restart Ollama. If you use the normal Ollama app, quit it and open it again from the Start Menu. If you run it manually, start it from PowerShell.</div>
                      <div className="command-row">
                        <code className="inline-code">ollama serve</code>
                        <button className="button" type="button" onClick={() => navigator.clipboard?.writeText("ollama serve").then(() => setStatus("Ollama serve command copied")).catch(() => setStatus("Could not copy command"))}>Copy</button>
                      </div>
                    </li>
                  </ol>
                </div>
                <div className="guide-card">
                  <strong>macOS Terminal</strong>
                  <ol className="guide-steps">
                    <li>
                      <div>Set OLLAMA_ORIGINS for apps launched by macOS Launch Services, including the Ollama app.</div>
                      <div className="command-row">
                        <code className="inline-code">{macOllamaLaunchctlCommand}</code>
                        <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(macOllamaLaunchctlCommand).then(() => setStatus("macOS launchctl command copied")).catch(() => setStatus("Could not copy command"))}>Copy</button>
                      </div>
                      <div className="muted">Trusted local-network alternative</div>
                      <div className="command-row">
                        <code className="inline-code">{macOllamaWildcardLaunchctlCommand}</code>
                        <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(macOllamaWildcardLaunchctlCommand).then(() => setStatus("macOS wildcard launchctl command copied")).catch(() => setStatus("Could not copy command"))}>Copy</button>
                      </div>
                    </li>
                    <li>
                      <div>Check the value that macOS will pass to newly launched apps.</div>
                      <div className="command-row">
                        <code className="inline-code">{macOllamaCheckCommand}</code>
                        <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(macOllamaCheckCommand).then(() => setStatus("macOS check command copied")).catch(() => setStatus("Could not copy command"))}>Copy</button>
                      </div>
                      <div className="expected-block">
                        <div className="muted">Expected output</div>
                        <code className="inline-code">{extensionOrigin}</code>
                        <div className="muted">or, if you used the trusted-network shortcut</div>
                        <code className="inline-code">{wildcardExtensionOrigin}</code>
                      </div>
                    </li>
                    <li>
                      <div>Restart Ollama. Quit the Ollama app from the menu bar, then open it again. If you run Ollama manually from Terminal, use this command instead.</div>
                      <div className="command-row">
                        <code className="inline-code">{macOllamaServeCommand}</code>
                        <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(macOllamaServeCommand).then(() => setStatus("macOS serve command copied")).catch(() => setStatus("Could not copy command"))}>Copy</button>
                      </div>
                      <div className="muted">Trusted local-network alternative</div>
                      <div className="command-row">
                        <code className="inline-code">{macOllamaWildcardServeCommand}</code>
                        <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(macOllamaWildcardServeCommand).then(() => setStatus("macOS wildcard serve command copied")).catch(() => setStatus("Could not copy command"))}>Copy</button>
                      </div>
                    </li>
                  </ol>
                </div>
              </div>
            </div>
            <div className={configTestResult.status === "failed" ? "section error" : configTestResult.status === "success" ? "section success-panel" : "section muted"}>
              <strong>Test result</strong>
              <div>{configTestResult.message}</div>
              {configTestResult.checkedAt ? <div className="muted">Checked at {configTestResult.checkedAt}</div> : null}
              {configTestResult.error ? <div>{configTestResult.error}</div> : null}
            </div>
            <div className="claim-list">
              <strong>Suggested fixes</strong>
              {localAIConfigTroubleshooting(configTestResult.error || "", localAISettings.localProviderMode, extensionOrigin).map((item) => (
                <div className="muted" key={item}>- {item}</div>
              ))}
            </div>
          </div>
          <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", marginTop: 8 }}>
            <button className="button" onClick={() => setActiveTab("localAI")}>Back to AI Insights</button>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            Active mode: {configuredProviderLabel(localAISettings.localProviderMode)}
            {effectiveLocalProvider && localAISettings.localProviderMode === "auto" ? ` | Effective provider: ${configuredProviderLabel(effectiveLocalProvider)}` : ""}
            {" | "}Model: {localAISettings.localModel || "-"}
          </div>
        </div>
      </div>
      ) : null}

      {activeTab === "ask" ? (
      <div className="tab-panel" role="tabpanel" aria-label="Ask">
        <div className="section insight-panel">
          <strong>Ask AI</strong>
          <div className="muted">ถามเพื่อทำความเข้าใจสินค้า กลุ่มเป้าหมาย หรือ keyword สำหรับค้นต่อเท่านั้น คำตอบในแท็บนี้จะไม่ถูกบันทึกลงสินค้าและไม่ sync backend</div>
          <textarea
            className="textarea"
            placeholder="เช่น มีทิชชู่อันไหนเหมาะกับใช้ในห้องน้ำบ้าง / กางเกงรุ่นนี้ผู้สูงอายุใส่ได้ไหม / เหมาะกับเป็นของฝากไหม / ช่วยแก้ท้องอืดในเด็กได้ไหม"
            value={askQuestion}
            onChange={(event) => setAskQuestion(event.target.value)}
          />
          <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", marginTop: 8 }}>
            <button className="button primary" disabled={!askQuestion.trim() || askBusy} onClick={() => run(askAboutProduct)}>{askBusy ? "Thinking..." : "Ask"}</button>
            <button className="button" disabled={askBusy || (!askQuestion.trim() && !askResult)} onClick={() => { setAskQuestion(""); setAskResult(null); }}>Clear</button>
            <button className="button" disabled={!product} onClick={() => setActiveTab("capture")}>Review product</button>
          </div>
          <div className="muted">
            Source: {localAISettings.preferLocalAI && effectiveLocalProvider ? `${configuredProviderLabel(effectiveLocalProvider)} configured` : localAISettings.preferLocalAI && localAICapability.availability === "available" ? "Local AI available" : "Rule-based helper / search guidance"}
          </div>
        </div>
        {askResult ? (
          <div className="section">
            <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong>Answer</strong>
              <span className={askResult.source === "local_ai" ? "status-pill active" : "status-pill"}>{askResult.source === "local_ai" ? "Local AI" : "Helper"}</span>
            </div>
            <div className="insight-summary">{askResult.answer}</div>
            {askResult.cautions.length > 0 ? (
              <div className="warning">
                {askResult.cautions.map((item) => <div key={item}>! {item}</div>)}
              </div>
            ) : null}
            {askResult.shopeeKeywords.length > 0 ? (
              <div className="claim-list">
                <strong>Shopee search keywords</strong>
                {askResult.shopeeKeywords.map((keyword) => (
                  <div className="claim-item" key={`shopee-${keyword}`}>
                    <div>{keyword}</div>
                    <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", marginTop: 6 }}>
                      <button className="button" onClick={() => chrome.tabs.update({ url: buildSearchUrl("shopee", keyword) })}>Open Shopee</button>
                      <button className="button" onClick={() => chrome.tabs.create({ url: buildSearchUrl("shopee", keyword) })}>New tab</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {askResult.googleKeywords.length > 0 ? (
              <div className="claim-list">
                <strong>Google search keywords</strong>
                {askResult.googleKeywords.map((keyword) => (
                  <div className="claim-item" key={`google-${keyword}`}>
                    <div>{keyword}</div>
                    <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", marginTop: 6 }}>
                      <button className="button" onClick={() => chrome.tabs.create({ url: buildSearchUrl("google", keyword) })}>Open Google</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="section muted">ถามอะไรก็ได้เกี่ยวกับสินค้านี้ ความเหมาะสมกับกลุ่มเป้าหมาย หรือ keyword ที่ควรค้นต่อ คำตอบจะอยู่เฉพาะในหน้านี้</div>
        )}
      </div>
      ) : null}

      {activeTab === "products" ? (
      <div className="tab-panel" role="tabpanel" aria-label="Product List">
        <div className="section">
          <div className="row">
            <div>
              <strong>Product List</strong>
              <div className="muted">Filtered {filteredCandidates.length} / {candidates.length} products | Queue {queue.length}</div>
              {candidateListSourceUrlRef.current ? (
                <div className="muted">List source: {candidateListSourceUrlRef.current}</div>
              ) : null}
            </div>
            <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button className="button primary" onClick={() => run(scanCategory)}>Scan visible products</button>
              <button className="button" onClick={() => run(scrollScanCategory)}>Scroll & scan more</button>
              <button className="button" onClick={() => run(captureAffiliateDiagnostics)}>Capture diagnostics</button>
              <button className="button" disabled={filteredCandidates.length === 0} onClick={() => run(sendCandidatesToSmartSpec)}>Send candidates</button>
            </div>
          </div>
        </div>

        {candidates.length > 0 ? (
          <div className="section">
            <strong>Filters</strong>
            <div className="grid">
              <input className="input" placeholder="Keyword include" value={filters.keyword} onChange={(e) => updateFilter("keyword", e.target.value)} />
              <input className="input" placeholder="Min score" value={filters.minScore} onChange={(e) => updateFilter("minScore", e.target.value)} />
              <input className="input" placeholder="Min rating" value={filters.minRating} onChange={(e) => updateFilter("minRating", e.target.value)} />
              <input className="input" placeholder="Max price" value={filters.priceMax} onChange={(e) => updateFilter("priceMax", e.target.value)} />
              <input className="input" placeholder="Min discount %" value={filters.discountMin} onChange={(e) => updateFilter("discountMin", e.target.value)} />
              <label className="muted"><input type="checkbox" checked={filters.mallOnly} onChange={(e) => updateFilter("mallOnly", e.target.checked)} /> Mall / official</label>
              <label className="muted"><input type="checkbox" checked={filters.freeShippingOnly} onChange={(e) => updateFilter("freeShippingOnly", e.target.checked)} /> Free shipping</label>
              <label className="muted"><input type="checkbox" checked={filters.excludeSponsored} onChange={(e) => updateFilter("excludeSponsored", e.target.checked)} /> Exclude sponsored</label>
            </div>
          </div>
        ) : null}

        {filteredCandidates.length > 0 ? (
          <div className="section">
            {filteredCandidates.slice(0, 30).map((candidate) => (
              <div className="candidate" key={candidateIdentity(candidate)}>
                <div className="row">
                  {candidate.imageUrl ? draggableProductImage({
                    url: candidate.imageUrl,
                    className: "thumb",
                    alt: candidate.title || "Product image",
                    title: candidate.title || "product-image",
                    loading: "eager",
                  }) : <div className="thumb" />}
                  <div style={{ flex: 1 }}>
                    <div>{candidate.title}</div>
                    <div className="muted">
                      {candidate.priceText ?? "-"} | {candidate.commissionRateText ? `${candidate.commissionRateText} | ` : ""}{candidate.ratingText ? `rating ${candidate.ratingText} | ` : ""}{appendNormalizedCount(candidate.soldCountText) || "-"} | score {candidate.score}
                    </div>
                  </div>
                </div>
                <div className="muted">{candidate.scoreReasons.join(", ")}</div>
                {candidate.affiliateUrl ? (() => {
                  const affiliateUrl = candidate.affiliateUrl ?? "";
                  return (
                    <a
                      className="candidate-url"
                      href={affiliateUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => {
                        event.preventDefault();
                        chrome.tabs.create({ url: affiliateUrl });
                      }}
                    >
                      {affiliateUrl}
                    </a>
                  );
                })() : null}
                <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
                  <button className="button" onClick={() => chrome.tabs.update({ url: candidate.url })}>Open</button>
                  <button className="button" onClick={() => chrome.tabs.create({ url: candidate.url })}>New tab</button>
                  {candidate.affiliateLinkAvailable && !candidate.affiliateUrl ? (
                    <button className="button" disabled={affiliateLinkBusy[candidateIdentity(candidate)]} onClick={() => run(() => requestShopeeAffiliateLink(candidate))}>
                      {affiliateLinkBusy[candidateIdentity(candidate)] ? "Getting link..." : "เอา ลิงก์"}
                    </button>
                  ) : null}
                  {candidate.affiliateUrl ? (
                    <button className="button" onClick={() => navigator.clipboard?.writeText(candidate.affiliateUrl || "").then(() => setStatus("Affiliate link copied")).catch(() => setStatus("Could not copy affiliate link"))}>
                      Copy link
                    </button>
                  ) : null}
                  <button className="button" onClick={() => addQueue(candidate)}>Queue</button>
                  <button className="button" onClick={() => setIgnoredUrls(new Set([...ignoredUrls, candidateStableKey(candidate)]))}>Ignore</button>
                </div>
              </div>
            ))}
          </div>
        ) : candidates.length > 0 ? (
          <div className="section muted">No products match the current filters.</div>
        ) : (
          <div className="section muted">Scan a category, search, or shop page to collect product recommendations.</div>
        )}

        {queue.length > 0 ? (
          <div className="section">
            <strong>Queue ({queue.length})</strong>
            {queue.map((item) => (
              <div className="row candidate" key={candidateStableKey(item)}>
                <span className="muted" style={{ flex: 1 }}>{item.title}</span>
                <button className="button" onClick={() => chrome.tabs.create({ url: item.url })}>Open</button>
                <button className="button" onClick={() => removeQueue(candidateStableKey(item))}>Remove</button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      ) : null}

      {activeTab === "production" ? (
      <div className="tab-panel" role="tabpanel" aria-label="Production Director">
        <div className="section">
          <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <strong>Production Director Projects</strong>
              <div className="muted">Recent projects from SmartAIHub, newest first. Select a project to inspect storyboard prompts and reference images.</div>
            </div>
            <button className="button" disabled={productionProjectsBusy || !settings.token} onClick={() => run(() => loadProductionDirectorProjects())}>
              {productionProjectsBusy ? "Loading..." : "Refresh"}
            </button>
          </div>
          {!settings.token ? (
            <div className="warning" style={{ marginTop: 8 }}>Connect SmartAIHub first, then this tab can read your Production Director projects.</div>
          ) : null}
          <div className="production-search-row">
            <input
              className="input"
              placeholder="Search project name"
              value={productionProjectSearch}
              onChange={(event) => setProductionProjectSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") run(() => loadProductionDirectorProjects());
              }}
            />
            <button className="button primary" disabled={productionProjectsBusy || !settings.token} onClick={() => run(() => loadProductionDirectorProjects())}>Search</button>
          </div>
        </div>

        <div className="production-layout">
          <div className="section production-project-list">
            <div className="compact-summary">
              <strong>Projects ({productionProjects.length})</strong>
              <span className="muted">max 30</span>
            </div>
            {productionProjects.length > 0 ? productionProjects.map((project) => (
              <button
                type="button"
                className={selectedProductionProjectId === project.productionRunId ? "production-project-card selected" : "production-project-card"}
                key={project.productionRunId}
                onClick={() => run(() => loadProductionDirectorProject(project.productionRunId))}
              >
                {project.thumbnailUrl ? <img className="production-project-thumb" src={resolveServerUrl(serverBaseUrl, project.thumbnailUrl)} alt="" /> : <div className="production-project-thumb empty" />}
                <span className="production-project-body">
                  <span className="production-project-title">{project.title || project.productionRunId}</span>
                  <span className="muted">{project.status} | {project.shotCount} shots | {formatDateTime(project.updatedAt)}</span>
                  {project.summary ? <span className="production-project-summary">{project.summary}</span> : null}
                </span>
              </button>
            )) : (
              <div className="muted">{productionProjectsBusy ? "Loading projects..." : "No Production Director projects found."}</div>
            )}
          </div>

          <div className="section production-storyboard-panel">
            {productionProjectBusy ? (
              <div className="muted">Loading selected project...</div>
            ) : selectedProductionProject ? (
              <>
                <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <strong>{selectedProductionProject.title || selectedProductionProject.productionRunId}</strong>
                    <div className="muted">
                      {selectedProductionProject.status} | v{selectedProductionProject.version} | {selectedProductionProject.shots.length} shots | {formatDateTime(selectedProductionProject.updatedAt)}
                    </div>
                    {selectedProductionProject.summary ? <div className="production-project-summary">{selectedProductionProject.summary}</div> : null}
                  </div>
                </div>

                {selectedProductionProject.referenceImages.length > 0 ? (
                  <div className="production-reference-strip">
                    {selectedProductionProject.referenceImages.slice(0, 30).map((image) => {
                      const imageUrl = resolveServerUrl(serverBaseUrl, image.url);
                      const fileEntry = productionMediaFiles[imageUrl];
                      return (
                        <div
                          role="button"
                          tabIndex={0}
                          className="production-reference-image"
                          draggable={Boolean(fileEntry?.file)}
                          onPointerDown={() => void prepareProductionMediaFile(image.url, image.title || image.role || image.kind)}
                          onMouseEnter={() => void prepareProductionMediaFile(image.url, image.title || image.role || image.kind)}
                          onDragStart={(event) => startProductionMediaDrag(event, {
                            url: imageUrl,
                            title: image.title || image.role || image.kind,
                            kind: "image",
                            file: fileEntry?.file,
                            dragId: fileEntry?.dragId,
                          })}
                          onDragEnd={() => endProductionMediaDrag({ dragId: fileEntry?.dragId })}
                          onDoubleClick={() => chrome.tabs.create({ url: imageUrl })}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") chrome.tabs.create({ url: imageUrl });
                          }}
                          key={`${image.id}-${image.url}`}
                        >
                          <img src={resolveServerUrl(serverBaseUrl, image.thumbnailUrl || image.url)} alt={image.title || image.kind} draggable={false} />
                          <span>{image.role || image.kind}{fileEntry?.status === "ready" ? " · file" : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <div className="production-shot-list">
                  {selectedProductionProject.shots.length > 0 ? selectedProductionProject.shots.map((shot) => (
                    <div className="production-shot-card" key={shot.id}>
                      <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                        <div>
                          <strong>Shot {shot.order}: {shot.title}</strong>
                          <div className="muted">
                            {shot.shotType || "shot"} | {shot.durationSeconds ?? "-"}s | {shot.status}
                            {shot.customerJourneyStage ? ` | ${shot.customerJourneyStage}` : ""}
                          </div>
                        </div>
                      </div>
                      {shot.storyBeat ? <div className="muted">Story beat: {shot.storyBeat}</div> : null}
                      <div className="production-shot-assets">
                        {productionMediaCard({ label: "Reference image", urls: productionShotFrameUrls(shot, "reference"), title: `Shot ${shot.order} reference image` })}
                        {productionMediaCard({ label: "Start frame", urls: productionShotFrameUrls(shot, "start"), title: `Shot ${shot.order} start frame` })}
                        {productionMediaCard({ label: "Stop frame", urls: productionShotFrameUrls(shot, "stop"), title: `Shot ${shot.order} stop frame` })}
                      </div>
                      {productionPromptBox("3x3 storyboard image prompt", shot.storyboardGridPrompt || shot.storyboardPrompt || shot.visualIntent, "No 3x3 image prompt saved for this shot yet.")}
                      {productionPromptBox("Video prompt", shot.videoPrompt || shot.storyboardPrompt || shot.visualIntent, "No video prompt saved for this shot yet.")}
                      {shot.script ? (
                        <details className="story-option-video">
                          <summary>Script / voiceover</summary>
                          <div className="muted">{shot.script}</div>
                        </details>
                      ) : null}
                      {shot.referenceImages.length > 0 ? (
                        <div className="production-reference-strip shot">
                          {shot.referenceImages.map((image) => {
                            const imageUrl = resolveServerUrl(serverBaseUrl, image.url);
                            const fileEntry = productionMediaFiles[imageUrl];
                            return (
                              <div
                                role="button"
                                tabIndex={0}
                                className="production-reference-image"
                                draggable={Boolean(fileEntry?.file)}
                                onPointerDown={() => void prepareProductionMediaFile(image.url, image.title || image.role || image.kind)}
                                onMouseEnter={() => void prepareProductionMediaFile(image.url, image.title || image.role || image.kind)}
                                onDragStart={(event) => startProductionMediaDrag(event, {
                                  url: imageUrl,
                                  title: image.title || image.role || image.kind,
                                  kind: "image",
                                  file: fileEntry?.file,
                                  dragId: fileEntry?.dragId,
                                })}
                                onDragEnd={() => endProductionMediaDrag({ dragId: fileEntry?.dragId })}
                                onDoubleClick={() => chrome.tabs.create({ url: imageUrl })}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") chrome.tabs.create({ url: imageUrl });
                                }}
                                key={`${shot.id}-${image.id}-${image.url}`}
                              >
                                <img src={resolveServerUrl(serverBaseUrl, image.thumbnailUrl || image.url)} alt={image.title || image.kind} draggable={false} />
                                <span>{image.role || image.kind}{fileEntry?.status === "ready" ? " · file" : ""}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="muted">No reference images attached to this shot.</div>
                      )}
                    </div>
                  )) : (
                    <div className="muted">This project has no storyboard shots yet.</div>
                  )}
                </div>
              </>
            ) : (
              <div className="muted">Select a Production Director project to view its storyboard prompts.</div>
            )}
          </div>
        </div>
      </div>
      ) : null}

      {activeTab === "storyboard" ? (
      <div className="tab-panel" role="tabpanel" aria-label="Storyboard Review">
        <div className="section">
          <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <strong>Storyboard Review Projects</strong>
              <div className="muted">Recent Storyboard Review projects from SmartAIHub, newest first. Select a project to inspect clip frames and video prompts.</div>
            </div>
            <button className="button" disabled={storyboardProjectsBusy || !settings.token} onClick={() => run(() => loadStoryboardReviewProjects())}>
              {storyboardProjectsBusy ? "Loading..." : "Refresh"}
            </button>
          </div>
          {!settings.token ? (
            <div className="warning" style={{ marginTop: 8 }}>Connect SmartAIHub first, then this tab can read your Storyboard Review projects.</div>
          ) : null}
          <div className="production-search-row">
            <input
              className="input"
              placeholder="Search project name"
              value={storyboardProjectSearch}
              onChange={(event) => setStoryboardProjectSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") run(() => loadStoryboardReviewProjects());
              }}
            />
            <button className="button primary" disabled={storyboardProjectsBusy || !settings.token} onClick={() => run(() => loadStoryboardReviewProjects())}>Search</button>
          </div>
        </div>

        <div className="production-layout">
          <div className="section production-project-list">
            <div className="compact-summary">
              <strong>Projects ({storyboardProjects.length})</strong>
              <span className="muted">max 30</span>
            </div>
            {storyboardProjects.length > 0 ? storyboardProjects.map((project) => (
              <button
                type="button"
                className={selectedStoryboardProjectId === project.id ? "production-project-card selected" : "production-project-card"}
                key={project.id}
                onClick={() => run(() => loadStoryboardReviewProject(project.id))}
              >
                {project.thumbnailUrl ? <img className="production-project-thumb" src={resolveServerUrl(serverBaseUrl, project.thumbnailUrl)} alt="" /> : <div className="production-project-thumb empty" />}
                <span className="production-project-body">
                  <span className="production-project-title">{project.title || `Review ${project.id}`}</span>
                  <span className="muted">{project.status} | {project.completedClipCount}/{project.clipCount} clips | {formatDateTime(project.updatedAt)}</span>
                </span>
              </button>
            )) : (
              <div className="muted">{storyboardProjectsBusy ? "Loading projects..." : "No Storyboard Review projects found."}</div>
            )}
          </div>

          <div className="section production-storyboard-panel">
            {storyboardProjectBusy ? (
              <div className="muted">Loading selected project...</div>
            ) : selectedStoryboardProject ? (
              <>
                <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <strong>{selectedStoryboardProject.title || `Review ${selectedStoryboardProject.id}`}</strong>
                    <div className="muted">
                      {selectedStoryboardProject.status} | {selectedStoryboardProject.completedClipCount}/{selectedStoryboardProject.clipCount} clips | {formatDateTime(selectedStoryboardProject.updatedAt)}
                    </div>
                  </div>
                </div>
                {selectedStoryboardProject.conceptDetails ? (
                  <details className="story-option-video" style={{ marginTop: 8 }}>
                    <summary>Concept details</summary>
                    <div className="muted">{selectedStoryboardProject.conceptDetails}</div>
                  </details>
                ) : null}

                <div className="production-shot-list">
                  {selectedStoryboardProject.clips.length > 0 ? selectedStoryboardProject.clips.map((clip) => (
                    <div className="production-shot-card" key={clip.id}>
                      <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                        <div>
                          <strong>Clip {clip.order}</strong>
                          <div className="muted">
                            {clip.durationSeconds ?? "-"}s | {clip.status}
                            {clip.model ? ` | ${clip.model}` : ""}
                          </div>
                        </div>
                      </div>
                      {clip.statusDetail ? <div className="muted">{clip.statusDetail}</div> : null}
                      <div className="production-shot-assets">
                        {productionMediaCard({ label: "Reference image", urls: storyboardClipFrameUrls(clip, "reference"), title: `Clip ${clip.order} reference image` })}
                        {productionMediaCard({ label: "Start frame", urls: storyboardClipFrameUrls(clip, "start"), title: `Clip ${clip.order} start frame` })}
                        {productionMediaCard({ label: "Stop frame", urls: storyboardClipFrameUrls(clip, "stop"), title: `Clip ${clip.order} stop frame` })}
                      </div>
                      {productionPromptBox("Video prompt", clip.videoPrompt, "No video prompt saved for this clip yet.")}
                    </div>
                  )) : (
                    <div className="muted">This project has no storyboard review clips yet.</div>
                  )}
                </div>
              </>
            ) : (
              <div className="muted">Select a Storyboard Review project to view clips.</div>
            )}
          </div>
        </div>
      </div>
      ) : null}

      {activeTab === "localAI" ? (
      <div className="tab-panel" role="tabpanel" aria-label="AI Insights">
      <div className="section">
        <strong>AI Insights</strong>
        <div className={`local-ai-card ${localAIStatusView.tone}`}>
          <div className="local-ai-card-top">
            <span className="local-ai-badge">{localAIStatusView.label}</span>
            <span className="local-ai-provider">
              {localAIProvider === "chrome_prompt_api" ? "Gemini Nano in Chrome" : localAIProvider === "server_ai" ? "SmartSpecPro AI" : "Capture only"}
            </span>
          </div>
          <div className="local-ai-title">{localAIStatusView.headline}</div>
          <div className="local-ai-copy">{localAIStatusView.description}</div>
          <div className="local-ai-next">{localAIStatusView.nextAction}</div>
          {localAIProgress != null ? (
            <div className="local-ai-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(localAIProgress * 100)} aria-label={`Local AI model download ${Math.round(localAIProgress * 100)} percent`}>
              <div className="local-ai-progress-bar" style={{ width: `${Math.max(0, Math.min(100, Math.round(localAIProgress * 100)))}%` }} />
              <span>{Math.round(localAIProgress * 100)}%</span>
            </div>
          ) : null}
          <details className="local-ai-debug">
            <summary>Technical details</summary>
            <div>Provider: {localAIProvider}</div>
            <div>Workflow state: {localAIState}</div>
            <div>Prompt API: {localAICapability.availability}</div>
            {localAICapability.reason ? <div>{localAICapability.reason}</div> : null}
          </details>
        </div>
        <div className="grid">
          <label className="muted">
            <input
              type="checkbox"
              checked={localAISettings.autoGenerateInsights}
              onChange={(e) => updateLocalAISetting("autoGenerateInsights", e.target.checked)}
            /> Auto generate & sync
          </label>
          <label className="muted">
            <input
              type="checkbox"
              checked={localAISettings.preferLocalAI}
              onChange={(e) => updateLocalAISetting("preferLocalAI", e.target.checked)}
            /> Prefer local AI
          </label>
          <label className="muted">
            <input
              type="checkbox"
              checked={localAISettings.sendStructuredInsightsOnly}
              onChange={(e) => updateLocalAISetting("sendStructuredInsightsOnly", e.target.checked)}
            /> Send structured insights only
          </label>
          <label className="muted">
            <input
              type="checkbox"
              checked={localAISettings.enableServerFallback}
              onChange={(e) => updateLocalAISetting("enableServerFallback", e.target.checked)}
            /> Server fallback
          </label>
          <div className="muted">Raw capture sync: off</div>
        </div>
        <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", marginTop: 8 }}>
          <button className="button" onClick={() => run(refreshLocalAICapability)}>Check Local AI</button>
          <button className="button" onClick={() => setActiveTab("config")}>Config Local AI</button>
          {canDownloadLocalAIModel ? (
            <button className="button primary" disabled={localAIBusy} onClick={() => run(downloadLocalAIModel)}>Download Gemini Nano</button>
          ) : null}
          <button className="button primary" disabled={!product || localAIBusy} onClick={() => run(() => createLocalProductBrief({ autoSync: true }))}>Generate AI Insight</button>
          <button className="button" disabled={!productBrief || localAIBusy} onClick={() => run(syncStructuredInsight)}>Sync to backend</button>
          {["downloading", "analyzing_local"].includes(localAIState) ? <button className="button" onClick={cancelLocalAI}>Cancel</button> : null}
        </div>
        {!product ? (
          <div className="section muted">Scan & Review a product first. AI Insights will turn the reviewed capture into selling points, hooks, objections, a 30s video brief, and downstream handoff data, then sync structured data to SmartSpecPro.</div>
        ) : !productBrief && !localAIBusy ? (
          <div className="section muted">
            Ready to analyze: {editable.productName || product.productName || "current product"}.
            {localAISettings.autoGenerateInsights ? " Auto insight will run when AI is available." : " Click Generate AI Insight to create and sync downstream content ideas."}
          </div>
        ) : null}
        {storytellingHandoff ? (
          <div className="section insight-panel">
            <strong>User-added product knowledge</strong>
            <div className="muted">เพิ่มข้อมูลที่ user รู้จริงเกี่ยวกับสินค้า ระบบจะช่วยสรุปให้กระชับ แยกหมวด และให้ confirm ก่อนเก็บเข้า story option</div>
            <textarea
              className="textarea"
              placeholder="เช่น เหมาะกับคนที่อยู่คอนโด พื้นที่น้อย / ลูกค้ากังวลว่าติดตั้งยาก / hook ควรเปิดด้วยปัญหาห้องรก"
              value={userInsightText}
              onChange={(event) => {
                setUserInsightText(event.target.value);
                setUserInsightDraft(null);
              }}
            />
            <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", marginTop: 8 }}>
              <button className="button" disabled={!userInsightText.trim()} onClick={() => run(async () => analyzeUserAddedInsight())}>Analyze user input</button>
              {userInsightDraft ? <button className="button primary" onClick={confirmUserAddedInsight}>Confirm & store in insight</button> : null}
              {userInsightDraft ? <button className="button" onClick={() => setUserInsightDraft(null)}>Cancel draft</button> : null}
            </div>
            {userInsightDraft ? (
              <div className="claim-list">
                <div className="claim-item">
                  <strong>จะเก็บเข้า option: {userInsightDraft.targetOptionTitle}</strong>
                  <div className="muted">Summary: {userInsightDraft.summary}</div>
                  <div className="muted">Confidence {Math.round(userInsightDraft.confidence * 100)}% | รอ user confirm ก่อนบันทึก</div>
                </div>
                {userInsightDraft.additions.map((addition) => (
                  <div className="claim-item" key={addition.category}>
                    <strong>{addition.label}</strong>
                    {addition.values.map((value) => <div className="muted" key={value}>• {value}</div>)}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {productBrief ? (
          <div className="section insight-panel">
            <div className="row">
              <div>
                <strong>{productBrief.productName}</strong>
                <div className="muted">
                  {localAIProvider === "chrome_prompt_api" ? "Generated on-device" : localAIProvider === "server_ai" ? "Generated by server AI fallback" : "Generated from deterministic capture rules"}
                  {" | "}Confidence {Math.round(productBrief.confidence * 100)}%
                  {" | "}Evidence {productBrief.evidenceIds.length}
                </div>
              </div>
              <button className="button" disabled={!productBrief || localAIBusy} onClick={() => run(syncStructuredInsight)}>Sync</button>
            </div>
            <div className="insight-summary">{productBrief.shortSummary}</div>
            <div className="insight-grid">
              <div className="insight-card">
                <strong>Selling points</strong>
                {productBrief.keySellingPoints.length > 0 ? productBrief.keySellingPoints.slice(0, 5).map((item) => <div className="muted" key={item}>• {item}</div>) : <div className="muted">ต้องเพิ่มข้อมูลราคา/รีวิว/รายละเอียดเพื่อสรุปจุดขาย</div>}
              </div>
              <div className="insight-card">
                <strong>Hooks</strong>
                {productBrief.suggestedHooks.length > 0 ? productBrief.suggestedHooks.slice(0, 5).map((item) => <div className="muted" key={item}>• {item}</div>) : <div className="muted">ยังไม่มี hook ที่พร้อมใช้</div>}
              </div>
              <div className="insight-card">
                <strong>Audience / pain</strong>
                {[...productBrief.targetAudiences.slice(0, 2), ...productBrief.buyerPainPoints.slice(0, 2)].map((item) => <div className="muted" key={item}>• {item}</div>)}
              </div>
              <div className="insight-card">
                <strong>Objections / trust</strong>
                {[...productBrief.buyerObjections.slice(0, 2), ...productBrief.trustSignals.slice(0, 2)].map((item) => <div className="muted" key={item}>• {item}</div>)}
              </div>
            </div>
          </div>
        ) : null}
        {storytellingHandoff ? (
          <div className="section">
            <strong>Downstream insight readiness: {storytellingReadinessLabel(storytellingHandoff.readiness)}</strong>
            <div className="muted">ขั้นตอนนี้ยังไม่เปิด Media Studio เพราะข้อมูลสินค้ายังไม่ได้ Upload/Confirm เป็น product จริง สิ่งที่ทำได้ตอนนี้คือ sync เพื่อแนบเป็น AI Insight กับ capture นี้ก่อน</div>
            <div className="muted">หลัง Upload selected และ Confirm product แล้ว หน้า Product Detail / Media Studio จะอ่าน insight นี้ไปใช้ต่อเป็น brief, scene, claim, journey และรูปที่ควรใช้</div>
            <div className="muted">Journey: {storytellingHandoff.customerJourneyStages.join(" → ")}</div>
            {storytellingHandoff.blockers.length > 0 ? (
              <div className="warning">
                ควรแก้ก่อน sync/ใช้ต่อ:
                <ul>
                  {storytellingHandoff.blockers.map((blocker) => <li key={blocker}>{storytellingBlockerLabel(blocker)}</li>)}
                </ul>
              </div>
            ) : (
              <div className="connection-summary">
                <strong>Ready to attach as AI Insight</strong>
                <div className="muted">กด Sync to backend เพื่อบันทึก structured insight แล้วค่อย Upload/Confirm สินค้าตาม flow ปกติ</div>
              </div>
            )}
            {storytellingHandoff.blockers.length > 0 ? (
              <div className="local-ai-review-actions">
                <button className="button" onClick={() => setActiveTab("capture")}>กลับไปเพิ่ม evidence</button>
                <button className="button" onClick={() => run(mergeVisibleProductImages)}>ดึงรูปเพิ่ม</button>
              </div>
            ) : null}
            {storytellingHandoff.storyOptions.length > 0 ? (
              <div className="claim-list">
                <div className="muted">Story options ที่ AI วิเคราะห์ไว้ ระบบจะ sync เป็น structured insight เพื่อให้ Product Detail / Media Studio ใช้เลือกทำ storytelling หรือ storyboard ได้หลายแนวหลัง confirm สินค้า</div>
                {storytellingHandoff.storyOptions.slice(0, 5).map((option) => (
                  <div className="claim-item" key={option.id}>
                    <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <strong>{option.title}</strong>
                      <span className={option.autoSelected ? "status-pill active" : "status-pill"}>{option.autoSelected ? "Recommended" : `${Math.round(option.confidence * 100)}%`}</span>
                    </div>
                    <div className="muted">Audience: {option.audience}</div>
                    <div className="muted">Need: {option.customerNeed}</div>
                    <div className="muted">Problem/use case: {option.problemToSolve} / {option.useCase}</div>
                    <div className="muted">Hook: {option.hook}</div>
                    <div className="muted">Journey: {option.journeyStages.join(" → ")} | Evidence {option.evidenceIds.length}</div>
                    {option.videoBrief ? (
                      <details className="story-option-video">
                        <summary>Video storyboard: {option.videoBrief.structureLabel}</summary>
                        <div className="scene-list">
                          {option.videoBrief.shots.map((shot) => (
                            <div className="scene-item" key={`${option.id}-${shot.order}`}>
                              <strong>Shot {shot.order}: {shot.title} ({shot.startSec}-{shot.endSec}s)</strong>
                              <div className="muted">Video Prompt: {shot.videoPrompt}</div>
                              <ol className="muted">
                                {shot.subShots.map((subShot) => <li key={subShot}>{subShot}</li>)}
                              </ol>
                              <div className="muted">{shot.thaiVoiceover}</div>
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                    {option.decisionReason ? <div className="muted">{option.decisionReason}</div> : null}
                  </div>
                ))}
              </div>
            ) : null}
            {storytellingHandoff.claims.length > 0 ? (
              <div className="claim-list">
                <div className="muted">Claim สถานะ supported มาจากข้อมูล capture ที่มี evidence แล้ว ระบบจะ sync เป็น AI Insight ได้เลย ส่วน claim ที่ needs_review ต้องให้ user Confirm/Approve ก่อนใช้ต่อ ถ้า claim ไม่ถูกต้องให้ Edit หรือ Remove ก่อน sync</div>
                {storytellingHandoff.claims.slice(0, 6).map((claim) => (
                  <div className="claim-item" key={claim.id}>
                    <div>{claim.text}</div>
                    <div className="muted">Status: {claim.status} | Evidence {claim.evidenceIds.length} | Confidence {Math.round(claim.confidence * 100)}%</div>
                    <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", marginTop: 6 }}>
                      {claim.status === "supported" ? (
                        <span className="status-pill active">Auto-supported</span>
                      ) : (
                        <button className="button" disabled={claim.status === "user_approved"} onClick={() => updateStorytellingClaim(claim.id, "approve")}>{claim.status === "user_approved" ? "Approved" : "Approve"}</button>
                      )}
                      <button className="button" onClick={() => updateStorytellingClaim(claim.id, "edit")}>Edit</button>
                      <button className="button" onClick={() => updateStorytellingClaim(claim.id, "remove")}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      </div>
      ) : null}

      {activeTab === "capture" ? (
      <div className="tab-panel" role="tabpanel" aria-label="Capture Review">
      <div className="section">
        <label className="muted">Base URL</label>
        <input className="input" value={settings.baseUrl} onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })} />
        {settings.token && !tokenEditorOpen ? (
          <div className="connection-summary">
            <strong>Extension connected</strong>
            <div className="muted">หมดอายุ: {formatDateTime(tokenExpiresAt)}</div>
            <div className={tokenStatus.warning ? "warning" : "muted"}>{tokenStatus.label}</div>
          </div>
        ) : (
          <>
            <label className="muted">Extension token</label>
            <textarea
              className="textarea"
              placeholder="Paste extension token"
              value={tokenInput}
              onChange={(e) => {
                setTokenInput(e.target.value);
                if (decodeJwtExpiresAt(e.target.value.trim())) setConnectFlowStarted(true);
              }}
            />
            <div className={connectFlowStarted ? "muted" : "warning"}>
              {connectFlowStarted
                ? tokenInputExpiresAt
                  ? `Token นี้หมดอายุ: ${formatDateTime(tokenInputExpiresAt)}`
                  : "วาง token ที่สร้างจากหน้า Connect เพื่อเปิดปุ่ม Save"
                : "กด Connect SmartAIHub ก่อน แล้วค่อยวาง token ที่สร้างได้"}
            </div>
          </>
        )}
        <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
          <button className="button primary" onClick={() => run(openConnectPage)}>Connect SmartAIHub</button>
          <button className="button" disabled={!canSaveConnection} onClick={() => run(saveConnection)}>Save connection</button>
          {settings.token && !tokenEditorOpen ? (
            <button className="button" onClick={() => {
              setTokenInput("");
              setConnectFlowStarted(false);
              setTokenEditorOpen(true);
            }}>Replace token</button>
          ) : null}
          <button className="button" disabled={!settings.token} onClick={() => run(clearConnection)}>Clear token</button>
        </div>
        <div className="muted">Origin: chrome-extension://{chrome.runtime.id}</div>
      </div>

      <div className="section">
        <strong>Open marketplace</strong>
        <div className="muted">เริ่มจากหน้า marketplace ที่เหมาะกับการสแกน แล้วใช้ตัวกรองเลือกสินค้าที่ขายดี/rating สูง</div>
        <input className="input" placeholder="Keyword เช่น cleanser, ของใช้ในบ้าน" value={starterKeyword} onChange={(e) => setStarterKeyword(e.target.value)} />
        <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", marginTop: 8 }}>
          <button className="button" onClick={openShopeeSearch}>Shopee search</button>
          <button className="button" onClick={openShopeeAffiliateOffer}>Shopee Affiliate</button>
          <button className="button" onClick={openTikTokSearch}>TikTok Shop search</button>
          {SHOPEE_START_URLS.map((item) => <button className="button" key={item.url} onClick={() => openStarterUrl(item.url)}>{item.label}</button>)}
          {TIKTOK_START_URLS.map((item) => <button className="button" key={item.url} onClick={() => openStarterUrl(item.url)}>{item.label}</button>)}
        </div>
      </div>

      <div className="section">
        <div className="muted">Platform: {page?.platform ?? "unknown"} | Page: {page?.pageType ?? "unknown"}</div>
        <div className="section" style={{ marginTop: 8 }}>
          <label className="muted">
            <input
              type="checkbox"
              checked={autoDetectEnabled}
              onChange={(e) => setAutoDetectEnabled(e.target.checked)}
            /> Live detect while scrolling
          </label>
          <div className="muted">
            {lastObservedAt
              ? `Last update: ${new Date(lastObservedAt).toLocaleTimeString()} (${lastObserveReason})`
              : "Panel จะค่อย ๆ ตรวจสินค้าหรือรายละเอียดที่โหลดเพิ่มเมื่อ user scroll"}
          </div>
          <div className="muted">Live candidates: {candidates.length}</div>
          <button className="button" onClick={() => run(refreshLiveSnapshot)}>Refresh live snapshot</button>
          {page?.pageType === "product" ? (
            <button className="button" onClick={() => run(mergeVisibleProductImages)}>Merge visible images</button>
          ) : null}
        </div>
        {page?.pageType === "category" || page?.pageType === "shop" ? (
          <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
            <button className="button primary" onClick={() => run(scanCategory)}>Scan visible products</button>
            <button className="button" onClick={() => run(scrollScanCategory)}>Scroll & scan more</button>
            <button className="button" disabled={filteredCandidates.length === 0} onClick={() => run(sendCandidatesToSmartSpec)}>Send candidates</button>
          </div>
        ) : null}
        {page?.pageType === "product" ? (
          <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
            <button className="button primary" onClick={() => run(scanProduct)}>Scan & Review</button>
            {page.platform === "tiktok_shop" ? (
              <>
                <button className="button" onClick={() => run(scanCategory)}>Scan related products</button>
                <button className="button" onClick={() => run(scrollScanCategory)}>Scroll related & scan</button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {candidates.length > 0 || queue.length > 0 ? (
        <div className="section compact-summary">
          <div>
            <strong>Product List</strong>
            <div className="muted">Recommended {filteredCandidates.length} / {candidates.length} | Queue {queue.length}</div>
          </div>
          <button className="button" onClick={() => setActiveTab("products")}>Open list</button>
        </div>
      ) : null}

      {liveProduct && !product ? (
        <div className="section">
          <strong>Live product details</strong>
          <div className="muted">ระบบตรวจเจอข้อมูลล่าสุดจากหน้าที่ user กำลังดูอยู่ ยังไม่ upload หรือ save จนกว่าจะกดใช้งานและยืนยันเอง</div>
          <div>{liveProduct.productName || "Untitled product"}</div>
          <div className="muted">
            {liveProduct.priceCurrentText || "-"} | {liveProduct.ratingScoreText ? `rating ${liveProduct.ratingScoreText} | ` : ""}
            {appendNormalizedCount(liveProduct.soldCountText) || "-"}
          </div>
          <div className="muted">
            Images {liveProduct.imageCandidates.length}
            {" | "}Review images {liveProduct.imageCandidates.filter((img) => img.kind === "review").length}
            {" | "}Variants {liveProduct.variantsText ? "found" : "not found"}
          </div>
          <button className="button primary" onClick={useLiveProductForReview}>Use latest detected details</button>
        </div>
      ) : null}

      <div className="section">
        <strong>Capture Progress</strong>
        {progress.map((step) => (
          <div className={`progress ${step.status}`} key={step.label} aria-current={step.status === "active" ? "step" : undefined}>
            <span>{step.status === "done" ? "✓" : step.status === "active" ? "…" : step.status === "error" ? "!" : "○"}</span>
            <span>{step.label}</span>
          </div>
        ))}
      </div>

      {product ? (
        <div className="section">
          <strong>Review before sending</strong>
          {liveProduct && liveProduct !== product ? (
            <div className="section">
              <strong>New live details detected</strong>
              <div className="muted">
                เจอข้อมูล/รูป/รีวิวเพิ่มเติมหลังจาก scroll แล้ว ยังไม่ทับฟอร์มที่ user กำลังแก้ไขจนกว่าจะกดใช้ข้อมูลล่าสุด
              </div>
              <div className="muted">
                Images {liveProduct.imageCandidates.length}
                {" | "}Review images {liveProduct.imageCandidates.filter((img) => img.kind === "review").length}
                {" | "}Description {liveProduct.descriptionText?.length ?? 0} chars
              </div>
              <button className="button" onClick={useLiveProductForReview}>Replace review with latest detected</button>
              <button className="button" onClick={() => run(mergeVisibleProductImages)}>Merge images only</button>
            </div>
          ) : null}
          {queuedCurrentProduct ? <div className="section muted">Queued product matched: {queuedCurrentProduct.title}</div> : null}
          {reviewDraftStatus ? (
            <div className="draft-row">
              <span className="muted">{reviewDraftStatus}</span>
              <button className="button" onClick={() => {
                if (!product) return;
                clearReviewDraft(product.sourceUrl)
                  .then(() => setReviewDraftStatus("Local draft cleared"))
                  .catch(() => undefined);
              }}>Clear local draft</button>
            </div>
          ) : null}
          <label className="muted">Name</label>
          <input className="input" value={editable.productName} onChange={(e) => updateEditable("productName", e.target.value)} />
          <div className="field-evidence">{fieldEvidenceText(product, "productName")}</div>
          <label className="muted">Brand</label>
          <input className="input" value={editable.brand} onChange={(e) => updateEditable("brand", e.target.value)} />
          <div className="field-evidence">{fieldEvidenceText(product, "brand")}</div>
          <label className="muted">Shop</label>
          <input className="input" value={editable.shopName} onChange={(e) => updateEditable("shopName", e.target.value)} />
          <div className="field-evidence">{fieldEvidenceText(product, "shopName")}</div>
          <label className="muted">Price</label>
          <input className="input" value={editable.priceCurrentText} onChange={(e) => updateEditable("priceCurrentText", e.target.value)} />
          <div className="field-evidence">{fieldEvidenceText(product, "priceCurrentText")}</div>
          <label className="muted">Commission rate (%)</label>
          <input className="input" inputMode="decimal" placeholder="เช่น 8 หรือ 12.5" value={editable.commissionRateText} onChange={(e) => updateEditable("commissionRateText", e.target.value)} />
          <div className={commissionRateInvalid ? "warning" : "field-evidence"}>
            {commissionRateInvalid ? "Commission rate ต้องเป็นตัวเลข 0-100" : editable.commissionRateText ? "source: user_review | confidence 95%" : fieldEvidenceText(product, "commissionRate")}
          </div>
          <label className="muted">Affiliate link</label>
          <div className="row" style={{ alignItems: "center" }}>
            <input className="input" placeholder="https://s.shopee.co.th/..." value={editable.affiliateUrl} onChange={(e) => updateEditable("affiliateUrl", e.target.value)} />
            <button
              className="button"
              disabled={!editable.affiliateUrl.trim()}
              onClick={() => navigator.clipboard?.writeText(editable.affiliateUrl.trim()).then(() => setStatus("Affiliate link copied")).catch(() => setStatus("Could not copy affiliate link"))}
            >
              Copy
            </button>
          </div>
          <div className={affiliateUrlInvalid ? "warning" : "field-evidence"}>
            {affiliateUrlInvalid ? "Affiliate link ต้องเป็น URL แบบ http(s)" : editable.affiliateUrl ? "source: user_review | confidence 95%" : fieldEvidenceText(product, "affiliateUrl")}
          </div>
          <div className="business-preview">
            <strong>Business preview</strong>
            <div className="metric-grid">
              <div className="metric-box">
                <span>Price</span>
                <strong>{formatMoney(businessSummary.price)}</strong>
              </div>
              <div className="metric-box">
                <span>Commission</span>
                <strong>{businessSummary.commissionRate == null ? "-" : `${businessSummary.commissionRate}%`}</strong>
              </div>
              <div className="metric-box">
                <span>Commission amount</span>
                <strong>{formatMoney(businessSummary.commissionAmount)}</strong>
              </div>
            </div>
            <div className="muted">ยังไม่มี cost ต่อชิ้น จึงยังคำนวณ profit / margin / ROI ไม่ได้</div>
          </div>
          <label className="muted">Sold</label>
          <input className="input" value={editable.soldCountText} onChange={(e) => updateEditable("soldCountText", e.target.value)} />
          <div className="field-evidence">{fieldEvidenceText(product, "soldCountText")}</div>
          <label className="muted">Rating</label>
          <input className="input" value={editable.ratingScoreText} onChange={(e) => updateEditable("ratingScoreText", e.target.value)} />
          <div className="field-evidence">{fieldEvidenceText(product, "ratingScoreText")}</div>
          <label className="muted">Review count</label>
          <input className="input" value={editable.reviewCountText} onChange={(e) => updateEditable("reviewCountText", e.target.value)} />
          <div className="field-evidence">{fieldEvidenceText(product, "reviewCountText")}</div>
          <label className="muted">Category</label>
          <input className="input" value={editable.categoryText} onChange={(e) => updateEditable("categoryText", e.target.value)} />
          <div className="field-evidence">{fieldEvidenceText(product, "categoryText")}</div>
          <label className="muted">Stock</label>
          <input className="input" value={editable.stockText} onChange={(e) => updateEditable("stockText", e.target.value)} />
          <div className="field-evidence">{fieldEvidenceText(product, "stockText")}</div>
          <label className="muted">Seller location</label>
          <input className="input" value={editable.sellerLocationText} onChange={(e) => updateEditable("sellerLocationText", e.target.value)} />
          <div className="field-evidence">{fieldEvidenceText(product, "sellerLocationText")}</div>
          <label className="muted">Variants</label>
          <textarea className="textarea" value={editable.variantsText} onChange={(e) => updateEditable("variantsText", e.target.value)} />
          <div className="field-evidence">{fieldEvidenceText(product, "variantsText")}</div>
          <label className="muted">Description</label>
          <textarea className="textarea" value={editable.descriptionText} onChange={(e) => updateEditable("descriptionText", e.target.value)} />
          <div className="field-evidence">{fieldEvidenceText(product, "descriptionText")}</div>

          <strong>Evidence to send</strong>
          <label className="muted"><input type="checkbox" checked={evidence.domHeader} onChange={(e) => updateEvidence("domHeader", e.target.checked)} /> DOM product header</label>
          <label className="muted"><input type="checkbox" checked={evidence.domDescription} onChange={(e) => updateEvidence("domDescription", e.target.checked)} /> DOM description</label>
          <label className="muted"><input type="checkbox" checked={evidence.rawHtmlBlocks} onChange={(e) => updateEvidence("rawHtmlBlocks", e.target.checked)} /> Raw HTML blocks</label>
          <label className="muted"><input type="checkbox" checked={evidence.headerScreenshot} onChange={(e) => updateEvidence("headerScreenshot", e.target.checked)} /> Header screenshot</label>
          <label className="muted"><input type="checkbox" checked={evidence.descriptionScreenshot} onChange={(e) => updateEvidence("descriptionScreenshot", e.target.checked)} /> Description screenshot</label>

          <div className="section">
            <strong>Privacy summary</strong>
            <div className="muted">Source URL: {product.sourceUrl}</div>
            <div className="muted">DOM text: {evidence.domHeader || evidence.domDescription ? "selected" : "not selected"}</div>
            <div className="muted">Raw HTML blocks: {evidence.rawHtmlBlocks ? "selected" : "not selected"}</div>
            <div className="muted">Header screenshot: {evidence.headerScreenshot ? "selected" : "not selected"}</div>
            <div className="muted">Description screenshot: {evidence.descriptionScreenshot ? "selected" : "not selected"}</div>
            <div className="muted">Images: {selectedImageCount} selected</div>
            <div className="muted">Evidence groups: {selectedEvidenceCount}</div>
          </div>

          <div className={`section ${dataQualityWarnings.length ? "warning-panel" : "success-panel"}`}>
            <strong>Data quality checklist</strong>
            <div className="quality-groups">
              {qualityGroupSummary.map((group) => (
                <div className="quality-group" key={group.label}>
                  <strong>{group.label}</strong>
                  {group.items.map((item) => (
                    <span className={`quality-item ${item.ok ? "ok" : "missing"}`} key={`${group.label}:${item.label}`}>
                      {item.ok ? "OK" : "Need"} {item.label}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            {dataQualityWarnings.length > 0 ? (
              dataQualityWarnings.map((warning) => <div className="warning" key={warning}>! {warning}</div>)
            ) : (
              <div className="muted">พร้อมส่งต่อ: ข้อมูลหลัก รูป และ evidence ถูกเลือกแล้ว</div>
            )}
          </div>

          <div className="section">
            <strong>Capture diagnostics</strong>
            <div className="diagnostics-grid">
              <div className="muted">URL format: {product.sourceUrlFormat || "unknown"}</div>
              <div className="muted">External product: {product.externalProductId || "-"}</div>
              <div className="muted">External shop: {product.externalShopId || "-"}</div>
              <div className="muted">Field evidence: {fieldEvidenceCount}</div>
              <div className="muted">Warnings: {dataQualityWarnings.length}</div>
              <div className="muted">Description chars: {editable.descriptionText.length}</div>
              <div className="muted">Images main/review/desc: {imageKindCounts.main}/{imageKindCounts.review}/{imageKindCounts.description}</div>
              <div className="muted">Images related/unknown: {imageKindCounts.related}/{imageKindCounts.unknown}</div>
              <div className="muted">Low-res selected: {lowQualitySelectedImages.length}</div>
              <div className="muted">Variants: {editable.variantsText.trim() ? "found" : "missing"}</div>
              <div className="muted">HTML blocks: {product.htmlBlocks.length}</div>
              <div className="muted">Raw HTML: {evidence.rawHtmlBlocks ? "selected" : "stripped before upload"}</div>
            </div>
          </div>

          <div className={`section ${aiInsightReadyForUpload ? "success-panel" : "warning-panel"}`}>
            <strong>AI insight preview before upload</strong>
            {productBrief ? (
              <div className="insight-panel">
                <div className="insight-summary">{productBrief.shortSummary}</div>
                <div className="insight-grid">
                  <div className="insight-card">
                    <strong>Selling points</strong>
                    {productBrief.keySellingPoints.slice(0, 5).map((item) => <div className="muted" key={`pre-sell-${item}`}>• {item}</div>)}
                  </div>
                  <div className="insight-card">
                    <strong>Audience / Pain</strong>
                    {[...productBrief.targetAudiences.slice(0, 3), ...productBrief.buyerPainPoints.slice(0, 3)].map((item) => <div className="muted" key={`pre-aud-${item}`}>• {item}</div>)}
                  </div>
                  <div className="insight-card">
                    <strong>Hooks</strong>
                    {productBrief.suggestedHooks.slice(0, 5).map((item) => <div className="muted" key={`pre-hook-${item}`}>• {item}</div>)}
                  </div>
                </div>
                {preUploadStoryOptions.length ? (
                  <div className="insight-grid">
                    {preUploadStoryOptions.map((option) => (
                      <div className="insight-card" key={`pre-story-${option.id}`}>
                        <strong>{option.title}</strong>
                        <div className="muted">Audience: {option.audience}</div>
                        <div className="muted">Need: {option.customerNeed}</div>
                        <div className="muted">Hook: {option.hook}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="warning">ยังไม่มี story options ให้ตรวจสอบก่อน upload</div>
                )}
              </div>
            ) : (
              <div className="warning">ยังไม่มี AI Insight สำหรับสินค้านี้ ระบบจะไม่แนบ storyOptions ไปกับ capture จนกว่าจะกด Generate AI Insight หรือ auto-generate สำเร็จ</div>
            )}
            <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", marginTop: 8 }}>
              <button className="button primary" disabled={localAIBusy} onClick={() => run(() => createLocalProductBrief({ autoSync: Boolean(settings.token), openTab: false }))}>
                Generate AI Insight
              </button>
              <button className="button" onClick={() => setActiveTab("localAI")}>Open AI Insights</button>
            </div>
          </div>

          <div className="image-toolbar">
            <div className="muted">
              Selected images: {selectedImageCount} / {product.imageCandidates.length}
              {heroImageUrl ? " | Hero selected" : " | No hero"}
            </div>
            {localAISettings.localVisionEnabled && effectiveLocalProvider ? (
              <div className="vision-picker">
                <div>
                  <strong>Vision images for Local AI</strong>
                  <div className="muted">เลือก 1-{Math.min(5, Math.max(1, Number(localAISettings.localVisionImageLimit) || 1))} รูปจากรูปสินค้าที่เลือกไว้ เพื่อส่งแบบ {localAISettings.localVisionImageTransport === "url" ? "URL direct" : "base64"} ให้ local model วิเคราะห์ร่วมกับ text</div>
                </div>
                {visionEligibleImages.length === 0 ? (
                  <div className="warning">ยังไม่มีรูปสินค้าที่เหมาะกับ vision ให้เลือก main/detail image ก่อน และหลีกเลี่ยง related/low-res</div>
                ) : (
                  <div className="vision-image-row">
                    {visionEligibleImages.slice(0, 10).map((img) => (
                      <label className={`vision-image-option ${activeVisionImageUrls.includes(img.url) ? "selected" : ""}`} key={`vision-${img.url}`}>
                        <input
                          type="checkbox"
                          checked={activeVisionImageUrls.includes(img.url)}
                          disabled={!activeVisionImageUrls.includes(img.url) && activeVisionImageUrls.length >= Math.min(5, Math.max(1, Number(localAISettings.localVisionImageLimit) || 1))}
                          onChange={(e) => updateVisionImageSelection(img.url, e.target.checked)}
                        />
                        <img src={img.url} alt="Vision product evidence" loading="lazy" />
                        <span>{img.url === heroImageUrl ? "Hero" : img.kind}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
              {(["all", "main", "description", "review", "related", "unknown"] as ImageFilter[]).map((filter) => (
                <button className={imageFilter === filter ? "button primary" : "button"} key={filter} onClick={() => setImageFilter(filter)}>
                  {filter}
                </button>
              ))}
              <button className="button" onClick={() => run(mergeVisibleProductImages)}>Merge visible images</button>
            </div>
            <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
              <button className="button" onClick={() => setSelectedImages(Object.fromEntries(product.imageCandidates.map((img) => [img.url, img.kind === "main" && canAutoSelectImage(img)])))}>Select main</button>
              <button className="button" onClick={() => setSelectedImages(Object.fromEntries(product.imageCandidates.map((img) => [img.url, img.kind === "review" && canAutoSelectImage(img)])))}>Select review</button>
              <button className="button" onClick={() => setSelectedImages(Object.fromEntries(visibleProductImages.map((img) => [img.url, canAutoSelectImage(img)])))}>Select visible filter</button>
            </div>
          </div>
          {visibleProductImages.length > displayedProductImages.length ? (
            <div className="warning">แสดง {displayedProductImages.length} จาก {visibleProductImages.length} รูปใน filter นี้ เพื่อลดการหน่วงของ panel</div>
          ) : null}
          <div className="image-picker-grid">
            {displayedProductImages.map((img) => (
              <label className={`image-option ${selectedImages[img.url] ? "selected" : ""}`} key={img.url}>
                <input className="image-checkbox" type="checkbox" aria-label={`Select ${img.kind} image ${img.position ?? ""}`} checked={Boolean(selectedImages[img.url])} onChange={(e) => setSelectedImages((current) => ({ ...current, [img.url]: e.target.checked }))} />
                {draggableProductImage({
                  url: img.url,
                  className: "image-thumb",
                  alt: `${img.kind} product evidence`,
                  title: `${img.kind}-${img.position ?? "image"}`,
                  loading: "eager",
                })}
                <span className="image-kind">{img.kind} | {imageQualityLabel(img)}</span>
                <span className="image-badges">
                  {imageBadges(img, heroImageUrl).map((badge) => <span className="image-badge" key={badge}>{badge}</span>)}
                </span>
                <span className="image-reason">{imageSelectionReason(img, heroImageUrl)}</span>
                <button className="image-hero-button" type="button" onClick={(event) => {
                  event.preventDefault();
                  setHeroImageUrl(img.url);
                  setSelectedImages((current) => ({ ...current, [img.url]: true }));
                }}>{heroImageUrl === img.url ? "Hero" : "Set hero"}</button>
                {isLowQualityImage(img) ? <span className="image-warning">Low resolution</span> : null}
              </label>
            ))}
          </div>
          <div className="row" style={{ justifyContent: "flex-start" }}>
            <button className="button" onClick={() => {
              setSelectedImages({});
              setHeroImageUrl("");
            }}>Select none</button>
            <button className="button primary" disabled={!editable.productName || commissionRateInvalid || affiliateUrlInvalid} onClick={() => run(uploadAndAnalyze)}>
              Upload selected
            </button>
          </div>
        </div>
      ) : null}
      </div>
      ) : null}
    </div>
  );
}
