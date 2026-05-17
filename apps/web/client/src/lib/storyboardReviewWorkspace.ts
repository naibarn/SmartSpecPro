import type { StoryboardCompanionAudioCandidate } from "@/lib/storyboardVideoProject";
import type { StoryboardReviewTask } from "@/components/media/StoryboardBatchReviewDialog";
import { normalizeStoryboardMediaUrl } from "@/lib/storyboardReviewMedia";

export interface StoryboardReferenceImage {
  url: string;
  name?: string;
}

export interface StoryboardReferenceVideo {
  url?: string;
}

export interface StoryboardVideoGenerationContext {
  aspectRatio: string;
  duration?: number;
  model?: string;
  referenceImages: StoryboardReferenceImage[];
  referenceVideos: StoryboardReferenceVideo[];
  extraParams?: Record<string, any>;
  apiConfig?: Record<string, string>;
  resolution?: string;
  referenceVideoUrl?: string;
  useReferenceVideoUrlFallback?: boolean;
}

export interface StoryboardGenerationTask {
  id: string;
  index: number;
  status: "queued" | "generating" | "completed" | "error";
  type: string;
  prompt: string;
  model: string;
  durationSeconds?: number;
  createdAt: number;
  updatedAt: number;
  url?: string;
  error?: string;
  backendTaskId?: string;
  providerTaskId?: string;
  statusDetail?: string;
  source?: "generated" | "imported";
  aspectRatio?: string;
  storyboardContext?: StoryboardVideoGenerationContext;
}

export interface StoryboardReviewDraft {
  version: 1;
  reviewId?: number | null;
  updatedAt: number;
  taskIds: string[];
  selectedTaskIds: string[];
  tasks: StoryboardGenerationTask[];
  companionAudio: StoryboardCompanionAudioCandidate[];
  compoundStatus: string | null;
  projectLink: string | null;
  renderJobId: string | null;
}

export interface FirstLastFrameStoryboardImage {
  url: string;
  name?: string;
}

export interface ReplaceStoryboardReferenceFrameInput {
  taskId: string;
  frameIndex: 0 | 1;
  image: StoryboardReferenceImage;
  now?: number;
  statusDetail?: string;
}

export interface ReplaceStoryboardVideoSlotInput {
  taskId: string;
  mode: "replace" | "insert-after";
  importedTask: StoryboardGenerationTask;
  now?: number;
}

export interface BuildFirstLastFrameStoryboardTasksOptions {
  model: string;
  aspectRatio: string;
  duration?: number;
  extraParams?: Record<string, any>;
  apiConfig?: Record<string, string>;
  resolution?: string;
  now?: number;
  idPrefix?: string;
  statusDetail?: string;
}

export const STORYBOARD_REVIEW_DRAFT_STORAGE_KEY = "smartspec_media_studio_storyboard_review_draft_v1";
const STORYBOARD_REVIEW_DRAFT_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export function normalizeStoryboardReviewDraft(parsed: Partial<StoryboardReviewDraft> | null | undefined): StoryboardReviewDraft | null {
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.taskIds) || !Array.isArray(parsed.tasks)) {
    return null;
  }

  const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now();
  return {
    version: 1,
    reviewId: typeof parsed.reviewId === "number" ? parsed.reviewId : null,
    updatedAt,
    taskIds: parsed.taskIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0),
    selectedTaskIds: Array.isArray(parsed.selectedTaskIds)
      ? parsed.selectedTaskIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [],
    tasks: parsed.tasks as StoryboardGenerationTask[],
    companionAudio: Array.isArray(parsed.companionAudio)
      ? (parsed.companionAudio as StoryboardCompanionAudioCandidate[]).map((audio) => ({
        ...audio,
        url: typeof audio.url === "string" ? normalizeStoryboardMediaUrl(audio.url) : audio.url,
      }))
      : [],
    compoundStatus: typeof parsed.compoundStatus === "string" ? parsed.compoundStatus : null,
    projectLink: typeof parsed.projectLink === "string" ? parsed.projectLink : null,
    renderJobId: typeof parsed.renderJobId === "string" ? parsed.renderJobId : null,
  };
}

