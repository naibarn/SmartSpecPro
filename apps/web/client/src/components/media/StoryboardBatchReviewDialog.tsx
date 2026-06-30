import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from "react";
import { AlertCircle, ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Copy, Download, ExternalLink, ImagePlus, Loader2, Maximize2, Mic2, Minus, Music2, Pause, Pencil, Play, Plus, RefreshCw, RotateCcw, Scissors, Trash2, Upload, Video, Volume2, VolumeX, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import ImageSourcePicker from "@/components/media/ImageSourcePicker";
import {
  STORYBOARD_DEFAULT_TRANSITION_DURATION_MS,
  STORYBOARD_RENDER_TRANSITION_OPTIONS,
  type StoryboardClipMediaType,
  type StoryboardClipTransition,
  type StoryboardClipTransitionName,
  type StoryboardCompanionAudioCandidate,
  type StoryboardRenderAspectRatioMode,
} from "@/lib/storyboardVideoProject";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { cn } from "@/lib/utils";
import {
  getArticleStoryboardReviewMetadata,
  isArticleStoryboardOverlayPromptLike,
  updateArticleStoryboardOverlayMetadata,
  updateArticleStoryboardVoiceMetadata,
  type ArticleStoryboardReviewMetadata,
} from "@shared/articleStoryboardVideo";

const STORYBOARD_SHOT_DURATION_OPTIONS_SECONDS = [4, 6, 8, 10, 12, 15] as const;
const STORYBOARD_TRIM_FALLBACK_DURATION_SECONDS = 8;
const STORYBOARD_TRIM_MAX_DISABLED_RANGES = 5;
const STORYBOARD_TRIM_MIN_DISABLED_RANGE_SECONDS = 0.3;
const STORYBOARD_TRIM_MIN_KEPT_DURATION_SECONDS = 1;
const STORYBOARD_TRIM_MERGE_GAP_SECONDS = 0.2;
const STORYBOARD_TRIM_TIMELINE_MIN_ZOOM = 1;
const STORYBOARD_TRIM_TIMELINE_MAX_ZOOM = 16;

export interface StoryboardSourceTrimRange {
  inSec: number;
  outSec: number;
  sourceDurationSec?: number;
  disabledRanges?: Array<{ startSec: number; endSec: number }>;
}

export interface StoryboardReviewTask {
  id: string;
  index: number;
  prompt: string;
  url?: string | null;
  model?: string;
  durationSeconds?: number;
  mediaType?: StoryboardClipMediaType;
  transition?: StoryboardClipTransition;
  generationModelId?: string;
  referenceUrls?: string[];
  generationAspectRatio?: string;
  generationExtraParams?: Record<string, unknown>;
  referenceFrameRoles?: Array<"start" | "stop" | "reference">;
  marketplaceProduct?: {
    productId?: string | null;
    platform?: "shopee" | "tiktok_shop" | null;
    productName?: string | null;
    shopName?: string | null;
    shopId?: string | null;
    itemId?: string | null;
    sourceUrl?: string | null;
    affiliateUrl?: string | null;
  } | null;
  canRegenerate?: boolean;
  isImported?: boolean;
  status: "queued" | "generating" | "completed" | "error";
  error?: string;
}

export interface StoryboardPromptPlannerOptions {
  includeVoiceover: boolean;
  speechMode: "none" | "en" | "th" | "other";
  speechLanguage?: string;
  includeSound: boolean;
  tone: "sales" | "premium" | "demo" | "ugc" | "cinematic";
  language: "auto" | "th" | "en";
}

function getStoryboardPromptPlannerOptionsSignature(
  options: StoryboardPromptPlannerOptions | null | undefined,
): string {
  if (!options) return "";
  return [
    options.includeVoiceover ? "voice" : "silent",
    options.speechMode,
    String(options.speechLanguage ?? "").trim(),
    options.includeSound ? "sound" : "no-sound",
    options.tone,
    options.language,
  ].join("|");
}

interface StoryboardBatchReviewDialogProps {
  open: boolean;
  tasks: StoryboardReviewTask[];
  selectedTaskIds: string[];
  onOpenChange: (open: boolean) => void;
  onToggleTask: (taskId: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onRegenerateTask: (taskId: string, prompt: string) => boolean | void | Promise<boolean | void>;
  onUpdateTaskPrompt?: (taskId: string, prompt: string) => void | Promise<void>;
  onUpdateTaskExtraParams?: (taskId: string, extraParams: Record<string, unknown>) => void | Promise<void>;
  onUpdateTaskDuration?: (taskId: string, durationSeconds: number) => void | Promise<void>;
  onUpdateTaskSourceTrim?: (taskId: string, trim: StoryboardSourceTrimRange | null) => void | Promise<void>;
  onUpdateTaskTransition?: (taskId: string, transition?: StoryboardClipTransition) => void | Promise<void>;
  conceptDetails?: string | null;
  onConceptDetailsChange?: (value: string) => void | Promise<void>;
  storyboardGuide?: string | null;
  onStoryboardGuideChange?: (value: string) => void | Promise<void>;
  voiceoverFullScript?: string | null;
  onVoiceoverFullScriptChange?: (value: string) => void | Promise<void>;
  useVoiceoverScriptAsConcept?: boolean;
  onUseVoiceoverScriptAsConceptChange?: (value: boolean) => void | Promise<void>;
  onPlanScenePrompts?: (options: StoryboardPromptPlannerOptions, taskId?: string) => void | Promise<void>;
  plannerOptions?: StoryboardPromptPlannerOptions;
  onPlannerOptionsChange?: (options: StoryboardPromptPlannerOptions) => void;
  isPlanningScenePrompts?: boolean;
  onRegenerateVideoSegmentPrompt?: (taskId: string, segmentId: string) => void | Promise<void>;
  onSplitVideoSegmentToPerShot?: (taskId: string, segmentId: string) => void | Promise<void>;
  onStartGenerationBatch?: () => void;
  onCancelGeneration?: () => void | Promise<void>;
  onReplaceReferenceFrame?: (taskId: string, frameIndex: 0 | 1, imageUrl: string) => void | Promise<void>;
  onUpdateReferenceFrameRole?: (taskId: string, frameIndex: 0 | 1, role: "start" | "stop" | "reference") => void | Promise<void>;
  onUploadReferenceFrame?: (taskId: string, frameIndex: 0 | 1, files: FileList | File[]) => Promise<string[]>;
  replacingReferenceFrameKey?: string | null;
  onUploadVideoSlot?: (
    taskId: string,
    mode: "replace" | "insert-after",
    media?: File | FileList | File[] | string | { url: string; mediaType: StoryboardClipMediaType },
  ) => void | Promise<void>;
  uploadingVideoSlotKey?: string | null;
  onMoveTask?: (taskId: string, direction: "up" | "down") => void;
  onRemoveTask?: (taskId: string) => void;
  onAutoCompound: () => void;
  onCreateProject: () => void;
  onCreateHyperframesFinalComposite?: () => void;
  isCompounding: boolean;
  isCreatingProject: boolean;
  isCreatingHyperframesFinalComposite?: boolean;
  hyperframesFinalCompositeDisabledReason?: string | null;
  hyperframesFinalCompositeStatus?: string | null;
  isCancellingGeneration?: boolean;
  regeneratingTaskId?: string | null;
  regeneratingVideoSegmentPromptTaskId?: string | null;
  compoundStatus?: string | null;
  projectLink?: string | null;
  companionAudio?: StoryboardCompanionAudioCandidate[];
  regeneratingAudioId?: string | null;
  onRegenerateAudio?: (audioId: string) => void;
  onRemoveAudio?: (audioId: string) => void;
  muteVideoPreviewAudio?: boolean;
  renderDurationSeconds?: number | null;
  renderAspectRatioMode?: StoryboardRenderAspectRatioMode;
  onRenderAspectRatioModeChange?: (mode: StoryboardRenderAspectRatioMode) => void;
  renderOutputLabel?: string | null;
  renderAspectRatioSourceLabel?: string | null;
  mediaAttachTargetTaskId?: string | null;
  mediaAttachTargetFrameIndex?: 0 | 1 | null;
  onMediaAttachTargetChange?: (taskId: string | null, frameIndex?: 0 | 1 | null) => void;
}

export interface StoryboardBatchReviewPanelProps extends Omit<StoryboardBatchReviewDialogProps, "open"> {
  closeLabel?: string;
  className?: string;
  contentClassName?: string;
  showCloseButton?: boolean;
  tabletPageFlow?: boolean;
}

type StoryboardConfirmAction = "generate" | "render" | "project";
type StoryboardLightboxMedia = {
  type: "image" | "video";
  url: string;
  title: string;
} | null;

function findScrollableParent(element: HTMLElement | null): HTMLElement | null {
  let current = element?.parentElement ?? null;
  while (current) {
    const style = window.getComputedStyle(current);
    const canScroll =
      /(auto|scroll)/.test(style.overflowY) &&
      current.scrollHeight > current.clientHeight;
    if (canScroll) return current;
    current = current.parentElement;
  }
  return null;
}

function summarizePrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized;
}

function getFirstLastFrameUrls(task: StoryboardReviewTask): string[] | null {
  const referenceUrls = (task.referenceUrls ?? [])
    .map((url) => String(url || "").trim())
    .filter((url) => url.length > 0);
  if (referenceUrls.length < 1) return null;
  return referenceUrls.slice(0, 2);
}

function getReferenceFrameRole(task: StoryboardReviewTask, frameIndex: 0 | 1): "start" | "stop" | "reference" {
  const role = task.referenceFrameRoles?.[frameIndex] ?? (task.generationExtraParams?.referenceFrameRoles as unknown[] | undefined)?.[frameIndex];
  return role === "reference" || role === "stop" || role === "start"
    ? role
    : frameIndex === 0 ? "start" : "stop";
}

function referenceFrameRoleLabel(role: "start" | "stop" | "reference", locale: string, short = false): string {
  if (role === "reference") return locale === "th" ? (short ? "Ref" : "ภาพ Reference") : (short ? "Ref" : "Reference image");
  if (role === "stop") return locale === "th" ? (short ? "End" : "Stop Frame") : (short ? "End" : "Stop frame");
  return locale === "th" ? (short ? "Start" : "Start Frame") : (short ? "Start" : "Start frame");
}

function isStoryboardImageMedia(task: StoryboardReviewTask): boolean {
  const url = String(task.url ?? "").trim();
  return task.mediaType === "image"
    || url.startsWith("data:image/")
    || /\.(jpg|jpeg|png|webp|gif|avif|bmp|tiff|svg)(?:[?#].*)?$/i.test(url);
}

function isStoryboardSlotMediaUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:image/") || trimmed.startsWith("data:video/")) return true;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/")) return true;
  return /\.(mp4|webm|mov|avi|mkv|jpg|jpeg|png|webp|gif|avif|bmp|tiff|svg)(?:[?#].*)?$/i.test(trimmed);
}

function isStoryboardMediaFile(file: File): boolean {
  return file.type.startsWith("video/")
    || file.type.startsWith("image/")
    || /\.(mp4|webm|mov|avi|mkv|jpg|jpeg|png|webp|gif|avif|bmp|tiff|svg)$/i.test(file.name);
}

function getTaskVideoSegmentId(task: StoryboardReviewTask): string {
  return typeof task.generationExtraParams?.videoSegmentId === "string"
    ? task.generationExtraParams.videoSegmentId.trim()
    : "";
}

function getTransitionLabel(name: StoryboardClipTransitionName, locale: string): string {
  const option = STORYBOARD_RENDER_TRANSITION_OPTIONS.find((item) => item.name === name);
  if (!option) return name;
  return locale === "th" ? option.labelTh : option.labelEn;
}

function roundStoryboardTrimSecond(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampStoryboardTrimTimelineZoom(value: number): number {
  if (!Number.isFinite(value)) return STORYBOARD_TRIM_TIMELINE_MIN_ZOOM;
  return Math.max(
    STORYBOARD_TRIM_TIMELINE_MIN_ZOOM,
    Math.min(STORYBOARD_TRIM_TIMELINE_MAX_ZOOM, Math.round(value * 10) / 10),
  );
}

function readStoryboardSourceTrim(value: unknown): StoryboardSourceTrimRange | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const inSec = Number(record.inSec);
  const outSec = Number(record.outSec);
  if (!Number.isFinite(inSec) || !Number.isFinite(outSec) || outSec <= inSec) return null;
  const sourceDurationSec = Number(record.sourceDurationSec);
  return {
    inSec: Math.max(0, roundStoryboardTrimSecond(inSec)),
    outSec: Math.max(0.1, roundStoryboardTrimSecond(outSec)),
    ...(Number.isFinite(sourceDurationSec) && sourceDurationSec > 0
      ? { sourceDurationSec: roundStoryboardTrimSecond(sourceDurationSec) }
      : {}),
    disabledRanges: Array.isArray(record.disabledRanges)
      ? record.disabledRanges
          .map((range) => {
            const rangeRecord = range && typeof range === "object" && !Array.isArray(range)
              ? range as Record<string, unknown>
              : {};
            const startSec = Number(rangeRecord.startSec);
            const endSec = Number(rangeRecord.endSec);
            return Number.isFinite(startSec) && Number.isFinite(endSec) && endSec > startSec
              ? { startSec: roundStoryboardTrimSecond(startSec), endSec: roundStoryboardTrimSecond(endSec) }
              : null;
          })
          .filter((range): range is { startSec: number; endSec: number } => Boolean(range))
      : undefined,
  };
}

function normalizeStoryboardDisabledRanges(
  ranges: Array<{ startSec: number; endSec: number }> | undefined,
  inSec: number,
  outSec: number,
): Array<{ startSec: number; endSec: number }> {
  const normalized = (ranges ?? [])
    .map((range) => {
      const startSec = Math.max(inSec, Math.min(outSec, roundStoryboardTrimSecond(range.startSec)));
      const endSec = Math.max(inSec, Math.min(outSec, roundStoryboardTrimSecond(range.endSec)));
      return endSec - startSec >= STORYBOARD_TRIM_MIN_DISABLED_RANGE_SECONDS
        ? { startSec, endSec }
        : null;
    })
    .filter((range): range is { startSec: number; endSec: number } => Boolean(range))
    .sort((a, b) => a.startSec - b.startSec);

  const merged: Array<{ startSec: number; endSec: number }> = [];
  for (const range of normalized) {
    const previous = merged[merged.length - 1];
    if (previous && range.startSec <= previous.endSec + STORYBOARD_TRIM_MERGE_GAP_SECONDS) {
      previous.endSec = Math.max(previous.endSec, range.endSec);
    } else {
      merged.push({ ...range });
    }
  }

  return merged.slice(0, STORYBOARD_TRIM_MAX_DISABLED_RANGES).map((range) => ({
    startSec: roundStoryboardTrimSecond(range.startSec),
    endSec: roundStoryboardTrimSecond(range.endSec),
  }));
}

function storyboardDisabledDurationSeconds(ranges: Array<{ startSec: number; endSec: number }> | undefined): number {
  return roundStoryboardTrimSecond(
    (ranges ?? []).reduce((sum, range) => sum + Math.max(0, range.endSec - range.startSec), 0)
  );
}

function getStoryboardTrimPreviewPlayableTime(
  currentTime: number,
  trim: StoryboardSourceTrimRange,
): number {
  let nextTime = Math.max(trim.inSec, Math.min(trim.outSec, currentTime));
  const disabledRanges = normalizeStoryboardDisabledRanges(trim.disabledRanges, trim.inSec, trim.outSec);
  for (const range of disabledRanges) {
    if (nextTime >= range.startSec - 0.03 && nextTime < range.endSec - 0.03) {
      nextTime = range.endSec;
    }
  }
  return roundStoryboardTrimSecond(Math.max(trim.inSec, Math.min(trim.outSec, nextTime)));
}

function getTaskSourceTrim(task: StoryboardReviewTask): StoryboardSourceTrimRange | null {
  return readStoryboardSourceTrim(task.generationExtraParams?.sourceTrim);
}

function getTaskTrimSourceDuration(task: StoryboardReviewTask, trim: StoryboardSourceTrimRange | null): number {
  const sourceDuration = trim?.sourceDurationSec;
  if (Number.isFinite(sourceDuration) && sourceDuration && sourceDuration > 0) return sourceDuration;
  const taskDuration = Number(task.durationSeconds);
  if (Number.isFinite(taskDuration) && taskDuration > 0) return taskDuration;
  return STORYBOARD_TRIM_FALLBACK_DURATION_SECONDS;
}

function createStoryboardTrimDraft(task: StoryboardReviewTask): StoryboardSourceTrimRange {
  const trim = getTaskSourceTrim(task);
  const sourceDurationSec = Math.max(0.5, getTaskTrimSourceDuration(task, trim));
  const inSec = Math.min(sourceDurationSec - 0.1, Math.max(0, trim?.inSec ?? 0));
  const outSec = Math.max(inSec + 0.1, Math.min(sourceDurationSec, trim?.outSec ?? sourceDurationSec));
  return {
    inSec: roundStoryboardTrimSecond(inSec),
    outSec: roundStoryboardTrimSecond(outSec),
    sourceDurationSec: roundStoryboardTrimSecond(sourceDurationSec),
    disabledRanges: normalizeStoryboardDisabledRanges(trim?.disabledRanges, inSec, outSec),
  };
}

function isFullStoryboardTrim(trim: StoryboardSourceTrimRange): boolean {
  const sourceDurationSec = trim.sourceDurationSec ?? trim.outSec;
  return trim.inSec <= 0.05 && trim.outSec >= sourceDurationSec - 0.05 && (!trim.disabledRanges || trim.disabledRanges.length === 0);
}

function readStoryboardSourceTrimDerivedStatus(extraParams: Record<string, unknown> | undefined): {
  status: string;
  url?: string;
} | null {
  const derived = extraParams?.sourceTrimDerived;
  if (!derived || typeof derived !== "object" || Array.isArray(derived)) return null;
  const record = derived as Record<string, unknown>;
  const status = typeof record.status === "string" ? record.status : "";
  const url = typeof record.url === "string" ? record.url.trim() : "";
  if (!status) return null;
  return {
    status,
    ...(url ? { url } : {}),
  };
}

export function StoryboardBatchReviewPanel({
  tasks,
  selectedTaskIds,
  onOpenChange,
  onToggleTask,
  onSelectAll,
  onSelectNone,
  onRegenerateTask,
  onUpdateTaskPrompt,
  onUpdateTaskExtraParams,
  onUpdateTaskDuration,
  onUpdateTaskSourceTrim,
  onUpdateTaskTransition,
  conceptDetails,
  onConceptDetailsChange,
  storyboardGuide,
  onStoryboardGuideChange,
  voiceoverFullScript,
  onVoiceoverFullScriptChange,
  useVoiceoverScriptAsConcept = false,
  onUseVoiceoverScriptAsConceptChange,
  onPlanScenePrompts,
  plannerOptions,
  onPlannerOptionsChange,
  isPlanningScenePrompts = false,
  onSplitVideoSegmentToPerShot,
  onStartGenerationBatch,
  onCancelGeneration,
  onReplaceReferenceFrame,
  onUpdateReferenceFrameRole,
  onUploadReferenceFrame,
  replacingReferenceFrameKey,
  onUploadVideoSlot,
  uploadingVideoSlotKey,
  onMoveTask,
  onRemoveTask,
  onAutoCompound,
  onCreateProject,
  onCreateHyperframesFinalComposite,
  isCompounding,
  isCreatingProject,
  isCreatingHyperframesFinalComposite = false,
  hyperframesFinalCompositeDisabledReason = null,
  hyperframesFinalCompositeStatus = null,
  isCancellingGeneration = false,
  regeneratingTaskId,
  compoundStatus,
  projectLink,
  companionAudio = [],
  regeneratingAudioId,
  onRegenerateAudio,
  onRemoveAudio,
  muteVideoPreviewAudio = false,
  renderDurationSeconds,
  renderAspectRatioMode = "auto",
  onRenderAspectRatioModeChange,
  renderOutputLabel,
  renderAspectRatioSourceLabel,
  mediaAttachTargetTaskId = null,
  mediaAttachTargetFrameIndex = null,
  onMediaAttachTargetChange,
  closeLabel = "Close",
  className,
  contentClassName,
  showCloseButton = true,
  tabletPageFlow = false,
}: StoryboardBatchReviewPanelProps) {
  const { t, locale } = useScopedTranslation(["media", "common"]);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draftPrompts, setDraftPrompts] = useState<Record<string, string>>({});
  const [isGeneratingSelected, setIsGeneratingSelected] = useState(false);
  const [isCancellingSelected, setIsCancellingSelected] = useState(false);
  const [expandedMetadataTaskId, setExpandedMetadataTaskId] = useState<string | null>(null);
  const [expandedArticleVideoMetadataTaskId, setExpandedArticleVideoMetadataTaskId] = useState<string | null>(null);
  const [expandedFrameTaskId, setExpandedFrameTaskId] = useState<string | null>(null);
  const [isGuidanceExpanded, setIsGuidanceExpanded] = useState(false);
  const [plannerSpeechMode, setPlannerSpeechMode] = useState<StoryboardPromptPlannerOptions["speechMode"]>(
    plannerOptions?.speechMode ?? "none",
  );
  const [plannerOtherSpeechLanguage, setPlannerOtherSpeechLanguage] = useState(
    plannerOptions?.speechMode === "other" ? plannerOptions.speechLanguage ?? "" : "",
  );
  const [plannerIncludeSound, setPlannerIncludeSound] = useState(Boolean(plannerOptions?.includeSound));
  const [plannerTone, setPlannerTone] = useState<StoryboardPromptPlannerOptions["tone"]>(
    plannerOptions?.tone ?? "sales",
  );
  const [plannerLanguage, setPlannerLanguage] = useState<StoryboardPromptPlannerOptions["language"]>(
    plannerOptions?.language ?? (locale === "th" ? "th" : "auto"),
  );
  const [isEditingVoiceoverFullScript, setIsEditingVoiceoverFullScript] = useState(false);
  const [voiceoverFullScriptDraft, setVoiceoverFullScriptDraft] = useState(voiceoverFullScript ?? "");
  const [confirmAction, setConfirmAction] = useState<StoryboardConfirmAction | null>(null);
  const [copiedPromptTaskId, setCopiedPromptTaskId] = useState<string | null>(null);
  const [lightboxMedia, setLightboxMedia] = useState<StoryboardLightboxMedia>(null);
  const [draggingVideoTaskId, setDraggingVideoTaskId] = useState<string | null>(null);
  const [expandedTrimTaskId, setExpandedTrimTaskId] = useState<string | null>(null);
  const [trimDrafts, setTrimDrafts] = useState<Record<string, StoryboardSourceTrimRange>>({});
  const [disabledRangeDrafts, setDisabledRangeDrafts] = useState<Record<string, { startSec: number; endSec: number }>>({});
  const [trimPreviewTimes, setTrimPreviewTimes] = useState<Record<string, number>>({});
  const [trimTimelineZooms, setTrimTimelineZooms] = useState<Record<string, number>>({});
  const [trimTimelineCenters, setTrimTimelineCenters] = useState<Record<string, number>>({});
  const [trimTimelineDrag, setTrimTimelineDrag] = useState<{
    taskId: string;
    mode: "playhead" | "cut-start" | "cut-end" | "cut-range";
    rangeOffsetSec?: number;
  } | null>(null);
  const [trimPreviewMuted, setTrimPreviewMuted] = useState(false);
  const [playingTrimTaskId, setPlayingTrimTaskId] = useState<string | null>(null);
  const trimVideoRef = useRef<HTMLVideoElement | null>(null);
  const showGenerationCancel = Boolean(onCancelGeneration) && (Boolean(regeneratingTaskId) || isGeneratingSelected);
  const plannerSpeechLanguage = plannerSpeechMode === "th"
    ? "Thai"
    : plannerSpeechMode === "en"
      ? "English"
      : plannerSpeechMode === "other"
        ? plannerOtherSpeechLanguage.trim()
        : "";
  const currentPlannerOptions = useMemo<StoryboardPromptPlannerOptions>(() => ({
    includeVoiceover: plannerSpeechMode !== "none",
    speechMode: plannerSpeechMode,
    speechLanguage: plannerSpeechLanguage,
    includeSound: plannerIncludeSound,
    tone: plannerTone,
    language: plannerLanguage,
  }), [
    plannerIncludeSound,
    plannerLanguage,
    plannerSpeechLanguage,
    plannerSpeechMode,
    plannerTone,
  ]);
  const plannerOptionsSignature = useMemo(
    () => getStoryboardPromptPlannerOptionsSignature(plannerOptions),
    [
      plannerOptions?.includeSound,
      plannerOptions?.includeVoiceover,
      plannerOptions?.language,
      plannerOptions?.speechLanguage,
      plannerOptions?.speechMode,
      plannerOptions?.tone,
    ],
  );
  const currentPlannerOptionsSignature = useMemo(
    () => getStoryboardPromptPlannerOptionsSignature(currentPlannerOptions),
    [currentPlannerOptions],
  );
  const didMountPlannerOptionsRef = useRef(false);
  const lastSyncedPlannerOptionsSignatureRef = useRef(plannerOptionsSignature);

  useEffect(() => {
    if (!isEditingVoiceoverFullScript) {
      setVoiceoverFullScriptDraft(voiceoverFullScript ?? "");
    }
  }, [isEditingVoiceoverFullScript, voiceoverFullScript]);

  useEffect(() => {
    if (!plannerOptions) return;
    lastSyncedPlannerOptionsSignatureRef.current = plannerOptionsSignature;
    setPlannerSpeechMode(plannerOptions.speechMode);
    setPlannerOtherSpeechLanguage(
      plannerOptions.speechMode === "other" ? plannerOptions.speechLanguage ?? "" : "",
    );
    setPlannerIncludeSound(Boolean(plannerOptions.includeSound));
    setPlannerTone(plannerOptions.tone);
    setPlannerLanguage(plannerOptions.language);
  }, [
    plannerOptions?.includeSound,
    plannerOptions?.language,
    plannerOptions?.speechLanguage,
    plannerOptions?.speechMode,
    plannerOptions?.tone,
    plannerOptionsSignature,
  ]);

  useEffect(() => {
    if (!onPlannerOptionsChange) return;
    if (!didMountPlannerOptionsRef.current) {
      didMountPlannerOptionsRef.current = true;
      return;
    }
    if (currentPlannerOptionsSignature === lastSyncedPlannerOptionsSignatureRef.current) return;
    lastSyncedPlannerOptionsSignatureRef.current = currentPlannerOptionsSignature;
    onPlannerOptionsChange(currentPlannerOptions);
  }, [currentPlannerOptions, currentPlannerOptionsSignature, onPlannerOptionsChange]);

  useEffect(() => {
    const clearDragState = () => setDraggingVideoTaskId(null);
    window.addEventListener("dragend", clearDragState);
    window.addEventListener("drop", clearDragState);
    return () => {
      window.removeEventListener("dragend", clearDragState);
      window.removeEventListener("drop", clearDragState);
    };
  }, []);

  useEffect(() => {
    setDraftPrompts((prev) => {
      const next: Record<string, string> = {};
      for (const task of tasks) {
        next[task.id] = task.id === editingTaskId
          ? (prev[task.id] ?? task.prompt)
          : task.prompt;
      }
      return next;
    });
  }, [editingTaskId, tasks]);

  const selectedCount = selectedTaskIds.length;
  const completedSelectedTasks = useMemo(
    () => tasks.filter((task) => selectedTaskIds.includes(task.id) && task.status === "completed" && task.url),
    [selectedTaskIds, tasks],
  );
  const guidanceSummary = useMemo(() => {
    const items = [
      conceptDetails ? `${locale === "th" ? "แนวคิด" : "Concept"}: ${summarizePrompt(conceptDetails)}` : "",
      storyboardGuide ? `${locale === "th" ? "Guide" : "Guide"}: ${summarizePrompt(storyboardGuide)}` : "",
      voiceoverFullScript ? `${locale === "th" ? "บทพูด" : "Script"}: ${summarizePrompt(voiceoverFullScript)}` : "",
    ].filter(Boolean);
    return items.length > 0
      ? items.join(" / ")
      : (locale === "th" ? "ยังไม่มีแนวทางเพิ่มเติมสำหรับการสร้าง prompt" : "No extra planning guidance yet");
  }, [conceptDetails, locale, storyboardGuide, voiceoverFullScript]);
  const generatableSelectedTasks = useMemo(
    () => tasks.filter((task) =>
      selectedTaskIds.includes(task.id)
      && task.canRegenerate !== false
      && task.status !== "completed"
      && task.status !== "generating"
    ),
    [selectedTaskIds, tasks],
  );
  const promptTargetTasks = useMemo(() => {
    const selected = selectedTaskIds.length > 0
      ? tasks.filter((task) => selectedTaskIds.includes(task.id))
      : tasks;
    return selected.filter((task) => task.canRegenerate !== false && task.status !== "generating");
  }, [selectedTaskIds, tasks]);
  const segmentPromptTargetTasks = useMemo(
    () => promptTargetTasks.filter((task) => getTaskVideoSegmentId(task)),
    [promptTargetTasks],
  );
  const shouldUseSegmentPromptPlanning =
    Boolean(onPlanScenePrompts) &&
    segmentPromptTargetTasks.length > 0 &&
    segmentPromptTargetTasks.length === promptTargetTasks.length;
  const generationCancelRequestedRef = useRef(false);
  const handleCopyTaskPrompt = async (taskId: string, prompt: string) => {
    const text = prompt.trim();
    if (!text) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
    setCopiedPromptTaskId(taskId);
    window.setTimeout(() => {
      setCopiedPromptTaskId((current) => current === taskId ? null : current);
    }, 1400);
  };

  const getDroppedStoryboardMedia = (dataTransfer: DataTransfer):
    | File[]
    | string
    | { url: string; mediaType: StoryboardClipMediaType }
    | null => {
    const files = Array.from(dataTransfer.files ?? []).filter(isStoryboardMediaFile);
    if (files.length) return files;

    const mediaType = dataTransfer.getData("application/x-smartspec-media-type")
      || dataTransfer.getData("text/x-smartspec-media-type");
    const droppedUrl = (dataTransfer.getData("text/uri-list") || dataTransfer.getData("text/plain")).trim();
    if (!droppedUrl) return null;
    if (mediaType === "image" || mediaType === "video") {
      return {
        url: droppedUrl,
        mediaType: mediaType === "image" ? "image" : "video",
      };
    }
    return isStoryboardSlotMediaUrl(droppedUrl) ? droppedUrl : null;
  };

  const handleStoryboardMediaDragOver = (
    event: DragEvent<HTMLElement>,
    dragKey: string,
  ) => {
    if (!onUploadVideoSlot) return;
    const files = Array.from(event.dataTransfer.files).filter(isStoryboardMediaFile);
    const mediaType = event.dataTransfer.getData("application/x-smartspec-media-type")
      || event.dataTransfer.getData("text/x-smartspec-media-type");
    const hasMediaPayload = files.length > 0
      || mediaType === "image"
      || mediaType === "video"
      || Array.from(event.dataTransfer.types ?? []).some((type) =>
        type === "Files" || type === "text/uri-list" || type === "text/plain"
      );
    if (!hasMediaPayload) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setDraggingVideoTaskId(dragKey);
    const edgeThreshold = 96;
    const scrollStep = 18;
    const scrollParent = findScrollableParent(event.currentTarget);
    const scrollTargetRect = scrollParent?.getBoundingClientRect();
    const topEdge = scrollTargetRect?.top ?? 0;
    const bottomEdge = scrollTargetRect?.bottom ?? window.innerHeight;
    if (event.clientY - topEdge < edgeThreshold) {
      if (scrollParent) scrollParent.scrollTop -= scrollStep;
      else window.scrollBy({ top: -scrollStep, behavior: "auto" });
    } else if (bottomEdge - event.clientY < edgeThreshold) {
      if (scrollParent) scrollParent.scrollTop += scrollStep;
      else window.scrollBy({ top: scrollStep, behavior: "auto" });
    }
  };

  const handleVideoSlotDrop = async (
    taskId: string,
    event: DragEvent<HTMLElement>,
    mode: "replace" | "insert-after" = "replace",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setDraggingVideoTaskId(null);
    if (!onUploadVideoSlot) return;
    const media = getDroppedStoryboardMedia(event.dataTransfer);
    if (!media) return;
    await onUploadVideoSlot(taskId, mode, media);
  };
  const readDroppedImageFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read dropped image"));
      reader.readAsDataURL(file);
    });
  const readStoredStoryboardDragImage = (value: unknown): string => {
    const key = typeof value === "string"
      ? value.trim().replace(/^storyboard-drag:/, "")
      : "";
    if (!key.startsWith("smartaihub:storyboard-drag-image:")) return "";
    try {
      const raw = window.sessionStorage.getItem(key);
      if (!raw) return "";
      const parsed = JSON.parse(raw) as { url?: unknown; createdAt?: unknown };
      const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : 0;
      if (createdAt > 0 && Date.now() - createdAt > 10 * 60 * 1000) {
        window.sessionStorage.removeItem(key);
        return "";
      }
      const url = typeof parsed.url === "string" ? parsed.url.trim() : "";
      if (url.startsWith("data:image/")) {
        window.sessionStorage.removeItem(key);
        return url;
      }
    } catch {
      return "";
    }
    return "";
  };
  const getDroppedImageUrl = async (dataTransfer: DataTransfer): Promise<string> => {
    const file = Array.from(dataTransfer.files ?? []).find((item) => item.type.startsWith("image/"));
    if (file) return readDroppedImageFileAsDataUrl(file);
    const storyboardPayload = dataTransfer.getData("application/x-smartspec-storyboard-image");
    if (storyboardPayload) {
      try {
        const parsed = JSON.parse(storyboardPayload) as { url?: unknown; mediaType?: unknown; storageKey?: unknown };
        const storedUrl = readStoredStoryboardDragImage(parsed.storageKey);
        if (storedUrl) return storedUrl;
        const payloadUrl = typeof parsed.url === "string" ? parsed.url.trim() : "";
        if (payloadUrl && (parsed.mediaType === "image" || payloadUrl.startsWith("data:image/"))) {
          return payloadUrl;
        }
      } catch {
        // Fall through to simpler drag payload formats.
      }
    }
    const explicitMediaUrl = dataTransfer.getData("application/x-smartspec-media-url").trim();
    const storedExplicitMediaUrl = readStoredStoryboardDragImage(explicitMediaUrl);
    if (storedExplicitMediaUrl) return storedExplicitMediaUrl;
    if (explicitMediaUrl && !explicitMediaUrl.startsWith("storyboard-drag:")) return explicitMediaUrl;
    const downloadUrl = dataTransfer.getData("DownloadURL");
    const downloadUrlMedia = downloadUrl.split(":").slice(2).join(":").trim();
    const mediaType = dataTransfer.getData("application/x-smartspec-media-type")
      || dataTransfer.getData("text/x-smartspec-media-type");
    const url = dataTransfer.getData("text/uri-list") || dataTransfer.getData("text/plain") || downloadUrlMedia;
    const storedUrl = readStoredStoryboardDragImage(url);
    if (storedUrl) return storedUrl;
    const looksLikeImage = url.startsWith("data:image/")
      || /\.(jpg|jpeg|png|webp|gif|avif|bmp)([?#].*)?$/i.test(url.trim())
      || url.startsWith("/api/storage/files/")
      || url.startsWith("/uploads/");
    return mediaType === "image" || looksLikeImage ? url.trim() : "";
  };
  const handleReferenceFrameDragOver = (event: DragEvent<HTMLElement>) => {
    if (!onReplaceReferenceFrame) return;
    const file = Array.from(event.dataTransfer.files ?? []).find((item) => item.type.startsWith("image/"));
    const mediaType = event.dataTransfer.getData("application/x-smartspec-media-type")
      || event.dataTransfer.getData("text/x-smartspec-media-type");
    const hasTextPayload = Array.from(event.dataTransfer.types ?? []).some((type) =>
      type === "text/uri-list"
      || type === "text/plain"
      || type === "DownloadURL"
      || type === "application/x-smartspec-storyboard-image"
      || type === "application/x-smartspec-media-url"
    );
    if (!file && mediaType !== "image" && !hasTextPayload) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  };
  const handleReferenceFrameDrop = async (
    taskId: string,
    frameIndex: 0 | 1,
    event: DragEvent<HTMLElement>,
  ) => {
    if (!onReplaceReferenceFrame) return;
    event.preventDefault();
    event.stopPropagation();
    const imageUrl = await getDroppedImageUrl(event.dataTransfer);
    if (!imageUrl) return;
    await onReplaceReferenceFrame(taskId, frameIndex, imageUrl);
  };

  const openTrimPanel = (task: StoryboardReviewTask) => {
    setExpandedTrimTaskId((current) => {
      const next = current === task.id ? null : task.id;
      if (next) {
        const draft = createStoryboardTrimDraft(task);
        const rangeWidth = Math.max(
          STORYBOARD_TRIM_MIN_DISABLED_RANGE_SECONDS,
          Math.min(2, Math.max(0.3, (draft.outSec - draft.inSec) / 5))
        );
        const rangeStart = roundStoryboardTrimSecond(draft.inSec + Math.max(0, (draft.outSec - draft.inSec - rangeWidth) / 2));
        setTrimDrafts((currentDrafts) => ({
          ...currentDrafts,
          [task.id]: draft,
        }));
        setDisabledRangeDrafts((currentDrafts) => ({
          ...currentDrafts,
          [task.id]: currentDrafts[task.id] ?? {
            startSec: rangeStart,
            endSec: roundStoryboardTrimSecond(rangeStart + rangeWidth),
          },
        }));
        setTrimPreviewTimes((currentTimes) => ({
          ...currentTimes,
          [task.id]: draft.inSec,
        }));
        setTrimTimelineZooms((currentZooms) => ({
          ...currentZooms,
          [task.id]: currentZooms[task.id] ?? STORYBOARD_TRIM_TIMELINE_MIN_ZOOM,
        }));
        setTrimTimelineCenters((currentCenters) => ({
          ...currentCenters,
          [task.id]: currentCenters[task.id] ?? draft.inSec,
        }));
      }
      return next;
    });
    setPlayingTrimTaskId(null);
  };

  const updateTrimDraft = (taskId: string, updater: (draft: StoryboardSourceTrimRange) => StoryboardSourceTrimRange) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    setTrimDrafts((currentDrafts) => {
      const current = currentDrafts[taskId] ?? createStoryboardTrimDraft(task);
      const next = updater(current);
      const sourceDurationSec = Math.max(0.5, next.sourceDurationSec ?? current.sourceDurationSec ?? getTaskTrimSourceDuration(task, current));
      const inSec = Math.max(0, Math.min(sourceDurationSec - 0.1, next.inSec));
      const outSec = Math.max(inSec + 0.1, Math.min(sourceDurationSec, next.outSec));
      const disabledRanges = normalizeStoryboardDisabledRanges(next.disabledRanges, inSec, outSec);
      const disabledDuration = storyboardDisabledDurationSeconds(disabledRanges);
      const keptDuration = roundStoryboardTrimSecond(outSec - inSec - disabledDuration);
      return {
        ...currentDrafts,
        [taskId]: {
          ...next,
          inSec: roundStoryboardTrimSecond(inSec),
          outSec: roundStoryboardTrimSecond(outSec),
          sourceDurationSec: roundStoryboardTrimSecond(sourceDurationSec),
          disabledRanges: keptDuration >= STORYBOARD_TRIM_MIN_KEPT_DURATION_SECONDS ? disabledRanges : current.disabledRanges ?? [],
        },
      };
    });
  };

  const updateDisabledRangeDraft = (
    taskId: string,
    updater: (draft: { startSec: number; endSec: number }) => { startSec: number; endSec: number },
  ) => {
    const trimDraft = trimDrafts[taskId];
    if (!trimDraft) return;
    setDisabledRangeDrafts((currentDrafts) => {
      const current = currentDrafts[taskId] ?? {
        startSec: trimDraft.inSec,
        endSec: Math.min(trimDraft.outSec, trimDraft.inSec + 1),
      };
      const next = updater(current);
      const startSec = Math.max(trimDraft.inSec, Math.min(trimDraft.outSec - STORYBOARD_TRIM_MIN_DISABLED_RANGE_SECONDS, next.startSec));
      const endSec = Math.max(startSec + STORYBOARD_TRIM_MIN_DISABLED_RANGE_SECONDS, Math.min(trimDraft.outSec, next.endSec));
      return {
        ...currentDrafts,
        [taskId]: {
          startSec: roundStoryboardTrimSecond(startSec),
          endSec: roundStoryboardTrimSecond(endSec),
        },
      };
    });
  };

  const markDisabledRangeDraftPoint = (taskId: string, point: "start" | "end") => {
    const trimDraft = trimDrafts[taskId];
    if (!trimDraft) return;
    const videoTime = trimVideoRef.current?.currentTime;
    const fallbackTime = point === "start" ? trimDraft.inSec : trimDraft.outSec;
    const currentTime = Number.isFinite(videoTime) ? Number(videoTime) : fallbackTime;
    const playableTime = roundStoryboardTrimSecond(
      Math.max(trimDraft.inSec, Math.min(trimDraft.outSec, getStoryboardTrimPreviewPlayableTime(currentTime, trimDraft))),
    );
    setTrimPreviewTimes((current) => ({ ...current, [taskId]: playableTime }));
    setTrimTimelineCenters((current) => ({ ...current, [taskId]: playableTime }));
    updateDisabledRangeDraft(taskId, (draft) => {
      if (point === "start") {
        return {
          startSec: playableTime,
          endSec: Math.max(draft.endSec, playableTime + STORYBOARD_TRIM_MIN_DISABLED_RANGE_SECONDS),
        };
      }
      return {
        startSec: Math.min(draft.startSec, playableTime - STORYBOARD_TRIM_MIN_DISABLED_RANGE_SECONDS),
        endSec: playableTime,
      };
    });
  };

  const seekTrimPreviewToTime = (taskId: string, draft: StoryboardSourceTrimRange, rawTime: number) => {
    const nextTime = roundStoryboardTrimSecond(
      Math.max(draft.inSec, Math.min(draft.outSec, rawTime)),
    );
    const video = trimVideoRef.current;
    if (video) {
      try {
        video.currentTime = nextTime;
      } catch {
        // Seeking can fail while metadata is not ready.
      }
    }
    setTrimPreviewTimes((current) => ({ ...current, [taskId]: nextTime }));
    setTrimTimelineCenters((current) => ({ ...current, [taskId]: nextTime }));
  };

  const getTrimTimelinePointerTime = (
    event: PointerEvent<HTMLElement>,
    viewportStartSec: number,
    viewportDurationSec: number,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pct = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    return roundStoryboardTrimSecond(viewportStartSec + Math.max(0, Math.min(1, pct)) * viewportDurationSec);
  };

  const updateTrimTimelineFromPointer = (
    taskId: string,
    draft: StoryboardSourceTrimRange,
    viewportStartSec: number,
    viewportDurationSec: number,
    event: PointerEvent<HTMLElement>,
    dragMode: "playhead" | "cut-start" | "cut-end" | "cut-range",
    rangeOffsetSec = 0,
  ) => {
    const pointerTime = getTrimTimelinePointerTime(event, viewportStartSec, viewportDurationSec);
    setTrimTimelineCenters((current) => ({ ...current, [taskId]: pointerTime }));
    if (dragMode === "playhead") {
      seekTrimPreviewToTime(taskId, draft, pointerTime);
      return;
    }
    updateDisabledRangeDraft(taskId, (current) => {
      if (dragMode === "cut-start") {
        return { ...current, startSec: pointerTime };
      }
      if (dragMode === "cut-end") {
        return { ...current, endSec: pointerTime };
      }
      const width = Math.max(
        STORYBOARD_TRIM_MIN_DISABLED_RANGE_SECONDS,
        current.endSec - current.startSec,
      );
      const startSec = pointerTime - rangeOffsetSec;
      return {
        startSec,
        endSec: startSec + width,
      };
    });
  };

  const setTrimTimelineZoomLevel = (
    taskId: string,
    draft: StoryboardSourceTrimRange,
    sourceDurationSec: number,
    nextZoom: number,
  ) => {
    const zoom = clampStoryboardTrimTimelineZoom(nextZoom);
    const fallbackCenter = trimPreviewTimes[taskId] ?? draft.inSec;
    setTrimTimelineZooms((current) => ({
      ...current,
      [taskId]: zoom,
    }));
    setTrimTimelineCenters((current) => ({
      ...current,
      [taskId]: roundStoryboardTrimSecond(Math.max(0, Math.min(sourceDurationSec, current[taskId] ?? fallbackCenter))),
    }));
  };

  const addDisabledRangeToTrimDraft = (taskId: string) => {
    const draftRange = disabledRangeDrafts[taskId];
    if (!draftRange) return;
    updateTrimDraft(taskId, (draft) => {
      const nextRanges = normalizeStoryboardDisabledRanges(
        [...(draft.disabledRanges ?? []), draftRange],
        draft.inSec,
        draft.outSec,
      );
      const keptDuration = roundStoryboardTrimSecond(
        draft.outSec - draft.inSec - storyboardDisabledDurationSeconds(nextRanges)
      );
      if (keptDuration < STORYBOARD_TRIM_MIN_KEPT_DURATION_SECONDS) return draft;
      return { ...draft, disabledRanges: nextRanges };
    });
  };

  const removeDisabledRangeFromTrimDraft = (taskId: string, rangeIndex: number) => {
    updateTrimDraft(taskId, (draft) => ({
      ...draft,
      disabledRanges: (draft.disabledRanges ?? []).filter((_, index) => index !== rangeIndex),
    }));
  };

  const syncTrimVideoToDraft = (taskId: string, draftOverride?: StoryboardSourceTrimRange) => {
    const video = trimVideoRef.current;
    const draft = draftOverride ?? trimDrafts[taskId];
    if (!video || !draft) return;
    const nextTime = getStoryboardTrimPreviewPlayableTime(draft.inSec, draft);
    try {
      video.currentTime = nextTime;
      setTrimPreviewTimes((current) => ({ ...current, [taskId]: roundStoryboardTrimSecond(nextTime) }));
    } catch {
      // Some browsers reject seeking before metadata is ready.
    }
  };

  const toggleTrimPreviewPlayback = async (taskId: string) => {
    const video = trimVideoRef.current;
    const draft = trimDrafts[taskId];
    if (!video || !draft) return;
    if (playingTrimTaskId === taskId) {
      video.pause();
      setPlayingTrimTaskId(null);
      return;
    }
    const nextTime = getStoryboardTrimPreviewPlayableTime(video.currentTime, draft);
    if (video.currentTime < draft.inSec || video.currentTime >= draft.outSec || Math.abs(nextTime - video.currentTime) > 0.03) {
      const seekTime = nextTime >= draft.outSec - 0.03
        ? getStoryboardTrimPreviewPlayableTime(draft.inSec, draft)
        : nextTime;
      video.currentTime = seekTime;
      setTrimPreviewTimes((current) => ({ ...current, [taskId]: roundStoryboardTrimSecond(seekTime) }));
    }
    try {
      video.muted = false;
      video.defaultMuted = false;
      video.volume = 1;
      setTrimPreviewMuted(false);
      await video.play();
      setPlayingTrimTaskId(taskId);
    } catch {
      setPlayingTrimTaskId(null);
    }
  };

  const saveTrimDraft = async (task: StoryboardReviewTask) => {
    const draft = trimDrafts[task.id] ?? createStoryboardTrimDraft(task);
    const normalizedDraft = {
      ...draft,
      disabledRanges: draft.disabledRanges ?? [],
    };
    await onUpdateTaskSourceTrim?.(
      task.id,
      isFullStoryboardTrim(normalizedDraft) ? null : normalizedDraft,
    );
    setExpandedTrimTaskId(null);
    setPlayingTrimTaskId(null);
  };

  const handleGenerateSelectedTasks = async () => {
    if (generatableSelectedTasks.length === 0 || isGeneratingSelected) return;
    generationCancelRequestedRef.current = false;
    setIsGeneratingSelected(true);
    setIsCancellingSelected(false);
    onStartGenerationBatch?.();
    try {
      for (const task of generatableSelectedTasks) {
        if (generationCancelRequestedRef.current) break;
        const shouldContinue = await onRegenerateTask(task.id, draftPrompts[task.id] ?? task.prompt);
        if (shouldContinue === false) break;
      }
    } finally {
      generationCancelRequestedRef.current = false;
      setIsGeneratingSelected(false);
      setIsCancellingSelected(false);
    }
  };
  const renderDurationLabel = useMemo(() => {
    if (typeof renderDurationSeconds !== "number" || !Number.isFinite(renderDurationSeconds) || renderDurationSeconds <= 0) {
      return null;
    }
    const totalSeconds = Math.round(renderDurationSeconds);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0
      ? t("mediaStudio.storyboardReviewDurationMinutes", { minutes, seconds: String(seconds).padStart(2, "0") })
      : t("mediaStudio.storyboardReviewDurationSeconds", { seconds });
  }, [renderDurationSeconds, t]);
  const renderMarketplaceMetadataPanel = (task: StoryboardReviewTask) => {
    const metadata = task.marketplaceProduct
      ?? (task.generationExtraParams?.marketplaceContext && typeof task.generationExtraParams.marketplaceContext === "object"
        ? task.generationExtraParams.marketplaceContext as NonNullable<StoryboardReviewTask["marketplaceProduct"]>
        : null);
    if (!metadata) return null;
    const productDetailUrl = metadata.productId
      ? `/marketplace-capture/products/${encodeURIComponent(metadata.productId)}`
      : null;
    return (
      <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/70 p-3 text-xs text-sky-950">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium">
              {locale === "th" ? "ข้อมูลสินค้า Marketplace" : "Marketplace Product Metadata"}
            </div>
            {metadata.productName ? (
              <div className="mt-0.5 line-clamp-2 text-sky-900/80">{metadata.productName}</div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {productDetailUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 border-sky-200 bg-white/80 text-sky-900 hover:bg-sky-100"
                onClick={() => window.open(productDetailUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {locale === "th" ? "รายละเอียดสินค้า" : "Product detail"}
              </Button>
            ) : null}
            {metadata.sourceUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 border-sky-200 bg-white/80 text-sky-900 hover:bg-sky-100"
                onClick={() => window.open(metadata.sourceUrl || "", "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {locale === "th" ? "หน้าสินค้า" : "Product URL"}
              </Button>
            ) : null}
            {metadata.affiliateUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 border-emerald-200 bg-white/80 text-emerald-800 hover:bg-emerald-50"
                onClick={() => navigator.clipboard?.writeText(metadata.affiliateUrl || "")}
              >
                <Copy className="h-3.5 w-3.5" />
                {locale === "th" ? "คัดลอก affiliate" : "Copy affiliate"}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <span className="text-sky-800/70">platform</span>
            <div className="font-medium">{metadata.platform || "-"}</div>
          </div>
          <div>
            <span className="text-sky-800/70">shop id</span>
            <div className="font-medium">{metadata.shopId || "-"}</div>
          </div>
          <div>
            <span className="text-sky-800/70">item id</span>
            <div className="font-medium">{metadata.itemId || "-"}</div>
          </div>
          <div>
            <span className="text-sky-800/70">shop name</span>
            <div className="font-medium">{metadata.shopName || "-"}</div>
          </div>
          <div className="sm:col-span-2">
            <span className="text-sky-800/70">product page URL</span>
            <div className="truncate font-medium">{metadata.sourceUrl || "-"}</div>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <span className="text-sky-800/70">affiliate URL</span>
            <div className="truncate font-medium">{metadata.affiliateUrl || "-"}</div>
          </div>
        </div>
      </div>
    );
  };
  const renderArticleStoryboardVideoPanel = (
    task: StoryboardReviewTask,
    metadata: ArticleStoryboardReviewMetadata,
  ) => {
    const formatDuration = (value: number | null | undefined) => (
      typeof value === "number" && Number.isFinite(value) && value > 0
        ? `${value.toFixed(value % 1 === 0 ? 0 : 1)}s`
        : "-"
    );
    const formatAudioStrategy = (value: ArticleStoryboardReviewMetadata["audioStrategy"] | null | undefined) => {
      if (value === "native_video_audio") return locale === "th" ? "เสียงในวิดีโอ" : "Native video audio";
      if (value === "silent") return locale === "th" ? "ไม่มีเสียง" : "Silent";
      return locale === "th" ? "Voiceover แยก" : "Separate TTS voiceover";
    };
    const formatBoolean = (value: boolean | undefined) => (
      value === undefined ? "-" : value ? (locale === "th" ? "ได้" : "Yes") : (locale === "th" ? "ไม่ได้" : "No")
    );
    const updateOverlay = (update: Parameters<typeof updateArticleStoryboardOverlayMetadata>[1]) => {
      if (!task.generationExtraParams || !onUpdateTaskExtraParams) return;
      const nextExtraParams = updateArticleStoryboardOverlayMetadata(task.generationExtraParams, update);
      void onUpdateTaskExtraParams(task.id, nextExtraParams);
    };
    const updateVoice = (update: Parameters<typeof updateArticleStoryboardVoiceMetadata>[1]) => {
      if (!task.generationExtraParams || !onUpdateTaskExtraParams) return;
      const nextExtraParams = updateArticleStoryboardVoiceMetadata(task.generationExtraParams, update);
      void onUpdateTaskExtraParams(task.id, nextExtraParams);
    };
    const promptLikeOverlay = isArticleStoryboardOverlayPromptLike(
      `${metadata.overlay.headline} ${metadata.overlay.subtext}`,
    );
    const imageReferencePromptText = metadata.imageReferencePrompt || "";
    const generatedImageReferencePromptText = metadata.generatedImageReferencePrompt || "";
    const videoPromptText = metadata.videoPrompt || task.prompt || "";
    const generatedVideoPromptText = metadata.generatedVideoPrompt || "";
    const currentVideoPromptText = metadata.currentVideoPrompt || task.prompt || "";
    const currentTaskPromptDiffers = Boolean(
      metadata.videoPrompt?.trim() &&
      currentVideoPromptText.trim() &&
      metadata.videoPrompt.trim() !== currentVideoPromptText.trim(),
    );
    const imagePromptDiffersFromGenerated = Boolean(
      imageReferencePromptText.trim() &&
      generatedImageReferencePromptText.trim() &&
      imageReferencePromptText.trim() !== generatedImageReferencePromptText.trim(),
    );
    const videoPromptDiffersFromGenerated = Boolean(
      videoPromptText.trim() &&
      generatedVideoPromptText.trim() &&
      videoPromptText.trim() !== generatedVideoPromptText.trim(),
    );
    const imagePromptCopyKey = `${task.id}:article-image-reference-prompt`;
    const videoPromptCopyKey = `${task.id}:article-video-prompt`;
    const currentVideoPromptCopyKey = `${task.id}:article-current-video-prompt`;
    const generatedImagePromptCopyKey = `${task.id}:article-generated-image-reference-prompt`;
    const generatedVideoPromptCopyKey = `${task.id}:article-generated-video-prompt`;
    const currentPromptUpdatedAt = metadata.currentPromptUpdatedAt || metadata.reviewPromptEditedAt;
    const currentPromptSourceLabel = metadata.currentPromptSource === "manual_edit"
      ? (locale === "th" ? "แก้เองใน Storyboard Review" : "Manual edit in Storyboard Review")
      : metadata.currentPromptSource === "regenerated"
        ? (locale === "th" ? "Regenerated" : "Regenerated")
        : metadata.currentPromptSource === "skill_generated"
          ? (locale === "th" ? "Skill generated" : "Skill generated")
          : metadata.currentPromptSource === "duration_adjusted"
            ? (locale === "th" ? "ปรับความยาว" : "Duration adjusted")
            : metadata.currentPromptSource;
    return (
      <section className="mt-3 rounded-lg border border-violet-200 bg-violet-50/50 p-3 text-sm text-violet-950">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">
              {locale === "th" ? "Article video metadata" : "Article video metadata"}
            </h3>
            <p className="text-xs text-violet-800/80">
              {locale === "th"
                ? "ข้อมูลนี้แยกจาก prompt วิดีโอ ใช้สำหรับข้อความซ้อน เสียง และ reference ตอน render"
                : "This stays separate from the video prompt and drives overlays, audio, and render references."}
            </p>
          </div>
          <Badge variant="outline" className="border-violet-300 bg-white/70 text-violet-900">
            {metadata.audioStrategy === "native_video_audio"
              ? (locale === "th" ? "เสียงในวิดีโอ" : "Native audio")
              : metadata.audioStrategy === "silent"
                ? (locale === "th" ? "ไม่มีเสียง" : "Silent")
                : (locale === "th" ? "Voiceover แยก" : "Separate voiceover")}
          </Badge>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border bg-background p-3 lg:col-span-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                {locale === "th" ? "Video prompt" : "Video prompt"}
              </h4>
              {metadata.promptSource ? (
                <Badge variant="outline">
                  {metadata.promptSource === "manual_edit"
                    ? (locale === "th" ? "แก้เองจาก Builder" : "Manual edit from Builder")
                    : metadata.promptSource}
                </Badge>
              ) : null}
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              <div className="grid gap-1 text-xs font-medium text-muted-foreground">
                <div className="flex items-center justify-between gap-2">
                  <span>{locale === "th" ? "Prompt สร้างภาพ reference 3x3" : "3x3 image reference prompt"}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    disabled={!imageReferencePromptText.trim()}
                    onClick={() => void handleCopyTaskPrompt(imagePromptCopyKey, imageReferencePromptText)}
                  >
                    {copiedPromptTaskId === imagePromptCopyKey ? (
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                    ) : (
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {copiedPromptTaskId === imagePromptCopyKey
                      ? (locale === "th" ? "คัดลอกแล้ว" : "Copied")
                      : (locale === "th" ? "คัดลอก" : "Copy")}
                  </Button>
                </div>
                <Textarea
                  readOnly
                  value={imageReferencePromptText}
                  placeholder={locale === "th" ? "ไม่มี prompt สร้างภาพ reference ใน metadata" : "No image reference prompt metadata."}
                  className="min-h-[96px] resize-y bg-muted/30 text-xs text-foreground"
                  aria-label={locale === "th" ? "Prompt สร้างภาพ reference 3x3" : "3x3 image reference prompt"}
                />
                {imagePromptDiffersFromGenerated ? (
                  <details className="rounded-md border bg-muted/20 p-2">
                    <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
                      {locale === "th" ? "ดู generated prompt เดิม" : "Show original generated prompt"}
                    </summary>
                    <div className="mt-2 grid gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 justify-self-start px-2 text-[11px]"
                        onClick={() => void handleCopyTaskPrompt(generatedImagePromptCopyKey, generatedImageReferencePromptText)}
                      >
                        {copiedPromptTaskId === generatedImagePromptCopyKey ? (
                          <Check className="mr-1.5 h-3.5 w-3.5" />
                        ) : (
                          <Copy className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {copiedPromptTaskId === generatedImagePromptCopyKey
                          ? (locale === "th" ? "คัดลอกแล้ว" : "Copied")
                          : (locale === "th" ? "คัดลอก generated" : "Copy generated")}
                      </Button>
                      <Textarea
                        readOnly
                        value={generatedImageReferencePromptText}
                        className="min-h-[80px] resize-y bg-background text-xs text-foreground"
                        aria-label={locale === "th" ? "Generated prompt เดิมสำหรับภาพ reference 3x3" : "Original generated 3x3 image reference prompt"}
                      />
                    </div>
                  </details>
                ) : null}
              </div>
              <div className="grid gap-1 text-xs font-medium text-muted-foreground">
                <div className="flex items-center justify-between gap-2">
                  <span>{locale === "th" ? "Prompt สร้างวิดีโอของ shot นี้" : "Video prompt for this shot"}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    disabled={!videoPromptText.trim()}
                    onClick={() => void handleCopyTaskPrompt(videoPromptCopyKey, videoPromptText)}
                  >
                    {copiedPromptTaskId === videoPromptCopyKey ? (
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                    ) : (
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {copiedPromptTaskId === videoPromptCopyKey
                      ? (locale === "th" ? "คัดลอกแล้ว" : "Copied")
                      : (locale === "th" ? "คัดลอก" : "Copy")}
                  </Button>
                </div>
                <Textarea
                  readOnly
                  value={videoPromptText}
                  placeholder={locale === "th" ? "ไม่มี prompt วิดีโอใน metadata" : "No video prompt metadata."}
                  className="min-h-[96px] resize-y bg-muted/30 text-xs text-foreground"
                  aria-label={locale === "th" ? "Prompt สร้างวิดีโอของ shot นี้" : "Video prompt for this shot"}
                />
                {videoPromptDiffersFromGenerated ? (
                  <details className="rounded-md border bg-muted/20 p-2">
                    <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
                      {locale === "th" ? "ดู generated prompt เดิม" : "Show original generated prompt"}
                    </summary>
                    <div className="mt-2 grid gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 justify-self-start px-2 text-[11px]"
                        onClick={() => void handleCopyTaskPrompt(generatedVideoPromptCopyKey, generatedVideoPromptText)}
                      >
                        {copiedPromptTaskId === generatedVideoPromptCopyKey ? (
                          <Check className="mr-1.5 h-3.5 w-3.5" />
                        ) : (
                          <Copy className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {copiedPromptTaskId === generatedVideoPromptCopyKey
                          ? (locale === "th" ? "คัดลอกแล้ว" : "Copied")
                          : (locale === "th" ? "คัดลอก generated" : "Copy generated")}
                      </Button>
                      <Textarea
                        readOnly
                        value={generatedVideoPromptText}
                        className="min-h-[80px] resize-y bg-background text-xs text-foreground"
                        aria-label={locale === "th" ? "Generated prompt เดิมสำหรับวิดีโอ" : "Original generated video prompt"}
                      />
                    </div>
                  </details>
                ) : null}
              </div>
            </div>
            {currentTaskPromptDiffers ? (
              <div className="mt-2 grid gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                <div>
                  {locale === "th"
                    ? "Prompt ปัจจุบันของ task ถูกแก้หลัง handoff จาก Builder แล้ว กล่องนี้ยังแสดง prompt ที่ส่งมาจาก Builder เพื่อใช้อ้างอิง"
                    : "The current task prompt has changed after the Builder handoff. This card keeps the Builder handoff prompt for reference."}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {currentPromptSourceLabel ? (
                    <Badge variant="outline" className="border-amber-300 bg-white/70 text-amber-900">
                      {currentPromptSourceLabel}
                    </Badge>
                  ) : null}
                  {currentPromptUpdatedAt ? (
                    <span className="text-[11px] text-amber-900/80">
                      {locale === "th" ? "อัปเดต" : "Updated"} {currentPromptUpdatedAt}
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-amber-950 hover:bg-amber-100"
                    disabled={!currentVideoPromptText.trim()}
                    onClick={() => void handleCopyTaskPrompt(currentVideoPromptCopyKey, currentVideoPromptText)}
                  >
                    {copiedPromptTaskId === currentVideoPromptCopyKey ? (
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                    ) : (
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {copiedPromptTaskId === currentVideoPromptCopyKey
                      ? (locale === "th" ? "คัดลอกแล้ว" : "Copied")
                      : (locale === "th" ? "คัดลอก prompt ปัจจุบัน" : "Copy current prompt")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-md border bg-background p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                {locale === "th" ? "Text on video" : "Text on video"}
              </h4>
              <Badge variant="outline">
                {metadata.overlay.preset === "center_title"
                  ? (locale === "th" ? "กลางจอ" : "Center title")
                  : (locale === "th" ? "ล่างซ้าย" : "Lower third")}
              </Badge>
            </div>
            <div className="grid gap-2">
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                {locale === "th" ? "รูปแบบข้อความ" : "Overlay preset"}
                <select
                  value={metadata.overlay.preset}
                  disabled={!onUpdateTaskExtraParams || task.status === "generating"}
                  onChange={(event) => updateOverlay({ preset: event.target.value as ArticleStoryboardReviewMetadata["overlay"]["preset"] })}
                  className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
                  aria-label={locale === "th" ? "รูปแบบข้อความบนวิดีโอ" : "Text on video preset"}
                >
                  <option value="lower_third">{locale === "th" ? "Lower third" : "Lower third"}</option>
                  <option value="center_title">{locale === "th" ? "Center title" : "Center title"}</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                {locale === "th" ? "หัวข้อบนวิดีโอ" : "Overlay headline"}
                <input
                  value={metadata.overlay.headline}
                  disabled={!onUpdateTaskExtraParams || task.status === "generating"}
                  onChange={(event) => updateOverlay({ headline: event.target.value })}
                  className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
                  aria-label={locale === "th" ? "หัวข้อบนวิดีโอ" : "Overlay headline"}
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                {locale === "th" ? "ข้อความเสริมบนวิดีโอ" : "Overlay subtext"}
                <Textarea
                  value={metadata.overlay.subtext}
                  disabled={!onUpdateTaskExtraParams || task.status === "generating"}
                  onChange={(event) => updateOverlay({ subtext: event.target.value })}
                  className="min-h-[72px] text-xs"
                  aria-label={locale === "th" ? "ข้อความเสริมบนวิดีโอ" : "Overlay subtext"}
                />
              </label>
            </div>
            {promptLikeOverlay ? (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                {locale === "th"
                  ? "ข้อความนี้ดูเหมือน prompt สร้างวิดีโอ ควรย้ายไปแก้ในส่วน Prompt เพื่อให้ overlay อ่านง่าย"
                  : "This looks like a video-generation prompt. Move it to Prompt so the overlay stays readable."}
              </div>
            ) : null}
          </div>

          <div className="rounded-md border bg-background p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {locale === "th" ? "Voiceover/audio" : "Voiceover/audio"}
            </h4>
            <div className="grid gap-2 text-xs">
              <div className="grid grid-cols-[7rem_1fr] gap-2">
                <span className="text-muted-foreground">{locale === "th" ? "โหมด" : "Mode"}</span>
                <span className="font-medium">{metadata.voiceConfig.mode === "two_speaker_dialogue" ? "Two speaker dialogue" : "Single narrator"}</span>
              </div>
              <div className="grid grid-cols-[7rem_1fr] gap-2">
                <span className="text-muted-foreground">{locale === "th" ? "เสียงที่เลือก" : "Requested"}</span>
                <span className="font-medium">{formatAudioStrategy(metadata.requestedAudioStrategy ?? metadata.audioStrategy)}</span>
              </div>
              <div className="grid grid-cols-[7rem_1fr] gap-2">
                <span className="text-muted-foreground">{locale === "th" ? "เสียงที่ใช้" : "Resolved"}</span>
                <span className="font-medium">{formatAudioStrategy(metadata.resolvedAudioStrategy ?? metadata.audioStrategy)}</span>
              </div>
              <div className="grid grid-cols-[7rem_1fr] gap-2">
                <span className="text-muted-foreground">{locale === "th" ? "พูดในวิดีโอ" : "Native allowed"}</span>
                <span className="font-medium">{formatBoolean(metadata.nativeAudioAllowed)}</span>
              </div>
              <div className="grid grid-cols-[7rem_1fr] gap-2">
                <span className="text-muted-foreground">{locale === "th" ? "TTS แยก" : "TTS allowed"}</span>
                <span className="font-medium">{formatBoolean(metadata.separateTtsAllowed)}</span>
              </div>
              <div className="grid grid-cols-[7rem_1fr] gap-2">
                <span className="text-muted-foreground">{locale === "th" ? "โมเดลเสียง" : "Voice model"}</span>
                <input
                  value={metadata.voiceConfig.voiceModelId || ""}
                  placeholder={metadata.voiceConfig.provider || "-"}
                  disabled={!onUpdateTaskExtraParams || task.status === "generating"}
                  onChange={(event) => updateVoice({ voiceModelId: event.target.value })}
                  className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
                  aria-label={locale === "th" ? "Voice model สำหรับ voiceover" : "Voiceover voice model"}
                />
              </div>
              {metadata.ttsRenderStrategy ? (
                <div className="grid grid-cols-[7rem_1fr] gap-2">
                  <span className="text-muted-foreground">{locale === "th" ? "วิธีสร้างเสียง" : "TTS strategy"}</span>
                  <span className="font-medium">
                    {metadata.ttsRenderStrategy === "single_request_dialogue"
                      ? (locale === "th" ? "Dialogue request เดียว" : "Single dialogue request")
                      : metadata.ttsRenderStrategy === "segment_then_merge"
                        ? (locale === "th" ? "สร้างแยกแล้ว merge" : "Segment then merge")
                        : (locale === "th" ? "Request เดียว" : "Single request")}
                  </span>
                </div>
              ) : null}
              {metadata.audioReasonCode && metadata.audioReasonCode !== "ok" ? (
                <div className="grid grid-cols-[7rem_1fr] gap-2">
                  <span className="text-muted-foreground">{locale === "th" ? "เหตุผลเสียง" : "Audio reason"}</span>
                  <span className="font-medium">{metadata.audioReasonCode}</span>
                </div>
              ) : null}
              <div className="grid gap-1">
                {metadata.voiceConfig.speakers.map((speaker, index) => (
                  <div key={`${speaker.speaker}-${index}`} className="grid gap-1 rounded border bg-muted/30 px-2 py-1">
                    <label className="grid gap-1">
                      <span className="font-medium">{speaker.speaker}</span>
                      <input
                        value={speaker.voiceId || ""}
                        placeholder={locale === "th" ? "ยังไม่ระบุ voice id" : "Missing voice ID"}
                        disabled={!onUpdateTaskExtraParams || task.status === "generating"}
                        onChange={(event) => updateVoice({ speakerVoiceIds: { [index]: event.target.value } })}
                        className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
                        aria-label={`${speaker.speaker} ${locale === "th" ? "voice id" : "voice ID"}`}
                      />
                    </label>
                  </div>
                ))}
              </div>
              {metadata.warningCodes.includes("missing_voice_id_recoverable") ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900">
                  {locale === "th"
                    ? "ยังขาด voice id บางตัว แก้ได้โดยตั้งค่าเสียงก่อนสร้าง voiceover"
                    : "A voice ID is missing. Set the speaker voice before generating voiceover."}
                </div>
              ) : null}
              {metadata.scriptSegments.length > 0 ? (
                <div className="max-h-28 overflow-y-auto rounded border bg-muted/20 p-2 leading-5">
                  {metadata.scriptSegments.map((segment, index) => (
                    <p key={`${segment.shotId ?? "script"}-${index}`} className="mb-1 last:mb-0">
                      {segment.speaker ? <span className="font-medium">{segment.speaker}: </span> : null}
                      {segment.text}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-md border bg-background p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {locale === "th" ? "Character references" : "Character references"}
            </h4>
            {metadata.characterReferenceImages.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {metadata.characterReferenceImages.map((image) => (
                  <button
                    key={image.id}
                    type="button"
                    className="overflow-hidden rounded-md border bg-muted text-left"
                    onClick={() => setLightboxMedia({ type: "image", url: image.url, title: image.label || image.id })}
                  >
                    <img src={image.url} alt={image.label || image.id} className="aspect-square w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{locale === "th" ? "ไม่มีภาพตัวละครแนบ" : "No character reference attached."}</p>
            )}
          </div>

          <div className="rounded-md border bg-background p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {locale === "th" ? "Scene references" : "Scene references"}
            </h4>
            {metadata.selectedReferenceImages.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {metadata.selectedReferenceImages.map((image) => (
                  <button
                    key={image.id}
                    type="button"
                    className="overflow-hidden rounded-md border bg-muted text-left"
                    onClick={() => setLightboxMedia({ type: "image", url: image.url, title: image.label || image.id })}
                  >
                    <img src={image.url} alt={image.label || image.id} className="aspect-square w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{locale === "th" ? "ยังไม่มีภาพ scene reference ที่เลือก" : "No selected scene references."}</p>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="bg-white/70">
            {locale === "th" ? "ความยาว planned" : "Planned"} {formatDuration(metadata.timing.plannedDurationSeconds)}
          </Badge>
          <Badge variant="outline" className="bg-white/70">
            {locale === "th" ? "เสียงจริง" : "Measured audio"} {formatDuration(metadata.timing.measuredDurationSeconds)}
          </Badge>
          {metadata.warningCodes.includes("timing_mismatch") ? (
            <Badge variant="destructive">
              {locale === "th" ? "ความยาวเสียงไม่พอดีกับ shot" : "Audio length mismatch"}
            </Badge>
          ) : null}
        </div>
      </section>
    );
  };
  const confirmCopy = useMemo(() => {
    if (!confirmAction) return null;
    if (confirmAction === "generate") {
      return {
        title: t("mediaStudio.storyboardReviewConfirmGenerateTitle"),
        description: t("mediaStudio.storyboardReviewConfirmGenerateDesc", { count: generatableSelectedTasks.length }),
        detail: t("mediaStudio.storyboardReviewGenerateSelectedHelp"),
        actionLabel: t("mediaStudio.storyboardReviewConfirmGenerateAction"),
      };
    }
    if (confirmAction === "render") {
      return {
        title: t("mediaStudio.storyboardReviewConfirmRenderTitle"),
        description: t("mediaStudio.storyboardReviewConfirmRenderDesc", {
          count: completedSelectedTasks.length,
          duration: renderDurationLabel ?? t("mediaStudio.storyboardReviewUnknownDuration"),
        }),
        detail: t("mediaStudio.storyboardReviewConfirmRenderDetail", {
          output: renderOutputLabel ?? t("mediaStudio.storyboardReviewUnknownDuration"),
          source: renderAspectRatioSourceLabel ?? "",
        }),
        actionLabel: t("mediaStudio.storyboardReviewConfirmRenderAction"),
      };
    }
    return {
      title: t("mediaStudio.storyboardReviewConfirmProjectTitle"),
      description: t("mediaStudio.storyboardReviewConfirmProjectDesc", { count: completedSelectedTasks.length }),
      detail: t("mediaStudio.storyboardReviewCreateVideoEditProjectHelp"),
      actionLabel: t("mediaStudio.storyboardReviewConfirmProjectAction"),
    };
  }, [completedSelectedTasks.length, confirmAction, generatableSelectedTasks.length, renderAspectRatioSourceLabel, renderDurationLabel, renderOutputLabel, t]);
  const handleConfirmAction = () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === "generate") {
      void handleGenerateSelectedTasks();
    } else if (action === "render") {
      onAutoCompound();
    } else if (action === "project") {
      onCreateProject();
    }
  };
  const handleCancelGeneration = async () => {
    generationCancelRequestedRef.current = true;
    setIsCancellingSelected(true);
    await onCancelGeneration?.();
    if (!regeneratingTaskId) {
      setIsCancellingSelected(false);
    }
  };
  const taskStatusLabel = (status: StoryboardReviewTask["status"]) => {
    switch (status) {
      case "completed":
        return t("mediaStudio.storyboardReviewStatusReady");
      case "generating":
        return t("mediaStudio.storyboardReviewStatusGenerating");
      case "queued":
        return t("mediaStudio.storyboardReviewStatusQueued");
      case "error":
        return t("mediaStudio.storyboardReviewStatusError");
      default:
        return status;
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-background",
        tabletPageFlow ? "overflow-visible xl:overflow-hidden" : "overflow-hidden",
        className,
      )}
    >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-background px-3 py-2 text-left sm:px-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold leading-none text-foreground sm:text-base">
              <Video className="h-5 w-5 text-blue-500" />
              {t("mediaStudio.storyboardReview")}
            </h2>
            <Badge variant="secondary" className="h-6">{t("mediaStudio.storyboardReviewSelectedCount", { count: selectedCount })}</Badge>
            <Badge variant="outline" className="h-6">{t("mediaStudio.storyboardReviewReadyForExport", { count: completedSelectedTasks.length })}</Badge>
            <span className="hidden truncate text-xs text-muted-foreground lg:inline">
              {t("mediaStudio.storyboardReviewPanelDescription")}
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant={isGuidanceExpanded ? "secondary" : "outline"}
            className="h-8 gap-1.5 px-2 text-xs"
            onClick={() => setIsGuidanceExpanded((current) => !current)}
            aria-expanded={isGuidanceExpanded}
          >
            {isGuidanceExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {locale === "th" ? "แนวทาง" : "Guidance"}
          </Button>
        </div>

        <button
          type="button"
          className="mx-3 mt-2 flex shrink-0 items-center gap-2 rounded-md border bg-muted/20 px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/40 sm:mx-4"
          onClick={() => setIsGuidanceExpanded((current) => !current)}
          aria-expanded={isGuidanceExpanded}
        >
          <span className="shrink-0 font-medium text-foreground">
            {locale === "th" ? "Context" : "Context"}
          </span>
          <span className="min-w-0 flex-1 truncate">{guidanceSummary}</span>
          {isGuidanceExpanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
        </button>

        {isGuidanceExpanded ? (
        <div className="mx-3 mt-2 shrink-0 rounded-lg border bg-background px-3 py-2 sm:mx-4">
          <div className="grid gap-2 xl:grid-cols-3">
            <div className="min-w-0">
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                {locale === "th" ? "แนวคิดและรายละเอียด" : "Concept and details"}
              </div>
              <Textarea
                value={conceptDetails ?? ""}
                onChange={(event) => void onConceptDetailsChange?.(event.target.value)}
                readOnly={!onConceptDetailsChange}
                className="min-h-[56px] resize-y text-xs leading-5"
                placeholder={locale === "th"
                  ? "แนวคิดจาก Production Director จะถูกใช้เป็น guideline ตอนสร้าง prompt แต่ละฉาก"
                  : "Production Director concept guidance used when planning per-scene prompts"}
              />
            </div>
            <div className="min-w-0">
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                {locale === "th" ? "Storyboard guide" : "Storyboard guide"}
              </div>
              <Textarea
                value={storyboardGuide ?? ""}
                onChange={(event) => void onStoryboardGuideChange?.(event.target.value)}
                readOnly={!onStoryboardGuideChange}
                className="min-h-[56px] resize-y text-xs leading-5"
                placeholder={locale === "th"
                  ? "ข้อมูลลำดับช็อต คู่ภาพ start/end และแนวทาง continuity สำหรับใช้ตอนสร้าง prompt"
                  : "Shot order, start/end frame guidance, and continuity notes for prompt planning"}
              />
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {locale === "th" ? "บทพูดรวมที่นำไปใช้" : "Combined voiceover script"}
                </span>
                {onVoiceoverFullScriptChange ? (
                  isEditingVoiceoverFullScript ? (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setVoiceoverFullScriptDraft(voiceoverFullScript ?? "");
                          setIsEditingVoiceoverFullScript(false);
                        }}
                      >
                        {locale === "th" ? "ยกเลิก" : "Cancel"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          const nextScript = voiceoverFullScriptDraft.trim();
                          void Promise.resolve(onVoiceoverFullScriptChange(nextScript)).then(() => {
                            if (nextScript) {
                              void onUseVoiceoverScriptAsConceptChange?.(true);
                            }
                            setIsEditingVoiceoverFullScript(false);
                          });
                        }}
                      >
                        {locale === "th" ? "บันทึก" : "Save"}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => {
                        setVoiceoverFullScriptDraft(voiceoverFullScript ?? "");
                        setIsEditingVoiceoverFullScript(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {locale === "th" ? "แก้ไข" : "Edit"}
                    </Button>
                  )
                ) : null}
              </div>
              <Textarea
                value={isEditingVoiceoverFullScript ? voiceoverFullScriptDraft : (voiceoverFullScript ?? "")}
                onChange={(event) => setVoiceoverFullScriptDraft(event.target.value)}
                readOnly={!isEditingVoiceoverFullScript}
                className="min-h-[56px] resize-y text-xs leading-5"
                placeholder={locale === "th"
                  ? "ยังไม่มีบทพูดรวม สร้าง prompt พร้อมบทพูดก่อน หรือกดแก้ไขเพื่อใส่เอง"
                  : "No combined script yet. Plan prompts with voiceover first or edit manually."}
              />
              <label className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={Boolean(useVoiceoverScriptAsConcept)}
                  disabled={!onUseVoiceoverScriptAsConceptChange || !(voiceoverFullScript ?? voiceoverFullScriptDraft).trim()}
                  onCheckedChange={(checked) => {
                    void onUseVoiceoverScriptAsConceptChange?.(Boolean(checked));
                  }}
                />
                <span>
                  {locale === "th"
                    ? "ใช้บทพูดนี้แทนแนวคิดและรายละเอียดเมื่อสร้าง prompt ใหม่"
                    : "Use this script instead of concept/details when planning new prompts"}
                </span>
              </label>
            </div>
          </div>
        </div>
        ) : null}

        <div className="mx-3 mt-2 flex shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 px-2 py-2 text-sm sm:mx-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {shouldUseSegmentPromptPlanning ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 px-2 text-xs"
                onClick={() => void onPlanScenePrompts?.(currentPlannerOptions)}
                disabled={
                  segmentPromptTargetTasks.length === 0 ||
                  isPlanningScenePrompts ||
                  Boolean(regeneratingTaskId) ||
                  isGeneratingSelected
                }
                title={locale === "th"
                  ? "ให้ skill วิเคราะห์ภาพและสร้าง prompt ตาม video segment plan ปัจจุบัน"
                  : "Use the skill to plan prompts from the current video segment plan"}
              >
                {isPlanningScenePrompts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic2 className="h-4 w-4" />}
                {locale === "th" ? "สร้าง Prompt ตาม segment" : "Plan segment prompts"}
              </Button>
            ) : onPlanScenePrompts ? (
              <>
                <select
                  value={plannerSpeechMode}
                  onChange={(event) => setPlannerSpeechMode(event.target.value as StoryboardPromptPlannerOptions["speechMode"])}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  aria-label={locale === "th" ? "โหมดบทพูด" : "Speech mode"}
                >
                  <option value="none">{locale === "th" ? "ไม่ใส่บทพูด" : "No speech"}</option>
                  <option value="en">{locale === "th" ? "บทพูดภาษาอังกฤษ" : "English speech"}</option>
                  <option value="th">{locale === "th" ? "บทพูดภาษาไทย" : "Thai speech"}</option>
                  <option value="other">{locale === "th" ? "ภาษาอื่น ๆ" : "Other language"}</option>
                </select>
                {plannerSpeechMode === "other" ? (
                  <input
                    value={plannerOtherSpeechLanguage}
                    onChange={(event) => setPlannerOtherSpeechLanguage(event.target.value)}
                    placeholder={locale === "th" ? "ระบุภาษา" : "Language"}
                    className="h-8 w-32 rounded-md border bg-background px-2 text-xs"
                  />
                ) : null}
                <label className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs">
                  <Checkbox
                    checked={plannerIncludeSound}
                    onCheckedChange={(checked) => setPlannerIncludeSound(Boolean(checked))}
                    className="h-3.5 w-3.5"
                  />
                  {locale === "th" ? "เสียงประกอบ" : "Sound"}
                </label>
                <select
                  value={plannerTone}
                  onChange={(event) => setPlannerTone(event.target.value as StoryboardPromptPlannerOptions["tone"])}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="sales">{locale === "th" ? "ขายชัด" : "Sales"}</option>
                  <option value="premium">{locale === "th" ? "พรีเมียม" : "Premium"}</option>
                  <option value="demo">{locale === "th" ? "สาธิตสินค้า" : "Demo"}</option>
                  <option value="ugc">UGC</option>
                  <option value="cinematic">{locale === "th" ? "ซีนีเมติก" : "Cinematic"}</option>
                </select>
                <select
                  value={plannerLanguage}
                  onChange={(event) => setPlannerLanguage(event.target.value as StoryboardPromptPlannerOptions["language"])}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="auto">Auto</option>
                  <option value="th">TH</option>
                  <option value="en">EN</option>
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 px-2 text-xs"
                  onClick={() => void onPlanScenePrompts(currentPlannerOptions)}
                  disabled={tasks.length === 0 || isPlanningScenePrompts || Boolean(regeneratingTaskId) || isGeneratingSelected}
                  title={locale === "th" ? "สร้าง prompt พร้อม customer journey สำหรับทุกฉาก" : "Plan scene prompts with customer journey"}
                >
                  {isPlanningScenePrompts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic2 className="h-4 w-4" />}
                  {locale === "th" ? "สร้าง Prompt ทุกฉาก" : "Plan prompts"}
                </Button>
              </>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:flex sm:shrink-0">
            {showGenerationCancel ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCancelGeneration()}
                disabled={isCancellingGeneration || isCancellingSelected}
                className="col-span-2 h-8 px-2 text-xs sm:col-span-1"
              >
                {isCancellingGeneration || isCancellingSelected ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
                {t("mediaStudio.storyboardReviewCancelGeneration")}
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => setConfirmAction("generate")}
                disabled={generatableSelectedTasks.length === 0 || Boolean(regeneratingTaskId) || isGeneratingSelected}
                className="col-span-2 h-8 px-2 text-xs sm:col-span-1"
                title={t("mediaStudio.storyboardReviewGenerateSelectedHelp")}
              >
                <Video className="mr-2 h-4 w-4" />
                {t("mediaStudio.storyboardReviewGenerateSelected")}
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={onSelectAll}>
              {t("mediaStudio.storyboardReviewSelectAll")}
            </Button>
            <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={onSelectNone}>
              {t("common.clear")}
            </Button>
          </div>
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 px-3 pr-2 sm:px-4 sm:pr-3",
            tabletPageFlow
              ? "overflow-visible xl:overflow-y-auto xl:overscroll-contain"
              : "overflow-y-auto overscroll-contain",
            contentClassName,
          )}
        >
          <div className="space-y-2">
            {companionAudio.length > 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-emerald-950">{t("mediaStudio.storyboardReviewSeparateAudioPreview")}</div>
                    <div className="text-xs text-emerald-800">
                      {t("mediaStudio.storyboardReviewSeparateAudioDesc")}
                    </div>
                  </div>
                  <Badge variant="secondary">{t("mediaStudio.storyboardReviewAudioTrackCount", { count: companionAudio.length })}</Badge>
                </div>

                <div className="space-y-2">
                  {companionAudio.map((audio) => {
                    const isVoiceover = audio.kind === "voiceover";
                    const durationLabel = audio.actualDurationSeconds && audio.targetDurationSeconds
                      ? t("mediaStudio.storyboardReviewAudioDurationTarget", {
                        actual: audio.actualDurationSeconds.toFixed(1),
                        target: audio.targetDurationSeconds.toFixed(1),
                      })
                      : audio.targetDurationSeconds
                        ? t("mediaStudio.storyboardReviewAudioTargetDuration", { target: audio.targetDurationSeconds.toFixed(1) })
                        : null;
                    const startTimeLabel = audio.startTimeSeconds && audio.startTimeSeconds > 0
                      ? t("mediaStudio.storyboardReviewAudioStarts", { start: audio.startTimeSeconds.toFixed(1) })
                      : null;
                    return (
                      <div key={audio.id} className="rounded-lg border bg-background p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <div className="mt-0.5 rounded-full bg-emerald-100 p-2 text-emerald-700">
                              {isVoiceover ? <Mic2 className="h-4 w-4" /> : <Music2 className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{isVoiceover ? t("mediaStudio.storyboardReviewVoiceover") : t("mediaStudio.storyboardReviewMusic")}</Badge>
                                <span className="text-sm font-medium">{audio.title}</span>
                                {audio.model ? <Badge variant="secondary">{audio.model}</Badge> : null}
                                {audio.segmentCount && audio.segmentCount > 1 ? (
                                  <Badge variant="outline">
                                    {t("mediaStudio.storyboardReviewAudioPart", {
                                      index: (audio.segmentIndex ?? 0) + 1,
                                      count: audio.segmentCount,
                                    })}
                                  </Badge>
                                ) : null}
                                {durationLabel ? <Badge variant="outline">{durationLabel}</Badge> : null}
                                {startTimeLabel ? <Badge variant="outline">{startTimeLabel}</Badge> : null}
                              </div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {summarizePrompt(audio.prompt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col gap-2 lg:w-80">
                            <audio src={audio.url} controls className="w-full" />
                            <div className="flex flex-wrap gap-2">
                              {onRegenerateAudio ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={regeneratingAudioId === audio.id}
                                  onClick={() => onRegenerateAudio(audio.id)}
                                >
                                  {regeneratingAudioId === audio.id ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                  )}
                                  {t("mediaStudio.storyboardReviewRegenerateAudio")}
                                </Button>
                              ) : null}
                              {onRemoveAudio ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onRemoveAudio(audio.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  {t("common.remove")}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="space-y-2 py-2">
            {tasks.map((task, taskIndex) => {
              const isSelected = selectedTaskIds.includes(task.id);
              const hasMedia = !!task.url && task.status === "completed";
              const isImageShot = isStoryboardImageMedia(task);
              const firstLastFrameUrls = getFirstLastFrameUrls(task);
              const isEditing = editingTaskId === task.id;
              const draftPrompt = draftPrompts[task.id] ?? task.prompt;
              const canRegenerate = task.canRegenerate !== false;
              const isMediaOnlyInsertedShot = task.isImported && !firstLastFrameUrls && !canRegenerate;
              const showPromptWorkflowActions = !isMediaOnlyInsertedShot;
              const isQueuedForGeneration = task.status === "queued";
              const articleStoryboardMetadata = getArticleStoryboardReviewMetadata(task.generationExtraParams);
              const marketplaceMetadata = task.marketplaceProduct
                ?? (task.generationExtraParams?.marketplaceContext && typeof task.generationExtraParams.marketplaceContext === "object"
                  ? task.generationExtraParams.marketplaceContext as NonNullable<StoryboardReviewTask["marketplaceProduct"]>
                  : null);
              const videoSegmentId = getTaskVideoSegmentId(task);
              const videoSegmentShotIds = Array.isArray(task.generationExtraParams?.videoSegmentShotIds)
                ? task.generationExtraParams.videoSegmentShotIds
                    .map((value) => typeof value === "string" ? value.trim() : "")
                    .filter(Boolean)
                : [];
              const videoSegmentPromptStale = task.generationExtraParams?.videoSegmentPromptStale === true;
              const videoSegmentEffectiveMode = typeof task.generationExtraParams?.videoSegmentEffectiveMode === "string"
                ? task.generationExtraParams.videoSegmentEffectiveMode
                : "";
              const segmentLabel = videoSegmentShotIds.length > 1
                ? (locale === "th" ? `Segment ${videoSegmentShotIds.length} ช็อต` : `Segment ${videoSegmentShotIds.length} shots`)
                : videoSegmentId
                  ? (locale === "th" ? "Segment 1 ช็อต" : "Segment 1 shot")
                  : "";
              const canSplitVideoSegment = Boolean(
                onSplitVideoSegmentToPerShot &&
                videoSegmentId &&
                videoSegmentShotIds.length > 1 &&
                task.status === "error"
              );
              const hasAffiliateUrl = Boolean(marketplaceMetadata?.affiliateUrl);
              const selectedShotDuration = STORYBOARD_SHOT_DURATION_OPTIONS_SECONDS.includes(task.durationSeconds as typeof STORYBOARD_SHOT_DURATION_OPTIONS_SECONDS[number])
                ? Number(task.durationSeconds)
                : 8;
              const taskSourceTrim = getTaskSourceTrim(task);
              const sourceTrimDerivedStatus = readStoryboardSourceTrimDerivedStatus(task.generationExtraParams);
              const trimDraft = trimDrafts[task.id] ?? createStoryboardTrimDraft(task);
              const disabledRangeDraft = disabledRangeDrafts[task.id] ?? {
                startSec: trimDraft.inSec,
                endSec: Math.min(trimDraft.outSec, trimDraft.inSec + 1),
              };
              const disabledDurationSeconds = storyboardDisabledDurationSeconds(trimDraft.disabledRanges);
              const trimDurationSeconds = Math.max(0, roundStoryboardTrimSecond(trimDraft.outSec - trimDraft.inSec));
              const keptTrimDurationSeconds = Math.max(0, roundStoryboardTrimSecond(trimDurationSeconds - disabledDurationSeconds));
              const disabledRangeCount = trimDraft.disabledRanges?.length ?? 0;
              const nextDisabledRanges = normalizeStoryboardDisabledRanges(
                [...(trimDraft.disabledRanges ?? []), disabledRangeDraft],
                trimDraft.inSec,
                trimDraft.outSec,
              );
              const nextKeptTrimDurationSeconds = roundStoryboardTrimSecond(
                trimDraft.outSec - trimDraft.inSec - storyboardDisabledDurationSeconds(nextDisabledRanges),
              );
              const canAddDisabledRange =
                disabledRangeDraft.endSec - disabledRangeDraft.startSec >= STORYBOARD_TRIM_MIN_DISABLED_RANGE_SECONDS &&
                nextDisabledRanges.length <= STORYBOARD_TRIM_MAX_DISABLED_RANGES &&
                nextKeptTrimDurationSeconds >= STORYBOARD_TRIM_MIN_KEPT_DURATION_SECONDS &&
                JSON.stringify(nextDisabledRanges) !== JSON.stringify(trimDraft.disabledRanges ?? []);
              const trimSourceDuration = Math.max(0.1, trimDraft.sourceDurationSec ?? trimDraft.outSec);
              const trimPreviewTime = Math.max(
                trimDraft.inSec,
                Math.min(trimDraft.outSec, trimPreviewTimes[task.id] ?? trimDraft.inSec),
              );
              const trimTimelineZoom = clampStoryboardTrimTimelineZoom(trimTimelineZooms[task.id] ?? STORYBOARD_TRIM_TIMELINE_MIN_ZOOM);
              const trimTimelineCenter = Math.max(
                0,
                Math.min(trimSourceDuration, trimTimelineCenters[task.id] ?? trimPreviewTime),
              );
              const trimTimelineViewportDuration = trimTimelineZoom <= STORYBOARD_TRIM_TIMELINE_MIN_ZOOM
                ? trimSourceDuration
                : Math.max(1, trimSourceDuration / trimTimelineZoom);
              const trimTimelineViewportStart = trimTimelineZoom <= STORYBOARD_TRIM_TIMELINE_MIN_ZOOM
                ? 0
                : Math.max(
                    0,
                    Math.min(
                      Math.max(0, trimSourceDuration - trimTimelineViewportDuration),
                      trimTimelineCenter - trimTimelineViewportDuration / 2,
                    ),
                  );
              const trimTimelineViewportEnd = Math.min(
                trimSourceDuration,
                trimTimelineViewportStart + trimTimelineViewportDuration,
              );
              const trimTimelineViewportWidth = Math.max(0.1, trimTimelineViewportEnd - trimTimelineViewportStart);
              const trimTimelinePercent = (value: number) => Math.max(
                0,
                Math.min(100, ((value - trimTimelineViewportStart) / trimTimelineViewportWidth) * 100),
              );
              const trimActiveVisibleStart = Math.max(trimDraft.inSec, trimTimelineViewportStart);
              const trimActiveVisibleEnd = Math.min(trimDraft.outSec, trimTimelineViewportEnd);
              const trimActiveLeftPercent = trimTimelinePercent(trimActiveVisibleStart);
              const trimActiveWidthPercent = trimActiveVisibleEnd > trimActiveVisibleStart
                ? Math.max(1, trimTimelinePercent(trimActiveVisibleEnd) - trimActiveLeftPercent)
                : 0;
              const trimDraftCutVisible =
                disabledRangeDraft.endSec >= trimTimelineViewportStart &&
                disabledRangeDraft.startSec <= trimTimelineViewportEnd;
              const trimDraftCutLeftPercent = trimTimelinePercent(disabledRangeDraft.startSec);
              const trimDraftCutWidthPercent = Math.max(
                1,
                trimTimelinePercent(disabledRangeDraft.endSec) - trimDraftCutLeftPercent,
              );
              const hasSourceTrim = Boolean(taskSourceTrim && !isFullStoryboardTrim({
                ...taskSourceTrim,
                sourceDurationSec: taskSourceTrim.sourceDurationSec ?? getTaskTrimSourceDuration(task, taskSourceTrim),
              }));
              const hasReadySourceTrimDerived = sourceTrimDerivedStatus?.status === "ready" && Boolean(sourceTrimDerivedStatus.url);
              const selectedTransitionName = task.transition?.name ?? "none";
              const selectedTransitionDuration = task.transition?.durationMs ?? STORYBOARD_DEFAULT_TRANSITION_DURATION_MS;
              const isMediaAttachTarget = mediaAttachTargetTaskId === task.id;
              return (
                <div
                  key={task.id}
                  className={cn(
                    "rounded-lg border bg-background p-2 transition-colors",
                    isMediaAttachTarget
                      ? "border-sky-400 ring-2 ring-sky-100"
                      : isSelected ? "border-blue-300 ring-1 ring-blue-100" : "border-border",
                    !isSelected && "opacity-70",
                  )}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleTask(task.id)}
                      className="mt-1 shrink-0"
                    />

                    <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:w-32 sm:grid-cols-1 lg:w-36">
                      <div className="overflow-hidden rounded-lg border bg-muted/40">
                        <div className="flex h-28 items-center justify-center text-muted-foreground sm:h-20 lg:h-24">
                          {firstLastFrameUrls ? (
                            <div
                              className={cn(
                                "grid h-full w-full",
                                firstLastFrameUrls.length > 1
                                  ? "grid-cols-2"
                                  : "grid-cols-1"
                              )}
                            >
                              {firstLastFrameUrls.map((url, frameIndex) => {
                                const role = getReferenceFrameRole(task, frameIndex as 0 | 1);
                                const label = referenceFrameRoleLabel(role, locale);
                                const frameIndexValue = frameIndex as 0 | 1;
                                const isFrameAttachTarget =
                                  isMediaAttachTarget && mediaAttachTargetFrameIndex === frameIndexValue;
                                return (
                                  <button
                                    key={`${task.id}-frame-${frameIndex}`}
                                    type="button"
                                    className={cn(
                                      "group relative min-w-0 overflow-hidden border-r text-left last:border-r-0",
                                      isFrameAttachTarget ? "ring-2 ring-inset ring-sky-400" : "",
                                    )}
                                    onClick={() => setLightboxMedia({
                                      type: "image",
                                      url,
                                      title: `${t("mediaStudio.storyboardReviewClipLabel", { index: task.index + 1 })} · ${label}`,
                                    })}
                                    onDragOver={handleReferenceFrameDragOver}
                                    onDrop={(event) => void handleReferenceFrameDrop(task.id, frameIndexValue, event)}
                                    title={locale === "th" ? "ขยายดูภาพเต็มจอ" : "Open full-size image"}
                                  >
                                    <img
                                      src={url}
                                      alt={label}
                                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                      loading="lazy"
                                    />
                                    <div className="absolute left-1 top-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                      {referenceFrameRoleLabel(role, locale, true)}
                                    </div>
                                    {onMediaAttachTargetChange ? (
                                      <span
                                        role="button"
                                        tabIndex={0}
                                        className={cn(
                                          "absolute inset-x-1 bottom-1 rounded-md px-1.5 py-1 text-center text-[10px] font-semibold shadow-sm xl:hidden",
                                          isFrameAttachTarget
                                            ? "bg-sky-600 text-white"
                                            : "bg-white/90 text-sky-800",
                                        )}
                                        onClick={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          onMediaAttachTargetChange(
                                            isFrameAttachTarget ? null : task.id,
                                            isFrameAttachTarget ? null : frameIndexValue,
                                          );
                                        }}
                                        onKeyDown={(event) => {
                                          if (event.key !== "Enter" && event.key !== " ") return;
                                          event.preventDefault();
                                          event.stopPropagation();
                                          onMediaAttachTargetChange(
                                            isFrameAttachTarget ? null : task.id,
                                            isFrameAttachTarget ? null : frameIndexValue,
                                          );
                                        }}
                                      >
                                        {isFrameAttachTarget
                                          ? (locale === "th" ? "ช่องนี้" : "Selected")
                                          : (locale === "th"
                                            ? `ใส่รูปที่ ${referenceFrameRoleLabel(role, locale, true)}`
                                            : `Use ${referenceFrameRoleLabel(role, locale, true)}`)}
                                      </span>
                                    ) : null}
                                    <div className="absolute bottom-1 right-1 rounded bg-black/55 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                                      <Maximize2 className="h-3 w-3" />
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          ) : task.status === "generating" ? (
                            <Loader2 className="h-6 w-6 animate-spin" />
                          ) : task.status === "error" ? (
                            <AlertCircle className="h-6 w-6 text-destructive" />
                          ) : isImageShot ? (
                            <ImagePlus className="h-6 w-6" />
                          ) : (
                            <Video className="h-6 w-6" />
                          )}
                        </div>
                      </div>
                      {hasMedia || onUploadVideoSlot ? (
                        <div
                          className={cn(
                            "overflow-hidden rounded-lg border border-dashed bg-muted/20 transition-colors",
                            draggingVideoTaskId === task.id ? "border-blue-400 bg-blue-50" : "border-border",
                          )}
                          onDragEnter={(event) => {
                            handleStoryboardMediaDragOver(event, task.id);
                          }}
                          onDragOver={(event) => {
                            handleStoryboardMediaDragOver(event, task.id);
                          }}
                          onDragLeave={(event) => {
                            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                            setDraggingVideoTaskId((current) => current === task.id ? null : current);
                          }}
                          onDrop={(event) => void handleVideoSlotDrop(task.id, event)}
                        >
                          {hasMedia ? (
                            <div className="relative bg-black">
                              {isImageShot ? (
                                <img
                                  src={task.url || undefined}
                                  alt={summarizePrompt(task.prompt)}
                                  className="h-28 w-full bg-black object-contain sm:h-20 lg:h-24"
                                  loading="lazy"
                                />
                              ) : (
                                <video
                                  src={task.url || undefined}
                                  muted
                                  playsInline
                                  preload="metadata"
                                  className="h-28 w-full bg-black object-contain sm:h-20 lg:h-24"
                                />
                              )}
                              <Button
                                type="button"
                                size="icon"
                                variant="secondary"
                                className="absolute bottom-1 right-1 h-7 w-7 bg-white/90"
                                onClick={() => task.url && setLightboxMedia({
                                  type: isImageShot ? "image" : "video",
                                  url: task.url,
                                  title: t("mediaStudio.storyboardReviewClipLabel", { index: task.index + 1 }),
                                })}
                                title={locale === "th" ? "ขยายสื่อ" : "Expand media"}
                              >
                                <Maximize2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex h-28 flex-col items-center justify-center px-2 text-center text-[11px] text-muted-foreground sm:h-14 lg:h-16">
                              <Upload className="mb-1 h-4 w-4" />
                              <span>{locale === "th" ? "ลากวิดีโอ/รูปมาวาง" : "Drop video/image"}</span>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{t("mediaStudio.storyboardReviewClipLabel", { index: task.index + 1 })}</Badge>
                        <Badge
                          variant={task.status === "completed" ? "default" : task.status === "error" ? "destructive" : "secondary"}
                        >
                          {taskStatusLabel(task.status)}
                        </Badge>
                        {isMediaAttachTarget ? (
                          <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-700">
                            {locale === "th" ? "ปลายทางแนบภาพ" : "Attach target"}
                          </Badge>
                        ) : null}
                        {task.model ? <Badge variant="secondary">{task.model}</Badge> : null}
                        {segmentLabel ? (
                          <Badge variant={videoSegmentPromptStale ? "destructive" : "outline"}>
                            {segmentLabel}{videoSegmentEffectiveMode ? ` · ${videoSegmentEffectiveMode}` : ""}
                          </Badge>
                        ) : null}
                        {videoSegmentPromptStale ? (
                          <Badge variant="destructive">
                            {locale === "th" ? "Prompt ล้าสมัย" : "Prompt stale"}
                          </Badge>
                        ) : null}
                        {task.isImported ? <Badge variant="outline">{t("mediaStudio.storyboardReviewImported")}</Badge> : null}
                        {articleStoryboardMetadata ? (
                          <Badge variant="outline" className="border-violet-300 bg-violet-50 text-violet-800">
                            {locale === "th" ? "Article video" : "Article video"}
                          </Badge>
                        ) : null}
                        {hasMedia ? (
                          <Badge variant="outline">
                            {isImageShot ? (locale === "th" ? "ภาพนิ่ง" : "Image") : (locale === "th" ? "วิดีโอ" : "Video")}
                          </Badge>
                        ) : null}
                        {hasSourceTrim && taskSourceTrim ? (
                          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                            {locale === "th"
                              ? `ใช้ ${taskSourceTrim.inSec}-${taskSourceTrim.outSec}s`
                              : `Trim ${taskSourceTrim.inSec}-${taskSourceTrim.outSec}s`}
                          </Badge>
                        ) : null}
                        <label className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-xs text-muted-foreground">
                          <span>{locale === "th" ? "วินาที/shot" : "Sec/shot"}</span>
                          <select
                            value={String(selectedShotDuration)}
                            disabled={task.status === "generating" || !onUpdateTaskDuration}
                            onChange={(event) => void onUpdateTaskDuration?.(task.id, Number(event.target.value))}
                            className="h-5 rounded border-0 bg-transparent p-0 text-xs font-medium text-foreground outline-none"
                            aria-label={locale === "th" ? "ความยาววิดีโอต่อ shot" : "Video duration per shot"}
                          >
                            {STORYBOARD_SHOT_DURATION_OPTIONS_SECONDS.map((seconds) => (
                              <option key={seconds} value={seconds}>{seconds}s</option>
                            ))}
                          </select>
                        </label>
                        {taskIndex > 0 && onUpdateTaskTransition ? (
                          <label className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-xs text-muted-foreground">
                            <span>{locale === "th" ? "Transition" : "Transition"}</span>
                            <select
                              value={selectedTransitionName}
                              disabled={task.status === "generating"}
                              onChange={(event) => {
                                const name = event.target.value as StoryboardClipTransitionName;
                                void onUpdateTaskTransition(
                                  task.id,
                                  name === "none"
                                    ? undefined
                                    : { name, durationMs: selectedTransitionDuration, alignment: "center" },
                                );
                              }}
                              className="h-5 max-w-28 rounded border-0 bg-transparent p-0 text-xs font-medium text-foreground outline-none"
                              aria-label={locale === "th" ? "Transition ก่อน shot นี้" : "Transition into this shot"}
                            >
                              {STORYBOARD_RENDER_TRANSITION_OPTIONS.map((option) => (
                                <option key={option.name} value={option.name}>
                                  {getTransitionLabel(option.name, locale)}
                                </option>
                              ))}
                            </select>
                            {selectedTransitionName !== "none" ? (
                              <select
                                value={String(selectedTransitionDuration)}
                                disabled={task.status === "generating"}
                                onChange={(event) => void onUpdateTaskTransition(task.id, {
                                  name: selectedTransitionName,
                                  durationMs: Number(event.target.value),
                                  alignment: "center",
                                })}
                                className="h-5 rounded border-0 bg-transparent p-0 text-xs font-medium text-foreground outline-none"
                                aria-label={locale === "th" ? "ความยาว transition" : "Transition duration"}
                              >
                                {[300, 500, 750, 1000, 1500, 2000].map((durationMs) => (
                                  <option key={durationMs} value={durationMs}>
                                    {(durationMs / 1000).toFixed(durationMs % 1000 === 0 ? 0 : 2)}s
                                  </option>
                                ))}
                              </select>
                            ) : null}
                          </label>
                        ) : null}
                        {marketplaceMetadata ? (
                          <Button
                            type="button"
                            size="sm"
                            variant={hasAffiliateUrl ? "secondary" : "outline"}
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() => setExpandedMetadataTaskId((current) => current === task.id ? null : task.id)}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {hasAffiliateUrl ? "Affiliate" : "Metadata"}
                          </Button>
                        ) : null}
                        {articleStoryboardMetadata ? (
                          <Button
                            type="button"
                            size="sm"
                            variant={expandedArticleVideoMetadataTaskId === task.id ? "secondary" : "outline"}
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() => setExpandedArticleVideoMetadataTaskId((current) => current === task.id ? null : task.id)}
                            title={locale === "th" ? "ดูและแก้ข้อความ เสียง และ reference ของ Article video" : "Inspect and edit Article video text, audio, and references"}
                          >
                            <Mic2 className="h-3.5 w-3.5" />
                            {locale === "th" ? "Article video" : "Article video"}
                          </Button>
                        ) : null}
                        {firstLastFrameUrls && onReplaceReferenceFrame ? (
                          <Button
                            type="button"
                            size="sm"
                            variant={expandedFrameTaskId === task.id ? "secondary" : "outline"}
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() => setExpandedFrameTaskId((current) => current === task.id ? null : task.id)}
                          >
                            <ImagePlus className="h-3.5 w-3.5" />
                            {locale === "th" ? "เฟรม" : "Frames"}
                          </Button>
                        ) : null}
                        {hasMedia && !isImageShot && onUpdateTaskSourceTrim ? (
                          <Button
                            type="button"
                            size="sm"
                            variant={expandedTrimTaskId === task.id ? "default" : hasSourceTrim ? "secondary" : "outline"}
                            className={cn(
                              "h-7 gap-1 px-2 text-xs",
                              !hasSourceTrim && expandedTrimTaskId !== task.id ? "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100" : "",
                            )}
                            onClick={() => openTrimPanel(task)}
                            disabled={task.status === "generating"}
                          >
                            <Scissors className="h-3.5 w-3.5" />
                            {locale === "th" ? "ตัดหัว/ท้าย" : "Trim start/end"}
                          </Button>
                        ) : null}
                        {hasSourceTrim && hasMedia && !isImageShot ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-7 rounded-full px-2 text-[11px]",
                              hasReadySourceTrimDerived
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border-amber-200 bg-amber-50 text-amber-800",
                            )}
                          >
                            {hasReadySourceTrimDerived
                              ? (locale === "th" ? "ใช้คลิปที่ตัดแล้ว" : "Prepared clip")
                              : (locale === "th" ? "รอเตรียมคลิปตัด" : "Prepare trim clip")}
                          </Badge>
                        ) : null}
                      </div>

                      {hasMedia && !isImageShot && onUpdateTaskSourceTrim && expandedTrimTaskId !== task.id ? (
                        <button
                          type="button"
                          className="mt-2 flex w-full items-center justify-between rounded-lg border border-dashed border-sky-200 bg-sky-50/60 px-3 py-2 text-left text-xs text-sky-800 transition-colors hover:bg-sky-100"
                          onClick={() => openTrimPanel(task)}
                        >
                          <span className="flex items-center gap-2 font-medium">
                            <Scissors className="h-3.5 w-3.5" />
                            {locale === "th"
                              ? "เปิดแผงตัดหัว/ท้ายวิดีโอของ shot นี้"
                              : "Open start/end trim controls for this shot"}
                          </span>
                          <span className="text-[11px] text-sky-700">
                            {hasSourceTrim && taskSourceTrim
                              ? `${taskSourceTrim.inSec}-${taskSourceTrim.outSec}s`
                              : (locale === "th" ? "ยังใช้เต็มคลิป" : "Full clip")}
                          </span>
                        </button>
                      ) : null}

                      {expandedTrimTaskId === task.id && task.url && !isImageShot ? (
                        <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/50 p-3 shadow-sm">
                          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(220px,360px)_1fr]">
                            <div className="flex min-h-[520px] items-center justify-center overflow-hidden rounded-lg border bg-black lg:min-h-[620px]">
                              <video
                                ref={(node) => {
                                  trimVideoRef.current = node;
                                }}
                                src={task.url}
                                muted={trimPreviewMuted}
                                playsInline
                                preload="metadata"
                                className="h-full max-h-[78dvh] min-h-[520px] w-full bg-black object-contain lg:min-h-[620px]"
                                onLoadedMetadata={(event) => {
                                  const video = event.currentTarget ?? trimVideoRef.current;
                                  if (!video) return;
                                  video.muted = trimPreviewMuted;
                                  video.defaultMuted = trimPreviewMuted;
                                  if (!trimPreviewMuted) video.volume = 1;
                                  const duration = video.duration;
                                  if (!Number.isFinite(duration) || duration <= 0) return;
                                  updateTrimDraft(task.id, (draft) => ({
                                    ...draft,
                                    outSec: draft.outSec >= (draft.sourceDurationSec ?? duration) - 0.05
                                      ? duration
                                      : Math.min(draft.outSec, duration),
                                    sourceDurationSec: duration,
                                  }));
                                  syncTrimVideoToDraft(task.id);
                                }}
                                onTimeUpdate={(event) => {
                                  const video = event.currentTarget ?? trimVideoRef.current;
                                  if (!video) return;
                                  const draft = trimDrafts[task.id] ?? trimDraft;
                                  const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : draft.inSec;
                                  const nextPlayableTime = getStoryboardTrimPreviewPlayableTime(currentTime, draft);
                                  if (nextPlayableTime > currentTime + 0.03) {
                                    video.currentTime = nextPlayableTime;
                                    setTrimPreviewTimes((current) => ({ ...current, [task.id]: roundStoryboardTrimSecond(nextPlayableTime) }));
                                    return;
                                  }
                                  if (currentTime >= draft.outSec - 0.03) {
                                    const resetTime = getStoryboardTrimPreviewPlayableTime(draft.inSec, draft);
                                    video.pause();
                                    video.currentTime = resetTime;
                                    setTrimPreviewTimes((current) => ({ ...current, [task.id]: roundStoryboardTrimSecond(resetTime) }));
                                    setPlayingTrimTaskId((current) => current === task.id ? null : current);
                                    return;
                                  }
                                  setTrimPreviewTimes((current) => ({
                                    ...current,
                                    [task.id]: roundStoryboardTrimSecond(currentTime),
                                  }));
                                }}
                                onPause={() => setPlayingTrimTaskId((current) => current === task.id ? null : current)}
                              />
                            </div>
                            <div className="min-w-0 space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">
                                    {locale === "th" ? "ตัดหัว/ท้ายวิดีโอของ shot นี้" : "Trim this shot source"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {locale === "th"
                                      ? "บันทึกแล้วจะใช้ช่วงนี้ตอน Capture Preview และ Final Composite โดยไม่แก้ไฟล์ต้นฉบับ"
                                      : "Saved trim is applied to Capture Preview and Final Composite without changing the original file."}
                                  </p>
                                </div>
                                <Badge variant="outline" className="bg-background">
                                  {locale === "th"
                                    ? `ใช้จริง ${keptTrimDurationSeconds}s`
                                    : `${keptTrimDurationSeconds}s kept`}
                                </Badge>
                              </div>
                              <div className="rounded-lg border bg-background p-3">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                  <span>{locale === "th" ? `ขอบเขตใช้งาน ${trimDraft.inSec}-${trimDraft.outSec}s` : `Kept boundary ${trimDraft.inSec}-${trimDraft.outSec}s`}</span>
                                  <span>{locale === "th" ? `ตำแหน่งวิดีโอ ${roundStoryboardTrimSecond(trimPreviewTime)}s` : `Playhead ${roundStoryboardTrimSecond(trimPreviewTime)}s`}</span>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                                    {locale === "th" ? "ขอบซ้ายของช่วงใช้งาน" : "Kept range start"}
                                    <input
                                      type="range"
                                      min={0}
                                      max={Math.max(0.5, trimSourceDuration)}
                                      step={0.1}
                                      value={trimDraft.inSec}
                                      onChange={(event) => {
                                        const value = Number(event.target.value);
                                        updateTrimDraft(task.id, (draft) => ({ ...draft, inSec: value }));
                                        if (Number.isFinite(value)) {
                                          setTrimTimelineCenters((current) => ({ ...current, [task.id]: value }));
                                        }
                                      }}
                                      onPointerUp={() => syncTrimVideoToDraft(task.id)}
                                      className="h-10 w-full accent-sky-500"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                                    {locale === "th" ? "ขอบขวาของช่วงใช้งาน" : "Kept range end"}
                                    <input
                                      type="range"
                                      min={0.1}
                                      max={Math.max(0.5, trimSourceDuration)}
                                      step={0.1}
                                      value={trimDraft.outSec}
                                      onChange={(event) => {
                                        const value = Number(event.target.value);
                                        updateTrimDraft(task.id, (draft) => ({ ...draft, outSec: value }));
                                        if (Number.isFinite(value)) {
                                          setTrimTimelineCenters((current) => ({ ...current, [task.id]: value }));
                                        }
                                      }}
                                      className="h-10 w-full accent-sky-500"
                                    />
                                  </label>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                  <span>
                                    {locale === "th"
                                      ? `หน้าต่าง timeline ${roundStoryboardTrimSecond(trimTimelineViewportStart)}-${roundStoryboardTrimSecond(trimTimelineViewportEnd)}s`
                                      : `Timeline window ${roundStoryboardTrimSecond(trimTimelineViewportStart)}-${roundStoryboardTrimSecond(trimTimelineViewportEnd)}s`}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-8 w-8 p-0"
                                      onClick={() => setTrimTimelineZoomLevel(
                                        task.id,
                                        trimDraft,
                                        trimSourceDuration,
                                        trimTimelineZoom / 1.6,
                                      )}
                                      disabled={trimTimelineZoom <= STORYBOARD_TRIM_TIMELINE_MIN_ZOOM}
                                      aria-label={locale === "th" ? "ซูมออก timeline" : "Zoom timeline out"}
                                    >
                                      <ZoomOut className="h-3.5 w-3.5" />
                                    </Button>
                                    <Badge variant="outline" className="min-w-14 justify-center bg-background">
                                      {trimTimelineZoom.toFixed(trimTimelineZoom % 1 === 0 ? 0 : 1)}x
                                    </Badge>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-8 w-8 p-0"
                                      onClick={() => setTrimTimelineZoomLevel(
                                        task.id,
                                        trimDraft,
                                        trimSourceDuration,
                                        trimTimelineZoom * 1.6,
                                      )}
                                      disabled={trimTimelineZoom >= STORYBOARD_TRIM_TIMELINE_MAX_ZOOM}
                                      aria-label={locale === "th" ? "ซูมเข้า timeline" : "Zoom timeline in"}
                                    >
                                      <ZoomIn className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-8 px-3 text-xs"
                                      onClick={() => setTrimTimelineCenters((current) => ({
                                        ...current,
                                        [task.id]: roundStoryboardTrimSecond(
                                          (disabledRangeDraft.startSec + disabledRangeDraft.endSec) / 2,
                                        ),
                                      }))}
                                    >
                                      {locale === "th" ? "ไปช่วงตัด" : "Cut"}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-8 px-3 text-xs"
                                      onClick={() => setTrimTimelineZoomLevel(
                                        task.id,
                                        trimDraft,
                                        trimSourceDuration,
                                        STORYBOARD_TRIM_TIMELINE_MIN_ZOOM,
                                      )}
                                    >
                                      {locale === "th" ? "เต็มคลิป" : "Full"}
                                    </Button>
                                  </div>
                                </div>
                                <div
                                  className="relative mt-3 h-10 touch-none overflow-hidden rounded-full border bg-slate-100 cursor-crosshair"
                                  role="slider"
                                  aria-label={locale === "th" ? "Timeline สำหรับเลือกตำแหน่งตัดวิดีโอ" : "Video trim timeline"}
                                  aria-valuemin={0}
                                  aria-valuemax={trimSourceDuration}
                                  aria-valuenow={roundStoryboardTrimSecond(trimPreviewTime)}
                                  onPointerDown={(event) => {
                                    const pointerTime = getTrimTimelinePointerTime(
                                      event,
                                      trimTimelineViewportStart,
                                      trimTimelineViewportWidth,
                                    );
                                    const cutStartDistance = Math.abs(pointerTime - disabledRangeDraft.startSec);
                                    const cutEndDistance = Math.abs(pointerTime - disabledRangeDraft.endSec);
                                    const edgeThresholdSec = Math.max(0.2, trimTimelineViewportWidth * 0.025);
                                    const isInsideDraftCut =
                                      pointerTime >= disabledRangeDraft.startSec &&
                                      pointerTime <= disabledRangeDraft.endSec;
                                    const mode =
                                      cutStartDistance <= edgeThresholdSec
                                        ? "cut-start"
                                        : cutEndDistance <= edgeThresholdSec
                                          ? "cut-end"
                                          : isInsideDraftCut
                                            ? "cut-range"
                                            : "playhead";
                                    event.currentTarget.setPointerCapture(event.pointerId);
                                    setTrimTimelineDrag({
                                      taskId: task.id,
                                      mode,
                                      rangeOffsetSec: mode === "cut-range"
                                        ? Math.max(0, pointerTime - disabledRangeDraft.startSec)
                                        : undefined,
                                    });
                                    updateTrimTimelineFromPointer(
                                      task.id,
                                      trimDraft,
                                      trimTimelineViewportStart,
                                      trimTimelineViewportWidth,
                                      event,
                                      mode,
                                      mode === "cut-range" ? Math.max(0, pointerTime - disabledRangeDraft.startSec) : 0,
                                    );
                                  }}
                                  onPointerMove={(event) => {
                                    if (!trimTimelineDrag || trimTimelineDrag.taskId !== task.id) return;
                                    updateTrimTimelineFromPointer(
                                      task.id,
                                      trimDraft,
                                      trimTimelineViewportStart,
                                      trimTimelineViewportWidth,
                                      event,
                                      trimTimelineDrag.mode,
                                      trimTimelineDrag.rangeOffsetSec ?? 0,
                                    );
                                  }}
                                  onPointerUp={(event) => {
                                    if (trimTimelineDrag?.taskId === task.id) {
                                      try {
                                        event.currentTarget.releasePointerCapture(event.pointerId);
                                      } catch {
                                        // Pointer capture may already be released by the browser.
                                      }
                                      setTrimTimelineDrag(null);
                                    }
                                  }}
                                  onPointerCancel={() => {
                                    if (trimTimelineDrag?.taskId === task.id) setTrimTimelineDrag(null);
                                  }}
                                >
                                  {trimActiveWidthPercent > 0 ? (
                                    <div
                                      className="pointer-events-none absolute top-3 h-4 rounded-full bg-sky-500"
                                      style={{ left: `${trimActiveLeftPercent}%`, width: `${trimActiveWidthPercent}%` }}
                                    />
                                  ) : null}
                                  {(trimDraft.disabledRanges ?? []).map((range, rangeIndex) => {
                                    if (range.endSec < trimTimelineViewportStart || range.startSec > trimTimelineViewportEnd) return null;
                                    const left = trimTimelinePercent(range.startSec);
                                    const width = Math.max(1, trimTimelinePercent(range.endSec) - left);
                                    return (
                                      <div
                                        key={`${task.id}-disabled-${rangeIndex}`}
                                        className="pointer-events-none absolute top-2 h-6 rounded-full bg-rose-500/90"
                                        style={{ left: `${left}%`, width: `${width}%` }}
                                      />
                                    );
                                  })}
                                  {trimDraftCutVisible ? (
                                    <>
                                      <div
                                        className="pointer-events-none absolute top-1 h-8 rounded-full border-2 border-rose-600 bg-rose-500/25"
                                        style={{ left: `${trimDraftCutLeftPercent}%`, width: `${trimDraftCutWidthPercent}%` }}
                                      />
                                      <div
                                        className="pointer-events-none absolute top-0 h-10 w-2 -translate-x-1/2 rounded-full bg-rose-600"
                                        style={{ left: `${trimDraftCutLeftPercent}%` }}
                                      />
                                      <div
                                        className="pointer-events-none absolute top-0 h-10 w-2 -translate-x-1/2 rounded-full bg-rose-600"
                                        style={{ left: `${trimTimelinePercent(disabledRangeDraft.endSec)}%` }}
                                      />
                                    </>
                                  ) : null}
                                  <div
                                    className="pointer-events-none absolute top-0 h-10 w-0.5 bg-slate-900"
                                    style={{ left: `${trimTimelinePercent(trimPreviewTime)}%` }}
                                  />
                                </div>
                                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                                  <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-sky-500" />{locale === "th" ? "ช่วงที่จะใช้" : "Kept"}</span>
                                  <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-rose-500" />{locale === "th" ? "ตัดออกแล้ว" : "Disabled"}</span>
                                  <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-full border border-rose-600 bg-rose-500/25" />{locale === "th" ? "ช่วงที่กำลัง mark" : "Draft cut"}</span>
                                  <span className="inline-flex items-center gap-1"><span className="h-3 w-0.5 bg-slate-900" />{locale === "th" ? "ตำแหน่งวิดีโอ" : "Playhead"}</span>
                                </div>
                              </div>
                              <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-semibold text-rose-900">
                                      {locale === "th" ? "ตัดช่วงกลางของ shot" : "Disable middle ranges"}
                                    </p>
                                    <p className="text-xs text-rose-800/80">
                                      {locale === "th"
                                        ? `เลือกได้สูงสุด ${STORYBOARD_TRIM_MAX_DISABLED_RANGES} ช่วง และต้องเหลือวิดีโออย่างน้อย ${STORYBOARD_TRIM_MIN_KEPT_DURATION_SECONDS}s`
                                        : `Up to ${STORYBOARD_TRIM_MAX_DISABLED_RANGES} ranges. At least ${STORYBOARD_TRIM_MIN_KEPT_DURATION_SECONDS}s must remain.`}
                                    </p>
                                  </div>
                                  <Badge variant="outline" className="border-rose-200 bg-background text-rose-800">
                                    {locale === "th"
                                      ? `ตัดออก ${disabledDurationSeconds}s`
                                      : `${disabledDurationSeconds}s disabled`}
                                  </Badge>
                                </div>
                                <div className="mt-3 rounded-lg border border-rose-200 bg-background/80 p-2.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-rose-900">
                                    <span>
                                      {locale === "th"
                                        ? `ดูวิดีโอแล้วกด mark จากตำแหน่งปัจจุบัน (${roundStoryboardTrimSecond(trimPreviewTime)}s)`
                                        : `Play the video, then mark from the current playhead (${roundStoryboardTrimSecond(trimPreviewTime)}s)`}
                                    </span>
                                    <span className="font-semibold">
                                      {disabledRangeDraft.startSec}-{disabledRangeDraft.endSec}s
                                    </span>
                                  </div>
                                  <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto_1fr]">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="border-rose-200 text-rose-800 hover:bg-rose-50"
                                      onClick={() => markDisabledRangeDraftPoint(task.id, "start")}
                                    >
                                      {locale === "th" ? "ตั้งจุดเริ่มตัดจากเฟรมนี้" : "Mark cut start here"}
                                    </Button>
                                    <span className="hidden items-center text-xs text-rose-700 md:flex">
                                      {locale === "th" ? "ถึง" : "to"}
                                    </span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="border-rose-200 text-rose-800 hover:bg-rose-50"
                                      onClick={() => markDisabledRangeDraftPoint(task.id, "end")}
                                    >
                                      {locale === "th" ? "ตั้งจุดจบตัดจากเฟรมนี้" : "Mark cut end here"}
                                    </Button>
                                  </div>
                                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                    <label className="grid gap-1 text-[11px] font-medium text-rose-900">
                                      {locale === "th" ? "ปรับเวลาเริ่มตัด" : "Fine tune start"}
                                      <input
                                        type="number"
                                        min={trimDraft.inSec}
                                        max={trimDraft.outSec - STORYBOARD_TRIM_MIN_DISABLED_RANGE_SECONDS}
                                        step={0.1}
                                        value={disabledRangeDraft.startSec}
                                        onChange={(event) => {
                                          const value = Number(event.target.value);
                                          if (Number.isFinite(value)) {
                                            setTrimTimelineCenters((current) => ({ ...current, [task.id]: value }));
                                            updateDisabledRangeDraft(task.id, (draft) => ({ ...draft, startSec: value }));
                                          }
                                        }}
                                        className="h-9 rounded-md border bg-background px-2 text-sm text-slate-900"
                                      />
                                    </label>
                                    <label className="grid gap-1 text-[11px] font-medium text-rose-900">
                                      {locale === "th" ? "ปรับเวลาจบตัด" : "Fine tune end"}
                                      <input
                                        type="number"
                                        min={trimDraft.inSec + STORYBOARD_TRIM_MIN_DISABLED_RANGE_SECONDS}
                                        max={trimDraft.outSec}
                                        step={0.1}
                                        value={disabledRangeDraft.endSec}
                                        onChange={(event) => {
                                          const value = Number(event.target.value);
                                          if (Number.isFinite(value)) {
                                            setTrimTimelineCenters((current) => ({ ...current, [task.id]: value }));
                                            updateDisabledRangeDraft(task.id, (draft) => ({ ...draft, endSec: value }));
                                          }
                                        }}
                                        className="h-9 rounded-md border bg-background px-2 text-sm text-slate-900"
                                      />
                                    </label>
                                  </div>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <Badge variant="outline" className="border-rose-200 bg-background text-rose-800">
                                    {disabledRangeDraft.startSec}-{disabledRangeDraft.endSec}s
                                  </Badge>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="gap-1"
                                    disabled={!canAddDisabledRange}
                                    onClick={() => addDisabledRangeToTrimDraft(task.id)}
                                  >
                                    <Minus className="h-4 w-4" />
                                    {locale === "th" ? "เพิ่มช่วงตัดออก" : "Add disabled range"}
                                  </Button>
                                  {!canAddDisabledRange ? (
                                    <span className="text-[11px] text-rose-700">
                                      {disabledRangeCount >= STORYBOARD_TRIM_MAX_DISABLED_RANGES
                                        ? (locale === "th" ? "ครบจำนวนช่วงสูงสุดแล้ว" : "Maximum ranges reached")
                                        : (locale === "th" ? "ช่วงนี้สั้นเกินไปหรือจะเหลือวิดีโอน้อยเกินไป" : "Range is too short or leaves too little video")}
                                    </span>
                                  ) : null}
                                </div>
                                {(trimDraft.disabledRanges ?? []).length > 0 ? (
                                  <div className="mt-3 grid gap-2">
                                    {(trimDraft.disabledRanges ?? []).map((range, rangeIndex) => (
                                      <div
                                        key={`${task.id}-range-row-${rangeIndex}`}
                                        className="flex items-center justify-between rounded-md border border-rose-200 bg-background px-2 py-1.5 text-xs text-rose-900"
                                      >
                                        <span>
                                          {locale === "th" ? `ช่วงที่ ${rangeIndex + 1}` : `Range ${rangeIndex + 1}`}: {range.startSec}-{range.endSec}s
                                        </span>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 px-2 text-rose-700 hover:text-rose-800"
                                          onClick={() => removeDisabledRangeFromTrimDraft(task.id, rangeIndex)}
                                        >
                                          <X className="mr-1 h-3.5 w-3.5" />
                                          {locale === "th" ? "ลบ" : "Remove"}
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="gap-1"
                                  onClick={() => void toggleTrimPreviewPlayback(task.id)}
                                >
                                  {playingTrimTaskId === task.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                                  {playingTrimTaskId === task.id
                                    ? (locale === "th" ? "หยุด" : "Pause")
                                    : (locale === "th" ? "เล่นช่วงนี้" : "Play range")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="gap-1"
                                  onClick={() => {
                                    const nextMuted = !trimPreviewMuted;
                                    setTrimPreviewMuted(nextMuted);
                                    const video = trimVideoRef.current;
                                    if (video) {
                                      video.muted = nextMuted;
                                      video.defaultMuted = nextMuted;
                                      if (!nextMuted) video.volume = 1;
                                    }
                                  }}
                                  title={trimPreviewMuted
                                    ? (locale === "th" ? "เปิดเสียง preview" : "Unmute preview")
                                    : (locale === "th" ? "ปิดเสียง preview" : "Mute preview")}
                                >
                                  {trimPreviewMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                                  {trimPreviewMuted
                                    ? (locale === "th" ? "เปิดเสียง" : "Unmute")
                                    : (locale === "th" ? "มีเสียง" : "Sound on")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const currentDraft = trimDrafts[task.id] ?? trimDraft;
                                    const sourceDurationSec = Math.max(
                                      0.5,
                                      currentDraft.sourceDurationSec ?? getTaskTrimSourceDuration(task, currentDraft),
                                    );
                                    const next: StoryboardSourceTrimRange = {
                                      inSec: 0,
                                      outSec: roundStoryboardTrimSecond(sourceDurationSec),
                                      sourceDurationSec: roundStoryboardTrimSecond(sourceDurationSec),
                                      disabledRanges: [],
                                    };
                                    setTrimDrafts((current) => ({ ...current, [task.id]: next }));
                                    window.setTimeout(() => syncTrimVideoToDraft(task.id, next), 0);
                                  }}
                                >
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                  {locale === "th" ? "รีเซ็ตเต็มคลิป" : "Reset full clip"}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setTrimDrafts((current) => ({
                                      ...current,
                                      [task.id]: createStoryboardTrimDraft(task),
                                    }));
                                    setExpandedTrimTaskId(null);
                                    setPlayingTrimTaskId(null);
                                  }}
                                >
                                  {locale === "th" ? "ยกเลิก" : "Cancel"}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="gap-1"
                                  onClick={() => void saveTrimDraft(task)}
                                >
                                  <Check className="h-4 w-4" />
                                  {locale === "th" ? "บันทึกช่วง" : "Save trim"}
                                </Button>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                {locale === "th"
                                  ? "รองรับเฟสถัดไป: ช่วงที่ disable กลางคลิปจะถูกเก็บใน trim เดียวกัน และตอน render จะแปลงเป็นหลายช่วงต่อเนื่อง"
                                  : "Future-ready: disabled middle ranges will be stored with this trim and expanded into contiguous render segments."}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {isEditing ? (
                        <p className="mt-1.5 text-sm font-medium leading-5">
                          {t("mediaStudio.storyboardReviewEditPromptLead")}
                        </p>
                      ) : (
                        <div className="mt-2 rounded-lg border bg-slate-50/70 p-3">
                          <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium uppercase text-muted-foreground">
                            <span>Prompt</span>
                            <span>{task.prompt.length.toLocaleString(locale === "th" ? "th-TH" : "en-US")} chars</span>
                          </div>
                          <p className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words pr-2 text-sm leading-6 text-slate-700">
                            {task.prompt}
                          </p>
                        </div>
                      )}

                      {expandedMetadataTaskId === task.id ? renderMarketplaceMetadataPanel(task) : null}
                      {articleStoryboardMetadata && expandedArticleVideoMetadataTaskId === task.id
                        ? renderArticleStoryboardVideoPanel(task, articleStoryboardMetadata)
                        : null}

                      {isEditing ? (
                        <div className="mt-3 space-y-2">
                          <Textarea
                            value={draftPrompt}
                            onChange={(event) => {
                              const value = event.target.value;
                              setDraftPrompts((prev) => ({ ...prev, [task.id]: value }));
                            }}
                            className="min-h-[140px]"
                            placeholder={t("mediaStudio.storyboardReviewEditPromptPlaceholder")}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                void onUpdateTaskPrompt?.(task.id, draftPrompt);
                                setEditingTaskId(null);
                              }}
                            >
                              <X className="mr-2 h-4 w-4" />
                              {t("mediaStudio.storyboardReviewDoneEditing")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setDraftPrompts((prev) => ({ ...prev, [task.id]: task.prompt }))}
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              {t("common.reset")}
                            </Button>
                          </div>
                        </div>
                      ) : task.error ? (
                        <p className="mt-1 text-xs text-destructive">{task.error}</p>
                      ) : null}

                      {firstLastFrameUrls && onReplaceReferenceFrame && expandedFrameTaskId === task.id ? (
                        <div className="mt-2 rounded-lg border bg-muted/20 p-2">
                          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <ImagePlus className="h-3.5 w-3.5" />
                            {t("mediaStudio.storyboardReviewReplaceFrameTitle")}
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {firstLastFrameUrls.map((url, frameIndex) => {
                              const typedFrameIndex = frameIndex as 0 | 1;
                              const key = `${task.id}:${typedFrameIndex}`;
                              const frameRole = getReferenceFrameRole(task, typedFrameIndex);
                              const frameLabel = referenceFrameRoleLabel(frameRole, locale);
                              return (
                                <div key={key} className="space-y-2">
                                  <label className="grid gap-1 text-xs">
                                    <span className="font-medium text-muted-foreground">
                                      {locale === "th" ? "บทบาทภาพของคลิปนี้" : "Frame role for this clip"}
                                    </span>
                                    <select
                                      value={frameRole}
                                      disabled={task.status === "generating" || !onUpdateReferenceFrameRole}
                                      onChange={(event) => void onUpdateReferenceFrameRole?.(task.id, typedFrameIndex, event.target.value as "start" | "stop" | "reference")}
                                      className="h-8 rounded-md border bg-background px-2 text-xs"
                                    >
                                      <option value="start">{referenceFrameRoleLabel("start", locale)}</option>
                                      <option value="stop">{referenceFrameRoleLabel("stop", locale)}</option>
                                      <option value="reference">{referenceFrameRoleLabel("reference", locale)}</option>
                                    </select>
                                  </label>
                                  <ImageSourcePicker
                                    value={[url]}
                                    maxImages={1}
                                    selectionMode="replace"
                                    disabled={task.status === "generating" || replacingReferenceFrameKey === key}
                                    isUploading={replacingReferenceFrameKey === key}
                                    onUpload={onUploadReferenceFrame
                                      ? (files) => onUploadReferenceFrame(task.id, typedFrameIndex, files)
                                      : undefined}
                                    onChange={(urls) => {
                                      const nextUrl = urls[0]?.trim();
                                      if (!nextUrl || nextUrl === url) return;
                                      void onReplaceReferenceFrame(task.id, typedFrameIndex, nextUrl);
                                    }}
                                    label={frameLabel}
                                    helpText={t("mediaStudio.storyboardReviewReplaceFrameHelp")}
                                    language={locale === "th" ? "th" : "en"}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-xs"
                          onClick={() => {
                            if (isEditing) {
                              void onUpdateTaskPrompt?.(task.id, draftPrompt);
                              setEditingTaskId(null);
                              return;
                            }
                            setDraftPrompts((prev) => ({ ...prev, [task.id]: task.prompt }));
                            setEditingTaskId(task.id);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          {isEditing ? "Stop editing" : "Edit"}
                        </Button>
                        {showPromptWorkflowActions ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 text-xs"
                            disabled={!draftPrompt.trim()}
                            onClick={() => void handleCopyTaskPrompt(task.id, draftPrompt)}
                            title={locale === "th" ? "คัดลอก prompt ของคลิปนี้" : "Copy this clip prompt"}
                          >
                            {copiedPromptTaskId === task.id ? (
                              <Check className="mr-2 h-4 w-4" />
                            ) : (
                              <Copy className="mr-2 h-4 w-4" />
                            )}
                            {copiedPromptTaskId === task.id
                              ? (locale === "th" ? "คัดลอกแล้ว" : "Copied")
                              : (locale === "th" ? "Copy Prompt" : "Copy prompt")}
                          </Button>
                        ) : null}
                        {showPromptWorkflowActions ? (
                          <Button
                            type="button"
                            size="sm"
                            variant={isQueuedForGeneration ? "default" : "outline"}
                            className="h-8 px-2 text-xs"
                            disabled={!canRegenerate || task.status === "generating" || Boolean(regeneratingTaskId)}
                            onClick={() => {
                              onStartGenerationBatch?.();
                              void onRegenerateTask(task.id, draftPrompt);
                            }}
                            title={canRegenerate
                              ? isQueuedForGeneration
                                ? t("mediaStudio.storyboardReviewGenerateVideoTitle")
                                : t("mediaStudio.storyboardReviewRegenerateTitle")
                              : t("mediaStudio.storyboardReviewImportedNoRegenerate")}
                          >
                            {regeneratingTaskId === task.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-2 h-4 w-4" />
                            )}
                            {isQueuedForGeneration
                              ? t("mediaStudio.storyboardReviewGenerateVideo")
                              : t("mediaStudio.storyboardReviewRegenerate")}
                          </Button>
                        ) : null}
                        {onPlanScenePrompts && showPromptWorkflowActions ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 text-xs"
                            disabled={isPlanningScenePrompts || task.status === "generating" || Boolean(regeneratingTaskId)}
                            onClick={() => void onPlanScenePrompts(currentPlannerOptions, task.id)}
                            title={videoSegmentId
                              ? locale === "th"
                                ? "ให้ skill สร้าง prompt ใหม่ตาม segment plan ของฉากนี้"
                                : "Use the skill to plan this task from its segment plan"
                              : locale === "th"
                                ? "สร้าง prompt เฉพาะฉากนี้ พร้อมส่งบทบาทภาพแนบและแนวคิด"
                                : "Plan only this scene with frame roles and concept guidance"}
                          >
                            {isPlanningScenePrompts ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic2 className="mr-2 h-4 w-4" />}
                            {videoSegmentId
                              ? locale === "th" ? "สร้าง Prompt segment นี้" : "Plan this segment"
                              : locale === "th" ? "สร้าง Prompt ฉากนี้" : "Plan this scene"}
                          </Button>
                        ) : null}
                        {canSplitVideoSegment ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 text-xs"
                            disabled={task.status === "generating" || Boolean(regeneratingTaskId)}
                            onClick={() => void onSplitVideoSegmentToPerShot?.(task.id, videoSegmentId)}
                            title={locale === "th"
                              ? "แตก segment ที่ล้มเหลวกลับเป็น per-shot หลังตรวจสาเหตุแล้ว"
                              : "Split the failed segment back to per-shot after reviewing the root cause"}
                          >
                            <Scissors className="mr-2 h-4 w-4" />
                            {locale === "th" ? "แยกกลับเป็น per-shot" : "Split to per-shot"}
                          </Button>
                        ) : null}
                        {onUploadVideoSlot ? (
                          <>
                            {onMediaAttachTargetChange ? (
                              <Button
                                type="button"
                                size="sm"
                                variant={isMediaAttachTarget ? "default" : "outline"}
                                className={cn(
                                  "h-9 px-3 text-xs font-semibold xl:hidden",
                                  isMediaAttachTarget
                                    ? "bg-sky-600 text-white shadow-sm hover:bg-sky-700"
                                    : "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100",
                                )}
                                onClick={() => onMediaAttachTargetChange(
                                  isMediaAttachTarget ? null : task.id,
                                  isMediaAttachTarget ? null : 0,
                                )}
                                title={locale === "th"
                                  ? "เลือกช่องรูปด้านบนของ Shot นี้เป็นปลายทางสำหรับภาพจาก History Gallery หรือภาพที่ตัดแล้ว"
                                  : "Use this shot's top image slot as the tap-to-attach target for History Gallery or cut images"}
                              >
                                <ImagePlus className="mr-2 h-4 w-4" />
                                {isMediaAttachTarget
                                  ? (locale === "th" ? `เลือกช่องรูป Shot ${task.index + 1}` : `Shot ${task.index + 1} image slot`)
                                  : (locale === "th" ? "เลือกช่องรูปบนสำหรับภาพที่ตัด" : "Use top image slot for cut images")}
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 text-xs"
                              disabled={task.status === "generating" || Boolean(uploadingVideoSlotKey)}
                              onClick={() => void onUploadVideoSlot(task.id, "replace")}
                              title={t("mediaStudio.storyboardReviewReplaceVideoSlotTitle")}
                            >
                              {uploadingVideoSlotKey === `${task.id}:replace` ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Upload className="mr-2 h-4 w-4" />
                              )}
                              {t("mediaStudio.storyboardReviewReplaceVideoSlot")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={cn(
                                "h-8 px-2 text-xs",
                                draggingVideoTaskId === `${task.id}:insert-after` ? "border-blue-400 bg-blue-50" : "",
                              )}
                              disabled={task.status === "generating" || Boolean(uploadingVideoSlotKey)}
                              onDragEnter={(event) => handleStoryboardMediaDragOver(event, `${task.id}:insert-after`)}
                              onDragOver={(event) => handleStoryboardMediaDragOver(event, `${task.id}:insert-after`)}
                              onDragLeave={(event) => {
                                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                                setDraggingVideoTaskId((current) => current === `${task.id}:insert-after` ? null : current);
                              }}
                              onDrop={(event) => void handleVideoSlotDrop(task.id, event, "insert-after")}
                              onClick={() => void onUploadVideoSlot(task.id, "insert-after")}
                              title={t("mediaStudio.storyboardReviewInsertVideoAfterTitle")}
                            >
                              {uploadingVideoSlotKey === `${task.id}:insert-after` ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Plus className="mr-2 h-4 w-4" />
                              )}
                              {t("mediaStudio.storyboardReviewInsertVideoAfter")}
                            </Button>
                          </>
                        ) : null}
                        {onMoveTask ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 text-xs"
                              disabled={taskIndex === 0}
                              onClick={() => onMoveTask(task.id, "up")}
                            >
                              <ArrowUp className="mr-2 h-4 w-4" />
                              {t("common.up")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 text-xs"
                              disabled={taskIndex === tasks.length - 1}
                              onClick={() => onMoveTask(task.id, "down")}
                            >
                              <ArrowDown className="mr-2 h-4 w-4" />
                              {t("common.down")}
                            </Button>
                          </>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant={isSelected ? "secondary" : "ghost"}
                          className="h-8 px-2 text-xs"
                          onClick={() => onToggleTask(task.id)}
                        >
                          {isSelected ? (
                            <>
                              <Check className="mr-2 h-4 w-4" />
                              {t("mediaStudio.storyboardReviewKeep")}
                            </>
                          ) : (
                            <>
                              <Minus className="mr-2 h-4 w-4" />
                              {t("mediaStudio.storyboardReviewExclude")}
                            </>
                          )}
                        </Button>
                        {onRemoveTask ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 text-xs"
                            onClick={() => onRemoveTask(task.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t("common.remove")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>

        <div className="shrink-0 space-y-2 border-t bg-background px-3 py-2 sm:px-4">
          <div className="flex flex-col gap-2 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs text-sky-950 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">{t("mediaStudio.storyboardReviewWorkflowHintTitle")}</span>
              <span className="max-w-full truncate text-sky-800 xl:max-w-md">{t("mediaStudio.storyboardReviewWorkflowHint")}</span>
              <span className="font-medium">{t("mediaStudio.storyboardReviewRenderEstimate")}</span>
              <span className="text-sky-800">
                {renderDurationLabel
                  ? t("mediaStudio.storyboardReviewRenderEstimateReady", {
                    duration: renderDurationLabel,
                    count: completedSelectedTasks.length,
                  })
                  : t("mediaStudio.storyboardReviewRenderEstimateEmpty")}
              </span>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className="font-medium">{t("mediaStudio.storyboardReviewFinalVideoSize")}</span>
              <select
                className="h-7 rounded-md border border-sky-300 bg-white px-2 text-xs text-sky-950"
                value={renderAspectRatioMode}
                onChange={(event) => onRenderAspectRatioModeChange?.(event.target.value as StoryboardRenderAspectRatioMode)}
                disabled={!onRenderAspectRatioModeChange || isCompounding}
                aria-label={t("mediaStudio.storyboardReviewFinalVideoSize")}
              >
                <option value="auto">{t("mediaStudio.storyboardReviewAspectAuto")}</option>
                <option value="9:16">{t("mediaStudio.storyboardReviewAspect916")}</option>
                <option value="16:9">{t("mediaStudio.storyboardReviewAspect169")}</option>
              </select>
              <span className="text-sky-800">
                {renderOutputLabel ?? t("mediaStudio.storyboardReviewRenderEstimateEmpty")}
              </span>
              {renderAspectRatioSourceLabel ? (
                <span className="text-sky-700">{renderAspectRatioSourceLabel}</span>
              ) : null}
            </div>
          </div>

          {(compoundStatus || projectLink) ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {compoundStatus ? (
                <div className="min-w-0 flex-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs text-blue-900">
                  {compoundStatus}
                </div>
              ) : null}
              {projectLink ? (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-950">
                  <span className="font-medium">{t("mediaStudio.storyboardReviewProjectCreated")}</span>
                  <a className="min-w-0 flex-1 truncate underline decoration-emerald-400 underline-offset-2" href={projectLink}>
                    {t("mediaStudio.storyboardReviewOpenProjectInEditor")}
                  </a>
                  <Button asChild size="sm" className="h-7 bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-700">
                    <a href={projectLink}>
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      {t("mediaStudio.storyboardReviewOpenProject")}
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="h-7 border-emerald-300 bg-white px-2 text-xs text-emerald-900 hover:bg-emerald-50">
                    <a href={projectLink} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      {t("mediaStudio.storyboardReviewOpenNewTab")}
                    </a>
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid grid-cols-1 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
              <div className="flex w-full flex-col gap-1 sm:w-auto">
                {showGenerationCancel ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-full px-2 text-xs"
                    onClick={() => void handleCancelGeneration()}
                    disabled={isCancellingGeneration || isCancellingSelected}
                  >
                    {isCancellingGeneration || isCancellingSelected ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
                    {t("mediaStudio.storyboardReviewCancelGeneration")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="h-8 w-full px-2 text-xs"
                    onClick={() => setConfirmAction("generate")}
                    disabled={generatableSelectedTasks.length === 0 || Boolean(regeneratingTaskId) || isGeneratingSelected}
                    title={t("mediaStudio.storyboardReviewGenerateSelectedHelp")}
                  >
                    <Video className="mr-2 h-4 w-4" />
                    {t("mediaStudio.storyboardReviewGenerateSelected")}
                  </Button>
                )}
              </div>
              <div className="flex w-full flex-col gap-1 sm:w-auto">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 w-full px-2 text-xs"
                  onClick={() => setConfirmAction("render")}
                  disabled={isCompounding || completedSelectedTasks.length === 0}
                  title={t("mediaStudio.storyboardReviewRenderVideoAudioHelp")}
                >
                  {isCompounding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t("mediaStudio.storyboardReviewRenderVideoAudio")}
                </Button>
              </div>
              {onCreateHyperframesFinalComposite ? (
                <div className="flex w-full flex-col gap-1 sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-full px-2 text-xs"
                    onClick={() => onCreateHyperframesFinalComposite()}
                    disabled={isCreatingHyperframesFinalComposite || Boolean(hyperframesFinalCompositeDisabledReason)}
                    title={hyperframesFinalCompositeDisabledReason ?? (locale === "th" ? "Render รวมด้วย HyperFrames พร้อมข้อความและ subtitle" : "Render with HyperFrames text and subtitles")}
                  >
                    {isCreatingHyperframesFinalComposite ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Video className="mr-2 h-4 w-4" />
                    )}
                    {locale === "th" ? "HyperFrames Final" : "HyperFrames Final"}
                  </Button>
                  {hyperframesFinalCompositeStatus ? (
                    <span className="max-w-[13rem] truncate text-[10px] text-sky-700">
                      {hyperframesFinalCompositeStatus}
                    </span>
                  ) : hyperframesFinalCompositeDisabledReason ? (
                    <span className="max-w-[13rem] truncate text-[10px] text-slate-500">
                      {hyperframesFinalCompositeDisabledReason}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="flex w-full flex-col gap-1 sm:w-auto">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 w-full px-2 text-xs"
                  onClick={() => setConfirmAction("project")}
                  disabled={isCreatingProject || completedSelectedTasks.length === 0}
                  title={t("mediaStudio.storyboardReviewCreateVideoEditProjectHelp")}
                >
                  {isCreatingProject ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t("mediaStudio.storyboardReviewCreateVideoEditProject")}
                </Button>
              </div>
            </div>
            {showCloseButton ? (
              <Button type="button" variant="outline" size="sm" className="h-8 w-full px-2 text-xs sm:w-auto" onClick={() => onOpenChange(false)}>
                {closeLabel}
              </Button>
            ) : null}
          </DialogFooter>
          <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirmCopy?.title}</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <span className="block">{confirmCopy?.description}</span>
                  <span className="block font-medium text-foreground">{confirmCopy?.detail}</span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmAction}>
                  {confirmCopy?.actionLabel}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {lightboxMedia ? (
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-3"
              role="dialog"
              aria-modal="true"
              aria-label={lightboxMedia.title}
              onClick={() => setLightboxMedia(null)}
            >
              <div className="flex max-h-full w-full max-w-6xl flex-col gap-3" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between gap-3 text-white">
                  <div className="min-w-0 truncate text-sm font-medium">{lightboxMedia.title}</div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button asChild type="button" size="sm" variant="secondary">
                      <a href={lightboxMedia.url} download target="_blank" rel="noreferrer">
                        <Download className="mr-2 h-4 w-4" />
                        {locale === "th" ? "Download" : "Download"}
                      </a>
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setLightboxMedia(null)}>
                      <X className="mr-2 h-4 w-4" />
                      {locale === "th" ? "ปิด" : "Close"}
                    </Button>
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-black">
                  {lightboxMedia.type === "image" ? (
                    <img
                      src={lightboxMedia.url}
                      alt={lightboxMedia.title}
                      className="max-h-[calc(100dvh-8rem)] max-w-full object-contain"
                    />
                  ) : (
                    <video
                      src={lightboxMedia.url}
                      controls
                      autoPlay
                      className="max-h-[calc(100dvh-8rem)] max-w-full bg-black object-contain"
                    />
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
    </div>
  );
}

export function StoryboardBatchReviewDialog({
  open,
  ...props
}: StoryboardBatchReviewDialogProps) {
  const { t } = useScopedTranslation(["media", "common"]);

  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className="!flex !max-w-[min(92vw,72rem)] !p-0 max-h-[calc(100dvh-2rem)] min-h-0 w-[min(92vw,72rem)] flex-col overflow-hidden">
        <DialogTitle className="sr-only">{t("mediaStudio.storyboardReview")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("mediaStudio.storyboardReviewDialogDescription")}
        </DialogDescription>
        <StoryboardBatchReviewPanel {...props} />
      </DialogContent>
    </Dialog>
  );
}
