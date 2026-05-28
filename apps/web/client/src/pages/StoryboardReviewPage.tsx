import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { Check, ChevronLeft, ExternalLink, Film, Layers, Loader2, Music2, Pencil, Search, Trash2, Video, X } from "lucide-react";
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
import { cropImageToAspect, loadImage } from "@/lib/imageGridSplitter";
import {
  buildStoryboardVideoProject,
  getStoryboardRenderResolution,
  inferStoryboardRenderAspectRatio,
  type StoryboardClipCandidate,
  type StoryboardCompanionAudioCandidate,
  type StoryboardRenderAspectRatioMode,
} from "@/lib/storyboardVideoProject";
import { extractStoryboardMediaUrl, normalizeStoryboardMediaUrl } from "@/lib/storyboardReviewMedia";
import type { LibrarySearchResultItem } from "@/lib/libraryUi";
import { WebAssetResolver } from "@/services/webAssetResolver";
import {
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
type StoryboardAudioSourceTab = "library" | "history";

function isProbablyVideoUrl(value: string): boolean {
  const normalized = value.split("?", 1)[0]?.toLowerCase() ?? "";
  return normalized.startsWith("data:video/") || /\.(mp4|webm|mov|avi|mkv)$/i.test(normalized);
}

function isProbablyImageUrl(value: string): boolean {
  const normalized = value.split("?", 1)[0]?.toLowerCase() ?? "";
  return normalized.startsWith("data:image/") || /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(normalized);
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

function createImportedVideoTask(input: {
  idPrefix: string;
  title: string;
  url: string;
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
    type: "video",
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
      enabled: Boolean(draft),
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
    const targetAspectRatio = normalizeVideoFrameAspectRatio(aspectRatio);
    if (!targetAspectRatio) {
      return imageUrl;
    }

    try {
      const image = await loadImage(imageUrl);
      if (isCloseToAspectRatio(image.naturalWidth, image.naturalHeight, targetAspectRatio)) {
        return imageUrl;
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

  const addImportedVideoToStoryboard = useCallback((input: {
    idPrefix: string;
    title: string;
    url: string;
    model?: string | null;
    durationSeconds?: number;
  }) => {
    const url = input.url.trim();
    if (!url) {
      toast.error(t("mediaStudio.storyboardReviewNoVideoUrl"));
      return;
    }
    setAndSaveDraft((current) => {
      const task = createImportedVideoTask({
        idPrefix: input.idPrefix,
        title: input.title,
        url,
        model: input.model,
        importedLabel: t("mediaStudio.storyboardReviewImported"),
        importedClipLabel: t("mediaStudio.storyboardReviewImportedClip"),
        durationSeconds: input.durationSeconds,
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
    toast.success(t("mediaStudio.storyboardReviewVideoAdded"));
  }, [setAndSaveDraft, t]);

  const uploadVideoToStoryboardSlot = useCallback(async (taskId: string, mode: "replace" | "insert-after", files?: FileList | File[]) => {
    const file = files?.[0] ?? await new Promise<File | null>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "video/*";
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.click();
    });
    if (!file) return;
    if (!file.type.startsWith("video/")) {
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
      const [uploadResult, videoMetadata] = await Promise.all([
        storyboardUploadAssetResolver.uploadAsset(file).promise,
        readVideoMetadata(file),
      ]);

      setRenderJobId(null);
      const savedDraft = await persistDraftUpdate((current) => {
        const slotIndex = current.taskIds.indexOf(taskId);
        if (slotIndex < 0) return current;
        const importedTask = createImportedVideoTask({
          idPrefix: `uploaded-video-${mode}`,
          title: file.name,
          url: uploadResult.uri,
          model: t("mediaStudio.storyboardReviewUploadedVideo"),
          importedLabel: t("mediaStudio.storyboardReviewImported"),
          importedClipLabel: t("mediaStudio.storyboardReviewUploadedVideo"),
          durationSeconds: videoMetadata.durationSeconds,
          aspectRatio: videoMetadata.aspectRatio,
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
  }, [persistDraftUpdate, t]);

  const addImportedAudioToStoryboard = useCallback((input: {
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
    setAndSaveDraft((current) => {
      if (current.companionAudio.length >= 2) {
        toast.error(t("mediaStudio.storyboardReviewAudioLimit"));
        return current;
      }
      const targetDurationSeconds = buildStoryboardVideoProject(
        storyboardDraftToReviewTasks(current)
          .filter((task) => current.selectedTaskIds.includes(task.id) && task.status === "completed" && task.url)
          .map((task) => ({ id: task.id, prompt: task.prompt, url: task.url! })),
      )?.settings.duration;
      const audio = createImportedAudioTrack({
        idPrefix: input.idPrefix,
        title: input.title,
        url,
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
  }, [activeDraft?.companionAudio.length, emitStoryboardReviewClientDebug, setAndSaveDraft, t]);

  const addLibraryItemToStoryboard = useCallback((item: LibrarySearchResultItem) => {
    setSelectedLibraryItemId(item.item_id);
    const sourceUrl = extractStoryboardMediaUrl(item, mediaPickerKind);
    if (!sourceUrl) {
      toast.error(t("mediaStudio.storyboardReviewNoReusableUrl"));
      return;
    }
    if (mediaPickerKind === "audio") {
      addImportedAudioToStoryboard({
        idPrefix: `library-audio-${item.item_id}`,
        title: item.title,
        url: sourceUrl,
        model: item.model_name,
        durationSeconds: extractDurationSeconds(item),
      });
      return;
    }
    addImportedVideoToStoryboard({
      idPrefix: `library-video-${item.item_id}`,
      title: item.title,
      url: sourceUrl,
      model: item.model_name,
    });
  }, [addImportedAudioToStoryboard, addImportedVideoToStoryboard, mediaPickerKind]);

  const addHistoryTaskToStoryboard = useCallback((task: any) => {
    const resultUrl = extractStoryboardMediaUrl(task, mediaPickerKind);
    if (!resultUrl) {
      toast.error(t("mediaStudio.storyboardReviewNoReusableUrl"));
      return;
    }
    if (mediaPickerKind === "audio") {
      addImportedAudioToStoryboard({
        idPrefix: `history-audio-${task.id || task.taskId || "item"}`,
        title: task.prompt || t("mediaStudio.storyboardReviewMediaHistoryAudio"),
        url: resultUrl,
        model: task.model,
        durationSeconds: extractDurationSeconds(task),
      });
      return;
    }
    addImportedVideoToStoryboard({
      idPrefix: `history-video-${task.id || task.taskId || "item"}`,
      title: task.prompt || t("mediaStudio.storyboardReviewMediaHistoryClip"),
      url: resultUrl,
      model: task.model,
      durationSeconds: extractDurationSeconds(task),
    });
  }, [addImportedAudioToStoryboard, addImportedVideoToStoryboard, mediaPickerKind, t]);

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

  const buildSelectedProject = useCallback(() => {
    return selectedRenderProject;
  }, [selectedRenderProject]);

  const createProject = useCallback(async () => {
    const project = buildSelectedProject();
    if (!project || !draft) {
      toast.error(t("mediaStudio.storyboardReviewSelectCompletedProject"));
      return;
    }
    setIsCreatingProject(true);
    setAndSaveDraft((current) => ({ ...current, compoundStatus: t("mediaStudio.storyboardReviewSavingProject") }));
    try {
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
  }, [buildSelectedProject, draft, saveProjectMutation, setAndSaveDraft]);

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
      const voiceoverFullScript = targetVoiceContext?.voiceoverFullScript
        || orderedDraftTasks
          .map((task) => getStoryboardPlannerVoiceContext(task).voiceoverScript)
          .filter(Boolean)
          .join("\n");
      const result = await planStoryboardVideoPromptsMutation.mutateAsync({
        productMetadata: productMetadata as Record<string, unknown> | null,
        includeVoiceover: options.includeVoiceover,
        speechMode: options.speechMode,
        speechLanguage: options.speechLanguage,
        includeSound: options.includeSound,
        tone: options.tone,
        language: options.language,
        conceptDetails: draft.conceptDetails ?? undefined,
        storyboardGuide: draft.storyboardGuide ?? undefined,
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
            conceptDetails: draft.conceptDetails ?? undefined,
            storyboardGuide: draft.storyboardGuide ?? undefined,
            aspectRatio: task.generationAspectRatio,
            durationSeconds: task.durationSeconds,
            model: task.generationModelId || task.model,
            ...(targetTaskId ? {
              voiceoverFullScript: voiceoverFullScript || undefined,
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
            conceptDetails: draft.conceptDetails ?? null,
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
    const project = buildSelectedProject();
    if (!project || !draft) {
      toast.error(t("mediaStudio.storyboardReviewSelectCompletedRender"));
      return;
    }
    setIsCompounding(true);
    setAndSaveDraft((current) => ({ ...current, compoundStatus: t("mediaStudio.storyboardReviewStartingRender") }));
    try {
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
  }, [buildSelectedProject, draft, saveProjectMutation, setAndSaveDraft, t]);

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
      <header className="border-b bg-white px-3 py-3 sm:px-6 sm:py-4 xl:shrink-0">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/dashboard")}
              className="w-fit shrink-0 text-slate-600 hover:text-slate-950"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              {t("mediaStudio.storyboardReviewBackToDashboard")}
            </Button>
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold text-slate-950 sm:text-xl">
                <Film className="h-5 w-5 text-cyan-600" />
                {t("mediaStudio.storyboardReview")}
              </div>
              {activeDraft ? (
                <div className="mt-2 flex max-w-3xl flex-wrap items-center gap-2">
                  {isEditingProjectName ? (
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
                        className="h-9 w-full max-w-md bg-white sm:w-96"
                        autoFocus
                      />
                      <Button type="button" size="sm" onClick={saveProjectName} disabled={!projectNameDraft.trim()}>
                        <Check className="mr-2 h-4 w-4" />
                        {locale === "th" ? "บันทึกชื่อ" : "Save name"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setProjectNameDraft(currentProjectName);
                          setIsEditingProjectName(false);
                        }}
                      >
                        <X className="mr-2 h-4 w-4" />
                        {t("common.cancel")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <h1 className="max-w-xl truncate text-base font-semibold text-slate-900 sm:text-lg">
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
                  )}
                </div>
              ) : null}
              <p className="mt-1 text-sm text-slate-600">
                {t("mediaStudio.storyboardReviewPageDescription")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LocaleToggle className="hidden sm:inline-flex" />
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setLocation("/media-studio")}>
              {t("mediaStudio.title")}
            </Button>
          </div>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-2 sm:gap-4 sm:p-4 xl:grid-cols-[minmax(0,1fr)_34rem] xl:overflow-hidden 2xl:grid-cols-[minmax(0,1fr)_38rem]">
        <section className="min-h-[70dvh] overflow-hidden rounded-lg border bg-white sm:min-h-[calc(100dvh-9rem)] xl:h-full xl:min-h-0">
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
              conceptDetails={activeDraft.conceptDetails ?? ""}
              onConceptDetailsChange={updateConceptDetails}
              storyboardGuide={activeDraft.storyboardGuide ?? ""}
              onStoryboardGuideChange={updateStoryboardGuide}
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
          <div className="max-h-none shrink-0 space-y-3 overflow-y-visible border-b p-2.5 sm:p-3 xl:max-h-[62%] xl:overflow-y-auto xl:overscroll-contain">
            <div className="rounded-xl border bg-slate-50/70 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="text-sm font-semibold text-slate-950">{t("mediaStudio.storyboardReviewAddMedia")}</h2>
                <p className="text-xs text-slate-500">{t("mediaStudio.storyboardReviewAddMediaDesc")}</p>
              </div>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={mediaPickerKind === "video" ? "default" : "outline"}
                  onClick={() => {
                    setMediaPickerKind("video");
                    setSelectedLibraryItemId(null);
                  }}
                >
                  {t("mediaStudio.storyboardReviewVideoClips")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mediaPickerKind === "audio" ? "default" : "outline"}
                  onClick={() => {
                    setMediaPickerKind("audio");
                    setAudioSourceTab("library");
                    setSelectedLibraryItemId(null);
                  }}
                >
                  {t("mediaStudio.storyboardReviewAudioTrack")}
                </Button>
              </div>
              {mediaPickerKind === "audio" ? (
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
              {(mediaPickerKind !== "audio" || audioSourceTab === "library") ? (
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
              {(mediaPickerKind !== "audio" || audioSourceTab === "history") ? (
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
