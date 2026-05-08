import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { ChevronLeft, ExternalLink, Film, Layers, Loader2, Music2, Trash2, Video } from "lucide-react";
import { sanitizeProjectName } from "@smartspec/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LocaleToggle } from "@/components/LocaleToggle";
import { StoryboardBatchReviewPanel } from "@/components/media/StoryboardBatchReviewDialog";
import { RenderProgressDialog } from "@/components/videoeditor/RenderProgressDialog";
import LibrarySearchPanel from "@/components/media/LibrarySearchPanel";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { trpc } from "@/lib/trpc";
import { buildMediaStudioCommonPayload } from "@/lib/mediaStudioPayload";
import { buildStoryboardVideoProject, type StoryboardCompanionAudioCandidate } from "@/lib/storyboardVideoProject";
import type { LibrarySearchResultItem } from "@/lib/libraryUi";
import {
  clearStoryboardReviewDraft,
  getStoryboardReviewName,
  normalizeStoryboardReviewDraft,
  readStoryboardReviewDraft,
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

function prepareVeoPromptForGenerationType(promptText: string, generationType: unknown): string {
  if (String(generationType ?? "").trim() !== "REFERENCE_2_VIDEO") return promptText;
  if (/Reference image mode:/i.test(promptText) || /not .*start frame/i.test(promptText)) return promptText;
  return `${VEO_REFERENCE_IMAGE_ROLE_INSTRUCTION}\n${promptText}`.trim();
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

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
      for (const key of ["url", "video_url", "image_url", "audio_url", "videoUrl", "imageUrl", "audioUrl", "result_url"]) {
        const candidate = value[key];
        if (typeof candidate === "string" && candidate.startsWith("http")) return candidate;
      }
    }
    return null;
  };

  if (typeof task?.resultUrl === "string" && task.resultUrl.startsWith("http")) return task.resultUrl;
  for (const candidate of [task?.result_url, task?.url, task?.audio_url, task?.video_url, task?.image_url, task?.data, task?.data?.[0]]) {
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
  for (const candidate of [
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
  ]) {
    const found = fromValue(candidate);
    if (found) return found;
  }
  return null;
}

