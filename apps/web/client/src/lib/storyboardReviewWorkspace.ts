import type { StoryboardCompanionAudioCandidate } from "@/lib/storyboardVideoProject";
import type { StoryboardReviewTask } from "@/components/media/StoryboardBatchReviewDialog";

export interface StoryboardReferenceImage {
  url: string;
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
      ? parsed.companionAudio as StoryboardCompanionAudioCandidate[]
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

export function getStoryboardReviewName(draft: StoryboardReviewDraft): string {
  const firstPrompt = draft.tasks[0]?.prompt?.trim();
  const base = firstPrompt ? firstPrompt.slice(0, 52) : "Storyboard Review";
  return `${base}${firstPrompt && firstPrompt.length > 52 ? "..." : ""}`;
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
        generationAspectRatio: context?.aspectRatio,
        generationExtraParams: Object.keys(extraParams).length > 0 ? extraParams : undefined,
        canRegenerate: Boolean(context),
        isImported: task.source === "imported" || !context,
        status: task.status,
        error: task.error,
      };
    });
}
