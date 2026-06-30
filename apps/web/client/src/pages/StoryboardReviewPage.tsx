import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MutableRefObject } from "react";
import { useLocation, useRoute, useSearch } from "wouter";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Clipboard, Crop, Download, ExternalLink, Film, Grid3X3, History, ImagePlus, Layers, Loader2, Maximize2, Mic, Music2, Pencil, Play, RefreshCw, Scissors, Search, Square, Trash2, Video, X } from "lucide-react";
import { sanitizeProjectName } from "@smartspec/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResizableCollapsiblePanel } from "@/components/ui/resizable-collapsible-panel";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LocaleToggle } from "@/components/LocaleToggle";
import { StoryboardBatchReviewPanel, type StoryboardPromptPlannerOptions, type StoryboardSourceTrimRange } from "@/components/media/StoryboardBatchReviewDialog";
import { RenderProgressDialog } from "@/components/videoeditor/RenderProgressDialog";
import LibrarySearchPanel from "@/components/media/LibrarySearchPanel";
import { HyperframesStoryboardReviewPanel } from "@/components/marketplaceCapture/HyperframesStoryboardReviewPanel";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { useTenantFeatureFlags } from "@/hooks/useTenantFeatureFlag";
import { trpc } from "@/lib/trpc";
import { buildMediaStudioCommonPayload } from "@/lib/mediaStudioPayload";
import {
  getStoryboardHistoryProductFilter,
  storyboardHistoryTaskMatchesProduct,
} from "@/lib/storyboardHistoryGalleryFilter";
import { resolveMediaModelTransportConfig } from "@shared/mediaModelTransport";
import {
  buildHyperframesRenderLibrarySession,
  getHyperframesRenderLibraryReadyOutput,
  removeMediaStudioRenderLibrarySession,
  upsertMediaStudioRenderLibrarySession,
} from "@/lib/mediaStudioRenderLibrarySessions";
import { resolveHyperframesRenderRefetchInterval } from "@/lib/marketplaceHyperframesUiState";
import {
  COMMON_CROP_RATIOS,
  COMMON_GRIDS,
  createCropPreview,
  createSplitPreview,
  cropImageToAspect,
  DEFAULT_SPLIT_GRID,
  detectGrid,
  downloadAllSplitImages,
  downloadCroppedImage,
  downloadSplitImage,
  loadImage,
  splitImage,
  type CropResult,
  type DetectedGrid,
  type SplitResult,
} from "@/lib/imageGridSplitter";
import {
  buildStoryboardVideoProject,
  getStoryboardRenderResolution,
  inferStoryboardRenderAspectRatio,
  normalizeStoryboardClipTransition,
  type StoryboardClipMediaType,
  type StoryboardClipCandidate,
  type StoryboardClipTransition,
  type StoryboardCompanionAudioCandidate,
  type StoryboardRenderAspectRatioMode,
} from "@/lib/storyboardVideoProject";
import {
  buildRenderTraceabilityMetadata,
  resolveStoryboardDraftMarketplaceProduct,
  resolveStoryboardDraftProductionContext,
} from "@/lib/mediaRenderTraceability";
import { extractStoryboardMediaUrl, normalizeStoryboardMediaUrl } from "@/lib/storyboardReviewMedia";
import type { LibrarySearchResultItem } from "@/lib/libraryUi";
import { WebAssetResolver } from "@/services/webAssetResolver";
import {
  buildHyperframesLibraryIdempotencyKey,
  type HyperframesRenderStatusProjection,
} from "@shared/hyperframes/contracts";
import type { HyperframesFinalCompositeConfig } from "@shared/hyperframes/runtimeApiSchemas";
import {
  buildHyperframesReadableSubtitleTextFromTranscriptCues,
  buildHyperframesSubtitleCuesFromEditableText,
  getHyperframesSubtitlePreviewText,
} from "@shared/hyperframes/subtitleCues";
import {
  buildPreviewMatchCompositionPayloadFromHyperframesPreview,
  computePreviewMatchCompositionHash,
  computePreviewMatchTimelineHash,
  MANUAL_STORYBOARD_MOCKUP_PRODUCT_ID,
  normalizeManualStoryboardProductId,
  withPreviewMatchCompositionHashes,
  type StoryboardPreviewMatchCaptureQuality,
} from "@shared/storyboardPreviewMatchCapture";
import {
  HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC,
  HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC,
  HYPERFRAMES_FINAL_RENDER_PROMPT_MAX_CHARS,
} from "@shared/hyperframes/limits";
import {
  hyperframesAudioRoles,
  hyperframesAudioVisualTriggers,
  hyperframesThaiFontFamilies,
  listHyperframesCreativePresets,
  type HyperframesAudioEvent,
  type HyperframesCreativePreset,
} from "@shared/hyperframes/creativePresets";
import {
  DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS,
  applyStoryboardReviewVideoOptionsToDraft,
  applyRegeneratedVideoSegmentPromptToDraft,
  clearStoryboardReviewDraft,
  deriveManualHyperframesIdentityFromStoryboardTasks,
  evaluateStoryboardVideoSegmentPromptGenerationGate,
  getStoryboardCompanionAudioUpdatedAt,
  getStoryboardReviewAutoReviewRunIdFromDraft,
  getStoryboardReviewName,
  getStoryboardReviewProductIdFromDraft,
  getStoryboardTaskEffectiveGenerationContext,
  mergeFresherStoryboardReviewTasks,
  normalizeStoryboardReviewDraft,
  normalizeStoryboardReviewVideoModelId,
  readStoryboardReviewDraft,
  replaceStoryboardVideoSlot,
  replaceStoryboardReferenceFrame,
  splitStoryboardVideoSegmentTaskToPerShotFallback,
  storyboardDraftToReviewTasks,
  writeStoryboardReviewDraft,
  type StoryboardGenerationTask,
  type StoryboardProductionContext,
  type StoryboardReferenceFrameRole,
  type StoryboardReviewDraft,
} from "@/lib/storyboardReviewWorkspace";
import { cn } from "@/lib/utils";
import { videoEditorRenderService } from "@/services/videoEditorService";
import type { VideoSegment, VideoSegmentStructureMode } from "@shared/videoSegmentPlanner";
import {
  extractStoryboardNativeSpeechText,
} from "@shared/storyboardPromptAudio";
import {
  buildArticleStoryboardRenderTrackPlan,
  getArticleStoryboardReviewMetadata,
  updateArticleStoryboardCurrentPromptMetadata,
} from "@shared/articleStoryboardVideo";

const VEO_REFERENCE_IMAGE_ROLE_INSTRUCTION = [
  "Reference image mode: use the attached image(s) only as material, identity, style, product, object, or scene references.",
  "Do not treat any attached image as a start frame, end frame, frozen opening frame, or exact first/last frame unless generationType is FIRST_AND_LAST_FRAMES_2_VIDEO.",
].join(" ");

function applyStoryboardPromptDuration(prompt: string, durationSeconds: number): string {
  void durationSeconds;
  return prompt
    .replace(/Create an? \d+(?:\.\d+)?-second cinematic video\./i, "Create a cinematic video.")
    .replace(/\bFor\s+Veo\s+3\.1,\s*/gi, "")
    .replace(/\bVeo\s+3\.1 can finish a slightly longer line\.\s*/gi, "")
    .replace(
      /Dialogue pacing:\s*write enough spoken content for about [^.;\n]+?(?:;|\.)(?:\s*Veo 3\.1 can finish a slightly longer line\.)?(?:\s*Avoid a short 5-6 second line or silent tail\.)?/i,
      "Dialogue pacing: write enough spoken content for the selected clip duration and avoid a short line or silent tail."
    );
}

function normalizeReferenceFrameRole(value: unknown, fallback: StoryboardReferenceFrameRole): StoryboardReferenceFrameRole {
  return value === "start" || value === "stop" || value === "reference" ? value : fallback;
}

function getTaskReferenceFrameRoles(task: StoryboardGenerationTask): StoryboardReferenceFrameRole[] {
  const roles = Array.isArray(task.storyboardContext?.extraParams?.referenceFrameRoles)
    ? task.storyboardContext?.extraParams?.referenceFrameRoles
    : [];
  const referenceImageCount = Array.isArray(task.storyboardContext?.referenceImages)
    ? task.storyboardContext.referenceImages.filter((image) => String(image?.url ?? "").trim()).length
    : 0;
  if (roles.length > 0) {
    const roleCount = referenceImageCount > 0 ? referenceImageCount : roles.length;
    return Array.from({ length: roleCount }, (_item, index) =>
      normalizeReferenceFrameRole(roles?.[index], index === 0 ? "start" : "stop"),
    );
  }
  if (referenceImageCount <= 0) return [];
  return referenceImageCount === 1 ? ["reference"] : ["start", "stop"];
}

function getArticleStoryboardDraftAudioStrategy(reviewTasks: ReturnType<typeof storyboardDraftToReviewTasks>) {
  for (const task of reviewTasks) {
    const metadata = getArticleStoryboardReviewMetadata(task.generationExtraParams);
    if (metadata) return metadata.audioStrategy;
  }
  return null;
}

function frameRolesUseExactFirstLast(roles: StoryboardReferenceFrameRole[]): boolean {
  return roles.length >= 2 && roles[0] === "start" && roles[1] === "stop";
}

function generationTypeForFrameRoles(roles: StoryboardReferenceFrameRole[]): string {
  return frameRolesUseExactFirstLast(roles) ? "FIRST_AND_LAST_FRAMES_2_VIDEO" : "REFERENCE_2_VIDEO";
}

function storyboardReferenceFrameRoleLabel(role: StoryboardReferenceFrameRole, locale: string, short = false): string {
  if (role === "reference") return locale === "th" ? (short ? "Ref" : "ภาพ Reference") : (short ? "Ref" : "Reference image");
  if (role === "stop") return locale === "th" ? (short ? "Stop" : "Stop Frame") : (short ? "Stop" : "Stop frame");
  return locale === "th" ? (short ? "Start" : "Start Frame") : (short ? "Start" : "Start frame");
}

type StoryboardMediaPickerKind = "video" | "audio";
type StoryboardRightPanelTab = StoryboardMediaPickerKind | "history_gallery";
type StoryboardAudioSourceTab = "library" | "history";
type StoryboardImageEditorMode = "split" | "crop";
type StoryboardReviewDeleteTarget = {
  id: number | null;
  name: string;
};

type StoryboardReviewSplitFallbackTarget = {
  taskId: string;
  segmentId: string;
  shotCount: number;
  error?: string | null;
};
type StoryboardVideoPreview = {
  url: string;
  title: string;
  subtitle?: string | null;
  overlayPreview?: {
    posterUrl?: string | null;
    overlayPreset?: string;
    textMotionPreset?: string;
    subtitlePreset?: string;
    subtitleFontSizePx?: number;
    layerLabel?: string;
    titleText?: string;
    hookText?: string;
    priceText?: string;
    chips?: string[];
    subtitleText?: string;
    presetKind?: string;
  };
};

type StoryboardReviewVideoOptionValues = {
  videoModel: string;
  videoStructureMode: VideoSegmentStructureMode;
  manualVideoGroupSize: number;
  plannerOptions: StoryboardPromptPlannerOptions;
};

function normalizeStoryboardPromptPlannerSpeechLanguage(value: unknown): string {
  return String(value ?? "").trim();
}

function areStoryboardPromptPlannerOptionsEqual(
  a: StoryboardPromptPlannerOptions,
  b: StoryboardPromptPlannerOptions,
): boolean {
  return Boolean(a.includeVoiceover) === Boolean(b.includeVoiceover) &&
    a.speechMode === b.speechMode &&
    normalizeStoryboardPromptPlannerSpeechLanguage(a.speechLanguage) ===
      normalizeStoryboardPromptPlannerSpeechLanguage(b.speechLanguage) &&
    Boolean(a.includeSound) === Boolean(b.includeSound) &&
    a.tone === b.tone &&
    a.language === b.language;
}

const STORYBOARD_REVIEW_RIGHT_PANEL_WIDTH_KEY = "smartspec_storyboard_review_right_panel_width_v1";
const STORYBOARD_REVIEW_RIGHT_PANEL_COLLAPSED_KEY = "smartspec_storyboard_review_right_panel_collapsed_v1";
const STORYBOARD_REVIEW_RIGHT_PANEL_DEFAULT_WIDTH = 360;
const STORYBOARD_REVIEW_RIGHT_PANEL_MIN_WIDTH = 300;
const STORYBOARD_REVIEW_RIGHT_PANEL_MAX_WIDTH = 920;
const STORYBOARD_REVIEW_PROMPT_PLANNER_CONTEXT_MAX_CHARS = 6000;
const STORYBOARD_REVIEW_VOICEOVER_CONTINUITY_CONTEXT_MAX_CHARS = 1200;
const STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS = 2000;
const HYPERFRAMES_FINAL_COMPOSITE_MAX_SHOTS = 12;
const STORYBOARD_REVIEW_VIDEO_MODEL_OPTIONS = [
  {
    value: "veo3/generate-veo-3-video-lite",
    label: "Veo 3.1 Lite (API • kie.ai)",
  },
] as const;

type StoryboardReviewVideoModelOption = {
  value: string;
  label: string;
  provider: string;
  transport: "gateway_api" | "mcp";
  providerKey: string | null;
  providerModelId?: string | null;
  toolName?: string | null;
  argumentShape?: string | null;
};

function optionalStoryboardRouteString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function StoryboardReviewToggleSwitch({
  checked,
  disabled,
  onCheckedChange,
  ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs outline-none transition-all focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-sky-600" : "bg-slate-300",
      )}
    >
      <span
        className={cn(
          "block size-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[calc(100%-2px)]" : "translate-x-0",
        )}
      />
    </button>
  );
}

function readStoredStoryboardReviewPanelWidth(): number {
  if (typeof window === "undefined") return STORYBOARD_REVIEW_RIGHT_PANEL_DEFAULT_WIDTH;
  const value = Number(window.localStorage.getItem(STORYBOARD_REVIEW_RIGHT_PANEL_WIDTH_KEY));
  if (!Number.isFinite(value)) return STORYBOARD_REVIEW_RIGHT_PANEL_DEFAULT_WIDTH;
  return Math.min(
    STORYBOARD_REVIEW_RIGHT_PANEL_MAX_WIDTH,
    Math.max(STORYBOARD_REVIEW_RIGHT_PANEL_MIN_WIDTH, Math.round(value)),
  );
}

function readStoredStoryboardReviewPanelCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORYBOARD_REVIEW_RIGHT_PANEL_COLLAPSED_KEY) === "true";
}

function normalizeStoryboardReviewVideoStructureMode(
  value: unknown,
): VideoSegmentStructureMode {
  return value === "adaptive_multi_shot" ||
    value === "compact_multi_shot" ||
    value === "manual_group_size"
    ? value
    : "per_shot";
}

function normalizeStoryboardReviewPlannerSpeechMode(
  value: unknown,
  fallback: StoryboardPromptPlannerOptions["speechMode"],
): StoryboardPromptPlannerOptions["speechMode"] {
  return value === "en" || value === "th" || value === "other" || value === "none"
    ? value
    : fallback;
}

function normalizeStoryboardReviewPlannerTone(
  value: unknown,
): StoryboardPromptPlannerOptions["tone"] {
  return value === "premium" ||
    value === "demo" ||
    value === "ugc" ||
    value === "cinematic"
    ? value
    : "sales";
}

function normalizeStoryboardReviewPlannerLanguage(
  value: unknown,
  locale: string,
): StoryboardPromptPlannerOptions["language"] {
  if (value === "th" || value === "en" || value === "auto") return value;
  return locale === "th" ? "th" : "auto";
}

function getFirstStoryboardVideoTask(
  draft?: StoryboardReviewDraft | null,
): StoryboardGenerationTask | null {
  if (!draft) return null;
  const taskById = new Map(draft.tasks.map((task) => [task.id, task]));
  return draft.taskIds
    .map((taskId) => taskById.get(taskId))
    .find((task): task is StoryboardGenerationTask => Boolean(task) && task?.type !== "image") ?? null;
}

function getStoryboardReviewVideoOptionValues(
  draft: StoryboardReviewDraft | null | undefined,
  locale: string,
): StoryboardReviewVideoOptionValues {
  const firstTask = getFirstStoryboardVideoTask(draft);
  const plan = draft?.videoSegmentState?.videoSegmentPlan;
  const planner =
    firstTask?.storyboardContext?.extraParams?.storyboardPromptPlanner &&
    typeof firstTask.storyboardContext.extraParams.storyboardPromptPlanner === "object" &&
    !Array.isArray(firstTask.storyboardContext.extraParams.storyboardPromptPlanner)
      ? firstTask.storyboardContext.extraParams.storyboardPromptPlanner as Record<string, unknown>
      : {};
  const planWantsNativeSpeech = plan?.audioStrategy === "native_video_audio";
  const promptHasSpeech = Boolean(
    draft?.tasks.some((task) => task.type !== "image" && extractStoryboardNativeSpeechText(task.prompt)),
  );
  const includeVoiceover = typeof planner.includeVoiceover === "boolean"
    ? planner.includeVoiceover
    : normalizeStoryboardReviewPlannerSpeechMode(planner.speechMode, "none") !== "none" ||
      planWantsNativeSpeech ||
      promptHasSpeech;
  const defaultSpeechMode: StoryboardPromptPlannerOptions["speechMode"] = includeVoiceover
    ? locale === "th" ? "th" : "en"
    : "none";
  const speechMode = includeVoiceover
    ? normalizeStoryboardReviewPlannerSpeechMode(planner.speechMode, defaultSpeechMode)
    : "none";
  const speechLanguage = includeVoiceover
    ? String(
        planner.speechLanguage ??
          (speechMode === "th" ? "Thai" : speechMode === "en" ? "English" : ""),
      ).trim()
    : "";

  return {
    videoModel:
      normalizeStoryboardReviewVideoModelId(plan?.videoModelId) ||
      normalizeStoryboardReviewVideoModelId(firstTask?.storyboardContext?.model) ||
      normalizeStoryboardReviewVideoModelId(firstTask?.model) ||
      STORYBOARD_REVIEW_VIDEO_MODEL_OPTIONS[0].value,
    videoStructureMode: normalizeStoryboardReviewVideoStructureMode(plan?.mode),
    manualVideoGroupSize:
      typeof plan?.manualGroupSize === "number" && Number.isFinite(plan.manualGroupSize)
        ? plan.manualGroupSize
        : 3,
    plannerOptions: {
      includeVoiceover,
      speechMode,
      speechLanguage,
      includeSound: Boolean(planner.includeSound),
      tone: normalizeStoryboardReviewPlannerTone(planner.tone),
      language: normalizeStoryboardReviewPlannerLanguage(planner.language, locale),
    },
  };
}

function buildStoryboardReviewCurrentVideoModelOption(input: {
  draft: StoryboardReviewDraft | null | undefined;
  model: any;
  modelId: string;
}): StoryboardReviewVideoModelOption | null {
  const modelId = input.modelId.trim();
  const normalizedModelId = normalizeStoryboardReviewVideoModelId(modelId);
  if (!normalizedModelId) return null;
  const firstTask = getFirstStoryboardVideoTask(input.draft);
  const plan = input.draft?.videoSegmentState?.videoSegmentPlan;
  const firstTaskParams =
    firstTask?.storyboardContext?.extraParams &&
    typeof firstTask.storyboardContext.extraParams === "object" &&
    !Array.isArray(firstTask.storyboardContext.extraParams)
      ? firstTask.storyboardContext.extraParams as Record<string, unknown>
      : {};
  const firstTaskTransportMetadata =
    firstTaskParams.transportMetadata &&
    typeof firstTaskParams.transportMetadata === "object" &&
    !Array.isArray(firstTaskParams.transportMetadata)
      ? firstTaskParams.transportMetadata as Record<string, unknown>
      : null;
  const planProvider =
    typeof plan?.provider === "string" ? plan.provider.trim() : "";
  const explicitTransport =
    firstTaskTransportMetadata?.transport === "mcp" || plan?.transport === "mcp"
      ? "mcp"
      : null;
  const resolvedTransport = resolveMediaModelTransportConfig({
    provider: input.model?.provider ?? planProvider,
    modelId: normalizedModelId,
    configJson: input.model?.configJson,
  });
  const transport = explicitTransport ?? resolvedTransport.transport;
  const legacyProviderKey =
    typeof firstTaskTransportMetadata?.providerKey === "string"
      ? firstTaskTransportMetadata.providerKey.trim()
      : "";
  const legacyProviderModelId =
    typeof firstTaskTransportMetadata?.providerModelId === "string"
      ? firstTaskTransportMetadata.providerModelId.trim()
      : "";
  const legacyToolName =
    typeof firstTaskTransportMetadata?.toolName === "string"
      ? firstTaskTransportMetadata.toolName.trim()
      : "";
  const legacyArgumentShape =
    typeof firstTaskTransportMetadata?.argumentShape === "string"
      ? firstTaskTransportMetadata.argumentShape.trim()
      : "";
  const providerKey =
    resolvedTransport.providerKey ||
    legacyProviderKey ||
    planProvider ||
    null;
  const providerModelId =
    resolvedTransport.providerModelId ||
    legacyProviderModelId ||
    null;
  const provider =
    String(input.model?.provider ?? planProvider ?? providerKey ?? "").trim();
  return {
    value: modelId,
    label: `${String(input.model?.name ?? modelId)} (${transport === "mcp" ? "MCP" : "API"}${provider || providerKey ? ` • ${provider || providerKey}` : ""})`,
    provider,
    transport,
    providerKey,
    providerModelId,
    toolName:
      resolvedTransport.toolName ||
      legacyToolName ||
      null,
    argumentShape:
      resolvedTransport.argumentShape ||
      legacyArgumentShape ||
      null,
  };
}

type HyperframesSelectedShotPreviewMode = "design" | "video";
type HyperframesSelectedShotVideoLoadState = "idle" | "loading" | "ready" | "error";

function isProbablyVideoUrl(value: string): boolean {
  const normalized = value.split("?", 1)[0]?.toLowerCase() ?? "";
  return normalized.startsWith("data:video/") || /\.(mp4|webm|mov|avi|mkv)$/i.test(normalized);
}

function isProbablyImageUrl(value: string): boolean {
  const normalized = value.split("?", 1)[0]?.toLowerCase() ?? "";
  return normalized.startsWith("data:image/") || /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(normalized);
}

function isStoryboardVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv)$/i.test(file.name);
}

function isStoryboardImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|avif|bmp|tiff|svg)$/i.test(file.name);
}

function isStoryboardMediaFile(file: File): boolean {
  return isStoryboardVideoFile(file) || isStoryboardImageFile(file);
}

function isManagedStoryboardAssetUrl(value: string): boolean {
  const trimmed = value.trim();
  if (
    trimmed.startsWith("/api/storage/files/")
    || trimmed.startsWith("/uploads/")
    || trimmed.startsWith("/api/v1/media/files/")
    || trimmed.startsWith("data:")
    || trimmed.startsWith("blob:")
  ) {
    return true;
  }
  if (typeof window === "undefined" || !/^https?:\/\//i.test(trimmed)) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.origin === window.location.origin
      && (
        parsed.pathname.startsWith("/api/storage/files/")
        || parsed.pathname.startsWith("/uploads/")
        || parsed.pathname.startsWith("/api/v1/media/files/")
      );
  } catch {
    return false;
  }
}

function shouldImportStoryboardRemoteAsset(value: string): boolean {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) && !isManagedStoryboardAssetUrl(trimmed);
}

function isUsableStoryboardImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/api/storage/files/") ||
    trimmed.startsWith("/api/v1/media/files/") ||
    trimmed.startsWith("/uploads/") ||
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("blob:")
  );
}

function findStoryboardImageUrl(value: unknown, visited = new WeakSet<object>()): string | null {
  if (isUsableStoryboardImageUrl(value)) {
    return normalizeStoryboardMediaUrl(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return null;
    try {
      return findStoryboardImageUrl(JSON.parse(trimmed), visited);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  if (visited.has(value)) return null;
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStoryboardImageUrl(item, visited);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const preferredKeys = [
    "image_url",
    "imageUrl",
    "image",
    "images",
    "source_url",
    "sourceUrl",
    "resultUrl",
    "result_url",
    "url",
    "output_url",
    "outputUrl",
    "file_url",
    "fileUrl",
    "outputs",
    "resultJson",
    "taskResult",
  ];
  for (const key of preferredKeys) {
    const found = findStoryboardImageUrl(record[key], visited);
    if (found) return found;
  }
  for (const [key, nestedValue] of Object.entries(record)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.includes("audio") || normalizedKey.includes("video")) continue;
    const found = findStoryboardImageUrl(nestedValue, visited);
    if (found) return found;
  }
  return null;
}

function toCanvasSafeStoryboardImageUrl(imageUrl: string): string {
  if (!imageUrl || typeof window === "undefined") return imageUrl;
  if (
    imageUrl.startsWith("data:") ||
    imageUrl.startsWith("blob:") ||
    imageUrl.startsWith("/api/media/image-proxy?")
  ) {
    return imageUrl;
  }

  try {
    const parsed = new URL(imageUrl, window.location.origin);
    if (parsed.origin === window.location.origin && parsed.pathname.startsWith("/api/storage/files/") && parsed.protocol === "https:") {
      return `/api/media/image-proxy?url=${encodeURIComponent(parsed.toString())}`;
    }
    if (parsed.origin === window.location.origin) return parsed.toString();
    if (parsed.protocol !== "https:") return parsed.toString();
    return `/api/media/image-proxy?url=${encodeURIComponent(parsed.toString())}`;
  } catch {
    return imageUrl;
  }
}

function stripPromptCodeFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:text|prompt|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function findFirstStoryboardReviewThumbnail(value: unknown, visited = new WeakSet<object>()): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("/api/storage/files/") ||
      trimmed.startsWith("/uploads/") ||
      trimmed.startsWith("data:image/") ||
      trimmed.startsWith("data:video/")
    ) {
      return normalizeStoryboardMediaUrl(trimmed);
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;
  if (visited.has(value)) return null;
  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstStoryboardReviewThumbnail(item, visited);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of [
    "thumbnailUrl",
    "thumbnail_url",
    "posterUrl",
    "poster_url",
    "url",
    "sourceUrl",
    "source_url",
  ]) {
    const found = findFirstStoryboardReviewThumbnail(record[key], visited);
    if (found) return found;
  }
  for (const key of ["referenceImages", "reference_images", "storyboardContext", "reviewData", "tasks"]) {
    const found = findFirstStoryboardReviewThumbnail(record[key], visited);
    if (found) return found;
  }
  return null;
}

function findFirstStoryboardReviewImageUrl(value: unknown, visited = new WeakSet<object>()): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed && isProbablyImageUrl(trimmed) ? normalizeStoryboardMediaUrl(trimmed) : null;
  }

  if (!value || typeof value !== "object") return null;
  if (visited.has(value)) return null;
  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstStoryboardReviewImageUrl(item, visited);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of [
    "thumbnailUrl",
    "thumbnail_url",
    "posterUrl",
    "poster_url",
    "imageUrl",
    "image_url",
    "referenceUrls",
    "reference_images",
    "referenceImages",
    "storyboardContext",
    "generationExtraParams",
  ]) {
    const found = findFirstStoryboardReviewImageUrl(record[key], visited);
    if (found) return found;
  }
  for (const value of Object.values(record)) {
    const found = findFirstStoryboardReviewImageUrl(value, visited);
    if (found) return found;
  }
  return null;
}

function getStoryboardReviewProjectThumbnail(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  return findFirstStoryboardReviewThumbnail(record.thumbnailUrl)
    ?? findFirstStoryboardReviewThumbnail(record.reviewData);
}

function getStoryboardClipPosterUrl(clip: StoryboardClipCandidate | null | undefined): string | undefined {
  if (!clip) return undefined;
  const referencePoster = clip.referenceUrls?.find(isProbablyImageUrl);
  if (referencePoster) return referencePoster;
  const extraPoster = findFirstStoryboardReviewImageUrl(clip.generationExtraParams);
  if (extraPoster) return extraPoster;
  const nestedPoster = findFirstStoryboardReviewImageUrl(clip);
  if (nestedPoster) return nestedPoster;
  return isProbablyImageUrl(clip.url) ? clip.url : undefined;
}

function getHyperframesVideoPreviewStatusText(input: {
  locale: string;
  hasVideo: boolean;
  state: HyperframesSelectedShotVideoLoadState;
  error: string;
  shotNumber: number;
}): string {
  if (!input.hasVideo) {
    return input.locale === "th" ? "shot นี้ไม่มี MP4 ให้เล่น" : "This shot has no MP4 preview.";
  }
  if (input.state === "loading") {
    return input.locale === "th" ? "กำลังโหลดวิดีโอ..." : "Loading video...";
  }
  if (input.state === "error") {
    return input.error || (input.locale === "th" ? "โหลดวิดีโอไม่สำเร็จ" : "Failed to load video.");
  }
  if (input.state === "ready") {
    return input.locale === "th" ? `กำลังเล่นวิดีโอ shot ${input.shotNumber}` : `Playing shot ${input.shotNumber}`;
  }
  return input.locale === "th" ? "กำลังเตรียมวิดีโอ..." : "Preparing video...";
}

const storyboardUploadAssetResolver = new WebAssetResolver();

function normalizeVideoFrameAspectRatio(value: unknown): "9:16" | "16:9" | null {
  const normalized = String(value || "").trim();
  return normalized === "9:16" || normalized === "16:9" ? normalized : null;
}

function aspectRatioToNumber(value: "9:16" | "16:9"): number {
  return value === "9:16" ? 9 / 16 : 16 / 9;
}

function isCloseToAspectRatio(width: number, height: number, aspectRatio: "9:16" | "16:9"): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false;
  }
  return Math.abs((width / height) - aspectRatioToNumber(aspectRatio)) < 0.015;
}

function inferVideoFrameAspectRatio(width: number, height: number): "9:16" | "16:9" | undefined {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  return width <= height ? "9:16" : "16:9";
}

function dataUrlToMimeType(dataUrl: string, fallback = "image/jpeg"): string {
  const match = dataUrl.match(/^data:([^;,]+)[;,]/);
  return match?.[1] || fallback;
}

function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [header = "", payload = ""] = dataUrl.split(",", 2);
  const mimeType = dataUrlToMimeType(dataUrl, "image/jpeg");
  const isBase64 = /;base64/i.test(header);
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], fileName, { type: mimeType });
}

function storyboardUploadExtensionForMime(mimeType: string, mediaType: "audio" | "video" | "image"): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("flac")) return "flac";
  if (normalized.includes("aac")) return "aac";
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("quicktime")) return "mov";
  if (normalized.includes("x-matroska")) return "mkv";
  if (normalized.includes("avi")) return "avi";
  if (mediaType === "audio") return "mp3";
  if (mediaType === "video") return "mp4";
  return "jpg";
}

function readVideoMetadata(file: File): Promise<{
  durationSeconds?: number;
  aspectRatio?: "9:16" | "16:9";
}> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const cleanup = () => URL.revokeObjectURL(url);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : undefined;
      const aspectRatio = inferVideoFrameAspectRatio(video.videoWidth, video.videoHeight);
      cleanup();
      resolve({ durationSeconds: duration, aspectRatio });
    };
    video.onerror = () => {
      cleanup();
      resolve({});
    };
    video.src = url;
  });
}

function readImageMetadata(file: File): Promise<{
  aspectRatio?: "9:16" | "16:9";
}> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(url);
    image.onload = () => {
      const aspectRatio = inferVideoFrameAspectRatio(image.naturalWidth, image.naturalHeight);
      cleanup();
      resolve({ aspectRatio });
    };
    image.onerror = () => {
      cleanup();
      resolve({});
    };
    image.src = url;
  });
}

function prepareVeoPromptForGenerationType(promptText: string, generationType: unknown): string {
  if (String(generationType ?? "").trim() !== "REFERENCE_2_VIDEO") return promptText;
  if (/Reference image mode:/i.test(promptText) || /not .*start frame/i.test(promptText)) return promptText;
  return `${VEO_REFERENCE_IMAGE_ROLE_INSTRUCTION}\n${promptText}`.trim();
}

const STORYBOARD_PRODUCTION_CONTEXT_KEYS = [
  "productionRunId",
  "productionProjectTitle",
  "productionStoryConceptId",
  "productionStoryConceptTitle",
  "productionStoryConceptAngle",
  "productionStoryConceptDetails",
  "videoConcept",
  "voiceoverFullScript",
  "storyboardGuide",
  "sourceGridUrl",
  "sourceShotId",
  "sourceShotTitle",
  "sourceShotTimeRange",
  "sourceShotScript",
  "sourceShotVideoPrompt",
] as const satisfies readonly (keyof StoryboardProductionContext)[];

function firstStoryboardText(...values: unknown[]): string {
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) return text;
  }
  return "";
}

function getStoryboardTaskVideoSegmentId(task?: StoryboardGenerationTask | null): string {
  const value = task?.storyboardContext?.extraParams?.videoSegmentId;
  return typeof value === "string" ? value.trim() : "";
}

function getStoryboardTaskShotId(task: StoryboardGenerationTask, fallbackIndex: number): string {
  const value = task.storyboardContext?.extraParams?.shotId;
  return typeof value === "string" && value.trim() ? value.trim() : task.id || `shot-${fallbackIndex + 1}`;
}

function storyboardTaskBelongsToSegment(
  task: StoryboardGenerationTask,
  segment: VideoSegment,
  fallbackIndex: number,
): boolean {
  const segmentId = getStoryboardTaskVideoSegmentId(task);
  if (segmentId && segmentId === segment.segmentId) return true;
  return segment.shotIds.includes(getStoryboardTaskShotId(task, fallbackIndex));
}

function buildSegmentPromptPlanningCurrentPrompt(segment: VideoSegment): string {
  return compactStoryboardPromptPlannerContext(segment.subShots
    .map((shot, index) => [
      `Sub-shot ${index + 1}: ${shot.durationSeconds}s`,
      shot.title,
      shot.visualPrompt,
      shot.voiceover ? `Voiceover: ${shot.voiceover}` : "",
    ].filter(Boolean).join(" - "))
    .join("\n")) ?? "";
}

function normalizeReviewProductionContext(value: unknown): StoryboardProductionContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const context: StoryboardProductionContext = {};
  for (const key of STORYBOARD_PRODUCTION_CONTEXT_KEYS) {
    const text = firstStoryboardText(record[key]);
    if (text) context[key] = text;
  }
  return Object.keys(context).length > 0 ? context : null;
}

function getTaskEmbeddedProductionContext(task?: StoryboardGenerationTask | null): StoryboardProductionContext | null {
  return normalizeReviewProductionContext(task?.productionContext)
    ?? normalizeReviewProductionContext(task?.storyboardContext?.productionContext)
    ?? normalizeReviewProductionContext(task?.storyboardContext?.extraParams?.productionContext);
}

function getReviewProductionContext(
  draft?: StoryboardReviewDraft | null,
  task?: StoryboardGenerationTask | null,
): StoryboardProductionContext | null {
  return normalizeReviewProductionContext(draft?.productionContext)
    ?? getTaskEmbeddedProductionContext(task);
}

function buildReviewProductionExtraParams(productionContext: StoryboardProductionContext | null): Record<string, unknown> {
  if (!productionContext) return {};
  return {
    productionContext,
    ...(productionContext.productionRunId ? { productionRunId: productionContext.productionRunId } : {}),
    ...(productionContext.productionStoryConceptId ? { productionStoryConceptId: productionContext.productionStoryConceptId } : {}),
    ...(productionContext.productionStoryConceptTitle ? { productionStoryConceptTitle: productionContext.productionStoryConceptTitle } : {}),
    ...(productionContext.videoConcept ? { productionVideoConcept: productionContext.videoConcept } : {}),
  };
}

function getStoryboardPlannerVoiceContext(task?: StoryboardGenerationTask | null): {
  voiceoverScript: string;
  journeyStage: string;
  voiceoverFullScript: string;
} {
  const extraParams = task?.storyboardContext?.extraParams;
  const planner = extraParams?.storyboardPromptPlanner as Record<string, unknown> | undefined;
  const productionContext = getTaskEmbeddedProductionContext(task);
  return {
    voiceoverScript: String(planner?.voiceoverScript ?? extractStoryboardNativeSpeechText(task?.prompt ?? "") ?? "").trim(),
    journeyStage: String(planner?.journeyStage ?? "").trim(),
    voiceoverFullScript: firstStoryboardText(
      planner?.voiceoverFullScript,
      extraParams?.voiceoverFullScript,
      productionContext?.voiceoverFullScript,
    ),
  };
}

function getStoryboardDraftVoiceoverFullScript(draft?: StoryboardReviewDraft | null): string {
  const explicitScript = firstStoryboardText(
    draft?.voiceoverFullScript,
    draft?.productionContext?.voiceoverFullScript,
  );
  if (explicitScript) return explicitScript;
  const orderedTasks = (draft?.taskIds ?? [])
    .map((taskId) => draft?.tasks.find((task) => task.id === taskId))
    .filter((task): task is StoryboardGenerationTask => Boolean(task));
  return orderedTasks
    .map((task) => getStoryboardPlannerVoiceContext(task).voiceoverScript)
    .filter(Boolean)
    .join("\n");
}

function getStoryboardDraftVoiceoverSummary(
  draft: StoryboardReviewDraft | null | undefined,
  locale: string,
): string {
  const orderedTasks = (draft?.taskIds ?? [])
    .map((taskId) => draft?.tasks.find((task) => task.id === taskId))
    .filter((task): task is StoryboardGenerationTask => Boolean(task));
  const taskLines = orderedTasks
    .map((task, index) => {
      const script = getStoryboardPlannerVoiceContext(task).voiceoverScript;
      if (!script) return "";
      const label = locale === "th" ? `ช็อต ${index + 1}` : `Shot ${index + 1}`;
      return `${label}: ${script}`;
    })
    .filter(Boolean);
  if (taskLines.length > 0) {
    return taskLines.join("\n\n");
  }
  return getStoryboardDraftVoiceoverFullScript(draft);
}

function formatStoryboardRecordingElapsed(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function pickStoryboardAudioRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const mimeType of [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ]) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return undefined;
}

function formatAudioInputDeviceLabel(device: MediaDeviceInfo, index: number, locale: string): string {
  const label = device.label.trim();
  if (label) return label;
  return locale === "th" ? `ไมก์ ${index + 1}` : `Microphone ${index + 1}`;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const STORYBOARD_GENERATION_POLL_INTERVAL_MS = 5000;
const STORYBOARD_GENERATION_POLL_RETRY_INTERVAL_MS = 15000;
const STORYBOARD_REVIEW_PAGE_DEBUG_BUILD = "storyboard-review-page-route-open-hotfix-20260620-1605";

type StoryboardProviderTaskStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";
type HyperframesFinalOverlayPreset = HyperframesFinalCompositeConfig["overlayPreset"];
type HyperframesFinalSubtitlePreset = HyperframesFinalCompositeConfig["subtitlePreset"];
type HyperframesFinalTextMode = HyperframesFinalCompositeConfig["textMode"];
type HyperframesFinalTextMotionPreset = NonNullable<HyperframesFinalCompositeConfig["textMotionPreset"]>;
type HyperframesFinalShotAnimationPreset = HyperframesFinalCompositeConfig["shots"][number]["animationPreset"];
type HyperframesFinalShotTransition = HyperframesFinalCompositeConfig["shots"][number]["transition"];
type HyperframesFinalSfxRole = Exclude<(typeof hyperframesAudioRoles)[number], "voiceover" | "music" | "ambience">;
type HyperframesFinalSfxTrigger = Exclude<(typeof hyperframesAudioVisualTriggers)[number], "video_start">;
type HyperframesFinalSfxTarget = "all" | "first" | "last" | string;
type HyperframesFinalAutosaveStatus = "idle" | "saving" | "saved" | "error";
type HyperframesFinalAutosaveSnapshot = {
  signature: string;
  textVariables: Record<string, unknown>;
};
type HyperframesFinalSfxDraft = {
  id: string;
  presetId: string;
  target: HyperframesFinalSfxTarget;
  visualTrigger: HyperframesFinalSfxTrigger;
  offsetSec: number;
  durationSec: number;
  volume: number;
  role: HyperframesFinalSfxRole;
};
type HyperframesFinalSourceClip = StoryboardClipCandidate & {
  mediaStartSec?: number;
  sourceClipId?: string;
  segmentIndex?: number;
  segmentCount?: number;
  originalDurationSeconds?: number;
  derivedFromUrl?: string;
  derivedSourceTrim?: StoryboardSourceTrimRange | null;
};
type HyperframesFinalResolvedPromptShot = {
  id: string;
  prompt: string;
  sourceClipId?: string;
  sourceVideoRef: string;
  mediaStartSec: number;
  startSec: number;
  endSec: number;
  durationSeconds: number;
  overlayText: string;
  overlayLines: string[];
  subtitleText: string;
  subtitleCues: HyperframesFinalCompositeConfig["shots"][number]["subtitleCues"];
  subtitleVtt?: string;
  subtitleSrt?: string;
  overlayPreset: HyperframesFinalOverlayPreset;
  animationPreset: HyperframesFinalShotAnimationPreset;
  transition: HyperframesFinalShotTransition;
  textMotionPreset: HyperframesFinalTextMotionPreset;
};

const HYPERFRAMES_FINAL_OVERLAY_PRESETS: Array<{
  id: HyperframesFinalOverlayPreset;
  labelTh: string;
  labelEn: string;
  kind: "auto" | "hook" | "spec" | "cards" | "price" | "review" | "clean";
}> = [
  { id: "auto", labelTh: "Auto ตามสินค้า", labelEn: "Auto by product", kind: "auto" },
  { id: "premium_product_hero", labelTh: "Premium Product Hero", labelEn: "Premium product hero", kind: "hook" },
  { id: "hook_sequence", labelTh: "Hook ทีละจังหวะ", labelEn: "Hook sequence", kind: "hook" },
  { id: "kinetic_bold_hook", labelTh: "Kinetic Bold Hook", labelEn: "Kinetic bold hook", kind: "hook" },
  { id: "creator_top_punch", labelTh: "Creator Top Punch", labelEn: "Creator top punch", kind: "hook" },
  { id: "ugc_center_stack", labelTh: "UGC Center Stack", labelEn: "UGC center stack", kind: "hook" },
  { id: "white_intro_card", labelTh: "White Intro Card", labelEn: "White intro card", kind: "hook" },
  { id: "tech_signal_map", labelTh: "Tech Signal Map", labelEn: "Tech signal map", kind: "spec" },
  { id: "spec_highlight", labelTh: "Spec Highlight", labelEn: "Spec highlight", kind: "spec" },
  { id: "electronics_spec_stack", labelTh: "Electronics Spec Stack", labelEn: "Electronics spec stack", kind: "spec" },
  { id: "split_product_specs", labelTh: "Split Product Specs", labelEn: "Split product specs", kind: "spec" },
  { id: "neon_gaming_specs", labelTh: "Neon Gaming Specs", labelEn: "Neon gaming specs", kind: "spec" },
  { id: "spec_lines_6_clean", labelTh: "Spec 6 บรรทัด Clean", labelEn: "Spec sheet 6 lines clean", kind: "spec" },
  { id: "spec_lines_10_dark", labelTh: "Spec 10 บรรทัด Dark", labelEn: "Spec sheet 10 lines dark", kind: "spec" },
  { id: "spec_lines_12_light", labelTh: "Spec 12 บรรทัด Light", labelEn: "Spec sheet 12 lines light", kind: "spec" },
  { id: "spec_lines_15_neon", labelTh: "Spec 15 บรรทัด Neon", labelEn: "Spec sheet 15 lines neon", kind: "spec" },
  { id: "feature_cards", labelTh: "Feature Cards", labelEn: "Feature cards", kind: "cards" },
  { id: "badge_cascade", labelTh: "Badge Cascade", labelEn: "Badge cascade", kind: "cards" },
  { id: "lower_third_review", labelTh: "Review Lower Third", labelEn: "Review lower third", kind: "review" },
  { id: "price_impact", labelTh: "Price Impact", labelEn: "Price impact", kind: "price" },
  { id: "hero_price_billboard", labelTh: "Hero Price Billboard", labelEn: "Hero price billboard", kind: "price" },
  { id: "clean_subtitle", labelTh: "Subtitle อย่างเดียว", labelEn: "Subtitle only", kind: "clean" },
];

function getHyperframesOverlayPresetMeta(id: HyperframesFinalOverlayPreset) {
  return HYPERFRAMES_FINAL_OVERLAY_PRESETS.find(preset => preset.id === id) ?? HYPERFRAMES_FINAL_OVERLAY_PRESETS[0]!;
}

function isHyperframesSpecOverlayPreset(preset: HyperframesFinalOverlayPreset | string | null | undefined): boolean {
  if (!preset) return false;
  return getHyperframesOverlayPresetMeta(preset as HyperframesFinalOverlayPreset).kind === "spec";
}

const HYPERFRAMES_LONG_SPEC_OVERLAY_LINE_LIMITS: Partial<Record<HyperframesFinalOverlayPreset, number>> = {
  spec_lines_6_clean: 6,
  spec_lines_10_dark: 10,
  spec_lines_12_light: 12,
  spec_lines_15_neon: 15,
};

function getHyperframesOverlayLineLimit(preset: HyperframesFinalOverlayPreset | string | null | undefined): number {
  if (isHyperframesSpecOverlayPreset(preset)) return Number.MAX_SAFE_INTEGER;
  return HYPERFRAMES_LONG_SPEC_OVERLAY_LINE_LIMITS[preset as HyperframesFinalOverlayPreset] ?? 4;
}

const HYPERFRAMES_FINAL_SUBTITLE_PRESETS: Array<{
  id: HyperframesFinalSubtitlePreset;
  labelTh: string;
  labelEn: string;
}> = [
  { id: "classic_box", labelTh: "Classic Box", labelEn: "Classic box" },
  { id: "minimal_shadow", labelTh: "Minimal Shadow", labelEn: "Minimal shadow" },
  { id: "creator_pop", labelTh: "Creator Pop", labelEn: "Creator pop" },
  { id: "karaoke_word", labelTh: "Karaoke Word Highlight", labelEn: "Karaoke word highlight" },
  { id: "highlight_bar", labelTh: "Highlight Bar", labelEn: "Highlight bar" },
  { id: "lower_third", labelTh: "Lower Third", labelEn: "Lower third" },
  { id: "cinematic_wide", labelTh: "Cinematic Wide", labelEn: "Cinematic wide" },
  { id: "neon_glow", labelTh: "Neon Glow", labelEn: "Neon glow" },
  { id: "review_bubble", labelTh: "Review Bubble", labelEn: "Review bubble" },
  { id: "no_subtitle_style", labelTh: "ไม่แสดง Subtitle", labelEn: "No subtitles" },
];

const HYPERFRAMES_FINAL_SUBTITLE_FONT_SIZE_OPTIONS = [
  { value: 28, labelTh: "เล็ก 28px", labelEn: "Small 28px" },
  { value: 34, labelTh: "ปกติ 34px", labelEn: "Default 34px" },
  { value: 40, labelTh: "ใหญ่ 40px", labelEn: "Large 40px" },
  { value: 46, labelTh: "ใหญ่มาก 46px", labelEn: "Extra large 46px" },
] as const;

const HYPERFRAMES_FINAL_MUSIC_PRESETS = listHyperframesCreativePresets({
  category: "music",
  includeCandidate: true,
});
const HYPERFRAMES_FINAL_SFX_PRESETS = listHyperframesCreativePresets({
  category: "sfx",
  includeCandidate: true,
});

const HYPERFRAMES_FINAL_SHOT_ANIMATION_PRESETS: Array<{
  id: HyperframesFinalShotAnimationPreset;
  labelTh: string;
  labelEn: string;
}> = [
  { id: "smooth_reveal", labelTh: "Smooth reveal", labelEn: "Smooth reveal" },
  { id: "slide_pop", labelTh: "Slide pop", labelEn: "Slide pop" },
  { id: "bounce_price", labelTh: "Price bounce", labelEn: "Price bounce" },
  { id: "floating_product", labelTh: "Floating product", labelEn: "Floating product" },
  { id: "glow_feature", labelTh: "Feature glow", labelEn: "Feature glow" },
  { id: "fade_clean", labelTh: "Clean fade", labelEn: "Clean fade" },
];

const HYPERFRAMES_FINAL_SHOT_TRANSITIONS: Array<{
  id: HyperframesFinalShotTransition;
  labelTh: string;
  labelEn: string;
}> = [
  { id: "fade", labelTh: "Fade", labelEn: "Fade" },
  { id: "slide", labelTh: "Slide", labelEn: "Slide" },
  { id: "zoom", labelTh: "Zoom", labelEn: "Zoom" },
  { id: "whip", labelTh: "Whip", labelEn: "Whip" },
  { id: "none", labelTh: "ไม่ใช้ transition", labelEn: "No transition" },
];

const HYPERFRAMES_FINAL_TEXT_MODE_OPTIONS: Array<{
  id: HyperframesFinalTextMode;
  labelTh: string;
  labelEn: string;
  descriptionTh: string;
  descriptionEn: string;
}> = [
  {
    id: "hook_and_per_shot",
    labelTh: "Hook 3 วิแรก + overlay ทุก shot",
    labelEn: "3s opening hook + overlay every shot",
    descriptionTh: "shot 1 แสดง Hook ก่อน แล้ว overlay ของ shot 1 เข้าหลัง Hook; shot อื่นแสดง overlay ราย shot",
    descriptionEn: "Shot 1 shows the hook first, then its own overlay after the hook; other shots show their per-shot overlays.",
  },
  {
    id: "hook_only",
    labelTh: "Hook เฉพาะ 3 วิแรกของ shot 1",
    labelEn: "Opening hook on shot 1 only",
    descriptionTh: "แสดงเฉพาะ Hook/Supporting ใน 3 วินาทีแรกของ shot 1; shot อื่นไม่มี overlay",
    descriptionEn: "Only Hook/supporting text appears during the first 3 seconds of shot 1; other shots have no overlay.",
  },
  {
    id: "per_shot",
    labelTh: "Overlay ราย shot ทุก shot",
    labelEn: "Per-shot overlay on every shot",
    descriptionTh: "ไม่ใช้ Hook เปิดเรื่อง; ทุก shot ใช้ข้อความ overlay ของ shot นั้น",
    descriptionEn: "No opening hook; every shot uses its own per-shot overlay copy.",
  },
  {
    id: "none",
    labelTh: "ไม่ใส่ Hook/Overlay",
    labelEn: "No hook or overlay",
    descriptionTh: "ไม่แสดงข้อความ overlay บนภาพ แต่ subtitle ยังแสดงได้ถ้าเปิด Burn-in Subtitle",
    descriptionEn: "No visual overlay text; subtitles can still render when burn-in subtitles are enabled.",
  },
];
const HYPERFRAMES_FINAL_HOOK_DURATION_SEC = 3;

function getHyperframesFinalTextModeOption(mode: HyperframesFinalTextMode) {
  return HYPERFRAMES_FINAL_TEXT_MODE_OPTIONS.find(option => option.id === mode) ??
    HYPERFRAMES_FINAL_TEXT_MODE_OPTIONS[0]!;
}

function shouldRenderHyperframesFinalHookText(mode: HyperframesFinalTextMode): boolean {
  return mode === "hook_only" || mode === "hook_and_per_shot";
}

function shouldRenderHyperframesFinalShotOverlay(mode: HyperframesFinalTextMode, shotIndex: number): boolean {
  if (mode === "per_shot") return true;
  if (mode === "hook_and_per_shot") return true;
  return false;
}

function resolveHyperframesFinalShotOverlayLines(input: {
  textMode: HyperframesFinalTextMode;
  shotIndex: number;
  overlayPreset: HyperframesFinalOverlayPreset;
  productContext: Record<string, unknown> | null;
  productTitle: string;
  productDescription: string;
  storyboardName: string;
  hookText: string;
  supportingText: string;
  clip: StoryboardClipCandidate;
  clipCount: number;
  savedOverlayText?: string | null;
}): string[] {
  if (!shouldRenderHyperframesFinalShotOverlay(input.textMode, input.shotIndex)) {
    return [];
  }
  const draftedOverlayText = buildHyperframesShotOverlayDraft({
    preset: input.overlayPreset,
    productContext: input.productContext,
    productTitle: input.productTitle || input.storyboardName,
    description: input.productDescription,
    hookText: input.hookText,
    supportingText: input.supportingText,
    clip: input.clip,
    index: input.shotIndex,
    total: input.clipCount,
  });
  const editableOverlayText =
    sanitizeHyperframesShotOverlayText(input.savedOverlayText ?? "") ||
    draftedOverlayText ||
    defaultHyperframesShotText(input.clip, input.shotIndex);
  const normalizedOverlayText = removeHyperframesVideoPromptOverlayText(editableOverlayText);
  const rawLines = normalizedOverlayText
    .split(/\n+/)
    .map(line => compactStoryboardText(line))
    .filter(Boolean);
  const lines = isHyperframesSpecOverlayPreset(input.overlayPreset)
    ? uniqueHyperframesOverlayLines(rawLines)
    : uniqueHyperframesOverlayLines(rawLines.map(line => expandLegacyEllipsizedHyperframesText(
      line,
      [input.productDescription, input.productTitle, input.hookText, input.supportingText].filter(Boolean),
      180,
    )));
  return lines.slice(0, getHyperframesOverlayLineLimit(input.overlayPreset));
}

function resolveHyperframesFinalPreviewOverlayLines(input: {
  textMode: HyperframesFinalTextMode;
  shotIndex: number;
  overlayPreset?: HyperframesFinalOverlayPreset | string | null;
  overlayText: string;
  hookText: string;
  supportingText: string;
  maxLines: number;
  maxLength: number;
  playbackSec?: number;
  preferOpeningHook?: boolean;
}): string[] {
  const normalizeLines = (value: string) => isHyperframesSpecOverlayPreset(input.overlayPreset)
    ? uniqueHyperframesOverlayLines(
      removeHyperframesVideoPromptOverlayText(value)
        .split(/\n+/)
        .map(line => compactStoryboardText(line))
        .filter(Boolean),
    )
    : hyperframesPreviewTextLines(removeHyperframesVideoPromptOverlayText(value), {
      maxLines: input.maxLines,
      maxLength: input.maxLength,
    });

  const shouldShowOpeningHook =
    input.shotIndex === 0 &&
    shouldRenderHyperframesFinalHookText(input.textMode) &&
    (input.textMode === "hook_only" ||
      input.preferOpeningHook ||
      Number(input.playbackSec ?? 0) < HYPERFRAMES_FINAL_HOOK_DURATION_SEC);

  if (shouldShowOpeningHook) {
    return normalizeLines([input.hookText, input.supportingText].join("\n"));
  }
  if (shouldRenderHyperframesFinalShotOverlay(input.textMode, input.shotIndex)) {
    return normalizeLines(input.overlayText);
  }
  return [];
}

function getHyperframesFinalPreviewLayerLabel(input: {
  locale: string;
  textMode: HyperframesFinalTextMode;
  shotIndex: number;
  playbackSec?: number;
  preferOpeningHook?: boolean;
}): string {
  const showsOpeningHook =
    input.shotIndex === 0 &&
    shouldRenderHyperframesFinalHookText(input.textMode) &&
    (input.textMode === "hook_only" ||
      input.preferOpeningHook ||
      Number(input.playbackSec ?? 0) < HYPERFRAMES_FINAL_HOOK_DURATION_SEC);

  if (showsOpeningHook) {
    return input.locale === "th" ? "Opening Hook 0-3s" : "Opening Hook 0-3s";
  }
  if (input.shotIndex === 0 && input.textMode === "hook_and_per_shot") {
    return input.locale === "th" ? "Overlay text หลัง Hook" : "Overlay text after hook";
  }
  return input.locale === "th" ? "Overlay text" : "Overlay text";
}

const HYPERFRAMES_FINAL_TEXT_MOTION_PRESETS: Array<{
  id: HyperframesFinalTextMotionPreset;
  labelTh: string;
  labelEn: string;
}> = [
  { id: "slide_right_to_left", labelTh: "ข้อความเลื่อนขวาไปซ้าย", labelEn: "Slide right to left" },
  { id: "stagger_rise", labelTh: "ขึ้นทีละจังหวะ", labelEn: "Stagger rise" },
  { id: "slide_left_to_right", labelTh: "ข้อความเลื่อนซ้ายไปขวา", labelEn: "Slide left to right" },
  { id: "pop_scale", labelTh: "เด้งเข้าจอ", labelEn: "Pop scale" },
  { id: "wipe_reveal", labelTh: "ปาดเปิดข้อความ", labelEn: "Wipe reveal" },
  { id: "none", labelTh: "ไม่ใช้ animation ข้อความ", labelEn: "No text motion" },
];

function defaultHyperframesFinalTextMotionPreset(index: number): HyperframesFinalTextMotionPreset {
  return index === 0 ? "slide_right_to_left" : "stagger_rise";
}

const HYPERFRAMES_FINAL_SFX_TRIGGER_OPTIONS: Array<{
  id: HyperframesFinalSfxTrigger;
  labelTh: string;
  labelEn: string;
}> = [
  { id: "scene_cut", labelTh: "ตอนเปลี่ยนช็อต", labelEn: "Scene cut" },
  { id: "text_appears", labelTh: "ตอนข้อความขึ้น", labelEn: "Text appears" },
  { id: "card_materializes", labelTh: "ตอนการ์ด/สเปกขึ้น", labelEn: "Card appears" },
  { id: "button_depress", labelTh: "ตอน CTA/ปุ่ม", labelEn: "CTA tap" },
  { id: "price_badge_pop", labelTh: "ตอนราคาเด้ง", labelEn: "Price pop" },
  { id: "sales_number_lock", labelTh: "ตอนตัวเลขล็อก", labelEn: "Sales number lock" },
  { id: "product_reveal", labelTh: "ตอนสินค้า reveal", labelEn: "Product reveal" },
  { id: "cta_lock", labelTh: "ตอนจบ CTA", labelEn: "CTA lock" },
  { id: "manual", labelTh: "กำหนดเอง", labelEn: "Manual" },
];
const HYPERFRAMES_FINAL_AUDIO_PACK_PRESETS = listHyperframesCreativePresets({
  category: "audio_pack",
  includeCandidate: true,
});

const DEFAULT_HYPERFRAMES_FINAL_AUDIO_PACK_ID =
  HYPERFRAMES_FINAL_AUDIO_PACK_PRESETS.find(preset =>
    preset.id.includes("ecommerce_fast_cut")
  )?.id ?? HYPERFRAMES_FINAL_AUDIO_PACK_PRESETS[0]?.id ?? "";
const DEFAULT_HYPERFRAMES_FINAL_MUSIC_ID =
  HYPERFRAMES_FINAL_MUSIC_PRESETS.find(preset =>
    preset.id.includes("upbeat_ecommerce")
  )?.id ?? HYPERFRAMES_FINAL_MUSIC_PRESETS[0]?.id ?? "";
const DEFAULT_HYPERFRAMES_FINAL_SFX_IDS = HYPERFRAMES_FINAL_SFX_PRESETS
  .filter(preset =>
    /whoosh_scene_transition|riser_impact_reveal|cash_register_sales/i.test(preset.id)
  )
  .map(preset => preset.id)
  .slice(0, 3);
const DEFAULT_HYPERFRAMES_FINAL_STYLE_BRIEF =
  "Create a 9:16 vertical Thai ecommerce product ad video using HyperFrames.";
const HYPERFRAMES_FINAL_PROMPT_MAX_LENGTH = HYPERFRAMES_FINAL_RENDER_PROMPT_MAX_CHARS;
const HYPERFRAMES_FINAL_AUTOSAVE_DELAY_MS = 800;
const HYPERFRAMES_FINAL_RENDER_DUPLICATE_GUARD_MS = 5_000;

function getCreativePresetLabel(
  preset: Pick<HyperframesCreativePreset, "labels" | "id">,
  locale: string
): string {
  return locale === "th" ? preset.labels.th || preset.labels.en : preset.labels.en || preset.id;
}

function getHyperframesOptionLabel<T extends { id: string; labelTh: string; labelEn: string }>(
  options: readonly T[],
  id: string,
  locale: string,
): string {
  const option = options.find(item => item.id === id);
  if (!option) return id;
  return locale === "th" ? option.labelTh || option.labelEn : option.labelEn || option.id;
}

const ELECTRONICS_SPEC_PATTERNS = [
  /(?:จอ|screen|display|amoled|oled|lcd|นิ้ว|inch|hz|refresh|nits)/i,
  /(?:แบต|battery|mah|ชาร์จ|charging|\b\d+\s*w\b)/i,
  /(?:ram|rom|storage|ssd|gb|tb|หน่วยความจำ|ความจุ)/i,
  /(?:กล้อง|camera|mp|megapixel|sensor|เลนส์)/i,
  /(?:chip|processor|cpu|gpu|snapdragon|dimensity|intel|ryzen|apple\s*m\d|core\s*i\d)/i,
  /(?:wifi|wi-fi|bluetooth|5g|lte|sim|ip\d{2}|กันน้ำ)/i,
];

function cleanHyperframesOverlayText(value: unknown): string {
  return compactStoryboardText(value)
    .replace(/^PRODUCT FACTS LOCK:\s*/i, "")
    .replace(/\s*\/\s*Guide:\s*.*$/i, "")
    .replace(/^Context\s+แนวคิด:\s*/i, "")
    .trim();
}

function isHyperframesVideoPromptLikeText(value: unknown): boolean {
  const text = compactStoryboardText(value);
  if (!text) return false;
  return (
    /^Create an?\s+\d+(?:\.\d+)?-second\s+cinematic\s+vid/i.test(text) ||
    /\bUse\s+@Image\d+\s+as\s+(?:start|stop)\s+frame\b/i.test(text) ||
    /\bVIDEO CHARACTER LOCK\b/i.test(text) ||
    /^(?:Dialogue|Narration|Voiceover|Presenter|Action|Scene)\s*:/i.test(text) ||
    /\bScene:\s*Use\s+@Image\d+/i.test(text)
  );
}

function removeHyperframesVideoPromptOverlayText(value: string): string {
  return value
    .split(/\n+/)
    .map(line => compactStoryboardText(line))
    .filter(line => line && !isHyperframesVideoPromptLikeText(line))
    .join("\n");
}

function sanitizeHyperframesShotOverlayText(value: unknown): string {
  return removeHyperframesVideoPromptOverlayText(String(value ?? ""));
}

function sanitizeHyperframesShotTextMap(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).map(([id, text]) => [id, sanitizeHyperframesShotOverlayText(text)])
  );
}

function normalizeHyperframesSubtitleFontSize(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 34;
  return Math.max(24, Math.min(52, Math.round(numeric)));
}

function hyperframesPreviewSubtitleFontSize(renderFontSizePx: number): number {
  return Math.max(12, Math.min(24, Math.round(renderFontSizePx * 0.48)));
}

function uniqueHyperframesOverlayLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const line of lines) {
    const clean = cleanHyperframesOverlayText(line);
    const key = clean.replace(/[\s…]+/g, "").toLowerCase();
    if (!key || seen.has(key) || isHyperframesVideoPromptLikeText(clean)) continue;
    seen.add(key);
    unique.push(clean);
  }
  return unique;
}

function isElectronicsProductContext(value: Record<string, unknown> | null, description: string): boolean {
  const haystack = compactStoryboardText([
    value?.category,
    value?.capturedCategory,
    value?.mainStoryboardCategory,
    value?.title,
    value?.name,
    value?.productName,
    description,
  ].filter(Boolean).join(" "));
  return /(?:มือถือ|โทรศัพท์|แท็บเล็ต|tablet|pad|notebook|โน้ตบุ๊ก|laptop|camera|กล้อง|electronics|อิเล็ก|xiaomi|samsung|iphone|ipad|macbook|lenovo|asus|acer|dell|hp)/i.test(haystack);
}

function formatProductPriceForOverlay(value: Record<string, unknown> | null): string {
  const raw = value?.price ?? value?.salePrice ?? value?.currentPrice ?? value?.priceText ?? "";
  const text = compactStoryboardText(raw);
  if (!text) return "";
  if (/บาท|thb|฿|^-?\d/i.test(text)) {
    return text.replace(/\bTHB\b/i, "บาท");
  }
  return text;
}

function extractSpecOverlayLines(description: string, maxLines = 4): string[] {
  const candidates = description
    .split(/(?:\n|•|- |\u2022|;|\|)/)
    .map(item => cleanHyperframesOverlayText(item))
    .filter(item => item.length >= 4 && item.length <= 80);
  const specs: string[] = [];
  for (const pattern of ELECTRONICS_SPEC_PATTERNS) {
    const line = candidates.find(item => pattern.test(item) && !specs.includes(item));
    if (line) specs.push(fullThaiProductLine(line, 80));
    if (specs.length >= maxLines) break;
  }
  if (specs.length < maxLines) {
    for (const item of candidates) {
      if (specs.includes(item)) continue;
      if (!/[0-9]/.test(item)) continue;
      specs.push(fullThaiProductLine(item, 80));
      if (specs.length >= maxLines) break;
    }
  }
  return specs.slice(0, maxLines);
}

function buildHyperframesBenefitHookDraft(input: {
  productTitle: string;
  description: string;
  productContext: Record<string, unknown> | null;
}): string {
  const haystack = compactStoryboardText([
    input.productTitle,
    input.description,
    input.productContext?.category,
    input.productContext?.capturedCategory,
  ].filter(Boolean).join(" "));
  if (/กาแฟ|coffee|espresso|barista|เครื่องชง/i.test(haystack)) {
    return "ชงกาแฟหอมเข้ม แบบโปรในเครื่องเดียว";
  }
  if (/แท็บเล็ต|tablet|pad|ipad/i.test(haystack)) {
    return "จอใหญ่ ลื่นแรง แบตอึด";
  }
  if (/มือถือ|smartphone|phone|iphone|android/i.test(haystack)) {
    return "เร็ว คมชัด พร้อมใช้ทั้งวัน";
  }
  if (/โน้ตบุ๊ก|notebook|laptop|macbook/i.test(haystack)) {
    return "ทำงานลื่น พกง่าย พร้อมลุยทุกวัน";
  }
  if (/กล้อง|camera|lens|เลนส์/i.test(haystack)) {
    return "เก็บทุกช็อตให้คมชัดกว่าเดิม";
  }
  if (/สกินแคร์|serum|cream|beauty|ผิว|ครีม|เซรั่ม/i.test(haystack)) {
    return "ผิวดูดีขึ้นในรูทีนที่ง่ายกว่า";
  }
  if (/รองเท้า|shoe|sneaker|สนีกเกอร์/i.test(haystack)) {
    return "ใส่สบาย ลุคดี พร้อมทุกวัน";
  }
  const specLine = extractSpecOverlayLines(input.description, 1)[0];
  if (specLine) return fullThaiProductLine(specLine, 90);
  const productWords = fullThaiProductLine(input.productTitle, 80);
  return productWords ? `${productWords} ที่ตอบโจทย์ทุกวัน` : "จุดขายเด่นของสินค้า";
}

function buildHyperframesSupportingTextDraft(input: {
  productTitle: string;
  description: string;
}): string {
  const title = fullThaiProductLine(input.productTitle, 140);
  if (title) return title;
  return fullThaiProductLine(input.description, 140);
}

function shotSpecificHyperframesOverlayLines(input: {
  clip: StoryboardClipCandidate;
  index: number;
  total: number;
  productTitle: string;
  hookText: string;
  supportingText: string;
  priceText: string;
}): string[] {
  const voiceLine = fullThaiProductLine(
    extractStoryboardNativeSpeechText(input.clip.prompt),
    72,
  );
  const promptLine = firstThaiProductLine(input.clip.prompt, 72, {
    ellipsis: false,
  });
  const ctaLine =
    input.index >= input.total - 1
      ? input.priceText
        ? `เริ่มต้น ${input.priceText}`
        : "กดดูรายละเอียด"
      : "";
  const opener =
    input.index === 0
      ? input.hookText || input.supportingText || input.productTitle
      : "";
  return uniqueHyperframesOverlayLines([
    opener,
    voiceLine,
    isHyperframesVideoPromptLikeText(promptLine) ? "" : promptLine,
    input.index === input.total - 1 ? ctaLine : "",
  ]).slice(0, 3);
}

function resolveHyperframesAutoOverlayPreset(input: {
  productContext: Record<string, unknown> | null;
  description: string;
  hasPrice: boolean;
}): Exclude<HyperframesFinalOverlayPreset, "auto"> {
  if (isElectronicsProductContext(input.productContext, input.description)) return "electronics_spec_stack";
  if (input.hasPrice) return "hero_price_billboard";
  return "premium_product_hero";
}

function buildHyperframesShotOverlayDraft(input: {
  preset: HyperframesFinalOverlayPreset;
  productContext: Record<string, unknown> | null;
  productTitle: string;
  description: string;
  hookText: string;
  supportingText: string;
  clip: StoryboardClipCandidate;
  index: number;
  total: number;
}): string {
  const price = formatProductPriceForOverlay(input.productContext);
  const shotLines = shotSpecificHyperframesOverlayLines({
    clip: input.clip,
    index: input.index,
    total: input.total,
    productTitle: input.productTitle,
    hookText: input.hookText,
    supportingText: input.supportingText,
    priceText: price,
  });
  const resolvedPreset = input.preset === "auto"
    ? resolveHyperframesAutoOverlayPreset({
      productContext: input.productContext,
      description: input.description,
      hasPrice: Boolean(price),
    })
    : input.preset;
  if (resolvedPreset === "clean_subtitle") return "";
  if (resolvedPreset === "price_impact" || resolvedPreset === "hero_price_billboard") {
    if (input.index === 0) {
      return uniqueHyperframesOverlayLines([
        input.hookText || input.productTitle,
        price ? `เริ่มต้น ${price}` : input.supportingText,
      ]).join("\n");
    }
    if (input.index >= input.total - 1) {
      return uniqueHyperframesOverlayLines([
        shotLines[0],
        price ? `เริ่มต้น ${price}` : "",
        "กดดูโปรเลย",
      ]).join("\n");
    }
    return shotLines.join("\n");
  }
  const specLines = extractSpecOverlayLines(input.description, 4);
  if (
    resolvedPreset === "spec_highlight" ||
    resolvedPreset === "electronics_spec_stack" ||
    resolvedPreset === "split_product_specs" ||
    resolvedPreset === "neon_gaming_specs"
  ) {
    if (input.index === 0) {
      return uniqueHyperframesOverlayLines([input.productTitle, input.hookText || input.supportingText]).join("\n");
    }
    const offset = Math.max(0, (input.index - 1) * 2);
    const lines = specLines.slice(offset, offset + 2);
    if (lines.length > 0) return lines.join("\n");
    if (input.index >= input.total - 2) {
      return uniqueHyperframesOverlayLines([
        shotLines[0],
        price ? `เริ่มต้น ${price}` : "",
      ]).join("\n");
    }
    return shotLines.join("\n") || cleanHyperframesOverlayText(input.supportingText);
  }
  if (resolvedPreset === "feature_cards" || resolvedPreset === "badge_cascade") {
    const lines = specLines.slice(input.index % Math.max(1, specLines.length), input.index % Math.max(1, specLines.length) + 2);
    return uniqueHyperframesOverlayLines(lines.length > 0 ? lines : shotLines).join("\n");
  }
  if (resolvedPreset === "lower_third_review") {
    return uniqueHyperframesOverlayLines([
      input.index === 0 ? input.supportingText : "",
      ...(shotLines.length > 0 ? shotLines : [input.hookText]),
    ]).join("\n");
  }
  return uniqueHyperframesOverlayLines([
    input.index === 0 ? input.hookText : "",
    ...(shotLines.length > 0 ? shotLines : [input.supportingText]),
  ]).join("\n");
}

function buildHyperframesLibrarySaveKey(
  render: HyperframesRenderStatusProjection | null | undefined,
) {
  const output = getHyperframesRenderLibraryReadyOutput(render);
  if (
    !render?.tenantId ||
    !render.runId ||
    !render.renderIntent ||
    !render.compositionInputHash ||
    !output?.contentHash ||
    render.renderIntent === "preview" ||
    render.renderIntent === "snapshot"
  ) {
    return null;
  }
  return buildHyperframesLibraryIdempotencyKey({
    tenantId: render.tenantId,
    runId: render.runId,
    renderIntent: render.renderIntent,
    compositionInputHash: render.compositionInputHash,
    outputHash: output.contentHash,
  });
}

function compactStoryboardText(value: unknown, fallback = ""): string {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : fallback;
}

function compactStoryboardPromptPlannerContext(
  value: unknown,
  maxLength = STORYBOARD_REVIEW_PROMPT_PLANNER_CONTEXT_MAX_CHARS,
): string | undefined {
  const text = compactStoryboardText(value);
  if (!text) return undefined;
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, maxLength).replace(/\s+\S*$/, "").trim();
  return `${sliced || text.slice(0, maxLength).trim()}...`;
}

function firstThaiProductLine(
  value: string,
  maxLength = 64,
  options: { ellipsis?: boolean } = {},
): string {
  const text = cleanHyperframesOverlayText(value);
  if (!text) return "";
  const sentence = text
    .split(/(?:\n|\.|!|\?|。|;)/)
    .map(item => item.trim())
    .find(Boolean) ?? text;
  if (sentence.length <= maxLength) return sentence;
  const truncated = sentence.slice(0, Math.max(1, maxLength - 1)).trim();
  return options.ellipsis === false ? truncated : `${truncated}…`;
}

function fullThaiProductLine(value: string, maxLength = 180): string {
  return firstThaiProductLine(value, maxLength, { ellipsis: false })
    .replace(/(?:…|\.{3})$/u, "")
    .trim();
}

function hyperframesPreviewTextLines(
  value: unknown,
  options: { maxLines?: number; maxLength?: number } = {},
): string[] {
  const maxLines = options.maxLines ?? 4;
  const maxLength = options.maxLength ?? 42;
  return uniqueHyperframesOverlayLines(
    String(value ?? "")
      .split(/\n+/)
      .map(line => firstThaiProductLine(line, maxLength, { ellipsis: false }))
      .filter(Boolean),
  ).slice(0, maxLines);
}

function formatHyperframesPreviewLineForPreset(
  line: string,
  preset: HyperframesFinalOverlayPreset | string | null | undefined,
  maxLength: number,
  options: { ellipsis?: boolean } = {},
): string {
  if (isHyperframesSpecOverlayPreset(preset)) {
    return cleanHyperframesOverlayText(line);
  }
  return firstThaiProductLine(line, maxLength, options);
}

function hyperframesPromptLines(value: string, maxLines = 6): string[] {
  return uniqueHyperframesOverlayLines(
    value
      .split(/\n+/)
      .map(line => fullThaiProductLine(line, 180))
      .filter(Boolean),
  ).slice(0, maxLines);
}

function formatHyperframesPromptBulletLines(lines: string[]): string {
  if (lines.length === 0) return "- Use only product-safe, evidence-backed copy from the storyboard review.";
  return lines.map(line => `- ${line}`).join("\n");
}

function formatHyperframesPromptTimeline(input: {
  durationSeconds: number;
  textMode: HyperframesFinalTextMode;
  hookText: string;
  supportingText: string;
  shots: Array<{
    prompt: string;
    overlayText: string;
    subtitleText: string;
    startSec?: number;
    endSec?: number;
    durationSeconds: number;
    overlayPreset?: string;
    animationPreset?: string;
    transition?: string;
    textMotionPreset?: string;
  }>;
}): string {
  if (input.shots.length === 0) {
    return "0-10s: build the product ad from approved storyboard clips once ready.";
  }
  let cursor = 0;
  return input.shots.map((shot, index) => {
    const duration = Math.max(1, Math.round(shot.durationSeconds * 10) / 10);
    const start = typeof shot.startSec === "number" ? Math.round(shot.startSec * 10) / 10 : Math.round(cursor * 10) / 10;
    const end = typeof shot.endSec === "number" ? Math.round(shot.endSec * 10) / 10 : Math.round((cursor + duration) * 10) / 10;
    cursor += duration;
    const overlay = hyperframesPromptLines(shot.overlayText, 2).join(" / ");
    const subtitle = hyperframesPromptLines(shot.subtitleText, 1)[0] ?? "";
    const source = firstThaiProductLine(shot.prompt, 90);
    const text = overlay || subtitle || source || `Shot ${index + 1}`;
    const openingHook = index === 0 && shouldRenderHyperframesFinalHookText(input.textMode)
      ? hyperframesPromptLines([input.hookText, input.supportingText].join("\n"), 2).join(" / ")
      : "";
    const style = [
      shot.overlayPreset,
      shot.animationPreset,
      shot.transition ? `transition ${shot.transition}` : "",
      shot.textMotionPreset ? `text motion ${shot.textMotionPreset}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    const motion =
      index === 0
        ? "open with product identity and smooth hook reveal"
        : index === input.shots.length - 1
          ? "hold final product/CTA clearly"
          : "show the next selling point with smooth easing";
    if (openingHook && input.textMode === "hook_and_per_shot") {
      const hookEnd = Math.min(end, Math.round((start + HYPERFRAMES_FINAL_HOOK_DURATION_SEC) * 10) / 10);
      const overlayStart = Math.min(end, hookEnd);
      return [
        `${start}-${hookEnd}s: opening hook; display "${openingHook}"${style ? `; style ${style}` : ""}.`,
        `${overlayStart}-${end}s: ${motion}; display shot overlay "${text}"${style ? `; style ${style}` : ""}.`,
      ].join("\n");
    }
    if (openingHook && input.textMode === "hook_only") {
      const hookEnd = Math.min(end, Math.round((start + HYPERFRAMES_FINAL_HOOK_DURATION_SEC) * 10) / 10);
      return `${start}-${hookEnd}s: opening hook only; display "${openingHook}"${style ? `; style ${style}` : ""}.`;
    }
    return `${start}-${end}s: ${motion}; display "${text}"${style ? `; style ${style}` : ""}.`;
  }).join("\n");
}

function roundHyperframesTimelineSecond(value: number): number {
  return Math.round(value * 10) / 10;
}

const STORYBOARD_SOURCE_TRIM_MAX_DISABLED_RANGES = 5;
const STORYBOARD_SOURCE_TRIM_MIN_DISABLED_RANGE_SECONDS = 0.3;
const STORYBOARD_SOURCE_TRIM_MIN_KEPT_DURATION_SECONDS = 1;
const STORYBOARD_SOURCE_TRIM_MERGE_GAP_SECONDS = 0.2;

function readStoryboardSourceTrimFromExtraParams(extraParams: unknown): StoryboardSourceTrimRange | null {
  if (!extraParams || typeof extraParams !== "object" || Array.isArray(extraParams)) return null;
  const trim = (extraParams as Record<string, unknown>).sourceTrim;
  if (!trim || typeof trim !== "object" || Array.isArray(trim)) return null;
  const record = trim as Record<string, unknown>;
  const inSec = Number(record.inSec);
  const outSec = Number(record.outSec);
  if (!Number.isFinite(inSec) || !Number.isFinite(outSec) || outSec <= inSec) return null;
  const sourceDurationSec = Number(record.sourceDurationSec);
  const normalized: StoryboardSourceTrimRange = {
    inSec: Math.max(0, roundHyperframesTimelineSecond(inSec)),
    outSec: Math.max(0.1, roundHyperframesTimelineSecond(outSec)),
    ...(Number.isFinite(sourceDurationSec) && sourceDurationSec > 0
      ? { sourceDurationSec: roundHyperframesTimelineSecond(sourceDurationSec) }
      : {}),
  };
  if (Array.isArray(record.disabledRanges)) {
    normalized.disabledRanges = record.disabledRanges
      .map((range) => {
        const rangeRecord = range && typeof range === "object" && !Array.isArray(range)
          ? range as Record<string, unknown>
          : {};
        const startSec = Number(rangeRecord.startSec);
        const endSec = Number(rangeRecord.endSec);
        return Number.isFinite(startSec) && Number.isFinite(endSec) && endSec > startSec
          ? {
              startSec: roundHyperframesTimelineSecond(startSec),
              endSec: roundHyperframesTimelineSecond(endSec),
            }
          : null;
      })
      .filter((range): range is { startSec: number; endSec: number } => Boolean(range));
  }
  return normalized;
}

function readStoryboardSourceTrimDerivedFromExtraParams(extraParams: unknown): {
  url: string;
  durationSeconds?: number;
  sourceUrl?: string;
} | null {
  if (!extraParams || typeof extraParams !== "object" || Array.isArray(extraParams)) return null;
  const derived = (extraParams as Record<string, unknown>).sourceTrimDerived;
  if (!derived || typeof derived !== "object" || Array.isArray(derived)) return null;
  const record = derived as Record<string, unknown>;
  const status = typeof record.status === "string" ? record.status : "";
  const url = typeof record.url === "string" ? record.url.trim() : "";
  if (status !== "ready" || !url) return null;
  const durationSeconds = Number(record.durationSeconds);
  const sourceUrl = typeof record.sourceUrl === "string" ? record.sourceUrl.trim() : "";
  return {
    url,
    ...(Number.isFinite(durationSeconds) && durationSeconds > 0
      ? { durationSeconds: roundHyperframesTimelineSecond(durationSeconds) }
      : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
  };
}

function normalizeStoryboardSourceTrimDisabledRanges(
  ranges: Array<{ startSec: number; endSec: number }> | undefined,
  inSec: number,
  outSec: number,
): Array<{ startSec: number; endSec: number }> {
  const normalized = (ranges ?? [])
    .map((range) => {
      const startSec = Math.max(inSec, Math.min(outSec, roundHyperframesTimelineSecond(range.startSec)));
      const endSec = Math.max(inSec, Math.min(outSec, roundHyperframesTimelineSecond(range.endSec)));
      return endSec - startSec >= STORYBOARD_SOURCE_TRIM_MIN_DISABLED_RANGE_SECONDS
        ? { startSec, endSec }
        : null;
    })
    .filter((range): range is { startSec: number; endSec: number } => Boolean(range))
    .sort((a, b) => a.startSec - b.startSec);

  const merged: Array<{ startSec: number; endSec: number }> = [];
  for (const range of normalized) {
    const previous = merged[merged.length - 1];
    if (previous && range.startSec <= previous.endSec + STORYBOARD_SOURCE_TRIM_MERGE_GAP_SECONDS) {
      previous.endSec = Math.max(previous.endSec, range.endSec);
    } else {
      merged.push({ ...range });
    }
  }

  return merged.slice(0, STORYBOARD_SOURCE_TRIM_MAX_DISABLED_RANGES).map((range) => ({
    startSec: roundHyperframesTimelineSecond(range.startSec),
    endSec: roundHyperframesTimelineSecond(range.endSec),
  }));
}

function getStoryboardSourceTrimKeepRanges(
  trim: StoryboardSourceTrimRange | null,
  fallbackDurationSeconds: number,
): Array<{ sourceStartSec: number; durationSeconds: number }> {
  const fallbackDuration = Math.max(0.5, roundHyperframesTimelineSecond(fallbackDurationSeconds));
  if (!trim) {
    return [{ sourceStartSec: 0, durationSeconds: fallbackDuration }];
  }

  const disabledRanges = normalizeStoryboardSourceTrimDisabledRanges(trim.disabledRanges, trim.inSec, trim.outSec);
  const keepRanges: Array<{ sourceStartSec: number; durationSeconds: number }> = [];
  let cursor = trim.inSec;
  for (const disabledRange of disabledRanges) {
    const durationSeconds = roundHyperframesTimelineSecond(disabledRange.startSec - cursor);
    if (durationSeconds >= 0.5) {
      keepRanges.push({ sourceStartSec: roundHyperframesTimelineSecond(cursor), durationSeconds });
    }
    cursor = Math.max(cursor, disabledRange.endSec);
  }

  const tailDurationSeconds = roundHyperframesTimelineSecond(trim.outSec - cursor);
  if (tailDurationSeconds >= 0.5) {
    keepRanges.push({ sourceStartSec: roundHyperframesTimelineSecond(cursor), durationSeconds: tailDurationSeconds });
  }

  return keepRanges.length > 0
    ? keepRanges
    : [{ sourceStartSec: trim.inSec, durationSeconds: Math.max(0.5, roundHyperframesTimelineSecond(trim.outSec - trim.inSec)) }];
}

function normalizeStoryboardSourceTrimForTask(
  trim: StoryboardSourceTrimRange,
  fallbackDurationSeconds: number,
): StoryboardSourceTrimRange | null {
  const sourceDurationSec = Math.max(
    0.5,
    roundHyperframesTimelineSecond(trim.sourceDurationSec ?? fallbackDurationSeconds)
  );
  const inSec = Math.max(0, Math.min(sourceDurationSec - 0.1, roundHyperframesTimelineSecond(trim.inSec)));
  const outSec = Math.max(inSec + 0.1, Math.min(sourceDurationSec, roundHyperframesTimelineSecond(trim.outSec)));
  const disabledRanges = normalizeStoryboardSourceTrimDisabledRanges(trim.disabledRanges, inSec, outSec);
  const disabledDurationSeconds = disabledRanges.reduce(
    (sum, range) => sum + Math.max(0, range.endSec - range.startSec),
    0,
  );
  if (outSec - inSec - disabledDurationSeconds < STORYBOARD_SOURCE_TRIM_MIN_KEPT_DURATION_SECONDS) {
    return null;
  }
  if (inSec <= 0.05 && outSec >= sourceDurationSec - 0.05 && disabledRanges.length === 0) return null;
  return {
    inSec,
    outSec,
    sourceDurationSec,
    disabledRanges,
  };
}

function splitHyperframesFinalSourceClips(
  clips: StoryboardClipCandidate[]
): {
  clips: HyperframesFinalSourceClip[];
  wasSplit: boolean;
  wasTrimmed: boolean;
  wasLimitedByFinalCap: boolean;
  usedSourceTrim: boolean;
  originalDurationSeconds: number;
  plannedDurationSeconds: number;
} {
  const output: HyperframesFinalSourceClip[] = [];
  let wasSplit = false;
  let wasTrimmed = false;
  let wasLimitedByFinalCap = false;
  let usedSourceTrim = false;
  let originalDurationSeconds = 0;
  let plannedDurationSeconds = 0;

  for (const clip of clips) {
    if (output.length >= HYPERFRAMES_FINAL_COMPOSITE_MAX_SHOTS) {
      wasTrimmed = true;
      wasLimitedByFinalCap = true;
      break;
    }
    const rawDuration = Number(clip.durationSeconds);
    const rawClipDuration = Number.isFinite(rawDuration) && rawDuration > 0
      ? rawDuration
      : DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS;
    const derivedSource = readStoryboardSourceTrimDerivedFromExtraParams(clip.generationExtraParams);
    const sourceTrim = readStoryboardSourceTrimFromExtraParams(clip.generationExtraParams);
    const trim = derivedSource
      ? null
      : normalizeStoryboardSourceTrimForTask(
          sourceTrim ?? {
            inSec: 0,
            outSec: rawClipDuration,
            sourceDurationSec: rawClipDuration,
          },
          rawClipDuration,
        );
    if (trim || derivedSource) {
      usedSourceTrim = true;
    }
    const effectiveClip = derivedSource
      ? {
          ...clip,
          url: derivedSource.url,
          durationSeconds: derivedSource.durationSeconds ?? rawClipDuration,
        }
      : clip;
    const effectiveClipDuration = derivedSource?.durationSeconds ?? rawClipDuration;
    const keepRanges = derivedSource
      ? [{ sourceStartSec: 0, durationSeconds: Math.max(0.5, roundHyperframesTimelineSecond(effectiveClipDuration)) }]
      : getStoryboardSourceTrimKeepRanges(trim, rawClipDuration);
    const clipDuration = roundHyperframesTimelineSecond(
      keepRanges.reduce((sum, range) => sum + range.durationSeconds, 0)
    );
    originalDurationSeconds += rawClipDuration;
    let keepRangeIndex = 0;
    let consumedWithinKeepRange = 0;
    let consumedClipDuration = 0;
    let segmentIndex = 0;
    const outputStartIndex = output.length;
    const segmentCount = Math.max(
      1,
      Math.ceil((Math.min(clipDuration, HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC) - 0.1) / HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC)
    );

    while (
      consumedClipDuration < clipDuration - 0.05 &&
      plannedDurationSeconds < HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC - 0.05 &&
      output.length < HYPERFRAMES_FINAL_COMPOSITE_MAX_SHOTS
    ) {
      const keepRange = keepRanges[keepRangeIndex];
      if (!keepRange) break;
      const remainingKeepRangeSec = keepRange.durationSeconds - consumedWithinKeepRange;
      if (remainingKeepRangeSec < 0.05) {
        keepRangeIndex += 1;
        consumedWithinKeepRange = 0;
        continue;
      }
      const remainingClipSec = clipDuration - consumedClipDuration;
      const remainingFinalSec = HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC - plannedDurationSeconds;
      const durationSeconds = roundHyperframesTimelineSecond(
        Math.min(
          HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC,
          remainingKeepRangeSec,
          remainingClipSec,
          remainingFinalSec
        )
      );
      if (durationSeconds < 0.5) break;
      output.push({
        ...effectiveClip,
        id: segmentIndex === 0 && clipDuration <= HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC + 0.1
          ? clip.id
          : `${clip.id}__hfseg_${segmentIndex + 1}`,
        prompt: clip.prompt,
        durationSeconds,
        mediaStartSec: roundHyperframesTimelineSecond(keepRange.sourceStartSec + consumedWithinKeepRange),
        sourceClipId: clip.id,
        segmentIndex,
        segmentCount,
        originalDurationSeconds: rawClipDuration,
        ...(derivedSource
          ? {
              derivedFromUrl: derivedSource.sourceUrl || clip.url,
              derivedSourceTrim: sourceTrim,
            }
          : {}),
      });
      consumedWithinKeepRange = roundHyperframesTimelineSecond(consumedWithinKeepRange + durationSeconds);
      consumedClipDuration = roundHyperframesTimelineSecond(consumedClipDuration + durationSeconds);
      plannedDurationSeconds = roundHyperframesTimelineSecond(
        plannedDurationSeconds + durationSeconds
      );
      segmentIndex += 1;
    }

    const actualSegmentCount = segmentIndex;
    if (actualSegmentCount > 1) {
      wasSplit = true;
      for (let localSegmentIndex = 0; localSegmentIndex < actualSegmentCount; localSegmentIndex += 1) {
        const outputIndex = outputStartIndex + localSegmentIndex;
        const outputClip = output[outputIndex];
        if (!outputClip) continue;
        output[outputIndex] = {
          ...outputClip,
          prompt: `${clip.prompt || `Shot ${outputIndex + 1}`} (${localSegmentIndex + 1}/${actualSegmentCount})`,
          segmentIndex: localSegmentIndex,
          segmentCount: actualSegmentCount,
        };
      }
    } else if (actualSegmentCount === 1 && segmentCount > 1) {
      const outputClip = output[outputStartIndex];
      if (outputClip) {
        output[outputStartIndex] = {
          ...outputClip,
          segmentIndex: 0,
          segmentCount: 1,
        };
      }
    }
    if (trim || derivedSource || consumedClipDuration < clipDuration - 0.05) {
      wasTrimmed = true;
    }
    if (consumedClipDuration < clipDuration - 0.05) {
      wasLimitedByFinalCap = true;
    }
  }

  return {
    clips: output,
    wasSplit,
    wasTrimmed,
    wasLimitedByFinalCap,
    usedSourceTrim,
    originalDurationSeconds: roundHyperframesTimelineSecond(originalDurationSeconds),
    plannedDurationSeconds: roundHyperframesTimelineSecond(plannedDurationSeconds),
  };
}

function resolveHyperframesSourceClipDurationSeconds(
  task: StoryboardGenerationTask | null | undefined,
  fallbackDurationSeconds?: number,
): number | undefined {
  const candidates = [
    task?.durationSeconds,
    task?.storyboardContext?.extraParams?.actualDurationSeconds,
    task?.storyboardContext?.extraParams?.sourceDurationSeconds,
    task?.storyboardContext?.extraParams?.mediaDurationSeconds,
    task?.storyboardContext?.duration,
    fallbackDurationSeconds,
  ];
  for (const candidate of candidates) {
    const duration = Number(candidate);
    if (Number.isFinite(duration) && duration > 0) {
      return Math.round(duration * 100) / 100;
    }
  }
  return undefined;
}

function formatHyperframesFinalSplitLabel(
  clip: HyperframesFinalSourceClip,
  locale: string
): string | null {
  if (!clip.segmentCount || clip.segmentCount <= 1) return null;
  const startSec = roundHyperframesTimelineSecond(clip.mediaStartSec ?? 0);
  const endSec = roundHyperframesTimelineSecond(
    startSec + Math.max(0, clip.durationSeconds ?? 0)
  );
  const segmentLabel = locale === "th" ? "แบ่งคลิป" : "Split";
  return `${segmentLabel} ${(clip.segmentIndex ?? 0) + 1}/${clip.segmentCount} • ${startSec}-${endSec}s`;
}

function getHyperframesFinalClipDurationSec(clip?: HyperframesFinalSourceClip | null): number {
  return Math.min(
    HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC,
    Math.max(1, clip?.durationSeconds ?? DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS)
  );
}

function prepareHyperframesSegmentVideo(input: {
  video: HTMLVideoElement;
  startSec: number;
  endSec: number;
  restart?: boolean;
}): void {
  if (!input.video) return;
  const startSec = roundHyperframesTimelineSecond(input.startSec);
  const endSec = Math.max(startSec + 0.5, roundHyperframesTimelineSecond(input.endSec));
  input.video.muted = false;
  input.video.defaultMuted = false;
  input.video.volume = 1;
  if (
    input.restart ||
    input.video.currentTime < startSec - 0.05 ||
    input.video.currentTime >= endSec - 0.05
  ) {
    input.video.currentTime = startSec;
  }
}

function isHyperframesFinalRevisionConflictError(error: unknown): boolean {
  const maybeError = error as { message?: unknown; data?: { code?: unknown } } | null;
  const message = typeof maybeError?.message === "string" ? maybeError.message : "";
  return (
    maybeError?.data?.code === "CONFLICT" ||
    message.toLowerCase().includes("revision conflict")
  );
}

function getHyperframesFinalStateRevisionFromReview(review: unknown): number | null {
  const reviewRecord = review && typeof review === "object" ? review as Record<string, unknown> : null;
  const reviewData =
    reviewRecord?.reviewData && typeof reviewRecord.reviewData === "object"
      ? reviewRecord.reviewData as Record<string, unknown>
      : null;
  const state =
    reviewData?.hyperframesFinalComposite && typeof reviewData.hyperframesFinalComposite === "object"
      ? reviewData.hyperframesFinalComposite as Record<string, unknown>
      : null;
  return typeof state?.revision === "number" ? state.revision : null;
}

function isHyperframesTranscribeInfrastructureError(error: unknown): boolean {
  const rawMessage = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "";
  const normalized = rawMessage.toLowerCase();
  return (
    normalized.includes("returned html instead of json") ||
    normalized.includes("routed to the web app shell") ||
    normalized.includes("unexpected token '<'") ||
    normalized.includes("<!doctype") ||
    normalized.includes("<html") ||
    normalized.includes("is not valid json") ||
    normalized.includes("status=502") ||
    normalized.includes("bad gateway") ||
    normalized.includes("status=504") ||
    normalized.includes("gateway timeout") ||
    normalized.includes("status=522") ||
    normalized.includes("status=524")
  );
}

function getHyperframesTranscribeErrorMessage(error: unknown, locale: string): string {
  if (isHyperframesTranscribeInfrastructureError(error)) {
    return locale === "th"
      ? "Transcribe ไม่สำเร็จเพราะ server/proxy ตอบกลับเป็น HTML หรือ timeout ระหว่างประมวลผล ลองกด Transcribe อีกครั้ง หรือใช้ปุ่มสร้างจากบทพูดเป็น fallback"
      : "Transcribe failed because the server/proxy returned HTML or timed out during processing. Try Transcribe again, or use Create from voiceover as a fallback.";
  }
  const rawMessage = error instanceof Error ? error.message : String(error);
  return locale === "th" ? `Transcribe ไม่สำเร็จ: ${rawMessage}` : `Transcribe failed: ${rawMessage}`;
}

function waitHyperframesTranscribeRetryDelay(attempt: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, attempt === 0 ? 900 : 1800));
}

const HYPERFRAMES_TRANSCRIBE_POLL_MAX_ATTEMPTS = 420;

function buildHyperframesFinalRenderPrompt(input: {
  productTitle: string;
  productDescription: string;
  priceText: string;
  styleBrief: string;
  overlayPreset: HyperframesFinalOverlayPreset;
  subtitlePreset: HyperframesFinalSubtitlePreset;
  subtitleFontSizePx: number;
  textMode: HyperframesFinalCompositeConfig["textMode"];
  textMotionPreset: HyperframesFinalTextMotionPreset;
  fontFamily: HyperframesFinalCompositeConfig["fontFamily"];
  hookText: string;
  supportingText: string;
  audioPackPresetLabel: string;
  musicPresetLabel: string;
  sfxPresetLabels: string[];
  preserveNativeAudio: boolean;
  syntheticAudioFallback: boolean;
  burnInSubtitles: boolean;
  durationSeconds: number;
  shots: Array<{
    id: string;
    prompt: string;
    overlayText: string;
    subtitleText: string;
    durationSeconds: number;
    overlayPreset?: string;
    animationPreset?: string;
    transition?: string;
    textMotionPreset?: HyperframesFinalTextMotionPreset;
  }>;
}): string {
  const productTitle = fullThaiProductLine(input.productTitle, 180) || "Approved Marketplace product";
  const description = fullThaiProductLine(input.productDescription, 320);
  const priceText = fullThaiProductLine(input.priceText, 120);
  const style = fullThaiProductLine(input.styleBrief, 420) || DEFAULT_HYPERFRAMES_FINAL_STYLE_BRIEF;
  const hookText = fullThaiProductLine(input.hookText, 180) || productTitle;
  const supportingText = fullThaiProductLine(input.supportingText, 180) || description || productTitle;
  const overlayLines = uniqueHyperframesOverlayLines([
    hookText,
    supportingText,
    ...extractSpecOverlayLines(input.productDescription, 6),
    ...input.shots.flatMap(shot => hyperframesPromptLines(shot.overlayText, 4)),
  ]).slice(0, 8);
  const subtitleLines = uniqueHyperframesOverlayLines(
    input.shots.flatMap(shot => hyperframesPromptLines(shot.subtitleText, 2)),
  ).slice(0, 6);
  const sourceClipCount = input.shots.length;
  const duration = Math.max(0, Math.round(input.durationSeconds * 10) / 10);
  const subtitlePolicy = input.subtitlePreset === "no_subtitle_style" || !input.burnInSubtitles
    ? "No subtitles. Do not add extra subtitle boxes."
    : `Burn in clear Thai subtitles using ${input.subtitlePreset}; keep text inside the lower safe area.`;
  const audioPolicy = [
    input.preserveNativeAudio ? "preserve native clip audio where present" : "mute native clip audio",
    input.musicPresetLabel ? `music bed: ${input.musicPresetLabel}` : "no music bed unless provided",
    input.sfxPresetLabels.length > 0 ? `SFX: ${input.sfxPresetLabels.join(", ")}` : "minimal or no SFX",
    input.syntheticAudioFallback ? "synthetic fallback audio is allowed for missing staged assets" : "use only licensed staged audio assets",
  ].join("; ");
  const timeline = formatHyperframesPromptTimeline({
    durationSeconds: duration,
    textMode: input.textMode,
    hookText,
    supportingText,
    shots: input.shots,
  });
  return [
    "Create a 9:16 vertical product ad video using HyperFrames.",
    "",
    `Style: ${style}`,
    "",
    `Product: ${productTitle}.`,
    description ? `Product context: ${description}` : "Product context: use the approved Storyboard Review product facts only.",
    `Visual: compose ${sourceClipCount || "the approved"} storyboard video clip${sourceClipCount === 1 ? "" : "s"} as the main product footage. Keep product identity visible, use subtle floating/parallax motion, soft shadow, clean product-focused layout, and readable Thai typography.`,
    "",
    `Headline: "${hookText}"`,
    `Subheadline: "${supportingText}"`,
    "Feature callouts:",
    formatHyperframesPromptBulletLines(overlayLines.slice(0, 6)),
    "",
    "Price / trust section:",
    priceText
      ? `- Price or offer text: "${priceText}"`
      : "- Show only evidence-backed price, offer, and trust text when available. Do not invent a sale price.",
    "- Trust text: use official/source-backed trust copy only; otherwise omit.",
    "",
    "Text and layout:",
    `- Overlay preset: ${input.overlayPreset}`,
    `- Subtitle font size: ${normalizeHyperframesSubtitleFontSize(input.subtitleFontSizePx)}px`,
    `- Text mode: ${input.textMode}`,
    `- Text motion: ${input.textMotionPreset}`,
    `- Thai font: ${input.fontFamily}`,
    `- Opening hook duration: ${HYPERFRAMES_FINAL_HOOK_DURATION_SEC}s when the selected text mode uses hook text.`,
    "- Keep every Thai line clear, uncut, and inside the 9:16 safe area with 8% margins.",
    "- Do not invent unsupported product claims, prices, logos, or badges.",
    "- Preview and render must use the same resolved overlay, subtitle, timing, and preset values.",
    "",
    "Subtitle policy:",
    `- ${subtitlePolicy}`,
    subtitleLines.length > 0 ? `- Subtitle/script source:\n${formatHyperframesPromptBulletLines(subtitleLines)}` : "- Use no extra subtitle text beyond the approved storyboard copy.",
    "",
    "Animation:",
    timeline,
    "",
    "Audio:",
    `- ${audioPolicy}`,
    "",
    "Export:",
    `- MP4, 1080x1920, 30fps, ${duration || "auto"} seconds.`,
    "- Render with the official HyperFrames CSS/browser runtime. Do not use ASS/FFmpeg text fallback.",
    "- No extra logos unless provided. No unrelated text. Final frame must keep product and CTA readable.",
  ].join("\n");
}

function expandLegacyEllipsizedHyperframesText(
  value: string,
  sources: string[],
  maxLength = 180,
): string {
  const clean = cleanHyperframesOverlayText(value);
  if (!/(?:…|\.{3})$/u.test(clean) || clean.length > 90) return clean;
  const stem = clean.replace(/(?:…|\.{3})$/u, "").trim();
  if (stem.length < 3) return clean;
  for (const source of sources) {
    const full = fullThaiProductLine(source, maxLength);
    if (full.length > clean.length && full.startsWith(stem)) return full;
  }
  return clean;
}

function defaultHyperframesShotText(clip: StoryboardClipCandidate, index: number): string {
  return "";
}

function defaultHyperframesSubtitleText(clip: StoryboardClipCandidate): string {
  const voice = compactStoryboardText(extractStoryboardNativeSpeechText(clip.prompt));
  if (voice) return voice;
  const fallback = fullThaiProductLine(clip.prompt, 160);
  return isHyperframesVideoPromptLikeText(fallback) ? "" : fallback;
}

function buildHyperframesSubtitleTextMapFromClips(
  clips: StoryboardClipCandidate[],
): Record<string, string> {
  return Object.fromEntries(
    clips.map(clip => [clip.id, defaultHyperframesSubtitleText(clip)])
  );
}

function normalizeHyperframesFinalPreviewShotDurationSeconds(input: {
  startSec?: number;
  endSec?: number;
  durationSeconds: number;
}): number {
  const explicitDuration = Math.max(0, Math.round(Number(input.durationSeconds || 0) * 10) / 10);
  const startSec = Math.max(0, Math.round(Number(input.startSec ?? 0) * 10) / 10);
  const endSec = Math.max(0, Math.round(Number(input.endSec ?? startSec + explicitDuration) * 10) / 10);
  const timelineDuration = Math.max(0, Math.round((endSec - startSec) * 10) / 10);
  return Math.max(1, Math.min(HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC, timelineDuration || explicitDuration));
}

export const __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS = {
  buildPreviewMatchPayloadPreview,
  buildPreviewMatchCompositionPayloadFromHyperframesPreview,
  computePreviewMatchCompositionHash,
  computePreviewMatchTimelineHash,
  buildHyperframesFinalPayloadPreview,
  buildHyperframesShotOverlayDraft,
  buildHyperframesSubtitleTextMapFromClips,
  defaultHyperframesSubtitleText,
  normalizeHyperframesFinalPreviewShotDurationSeconds,
  resolveHyperframesSourceClipDurationSeconds,
  splitHyperframesFinalSourceClips,
  resolveHyperframesFinalShotOverlayLines,
  sanitizeHyperframesShotTextMap,
};

function buildHyperframesFinalPayloadPreview(input: {
  renderPrompt: string;
  overlayPreset: HyperframesFinalOverlayPreset;
  subtitlePreset: HyperframesFinalSubtitlePreset;
  subtitleFontSizePx: number;
  textMode: HyperframesFinalCompositeConfig["textMode"];
  textMotionPreset: HyperframesFinalTextMotionPreset;
  fontFamily: HyperframesFinalCompositeConfig["fontFamily"];
  hookText: string;
  supportingText: string;
  audioPackPresetId: string;
  musicPresetId: string;
  sfxPresetIds: string[];
  sfxDrafts?: HyperframesFinalSfxDraft[];
  preserveNativeAudio: boolean;
  syntheticAudioFallback: boolean;
  burnInSubtitles: boolean;
  durationSeconds: number;
  shots: Array<{
    id: string;
    prompt: string;
    overlayText: string;
    subtitleText: string;
    startSec?: number;
    endSec?: number;
    mediaStartSec?: number;
    sourceClipId?: string;
    sourceVideoRef?: string;
    overlayLines?: string[];
    subtitleCues?: HyperframesFinalCompositeConfig["shots"][number]["subtitleCues"];
    subtitleVtt?: string;
    subtitleSrt?: string;
    durationSeconds: number;
    overlayPreset?: HyperframesFinalOverlayPreset;
    animationPreset?: HyperframesFinalShotAnimationPreset;
    transition?: HyperframesFinalShotTransition;
    textMotionPreset?: HyperframesFinalTextMotionPreset;
  }>;
}): string {
  return JSON.stringify(
    {
      hyperframesRuntime: "official",
      compositionMode: "captioned_final_composite",
      renderIntent: "final",
      prompt: input.renderPrompt.trim() || DEFAULT_HYPERFRAMES_FINAL_STYLE_BRIEF,
      output: {
        width: 1080,
        height: 1920,
        fps: 30,
        durationSeconds: Math.round(input.durationSeconds * 10) / 10,
      },
      text: {
        mode: input.textMode,
        fontFamily: input.fontFamily,
        overlayPreset: input.overlayPreset,
        subtitlePreset: input.subtitlePreset,
        subtitleFontSizePx: input.subtitleFontSizePx,
        textMotionPreset: input.textMotionPreset,
        burnInSubtitles: input.burnInSubtitles,
        hookText: input.hookText,
        supportingText: input.supportingText,
      },
      audio: {
        audioPackPresetId: input.audioPackPresetId || null,
        musicPresetId: input.musicPresetId || null,
        sfxPresetIds: input.sfxPresetIds,
        sfxDrafts: input.sfxDrafts ?? [],
        preserveNativeAudio: input.preserveNativeAudio,
        syntheticAudioFallback: input.syntheticAudioFallback,
      },
      shots: input.shots.map((shot, index) => {
        const startSec = Math.max(0, Math.round(Number(shot.startSec ?? 0) * 10) / 10);
        const durationSeconds = normalizeHyperframesFinalPreviewShotDurationSeconds(shot);
        return {
          index,
          id: shot.id,
          sourceClipId: shot.sourceClipId || shot.id,
          sourceVideoRef: shot.sourceVideoRef || null,
          mediaStartSec: Math.max(0, Math.round(Number(shot.mediaStartSec ?? 0) * 10) / 10),
          startSec,
          endSec: Math.max(startSec + durationSeconds, Math.round(Number(shot.endSec ?? startSec + durationSeconds) * 10) / 10),
          durationSeconds,
          overlayPreset: shot.overlayPreset ?? input.overlayPreset,
          animationPreset: shot.animationPreset ?? "smooth_reveal",
          transition: shot.transition ?? "fade",
          textMotionPreset: shot.textMotionPreset ?? input.textMotionPreset,
          sourcePrompt: firstThaiProductLine(shot.prompt, 180),
          onScreenText: (shot.overlayLines ?? shot.overlayText.split(/\n+/))
            .map(line => compactStoryboardText(line))
            .filter(Boolean)
            .slice(0, getHyperframesOverlayLineLimit(shot.overlayPreset ?? input.overlayPreset)),
          subtitleCues: (shot.subtitleCues ?? [])
            .map(cue => ({
              startSec: Math.round(cue.startSec * 10) / 10,
              endSec: Math.round(cue.endSec * 10) / 10,
              text: compactStoryboardText(cue.text),
            }))
            .filter(cue => cue.text),
          subtitleText: shot.subtitleText
            .split(/\n+/)
            .map(line => compactStoryboardText(line))
            .filter(Boolean)
            .slice(0, 4),
          subtitleVtt: shot.subtitleVtt || null,
          subtitleSrt: shot.subtitleSrt || null,
        };
      }),
    },
    null,
    2,
  );
}

function buildPreviewMatchPayloadPreview(
  input: Parameters<typeof buildHyperframesFinalPayloadPreview>[0],
) {
  return buildPreviewMatchCompositionPayloadFromHyperframesPreview(
    JSON.parse(buildHyperframesFinalPayloadPreview(input)),
  );
}

function extractHyperframesPromptFromSkillMessage(message: string | undefined | null): string {
  const trimmed = String(message ?? "").trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      const prompt = (parsed as Record<string, unknown>).prompt;
      if (typeof prompt === "string" && prompt.trim()) return prompt.trim();
      const renderPrompt = (parsed as Record<string, unknown>).renderPrompt;
      if (typeof renderPrompt === "string" && renderPrompt.trim()) return renderPrompt.trim();
    }
  } catch {
    // LLM skills may return plain text or fenced JSON.
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced);
      const prompt = parsed && typeof parsed === "object"
        ? ((parsed as Record<string, unknown>).prompt ?? (parsed as Record<string, unknown>).renderPrompt)
        : null;
      if (typeof prompt === "string" && prompt.trim()) return prompt.trim();
    } catch {
      return fenced;
    }
  }
  return trimmed;
}

function isHyperframesFinalCompositeRender(
  render?: HyperframesRenderStatusProjection | null,
): render is HyperframesRenderStatusProjection {
  return (
    render?.compositionMode === "captioned_final_composite" ||
    render?.renderIntent === "final"
  );
}

function isTerminalHyperframesRenderStatus(status?: string | null): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return [
    "completed",
    "saved_to_library",
    "failed",
    "failed_permanent",
    "dead_lettered",
    "cancelled",
    "canceled",
    "blocked_needs_user",
    "compliance_blocked",
    "not_available",
  ].includes(normalized);
}

function isSyntheticHyperframesRuntimeBlockedJobId(renderJobId?: string | null): boolean {
  return /^hf_final_runtime_blocked_/.test(String(renderJobId ?? "").trim());
}

function isTrackableHyperframesRenderJobId(renderJobId?: string | null): boolean {
  const normalized = String(renderJobId ?? "").trim();
  return Boolean(normalized) && !isSyntheticHyperframesRuntimeBlockedJobId(normalized);
}

function formatHyperframesFinalCompositeStatus(
  render: HyperframesRenderStatusProjection | null,
  locale: string,
): string | null {
  if (!render) return null;
  const status = getHyperframesFinalCompositeStatusLabel(render.status, locale);
  const progress = Math.round(render.progressPercent);
  const prefix = locale === "th" ? "สถานะ Final Composite" : "Final Composite status";
  return `${prefix}: ${status} · ${progress}%`;
}

function getHyperframesFinalCompositeStatusLabel(status: string, locale: string): string {
  const normalized = status.trim().toLowerCase();
  const labels: Record<string, { th: string; en: string }> = {
    queued: { th: "รอคิว render", en: "Queued" },
    staging_assets: { th: "กำลังเตรียม asset", en: "Staging assets" },
    linting: { th: "กำลังตรวจ composition", en: "Checking composition" },
    rendering: { th: "กำลัง render ด้วย CSS runtime", en: "Rendering with CSS runtime" },
    inspecting: { th: "กำลังตรวจไฟล์วิดีโอ", en: "Inspecting output" },
    completed: { th: "render สำเร็จ", en: "Completed" },
    saved_to_library: { th: "บันทึกเข้า Library แล้ว", en: "Saved to Library" },
    blocked_needs_user: { th: "ต้องแก้ไขก่อน render ต่อ", en: "Action required" },
    compliance_blocked: { th: "ต้องตรวจ policy ก่อน render", en: "Compliance review required" },
    stale_input_hash: { th: "ข้อมูลเปลี่ยน ต้อง render ใหม่", en: "Input changed, render again" },
    dead_lettered: { th: "งานล้มเหลวถาวร", en: "Dead lettered" },
    failed: { th: "render ไม่สำเร็จ", en: "Failed" },
    failed_permanent: { th: "render ไม่สำเร็จถาวร", en: "Permanently failed" },
    cancelled: { th: "ยกเลิกแล้ว", en: "Cancelled" },
    canceled: { th: "ยกเลิกแล้ว", en: "Cancelled" },
    not_available: { th: "ยังไม่มีงาน render", en: "Not available" },
  };
  const copy = labels[normalized];
  if (copy) return locale === "th" ? copy.th : copy.en;
  return normalized.replace(/_/g, " ");
}

function formatHyperframesRenderElapsed(
  render: HyperframesRenderStatusProjection | null,
  locale: string,
): string | null {
  const startedAt = render?.createdAt ?? render?.updatedAt;
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return null;
  const end = isTerminalHyperframesRenderStatus(render?.status)
    ? new Date(render?.updatedAt ?? startedAt).getTime()
    : Date.now();
  if (!Number.isFinite(end) || end < start) return null;
  const totalSeconds = Math.max(0, Math.round((end - start) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (locale === "th") {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const restMinutes = minutes % 60;
      return restMinutes > 0 ? `${hours} ชม. ${restMinutes} นาที` : `${hours} ชม.`;
    }
    return minutes > 0 ? `${minutes} นาที ${seconds} วิ` : `${seconds} วิ`;
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`;
  }
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatStoryboardCaptureElapsedSeconds(
  totalSeconds: number | null | undefined,
  locale: string,
): string | null {
  if (!Number.isFinite(totalSeconds ?? NaN)) return null;
  const safeSeconds = Math.max(0, Math.round(totalSeconds ?? 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (locale === "th") {
    if (hours > 0) {
      return minutes > 0 ? `${hours} ชม. ${minutes} นาที` : `${hours} ชม.`;
    }
    return minutes > 0 ? `${minutes} นาที ${seconds} วิ` : `${seconds} วิ`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatLocalRenderDateTime(value: string, locale: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function getHyperframesPrimaryVideoOutput(render: HyperframesRenderStatusProjection | null) {
  const outputRefs = Array.isArray(render?.outputRefs) ? render.outputRefs : [];
  return outputRefs.find(ref =>
    (ref.kind === "final_video" ||
      ref.kind === "preview_video" ||
      ref.kind === "library_item") &&
    typeof ref.url === "string" &&
    ref.url.trim().length > 0
  ) ?? null;
}

function subtitleCuesFromEditableText(
  text: string,
  startSec: number,
  durationSec: number,
): HyperframesFinalCompositeConfig["shots"][number]["subtitleCues"] {
  return buildHyperframesSubtitleCuesFromEditableText(text, startSec, durationSec);
}

function defaultHyperframesFinalSfxTrigger(presetId: string): HyperframesFinalSfxTrigger {
  if (/cash_register|sales|price/i.test(presetId)) return "price_badge_pop";
  if (/button|tap/i.test(presetId)) return "button_depress";
  if (/riser|reveal/i.test(presetId)) return "product_reveal";
  if (/notification|message/i.test(presetId)) return "text_appears";
  return "scene_cut";
}

function defaultHyperframesFinalSfxRole(presetId: string): HyperframesFinalSfxRole {
  if (/cash_register|sales|price|impact|riser|reveal/i.test(presetId)) return "accent_sfx";
  if (/button|tap|click/i.test(presetId)) return "ui_sfx";
  return "transition_sfx";
}

function defaultHyperframesFinalSfxTarget(presetId: string): HyperframesFinalSfxTarget {
  if (/cash_register|sales|price|cta/i.test(presetId)) return "last";
  if (/riser|reveal/i.test(presetId)) return "first";
  return "all";
}

function buildDefaultHyperframesFinalSfxDraft(presetId: string, index: number): HyperframesFinalSfxDraft {
  const trigger = defaultHyperframesFinalSfxTrigger(presetId);
  return {
    id: `sfx_draft_${index + 1}_${presetId.replace(/[^a-z0-9_-]/gi, "_")}`,
    presetId,
    target: defaultHyperframesFinalSfxTarget(presetId),
    visualTrigger: trigger,
    offsetSec: trigger === "price_badge_pop" || trigger === "sales_number_lock" ? 1.2 : 0.2,
    durationSec: trigger === "price_badge_pop" || trigger === "sales_number_lock" ? 0.45 : 0.22,
    volume: trigger === "price_badge_pop" || trigger === "sales_number_lock" ? 0.32 : 0.22,
    role: defaultHyperframesFinalSfxRole(presetId),
  };
}

function resolveHyperframesFinalSfxTargetShots(
  target: HyperframesFinalSfxTarget,
  shots: HyperframesFinalCompositeConfig["shots"],
): HyperframesFinalCompositeConfig["shots"] {
  if (target === "all") return shots;
  if (target === "first") return shots.slice(0, 1);
  if (target === "last") return shots.slice(-1);
  return shots.filter(shot => shot.id === target);
}

function buildHyperframesFinalAudioEvents(input: {
  finalVideoLengthSec: number;
  shots: HyperframesFinalCompositeConfig["shots"];
  musicPresetId?: string;
  sfxPresetIds: string[];
  sfxDrafts?: HyperframesFinalSfxDraft[];
}): HyperframesAudioEvent[] {
  const events: HyperframesAudioEvent[] = [];
  const musicPresetId = input.musicPresetId?.trim();
  if (musicPresetId) {
    events.push({
      id: "music_bed_main",
      role: "music",
      presetId: musicPresetId,
      visualTrigger: "video_start",
      startSec: 0,
      durationSec: Math.max(1, Math.round(input.finalVideoLengthSec * 10) / 10),
      volume: 0.18,
      assetRef: `/api/storage/hyperframes/audio-presets/${musicPresetId}.wav`,
      notes: "Background bed. FFmpeg fallback uses deterministic synthetic audio unless a staged licensed asset is supplied.",
    });
  }

  const selectedSfx = input.sfxDrafts && input.sfxDrafts.length > 0
    ? input.sfxDrafts
    : input.sfxPresetIds.map((id, index) => buildDefaultHyperframesFinalSfxDraft(id.trim(), index));
  selectedSfx.filter(draft => draft.presetId.trim()).slice(0, 12).forEach((draft, sfxIndex) => {
    const presetId = draft.presetId.trim();
    const isPrice = /cash_register|sales|price/i.test(presetId);
    const trigger = draft.visualTrigger || defaultHyperframesFinalSfxTrigger(presetId);
    const targetShots = resolveHyperframesFinalSfxTargetShots(draft.target || (isPrice ? "last" : "all"), input.shots);
    targetShots.forEach((shot, shotIndex) => {
      const fallbackOffset = isPrice ? Math.max(0.8, shot.durationSec * 0.48) : shotIndex === 0 ? 0.2 : 0;
      const startSec = shot.startSec + Math.max(0, Math.min(shot.durationSec, Number.isFinite(draft.offsetSec) ? draft.offsetSec : fallbackOffset));
      events.push({
        id: `sfx_${sfxIndex + 1}_${shot.id}_${shotIndex + 1}`,
        role: draft.role || (isPrice ? "accent_sfx" : "transition_sfx"),
        presetId,
        visualTrigger: trigger,
        startSec: Math.round(startSec * 10) / 10,
        durationSec: Math.max(0.05, Math.round((draft.durationSec || (isPrice ? 0.45 : 0.22)) * 100) / 100),
        volume: Math.max(0, Math.min(1, draft.volume || (isPrice ? 0.32 : 0.22))),
        assetRef: `/api/storage/hyperframes/audio-presets/${presetId}.wav`,
        notes: `SFX follows ${trigger} on ${draft.target || "all"} and is ducked under native audio in fallback mode.`,
      });
    });
  });
  return events.slice(0, 80);
}

function normalizeStoryboardProviderTaskStatus(value: unknown): StoryboardProviderTaskStatus {
  const status = String(value ?? "").trim().toLowerCase();
  if (["completed", "complete", "done", "success", "succeeded"].includes(status)) return "completed";
  if (["failed", "failure", "error", "errored"].includes(status)) return "failed";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  if (["queued", "pending", "created", "submitted", "scheduled", "deferred"].includes(status)) return "queued";
  return "processing";
}

function getStoryboardTaskPollId(task: Pick<StoryboardGenerationTask, "backendTaskId" | "providerTaskId">): string {
  return String(task.providerTaskId || task.backendTaskId || "").trim();
}

function parseReviewIdFromSearch(search: string): number | null {
  const params = new URLSearchParams(search);
  const raw = params.get("reviewId");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function parseReviewIdFromPathname(pathname: string): number | null {
  const match = pathname.match(/^\/storyboard-review\/(\d+)(?:\/)?$/);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function asLegacyObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeLegacyReviewData(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? asLegacyObject(parsed) : null;
    } catch {
      return null;
    }
  }
  const objectValue = asLegacyObject(value);
  return Object.keys(objectValue).length > 0 ? objectValue : null;
}

function normalizeServerStoryboardReviewDraft(
  reviewRecord: Record<string, any> | null | undefined,
  reviewId: number,
): StoryboardReviewDraft | null {
  if (!reviewRecord || Number(reviewRecord.id) !== reviewId) return null;
  const parsedLegacyData = normalizeLegacyReviewData(reviewRecord.reviewData);
  const nextDraft = normalizeStoryboardReviewDraft(reviewRecord.reviewData)
    ?? (parsedLegacyData ? normalizeLegacyStoryboardReviewDraft(parsedLegacyData, reviewId) : null);
  return nextDraft ? {
    ...nextDraft,
    reviewId,
    name: nextDraft.name ?? (typeof reviewRecord.name === "string" ? reviewRecord.name : null),
  } : null;
}

function normalizeLegacyStoryboardTaskStatus(value: unknown): StoryboardGenerationTask["status"] {
  if (typeof value !== "string") return "queued";
  const status = value.trim().toLowerCase();
  if (["completed", "complete", "done", "success", "succeeded"].includes(status)) return "completed";
  if (["failed", "failure", "error", "errored"].includes(status)) return "error";
  if (["processing", "running", "generating", "active", "in_progress"].includes(status)) return "generating";
  if (["pending", "queued", "created", "submitted", "scheduled", "deferred"].includes(status)) return "queued";
  return "queued";
}

function asLegacyReviewValue(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text.length > 0 ? text : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asLegacyImageUrl(value: unknown): string | null {
  const text = asLegacyReviewValue(value);
  return text && isProbablyImageUrl(text) ? text : null;
}

function asNumberValue(value: unknown): number | null {
  const num = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value)
      : NaN;
  return Number.isFinite(num) ? num : null;
}

function normalizeLegacyStoryboardReviewTask(
  rawTask: unknown,
  index: number,
): StoryboardGenerationTask | null {
  const task = asLegacyObject(rawTask);
  const taskId = asLegacyReviewValue(task.id) ?? `legacy-task-${index + 1}`;
  const prompt = asLegacyReviewValue(task.prompt)
    ?? asLegacyReviewValue(task.videoPrompt)
    ?? asLegacyReviewValue(task.title)
    ?? `Clip ${index + 1}`;
  const inferredAspectRatio = asLegacyReviewValue(task.aspectRatio)
    ?? asLegacyReviewValue(task.aspect_ratio)
    ?? "16:9";
  const url = asLegacyReviewValue(task.url)
    ?? asLegacyReviewValue(task.resultUrl)
    ?? asLegacyReviewValue(task.videoUrl);
  const rawType = asLegacyReviewValue(task.type)?.toLowerCase();

  return {
    id: taskId,
    index: Number.isFinite(asNumberValue(task.index) ?? asNumberValue(task.order))
      ? Math.max(Math.trunc(asNumberValue(task.index) ?? asNumberValue(task.order) ?? index), 0)
      : index,
    status: normalizeLegacyStoryboardTaskStatus(task.status),
    type: (rawType === "image" || rawType === "img" || isProbablyImageUrl(url ?? "") || Boolean(asLegacyImageUrl(task.thumbnailUrl)))
      ? "image"
      : "video",
    prompt,
    model: asLegacyReviewValue(task.model) ?? "",
    durationSeconds: asNumberValue(task.durationSeconds) ?? asNumberValue(task.duration) ?? undefined,
    createdAt: asNumberValue(task.createdAt) ?? asNumberValue(task.created_at) ?? Date.now(),
    updatedAt: asNumberValue(task.updatedAt) ?? asNumberValue(task.updated_at) ?? Date.now(),
    url: url ? normalizeStoryboardMediaUrl(url) : undefined,
    statusDetail: asLegacyReviewValue(task.statusDetail) ?? asLegacyReviewValue(task.status_detail) ?? undefined,
    storyboardContext: {
      aspectRatio: inferredAspectRatio,
      duration: asNumberValue(task.duration) ?? asNumberValue(task.durationSeconds) ?? asNumberValue(task.duration_seconds) ?? undefined,
      referenceImages: [
        asLegacyImageUrl(task.startFrameUrl),
        asLegacyImageUrl(task.stopFrameUrl),
        asLegacyImageUrl(task.referenceImageUrl),
        asLegacyImageUrl(task.thumbnailUrl),
      ]
        .filter(Boolean)
        .map((item) => ({ url: item as string })),
      referenceVideos: [asLegacyImageUrl(task.referenceVideoUrl)]
        .filter(Boolean)
        .map((item) => ({ url: item as string })),
      apiConfig: {},
      extraParams: {
        ...(asLegacyObject(task.metadata)),
      },
    },
  };
}

function normalizeLegacyStoryboardReviewDraft(
  rawData: unknown,
  reviewId: number,
): StoryboardReviewDraft | null {
  const record = normalizeLegacyReviewData(rawData);
  if (!record) return null;
  const tasksInput = Array.isArray(record.tasks)
    ? record.tasks
    : Array.isArray(record.clips)
      ? record.clips
      : [];
  if (!Array.isArray(tasksInput) || tasksInput.length === 0) return null;

  const tasks = tasksInput
    .map((task, index) => normalizeLegacyStoryboardReviewTask(task, index))
    .filter((task): task is StoryboardGenerationTask => Boolean(task));
  if (tasks.length === 0) return null;

  const taskIds = tasks.map((task) => task.id);
  const selectedTaskIds = Array.isArray(record.selectedTaskIds)
    ? record.selectedTaskIds.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  const storyBible = asLegacyObject(record.storyBible);
  const conceptDetails = asLegacyReviewValue(record.conceptDetails)
    ?? asLegacyReviewValue(storyBible.productDetail)
    ?? asLegacyReviewValue(storyBible.conceptId)
    ?? null;
  const storyboardGuide = asLegacyReviewValue(record.storyboardGuide)
    ?? asLegacyReviewValue(storyBible.storyboardGuide)
    ?? null;
  const voiceoverFullScript = asLegacyReviewValue(record.voiceoverScript)
    ?? asLegacyReviewValue(record.voiceoverFullScript)
    ?? asLegacyReviewValue(storyBible.voiceoverScript)
    ?? null;
  const marketplaceContext = asLegacyObject(record.marketplaceProduct);
  const productionContext = asLegacyObject(record.productionContext);
  const updatedAt = asNumberValue(record.updatedAt) ?? asNumberValue(record.updated_at) ?? Date.now();

  return {
    version: 1,
    reviewId,
    name: asLegacyReviewValue(record.name) ?? `Storyboard review ${reviewId}`,
    updatedAt,
    taskIds,
    selectedTaskIds,
    tasks,
    companionAudio: [],
    companionAudioUpdatedAt: null,
    compoundStatus: null,
    projectLink: null,
    renderJobId: asLegacyReviewValue(record.renderJobId),
    marketplaceContext: Object.keys(marketplaceContext).length > 0
      ? marketplaceContext as unknown as StoryboardReviewDraft["marketplaceContext"]
      : null,
    productionContext: Object.keys(productionContext).length > 0
      ? productionContext as unknown as StoryboardReviewDraft["productionContext"]
      : null,
    conceptDetails,
    storyboardGuide,
    voiceoverFullScript,
    useVoiceoverScriptAsConcept: Boolean(record.useVoiceoverScriptAsConcept),
  };
}

function storyboardTaskTracksPollId(task: StoryboardGenerationTask, pollId: string): boolean {
  const normalizedPollId = pollId.trim();
  return normalizedPollId.length > 0
    && [task.providerTaskId, task.backendTaskId].some((value) => String(value || "").trim() === normalizedPollId);
}

function extractStoryboardProviderTaskError(task: unknown, fallback: string): string {
  if (!task || typeof task !== "object") return fallback;
  const record = task as Record<string, unknown>;
  for (const key of ["errorMessage", "error", "message", "statusDetail", "resultData"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function updateTrackedStoryboardGenerationTask(
  draft: StoryboardReviewDraft,
  taskId: string,
  pollId: string,
  updates: Partial<StoryboardGenerationTask>,
): StoryboardReviewDraft {
  let changed = false;
  const tasks = draft.tasks.map((task) => {
    if (task.id !== taskId || !storyboardTaskTracksPollId(task, pollId)) return task;
    const hasTaskChange = Object.entries(updates).some(([key, value]) => (
      (task as unknown as Record<string, unknown>)[key] !== value
    ));
    if (!hasTaskChange) return task;
    changed = true;
    return { ...task, ...updates, updatedAt: Date.now() };
  });
  return changed ? { ...draft, updatedAt: Date.now(), tasks } : draft;
}

function summarizeStoryboardAudioForDebug(audio: Partial<StoryboardCompanionAudioCandidate> | null | undefined) {
  if (!audio) return null;
  return {
    id: typeof audio.id === "string" ? audio.id : null,
    title: typeof audio.title === "string" ? audio.title.slice(0, 140) : null,
    model: typeof audio.model === "string" ? audio.model.slice(0, 100) : null,
    kind: typeof audio.kind === "string" ? audio.kind : null,
    actualDurationSeconds: typeof audio.actualDurationSeconds === "number" ? audio.actualDurationSeconds : null,
    targetDurationSeconds: typeof audio.targetDurationSeconds === "number" ? audio.targetDurationSeconds : null,
    createdAt: typeof audio.createdAt === "number" ? audio.createdAt : null,
    updatedAt: typeof audio.updatedAt === "number" ? audio.updatedAt : null,
  };
}

function summarizeStoryboardDraftForDebug(draft: Partial<StoryboardReviewDraft> | null | undefined) {
  const companionAudio = Array.isArray(draft?.companionAudio) ? draft.companionAudio : [];
  const taskIds = Array.isArray(draft?.taskIds) ? draft.taskIds : [];
  const selectedTaskIds = Array.isArray(draft?.selectedTaskIds) ? draft.selectedTaskIds : [];
  return {
    exists: Boolean(draft),
    reviewId: typeof draft?.reviewId === "number" ? draft.reviewId : null,
    updatedAt: typeof draft?.updatedAt === "number" ? draft.updatedAt : null,
    companionAudioUpdatedAt: typeof draft?.companionAudioUpdatedAt === "number" ? draft.companionAudioUpdatedAt : null,
    hasExplicitCompanionAudioUpdatedAt: typeof draft?.companionAudioUpdatedAt === "number",
    audioCount: companionAudio.length,
    audio: companionAudio.slice(0, 4).map(summarizeStoryboardAudioForDebug),
    taskCount: Array.isArray(draft?.tasks) ? draft.tasks.length : 0,
    taskIdsFirst: taskIds.slice(0, 8),
    selectedCount: selectedTaskIds.length,
    renderJobId: typeof draft?.renderJobId === "string" ? draft.renderJobId : null,
  };
}

function buildStoryboardReviewDebugSource(source: string, draft: Partial<StoryboardReviewDraft> | null | undefined) {
  const companionAudio = Array.isArray(draft?.companionAudio) ? draft.companionAudio : [];
  return {
    source,
    build: STORYBOARD_REVIEW_PAGE_DEBUG_BUILD,
    reviewId: typeof draft?.reviewId === "number" ? draft.reviewId : null,
    updatedAt: typeof draft?.updatedAt === "number" ? draft.updatedAt : null,
    companionAudioUpdatedAt: typeof draft?.companionAudioUpdatedAt === "number" ? draft.companionAudioUpdatedAt : null,
    audioCount: companionAudio.length,
    audioIds: companionAudio.map((audio) => audio.id).slice(0, 5),
    audioTitles: companionAudio.map((audio) => audio.title).slice(0, 5),
    audioModels: companionAudio.map((audio) => audio.model).slice(0, 5),
  };
}

function updateDraftTask(draft: StoryboardReviewDraft, taskId: string, updates: Partial<StoryboardGenerationTask>): StoryboardReviewDraft {
  return {
    ...draft,
    updatedAt: Date.now(),
    tasks: draft.tasks.map((task) => task.id === taskId ? { ...task, ...updates, updatedAt: Date.now() } : task),
  };
}

function isDraftNewerThan(a: StoryboardReviewDraft | null | undefined, b: StoryboardReviewDraft | null | undefined): boolean {
  return (a?.updatedAt ?? 0) > (b?.updatedAt ?? 0);
}

function getStoryboardDraftContentSignature(draft: StoryboardReviewDraft | null | undefined): string {
  if (!draft) return "null";

  const tasks = Array.isArray(draft.tasks) ? draft.tasks : [];
  const companionAudio = Array.isArray(draft.companionAudio) ? draft.companionAudio : [];

  try {
    return JSON.stringify({
      reviewId: draft.reviewId ?? null,
      name: draft.name ?? null,
      taskIds: Array.isArray(draft.taskIds) ? draft.taskIds : [],
      selectedTaskIds: Array.isArray(draft.selectedTaskIds) ? draft.selectedTaskIds : [],
      compoundStatus: draft.compoundStatus ?? null,
      projectLink: draft.projectLink ?? null,
      renderJobId: draft.renderJobId ?? null,
      marketplaceContext: draft.marketplaceContext ?? null,
      manualHyperframesProductId: draft.manualHyperframesProductId ?? null,
      manualHyperframesRunId: draft.manualHyperframesRunId ?? null,
      productionContext: draft.productionContext ?? null,
      conceptDetails: draft.conceptDetails ?? null,
      storyboardGuide: draft.storyboardGuide ?? null,
      voiceoverFullScript: draft.voiceoverFullScript ?? null,
      useVoiceoverScriptAsConcept: Boolean(draft.useVoiceoverScriptAsConcept),
      videoSegmentState: draft.videoSegmentState ?? null,
      companionAudio: companionAudio.map((audio) => ({
        id: audio.id,
        title: audio.title,
        url: audio.url,
        prompt: audio.prompt,
        model: audio.model,
        kind: audio.kind,
        startTimeSeconds: audio.startTimeSeconds ?? null,
        segmentIndex: audio.segmentIndex ?? null,
        segmentCount: audio.segmentCount ?? null,
        actualDurationSeconds: audio.actualDurationSeconds ?? null,
        targetDurationSeconds: audio.targetDurationSeconds ?? null,
        volume: audio.volume ?? null,
      })),
      tasks: tasks.map((task) => ({
        id: task.id,
        index: task.index,
        status: task.status,
        type: task.type,
        prompt: task.prompt,
        model: task.model,
        durationSeconds: task.durationSeconds ?? null,
        transition: task.transition ?? null,
        url: task.url ?? null,
        error: task.error ?? null,
        backendTaskId: task.backendTaskId ?? null,
        providerTaskId: task.providerTaskId ?? null,
        statusDetail: task.statusDetail ?? null,
        source: task.source ?? null,
        aspectRatio: task.aspectRatio ?? null,
        storyboardContext: task.storyboardContext ?? null,
        transportMetadata: task.transportMetadata ?? null,
        marketplaceProduct: task.marketplaceProduct ?? null,
        productionContext: task.productionContext ?? null,
      })),
    });
  } catch {
    return [
      draft.reviewId ?? "",
      draft.taskIds?.length ?? 0,
      draft.selectedTaskIds?.length ?? 0,
      tasks.length,
      companionAudio.length,
      draft.renderJobId ?? "",
    ].join("|");
  }
}

function storyboardDraftContentMatches(
  a: StoryboardReviewDraft | null | undefined,
  b: StoryboardReviewDraft | null | undefined,
): boolean {
  if (!a || !b) return false;
  return getStoryboardDraftContentSignature(a) === getStoryboardDraftContentSignature(b);
}

function preferCanonicalServerCompanionAudio(
  localDraft: StoryboardReviewDraft | null | undefined,
  serverDraft: StoryboardReviewDraft | null | undefined,
  mergedDraft: StoryboardReviewDraft | null | undefined,
): StoryboardReviewDraft | null {
  if (!mergedDraft) return null;
  if (!serverDraft || !mergedDraft) return mergedDraft;
  const serverCompanionAudioUpdatedAt = getStoryboardCompanionAudioUpdatedAt(serverDraft);
  const localCompanionAudioUpdatedAt = getStoryboardCompanionAudioUpdatedAt(localDraft);
  if (serverCompanionAudioUpdatedAt <= 0 || serverCompanionAudioUpdatedAt < localCompanionAudioUpdatedAt) {
    return mergedDraft;
  }

  return {
    ...mergedDraft,
    companionAudio: serverDraft.companionAudio,
    companionAudioUpdatedAt: serverDraft.companionAudioUpdatedAt,
  };
}

function ensureDraftNewerThan(next: StoryboardReviewDraft, current: StoryboardReviewDraft): StoryboardReviewDraft {
  if (next.updatedAt > current.updatedAt) return next;
  return {
    ...next,
    updatedAt: Math.max(Date.now(), current.updatedAt + 1),
  };
}

function formatStoryboardRenderOutputLabel(mode: Exclude<StoryboardRenderAspectRatioMode, "auto">): string {
  const resolution = getStoryboardRenderResolution(mode);
  return `${mode} · ${resolution.width}x${resolution.height}`;
}

function normalizeDraftTaskOrder(draft: StoryboardReviewDraft, orderedTaskIds: string[]): StoryboardReviewDraft {
  const order = new Map(orderedTaskIds.map((id, index) => [id, index]));
  const taskById = new Map(draft.tasks.map((task) => [task.id, task]));
  const orderedTasks = orderedTaskIds
    .map((id) => taskById.get(id))
    .filter((task): task is StoryboardGenerationTask => Boolean(task))
    .map((task, index) => ({ ...task, index, updatedAt: Date.now() }));
  const orphanTasks = draft.tasks.filter((task) => !order.has(task.id));
  return {
    ...draft,
    updatedAt: Date.now(),
    taskIds: orderedTaskIds,
    selectedTaskIds: draft.selectedTaskIds.filter((id) => order.has(id)),
    tasks: [...orderedTasks, ...orphanTasks],
  };
}

function extractDurationSeconds(value: unknown, depth = 0): number | undefined {
  if (!value || depth > 4) return undefined;

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value > 1000 ? value / 1000 : value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractDurationSeconds(item, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  if (typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of [
    "durationSeconds",
    "duration_seconds",
    "actualDurationSeconds",
    "actual_duration_seconds",
    "actual_duration",
    "duration",
    "durationSec",
    "duration_sec",
  ]) {
    const found = extractDurationSeconds(record[key], depth + 1);
    if (found !== undefined) return found;
  }

  for (const key of ["durationMs", "duration_ms"]) {
    const raw = record[key];
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return raw / 1000;
    }
  }

  for (const key of ["metadata", "parameters", "resultData", "result_data", "data", "media", "asset"]) {
    const found = extractDurationSeconds(record[key], depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function createImportedMediaTask(input: {
  idPrefix: string;
  title: string;
  url: string;
  mediaType: StoryboardClipMediaType;
  model?: string | null;
  importedLabel?: string;
  importedClipLabel?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  index: number;
}): StoryboardGenerationTask {
  const now = Date.now();
  return {
    id: `${input.idPrefix}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    index: input.index,
    status: "completed",
    type: input.mediaType,
    prompt: input.title.trim() || `${input.importedClipLabel ?? "Imported clip"} ${input.index + 1}`,
    model: input.model?.trim() || (input.importedLabel ?? "Imported"),
    durationSeconds: input.durationSeconds,
    aspectRatio: input.aspectRatio,
    createdAt: now,
    updatedAt: now,
    url: normalizeStoryboardMediaUrl(input.url),
    source: "imported",
    statusDetail: input.importedClipLabel ?? "Imported clip",
  };
}

function createImportedAudioTrack(input: {
  idPrefix: string;
  title: string;
  url: string;
  model?: string | null;
  importedLabel?: string;
  importedAudioLabel?: string;
  kind?: StoryboardCompanionAudioCandidate["kind"];
  durationSeconds?: number;
  targetDurationSeconds?: number;
}): StoryboardCompanionAudioCandidate {
  const now = Date.now();
  return {
    id: `${input.idPrefix}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    url: normalizeStoryboardMediaUrl(input.url),
    title: input.title.trim() || (input.importedAudioLabel ?? "Imported audio"),
    prompt: input.title.trim() || (input.importedAudioLabel ?? "Imported audio"),
    model: input.model?.trim() || (input.importedLabel ?? "Imported"),
    kind: input.kind ?? "music",
    startTimeSeconds: 0,
    actualDurationSeconds: input.durationSeconds,
    targetDurationSeconds: input.targetDurationSeconds,
    volume: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function buildHyperframesSelectedVideoOverlayFrameVars(
  stage: HTMLElement | null,
  video: HTMLVideoElement | null,
): CSSProperties | null {
  if (!stage) return null;
  const stageRect = stage.getBoundingClientRect();
  const videoBoxRect = video?.getBoundingClientRect();
  const boxLeft = videoBoxRect && videoBoxRect.width > 0 ? videoBoxRect.left - stageRect.left : 0;
  const boxTop = videoBoxRect && videoBoxRect.height > 0 ? videoBoxRect.top - stageRect.top : 0;
  const boxWidth = videoBoxRect?.width && videoBoxRect.width > 0 ? videoBoxRect.width : stageRect.width;
  const boxHeight = videoBoxRect?.height && videoBoxRect.height > 0 ? videoBoxRect.height : stageRect.height;
  if (boxWidth <= 0 || boxHeight <= 0) return null;

  const safeX = Math.max(16, Math.round(boxWidth * 0.035));
  const safeTop = Math.max(48, Math.round(boxHeight * 0.125));
  const safeBottom = Math.max(138, Math.round(boxHeight * 0.34));
  const subtitleX = Math.max(18, Math.round(boxWidth * 0.055));
  const subtitleBottom = Math.max(150, Math.round(boxHeight * 0.32));
  const statusX = Math.max(12, Math.round(boxWidth * 0.03));
  const statusTop = Math.max(12, Math.round(boxHeight * 0.03));
  return {
    "--hf-video-overlay-left": `${Math.round(boxLeft + safeX)}px`,
    "--hf-video-overlay-top": `${Math.round(boxTop + safeTop)}px`,
    "--hf-video-overlay-width": `${Math.max(80, Math.round(boxWidth - safeX * 2))}px`,
    "--hf-video-overlay-height": `${Math.max(80, Math.round(boxHeight - safeTop - safeBottom))}px`,
    "--hf-video-subtitle-left": `${Math.round(boxLeft + subtitleX)}px`,
    "--hf-video-subtitle-bottom": `${Math.round(stageRect.height - (boxTop + boxHeight) + subtitleBottom)}px`,
    "--hf-video-subtitle-width": `${Math.max(80, Math.round(boxWidth - subtitleX * 2))}px`,
    "--hf-video-status-left": `${Math.round(boxLeft + statusX)}px`,
    "--hf-video-status-top": `${Math.round(boxTop + statusTop)}px`,
    "--hf-video-status-width": `${Math.max(80, Math.round(boxWidth - statusX * 2))}px`,
  } as CSSProperties;
}

function createManualStoryboardReviewDraft(locale: string): StoryboardReviewDraft {
  const now = Date.now();
  const suffix = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  const name = locale === "th" ? "Manual Storyboard Project" : "Manual Storyboard Project";
  const taskIds = Array.from({ length: 6 }, (_, index) => `manual-shot-${index + 1}-${suffix}`);
  const tasks: StoryboardGenerationTask[] = taskIds.map((id, index) => ({
    id,
    index,
    status: "queued",
    type: "video",
    prompt: locale === "th"
      ? `Shot ${index + 1}: ลากวิดีโอหรือภาพมาวาง แล้วเขียน prompt เอง`
      : `Shot ${index + 1}: drag in video or image media, then write the prompt manually.`,
    model: "Manual storyboard",
    durationSeconds: DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS,
    aspectRatio: "9:16",
    createdAt: now,
    updatedAt: now,
    source: "imported",
    statusDetail: locale === "th" ? "รอเพิ่ม media" : "Waiting for media",
  }));

  return {
    version: 1,
    reviewId: null,
    name,
    updatedAt: now,
    taskIds,
    selectedTaskIds: taskIds,
    tasks,
    companionAudio: [],
    companionAudioUpdatedAt: null,
    compoundStatus: null,
    projectLink: null,
    renderJobId: null,
    marketplaceContext: null,
    manualHyperframesProductId: MANUAL_STORYBOARD_MOCKUP_PRODUCT_ID,
    manualHyperframesRunId: `manual_storyboard_run_${suffix}`,
    productionContext: {
      productionRunId: `manual_storyboard_run_${suffix}`,
      productionProjectTitle: name,
      productionStoryConceptTitle: name,
      videoConcept: locale === "th"
        ? "Manual Storyboard Review workspace สำหรับลาก media เองและ render ด้วย HyperFrames"
        : "Manual Storyboard Review workspace for user-managed media and HyperFrames rendering.",
    },
    conceptDetails: "",
    storyboardGuide: "",
    voiceoverFullScript: "",
    useVoiceoverScriptAsConcept: false,
  };
}

export default function StoryboardReviewPage() {
  const [location, setLocation] = useLocation();
  const { t, locale } = useScopedTranslation(["media", "common"]);
  const [, routeParams] = useRoute("/storyboard-review/:reviewId");
  const search = useSearch();
  const queryReviewId = parseReviewIdFromSearch(search);
  const pathReviewId = typeof window === "undefined"
    ? null
    : parseReviewIdFromPathname(window.location.pathname);
  const parsedReviewId = routeParams?.reviewId ? Number(routeParams.reviewId) : null;
  const reviewId = typeof parsedReviewId === "number" && Number.isFinite(parsedReviewId) && parsedReviewId > 0
    ? parsedReviewId
    : pathReviewId
      ? pathReviewId
    : queryReviewId;
  const trpcUtils = trpc.useUtils();

  const [draft, setDraft] = useState<StoryboardReviewDraft | null>(() => {
    if (!reviewId) return null;
    const storedDraft = readStoryboardReviewDraft();
    return storedDraft?.reviewId === reviewId ? storedDraft : null;
  });
  const [regeneratingTaskId, setRegeneratingTaskId] = useState<string | null>(null);
  const [regeneratingVideoSegmentPromptTaskId, setRegeneratingVideoSegmentPromptTaskId] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isCreatingManualReviewProject, setIsCreatingManualReviewProject] = useState(false);
  const [isCompounding, setIsCompounding] = useState(false);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<StoryboardRightPanelTab>("history_gallery");
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(readStoredStoryboardReviewPanelCollapsed);
  const [rightPanelWidth, setRightPanelWidth] = useState(readStoredStoryboardReviewPanelWidth);
  const [mediaPickerKind, setMediaPickerKind] = useState<StoryboardMediaPickerKind>("video");
  const [audioSourceTab, setAudioSourceTab] = useState<StoryboardAudioSourceTab>("library");
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInputDeviceId, setSelectedAudioInputDeviceId] = useState("");
  const [microphoneStatus, setMicrophoneStatus] = useState<"idle" | "checking" | "ready" | "error">("idle");
  const [microphoneError, setMicrophoneError] = useState("");
  const [isRecordingVoiceover, setIsRecordingVoiceover] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [isProjectSidebarCollapsed, setIsProjectSidebarCollapsed] = useState(false);
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [isEditingVoiceoverSummary, setIsEditingVoiceoverSummary] = useState(false);
  const [voiceoverSummaryDraft, setVoiceoverSummaryDraft] = useState("");
  const [selectedLibraryItemId, setSelectedLibraryItemId] = useState<number | null>(null);
  const [replacingReferenceFrameKey, setReplacingReferenceFrameKey] = useState<string | null>(null);
  const [uploadingVideoSlotKey, setUploadingVideoSlotKey] = useState<string | null>(null);
  const [mediaAttachTargetTaskId, setMediaAttachTargetTaskId] = useState<string | null>(null);
  const [mediaAttachTargetFrameIndex, setMediaAttachTargetFrameIndex] = useState<0 | 1 | null>(null);
  const [isCancellingGeneration, setIsCancellingGeneration] = useState(false);
  const [renderAspectRatioMode, setRenderAspectRatioMode] = useState<StoryboardRenderAspectRatioMode>("auto");
  const [imageToolsSourceUrl, setImageToolsSourceUrl] = useState("");
  const [imageToolsSourceTitle, setImageToolsSourceTitle] = useState("");
  const [imageEditorMode, setImageEditorMode] = useState<StoryboardImageEditorMode>("split");
  const [splitGridRows, setSplitGridRows] = useState(3);
  const [splitGridCols, setSplitGridCols] = useState(3);
  const [splitPreviewUrl, setSplitPreviewUrl] = useState<string | null>(null);
  const [detectedGrid, setDetectedGrid] = useState<DetectedGrid | null>(null);
  const [splitResults, setSplitResults] = useState<SplitResult[]>([]);
  const [isDetectingGrid, setIsDetectingGrid] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [cropAspectRatio, setCropAspectRatio] = useState("9:16");
  const [cropFocus, setCropFocus] = useState({ x: 0.5, y: 0.5 });
  const [cropScale, setCropScale] = useState(1);
  const [cropPreviewUrl, setCropPreviewUrl] = useState<string | null>(null);
  const [cropResult, setCropResult] = useState<CropResult | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [galleryLightbox, setGalleryLightbox] = useState<{ url: string; title: string } | null>(null);
  const [videoPreview, setVideoPreview] = useState<StoryboardVideoPreview | null>(null);
  const [videoPreviewError, setVideoPreviewError] = useState("");
  const [videoPreviewPlaybackReady, setVideoPreviewPlaybackReady] = useState(false);
  const [videoPreviewOverlayReplayKey, setVideoPreviewOverlayReplayKey] = useState(0);
  const [isImageToolsPanelOpen, setIsImageToolsPanelOpen] = useState(false);
  const [historyGalleryProductFilterEnabled, setHistoryGalleryProductFilterEnabled] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<StoryboardReviewDeleteTarget | null>(null);
  const [splitFallbackTarget, setSplitFallbackTarget] = useState<StoryboardReviewSplitFallbackTarget | null>(null);
  const [hyperframesFinalFont, setHyperframesFinalFont] = useState<HyperframesFinalCompositeConfig["fontFamily"]>("Prompt");
  const [hyperframesFinalTextMode, setHyperframesFinalTextMode] = useState<HyperframesFinalCompositeConfig["textMode"]>("hook_and_per_shot");
  const [hyperframesFinalTextMotionPreset, setHyperframesFinalTextMotionPreset] = useState<HyperframesFinalTextMotionPreset>("slide_right_to_left");
  const [hyperframesFinalOverlayPreset, setHyperframesFinalOverlayPreset] = useState<HyperframesFinalOverlayPreset>("auto");
  const [hyperframesFinalSubtitlePreset, setHyperframesFinalSubtitlePreset] = useState<HyperframesFinalSubtitlePreset>("classic_box");
  const [hyperframesFinalSubtitleFontSizePx, setHyperframesFinalSubtitleFontSizePx] = useState(34);
  const [hyperframesFinalAudioPackPresetId, setHyperframesFinalAudioPackPresetId] = useState(DEFAULT_HYPERFRAMES_FINAL_AUDIO_PACK_ID);
  const [hyperframesFinalMusicPresetId, setHyperframesFinalMusicPresetId] = useState(DEFAULT_HYPERFRAMES_FINAL_MUSIC_ID);
  const [hyperframesFinalSfxPresetIds, setHyperframesFinalSfxPresetIds] = useState<string[]>(DEFAULT_HYPERFRAMES_FINAL_SFX_IDS);
  const [hyperframesFinalPreserveNativeAudio, setHyperframesFinalPreserveNativeAudio] = useState(true);
  const [hyperframesFinalSyntheticAudioFallback, setHyperframesFinalSyntheticAudioFallback] = useState(true);
  const [hyperframesFinalBurnInSubtitles, setHyperframesFinalBurnInSubtitles] = useState(true);
  const [hyperframesFinalStyleBrief, setHyperframesFinalStyleBrief] = useState(DEFAULT_HYPERFRAMES_FINAL_STYLE_BRIEF);
  const [isHyperframesFinalPromptEdited, setIsHyperframesFinalPromptEdited] = useState(false);
  const [hyperframesFinalHookText, setHyperframesFinalHookText] = useState("");
  const [hyperframesFinalSupportingText, setHyperframesFinalSupportingText] = useState("");
  const [isHyperframesFinalHookEditing, setIsHyperframesFinalHookEditing] = useState(false);
  const [hyperframesFinalHookDraft, setHyperframesFinalHookDraft] = useState({
    hookText: "",
    supportingText: "",
  });
  const [hyperframesFinalShotTextById, setHyperframesFinalShotTextById] = useState<Record<string, string>>({});
  const [hyperframesFinalSubtitleById, setHyperframesFinalSubtitleById] = useState<Record<string, string>>({});
  const [hyperframesFinalOverlayDraftById, setHyperframesFinalOverlayDraftById] = useState<Record<string, string>>({});
  const [hyperframesFinalSubtitleDraftById, setHyperframesFinalSubtitleDraftById] = useState<Record<string, string>>({});
  const [hyperframesFinalOverlayEditingById, setHyperframesFinalOverlayEditingById] = useState<Record<string, boolean>>({});
  const [hyperframesFinalSubtitleEditingById, setHyperframesFinalSubtitleEditingById] = useState<Record<string, boolean>>({});
  const [hyperframesFinalSubtitleVttById, setHyperframesFinalSubtitleVttById] = useState<Record<string, string>>({});
  const [hyperframesFinalSubtitleSrtById, setHyperframesFinalSubtitleSrtById] = useState<Record<string, string>>({});
  const [hyperframesFinalShotOverlayPresetById, setHyperframesFinalShotOverlayPresetById] = useState<Record<string, HyperframesFinalOverlayPreset>>({});
  const [hyperframesFinalShotAnimationById, setHyperframesFinalShotAnimationById] = useState<Record<string, HyperframesFinalShotAnimationPreset>>({});
  const [hyperframesFinalShotTransitionById, setHyperframesFinalShotTransitionById] = useState<Record<string, HyperframesFinalShotTransition>>({});
  const [hyperframesFinalShotTextMotionById, setHyperframesFinalShotTextMotionById] = useState<Record<string, HyperframesFinalTextMotionPreset>>({});
  const [hyperframesFinalCompositeCooldownUntil, setHyperframesFinalCompositeCooldownUntil] = useState(0);
  const [previewMatchCaptureQuality, setPreviewMatchCaptureQuality] =
    useState<StoryboardPreviewMatchCaptureQuality>("standard");
  const [previewMatchCaptureAudioEventsEnabled, setPreviewMatchCaptureAudioEventsEnabled] = useState(false);
  const [previewMatchCaptureJobId, setPreviewMatchCaptureJobId] = useState<string | null>(null);
  const tenantFeatureFlags = useTenantFeatureFlags();
  const previewMatchCaptureFlags = useMemo(
    () => ({
      captureEnabled: tenantFeatureFlags.storyboardPreviewMatchCaptureEnabled,
      highQualityEnabled:
        tenantFeatureFlags.storyboardPreviewMatchCaptureEnabled &&
        tenantFeatureFlags.storyboardPreviewMatchCaptureServerWorkerEnabled,
      serverWorkerEnabled: tenantFeatureFlags.storyboardPreviewMatchCaptureServerWorkerEnabled,
      clientExperimentEnabled: tenantFeatureFlags.storyboardClientCaptureExperimentEnabled,
    }),
    [
      tenantFeatureFlags.storyboardClientCaptureExperimentEnabled,
      tenantFeatureFlags.storyboardPreviewMatchCaptureEnabled,
      tenantFeatureFlags.storyboardPreviewMatchCaptureServerWorkerEnabled,
    ],
  );
  const [hyperframesFinalPreviewShotIndex, setHyperframesFinalPreviewShotIndex] = useState(0);
  const [hyperframesFinalSfxDrafts, setHyperframesFinalSfxDrafts] = useState<HyperframesFinalSfxDraft[]>(() =>
    DEFAULT_HYPERFRAMES_FINAL_SFX_IDS.map((id, index) => buildDefaultHyperframesFinalSfxDraft(id, index)),
  );
  const [isHyperframesFinalPanelExpanded, setIsHyperframesFinalPanelExpanded] = useState(false);
  const [isHyperframesFinalPayloadExpanded, setIsHyperframesFinalPayloadExpanded] = useState(false);
  const [isHyperframesFinalAudioPreviewExpanded, setIsHyperframesFinalAudioPreviewExpanded] = useState(false);
  const [isHyperframesFinalTextPreviewExpanded, setIsHyperframesFinalTextPreviewExpanded] = useState(false);
  const [hyperframesFinalTextPreviewReplayKey, setHyperframesFinalTextPreviewReplayKey] = useState(0);
  const hyperframesFinalPreviewAudioEventsPlayedRef = useRef<Set<string>>(new Set());
  const hyperframesFinalPreviewAudioNodesRef = useRef<Array<HTMLAudioElement | AudioContext>>([]);
  const [hyperframesFinalSelectedShotPreviewMode, setHyperframesFinalSelectedShotPreviewMode] =
    useState<HyperframesSelectedShotPreviewMode>("design");
  const [hyperframesFinalSelectedShotVideoLoadState, setHyperframesFinalSelectedShotVideoLoadState] =
    useState<HyperframesSelectedShotVideoLoadState>("idle");
  const [hyperframesFinalSelectedShotVideoError, setHyperframesFinalSelectedShotVideoError] = useState("");
  const [hyperframesFinalSelectedShotPlaybackSec, setHyperframesFinalSelectedShotPlaybackSec] = useState(0);
  const [hyperframesFinalPromptGeneratedSignature, setHyperframesFinalPromptGeneratedSignature] = useState("");
  const [hyperframesFinalAutosaveStatus, setHyperframesFinalAutosaveStatus] =
    useState<HyperframesFinalAutosaveStatus>("idle");
  const [hyperframesFinalTranscribingShotId, setHyperframesFinalTranscribingShotId] = useState<string | null>(null);
  const [hyperframesFinalTranscribeStatusText, setHyperframesFinalTranscribeStatusText] = useState("");
  const hyperframesFinalPreviewHookText = isHyperframesFinalHookEditing
    ? hyperframesFinalHookDraft.hookText
    : hyperframesFinalHookText;
  const hyperframesFinalPreviewSupportingText = isHyperframesFinalHookEditing
    ? hyperframesFinalHookDraft.supportingText
    : hyperframesFinalSupportingText;
  const hyperframesFinalStateRevisionRef = useRef<number | null>(null);
  const hyperframesFinalStateHydrationKeyRef = useRef<string | null>(null);
  const hyperframesFinalActiveIdentityKeyRef = useRef<string | null>(null);
  const hyperframesFinalResetIdentityKeyRef = useRef<string | null>(null);
  const hyperframesFinalAutosaveSnapshotRef = useRef<HyperframesFinalAutosaveSnapshot | null>(null);
  const hyperframesFinalAutosaveLastSignatureRef = useRef("");
  const hyperframesFinalAutosaveInFlightRef = useRef(false);
  const hyperframesFinalAutosaveNeedsFlushRef = useRef(false);
  const hyperframesFinalAutosaveFlushRef = useRef<() => Promise<void>>(async () => undefined);
  const hyperframesFinalAutosaveSkipNextRef = useRef(false);
  const hyperframesFinalAutosaveFlushAfterSnapshotRef = useRef(false);
  const hyperframesFinalLocalTextDirtyRef = useRef(false);
  const hyperframesFinalSelectedShotStageRef = useRef<HTMLDivElement | null>(null);
  const hyperframesFinalSelectedShotVideoRef = useRef<HTMLVideoElement | null>(null);
  const [hyperframesFinalSelectedShotOverlayFrameVars, setHyperframesFinalSelectedShotOverlayFrameVars] =
    useState<CSSProperties | null>(null);
  const hyperframesFinalSelectedShotPlaybackLastSecRef = useRef(0);
  const videoPreviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoPreviewOverlayReplayLastAtRef = useRef(0);
  const videoPreviewEndedRef = useRef(false);
  const storyboardReviewQueryRedirectRef = useRef("");
  const imageToolsPanelRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<StoryboardReviewDraft | null>(draft);
  const lastLocalResyncAtRef = useRef(0);
  const generationCancelRequestedRef = useRef(false);
  const activeGenerationTaskIdRef = useRef<string | null>(null);
  const storyboardGenerationPollersRef = useRef<Map<string, string>>(new Map());
  const isStoryboardReviewMountedRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const renderLibraryMetadataRef = useRef<Record<string, { title?: string; metadata: Record<string, unknown> }>>({});
  const hyperframesRenderLibrarySessionKeyRef = useRef<string | null>(null);
  const canonicalReviewId = reviewId;
  const hyperframesSearchParams = useMemo(
    () => new URLSearchParams(search),
    [search],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      STORYBOARD_REVIEW_RIGHT_PANEL_WIDTH_KEY,
      String(rightPanelWidth),
    );
  }, [rightPanelWidth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      STORYBOARD_REVIEW_RIGHT_PANEL_COLLAPSED_KEY,
      String(isRightPanelCollapsed),
    );
  }, [isRightPanelCollapsed]);

  useEffect(() => {
    setVideoPreviewError("");
    setVideoPreviewPlaybackReady(false);
    videoPreviewOverlayReplayLastAtRef.current = 0;
    videoPreviewEndedRef.current = false;
    setVideoPreviewOverlayReplayKey(current => current + 1);
  }, [videoPreview?.url]);

  const restartVideoPreviewOverlayAnimation = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - videoPreviewOverlayReplayLastAtRef.current < 250) return;
    videoPreviewOverlayReplayLastAtRef.current = now;
    setVideoPreviewOverlayReplayKey(current => current + 1);
  }, []);

  const replayVideoPreview = useCallback(() => {
    restartVideoPreviewOverlayAnimation(true);
    const video = videoPreviewVideoRef.current;
    if (!video) return;
    try {
      video.currentTime = 0;
    } catch {
      // Some browser/media combinations can reject seeking before metadata is ready.
    }
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      void playPromise.catch(() => undefined);
    }
  }, [restartVideoPreviewOverlayAnimation]);

  useEffect(() => {
    setHyperframesFinalSelectedShotPlaybackSec(0);
    hyperframesFinalSelectedShotPlaybackLastSecRef.current = 0;
    if (hyperframesFinalSelectedShotPreviewMode !== "video") {
      setHyperframesFinalSelectedShotVideoLoadState("idle");
      setHyperframesFinalSelectedShotVideoError("");
      return;
    }
    setHyperframesFinalSelectedShotVideoLoadState("loading");
    setHyperframesFinalSelectedShotVideoError("");
  }, [hyperframesFinalSelectedShotPreviewMode, hyperframesFinalPreviewShotIndex]);

  const hyperframesRenderJobId = hyperframesSearchParams.get("hyperframesRenderJobId");
  const hyperframesProductId = hyperframesSearchParams.get("productId") ?? undefined;
  const hyperframesRunId = hyperframesSearchParams.get("runId") ?? undefined;
  const trackableHyperframesRenderJobId = isTrackableHyperframesRenderJobId(hyperframesRenderJobId)
    ? hyperframesRenderJobId
    : null;

  const {
    data: review,
    error: reviewLoadError,
    isError: isReviewError,
    isFetching: isReviewFetching,
    isLoading: isReviewLoading,
    refetch: refetchStoryboardReview,
  } = trpc.videoEditorProjects.getStoryboardReview.useQuery(
    { id: canonicalReviewId ?? 0 },
    {
      enabled: typeof canonicalReviewId === "number" && Number.isFinite(canonicalReviewId),
      retry: false,
      refetchOnWindowFocus: false,
    },
  );
  const reviewRecord = (review as any) as Record<string, any> | null;
  const reviewRecordMatchesRoute = Boolean(
    !canonicalReviewId || (reviewRecord && Number(reviewRecord.id) === canonicalReviewId)
  );
  const reviewDataRecord =
    reviewRecordMatchesRoute && reviewRecord?.reviewData && typeof reviewRecord.reviewData === "object"
      ? (reviewRecord.reviewData as Record<string, any>)
      : {};
  const serverReviewDraft = useMemo(() => {
    if (!canonicalReviewId || !reviewRecordMatchesRoute || !reviewRecord) return null;
    return normalizeServerStoryboardReviewDraft(reviewRecord, canonicalReviewId);
  }, [canonicalReviewId, reviewRecord, reviewRecordMatchesRoute]);
  const reviewMarketplaceContext =
    reviewDataRecord.marketplaceContext &&
    typeof reviewDataRecord.marketplaceContext === "object"
      ? (reviewDataRecord.marketplaceContext as Record<string, any>)
      : {};
  const reviewDataAutoReview =
    reviewDataRecord.autoReview &&
    typeof reviewDataRecord.autoReview === "object"
      ? (reviewDataRecord.autoReview as Record<string, any>)
      : {};
  const reviewHyperframesFinalComposite =
    reviewDataRecord.hyperframesFinalComposite &&
    typeof reviewDataRecord.hyperframesFinalComposite === "object"
      ? (reviewDataRecord.hyperframesFinalComposite as Record<string, any>)
      : null;
  const reviewHyperframesProductId =
    compactStoryboardText(
      reviewMarketplaceContext.productId ??
        reviewMarketplaceContext.marketplaceProductId ??
        reviewMarketplaceContext.id
    ) ||
    normalizeManualStoryboardProductId(compactStoryboardText(reviewDataRecord.manualHyperframesProductId ?? "")) ||
    undefined;
  const reviewHyperframesRunId =
    compactStoryboardText(
      reviewRecord?.autoReview?.runId ??
        reviewDataRecord.autoReviewRunId ??
        reviewDataRecord.marketplaceAutoReviewRunId ??
        reviewDataAutoReview.runId ??
        reviewMarketplaceContext.autoReviewRunId ??
        reviewMarketplaceContext.marketplaceAutoReviewRunId ??
        reviewDataRecord.manualHyperframesRunId
    ) || undefined;
  const draftHyperframesProductId = getStoryboardReviewProductIdFromDraft(draft) || undefined;
  const draftHyperframesRunId = getStoryboardReviewAutoReviewRunIdFromDraft(draft) || undefined;
  const draftManualHyperframesProductId =
    normalizeManualStoryboardProductId(compactStoryboardText(draft?.manualHyperframesProductId ?? "")) || undefined;
  const draftManualHyperframesRunId =
    compactStoryboardText(draft?.manualHyperframesRunId ?? "") || undefined;
  const derivedManualHyperframesIdentity =
    deriveManualHyperframesIdentityFromStoryboardTasks(draft?.tasks);
  const canUseHyperframesQueryContext =
    reviewRecordMatchesRoute &&
    (!canonicalReviewId || Boolean(reviewRecord)) &&
    (!reviewHyperframesProductId ||
      (Boolean(hyperframesProductId) && hyperframesProductId === reviewHyperframesProductId));
  const effectiveHyperframesProductId =
    reviewHyperframesProductId ??
    draftHyperframesProductId ??
    draftManualHyperframesProductId ??
    (normalizeManualStoryboardProductId(derivedManualHyperframesIdentity?.productId) ||
      (canUseHyperframesQueryContext ? hyperframesProductId : undefined));
  const effectiveHyperframesRunId =
    reviewHyperframesRunId ||
    draftHyperframesRunId ||
    draftManualHyperframesRunId ||
    derivedManualHyperframesIdentity?.runId ||
    (canUseHyperframesQueryContext ? hyperframesRunId : undefined);
  const hyperframesFinalIdentityMismatchReason = useMemo(() => {
    if (!canonicalReviewId || isReviewLoading || !reviewRecordMatchesRoute || !reviewRecord) return null;
    if (reviewHyperframesProductId && effectiveHyperframesProductId && reviewHyperframesProductId !== effectiveHyperframesProductId) {
      return locale === "th"
        ? "ข้อมูลสินค้าใน Storyboard Review ไม่ตรงกับ HyperFrames input"
        : "Storyboard Review product does not match the HyperFrames input.";
    }
    if (reviewHyperframesRunId && effectiveHyperframesRunId && reviewHyperframesRunId !== effectiveHyperframesRunId) {
      return locale === "th"
        ? "ข้อมูล run ใน Storyboard Review ไม่ตรงกับ HyperFrames input"
        : "Storyboard Review run does not match the HyperFrames input.";
    }
    if (!reviewHyperframesProductId || !reviewHyperframesRunId) {
      return locale === "th"
        ? "Storyboard Review นี้ยังไม่มี product/run context ที่ผูกกับ HyperFrames"
        : "This Storyboard Review does not have a HyperFrames product/run context.";
    }
    return null;
  }, [
    canonicalReviewId,
    effectiveHyperframesProductId,
    effectiveHyperframesRunId,
    isReviewLoading,
    locale,
    reviewHyperframesProductId,
    reviewHyperframesRunId,
    reviewRecord,
    reviewRecordMatchesRoute,
  ]);
  const reviewHyperframesFinalCompositeMatchesIdentity =
    Boolean(reviewHyperframesFinalComposite) &&
    String(reviewHyperframesFinalComposite?.storyboardReviewProjectId ?? "") === String(canonicalReviewId ?? "") &&
    String(reviewHyperframesFinalComposite?.canonicalProductId ?? "") === String(effectiveHyperframesProductId ?? "") &&
    String(reviewHyperframesFinalComposite?.autoReviewRunId ?? "") === String(effectiveHyperframesRunId ?? "");
  const canInitializeHyperframesFinalDefaultText =
    (!canonicalReviewId || (!isReviewLoading && reviewRecordMatchesRoute && Boolean(reviewRecord))) &&
    !reviewHyperframesFinalCompositeMatchesIdentity;
  const persistedHyperframesFinalRenderJobRef =
    reviewHyperframesFinalComposite?.latestRenderJobRef &&
    typeof reviewHyperframesFinalComposite.latestRenderJobRef === "object"
      ? (reviewHyperframesFinalComposite.latestRenderJobRef as Record<string, unknown>)
      : null;
  const persistedHyperframesFinalRenderJobId =
    isTrackableHyperframesRenderJobId(
      typeof persistedHyperframesFinalRenderJobRef?.renderJobId === "string"
        ? persistedHyperframesFinalRenderJobRef.renderJobId
        : null,
    ) && reviewHyperframesFinalCompositeMatchesIdentity
      ? String(persistedHyperframesFinalRenderJobRef?.renderJobId)
      : null;
  const effectiveHyperframesRenderJobId = canUseHyperframesQueryContext
    ? trackableHyperframesRenderJobId ?? persistedHyperframesFinalRenderJobId
    : null;
  const hyperframesFinalIdentityKey = useMemo(
    () =>
      [
        canonicalReviewId ? String(canonicalReviewId) : "local",
        effectiveHyperframesProductId ?? "",
        effectiveHyperframesRunId ?? "",
      ].join(":"),
    [canonicalReviewId, effectiveHyperframesProductId, effectiveHyperframesRunId],
  );
  const hyperframesRenderQuery = trpc.marketplaceCapture.getHyperframesRenderJob.useQuery(
    {
      renderJobId: effectiveHyperframesRenderJobId ?? "",
      productId: effectiveHyperframesProductId,
      runId: effectiveHyperframesRunId,
    },
    {
      enabled: Boolean(
        effectiveHyperframesRenderJobId ||
          (effectiveHyperframesProductId && effectiveHyperframesRunId),
      ),
      refetchInterval: query => {
        return resolveHyperframesRenderRefetchInterval(
          (query.state.data as any)?.render
        );
      },
    },
  );
  const createHyperframesPreviewMutation =
    trpc.marketplaceCapture.createHyperframesPreview.useMutation({
      onSuccess: result => {
        const nextRenderJobId = result.render?.renderJobId;
        if (isTrackableHyperframesRenderJobId(nextRenderJobId) && typeof window !== "undefined") {
          const params = new URLSearchParams(search);
          params.set("hyperframesRenderJobId", nextRenderJobId);
          if (result.render.productId) params.set("productId", result.render.productId);
          if (result.render.runId) params.set("runId", result.render.runId);
          setLocation(`${window.location.pathname}?${params.toString()}`);
        }
        void trpcUtils.marketplaceCapture.getHyperframesRenderJob.invalidate({
          renderJobId: nextRenderJobId ?? "",
          productId: result.render?.productId,
          runId: result.render?.runId,
        });
        toast.success("สร้าง HyperFrames preview แล้ว");
      },
      onError: error => toast.error(error.message),
    });
  const createHyperframesFinalCompositeMutation =
    trpc.marketplaceCapture.createHyperframesFinalComposite.useMutation({
      onSuccess: result => {
        const nextRenderJobId = result.render?.renderJobId;
        if (isTrackableHyperframesRenderJobId(nextRenderJobId) && typeof window !== "undefined") {
          const params = new URLSearchParams(search);
          params.set("hyperframesRenderJobId", nextRenderJobId);
          if (result.render.productId) params.set("productId", result.render.productId);
          if (result.render.runId) params.set("runId", result.render.runId);
          setLocation(`${window.location.pathname}?${params.toString()}`);
        }
        void trpcUtils.marketplaceCapture.getHyperframesRenderJob.invalidate({
          renderJobId: nextRenderJobId ?? "",
          productId: result.render?.productId,
          runId: result.render?.runId,
        });
        toast.success(locale === "th" ? "เริ่ม render HyperFrames final composite แล้ว" : "HyperFrames final composite render started.");
      },
      onError: error => toast.error(error.message),
    });
  const createPreviewMatchFinalCompositeCaptureMutation =
    trpc.marketplaceCapture.createPreviewMatchFinalCompositeCapture.useMutation({
      onSuccess: result => {
        const nextCaptureJobId = result.capture.captureJobId ?? null;
        setPreviewMatchCaptureJobId(nextCaptureJobId);
        void trpcUtils.marketplaceCapture.getPreviewMatchCaptureJob.invalidate({
          captureJobId: nextCaptureJobId ?? undefined,
          productId: effectiveHyperframesProductId,
          runId: effectiveHyperframesRunId,
          storyboardReviewId: canonicalReviewId ? String(canonicalReviewId) : undefined,
        });
        toast.success(locale === "th" ? "เริ่ม Capture ตาม Preview แล้ว" : "Preview-match capture started.");
      },
      onError: error => toast.error(error.message),
    });
  const cancelPreviewMatchFinalCompositeCaptureMutation =
    trpc.marketplaceCapture.cancelPreviewMatchCaptureJob.useMutation({
      onSuccess: result => {
        const nextCaptureJobId = result.capture.captureJobId ?? null;
        setPreviewMatchCaptureJobId(nextCaptureJobId);
        void trpcUtils.marketplaceCapture.getPreviewMatchCaptureJob.invalidate({
          captureJobId: nextCaptureJobId ?? undefined,
          productId: effectiveHyperframesProductId,
          runId: effectiveHyperframesRunId,
          storyboardReviewId: canonicalReviewId ? String(canonicalReviewId) : undefined,
        });
        toast.success(locale === "th" ? "ยกเลิก Capture ตาม Preview แล้ว" : "Preview-match capture cancelled.");
      },
      onError: error => toast.error(error.message),
    });
  const generateHyperframesFinalPromptSkillMutation = trpc.skills.executeCustomSkill.useMutation({
    onError: error => toast.error(error.message),
  });
  const updateHyperframesFinalCompositeStateMutation =
    trpc.videoEditorProjects.updateStoryboardReviewHyperframesFinalComposite.useMutation({
      onSuccess: result => {
        hyperframesFinalStateRevisionRef.current = result.state.revision;
        void trpcUtils.videoEditorProjects.getStoryboardReview.invalidate({
          id: Number(result.state.storyboardReviewProjectId),
        });
      },
      onError: error => {
        if (!isHyperframesFinalRevisionConflictError(error)) {
          toast.error(error.message);
        }
      },
    });
  const startStoryboardReviewShotSubtitleTranscriptionMutation =
    trpc.videoEditorProjects.startStoryboardReviewShotSubtitleTranscription.useMutation();
  const repairHyperframesRenderJobMutation =
    trpc.marketplaceCapture.repairHyperframesRenderJob.useMutation({
      onSuccess: result => {
        void trpcUtils.marketplaceCapture.getHyperframesRenderJob.invalidate({
          renderJobId: result.render.renderJobId,
          productId: result.render.productId,
          runId: result.render.runId,
        });
        toast.success("HyperFrames repair queued");
      },
      onError: error => toast.error(error.message),
    });
  const saveHyperframesRenderToLibraryMutation =
    trpc.marketplaceCapture.saveHyperframesRenderToLibrary.useMutation({
      onSuccess: result => {
        removeMediaStudioRenderLibrarySession(result.render.renderJobId);
        hyperframesRenderLibrarySessionKeyRef.current = null;
        void Promise.all([
          trpcUtils.marketplaceCapture.getHyperframesRenderJob.invalidate({
            renderJobId: result.render.renderJobId,
            productId: result.render.productId,
            runId: result.render.runId,
          }),
          trpcUtils.library.search.invalidate(),
        ]);
        toast.success(
          result.created
            ? "บันทึก HyperFrames video เข้า Library แล้ว"
            : "รายการนี้มีอยู่ใน Library แล้ว",
        );
      },
      onError: error => toast.error(error.message),
    });
  const {
    data: reviewProjectsData,
    error: reviewProjectsError,
    isError: isReviewProjectsError,
    isFetching: isReviewProjectsFetching,
    isLoading: isReviewProjectsLoading,
    refetch: refetchReviews,
  } = trpc.videoEditorProjects.listStoryboardReviews.useQuery(
    { limit: 50, offset: 0 },
    {
      retry: false,
      refetchOnWindowFocus: false,
    },
  );
  const saveReviewMutation = trpc.videoEditorProjects.saveStoryboardReview.useMutation();
  const deleteReviewMutation = trpc.videoEditorProjects.deleteStoryboardReview.useMutation();
  const saveProjectMutation = trpc.videoEditorProjects.save.useMutation();
  const uploadMutation = trpc.ai.upload.useMutation();
  const generateVideoAsyncMutation = trpc.media.generateVideoAsync.useMutation();
  const cancelMediaTaskMutation = trpc.media.cancelTask.useMutation();
  const addRenderToLibraryMutation = trpc.mediaJobs.addCompletedRenderToLibrary.useMutation();
  const generateStoryboardVideoPromptMutation = trpc.skills.generateStoryboardVideoPrompt.useMutation();
  const planStoryboardVideoPromptsMutation = trpc.skills.planStoryboardVideoPrompts.useMutation();
  const regenerateVideoSegmentPromptMutation = trpc.videoEditorProjects.regenerateVideoSegmentPrompt.useMutation();
  const { mutate: writeStoryboardReviewClientDebug } = trpc.videoEditorProjects.debugStoryboardReviewClient.useMutation();
  const {
    data: librarySearchData,
    isLoading: isLibrarySearchLoading,
    error: librarySearchError,
  } = trpc.library.search.useQuery(
    {
      query: librarySearchQuery.trim() || undefined,
      limit: 30,
      filters: {
        itemType: mediaPickerKind,
      },
    },
    {
      enabled: Boolean(draft) && rightPanelTab !== "history_gallery",
    },
  );
  const hyperframesRenderProjection =
    hyperframesRenderQuery.data?.render ??
    createHyperframesFinalCompositeMutation.data?.render ??
    createHyperframesPreviewMutation.data?.render ??
    null;
  const hyperframesFinalCompositeMutationRender =
    createHyperframesFinalCompositeMutation.data?.render ?? null;
  const hyperframesFinalCompositeQueryRender =
    hyperframesRenderQuery.data?.render ?? null;
  const hyperframesFinalRenderProjection =
    [
      hyperframesFinalCompositeMutationRender,
      hyperframesFinalCompositeQueryRender,
      hyperframesRenderProjection,
    ].find(isHyperframesFinalCompositeRender) ?? null;
  const hyperframesFinalCompositeStatusText = createHyperframesFinalCompositeMutation.isPending
    ? locale === "th"
      ? "กำลังส่งงาน Final Composite เข้า queue..."
      : "Submitting Final Composite render to the queue..."
    : formatHyperframesFinalCompositeStatus(hyperframesFinalRenderProjection, locale);
  const hyperframesFinalCompositeDuplicateGuardActive =
    hyperframesFinalCompositeCooldownUntil > Date.now();
  const hyperframesFinalCompositeDuplicateGuardReason =
    hyperframesFinalCompositeDuplicateGuardActive
      ? locale === "th"
        ? "รอสักครู่ก่อนกด render ซ้ำ เพื่อกันการส่งงานซ้อนภายในไม่กี่วินาที"
        : "Wait a moment before rendering again to avoid duplicate submits within a few seconds."
      : null;
  const hyperframesFinalCompositeStatusDetail = hyperframesFinalRenderProjection?.safeMessage ?? null;
  const hyperframesFinalCompositeElapsedText = formatHyperframesRenderElapsed(
    hyperframesFinalRenderProjection,
    locale,
  );
  const hyperframesFinalCompositeStartedText = hyperframesFinalRenderProjection?.createdAt
    ? formatLocalRenderDateTime(hyperframesFinalRenderProjection.createdAt, locale)
    : null;
  const hyperframesFinalCompositeUpdatedText = hyperframesFinalRenderProjection?.updatedAt
    ? formatLocalRenderDateTime(hyperframesFinalRenderProjection.updatedAt, locale)
    : null;
  const hyperframesFinalCompositeIsCancelled =
    hyperframesFinalRenderProjection?.status === "cancelled";
  const hyperframesFinalCompositeNextAction =
    hyperframesFinalRenderProjection?.nextAction ??
    (hyperframesFinalCompositeIsCancelled
      ? locale === "th"
        ? "งานนี้ถูกยกเลิกแล้ว กด Render Final Composite ใหม่เพื่อส่งงานรอบใหม่"
        : "This job was cancelled. Render Final Composite again to submit a new job."
      : null) ??
    (hyperframesFinalRenderProjection?.status === "blocked_needs_user"
      ? locale === "th"
        ? "ตรวจ runtime/worker แล้วกด Render Final Composite ใหม่"
        : "Check the runtime/worker, then render Final Composite again."
      : null);
  const hyperframesFinalCompositePrimaryDiagnostic =
    hyperframesFinalRenderProjection?.safeDiagnostics?.find(message =>
      !/contract version|template|composition hash/i.test(message)
    ) ?? null;
  const hyperframesFinalCompositeIsProblem = Boolean(
    hyperframesFinalRenderProjection?.status.startsWith("failed") ||
      hyperframesFinalCompositeIsCancelled ||
      hyperframesFinalRenderProjection?.status === "dead_lettered" ||
      hyperframesFinalRenderProjection?.status === "blocked_needs_user" ||
      hyperframesFinalRenderProjection?.status === "compliance_blocked"
  );
  const hyperframesFinalCompositeIsActive = Boolean(
    createHyperframesFinalCompositeMutation.isPending ||
      (hyperframesFinalRenderProjection &&
        !hyperframesFinalCompositeIsProblem &&
        !isTerminalHyperframesRenderStatus(hyperframesFinalRenderProjection.status) &&
        hyperframesFinalRenderProjection.progressPercent < 100)
  );
  const hyperframesFinalVideoOutput = getHyperframesPrimaryVideoOutput(
    hyperframesFinalRenderProjection,
  );
  const hyperframesFinalVideoUrl =
    typeof hyperframesFinalVideoOutput?.url === "string"
      ? hyperframesFinalVideoOutput.url
      : "";
  const hyperframesContextAvailable = Boolean(
    effectiveHyperframesRenderJobId ||
      (effectiveHyperframesProductId && effectiveHyperframesRunId),
  );
  const hyperframesSnapshots = useMemo(
    () =>
      (hyperframesRenderProjection?.outputRefs ?? [])
        .filter(ref => ref.kind === "snapshot")
        .map((ref, index) => ({
          id: ref.outputId,
          label: ref.accessibleLabel || `Snapshot ${index + 1}`,
          url: ref.url ?? null,
          status: ref.url ? ("ready" as const) : ("missing" as const),
        })),
    [hyperframesRenderProjection],
  );
  const createHyperframesPreview = useCallback(() => {
    if (!effectiveHyperframesProductId || !effectiveHyperframesRunId) {
      toast.error("ยังไม่มี product/run context สำหรับ HyperFrames preview");
      return;
    }
    createHyperframesPreviewMutation.mutate({
      productId: effectiveHyperframesProductId,
      runId: effectiveHyperframesRunId,
    });
  }, [
    createHyperframesPreviewMutation,
    effectiveHyperframesProductId,
    effectiveHyperframesRunId,
  ]);
  useEffect(() => {
    if (hyperframesFinalCompositeCooldownUntil <= 0) return;
    const remainingMs = hyperframesFinalCompositeCooldownUntil - Date.now();
    if (remainingMs <= 0) {
      setHyperframesFinalCompositeCooldownUntil(0);
      return;
    }
    const timeoutId = window.setTimeout(
      () => setHyperframesFinalCompositeCooldownUntil(0),
      remainingMs,
    );
    return () => window.clearTimeout(timeoutId);
  }, [hyperframesFinalCompositeCooldownUntil]);
  const saveHyperframesRenderToLibrary = useCallback(() => {
    const render = hyperframesRenderProjection;
    const idempotencyKey = buildHyperframesLibrarySaveKey(render);
    if (!render?.renderJobId || !render.productId || !render.runId || !idempotencyKey) {
      toast.error("HyperFrames output ยังไม่พร้อมบันทึกเข้า Library");
      return;
    }
    saveHyperframesRenderToLibraryMutation.mutate({
      productId: render.productId,
      runId: render.runId,
      renderJobId: render.renderJobId,
      idempotencyKey,
    });
  }, [hyperframesRenderProjection, saveHyperframesRenderToLibraryMutation]);
  const repairHyperframesRender = useCallback(() => {
    const render = hyperframesRenderProjection;
    const action = render?.permissions?.canRepair
      ? render.repairActions?.find(
          item => !item.requiresOperator && !item.disabledReason
        )
      : null;
    if (!render?.renderJobId || !render.productId || !render.runId || !action) {
      void hyperframesRenderQuery.refetch();
      return;
    }
    repairHyperframesRenderJobMutation.mutate({
      productId: render.productId,
      runId: render.runId,
      renderJobId: render.renderJobId,
      actionId: action.actionId,
      actionType: action.actionType,
      expectedCompositionInputHash: render.compositionInputHash,
    });
  }, [
    hyperframesRenderProjection,
    hyperframesRenderQuery,
    repairHyperframesRenderJobMutation,
  ]);

  useEffect(() => {
    if (hyperframesRenderProjection?.status === "saved_to_library") {
      removeMediaStudioRenderLibrarySession(
        hyperframesRenderProjection.renderJobId
      );
      hyperframesRenderLibrarySessionKeyRef.current = null;
      return;
    }
    const session = buildHyperframesRenderLibrarySession(
      hyperframesRenderProjection,
      {
        title: draft
          ? `${getStoryboardReviewName(draft)} - HyperFrames video`
          : "HyperFrames Marketplace Auto Review video",
      }
    );
    const outputHash =
      typeof session?.metadata?.outputHash === "string"
        ? session.metadata.outputHash
        : "";
    const sessionKey = session
      ? `${session.jobId}:${outputHash}:${session.title ?? ""}`
      : "";
    if (!session || hyperframesRenderLibrarySessionKeyRef.current === sessionKey)
      return;
    upsertMediaStudioRenderLibrarySession(session);
    hyperframesRenderLibrarySessionKeyRef.current = sessionKey;
  }, [draft, hyperframesRenderProjection]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!queryReviewId || routeParams?.reviewId) return;
    const canonicalPath = `/storyboard-review/${queryReviewId}`;
    if (location === canonicalPath) return;
    const redirectKey = `${queryReviewId}:${canonicalPath}`;
    if (storyboardReviewQueryRedirectRef.current === redirectKey) return;
    if (location.startsWith("/storyboard-review?")) {
      storyboardReviewQueryRedirectRef.current = redirectKey;
      setLocation(canonicalPath);
    }
  }, [queryReviewId, location, routeParams?.reviewId, setLocation]);

  useEffect(() => {
    if (!canonicalReviewId || !reviewRecordMatchesRoute) return;
    if (!hyperframesProductId || !reviewHyperframesProductId) return;
    if (hyperframesProductId === reviewHyperframesProductId) return;
    setLocation(`/storyboard-review/${canonicalReviewId}`);
  }, [
    canonicalReviewId,
    hyperframesProductId,
    reviewHyperframesProductId,
    reviewRecordMatchesRoute,
    setLocation,
  ]);

  useEffect(() => () => {
    isStoryboardReviewMountedRef.current = false;
    storyboardGenerationPollersRef.current.clear();
  }, []);

  const stopMicrophoneStream = useCallback(() => {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  }, []);

  const refreshAudioInputDevices = useCallback(async (requestAccess = false) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      setMicrophoneStatus("error");
      setMicrophoneError(locale === "th" ? "เบราว์เซอร์นี้ยังไม่รองรับการเลือกไมก์" : "This browser does not support microphone device selection.");
      return;
    }
    setMicrophoneStatus("checking");
    let permissionStream: MediaStream | null = null;
    try {
      if (requestAccess && navigator.mediaDevices.getUserMedia) {
        permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter((device) => device.kind === "audioinput");
      setAudioInputDevices(audioDevices);
      setSelectedAudioInputDeviceId((current) => (
        current && audioDevices.some((device) => device.deviceId === current) ? current : ""
      ));
      setMicrophoneStatus("ready");
      setMicrophoneError("");
    } catch (error) {
      setMicrophoneStatus("error");
      setMicrophoneError(error instanceof Error ? error.message : (locale === "th" ? "อ่านรายการไมก์ไม่สำเร็จ" : "Unable to read microphones."));
    } finally {
      permissionStream?.getTracks().forEach((track) => track.stop());
    }
  }, [locale]);

  useEffect(() => {
    void refreshAudioInputDevices();
    const mediaDevices = typeof navigator === "undefined" ? null : navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return undefined;
    const handleDeviceChange = () => {
      void refreshAudioInputDevices();
    };
    mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [refreshAudioInputDevices]);

  useEffect(() => {
    if (!isRecordingVoiceover || !recordingStartedAt) return undefined;
    setRecordingElapsedSeconds(Math.max(0, Math.floor((Date.now() - recordingStartedAt) / 1000)));
    const intervalId = window.setInterval(() => {
      setRecordingElapsedSeconds(Math.max(0, Math.floor((Date.now() - recordingStartedAt) / 1000)));
    }, 500);
    return () => window.clearInterval(intervalId);
  }, [isRecordingVoiceover, recordingStartedAt]);

  useEffect(() => () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    stopMicrophoneStream();
  }, [stopMicrophoneStream]);

  const writeStoryboardReviewClientDebugRef = useRef(writeStoryboardReviewClientDebug);
  const storyboardReviewRouteIdRef = useRef<number | null>(reviewId);
  const storyboardReviewRouteResetRef = useRef("");
  const storyboardReviewQueryDebugSignatureRef = useRef("");
  const storyboardReviewServerResponseDebugSignatureRef = useRef("");

  useEffect(() => {
    writeStoryboardReviewClientDebugRef.current = writeStoryboardReviewClientDebug;
  }, [writeStoryboardReviewClientDebug]);

  useEffect(() => {
    storyboardReviewRouteIdRef.current = reviewId;
  }, [reviewId]);

  const emitStoryboardReviewClientDebug = useCallback((event: string, payload?: Record<string, unknown>) => {
    const routeReviewId = storyboardReviewRouteIdRef.current;
    const currentReviewId = routeReviewId ?? draftRef.current?.reviewId ?? null;
    writeStoryboardReviewClientDebugRef.current({
      event,
      reviewId: currentReviewId,
      pageBuild: STORYBOARD_REVIEW_PAGE_DEBUG_BUILD,
      route: typeof window === "undefined" ? null : `${window.location.pathname}${window.location.search}`,
      payload: {
        routeReviewId,
        canonicalReviewId: currentReviewId,
        currentDraft: summarizeStoryboardDraftForDebug(draftRef.current),
        ...payload,
      },
    }, {
      onError: () => undefined,
    });
  }, []);

  const listBackedReviewRecord = useMemo(() => {
    if (!canonicalReviewId) return null;
    const reviews = (reviewProjectsData?.reviews ?? []) as any[];
    return reviews.find((item) => Number(item?.id) === canonicalReviewId) ?? null;
  }, [canonicalReviewId, reviewProjectsData?.reviews]);
  const serverBackedDraft =
    serverReviewDraft?.reviewId === canonicalReviewId ? serverReviewDraft : null;
  const reviewRecordFound = Boolean(canonicalReviewId && reviewRecordMatchesRoute && reviewRecord);
  const refBackedDraft =
    draftRef.current?.reviewId === canonicalReviewId ? draftRef.current : null;
  const activeDraft = canonicalReviewId
    ? (draft?.reviewId === canonicalReviewId ? draft : refBackedDraft ?? serverBackedDraft)
    : draft;

  useEffect(() => {
    if (!canonicalReviewId) return;
    const signature = [
      canonicalReviewId,
      reviewRecord?.id ?? "",
      reviewRecordFound ? "record-found" : "record-missing",
      serverBackedDraft?.reviewId ?? "",
      serverBackedDraft?.updatedAt ?? "",
      serverBackedDraft?.taskIds?.length ?? 0,
      isReviewProjectsLoading ? "list-loading" : "list-not-loading",
      isReviewProjectsFetching ? "list-fetching" : "list-not-fetching",
      isReviewProjectsError ? "list-error" : "list-ok",
      draft?.reviewId ?? "",
      activeDraft?.reviewId ?? "",
      isReviewLoading ? "loading" : "not-loading",
      isReviewFetching ? "fetching" : "not-fetching",
      isReviewError ? "error" : "ok",
    ].join("|");
    if (storyboardReviewServerResponseDebugSignatureRef.current === signature) return;
    storyboardReviewServerResponseDebugSignatureRef.current = signature;
    emitStoryboardReviewClientDebug("serverReview.responseState", {
      queryReviewId,
      routeReviewId: reviewId,
      canonicalReviewId,
      isReviewLoading,
      isReviewFetching,
      isReviewError,
      reviewRecordFound,
      reviewRecordId: reviewRecord?.id ?? null,
      reviewRecordMatchesRoute,
      reviewError: reviewLoadError?.message ?? null,
      reviewProjectsLoading: isReviewProjectsLoading,
      reviewProjectsFetching: isReviewProjectsFetching,
      reviewProjectsError: reviewProjectsError?.message ?? null,
      listBackedReviewRecordFound: Boolean(listBackedReviewRecord),
      serverBackedDraft: summarizeStoryboardDraftForDebug(serverBackedDraft),
      draft: summarizeStoryboardDraftForDebug(draft),
      activeDraft: summarizeStoryboardDraftForDebug(activeDraft),
    });
  }, [
    activeDraft,
    canonicalReviewId,
    draft,
    emitStoryboardReviewClientDebug,
    isReviewError,
    isReviewFetching,
    isReviewLoading,
    isReviewProjectsError,
    isReviewProjectsFetching,
    isReviewProjectsLoading,
    queryReviewId,
    reviewId,
    reviewLoadError?.message,
    reviewProjectsError?.message,
    reviewRecord?.id,
    reviewRecordFound,
    reviewRecordMatchesRoute,
    listBackedReviewRecord,
    serverBackedDraft,
  ]);

  useEffect(() => {
    if (!canonicalReviewId || !serverBackedDraft) return;
    if (draft?.reviewId === canonicalReviewId) return;
    emitStoryboardReviewClientDebug("serverReview.promoteServerBackedDraft", {
      reviewRecordFound,
      serverBackedDraft: summarizeStoryboardDraftForDebug(serverBackedDraft),
      previousDraft: summarizeStoryboardDraftForDebug(draft),
    });
    draftRef.current = serverBackedDraft;
    writeStoryboardReviewDraft(serverBackedDraft);
    setDraft(serverBackedDraft);
    setRenderJobId(serverBackedDraft.renderJobId ?? null);
  }, [
    canonicalReviewId,
    draft,
    emitStoryboardReviewClientDebug,
    reviewRecordFound,
    serverBackedDraft,
  ]);

  useEffect(() => {
    if (!canonicalReviewId) return;
    const reviewState =
      review === null ? "null" : review ? "record" : "undefined";
    const signature = [
      canonicalReviewId,
      reviewId ?? "",
      isReviewLoading ? "loading" : "not-loading",
      isReviewFetching ? "fetching" : "not-fetching",
      isReviewError ? "error" : "ok",
      isReviewProjectsLoading ? "list-loading" : "list-not-loading",
      isReviewProjectsFetching ? "list-fetching" : "list-not-fetching",
      isReviewProjectsError ? "list-error" : "list-ok",
      reviewState,
      listBackedReviewRecord ? "list-record" : "list-no-record",
      draft?.reviewId ?? "",
      activeDraft?.reviewId ?? "",
      reviewLoadError?.message ?? "",
      reviewProjectsError?.message ?? "",
    ].join("|");
    if (storyboardReviewQueryDebugSignatureRef.current === signature) return;
    storyboardReviewQueryDebugSignatureRef.current = signature;
    emitStoryboardReviewClientDebug("route.queryState", {
      queryReviewId,
      routeReviewId: reviewId,
      canonicalReviewId,
      isReviewLoading,
      isReviewFetching,
      isReviewError,
      isReviewProjectsLoading,
      isReviewProjectsFetching,
      isReviewProjectsError,
      reviewState,
      reviewError: reviewLoadError?.message ?? null,
      reviewProjectsError: reviewProjectsError?.message ?? null,
      listBackedReviewRecordFound: Boolean(listBackedReviewRecord),
      draft: summarizeStoryboardDraftForDebug(draft),
      serverBackedDraft: summarizeStoryboardDraftForDebug(serverBackedDraft),
      activeDraft: summarizeStoryboardDraftForDebug(activeDraft),
    });
  }, [
    activeDraft,
    canonicalReviewId,
    draft,
    emitStoryboardReviewClientDebug,
    isReviewError,
    isReviewFetching,
    isReviewLoading,
    isReviewProjectsError,
    isReviewProjectsFetching,
    isReviewProjectsLoading,
    queryReviewId,
    review,
    reviewId,
    reviewLoadError?.message,
    reviewProjectsError?.message,
    listBackedReviewRecord,
    serverBackedDraft,
  ]);

  const historyGalleryProductFilter = useMemo(
    () => getStoryboardHistoryProductFilter(activeDraft),
    [activeDraft],
  );
  const isHistoryGalleryProductFilterActive = Boolean(
    historyGalleryProductFilterEnabled && historyGalleryProductFilter,
  );

  const { data: mediaHistoryData, isLoading: isMediaHistoryLoading } = trpc.media.listTasks.useQuery(
    {
      mediaType: mediaPickerKind,
      status: "completed",
      limit: 20,
      offset: 0,
      daysAgo: 30,
	    },
	    {
	      enabled: Boolean(activeDraft),
	      refetchOnWindowFocus: true,
	    },
	  );
  const { data: imageHistoryData, isLoading: isImageHistoryLoading } = trpc.media.listTasks.useQuery(
    {
      mediaType: "image",
      status: "completed",
      limit: isHistoryGalleryProductFilterActive ? 100 : 36,
      offset: 0,
      daysAgo: 30,
	    },
	    {
	      enabled: Boolean(activeDraft) && rightPanelTab === "history_gallery",
	      refetchOnWindowFocus: true,
	    },
	  );
  const storyboardVideoMediaModelsQuery = trpc.mediaModels.list.useQuery(
	    { type: "video" },
	    {
	      enabled: Boolean(activeDraft),
	      staleTime: 60_000,
	      refetchOnWindowFocus: false,
	    },
  );
  const storyboardMcpConnectionsQuery = trpc.mcpConnections.listConnections.useQuery(
	    undefined,
	    {
	      enabled: Boolean(activeDraft),
	      retry: false,
	      staleTime: 30_000,
	      refetchOnWindowFocus: true,
    },
  );

  useEffect(() => {
    if (!reviewId) return;
    const resetKey = `server:${reviewId}`;
    if (storyboardReviewRouteResetRef.current === resetKey) return;
    storyboardReviewRouteResetRef.current = resetKey;
    const matchingCurrentDraft =
      draftRef.current?.reviewId === reviewId ? draftRef.current : null;
    const hasMismatchedCurrentDraft =
      Boolean(draftRef.current?.reviewId && draftRef.current.reviewId !== reviewId);
    emitStoryboardReviewClientDebug("route.localDraftLoaded", {
      localDraft: matchingCurrentDraft
        ? summarizeStoryboardDraftForDebug(matchingCurrentDraft)
        : null,
      matchingLocalDraft: summarizeStoryboardDraftForDebug(matchingCurrentDraft),
      matchingServerDraft: null,
      hasMismatchedCurrentDraft,
      routeReviewId: reviewId,
      source: "server_canonical_route",
    });

    if (matchingCurrentDraft) {
      draftRef.current = matchingCurrentDraft;
      setDraft(matchingCurrentDraft);
      setRenderJobId(matchingCurrentDraft.renderJobId ?? null);
    } else if (hasMismatchedCurrentDraft) {
      // On a canonical server route, wait for getStoryboardReview to hydrate the draft.
      // Clearing only mismatched local data prevents showing the previous project while
      // avoiding the stale null state that made direct Auto Storyboard links spin forever.
      draftRef.current = null;
      setDraft(null);
      setRenderJobId(null);
    }
    setRegeneratingTaskId(null);
    setSelectedLibraryItemId(null);
    setLibrarySearchQuery("");
    setReplacingReferenceFrameKey(null);
    setUploadingVideoSlotKey(null);
    setVideoPreview(null);
    setGalleryLightbox(null);
  }, [emitStoryboardReviewClientDebug, reviewId]);

  useEffect(() => {
    if (reviewId) return;
    if (storyboardReviewRouteResetRef.current === "project-list") return;
    storyboardReviewRouteResetRef.current = "project-list";
    emitStoryboardReviewClientDebug("route.projectListLoaded", {
      previousDraft: summarizeStoryboardDraftForDebug(draftRef.current),
      source: "project_list_route",
    });
    draftRef.current = null;
    setDraft(null);
    setRenderJobId(null);
    setRegeneratingTaskId(null);
    setSelectedLibraryItemId(null);
    setLibrarySearchQuery("");
    setReplacingReferenceFrameKey(null);
    setUploadingVideoSlotKey(null);
    setVideoPreview(null);
    setGalleryLightbox(null);
  }, [emitStoryboardReviewClientDebug, reviewId]);

  useEffect(() => {
    if (!canonicalReviewId || !reviewRecord || Number(reviewRecord.id) !== canonicalReviewId) return;

    const nextDraft = normalizeServerStoryboardReviewDraft(reviewRecord, canonicalReviewId);
    const rawIncoming = nextDraft ? {
      ...nextDraft,
      reviewId: canonicalReviewId,
      name: nextDraft.name ?? (typeof reviewRecord.name === "string" ? reviewRecord.name : null),
    } : null;
    const current =
      draftRef.current?.reviewId === canonicalReviewId ? draftRef.current : null;
    const mergedIncoming = mergeFresherStoryboardReviewTasks(current, rawIncoming);
    const incoming = preferCanonicalServerCompanionAudio(
      current,
      rawIncoming,
      mergedIncoming,
    );
    const serverCompanionAudioUpdatedAt = getStoryboardCompanionAudioUpdatedAt(rawIncoming);
    const currentCompanionAudioUpdatedAt = getStoryboardCompanionAudioUpdatedAt(current);
    const serverCompanionAudioIsCanonical = serverCompanionAudioUpdatedAt > 0
      && serverCompanionAudioUpdatedAt >= currentCompanionAudioUpdatedAt;
    if (
      current
      && current.reviewId === canonicalReviewId
      && isDraftNewerThan(current, incoming)
      && !serverCompanionAudioIsCanonical
    ) {
      const mergedCurrentBase = mergeFresherStoryboardReviewTasks(incoming, current);
      const mergedCurrent = rawIncoming?.marketplaceContext && !getStoryboardHistoryProductFilter(mergedCurrentBase)
        ? { ...mergedCurrentBase, marketplaceContext: rawIncoming.marketplaceContext }
        : mergedCurrentBase;
      emitStoryboardReviewClientDebug("serverReview.appliedLocalNewer", {
        reviewRecordFound: true,
        serverCompanionAudioIsCanonical,
        serverCompanionAudioUpdatedAt,
        currentCompanionAudioUpdatedAt,
        rawIncoming: summarizeStoryboardDraftForDebug(rawIncoming),
        mergedIncoming: summarizeStoryboardDraftForDebug(mergedIncoming),
        appliedDraft: summarizeStoryboardDraftForDebug(mergedCurrent),
      });
      if (storyboardDraftContentMatches(current, mergedCurrent)) {
        lastLocalResyncAtRef.current = current.updatedAt;
        return;
      }
      draftRef.current = mergedCurrent;
      writeStoryboardReviewDraft(mergedCurrent);
      setDraft(mergedCurrent);
      setRenderJobId(mergedCurrent.renderJobId ?? null);
      return;
    }
    const incomingWithMarketplaceContext = incoming && rawIncoming?.marketplaceContext && !getStoryboardHistoryProductFilter(incoming)
      ? { ...incoming, marketplaceContext: rawIncoming.marketplaceContext }
      : incoming;
    if (!incomingWithMarketplaceContext) return;
    if (storyboardDraftContentMatches(current, incomingWithMarketplaceContext)) {
      emitStoryboardReviewClientDebug("serverReview.skippedEquivalentIncoming", {
        reviewRecordFound: true,
        rawIncoming: summarizeStoryboardDraftForDebug(rawIncoming),
        currentDraft: summarizeStoryboardDraftForDebug(current),
      });
      lastLocalResyncAtRef.current = current?.updatedAt ?? incomingWithMarketplaceContext.updatedAt;
      return;
    }
    emitStoryboardReviewClientDebug("serverReview.appliedIncoming", {
      reviewRecordFound: true,
      serverCompanionAudioIsCanonical,
      serverCompanionAudioUpdatedAt,
      currentCompanionAudioUpdatedAt,
      rawIncoming: summarizeStoryboardDraftForDebug(rawIncoming),
      mergedIncoming: summarizeStoryboardDraftForDebug(mergedIncoming),
      appliedDraft: summarizeStoryboardDraftForDebug(incomingWithMarketplaceContext),
    });
    lastLocalResyncAtRef.current = incomingWithMarketplaceContext.updatedAt;
    draftRef.current = incomingWithMarketplaceContext;
    writeStoryboardReviewDraft(incomingWithMarketplaceContext);
    setDraft(incomingWithMarketplaceContext);
    setRenderJobId(incomingWithMarketplaceContext.renderJobId ?? null);
  }, [canonicalReviewId, emitStoryboardReviewClientDebug, reviewRecord, reviewId]);

  const tasks = useMemo(() => storyboardDraftToReviewTasks(activeDraft), [activeDraft]);
  const storyboardReviewVideoOptions = useMemo(
    () => getStoryboardReviewVideoOptionValues(activeDraft, locale),
    [activeDraft, locale],
  );
  const storyboardReviewVideoModelRecords = useMemo(
    () => ((storyboardVideoMediaModelsQuery.data?.models as any[] | undefined) ?? []),
    [storyboardVideoMediaModelsQuery.data?.models],
  );
  const storyboardReviewVideoModelById = useMemo(() => {
    const map = new Map<string, any>();
    for (const model of storyboardReviewVideoModelRecords) {
      const modelId = String(model?.modelId ?? "").trim();
      if (modelId) map.set(modelId, model);
    }
    return map;
  }, [storyboardReviewVideoModelRecords]);
  const eligibleStoryboardVideoMcpConnections = useMemo(
    () =>
      ((storyboardMcpConnectionsQuery.data ?? []) as any[]).filter(connection => {
        if (connection?.status !== "connected") return false;
        return (
          !connection?.allowedAssetTypes?.length ||
          connection.allowedAssetTypes.includes("video")
        );
      }),
    [storyboardMcpConnectionsQuery.data],
  );
  const eligibleStoryboardVideoMcpProviderKeys = useMemo(
    () =>
      new Set(
        eligibleStoryboardVideoMcpConnections
          .map(connection => String(connection?.providerKey ?? "").trim())
          .filter(Boolean),
      ),
    [eligibleStoryboardVideoMcpConnections],
  );
  const storyboardReviewVideoModelOptions = useMemo((): StoryboardReviewVideoModelOption[] => {
    const currentModel = storyboardReviewVideoOptions.videoModel;
    const options = storyboardReviewVideoModelRecords
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
          (!transport.providerKey || !eligibleStoryboardVideoMcpProviderKeys.has(transport.providerKey))
        ) {
          return null;
        }
        const provider = String(model?.provider ?? transport.providerKey ?? "").trim();
        return {
          value: modelId,
          label: `${String(model?.name ?? modelId)} (${transport.transport === "mcp" ? "MCP" : "API"}${provider ? ` • ${provider}` : ""})`,
          provider,
          transport: transport.transport,
          providerKey: transport.providerKey ?? null,
          providerModelId: transport.providerModelId ?? null,
          toolName: transport.toolName ?? null,
          argumentShape: transport.argumentShape ?? null,
        };
      })
      .filter(Boolean) as StoryboardReviewVideoModelOption[];
    for (const fallback of STORYBOARD_REVIEW_VIDEO_MODEL_OPTIONS) {
      if (!options.some(option => option.value === fallback.value)) {
        options.push({
          value: fallback.value,
          label: fallback.label,
          provider: "kie.ai",
          transport: "gateway_api",
          providerKey: null,
        });
      }
    }
    if (currentModel && !options.some(option => option.value === currentModel)) {
      const model = storyboardReviewVideoModelById.get(currentModel);
      const currentOption = buildStoryboardReviewCurrentVideoModelOption({
        draft: activeDraft,
        model,
        modelId: currentModel,
      });
      if (currentOption) options.unshift(currentOption);
    }
    return options;
  }, [
    activeDraft,
    eligibleStoryboardVideoMcpProviderKeys,
    storyboardReviewVideoModelById,
    storyboardReviewVideoModelRecords,
    storyboardReviewVideoOptions.videoModel,
  ]);
  const storyboardReviewVideoModelOptionById = useMemo(() => {
    const map = new Map<string, StoryboardReviewVideoModelOption>();
    storyboardReviewVideoModelOptions.forEach(option => map.set(option.value, option));
    return map;
  }, [storyboardReviewVideoModelOptions]);
  const selectedTaskIds = activeDraft?.selectedTaskIds ?? [];
  const completedCount = tasks.filter((task) => task.status === "completed" && task.url).length;
  const selectedReviewId = reviewId ?? activeDraft?.reviewId ?? null;
  const mediaAttachTargetTask = useMemo(
    () => tasks.find((task) => task.id === mediaAttachTargetTaskId) ?? null,
    [mediaAttachTargetTaskId, tasks],
  );
  const mediaAttachTargetResolvedFrameIndex = mediaAttachTargetFrameIndex ?? 0;
  const mediaAttachTargetFrameRole = useMemo<StoryboardReferenceFrameRole>(() => {
    if (!mediaAttachTargetTask) return "reference";
    const role = mediaAttachTargetTask.referenceFrameRoles?.[mediaAttachTargetResolvedFrameIndex]
      ?? (mediaAttachTargetTask.generationExtraParams?.referenceFrameRoles as unknown[] | undefined)?.[mediaAttachTargetResolvedFrameIndex];
    return normalizeReferenceFrameRole(
      role,
      mediaAttachTargetTask.referenceUrls?.length === 1 ? "reference" : mediaAttachTargetResolvedFrameIndex === 0 ? "start" : "stop",
    );
  }, [mediaAttachTargetResolvedFrameIndex, mediaAttachTargetTask]);
  const mediaAttachTargetLabel = mediaAttachTargetTask
    ? `${storyboardReferenceFrameRoleLabel(mediaAttachTargetFrameRole, locale, true)} Shot ${mediaAttachTargetTask.index + 1}`
    : "";
  const setStoryboardMediaAttachTarget = useCallback((taskId: string | null, frameIndex?: 0 | 1 | null) => {
    setMediaAttachTargetTaskId(taskId);
    setMediaAttachTargetFrameIndex(taskId ? frameIndex ?? 0 : null);
  }, []);
  useEffect(() => {
    if (!mediaAttachTargetTaskId) return;
    if (tasks.some((task) => task.id === mediaAttachTargetTaskId)) return;
    setMediaAttachTargetTaskId(null);
    setMediaAttachTargetFrameIndex(null);
  }, [mediaAttachTargetTaskId, tasks]);
  const librarySearchResults = (librarySearchData?.results ?? []) as LibrarySearchResultItem[];
  const historyMediaTasks = useMemo(
    () => ((mediaHistoryData?.tasks ?? []) as any[]).filter((task) => Boolean(extractStoryboardMediaUrl(task, mediaPickerKind))),
    [mediaHistoryData?.tasks, mediaPickerKind],
  );
  const imageHistoryTasks = useMemo(
    () => ((imageHistoryData?.tasks ?? []) as any[])
      .map((task) => ({
        task,
        url: findStoryboardImageUrl(task),
        title: String(task?.prompt ?? task?.model ?? task?.mediaType ?? t("mediaStudio.storyboardReviewMediaHistoryItem")),
      }))
      .filter((item): item is { task: any; url: string; title: string } => Boolean(item.url)),
    [imageHistoryData?.tasks, t],
  );
  const visibleImageHistoryTasks = useMemo(
    () => isHistoryGalleryProductFilterActive && historyGalleryProductFilter
      ? imageHistoryTasks.filter((item) => storyboardHistoryTaskMatchesProduct(item.task, historyGalleryProductFilter))
      : imageHistoryTasks,
    [historyGalleryProductFilter, imageHistoryTasks, isHistoryGalleryProductFilterActive],
  );
  const historyGalleryProductFilterLabel = historyGalleryProductFilter?.productName
    || historyGalleryProductFilter?.productId
    || historyGalleryProductFilter?.itemId
    || "";
  const currentProjectName = activeDraft ? getStoryboardReviewName(activeDraft) : t("mediaStudio.storyboardReview");
  const storyboardVoiceoverSummaryText = useMemo(
    () => getStoryboardDraftVoiceoverSummary(activeDraft, locale),
    [activeDraft, locale],
  );
  useEffect(() => {
    if (isEditingVoiceoverSummary) return;
    setVoiceoverSummaryDraft(storyboardVoiceoverSummaryText);
  }, [isEditingVoiceoverSummary, storyboardVoiceoverSummaryText]);
  const filteredReviewProjects = useMemo(() => {
    const reviews = (reviewProjectsData?.reviews ?? []) as any[];
    const query = projectSearchQuery.trim().toLowerCase();
    if (!query) return reviews;
    return reviews.filter((item) => String(item?.name ?? "").toLowerCase().includes(query));
  }, [projectSearchQuery, reviewProjectsData?.reviews]);
  const storyboardAudioLimitReached = (activeDraft?.companionAudio.length ?? 0) >= 2;
  const canRecordVoiceover = typeof navigator !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== "undefined";

  useEffect(() => {
    if (!isEditingProjectName) {
      setProjectNameDraft(currentProjectName);
    }
  }, [currentProjectName, isEditingProjectName]);

  const saveCurrentDraft = useCallback(async (nextDraft: StoryboardReviewDraft) => {
    if (!nextDraft.reviewId && !canonicalReviewId) return;
    const id = nextDraft.reviewId ?? canonicalReviewId ?? undefined;
    const completedClipCount = nextDraft.tasks.filter((task) => task.status === "completed" && task.url).length;
    emitStoryboardReviewClientDebug("save.before", {
      id: id ?? null,
      nextDraft: summarizeStoryboardDraftForDebug(nextDraft),
    });
    try {
      const result = await saveReviewMutation.mutateAsync({
        id,
        name: getStoryboardReviewName(nextDraft),
        reviewData: nextDraft,
        clipCount: nextDraft.tasks.length,
        completedClipCount,
        thumbnailUrl: nextDraft.tasks.find((task) => task.url)?.url ?? null,
        debugSource: buildStoryboardReviewDebugSource("StoryboardReviewPage.saveCurrentDraft", nextDraft),
      });
      const returnedDraft = normalizeStoryboardReviewDraft(
        (result as { reviewData?: Partial<StoryboardReviewDraft> | null }).reviewData,
      );
      if (returnedDraft) {
        const serverDraft = {
          ...returnedDraft,
          reviewId: result.id,
          name: returnedDraft.name ?? nextDraft.name ?? null,
        };
        const savedDraft = preferCanonicalServerCompanionAudio(
          nextDraft,
          serverDraft,
          mergeFresherStoryboardReviewTasks(nextDraft, serverDraft),
        ) ?? nextDraft;
        emitStoryboardReviewClientDebug("save.after", {
          resultId: result.id,
          nextDraft: summarizeStoryboardDraftForDebug(nextDraft),
          returnedDraft: summarizeStoryboardDraftForDebug(serverDraft),
          savedDraft: summarizeStoryboardDraftForDebug(savedDraft),
        });
        draftRef.current = savedDraft;
        writeStoryboardReviewDraft(savedDraft);
        setDraft(savedDraft);
      } else if (!nextDraft.reviewId) {
        const savedDraft = { ...nextDraft, reviewId: result.id };
        emitStoryboardReviewClientDebug("save.after", {
          resultId: result.id,
          nextDraft: summarizeStoryboardDraftForDebug(nextDraft),
          returnedDraft: null,
          savedDraft: summarizeStoryboardDraftForDebug(savedDraft),
        });
        draftRef.current = savedDraft;
        writeStoryboardReviewDraft(savedDraft);
        setDraft(savedDraft);
      } else {
        emitStoryboardReviewClientDebug("save.after", {
          resultId: result.id,
          nextDraft: summarizeStoryboardDraftForDebug(nextDraft),
          returnedDraft: null,
          savedDraft: summarizeStoryboardDraftForDebug(nextDraft),
        });
      }
      void trpcUtils.videoEditorProjects.getStoryboardReview.invalidate({ id: result.id });
      void refetchReviews();
    } catch (error) {
      emitStoryboardReviewClientDebug("save.error", {
        id: id ?? null,
        nextDraft: summarizeStoryboardDraftForDebug(nextDraft),
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }, [canonicalReviewId, emitStoryboardReviewClientDebug, refetchReviews, saveReviewMutation, trpcUtils]);

  const persistDraftUpdate = useCallback(async (
    updater: (current: StoryboardReviewDraft) => StoryboardReviewDraft,
  ): Promise<StoryboardReviewDraft | null> => {
    const current = draftRef.current;
    if (!current) return null;
    if (reviewId && current.reviewId !== reviewId) return null;

    const updated = updater(current);
    if (updated === current) return current;
    const next = ensureDraftNewerThan(updated, current);
    emitStoryboardReviewClientDebug("persistDraftUpdate.localWrite", {
      before: summarizeStoryboardDraftForDebug(current),
      nextDraft: summarizeStoryboardDraftForDebug(next),
    });
    draftRef.current = next;
    writeStoryboardReviewDraft(next);
    setDraft(next);
    await saveCurrentDraft(next);
    return next;
  }, [emitStoryboardReviewClientDebug, reviewId, saveCurrentDraft]);

  const setAndSaveDraft = useCallback((updater: (current: StoryboardReviewDraft) => StoryboardReviewDraft) => {
    void persistDraftUpdate(updater).catch((error) => {
      toast.error(error instanceof Error ? error.message : t("mediaStudio.storyboardReviewSaveFailed"));
    });
  }, [persistDraftUpdate, t]);

  const resolveStoryboardReviewVideoModelRoute = useCallback((modelId: string) => {
    const normalizedModelId = normalizeStoryboardReviewVideoModelId(modelId) ?? modelId;
    const option = storyboardReviewVideoModelOptionById.get(normalizedModelId);
    const model = storyboardReviewVideoModelById.get(normalizedModelId);
    const resolvedTransport = resolveMediaModelTransportConfig({
      provider: model?.provider ?? option?.provider,
      modelId: normalizedModelId,
      configJson: model?.configJson,
    });
    const transport = {
      transport: resolvedTransport.transport === "mcp" || option?.transport === "mcp"
        ? "mcp" as const
        : "gateway_api" as const,
      providerKey: resolvedTransport.providerKey ?? option?.providerKey ?? undefined,
      providerModelId: resolvedTransport.providerModelId ?? option?.providerModelId ?? undefined,
      toolName: resolvedTransport.toolName ?? option?.toolName ?? undefined,
      argumentShape: resolvedTransport.argumentShape ?? option?.argumentShape ?? undefined,
    };
    const provider = option?.provider || String(model?.provider ?? transport.providerKey ?? "").trim();
    if (transport.transport !== "mcp") {
      return {
        provider,
        transport: "gateway_api" as const,
        transportMetadata: null,
      };
    }
    const connection = eligibleStoryboardVideoMcpConnections.find(item => {
      const providerKey = String(item?.providerKey ?? "").trim();
      return providerKey && providerKey === transport.providerKey;
    });
    return {
      provider: provider || transport.providerKey,
      transport: "mcp" as const,
      transportMetadata: connection
        ? {
            transport: "mcp" as const,
            connectionId: String(connection.id ?? connection.connectionId ?? ""),
            sharedGroupId:
              typeof connection.sharedGroupId === "number"
                ? connection.sharedGroupId
                : undefined,
            providerKey: transport.providerKey,
            providerModelId: transport.providerModelId,
            toolName: transport.toolName,
            argumentShape: transport.argumentShape,
            originSurface: "storyboard_review" as const,
          }
        : null,
    };
  }, [
    eligibleStoryboardVideoMcpConnections,
    storyboardReviewVideoModelById,
    storyboardReviewVideoModelOptionById,
  ]);

  const updateStoryboardReviewVideoOptions = useCallback((patch: {
    videoModel?: string;
    videoStructureMode?: VideoSegmentStructureMode;
    manualVideoGroupSize?: number;
    plannerOptions?: Partial<StoryboardPromptPlannerOptions>;
  }) => {
    setAndSaveDraft((current) => {
      const currentOptions = getStoryboardReviewVideoOptionValues(current, locale);
      const nextPlannerOptions = {
        ...currentOptions.plannerOptions,
        ...(patch.plannerOptions ?? {}),
      };
      const nextVideoModel = patch.videoModel ?? currentOptions.videoModel;
      const nextVideoStructureMode = patch.videoStructureMode ?? currentOptions.videoStructureMode;
      const nextManualVideoGroupSize = patch.manualVideoGroupSize ?? currentOptions.manualVideoGroupSize;
      if (
        nextVideoModel === currentOptions.videoModel &&
        nextVideoStructureMode === currentOptions.videoStructureMode &&
        nextManualVideoGroupSize === currentOptions.manualVideoGroupSize &&
        areStoryboardPromptPlannerOptionsEqual(nextPlannerOptions, currentOptions.plannerOptions)
      ) {
        return current;
      }
      const modelRoute = resolveStoryboardReviewVideoModelRoute(nextVideoModel);
      return applyStoryboardReviewVideoOptionsToDraft(current, {
        videoModel: nextVideoModel,
        videoStructureMode: nextVideoStructureMode,
        manualVideoGroupSize: nextManualVideoGroupSize,
        provider: modelRoute.provider,
        transport: modelRoute.transport,
        transportMetadata: modelRoute.transportMetadata,
        includeVoiceover: Boolean(nextPlannerOptions.includeVoiceover),
        speechMode: nextPlannerOptions.speechMode,
        speechLanguage: nextPlannerOptions.speechLanguage,
        includeSound: nextPlannerOptions.includeSound,
        promptTone: nextPlannerOptions.tone,
        promptLanguage: nextPlannerOptions.language,
        creativeBrief: null,
      });
    });
  }, [locale, resolveStoryboardReviewVideoModelRoute, setAndSaveDraft]);

  const updateStoryboardPromptPlannerOptions = useCallback((options: StoryboardPromptPlannerOptions) => {
    updateStoryboardReviewVideoOptions({ plannerOptions: options });
  }, [updateStoryboardReviewVideoOptions]);

  const createManualStoryboardReviewProject = useCallback(async () => {
    if (isCreatingManualReviewProject) return;
    const manualDraft = createManualStoryboardReviewDraft(locale);
    setIsCreatingManualReviewProject(true);
    try {
      const result = await saveReviewMutation.mutateAsync({
        name: getStoryboardReviewName(manualDraft),
        reviewData: manualDraft,
        clipCount: manualDraft.tasks.length,
        completedClipCount: 0,
        thumbnailUrl: null,
        debugSource: buildStoryboardReviewDebugSource("StoryboardReviewPage.createManualStoryboardReviewProject", manualDraft),
      });
      const returnedDraft = normalizeStoryboardReviewDraft(
        (result as { reviewData?: Partial<StoryboardReviewDraft> | null }).reviewData,
      );
      const savedDraft: StoryboardReviewDraft = {
        ...(returnedDraft ?? manualDraft),
        reviewId: result.id,
        name: returnedDraft?.name ?? manualDraft.name ?? null,
        manualHyperframesProductId:
          returnedDraft?.manualHyperframesProductId ?? manualDraft.manualHyperframesProductId ?? null,
        manualHyperframesRunId:
          returnedDraft?.manualHyperframesRunId ?? manualDraft.manualHyperframesRunId ?? null,
      };
      draftRef.current = savedDraft;
      writeStoryboardReviewDraft(savedDraft);
      setDraft(savedDraft);
      setRenderJobId(null);
      setSelectedLibraryItemId(null);
      setGalleryLightbox(null);
      setVideoPreview(null);
      setRightPanelTab("history_gallery");
      void trpcUtils.videoEditorProjects.getStoryboardReview.invalidate({ id: result.id });
      void refetchReviews();
      setLocation(`/storyboard-review/${result.id}`);
      toast.success(locale === "th" ? "สร้าง Manual Storyboard Project แล้ว" : "Manual Storyboard Project created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (locale === "th" ? "สร้าง Manual Storyboard Project ไม่สำเร็จ" : "Could not create Manual Storyboard Project."));
    } finally {
      setIsCreatingManualReviewProject(false);
    }
  }, [
    isCreatingManualReviewProject,
    locale,
    refetchReviews,
    saveReviewMutation,
    setLocation,
    trpcUtils.videoEditorProjects.getStoryboardReview,
  ]);

  const saveProjectName = useCallback(() => {
    const name = projectNameDraft.trim();
    if (!activeDraft || !name) return;
    setIsEditingProjectName(false);
    setAndSaveDraft((current) => ({
      ...current,
      name,
      updatedAt: Date.now(),
    }));
  }, [activeDraft, projectNameDraft, setAndSaveDraft]);

		  useEffect(() => {
		    if (!reviewId || !activeDraft || activeDraft.reviewId !== reviewId) return;
		    if (isReviewLoading || isReviewFetching) return;
		    if (!serverBackedDraft || serverBackedDraft.reviewId !== reviewId) return;
		    if (serverBackedDraft.updatedAt === activeDraft.updatedAt) {
		      lastLocalResyncAtRef.current = activeDraft.updatedAt;
		      return;
		    }
		    if (storyboardDraftContentMatches(activeDraft, serverBackedDraft)) {
		      lastLocalResyncAtRef.current = activeDraft.updatedAt;
		      return;
		    }
		    if (!isDraftNewerThan(activeDraft, serverBackedDraft)) return;
		    if (lastLocalResyncAtRef.current === activeDraft.updatedAt) return;

		    lastLocalResyncAtRef.current = activeDraft.updatedAt;
		    void saveCurrentDraft(activeDraft).catch((error) => {
		      toast.error(error instanceof Error ? error.message : t("mediaStudio.storyboardReviewSaveFailed"));
		    });
		  }, [
		    activeDraft,
		    isReviewFetching,
		    isReviewLoading,
		    reviewId,
		    saveCurrentDraft,
		    serverBackedDraft,
		    t,
		  ]);

  const uploadReferenceFrameDataUrl = useCallback(async (
    dataUrl: string,
    fileName: string,
    fileType = dataUrlToMimeType(dataUrl),
  ): Promise<string> => {
    const result = await uploadMutation.mutateAsync({
      fileName,
      fileType,
      fileBase64: dataUrl,
    });
    return result.url;
  }, [uploadMutation]);

  const cropReferenceFrameToShotAspect = useCallback(async (
    imageUrl: string,
    aspectRatio: string | undefined,
    fileName: string,
  ): Promise<string> => {
    const uploadDataUrlIfNeeded = async (value: string) => {
      if (!value.startsWith("data:image/")) return value;
      return uploadReferenceFrameDataUrl(value, fileName, dataUrlToMimeType(value, "image/jpeg"));
    };

    const targetAspectRatio = normalizeVideoFrameAspectRatio(aspectRatio);
    if (!targetAspectRatio) {
      return uploadDataUrlIfNeeded(imageUrl);
    }

    try {
      const image = await loadImage(imageUrl);
      if (isCloseToAspectRatio(image.naturalWidth, image.naturalHeight, targetAspectRatio)) {
        return uploadDataUrlIfNeeded(imageUrl);
      }

      const cropped = await cropImageToAspect(imageUrl, targetAspectRatio, "image/jpeg", 0.94);
      const uploadedUrl = await uploadReferenceFrameDataUrl(
        cropped.dataUrl,
        `${fileName.replace(/\.[a-z0-9]+$/i, "")}-${targetAspectRatio.replace(":", "x")}.jpg`,
        "image/jpeg",
      );
      toast.success(t("mediaStudio.storyboardReviewFrameCropped", { ratio: targetAspectRatio }));
      return uploadedUrl;
    } catch (error) {
      console.warn("Failed to crop storyboard reference frame:", error);
      toast.warning(t("mediaStudio.storyboardReviewFrameCropFallback"));
      return imageUrl;
    }
  }, [t, uploadReferenceFrameDataUrl]);

  const replaceReferenceFrame = useCallback(async (taskId: string, frameIndex: 0 | 1, imageUrl: string) => {
    const task = draft?.tasks.find((item) => item.id === taskId);
    const aspectRatio = task?.storyboardContext?.aspectRatio;
    const frameName = frameIndex === 0
      ? t("mediaStudio.storyboardReviewStartFrame")
      : t("mediaStudio.storyboardReviewEndFrame");
    const key = `${taskId}:${frameIndex}`;
    setReplacingReferenceFrameKey(key);
    try {
      const preparedUrl = await cropReferenceFrameToShotAspect(
        imageUrl.trim(),
        aspectRatio,
        `storyboard-${taskId}-${frameIndex === 0 ? "start" : "end"}.jpg`,
      );
      setAndSaveDraft((current) => replaceStoryboardReferenceFrame(current, {
        taskId,
        frameIndex,
        image: { url: preparedUrl, name: frameName },
        statusDetail: t("mediaStudio.storyboardReviewFrameChangedStatus"),
      }));
      toast.success(t("mediaStudio.storyboardReviewFrameReplaced"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("mediaStudio.storyboardReviewFrameReplaceFailed"));
    } finally {
      setReplacingReferenceFrameKey(null);
    }
  }, [cropReferenceFrameToShotAspect, draft?.tasks, setAndSaveDraft, t]);

  const uploadReferenceFrameFiles = useCallback(async (taskId: string, frameIndex: 0 | 1, files: FileList | File[]): Promise<string[]> => {
    const file = Array.from(files).find((candidate) => candidate.type.startsWith("image/"));
    if (!file) {
      toast.error(t("mediaStudio.storyboardReviewFrameUploadImageOnly"));
      return [];
    }

    const task = draft?.tasks.find((item) => item.id === taskId);
    const aspectRatio = task?.storyboardContext?.aspectRatio;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const preparedDataUrl = await (async () => {
      const targetAspectRatio = normalizeVideoFrameAspectRatio(aspectRatio);
      if (!targetAspectRatio) return dataUrl;
      try {
        const image = await loadImage(dataUrl);
        if (isCloseToAspectRatio(image.naturalWidth, image.naturalHeight, targetAspectRatio)) {
          return dataUrl;
        }
        const cropped = await cropImageToAspect(dataUrl, targetAspectRatio, "image/jpeg", 0.94);
        toast.success(t("mediaStudio.storyboardReviewFrameCropped", { ratio: targetAspectRatio }));
        return cropped.dataUrl;
      } catch (error) {
        console.warn("Failed to crop uploaded storyboard reference frame:", error);
        toast.warning(t("mediaStudio.storyboardReviewFrameCropFallback"));
        return dataUrl;
      }
    })();

    const uploadType = dataUrlToMimeType(preparedDataUrl, file.type || "image/jpeg");
    const extension = uploadType.includes("png") ? "png" : uploadType.includes("webp") ? "webp" : "jpg";
    const uploadedUrl = await uploadReferenceFrameDataUrl(
      preparedDataUrl,
      `storyboard-frame-${taskId}-${frameIndex === 0 ? "start" : "end"}.${extension}`,
      uploadType,
    );
    return [uploadedUrl];
  }, [draft?.tasks, t, uploadReferenceFrameDataUrl]);

  const moveStoryboardTask = useCallback((taskId: string, direction: "up" | "down") => {
    setAndSaveDraft((current) => {
      const nextTaskIds = [...current.taskIds];
      const index = nextTaskIds.indexOf(taskId);
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= nextTaskIds.length) {
        return current;
      }
      [nextTaskIds[index], nextTaskIds[targetIndex]] = [nextTaskIds[targetIndex]!, nextTaskIds[index]!];
      return normalizeDraftTaskOrder(current, nextTaskIds);
    });
  }, [setAndSaveDraft]);

  const removeStoryboardTask = useCallback((taskId: string) => {
    setAndSaveDraft((current) => normalizeDraftTaskOrder(
      {
        ...current,
        tasks: current.tasks.filter((task) => task.id !== taskId),
        selectedTaskIds: current.selectedTaskIds.filter((id) => id !== taskId),
      },
      current.taskIds.filter((id) => id !== taskId),
    ));
  }, [setAndSaveDraft]);

  const updateStoryboardTaskTransition = useCallback((taskId: string, transition?: StoryboardClipTransition) => {
    const normalizedTransition = normalizeStoryboardClipTransition(transition);
    setAndSaveDraft((current) => ({
      ...current,
      updatedAt: Date.now(),
      projectLink: null,
      renderJobId: null,
      compoundStatus: null,
      tasks: current.tasks.map((task) => (
        task.id === taskId
          ? { ...task, transition: normalizedTransition, updatedAt: Date.now() }
          : task
      )),
    }));
  }, [setAndSaveDraft]);

  const updateTaskExtraParams = useCallback((taskId: string, extraParams: Record<string, unknown>) => {
    setAndSaveDraft((current) => ({
      ...current,
      updatedAt: Date.now(),
      projectLink: null,
      renderJobId: null,
      compoundStatus: null,
      tasks: current.tasks.map((task) => (
        task.id === taskId && task.storyboardContext
          ? {
              ...task,
              updatedAt: Date.now(),
              storyboardContext: {
                ...task.storyboardContext,
                extraParams,
              },
            }
          : task
      )),
    }));
  }, [setAndSaveDraft]);

  const removeStoryboardAudio = useCallback((audioId: string) => {
    const now = Date.now();
    emitStoryboardReviewClientDebug("audio.remove.requested", {
      audioId,
      before: summarizeStoryboardDraftForDebug(draftRef.current),
    });
    setAndSaveDraft((current) => {
      const next = {
        ...current,
        updatedAt: now,
        companionAudio: current.companionAudio.filter((audio) => audio.id !== audioId),
        companionAudioUpdatedAt: now,
      };
      emitStoryboardReviewClientDebug("audio.remove.nextDraft", {
        audioId,
        nextDraft: summarizeStoryboardDraftForDebug(next),
      });
      return next;
    });
  }, [emitStoryboardReviewClientDebug, setAndSaveDraft]);

  const importStoryboardAssetForRender = useCallback(async (
    url: string,
    mediaType: "audio" | "video" | "image",
  ): Promise<string> => {
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      return normalizedUrl;
    }
    if (normalizedUrl.startsWith("data:") || normalizedUrl.startsWith("blob:")) {
      const fallbackMime = mediaType === "audio" ? "audio/mpeg" : mediaType === "video" ? "video/mp4" : "image/jpeg";
      const file = normalizedUrl.startsWith("data:")
        ? dataUrlToFile(
            normalizedUrl,
            `storyboard-${mediaType}-${Date.now()}.${storyboardUploadExtensionForMime(dataUrlToMimeType(normalizedUrl, fallbackMime), mediaType)}`,
          )
        : await fetch(normalizedUrl, { credentials: "include" })
            .then((response) => response.blob())
            .then((blob) => new File(
              [blob],
              `storyboard-${mediaType}-${Date.now()}.${storyboardUploadExtensionForMime(blob.type || fallbackMime, mediaType)}`,
              { type: blob.type || fallbackMime },
            ));
      const result = await storyboardUploadAssetResolver.uploadAsset(file).promise;
      return result.uri;
    }
    if (!shouldImportStoryboardRemoteAsset(normalizedUrl)) {
      return normalizedUrl;
    }
    const result = await storyboardUploadAssetResolver.importRemoteAsset(normalizedUrl, { mediaType });
    return result.uri;
  }, []);

  const addImportedMediaToStoryboard = useCallback((input: {
    idPrefix: string;
    title: string;
    url: string;
    mediaType?: StoryboardClipMediaType;
    model?: string | null;
    durationSeconds?: number;
    aspectRatio?: string;
  }) => {
    const url = input.url.trim();
    if (!url) {
      toast.error(t("mediaStudio.storyboardReviewNoVideoUrl"));
      return;
    }
    const mediaType: StoryboardClipMediaType = input.mediaType ?? (isProbablyImageUrl(url) ? "image" : "video");
    setAndSaveDraft((current) => {
      const task = createImportedMediaTask({
        idPrefix: input.idPrefix,
        title: input.title,
        url,
        mediaType,
        model: input.model,
        importedLabel: t("mediaStudio.storyboardReviewImported"),
        importedClipLabel: mediaType === "image"
          ? (locale === "th" ? "ภาพนิ่งที่นำเข้า" : "Imported image")
          : t("mediaStudio.storyboardReviewImportedClip"),
        durationSeconds: mediaType === "image"
          ? input.durationSeconds ?? DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS
          : input.durationSeconds,
        aspectRatio: input.aspectRatio,
        index: current.taskIds.length,
      });
      return normalizeDraftTaskOrder(
        {
          ...current,
          tasks: [...current.tasks, task],
          selectedTaskIds: [...current.selectedTaskIds, task.id],
        },
        [...current.taskIds, task.id],
      );
    });
    toast.success(mediaType === "image"
      ? (locale === "th" ? "เพิ่มภาพนิ่งเข้า Storyboard แล้ว" : "Image shot added to storyboard")
      : t("mediaStudio.storyboardReviewVideoAdded"));
  }, [locale, setAndSaveDraft, t]);

  const uploadVideoToStoryboardSlot = useCallback(async (
    taskId: string,
    mode: "replace" | "insert-after",
    media?: File | FileList | File[] | string | { url: string; mediaType: StoryboardClipMediaType },
  ) => {
    const selectedMedia = media ?? await new Promise<File | null>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "video/*,image/*";
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.click();
    });
    if (!selectedMedia) return;

    let file: File | null = null;
    let uploadedUrl = "";
    let mediaType: StoryboardClipMediaType = "video";
    let title = "";
    let durationSeconds: number | undefined;
    let aspectRatio: "9:16" | "16:9" | undefined;

    if (typeof selectedMedia === "string" || (typeof selectedMedia === "object" && !Array.isArray(selectedMedia) && "url" in selectedMedia)) {
      const sourceUrl = (typeof selectedMedia === "string" ? selectedMedia : selectedMedia.url).trim();
      if (!sourceUrl) return;
      mediaType = typeof selectedMedia === "object" && !Array.isArray(selectedMedia) && "mediaType" in selectedMedia
        ? selectedMedia.mediaType
        : isProbablyImageUrl(sourceUrl) || sourceUrl.startsWith("data:image/") || sourceUrl.startsWith("blob:")
        ? "image"
        : "video";
      if (sourceUrl.startsWith("data:image/")) {
        const mimeType = dataUrlToMimeType(sourceUrl, "image/jpeg");
        const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
        file = dataUrlToFile(sourceUrl, `storyboard-shot-${taskId}-${Date.now()}.${extension}`);
        title = file.name;
      } else if (sourceUrl.startsWith("blob:")) {
        const blob = await fetch(sourceUrl).then((response) => response.blob());
        const extension = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : blob.type.startsWith("video/") ? "mp4" : "jpg";
        file = new File([blob], `storyboard-shot-${taskId}-${Date.now()}.${extension}`, { type: blob.type || (mediaType === "image" ? "image/jpeg" : "video/mp4") });
        title = file.name;
      } else if (mediaType === "image" && !/^https?:\/\//i.test(sourceUrl)) {
        const blob = await fetch(sourceUrl, { credentials: "include" }).then((response) => response.blob());
        const extension = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
        file = new File([blob], `storyboard-shot-${taskId}-${Date.now()}.${extension}`, { type: blob.type || "image/jpeg" });
        title = sourceUrl.split("/").pop()?.split("?")[0] || file.name;
      } else {
        uploadedUrl = normalizeStoryboardMediaUrl(sourceUrl);
        title = sourceUrl.split("/").pop()?.split("?")[0] || (mediaType === "image" ? "Imported image" : "Imported clip");
      }
    } else {
      file = selectedMedia instanceof File
        ? selectedMedia
        : Array.from(selectedMedia).find((candidate) =>
          isStoryboardMediaFile(candidate)
        ) ?? null;
      if (!file) return;
      mediaType = isStoryboardImageFile(file) ? "image" : "video";
      title = file.name;
    }

    if (file && !isStoryboardMediaFile(file)) {
      toast.error(t("mediaStudio.storyboardReviewUploadVideoOnly"));
      return;
    }
    if (!draftRef.current?.taskIds.includes(taskId)) {
      toast.error(t("mediaStudio.storyboardReviewSaveFailed"));
      return;
    }

    const key = `${taskId}:${mode}`;
    setUploadingVideoSlotKey(key);
    try {
      if (file) {
        const [uploadResult, metadata] = await Promise.all([
          storyboardUploadAssetResolver.uploadAsset(file).promise,
          mediaType === "image" ? readImageMetadata(file) : readVideoMetadata(file),
        ]);
        uploadedUrl = uploadResult.uri;
        durationSeconds = mediaType === "image" ? undefined : (metadata as { durationSeconds?: number }).durationSeconds;
        aspectRatio = metadata.aspectRatio;
      }

      setRenderJobId(null);
      const savedDraft = await persistDraftUpdate((current) => {
        const slotIndex = current.taskIds.indexOf(taskId);
        if (slotIndex < 0) return current;
        const targetTask = current.tasks.find((task) => task.id === taskId);
        const importedTask = createImportedMediaTask({
          idPrefix: `uploaded-${mediaType}-${mode}`,
          title,
          url: uploadedUrl,
          mediaType,
          model: mediaType === "image"
            ? (locale === "th" ? "ภาพนิ่งที่อัปโหลด" : "Uploaded image")
            : t("mediaStudio.storyboardReviewUploadedVideo"),
          importedLabel: t("mediaStudio.storyboardReviewImported"),
          importedClipLabel: mediaType === "image"
            ? (locale === "th" ? "ภาพนิ่งที่อัปโหลด" : "Uploaded image")
            : t("mediaStudio.storyboardReviewUploadedVideo"),
          durationSeconds: mediaType === "image"
            ? targetTask?.durationSeconds ?? DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS
            : durationSeconds,
          aspectRatio,
          index: mode === "replace" ? slotIndex : slotIndex + 1,
        });
        return replaceStoryboardVideoSlot(current, {
          taskId,
          mode,
          importedTask,
        });
      });
      if (!savedDraft) {
        throw new Error(t("mediaStudio.storyboardReviewSaveFailed"));
      }

      toast.success(
        mode === "replace"
          ? t("mediaStudio.storyboardReviewVideoSlotReplaced")
          : t("mediaStudio.storyboardReviewVideoSlotInserted"),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("mediaStudio.storyboardReviewVideoSlotUploadFailed"));
    } finally {
      setUploadingVideoSlotKey(null);
    }
  }, [locale, persistDraftUpdate, t]);

  const attachImageToSelectedReferenceFrame = useCallback(async (
    imageUrl: string,
    title: string,
  ) => {
    const targetTaskId = mediaAttachTargetTaskId?.trim();
    if (!targetTaskId) {
      toast.error(locale === "th"
        ? "เลือกช่องรูปด้านบนของ Shot ก่อน แล้วแตะภาพเพื่อใส่ช่องนั้น"
        : "Select a shot's top image slot first, then tap an image to attach it.");
      return;
    }
    if (!tasks.some((task) => task.id === targetTaskId)) {
      setMediaAttachTargetTaskId(null);
      setMediaAttachTargetFrameIndex(null);
      toast.error(locale === "th"
        ? "Shot ปลายทางไม่อยู่ในโปรเจกต์นี้แล้ว กรุณาเลือกใหม่"
        : "That target shot is no longer in this project. Please select another shot.");
      return;
    }
    const url = imageUrl.trim();
    if (!url) return;
    await replaceReferenceFrame(targetTaskId, mediaAttachTargetResolvedFrameIndex, url);
    toast.success(locale === "th"
      ? `ใส่ภาพ "${title}" ใน ${mediaAttachTargetLabel || "ช่องรูปที่เลือก"} แล้ว`
      : `Attached "${title}" to ${mediaAttachTargetLabel || "the selected image slot"}.`);
  }, [
    locale,
    mediaAttachTargetLabel,
    mediaAttachTargetResolvedFrameIndex,
    mediaAttachTargetTaskId,
    replaceReferenceFrame,
    tasks,
  ]);

  const addImportedAudioToStoryboard = useCallback(async (input: {
    idPrefix: string;
    title: string;
    url: string;
    model?: string | null;
    kind?: StoryboardCompanionAudioCandidate["kind"];
    durationSeconds?: number;
  }) => {
    const url = input.url.trim();
    if (!url) {
      toast.error(t("mediaStudio.storyboardReviewNoAudioUrl"));
      return;
    }
    if ((activeDraft?.companionAudio.length ?? 0) >= 2) {
      toast.error(t("mediaStudio.storyboardReviewAudioLimit"));
      return;
    }
    emitStoryboardReviewClientDebug("audio.add.requested", {
      input: {
        idPrefix: input.idPrefix,
        title: input.title.slice(0, 140),
        model: input.model?.slice(0, 100) ?? null,
        durationSeconds: input.durationSeconds ?? null,
      },
      before: summarizeStoryboardDraftForDebug(draftRef.current),
    });
    let storedUrl = url;
    try {
      storedUrl = await importStoryboardAssetForRender(url, "audio");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("mediaStudio.storyboardReviewNoAudioUrl"));
      return;
    }
    setAndSaveDraft((current) => {
      if (current.companionAudio.length >= 2) {
        toast.error(t("mediaStudio.storyboardReviewAudioLimit"));
        return current;
      }
      const targetDurationSeconds = buildStoryboardVideoProject(
        storyboardDraftToReviewTasks(current)
          .filter((task) => current.selectedTaskIds.includes(task.id) && task.status === "completed" && task.url)
          .map((task) => ({
            id: task.id,
            prompt: task.prompt,
            url: task.url!,
            durationSeconds: task.durationSeconds,
            mediaType: task.mediaType,
            transition: task.transition,
          })),
      )?.settings.duration;
      const audio = createImportedAudioTrack({
        idPrefix: input.idPrefix,
        title: input.title,
        url: storedUrl,
        model: input.model,
        kind: input.kind,
        importedLabel: t("mediaStudio.storyboardReviewImported"),
        importedAudioLabel: t("mediaStudio.storyboardReviewImportedAudio"),
        durationSeconds: input.durationSeconds,
        targetDurationSeconds,
      });
      const now = Date.now();
      const next = {
        ...current,
        updatedAt: now,
        companionAudio: [...current.companionAudio, audio],
        companionAudioUpdatedAt: now,
      };
      emitStoryboardReviewClientDebug("audio.add.nextDraft", {
        addedAudio: summarizeStoryboardAudioForDebug(audio),
        nextDraft: summarizeStoryboardDraftForDebug(next),
      });
      return next;
    });
    toast.success(t("mediaStudio.storyboardReviewAudioAdded"));
  }, [activeDraft?.companionAudio.length, emitStoryboardReviewClientDebug, importStoryboardAssetForRender, setAndSaveDraft, t]);

  const startVoiceoverRecording = useCallback(async () => {
    if (!activeDraft) {
      toast.error(locale === "th" ? "ยังไม่มี Storyboard Review ที่เปิดอยู่" : "No storyboard review is open.");
      return;
    }
    if ((activeDraft.companionAudio.length ?? 0) >= 2) {
      toast.error(t("mediaStudio.storyboardReviewAudioLimit"));
      return;
    }
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setMicrophoneStatus("error");
      setMicrophoneError(locale === "th" ? "เบราว์เซอร์นี้ยังไม่รองรับการอัดเสียงจากไมก์" : "This browser does not support microphone recording.");
      return;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      return;
    }

    try {
      const audioConstraint: boolean | MediaTrackConstraints = selectedAudioInputDeviceId
        ? { deviceId: { exact: selectedAudioInputDeviceId } }
        : true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint });
      const mimeType = pickStoryboardAudioRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      const startedAt = Date.now();
      recordingStartedAtRef.current = startedAt;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          recordingChunksRef.current.push(event.data);
        }
      };
      recorder.onerror = (event) => {
        const error = (event as Event & { error?: Error }).error;
        setMicrophoneStatus("error");
        setMicrophoneError(error?.message ?? (locale === "th" ? "อัดเสียงไม่สำเร็จ" : "Recording failed."));
      };
      recorder.onstop = () => {
        void (async () => {
          const chunks = recordingChunksRef.current;
          recordingChunksRef.current = [];
          const recordedStartedAt = recordingStartedAtRef.current;
          recordingStartedAtRef.current = null;
          const durationSeconds = recordedStartedAt
            ? Math.max(1, Math.round((Date.now() - recordedStartedAt) / 1000))
            : undefined;
          const blobType = recorder.mimeType || mimeType || "audio/webm";
          const blob = new Blob(chunks, { type: blobType });
          mediaRecorderRef.current = null;
          stopMicrophoneStream();
          if (!isStoryboardReviewMountedRef.current) return;
          setIsRecordingVoiceover(false);
          setRecordingStartedAt(null);
          setRecordingElapsedSeconds(0);
          if (!blob.size) {
            toast.error(locale === "th" ? "ไม่พบเสียงที่อัดไว้" : "No recorded audio was captured.");
            return;
          }
          const objectUrl = URL.createObjectURL(blob);
          try {
            const recordedAtLabel = new Date().toLocaleString(locale === "th" ? "th-TH" : "en-US");
            await addImportedAudioToStoryboard({
              idPrefix: "mic-voiceover",
              title: locale === "th" ? `เสียงพากย์จากไมก์ ${recordedAtLabel}` : `Microphone voiceover ${recordedAtLabel}`,
              url: objectUrl,
              model: locale === "th" ? "อัดจากไมโครโฟน" : "Microphone recording",
              kind: "voiceover",
              durationSeconds,
            });
          } finally {
            URL.revokeObjectURL(objectUrl);
          }
        })();
      };

      recorder.start();
      setMicrophoneStatus("ready");
      setMicrophoneError("");
      setIsRecordingVoiceover(true);
      setRecordingStartedAt(startedAt);
      setRecordingElapsedSeconds(0);
      void refreshAudioInputDevices();
    } catch (error) {
      stopMicrophoneStream();
      mediaRecorderRef.current = null;
      recordingStartedAtRef.current = null;
      setIsRecordingVoiceover(false);
      setRecordingStartedAt(null);
      setMicrophoneStatus("error");
      setMicrophoneError(error instanceof Error ? error.message : (locale === "th" ? "เปิดไมก์ไม่สำเร็จ" : "Unable to open microphone."));
    }
  }, [activeDraft, addImportedAudioToStoryboard, locale, refreshAudioInputDevices, selectedAudioInputDeviceId, stopMicrophoneStream, t]);

  const stopVoiceoverRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      stopMicrophoneStream();
      setIsRecordingVoiceover(false);
      setRecordingStartedAt(null);
      setRecordingElapsedSeconds(0);
      return;
    }
    if (recorder.state === "inactive") {
      mediaRecorderRef.current = null;
      stopMicrophoneStream();
      setIsRecordingVoiceover(false);
      setRecordingStartedAt(null);
      setRecordingElapsedSeconds(0);
      return;
    }

    try {
      if (recorder.state === "recording" && typeof recorder.requestData === "function") {
        recorder.requestData();
      }
      recorder.stop();
      setMicrophoneError("");
      window.setTimeout(() => {
        if (mediaRecorderRef.current !== recorder || recorder.state === "inactive") return;
        mediaRecorderRef.current = null;
        recordingStartedAtRef.current = null;
        recordingChunksRef.current = [];
        stopMicrophoneStream();
        setIsRecordingVoiceover(false);
        setRecordingStartedAt(null);
        setRecordingElapsedSeconds(0);
        setMicrophoneStatus("error");
        setMicrophoneError(locale === "th" ? "หยุดอัดเสียงไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" : "Unable to stop recording. Please try again.");
      }, 1500);
    } catch (error) {
      mediaRecorderRef.current = null;
      recordingStartedAtRef.current = null;
      recordingChunksRef.current = [];
      stopMicrophoneStream();
      setIsRecordingVoiceover(false);
      setRecordingStartedAt(null);
      setRecordingElapsedSeconds(0);
      setMicrophoneStatus("error");
      setMicrophoneError(error instanceof Error ? error.message : (locale === "th" ? "หยุดอัดเสียงไม่สำเร็จ" : "Unable to stop recording."));
    }
  }, [locale, stopMicrophoneStream]);

  const addLibraryItemToStoryboard = useCallback((item: LibrarySearchResultItem) => {
    setSelectedLibraryItemId(item.item_id);
    const sourceUrl = extractStoryboardMediaUrl(item, mediaPickerKind);
    if (!sourceUrl) {
      toast.error(t("mediaStudio.storyboardReviewNoReusableUrl"));
      return;
    }
    if (mediaPickerKind === "audio") {
      void addImportedAudioToStoryboard({
        idPrefix: `library-audio-${item.item_id}`,
        title: item.title,
        url: sourceUrl,
        model: item.model_name,
        durationSeconds: extractDurationSeconds(item),
      });
      return;
    }
    addImportedMediaToStoryboard({
      idPrefix: `library-video-${item.item_id}`,
      title: item.title,
      url: sourceUrl,
      mediaType: "video",
      model: item.model_name,
    });
  }, [addImportedAudioToStoryboard, addImportedMediaToStoryboard, mediaPickerKind]);

  const addHistoryTaskToStoryboard = useCallback((task: any) => {
    const resultUrl = extractStoryboardMediaUrl(task, mediaPickerKind);
    if (!resultUrl) {
      toast.error(t("mediaStudio.storyboardReviewNoReusableUrl"));
      return;
    }
    if (mediaPickerKind === "audio") {
      void addImportedAudioToStoryboard({
        idPrefix: `history-audio-${task.id || task.taskId || "item"}`,
        title: task.prompt || t("mediaStudio.storyboardReviewMediaHistoryAudio"),
        url: resultUrl,
        model: task.model,
        durationSeconds: extractDurationSeconds(task),
      });
      return;
    }
    addImportedMediaToStoryboard({
      idPrefix: `history-video-${task.id || task.taskId || "item"}`,
      title: task.prompt || t("mediaStudio.storyboardReviewMediaHistoryClip"),
      url: resultUrl,
      mediaType: "video",
      model: task.model,
      durationSeconds: extractDurationSeconds(task),
    });
  }, [addImportedAudioToStoryboard, addImportedMediaToStoryboard, mediaPickerKind, t]);

  const addImageUrlAsStoryboardShot = useCallback(async (imageUrl: string, title: string) => {
    const sourceUrl = imageUrl.trim();
    if (!sourceUrl) return;
    try {
      let storedUrl = sourceUrl;
      let aspectRatio: "9:16" | "16:9" | undefined;
      if (sourceUrl.startsWith("data:image/") || sourceUrl.startsWith("blob:") || !/^https?:\/\//i.test(sourceUrl)) {
        const file = sourceUrl.startsWith("data:image/")
          ? dataUrlToFile(
              sourceUrl,
              `storyboard-image-shot-${Date.now()}.${dataUrlToMimeType(sourceUrl).includes("png") ? "png" : "jpg"}`,
            )
          : await fetch(sourceUrl, { credentials: "include" })
              .then((response) => response.blob())
              .then((blob) => new File(
                [blob],
                `storyboard-image-shot-${Date.now()}.${blob.type.includes("png") ? "png" : "jpg"}`,
                { type: blob.type || "image/jpeg" },
              ));
        const [uploadResult, metadata] = await Promise.all([
          storyboardUploadAssetResolver.uploadAsset(file).promise,
          readImageMetadata(file),
        ]);
        storedUrl = uploadResult.uri;
        aspectRatio = metadata.aspectRatio;
      }
      addImportedMediaToStoryboard({
        idPrefix: "history-image",
        title,
        url: storedUrl,
        mediaType: "image",
        model: locale === "th" ? "ภาพนิ่งที่นำเข้า" : "Imported image",
        durationSeconds: DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS,
        aspectRatio,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (locale === "th" ? "เพิ่มภาพนิ่งไม่สำเร็จ" : "Failed to add image shot"));
    }
  }, [addImportedMediaToStoryboard, locale]);

  const startStoryboardImageDrag = useCallback((
    event: DragEvent<HTMLElement>,
    input: { url: string; title: string; filename?: string },
  ) => {
    const filename = input.filename ?? `${input.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "storyboard-image"}.jpg`;
    const storageKey = input.url.startsWith("data:image/")
      ? `smartaihub:storyboard-drag-image:${Date.now()}:${Math.random().toString(36).slice(2)}`
      : "";
    if (storageKey) {
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify({
          mediaType: "image",
          url: input.url,
          title: input.title,
          filename,
          createdAt: Date.now(),
        }));
      } catch {
        // Continue with inline drag payloads when sessionStorage is unavailable.
      }
    }
    const setDragData = (type: string, value: string) => {
      try {
        event.dataTransfer.setData(type, value);
      } catch {
        // Some browsers reject large data URLs for standard drag payload types.
      }
    };
    event.dataTransfer.effectAllowed = "copy";
    const dragUrl = storageKey ? `storyboard-drag:${storageKey}` : input.url;
    setDragData("text/uri-list", dragUrl);
    setDragData("text/plain", dragUrl);
    setDragData("application/x-smartspec-storyboard-image", JSON.stringify({
      mediaType: "image",
      url: storageKey ? undefined : input.url,
      storageKey: storageKey || undefined,
      title: input.title,
      filename,
    }));
    setDragData("application/x-smartspec-media-url", dragUrl);
    setDragData("application/x-smartspec-media-type", "image");
    setDragData("text/x-smartspec-media-type", "image");
    setDragData("DownloadURL", `image/jpeg:${filename}:${dragUrl}`);
  }, []);

  const downloadStoryboardImage = useCallback((url: string, title: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "storyboard-image"}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const downloadStoryboardMedia = useCallback((url: string, title: string, extension = "mp4") => {
    const cleanExtension = extension.replace(/[^a-z0-9]+/gi, "").toLowerCase() || "mp4";
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "storyboard-media"}.${cleanExtension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const downloadHyperframesSubtitleSidecar = useCallback((
    content: string,
    title: string,
    extension: "vtt" | "srt",
  ) => {
    const blob = new Blob([content], {
      type: extension === "vtt" ? "text/vtt;charset=utf-8" : "application/x-subrip;charset=utf-8",
    });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "storyboard-subtitle"}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }, []);

  const previewLibraryVideo = useCallback((item: LibrarySearchResultItem) => {
    const sourceUrl = extractStoryboardMediaUrl(item, "video");
    if (!sourceUrl) {
      toast.error(t("mediaStudio.storyboardReviewNoReusableUrl"));
      return;
    }
    setSelectedLibraryItemId(item.item_id);
    setVideoPreview({
      url: sourceUrl,
      title: item.title,
      subtitle: `${item.item_type} • ${item.model_name || item.source || "Library"}`,
    });
  }, [t]);

  const previewHistoryVideo = useCallback((task: any) => {
    const sourceUrl = extractStoryboardMediaUrl(task, "video");
    if (!sourceUrl) {
      toast.error(t("mediaStudio.storyboardReviewNoReusableUrl"));
      return;
    }
    setVideoPreview({
      url: sourceUrl,
      title: task.prompt || t("mediaStudio.storyboardReviewMediaHistoryClip"),
      subtitle: task.model || task.mediaType || "Media History",
    });
  }, [t]);

  const updateSplitPreview = useCallback(async (rows: number, cols: number, sourceUrl = imageToolsSourceUrl) => {
    if (!sourceUrl) return;
    setSplitGridRows(rows);
    setSplitGridCols(cols);
    setSplitResults([]);
    try {
      setSplitPreviewUrl(await createSplitPreview(sourceUrl, rows, cols));
    } catch (error) {
      console.warn("Failed to create storyboard split preview:", error);
      setSplitPreviewUrl(null);
    }
  }, [imageToolsSourceUrl]);

  const openStoryboardImageTools = useCallback(async (
    imageUrl: string,
    mode: StoryboardImageEditorMode = "split",
    title = "History image",
    options?: { rows?: number; cols?: number; forceGrid?: boolean },
  ) => {
    const sourceUrl = toCanvasSafeStoryboardImageUrl(imageUrl);
    setRightPanelTab("history_gallery");
    setIsImageToolsPanelOpen(true);
    setImageToolsSourceUrl(sourceUrl);
    setImageToolsSourceTitle(title);
    setImageEditorMode(mode);
    setSplitResults([]);
    setCropResult(null);
    setCropPreviewUrl(null);
    setCropAspectRatio("9:16");
    setCropFocus({ x: 0.5, y: 0.5 });
    setCropScale(1);
    setIsDetectingGrid(true);
    window.requestAnimationFrame(() => {
      imageToolsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    try {
      if (mode === "split" && options?.rows && options.cols && options.forceGrid) {
        const sourceImage = await loadImage(sourceUrl);
        setDetectedGrid({
          rows: options.rows,
          cols: options.cols,
          confidence: 1,
          cellWidth: sourceImage.naturalWidth / options.cols,
          cellHeight: sourceImage.naturalHeight / options.rows,
        });
        setSplitGridRows(options.rows);
        setSplitGridCols(options.cols);
        setSplitPreviewUrl(await createSplitPreview(sourceUrl, options.rows, options.cols));
        return;
      }

      const detected = await detectGrid(sourceUrl);
      const rows = mode === "split" ? detected?.rows ?? DEFAULT_SPLIT_GRID.rows : splitGridRows;
      const cols = mode === "split" ? detected?.cols ?? DEFAULT_SPLIT_GRID.cols : splitGridCols;
      setDetectedGrid(detected);
      setSplitGridRows(rows);
      setSplitGridCols(cols);
      setSplitPreviewUrl(mode === "split" ? await createSplitPreview(sourceUrl, rows, cols) : null);
      if (mode === "crop") {
        setCropPreviewUrl(await createCropPreview(sourceUrl, "9:16"));
      }
    } catch (error) {
      console.warn("Failed to initialize storyboard image tools:", error);
      toast.error(locale === "th" ? "เปิดเครื่องมือตัดภาพไม่สำเร็จ" : "Failed to open image tools");
    } finally {
      setIsDetectingGrid(false);
    }
  }, [locale, splitGridCols, splitGridRows, toast]);

  useEffect(() => {
    if (!imageToolsSourceUrl || imageEditorMode !== "crop") return;
    let isCurrent = true;
    void createCropPreview(imageToolsSourceUrl, cropAspectRatio, {
      focusX: cropFocus.x,
      focusY: cropFocus.y,
      scale: cropScale,
    })
      .then((preview) => {
        if (isCurrent) setCropPreviewUrl(preview);
      })
      .catch(() => {
        if (isCurrent) setCropPreviewUrl(null);
      });
    return () => {
      isCurrent = false;
    };
  }, [cropAspectRatio, cropFocus.x, cropFocus.y, cropScale, imageEditorMode, imageToolsSourceUrl]);

  const executeSplit = useCallback(async () => {
    if (!imageToolsSourceUrl) return;
    setIsSplitting(true);
    try {
      const results = await splitImage(imageToolsSourceUrl, splitGridRows, splitGridCols, "image/jpeg", 0.92);
      setSplitResults(results);
      toast.success(locale === "th" ? `ตัดภาพเป็น ${results.length} รูปแล้ว` : `Split into ${results.length} images.`);
    } catch (error) {
      console.warn("Storyboard split failed:", error);
      toast.error(locale === "th" ? "ตัดภาพไม่สำเร็จ" : "Failed to split image");
    } finally {
      setIsSplitting(false);
    }
  }, [imageToolsSourceUrl, locale, splitGridCols, splitGridRows, toast]);

  const executeCrop = useCallback(async () => {
    if (!imageToolsSourceUrl) return;
    setIsCropping(true);
    try {
      const result = await cropImageToAspect(imageToolsSourceUrl, cropAspectRatio, "image/jpeg", 0.92, {
        focusX: cropFocus.x,
        focusY: cropFocus.y,
        scale: cropScale,
      });
      setCropResult(result);
      toast.success(locale === "th" ? `ตัดภาพ ${cropAspectRatio} แล้ว` : `Cropped to ${cropAspectRatio}.`);
    } catch (error) {
      console.warn("Storyboard crop failed:", error);
      toast.error(locale === "th" ? "ครอปรูปไม่สำเร็จ" : "Failed to crop image");
    } finally {
      setIsCropping(false);
    }
  }, [cropAspectRatio, cropFocus.x, cropFocus.y, cropScale, imageToolsSourceUrl, locale, toast]);

  const appendCropToSplitResults = useCallback(() => {
    if (!cropResult) return;
    setSplitResults((current) => [
      ...current,
      {
        blob: cropResult.blob,
        index: current.reduce((max, item) => Math.max(max, item.index), -1) + 1,
        row: 0,
        col: current.length,
        dataUrl: cropResult.dataUrl,
        width: cropResult.width,
        height: cropResult.height,
        sourceWidth: cropResult.width,
        sourceHeight: cropResult.height,
        targetAspectRatio: cropResult.ratio,
      },
    ]);
    setImageEditorMode("split");
    toast.success(locale === "th" ? "เพิ่มภาพครอปเข้าแถบรูปที่ตัดแล้ว" : "Added crop to split results.");
  }, [cropResult, locale, toast]);

  const selectedRenderClips = useMemo<StoryboardClipCandidate[]>(() => {
    if (!draft) return [];
    const reviewTasks = storyboardDraftToReviewTasks(draft);
    const sourceTaskById = new Map(draft.tasks.map((task) => [task.id, task]));
    const selected = reviewTasks.filter((task) => draft.selectedTaskIds.includes(task.id) && task.status === "completed" && task.url);
    return selected.map((task) => ({
      id: task.id,
      prompt: task.prompt,
      url: task.url!,
      model: task.model,
      durationSeconds: resolveHyperframesSourceClipDurationSeconds(sourceTaskById.get(task.id), task.durationSeconds),
      mediaType: task.mediaType,
      transition: task.transition,
      generationModelId: task.generationModelId,
      referenceUrls: task.referenceUrls,
      generationAspectRatio: task.generationAspectRatio,
      generationExtraParams: task.generationExtraParams,
    }));
  }, [draft]);

  const hyperframesFinalSourceClipPlan = useMemo(() => {
    const isVideoClip = (clip: StoryboardClipCandidate) =>
      Boolean(clip.url) && clip.mediaType !== "image" && !isProbablyImageUrl(clip.url);
    const selectedVideos = selectedRenderClips.filter(isVideoClip);
    const sourceTaskById = draft
      ? new Map(draft.tasks.map((task) => [task.id, task]))
      : new Map<string, StoryboardGenerationTask>();
    const sourceClips = selectedVideos.length > 0
      ? selectedVideos
      : draft
        ? storyboardDraftToReviewTasks(draft)
          .filter(task => task.status === "completed" && task.url && task.mediaType !== "image" && !isProbablyImageUrl(task.url))
          .map(task => ({
            id: task.id,
            prompt: task.prompt,
            url: task.url!,
            model: task.model,
            durationSeconds: resolveHyperframesSourceClipDurationSeconds(sourceTaskById.get(task.id), task.durationSeconds),
            mediaType: task.mediaType,
            transition: task.transition,
            generationModelId: task.generationModelId,
            referenceUrls: task.referenceUrls,
            generationAspectRatio: task.generationAspectRatio,
            generationExtraParams: task.generationExtraParams,
          }))
        : [];
    return splitHyperframesFinalSourceClips(sourceClips);
  }, [draft, selectedRenderClips]);
  const hyperframesFinalSourceClips = hyperframesFinalSourceClipPlan.clips;

  useEffect(() => {
    if (hyperframesFinalSourceClips.length === 0) return;
    if (hyperframesFinalSourceClipPlan.wasLimitedByFinalCap) {
      toast.warning(
        locale === "th"
          ? `Final Composite รองรับสูงสุด ${HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC}s / ${HYPERFRAMES_FINAL_COMPOSITE_MAX_SHOTS} shots ระบบจะ render เฉพาะ ${hyperframesFinalSourceClipPlan.plannedDurationSeconds}s แรก`
          : `Final Composite supports up to ${HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC}s / ${HYPERFRAMES_FINAL_COMPOSITE_MAX_SHOTS} shots. Rendering the first ${hyperframesFinalSourceClipPlan.plannedDurationSeconds}s only.`
      );
      return;
    }
  }, [
    hyperframesFinalSourceClipPlan.plannedDurationSeconds,
    hyperframesFinalSourceClipPlan.wasSplit,
    hyperframesFinalSourceClipPlan.wasLimitedByFinalCap,
    hyperframesFinalSourceClips.length,
    locale,
  ]);

  const hyperframesFinalSelectedShotClip =
    hyperframesFinalSourceClips[hyperframesFinalPreviewShotIndex] ??
    hyperframesFinalSourceClips[0];
  const hyperframesFinalSelectedShotVideoUrl =
    hyperframesFinalSelectedShotClip?.url ?? "";
  const hyperframesFinalSelectedShotMediaStartSec =
    hyperframesFinalSelectedShotClip?.mediaStartSec ?? 0;
  const hyperframesFinalSelectedShotDurationSec =
    getHyperframesFinalClipDurationSec(hyperframesFinalSelectedShotClip);
  const hyperframesFinalSelectedShotMediaEndSec =
    roundHyperframesTimelineSecond(
      hyperframesFinalSelectedShotMediaStartSec + hyperframesFinalSelectedShotDurationSec
    );

  const syncHyperframesFinalSelectedShotOverlayFrame = useCallback(() => {
    if (typeof window === "undefined" || hyperframesFinalSelectedShotPreviewMode !== "video") {
      setHyperframesFinalSelectedShotOverlayFrameVars(null);
      return;
    }
    const next = buildHyperframesSelectedVideoOverlayFrameVars(
      hyperframesFinalSelectedShotStageRef.current,
      hyperframesFinalSelectedShotVideoRef.current,
    );
    setHyperframesFinalSelectedShotOverlayFrameVars(next);
  }, [hyperframesFinalSelectedShotPreviewMode]);

  const stopHyperframesFinalPreviewAudioEvents = useCallback(() => {
    for (const node of hyperframesFinalPreviewAudioNodesRef.current) {
      try {
        if ("pause" in node) {
          node.pause();
          node.currentTime = 0;
        } else if (node.state !== "closed") {
          void node.close();
        }
      } catch {
        // Preview audio is best-effort; final capture uses FFmpeg mixing.
      }
    }
    hyperframesFinalPreviewAudioNodesRef.current = [];
  }, []);

  const playHyperframesFinalPreviewAudioEvent = useCallback((event: HyperframesAudioEvent) => {
    if (typeof window === "undefined") return;
    const durationSec = Math.max(0.08, Math.min(8, Number(event.durationSec ?? 0.25) || 0.25));
    const volume = Math.max(0, Math.min(0.6, Number(event.volume ?? 0.2) || 0.2));
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const presetId = String(event.presetId ?? event.role ?? "").toLowerCase();
    const isMusic = event.role === "music" || presetId.includes("music");
    const isCash = presetId.includes("cash") || presetId.includes("sales");
    const isRiser = presetId.includes("riser") || presetId.includes("reveal");
    oscillator.type = isMusic ? "triangle" : isCash ? "square" : "sine";
    oscillator.frequency.setValueAtTime(isMusic ? 220 : isCash ? 880 : isRiser ? 360 : 520, context.currentTime);
    if (isRiser) {
      oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + durationSec);
    }
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), context.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + durationSec);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + durationSec);
    hyperframesFinalPreviewAudioNodesRef.current.push(context);
    window.setTimeout(() => {
      void context.close().catch(() => undefined);
      hyperframesFinalPreviewAudioNodesRef.current = hyperframesFinalPreviewAudioNodesRef.current.filter(node => node !== context);
    }, Math.ceil((durationSec + 0.2) * 1000));
  }, []);

  useEffect(() => {
    hyperframesFinalPreviewAudioEventsPlayedRef.current.clear();
    stopHyperframesFinalPreviewAudioEvents();
  }, [
    hyperframesFinalPreviewShotIndex,
    hyperframesFinalSelectedShotPreviewMode,
    hyperframesFinalTextPreviewReplayKey,
    previewMatchCaptureAudioEventsEnabled,
    stopHyperframesFinalPreviewAudioEvents,
  ]);

  useEffect(() => {
    if (hyperframesFinalSelectedShotPreviewMode !== "video") {
      setHyperframesFinalSelectedShotOverlayFrameVars(null);
      return;
    }

    let frameId = 0;
    const scheduleSync = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        syncHyperframesFinalSelectedShotOverlayFrame();
      });
    };
    scheduleSync();

    const stage = hyperframesFinalSelectedShotStageRef.current;
    const video = hyperframesFinalSelectedShotVideoRef.current;
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(scheduleSync)
        : null;
    if (stage && resizeObserver) resizeObserver.observe(stage);
    if (video && resizeObserver) resizeObserver.observe(video);
    window.addEventListener("resize", scheduleSync);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleSync);
    };
  }, [
    hyperframesFinalPreviewShotIndex,
    hyperframesFinalSelectedShotDurationSec,
    hyperframesFinalSelectedShotPreviewMode,
    hyperframesFinalSelectedShotVideoUrl,
    hyperframesFinalTextPreviewReplayKey,
    syncHyperframesFinalSelectedShotOverlayFrame,
  ]);

  useEffect(() => {
    if (hyperframesFinalSelectedShotPreviewMode !== "video") return;
    let frameId = 0;
    const intervalId = window.setInterval(() => {
      const video = hyperframesFinalSelectedShotVideoRef.current;
      if (!video) return;
      const relativeSec = Math.max(0, video.currentTime - hyperframesFinalSelectedShotMediaStartSec);
      if (Math.abs(relativeSec - hyperframesFinalSelectedShotPlaybackLastSecRef.current) >= 0.05) {
        hyperframesFinalSelectedShotPlaybackLastSecRef.current = relativeSec;
        setHyperframesFinalSelectedShotPlaybackSec(roundHyperframesTimelineSecond(relativeSec));
      }
    }, 100);
    const hookFallbackId = window.setTimeout(() => {
      if (
        hyperframesFinalTextMode === "hook_and_per_shot" &&
        hyperframesFinalPreviewShotIndex === 0 &&
        hyperframesFinalSelectedShotPreviewMode === "video"
      ) {
        setHyperframesFinalSelectedShotPlaybackSec(current =>
          current < HYPERFRAMES_FINAL_HOOK_DURATION_SEC
            ? HYPERFRAMES_FINAL_HOOK_DURATION_SEC + 0.1
            : current
        );
      }
    }, HYPERFRAMES_FINAL_HOOK_DURATION_SEC * 1000 + 150);
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const video = hyperframesFinalSelectedShotVideoRef.current;
      if (video && !video.paused && !video.ended) {
        const relativeSec = Math.max(0, video.currentTime - hyperframesFinalSelectedShotMediaStartSec);
        if (Math.abs(relativeSec - hyperframesFinalSelectedShotPlaybackLastSecRef.current) >= 0.05) {
          hyperframesFinalSelectedShotPlaybackLastSecRef.current = relativeSec;
          setHyperframesFinalSelectedShotPlaybackSec(roundHyperframesTimelineSecond(relativeSec));
        }
      }
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.clearTimeout(hookFallbackId);
      window.cancelAnimationFrame(frameId);
    };
  }, [
    hyperframesFinalPreviewShotIndex,
    hyperframesFinalSelectedShotMediaStartSec,
    hyperframesFinalSelectedShotPreviewMode,
    hyperframesFinalTextPreviewReplayKey,
    hyperframesFinalTextMode,
  ]);

  useEffect(() => {
    if (hyperframesFinalSelectedShotPreviewMode !== "video" || !hyperframesFinalSelectedShotVideoUrl) return;
    const video = hyperframesFinalSelectedShotVideoRef.current;
    if (!video) return;
    let cancelled = false;
    const loadTimeout = window.setTimeout(() => {
      if (cancelled) return;
      const currentVideo = hyperframesFinalSelectedShotVideoRef.current;
      if (!currentVideo || currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
      setHyperframesFinalSelectedShotVideoLoadState("error");
      setHyperframesFinalSelectedShotVideoError(
        locale === "th"
          ? "preview ยังโหลด MP4 ของ shot นี้ไม่ได้ ตรวจ URL/สิทธิ์ไฟล์ หรือเปิดดูวิดีโอเต็มเพื่อตรวจ source"
          : "The preview could not load this shot MP4. Check the file URL/permissions or open the full video source.",
      );
    }, 4000);
    setHyperframesFinalSelectedShotVideoLoadState("loading");
    setHyperframesFinalSelectedShotVideoError("");
    try {
      prepareHyperframesSegmentVideo({
        video,
        startSec: hyperframesFinalSelectedShotMediaStartSec,
        endSec: hyperframesFinalSelectedShotMediaEndSec,
        restart: true,
      });
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        void playPromise.catch((error: unknown) => {
          if (cancelled) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setHyperframesFinalSelectedShotVideoLoadState("error");
          setHyperframesFinalSelectedShotVideoError(
            error instanceof Error && error.message
              ? error.message
              : locale === "th"
                ? "browser ไม่อนุญาตให้เล่นวิดีโอนี้"
                : "The browser blocked this video playback.",
          );
        });
      }
    } catch (error) {
      setHyperframesFinalSelectedShotVideoLoadState("error");
      setHyperframesFinalSelectedShotVideoError(
        error instanceof Error && error.message
          ? error.message
          : locale === "th"
            ? "เริ่มเล่นวิดีโอไม่สำเร็จ"
            : "Could not start video playback.",
      );
    }
    return () => {
      cancelled = true;
      window.clearTimeout(loadTimeout);
    };
  }, [
    hyperframesFinalSelectedShotMediaEndSec,
    hyperframesFinalSelectedShotMediaStartSec,
    hyperframesFinalSelectedShotPreviewMode,
    hyperframesFinalSelectedShotVideoUrl,
    hyperframesFinalTextPreviewReplayKey,
    locale,
  ]);

  const hyperframesFinalSourceReadiness = useMemo(() => {
    const reviewTasks = draft ? storyboardDraftToReviewTasks(draft) : [];
    const tasksWithUrl = reviewTasks.filter(task => Boolean(task.url));
    const isTaskImage = (task: typeof reviewTasks[number]) =>
      task.mediaType === "image" || isProbablyImageUrl(task.url ?? "");
    const completedVideoCount = tasksWithUrl.filter(
      task => task.status === "completed" && !isTaskImage(task),
    ).length;
    const selectedCompletedVideoCount = selectedRenderClips.filter(
      clip => clip.mediaType !== "image" && !isProbablyImageUrl(clip.url),
    ).length;
    const completedImageCount = tasksWithUrl.filter(
      task => task.status === "completed" && isTaskImage(task),
    ).length;
    const incompleteVideoCount = tasksWithUrl.filter(
      task => task.status !== "completed" && !isTaskImage(task),
    ).length;
    const hasOnlyCompletedImages = completedVideoCount === 0 && completedImageCount > 0;
    return {
      completedVideoCount,
      selectedCompletedVideoCount,
      completedImageCount,
      incompleteVideoCount,
      hasOnlyCompletedImages,
    };
  }, [draft, selectedRenderClips]);

  const hyperframesFinalMissingVideoTitle = locale === "th"
    ? "ยังไม่มีวิดีโอ MP4 ที่ completed สำหรับ Final Composite"
    : "No completed MP4 video shots are available for Final Composite";

  const hyperframesFinalMissingVideoDetail = useMemo(() => {
    if (hyperframesFinalSourceReadiness.completedVideoCount > 0) return "";
    const details: string[] = [];
    if (locale === "th") {
      details.push("Final Composite ต้องใช้วิดีโอ MP4 อย่างน้อย 1 shot ก่อนส่ง HyperFrames render จริง");
      if (hyperframesFinalSourceReadiness.hasOnlyCompletedImages) {
        details.push(`ตอนนี้มีภาพ/Storyboard frame ที่ completed ${hyperframesFinalSourceReadiness.completedImageCount} รายการ แต่ภาพนิ่งยังไม่ใช่ source video สำหรับ final render`);
      }
      if (hyperframesFinalSourceReadiness.incompleteVideoCount > 0) {
        details.push(`มีวิดีโอ ${hyperframesFinalSourceReadiness.incompleteVideoCount} shot ที่ยังไม่ completed ให้รอหรือ repair ให้เสร็จก่อน`);
      }
      details.push("ให้สร้างหรือ import MP4 ใน shot อย่างน้อยหนึ่งรายการ แล้วกลับมากด Render Final Composite");
      return details.join(" ");
    }
    details.push("Final Composite requires at least one completed MP4 video shot before submitting a real HyperFrames render.");
    if (hyperframesFinalSourceReadiness.hasOnlyCompletedImages) {
      details.push(`There are ${hyperframesFinalSourceReadiness.completedImageCount} completed image/storyboard frame(s), but still images are not valid source video for final render.`);
    }
    if (hyperframesFinalSourceReadiness.incompleteVideoCount > 0) {
      details.push(`${hyperframesFinalSourceReadiness.incompleteVideoCount} video shot(s) are not completed yet. Wait for them or repair them first.`);
    }
    details.push("Create or import at least one MP4 shot, then return to Render Final Composite.");
    return details.join(" ");
  }, [hyperframesFinalSourceReadiness, locale]);

  const resetHyperframesFinalCompositeState = useCallback(() => {
    setHyperframesFinalFont("Prompt");
    setHyperframesFinalTextMode("hook_and_per_shot");
    setHyperframesFinalTextMotionPreset("slide_right_to_left");
    setHyperframesFinalOverlayPreset("auto");
    setHyperframesFinalSubtitlePreset("classic_box");
    setHyperframesFinalSubtitleFontSizePx(34);
    setHyperframesFinalAudioPackPresetId(DEFAULT_HYPERFRAMES_FINAL_AUDIO_PACK_ID);
    setHyperframesFinalMusicPresetId(DEFAULT_HYPERFRAMES_FINAL_MUSIC_ID);
    setHyperframesFinalSfxPresetIds(DEFAULT_HYPERFRAMES_FINAL_SFX_IDS);
    setHyperframesFinalPreserveNativeAudio(true);
    setHyperframesFinalSyntheticAudioFallback(true);
    setHyperframesFinalBurnInSubtitles(true);
    setHyperframesFinalStyleBrief(DEFAULT_HYPERFRAMES_FINAL_STYLE_BRIEF);
    setIsHyperframesFinalPromptEdited(false);
    setHyperframesFinalHookText("");
    setHyperframesFinalSupportingText("");
    setIsHyperframesFinalHookEditing(false);
    setHyperframesFinalHookDraft({ hookText: "", supportingText: "" });
    setHyperframesFinalShotTextById({});
    setHyperframesFinalSubtitleById({});
    setHyperframesFinalOverlayDraftById({});
    setHyperframesFinalSubtitleDraftById({});
    setHyperframesFinalOverlayEditingById({});
    setHyperframesFinalSubtitleEditingById({});
    setHyperframesFinalSubtitleVttById({});
    setHyperframesFinalSubtitleSrtById({});
    setHyperframesFinalShotOverlayPresetById({});
    setHyperframesFinalShotAnimationById({});
    setHyperframesFinalShotTransitionById({});
    setHyperframesFinalShotTextMotionById({});
    setHyperframesFinalPreviewShotIndex(0);
    setHyperframesFinalSfxDrafts(
      DEFAULT_HYPERFRAMES_FINAL_SFX_IDS.map((id, index) =>
        buildDefaultHyperframesFinalSfxDraft(id, index),
      ),
    );
    setHyperframesFinalPromptGeneratedSignature("");
    hyperframesFinalStateRevisionRef.current = null;
    hyperframesFinalStateHydrationKeyRef.current = null;
    hyperframesFinalAutosaveLastSignatureRef.current = "";
    hyperframesFinalAutosaveSnapshotRef.current = null;
    hyperframesFinalAutosaveNeedsFlushRef.current = false;
    hyperframesFinalAutosaveSkipNextRef.current = false;
    hyperframesFinalAutosaveFlushAfterSnapshotRef.current = false;
    hyperframesFinalLocalTextDirtyRef.current = false;
    setHyperframesFinalAutosaveStatus("idle");
  }, []);

  useEffect(() => {
    if (!draft && !canonicalReviewId) return;
    if (hyperframesFinalActiveIdentityKeyRef.current === hyperframesFinalIdentityKey) return;
    hyperframesFinalActiveIdentityKeyRef.current = hyperframesFinalIdentityKey;
    hyperframesFinalResetIdentityKeyRef.current = hyperframesFinalIdentityKey;
    resetHyperframesFinalCompositeState();
  }, [
    canonicalReviewId,
    draft,
    hyperframesFinalIdentityKey,
    resetHyperframesFinalCompositeState,
  ]);

  useEffect(() => {
    const state = reviewHyperframesFinalComposite;
    if (!state) return;
    if (!canonicalReviewId || !effectiveHyperframesProductId || !effectiveHyperframesRunId) return;
    const stateReviewId = compactStoryboardText(state.storyboardReviewProjectId ?? "");
    const stateProductId = compactStoryboardText(state.canonicalProductId ?? "");
    const stateRunId = compactStoryboardText(state.autoReviewRunId ?? "");
    if (
      stateReviewId !== String(canonicalReviewId) ||
      stateProductId !== effectiveHyperframesProductId ||
      stateRunId !== effectiveHyperframesRunId
    ) {
      console.warn("Ignoring HyperFrames final composite state with mismatched identity.", {
        current: {
          storyboardReviewProjectId: canonicalReviewId,
          canonicalProductId: effectiveHyperframesProductId,
          autoReviewRunId: effectiveHyperframesRunId,
        },
        state: {
          storyboardReviewProjectId: stateReviewId,
          canonicalProductId: stateProductId,
          autoReviewRunId: stateRunId,
        },
      });
      return;
    }
    const revision = typeof state.revision === "number" ? state.revision : null;
    hyperframesFinalStateRevisionRef.current = revision;
    const hydrationKey = `${hyperframesFinalIdentityKey}:${revision ?? "unknown"}:${state.updatedAt ?? ""}`;
    if (hyperframesFinalStateHydrationKeyRef.current === hydrationKey) return;
    if (hyperframesFinalLocalTextDirtyRef.current) {
      return;
    }
    hyperframesFinalStateHydrationKeyRef.current = hydrationKey;
    hyperframesFinalAutosaveSkipNextRef.current = true;
    const textVariables =
      state.textVariables && typeof state.textVariables === "object"
        ? (state.textVariables as Record<string, any>)
        : {};
    if (typeof textVariables.fontFamily === "string") {
      setHyperframesFinalFont(textVariables.fontFamily as HyperframesFinalCompositeConfig["fontFamily"]);
    }
    if (typeof textVariables.textMotionPreset === "string") {
      const motion = textVariables.textMotionPreset as HyperframesFinalTextMotionPreset;
      if (HYPERFRAMES_FINAL_TEXT_MOTION_PRESETS.some(preset => preset.id === motion)) {
        setHyperframesFinalTextMotionPreset(motion);
      }
    }
    if (typeof textVariables.hookText === "string") {
      setHyperframesFinalHookText(textVariables.hookText);
    }
    if (typeof textVariables.supportingText === "string") {
      setHyperframesFinalSupportingText(textVariables.supportingText);
    }
    if (typeof textVariables.overlayPresetId === "string") {
      const legacyOverlay = textVariables.overlayPresetId as HyperframesFinalOverlayPreset;
      if (HYPERFRAMES_FINAL_OVERLAY_PRESETS.some(preset => preset.id === legacyOverlay)) {
        setHyperframesFinalOverlayPreset(legacyOverlay);
      }
    }
    if (typeof textVariables.subtitlePresetId === "string") {
      const legacySubtitle = textVariables.subtitlePresetId as HyperframesFinalSubtitlePreset;
      if (HYPERFRAMES_FINAL_SUBTITLE_PRESETS.some(preset => preset.id === legacySubtitle)) {
        setHyperframesFinalSubtitlePreset(legacySubtitle);
      }
    }
    if (textVariables.subtitleFontSizePx !== undefined) {
      setHyperframesFinalSubtitleFontSizePx(normalizeHyperframesSubtitleFontSize(textVariables.subtitleFontSizePx));
    }
    if (typeof textVariables.audioPackPresetId === "string") {
      setHyperframesFinalAudioPackPresetId(textVariables.audioPackPresetId);
    }
    if (typeof textVariables.musicPresetId === "string") {
      setHyperframesFinalMusicPresetId(textVariables.musicPresetId);
    }
    if (Array.isArray(textVariables.sfxPresetIds)) {
      const ids = textVariables.sfxPresetIds.map((id: unknown) => String(id ?? "").trim()).filter(Boolean);
      setHyperframesFinalSfxPresetIds(ids);
      if (!Array.isArray(textVariables.sfxDrafts)) {
        setHyperframesFinalSfxDrafts(ids.map((id, index) => buildDefaultHyperframesFinalSfxDraft(id, index)));
      }
    }
    if (Array.isArray(textVariables.sfxDrafts)) {
      setHyperframesFinalSfxDrafts(
        textVariables.sfxDrafts
          .map((draft: unknown, index: number) => {
            const item = draft && typeof draft === "object" ? draft as Record<string, unknown> : {};
            const presetId = compactStoryboardText(item.presetId ?? "");
            if (!presetId) return null;
            const fallback = buildDefaultHyperframesFinalSfxDraft(presetId, index);
            return {
              ...fallback,
              id: compactStoryboardText(item.id ?? fallback.id) || fallback.id,
              target: compactStoryboardText(item.target ?? fallback.target) || fallback.target,
              visualTrigger: hyperframesAudioVisualTriggers.includes(item.visualTrigger as any) && item.visualTrigger !== "video_start"
                ? item.visualTrigger as HyperframesFinalSfxTrigger
                : fallback.visualTrigger,
              role: hyperframesAudioRoles.includes(item.role as any) && item.role !== "voiceover" && item.role !== "music" && item.role !== "ambience"
                ? item.role as HyperframesFinalSfxRole
                : fallback.role,
              offsetSec: Number.isFinite(Number(item.offsetSec)) ? Math.max(0, Math.min(30, Number(item.offsetSec))) : fallback.offsetSec,
              durationSec: Number.isFinite(Number(item.durationSec)) ? Math.max(0.05, Math.min(5, Number(item.durationSec))) : fallback.durationSec,
              volume: Number.isFinite(Number(item.volume)) ? Math.max(0, Math.min(1, Number(item.volume))) : fallback.volume,
            };
          })
          .filter((draft): draft is HyperframesFinalSfxDraft => Boolean(draft))
          .slice(0, 12),
      );
    }
    if (typeof textVariables.preserveNativeAudio === "boolean") {
      setHyperframesFinalPreserveNativeAudio(textVariables.preserveNativeAudio);
    }
    if (typeof textVariables.syntheticAudioFallback === "boolean") {
      setHyperframesFinalSyntheticAudioFallback(textVariables.syntheticAudioFallback);
    }
    if (typeof textVariables.burnInSubtitles === "boolean") {
      setHyperframesFinalBurnInSubtitles(textVariables.burnInSubtitles);
    }
    if (typeof textVariables.styleBrief === "string") {
      setHyperframesFinalStyleBrief(textVariables.styleBrief || DEFAULT_HYPERFRAMES_FINAL_STYLE_BRIEF);
      setIsHyperframesFinalPromptEdited(Boolean(textVariables.styleBrief?.trim()));
    }
    if (textVariables.perShotText && typeof textVariables.perShotText === "object") {
      setHyperframesFinalShotTextById(
        sanitizeHyperframesShotTextMap(textVariables.perShotText as Record<string, string>)
      );
    }
    if (textVariables.perShotSubtitles && typeof textVariables.perShotSubtitles === "object") {
      setHyperframesFinalSubtitleById(textVariables.perShotSubtitles as Record<string, string>);
    }
    if (textVariables.perShotSubtitleVtt && typeof textVariables.perShotSubtitleVtt === "object") {
      setHyperframesFinalSubtitleVttById(textVariables.perShotSubtitleVtt as Record<string, string>);
    }
    if (textVariables.perShotSubtitleSrt && typeof textVariables.perShotSubtitleSrt === "object") {
      setHyperframesFinalSubtitleSrtById(textVariables.perShotSubtitleSrt as Record<string, string>);
    }
    if (textVariables.perShotOverlayPreset && typeof textVariables.perShotOverlayPreset === "object") {
      setHyperframesFinalShotOverlayPresetById(textVariables.perShotOverlayPreset as Record<string, HyperframesFinalOverlayPreset>);
    }
    if (textVariables.perShotAnimationPreset && typeof textVariables.perShotAnimationPreset === "object") {
      setHyperframesFinalShotAnimationById(textVariables.perShotAnimationPreset as Record<string, HyperframesFinalShotAnimationPreset>);
    }
    if (textVariables.perShotTransition && typeof textVariables.perShotTransition === "object") {
      setHyperframesFinalShotTransitionById(textVariables.perShotTransition as Record<string, HyperframesFinalShotTransition>);
    }
    if (textVariables.perShotTextMotionPreset && typeof textVariables.perShotTextMotionPreset === "object") {
      setHyperframesFinalShotTextMotionById(textVariables.perShotTextMotionPreset as Record<string, HyperframesFinalTextMotionPreset>);
    }
  }, [
    canonicalReviewId,
    effectiveHyperframesProductId,
    effectiveHyperframesRunId,
    hyperframesFinalIdentityKey,
    reviewHyperframesFinalComposite,
  ]);

  useEffect(() => {
    if (!draft) return;
    if (!canInitializeHyperframesFinalDefaultText) return;
    const didResetForCurrentIdentity =
      hyperframesFinalResetIdentityKeyRef.current === hyperframesFinalIdentityKey;
    const productContext = resolveStoryboardDraftMarketplaceProduct(draft) as Record<string, unknown> | null;
    const productTitle = compactStoryboardText(
      productContext?.title ?? productContext?.name ?? productContext?.productName ?? "",
    );
    const description = compactStoryboardText(
      productContext?.description ?? productContext?.descriptionText ?? draft.conceptDetails ?? "",
    );
    const draftedHookText = buildHyperframesBenefitHookDraft({
      productContext,
      productTitle: productTitle || getStoryboardReviewName(draft),
      description,
    });
    const draftedSupportingText = buildHyperframesSupportingTextDraft({
      productTitle: productTitle || getStoryboardReviewName(draft),
      description,
    });
    setHyperframesFinalHookText(current => current.trim() || draftedHookText);
    setHyperframesFinalSupportingText(current => current.trim() || draftedSupportingText);
    setHyperframesFinalShotTextById(current => {
      const next = { ...current };
      let changed = false;
      const hookText = didResetForCurrentIdentity
        ? draftedHookText
        : hyperframesFinalHookText.trim() || draftedHookText;
      const supportingText = didResetForCurrentIdentity
        ? draftedSupportingText
        : hyperframesFinalSupportingText.trim() || draftedSupportingText;
      hyperframesFinalSourceClips.forEach((clip, index) => {
        const existing = sanitizeHyperframesShotOverlayText(next[clip.id] ?? "");
        if (existing) {
          if (next[clip.id] !== existing) {
            next[clip.id] = existing;
            changed = true;
          }
        } else {
          const draftedText = buildHyperframesShotOverlayDraft({
            preset: hyperframesFinalOverlayPreset,
            productContext,
            productTitle: productTitle || getStoryboardReviewName(draft),
            description,
            hookText,
            supportingText,
            clip,
            index,
            total: hyperframesFinalSourceClips.length,
          });
          if (next[clip.id] !== draftedText) {
            next[clip.id] = draftedText;
            changed = true;
          }
        }
      });
      return changed ? next : current;
    });
    setHyperframesFinalSubtitleById(current => {
      const next = { ...current };
      let changed = false;
      hyperframesFinalSourceClips.forEach(clip => {
        if (!next[clip.id]) {
          next[clip.id] = defaultHyperframesSubtitleText(clip);
          changed = true;
        }
      });
      return changed ? next : current;
    });
    if (didResetForCurrentIdentity) {
      hyperframesFinalResetIdentityKeyRef.current = null;
    }
  }, [
    canInitializeHyperframesFinalDefaultText,
    draft,
    hyperframesFinalHookText,
    hyperframesFinalIdentityKey,
    hyperframesFinalOverlayPreset,
    hyperframesFinalSourceClips,
    hyperframesFinalSupportingText,
  ]);

  const hyperframesFinalDurationSeconds = useMemo(
    () =>
      hyperframesFinalSourceClips.reduce(
        (sum, clip) => sum + Math.max(1, clip.durationSeconds ?? DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS),
        0,
      ),
    [hyperframesFinalSourceClips],
  );

  useEffect(() => {
    setHyperframesFinalPreviewShotIndex(current => {
      if (hyperframesFinalSourceClips.length === 0) return 0;
      return Math.min(Math.max(0, current), hyperframesFinalSourceClips.length - 1);
    });
  }, [hyperframesFinalSourceClips.length]);

  const regenerateHyperframesFinalShotTextMap = useCallback(() => {
    if (!draft || hyperframesFinalSourceClips.length === 0) return;
    const productContext = resolveStoryboardDraftMarketplaceProduct(draft) as Record<string, unknown> | null;
    const storyboardName = getStoryboardReviewName(draft);
    const productTitle = compactStoryboardText(
      productContext?.title ?? productContext?.name ?? productContext?.productName ?? storyboardName,
    );
    const description = compactStoryboardText(
      productContext?.description ?? productContext?.descriptionText ?? draft.conceptDetails ?? "",
    );
    const hookText = hyperframesFinalHookText.trim() || buildHyperframesBenefitHookDraft({
      productContext,
      productTitle: productTitle || storyboardName,
      description,
    });
    const supportingText = hyperframesFinalSupportingText.trim() || buildHyperframesSupportingTextDraft({
      productTitle: productTitle || storyboardName,
      description,
    });
    setHyperframesFinalShotTextById(
      Object.fromEntries(
        hyperframesFinalSourceClips.map((clip, index) => [
          clip.id,
          buildHyperframesShotOverlayDraft({
            preset: hyperframesFinalOverlayPreset,
            productContext,
            productTitle: productTitle || storyboardName,
            description,
            hookText,
            supportingText,
            clip,
            index,
            total: hyperframesFinalSourceClips.length,
          }),
        ]),
      ),
    );
  }, [
    draft,
    hyperframesFinalHookText,
    hyperframesFinalOverlayPreset,
    hyperframesFinalSourceClips,
    hyperframesFinalSupportingText,
  ]);

  const flushHyperframesFinalAutosaveSoon = useCallback(() => {
    hyperframesFinalAutosaveFlushAfterSnapshotRef.current = true;
  }, []);

  const regenerateHyperframesFinalSubtitleMap = useCallback(() => {
    if (hyperframesFinalSourceClips.length === 0) return;
    setHyperframesFinalSubtitleById(
      buildHyperframesSubtitleTextMapFromClips(hyperframesFinalSourceClips),
    );
    setHyperframesFinalSubtitleDraftById({});
    setHyperframesFinalSubtitleEditingById({});
    setHyperframesFinalSubtitleVttById({});
    setHyperframesFinalSubtitleSrtById({});
    flushHyperframesFinalAutosaveSoon();
    toast.success(locale === "th" ? "เติม Subtitle จากบทพูดทุก shot แล้ว" : "Filled subtitles from every shot voiceover.");
  }, [
    flushHyperframesFinalAutosaveSoon,
    hyperframesFinalSourceClips,
    locale,
    toast,
  ]);

  const fillHyperframesFinalSubtitleFromPrompt = useCallback((clip: StoryboardClipCandidate) => {
    const subtitle = defaultHyperframesSubtitleText(clip);
    hyperframesFinalLocalTextDirtyRef.current = true;
    setHyperframesFinalSubtitleById(current => ({ ...current, [clip.id]: subtitle }));
    setHyperframesFinalSubtitleDraftById(current => {
      const next = { ...current };
      delete next[clip.id];
      return next;
    });
    setHyperframesFinalSubtitleEditingById(current => ({ ...current, [clip.id]: false }));
    setHyperframesFinalSubtitleVttById(current => {
      const next = { ...current };
      delete next[clip.id];
      return next;
    });
    setHyperframesFinalSubtitleSrtById(current => {
      const next = { ...current };
      delete next[clip.id];
      return next;
    });
    flushHyperframesFinalAutosaveSoon();
    toast.success(locale === "th" ? "สร้าง Subtitle จากบทพูดของ shot นี้แล้ว" : "Created subtitle from this shot voiceover.");
  }, [
    flushHyperframesFinalAutosaveSoon,
    locale,
    toast,
  ]);

  const transcribeHyperframesFinalSubtitleFromVideo = useCallback(async (clip: HyperframesFinalSourceClip) => {
    if (!canonicalReviewId || !effectiveHyperframesProductId || !effectiveHyperframesRunId) {
      toast.error(locale === "th" ? "ยังไม่มี product/run context สำหรับ transcribe" : "Missing product/run context for transcribe.");
      return;
    }
    if (!clip.url) {
      toast.error(locale === "th" ? "shot นี้ยังไม่มี MP4 ให้ถอดเสียง" : "This shot has no MP4 to transcribe.");
      return;
    }
    setHyperframesFinalTranscribingShotId(clip.id);
    setHyperframesFinalTranscribeStatusText(locale === "th" ? "กำลังส่งงานถอดเสียง..." : "Submitting transcription job...");
    try {
      const startedJob = await startStoryboardReviewShotSubtitleTranscriptionMutation.mutateAsync({
        storyboardReviewProjectId: canonicalReviewId,
        productId: effectiveHyperframesProductId,
        runId: effectiveHyperframesRunId,
        shotId: clip.id,
        sourceVideoUrl: clip.url,
        mediaStartSec: clip.mediaStartSec ?? 0,
        durationSec: getHyperframesFinalClipDurationSec(clip),
        language: "th",
      });
      toast.info(locale === "th" ? "เริ่ม Transcribe แล้ว กำลังรอผลลัพธ์..." : "Transcribe started. Waiting for the result...");
      let result: NonNullable<Awaited<ReturnType<typeof trpcUtils.videoEditorProjects.getStoryboardReviewShotSubtitleTranscriptionJob.fetch>>["result"]> | null = null;
      for (let attempt = 0; attempt < HYPERFRAMES_TRANSCRIBE_POLL_MAX_ATTEMPTS; attempt += 1) {
        const job = await trpcUtils.videoEditorProjects.getStoryboardReviewShotSubtitleTranscriptionJob.fetch({
          jobId: startedJob.jobId,
        });
        if (job.status === "queued") {
          setHyperframesFinalTranscribeStatusText(
            locale === "th"
              ? "เข้าคิวถอดเสียงอยู่..."
              : "Waiting in transcription queue...",
          );
        }
        if (job.status === "running") {
          setHyperframesFinalTranscribeStatusText(
            locale === "th"
              ? "กำลังถอดเสียงจากคลิป อาจใช้เวลาหลายนาที..."
              : "Transcribing clip audio. This can take several minutes...",
          );
        }
        if (job.status === "completed" && job.result) {
          result = job.result;
          break;
        }
        if (job.status === "failed") {
          throw new Error(job.errorMessage ?? "HyperFrames transcribe failed.");
        }
        await waitHyperframesTranscribeRetryDelay(Math.min(attempt, 1));
      }
      if (!result) {
        throw new Error(locale === "th" ? "Transcribe ใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง" : "Transcribe took too long. Please try again.");
      }
      if (!result.text.trim()) {
        throw new Error(locale === "th" ? "transcript ว่าง ไม่พบเสียงพูดในคลิป" : "Transcript is empty; no speech was detected.");
      }
      const subtitleText = buildHyperframesReadableSubtitleTextFromTranscriptCues(
        Array.isArray(result.cues)
          ? result.cues.map(cue => ({
            start: Number(cue.start),
            end: Number(cue.end),
            text: String(cue.text ?? ""),
          }))
          : [],
        getHyperframesFinalClipDurationSec(clip),
      ) || result.text;
      hyperframesFinalLocalTextDirtyRef.current = true;
      setHyperframesFinalSubtitleById(current => ({ ...current, [clip.id]: subtitleText }));
      setHyperframesFinalSubtitleDraftById(current => {
        const next = { ...current };
        delete next[clip.id];
        return next;
      });
      setHyperframesFinalSubtitleEditingById(current => ({ ...current, [clip.id]: false }));
      setHyperframesFinalSubtitleVttById(current => ({ ...current, [clip.id]: result.vtt }));
      setHyperframesFinalSubtitleSrtById(current => ({ ...current, [clip.id]: result.srt }));
      flushHyperframesFinalAutosaveSoon();
      toast.success(locale === "th" ? "Transcribe แล้วจัด Subtitle เป็น cue สั้นตามเสียงพูดแล้ว" : "Transcribed and formatted subtitles into readable timed cues.");
    } catch (error) {
      toast.error(getHyperframesTranscribeErrorMessage(error, locale));
    } finally {
      setHyperframesFinalTranscribingShotId(current => current === clip.id ? null : current);
      setHyperframesFinalTranscribeStatusText("");
    }
  }, [
    canonicalReviewId,
    effectiveHyperframesProductId,
    effectiveHyperframesRunId,
    flushHyperframesFinalAutosaveSoon,
    locale,
    startStoryboardReviewShotSubtitleTranscriptionMutation,
    toast,
    trpcUtils.videoEditorProjects.getStoryboardReviewShotSubtitleTranscriptionJob,
  ]);

  const hyperframesFinalProductPromptContext = useMemo(() => {
    const productContext = draft
      ? resolveStoryboardDraftMarketplaceProduct(draft) as Record<string, unknown> | null
      : null;
    const storyboardName = draft ? getStoryboardReviewName(draft) : "";
    const productTitle = compactStoryboardText(
      productContext?.title ?? productContext?.name ?? productContext?.productName ?? storyboardName,
    );
    const productDescription = compactStoryboardText(
      productContext?.description ?? productContext?.descriptionText ?? draft?.conceptDetails ?? "",
    );
    return {
      productContext,
      storyboardName,
      productTitle: productTitle || storyboardName,
      productDescription,
      priceText: formatProductPriceForOverlay(productContext),
    };
  }, [draft]);

  const hyperframesFinalResolvedHookText = useMemo(
    () => expandLegacyEllipsizedHyperframesText(
      hyperframesFinalHookText,
      [
        hyperframesFinalProductPromptContext.productDescription,
        hyperframesFinalProductPromptContext.productTitle,
        hyperframesFinalProductPromptContext.storyboardName,
      ].filter(Boolean),
      180,
    ),
    [
      hyperframesFinalHookText,
      hyperframesFinalProductPromptContext.productDescription,
      hyperframesFinalProductPromptContext.productTitle,
      hyperframesFinalProductPromptContext.storyboardName,
    ],
  );

  const hyperframesFinalResolvedSupportingText = useMemo(
    () => expandLegacyEllipsizedHyperframesText(
      hyperframesFinalSupportingText,
      [
        hyperframesFinalProductPromptContext.productTitle,
        hyperframesFinalProductPromptContext.productDescription,
        hyperframesFinalProductPromptContext.storyboardName,
      ].filter(Boolean),
      160,
    ),
    [
      hyperframesFinalProductPromptContext.productDescription,
      hyperframesFinalProductPromptContext.productTitle,
      hyperframesFinalProductPromptContext.storyboardName,
      hyperframesFinalSupportingText,
    ],
  );

  const resolvedHyperframesFinalOverlayPreset = useMemo<HyperframesFinalOverlayPreset>(() => {
    if (hyperframesFinalOverlayPreset !== "auto") return hyperframesFinalOverlayPreset;
    return resolveHyperframesAutoOverlayPreset({
      productContext: hyperframesFinalProductPromptContext.productContext,
      description: hyperframesFinalProductPromptContext.productDescription,
      hasPrice: Boolean(hyperframesFinalProductPromptContext.priceText),
    });
  }, [
    hyperframesFinalOverlayPreset,
    hyperframesFinalProductPromptContext.productContext,
    hyperframesFinalProductPromptContext.productDescription,
    hyperframesFinalProductPromptContext.priceText,
  ]);

  const hyperframesFinalPresetLabels = useMemo(() => {
    const audioPackPreset = HYPERFRAMES_FINAL_AUDIO_PACK_PRESETS.find(
      preset => preset.id === hyperframesFinalAudioPackPresetId,
    );
    const musicPreset = HYPERFRAMES_FINAL_MUSIC_PRESETS.find(
      preset => preset.id === hyperframesFinalMusicPresetId,
    );
    const sfxPresetLabels = hyperframesFinalSfxPresetIds
      .map(id => HYPERFRAMES_FINAL_SFX_PRESETS.find(preset => preset.id === id))
      .filter((preset): preset is HyperframesCreativePreset => Boolean(preset))
      .map(preset => getCreativePresetLabel(preset, locale));
    return {
      overlayPresetLabel: getHyperframesOptionLabel(HYPERFRAMES_FINAL_OVERLAY_PRESETS, resolvedHyperframesFinalOverlayPreset, locale),
      subtitlePresetLabel: getHyperframesOptionLabel(HYPERFRAMES_FINAL_SUBTITLE_PRESETS, hyperframesFinalSubtitlePreset, locale),
      textMotionPresetLabel: getHyperframesOptionLabel(HYPERFRAMES_FINAL_TEXT_MOTION_PRESETS, hyperframesFinalTextMotionPreset, locale),
      textModeLabel: getHyperframesOptionLabel(HYPERFRAMES_FINAL_TEXT_MODE_OPTIONS, hyperframesFinalTextMode, locale),
      textModeDescription: locale === "th"
        ? getHyperframesFinalTextModeOption(hyperframesFinalTextMode).descriptionTh
        : getHyperframesFinalTextModeOption(hyperframesFinalTextMode).descriptionEn,
      audioPackPresetLabel: audioPackPreset ? getCreativePresetLabel(audioPackPreset, locale) : "",
      musicPresetLabel: musicPreset ? getCreativePresetLabel(musicPreset, locale) : "",
      sfxPresetLabels,
    };
  }, [
    hyperframesFinalAudioPackPresetId,
    hyperframesFinalMusicPresetId,
    resolvedHyperframesFinalOverlayPreset,
    hyperframesFinalSfxPresetIds,
    hyperframesFinalSubtitlePreset,
    hyperframesFinalTextMode,
    hyperframesFinalTextMotionPreset,
    locale,
  ]);

  const hyperframesFinalResolvedPromptShots = useMemo<HyperframesFinalResolvedPromptShot[]>(() => {
    let cursor = 0;
    return hyperframesFinalSourceClips.map((clip, index) => {
      const durationSeconds = getHyperframesFinalClipDurationSec(clip);
      const startSec = roundHyperframesTimelineSecond(cursor);
      const endSec = roundHyperframesTimelineSecond(cursor + durationSeconds);
      cursor = endSec;
      const overlayPreset = hyperframesFinalShotOverlayPresetById[clip.id] ?? resolvedHyperframesFinalOverlayPreset;
      const overlayLines = resolveHyperframesFinalShotOverlayLines({
        textMode: hyperframesFinalTextMode,
        shotIndex: index,
        overlayPreset,
        productContext: hyperframesFinalProductPromptContext.productContext,
        productTitle: hyperframesFinalProductPromptContext.productTitle,
        productDescription: hyperframesFinalProductPromptContext.productDescription,
        storyboardName: hyperframesFinalProductPromptContext.storyboardName,
        hookText: hyperframesFinalResolvedHookText,
        supportingText: hyperframesFinalResolvedSupportingText,
        clip,
        clipCount: hyperframesFinalSourceClips.length,
        savedOverlayText: hyperframesFinalShotTextById[clip.id],
      });
      const subtitleText = hyperframesFinalSubtitleById[clip.id] ?? defaultHyperframesSubtitleText(clip);
      return {
        id: clip.id,
        prompt: clip.prompt,
        sourceClipId: clip.sourceClipId,
        sourceVideoRef: clip.url,
        mediaStartSec: roundHyperframesTimelineSecond(clip.mediaStartSec ?? 0),
        startSec,
        endSec,
        durationSeconds,
        overlayText: overlayLines.join("\n"),
        overlayLines,
        subtitleText,
        subtitleCues: subtitleCuesFromEditableText(subtitleText, startSec, durationSeconds),
        subtitleVtt: hyperframesFinalSubtitleVttById[clip.id],
        subtitleSrt: hyperframesFinalSubtitleSrtById[clip.id],
        overlayPreset,
        animationPreset: hyperframesFinalShotAnimationById[clip.id] ?? (index === hyperframesFinalSourceClips.length - 2 ? "bounce_price" : index === 0 ? "glow_feature" : "smooth_reveal"),
        transition: hyperframesFinalShotTransitionById[clip.id] ?? "fade",
        textMotionPreset: hyperframesFinalShotTextMotionById[clip.id] ?? defaultHyperframesFinalTextMotionPreset(index),
      };
    });
  }, [
    hyperframesFinalProductPromptContext.productContext,
    hyperframesFinalProductPromptContext.productDescription,
    hyperframesFinalProductPromptContext.productTitle,
    hyperframesFinalProductPromptContext.storyboardName,
    hyperframesFinalResolvedHookText,
    hyperframesFinalResolvedSupportingText,
    hyperframesFinalShotAnimationById,
    hyperframesFinalShotOverlayPresetById,
    hyperframesFinalShotTextById,
    hyperframesFinalShotTextMotionById,
    hyperframesFinalShotTransitionById,
    hyperframesFinalSourceClips,
    hyperframesFinalSubtitleById,
    hyperframesFinalSubtitleSrtById,
    hyperframesFinalSubtitleVttById,
    hyperframesFinalTextMode,
    resolvedHyperframesFinalOverlayPreset,
  ]);

  useEffect(() => {
    if (!previewMatchCaptureAudioEventsEnabled || hyperframesFinalSelectedShotPreviewMode !== "video") return;
    const video = hyperframesFinalSelectedShotVideoRef.current;
    if (!video || video.paused || video.ended) return;
    const shot = hyperframesFinalResolvedPromptShots[hyperframesFinalPreviewShotIndex];
    if (!shot) return;
    const shotStartSec = Number(shot.startSec ?? 0);
    const shotEndSec = shotStartSec + Number(shot.durationSeconds ?? 0);
    const globalPlaybackSec = shotStartSec + hyperframesFinalSelectedShotPlaybackSec;
    const audioPreviewShots: HyperframesFinalCompositeConfig["shots"] = hyperframesFinalResolvedPromptShots.map((resolvedShot, index) => ({
      id: resolvedShot.id,
      index,
      title: firstThaiProductLine(resolvedShot.prompt, 80),
      sourceVideoUrl: resolvedShot.sourceVideoRef,
      sourceVideoRef: resolvedShot.sourceVideoRef,
      mediaStartSec: resolvedShot.mediaStartSec,
      startSec: resolvedShot.startSec,
      durationSec: resolvedShot.durationSeconds,
      onScreenText: resolvedShot.overlayLines,
      subtitleCues: resolvedShot.subtitleCues,
      overlayPreset: resolvedShot.overlayPreset,
      animationPreset: resolvedShot.animationPreset,
      transition: resolvedShot.transition,
      textMotionPreset: resolvedShot.textMotionPreset,
    }));
    const events = buildHyperframesFinalAudioEvents({
      finalVideoLengthSec: hyperframesFinalDurationSeconds,
      shots: audioPreviewShots,
      musicPresetId: hyperframesFinalMusicPresetId || undefined,
      sfxPresetIds: hyperframesFinalSfxPresetIds,
      sfxDrafts: hyperframesFinalSfxDrafts,
    });
    for (const event of events) {
      const startSec = Number(event.startSec ?? 0);
      if (startSec < shotStartSec - 0.05 || startSec > shotEndSec + 0.05) continue;
      if (globalPlaybackSec + 0.08 < startSec || globalPlaybackSec - 0.35 > startSec) continue;
      const key = `${hyperframesFinalTextPreviewReplayKey}:${event.id}:${startSec}`;
      if (hyperframesFinalPreviewAudioEventsPlayedRef.current.has(key)) continue;
      hyperframesFinalPreviewAudioEventsPlayedRef.current.add(key);
      playHyperframesFinalPreviewAudioEvent(event);
    }
  }, [
    hyperframesFinalDurationSeconds,
    hyperframesFinalMusicPresetId,
    hyperframesFinalPreviewShotIndex,
    hyperframesFinalResolvedPromptShots,
    hyperframesFinalSelectedShotPlaybackSec,
    hyperframesFinalSelectedShotPreviewMode,
    hyperframesFinalSfxDrafts,
    hyperframesFinalSfxPresetIds,
    hyperframesFinalTextPreviewReplayKey,
    playHyperframesFinalPreviewAudioEvent,
    previewMatchCaptureAudioEventsEnabled,
  ]);

  const generatedHyperframesFinalRenderPrompt = useMemo(() => {
    return buildHyperframesFinalRenderPrompt({
      productTitle: hyperframesFinalProductPromptContext.productTitle,
      productDescription: hyperframesFinalProductPromptContext.productDescription,
      priceText: hyperframesFinalProductPromptContext.priceText,
      styleBrief: DEFAULT_HYPERFRAMES_FINAL_STYLE_BRIEF,
      overlayPreset: resolvedHyperframesFinalOverlayPreset,
      subtitlePreset: hyperframesFinalSubtitlePreset,
      subtitleFontSizePx: hyperframesFinalSubtitleFontSizePx,
      textMode: hyperframesFinalTextMode,
      textMotionPreset: hyperframesFinalTextMotionPreset,
      fontFamily: hyperframesFinalFont,
      hookText: hyperframesFinalResolvedHookText,
      supportingText: hyperframesFinalResolvedSupportingText,
      audioPackPresetLabel: hyperframesFinalPresetLabels.audioPackPresetLabel,
      musicPresetLabel: hyperframesFinalPresetLabels.musicPresetLabel,
      sfxPresetLabels: hyperframesFinalPresetLabels.sfxPresetLabels,
      preserveNativeAudio: hyperframesFinalPreserveNativeAudio,
      syntheticAudioFallback: hyperframesFinalSyntheticAudioFallback,
      burnInSubtitles: hyperframesFinalBurnInSubtitles,
      durationSeconds: hyperframesFinalDurationSeconds,
      shots: hyperframesFinalResolvedPromptShots,
    });
  }, [
    hyperframesFinalBurnInSubtitles,
    hyperframesFinalDurationSeconds,
    hyperframesFinalFont,
    hyperframesFinalPreserveNativeAudio,
    hyperframesFinalProductPromptContext,
    hyperframesFinalPresetLabels,
    hyperframesFinalResolvedHookText,
    hyperframesFinalResolvedPromptShots,
    hyperframesFinalResolvedSupportingText,
    hyperframesFinalSubtitleFontSizePx,
    hyperframesFinalSubtitlePreset,
    hyperframesFinalSyntheticAudioFallback,
    hyperframesFinalTextMode,
    hyperframesFinalTextMotionPreset,
    resolvedHyperframesFinalOverlayPreset,
  ]);

  const hyperframesFinalPromptInputSignature = useMemo(
    () =>
      JSON.stringify({
        productTitle: hyperframesFinalProductPromptContext.productTitle,
        productDescription: hyperframesFinalProductPromptContext.productDescription,
        priceText: hyperframesFinalProductPromptContext.priceText,
        overlayPreset: resolvedHyperframesFinalOverlayPreset,
        overlayPresetSource: hyperframesFinalOverlayPreset === "auto" ? "auto_resolved" : "user_selected",
        subtitlePreset: hyperframesFinalSubtitlePreset,
        subtitleFontSizePx: hyperframesFinalSubtitleFontSizePx,
        textMode: hyperframesFinalTextMode,
        textMotionPreset: hyperframesFinalTextMotionPreset,
        fontFamily: hyperframesFinalFont,
        hookText: hyperframesFinalResolvedHookText,
        supportingText: hyperframesFinalResolvedSupportingText,
        audioPackPresetId: hyperframesFinalAudioPackPresetId,
        musicPresetId: hyperframesFinalMusicPresetId,
        sfxPresetIds: hyperframesFinalSfxPresetIds,
        sfxDrafts: hyperframesFinalSfxDrafts,
        preserveNativeAudio: hyperframesFinalPreserveNativeAudio,
        syntheticAudioFallback: hyperframesFinalSyntheticAudioFallback,
        burnInSubtitles: hyperframesFinalBurnInSubtitles,
        durationSeconds: hyperframesFinalDurationSeconds,
        shots: hyperframesFinalResolvedPromptShots.map(shot => ({
          id: shot.id,
          sourceClipId: shot.sourceClipId,
          sourceVideoRef: shot.sourceVideoRef,
          mediaStartSec: shot.mediaStartSec,
          startSec: shot.startSec,
          endSec: shot.endSec,
          prompt: shot.prompt,
          overlayText: shot.overlayText,
          overlayLines: shot.overlayLines,
          subtitleText: shot.subtitleText,
          subtitleCues: shot.subtitleCues,
          subtitleVtt: shot.subtitleVtt || "",
          subtitleSrt: shot.subtitleSrt || "",
          overlayPreset: shot.overlayPreset,
          animationPreset: shot.animationPreset,
          transition: shot.transition,
          textMotionPreset: shot.textMotionPreset,
          durationSeconds: shot.durationSeconds,
        })),
      }),
    [
      hyperframesFinalAudioPackPresetId,
      hyperframesFinalBurnInSubtitles,
      hyperframesFinalDurationSeconds,
      hyperframesFinalFont,
      hyperframesFinalMusicPresetId,
      hyperframesFinalOverlayPreset,
      hyperframesFinalPreserveNativeAudio,
      hyperframesFinalProductPromptContext,
      hyperframesFinalResolvedHookText,
      hyperframesFinalResolvedPromptShots,
      hyperframesFinalResolvedSupportingText,
      hyperframesFinalSfxDrafts,
      hyperframesFinalSfxPresetIds,
      hyperframesFinalSubtitleById,
      hyperframesFinalSubtitleFontSizePx,
      hyperframesFinalSubtitlePreset,
      hyperframesFinalSyntheticAudioFallback,
      hyperframesFinalTextMode,
      hyperframesFinalTextMotionPreset,
      resolvedHyperframesFinalOverlayPreset,
    ],
  );

  const hyperframesFinalAutosaveSnapshot = useMemo<HyperframesFinalAutosaveSnapshot>(() => {
    const textVariables: Record<string, unknown> = {
      fontFamily: hyperframesFinalFont,
      textMotionPreset: hyperframesFinalTextMotionPreset,
      overlayPresetId: hyperframesFinalOverlayPreset,
      subtitlePresetId: hyperframesFinalSubtitlePreset,
      subtitleFontSizePx: hyperframesFinalSubtitleFontSizePx,
      audioPackPresetId: hyperframesFinalAudioPackPresetId || undefined,
      musicPresetId: hyperframesFinalMusicPresetId || undefined,
      sfxPresetIds: hyperframesFinalSfxPresetIds,
      sfxDrafts: hyperframesFinalSfxDrafts,
      preserveNativeAudio: hyperframesFinalPreserveNativeAudio,
      syntheticAudioFallback: hyperframesFinalSyntheticAudioFallback,
      burnInSubtitles: hyperframesFinalBurnInSubtitles,
      styleBrief: hyperframesFinalStyleBrief.trim() || generatedHyperframesFinalRenderPrompt,
      hookText: hyperframesFinalHookText,
      supportingText: hyperframesFinalSupportingText,
      perShotText: hyperframesFinalShotTextById,
      perShotSubtitles: hyperframesFinalSubtitleById,
      perShotSubtitleVtt: hyperframesFinalSubtitleVttById,
      perShotSubtitleSrt: hyperframesFinalSubtitleSrtById,
      perShotOverlayPreset: hyperframesFinalShotOverlayPresetById,
      perShotAnimationPreset: hyperframesFinalShotAnimationById,
      perShotTransition: hyperframesFinalShotTransitionById,
      perShotTextMotionPreset: hyperframesFinalShotTextMotionById,
    };
    return {
      signature: JSON.stringify({
        productId: effectiveHyperframesProductId ?? "",
        runId: effectiveHyperframesRunId ?? "",
        reviewId: canonicalReviewId ?? "",
        textVariables,
      }),
      textVariables,
    };
  }, [
    canonicalReviewId,
    effectiveHyperframesProductId,
    effectiveHyperframesRunId,
    generatedHyperframesFinalRenderPrompt,
    hyperframesFinalAudioPackPresetId,
    hyperframesFinalBurnInSubtitles,
    hyperframesFinalFont,
    hyperframesFinalHookText,
    hyperframesFinalMusicPresetId,
    hyperframesFinalOverlayPreset,
    hyperframesFinalPreserveNativeAudio,
    hyperframesFinalSfxDrafts,
    hyperframesFinalSfxPresetIds,
    hyperframesFinalShotAnimationById,
    hyperframesFinalShotOverlayPresetById,
    hyperframesFinalShotTextById,
    hyperframesFinalShotTextMotionById,
    hyperframesFinalShotTransitionById,
    hyperframesFinalStyleBrief,
    hyperframesFinalSubtitleSrtById,
    hyperframesFinalSubtitleById,
    hyperframesFinalSubtitleFontSizePx,
    hyperframesFinalSubtitlePreset,
    hyperframesFinalSubtitleVttById,
    hyperframesFinalSupportingText,
    hyperframesFinalSyntheticAudioFallback,
    hyperframesFinalTextMotionPreset,
  ]);

  const isHyperframesFinalPromptStale = Boolean(
    hyperframesFinalPromptGeneratedSignature &&
      hyperframesFinalPromptGeneratedSignature !== hyperframesFinalPromptInputSignature,
  );

  useEffect(() => {
    if (hyperframesFinalPromptGeneratedSignature) return;
    if (!generatedHyperframesFinalRenderPrompt.trim()) return;
    setHyperframesFinalPromptGeneratedSignature(hyperframesFinalPromptInputSignature);
    setHyperframesFinalStyleBrief(current => {
      if (current.trim() && current !== DEFAULT_HYPERFRAMES_FINAL_STYLE_BRIEF) return current;
      return generatedHyperframesFinalRenderPrompt;
    });
  }, [
    generatedHyperframesFinalRenderPrompt,
    hyperframesFinalPromptGeneratedSignature,
    hyperframesFinalPromptInputSignature,
  ]);

  const hyperframesFinalPayloadPreview = useMemo(
    () =>
      buildHyperframesFinalPayloadPreview({
        renderPrompt: hyperframesFinalStyleBrief,
        overlayPreset: resolvedHyperframesFinalOverlayPreset,
        subtitlePreset: hyperframesFinalSubtitlePreset,
        subtitleFontSizePx: hyperframesFinalSubtitleFontSizePx,
        textMode: hyperframesFinalTextMode,
        textMotionPreset: hyperframesFinalTextMotionPreset,
        fontFamily: hyperframesFinalFont,
        hookText: hyperframesFinalResolvedHookText,
        supportingText: hyperframesFinalResolvedSupportingText,
        audioPackPresetId: hyperframesFinalAudioPackPresetId,
        musicPresetId: hyperframesFinalMusicPresetId,
        sfxPresetIds: hyperframesFinalSfxPresetIds,
        sfxDrafts: hyperframesFinalSfxDrafts,
        preserveNativeAudio: hyperframesFinalPreserveNativeAudio,
        syntheticAudioFallback: hyperframesFinalSyntheticAudioFallback,
        burnInSubtitles: hyperframesFinalBurnInSubtitles,
        durationSeconds: hyperframesFinalDurationSeconds,
        shots: hyperframesFinalResolvedPromptShots,
      }),
    [
      hyperframesFinalAudioPackPresetId,
      hyperframesFinalBurnInSubtitles,
      hyperframesFinalDurationSeconds,
      hyperframesFinalFont,
      hyperframesFinalMusicPresetId,
      hyperframesFinalPreserveNativeAudio,
      hyperframesFinalResolvedHookText,
      hyperframesFinalResolvedPromptShots,
      hyperframesFinalResolvedSupportingText,
      hyperframesFinalSfxDrafts,
      hyperframesFinalSfxPresetIds,
      hyperframesFinalStyleBrief,
      hyperframesFinalSubtitleFontSizePx,
      hyperframesFinalSubtitlePreset,
      hyperframesFinalSyntheticAudioFallback,
      hyperframesFinalTextMode,
      hyperframesFinalTextMotionPreset,
      resolvedHyperframesFinalOverlayPreset,
    ],
  );
  const previewMatchCompositionPayload = useMemo(
    () => {
      const payload = buildPreviewMatchCompositionPayloadFromHyperframesPreview(
          JSON.parse(hyperframesFinalPayloadPreview),
          {
            tenantId: "default",
            productId: effectiveHyperframesProductId,
            runId: effectiveHyperframesRunId,
            storyboardReviewId: canonicalReviewId ? String(canonicalReviewId) : null,
            revision: hyperframesFinalStateRevisionRef.current,
          },
        );
      return withPreviewMatchCompositionHashes({
        ...payload,
        audio: {
          ...payload.audio,
          includeAudioEventsInCapture: previewMatchCaptureAudioEventsEnabled,
        },
      });
    },
    [
      canonicalReviewId,
      effectiveHyperframesProductId,
      effectiveHyperframesRunId,
      hyperframesFinalPayloadPreview,
      previewMatchCaptureAudioEventsEnabled,
    ],
  );
  const previewMatchCompositionHash = useMemo(
    () => previewMatchCompositionPayload.previewCompositionHash,
    [previewMatchCompositionPayload],
  );
  const previewMatchTimelineHash = useMemo(
    () => previewMatchCompositionPayload.timelineHash,
    [previewMatchCompositionPayload],
  );
  const previewMatchFinalCompositeConfigHash = previewMatchCompositionPayload.finalCompositeConfigHash;
  const previewMatchCaptureQuery = trpc.marketplaceCapture.getPreviewMatchCaptureJob.useQuery(
    {
      captureJobId: previewMatchCaptureJobId ?? undefined,
      productId: effectiveHyperframesProductId,
      runId: effectiveHyperframesRunId ?? "",
      storyboardReviewId: canonicalReviewId ? String(canonicalReviewId) : undefined,
    },
    {
      enabled: Boolean(
        previewMatchCaptureJobId ||
          (effectiveHyperframesProductId && effectiveHyperframesRunId),
      ),
      refetchInterval: query => {
        const status = (query.state.data as any)?.capture?.status;
        return [
          "queued",
          "preparing_assets",
          "browser_ready",
          "capturing",
          "encoding",
          "verifying",
          "publishing",
        ].includes(status) ? 2500 : false;
      },
    },
  );
  const previewMatchCaptureProjection =
    previewMatchCaptureQuery.data?.capture ??
    cancelPreviewMatchFinalCompositeCaptureMutation.data?.capture ??
    createPreviewMatchFinalCompositeCaptureMutation.data?.capture ??
    null;
  useEffect(() => {
    setPreviewMatchCaptureJobId(null);
  }, [canonicalReviewId, effectiveHyperframesProductId, effectiveHyperframesRunId]);

  const hyperframesFinalHasUnsavedTextEdits = useMemo(
    () =>
      isHyperframesFinalHookEditing ||
      hyperframesFinalSourceClips.some(clip =>
        Boolean(hyperframesFinalOverlayEditingById[clip.id]) ||
        Boolean(hyperframesFinalSubtitleEditingById[clip.id])
      ),
    [
      hyperframesFinalOverlayEditingById,
      hyperframesFinalSourceClips,
      hyperframesFinalSubtitleEditingById,
      isHyperframesFinalHookEditing,
    ],
  );

  const hyperframesFinalCompositeDisabledReason = useMemo(() => {
    if (hyperframesFinalSourceClips.length === 0) {
      return hyperframesFinalMissingVideoTitle;
    }
    if (hyperframesFinalHasUnsavedTextEdits) {
      return locale === "th"
        ? "มี Overlay/Subtitle ที่กำลังแก้ไขอยู่ กดบันทึกหรือยกเลิกก่อน render"
        : "Overlay/subtitle text is still being edited. Save or cancel before rendering.";
    }
    if (!effectiveHyperframesProductId || !effectiveHyperframesRunId) {
      return locale === "th"
        ? "กำลังรอ context จาก Marketplace Capture"
        : "Waiting for Marketplace Capture context";
    }
    if (hyperframesFinalIdentityMismatchReason) {
      return hyperframesFinalIdentityMismatchReason;
    }
    if (
      !hyperframesFinalSyntheticAudioFallback &&
      (hyperframesFinalMusicPresetId || hyperframesFinalSfxPresetIds.length > 0)
    ) {
      return locale === "th"
        ? "ต้องมี licensed staged audio assets หรือเปิด synthetic fallback ก่อน render"
        : "Licensed staged audio assets are required, or enable synthetic fallback before rendering";
    }
    return null;
  }, [
    effectiveHyperframesProductId,
    effectiveHyperframesRunId,
    hyperframesFinalIdentityMismatchReason,
    hyperframesFinalHasUnsavedTextEdits,
    hyperframesFinalMissingVideoTitle,
    hyperframesFinalMusicPresetId,
    hyperframesFinalSourceClips.length,
    hyperframesFinalSfxPresetIds.length,
    hyperframesFinalSyntheticAudioFallback,
    locale,
  ]);
  const hyperframesFinalCompositeRenderBlockedReason =
    hyperframesFinalCompositeDisabledReason ??
    hyperframesFinalCompositeDuplicateGuardReason;
  const hyperframesFinalCompositeRenderButtonDisabled = Boolean(
    createHyperframesFinalCompositeMutation.isPending ||
      updateHyperframesFinalCompositeStateMutation.isPending ||
      hyperframesFinalCompositeRenderBlockedReason
  );
  const previewMatchCaptureIsActive = Boolean(
    previewMatchCaptureProjection?.status &&
      [
        "queued",
        "preparing_assets",
        "browser_ready",
        "capturing",
        "encoding",
        "verifying",
        "publishing",
      ].includes(previewMatchCaptureProjection.status),
  );
  const previewMatchCaptureIsComplete = Boolean(
    previewMatchCaptureProjection?.status &&
      ["completed", "saved_to_library"].includes(previewMatchCaptureProjection.status),
  );
  const previewMatchCaptureIsProblem = Boolean(
    previewMatchCaptureProjection?.status &&
      [
        "blocked",
        "failed_transient",
        "failed_permanent",
        "verification_failed",
        "compliance_blocked",
      ].includes(previewMatchCaptureProjection.status),
  );
  const previewMatchCaptureElapsedLabel = formatStoryboardCaptureElapsedSeconds(
    previewMatchCaptureProjection?.captureElapsedSeconds,
    locale,
  );
  const previewMatchCaptureStatusTitle = previewMatchCaptureProjection
    ? previewMatchCaptureIsComplete
      ? locale === "th" ? "Capture เสร็จแล้ว" : "Capture complete"
      : previewMatchCaptureIsProblem
        ? previewMatchCaptureProjection.status === "blocked"
          ? locale === "th" ? "Capture ยังไม่พร้อมใช้งาน" : "Capture unavailable"
          : locale === "th" ? "Capture ไม่สำเร็จ" : "Capture failed"
        : previewMatchCaptureProjection.status === "cancelled"
          ? locale === "th" ? "ยกเลิก Capture แล้ว" : "Capture cancelled"
          : locale === "th" ? "กำลังทำงาน Capture ตาม Preview" : "Preview-match capture is running"
    : locale === "th" ? "ยังไม่ได้เริ่ม Capture ตาม Preview" : "Preview-match capture has not started";
  const previewMatchCaptureStatusDetail = previewMatchCaptureProjection
    ? previewMatchCaptureProjection.safeMessage ??
      (previewMatchCaptureProjection.status === "queued"
        ? locale === "th"
          ? "ส่งงานเข้า queue แล้ว ตอนนี้กำลังรอ server capture worker รับงาน"
          : "The job is queued and waiting for a server capture worker."
        : previewMatchCaptureIsComplete
          ? locale === "th"
            ? `Capture ตาม Preview เสร็จแล้ว${previewMatchCaptureElapsedLabel ? ` ใช้เวลา ${previewMatchCaptureElapsedLabel}` : ""} ผลลัพธ์ที่ผ่าน verification จะแสดงปุ่มเปิดไฟล์หรือ Library item ในแถบนี้`
            : `Preview-match capture is complete${previewMatchCaptureElapsedLabel ? ` in ${previewMatchCaptureElapsedLabel}` : ""}. Verified output or Library item links appear in this status bar.`
          : locale === "th"
            ? "ระบบจะอัปเดตสถานะที่แถบนี้ระหว่าง capture, encode, verify และ publish"
            : "This bar updates while the job captures, encodes, verifies, and publishes.")
    : (locale === "th"
        ? "กด Capture ตาม Preview เพื่อสร้าง job แล้วสถานะจะปรากฏตรงนี้"
        : "Click Capture Final Composite to create a job; status appears here.");
  const previewMatchCaptureDisabledReason =
    (!previewMatchCaptureFlags.captureEnabled
      ? locale === "th"
        ? "Preview-match capture ถูกปิดไว้ชั่วคราว แต่ Render Final Composite ยังใช้งานได้"
        : "Preview-match capture is temporarily disabled. Render Final Composite remains available."
      : !previewMatchCaptureFlags.serverWorkerEnabled
        ? locale === "th"
          ? "Preview-match capture worker ถูกปิดไว้ชั่วคราว แต่ Render Final Composite ยังใช้งานได้"
          : "Preview-match capture worker is temporarily disabled. Render Final Composite remains available."
        : previewMatchCaptureQuality === "high" && !previewMatchCaptureFlags.highQualityEnabled
          ? locale === "th"
            ? "High quality capture ยังไม่เปิดใน rollout นี้"
            : "High quality capture is not enabled for this rollout."
          : null) ??
    hyperframesFinalCompositeDisabledReason ??
    (!canonicalReviewId || !effectiveHyperframesProductId || !effectiveHyperframesRunId
      ? locale === "th"
        ? "กำลังรอ context จาก Marketplace Capture"
        : "Waiting for Marketplace Capture context"
      : previewMatchCaptureIsActive
        ? locale === "th"
          ? "มี Capture ตาม Preview กำลังทำงานอยู่"
          : "A preview-match capture is already running"
        : null);
  const previewMatchHighQualityEnabled = previewMatchCaptureFlags.highQualityEnabled;
  const previewMatchCaptureButtonDisabled = Boolean(
    createPreviewMatchFinalCompositeCaptureMutation.isPending ||
      cancelPreviewMatchFinalCompositeCaptureMutation.isPending ||
      updateHyperframesFinalCompositeStateMutation.isPending ||
      previewMatchCaptureDisabledReason,
  );

  const generateHyperframesFinalPromptWithSkill = useCallback(async () => {
    if (hyperframesFinalSourceClips.length === 0) {
      toast.error(hyperframesFinalMissingVideoDetail || hyperframesFinalMissingVideoTitle);
      return;
    }
    if (hyperframesFinalCompositeDisabledReason) {
      toast.error(hyperframesFinalCompositeDisabledReason);
      return;
    }
    const lastResolvedPromptShot = hyperframesFinalResolvedPromptShots[hyperframesFinalResolvedPromptShots.length - 1];
    const resolvedPromptDurationSeconds = lastResolvedPromptShot?.endSec ?? hyperframesFinalDurationSeconds;
    const promptCompositeShots: HyperframesFinalCompositeConfig["shots"] = hyperframesFinalResolvedPromptShots.map((shot, index) => ({
      id: shot.id,
      index,
      title: firstThaiProductLine(shot.prompt, 80),
      sourceVideoUrl: shot.sourceVideoRef,
      sourceVideoRef: shot.sourceVideoRef,
      mediaStartSec: shot.mediaStartSec,
      startSec: shot.startSec,
      durationSec: shot.durationSeconds,
      onScreenText: shot.overlayLines,
      subtitleCues: shot.subtitleCues,
      overlayPreset: shot.overlayPreset,
      animationPreset: shot.animationPreset,
      transition: shot.transition,
      textMotionPreset: shot.textMotionPreset,
    }));
    const promptAudioEvents = buildHyperframesFinalAudioEvents({
      finalVideoLengthSec: resolvedPromptDurationSeconds,
      shots: promptCompositeShots,
      musicPresetId: hyperframesFinalMusicPresetId || undefined,
      sfxPresetIds: hyperframesFinalSfxPresetIds,
      sfxDrafts: hyperframesFinalSfxDrafts,
    });
    try {
      const result = await generateHyperframesFinalPromptSkillMutation.mutateAsync({
        skillId: "hyperframes-render-prompt",
        originSurface: "media_studio",
        userInputs: {
          purpose: "marketplace_hyperframes_final_composite_prompt",
          request: [
            "Use the hyperframes-render-prompt skill to create one complete HyperFrames final composite render prompt.",
            "Return only the final prompt text or JSON with a prompt field.",
            "Do not invent product claims, prices, logos, or unsupported facts.",
            `Keep the final prompt within ${HYPERFRAMES_FINAL_PROMPT_MAX_LENGTH} characters. Compress sections if needed; do not cut off mid-sentence.`,
            "Use these userInputs as the source of truth for product facts, clips, overlay copy, subtitles, audio, and timing.",
          ].join("\n"),
          maxPromptLength: HYPERFRAMES_FINAL_PROMPT_MAX_LENGTH,
          maxPromptChars: HYPERFRAMES_FINAL_PROMPT_MAX_LENGTH,
          currentPromptPreview: generatedHyperframesFinalRenderPrompt,
          productTitle: hyperframesFinalProductPromptContext.productTitle,
          productDescription: hyperframesFinalProductPromptContext.productDescription,
          priceText: hyperframesFinalProductPromptContext.priceText,
          platform: {
            aspectRatio: "9:16",
            width: 1080,
            height: 1920,
            fps: 30,
            safeZonePercent: 8,
            language: locale === "th" ? "th" : "en",
            exportFormat: "mp4",
            maxFinalVideoLengthSec: HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC,
            maxShotLengthSec: HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC,
          },
          renderContract: {
            hyperframesRuntime: "official_css_browser_runtime",
            compositionMode: "captioned_final_composite",
            renderIntent: "final",
            cssAnimationEnabled: true,
            gsapCompatibleTimeline: true,
            fallbackAllowed: false,
            previewAndRenderMustUseSameResolvedText: true,
          },
          overlayPreset: resolvedHyperframesFinalOverlayPreset,
          overlayPresetSource: hyperframesFinalOverlayPreset === "auto" ? "auto_resolved" : "user_selected",
          overlayPresetLabel: hyperframesFinalPresetLabels.overlayPresetLabel,
          subtitlePreset: hyperframesFinalSubtitlePreset,
          subtitlePresetLabel: hyperframesFinalPresetLabels.subtitlePresetLabel,
          subtitleFontSizePx: hyperframesFinalSubtitleFontSizePx,
          textMode: hyperframesFinalTextMode,
          textModeLabel: hyperframesFinalPresetLabels.textModeLabel,
          textModeDescription: hyperframesFinalPresetLabels.textModeDescription,
          textMotionPreset: hyperframesFinalTextMotionPreset,
          textMotionPresetLabel: hyperframesFinalPresetLabels.textMotionPresetLabel,
          fontFamily: hyperframesFinalFont,
          hookText: hyperframesFinalResolvedHookText,
          supportingText: hyperframesFinalResolvedSupportingText,
          audioPackPresetId: hyperframesFinalAudioPackPresetId,
          audioPackPresetLabel: hyperframesFinalPresetLabels.audioPackPresetLabel,
          musicPresetId: hyperframesFinalMusicPresetId,
          musicPresetLabel: hyperframesFinalPresetLabels.musicPresetLabel,
          sfxPresetIds: hyperframesFinalSfxPresetIds,
          sfxPresetLabels: hyperframesFinalPresetLabels.sfxPresetLabels,
          sfxDrafts: hyperframesFinalSfxDrafts,
          audioEvents: promptAudioEvents,
          preserveNativeAudio: hyperframesFinalPreserveNativeAudio,
          syntheticAudioFallback: hyperframesFinalSyntheticAudioFallback,
          burnInSubtitles: hyperframesFinalBurnInSubtitles,
          durationSeconds: resolvedPromptDurationSeconds,
          shots: hyperframesFinalResolvedPromptShots.map((shot, index) => ({
            index,
            id: shot.id,
            sourceClipId: shot.sourceClipId,
            sourceVideoRef: shot.sourceVideoRef,
            mediaStartSec: shot.mediaStartSec,
            startSec: shot.startSec,
            endSec: shot.endSec,
            durationSeconds: shot.durationSeconds,
            prompt: shot.prompt,
            overlayText: shot.overlayText,
            overlayLines: shot.overlayLines,
            subtitleText: shot.subtitleText,
            subtitleCues: shot.subtitleCues,
            subtitleVtt: shot.subtitleVtt || "",
            subtitleSrt: shot.subtitleSrt || "",
            overlayPreset: shot.overlayPreset,
            overlayPresetLabel: getHyperframesOptionLabel(HYPERFRAMES_FINAL_OVERLAY_PRESETS, shot.overlayPreset, locale),
            animationPreset: shot.animationPreset,
            animationPresetLabel: getHyperframesOptionLabel(HYPERFRAMES_FINAL_SHOT_ANIMATION_PRESETS, shot.animationPreset, locale),
            transition: shot.transition,
            transitionLabel: getHyperframesOptionLabel(HYPERFRAMES_FINAL_SHOT_TRANSITIONS, shot.transition, locale),
            textMotionPreset: shot.textMotionPreset,
            textMotionPresetLabel: getHyperframesOptionLabel(HYPERFRAMES_FINAL_TEXT_MOTION_PRESETS, shot.textMotionPreset, locale),
          })),
        },
      });
      const skillPrompt = extractHyperframesPromptFromSkillMessage(
        (result as { content?: string | null; message?: string | null } | undefined)?.content
          ?? (result as { content?: string | null; message?: string | null } | undefined)?.message,
      );
      if (!skillPrompt.trim()) {
        throw new Error(locale === "th" ? "hyperframes-render-prompt skill ไม่ได้ส่ง prompt กลับมา" : "hyperframes-render-prompt skill returned an empty prompt.");
      }
      if (skillPrompt.length > HYPERFRAMES_FINAL_PROMPT_MAX_LENGTH) {
        throw new Error(
          locale === "th"
            ? `hyperframes-render-prompt ส่ง prompt ยาว ${skillPrompt.length.toLocaleString()} ตัวอักษร เกิน limit ${HYPERFRAMES_FINAL_PROMPT_MAX_LENGTH.toLocaleString()} ตัวอักษร จึงไม่บันทึก prompt ที่อาจถูกตัดกลางประโยค`
            : `hyperframes-render-prompt returned ${skillPrompt.length.toLocaleString()} characters, exceeding the ${HYPERFRAMES_FINAL_PROMPT_MAX_LENGTH.toLocaleString()} character limit. The oversized prompt was not saved.`,
        );
      }
      setHyperframesFinalStyleBrief(skillPrompt);
      setIsHyperframesFinalPromptEdited(false);
      setHyperframesFinalPromptGeneratedSignature(hyperframesFinalPromptInputSignature);
      toast.success(locale === "th" ? "Generate prompt ด้วย hyperframes-render-prompt แล้ว" : "Generated prompt with hyperframes-render-prompt.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("hyperframes-render-prompt skill failed; prompt remains stale and render stays blocked.", error);
      toast.error(
        locale === "th"
          ? `Generate prompt ด้วย skill ไม่สำเร็จ: ${message}`
          : `Prompt skill failed: ${message}`,
      );
    }
  }, [
    generatedHyperframesFinalRenderPrompt,
    generateHyperframesFinalPromptSkillMutation,
    hyperframesFinalAudioPackPresetId,
    hyperframesFinalBurnInSubtitles,
    hyperframesFinalCompositeDisabledReason,
    hyperframesFinalDurationSeconds,
    hyperframesFinalFont,
    hyperframesFinalMissingVideoDetail,
    hyperframesFinalMissingVideoTitle,
    hyperframesFinalMusicPresetId,
    hyperframesFinalOverlayPreset,
    hyperframesFinalPresetLabels,
    hyperframesFinalPreserveNativeAudio,
    hyperframesFinalProductPromptContext,
    hyperframesFinalPromptInputSignature,
    hyperframesFinalResolvedHookText,
    hyperframesFinalResolvedPromptShots,
    hyperframesFinalResolvedSupportingText,
    hyperframesFinalSourceClips.length,
    hyperframesFinalSfxDrafts,
    hyperframesFinalSfxPresetIds,
    hyperframesFinalSubtitleFontSizePx,
    hyperframesFinalSubtitlePreset,
    hyperframesFinalSyntheticAudioFallback,
    hyperframesFinalTextMode,
    hyperframesFinalTextMotionPreset,
    locale,
    resolvedHyperframesFinalOverlayPreset,
    toast,
  ]);

  const persistHyperframesFinalCompositeState = useCallback(async (patch: {
    shotMediaAssignments?: Array<Record<string, unknown>>;
    textVariables?: Record<string, unknown>;
    creativePlanHash?: string | null;
    latestRenderJobRef?: Record<string, unknown>;
  }) => {
    if (!canonicalReviewId || !effectiveHyperframesProductId || !effectiveHyperframesRunId) {
      return null;
    }
    if (hyperframesFinalIdentityMismatchReason) {
      return null;
    }
    const persistWithRevision = async (expectedRevision: number) => {
      const result = await updateHyperframesFinalCompositeStateMutation.mutateAsync({
        storyboardReviewProjectId: canonicalReviewId,
        productId: effectiveHyperframesProductId,
        runId: effectiveHyperframesRunId,
        expectedRevision,
        patch: patch as any,
      });
      hyperframesFinalStateRevisionRef.current = result.state.revision;
      return result.state;
    };

    try {
      return await persistWithRevision(hyperframesFinalStateRevisionRef.current ?? 0);
    } catch (error) {
      if (!isHyperframesFinalRevisionConflictError(error)) {
        throw error;
      }
      const refreshed = await refetchStoryboardReview();
      const latestRevision = getHyperframesFinalStateRevisionFromReview(refreshed.data);
      if (typeof latestRevision !== "number") {
        throw error;
      }
      hyperframesFinalStateRevisionRef.current = latestRevision;
      return persistWithRevision(latestRevision);
    }
  }, [
    canonicalReviewId,
    effectiveHyperframesProductId,
    effectiveHyperframesRunId,
    hyperframesFinalIdentityMismatchReason,
    refetchStoryboardReview,
    updateHyperframesFinalCompositeStateMutation,
  ]);

  useEffect(() => {
    hyperframesFinalAutosaveSnapshotRef.current = hyperframesFinalAutosaveSnapshot;
    if (hyperframesFinalAutosaveFlushAfterSnapshotRef.current) {
      hyperframesFinalAutosaveFlushAfterSnapshotRef.current = false;
      void hyperframesFinalAutosaveFlushRef.current();
    }
  }, [hyperframesFinalAutosaveSnapshot]);

  const flushHyperframesFinalCompositeAutosave = useCallback(async () => {
    if (!canonicalReviewId || !effectiveHyperframesProductId || !effectiveHyperframesRunId) {
      return;
    }
    if (hyperframesFinalIdentityMismatchReason) {
      setHyperframesFinalAutosaveStatus("error");
      return;
    }
    if (hyperframesFinalAutosaveInFlightRef.current) {
      hyperframesFinalAutosaveNeedsFlushRef.current = true;
      return;
    }

    hyperframesFinalAutosaveInFlightRef.current = true;
    let shouldScheduleAnotherFlush = false;
    setHyperframesFinalAutosaveStatus("saving");
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        hyperframesFinalAutosaveNeedsFlushRef.current = false;
        const snapshot = hyperframesFinalAutosaveSnapshotRef.current;
        if (!snapshot || snapshot.signature === hyperframesFinalAutosaveLastSignatureRef.current) {
          break;
        }
        await persistHyperframesFinalCompositeState({
          textVariables: snapshot.textVariables,
        });
        hyperframesFinalAutosaveLastSignatureRef.current = snapshot.signature;

        const latestSnapshot = hyperframesFinalAutosaveSnapshotRef.current;
        if (
          !hyperframesFinalAutosaveNeedsFlushRef.current &&
          (!latestSnapshot || latestSnapshot.signature === hyperframesFinalAutosaveLastSignatureRef.current)
        ) {
          break;
        }
      }

      const latestSnapshot = hyperframesFinalAutosaveSnapshotRef.current;
      shouldScheduleAnotherFlush = Boolean(
        latestSnapshot && latestSnapshot.signature !== hyperframesFinalAutosaveLastSignatureRef.current,
      );
      if (!shouldScheduleAnotherFlush) {
        hyperframesFinalLocalTextDirtyRef.current = false;
      }
      setHyperframesFinalAutosaveStatus(shouldScheduleAnotherFlush ? "idle" : "saved");
    } catch (error) {
      console.error("Failed to autosave HyperFrames Final Composite state.", error);
      setHyperframesFinalAutosaveStatus("error");
    } finally {
      hyperframesFinalAutosaveInFlightRef.current = false;
      if (shouldScheduleAnotherFlush && typeof window !== "undefined") {
        window.setTimeout(() => {
          void hyperframesFinalAutosaveFlushRef.current();
        }, 0);
      }
    }
  }, [
    canonicalReviewId,
    effectiveHyperframesProductId,
    effectiveHyperframesRunId,
    hyperframesFinalIdentityMismatchReason,
    persistHyperframesFinalCompositeState,
  ]);

  useEffect(() => {
    hyperframesFinalAutosaveFlushRef.current = flushHyperframesFinalCompositeAutosave;
  }, [flushHyperframesFinalCompositeAutosave]);

  useEffect(() => {
    if (!canonicalReviewId || !effectiveHyperframesProductId || !effectiveHyperframesRunId) {
      return;
    }
    if (hyperframesFinalIdentityMismatchReason) {
      return;
    }
    if (isReviewLoading || !reviewRecordMatchesRoute || !reviewRecord) {
      return;
    }
    if (hyperframesFinalSourceClips.length === 0) {
      return;
    }
    if (hyperframesFinalAutosaveSkipNextRef.current) {
      hyperframesFinalAutosaveSkipNextRef.current = false;
      hyperframesFinalAutosaveLastSignatureRef.current = hyperframesFinalAutosaveSnapshot.signature;
      setHyperframesFinalAutosaveStatus("saved");
      return;
    }
    if (hyperframesFinalAutosaveSnapshot.signature === hyperframesFinalAutosaveLastSignatureRef.current) {
      return;
    }

    setHyperframesFinalAutosaveStatus(current => current === "saving" ? current : "idle");
    const timeoutId = window.setTimeout(() => {
      void hyperframesFinalAutosaveFlushRef.current();
    }, HYPERFRAMES_FINAL_AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [
    canonicalReviewId,
    effectiveHyperframesProductId,
    effectiveHyperframesRunId,
    hyperframesFinalIdentityMismatchReason,
    hyperframesFinalAutosaveSnapshot.signature,
    hyperframesFinalSourceClips.length,
    isReviewLoading,
    reviewRecord,
    reviewRecordMatchesRoute,
  ]);

  const createHyperframesFinalComposite = useCallback(async () => {
    if (!effectiveHyperframesProductId || !effectiveHyperframesRunId) {
      toast.error(locale === "th" ? "ยังไม่มี product/run context สำหรับ HyperFrames final composite" : "Missing product/run context for HyperFrames final composite.");
      return;
    }
    if (hyperframesFinalSourceClips.length === 0) {
      toast.error(hyperframesFinalMissingVideoDetail || hyperframesFinalMissingVideoTitle);
      return;
    }
    if (hyperframesFinalCompositeDisabledReason) {
      toast.error(hyperframesFinalCompositeDisabledReason);
      return;
    }
    if (hyperframesFinalCompositeDuplicateGuardActive) {
      toast.error(hyperframesFinalCompositeDuplicateGuardReason);
      return;
    }
    setHyperframesFinalCompositeCooldownUntil(
      Date.now() + HYPERFRAMES_FINAL_RENDER_DUPLICATE_GUARD_MS,
    );
    try {
      const productContext = draft
        ? resolveStoryboardDraftMarketplaceProduct(draft) as Record<string, unknown> | null
        : null;
      const productDescription = compactStoryboardText(
        productContext?.description ?? productContext?.descriptionText ?? draft?.conceptDetails ?? "",
      );
      const storyboardName = draft ? getStoryboardReviewName(draft) : "";
      const productTitle = compactStoryboardText(
        productContext?.title ?? productContext?.name ?? productContext?.productName ?? storyboardName,
      );
      const textExpansionSources = [
        productDescription,
        productTitle,
        storyboardName,
      ].filter(Boolean);
      const renderHookText = expandLegacyEllipsizedHyperframesText(
        hyperframesFinalHookText,
        textExpansionSources,
        180,
      );
      const renderSupportingText = expandLegacyEllipsizedHyperframesText(
        hyperframesFinalSupportingText,
        [productTitle, productDescription, storyboardName].filter(Boolean),
        160,
      );
      const resolvedOverlayPreset = resolvedHyperframesFinalOverlayPreset;
      let cursor = 0;
      const shots: HyperframesFinalCompositeConfig["shots"] = [];
      const shotMediaAssignments: Array<Record<string, unknown>> = [];
      const renderPerShotTextById: Record<string, string> = {};
      for (const [index, clip] of hyperframesFinalSourceClips.entries()) {
        const durationSec = Math.min(
          HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC,
          Math.max(1, clip.durationSeconds ?? DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS)
        );
        const storedUrl = await importStoryboardAssetForRender(clip.url, "video");
        shotMediaAssignments.push({
          storyboardReviewProjectId: canonicalReviewId,
          shotId: clip.id,
          sourceShotId: clip.sourceClipId ?? clip.id,
          mediaStartSec: clip.mediaStartSec ?? 0,
          shotIndex: index,
          source: "storyboard_generated_clip",
          mediaKind: "video",
          sourceUrl: storedUrl,
          storageRef: storedUrl,
          durationSec,
          ...(clip.derivedFromUrl
            ? {
                derivedFromUrl: clip.derivedFromUrl,
                derivedSourceTrim: clip.derivedSourceTrim,
              }
            : {}),
          assignedByUserId: "storyboard_review_user",
          assignedAt: new Date().toISOString(),
        });
        const subtitleText = hyperframesFinalSubtitleById[clip.id] ?? defaultHyperframesSubtitleText(clip);
        const shotOverlayPreset = hyperframesFinalShotOverlayPresetById[clip.id] ?? resolvedOverlayPreset;
        const resolvedShotOverlayLines = resolveHyperframesFinalShotOverlayLines({
          textMode: hyperframesFinalTextMode,
          shotIndex: index,
          overlayPreset: shotOverlayPreset,
          productContext,
          productTitle: productTitle || storyboardName,
          productDescription,
          storyboardName,
          hookText: renderHookText,
          supportingText: renderSupportingText,
          clip,
          clipCount: hyperframesFinalSourceClips.length,
          savedOverlayText: hyperframesFinalShotTextById[clip.id],
        });
        renderPerShotTextById[clip.id] = resolvedShotOverlayLines.join("\n");
        shots.push({
          id: clip.id,
          index,
          title: firstThaiProductLine(clip.prompt, 80),
          sourceVideoUrl: storedUrl,
          sourceVideoRef: clip.url,
          mediaStartSec: clip.mediaStartSec ?? 0,
          startSec: Math.round(cursor * 10) / 10,
          durationSec,
          onScreenText: resolvedShotOverlayLines,
          subtitleCues: subtitleCuesFromEditableText(subtitleText, cursor, durationSec),
          overlayPreset: shotOverlayPreset,
          animationPreset: hyperframesFinalShotAnimationById[clip.id] ?? (index === hyperframesFinalSourceClips.length - 2 ? "bounce_price" : index === 0 ? "glow_feature" : "smooth_reveal"),
          transition: hyperframesFinalShotTransitionById[clip.id] ?? "fade",
          textMotionPreset: hyperframesFinalShotTextMotionById[clip.id] ?? defaultHyperframesFinalTextMotionPreset(index),
        });
        cursor += durationSec;
      }
      const finalVideoLengthSec = Math.round(cursor * 10) / 10;
      const selectedSfxPresetIds = hyperframesFinalSfxPresetIds
        .map(id => id.trim())
        .filter(Boolean)
        .slice(0, 8);
      const audioEvents = buildHyperframesFinalAudioEvents({
        finalVideoLengthSec,
        shots,
        musicPresetId: hyperframesFinalMusicPresetId || undefined,
        sfxPresetIds: selectedSfxPresetIds,
        sfxDrafts: hyperframesFinalSfxDrafts,
      });
      const audioAssetRefs = audioEvents.map(event => event.assetRef);
      const config: HyperframesFinalCompositeConfig = {
        finalVideoLengthSec,
        width: 1080,
        height: 1920,
        fps: 30,
        textMode: hyperframesFinalTextMode,
        overlayPreset: resolvedOverlayPreset,
        includeHookText: shouldRenderHyperframesFinalHookText(hyperframesFinalTextMode),
        includeShotText: hyperframesFinalTextMode === "per_shot" || hyperframesFinalTextMode === "hook_and_per_shot",
        burnInSubtitles: hyperframesFinalBurnInSubtitles,
        preserveNativeAudio: hyperframesFinalPreserveNativeAudio,
        subtitlePreset: hyperframesFinalSubtitlePreset,
        audioPackPresetId: hyperframesFinalAudioPackPresetId || undefined,
        musicPresetId: hyperframesFinalMusicPresetId || undefined,
        sfxPresetIds: selectedSfxPresetIds,
        audioEvents,
        audioAssetValidation: {
          stagedAssetsRequired: true,
          allowSyntheticFallback: hyperframesFinalSyntheticAudioFallback,
          missingAssetRefs: audioAssetRefs,
          validatedAssetRefs: [],
          validatedAssets: [],
        },
        fontFamily: hyperframesFinalFont,
        styleBrief: hyperframesFinalStyleBrief.trim() || generatedHyperframesFinalRenderPrompt,
        hookText: renderHookText,
        supportingText: renderSupportingText,
        subtitlePlacement: "bottom",
        subtitleFontSizePx: hyperframesFinalSubtitleFontSizePx,
        textMotionPreset: hyperframesFinalTextMotionPreset,
        safeZonePercent: 8,
        cssAnimationEnabled: true,
        gsapCompatibleTimeline: true,
        shots,
      };
      const persistedState = await persistHyperframesFinalCompositeState({
        shotMediaAssignments,
        textVariables: {
          fontFamily: hyperframesFinalFont,
          overlayPresetId: resolvedOverlayPreset,
          subtitlePresetId: hyperframesFinalSubtitlePreset,
          subtitleFontSizePx: hyperframesFinalSubtitleFontSizePx,
          audioPackPresetId: hyperframesFinalAudioPackPresetId || undefined,
          musicPresetId: hyperframesFinalMusicPresetId || undefined,
          sfxPresetIds: selectedSfxPresetIds,
          sfxDrafts: hyperframesFinalSfxDrafts,
          preserveNativeAudio: hyperframesFinalPreserveNativeAudio,
          syntheticAudioFallback: hyperframesFinalSyntheticAudioFallback,
          burnInSubtitles: hyperframesFinalBurnInSubtitles,
          styleBrief: hyperframesFinalStyleBrief.trim() || generatedHyperframesFinalRenderPrompt,
          textMotionPreset: hyperframesFinalTextMotionPreset,
          hookText: renderHookText,
          supportingText: renderSupportingText,
          perShotText: hyperframesFinalShotTextById,
          perShotSubtitles: hyperframesFinalSubtitleById,
          perShotSubtitleVtt: hyperframesFinalSubtitleVttById,
          perShotSubtitleSrt: hyperframesFinalSubtitleSrtById,
          perShotOverlayPreset: hyperframesFinalShotOverlayPresetById,
          perShotAnimationPreset: hyperframesFinalShotAnimationById,
          perShotTransition: hyperframesFinalShotTransitionById,
          perShotTextMotionPreset: hyperframesFinalShotTextMotionById,
        },
      });
      const result = await createHyperframesFinalCompositeMutation.mutateAsync({
        productId: effectiveHyperframesProductId,
        runId: effectiveHyperframesRunId,
        config,
      });
      if (result.render?.renderJobId && persistedState) {
        const resultVideoOutput = getHyperframesPrimaryVideoOutput(result.render);
        const resultVideoUrl =
          typeof resultVideoOutput?.url === "string" && resultVideoOutput.url.trim()
            ? resultVideoOutput.url
            : undefined;
        await persistHyperframesFinalCompositeState({
          latestRenderJobRef: {
            renderJobId: result.render.renderJobId,
            status: result.render.status,
            outputUrl: resultVideoUrl,
            createdAt: result.render.updatedAt,
            updatedAt: result.render.updatedAt,
          },
        }).catch(() => undefined);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : locale === "th" ? "สร้าง HyperFrames final composite ไม่สำเร็จ" : "Failed to create HyperFrames final composite.");
    }
  }, [
    createHyperframesFinalCompositeMutation,
    canonicalReviewId,
    effectiveHyperframesProductId,
    effectiveHyperframesRunId,
    generatedHyperframesFinalRenderPrompt,
    hyperframesFinalAudioPackPresetId,
    hyperframesFinalBurnInSubtitles,
    hyperframesFinalCompositeDisabledReason,
    hyperframesFinalFont,
    hyperframesFinalHookText,
    hyperframesFinalMusicPresetId,
    hyperframesFinalOverlayPreset,
    hyperframesFinalPreserveNativeAudio,
    hyperframesFinalMissingVideoDetail,
    hyperframesFinalMissingVideoTitle,
    hyperframesFinalCompositeDuplicateGuardActive,
    hyperframesFinalCompositeDuplicateGuardReason,
    hyperframesFinalShotAnimationById,
    hyperframesFinalShotOverlayPresetById,
    hyperframesFinalShotTextById,
    hyperframesFinalShotTextMotionById,
    hyperframesFinalSourceClips,
    hyperframesFinalSfxDrafts,
    hyperframesFinalSfxPresetIds,
    hyperframesFinalShotTransitionById,
    hyperframesFinalStyleBrief,
    hyperframesFinalSubtitleSrtById,
    hyperframesFinalSubtitleById,
    hyperframesFinalSubtitleFontSizePx,
    hyperframesFinalSubtitlePreset,
    hyperframesFinalSubtitleVttById,
    hyperframesFinalSupportingText,
    hyperframesFinalSyntheticAudioFallback,
    hyperframesFinalTextMode,
    hyperframesFinalTextMotionPreset,
    importStoryboardAssetForRender,
    locale,
    draft,
    persistHyperframesFinalCompositeState,
    resolvedHyperframesFinalOverlayPreset,
  ]);

  const createPreviewMatchFinalCompositeCapture = useCallback(async () => {
    if (previewMatchCaptureDisabledReason) {
      toast.info(previewMatchCaptureDisabledReason);
      return;
    }
    if (!effectiveHyperframesProductId || !effectiveHyperframesRunId || !canonicalReviewId) {
      toast.error(locale === "th" ? "ยังไม่มี product/run context สำหรับ Capture ตาม Preview" : "Missing product/run context for preview-match capture.");
      return;
    }
    try {
      await createPreviewMatchFinalCompositeCaptureMutation.mutateAsync({
        productId: effectiveHyperframesProductId,
        runId: effectiveHyperframesRunId,
        storyboardReviewId: String(canonicalReviewId),
        quality: previewMatchCaptureQuality,
        expectedPreviewCompositionHash: previewMatchCompositionHash,
        expectedTimelineHash: previewMatchTimelineHash,
        finalCompositeConfigHash: previewMatchFinalCompositeConfigHash,
        output: previewMatchCompositionPayload.output,
        payload: previewMatchCompositionPayload,
      });
    } catch {
      // mutation onError owns the user-facing toast
    }
  }, [
    canonicalReviewId,
    createPreviewMatchFinalCompositeCaptureMutation,
    effectiveHyperframesProductId,
    effectiveHyperframesRunId,
    locale,
    previewMatchCaptureDisabledReason,
    previewMatchCaptureQuality,
    previewMatchCompositionHash,
    previewMatchCompositionPayload,
    previewMatchFinalCompositeConfigHash,
    previewMatchTimelineHash,
  ]);

  const cancelPreviewMatchFinalCompositeCapture = useCallback(async () => {
    const captureJobId = previewMatchCaptureProjection?.captureJobId;
    if (!captureJobId) return;
    try {
      await cancelPreviewMatchFinalCompositeCaptureMutation.mutateAsync({
        captureJobId,
        productId: effectiveHyperframesProductId,
        runId: effectiveHyperframesRunId,
      });
    } catch {
      // mutation onError owns the user-facing toast
    }
  }, [
    cancelPreviewMatchFinalCompositeCaptureMutation,
    effectiveHyperframesProductId,
    effectiveHyperframesRunId,
    previewMatchCaptureProjection?.captureJobId,
  ]);

  const inferredRenderAspectRatio = useMemo(
    () => inferStoryboardRenderAspectRatio(selectedRenderClips),
    [selectedRenderClips],
  );
  const effectiveRenderAspectRatio = renderAspectRatioMode === "auto"
    ? inferredRenderAspectRatio.mode
    : renderAspectRatioMode;
  const renderOutputLabel = selectedRenderClips.length > 0
    ? formatStoryboardRenderOutputLabel(effectiveRenderAspectRatio)
    : null;
  const renderAspectRatioSourceLabel = selectedRenderClips.length > 0
    ? renderAspectRatioMode === "auto"
      ? t("mediaStudio.storyboardReviewAspectAutoSource", {
        vertical: inferredRenderAspectRatio.verticalCount,
        horizontal: inferredRenderAspectRatio.horizontalCount,
      })
      : t("mediaStudio.storyboardReviewAspectManualSource")
    : null;

  const selectedRenderProject = useMemo(() => {
    if (!draft || selectedRenderClips.length === 0) return null;
    const reviewTasks = storyboardDraftToReviewTasks(draft);
    const articleAudioStrategy = getArticleStoryboardDraftAudioStrategy(reviewTasks);
    const renderTrackPlan = articleAudioStrategy
      ? buildArticleStoryboardRenderTrackPlan({
          audioStrategy: articleAudioStrategy,
          hasSeparateVoiceoverAsset: draft.companionAudio.length > 0,
          hasOverlay: true,
          hasStaticSlideFallback: reviewTasks.some((task) => Boolean(
            getArticleStoryboardReviewMetadata(task.generationExtraParams)?.staticSlideFallbackUrl,
          )),
        })
      : null;
    const companionAudioForRender = renderTrackPlan?.voiceover.attachExternalAudio === false
      ? []
      : draft.companionAudio;
    return buildStoryboardVideoProject(
      selectedRenderClips,
      {
        projectName: sanitizeProjectName(`Storyboard Edit ${new Date().toLocaleString()}`),
        companionAudio: companionAudioForRender,
        muteVideoClipAudio: renderTrackPlan
          ? renderTrackPlan.video.muteEmbeddedAudio
          : draft.companionAudio.length > 0 || reviewTasks.some((task) => /External audio workflow/i.test(task.prompt)),
        outputAspectRatio: effectiveRenderAspectRatio,
      },
    );
  }, [draft, effectiveRenderAspectRatio, selectedRenderClips]);

  const buildPreparedSelectedProject = useCallback(async () => {
    if (!draft || selectedRenderClips.length === 0) return null;

    const preparedClips: StoryboardClipCandidate[] = [];
    const clipUrlUpdates = new Map<string, string>();
    for (const clip of selectedRenderClips) {
      const mediaType = clip.mediaType ?? (isProbablyImageUrl(clip.url) ? "image" : "video");
      const storedUrl = await importStoryboardAssetForRender(clip.url, mediaType === "image" ? "image" : "video");
      preparedClips.push({ ...clip, url: storedUrl });
      if (storedUrl !== clip.url) {
        clipUrlUpdates.set(clip.id, storedUrl);
      }
    }

    const preparedAudio: StoryboardCompanionAudioCandidate[] = [];
    const audioUrlUpdates = new Map<string, string>();
    for (const audio of draft.companionAudio) {
      const storedUrl = await importStoryboardAssetForRender(audio.url, "audio");
      preparedAudio.push({ ...audio, url: storedUrl });
      if (storedUrl !== audio.url) {
        audioUrlUpdates.set(audio.id, storedUrl);
      }
    }

    if (clipUrlUpdates.size > 0 || audioUrlUpdates.size > 0) {
      const now = Date.now();
      await persistDraftUpdate((current) => ({
        ...current,
        updatedAt: now,
        projectLink: null,
        renderJobId: null,
        tasks: current.tasks.map((task) => {
          const nextUrl = clipUrlUpdates.get(task.id);
          return nextUrl ? { ...task, url: nextUrl, updatedAt: now } : task;
        }),
        companionAudio: current.companionAudio.map((audio) => {
          const nextUrl = audioUrlUpdates.get(audio.id);
          return nextUrl ? { ...audio, url: nextUrl, updatedAt: now } : audio;
        }),
        companionAudioUpdatedAt: audioUrlUpdates.size > 0 ? now : current.companionAudioUpdatedAt,
      }));
    }

    const reviewTasks = storyboardDraftToReviewTasks(draft);
    const articleAudioStrategy = getArticleStoryboardDraftAudioStrategy(reviewTasks);
    const renderTrackPlan = articleAudioStrategy
      ? buildArticleStoryboardRenderTrackPlan({
          audioStrategy: articleAudioStrategy,
          hasSeparateVoiceoverAsset: preparedAudio.length > 0,
          hasOverlay: true,
          hasStaticSlideFallback: reviewTasks.some((task) => Boolean(
            getArticleStoryboardReviewMetadata(task.generationExtraParams)?.staticSlideFallbackUrl,
          )),
        })
      : null;
    const companionAudioForRender = renderTrackPlan?.voiceover.attachExternalAudio === false
      ? []
      : preparedAudio;
    return buildStoryboardVideoProject(
      preparedClips,
      {
        projectName: sanitizeProjectName(`Storyboard Edit ${new Date().toLocaleString()}`),
        companionAudio: companionAudioForRender,
        muteVideoClipAudio: renderTrackPlan
          ? renderTrackPlan.video.muteEmbeddedAudio
          : preparedAudio.length > 0 || reviewTasks.some((task) => /External audio workflow/i.test(task.prompt)),
        outputAspectRatio: effectiveRenderAspectRatio,
      },
    );
  }, [draft, effectiveRenderAspectRatio, importStoryboardAssetForRender, persistDraftUpdate, selectedRenderClips]);

  const createProject = useCallback(async () => {
    if (!draft || selectedRenderClips.length === 0) {
      toast.error(t("mediaStudio.storyboardReviewSelectCompletedProject"));
      return;
    }
    setIsCreatingProject(true);
    setAndSaveDraft((current) => ({ ...current, compoundStatus: locale === "th" ? "กำลังเตรียมไฟล์สื่อก่อนบันทึกโปรเจกต์..." : "Preparing media assets before saving project..." }));
    try {
      const project = await buildPreparedSelectedProject();
      if (!project) {
        toast.error(t("mediaStudio.storyboardReviewSelectCompletedProject"));
        return;
      }
      const clipCount = project.timeline.tracks.reduce((sum, track) => sum + track.clips.length, 0);
      const result = await saveProjectMutation.mutateAsync({
        name: project.name,
        projectData: project,
        duration: project.settings.duration,
        resolution: `${project.settings.width}x${project.settings.height}`,
        trackCount: project.timeline.tracks.length,
        clipCount,
      });
      const link = `/video-editor?projectId=${result.id}`;
      setAndSaveDraft((current) => ({ ...current, projectLink: link, compoundStatus: t("mediaStudio.storyboardReviewProjectSaved") }));
      toast.success(t("mediaStudio.storyboardReviewProjectCreated"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("mediaStudio.storyboardReviewCreateProjectFailed"));
      setAndSaveDraft((current) => ({ ...current, compoundStatus: null }));
    } finally {
      setIsCreatingProject(false);
    }
  }, [buildPreparedSelectedProject, draft, locale, saveProjectMutation, selectedRenderClips.length, setAndSaveDraft, t]);

  const planScenePrompts = useCallback(async (options: StoryboardPromptPlannerOptions, targetTaskId?: string) => {
    if (!draft) return;
    const reviewTasks = storyboardDraftToReviewTasks(draft);
    const selectedIds = draft.selectedTaskIds.length > 0 ? new Set(draft.selectedTaskIds) : new Set(draft.taskIds);
    const orderedDraftTasks = draft.taskIds
      .map((taskId) => draft.tasks.find((task) => task.id === taskId))
      .filter((task): task is StoryboardGenerationTask => Boolean(task));
    const draftTaskById = new Map(orderedDraftTasks.map((task) => [task.id, task]));
    const targetTask = targetTaskId
      ? orderedDraftTasks.find((task) => task.id === targetTaskId) ?? null
      : null;
    const selectedDraftTasks = orderedDraftTasks.filter((task) =>
      targetTaskId ? task.id === targetTaskId : selectedIds.has(task.id)
    );
    const segmentPlan = draft.videoSegmentState?.videoSegmentPlan ?? null;
    const selectedSegmentIds = new Set(
      selectedDraftTasks.map(getStoryboardTaskVideoSegmentId).filter(Boolean)
    );
    const shouldPlanBySegment = Boolean(segmentPlan && selectedSegmentIds.size > 0);

    const slotTaskIdsBySlotId = new Map<string, string[]>();
    const slotAnchorTaskBySlotId = new Map<string, StoryboardGenerationTask>();
    const slots = shouldPlanBySegment && segmentPlan
      ? segmentPlan.segments
          .filter((segment) => selectedSegmentIds.has(segment.segmentId))
          .map((segment) => {
            const segmentTasks = orderedDraftTasks.filter((task, index) =>
              storyboardTaskBelongsToSegment(task, segment, index)
            );
            const targetSegmentTasks = targetTaskId
              ? segmentTasks.filter((task) => task.id === targetTaskId)
              : segmentTasks;
            if (targetTaskId && targetSegmentTasks.length === 0) return null;
            const anchorTask = targetSegmentTasks[0] ?? segmentTasks[0];
            if (!anchorTask) return null;
            const anchorRefs = anchorTask.storyboardContext?.referenceImages
              ?.map((image) => String(image?.url ?? "").trim())
              .filter(Boolean) ?? [];
            const segmentRefs = segment.referenceImageUrls
              .map((url) => String(url || "").trim())
              .filter(Boolean);
            const refs = targetTaskId && anchorRefs.length > 0
              ? anchorRefs
              : segmentRefs.length > 0 ? segmentRefs : anchorRefs;
            const startFrameUrl = refs[0] ?? "";
            const endFrameUrl = refs[refs.length - 1] ?? refs[0] ?? "";
            if (!startFrameUrl || !endFrameUrl) return null;
            slotTaskIdsBySlotId.set(segment.segmentId, targetSegmentTasks.map((task) => task.id));
            slotAnchorTaskBySlotId.set(segment.segmentId, anchorTask);
            return {
              id: segment.segmentId,
              index: segment.index,
              currentPrompt: targetTaskId ? anchorTask.prompt : buildSegmentPromptPlanningCurrentPrompt(segment),
              startFrameUrl,
              endFrameUrl,
              frameRoles: segment.referenceMode === "single_storyboard_frame"
                ? ["reference", "reference"] as StoryboardReferenceFrameRole[]
                : ["start", "stop"] as StoryboardReferenceFrameRole[],
              conceptDetails: undefined,
              storyboardGuide: undefined,
              aspectRatio: anchorTask.storyboardContext?.aspectRatio ?? undefined,
              durationSeconds: targetTaskId
                ? anchorTask.storyboardContext?.duration ?? segment.durationSeconds
                : segment.durationSeconds,
              model: segmentPlan.videoModelId,
              voiceoverFullScript: undefined,
            };
          })
          .filter((slot): slot is NonNullable<typeof slot> => Boolean(slot))
      : reviewTasks
          .filter((task) => {
            const refs = task.referenceUrls?.map((url) => String(url || "").trim()).filter(Boolean) ?? [];
            return (targetTaskId ? task.id === targetTaskId : selectedIds.has(task.id)) && refs.length >= 2 && task.canRegenerate !== false;
          })
          .map((task) => {
            slotTaskIdsBySlotId.set(task.id, [task.id]);
            const sourceTask = draftTaskById.get(task.id);
            if (sourceTask) slotAnchorTaskBySlotId.set(task.id, sourceTask);
            return {
              id: task.id,
              index: task.index,
              currentPrompt: task.prompt,
              startFrameUrl: task.referenceUrls?.[0] || "",
              endFrameUrl: task.referenceUrls?.[1] || "",
              frameRoles: sourceTask ? [...getTaskReferenceFrameRoles(sourceTask)] : ["start", "stop"] as StoryboardReferenceFrameRole[],
              conceptDetails: undefined,
              storyboardGuide: undefined,
              aspectRatio: task.generationAspectRatio,
              durationSeconds: task.durationSeconds,
              model: task.generationModelId || task.model,
              voiceoverFullScript: undefined,
            };
          });
    if (slots.length === 0) {
      toast.error(t("mediaStudio.storyboardReviewClipContextMissing"));
      return;
    }

    const slotAnchorTasks = Array.from(slotAnchorTaskBySlotId.values());
    const productMetadata = draft.marketplaceContext
      ?? slotAnchorTasks.find((task) => task.marketplaceProduct)?.marketplaceProduct
      ?? slotAnchorTasks
        .map((task) => task.storyboardContext?.extraParams?.marketplaceContext)
        .find((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
      ?? null;

    const planningStatus = shouldPlanBySegment
      ? locale === "th" ? "กำลังให้ skill สร้าง prompt ตาม segment plan..." : "Planning prompts from the segment plan..."
      : locale === "th" ? "กำลังสร้าง prompt ทุกฉาก..." : "Planning prompts for every scene...";
    const plannedStatusLabel = shouldPlanBySegment
      ? locale === "th" ? "สร้าง prompt ตาม segment แล้ว" : "Segment prompts planned"
      : locale === "th" ? "สร้าง prompt ทุกฉากแล้ว" : "Scene prompts planned";
    const shouldIncludeVoiceover = options.speechMode !== "none";

    setAndSaveDraft((current) => ({
      ...current,
      compoundStatus: planningStatus,
    }));

    try {
      const draftTaskPositionById = new Map(orderedDraftTasks.map((task, index) => [task.id, index]));
      const firstTaskProductionContext = orderedDraftTasks
        .map((task) => getTaskEmbeddedProductionContext(task))
        .find((context): context is StoryboardProductionContext => Boolean(context)) ?? null;
      const effectiveProductionContext = normalizeReviewProductionContext(draft.productionContext)
        ?? (targetTask ? getTaskEmbeddedProductionContext(targetTask) : null)
        ?? firstTaskProductionContext;
      const firstTaskConceptDetails = orderedDraftTasks
        .map((task) => {
          const productionContext = getTaskEmbeddedProductionContext(task);
          return firstStoryboardText(
            task.storyboardContext?.extraParams?.productionConceptDetails,
            task.storyboardContext?.extraParams?.creativePresetDirective,
            productionContext?.productionStoryConceptDetails,
            productionContext?.videoConcept,
          );
        })
        .find(Boolean) ?? "";
      const firstTaskStoryboardGuide = orderedDraftTasks
        .map((task) => firstStoryboardText(
          task.storyboardContext?.extraParams?.storyboardGuide,
          getTaskEmbeddedProductionContext(task)?.storyboardGuide,
        ))
        .find(Boolean) ?? "";
      const targetVoiceContext = targetTaskId
        ? getStoryboardPlannerVoiceContext(targetTask)
        : null;
      const existingVoiceoverFullScript = targetVoiceContext?.voiceoverFullScript
        || orderedDraftTasks
          .map((task) => getStoryboardPlannerVoiceContext(task).voiceoverScript)
          .filter(Boolean)
          .join("\n");
      const editedVoiceoverFullScript = firstStoryboardText(draft.voiceoverFullScript);
      const useVoiceoverScriptAsConcept = Boolean(draft.useVoiceoverScriptAsConcept && editedVoiceoverFullScript);
      const voiceoverFullScript = useVoiceoverScriptAsConcept
        ? editedVoiceoverFullScript
        : firstStoryboardText(
          editedVoiceoverFullScript,
          effectiveProductionContext?.voiceoverFullScript,
          existingVoiceoverFullScript,
        );
      const effectiveConceptDetails = useVoiceoverScriptAsConcept
        ? editedVoiceoverFullScript
        : firstStoryboardText(
          draft.conceptDetails,
          effectiveProductionContext?.productionStoryConceptDetails,
          effectiveProductionContext?.videoConcept,
          firstTaskConceptDetails,
        );
      const effectiveStoryboardGuide = firstStoryboardText(
        draft.storyboardGuide,
        effectiveProductionContext?.storyboardGuide,
        firstTaskStoryboardGuide,
      );
      const result = await planStoryboardVideoPromptsMutation.mutateAsync({
        productMetadata: productMetadata as Record<string, unknown> | null,
        includeVoiceover: shouldIncludeVoiceover,
        speechMode: options.speechMode,
        speechLanguage: options.speechLanguage,
        includeSound: options.includeSound,
        tone: options.tone,
        language: options.language,
        conceptDetails: effectiveConceptDetails || undefined,
        storyboardGuide: effectiveStoryboardGuide || undefined,
        voiceoverFullScript: voiceoverFullScript || undefined,
        useVoiceoverScriptAsConcept,
        slots: slots.map((slot) => {
          const sourceTask = slotAnchorTaskBySlotId.get(slot.id);
          const sourceTaskPosition = sourceTask ? draftTaskPositionById.get(sourceTask.id) : undefined;
          const previousTask = typeof sourceTaskPosition === "number" ? orderedDraftTasks[sourceTaskPosition - 1] : undefined;
          const nextTask = typeof sourceTaskPosition === "number" ? orderedDraftTasks[sourceTaskPosition + 1] : undefined;
          const previousVoiceContext = getStoryboardPlannerVoiceContext(previousTask);
          const nextVoiceContext = getStoryboardPlannerVoiceContext(nextTask);
          return {
            id: slot.id,
            index: slot.index,
            currentPrompt: compactStoryboardPromptPlannerContext(slot.currentPrompt),
            startFrameUrl: slot.startFrameUrl,
            endFrameUrl: slot.endFrameUrl,
            frameRoles: slot.frameRoles,
            conceptDetails: effectiveConceptDetails || undefined,
            storyboardGuide: effectiveStoryboardGuide || undefined,
            aspectRatio: slot.aspectRatio,
            durationSeconds: slot.durationSeconds,
            model: slot.model,
            voiceoverFullScript: voiceoverFullScript || undefined,
            ...(targetTaskId ? {
              previousVoiceoverScript: compactStoryboardPromptPlannerContext(
                previousVoiceContext.voiceoverScript,
                STORYBOARD_REVIEW_VOICEOVER_CONTINUITY_CONTEXT_MAX_CHARS,
              ),
              nextVoiceoverScript: compactStoryboardPromptPlannerContext(
                nextVoiceContext.voiceoverScript,
                STORYBOARD_REVIEW_VOICEOVER_CONTINUITY_CONTEXT_MAX_CHARS,
              ),
              previousJourneyStage: previousVoiceContext.journeyStage || undefined,
              nextJourneyStage: nextVoiceContext.journeyStage || undefined,
              previousPrompt: compactStoryboardPromptPlannerContext(previousTask?.prompt),
              nextPrompt: compactStoryboardPromptPlannerContext(nextTask?.prompt),
            } : {}),
          };
        }),
      });
      const plannedById = new Map(result.slots.map((slot) => [slot.id, slot]));
      const nextStatus = `${plannedStatusLabel} ${result.slots.length}/${slots.length}`;
      const plannedVoiceoverFullScript = firstStoryboardText(result.voiceoverFullScript, voiceoverFullScript);
      const resolvedVoiceoverByTaskId = new Map<string, string>();
      if (shouldIncludeVoiceover) {
        for (const slot of slots) {
          const planned = plannedById.get(slot.id);
          if (!planned) continue;
          const resolvedVoiceoverScript = firstStoryboardText(
            planned.voiceoverScript,
            extractStoryboardNativeSpeechText(planned.videoPrompt),
          );
          for (const taskId of slotTaskIdsBySlotId.get(slot.id) ?? [slot.id]) {
            resolvedVoiceoverByTaskId.set(taskId, resolvedVoiceoverScript);
          }
        }
        const missingVoiceoverTaskIds = slots
          .filter((slot) => plannedById.has(slot.id) && !(slotTaskIdsBySlotId.get(slot.id) ?? [slot.id]).some((taskId) => resolvedVoiceoverByTaskId.get(taskId)))
          .map((slot) => slot.id);
        if (missingVoiceoverTaskIds.length > 0) {
          throw new Error(
            locale === "th"
              ? `สร้าง prompt ไม่ครบ: เปิดโหมดบทพูดอยู่ แต่ไม่มีบทพูดสำหรับ segment ${missingVoiceoverTaskIds.join(", ")}`
              : `Prompt planning incomplete: speech mode is enabled but no dialogue was resolved for segment(s) ${missingVoiceoverTaskIds.join(", ")}.`,
          );
        }
      }
      const plannedPromptByTaskId = new Map<string, string>();
      for (const slot of slots) {
        const planned = plannedById.get(slot.id);
        if (!planned) continue;
        const prompt = (planned.videoPrompt || slot.currentPrompt).trim();
        if (prompt.length > STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS) {
          throw new Error(
            locale === "th"
              ? `สร้าง prompt ไม่สำเร็จ: prompt ของ segment ${slot.id} ยังยาว ${prompt.length.toLocaleString("th-TH")} ตัวอักษร เกิน ${STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS.toLocaleString("th-TH")} ตัวอักษรหลัง optimize`
              : `Prompt planning failed: segment ${slot.id} is still ${prompt.length.toLocaleString("en-US")} chars after optimization, above the ${STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS.toLocaleString("en-US")} char limit.`,
          );
        }
        if (shouldIncludeVoiceover && !extractStoryboardNativeSpeechText(prompt)) {
          throw new Error(
            locale === "th"
              ? `สร้าง prompt ไม่ครบ: prompt ของ segment ${slot.id} ยังไม่มีบทพูดจาก skill`
              : `Prompt planning incomplete: segment ${slot.id} prompt still has no skill dialogue.`,
          );
        }
        for (const taskId of slotTaskIdsBySlotId.get(slot.id) ?? [slot.id]) {
          plannedPromptByTaskId.set(taskId, prompt);
        }
      }
      const plannedSlotIdByTaskId = new Map<string, string>();
      for (const [slotId, taskIds] of slotTaskIdsBySlotId) {
        for (const taskId of taskIds) plannedSlotIdByTaskId.set(taskId, slotId);
      }
      setAndSaveDraft((current) => ({
        ...current,
        updatedAt: Date.now(),
        compoundStatus: nextStatus,
        tasks: current.tasks.map((task) => {
          const slotId = plannedSlotIdByTaskId.get(task.id) ?? task.id;
          const planned = plannedById.get(slotId);
          const prompt = plannedPromptByTaskId.get(task.id);
          if (!planned || !prompt) return task;
          const taskProductionContext = getTaskEmbeddedProductionContext(task) ?? effectiveProductionContext;
          const productionExtraParams = buildReviewProductionExtraParams(taskProductionContext);
          const nextExtraParams = updateArticleStoryboardCurrentPromptMetadata(
            {
              ...(task.storyboardContext?.extraParams ?? {}),
              ...(effectiveConceptDetails ? { productionConceptDetails: effectiveConceptDetails } : {}),
              ...(effectiveStoryboardGuide ? { storyboardGuide: effectiveStoryboardGuide } : {}),
              ...(plannedVoiceoverFullScript ? { voiceoverFullScript: plannedVoiceoverFullScript } : {}),
              ...productionExtraParams,
              promptSource: "skill_generated",
              videoSegmentPrompt: prompt,
              videoSegmentPromptStale: false,
              videoSegmentPromptGeneratedAt: new Date().toISOString(),
              storyboardPromptPlanner: {
                ...(task.storyboardContext?.extraParams?.storyboardPromptPlanner ?? {}),
                skillId: "storyboard-video-customer-journey-prompt",
                journeyStage: planned.journeyStage,
                voiceoverScript: resolvedVoiceoverByTaskId.get(task.id) ?? planned.voiceoverScript,
                speechMode: options.speechMode,
                speechLanguage: options.speechLanguage,
                soundBrief: planned.soundBrief,
                qualityNotes: planned.qualityNotes,
                globalVideoStrategy: result.globalVideoStrategy,
                voiceoverFullScript: plannedVoiceoverFullScript,
                soundFullBrief: result.soundFullBrief,
                ...(taskProductionContext ? { productionContext: taskProductionContext } : {}),
              },
            },
            prompt,
            "skill_generated",
          );
          return {
            ...task,
            prompt,
            error: undefined,
            statusDetail: planned.journeyStage
              ? `Prompt planned: ${planned.journeyStage}`
              : plannedStatusLabel,
            updatedAt: Date.now(),
            productionContext: task.productionContext ?? taskProductionContext,
            storyboardContext: task.storyboardContext
              ? {
                  ...task.storyboardContext,
                  productionContext: task.storyboardContext.productionContext ?? taskProductionContext,
                  extraParams: nextExtraParams,
                }
              : task.storyboardContext,
          };
        }),
        videoSegmentState: current.videoSegmentState
          ? {
              ...current.videoSegmentState,
              promptSource: "regenerated",
              lastPromptGeneratedAt: new Date().toISOString(),
              staleTaskIds: (current.videoSegmentState.staleTaskIds ?? []).filter(
                (taskId) => !plannedPromptByTaskId.has(taskId),
              ),
              staleReason: (current.videoSegmentState.staleTaskIds ?? []).some(
                (taskId) => !plannedPromptByTaskId.has(taskId),
              )
                ? current.videoSegmentState.staleReason ?? null
                : null,
            }
          : current.videoSegmentState,
        productionContext: current.productionContext ?? effectiveProductionContext ?? null,
        conceptDetails: current.conceptDetails ?? (!useVoiceoverScriptAsConcept && effectiveConceptDetails ? effectiveConceptDetails : null),
        storyboardGuide: current.storyboardGuide ?? (effectiveStoryboardGuide || null),
        voiceoverFullScript: useVoiceoverScriptAsConcept
          ? (current.voiceoverFullScript ?? null)
          : (plannedVoiceoverFullScript || current.voiceoverFullScript || null),
      }));
      toast.success(nextStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("mediaStudio.storyboardReviewRegenerateFailed");
      setAndSaveDraft((current) => ({ ...current, compoundStatus: null }));
      toast.error(message);
    }
  }, [draft, locale, planStoryboardVideoPromptsMutation, setAndSaveDraft, t]);

  const updateTaskPrompt = useCallback((taskId: string, prompt: string) => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) return;
    setAndSaveDraft((current) => ({
      ...current,
      updatedAt: Date.now(),
      tasks: current.tasks.map((task) => task.id === taskId
        ? (() => {
            const nextExtraParams = task.storyboardContext?.extraParams
              ? updateArticleStoryboardCurrentPromptMetadata(task.storyboardContext.extraParams, normalizedPrompt)
              : null;
            return {
              ...task,
              prompt: normalizedPrompt,
              status: task.status === "completed" ? "queued" : task.status,
              url: task.status === "completed" ? undefined : task.url,
              error: undefined,
              backendTaskId: undefined,
              providerTaskId: undefined,
              statusDetail: locale === "th" ? "แก้ไข prompt แล้ว" : "Prompt edited",
              updatedAt: Date.now(),
              storyboardContext: task.storyboardContext && nextExtraParams
                ? {
                    ...task.storyboardContext,
                    extraParams: nextExtraParams,
                  }
                : task.storyboardContext,
            };
          })()
        : task),
      compoundStatus: null,
    }));
  }, [locale, setAndSaveDraft]);

  const updateTaskDuration = useCallback((taskId: string, durationSeconds: number) => {
    const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds
      : DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS;
    setAndSaveDraft((current) => ({
      ...current,
      updatedAt: Date.now(),
      tasks: current.tasks.map((task) => {
        if (task.id !== taskId) return task;
        const nextExtraParams: Record<string, any> = {
          ...(task.storyboardContext?.extraParams ?? {}),
          storyboardShotDurationSeconds: safeDuration,
        };
        if (nextExtraParams.storyboardPromptPlanner && typeof nextExtraParams.storyboardPromptPlanner === "object") {
          nextExtraParams.storyboardPromptPlanner = {
            ...(nextExtraParams.storyboardPromptPlanner as Record<string, unknown>),
            shotDurationSeconds: safeDuration,
          };
        }
        const nextPrompt = applyStoryboardPromptDuration(task.prompt, safeDuration);
        const nextArticlePromptExtraParams = updateArticleStoryboardCurrentPromptMetadata(
          nextExtraParams,
          nextPrompt,
          "duration_adjusted",
        );
        return {
          ...task,
          prompt: nextPrompt,
          durationSeconds: safeDuration,
          status: task.status === "generating" ? task.status : "queued",
          url: task.status === "generating" ? task.url : undefined,
          error: undefined,
          backendTaskId: task.status === "generating" ? task.backendTaskId : undefined,
          providerTaskId: task.status === "generating" ? task.providerTaskId : undefined,
          statusDetail: task.status === "generating"
            ? task.statusDetail
            : (locale === "th" ? "ปรับความยาวแล้ว กรุณาสร้างคลิปใหม่" : "Duration changed. Regenerate this clip."),
          updatedAt: Date.now(),
          storyboardContext: task.storyboardContext
            ? {
                ...task.storyboardContext,
                duration: safeDuration,
                extraParams: nextArticlePromptExtraParams,
              }
            : task.storyboardContext,
        };
      }),
      compoundStatus: locale === "th" ? `ปรับความยาว shot เป็น ${safeDuration} วินาทีแล้ว` : `Shot duration set to ${safeDuration}s.`,
      projectLink: null,
      renderJobId: null,
    }));
  }, [locale, setAndSaveDraft]);

  const updateTaskSourceTrim = useCallback((taskId: string, trim: StoryboardSourceTrimRange | null) => {
    setAndSaveDraft((current) => ({
      ...current,
      updatedAt: Date.now(),
      tasks: current.tasks.map((task) => {
        if (task.id !== taskId) return task;
        const fallbackDuration = resolveHyperframesSourceClipDurationSeconds(
          task,
          task.durationSeconds ?? DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS,
        ) ?? DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS;
        const normalizedTrim = trim
          ? normalizeStoryboardSourceTrimForTask(trim, fallbackDuration)
          : null;
        const nextExtraParams: Record<string, any> = {
          ...(task.storyboardContext?.extraParams ?? {}),
        };
        delete nextExtraParams.sourceTrimDerived;
        if (normalizedTrim) {
          nextExtraParams.sourceTrim = {
            ...normalizedTrim,
            disabledRanges: normalizedTrim.disabledRanges ?? [],
          };
          if (!task.storyboardContext) {
            nextExtraParams.importedMediaContextOnly = true;
          }
        } else {
          delete nextExtraParams.sourceTrim;
        }
        return {
          ...task,
          updatedAt: Date.now(),
          storyboardContext: task.storyboardContext
            ? {
                ...task.storyboardContext,
                extraParams: nextExtraParams,
              }
            : normalizedTrim
              ? {
                  aspectRatio: task.aspectRatio ?? "9:16",
                  duration: task.durationSeconds,
                  model: task.model,
                  referenceImages: [],
                  referenceVideos: [],
                  extraParams: nextExtraParams,
                }
              : task.storyboardContext,
        };
      }),
      compoundStatus: trim
        ? (locale === "th" ? "บันทึกช่วงวิดีโอของ shot แล้ว" : "Shot source trim saved.")
        : (locale === "th" ? "ล้างช่วงตัดวิดีโอของ shot แล้ว" : "Shot source trim cleared."),
      projectLink: null,
      renderJobId: null,
    }));
  }, [locale, setAndSaveDraft]);

  const updateConceptDetails = useCallback((value: string) => {
    setAndSaveDraft((current) => ({
      ...current,
      updatedAt: Date.now(),
      conceptDetails: value,
    }));
  }, [setAndSaveDraft]);

  const updateStoryboardGuide = useCallback((value: string) => {
    setAndSaveDraft((current) => ({
      ...current,
      updatedAt: Date.now(),
      storyboardGuide: value,
    }));
  }, [setAndSaveDraft]);

  const updateVoiceoverFullScript = useCallback((value: string) => {
    const nextValue = value.trim();
    setAndSaveDraft((current) => ({
      ...current,
      updatedAt: Date.now(),
      voiceoverFullScript: nextValue || null,
      useVoiceoverScriptAsConcept: nextValue ? true : false,
    }));
  }, [setAndSaveDraft]);

  const startEditingVoiceoverSummary = useCallback(() => {
    setVoiceoverSummaryDraft(storyboardVoiceoverSummaryText);
    setIsEditingVoiceoverSummary(true);
  }, [storyboardVoiceoverSummaryText]);

  const cancelEditingVoiceoverSummary = useCallback(() => {
    setVoiceoverSummaryDraft(storyboardVoiceoverSummaryText);
    setIsEditingVoiceoverSummary(false);
  }, [storyboardVoiceoverSummaryText]);

  const saveVoiceoverSummaryDraft = useCallback(() => {
    updateVoiceoverFullScript(voiceoverSummaryDraft);
    setIsEditingVoiceoverSummary(false);
  }, [updateVoiceoverFullScript, voiceoverSummaryDraft]);

  const updateUseVoiceoverScriptAsConcept = useCallback((value: boolean) => {
    setAndSaveDraft((current) => ({
      ...current,
      updatedAt: Date.now(),
      voiceoverFullScript: value ? (String(current.voiceoverFullScript ?? "").trim() || getStoryboardDraftVoiceoverFullScript(current) || null) : current.voiceoverFullScript,
      useVoiceoverScriptAsConcept: Boolean(value && (String(current.voiceoverFullScript ?? "").trim() || getStoryboardDraftVoiceoverFullScript(current))),
    }));
  }, [setAndSaveDraft]);

  const updateReferenceFrameRole = useCallback((taskId: string, frameIndex: 0 | 1, role: StoryboardReferenceFrameRole) => {
    setAndSaveDraft((current) => ({
      ...current,
      updatedAt: Date.now(),
      tasks: current.tasks.map((task) => {
        if (task.id !== taskId || !task.storyboardContext) return task;
        const roles = getTaskReferenceFrameRoles(task);
        roles[frameIndex] = role;
        const generationType = generationTypeForFrameRoles(roles);
        return {
          ...task,
          status: task.status === "completed" ? "queued" : task.status,
          url: task.status === "completed" ? undefined : task.url,
          backendTaskId: undefined,
          providerTaskId: undefined,
          error: undefined,
          statusDetail: locale === "th" ? "อัปเดตบทบาทภาพแนบแล้ว" : "Reference frame role updated",
          updatedAt: Date.now(),
          storyboardContext: {
            ...task.storyboardContext,
            extraParams: {
              ...(task.storyboardContext.extraParams ?? {}),
              generationType,
              referenceFrameRoles: roles,
            },
          },
        };
      }),
    }));
  }, [locale, setAndSaveDraft]);

  const autoCompound = useCallback(async () => {
    if (!draft || selectedRenderClips.length === 0) {
      toast.error(t("mediaStudio.storyboardReviewSelectCompletedRender"));
      return;
    }
    setIsCompounding(true);
    setAndSaveDraft((current) => ({ ...current, compoundStatus: locale === "th" ? "กำลังเตรียมไฟล์สื่อก่อน render..." : "Preparing media assets before render..." }));
    try {
      const project = await buildPreparedSelectedProject();
      if (!project) {
        toast.error(t("mediaStudio.storyboardReviewSelectCompletedRender"));
        return;
      }
      const clipCount = project.timeline.tracks.reduce((sum, track) => sum + track.clips.length, 0);
      const saved = await saveProjectMutation.mutateAsync({
        name: project.name,
        projectData: project,
        duration: project.settings.duration,
        resolution: `${project.settings.width}x${project.settings.height}`,
        trackCount: project.timeline.tracks.length,
        clipCount,
      });
      const link = `/video-editor?projectId=${saved.id}`;
      const outputPath = `/tmp/storyboard-compound-${saved.id}.mp4`;
      const renderTitle = draft ? `${getStoryboardReviewName(draft)} - Final video` : undefined;
      const renderMetadata = buildRenderTraceabilityMetadata({
        sourceFlow: "storyboard_review_page_compound_render",
        sourceSurface: "storyboard_review_page",
        title: draft ? getStoryboardReviewName(draft) : null,
        reviewId: draft?.reviewId ?? canonicalReviewId ?? null,
        videoEditorProjectId: saved.id,
        clipCount: draft?.tasks.length ?? clipCount,
        selectedClipCount: selectedRenderClips.length,
        productionContext: resolveStoryboardDraftProductionContext(draft),
        marketplaceProduct: resolveStoryboardDraftMarketplaceProduct(draft),
      });
      const jobId = await videoEditorRenderService.startRender(JSON.stringify(project), outputPath, {
        sourceMetadata: renderMetadata,
      });
      renderLibraryMetadataRef.current[jobId] = { title: renderTitle, metadata: renderMetadata };
      setRenderJobId(jobId);
      setAndSaveDraft((current) => ({ ...current, projectLink: link, renderJobId: jobId, compoundStatus: t("mediaStudio.storyboardReviewRenderStartedStatus") }));
      toast.success(t("mediaStudio.storyboardReviewRenderStarted"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("mediaStudio.storyboardReviewRenderFailed"));
      setAndSaveDraft((current) => ({ ...current, compoundStatus: null }));
    } finally {
      setIsCompounding(false);
    }
  }, [buildPreparedSelectedProject, canonicalReviewId, draft, locale, saveProjectMutation, selectedRenderClips.length, setAndSaveDraft, t]);

  const pollStoryboardGenerationTask = useCallback(async (
    taskId: string,
    pollId: string,
    options?: { cancelRef?: MutableRefObject<boolean> },
  ): Promise<boolean> => {
    const normalizedPollId = pollId.trim();
    if (!normalizedPollId) return false;

    const activePollId = storyboardGenerationPollersRef.current.get(taskId);
    if (activePollId === normalizedPollId) return true;
    storyboardGenerationPollersRef.current.set(taskId, normalizedPollId);

    try {
      while (isStoryboardReviewMountedRef.current) {
        const latestTask = draftRef.current?.tasks.find((task) => task.id === taskId);
        if (!latestTask || latestTask.status !== "generating" || !storyboardTaskTracksPollId(latestTask, normalizedPollId)) {
          return true;
        }

        if (options?.cancelRef?.current) {
          await cancelMediaTaskMutation.mutateAsync({ taskId: normalizedPollId }).catch(() => undefined);
          setAndSaveDraft((current) => updateTrackedStoryboardGenerationTask(current, taskId, normalizedPollId, {
            status: "queued",
            error: undefined,
            statusDetail: t("mediaStudio.storyboardReviewGenerationCancelled"),
          }));
          return false;
        }

        let currentTask: unknown;
        try {
          currentTask = await trpcUtils.media.getTask.fetch({ taskId: normalizedPollId });
        } catch {
          await sleepMs(STORYBOARD_GENERATION_POLL_RETRY_INTERVAL_MS);
          continue;
        }

        const status = normalizeStoryboardProviderTaskStatus((currentTask as Record<string, unknown> | null)?.status);
        if (status === "completed") {
          const completedUrl = extractStoryboardMediaUrl(currentTask, "video");
          if (!completedUrl) {
            const message = t("mediaStudio.storyboardReviewNoOutputUrl");
            setAndSaveDraft((current) => updateTrackedStoryboardGenerationTask(current, taskId, normalizedPollId, {
              status: "error",
              error: message,
              statusDetail: message,
            }));
            return true;
          }
          setAndSaveDraft((current) => updateTrackedStoryboardGenerationTask(current, taskId, normalizedPollId, {
            status: "completed",
            url: completedUrl,
            error: undefined,
            statusDetail: t("mediaStudio.storyboardReviewCompletedStatus"),
          }));
          toast.success(t("mediaStudio.storyboardReviewClipRegenerated"));
          return true;
        }

        if (status === "failed") {
          const message = extractStoryboardProviderTaskError(currentTask, t("mediaStudio.storyboardReviewVideoGenerationFailed"));
          setAndSaveDraft((current) => updateTrackedStoryboardGenerationTask(current, taskId, normalizedPollId, {
            status: "error",
            error: message,
            statusDetail: message,
          }));
          toast.error(message);
          return true;
        }

        if (status === "cancelled") {
          setAndSaveDraft((current) => updateTrackedStoryboardGenerationTask(current, taskId, normalizedPollId, {
            status: "queued",
            error: undefined,
            statusDetail: t("mediaStudio.storyboardReviewGenerationCancelled"),
          }));
          toast.info(t("mediaStudio.storyboardReviewGenerationCancelled"));
          return false;
        }

        const statusDetail = status === "queued"
          ? t("mediaStudio.storyboardReviewGenerationTaskStarted")
          : t("mediaStudio.generationStatus.providerProcessing");
        setAndSaveDraft((current) => updateTrackedStoryboardGenerationTask(current, taskId, normalizedPollId, {
          status: "generating",
          error: undefined,
          statusDetail,
        }));

        await sleepMs(STORYBOARD_GENERATION_POLL_INTERVAL_MS);
      }
    } finally {
      if (storyboardGenerationPollersRef.current.get(taskId) === normalizedPollId) {
        storyboardGenerationPollersRef.current.delete(taskId);
      }
    }

    return false;
  }, [cancelMediaTaskMutation, setAndSaveDraft, t, trpcUtils.media.getTask]);

  useEffect(() => {
    if (!activeDraft) return;
    for (const task of activeDraft.tasks) {
      if (task.status !== "generating") continue;
      const pollId = getStoryboardTaskPollId(task);
      if (!pollId) continue;
      void pollStoryboardGenerationTask(task.id, pollId);
    }
  }, [activeDraft, pollStoryboardGenerationTask]);

  const startStoryboardGenerationBatch = useCallback(() => {
    generationCancelRequestedRef.current = false;
    activeGenerationTaskIdRef.current = null;
    setIsCancellingGeneration(false);
  }, []);

  const cancelStoryboardGeneration = useCallback(async () => {
    generationCancelRequestedRef.current = true;
    setIsCancellingGeneration(true);
    const activeProviderTaskId = activeGenerationTaskIdRef.current;
    if (regeneratingTaskId) {
      setAndSaveDraft((current) => updateDraftTask(current, regeneratingTaskId, {
        statusDetail: t("mediaStudio.storyboardReviewCancelGenerationRequested"),
      }));
    }
    try {
      if (activeProviderTaskId) {
        await cancelMediaTaskMutation.mutateAsync({ taskId: activeProviderTaskId });
      }
      toast.info(t("mediaStudio.storyboardReviewGenerationCancelRequested"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("mediaStudio.storyboardReviewCancelGenerationFailed"));
    } finally {
      if (!activeProviderTaskId) {
        setIsCancellingGeneration(false);
      }
    }
  }, [cancelMediaTaskMutation, regeneratingTaskId, setAndSaveDraft, t]);

  const requestSplitVideoSegmentToPerShot = useCallback((taskId: string, segmentId: string) => {
    const task = draft?.tasks.find((item) => item.id === taskId);
    const shotIds = Array.isArray(task?.storyboardContext?.extraParams?.videoSegmentShotIds)
      ? task?.storyboardContext?.extraParams?.videoSegmentShotIds
          .map((value: unknown) => typeof value === "string" ? value.trim() : "")
          .filter(Boolean)
      : [];
    setSplitFallbackTarget({
      taskId,
      segmentId,
      shotCount: Math.max(shotIds.length, 2),
      error: task?.error ?? null,
    });
    if (task?.storyboardContext) {
      setAndSaveDraft((current) => splitStoryboardVideoSegmentTaskToPerShotFallback(current, {
        taskId,
        confirmed: false,
      }));
    }
  }, [draft?.tasks, setAndSaveDraft]);

  const confirmSplitVideoSegmentToPerShot = useCallback(() => {
    const target = splitFallbackTarget;
    if (!target) return;
    setAndSaveDraft((current) => splitStoryboardVideoSegmentTaskToPerShotFallback(current, {
      taskId: target.taskId,
      confirmed: true,
    }));
    setSplitFallbackTarget(null);
    toast.success(locale === "th"
      ? "แยก segment เป็น per-shot แล้ว ตรวจ prompt และกดสร้างใหม่ด้วยตัวเองเมื่อพร้อม"
      : "Segment split to per-shot. Review the prompts and generate manually when ready.");
  }, [locale, setAndSaveDraft, splitFallbackTarget]);

  const regenerateVideoSegmentPromptForTask = useCallback(async (taskId: string, segmentId: string) => {
    if (!draft) return;
    const storyboardReviewId = draft.reviewId ?? reviewId ?? null;
    if (!storyboardReviewId) {
      toast.error(locale === "th"
        ? "ต้องบันทึกหรือเปิด Storyboard Review project ก่อน regenerate segment prompt"
        : "Save or open a Storyboard Review project before regenerating a segment prompt.");
      return;
    }
    setRegeneratingVideoSegmentPromptTaskId(taskId);
    try {
      const result = await regenerateVideoSegmentPromptMutation.mutateAsync({
        storyboardReviewId,
        segmentId,
        targetTaskId: taskId,
        creativeBrief: null,
      });
      const resultPrompt = result.prompt.trim();
      if (resultPrompt.length > STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS) {
        throw new Error(locale === "th"
          ? `Regenerate segment prompt ไม่สำเร็จ: prompt ยังยาว ${resultPrompt.length.toLocaleString("th-TH")} ตัวอักษร เกิน ${STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS.toLocaleString("th-TH")} ตัวอักษร`
          : `Segment prompt regeneration failed: prompt is still ${resultPrompt.length.toLocaleString("en-US")} chars, above the ${STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS.toLocaleString("en-US")} char limit.`);
      }
      setAndSaveDraft((current) => applyRegeneratedVideoSegmentPromptToDraft(current, {
        segmentId: result.segmentId,
        prompt: resultPrompt,
        taskIds: result.staleTaskIds.length > 0 ? result.staleTaskIds : [taskId],
        creativeBriefHash: result.creativeBriefHash,
      }));
      toast.success(locale === "th" ? "Regenerate segment prompt แล้ว" : "Segment prompt regenerated.");
      void trpcUtils.videoEditorProjects.getStoryboardReview.invalidate({ id: storyboardReviewId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (locale === "th" ? "Regenerate segment prompt ไม่สำเร็จ" : "Failed to regenerate segment prompt."));
    } finally {
      setRegeneratingVideoSegmentPromptTaskId(null);
    }
  }, [
    draft,
    locale,
    regenerateVideoSegmentPromptMutation,
    reviewId,
    setAndSaveDraft,
    trpcUtils.videoEditorProjects.getStoryboardReview,
  ]);

  const regenerateTask = useCallback(async (taskId: string, prompt: string): Promise<boolean> => {
    const currentDraft = draftRef.current ?? draft;
    if (!currentDraft || generationCancelRequestedRef.current) return false;
    const task = currentDraft.tasks.find((item) => item.id === taskId);
    if (!task?.storyboardContext) {
      toast.error(t("mediaStudio.storyboardReviewClipContextMissing"));
      return true;
    }
    const effectiveContext = getStoryboardTaskEffectiveGenerationContext(task, currentDraft);
    const effectiveModel = optionalStoryboardRouteString(effectiveContext?.model);
    if (!effectiveContext || !effectiveModel) {
      toast.error(
        locale === "th"
          ? "ไม่พบโมเดลวิดีโอสำหรับ shot นี้ กรุณาเลือกโมเดลวิดีโออีกครั้ง"
          : "No video model is selected for this shot. Re-select a video model and try again."
      );
      return true;
    }
    const modelRoute = resolveStoryboardReviewVideoModelRoute(effectiveModel);
    const existingTransportMetadata = effectiveContext.transportMetadata ?? null;
    const existingTransportRecord =
      existingTransportMetadata &&
      typeof existingTransportMetadata === "object" &&
      !Array.isArray(existingTransportMetadata)
        ? existingTransportMetadata as Record<string, unknown>
        : {};
    const routeProviderKey =
      optionalStoryboardRouteString(modelRoute.transportMetadata?.providerKey) ??
      optionalStoryboardRouteString(modelRoute.provider);
    const existingProviderKey = optionalStoryboardRouteString(existingTransportRecord.providerKey);
    const reusableExistingMcpMetadata =
      modelRoute.transport === "mcp" &&
      existingTransportMetadata?.transport === "mcp" &&
      (!routeProviderKey || existingProviderKey === routeProviderKey)
        ? existingTransportMetadata
        : null;
    const transportMetadata =
      modelRoute.transport === "mcp"
        ? modelRoute.transportMetadata ?? reusableExistingMcpMetadata
        : null;
    const transportRecord =
      transportMetadata && typeof transportMetadata === "object" && !Array.isArray(transportMetadata)
        ? transportMetadata as Record<string, unknown>
        : {};
    if (modelRoute.transport === "mcp") {
      const missingRouteFields = [
        ["providerKey", optionalStoryboardRouteString(transportRecord.providerKey)],
        ["providerModelId", optionalStoryboardRouteString(transportRecord.providerModelId)],
        ["toolName", optionalStoryboardRouteString(transportRecord.toolName)],
        ["argumentShape", optionalStoryboardRouteString(transportRecord.argumentShape)],
      ]
        .filter(([, value]) => !value)
        .map(([field]) => field);
      if (missingRouteFields.length > 0) {
        toast.error(
          locale === "th"
            ? `ข้อมูล MCP route ของโมเดล "${effectiveModel}" ไม่ครบ (${missingRouteFields.join(", ")}) กรุณาเลือกโมเดล MCP ใหม่หรือ reconnect provider`
            : `MCP route metadata is incomplete for model "${effectiveModel}" (${missingRouteFields.join(", ")}). Re-select the MCP model or reconnect the provider.`
        );
        return true;
      }
    }
    const context = {
      ...effectiveContext,
      model: effectiveModel,
      transportMetadata,
    };
    const effectiveTask: StoryboardGenerationTask = {
      ...task,
      model: effectiveModel,
      transportMetadata,
      storyboardContext: context,
    };
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      toast.error(t("mediaStudio.storyboardReviewPromptRequired"));
      return true;
    }
    const videoSegmentPromptGate =
      evaluateStoryboardVideoSegmentPromptGenerationGate({
        taskId,
        taskExtraParams: context.extraParams,
        videoSegmentState: currentDraft.videoSegmentState,
      });
    if (!videoSegmentPromptGate.allowed) {
      toast.error(
        locale === "th"
          ? "พรอมต์วิดีโอของ segment นี้ล้าสมัย กรุณา regenerate prompt หรือยืนยันใช้พรอมต์เดิมก่อนสร้างแบบเสียเครดิต"
          : videoSegmentPromptGate.message
      );
      return true;
    }

    activeGenerationTaskIdRef.current = null;
    setRegeneratingTaskId(taskId);
    setIsCancellingGeneration(false);
    setAndSaveDraft((current) => updateDraftTask(current, taskId, {
      status: "generating",
      prompt: normalizedPrompt,
      model: effectiveModel,
      transportMetadata,
      storyboardContext: context,
      error: undefined,
      backendTaskId: undefined,
      providerTaskId: undefined,
      statusDetail: t("mediaStudio.storyboardReviewRegeneratingClip"),
    }));
    try {
      if (generationCancelRequestedRef.current) {
        return false;
      }
      const frameRoles = getTaskReferenceFrameRoles(effectiveTask);
      const generationType = generationTypeForFrameRoles(frameRoles);
      const productionContext = getReviewProductionContext(currentDraft, effectiveTask);
      const effectiveVoiceoverFullScript = firstStoryboardText(
        currentDraft.voiceoverFullScript,
        productionContext?.voiceoverFullScript,
        getStoryboardDraftVoiceoverFullScript(currentDraft),
      );
      const effectiveConceptDetails = firstStoryboardText(
        currentDraft.conceptDetails,
        productionContext?.productionStoryConceptDetails,
        productionContext?.videoConcept,
        context.extraParams?.productionConceptDetails,
        context.extraParams?.creativePresetDirective,
      );
      const effectiveStoryboardGuide = firstStoryboardText(
        currentDraft.storyboardGuide,
        productionContext?.storyboardGuide,
        context.extraParams?.storyboardGuide,
      );
      const startFrameUrl = context.referenceImages?.[0]?.url?.trim();
      const endFrameUrl = context.referenceImages?.[1]?.url?.trim();
      const generationPrompt = startFrameUrl && endFrameUrl
        ? stripPromptCodeFence((await generateStoryboardVideoPromptMutation.mutateAsync({
          currentPrompt: normalizedPrompt,
          startFrameUrl,
          endFrameUrl,
          frameRoles,
          conceptDetails: effectiveConceptDetails || undefined,
          storyboardGuide: effectiveStoryboardGuide || undefined,
          voiceoverFullScript: effectiveVoiceoverFullScript || undefined,
          aspectRatio: context.aspectRatio,
          durationSeconds: context.duration ?? effectiveTask.durationSeconds,
          model: effectiveModel,
          marketplaceContext: (context.extraParams?.marketplaceContext ?? effectiveTask.marketplaceProduct ?? currentDraft.marketplaceContext) as any,
        })).prompt)
        : normalizedPrompt;
      if (generationPrompt !== normalizedPrompt) {
        setAndSaveDraft((current) => updateDraftTask(current, taskId, {
          prompt: generationPrompt,
          statusDetail: t("mediaStudio.storyboardReviewRegeneratingClip"),
        }));
      }
      const payload = buildMediaStudioCommonPayload({
        prompt: prepareVeoPromptForGenerationType(generationPrompt, generationType),
        model: effectiveModel,
        aspectRatio: context.aspectRatio,
        referenceImages: context.referenceImages as any,
        referenceVideos: context.referenceVideos as any,
        extraParams: {
          ...(context.extraParams ?? {}),
          generationType,
          referenceFrameRoles: frameRoles,
          ...(effectiveConceptDetails ? { productionConceptDetails: effectiveConceptDetails } : {}),
          ...(effectiveStoryboardGuide ? { storyboardGuide: effectiveStoryboardGuide } : {}),
          ...(effectiveVoiceoverFullScript ? { voiceoverFullScript: effectiveVoiceoverFullScript } : {}),
          ...buildReviewProductionExtraParams(productionContext),
        },
        apiConfig: context.apiConfig,
        resolution: context.resolution,
      });
      const transportPayload =
        transportMetadata?.transport === "mcp"
          ? {
              transport: "mcp" as const,
              mcpConnectionId:
                optionalStoryboardRouteString(transportRecord.mcpConnectionId) ??
                optionalStoryboardRouteString(transportRecord.connectionId) ??
                undefined,
              sharedGroupId: transportMetadata.sharedGroupId,
              mcpApprovalId:
                optionalStoryboardRouteString(transportRecord.mcpApprovalId) ??
                optionalStoryboardRouteString(transportRecord.approvalId),
              mcpProviderKey: optionalStoryboardRouteString(transportRecord.providerKey),
              mcpProviderModelId: optionalStoryboardRouteString(transportRecord.providerModelId),
              mcpToolName: optionalStoryboardRouteString(transportRecord.toolName),
              mcpArgumentShape: optionalStoryboardRouteString(transportRecord.argumentShape),
              originSurface: "storyboard_review" as const,
              idempotencyKey: `storyboard-review-${taskId}-${Date.now()}`,
            }
          : {
              transport: "gateway_api" as const,
              originSurface: "storyboard_review" as const,
            };
      const taskResult = await generateVideoAsyncMutation.mutateAsync({
        ...payload,
        ...transportPayload,
        ...(context.duration !== undefined ? { duration: context.duration } : {}),
        ...(context.useReferenceVideoUrlFallback && context.referenceVideoUrl ? { referenceVideoUrl: context.referenceVideoUrl } : {}),
      } as any);
      const immediateUrl = extractStoryboardMediaUrl(taskResult as any, "video");
      const pollId = (taskResult as any)?.taskId || (taskResult as any)?.id;
      if (pollId) {
        activeGenerationTaskIdRef.current = String(pollId);
        setAndSaveDraft((current) => updateDraftTask(current, taskId, {
          backendTaskId: String(pollId),
          providerTaskId: String((taskResult as any)?.taskId ?? pollId),
          statusDetail: t("mediaStudio.storyboardReviewGenerationTaskStarted"),
        }));
      }
      if (generationCancelRequestedRef.current) {
        if (pollId) {
          await cancelMediaTaskMutation.mutateAsync({ taskId: String(pollId) }).catch(() => undefined);
        }
        setAndSaveDraft((current) => updateDraftTask(current, taskId, {
          status: "queued",
          error: undefined,
          statusDetail: t("mediaStudio.storyboardReviewGenerationCancelled"),
        }));
        return false;
      }
      const completedUrl = immediateUrl;
      if (!completedUrl && pollId) {
        return await pollStoryboardGenerationTask(taskId, String(pollId), { cancelRef: generationCancelRequestedRef });
      }
      if (!completedUrl) throw new Error(t("mediaStudio.storyboardReviewNoOutputUrl"));
      setAndSaveDraft((current) => updateDraftTask(current, taskId, {
        status: "completed",
        url: completedUrl ?? undefined,
        error: undefined,
        statusDetail: t("mediaStudio.storyboardReviewCompletedStatus"),
      }));
      toast.success(t("mediaStudio.storyboardReviewClipRegenerated"));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : t("mediaStudio.storyboardReviewRegenerateFailed");
      setAndSaveDraft((current) => updateDraftTask(current, taskId, { status: "error", error: message, statusDetail: message }));
      toast.error(message);
      return true;
    } finally {
      activeGenerationTaskIdRef.current = null;
      setRegeneratingTaskId(null);
      setIsCancellingGeneration(false);
    }
  }, [cancelMediaTaskMutation, draft, generateStoryboardVideoPromptMutation, generateVideoAsyncMutation, locale, pollStoryboardGenerationTask, resolveStoryboardReviewVideoModelRoute, setAndSaveDraft, t]);

  const deleteReview = useCallback(async (id: number) => {
    try {
      await deleteReviewMutation.mutateAsync({ id });
      if (draft?.reviewId === id || reviewId === id) {
        clearStoryboardReviewDraft();
        setLocation("/storyboard-review");
        setDraft(null);
      }
      void refetchReviews();
      toast.success(t("mediaStudio.storyboardReviewDeleted"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("mediaStudio.storyboardReviewDeleteFailed");
      toast.error(message);
      throw error;
    }
  }, [deleteReviewMutation, draft?.reviewId, refetchReviews, reviewId, setLocation, t]);

  const confirmDeleteReview = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      if (typeof deleteTarget.id === "number" && Number.isFinite(deleteTarget.id)) {
        await deleteReview(deleteTarget.id);
      } else {
        clearStoryboardReviewDraft();
        setDraft(null);
        setLocation("/storyboard-review");
        toast.success(t("mediaStudio.storyboardReviewDeleted"));
      }
      setDeleteTarget(null);
    } catch {
      // deleteReview already reports the error and keeps the confirmation open.
    }
  }, [deleteReview, deleteTarget, setLocation, t]);

	  const reviewQuerySettledWithoutDraft =
	    !!canonicalReviewId &&
	    !isReviewLoading &&
	    !isReviewFetching &&
	    !activeDraft;
  const reviewNotFound = reviewQuerySettledWithoutDraft && review === null;
  const reviewDataNormalizationFailed =
    reviewQuerySettledWithoutDraft &&
    reviewRecordFound &&
    !serverBackedDraft;
  const reviewUnavailable =
    !activeDraft &&
    (
      reviewQuerySettledWithoutDraft &&
      (review === null || isReviewError || review === undefined || reviewDataNormalizationFailed)
    );
  const reviewUnavailableMessage = isReviewError
    ? (reviewLoadError?.message || (locale === "th" ? "โหลด Storyboard Review ไม่สำเร็จ" : "Could not load Storyboard Review."))
    : reviewDataNormalizationFailed
      ? (locale === "th"
        ? "โหลดข้อมูลจากเซิร์ฟเวอร์ได้แล้ว แต่แปลง reviewData เป็น Storyboard draft ไม่สำเร็จ กรุณาตรวจสอบรูปแบบข้อมูล reviewData ของรายการนี้"
        : "The server returned this review, but its reviewData could not be converted into a Storyboard draft. Check this reviewData payload.")
    : review === null
      ? (locale === "th" ? "ไม่พบ Storyboard Review นี้ หรือบัญชีนี้ไม่มีสิทธิ์เปิดรายการนี้" : "Storyboard Review was not found, or this account cannot access it.")
      : (locale === "th" ? "ยังไม่ได้รับข้อมูล Storyboard Review จากเซิร์ฟเวอร์" : "The server did not return this Storyboard Review.");
	  const isLoading =
	    !!canonicalReviewId &&
	    !activeDraft &&
	    !reviewUnavailable &&
	    (isReviewLoading || isReviewFetching);

  return (
    <div
      className={cn(
        "flex min-h-dvh flex-col bg-slate-50",
        isHyperframesFinalPanelExpanded
          ? "xl:min-h-dvh"
          : "xl:h-dvh xl:overflow-hidden"
      )}
    >
      <header className="border-b bg-white px-3 py-2 sm:px-4 xl:shrink-0">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/dashboard")}
              className="h-8 w-fit shrink-0 px-2 text-xs text-slate-600 hover:text-slate-950"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              {t("mediaStudio.storyboardReviewBackToDashboard")}
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-950 sm:text-lg">
                <Film className="h-5 w-5 text-cyan-600" />
                {t("mediaStudio.storyboardReview")}
                {activeDraft ? (
                  isEditingProjectName ? (
                    <>
                      <Input
                        value={projectNameDraft}
                        onChange={(event) => setProjectNameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveProjectName();
                          if (event.key === "Escape") {
                            setProjectNameDraft(currentProjectName);
                            setIsEditingProjectName(false);
                          }
                        }}
                        aria-label={locale === "th" ? "ชื่อ project" : "Project name"}
                        className="h-8 w-full max-w-md bg-white text-sm sm:w-96"
                        autoFocus
                      />
                      <Button type="button" size="sm" className="h-8 px-2 text-xs" onClick={saveProjectName} disabled={!projectNameDraft.trim()}>
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                        {locale === "th" ? "บันทึกชื่อ" : "Save name"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 px-2 text-xs"
                        onClick={() => {
                          setProjectNameDraft(currentProjectName);
                          setIsEditingProjectName(false);
                        }}
                      >
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        {t("common.cancel")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <h1 className="min-w-0 max-w-xl truncate text-base font-semibold text-slate-900">
                        {currentProjectName}
                      </h1>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 px-2 text-xs xl:hidden"
                        onClick={() => setLocation("/storyboard-review")}
                      >
                        <ChevronLeft className="mr-1.5 h-3.5 w-3.5" />
                        {locale === "th" ? "เลือกโปรเจกต์อื่น" : "Choose another"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 px-2 text-xs"
                        onClick={() => {
                          setProjectNameDraft(currentProjectName);
                          setIsEditingProjectName(true);
                        }}
                        aria-label={locale === "th" ? "แก้ไขชื่อ project" : "Edit project name"}
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        {locale === "th" ? "แก้ชื่อ" : "Rename"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="h-8 px-2 text-xs"
                        onClick={() => setDeleteTarget({ id: canonicalReviewId ?? null, name: currentProjectName })}
                        disabled={deleteReviewMutation.isPending}
                        aria-label={locale === "th" ? "ลบโปรเจกต์นี้" : "Delete this project"}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        {locale === "th" ? "ลบโปรเจกต์" : "Delete project"}
                      </Button>
                    </>
                  )
                ) : null}
              </div>
              <p className="mt-0.5 line-clamp-1 text-xs text-slate-600">
                {t("mediaStudio.storyboardReviewPageDescription")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LocaleToggle className="hidden sm:inline-flex" />
            <Button
              type="button"
              size="sm"
              className="h-8 w-full px-2 text-xs sm:w-auto"
              onClick={createManualStoryboardReviewProject}
              disabled={isCreatingManualReviewProject}
            >
              {isCreatingManualReviewProject ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
              )}
              {locale === "th" ? "New Project" : "New Project"}
            </Button>
            <Button variant="outline" size="sm" className="h-8 w-full px-2 text-xs sm:w-auto" onClick={() => setLocation("/media-studio")}>
              {t("mediaStudio.title")}
            </Button>
          </div>
        </div>
      </header>

      {hyperframesContextAvailable ? (
        <div className="border-b bg-sky-50 px-2 py-1.5 sm:px-3">
          {isHyperframesFinalPanelExpanded ? (
            <HyperframesStoryboardReviewPanel
              render={hyperframesRenderProjection}
              snapshots={hyperframesSnapshots}
              onCreatePreview={
                !effectiveHyperframesRenderJobId && !hyperframesRenderProjection
                  ? createHyperframesPreview
                  : undefined
              }
              onRetry={repairHyperframesRender}
              onSaveToLibrary={saveHyperframesRenderToLibrary}
              loading={
                hyperframesRenderQuery.isLoading ||
                repairHyperframesRenderJobMutation.isPending
              }
              creatingPreview={createHyperframesPreviewMutation.isPending}
              saving={saveHyperframesRenderToLibraryMutation.isPending}
              manualFallbackVisible
              compact
              locale={locale}
            />
          ) : null}
          <div className={cn(
            "rounded-md border border-sky-200 bg-white px-2.5 py-1.5 shadow-sm",
            isHyperframesFinalPanelExpanded ? "mt-2" : "",
          )}>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="h-6 rounded-full px-2 text-[11px]">
                    {locale === "th" ? "HyperFrames Final Composite" : "HyperFrames Final Composite"}
                  </Badge>
                  <Badge variant="outline" className="h-6 rounded-full px-2 text-[11px]">
                    {hyperframesFinalSourceReadiness.completedVideoCount} video shots
                  </Badge>
                  {hyperframesFinalSourceReadiness.completedImageCount > 0 ? (
                    <Badge variant="outline" className="h-6 rounded-full px-2 text-[11px]">
                      {hyperframesFinalSourceReadiness.completedImageCount} images
                    </Badge>
                  ) : null}
                  {hyperframesFinalSourceReadiness.incompleteVideoCount > 0 ? (
                    <Badge variant="outline" className="h-6 rounded-full px-2 text-[11px]">
                      {locale === "th"
                        ? `${hyperframesFinalSourceReadiness.incompleteVideoCount} วิดีโอยังไม่เสร็จ`
                        : `${hyperframesFinalSourceReadiness.incompleteVideoCount} pending video`}
                    </Badge>
                  ) : null}
                  {hyperframesFinalSourceReadiness.selectedCompletedVideoCount > 0 ? (
                    <Badge variant="outline" className="h-6 rounded-full px-2 text-[11px]">
                      {locale === "th"
                        ? `เลือกไว้ ${hyperframesFinalSourceReadiness.selectedCompletedVideoCount}`
                        : `${hyperframesFinalSourceReadiness.selectedCompletedVideoCount} selected`}
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="h-6 rounded-full px-2 text-[11px]">
                    {Math.round(hyperframesFinalDurationSeconds)}s
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "h-6 rounded-full px-2 text-[11px]",
                      hyperframesFinalAutosaveStatus === "saving"
                        ? "border-sky-200 bg-sky-50 text-sky-800"
                        : hyperframesFinalAutosaveStatus === "error"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : hyperframesFinalAutosaveStatus === "saved"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-white text-slate-500",
                    )}
                    aria-live="polite"
                  >
                    {hyperframesFinalAutosaveStatus === "saving"
                      ? locale === "th" ? "กำลังบันทึก" : "Saving"
                      : hyperframesFinalAutosaveStatus === "error"
                        ? locale === "th" ? "บันทึกไม่สำเร็จ" : "Save failed"
                        : hyperframesFinalAutosaveStatus === "saved"
                          ? locale === "th" ? "บันทึกแล้ว" : "Saved"
                      : locale === "th" ? "รอบันทึก" : "Unsaved"}
                  </Badge>
                </div>
                <h2 className="sr-only">
                  {locale === "th" ? "Render รวม MP4 จาก Storyboard Review พร้อมข้อความและ Subtitle" : "Render Storyboard Review MP4 shots with text and subtitles"}
                </h2>
                {isHyperframesFinalPanelExpanded ? (
                  <p className="mt-1 line-clamp-1 text-[11px] leading-4 text-slate-600">
                    {locale === "th"
                      ? "ใช้คลิปที่เลือกไว้ก่อน ถ้าไม่ได้เลือกจะใช้ทุก shot ที่ completed แล้ว แยกจาก render เดิมของหน้า"
                      : "Uses selected completed clips first, otherwise all completed shots. This is separate from the existing page render."}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <label className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700">
                  <Layers className="h-3.5 w-3.5 text-emerald-700" />
                  <span className="sr-only">
                    {locale === "th" ? "คุณภาพ Capture ตาม Preview" : "Preview capture quality"}
                  </span>
                  <select
                    value={previewMatchCaptureQuality}
                    onChange={event =>
                      setPreviewMatchCaptureQuality(
                        event.target.value as StoryboardPreviewMatchCaptureQuality,
                      )
                    }
                    className="h-6 bg-transparent text-[11px] font-semibold outline-none"
                    aria-label={locale === "th" ? "คุณภาพ Capture ตาม Preview" : "Preview capture quality"}
                  >
                    <option value="standard">
                      {locale === "th" ? "Standard" : "Standard"}
                    </option>
                    <option value="high" disabled={!previewMatchHighQualityEnabled}>
                      {locale === "th" ? "High" : "High"}
                    </option>
                  </select>
                </label>
                <label className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300"
                    checked={previewMatchCaptureAudioEventsEnabled}
                    onChange={event => setPreviewMatchCaptureAudioEventsEnabled(event.target.checked)}
                    aria-label={locale === "th" ? "สร้างเสียง SFX ตอน Capture" : "Include SFX and music during capture"}
                  />
                  <span>{locale === "th" ? "สร้าง SFX ตอน Capture" : "Capture SFX"}</span>
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void createPreviewMatchFinalCompositeCapture()}
                  disabled={previewMatchCaptureButtonDisabled}
                  className="h-8 border-emerald-200 bg-emerald-50 px-3 text-xs text-emerald-900 hover:bg-emerald-100"
                  title={previewMatchCaptureDisabledReason ?? undefined}
                  aria-disabled={previewMatchCaptureButtonDisabled}
                >
                  {createPreviewMatchFinalCompositeCaptureMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Layers className="mr-2 h-4 w-4" />
                  )}
                  {locale === "th" ? "Capture ตาม Preview" : "Capture Final Composite"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsHyperframesFinalPanelExpanded(current => !current)}
                  className="h-8 px-3 text-xs"
                >
                  <ChevronDown
                    className={cn(
                      "mr-2 h-4 w-4 transition-transform",
                      isHyperframesFinalPanelExpanded ? "rotate-180" : ""
                    )}
                  />
                  {isHyperframesFinalPanelExpanded
                    ? locale === "th" ? "ย่อ" : "Collapse"
                    : locale === "th" ? "ตั้งค่า" : "Settings"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void createHyperframesFinalComposite()}
                  disabled={hyperframesFinalCompositeRenderButtonDisabled}
                  className="h-8 px-3 text-xs"
                  title={hyperframesFinalCompositeRenderBlockedReason ?? undefined}
                  aria-disabled={hyperframesFinalCompositeRenderButtonDisabled}
                >
                  {createHyperframesFinalCompositeMutation.isPending ||
                  updateHyperframesFinalCompositeStateMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Film className="mr-2 h-4 w-4" />
                  )}
                  {locale === "th" ? "Render Final Composite" : "Render Final Composite"}
                </Button>
              </div>
            </div>
            {!isHyperframesFinalPanelExpanded ? (
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-4 text-slate-600">
                {hyperframesFinalCompositeStatusText ? (
                  <span className={cn(
                    "inline-flex min-w-0 items-center gap-1.5",
                    hyperframesFinalCompositeIsProblem ? "text-amber-800" : "text-emerald-800",
                  )}>
                    {hyperframesFinalCompositeIsActive ? (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                    ) : hyperframesFinalCompositeIsProblem ? (
                      <X className="h-3 w-3 shrink-0" />
                    ) : (
                      <Check className="h-3 w-3 shrink-0" />
                    )}
                    <span className="truncate font-medium">{hyperframesFinalCompositeStatusText}</span>
                  </span>
                ) : null}
                <span className={cn(
                  "inline-flex min-w-0 items-center gap-1.5",
                  previewMatchCaptureIsProblem
                    ? "text-red-800"
                    : previewMatchCaptureIsActive
                      ? "text-sky-800"
                      : "text-emerald-800",
                )}>
                  {previewMatchCaptureIsActive ? (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                  ) : previewMatchCaptureIsProblem ? (
                    <X className="h-3 w-3 shrink-0" />
                  ) : previewMatchCaptureIsComplete ? (
                    <Check className="h-3 w-3 shrink-0" />
                  ) : (
                    <Layers className="h-3 w-3 shrink-0" />
                  )}
                  <span className="truncate font-medium">{previewMatchCaptureStatusTitle}</span>
                </span>
                {hyperframesFinalCompositeRenderBlockedReason ? (
                  <span className="min-w-0 truncate text-amber-800">
                    {hyperframesFinalCompositeRenderBlockedReason}
                  </span>
                ) : null}
              </div>
            ) : null}
            {isHyperframesFinalPanelExpanded && hyperframesFinalCompositeStatusText ? (
              <div
                className={cn(
                  "mt-2 flex flex-col gap-2 rounded-md border px-3 py-2 text-[11px] lg:flex-row lg:items-start lg:justify-between",
                  createHyperframesFinalCompositeMutation.isPending
                    ? "border-sky-200 bg-sky-50 text-sky-900"
                    : hyperframesFinalCompositeIsProblem
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-emerald-200 bg-emerald-50 text-emerald-900"
                )}
                aria-live="polite"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    {hyperframesFinalCompositeIsActive ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : hyperframesFinalCompositeIsCancelled ? (
                      <RefreshCw className="h-3.5 w-3.5" />
                    ) : hyperframesFinalCompositeIsProblem ? (
                      <X className="h-3.5 w-3.5" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    <span>{hyperframesFinalCompositeStatusText}</span>
                  </div>
                  {hyperframesFinalCompositeStatusDetail ? (
                    <p className="text-[11px] leading-relaxed opacity-90">
                      {hyperframesFinalCompositeStatusDetail}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] opacity-80">
                    {hyperframesFinalCompositeStartedText ? (
                      <span>
                        {locale === "th" ? "เริ่ม" : "Started"} {hyperframesFinalCompositeStartedText}
                      </span>
                    ) : null}
                    {hyperframesFinalCompositeUpdatedText ? (
                      <span>
                        {locale === "th" ? "อัปเดต" : "Updated"} {hyperframesFinalCompositeUpdatedText}
                      </span>
                    ) : null}
                    {hyperframesFinalCompositeElapsedText ? (
                      <span>
                        {locale === "th" ? "ใช้เวลา" : "Elapsed"} {hyperframesFinalCompositeElapsedText}
                      </span>
                    ) : null}
                  </div>
                  {hyperframesFinalCompositeNextAction ? (
                    <p className="text-[11px] font-medium leading-relaxed">
                      {locale === "th" ? "แนวทางแก้ไข: " : "Next step: "}
                      {hyperframesFinalCompositeNextAction}
                    </p>
                  ) : null}
                  {hyperframesFinalCompositeIsProblem && hyperframesFinalCompositePrimaryDiagnostic ? (
                    <p className="text-[10px] leading-relaxed opacity-75">
                      {locale === "th" ? "รายละเอียดเทคนิค: " : "Technical detail: "}
                      {hyperframesFinalCompositePrimaryDiagnostic}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={hyperframesFinalCompositeIsProblem ? "default" : "outline"}
                    className={cn(
                      "h-8",
                      hyperframesFinalCompositeIsProblem ? "" : "bg-white/90"
                    )}
                    onClick={() => void createHyperframesFinalComposite()}
                    disabled={hyperframesFinalCompositeRenderButtonDisabled}
                    title={hyperframesFinalCompositeRenderBlockedReason ?? undefined}
                  >
                    {createHyperframesFinalCompositeMutation.isPending ||
                    updateHyperframesFinalCompositeStateMutation.isPending ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    )}
                    {locale === "th" ? "Render ใหม่" : "Render again"}
                  </Button>
                  {hyperframesFinalVideoUrl ? (
                    <>
                      <Button
                        asChild
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 bg-white/90"
                      >
                        <a href={hyperframesFinalVideoUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-2 h-3.5 w-3.5" />
                          {locale === "th" ? "เปิดวิดีโอ" : "Open video"}
                        </a>
                      </Button>
                      <Button
                        asChild
                        type="button"
                        size="sm"
                        className="h-8"
                      >
                        <a href={hyperframesFinalVideoUrl} download>
                          <Download className="mr-2 h-3.5 w-3.5" />
                          {locale === "th" ? "ดาวน์โหลด MP4" : "Download MP4"}
                        </a>
                      </Button>
                    </>
                  ) : null}
                  {hyperframesFinalRenderProjection?.renderJobId ? (
                    <span className="rounded-full bg-white/80 px-2 py-0.5 font-mono text-[10px]">
                      Job {hyperframesFinalRenderProjection.renderJobId}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
            {isHyperframesFinalPanelExpanded ? (
            <div
              className={cn(
                "mt-2 rounded-md border px-2 py-1.5 text-[11px]",
                previewMatchCaptureIsProblem
                  ? "border-red-200 bg-red-50 text-red-900"
                  : previewMatchCaptureIsActive
                    ? "border-sky-200 bg-sky-50 text-sky-900"
                    : previewMatchCaptureIsComplete
                      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                      : "border-emerald-200 bg-emerald-50 text-emerald-950",
              )}
              aria-live="polite"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  {previewMatchCaptureIsActive ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : previewMatchCaptureIsProblem ? (
                    <X className="h-3.5 w-3.5 shrink-0" />
                  ) : previewMatchCaptureIsComplete ? (
                    <Check className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Layers className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <p className="min-w-0 font-semibold">{previewMatchCaptureStatusTitle}</p>
                </div>
                <div className="flex flex-wrap gap-1.5 font-mono text-[10px] text-emerald-800">
                  <span>{previewMatchCaptureQuality}</span>
                  <span>{previewMatchFinalCompositeConfigHash}</span>
                  <span>{previewMatchCompositionHash}</span>
                  <span>{previewMatchTimelineHash}</span>
                </div>
              </div>
              <p className="mt-1 leading-relaxed text-emerald-800">
                {previewMatchCaptureStatusDetail}
              </p>
              {previewMatchCaptureProjection ? (
                <div className="mt-2 flex flex-col gap-2 rounded-md border border-emerald-200 bg-white/80 px-2 py-1.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap gap-1.5">
                      {previewMatchCaptureProjection.captureJobId ? (
                        <Badge variant="outline" className="h-6 rounded-full px-2 font-mono text-[10px]">
                          Job {previewMatchCaptureProjection.captureJobId}
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px]">
                        {previewMatchCaptureProjection.status}
                      </Badge>
                      {previewMatchCaptureProjection.stage ? (
                        <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px]">
                          {previewMatchCaptureProjection.stage}
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px]">
                        {Math.round(previewMatchCaptureProjection.progressPercent)}%
                      </Badge>
                      {previewMatchCaptureIsComplete && previewMatchCaptureElapsedLabel ? (
                        <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px]">
                          {locale === "th"
                            ? `ใช้เวลา ${previewMatchCaptureElapsedLabel}`
                            : `Elapsed ${previewMatchCaptureElapsedLabel}`}
                        </Badge>
                      ) : null}
                      {previewMatchCaptureProjection.libraryItemId ? (
                        <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px]">
                          Library {previewMatchCaptureProjection.libraryItemId}
                        </Badge>
                      ) : null}
                      {previewMatchCaptureProjection.evidenceRef ? (
                        <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px]">
                          {previewMatchCaptureProjection.evidenceRef}
                        </Badge>
                      ) : null}
                    </div>
                    {previewMatchCaptureProjection.safeDiagnostics.length > 0 ? (
                      <p className="line-clamp-2 text-[10px] text-emerald-800">
                        {previewMatchCaptureProjection.safeDiagnostics[0]}
                      </p>
                    ) : null}
                    {!previewMatchCaptureProjection.outputUrl && !previewMatchCaptureProjection.libraryItemId ? (
                      <p className="text-[10px] text-emerald-800">
                        {locale === "th"
                          ? "เมื่อ worker encode และ verification ผ่าน ผลลัพธ์จะขึ้นเป็นปุ่มเปิดไฟล์หรือ Library item ตรงนี้"
                          : "After worker encode and verification pass, the output link or Library item appears here."}
                      </p>
                    ) : null}
                  </div>
                  {previewMatchCaptureProjection.canCancel ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 bg-white/90"
                      onClick={() => void cancelPreviewMatchFinalCompositeCapture()}
                      disabled={cancelPreviewMatchFinalCompositeCaptureMutation.isPending}
                    >
                      {cancelPreviewMatchFinalCompositeCaptureMutation.isPending ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="mr-2 h-3.5 w-3.5" />
                      )}
                      {locale === "th" ? "ยกเลิก" : "Cancel"}
                    </Button>
                  ) : previewMatchCaptureProjection.outputUrl ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 bg-white/90"
                        onClick={() => downloadStoryboardMedia(
                          previewMatchCaptureProjection.outputUrl!,
                          `${draft ? getStoryboardReviewName(draft) : "storyboard-preview-match"}-capture`,
                          "mp4",
                        )}
                      >
                        <Download className="mr-2 h-3.5 w-3.5" />
                        {locale === "th" ? "ดาวน์โหลด MP4" : "Download MP4"}
                      </Button>
                      <Button asChild type="button" size="sm" variant="outline" className="h-8 bg-white/90">
                        <a href={previewMatchCaptureProjection.outputUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-2 h-3.5 w-3.5" />
                          {locale === "th" ? "เปิดผลลัพธ์" : "Open output"}
                        </a>
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            ) : null}
            {isHyperframesFinalPanelExpanded && hyperframesFinalCompositeRenderBlockedReason ? (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {hyperframesFinalCompositeDisabledReason
                        ? locale === "th" ? "ยังไม่พร้อม render" : "Not render-ready"
                        : locale === "th" ? "กันการกดซ้ำชั่วคราว" : "Duplicate submit guard"}
                      {": "}
                      {hyperframesFinalCompositeRenderBlockedReason}
                    </p>
                    {hyperframesFinalSourceClips.length === 0 ? (
                      <p className="mt-1 leading-relaxed text-amber-800">
                        {hyperframesFinalMissingVideoDetail}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 border-amber-300 bg-white/80 text-amber-900 hover:bg-amber-100"
                    onClick={() => setIsHyperframesFinalPanelExpanded(current => !current)}
                  >
                    <ChevronDown
                      className={cn(
                        "mr-2 h-3.5 w-3.5 transition-transform",
                        isHyperframesFinalPanelExpanded ? "rotate-180" : ""
                      )}
                    />
                    {isHyperframesFinalPanelExpanded
                      ? locale === "th" ? "ยุบรายละเอียด" : "Hide details"
                      : locale === "th" ? "ดูรายละเอียด" : "View details"}
                  </Button>
                </div>
              </div>
            ) : null}
            {isHyperframesFinalPanelExpanded ? (
              <div className="mt-3 overflow-visible pr-0 xl:max-h-[calc(100dvh-14rem)] xl:overflow-y-auto xl:pr-1">
            <div className="rounded-lg border bg-white p-3 shadow-sm">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {locale === "th" ? "ตั้งค่า Render Final Composite" : "Final Composite render settings"}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {locale === "th"
                      ? "ปรับภาพ ข้อความ subtitle และเสียงก่อน generate prompt/render"
                      : "Tune visuals, text, subtitles, and audio before prompt generation/render."}
                  </p>
                </div>
                <Badge variant="outline" className="w-fit rounded-full text-[10px]">
                  CSS/GSAP · 9:16 · MP4 1080x1920
                </Badge>
              </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <label className="grid gap-1 text-xs font-medium text-slate-700">
                {locale === "th" ? "Overlay preset" : "Overlay preset"}
                <select
                  value={hyperframesFinalOverlayPreset}
                  onChange={event => {
                    const nextPreset = event.target.value as HyperframesFinalOverlayPreset;
                    setHyperframesFinalOverlayPreset(nextPreset);
                    setHyperframesFinalShotOverlayPresetById(
                      Object.fromEntries(hyperframesFinalSourceClips.map(clip => [clip.id, nextPreset])),
                    );
                  }}
                  className="h-9 rounded-md border bg-white px-2 text-sm"
                >
                  {HYPERFRAMES_FINAL_OVERLAY_PRESETS.map(preset => (
                    <option key={preset.id} value={preset.id}>
                      {locale === "th" ? preset.labelTh : preset.labelEn}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-700">
                {locale === "th" ? "ฟอนต์ไทย" : "Thai font"}
                <select
                  value={hyperframesFinalFont}
                  onChange={event => setHyperframesFinalFont(event.target.value as HyperframesFinalCompositeConfig["fontFamily"])}
                  className="h-9 rounded-md border bg-white px-2 text-sm"
                >
                  {hyperframesThaiFontFamilies.map(font => (
                    <option key={font} value={font}>{font}</option>
                  ))}
                </select>
              </label>
	              <label className="grid gap-1 text-xs font-medium text-slate-700 md:col-span-2 xl:col-span-1">
	                {locale === "th" ? "ข้อความบนภาพ" : "Text layer"}
	                <select
	                  value={hyperframesFinalTextMode}
	                  onChange={event => setHyperframesFinalTextMode(event.target.value as HyperframesFinalTextMode)}
	                  className="h-9 rounded-md border bg-white px-2 text-sm"
	                >
	                  {HYPERFRAMES_FINAL_TEXT_MODE_OPTIONS.map(option => (
	                    <option key={option.id} value={option.id}>
	                      {locale === "th" ? option.labelTh : option.labelEn}
	                    </option>
	                  ))}
	                </select>
	                <span className="rounded-md bg-sky-50 px-2 py-1 text-[10px] font-normal leading-relaxed text-sky-800">
	                  {locale === "th"
	                    ? getHyperframesFinalTextModeOption(hyperframesFinalTextMode).descriptionTh
	                    : getHyperframesFinalTextModeOption(hyperframesFinalTextMode).descriptionEn}
	                </span>
	              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-700">
                {locale === "th" ? "Text motion" : "Text motion"}
                <select
                  value={hyperframesFinalTextMotionPreset}
                  onChange={event => setHyperframesFinalTextMotionPreset(event.target.value as HyperframesFinalTextMotionPreset)}
                  className="h-9 rounded-md border bg-white px-2 text-sm"
                >
                  {HYPERFRAMES_FINAL_TEXT_MOTION_PRESETS.map(preset => (
                    <option key={preset.id} value={preset.id}>
                      {locale === "th" ? preset.labelTh : preset.labelEn}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-h-10 items-center gap-2 rounded-md border bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 xl:mt-5">
                <input
                  type="checkbox"
                  checked={hyperframesFinalBurnInSubtitles}
                  onChange={event => setHyperframesFinalBurnInSubtitles(event.target.checked)}
                  className="h-4 w-4"
                />
                {locale === "th" ? "Burn-in Subtitle" : "Burn-in subtitles"}
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-700">
                {locale === "th" ? "Subtitle preset" : "Subtitle preset"}
                <select
                  value={hyperframesFinalSubtitlePreset}
                  onChange={event => setHyperframesFinalSubtitlePreset(event.target.value as HyperframesFinalSubtitlePreset)}
                  className="h-9 rounded-md border bg-white px-2 text-sm"
                >
                  {HYPERFRAMES_FINAL_SUBTITLE_PRESETS.map(preset => (
                    <option key={preset.id} value={preset.id}>
                      {locale === "th" ? preset.labelTh : preset.labelEn}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-700">
                {locale === "th" ? "Subtitle size" : "Subtitle size"}
                <select
                  value={hyperframesFinalSubtitleFontSizePx}
                  onChange={event => setHyperframesFinalSubtitleFontSizePx(normalizeHyperframesSubtitleFontSize(event.target.value))}
                  className="h-9 rounded-md border bg-white px-2 text-sm"
                >
                  {HYPERFRAMES_FINAL_SUBTITLE_FONT_SIZE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {locale === "th" ? option.labelTh : option.labelEn}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-700">
                {locale === "th" ? "Audio pack" : "Audio pack"}
                <select
                  value={hyperframesFinalAudioPackPresetId}
                  onChange={event => setHyperframesFinalAudioPackPresetId(event.target.value)}
                  className="h-9 rounded-md border bg-white px-2 text-sm"
                >
                  <option value="">{locale === "th" ? "ไม่ใช้แพ็กเสียง" : "No audio pack"}</option>
                  {HYPERFRAMES_FINAL_AUDIO_PACK_PRESETS.map(preset => (
                    <option key={preset.id} value={preset.id}>
                      {getCreativePresetLabel(preset, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-700">
                {locale === "th" ? "Music bed" : "Music bed"}
                <select
                  value={hyperframesFinalMusicPresetId}
                  onChange={event => setHyperframesFinalMusicPresetId(event.target.value)}
                  className="h-9 rounded-md border bg-white px-2 text-sm"
                >
                  <option value="">{locale === "th" ? "ไม่ใส่เพลง" : "No music bed"}</option>
                  {HYPERFRAMES_FINAL_MUSIC_PRESETS.map(preset => (
                    <option key={preset.id} value={preset.id}>
                      {getCreativePresetLabel(preset, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-700 md:col-span-2 xl:col-span-2">
                {locale === "th" ? "SFX triggers" : "SFX triggers"}
                <select
                  multiple
                  value={hyperframesFinalSfxPresetIds}
                  onChange={event => {
                    const selected = Array.from(event.currentTarget.selectedOptions)
                      .map(option => option.value)
                      .filter(Boolean)
                      .slice(0, 8);
                    setHyperframesFinalSfxPresetIds(selected);
                    setHyperframesFinalSfxDrafts(current => {
                      const byPreset = new Map(current.map(draft => [draft.presetId, draft]));
                      return selected.map((id, index) => byPreset.get(id) ?? buildDefaultHyperframesFinalSfxDraft(id, index));
                    });
                  }}
                  className="min-h-[5.5rem] max-h-32 rounded-md border bg-white px-2 py-1 text-sm"
                >
                  {HYPERFRAMES_FINAL_SFX_PRESETS.map(preset => (
                    <option key={preset.id} value={preset.id}>
                      {getCreativePresetLabel(preset, locale)}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] font-normal text-slate-500">
                  {locale === "th" ? "กด Ctrl/⌘ เพื่อเลือกหลายเสียง" : "Use Ctrl/⌘ to select multiple effects."}
                </span>
              </label>
              <label className="flex min-h-10 items-center gap-2 rounded-md border bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 xl:mt-5">
                <input
                  type="checkbox"
                  checked={hyperframesFinalPreserveNativeAudio}
                  onChange={event => setHyperframesFinalPreserveNativeAudio(event.target.checked)}
                  className="h-4 w-4"
                />
                {locale === "th" ? "เก็บเสียงเดิมของคลิป" : "Preserve native audio"}
              </label>
              <label className="flex min-h-10 items-center gap-2 rounded-md border bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 xl:mt-5">
                <input
                  type="checkbox"
                  checked={hyperframesFinalSyntheticAudioFallback}
                  onChange={event => setHyperframesFinalSyntheticAudioFallback(event.target.checked)}
                  className="h-4 w-4"
                />
                {locale === "th" ? "ใช้เสียง fallback ถ้ายังไม่มี asset" : "Synthetic fallback"}
              </label>
              <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-slate-600 md:col-span-2 xl:col-span-1 xl:mt-5">
                {locale === "th" ? "Prompt และ payload ใช้ค่าชุดเดียวกัน" : "Prompt and payload use the same settings"}
              </div>
	            </div>
            </div>
            <div className="mt-3 rounded-lg border bg-white p-3 text-xs text-slate-700">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-950">
                    {locale === "th" ? "Shot text map" : "Shot text map"}
                  </p>
	                  <p className="mt-1 text-[11px] text-slate-500">
	                    {locale === "th"
	                      ? "เลือก shot เพื่อแก้เฉพาะข้อความที่ใช้จริง: shot 1 มี Opening Hook 0-3s และ Overlay หลัง Hook; shot 2+ มี Overlay ราย shot"
	                      : "Select a shot to edit only the text that is rendered: shot 1 has a 0-3s opening hook plus after-hook overlay; shot 2+ has per-shot overlay."}
	                  </p>
	                  {hyperframesFinalSourceClipPlan.wasSplit ? (
	                    <div className="mt-2 flex max-w-3xl items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sky-900">
	                      <Scissors className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
	                      <div>
	                        <p className="text-[12px] font-semibold">
	                          {locale === "th"
	                            ? `Auto-split ทำงานแล้ว: แบ่งคลิปยาวเป็น ${hyperframesFinalSourceClips.length} shot`
	                            : `Auto-split active: long video split into ${hyperframesFinalSourceClips.length} shots`}
	                        </p>
	                        <p className="mt-0.5 text-[11px] leading-relaxed text-sky-700">
	                          {locale === "th"
	                            ? `แต่ละ shot ยาวไม่เกิน ${HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC}s และ final render ใช้ได้สูงสุด ${HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC}s`
	                            : `Each shot is capped at ${HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC}s and final render supports up to ${HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC}s.`}
	                        </p>
	                      </div>
	                    </div>
	                  ) : null}
	                </div>
                <div className="flex flex-wrap items-center gap-2">
	                  <Badge variant="outline" className="rounded-full">
	                    {locale === "th"
	                      ? `${hyperframesFinalSourceClips.length} shot`
	                      : `${hyperframesFinalSourceClips.length} shots`}
	                  </Badge>
	                  {hyperframesFinalSourceClipPlan.wasSplit ? (
	                    <Badge variant="outline" className="rounded-full border-sky-300 bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-800">
	                      {locale === "th"
	                        ? `แบ่งคลิปอัตโนมัติ ${HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC}s/shot`
	                        : `Auto-split ${HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC}s/shot`}
	                    </Badge>
	                  ) : null}
	                  {hyperframesFinalSourceClipPlan.wasTrimmed ? (
	                    <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 px-2 py-0 text-[10px] text-amber-800">
	                      {locale === "th"
	                        ? (hyperframesFinalSourceClipPlan.usedSourceTrim
	                          ? `ใช้ช่วงที่ตัดไว้ ${hyperframesFinalSourceClipPlan.plannedDurationSeconds}s`
	                          : `Trim ${hyperframesFinalSourceClipPlan.plannedDurationSeconds}/${HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC}s`)
	                        : (hyperframesFinalSourceClipPlan.usedSourceTrim
	                          ? `Using shot trims ${hyperframesFinalSourceClipPlan.plannedDurationSeconds}s`
	                          : `Trim ${hyperframesFinalSourceClipPlan.plannedDurationSeconds}/${HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC}s`)}
	                    </Badge>
	                  ) : null}
		                  <Button
	                    type="button"
	                    size="sm"
	                    variant="outline"
	                    className="h-8 bg-white"
	                    onClick={() => setHyperframesFinalTextPreviewReplayKey(current => current + 1)}
	                    disabled={hyperframesFinalSourceClips.length === 0}
	                  >
	                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
	                    {locale === "th" ? "Replay preview" : "Replay preview"}
	                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 bg-white"
                    onClick={regenerateHyperframesFinalSubtitleMap}
                    disabled={hyperframesFinalSourceClips.length === 0}
                  >
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    {locale === "th" ? "เติม Subtitle ทุก shot" : "Fill subtitles for every shot"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 bg-white"
                    onClick={regenerateHyperframesFinalShotTextMap}
                    disabled={hyperframesFinalSourceClips.length === 0}
                  >
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    {locale === "th" ? "เติมข้อความแยกทุก shot" : "Refill per-shot text"}
                  </Button>
                </div>
              </div>
              {hyperframesFinalSourceClips.length > 0 ? (
                <>
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1 xl:hidden">
	                    {hyperframesFinalSourceClips.map((clip, index) => {
		                      const resolvedShot = hyperframesFinalResolvedPromptShots[index];
		                      const savedOverlayText = hyperframesFinalShotTextById[clip.id] ?? resolvedShot?.overlayText ?? defaultHyperframesShotText(clip, index);
		                      const overlayText = hyperframesFinalOverlayEditingById[clip.id]
		                        ? hyperframesFinalOverlayDraftById[clip.id] ?? savedOverlayText
		                        : resolvedShot?.overlayText ?? savedOverlayText;
	                      const subtitleText = hyperframesFinalSubtitleById[clip.id] ?? defaultHyperframesSubtitleText(clip);
	                      const shotPreviewPreset = resolvedShot?.overlayPreset ?? hyperframesFinalShotOverlayPresetById[clip.id] ?? resolvedHyperframesFinalOverlayPreset;
	                      const shotPreviewLineLimit = getHyperframesOverlayLineLimit(shotPreviewPreset);
	                      const shotTextMotion = hyperframesFinalShotTextMotionById[clip.id] ?? defaultHyperframesFinalTextMotionPreset(index);
	                      const shotPresetMeta = getHyperframesOverlayPresetMeta(shotPreviewPreset);
	                      const shotPosterUrl = getStoryboardClipPosterUrl(clip);
		                      const shotPreviewLines = resolveHyperframesFinalPreviewOverlayLines({
		                        textMode: hyperframesFinalTextMode,
		                        shotIndex: index,
		                        overlayPreset: shotPreviewPreset,
		                        overlayText,
		                        hookText: hyperframesFinalPreviewHookText,
		                        supportingText: hyperframesFinalPreviewSupportingText,
		                        maxLines: shotPreviewLineLimit,
		                        maxLength: 34,
		                        preferOpeningHook: index === 0,
		                      });
		                      const shotHasOverlayLayer = shotPreviewLines.length > 0;
		                      const shotSubtitleLine = getHyperframesSubtitlePreviewText(
		                        subtitleText,
		                        getHyperframesFinalClipDurationSec(clip),
		                        0,
		                      );
		                      const shotHasSubtitleLayer = hyperframesFinalBurnInSubtitles && shotSubtitleLine.trim().length > 0;
		                      const shotPreviewTitle = formatHyperframesPreviewLineForPreset(shotPreviewLines[0] ?? "", shotPreviewPreset, 26);
		                      const shotPreviewHook = formatHyperframesPreviewLineForPreset(shotPreviewLines[1] ?? "", shotPreviewPreset, 28) || shotSubtitleLine;
		                      const shotPreviewChips = shotPreviewLines
		                        .slice(2)
		                        .map(line => formatHyperframesPreviewLineForPreset(line, shotPreviewPreset, 24))
		                        .filter(Boolean);
		                      const splitLabel = formatHyperframesFinalSplitLabel(clip, locale);
		                      const isSelected = index === hyperframesFinalPreviewShotIndex;
	                      return (
	                        <button
	                          key={clip.id}
	                          type="button"
	                          onClick={() => setHyperframesFinalPreviewShotIndex(index)}
	                          className={cn(
	                            "min-w-[8.25rem] rounded-md border px-2 py-2 text-left transition-colors",
	                            isSelected
	                              ? "border-sky-400 bg-sky-50 text-sky-950"
	                              : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white",
	                          )}
	                        >
		                          <div className="flex items-center justify-between gap-2">
		                            <span className="font-semibold">Shot {index + 1}</span>
		                            <span className="rounded-full bg-white/80 px-1.5 py-0.5 font-mono text-[10px]">
		                              {Math.round(clip.durationSeconds ?? DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS)}s
		                            </span>
		                          </div>
		                          {splitLabel ? (
		                            <div className="mt-1.5 flex items-center gap-1 rounded-md border border-sky-200 bg-sky-100 px-2 py-1 text-[10px] font-bold text-sky-800">
		                              <Scissors className="h-3 w-3 shrink-0" />
		                              <span>{splitLabel}</span>
		                            </div>
		                          ) : null}
		                          <div
	                            key={`hf-shot-map-preview-${clip.id}-${hyperframesFinalTextPreviewReplayKey}`}
	                            className={cn(
	                              "hf-preview-stage hf-preview-stage--thumb relative mt-2 aspect-[9/16] h-[10.5rem] w-[5.9rem] max-w-none overflow-hidden rounded-md bg-slate-900 p-1.5 text-slate-950",
	                              shotPreviewPreset === "neon_gaming_specs" ||
	                                shotPreviewPreset === "kinetic_bold_hook" ||
	                                shotPreviewPreset === "ugc_center_stack"
	                                ? "text-white"
	                                : "",
	                            )}
		                            data-preset={shotPreviewPreset}
		                            data-text-motion={shotTextMotion}
		                            data-has-media="true"
		                            data-has-overlay-copy={shotHasOverlayLayer ? "true" : "false"}
		                            data-subtitle-preset={hyperframesFinalSubtitlePreset}
		                          >
	                            <video
	                              key={`hf-shot-map-preview-media-${clip.id}`}
	                              src={clip.url}
	                              poster={shotPosterUrl}
	                              muted
	                              playsInline
	                              preload="metadata"
	                              className="hf-preview-media"
	                              aria-hidden="true"
	                            />
		                            {shotHasOverlayLayer ? (
		                              <div className="hf-preview-overlay-copy relative z-10 flex h-full min-h-0 flex-col justify-between">
		                                <div className="hf-preview-copy-top">
		                                  <div className="hf-preview-title font-black">{shotPreviewTitle}</div>
		                                  {shotPresetMeta.kind !== "price" && shotPreviewHook ? (
		                                    <div className="hf-preview-hook mt-1 font-extrabold">{shotPreviewHook}</div>
		                                  ) : null}
		                                </div>
			                                {shotPresetMeta.kind !== "clean" && shotPreviewChips.length > 0 ? (
		                                  <div className="hf-preview-chip-list mt-1 grid gap-1">
			                                    {shotPreviewChips.filter(Boolean).slice(0, 1).map((line, chipIndex) => (
		                                      <div key={`${line}-${chipIndex}`} className="hf-preview-chip rounded-md bg-white/90 px-1.5 py-1 font-black text-slate-950">
		                                        {line}
		                                      </div>
		                                    ))}
		                                  </div>
		                                ) : null}
		                              </div>
		                            ) : null}
	                          </div>
	                          <div className="mt-2 flex flex-wrap gap-1">
	                            <span className={cn(
	                              "rounded-full px-1.5 py-0.5 text-[9px]",
		                              shotHasOverlayLayer ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
		                            )}>
	                              {shotHasOverlayLayer ? "overlay" : "no overlay"}
	                            </span>
	                            <span className={cn(
	                              "rounded-full px-1.5 py-0.5 text-[9px]",
	                              shotHasSubtitleLayer ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500",
	                            )}>
	                              {shotHasSubtitleLayer ? "subtitle" : "no subtitle"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {(() => {
                    const selectedClip = hyperframesFinalSourceClips[hyperframesFinalPreviewShotIndex] ?? hyperframesFinalSourceClips[0]!;
                    const selectedIndex = Math.max(0, hyperframesFinalSourceClips.findIndex(clip => clip.id === selectedClip.id));
                    const selectedResolvedPromptShot = hyperframesFinalResolvedPromptShots[selectedIndex];
                    const selectedOverlayPreset = selectedResolvedPromptShot?.overlayPreset ?? hyperframesFinalShotOverlayPresetById[selectedClip.id] ?? resolvedHyperframesFinalOverlayPreset;
                    const selectedAnimation = hyperframesFinalShotAnimationById[selectedClip.id] ?? (selectedIndex === hyperframesFinalSourceClips.length - 2 ? "bounce_price" : selectedIndex === 0 ? "glow_feature" : "smooth_reveal");
                    const selectedTransition = hyperframesFinalShotTransitionById[selectedClip.id] ?? "fade";
                    const selectedTextMotion = hyperframesFinalShotTextMotionById[selectedClip.id] ?? defaultHyperframesFinalTextMotionPreset(selectedIndex);
		                    const selectedPresetMeta = getHyperframesOverlayPresetMeta(selectedOverlayPreset);
		                    const selectedSavedShotOverlay = hyperframesFinalShotTextById[selectedClip.id] ?? selectedResolvedPromptShot?.overlayText ?? defaultHyperframesShotText(selectedClip, selectedIndex);
		                    const selectedShotOverlay = hyperframesFinalOverlayEditingById[selectedClip.id]
		                      ? hyperframesFinalOverlayDraftById[selectedClip.id] ?? selectedSavedShotOverlay
		                      : selectedResolvedPromptShot?.overlayText ?? selectedSavedShotOverlay;
		                    const selectedSubtitleText = hyperframesFinalSubtitleById[selectedClip.id] ?? defaultHyperframesSubtitleText(selectedClip);
		                    const selectedOverlayPersistedValue = selectedSavedShotOverlay;
		                    const selectedOverlayIsEditing = Boolean(hyperframesFinalOverlayEditingById[selectedClip.id]);
		                    const selectedSubtitleIsEditing = Boolean(hyperframesFinalSubtitleEditingById[selectedClip.id]);
		                    const selectedOverlayEditorValue = selectedOverlayIsEditing
		                      ? hyperframesFinalOverlayDraftById[selectedClip.id] ?? selectedOverlayPersistedValue
		                      : selectedOverlayPersistedValue;
		                    const selectedSubtitleEditorValue = selectedSubtitleIsEditing
		                      ? hyperframesFinalSubtitleDraftById[selectedClip.id] ?? selectedSubtitleText
		                      : selectedSubtitleText;
		                    const selectedOverlayHasUnsavedChanges =
		                      selectedOverlayIsEditing && selectedOverlayEditorValue !== selectedOverlayPersistedValue;
		                    const selectedSubtitleHasUnsavedChanges =
		                      selectedSubtitleIsEditing && selectedSubtitleEditorValue !== selectedSubtitleText;
		                    const selectedSubtitlePreviewText = getHyperframesSubtitlePreviewText(
		                      selectedSubtitleText,
		                      getHyperframesFinalClipDurationSec(selectedClip),
		                      hyperframesFinalSelectedShotPreviewMode === "video"
		                        ? hyperframesFinalSelectedShotPlaybackSec
		                        : 0,
		                    );
                    const selectedOverlayContainsPromptText = selectedOverlayEditorValue
                      .split(/\n+/)
                      .some(line => isHyperframesVideoPromptLikeText(line));
                    const selectedPreviewPosterUrl = getStoryboardClipPosterUrl(selectedClip);
                    const selectedClipLooksLikeVideo =
                      selectedClip.mediaType !== "image" && !isProbablyImageUrl(selectedClip.url);
                    const selectedVideoStatusText = getHyperframesVideoPreviewStatusText({
                      locale,
                      hasVideo: selectedClipLooksLikeVideo,
                      state: hyperframesFinalSelectedShotVideoLoadState,
                      error: hyperframesFinalSelectedShotVideoError,
                      shotNumber: selectedIndex + 1,
                    });
                    const selectedVideoIsReady =
                      hyperframesFinalSelectedShotPreviewMode === "video" &&
                      hyperframesFinalSelectedShotVideoLoadState === "ready";
                    const selectedPreviewLineLimit = getHyperframesOverlayLineLimit(selectedOverlayPreset);
                    const selectedPreviewLines = resolveHyperframesFinalPreviewOverlayLines({
	                      textMode: hyperframesFinalTextMode,
	                      shotIndex: selectedIndex,
	                      overlayPreset: selectedOverlayPreset,
	                      overlayText: selectedShotOverlay,
	                      hookText: hyperframesFinalPreviewHookText,
	                      supportingText: hyperframesFinalPreviewSupportingText,
	                      maxLines: selectedPreviewLineLimit,
	                      maxLength: 42,
	                      playbackSec: hyperframesFinalSelectedShotPreviewMode === "video"
	                        ? hyperframesFinalSelectedShotPlaybackSec
	                        : 0,
	                    });
		                    const selectedShouldRenderShotOverlay = shouldRenderHyperframesFinalShotOverlay(hyperframesFinalTextMode, selectedIndex);
		                    const selectedCanEditOverlayText = selectedShouldRenderShotOverlay;
		                    const selectedShowsOpeningHook =
		                      selectedIndex === 0 && shouldRenderHyperframesFinalHookText(hyperframesFinalTextMode);
		                    const startHyperframesFinalHookEdit = () => {
		                      setHyperframesFinalHookDraft({
		                        hookText: hyperframesFinalHookText,
		                        supportingText: hyperframesFinalSupportingText,
		                      });
		                      setIsHyperframesFinalHookEditing(true);
		                    };
		                    const cancelHyperframesFinalHookEdit = () => {
		                      setHyperframesFinalHookDraft({
		                        hookText: hyperframesFinalHookText,
		                        supportingText: hyperframesFinalSupportingText,
		                      });
		                      setIsHyperframesFinalHookEditing(false);
		                    };
		                    const saveHyperframesFinalHookEdit = () => {
		                      hyperframesFinalLocalTextDirtyRef.current = true;
		                      setHyperframesFinalHookText(hyperframesFinalHookDraft.hookText);
		                      setHyperframesFinalSupportingText(hyperframesFinalHookDraft.supportingText);
		                      setIsHyperframesFinalHookEditing(false);
		                      flushHyperframesFinalAutosaveSoon();
		                    };
		                    const startSelectedOverlayEdit = () => {
		                      if (!selectedCanEditOverlayText) return;
		                      setHyperframesFinalOverlayDraftById(current => ({ ...current, [selectedClip.id]: selectedOverlayPersistedValue }));
		                      setHyperframesFinalOverlayEditingById(current => ({ ...current, [selectedClip.id]: true }));
		                    };
		                    const updateSelectedOverlayEditorValue = (value: string) => {
		                      setHyperframesFinalOverlayDraftById(current => ({ ...current, [selectedClip.id]: value }));
		                    };
		                    const cancelSelectedOverlayEdit = () => {
		                      setHyperframesFinalOverlayDraftById(current => {
		                        const next = { ...current };
		                        delete next[selectedClip.id];
		                        return next;
		                      });
		                      setHyperframesFinalOverlayEditingById(current => ({ ...current, [selectedClip.id]: false }));
		                    };
		                    const saveSelectedOverlayEdit = () => {
		                      if (!selectedCanEditOverlayText) return;
		                      hyperframesFinalLocalTextDirtyRef.current = true;
		                      setHyperframesFinalShotTextById(current => ({ ...current, [selectedClip.id]: selectedOverlayEditorValue }));
		                      setHyperframesFinalOverlayEditingById(current => ({ ...current, [selectedClip.id]: false }));
		                      flushHyperframesFinalAutosaveSoon();
		                    };
		                    const startSelectedSubtitleEdit = () => {
		                      setHyperframesFinalSubtitleDraftById(current => ({ ...current, [selectedClip.id]: selectedSubtitleText }));
		                      setHyperframesFinalSubtitleEditingById(current => ({ ...current, [selectedClip.id]: true }));
		                    };
		                    const updateSelectedSubtitleEditorValue = (value: string) => {
		                      setHyperframesFinalSubtitleDraftById(current => ({ ...current, [selectedClip.id]: value }));
		                    };
		                    const cancelSelectedSubtitleEdit = () => {
		                      setHyperframesFinalSubtitleDraftById(current => {
		                        const next = { ...current };
		                        delete next[selectedClip.id];
		                        return next;
		                      });
		                      setHyperframesFinalSubtitleEditingById(current => ({ ...current, [selectedClip.id]: false }));
		                    };
		                    const saveSelectedSubtitleEdit = () => {
		                      hyperframesFinalLocalTextDirtyRef.current = true;
		                      setHyperframesFinalSubtitleById(current => ({ ...current, [selectedClip.id]: selectedSubtitleEditorValue }));
		                      setHyperframesFinalSubtitleVttById(current => {
		                        const next = { ...current };
		                        delete next[selectedClip.id];
		                        return next;
		                      });
		                      setHyperframesFinalSubtitleSrtById(current => {
		                        const next = { ...current };
		                        delete next[selectedClip.id];
		                        return next;
		                      });
		                      setHyperframesFinalSubtitleEditingById(current => ({ ...current, [selectedClip.id]: false }));
		                      flushHyperframesFinalAutosaveSoon();
		                    };
		                    const selectedHasOverlayLayer = selectedPreviewLines.length > 0;
		                    const selectedHasSubtitleLayer = hyperframesFinalBurnInSubtitles && selectedSubtitlePreviewText.length > 0;
		                    const selectedSubtitleLine = selectedSubtitlePreviewText;
		                    const selectedSubtitlePreviewFontSize = hyperframesPreviewSubtitleFontSize(hyperframesFinalSubtitleFontSizePx);
		                    const selectedPreviewLayerLabel = getHyperframesFinalPreviewLayerLabel({
		                      locale,
		                      textMode: hyperframesFinalTextMode,
		                      shotIndex: selectedIndex,
		                      playbackSec: hyperframesFinalSelectedShotPreviewMode === "video"
		                        ? hyperframesFinalSelectedShotPlaybackSec
		                        : 0,
		                    });
		                    const selectedPreviewTitle = formatHyperframesPreviewLineForPreset(selectedPreviewLines[0] ?? "", selectedOverlayPreset, 34, { ellipsis: false });
	                    const selectedPreviewHook = formatHyperframesPreviewLineForPreset(selectedPreviewLines[1] ?? "", selectedOverlayPreset, 38, { ellipsis: false });
                    const selectedPreviewChips = selectedPreviewLines
                      .slice(2)
                      .map(line => formatHyperframesPreviewLineForPreset(line, selectedOverlayPreset, 32, { ellipsis: false }))
                      .filter(Boolean);
                    const selectedPriceText = firstThaiProductLine(
                      selectedPreviewChips.find(line => /(?:฿|บาท|ราคา|เริ่มต้น|ผ่อน|%|\d)/i.test(line)) ?? selectedPreviewHook,
                      24,
                      { ellipsis: false },
                    );
                    const selectedShouldSequenceHookAndOverlay =
                      hyperframesFinalSelectedShotPreviewMode === "video" &&
                      selectedIndex === 0 &&
                      hyperframesFinalTextMode === "hook_and_per_shot" &&
                      selectedShouldRenderShotOverlay;
                    const selectedOpeningHookPreviewLines = selectedShouldSequenceHookAndOverlay
                      ? resolveHyperframesFinalPreviewOverlayLines({
                        textMode: hyperframesFinalTextMode,
                        shotIndex: selectedIndex,
                        overlayPreset: selectedOverlayPreset,
                        overlayText: selectedShotOverlay,
                        hookText: hyperframesFinalPreviewHookText,
                        supportingText: hyperframesFinalPreviewSupportingText,
                        maxLines: selectedPreviewLineLimit,
                        maxLength: 42,
                        preferOpeningHook: true,
                      })
                      : selectedPreviewLines;
                    const selectedAfterHookPreviewLines = selectedShouldSequenceHookAndOverlay
                      ? resolveHyperframesFinalPreviewOverlayLines({
                        textMode: hyperframesFinalTextMode,
                        shotIndex: selectedIndex,
                        overlayPreset: selectedOverlayPreset,
                        overlayText: selectedShotOverlay,
                        hookText: hyperframesFinalPreviewHookText,
                        supportingText: hyperframesFinalPreviewSupportingText,
                        maxLines: selectedPreviewLineLimit,
                        maxLength: 42,
                        playbackSec: HYPERFRAMES_FINAL_HOOK_DURATION_SEC + 0.1,
                      })
                      : selectedPreviewLines;
                    const renderSelectedOverlayCopy = (input: {
                      lines: string[];
                      layerLabel: string;
                      className?: string;
                    }) => {
                      if (input.lines.length === 0) return null;
                      const title = formatHyperframesPreviewLineForPreset(input.lines[0] ?? "", selectedOverlayPreset, 34, { ellipsis: false });
                      const hook = formatHyperframesPreviewLineForPreset(input.lines[1] ?? "", selectedOverlayPreset, 38, { ellipsis: false });
                      const chips = input.lines
                        .slice(2)
                        .map(line => formatHyperframesPreviewLineForPreset(line, selectedOverlayPreset, 32, { ellipsis: false }))
                        .filter(Boolean);
                      const priceText = firstThaiProductLine(
                        chips.find(line => /(?:฿|บาท|ราคา|เริ่มต้น|ผ่อน|%|\d)/i.test(line)) ?? hook,
                        24,
                        { ellipsis: false },
                      );
                      return (
                        <div className={cn(
                          "hf-preview-overlay-copy relative z-10 flex h-full min-h-[198px] flex-col justify-between",
                          hyperframesFinalSelectedShotPreviewMode === "video" ? "pointer-events-none" : "",
                          input.className,
                        )}>
                          <div className="hf-preview-copy-top">
                            <div className={cn(
                              "hf-preview-title max-w-[92%] font-black",
                              selectedOverlayPreset === "neon_gaming_specs" ? "text-cyan-100" : "",
                            )}>
                              {title}
                            </div>
                            {selectedPresetMeta.kind === "price" ? (
                              <div className="hf-preview-price mt-2 font-black text-yellow-400 drop-shadow">
                                {priceText}
                              </div>
                            ) : hook ? (
                              <div className={cn(
                                "hf-preview-hook mt-2 font-extrabold",
                                selectedOverlayPreset === "neon_gaming_specs" ? "text-fuchsia-200" : "",
                              )}>
                                {hook}
                              </div>
                            ) : null}
                          </div>
                          {selectedPresetMeta.kind !== "clean" && chips.length > 0 ? (
                            <div className={cn(
                              "hf-preview-chip-list mt-4 grid gap-2",
                              selectedPresetMeta.kind === "spec" ? "ml-auto w-[58%]" : "w-full",
                              selectedPresetMeta.kind === "cards" ? "grid-cols-2" : "",
                            )}>
                              {chips.filter(Boolean).slice(0, Math.max(0, selectedPreviewLineLimit - 2)).map((line, index) => (
                                <div
                                  key={`${line}-${index}`}
                                  className={cn(
                                    "hf-preview-chip rounded-full px-3 py-2 font-black shadow-sm",
                                    selectedOverlayPreset === "neon_gaming_specs"
                                      ? "border border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
                                      : selectedPresetMeta.kind === "price"
                                        ? "bg-white text-slate-950"
                                        : "bg-white/85 text-slate-950",
                                  )}
                                >
                                  {line}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    };
                    return (
                      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(18rem,0.78fr)_minmax(0,1fr)_minmax(8.75rem,0.32fr)]">
                        <div className="grid gap-2 rounded-md border bg-slate-950 p-3 text-white">
                          <div className="flex items-center justify-between gap-2 px-1">
                            <div>
                              <p className="text-[11px] font-semibold">
                                {locale === "th" ? "Live preview" : "Live preview"}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {locale === "th"
                                  ? selectedHasOverlayLayer
                                    ? "Preview และ render ใช้โหมดข้อความบนภาพเดียวกัน"
                                    : "Shot นี้ไม่มี overlay ตามโหมดข้อความบนภาพที่เลือก"
                                  : selectedHasOverlayLayer
                                    ? "Preview and render use the same text-layer mode."
                                    : "This shot has no overlay in the selected text-layer mode."}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className={cn(
                                  "h-7 border-white/20 px-2 text-[10px] text-white hover:bg-white/20",
                                  hyperframesFinalSelectedShotPreviewMode === "video" ? "bg-emerald-500/20" : "bg-white/10",
                                )}
                                disabled={!selectedClipLooksLikeVideo}
                                onClick={() => {
                                  const nextMode: HyperframesSelectedShotPreviewMode =
                                    hyperframesFinalSelectedShotPreviewMode === "video" ? "design" : "video";
	                                  setHyperframesFinalSelectedShotPreviewMode(nextMode);
	                                  if (nextMode === "video") {
	                                    setHyperframesFinalSelectedShotVideoLoadState("loading");
	                                    setHyperframesFinalSelectedShotVideoError("");
	                                    requestAnimationFrame(() => {
	                                      const video = hyperframesFinalSelectedShotVideoRef.current;
	                                      if (!video) return;
	                                      prepareHyperframesSegmentVideo({
	                                        video,
	                                        startSec: selectedClip.mediaStartSec ?? 0,
	                                        endSec: (selectedClip.mediaStartSec ?? 0) + getHyperframesFinalClipDurationSec(selectedClip),
	                                        restart: true,
	                                      });
	                                      void video.play().catch(() => undefined);
	                                    });
	                                  }
	                                }}
                              >
                                {hyperframesFinalSelectedShotPreviewMode === "video" ? (
                                  <Layers className="mr-1 h-3 w-3" />
                                ) : (
                                  <Play className="mr-1 h-3 w-3" />
                                )}
                                {hyperframesFinalSelectedShotPreviewMode === "video"
                                  ? locale === "th" ? "ดูเลย์เอาต์" : "Show layout"
                                  : locale === "th" ? "เล่นวิดีโอ" : "Play video"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 border-white/20 bg-white/10 px-2 text-[10px] text-white hover:bg-white/20"
                                onClick={() => {
                                  setHyperframesFinalTextPreviewReplayKey(current => current + 1);
                                  if (hyperframesFinalSelectedShotPreviewMode === "video") {
                                    requestAnimationFrame(() => {
                                      const video = hyperframesFinalSelectedShotVideoRef.current;
		                                      if (!video) return;
		                                      try {
		                                        prepareHyperframesSegmentVideo({
		                                          video,
		                                          startSec: selectedClip.mediaStartSec ?? 0,
		                                          endSec: (selectedClip.mediaStartSec ?? 0) + getHyperframesFinalClipDurationSec(selectedClip),
		                                          restart: true,
		                                        });
		                                        void video.play().catch(() => undefined);
                                      } catch {
                                        // no-op
                                      }
                                    });
                                  }
                                }}
                              >
                                <RefreshCw className="mr-1 h-3 w-3" />
                                Replay
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                aria-label={
                                  locale === "th"
                                    ? `ขยายวิดีโอ shot ${selectedIndex + 1}`
                                    : `Expand shot ${selectedIndex + 1} video`
                                }
                                className="h-7 border-white/20 bg-white/10 px-2 text-[10px] text-white hover:bg-white/20"
                                onClick={() => setVideoPreview({
                                  url: selectedClip.url,
                                  title: `Shot ${selectedIndex + 1}`,
                                  overlayPreview: {
                                    posterUrl: selectedPreviewPosterUrl,
                                    overlayPreset: selectedOverlayPreset,
                                    textMotionPreset: selectedTextMotion,
                                    subtitlePreset: hyperframesFinalSubtitlePreset,
                                    subtitleFontSizePx: selectedSubtitlePreviewFontSize,
                                    layerLabel: selectedPreviewLayerLabel,
                                    titleText: selectedPreviewTitle,
                                    hookText: selectedPresetMeta.kind === "price" ? "" : selectedPreviewHook,
                                    priceText: selectedPresetMeta.kind === "price" ? selectedPriceText : "",
                                    chips: selectedPreviewChips,
                                    subtitleText: selectedHasSubtitleLayer ? selectedSubtitleLine : "",
                                    presetKind: selectedPresetMeta.kind,
                                  },
                                })}
                              >
                                <Maximize2 className="h-3 w-3" />
                              </Button>
	                              {hyperframesFinalSelectedShotPreviewMode === "video" ? (
	                                <>
	                                  <span
	                                    className={cn(
	                                      "max-w-[15rem] truncate rounded-full px-2.5 py-1 text-[10px] font-semibold",
	                                      hyperframesFinalSelectedShotVideoLoadState === "error"
	                                        ? "bg-red-500/20 text-red-100"
	                                        : hyperframesFinalSelectedShotVideoLoadState === "ready"
	                                          ? "bg-emerald-500/20 text-emerald-100"
	                                          : "bg-sky-500/20 text-sky-100",
	                                    )}
	                                    title={selectedVideoStatusText}
	                                  >
	                                    {selectedVideoStatusText}
	                                  </span>
		                                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white">
		                                    {locale === "th" ? "เปิดเสียงต้นฉบับ" : "native audio on"}
		                                  </span>
		                                  {selectedClip.segmentCount && selectedClip.segmentCount > 1 ? (
		                                    <span className="rounded-full bg-sky-500/20 px-2.5 py-1 text-[10px] font-semibold text-sky-100">
		                                      {locale === "th"
		                                        ? `เล่นเฉพาะช่วง ${selectedClip.mediaStartSec ?? 0}-${roundHyperframesTimelineSecond((selectedClip.mediaStartSec ?? 0) + getHyperframesFinalClipDurationSec(selectedClip))}s`
		                                        : `segment ${selectedClip.mediaStartSec ?? 0}-${roundHyperframesTimelineSecond((selectedClip.mediaStartSec ?? 0) + getHyperframesFinalClipDurationSec(selectedClip))}s`}
		                                    </span>
		                                  ) : null}
		                                </>
	                              ) : null}
                            </div>
                          </div>
                          <div
                            key={`hyperframes-final-large-preview-${selectedClip.id}-${hyperframesFinalTextPreviewReplayKey}`}
                            ref={hyperframesFinalSelectedShotStageRef}
                            style={
                              hyperframesFinalSelectedShotPreviewMode === "video" && hyperframesFinalSelectedShotOverlayFrameVars
                                ? hyperframesFinalSelectedShotOverlayFrameVars
                                : undefined
                            }
                            className={cn(
                              "hf-preview-stage hf-preview-stage--large relative mx-auto aspect-[9/16] min-h-[430px] max-h-[680px] w-[min(100%,27rem)] max-w-[27rem] overflow-hidden rounded-md bg-slate-900 p-4 text-left text-slate-950",
                              selectedOverlayPreset === "neon_gaming_specs" ||
                                selectedOverlayPreset === "kinetic_bold_hook" ||
                                selectedOverlayPreset === "ugc_center_stack"
                                ? "text-white"
                                : "",
                            )}
	                            data-preset={selectedOverlayPreset}
	                            data-text-motion={selectedTextMotion}
	                            data-has-media="true"
	                            data-has-overlay-copy={selectedHasOverlayLayer ? "true" : "false"}
                              data-subtitle-preset={hyperframesFinalSubtitlePreset}
                              data-preview-mode={hyperframesFinalSelectedShotPreviewMode}
	                          >
                            <video
                              key={`hf-compact-preview-media-${selectedClip.id}-${hyperframesFinalSelectedShotPreviewMode}`}
	                              src={selectedClip.url}
	                              poster={selectedPreviewPosterUrl}
	                              ref={hyperframesFinalSelectedShotVideoRef}
	                              muted={hyperframesFinalSelectedShotPreviewMode !== "video"}
	                              playsInline
                              preload="auto"
                              autoPlay={hyperframesFinalSelectedShotPreviewMode === "video"}
	                              loop={false}
                              controls={hyperframesFinalSelectedShotPreviewMode === "video"}
                              className={cn(
                                hyperframesFinalSelectedShotPreviewMode === "video"
                                  ? "absolute inset-0 z-[8] h-full w-full bg-transparent object-cover transition-opacity duration-200"
                                  : "hf-preview-media",
                                hyperframesFinalSelectedShotPreviewMode === "video" ? "hf-preview-media--interactive" : "",
                                "opacity-100",
                              )}
	                              onLoadedMetadata={() => {
	                                const video = hyperframesFinalSelectedShotVideoRef.current;
	                                if (video && hyperframesFinalSelectedShotPreviewMode === "video") {
	                                  prepareHyperframesSegmentVideo({
	                                    video,
	                                    startSec: selectedClip.mediaStartSec ?? 0,
	                                    endSec: (selectedClip.mediaStartSec ?? 0) + getHyperframesFinalClipDurationSec(selectedClip),
	                                  });
	                                }
	                                if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                                  setHyperframesFinalSelectedShotVideoLoadState("ready");
                                  setHyperframesFinalSelectedShotVideoError("");
                                }
                                if (hyperframesFinalSelectedShotPreviewMode === "video") {
                                  window.requestAnimationFrame(syncHyperframesFinalSelectedShotOverlayFrame);
                                }
                              }}
                              onLoadStart={() => {
                                if (hyperframesFinalSelectedShotPreviewMode === "video") {
                                  setHyperframesFinalSelectedShotVideoLoadState("loading");
                                  setHyperframesFinalSelectedShotVideoError("");
                                }
                              }}
                              onLoadedData={() => {
                                setHyperframesFinalSelectedShotVideoLoadState("ready");
                                setHyperframesFinalSelectedShotVideoError("");
                                if (hyperframesFinalSelectedShotPreviewMode === "video") {
                                  window.requestAnimationFrame(syncHyperframesFinalSelectedShotOverlayFrame);
                                }
                              }}
	                              onCanPlay={() => {
	                                const video = hyperframesFinalSelectedShotVideoRef.current;
	                                if (video && hyperframesFinalSelectedShotPreviewMode === "video") {
	                                  prepareHyperframesSegmentVideo({
	                                    video,
	                                    startSec: selectedClip.mediaStartSec ?? 0,
	                                    endSec: (selectedClip.mediaStartSec ?? 0) + getHyperframesFinalClipDurationSec(selectedClip),
	                                  });
	                                }
	                                setHyperframesFinalSelectedShotVideoLoadState("ready");
	                                setHyperframesFinalSelectedShotVideoError("");
	                                if (hyperframesFinalSelectedShotPreviewMode === "video") {
	                                  window.requestAnimationFrame(syncHyperframesFinalSelectedShotOverlayFrame);
	                                }
	                              }}
                              onPlaying={() => {
                                setHyperframesFinalSelectedShotVideoLoadState("ready");
                                setHyperframesFinalSelectedShotVideoError("");
                                if (hyperframesFinalSelectedShotPreviewMode === "video") {
                                  window.requestAnimationFrame(syncHyperframesFinalSelectedShotOverlayFrame);
                                }
                              }}
	                              onTimeUpdate={(event) => {
                                  const video = event.currentTarget;
                                  if (!video) return;
	                                if (hyperframesFinalSelectedShotPreviewMode === "video") {
	                                  const segmentStart = selectedClip.mediaStartSec ?? 0;
	                                  const segmentEnd = segmentStart + getHyperframesFinalClipDurationSec(selectedClip);
	                                  const relativeSec = Math.max(0, video.currentTime - segmentStart);
	                                  if (Math.abs(relativeSec - hyperframesFinalSelectedShotPlaybackLastSecRef.current) >= 0.1) {
	                                    hyperframesFinalSelectedShotPlaybackLastSecRef.current = relativeSec;
	                                    setHyperframesFinalSelectedShotPlaybackSec(roundHyperframesTimelineSecond(relativeSec));
	                                  }
	                                  if (video.currentTime < segmentStart - 0.25) {
	                                    video.currentTime = segmentStart;
	                                  }
	                                  if (video.currentTime >= segmentEnd - 0.05) {
	                                    hyperframesFinalSelectedShotPlaybackLastSecRef.current = 0;
	                                    setHyperframesFinalSelectedShotPlaybackSec(0);
	                                    prepareHyperframesSegmentVideo({
	                                      video,
	                                      startSec: segmentStart,
	                                      endSec: segmentEnd,
	                                      restart: true,
	                                    });
	                                    void video.play().catch(() => undefined);
	                                    return;
	                                  }
	                                }
	                                if (video.currentTime <= 0.02) return;
                                setHyperframesFinalSelectedShotVideoLoadState("ready");
                                setHyperframesFinalSelectedShotVideoError("");
                              }}
                              onWaiting={() => undefined}
                              onStalled={() => {
                                if (hyperframesFinalSelectedShotPreviewMode !== "video") return;
                                setHyperframesFinalSelectedShotVideoLoadState("error");
                                setHyperframesFinalSelectedShotVideoError(
                                  locale === "th"
                                    ? "เบราว์เซอร์หยุดโหลดวิดีโอจาก URL นี้ ตรวจ source MP4 หรือสิทธิ์ไฟล์"
                                    : "The browser stalled while loading this MP4. Check the source URL or file permissions.",
                                );
                              }}
                              onError={() => {
                                const mediaError = hyperframesFinalSelectedShotVideoRef.current?.error;
                                const mediaMessage =
                                  mediaError?.code === 1 ? (locale === "th" ? "การเล่นวิดีโอถูกยกเลิก" : "Video playback was aborted.")
                                  : mediaError?.code === 2 ? (locale === "th" ? "เกิดปัญหาเครือข่ายระหว่างโหลดวิดีโอ" : "A network error interrupted video loading.")
                                  : mediaError?.code === 3 ? (locale === "th" ? "เบราว์เซอร์ถอดรหัสวิดีโอนี้ไม่ได้" : "The browser could not decode this video.")
                                  : mediaError?.code === 4 ? (locale === "th" ? "รูปแบบไฟล์วิดีโอนี้ไม่รองรับใน browser" : "This video format is not supported by the browser.")
                                  : locale === "th" ? "โหลดวิดีโอของ shot นี้ไม่สำเร็จ" : "Failed to load this shot video.";
                                setHyperframesFinalSelectedShotVideoLoadState("error");
                                setHyperframesFinalSelectedShotVideoError(mediaMessage);
                              }}
                              aria-hidden={hyperframesFinalSelectedShotPreviewMode === "design"}
                            />
                            {selectedPreviewPosterUrl && (
                              hyperframesFinalSelectedShotPreviewMode === "design" ||
                              (hyperframesFinalSelectedShotPreviewMode === "video" && !selectedVideoIsReady)
                            ) ? (
                              <img
                                src={selectedPreviewPosterUrl}
                                alt=""
                                aria-hidden="true"
                                className={cn(
                                  "pointer-events-none absolute inset-0 z-[5] h-full w-full object-cover opacity-95 transition-opacity duration-200",
                                )}
                              />
                            ) : null}
                            {hyperframesFinalSelectedShotPreviewMode === "video" &&
                              !selectedPreviewPosterUrl &&
                              hyperframesFinalSelectedShotVideoLoadState !== "ready" ? (
                                <div className="absolute inset-0 z-[5] flex items-center justify-center bg-slate-950/80 p-5 text-center text-xs font-semibold leading-relaxed text-white">
                                  {locale === "th"
                                    ? "ยังไม่มี poster สำหรับ shot นี้ กำลังพยายามโหลด MP4 โดยตรง"
                                    : "No poster is available for this shot. Loading the MP4 directly."}
                                </div>
                            ) : null}
                            {hyperframesFinalSelectedShotPreviewMode === "video" &&
                              hyperframesFinalSelectedShotVideoLoadState !== "ready" ? (
                              <div className="hf-preview-video-playback-status absolute inset-x-3 top-3 z-30 rounded-full bg-slate-950/85 px-3 py-2 text-center text-[11px] font-bold leading-tight text-white shadow-lg">
                                <span>{selectedVideoStatusText}</span>
                              </div>
                            ) : null}
		                            {selectedShouldSequenceHookAndOverlay ? (
		                              <>
		                                {renderSelectedOverlayCopy({
		                                  lines: selectedOpeningHookPreviewLines,
		                                  layerLabel: locale === "th" ? "Opening Hook 0-3s" : "Opening Hook 0-3s",
		                                  className: "hf-preview-overlay-copy--opening-hook",
		                                })}
		                                {renderSelectedOverlayCopy({
		                                  lines: selectedAfterHookPreviewLines,
		                                  layerLabel: locale === "th" ? "Overlay text หลัง Hook" : "Overlay text after hook",
		                                  className: "hf-preview-overlay-copy--after-hook",
		                                })}
		                              </>
		                            ) : selectedHasOverlayLayer ? (
		                              renderSelectedOverlayCopy({
		                                lines: selectedPreviewLines,
		                                layerLabel: selectedPreviewLayerLabel,
		                              })
		                            ) : null}
		                            {selectedHasSubtitleLayer && selectedSubtitleLine ? (
	                              <div
	                                className={cn(
                                    "hf-sub-preview-inline",
                                    hyperframesFinalSelectedShotPreviewMode === "video" ? "pointer-events-none" : "",
                                  )}
	                                data-subtitle-preset={hyperframesFinalSubtitlePreset}
	                              >
	                                {hyperframesFinalSubtitlePreset === "karaoke_word" ? (
	                                  <div className="hf-sub-line" style={{ fontSize: selectedSubtitlePreviewFontSize }}>
	                                    {selectedSubtitleLine.split(/\s+/).filter(Boolean).map((word, wordIndex) => (
	                                      <span key={`${word}-${wordIndex}`} className="hf-sub-word">
	                                        {word}
	                                      </span>
	                                    ))}
	                                  </div>
	                                ) : (
	                                  <div className="hf-sub-line" style={{ fontSize: selectedSubtitlePreviewFontSize }}>
	                                    {selectedSubtitleLine}
	                                  </div>
	                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="grid gap-3">
                        <div className="grid gap-3 sm:grid-cols-4">
                          <label className="grid gap-1 text-[11px] font-medium text-slate-600">
                            {locale === "th" ? "Style ของ shot" : "Shot style"}
                            <select
                              value={selectedOverlayPreset}
                              onChange={event => setHyperframesFinalShotOverlayPresetById(current => ({
                                ...current,
                                [selectedClip.id]: event.target.value as HyperframesFinalOverlayPreset,
                              }))}
                              className="h-9 rounded-md border bg-white px-2 text-xs"
                            >
                              {HYPERFRAMES_FINAL_OVERLAY_PRESETS.map(preset => (
                                <option key={preset.id} value={preset.id}>
                                  {locale === "th" ? preset.labelTh : preset.labelEn}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-1 text-[11px] font-medium text-slate-600">
                            {locale === "th" ? "Animation" : "Animation"}
                            <select
                              value={selectedAnimation}
                              onChange={event => setHyperframesFinalShotAnimationById(current => ({
                                ...current,
                                [selectedClip.id]: event.target.value as HyperframesFinalShotAnimationPreset,
                              }))}
                              className="h-9 rounded-md border bg-white px-2 text-xs"
                            >
                              {HYPERFRAMES_FINAL_SHOT_ANIMATION_PRESETS.map(preset => (
                                <option key={preset.id} value={preset.id}>
                                  {locale === "th" ? preset.labelTh : preset.labelEn}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-1 text-[11px] font-medium text-slate-600">
                            {locale === "th" ? "Transition" : "Transition"}
                            <select
                              value={selectedTransition}
                              onChange={event => setHyperframesFinalShotTransitionById(current => ({
                                ...current,
                                [selectedClip.id]: event.target.value as HyperframesFinalShotTransition,
                              }))}
                              className="h-9 rounded-md border bg-white px-2 text-xs"
                            >
                              {HYPERFRAMES_FINAL_SHOT_TRANSITIONS.map(transition => (
                                <option key={transition.id} value={transition.id}>
                                  {locale === "th" ? transition.labelTh : transition.labelEn}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-1 text-[11px] font-medium text-slate-600">
                            {locale === "th" ? "Text motion" : "Text motion"}
                            <select
                              value={selectedTextMotion}
                              onChange={event => setHyperframesFinalShotTextMotionById(current => ({
                                ...current,
                                [selectedClip.id]: event.target.value as HyperframesFinalTextMotionPreset,
                              }))}
                              className="h-9 rounded-md border bg-white px-2 text-xs"
                            >
                              {HYPERFRAMES_FINAL_TEXT_MOTION_PRESETS.map(preset => (
                                <option key={preset.id} value={preset.id}>
                                  {locale === "th" ? preset.labelTh : preset.labelEn}
                                </option>
                              ))}
                            </select>
	                          </label>
	                        </div>
	                        {selectedShowsOpeningHook ? (
	                          <section className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-xs text-slate-700 shadow-sm">
	                            <div className="flex flex-wrap items-start justify-between gap-3">
	                              <div className="grid gap-1">
	                                <div className="flex flex-wrap items-center gap-2">
	                                  <span className="text-sm font-semibold text-slate-900">
	                                    {locale === "th" ? "Opening Hook ของ shot 1" : "Shot 1 opening hook"}
	                                  </span>
	                                  <Badge variant="outline" className="rounded-full border-amber-200 bg-white px-2 py-0 text-[10px] text-amber-800">
	                                    {locale === "th" ? "ใช้จริง 0-3s แรก" : "rendered during 0-3s"}
	                                  </Badge>
	                                  {isHyperframesFinalHookEditing ? (
	                                    <Badge variant="outline" className="rounded-full border-amber-200 bg-white px-2 py-0 text-[10px] text-amber-700">
	                                      {locale === "th" ? "ยังไม่ได้บันทึก" : "unsaved"}
	                                    </Badge>
	                                  ) : null}
	                                </div>
	                                <p className="text-[11px] leading-relaxed text-slate-600">
	                                  {locale === "th"
	                                    ? "สองช่องนี้ใช้เฉพาะ shot 1 ช่วงเปิดคลิปเท่านั้น; shot อื่นจะไม่ใช้ Hook/Supporting"
	                                    : "These two fields are used only for shot 1 at the opening; other shots never use Hook/Supporting."}
	                                </p>
	                              </div>
	                              <div className="flex flex-wrap justify-end gap-2">
	                                {isHyperframesFinalHookEditing ? (
	                                  <>
	                                    <Button type="button" size="sm" className="h-8 px-3 text-xs" onClick={saveHyperframesFinalHookEdit}>
	                                      <Check className="mr-1.5 h-3.5 w-3.5" />
	                                      {locale === "th" ? "บันทึก" : "Save"}
	                                    </Button>
	                                    <Button type="button" size="sm" variant="outline" className="h-8 bg-white px-3 text-xs" onClick={cancelHyperframesFinalHookEdit}>
	                                      <X className="mr-1.5 h-3.5 w-3.5" />
	                                      {locale === "th" ? "ยกเลิก" : "Cancel"}
	                                    </Button>
	                                  </>
	                                ) : (
	                                  <Button type="button" size="sm" variant="outline" className="h-8 bg-white px-3 text-xs" onClick={startHyperframesFinalHookEdit}>
	                                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
	                                    {locale === "th" ? "แก้ไข" : "Edit"}
	                                  </Button>
	                                )}
	                              </div>
	                            </div>
	                            <div className="mt-3 grid gap-3 lg:grid-cols-2">
	                              <label className="grid gap-1 font-medium text-slate-700">
	                                <span>{locale === "th" ? "Hook text" : "Hook text"}</span>
	                                <Input
	                                  value={isHyperframesFinalHookEditing ? hyperframesFinalHookDraft.hookText : hyperframesFinalHookText}
	                                  onChange={event => setHyperframesFinalHookDraft(current => ({ ...current, hookText: event.target.value }))}
	                                  disabled={!isHyperframesFinalHookEditing}
	                                  className={cn(!isHyperframesFinalHookEditing ? "bg-slate-50 text-slate-500" : "bg-white")}
	                                  placeholder={locale === "th" ? "ข้อความหลักช่วงเปิด shot 1" : "Main opening text for shot 1"}
	                                />
	                              </label>
	                              <label className="grid gap-1 font-medium text-slate-700">
	                                <span>{locale === "th" ? "Supporting text" : "Supporting text"}</span>
	                                <Input
	                                  value={isHyperframesFinalHookEditing ? hyperframesFinalHookDraft.supportingText : hyperframesFinalSupportingText}
	                                  onChange={event => setHyperframesFinalHookDraft(current => ({ ...current, supportingText: event.target.value }))}
	                                  disabled={!isHyperframesFinalHookEditing}
	                                  className={cn(!isHyperframesFinalHookEditing ? "bg-slate-50 text-slate-500" : "bg-white")}
	                                  placeholder={locale === "th" ? "ข้อความรองช่วงเปิด shot 1" : "Supporting opening text for shot 1"}
	                                />
	                              </label>
	                            </div>
	                          </section>
	                        ) : null}
	                        <div className="grid gap-4 xl:grid-cols-2">
                          <section className="grid min-h-[24rem] content-start gap-3 rounded-lg border border-slate-200 bg-white/95 p-4 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="grid gap-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-800">
                                    {locale === "th" ? `Overlay text สำหรับ shot ${selectedIndex + 1}` : `Overlay text for shot ${selectedIndex + 1}`}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "rounded-full px-2 py-0 text-[10px] font-medium",
                                      selectedCanEditOverlayText
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : "border-slate-200 bg-slate-50 text-slate-500",
                                    )}
                                  >
                                    {selectedCanEditOverlayText
                                      ? selectedIndex === 0 && hyperframesFinalTextMode === "hook_and_per_shot"
                                        ? locale === "th" ? "ใช้หลัง Hook" : "after hook"
                                        : locale === "th" ? "ใช้ตอน render" : "rendered"
                                      : locale === "th" ? "ไม่ใช้ในโหมดนี้" : "not used in this mode"}
                                  </Badge>
                                  {selectedOverlayHasUnsavedChanges ? (
                                    <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 px-2 py-0 text-[10px] text-amber-700">
                                      {locale === "th" ? "ยังไม่ได้บันทึก" : "unsaved"}
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="text-xs font-normal leading-relaxed text-slate-500">
                                  {selectedCanEditOverlayText
                                    ? selectedIndex === 0 && hyperframesFinalTextMode === "hook_and_per_shot"
                                      ? locale === "th" ? "ข้อความนี้จะแสดงหลัง Hook 0-3s ของ shot 1" : "This text appears after the 0-3s hook on shot 1."
                                      : locale === "th" ? "ข้อความนี้จะแสดงบน preview และ final render ของ shot นี้" : "This text appears in this shot preview and final render."
                                    : hyperframesFinalTextMode === "hook_only"
                                      ? locale === "th" ? "โหมดนี้ใช้เฉพาะ Opening Hook ของ shot 1; เลือก shot 1 เพื่อแก้ Hook/Supporting" : "This mode uses only the shot-1 opening hook; select shot 1 to edit Hook/Supporting."
                                      : locale === "th" ? "โหมดข้อความบนภาพปัจจุบันไม่ render overlay ของ shot นี้" : "The current text-layer mode does not render this shot overlay."}
                                </p>
                              </div>
                              <div className="flex flex-wrap justify-end gap-2">
                                {selectedOverlayIsEditing ? (
                                  <>
                                    <Button type="button" size="sm" className="h-8 px-3 text-xs" onClick={saveSelectedOverlayEdit}>
                                      <Check className="mr-1.5 h-3.5 w-3.5" />
                                      {locale === "th" ? "บันทึก" : "Save"}
                                    </Button>
                                    <Button type="button" size="sm" variant="outline" className="h-8 bg-white px-3 text-xs" onClick={cancelSelectedOverlayEdit}>
                                      <X className="mr-1.5 h-3.5 w-3.5" />
                                      {locale === "th" ? "ยกเลิก" : "Cancel"}
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 bg-white px-3 text-xs"
                                    onClick={startSelectedOverlayEdit}
                                    disabled={!selectedCanEditOverlayText}
                                  >
                                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                    {locale === "th" ? "แก้ไข" : "Edit"}
                                  </Button>
                                )}
                              </div>
                            </div>
                            <Textarea
                              value={selectedOverlayEditorValue}
                              onChange={event => updateSelectedOverlayEditorValue(event.target.value)}
                              disabled={!selectedOverlayIsEditing || !selectedCanEditOverlayText}
                              className={cn(
                                "min-h-[14rem] resize-y rounded-lg border-slate-300 p-4 text-sm leading-6 shadow-inner",
                                selectedOverlayIsEditing && selectedCanEditOverlayText
                                  ? "bg-white text-slate-900 focus-visible:ring-sky-400"
                                  : "bg-slate-50 text-slate-500",
                              )}
                              placeholder={locale === "th" ? "ข้อความบนจอเฉพาะ shot นี้" : "On-screen text for this shot"}
                            />
                            {selectedOverlayContainsPromptText ? (
                              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-normal leading-relaxed text-amber-800">
                                {locale === "th"
                                  ? "พบข้อความ prompt วิดีโอในช่อง Overlay text ระบบจะไม่วาดข้อความส่วนนั้นบนภาพ ให้แก้เป็นข้อความสั้น ๆ ที่ต้องการแสดงบนจอ"
                                  : "Video prompt text was detected in Overlay text. It will not be drawn on the video; replace it with short on-screen copy."}
                              </div>
                            ) : null}
                          </section>
                          <section className="grid min-h-[24rem] content-start gap-3 rounded-lg border border-sky-100 bg-sky-50/40 p-4 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="grid gap-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-800">
                                    {locale === "th" ? `Subtitle / Voiceover shot ${selectedIndex + 1}` : `Subtitle / voiceover shot ${selectedIndex + 1}`}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "rounded-full px-2 py-0 text-[10px] font-medium",
                                      selectedHasSubtitleLayer
                                        ? "border-sky-200 bg-white text-sky-700"
                                        : "border-slate-200 bg-white text-slate-500",
                                    )}
                                  >
                                    {selectedHasSubtitleLayer
                                      ? locale === "th" ? "แสดง subtitle" : "subtitle shown"
                                      : locale === "th" ? "ไม่แสดง subtitle" : "subtitle hidden"}
                                  </Badge>
                                  {selectedSubtitleHasUnsavedChanges ? (
                                    <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 px-2 py-0 text-[10px] text-amber-700">
                                      {locale === "th" ? "ยังไม่ได้บันทึก" : "unsaved"}
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="text-xs font-normal leading-relaxed text-slate-500">
                                  {hyperframesFinalBurnInSubtitles
                                    ? locale === "th" ? `จะแสดงใน preview และ final render; ปรับขนาดได้ที่ Subtitle size (${hyperframesFinalSubtitleFontSizePx}px)` : `Shown in preview and final render; adjust with Subtitle size (${hyperframesFinalSubtitleFontSizePx}px).`
                                    : locale === "th" ? "ปิด Burn-in Subtitle อยู่ จึงเก็บไว้เป็นบทพูดแต่ไม่วาดบนภาพ" : "Burn-in subtitles are off, so this is stored as voiceover text but not drawn."}
                                </p>
                              </div>
                              <div className="flex flex-wrap justify-end gap-2">
                                {selectedSubtitleIsEditing ? (
                                  <>
                                    <Button type="button" size="sm" className="h-8 px-3 text-xs" onClick={saveSelectedSubtitleEdit}>
                                      <Check className="mr-1.5 h-3.5 w-3.5" />
                                      {locale === "th" ? "บันทึก" : "Save"}
                                    </Button>
                                    <Button type="button" size="sm" variant="outline" className="h-8 bg-white px-3 text-xs" onClick={cancelSelectedSubtitleEdit}>
                                      <X className="mr-1.5 h-3.5 w-3.5" />
                                      {locale === "th" ? "ยกเลิก" : "Cancel"}
                                    </Button>
                                  </>
                                ) : (
                                  <Button type="button" size="sm" variant="outline" className="h-8 bg-white px-3 text-xs" onClick={startSelectedSubtitleEdit}>
                                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                    {locale === "th" ? "แก้ไข" : "Edit"}
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 bg-white px-3 text-xs"
                                onClick={() => fillHyperframesFinalSubtitleFromPrompt(selectedClip)}
                              >
                                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                {locale === "th" ? "สร้างจากบทพูด" : "Create from voiceover"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 bg-white px-3 text-xs"
                                onClick={() => void transcribeHyperframesFinalSubtitleFromVideo(selectedClip)}
                                disabled={hyperframesFinalTranscribingShotId === selectedClip.id}
                              >
                                {hyperframesFinalTranscribingShotId === selectedClip.id ? (
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Mic className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                {locale === "th" ? "Transcribe จากคลิป" : "Transcribe from clip"}
                              </Button>
                              {hyperframesFinalSubtitleVttById[selectedClip.id]?.trim() ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 bg-white px-3 text-xs"
                                  onClick={() =>
                                    downloadHyperframesSubtitleSidecar(
                                      hyperframesFinalSubtitleVttById[selectedClip.id]!,
                                      `${draft ? getStoryboardReviewName(draft) : "storyboard-review"}-shot-${hyperframesFinalPreviewShotIndex + 1}-subtitle`,
                                      "vtt",
                                    )
                                  }
                                >
                                  <Download className="mr-1.5 h-3.5 w-3.5" />
                                  VTT
                                </Button>
                              ) : null}
                              {hyperframesFinalSubtitleSrtById[selectedClip.id]?.trim() ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 bg-white px-3 text-xs"
                                  onClick={() =>
                                    downloadHyperframesSubtitleSidecar(
                                      hyperframesFinalSubtitleSrtById[selectedClip.id]!,
                                      `${draft ? getStoryboardReviewName(draft) : "storyboard-review"}-shot-${hyperframesFinalPreviewShotIndex + 1}-subtitle`,
                                      "srt",
                                    )
                                  }
                                >
                                  <Download className="mr-1.5 h-3.5 w-3.5" />
                                  SRT
                                </Button>
                              ) : null}
                            </div>
                            {hyperframesFinalTranscribingShotId === selectedClip.id && hyperframesFinalTranscribeStatusText ? (
                              <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800">
                                {hyperframesFinalTranscribeStatusText}
                              </div>
                            ) : null}
                            <Textarea
                              value={selectedSubtitleEditorValue}
                              onChange={event => updateSelectedSubtitleEditorValue(event.target.value)}
                              disabled={!selectedSubtitleIsEditing}
                              className={cn(
                                "min-h-[14rem] resize-y rounded-lg border-sky-200 p-4 text-sm leading-6 shadow-inner",
                                selectedSubtitleIsEditing
                                  ? "bg-white text-slate-900 focus-visible:ring-sky-400"
                                  : "bg-white/80 text-slate-600",
                              )}
                              placeholder={locale === "th" ? "ระบบเติมจากบทพูดของ shot ได้ หรือแก้เอง" : "Defaults from this shot voiceover; editable."}
                            />
                            <div className="grid gap-1.5 text-xs font-normal leading-relaxed text-slate-500">
                              <p>
                                {locale === "th"
                                  ? "ปุ่มสร้างจากบทพูดใช้ข้อความใน prompt ของ shot นี้ ส่วน Transcribe จากคลิปจะถอดเสียงเฉพาะช่วง shot นี้"
                                  : "Create from voiceover uses this shot prompt. Transcribe extracts only this shot segment."}
                              </p>
                              <p>
                                {locale === "th"
                                  ? "ถ้าเป็น split shot ระบบจะไม่ส่งทั้งวิดีโอเข้า transcribe และถ้ามีไฟล์ VTT/SRT แล้วจะดาวน์โหลดได้จากปุ่มด้านบน"
                                  : "Split shots do not send the full video into transcription; VTT/SRT sidecars appear above when available."}
                              </p>
                            </div>
                          </section>
                        </div>
                        </div>
                        <aside className="hidden max-h-[44rem] overflow-y-auto rounded-md border bg-slate-50 p-2 xl:grid xl:content-start xl:gap-2">
                          <div className="flex items-center justify-between gap-2 px-1">
                            <span className="text-[11px] font-semibold text-slate-700">
                              {locale === "th" ? "เลือก shot" : "Select shot"}
                            </span>
                            <Badge variant="outline" className="rounded-full bg-white px-2 py-0 text-[10px]">
                              {hyperframesFinalSourceClips.length}
                            </Badge>
                          </div>
	                          {hyperframesFinalSourceClips.map((railClip, railIndex) => {
		                            const railResolvedShot = hyperframesFinalResolvedPromptShots[railIndex];
		                            const railSavedOverlayText = hyperframesFinalShotTextById[railClip.id] ?? railResolvedShot?.overlayText ?? defaultHyperframesShotText(railClip, railIndex);
		                            const railOverlayText = hyperframesFinalOverlayEditingById[railClip.id]
		                              ? hyperframesFinalOverlayDraftById[railClip.id] ?? railSavedOverlayText
		                              : railResolvedShot?.overlayText ?? railSavedOverlayText;
	                            const railSubtitleText = hyperframesFinalSubtitleById[railClip.id] ?? defaultHyperframesSubtitleText(railClip);
	                            const railPosterUrl = getStoryboardClipPosterUrl(railClip);
	                            const railIsSelected = railIndex === hyperframesFinalPreviewShotIndex;
	                            const railOverlayPreset = railResolvedShot?.overlayPreset ?? hyperframesFinalShotOverlayPresetById[railClip.id] ?? resolvedHyperframesFinalOverlayPreset;
	                            const railPreviewLines = resolveHyperframesFinalPreviewOverlayLines({
	                              textMode: hyperframesFinalTextMode,
	                              shotIndex: railIndex,
	                              overlayPreset: railOverlayPreset,
	                              overlayText: railOverlayText,
		                              hookText: hyperframesFinalPreviewHookText,
	                              supportingText: hyperframesFinalPreviewSupportingText,
	                              maxLines: 1,
	                              maxLength: 32,
	                              preferOpeningHook: railIndex === 0,
	                            });
	                            const railHasOverlayLayer = railPreviewLines.length > 0;
		                            const railHasSubtitleLayer = hyperframesFinalBurnInSubtitles && railSubtitleText.trim().length > 0;
		                            const railPreviewText = firstThaiProductLine(railPreviewLines[0] ?? "", 32);
		                            const railSplitLabel = formatHyperframesFinalSplitLabel(railClip, locale);
		                            return (
                              <button
                                key={`hf-shot-rail-${railClip.id}`}
                                type="button"
                                onClick={() => setHyperframesFinalPreviewShotIndex(railIndex)}
                                className={cn(
                                  "rounded-md border p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
                                  railIsSelected
                                    ? "border-sky-400 bg-sky-50 text-sky-950"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:bg-sky-50/60",
                                )}
                              >
	                                <div className="flex items-center justify-between gap-2 px-0.5">
	                                  <span className="text-[10px] font-semibold">Shot {railIndex + 1}</span>
	                                  <span className="rounded-full bg-white/90 px-1.5 py-0.5 font-mono text-[9px]">
	                                    {Math.round(railClip.durationSeconds ?? DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS)}s
	                                  </span>
	                                </div>
	                                {railSplitLabel ? (
	                                  <div className="mt-1.5 flex items-center gap-1 rounded-md border border-sky-200 bg-sky-100 px-2 py-1 text-[10px] font-bold text-sky-800">
	                                    <Scissors className="h-3 w-3 shrink-0" />
	                                    <span>{railSplitLabel}</span>
	                                  </div>
	                                ) : null}
	                                <div className="relative mt-1.5 aspect-[9/16] overflow-hidden rounded-md bg-slate-900">
                                  <video
                                    key={`hf-shot-rail-media-${railClip.id}`}
                                    src={railClip.url}
                                    poster={railPosterUrl}
                                    muted
                                    playsInline
                                    preload="metadata"
                                    className="absolute inset-0 h-full w-full object-cover opacity-90"
                                    aria-hidden="true"
                                  />
	                                  {railHasOverlayLayer ? (
	                                    <div className="absolute inset-x-1 bottom-1 rounded bg-white/90 px-1.5 py-1 text-[8px] font-bold leading-tight text-slate-950">
	                                      {railPreviewText}
	                                    </div>
	                                  ) : null}
	                                </div>
	                                <div className="mt-1.5 flex flex-wrap gap-1">
	                                  <span className={cn(
	                                    "rounded-full px-1.5 py-0.5 text-[9px]",
	                                    railHasOverlayLayer ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
	                                  )}>
	                                    {railHasOverlayLayer ? "overlay" : "no overlay"}
	                                  </span>
	                                  <span className={cn(
	                                    "rounded-full px-1.5 py-0.5 text-[9px]",
	                                    railHasSubtitleLayer ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500",
	                                  )}>
	                                    {railHasSubtitleLayer ? "subtitle" : "no subtitle"}
	                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </aside>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  {locale === "th" ? "ยังไม่มีวิดีโอ shot ให้ config ราย shot" : "No video shots are available for per-shot configuration."}
                </p>
              )}
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <label className="grid gap-1 text-xs font-medium text-slate-700">
                <span className="flex items-center gap-2">
                  <Pencil className="h-3.5 w-3.5 text-sky-600" />
                  {locale === "th" ? "HyperFrames full render prompt" : "HyperFrames full render prompt"}
                </span>
                <Textarea
                  aria-label="HyperFrames full render prompt"
                  value={hyperframesFinalStyleBrief}
                  onChange={event => {
                    const nextPrompt = event.target.value;
                    if (nextPrompt.length > HYPERFRAMES_FINAL_PROMPT_MAX_LENGTH) {
                      toast.error(
                        locale === "th"
                          ? `Prompt ยาวเกิน ${HYPERFRAMES_FINAL_PROMPT_MAX_LENGTH.toLocaleString()} ตัวอักษร จึงยังไม่บันทึก`
                          : `Prompt is longer than ${HYPERFRAMES_FINAL_PROMPT_MAX_LENGTH.toLocaleString()} characters and was not saved.`,
                      );
                      return;
                    }
                    setIsHyperframesFinalPromptEdited(true);
                    setHyperframesFinalStyleBrief(nextPrompt);
                  }}
                  className="min-h-[260px] bg-white text-xs leading-relaxed"
                  placeholder={generatedHyperframesFinalRenderPrompt || DEFAULT_HYPERFRAMES_FINAL_STYLE_BRIEF}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2 text-[10px] font-normal text-slate-500">
                    <span>{hyperframesFinalStyleBrief.length}/{HYPERFRAMES_FINAL_PROMPT_MAX_LENGTH}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full px-2 py-0 text-[10px] font-medium",
                        isHyperframesFinalPromptStale
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : isHyperframesFinalPromptEdited
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800",
                      )}
                    >
                      {isHyperframesFinalPromptStale
                        ? locale === "th" ? "Option เปลี่ยนแล้ว: render จะใช้ prompt เดิม" : "Options changed: render will use the current prompt"
                        : isHyperframesFinalPromptEdited
                        ? locale === "th" ? "Custom prompt: option จะไม่เขียนทับอัตโนมัติ" : "Custom prompt: options will not overwrite automatically"
                        : locale === "th" ? "Prompt ตรงกับ option ล่าสุด" : "Prompt matches current options"}
                    </Badge>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => void generateHyperframesFinalPromptWithSkill()}
                    disabled={generateHyperframesFinalPromptSkillMutation.isPending || hyperframesFinalSourceClips.length === 0}
                    title={hyperframesFinalSourceClips.length === 0 ? hyperframesFinalMissingVideoTitle : undefined}
                  >
                    {generateHyperframesFinalPromptSkillMutation.isPending ? (
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    ) : null}
                    {locale === "th" ? "Generate prompt ด้วย skill" : "Generate prompt with skill"}
                  </Button>
                </div>
                {isHyperframesFinalPromptStale ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-normal leading-relaxed text-amber-800">
                    {locale === "th"
                      ? "Preview และ option ด้านบนเปลี่ยนแล้ว แต่ full prompt ยังเป็นเวอร์ชันก่อนหน้า กด Render ได้เลยถ้าต้องการใช้ prompt เดิม หรือกด Generate prompt ด้วย skill เมื่อต้องการอัปเดต prompt ให้ตรง option ล่าสุด"
                      : "Preview and options changed, but the full prompt is still from the previous version. You can render with the current prompt, or generate a fresh skill prompt when you want it to match the latest options."}
                  </p>
                ) : null}
              </label>
              <div className="rounded-lg border bg-slate-950 p-3 text-xs text-slate-100">
	                <div className="flex flex-wrap items-center justify-between gap-2">
	                  <div className="flex items-center gap-2 font-semibold">
	                    <Film className="h-4 w-4 text-cyan-300" />
	                    {locale === "th" ? "Payload preview ก่อนส่ง HyperFrames" : "HyperFrames payload preview"}
	                  </div>
	                  <div className="flex flex-wrap gap-2">
	                    <Button
	                      type="button"
	                      size="sm"
	                      variant="outline"
	                      className="h-8 border-white/20 bg-white/10 text-white hover:bg-white/20"
	                      onClick={() => setIsHyperframesFinalPayloadExpanded(current => !current)}
	                    >
	                      <ChevronDown
	                        className={cn(
	                          "mr-2 h-3.5 w-3.5 transition-transform",
	                          isHyperframesFinalPayloadExpanded ? "rotate-180" : ""
	                        )}
	                      />
	                      {isHyperframesFinalPayloadExpanded
	                        ? locale === "th" ? "ยุบ" : "Collapse"
	                        : locale === "th" ? "เปิดดู payload" : "Show payload"}
	                    </Button>
	                    <Button
	                      type="button"
	                      size="sm"
	                      variant="outline"
	                      className="h-8 border-white/20 bg-white/10 text-white hover:bg-white/20"
	                      onClick={() => {
	                        if (!navigator.clipboard?.writeText) {
	                          toast.error(locale === "th" ? "เบราว์เซอร์นี้ยังไม่รองรับการ copy" : "Clipboard copy is not available");
	                          return;
	                        }
	                        void navigator.clipboard
	                          .writeText(hyperframesFinalPayloadPreview)
	                          .then(() => {
	                            toast.success(locale === "th" ? "คัดลอก payload preview แล้ว" : "Copied payload preview");
	                          })
	                          .catch(() => {
	                            toast.error(locale === "th" ? "คัดลอก payload preview ไม่สำเร็จ" : "Could not copy payload preview");
	                          });
	                      }}
	                    >
	                      <Clipboard className="mr-2 h-3.5 w-3.5" />
	                      {locale === "th" ? "Copy" : "Copy"}
	                    </Button>
	                  </div>
	                </div>
                {isHyperframesFinalPayloadExpanded ? (
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/45 p-3 font-mono text-[10.5px] leading-relaxed text-slate-200">
                    {hyperframesFinalPayloadPreview}
                  </pre>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-400">
                    {locale === "th"
                      ? "ยุบไว้เพื่อลดพื้นที่ แต่ยัง copy payload ชุดเดียวกับที่จะส่งให้ HyperFrames ได้"
                      : "Collapsed to save space. Copy still uses the exact payload that will be sent to HyperFrames."}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 rounded-lg border bg-slate-50 p-3 text-xs text-slate-700">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Music2 className="h-4 w-4 text-sky-600" />
                  {locale === "th" ? "SFX timeline / Audio event map" : "SFX timeline / audio event map"}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-full">
                    {hyperframesFinalPreserveNativeAudio
                      ? locale === "th" ? "เก็บเสียงเดิม" : "native audio"
                      : locale === "th" ? "ปิดเสียงเดิม" : "native muted"}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 bg-white"
                    onClick={() => setIsHyperframesFinalAudioPreviewExpanded(current => !current)}
                  >
                    <ChevronDown
                      className={cn(
                        "mr-2 h-3.5 w-3.5 transition-transform",
                        isHyperframesFinalAudioPreviewExpanded ? "rotate-180" : ""
                      )}
                    />
                    {isHyperframesFinalAudioPreviewExpanded
                      ? locale === "th" ? "ยุบ" : "Collapse"
                      : locale === "th" ? "เปิดดู" : "Show"}
                  </Button>
                </div>
              </div>
              <div className="mb-3 rounded-md border bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {locale === "th" ? "ตั้งค่า SFX แบบ timeline" : "Timeline SFX controls"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {locale === "th"
                        ? "เลือกเสียง เอฟเฟกต์ผูกกับ shot/trigger/เวลาได้ ไม่ต้องเดาว่า multi-select จะใส่ช่วงไหน"
                        : "Choose which sound plays on which shot, trigger, and offset instead of relying on an opaque multi-select."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => {
                      const presetId = HYPERFRAMES_FINAL_SFX_PRESETS[0]?.id ?? "whoosh_scene_transition";
                      const draft = buildDefaultHyperframesFinalSfxDraft(presetId, hyperframesFinalSfxDrafts.length);
                      setHyperframesFinalSfxDrafts(current => [...current, draft].slice(0, 12));
                      setHyperframesFinalSfxPresetIds(current => Array.from(new Set([...current, presetId])).slice(0, 8));
                    }}
                  >
                    {locale === "th" ? "เพิ่ม SFX" : "Add SFX"}
                  </Button>
                </div>
                <div className="mt-3 grid gap-2">
                  {hyperframesFinalSfxDrafts.length === 0 ? (
                    <p className="rounded-md border border-dashed bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                      {locale === "th" ? "ยังไม่มี SFX event เพิ่มเสียงเพื่อกำหนดช่วงเวลา" : "No SFX events yet. Add one to configure timing."}
                    </p>
                  ) : null}
                  {hyperframesFinalSfxDrafts.map((draft, index) => (
                    <div key={draft.id} className="grid gap-2 rounded-md border bg-slate-50 p-2 lg:grid-cols-[1.2fr_0.9fr_0.9fr_0.55fr_0.55fr_0.55fr_auto]">
                      <label className="grid gap-1 text-[10px] font-medium text-slate-600">
                        {locale === "th" ? "เสียง" : "Sound"}
                        <select
                          value={draft.presetId}
                          onChange={event => {
                            const presetId = event.target.value;
                            setHyperframesFinalSfxDrafts(current => current.map(item =>
                              item.id === draft.id ? { ...buildDefaultHyperframesFinalSfxDraft(presetId, index), id: item.id, target: item.target } : item
                            ));
                            setHyperframesFinalSfxPresetIds(current => Array.from(new Set([...current.filter(id => id !== draft.presetId), presetId])).slice(0, 8));
                          }}
                          className="h-8 rounded-md border bg-white px-2 text-xs"
                        >
                          {HYPERFRAMES_FINAL_SFX_PRESETS.map(preset => (
                            <option key={preset.id} value={preset.id}>
                              {getCreativePresetLabel(preset, locale)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-[10px] font-medium text-slate-600">
                        {locale === "th" ? "ใช้กับ" : "Target"}
                        <select
                          value={draft.target}
                          onChange={event => setHyperframesFinalSfxDrafts(current => current.map(item =>
                            item.id === draft.id ? { ...item, target: event.target.value } : item
                          ))}
                          className="h-8 rounded-md border bg-white px-2 text-xs"
                        >
                          <option value="all">{locale === "th" ? "ทุก shot" : "All shots"}</option>
                          <option value="first">{locale === "th" ? "shot แรก" : "First shot"}</option>
                          <option value="last">{locale === "th" ? "shot สุดท้าย" : "Last shot"}</option>
                          {hyperframesFinalSourceClips.map((clip, shotIndex) => (
                            <option key={clip.id} value={clip.id}>Shot {shotIndex + 1}</option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-[10px] font-medium text-slate-600">
                        Trigger
                        <select
                          value={draft.visualTrigger}
                          onChange={event => setHyperframesFinalSfxDrafts(current => current.map(item =>
                            item.id === draft.id ? { ...item, visualTrigger: event.target.value as HyperframesFinalSfxTrigger } : item
                          ))}
                          className="h-8 rounded-md border bg-white px-2 text-xs"
                        >
                          {HYPERFRAMES_FINAL_SFX_TRIGGER_OPTIONS.map(trigger => (
                            <option key={trigger.id} value={trigger.id}>
                              {locale === "th" ? trigger.labelTh : trigger.labelEn}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-[10px] font-medium text-slate-600">
                        Offset
                        <Input
                          type="number"
                          min={0}
                          max={30}
                          step={0.1}
                          value={draft.offsetSec}
                          onChange={event => setHyperframesFinalSfxDrafts(current => current.map(item =>
                            item.id === draft.id ? { ...item, offsetSec: Math.max(0, Math.min(30, Number(event.target.value) || 0)) } : item
                          ))}
                          className="h-8 bg-white px-2 text-xs"
                        />
                      </label>
                      <label className="grid gap-1 text-[10px] font-medium text-slate-600">
                        Dur
                        <Input
                          type="number"
                          min={0.05}
                          max={5}
                          step={0.05}
                          value={draft.durationSec}
                          onChange={event => setHyperframesFinalSfxDrafts(current => current.map(item =>
                            item.id === draft.id ? { ...item, durationSec: Math.max(0.05, Math.min(5, Number(event.target.value) || 0.1)) } : item
                          ))}
                          className="h-8 bg-white px-2 text-xs"
                        />
                      </label>
                      <label className="grid gap-1 text-[10px] font-medium text-slate-600">
                        Vol
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.05}
                          value={draft.volume}
                          onChange={event => setHyperframesFinalSfxDrafts(current => current.map(item =>
                            item.id === draft.id ? { ...item, volume: Math.max(0, Math.min(1, Number(event.target.value) || 0)) } : item
                          ))}
                          className="h-8 bg-white px-2 text-xs"
                        />
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 self-end text-red-600 hover:text-red-700"
                        onClick={() => {
                          setHyperframesFinalSfxDrafts(current => current.filter(item => item.id !== draft.id));
                          setHyperframesFinalSfxPresetIds(current => current.filter(id => id !== draft.presetId));
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              {isHyperframesFinalAudioPreviewExpanded ? (() => {
                const previewShots = hyperframesFinalSourceClips.map((clip, index) => {
                  const resolvedShot = hyperframesFinalResolvedPromptShots[index];
                  return {
                    id: clip.id,
                    index,
                    title: `Shot ${index + 1}`,
                    sourceVideoUrl: clip.url,
                    sourceVideoRef: clip.url,
                    mediaStartSec: resolvedShot?.mediaStartSec ?? clip.mediaStartSec ?? 0,
                    startSec: resolvedShot?.startSec ?? 0,
                    durationSec: resolvedShot?.durationSeconds ?? getHyperframesFinalClipDurationSec(clip),
                    onScreenText: resolvedShot?.overlayLines ?? [],
                    subtitleCues: resolvedShot?.subtitleCues ?? [],
                    overlayPreset: resolvedShot?.overlayPreset ?? resolvedHyperframesFinalOverlayPreset,
                    animationPreset: resolvedShot?.animationPreset ?? "smooth_reveal" as const,
                    transition: resolvedShot?.transition ?? "fade" as const,
                    textMotionPreset: resolvedShot?.textMotionPreset ?? defaultHyperframesFinalTextMotionPreset(index),
                  };
                });
                const events = buildHyperframesFinalAudioEvents({
                  finalVideoLengthSec: hyperframesFinalDurationSeconds,
                  shots: previewShots,
                  musicPresetId: hyperframesFinalMusicPresetId || undefined,
                  sfxPresetIds: hyperframesFinalSfxPresetIds,
                  sfxDrafts: hyperframesFinalSfxDrafts,
                }).slice(0, 12);
                if (events.length === 0) {
                  return (
                    <p className="text-slate-500">
                      {locale === "th" ? "ยังไม่มี music/SFX event เลือก Music bed หรือ SFX เพื่อดู timeline" : "No music/SFX events yet. Select a music bed or SFX to preview the timeline."}
                    </p>
                  );
                }
                return (
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {events.map(event => (
                      <div key={event.id} className="rounded-md border bg-white px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold text-slate-900">{event.role}</span>
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 font-mono text-[10px] text-sky-700">
                            {event.startSec.toFixed(1)}s
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[11px] text-slate-500">{event.presetId}</p>
                        <p className="mt-1 text-[11px] text-slate-600">
                          {event.visualTrigger} · vol {Math.round(event.volume * 100)}%
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })() : (
                <p className="text-[11px] text-slate-500">
                  {locale === "th"
                    ? "ยุบไว้เพื่อลดพื้นที่ เปิดดูเมื่อต้องตรวจ timing เพลง/SFX ก่อน render"
                    : "Collapsed to save space. Expand when you need to inspect music/SFX timing before render."}
                </p>
              )}
              {isHyperframesFinalAudioPreviewExpanded ? (
                <p className="mt-2 text-[11px] text-slate-500">
                  {locale === "th"
                    ? "ถ้ายังไม่มี licensed staged asset ระบบจะบันทึก missing asset refs และใช้ fallback ตาม policy ที่เลือก"
                    : "When licensed staged assets are not available, missing refs are recorded and the selected fallback policy is used."}
                </p>
              ) : null}
            </div>
            <div className="mt-3 rounded-lg border bg-slate-950 p-3 text-white">
              <style>{`
                @keyframes hfPreviewRise { from { opacity: 0; transform: translateY(18px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
                @keyframes hfPreviewPop { 0% { opacity: 0; transform: scale(.72) rotate(-2deg); } 70% { opacity: 1; transform: scale(1.08) rotate(0deg); } 100% { opacity: 1; transform: scale(1); } }
                @keyframes hfPreviewSlide { from { opacity: 0; transform: translateX(44px); } to { opacity: 1; transform: translateX(0); } }
                @keyframes hfPreviewSlideRightToLeft { from { opacity: 0; transform: translateX(110%) scale(.98); } 72% { opacity: 1; transform: translateX(-3%) scale(1.02); } to { opacity: 1; transform: translateX(0) scale(1); } }
                @keyframes hfPreviewSlideLeftToRight { from { opacity: 0; transform: translateX(-90%) scale(.98); } 72% { opacity: 1; transform: translateX(3%) scale(1.02); } to { opacity: 1; transform: translateX(0) scale(1); } }
                @keyframes hfPreviewWipe { from { opacity: 1; clip-path: inset(0 100% 0 0); transform: translateX(10px); } to { opacity: 1; clip-path: inset(0 0 0 0); transform: translateX(0); } }
                @keyframes hfPreviewOverlayLifetime { 0%, 86% { opacity: 1; } 100% { opacity: 0; } }
                @keyframes hfPreviewOpeningHookWindow { 0%, 92% { opacity: 1; } 100% { opacity: 0; } }
                @keyframes hfPreviewAfterHookWindow { 0%, 99% { opacity: 0; } 100% { opacity: 1; } }
                @keyframes hfPreviewGlow { 0%, 100% { box-shadow: 0 0 0 rgba(34,211,238,0); } 50% { box-shadow: 0 0 34px rgba(34,211,238,.42); } }
                @keyframes hfPreviewPrice { 0% { opacity: 0; transform: translateY(24px) scale(.82); } 60% { opacity: 1; transform: translateY(-4px) scale(1.14); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
                .hf-preview-stage { aspect-ratio: 9 / 16; container-type: inline-size; min-height: 320px; max-height: 520px; max-width: 22rem; position: relative; overflow: hidden; }
                .hf-preview-stage--compact { min-height: 260px; max-height: 360px; max-width: 15rem; width: 100%; }
                .hf-preview-stage--large { min-height: 430px; max-height: 680px; max-width: 27rem; width: min(100%, 27rem); margin-inline: auto; }
                .hf-preview-stage--modal { min-height: 0; height: min(calc(100dvh - 5rem), calc((100dvw - 1rem) * 16 / 9)); max-height: none; width: min(calc((100dvh - 5rem) * 9 / 16), calc(100dvw - 1rem)); max-width: none; margin-inline: auto; }
                .hf-preview-stage--thumb { min-height: 0; height: 10.5rem; width: 5.9rem; max-height: none; max-width: none; margin-inline: auto; border: 1px solid rgba(148,163,184,.38); box-shadow: 0 10px 22px rgba(15,23,42,.14); }
                .hf-preview-poster { position: absolute; inset: 0; z-index: 1; height: 100%; width: 100%; object-fit: cover; opacity: .96; transition: opacity .2s ease; }
                .hf-preview-poster--hidden { opacity: 0; }
                .hf-preview-media { position: absolute; inset: 0; z-index: 2; height: 100%; width: 100%; object-fit: cover; opacity: .92; pointer-events: none; }
                .hf-preview-media--interactive { z-index: 4; pointer-events: auto; }
                .hf-preview-media--hidden { opacity: 0; }
                .hf-preview-video-status { position: absolute; left: 50%; bottom: 14px; z-index: 28; transform: translateX(-50%); max-width: calc(100% - 28px); border-radius: 999px; background: rgba(2,6,23,.74); padding: 8px 12px; color: #fff; text-align: center; font-size: 11px; font-weight: 700; line-height: 1.2; box-shadow: 0 8px 24px rgba(0,0,0,.28); pointer-events: none; }
                .hf-preview-title, .hf-preview-hook, .hf-preview-chip, .hf-preview-price, .hf-sub-line { box-sizing: border-box; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; }
                .hf-preview-overlay-copy { box-sizing: border-box; overflow: hidden; padding-bottom: 18%; animation: hfPreviewOverlayLifetime 3.2s linear both; }
                .hf-preview-copy-top { position: relative; z-index: 1; box-sizing: border-box; min-width: 0; max-width: 100%; }
	                .hf-preview-chip-list { position: relative; z-index: 1; box-sizing: border-box; min-width: 0; max-width: 100%; }
	                .hf-preview-layer-tag { width: fit-content; max-width: 100%; line-height: 1; text-shadow: none; }
	                .hf-preview-layer-tag--subtitle { display: block; margin: 0 auto 6px; border-radius: 999px; background: rgba(255,255,255,.9); padding: 4px 8px; color: #0f172a; font-size: 10px; font-weight: 900; letter-spacing: 0; box-shadow: 0 6px 14px rgba(0,0,0,.18); }
	                .hf-preview-title { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-size: 28px; line-height: 1.08; }
                .hf-preview-hook { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 18px; line-height: 1.18; }
                .hf-preview-price { font-size: 34px; line-height: 1.02; }
                .hf-preview-chip { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 13px; line-height: 1.2; }
	                .hf-preview-stage::before { content: ""; position: absolute; inset: 0; z-index: 1; background: radial-gradient(circle at 18% 18%, rgba(255,255,255,.55), transparent 28%), linear-gradient(135deg, rgba(255,255,255,.85), rgba(226,232,240,.82)); pointer-events: none; animation: hfPreviewOverlayLifetime 3.2s linear both; }
	                .hf-preview-stage[data-has-overlay-copy="false"]::before { background: transparent !important; animation: none !important; }
	                .hf-preview-stage[data-has-media="true"]::before { background: linear-gradient(180deg, rgba(2,6,23,.36), rgba(2,6,23,.18) 44%, rgba(2,6,23,.46)); }
                .hf-preview-stage[data-preset="auto"]::before { background: radial-gradient(circle at 18% 18%, rgba(14,165,233,.26), transparent 30%), radial-gradient(circle at 82% 18%, rgba(250,204,21,.3), transparent 26%), linear-gradient(135deg, #f8fafc, #dbeafe 52%, #fff7ed); }
                .hf-preview-stage[data-preset="premium_product_hero"]::before { background: radial-gradient(circle at 50% 22%, rgba(255,255,255,.72), transparent 32%), linear-gradient(145deg, #fef3c7, #f8fafc 45%, #e2e8f0); }
                .hf-preview-stage[data-preset="hook_sequence"]::before { background: linear-gradient(135deg, #eff6ff 0 58%, #0f172a 59% 100%); }
                .hf-preview-stage[data-preset="kinetic_bold_hook"]::before { background: radial-gradient(circle at 72% 22%, rgba(250,204,21,.34), transparent 30%), linear-gradient(135deg, #111827, #020617 55%, #facc15 56% 100%); }
                .hf-preview-stage[data-preset="creator_top_punch"]::before { background: linear-gradient(180deg, rgba(2,6,23,.2), rgba(2,6,23,.02) 46%, rgba(2,6,23,.42)); }
                .hf-preview-stage[data-preset="ugc_center_stack"]::before { background: linear-gradient(180deg, rgba(2,6,23,.08), rgba(2,6,23,.04) 44%, rgba(2,6,23,.34)); }
                .hf-preview-stage[data-preset="white_intro_card"]::before { background: #f1f5f9; }
                .hf-preview-stage[data-preset="tech_signal_map"]::before { background: radial-gradient(circle at 50% 36%, rgba(34,211,238,.28), transparent 22%), radial-gradient(circle at 24% 70%, rgba(251,146,60,.18), transparent 24%), linear-gradient(180deg, #020617, #0f172a); }
                .hf-preview-stage[data-preset="spec_highlight"]::before { background: linear-gradient(180deg, rgba(2,6,23,.2), rgba(2,6,23,.02) 46%, rgba(2,6,23,.48)); }
                .hf-preview-stage[data-preset="electronics_spec_stack"]::before { background: linear-gradient(90deg, rgba(2,6,23,.08), rgba(2,6,23,.72)); }
                .hf-preview-stage[data-preset="split_product_specs"]::before { background: linear-gradient(90deg, rgba(2,6,23,.78) 0 43%, rgba(2,6,23,.08) 44% 100%); }
                .hf-preview-stage[data-preset="neon_gaming_specs"]::before { background: radial-gradient(circle at 70% 20%, rgba(34,211,238,.28), transparent 30%), linear-gradient(135deg, #020617, #172554 45%, #111827); }
                .hf-preview-stage[data-preset="spec_lines_6_clean"]::before { background: linear-gradient(180deg, rgba(248,250,252,.9), rgba(226,232,240,.78)); }
                .hf-preview-stage[data-preset="spec_lines_10_dark"]::before { background: linear-gradient(90deg, rgba(2,6,23,.88) 0 64%, rgba(2,6,23,.22)); }
                .hf-preview-stage[data-preset="spec_lines_12_light"]::before { background: linear-gradient(180deg, rgba(255,255,255,.72), rgba(241,245,249,.9)); }
                .hf-preview-stage[data-preset="spec_lines_15_neon"]::before { background: radial-gradient(circle at 80% 14%, rgba(34,211,238,.28), transparent 26%), radial-gradient(circle at 18% 76%, rgba(168,85,247,.26), transparent 28%), linear-gradient(180deg, rgba(2,6,23,.9), rgba(15,23,42,.78)); }
                .hf-preview-stage[data-preset="feature_cards"]::before { background: linear-gradient(180deg, rgba(15,23,42,.5), rgba(15,23,42,.24)); }
                .hf-preview-stage[data-preset="badge_cascade"]::before { background: radial-gradient(circle at 18% 18%, rgba(14,165,233,.3), transparent 28%), linear-gradient(180deg, rgba(2,6,23,.5), rgba(2,6,23,.16)); }
                .hf-preview-stage[data-preset="hero_price_billboard"]::before { background: linear-gradient(160deg, #f8fafc 0 48%, #111827 49% 100%); }
                .hf-preview-stage[data-preset="price_impact"]::before { background: radial-gradient(circle at 74% 22%, rgba(250,204,21,.3), transparent 30%), linear-gradient(180deg, rgba(2,6,23,.08), rgba(2,6,23,.42) 48%, rgba(2,6,23,.86)); }
                .hf-preview-stage[data-preset="lower_third_review"]::before { background: linear-gradient(180deg, rgba(15,23,42,.1), rgba(15,23,42,.55)), linear-gradient(135deg, #e0f2fe, #f8fafc); }
                .hf-preview-stage[data-has-media="true"][data-preset="auto"]::before { background: linear-gradient(180deg, rgba(14,165,233,.22), rgba(2,6,23,.2) 48%, rgba(250,204,21,.2)); }
                .hf-preview-stage[data-has-media="true"][data-preset="premium_product_hero"]::before { background: radial-gradient(circle at 50% 18%, rgba(255,255,255,.42), transparent 32%), linear-gradient(180deg, rgba(255,255,255,.18), rgba(15,23,42,.32)); }
                .hf-preview-stage[data-preview-mode="video"]::before { background: transparent !important; animation: none !important; }
                .hf-preview-stage[data-has-media="true"] .hf-preview-overlay-copy { position: absolute !important; inset: 16px !important; z-index: 18 !important; width: auto !important; height: auto !important; min-height: 0 !important; max-width: none !important; margin: 0 !important; transform: none !important; padding: 0 0 18% !important; }
                .hf-preview-stage[data-preview-mode="video"] .hf-preview-overlay-copy { inset: 12% 9% 34% !important; }
                .hf-preview-stage[data-has-media="true"] .hf-preview-copy-top,
                .hf-preview-stage[data-has-media="true"] .hf-preview-chip-list { max-width: 100% !important; margin-left: 0 !important; margin-right: 0 !important; transform: none !important; }
                .hf-preview-stage[data-has-media="true"] .hf-preview-title,
                .hf-preview-stage[data-has-media="true"] .hf-preview-hook,
                .hf-preview-stage[data-has-media="true"] .hf-preview-chip,
                .hf-preview-stage[data-has-media="true"] .hf-preview-price { max-width: 100% !important; transform: none; }
                .hf-preview-stage[data-preview-mode="video"] .hf-preview-overlay-copy,
                .hf-preview-stage[data-preview-mode="video"] .hf-sub-preview-inline,
                .hf-preview-stage[data-preview-mode="video"] .hf-preview-layer-tag { pointer-events: none; }
                .hf-preview-stage[data-has-media="true"][data-preset="hook_sequence"]::before { background: linear-gradient(135deg, rgba(239,246,255,.88) 0 50%, rgba(15,23,42,.28) 51% 100%); }
                .hf-preview-stage[data-has-media="true"][data-preset="kinetic_bold_hook"]::before { background: linear-gradient(90deg, rgba(2,6,23,.9) 0 53%, rgba(2,6,23,.18) 54% 100%), linear-gradient(135deg, transparent 0 53%, rgba(250,204,21,.9) 54% 78%, transparent 79% 100%); }
                .hf-preview-stage[data-has-media="true"][data-preset="creator_top_punch"]::before { background: linear-gradient(180deg, rgba(2,6,23,.2), rgba(2,6,23,.02) 46%, rgba(2,6,23,.42)); }
                .hf-preview-stage[data-has-media="true"][data-preset="ugc_center_stack"]::before { background: linear-gradient(180deg, rgba(2,6,23,.08), rgba(2,6,23,.04) 44%, rgba(2,6,23,.34)); }
                .hf-preview-stage[data-has-media="true"][data-preset="white_intro_card"]::before { background: #f1f5f9; }
                .hf-preview-stage[data-has-media="true"][data-preset="tech_signal_map"]::before { background: radial-gradient(circle at 50% 36%, rgba(34,211,238,.34), transparent 22%), radial-gradient(circle at 24% 70%, rgba(251,146,60,.2), transparent 24%), linear-gradient(180deg, rgba(2,6,23,.9), rgba(15,23,42,.78)); }
                .hf-preview-stage[data-has-media="true"][data-preset="spec_highlight"]::before { background: linear-gradient(180deg, rgba(2,6,23,.2), rgba(2,6,23,.02) 46%, rgba(2,6,23,.48)); }
                .hf-preview-stage[data-has-media="true"][data-preset="electronics_spec_stack"]::before { background: linear-gradient(90deg, rgba(2,6,23,.08), rgba(2,6,23,.74)); }
                .hf-preview-stage[data-has-media="true"][data-preset="split_product_specs"]::before { background: linear-gradient(90deg, rgba(2,6,23,.78) 0 43%, rgba(2,6,23,.08) 44% 100%); }
                .hf-preview-stage[data-has-media="true"][data-preset="neon_gaming_specs"]::before { background: radial-gradient(circle at 70% 20%, rgba(34,211,238,.32), transparent 30%), linear-gradient(180deg, rgba(2,6,23,.72), rgba(23,37,84,.52)); }
                .hf-preview-stage[data-has-media="true"][data-preset="spec_lines_6_clean"]::before { background: linear-gradient(180deg, rgba(248,250,252,.26), rgba(248,250,252,.58)); }
                .hf-preview-stage[data-has-media="true"][data-preset="spec_lines_10_dark"]::before { background: linear-gradient(90deg, rgba(2,6,23,.86) 0 66%, rgba(2,6,23,.28)); }
                .hf-preview-stage[data-has-media="true"][data-preset="spec_lines_12_light"]::before { background: linear-gradient(180deg, rgba(255,255,255,.16), rgba(248,250,252,.78)); }
                .hf-preview-stage[data-has-media="true"][data-preset="spec_lines_15_neon"]::before { background: radial-gradient(circle at 80% 14%, rgba(34,211,238,.24), transparent 26%), radial-gradient(circle at 18% 76%, rgba(168,85,247,.2), transparent 28%), linear-gradient(180deg, rgba(2,6,23,.76), rgba(15,23,42,.6)); }
                .hf-preview-stage[data-has-media="true"][data-preset="feature_cards"]::before { background: linear-gradient(180deg, rgba(15,23,42,.48), rgba(15,23,42,.22)); }
                .hf-preview-stage[data-has-media="true"][data-preset="badge_cascade"]::before { background: radial-gradient(circle at 18% 18%, rgba(14,165,233,.34), transparent 28%), linear-gradient(180deg, rgba(2,6,23,.58), rgba(2,6,23,.14)); }
                .hf-preview-stage[data-has-media="true"][data-preset="hero_price_billboard"]::before { background: linear-gradient(160deg, rgba(248,250,252,.78) 0 44%, rgba(17,24,39,.74) 45% 100%); }
                .hf-preview-stage[data-has-media="true"][data-preset="price_impact"]::before { background: radial-gradient(circle at 76% 26%, rgba(250,204,21,.24), transparent 28%), linear-gradient(180deg, rgba(2,6,23,.04), rgba(2,6,23,.34) 50%, rgba(2,6,23,.82)); }
                .hf-preview-stage[data-has-media="true"][data-preset="lower_third_review"]::before { background: linear-gradient(180deg, rgba(15,23,42,.12), rgba(15,23,42,.64)); }
                .hf-preview-stage[data-preview-mode="video"]::before { background: transparent !important; animation: none !important; }
                .hf-preview-stage[data-preview-mode="video"] .hf-preview-media--interactive { z-index: 8; }
                .hf-preview-stage[data-preview-mode="video"] .hf-preview-overlay-copy { z-index: 24 !important; }
                .hf-preview-stage[data-preview-mode="video"] .hf-preview-overlay-copy--opening-hook {
                  animation: hfPreviewOpeningHookWindow 3s linear forwards !important;
                }
                .hf-preview-stage[data-preview-mode="video"] .hf-preview-overlay-copy--after-hook {
                  opacity: 0;
                  animation: hfPreviewAfterHookWindow 3.05s steps(1, end) forwards !important;
                }
                .hf-preview-stage[data-preview-mode="video"] .hf-sub-preview-inline { z-index: 26 !important; }
                .hf-preview-title { animation: hfPreviewRise .56s cubic-bezier(.2,.9,.2,1) .12s both; }
                .hf-preview-hook { animation: hfPreviewRise .56s cubic-bezier(.2,.9,.2,1) .34s both; }
                .hf-preview-chip { animation: hfPreviewSlide .48s cubic-bezier(.2,.9,.2,1) both; }
                .hf-preview-chip:nth-child(1) { animation-delay: .58s; }
                .hf-preview-chip:nth-child(2) { animation-delay: .76s; }
                .hf-preview-chip:nth-child(3) { animation-delay: .94s; }
                .hf-preview-chip:nth-child(4) { animation-delay: 1.12s; }
                .hf-preview-chip:nth-child(5) { animation-delay: 1.30s; }
                .hf-preview-chip:nth-child(6) { animation-delay: 1.48s; }
                .hf-preview-chip:nth-child(7) { animation-delay: 1.66s; }
                .hf-preview-chip:nth-child(8) { animation-delay: 1.84s; }
                .hf-preview-chip:nth-child(9) { animation-delay: 2.02s; }
                .hf-preview-chip:nth-child(10) { animation-delay: 2.20s; }
                .hf-preview-chip:nth-child(11) { animation-delay: 2.38s; }
                .hf-preview-chip:nth-child(12) { animation-delay: 2.56s; }
                .hf-preview-chip:nth-child(13) { animation-delay: 2.74s; }
                .hf-preview-stage[data-text-motion="slide_right_to_left"] .hf-preview-title,
                .hf-preview-stage[data-text-motion="slide_right_to_left"] .hf-preview-hook,
                .hf-preview-stage[data-text-motion="slide_right_to_left"] .hf-preview-chip { animation-name: hfPreviewSlideRightToLeft; animation-duration: .68s; animation-timing-function: cubic-bezier(.18,.9,.24,1); animation-fill-mode: both; }
                .hf-preview-stage[data-text-motion="slide_left_to_right"] .hf-preview-title,
                .hf-preview-stage[data-text-motion="slide_left_to_right"] .hf-preview-hook,
                .hf-preview-stage[data-text-motion="slide_left_to_right"] .hf-preview-chip { animation-name: hfPreviewSlideLeftToRight; animation-duration: .68s; animation-timing-function: cubic-bezier(.18,.9,.24,1); animation-fill-mode: both; }
                .hf-preview-stage[data-text-motion="pop_scale"] .hf-preview-title,
                .hf-preview-stage[data-text-motion="pop_scale"] .hf-preview-hook,
                .hf-preview-stage[data-text-motion="pop_scale"] .hf-preview-chip { animation-name: hfPreviewPop; animation-duration: .62s; animation-timing-function: cubic-bezier(.18,.9,.24,1); animation-fill-mode: both; }
                .hf-preview-stage[data-text-motion="wipe_reveal"] .hf-preview-title,
                .hf-preview-stage[data-text-motion="wipe_reveal"] .hf-preview-hook,
                .hf-preview-stage[data-text-motion="wipe_reveal"] .hf-preview-chip { animation-name: hfPreviewWipe; animation-duration: .72s; animation-timing-function: cubic-bezier(.22,1,.36,1); animation-fill-mode: both; }
                .hf-preview-stage[data-text-motion="none"] .hf-preview-title,
                .hf-preview-stage[data-text-motion="none"] .hf-preview-hook,
                .hf-preview-stage[data-text-motion="none"] .hf-preview-chip { animation: none !important; opacity: 1; clip-path: none; transform: none; }
                .hf-preview-stage[data-preset="hero_price_billboard"] .hf-preview-price,
                .hf-preview-stage[data-preset="price_impact"] .hf-preview-price { animation: hfPreviewPrice .72s cubic-bezier(.2,.9,.2,1) .42s both; }
                .hf-preview-stage[data-preset="neon_gaming_specs"] .hf-preview-chip { animation-name: hfPreviewPop, hfPreviewGlow; animation-duration: .48s, 1.4s; animation-iteration-count: 1, infinite; }
                .hf-preview-stage[data-preset="auto"] .hf-preview-title { max-width: 72%; border-radius: 18px; background: rgba(255,255,255,.82); padding: 10px 12px; color: #0f172a; }
                .hf-preview-stage[data-preset="auto"] .hf-preview-hook { display: inline-block; border-radius: 999px; background: #0ea5e9; padding: 8px 12px; color: white; }
                .hf-preview-stage[data-preset="auto"] .hf-preview-chip { border: 1px solid rgba(14,165,233,.3); background: rgba(255,255,255,.9); color: #0f172a; }
                .hf-preview-stage[data-preset="premium_product_hero"] .hf-preview-title { margin-inline: auto; max-width: 86%; text-align: center; font-size: 28px; color: #111827; }
                .hf-preview-stage[data-preset="premium_product_hero"] .hf-preview-hook { margin-inline: auto; width: fit-content; border-radius: 999px; background: rgba(255,255,255,.82); padding: 8px 16px; color: #334155; }
                .hf-preview-stage[data-preset="premium_product_hero"] .hf-preview-chip { margin-inline: auto; width: fit-content; background: rgba(15,23,42,.82); color: white; }
                .hf-preview-stage[data-preset="hook_sequence"] .hf-preview-title { max-width: 68%; color: #0f172a; }
                .hf-preview-stage[data-preset="hook_sequence"] .hf-preview-hook { display: inline-block; border-radius: 12px; background: #0f172a; padding: 8px 12px; color: white; }
                .hf-preview-stage[data-preset="hook_sequence"] .hf-preview-chip { width: fit-content; background: #2563eb; color: white; }
                .hf-preview-stage[data-preset="kinetic_bold_hook"] .hf-preview-title { max-width: 96%; font-size: 26px; color: white; text-shadow: 0 3px 0 rgba(0,0,0,.55); }
                .hf-preview-stage[data-preset="kinetic_bold_hook"] .hf-preview-hook { display: inline-block; transform: rotate(-2deg); border-radius: 10px; background: #facc15; padding: 8px 12px; color: #020617; }
                .hf-preview-stage[data-preset="kinetic_bold_hook"] .hf-preview-chip { border-radius: 10px; background: white; color: #020617; transform: rotate(-1deg); }
                .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-overlay-copy { justify-content: flex-start; align-items: center; gap: 4px; padding-bottom: 18%; text-align: center; }
                .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-copy-top { margin-top: 5%; max-width: 92%; }
                .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-title,
                .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-hook,
                .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-chip { display: block; padding: 0; border-radius: 0; background: transparent; font-weight: 950; line-height: 1.02; text-align: center; text-shadow: 0 2px 0 #020617, 0 4px 10px rgba(2,6,23,.66); -webkit-text-stroke: .9px #020617; }
                .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-title { color: #a7f3d0; font-size: 26px; }
                .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-hook { margin-top: 0; color: #fff; font-size: 24px; }
                .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-chip-list { margin-top: 4px !important; margin-left: 0 !important; width: 84% !important; justify-items: center; }
                .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-chip { color: #fff; font-size: 16px; }
                .hf-preview-stage[data-preset="ugc_center_stack"] .hf-preview-overlay-copy { justify-content: center; align-items: center; gap: 0; padding-bottom: 16%; text-align: center; }
                .hf-preview-stage[data-preset="ugc_center_stack"] .hf-preview-copy-top { max-width: 96%; transform: translateY(-6%); }
                .hf-preview-stage[data-preset="ugc_center_stack"] .hf-preview-title,
                .hf-preview-stage[data-preset="ugc_center_stack"] .hf-preview-hook,
                .hf-preview-stage[data-preset="ugc_center_stack"] .hf-preview-chip { display: block; padding: 0; border-radius: 0; background: transparent; color: #f8fafc; font-weight: 950; line-height: 1.02; text-align: center; text-shadow: 0 2px 0 rgba(2,6,23,.9), 0 5px 12px rgba(2,6,23,.48); -webkit-text-stroke: .9px rgba(2,6,23,.9); }
                .hf-preview-stage[data-preset="ugc_center_stack"] .hf-preview-title { font-size: 27px; }
                .hf-preview-stage[data-preset="ugc_center_stack"] .hf-preview-hook { margin-top: 0; color: #fbbf24; font-size: 29px; }
                .hf-preview-stage[data-preset="ugc_center_stack"] .hf-preview-chip-list { display: none; }
                .hf-preview-stage[data-preset="white_intro_card"] .hf-preview-overlay-copy { justify-content: center; align-items: center; gap: 8px; padding-bottom: 0; text-align: center; }
                .hf-preview-stage[data-preset="white_intro_card"] .hf-preview-overlay-copy::before { content: ""; width: 44px; height: 34px; border-radius: 999px; background: radial-gradient(circle at 28% 42%, #2563eb 0 26%, transparent 27%), radial-gradient(circle at 68% 28%, #3b82f6 0 18%, transparent 19%), radial-gradient(circle at 56% 72%, #2563eb 0 18%, transparent 19%); filter: drop-shadow(0 6px 12px rgba(37,99,235,.18)); }
                .hf-preview-stage[data-preset="white_intro_card"] .hf-preview-copy-top { max-width: 86%; }
                .hf-preview-stage[data-preset="white_intro_card"] .hf-preview-title,
                .hf-preview-stage[data-preset="white_intro_card"] .hf-preview-hook,
                .hf-preview-stage[data-preset="white_intro_card"] .hf-preview-chip { display: block; padding: 0; border-radius: 0; background: transparent; color: #111827; font-weight: 900; line-height: 1.04; text-align: center; text-shadow: 0 4px 14px rgba(15,23,42,.14); }
                .hf-preview-stage[data-preset="white_intro_card"] .hf-preview-title { font-size: 26px; }
                .hf-preview-stage[data-preset="white_intro_card"] .hf-preview-hook { color: #334155; font-size: 18px; }
                .hf-preview-stage[data-preset="white_intro_card"] .hf-preview-chip-list { display: none; }
                .hf-preview-stage[data-preset="tech_signal_map"] .hf-preview-overlay-copy { justify-content: flex-start; align-items: stretch; gap: 6px; padding-bottom: 8%; text-align: center; color: #f8fafc; }
                .hf-preview-stage[data-preset="tech_signal_map"] .hf-preview-overlay-copy::before { content: ""; position: absolute; left: 8%; right: 8%; top: 36%; height: 1px; background: linear-gradient(90deg, transparent, rgba(34,211,238,.9), rgba(251,146,60,.9), transparent); box-shadow: 0 0 20px rgba(34,211,238,.42); }
                .hf-preview-stage[data-preset="tech_signal_map"] .hf-preview-copy-top { margin-top: 6%; width: 100%; max-width: 100%; }
                .hf-preview-stage[data-preset="tech_signal_map"] .hf-preview-title,
                .hf-preview-stage[data-preset="tech_signal_map"] .hf-preview-hook {
                  display: block;
                  width: 100%;
                  max-width: 100% !important;
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: clip;
                  -webkit-line-clamp: 1;
                  text-align: center;
                  letter-spacing: 0;
                }
                .hf-preview-stage[data-preset="tech_signal_map"] .hf-preview-title { color: #22d3ee; font-size: clamp(17px, 5.15cqw, 22px); line-height: 1.04; text-shadow: 0 0 16px rgba(34,211,238,.5), 0 2px 0 rgba(2,6,23,.9); }
                .hf-preview-stage[data-preset="tech_signal_map"] .hf-preview-hook { color: #f8fafc; font-size: clamp(14px, 4.2cqw, 18px); line-height: 1.08; text-shadow: 0 0 12px rgba(255,255,255,.26), 0 2px 0 rgba(2,6,23,.9); }
                .hf-preview-stage[data-preset="tech_signal_map"] .hf-preview-chip-list { margin-top: auto !important; margin-left: auto !important; margin-right: auto !important; width: min(78%, 18rem) !important; grid-template-columns: 1fr; }
                .hf-preview-stage[data-preset="tech_signal_map"] .hf-preview-chip { border: 1px solid rgba(34,211,238,.42); border-radius: 12px; background: rgba(2,6,23,.58); color: #cffafe; box-shadow: 0 0 18px rgba(34,211,238,.18); }
                .hf-preview-stage[data-preset="tech_signal_map"] .hf-preview-chip:nth-child(even) { border-color: rgba(251,146,60,.48); color: #fed7aa; box-shadow: 0 0 18px rgba(251,146,60,.18); }
                .hf-preview-stage[data-preset="spec_highlight"] .hf-preview-overlay-copy { justify-content: flex-start; align-items: center; gap: 4px; padding-bottom: 0; text-align: center; }
                .hf-preview-stage[data-preset="spec_highlight"] .hf-preview-copy-top { margin-top: 4%; max-width: 90%; }
                .hf-preview-stage[data-preset="spec_highlight"] .hf-preview-title,
                .hf-preview-stage[data-preset="spec_highlight"] .hf-preview-hook,
                .hf-preview-stage[data-preset="spec_highlight"] .hf-preview-chip { display: block; padding: 0; border-radius: 0; background: transparent; color: #fff; font-weight: 950; line-height: 1.04; text-shadow: 0 2px 0 #020617, 0 4px 10px rgba(2,6,23,.64); -webkit-text-stroke: .9px #020617; }
                .hf-preview-stage[data-preset="spec_highlight"] .hf-preview-title { color: #facc15; font-size: 25px; }
                .hf-preview-stage[data-preset="spec_highlight"] .hf-preview-hook { margin-top: 0; color: #fff; font-size: 23px; }
                .hf-preview-stage[data-preset="spec_highlight"] .hf-preview-chip-list { margin-top: 4px !important; margin-left: 0 !important; width: 86% !important; justify-items: center; }
                .hf-preview-stage[data-preset="spec_highlight"] .hf-preview-chip { font-size: 16px; }
                .hf-preview-stage[data-preset="electronics_spec_stack"] .hf-preview-overlay-copy { align-items: flex-end; justify-content: flex-start; padding-bottom: 0; }
                .hf-preview-stage[data-preset="electronics_spec_stack"] .hf-preview-copy-top,
                .hf-preview-stage[data-preset="electronics_spec_stack"] .hf-preview-chip-list { width: 48%; border: 1px solid rgba(148,163,184,.34); background: rgba(2,6,23,.72); color: #f8fafc; backdrop-filter: blur(8px); }
                .hf-preview-stage[data-preset="electronics_spec_stack"] .hf-preview-copy-top { margin-top: 13%; border-radius: 18px 18px 8px 8px; padding: 12px; }
                .hf-preview-stage[data-preset="electronics_spec_stack"] .hf-preview-chip-list { margin-left: auto !important; margin-top: 4px !important; border-top: 0; border-radius: 8px 8px 18px 18px; padding: 8px; }
                .hf-preview-stage[data-preset="electronics_spec_stack"] .hf-preview-title { color: #38bdf8; font-size: 21px; }
                .hf-preview-stage[data-preset="electronics_spec_stack"] .hf-preview-hook,
                .hf-preview-stage[data-preset="electronics_spec_stack"] .hf-preview-chip { border-radius: 10px; background: rgba(255,255,255,.12); color: #f8fafc; }
                .hf-preview-stage[data-preset="split_product_specs"] .hf-preview-overlay-copy { justify-content: flex-start; padding-bottom: 0; overflow: hidden; }
                .hf-preview-stage[data-preset="split_product_specs"] .hf-preview-copy-top { box-sizing: border-box; margin-top: 12%; width: min(50%, 12rem); max-width: 50%; }
                .hf-preview-stage[data-preset="split_product_specs"] .hf-preview-title,
                .hf-preview-stage[data-preset="split_product_specs"] .hf-preview-hook,
                .hf-preview-stage[data-preset="split_product_specs"] .hf-preview-chip {
                  box-sizing: border-box;
                  display: block;
                  width: 100%;
                  max-width: 100% !important;
                  overflow: hidden;
                  overflow-wrap: anywhere;
                  word-break: break-word;
                  text-wrap: balance;
                  transform: none !important;
                }
                .hf-preview-stage[data-preset="split_product_specs"] .hf-preview-title { border-radius: 0 12px 12px 0; background: #f8fafc; padding: 8px 10px; color: #0f172a; font-size: clamp(13px, 3.6cqw, 18px); line-height: 1.12; }
                .hf-preview-stage[data-preset="split_product_specs"] .hf-preview-hook { margin-top: 6px; border-radius: 999px; background: #facc15; padding: 6px 10px; color: #020617; font-size: clamp(10px, 2.8cqw, 13px); line-height: 1.16; }
                .hf-preview-stage[data-preset="split_product_specs"] .hf-preview-chip-list { margin-left: 0 !important; width: min(50%, 12rem) !important; max-width: 50% !important; }
                .hf-preview-stage[data-preset="split_product_specs"] .hf-preview-chip { border-radius: 999px; background: #facc15; color: #020617; font-size: clamp(10px, 2.8cqw, 13px); line-height: 1.14; }
                .hf-preview-stage[data-preview-mode="video"][data-preset="split_product_specs"] .hf-preview-overlay-copy { inset: 12% 10% 34% !important; }
                .hf-preview-stage[data-preview-mode="video"][data-preset="split_product_specs"] .hf-preview-copy-top,
                .hf-preview-stage[data-preview-mode="video"][data-preset="split_product_specs"] .hf-preview-chip-list { width: 48% !important; max-width: 48% !important; }
                .hf-preview-stage[data-preview-mode="video"][data-preset="split_product_specs"] .hf-preview-title { font-size: clamp(12px, 3.2cqw, 16px); }
                .hf-preview-stage[data-preview-mode="video"][data-preset="split_product_specs"] .hf-preview-hook,
                .hf-preview-stage[data-preview-mode="video"][data-preset="split_product_specs"] .hf-preview-chip { font-size: clamp(9px, 2.45cqw, 12px); }
                .hf-preview-stage[data-preset^="spec_lines_"] .hf-preview-overlay-copy { justify-content: flex-start; gap: 4px; padding-bottom: 0; }
                .hf-preview-stage[data-preset^="spec_lines_"] .hf-preview-copy-top,
                .hf-preview-stage[data-preset^="spec_lines_"] .hf-preview-chip-list { box-sizing: border-box; width: 100% !important; max-width: 100% !important; margin-left: 0 !important; }
                .hf-preview-stage[data-preset^="spec_lines_"] .hf-preview-title,
                .hf-preview-stage[data-preset^="spec_lines_"] .hf-preview-hook,
                .hf-preview-stage[data-preset^="spec_lines_"] .hf-preview-chip { display: block; max-width: 100% !important; overflow: visible; white-space: pre-wrap; overflow-wrap: normal; word-break: keep-all; -webkit-line-clamp: unset; -webkit-box-orient: initial; text-wrap: pretty; }
                .hf-preview-stage[data-preset^="spec_lines_"] .hf-preview-chip-list { grid-template-columns: 1fr !important; gap: 2px !important; }
                .hf-preview-stage[data-preset="spec_lines_6_clean"] .hf-preview-overlay-copy { justify-content: flex-end; padding-bottom: 22%; }
                .hf-preview-stage[data-preset="spec_lines_6_clean"] .hf-preview-title { border-radius: 16px; background: rgba(255,255,255,.94); padding: 10px 12px; color: #0f172a; font-size: 22px; line-height: 1.12; box-shadow: 0 14px 30px rgba(15,23,42,.18); }
                .hf-preview-stage[data-preset="spec_lines_6_clean"] .hf-preview-hook,
                .hf-preview-stage[data-preset="spec_lines_6_clean"] .hf-preview-chip { border-left: 4px solid #0ea5e9; border-radius: 12px; background: rgba(255,255,255,.9); padding: 7px 10px; color: #0f172a; font-size: 13px; line-height: 1.22; }
                .hf-preview-stage[data-preset="spec_lines_10_dark"] .hf-preview-overlay-copy { width: 72%; justify-content: center; padding-bottom: 0; }
                .hf-preview-stage[data-preset="spec_lines_10_dark"] .hf-preview-copy-top,
                .hf-preview-stage[data-preset="spec_lines_10_dark"] .hf-preview-chip-list { border: 1px solid rgba(148,163,184,.24); background: rgba(2,6,23,.72); padding: 10px; color: #f8fafc; backdrop-filter: blur(8px); }
                .hf-preview-stage[data-preset="spec_lines_10_dark"] .hf-preview-copy-top { border-radius: 16px 16px 8px 8px; }
                .hf-preview-stage[data-preset="spec_lines_10_dark"] .hf-preview-chip-list { border-top: 0; border-radius: 8px 8px 16px 16px; }
                .hf-preview-stage[data-preset="spec_lines_10_dark"] .hf-preview-title { color: #38bdf8; font-size: 19px; line-height: 1.12; }
                .hf-preview-stage[data-preset="spec_lines_10_dark"] .hf-preview-hook,
                .hf-preview-stage[data-preset="spec_lines_10_dark"] .hf-preview-chip { border-radius: 9px; background: rgba(255,255,255,.1); padding: 6px 8px; color: #f8fafc; font-size: 10.5px; line-height: 1.2; }
                .hf-preview-stage[data-preset="spec_lines_12_light"] .hf-preview-overlay-copy { justify-content: flex-start; padding-bottom: 0; }
                .hf-preview-stage[data-preset="spec_lines_12_light"] .hf-preview-copy-top,
                .hf-preview-stage[data-preset="spec_lines_12_light"] .hf-preview-chip-list { border-radius: 14px; background: rgba(255,255,255,.86); padding: 9px 11px; color: #0f172a; box-shadow: 0 16px 36px rgba(15,23,42,.16); backdrop-filter: blur(10px); }
                .hf-preview-stage[data-preset="spec_lines_12_light"] .hf-preview-title { color: #111827; font-size: 18px; line-height: 1.08; }
                .hf-preview-stage[data-preset="spec_lines_12_light"] .hf-preview-hook { color: #0369a1; font-size: 12px; line-height: 1.18; }
                .hf-preview-stage[data-preset="spec_lines_12_light"] .hf-preview-chip { border-radius: 0; background: transparent; border-bottom: 1px solid rgba(148,163,184,.32); padding: 4px 0 5px; color: #0f172a; font-size: 9.5px; line-height: 1.16; box-shadow: none; }
                .hf-preview-stage[data-preset="spec_lines_15_neon"] .hf-preview-overlay-copy { justify-content: flex-start; padding-bottom: 0; }
                .hf-preview-stage[data-preset="spec_lines_15_neon"] .hf-preview-copy-top,
                .hf-preview-stage[data-preset="spec_lines_15_neon"] .hf-preview-chip-list { border: 1px solid rgba(34,211,238,.32); background: rgba(2,6,23,.66); padding: 8px 10px; color: #cffafe; box-shadow: 0 0 24px rgba(34,211,238,.16); backdrop-filter: blur(10px); }
                .hf-preview-stage[data-preset="spec_lines_15_neon"] .hf-preview-copy-top { border-radius: 14px 14px 6px 6px; }
                .hf-preview-stage[data-preset="spec_lines_15_neon"] .hf-preview-chip-list { border-top: 0; border-radius: 6px 6px 14px 14px; }
                .hf-preview-stage[data-preset="spec_lines_15_neon"] .hf-preview-title { color: #67e8f9; font-size: 16px; line-height: 1.08; text-shadow: 0 0 14px rgba(34,211,238,.45); }
                .hf-preview-stage[data-preset="spec_lines_15_neon"] .hf-preview-hook { color: #f0abfc; font-size: 10.5px; line-height: 1.14; }
                .hf-preview-stage[data-preset="spec_lines_15_neon"] .hf-preview-chip { border-left: 2px solid rgba(34,211,238,.72); border-radius: 7px; background: rgba(15,23,42,.78); padding: 3px 6px; color: #f8fafc; font-size: 8.4px; line-height: 1.12; box-shadow: none; }
                .hf-preview-stage[data-preset^="spec_lines_"] .hf-preview-copy-top,
                .hf-preview-stage[data-preset^="spec_lines_"] .hf-preview-chip-list {
                  border: 0 !important;
                  background: transparent !important;
                  box-shadow: none !important;
                  backdrop-filter: none !important;
                  padding: 0 !important;
                }
                .hf-preview-stage[data-preset^="spec_lines_"] .hf-preview-hook,
                .hf-preview-stage[data-preset^="spec_lines_"] .hf-preview-chip {
                  border: 0 !important;
                  border-radius: 0 !important;
                  background: transparent !important;
                  box-shadow: none !important;
                  padding: 1px 0 !important;
                  text-shadow: 0 2px 0 rgba(255,255,255,.82), 0 10px 24px rgba(15,23,42,.24);
                }
                .hf-preview-stage[data-preset="spec_lines_6_clean"] .hf-preview-title { color: #0f172a; font-size: 23px; }
                .hf-preview-stage[data-preset="spec_lines_6_clean"] .hf-preview-hook,
                .hf-preview-stage[data-preset="spec_lines_6_clean"] .hf-preview-chip { color: #0f172a; font-size: 14px; line-height: 1.14; }
                .hf-preview-stage[data-preset="spec_lines_10_dark"] .hf-preview-title { color: #67e8f9; font-size: 18px; text-shadow: 0 0 14px rgba(34,211,238,.34), 0 6px 18px rgba(2,6,23,.72); }
                .hf-preview-stage[data-preset="spec_lines_10_dark"] .hf-preview-hook,
                .hf-preview-stage[data-preset="spec_lines_10_dark"] .hf-preview-chip { color: #f8fafc; font-size: 10.5px; line-height: 1.12; text-shadow: 0 2px 0 rgba(2,6,23,.82), 0 8px 18px rgba(2,6,23,.58); }
                .hf-preview-stage[data-preset="spec_lines_12_light"] .hf-preview-copy-top { border-radius: 14px !important; background: rgba(255,255,255,.76) !important; padding: 7px 10px !important; box-shadow: 0 14px 34px rgba(15,23,42,.18) !important; backdrop-filter: blur(8px) !important; }
                .hf-preview-stage[data-preset="spec_lines_12_light"] .hf-preview-title { color: #07111f; font-size: 20px; line-height: 1.08; text-shadow: 0 1px 0 rgba(255,255,255,.92), 0 8px 18px rgba(15,23,42,.18); }
                .hf-preview-stage[data-preset="spec_lines_12_light"] .hf-preview-hook { color: #075985; font-size: 13px; line-height: 1.13; text-shadow: 0 1px 0 rgba(255,255,255,.9), 0 7px 16px rgba(15,23,42,.2); }
                .hf-preview-stage[data-preset="spec_lines_12_light"] .hf-preview-chip { color: #07111f; font-size: 10.8px; font-weight: 900; line-height: 1.12; text-shadow: 0 1px 0 rgba(255,255,255,.95), 0 7px 16px rgba(15,23,42,.28); }
                .hf-preview-stage[data-preset="spec_lines_15_neon"] .hf-preview-copy-top { border-radius: 14px !important; background: rgba(2,6,23,.54) !important; padding: 7px 10px !important; box-shadow: 0 0 22px rgba(34,211,238,.2), 0 14px 32px rgba(2,6,23,.36) !important; backdrop-filter: blur(8px) !important; }
                .hf-preview-stage[data-preset="spec_lines_15_neon"] .hf-preview-title { color: #5eead4; font-size: 18px; line-height: 1.08; text-shadow: 0 0 14px rgba(34,211,238,.7), 0 2px 0 rgba(2,6,23,.95), 0 8px 18px rgba(2,6,23,.72); }
                .hf-preview-stage[data-preset="spec_lines_15_neon"] .hf-preview-hook { color: #fde68a; font-size: 12px; line-height: 1.1; text-shadow: 0 0 10px rgba(251,191,36,.48), 0 2px 0 rgba(2,6,23,.95), 0 8px 18px rgba(2,6,23,.72); }
                .hf-preview-stage[data-preset="spec_lines_15_neon"] .hf-preview-chip { color: #ffffff; font-size: 9.6px; font-weight: 900; line-height: 1.08; text-shadow: 0 0 10px rgba(34,211,238,.5), 0 2px 0 rgba(2,6,23,.95), 0 8px 18px rgba(2,6,23,.78); }
                .hf-preview-stage[data-preset="feature_cards"] .hf-preview-overlay-copy { justify-content: flex-start; gap: 10px; padding-bottom: 0; }
                .hf-preview-stage[data-preset="feature_cards"] .hf-preview-title { border-radius: 14px; background: rgba(2,6,23,.86); padding: 10px 12px; color: #fff; font-size: 22px; }
                .hf-preview-stage[data-preset="feature_cards"] .hf-preview-hook { display: none; }
                .hf-preview-stage[data-preset="feature_cards"] .hf-preview-chip-list { margin-top: 8px !important; width: 100% !important; grid-template-columns: repeat(2, minmax(0, 1fr)); }
                .hf-preview-stage[data-preset="feature_cards"] .hf-preview-chip { min-height: 76px; border-radius: 14px; background: rgba(255,255,255,.92); color: #0f172a; }
                .hf-preview-stage[data-preset="badge_cascade"] .hf-preview-overlay-copy { justify-content: flex-start; padding-bottom: 0; }
                .hf-preview-stage[data-preset="badge_cascade"] .hf-preview-title { margin-top: 12%; width: fit-content; border-radius: 999px; background: rgba(15,23,42,.88); padding: 10px 14px; color: #fff; font-size: 21px; }
                .hf-preview-stage[data-preset="badge_cascade"] .hf-preview-hook { width: fit-content; border-radius: 999px; background: #0ea5e9; padding: 8px 12px; color: #fff; transform: translateX(22px); }
                .hf-preview-stage[data-preset="badge_cascade"] .hf-preview-chip-list { width: 72% !important; margin-left: 44px !important; }
                .hf-preview-stage[data-preset="badge_cascade"] .hf-preview-chip:nth-child(odd) { background: rgba(250,204,21,.94); color: #020617; transform: translateX(18px); }
                .hf-preview-stage[data-preset="lower_third_review"] .hf-preview-overlay-copy { justify-content: flex-end; padding-bottom: 28%; }
                .hf-preview-stage[data-preset="lower_third_review"] .hf-preview-title { border-left: 5px solid #38bdf8; border-radius: 12px; background: rgba(15,23,42,.82); padding: 8px 10px; color: #fff; font-size: 20px; }
                .hf-preview-stage[data-preset="lower_third_review"] .hf-preview-hook { border-radius: 12px 12px 12px 4px; background: rgba(255,255,255,.92); padding: 8px 10px; color: #0f172a; }
                .hf-preview-stage[data-preset="lower_third_review"] .hf-preview-chip-list { display: none; }
                .hf-preview-stage[data-preset="price_impact"] .hf-preview-overlay-copy,
                .hf-preview-stage[data-preset="hero_price_billboard"] .hf-preview-overlay-copy { justify-content: flex-end; padding-bottom: 25%; }
                .hf-preview-stage[data-preset="price_impact"] .hf-preview-copy-top { max-width: 94%; border-left: 5px solid #facc15; border-radius: 16px; background: rgba(2,6,23,.76); padding: 10px 12px; box-shadow: 0 18px 38px rgba(2,6,23,.34); backdrop-filter: blur(8px); }
                .hf-preview-stage[data-preset="price_impact"] .hf-preview-title { color: #f8fafc; font-size: 22px; line-height: 1.08; text-shadow: 0 2px 0 rgba(2,6,23,.88), 0 8px 18px rgba(2,6,23,.58); }
                .hf-preview-stage[data-preset="price_impact"] .hf-preview-price { color: #facc15 !important; font-size: 34px; line-height: .98; text-shadow: 0 2px 0 rgba(2,6,23,.9), 0 0 22px rgba(250,204,21,.42); }
                .hf-preview-stage[data-preset="price_impact"] .hf-preview-chip-list { width: 94% !important; margin-top: 8px !important; margin-left: 0 !important; grid-template-columns: 1fr !important; gap: 6px !important; }
                .hf-preview-stage[data-preset="price_impact"] .hf-preview-chip { border-left: 4px solid rgba(250,204,21,.95); border-radius: 12px; background: rgba(2,6,23,.74); padding: 7px 10px; color: #f8fafc; font-size: 12px; line-height: 1.18; box-shadow: 0 12px 24px rgba(2,6,23,.28); text-shadow: 0 1px 0 rgba(2,6,23,.72); }
                .hf-preview-stage[data-preset="price_impact"] .hf-preview-chip:nth-child(1) { background: rgba(250,204,21,.95); color: #111827; text-shadow: none; }
                .hf-preview-stage--modal { padding: clamp(16px, 3.7cqw, 36px) !important; }
                .hf-preview-stage--modal .hf-preview-overlay-copy { padding: clamp(16px, 3.7cqw, 36px) !important; }
                .hf-preview-stage--modal .hf-preview-layer-tag { font-size: clamp(10px, 2.3cqw, 18px) !important; padding: clamp(4px, .9cqw, 8px) clamp(8px, 1.8cqw, 16px) !important; }
                .hf-preview-stage--modal .hf-preview-title { font-size: clamp(28px, 6.5cqw, 64px) !important; line-height: 1.08 !important; }
                .hf-preview-stage--modal .hf-preview-hook { font-size: clamp(18px, 4.2cqw, 40px) !important; line-height: 1.18 !important; }
                .hf-preview-stage--modal .hf-preview-price { font-size: clamp(34px, 7.8cqw, 76px) !important; }
                .hf-preview-stage--modal .hf-preview-chip { font-size: clamp(13px, 3cqw, 28px) !important; padding: clamp(8px, 1.85cqw, 18px) clamp(12px, 2.8cqw, 26px) !important; }
                .hf-preview-stage--modal .hf-preview-chip-list { gap: clamp(8px, 1.85cqw, 18px) !important; margin-top: clamp(16px, 3.7cqw, 36px) !important; }
                .hf-preview-stage--modal[data-preset^="spec_lines_"] .hf-preview-title { font-size: clamp(18px, 4.2cqw, 46px) !important; line-height: 1.1 !important; }
                .hf-preview-stage--modal[data-preset^="spec_lines_"] .hf-preview-hook { font-size: clamp(12px, 2.7cqw, 28px) !important; line-height: 1.16 !important; }
                .hf-preview-stage--modal[data-preset^="spec_lines_"] .hf-preview-chip { font-size: clamp(10px, 2.1cqw, 22px) !important; line-height: 1.14 !important; padding: clamp(5px, 1cqw, 10px) clamp(8px, 1.6cqw, 16px) !important; }
                .hf-preview-stage--modal[data-preset="spec_lines_6_clean"] .hf-preview-title { font-size: clamp(28px, 5.8cqw, 58px) !important; }
                .hf-preview-stage--modal[data-preset="spec_lines_6_clean"] .hf-preview-hook,
                .hf-preview-stage--modal[data-preset="spec_lines_6_clean"] .hf-preview-chip { font-size: clamp(17px, 3.4cqw, 34px) !important; line-height: 1.14 !important; }
                .hf-preview-stage--modal[data-preset="spec_lines_10_dark"] .hf-preview-title { font-size: clamp(22px, 4.4cqw, 44px) !important; }
                .hf-preview-stage--modal[data-preset="spec_lines_10_dark"] .hf-preview-hook,
                .hf-preview-stage--modal[data-preset="spec_lines_10_dark"] .hf-preview-chip { font-size: clamp(13px, 2.55cqw, 25px) !important; line-height: 1.12 !important; }
                .hf-preview-stage--modal[data-preset="spec_lines_12_light"] .hf-preview-title { font-size: clamp(24px, 4.4cqw, 46px) !important; }
                .hf-preview-stage--modal[data-preset="spec_lines_12_light"] .hf-preview-hook,
                .hf-preview-stage--modal[data-preset="spec_lines_12_light"] .hf-preview-chip { font-size: clamp(14px, 2.45cqw, 26px) !important; line-height: 1.12 !important; }
                .hf-preview-stage--modal[data-preset="spec_lines_15_neon"] .hf-preview-title { font-size: clamp(22px, 3.9cqw, 42px) !important; }
                .hf-preview-stage--modal[data-preset="spec_lines_15_neon"] .hf-preview-hook { font-size: clamp(13px, 2.25cqw, 24px) !important; }
                .hf-preview-stage--modal[data-preset="spec_lines_15_neon"] .hf-preview-hook,
                .hf-preview-stage--modal[data-preset="spec_lines_15_neon"] .hf-preview-chip { font-size: clamp(11px, 1.9cqw, 20px) !important; line-height: 1.08 !important; }
                .hf-preview-stage--modal[data-preset^="spec_lines_"] .hf-preview-hook,
                .hf-preview-stage--modal[data-preset^="spec_lines_"] .hf-preview-chip { padding: 1px 0 !important; }
                .hf-preview-stage--modal .hf-sub-preview-inline .hf-sub-line { line-height: 1.22 !important; }
                .hf-preview-stage--modal .hf-preview-layer-tag--subtitle { margin-bottom: clamp(6px, 1.4cqw, 13px) !important; }
                .hf-preview-stage--thumb .hf-preview-overlay-copy { inset: 6px !important; min-height: 0 !important; padding-bottom: 8% !important; }
                .hf-preview-stage--thumb .hf-preview-copy-top { box-sizing: border-box; max-width: 96% !important; margin-top: 0 !important; transform: none !important; }
                .hf-preview-stage--thumb .hf-preview-title { max-width: 100% !important; font-size: 10px !important; line-height: 1.08 !important; -webkit-line-clamp: 3; }
                .hf-preview-stage--thumb .hf-preview-hook { max-width: 100% !important; font-size: 8.5px !important; line-height: 1.12 !important; transform: none !important; -webkit-line-clamp: 2; }
                .hf-preview-stage--thumb .hf-preview-chip-list { box-sizing: border-box; width: 100% !important; max-width: 100% !important; margin: 0 !important; margin-left: 0 !important; grid-template-columns: 1fr !important; transform: none !important; }
                .hf-preview-stage--thumb .hf-preview-chip { box-sizing: border-box; min-height: 0 !important; width: 100% !important; max-width: 100% !important; font-size: 7.5px !important; line-height: 1.1 !important; padding: 3px 5px !important; transform: none !important; }
                .hf-preview-stage--thumb[data-preset="electronics_spec_stack"] .hf-preview-copy-top,
                .hf-preview-stage--thumb[data-preset="electronics_spec_stack"] .hf-preview-chip-list,
                .hf-preview-stage--thumb[data-preset="split_product_specs"] .hf-preview-copy-top,
                .hf-preview-stage--thumb[data-preset="split_product_specs"] .hf-preview-chip-list,
                .hf-preview-stage--thumb[data-preset="badge_cascade"] .hf-preview-copy-top,
                .hf-preview-stage--thumb[data-preset="badge_cascade"] .hf-preview-chip-list { width: 100% !important; max-width: 100% !important; margin-left: 0 !important; transform: none !important; }
                .hf-preview-stage--thumb[data-preset="split_product_specs"] .hf-preview-hook,
                .hf-preview-stage--thumb[data-preset="badge_cascade"] .hf-preview-hook,
                .hf-preview-stage--thumb[data-preset="badge_cascade"] .hf-preview-chip { transform: none !important; }
                .hf-preview-stage--thumb[data-preset="white_intro_card"] .hf-preview-overlay-copy::before { width: 22px; height: 17px; }
                .hf-preview-stage--thumb[data-preset="white_intro_card"] .hf-preview-chip-list,
                .hf-preview-stage--thumb[data-preset="ugc_center_stack"] .hf-preview-chip-list,
                .hf-preview-stage--thumb[data-preset="clean_subtitle"] .hf-preview-chip-list { display: none !important; }
                .hf-preview-stage--thumb[data-preset="price_impact"] .hf-preview-price,
                .hf-preview-stage--thumb[data-preset="hero_price_billboard"] .hf-preview-price { font-size: 14px !important; line-height: 1.02 !important; }
                .hf-preview-stage[data-has-media="true"][data-subtitle-preset]:not([data-subtitle-preset="no_subtitle_style"]) .hf-preview-overlay-copy {
                  inset: 10% 16px 30% !important;
                  min-height: 0 !important;
                  padding: 0 !important;
                  overflow: hidden !important;
                }
                .hf-preview-stage[data-has-media="true"][data-subtitle-preset="lower_third"] .hf-preview-overlay-copy {
                  bottom: 38% !important;
                }
                .hf-preview-stage[data-has-media="true"][data-subtitle-preset]:not([data-subtitle-preset="no_subtitle_style"]) .hf-preview-copy-top,
                .hf-preview-stage[data-has-media="true"][data-subtitle-preset]:not([data-subtitle-preset="no_subtitle_style"]) .hf-preview-chip-list {
                  box-sizing: border-box !important;
                  max-width: 100% !important;
                  max-height: 100% !important;
                  margin-left: 0 !important;
                  margin-right: 0 !important;
                  transform: none !important;
                  overflow: hidden !important;
                }
                .hf-preview-stage[data-has-media="true"][data-subtitle-preset]:not([data-subtitle-preset="no_subtitle_style"])[data-preset="badge_cascade"] .hf-preview-chip-list {
                  width: calc(100% - 32px) !important;
                  margin-left: 32px !important;
                }
                .hf-preview-stage[data-has-media="true"][data-subtitle-preset]:not([data-subtitle-preset="no_subtitle_style"])[data-preset="feature_cards"] .hf-preview-chip {
                  min-height: 0 !important;
                }
                .hf-preview-stage[data-has-media="true"][data-subtitle-preset]:not([data-subtitle-preset="no_subtitle_style"])[data-preset="price_impact"] .hf-preview-overlay-copy,
                .hf-preview-stage[data-has-media="true"][data-subtitle-preset]:not([data-subtitle-preset="no_subtitle_style"])[data-preset="hero_price_billboard"] .hf-preview-overlay-copy,
                .hf-preview-stage[data-has-media="true"][data-subtitle-preset]:not([data-subtitle-preset="no_subtitle_style"])[data-preset="lower_third_review"] .hf-preview-overlay-copy {
                  bottom: 34% !important;
                }
                .hf-preview-stage--modal[data-has-media="true"][data-subtitle-preset]:not([data-subtitle-preset="no_subtitle_style"]) .hf-preview-overlay-copy {
                  inset: clamp(48px, 12cqw, 120px) clamp(16px, 3.7cqw, 36px) 34% !important;
                }
                .hf-preview-stage--modal[data-has-media="true"][data-subtitle-preset="lower_third"] .hf-preview-overlay-copy {
                  bottom: 38% !important;
                }
                .hf-preview-stage--thumb[data-has-media="true"][data-subtitle-preset]:not([data-subtitle-preset="no_subtitle_style"]) .hf-preview-overlay-copy {
                  inset: 6px 6px 24% !important;
                }
                .hf-preview-stage[data-preview-mode="video"][data-preset="split_product_specs"] .hf-preview-overlay-copy {
                  inset: 12% 10% 34% !important;
                }
                .hf-preview-stage[data-preview-mode="video"][data-preset="split_product_specs"] .hf-preview-copy-top,
                .hf-preview-stage[data-preview-mode="video"][data-preset="split_product_specs"] .hf-preview-chip-list {
                  width: 48% !important;
                  max-width: 48% !important;
                }
                .hf-preview-stage[data-preview-mode="video"] .hf-preview-overlay-copy {
                  inset: 12% 9% 34% !important;
                }
                .hf-preview-stage[data-preview-mode="video"][data-preset="split_product_specs"] .hf-preview-overlay-copy {
                  inset: 12% 10% 34% !important;
                }
                .hf-preview-stage[data-preview-mode="video"][data-preset="split_product_specs"] .hf-preview-copy-top,
                .hf-preview-stage[data-preview-mode="video"][data-preset="split_product_specs"] .hf-preview-chip-list {
                  width: 46% !important;
                  max-width: 46% !important;
                }
                .hf-preview-stage[data-preview-mode="video"] .hf-preview-overlay-copy {
                  inset: auto !important;
                  left: var(--hf-video-overlay-left, 9%) !important;
                  top: var(--hf-video-overlay-top, 12.5%) !important;
                  right: auto !important;
                  bottom: auto !important;
                  width: var(--hf-video-overlay-width, 82%) !important;
                  height: var(--hf-video-overlay-height, 52%) !important;
                  min-height: 0 !important;
                  max-height: var(--hf-video-overlay-height, 52%) !important;
                  padding: 0 !important;
                  overflow: hidden !important;
                }
                .hf-preview-stage[data-preview-mode="video"][data-preset="split_product_specs"] .hf-preview-copy-top,
                .hf-preview-stage[data-preview-mode="video"][data-preset="split_product_specs"] .hf-preview-chip-list {
                  width: min(46%, 12rem) !important;
                  max-width: 46% !important;
                }
                .hf-preview-stage[data-preview-mode="video"] .hf-preview-video-playback-status {
                  left: var(--hf-video-status-left, .75rem) !important;
                  top: var(--hf-video-status-top, .75rem) !important;
                  right: auto !important;
                  width: var(--hf-video-status-width, calc(100% - 1.5rem)) !important;
                  max-width: var(--hf-video-status-width, calc(100% - 1.5rem)) !important;
                }
                .hf-preview-stage[data-preview-mode="video"] .hf-sub-preview-inline {
                  left: var(--hf-video-subtitle-left, 7%) !important;
                  right: auto !important;
                  bottom: var(--hf-video-subtitle-bottom, 32%) !important;
                  width: var(--hf-video-subtitle-width, 86%) !important;
                  max-width: var(--hf-video-subtitle-width, 86%) !important;
                }
                .hf-sub-preview { min-height: 198px; position: relative; overflow: hidden; }
                .hf-sub-preview .hf-preview-media { opacity: .68; }
                .hf-sub-preview-inline { position: absolute; left: 7%; right: 7%; bottom: 18%; z-index: 20; display: flex; justify-content: center; text-align: center; pointer-events: none; }
                .hf-sub-line { animation: hfPreviewRise .52s cubic-bezier(.2,.9,.2,1) both; }
                .hf-sub-preview-inline .hf-sub-line { box-sizing: border-box; max-width: 100%; font-size: 15px; font-weight: 800; line-height: 1.22; }
                .hf-preview-stage--large .hf-sub-preview-inline .hf-sub-line { font-size: 18px; }
                .hf-sub-preview[data-subtitle-preset="classic_box"] .hf-sub-line,
                .hf-sub-preview-inline[data-subtitle-preset="classic_box"] .hf-sub-line { border-radius: 10px; background: rgba(0,0,0,.76); padding: 10px 14px; color: #fff; }
                .hf-sub-preview[data-subtitle-preset="minimal_shadow"] .hf-sub-line,
                .hf-sub-preview-inline[data-subtitle-preset="minimal_shadow"] .hf-sub-line { background: transparent; color: #fff; text-shadow: 0 3px 8px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,.9); }
                .hf-sub-preview[data-subtitle-preset="creator_pop"] .hf-sub-line,
                .hf-sub-preview-inline[data-subtitle-preset="creator_pop"] .hf-sub-line { border-radius: 999px; background: #fff; padding: 10px 16px; color: #020617; box-shadow: 0 10px 24px rgba(0,0,0,.28); animation-name: hfPreviewPop; }
                .hf-sub-preview[data-subtitle-preset="karaoke_word"] .hf-sub-word,
                .hf-sub-preview-inline[data-subtitle-preset="karaoke_word"] .hf-sub-word { display: inline-block; margin: 0 2px 4px; border-radius: 8px; padding: 2px 6px; animation: hfPreviewPop .42s cubic-bezier(.2,.9,.2,1) both; }
                .hf-sub-preview[data-subtitle-preset="karaoke_word"] .hf-sub-word:nth-child(odd),
                .hf-sub-preview-inline[data-subtitle-preset="karaoke_word"] .hf-sub-word:nth-child(odd) { background: #facc15; color: #020617; }
                .hf-sub-preview[data-subtitle-preset="karaoke_word"] .hf-sub-word:nth-child(even),
                .hf-sub-preview-inline[data-subtitle-preset="karaoke_word"] .hf-sub-word:nth-child(even) { color: #fff; }
                .hf-sub-preview[data-subtitle-preset="highlight_bar"] .hf-sub-line,
                .hf-sub-preview-inline[data-subtitle-preset="highlight_bar"] .hf-sub-line { background: linear-gradient(transparent 52%, rgba(250,204,21,.82) 52%); color: #fff; text-shadow: 0 3px 8px rgba(0,0,0,.9); }
                .hf-sub-preview[data-subtitle-preset="lower_third"] .hf-sub-line,
                .hf-sub-preview-inline[data-subtitle-preset="lower_third"] .hf-sub-line { width: 100%; border-left: 5px solid #38bdf8; background: rgba(15,23,42,.82); padding: 12px 16px; text-align: left; color: #fff; }
                .hf-sub-preview[data-subtitle-preset="cinematic_wide"] .hf-sub-line,
                .hf-sub-preview-inline[data-subtitle-preset="cinematic_wide"] .hf-sub-line { width: 100%; background: rgba(0,0,0,.58); padding: 12px 20px; color: #f8fafc; }
                .hf-sub-preview[data-subtitle-preset="neon_glow"] .hf-sub-line,
                .hf-sub-preview-inline[data-subtitle-preset="neon_glow"] .hf-sub-line { border: 1px solid rgba(34,211,238,.55); border-radius: 12px; background: rgba(2,6,23,.72); padding: 10px 14px; color: #cffafe; box-shadow: 0 0 28px rgba(34,211,238,.32); }
                .hf-sub-preview[data-subtitle-preset="review_bubble"] .hf-sub-line,
                .hf-sub-preview-inline[data-subtitle-preset="review_bubble"] .hf-sub-line { border-radius: 18px 18px 18px 4px; background: #fff; padding: 12px 16px; color: #0f172a; box-shadow: 0 10px 24px rgba(0,0,0,.24); }
                .hf-sub-preview[data-subtitle-preset="no_subtitle_style"] .hf-sub-line,
                .hf-sub-preview-inline[data-subtitle-preset="no_subtitle_style"] .hf-sub-line { display: none; }
              `}</style>
	              <div className="flex flex-wrap items-center justify-between gap-2">
	                <div>
	                  <p className="text-xs font-semibold">
	                    {locale === "th" ? "Preview ข้อความก่อน Render" : "Text preview before render"}
	                  </p>
	                  <p className="text-[11px] text-slate-300">
	                    {locale === "th" ? "ใช้ข้อความชุดเดียวกับที่จะส่งเข้า renderer จริง" : "Uses the same copy that will be sent to the renderer."}
	                  </p>
	                </div>
	                <div className="flex flex-wrap gap-2">
	                  <Button
	                    type="button"
	                    size="sm"
	                    variant="outline"
	                    className="h-8 border-white/20 bg-white/10 text-white hover:bg-white/20"
	                    onClick={() => {
	                      setIsHyperframesFinalTextPreviewExpanded(true);
	                      setHyperframesFinalTextPreviewReplayKey(current => current + 1);
	                    }}
	                  >
	                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
	                    {locale === "th" ? "Replay" : "Replay"}
	                  </Button>
	                  <Button
	                    type="button"
	                    size="sm"
	                    variant="outline"
	                    className="h-8 border-white/20 bg-white/10 text-white hover:bg-white/20"
	                    onClick={() => setIsHyperframesFinalTextPreviewExpanded(current => !current)}
	                  >
	                    <ChevronDown
	                      className={cn(
	                        "mr-2 h-3.5 w-3.5 transition-transform",
	                        isHyperframesFinalTextPreviewExpanded ? "rotate-180" : ""
	                      )}
	                    />
	                    {isHyperframesFinalTextPreviewExpanded
	                      ? locale === "th" ? "ยุบ preview" : "Collapse preview"
	                      : locale === "th" ? "เปิด preview" : "Show preview"}
	                  </Button>
	                  <Button
	                    type="button"
	                    size="sm"
	                    variant="outline"
	                    className="h-8 border-white/20 bg-white/10 text-white hover:bg-white/20"
	                    onClick={() => setHyperframesFinalShotTextById({})}
	                  >
	                    {locale === "th" ? "เติมจาก preset อีกครั้ง" : "Refill from preset"}
	                  </Button>
	                </div>
	              </div>
	              {isHyperframesFinalTextPreviewExpanded ? (
	                <div
	                  key={`hyperframes-final-text-preview-${hyperframesFinalPreviewShotIndex}-${hyperframesFinalTextPreviewReplayKey}`}
	                  className="mt-3 grid gap-3 md:grid-cols-[1.1fr_0.9fr]"
	                >
                {(() => {
                  const selectedPreviewClip = hyperframesFinalSourceClips[hyperframesFinalPreviewShotIndex] ?? hyperframesFinalSourceClips[0];
                  const selectedPreviewIndex = selectedPreviewClip
                    ? Math.max(0, hyperframesFinalSourceClips.findIndex(clip => clip.id === selectedPreviewClip.id))
                    : 0;
                  const selectedResolvedPreviewShot = hyperframesFinalResolvedPromptShots[selectedPreviewIndex];
                  const previewPreset = selectedPreviewClip
                    ? selectedResolvedPreviewShot?.overlayPreset ?? hyperframesFinalShotOverlayPresetById[selectedPreviewClip.id] ?? resolvedHyperframesFinalOverlayPreset
                    : resolvedHyperframesFinalOverlayPreset;
                  const previewTextMotion = selectedPreviewClip
                    ? selectedResolvedPreviewShot?.textMotionPreset ?? hyperframesFinalShotTextMotionById[selectedPreviewClip.id] ?? defaultHyperframesFinalTextMotionPreset(selectedPreviewIndex)
                    : hyperframesFinalTextMotionPreset;
                  const presetMeta = getHyperframesOverlayPresetMeta(previewPreset);
                  const previewLineLimit = getHyperframesOverlayLineLimit(previewPreset);
	                  const selectedShotOverlay = selectedPreviewClip
	                    ? hyperframesFinalOverlayEditingById[selectedPreviewClip.id]
	                      ? hyperframesFinalOverlayDraftById[selectedPreviewClip.id] ??
	                        (hyperframesFinalShotTextById[selectedPreviewClip.id] ?? selectedResolvedPreviewShot?.overlayText ?? defaultHyperframesShotText(selectedPreviewClip, selectedPreviewIndex))
	                      : selectedResolvedPreviewShot?.overlayText ?? hyperframesFinalShotTextById[selectedPreviewClip.id] ?? defaultHyperframesShotText(selectedPreviewClip, selectedPreviewIndex)
	                    : "";
                  const selectedSubtitle = selectedPreviewClip
                    ? hyperframesFinalSubtitleById[selectedPreviewClip.id] ?? defaultHyperframesSubtitleText(selectedPreviewClip)
                    : "";
                  const selectedPreviewPosterUrl = getStoryboardClipPosterUrl(selectedPreviewClip);
	                  const previewLines = resolveHyperframesFinalPreviewOverlayLines({
	                    textMode: hyperframesFinalTextMode,
	                    shotIndex: selectedPreviewIndex,
	                    overlayPreset: previewPreset,
	                    overlayText: selectedShotOverlay,
		                    hookText: hyperframesFinalPreviewHookText,
	                    supportingText: hyperframesFinalPreviewSupportingText,
	                    maxLines: previewLineLimit,
	                    maxLength: 42,
	                    preferOpeningHook: selectedPreviewIndex === 0,
	                  });
		                  const hasPreviewOverlayLayer = previewLines.length > 0;
		                  const previewLayerLabel = getHyperframesFinalPreviewLayerLabel({
		                    locale,
		                    textMode: hyperframesFinalTextMode,
		                    shotIndex: selectedPreviewIndex,
		                    preferOpeningHook: selectedPreviewIndex === 0,
		                  });
		                  const title = formatHyperframesPreviewLineForPreset(previewLines[0] ?? "", previewPreset, 34, { ellipsis: false });
	                  const hook = formatHyperframesPreviewLineForPreset(previewLines[1] ?? "", previewPreset, 38, { ellipsis: false });
                  const chips = previewLines
                    .slice(2)
                    .map(line => formatHyperframesPreviewLineForPreset(line, previewPreset, 32, { ellipsis: false }))
                    .filter(Boolean);
                  const priceText = firstThaiProductLine(
                    chips.find(line => /(?:฿|บาท|ราคา|เริ่มต้น|ผ่อน|%|\d)/i.test(line)) ?? hook,
                    24,
                    { ellipsis: false },
                  );
                  return (
                    <div
                      className={cn(
                        "hf-preview-stage relative aspect-[9/16] min-h-[320px] max-h-[520px] w-full max-w-[22rem] overflow-hidden rounded-md bg-slate-900 p-4 text-slate-950",
                        previewPreset === "neon_gaming_specs" ||
                          previewPreset === "kinetic_bold_hook" ||
                          previewPreset === "ugc_center_stack"
                          ? "text-white"
                          : "",
                      )}
	                      data-preset={previewPreset}
	                      data-text-motion={previewTextMotion}
	                      data-has-media={selectedPreviewClip?.url ? "true" : "false"}
	                      data-has-overlay-copy={hasPreviewOverlayLayer ? "true" : "false"}
                        data-subtitle-preset={hyperframesFinalSubtitlePreset}
	                    >
                      {selectedPreviewClip?.url ? (
                        <video
                          key={`hf-preview-media-${selectedPreviewClip.id}`}
                          src={selectedPreviewClip.url}
                          poster={selectedPreviewPosterUrl}
                          muted
                          playsInline
                          preload="auto"
                          className="hf-preview-media"
                          aria-hidden="true"
                        />
                      ) : null}
		                      {hasPreviewOverlayLayer ? (
		                        <div className="hf-preview-overlay-copy relative z-10 flex h-full min-h-[198px] flex-col justify-between">
		                          <div>
		                            <div className="hf-preview-layer-tag mb-2 inline-flex rounded-full bg-white/90 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-900 shadow-sm">
		                              {previewLayerLabel}
		                            </div>
		                            <div className={cn(
	                              "hf-preview-title max-w-[92%] font-black",
	                              previewPreset === "neon_gaming_specs" ? "text-cyan-100" : "",
	                            )}>
	                              {title}
	                            </div>
	                            {presetMeta.kind === "price" ? (
	                              <div className="hf-preview-price mt-2 font-black text-yellow-400 drop-shadow">
	                                {priceText}
	                              </div>
	                            ) : hook ? (
	                              <div className={cn(
	                                "hf-preview-hook mt-2 font-extrabold",
	                                previewPreset === "neon_gaming_specs" ? "text-fuchsia-200" : "",
	                              )}>
	                                {hook}
	                              </div>
	                            ) : null}
	                          </div>
		                          {presetMeta.kind !== "clean" && chips.length > 0 ? (
	                            <div className={cn(
	                              "mt-4 grid gap-2",
	                              presetMeta.kind === "spec" ? "ml-auto w-[58%]" : "w-full",
	                              presetMeta.kind === "cards" ? "grid-cols-2" : "",
	                            )}>
		                              {chips.filter(Boolean).slice(0, Math.max(0, previewLineLimit - 2)).map((line, index) => (
	                                <div
	                                  key={`${line}-${index}`}
	                                  className={cn(
	                                    "hf-preview-chip rounded-full px-3 py-2 font-black shadow-sm",
	                                    previewPreset === "neon_gaming_specs"
	                                      ? "border border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
	                                      : presetMeta.kind === "price"
	                                        ? "bg-white text-slate-950"
	                                        : "bg-white/85 text-slate-950",
	                                  )}
	                                >
	                                  {line}
	                                </div>
	                              ))}
	                            </div>
	                          ) : null}
	                        </div>
	                      ) : null}
                    </div>
                  );
                })()}
                {(() => {
                  const subtitlePreviewClip = hyperframesFinalSourceClips[hyperframesFinalPreviewShotIndex] ?? hyperframesFinalSourceClips[0];
                  const subtitlePreviewIndex = subtitlePreviewClip
                    ? Math.max(0, hyperframesFinalSourceClips.findIndex(clip => clip.id === subtitlePreviewClip.id))
                    : 0;
                  const subtitlePreviewPosterUrl = getStoryboardClipPosterUrl(subtitlePreviewClip);
	                  const subtitleText = subtitlePreviewClip
	                    ? hyperframesFinalSubtitleById[subtitlePreviewClip.id] ?? defaultHyperframesSubtitleText(subtitlePreviewClip)
	                    : locale === "th" ? "ยังไม่มี shot ที่พร้อม" : "No ready shot";
	                  const line = subtitlePreviewClip
	                    ? getHyperframesSubtitlePreviewText(
	                      subtitleText,
	                      getHyperframesFinalClipDurationSec(subtitlePreviewClip),
	                      0,
	                    )
	                    : compactStoryboardText(subtitleText);
	                  const subtitlePreviewFontSize = hyperframesPreviewSubtitleFontSize(hyperframesFinalSubtitleFontSizePx);
                  return (
                    <div
                      className="hf-sub-preview flex items-end rounded-md bg-black p-4"
                      data-subtitle-preset={hyperframesFinalSubtitlePreset}
                    >
                      {subtitlePreviewClip?.url ? (
                        <video
                          key={`hf-sub-preview-media-${subtitlePreviewClip.id}`}
                          src={subtitlePreviewClip.url}
                          poster={subtitlePreviewPosterUrl}
                          muted
                          playsInline
                          preload="auto"
                          className="hf-preview-media"
                          aria-hidden="true"
                        />
                      ) : null}
                      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/25 via-slate-950/10 to-slate-950/70" />
                      <p className="relative z-10 text-[11px] font-semibold text-slate-100">
                        {locale === "th"
                          ? `Subtitle / Voiceover shot ${subtitlePreviewIndex + 1}`
                          : `Shot ${subtitlePreviewIndex + 1} subtitle / voiceover`}
                      </p>
	                      <div className="absolute inset-x-4 bottom-5 z-10 flex justify-center text-center text-sm font-bold leading-relaxed">
	                        {hyperframesFinalSubtitlePreset === "karaoke_word" ? (
	                          <div className="hf-sub-line max-w-[92%]" style={{ fontSize: subtitlePreviewFontSize }}>
	                            {line.split(/\s+/).filter(Boolean).map((word, index) => (
	                              <span
                                key={`${word}-${index}`}
                                className="hf-sub-word"
                                style={{ animationDelay: `${index * 0.11}s` }}
                              >
                                {word}
                              </span>
	                            ))}
	                          </div>
	                        ) : (
	                          <div className="hf-sub-line max-w-[92%]" style={{ fontSize: subtitlePreviewFontSize }}>
	                            {line}
	                          </div>
	                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
              ) : (
                <p className="mt-2 text-[11px] text-slate-400">
                  {locale === "th"
                    ? "ยุบไว้เพื่อลดพื้นที่ เปิดดูเมื่อต้องตรวจ layout overlay/subtitle ก่อนส่ง render"
                    : "Collapsed to save space. Expand when checking overlay/subtitle layout before render."}
                </p>
              )}
            </div>
            {hyperframesFinalSourceClips.length > 0 ? (
              <div className="mt-3 rounded-lg border bg-slate-50 p-3 text-xs text-slate-700">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-950">
                    {locale === "th" ? "Shot configuration summary" : "Shot configuration summary"}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 bg-white"
                    onClick={() => {
                      const modalClip =
                        hyperframesFinalSourceClips[hyperframesFinalPreviewShotIndex] ??
                        hyperframesFinalSourceClips[0]!;
                      const modalIndex = Math.max(0, hyperframesFinalSourceClips.findIndex(clip => clip.id === modalClip.id));
                      const modalResolvedShot = hyperframesFinalResolvedPromptShots[modalIndex];
                      const modalOverlayPreset = modalResolvedShot?.overlayPreset ?? hyperframesFinalShotOverlayPresetById[modalClip.id] ?? resolvedHyperframesFinalOverlayPreset;
                      const modalPreviewLineLimit = getHyperframesOverlayLineLimit(modalOverlayPreset);
                      const modalPresetMeta = getHyperframesOverlayPresetMeta(modalOverlayPreset);
                      const modalTextMotion = modalResolvedShot?.textMotionPreset ?? hyperframesFinalShotTextMotionById[modalClip.id] ?? defaultHyperframesFinalTextMotionPreset(modalIndex);
	                      const modalSavedOverlayText = hyperframesFinalShotTextById[modalClip.id] ?? modalResolvedShot?.overlayText ?? defaultHyperframesShotText(modalClip, modalIndex);
	                      const modalOverlayText = hyperframesFinalOverlayEditingById[modalClip.id]
	                        ? hyperframesFinalOverlayDraftById[modalClip.id] ?? modalSavedOverlayText
	                        : modalResolvedShot?.overlayText ?? modalSavedOverlayText;
                      const modalSubtitleText = hyperframesFinalSubtitleById[modalClip.id] ?? defaultHyperframesSubtitleText(modalClip);
                      const modalPreviewLines = resolveHyperframesFinalPreviewOverlayLines({
                        textMode: hyperframesFinalTextMode,
                        shotIndex: modalIndex,
                        overlayPreset: modalOverlayPreset,
                        overlayText: modalOverlayText,
                        hookText: hyperframesFinalPreviewHookText,
                        supportingText: hyperframesFinalPreviewSupportingText,
                        maxLines: modalPreviewLineLimit,
                        maxLength: 42,
                        preferOpeningHook: modalIndex === 0,
                      });
                      const modalPreviewTitle = formatHyperframesPreviewLineForPreset(modalPreviewLines[0] ?? "", modalOverlayPreset, 34, { ellipsis: false });
                      const modalPreviewHook = formatHyperframesPreviewLineForPreset(modalPreviewLines[1] ?? "", modalOverlayPreset, 38, { ellipsis: false });
                      const modalPreviewChips = modalPreviewLines
                        .slice(2)
                        .map(line => formatHyperframesPreviewLineForPreset(line, modalOverlayPreset, 32, { ellipsis: false }))
                        .filter(Boolean);
                      const modalPriceText = firstThaiProductLine(
                        modalPreviewChips.find(line => /(?:฿|บาท|ราคา|เริ่มต้น|ผ่อน|%|\d)/i.test(line)) ?? modalPreviewHook,
                        24,
                        { ellipsis: false },
                      );
                      const modalLayerLabel = getHyperframesFinalPreviewLayerLabel({
                        locale,
                        textMode: hyperframesFinalTextMode,
                        shotIndex: modalIndex,
                        preferOpeningHook: modalIndex === 0,
                      });
                      setVideoPreview({
                        url: modalClip.url,
                        title: `Shot ${modalIndex + 1}`,
                        overlayPreview: {
                          posterUrl: getStoryboardClipPosterUrl(modalClip),
                          overlayPreset: modalOverlayPreset,
                          textMotionPreset: modalTextMotion,
                          subtitlePreset: hyperframesFinalSubtitlePreset,
                          subtitleFontSizePx: hyperframesPreviewSubtitleFontSize(hyperframesFinalSubtitleFontSizePx),
                          layerLabel: modalLayerLabel,
                          titleText: modalPreviewTitle,
                          hookText: modalPresetMeta.kind === "price" ? "" : modalPreviewHook,
                          priceText: modalPresetMeta.kind === "price" ? modalPriceText : "",
                          chips: modalPreviewChips,
                          subtitleText: hyperframesFinalBurnInSubtitles ? compactStoryboardText(modalSubtitleText) : "",
                          presetKind: modalPresetMeta.kind,
                        },
                      });
                    }}
                  >
                    <Maximize2 className="mr-2 h-3.5 w-3.5" />
                    {locale === "th" ? "ดูวิดีโอ shot ที่เลือก" : "Preview selected video"}
                  </Button>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {hyperframesFinalSourceClips.slice(0, 12).map((clip, index) => {
                    const resolvedShot = hyperframesFinalResolvedPromptShots[index];
                    const overlay = resolvedShot?.overlayText ?? hyperframesFinalShotTextById[clip.id] ?? defaultHyperframesShotText(clip, index);
                    const subtitle = hyperframesFinalSubtitleById[clip.id] ?? defaultHyperframesSubtitleText(clip);
                    const subtitlePreviewText = getHyperframesSubtitlePreviewText(
                      subtitle,
                      getHyperframesFinalClipDurationSec(clip),
                      0,
                    );
                    const style = resolvedShot?.overlayPreset ?? hyperframesFinalShotOverlayPresetById[clip.id] ?? resolvedHyperframesFinalOverlayPreset;
                    const motion = resolvedShot?.textMotionPreset ?? hyperframesFinalShotTextMotionById[clip.id] ?? defaultHyperframesFinalTextMotionPreset(index);
                    return (
                      <button
                        key={clip.id}
                        type="button"
                        onClick={() => setHyperframesFinalPreviewShotIndex(index)}
                        className={cn(
                          "rounded-md border px-3 py-2 text-left",
                          index === hyperframesFinalPreviewShotIndex
                            ? "border-sky-300 bg-white text-sky-950"
                            : "border-slate-200 bg-white/70 text-slate-700 hover:bg-white",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">Shot {index + 1}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">
                            {style}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[11px]">{overlay || firstThaiProductLine(subtitlePreviewText, 80)}</p>
                        <p className="mt-1 truncate text-[10px] text-sky-700">{motion}</p>
                        <p className="mt-1 truncate text-[10px] text-slate-500">{clip.url}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {hyperframesFinalSourceClips.length === 0 ? (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {hyperframesFinalMissingVideoDetail || hyperframesFinalMissingVideoTitle}
              </p>
            ) : null}
              </div>
            ) : (
              <p className="sr-only">
                {locale === "th"
                  ? "ย่อไว้เพื่อลดพื้นที่ กดตั้งค่าเพื่อแก้ Hook, ข้อความบนจอ, subtitle และฟอนต์ไทย"
                  : "Collapsed to save space. Open settings to edit hook text, on-screen text, subtitles, and Thai font."}
              </p>
            )}
          </div>
        </div>
      ) : null}

      <main
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-visible p-2 xl:overflow-y-auto",
          !isHyperframesFinalPanelExpanded ? "xl:overflow-hidden" : "",
          isProjectSidebarCollapsed
            ? "xl:grid-cols-[3.25rem_minmax(0,1fr)_auto] xl:grid-rows-none"
            : "xl:grid-cols-[18rem_minmax(0,1fr)_auto] xl:grid-rows-none 2xl:grid-cols-[20rem_minmax(0,1fr)_auto]",
        )}
      >
        <aside
          className={cn(
            "flex flex-col overflow-hidden rounded-lg border bg-white xl:order-none xl:col-span-1 xl:h-full xl:min-h-0 xl:max-h-none",
            activeDraft
              ? "min-h-[12rem] max-h-[min(36rem,76dvh)]"
              : "h-[min(58rem,calc(100dvh-7rem))] min-h-[min(42rem,calc(100dvh-7rem))] max-h-[min(58rem,calc(100dvh-7rem))]",
            activeDraft ? "order-3" : "order-1",
            isProjectSidebarCollapsed ? "min-h-0" : "",
          )}
        >
          {isProjectSidebarCollapsed ? (
            <div className="flex h-full min-h-[3rem] items-center justify-between gap-2 p-2 xl:min-h-0 xl:flex-col">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0"
                onClick={() => setIsProjectSidebarCollapsed(false)}
                aria-label={locale === "th" ? "เปิด panel โปรเจกต์" : "Open project panel"}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-600 xl:[writing-mode:vertical-rl]">
                {t("mediaStudio.storyboardReviewProjects")}
              </div>
              <Badge variant="secondary" className="shrink-0 xl:[writing-mode:vertical-rl]">
                {t("mediaStudio.storyboardReviewReadyBadge", { completed: completedCount, total: tasks.length })}
              </Badge>
            </div>
          ) : (
            <>
              <div className="border-b p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-slate-950">{t("mediaStudio.storyboardReviewProjects")}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {t("mediaStudio.storyboardReviewSavedReviews", { count: reviewProjectsData?.total ?? 0 })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setIsProjectSidebarCollapsed(true)}
                    aria-label={locale === "th" ? "ยุบ panel โปรเจกต์" : "Collapse project panel"}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Badge variant="secondary">{t("mediaStudio.storyboardReviewReadyBadge", { completed: completedCount, total: tasks.length })}</Badge>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={createManualStoryboardReviewProject}
                    disabled={isCreatingManualReviewProject}
                  >
                    {isCreatingManualReviewProject ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {locale === "th" ? "New Project" : "New Project"}
                  </Button>
                </div>
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={projectSearchQuery}
                    onChange={(event) => setProjectSearchQuery(event.target.value)}
                    placeholder={locale === "th" ? "ค้นหา project ด้วยชื่อ..." : "Search projects by name..."}
                    className="h-9 bg-white pl-9"
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 basis-0 overflow-y-auto overscroll-contain pr-1">
                <div className="space-y-2 p-3 pr-2">
                  {filteredReviewProjects.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-slate-500">
                      {projectSearchQuery.trim()
                        ? (locale === "th" ? "ไม่พบ project ที่ตรงกับคำค้นหา" : "No projects match this search.")
                        : t("mediaStudio.storyboardReviewProjectsEmpty")}
                    </div>
                  ) : (
                    filteredReviewProjects.map((item: any) => {
                      const thumbnailUrl = getStoryboardReviewProjectThumbnail(item);
                      const showVideoThumbnail = thumbnailUrl ? isProbablyVideoUrl(thumbnailUrl) : false;
                      const showImageThumbnail = thumbnailUrl ? isProbablyImageUrl(thumbnailUrl) || !showVideoThumbnail : false;
                      const openReviewProject = () => {
                        const nextReviewId = Number(item.id);
                        if (!Number.isFinite(nextReviewId) || nextReviewId <= 0) {
                          emitStoryboardReviewClientDebug("route.openProjectInvalidId", {
                            itemId: item.id ?? null,
                          });
                          return;
                        }
                        emitStoryboardReviewClientDebug("route.openProjectClick", {
                          nextReviewId,
                          previousDraft: summarizeStoryboardDraftForDebug(draftRef.current),
                          itemHasReviewData: Boolean(item?.reviewData),
                        });
                        draftRef.current = null;
                        setDraft(null);
                        setRenderJobId(null);
                        setSelectedLibraryItemId(null);
                        setVideoPreview(null);
                        setGalleryLightbox(null);
                        setLocation(`/storyboard-review/${nextReviewId}`);
                      };
                      return (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          className={cn(
                            "cursor-pointer rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
                            activeDraft ? "p-3" : "p-2",
                            item.id === selectedReviewId ? "border-cyan-300 bg-cyan-50" : "bg-white hover:bg-slate-50",
                          )}
                          onClick={openReviewProject}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openReviewProject();
                            }
                          }}
                        >
                          <div className={cn("flex gap-3", activeDraft ? "xl:flex-col 2xl:flex-row" : "items-center")}>
                            <div className={cn(
                              "shrink-0 overflow-hidden rounded-md border bg-slate-100",
                              activeDraft ? "h-14 w-20 xl:h-24 xl:w-full 2xl:h-14 2xl:w-20" : "h-12 w-16",
                            )}>
                              {showVideoThumbnail && thumbnailUrl ? (
                                <video src={thumbnailUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                              ) : showImageThumbnail && thumbnailUrl ? (
                                <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-slate-400">
                                  <Video className="h-5 w-5" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="line-clamp-2 text-sm font-semibold text-slate-950">{item.name}</div>
                              <div className="mt-1 text-xs text-slate-500">
                                {t("mediaStudio.storyboardReviewClipsReady", {
                                  completed: item.completedClipCount ?? 0,
                                  total: item.clipCount ?? 0,
                                })}
                              </div>
                              <div className={cn("mt-1 text-xs text-slate-500", !activeDraft ? "line-clamp-1" : "")}>
                                {item.updatedAt ? new Date(item.updatedAt).toLocaleString(locale === "th" ? "th-TH" : "en-US") : "-"}
                              </div>
                            </div>
                            {!activeDraft ? (
                              <Button
                                size="sm"
                                className="ml-auto h-8 shrink-0 px-3 text-xs"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openReviewProject();
                                }}
                              >
                                {t("mediaStudio.storyboardReviewOpen")}
                              </Button>
                            ) : null}
                          </div>
                          <div className={cn("mt-3 flex flex-wrap gap-2", !activeDraft ? "hidden" : "")}>
                            <Button
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                openReviewProject();
                              }}
                            >
                              {t("mediaStudio.storyboardReviewOpen")}
                            </Button>
                            {item.videoEditorProjectId ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setLocation(`/video-editor?projectId=${item.videoEditorProjectId}`);
                                }}
                              >
                                <ExternalLink className="mr-2 h-4 w-4" />
                                {t("mediaStudio.storyboardReviewOpenEditor")}
                              </Button>
                            ) : null}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(event) => {
                                event.stopPropagation();
                                setDeleteTarget({ id: item.id, name: String(item.name ?? "") });
                              }}
                              disabled={deleteReviewMutation.isPending}
                              aria-label={locale === "th" ? "ลบโปรเจกต์" : "Delete project"}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </aside>
        <section
          className={cn(
            "rounded-lg border bg-white xl:order-none xl:h-full xl:min-h-0 xl:overflow-hidden",
            activeDraft
              ? "order-1 min-h-0 overflow-visible"
              : "order-2 min-h-[18rem] overflow-hidden sm:min-h-[22rem]",
          )}
        >
          {reviewUnavailable ? (
            <div className="flex h-full min-h-[24rem] flex-col items-center justify-center p-6 text-center">
              <Video className="mb-3 h-10 w-10 text-slate-400" />
              <h1 className="text-lg font-semibold text-slate-950">
                {locale === "th" ? "เปิด Storyboard Review ไม่ได้" : "Could not open Storyboard Review"}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                {reviewUnavailableMessage}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void refetchStoryboardReview()}
                  disabled={isReviewFetching}
                >
                  {isReviewFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  {locale === "th" ? "ลองโหลดใหม่" : "Retry"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setLocation("/storyboard-review")}
                >
                  {locale === "th" ? "กลับไปรายการโปรเจกต์" : "Back to projects"}
                </Button>
              </div>
              {canonicalReviewId ? (
                <div className="mt-3 max-w-2xl rounded-md bg-slate-50 px-3 py-2 text-left text-xs leading-5 text-slate-500">
                  <div>reviewId={canonicalReviewId}</div>
                  <div>
                    detail={isReviewLoading ? "loading" : isReviewFetching ? "fetching" : isReviewError ? "error" : reviewRecordFound ? "record" : review === null ? "null" : "undefined"}
                    {" "}list={isReviewProjectsLoading ? "loading" : isReviewProjectsFetching ? "fetching" : isReviewProjectsError ? "error" : listBackedReviewRecord ? "record" : "missing"}
                  </div>
                  <div>
                    serverDraft={serverBackedDraft?.taskIds.length ?? 0}
                    {" "}localDraft={draft?.reviewId === canonicalReviewId ? draft.taskIds.length : 0}
                  </div>
                </div>
              ) : null}
            </div>
          ) : isLoading ? (
            <div className="flex h-full min-h-[24rem] items-center justify-center text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t("mediaStudio.storyboardReviewLoading")}
            </div>
          ) : activeDraft ? (
            <StoryboardBatchReviewPanel
              tasks={tasks}
              selectedTaskIds={selectedTaskIds}
              onOpenChange={() => setLocation("/dashboard")}
              onToggleTask={(taskId) => setAndSaveDraft((current) => {
                const selected = new Set(current.selectedTaskIds);
                selected.has(taskId) ? selected.delete(taskId) : selected.add(taskId);
                return { ...current, updatedAt: Date.now(), selectedTaskIds: Array.from(selected) };
              })}
              onSelectAll={() => setAndSaveDraft((current) => ({ ...current, updatedAt: Date.now(), selectedTaskIds: current.taskIds }))}
              onSelectNone={() => setAndSaveDraft((current) => ({ ...current, updatedAt: Date.now(), selectedTaskIds: [] }))}
              onRegenerateTask={regenerateTask}
              onRegenerateVideoSegmentPrompt={regenerateVideoSegmentPromptForTask}
              onSplitVideoSegmentToPerShot={requestSplitVideoSegmentToPerShot}
              onUpdateTaskPrompt={updateTaskPrompt}
              onUpdateTaskExtraParams={updateTaskExtraParams}
              onUpdateTaskDuration={updateTaskDuration}
              onUpdateTaskSourceTrim={updateTaskSourceTrim}
              onUpdateTaskTransition={updateStoryboardTaskTransition}
              conceptDetails={activeDraft.conceptDetails ?? ""}
              onConceptDetailsChange={updateConceptDetails}
              storyboardGuide={activeDraft.storyboardGuide ?? ""}
              onStoryboardGuideChange={updateStoryboardGuide}
              voiceoverFullScript={getStoryboardDraftVoiceoverFullScript(activeDraft)}
              onVoiceoverFullScriptChange={updateVoiceoverFullScript}
              useVoiceoverScriptAsConcept={Boolean(activeDraft.useVoiceoverScriptAsConcept && getStoryboardDraftVoiceoverFullScript(activeDraft).trim())}
              onUseVoiceoverScriptAsConceptChange={updateUseVoiceoverScriptAsConcept}
              onPlanScenePrompts={planScenePrompts}
              plannerOptions={storyboardReviewVideoOptions.plannerOptions}
              onPlannerOptionsChange={updateStoryboardPromptPlannerOptions}
              isPlanningScenePrompts={planStoryboardVideoPromptsMutation.isPending}
              onStartGenerationBatch={startStoryboardGenerationBatch}
              onCancelGeneration={cancelStoryboardGeneration}
              onReplaceReferenceFrame={replaceReferenceFrame}
              onUpdateReferenceFrameRole={updateReferenceFrameRole}
              onUploadReferenceFrame={uploadReferenceFrameFiles}
              replacingReferenceFrameKey={replacingReferenceFrameKey}
              onUploadVideoSlot={uploadVideoToStoryboardSlot}
              uploadingVideoSlotKey={uploadingVideoSlotKey}
              mediaAttachTargetTaskId={mediaAttachTargetTaskId}
              mediaAttachTargetFrameIndex={mediaAttachTargetFrameIndex}
              onMediaAttachTargetChange={setStoryboardMediaAttachTarget}
              onMoveTask={moveStoryboardTask}
              onRemoveTask={removeStoryboardTask}
              onAutoCompound={autoCompound}
              onCreateProject={createProject}
              onCreateHyperframesFinalComposite={createHyperframesFinalComposite}
              isCompounding={isCompounding}
              isCreatingProject={isCreatingProject}
              isCreatingHyperframesFinalComposite={
                createHyperframesFinalCompositeMutation.isPending ||
                updateHyperframesFinalCompositeStateMutation.isPending ||
                hyperframesFinalCompositeDuplicateGuardActive
              }
              hyperframesFinalCompositeDisabledReason={hyperframesFinalCompositeRenderBlockedReason}
              hyperframesFinalCompositeStatus={hyperframesFinalCompositeStatusText}
              isCancellingGeneration={isCancellingGeneration}
              regeneratingTaskId={regeneratingTaskId}
              regeneratingVideoSegmentPromptTaskId={regeneratingVideoSegmentPromptTaskId}
              compoundStatus={activeDraft.compoundStatus}
              projectLink={activeDraft.projectLink}
              companionAudio={activeDraft.companionAudio}
              onRemoveAudio={removeStoryboardAudio}
              muteVideoPreviewAudio={activeDraft.companionAudio.length > 0}
              renderDurationSeconds={selectedRenderProject?.settings.duration ?? null}
              renderAspectRatioMode={renderAspectRatioMode}
              onRenderAspectRatioModeChange={setRenderAspectRatioMode}
              renderOutputLabel={renderOutputLabel}
              renderAspectRatioSourceLabel={renderAspectRatioSourceLabel}
              closeLabel={t("mediaStudio.storyboardReviewBackToDashboard")}
              showCloseButton={false}
              className="min-h-0 xl:h-full"
              tabletPageFlow
            />
          ) : (
            <div className="flex h-full min-h-[14rem] flex-col items-center justify-center p-5 text-center sm:min-h-[18rem] xl:min-h-[24rem]">
              <Layers className="mb-3 h-10 w-10 text-slate-400" />
              <h1 className="text-lg font-semibold text-slate-950">{t("mediaStudio.storyboardReviewNoSelectionTitle")}</h1>
              <p className="mt-2 max-w-md text-sm text-slate-600">
                {t("mediaStudio.storyboardReviewNoSelectionDesc")}
              </p>
            </div>
          )}
        </section>

        <ResizableCollapsiblePanel
          side="right"
          collapsed={isRightPanelCollapsed}
          onCollapsedChange={setIsRightPanelCollapsed}
          width={rightPanelWidth}
          onWidthChange={setRightPanelWidth}
          minWidth={STORYBOARD_REVIEW_RIGHT_PANEL_MIN_WIDTH}
          maxWidth={STORYBOARD_REVIEW_RIGHT_PANEL_MAX_WIDTH}
          className={cn(
            "max-h-[min(48rem,82dvh)] xl:order-none xl:h-full xl:min-h-0 xl:max-h-none",
            activeDraft ? "order-2" : "order-3",
          )}
          collapsedContent={locale === "th" ? "สื่อและตัวเลือก" : "Media and options"}
          collapseLabel={locale === "th" ? "ยุบ panel ด้านขวา" : "Collapse right panel"}
          expandLabel={locale === "th" ? "เปิด panel ด้านขวา" : "Open right panel"}
          resizeLabel={locale === "th" ? "ปรับขนาด panel ด้านขวา" : "Resize right panel"}
          testId="storyboard-review-right-panel"
        >
          <div className="min-h-0 flex-1 touch-pan-y space-y-3 overflow-y-auto overscroll-contain p-2.5 sm:p-3">
            <div className="rounded-lg border bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-8 pr-9">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-slate-950">
                    {locale === "th" ? "ตัวเลือกสร้างวิดีโอ" : "Video generation options"}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {locale === "th"
                      ? "จำค่าจาก Auto Storyboard review และใช้กับ prompt/generation ในหน้านี้"
                      : "Uses the Auto Storyboard review settings for prompts and generation on this page."}
                  </p>
                </div>
                {activeDraft?.videoSegmentState?.videoSegmentPlan.effectiveMode ? (
                  <Badge variant="outline" className="shrink-0 rounded-full px-2 text-[11px]">
                    {activeDraft.videoSegmentState.videoSegmentPlan.effectiveMode === "per_shot"
                      ? locale === "th" ? "Per-shot" : "Per-shot"
                      : activeDraft.videoSegmentState.videoSegmentPlan.effectiveMode}
                  </Badge>
                ) : null}
              </div>
              <div className="grid gap-3 2xl:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500">
                    {locale === "th" ? "โมเดลวิดีโอ" : "Video model"}
                  </span>
                  <select
                    value={storyboardReviewVideoOptions.videoModel}
                    disabled={!activeDraft}
                    onChange={(event) => updateStoryboardReviewVideoOptions({ videoModel: event.target.value })}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    aria-label={locale === "th" ? "โมเดลวิดีโอ" : "Video model"}
                  >
                    {storyboardReviewVideoModelOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500">
                    {locale === "th" ? "โครงสร้างวิดีโอ" : "Video structure"}
                  </span>
                  <select
                    value={storyboardReviewVideoOptions.videoStructureMode}
                    disabled={!activeDraft}
                    onChange={(event) => updateStoryboardReviewVideoOptions({
                      videoStructureMode: event.target.value as VideoSegmentStructureMode,
                    })}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    aria-label={locale === "th" ? "โครงสร้างวิดีโอ" : "Video structure"}
                  >
                    <option value="per_shot">
                      {locale === "th" ? "Per-shot: 1 ช็อตต่อ 1 วิดีโอ" : "Per-shot: 1 shot per video"}
                    </option>
                    <option value="adaptive_multi_shot">
                      {locale === "th" ? "Multi-shot อัตโนมัติ: รวม sub-shot ตามโมเดล" : "Adaptive multi-shot: model groups sub-shots"}
                    </option>
                    <option value="compact_multi_shot">
                      {locale === "th" ? "Compact multi-shot: รวมหลาย sub-shot ต่อวิดีโอ" : "Compact multi-shot: more sub-shots per video"}
                    </option>
                    <option value="manual_group_size">
                      {locale === "th" ? "Manual multi-shot: กำหนด sub-shot ต่อวิดีโอ" : "Manual multi-shot: sub-shots per video"}
                    </option>
                  </select>
                </label>
                {storyboardReviewVideoOptions.videoStructureMode === "manual_group_size" ? (
                  <label className="space-y-1 2xl:col-span-2">
                    <span className="text-xs font-semibold text-slate-500">
                      {locale === "th" ? "จำนวนช็อตต่อคลิป" : "Shots per clip"}
                    </span>
                    <select
                      value={String(storyboardReviewVideoOptions.manualVideoGroupSize)}
                      disabled={!activeDraft}
                      onChange={(event) => updateStoryboardReviewVideoOptions({
                        manualVideoGroupSize: Number(event.target.value),
                      })}
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {[2, 3, 4, 5, 6].map((value) => (
                        <option key={value} value={value}>
                          {locale === "th" ? `${value} ช็อตต่อคลิป` : `${value} shots per clip`}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <label className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-700">
                      {locale === "th" ? "สร้าง prompt แบบมีเสียงพูด" : "Include spoken dialogue in prompts"}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                      {locale === "th"
                        ? "เมื่อเปิด จะ sync เป็นบทพูดภาษาไทยใน prompt และใช้กับปุ่มสร้าง Prompt ทุกฉาก"
                        : "When enabled, prompt planning uses spoken dialogue and stays synced with Plan prompts."}
                    </span>
                  </span>
                  <StoryboardReviewToggleSwitch
                    checked={storyboardReviewVideoOptions.plannerOptions.includeVoiceover}
                    disabled={!activeDraft}
                    onCheckedChange={(checked) => updateStoryboardReviewVideoOptions({
                      plannerOptions: {
                        includeVoiceover: Boolean(checked),
                        speechMode: checked ? (locale === "th" ? "th" : "en") : "none",
                        speechLanguage: checked ? (locale === "th" ? "Thai" : "English") : "",
                      },
                    })}
                    ariaLabel={locale === "th" ? "สร้าง prompt แบบมีเสียงพูด" : "Include spoken dialogue in prompts"}
                  />
                </label>
              </div>
              {activeDraft?.videoSegmentState?.videoSegmentPlan.fallbackReason ? (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                  {locale === "th"
                    ? "โมเดลที่เลือกยังไม่รองรับ multi-shot ที่ตรวจสอบแล้ว ระบบจึง fallback เป็น per-shot"
                    : "Selected model does not have reviewed multi-shot support, so generation falls back to per-shot."}
                </div>
              ) : null}
            </div>
            <div className="rounded-xl border bg-slate-50/70 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="text-sm font-semibold text-slate-950">{t("mediaStudio.storyboardReviewAddMedia")}</h2>
                <p className="text-xs text-slate-500">{t("mediaStudio.storyboardReviewAddMediaDesc")}</p>
              </div>
              <div className="mb-2 grid grid-cols-3 gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={rightPanelTab === "video" ? "default" : "outline"}
                  className="h-8 px-2 text-xs"
                  onClick={() => {
                    setRightPanelTab("video");
                    setMediaPickerKind("video");
                    setSelectedLibraryItemId(null);
                  }}
                >
                  {t("mediaStudio.storyboardReviewVideoClips")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={rightPanelTab === "audio" ? "default" : "outline"}
                  className="h-8 px-2 text-xs"
                  onClick={() => {
                    setRightPanelTab("audio");
                    setMediaPickerKind("audio");
                    setAudioSourceTab("library");
                    setSelectedLibraryItemId(null);
                  }}
                >
                  {t("mediaStudio.storyboardReviewAudioTrack")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={rightPanelTab === "history_gallery" ? "default" : "outline"}
                  className="h-8 px-2 text-xs"
                  onClick={() => setRightPanelTab("history_gallery")}
                >
                  {locale === "th" ? "History Gallery" : "History Gallery"}
                </Button>
              </div>
              {rightPanelTab === "audio" ? (
                <div className="mb-2 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={audioSourceTab === "library" ? "default" : "ghost"}
                    className={audioSourceTab === "library" ? "" : "bg-transparent"}
                    onClick={() => setAudioSourceTab("library")}
                  >
                    {locale === "th" ? "คลังสื่อ" : "Library"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={audioSourceTab === "history" ? "default" : "ghost"}
                    className={audioSourceTab === "history" ? "" : "bg-transparent"}
                    onClick={() => setAudioSourceTab("history")}
                  >
                    {t("mediaStudio.storyboardReviewMediaHistory")}
                  </Button>
                </div>
              ) : null}
              {rightPanelTab !== "audio" ? (
                <div className="mb-3 rounded-lg border border-cyan-100 bg-cyan-50/50 p-2.5 shadow-sm xl:hidden">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-cyan-950">
                        <Mic className={cn("h-3.5 w-3.5", isRecordingVoiceover ? "animate-pulse text-red-600" : "text-cyan-700")} />
                        {locale === "th" ? "อัดเสียงพากย์" : "Record voiceover"}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-cyan-800/80">
                        {locale === "th" ? "ใช้ได้ทั้งไมก์ในเครื่องและไมก์ภายนอก" : "Supports internal and external microphones."}
                      </p>
                    </div>
                    {isRecordingVoiceover ? (
                      <Badge className="shrink-0 gap-1 rounded-full bg-red-600 px-2 py-0.5 text-white hover:bg-red-600">
                        {formatStoryboardRecordingElapsed(recordingElapsedSeconds)}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <select
                      value={selectedAudioInputDeviceId}
                      onChange={(event) => setSelectedAudioInputDeviceId(event.target.value)}
                      disabled={isRecordingVoiceover}
                      className="h-10 min-w-0 rounded-md border border-cyan-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:opacity-60"
                      aria-label={locale === "th" ? "เลือกไมก์" : "Select microphone"}
                    >
                      <option value="">{locale === "th" ? "ไมก์เริ่มต้นของระบบ" : "System default microphone"}</option>
                      {audioInputDevices.map((device, index) => (
                        <option key={device.deviceId || `tablet-mic-${index}`} value={device.deviceId}>
                          {formatAudioInputDeviceLabel(device, index, locale)}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-[1fr_1fr_2.5rem] gap-2 sm:w-[22rem]">
                      <Button
                        type="button"
                        size="sm"
                        className="h-10 min-w-0 rounded-md bg-cyan-600 px-2 text-white hover:bg-cyan-700"
                        onClick={() => void startVoiceoverRecording()}
                        disabled={isRecordingVoiceover || storyboardAudioLimitReached || !canRecordVoiceover}
                      >
                        <Mic className="mr-1.5 h-4 w-4 shrink-0" />
                        <span className="truncate">{locale === "th" ? "เริ่มอัด" : "Record"}</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-10 min-w-0 rounded-md border-cyan-200 bg-white px-2"
                        onClick={stopVoiceoverRecording}
                        disabled={!isRecordingVoiceover}
                      >
                        <Square className="mr-1.5 h-4 w-4 shrink-0" />
                        <span className="truncate">{locale === "th" ? "หยุด" : "Stop"}</span>
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-10 w-10 rounded-md border-cyan-200 bg-white"
                        onClick={() => void refreshAudioInputDevices(true)}
                        disabled={microphoneStatus === "checking" || isRecordingVoiceover}
                        aria-label={locale === "th" ? "ค้นหาไมก์อีกครั้ง" : "Refresh microphones"}
                      >
                        {microphoneStatus === "checking"
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <RefreshCw className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
              {rightPanelTab === "audio" ? (
                <div className="mb-3 space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {locale === "th" ? "บทพากย์ทั้งหมด" : "Full voiceover script"}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {locale === "th" ? "ใช้เป็นสคริปต์อ่านขณะอัดเสียงจากไมก์" : "Use this as the read-along script while recording."}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Badge variant={storyboardVoiceoverSummaryText.trim() ? "secondary" : "outline"} className="rounded-full px-3">
                          {isEditingVoiceoverSummary
                            ? (locale === "th" ? "กำลังแก้ไข" : "Editing")
                            : storyboardVoiceoverSummaryText.trim()
                              ? (locale === "th" ? "พร้อมอ่าน" : "Ready")
                              : (locale === "th" ? "ยังไม่มีบทพูด" : "No script")}
                        </Badge>
                        {isEditingVoiceoverSummary ? (
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 px-3 text-xs"
                              onClick={cancelEditingVoiceoverSummary}
                            >
                              <X className="mr-1.5 h-3.5 w-3.5" />
                              {locale === "th" ? "ยกเลิก" : "Cancel"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 px-3 text-xs"
                              onClick={saveVoiceoverSummaryDraft}
                            >
                              <Check className="mr-1.5 h-3.5 w-3.5" />
                              {locale === "th" ? "บันทึก" : "Save"}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 px-3 text-xs"
                            onClick={startEditingVoiceoverSummary}
                          >
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            {locale === "th" ? "แก้ไข" : "Edit"}
                          </Button>
                        )}
                      </div>
                    </div>
                    <Textarea
                      value={isEditingVoiceoverSummary ? voiceoverSummaryDraft : storyboardVoiceoverSummaryText}
                      onChange={(event) => setVoiceoverSummaryDraft(event.target.value)}
                      readOnly={!isEditingVoiceoverSummary}
                      className={cn(
                        "min-h-[142px] resize-y rounded-lg text-sm leading-6 shadow-inner",
                        isEditingVoiceoverSummary
                          ? "border-sky-300 bg-white text-slate-900 ring-2 ring-sky-100"
                          : "border-slate-200 bg-slate-50/80 text-slate-700",
                      )}
                      placeholder={locale === "th"
                        ? "บทพูดจากแต่ละช็อตจะแสดงรวมตรงนี้ สำหรับอ่านพากย์หรืออัดเสียงเอง"
                        : "Shot voiceover lines will appear here for reading or recording manually."}
                    />
                  </div>

                  <div className="rounded-lg border border-cyan-100 bg-gradient-to-b from-white to-cyan-50/30 p-3 shadow-sm">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className={cn(
                          "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                          isRecordingVoiceover ? "bg-red-50 text-red-600 ring-4 ring-red-100" : "bg-cyan-50 text-cyan-700",
                        )}>
                          <Mic className={cn("h-4 w-4", isRecordingVoiceover ? "animate-pulse" : "")} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-slate-950">
                            {locale === "th" ? "อัดเสียงพากย์" : "Record voiceover"}
                          </h3>
                          <p className="mt-0.5 text-xs leading-5 text-slate-500">
                            {locale === "th"
                              ? "ไฟล์ที่อัดจะถูกเพิ่มเป็นแทร็กเสียงของ Storyboard นี้"
                              : "Recorded audio is attached as this storyboard's voiceover track."}
                          </p>
                        </div>
                      </div>
                      {isRecordingVoiceover ? (
                        <Badge className="gap-1.5 rounded-full bg-red-600 px-3 py-1 text-white hover:bg-red-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                          {formatStoryboardRecordingElapsed(recordingElapsedSeconds)}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="space-y-3">
                      <label className="grid gap-1.5 text-xs font-medium text-slate-600">
                        <span>{locale === "th" ? "แหล่งไมก์" : "Microphone source"}</span>
                        <select
                          value={selectedAudioInputDeviceId}
                          onChange={(event) => setSelectedAudioInputDeviceId(event.target.value)}
                          disabled={isRecordingVoiceover}
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="">{locale === "th" ? "ไมก์เริ่มต้นของระบบ" : "System default microphone"}</option>
                          {audioInputDevices.map((device, index) => (
                            <option key={device.deviceId || `mic-${index}`} value={device.deviceId}>
                              {formatAudioInputDeviceLabel(device, index, locale)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="h-10 min-w-0 rounded-md bg-cyan-600 px-2 text-white shadow-sm hover:bg-cyan-700"
                          onClick={() => void startVoiceoverRecording()}
                          disabled={isRecordingVoiceover || storyboardAudioLimitReached || !canRecordVoiceover}
                        >
                          <Mic className="mr-1.5 h-4 w-4 shrink-0" />
                          <span className="truncate">{locale === "th" ? "เริ่มอัด" : "Record"}</span>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-10 min-w-0 rounded-md border-slate-200 bg-white px-2"
                          onClick={stopVoiceoverRecording}
                          disabled={!isRecordingVoiceover}
                        >
                          <Square className="mr-1.5 h-4 w-4 shrink-0" />
                          <span className="truncate">{locale === "th" ? "หยุด" : "Stop"}</span>
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-10 w-10 rounded-md border-slate-200 bg-white"
                          onClick={() => void refreshAudioInputDevices(true)}
                          disabled={microphoneStatus === "checking" || isRecordingVoiceover}
                          aria-label={locale === "th" ? "โหลดรายการไมก์ใหม่" : "Refresh microphones"}
                        >
                          {microphoneStatus === "checking"
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <RefreshCw className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    {microphoneError ? (
                      <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        {microphoneError}
                      </div>
                    ) : null}
                    {storyboardAudioLimitReached ? (
                      <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {t("mediaStudio.storyboardReviewAudioLimit")}
                      </div>
                    ) : !canRecordVoiceover ? (
                      <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        {locale === "th" ? "เบราว์เซอร์นี้ยังไม่รองรับการอัดเสียงจากไมก์" : "This browser does not support microphone recording."}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {rightPanelTab !== "history_gallery" && (mediaPickerKind !== "audio" || audioSourceTab === "library") ? (
                <LibrarySearchPanel
                  query={librarySearchQuery}
                  onQueryChange={setLibrarySearchQuery}
                  isLoading={isLibrarySearchLoading}
                  results={librarySearchResults}
                  totalResults={librarySearchData?.total ?? 0}
                  hasMore={librarySearchData?.has_more ?? false}
                  errorMessage={librarySearchError?.message}
                  selectedItemId={selectedLibraryItemId}
                  itemTypeFilter={mediaPickerKind}
                  addToReferenceLabel={mediaPickerKind === "audio" ? t("mediaStudio.storyboardReviewAddAudio") : t("mediaStudio.storyboardReviewAddClip")}
                  canAddToReferenceItem={(item) => item.item_type.toLowerCase() === mediaPickerKind && Boolean(item.source_url)}
                  onAddToReference={addLibraryItemToStoryboard}
                  onPreview={mediaPickerKind === "video" ? previewLibraryVideo : undefined}
                  onSelect={addLibraryItemToStoryboard}
                />
              ) : null}
              {rightPanelTab !== "history_gallery" && (mediaPickerKind !== "audio" || audioSourceTab === "history") ? (
                <div className="mt-3 rounded-lg border bg-white p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase text-slate-500">{t("mediaStudio.storyboardReviewMediaHistory")}</h3>
                    {isMediaHistoryLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
                  </div>
                  <div className="max-h-72 min-h-0 space-y-2 overflow-y-auto overscroll-contain pr-1 sm:max-h-80 sm:pr-2">
                    {historyMediaTasks.length === 0 && !isMediaHistoryLoading ? (
                      <div className="rounded-md border border-dashed p-3 text-xs text-slate-500">
                        {mediaPickerKind === "audio"
                          ? t("mediaStudio.storyboardReviewNoAudioHistory")
                          : t("mediaStudio.storyboardReviewNoVideoHistory")}
                      </div>
                    ) : (
                      historyMediaTasks.map((task) => {
                        const resultUrl = extractStoryboardMediaUrl(task, mediaPickerKind);
                        const title = task.prompt || task.model || t("mediaStudio.storyboardReviewMediaHistoryItem");
                        return (
                          <div key={task.id || task.taskId} className="rounded-md border bg-white p-2">
                            {mediaPickerKind === "audio" && resultUrl ? (
                              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5">
                                <div className="mb-2 flex flex-col items-center gap-2 text-center">
                                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                    <Music2 className="h-6 w-6" />
                                  </span>
                                  <div className="min-w-0">
                                    <div className="line-clamp-2 text-xs font-semibold text-amber-950" title={title}>{title}</div>
                                    <div className="truncate text-[11px] text-amber-800/70">{task.model || task.mediaType}</div>
                                  </div>
                                </div>
                                <audio
                                  src={resultUrl}
                                  controls
                                  preload="metadata"
                                  className="h-9 w-full"
                                  onClick={(event) => event.stopPropagation()}
                                  onDragStart={(event) => event.preventDefault()}
                                />
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="group relative flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded border bg-slate-100"
                                  onClick={() => mediaPickerKind === "video" && resultUrl ? previewHistoryVideo(task) : undefined}
                                  disabled={mediaPickerKind !== "video" || !resultUrl}
                                  title={locale === "th" ? "ขยายดูวีดีโอ" : "Preview video"}
                                >
                                  {mediaPickerKind === "video" && resultUrl ? (
                                    <>
                                      <video src={resultUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                                        <Maximize2 className="h-4 w-4 text-white" />
                                      </span>
                                    </>
                                  ) : (
                                    <Film className="h-4 w-4 text-slate-400" />
                                  )}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-xs font-medium text-slate-900">{title}</div>
                                  <div className="truncate text-[11px] text-slate-500">{task.model || task.mediaType}</div>
                                </div>
                              </div>
                            )}
                            {mediaPickerKind === "video" && resultUrl ? (
                              <div className="mt-2 flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 flex-1 text-xs"
                                  onClick={() => previewHistoryVideo(task)}
                                >
                                  <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                                  {locale === "th" ? "ขยาย/เล่น" : "Preview"}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 flex-1 text-xs"
                                  onClick={() => downloadStoryboardMedia(resultUrl, title, "mp4")}
                                >
                                  <Download className="mr-1.5 h-3.5 w-3.5" />
                                  {locale === "th" ? "ดาวน์โหลด" : "Download"}
                                </Button>
                              </div>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant="default"
                              className="mt-2 h-8 w-full bg-sky-600 text-white hover:bg-sky-700"
                              onClick={() => addHistoryTaskToStoryboard(task)}
                            >
                              {mediaPickerKind === "audio" ? t("mediaStudio.storyboardReviewAddAudio") : t("mediaStudio.storyboardReviewAddClip")}
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}
              {rightPanelTab === "history_gallery" ? (
                <div
                  className={cn(
                    "space-y-3",
                    imageToolsSourceUrl && isImageToolsPanelOpen
                      ? "lg:flex lg:flex-col lg:gap-3 lg:space-y-0"
                      : "",
                    imageToolsSourceUrl && isImageToolsPanelOpen
                      ? "xl:grid xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start xl:gap-3 xl:space-y-0 2xl:grid-cols-[minmax(0,1fr)_25rem]"
                      : "",
                  )}
                >
                  <div
                    className={cn(
                      "rounded-lg border bg-white p-2",
                      imageToolsSourceUrl && isImageToolsPanelOpen ? "lg:order-2 xl:order-none" : "",
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
                        <History className="h-3.5 w-3.5" />
                        History Gallery
                      </h3>
                      <div className="flex items-center gap-1.5">
                        <div className="flex rounded-full border bg-white p-0.5 shadow-sm">
                          <button
                            type="button"
                            className={cn(
                              "h-7 rounded-full px-2.5 text-[11px] font-medium transition-colors",
                              isHistoryGalleryProductFilterActive
                                ? "bg-sky-600 text-white shadow-sm"
                                : "text-slate-600 hover:bg-slate-100",
                              !historyGalleryProductFilter ? "cursor-not-allowed opacity-50 hover:bg-transparent" : "",
                            )}
                            disabled={!historyGalleryProductFilter}
                            onClick={() => setHistoryGalleryProductFilterEnabled(true)}
                            aria-pressed={isHistoryGalleryProductFilterActive}
                          >
                            {locale === "th" ? "สินค้าเดียวกัน" : "Same product"}
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "h-7 rounded-full px-2.5 text-[11px] font-medium transition-colors",
                              !isHistoryGalleryProductFilterActive
                                ? "bg-slate-800 text-white shadow-sm"
                                : "text-slate-600 hover:bg-slate-100",
                            )}
                            onClick={() => setHistoryGalleryProductFilterEnabled(false)}
                            aria-pressed={!isHistoryGalleryProductFilterActive}
                          >
                            {locale === "th" ? "ทั้งหมด" : "All"}
                          </button>
                        </div>
                        {isImageHistoryLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
                      </div>
                    </div>
                    <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
                      <span className="min-w-0 truncate">
                        {!historyGalleryProductFilter
                          ? (locale === "th" ? "ยังไม่พบข้อมูลสินค้าใน review นี้" : "No product context found for this review")
                          : isHistoryGalleryProductFilterActive
                            ? (locale === "th" ? "Filter เปิด: กรองเฉพาะสินค้านี้" : "Filter on: showing this product")
                            : (locale === "th" ? "Filter ปิด: แสดงทั้งหมด" : "Filter off: showing all")}
                        {historyGalleryProductFilterLabel ? ` · ${historyGalleryProductFilterLabel}` : ""}
                      </span>
                      </div>
                    <div className={cn(
                      "mb-2 rounded-md border px-2 py-1.5 text-[11px] xl:hidden",
                      mediaAttachTargetTask
                        ? "border-sky-200 bg-sky-50 text-sky-800"
                        : "border-amber-200 bg-amber-50 text-amber-800",
                    )}>
                      {mediaAttachTargetTask ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate">
                            {locale === "th"
                              ? `เลือกช่อง ${mediaAttachTargetLabel} อยู่: แตะรูปด้านล่างเพื่อใส่ช่องรูปด้านบนนี้`
                              : `${mediaAttachTargetLabel} selected: tap an image below to attach it to the top image slot`}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 shrink-0 px-2 text-[11px]"
                            onClick={() => setMediaAttachTargetTaskId(null)}
                          >
                            {locale === "th" ? "ล้าง" : "Clear"}
                          </Button>
                        </div>
                      ) : (
                        locale === "th"
                          ? "ขั้นตอนบนแท็บเล็ต: กดปุ่มบนช่องรูปด้านบนของ Shot เช่น Ref / Start / Stop ก่อน แล้วแตะรูปด้านล่าง"
                          : "Tablet flow: tap a top image slot first, such as Ref / Start / Stop, then tap an image below."
                      )}
                    </div>
                    {visibleImageHistoryTasks.length === 0 && !isImageHistoryLoading ? (
                      <div className="rounded-md border border-dashed p-3 text-xs text-slate-500">
                        {isHistoryGalleryProductFilterActive
                          ? (locale === "th" ? "ยังไม่มีรูป History Gallery ที่ตรงกับสินค้านี้" : "No history images matched this product.")
                          : (locale === "th" ? "ยังไม่มีรูปใน History Gallery" : "No image history yet.")}
                        {isHistoryGalleryProductFilterActive ? (
                          <button
                            type="button"
                            className="mt-2 block text-sky-700 hover:underline"
                            onClick={() => setHistoryGalleryProductFilterEnabled(false)}
                          >
                            {locale === "th" ? "แสดงทั้งหมดแทน" : "Show all instead"}
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <div className={cn(
                        "grid max-h-[28rem] auto-rows-max grid-cols-2 items-start gap-2 overflow-y-auto overscroll-contain pr-1 xl:h-[calc(100dvh-16rem)] xl:max-h-none",
                        imageToolsSourceUrl && isImageToolsPanelOpen ? "xl:h-[calc(100dvh-14rem)]" : "",
                      )}>
                        {visibleImageHistoryTasks.map(({ task, url, title }) => {
                          const cardKey = String(task.id ?? task.taskId ?? url);
                          return (
                            <div
                              key={cardKey}
                              className="self-start touch-pan-y select-none overflow-hidden rounded-lg border bg-white shadow-sm"
                              draggable
                              onDragStart={(event) => startStoryboardImageDrag(event, {
                                url,
                                title,
                                filename: `history-${cardKey}.jpg`,
                              })}
                              title={locale === "th" ? "ลากรูปนี้ไปวางที่ Start/End frame หรือปุ่มแทรกถัดไปได้" : "Drag this image into a Start/End frame or the insert-next button"}
                            >
                              <button
                                type="button"
                                className="group relative block aspect-square w-full overflow-hidden bg-slate-100"
                                style={{ aspectRatio: "1 / 1" }}
                                onClick={() => setGalleryLightbox({ url, title })}
                              >
                                <img src={url} alt={title} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" draggable={false} />
                                <span className="absolute left-2 top-2 rounded-full bg-white/90 p-1 text-slate-700 shadow">
                                  <History className="h-3.5 w-3.5" />
                                </span>
                              </button>
                              <div className="flex items-center justify-between gap-1 border-t bg-white px-1.5 py-1">
                                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setGalleryLightbox({ url, title })} title={locale === "th" ? "ขยาย" : "Expand"}>
                                  <Maximize2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => void openStoryboardImageTools(url, "crop", title)} title={locale === "th" ? "ใช้เป็นรูปอ้างอิง / ครอป" : "Use as reference / crop"}>
                                  <ImagePlus className="h-3.5 w-3.5" />
                                </Button>
                                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => void openStoryboardImageTools(url, "split", title, { rows: 3, cols: 3, forceGrid: true })} title={locale === "th" ? "ตัดเป็น 3x3" : "Split as 3x3"}>
                                  <Scissors className="h-3.5 w-3.5" />
                                </Button>
                                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => void openStoryboardImageTools(url, "split", title)} title={locale === "th" ? "เปิดตัวแบ่ง grid" : "Open grid splitter"}>
                                  <Grid3X3 className="h-3.5 w-3.5" />
                                </Button>
                                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => void openStoryboardImageTools(url, "crop", title)} title={locale === "th" ? "ครอปภาพ" : "Crop image"}>
                                  <Crop className="h-3.5 w-3.5" />
                                </Button>
                                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => downloadStoryboardImage(url, title)} title={locale === "th" ? "ดาวน์โหลด" : "Download"}>
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 w-full rounded-none border-x-0 border-b-0 text-[11px]"
                                onClick={() => void addImageUrlAsStoryboardShot(url, title)}
                              >
                                <ImagePlus className="mr-1 h-3.5 w-3.5" />
                                {locale === "th" ? "เพิ่มเป็น shot ภาพนิ่ง" : "Add image shot"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={mediaAttachTargetTask ? "default" : "secondary"}
                                className="h-8 w-full rounded-none border-x-0 border-b-0 text-[11px] xl:hidden"
                                disabled={!mediaAttachTargetTask || Boolean(replacingReferenceFrameKey)}
                                onClick={() => void attachImageToSelectedReferenceFrame(url, title)}
                                title={mediaAttachTargetTask
                                  ? (locale === "th" ? "แทนที่ช่องรูปด้านบนที่เลือกด้วยภาพนี้" : "Replace the selected top image slot with this image")
                                  : (locale === "th" ? "เลือกช่องรูปด้านบนก่อน" : "Select a top image slot first")}
                              >
                                {replacingReferenceFrameKey && mediaAttachTargetTask ? (
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="mr-1 h-3.5 w-3.5" />
                                )}
                                {mediaAttachTargetTask
                                  ? (locale === "th" ? `ใส่ ${mediaAttachTargetLabel}` : `Attach to ${mediaAttachTargetLabel}`)
                                  : (locale === "th" ? "เลือกช่องรูปก่อน" : "Select image slot first")}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {imageToolsSourceUrl && !isImageToolsPanelOpen ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 w-full justify-center border-sky-200 text-xs text-sky-700"
                      onClick={() => setIsImageToolsPanelOpen(true)}
                    >
                      <Scissors className="mr-1.5 h-3.5 w-3.5" />
                      {locale === "th" ? "เปิดเครื่องมือตัดภาพ" : "Open image tools"}
                    </Button>
                  ) : null}

                  {isImageToolsPanelOpen ? (
                  <div
                    ref={imageToolsPanelRef}
                    className="min-h-0 max-h-[min(34rem,calc(100dvh-9rem))] touch-pan-y overflow-y-auto overscroll-contain rounded-lg border border-sky-200 bg-white p-2 shadow-sm lg:order-1 lg:max-h-[calc(100dvh-7rem)] xl:sticky xl:top-2 xl:order-none xl:max-h-[calc(100dvh-13rem)]"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
                        <Scissors className="h-3.5 w-3.5" />
                        {locale === "th" ? "เครื่องมือตัดภาพ" : "Image Tools"}
                      </h3>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 shrink-0 border-sky-200 px-2 text-[11px] text-sky-700"
                          onClick={() => setIsImageToolsPanelOpen(false)}
                        >
                          <History className="mr-1 h-3.5 w-3.5" />
                          {locale === "th" ? "เลือกรูปอื่น" : "Choose another"}
                        </Button>
                        {imageToolsSourceUrl ? (
                          <Badge variant="outline" className="max-w-[10rem] truncate text-[10px]">
                            {imageToolsSourceTitle || "Image"}
                          </Badge>
                        ) : null}
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          onClick={() => setIsImageToolsPanelOpen(false)}
                          title={locale === "th" ? "ยุบ panel ไปทางขวา" : "Collapse panel"}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {!imageToolsSourceUrl ? (
                      <div className="rounded-md border border-dashed p-3 text-xs text-slate-500">
                        {locale === "th" ? "เลือกรูปจาก History Gallery แล้วกดกรรไกรหรือครอป เพื่อเปิดเครื่องมือ" : "Pick an image from History Gallery, then use split or crop."}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-1.5">
                          <Button type="button" size="sm" variant={imageEditorMode === "split" ? "default" : "outline"} className="h-8 text-xs" onClick={() => setImageEditorMode("split")}>
                            <Scissors className="mr-1.5 h-3.5 w-3.5" />
                            {locale === "th" ? "Split" : "Split"}
                          </Button>
                          <Button type="button" size="sm" variant={imageEditorMode === "crop" ? "default" : "outline"} className="h-8 text-xs" onClick={() => setImageEditorMode("crop")}>
                            <Crop className="mr-1.5 h-3.5 w-3.5" />
                            {locale === "th" ? "Crop" : "Crop"}
                          </Button>
                        </div>
                        <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                          {imageEditorMode === "split" ? (
                            isDetectingGrid ? (
                              <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
                            ) : splitPreviewUrl ? (
                              <img src={splitPreviewUrl} alt="Split preview" className="max-h-72 max-w-full object-contain" />
                            ) : (
                              <img src={imageToolsSourceUrl} alt="Source" className="max-h-72 max-w-full object-contain" />
                            )
                          ) : cropPreviewUrl ? (
                            <img src={cropPreviewUrl} alt="Crop preview" className="max-h-72 max-w-full object-contain" />
                          ) : (
                            <img src={imageToolsSourceUrl} alt="Source" className="max-h-72 max-w-full object-contain" />
                          )}
                        </div>
                        {imageEditorMode === "split" ? (
                          <div className="space-y-3">
                            {detectedGrid ? (
                              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">
                                {locale === "th"
                                  ? `ตรวจพบ grid ${detectedGrid.rows}x${detectedGrid.cols}`
                                  : `Detected ${detectedGrid.rows}x${detectedGrid.cols} grid`}
                              </div>
                            ) : null}
                            <div className="grid grid-cols-3 gap-1.5">
                              {COMMON_GRIDS.slice(0, 9).map((grid) => (
                                <Button
                                  key={`${grid.rows}x${grid.cols}`}
                                  type="button"
                                  size="sm"
                                  variant={splitGridRows === grid.rows && splitGridCols === grid.cols ? "default" : "outline"}
                                  className="h-8 px-1 text-[10px]"
                                  onClick={() => void updateSplitPreview(grid.rows, grid.cols)}
                                >
                                  {grid.rows}x{grid.cols}
                                </Button>
                              ))}
                            </div>
                            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                              <label className="grid gap-1 text-xs">
                                <span className="text-slate-500">{locale === "th" ? "แถว" : "Rows"}</span>
                                <Input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={splitGridRows}
                                  onChange={(event) => void updateSplitPreview(Math.min(10, Math.max(1, Number(event.target.value) || 1)), splitGridCols)}
                                  className="h-8"
                                />
                              </label>
                              <span className="pb-2 text-xs text-slate-400">x</span>
                              <label className="grid gap-1 text-xs">
                                <span className="text-slate-500">{locale === "th" ? "คอลัมน์" : "Cols"}</span>
                                <Input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={splitGridCols}
                                  onChange={(event) => void updateSplitPreview(splitGridRows, Math.min(10, Math.max(1, Number(event.target.value) || 1)))}
                                  className="h-8"
                                />
                              </label>
                            </div>
                            <Button type="button" size="sm" className="h-8 w-full text-xs" onClick={() => void executeSplit()} disabled={isSplitting}>
                              {isSplitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Scissors className="mr-1.5 h-3.5 w-3.5" />}
                              {locale === "th" ? `ตัด ${splitGridRows * splitGridCols} รูป` : `Split ${splitGridRows * splitGridCols}`}
                            </Button>
                            {splitResults.length > 0 ? (
                              <div className="space-y-2 border-t pt-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium text-slate-600">
                                    {locale === "th" ? `ผลลัพธ์ ${splitResults.length} รูป` : `${splitResults.length} results`}
                                  </span>
                                  <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void downloadAllSplitImages(splitResults, "storyboard-split")}>
                                    <Download className="mr-1 h-3.5 w-3.5" />
                                    {locale === "th" ? "ทั้งหมด" : "All"}
                                  </Button>
                                </div>
                                <div className="grid max-h-[42dvh] grid-cols-3 gap-1.5 overflow-y-auto overscroll-contain pr-1">
                                  {splitResults.map((result, index) => {
                                    const sequenceNumber = index + 1;
                                    return (
                                      <div
                                        key={result.index}
                                        className="group relative aspect-square touch-pan-y select-none overflow-hidden rounded-md border bg-slate-100 md:cursor-grab md:active:cursor-grabbing"
                                        draggable
                                        onDragStart={(event) => startStoryboardImageDrag(event, {
                                          url: result.dataUrl,
                                          title: `Split ${sequenceNumber}`,
                                          filename: `split-${sequenceNumber}.jpg`,
                                        })}
                                        title={locale === "th" ? "ลากไปวางที่ Start/End frame หรือปุ่มแทรกถัดไป" : "Drag into a Start/End frame or the insert-next button"}
                                      >
                                        <img src={result.dataUrl} alt={`Split ${sequenceNumber}`} className="h-full w-full object-cover" draggable={false} />
                                        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">{sequenceNumber}</span>
                                        <Button type="button" size="icon" variant="secondary" className="absolute left-1 top-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100" onClick={() => downloadSplitImage(result, "storyboard-split", sequenceNumber)}>
                                          <Download className="h-3 w-3" />
                                        </Button>
                                        <Button type="button" size="icon" variant="secondary" className="absolute left-1 top-8 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100" onClick={() => void addImageUrlAsStoryboardShot(result.dataUrl, `Split ${sequenceNumber}`)} title={locale === "th" ? "เพิ่มเป็น shot ภาพนิ่ง" : "Add image shot"}>
                                          <ImagePlus className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={mediaAttachTargetTask ? "default" : "secondary"}
                                          className="absolute inset-x-1 bottom-1 h-7 px-1 text-[10px] shadow-sm xl:hidden"
                                          disabled={!mediaAttachTargetTask || Boolean(replacingReferenceFrameKey)}
                                          onClick={() => void attachImageToSelectedReferenceFrame(result.dataUrl, `Split ${sequenceNumber}`)}
                                          title={mediaAttachTargetTask
                                            ? (locale === "th" ? "ใส่ภาพตัดนี้ในช่องรูปด้านบนที่เลือก" : "Attach this cut image to the selected top image slot")
                                            : (locale === "th" ? "เลือกช่องรูปด้านบนก่อน" : "Select a top image slot first")}
                                        >
                                          {mediaAttachTargetTask
                                            ? (locale === "th" ? `ใส่ ${mediaAttachTargetLabel}` : mediaAttachTargetLabel)
                                            : (locale === "th" ? "เลือกช่องรูป" : "Select slot")}
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="grid grid-cols-4 gap-1.5">
                              {COMMON_CROP_RATIOS.map((ratio) => (
                                <Button
                                  key={ratio.value}
                                  type="button"
                                  size="sm"
                                  variant={cropAspectRatio === ratio.value ? "default" : "outline"}
                                  className="h-8 px-1 text-xs"
                                  onClick={() => {
                                    setCropAspectRatio(ratio.value);
                                    setCropResult(null);
                                  }}
                                >
                                  {ratio.label}
                                </Button>
                              ))}
                            </div>
                            <label className="grid gap-1 text-xs">
                              <span className="flex items-center justify-between text-slate-500">
                                <span>{locale === "th" ? "ขนาด crop" : "Crop size"}</span>
                                <span>{Math.round(cropScale * 100)}%</span>
                              </span>
                              <Input
                                type="range"
                                min={20}
                                max={100}
                                value={Math.round(cropScale * 100)}
                                onChange={(event) => {
                                  setCropScale(Number(event.target.value) / 100);
                                  setCropResult(null);
                                }}
                              />
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="grid gap-1 text-xs">
                                <span className="text-slate-500">{locale === "th" ? "แนวนอน" : "Horizontal"}</span>
                                <Input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={Math.round(cropFocus.x * 100)}
                                  onChange={(event) => {
                                    setCropFocus((current) => ({ ...current, x: Number(event.target.value) / 100 }));
                                    setCropResult(null);
                                  }}
                                />
                              </label>
                              <label className="grid gap-1 text-xs">
                                <span className="text-slate-500">{locale === "th" ? "แนวตั้ง" : "Vertical"}</span>
                                <Input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={Math.round(cropFocus.y * 100)}
                                  onChange={(event) => {
                                    setCropFocus((current) => ({ ...current, y: Number(event.target.value) / 100 }));
                                    setCropResult(null);
                                  }}
                                />
                              </label>
                            </div>
                            <Button type="button" size="sm" className="h-8 w-full text-xs" onClick={() => void executeCrop()} disabled={isCropping}>
                              {isCropping ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Crop className="mr-1.5 h-3.5 w-3.5" />}
                              {locale === "th" ? `ครอป ${cropAspectRatio}` : `Crop ${cropAspectRatio}`}
                            </Button>
                            {cropResult ? (
                              <div className="space-y-2 border-t pt-2">
                                <div
                                  className="touch-pan-y select-none overflow-hidden rounded-md border bg-slate-100 md:cursor-grab md:active:cursor-grabbing"
                                  draggable
                                  onDragStart={(event) => startStoryboardImageDrag(event, {
                                    url: cropResult.dataUrl,
                                    title: `Crop ${cropAspectRatio}`,
                                    filename: `crop-${cropAspectRatio.replace(":", "x")}.jpg`,
                                  })}
                                  title={locale === "th" ? "ลากไปวางที่ Start/End frame หรือปุ่มแทรกถัดไป" : "Drag into a Start/End frame or the insert-next button"}
                                >
                                  <img src={cropResult.dataUrl} alt="Crop result" className="max-h-48 w-full object-contain" draggable={false} />
                                </div>
                                <div className="grid grid-cols-3 gap-1.5">
                                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => downloadCroppedImage(cropResult, "storyboard-crop")}>
                                    <Download className="mr-1 h-3.5 w-3.5" />
                                    {locale === "th" ? "ดาวน์โหลด" : "Download"}
                                  </Button>
                                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={appendCropToSplitResults}>
                                    <ImagePlus className="mr-1 h-3.5 w-3.5" />
                                    {locale === "th" ? "เพิ่มภาพ" : "Add image"}
                                  </Button>
                                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => void addImageUrlAsStoryboardShot(cropResult.dataUrl, `Crop ${cropAspectRatio}`)}>
                                    <ImagePlus className="mr-1 h-3.5 w-3.5" />
                                    {locale === "th" ? "เพิ่ม shot" : "Add shot"}
                                  </Button>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={mediaAttachTargetTask ? "default" : "secondary"}
                                  className="h-8 w-full text-xs xl:hidden"
                                  disabled={!mediaAttachTargetTask || Boolean(replacingReferenceFrameKey)}
                                  onClick={() => void attachImageToSelectedReferenceFrame(cropResult.dataUrl, `Crop ${cropAspectRatio}`)}
                                >
                                  {replacingReferenceFrameKey && mediaAttachTargetTask ? (
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Check className="mr-1.5 h-3.5 w-3.5" />
                                  )}
                                  {mediaAttachTargetTask
                                    ? (locale === "th" ? `ใส่ ${mediaAttachTargetLabel}` : `Attach to ${mediaAttachTargetLabel}`)
                                    : (locale === "th" ? "เลือกช่องรูปก่อน" : "Select image slot first")}
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </ResizableCollapsiblePanel>
      </main>

      <AlertDialog
        open={Boolean(splitFallbackTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setSplitFallbackTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {locale === "th" ? "แยก segment ที่ล้มเหลวกลับเป็น per-shot?" : "Split failed segment back to per-shot?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                {locale === "th"
                  ? `ระบบจะแยก segment นี้เป็น ${splitFallbackTarget?.shotCount ?? 0} งาน per-shot ใหม่ โดยยังไม่ส่งสร้างวิดีโอและไม่หักเครดิตเพิ่มอัตโนมัติ`
                  : `This will split the segment into ${splitFallbackTarget?.shotCount ?? 0} new per-shot jobs. It will not submit generation or spend credits automatically.`}
              </span>
              <span className="block">
                {locale === "th"
                  ? "ใช้ตัวเลือกนี้หลังตรวจสาเหตุจริงของ error แล้วเท่านั้น เพื่อไม่ให้ fallback กลบ bug ของ provider, model mapping, หรือ prompt payload"
                  : "Use this only after reviewing the real error cause, so fallback does not hide provider, model mapping, or prompt payload bugs."}
              </span>
              {splitFallbackTarget?.error ? (
                <span className="block rounded-md bg-amber-50 p-2 text-amber-900">
                  {locale === "th" ? "Error เดิม: " : "Original error: "}
                  {splitFallbackTarget.error}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmSplitVideoSegmentToPerShot();
              }}
            >
              {locale === "th" ? "ยืนยัน แยกเป็น per-shot" : "Confirm split to per-shot"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteReviewMutation.isPending) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {locale === "th" ? "ยืนยันการลบโปรเจกต์" : "Delete project?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {locale === "th"
                ? `ต้องการลบ "${deleteTarget?.name ?? ""}" ถาวรหรือไม่? ระบบจะลบข้อมูลโปรเจกต์นี้ออกจริง ไม่ใช่แค่ซ่อน และไม่สามารถย้อนกลับได้`
                : `Permanently delete "${deleteTarget?.name ?? ""}"? This removes the project data instead of hiding it, and cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteReviewMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteReviewMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmDeleteReview();
              }}
            >
              {deleteReviewMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {locale === "th" ? "กำลังลบ..." : "Deleting..."}
                </>
              ) : (
                locale === "th" ? "ลบถาวร" : "Delete permanently"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {galleryLightbox ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-3"
          role="dialog"
          aria-modal="true"
          aria-label={galleryLightbox.title}
          onClick={() => setGalleryLightbox(null)}
        >
          <div className="flex max-h-full w-full max-w-6xl flex-col gap-3" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 text-white">
              <div className="min-w-0 truncate text-sm font-medium">{galleryLightbox.title}</div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void openStoryboardImageTools(galleryLightbox.url, "split", galleryLightbox.title);
                    setGalleryLightbox(null);
                  }}
                >
                  <Scissors className="mr-2 h-4 w-4" />
                  {locale === "th" ? "ตัดภาพ" : "Split"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void openStoryboardImageTools(galleryLightbox.url, "crop", galleryLightbox.title);
                    setGalleryLightbox(null);
                  }}
                >
                  <Crop className="mr-2 h-4 w-4" />
                  {locale === "th" ? "ครอป" : "Crop"}
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setGalleryLightbox(null)}>
                  <X className="mr-2 h-4 w-4" />
                  {locale === "th" ? "ปิด" : "Close"}
                </Button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-black">
              <img
                src={galleryLightbox.url}
                alt={galleryLightbox.title}
                className="max-h-[calc(100dvh-8rem)] max-w-full object-contain"
                draggable
                onDragStart={(event) => startStoryboardImageDrag(event, {
                  url: galleryLightbox.url,
                  title: galleryLightbox.title,
                })}
              />
            </div>
          </div>
        </div>
      ) : null}
      {videoPreview ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-3"
          role="dialog"
          aria-modal="true"
          aria-label={videoPreview.title}
          onClick={() => setVideoPreview(null)}
        >
          <div
            className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100dvw-1rem)] max-w-none flex-col gap-2 sm:h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-1.5rem)] sm:w-[calc(100dvw-1.5rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 text-white">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{videoPreview.title}</div>
                {videoPreview.subtitle ? (
                  <div className="truncate text-xs text-white/70">{videoPreview.subtitle}</div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={replayVideoPreview}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {locale === "th" ? "Replay" : "Replay"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => downloadStoryboardMedia(videoPreview.url, videoPreview.title, "mp4")}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {locale === "th" ? "ดาวน์โหลด" : "Download"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => window.open(videoPreview.url, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {locale === "th" ? "เปิดแท็บใหม่" : "Open"}
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setVideoPreview(null)}>
                  <X className="mr-2 h-4 w-4" />
                  {locale === "th" ? "ปิด" : "Close"}
                </Button>
              </div>
            </div>
            {(() => {
              const overlay = videoPreview.overlayPreview;
              const hasOverlayCopy = Boolean(
                overlay?.titleText ||
                overlay?.hookText ||
                overlay?.priceText ||
                overlay?.chips?.some(line => line.trim().length > 0),
              );
              const hasSubtitleCopy = Boolean(overlay?.subtitleText?.trim());
              const modalSubtitleFontSize = overlay?.subtitleFontSizePx ?? 18;
              const modalSubtitleFontSizeCss = `clamp(${modalSubtitleFontSize}px, 4.2cqw, ${Math.max(
                28,
                Math.round(modalSubtitleFontSize * 2.1),
              )}px)`;
              return (
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-black">
                  <div
                    className="hf-preview-stage hf-preview-stage--modal relative aspect-[9/16] overflow-hidden rounded-lg bg-black p-4 text-left text-slate-950"
                    data-preset={overlay?.overlayPreset ?? "auto"}
                    data-text-motion={overlay?.textMotionPreset ?? "none"}
                    data-has-media="true"
                    data-has-overlay-copy={hasOverlayCopy ? "true" : "false"}
                    data-subtitle-preset={overlay?.subtitlePreset ?? "classic_box"}
                    data-preview-mode="video"
                  >
                    {overlay?.posterUrl && !videoPreviewPlaybackReady ? (
                      <img
                        src={overlay.posterUrl}
                        alt=""
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 z-[5] h-full w-full object-cover opacity-95"
                      />
                    ) : null}
                    <video
                      key={videoPreview.url}
                      ref={videoPreviewVideoRef}
                      src={videoPreview.url}
                      poster={overlay?.posterUrl ?? undefined}
                      controls
                      autoPlay
                      playsInline
                      preload="auto"
                      className={cn(
                        "absolute inset-0 z-10 h-full w-full bg-transparent object-cover transition-opacity duration-200",
                        "opacity-100",
                      )}
                      onLoadStart={() => {
                        setVideoPreviewError("");
                      }}
                      onLoadedData={() => {
                        setVideoPreviewPlaybackReady(true);
                        setVideoPreviewError("");
                      }}
                      onCanPlay={() => {
                        setVideoPreviewPlaybackReady(true);
                        setVideoPreviewError("");
                      }}
                      onPlay={(event) => {
                        const video = event.currentTarget;
                        if (!video) return;
                        if (videoPreviewEndedRef.current || video.currentTime <= 0.25) {
                          videoPreviewEndedRef.current = false;
                          restartVideoPreviewOverlayAnimation();
                        }
                      }}
                      onPlaying={() => {
                        setVideoPreviewPlaybackReady(true);
                        setVideoPreviewError("");
                      }}
                      onSeeked={(event) => {
                        const video = event.currentTarget;
                        if (!video) return;
                        if (video.currentTime <= 0.25) {
                          restartVideoPreviewOverlayAnimation();
                        }
                      }}
                      onTimeUpdate={(event) => {
                        const video = event.currentTarget;
                        if (!video || video.currentTime <= 0.02) return;
                        videoPreviewEndedRef.current = false;
                        setVideoPreviewPlaybackReady(true);
                        setVideoPreviewError("");
                      }}
                      onEnded={() => {
                        videoPreviewEndedRef.current = true;
                      }}
                      onError={(event) => {
                        const code = event.currentTarget.error?.code;
                        setVideoPreviewPlaybackReady(false);
                        setVideoPreviewError(
                          code === 2
                            ? locale === "th" ? "โหลดวิดีโอไม่สำเร็จจากปัญหาเครือข่าย" : "Network error while loading this video."
                            : code === 3
                              ? locale === "th" ? "เบราว์เซอร์ถอดรหัสวิดีโอนี้ไม่ได้" : "The browser could not decode this video."
                              : code === 4
                                ? locale === "th" ? "รูปแบบไฟล์วิดีโอนี้ไม่รองรับใน browser" : "This video format is not supported by the browser."
                                : locale === "th" ? "โหลดวิดีโอนี้ไม่สำเร็จ" : "Could not load this video.",
                        );
                      }}
                    />
                    {videoPreviewError ? (
                      <div className="absolute inset-x-4 top-4 z-40 rounded-md bg-red-950/85 px-3 py-2 text-center text-xs font-semibold leading-relaxed text-white shadow-lg">
                        {videoPreviewError}
                      </div>
                    ) : null}
                    {hasOverlayCopy ? (
                      <div
                        key={`hf-video-preview-overlay-${videoPreview.url}-${videoPreviewOverlayReplayKey}`}
                        className="hf-preview-overlay-copy pointer-events-none absolute inset-0 z-20 flex h-full min-h-0 flex-col justify-between p-4"
                      >
                        <div className="hf-preview-copy-top">
                          {overlay?.layerLabel ? (
                            <div className="hf-preview-layer-tag mb-2 inline-flex rounded-full bg-white/90 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-900 shadow-sm">
                              {overlay.layerLabel}
                            </div>
                          ) : null}
                          {overlay?.titleText ? (
                            <div className="hf-preview-title max-w-[92%] font-black">
                              {overlay.titleText}
                            </div>
                          ) : null}
                          {overlay?.priceText ? (
                            <div className="hf-preview-price mt-2 font-black text-yellow-400 drop-shadow">
                              {overlay.priceText}
                            </div>
                          ) : overlay?.hookText ? (
                            <div className="hf-preview-hook mt-2 font-extrabold">
                              {overlay.hookText}
                            </div>
                          ) : null}
                        </div>
                        {overlay?.presetKind !== "clean" && overlay?.chips?.some(line => line.trim().length > 0) ? (
                          <div
                            className={cn(
                              "hf-preview-chip-list mt-4 grid gap-2",
                              overlay?.presetKind === "spec" ? "ml-auto w-[58%]" : "w-full",
                              overlay?.presetKind === "cards" ? "grid-cols-2" : "",
                            )}
                          >
                            {overlay.chips.filter(Boolean).slice(0, Math.max(0, getHyperframesOverlayLineLimit(overlay.overlayPreset ?? "auto") - 2)).map((line, index) => (
                              <div
                                key={`${line}-${index}`}
                                className={cn(
                                  "hf-preview-chip rounded-full px-3 py-2 font-black shadow-sm",
                                  overlay?.overlayPreset === "neon_gaming_specs"
                                    ? "border border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
                                    : overlay?.presetKind === "price"
                                      ? "bg-white text-slate-950"
                                      : "bg-white/85 text-slate-950",
                                )}
                              >
                                {line}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {hasSubtitleCopy ? (
                      <div
                        className="hf-sub-preview-inline pointer-events-none z-30"
                        data-subtitle-preset={overlay?.subtitlePreset ?? "classic_box"}
                      >
                        {overlay?.subtitlePreset === "karaoke_word" ? (
                          <div className="hf-sub-line" style={{ fontSize: modalSubtitleFontSizeCss }}>
                            {(overlay.subtitleText ?? "").split(/\s+/).filter(Boolean).map((word, wordIndex) => (
                              <span key={`${word}-${wordIndex}`} className="hf-sub-word">
                                {word}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="hf-sub-line" style={{ fontSize: modalSubtitleFontSizeCss }}>
                            {overlay?.subtitleText}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}

      {renderJobId ? (
        <RenderProgressDialog
          jobId={renderJobId}
          onComplete={(outputPath) => {
            const completedJobId = renderJobId;
            setRenderJobId(null);
            setAndSaveDraft((current) => ({
              ...current,
              renderJobId: null,
              compoundStatus: t("mediaStudio.storyboardReviewRenderCompleteStatus", { outputPath }),
            }));
            toast.success(t("mediaStudio.storyboardReviewRenderComplete"));
            const fallbackRenderTitle = draft ? `${getStoryboardReviewName(draft)} - Final video` : undefined;
            const fallbackRenderMetadata = buildRenderTraceabilityMetadata({
              sourceFlow: "storyboard_review_page_compound_render",
              sourceSurface: "storyboard_review_page",
              title: draft ? getStoryboardReviewName(draft) : null,
              reviewId: draft?.reviewId ?? canonicalReviewId ?? null,
              clipCount: draft?.tasks.length ?? null,
              selectedClipCount: selectedRenderClips.length,
              productionContext: resolveStoryboardDraftProductionContext(draft),
              marketplaceProduct: resolveStoryboardDraftMarketplaceProduct(draft),
            });
            const libraryMetadata = renderLibraryMetadataRef.current[completedJobId] ?? {
              title: fallbackRenderTitle,
              metadata: fallbackRenderMetadata,
            };
            delete renderLibraryMetadataRef.current[completedJobId];
            void addRenderToLibraryMutation
              .mutateAsync({
                jobId: completedJobId,
                title: libraryMetadata?.title ?? fallbackRenderTitle,
                metadata: libraryMetadata?.metadata,
              })
              .then((result) => {
                toast.success(
                  result.created
                    ? t("mediaStudio.storyboardReviewRenderLibrarySaved")
                    : t("mediaStudio.storyboardReviewRenderLibraryAlreadySaved"),
                );
                void trpcUtils.library.search.invalidate();
              })
              .catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                toast.warning(t("mediaStudio.storyboardReviewRenderLibrarySaveFailed", { message }));
              });
          }}
          onCancel={() => {
            setRenderJobId(null);
            setAndSaveDraft((current) => ({ ...current, renderJobId: null, compoundStatus: t("mediaStudio.storyboardReviewRenderCancelled") }));
          }}
          autoCompleteOnDone
        />
      ) : null}
    </div>
  );
}
