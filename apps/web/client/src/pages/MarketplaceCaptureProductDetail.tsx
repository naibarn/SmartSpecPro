import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type SyntheticEvent,
} from "react";
import { Link, useLocation } from "wouter";
import { LocaleToggle } from "@/components/LocaleToggle";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import {
  resolveMarketplaceAutoReviewLaunchMode,
  shouldShowStandardOrderControls,
  shouldShowAutoStoryboardReviewSurface,
} from "@/lib/marketplaceHyperframesUiState";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Film,
  History,
  ImageIcon,
  Library,
  Loader2,
  Maximize2,
  PackagePlus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { useTenantFeatureFlags } from "@/hooks/useTenantFeatureFlag";
import { MarketplaceInsightsSection } from "@/components/marketplace/MarketplaceInsightsSection";
import { MarketplaceAutoReviewLaunchModeSwitch } from "@/components/marketplaceCapture/MarketplaceAutoReviewLaunchModeSwitch";
import { AutoStoryboardReviewPlanSummary } from "@/components/marketplaceCapture/AutoStoryboardReviewPlanSummary";
import { AutoStoryboardAdvancedOverrides } from "@/components/marketplaceCapture/AutoStoryboardAdvancedOverrides";
import { McpConnectionPicker } from "@/components/media/McpConnectionPicker";
import { getMarketplaceHyperframesUiCopy } from "@/components/marketplaceCapture/hyperframesUiCopy";
import type {
  HyperframesAutoPlanOverrideInput,
  HyperframesAutoStoryboardReviewPlan,
} from "@shared/hyperframes/autoPlan";
import { HyperframesAutoPlanOverrideInputSchema } from "@shared/hyperframes/autoPlan";
import { type MarketplaceAutoReviewLaunchMode } from "@shared/hyperframes/contracts";
import {
  AUTO_REVIEW_CREATIVE_PRESETS,
  autoReviewCreativePresetRequestedAudioStrategy,
  type AutoReviewCreativePresetFamily,
  type AutoReviewCreativePresetSelection,
} from "@shared/hyperframes/autoReviewCreativePresets";
import type { ProductReferenceCategory } from "@shared/marketplaceCapture";
import { resolveMediaModelTransportConfig } from "@shared/mediaModelTransport";

type ProductMediaTab = "image" | "video" | "audio";
type ProductPanelTab = "history" | "library" | "product";
const AUTO_STORYBOARD_OVERRIDES_STORAGE_KEY =
  "smartSpecPro.marketplaceCapture.autoStoryboardOverrides.v1";
const MARKETPLACE_INTELLIGENCE_FEATURE_FLAGS = [
  "marketplaceConnectorLabEnabled",
  "marketplaceIntelligenceImportsEnabled",
  "marketplaceKeywordDiscoveryEnabled",
  "marketplaceIntelligenceReportsEnabled",
  "marketplaceReportImageSkillsEnabled",
  "marketplaceIntelligenceShareableImageEnabled",
  "marketplaceIntelligenceWatchlistsEnabled",
  "marketplaceIntelligenceMcpWritesEnabled",
] as const;

function loadStoredAutoStoryboardOverrides(): HyperframesAutoPlanOverrideInput {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(
      AUTO_STORYBOARD_OVERRIDES_STORAGE_KEY
    );
    if (!raw) return {};
    const parsed = HyperframesAutoPlanOverrideInputSchema.safeParse(
      JSON.parse(raw)
    );
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function persistStoredAutoStoryboardOverrides(
  overrides: HyperframesAutoPlanOverrideInput
) {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(overrides).length === 0) {
      window.localStorage.removeItem(AUTO_STORYBOARD_OVERRIDES_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      AUTO_STORYBOARD_OVERRIDES_STORAGE_KEY,
      JSON.stringify(overrides)
    );
  } catch {
    // Ignore storage failures so Auto Review controls remain usable.
  }
}

type ProductEditForm = {
  productName: string;
  descriptionText: string;
  priceCurrent: string;
  commissionRatePercent: string;
  productPageUrl: string;
  soldCountText: string;
  capturedCategoryText: string;
  shopName: string;
  productCategory: ProductReferenceCategory;
  ratingScore: string;
  reviewCountText: string;
};
type ProductMediaAsset = {
  url: string;
  title: string;
  mediaType: ProductMediaTab;
  source: string;
  createdAt?: string | Date | null;
  metadata?: Record<string, unknown>;
};
type AutoReviewOutputMode = "storyboard_images" | "full_video";
type AutoReviewFrameStrategy = "storyboard_3x3_split" | "video_shot_start_stop";
type AutoReviewAudioStrategy =
  | "auto"
  | "native_video_audio"
  | "separate_tts_voiceover"
  | "silent";
type AutoReviewShotCount = 7 | 8 | 9;
type AutoReviewOverlayTextMode = "no_text" | "allow_text";
type AutoReviewImageModel = string;
type AutoReviewStartAction = "storyboard" | "video" | "auto_review_video";
type AutoReviewCharacterMode =
  | "product_only"
  | "hands_only"
  | "described_character"
  | "uploaded_reference";
type AutoReviewReviewTone =
  | ""
  | "warm_honest"
  | "funny_light"
  | "irritated_problem"
  | "energetic_excited"
  | "empathetic_soft"
  | "expert_confident"
  | "straight_serious";
type AutoReviewStorytellingStructure =
  | ""
  | "hook_problem_emotion_insight_solution_result_cta"
  | "hook_problem_insight_proof_cta"
  | "product_review_situation_problem_try_result_fit"
  | "before_after_bridge"
  | "pas"
  | "aida"
  | "relatable_story"
  | "problem_struggle_solution_transformation";
type AutoReviewCharacterChoice = {
  id: string;
  label: string;
  description?: string;
};
type AutoReviewCreativePresetChoice = AutoReviewCharacterChoice & {
  id: string;
  family: AutoReviewCreativePresetFamily;
};
type UploadedReferenceAnchor = {
  url: string;
  uploadKey?: string | null;
  hash?: string | null;
  source: string;
  fileName?: string | null;
  fileType?: string | null;
  fileSizeBytes?: number | null;
};
type AutoReviewAnchorDropRole = "product" | "character" | "environment";
type ImageDimensions = { width: number; height: number };

const PRODUCT_MEDIA_DRAG_MIME = "application/x-smartspec-product-media";
const PRODUCT_IMAGE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const PRODUCT_IMAGE_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);
const MEDIA_PANEL_LIBRARY_PAGE_SIZE = 30;
const AUTO_REVIEW_TERMINAL_STATUSES = new Set([
  "completed",
  "completed_with_warnings",
  "failed",
  "cancelled",
  "skipped",
]);
const AUTO_REVIEW_RUN_ACTIVE_POLL_MS = 5_000;
const AUTO_REVIEW_RUN_START_WAIT_POLL_MS = 3_000;
const AUTO_REVIEW_RUN_STALE_MS = 5_000;
const AUTO_REVIEW_PLANNED_STAGES = [
  "product_preflight",
  "production_project",
  "concept_story",
  "prompt_plan",
  "image_generation",
  "storyboard_review",
  "video_generation",
  "audio_generation",
  "video_edit",
  "render",
  "library_finalize",
];
const AUTO_REVIEW_BLOCKER_STATE_MATCHES = [
  "evidence",
  "product_reference",
  "character_identity",
  "environment",
  "completion_evidence",
  "capability_manifest",
  "creative_brief",
  "blocked_needs_user",
  "provider_event_blocked",
  "payload_over_budget",
  "storage_quota_blocked",
  "dlq_recovery_required",
];
const AUTO_REVIEW_POLICY_STATE_MATCHES = [
  "policy",
  "warning",
  "synthetic_disclosure",
  "cta_landing",
  "privacy",
  "audio_rights",
  "distribution",
  "brand_policy",
  "human_review",
  "reuse_recheck",
  "duplicate_variation",
  "spend_anomaly",
  "campaign_batch",
  "media_quarantined",
];
const AUTO_REVIEW_OUTPUT_STAGES = new Set([
  "storyboard_review",
  "video_edit",
  "render",
  "library_finalize",
]);
const AUTO_REVIEW_CHARACTER_MODES: Array<
  AutoReviewCharacterChoice & { id: AutoReviewCharacterMode }
> = [
  {
    id: "hands_only",
    label: "Hands-only",
    description: "เห็นมือ/ลำตัวบางส่วน ไม่สร้างหน้าคน",
  },
  {
    id: "described_character",
    label: "เลือกตัวละคร",
    description: "เลือกเพศ วัย ลุค และบทบาทจากช้อย",
  },
  {
    id: "uploaded_reference",
    label: "อัปโหลด reference",
    description: "ล็อกหน้าหรือตัวแบบจากภาพ/character sheet",
  },
  {
    id: "product_only",
    label: "Product-only",
    description: "ไม่ใช้คน เน้นสินค้าอย่างเดียว",
  },
];
const AUTO_REVIEW_CHARACTER_GENDERS: AutoReviewCharacterChoice[] = [
  { id: "female", label: "ผู้หญิง" },
  { id: "male", label: "ผู้ชาย" },
  { id: "gender_neutral", label: "ไม่ระบุเพศ" },
  { id: "auto", label: "ให้ระบบเลือก" },
];
const AUTO_REVIEW_CHARACTER_AGES: AutoReviewCharacterChoice[] = [
  { id: "young_adult_20_29", label: "20-29" },
  { id: "adult_30_39", label: "30-39" },
  { id: "middle_age_40_59", label: "40-59" },
  { id: "teen_16_19", label: "วัยรุ่น" },
  { id: "auto", label: "Auto" },
];
const AUTO_REVIEW_CHARACTER_APPEARANCES: AutoReviewCharacterChoice[] = [
  { id: "thai", label: "คนไทย" },
  { id: "southeast_asian", label: "เอเชียตะวันออกเฉียงใต้" },
  { id: "east_asian", label: "เอเชียตะวันออก" },
  { id: "international", label: "International" },
  { id: "auto", label: "Auto" },
];
const AUTO_REVIEW_CHARACTER_ROLES: AutoReviewCharacterChoice[] = [
  { id: "reviewer", label: "Reviewer" },
  { id: "buyer", label: "ผู้ซื้อจริง" },
  { id: "mom_parent", label: "แม่/ผู้ปกครอง" },
  { id: "office_worker", label: "คนทำงาน" },
  { id: "technician", label: "ผู้เชี่ยวชาญ" },
  { id: "creator_host", label: "Creator" },
];
const AUTO_REVIEW_CHARACTER_STYLES: AutoReviewCharacterChoice[] = [
  { id: "casual_home", label: "Casual home" },
  { id: "clean_ugc", label: "UGC สะอาด" },
  { id: "premium_neat", label: "Premium neat" },
  { id: "friendly_everyday", label: "เป็นกันเอง" },
  { id: "expert_practical", label: "ผู้เชี่ยวชาญ" },
];
const AUTO_REVIEW_REVIEW_TONES: Array<
  AutoReviewCharacterChoice & { id: AutoReviewReviewTone }
> = [
  { id: "", label: "Auto" },
  { id: "warm_honest", label: "จริงใจเป็นกันเอง" },
  { id: "funny_light", label: "ตลกขำเบา ๆ" },
  { id: "irritated_problem", label: "หงุดหงิดกับปัญหา" },
  { id: "energetic_excited", label: "ตื่นเต้นพลังสูง" },
  { id: "empathetic_soft", label: "อบอุ่นเห็นใจ" },
  { id: "expert_confident", label: "ผู้เชี่ยวชาญมั่นใจ" },
  { id: "straight_serious", label: "ตรงไปตรงมา จริงจัง" },
];
const AUTO_REVIEW_STORYTELLING_STRUCTURES: Array<
  AutoReviewCharacterChoice & { id: AutoReviewStorytellingStructure }
> = [
  { id: "", label: "Auto" },
  {
    id: "hook_problem_emotion_insight_solution_result_cta",
    label: "Hook → Problem → Emotion → Insight → Solution → Result → CTA",
  },
  {
    id: "hook_problem_insight_proof_cta",
    label: "Hook → Problem → Insight → Proof → CTA",
  },
  {
    id: "product_review_situation_problem_try_result_fit",
    label: "Situation → Problem → Try → Result → Fit",
  },
  { id: "before_after_bridge", label: "Before → After → Bridge" },
  { id: "pas", label: "PAS" },
  { id: "aida", label: "AIDA" },
  { id: "relatable_story", label: "Relatable Story" },
  {
    id: "problem_struggle_solution_transformation",
    label: "Problem → Struggle → Solution → Transformation",
  },
];
const AUTO_REVIEW_CREATIVE_PRESET_GROUPS: Array<{
  family: AutoReviewCreativePresetFamily;
  title: string;
  description: string;
}> = [
  {
    family: "pacing_preset",
    title: "Preset: จังหวะ",
    description: "คุมความเร็วและความกระชับของแต่ละ beat",
  },
  {
    family: "camera_motion_preset",
    title: "Preset: กล้อง",
    description: "คุมภาษากล้อง โดยต้องรักษา reference frame",
  },
  {
    family: "visual_style_preset",
    title: "Preset: ภาพ",
    description: "คุมบรรยากาศภาพ โดยห้ามเปลี่ยน product/character lock",
  },
  {
    family: "audio_preset",
    title: "Preset: เสียง",
    description: "เลือกไม่มีเสียง / TTS แยก / native audio อย่างปลอดภัย",
  },
  {
    family: "platform_preset",
    title: "Preset: แพลตฟอร์ม",
    description: "ปรับจังหวะให้เหมาะกับช่องทาง เช่น TikTok Shop",
  },
  {
    family: "segment_structure_preset",
    title: "Preset: Multi-shot / Sub-shot",
    description:
      "เลือกว่าจะสร้างแบบ per-shot หรือรวมหลาย sub-shot ใน 1 วิดีโอ แล้วดู preview ด้านล่าง",
  },
];
const AUTO_REVIEW_CREATIVE_PRESET_OPTIONS: AutoReviewCreativePresetChoice[] =
  AUTO_REVIEW_CREATIVE_PRESETS.map(preset => ({
    id: preset.id,
    family: preset.family,
    label: preset.thaiLabel,
    description: preset.description,
  }));
const AUTO_REVIEW_SEGMENT_PRESET_VIDEO_STRUCTURE: Record<
  string,
  NonNullable<HyperframesAutoPlanOverrideInput["videoStructureMode"]>
> = {
  segment_per_shot_control: "per_shot",
  segment_adaptive_model: "adaptive_multi_shot",
  segment_compact_multi: "compact_multi_shot",
};
const PRODUCT_REFERENCE_CATEGORY_LABELS: Record<string, string> = {
  auto: "Auto / ให้ระบบเดาหมวดสินค้า",
  household_product: "เครื่องใช้ในบ้าน",
  computer_laptop: "คอมพิวเตอร์และแล็ปท็อป",
  electrical_appliance: "เครื่องใช้ไฟฟ้า",
  food_beverage: "อาหารและเครื่องดื่ม",
  electronics: "อุปกรณ์อิเล็กทรอนิกส์",
  fashion_clothing: "เสื้อผ้าแฟชั่น",
  shoes: "รองเท้า",
  watch_eyewear: "นาฬิกาและแว่นตา",
  mobile_tablet: "มือถือและแท็บเล็ต",
  jewelry: "เครื่องประดับ",
  mother_baby: "สินค้าแม่และเด็ก",
  pet_supplies: "ของใช้และอาหารสัตว์",
  sports_equipment: "อุปกรณ์กีฬา",
  camera_photography: "กล้องและอุปกรณ์ถ่ายภาพ",
  gaming_accessories: "เกมส์และอุปกรณ์เสริม",
  automotive: "ยานยนต์",
  stationery: "เครื่องเขียน",
  books: "หนังสือ",
  furniture: "เฟอร์นิเจอร์",
  cosmetics: "เครื่องสำอางและสกินแคร์",
};
const PRODUCT_REFERENCE_CATEGORY_OPTIONS = Object.entries(
  PRODUCT_REFERENCE_CATEGORY_LABELS
).map(([id, label]) => ({ id, label }));

function getProductId(pathname: string) {
  return pathname.match(/\/marketplace-capture\/products\/([^/]+)/)?.[1] ?? "";
}

function parseCompactCount(
  raw: string | number | null | undefined
): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (!raw) return null;
  const text = String(raw).toLowerCase().replace(/,/g, "").replace(/\s+/g, "");
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  if (!Number.isFinite(value)) return null;
  if (/m\+?/.test(text) || /ล้าน/.test(text))
    return Math.round(value * 1_000_000);
  if (/k\+?/.test(text) || /พัน/.test(text)) return Math.round(value * 1_000);
  if (/หมื่น/.test(text)) return Math.round(value * 10_000);
  return Math.round(value);
}

function formatCount(
  value: string | number | null | undefined,
  fallbackText?: string | number | null
): string {
  const normalized =
    parseCompactCount(value) ?? parseCompactCount(fallbackText);
  if (normalized != null) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
      normalized
    );
  }
  return value == null || value === "" ? "-" : String(value);
}

function compactLinkText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function appendStoryboardReviewHyperframesContext(
  value: string,
  context?: {
    productId?: unknown;
    runId?: unknown;
    renderJobId?: unknown;
  }
): string {
  const renderJobId = compactLinkText(context?.renderJobId);
  if (!renderJobId) return value;
  try {
    const parsed = new URL(value, "https://smartaihub.app");
    if (
      parsed.pathname !== "/storyboard-review" &&
      !parsed.pathname.startsWith("/storyboard-review/")
    ) {
      return value;
    }
    parsed.searchParams.set("hyperframesRenderJobId", renderJobId);
    const productId = compactLinkText(context?.productId);
    const runId = compactLinkText(context?.runId);
    if (productId) parsed.searchParams.set("productId", productId);
    if (runId) parsed.searchParams.set("runId", runId);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return value;
  }
}

function normalizeStoryboardReviewLink(
  value?: string | null,
  context?: {
    productId?: unknown;
    runId?: unknown;
    renderJobId?: unknown;
  }
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const queryMatch = trimmed.match(/^\/storyboard-review\?reviewId=([0-9]+)$/i);
  if (queryMatch?.[1]) {
    return appendStoryboardReviewHyperframesContext(
      `/storyboard-review/${queryMatch[1]}`,
      context
    );
  }

  try {
    const parsed = new URL(trimmed, "https://smartaihub.app");
    if (
      parsed.pathname === "/storyboard-review" &&
      /^[0-9]+$/.test(parsed.searchParams.get("reviewId") ?? "")
    ) {
      const reviewId = parsed.searchParams.get("reviewId");
      parsed.searchParams.delete("reviewId");
      const normalized = `/storyboard-review/${reviewId}${parsed.search}${parsed.hash}`;
      return appendStoryboardReviewHyperframesContext(normalized, context);
    }
  } catch {
    return trimmed;
  }

  return appendStoryboardReviewHyperframesContext(trimmed, context);
}