export function readStoryboardReviewDraft(): StoryboardReviewDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORYBOARD_REVIEW_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = normalizeStoryboardReviewDraft(JSON.parse(raw) as Partial<StoryboardReviewDraft>);
    if (!parsed) return null;
    if (Date.now() - parsed.updatedAt > STORYBOARD_REVIEW_DRAFT_TTL_MS) {
      window.localStorage.removeItem(STORYBOARD_REVIEW_DRAFT_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoryboardReviewDraft(draft: StoryboardReviewDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORYBOARD_REVIEW_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // The in-memory review page can continue even when local storage is unavailable.
  }
}

export function clearStoryboardReviewDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORYBOARD_REVIEW_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function getTaskUpdatedAt(task: unknown): number {
  if (!task || typeof task !== "object") return 0;
  const updatedAt = (task as { updatedAt?: unknown }).updatedAt;
  return typeof updatedAt === "number" && Number.isFinite(updatedAt) ? updatedAt : 0;
}

function getTaskUrl(task: unknown): string {
  if (!task || typeof task !== "object") return "";
  const url = (task as { url?: unknown }).url;
  return typeof url === "string" ? url : "";
}

export function mergeFresherStoryboardReviewTasks<T extends Partial<StoryboardReviewDraft> | null | undefined>(
  existingDraft: Partial<StoryboardReviewDraft> | null | undefined,
  incomingDraft: T,
): T {
  if (!existingDraft || !incomingDraft) return incomingDraft;
  if (!Array.isArray(existingDraft.tasks) || !Array.isArray(incomingDraft.tasks)) return incomingDraft;

  const existingTaskById = new Map(existingDraft.tasks.map((task) => [task.id, task]));
  let changed = false;
  const mergedTasks = incomingDraft.tasks.map((incomingTask) => {
    const existingTask = existingTaskById.get(incomingTask.id);
    if (!existingTask) return incomingTask;
    if (
      getTaskUpdatedAt(existingTask) > getTaskUpdatedAt(incomingTask)
      && getTaskUrl(existingTask) !== getTaskUrl(incomingTask)
    ) {
      changed = true;
      return existingTask;
    }
    return incomingTask;
  });

  return changed
    ? { ...incomingDraft, tasks: mergedTasks } as T
    : incomingDraft;
}

export function getStoryboardReviewName(draft: StoryboardReviewDraft): string {
  const firstPrompt = draft.tasks[0]?.prompt?.trim();
  const base = firstPrompt ? firstPrompt.slice(0, 52) : "Storyboard Review";
  return `${base}${firstPrompt && firstPrompt.length > 52 ? "..." : ""}`;
}

function normalizeDraftTaskOrder(draft: StoryboardReviewDraft, orderedTaskIds: string[]): StoryboardReviewDraft {
  const order = new Map(orderedTaskIds.map((id, index) => [id, index]));
  const taskById = new Map(draft.tasks.map((task) => [task.id, task]));
  const orderedTasks = orderedTaskIds
    .map((id) => taskById.get(id))
    .filter((task): task is StoryboardGenerationTask => Boolean(task))
    .map((task, index) => ({ ...task, index, updatedAt: draft.updatedAt }));
  const orphanTasks = draft.tasks.filter((task) => !order.has(task.id));
  return {
    ...draft,
    taskIds: orderedTaskIds,
    selectedTaskIds: draft.selectedTaskIds.filter((id) => order.has(id)),
    tasks: [...orderedTasks, ...orphanTasks],
  };
}

export function buildFirstLastFrameStoryboardTasks(
  images: FirstLastFrameStoryboardImage[],
  options: BuildFirstLastFrameStoryboardTasksOptions,
): StoryboardGenerationTask[] {
  const usableImages = images.filter((image) => image.url.trim().length > 0);
  if (usableImages.length < 2 || !options.model.trim()) return [];

  const now = options.now ?? Date.now();
  const idPrefix = options.idPrefix ?? "split-storyboard";
  const aspectRatio = options.aspectRatio.trim() || "auto";
  const extraParams = {
    ...(options.extraParams ?? {}),
    generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
  };

  return usableImages.slice(0, -1).map((startImage, index) => {
    const endImage = usableImages[index + 1]!;
    const taskIndex = index;
    return {
      id: `${idPrefix}-${now}-${taskIndex + 1}`,
      index: taskIndex,
      status: "queued",
      type: "video",
      prompt: [
        `Shot ${taskIndex + 1}: use @Image1 as the exact start frame and @Image2 as the exact end frame.`,
        "Create a smooth cinematic transition between the two frames while preserving the same subject, product identity, composition intent, colors, and visual continuity.",
        "Do not introduce unrelated products, extra text, labels, UI, logos, or new characters.",
      ].join(" "),
      model: options.model,
      durationSeconds: options.duration,
      createdAt: now,
      updatedAt: now,
      statusDetail: options.statusDetail ?? "Queued for storyboard review. Confirm and regenerate when ready.",
      storyboardContext: {
        aspectRatio,
        duration: options.duration,
        model: options.model,
        referenceImages: [
          { url: startImage.url, name: startImage.name ?? `Frame ${taskIndex + 1}` },
          { url: endImage.url, name: endImage.name ?? `Frame ${taskIndex + 2}` },
        ],
        referenceVideos: [],
        extraParams,
        apiConfig: options.apiConfig,
        resolution: options.resolution,
      },
    };
  });
}

function normalizeReferenceImageUrl(url: unknown): string {
  return String(url || "").trim();
}

export function replaceStoryboardReferenceFrame(
  draft: StoryboardReviewDraft,
  input: ReplaceStoryboardReferenceFrameInput,
): StoryboardReviewDraft {
  const replacementUrl = normalizeReferenceImageUrl(input.image.url);
  if (!replacementUrl) return draft;

  const taskOrderIndex = draft.taskIds.indexOf(input.taskId);
  const targetTask = draft.tasks.find((task) => task.id === input.taskId);
  const oldUrl = normalizeReferenceImageUrl(
    targetTask?.storyboardContext?.referenceImages?.[input.frameIndex]?.url,
  );
  if (!targetTask?.storyboardContext || taskOrderIndex < 0) {
    return draft;
  }

  const now = input.now ?? Date.now();
  const affectedFrames = new Map<string, Set<0 | 1>>();
  affectedFrames.set(input.taskId, new Set([input.frameIndex]));

  if (oldUrl) {
    if (input.frameIndex === 1) {
      const nextTaskId = draft.taskIds[taskOrderIndex + 1];
      const nextTask = draft.tasks.find((task) => task.id === nextTaskId);
      const nextStartUrl = normalizeReferenceImageUrl(nextTask?.storyboardContext?.referenceImages?.[0]?.url);
      if (nextTask?.storyboardContext && nextStartUrl === oldUrl) {
        affectedFrames.set(nextTask.id, new Set([0]));
      }
    } else {
      const previousTaskId = draft.taskIds[taskOrderIndex - 1];
      const previousTask = draft.tasks.find((task) => task.id === previousTaskId);
      const previousEndUrl = normalizeReferenceImageUrl(previousTask?.storyboardContext?.referenceImages?.[1]?.url);
      if (previousTask?.storyboardContext && previousEndUrl === oldUrl) {
        affectedFrames.set(previousTask.id, new Set([1]));
      }
    }
  }

  return {
    ...draft,
    updatedAt: now,
    projectLink: null,
    renderJobId: null,
    compoundStatus: null,
    tasks: draft.tasks.map((task) => {
      const frames = affectedFrames.get(task.id);
      if (!frames || !task.storyboardContext) return task;
      const referenceImages = [...task.storyboardContext.referenceImages];
      for (const frame of frames) {
        referenceImages[frame] = {
          url: replacementUrl,
          name: input.image.name ?? referenceImages[frame]?.name ?? (frame === 0 ? "Start frame" : "End frame"),
        };
      }
      return {
        ...task,
        status: "queued",
        url: undefined,
        error: undefined,
        backendTaskId: undefined,
        providerTaskId: undefined,
        statusDetail: input.statusDetail ?? task.statusDetail,
        updatedAt: now,
        storyboardContext: {
          ...task.storyboardContext,
          referenceImages,
        },
      };
    }),
  };
}

export function replaceStoryboardVideoSlot(
  draft: StoryboardReviewDraft,
  input: ReplaceStoryboardVideoSlotInput,
): StoryboardReviewDraft {
  const slotIndex = draft.taskIds.indexOf(input.taskId);
  if (slotIndex < 0) return draft;
  const now = input.now ?? Date.now();
  const currentTask = draft.tasks.find((task) => task.id === input.taskId);

  if (input.mode === "replace") {
    const replacementTask: StoryboardGenerationTask = {
      ...input.importedTask,
      id: input.taskId,
      index: currentTask?.index ?? slotIndex,
      createdAt: currentTask?.createdAt ?? input.importedTask.createdAt,
      updatedAt: now,
    };
    return normalizeDraftTaskOrder(
      {
        ...draft,
        updatedAt: now,
        projectLink: null,
        renderJobId: null,
        compoundStatus: null,
        selectedTaskIds: draft.selectedTaskIds.includes(input.taskId)
          ? draft.selectedTaskIds
          : [...draft.selectedTaskIds, input.taskId],
        tasks: draft.tasks.map((task) => task.id === input.taskId ? replacementTask : task),
      },
      draft.taskIds,
    );
  }

  const nextTaskIds = [
    ...draft.taskIds.slice(0, slotIndex + 1),
    input.importedTask.id,
    ...draft.taskIds.slice(slotIndex + 1),
  ];
  return normalizeDraftTaskOrder(
    {
      ...draft,
      updatedAt: now,
      projectLink: null,
      renderJobId: null,
      compoundStatus: null,
      selectedTaskIds: [...draft.selectedTaskIds, input.importedTask.id],
      tasks: [...draft.tasks, input.importedTask],
    },
    nextTaskIds,
  );
}

export function storyboardDraftToReviewTasks(draft: StoryboardReviewDraft | null): StoryboardReviewTask[] {
  if (!draft) return [];
  return draft.tasks
    .filter((task) => draft.taskIds.includes(task.id))
    .map((task) => {
      const context = task.storyboardContext;
      const extraParams = context
        ? {
            ...(context.extraParams ?? {}),
            ...(context.resolution ? { resolution: context.resolution } : {}),
          }
        : {};
      return {
        id: task.id,
        index: task.index,
        prompt: task.prompt,
        url: task.url,
        model: task.model,
        durationSeconds: task.durationSeconds,
        generationModelId: context?.model || task.model,
        referenceUrls: context?.referenceImages?.map((image) => image.url).filter(Boolean),
        generationAspectRatio: context?.aspectRatio ?? task.aspectRatio,
        generationExtraParams: Object.keys(extraParams).length > 0 ? extraParams : undefined,
        canRegenerate: Boolean(context),
        isImported: task.source === "imported" || !context,
        status: task.status,
        error: task.error,
      };
    });
}