function updateDraftTask(draft: StoryboardReviewDraft, taskId: string, updates: Partial<StoryboardGenerationTask>): StoryboardReviewDraft {
  return {
    ...draft,
    updatedAt: Date.now(),
    tasks: draft.tasks.map((task) => task.id === taskId ? { ...task, ...updates, updatedAt: Date.now() } : task),
  };
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
    createdAt: now,
    updatedAt: now,
    url: input.url,
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
    url: input.url,
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

  const { data: review, isLoading: isReviewLoading } = trpc.videoEditorProjects.getStoryboardReview.useQuery(
    { id: reviewId ?? 0 },
    { enabled: typeof reviewId === "number" && Number.isFinite(reviewId) },
  );
  const { data: reviewProjectsData, refetch: refetchReviews } = trpc.videoEditorProjects.listStoryboardReviews.useQuery({ limit: 50, offset: 0 });
  const saveReviewMutation = trpc.videoEditorProjects.saveStoryboardReview.useMutation();
  const deleteReviewMutation = trpc.videoEditorProjects.deleteStoryboardReview.useMutation();
  const saveProjectMutation = trpc.videoEditorProjects.save.useMutation();
  const generateVideoAsyncMutation = trpc.media.generateVideoAsync.useMutation();
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
      setDraft(null);
      setRenderJobId(null);
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
    setDraft(nextDraft ? { ...nextDraft, reviewId } : null);
    setRenderJobId(nextDraft?.renderJobId ?? null);
  }, [review, reviewId]);

  const activeDraft = reviewId && draft?.reviewId !== reviewId ? null : draft;
  const tasks = useMemo(() => storyboardDraftToReviewTasks(activeDraft), [activeDraft]);
  const selectedTaskIds = activeDraft?.selectedTaskIds ?? [];
  const completedCount = tasks.filter((task) => task.status === "completed" && task.url).length;
  const selectedReviewId = reviewId ?? activeDraft?.reviewId ?? null;
  const librarySearchResults = (librarySearchData?.results ?? []) as LibrarySearchResultItem[];
  const historyMediaTasks = useMemo(
    () => ((mediaHistoryData?.tasks ?? []) as any[]).filter((task) => Boolean(extractTaskResultUrl(task))),
    [mediaHistoryData?.tasks],
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
      setDraft((current) => current ? { ...current, reviewId: result.id } : current);
    }
    void refetchReviews();
  }, [refetchReviews, reviewId, saveReviewMutation]);

  const setAndSaveDraft = useCallback((updater: (current: StoryboardReviewDraft) => StoryboardReviewDraft) => {
    setDraft((current) => {
      if (!current) return current;
      const next = updater(current);
      writeStoryboardReviewDraft(next);
      void saveCurrentDraft(next).catch((error) => {
        toast.error(error instanceof Error ? error.message : t("mediaStudio.storyboardReviewSaveFailed"));
      });
      return next;
    });
  }, [saveCurrentDraft]);

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
    const sourceUrl = item.source_url?.trim();
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
    const resultUrl = extractTaskResultUrl(task);
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

  const selectedRenderProject = useMemo(() => {
    if (!draft) return null;
    const reviewTasks = storyboardDraftToReviewTasks(draft);
    const selected = reviewTasks.filter((task) => draft.selectedTaskIds.includes(task.id) && task.status === "completed" && task.url);
    if (selected.length === 0) return null;
    return buildStoryboardVideoProject(
      selected.map((task) => ({
        id: task.id,
        prompt: task.prompt,
        url: task.url!,
        model: task.model,
        durationSeconds: task.durationSeconds,
        generationModelId: task.generationModelId,
        referenceUrls: task.referenceUrls,
        generationAspectRatio: task.generationAspectRatio,
        generationExtraParams: task.generationExtraParams,
      })),
      {
        projectName: sanitizeProjectName(`Storyboard Edit ${new Date().toLocaleString()}`),
        companionAudio: draft.companionAudio,
        muteVideoClipAudio: draft.companionAudio.length > 0 || reviewTasks.some((task) => /External audio workflow/i.test(task.prompt)),
      },
    );
  }, [draft]);

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
  }, [buildSelectedProject, draft, saveProjectMutation, setAndSaveDraft]);

  const regenerateTask = useCallback(async (taskId: string, prompt: string) => {
    if (!draft) return;
    const task = draft.tasks.find((item) => item.id === taskId);
    if (!task?.storyboardContext) {
      toast.error(t("mediaStudio.storyboardReviewClipContextMissing"));
      return;
    }
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      toast.error(t("mediaStudio.storyboardReviewPromptRequired"));
      return;
    }

    setRegeneratingTaskId(taskId);
    setAndSaveDraft((current) => updateDraftTask(current, taskId, {
      status: "generating",
      prompt: normalizedPrompt,
      error: undefined,
      statusDetail: t("mediaStudio.storyboardReviewRegeneratingClip"),
    }));
    try {
      const context = task.storyboardContext;
      const payload = buildMediaStudioCommonPayload({
        prompt: prepareVeoPromptForGenerationType(normalizedPrompt, context.extraParams?.generationType),
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
      const immediateUrl = extractTaskResultUrl(taskResult as any);
      const pollId = (taskResult as any)?.taskId || (taskResult as any)?.id;
      let completedUrl = immediateUrl;
      if (!completedUrl && pollId) {
        for (let attempt = 0; attempt < 90; attempt += 1) {
          const currentTask = await trpcUtils.media.getTask.fetch({ taskId: pollId });
          const status = String((currentTask as any)?.status || "").toLowerCase();
          if (status === "completed" || status === "failed" || status === "cancelled") {
            if (status !== "completed") throw new Error((currentTask as any)?.errorMessage || t("mediaStudio.storyboardReviewVideoGenerationFailed"));
            completedUrl = extractTaskResultUrl(currentTask as any);
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
    } catch (error) {
      const message = error instanceof Error ? error.message : t("mediaStudio.storyboardReviewRegenerateFailed");
      setAndSaveDraft((current) => updateDraftTask(current, taskId, { status: "error", error: message, statusDetail: message }));
      toast.error(message);
    } finally {
      setRegeneratingTaskId(null);
    }
  }, [draft, generateVideoAsyncMutation, setAndSaveDraft, trpcUtils.media.getTask]);

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
              onMoveTask={moveStoryboardTask}
              onRemoveTask={removeStoryboardTask}
              onAutoCompound={autoCompound}
              onCreateProject={createProject}
              isCompounding={isCompounding}
              isCreatingProject={isCreatingProject}
              regeneratingTaskId={regeneratingTaskId}
              compoundStatus={activeDraft.compoundStatus}
              projectLink={activeDraft.projectLink}
              companionAudio={activeDraft.companionAudio}
              onRemoveAudio={removeStoryboardAudio}
              muteVideoPreviewAudio={activeDraft.companionAudio.length > 0}
              renderDurationSeconds={selectedRenderProject?.settings.duration ?? null}
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

        <aside className="flex min-h-[20rem] flex-col overflow-hidden rounded-lg border bg-white xl:h-full xl:min-h-0">
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
                        const resultUrl = extractTaskResultUrl(task);
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
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-2 p-3">
              {(reviewProjectsData?.reviews ?? []).length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-slate-500">{t("mediaStudio.storyboardReviewProjectsEmpty")}</div>
              ) : (
                (reviewProjectsData?.reviews ?? []).map((item: any) => (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      item.id === selectedReviewId ? "border-cyan-300 bg-cyan-50" : "bg-white hover:bg-slate-50",
                    )}
                  >
                    <div className="flex gap-3">
                      <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md border bg-slate-100">
                        {item.thumbnailUrl ? (
                          <video src={item.thumbnailUrl} className="h-full w-full object-cover" muted playsInline />
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
                ))
              )}
            </div>
          </ScrollArea>
        </aside>
      </main>

      {renderJobId ? (
        <RenderProgressDialog
          jobId={renderJobId}
          onComplete={(outputPath) => {
            setRenderJobId(null);
            setAndSaveDraft((current) => ({
              ...current,
              renderJobId: null,
              compoundStatus: t("mediaStudio.storyboardReviewRenderCompleteStatus", { outputPath }),
            }));
            toast.success(t("mediaStudio.storyboardReviewRenderComplete"));
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
