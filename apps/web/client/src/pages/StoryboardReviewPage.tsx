import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { ChevronLeft, ExternalLink, Film, Layers, Loader2, Music2, Trash2, Video } from "lucide-react";
import { sanitizeProjectName } from "@smartspec/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LocaleToggle } from "@/components/LocaleToggle";
import { StoryboardBatchReviewPanel } from "@/components/media/StoryboardBatchReviewDialog";
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
  getStoryboardReviewName,
  mergeFresherStoryboardReviewTasks,
  normalizeStoryboardReviewDraft,
  readStoryboardReviewDraft,
  replaceStoryboardVideoSlot,
  replaceStoryboardReferenceFrame,
  storyboardDraftToReviewTasks,
  writeStoryboardReviewDraft,
  type StoryboardGenerationTask,
  type StoryboardReviewDraft,
} from "@/lib/storyboardReviewWorkspace";
import { cn } from "@/lib/utils";
import { videoEditorRenderService } from "@/services/videoEditorService";

const VEO_REFERENCE_IMAGE_ROLE_INSTRUCTION = [
  "Reference image mode: use the attached image(s) only as material, identity, style, product, object, or scene references.",
  "Do not treat any attached image as a start frame, end frame, frozen opening frame, or exact first/last frame unless generationType is FIRST_AND_LAST_FRAMES_2_VIDEO.",
].join(" ");