function normalizeAutoReviewOutputLinkUrl(
  link: unknown,
  context?: {
    productId?: unknown;
    runId?: unknown;
    renderJobId?: unknown;
  }
): string {
  const record = asRecord(link);
  const url = compactLinkText(record.url);
  if (!url) return "";
  const kind = compactLinkText(record.kind);
  if (kind === "storyboard_review" || url.includes("/storyboard-review")) {
    return normalizeStoryboardReviewLink(url, context) ?? url;
  }
  return url;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function compactText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeHttpUrl(value: unknown): string {
  const raw = compactText(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function isTikTokShowcaseListUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      /(^|\.)shop\.tiktok\.com$/i.test(url.hostname) &&
      /\/streamer\/showcase\/product\/list\/?$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function tiktokProductPageUrlFromId(value: unknown): string {
  const id = compactText(value);
  return /^\d{8,}$/.test(id) ? `https://shop.tiktok.com/th/pdp/${id}` : "";
}

function marketplaceProductPageUrl(
  item: Record<string, unknown>,
  platformRaw: Record<string, unknown>
): string {
  const platform = compactText(item.platform);
  const explicitUrl = safeHttpUrl(
    firstCompactText(
      platformRaw.productPageUrl,
      platformRaw.latestProductPageUrl,
      platformRaw.productUrl,
      platformRaw.latestProductUrl,
      platformRaw.canonicalSourceUrl,
      platformRaw.sourceUrl,
      item.sourceUrl
    )
  );
  if (
    explicitUrl &&
    !(platform === "tiktok_shop" && isTikTokShowcaseListUrl(explicitUrl))
  ) {
    return explicitUrl;
  }
  return platform === "tiktok_shop"
    ? tiktokProductPageUrlFromId(item.externalProductId)
    : explicitUrl;
}

function compactDisplayValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  return compactText(value);
}

function parseDecimalValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = compactDisplayValue(value).replace(/,/g, "");
  if (!text) return null;
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDecimalValue(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatCommissionRateValue(value: unknown): string {
  const rate = parseDecimalValue(value);
  return rate == null ? "-" : `${formatDecimalValue(rate)}%`;
}

function formatCommissionAmountValue(
  priceCurrent: unknown,
  commissionRatePercent: unknown,
  currency: unknown
): string {
  const price = parseDecimalValue(priceCurrent);
  const rate = parseDecimalValue(commissionRatePercent);
  if (price == null || rate == null) return "-";
  return `${formatDecimalValue(price * (rate / 100))} ${compactText(currency) || "THB"}`;
}

function formatDiagnosticDateTime(value: unknown): string {
  const text = compactDisplayValue(value);
  if (!text) return "-";
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleString();
}

function autoStoryboardPlanOverrideValue(
  plan: HyperframesAutoStoryboardReviewPlan | null | undefined,
  key: keyof HyperframesAutoPlanOverrideInput
): unknown {
  const defaults = plan?.defaults;
  if (!defaults) return undefined;
  if (key === "platformPresetId") return defaults.platformPreset.presetId;
  return defaults[key as keyof typeof defaults];
}

function autoStoryboardPlanMatchesOverrides(
  plan: HyperframesAutoStoryboardReviewPlan | null | undefined,
  overrides: HyperframesAutoPlanOverrideInput
): boolean {
  const entries = Object.entries(overrides) as [
    keyof HyperframesAutoPlanOverrideInput,
    unknown,
  ][];
  if (!plan) return false;
  if (entries.length === 0) {
    return (
      !plan.resetToAutoAvailable &&
      (plan.overrideDiff.fields ?? []).length === 0
    );
  }
  return entries.every(([key, value]) => {
    const planValue = autoStoryboardPlanOverrideValue(plan, key);
    return String(planValue ?? "") === String(value ?? "");
  });
}

function categoryPathParts(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(categoryPathParts).slice(0, 8);
  }
  const text = compactText(value);
  if (!text) return [];
  return text
    .split(/\s*(?:>|›|\/|\||,|\n)\s*/)
    .map(compactText)
    .filter(Boolean)
    .slice(0, 8);
}

function firstCategoryPathParts(...values: unknown[]): string[] {
  for (const value of values) {
    const parts = categoryPathParts(value);
    if (parts.length > 0) return parts;
  }
  return [];
}

function productCategoryLabel(value: unknown): string {
  const key = compactText(value);
  if (!key) return "-";
  const label = PRODUCT_REFERENCE_CATEGORY_LABELS[key];
  return label ? `${label} (${key})` : key;
}

function autoReviewDisplayMessage(value: unknown): string {
  const text = compactText(value);
  if (!text) return "";
  if (
    /^Failed query:/i.test(text) ||
    /insert into "marketplace_auto_review_stages"/i.test(text)
  ) {
    return "ระบบบันทึกสถานะขั้นตอนล้มเหลวหลังส่งงานให้ provider แล้ว กรุณาดู log/backend trace หรือเริ่มใหม่จาก checkpoint";
  }
  return text.length > 360 ? `${text.slice(0, 357)}...` : text;
}

function autoReviewFriendlyReason(value: string): string {
  const normalized = value.replace(/^reason:/, "").replace(/^repair:/, "");
  const labels: Record<string, string> = {
    productMismatch: "สินค้า/รูปทรงยังไม่ตรงกับรูปอ้างอิง",
    product_mismatch: "สินค้า/รูปทรงยังไม่ตรงกับรูปอ้างอิง",
    product_reference_missing: "ยังเห็นสินค้าอ้างอิงไม่ชัดพอ",
    continuityIssue: "ความต่อเนื่องของภาพหรือช็อตยังไม่ลื่น",
    continuity_issue: "ความต่อเนื่องของภาพหรือช็อตยังไม่ลื่น",
    character_anchor_missing: "ยังไม่เห็นคน/ตัวแบบตาม reference ชัดพอ",
    marketplace_ui_detected: "มีหน้าจอ/โลโก้ marketplace ติดมาในภาพ",
    text_detected: "มีข้อความบนภาพ ทั้งที่เลือกไม่มีข้อความ",
    overlay_text_detected: "มีข้อความ/label บนภาพมากเกินไป",
    grid_border_detected: "มีเส้นขอบหรือช่องว่างคั่นเฟรมชัดเกินไป",
    vision_qa_repair_required: "QA พบจุดที่ต้องซ่อมก่อนส่งต่อ",
    repair_budget_exhausted_storyboard_review_required:
      "ซ่อมครบโควตาแล้ว ส่งให้ผู้ใช้ตรวจต่อใน Storyboard Review",
    storyboard_grid_image: "ภาพ storyboard 3x3 ต้องซ่อมทั้ง grid",
    "storyboard-grid-image": "ภาพ storyboard 3x3 ต้องซ่อมทั้ง grid",
  };
  return labels[normalized] ?? normalized.replaceAll("_", " ");
}

function autoReviewTimelineQualitySummary(input: {
  status?: unknown;
  reasonCodes: string[];
  qaRefs: string[];
  repairRefs: string[];
}) {
  const status = compactText(input.status);
  const reasons = input.reasonCodes.map(autoReviewFriendlyReason);
  const repairs = input.repairRefs.map(autoReviewFriendlyReason);
  const qaCount = input.qaRefs.length;
  const hasRepairSignal = input.repairRefs.length > 0 || reasons.length > 0;
  if (status === "completed" && qaCount > 0 && !hasRepairSignal) {
    return {
      tone: "success",
      title: "ผลตรวจรอบนี้ผ่าน",
      items: [`QA ผ่านแล้ว ${qaCount} รายการ พร้อมส่งต่อขั้นตอนถัดไป`],
    };
  }
  if (status === "completed_with_warnings") {
    return {
      tone: "warning",
      title: "ผลตรวจรอบนี้ผ่านพร้อมคำเตือน",
      items:
        reasons.length > 0
          ? reasons
          : ["ภาพครบแล้ว ระบบส่งต่อให้ตรวจใน Storyboard Review"],
    };
  }
  if (status === "repairing" || hasRepairSignal) {
    return {
      tone: "warning",
      title: "ผลตรวจรอบนี้ต้องซ่อม",
      items: [...reasons, ...repairs].filter(Boolean).slice(0, 5),
    };
  }
  if (status === "failed") {
    return {
      tone: "error",
      title: "รอบนี้หยุดจากข้อผิดพลาด",
      items:
        reasons.length > 0 ? reasons : ["ต้องดูรายละเอียด error ก่อนเริ่มใหม่"],
    };
  }
  return null;
}

function autoReviewImageTaskSummary(run: any): string {
  const tasks: any[] = Array.isArray(run?.metadataJson?.directImageTasks)
    ? (run.metadataJson.directImageTasks as any[])
    : [];
  if (tasks.length === 0) return "";
  const counts = tasks.reduce(
    (memo, task) => {
      const status = compactText(task?.status) || "unknown";
      memo[status] = (memo[status] ?? 0) + 1;
      return memo;
    },
    {} as Record<string, number>
  );
  const gridDone = tasks.some(
    task =>
      compactText(task?.unitId) === "storyboard-grid-image" &&
      compactText(task?.status) === "completed"
  );
  const repairCount = tasks.filter(task =>
    compactText(task?.unitId).includes("repair")
  ).length;
  const parts = [
    gridDone ? "3x3 grid เสร็จแล้ว" : "",
    repairCount > 0 ? `มีงานซ่อมรายเฟรม ${repairCount} งาน` : "",
    `completed ${counts.completed ?? 0}/${tasks.length}`,
    (counts.processing ?? 0) > 0 ? `processing ${counts.processing}` : "",
    (counts.pending ?? 0) > 0 ? `pending ${counts.pending}` : "",
    (counts.failed ?? 0) > 0 ? `failed ${counts.failed}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

type AutoReviewImageAttemptCard = {
  attempt: number;
  status: string;
  tone: "success" | "warning" | "error" | "pending";
  title: string;
  message: string;
  reasons: string[];
  thumbnails: Array<{
    url: string;
    title: string;
    status: string;
    unitId: string;
  }>;
  promptHash: string;
  promptLengthChars: number;
  prompt: string;
  promptSnippet: string;
  qaRefs: string[];
  repairRefs: string[];
  storyboardGridUrl: string;
  storyboardFrameUrls: string[];
  startFrameUrls: string[];
  stopFrameUrls: string[];
  selected: boolean;
  canCreateStoryboardReview: boolean;
  hasPublishSafetyBlocker: boolean;
};

function autoReviewAttemptTone(
  status: string
): AutoReviewImageAttemptCard["tone"] {
  if (status === "passed") return "success";
  if (status === "accepted_with_warnings" || status === "repair_required")
    return "warning";
  if (status === "failed") return "error";
  return "pending";
}

function autoReviewAttemptTitle(attempt: number, status: string): string {
  if (status === "passed") return `รูปชุดที่ ${attempt} ผ่าน`;
  if (status === "accepted_with_warnings")
    return `รูปชุดที่ ${attempt} ผ่านพร้อมคำเตือน`;
  if (status === "repair_required") return `รูปชุดที่ ${attempt} ต้องซ่อม`;
  if (status === "failed") return `รูปชุดที่ ${attempt} ล้มเหลว`;
  return `รูปชุดที่ ${attempt} กำลังตรวจ`;
}

function autoReviewAttemptMessage(status: string, reasons: string[]): string {
  if (status === "passed") return "QA ผ่านแล้ว ใช้ภาพชุดนี้ส่งต่อได้";
  if (status === "accepted_with_warnings")
    return "ระบบซ่อมครบโควตาหรือมีคำเตือน แต่จะส่งต่อให้ตรวจใน Storyboard Review";
  if (status === "repair_required")
    return reasons.length > 0
      ? "พบจุดที่ต้องซ่อมก่อนส่งต่อ"
      : "ภาพชุดนี้ยังไม่ผ่าน QA ต้องสร้างรอบซ่อม";
  if (status === "failed")
    return "รอบนี้หยุดเพราะ provider หรือระบบบันทึกผลล้มเหลว";
  return "รอผลจาก provider หรือ QA";
}

function autoReviewReasonBlocksPublishSafety(reason: string): boolean {
  return /shirtless|bare.*(chest|torso)|(diaper|underwear).*only|nudit|semi.*nude|เด็ก.*(ไม่ใส่เสื้อ|เปลือย|เสื้อผ้าไม่ครบ)|เด็ก.*ผ้าอ้อมอย่างเดียว/i.test(
    reason
  );
}

function autoReviewImageAttemptCards(run: any): AutoReviewImageAttemptCard[] {
  const metadata = asRecord(run?.metadataJson);
  const acceptance = asRecord(metadata.generatedMediaAcceptanceEnvelope);
  const manualSelection = asRecord(metadata.manualImageAttemptSelection);
  const selectedAttempt =
    Number(manualSelection.attempt) ||
    Number(acceptance.selectedImageAttempt) ||
    Number(metadata.selectedImageAttempt) ||
    0;
  const reviews = Array.isArray(metadata.imageAttemptReviews)
    ? (metadata.imageAttemptReviews as unknown[]).map(item => asRecord(item))
    : [];
  if (reviews.length > 0) {
    return reviews.map(review => {
      const attempt = Number(review.attempt) || 1;
      const status = compactText(review.status) || "pending";
      const taskRefs = Array.isArray(review.taskRefs)
        ? (review.taskRefs as unknown[]).map(item => asRecord(item))
        : [];
      const thumbnails = taskRefs
        .map(ref => ({
          url: compactText(ref.resultUrl),
          title:
            compactText(ref.role) ||
            compactText(ref.unitId) ||
            `รูปชุดที่ ${attempt}`,
          status: compactText(ref.status),
          unitId: compactText(ref.unitId),
        }))
        .filter(item => item.url);
      const fallbackThumbs = Array.isArray(review.thumbnailUrls)
        ? (review.thumbnailUrls as unknown[])
            .map((url, index) => ({
              url: compactText(url),
              title: `ภาพ ${index + 1}`,
              status,
              unitId: `attempt-${attempt}-${index + 1}`,
            }))
            .filter(item => item.url)
        : [];
      const resultThumbs = [
        compactText(review.storyboardGridUrl),
        ...compactStringList(review.resultUrls),
        ...compactStringList(review.storyboardFrameUrls),
        ...compactStringList(review.startFrameUrls),
        ...compactStringList(review.stopFrameUrls),
      ]
        .filter(
          (url, index, urls) => Boolean(url) && urls.indexOf(url) === index
        )
        .map((url, index) => ({
          url,
          title:
            index === 0 && compactText(review.storyboardGridUrl) === url
              ? `รูปชุดที่ ${attempt}`
              : `ภาพ ${index + 1}`,
          status,
          unitId: `attempt-${attempt}-result-${index + 1}`,
        }));
      const reasons = compactStringList(review.reasonCodes);
      const publishSafetyBlockers = [
        ...reasons,
        ...compactStringList(
          asRecord(review.scoreBreakdown).publishSafetyBlockers
        ),
        ...compactStringList(review.selectionBlockers),
      ].filter(autoReviewReasonBlocksPublishSafety);
      const promptAudits = Array.isArray(review.promptAudits)
        ? (review.promptAudits as unknown[]).map(item => asRecord(item))
        : [];
      const promptFromAudit = firstCompactText(
        ...promptAudits.map(audit => audit.prompt)
      );
      const promptSnippetFromAudit = firstCompactText(
        ...promptAudits.map(audit => audit.promptSnippet)
      );
      const promptHashFromAudit = firstCompactText(
        ...promptAudits.map(audit => audit.promptHash)
      );
      const promptLengthFromAudit =
        Number(
          promptAudits.find(audit => Number(audit.promptLengthChars))
            ?.promptLengthChars
        ) || 0;
      const storyboardGridUrl = compactText(review.storyboardGridUrl);
      const storyboardFrameUrls = compactStringList(review.storyboardFrameUrls);
      const startFrameUrls = compactStringList(review.startFrameUrls);
      const stopFrameUrls = compactStringList(review.stopFrameUrls);
      const canCreateStoryboardReview =
        publishSafetyBlockers.length === 0 &&
        Boolean(
          storyboardGridUrl ||
          storyboardFrameUrls.length > 0 ||
          startFrameUrls.length > 0 ||
          stopFrameUrls.length > 0
        );
      return {
        attempt,
        status,
        tone: autoReviewAttemptTone(status),
        title: autoReviewAttemptTitle(attempt, status),
        message: autoReviewAttemptMessage(status, reasons),
        reasons,
        thumbnails:
          thumbnails.length > 0
            ? thumbnails
            : fallbackThumbs.length > 0
              ? fallbackThumbs
              : resultThumbs,
        promptHash: compactText(review.promptHash) || promptHashFromAudit,
        promptLengthChars:
          Number(review.promptLengthChars) || promptLengthFromAudit,
        prompt: compactText(review.prompt) || promptFromAudit,
        promptSnippet:
          compactText(review.promptSnippet) || promptSnippetFromAudit,
        qaRefs: compactStringList(review.qaVerdictRefs),
        repairRefs: compactStringList(review.repairRefs),
        storyboardGridUrl,
        storyboardFrameUrls,
        startFrameUrls,
        stopFrameUrls,
        selected: selectedAttempt === attempt,
        canCreateStoryboardReview,
        hasPublishSafetyBlocker: publishSafetyBlockers.length > 0,
      };
    });
  }

  const tasks = Array.isArray(metadata.directImageTasks)
    ? (metadata.directImageTasks as unknown[]).map(item => asRecord(item))
    : [];
  const grouped = new Map<number, Record<string, unknown>[]>();
  tasks.forEach(task => {
    const attempt = Number(task.attempt) || 1;
    grouped.set(attempt, [...(grouped.get(attempt) ?? []), task]);
  });
  return Array.from(grouped.entries())
    .sort(([a], [b]) => a - b)
    .map(([attempt, attemptTasks]) => {
      const failed = attemptTasks.some(
        task => compactText(task.status) === "failed"
      );
      const completed = attemptTasks.filter(
        task => compactText(task.status) === "completed"
      );
      const status = failed
        ? "failed"
        : completed.length === attemptTasks.length
          ? "passed"
          : "pending";
      const reasons = Array.from(
        new Set(
          attemptTasks.flatMap(task =>
            compactStringList(task.repairReasonCodes)
          )
        )
      );
      const publishSafetyBlockers = reasons.filter(
        autoReviewReasonBlocksPublishSafety
      );
      const promptAudits = attemptTasks
        .map(task =>
          asRecord(asRecord(task.providerSubmitEvidence).promptAudit)
        )
        .filter(audit => compactText(audit.promptHash));
      const promptFromAudit = firstCompactText(
        ...promptAudits.map(audit => audit.prompt)
      );
      const promptSnippetFromAudit = firstCompactText(
        ...promptAudits.map(audit => audit.promptSnippet)
      );
      const promptHashFromAudit = firstCompactText(
        ...promptAudits.map(audit => audit.promptHash)
      );
      const promptLengthFromAudit =
        Number(
          promptAudits.find(audit => Number(audit.promptLengthChars))
            ?.promptLengthChars
        ) || 0;
      const resultUrls = attemptTasks
        .map(task => compactText(task.resultUrl))
        .filter(Boolean);
      return {
        attempt,
        status,
        tone: autoReviewAttemptTone(status),
        title: autoReviewAttemptTitle(attempt, status),
        message: autoReviewAttemptMessage(status, reasons),
        reasons,
        thumbnails: attemptTasks
          .map(task => ({
            url: compactText(task.resultUrl),
            title:
              compactText(task.role) ||
              compactText(task.unitId) ||
              `รูปชุดที่ ${attempt}`,
            status: compactText(task.status),
            unitId: compactText(task.unitId),
          }))
          .filter(item => item.url),
        promptHash:
          firstCompactText(...attemptTasks.map(task => task.promptHash)) ||
          promptHashFromAudit,
        promptLengthChars:
          Number(
            attemptTasks.find(task => Number(task.promptLengthChars))
              ?.promptLengthChars
          ) || promptLengthFromAudit,
        prompt: promptFromAudit,
        promptSnippet:
          firstCompactText(...attemptTasks.map(task => task.promptSnippet)) ||
          promptSnippetFromAudit,
        qaRefs: [],
        repairRefs: reasons,
        storyboardGridUrl: resultUrls[0] ?? "",
        storyboardFrameUrls: [],
        startFrameUrls: [],
        stopFrameUrls: [],
        selected: selectedAttempt === attempt,
        canCreateStoryboardReview:
          resultUrls.length > 0 && publishSafetyBlockers.length === 0,
        hasPublishSafetyBlocker: publishSafetyBlockers.length > 0,
      };
    });
}

function compactStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => compactText(item)).filter(Boolean)
    : [];
}

function firstCompactText(...values: unknown[]): string {
  for (const value of values) {
    const text = compactText(value);
    if (text) return text;
  }
  return "";
}

function optionLabel(options: AutoReviewCharacterChoice[], id: string): string {
  return options.find(option => option.id === id)?.label ?? id;
}

function hyperframesRenderRefFromAutoReviewRun(
  run: unknown
): { renderJobId: string; runId: string } | null {
  const record = asRecord(run);
  const metadata = asRecord(record.metadataJson);
  const result = asRecord(record.resultJson);
  const autoPreview = asRecord(metadata.hyperframesAutoPreview);
  const resultAutoPreview = asRecord(result.hyperframesAutoPreview);
  const render = asRecord(result.render);
  const renderJobId = firstCompactText(
    record.renderJobId,
    autoPreview.renderJobId,
    resultAutoPreview.renderJobId,
    result.hyperframesRenderJobId,
    render.renderJobId
  );
  if (!renderJobId) return null;
  return {
    renderJobId,
    runId: firstCompactText(
      record.id,
      record.runId,
      autoPreview.runId,
      result.runId
    ),
  };
}

function shortAuditRef(value: unknown, max = 28): string {
  const text = compactText(value);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function autoReviewPromptSkillDebug(value: unknown) {
  const debug = asRecord(value);
  const prompt = firstCompactText(
    debug.rawOutput,
    debug.prompt,
    debug.output,
    debug.text
  );
  if (!prompt) return null;
  const preflight = asRecord(debug.preflight);
  const blockers = [
    ...compactStringList(preflight.blockers),
    ...compactStringList(debug.blockers),
  ].filter((item, index, items) => items.indexOf(item) === index);
  const length =
    Number(
      debug.trimmedOutputLengthChars ??
        debug.rawOutputLengthChars ??
        debug.promptLengthChars
    ) || prompt.length;
  const maxOutputChars = Number(debug.maxOutputChars) || 0;
  return {
    prompt,
    length,
    maxOutputChars,
    skillId: firstCompactText(debug.skillId, "product-reference-storyboard"),
    unitId: compactText(debug.unitId),
    runId: compactText(debug.runId),
    attempt: Number(debug.attempt) || 0,
    promptAttempt: Number(debug.promptAttempt) || 0,
    status: compactText(debug.status),
    reasonCode: compactText(debug.reasonCode),
    modelId: compactText(debug.modelId),
    providerName: compactText(debug.providerName),
    finishReason: compactText(debug.finishReason),
    fullOutputLogPath: compactText(debug.fullOutputLogPath),
    blockers,
  };
}

function autoReviewRefHref(value: unknown): string {
  const text = compactText(value);
  return /^(https?:\/\/|\/(?!\/))/i.test(text) ? text : "";
}

function isAutoReviewRunBlockingStart(run: any): boolean {
  const status = compactText(run?.status).toLowerCase();
  return Boolean(status) && !AUTO_REVIEW_TERMINAL_STATUSES.has(status);
}

function autoReviewRunIdentityKeys(run: any): string[] {
  const projection = asRecord(run?.apiProjection);
  return [
    compactText(run?.id),
    compactText(run?.productionRunId),
    compactText(run?.runId),
    compactText(projection.id),
    compactText(projection.productionRunId),
  ].filter((key, index, keys) => key && keys.indexOf(key) === index);
}

function isAutoReviewRunSuppressed(
  run: any,
  suppressedRunIds: Set<string>
): boolean {
  return autoReviewRunIdentityKeys(run).some(key => suppressedRunIds.has(key));
}

function buildUploadedAnchorRef(
  role: "character" | "environment",
  anchor: UploadedReferenceAnchor | null
): string | null {
  if (!anchor?.url) return null;
  if (anchor.hash) return `${role}-upload-sha256:${anchor.hash}`;
  if (anchor.uploadKey) return `${role}-upload-key:${anchor.uploadKey}`;
  return `${role}-url:${anchor.url}`;
}

async function sha256File(file: File): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const buffer = await file.arrayBuffer();
  const digest = await subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getProductNeedles(product: Record<string, unknown>): string[] {
  return [
    compactText(product.id),
    compactText(product.sourceUrl),
    compactText(product.affiliateUrl),
    compactText(product.externalProductId),
    compactText(product.externalShopId),
    compactText(product.productName),
  ].filter(
    (value, index, values) =>
      value.length >= 3 && values.indexOf(value) === index
  );
}

function valueMatchesProduct(
  value: unknown,
  product: Record<string, unknown>
): boolean {
  const needles = getProductNeedles(product);
  if (needles.length === 0) return false;
  const haystack = JSON.stringify(value ?? {}).toLowerCase();
  return needles.some(needle => haystack.includes(needle.toLowerCase()));
}

function extractTaskResultUrl(task: any): string {
  const direct = compactText(task?.resultUrl ?? task?.url ?? task?.outputUrl);
  if (direct) return direct;
  const result = asRecord(task?.result);
  const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];
  for (const artifact of artifacts) {
    const url = compactText(asRecord(artifact).uri ?? asRecord(artifact).url);
    if (url) return url;
  }
  const outputs = Array.isArray(task?.outputs) ? task.outputs : [];
  for (const output of outputs) {
    const url = compactText(asRecord(output).url ?? asRecord(output).uri);
    if (url) return url;
  }
  return "";
}

function extractTaskTitle(task: any): string {
  return (
    compactText(task?.title) ||
    compactText(task?.prompt).slice(0, 90) ||
    compactText(task?.model) ||
    "Media task"
  );
}

function taskMatchesProduct(
  task: any,
  product: Record<string, unknown>
): boolean {
  return (
    valueMatchesProduct(task?.parameters, product) ||
    valueMatchesProduct(task?.generationExtraParams, product) ||
    valueMatchesProduct(task?.prompt, product) ||
    valueMatchesProduct(task, product)
  );
}

function libraryItemMatchesProduct(
  item: any,
  product: Record<string, unknown>
): boolean {
  return (
    valueMatchesProduct(item?.metadata, product) ||
    valueMatchesProduct(item?.title, product) ||
    valueMatchesProduct(item?.description, product) ||
    valueMatchesProduct(item, product)
  );
}

function getLibraryItemUrl(item: any): string {
  return compactText(item?.source_url ?? item?.sourceUrl ?? item?.url);
}

function mediaTabLabel(tab: ProductMediaTab): string {
  if (tab === "video") return "Video";
  if (tab === "audio") return "Audio";
  return "Image";
}

function mediaIcon(tab: ProductMediaTab) {
  if (tab === "video") return <Video className="h-4 w-4" />;
  if (tab === "audio") return <Film className="h-4 w-4" />;
  return <ImageIcon className="h-4 w-4" />;
}

function formatImageDimensions(dimensions?: ImageDimensions): string {
  if (!dimensions?.width || !dimensions?.height) return "กำลังอ่านขนาดรูป";
  return `${dimensions.width}x${dimensions.height} px`;
}

function productImageTypeLabel(value: unknown): string {
  const text = compactText(value).toLowerCase();
  if (text === "main") return "รูปหลักสินค้า";
  if (text === "thumbnail") return "ภาพตัวอย่างสินค้า";
  if (text === "gallery") return "รูปสินค้าในแกลเลอรี";
  if (text === "variant") return "รูปตัวเลือกสินค้า";
  return compactText(value) || "รูปสินค้า";
}

function productImageSourceLabel(value: unknown): string {
  const text = compactText(value);
  const normalized = text.toLowerCase();
  const labels: Record<string, string> = {
    marketplace_product_image: "ภาพสินค้าจาก Marketplace Capture",
    product_detail_upload: "อัปโหลดจากผู้ใช้",
    product_detail_drag_drop_upload: "ลากไฟล์สินค้าเข้า Product Detail",
    product_detail_drag_drop: "แนบจาก Media Panel",
    product_detail_panel_action: "แนบจาก Library/History",
    "Product images": "ภาพที่ผูกกับสินค้านี้",
  };
  return labels[normalized] ?? labels[text] ?? text.replaceAll("_", " ");
}

function multiViewReferencePolicyText(role: AutoReviewAnchorDropRole): string {
  if (role === "product") {
    return "รองรับไฟล์เดียวแบบ multi-view sheet ได้ แต่ทุกมุมต้องเป็นสินค้ารุ่น/สี/รูปทรงเดียวกัน";
  }
  if (role === "character") {
    return "รองรับไฟล์เดียวแบบ multi-view sheet เช่น หน้าตรง ด้านข้าง สามส่วน และหลัง เพื่อช่วยล็อกตัวตนเดียวกัน";
  }
  return "รองรับไฟล์เดียวแบบ multi-view sheet ของสถานที่เดียวกัน เช่น wide, medium, detail และมุมแสง";
}

function autoReviewStatusLabel(status: string): string {
  if (status === "completed") return "เสร็จแล้ว";
  if (status === "completed_with_warnings") return "เสร็จแล้ว มีคำเตือน";
  if (status === "failed") return "ล้มเหลว";
  if (status === "cancelled") return "ยกเลิกแล้ว";
  if (status === "blocked" || status === "blocked_needs_user")
    return "ติดเงื่อนไข";
  if (status === "repairing") return "กำลังซ่อมงาน";
  if (status === "recheck_required") return "ต้องตรวจซ้ำ";
  if (status === "paused") return "หยุดพักงาน";
  if (status === "awaiting_review") return "รอตรวจงาน";
  if (status === "awaiting_credit_authorization") return "รออนุมัติเครดิต";
  if (status === "waiting_provider") return "รอผลจาก provider";
  if (status === "running") return "กำลังทำงาน";
  return "อยู่ในคิว";
}

function autoReviewStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    product_preflight: "ตรวจข้อมูลสินค้า",
    production_project: "สร้าง Production Project",
    concept_story: "สร้างแนวคิด/บทพูด",
    prompt_plan: "สร้าง prompt ทั้งหมด",
    image_generation: "สร้างภาพ/เฟรม",
    storyboard_review: "ส่งเข้า Storyboard Review",
    video_generation: "สร้างวิดีโอรายช็อต",
    audio_generation: "เตรียมเสียง/บทพูด",
    video_edit: "ประกอบ Video Editor",
    render: "Render วิดีโอ",
    library_finalize: "บันทึกเข้า Library",
  };
  return labels[stage] ?? stage;
}

function autoReviewStatusClass(status: string): string {
  if (status === "completed")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "completed_with_warnings")
    return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "blocked" || status === "blocked_needs_user")
    return "border-red-200 bg-red-50 text-red-700";
  if (status === "cancelled")
    return "border-slate-200 bg-slate-50 text-slate-600";
  if (status === "paused" || status === "recheck_required")
    return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

function autoReviewTimelineStatusClass(status: string): string {
  if (status === "completed" || status === "completed_with_warnings")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "failed" || status === "blocked")
    return "border-red-200 bg-red-50 text-red-700";
  if (
    status === "running" ||
    status === "waiting_provider" ||
    status === "repairing"
  )
    return "border-sky-200 bg-sky-50 text-sky-700";
  if (
    status === "paused" ||
    status === "recheck_required" ||
    status === "awaiting_review" ||
    status === "awaiting_credit_authorization"
  )
    return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "skipped" || status === "cancelled")
    return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function autoReviewCurrentStageAccentClass(input: {
  status?: unknown;
  detail?: Record<string, unknown>;
}) {
  const status = compactText(input.status).toLowerCase();
  const detail = input.detail ?? {};
  const state = compactText(detail.state).toLowerCase();
  const severity = compactText(detail.severity).toLowerCase();
  if (
    status === "failed" ||
    status === "blocked" ||
    status === "blocked_needs_user" ||
    severity === "error" ||
    severity === "blocked" ||
    state.includes("failed") ||
    state.includes("blocked")
  ) {
    return "bg-red-500";
  }
  if (
    status === "awaiting_credit_authorization" ||
    status === "recheck_required" ||
    severity === "warning" ||
    state.includes("credit") ||
    state.includes("authorization")
  ) {
    return "bg-amber-500";
  }
  if (status === "qa_pending" || state.includes("qa")) {
    return "bg-violet-500";
  }
  if (status === "repairing" || state.includes("repair")) {
    return "bg-blue-500";
  }
  if (status === "queued" || status === "pending" || status === "not_started") {
    return "bg-amber-400";
  }
  return "bg-sky-500";
}

function autoReviewCurrentStageContainerClass(input: {
  status?: unknown;
  detail?: Record<string, unknown>;
}) {
  const status = compactText(input.status).toLowerCase();
  const detail = input.detail ?? {};
  const severity = compactText(detail.severity).toLowerCase();
  if (
    status === "failed" ||
    status === "blocked" ||
    status === "blocked_needs_user" ||
    severity === "error" ||
    severity === "blocked"
  ) {
    return "border-red-300 bg-red-50/60 pl-4 shadow-sm ring-1 ring-red-100";
  }
  if (status === "queued" || status === "pending" || status === "not_started") {
    return "border-amber-300 bg-amber-50/60 pl-4 shadow-sm ring-1 ring-amber-100";
  }
  return "border-sky-300 bg-sky-50/60 pl-4 shadow-sm ring-1 ring-sky-100";
}

function getAutoReviewTimelineProjection(run: any): any {
  return asRecord(run?.apiProjection?.timeline ?? run?.timeline);
}

function autoReviewStateFamily(input: {
  status?: unknown;
  detail?: Record<string, unknown>;
  stageKey?: unknown;
}) {
  const status = compactText(input.status).toLowerCase();
  const detail = input.detail ?? {};
  const state = compactText(detail.state).toLowerCase();
  const stageKey = compactText(input.stageKey).toLowerCase();
  const reasonText = compactStringList(detail.reasonCodes)
    .join(" ")
    .toLowerCase();
  const combined = `${status} ${state} ${stageKey} ${reasonText}`;
  if (status === "cancelled" || state === "cancelled") {
    return {
      label: "ยกเลิกแล้ว",
      description: "งานนี้ถูกยกเลิกแล้ว เริ่มใหม่ได้เมื่อพร้อม",
      className: "border-slate-200 bg-slate-50 text-slate-600",
    };
  }
  if (status === "failed" || state === "failed_terminal") {
    return {
      label: "ล้มเหลว",
      description: "งานหยุดจากข้อผิดพลาด ต้องตรวจสาเหตุหรือเริ่มใหม่",
      className: "border-red-200 bg-red-50 text-red-700",
    };
  }
  if (
    state.includes("credit") ||
    state.includes("authorization") ||
    status === "awaiting_credit_authorization"
  ) {
    return {
      label: "รออนุมัติเครดิต",
      description: "ระบบยังไม่ใช้เครดิตเพิ่มจนกว่าจะได้รับสิทธิ์จ่าย",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  if (state.includes("provider") || status === "waiting_provider") {
    return {
      label: "รอ Provider",
      description: "ส่งงานออกไปแล้วและกำลังรอผลจาก provider",
      className: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }
  if (state.includes("qa") || status === "qa_pending") {
    return {
      label: "ตรวจ QA",
      description: "กำลังตรวจคุณภาพ ความถูกต้อง และหลักฐานของชิ้นงาน",
      className: "border-violet-200 bg-violet-50 text-violet-700",
    };
  }
  if (state.includes("repair") || status === "repairing") {
    return {
      label: "ซ่อมเฉพาะจุด",
      description: "ระบบกำลังซ่อมเฉพาะส่วนที่ QA หรือหลักฐานไม่ผ่าน",
      className: "border-blue-200 bg-blue-50 text-blue-700",
    };
  }
  if (
    AUTO_REVIEW_BLOCKER_STATE_MATCHES.some(token => combined.includes(token))
  ) {
    return {
      label: "ติดข้อมูลสินค้า/หลักฐาน",
      description:
        "ต้องแก้หลักฐานสินค้า ตัวแบบ ฉาก หรือข้อมูลอ้างอิงก่อนเดินต่อ",
      className: "border-red-200 bg-red-50 text-red-700",
    };
  }
  if (
    AUTO_REVIEW_POLICY_STATE_MATCHES.some(token => combined.includes(token))
  ) {
    return {
      label: "นโยบาย/คำเตือนโฆษณา",
      description:
        "มีเงื่อนไขด้าน policy คำเตือน โฆษณา หรือการเผยแพร่ที่ต้องตรวจ",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  if (
    status === "completed" ||
    status === "completed_with_warnings" ||
    state === "completed" ||
    state === "completed_with_warnings" ||
    AUTO_REVIEW_OUTPUT_STAGES.has(stageKey)
  ) {
    return {
      label: "ผลลัพธ์/แพ็กเกจสุดท้าย",
      description: "ขั้นตอนนี้สร้าง output หรือส่งต่อแพ็กเกจงานแล้ว",
      className:
        status === "completed_with_warnings" ||
        state === "completed_with_warnings"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (status === "queued" || status === "pending" || state === "queued") {
    return {
      label: "งานที่เหลือ",
      description: "ยังไม่เริ่มขั้นตอนนี้ ระบบจะทำหลังขั้นตอนก่อนหน้าจบ",
      className: "border-slate-200 bg-slate-50 text-slate-600",
    };
  }
  return {
    label: "กำลังทำงาน",
    description: "ขั้นตอนปัจจุบันกำลังรันหรือเตรียมรัน",
    className: "border-sky-200 bg-sky-50 text-sky-700",
  };
}

function autoReviewTechnicalIds(input: {
  status?: unknown;
  detail?: Record<string, unknown>;
  stageKey?: unknown;
}): string[] {
  const detail = input.detail ?? {};
  return [
    compactText(input.status),
    compactText(detail.state),
    compactText(input.stageKey),
    compactText(detail.technicalRef),
  ].filter((value, index, values) => value && values.indexOf(value) === index);
}

function autoReviewLinkLabel(link: any): string {
  const label = compactText(link?.label);
  if (label) return label;
  const kind = compactText(link?.kind);
  if (kind === "library_item") return "Library";
  if (kind === "storyboard_review") return "Storyboard";
  if (kind === "video_editor") return "Video Editor";
  if (kind === "production_project") return "Production";
  if (kind === "render") return "Render";
  return kind ? kind.replaceAll("_", " ") : "Output";
}

function formatAutoReviewCreditSummary(value: unknown): string {
  const credit = asRecord(value);
  const parts = (
    [
      ["est", credit.estimateCredits],
      ["reserved", credit.reservedCredits],
      ["spent", credit.spentCredits],
      ["refund", credit.refundedCredits],
      ["open", credit.outstandingCredits],
    ] as const
  )
    .map(([label, raw]) => {
      const amount = typeof raw === "number" && raw > 0 ? raw : 0;
      return amount ? `${label} ${amount}` : "";
    })
    .filter(Boolean);
  const authorizationStatus = compactText(credit.authorizationStatus);
  if (authorizationStatus && authorizationStatus !== "not_required") {
    parts.push(authorizationStatus.replaceAll("_", " "));
  }
  return parts.join(" · ");
}

function normalizeAutoReviewTimelineItem(item: any, index: number): any {
  const stageKey = compactText(item?.stageKey ?? item?.key ?? item?.stage);
  return {
    ...item,
    stageKey,
    label:
      compactText(item?.label) ||
      (stageKey ? autoReviewStageLabel(stageKey) : ""),
    order: Number(item?.order ?? item?.stageOrder ?? index + 1),
    status: compactText(item?.status) || "queued",
    detail: item?.detail ?? item?.statusDetail ?? null,
    qaVerdictRefs: compactStringList(item?.qaVerdictRefs ?? item?.qaRefs),
    repairRefs: compactStringList(item?.repairRefs),
    evidenceRefs: compactStringList(item?.evidenceRefs),
    credit: item?.credit ?? item?.creditSummary ?? {},
    outputLinks: Array.isArray(item?.outputLinks) ? item.outputLinks : [],
    promptSkillDebug: item?.promptSkillDebug ?? null,
  };
}

function normalizeAutoReviewStageItem(stage: any, index: number): any {
  const output = asRecord(stage?.outputJson);
  const stageKey = compactText(stage?.stageKey);
  return {
    stageKey,
    label: autoReviewStageLabel(stageKey),
    order: Number(stage?.stageOrder ?? index + 1),
    status: compactText(stage?.status) || "queued",
    detail: output.statusDetail ?? null,
    startedAt: stage?.startedAt ?? null,
    completedAt: stage?.completedAt ?? null,
    activeSubstep: output.activeSubstep ?? null,
    qaVerdictRefs: compactStringList(output.qaVerdictRefs ?? output.qaRefs),
    repairRefs: compactStringList(output.repairRefs),
    evidenceRefs: compactStringList(output.evidenceRefs),
    credit: output.creditSummary ?? {},
    outputLinks: Array.isArray(output.outputLinks) ? output.outputLinks : [],
    promptSkillDebug: output.promptSkillDebug ?? null,
  };
}

function autoReviewStageOutputByKey(
  run: any
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  const stages = Array.isArray(run?.stages) ? run.stages : [];
  stages.forEach((stage: any) => {
    const stageKey = compactText(stage?.stageKey);
    if (!stageKey) return;
    map.set(stageKey, asRecord(stage?.outputJson));
  });
  return map;
}

function attachAutoReviewStageDebugOutput(run: any, items: any[]): any[] {
  const outputByStage = autoReviewStageOutputByKey(run);
  return items.map(item => {
    const stageKey = compactText(item?.stageKey);
    const output = stageKey ? outputByStage.get(stageKey) : null;
    if (!output) return item;
    return {
      ...item,
      promptSkillDebug:
        item?.promptSkillDebug ?? output.promptSkillDebug ?? null,
    };
  });
}

function buildAutoReviewTimelineFallback(run: any, items: any[]): any[] {
  const normalizedItems = items
    .map(normalizeAutoReviewTimelineItem)
    .filter(item => item.stageKey);
  const byStage = new Map<string, any>();
  for (const item of normalizedItems) {
    byStage.set(item.stageKey, item);
  }

  const outputMode = compactText(run?.outputMode);
  const plannedStageKeys =
    outputMode === "storyboard_images"
      ? AUTO_REVIEW_PLANNED_STAGES.slice(
          0,
          AUTO_REVIEW_PLANNED_STAGES.indexOf("storyboard_review") + 1
        )
      : AUTO_REVIEW_PLANNED_STAGES;
  const stageKeys = [
    ...plannedStageKeys,
    ...normalizedItems
      .map(item => item.stageKey)
      .filter(stageKey => !plannedStageKeys.includes(stageKey)),
  ];
  const currentStage = compactText(run?.currentStage);
  const runStatus = compactText(run?.status) || "queued";
  const currentOrder =
    Number(run?.stageIndex) ||
    normalizedItems.find(item => item.stageKey === currentStage)?.order ||
    stageKeys.indexOf(currentStage) + 1 ||
    1;
  const isTerminal = AUTO_REVIEW_TERMINAL_STATUSES.has(runStatus);

  return stageKeys.map((stageKey, index) => {
    const existing = byStage.get(stageKey);
    const order = index + 1;
    if (existing) {
      if (
        isTerminal &&
        runStatus !== "completed" &&
        order > currentOrder &&
        compactText(existing.status) === "queued"
      ) {
        return {
          ...existing,
          order,
          status: "skipped",
          detail: {
            state: "skipped",
            severity: "info",
            reasonCodes: [`run_${runStatus}_before_stage`],
            safeMessage: "ข้ามขั้นตอนนี้ เพราะงานหยุดก่อนถึงขั้นตอนนี้",
            nextAction: "ตรวจขั้นตอนที่ล้มเหลวหรือถูกยกเลิกก่อนหน้า",
          },
        };
      }
      return {
        ...existing,
        order,
      };
    }
    let status = "queued";
    if (isTerminal && runStatus === "completed") status = "completed";
    else if (isTerminal && runStatus !== "completed" && order < currentOrder)
      status = "completed";
    else if (isTerminal && runStatus !== "completed" && order > currentOrder)
      status = "skipped";
    else if (order < currentOrder) status = "completed";
    else if (order === currentOrder || stageKey === currentStage)
      status = runStatus;
    return {
      stageKey,
      label: autoReviewStageLabel(stageKey),
      order,
      status,
      detail:
        status === "queued"
          ? { safeMessage: "รอทำขั้นตอนนี้" }
          : status === "skipped"
            ? {
                state: "skipped",
                severity: "info",
                reasonCodes: [`run_${runStatus}_before_stage`],
                safeMessage: "ข้ามขั้นตอนนี้ เพราะงานหยุดก่อนถึงขั้นตอนนี้",
                nextAction: "ตรวจขั้นตอนที่ล้มเหลวหรือถูกยกเลิกก่อนหน้า",
              }
            : status === "completed"
              ? { safeMessage: "ทำขั้นตอนนี้แล้ว" }
              : (run?.statusDetail ?? null),
      qaVerdictRefs: [],
      repairRefs: [],
      evidenceRefs: [],
      credit: {},
      outputLinks: [],
    };
  });
}

function getAutoReviewTimelineItems(run: any): any[] {
  const apiItems = Array.isArray(run?.apiProjection?.timeline?.items)
    ? run.apiProjection.timeline.items
    : [];
  if (apiItems.length > 0) {
    return attachAutoReviewStageDebugOutput(
      run,
      buildAutoReviewTimelineFallback(run, apiItems)
    );
  }

  const directItems = Array.isArray(run?.timeline?.items)
    ? run.timeline.items
    : [];
  if (directItems.length > 0) {
    return attachAutoReviewStageDebugOutput(
      run,
      buildAutoReviewTimelineFallback(run, directItems)
    );
  }

  const stages = Array.isArray(run?.stages)
    ? run.stages.map(normalizeAutoReviewStageItem)
    : [];
  return attachAutoReviewStageDebugOutput(
    run,
    buildAutoReviewTimelineFallback(run, stages)
  );
}

function getAutoReviewLockedAnchors(run: any) {
  const metadata = asRecord(run?.metadataJson ?? run?.metadata);
  const apiProjection = asRecord(run?.apiProjection);
  const anchors = asRecord(
    metadata.referenceAnchors ??
      apiProjection.referenceAnchors ??
      run?.referenceAnchors
  );
  return [
    {
      role: "Product",
      url: compactText(anchors.productImageUrl),
      ref: firstCompactText(
        anchors.productImageRef,
        anchors.productImageId,
        anchors.productImageHash
      ),
      source: firstCompactText(
        anchors.productImageSource,
        anchors.productSource
      ),
      hash: firstCompactText(anchors.productImageHash, anchors.productHash),
    },
    {
      role: "Character",
      url: compactText(anchors.characterImageUrl),
      ref: firstCompactText(
        anchors.characterImageRef,
        anchors.characterImageUploadKey,
        anchors.characterImageHash
      ),
      source: firstCompactText(
        anchors.characterImageSource,
        anchors.characterSource
      ),
      hash: firstCompactText(anchors.characterImageHash, anchors.characterHash),
    },
    {
      role: "Environment",
      url: compactText(anchors.environmentImageUrl),
      ref: firstCompactText(
        anchors.environmentImageRef,
        anchors.environmentImageUploadKey,
        anchors.environmentImageHash
      ),
      source: firstCompactText(
        anchors.environmentImageSource,
        anchors.environmentSource
      ),
      hash: firstCompactText(
        anchors.environmentImageHash,
        anchors.environmentHash
      ),
    },
  ].filter(anchor => anchor.url || anchor.ref || anchor.hash || anchor.source);
}

function getAutoReviewAutomationSummary(run: any) {
  const automation = asRecord(run?.apiProjection?.automation);
  const controlPlane = asRecord(automation.controlPlane);
  const lease = asRecord(controlPlane.lease);
  const provider = asRecord(automation.providerReconciliation);
  const repair = asRecord(automation.targetedRepairPolicyLedger);
  const artifactManifest = asRecord(automation.qaArtifactManifest);
  const mediaInspection = asRecord(automation.mediaArtifactInspection);
  const durableRuntime = asRecord(automation.durableRuntimePlan);
  const qualityMode = asRecord(automation.qualityModePolicy);
  const creativeMemory = asRecord(automation.creativePerformanceMemory);
  const metrics = asRecord(automation.metrics);
  return [
    {
      label: "Control",
      value:
        compactText(controlPlane.status) ||
        shortAuditRef(compactText(lease.leaseId)),
    },
    {
      label: "Provider",
      value: compactText(provider.status),
    },
    {
      label: "Repair",
      value: compactText(repair.status),
    },
    {
      label: "QA cache",
      value:
        typeof metrics.qaCacheEntryCount === "number"
          ? String(metrics.qaCacheEntryCount)
          : "",
    },
    {
      label: "Runtime",
      value: compactText(durableRuntime.status),
    },
    {
      label: "Mode",
      value: compactText(qualityMode.mode),
    },
    {
      label: "Media proof",
      value: compactText(mediaInspection.status),
    },
    {
      label: "Memory",
      value: compactText(creativeMemory.status),
    },
    {
      label: "Artifacts",
      value: compactText(artifactManifest.status),
    },
  ].filter(item => compactText(item.value));
}

function startMediaDrag(
  event: DragEvent<HTMLElement>,
  asset: {
    url: string;
    title?: string;
    mediaType: ProductMediaTab;
    source: string;
    metadata?: Record<string, unknown>;
  }
) {
  event.dataTransfer.effectAllowed =
    asset.mediaType === "image" ? "copy" : "none";
  event.dataTransfer.setData(PRODUCT_MEDIA_DRAG_MIME, JSON.stringify(asset));
  event.dataTransfer.setData("text/uri-list", asset.url);
  event.dataTransfer.setData("text/plain", asset.url);
}

function readDroppedMedia(event: DragEvent<HTMLElement>): {
  url: string;
  title?: string;
  mediaType?: ProductMediaTab;
  source?: string;
  metadata?: Record<string, unknown>;
} | null {
  const raw = event.dataTransfer.getData(PRODUCT_MEDIA_DRAG_MIME);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const url = compactText(parsed.url);
      if (url) return { ...parsed, url };
    } catch {
      // Fall back to URL/text below.
    }
  }
  const url = compactText(
    event.dataTransfer.getData("text/uri-list") ||
      event.dataTransfer.getData("text/plain")
  );
  return url ? { url, mediaType: "image", source: "dragged_url" } : null;
}

function readDroppedFiles(event: DragEvent<HTMLElement>): File[] {
  return Array.from(event.dataTransfer.files ?? []).filter(
    file => Boolean(file.name) || file.size > 0
  );
}

function inferImageFileType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  return "application/octet-stream";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

function inferImageFileTypeFromUrl(url: string): string {
  const dataMatch = url.match(/^data:([^;,]+)[;,]/i);
  if (dataMatch?.[1]) return dataMatch[1].toLowerCase();
  try {
    const pathname = new URL(url, globalThis.location?.href).pathname;
    const ext = pathname.split(".").pop()?.toLowerCase();
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "png") return "image/png";
    if (ext === "gif") return "image/gif";
    if (ext === "webp") return "image/webp";
    if (ext === "svg") return "image/svg+xml";
  } catch {
    // Keep the generic fallback below.
  }
  return "application/octet-stream";
}

function extensionForImageFileType(fileType: string): string {
  if (fileType === "image/jpeg") return "jpg";
  if (fileType === "image/png") return "png";
  if (fileType === "image/gif") return "gif";
  if (fileType === "image/webp") return "webp";
  if (fileType === "image/svg+xml") return "svg";
  return "png";
}

function safeAnchorImageFileName(
  title: string | undefined,
  url: string,
  fileType: string
): string {
  const fallback = `reference.${extensionForImageFileType(fileType)}`;
  const rawName =
    compactText(title) ||
    (() => {
      try {
        return decodeURIComponent(
          new URL(url, globalThis.location?.href).pathname.split("/").pop() ||
            ""
        );
      } catch {
        return "";
      }
    })() ||
    fallback;
  const sanitized = rawName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const ext = extensionForImageFileType(fileType);
  return `${sanitized || "reference"}.${ext}`;
}

function imageDataUrlToBlob(url: string, anchorLabel: string): Blob {
  const match = url.match(/^data:([^;,]+)(;base64)?,(.*)$/i);
  const fileType = match?.[1]?.toLowerCase() ?? "";
  if (!match || !PRODUCT_IMAGE_UPLOAD_TYPES.has(fileType)) {
    throw new Error(
      `${anchorLabel}: dropped data URL is not a supported image`
    );
  }
  const payload = match[3] ?? "";
  const bytes = match[2]
    ? Uint8Array.from(atob(payload), char => char.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  return new Blob([bytes], { type: fileType });
}

function anchorFileFromBlob(
  blob: Blob,
  media: { url: string; title?: string },
  fileType: string,
  anchorLabel: string
): File {
  if (!PRODUCT_IMAGE_UPLOAD_TYPES.has(fileType)) {
    throw new Error(`${anchorLabel}: dropped media is not a supported image`);
  }
  if (blob.size > PRODUCT_IMAGE_UPLOAD_MAX_BYTES) {
    throw new Error(`${anchorLabel}: dropped image is larger than 10MB`);
  }
  return new File(
    [blob],
    safeAnchorImageFileName(media.title, media.url, fileType),
    { type: fileType, lastModified: Date.now() }
  );
}

async function fetchMediaUrlAsAnchorFile(
  media: { url: string; title?: string },
  anchorLabel: string
): Promise<File> {
  if (/^data:image\//i.test(media.url)) {
    const blob = imageDataUrlToBlob(media.url, anchorLabel);
    return anchorFileFromBlob(
      blob,
      media,
      compactText(blob.type).toLowerCase(),
      anchorLabel
    );
  }

  let requestUrl: URL;
  try {
    requestUrl = new URL(media.url, globalThis.location?.href);
  } catch {
    throw new Error(`${anchorLabel}: dropped image URL is invalid`);
  }
  const sameOrigin = requestUrl.origin === globalThis.location?.origin;
  const response = await fetch(requestUrl.href, {
    credentials: sameOrigin ? "include" : "omit",
  });
  if (!response.ok) {
    throw new Error(`${anchorLabel}: could not read the dropped image`);
  }
  const blob = await response.blob();
  const headerType = compactText(response.headers.get("content-type"))
    .split(";")[0]
    .trim()
    .toLowerCase();
  const fileType =
    compactText(blob.type).toLowerCase() ||
    headerType ||
    inferImageFileTypeFromUrl(media.url);
  if (!PRODUCT_IMAGE_UPLOAD_TYPES.has(fileType)) {
    throw new Error(`${anchorLabel}: dropped media is not a supported image`);
  }
  return anchorFileFromBlob(blob, media, fileType, anchorLabel);
}

function ProductMediaCard({
  asset,
  isAttaching = false,
  isDeleting = false,
  onAttachImage,
  onDelete,
}: {
  asset: ProductMediaAsset;
  isAttaching?: boolean;
  isDeleting?: boolean;
  onAttachImage?: (asset: ProductMediaAsset) => void | Promise<void>;
  onDelete?: (asset: ProductMediaAsset) => void | Promise<void>;
}) {
  const canDragToProduct = asset.mediaType === "image";
  return (
    <article
      className="overflow-hidden rounded-lg border bg-white shadow-sm"
      draggable={canDragToProduct}
      onDragStart={event => startMediaDrag(event, asset)}
      title={canDragToProduct ? "Drag to product images" : undefined}
    >
      <div className="relative aspect-video bg-slate-100">
        {asset.mediaType === "image" ? (
          <img
            src={asset.url}
            alt={asset.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : asset.mediaType === "video" ? (
          <video
            src={asset.url}
            className="h-full w-full object-cover"
            muted
            playsInline
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">
            {mediaIcon(asset.mediaType)}
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
          {mediaTabLabel(asset.mediaType)}
        </span>
        {onDelete ? (
          <button
            type="button"
            className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-100 bg-white/95 text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            title="Delete from Media Library"
            aria-label={`Delete ${asset.title} from Media Library`}
            disabled={isDeleting}
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              void onDelete(asset);
            }}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        ) : null}
      </div>
      <div className="space-y-1 p-2">
        <p className="line-clamp-2 text-xs font-medium text-slate-800">
          {asset.title}
        </p>
        <p className="truncate text-[11px] text-slate-500">{asset.source}</p>
        {canDragToProduct && onAttachImage ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1 h-7 w-full gap-1 text-xs"
            disabled={isAttaching}
            onClick={() => void onAttachImage(asset)}
          >
            <PackagePlus className="h-3.5 w-3.5" />
            Attach as product image
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function AutoReviewRefChip({
  value,
  className,
  labelMax = 44,
}: {
  value: string;
  className: string;
  labelMax?: number;
}) {
  const href = autoReviewRefHref(value);
  const label = shortAuditRef(value, labelMax);
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={`${className} inline-flex items-center gap-1 hover:underline`}
      >
        <ExternalLink className="h-3 w-3 shrink-0" />
        {label}
      </a>
    );
  }
  return <span className={className}>{label}</span>;
}

export default function MarketplaceCaptureProductDetail() {
  const { t } = useScopedTranslation(["common"]);
  const hyperframesCopy = getMarketplaceHyperframesUiCopy();
  const [location] = useLocation();
  const productId = getProductId(location);
  const [panelTab, setPanelTab] = useState<ProductPanelTab>("product");
  const [mediaTab, setMediaTab] = useState<ProductMediaTab>("image");
  const [productFilterEnabled, setProductFilterEnabled] = useState(true);
  const [libraryPageIndex, setLibraryPageIndex] = useState(0);
  const [libraryPanelItems, setLibraryPanelItems] = useState<any[]>([]);
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [productEditForm, setProductEditForm] = useState<ProductEditForm>({
    productName: "",
    descriptionText: "",
    priceCurrent: "",
    commissionRatePercent: "",
    productPageUrl: "",
    soldCountText: "",
    capturedCategoryText: "",
    shopName: "",
    productCategory: "auto",
    ratingScore: "",
    reviewCountText: "",
  });
  const [deletedLibraryItemIds, setDeletedLibraryItemIds] = useState<
    Set<number>
  >(() => new Set());
  const [deletingLibraryItemId, setDeletingLibraryItemId] = useState<
    number | null
  >(null);
  const [isDropActive, setIsDropActive] = useState(false);
  const [autoReviewOutputMode, setAutoReviewOutputMode] =
    useState<AutoReviewOutputMode>("storyboard_images");
  const [autoReviewFrameStrategy, setAutoReviewFrameStrategy] =
    useState<AutoReviewFrameStrategy>("storyboard_3x3_split");
  const [autoReviewAudioStrategy, setAutoReviewAudioStrategy] =
    useState<AutoReviewAudioStrategy>("native_video_audio");
  const [autoReviewShotCount, setAutoReviewShotCount] =
    useState<AutoReviewShotCount>(9);
  const [autoReviewOverlayTextMode, setAutoReviewOverlayTextMode] =
    useState<AutoReviewOverlayTextMode>("no_text");
  const [autoReviewImageModel, setAutoReviewImageModel] =
    useState<AutoReviewImageModel>("google-banana-2");
  const [autoReviewMcpConnectionId, setAutoReviewMcpConnectionId] = useState<
    string | null
  >(null);
  const [autoReviewMcpSharedGroupId, setAutoReviewMcpSharedGroupId] = useState<
    number | null
  >(null);
  const [autoReviewLaunchMode, setAutoReviewLaunchMode] =
    useState<MarketplaceAutoReviewLaunchMode>("auto_storyboard_review");
  const [showAutoStoryboardAdvanced, setShowAutoStoryboardAdvanced] =
    useState(false);
  const [autoStoryboardOverrides, setAutoStoryboardOverrides] =
    useState<HyperframesAutoPlanOverrideInput>(() =>
      loadStoredAutoStoryboardOverrides()
    );
  const [pendingAutoReviewAction, setPendingAutoReviewAction] =
    useState<AutoReviewStartAction | null>(null);
  const [showAutoReviewRuns, setShowAutoReviewRuns] = useState(false);
  const [showAutoReviewHistory, setShowAutoReviewHistory] = useState(false);
  const [optimisticAutoStoryboardStart, setOptimisticAutoStoryboardStart] =
    useState(false);
  const [collapsedAutoReviewRunIds, setCollapsedAutoReviewRunIds] = useState<
    Set<string>
  >(() => new Set());
  const [collapsedAutoReviewPanelIds, setCollapsedAutoReviewPanelIds] =
    useState<Set<string>>(() => new Set());
  const [suppressedAutoReviewRunIds, setSuppressedAutoReviewRunIds] = useState<
    Set<string>
  >(() => new Set());
  const [previewAutoReviewImage, setPreviewAutoReviewImage] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [activeAnchorDrop, setActiveAnchorDrop] =
    useState<AutoReviewAnchorDropRole | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const characterAnchorUploadInputRef = useRef<HTMLInputElement | null>(null);
  const environmentAnchorUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedProductImageId, setSelectedProductImageId] = useState<
    string | null
  >(null);
  const [optimisticProductImage, setOptimisticProductImage] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [imageDimensions, setImageDimensions] = useState<
    Record<string, ImageDimensions>
  >({});
  const [characterAnchor, setCharacterAnchor] =
    useState<UploadedReferenceAnchor | null>(null);
  const [environmentAnchor, setEnvironmentAnchor] =
    useState<UploadedReferenceAnchor | null>(null);
  const [autoReviewCharacterMode, setAutoReviewCharacterMode] =
    useState<AutoReviewCharacterMode>("hands_only");
  const [autoReviewCharacterGender, setAutoReviewCharacterGender] =
    useState("female");
  const [autoReviewCharacterAge, setAutoReviewCharacterAge] =
    useState("young_adult_20_29");
  const [autoReviewCharacterAppearance, setAutoReviewCharacterAppearance] =
    useState("thai");
  const [autoReviewCharacterRole, setAutoReviewCharacterRole] =
    useState("reviewer");
  const [autoReviewCharacterStyle, setAutoReviewCharacterStyle] =
    useState("friendly_everyday");
  const [autoReviewTone, setAutoReviewTone] =
    useState<AutoReviewReviewTone>("");
  const [autoReviewStorytellingStructure, setAutoReviewStorytellingStructure] =
    useState<AutoReviewStorytellingStructure>("");
  const [autoReviewCreativePresets, setAutoReviewCreativePresets] = useState<
    AutoReviewCreativePresetSelection[]
  >([]);
  const [
    autoReviewPrimaryCharacterDetails,
    setAutoReviewPrimaryCharacterDetails,
  ] = useState("");
  const [
    autoReviewSecondaryCharacterDetails,
    setAutoReviewSecondaryCharacterDetails,
  ] = useState("");
  const [autoReviewPropDetails, setAutoReviewPropDetails] = useState("");
  const suppressAddImageToastRef = useRef(false);
  const requestedLibraryPageRef = useRef(0);
  const utils = trpc.useUtils();
  const tenantFeatureFlags = useTenantFeatureFlags();
  const marketplaceIntelligenceEnabled = MARKETPLACE_INTELLIGENCE_FEATURE_FLAGS.some(
    flag => tenantFeatureFlags[flag] === true
  );

  const product = trpc.marketplaceCapture.getProduct.useQuery(
    { productId },
    { enabled: Boolean(productId) }
  );
  const productData = product.data as any;
  const productItem = productData?.product ?? productData;
  const productInsights =
    trpc.marketplaceCapture.listInsightsByProduct.useQuery(
      { productId },
      { enabled: Boolean(productId) }
    );
  const marketplaceSnapshotsQuery =
    trpc.marketplaceIntelligence.listSnapshots.useQuery(undefined, {
      enabled: Boolean(productId) && marketplaceIntelligenceEnabled,
    });
  const marketplaceMetricEnrichmentsQuery =
    trpc.marketplaceIntelligence.listProductMetricEnrichments.useQuery(
      { productId },
      { enabled: Boolean(productId) && marketplaceIntelligenceEnabled }
    );
  const createMarketplaceMetricEnrichment =
    trpc.marketplaceIntelligence.createProductMetricEnrichment.useMutation({
      onSuccess: async () => {
        toast.success("Marketplace metric enrichment saved");
        await marketplaceMetricEnrichmentsQuery.refetch();
      },
      onError: (error: any) => {
        toast.error(error?.message || "Unable to save marketplace metric enrichment");
      },
    });
  const imageMediaModelsQuery = trpc.mediaModels.list.useQuery({
    type: "image",
  });
  const videoMediaModelsQuery = trpc.mediaModels.list.useQuery({
    type: "video",
  });
  const mcpConnectionsQuery = trpc.mcpConnections.listConnections.useQuery(
    undefined,
    { retry: false }
  );
  const eligibleImageMcpProviderKeys = useMemo(
    () =>
      new Set(
        (mcpConnectionsQuery.data ?? [])
          .filter(connection => {
            if (connection.status !== "connected") return false;
            return (
              !connection.allowedAssetTypes?.length ||
              connection.allowedAssetTypes.includes("image")
            );
          })
          .map(connection => String(connection.providerKey ?? "").trim())
          .filter(Boolean)
      ),
    [mcpConnectionsQuery.data]
  );
  const eligibleVideoMcpProviderKeys = useMemo(
    () =>
      new Set(
        (mcpConnectionsQuery.data ?? [])
          .filter(connection => {
            if (connection.status !== "connected") return false;
            return (
              !connection.allowedAssetTypes?.length ||
              connection.allowedAssetTypes.includes("video")
            );
          })
          .map(connection => String(connection.providerKey ?? "").trim())
          .filter(Boolean)
      ),
    [mcpConnectionsQuery.data]
  );
  useEffect(() => {
    persistStoredAutoStoryboardOverrides(autoStoryboardOverrides);
  }, [autoStoryboardOverrides]);
  const autoReviewImageModelRecords = useMemo(
    () => (imageMediaModelsQuery.data?.models as any[] | undefined) ?? [],
    [imageMediaModelsQuery.data?.models]
  );
  const autoReviewVideoModelRecords = useMemo(
    () => (videoMediaModelsQuery.data?.models as any[] | undefined) ?? [],
    [videoMediaModelsQuery.data?.models]
  );
  const autoReviewImageModelById = useMemo(() => {
    const map = new Map<string, any>();
    for (const model of autoReviewImageModelRecords) {
      const modelId = String(model?.modelId ?? "").trim();
      if (modelId) map.set(modelId, model);
    }
    return map;
  }, [autoReviewImageModelRecords]);
  const resolveAutoReviewImageModelTransport = useCallback(
    (modelId: string) => {
      const model = autoReviewImageModelById.get(modelId);
      return resolveMediaModelTransportConfig({
        provider: model?.provider,
        modelId,
        configJson: model?.configJson,
      });
    },
    [autoReviewImageModelById]
  );
  const autoReviewVideoModelById = useMemo(() => {
    const map = new Map<string, any>();
    for (const model of autoReviewVideoModelRecords) {
      const modelId = String(model?.modelId ?? "").trim();
      if (modelId) map.set(modelId, model);
    }
    return map;
  }, [autoReviewVideoModelRecords]);
  const resolveAutoReviewVideoModelTransport = useCallback(
    (modelId: string) => {
      const model = autoReviewVideoModelById.get(modelId);
      return resolveMediaModelTransportConfig({
        provider: model?.provider,
        modelId,
        configJson: model?.configJson,
      });
    },
    [autoReviewVideoModelById]
  );
  const autoReviewImageModelOptions = useMemo(() => {
    return autoReviewImageModelRecords
      .map(model => {
        const modelId = String(model?.modelId ?? "").trim();
        if (!modelId) return null;
        const transport = resolveMediaModelTransportConfig({
          provider: model?.provider,
          modelId,
          configJson: model?.configJson,
        });
        if (
          transport.transport === "mcp" &&
          (!transport.providerKey ||
            !eligibleImageMcpProviderKeys.has(transport.providerKey))
        ) {
          return null;
        }
        const provider = String(
          model?.provider ?? transport.providerKey ?? ""
        ).trim();
        const routeLabel = transport.transport === "mcp" ? "MCP" : "API";
        const providerLabel = provider ? ` • ${provider}` : "";
        return {
          value: modelId,
          label: String(model?.name ?? modelId),
          description:
            String(model?.description ?? "").trim() ||
            `${routeLabel}${providerLabel}`,
          provider,
          transport: transport.transport,
          providerKey: transport.providerKey ?? null,
          creditCost:
            typeof model?.creditCost === "number" ? model.creditCost : null,
        };
      })
      .filter(Boolean) as Array<{
      value: string;
      label: string;
      description: string;
      provider: string;
      transport: "gateway_api" | "mcp";
      providerKey: string | null;
      creditCost: number | null;
    }>;
  }, [autoReviewImageModelRecords, eligibleImageMcpProviderKeys]);
  const autoReviewVideoModelOptions = useMemo(() => {
    return autoReviewVideoModelRecords
      .map(model => {
        const modelId = String(model?.modelId ?? "").trim();
        if (!modelId) return null;
        const transport = resolveMediaModelTransportConfig({
          provider: model?.provider,
          modelId,
          configJson: model?.configJson,
        });
        if (
          transport.transport === "mcp" &&
          (!transport.providerKey ||
            !eligibleVideoMcpProviderKeys.has(transport.providerKey))
        ) {
          return null;
        }
        const provider = String(
          model?.provider ?? transport.providerKey ?? ""
        ).trim();
        const routeLabel = transport.transport === "mcp" ? "MCP" : "API";
        const providerLabel = provider ? ` • ${provider}` : "";
        return {
          value: modelId,
          label: String(model?.name ?? modelId),
          description:
            String(model?.description ?? "").trim() ||
            `${routeLabel}${providerLabel}`,
          provider,
          transport: transport.transport,
          providerKey: transport.providerKey ?? null,
          creditCost:
            typeof model?.creditCost === "number" ? model.creditCost : null,
        };
      })
      .filter(Boolean) as Array<{
      value: string;
      label: string;
      description: string;
      provider: string;
      transport: "gateway_api" | "mcp";
      providerKey: string | null;
      creditCost: number | null;
    }>;
  }, [autoReviewVideoModelRecords, eligibleVideoMcpProviderKeys]);
  useEffect(() => {
    if (!autoReviewImageModelOptions.length) return;
    if (
      !autoReviewImageModelOptions.some(
        option => option.value === autoReviewImageModel
      )
    ) {
      setAutoReviewImageModel(autoReviewImageModelOptions[0].value);
    }
  }, [autoReviewImageModel, autoReviewImageModelOptions]);
  useEffect(() => {
    const overrideImageModel = String(
      autoStoryboardOverrides.imageModel ?? ""
    ).trim();
    if (!overrideImageModel || !autoReviewImageModelOptions.length) return;
    if (
      autoReviewImageModelOptions.some(
        option => option.value === overrideImageModel
      )
    ) {
      return;
    }
    setAutoStoryboardOverrides(previous => {
      if (!previous.imageModel) return previous;
      const next = { ...previous };
      delete next.imageModel;
      return next;
    });
  }, [autoReviewImageModelOptions, autoStoryboardOverrides.imageModel]);
  useEffect(() => {
    const overrideVideoModel = String(
      autoStoryboardOverrides.videoModel ?? ""
    ).trim();
    if (!overrideVideoModel || !autoReviewVideoModelOptions.length) return;
    if (
      autoReviewVideoModelOptions.some(
        option => option.value === overrideVideoModel
      )
    ) {
      return;
    }
    setAutoStoryboardOverrides(previous => {
      if (!previous.videoModel) return previous;
      const next = { ...previous };
      delete next.videoModel;
      return next;
    });
  }, [autoReviewVideoModelOptions, autoStoryboardOverrides.videoModel]);
  const buildAutoReviewTransportMetadata = useCallback(
    (imageModelId: string, videoModelId?: string) => {
      const imageTransport = resolveAutoReviewImageModelTransport(imageModelId);
      const videoTransport = videoModelId
        ? resolveAutoReviewVideoModelTransport(videoModelId)
        : null;
      const transport =
        imageTransport.transport === "mcp"
          ? imageTransport
          : videoTransport?.transport === "mcp"
            ? videoTransport
            : null;
      if (!transport) return undefined;
      return {
        transport: "mcp" as const,
        connectionId: autoReviewMcpConnectionId ?? undefined,
        mcpConnectionId: autoReviewMcpConnectionId ?? undefined,
        sharedGroupId: autoReviewMcpSharedGroupId ?? undefined,
      };
    },
    [
      autoReviewMcpConnectionId,
      autoReviewMcpSharedGroupId,
      resolveAutoReviewImageModelTransport,
      resolveAutoReviewVideoModelTransport,
    ]
  );
  const autoStoryboardPlanQuery =
    trpc.marketplaceCapture.getAutoStoryboardReviewPlan.useQuery(
      { productId, overrides: autoStoryboardOverrides },
      {
        enabled: Boolean(productId),
        refetchOnMount: "always",
        refetchOnWindowFocus: true,
        staleTime: 30_000,
      }
    );
  const autoStoryboardPlan = autoStoryboardPlanQuery.data?.plan ?? null;
  const autoStoryboardPlanLoading =
    autoStoryboardPlanQuery.isLoading && !autoStoryboardPlan;
  const autoStoryboardPlanHadError = Boolean(
    autoStoryboardPlanQuery.error || autoStoryboardPlanQuery.failureCount > 0
  );
  const autoStoryboardPlanErrored =
    autoStoryboardPlanHadError && !autoStoryboardPlan;
  const autoStoryboardPlanRetrying =
    autoStoryboardPlanErrored && autoStoryboardPlanQuery.isFetching;
  const showAutoStoryboardReviewSurface = shouldShowAutoStoryboardReviewSurface(
    autoStoryboardPlan,
    {
      loading: autoStoryboardPlanLoading,
      error: autoStoryboardPlanErrored,
    }
  );
  const effectiveAutoReviewLaunchMode = resolveMarketplaceAutoReviewLaunchMode({
    current: autoReviewLaunchMode,
    plan: autoStoryboardPlan,
    loading: autoStoryboardPlanLoading,
    error: autoStoryboardPlanErrored,
  });
  const autoStoryboardPlanMatchesCurrentOverrides =
    autoStoryboardPlanMatchesOverrides(
      autoStoryboardPlan,
      autoStoryboardOverrides
    );
  const autoStoryboardPlanRefreshingForOverrides = Boolean(
    autoStoryboardPlan && !autoStoryboardPlanMatchesCurrentOverrides
  );
  const selectedStandardImageModelTransport =
    resolveAutoReviewImageModelTransport(autoReviewImageModel);
  const selectedStandardImageModelProviderKey =
    selectedStandardImageModelTransport.transport === "mcp"
      ? (selectedStandardImageModelTransport.providerKey ?? null)
      : null;
  const autoStoryboardSelectedImageModel = String(
    autoStoryboardOverrides.imageModel ??
      autoStoryboardPlan?.defaults?.imageModel ??
      "google-banana-2"
  );
  const autoStoryboardSelectedVideoModel = String(
    autoStoryboardOverrides.videoModel ??
      autoStoryboardPlan?.defaults?.videoModel ??
      "veo3/generate-veo-3-video-lite"
  );
  const selectedAutoStoryboardImageModelTransport =
    resolveAutoReviewImageModelTransport(autoStoryboardSelectedImageModel);
  const selectedAutoStoryboardVideoModelTransport =
    resolveAutoReviewVideoModelTransport(autoStoryboardSelectedVideoModel);
  const selectedAutoStoryboardImageModelProviderKey =
    selectedAutoStoryboardImageModelTransport.transport === "mcp"
      ? (selectedAutoStoryboardImageModelTransport.providerKey ?? null)
      : null;
  const selectedAutoStoryboardVideoModelProviderKey =
    selectedAutoStoryboardVideoModelTransport.transport === "mcp"
      ? (selectedAutoStoryboardVideoModelTransport.providerKey ?? null)
      : null;
  const selectedAutoStoryboardMcpProviderKey =
    selectedAutoStoryboardImageModelProviderKey ??
    selectedAutoStoryboardVideoModelProviderKey;
  const autoStoryboardVideoSegmentTransportMetadata = useMemo(
    () =>
      buildAutoReviewTransportMetadata(
        autoStoryboardSelectedImageModel,
        autoStoryboardSelectedVideoModel
      ),
    [
      autoStoryboardSelectedImageModel,
      autoStoryboardSelectedVideoModel,
      buildAutoReviewTransportMetadata,
    ]
  );
  const shouldLoadAutoReviewRuns =
    Boolean(productId) &&
    (showAutoReviewRuns ||
      Boolean(pendingAutoReviewAction) ||
      optimisticAutoStoryboardStart ||
      effectiveAutoReviewLaunchMode === "auto_storyboard_review");
  const autoReviewRunsQueryInput = useMemo(
    () => ({ productId, limit: showAutoReviewHistory ? 8 : 3, summary: true }),
    [productId, showAutoReviewHistory]
  );
  const shouldPollAutoReviewRunStart =
    Boolean(pendingAutoReviewAction) || optimisticAutoStoryboardStart;
  const autoReviewRuns = trpc.marketplaceCapture.listAutoReviewRuns.useQuery(
    autoReviewRunsQueryInput,
    {
      enabled: shouldLoadAutoReviewRuns,
      refetchInterval: query => {
        const runs = ((query.state.data as any[]) ?? []) as any[];
        if (runs.some(isAutoReviewRunBlockingStart)) {
          return AUTO_REVIEW_RUN_ACTIVE_POLL_MS;
        }
        return shouldPollAutoReviewRunStart
          ? AUTO_REVIEW_RUN_START_WAIT_POLL_MS
          : false;
      },
      refetchOnMount: "always",
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      staleTime: shouldPollAutoReviewRunStart ? 0 : AUTO_REVIEW_RUN_STALE_MS,
    }
  );
  const mediaHistory = trpc.media.listTasks.useQuery(
    { mediaType: mediaTab, limit: 60 },
    {
      enabled: Boolean(productId) && panelTab === "history",
      refetchInterval: panelTab === "history" ? 30000 : false,
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    }
  );
  const libraryItems = trpc.library.listDocuments.useQuery(
    {
      query: productFilterEnabled ? productId : undefined,
      scope: "all",
      sort: "created_desc",
      limit: MEDIA_PANEL_LIBRARY_PAGE_SIZE,
      offset: libraryPageIndex * MEDIA_PANEL_LIBRARY_PAGE_SIZE,
      filters: {
        itemType: mediaTab,
      },
    },
    {
      enabled: Boolean(productId) && panelTab === "library",
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    }
  );
  useEffect(() => {
    requestedLibraryPageRef.current = 0;
    setLibraryPageIndex(0);
    setLibraryPanelItems([]);
    setDeletedLibraryItemIds(new Set());
  }, [mediaTab, productFilterEnabled, productId]);

  useEffect(() => {
    const results = (libraryItems.data?.results ?? []) as any[];
    requestedLibraryPageRef.current = libraryPageIndex;
    setLibraryPanelItems(previous => {
      if (libraryPageIndex === 0) return results;
      const byId = new Map<number, any>();
      for (const item of previous) byId.set(Number(item.id), item);
      for (const item of results) byId.set(Number(item.id), item);
      return Array.from(byId.values());
    });
  }, [libraryItems.data?.results, libraryPageIndex]);

  const uploadMutation = trpc.ai.upload.useMutation();
  const deleteLibraryItemMutation = trpc.library.deleteItem.useMutation();
  const addProductImageMutation =
    trpc.marketplaceCapture.addProductImageFromUrl.useMutation({
      onSuccess: async result => {
        const image = asRecord((result as Record<string, unknown>).image);
        const imageUrl = compactText(image.url);
        const imageId = compactText(image.id) || imageUrl;
        if (imageUrl) {
          setOptimisticProductImage(image);
        }
        if (imageId) {
          setSelectedProductImageId(imageId);
        }
        await Promise.all([
          utils.marketplaceCapture.getProduct.invalidate({ productId }),
          utils.marketplaceCapture.listProductImages.invalidate(),
        ]);
        if (!suppressAddImageToastRef.current) {
          toast.success(
            result.created
              ? "Added image to product"
              : "This image is already attached"
          );
        }
      },
      onError: error => toast.error(error.message),
      onSettled: () => setPendingAutoReviewAction(null),
    });
  const removeProductImageMutation =
    trpc.marketplaceCapture.removeProductImage.useMutation({
      onSuccess: async () => {
        await Promise.all([
          utils.marketplaceCapture.getProduct.invalidate({ productId }),
          utils.marketplaceCapture.listProductImages.invalidate(),
        ]);
        toast.success("Removed image from product");
      },
      onError: error => toast.error(error.message),
    });
  const setProductHeroImageMutation =
    trpc.marketplaceCapture.setProductHeroImage.useMutation({
      onSuccess: async () => {
        await Promise.all([
          utils.marketplaceCapture.getProduct.invalidate({ productId }),
          utils.marketplaceCapture.listProductImages.invalidate(),
        ]);
        toast.success("ตั้งรูป Hero / Default image แล้ว");
      },
      onError: error => toast.error(error.message),
    });
  const updateProductDetailsMutation =
    trpc.marketplaceCapture.updateProductDetails.useMutation({
      onSuccess: async () => {
        await Promise.all([
          utils.marketplaceCapture.getProduct.invalidate({ productId }),
          utils.marketplaceCapture.listProducts.invalidate(),
        ]);
        setIsEditingProduct(false);
        toast.success("บันทึกข้อมูลสินค้าแล้ว");
      },
      onError: error => toast.error(error.message),
    });
  const enhanceProductDescriptionMutation =
    trpc.marketplaceCapture.enhanceProductDescription.useMutation({
      onSuccess: async result => {
        setProductEditForm(current => ({
          ...current,
          descriptionText: result.descriptionText ?? current.descriptionText,
        }));
        await Promise.all([
          utils.marketplaceCapture.getProduct.invalidate({ productId }),
          utils.marketplaceCapture.listProducts.invalidate(),
        ]);
        toast.success("เติมรายละเอียด Description แล้ว");
      },
      onError: error => toast.error(error.message),
    });
  const analyzeProductInsightsMutation =
    trpc.marketplaceCapture.analyzeProductInsights.useMutation({
      onSuccess: async result => {
        await Promise.all([
          utils.marketplaceCapture.listInsightsByProduct.invalidate({
            productId,
          }),
          utils.marketplaceCapture.getProduct.invalidate({ productId }),
        ]);
        toast.success(
          `วิเคราะห์ AI Insights แล้ว (${result.count ?? 0} records)`
        );
      },
      onError: error => toast.error(error.message),
    });
  const startAutoReviewMutation =
    trpc.marketplaceCapture.startAutoReview.useMutation({
      onSuccess: async (result: any) => {
        const startedRunKeys = autoReviewRunIdentityKeys(result);
        if (startedRunKeys.length > 0) {
          setSuppressedAutoReviewRunIds(previous => {
            const next = new Set(previous);
            for (const key of startedRunKeys) next.delete(key);
            return next;
          });
        }
        await Promise.all([
          utils.marketplaceCapture.listAutoReviewRuns.invalidate(),
          utils.marketplaceCapture.getProduct.invalidate({ productId }),
        ]);
        setShowAutoReviewRuns(true);
        setShowAutoReviewHistory(false);
        setCollapsedAutoReviewRunIds(new Set());
        setCollapsedAutoReviewPanelIds(new Set());
        toast.success(
          result?.productionRunId
            ? "เริ่มสร้างรีวิวสินค้าอัตโนมัติแล้ว"
            : "เริ่มงานแล้ว"
        );
      },
      onError: error => toast.error(error.message),
      onSettled: () => setPendingAutoReviewAction(null),
    });
  const startAutoStoryboardReviewMutation =
    trpc.marketplaceCapture.startAutoStoryboardReview.useMutation({
      onSuccess: async result => {
        const startedRunKeys = autoReviewRunIdentityKeys(result.run);
        if (startedRunKeys.length > 0) {
          setSuppressedAutoReviewRunIds(previous => {
            const next = new Set(previous);
            for (const key of startedRunKeys) next.delete(key);
            return next;
          });
        }
        await Promise.all([
          utils.marketplaceCapture.listAutoReviewRuns.invalidate(),
          utils.marketplaceCapture.getProduct.invalidate({ productId }),
          utils.marketplaceCapture.getAutoStoryboardReviewPlan.invalidate({
            productId,
          }),
        ]);
        setShowAutoReviewRuns(true);
        setShowAutoReviewHistory(false);
        setOptimisticAutoStoryboardStart(false);
        toast.success("เริ่ม Auto Storyboard Review แล้ว");
      },
      onError: error => {
        setOptimisticAutoStoryboardStart(false);
        toast.error(error.message);
      },
    });
  const selectAutoReviewImageAttemptMutation =
    trpc.marketplaceCapture.selectAutoReviewImageAttemptForStoryboardReview.useMutation(
      {
        onSuccess: async (result: any) => {
          await Promise.all([
            utils.marketplaceCapture.listAutoReviewRuns.invalidate(),
            utils.marketplaceCapture.getProduct.invalidate({ productId }),
          ]);
          setShowAutoReviewRuns(true);
          setShowAutoReviewHistory(false);
          const storyboardUrl = compactText(result?.links?.storyboardReview);
          toast.success(
            storyboardUrl
              ? "ใช้ภาพชุดที่เลือกสร้าง Storyboard Review แล้ว"
              : "เลือกภาพชุดนี้สำหรับ Storyboard Review แล้ว"
          );
        },
        onError: error => toast.error(error.message),
      }
    );
  const advanceAutoReviewMutation =
    trpc.marketplaceCapture.advanceAutoReviewRun.useMutation({
      onSuccess: async () => {
        await autoReviewRuns.refetch();
        toast.success("อัปเดตสถานะงานแล้ว");
      },
      onError: error => toast.error(error.message),
    });
  const cancelAutoReviewMutation =
    trpc.marketplaceCapture.cancelAutoReviewRun.useMutation({
      onSuccess: async () => {
        await autoReviewRuns.refetch();
        toast.success("ยกเลิกงานแล้ว");
      },
      onError: error => toast.error(error.message),
    });

  const item = (productItem ?? {}) as Record<string, unknown>;
  const itemDescription = asRecord(item.descriptionJson);
  const itemSpecs = asRecord(item.specsJson);
  const itemPlatformRaw = asRecord(item.platformRawJson);
  const commissionCheckUrl =
    safeHttpUrl(
      itemPlatformRaw.commissionCheckUrl ||
        itemPlatformRaw.latestCommissionCheckUrl ||
        itemPlatformRaw.offerUrl ||
        itemPlatformRaw.offerSpecificUrl
    ) ||
    (compactText(item.platform) === "shopee" &&
    compactText(item.externalProductId)
      ? `https://affiliate.shopee.co.th/offer/product_offer/${compactText(item.externalProductId)}`
      : "");
  const productPageUrl = marketplaceProductPageUrl(item, itemPlatformRaw);
  const sourceUrl = safeHttpUrl(item.sourceUrl);
  const capturedCategoryText = firstCompactText(
    itemDescription.categoryText,
    itemSpecs.categoryText,
    itemPlatformRaw.categoryText,
    itemPlatformRaw.category
  );
  const mainProductCategory = firstCompactText(
    item.productCategory,
    itemDescription.productCategory,
    itemSpecs.productCategory,
    itemPlatformRaw.productCategory,
    itemPlatformRaw.latestProductCategory
  );
  const categoryPath = firstCategoryPathParts(
    itemDescription.categoryPath,
    itemDescription.categoryPathText,
    itemSpecs.categoryPath,
    itemSpecs.categoryPathText,
    itemPlatformRaw.categoryPath,
    itemPlatformRaw.categoryPathText,
    itemPlatformRaw.marketplaceCategoryPath,
    itemPlatformRaw.breadcrumbs
  );
  const marketplaceIntelligenceKeyword = firstCompactText(
    item.productName,
    itemPlatformRaw.productName,
    capturedCategoryText,
    item.shopName,
    item.externalProductId,
    productId
  );
  const marketplaceIntelligenceHref = `/marketplace-capture/intelligence?keyword=${encodeURIComponent(marketplaceIntelligenceKeyword || productId)}&sourceProductId=${encodeURIComponent(productId)}&auto=1`;
  const marketplaceIntelligenceEvidence = [
    {
      label: "Price",
      value: `${compactText(item.priceCurrent) || "-"} ${compactText(item.currency) || "THB"}`,
    },
    {
      label: "Sold",
      value: formatCount(item.soldCountNormalized as any, item.soldCountText as any),
    },
    {
      label: "Rating",
      value: compactText(item.ratingScore) || "-",
    },
    {
      label: "Reviews",
      value: formatCount(item.reviewCountText as any, itemPlatformRaw.reviewCountNormalized as any),
    },
  ];
  const marketplaceSnapshots = marketplaceSnapshotsQuery.data?.snapshots ?? [];
  const marketplaceMetricEnrichments = marketplaceMetricEnrichmentsQuery.data ?? [];
  const productExternalProductId = compactText(item.externalProductId);
  const productExternalShopId = compactText(item.externalShopId);
  const matchingMarketplaceSnapshotItem = useMemo(() => {
    if (!productExternalProductId) return null;
    for (const snapshot of marketplaceSnapshots) {
      const match = (snapshot.items ?? []).find((snapshotItem: any) => {
        const itemIdMatches = String(snapshotItem.itemId ?? "") === productExternalProductId;
        const shopIdMatches = productExternalShopId
          ? String(snapshotItem.shopId ?? "") === productExternalShopId
          : true;
        return itemIdMatches && shopIdMatches;
      });
      if (match) return { snapshot, item: match };
    }
    return null;
  }, [marketplaceSnapshots, productExternalProductId, productExternalShopId]);
  const productFormFromCurrent = useCallback(
    (): ProductEditForm => ({
      productName: compactText(item.productName),
      descriptionText: compactText(item.descriptionText),
      priceCurrent: compactDisplayValue(item.priceCurrent),
      commissionRatePercent: compactDisplayValue(item.commissionRatePercent),
      productPageUrl,
      soldCountText: compactText(item.soldCountText),
      capturedCategoryText,
      shopName: compactText(item.shopName),
      productCategory: PRODUCT_REFERENCE_CATEGORY_LABELS[mainProductCategory]
        ? (mainProductCategory as ProductReferenceCategory)
        : "auto",
      ratingScore: compactDisplayValue(item.ratingScore),
      reviewCountText: compactText(item.reviewCountText),
    }),
    [
      capturedCategoryText,
      item.commissionRatePercent,
      item.descriptionText,
      item.priceCurrent,
      item.productName,
      item.ratingScore,
      item.reviewCountText,
      item.shopName,
      item.soldCountText,
      mainProductCategory,
      productPageUrl,
    ]
  );
  useEffect(() => {
    if (!isEditingProduct) setProductEditForm(productFormFromCurrent());
  }, [isEditingProduct, productFormFromCurrent]);
  function updateProductEditField<Key extends keyof ProductEditForm>(
    key: Key,
    value: ProductEditForm[Key]
  ) {
    setProductEditForm(current => ({ ...current, [key]: value }));
  }
  function saveProductEdits() {
    updateProductDetailsMutation.mutate({ productId, data: productEditForm });
  }
  const baseImages = (productData?.images ?? []) as any[];
  const images = useMemo(() => {
    if (!optimisticProductImage) return baseImages;
    const optimisticUrl = compactText(optimisticProductImage.url);
    const optimisticId = compactText(optimisticProductImage.id);
    const alreadyLoaded = baseImages.some(image => {
      const imageRecord = asRecord(image);
      return (
        (optimisticId && compactText(imageRecord.id) === optimisticId) ||
        (optimisticUrl && compactText(imageRecord.url) === optimisticUrl)
      );
    });
    return alreadyLoaded ? baseImages : [...baseImages, optimisticProductImage];
  }, [baseImages, optimisticProductImage]);
  const coverImageAssetId = compactText(item.coverImageAssetId);
  const heroProductImageId = compactText(itemPlatformRaw.heroProductImageId);
  const heroProductImageUrl = compactText(itemPlatformRaw.heroProductImageUrl);
  const heroProductImage = useMemo(() => {
    const matched = images.find(
      (image: any) =>
        (heroProductImageId && compactText(image?.id) === heroProductImageId) ||
        (heroProductImageUrl &&
          compactText(image?.url) === heroProductImageUrl) ||
        (coverImageAssetId &&
          compactText(image?.captureAssetId) === coverImageAssetId)
    );
    return (
      matched ??
      images.find(
        (image: any) => asRecord(image?.metadataJson).role === "hero"
      ) ??
      null
    );
  }, [coverImageAssetId, heroProductImageId, heroProductImageUrl, images]);
  const history = (productData?.history ?? []) as any[];
  const health = productData?.health;
  const insights = [...((productInsights.data as any[] | undefined) ?? [])];
  const autoReviewRunItems = (autoReviewRuns.data ?? []) as any[];
  const activeAutoReviewRun = autoReviewRunItems.find(run =>
    isAutoReviewRunBlockingStart(run)
  );
  const isStartingAutoReviewRun =
    Boolean(pendingAutoReviewAction) ||
    startAutoReviewMutation.isPending ||
    startAutoStoryboardReviewMutation.isPending ||
    optimisticAutoStoryboardStart;
  const hideOldTerminalAutoReviewRuns =
    isStartingAutoReviewRun && !showAutoReviewHistory;
  const latestAutoReviewRunId = compactText(autoReviewRunItems[0]?.id);
  const defaultAutoReviewRunItems = autoReviewRunItems.filter(
    (run, index) =>
      !isAutoReviewRunSuppressed(run, suppressedAutoReviewRunIds) &&
      (!hideOldTerminalAutoReviewRuns || isAutoReviewRunBlockingStart(run)) &&
      (index === 0 || isAutoReviewRunBlockingStart(run))
  );
  const visibleAutoReviewRunItems = showAutoReviewHistory
    ? autoReviewRunItems
    : defaultAutoReviewRunItems;
  const latestVisibleAutoReviewRun = visibleAutoReviewRunItems[0];
  const isHidingPreviousAutoReviewFailures =
    (suppressedAutoReviewRunIds.size > 0 || hideOldTerminalAutoReviewRuns) &&
    !showAutoReviewHistory &&
    visibleAutoReviewRunItems.length === 0;
  const statusAutoReviewRun = activeAutoReviewRun ?? latestVisibleAutoReviewRun;
  const statusTimelineItems = statusAutoReviewRun
    ? getAutoReviewTimelineItems(statusAutoReviewRun)
    : [];
  const statusProjection = statusAutoReviewRun
    ? getAutoReviewTimelineProjection(statusAutoReviewRun)
    : {};
  const statusProjectionDetail = asRecord(statusProjection.statusDetail);
  const statusAutoReviewRunMetadata = asRecord(
    statusAutoReviewRun?.metadataJson
  );
  const statusAutoReviewRunStoryboardFrameCount = Array.isArray(
    statusAutoReviewRunMetadata.storyboardFrameUrls
  )
    ? statusAutoReviewRunMetadata.storyboardFrameUrls.filter(Boolean).length
    : 0;
  const statusAutoReviewRunHasSelectableBestAttempt = Array.isArray(
    statusAutoReviewRunMetadata.imageAttemptReviews
  )
    ? statusAutoReviewRunMetadata.imageAttemptReviews.some(review => {
        const reviewRecord = asRecord(review);
        return (
          reviewRecord.selectionEligible !== false &&
          Array.isArray(reviewRecord.storyboardFrameUrls) &&
          reviewRecord.storyboardFrameUrls.filter(Boolean).length >= 3
        );
      })
    : false;
  const statusAutoReviewRunBestAttemptHint =
    statusAutoReviewRunStoryboardFrameCount >= 3 &&
    statusAutoReviewRunHasSelectableBestAttempt &&
    statusProjectionDetail.state === "frame_vision_qa_repairing"
      ? "ภาพครบแล้ว ระบบกำลังเลือกภาพที่ดีที่สุดเพื่อส่งเข้า Storyboard Review"
      : "";
  const statusAutoReviewRunState = statusAutoReviewRun
    ? autoReviewStateFamily({
        status: statusAutoReviewRun.status,
        detail: statusProjectionDetail,
        stageKey:
          statusProjection.currentStage ?? statusAutoReviewRun.currentStage,
      })
    : null;
  const statusAutoReviewRunUpdatedAtText = statusAutoReviewRun?.updatedAt
    ? formatDiagnosticDateTime(statusAutoReviewRun.updatedAt)
    : "";
  const statusActiveTimelineItem =
    statusTimelineItems.find(item =>
      [
        "running",
        "waiting_provider",
        "qa_pending",
        "repairing",
        "awaiting_credit_authorization",
        "blocked",
        "blocked_needs_user",
        "cancelled",
        "failed",
      ].includes(String(item?.status))
    ) ??
    statusTimelineItems.find(
      item =>
        compactText(item?.stageKey) ===
        compactText(
          statusProjection.currentStage ?? statusAutoReviewRun?.currentStage
        )
    );
  const statusCompletedTimelineCount = statusTimelineItems.filter(item =>
    ["completed", "completed_with_warnings", "skipped"].includes(
      String(item?.status)
    )
  ).length;
  const statusProgressPercent =
    typeof statusProjection.progressPercent === "number"
      ? Math.round(statusProjection.progressPercent)
      : statusAutoReviewRun?.stageCount
        ? Math.round(
            (Number(statusAutoReviewRun.stageIndex || 0) /
              Number(statusAutoReviewRun.stageCount)) *
              100
          )
        : null;
  const statusNextAction = compactText(
    statusProjection.nextAction ?? statusProjectionDetail.nextAction
  );
  const optimisticAutoReviewStatusText = isStartingAutoReviewRun
    ? optimisticAutoStoryboardStart
      ? "กำลังเริ่มงาน Auto Storyboard Review และรอ backend สร้าง run ใหม่"
      : "กำลังส่งคำสั่งเริ่มงาน"
    : "";
  const statusImageTaskSummary =
    autoReviewImageTaskSummary(statusAutoReviewRun);
  const statusHyperframesRenderRef = statusAutoReviewRun
    ? hyperframesRenderRefFromAutoReviewRun(statusAutoReviewRun)
    : null;
  const statusOutputLinks = statusAutoReviewRun
    ? [
        ...(Array.isArray(statusAutoReviewRun?.apiProjection?.outputLinks)
          ? statusAutoReviewRun.apiProjection.outputLinks
          : []),
        ...(Array.isArray(statusProjection.outputLinks)
          ? statusProjection.outputLinks
          : []),
      ]
        .map(link => ({
          ...asRecord(link),
          url: normalizeAutoReviewOutputLinkUrl(link, {
            productId: statusAutoReviewRun.productId ?? productId,
            runId:
              statusHyperframesRenderRef?.runId ||
              statusAutoReviewRun.id ||
              statusAutoReviewRun.productionRunId,
            renderJobId: statusHyperframesRenderRef?.renderJobId,
          }),
        }))
        .filter(
          (link, index, links) =>
            compactText(link?.url) &&
            links.findIndex(
              candidate =>
                compactText(candidate?.url) === compactText(link?.url)
            ) === index
        )
    : [];
  const hiddenAutoReviewHistoryCount = Math.max(
    0,
    autoReviewRunItems.length - defaultAutoReviewRunItems.length
  );

  const toggleAutoReviewRunCollapsed = useCallback((runId: string) => {
    if (!runId) return;
    setCollapsedAutoReviewRunIds(previous => {
      const next = new Set(previous);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  }, []);

  const toggleAutoReviewPanelCollapsed = useCallback((panelId: string) => {
    if (!panelId) return;
    setCollapsedAutoReviewPanelIds(previous => {
      const next = new Set(previous);
      if (next.has(panelId)) next.delete(panelId);
      else next.add(panelId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!optimisticProductImage) return;
    const optimisticUrl = compactText(optimisticProductImage.url);
    const optimisticId = compactText(optimisticProductImage.id);
    if (
      baseImages.some(image => {
        const imageRecord = asRecord(image);
        return (
          (optimisticId && compactText(imageRecord.id) === optimisticId) ||
          (optimisticUrl && compactText(imageRecord.url) === optimisticUrl)
        );
      })
    ) {
      setOptimisticProductImage(null);
    }
  }, [baseImages, optimisticProductImage]);

  const historyAssets = useMemo(() => {
    const tasks = (mediaHistory.data?.tasks ?? []) as any[];
    return tasks
      .filter(task => !productFilterEnabled || taskMatchesProduct(task, item))
      .map(task => {
        const url = extractTaskResultUrl(task);
        if (!url) return null;
        return {
          url,
          title: extractTaskTitle(task),
          mediaType: mediaTab,
          source: "Media History",
          createdAt: task.createdAt ?? task.created_at ?? null,
          metadata: {
            taskId: task.id ?? task.taskId ?? null,
            providerTaskId: task.taskId ?? null,
            parameters: task.parameters ?? null,
          },
        };
      })
      .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
  }, [item, mediaHistory.data?.tasks, mediaTab, productFilterEnabled]);

  const libraryAssets = useMemo(() => {
    return libraryPanelItems
      .filter(libraryItem => !deletedLibraryItemIds.has(Number(libraryItem.id)))
      .filter(
        libraryItem =>
          !productFilterEnabled || libraryItemMatchesProduct(libraryItem, item)
      )
      .map(libraryItem => {
        const url = getLibraryItemUrl(libraryItem);
        if (!url) return null;
        return {
          url,
          title: compactText(libraryItem.title) || "Library media",
          mediaType: mediaTab,
          source: "Library",
          createdAt: libraryItem.created_at ?? libraryItem.createdAt ?? null,
          metadata: {
            libraryItemId: libraryItem.id,
            source: libraryItem.source,
            metadata: libraryItem.metadata ?? null,
          },
        };
      })
      .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
  }, [
    deletedLibraryItemIds,
    item,
    libraryPanelItems,
    mediaTab,
    productFilterEnabled,
  ]);

  const copyAffiliateLink = () => {
    const affiliateUrl = compactText(item.affiliateUrl);
    if (affiliateUrl && navigator.clipboard)
      void navigator.clipboard
        .writeText(affiliateUrl)
        .then(() => toast.success("Affiliate link copied"));
  };

  const uploadProductImageFiles = useCallback(
    async (
      files: File[],
      source: "product_detail_upload" | "product_detail_drag_drop_upload"
    ) => {
      if (files.length === 0) return;

      const imageFiles = files
        .map(file => ({ file, fileType: inferImageFileType(file) }))
        .filter(({ file, fileType }) => {
          if (!PRODUCT_IMAGE_UPLOAD_TYPES.has(fileType)) {
            toast.error(`${file.name} is not a supported image type`);
            return false;
          }
          if (file.size > PRODUCT_IMAGE_UPLOAD_MAX_BYTES) {
            toast.error(`${file.name} is larger than 10MB`);
            return false;
          }
          return true;
        });
      if (imageFiles.length === 0) return;

      let attachedCount = 0;
      let duplicateCount = 0;
      try {
        suppressAddImageToastRef.current = imageFiles.length > 1;
        for (const { file, fileType } of imageFiles) {
          const fileBase64 = await readFileAsDataUrl(file);
          const uploaded = await uploadMutation.mutateAsync({
            fileName: file.name,
            fileType,
            fileBase64,
          });
          if (!uploaded.url) {
            throw new Error(`Upload response missing URL for ${file.name}`);
          }
          const attachResult = await addProductImageMutation.mutateAsync({
            productId,
            url: uploaded.url,
            type: "main",
            title: file.name,
            source,
            originalSourceUrl: uploaded.url,
            metadata: {
              source,
              fileName: file.name,
              fileType,
              fileSizeBytes: file.size,
              storageKey: uploaded.key,
            },
          });
          if (attachResult.created) attachedCount += 1;
          else duplicateCount += 1;
        }
        if (imageFiles.length > 1) {
          toast.success(
            duplicateCount > 0
              ? `Uploaded ${attachedCount} new images (${duplicateCount} already attached)`
              : `Uploaded and attached ${attachedCount} images`
          );
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to upload product image"
        );
      } finally {
        suppressAddImageToastRef.current = false;
      }
    },
    [addProductImageMutation, productId, uploadMutation]
  );

  const handleDropImage = useCallback(
    async (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDropActive(false);
      const files = readDroppedFiles(event);
      if (files.length > 0) {
        await uploadProductImageFiles(files, "product_detail_drag_drop_upload");
        return;
      }
      const media = readDroppedMedia(event);
      if (!media?.url) return;
      if (media.mediaType && media.mediaType !== "image") {
        toast.error("Only images can be attached to product images");
        return;
      }
      try {
        await addProductImageMutation.mutateAsync({
          productId,
          url: media.url,
          type: "main",
          title: media.title,
          source: media.source ?? "product_detail_drag_drop",
          originalSourceUrl: media.url,
          metadata: media.metadata,
        });
      } catch {
        // Mutation onError displays the user-facing message.
      }
    },
    [addProductImageMutation, productId, uploadProductImageFiles]
  );

  const attachPanelAssetAsProductImage = useCallback(
    async (asset: ProductMediaAsset) => {
      if (asset.mediaType !== "image") {
        toast.error("Only images can be attached to product images");
        return;
      }
      try {
        await addProductImageMutation.mutateAsync({
          productId,
          url: asset.url,
          type: "main",
          title: asset.title,
          source: asset.source || "product_detail_panel_action",
          originalSourceUrl: asset.url,
          metadata: asset.metadata,
        });
      } catch {
        // Mutation onError displays the user-facing message.
      }
    },
    [addProductImageMutation, productId]
  );

  const deletePanelLibraryAsset = useCallback(
    async (asset: ProductMediaAsset) => {
      const libraryItemId = Number(asset.metadata?.libraryItemId);
      if (!Number.isFinite(libraryItemId) || libraryItemId <= 0) {
        toast.error(
          "Cannot delete this Library item because its id is missing"
        );
        return;
      }
      const confirmed = window.confirm(
        `ลบ "${asset.title}" ออกจาก Media Library?`
      );
      if (!confirmed) return;

      setDeletingLibraryItemId(libraryItemId);
      setDeletedLibraryItemIds(previous =>
        new Set(previous).add(libraryItemId)
      );
      setLibraryPanelItems(previous =>
        previous.filter(item => Number(item.id) !== libraryItemId)
      );
      try {
        await deleteLibraryItemMutation.mutateAsync({ id: libraryItemId });
        await utils.library.listDocuments.invalidate();
        toast.success("ลบรายการออกจาก Media Library แล้ว");
      } catch (error) {
        setDeletedLibraryItemIds(previous => {
          const next = new Set(previous);
          next.delete(libraryItemId);
          return next;
        });
        await utils.library.listDocuments.invalidate();
        toast.error(
          error instanceof Error
            ? error.message
            : "ลบรายการ Media Library ไม่สำเร็จ"
        );
      } finally {
        setDeletingLibraryItemId(null);
      }
    },
    [deleteLibraryItemMutation, utils.library.listDocuments]
  );

  const handleMediaPanelScroll = useCallback(
    (event: SyntheticEvent<HTMLDivElement>) => {
      if (panelTab !== "library") return;
      if (!libraryItems.data?.has_more || libraryItems.isFetching) return;
      const element = event.currentTarget;
      const distanceToBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      if (distanceToBottom > 240) return;
      if (requestedLibraryPageRef.current > libraryPageIndex) return;
      requestedLibraryPageRef.current = libraryPageIndex + 1;
      setLibraryPageIndex(current => current + 1);
    },
    [
      libraryItems.data?.has_more,
      libraryItems.isFetching,
      libraryPageIndex,
      panelTab,
    ]
  );

  const handleUploadProductImages = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      await uploadProductImageFiles(files, "product_detail_upload");
    },
    [uploadProductImageFiles]
  );

  const removeProductImage = useCallback(
    (imageId: string) => {
      const ok = window.confirm(
        "Remove this image from the product? The original media file will stay in History/Library."
      );
      if (!ok) return;
      removeProductImageMutation.mutate({ productId, imageId });
    },
    [productId, removeProductImageMutation]
  );

  const setProductImageAsHero = useCallback(
    (imageId: string) => {
      if (!imageId) return;
      setProductHeroImageMutation.mutate({ productId, imageId });
      setSelectedProductImageId(imageId);
    },
    [productId, setProductHeroImageMutation]
  );

  const productImageOptions = useMemo(
    () =>
      images
        .map((image: any, index: number) => {
          const url = compactText(image?.url);
          const rawId = image?.id == null ? "" : String(image.id).trim();
          const id = rawId || `${url}-${index}`;
          const metadata = asRecord(image?.metadataJson ?? image?.metadata);
          return {
            id,
            url,
            type: compactText(image?.type) || "product image",
            source:
              compactText(metadata.source) ||
              compactText(image?.source) ||
              "marketplace_product_image",
            sourceUrl: firstCompactText(
              metadata.originalSourceUrl,
              metadata.sourceUrl,
              image?.originalSourceUrl,
              image?.sourceUrl
            ),
            storageKey: firstCompactText(
              metadata.storageKey,
              metadata.uploadKey,
              image?.storageKey,
              image?.key
            ),
            hash: firstCompactText(
              metadata.sha256,
              metadata.hash,
              metadata.sourceHash,
              metadata.contentHash,
              image?.sha256,
              image?.hash
            ),
            isHero: Boolean(
              (heroProductImageId && id === heroProductImageId) ||
              (heroProductImageUrl && url === heroProductImageUrl) ||
              (coverImageAssetId &&
                compactText(image?.captureAssetId) === coverImageAssetId) ||
              metadata.role === "hero"
            ),
            index,
            removableId: rawId,
          };
        })
        .filter(image => image.url),
    [coverImageAssetId, heroProductImageId, heroProductImageUrl, images]
  );
  const selectedProductImage = useMemo(() => {
    if (!selectedProductImageId) return null;
    return (
      productImageOptions.find(image => image.id === selectedProductImageId) ??
      null
    );
  }, [productImageOptions, selectedProductImageId]);
  const resolvedProductAnchorImage =
    selectedProductImage ??
    productImageOptions.find(image => image.isHero) ??
    productImageOptions[0] ??
    null;
  const resolvedProductAnchorImageUrl = compactText(
    resolvedProductAnchorImage?.url
  );
  const resolvedProductAnchorImageDimensions = resolvedProductAnchorImage
    ? imageDimensions[resolvedProductAnchorImage.id]
    : undefined;
  const autoStoryboardVideoSegmentPreviewInput = useMemo(
    () => ({
      productId,
      overrides: autoStoryboardOverrides,
      transportMetadata: autoStoryboardVideoSegmentTransportMetadata,
      referenceAnchors: {
        schemaVersion: 1,
        creationIntent: "auto_review_video" as const,
        productImageUrl: resolvedProductAnchorImageUrl || undefined,
        creativePresets: autoReviewCreativePresets,
      },
    }),
    [
      autoReviewCreativePresets,
      autoStoryboardOverrides,
      autoStoryboardVideoSegmentTransportMetadata,
      productId,
      resolvedProductAnchorImageUrl,
    ]
  );
  const autoStoryboardVideoSegmentPreviewQuery =
    trpc.marketplaceCapture.getVideoSegmentPlanPreview.useQuery(
      autoStoryboardVideoSegmentPreviewInput,
      {
        enabled:
          Boolean(productId) &&
          Boolean(resolvedProductAnchorImageUrl) &&
          effectiveAutoReviewLaunchMode === "auto_storyboard_review",
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      }
    );
  const productDiagnosticsRows = [
    {
      label: t("marketplaceCapture.productDiagnostics.productId"),
      value: compactDisplayValue(item.id) || productId || "-",
    },
    {
      label: t("marketplaceCapture.productDiagnostics.platform"),
      value: compactDisplayValue(item.platform) || "-",
    },
    {
      label: t("marketplaceCapture.productDiagnostics.productName"),
      value: firstCompactText(item.productName, item.title, item.name) || "-",
    },
    {
      label: t("marketplaceCapture.productDiagnostics.category"),
      value:
        mainProductCategory ||
        capturedCategoryText ||
        categoryPath.join(" > ") ||
        "-",
    },
    {
      label: t("marketplaceCapture.productDiagnostics.access"),
      value: compactDisplayValue(item.accessType) || "owner",
    },
    {
      label: t("marketplaceCapture.productDiagnostics.images"),
      value: String(productImageOptions.length),
    },
    {
      label: t("marketplaceCapture.productDiagnostics.snapshots"),
      value: String(health?.snapshotCount ?? history.length),
    },
    {
      label: t("marketplaceCapture.productDiagnostics.health"),
      value: compactDisplayValue(health?.status) || "ok",
    },
    {
      label: t("marketplaceCapture.productDiagnostics.autoReviewRuns"),
      value: String(autoReviewRunItems.length),
    },
    {
      label: t("marketplaceCapture.productDiagnostics.lastChecked"),
      value: formatDiagnosticDateTime(health?.lastCheckedAt),
    },
    {
      label: t("marketplaceCapture.productDiagnostics.updated"),
      value: formatDiagnosticDateTime(item.updatedAt),
    },
  ];
  const characterAnchorUrl = compactText(characterAnchor?.url);
  const environmentAnchorUrl = compactText(environmentAnchor?.url);
  const selectedCharacterMode = AUTO_REVIEW_CHARACTER_MODES.find(
    option => option.id === autoReviewCharacterMode
  );
  const selectedReviewTone = AUTO_REVIEW_REVIEW_TONES.find(
    option => option.id === autoReviewTone
  );
  const selectedStorytellingStructure =
    AUTO_REVIEW_STORYTELLING_STRUCTURES.find(
      option => option.id === autoReviewStorytellingStructure
    );
  const selectedCreativePresetLabels = autoReviewCreativePresets
    .map(selection =>
      AUTO_REVIEW_CREATIVE_PRESET_OPTIONS.find(
        option =>
          option.id === selection.presetId && option.family === selection.family
      )
    )
    .filter((option): option is AutoReviewCreativePresetChoice =>
      Boolean(option)
    )
    .map(option => option.label);
  const selectedAudioCreativePreset = autoReviewCreativePresets.find(
    selection => selection.family === "audio_preset"
  );
  const selectAutoReviewCreativePreset = useCallback(
    (family: AutoReviewCreativePresetFamily, presetId: string) => {
      const nextSelections =
        presetId === ""
          ? autoReviewCreativePresets.filter(item => item.family !== family)
          : [
              ...autoReviewCreativePresets.filter(
                item => item.family !== family
              ),
              { family, presetId },
            ];
      setAutoReviewCreativePresets(nextSelections);
      if (family === "audio_preset") {
        const requestedAudioStrategy =
          autoReviewCreativePresetRequestedAudioStrategy(nextSelections);
        setAutoStoryboardOverrides(previous => {
          const next = { ...previous };
          if (requestedAudioStrategy) {
            next.audioStrategy = requestedAudioStrategy;
          } else {
            delete next.audioStrategy;
          }
          return next;
        });
      }
      if (family === "segment_structure_preset") {
        setAutoStoryboardOverrides(previous => {
          const next = { ...previous };
          const videoStructureMode =
            AUTO_REVIEW_SEGMENT_PRESET_VIDEO_STRUCTURE[presetId];
          if (videoStructureMode) {
            next.videoStructureMode = videoStructureMode;
          } else {
            delete next.videoStructureMode;
            delete next.manualVideoGroupSize;
          }
          return next;
        });
      }
    },
    [autoReviewCreativePresets]
  );
  const autoReviewCharacterBrief = useMemo(() => {
    const genderLabel = optionLabel(
      AUTO_REVIEW_CHARACTER_GENDERS,
      autoReviewCharacterGender
    );
    const ageLabel = optionLabel(
      AUTO_REVIEW_CHARACTER_AGES,
      autoReviewCharacterAge
    );
    const appearanceLabel = optionLabel(
      AUTO_REVIEW_CHARACTER_APPEARANCES,
      autoReviewCharacterAppearance
    );
    const roleLabel = optionLabel(
      AUTO_REVIEW_CHARACTER_ROLES,
      autoReviewCharacterRole
    );
    const styleLabel = optionLabel(
      AUTO_REVIEW_CHARACTER_STYLES,
      autoReviewCharacterStyle
    );
    const primaryCharacterDetails = compactText(
      autoReviewPrimaryCharacterDetails
    );
    const secondaryCharacterDetails = compactText(
      autoReviewSecondaryCharacterDetails
    );
    const propDetails = compactText(autoReviewPropDetails);
    const describedSummary = compactStringList([
      `${appearanceLabel} ${genderLabel}, ${ageLabel}, role ${roleLabel}, style ${styleLabel}.`,
      primaryCharacterDetails
        ? `Character 1 additional details: ${primaryCharacterDetails}.`
        : null,
      secondaryCharacterDetails
        ? `Character 2 details: ${secondaryCharacterDetails}.`
        : null,
      propDetails ? `Prop details: ${propDetails}.` : null,
    ]).join(" ");

    return {
      mode: autoReviewCharacterMode,
      gender: autoReviewCharacterGender,
      genderLabel,
      age: autoReviewCharacterAge,
      ageLabel,
      appearance: autoReviewCharacterAppearance,
      appearanceLabel,
      role: autoReviewCharacterRole,
      roleLabel,
      style: autoReviewCharacterStyle,
      styleLabel,
      ...(primaryCharacterDetails ? { primaryCharacterDetails } : {}),
      ...(secondaryCharacterDetails ? { secondaryCharacterDetails } : {}),
      ...(propDetails ? { propDetails } : {}),
      summary:
        autoReviewCharacterMode === "product_only"
          ? "Product-only review. Do not generate a visible person."
          : autoReviewCharacterMode === "hands_only"
            ? "Hands-only product review. Use hands or non-face body framing only; do not generate a recurring face."
            : autoReviewCharacterMode === "uploaded_reference"
              ? "Use the uploaded character reference as the identity source of truth."
              : describedSummary,
    };
  }, [
    autoReviewCharacterAge,
    autoReviewCharacterAppearance,
    autoReviewCharacterGender,
    autoReviewCharacterMode,
    autoReviewCharacterRole,
    autoReviewCharacterStyle,
    autoReviewPrimaryCharacterDetails,
    autoReviewPropDetails,
    autoReviewSecondaryCharacterDetails,
  ]);
  const canStartAutoReview = Boolean(
    resolvedProductAnchorImageUrl &&
    (autoReviewCharacterMode !== "uploaded_reference" || characterAnchorUrl)
  );
  const missingAutoReviewAnchors = useMemo(() => {
    const missing: string[] = [];
    if (!resolvedProductAnchorImageUrl) missing.push("Product image anchor");
    if (
      autoReviewCharacterMode === "uploaded_reference" &&
      !characterAnchorUrl
    ) {
      missing.push("Character/person reference");
    }
    return missing;
  }, [
    autoReviewCharacterMode,
    resolvedProductAnchorImageUrl,
    characterAnchorUrl,
  ]);

  useEffect(() => {
    if (
      selectedProductImageId &&
      productImageOptions.some(image => image.id === selectedProductImageId)
    ) {
      return;
    }
    const heroOption = productImageOptions.find(image => image.isHero);
    setSelectedProductImageId(
      heroOption?.id ??
        (productImageOptions.length === 1 ? productImageOptions[0].id : null)
    );
  }, [productImageOptions, selectedProductImageId]);

  const rememberImageDimensions = useCallback(
    (key: string, event: SyntheticEvent<HTMLImageElement>) => {
      const width = event.currentTarget.naturalWidth;
      const height = event.currentTarget.naturalHeight;
      if (!key || !width || !height) return;
      setImageDimensions(current => {
        const previous = current[key];
        if (previous?.width === width && previous.height === height) {
          return current;
        }
        return { ...current, [key]: { width, height } };
      });
    },
    []
  );

  const uploadAnchorFile = useCallback(
    async (
      file: File,
      setAnchor: (anchor: UploadedReferenceAnchor) => void,
      anchorRole: "character" | "environment",
      anchorLabel: string,
      sourceMode: "upload" | "drag_drop" | "media_panel_drag_drop" = "upload"
    ) => {
      const fileType = inferImageFileType(file);
      if (!PRODUCT_IMAGE_UPLOAD_TYPES.has(fileType)) {
        toast.error(
          `${anchorLabel}: ${file.name} is not a supported image type`
        );
        return;
      }
      if (file.size > PRODUCT_IMAGE_UPLOAD_MAX_BYTES) {
        toast.error(`${anchorLabel}: ${file.name} is larger than 10MB`);
        return;
      }

      try {
        const [fileBase64, fileHash] = await Promise.all([
          readFileAsDataUrl(file),
          sha256File(file),
        ]);
        const uploaded = await uploadMutation.mutateAsync({
          fileName: file.name,
          fileType,
          fileBase64,
        });
        if (!uploaded.url) {
          throw new Error(`Upload response missing URL for ${file.name}`);
        }
        setAnchor({
          url: uploaded.url,
          uploadKey: uploaded.key ?? null,
          hash: fileHash,
          source: `${anchorRole}_anchor_${sourceMode}`,
          fileName: file.name,
          fileType,
          fileSizeBytes: file.size,
        });
        toast.success(`${anchorLabel}: uploaded`);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : `Failed to upload ${anchorLabel.toLowerCase()}`
        );
      }
    },
    [uploadMutation]
  );

  const handleUploadAnchorImage = useCallback(
    async (
      event: ChangeEvent<HTMLInputElement>,
      setAnchor: (anchor: UploadedReferenceAnchor) => void,
      anchorRole: "character" | "environment",
      anchorLabel: string
    ) => {
      const file = (event.target.files ?? [])[0];
      event.target.value = "";
      if (!file) return;
      await uploadAnchorFile(file, setAnchor, anchorRole, anchorLabel);
    },
    [uploadAnchorFile]
  );

  const handleDropAnchorImage = useCallback(
    async (
      event: DragEvent<HTMLElement>,
      setAnchor: (anchor: UploadedReferenceAnchor) => void,
      anchorRole: "character" | "environment",
      anchorLabel: string
    ) => {
      event.preventDefault();
      event.stopPropagation();
      setActiveAnchorDrop(null);
      const [file] = readDroppedFiles(event);
      if (file) {
        await uploadAnchorFile(
          file,
          setAnchor,
          anchorRole,
          anchorLabel,
          "drag_drop"
        );
        return;
      }
      const media = readDroppedMedia(event);
      if (!media?.url) {
        toast.error(
          `${anchorLabel}: drop a local image file, Library image, or click to upload.`
        );
        return;
      }
      if (media.mediaType && media.mediaType !== "image") {
        toast.error(`${anchorLabel}: only image assets can be used here`);
        return;
      }
      try {
        const mediaFile = await fetchMediaUrlAsAnchorFile(media, anchorLabel);
        await uploadAnchorFile(
          mediaFile,
          setAnchor,
          anchorRole,
          anchorLabel,
          "media_panel_drag_drop"
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : `${anchorLabel}: failed to prepare dropped image`
        );
      }
    },
    [uploadAnchorFile]
  );

  const handleUploadCharacterAnchor = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      void handleUploadAnchorImage(
        event,
        setCharacterAnchor,
        "character",
        "Character anchor"
      );
    },
    [handleUploadAnchorImage]
  );

  const handleUploadEnvironmentAnchor = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      void handleUploadAnchorImage(
        event,
        setEnvironmentAnchor,
        "environment",
        "Environment anchor"
      );
    },
    [handleUploadAnchorImage]
  );

  const handleAnchorDragOver = useCallback(
    (event: DragEvent<HTMLElement>, role: AutoReviewAnchorDropRole) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setActiveAnchorDrop(role);
    },
    []
  );

  const handleAnchorDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setActiveAnchorDrop(null);
  }, []);

  const handleDropProductAnchor = useCallback(
    async (event: DragEvent<HTMLElement>) => {
      setActiveAnchorDrop(null);
      await handleDropImage(event);
    },
    [handleDropImage]
  );

  const selectProductAnchor = useCallback(
    (imageId: string) => {
      setSelectedProductImageId(imageId);
      if (selectedProductImageId !== imageId) {
        toast.success("Product anchor selected");
      }
    },
    [selectedProductImageId]
  );

  const buildAutoReviewReferenceAnchors = useCallback(
    (creationIntent: AutoReviewStartAction) => {
      const productImageRef = resolvedProductAnchorImage?.hash
        ? `product-image-sha256:${resolvedProductAnchorImage.hash}`
        : resolvedProductAnchorImage?.removableId
          ? `marketplace-product-image:${resolvedProductAnchorImage.removableId}`
          : resolvedProductAnchorImage?.id
            ? `product-image-option:${resolvedProductAnchorImage.id}`
            : null;
      const characterRef = buildUploadedAnchorRef("character", characterAnchor);
      const environmentRef = buildUploadedAnchorRef(
        "environment",
        environmentAnchor
      );
      const requiredRoles = compactStringList([
        "product",
        autoReviewCharacterMode === "described_character" ||
        autoReviewCharacterMode === "uploaded_reference"
          ? "character"
          : null,
        environmentAnchorUrl ? "environment" : null,
      ]) as ("product" | "character" | "environment")[];
      const sourceRefs = Array.from(
        new Set(
          compactStringList([
            resolvedProductAnchorImage?.removableId
              ? `product-image:${resolvedProductAnchorImage.removableId}`
              : resolvedProductAnchorImage?.id
                ? `product-image:${resolvedProductAnchorImage.id}`
                : null,
            resolvedProductAnchorImage?.hash
              ? `product-image-sha256:${resolvedProductAnchorImage.hash}`
              : null,
            characterRef,
            environmentRef,
          ])
        )
      );

      return {
        schemaVersion: 2,
        creationIntent,
        requiredRoles,
        ...(autoReviewTone ? { reviewTone: autoReviewTone } : {}),
        ...(autoReviewStorytellingStructure
          ? { storytellingStructure: autoReviewStorytellingStructure }
          : {}),
        ...(autoReviewCreativePresets.length > 0
          ? { creativePresets: autoReviewCreativePresets }
          : {}),
        characterMode: autoReviewCharacterMode,
        characterBrief: autoReviewCharacterBrief.summary,
        characterPreset: autoReviewCharacterBrief,
        lockPolicy: {
          mode: "strict_reference_anchor_lock",
          bindingPolicy:
            "user_selected_anchor_images_and_character_choices_are_generation_truth",
          product: "preserve_exact_visible_product_identity",
          character:
            autoReviewCharacterMode === "uploaded_reference"
              ? "preserve_same_person_identity_across_all_shots"
              : autoReviewCharacterMode === "described_character"
                ? "preserve_selected_character_brief_without_inventing_a_different_demographic"
                : autoReviewCharacterMode === "hands_only"
                  ? "hands_only_or_non_face_body_framing_no_recurring_face"
                  : "not_required_product_only",
          environment: environmentAnchorUrl
            ? "preserve_selected_environment_as_scene_truth"
            : "not_required_for_auto_product_review",
          multiViewReferenceSheet:
            "A single uploaded image may contain multiple views or panels of the same product, person, or environment. Treat every panel in that one file as reference evidence for the same subject, not as separate variants.",
          allowSingleFileMultiViewSheet: true,
          requireSameSubjectAcrossMultiViewPanels: true,
          allowProductRecolorOrShapeChange: false,
          allowFaceMorphingBetweenShots: false,
          allowEnvironmentReplacement: false,
          auditMetadataRequired: true,
        },
        productImageUrl: resolvedProductAnchorImageUrl,
        productImageId:
          resolvedProductAnchorImage?.removableId ||
          resolvedProductAnchorImage?.id ||
          null,
        productImageRef,
        productImageSource: resolvedProductAnchorImage?.source || null,
        productImageSourceUrl: resolvedProductAnchorImage?.sourceUrl || null,
        productImageStorageKey: resolvedProductAnchorImage?.storageKey || null,
        productImageHash: resolvedProductAnchorImage?.hash || null,
        productImageIndex: resolvedProductAnchorImage?.index ?? null,
        characterImageUrl: characterAnchorUrl || null,
        characterImageRef: characterRef,
        characterImageSource: characterAnchor?.source ?? null,
        characterImageUploadKey: characterAnchor?.uploadKey ?? null,
        characterImageHash: characterAnchor?.hash ?? null,
        characterImageFileName: characterAnchor?.fileName ?? null,
        characterImageFileType: characterAnchor?.fileType ?? null,
        characterImageFileSizeBytes: characterAnchor?.fileSizeBytes ?? null,
        environmentImageUrl: environmentAnchorUrl || null,
        environmentImageRef: environmentRef,
        environmentImageSource: environmentAnchor?.source ?? null,
        environmentImageUploadKey: environmentAnchor?.uploadKey ?? null,
        environmentImageHash: environmentAnchor?.hash ?? null,
        environmentImageFileName: environmentAnchor?.fileName ?? null,
        environmentImageFileType: environmentAnchor?.fileType ?? null,
        environmentImageFileSizeBytes: environmentAnchor?.fileSizeBytes ?? null,
        auditMetadata: {
          product: {
            source: resolvedProductAnchorImage?.source || null,
            sourceUrl: resolvedProductAnchorImage?.sourceUrl || null,
            storageKey: resolvedProductAnchorImage?.storageKey || null,
            hash: resolvedProductAnchorImage?.hash || null,
            id:
              resolvedProductAnchorImage?.removableId ||
              resolvedProductAnchorImage?.id ||
              null,
            index: resolvedProductAnchorImage?.index ?? null,
            referenceFormat: "single_image_or_single_file_multi_view_sheet",
            multiViewSheetAllowed: true,
            dimensions: resolvedProductAnchorImageDimensions ?? null,
          },
          character: {
            mode: autoReviewCharacterMode,
            brief: autoReviewCharacterBrief,
            source: characterAnchor?.source || null,
            sourceRef: characterRef,
            uploadKey: characterAnchor?.uploadKey || null,
            hash: characterAnchor?.hash || null,
            fileName: characterAnchor?.fileName || null,
            fileType: characterAnchor?.fileType || null,
            fileSizeBytes: characterAnchor?.fileSizeBytes ?? null,
            referenceFormat: characterAnchorUrl
              ? "single_image_or_single_file_multi_view_sheet"
              : "choice_preset_brief",
            multiViewSheetAllowed: true,
          },
          environment: {
            source: environmentAnchor?.source || null,
            sourceRef: environmentRef,
            uploadKey: environmentAnchor?.uploadKey || null,
            hash: environmentAnchor?.hash || null,
            fileName: environmentAnchor?.fileName || null,
            fileType: environmentAnchor?.fileType || null,
            fileSizeBytes: environmentAnchor?.fileSizeBytes ?? null,
            referenceFormat: environmentAnchorUrl
              ? "single_image_or_single_file_multi_view_sheet"
              : "not_required",
            multiViewSheetAllowed: true,
          },
        },
        fileEvidence: {
          productImage: {
            url: resolvedProductAnchorImageUrl,
            source: resolvedProductAnchorImage?.source || null,
            sourceUrl: resolvedProductAnchorImage?.sourceUrl || null,
            storageKey: resolvedProductAnchorImage?.storageKey || null,
            hash: resolvedProductAnchorImage?.hash || null,
            id:
              resolvedProductAnchorImage?.removableId ||
              resolvedProductAnchorImage?.id ||
              null,
            index: resolvedProductAnchorImage?.index ?? null,
            dimensions: resolvedProductAnchorImageDimensions ?? null,
            multiViewSheetAllowed: true,
          },
          characterImage: characterAnchorUrl
            ? {
                url: characterAnchorUrl,
                source: characterAnchor?.source || null,
                sourceRef: characterRef,
                uploadKey: characterAnchor?.uploadKey || null,
                hash: characterAnchor?.hash || null,
                fileName: characterAnchor?.fileName || null,
                fileType: characterAnchor?.fileType || null,
                fileSizeBytes: characterAnchor?.fileSizeBytes ?? null,
                multiViewSheetAllowed: true,
              }
            : null,
          environmentImage: environmentAnchorUrl
            ? {
                url: environmentAnchorUrl,
                source: environmentAnchor?.source || null,
                sourceRef: environmentRef,
                uploadKey: environmentAnchor?.uploadKey || null,
                hash: environmentAnchor?.hash || null,
                fileName: environmentAnchor?.fileName || null,
                fileType: environmentAnchor?.fileType || null,
                fileSizeBytes: environmentAnchor?.fileSizeBytes ?? null,
                multiViewSheetAllowed: true,
              }
            : null,
        },
        sourceRefs,
      };
    },
    [
      autoReviewCharacterBrief,
      autoReviewCharacterMode,
      autoReviewCreativePresets,
      autoReviewStorytellingStructure,
      autoReviewTone,
      characterAnchor,
      characterAnchorUrl,
      environmentAnchor,
      environmentAnchorUrl,
      resolvedProductAnchorImage,
      resolvedProductAnchorImageDimensions,
      resolvedProductAnchorImageUrl,
    ]
  );

  function startAutoStoryboardReview() {
    if (!productId || !autoStoryboardPlan) return;
    if (autoStoryboardPlanRefreshingForOverrides) {
      toast.info(hyperframesCopy.autoPlanUpdating);
      return;
    }
    if (!resolvedProductAnchorImageUrl) {
      toast.error(
        "Missing product anchor URL. กรุณาเลือก Hero/Product image ก่อนเริ่ม Auto Storyboard Review"
      );
      return;
    }
    if (
      autoReviewCharacterMode === "uploaded_reference" &&
      !characterAnchorUrl
    ) {
      toast.error(
        "Missing character/person reference. กรุณาอัปโหลดรูปตัวแบบ หรือเลือก Hands-only/Product-only ก่อนเริ่ม"
      );
      return;
    }
    if (
      selectedAutoStoryboardImageModelProviderKey &&
      selectedAutoStoryboardVideoModelProviderKey &&
      selectedAutoStoryboardImageModelProviderKey !==
        selectedAutoStoryboardVideoModelProviderKey
    ) {
      toast.error(
        "โมเดลภาพและโมเดลวิดีโอใช้ MCP คนละ provider กรุณาเลือก provider เดียวกัน หรือใช้ API model อย่างใดอย่างหนึ่ง"
      );
      return;
    }
    const transportMetadata = buildAutoReviewTransportMetadata(
      autoStoryboardSelectedImageModel,
      autoStoryboardSelectedVideoModel
    );
    if (
      (selectedAutoStoryboardImageModelTransport.transport === "mcp" ||
        selectedAutoStoryboardVideoModelTransport.transport === "mcp") &&
      !transportMetadata?.connectionId
    ) {
      toast.error("กรุณาเลือก MCP account สำหรับโมเดลนี้ก่อนเริ่มงาน");
      return;
    }
    if (
      autoStoryboardPlan.primaryAction.actionId ===
        "resume_auto_storyboard_review" &&
      autoStoryboardPlan.activeRunId
    ) {
      const confirmed = window.confirm(
        "พบ Auto Storyboard Review run เดิมที่ยังต่อได้\n\nยืนยันว่าต้องการดำเนินต่อจาก run เดิมนี้?"
      );
      if (!confirmed) return;
      setAutoReviewLaunchMode("auto_storyboard_review");
      setOptimisticAutoStoryboardStart(true);
      setShowAutoReviewRuns(true);
      setShowAutoReviewHistory(false);
      setCollapsedAutoReviewRunIds(previous => {
        const next = new Set(previous);
        next.delete(autoStoryboardPlan.activeRunId ?? "");
        return next;
      });
      setSuppressedAutoReviewRunIds(previous => {
        const next = new Set(previous);
        next.delete(autoStoryboardPlan.activeRunId ?? "");
        return next;
      });
      const startAttemptKey = Date.now().toString(36);
      startAutoStoryboardReviewMutation.mutate({
        productId,
        expectedPlanHash: autoStoryboardPlan.planHash,
        idempotencyKey: `hf-auto-resume:${autoStoryboardPlan.planHash}:${startAttemptKey}`,
        overrides: autoStoryboardOverrides,
        transportMetadata,
        referenceAnchors: buildAutoReviewReferenceAnchors("auto_review_video"),
      });
      return;
    }
    const confirmed = window.confirm(
      "ยืนยันเริ่ม Auto Storyboard Review ใหม่?\n\nระบบจะสร้าง run ใหม่จาก Hero/Product image ปัจจุบัน และซ่อน error จาก run เก่าไว้ระหว่างรอสถานะล่าสุด"
    );
    if (!confirmed) return;
    const startAttemptKey = Date.now().toString(36);
    setAutoReviewLaunchMode("auto_storyboard_review");
    setOptimisticAutoStoryboardStart(true);
    setShowAutoReviewRuns(true);
    setShowAutoReviewHistory(false);
    setCollapsedAutoReviewRunIds(new Set());
    setCollapsedAutoReviewPanelIds(new Set());
    setSuppressedAutoReviewRunIds(previous => {
      const next = new Set(previous);
      for (const run of autoReviewRunItems) {
        if (!isAutoReviewRunBlockingStart(run)) {
          for (const key of autoReviewRunIdentityKeys(run)) next.add(key);
        }
      }
      return next;
    });
    toast.info(
      "ส่งคำสั่งเริ่ม Auto Storyboard Review แล้ว กำลังรอ backend สร้าง run ใหม่"
    );
    void autoReviewRuns.refetch();
    startAutoStoryboardReviewMutation.mutate({
      productId,
      expectedPlanHash: autoStoryboardPlan.planHash,
      idempotencyKey: `hf-auto-start:${autoStoryboardPlan.planHash}:${startAttemptKey}`,
      overrides: autoStoryboardOverrides,
      transportMetadata,
      referenceAnchors: buildAutoReviewReferenceAnchors("auto_review_video"),
    });
  }

  const startAutoReview = useCallback(
    (action: AutoReviewStartAction) => {
      if (activeAutoReviewRun) {
        toast.error(
          "มีงาน Auto Review ที่ยังไม่จบอยู่แล้ว กรุณาเช็กสถานะ/ซ่อม/ยกเลิกงานเดิมก่อนเริ่มงานใหม่ | Existing run is still active."
        );
        return;
      }
      if (!resolvedProductAnchorImageUrl) {
        toast.error(
          "Missing product anchor URL. กรุณาเลือกภาพสินค้าที่จะใช้เป็น Anchor ก่อนเริ่ม | Product anchor image is required to start."
        );
        return;
      }
      if (
        autoReviewCharacterMode === "uploaded_reference" &&
        !characterAnchorUrl
      ) {
        toast.error(
          "Missing character/person anchor URL. กรุณาอัปโหลดรูปตัวแบบ/คนที่ใช้เป็น Anchor หรือเลือกโหมด Hands-only/Product-only ก่อนเริ่ม"
        );
        return;
      }

      const requestedOutputMode: AutoReviewOutputMode =
        action === "storyboard" ? "storyboard_images" : "full_video";
      const requestedFrameStrategy: AutoReviewFrameStrategy =
        autoReviewFrameStrategy;
      const selectedAudioStrategy: AutoReviewAudioStrategy =
        autoReviewAudioStrategy === "auto"
          ? "native_video_audio"
          : autoReviewAudioStrategy;
      const requestedAudioStrategy: AutoReviewAudioStrategy =
        selectedAudioStrategy;
      const referenceAnchors = buildAutoReviewReferenceAnchors(action);
      const transportMetadata =
        buildAutoReviewTransportMetadata(autoReviewImageModel);
      if (
        selectedStandardImageModelTransport.transport === "mcp" &&
        !transportMetadata?.connectionId
      ) {
        toast.error("กรุณาเลือก MCP account สำหรับโมเดลนี้ก่อนเริ่มงาน");
        return;
      }

      setAutoReviewOutputMode(requestedOutputMode);
      setAutoReviewFrameStrategy(requestedFrameStrategy);
      setAutoReviewAudioStrategy(requestedAudioStrategy);
      setPendingAutoReviewAction(action);
      setShowAutoReviewRuns(true);
      setShowAutoReviewHistory(false);
      setCollapsedAutoReviewRunIds(new Set());
      setCollapsedAutoReviewPanelIds(new Set());
      setSuppressedAutoReviewRunIds(
        new Set(
          autoReviewRunItems
            .flatMap(run => autoReviewRunIdentityKeys(run))
            .filter(Boolean)
        )
      );
      startAutoReviewMutation.mutate({
        productId,
        creationIntent: action,
        outputMode: requestedOutputMode,
        frameStrategy: requestedFrameStrategy,
        audioStrategy: requestedAudioStrategy,
        shotCount: autoReviewShotCount,
        overlayTextMode: autoReviewOverlayTextMode,
        imageModel: autoReviewImageModel,
        transportMetadata,
        referenceAnchors,
      });
    },
    [
      activeAutoReviewRun,
      autoReviewAudioStrategy,
      autoReviewFrameStrategy,
      autoReviewImageModel,
      autoReviewOverlayTextMode,
      autoReviewRunItems,
      autoReviewShotCount,
      autoReviewCharacterMode,
      buildAutoReviewTransportMetadata,
      buildAutoReviewReferenceAnchors,
      characterAnchorUrl,
      productId,
      resolvedProductAnchorImageUrl,
      selectedStandardImageModelTransport.transport,
      startAutoReviewMutation,
    ]
  );

  if (product.isLoading) return <main className="p-8">Loading product...</main>;
  if (!product.data) return <main className="p-8">Product not found</main>;

  const panelAssets =
    panelTab === "history"
      ? historyAssets
      : panelTab === "library"
        ? libraryAssets
        : images.map(image => ({
            url: image.url,
            title: `${image.type ?? "product image"}`,
            mediaType: "image" as const,
            source: "Product images",
            createdAt: image.createdAt,
            metadata: { marketplaceProductImageId: image.id },
          }));
  const panelLoading =
    panelTab === "history"
      ? mediaHistory.isFetching
      : panelTab === "library"
        ? libraryItems.isFetching && libraryPanelItems.length === 0
        : false;
  const isUploadingProductImage =
    uploadMutation.isPending || addProductImageMutation.isPending;
  const autoReviewStartDisabled =
    startAutoReviewMutation.isPending ||
    Boolean(activeAutoReviewRun) ||
    !canStartAutoReview;
  const autoReviewActionItems = [
    {
      action: "storyboard" as const,
      label: "Create Storyboard",
      description: "สตอรี่บอร์ด + รูป",
      icon: Sparkles,
      active: autoReviewOutputMode === "storyboard_images",
    },
    {
      action: "video" as const,
      label: "Create Video",
      description: "สร้างวิดีโอ",
      icon: Video,
      active:
        autoReviewOutputMode === "full_video" &&
        autoReviewAudioStrategy !== "auto",
    },
    {
      action: "auto_review_video" as const,
      label: "Auto Create Review Video",
      description: "ระบบเลือกเส้นทาง",
      icon: Film,
      active:
        autoReviewOutputMode === "full_video" &&
        autoReviewAudioStrategy === "auto",
    },
  ];
  const renderCharacterChoiceGroup = (
    label: string,
    options: AutoReviewCharacterChoice[],
    value: string,
    onChange: (value: string) => void
  ) => (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {options.map(option => (
          <button
            key={option.id || "auto"}
            type="button"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            className={`min-h-10 rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
              value === option.id
                ? "border-sky-500 bg-sky-50 text-sky-900 ring-2 ring-sky-100"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
  const renderCharacterDetailField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    placeholder: string
  ) => (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className="mt-2 min-h-20 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
      />
    </label>
  );

  const characterChoicePanel = (
    <section
      className="mt-4 rounded-lg border border-slate-200 bg-white p-4"
      aria-label="Auto Review character choices"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Character / Presenter
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            เลือกแบบตัวละครด้วยช้อย เพื่อลดการพิมพ์และคุมภาพให้ตรง intent
          </p>
        </div>
        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
          {selectedCharacterMode?.label ?? autoReviewCharacterMode}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {AUTO_REVIEW_CHARACTER_MODES.map(option => (
          <button
            key={option.id}
            type="button"
            aria-pressed={autoReviewCharacterMode === option.id}
            onClick={() =>
              setAutoReviewCharacterMode(option.id as AutoReviewCharacterMode)
            }
            className={`min-h-[4.75rem] rounded-lg border p-3 text-left transition ${
              autoReviewCharacterMode === option.id
                ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <span className="block text-sm font-semibold text-slate-900">
              {option.label}
            </span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">
              {option.description}
            </span>
          </button>
        ))}
      </div>

      {autoReviewCharacterMode === "described_character" ? (
        <div className="mt-4 grid gap-4">
          {renderCharacterChoiceGroup(
            "ลักษณะ",
            AUTO_REVIEW_CHARACTER_APPEARANCES,
            autoReviewCharacterAppearance,
            setAutoReviewCharacterAppearance
          )}
          {renderCharacterChoiceGroup(
            "วัย",
            AUTO_REVIEW_CHARACTER_AGES,
            autoReviewCharacterAge,
            setAutoReviewCharacterAge
          )}
          {renderCharacterChoiceGroup(
            "เพศ",
            AUTO_REVIEW_CHARACTER_GENDERS,
            autoReviewCharacterGender,
            setAutoReviewCharacterGender
          )}
          {renderCharacterChoiceGroup(
            "บทบาท",
            AUTO_REVIEW_CHARACTER_ROLES,
            autoReviewCharacterRole,
            setAutoReviewCharacterRole
          )}
          {renderCharacterChoiceGroup(
            "สไตล์",
            AUTO_REVIEW_CHARACTER_STYLES,
            autoReviewCharacterStyle,
            setAutoReviewCharacterStyle
          )}
          <div className="grid gap-4 lg:grid-cols-3">
            {renderCharacterDetailField(
              "Character แรกเพิ่มเติม",
              autoReviewPrimaryCharacterDetails,
              setAutoReviewPrimaryCharacterDetails,
              "เช่น ใบหน้ารูปไข่ ผมบ๊อบสีน้ำตาล ตาสีน้ำตาล ใส่เสื้อเชิ้ตขาว"
            )}
            {renderCharacterDetailField(
              "ตัวละครที่ 2",
              autoReviewSecondaryCharacterDetails,
              setAutoReviewSecondaryCharacterDetails,
              "เช่น เด็กผู้ชายวัย 6 ขวบ ใส่เสื้อสีฟ้า ยืนข้างแม่"
            )}
            {renderCharacterDetailField(
              "Prop เพิ่มเติม",
              autoReviewPropDetails,
              setAutoReviewPropDetails,
              "เช่น มีหมา มีแมว มีสิงโต มีช้าง หรือมีอุปกรณ์เสริมในฉาก"
            )}
          </div>
        </div>
      ) : null}

      {autoReviewCharacterMode === "uploaded_reference" ? (
        <div
          onDragOver={event => handleAnchorDragOver(event, "character")}
          onDragLeave={handleAnchorDragLeave}
          onDrop={event =>
            void handleDropAnchorImage(
              event,
              setCharacterAnchor,
              "character",
              "Character anchor"
            )
          }
          className={`mt-4 rounded-lg border p-3 transition ${
            activeAnchorDrop === "character"
              ? "border-sky-400 bg-sky-50 ring-4 ring-sky-100"
              : characterAnchorUrl
                ? "border-emerald-300 bg-emerald-50"
                : "border-dashed border-slate-300 bg-slate-50"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                Reference / character sheet
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                อัปโหลดหรือวางรูปตัวแบบเดียวที่ต้องการให้ระบบยึดเป็น identity
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => characterAnchorUploadInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {characterAnchorUrl ? "เปลี่ยนรูป" : "อัปโหลด"}
              </Button>
              {characterAnchorUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCharacterAnchor(null)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  ลบ
                </Button>
              ) : null}
            </div>
          </div>
          {characterAnchorUrl ? (
            <div className="mt-3 flex items-start gap-3">
              <img
                src={characterAnchorUrl}
                alt="Character anchor"
                className="h-24 w-24 rounded-md border bg-white object-cover"
              />
              <p className="text-xs leading-5 text-slate-600">
                {multiViewReferencePolicyText("character")}
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
          {autoReviewCharacterMode === "hands_only"
            ? "ระบบจะใช้มือหรือ framing ที่ไม่เห็นหน้า เพื่อเลี่ยง identity ผิดคน"
            : autoReviewCharacterMode === "product_only"
              ? "ระบบจะไม่สร้างคน/ตัวละคร และจะเน้นสินค้าเป็นหลัก"
              : autoReviewCharacterBrief.summary}
        </p>
      )}
    </section>
  );

  const creativeDirectionPanel = (
    <section
      className="mt-4 rounded-lg border border-slate-200 bg-white p-4"
      aria-label="Auto Review creative direction choices"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            อารมณ์และโครงเรื่อง
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            เลือก tone การพูดและ storytelling structure
            ให้ระบบสร้างรีวิวตรงเจตนา
          </p>
        </div>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
          {selectedReviewTone?.label || "Auto"} /{" "}
          {selectedStorytellingStructure?.label || "Auto"}
        </span>
      </div>
      <div className="mt-4 grid gap-4">
        {renderCharacterChoiceGroup(
          "อารมณ์ / โทนการพูด",
          AUTO_REVIEW_REVIEW_TONES,
          autoReviewTone,
          value => setAutoReviewTone(value as AutoReviewReviewTone)
        )}
        {renderCharacterChoiceGroup(
          "โครงสร้างการเล่าเรื่อง",
          AUTO_REVIEW_STORYTELLING_STRUCTURES,
          autoReviewStorytellingStructure,
          value =>
            setAutoReviewStorytellingStructure(
              value as AutoReviewStorytellingStructure
            )
        )}
        {AUTO_REVIEW_CREATIVE_PRESET_GROUPS.map(group => {
          const selected =
            autoReviewCreativePresets.find(
              preset => preset.family === group.family
            )?.presetId ?? "";
          const options = [
            { id: "", label: "Auto", description: "ให้ระบบเลือกเอง" },
            ...AUTO_REVIEW_CREATIVE_PRESET_OPTIONS.filter(
              option => option.family === group.family
            ),
          ];
          return (
            <div key={group.family}>
              {renderCharacterChoiceGroup(
                group.title,
                options,
                selected,
                value => selectAutoReviewCreativePreset(group.family, value)
              )}
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {group.description}
              </p>
            </div>
          );
        })}
      </div>
      {selectedAudioCreativePreset?.presetId === "audio_thai_tts" ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          เลือกเสียงไทยแบบ TTS แยก: ระบบจะใช้บทพูดจาก storyboard/shot voiceover
          เป็น source เดียว และจะไม่สั่งให้โมเดลวิดีโอสร้างเสียงไทยเอง
          โดยเฉพาะเมื่อใช้ Seedance 2.0
        </p>
      ) : null}
      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
        {autoReviewTone ||
        autoReviewStorytellingStructure ||
        selectedCreativePresetLabels.length > 0
          ? compactStringList([
              autoReviewTone
                ? `Tone: ${selectedReviewTone?.label ?? autoReviewTone}`
                : null,
              autoReviewStorytellingStructure
                ? `Storytelling: ${
                    selectedStorytellingStructure?.label ??
                    autoReviewStorytellingStructure
                  }`
                : null,
              selectedCreativePresetLabels.length > 0
                ? `Presets: ${selectedCreativePresetLabels.join(" · ")}`
                : null,
            ]).join(" · ")
          : "Auto: ไม่ส่ง directive เพิ่ม ระบบใช้ creative planner ปัจจุบัน"}
      </p>
    </section>
  );

  const autoStoryboardReviewSurface = showAutoStoryboardReviewSurface ? (
    <div className="mt-4 space-y-3">
      {autoStoryboardPlan?.primaryAction.actionId ===
        "resume_auto_storyboard_review" && autoStoryboardPlan.activeRunId ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 shadow-sm dark:border-sky-800 dark:bg-sky-950/30">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sky-900 dark:text-sky-100">
                พบงาน Auto Storyboard Review เดิมที่ยังต่อได้
              </p>
              <p className="mt-1 text-sm leading-6 text-sky-800 dark:text-sky-100/85">
                งานนี้มีเฟรมพร้อมแล้ว ระบบจะกลับไปทำต่อจาก run เดิมถ้าคุณยืนยัน
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="bg-sky-600 text-white hover:bg-sky-700"
              aria-label="ทำงานต่อจากงานเดิม"
              onClick={() => startAutoStoryboardReview()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              ทำงานต่อจากงานเดิม
            </Button>
          </div>
        </div>
      ) : null}
      <MarketplaceAutoReviewLaunchModeSwitch
        value={effectiveAutoReviewLaunchMode}
        onChange={setAutoReviewLaunchMode}
        autoEnabled={Boolean(
          autoStoryboardPlanLoading ||
          autoStoryboardPlan?.access.capabilities.canAccessAuto
        )}
        standardAvailable={Boolean(
          autoStoryboardPlan?.standardOrderAvailable ?? true
        )}
      />
      {autoStoryboardPlanErrored ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {hyperframesCopy.autoPlanLoadFailed}
              </div>
              <p className="mt-1 leading-6 text-amber-800 dark:text-amber-200">
                {hyperframesCopy.autoPlanLoadFailedDescription}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={autoStoryboardPlanRetrying}
                onClick={() => void autoStoryboardPlanQuery.refetch()}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${
                    autoStoryboardPlanRetrying ? "animate-spin" : ""
                  }`}
                />
                {hyperframesCopy.retryAutoPlan}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setAutoReviewLaunchMode("standard_order")}
              >
                {hyperframesCopy.useStandardOrder}
              </Button>
            </div>
          </div>
        </div>
      ) : effectiveAutoReviewLaunchMode === "auto_storyboard_review" ? (
        <>
          <AutoStoryboardReviewPlanSummary
            plan={autoStoryboardPlan}
            loading={autoStoryboardPlanQuery.isLoading}
            starting={startAutoStoryboardReviewMutation.isPending}
            updating={autoStoryboardPlanRefreshingForOverrides}
            onStart={startAutoStoryboardReview}
            onUseStandard={() => setAutoReviewLaunchMode("standard_order")}
            onResetToAuto={() => {
              setAutoStoryboardOverrides({});
              setShowAutoStoryboardAdvanced(false);
            }}
          />
          {characterChoicePanel}
          {creativeDirectionPanel}
          <AutoStoryboardAdvancedOverrides
            plan={autoStoryboardPlan}
            open={showAutoStoryboardAdvanced}
            onOpenChange={setShowAutoStoryboardAdvanced}
            value={autoStoryboardOverrides}
            onChange={setAutoStoryboardOverrides}
            onResetToAuto={() => {
              setAutoStoryboardOverrides({});
              setShowAutoStoryboardAdvanced(false);
            }}
            imageModelOptions={autoReviewImageModelOptions.map(option => ({
              value: option.value,
              label: `${option.label} (${option.transport === "mcp" ? "MCP" : "API"}${option.provider ? ` • ${option.provider}` : ""})`,
            }))}
            videoModelOptions={autoReviewVideoModelOptions.map(option => ({
              value: option.value,
              label: `${option.label} (${option.transport === "mcp" ? "MCP" : "API"}${option.provider ? ` • ${option.provider}` : ""})`,
            }))}
            videoSegmentPreview={{
              loading: autoStoryboardVideoSegmentPreviewQuery.isFetching,
              error:
                autoStoryboardVideoSegmentPreviewQuery.error?.message ?? null,
              effectiveMode:
                autoStoryboardVideoSegmentPreviewQuery.data?.videoSegmentPlan
                  .effectiveMode ?? null,
              creditSource:
                autoStoryboardVideoSegmentPreviewQuery.data?.creditEstimate
                  .creditSource ?? null,
              fallbackReason:
                autoStoryboardVideoSegmentPreviewQuery.data?.fallbackReason ??
                null,
              segments:
                autoStoryboardVideoSegmentPreviewQuery.data?.videoSegmentPlan.segments.map(
                  segment => ({
                    segmentId: segment.segmentId,
                    shotIds: segment.shotIds,
                    durationSeconds: segment.durationSeconds,
                    referenceMode: segment.referenceMode,
                  })
                ) ?? [],
              warnings:
                autoStoryboardVideoSegmentPreviewQuery.data?.warnings ?? [],
            }}
          />
          {selectedAutoStoryboardMcpProviderKey ? (
            <div className="rounded-lg border bg-white p-4">
              <McpConnectionPicker
                assetType={
                  selectedAutoStoryboardVideoModelProviderKey
                    ? "video"
                    : "image"
                }
                providerKey={selectedAutoStoryboardMcpProviderKey}
                value={autoReviewMcpConnectionId}
                sharedGroupId={autoReviewMcpSharedGroupId}
                onChange={setAutoReviewMcpConnectionId}
                onSharedGroupChange={setAutoReviewMcpSharedGroupId}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  ) : null;
  const showStandardOrderControlPanel = shouldShowStandardOrderControls({
    autoSurfaceVisible: showAutoStoryboardReviewSurface,
    effectiveLaunchMode: effectiveAutoReviewLaunchMode,
  });

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-6">
      <input
        ref={characterAnchorUploadInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleUploadCharacterAnchor}
      />
      <input
        ref={environmentAnchorUploadInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleUploadEnvironmentAnchor}
      />
      <div className="mx-auto grid max-w-[1600px] gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/marketplace-capture">
                <Button type="button" variant="outline" size="sm">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Marketplace Capture
                </Button>
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => product.refetch()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
            <LocaleToggle className="shrink-0" />
          </div>

          {autoStoryboardReviewSurface ? (
            <section
              className="rounded-lg border border-sky-200 bg-white p-4 shadow-sm md:p-5"
              aria-label="Auto Storyboard Review first action"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    Marketplace Auto Review
                  </div>
                  <h2 className="mt-3 text-xl font-semibold">
                    สร้างวิดีโอรีวิวจากสินค้านี้อัตโนมัติ
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                    Auto Storyboard Review จะเลือก plan
                    ที่เหมาะสมจากข้อมูลสินค้า และรูปที่มีอยู่
                    โดยยังสลับกลับไปใช้ Standard Order ได้ทันที
                  </p>
                </div>
              </div>
              {autoStoryboardReviewSurface}
            </section>
          ) : null}

          <section
            className="rounded-lg border bg-white p-6 shadow-sm"
            aria-label="Product summary"
          >
            <div className="grid gap-5 md:grid-cols-[260px_minmax(0,1fr)]">
              {heroProductImage ? (
                <div className="relative overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50">
                  <div className="absolute left-3 top-3 z-10 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                    Hero / Default
                  </div>
                  <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm hover:bg-white"
                      onClick={() =>
                        setPreviewAutoReviewImage({
                          url: compactText((heroProductImage as any).url),
                          title: "Hero / Default image",
                        })
                      }
                      aria-label="ดู Hero image แบบเต็มจอ"
                      title="ดูภาพเต็มจอ"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
                    <a
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm hover:bg-white"
                      href={compactText((heroProductImage as any).url)}
                      download
                      target="_blank"
                      rel="noreferrer"
                      aria-label="ดาวน์โหลด Hero image"
                      title="ดาวน์โหลดภาพ"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                  <button
                    type="button"
                    className="block w-full bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                    onClick={() =>
                      setPreviewAutoReviewImage({
                        url: compactText((heroProductImage as any).url),
                        title: "Hero / Default image",
                      })
                    }
                    aria-label="ดู Hero image แบบเต็มจอ"
                  >
                    <img
                      src={compactText((heroProductImage as any).url)}
                      alt=""
                      className="h-72 w-full object-contain p-3 md:h-80"
                    />
                  </button>
                </div>
              ) : (
                <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-amber-300 bg-amber-50 p-5 text-center text-sm font-medium text-amber-900 md:h-80">
                  ยังไม่ได้ตั้ง Hero / Default image
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-500">
                  {compactText(item.platform)}
                </p>
                {isEditingProduct ? (
                  <input
                    className="mt-2 w-full rounded-md border px-3 py-2 text-2xl font-semibold leading-tight"
                    value={productEditForm.productName}
                    onChange={event =>
                      updateProductEditField("productName", event.target.value)
                    }
                  />
                ) : (
                  <h1 className="mt-2 text-3xl font-semibold leading-tight">
                    {compactText(item.productName)}
                  </h1>
                )}
                {heroProductImage ? (
                  <p className="mt-3 text-sm text-emerald-700">
                    รูปนี้เป็นภาพหลักของระบบสำหรับสินค้า
                    และเป็นค่าเริ่มต้นสำหรับ Product Anchor
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-amber-700">
                    เลือก Hero image จากส่วน Product Images ด้านล่าง
                    เพื่อกำหนดรูปหลักของสินค้า
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {isEditingProduct ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        disabled={updateProductDetailsMutation.isPending}
                        onClick={saveProductEdits}
                      >
                        {updateProductDetailsMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setProductEditForm(productFormFromCurrent());
                          setIsEditingProduct(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingProduct(true)}
                    >
                      Edit product
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={enhanceProductDescriptionMutation.isPending}
                    onClick={() =>
                      enhanceProductDescriptionMutation.mutate({ productId })
                    }
                  >
                    {enhanceProductDescriptionMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="mr-2 h-4 w-4" />
                    )}
                    Enhance description
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={analyzeProductInsightsMutation.isPending}
                    onClick={() =>
                      analyzeProductInsightsMutation.mutate({ productId })
                    }
                  >
                    {analyzeProductInsightsMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    Analyze AI Insights
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              {productPageUrl ? (
                <>
                  <a
                    className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-2 font-medium text-blue-700 hover:bg-blue-100"
                    href={productPageUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    เปิดหน้าสินค้าปัจจุบัน
                  </a>
                  <span className="break-all text-xs text-slate-500">
                    {productPageUrl}
                  </span>
                </>
              ) : null}
              {sourceUrl && sourceUrl !== productPageUrl ? (
                <a
                  className="text-blue-700 underline"
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Source marketplace page
                </a>
              ) : null}
            </div>
            {item.affiliateUrl ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <a
                  className="max-w-xl truncate text-emerald-700 underline"
                  href={compactText(item.affiliateUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Affiliate link
                </a>
                <button
                  className="inline-flex items-center rounded border bg-white px-2 py-1 text-xs"
                  type="button"
                  onClick={copyAffiliateLink}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copy
                </button>
              </div>
            ) : null}
            {commissionCheckUrl ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <a
                  className="inline-flex items-center rounded-md border border-orange-200 bg-orange-50 px-3 py-2 font-medium text-orange-700 hover:bg-orange-100"
                  href={commissionCheckUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  ตรวจคอมมิชชั่นปัจจุบัน
                </a>
                <span className="break-all text-xs text-slate-500">
                  {commissionCheckUrl}
                </span>
              </div>
            ) : null}
            <div className="mt-4 rounded-md border bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    health?.status === "critical"
                      ? "bg-red-100 text-red-700"
                      : health?.status === "warning"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  Health: {health?.status ?? "ok"}
                </span>
                <span className="text-sm text-slate-500">
                  Access: {compactText(item.accessType) || "owner"}
                </span>
                <span className="text-sm text-slate-500">
                  Snapshots: {health?.snapshotCount ?? history.length}
                </span>
                <span className="text-sm text-slate-500">
                  Last checked:{" "}
                  {health?.lastCheckedAt
                    ? new Date(health.lastCheckedAt).toLocaleString()
                    : "-"}
                </span>
              </div>
              {health?.warnings?.length ? (
                <ul className="mt-2 space-y-1 text-sm text-amber-700">
                  {health.warnings.map((warning: any) => (
                    <li key={warning.code}>{warning.message}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <dl className="mt-6 grid gap-4 md:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-slate-500">Price</dt>
                <dd>
                  {isEditingProduct ? (
                    <input
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={productEditForm.priceCurrent}
                      onChange={event =>
                        updateProductEditField(
                          "priceCurrent",
                          event.target.value
                        )
                      }
                    />
                  ) : (
                    <>
                      {compactText(item.priceCurrent) || "-"}{" "}
                      {compactText(item.currency) || "THB"}
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">
                  Commission
                </dt>
                <dd>
                  {isEditingProduct ? (
                    <>
                      <input
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                        value={productEditForm.commissionRatePercent}
                        onChange={event =>
                          updateProductEditField(
                            "commissionRatePercent",
                            event.target.value
                          )
                        }
                      />
                      <div className="mt-1 text-xs text-slate-500">
                        {formatCommissionAmountValue(
                          productEditForm.priceCurrent,
                          productEditForm.commissionRatePercent,
                          item.currency
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        {formatCommissionRateValue(item.commissionRatePercent)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatCommissionAmountValue(
                          item.priceCurrent,
                          item.commissionRatePercent,
                          item.currency
                        )}
                      </div>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">
                  Affiliate link
                </dt>
                <dd className="truncate">
                  {compactText(item.affiliateUrl) || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">
                  Product page
                </dt>
                <dd>
                  {isEditingProduct ? (
                    <textarea
                      className="mt-1 min-h-16 w-full rounded-md border px-2 py-1 text-sm"
                      value={productEditForm.productPageUrl}
                      onChange={event =>
                        updateProductEditField(
                          "productPageUrl",
                          event.target.value
                        )
                      }
                    />
                  ) : productPageUrl ? (
                    <a
                      className="inline-flex max-w-full items-center gap-1 break-all text-blue-700 underline"
                      href={productPageUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      {productPageUrl}
                    </a>
                  ) : (
                    "-"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">
                  Commission check page
                </dt>
                <dd>
                  {commissionCheckUrl ? (
                    <a
                      className="inline-flex max-w-full items-center gap-1 break-all text-orange-700 underline"
                      href={commissionCheckUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      {commissionCheckUrl}
                    </a>
                  ) : (
                    "-"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">Sold</dt>
                <dd>
                  {isEditingProduct ? (
                    <input
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={productEditForm.soldCountText}
                      onChange={event =>
                        updateProductEditField(
                          "soldCountText",
                          event.target.value
                        )
                      }
                    />
                  ) : (
                    formatCount(
                      item.soldCountNormalized as any,
                      item.soldCountText as any
                    )
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">Shop</dt>
                <dd>
                  {isEditingProduct ? (
                    <input
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={productEditForm.shopName}
                      onChange={event =>
                        updateProductEditField("shopName", event.target.value)
                      }
                    />
                  ) : (
                    compactText(item.shopName) || "-"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">
                  Captured category
                </dt>
                <dd>
                  {isEditingProduct ? (
                    <input
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={productEditForm.capturedCategoryText}
                      onChange={event =>
                        updateProductEditField(
                          "capturedCategoryText",
                          event.target.value
                        )
                      }
                    />
                  ) : (
                    capturedCategoryText || "-"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">
                  Main storyboard category
                </dt>
                <dd>
                  {isEditingProduct ? (
                    <select
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={productEditForm.productCategory}
                      onChange={event =>
                        updateProductEditField(
                          "productCategory",
                          event.target.value as ProductReferenceCategory
                        )
                      }
                    >
                      {PRODUCT_REFERENCE_CATEGORY_OPTIONS.map(option => (
                        <option key={option.id} value={option.id}>
                          {option.label} ({option.id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    productCategoryLabel(mainProductCategory)
                  )}
                </dd>
              </div>
              {categoryPath.length > 0 ? (
                <div className="md:col-span-2">
                  <dt className="text-sm font-medium text-slate-500">
                    Marketplace category path
                  </dt>
                  <dd className="text-sm text-slate-700">
                    {categoryPath.join(" > ")}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-sm font-medium text-slate-500">Rating</dt>
                <dd>
                  {isEditingProduct ? (
                    <input
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={productEditForm.ratingScore}
                      onChange={event =>
                        updateProductEditField(
                          "ratingScore",
                          event.target.value
                        )
                      }
                    />
                  ) : (
                    compactText(item.ratingScore) || "-"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">Reviews</dt>
                <dd>
                  {isEditingProduct ? (
                    <input
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={productEditForm.reviewCountText}
                      onChange={event =>
                        updateProductEditField(
                          "reviewCountText",
                          event.target.value
                        )
                      }
                    />
                  ) : (
                    formatCount(
                      item.reviewCountText as any,
                      history[0]?.reviewCountNormalized
                    )
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">Updated</dt>
                <dd>
                  {item.updatedAt
                    ? new Date(item.updatedAt as string).toLocaleString()
                    : "-"}
                </dd>
              </div>
            </dl>
          </section>

          {marketplaceIntelligenceEnabled ? (
          <section
            className="rounded-lg border border-sky-200 bg-white p-6 shadow-sm"
            aria-label="Market Intelligence"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                  <Search className="h-3.5 w-3.5" />
                  Market Intelligence
                </div>
                <h2 className="mt-3 text-xl font-semibold">
                  วิเคราะห์ตลาดจาก keyword ก่อนผูกกับ SKU นี้
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                  ใช้ชื่อสินค้า ร้าน หรือหมวดหมู่จาก Marketplace Capture
                  เพื่อสร้าง keyword snapshot, report, watchlist และ candidate batch
                  โดยข้อมูล connector/evidence เป็นสิทธิ์ของ user ที่เชื่อมต่อเท่านั้น
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={marketplaceIntelligenceHref}>
                  <Button type="button" variant="outline" size="sm">
                    <Search className="mr-2 h-4 w-4" />
                    Find competitors
                  </Button>
                </Link>
                <Link href="/marketplace-capture/intelligence/reports">
                  <Button type="button" variant="outline" size="sm">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Reports
                  </Button>
                </Link>
                <Link href="/settings?tab=integrations">
                  <Button type="button" variant="outline" size="sm">
                    <Settings2 className="mr-2 h-4 w-4" />
                    Connector settings
                  </Button>
                </Link>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {marketplaceIntelligenceEvidence.map(metric => (
                <div key={metric.label} className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs font-medium text-slate-500">
                    {metric.label}
                  </div>
                  <div className="mt-1 break-words text-sm font-semibold text-slate-900">
                    {metric.value}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">
                  Linked snapshot metric update
                </div>
                {matchingMarketplaceSnapshotItem ? (
                  <div className="mt-2 space-y-3 text-sm text-slate-600">
                    <p>
                      พบ exact snapshot item จาก keyword{" "}
                      <span className="font-medium text-slate-900">
                        {matchingMarketplaceSnapshotItem.snapshot.keyword}
                      </span>{" "}
                      rank #{matchingMarketplaceSnapshotItem.item.rank} · {matchingMarketplaceSnapshotItem.snapshot.capturedAt}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded-md bg-slate-50 p-2">
                        <div className="text-xs text-slate-500">Snapshot price</div>
                        <div className="font-semibold text-slate-900">
                          {Number(matchingMarketplaceSnapshotItem.item.price ?? 0).toLocaleString()} THB
                        </div>
                      </div>
                      <div className="rounded-md bg-slate-50 p-2">
                        <div className="text-xs text-slate-500">Monthly sold</div>
                        <div className="font-semibold text-slate-900">
                          {formatCount(matchingMarketplaceSnapshotItem.item.monthlySoldCount as any, null)}
                        </div>
                      </div>
                      <div className="rounded-md bg-slate-50 p-2">
                        <div className="text-xs text-slate-500">Rating</div>
                        <div className="font-semibold text-slate-900">
                          {compactText(matchingMarketplaceSnapshotItem.item.rating) || "-"}
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => createMarketplaceMetricEnrichment.mutate({
                        productId,
                        snapshotId: matchingMarketplaceSnapshotItem.snapshot.id,
                        itemId: matchingMarketplaceSnapshotItem.item.itemId,
                      })}
                      disabled={createMarketplaceMetricEnrichment.isPending}
                    >
                      {createMarketplaceMetricEnrichment.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      Confirm metric enrichment
                    </Button>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">
                    ยังไม่พบ snapshot item ที่ match ด้วย shop_id + item_id สำหรับ product นี้ ให้สร้าง keyword snapshot หรือ candidate batch ก่อนยืนยัน metric update.
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">
                  Enrichment history
                </div>
                <div className="mt-2 space-y-2">
                  {marketplaceMetricEnrichments.length > 0 ? marketplaceMetricEnrichments.slice(0, 3).map((entry: any) => (
                    <div key={entry.id} className="rounded-md bg-slate-50 p-2 text-sm">
                      <div className="font-medium text-slate-900">
                        {entry.provenance?.title || entry.snapshotItemId}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {entry.capturedAt} · rank #{entry.metrics?.rank ?? "-"} · confidence {Math.round(Number(entry.confidence ?? 0) * 100)}%
                      </div>
                    </div>
                  )) : (
                    <p className="text-sm text-slate-600">
                      ยังไม่มี metric enrichment ที่ user นี้ยืนยันไว้
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
              Keyword seed:{" "}
              <span className="font-medium text-slate-900">
                {marketplaceIntelligenceKeyword || productId}
              </span>
              {" "}· Product evidence remains provenance-only until a snapshot item is explicitly linked or converted into a candidate batch.
            </div>
          </section>
          ) : null}

          <section className="rounded-lg border bg-white p-6 shadow-sm">
            {showStandardOrderControlPanel ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                      <Settings2 className="h-3.5 w-3.5" />
                      Standard Order
                    </div>
                    <h2 className="mt-3 text-xl font-semibold">
                      Custom controls สำหรับ flow เดิม
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                      ปรับ output, frame strategy, โมเดล, anchor
                      และรายละเอียดอื่น สำหรับการสั่งงานแบบมาตรฐาน โดยไม่กระทบ
                      Auto Storyboard Review ด้านบน
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-lg border bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Standard Order
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        ใช้ flow เดิมสำหรับ storyboard/full video และ custom
                        controls ทั้งหมด
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant={
                        effectiveAutoReviewLaunchMode === "standard_order"
                          ? "default"
                          : "outline"
                      }
                      size="sm"
                      onClick={() => setAutoReviewLaunchMode("standard_order")}
                    >
                      Use Standard
                    </Button>
                  </div>
                  <div className="mt-3 grid w-full gap-2 sm:grid-cols-3">
                    {autoReviewActionItems.map(actionItem => {
                      const Icon = actionItem.icon;
                      const isPending =
                        startAutoReviewMutation.isPending &&
                        pendingAutoReviewAction === actionItem.action;
                      return (
                        <Button
                          key={actionItem.action}
                          type="button"
                          variant={actionItem.active ? "default" : "outline"}
                          onClick={() => startAutoReview(actionItem.action)}
                          disabled={autoReviewStartDisabled}
                          aria-label={actionItem.label}
                          aria-pressed={actionItem.active}
                          className={`min-h-[4.5rem] justify-start whitespace-normal text-left disabled:cursor-not-allowed ${
                            actionItem.active
                              ? "bg-sky-600 text-white hover:bg-sky-700"
                              : "bg-white"
                          }`}
                        >
                          {isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                          ) : (
                            <Icon className="mr-2 h-4 w-4 shrink-0" />
                          )}
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold leading-5">
                              {actionItem.label}
                            </span>
                            <span className="block text-xs leading-4 opacity-80">
                              {activeAutoReviewRun
                                ? "มีงานกำลังรัน"
                                : actionItem.description}
                            </span>
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {characterChoicePanel}

                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      ผลลัพธ์ที่ต้องการ
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {(
                        [
                          [
                            "storyboard_images",
                            "Storyboard + รูป",
                            "สร้าง project และรูปพร้อมตรวจใน Storyboard Review",
                          ],
                          [
                            "full_video",
                            "สร้างวิดีโอจนจบ",
                            "สร้างภาพ วิดีโอรายช็อต ประกอบ editor และ render เข้า Library",
                          ],
                        ] as const
                      ).map(([mode, label, description]) => (
                        <button
                          key={mode}
                          type="button"
                          aria-pressed={autoReviewOutputMode === mode}
                          onClick={() => {
                            setAutoReviewOutputMode(mode);
                            if (autoReviewAudioStrategy === "auto") {
                              setAutoReviewAudioStrategy("native_video_audio");
                            }
                          }}
                          className={`rounded-lg border p-3 text-left transition ${
                            autoReviewOutputMode === mode
                              ? "border-sky-500 bg-white shadow-sm ring-2 ring-sky-100"
                              : "bg-white/70 hover:bg-white"
                          }`}
                        >
                          <span className="block text-sm font-semibold text-slate-900">
                            {label}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500">
                            {description}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      เส้นทางการสร้างภาพ
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {(
                        [
                          [
                            "storyboard_3x3_split",
                            "3x3 + cut",
                            "เร็วและเหมาะกับ storyboard",
                          ],
                          [
                            "video_shot_start_stop",
                            "Start/Stop",
                            "คมชัดกว่าและเหมาะกับวิดีโอ",
                          ],
                        ] as const
                      ).map(([strategy, label, description]) => (
                        <button
                          key={strategy}
                          type="button"
                          aria-pressed={autoReviewFrameStrategy === strategy}
                          onClick={() => setAutoReviewFrameStrategy(strategy)}
                          className={`rounded-lg border p-3 text-left transition ${
                            autoReviewFrameStrategy === strategy
                              ? "border-emerald-500 bg-white shadow-sm ring-2 ring-emerald-100"
                              : "bg-white/70 hover:bg-white"
                          }`}
                        >
                          <span className="block text-sm font-semibold text-slate-900">
                            {label}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500">
                            {description}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      โมเดลสร้างภาพ
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                      {autoReviewImageModelOptions.length === 0 ? (
                        <div className="rounded-lg border border-dashed bg-white/60 p-3 text-xs text-slate-500">
                          ยังไม่มี image model ที่พร้อมใช้งานสำหรับบัญชีนี้
                        </div>
                      ) : (
                        autoReviewImageModelOptions.map(option => (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={autoReviewImageModel === option.value}
                            onClick={() =>
                              setAutoReviewImageModel(option.value)
                            }
                            className={`rounded-lg border p-3 text-left transition ${
                              autoReviewImageModel === option.value
                                ? "border-cyan-500 bg-white shadow-sm ring-2 ring-cyan-100"
                                : "bg-white/70 hover:bg-white"
                            }`}
                          >
                            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                              {option.label}
                              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                {option.transport === "mcp" ? "MCP" : "API"}
                              </span>
                              {option.provider ? (
                                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                  {option.provider}
                                </span>
                              ) : null}
                              {option.creditCost != null ? (
                                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                  {option.creditCost}c
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-slate-500">
                              {option.description}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                    {selectedStandardImageModelProviderKey ? (
                      <div className="mt-3 rounded-lg border bg-white p-3">
                        <McpConnectionPicker
                          assetType="image"
                          providerKey={selectedStandardImageModelProviderKey}
                          value={autoReviewMcpConnectionId}
                          sharedGroupId={autoReviewMcpSharedGroupId}
                          onChange={setAutoReviewMcpConnectionId}
                          onSharedGroupChange={setAutoReviewMcpSharedGroupId}
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      จำนวนช็อต
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {([7, 8, 9] as const).map(count => (
                        <button
                          key={count}
                          type="button"
                          aria-pressed={autoReviewShotCount === count}
                          onClick={() => setAutoReviewShotCount(count)}
                          className={`rounded-lg border p-3 text-center transition ${
                            autoReviewShotCount === count
                              ? "border-indigo-500 bg-white shadow-sm ring-2 ring-indigo-100"
                              : "bg-white/70 hover:bg-white"
                          }`}
                        >
                          <span className="block text-sm font-semibold text-slate-900">
                            {count}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500">
                            shots
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      เสียงพูด / บทพากย์
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                      {(
                        [
                          [
                            "native_video_audio",
                            "มีเสียงพูด",
                            "ให้ storyboard มีบทพูดไทยตามช็อต และใช้ต่อกับวิดีโอหรืออัดเสียงภายหลังได้",
                          ],
                          [
                            "silent",
                            "ไม่มีเสียงพูด",
                            "ทำ storyboard แบบไม่มีบทพูด เหมาะกับงานภาพหรือเสียงพากย์ที่เตรียมเอง",
                          ],
                        ] as const
                      ).map(([strategy, label, description]) => (
                        <button
                          key={strategy}
                          type="button"
                          aria-pressed={autoReviewAudioStrategy === strategy}
                          onClick={() => setAutoReviewAudioStrategy(strategy)}
                          className={`rounded-lg border p-3 text-left transition ${
                            autoReviewAudioStrategy === strategy
                              ? "border-orange-500 bg-white shadow-sm ring-2 ring-orange-100"
                              : "bg-white/70 hover:bg-white"
                          }`}
                        >
                          <span className="block text-sm font-semibold text-slate-900">
                            {label}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500">
                            {description}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      ข้อความบนภาพ
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                      {(
                        [
                          [
                            "no_text",
                            "ไม่มีข้อความ",
                            "ภาพสะอาด ไม่มี caption/label บนภาพ",
                          ],
                          [
                            "allow_text",
                            "มีข้อความประกอบ",
                            "อนุญาตข้อความสั้นที่ตรงกับ story เท่านั้น",
                          ],
                        ] as const
                      ).map(([mode, label, description]) => (
                        <button
                          key={mode}
                          type="button"
                          aria-pressed={autoReviewOverlayTextMode === mode}
                          onClick={() => setAutoReviewOverlayTextMode(mode)}
                          className={`rounded-lg border p-3 text-left transition ${
                            autoReviewOverlayTextMode === mode
                              ? "border-violet-500 bg-white shadow-sm ring-2 ring-violet-100"
                              : "bg-white/70 hover:bg-white"
                          }`}
                        >
                          <span className="block text-sm font-semibold text-slate-900">
                            {label}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500">
                            {description}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 rounded-lg border bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        เลือก anchors ก่อนเริ่ม
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        ต้องมีทั้ง 3 anchor: product + character + environment
                        (required) | Required: product, character/person, and
                        environment/place.
                      </p>
                    </div>
                    <div className="text-xs text-slate-500">
                      {canStartAutoReview
                        ? "พร้อมเริ่ม / Ready"
                        : `ยังไม่พร้อม / Missing: ${missingAutoReviewAnchors.join(", ")}`}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 lg:grid-cols-3">
                    <article
                      onDragOver={event =>
                        handleAnchorDragOver(event, "product")
                      }
                      onDragLeave={handleAnchorDragLeave}
                      onDrop={handleDropProductAnchor}
                      className={`relative rounded-lg border bg-white p-3 text-left transition ${
                        activeAnchorDrop === "product"
                          ? "border-sky-400 ring-4 ring-sky-100"
                          : resolvedProductAnchorImageUrl
                            ? "border-emerald-500 ring-2 ring-emerald-50"
                            : "border-slate-200"
                      }`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Product anchor
                      </p>
                      <p className="mt-2 text-sm font-medium text-slate-900">
                        {resolvedProductAnchorImageUrl
                          ? "รูปสินค้าที่เลือกแล้ว"
                          : "เลือก/วางรูปสินค้าที่ต้องใช้จริง"}
                      </p>
                      {resolvedProductAnchorImageUrl ? (
                        <div className="mt-2 flex items-start gap-3">
                          <img
                            src={resolvedProductAnchorImageUrl}
                            alt="Selected product anchor"
                            className="h-20 w-20 rounded-md border object-cover"
                            onLoad={event =>
                              resolvedProductAnchorImage
                                ? rememberImageDimensions(
                                    resolvedProductAnchorImage.id,
                                    event
                                  )
                                : undefined
                            }
                          />
                          <div className="min-w-0 space-y-1 text-xs text-slate-500">
                            <p className="font-medium text-slate-700">
                              {formatImageDimensions(
                                resolvedProductAnchorImageDimensions
                              )}
                            </p>
                            <p className="truncate">
                              {productImageSourceLabel(
                                resolvedProductAnchorImage?.source
                              )}
                            </p>
                            <p className="leading-5">
                              {multiViewReferencePolicyText("product")}
                            </p>
                          </div>
                        </div>
                      ) : productImageOptions.length > 0 ? (
                        <>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {productImageOptions
                              .slice(0, 6)
                              .map((image, index) => (
                                <button
                                  key={image.id}
                                  type="button"
                                  onClick={() => selectProductAnchor(image.id)}
                                  className="h-16 rounded-md border bg-slate-50 p-1 transition hover:border-sky-500 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                                  aria-label={`Use product image ${index + 1} as product anchor`}
                                >
                                  <img
                                    src={image.url}
                                    alt=""
                                    className="h-full w-full object-contain"
                                    loading="lazy"
                                  />
                                </button>
                              ))}
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-500">
                            เลือกรูปที่ตรงสี/รุ่น/รูปทรงจริง
                            หรือวางไฟล์ใหม่ลงช่องนี้ หากใช้ multi-view sheet
                            ต้องเป็นไฟล์เดียวที่รวมหลายมุมของสินค้าชิ้นเดียวกัน
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          ลากไฟล์รูปสินค้ามาวาง หรือกดอัปโหลดเพื่อแนบเป็น anchor
                          รองรับไฟล์เดียวแบบ multi-view sheet
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => uploadInputRef.current?.click()}
                          disabled={isUploadingProductImage}
                        >
                          {isUploadingProductImage ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="mr-2 h-4 w-4" />
                          )}
                          อัปโหลดสินค้า
                        </Button>
                        {resolvedProductAnchorImageUrl ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => uploadInputRef.current?.click()}
                              disabled={isUploadingProductImage}
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              เปลี่ยนรูป
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedProductImageId(null)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              ลบรูปที่เลือก
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </article>
                    <article
                      onDragOver={event =>
                        handleAnchorDragOver(event, "character")
                      }
                      onDragLeave={handleAnchorDragLeave}
                      onDrop={event =>
                        void handleDropAnchorImage(
                          event,
                          setCharacterAnchor,
                          "character",
                          "Character anchor"
                        )
                      }
                      className={`rounded-lg border bg-white p-3 text-left transition ${
                        activeAnchorDrop === "character"
                          ? "border-sky-400 ring-4 ring-sky-100"
                          : characterAnchorUrl
                            ? "border-emerald-500 ring-2 ring-emerald-50"
                            : "border-slate-200"
                      }`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Character/person anchor
                      </p>
                      <p className="mt-2 text-sm font-medium text-slate-900">
                        {characterAnchorUrl
                          ? "อัปโหลดแล้ว"
                          : "อัปโหลด/วางรูปคนหรือตัวแบบ"}
                      </p>
                      {characterAnchorUrl ? (
                        <div className="mt-2 flex items-start gap-3">
                          <img
                            src={characterAnchorUrl}
                            alt="Character anchor"
                            className="h-20 w-20 rounded-md border object-cover"
                          />
                          <p className="text-xs leading-5 text-slate-500">
                            {multiViewReferencePolicyText("character")}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          ลากไฟล์รูปคน/ตัวแบบมาวาง หรือคลิกเพื่ออัปโหลด
                          PNG/JPG/SVG/WEBP ≤10MB รองรับไฟล์เดียวแบบ multi-view
                          sheet
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            characterAnchorUploadInputRef.current?.click()
                          }
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          {characterAnchorUrl ? "เปลี่ยนรูป" : "อัปโหลดคน"}
                        </Button>
                        {characterAnchorUrl ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setCharacterAnchor(null)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            ลบรูปที่เลือก
                          </Button>
                        ) : null}
                      </div>
                    </article>
                    <article
                      onDragOver={event =>
                        handleAnchorDragOver(event, "environment")
                      }
                      onDragLeave={handleAnchorDragLeave}
                      onDrop={event =>
                        void handleDropAnchorImage(
                          event,
                          setEnvironmentAnchor,
                          "environment",
                          "Environment anchor"
                        )
                      }
                      className={`rounded-lg border bg-white p-3 text-left transition ${
                        activeAnchorDrop === "environment"
                          ? "border-sky-400 ring-4 ring-sky-100"
                          : environmentAnchorUrl
                            ? "border-emerald-500 ring-2 ring-emerald-50"
                            : "border-slate-200"
                      }`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Environment/place anchor
                      </p>
                      <p className="mt-2 text-sm font-medium text-slate-900">
                        {environmentAnchorUrl
                          ? "อัปโหลดแล้ว"
                          : "อัปโหลดรูปฉาก/พื้นที่"}
                      </p>
                      {environmentAnchorUrl ? (
                        <div className="mt-2 flex items-start gap-3">
                          <img
                            src={environmentAnchorUrl}
                            alt="Environment anchor"
                            className="h-20 w-20 rounded-md border object-cover"
                          />
                          <p className="text-xs leading-5 text-slate-500">
                            {multiViewReferencePolicyText("environment")}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          ลากไฟล์รูปฉากมาวาง หรือคลิกเพื่ออัปโหลด
                          PNG/JPG/SVG/WEBP ≤10MB รองรับไฟล์เดียวแบบ multi-view
                          sheet
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            environmentAnchorUploadInputRef.current?.click()
                          }
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          {environmentAnchorUrl ? "เปลี่ยนรูป" : "อัปโหลดฉาก"}
                        </Button>
                        {environmentAnchorUrl ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEnvironmentAnchor(null)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            ลบรูปที่เลือก
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  </div>
                </div>
              </>
            ) : null}

            <div
              className={`${
                showStandardOrderControlPanel ? "mt-4" : ""
              } flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-slate-50 px-3 py-2`}
            >
              <div className="flex flex-1 flex-col gap-1 text-sm text-slate-600">
                {activeAutoReviewRun ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                      <span>
                        {statusAutoReviewRunState?.label ?? "กำลังทำงาน"}:{" "}
                        {autoReviewStageLabel(
                          String(activeAutoReviewRun.currentStage)
                        )}
                      </span>
                      <span className="text-xs text-slate-400">
                        ({activeAutoReviewRun.stageIndex}/
                        {activeAutoReviewRun.stageCount})
                      </span>
                    </div>
                    {statusAutoReviewRunState?.description ? (
                      <p className="text-xs text-slate-500">
                        {statusAutoReviewRunState.description}
                      </p>
                    ) : null}
                    {statusAutoReviewRunBestAttemptHint ? (
                      <p className="text-xs text-amber-700">
                        {statusAutoReviewRunBestAttemptHint}
                      </p>
                    ) : null}
                    {statusAutoReviewRun?.updatedAt ? (
                      <p className="text-xs text-slate-400">
                        อัปเดตล่าสุด {statusAutoReviewRunUpdatedAtText} ·
                        ยังเช็กสถานะต่อเนื่อง
                      </p>
                    ) : null}
                  </>
                ) : isHidingPreviousAutoReviewFailures ||
                  startAutoReviewMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                    <span>กำลังเริ่ม run ใหม่</span>
                  </>
                ) : latestVisibleAutoReviewRun?.status === "completed" ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>งานล่าสุดเสร็จแล้ว</span>
                  </>
                ) : latestVisibleAutoReviewRun?.status === "failed" ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <span>งานล่าสุดล้มเหลว</span>
                  </>
                ) : latestVisibleAutoReviewRun?.status === "cancelled" ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-slate-500" />
                    <span>งานล่าสุดถูกยกเลิกแล้ว</span>
                  </>
                ) : (
                  <span>ยังไม่มีงานอัตโนมัติสำหรับสินค้านี้</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeAutoReviewRun ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      advanceAutoReviewMutation.mutate({
                        runId: String(activeAutoReviewRun.id),
                      })
                    }
                    disabled={advanceAutoReviewMutation.isPending}
                  >
                    {advanceAutoReviewMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    เช็กสถานะ
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAutoReviewRuns(value => !value)}
                >
                  {showAutoReviewRuns ? "ซ่อนสถานะงาน" : "ดูสถานะงาน"}
                </Button>
              </div>
            </div>

            {showAutoReviewRuns ? (
              <div className="mt-4 space-y-3">
                {isHidingPreviousAutoReviewFailures ||
                isStartingAutoReviewRun ? (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-sky-900">
                          {optimisticAutoReviewStatusText ||
                            "ส่งคำสั่งเริ่ม Auto Storyboard Review แล้ว"}
                        </p>
                        <p className="mt-1 text-xs text-sky-700">
                          ระบบกำลังสร้าง run ใหม่และซ่อน error จาก run เก่าไว้
                          ระหว่างรอสถานะล่าสุดจาก backend
                        </p>
                      </div>
                      <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
                    </div>
                  </div>
                ) : statusAutoReviewRun ? (
                  <div className="rounded-lg border border-sky-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          สรุปงานล่าสุด
                        </p>
                        <h3 className="mt-1 text-base font-semibold text-slate-950">
                          ตอนนี้อยู่ที่:{" "}
                          {compactText(statusActiveTimelineItem?.label) ||
                            autoReviewStageLabel(
                              compactText(
                                statusActiveTimelineItem?.stageKey ??
                                  statusProjection.currentStage ??
                                  statusAutoReviewRun.currentStage
                              )
                            )}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {statusAutoReviewRun.productionRunId}
                        </p>
                        {statusNextAction ? (
                          <p className="mt-2 text-sm text-amber-700">
                            ถัดไป: {statusNextAction}
                          </p>
                        ) : null}
                        {statusAutoReviewRunBestAttemptHint ? (
                          <p className="mt-2 text-sm text-amber-700">
                            {statusAutoReviewRunBestAttemptHint}
                          </p>
                        ) : null}
                        {statusImageTaskSummary ? (
                          <p className="mt-2 text-sm text-slate-700">
                            งานภาพ: {statusImageTaskSummary}
                          </p>
                        ) : null}
                        {statusOutputLinks.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {statusOutputLinks.slice(0, 4).map((link: any) => (
                              <a
                                key={`${compactText(link.kind)}-${compactText(link.url)}`}
                                href={compactText(link.url)}
                                target="_blank"
                                rel="noreferrer"
                                className={`inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium shadow-sm ${
                                  compactText(link.kind) === "storyboard_review"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    : "bg-white text-slate-700 hover:bg-slate-50"
                                }`}
                              >
                                <ExternalLink className="mr-2 h-4 w-4" />
                                {autoReviewLinkLabel(link)}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="min-w-[11rem] text-right">
                        <p className="text-sm font-semibold text-slate-900">
                          {statusProgressPercent ?? 0}%
                        </p>
                        <p className="text-xs text-slate-500">
                          จบแล้ว {statusCompletedTimelineCount}/
                          {statusTimelineItems.length || 0} ขั้นตอน
                        </p>
                        {statusAutoReviewRun?.updatedAt ? (
                          <p className="mt-1 text-[11px] text-slate-400">
                            อัปเดตล่าสุด {statusAutoReviewRunUpdatedAtText}
                          </p>
                        ) : null}
                        <div className="mt-2 h-2 rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-sky-600"
                            style={{
                              width: `${Math.min(100, Math.max(0, statusProgressPercent ?? 0))}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                {isStartingAutoReviewRun && !statusAutoReviewRun ? (
                  <div className="rounded-lg border border-dashed border-sky-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">
                          Timeline
                        </p>
                        <h3 className="mt-1 text-base font-semibold text-slate-950">
                          กำลังสร้าง Timeline ของงานใหม่
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          เริ่มงานแล้ว กำลังรอ backend สร้าง run และส่งลำดับ
                          ขั้นตอนมาแสดง
                        </p>
                        <div className="mt-4 space-y-2">
                          <div className="h-3 w-44 rounded bg-slate-100 animate-pulse" />
                          <div className="h-3 w-72 rounded bg-slate-100 animate-pulse" />
                          <div className="h-3 w-60 rounded bg-slate-100 animate-pulse" />
                        </div>
                      </div>
                      <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
                    </div>
                  </div>
                ) : null}
                {hiddenAutoReviewHistoryCount > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-600">
                      แสดงเฉพาะงานล่าสุดและงานที่ยังทำงานอยู่ เพื่อไม่ให้ error
                      เก่าปะปนกับ run ใหม่
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAutoReviewHistory(value => !value)}
                    >
                      {showAutoReviewHistory
                        ? "ซ่อนประวัติเก่า"
                        : `แสดงประวัติเก่า ${hiddenAutoReviewHistoryCount}`}
                    </Button>
                  </div>
                ) : null}
                {autoReviewRuns.isFetching ? (
                  <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    กำลังโหลดสถานะงาน
                  </div>
                ) : null}
                {visibleAutoReviewRunItems.length === 0 &&
                !autoReviewRuns.isFetching &&
                !isHidingPreviousAutoReviewFailures &&
                !isStartingAutoReviewRun ? (
                  <div className="rounded-lg border border-dashed bg-slate-50 p-4 text-sm text-slate-500">
                    ยังไม่มีประวัติงานอัตโนมัติ
                  </div>
                ) : null}
                {visibleAutoReviewRunItems.map(run => {
                  const timelineItems = getAutoReviewTimelineItems(run);
                  const projection = getAutoReviewTimelineProjection(run);
                  const projectionDetail = asRecord(projection.statusDetail);
                  const runStateFamily = autoReviewStateFamily({
                    status: run.status,
                    detail: projectionDetail,
                    stageKey: projection.currentStage ?? run.currentStage,
                  });
                  const firstIncompleteTimelineItem = timelineItems.find(
                    item =>
                      ![
                        "completed",
                        "completed_with_warnings",
                        "skipped",
                      ].includes(String(item?.status))
                  );
                  const liveTimelineItem = timelineItems.find(item =>
                    [
                      "running",
                      "waiting_provider",
                      "qa_pending",
                      "repairing",
                      "awaiting_credit_authorization",
                      "blocked",
                      "blocked_needs_user",
                      "cancelled",
                      "failed",
                    ].includes(String(item?.status))
                  );
                  const projectedTimelineItem = timelineItems.find(
                    item =>
                      compactText(item?.stageKey) ===
                      compactText(projection.currentStage ?? run.currentStage)
                  );
                  const activeTimelineItem =
                    liveTimelineItem ??
                    firstIncompleteTimelineItem ??
                    projectedTimelineItem;
                  const activeTimelineStageKey = compactText(
                    activeTimelineItem?.stageKey ??
                      projection.currentStage ??
                      run.currentStage
                  );
                  const completedTimelineCount = timelineItems.filter(item =>
                    [
                      "completed",
                      "completed_with_warnings",
                      "skipped",
                    ].includes(String(item?.status))
                  ).length;
                  const remainingTimelineCount = Math.max(
                    0,
                    timelineItems.length - completedTimelineCount
                  );
                  const runNextAction = compactText(
                    projection.nextAction ?? projectionDetail.nextAction
                  );
                  const projectionProgress =
                    typeof projection.progressPercent === "number"
                      ? Math.round(projection.progressPercent)
                      : null;
                  const runId =
                    compactText(run.id) || compactText(run.productionRunId);
                  const runHyperframesRenderRef =
                    hyperframesRenderRefFromAutoReviewRun(run);
                  const runOutputLinks = [
                    ...(Array.isArray(run?.apiProjection?.outputLinks)
                      ? run.apiProjection.outputLinks
                      : []),
                    ...(Array.isArray(projection.outputLinks)
                      ? projection.outputLinks
                      : []),
                  ]
                    .map(link => ({
                      ...asRecord(link),
                      url: normalizeAutoReviewOutputLinkUrl(link, {
                        productId: run.productId ?? productId,
                        runId: runHyperframesRenderRef?.runId || runId,
                        renderJobId: runHyperframesRenderRef?.renderJobId,
                      }),
                    }))
                    .filter(
                      (link, index, links) =>
                        compactText(link?.url) &&
                        links.findIndex(
                          candidate =>
                            compactText(candidate?.url) ===
                            compactText(link?.url)
                        ) === index
                    );
                  const runCreditSummary = formatAutoReviewCreditSummary(
                    run.creditSummary ?? run.apiProjection?.creditSummary
                  );
                  const usesPreferredTimeline =
                    Array.isArray(run?.apiProjection?.timeline?.items) &&
                    run.apiProjection.timeline.items.length > 0;
                  const lockedAnchors = getAutoReviewLockedAnchors(run);
                  const automationSummary = getAutoReviewAutomationSummary(run);
                  const isHistoricalAutoReviewRun =
                    Boolean(
                      showAutoReviewHistory &&
                      latestAutoReviewRunId &&
                      runId &&
                      runId !== latestAutoReviewRunId
                    ) && !isAutoReviewRunBlockingStart(run);
                  const isRunCollapsed =
                    Boolean(runId) &&
                    (isHistoricalAutoReviewRun
                      ? !collapsedAutoReviewRunIds.has(runId)
                      : collapsedAutoReviewRunIds.has(runId));
                  const timelinePanelId = runId ? `${runId}:timeline` : "";
                  const isTimelineCollapsed =
                    Boolean(timelinePanelId) &&
                    collapsedAutoReviewPanelIds.has(timelinePanelId);
                  const storyboardReviewLink = normalizeStoryboardReviewLink(
                    run.links?.storyboardReview,
                    {
                      productId: run.productId ?? productId,
                      runId: runHyperframesRenderRef?.runId || runId,
                      renderJobId: runHyperframesRenderRef?.renderJobId,
                    }
                  );
                  return (
                    <article
                      key={run.id}
                      className="rounded-lg border bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${runStateFamily.className}`}
                            >
                              {runStateFamily.label}
                            </span>
                            <span className="text-xs text-slate-500">
                              {autoReviewStageLabel(String(run.currentStage))}
                            </span>
                            <span className="text-xs text-slate-400">
                              {run.stageIndex}/{run.stageCount}
                            </span>
                            {projectionProgress != null ? (
                              <span className="text-xs text-slate-400">
                                {projectionProgress}%
                              </span>
                            ) : null}
                            {isHistoricalAutoReviewRun ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                                ประวัติเก่า
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm font-medium text-slate-900">
                            {run.productionRunId}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {run.outputMode === "full_video"
                              ? "Full video"
                              : "Storyboard + images"}{" "}
                            ·{" "}
                            {run.frameStrategy === "video_shot_start_stop"
                              ? "Start/Stop frame"
                              : "3x3 split"}
                            {run.metadataJson?.resolvedAudioStrategy
                              ? ` · ${String(run.metadataJson.resolvedAudioStrategy).replaceAll("_", " ")}`
                              : ""}
                          </p>
                          {!isRunCollapsed ? (
                            <>
                              <p className="mt-2 text-xs leading-5 text-slate-600">
                                {runStateFamily.description}
                                {projectionDetail.safeMessage
                                  ? ` · ${autoReviewDisplayMessage(projectionDetail.safeMessage)}`
                                  : ""}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-slate-500">
                                {autoReviewTechnicalIds({
                                  status: run.status,
                                  detail: projectionDetail,
                                  stageKey:
                                    projection.currentStage ?? run.currentStage,
                                }).map(id => (
                                  <span
                                    key={id}
                                    className="max-w-[12rem] truncate rounded bg-slate-100 px-2 py-0.5"
                                  >
                                    {id}
                                  </span>
                                ))}
                              </div>
                              {activeTimelineItem ? (
                                <p className="mt-2 text-xs text-slate-500">
                                  ตอนนี้:{" "}
                                  {compactText(activeTimelineItem.label) ||
                                    autoReviewStageLabel(
                                      compactText(activeTimelineItem.stageKey)
                                    )}{" "}
                                  · เหลืออีก {remainingTimelineCount} ขั้นตอน
                                </p>
                              ) : null}
                              {runNextAction ? (
                                <p className="mt-1 text-xs text-amber-700">
                                  ถัดไป: {runNextAction}
                                </p>
                              ) : null}
                              {run.errorMessage ? (
                                <p className="mt-2 text-sm text-red-600">
                                  {autoReviewDisplayMessage(run.errorMessage)}
                                </p>
                              ) : null}
                              {lockedAnchors.length > 0 ? (
                                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                  {lockedAnchors.map(anchor => (
                                    <div
                                      key={`${anchor.role}-${anchor.ref || anchor.url}`}
                                      className="rounded-md border bg-slate-50 p-2"
                                    >
                                      <div className="flex items-center gap-2">
                                        {anchor.url ? (
                                          <img
                                            src={anchor.url}
                                            alt={`${anchor.role} locked anchor`}
                                            className="h-10 w-10 rounded border bg-white object-cover"
                                            loading="lazy"
                                          />
                                        ) : null}
                                        <div className="min-w-0">
                                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                            {anchor.role} lock
                                          </p>
                                          <p className="truncate text-xs text-slate-700">
                                            {shortAuditRef(anchor.ref) ||
                                              shortAuditRef(anchor.source) ||
                                              "locked"}
                                          </p>
                                        </div>
                                      </div>
                                      {anchor.hash ? (
                                        <p className="mt-1 truncate text-[11px] text-slate-500">
                                          hash {shortAuditRef(anchor.hash, 18)}
                                        </p>
                                      ) : null}
                                      {anchor.source ? (
                                        <p className="mt-1 truncate text-[11px] text-slate-500">
                                          source {anchor.source}
                                        </p>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              {automationSummary.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-1">
                                  {automationSummary.map(item => (
                                    <span
                                      key={`${item.label}-${item.value}`}
                                      className="rounded border bg-white px-2 py-1 text-[11px] text-slate-600"
                                    >
                                      <span className="font-semibold">
                                        {item.label}
                                      </span>{" "}
                                      {item.value}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {autoStoryboardPlan?.primaryAction.actionId ===
                            "resume_auto_storyboard_review" &&
                          autoStoryboardPlan.activeRunId ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                              onClick={() => startAutoStoryboardReview()}
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              {hyperframesCopy.resumeAutoReview}
                            </Button>
                          ) : null}
                          {runId ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                toggleAutoReviewRunCollapsed(runId)
                              }
                            >
                              {isRunCollapsed ? (
                                <ChevronDown className="mr-2 h-4 w-4" />
                              ) : (
                                <ChevronUp className="mr-2 h-4 w-4" />
                              )}
                              {isRunCollapsed ? "ขยาย" : "ย่อ"}
                            </Button>
                          ) : null}
                          {run.links?.productionProject ? (
                            <a
                              href={run.links.productionProject}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="Open Production project"
                              className="inline-flex h-9 items-center rounded-md border bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                            >
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Production
                            </a>
                          ) : null}
                          {storyboardReviewLink ? (
                            <a
                              href={storyboardReviewLink}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="Open Storyboard review"
                              className="inline-flex h-9 items-center rounded-md border bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                            >
                              Storyboard
                            </a>
                          ) : null}
                          {run.links?.videoEditor ? (
                            <a
                              href={run.links.videoEditor}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="Open Video Editor"
                              className="inline-flex h-9 items-center rounded-md border bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                            >
                              Video Editor
                            </a>
                          ) : null}
                          {run.links?.libraryItem ? (
                            <a
                              href={run.links.libraryItem}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="Open final Library video"
                              className="inline-flex h-9 items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 shadow-sm hover:bg-emerald-100"
                            >
                              Library
                            </a>
                          ) : null}
                          {isAutoReviewRunBlockingStart(run) ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() =>
                                cancelAutoReviewMutation.mutate({
                                  runId: String(run.id),
                                })
                              }
                              disabled={cancelAutoReviewMutation.isPending}
                            >
                              ยกเลิก
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {!isRunCollapsed ? (
                        <div className="mt-4 rounded-lg border bg-slate-50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-slate-900">
                                Timeline
                              </h3>
                              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-500">
                                {usesPreferredTimeline ? "ละเอียด" : "สรุป"}
                              </span>
                              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-500">
                                จบแล้ว {completedTimelineCount}/
                                {timelineItems.length}
                              </span>
                            </div>
                            {runCreditSummary ? (
                              <p className="text-xs text-slate-600">
                                Credit: {runCreditSummary}
                              </p>
                            ) : null}
                            {timelinePanelId ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  toggleAutoReviewPanelCollapsed(
                                    timelinePanelId
                                  )
                                }
                              >
                                {isTimelineCollapsed ? (
                                  <ChevronDown className="mr-2 h-4 w-4" />
                                ) : (
                                  <ChevronUp className="mr-2 h-4 w-4" />
                                )}
                                {isTimelineCollapsed ? "ขยาย" : "ย่อ"}
                              </Button>
                            ) : null}
                          </div>
                          {!isTimelineCollapsed ? (
                            <>
                              <p className="mt-2 text-xs leading-5 text-slate-600">
                                แสดงสิ่งที่เกิดขึ้นแล้ว ขั้นตอนปัจจุบัน
                                งานที่เหลือ blocker, output และสถานะ repair จาก
                                backend projection
                              </p>
                              {runOutputLinks.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  <span className="mr-1 text-[11px] font-medium text-slate-500">
                                    Outputs
                                  </span>
                                  {runOutputLinks
                                    .slice(0, 5)
                                    .map((link: any) => (
                                      <a
                                        key={`${compactText(link.kind)}-${compactText(link.url)}`}
                                        href={compactText(link.url)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
                                      >
                                        {autoReviewLinkLabel(link)}
                                      </a>
                                    ))}
                                  {runOutputLinks.length > 5 ? (
                                    <span className="text-[11px] text-slate-500">
                                      +{runOutputLinks.length - 5}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                              <ol className="mt-3 space-y-2">
                                {timelineItems.map((item, index) => {
                                  const detail = asRecord(item?.detail);
                                  const detailMessage =
                                    autoReviewDisplayMessage(
                                      detail.safeMessage ??
                                        item?.blockerMessage ??
                                        item?.errorMessage
                                    );
                                  const nextAction = compactText(
                                    detail.nextAction
                                  );
                                  const reasonCodes = compactStringList(
                                    detail.reasonCodes
                                  );
                                  const evidenceRefs = compactStringList(
                                    item?.evidenceRefs
                                  );
                                  const qaRefs = compactStringList(
                                    item?.qaVerdictRefs ?? item?.qaRefs
                                  );
                                  const repairRefs = compactStringList(
                                    item?.repairRefs
                                  );
                                  const qualitySummary =
                                    autoReviewTimelineQualitySummary({
                                      status: item?.status,
                                      reasonCodes,
                                      qaRefs,
                                      repairRefs,
                                    });
                                  const itemCreditSummary =
                                    formatAutoReviewCreditSummary(item?.credit);
                                  const outputLinks = Array.isArray(
                                    item?.outputLinks
                                  )
                                    ? item.outputLinks
                                    : [];
                                  const itemStateFamily = autoReviewStateFamily(
                                    {
                                      status: item?.status,
                                      detail,
                                      stageKey: item?.stageKey,
                                    }
                                  );
                                  const technicalIds = autoReviewTechnicalIds({
                                    status: item?.status,
                                    detail,
                                    stageKey: item?.stageKey,
                                  });
                                  const imageAttemptCards =
                                    compactText(item?.stageKey) ===
                                    "image_generation"
                                      ? autoReviewImageAttemptCards(run)
                                      : [];
                                  const promptSkillDebug =
                                    autoReviewPromptSkillDebug(
                                      item?.promptSkillDebug
                                    );
                                  const isCurrentTimelineStage =
                                    activeTimelineStageKey &&
                                    compactText(item?.stageKey) ===
                                      activeTimelineStageKey;
                                  return (
                                    <li
                                      key={`${compactText(item?.stageKey) || "stage"}-${index}`}
                                      className={`relative overflow-hidden rounded-md border p-3 ${
                                        isCurrentTimelineStage
                                          ? autoReviewCurrentStageContainerClass(
                                              {
                                                status: item?.status,
                                                detail,
                                              }
                                            )
                                          : "bg-white"
                                      }`}
                                    >
                                      {isCurrentTimelineStage ? (
                                        <span
                                          className={`absolute inset-y-0 left-0 w-1.5 ${autoReviewCurrentStageAccentClass(
                                            {
                                              status: item?.status,
                                              detail,
                                            }
                                          )}`}
                                          aria-hidden="true"
                                        />
                                      ) : null}
                                      <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span
                                              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${itemStateFamily.className}`}
                                            >
                                              {itemStateFamily.label}
                                            </span>
                                            <span className="text-sm font-medium text-slate-900">
                                              {compactText(item?.label) ||
                                                autoReviewStageLabel(
                                                  compactText(item?.stageKey)
                                                )}
                                            </span>
                                            {isCurrentTimelineStage ? (
                                              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                                                ขั้นตอนปัจจุบัน
                                              </span>
                                            ) : null}
                                            {typeof item?.progressPercent ===
                                            "number" ? (
                                              <span className="text-xs text-slate-400">
                                                {Math.round(
                                                  item.progressPercent
                                                )}
                                                %
                                              </span>
                                            ) : null}
                                          </div>
                                          <p className="mt-1 text-xs text-slate-500">
                                            {itemStateFamily.description}
                                          </p>
                                          {technicalIds.length > 0 ? (
                                            <div className="mt-1 flex flex-wrap gap-1">
                                              {technicalIds.map(id => (
                                                <span
                                                  key={id}
                                                  className="max-w-[11rem] truncate rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500"
                                                >
                                                  {id}
                                                </span>
                                              ))}
                                            </div>
                                          ) : null}
                                          {compactText(item?.activeSubstep) ? (
                                            <p className="mt-1 text-xs text-slate-500">
                                              ขั้นตอนย่อย:{" "}
                                              {compactText(item.activeSubstep)}
                                            </p>
                                          ) : null}
                                          {qualitySummary ? (
                                            <div
                                              className={`mt-2 rounded-md border px-3 py-2 text-xs ${
                                                qualitySummary.tone ===
                                                "success"
                                                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                                  : qualitySummary.tone ===
                                                      "error"
                                                    ? "border-red-200 bg-red-50 text-red-800"
                                                    : "border-amber-200 bg-amber-50 text-amber-800"
                                              }`}
                                            >
                                              <p className="font-semibold">
                                                {qualitySummary.title}
                                              </p>
                                              {qualitySummary.items.length >
                                              0 ? (
                                                <ul className="mt-1 space-y-1">
                                                  {qualitySummary.items.map(
                                                    item => (
                                                      <li key={item}>{item}</li>
                                                    )
                                                  )}
                                                </ul>
                                              ) : null}
                                            </div>
                                          ) : null}
                                          {imageAttemptCards.length > 0 ? (
                                            <div className="mt-3 space-y-2">
                                              <p className="text-[11px] font-semibold text-slate-500">
                                                ประวัติรูปแต่ละรอบ
                                              </p>
                                              {imageAttemptCards.map(card => (
                                                <div
                                                  key={`${run.id}-image-attempt-${card.attempt}`}
                                                  className={`rounded-md border p-2 text-xs ${
                                                    card.tone === "success"
                                                      ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
                                                      : card.tone === "error"
                                                        ? "border-red-200 bg-red-50/70 text-red-900"
                                                        : card.tone ===
                                                            "warning"
                                                          ? "border-amber-200 bg-amber-50/70 text-amber-900"
                                                          : "border-slate-200 bg-slate-50 text-slate-700"
                                                  }`}
                                                >
                                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <span className="font-semibold">
                                                      {card.title}
                                                    </span>
                                                    <div className="flex flex-wrap items-center gap-1">
                                                      {card.selected ? (
                                                        <span className="rounded bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                                                          ใช้สร้าง Storyboard
                                                          Review แล้ว
                                                        </span>
                                                      ) : null}
                                                      <span className="rounded bg-white/80 px-2 py-0.5 text-[11px]">
                                                        {card.status}
                                                      </span>
                                                    </div>
                                                  </div>
                                                  <p className="mt-1">
                                                    {card.message}
                                                  </p>
                                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                                    <Button
                                                      type="button"
                                                      size="sm"
                                                      variant={
                                                        card.selected
                                                          ? "secondary"
                                                          : "default"
                                                      }
                                                      disabled={
                                                        card.selected ||
                                                        !card.canCreateStoryboardReview ||
                                                        selectAutoReviewImageAttemptMutation.isPending
                                                      }
                                                      onClick={() =>
                                                        selectAutoReviewImageAttemptMutation.mutate(
                                                          {
                                                            runId: compactText(
                                                              run.id
                                                            ),
                                                            attempt:
                                                              card.attempt,
                                                          }
                                                        )
                                                      }
                                                      className="h-8 gap-1 rounded-md text-xs"
                                                    >
                                                      {selectAutoReviewImageAttemptMutation.isPending ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                      ) : (
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                      )}
                                                      {card.selected
                                                        ? "ใช้ชุดนี้อยู่"
                                                        : "ใช้ภาพชุดนี้สร้าง Storyboard Review"}
                                                    </Button>
                                                    {card.hasPublishSafetyBlocker ? (
                                                      <span className="text-[11px] font-semibold text-red-700">
                                                        บล็อกการส่งต่อ:
                                                        ภาพเด็กเสื้อผ้าไม่ครบหรือไม่เหมาะกับ
                                                        publish
                                                      </span>
                                                    ) : !card.canCreateStoryboardReview ? (
                                                      <span className="text-[11px] text-amber-700">
                                                        ยังไม่มีภาพหรือเฟรมที่ใช้สร้างได้
                                                      </span>
                                                    ) : card.selected ? (
                                                      <span className="text-[11px] text-sky-700">
                                                        สร้าง Storyboard Review
                                                        จากชุดนี้แล้ว
                                                      </span>
                                                    ) : (
                                                      <span className="text-[11px] text-slate-500">
                                                        ใช้เมื่อระบบเลือกชุดอื่นผิดจากที่ต้องการ
                                                      </span>
                                                    )}
                                                  </div>
                                                  {card.reasons.length > 0 ? (
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                      {card.reasons
                                                        .slice(0, 5)
                                                        .map(reason => (
                                                          <span
                                                            key={reason}
                                                            className="rounded bg-white/80 px-2 py-0.5 text-[11px]"
                                                          >
                                                            {autoReviewFriendlyReason(
                                                              reason
                                                            )}
                                                          </span>
                                                        ))}
                                                    </div>
                                                  ) : null}
                                                  {card.thumbnails.length >
                                                  0 ? (
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                      {card.thumbnails.map(
                                                        thumb => (
                                                          <button
                                                            key={`${card.attempt}-${thumb.unitId}-${thumb.url}`}
                                                            type="button"
                                                            onClick={() =>
                                                              setPreviewAutoReviewImage(
                                                                {
                                                                  url: thumb.url,
                                                                  title:
                                                                    thumb.title,
                                                                }
                                                              )
                                                            }
                                                            className="group relative h-20 w-14 overflow-hidden rounded border bg-white shadow-sm"
                                                            aria-label={`ดูภาพ ${thumb.title}`}
                                                          >
                                                            <img
                                                              src={thumb.url}
                                                              alt={thumb.title}
                                                              className="h-full w-full object-cover"
                                                              loading="lazy"
                                                            />
                                                            <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-[10px] text-white">
                                                              {thumb.status ||
                                                                "image"}
                                                            </span>
                                                            <span className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-slate-700 opacity-0 shadow transition group-hover:opacity-100">
                                                              <Maximize2 className="h-3 w-3" />
                                                            </span>
                                                          </button>
                                                        )
                                                      )}
                                                    </div>
                                                  ) : null}
                                                  {card.promptHash ||
                                                  card.promptLengthChars ? (
                                                    <p className="mt-2 text-[11px] text-slate-500">
                                                      prompt{" "}
                                                      {card.promptHash
                                                        ? shortAuditRef(
                                                            card.promptHash,
                                                            18
                                                          )
                                                        : "-"}{" "}
                                                      {card.promptLengthChars
                                                        ? `· ${card.promptLengthChars} chars`
                                                        : ""}
                                                    </p>
                                                  ) : null}
                                                  {card.prompt ||
                                                  card.promptSnippet ? (
                                                    <details className="mt-2 rounded-md border border-white/70 bg-white/70 px-2 py-1.5 text-[11px] text-slate-700">
                                                      <summary className="cursor-pointer select-none font-semibold text-slate-700">
                                                        ตรวจ Prompt รอบนี้{" "}
                                                        <span className="font-normal text-slate-500">
                                                          {card.prompt
                                                            ? `เต็ม ${card.prompt.length.toLocaleString()} chars`
                                                            : `preview ${card.promptLengthChars ? `${card.promptLengthChars.toLocaleString()} chars` : ""}`}
                                                        </span>
                                                      </summary>
                                                      <textarea
                                                        readOnly
                                                        spellCheck={false}
                                                        rows={14}
                                                        value={
                                                          card.prompt ||
                                                          card.promptSnippet
                                                        }
                                                        className="mt-2 min-h-[18rem] w-full resize-y rounded-md border border-slate-200 bg-white p-2 font-mono text-[11px] leading-5 text-slate-700 shadow-inner"
                                                        aria-label={`Prompt รูปชุดที่ ${card.attempt}`}
                                                      />
                                                    </details>
                                                  ) : null}
                                                </div>
                                              ))}
                                            </div>
                                          ) : null}
                                          {promptSkillDebug ? (
                                            <details
                                              className="mt-3 rounded-md border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs text-slate-700"
                                              open={
                                                Boolean(
                                                  isCurrentTimelineStage
                                                ) ||
                                                compactText(item?.status) ===
                                                  "failed"
                                              }
                                            >
                                              <summary className="cursor-pointer select-none font-semibold text-sky-800">
                                                Prompt จาก skill{" "}
                                                <span className="font-normal text-sky-700">
                                                  {promptSkillDebug.length.toLocaleString()}{" "}
                                                  chars
                                                  {promptSkillDebug.maxOutputChars
                                                    ? ` / limit ${promptSkillDebug.maxOutputChars.toLocaleString()}`
                                                    : ""}
                                                </span>
                                              </summary>
                                              <div className="mt-2 flex flex-wrap gap-1">
                                                {[
                                                  promptSkillDebug.skillId,
                                                  promptSkillDebug.unitId,
                                                  promptSkillDebug.reasonCode,
                                                  promptSkillDebug.status,
                                                  promptSkillDebug.modelId,
                                                  promptSkillDebug.providerName,
                                                  promptSkillDebug.finishReason,
                                                ]
                                                  .filter(Boolean)
                                                  .slice(0, 8)
                                                  .map((meta, metaIndex) => (
                                                    <span
                                                      key={`${meta}-${metaIndex}`}
                                                      className="max-w-[14rem] truncate rounded bg-white px-2 py-0.5 text-[11px] text-slate-600"
                                                    >
                                                      {meta}
                                                    </span>
                                                  ))}
                                                {promptSkillDebug.attempt ? (
                                                  <span className="rounded bg-white px-2 py-0.5 text-[11px] text-slate-600">
                                                    attempt{" "}
                                                    {promptSkillDebug.attempt}
                                                  </span>
                                                ) : null}
                                                {promptSkillDebug.promptAttempt ? (
                                                  <span className="rounded bg-white px-2 py-0.5 text-[11px] text-slate-600">
                                                    prompt attempt{" "}
                                                    {
                                                      promptSkillDebug.promptAttempt
                                                    }
                                                  </span>
                                                ) : null}
                                              </div>
                                              {promptSkillDebug.blockers
                                                .length > 0 ? (
                                                <div className="mt-2 flex flex-wrap gap-1">
                                                  <span className="mr-1 text-[11px] font-medium text-slate-500">
                                                    Blockers
                                                  </span>
                                                  {promptSkillDebug.blockers
                                                    .slice(0, 10)
                                                    .map(blocker => (
                                                      <span
                                                        key={blocker}
                                                        className="max-w-[14rem] truncate rounded bg-red-50 px-2 py-0.5 text-[11px] text-red-700"
                                                      >
                                                        {blocker}
                                                      </span>
                                                    ))}
                                                  {promptSkillDebug.blockers
                                                    .length > 10 ? (
                                                    <span className="text-[11px] text-slate-500">
                                                      +
                                                      {promptSkillDebug.blockers
                                                        .length - 10}
                                                    </span>
                                                  ) : null}
                                                </div>
                                              ) : null}
                                              {promptSkillDebug.fullOutputLogPath ? (
                                                <p className="mt-2 truncate font-mono text-[11px] text-slate-500">
                                                  log:{" "}
                                                  {
                                                    promptSkillDebug.fullOutputLogPath
                                                  }
                                                </p>
                                              ) : null}
                                              <textarea
                                                readOnly
                                                spellCheck={false}
                                                rows={10}
                                                value={promptSkillDebug.prompt}
                                                className="mt-2 min-h-[12rem] w-full resize-y rounded-md border border-sky-200 bg-white p-2 font-mono text-[11px] leading-5 text-slate-700 shadow-inner"
                                                aria-label="Prompt จาก skill product-reference-storyboard"
                                              />
                                            </details>
                                          ) : null}
                                        </div>
                                        {itemCreditSummary ? (
                                          <span className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-500">
                                            Credit: {itemCreditSummary}
                                          </span>
                                        ) : null}
                                      </div>
                                      {detailMessage ? (
                                        <p
                                          className={`mt-2 text-xs leading-5 ${
                                            String(detail.severity) ===
                                              "error" ||
                                            String(detail.severity) ===
                                              "blocked"
                                              ? "text-red-700"
                                              : "text-slate-600"
                                          }`}
                                        >
                                          {detailMessage}
                                        </p>
                                      ) : null}
                                      {nextAction ? (
                                        <p className="mt-1 text-xs text-slate-500">
                                          ถัดไป: {nextAction}
                                        </p>
                                      ) : null}
                                      {reasonCodes.length > 0 ? (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                          <span className="mr-1 text-[11px] font-medium text-slate-500">
                                            ตัวบล็อก
                                          </span>
                                          {reasonCodes.slice(0, 4).map(ref => (
                                            <span
                                              key={ref}
                                              className="max-w-[12rem] truncate rounded bg-red-50 px-2 py-0.5 text-[11px] text-red-700"
                                            >
                                              {ref}
                                            </span>
                                          ))}
                                        </div>
                                      ) : null}
                                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                                        {evidenceRefs.length > 0 ? (
                                          <div className="flex min-w-0 flex-wrap gap-1">
                                            <span className="font-medium">
                                              Evidence
                                            </span>
                                            {evidenceRefs
                                              .slice(0, 3)
                                              .map(ref => (
                                                <AutoReviewRefChip
                                                  key={ref}
                                                  value={ref}
                                                  className="max-w-[11rem] truncate rounded bg-slate-100 px-2 py-0.5"
                                                />
                                              ))}
                                            {evidenceRefs.length > 3 ? (
                                              <span>
                                                +{evidenceRefs.length - 3}
                                              </span>
                                            ) : null}
                                          </div>
                                        ) : null}
                                        {qaRefs.length > 0 ? (
                                          <div className="flex min-w-0 flex-wrap gap-1">
                                            <span className="font-medium">
                                              QA
                                            </span>
                                            {qaRefs.slice(0, 3).map(ref => (
                                              <AutoReviewRefChip
                                                key={ref}
                                                value={ref}
                                                className="max-w-[11rem] truncate rounded bg-sky-50 px-2 py-0.5 text-sky-700"
                                              />
                                            ))}
                                            {qaRefs.length > 3 ? (
                                              <span>+{qaRefs.length - 3}</span>
                                            ) : null}
                                          </div>
                                        ) : null}
                                        {repairRefs.length > 0 ? (
                                          <div className="flex min-w-0 flex-wrap gap-1">
                                            <span className="font-medium">
                                              Repair
                                            </span>
                                            {repairRefs.slice(0, 3).map(ref => (
                                              <AutoReviewRefChip
                                                key={ref}
                                                value={ref}
                                                className="max-w-[11rem] truncate rounded bg-amber-50 px-2 py-0.5 text-amber-700"
                                              />
                                            ))}
                                            {repairRefs.length > 3 ? (
                                              <span>
                                                +{repairRefs.length - 3}
                                              </span>
                                            ) : null}
                                          </div>
                                        ) : null}
                                      </div>
                                      {outputLinks.length > 0 ? (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {outputLinks.map((link: any) => {
                                            const href =
                                              normalizeAutoReviewOutputLinkUrl(
                                                link,
                                                {
                                                  productId:
                                                    run.productId ?? productId,
                                                  runId:
                                                    runHyperframesRenderRef?.runId ||
                                                    runId,
                                                  renderJobId:
                                                    runHyperframesRenderRef?.renderJobId,
                                                }
                                              );
                                            if (!href) return null;
                                            const label =
                                              autoReviewLinkLabel(link);
                                            return (
                                              <a
                                                key={`${href}-${label}`}
                                                href={href}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center rounded border bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                                                aria-label={`Open timeline output ${label}`}
                                              >
                                                <ExternalLink className="mr-1 h-3 w-3" />
                                                {label}
                                              </a>
                                            );
                                          })}
                                        </div>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ol>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : null}
          </section>

          <MarketplaceInsightsSection
            insights={insights}
            isLoading={productInsights.isLoading}
            emptyText="No AI insights have been synced for this product or its source capture yet."
            allowStorytellingAction
          />

          <section
            className={`rounded-lg border bg-white p-6 shadow-sm transition ${isDropActive ? "border-sky-400 ring-4 ring-sky-100" : ""}`}
            onDragOver={event => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setIsDropActive(true);
            }}
            onDragLeave={() => setIsDropActive(false)}
            onDrop={handleDropImage}
          >
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
              multiple
              className="hidden"
              onChange={handleUploadProductImages}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Product Images</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Drag an image from the right panel here or upload files to
                  attach them to this product. ใช้ไฟล์เดียวแบบ multi-view sheet
                  ได้ ถ้าทุกมุมเป็นสินค้าชิ้น/รุ่น/สีเดียวกัน
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={isUploadingProductImage}
                >
                  {uploadMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Upload images
                </Button>
                <div className="rounded-full border bg-slate-50 px-3 py-1 text-xs text-slate-600">
                  {images.length} images
                </div>
              </div>
            </div>
            {productImageOptions.length > 0 ? (
              <div className="mt-4 max-h-[32rem] overflow-y-auto">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {productImageOptions.map((image, index) => {
                    const imageId = image.id;
                    const isSelected = selectedProductImageId === imageId;
                    const isHero = Boolean(image.isHero);
                    return (
                      <figure
                        key={imageId}
                        className={`relative rounded-md border bg-slate-50 p-2 text-left transition ${isHero ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : isSelected ? "border-sky-600 bg-sky-50 ring-2 ring-sky-100" : "border-slate-200"}`}
                      >
                        <div className="absolute left-2 top-2 z-10 flex items-center gap-1">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm hover:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
                            onClick={event => {
                              event.preventDefault();
                              event.stopPropagation();
                              setPreviewAutoReviewImage({
                                url: image.url,
                                title: `Product image ${index + 1}`,
                              });
                            }}
                            aria-label={`ดู product image ${index + 1} แบบเต็มจอ`}
                            title="ดูภาพเต็มจอ"
                          >
                            <Maximize2 className="h-4 w-4" />
                          </button>
                          <a
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm hover:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
                            href={image.url}
                            download
                            target="_blank"
                            rel="noreferrer"
                            onClick={event => event.stopPropagation()}
                            aria-label={`ดาวน์โหลด product image ${index + 1}`}
                            title="ดาวน์โหลดภาพ"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </div>
                        <button
                          type="button"
                          onClick={() => selectProductAnchor(imageId)}
                          aria-pressed={isSelected}
                          aria-label={`Select product anchor image ${index + 1}. ${isSelected ? "Currently selected." : "Not selected."}`}
                          className="block w-full rounded text-left focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
                        >
                          <img
                            src={image.url}
                            alt={`Product image ${index + 1}`}
                            className="h-44 w-full object-contain"
                            loading="lazy"
                            onLoad={event =>
                              rememberImageDimensions(image.id, event)
                            }
                          />
                          <figcaption className="mt-2 space-y-1 text-xs text-slate-500">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-slate-700">
                                {productImageTypeLabel(image.type)}
                              </span>
                              <span className="shrink-0">
                                {formatImageDimensions(
                                  imageDimensions[image.id]
                                )}
                              </span>
                            </div>
                            {image.source ? (
                              <span className="block truncate">
                                {productImageSourceLabel(image.source)}
                              </span>
                            ) : null}
                          </figcaption>
                          {isSelected ? (
                            <span className="mt-1 inline-block rounded bg-sky-600 px-2 py-0.5 text-xs text-white">
                              Selected Anchor
                            </span>
                          ) : null}
                          {isHero ? (
                            <span className="ml-1 mt-1 inline-block rounded bg-emerald-600 px-2 py-0.5 text-xs text-white">
                              Hero / Default
                            </span>
                          ) : null}
                        </button>
                        {image.removableId ? (
                          <button
                            type="button"
                            className="mt-2 w-full rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                            onClick={() =>
                              setProductImageAsHero(image.removableId)
                            }
                            disabled={
                              isHero || setProductHeroImageMutation.isPending
                            }
                          >
                            {isHero
                              ? "Hero image selected"
                              : "Set as Hero image"}
                          </button>
                        ) : null}
                        {image.removableId ? (
                          <button
                            type="button"
                            className="absolute right-2 top-2 flex h-8 items-center justify-center rounded-full bg-white/95 px-2 text-red-600 shadow-sm hover:bg-red-50 hover:text-red-700"
                            onClick={event => {
                              event.preventDefault();
                              event.stopPropagation();
                              removeProductImage(image.removableId);
                            }}
                            disabled={removeProductImageMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">
                              Remove product image {index + 1}
                            </span>
                          </button>
                        ) : null}
                      </figure>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed bg-slate-50 p-8 text-center text-sm text-slate-500">
                Drop generated or library images here, or use Upload images to
                add local product photos.
              </div>
            )}

            {history.length > 0 ? (
              <>
                <h2 className="mt-8 text-lg font-semibold">Update History</h2>
                <div className="mt-3 overflow-x-auto rounded-md border">
                  <table className="min-w-full divide-y text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Captured at</th>
                        <th className="px-3 py-2">Price</th>
                        <th className="px-3 py-2">Commission</th>
                        <th className="px-3 py-2">Sold</th>
                        <th className="px-3 py-2">Rating</th>
                        <th className="px-3 py-2">Reviews</th>
                        <th className="px-3 py-2">By user</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y bg-white">
                      {history.map((snapshot: any) => (
                        <tr key={snapshot.id}>
                          <td className="px-3 py-2">
                            {new Date(snapshot.capturedAt).toLocaleString()}
                          </td>
                          <td className="px-3 py-2">
                            {snapshot.priceCurrent ?? "-"}{" "}
                            {snapshot.currency ?? "THB"}
                          </td>
                          <td className="px-3 py-2">
                            <div>
                              {formatCommissionRateValue(
                                snapshot.commissionRatePercent
                              )}
                            </div>
                            <div className="text-xs text-slate-500">
                              {formatCommissionAmountValue(
                                snapshot.priceCurrent,
                                snapshot.commissionRatePercent,
                                snapshot.currency
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {formatCount(
                              snapshot.soldCountNormalized,
                              snapshot.soldCountText
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {snapshot.ratingScore ?? "-"}
                          </td>
                          <td className="px-3 py-2">
                            {formatCount(
                              snapshot.reviewCountNormalized,
                              snapshot.reviewCountText
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {snapshot.capturedByUserId ?? "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            <h2 className="mt-8 text-lg font-semibold">Description</h2>
            {isEditingProduct ? (
              <textarea
                className="mt-2 min-h-72 w-full rounded-md border px-3 py-2 text-sm leading-6"
                value={productEditForm.descriptionText}
                onChange={event =>
                  updateProductEditField("descriptionText", event.target.value)
                }
              />
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {compactText(item.descriptionText) || "-"}
              </p>
            )}
            <details className="mt-6 rounded-md border bg-slate-50 p-3">
              <summary className="cursor-pointer select-none text-sm font-semibold text-slate-700">
                {t("marketplaceCapture.productDiagnostics.summary")}
              </summary>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                {productDiagnosticsRows.map(row => (
                  <div
                    key={row.label}
                    className="rounded-md border border-slate-200 bg-white p-2"
                  >
                    <dt className="font-medium text-slate-500">{row.label}</dt>
                    <dd className="mt-1 break-words text-slate-800">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          </section>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-4 xl:h-[calc(100dvh-2rem)]">
          <section className="flex h-full min-h-[640px] flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="border-b p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Media Panel</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    History and Library assets tied to this product.
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-full border px-2 py-1">
                  <span className="text-xs font-medium text-slate-600">
                    Product filter
                  </span>
                  <Switch
                    checked={productFilterEnabled}
                    onCheckedChange={setProductFilterEnabled}
                  />
                </div>
              </div>
              <div
                className="mt-4 grid grid-cols-3 gap-2"
                role="tablist"
                aria-label="Media panel source"
              >
                {(
                  [
                    ["history", History, "History"],
                    ["library", Library, "Library"],
                    ["product", PackagePlus, "Product"],
                  ] as const
                ).map(([tab, Icon, label]) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={panelTab === tab}
                    onClick={() => {
                      setPanelTab(tab);
                      if (tab === "product") setMediaTab("image");
                    }}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      panelTab === tab
                        ? "border-sky-500 bg-sky-50 text-sky-700"
                        : "bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
              <div
                className="mt-3 grid grid-cols-3 gap-2"
                role="tablist"
                aria-label="Media type"
              >
                {(["image", "video", "audio"] as ProductMediaTab[]).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={mediaTab === tab}
                    onClick={() => setMediaTab(tab)}
                    disabled={panelTab === "product" && tab !== "image"}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      mediaTab === tab
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {mediaIcon(tab)}
                    {mediaTabLabel(tab)}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                <Search className="h-3.5 w-3.5" />
                {productFilterEnabled
                  ? "Showing assets that match this product. Turn off to show all."
                  : "Filter is off. Showing all recent assets."}
              </div>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto p-4"
              onScroll={handleMediaPanelScroll}
            >
              {panelLoading ? (
                <div className="flex items-center gap-2 rounded-lg border bg-slate-50 p-3 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading media...
                </div>
              ) : null}
              {panelAssets.length === 0 && !panelLoading ? (
                <div className="rounded-lg border border-dashed bg-slate-50 p-6 text-center text-sm text-slate-500">
                  No {mediaTabLabel(mediaTab).toLowerCase()} assets found for
                  this view.
                </div>
              ) : (
                <div className="grid gap-3">
                  {panelAssets.map((asset, index) => (
                    <ProductMediaCard
                      key={`${asset.url}-${index}`}
                      asset={asset}
                      isAttaching={addProductImageMutation.isPending}
                      isDeleting={
                        panelTab === "library" &&
                        deletingLibraryItemId ===
                          Number(asRecord(asset.metadata).libraryItemId)
                      }
                      onAttachImage={attachPanelAssetAsProductImage}
                      onDelete={
                        panelTab === "library"
                          ? deletePanelLibraryAsset
                          : undefined
                      }
                    />
                  ))}
                  {panelTab === "library" &&
                  libraryItems.isFetching &&
                  libraryPanelItems.length > 0 ? (
                    <div className="flex items-center justify-center gap-2 rounded-lg border bg-slate-50 p-3 text-xs text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading more Library items...
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            <div className="border-t bg-slate-50 p-3 text-xs text-slate-500">
              <div className="flex items-center justify-between">
                <span>
                  {panelAssets.length} visible assets
                  {panelTab === "library" && libraryItems.data?.total
                    ? ` / ${libraryItems.data.total} total`
                    : ""}
                </span>
                <a
                  className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900"
                  href="/media-history"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Media History
                </a>
              </div>
            </div>
          </section>
        </aside>
      </div>
      {previewAutoReviewImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={previewAutoReviewImage.title}
          onClick={() => setPreviewAutoReviewImage(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[92vw] overflow-hidden rounded-md bg-white shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <a
              className="absolute right-14 top-2 z-10 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-sm font-medium text-slate-700 shadow hover:bg-white"
              href={previewAutoReviewImage.url}
              download
              target="_blank"
              rel="noreferrer"
              aria-label="ดาวน์โหลดภาพตัวอย่าง"
            >
              <Download className="h-4 w-4" />
              Download
            </a>
            <button
              type="button"
              className="absolute right-2 top-2 z-10 rounded-full bg-white/90 p-2 text-slate-700 shadow hover:bg-white"
              onClick={() => setPreviewAutoReviewImage(null)}
              aria-label="ปิดภาพตัวอย่าง"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={previewAutoReviewImage.url}
              alt={previewAutoReviewImage.title}
              className="max-h-[90vh] max-w-[92vw] object-contain"
            />
            <div className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-2 text-sm text-white">
              {previewAutoReviewImage.title}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
