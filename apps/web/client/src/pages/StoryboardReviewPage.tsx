import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { Check, ChevronLeft, Crop, Download, ExternalLink, Film, Grid3X3, History, ImagePlus, Layers, Loader2, Maximize2, Music2, Pencil, Scissors, Search, Trash2, Video, X } from "lucide-react";
import { sanitizeProjectName } from "@smartspec/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocaleToggle } from "@/components/LocaleToggle";
import { StoryboardBatchReviewPanel, type StoryboardPromptPlannerOptions } from "@/components/media/StoryboardBatchReviewDialog";
import { RenderProgressDialog } from "@/components/videoeditor/RenderProgressDialog";
import LibrarySearchPanel from "@/components/media/LibrarySearchPanel";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { trpc } from "@/lib/trpc";
import { buildMediaStudioCommonPayload } from "@/lib/mediaStudioPayload";
import {
  COMMON_CROP_RATIOS,
  COMMON_GRIDS,
  createCropPreview,
  createSplitPreview,
  cropImageToAspect,
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
import { extractStoryboardMediaUrl, normalizeStoryboardMediaUrl } from "@/lib/storyboardReviewMedia";
import type { LibrarySearchResultItem } from "@/lib/libraryUi";
import { WebAssetResolver } from "@/services/webAssetResolver";
import {
  DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS,
  clearStoryboardReviewDraft,
  getStoryboardCompanionAudioUpdatedAt,
  getStoryboardReviewName,
  mergeFresherStoryboardReviewTasks,
  normalizeStoryboardReviewDraft,
  readStoryboardReviewDraft,
  replaceStoryboardVideoSlot,
  replaceStoryboardReferenceFrame,
  storyboardDraftToReviewTasks,
  writeStoryboardReviewDraft,
  type StoryboardGenerationTask,
  type StoryboardReferenceFrameRole,
  type StoryboardReviewDraft,
} from "@/lib/storyboardReviewWorkspace";
import { cn } from "@/lib/utils";
import { videoEditorRenderService } from "@/services/videoEditorService";
import { buildVeo31StoryboardVideoPrompt, extractStoryboardNativeSpeechText } from "@shared/storyboardPromptAudio";

const VEO_REFERENCE_IMAGE_ROLE_INSTRUCTION = [
  "Reference image mode: use the attached image(s) only as material, identity, style, product, object, or scene references.",
  "Do not treat any attached image as a start frame, end frame, frozen opening frame, or exact first/last frame unless generationType is FIRST_AND_LAST_FRAMES_2_VIDEO.",
].join(" ");

function applyStoryboardPromptDuration(prompt: string, durationSeconds: number): string {
  const duration = Math.max(1, Math.round(durationSeconds));
  return prompt.replace(/Create an? \d+(?:\.\d+)?-second cinematic video\./i, `Create a ${duration}-second cinematic video.`);
}

function normalizeReferenceFrameRole(value: unknown, fallback: StoryboardReferenceFrameRole): StoryboardReferenceFrameRole {
  return value === "start" || value === "stop" || value === "reference" ? value : fallback;
}

function getTaskReferenceFrameRoles(task: StoryboardGenerationTask): StoryboardReferenceFrameRole[] {
  const roles = Array.isArray(task.storyboardContext?.extraParams?.referenceFrameRoles)
    ? task.storyboardContext?.extraParams?.referenceFrameRoles
    : [];
  return [
    normalizeReferenceFrameRole(roles?.[0], "start"),
    normalizeReferenceFrameRole(roles?.[1], "stop"),
  ];
}

function frameRolesUseExactFirstLast(roles: StoryboardReferenceFrameRole[]): boolean {
  return roles[0] === "start" && roles[1] === "stop";
}

function generationTypeForFrameRoles(roles: StoryboardReferenceFrameRole[]): string {
  return frameRolesUseExactFirstLast(roles) ? "FIRST_AND_LAST_FRAMES_2_VIDEO" : "REFERENCE_2_VIDEO";
}

type StoryboardMediaPickerKind = "video" | "audio";
type StoryboardRightPanelTab = StoryboardMediaPickerKind | "history_gallery";
type StoryboardAudioSourceTab = "library" | "history";
type StoryboardImageEditorMode = "split" | "crop";

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

function getStoryboardReviewProjectThumbnail(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  return findFirstStoryboardReviewThumbnail(record.thumbnailUrl)
    ?? findFirstStoryboardReviewThumbnail(record.reviewData);
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

function buildStoryboardPlannedPrompt(input: {
  basePrompt: string;
  durationSeconds?: number | null;
  aspectRatio?: string | null;
  frameRoles?: readonly string[] | null;
  conceptDetails?: string | null;
  storyboardGuide?: string | null;
  includeVoiceover: boolean;
  speechMode: StoryboardPromptPlannerOptions["speechMode"];
  speechLanguage?: string;
  voiceoverScript?: string;
  includeSound: boolean;
  soundBrief?: string;
}): string {
  return buildVeo31StoryboardVideoPrompt({
    visualPrompt: input.basePrompt,
    durationSeconds: input.durationSeconds,
    aspectRatio: input.aspectRatio,
    frameRoles: input.frameRoles,
    conceptDetails: input.conceptDetails,
    storyboardGuide: input.storyboardGuide,
    includeVoiceover: input.includeVoiceover,
    speechMode: input.speechMode,
    speechLanguage: input.speechLanguage,
    voiceoverScript: input.voiceoverScript,
    includeSound: input.includeSound,
    soundBrief: input.soundBrief,
  }).trim();
}

function getStoryboardPlannerVoiceContext(task?: StoryboardGenerationTask | null): {
  voiceoverScript: string;
  journeyStage: string;
  voiceoverFullScript: string;
} {
  const planner = task?.storyboardContext?.extraParams?.storyboardPromptPlanner as Record<string, unknown> | undefined;
  return {
    voiceoverScript: String(planner?.voiceoverScript ?? extractStoryboardNativeSpeechText(task?.prompt ?? "") ?? "").trim(),
    journeyStage: String(planner?.journeyStage ?? "").trim(),
    voiceoverFullScript: String(planner?.voiceoverFullScript ?? "").trim(),
  };
}

function getStoryboardDraftVoiceoverFullScript(draft?: StoryboardReviewDraft | null): string {
  const explicitScript = String(draft?.voiceoverFullScript ?? "").trim();
  if (explicitScript) return explicitScript;
  const orderedTasks = (draft?.taskIds ?? [])
    .map((taskId) => draft?.tasks.find((task) => task.id === taskId))
    .filter((task): task is StoryboardGenerationTask => Boolean(task));
  return orderedTasks
    .map((task) => getStoryboardPlannerVoiceContext(task).voiceoverScript)
    .filter(Boolean)
    .join("\n");
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const STORYBOARD_GENERATION_POLL_ATTEMPTS = 90;
const STORYBOARD_REVIEW_PAGE_DEBUG_BUILD = "storyboard-review-page-audio-debug-20260527-2325";

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
    kind: "music",
    startTimeSeconds: 0,
    actualDurationSeconds: input.durationSeconds,
    targetDurationSeconds: input.targetDurationSeconds,
    volume: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export default function StoryboardReviewPage() {
  const [, setLocation] = useLocation();
  const { t, locale } = useScopedTranslation(["media", "common"]);
  const [, routeParams] = useRoute("/storyboard-review/:reviewId");
  const parsedReviewId = routeParams?.reviewId ? Number(routeParams.reviewId) : null;
  const reviewId = typeof parsedReviewId === "number" && Number.isFinite(parsedReviewId) && parsedReviewId > 0
    ? parsedReviewId
    : null;
  const trpcUtils = trpc.useUtils();

  const [draft, setDraft] = useState<StoryboardReviewDraft | null>(() => reviewId ? null : readStoryboardReviewDraft());
  const [regeneratingTaskId, setRegeneratingTaskId] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isCompounding, setIsCompounding] = useState(false);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<StoryboardRightPanelTab>("video");
  const [mediaPickerKind, setMediaPickerKind] = useState<StoryboardMediaPickerKind>("video");
  const [audioSourceTab, setAudioSourceTab] = useState<StoryboardAudioSourceTab>("library");
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [selectedLibraryItemId, setSelectedLibraryItemId] = useState<number | null>(null);
  const [replacingReferenceFrameKey, setReplacingReferenceFrameKey] = useState<string | null>(null);
  const [uploadingVideoSlotKey, setUploadingVideoSlotKey] = useState<string | null>(null);
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
  const [isImageToolsPanelOpen, setIsImageToolsPanelOpen] = useState(false);
  const imageToolsPanelRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<StoryboardReviewDraft | null>(draft);
  const lastLocalResyncAtRef = useRef(0);
  const generationCancelRequestedRef = useRef(false);
  const activeGenerationTaskIdRef = useRef<string | null>(null);
  const storedDraftReviewId = typeof draft?.reviewId === "number" && Number.isFinite(draft.reviewId) && draft.reviewId > 0
    ? draft.reviewId
    : null;
  const canonicalReviewId = reviewId ?? storedDraftReviewId;

  const { data: review, isLoading: isReviewLoading } = trpc.videoEditorProjects.getStoryboardReview.useQuery(
    { id: canonicalReviewId ?? 0 },
    { enabled: typeof canonicalReviewId === "number" && Number.isFinite(canonicalReviewId) },
  );
  const { data: reviewProjectsData, refetch: refetchReviews } = trpc.videoEditorProjects.listStoryboardReviews.useQuery({ limit: 50, offset: 0 });
  const saveReviewMutation = trpc.videoEditorProjects.saveStoryboardReview.useMutation();
  const deleteReviewMutation = trpc.videoEditorProjects.deleteStoryboardReview.useMutation();
  const saveProjectMutation = trpc.videoEditorProjects.save.useMutation();
  const uploadMutation = trpc.ai.upload.useMutation();
  const generateVideoAsyncMutation = trpc.media.generateVideoAsync.useMutation();
  const cancelMediaTaskMutation = trpc.media.cancelTask.useMutation();
  const addRenderToLibraryMutation = trpc.mediaJobs.addCompletedRenderToLibrary.useMutation();
  const generateStoryboardVideoPromptMutation = trpc.skills.generateStoryboardVideoPrompt.useMutation();
  const planStoryboardVideoPromptsMutation = trpc.skills.planStoryboardVideoPrompts.useMutation();
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

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const emitStoryboardReviewClientDebug = useCallback((event: string, payload?: Record<string, unknown>) => {
    const currentReviewId = reviewId ?? draftRef.current?.reviewId ?? null;
    writeStoryboardReviewClientDebug({
      event,
      reviewId: currentReviewId,
      pageBuild: STORYBOARD_REVIEW_PAGE_DEBUG_BUILD,
      route: typeof window === "undefined" ? null : `${window.location.pathname}${window.location.search}`,
      payload: {
        routeReviewId: reviewId,
        canonicalReviewId: currentReviewId,
        currentDraft: summarizeStoryboardDraftForDebug(draftRef.current),
        ...payload,
      },
    }, {
      onError: () => undefined,
    });
  }, [reviewId, writeStoryboardReviewClientDebug]);

  const { data: mediaHistoryData, isLoading: isMediaHistoryLoading } = trpc.media.listTasks.useQuery(
    {
      mediaType: mediaPickerKind,
      status: "completed",
      limit: 20,
      offset: 0,
      daysAgo: 30,
    },
    {
      enabled: Boolean(draft),
      refetchOnWindowFocus: true,
    },
  );
  const { data: imageHistoryData, isLoading: isImageHistoryLoading } = trpc.media.listTasks.useQuery(
    {
      mediaType: "image",
      status: "completed",
      limit: 36,
      offset: 0,
      daysAgo: 30,
    },
    {
      enabled: Boolean(draft) && rightPanelTab === "history_gallery",
      refetchOnWindowFocus: true,
    },
  );

  useEffect(() => {
    if (reviewId) {
      const localDraft = readStoryboardReviewDraft();
      const matchingLocalDraft = localDraft?.reviewId === reviewId ? localDraft : null;
      emitStoryboardReviewClientDebug("route.localDraftLoaded", {
        localDraft: summarizeStoryboardDraftForDebug(localDraft),
        matchingLocalDraft: summarizeStoryboardDraftForDebug(matchingLocalDraft),
      });
      setDraft(matchingLocalDraft);
      setRenderJobId(matchingLocalDraft?.renderJobId ?? null);
      setRegeneratingTaskId(null);
      return;
    }

    const localDraft = readStoryboardReviewDraft();
    emitStoryboardReviewClientDebug("route.localDraftLoaded", {
      localDraft: summarizeStoryboardDraftForDebug(localDraft),
      matchingLocalDraft: summarizeStoryboardDraftForDebug(localDraft),
    });
    setDraft(localDraft);
    setRenderJobId(localDraft?.renderJobId ?? null);
    setRegeneratingTaskId(null);
  }, [emitStoryboardReviewClientDebug, reviewId]);

  useEffect(() => {
    const reviewRecord = review as any;
    if (!canonicalReviewId || !reviewRecord || Number(reviewRecord.id) !== canonicalReviewId) return;

    const nextDraft = normalizeStoryboardReviewDraft(reviewRecord.reviewData);
    const rawIncoming = nextDraft ? {
      ...nextDraft,
      reviewId: canonicalReviewId,
      name: nextDraft.name ?? (typeof reviewRecord.name === "string" ? reviewRecord.name : null),
    } : null;
    const current = draftRef.current;
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
      const mergedCurrent = mergeFresherStoryboardReviewTasks(incoming, current);
      emitStoryboardReviewClientDebug("serverReview.appliedLocalNewer", {
        reviewRecordFound: true,
        serverCompanionAudioIsCanonical,
        serverCompanionAudioUpdatedAt,
        currentCompanionAudioUpdatedAt,
        rawIncoming: summarizeStoryboardDraftForDebug(rawIncoming),
        mergedIncoming: summarizeStoryboardDraftForDebug(mergedIncoming),
        appliedDraft: summarizeStoryboardDraftForDebug(mergedCurrent),
      });
      draftRef.current = mergedCurrent;
      writeStoryboardReviewDraft(mergedCurrent);
      setDraft(mergedCurrent);
      setRenderJobId(mergedCurrent.renderJobId ?? null);
      return;
    }
    if (incoming) {
      emitStoryboardReviewClientDebug("serverReview.appliedIncoming", {
        reviewRecordFound: true,
        serverCompanionAudioIsCanonical,
        serverCompanionAudioUpdatedAt,
        currentCompanionAudioUpdatedAt,
        rawIncoming: summarizeStoryboardDraftForDebug(rawIncoming),
        mergedIncoming: summarizeStoryboardDraftForDebug(mergedIncoming),
        appliedDraft: summarizeStoryboardDraftForDebug(incoming),
      });
      draftRef.current = incoming;
      writeStoryboardReviewDraft(incoming);
    }
    setDraft(incoming);
    setRenderJobId(incoming?.renderJobId ?? null);
  }, [canonicalReviewId, emitStoryboardReviewClientDebug, review]);

  const activeDraft = reviewId && draft?.reviewId !== reviewId ? null : draft;
  const tasks = useMemo(() => storyboardDraftToReviewTasks(activeDraft), [activeDraft]);
  const selectedTaskIds = activeDraft?.selectedTaskIds ?? [];
  const completedCount = tasks.filter((task) => task.status === "completed" && task.url).length;
  const selectedReviewId = reviewId ?? activeDraft?.reviewId ?? null;
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
  const currentProjectName = activeDraft ? getStoryboardReviewName(activeDraft) : t("mediaStudio.storyboardReview");
  const filteredReviewProjects = useMemo(() => {
    const reviews = (reviewProjectsData?.reviews ?? []) as any[];
    const query = projectSearchQuery.trim().toLowerCase();
    if (!query) return reviews;
    return reviews.filter((item) => String(item?.name ?? "").toLowerCase().includes(query));
  }, [projectSearchQuery, reviewProjectsData?.reviews]);

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

    const next = ensureDraftNewerThan(updater(current), current);
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
    const serverDraft = normalizeStoryboardReviewDraft((review as any)?.reviewData);
    if (!isDraftNewerThan(activeDraft, serverDraft)) return;
    if (lastLocalResyncAtRef.current === activeDraft.updatedAt) return;

    lastLocalResyncAtRef.current = activeDraft.updatedAt;
    void saveCurrentDraft(activeDraft).catch((error) => {
      toast.error(error instanceof Error ? error.message : t("mediaStudio.storyboardReviewSaveFailed"));
    });
  }, [activeDraft, review, reviewId, saveCurrentDraft, t]);

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

  const addImportedAudioToStoryboard = useCallback(async (input: {
    idPrefix: string;
    title: string;
    url: string;
    model?: string | null;
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
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/uri-list", input.url);
    event.dataTransfer.setData("text/plain", input.url);
    event.dataTransfer.setData("application/x-smartspec-media-type", "image");
    event.dataTransfer.setData("text/x-smartspec-media-type", "image");
    event.dataTransfer.setData("DownloadURL", `image/jpeg:${filename}:${input.url}`);
  }, []);

  const downloadStoryboardImage = useCallback((url: string, title: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "storyboard-image"}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

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
      const rows = mode === "split" ? detected?.rows ?? 3 : splitGridRows;
      const cols = mode === "split" ? detected?.cols ?? 3 : splitGridCols;
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
    const selected = reviewTasks.filter((task) => draft.selectedTaskIds.includes(task.id) && task.status === "completed" && task.url);
    return selected.map((task) => ({
      id: task.id,
      prompt: task.prompt,
      url: task.url!,
      model: task.model,
      durationSeconds: task.durationSeconds,
      mediaType: task.mediaType,
      transition: task.transition,
      generationModelId: task.generationModelId,
      referenceUrls: task.referenceUrls,
      generationAspectRatio: task.generationAspectRatio,
      generationExtraParams: task.generationExtraParams,
    }));
  }, [draft]);

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
    return buildStoryboardVideoProject(
      selectedRenderClips,
      {
        projectName: sanitizeProjectName(`Storyboard Edit ${new Date().toLocaleString()}`),
        companionAudio: draft.companionAudio,
        muteVideoClipAudio: draft.companionAudio.length > 0 || reviewTasks.some((task) => /External audio workflow/i.test(task.prompt)),
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
    return buildStoryboardVideoProject(
      preparedClips,
      {
        projectName: sanitizeProjectName(`Storyboard Edit ${new Date().toLocaleString()}`),
        companionAudio: preparedAudio,
        muteVideoClipAudio: preparedAudio.length > 0 || reviewTasks.some((task) => /External audio workflow/i.test(task.prompt)),
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
    const candidateTasks = reviewTasks.filter((task) => {
      const refs = task.referenceUrls?.map((url) => String(url || "").trim()).filter(Boolean) ?? [];
      return (targetTaskId ? task.id === targetTaskId : selectedIds.has(task.id)) && refs.length >= 2 && task.canRegenerate !== false;
    });
    if (candidateTasks.length === 0) {
      toast.error(t("mediaStudio.storyboardReviewClipContextMissing"));
      return;
    }

    const productMetadata = draft.marketplaceContext
      ?? candidateTasks.find((task) => task.marketplaceProduct)?.marketplaceProduct
      ?? candidateTasks
        .map((task) => task.generationExtraParams?.marketplaceContext)
        .find((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
      ?? null;

    const planningStatus = locale === "th" ? "กำลังสร้าง prompt ทุกฉาก..." : "Planning prompts for every scene...";
    const plannedStatusLabel = locale === "th" ? "สร้าง prompt ทุกฉากแล้ว" : "Scene prompts planned";

    setAndSaveDraft((current) => ({
      ...current,
      compoundStatus: planningStatus,
    }));

    try {
      const orderedDraftTasks = draft.taskIds
        .map((taskId) => draft.tasks.find((task) => task.id === taskId))
        .filter((task): task is StoryboardGenerationTask => Boolean(task));
      const draftTaskPositionById = new Map(orderedDraftTasks.map((task, index) => [task.id, index]));
      const targetVoiceContext = targetTaskId
        ? getStoryboardPlannerVoiceContext(orderedDraftTasks.find((task) => task.id === targetTaskId))
        : null;
      const existingVoiceoverFullScript = targetVoiceContext?.voiceoverFullScript
        || orderedDraftTasks
          .map((task) => getStoryboardPlannerVoiceContext(task).voiceoverScript)
          .filter(Boolean)
          .join("\n");
      const editedVoiceoverFullScript = String(draft.voiceoverFullScript ?? "").trim();
      const useVoiceoverScriptAsConcept = Boolean(draft.useVoiceoverScriptAsConcept && editedVoiceoverFullScript);
      const voiceoverFullScript = useVoiceoverScriptAsConcept
        ? editedVoiceoverFullScript
        : targetTaskId
          ? (editedVoiceoverFullScript || existingVoiceoverFullScript)
          : "";
      const effectiveConceptDetails = useVoiceoverScriptAsConcept
        ? editedVoiceoverFullScript
        : (draft.conceptDetails ?? "");
      const result = await planStoryboardVideoPromptsMutation.mutateAsync({
        productMetadata: productMetadata as Record<string, unknown> | null,
        includeVoiceover: options.includeVoiceover,
        speechMode: options.speechMode,
        speechLanguage: options.speechLanguage,
        includeSound: options.includeSound,
        tone: options.tone,
        language: options.language,
        conceptDetails: effectiveConceptDetails || undefined,
        storyboardGuide: draft.storyboardGuide ?? undefined,
        voiceoverFullScript: voiceoverFullScript || undefined,
        useVoiceoverScriptAsConcept,
        slots: candidateTasks.map((task) => {
          const sourceTask = draft.tasks.find((item) => item.id === task.id);
          const sourceTaskPosition = sourceTask ? draftTaskPositionById.get(sourceTask.id) : undefined;
          const previousTask = typeof sourceTaskPosition === "number" ? orderedDraftTasks[sourceTaskPosition - 1] : undefined;
          const nextTask = typeof sourceTaskPosition === "number" ? orderedDraftTasks[sourceTaskPosition + 1] : undefined;
          const previousVoiceContext = getStoryboardPlannerVoiceContext(previousTask);
          const nextVoiceContext = getStoryboardPlannerVoiceContext(nextTask);
          return {
            id: task.id,
            index: task.index,
            currentPrompt: task.prompt,
            startFrameUrl: task.referenceUrls?.[0] || "",
            endFrameUrl: task.referenceUrls?.[1] || "",
            frameRoles: sourceTask ? getTaskReferenceFrameRoles(sourceTask) : ["start", "stop"],
            conceptDetails: effectiveConceptDetails || undefined,
            storyboardGuide: draft.storyboardGuide ?? undefined,
            aspectRatio: task.generationAspectRatio,
            durationSeconds: task.durationSeconds,
            model: task.generationModelId || task.model,
            voiceoverFullScript: voiceoverFullScript || undefined,
            ...(targetTaskId ? {
              previousVoiceoverScript: previousVoiceContext.voiceoverScript || undefined,
              nextVoiceoverScript: nextVoiceContext.voiceoverScript || undefined,
              previousJourneyStage: previousVoiceContext.journeyStage || undefined,
              nextJourneyStage: nextVoiceContext.journeyStage || undefined,
              previousPrompt: previousTask?.prompt,
              nextPrompt: nextTask?.prompt,
            } : {}),
          };
        }),
      });
      const plannedById = new Map(result.slots.map((slot) => [slot.id, slot]));
      const nextStatus = `${plannedStatusLabel} ${result.slots.length}/${candidateTasks.length}`;
      setAndSaveDraft((current) => ({
        ...current,
        updatedAt: Date.now(),
        compoundStatus: nextStatus,
        tasks: current.tasks.map((task) => {
          const planned = plannedById.get(task.id);
          if (!planned) return task;
          const prompt = buildStoryboardPlannedPrompt({
            basePrompt: planned.videoPrompt || task.prompt,
            durationSeconds: task.storyboardContext?.duration ?? task.durationSeconds,
            aspectRatio: task.storyboardContext?.aspectRatio ?? task.aspectRatio ?? null,
            frameRoles: getTaskReferenceFrameRoles(task),
            conceptDetails: effectiveConceptDetails || null,
            storyboardGuide: draft.storyboardGuide ?? null,
            includeVoiceover: options.includeVoiceover,
            speechMode: options.speechMode,
            speechLanguage: options.speechLanguage,
            voiceoverScript: planned.voiceoverScript,
            includeSound: options.includeSound,
            soundBrief: planned.soundBrief,
          });
          return {
            ...task,
            prompt,
            error: undefined,
            statusDetail: planned.journeyStage
              ? `Prompt planned: ${planned.journeyStage}`
              : plannedStatusLabel,
            updatedAt: Date.now(),
            storyboardContext: task.storyboardContext
              ? {
                  ...task.storyboardContext,
                  extraParams: {
                    ...(task.storyboardContext.extraParams ?? {}),
                    storyboardPromptPlanner: {
                      skillId: "storyboard-video-customer-journey-prompt",
                      journeyStage: planned.journeyStage,
                      voiceoverScript: planned.voiceoverScript,
                      speechMode: options.speechMode,
                      speechLanguage: options.speechLanguage,
                      soundBrief: planned.soundBrief,
                      qualityNotes: planned.qualityNotes,
                      globalVideoStrategy: result.globalVideoStrategy,
                      voiceoverFullScript: result.voiceoverFullScript,
                      soundFullBrief: result.soundFullBrief,
                    },
                  },
                }
              : task.storyboardContext,
          };
        }),
        voiceoverFullScript: useVoiceoverScriptAsConcept
          ? (current.voiceoverFullScript ?? null)
          : (result.voiceoverFullScript || current.voiceoverFullScript || null),
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
        ? {
            ...task,
            prompt: normalizedPrompt,
            status: task.status === "completed" ? "queued" : task.status,
            url: task.status === "completed" ? undefined : task.url,
            error: undefined,
            backendTaskId: undefined,
            providerTaskId: undefined,
            statusDetail: locale === "th" ? "แก้ไข prompt แล้ว" : "Prompt edited",
            updatedAt: Date.now(),
          }
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
        return {
          ...task,
          prompt: applyStoryboardPromptDuration(task.prompt, safeDuration),
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
                extraParams: nextExtraParams,
              }
            : task.storyboardContext,
        };
      }),
      compoundStatus: locale === "th" ? `ปรับความยาว shot เป็น ${safeDuration} วินาทีแล้ว` : `Shot duration set to ${safeDuration}s.`,
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
      const jobId = await videoEditorRenderService.startRender(JSON.stringify(project), outputPath);
      setRenderJobId(jobId);
      setAndSaveDraft((current) => ({ ...current, projectLink: link, renderJobId: jobId, compoundStatus: t("mediaStudio.storyboardReviewRenderStartedStatus") }));
      toast.success(t("mediaStudio.storyboardReviewRenderStarted"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("mediaStudio.storyboardReviewRenderFailed"));
      setAndSaveDraft((current) => ({ ...current, compoundStatus: null }));
    } finally {
      setIsCompounding(false);
    }
  }, [buildPreparedSelectedProject, draft, locale, saveProjectMutation, selectedRenderClips.length, setAndSaveDraft, t]);

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

  const regenerateTask = useCallback(async (taskId: string, prompt: string): Promise<boolean> => {
    if (!draft || generationCancelRequestedRef.current) return false;
    const task = draft.tasks.find((item) => item.id === taskId);
    if (!task?.storyboardContext) {
      toast.error(t("mediaStudio.storyboardReviewClipContextMissing"));
      return true;
    }
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      toast.error(t("mediaStudio.storyboardReviewPromptRequired"));
      return true;
    }

    activeGenerationTaskIdRef.current = null;
    setRegeneratingTaskId(taskId);
    setIsCancellingGeneration(false);
    setAndSaveDraft((current) => updateDraftTask(current, taskId, {
      status: "generating",
      prompt: normalizedPrompt,
      error: undefined,
      backendTaskId: undefined,
      providerTaskId: undefined,
      statusDetail: t("mediaStudio.storyboardReviewRegeneratingClip"),
    }));
    try {
      if (generationCancelRequestedRef.current) {
        return false;
      }
      const context = task.storyboardContext;
      const frameRoles = getTaskReferenceFrameRoles(task);
      const generationType = generationTypeForFrameRoles(frameRoles);
      const startFrameUrl = context.referenceImages?.[0]?.url?.trim();
      const endFrameUrl = context.referenceImages?.[1]?.url?.trim();
      const generationPrompt = startFrameUrl && endFrameUrl
        ? stripPromptCodeFence((await generateStoryboardVideoPromptMutation.mutateAsync({
          currentPrompt: normalizedPrompt,
          startFrameUrl,
          endFrameUrl,
          frameRoles,
          conceptDetails: draft.conceptDetails ?? undefined,
          storyboardGuide: draft.storyboardGuide ?? undefined,
          aspectRatio: context.aspectRatio,
          durationSeconds: context.duration ?? task.durationSeconds,
          model: context.model,
          marketplaceContext: (context.extraParams?.marketplaceContext ?? task.marketplaceProduct ?? draft.marketplaceContext) as any,
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
        model: context.model,
        aspectRatio: context.aspectRatio,
        referenceImages: context.referenceImages as any,
        referenceVideos: context.referenceVideos as any,
        extraParams: {
          ...(context.extraParams ?? {}),
          generationType,
          referenceFrameRoles: frameRoles,
          ...(draft.conceptDetails ? { productionConceptDetails: draft.conceptDetails } : {}),
          ...(draft.storyboardGuide ? { storyboardGuide: draft.storyboardGuide } : {}),
        },
        apiConfig: context.apiConfig,
        resolution: context.resolution,
      });
      const taskResult = await generateVideoAsyncMutation.mutateAsync({
        ...payload,
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
      let completedUrl = immediateUrl;
      if (!completedUrl && pollId) {
        for (let attempt = 0; attempt < STORYBOARD_GENERATION_POLL_ATTEMPTS; attempt += 1) {
          if (generationCancelRequestedRef.current) {
            await cancelMediaTaskMutation.mutateAsync({ taskId: String(pollId) }).catch(() => undefined);
            setAndSaveDraft((current) => updateDraftTask(current, taskId, {
              status: "queued",
              error: undefined,
              statusDetail: t("mediaStudio.storyboardReviewGenerationCancelled"),
            }));
            return false;
          }
          const currentTask = await trpcUtils.media.getTask.fetch({ taskId: pollId });
          const status = String((currentTask as any)?.status || "").toLowerCase();
          if (status === "completed" || status === "failed" || status === "cancelled") {
            if (status === "cancelled") {
              setAndSaveDraft((current) => updateDraftTask(current, taskId, {
                status: "queued",
                error: undefined,
                statusDetail: t("mediaStudio.storyboardReviewGenerationCancelled"),
              }));
              toast.info(t("mediaStudio.storyboardReviewGenerationCancelled"));
              return false;
            }
            if (status !== "completed") throw new Error((currentTask as any)?.errorMessage || t("mediaStudio.storyboardReviewVideoGenerationFailed"));
            completedUrl = extractStoryboardMediaUrl(currentTask as any, "video");
            break;
          }
          await sleepMs(2000);
        }
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
  }, [cancelMediaTaskMutation, draft, generateStoryboardVideoPromptMutation, generateVideoAsyncMutation, setAndSaveDraft, trpcUtils.media.getTask, t]);

  const deleteReview = useCallback(async (id: number) => {
    await deleteReviewMutation.mutateAsync({ id });
    if (draft?.reviewId === id || reviewId === id) {
      clearStoryboardReviewDraft();
      setLocation("/storyboard-review");
      setDraft(null);
    }
    void refetchReviews();
    toast.success(t("mediaStudio.storyboardReviewDeleted"));
  }, [deleteReviewMutation, draft?.reviewId, refetchReviews, reviewId, setLocation]);

  const reviewNotFound = !!canonicalReviewId && !isReviewLoading && review === null;
  const isLoading = !!canonicalReviewId && !reviewNotFound && (isReviewLoading || !activeDraft);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 xl:h-dvh xl:overflow-hidden">
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
            <Button variant="outline" size="sm" className="h-8 w-full px-2 text-xs sm:w-auto" onClick={() => setLocation("/media-studio")}>
              {t("mediaStudio.title")}
            </Button>
          </div>
        </div>
      </header>

      <main
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto p-2 xl:overflow-hidden",
          rightPanelTab === "history_gallery" && imageToolsSourceUrl && isImageToolsPanelOpen
            ? "xl:grid-cols-[minmax(0,1fr)_50rem] 2xl:grid-cols-[minmax(0,1fr)_56rem]"
            : "xl:grid-cols-[minmax(0,1fr)_26rem] 2xl:grid-cols-[minmax(0,1fr)_30rem]",
        )}
      >
        <section className="min-h-[72dvh] overflow-hidden rounded-lg border bg-white sm:min-h-[calc(100dvh-6rem)] xl:h-full xl:min-h-0">
          {isLoading ? (
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
              onUpdateTaskPrompt={updateTaskPrompt}
              onUpdateTaskDuration={updateTaskDuration}
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
              isPlanningScenePrompts={planStoryboardVideoPromptsMutation.isPending}
              onStartGenerationBatch={startStoryboardGenerationBatch}
              onCancelGeneration={cancelStoryboardGeneration}
              onReplaceReferenceFrame={replaceReferenceFrame}
              onUpdateReferenceFrameRole={updateReferenceFrameRole}
              onUploadReferenceFrame={uploadReferenceFrameFiles}
              replacingReferenceFrameKey={replacingReferenceFrameKey}
              onUploadVideoSlot={uploadVideoToStoryboardSlot}
              uploadingVideoSlotKey={uploadingVideoSlotKey}
              onMoveTask={moveStoryboardTask}
              onRemoveTask={removeStoryboardTask}
              onAutoCompound={autoCompound}
              onCreateProject={createProject}
              isCompounding={isCompounding}
              isCreatingProject={isCreatingProject}
              isCancellingGeneration={isCancellingGeneration}
              regeneratingTaskId={regeneratingTaskId}
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
              className="h-full"
            />
          ) : (
            <div className="flex h-full min-h-[24rem] flex-col items-center justify-center p-6 text-center">
              <Layers className="mb-3 h-10 w-10 text-slate-400" />
              <h1 className="text-lg font-semibold text-slate-950">{t("mediaStudio.storyboardReviewNoSelectionTitle")}</h1>
              <p className="mt-2 max-w-md text-sm text-slate-600">
                {t("mediaStudio.storyboardReviewNoSelectionDesc")}
              </p>
            </div>
          )}
        </section>

        <aside className="flex max-h-[calc(100dvh-1rem)] min-h-[28rem] flex-col overflow-hidden rounded-lg border bg-white xl:h-full xl:min-h-0 xl:max-h-none">
          <div className="max-h-none shrink-0 space-y-3 overflow-y-visible border-b p-2.5 sm:p-3 xl:max-h-[68%] xl:overflow-y-auto xl:overscroll-contain">
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
                                <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded border bg-slate-100">
                                  {mediaPickerKind === "video" && resultUrl ? (
                                    <video src={resultUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                                  ) : (
                                    <Film className="h-4 w-4 text-slate-400" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-xs font-medium text-slate-900">{title}</div>
                                  <div className="truncate text-[11px] text-slate-500">{task.model || task.mediaType}</div>
                                </div>
                              </div>
                            )}
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
                      ? "xl:grid xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start xl:gap-3 xl:space-y-0 2xl:grid-cols-[minmax(0,1fr)_25rem]"
                      : "",
                  )}
                >
                  <div className="rounded-lg border bg-white p-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
                        <History className="h-3.5 w-3.5" />
                        History Gallery
                      </h3>
                      {isImageHistoryLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
                    </div>
                    {imageHistoryTasks.length === 0 && !isImageHistoryLoading ? (
                      <div className="rounded-md border border-dashed p-3 text-xs text-slate-500">
                        {locale === "th" ? "ยังไม่มีรูปใน History Gallery" : "No image history yet."}
                      </div>
                    ) : (
                      <div className={cn(
                        "grid max-h-[28rem] grid-cols-2 gap-2 overflow-y-auto overscroll-contain pr-1",
                        imageToolsSourceUrl && isImageToolsPanelOpen ? "xl:max-h-[calc(100dvh-14rem)]" : "",
                      )}>
                        {imageHistoryTasks.map(({ task, url, title }) => {
                          const cardKey = String(task.id ?? task.taskId ?? url);
                          return (
                            <div
                              key={cardKey}
                              className="overflow-hidden rounded-lg border bg-white shadow-sm"
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
                  <div ref={imageToolsPanelRef} className="rounded-lg border border-sky-200 bg-white p-2 shadow-sm xl:sticky xl:top-2 xl:max-h-[calc(100dvh-5rem)] xl:overflow-y-auto xl:overscroll-contain">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
                        <Scissors className="h-3.5 w-3.5" />
                        {locale === "th" ? "เครื่องมือตัดภาพ" : "Image Tools"}
                      </h3>
                      <div className="flex min-w-0 items-center gap-1.5">
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
                                <div className="grid grid-cols-3 gap-1.5">
                                  {splitResults.map((result, index) => {
                                    const sequenceNumber = index + 1;
                                    return (
                                      <div
                                        key={result.index}
                                        className="group relative aspect-square cursor-grab overflow-hidden rounded-md border bg-slate-100 active:cursor-grabbing"
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
                                  className="cursor-grab overflow-hidden rounded-md border bg-slate-100 active:cursor-grabbing"
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

          <div className="border-b p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">{t("mediaStudio.storyboardReviewProjects")}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {t("mediaStudio.storyboardReviewSavedReviews", { count: reviewProjectsData?.total ?? 0 })}
                </p>
              </div>
              <Badge variant="secondary">{t("mediaStudio.storyboardReviewReadyBadge", { completed: completedCount, total: tasks.length })}</Badge>
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
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-lg border p-3 transition-colors",
                        item.id === selectedReviewId ? "border-cyan-300 bg-cyan-50" : "bg-white hover:bg-slate-50",
                      )}
                    >
                      <div className="flex gap-3">
                        <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md border bg-slate-100">
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
                          <div className="truncate text-sm font-semibold text-slate-950">{item.name}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {t("mediaStudio.storyboardReviewClipsReady", {
                              completed: item.completedClipCount ?? 0,
                              total: item.clipCount ?? 0,
                            })}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {item.updatedAt ? new Date(item.updatedAt).toLocaleString(locale === "th" ? "th-TH" : "en-US") : "-"}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => setLocation(`/storyboard-review/${item.id}`)}>{t("mediaStudio.storyboardReviewOpen")}</Button>
                        {item.videoEditorProjectId ? (
                          <Button size="sm" variant="outline" onClick={() => setLocation(`/video-editor?projectId=${item.videoEditorProjectId}`)}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            {t("mediaStudio.storyboardReviewOpenEditor")}
                          </Button>
                        ) : null}
                        <Button size="icon" variant="ghost" onClick={() => void deleteReview(item.id)} disabled={deleteReviewMutation.isPending}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      </main>

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
            void addRenderToLibraryMutation
              .mutateAsync({
                jobId: completedJobId,
                title: draft ? `${getStoryboardReviewName(draft)} - Final video` : undefined,
              })
              .then((result) => {
                toast.success(
                  result.created
                    ? t("mediaStudio.storyboardReviewRenderLibrarySaved")
                    : t("mediaStudio.storyboardReviewRenderLibraryAlreadySaved"),
                );
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
        />
      ) : null}
    </div>
  );
}