type StoryboardMediaPickerKind = "video" | "audio";
type LibraryRecentDaysFilter = "all" | 1 | 3 | 7 | 15 | 30;

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

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const STORYBOARD_GENERATION_POLL_ATTEMPTS = 90;

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
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [libraryRecentDays, setLibraryRecentDays] = useState<LibraryRecentDaysFilter>(7);
  const [selectedLibraryItemId, setSelectedLibraryItemId] = useState<number | null>(null);
  const [replacingReferenceFrameKey, setReplacingReferenceFrameKey] = useState<string | null>(null);
  const [uploadingVideoSlotKey, setUploadingVideoSlotKey] = useState<string | null>(null);
  const [isCancellingGeneration, setIsCancellingGeneration] = useState(false);
  const [renderAspectRatioMode, setRenderAspectRatioMode] = useState<StoryboardRenderAspectRatioMode>("auto");
  const draftRef = useRef<StoryboardReviewDraft | null>(draft);
  const lastLocalResyncAtRef = useRef(0);
  const generationCancelRequestedRef = useRef(false);
  const activeGenerationTaskIdRef = useRef<string | null>(null);

  const { data: review, isLoading: isReviewLoading } = trpc.videoEditorProjects.getStoryboardReview.useQuery(
    { id: reviewId ?? 0 },
    { enabled: typeof reviewId === "number" && Number.isFinite(reviewId) },
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
  const {
    data: librarySearchData,
    isLoading: isLibrarySearchLoading,
    error: librarySearchError,
  } = trpc.library.search.useQuery(
    {
      query: librarySearchQuery.trim() || undefined,
      limit: 20,
      filters: {
        ...(libraryRecentDays === "all" ? {} : { recentDays: libraryRecentDays }),
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
      setDraft(matchingLocalDraft);
      setRenderJobId(matchingLocalDraft?.renderJobId ?? null);
      setRegeneratingTaskId(null);
      return;
    }

    const localDraft = readStoryboardReviewDraft();
    setDraft(localDraft);
    setRenderJobId(localDraft?.renderJobId ?? null);
    setRegeneratingTaskId(null);
  }, [reviewId]);

  useEffect(() => {
    const reviewRecord = review as any;
    if (!reviewId || !reviewRecord || Number(reviewRecord.id) !== reviewId) return;

    const nextDraft = normalizeStoryboardReviewDraft(reviewRecord.reviewData);
    const rawIncoming = nextDraft ? { ...nextDraft, reviewId } : null;
    const current = draftRef.current;
    const incoming = mergeFresherStoryboardReviewTasks(current, rawIncoming);
    if (current && current.reviewId === reviewId && isDraftNewerThan(current, incoming)) {
      const mergedCurrent = mergeFresherStoryboardReviewTasks(incoming, current);
      draftRef.current = mergedCurrent;
      writeStoryboardReviewDraft(mergedCurrent);
      setDraft(mergedCurrent);
      setRenderJobId(mergedCurrent.renderJobId ?? null);
      return;
    }
    if (incoming) {
      draftRef.current = incoming;
      writeStoryboardReviewDraft(incoming);
    }
    setDraft(incoming);
    setRenderJobId(incoming?.renderJobId ?? null);
  }, [review, reviewId]);

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

  const saveCurrentDraft = useCallback(async (nextDraft: StoryboardReviewDraft) => {
    if (!nextDraft.reviewId && !reviewId) return;
    const id = nextDraft.reviewId ?? reviewId ?? undefined;
    const completedClipCount = nextDraft.tasks.filter((task) => task.status === "completed" && task.url).length;
    const result = await saveReviewMutation.mutateAsync({
      id,
      name: getStoryboardReviewName(nextDraft),
      reviewData: nextDraft,
      clipCount: nextDraft.tasks.length,
      completedClipCount,
      thumbnailUrl: nextDraft.tasks.find((task) => task.url)?.url ?? null,
    });
    if (!nextDraft.reviewId) {
      const savedDraft = { ...nextDraft, reviewId: result.id };
      draftRef.current = savedDraft;
      writeStoryboardReviewDraft(savedDraft);
      setDraft(savedDraft);
    }
    void trpcUtils.videoEditorProjects.getStoryboardReview.invalidate({ id: result.id });
    void refetchReviews();
  }, [refetchReviews, reviewId, saveReviewMutation, trpcUtils]);

  const persistDraftUpdate = useCallback(async (
    updater: (current: StoryboardReviewDraft) => StoryboardReviewDraft,
  ): Promise<StoryboardReviewDraft | null> => {
    const current = draftRef.current;
    if (!current) return null;
    if (reviewId && current.reviewId !== reviewId) return null;

    const next = ensureDraftNewerThan(updater(current), current);
    draftRef.current = next;
    writeStoryboardReviewDraft(next);
    setDraft(next);
    await saveCurrentDraft(next);
    return next;
  }, [reviewId, saveCurrentDraft]);

  const setAndSaveDraft = useCallback((updater: (current: StoryboardReviewDraft) => StoryboardReviewDraft) => {
    void persistDraftUpdate(updater).catch((error) => {
      toast.error(error instanceof Error ? error.message : t("mediaStudio.storyboardReviewSaveFailed"));
    });
  }, [persistDraftUpdate, t]);

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

  const uploadReferenceFrameFiles = useCallback(async (taskId: string, frameIndex: 0 | 1, files: FileList): Promise<string[]> => {
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
    setAndSaveDraft((current) => ({
      ...current,
      updatedAt: Date.now(),
      companionAudio: current.companionAudio.filter((audio) => audio.id !== audioId),
    }));
  }, [setAndSaveDraft]);

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

  const uploadVideoToStoryboardSlot = useCallback(async (taskId: string, mode: "replace" | "insert-after") => {
    const file = await new Promise<File | null>((resolve) => {
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
      return {
        ...current,
        updatedAt: Date.now(),
        companionAudio: [...current.companionAudio, audio],
      };
    });
    toast.success(t("mediaStudio.storyboardReviewAudioAdded"));
  }, [activeDraft?.companionAudio.length, setAndSaveDraft, t]);

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
      const generationType = String(context.extraParams?.generationType ?? "").trim();
      const startFrameUrl = context.referenceImages?.[0]?.url?.trim();
      const endFrameUrl = context.referenceImages?.[1]?.url?.trim();
      const generationPrompt = generationType === "FIRST_AND_LAST_FRAMES_2_VIDEO" && startFrameUrl && endFrameUrl
        ? stripPromptCodeFence((await generateStoryboardVideoPromptMutation.mutateAsync({
          currentPrompt: normalizedPrompt,
          startFrameUrl,
          endFrameUrl,
          aspectRatio: context.aspectRatio,
          durationSeconds: context.duration ?? task.durationSeconds,
          model: context.model,
        })).prompt)
        : normalizedPrompt;
      if (generationPrompt !== normalizedPrompt) {
        setAndSaveDraft((current) => updateDraftTask(current, taskId, {
          prompt: generationPrompt,
          statusDetail: t("mediaStudio.storyboardReviewRegeneratingClip"),
        }));
      }
      const payload = buildMediaStudioCommonPayload({
        prompt: prepareVeoPromptForGenerationType(generationPrompt, context.extraParams?.generationType),
        model: context.model,
        aspectRatio: context.aspectRatio,
        referenceImages: context.referenceImages as any,
        referenceVideos: context.referenceVideos as any,
        extraParams: context.extraParams,
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

  const reviewNotFound = !!reviewId && !isReviewLoading && review === null;
  const isLoading = !!reviewId && !reviewNotFound && (isReviewLoading || !activeDraft);

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
              onStartGenerationBatch={startStoryboardGenerationBatch}
              onCancelGeneration={cancelStoryboardGeneration}
              onReplaceReferenceFrame={replaceReferenceFrame}
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
                    setSelectedLibraryItemId(null);
                  }}
                >
                  {t("mediaStudio.storyboardReviewAudioTrack")}
                </Button>
              </div>
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
                itemTypeFilter={mediaPickerKind}
                addToReferenceLabel={mediaPickerKind === "audio" ? t("mediaStudio.storyboardReviewAddAudio") : t("mediaStudio.storyboardReviewAddClip")}
                canAddToReferenceItem={(item) => item.item_type.toLowerCase() === mediaPickerKind && Boolean(item.source_url)}
                onAddToReference={addLibraryItemToStoryboard}
                onSelect={addLibraryItemToStoryboard}
              />
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
                        return (
                          <div key={task.id || task.taskId} className="rounded-md border bg-white p-2">
                            <div className="flex gap-2">
                              <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded border bg-slate-100">
                                {mediaPickerKind === "video" && resultUrl ? (
                                  <video src={resultUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                                ) : mediaPickerKind === "audio" ? (
                                  <Music2 className="h-4 w-4 text-slate-400" />
                                ) : (
                                  <Film className="h-4 w-4 text-slate-400" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-xs font-medium text-slate-900">{task.prompt || task.model || t("mediaStudio.storyboardReviewMediaHistoryItem")}</div>
                                <div className="truncate text-[11px] text-slate-500">{task.model || task.mediaType}</div>
                              </div>
                            </div>
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
          </div>
          <div className="min-h-0 flex-1 basis-0 overflow-y-auto overscroll-contain pr-1">
            <div className="space-y-2 p-3 pr-2">
              {(reviewProjectsData?.reviews ?? []).length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-slate-500">{t("mediaStudio.storyboardReviewProjectsEmpty")}</div>
              ) : (
                (reviewProjectsData?.reviews ?? []).map((item: any) => {
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
