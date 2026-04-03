/**
 * Media Studio Page - SmartAIHub
 * Full-featured media generation interface with reference images, Auto Prompt, and history
 */

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { HelpButton } from "@/components/help";
import { LocaleToggle } from "@/components/LocaleToggle";
import { useAuth } from "@/contexts/AuthContext";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DashboardCard,
  DashboardSectionHeader,
  DashboardSurface,
} from "@/components/dashboard";
import { StoryboardBatchReviewDialog, type StoryboardReviewTask } from "@/components/media/StoryboardBatchReviewDialog";
import {
  Sparkles,
  Image,
  Video,
  Music,
  Wand2,
  Zap,
  Download,
  Clock,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  RefreshCw,
  X,
  Upload,
  ImagePlus,
  Loader2,
  Check,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Trash2,
  ExternalLink,
  Palette,
  Settings,
  Bot,
  History,
  Layers,
  User,
  ScanFace,
  Maximize2,
  Copy,
  CheckCircle,
  Pencil,
  Search,
  Languages,
  Mic,
  Grid2X2,
  Scissors,
  Crop,
  AlertCircle,
  Library,
  Lock,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { GenerationProgress, type GenerationTask as QueueGenerationTask } from "@/components/chat/media/GenerationProgress";
import { clearTenantPageCache } from "@/hooks/useTenantPage";
import ModelSelectorDialog from "@/components/media/ModelSelectorDialog";
import LibrarySearchPanel from "@/components/media/LibrarySearchPanel";
import { ContentComposerPanel } from "@/components/media/ContentComposerPanel";
import { RenderProgressDialog } from "@/components/videoeditor/RenderProgressDialog";
import { usePushToTalk } from "@/hooks/usePushToTalk";
import { AUTO_MODEL } from "@/lib/chatModelSelection";
import {
  buildTaskLibraryErrorState,
  buildTaskLibraryStateFromAddResult,
  getAddToLibraryErrorMessage,
  getAddToLibrarySuccessMessage,
  getLibraryStatusMeta as getLibraryItemStatusMeta,
  isMediaTaskEligibleForLibraryAdd,
  type LibraryItemTypeFilter,
  type LibrarySearchResultItem,
  type TaskLibraryUIState,
} from "@/lib/libraryUi";
import { isVideoMediaUrl } from "@/lib/media";
import {
  isMediaStudioSkillCompatible,
  sortMediaStudioSkillsForTab,
} from "@/lib/mediaStudioSkillMatching";
import {
  canGenerateInMediaStudio,
  pickMediaStudioSkillForTab,
} from "@/lib/mediaStudioSelection";
import {
  collectGenerationQueueTaskIdentityCandidates,
  getGenerationQueueIdentityCandidates,
  isActiveGenerationQueueStatus,
  isGenerationQueueTaskDismissed,
  isTerminalGenerationQueueStatus,
  mergeGenerationQueueTasks,
  shouldIncludeHistoryTaskInGenerationQueue,
} from "@/lib/mediaStudioGenerationQueue";
import {
  buildMediaStudioProviderAutoOptions,
  formatMediaStudioModelLabel,
  groupMediaStudioModelsByProvider,
  resolveMediaStudioAutoPromptSelection,
  type MediaStudioVisionModelOption,
} from "@/lib/mediaStudioAutoPromptSelection";
import { applySharedContextToMultiVideoText, parseMultiVideoPrompts, splitMultiVideoPromptOutput } from "@/lib/mediaStudioPromptParsing";
import { buildStoryboardVideoProject } from "@/lib/storyboardVideoProject";
import {
  clampReferenceImagesToModelLimit,
  getAllowedLibraryExtensionsForField,
  getModelGenerationModeLabel,
  getModelInputField,
  getModelReferenceImageLimit,
  getModelReferenceInputSupport,
} from "@/lib/mediaModelInputs";
import { buildMediaStudioCommonPayload } from "@/lib/mediaStudioPayload";
import { buildPricingTierKey } from "@shared/mediaModelPricing";
import { videoEditorRenderService } from "@/services/videoEditorService";
import { sanitizeProjectName } from "@smartspec/shared";

import DynamicSkillForm, { type SkillInputSchema, type StyleAction } from "@/components/media/DynamicSkillForm";
import { LibraryFilePicker } from "@/components/library/LibraryFilePicker";
import {
  COMMON_GRIDS,
  detectGrid,
  splitImage,
  createSplitPreview,
  cropImageToAspect,
  getCropRect,
  loadImage,
  downloadSplitImage,
  downloadAllSplitImages,
  downloadCroppedImage,
  COMMON_CROP_RATIOS,
  type SplitResult,
  type CropResult,
  type DetectedGrid,
} from "@/lib/imageGridSplitter";

type MediaType = "image" | "video" | "audio";
type LibraryRecentDaysFilter = "all" | 1 | 3 | 7 | 15 | 30;
type StudioSidebarTab = "history" | "library";
type HistoryGalleryTab = "image" | "video";

interface ReferenceImage {
  url: string;
  name: string;
}

interface ReferenceVideo {
  url: string;
  name: string;
}

interface GeneratedMedia {
  id: string;
  taskId?: string;
  type: MediaType;
  url: string;
  prompt: string;
  model: string;
  createdAt: string;
  creditsUsed?: number;
}

interface StoryboardVideoGenerationContext {
  aspectRatio: string;
  duration?: number;
  model?: string;
  referenceImages: ReferenceImage[];
  referenceVideos: ReferenceVideo[];
  extraParams?: Record<string, any>;
  apiConfig?: Record<string, string>;
  resolution?: string;
  referenceVideoUrl?: string;
  useReferenceVideoUrlFallback?: boolean;
}

// Track individual image generation tasks for progressive preview
interface GenerationTask {
  id: string;
  index: number;
  status: 'queued' | 'generating' | 'completed' | 'error';
  type: MediaType;
  prompt: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  url?: string;
  error?: string;
  backendTaskId?: string;
  providerTaskId?: string;
  statusDetail?: string;
  storyboardContext?: StoryboardVideoGenerationContext;
}

interface StyleOption {
  id: string;
  name: string;
  description: string;
}

interface StyleCategory {
  id: string;
  name: string;
  styles: StyleOption[];
}

interface SearchableFieldOption {
  value: string;
  label: string;
  previewUrl?: string;
}

// Per-tab state structure - each tab has independent controls
interface TabState {
  prompt: string;
  enhancedPrompt: string;
  referenceImages: ReferenceImage[];
  referenceVideos: ReferenceVideo[];
  selectedSkillId: string;
  useAdvancedMode: boolean;
  dynamicFormValues: Record<string, any>;
  selectedStyleCategory: string;
  selectedStyle: string;
  selectedVfxCategory: string;
  selectedVfxEffect: string;
  realisticSkin: boolean;
  faceLock: boolean;
  modelInputValues: Record<string, any>;
  selectedModel: string;
  numImages: number;
  aspectRatio: string;
  duration: number;
  selectedLlmModel: string;
  skillInitialized: boolean;
  modelInitialized: boolean;
}

// Default state for each tab
const createDefaultTabState = (mediaType: MediaType): TabState => ({
  prompt: "",
  enhancedPrompt: "",
  referenceImages: [],
  referenceVideos: [],
  selectedSkillId: "",
  useAdvancedMode: false,
  dynamicFormValues: {},
  selectedStyleCategory: "",
  selectedStyle: "",
  selectedVfxCategory: "",
  selectedVfxEffect: "",
  realisticSkin: false,
  faceLock: false,
  modelInputValues: {},
  selectedModel: "",
  numImages: 1,
  aspectRatio: mediaType === "video" ? (localStorage.getItem("smartspec_aspect_video") || "16:9") : (localStorage.getItem("smartspec_aspect_image") || "1:1"),
  duration: parseInt(localStorage.getItem("smartspec_duration_video") || "5", 10),
  selectedLlmModel: AUTO_MODEL,
  skillInitialized: false,
  modelInitialized: false,
});

// Default prompt for Upscale style - auto-fills when user selects "upscale"
const UPSCALE_DEFAULT_PROMPT = "Upscale and enhance this low-resolution image to high clarity while maintaining the original identity and natural appearance. Restore fine textures, edges, and micro-details without inventing unrealistic features. Remove noise, artifacts, and compression blocks. Do not change the pose, lighting, clothing, or background. Keep the improvement subtle, natural, and faithful to the original.";

/**
 * Parse skill output for "both" mode (image_video_generation skills)
 * Extracts header (title, character, environment) + image prompts vs video prompts
 */
function parseSkillOutputForBothMode(content: string): { imagePrompt: string; videoPrompt: string } | null {
  // Detect image prompts section (English or Thai) - match **Image Prompts:** or **Prompt สร้างภาพ:**
  const imagePromptPatterns = [
    /\*\*Image Prompts:?\*\*/i,
    /\*\*Prompt สร้างภาพ:?\*\*/i,
  ];

  // Detect video prompts section (English or Thai)
  const videoPromptPatterns = [
    /\*\*Video Prompts:?\*\*/i,
    /\*\*Prompt สร้างวิดีโอ:?\*\*/i,
  ];

  // Find the positions of image and video sections
  let imageStart = -1;
  let videoStart = -1;

  for (const pattern of imagePromptPatterns) {
    const match = content.search(pattern);
    if (match !== -1 && (imageStart === -1 || match < imageStart)) {
      imageStart = match;
    }
  }

  for (const pattern of videoPromptPatterns) {
    const match = content.search(pattern);
    if (match !== -1 && (videoStart === -1 || match < videoStart)) {
      videoStart = match;
    }
  }

  // If both sections not found, return null (don't split)
  if (imageStart === -1 || videoStart === -1) {
    return null;
  }

  // Extract header (everything before the first prompt section)
  const firstSectionStart = Math.min(imageStart, videoStart);
  const header = content.substring(0, firstSectionStart).trim();

  // Determine section order and extract prompts
  let imageSection: string;
  let videoSection: string;

  if (imageStart < videoStart) {
    // Image section comes first
    imageSection = content.substring(imageStart, videoStart).trim();
    videoSection = content.substring(videoStart).trim();
  } else {
    // Video section comes first
    videoSection = content.substring(videoStart, imageStart).trim();
    imageSection = content.substring(imageStart).trim();
  }

  // Combine header with each section
  const imagePrompt = `${header}\n\n${imageSection}`;
  const videoPrompt = `${header}\n\n${videoSection}`;

  return { imagePrompt, videoPrompt };
}

function parseArrayFieldValue(
  raw: unknown,
  options: { splitLines?: boolean } = {},
): unknown[] {
  const splitLines = options.splitLines ?? true;
  if (Array.isArray(raw)) return raw;
  if (raw === null || raw === undefined) return [];

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      return [parsed];
    } catch {
      if (!splitLines) {
        return [trimmed];
      }
      return trimmed
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    }
  }

  return [raw];
}

function getTemplatePathValue(source: unknown, path: string): unknown {
  const segments = path.split(".").filter(Boolean);
  let current: unknown = source;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function interpolateTemplate(template: unknown, context: Record<string, unknown>): unknown {
  if (typeof template === "string") {
    const tokenPattern = /\{\{\s*([^}]+)\s*\}\}/g;
    const fullToken = template.match(/^\s*\{\{\s*([^}]+)\s*\}\}\s*$/);
    if (fullToken) {
      const fullPath = fullToken[1]?.trim();
      if (fullPath) {
        const fullValue = getTemplatePathValue(context, fullPath);
        return fullValue ?? "";
      }
      return "";
    }
    return template.replace(tokenPattern, (_match, rawPath: string) => {
      const path = rawPath.trim();
      const value = path ? getTemplatePathValue(context, path) : undefined;
      return value === null || value === undefined ? "" : String(value);
    });
  }

  if (Array.isArray(template)) {
    return template.map((item) => interpolateTemplate(item, context));
  }

  if (template && typeof template === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template as Record<string, unknown>)) {
      out[key] = interpolateTemplate(value, context);
    }
    return out;
  }

  return template;
}

function resolveArrayFieldRuntimeValue(
  field: Record<string, any>,
  rawValue: unknown,
  context: Record<string, unknown>
): unknown[] {
  // Prompt-synced array fields should default to a single item (full prompt),
  // while user-entered array strings can still use newline splitting.
  const splitLines = field.syncWith === "prompt" ? false : true;
  const items = parseArrayFieldValue(rawValue, { splitLines });
  const template = field.itemTemplate;
  if (!template) {
    return items;
  }

  return items.map((item, index) => interpolateTemplate(template, {
    ...context,
    value: item,
    item,
    index,
  }));
}

function countCharactersForPricing(value: unknown, options: { ignoreWhitespace?: boolean } = {}): number {
  const ignoreWhitespace = options.ignoreWhitespace === true;
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") {
    return ignoreWhitespace ? value.replace(/\s+/g, "").length : value.length;
  }
  if (Array.isArray(value)) {
    return value.reduce((sum: number, item: unknown) => sum + countCharactersForPricing(item, options), 0);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") {
      return ignoreWhitespace ? record.text.replace(/\s+/g, "").length : record.text.length;
    }
    return Object.values(record).reduce((sum: number, item: unknown) => sum + countCharactersForPricing(item, options), 0);
  }
  return 0;
}

function countItemsForPricing(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value === "string") return value.trim().length > 0 ? 1 : 0;
  return 1;
}

function measurePricingUnits(
  value: unknown,
  metric: string,
  options: { ignoreWhitespace?: boolean } = {},
): number {
  if (metric === "items") {
    return countItemsForPricing(value);
  }
  return countCharactersForPricing(value, options);
}

const API_CONFIG_KEYS_ALLOWING_WHITESPACE_VALUES = new Set([
  "text_prefix",
  "textPrefix",
  "audio_text_prefix",
  "audioTextPrefix",
  "input_text_prefix",
  "inputTextPrefix",
  "text_suffix",
  "textSuffix",
  "audio_text_suffix",
  "audioTextSuffix",
  "input_text_suffix",
  "inputTextSuffix",
]);

function setApiConfigValue(apiConfig: Record<string, string>, key: string, value: unknown): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    if (API_CONFIG_KEYS_ALLOWING_WHITESPACE_VALUES.has(key)) {
      if (value.length > 0) {
        apiConfig[key] = value;
      }
      return;
    }
    const normalized = value.trim();
    if (normalized.length > 0) {
      apiConfig[key] = normalized;
    }
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    apiConfig[key] = String(value);
  }
}

function buildApiConfigFromModelConfig(modelConfig: Record<string, unknown> | null | undefined): Record<string, string> {
  const apiConfig: Record<string, string> = {};
  if (!modelConfig || typeof modelConfig !== "object") {
    return apiConfig;
  }
  setApiConfigValue(apiConfig, "endpoint", modelConfig.apiEndpoint);
  setApiConfigValue(apiConfig, "query_endpoint", modelConfig.apiQueryEndpoint);
  setApiConfigValue(apiConfig, "payload_format", modelConfig.apiPayloadFormat);
  setApiConfigValue(apiConfig, "kie_model_id", modelConfig.kieModelId);

  const customApiConfig = modelConfig.apiConfig;
  if (customApiConfig && typeof customApiConfig === "object" && !Array.isArray(customApiConfig)) {
    for (const [key, value] of Object.entries(customApiConfig as Record<string, unknown>)) {
      setApiConfigValue(apiConfig, key, value);
    }
  }

  return apiConfig;
}

function normalizeModelFieldOptions(raw: unknown): SearchableFieldOption[] {
  if (!Array.isArray(raw)) return [];
  const options: SearchableFieldOption[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const value = item.trim();
      if (!value) continue;
      options.push({ value, label: value });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const valueRaw = record.value;
    const labelRaw = record.label;
    const previewUrlRaw = record.previewUrl;
    const value = typeof valueRaw === "string" ? valueRaw.trim() : "";
    const label = typeof labelRaw === "string" ? labelRaw.trim() : value;
    const previewUrl = typeof previewUrlRaw === "string" ? previewUrlRaw.trim() : "";
    if (!value) continue;
    options.push({ value, label: label || value, ...(previewUrl ? { previewUrl } : {}) });
  }
  return options;
}

function hasProviderApiOptionsSource(field: Record<string, any> | null | undefined): boolean {
  if (!field || typeof field !== "object") return false;
  const source = field.optionsSource;
  if (!source || typeof source !== "object") return false;
  const sourceType = String((source as Record<string, unknown>).type || "").toLowerCase();
  return sourceType === "provider_api" || sourceType === "public_api";
}

function isSearchableModelField(field: Record<string, any> | null | undefined): boolean {
  if (!field || typeof field !== "object") return false;
  if (field.searchable === true) return true;
  return hasProviderApiOptionsSource(field);
}

function isVoiceSelectionField(field: Record<string, any> | null | undefined): boolean {
  if (!field || typeof field !== "object") return false;
  const normalizedKey = String(field.key ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]/g, "");
  return normalizedKey === "voice" || normalizedKey === "voiceid";
}

function isUvoiceVoiceSelectionField(
  providerName: unknown,
  field: Record<string, any> | null | undefined,
): boolean {
  return String(providerName ?? "").trim().toLowerCase() === "uvoice" && isVoiceSelectionField(field);
}

function inferModelInputSyncTarget(field: Record<string, any> | null | undefined): string {
  if (!field || typeof field !== "object") {
    return "none";
  }

  const rawSyncWith = String(field.syncWith ?? "").trim();
  if (rawSyncWith && rawSyncWith !== "none") {
    return rawSyncWith;
  }

  const type = String(field.type ?? "").trim().toLowerCase();
  if (type === "image_urls" || type === "audio_urls") {
    return "reference_images";
  }
  if (type === "video_urls") {
    return "reference_videos";
  }

  const normalizedKey = String(field.key ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (normalizedKey === "prompt" || normalizedKey.endsWith("prompt")) {
    return "prompt";
  }
  if (normalizedKey.includes("aspect") && normalizedKey.includes("ratio")) {
    return "aspect_ratio";
  }
  if (
    normalizedKey.includes("imageurls")
    || normalizedKey.includes("imageurl")
    || normalizedKey.includes("referenceimages")
    || normalizedKey.includes("referenceimage")
  ) {
    return "reference_images";
  }
  if (
    normalizedKey.includes("videourls")
    || normalizedKey.includes("videourl")
    || normalizedKey.includes("referencevideos")
    || normalizedKey.includes("referencevideo")
  ) {
    return "reference_videos";
  }

  return "none";
}

type MediaHistoryTaskLite = {
  id: string;
  taskId?: string | null;
  status?: string | null;
  mediaType?: MediaType | null;
  prompt?: string | null;
  model?: string | null;
  resultUrl?: string | null;
  errorMessage?: string | null;
  createdAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
};

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function normalizeQueueStatus(status: string | undefined | null): QueueGenerationTask["status"] {
  switch ((status || "").toLowerCase()) {
    case "queued":
      return "queued";
    case "pending":
      return "pending";
    case "processing":
      return "processing";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "generating":
      return "processing";
    case "error":
      return "failed";
    default:
      return "pending";
  }
}

function getQueueProgress(status: QueueGenerationTask["status"]): number {
  switch (status) {
    case "queued":
      return 10;
    case "pending":
      return 25;
    case "processing":
      return 60;
    case "completed":
      return 100;
    case "failed":
    case "cancelled":
      return 100;
    default:
      return 0;
  }
}

export default function MediaStudio() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { t: tNs } = useScopedTranslation(["media", "common", "billing"]);
  const [, setLocation] = useLocation();
  const t = (key: string, params?: Record<string, string | number>) => {
    if (key.startsWith("mediaStudio.")) {
      return tNs(key.slice("mediaStudio.".length), params);
    }
    if (key.startsWith("common.")) {
      return tNs(key.slice("common.".length), params);
    }
    if (key.startsWith("credits.")) {
      return tNs(key.slice("credits.".length), params);
    }
    return tNs(key, params);
  };

  // Active tab state
  const [activeTab, setActiveTab] = useState<MediaType>("image");
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [attachTarget, setAttachTarget] = useState<{ kind: "blog" | "page"; id: string } | null>(null);
  const [isAttachingContent, setIsAttachingContent] = useState(false);
  const autoGenerateRequestRef = useRef<{ tab: MediaType; prompt: string; model?: string } | null>(null);
  const autoGenerateTriggeredRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedType = params.get("type") || params.get("tab");
    const requestedPrompt = params.get("prompt") || params.get("message");
    const requestedModel = params.get("model");
    const requestedAutoStart = params.get("autostart") === "1" || params.get("autostart") === "true";
    const requestedReferenceImages = params.getAll("referenceImages");
    const requestedReferenceNames = params.getAll("referenceNames");
    const requestedAspectRatio = params.get("aspectRatio") || params.get("aspect_ratio");
    const requestedResolution = params.get("resolution");
    const requestedOutputFormat = params.get("outputFormat") || params.get("output_format");
    const requestedDuration = params.get("duration");
    const requestedReferenceVideoUrl = params.get("referenceVideoUrl") || params.get("reference_video_url");
    const requestedReferenceVideoUrls = params.getAll("referenceVideoUrls");
    const requestedReferenceStyleUrl = params.get("referenceStyleUrl") || params.get("reference_style_url");
    const requestedExtraParamsRaw = params.get("extraParams") || params.get("extra_params");
    const requestedAttachTarget = params.get("attachTarget");

    const resolvedTab: MediaType | null =
      requestedType === "video" || requestedType === "audio" || requestedType === "image"
        ? requestedType
        : null;

    const parseJsonObject = (value: string | null): Record<string, any> | null => {
      if (!value) return null;
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    };
    const requestedExtraParams = parseJsonObject(requestedExtraParamsRaw);

    if (resolvedTab) {
      setActiveTab(resolvedTab);
    }

    if (requestedPrompt || requestedModel) {
      const targetTab = resolvedTab || "image";
      setTabStates((prev) => ({
        ...prev,
        [targetTab]: {
          ...prev[targetTab],
          ...(requestedPrompt ? { prompt: requestedPrompt } : {}),
          ...(requestedModel ? { selectedModel: requestedModel } : {}),
          ...(requestedAspectRatio ? { aspectRatio: requestedAspectRatio } : {}),
          ...(requestedResolution || requestedOutputFormat || requestedDuration || requestedReferenceVideoUrl || requestedReferenceStyleUrl || requestedExtraParams
            ? {
                modelInputValues: {
                  ...prev[targetTab].modelInputValues,
                  ...(requestedResolution ? { resolution: requestedResolution } : {}),
                  ...(requestedOutputFormat ? { outputFormat: requestedOutputFormat, output_format: requestedOutputFormat } : {}),
                  ...(requestedDuration ? { duration: Number(requestedDuration) } : {}),
                  ...(requestedReferenceVideoUrl ? { referenceVideoUrl: requestedReferenceVideoUrl, reference_video_url: requestedReferenceVideoUrl } : {}),
                  ...(requestedReferenceStyleUrl ? { referenceStyleUrl: requestedReferenceStyleUrl, reference_style_url: requestedReferenceStyleUrl } : {}),
                  ...(requestedExtraParams ?? {}),
                },
              }
            : {}),
        },
      }));

      if (requestedAutoStart) {
        autoGenerateRequestRef.current = {
          tab: targetTab,
          prompt: requestedPrompt || "",
          model: requestedModel || undefined,
        };
        autoGenerateTriggeredRef.current = false;
      }
    }

    const normalizeReferenceValue = (value: string | null | undefined) => (value || "").trim();
    const parseReferenceImagesParam = (): string[] => {
      if (requestedReferenceImages.length > 0) {
        return requestedReferenceImages
          .flatMap((value) => {
            const trimmed = value.trim();
            if (!trimmed) return [];
            if (trimmed.startsWith("[")) {
              try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                  return parsed
                    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
                    .filter(Boolean);
                }
              } catch {
                return [trimmed];
              }
            }
            return [trimmed];
          })
          .filter(Boolean);
      }

      const raw = params.get("referenceImages");
      if (!raw) return [];

      const trimmed = raw.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed
              .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
              .filter(Boolean);
          }
        } catch {
          return [trimmed];
        }
      }

      return trimmed
        .split(/[,\n|]+/g)
        .map((value) => value.trim())
        .filter(Boolean);
    };

    const referenceUrls = parseReferenceImagesParam();
    if (referenceUrls.length > 0) {
      const normalizedNames = requestedReferenceNames.map(normalizeReferenceValue).filter(Boolean);
      const referenceImages = referenceUrls.map((url, index) => ({
        url,
        name: normalizedNames[index] || `Reference ${index + 1}`,
      }));

      const targetTab = resolvedTab || "image";
      setTabStates((prev) => ({
        ...prev,
        [targetTab]: {
          ...prev[targetTab],
          referenceImages,
        },
        }));
    }

    const parseReferenceVideoUrlsParam = (): string[] => {
      if (requestedReferenceVideoUrl) {
        return [requestedReferenceVideoUrl.trim()].filter(Boolean);
      }

      if (requestedReferenceVideoUrls.length > 0) {
        return requestedReferenceVideoUrls
          .flatMap((value) => {
            const trimmed = value.trim();
            if (!trimmed) return [];
            if (trimmed.startsWith("[")) {
              try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                  return parsed
                    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
                    .filter(Boolean);
                }
              } catch {
                return [trimmed];
              }
            }
            return [trimmed];
          })
          .filter(Boolean);
      }

      const raw = params.get("referenceVideoUrls") || params.get("referenceVideos");
      if (!raw) return [];

      const trimmed = raw.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed
              .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
              .filter(Boolean);
          }
        } catch {
          return [trimmed];
        }
      }

      return trimmed
        .split(/[,\n|]+/g)
        .map((value) => value.trim())
        .filter(Boolean);
    };

    const referenceVideoUrls = parseReferenceVideoUrlsParam();
    if (referenceVideoUrls.length > 0) {
      const referenceVideos = referenceVideoUrls.map((url, index) => ({
        url,
        name: `Reference Video ${index + 1}`,
      }));

      const targetTab = resolvedTab || "video";
      setTabStates((prev) => ({
        ...prev,
        [targetTab]: {
          ...prev[targetTab],
          referenceVideos,
        },
      }));
    }

    if (requestedAttachTarget) {
      const [kind, id] = requestedAttachTarget.split(":", 2);
      if ((kind === "blog" || kind === "page") && id) {
        setAttachTarget({ kind, id });
      }
    }
  }, []);

  // Per-tab state - each tab has independent controls
  const [tabStates, setTabStates] = useState<Record<MediaType, TabState>>(() => ({
    image: createDefaultTabState("image"),
    video: createDefaultTabState("video"),
    audio: createDefaultTabState("audio"),
  }));

  // Helper to update a specific field in the current tab's state
  const updateTabState = useCallback(<K extends keyof TabState>(field: K, value: TabState[K]) => {
    setTabStates(prev => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], [field]: value }
    }));
  }, [activeTab]);

  // Helper to update multiple fields at once
  const updateTabStateMultiple = useCallback((updates: Partial<TabState>) => {
    setTabStates(prev => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], ...updates }
    }));
  }, [activeTab]);

  // Derived state from current tab (for easier access)
  const currentTabState = tabStates[activeTab];
  const prompt = currentTabState.prompt;
  const enhancedPrompt = currentTabState.enhancedPrompt;
  const referenceImages = currentTabState.referenceImages;
  const referenceVideos = currentTabState.referenceVideos;
  const selectedSkillId = currentTabState.selectedSkillId;
  const useAdvancedMode = currentTabState.useAdvancedMode;
  const dynamicFormValues = currentTabState.dynamicFormValues;
  const selectedStyleCategory = currentTabState.selectedStyleCategory;
  const selectedStyle = currentTabState.selectedStyle;
  const selectedVfxCategory = currentTabState.selectedVfxCategory;
  const selectedVfxEffect = currentTabState.selectedVfxEffect;
  const realisticSkin = currentTabState.realisticSkin;
  const faceLock = currentTabState.faceLock;
  const modelInputValues = currentTabState.modelInputValues;
  const selectedModel = currentTabState.selectedModel;
  const numImages = currentTabState.numImages;
  const aspectRatio = currentTabState.aspectRatio;
  const duration = currentTabState.duration;
  const selectedLlmModel = currentTabState.selectedLlmModel;
  const skillInitialized = currentTabState.skillInitialized;
  const modelInitialized = currentTabState.modelInitialized;
  const currentPromptBundle = useMemo(() => splitMultiVideoPromptOutput((enhancedPrompt || prompt).trim()), [enhancedPrompt, prompt]);
  const [referenceNotesEditorOpen, setReferenceNotesEditorOpen] = useState(false);
  const [referenceNotesDraft, setReferenceNotesDraft] = useState("");

  // Setter functions that update the current tab's state
  const setPrompt = useCallback((value: string | ((prev: string) => string)) => {
    setTabStates(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        prompt: typeof value === 'function' ? value(prev[activeTab].prompt) : value
      }
    }));
  }, [activeTab]);

  const setEnhancedPrompt = useCallback((value: string | ((prev: string) => string)) => {
    setTabStates(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        enhancedPrompt: typeof value === 'function' ? value(prev[activeTab].enhancedPrompt) : value
      }
    }));
  }, [activeTab]);

  const setReferenceImages = useCallback((value: ReferenceImage[] | ((prev: ReferenceImage[]) => ReferenceImage[])) => {
    setTabStates(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        referenceImages: typeof value === 'function' ? value(prev[activeTab].referenceImages) : value
      }
    }));
  }, [activeTab]);

  const setReferenceVideos = useCallback((value: ReferenceVideo[] | ((prev: ReferenceVideo[]) => ReferenceVideo[])) => {
    setTabStates(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        referenceVideos: typeof value === 'function' ? value(prev[activeTab].referenceVideos) : value
      }
    }));
  }, [activeTab]);

  const setSelectedSkillId = useCallback((value: string) => updateTabState('selectedSkillId', value), [updateTabState]);
  const setUseAdvancedMode = useCallback((value: boolean) => updateTabState('useAdvancedMode', value), [updateTabState]);
  const setDynamicFormValues = useCallback((value: Record<string, any>) => updateTabState('dynamicFormValues', value), [updateTabState]);
  const setSelectedStyleCategory = useCallback((value: string) => updateTabState('selectedStyleCategory', value), [updateTabState]);
  const setSelectedStyle = useCallback((value: string) => updateTabState('selectedStyle', value), [updateTabState]);
  const setSelectedVfxCategory = useCallback((value: string) => updateTabState('selectedVfxCategory', value), [updateTabState]);
  const setSelectedVfxEffect = useCallback((value: string) => updateTabState('selectedVfxEffect', value), [updateTabState]);
  const setRealisticSkin = useCallback((value: boolean) => updateTabState('realisticSkin', value), [updateTabState]);
  const setFaceLock = useCallback((value: boolean) => updateTabState('faceLock', value), [updateTabState]);
  const setModelInputValues = useCallback((value: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => {
    setTabStates(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        modelInputValues: typeof value === 'function' ? value(prev[activeTab].modelInputValues) : value
      }
    }));
  }, [activeTab]);
  const setSelectedModel = useCallback((value: string) => updateTabState('selectedModel', value), [updateTabState]);
  const setNumImages = useCallback((value: number) => updateTabState('numImages', value), [updateTabState]);
  const setAspectRatio = useCallback((value: string) => updateTabState('aspectRatio', value), [updateTabState]);
  const setDuration = useCallback((value: number) => updateTabState('duration', value), [updateTabState]);
  const setSelectedLlmModel = useCallback((value: string) => updateTabState('selectedLlmModel', value), [updateTabState]);
  const setSkillInitialized = useCallback((value: boolean) => updateTabState('skillInitialized', value), [updateTabState]);
  const setModelInitialized = useCallback((value: boolean) => updateTabState('modelInitialized', value), [updateTabState]);

  const applySharedReferenceNotes = useCallback((sharedContext: string) => {
    const currentText = promptTextareaRef.current?.value?.trim() || (enhancedPrompt || prompt).trim();
    const updatedText = applySharedContextToMultiVideoText(currentText, sharedContext);

    if (enhancedPrompt) {
      setEnhancedPrompt(updatedText);
    } else {
      setPrompt(updatedText);
    }
  }, [enhancedPrompt, prompt, setEnhancedPrompt, setPrompt]);

  const openReferenceNotesEditor = useCallback(() => {
    setReferenceNotesDraft(currentPromptBundle.sharedContext);
    setReferenceNotesEditorOpen(true);
  }, [currentPromptBundle.sharedContext]);

  const regenerateReferenceNotes = useCallback(() => {
    setReferenceNotesDraft(currentPromptBundle.sharedContext);
    setReferenceNotesEditorOpen(true);
  }, [currentPromptBundle.sharedContext]);

  const saveReferenceNotes = useCallback(() => {
    applySharedReferenceNotes(referenceNotesDraft);
    setReferenceNotesEditorOpen(false);
  }, [applySharedReferenceNotes, referenceNotesDraft]);

  // Loading state (global)
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Split prompts for image_video_generation skills with outputType="both"
  const [imageTabPrompt, setImageTabPrompt] = useState<string | null>(null);
  const [videoTabPrompt, setVideoTabPrompt] = useState<string | null>(null);

  // Video output type (Multi Shot vs Multi Video) - persisted in localStorage
  const [videoOutputType, setVideoOutputType] = useState<"multi-shot" | "multi-video">(() => {
    const saved = localStorage.getItem("smartspec_video_output_type");
    return (saved === "multi-shot" || saved === "multi-video") ? saved : "multi-shot";
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  // Ref to track current prompt textarea value (for reliable history storage)
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Generation state (global - shows results from any tab)
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedMedia, setGeneratedMedia] = useState<GeneratedMedia[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(true);
  // Track multiple generation tasks for progressive preview (when count > 1)
  const [generationTasks, setGenerationTasks] = useState<GenerationTask[]>([]);
  const [dismissedGenerationQueueTaskIds, setDismissedGenerationQueueTaskIds] = useState<Set<string>>(() => new Set());
  const [trackedGenerationQueueTaskIds, setTrackedGenerationQueueTaskIds] = useState<Set<string>>(() => new Set());
  const [isGenerationQueueCollapsed, setIsGenerationQueueCollapsed] = useState(false);
  const [isGenerationQueueHidden, setIsGenerationQueueHidden] = useState(false);
  const [focusedGenerationTaskId, setFocusedGenerationTaskId] = useState<string | null>(null);
  const [storyboardReviewOpen, setStoryboardReviewOpen] = useState(false);
  const [storyboardReviewTaskIds, setStoryboardReviewTaskIds] = useState<string[]>([]);
  const [selectedStoryboardTaskIds, setSelectedStoryboardTaskIds] = useState<Set<string>>(new Set());
  const [isCompoundingStoryboard, setIsCompoundingStoryboard] = useState(false);
  const [isCreatingStoryboardProject, setIsCreatingStoryboardProject] = useState(false);
  const [regeneratingStoryboardTaskId, setRegeneratingStoryboardTaskId] = useState<string | null>(null);
  const [storyboardCompoundStatus, setStoryboardCompoundStatus] = useState<string | null>(null);
  const [storyboardProjectLink, setStoryboardProjectLink] = useState<string | null>(null);
  const [storyboardRenderJobId, setStoryboardRenderJobId] = useState<string | null>(null);
  const [previewContextTab, setPreviewContextTab] = useState<MediaType | null>(null);
  const autoPreviewSessionStartRef = useRef<number>(0);
  const autoPreviewWindowUntilRef = useRef<number>(0);
  const autoPreviewSeenTaskIdsRef = useRef<Set<string>>(new Set());
  // Track session start time to filter out old failed tasks from History Gallery
  const [sessionStartTime] = useState<Date>(() => new Date());
  const [expiredUrls, setExpiredUrls] = useState<Set<string>>(() => new Set());
  const markExpired = useCallback((url: string) => {
    setExpiredUrls((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }, []);
  const [taskLibraryState, setTaskLibraryState] = useState<Record<string, TaskLibraryUIState>>({});
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [debouncedLibrarySearchQuery, setDebouncedLibrarySearchQuery] = useState("");
  const [libraryRecentDays, setLibraryRecentDays] = useState<LibraryRecentDaysFilter>(7);
  const [libraryItemTypeFilter, setLibraryItemTypeFilter] = useState<LibraryItemTypeFilter>("all");
  const [selectedLibraryItemId, setSelectedLibraryItemId] = useState<number | null>(null);
  const [activeSidebarTab, setActiveSidebarTab] = useState<StudioSidebarTab>("history");
  const [historyGalleryTab, setHistoryGalleryTab] = useState<HistoryGalleryTab>("image");

  const openPreview = useCallback((url: string | null | undefined, contextTab: MediaType | null = activeTab) => {
    if (!url) return;
    setPreviewUrl(url);
    setPreviewContextTab(contextTab);
    setIsPreviewCollapsed(false);
  }, [activeTab]);

  // Dialog states (global)
  const [showStyleDialog, setShowStyleDialog] = useState(false);
  const [showVfxDialog, setShowVfxDialog] = useState(false);
  const [showSkillDialog, setShowSkillDialog] = useState(false);

  // Translation state (global)
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translationCopied, setTranslationCopied] = useState(false);
  const translateMutation = trpc.translation.translate.useMutation({
    onSuccess: (data) => {
      setTranslatedText(data.translatedText);
      setShowTranslation(true);
      setIsTranslating(false);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Translation failed');
      setIsTranslating(false);
    },
  });

  // Push-to-talk (uses current tab's prompt)
  const { isRecording: isPttRecording, isTranscribing: isPttTranscribing, startRecording: pttStart, stopRecording: pttStop } = usePushToTalk({
    onTranscription: (text) => {
      if (enhancedPrompt) {
        setEnhancedPrompt((prev) => prev ? `${prev} ${text}` : text);
      } else {
        setPrompt((prev) => prev ? `${prev} ${text}` : text);
      }
    },
    onError: (err) => toast.error(err),
  });

  // Model selection dialog state
  const [showModelDialog, setShowModelDialog] = useState(false);

  // Drag & drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isVideoDraggingOver, setIsVideoDraggingOver] = useState(false);

  // Image lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    prompt: string;
    model?: string;
    createdAt?: string;
  } | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Grid split state
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [splitImageUrl, setSplitImageUrl] = useState<string | null>(null);
  const [splitGridRows, setSplitGridRows] = useState(2);
  const [splitGridCols, setSplitGridCols] = useState(2);
  const [splitPreviewUrl, setSplitPreviewUrl] = useState<string | null>(null);
  const [splitResults, setSplitResults] = useState<SplitResult[]>([]);
  const [isSplitting, setIsSplitting] = useState(false);
  const [imageEditorMode, setImageEditorMode] = useState<"split" | "crop">("split");
  const [cropAspectRatio, setCropAspectRatio] = useState("1:1");
  const [cropResult, setCropResult] = useState<CropResult | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [cropFocus, setCropFocus] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const [cropScale, setCropScale] = useState(1);
  const [cropSourceSize, setCropSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [cropDisplayRect, setCropDisplayRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const cropPreviewContainerRef = useRef<HTMLDivElement | null>(null);
  const cropPreviewImageRef = useRef<HTMLImageElement | null>(null);
  const cropDragStartRef = useRef<{ clientX: number; clientY: number; focusX: number; focusY: number } | null>(null);
  const [detectedGrid, setDetectedGrid] = useState<DetectedGrid | null>(null);
  const [isDetectingGrid, setIsDetectingGrid] = useState(false);

  // LLM model search (UI state, not per-tab)
  const [llmModelSearch, setLlmModelSearch] = useState("");
  const [fieldPickerOpenKey, setFieldPickerOpenKey] = useState<string | null>(null);
  const [fieldOptionsCache, setFieldOptionsCache] = useState<Record<string, SearchableFieldOption[]>>({});
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingVoicePreviewKey, setPlayingVoicePreviewKey] = useState<string | null>(null);
  const [loadingVoicePreviewKey, setLoadingVoicePreviewKey] = useState<string | null>(null);

  // API queries
  const { data: credits } = trpc.credits.balance.useQuery();
  const { data: styleCategories } = trpc.skills.getStyleCategories.useQuery();
  const { data: vfxCategories } = trpc.skills.getVFXCategories.useQuery();
  // Fetch user-visible skills (respects per-user visibility settings)
  const { data: userVisibleSkillsRaw } = trpc.skills.getUserVisibleSkills.useQuery({});
  // Map to the shape expected by SkillSelectorDialog and skill selection logic
  const skillsList = useMemo(() => {
    if (!userVisibleSkillsRaw?.skills) return undefined;
    return userVisibleSkillsRaw.skills.map((s) => ({
      id: s.slug,
      name: s.name,
      description: s.description || "",
      icon: s.icon || "sparkles",
      // Map DB category (underscored) to type (hyphenated) for compatibility
      type: (s.category || "other").replace(/_/g, "-"),
      creditMultiplier: Number(s.creditMultiplier) || 1,
      enabledByDefault: s.enabledByDefault ?? true,
      priority: s.priority ?? 50,
      hasSkillFile: false,
      // executionMode determines which endpoint to use:
      // "enhance-prompt" -> enhancePrompt endpoint
      // "llm-only" or undefined -> executeCustomSkill endpoint
      executionMode: s.executionMode || "llm-only",
    }));
  }, [userVisibleSkillsRaw]);
  const { data: mediaModels } = trpc.mediaModels.list.useQuery({ type: activeTab });
  const selectedMediaModel = useMemo(
    () => (mediaModels?.models as any[] | undefined)?.find((m) => m.modelId === selectedModel),
    [mediaModels?.models, selectedModel],
  );
  const selectedMediaModelConfig = useMemo(() => {
    const rawConfig = selectedMediaModel?.configJson;
    if (!rawConfig) return null;
    if (typeof rawConfig === "string") {
      try {
        return JSON.parse(rawConfig) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    if (typeof rawConfig === "object") {
      return rawConfig as Record<string, unknown>;
    }
    return null;
  }, [selectedMediaModel?.configJson]);
  const selectedMediaModelMaxPromptLength = useMemo(() => {
    const rawLimit = selectedMediaModelConfig?.maxPromptLength;
    const parsedLimit = Number(rawLimit);
    return Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
  }, [selectedMediaModelConfig]);
  const selectedMediaModelReferenceSupport = useMemo(
    () => getModelReferenceInputSupport(selectedMediaModel as any),
    [selectedMediaModel],
  );
  const selectedMediaModelGenerationModeLabel = useMemo(
    () => getModelGenerationModeLabel(selectedMediaModel as any),
    [selectedMediaModel],
  );
  const selectedMediaModelForInputFields = useMemo(
    () => (selectedMediaModel ? { ...selectedMediaModel, configJson: selectedMediaModelConfig ?? undefined } : undefined),
    [selectedMediaModel, selectedMediaModelConfig],
  );
  const selectedMediaModelReferenceImageLimit = useMemo(
    () => getModelReferenceImageLimit(selectedMediaModelForInputFields as any),
    [selectedMediaModelForInputFields],
  );
  const selectedDurationField = useMemo(
    () => getModelInputField(selectedMediaModelForInputFields as any, "duration"),
    [selectedMediaModelForInputFields],
  );
  const selectedVideoDuration = useMemo(() => {
    if (activeTab !== "video" || !selectedDurationField) {
      return undefined;
    }
    const rawValue = modelInputValues.duration ?? selectedDurationField.default ?? duration;
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [activeTab, duration, modelInputValues.duration, selectedDurationField]);
  const selectedModelInputFields = useMemo(() => {
    const inputFields = Array.isArray(selectedMediaModelConfig?.inputFields)
      ? selectedMediaModelConfig.inputFields as any[]
      : [];
    return inputFields;
  }, [selectedMediaModelConfig]);
  const activePickerField = useMemo(() => {
    if (!fieldPickerOpenKey) return null;
    return selectedModelInputFields.find((field) => field?.key === fieldPickerOpenKey) ?? null;
  }, [fieldPickerOpenKey, selectedModelInputFields]);
  const shouldLoadDynamicFieldOptions = (
    !!selectedModel &&
    !!activePickerField &&
    hasProviderApiOptionsSource(activePickerField)
  );
  const {
    data: dynamicFieldOptionsData,
    isLoading: isDynamicFieldOptionsLoading,
    refetch: refetchDynamicFieldOptions,
  } = trpc.media.listModelFieldOptions.useQuery(
    {
      modelId: selectedModel || "__no_model__",
      fieldKey: fieldPickerOpenKey || "__no_field__",
      limit: 2000,
    },
    {
      enabled: shouldLoadDynamicFieldOptions,
      staleTime: 5 * 60 * 1000,
      retry: false,
    },
  );
  const activeDynamicFieldOptions = useMemo(() => {
    const apiOptions = normalizeModelFieldOptions(dynamicFieldOptionsData?.options ?? []);
    const isActiveUvoiceVoiceField = isUvoiceVoiceSelectionField(selectedMediaModel?.provider, activePickerField);
    if (isActiveUvoiceVoiceField) {
      return apiOptions;
    }
    if (hasProviderApiOptionsSource(activePickerField) && apiOptions.length > 0) {
      return apiOptions;
    }
    return normalizeModelFieldOptions(activePickerField?.options);
  }, [dynamicFieldOptionsData?.options, activePickerField, activePickerField?.options, selectedMediaModel?.provider]);
  useEffect(() => {
    if (!fieldPickerOpenKey) return;
    if (!Array.isArray(dynamicFieldOptionsData?.options)) return;
    setFieldOptionsCache((prev) => ({
      ...prev,
      [fieldPickerOpenKey]: normalizeModelFieldOptions(dynamicFieldOptionsData.options),
    }));
  }, [dynamicFieldOptionsData?.options, fieldPickerOpenKey]);
  const stopVoicePreview = useCallback(() => {
    if (voicePreviewAudioRef.current) {
      voicePreviewAudioRef.current.pause();
      voicePreviewAudioRef.current.currentTime = 0;
      voicePreviewAudioRef.current.src = "";
      voicePreviewAudioRef.current = null;
    }
    setPlayingVoicePreviewKey(null);
    setLoadingVoicePreviewKey(null);
  }, []);
  const toggleVoicePreview = useCallback((fieldKey: string, option: SearchableFieldOption | undefined) => {
    const previewUrl = option?.previewUrl;
    if (!previewUrl) {
      return;
    }

    const optionKey = `${fieldKey}:${option.value}`;
    const activeAudio = voicePreviewAudioRef.current;
    if (activeAudio && playingVoicePreviewKey === optionKey && !activeAudio.paused) {
      stopVoicePreview();
      return;
    }

    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    }

    const audio = new Audio(previewUrl);
    voicePreviewAudioRef.current = audio;
    setPlayingVoicePreviewKey(optionKey);
    setLoadingVoicePreviewKey(optionKey);

    audio.onended = () => {
      if (voicePreviewAudioRef.current === audio) {
        setPlayingVoicePreviewKey(null);
        setLoadingVoicePreviewKey(null);
      }
    };
    audio.onerror = () => {
      if (voicePreviewAudioRef.current === audio) {
        setPlayingVoicePreviewKey(null);
        setLoadingVoicePreviewKey(null);
        toast.error(t('mediaStudio.unableToPlayVoicePreview'));
      }
    };

    void audio.play()
      .then(() => {
        if (voicePreviewAudioRef.current === audio) {
          setLoadingVoicePreviewKey(null);
        }
      })
      .catch(() => {
        if (voicePreviewAudioRef.current === audio) {
          setPlayingVoicePreviewKey(null);
          setLoadingVoicePreviewKey(null);
          toast.error(t('mediaStudio.unableToPlayVoicePreview'));
        }
      });
  }, [playingVoicePreviewKey, stopVoicePreview]);
  useEffect(() => {
    return () => stopVoicePreview();
  }, [stopVoicePreview]);
  useEffect(() => {
    stopVoicePreview();
  }, [activeTab, selectedModel, stopVoicePreview]);
  const { data: mediaHistory, refetch: refetchMediaHistory } = trpc.media.listTasks.useQuery(
    {
      limit: 50,
      daysAgo: 12,
    },
    {
      // Keep history live so completed provider tasks appear without manual refresh.
      refetchInterval: 15000,
      refetchOnWindowFocus: true,
    }
  );
  const trpcUtils = trpc.useUtils();
  const saveStoryboardProjectMutation = trpc.videoEditorProjects.save.useMutation();
  const addTaskToLibraryMutation = trpc.media.addTaskToLibrary.useMutation();
  const {
    data: librarySearchData,
    isLoading: isLibrarySearchLoading,
    error: librarySearchError,
  } = trpc.library.search.useQuery(
    {
      query: debouncedLibrarySearchQuery || undefined,
      limit: 50,
      filters: {
        ...(libraryRecentDays === "all" ? {} : { recentDays: libraryRecentDays }),
        ...(libraryItemTypeFilter === "all" ? {} : { itemType: libraryItemTypeFilter }),
      },
    },
    {
      enabled:
        debouncedLibrarySearchQuery.trim().length > 0 ||
        libraryRecentDays !== "all" ||
        libraryItemTypeFilter !== "all",
    },
  );
  const librarySearchResults = (librarySearchData?.results || []) as LibrarySearchResultItem[];

  const historyGalleryTasks = useMemo(() => {
    const tasks = (mediaHistory?.tasks ?? []) as MediaHistoryTaskLite[];
    return tasks.filter((task) => task.mediaType === historyGalleryTab);
  }, [mediaHistory?.tasks, historyGalleryTab]);

  const historyGalleryCompletedTasks = useMemo(() => {
    return historyGalleryTasks.filter((task) => {
      const resultUrl = extractTaskResultUrl(task);
      return task.status === "completed" && !!resultUrl && !expiredUrls.has(resultUrl);
    });
  }, [expiredUrls, historyGalleryTasks]);

  const historyGalleryPendingTasks = useMemo(() => {
    return historyGalleryTasks.filter((task) => {
      if (task.status === "processing" || task.status === "pending") return true;
      if (task.status === "failed") {
        return task.createdAt && new Date(task.createdAt) >= sessionStartTime;
      }
      return false;
    });
  }, [historyGalleryTasks, sessionStartTime]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedLibrarySearchQuery(librarySearchQuery.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [librarySearchQuery]);

  // Query for skill input schema (for dynamic form)
  const { data: skillSchemaData } = trpc.skills.getInputSchema.useQuery(
    { skillId: selectedSkillId },
    { enabled: !!selectedSkillId }
  );
  const skillSchema = skillSchemaData?.hasSchema ? skillSchemaData.schema as SkillInputSchema : null;
  const skillHasMaxPromptLengthField = useMemo(
    () => !!skillSchema?.sections?.some((section) => section.fields?.some((field) => field.id === "maxPromptLength")),
    [skillSchema],
  );

  // Query for vision-capable LLM models (for Auto Prompt model selection)
  const { data: visionModels } = trpc.skills.getVisionModels.useQuery();
  const supportedVisionModels = useMemo<MediaStudioVisionModelOption[]>(
    () => (visionModels?.models ?? []).filter((model: MediaStudioVisionModelOption) => model.supportsVision !== false),
    [visionModels?.models],
  );
  const visionModelsByProvider = useMemo(
    () => groupMediaStudioModelsByProvider(supportedVisionModels),
    [supportedVisionModels],
  );
  const providerAutoModelOptions = useMemo(
    () => buildMediaStudioProviderAutoOptions(supportedVisionModels),
    [supportedVisionModels],
  );

  // Query for skill's default model configuration
  const { data: skillConfig } = trpc.skills.getSkillConfig.useQuery(
    { skillId: selectedSkillId },
    { enabled: !!selectedSkillId }
  );

  const selectedLlmModelSelection = useMemo(
    () => resolveMediaStudioAutoPromptSelection({
      selectedValue: selectedLlmModel,
      models: supportedVisionModels,
      autoLabel: t('mediaStudio.autoSkillRequirements'),
      autoProviderLabelFormatter: (providerDisplayName) => t('mediaStudio.autoByProvider', { provider: providerDisplayName }),
      preferredModelId: skillConfig?.defaultModel ?? null,
    }),
    [selectedLlmModel, skillConfig?.defaultModel, supportedVisionModels, t],
  );

  // Mutations
  const uploadMutation = trpc.ai.upload.useMutation();
  const generateImageAsyncMutation = trpc.media.generateImageAsync.useMutation();
  const generateVideoAsyncMutation = trpc.media.generateVideoAsync.useMutation();
  const generateAudioMutation = trpc.media.generateAudio.useMutation();
  const enhancePromptMutation = trpc.skills.enhancePrompt.useMutation();
  const executeCustomSkillMutation = trpc.skills.executeCustomSkill.useMutation();

  const blobToBase64 = async (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const handleAttachCurrentMediaToContent = async () => {
    if (!attachTarget || !previewUrl || previewContextTab !== activeTab || activeTab === "audio") {
      return;
    }

    setIsAttachingContent(true);
    try {
      const response = await fetch(previewUrl);
      if (!response.ok) {
        throw new Error("Could not fetch the generated media");
      }

      const blob = await response.blob();
      const mimeType = blob.type || (activeTab === "video" ? "video/mp4" : "image/png");
      const extension = mimeType.startsWith("video")
        ? (mimeType.includes("webm") ? "webm" : mimeType.includes("quicktime") ? "mov" : "mp4")
        : mimeType.includes("jpeg")
          ? "jpg"
          : mimeType.includes("gif")
            ? "gif"
            : mimeType.includes("webp")
              ? "webp"
              : "png";
      const base64 = await blobToBase64(blob);
      const uploadResult = await uploadMutation.mutateAsync({
        fileName: `smartaihub-media-${Date.now()}.${extension}`,
        fileType: mimeType,
        fileBase64: base64,
      });

      const endpoint = attachTarget.kind === "blog"
        ? `/api/admin/blog/posts/${encodeURIComponent(attachTarget.id)}/attach-media`
        : `/api/tenant/pages/${encodeURIComponent(attachTarget.id)}/attach-media`;

      const attachResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          mediaUrl: uploadResult.url,
          mediaType: activeTab,
        }),
      });

      const attachData = await attachResponse.json().catch(() => null);
      if (!attachResponse.ok) {
        throw new Error(attachData?.error || "Failed to attach media");
      }

      if (attachTarget.kind === "page") {
        clearTenantPageCache(attachTarget.id);
      }

      toast.success(t('mediaStudio.mediaUploadedToLibraryAndAttachedToContent'));
    } catch (error) {
      console.error("Failed to attach media to content:", error);
      toast.error(error instanceof Error ? error.message : "Failed to attach media to content");
    } finally {
      setIsAttachingContent(false);
    }
  };

  // Auth redirect
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    setSelectedLibraryItemId(null);
  }, [activeTab]);

  // Set model from localStorage or default when models load
  useEffect(() => {
    if (modelInitialized) return;
    if (!mediaModels?.models || mediaModels.models.length === 0) return;

    // 1. Check localStorage for last used model for this media type
    const storageKey = `smartspec_model_${activeTab}`;
    const savedModelId = localStorage.getItem(storageKey);

    if (savedModelId) {
      // Verify the saved model still exists
      const savedModel = mediaModels.models.find((m: any) => m.modelId === savedModelId);
      if (savedModel) {
        setSelectedModel(savedModelId);
        setModelInitialized(true);
        return;
      }
    }

    // 2. Fallback: select first model (sorted by priority in API)
    setSelectedModel(mediaModels.models[0].modelId);
    setModelInitialized(true);
  }, [mediaModels, activeTab, modelInitialized]);

  // Save selected model to localStorage when user changes it
  useEffect(() => {
    if (modelInitialized && selectedModel) {
      const storageKey = `smartspec_model_${activeTab}`;
      localStorage.setItem(storageKey, selectedModel);
    }
  }, [selectedModel, activeTab, modelInitialized]);

  // Reset dynamic model input values when model changes, populate with defaults + current synced values
  useEffect(() => {
    if (!selectedModel || !mediaModels?.models) {
      setModelInputValues({});
      return;
    }
    const model = (mediaModels.models as any[]).find((m) => m.modelId === selectedModel);
    const config = model?.configJson as any;
    if (!config?.inputFields) {
      setModelInputValues({});
      return;
    }
    const defaults: Record<string, any> = {};
    for (const field of (config.inputFields as any[])) {
      // Seed from static default first
      if (field.default !== undefined) {
        defaults[field.key] = field.default;
      }
      // Synced fields get their initial value from the current runtime state.
      const syncWith = inferModelInputSyncTarget(field);
      if (syncWith === "prompt") {
        defaults[field.key] = prompt;
      } else if (syncWith === "reference_images") {
        defaults[field.key] = referenceImages.map((r: any) => r.url);
      } else if (syncWith === "reference_videos") {
        defaults[field.key] = referenceVideos.map((r: any) => r.url);
      } else if (syncWith === "aspect_ratio") {
        defaults[field.key] = aspectRatio;
      }
    }
    setModelInputValues(defaults);

    // Reset aspect ratio if current value is not supported by the new model
    const arField = config.inputFields.find((f: any) => f.key === "aspect_ratio");
    const arOptions = arField?.options?.map((o: any) => o.value) as string[] | undefined;
    const modelAr = model?.aspectRatios as string[] | null;
    const supportedAr = arOptions || (modelAr?.length ? modelAr : null);
    if (supportedAr) {
      if (!supportedAr.includes(aspectRatio)) {
        const defaultAr = arField?.default || supportedAr[0] || "1:1";
        setAspectRatio(defaultAr);
      }
    }
  }, [selectedModel, mediaModels, activeTab, aspectRatio, setAspectRatio]);

  // Keep modelInputValues in sync with runtime values for fields that declare syncWith targets.
  // Runs whenever prompt / referenceImages / aspectRatio changes so the read-only display stays current.
  useEffect(() => {
    if (!selectedModel || !mediaModels?.models) return;
    const model = (mediaModels.models as any[]).find((m) => m.modelId === selectedModel);
    const config = model?.configJson as any;
    if (!config?.inputFields) return;

    const syncedValues: Record<string, any> = {};
    for (const field of (config.inputFields as any[])) {
      const syncWith = inferModelInputSyncTarget(field);
      if (syncWith === "prompt") {
        syncedValues[field.key] = prompt;
      } else if (syncWith === "reference_images") {
        syncedValues[field.key] = referenceImages.map((r: any) => r.url);
      } else if (syncWith === "reference_videos") {
        syncedValues[field.key] = referenceVideos.map((r: any) => r.url);
      } else if (syncWith === "aspect_ratio") {
        syncedValues[field.key] = aspectRatio;
      }
    }
    if (Object.keys(syncedValues).length > 0) {
      setModelInputValues((prev: Record<string, any>) => ({ ...prev, ...syncedValues }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, referenceImages, referenceVideos, aspectRatio, selectedModel, mediaModels]);

  // Save aspect ratio to localStorage when changed (per-tab)
  useEffect(() => {
    const storageKey = activeTab === "video" ? "smartspec_aspect_video" : "smartspec_aspect_image";
    localStorage.setItem(storageKey, aspectRatio);
  }, [aspectRatio, activeTab]);

  // Save duration to localStorage when changed
  useEffect(() => {
    localStorage.setItem("smartspec_duration_video", tabStates.video.duration.toString());
  }, [tabStates.video.duration]);

  // Save video output type to localStorage when changed
  useEffect(() => {
    localStorage.setItem("smartspec_video_output_type", videoOutputType);
  }, [videoOutputType]);

  // Smart skill selection: localStorage > priority > type match > first enabled
  useEffect(() => {
    if (!skillsList || skillsList.length === 0) return;

    const storageKey = `smartspec_last_skill_${activeTab}`;
    const selectedSkill = pickMediaStudioSkillForTab(
      activeTab,
      skillsList,
      localStorage.getItem(storageKey),
    );

    setSelectedSkillId(selectedSkill);
    setSkillInitialized(true);
  }, [skillsList, activeTab]);

  // Save selected skill to localStorage when user changes it (after initial load)
  // Only save if the selected skill matches the current tab's type to prevent cross-tab pollution
  useEffect(() => {
    if (skillInitialized && selectedSkillId && skillsList) {
      // Find the selected skill and verify it matches the current tab
      const skill = skillsList.find(s => s.id === selectedSkillId);
      if (skill && isMediaStudioSkillCompatible(activeTab, skill)) {
        const storageKey = `smartspec_last_skill_${activeTab}`;
        localStorage.setItem(storageKey, selectedSkillId);
      }
    }
  }, [selectedSkillId, activeTab, skillInitialized, skillsList]);

  // Sync split prompts when switching tabs (for image_video_generation skills with outputType="both")
  useEffect(() => {
    if (activeTab === "image" && imageTabPrompt) {
      setEnhancedPrompt(imageTabPrompt);
    } else if (activeTab === "video" && videoTabPrompt) {
      setEnhancedPrompt(videoTabPrompt);
    }
    // Don't clear enhancedPrompt when switching to a tab without split prompt
    // User may have typed their own prompt
  }, [activeTab, imageTabPrompt, videoTabPrompt, setEnhancedPrompt]);

  // Reset dynamic form values when skill changes (per-tab)
  useEffect(() => {
    setDynamicFormValues({});
    // Advanced Mode is OFF by default - user must enable it manually
  }, [selectedSkillId, setDynamicFormValues]);

  // Keep a max prompt length field aligned with the selected media model limit.
  // This field is used by prompt-creation skills that can overflow the model's prompt cap.
  useEffect(() => {
    if (!skillHasMaxPromptLengthField) {
      return;
    }

    if (selectedMediaModelMaxPromptLength === null) {
      setDynamicFormValues((prev: Record<string, any>) => {
        if (prev.maxPromptLength === undefined) {
          return prev;
        }

        const next = { ...prev };
        delete next.maxPromptLength;
        return next;
      });
      return;
    }

    setDynamicFormValues((prev: Record<string, any>) => {
      const current = Number(prev.maxPromptLength);
      const hasCurrent = Number.isFinite(current) && current > 0;
      const nextValue = hasCurrent
        ? Math.min(current, selectedMediaModelMaxPromptLength)
        : selectedMediaModelMaxPromptLength;

      if (prev.maxPromptLength === nextValue) {
        return prev;
      }

      return {
        ...prev,
        maxPromptLength: nextValue,
      };
    });
  }, [
    selectedMediaModelMaxPromptLength,
    setDynamicFormValues,
    skillHasMaxPromptLengthField,
  ]);

  // Keep the model selector aligned with the available vision models.
  useEffect(() => {
    if (!visionModels?.models?.length) {
      return;
    }

    if (selectedLlmModelSelection.mode === "auto-provider" && !selectedLlmModelSelection.resolvedModelId) {
      setSelectedLlmModel(AUTO_MODEL);
      return;
    }

    if (selectedLlmModelSelection.mode === "explicit" && !supportedVisionModels.some((model) => model.id === selectedLlmModelSelection.value)) {
      setSelectedLlmModel(AUTO_MODEL);
    }
  }, [selectedLlmModelSelection, setSelectedLlmModel, supportedVisionModels, visionModels?.models]);

  // Reference image limits per tab, further constrained by model metadata when present.
  const maxReferenceImages = useMemo(() => {
    const tabLimit = activeTab === "video" ? 25 : 5;
    return selectedMediaModelReferenceImageLimit === null
      ? tabLimit
      : Math.min(tabLimit, selectedMediaModelReferenceImageLimit);
  }, [activeTab, selectedMediaModelReferenceImageLimit]);
  const maxReferenceVideos = activeTab === "video" ? 5 : 0;

  useEffect(() => {
    const clamped = clampReferenceImagesToModelLimit(
      selectedMediaModelForInputFields as any,
      referenceImages,
    );
    if (clamped.droppedCount <= 0 || clamped.maxItems === null) {
      return;
    }

    setReferenceImages(clamped.items);
    toast.error(t('mediaStudio.maxReferenceImagesError', { max: clamped.maxItems }));
  }, [
    referenceImages,
    selectedMediaModelForInputFields,
    setReferenceImages,
    t,
  ]);

  // Handle file upload for reference images
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Limit reference images based on the active tab and any model-declared cap.
    const remainingSlots = maxReferenceImages - referenceImages.length;
    const filesToUpload = Array.from(files).slice(0, remainingSlots);

    for (const file of filesToUpload) {
      if (!file.type.startsWith("image/")) {
        continue;
      }

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const result = await uploadMutation.mutateAsync({
          fileName: file.name,
          fileType: file.type,
          fileBase64: base64,
        });

        setReferenceImages(prev => [...prev, { url: result.url, name: file.name }]);
      } catch (error) {
        console.error("Upload failed:", error);
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Handle file upload for reference videos
  const handleVideoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (maxReferenceVideos === 0) {
      if (videoFileInputRef.current) {
        videoFileInputRef.current.value = "";
      }
      return;
    }

    const remainingSlots = maxReferenceVideos - referenceVideos.length;
    const filesToUpload = Array.from(files).slice(0, remainingSlots);

    for (const file of filesToUpload) {
      if (!file.type.startsWith("video/")) {
        continue;
      }

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const result = await uploadMutation.mutateAsync({
          fileName: file.name,
          fileType: file.type,
          fileBase64: base64,
        });

        setReferenceVideos((prev) => [...prev, { url: result.url, name: file.name }]);
      } catch (error) {
        console.error("Video upload failed:", error);
      }
    }

    if (videoFileInputRef.current) {
      videoFileInputRef.current.value = "";
    }
  };

  // Remove reference image
  const removeReferenceImage = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
  };

  // Remove reference video
  const removeReferenceVideo = (index: number) => {
    setReferenceVideos(prev => prev.filter((_, i) => i !== index));
  };

  // Add generated media as reference
  const addAsReference = (media: GeneratedMedia) => {
    if (referenceImages.length >= maxReferenceImages) {
      return;
    }
    setReferenceImages(prev => [...prev, { url: media.url, name: `generated-${media.id}` }]);
  };

  // Add history task image as reference
  const addHistoryAsReference = (task: { id: string; resultUrl?: string }) => {
    if (referenceImages.length >= maxReferenceImages || !task.resultUrl) {
      return;
    }
    setReferenceImages(prev => [...prev, { url: task.resultUrl!, name: `history-${task.id}` }]);
  };

  const refreshLibraryStatus = useCallback(
    async (taskId: string, itemId: number) => {
      try {
        const item = await trpcUtils.library.getItem.fetch({ id: itemId });
        setTaskLibraryState((prev) => ({
          ...prev,
          [taskId]: {
            ...(prev[taskId] || { action: "added" as const }),
            action: "added",
            itemId,
            status: item.status,
          },
        }));
      } catch {
        // Keep optimistic status if fetch fails.
      }
    },
    [trpcUtils.library.getItem],
  );

  const handleAddHistoryTaskToLibrary = async (task: {
    id: string;
    status?: string;
    resultUrl?: string;
  }) => {
    if (!isMediaTaskEligibleForLibraryAdd(task)) {
      toast.error(t('mediaStudio.onlyCompletedTasksWithResultsCanBeAddedToLibrary'));
      return;
    }

    setTaskLibraryState((prev) => ({
      ...prev,
      [task.id]: {
        ...(prev[task.id] || { action: "idle" as const }),
        action: "adding",
        status: "indexing",
      },
    }));

    try {
      const result = await addTaskToLibraryMutation.mutateAsync({ taskId: task.id });
      const nextState = buildTaskLibraryStateFromAddResult(result);
      setTaskLibraryState((prev) => ({
        ...prev,
        [task.id]: nextState,
      }));
      toast.success(getAddToLibrarySuccessMessage(result));
      await refetchMediaHistory();
      await refreshLibraryStatus(task.id, result.itemId);
    } catch (error) {
      const errorState = buildTaskLibraryErrorState(error);
      setTaskLibraryState((prev) => ({
        ...prev,
        [task.id]: errorState,
      }));
      toast.error(getAddToLibraryErrorMessage(error));
    }
  };

  const handleLibraryResultSelect = useCallback((item: LibrarySearchResultItem) => {
    setSelectedLibraryItemId(item.item_id);
    const previewSource = item.thumbnail_url || item.source_url;
    if (previewSource) {
      openPreview(previewSource);
    }
    if (item.status.toLowerCase() !== "ready") {
      toast.info(t('mediaStudio.selectedItemInfo', { title: item.title, status: item.status }));
      return;
    }
    toast.success(t('mediaStudio.selectedItemFromLibrary', { title: item.title }));
  }, [openPreview, t]);

  const handleLibraryResultAddToReference = useCallback((item: LibrarySearchResultItem) => {
    const itemType = item.item_type.toLowerCase();
    const referenceUrl = itemType === "video"
      ? item.source_url?.trim() || null
      : item.source_url?.trim() || item.thumbnail_url?.trim() || null;

    if (!referenceUrl) {
      toast.error(t('mediaStudio.failedToAddAsReference'));
      return;
    }

    if (itemType === "video") {
      if (!selectedMediaModelReferenceSupport.videoUrls) {
        toast.error("The selected model does not accept video references.");
        return;
      }
      if (referenceVideos.length >= maxReferenceVideos) {
        toast.error("Video reference is full.");
        return;
      }
      setReferenceVideos((prev) => [...prev, { url: referenceUrl, name: `library-${item.item_id}` }]);
      toast.success(t('mediaStudio.useAsReference'));
      return;
    }

    if (itemType === "image") {
      if (!selectedMediaModelReferenceSupport.imageUrls) {
        toast.error("The selected model does not accept image references.");
        return;
      }
      if (referenceImages.length >= maxReferenceImages) {
        toast.error(t('mediaStudio.maxReferenceImagesError', { max: maxReferenceImages }));
        return;
      }
      setReferenceImages((prev) => [...prev, { url: referenceUrl, name: `library-${item.item_id}` }]);
      toast.success(t('mediaStudio.useAsReference'));
      return;
    }

    toast.error(t('mediaStudio.failedToAddAsReference'));
  }, [
    maxReferenceImages,
    maxReferenceVideos,
    referenceImages.length,
    referenceVideos.length,
    selectedMediaModelReferenceSupport.imageUrls,
    selectedMediaModelReferenceSupport.videoUrls,
    t,
  ]);

  useEffect(() => {
    const tracking = Object.entries(taskLibraryState).filter(
      ([, state]) => state.action === "added" && state.itemId && state.status === "indexing",
    );
    if (tracking.length === 0) return;

    const timer = window.setInterval(() => {
      tracking.forEach(([taskId, state]) => {
        if (state.itemId) {
          void refreshLibraryStatus(taskId, state.itemId);
        }
      });
    }, 15000);

    return () => window.clearInterval(timer);
  }, [taskLibraryState, refreshLibraryStatus]);

  // Drag & drop handlers for reference images
  const isImageMediaUrl = (url?: string | null) => {
    if (!url) return false;
    return /\.(jpg|jpeg|png|gif|webp|svg|avif|bmp)([?#].*)?$/i.test(url.trim());
  };

  const getDraggedMediaType = (dataTransfer: DataTransfer) => {
    return dataTransfer.getData("application/x-smartspec-media-type")
      || dataTransfer.getData("text/x-smartspec-media-type");
  };

  const getDraggedMediaUrl = (dataTransfer: DataTransfer) => {
    return dataTransfer.getData("text/uri-list") || dataTransfer.getData("text/plain");
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const draggedMediaType = getDraggedMediaType(e.dataTransfer);
    const url = getDraggedMediaUrl(e.dataTransfer);
    if (draggedMediaType === "video" || isVideoMediaUrl(url)) {
      setIsDraggingOver(false);
      return;
    }
    if (draggedMediaType === "image" || isImageMediaUrl(url)) {
      setIsDraggingOver(true);
      return;
    }
    setIsDraggingOver(false);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    const url = getDraggedMediaUrl(e.dataTransfer);
    const draggedMediaType = getDraggedMediaType(e.dataTransfer);
    if (url && referenceImages.length < maxReferenceImages) {
      if (draggedMediaType === "image" || isImageMediaUrl(url)) {
        setReferenceImages(prev => [...prev, { url, name: `dropped-${Date.now()}` }]);
      }
    }
  };

  const handleVideoDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const draggedMediaType = getDraggedMediaType(e.dataTransfer);
    const url = getDraggedMediaUrl(e.dataTransfer);
    if (draggedMediaType === "image" || isImageMediaUrl(url)) {
      setIsVideoDraggingOver(false);
      return;
    }
    if (draggedMediaType === "video" || isVideoMediaUrl(url)) {
      setIsVideoDraggingOver(true);
      return;
    }
    setIsVideoDraggingOver(false);
  };

  const handleVideoDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsVideoDraggingOver(false);
  };

  const handleVideoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsVideoDraggingOver(false);

    const url = getDraggedMediaUrl(e.dataTransfer);
    const draggedMediaType = getDraggedMediaType(e.dataTransfer);
    if (url && referenceVideos.length < maxReferenceVideos) {
      if (draggedMediaType === "video" || isVideoMediaUrl(url)) {
        setReferenceVideos((prev) => [...prev, { url, name: `dropped-${Date.now()}` }]);
      }
    }
  };

  // Handle drag start for history media
  const handleHistoryDragStart = (e: React.DragEvent, url: string, mediaType: MediaType | null | undefined) => {
    e.dataTransfer.setData("text/uri-list", url);
    e.dataTransfer.setData("text/plain", url);
    if (mediaType) {
      e.dataTransfer.setData("application/x-smartspec-media-type", mediaType);
      e.dataTransfer.setData("text/x-smartspec-media-type", mediaType);
    }
    e.dataTransfer.effectAllowed = "copy";
  };

  // Check if a Settings field has a duplicate in Advanced Mode schema
  // Returns true if the field exists in schema and Advanced Mode is enabled
  const isFieldDisabledByAdvancedMode = useCallback((fieldName: string): boolean => {
    if (!useAdvancedMode || !skillSchema) return false;

    // Fields that should NEVER be disabled by Advanced mode
    // These are always controlled via Settings panel and filtered out from Advanced form
    const alwaysEnabledFields = ["aspectRatio"];
    if (alwaysEnabledFields.includes(fieldName)) return false;

    // Map Settings field names to possible schema field IDs
    const fieldMappings: Record<string, string[]> = {
      "style": ["styleCategory", "styleName", "style"],
      "vfx": ["vfxCategory", "vfxEffect", "vfx"],
      "realisticSkin": ["realisticSkin", "realistic_skin"],
      "faceLock": ["faceLock", "face_lock"],
    };

    const schemaFieldIds = fieldMappings[fieldName] || [fieldName];

    // Check if any of the mapped field IDs exist in schema
    for (const section of skillSchema.sections) {
      for (const field of section.fields) {
        if (schemaFieldIds.includes(field.id)) {
          return true;
        }
      }
    }
    return false;
  }, [useAdvancedMode, skillSchema]);

  // Auto Prompt - enhance prompt using selected skill with LLM
  // Works with: text only, images only, or text + images
  // Passes all selected options: style, VFX, realistic skin, face lock, etc.
  // When using advanced mode with dynamic form, uses form values instead
  const handleAutoPrompt = async () => {
    // Allow either text or images (or both) - check both direct and form values
    // In Advanced Mode: combine main Prompt with "Your Idea" (request field) for expanded context
    const mainPrompt = prompt.trim();
    const advancedRequest = useAdvancedMode ? (dynamicFormValues.request as string || "") : "";

    // Combine both fields: Prompt is primary, Your Idea expands on it
    let userIdea = "";
    if (mainPrompt && advancedRequest) {
      userIdea = `${mainPrompt}\n\nAdditional details: ${advancedRequest}`;
    } else {
      userIdea = mainPrompt || advancedRequest;
    }

    if (!userIdea && referenceImages.length === 0) return;
    if (!currentSkill) {
      toast.error(t('mediaStudio.noCompatiblePromptSkillSelected'), {
        description: `Choose a prompt skill for the ${activeTab} tab before using Auto Prompt.`,
      });
      return;
    }

    setIsEnhancing(true);
    try {
      // Determine if we should use custom skill execution or the specialized enhancePrompt endpoint
      // Skills with executionMode: "enhance-prompt" use the specialized enhancePrompt endpoint
      // All other skills use executeCustomSkill which sends skill.md content as system prompt
      const useEnhancePromptEndpoint = currentSkill?.executionMode === "enhance-prompt";

      const isCustomSkill = selectedSkillId && !useEnhancePromptEndpoint;

      if (isCustomSkill) {
        // Use executeCustomSkill for custom skills like viral-talking-objects
        // This sends the skill's content as system prompt to the LLM
        // Works in both Basic Mode (userIdea only) and Advanced Mode (with form values)
        const hasUsableSkillValue = (value: unknown): boolean => {
          if (value === undefined || value === null) return false;
          if (typeof value === "string") {
            const trimmed = value.trim();
            return trimmed !== "" && trimmed !== ".";
          }
          if (Array.isArray(value)) return value.length > 0;
          if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
          return true; // booleans and numbers are always meaningful
        };

        const mappedValues: Record<string, any> = {};
        const outputMapping = skillSchema?.outputMapping || {};

        if (useAdvancedMode && skillSchema) {
          // Advanced Mode: map form values to API parameters
          Object.entries(dynamicFormValues).forEach(([key, value]) => {
            const mappedKey = outputMapping[key] || key;
            if (hasUsableSkillValue(value)) {
              mappedValues[mappedKey] = value;
            }
          });
        }

        // Apply default values from UI schema fields dynamically
        // Works for ANY skill - reads defaults from schema sections/fields
        // IMPORTANT: Apply in BOTH Basic and Advanced Mode!
        if (skillSchema?.sections) {
          skillSchema.sections.forEach((section: any) => {
            section.fields?.forEach((field: any) => {
              const mappedKey = outputMapping[field.id] || field.id;
              // Apply default if field is missing or empty
              if (field.default !== undefined &&
                  !hasUsableSkillValue(mappedValues[mappedKey])) {
                mappedValues[mappedKey] = field.default;
              }
            });
          });
        }

        // Flexible prompt field handling - accepts multiple similar field names
        // Always combines Basic Mode prompt with Advanced Mode field value
        const PROMPT_FIELD_NAMES = [
          'userIdea', 'UserIdea', 'Prompt', 'PromptIdea', 'Concept', 'ConceptIdea',
          'ConceptPrompt', 'concept', 'conceptIdea', 'conceptPrompt', 'story',
          'storyIdea', 'storyConcept', 'StoryIdea', 'StoryConcept', 'idea',
          'mainIdea', 'mainConcept', 'theme', 'Topic', 'topic', 'prompt'
        ];

        // Find which prompt field exists in the schema (case-insensitive)
        let promptField: { outputKey: string } | null = null;
        if (skillSchema?.sections) {
          for (const section of skillSchema.sections) {
            if (section.fields) {
              for (const field of section.fields) {
                if (PROMPT_FIELD_NAMES.some(name => name.toLowerCase() === field.id.toLowerCase())) {
                  promptField = {
                    outputKey: outputMapping[field.id] || field.id,
                  };
                  break;
                }
              }
              if (promptField) break;
            }
          }
        }

        // Always combine Basic Mode prompt with Advanced Mode field value
        if (promptField && userIdea) {
          const advancedModeValue = mappedValues[promptField.outputKey];
          if (hasUsableSkillValue(advancedModeValue)) {
            // Both Basic and Advanced filled: combine them
            mappedValues[promptField.outputKey] = `${userIdea}\n\n${advancedModeValue}`;
          } else {
            // Only Basic Mode prompt provided
            mappedValues[promptField.outputKey] = userIdea;
          }
        }

        // In Basic Mode, set default values and additional fields
        if (!useAdvancedMode) {
          if (userIdea) {
            // Ensure the prompt field is set even when schema is missing
            if (promptField) {
              if (!hasUsableSkillValue(mappedValues[promptField.outputKey])) {
                mappedValues[promptField.outputKey] = userIdea;
              }
            } else {
              mappedValues.userIdea = mappedValues.userIdea || userIdea;
              mappedValues.request = mappedValues.request || userIdea;
              mappedValues.prompt = mappedValues.prompt || userIdea;
            }
            mappedValues.topic = userIdea;
          }
          // Set default language settings for Basic Mode
          if (!hasUsableSkillValue(mappedValues.promptLanguage)) {
            mappedValues.promptLanguage = "en";
          }
          if (!hasUsableSkillValue(mappedValues.dialogueLanguage)) {
            mappedValues.dialogueLanguage = "en";
          }
        }

        // Keep the prompt length cap aligned with the selected media model when the skill exposes it.
        // Users can lower it in Advanced Mode, but we never allow it to exceed the model limit.
        if (skillHasMaxPromptLengthField && selectedMediaModelMaxPromptLength !== null) {
          const requestedPromptLength = Number(mappedValues.maxPromptLength);
          mappedValues.maxPromptLength = Number.isFinite(requestedPromptLength) && requestedPromptLength > 0
            ? Math.min(requestedPromptLength, selectedMediaModelMaxPromptLength)
            : selectedMediaModelMaxPromptLength;
        } else if (skillHasMaxPromptLengthField) {
          delete mappedValues.maxPromptLength;
        }

        // Remove null/empty placeholder values before sending to skill execution
        const sanitizedInputs = Object.fromEntries(
          Object.entries(mappedValues).filter(([, value]) => hasUsableSkillValue(value))
        );

        const result = await executeCustomSkillMutation.mutateAsync({
          skillId: selectedSkillId,
          userInputs: sanitizedInputs,
          ...(selectedLlmModelSelection.resolvedModelId ? { model: selectedLlmModelSelection.resolvedModelId } : {}),
          referenceImages: referenceImages.map((r: any) => r.url),
        });

        if (result.success && result.content) {
          // Check if outputType="both" - try to parse and split prompts for Image/Video tabs
          // Note: outputType may be undefined if user didn't change from default (especially in Basic Mode)
          const outputType = dynamicFormValues?.outputType as string | undefined;
          // Default to "both" if not explicitly set (matches ui.schema.json default for viral-talking-objects)
          const effectiveOutputType = outputType ?? "both";

          if (effectiveOutputType === "both") {
            // Try to parse and split the content for image and video tabs
            const parsed = parseSkillOutputForBothMode(result.content);

            if (parsed) {
              // Store split prompts for each tab
              setImageTabPrompt(parsed.imagePrompt);
              setVideoTabPrompt(parsed.videoPrompt);

              // Set the appropriate prompt based on current tab
              if (activeTab === "image") {
                setEnhancedPrompt(parsed.imagePrompt);
              } else if (activeTab === "video") {
                setEnhancedPrompt(parsed.videoPrompt);
              } else {
                setEnhancedPrompt(result.content);
              }

              toast.success(t('mediaStudio.skillExecutedSuccessfully', { skillName: result.skillName }), {
                description: `Credits: ${result.creditsUsed}. Prompts split for Image and Video tabs.`,
              });
            } else {
              // Parsing failed (no image/video sections found), use full content
              setEnhancedPrompt(result.content);
              setImageTabPrompt(null);
              setVideoTabPrompt(null);
              toast.success(t('mediaStudio.skillExecutedSuccessfully', { skillName: result.skillName }), {
                description: `Credits used: ${result.creditsUsed}`,
              });
            }
          } else {
            // Use the skill's generated content as the prompt (normal mode)
            setEnhancedPrompt(result.content);
            setImageTabPrompt(null);
            setVideoTabPrompt(null);
            toast.success(t('mediaStudio.skillExecutedSuccessfully', { skillName: result.skillName }), {
              description: `Credits used: ${result.creditsUsed}`,
            });
          }
        } else {
          toast.error(t('mediaStudio.skillExecutionReturnedEmpty'), {
            description: t('mediaStudio.skillExecutionReturnedEmptyDesc'),
          });
        }
      } else {
        // Use the specialized prompt-enhancement endpoint for prompt-focused skills
        let requestData;

        if (useAdvancedMode && skillSchema) {
          // Use dynamic form values with output mapping
          const mappedValues: Record<string, any> = {};
          const outputMapping = skillSchema.outputMapping || {};

          // Map form values to API parameters
          Object.entries(dynamicFormValues).forEach(([key, value]) => {
            const mappedKey = outputMapping[key] || key;
            if (value !== undefined && value !== "" && value !== null) {
              mappedValues[mappedKey] = value;
            }
          });

          requestData = {
            skillId: selectedSkillId,
            userInput: userIdea || "Create a prompt based on the reference images",
            referenceImages: referenceImages.map((r: any) => r.url),
            // Include selected LLM model for Auto Prompt (from Advanced Mode selector)
            ...(selectedLlmModelSelection.resolvedModelId ? { model: selectedLlmModelSelection.resolvedModelId } : {}),
            ...(skillHasMaxPromptLengthField && selectedMediaModelMaxPromptLength !== null
              ? {
                // Pass maxPromptLength from selected media model so skill generates shorter prompts
                maxPromptLength: selectedMediaModelMaxPromptLength,
              }
              : {}),
            ...mappedValues,
          };
        } else {
          // Use simple mode values - only send enabled fields with values
          // Check if field is disabled by Advanced Mode before including
          const isAspectRatioEnabled = !isFieldDisabledByAdvancedMode("aspectRatio");
          const isStyleEnabled = !isFieldDisabledByAdvancedMode("style");
          const isVfxEnabled = !isFieldDisabledByAdvancedMode("vfx");
          const isRealisticSkinEnabled = !isFieldDisabledByAdvancedMode("realisticSkin");
          const isFaceLockEnabled = !isFieldDisabledByAdvancedMode("faceLock");

          requestData = {
            skillId: selectedSkillId,
            userInput: userIdea || "Create a prompt based on the reference images",
            referenceImages: referenceImages.map((r: any) => r.url),
            // Include selected LLM model for Auto Prompt (from Advanced Mode selector)
            ...(selectedLlmModelSelection.resolvedModelId ? { model: selectedLlmModelSelection.resolvedModelId } : {}),
            ...(skillHasMaxPromptLengthField && selectedMediaModelMaxPromptLength !== null
              ? {
                // Pass maxPromptLength from selected media model so skill generates shorter prompts
                maxPromptLength: selectedMediaModelMaxPromptLength,
              }
              : {}),
            // Style options (only if enabled and has value)
            ...(isStyleEnabled && selectedStyleCategory ? { styleCategory: selectedStyleCategory } : {}),
            ...(isStyleEnabled && selectedStyle ? { styleName: selectedStyle } : {}),
            // VFX options (only if enabled and has value)
            ...(isVfxEnabled && selectedVfxCategory ? { vfxCategory: selectedVfxCategory } : {}),
            ...(isVfxEnabled && selectedVfxEffect ? { vfxEffect: selectedVfxEffect } : {}),
            // Advanced options (only if enabled and is true)
            ...(isRealisticSkinEnabled && realisticSkin ? { realisticSkin: true } : {}),
            ...(isFaceLockEnabled && faceLock ? { faceLock: true } : {}),
            // Other options (only if enabled)
            ...(isAspectRatioEnabled ? { aspectRatio } : {}),
            language: "en" as const,
          };
        }

        const result = await enhancePromptMutation.mutateAsync(requestData);

        if (result.success && result.promptEn) {
          // Use the enhanced English prompt
          setEnhancedPrompt(result.promptEn);
        } else {
          const description =
            "error" in result && typeof result.error === "string"
              ? result.error
              : t('mediaStudio.autoPromptReturnedEmptyDesc');
          // Handle case where result is returned but no prompt generated
          toast.error(t('mediaStudio.autoPromptReturnedEmpty'), {
            description,
          });
        }
      }
    } catch (error: any) {
      console.error("Auto prompt failed:", error);
      // Show user-friendly error message
      const errorMessage = error?.message || error?.data?.message || t('mediaStudio.failedToGeneratePrompt');
      if (errorMessage.includes("Unable to generate") || errorMessage.includes("different text")) {
        toast.error(t('mediaStudio.autoPromptCouldNotGeneratePrompt'), {
          description: t('mediaStudio.autoPromptCouldNotGeneratePromptDesc'),
        });
      } else {
        toast.error(t('mediaStudio.autoPromptFailed'), {
          description: errorMessage,
        });
      }
    } finally {
      setIsEnhancing(false);
    }
  };

  // Handle special style actions from DynamicSkillForm (e.g., "upscale" auto-fills prompt)
  const handleStyleAction = useCallback((action: StyleAction) => {
    if (action === "upscale") {
      // Auto-fill the prompt with upscale-specific text
      if (useAdvancedMode) {
        setDynamicFormValues((prev: Record<string, any>) => ({
          ...prev,
          request: UPSCALE_DEFAULT_PROMPT,
        }));
      } else {
        setPrompt(UPSCALE_DEFAULT_PROMPT);
      }
      toast.success(t('mediaStudio.promptAutoFilledForUpscale'), {
        description: t('mediaStudio.promptAutoFilledForUpscaleDesc'),
      });
    }
  }, [t, useAdvancedMode]);

  // Get current skill info
  const currentSkill = skillsList?.find(s => s.id === selectedSkillId);

  // Generate media with loop for multiple images
  const handleGenerate = async () => {
    console.log('========== [handleGenerate] START ==========');
    console.log('[handleGenerate] activeTab:', activeTab);
    console.log('[handleGenerate] selectedModel:', selectedModel);
    console.log('[handleGenerate] videoOutputType:', videoOutputType);

    // IMPORTANT: Read current textarea value directly from ref to ensure we capture
    // any edits made after Auto Prompt, regardless of React state timing
    const currentTextareaValue = promptTextareaRef.current?.value ?? "";

    // Use the current textarea value as the final prompt if available
    // This ensures any user edits after Auto Prompt are captured
    const advancedFallback = useAdvancedMode ? (dynamicFormValues.request as string || "") : "";
    const combinedFallback = prompt || advancedFallback;
    const stateBasedPrompt = enhancedPrompt || combinedFallback;

    // Prefer textarea ref value (most current) over state (may be stale)
    const finalPrompt = currentTextareaValue.trim() || stateBasedPrompt;
    console.log('[handleGenerate] finalPrompt length:', finalPrompt?.length || 0);
    console.log('[handleGenerate] finalPrompt preview:', finalPrompt?.substring(0, 100));

    if (!finalPrompt?.trim()) {
      console.log('[handleGenerate] ERROR: No prompt provided, exiting');
      return;
    }

    // Allow preview to auto-follow newly completed history items for this run.
    const nowMs = Date.now();
    autoPreviewSessionStartRef.current = nowMs;
    autoPreviewWindowUntilRef.current = nowMs + 10 * 60 * 1000;
    autoPreviewSeenTaskIdsRef.current.clear();

    // Check if Multi Video mode for video tab
    const isMultiVideo = activeTab === "video" && videoOutputType === "multi-video";
    console.log('[Generate] Active tab:', activeTab);
    console.log('[Generate] Video output type:', videoOutputType);
    console.log('[Generate] Is Multi Video:', isMultiVideo);

    // Parse prompts if Multi Video mode
    let promptsToGenerate: string[] = [finalPrompt];
    if (isMultiVideo) {
      const parsed = splitMultiVideoPromptOutput(finalPrompt);
      const parsedPrompts = parsed.prompts.length > 0 ? parsed.prompts : parseMultiVideoPrompts(finalPrompt);
      console.log('[Multi Video] Shared context length:', parsed.sharedContext.length);
      console.log('[Multi Video] Parsed prompts count:', parsedPrompts.length);
      if (parsedPrompts.length > 0) {
        promptsToGenerate = parsedPrompts.map((prompt) =>
          parsed.sharedContext ? `${parsed.sharedContext}\n\n${prompt}` : prompt
        );
        console.log(`[Multi Video] Using ${parsedPrompts.length} prompts`);
        toast.info(t('mediaStudio.multiVideoModeGenerating', { count: parsedPrompts.length }), { duration: 3000 });
      } else {
        toast.warning(t('mediaStudio.noMultiplePrompts'), { duration: 3000 });
      }
    }

    // Determine how many items to generate
    const imageCount = isMultiVideo ? promptsToGenerate.length : (activeTab === "image" ? numImages : 1);
    console.log('[Generate] Image/Video count to generate:', imageCount);

    // Generate media via model-driven gateway for all tabs.
    // Skills are only used for Auto Prompt / prompt enhancement.
    const shouldUseDirectMediaGateway = true;

    // When Advanced Mode is ON, use aspectRatio from dynamicFormValues (if set)
    const currentAspectRatio = aspectRatio;
    const finalAspectRatio = useAdvancedMode && dynamicFormValues.aspectRatio
      ? dynamicFormValues.aspectRatio
      : currentAspectRatio;

    // Build extra params from dynamic model input fields
    const selectedModelData = mediaModels?.models?.find((m: any) => m.modelId === selectedModel);
    const rawConfig = selectedModelData?.configJson;
    const modelConfig = (typeof rawConfig === "string" ? (() => { try { return JSON.parse(rawConfig); } catch { return null; } })() : rawConfig) as any;
    const extraParams: Record<string, any> = {};
    const apiConfig: Record<string, string> = buildApiConfigFromModelConfig(
      (modelConfig as Record<string, unknown>) ?? null,
    );
    const templateBaseContext = {
      prompt: finalPrompt,
      aspectRatio: finalAspectRatio,
      activeTab,
      fields: modelInputValues,
    } as Record<string, unknown>;

    if (modelConfig) {
      const resolveFieldValue = (field: any, value: unknown): unknown => {
        if (field.type === "array") {
          return resolveArrayFieldRuntimeValue(field, value, templateBaseContext);
        }
        return value;
      };

      // Populate extraParams — syncWith fields get their value from the live runtime state;
      // unsynchronised fields get the value from modelInputValues (user's direct input).
      for (const field of (modelConfig.inputFields as any[] | undefined ?? [])) {
        const syncWith = inferModelInputSyncTarget(field);
        if (syncWith === "reference_images") {
          // Keep the model-specific field populated, but also send standard referenceImageUrls below.
          if (referenceImages.length > 0) {
            extraParams[field.key] = referenceImages.map((r: any) => r.url);
          }
          continue;
        }

        if (syncWith === "reference_videos") {
          if (referenceVideos.length > 0) {
            extraParams[field.key] = referenceVideos.map((r: any) => r.url);
          }
          continue;
        }

        if (syncWith === "prompt") {
          extraParams[field.key] = resolveFieldValue(field, finalPrompt);
          continue;
        }

        if (syncWith === "aspect_ratio") {
          extraParams[field.key] = resolveFieldValue(field, finalAspectRatio);
          continue;
        }

        // Unsynchronised field: use user-entered value, skip standard-param duplicates
        if (field.key === "aspect_ratio" || field.key === "aspect.ratio") continue;
        if (field.key === "duration" && activeTab === "video") continue;

        const rawVal = modelInputValues[field.key];
        const val = resolveFieldValue(field, rawVal);
        if (
          val !== undefined
          && val !== null
          && val !== ""
          && !(Array.isArray(val) && val.length === 0)
        ) {
          extraParams[field.key] = val;
        }
      }
    }

    const outputFormatValue = modelInputValues.outputFormat ?? modelInputValues.output_format;
    const referenceStyleUrl = (modelInputValues.referenceStyleUrl ?? modelInputValues.reference_style_url) as string | undefined;
    const referenceVideoUrl = (modelInputValues.referenceVideoUrl ?? modelInputValues.reference_video_url) as string | undefined;
    const effectiveReferenceImages = selectedMediaModelReferenceSupport.imageUrls
      ? referenceImages
      : [];
    const effectiveReferenceVideos = selectedMediaModelReferenceSupport.videoUrls
      ? referenceVideos
      : [];
    const storyboardGenerationContext: StoryboardVideoGenerationContext | undefined =
      activeTab === "video"
      ? {
            aspectRatio: finalAspectRatio,
            duration: selectedVideoDuration,
            model: selectedModel || undefined,
            referenceImages: effectiveReferenceImages.map((item) => ({ ...item })),
            referenceVideos: effectiveReferenceVideos.map((item) => ({ ...item })),
            extraParams: Object.keys(extraParams).length > 0 ? { ...extraParams } : undefined,
            apiConfig: Object.keys(apiConfig).length > 0 ? { ...apiConfig } : undefined,
            resolution: modelInputValues.resolution || undefined,
            referenceVideoUrl,
            useReferenceVideoUrlFallback:
              selectedMediaModelReferenceSupport.videoUrls &&
              effectiveReferenceVideos.length === 0 &&
              !!referenceVideoUrl,
          }
        : undefined;

    // Initialize generation tasks for progressive preview after all context is ready.
    const initialTasks: GenerationTask[] = Array.from({ length: imageCount }, (_, i) => ({
      id: `task-${Date.now()}-${i}`,
      index: i,
      status: 'queued' as const,
      type: activeTab,
      prompt: isMultiVideo ? promptsToGenerate[i] : finalPrompt,
      model: selectedModel,
      createdAt: nowMs,
      updatedAt: nowMs,
      ...(storyboardGenerationContext ? { storyboardContext: storyboardGenerationContext } : {}),
    }));
    setGenerationTasks(initialTasks);
    setIsGenerationQueueHidden(false);
    setIsGenerationQueueCollapsed(false);
    setFocusedGenerationTaskId(initialTasks[0]?.id ?? null);
    setStoryboardReviewOpen(false);
    const initialStoryboardTaskIds = isMultiVideo && imageCount > 1
      ? initialTasks.map((task) => task.id)
      : [];
    setStoryboardReviewTaskIds(initialStoryboardTaskIds);
    setSelectedStoryboardTaskIds(new Set(initialStoryboardTaskIds));
    setStoryboardCompoundStatus(null);
    setStoryboardProjectLink(null);
    setStoryboardRenderJobId(null);
    setIsGenerating(true);

    // Loop through each image generation with delay
    let successCount = 0;
    for (let i = 0; i < imageCount; i++) {
      // Update task status to 'generating'
      setGenerationTasks(prev =>
        prev.map((task, idx) => idx === i ? { ...task, status: 'generating' as const, updatedAt: Date.now() } : task)
      );

      // Get the appropriate prompt for this iteration
      const currentPrompt = isMultiVideo ? promptsToGenerate[i] : finalPrompt;
      console.log(`[Generate] Iteration ${i + 1}/${imageCount}, Prompt length:`, currentPrompt.length);
      console.log(`[Generate] Model:`, selectedModel);
      console.log(`[Generate] Duration:`, activeTab === "video" ? selectedVideoDuration : undefined);

      try {
        let resultUrl: string | undefined;
        let creditsUsed: number | undefined;
        let startedAsyncTask = false;
        let asyncTask: any | null = null;

        const commonPayload = buildMediaStudioCommonPayload({
          prompt: currentPrompt,
          model: selectedModel || undefined,
          aspectRatio: finalAspectRatio,
          referenceImages: effectiveReferenceImages,
          referenceVideos: activeTab === "video" ? effectiveReferenceVideos : [],
          extraParams: Object.keys(extraParams).length > 0 ? extraParams : undefined,
          apiConfig: Object.keys(apiConfig).length > 0 ? apiConfig : undefined,
          resolution: modelInputValues.resolution || undefined,
        });

        if (shouldUseDirectMediaGateway && activeTab === "image") {
          const task = await generateImageAsyncMutation.mutateAsync({
            ...commonPayload,
            numImages: 1, // Keep progressive UI behavior
            ...(outputFormatValue ? { outputFormat: String(outputFormatValue) } : {}),
            ...(referenceStyleUrl ? { referenceStyleUrl } : {}),
          } as any);
          asyncTask = task;
          resultUrl = task.resultUrl || extractTaskResultUrl(task as any) || undefined;
          creditsUsed = task.creditsUsed;
          startedAsyncTask = !!task.id || !!task.taskId;
        } else if (shouldUseDirectMediaGateway && activeTab === "video") {
          const task = await generateVideoAsyncMutation.mutateAsync({
            ...commonPayload,
            ...(selectedVideoDuration !== undefined ? { duration: selectedVideoDuration } : {}),
            ...(selectedMediaModelReferenceSupport.videoUrls && effectiveReferenceVideos.length === 0 && referenceVideoUrl
              ? { referenceVideoUrl }
              : {}),
          } as any);
          asyncTask = task;
          resultUrl = task.resultUrl || extractTaskResultUrl(task as any) || undefined;
          creditsUsed = task.creditsUsed;
          startedAsyncTask = !!task.id || !!task.taskId;
        } else if (shouldUseDirectMediaGateway && activeTab === "audio") {
          const result = await generateAudioMutation.mutateAsync({
            text: currentPrompt,
            model: selectedModel || undefined,
            ...(Object.keys(extraParams).length > 0 ? { extraParams } : {}),
            ...(Object.keys(apiConfig).length > 0 ? { apiConfig } : {}),
          });

          resultUrl = extractTaskResultUrl(result as any) || undefined;
          creditsUsed = result.creditsUsed;
          startedAsyncTask = false;
        } else {
          throw new Error("Unsupported generation mode");
        }

        if (resultUrl) {
          // Update task with completed status and URL
          setGenerationTasks(prev =>
            prev.map((task, idx) => idx === i ? {
              ...task,
              status: 'completed' as const,
              url: resultUrl,
              backendTaskId: task.backendTaskId,
              providerTaskId: task.providerTaskId,
              statusDetail: t('mediaStudio.generationStatus.completed'),
              updatedAt: Date.now(),
            } : task)
          );

          // Add to generated media
          const newMedia: GeneratedMedia = {
            id: `${Date.now()}-${Math.random()}`,
            taskId: initialTasks[i]?.id,
            type: activeTab,
            url: resultUrl,
            prompt: currentPrompt, // For multi-video, this is the individual prompt
            model: selectedModel,
            createdAt: new Date().toISOString(),
            creditsUsed,
          };
          setGeneratedMedia(prev => [newMedia, ...prev]);

          // Set first completed image as preview
          if (successCount === 0) {
            openPreview(resultUrl);
          }
          successCount++;

          // Auto-detect grid for image results (only for first image)
          if (activeTab === "image" && i === 0) {
            detectGrid(resultUrl).then((detected) => {
              if (detected && detected.confidence >= 0.7) {
                toast.info(
                  `Grid detected! Open Image Tools to split or crop (${detected.rows * detected.cols} cells).`,
                  {
                    duration: 5000,
                    action: {
                      label: "Open Tools",
                      onClick: () => openSplitDialog(resultUrl),
                    },
                  }
                );
              }
            }).catch(() => {
              // Silently ignore detection errors
            });
          }
          void refetchMediaHistory();
        } else if (startedAsyncTask) {
          // Async task created successfully; output will appear in history.
          setGenerationTasks(prev =>
            prev.map((task, idx) => idx === i ? {
              ...task,
              status: asyncTask?.status === "processing"
                ? "generating"
                : asyncTask?.status === "completed"
                  ? "completed"
                  : asyncTask?.status === "failed" || asyncTask?.status === "cancelled"
                    ? "error"
                    : "queued",
              url: resultUrl ?? task.url,
              backendTaskId: asyncTask?.id || task.backendTaskId,
              providerTaskId: asyncTask?.taskId || task.providerTaskId,
              statusDetail:
                asyncTask?.status === "processing" ? t('mediaStudio.generationStatus.providerProcessing') :
                asyncTask?.status === "pending" ? t('mediaStudio.generationStatus.waitingForProviderPickup') :
                asyncTask?.status === "completed" ? t('mediaStudio.generationStatus.taskCompleted') :
                asyncTask?.status === "failed" ? (asyncTask?.errorMessage || t('mediaStudio.generationStatus.taskFailed')) :
                t('mediaStudio.generationStatus.queuedForSubmission'),
              updatedAt: Date.now(),
            } : task)
          );
          successCount++;
          if (i === 0) {
            toast.info(t('mediaStudio.generationTaskStarted'));
          }
          void refetchMediaHistory();
        } else {
          const errorMessage = t('mediaStudio.generationCompletedButNoMediaOutputUrlWasReturned');
          console.error(`[Generate] Missing output URL for iteration ${i + 1}:`, errorMessage);
          setGenerationTasks(prev =>
            prev.map((task, idx) => idx === i ? { ...task, status: 'error' as const, error: errorMessage } : task)
          );
          toast.error(t('mediaStudio.generationFailed'), { description: errorMessage });
        }
      } catch (error: any) {
        console.error(`[Generate] Exception in iteration ${i + 1}:`, error);
        console.error(`[Generate] Error message:`, error?.message);
        console.error(`[Generate] Error stack:`, error?.stack);
        console.error(`[Generate] Full error object:`, JSON.stringify(error, null, 2));
        const errorMessage = error?.message || 'Unknown error';
        setGenerationTasks(prev =>
          prev.map((task, idx) => idx === i ? {
            ...task,
            status: 'error' as const,
            error: errorMessage,
            statusDetail: errorMessage,
            updatedAt: Date.now(),
          } : task)
        );
        toast.error(t('mediaStudio.generationFailed'), { description: errorMessage });
      }

      // Add delay between generations (except for last one)
      // Longer delay for multi-video mode to avoid API rate limiting
      if (i < imageCount - 1) {
        const delayMs = isMultiVideo ? 2500 : 1000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // Note: Prompt is intentionally NOT cleared after generation
    // Users can manually clear using the "Clear" button if needed

    if (isMultiVideo && imageCount > 1) {
      setStoryboardReviewOpen(true);
    }

    setIsGenerating(false);
  };

  useEffect(() => {
    const request = autoGenerateRequestRef.current;
    if (!request || autoGenerateTriggeredRef.current) {
      return;
    }

    const currentState = tabStates[request.tab];
    if (!currentState) {
      return;
    }

    if (activeTab !== request.tab) {
      return;
    }

    const promptMatches = currentState.prompt.trim() === request.prompt.trim();
    const modelMatches = !request.model || currentState.selectedModel === request.model;
    if (!promptMatches || !modelMatches) {
      return;
    }

    autoGenerateTriggeredRef.current = true;
    autoGenerateRequestRef.current = null;
    void handleGenerate();
  }, [activeTab, handleGenerate, tabStates]);

  // Download media (with CORS fallback)
  const downloadMedia = async (url: string, filename: string) => {
    try {
      // Try fetch with CORS first
      const response = await fetch(url, { mode: 'cors' });
      if (response.ok) {
        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        return;
      }
    } catch (error) {
      console.log("CORS fetch failed, trying fallback:", error);
    }

    // Fallback: Open in new tab (user can right-click to save)
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Open image in lightbox
  const openLightbox = (url: string, prompt: string, model?: string, createdAt?: string) => {
    setLightboxImage({ url, prompt, model, createdAt });
    setLightboxOpen(true);
    setCopiedPrompt(false);
  };

  // Copy prompt to clipboard
  const copyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  // Use prompt from lightbox (copy to input)
  const usePromptFromLightbox = () => {
    if (lightboxImage?.prompt) {
      setPrompt(lightboxImage.prompt);
      setEnhancedPrompt("");
      setImageTabPrompt(null);
      setVideoTabPrompt(null);
      setLightboxOpen(false);
    }
  };

  function extractTaskResultUrl(task: any): string | null {
    const fromValue = (value: any): string | null => {
      if (!value) return null;
      if (typeof value === "string" && value.startsWith("http")) return value;
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = fromValue(item);
          if (found) return found;
        }
      }
      if (typeof value === "object") {
        const directKeys = [
          "url",
          "video_url",
          "image_url",
          "audio_url",
          "videoUrl",
          "imageUrl",
          "audioUrl",
          "result_url",
        ];
        for (const key of directKeys) {
          const candidate = value[key];
          if (typeof candidate === "string" && candidate.startsWith("http")) {
            return candidate;
          }
        }
      }
      return null;
    };

    if (typeof task?.resultUrl === "string" && task.resultUrl.startsWith("http")) {
      return task.resultUrl;
    }

    const directCandidates = [
      task?.result_url,
      task?.url,
      task?.audio_url,
      task?.video_url,
      task?.image_url,
      task?.data,
      task?.data?.[0],
    ];
    for (const candidate of directCandidates) {
      const found = fromValue(candidate);
      if (found) return found;
    }

    const resultData = task?.resultData;
    if (!resultData || typeof resultData !== "object") return null;
    let parsedResultJson: any = null;
    if (typeof resultData.resultJson === "string") {
      try {
        parsedResultJson = JSON.parse(resultData.resultJson);
      } catch {
        parsedResultJson = null;
      }
    }

    // Most common provider response shapes
    const candidates = [
      resultData,
      resultData.kie_ai_response,
      resultData.response,
      resultData.data,
      resultData.data?.response,
      resultData.data?.taskResult,
      resultData.taskResult,
      resultData.resultJson,
      parsedResultJson,
      resultData.output,
    ];

    for (const candidate of candidates) {
      const found = fromValue(candidate);
      if (found) return found;
    }

    return null;
  }

  useEffect(() => {
    setTrackedGenerationQueueTaskIds((prev) => {
      const next = new Set(prev);
      let changed = false;

      const rememberIds = (ids: readonly string[]) => {
        for (const id of ids) {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        }
      };

      for (const task of generationTasks) {
        rememberIds(getGenerationQueueIdentityCandidates(task));
      }

      for (const rawTask of (mediaHistory?.tasks ?? []) as MediaHistoryTaskLite[]) {
        const status = normalizeQueueStatus(rawTask.status);
        if (!isActiveGenerationQueueStatus(status)) {
          continue;
        }
        rememberIds(
          getGenerationQueueIdentityCandidates({
            id: rawTask.id,
            taskId: rawTask.taskId,
          }),
        );
      }

      return changed ? next : prev;
    });
  }, [generationTasks, mediaHistory?.tasks]);

  const generationQueueTasks = useMemo<QueueGenerationTask[]>(() => {
    const queueCandidates: QueueGenerationTask[] = [];
    const trackedTaskIds = new Set(trackedGenerationQueueTaskIds);

    for (const task of generationTasks) {
      for (const candidate of getGenerationQueueIdentityCandidates(task)) {
        trackedTaskIds.add(candidate);
      }
    }

    for (const task of generationTasks) {
      const normalizedStatus = task.status === "generating"
        ? "processing"
        : task.status === "queued"
          ? "queued"
          : task.status === "completed"
            ? "completed"
            : "failed";

      const queueTask: QueueGenerationTask = {
        id: task.id,
        type: task.type,
        prompt: task.prompt,
        model: task.model,
        status: normalizedStatus,
        progress: getQueueProgress(normalizedStatus),
        result: task.url,
        error: task.error,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        backendTaskId: task.backendTaskId,
        providerTaskId: task.providerTaskId,
        statusDetail: task.statusDetail,
      };
      queueCandidates.push(queueTask);
    }

    for (const rawTask of (mediaHistory?.tasks ?? []) as MediaHistoryTaskLite[]) {
      const task = rawTask;
      const taskType = task.mediaType || activeTab;
      const status = normalizeQueueStatus(task.status);
      if (
        !shouldIncludeHistoryTaskInGenerationQueue(
          status,
          {
            id: task.id,
            taskId: task.taskId,
          },
          trackedTaskIds,
        )
      ) {
        continue;
      }

      const resultUrl = task.resultUrl || extractTaskResultUrl(task as any) || undefined;
      const queueTask: QueueGenerationTask = {
        id: task.taskId || task.id,
        type: taskType,
        prompt: task.prompt || "",
        model: task.model || undefined,
        status,
        progress: getQueueProgress(status),
        result: resultUrl,
        error: task.errorMessage || undefined,
        createdAt: task.createdAt || task.startedAt || task.completedAt || task.updatedAt || new Date().toISOString(),
        updatedAt: task.updatedAt || task.completedAt || task.startedAt || task.createdAt || new Date().toISOString(),
        backendTaskId: task.id,
        providerTaskId: task.taskId || undefined,
        statusDetail:
          status === "pending" ? t('mediaStudio.generationStatus.waitingForProvider') :
          status === "processing" ? t('mediaStudio.generationStatus.providerProcessing') :
          status === "completed" ? t('mediaStudio.generationStatus.completed') :
          status === "failed" ? (task.errorMessage || t('mediaStudio.generationStatus.failed')) :
          status === "cancelled" ? t('mediaStudio.generationStatus.cancelled') :
          t('mediaStudio.generationStatus.queued'),
      };

      queueCandidates.push(queueTask);
    }

    return mergeGenerationQueueTasks(queueCandidates).sort((a, b) => {
      const aTime = a.updatedAt instanceof Date ? a.updatedAt.getTime() : Date.parse(String(a.updatedAt)) || 0;
      const bTime = b.updatedAt instanceof Date ? b.updatedAt.getTime() : Date.parse(String(b.updatedAt)) || 0;
      return bTime - aTime;
    });
  }, [activeTab, extractTaskResultUrl, generationTasks, mediaHistory?.tasks, t, trackedGenerationQueueTaskIds]);

  const visibleGenerationQueueTasks = useMemo(
    () => generationQueueTasks.filter((task) => !isGenerationQueueTaskDismissed(task, dismissedGenerationQueueTaskIds)),
    [dismissedGenerationQueueTaskIds, generationQueueTasks],
  );

  useEffect(() => {
    const historyTasks = (mediaHistory?.tasks ?? []) as MediaHistoryTaskLite[];
    if (historyTasks.length === 0) {
      return;
    }

    const historyLookup = new Map<string, MediaHistoryTaskLite>();
    for (const task of historyTasks) {
      historyLookup.set(task.id, task);
      if (task.taskId) {
        historyLookup.set(task.taskId, task);
      }
    }

    const resolveHistoryTask = (task: GenerationTask): MediaHistoryTaskLite | undefined => {
      if (task.providerTaskId && historyLookup.has(task.providerTaskId)) {
        return historyLookup.get(task.providerTaskId);
      }
      if (task.backendTaskId && historyLookup.has(task.backendTaskId)) {
        return historyLookup.get(task.backendTaskId);
      }
      if (historyLookup.has(task.id)) {
        return historyLookup.get(task.id);
      }
      return undefined;
    };

    let mediaChanged = false;
    setGenerationTasks((prev) => {
      let changed = false;
      const next = prev.map((task) => {
        const historyTask = resolveHistoryTask(task);
        if (!historyTask) {
          return task;
        }

        const resultUrl = historyTask.resultUrl || extractTaskResultUrl(historyTask as any) || undefined;
        const normalizedStatus = normalizeQueueStatus(historyTask.status);
        const status =
          normalizedStatus === "completed" && resultUrl
            ? "completed"
            : normalizedStatus === "failed"
              ? "error"
              : normalizedStatus === "cancelled"
                ? "error"
                : normalizedStatus === "processing"
                  ? "generating"
                  : task.status;
        const statusDetail =
          normalizedStatus === "completed"
            ? t('mediaStudio.generationStatus.completed')
            : normalizedStatus === "failed"
              ? (historyTask.errorMessage || t('mediaStudio.generationStatus.failed'))
              : normalizedStatus === "cancelled"
                ? t('mediaStudio.generationStatus.cancelled')
                : normalizedStatus === "processing"
                  ? t('mediaStudio.generationStatus.providerProcessing')
                  : task.statusDetail;

        const nextTask: GenerationTask = {
          ...task,
          ...(resultUrl ? { url: resultUrl } : {}),
          backendTaskId: task.backendTaskId ?? historyTask.id ?? undefined,
          providerTaskId: task.providerTaskId ?? historyTask.taskId ?? undefined,
          status,
          error: normalizedStatus === "failed" ? (historyTask.errorMessage || task.error) : task.error,
          statusDetail,
        };

        if (
          nextTask.status !== task.status
          || nextTask.url !== task.url
          || nextTask.backendTaskId !== task.backendTaskId
          || nextTask.providerTaskId !== task.providerTaskId
          || nextTask.error !== task.error
          || nextTask.statusDetail !== task.statusDetail
        ) {
          changed = true;
        }
        return nextTask;
      });
      mediaChanged = changed;
      return changed ? next : prev;
    });

    if (mediaChanged) {
      setGeneratedMedia((prev) => {
        let changed = false;
        const next = prev.map((item) => {
          const matchingTask = item.taskId
            ? resolveHistoryTask(
                generationTasks.find((task) => task.id === item.taskId) || {
                  id: item.taskId,
                  index: 0,
                  status: "queued",
                  type: item.type,
                  prompt: item.prompt,
                  model: item.model,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                } as GenerationTask,
              )
            : undefined;
          if (!matchingTask) {
            return item;
          }
          const resultUrl = matchingTask.resultUrl || extractTaskResultUrl(matchingTask as any) || undefined;
          if (!resultUrl || resultUrl === item.url) {
            return item;
          }
          changed = true;
          return { ...item, url: resultUrl };
        });
        return changed ? next : prev;
      });
    }
  }, [extractTaskResultUrl, generationTasks, mediaHistory?.tasks]);

  const retryGenerationTask = useCallback(async (task: QueueGenerationTask) => {
    const targetTab = task.type === "image" || task.type === "video" || task.type === "audio"
      ? task.type
      : null;

    if (!targetTab) {
      toast.error(t('mediaStudio.thisTaskTypeCannotBeRetried'));
      return;
    }

    const retryPrompt = task.prompt.trim();
    if (!retryPrompt) {
      toast.error(t('mediaStudio.cannotRetryWithoutPrompt'));
      return;
    }

    const tabState = tabStates[targetTab];
    const retryModel = task.model || tabState.selectedModel || selectedModel || "";
    const nowMs = Date.now();
    const retryTaskId = `task-${nowMs}-${Math.random().toString(36).slice(2, 11)}`;

    setIsGenerationQueueHidden(false);
    setIsGenerationQueueCollapsed(false);
    setIsGenerating(true);
    setFocusedGenerationTaskId(retryTaskId);
    setGenerationTasks((prev) => [
      {
        id: retryTaskId,
        index: 0,
        status: "queued",
        type: targetTab,
        prompt: retryPrompt,
        model: retryModel,
        createdAt: nowMs,
        updatedAt: nowMs,
        statusDetail: t('mediaStudio.generationStatus.queuedForRetry'),
      },
      ...prev,
    ]);

    const updateRetryTask = (updates: Partial<GenerationTask>) => {
      setGenerationTasks((prev) =>
        prev.map((item) =>
          item.id === retryTaskId
            ? { ...item, ...updates, updatedAt: Date.now() }
            : item
        )
      );
    };

    try {
      updateRetryTask({ status: "generating", statusDetail: t('mediaStudio.generationStatus.retryInProgress') });

      const selectedModelData = mediaModels?.models?.find((m: any) => m.modelId === retryModel);
      const rawConfig = selectedModelData?.configJson;
      const modelConfig = (typeof rawConfig === "string" ? (() => { try { return JSON.parse(rawConfig); } catch { return null; } })() : rawConfig) as any;
      const retryDurationField = getModelInputField({ configJson: modelConfig } as any, "duration");
      const extraParams: Record<string, any> = {};
      const apiConfig: Record<string, string> = buildApiConfigFromModelConfig(
        (modelConfig as Record<string, unknown>) ?? null,
      );
      const templateBaseContext = {
        prompt: retryPrompt,
        aspectRatio: tabState.aspectRatio,
        activeTab: targetTab,
        fields: tabState.modelInputValues,
      } as Record<string, unknown>;

      if (modelConfig) {
        const resolveFieldValue = (field: any, value: unknown): unknown => {
          if (field.type === "array") {
            return resolveArrayFieldRuntimeValue(field, value, templateBaseContext);
          }
          return value;
        };

        for (const field of (modelConfig.inputFields as any[] | undefined ?? [])) {
          const syncWith = inferModelInputSyncTarget(field);
          if (syncWith === "reference_images") {
            if (tabState.referenceImages.length > 0) {
              extraParams[field.key] = tabState.referenceImages.map((r) => r.url);
            }
            continue;
          }

          if (syncWith === "reference_videos") {
            if (tabState.referenceVideos.length > 0) {
              extraParams[field.key] = tabState.referenceVideos.map((r) => r.url);
            }
            continue;
          }

          if (syncWith === "prompt") {
            extraParams[field.key] = resolveFieldValue(field, retryPrompt);
            continue;
          }

          if (syncWith === "aspect_ratio") {
            extraParams[field.key] = resolveFieldValue(field, tabState.aspectRatio);
            continue;
          }

          if (field.key === "aspect_ratio" || field.key === "aspect.ratio") continue;
          if (field.key === "duration" && targetTab === "video") continue;

          const rawVal = tabState.modelInputValues[field.key];
          const val = resolveFieldValue(field, rawVal);
          if (
            val !== undefined
            && val !== null
            && val !== ""
            && !(Array.isArray(val) && val.length === 0)
          ) {
            extraParams[field.key] = val;
          }
        }
      }

      const outputFormatValue = tabState.modelInputValues.outputFormat ?? tabState.modelInputValues.output_format;
      const referenceStyleUrl = (tabState.modelInputValues.referenceStyleUrl ?? tabState.modelInputValues.reference_style_url) as string | undefined;
      const referenceVideoUrl = (tabState.modelInputValues.referenceVideoUrl ?? tabState.modelInputValues.reference_video_url) as string | undefined;
      const effectiveReferenceImages = selectedMediaModelReferenceSupport.imageUrls
        ? tabState.referenceImages
        : [];
      const effectiveReferenceVideos = selectedMediaModelReferenceSupport.videoUrls
        ? tabState.referenceVideos
        : [];
      const finalAspectRatio = tabState.useAdvancedMode && tabState.dynamicFormValues.aspectRatio
        ? tabState.dynamicFormValues.aspectRatio
        : tabState.aspectRatio;
      const commonPayload = buildMediaStudioCommonPayload({
        prompt: retryPrompt,
        model: retryModel || undefined,
        aspectRatio: finalAspectRatio,
        referenceImages: effectiveReferenceImages,
        referenceVideos: targetTab === "video" ? effectiveReferenceVideos : [],
        extraParams: Object.keys(extraParams).length > 0 ? extraParams : undefined,
        apiConfig: Object.keys(apiConfig).length > 0 ? apiConfig : undefined,
        resolution: tabState.modelInputValues.resolution || undefined,
      });

      let resultUrl: string | undefined;
      let creditsUsed: number | undefined;
      let startedAsyncTask = false;
      let asyncTask: any | null = null;

      if (targetTab === "image") {
        const taskResult = await generateImageAsyncMutation.mutateAsync({
          ...commonPayload,
          numImages: 1,
          ...(outputFormatValue ? { outputFormat: String(outputFormatValue) } : {}),
          ...(referenceStyleUrl ? { referenceStyleUrl } : {}),
        } as any);
        asyncTask = taskResult;
        resultUrl = taskResult.resultUrl || extractTaskResultUrl(taskResult as any) || undefined;
        creditsUsed = taskResult.creditsUsed;
        startedAsyncTask = !!taskResult.id || !!taskResult.taskId;
      } else if (targetTab === "video") {
        const taskResult = await generateVideoAsyncMutation.mutateAsync({
          ...commonPayload,
          ...(retryDurationField
            ? {
                duration: Number.isFinite(Number(tabState.modelInputValues.duration ?? tabState.duration))
                  ? Number(tabState.modelInputValues.duration ?? tabState.duration)
                  : tabState.duration,
              }
            : {}),
          ...(selectedMediaModelReferenceSupport.videoUrls && effectiveReferenceVideos.length === 0 && referenceVideoUrl
            ? { referenceVideoUrl }
            : {}),
        } as any);
        asyncTask = taskResult;
        resultUrl = taskResult.resultUrl || extractTaskResultUrl(taskResult as any) || undefined;
        creditsUsed = taskResult.creditsUsed;
        startedAsyncTask = !!taskResult.id || !!taskResult.taskId;
      } else {
        const result = await generateAudioMutation.mutateAsync({
          text: retryPrompt,
          model: retryModel || undefined,
          ...(Object.keys(extraParams).length > 0 ? { extraParams } : {}),
          ...(Object.keys(apiConfig).length > 0 ? { apiConfig } : {}),
        });

        resultUrl = extractTaskResultUrl(result as any) || undefined;
        creditsUsed = result.creditsUsed;
        startedAsyncTask = false;
      }

      if (resultUrl) {
        updateRetryTask({
          status: "completed",
          url: resultUrl,
          statusDetail: t('mediaStudio.generationStatus.completed'),
        });
        setGeneratedMedia((prev) => [
          {
            id: `${Date.now()}-${Math.random()}`,
            taskId: retryTaskId,
            type: targetTab,
            url: resultUrl,
            prompt: retryPrompt,
            model: retryModel,
            createdAt: new Date().toISOString(),
            creditsUsed,
          },
          ...prev,
        ]);
        openPreview(resultUrl);
        void refetchMediaHistory();
      } else if (startedAsyncTask) {
        updateRetryTask({
          status: asyncTask?.status === "processing"
            ? "generating"
            : asyncTask?.status === "completed"
              ? "completed"
              : asyncTask?.status === "failed" || asyncTask?.status === "cancelled"
                ? "error"
                : "queued",
          url: resultUrl,
          backendTaskId: asyncTask?.id,
          providerTaskId: asyncTask?.taskId,
          statusDetail:
            asyncTask?.status === "processing" ? t('mediaStudio.generationStatus.providerProcessing') :
            asyncTask?.status === "pending" ? t('mediaStudio.generationStatus.waitingForProviderPickup') :
            asyncTask?.status === "completed" ? t('mediaStudio.generationStatus.taskCompleted') :
            asyncTask?.status === "failed" ? (asyncTask?.errorMessage || t('mediaStudio.generationStatus.taskFailed')) :
            t('mediaStudio.generationStatus.queuedForSubmission'),
        });
        void refetchMediaHistory();
      } else {
        updateRetryTask({
          status: "error",
          error: t('mediaStudio.generationCompletedButNoMediaOutputUrlWasReturned'),
          statusDetail: t('mediaStudio.generationStatus.noMediaOutputUrl'),
        });
      toast.error(t('mediaStudio.generationFailed'), {
        description: t('mediaStudio.generationCompletedButNoMediaOutputUrlWasReturned'),
      });
      }
    } catch (error: any) {
      const errorMessage = error?.message || "Unknown error";
      updateRetryTask({
        status: "error",
        error: errorMessage,
        statusDetail: errorMessage,
      });
      toast.error(t('mediaStudio.generationFailed'), { description: errorMessage });
    } finally {
      setIsGenerating(false);
    }
  }, [
    buildApiConfigFromModelConfig,
    extractTaskResultUrl,
    generateAudioMutation,
    generateImageAsyncMutation,
    generateVideoAsyncMutation,
    mediaModels?.models,
    refetchMediaHistory,
    resolveArrayFieldRuntimeValue,
    selectedModel,
    setGenerationTasks,
    setIsGenerationQueueCollapsed,
    setIsGenerating,
    openPreview,
    tabStates,
    t,
  ]);

  const dismissGenerationQueueTask = useCallback((taskId: string) => {
    const matchedTask = generationQueueTasks.find((candidate) =>
      getGenerationQueueIdentityCandidates(candidate).includes(taskId),
    );
    const dismissIds = matchedTask
      ? collectGenerationQueueTaskIdentityCandidates([matchedTask])
      : [taskId];

    setDismissedGenerationQueueTaskIds((prev) => {
      if (dismissIds.every((dismissId) => prev.has(dismissId))) {
        return prev;
      }

      const next = new Set(prev);
      for (const dismissId of dismissIds) {
        next.add(dismissId);
      }
      return next;
    });

    setGenerationTasks((prev) =>
      prev.filter(
        (candidate) =>
          !getGenerationQueueIdentityCandidates(candidate).some((candidateId) => dismissIds.includes(candidateId))
      )
    );

    setFocusedGenerationTaskId((prev) => (
      prev && dismissIds.includes(prev) ? null : prev
    ));
  }, [generationQueueTasks]);

  const clearCompletedGenerationTasks = useCallback(() => {
    const terminalTaskIds = collectGenerationQueueTaskIdentityCandidates(
      generationQueueTasks.filter((task) => isTerminalGenerationQueueStatus(task.status)),
    );

    if (terminalTaskIds.length === 0) {
      return;
    }

    setDismissedGenerationQueueTaskIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const taskId of terminalTaskIds) {
        if (!next.has(taskId)) {
          next.add(taskId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    setGenerationTasks((prev) =>
      prev.filter((candidate) =>
        !terminalTaskIds.includes(candidate.id)
        && !terminalTaskIds.includes(candidate.backendTaskId || "")
        && !terminalTaskIds.includes(candidate.providerTaskId || "")
      )
    );
  }, [generationQueueTasks]);

  const closeGenerationQueue = useCallback(() => {
    const terminalTaskIds = collectGenerationQueueTaskIdentityCandidates(
      generationQueueTasks.filter((task) => isTerminalGenerationQueueStatus(task.status)),
    );

    if (terminalTaskIds.length > 0) {
      setDismissedGenerationQueueTaskIds((prev) => {
        const next = new Set(prev);
        let changed = false;
        for (const taskId of terminalTaskIds) {
          if (!next.has(taskId)) {
            next.add(taskId);
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      setGenerationTasks((prev) =>
        prev.filter((candidate) =>
          !getGenerationQueueIdentityCandidates(candidate).some((candidateId) => terminalTaskIds.includes(candidateId))
        ),
      );
    }

    setIsGenerationQueueHidden(true);
  }, [generationQueueTasks]);

  const showGenerationQueue = useCallback(() => {
    setIsGenerationQueueHidden(false);
    setIsGenerationQueueCollapsed(false);
  }, []);

  const storyboardReviewTasks = useMemo<StoryboardReviewTask[]>(
    () => generationTasks
      .filter((task) => storyboardReviewTaskIds.includes(task.id))
      .map((task) => ({
        id: task.id,
        index: task.index,
        prompt: task.prompt,
        url: task.url,
        model: task.model,
        status: task.status,
        error: task.error,
      })),
    [generationTasks, storyboardReviewTaskIds],
  );

  const toggleStoryboardTaskSelection = useCallback((taskId: string) => {
    setSelectedStoryboardTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const selectAllStoryboardTasks = useCallback(() => {
    setSelectedStoryboardTaskIds(new Set(storyboardReviewTaskIds));
  }, [storyboardReviewTaskIds]);

  const selectNoStoryboardTasks = useCallback(() => {
    setSelectedStoryboardTaskIds(new Set());
  }, []);

  const upsertGeneratedMediaForTask = useCallback((
    taskId: string,
    url: string,
    prompt: string,
    model: string,
    creditsUsed?: number,
  ) => {
    setGeneratedMedia((prev) => {
      const nextItem: GeneratedMedia = {
        id: `${taskId}-${Date.now()}`,
        taskId,
        type: "video",
        url,
        prompt,
        model,
        createdAt: new Date().toISOString(),
        creditsUsed,
      };

      const existingIndex = prev.findIndex((item) => item.taskId === taskId);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = {
          ...prev[existingIndex],
          ...nextItem,
          id: prev[existingIndex].id,
        };
        return next;
      }

      return [nextItem, ...prev];
    });
  }, []);

  const buildStoryboardVideoGenerationPayload = useCallback((
    promptText: string,
    context: StoryboardVideoGenerationContext,
  ): Record<string, unknown> => {
    const payload = buildMediaStudioCommonPayload({
      prompt: promptText,
      model: context.model,
      aspectRatio: context.aspectRatio,
      referenceImages: context.referenceImages,
      referenceVideos: context.referenceVideos,
      extraParams: context.extraParams,
      apiConfig: context.apiConfig,
      resolution: context.resolution,
    });

    return {
      ...payload,
      ...(context.duration !== undefined ? { duration: context.duration } : {}),
      ...(context.useReferenceVideoUrlFallback && context.referenceVideoUrl
        ? { referenceVideoUrl: context.referenceVideoUrl }
        : {}),
    };
  }, []);

  const buildSelectedStoryboardProject = useCallback(() => {
    const selectedTasks = storyboardReviewTasks.filter((task) => selectedStoryboardTaskIds.has(task.id) && task.status === "completed" && task.url);
    if (selectedTasks.length === 0) {
      return null;
    }

    const project = buildStoryboardVideoProject(
      selectedTasks.map((task) => ({
        id: task.id,
        prompt: task.prompt,
        url: task.url!,
        model: task.model,
      })),
      {
        projectName: sanitizeProjectName(`Storyboard Edit ${new Date().toLocaleString()}`),
        defaultDurationSeconds: tabStates.video.duration,
      },
    );

    return project;
  }, [selectedStoryboardTaskIds, storyboardReviewTasks, tabStates.video.duration]);

  const createStoryboardEditProject = useCallback(async () => {
    const project = buildSelectedStoryboardProject();
    if (!project) {
      toast.error("Select at least one completed clip before creating a project.");
      return;
    }

    setIsCreatingStoryboardProject(true);
    setStoryboardCompoundStatus("Saving project...");
    try {
      const clipCount = project.timeline.tracks.reduce((sum, track) => sum + track.clips.length, 0);
      const result = await saveStoryboardProjectMutation.mutateAsync({
        name: project.name,
        projectData: project,
        duration: project.settings.duration,
        resolution: `${project.settings.width}x${project.settings.height}`,
        trackCount: project.timeline.tracks.length,
        clipCount,
      });

      const link = `/video-editor?projectId=${result.id}`;
      setStoryboardProjectLink(link);
      setStoryboardCompoundStatus("Project saved. Choose how to open it below.");
      void navigator.clipboard?.writeText(`${window.location.origin}${link}`).catch(() => undefined);
      toast.success("Storyboard project created and link copied");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create video edit project");
      setStoryboardCompoundStatus(null);
    } finally {
      setIsCreatingStoryboardProject(false);
    }
  }, [
    buildSelectedStoryboardProject,
    saveStoryboardProjectMutation,
    setStoryboardCompoundStatus,
    setStoryboardProjectLink,
    toast,
  ]);

  const autoCompoundStoryboardClips = useCallback(async () => {
    const project = buildSelectedStoryboardProject();
    if (!project) {
      toast.error("Select at least one completed clip before compounding.");
      return;
    }

    setIsCompoundingStoryboard(true);
    setStoryboardCompoundStatus("Saving storyboard project and starting compound render...");
    try {
      const clipCount = project.timeline.tracks.reduce((sum, track) => sum + track.clips.length, 0);
      const saved = await saveStoryboardProjectMutation.mutateAsync({
        name: project.name,
        projectData: project,
        duration: project.settings.duration,
        resolution: `${project.settings.width}x${project.settings.height}`,
        trackCount: project.timeline.tracks.length,
        clipCount,
      });

      const link = `/video-editor?projectId=${saved.id}`;
      setStoryboardProjectLink(link);
      void navigator.clipboard?.writeText(`${window.location.origin}${link}`).catch(() => undefined);
      const outputPath = `/tmp/storyboard-compound-${saved.id}.mp4`;
      const jobId = await videoEditorRenderService.startRender(JSON.stringify(project), outputPath);
      setStoryboardRenderJobId(jobId);
      setStoryboardCompoundStatus("Compound render started. Watch progress below.");
      setStoryboardReviewOpen(false);
      toast.success("Compound render started");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to compound selected clips");
      setStoryboardCompoundStatus(null);
    } finally {
      setIsCompoundingStoryboard(false);
    }
  }, [
    buildSelectedStoryboardProject,
    saveStoryboardProjectMutation,
    toast,
    videoEditorRenderService,
    setStoryboardCompoundStatus,
    setStoryboardProjectLink,
    setStoryboardRenderJobId,
    setStoryboardReviewOpen,
  ]);

  const handleStoryboardRenderComplete = useCallback((outputPath: string) => {
    setStoryboardRenderJobId(null);
    setStoryboardCompoundStatus(`Compound render complete: ${outputPath}`);
    toast.success("Compound video is ready");
  }, [setStoryboardCompoundStatus, toast]);

  const handleStoryboardRenderCancel = useCallback(() => {
    setStoryboardRenderJobId(null);
    setStoryboardCompoundStatus("Compound render cancelled");
  }, [setStoryboardCompoundStatus]);

  const regenerateStoryboardClip = useCallback(async (taskId: string, prompt: string) => {
    const task = generationTasks.find((item) => item.id === taskId);
    if (!task?.storyboardContext) {
      toast.error("Storyboard clip context not found");
      return;
    }

    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      toast.error("Prompt cannot be empty");
      return;
    }

    setRegeneratingStoryboardTaskId(taskId);
    setStoryboardCompoundStatus(`Regenerating clip ${task.index + 1}...`);

    const updateTask = (updates: Partial<GenerationTask>) => {
      setGenerationTasks((prev) =>
        prev.map((item) =>
          item.id === taskId
            ? { ...item, ...updates, prompt: normalizedPrompt, updatedAt: Date.now() }
            : item
        )
      );
    };

    try {
      updateTask({
        status: "generating",
        error: undefined,
        statusDetail: t('mediaStudio.generationStatus.regeneratingClip'),
      });

      const payload = buildStoryboardVideoGenerationPayload(normalizedPrompt, task.storyboardContext);
      const taskResult = await generateVideoAsyncMutation.mutateAsync(payload as any);
      const taskResultAny = taskResult as any;
      const resultUrl = taskResultAny.resultUrl || extractTaskResultUrl(taskResultAny) || undefined;
      const startedAsyncTask = !!taskResultAny.id || !!taskResultAny.taskId;
      const backendTaskId = taskResultAny.id || taskResultAny.backendTaskId || undefined;
      const providerTaskId = taskResultAny.taskId || taskResultAny.providerTaskId || undefined;

      if (resultUrl) {
        updateTask({
          status: "completed",
          url: resultUrl,
          backendTaskId,
          providerTaskId,
          statusDetail: t('mediaStudio.generationStatus.completed'),
        });
        upsertGeneratedMediaForTask(taskId, resultUrl, normalizedPrompt, task.model || selectedModel, taskResult.creditsUsed);
        openPreview(resultUrl, "video");
        setStoryboardCompoundStatus(`Clip ${task.index + 1} regenerated.`);
        void refetchMediaHistory();
        return;
      }

      if (startedAsyncTask && (backendTaskId || providerTaskId)) {
        updateTask({
          backendTaskId,
          providerTaskId,
          statusDetail: t('mediaStudio.generationStatus.waitingForProviderCompletion'),
        });

        const pollId = providerTaskId || backendTaskId!;
        let completedTask: unknown = null;
        for (let attempt = 0; attempt < 90; attempt += 1) {
          const currentTask = await trpcUtils.media.getTask.fetch({ taskId: pollId });
          const currentTaskAny = currentTask as any;
          const status = String(currentTaskAny?.status || "").toLowerCase();
          if (status === "completed" || status === "failed" || status === "cancelled") {
            completedTask = currentTask;
            break;
          }
          await sleepMs(2000);
        }
        if (!completedTask) {
          throw new Error("video generation timeout. Please try again.");
        }
        const completedUrl = extractTaskResultUrl(completedTask as any) || undefined;
        if (!completedUrl) {
          throw new Error("No media output URL was returned");
        }

        updateTask({
          status: "completed",
          url: completedUrl,
          backendTaskId,
          providerTaskId,
          statusDetail: t('mediaStudio.generationStatus.completed'),
        });
        upsertGeneratedMediaForTask(taskId, completedUrl, normalizedPrompt, task.model || selectedModel, taskResult.creditsUsed);
        openPreview(completedUrl, "video");
        setStoryboardCompoundStatus(`Clip ${task.index + 1} regenerated.`);
        void refetchMediaHistory();
        return;
      }

      throw new Error("No media output URL was returned");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to regenerate clip";
      updateTask({
        status: "error",
        error: message,
        statusDetail: message,
      });
      toast.error(message);
      setStoryboardCompoundStatus(`Regeneration failed for clip ${task.index + 1}`);
    } finally {
      setRegeneratingStoryboardTaskId(null);
    }
  }, [
    buildStoryboardVideoGenerationPayload,
    extractTaskResultUrl,
    generationTasks,
    generateVideoAsyncMutation,
    openPreview,
    refetchMediaHistory,
    selectedModel,
    setStoryboardCompoundStatus,
    toast,
    trpcUtils.media.getTask,
    upsertGeneratedMediaForTask,
  ]);

  const handleGenerationQueueTaskClick = useCallback((task: QueueGenerationTask) => {
    if (task.result) {
      openPreview(task.result);
    }
  }, [openPreview]);

  const getTaskTimestampMs = (task: any): number => {
    const candidates = [task?.completedAt, task?.updatedAt, task?.startedAt, task?.createdAt];
    for (const value of candidates) {
      if (typeof value !== "string" || !value) continue;
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return 0;
  };

  useEffect(() => {
    const tasks = mediaHistory?.tasks;
    if (!tasks?.length) return;

    const now = Date.now();
    if (!autoPreviewSessionStartRef.current || now > autoPreviewWindowUntilRef.current) {
      return;
    }

    const sessionStartMs = autoPreviewSessionStartRef.current;
    const newCompletedCandidates = tasks
      .map((task) => ({
        task,
        url: extractTaskResultUrl(task),
        timestampMs: getTaskTimestampMs(task),
      }))
      .filter((entry) =>
        entry.task?.status === "completed" &&
        !!entry.url &&
        entry.timestampMs >= sessionStartMs - 1500 &&
        !autoPreviewSeenTaskIdsRef.current.has(entry.task.id)
      );

    if (newCompletedCandidates.length === 0) return;

    for (const entry of newCompletedCandidates) {
      autoPreviewSeenTaskIdsRef.current.add(entry.task.id);
    }

    const latestEntry = newCompletedCandidates.sort(
      (a, b) => b.timestampMs - a.timestampMs
    )[0];
    if (latestEntry?.url) {
      openPreview(latestEntry.url);
    }
  }, [mediaHistory?.tasks, openPreview]);

  useEffect(() => {
    if (previewUrl && previewContextTab === activeTab) {
      setIsPreviewCollapsed(false);
      return;
    }
    setIsPreviewCollapsed(true);
  }, [activeTab, previewContextTab, previewUrl]);

  const toCanvasSafeImageUrl = (imageUrl: string): string => {
    if (!imageUrl) return imageUrl;
    if (
      imageUrl.startsWith("data:") ||
      imageUrl.startsWith("blob:") ||
      imageUrl.startsWith("/api/media/image-proxy?")
    ) {
      return imageUrl;
    }

    try {
      const parsed = new URL(imageUrl, window.location.origin);
      if (parsed.origin === window.location.origin) {
        return parsed.toString();
      }
      return `/api/media/image-proxy?url=${encodeURIComponent(parsed.toString())}`;
    } catch {
      return imageUrl;
    }
  };

  // Open image tools dialog with auto-detection
  const openSplitDialog = async (imageUrl: string, mode: "split" | "crop" = "split") => {
    const sourceUrl = toCanvasSafeImageUrl(imageUrl);
    setSplitImageUrl(sourceUrl);
    setSplitResults([]);
    setSplitPreviewUrl(null);
    setImageEditorMode(mode);
    setCropAspectRatio("1:1");
    setCropResult(null);
    setCropFocus({ x: 0.5, y: 0.5 });
    setCropScale(1);
    setCropSourceSize(null);
    setCropDisplayRect(null);
    setIsDraggingCrop(false);
    cropDragStartRef.current = null;
    setShowSplitDialog(true);

    // Auto-detect grid
    setIsDetectingGrid(true);
    try {
      const detected = await detectGrid(sourceUrl);
      if (detected) {
        setDetectedGrid(detected);
        setSplitGridRows(detected.rows);
        setSplitGridCols(detected.cols);
        // Generate preview with detected grid
        const preview = await createSplitPreview(sourceUrl, detected.rows, detected.cols);
        setSplitPreviewUrl(preview);
      } else {
        setDetectedGrid(null);
        // Default to 2x2
        setSplitGridRows(2);
        setSplitGridCols(2);
        const preview = await createSplitPreview(sourceUrl, 2, 2);
        setSplitPreviewUrl(preview);
      }

      const sourceImg = await loadImage(sourceUrl);
      setCropSourceSize({
        width: sourceImg.naturalWidth,
        height: sourceImg.naturalHeight,
      });
    } catch (error) {
      console.error("Image tools initialization failed:", error);
      toast.error(t('mediaStudio.cannotProcessImage'));
      setDetectedGrid(null);
    } finally {
      setIsDetectingGrid(false);
    }
  };

  // Update split preview when grid changes
  const updateSplitPreview = async (rows: number, cols: number) => {
    if (!splitImageUrl) return;
    setSplitGridRows(rows);
    setSplitGridCols(cols);
    try {
      const preview = await createSplitPreview(splitImageUrl, rows, cols);
      setSplitPreviewUrl(preview);
      setSplitResults([]); // Clear previous results
    } catch (error) {
      console.error("Failed to create preview:", error);
    }
  };

  // Update crop preview when aspect ratio changes
  const updateCropPreview = (aspectRatio: string) => {
    setCropAspectRatio(aspectRatio);
    setCropResult(null);
  };

  const updateCropDisplayRectFromDom = useCallback(() => {
    const containerEl = cropPreviewContainerRef.current;
    const imageEl = cropPreviewImageRef.current;
    if (!containerEl || !imageEl) return;

    const containerRect = containerEl.getBoundingClientRect();
    const imageRect = imageEl.getBoundingClientRect();
    if (imageRect.width <= 0 || imageRect.height <= 0) return;

    setCropDisplayRect({
      left: imageRect.left - containerRect.left,
      top: imageRect.top - containerRect.top,
      width: imageRect.width,
      height: imageRect.height,
    });
  }, []);

  const cropSelectionRect = useMemo(() => {
    if (!cropSourceSize || !cropDisplayRect) return null;
    const srcRect = getCropRect(
      cropSourceSize.width,
      cropSourceSize.height,
      cropAspectRatio,
      { focusX: cropFocus.x, focusY: cropFocus.y, scale: cropScale }
    );

    const sx = cropDisplayRect.width / cropSourceSize.width;
    const sy = cropDisplayRect.height / cropSourceSize.height;

    return {
      left: cropDisplayRect.left + srcRect.x * sx,
      top: cropDisplayRect.top + srcRect.y * sy,
      width: srcRect.width * sx,
      height: srcRect.height * sy,
    };
  }, [cropSourceSize, cropDisplayRect, cropAspectRatio, cropFocus.x, cropFocus.y, cropScale]);

  const handleCropSelectionMouseDown = (event: any) => {
    if (!cropDisplayRect) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingCrop(true);
    cropDragStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      focusX: cropFocus.x,
      focusY: cropFocus.y,
    };
  };

  useEffect(() => {
    if (!showSplitDialog || imageEditorMode !== "crop") return;

    const syncRect = () => updateCropDisplayRectFromDom();
    // Let browser finish layout/paint first
    const timer = window.setTimeout(syncRect, 0);
    window.addEventListener("resize", syncRect);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", syncRect);
    };
  }, [showSplitDialog, imageEditorMode, splitImageUrl, cropAspectRatio, updateCropDisplayRectFromDom]);

  useEffect(() => {
    if (!isDraggingCrop || !cropDisplayRect) return;

    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

    const onMove = (event: MouseEvent) => {
      const start = cropDragStartRef.current;
      if (!start) return;

      const dx = event.clientX - start.clientX;
      const dy = event.clientY - start.clientY;

      const nextX = clamp01(start.focusX + dx / cropDisplayRect.width);
      const nextY = clamp01(start.focusY + dy / cropDisplayRect.height);
      setCropFocus({ x: nextX, y: nextY });
      setCropResult(null);
    };

    const onUp = () => {
      setIsDraggingCrop(false);
      cropDragStartRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDraggingCrop, cropDisplayRect]);

  const handleCropPreviewWheel = (event: any) => {
    if (imageEditorMode !== "crop") return;
    event.preventDefault();
    const step = event.deltaY > 0 ? -0.03 : 0.03;
    setCropScale((prev) => {
      const next = Math.min(1, Math.max(0.2, prev + step));
      return next;
    });
    setCropResult(null);
  };

  // Execute the split
  const executeSplit = async () => {
    if (!splitImageUrl) return;
    setIsSplitting(true);
    try {
      const results = await splitImage(splitImageUrl, splitGridRows, splitGridCols);
      setSplitResults(results);
      toast.success(t('mediaStudio.splitIntoImages', { count: results.length }));
    } catch (error) {
      console.error("Split failed:", error);
      toast.error(t('mediaStudio.failedToSplitImage'));
    } finally {
      setIsSplitting(false);
    }
  };

  // Execute center crop by selected aspect ratio
  const executeCrop = async () => {
    if (!splitImageUrl) return;
    setIsCropping(true);
    try {
      const result = await cropImageToAspect(
        splitImageUrl,
        cropAspectRatio,
        "image/jpeg",
        0.92,
        { focusX: cropFocus.x, focusY: cropFocus.y, scale: cropScale }
      );
      setCropResult(result);
      toast.success(t('mediaStudio.croppedTo', { ratio: cropAspectRatio, width: result.width, height: result.height }));
    } catch (error) {
      console.error("Crop failed:", error);
      toast.error(t('mediaStudio.failedToCropImage'));
    } finally {
      setIsCropping(false);
    }
  };

  // Download a single split image
  const handleDownloadSplit = (result: SplitResult) => {
    downloadSplitImage(result, `split-image`);
  };

  // Download all split images
  const handleDownloadAllSplits = async () => {
    if (splitResults.length === 0) return;
    toast.info(t('mediaStudio.downloadingImages', { count: splitResults.length }));
    await downloadAllSplitImages(splitResults, `split-image`);
  };

  // Download cropped image
  const handleDownloadCrop = () => {
    if (!cropResult) return;
    downloadCroppedImage(cropResult, "cropped-image");
  };

  // Add split image as reference
  const addSplitAsReference = async (result: SplitResult) => {
    if (referenceImages.length >= maxReferenceImages) {
      toast.error(t('mediaStudio.maxReferenceImagesError', { max: maxReferenceImages }));
      return;
    }
    try {
      // Upload the split image
      const uploadResult = await uploadMutation.mutateAsync({
        fileName: `split-image-${result.index + 1}.jpg`,
        fileType: "image/jpeg",
        fileBase64: result.dataUrl,
      });
      setReferenceImages((prev) => [
        ...prev,
        { url: uploadResult.url, name: `Split ${result.index + 1}` },
      ]);
      toast.success(t('mediaStudio.addedAsReferenceImage'));
    } catch (error) {
      console.error("Failed to upload split image:", error);
      toast.error(t('mediaStudio.failedToAddAsReference'));
    }
  };

  // Add cropped image as reference
  const addCropAsReference = async () => {
    if (!cropResult) return;
    if (referenceImages.length >= maxReferenceImages) {
      toast.error(t('mediaStudio.maxReferenceImagesError', { max: maxReferenceImages }));
      return;
    }
    try {
      const uploadResult = await uploadMutation.mutateAsync({
        fileName: `crop-${cropAspectRatio.replace(":", "x")}.jpg`,
        fileType: "image/jpeg",
        fileBase64: cropResult.dataUrl,
      });
      setReferenceImages((prev) => [
        ...prev,
        { url: uploadResult.url, name: `Crop ${cropAspectRatio}` },
      ]);
      toast.success(t('mediaStudio.addedCroppedImageAsReference'));
    } catch (error) {
      console.error("Failed to upload cropped image:", error);
      toast.error(t('mediaStudio.failedToAddAsReference'));
    }
  };

  // Add all split images to video tab reference
  const addAllSplitsToVideoReference = async () => {
    if (splitResults.length === 0) return;

    // Get video tab's current reference images count
    const videoReferenceCount = tabStates.video.referenceImages.length;
    const videoMaxImages = activeTab === "video" ? maxReferenceImages : 25;
    const availableSlots = videoMaxImages - videoReferenceCount;

    if (availableSlots <= 0) {
      toast.error(t('mediaStudio.videoReferenceFull'));
      return;
    }

    const imagesToAdd = splitResults.slice(0, availableSlots);
    toast.info(t('mediaStudio.addingToVideoReference', { count: imagesToAdd.length }));

    try {
      const uploadedImages: ReferenceImage[] = [];

      for (const result of imagesToAdd) {
        const uploadResult = await uploadMutation.mutateAsync({
          fileName: `split-image-${result.index + 1}.jpg`,
          fileType: "image/jpeg",
          fileBase64: result.dataUrl,
        });
        uploadedImages.push({ url: uploadResult.url, name: `Split ${result.index + 1}` });
      }

      // Update video tab's reference images directly
      setTabStates(prev => ({
        ...prev,
        video: {
          ...prev.video,
          referenceImages: [...prev.video.referenceImages, ...uploadedImages]
        }
      }));

      toast.success(t('mediaStudio.addedImagesToVideoReference', { count: uploadedImages.length }));
    } catch (error) {
      console.error("Failed to upload split images:", error);
      toast.error(t('mediaStudio.failedToAddImagesToVideoReference'));
    }
  };

  // Get model credit cost using pricing tiers from configJson
  const getModelCost = () => {
    if (!mediaModels?.models) return 10;
    const model = mediaModels.models.find((m: any) => m.modelId === selectedModel);
    if (!model) return 10;

    const rawConfig = model.configJson;
    const config = (typeof rawConfig === "string"
      ? (() => { try { return JSON.parse(rawConfig); } catch { return null; } })()
      : rawConfig) as any;
    const baseCost = model.creditCost || 10;
    const effectivePrompt = (enhancedPrompt || prompt || "").trim();

    // If no pricing tiers, use legacy calculation
    if (!config?.pricingTiers) {
      if (activeTab === "image") return baseCost * numImages;
      if (activeTab === "video") {
        return selectedVideoDuration !== undefined
          ? baseCost * Math.ceil(selectedVideoDuration / 5)
          : baseCost;
      }
      return baseCost;
    }

    const tierKey = buildPricingTierKey(config, modelInputValues);

    const tierCost = config.pricingTiers[tierKey] ?? baseCost;

    if (config.pricingFormula === "per_unit") {
      const metric = String(config.pricingUnitMetric || "characters");
      const sourceField = String(config.pricingUnitField || "text");
      const roundingMode = String(config.pricingUnitRounding || "ceil");
      const rawUnitSize = Number(config.pricingUnitSize);
      const unitSize = Number.isFinite(rawUnitSize) && rawUnitSize > 0 ? rawUnitSize : 1;
      const minUnitsRaw = Number(config.pricingMinUnits);
      const minUnits = Number.isFinite(minUnitsRaw) && minUnitsRaw >= 0 ? minUnitsRaw : 0;

      let sourceValue: unknown;
      if (sourceField === "text" || sourceField === "prompt") {
        sourceValue = effectivePrompt;
      } else {
        sourceValue = getTemplatePathValue(modelInputValues, sourceField);
      }

      const sourceRootField = sourceField.split(".")[0];
      const fieldCfg = (config.inputFields || []).find(
        (f: any) => f.key === sourceField || f.key === sourceRootField,
      );
      if (fieldCfg?.type === "array") {
        sourceValue = resolveArrayFieldRuntimeValue(fieldCfg, sourceValue, {
          prompt: effectivePrompt,
          fields: modelInputValues,
          activeTab,
        });
      }

      const measured = measurePricingUnits(sourceValue, metric, {
        ignoreWhitespace: config.pricingIgnoreWhitespace === true,
      });
      const rawUnits = measured / unitSize;
      const roundedUnits = measured > 0
        ? (roundingMode === "floor" ? Math.floor(rawUnits) : roundingMode === "round" ? Math.round(rawUnits) : Math.ceil(rawUnits))
        : 0;
      const chargeUnits = Math.max(minUnits, roundedUnits);
      return tierCost * chargeUnits;
    }

    const multiplier = activeTab === "image" ? numImages : 1;
    return tierCost * multiplier;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/dashboard")}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t('common.back')}
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">{t('mediaStudio.title')}</h1>
                  <p className="text-xs text-muted-foreground">{t('mediaStudio.description')}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <LocaleToggle className="hidden sm:inline-flex" />
              <HelpButton page="/media-studio" variant="ghost" size="sm" />
              <Badge variant="secondary" className="gap-1">
                <Zap className="h-3 w-3" />
                {credits?.credits || 0} {t('credits.unit')}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => setLocation("/media-history")}>
                <History className="h-4 w-4 mr-1" />
                {t('mediaStudio.history')}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Controls */}
          <div className="lg:col-span-2 space-y-4">
            {/* Media Type Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as MediaType)}>
              <TabsList className="w-full bg-muted/50 p-1">
                <TabsTrigger
                  value="image"
                  className="flex-1 gap-2 data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
                >
                  <Image className="h-4 w-4" />
                  {t('mediaStudio.tabs.image')}
                </TabsTrigger>
                <TabsTrigger
                  value="video"
                  className="flex-1 gap-2 data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
                >
                  <Video className="h-4 w-4" />
                  {t('mediaStudio.tabs.video')}
                </TabsTrigger>
                <TabsTrigger
                  value="audio"
                  className="flex-1 gap-2 data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
                >
                  <Music className="h-4 w-4" />
                  {t('mediaStudio.tabs.audio')}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <DashboardCard
              className="overflow-hidden border-cyan-200/70 bg-gradient-to-br from-white via-white to-cyan-50/60 shadow-[0_18px_50px_rgba(14,165,233,0.08)]"
              bodyClassName="p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <DashboardSectionHeader
                  eyebrow="Content Composer"
                  title="Article and social draft workspace"
                  description="Draft content, attach library assets, and prepare blog or social delivery from one place."
                />
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-800">
                    Draft workspace
                  </Badge>
                  <Button
                    variant={isComposerOpen ? "outline" : "default"}
                    className={cn(
                      isComposerOpen
                        ? "border-cyan-200 text-cyan-900"
                        : "bg-cyan-600 text-white hover:bg-cyan-700",
                    )}
                    onClick={() => setIsComposerOpen((value) => !value)}
                  >
                    {isComposerOpen ? "Collapse composer" : "Open composer"}
                    <ChevronDown className={cn("ml-2 h-4 w-4 transition-transform", isComposerOpen && "rotate-180")} />
                  </Button>
                </div>
              </div>

              <div className="mt-4">
                <Collapsible open={isComposerOpen} onOpenChange={setIsComposerOpen}>
                  <CollapsibleContent className="space-y-4">
                    <ContentComposerPanel className="mt-2" />
                  </CollapsibleContent>
                  <div className={cn(
                    "rounded-3xl border border-cyan-200/70 bg-white/90 p-5 shadow-sm transition-all",
                    isComposerOpen && "hidden",
                  )}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.34em] text-cyan-700">
                          Ready when you need it
                        </p>
                        <h3 className="text-xl font-semibold text-slate-900">
                          Compose articles, route them to Docs or Blog, and publish from one focused panel.
                        </h3>
                        <p className="max-w-3xl text-sm leading-6 text-slate-600">
                          The composer stays collapsed by default so Media Studio feels light. Open it when you need to draft, target a destination, or generate a social caption.
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          onClick={() => setIsComposerOpen(true)}
                          className="bg-cyan-600 text-white hover:bg-cyan-700"
                        >
                          Open Content Composer
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsComposerOpen(true);
                            window.setTimeout(() => {
                              const el = document.querySelector('[data-content-composer-panel="true"]');
                              if (el instanceof HTMLElement) {
                                el.scrollIntoView({ behavior: "smooth", block: "start" });
                              }
                            }, 0);
                          }}
                        >
                          Jump to editor
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {[
                        "Docs ready",
                        "Blog ready",
                        "Social caption generation",
                        "Autosave drafts",
                      ].map((label) => (
                        <Badge key={label} variant="secondary" className="bg-cyan-50 text-cyan-800">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </Collapsible>
              </div>
            </DashboardCard>

            {/* Prompt Input */}
            <DashboardCard className="space-y-4" bodyClassName="p-4">
              <DashboardSectionHeader
                eyebrow={t('mediaStudio.prompt.eyebrow')}
                title={t('mediaStudio.prompt.title')}
                description={t('mediaStudio.prompt.description')}
                trailing={(
                  <Badge variant="outline">{getModelCost()} credits</Badge>
                )}
              />
              <div className="flex items-center justify-end gap-2">
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={isPttRecording ? "destructive" : "outline"}
                          size="sm"
                          onPointerDown={pttStart}
                          onPointerUp={pttStop}
                          onPointerLeave={isPttRecording ? pttStop : undefined}
                          disabled={isPttTranscribing}
                        >
                          {isPttTranscribing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Mic className={cn("h-4 w-4", isPttRecording && "animate-pulse")} />
                          )}
                          <span className="ml-1">{isPttRecording ? t('mediaStudio.recording') : t('mediaStudio.mic')}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('mediaStudio.recordHint')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const text = enhancedPrompt || prompt;
                            if (!text.trim()) return;
                            setIsTranslating(true);
                            setShowTranslation(false);
                            translateMutation.mutate({ text });
                          }}
                          disabled={!(enhancedPrompt || prompt).trim() || isTranslating}
                        >
                          {isTranslating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Languages className="h-4 w-4" />
                          )}
                          <span className="ml-1">{t('mediaStudio.translate')}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('mediaStudio.translateHint')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAutoPrompt}
                          disabled={(!prompt.trim() && referenceImages.length === 0) || isEnhancing}
                        >
                          {isEnhancing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wand2 className="h-4 w-4" />
                          )}
                          <span className="ml-1">{t('mediaStudio.autoPrompt')}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('mediaStudio.autoPromptHint')}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Works with text, images, or both
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {/* Clear Prompt Button */}
                  {(prompt.trim() || enhancedPrompt) && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setPrompt("");
                              setEnhancedPrompt("");
                              setImageTabPrompt(null);
                              setVideoTabPrompt(null);
                            }}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                            <span className="ml-1">{t('common.clear')}</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('mediaStudio.clearHint')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                </div>

              <Textarea
                ref={promptTextareaRef}
                value={enhancedPrompt || prompt}
                onChange={(e) => {
                  if (enhancedPrompt) {
                    setEnhancedPrompt(e.target.value);
                  } else {
                    setPrompt(e.target.value);
                  }
                }}
                placeholder={`Describe the ${activeTab} you want to create...`}
                className="min-h-[120px] resize-y"
              />

              {activeTab === "video" && (currentPromptBundle.sharedContext || referenceNotesEditorOpen) && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                      <CheckCircle className="h-4 w-4" />
                      REFERENCE NOTES
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!referenceNotesEditorOpen ? (
                        <>
                          <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
                            Auto-synced
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                            onClick={openReferenceNotesEditor}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-800 hover:bg-emerald-100"
                            onClick={regenerateReferenceNotes}
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Regenerate
                          </Button>
                        </>
                      ) : (
                        <>
                          <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
                            Editing
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-800 hover:bg-emerald-100"
                            onClick={() => {
                              setReferenceNotesDraft(currentPromptBundle.sharedContext);
                            }}
                          >
                            Reset
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-800 hover:bg-emerald-100"
                            onClick={() => setReferenceNotesEditorOpen(false)}
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {!referenceNotesEditorOpen ? (
                    <>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-950/90">
                        {currentPromptBundle.sharedContext || "No shared continuity notes detected yet."}
                      </p>
                      <p className="mt-2 text-xs text-emerald-700/80">
                        This shared block will be merged into every prompt before Media Studio generates the videos.
                      </p>
                    </>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        value={referenceNotesDraft}
                        onChange={(e) => setReferenceNotesDraft(e.target.value)}
                        className="min-h-[120px] bg-white/90"
                        placeholder="Summarize the recurring character, location, props, and visual anchors here..."
                      />
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                          onClick={() => setReferenceNotesEditorOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={saveReferenceNotes}
                        >
                          Apply to all prompts
                        </Button>
                      </div>
                      <p className="text-xs text-emerald-700/80 text-right">
                        Applies the shared continuity notes to every prompt in this batch.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Character Count */}
              {(() => {
                const currentPromptLength = (enhancedPrompt || prompt).length;
                const modelData = mediaModels?.models?.find((m: any) => m.modelId === selectedModel);
                const config = modelData?.configJson as any;
                const parsedMaxLength = Number(config?.maxPromptLength);
                const maxLength = Number.isFinite(parsedMaxLength) && parsedMaxLength > 0 ? parsedMaxLength : null;
                const isOverLimit = maxLength !== null ? currentPromptLength > maxLength : false;
                const isNearLimit = maxLength !== null ? currentPromptLength > maxLength * 0.95 : false;

                return (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className={cn(
                      isOverLimit && "text-red-600 font-medium",
                      isNearLimit && !isOverLimit && "text-amber-600"
                    )}>
                      {maxLength !== null
                        ? `${currentPromptLength.toLocaleString()} / ${maxLength.toLocaleString()} characters`
                        : `${currentPromptLength.toLocaleString()} characters`}
                    </span>
                    {isOverLimit && maxLength !== null && (
                      <span className="text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Exceeds model limit
                      </span>
                    )}
                    {isNearLimit && !isOverLimit && maxLength !== null && (
                      <span className="text-amber-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Approaching limit
                      </span>
                    )}
                    {maxLength === null && (
                      <span className="text-muted-foreground">
                        No model prompt limit configured
                      </span>
                    )}
                  </div>
                );
              })()}

              {enhancedPrompt && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-green-500" />
                  <span>
                    {imageTabPrompt || videoTabPrompt
                      ? t('mediaStudio.promptEnhancedSplit')
                      : t('mediaStudio.promptEnhanced')}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEnhancedPrompt("");
                      setImageTabPrompt(null);
                      setVideoTabPrompt(null);
                    }}
                  >
                    {t('common.clear')}
                  </Button>
                </div>
              )}

              {/* Translation Popup */}
              {showTranslation && translatedText && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-blue-700">{t('translation')}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(translatedText);
                          setTranslationCopied(true);
                          setTimeout(() => setTranslationCopied(false), 2000);
                        }}
                      >
                        {translationCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        <span className="ml-1">
                          {translationCopied ? t('mediaStudio.copiedShort') : t('common.copy')}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setShowTranslation(false)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-blue-900 whitespace-pre-wrap">{translatedText}</p>
                </div>
              )}

              {/* Reference Images with Drop Zone */}
              {activeTab !== "audio" && (
                <div
                  className={cn(
                    "space-y-2 p-3 rounded-lg border-2 border-dashed transition-all",
                    isDraggingOver
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300",
                    selectedModel && !selectedMediaModelReferenceSupport.imageUrls && "opacity-60",
                  )}
                  onDragOver={selectedModel && selectedMediaModelReferenceSupport.imageUrls ? handleDragOver : undefined}
                  onDragLeave={selectedModel && selectedMediaModelReferenceSupport.imageUrls ? handleDragLeave : undefined}
                  onDrop={selectedModel && selectedMediaModelReferenceSupport.imageUrls ? handleDrop : undefined}
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium">
                      {t('mediaStudio.referenceImages', { count: referenceImages.length, max: maxReferenceImages })}
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={Boolean(selectedModel && !selectedMediaModelReferenceSupport.imageUrls) || referenceImages.length >= maxReferenceImages || uploadMutation.isPending}
                    >
                      {uploadMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ImagePlus className="h-4 w-4" />
                      )}
                      <span className="ml-1">{t('addImage')}</span>
                    </Button>
                  </div>

                  {!selectedModel || selectedMediaModelReferenceSupport.imageUrls ? (
                    referenceImages.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {referenceImages.map((img, idx) => (
                          <div key={idx} className="relative group">
                            <img
                              src={img.url}
                              alt={img.name}
                              className="h-16 w-16 rounded-lg object-cover border"
                            />
                            <button
                              onClick={() => removeReferenceImage(idx)}
                              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                            <Badge
                              variant="secondary"
                              className="absolute bottom-0 left-0 text-[10px] px-1"
                            >
                              {idx + 1}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center py-4 text-muted-foreground">
                        <Upload className="h-4 w-4 mr-2" />
                        <span className="text-sm">{t('mediaStudio.dropReferenceHint')}</span>
                      </div>
                    )
                  ) : (
                    <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                      This model does not accept image references.
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    {selectedModel && !selectedMediaModelReferenceSupport.imageUrls
                      ? "Image references are disabled for the selected model."
                      : t('mediaStudio.dragHistoryHint')}
                  </p>
                </div>
              )}

              {/* Reference Videos with Drop Zone */}
              {activeTab === "video" && (
                <div
                  className={cn(
                    "space-y-2 p-3 rounded-lg border-2 border-dashed transition-all",
                    isVideoDraggingOver
                      ? "border-blue-500 bg-blue-50"
                      : selectedModel && !selectedMediaModelReferenceSupport.videoUrls
                        ? "border-gray-200 bg-gray-50 opacity-70"
                        : "border-gray-200 hover:border-gray-300",
                  )}
                  onDragOver={selectedModel && selectedMediaModelReferenceSupport.videoUrls ? handleVideoDragOver : undefined}
                  onDragLeave={selectedModel && selectedMediaModelReferenceSupport.videoUrls ? handleVideoDragLeave : undefined}
                  onDrop={selectedModel && selectedMediaModelReferenceSupport.videoUrls ? handleVideoDrop : undefined}
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium">
                      Reference Videos ({referenceVideos.length}{maxReferenceVideos > 0 ? `/${maxReferenceVideos}` : ""})
                    </label>
                    <input
                      ref={videoFileInputRef}
                      type="file"
                      accept="video/*"
                      multiple
                      className="hidden"
                      onChange={handleVideoFileUpload}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => videoFileInputRef.current?.click()}
                      disabled={Boolean(selectedModel && !selectedMediaModelReferenceSupport.videoUrls) || referenceVideos.length >= maxReferenceVideos || uploadMutation.isPending}
                    >
                      {uploadMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Video className="h-4 w-4" />
                      )}
                      <span className="ml-1">Add Video</span>
                    </Button>
                  </div>

                  {!selectedModel || selectedMediaModelReferenceSupport.videoUrls ? (
                    referenceVideos.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {referenceVideos.map((video, idx) => (
                          <div key={idx} className="relative group">
                            <video
                              src={video.url}
                              className="h-16 w-28 rounded-lg object-cover border bg-black"
                              controls
                              muted
                              playsInline
                            />
                            <button
                              onClick={() => removeReferenceVideo(idx)}
                              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                            <Badge
                              variant="secondary"
                              className="absolute bottom-0 left-0 text-[10px] px-1"
                            >
                              {idx + 1}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center py-4 text-muted-foreground">
                        <Upload className="h-4 w-4 mr-2" />
                        <span className="text-sm">Drop or add reference videos here.</span>
                      </div>
                    )
                  ) : (
                    <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                      This model does not accept video references.
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    {selectedModel && !selectedMediaModelReferenceSupport.videoUrls
                      ? "Video references are disabled for the selected model."
                      : "Use one or more reference videos when the selected model supports vid2vid."}
                  </p>
                </div>
              )}

              {/* Generate Button - Primary location under Prompt */}
              <Button
                onClick={handleGenerate}
                disabled={!canGenerateInMediaStudio({
                  prompt,
                  enhancedPrompt,
                  advancedRequest: useAdvancedMode ? dynamicFormValues.request as string : "",
                  isGenerating,
                  credits: credits?.credits || 0,
                  modelCost: getModelCost(),
                })}
                className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    {t('mediaStudio.generating')}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-2" />
                    {t('mediaStudio.generateTab', { tab: t(`mediaStudio.tabs.${activeTab}`) })}
                  </>
                )}
              </Button>

              {(credits?.credits || 0) < getModelCost() && (
                <p className="text-sm text-red-500 text-center">
                  {t('mediaStudio.notEnoughCredits')}{" "}
                  <button onClick={() => setLocation("/credits")} className="underline">
                    {t('mediaStudio.buyMore')}
                  </button>
                </p>
              )}
            </DashboardCard>

            {/* Settings */}
            <div className="bg-white/70 backdrop-blur rounded-xl border p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <h3 className="font-semibold">{t('mediaStudio.settingsTitle')}</h3>
              </div>

              <p className="text-xs text-muted-foreground">
                {t('mediaStudio.settingsHint')}
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Model Selection */}
                <div className="space-y-1 col-span-2 md:col-span-1">
                  <label className="text-sm text-muted-foreground">{t('mediaStudio.modelLabel')}</label>
                  <Button
                    variant="outline"
                    className="w-full justify-start h-auto min-h-10 py-2"
                    onClick={() => setShowModelDialog(true)}
                  >
                    <Bot className="h-4 w-4 mr-2" />
                    <span className="flex-1 text-left break-words whitespace-normal">
                      {selectedModel
                        ? mediaModels?.models?.find((m: any) => m.modelId === selectedModel)?.name || t('mediaStudio.selectModel')
                        : t('mediaStudio.selectModel')}
                    </span>
                    {selectedMediaModelGenerationModeLabel && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "ml-2 text-[10px] shrink-0",
                          selectedMediaModelGenerationModeLabel === "Video to Video"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : selectedMediaModelGenerationModeLabel === "Text to Video"
                              ? "border-sky-300 bg-sky-50 text-sky-700"
                              : "border-slate-300 bg-slate-50 text-slate-700",
                        )}
                      >
                        {selectedMediaModelGenerationModeLabel}
                      </Badge>
                    )}
                    {selectedModel && mediaModels?.models?.find((m: any) => m.modelId === selectedModel) && (
                      <Badge variant="outline" className="ml-2 text-xs shrink-0">
                        {getModelCost()}c
                      </Badge>
                    )}
                  </Button>
                  <ModelSelectorDialog
                    open={showModelDialog}
                    onOpenChange={setShowModelDialog}
                    models={mediaModels?.models || []}
                    providers={
                      ((mediaModels?.providers as string[] | undefined) || []).map((name) => ({
                        id: name,
                        name,
                        displayName: name,
                      }))
                    }
                    selectedModelId={selectedModel}
                    onSelect={setSelectedModel}
                    mediaType={activeTab}
                    isLoading={!mediaModels}
                  />
                </div>

                {/* Aspect Ratio — uses model-specific options from configJson when available (not for audio) */}
                {activeTab !== "audio" && (() => {
                  const modelData = mediaModels?.models?.find((m: any) => m.modelId === selectedModel);
                  const config = modelData?.configJson as any;
                  const arField = config?.inputFields?.find((f: any) => f.key === "aspect_ratio");
                  const arOptions = arField?.options as { value: string; label: string }[] | undefined;
                  // Also check model's top-level aspectRatios array
                  const modelAspectRatios = modelData?.aspectRatios as string[] | null;
                  const defaultOptions = [
                    { value: "1:1", label: "1:1 (Square)" },
                    { value: "16:9", label: "16:9 (Landscape)" },
                    { value: "9:16", label: "9:16 (Portrait)" },
                    { value: "4:3", label: "4:3" },
                    { value: "3:4", label: "3:4" },
                  ];
                  const options = arOptions
                    || (modelAspectRatios?.length ? modelAspectRatios.map((r: any) => ({ value: r, label: r })) : null)
                    || defaultOptions;
                  const isDisabled = isFieldDisabledByAdvancedMode("aspectRatio");
                  return (
                    <div className="space-y-1">
                      <label className={cn("text-sm text-muted-foreground", isDisabled && "opacity-50")}>
                        {t('mediaStudio.aspectRatio')}
                        {arField?.affectsPricing && <span className="ml-1 text-xs text-amber-500">($)</span>}
                        {isDisabled && <span className="ml-1 text-xs text-blue-500">(use Advanced)</span>}
                      </label>
                      <Select
                        value={aspectRatio}
                        onValueChange={setAspectRatio}
                        disabled={isDisabled}
                      >
                        <SelectTrigger className={cn(isDisabled && "opacity-50")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {options.filter(opt => opt.value != null && opt.value !== "").map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}

                {/* Number of Images (for image only) */}
                {activeTab === "image" && (
                  <div className="space-y-1">
                    <label className="text-sm text-muted-foreground">{t('mediaStudio.count')}</label>
                    <Select value={String(numImages)} onValueChange={(v) => setNumImages(Number(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} image{n > 1 ? "s" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Duration (video only) — shown only when the selected model declares a duration field */}
                {activeTab === "video" && selectedDurationField && (() => {
                  const durationOptions = selectedDurationField.options as { value: string; label: string }[] | undefined;
                  const currentVal = String(modelInputValues.duration ?? selectedDurationField.default ?? duration);
                  return (
                    <div className="space-y-1">
                      <label className="text-sm text-muted-foreground">
                        {t('mediaStudio.duration')}
                        {selectedDurationField.affectsPricing && <span className="ml-1 text-xs text-amber-500">($)</span>}
                      </label>
                      <Select
                        value={currentVal}
                        onValueChange={(v) => {
                          setDuration(Number(v));
                          setModelInputValues((prev: Record<string, any>) => ({ ...prev, duration: v }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {durationOptions
                            ? durationOptions.filter(opt => opt.value != null && opt.value !== "").map((opt) => (
                                <SelectItem key={String(opt.value)} value={String(opt.value)}>
                                  {opt.label}
                                </SelectItem>
                              ))
                            : [5, 10, 15, 20].map((d) => (
                                <SelectItem key={d} value={String(d)}>
                                  {d} seconds
                                </SelectItem>
                              ))
                          }
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}

                {/* Dynamic Model Input Fields from configJson */}
                {(() => {
                  const modelData = (mediaModels?.models as any[] | undefined)?.find((m) => m.modelId === selectedModel);
                  const config = modelData?.configJson as any;
                  const allFields: any[] = config?.inputFields ?? [];

                  const SYNC_LABELS: Record<string, string> = {
                    reference_images: t('mediaStudio.referenceImagesLabel'),
                    reference_videos: "Reference Videos",
                    prompt: t('mediaStudio.promptLabel'),
                    aspect_ratio: t('mediaStudio.aspectRatioLabel'),
                  };

                  // Synced fields: ONLY those with an explicit syncWith target (never guess from type).
                  const syncedFields = allFields.filter((f) => {
                    const sw: string = inferModelInputSyncTarget(f);
                    return sw !== "none";
                  });

                  // Editable fields: unsynced model-specific inputs.
                  const editableFields = allFields.filter((f) => {
                    const sw: string = inferModelInputSyncTarget(f);
                    if (sw !== "none") return false;
                    if (f.key === "aspect_ratio" || f.key === "aspect.ratio") return false;
                    if (f.key === "duration" && activeTab === "video") return false;
                    return true;
                  });

                  if (syncedFields.length === 0 && editableFields.length === 0) return null;

                  return (
                    <>
                      {/* Synced (read-only) fields */}
                      {syncedFields.map((field: any) => {
                        const sw: string = inferModelInputSyncTarget(field);
                        const syncLabel = SYNC_LABELS[sw] ?? t('mediaStudio.synced');

                        let preview = "—";
                        if (sw === "reference_images") {
                          preview = referenceImages.length === 0
                            ? t('mediaStudio.noImagesSelected')
                            : `${referenceImages.length} image${referenceImages.length !== 1 ? "s" : ""} synced`;
                        } else if (sw === "reference_videos") {
                          preview = referenceVideos.length === 0
                            ? "No videos selected"
                            : `${referenceVideos.length} video${referenceVideos.length !== 1 ? "s" : ""} synced`;
                        } else if (sw === "prompt") {
                          const src = (enhancedPrompt || prompt).trim();
                          preview = src.length === 0 ? t('mediaStudio.noPromptYet') : src.length > 60 ? src.slice(0, 60) + "…" : src;
                        } else if (sw === "aspect_ratio") {
                          preview = aspectRatio || "—";
                        }

                        return (
                          <div key={field.key} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-sm text-muted-foreground">
                                {field.label}
                                {field.affectsPricing && <span className="ml-1 text-xs text-amber-500">($)</span>}
                              </label>
                              <Badge variant="secondary" className="flex items-center gap-1 px-1.5 py-0 text-[10px] font-normal">
                                <Lock className="h-2.5 w-2.5" />
                                {syncLabel}
                              </Badge>
                            </div>
                            <div className="flex min-h-9 cursor-not-allowed items-center rounded-md border border-dashed bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground select-none">
                              {preview}
                            </div>
                          </div>
                        );
                      })}

                      {/* Editable fields */}
                      {editableFields.map((field: any) => (
                        <div key={field.key} className="space-y-1">
                          <label className="text-sm text-muted-foreground">
                            {field.label}
                            {field.affectsPricing && <span className="ml-1 text-xs text-amber-500">($)</span>}
                          </label>
                          {isSearchableModelField(field) ? (
                            <div className="space-y-2">
                              {(() => {
                                const isOpen = fieldPickerOpenKey === field.key;
                                const isUvoiceVoiceField = isUvoiceVoiceSelectionField(selectedMediaModel?.provider, field);
                                const cachedFieldOptions = fieldOptionsCache[field.key] ?? [];
                                const fieldOptions = isOpen
                                  ? activeDynamicFieldOptions
                                  : isUvoiceVoiceField
                                    ? cachedFieldOptions
                                    : normalizeModelFieldOptions(field.options);
                                const currentValue = String(modelInputValues[field.key] ?? field.default ?? "");
                                const selectedOption = fieldOptions.find((opt) => opt.value === currentValue);
                                const isLoadingOptions = isOpen && shouldLoadDynamicFieldOptions && isDynamicFieldOptionsLoading;
                                const supportsRefresh = hasProviderApiOptionsSource(field);
                                const supportsManualInput = field.type !== "select";
                                const isVoiceField = isVoiceSelectionField(field);
                                return (
                                  <>
                              <div className="flex items-center gap-2">
                                <Popover
                                  open={isOpen}
                                  onOpenChange={(open) => {
                                    if (open) {
                                      setFieldPickerOpenKey(field.key);
                                      return;
                                    }
                                    if (fieldPickerOpenKey === field.key) {
                                      setFieldPickerOpenKey(null);
                                    }
                                  }}
                                >
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      role="combobox"
                                      className="h-10 w-full justify-between"
                                    >
                                      <span className="truncate text-left">
                                        {selectedOption
                                          ? isUvoiceVoiceField
                                            ? selectedOption.label
                                            : `${selectedOption.label} (${selectedOption.value})`
                                          : currentValue
                                            ? currentValue
                                            : isLoadingOptions
                                              ? t('mediaStudio.loadingOptions')
                                              : t('mediaStudio.selectOption')}
                                      </span>
                                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                                    <Command>
                                      <CommandInput placeholder={t('mediaStudio.searchField', { field: String(field.label || field.key).toLowerCase() })} />
                                      <CommandList>
                                        <CommandEmpty>
                                          {isLoadingOptions ? t('mediaStudio.loadingOptions') : t('mediaStudio.noOptionsFound')}
                                        </CommandEmpty>
                                        <CommandGroup>
                                          {fieldOptions.map((opt) => (
                                            <CommandItem
                                              key={opt.value}
                                              value={`${opt.label} ${opt.value}`}
                                              onSelect={() => {
                                                setModelInputValues((prev: Record<string, any>) => ({ ...prev, [field.key]: opt.value }));
                                                setFieldPickerOpenKey(null);
                                              }}
                                            >
                                              <div className="flex w-full items-center gap-2">
                                                <Check
                                                  className={cn(
                                                    "h-4 w-4",
                                                    currentValue === opt.value
                                                      ? "opacity-100"
                                                    : "opacity-0",
                                                  )}
                                                />
                                                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                                                {!isUvoiceVoiceField && opt.label !== opt.value && (
                                                  <span className="truncate text-xs text-muted-foreground">{opt.value}</span>
                                                )}
                                                {isVoiceField && (
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 shrink-0"
                                                    disabled={!opt.previewUrl}
                                                    onMouseDown={(e) => {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                    }}
                                                    onClick={(e) => {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                      toggleVoicePreview(field.key, opt);
                                                    }}
                                                    title={opt.previewUrl ? t('mediaStudio.playVoicePreview') : t('mediaStudio.noPreviewAvailable')}
                                                  >
                                                    {loadingVoicePreviewKey === `${field.key}:${opt.value}` ? (
                                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : playingVoicePreviewKey === `${field.key}:${opt.value}` ? (
                                                      <Pause className="h-3.5 w-3.5" />
                                                    ) : (
                                                      <Play className="h-3.5 w-3.5" />
                                                    )}
                                                  </Button>
                                                )}
                                              </div>
                                            </CommandItem>
                                          ))}
                                        </CommandGroup>
                                      </CommandList>
                                    </Command>
                                  </PopoverContent>
                                </Popover>
                                {supportsRefresh && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 shrink-0"
                                    onClick={() => {
                                      setFieldPickerOpenKey(field.key);
                                      void refetchDynamicFieldOptions();
                                    }}
                                    title={t('mediaStudio.refreshOptions')}
                                  >
                                    <RefreshCw className={cn("h-4 w-4", isLoadingOptions && "animate-spin")} />
                                  </Button>
                                )}
                              </div>
                              {supportsManualInput && (
                                <Input
                                  type="text"
                                  placeholder={t('mediaStudio.customValuePlaceholder', { field: String(field.label || field.key) })}
                                  value={currentValue}
                                  onChange={(e) => setModelInputValues((prev: Record<string, any>) => ({ ...prev, [field.key]: e.target.value }))}
                                />
                              )}
                              {!isLoadingOptions && fieldOptions.length === 0 && supportsManualInput && (
                                <p className="text-xs text-muted-foreground">
                                  {t('mediaStudio.optionListUnavailable')}
                                </p>
                              )}
                                  </>
                                );
                              })()}
                            </div>
                          ) : field.type === "library_file" ? (
                            <LibraryFilePicker
                              value={String(modelInputValues[field.key] ?? "")}
                              onValueChange={(url) => setModelInputValues((prev: Record<string, any>) => ({ ...prev, [field.key]: url }))}
                              allowedExtensions={
                                field.allowedExtensions
                                  ? String(field.allowedExtensions).split(",").map((e: string) => e.trim().replace(/^\./, "")).filter(Boolean)
                                  : undefined
                              }
                            />
                          ) : field.type === "image_urls" || field.type === "video_urls" || field.type === "audio_urls" ? (
                            <div className="space-y-2">
                              <Textarea
                                rows={4}
                                placeholder={t('mediaStudio.arrayPlaceholder', { field: String(field.label) })}
                                value={
                                  Array.isArray(modelInputValues[field.key])
                                    ? modelInputValues[field.key].join("\n")
                                    : typeof modelInputValues[field.key] === "string"
                                      ? modelInputValues[field.key]
                                      : ""
                                }
                                onChange={(e) => {
                                  const urls = e.target.value
                                    .split(/\r?\n/)
                                    .map((value) => value.trim())
                                    .filter(Boolean);
                                  setModelInputValues((prev: Record<string, any>) => ({ ...prev, [field.key]: urls }));
                                }}
                              />
                              <LibraryFilePicker
                                value=""
                                onValueChange={(url) => {
                                  const normalized = String(url || "").trim();
                                  if (!normalized) {
                                    return;
                                  }
                                  const currentUrls = Array.isArray(modelInputValues[field.key])
                                    ? modelInputValues[field.key].filter((entry: unknown): entry is string => typeof entry === "string")
                                    : typeof modelInputValues[field.key] === "string"
                                      ? String(modelInputValues[field.key]).split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)
                                      : [];
                                  const deduped = Array.from(new Set([...currentUrls, normalized]));
                                  setModelInputValues((prev: Record<string, any>) => ({ ...prev, [field.key]: deduped }));
                                }}
                                allowedExtensions={getAllowedLibraryExtensionsForField(field)}
                              />
                            </div>
                          ) : field.type === "select" && field.options ? (
                            <Select
                              value={String(modelInputValues[field.key] ?? field.default ?? field.options?.[0]?.value ?? "")}
                              onValueChange={(v) => setModelInputValues((prev: Record<string, any>) => ({ ...prev, [field.key]: v }))}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(field.options as any[]).filter((opt) => opt.value != null && opt.value !== "").map((opt) => (
                                  <SelectItem key={String(opt.value)} value={String(opt.value)}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : field.type === "boolean" ? (
                            <div className="flex items-center gap-2 h-10">
                              <Switch
                                checked={!!modelInputValues[field.key]}
                                onCheckedChange={(v) => setModelInputValues((prev: Record<string, any>) => ({ ...prev, [field.key]: v }))}
                              />
                              <span className="text-sm">{modelInputValues[field.key] ? t('mediaStudio.on') : t('mediaStudio.off')}</span>
                            </div>
                          ) : field.type === "array" ? (
                            <Textarea
                              rows={4}
                              placeholder={t('mediaStudio.arrayPlaceholder', { field: String(field.label) })}
                              value={
                                typeof modelInputValues[field.key] === "string"
                                  ? modelInputValues[field.key]
                                  : modelInputValues[field.key] === undefined || modelInputValues[field.key] === null
                                  ? ""
                                  : JSON.stringify(modelInputValues[field.key], null, 2)
                              }
                              onChange={(e) => setModelInputValues((prev: Record<string, any>) => ({ ...prev, [field.key]: e.target.value }))}
                            />
                          ) : field.type === "number" ? (
                            <Input
                              type="number"
                              value={modelInputValues[field.key] ?? field.default ?? ""}
                              onChange={(e) => setModelInputValues((prev: Record<string, any>) => ({ ...prev, [field.key]: Number(e.target.value) }))}
                            />
                          ) : (
                            <Input
                              type="text"
                              placeholder={field.label}
                              value={modelInputValues[field.key] ?? ""}
                              onChange={(e) => setModelInputValues((prev: Record<string, any>) => ({ ...prev, [field.key]: e.target.value }))}
                            />
                          )}
                        </div>
                      ))}
                    </>
                  );
                })()}

                {/* Style Selection (not for audio) */}
                {activeTab !== "audio" && (
                <div className="space-y-1">
                  <label className={cn(
                    "text-sm text-muted-foreground",
                    isFieldDisabledByAdvancedMode("style") && "opacity-50"
                  )}>
                    {t('mediaStudio.style')}
                    {isFieldDisabledByAdvancedMode("style") && (
                      <span className="ml-1 text-xs text-blue-500">(use Advanced)</span>
                    )}
                  </label>
                  <Dialog open={showStyleDialog} onOpenChange={setShowStyleDialog}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full justify-start", isFieldDisabledByAdvancedMode("style") && "opacity-50")}
                        disabled={isFieldDisabledByAdvancedMode("style")}
                      >
                        <Palette className="h-4 w-4 mr-2" />
                        {selectedStyle || t('mediaStudio.selectStyle')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>{t('mediaStudio.chooseStyle')}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        {styleCategories?.map((category: StyleCategory) => (
                          <div key={category.id} className="space-y-2">
                            <h4 className="font-medium text-sm text-muted-foreground">
                              {category.id}. {category.name}
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              {category.styles.map((style: StyleOption) => (
                                <button
                                  key={style.id}
                                  onClick={() => {
                                    setSelectedStyleCategory(category.id);
                                    setSelectedStyle(style.name);
                                    setShowStyleDialog(false);
                                    // Auto-fill prompt for Upscale style
                                    if (style.name === "Upscale") {
                                      setPrompt(UPSCALE_DEFAULT_PROMPT);
                                      toast.success(t('mediaStudio.upscaleAutoFilled'), {
                                        description: t('mediaStudio.upscaleAutoFilledDesc'),
                                      });
                                    }
                                  }}
                                  className={cn(
                                    "text-left px-3 py-2 rounded-lg border text-sm transition-colors",
                                    selectedStyle === style.name
                                      ? "border-blue-500 bg-blue-50"
                                      : "hover:bg-gray-50"
                                  )}
                                >
                                  <div className="font-medium">{style.name}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {style.description}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                )}

                {/* Video Output Type (Multi Shot vs Multi Video) - for video tab only */}
                {activeTab === "video" && (
                  <div className="space-y-1">
                    <label className="text-sm text-muted-foreground">
                      {t('mediaStudio.outputType')}
                    </label>
                    <Select
                      value={videoOutputType}
                      onValueChange={(v: "multi-shot" | "multi-video") => setVideoOutputType(v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="multi-shot">{t('mediaStudio.multiShot')}</SelectItem>
                        <SelectItem value="multi-video">{t('mediaStudio.multiVideo')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* VFX and Advanced Options (for image only) */}
              {activeTab === "image" && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                  {/* VFX Selection */}
                  <div className="space-y-1">
                    <label className={cn(
                      "text-sm text-muted-foreground",
                      isFieldDisabledByAdvancedMode("vfx") && "opacity-50"
                    )}>
                      {t('mediaStudio.vfxEffect')}
                      {isFieldDisabledByAdvancedMode("vfx") && (
                        <span className="ml-1 text-xs text-blue-500">(use Advanced)</span>
                      )}
                    </label>
                    <Dialog open={showVfxDialog} onOpenChange={setShowVfxDialog}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn("w-full justify-start", isFieldDisabledByAdvancedMode("vfx") && "opacity-50")}
                          disabled={isFieldDisabledByAdvancedMode("vfx")}
                        >
                          <Layers className="h-4 w-4 mr-2" />
                          {selectedVfxEffect || t('mediaStudio.selectVfx')}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>{t('mediaStudio.chooseVfx')}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 mt-4">
                          {vfxCategories?.map((category: any) => (
                            <div key={category.id} className="space-y-2">
                              <h4 className="font-medium text-sm text-muted-foreground">
                                {category.id}. {category.name}
                              </h4>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {category.effects?.map((effect: any) => (
                                  <button
                                    key={effect.id}
                                    onClick={() => {
                                      setSelectedVfxCategory(category.id);
                                      setSelectedVfxEffect(effect.name);
                                      setShowVfxDialog(false);
                                    }}
                                    className={cn(
                                      "text-left px-3 py-2 rounded-lg border text-sm transition-colors",
                                      selectedVfxEffect === effect.name
                                        ? "border-blue-500 bg-blue-50"
                                        : "hover:bg-gray-50"
                                    )}
                                  >
                                    <div className="font-medium">{effect.name}</div>
                                    <div className="text-xs text-muted-foreground line-clamp-2">
                                      {effect.promptText?.slice(0, 50)}...
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {/* Realistic Skin Toggle */}
                  <div className="space-y-1">
                    <label className={cn(
                      "text-sm text-muted-foreground",
                      isFieldDisabledByAdvancedMode("realisticSkin") && "opacity-50"
                    )}>
                      {t('mediaStudio.realisticSkin')}
                      {isFieldDisabledByAdvancedMode("realisticSkin") && (
                        <span className="ml-1 text-xs text-blue-500">(use Advanced)</span>
                      )}
                    </label>
                    <div className={cn(
                      "flex items-center space-x-2 h-10 px-3 border rounded-md",
                      isFieldDisabledByAdvancedMode("realisticSkin") && "opacity-50"
                    )}>
                      <Switch
                        id="realistic-skin"
                        checked={realisticSkin}
                        onCheckedChange={setRealisticSkin}
                        disabled={isFieldDisabledByAdvancedMode("realisticSkin")}
                      />
                      <Label htmlFor="realistic-skin" className="text-sm">
                        <User className="h-4 w-4 inline mr-1" />
                        {realisticSkin ? t('mediaStudio.on') : t('mediaStudio.off')}
                      </Label>
                    </div>
                  </div>

                  {/* Face Lock Toggle */}
                  <div className="space-y-1">
                    <label className={cn(
                      "text-sm text-muted-foreground",
                      isFieldDisabledByAdvancedMode("faceLock") && "opacity-50"
                    )}>
                      {t('mediaStudio.faceLock')}
                      {isFieldDisabledByAdvancedMode("faceLock") && (
                        <span className="ml-1 text-xs text-blue-500">(use Advanced)</span>
                      )}
                    </label>
                    <div className={cn(
                      "flex items-center space-x-2 h-10 px-3 border rounded-md",
                      isFieldDisabledByAdvancedMode("faceLock") && "opacity-50"
                    )}>
                      <Switch
                        id="face-lock"
                        checked={faceLock}
                        onCheckedChange={setFaceLock}
                        disabled={isFieldDisabledByAdvancedMode("faceLock")}
                      />
                      <Label htmlFor="face-lock" className="text-sm">
                        <ScanFace className="h-4 w-4 inline mr-1" />
                        {faceLock ? t('mediaStudio.on') : t('mediaStudio.off')}
                      </Label>
                    </div>
                  </div>

                  {/* Clear Style/VFX */}
                  {(selectedStyle || selectedVfxEffect) && (
                    <div className="space-y-1">
                      <label className="text-sm text-muted-foreground">{t('mediaStudio.clear')}</label>
                      <Button
                        variant="outline"
                        className="w-full h-10"
                        onClick={() => {
                          setSelectedStyle("");
                          setSelectedStyleCategory("");
                          setSelectedVfxEffect("");
                          setSelectedVfxCategory("");
                        }}
                      >
                        <X className="h-4 w-4 mr-2" />
                        {t('mediaStudio.clearOptions')}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Skill Selector */}
              <div className="pt-4 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-blue-500" />
                    <label className="text-sm font-medium">{t('mediaStudio.autoPromptSkill')}</label>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSkillDialog(true)}
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  >
                    {t('mediaStudio.changeSkill')}
                  </Button>
                </div>

                {/* Current Skill Display */}
                <div
                  className="flex items-center gap-3 p-3 rounded-xl border-2 border-blue-200 bg-blue-50/50 cursor-pointer hover:border-blue-300 transition-colors"
                  onClick={() => setShowSkillDialog(true)}
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shrink-0">
                    <Wand2 className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-blue-900">
                        {currentSkill?.name || t('mediaStudio.noSkillSelected')}
                      </span>
                      {currentSkill && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700">
                          {t('mediaStudio.active')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-blue-600/80 truncate">
                      {currentSkill?.description || t('mediaStudio.chooseSkillForTab', { tab: t(`mediaStudio.tabs.${activeTab}`) })}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                    {activeTab === "audio"
                    ? t('mediaStudio.skillUsedForAudio')
                    : t('mediaStudio.skillsAlignedWithTab', { tab: t(`mediaStudio.tabs.${activeTab}`) })}
                </p>

                <Dialog open={showSkillDialog} onOpenChange={setShowSkillDialog}>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-blue-500" />
                        {t('mediaStudio.selectAutoPromptSkill')}
                      </DialogTitle>
                    </DialogHeader>

                    {!skillsList ? (
                      <div className="flex items-center justify-center py-12">
                        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Search */}
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder={t('mediaStudio.searchSkills')}
                            className="pl-9"
                            onChange={(e) => {
                              const q = e.target.value.toLowerCase();
                              // filter is handled inline below
                              (e.target as any).dataset.query = q;
                              e.target.dispatchEvent(new Event('input', { bubbles: true }));
                            }}
                          />
                        </div>

                        {/* Skill Cards */}
                        {(() => {
                          const filtered = sortMediaStudioSkillsForTab(activeTab, skillsList || []);

                          if (filtered.length === 0) {
                            return (
                              <div className="text-center py-12 text-muted-foreground">
                                <Wand2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                                <p>{t('mediaStudio.noPromptSkills', { tab: t(`mediaStudio.tabs.${activeTab}`) })}</p>
                              </div>
                            );
                          }

                          return (
                            <div className="grid gap-2">
                              {filtered.map((skill) => (
                                <button
                                  key={skill.id}
                                  onClick={() => {
                                    setSelectedSkillId(skill.id);
                                    setShowSkillDialog(false);
                                  }}
                                  className={cn(
                                    "w-full text-left p-4 rounded-xl border-2 transition-all duration-200",
                                    skill.id === selectedSkillId
                                      ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-200"
                                      : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/30"
                                  )}
                                >
                                  <div className="flex items-start gap-3">
                                    <div className={cn(
                                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                                      skill.id === selectedSkillId
                                        ? "bg-gradient-to-br from-blue-500 to-cyan-500 text-white"
                                        : "bg-gray-100 text-gray-600"
                                    )}>
                                      <Wand2 className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold">{skill.name}</span>
                                        {skill.id === selectedSkillId && (
                                          <Badge className="bg-blue-500 text-white text-[10px] px-1.5 py-0">{t('mediaStudio.selected')}</Badge>
                                        )}
                                      </div>
                                      {skill.description && (
                                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{skill.description}</p>
                                      )}
                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mt-2">
                                        {skill.type.replace(/-/g, " ")}
                                      </Badge>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </DialogContent>
                </Dialog>

                {/* Advanced Mode Toggle - shown when skill has schema */}
                {skillSchema && (
                  <div className="flex items-center justify-between pt-3 border-t">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-blue-500" />
                      <label className="text-sm font-medium">{t('mediaStudio.advancedMode')}</label>
                      <Badge variant="outline" className="text-[10px]">
                        {skillSchema.title}
                      </Badge>
                    </div>
                    <Switch
                      checked={useAdvancedMode}
                      onCheckedChange={setUseAdvancedMode}
                    />
                  </div>
                )}
              </div>

              {/* Dynamic Skill Form - shown in advanced mode */}
              {useAdvancedMode && skillSchema && (
                <div className="bg-white/70 backdrop-blur rounded-xl border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-blue-500" />
                      <h3 className="font-semibold">{t('mediaStudio.skillParameters')}</h3>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {skillSchema.title}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {skillSchema.description || t('mediaStudio.configureSkillParameters')}
                  </p>

                  {/* LLM Model Selector for Auto Prompt */}
                  <div className="space-y-1.5 pt-2 border-t">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-blue-500" />
                      {t('mediaStudio.autoPromptModel')}
                      {skillConfig?.defaultModel && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          default: {skillConfig.defaultModel.split('/').pop()}
                        </Badge>
                      )}
                    </label>
                    <Select
                      value={selectedLlmModel || AUTO_MODEL}
                      onValueChange={(value) => {
                        setSelectedLlmModel(value);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('mediaStudio.autoSkillRequirements')}>
                          {selectedLlmModelSelection.displayLabel}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        <SelectGroup>
                          <SelectLabel>{t('mediaStudio.recommended')}</SelectLabel>
                          <SelectItem value={AUTO_MODEL} className="font-medium">
                            <span className="flex items-center gap-2">
                              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                              <span className="flex-1 truncate">{t('mediaStudio.autoSkillRequirements')}</span>
                            </span>
                          </SelectItem>
                          {providerAutoModelOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <span className="flex items-center gap-2">
                                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                                <span className="flex-1 truncate">
                                  {t('mediaStudio.autoByProvider', { provider: option.providerDisplayName })}
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectSeparator />
                        {/* Search input */}
                        <div className="sticky top-0 bg-popover p-2 border-b z-10">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder={t('mediaStudio.searchModels')}
                              value={llmModelSearch}
                              onChange={(e) => setLlmModelSearch(e.target.value)}
                              className="pl-8 h-8"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>
                        {visionModelsByProvider.map(({ providerName, models }) => {
                          const filteredModels = models.filter((model) => {
                            if (!llmModelSearch) return true;
                            const search = llmModelSearch.toLowerCase();
                            return (
                              model.name.toLowerCase().includes(search) ||
                              model.id.toLowerCase().includes(search) ||
                              model.providerDisplayName?.toLowerCase().includes(search)
                            );
                          });

                          if (filteredModels.length === 0) {
                            return null;
                          }

                          return (
                            <SelectGroup key={providerName}>
                              <SelectLabel>{providerName}</SelectLabel>
                              {filteredModels.map((model) => (
                                <SelectItem key={model.id} value={model.id}>
                                  {formatMediaStudioModelLabel(model)}
                                  {model.isDefault && " • default"}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          );
                        })}
                        {providerAutoModelOptions.length === 0 && visionModelsByProvider.every(({ models }) => {
                          if (!llmModelSearch) return models.length === 0;
                          const search = llmModelSearch.toLowerCase();
                          return models.filter((model) => (
                            model.name.toLowerCase().includes(search) ||
                            model.id.toLowerCase().includes(search) ||
                            model.providerDisplayName?.toLowerCase().includes(search)
                          )).length === 0;
                        }) && (
                          <div className="py-4 text-center text-sm text-muted-foreground">
                            {t('mediaStudio.noModelsFound')}
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {t('mediaStudio.autoModelHint')}
                    </p>
                  </div>

                  <DynamicSkillForm
                    schema={skillSchema}
                    language="en"
                    values={dynamicFormValues}
                    onChange={setDynamicFormValues}
                    excludeFields={["aspectRatio", "aspect_ratio"]}
                    onImageUpload={async (files) => {
                      const urls: string[] = [];
                      for (const file of Array.from(files)) {
                        if (!file.type.startsWith("image/")) continue;
                        try {
                          const base64 = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(String(reader.result));
                            reader.onerror = reject;
                            reader.readAsDataURL(file);
                          });
                          const result = await uploadMutation.mutateAsync({
                            fileName: file.name,
                            fileType: file.type,
                            fileBase64: base64,
                          });
                          urls.push(result.url);
                          setReferenceImages(prev => [...prev, { url: result.url, name: file.name }]);
                        } catch (error) {
                          console.error("Upload failed:", error);
                        }
                      }
                      return urls;
                    }}
                    referenceImages={referenceImages}
                    onRemoveImage={removeReferenceImage}
                    isUploading={uploadMutation.isPending}
                    onStyleAction={handleStyleAction}
                  />

                  {/* Auto Prompt Button (inside Skills Parameters) */}
                  <div className="pt-3 border-t">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full gap-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50"
                            onClick={handleAutoPrompt}
                            disabled={(!prompt.trim() && !dynamicFormValues.request && referenceImages.length === 0) || isEnhancing}
                          >
                            {isEnhancing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Wand2 className="h-4 w-4 text-blue-500" />
                            )}
                            <span>{t('mediaStudio.autoPrompt')}</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('mediaStudio.advancedModeHint')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              )}
            </div>

            {/* Generated Media History */}
            {generatedMedia.filter((m) => !expiredUrls.has(m.url)).length > 0 && (
              <div className="bg-white/70 backdrop-blur rounded-xl border p-4 space-y-3 overflow-hidden">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{t('mediaStudio.generatedMedia')}</h3>
                  <Badge variant="outline">
                    {t('mediaStudio.items', { count: generatedMedia.filter((m) => !expiredUrls.has(m.url)).length })}
                  </Badge>
                </div>

                <ScrollArea className="h-[200px] overflow-hidden">
                  <div className="grid grid-cols-4 gap-2 pr-2">
                    {generatedMedia.filter((m) => !expiredUrls.has(m.url)).map((media) => (
                      <div
                        key={media.id}
                        className="relative group cursor-pointer"
                        onClick={() => openPreview(media.url)}
                      >
                        {media.type === "image" ? (
                          <img
                            src={media.url}
                            alt={media.prompt}
                            className="w-full aspect-square object-cover rounded-lg border"
                            onError={() => markExpired(media.url)}
                          />
                        ) : media.type === "video" ? (
                          <div className="w-full aspect-square bg-gray-100 rounded-lg border flex items-center justify-center">
                            <Video className="h-6 w-6 text-gray-400" />
                          </div>
                        ) : (
                          <div className="w-full aspect-square bg-gray-100 rounded-lg border flex items-center justify-center">
                            <Music className="h-6 w-6 text-gray-400" />
                          </div>
                        )}

                        {/* Hover Actions */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-1">
                          {media.type === "image" && referenceImages.length < maxReferenceImages && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-white hover:bg-white/20"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      addAsReference(media);
                                    }}
                                  >
                                    <ImagePlus className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                              <TooltipContent>{t('useAsReference')}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-white hover:bg-white/20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadMedia(media.url, `generated-${media.type}-${media.id}.${media.type === "image" ? "png" : media.type === "video" ? "mp4" : "mp3"}`);
                                  }}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('mediaStudio.download')}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>

          {/* Right Panel - Preview */}
          <div className="space-y-4">
            <div className={cn(
              "isolate overflow-hidden bg-white/70 backdrop-blur rounded-xl border sticky top-24 z-20",
              isPreviewCollapsed ? "p-3" : "p-4",
            )}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-semibold flex items-center gap-2">
                  {t('mediaStudio.preview')}
                  {isGenerating && generationTasks.length > 1 && !isPreviewCollapsed && (
                    <Badge variant="secondary" className="text-xs">
                      {generationTasks.filter(t => t.status === 'completed').length}/{generationTasks.length}
                    </Badge>
                  )}
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={() => setIsPreviewCollapsed((prev) => !prev)}
                  title={isPreviewCollapsed ? t('mediaStudio.expandPreview') : t('mediaStudio.collapsePreview')}
                >
                  {isPreviewCollapsed ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {isPreviewCollapsed ? (
                <p className="text-xs text-muted-foreground">
                  {previewUrl && previewContextTab === activeTab
                    ? t('mediaStudio.previewCollapsed')
                    : t('mediaStudio.previewEmptyForTab')}
                </p>
              ) : (
                <>

              {/* Progressive Grid Preview for multiple images */}
              {generationTasks.length > 1 && (isGenerating || generationTasks.some(t => t.status !== 'queued')) ? (
                <div className={cn(
                  "grid gap-2 mb-4",
                  generationTasks.length === 2 && "grid-cols-2",
                  generationTasks.length === 3 && "grid-cols-3",
                  generationTasks.length === 4 && "grid-cols-2",
                )}>
                  {generationTasks.map((task) => (
                    <div
                      key={task.id}
                      className="relative aspect-square bg-gradient-to-br from-gray-100 to-gray-50 rounded-lg overflow-hidden group"
                    >
                      {task.status === 'queued' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                          <div className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center mb-1">
                            <span className="text-xs font-medium">{task.index + 1}</span>
                          </div>
                          <span className="text-xs">{t('mediaStudio.queued')}</span>
                        </div>
                      )}
                      {task.status === 'generating' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-1" />
                          <span className="text-xs text-muted-foreground">{t('mediaStudio.generatingTask', { index: task.index + 1 })}</span>
                        </div>
                      )}
                      {task.status === 'completed' && task.url && !expiredUrls.has(task.url) && (
                        <>
                          <img
                            src={task.url}
                            alt={`Generated ${task.index + 1}`}
                            className="w-full h-full object-cover cursor-pointer"
                            onError={() => markExpired(task.url!)}
                            onClick={() => {
                              const media = generatedMedia.find((m: any) => m.url === task.url);
                              openLightbox(task.url!, media?.prompt || prompt || "", media?.model || selectedModel, media?.createdAt);
                            }}
                          />
                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-white hover:bg-white/20"
                              onClick={() => {
                                const media = generatedMedia.find((m: any) => m.url === task.url);
                                openLightbox(task.url!, media?.prompt || prompt || "", media?.model || selectedModel, media?.createdAt);
                              }}
                            >
                              <Maximize2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-white hover:bg-white/20"
                              onClick={() => downloadMedia(task.url!, `generated-${task.index + 1}.png`)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                          {/* Success indicator */}
                          <div className="absolute top-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        </>
                      )}
                      {task.status === 'error' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive">
                          <AlertCircle className="h-8 w-8 mb-1" />
                          <span className="text-xs">{t('mediaStudio.error')}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                /* Single Image Preview (original behavior) */
                <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-50 rounded-xl flex items-center justify-center overflow-hidden relative group">
                  {isGenerating ? (
                    <div className="text-center">
                      <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
                      <p className="text-sm text-muted-foreground">{t('mediaStudio.creatingYour', { tab: t(`mediaStudio.tabs.${activeTab}`) })}</p>
                    </div>
                  ) : previewUrl && previewContextTab === activeTab && !expiredUrls.has(previewUrl) ? (
                    activeTab === "image" ? (
                      <>
                        <img
                          src={previewUrl}
                          alt="Preview"
                          className="w-full h-full object-contain cursor-pointer"
                          onError={() => markExpired(previewUrl)}
                          onClick={() => {
                            // Find the matching generated media for prompt info
                            const media = generatedMedia.find((m: any) => m.url === previewUrl);
                            openLightbox(previewUrl, media?.prompt || prompt || "", media?.model || selectedModel, media?.createdAt);
                          }}
                        />
                        {/* Expand button overlay */}
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-12 w-12 text-white hover:bg-white/20"
                            onClick={() => {
                              const media = generatedMedia.find((m: any) => m.url === previewUrl);
                              openLightbox(previewUrl, media?.prompt || prompt || "", media?.model || selectedModel, media?.createdAt);
                            }}
                          >
                            <Maximize2 className="h-6 w-6" />
                          </Button>
                        </div>
                      </>
                    ) : activeTab === "video" ? (
                      <video
                        src={previewUrl}
                        controls
                        className="w-full h-full object-contain"
                        onError={() => markExpired(previewUrl)}
                      />
                    ) : (
                      <audio src={previewUrl} controls className="w-full" />
                    )
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <Sparkles className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{t('mediaStudio.noContent')}</p>
                    </div>
                  )}
                </div>
              )}

              {previewUrl && previewContextTab === activeTab && !isGenerating && (
                <div className="space-y-3 mt-4">
                  {attachTarget && (
                    <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 px-4 py-3 text-sm text-cyan-900">
                      {t('mediaStudio.attachTarget')}{" "}
                      <span className="font-semibold">
                        {attachTarget.kind === "blog" ? t('mediaStudio.blog') : t('mediaStudio.page')}
                      </span>{" "}
                      {attachTarget.id}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 min-w-[160px]"
                    onClick={() => downloadMedia(previewUrl, `generated-${activeTab}.${activeTab === "image" ? "png" : activeTab === "video" ? "mp4" : "mp3"}`)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {t('mediaStudio.download')}
                  </Button>
                  {attachTarget && activeTab !== "audio" && (
                    <Button
                      variant="outline"
                      className="min-w-[220px] border-cyan-200 text-cyan-700 hover:bg-cyan-50"
                      onClick={handleAttachCurrentMediaToContent}
                      disabled={isAttachingContent}
                    >
                      {isAttachingContent ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      {t('mediaStudio.uploadToLibraryAndAttach')}
                    </Button>
                  )}
                  {activeTab === "image" && (
                    <>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              onClick={() => openSplitDialog(previewUrl, "split")}
                            >
                              <Grid2X2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('mediaStudio.splitGrid')}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              onClick={() => openSplitDialog(previewUrl, "crop")}
                            >
                              <Crop className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('mediaStudio.cropByRatio')}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  </div>
                </div>
              )}
                </>
              )}
            </div>

            <Tabs
              value={activeSidebarTab}
              onValueChange={(value) => setActiveSidebarTab(value as StudioSidebarTab)}
              className="relative z-0"
            >
              <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1">
                <TabsTrigger value="history" className="gap-2">
                  <History className="h-4 w-4" />
                  {t('mediaStudio.historyGallery')}
                </TabsTrigger>
                <TabsTrigger value="library" className="gap-2">
                  <Search className="h-4 w-4" />
                  {t('mediaStudio.searchLibrary')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="history" className="mt-4">
                <div className="pr-3">
                    <Tabs value={historyGalleryTab} onValueChange={(value) => setHistoryGalleryTab(value as HistoryGalleryTab)}>
                        <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1">
                          <TabsTrigger value="image" className="gap-2">
                            <Image className="h-4 w-4" />
                            {t('mediaStudio.tabs.image')}
                          </TabsTrigger>
                          <TabsTrigger value="video" className="gap-2">
                            <Video className="h-4 w-4" />
                            {t('mediaStudio.tabs.video')}
                          </TabsTrigger>
                        </TabsList>

                        <div className="mt-4 flex items-center justify-between mb-3">
                          <h3 className="font-semibold flex items-center gap-2">
                            <History className="h-4 w-4" />
                            {t('mediaStudio.historyGallery')}
                          </h3>
                          <Badge variant="outline" className="text-xs">
                            {historyGalleryTab === "image"
                              ? t('mediaStudio.dragToUseAsReference')
                              : t('mediaStudio.clickToPreview')}
                          </Badge>
                        </div>

                        <div className="pr-3">
                          {/* Completed tasks grid */}
                          <div className="grid grid-cols-3 gap-2 mb-4 pb-2">
                            {historyGalleryCompletedTasks.map((task) => {
                              const resultUrl = extractTaskResultUrl(task);
                              if (!resultUrl) return null;
                              const canAddToLibrary = isMediaTaskEligibleForLibraryAdd({
                                id: task.id,
                                status: task.status,
                                resultUrl,
                              });
                              const libraryState = taskLibraryState[task.id];
                              const libraryStatusMeta = getLibraryItemStatusMeta(libraryState?.status);
                              return (
                                <div
                                  key={task.id}
                                  className={cn(
                                    "relative",
                                    task.mediaType === "image" || task.mediaType === "video"
                                      ? "cursor-grab active:cursor-grabbing"
                                      : "cursor-pointer"
                                  )}
                                  draggable={task.mediaType === "image" || task.mediaType === "video"}
                                  onDragStart={
                                    task.mediaType === "image" || task.mediaType === "video"
                                      ? (e) => handleHistoryDragStart(e, resultUrl, task.mediaType)
                                      : undefined
                                  }
                                  onClick={() => openPreview(resultUrl)}
                                >
                                  {canAddToLibrary && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            size="icon"
                                            variant="secondary"
                                            className={cn(
                                              "absolute left-1 top-1 z-[1] h-7 w-7 rounded-full border shadow-sm",
                                              libraryState?.action === "adding" && "border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-100",
                                              libraryState?.action === "added" && "border-emerald-300 bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
                                              libraryState?.action === "error" && "border-red-300 bg-red-100 text-red-700 hover:bg-red-100",
                                              !libraryState?.action && "border-slate-300 bg-white/95 text-slate-700 hover:bg-white",
                                            )}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              void handleAddHistoryTaskToLibrary({
                                                id: task.id,
                                                status: task.status ?? undefined,
                                                resultUrl: resultUrl!,
                                              });
                                            }}
                                            disabled={libraryState?.action === "adding" || libraryState?.action === "added"}
                                          >
                                            {libraryState?.action === "adding" ? (
                                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : libraryState?.action === "added" ? (
                                              <CheckCircle className="h-3.5 w-3.5" />
                                            ) : (
                                              <Library className="h-3.5 w-3.5" />
                                            )}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {libraryState?.action === "adding"
                                            ? t('mediaStudio.addingToLibrary')
                                            : libraryState?.action === "added"
                                              ? t('mediaStudio.addedToLibrary')
                                              : libraryStatusMeta.retryable
                                                ? t('mediaStudio.retryAddToLibrary')
                                                : t('mediaStudio.addToLibrary')}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                  {task.mediaType === "video" ? (
                                    <div className="relative w-full aspect-square rounded-lg border border-blue-200 overflow-hidden hover:border-blue-400 transition-colors bg-black">
                                      <video
                                        src={resultUrl}
                                        className="w-full h-full object-cover"
                                        muted
                                        playsInline
                                        preload="metadata"
                                        onError={() => markExpired(resultUrl)}
                                      />
                                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="rounded-full bg-black/50 p-2">
                                          <Play className="h-4 w-4 text-white" />
                                        </div>
                                      </div>
                                    </div>
                                  ) : task.mediaType === "audio" ? (
                                    <div className="w-full aspect-square rounded-lg border border-orange-200 bg-orange-50 hover:border-orange-400 transition-colors flex items-center justify-center">
                                      <Music className="h-8 w-8 text-orange-500" />
                                    </div>
                                  ) : (
                                    <img
                                      src={resultUrl}
                                      alt={task.prompt?.slice(0, 30)}
                                      className="w-full aspect-square object-cover rounded-lg border hover:border-blue-400 transition-colors"
                                      onError={() => markExpired(resultUrl)}
                                    />
                                  )}
                                  <div className="mt-1 flex items-center justify-center gap-1.5 rounded-md border bg-white/90 px-1 py-1 shadow-sm">
                                    {task.mediaType === "image" && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="h-9 w-9 rounded-lg"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                openLightbox(resultUrl!, task.prompt || "", task.model ?? undefined, task.createdAt ?? undefined);
                                              }}
                                            >
                                              <Maximize2 className="h-5 w-5" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>{t('viewCopyPrompt')}</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                    {task.mediaType === "image" && referenceImages.length < maxReferenceImages && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="h-9 w-9 rounded-lg"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                addHistoryAsReference({ id: task.id, resultUrl });
                                              }}
                                            >
                                              <ImagePlus className="h-5 w-5" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>{t('useAsReference')}</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                    {task.mediaType === "image" && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="h-9 w-9 rounded-lg"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                openSplitDialog(resultUrl);
                                              }}
                                            >
                                              <Grid2X2 className="h-5 w-5" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>{t('mediaStudio.splitGrid')}</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                    {task.mediaType === "image" && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="h-9 w-9 rounded-lg"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                openSplitDialog(resultUrl, "crop");
                                              }}
                                            >
                                              <Crop className="h-5 w-5" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>{t('mediaStudio.cropByRatio')}</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-9 w-9 rounded-lg"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const ext = task.mediaType === "image" ? "png" : task.mediaType === "video" ? "mp4" : "mp3";
                                              downloadMedia(resultUrl, `${task.id}.${ext}`);
                                            }}
                                          >
                                            <Download className="h-5 w-5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{t('mediaStudio.download')}</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Pending/Processing Tasks - Only show failed tasks from current session */}
                          <div className="space-y-2">
                            {historyGalleryPendingTasks.map((task) => (
                              <div
                                key={task.id}
                                className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50"
                              >
                                <div className={cn(
                                  "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                                  task.mediaType === "image" ? "bg-blue-100" :
                                  task.mediaType === "video" ? "bg-blue-100" : "bg-orange-100"
                                )}>
                                  {task.status === "processing" ? (
                                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                                  ) : task.mediaType === "image" ? (
                                    <Image className="h-5 w-5 text-blue-500" />
                                  ) : task.mediaType === "video" ? (
                                    <Video className="h-5 w-5 text-blue-500" />
                                  ) : (
                                    <Music className="h-5 w-5 text-orange-500" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">
                                    {task.prompt?.slice(0, 25)}...
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {task.status === "processing" ? (
                                      <span className="text-blue-500">{t('mediaStudio.processing')}</span>
                                    ) : task.status === "failed" ? (
                                      <span className="text-red-500">{t('mediaStudio.failed')}</span>
                                    ) : (
                                      <span className="text-yellow-500">{t('mediaStudio.pending')}</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>

                          {historyGalleryTasks.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-8">
                              {historyGalleryTab === "image"
                                ? t('mediaStudio.noHistoryImage')
                                : t('mediaStudio.noHistoryVideo')}
                            </p>
                          )}
                        </div>
                      </Tabs>
                    </div>
                  </TabsContent>

              <TabsContent value="library" className="mt-4">
                <LibrarySearchPanel
                  query={librarySearchQuery}
                  onQueryChange={setLibrarySearchQuery}
                  recentDays={libraryRecentDays}
                  onRecentDaysChange={setLibraryRecentDays}
                  isLoading={isLibrarySearchLoading}
                  results={librarySearchResults}
                  totalResults={librarySearchData?.total ?? 0}
                  hasMore={librarySearchData?.has_more ?? false}
                  errorMessage={librarySearchError?.message}
                  selectedItemId={selectedLibraryItemId}
                  itemTypeFilter={libraryItemTypeFilter}
                  onItemTypeFilterChange={setLibraryItemTypeFilter}
                  addToReferenceLabel={t('mediaStudio.useAsReference')}
                  canAddToReferenceItem={(item) => {
                    const itemType = item.item_type.toLowerCase();
                    if (itemType === "video") {
                      return (!selectedModel || selectedMediaModelReferenceSupport.videoUrls) && referenceVideos.length < maxReferenceVideos;
                    }
                    if (itemType === "image") {
                      return (!selectedModel || selectedMediaModelReferenceSupport.imageUrls) && referenceImages.length < maxReferenceImages;
                    }
                    return false;
                  }}
                  onAddToReference={handleLibraryResultAddToReference}
                  onSelect={handleLibraryResultSelect}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      {/* Image Lightbox Dialog */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="!max-w-[95vw] !w-[95vw] max-h-[95vh] p-0 overflow-hidden">
          <DialogTitle className="sr-only">{t('imagePreview')}</DialogTitle>
          <div className="flex flex-col h-full">
            {/* Image - Large preview almost full screen */}
            <div className="flex-1 bg-black/95 flex items-center justify-center p-2 min-h-[60vh]">
              {lightboxImage && !expiredUrls.has(lightboxImage.url) ? (
                <img
                  src={lightboxImage.url}
                  alt="Full size preview"
                  className="max-w-full max-h-[80vh] object-contain cursor-zoom-in"
                  onError={() => {
                    markExpired(lightboxImage.url);
                    setLightboxOpen(false);
                  }}
                  onClick={() => window.open(lightboxImage.url, "_blank", "noopener,noreferrer")}
                  title={t('clickToOpenFullSize')}
                />
              ) : lightboxImage && (
                <div className="text-center text-gray-400">
                  <p className="text-sm">{t('mediaUnavailable')}</p>
                </div>
              )}
            </div>

            {/* Info Panel */}
            <div className="bg-white p-4 space-y-3">
              {/* Model & Date */}
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  <span>{lightboxImage?.model || t('mediaStudio.unknownModel')}</span>
                </div>
                {lightboxImage?.createdAt && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>{new Date(lightboxImage.createdAt).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Prompt */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">{t('promptLabel')}</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => lightboxImage && copyPrompt(lightboxImage.prompt)}
                    className="h-8 gap-1"
                  >
                    {copiedPrompt ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-green-600">{t('mediaStudio.copiedShort')}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span>{t('common.copy')}</span>
                      </>
                    )}
                  </Button>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-sm max-h-[120px] overflow-y-auto">
                  {lightboxImage?.prompt || t('mediaStudio.noPromptAvailable')}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={usePromptFromLightbox}
                >
                  <Wand2 className="h-4 w-4 mr-2" />
                  {t('mediaStudio.useThisPrompt')}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => lightboxImage && downloadMedia(lightboxImage.url, `generated-image-${Date.now()}.png`)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {t('mediaStudio.download')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => lightboxImage && window.open(lightboxImage.url, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Tools Dialog (Split + Crop) */}
      <Dialog open={showSplitDialog} onOpenChange={setShowSplitDialog}>
        <DialogContent className="!max-w-[96vw] !w-[96vw] max-h-[94vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              {t('mediaStudio.imageSplitCropTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6">
            {/* Left: Preview */}
            <div className="min-w-0 space-y-3">
              <label className="text-base font-semibold">{t('mediaStudio.preview')}</label>
              <div
                ref={cropPreviewContainerRef}
                className="w-full h-[60vh] min-h-[460px] max-h-[720px] bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center relative"
                onWheel={handleCropPreviewWheel}
              >
                {imageEditorMode === "split" ? (
                  isDetectingGrid ? (
                    <div className="text-center">
                      <Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto mb-2" />
                      <p className="text-base text-muted-foreground">{t('mediaStudio.detectingGrid')}</p>
                    </div>
                  ) : splitPreviewUrl ? (
                    <img src={splitPreviewUrl} alt="Split preview" className="max-w-full max-h-full object-contain" />
                  ) : splitImageUrl ? (
                    <img src={splitImageUrl} alt="Original" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <p className="text-base text-muted-foreground">{t('mediaStudio.noImageSelected')}</p>
                  )
                ) : splitImageUrl ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <img
                      ref={cropPreviewImageRef}
                      src={splitImageUrl}
                      alt="Crop source"
                      className="max-w-full max-h-full object-contain select-none"
                      onLoad={() => updateCropDisplayRectFromDom()}
                      draggable={false}
                    />

                    {cropSelectionRect && (
                      <div className="absolute inset-0 pointer-events-none">
                        <div
                          className="absolute border-2 border-white rounded-md pointer-events-auto cursor-move"
                          style={{
                            left: `${cropSelectionRect.left}px`,
                            top: `${cropSelectionRect.top}px`,
                            width: `${cropSelectionRect.width}px`,
                            height: `${cropSelectionRect.height}px`,
                            boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                          }}
                          onMouseDown={handleCropSelectionMouseDown}
                        >
                          <div className="absolute top-2 left-2 bg-black/65 text-white text-sm font-semibold px-2 py-1 rounded">
                            {cropAspectRatio} • {Math.round(cropScale * 100)}% • {t('mediaStudio.dragToMove')}
                          </div>
                        </div>
                      </div>
                    )}

                    {isCropping && (
                      <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                        <div className="bg-black/70 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-base">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          {t('mediaStudio.cropping')}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-base text-muted-foreground">{t('mediaStudio.noImageSelected')}</p>
                )}
              </div>

              {imageEditorMode === "split" && detectedGrid && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-base">
                  <div className="flex items-center gap-2 text-green-700">
                    <Check className="h-4 w-4" />
                      <span>
                      {t('mediaStudio.autoDetected', {
                        rows: detectedGrid.rows,
                        cols: detectedGrid.cols,
                        cellWidth: detectedGrid.cellWidth,
                        cellHeight: detectedGrid.cellHeight,
                      })}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Controls */}
            <div className="w-full xl:max-w-[560px] space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={imageEditorMode === "split" ? "default" : "outline"}
                  onClick={() => setImageEditorMode("split")}
                  className="gap-2"
                >
                  <Scissors className="h-4 w-4" />
                  {t('mediaStudio.splitGrid')}
                </Button>
                <Button
                  variant={imageEditorMode === "crop" ? "default" : "outline"}
                  onClick={() => {
                    setImageEditorMode("crop");
                    if (splitImageUrl) {
                      void updateCropPreview(cropAspectRatio);
                    }
                  }}
                  className="gap-2"
                >
                  <Crop className="h-4 w-4" />
                  {t('mediaStudio.cropRatio')}
                </Button>
              </div>

              {imageEditorMode === "split" && (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                    <p className="font-medium text-blue-800 mb-2">{t('mediaStudio.recommendedGridSizes')}</p>
                    <div className="grid grid-cols-4 gap-2 text-blue-700 text-xs">
                      <div>
                        <p className="font-medium">16:9</p>
                        <p>2x4, 2x5</p>
                      </div>
                      <div>
                        <p className="font-medium">9:16</p>
                        <p>4x2, 5x2</p>
                      </div>
                      <div>
                        <p className="font-medium">1:1</p>
                        <p>2x2, 3x3</p>
                      </div>
                      <div>
                        <p className="font-medium">4:3</p>
                        <p>2x3, 3x4</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">{t('mediaStudio.gridSize')}</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {COMMON_GRIDS.map((grid) => (
                        <Button
                          key={`${grid.rows}x${grid.cols}`}
                          variant={splitGridRows === grid.rows && splitGridCols === grid.cols ? "default" : "outline"}
                          size="sm"
                          className="text-[11px] h-8 px-2"
                          onClick={() => updateSplitPreview(grid.rows, grid.cols)}
                        >
                          {grid.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-20">
                      <label className="text-xs text-muted-foreground mb-1 block">{t('mediaStudio.rows')}</label>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={splitGridRows}
                        onChange={(e) => {
                          const rows = Math.min(10, Math.max(1, parseInt(e.target.value) || 1));
                          updateSplitPreview(rows, splitGridCols);
                        }}
                        className="h-9"
                      />
                    </div>
                    <span className="text-muted-foreground pt-5">x</span>
                    <div className="w-20">
                      <label className="text-xs text-muted-foreground mb-1 block">{t('mediaStudio.cols')}</label>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={splitGridCols}
                        onChange={(e) => {
                          const cols = Math.min(10, Math.max(1, parseInt(e.target.value) || 1));
                          updateSplitPreview(splitGridRows, cols);
                        }}
                        className="h-9"
                      />
                    </div>
                    <div className="flex-1 pt-5">
                      <Button className="w-full" onClick={executeSplit} disabled={isSplitting || !splitImageUrl}>
                        {isSplitting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {t('mediaStudio.splitting')}
                          </>
                        ) : (
                          <>
                            <Scissors className="h-4 w-4 mr-2" />
                            {t('mediaStudio.splitCount', { count: splitGridRows * splitGridCols })}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {splitResults.length > 0 && (
                    <div className="space-y-3 border-t pt-4">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">{t('mediaStudio.resultsCount', { count: splitResults.length })}</label>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={addAllSplitsToVideoReference}>
                            <Video className="h-4 w-4 mr-1" />
                            {t('mediaStudio.addToVideoReference')}
                          </Button>
                          <Button variant="outline" size="sm" onClick={handleDownloadAllSplits}>
                            <Download className="h-4 w-4 mr-1" />
                            {t('mediaStudio.downloadAll')}
                          </Button>
                        </div>
                      </div>
                      <ScrollArea className="h-[180px]">
                        <div className="grid grid-cols-5 gap-2 pr-2">
                          {splitResults.map((result) => (
                            <div
                              key={result.index}
                              className="relative group aspect-square rounded-lg overflow-hidden border hover:border-blue-400 transition-colors"
                            >
                              <img src={result.dataUrl} alt={`Split ${result.index + 1}`} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-white hover:bg-white/20"
                                        onClick={() => handleDownloadSplit(result)}
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t('mediaStudio.download')}</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                {referenceImages.length < maxReferenceImages && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-7 w-7 text-white hover:bg-white/20"
                                          onClick={() => addSplitAsReference(result)}
                                        >
                                          <ImagePlus className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>{t('mediaStudio.useAsReference')}</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                              <div className="absolute bottom-0 right-0 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded-tl">
                                {result.index + 1}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </>
              )}

              {imageEditorMode === "crop" && (
                <>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-base">
                    <p className="font-semibold text-emerald-800">{t('mediaStudio.cropByPopularRatios')}</p>
                    <p className="text-emerald-700 text-sm mt-1">{t('mediaStudio.cropDragHint')}</p>
                    <p className="text-emerald-700 text-sm">{t('mediaStudio.cropHintRatios')}</p>
                  </div>

                  <div>
                    <label className="text-base font-semibold mb-2 block">{t('mediaStudio.aspectRatio')}</label>
                    <div className="grid grid-cols-4 gap-2">
                      {COMMON_CROP_RATIOS.map((ratio) => (
                        <Button
                          key={ratio.value}
                          variant={cropAspectRatio === ratio.value ? "default" : "outline"}
                          size="sm"
                          className="h-9 text-sm font-semibold"
                          onClick={() => {
                            void updateCropPreview(ratio.value);
                          }}
                        >
                          {ratio.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border p-3">
                    <div>
                      <div className="flex items-center justify-between text-sm font-medium mb-1">
                        <span>{t('mediaStudio.cropSize')}</span>
                        <span>{Math.round(cropScale * 100)}%</span>
                      </div>
                      <Input
                        type="range"
                        min={20}
                        max={100}
                        value={Math.round(cropScale * 100)}
                        onChange={(e) => {
                          const scale = Number(e.target.value) / 100;
                          setCropScale(scale);
                          setCropResult(null);
                        }}
                        className="h-9"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('mediaStudio.smallerValueHint')}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm font-medium mb-1">
                        <span>{t('mediaStudio.horizontal')}</span>
                        <span>{Math.round(cropFocus.x * 100)}%</span>
                      </div>
                      <Input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(cropFocus.x * 100)}
                        onChange={(e) => {
                          const x = Number(e.target.value) / 100;
                          setCropFocus((prev) => ({ ...prev, x }));
                          setCropResult(null);
                        }}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm font-medium mb-1">
                        <span>{t('mediaStudio.vertical')}</span>
                        <span>{Math.round(cropFocus.y * 100)}%</span>
                      </div>
                      <Input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(cropFocus.y * 100)}
                        onChange={(e) => {
                          const y = Number(e.target.value) / 100;
                          setCropFocus((prev) => ({ ...prev, y }));
                          setCropResult(null);
                        }}
                        className="h-9"
                      />
                    </div>
                  </div>

                  <Button className="w-full" onClick={executeCrop} disabled={isCropping || !splitImageUrl}>
                    {isCropping ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t('mediaStudio.cropping')}
                      </>
                    ) : (
                      <>
                        <Crop className="h-4 w-4 mr-2" />
                        {t('mediaStudio.cropWithRatio', { ratio: cropAspectRatio })}
                      </>
                    )}
                  </Button>

                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleDownloadCrop}
                      disabled={!cropResult}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {t('mediaStudio.downloadCropped')}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {cropResult
                        ? t('mediaStudio.savedToDownloads')
                        : t('mediaStudio.clickCropFirst')}
                    </p>
                  </div>

                  {cropResult && (
                    <div className="space-y-3 border-t pt-4">
                      <div className="text-base">
                        <p className="font-semibold">{t('mediaStudio.cropResult')}</p>
                        <p className="text-muted-foreground text-sm">
                          {cropResult.width}x{cropResult.height} ({cropResult.ratio})
                        </p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-2">
                        <img
                          src={cropResult.dataUrl}
                          alt="Cropped result preview"
                          className="w-full max-h-[240px] object-contain rounded"
                        />
                      </div>
                      <div className="flex gap-2">
                        {referenceImages.length < maxReferenceImages && (
                          <Button variant="outline" size="sm" onClick={addCropAsReference}>
                            <ImagePlus className="h-4 w-4 mr-1" />
                            {t('mediaStudio.useAsReference')}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
      </DialogContent>
      </Dialog>

      {storyboardReviewOpen && (
      <StoryboardBatchReviewDialog
        open={storyboardReviewOpen}
        tasks={storyboardReviewTasks}
        selectedTaskIds={Array.from(selectedStoryboardTaskIds)}
        onOpenChange={setStoryboardReviewOpen}
        onToggleTask={toggleStoryboardTaskSelection}
        onSelectAll={selectAllStoryboardTasks}
        onSelectNone={selectNoStoryboardTasks}
        onRegenerateTask={regenerateStoryboardClip}
        onAutoCompound={autoCompoundStoryboardClips}
        onCreateProject={createStoryboardEditProject}
        isCompounding={isCompoundingStoryboard}
        isCreatingProject={isCreatingStoryboardProject}
        regeneratingTaskId={regeneratingStoryboardTaskId}
        compoundStatus={storyboardCompoundStatus}
        projectLink={storyboardProjectLink}
      />
      )}

      {storyboardRenderJobId && (
        <RenderProgressDialog
          jobId={storyboardRenderJobId}
          onComplete={handleStoryboardRenderComplete}
          onCancel={handleStoryboardRenderCancel}
        />
      )}

      {isGenerationQueueHidden && visibleGenerationQueueTasks.length > 0 && (
        <Button
          type="button"
          variant="outline"
          onClick={showGenerationQueue}
          className="fixed bottom-3 right-3 z-[60] rounded-full border-sky-200 bg-white/95 px-4 py-2 text-sky-700 shadow-xl backdrop-blur hover:bg-sky-50 sm:right-4 dark:border-sky-900 dark:bg-slate-950/95 dark:text-sky-300 dark:hover:bg-sky-950/60"
        >
          {t('mediaStudio.generationQueue.showQueue')}
          <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-950/70 dark:text-sky-200">
            {t('mediaStudio.items', { count: visibleGenerationQueueTasks.length })}
          </span>
        </Button>
      )}

      {!isGenerationQueueHidden && visibleGenerationQueueTasks.length > 0 && (
        <GenerationProgress
          tasks={visibleGenerationQueueTasks}
          title={t('mediaStudio.generationQueueTitle')}
          subtitle={t('mediaStudio.generationQueueSubtitle')}
          maxVisible={6}
          expanded={!isGenerationQueueCollapsed}
          onExpandedChange={(expanded) => setIsGenerationQueueCollapsed(!expanded)}
          onTaskClick={handleGenerationQueueTaskClick}
          onTaskRetry={retryGenerationTask}
          onTaskRemove={dismissGenerationQueueTask}
          onClearCompleted={clearCompletedGenerationTasks}
          onClose={closeGenerationQueue}
          focusTaskId={focusedGenerationTaskId}
          className="left-3 right-3 bottom-3 sm:left-auto sm:right-4 sm:w-[24rem]"
        />
      )}
    </div>
  );
}
