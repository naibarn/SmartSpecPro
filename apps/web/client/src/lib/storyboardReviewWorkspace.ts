import type {
  StoryboardClipMediaType,
  StoryboardClipTransition,
  StoryboardCompanionAudioCandidate,
} from "@/lib/storyboardVideoProject";
import type { StoryboardReviewTask } from "@/components/media/StoryboardBatchReviewDialog";
import { normalizeStoryboardMediaUrl } from "@/lib/storyboardReviewMedia";
import {
  buildVeo31StoryboardVideoPrompt,
  extractStoryboardNativeSpeechText,
  type StoryboardPromptSpeechMode,
} from "@shared/storyboardPromptAudio";

export interface StoryboardReferenceImage {
  url: string;
  name?: string;
  marketplaceProduct?: MarketplaceProductReferenceContext | null;
}

export type StoryboardReferenceFrameRole = "start" | "stop" | "reference";

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
  transition?: StoryboardClipTransition;
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
  marketplaceProduct?: MarketplaceProductReferenceContext | null;
}

export interface MarketplaceProductReferenceContext {
  productId?: string | null;
  platform: "shopee" | "tiktok_shop";
  productName?: string | null;
  shopName?: string | null;
  shopId?: string | null;
  itemId?: string | null;
  sourceUrl?: string | null;
  affiliateUrl?: string | null;
}

export interface StoryboardReviewDraft {
  version: 1;
  reviewId?: number | null;
  name?: string | null;
  updatedAt: number;
  taskIds: string[];
  selectedTaskIds: string[];
  tasks: StoryboardGenerationTask[];
  companionAudio: StoryboardCompanionAudioCandidate[];
  companionAudioUpdatedAt?: number | null;
  compoundStatus: string | null;
  projectLink: string | null;
  renderJobId: string | null;
  /** Marketplace product context attached to this storyboard for story/script generation */
  marketplaceContext?: MarketplaceProductReferenceContext | null;
  /** Production Director concept details used as creative guidance for prompt planning */
  conceptDetails?: string | null;
  /** Storyboard guide/instructions used as scene and voiceover planning context */
  storyboardGuide?: string | null;
  /** User-editable combined narration used for prompt planning and speech regeneration */
  voiceoverFullScript?: string | null;
  /** When true, planner treats voiceoverFullScript as the primary concept/content source */
  useVoiceoverScriptAsConcept?: boolean;
}

export interface FirstLastFrameStoryboardImage {
  url: string;
  name?: string;
  marketplaceProduct?: MarketplaceProductReferenceContext | null;
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
  marketplaceContext?: MarketplaceProductReferenceContext | null;
  apiConfig?: Record<string, string>;
  resolution?: string;
  now?: number;
  idPrefix?: string;
  statusDetail?: string;
  conceptDetails?: string | null;
  storyboardGuide?: string | null;
  includeVoiceover?: boolean;
  speechMode?: StoryboardPromptSpeechMode;
  speechLanguage?: string | null;
  includeSound?: boolean;
  soundBrief?: string | null;
  promptTone?: string | null;
  promptLanguage?: string | null;
}

export const STORYBOARD_REVIEW_DRAFT_STORAGE_KEY = "smartspec_media_studio_storyboard_review_draft_v1";
const STORYBOARD_REVIEW_DRAFT_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS = 8;

function normalizeStoryboardShotDurationSeconds(value: unknown): number {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0
    ? duration
    : DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS;
}

export function normalizeStoryboardReviewDraft(parsed: Partial<StoryboardReviewDraft> | null | undefined): StoryboardReviewDraft | null {
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.taskIds) || !Array.isArray(parsed.tasks)) {
    return null;
  }

  const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now();
  const companionAudio = Array.isArray(parsed.companionAudio)
    ? (parsed.companionAudio as StoryboardCompanionAudioCandidate[]).map((audio) => ({
      ...audio,
      url: typeof audio.url === "string" ? normalizeStoryboardMediaUrl(audio.url) : audio.url,
    }))
    : [];
  const companionAudioUpdatedAt = typeof parsed.companionAudioUpdatedAt === "number" && Number.isFinite(parsed.companionAudioUpdatedAt)
    ? parsed.companionAudioUpdatedAt
    : null;
  return {
    version: 1,
    reviewId: typeof parsed.reviewId === "number" ? parsed.reviewId : null,
    name: typeof parsed.name === "string" ? parsed.name : null,
    updatedAt,
    taskIds: parsed.taskIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0),
    selectedTaskIds: Array.isArray(parsed.selectedTaskIds)
      ? parsed.selectedTaskIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [],
    tasks: parsed.tasks as StoryboardGenerationTask[],
    companionAudio,
    companionAudioUpdatedAt,
    compoundStatus: typeof parsed.compoundStatus === "string" ? parsed.compoundStatus : null,
    projectLink: typeof parsed.projectLink === "string" ? parsed.projectLink : null,
    renderJobId: typeof parsed.renderJobId === "string" ? parsed.renderJobId : null,
    marketplaceContext: parsed.marketplaceContext ?? null,
    conceptDetails: typeof parsed.conceptDetails === "string" ? parsed.conceptDetails : null,
    storyboardGuide: typeof parsed.storyboardGuide === "string" ? parsed.storyboardGuide : null,
    voiceoverFullScript: typeof parsed.voiceoverFullScript === "string" ? parsed.voiceoverFullScript : null,
    useVoiceoverScriptAsConcept: Boolean(parsed.useVoiceoverScriptAsConcept),
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
    if (parsed.companionAudio.length > 0 && getStoryboardCompanionAudioUpdatedAt(parsed) <= 0) {
      return {
        ...parsed,
        companionAudio: [],
        companionAudioUpdatedAt: null,
      };
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

export function getStoryboardCompanionAudioUpdatedAt(draft: Partial<StoryboardReviewDraft> | null | undefined): number {
  const value = draft?.companionAudioUpdatedAt;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

export function mergeFresherStoryboardReviewTasks<T extends Partial<StoryboardReviewDraft> | null | undefined>(
  existingDraft: Partial<StoryboardReviewDraft> | null | undefined,
  incomingDraft: T,
): T {
  if (!existingDraft || !incomingDraft) return incomingDraft;
  if (!Array.isArray(existingDraft.tasks) || !Array.isArray(incomingDraft.tasks)) return incomingDraft;

  const existingTaskById = new Map(existingDraft.tasks.map((task) => [task.id, task]));
  const incomingTaskIds = new Set(incomingDraft.tasks.map((task) => task.id));
  const incomingOrder = Array.isArray(incomingDraft.taskIds) ? incomingDraft.taskIds : [];
  const incomingOrderSet = new Set(incomingOrder);
  const incomingUpdatedAt = typeof incomingDraft.updatedAt === "number" ? incomingDraft.updatedAt : 0;
  const existingCompanionAudioUpdatedAt = getStoryboardCompanionAudioUpdatedAt(existingDraft);
  const incomingCompanionAudioUpdatedAt = getStoryboardCompanionAudioUpdatedAt(incomingDraft);
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
  const missingLocalTasks = existingDraft.tasks.filter((existingTask) => {
    if (incomingTaskIds.has(existingTask.id)) return false;
    if (Array.isArray(existingDraft.taskIds) && !existingDraft.taskIds.includes(existingTask.id)) return false;
    return existingTask.source === "imported" || getTaskUpdatedAt(existingTask) > incomingUpdatedAt;
  });
  if (missingLocalTasks.length > 0) {
    changed = true;
    mergedTasks.push(...missingLocalTasks);
  }

  const missingLocalTaskIds = new Set(missingLocalTasks.map((task) => task.id));
  const mergedTaskIds = missingLocalTasks.length > 0
    ? [
        ...(Array.isArray(existingDraft.taskIds)
          ? existingDraft.taskIds.filter((id) => incomingOrderSet.has(id) || missingLocalTaskIds.has(id))
          : []),
        ...incomingOrder.filter((id) => {
          const existingOrder = Array.isArray(existingDraft.taskIds) ? existingDraft.taskIds : [];
          return !existingOrder.includes(id);
        }),
      ]
    : incomingDraft.taskIds;
  const mergedSelectedTaskIds = missingLocalTasks.length > 0 && Array.isArray(incomingDraft.selectedTaskIds)
    ? [
        ...incomingDraft.selectedTaskIds,
        ...missingLocalTasks
          .map((task) => task.id)
          .filter((id) => (
            Array.isArray(existingDraft.selectedTaskIds)
            && existingDraft.selectedTaskIds.includes(id)
            && !incomingDraft.selectedTaskIds?.includes(id)
          )),
      ]
    : incomingDraft.selectedTaskIds;

  const incomingCompanionAudio = Array.isArray(incomingDraft.companionAudio) ? incomingDraft.companionAudio : [];
  const existingCompanionAudio = Array.isArray(existingDraft.companionAudio) ? existingDraft.companionAudio : [];
  const shouldUseExistingCompanionAudio = existingCompanionAudioUpdatedAt > incomingCompanionAudioUpdatedAt;
  const mergedCompanionAudio = shouldUseExistingCompanionAudio
    ? existingCompanionAudio
    : incomingDraft.companionAudio;
  if (shouldUseExistingCompanionAudio) {
    changed = true;
  }

  return changed
    ? {
        ...incomingDraft,
        taskIds: mergedTaskIds,
        selectedTaskIds: mergedSelectedTaskIds,
        tasks: mergedTasks,
        companionAudio: mergedCompanionAudio,
        companionAudioUpdatedAt: Math.max(existingCompanionAudioUpdatedAt, incomingCompanionAudioUpdatedAt) || incomingDraft.companionAudioUpdatedAt,
      } as T
    : incomingDraft;
}

export function getStoryboardReviewName(draft: StoryboardReviewDraft): string {
  const explicitName = draft.name?.trim();
  if (explicitName) return explicitName;
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

function compactPromptPlannerOption(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function buildSplitStoryboardSoundBrief(options: BuildFirstLastFrameStoryboardTasksOptions): string {
  const explicitBrief = compactPromptPlannerOption(options.soundBrief);
  if (explicitBrief) return explicitBrief;
  if (!options.includeSound) return "";
  return "Soft ambient ecommerce product sound design with natural room tone and subtle movement accents.";
}

function buildSplitStoryboardVoiceoverScript(
  options: BuildFirstLastFrameStoryboardTasksOptions,
  taskIndex: number,
  totalTasks: number,
  marketplaceProduct: MarketplaceProductReferenceContext | null,
): string {
  if (!options.includeVoiceover || String(options.speechMode ?? "none") === "none") return "";

  const explicitSpeech = extractStoryboardNativeSpeechText(options.conceptDetails ?? "");
  if (explicitSpeech) return explicitSpeech;

  const speechMode = compactPromptPlannerOption(options.speechMode).toLowerCase();
  const speechLanguage = compactPromptPlannerOption(options.speechLanguage).toLowerCase();
  const productName = compactPromptPlannerOption(marketplaceProduct?.productName);
  const isThai = speechMode === "th" || speechLanguage === "thai" || speechLanguage === "ไทย";
  const isEnglish = speechMode === "en" || speechLanguage === "english";
  const isFirst = taskIndex === 0;
  const isLast = taskIndex >= Math.max(0, totalTasks - 1);
  const isMiddle = !isFirst && !isLast;

  if (isThai) {
    if (isFirst) return productName
      ? `เริ่มจากปัญหาหน้างาน แล้วดูว่า${productName}ช่วยเปลี่ยนมุมนี้ได้อย่างไร`
      : "เริ่มจากปัญหาหน้างาน แล้วค่อย ๆ เห็นทางออกที่ใช้งานได้จริง";
    if (isMiddle) return productName
      ? `พอดูรายละเอียดใกล้ขึ้น จะเห็นว่า${productName}ช่วยให้ใช้งานง่ายและเป็นระเบียบขึ้น`
      : "พอดูรายละเอียดใกล้ขึ้น จะเห็นวิธีใช้งานที่ช่วยให้ทุกอย่างเป็นระเบียบขึ้น";
    return productName
      ? `สุดท้าย${productName}ทำให้พื้นที่ดูพร้อมใช้ขึ้น และตัดสินใจได้ง่ายกว่าเดิม`
      : "สุดท้ายพื้นที่นี้ดูพร้อมใช้ขึ้น และตัดสินใจได้ง่ายกว่าเดิม";
  }

  if (isEnglish) {
    if (isFirst) return productName
      ? `Start with the everyday problem, then see how ${productName} changes this space.`
      : "Start with the everyday problem, then see the practical solution take shape.";
    if (isMiddle) return productName
      ? `As the details get closer, ${productName} makes the space easier to use and organize.`
      : "As the details get closer, the space becomes easier to use and organize.";
    return productName
      ? `In the end, ${productName} makes the setup feel ready to use and easier to choose.`
      : "In the end, the setup feels ready to use and easier to choose.";
  }

  if (productName) return `Show this ${productName} moment clearly and naturally.`;
  return "Show this storyboard moment clearly and naturally.";
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
  const durationSeconds = normalizeStoryboardShotDurationSeconds(options.duration);
  const totalDurationSeconds = Math.max(0, usableImages.length - 1) * durationSeconds;
  const promptTone = compactPromptPlannerOption(options.promptTone);
  const promptLanguage = compactPromptPlannerOption(options.promptLanguage);
  const speechMode = options.speechMode ?? "none";
  const speechLanguage = compactPromptPlannerOption(options.speechLanguage);
  const includeVoiceover = Boolean(options.includeVoiceover && String(speechMode ?? "none") !== "none");
  const includeSound = Boolean(options.includeSound);
  const soundBrief = buildSplitStoryboardSoundBrief(options);
  const promptPlanningContext = [
    promptTone ? `Prompt tone: ${promptTone}` : "",
    promptLanguage && promptLanguage !== "auto" ? `Prompt planning language: ${promptLanguage}` : "",
  ].filter(Boolean).join("\n");
  const hasPromptPlannerOptions = options.includeVoiceover !== undefined
    || options.speechMode !== undefined
    || options.speechLanguage !== undefined
    || options.includeSound !== undefined
    || options.soundBrief !== undefined
    || options.promptTone !== undefined
    || options.promptLanguage !== undefined;
  const extraParams = {
    ...(options.extraParams ?? {}),
    generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
    referenceFrameRoles: ["start", "stop"] as StoryboardReferenceFrameRole[],
    storyboardShotDurationSeconds: durationSeconds,
    storyboardTotalDurationSeconds: totalDurationSeconds,
    ...(options.conceptDetails ? { productionConceptDetails: options.conceptDetails } : {}),
    ...(options.storyboardGuide ? { storyboardGuide: options.storyboardGuide } : {}),
    ...(options.marketplaceContext ? { marketplaceContext: options.marketplaceContext } : {}),
    ...(hasPromptPlannerOptions
      ? {
          storyboardPromptPlanner: {
            includeVoiceover,
            speechMode,
            speechLanguage,
            includeSound,
            soundBrief,
            tone: promptTone,
            language: promptLanguage || "auto",
          },
        }
      : {}),
  };

  return usableImages.slice(0, -1).map((startImage, index) => {
    const endImage = usableImages[index + 1]!;
    const taskIndex = index;
    const marketplaceProduct = startImage.marketplaceProduct
      ?? endImage.marketplaceProduct
      ?? options.marketplaceContext
      ?? null;
    const voiceoverScript = buildSplitStoryboardVoiceoverScript(options, taskIndex, usableImages.length - 1, marketplaceProduct);
    const visualPrompt = [
      options.conceptDetails ? `Product/concept details: ${options.conceptDetails}` : "",
      promptPlanningContext ? `Prompt planning options: ${promptPlanningContext}` : "",
      `Shot ${taskIndex + 1}: use @Image1 as the exact start frame and @Image2 as the exact end frame.`,
      "Create a smooth cinematic transition between the two frames while preserving the same subject, product identity, composition intent, colors, and visual continuity.",
      "Do not introduce unrelated products, extra text, labels, UI, logos, or new characters.",
    ].filter(Boolean).join(" ");
    return {
      id: `${idPrefix}-${now}-${taskIndex + 1}`,
      index: taskIndex,
      status: "queued",
      type: "video",
      prompt: buildVeo31StoryboardVideoPrompt({
        visualPrompt,
        durationSeconds,
        aspectRatio,
        frameRoles: ["start", "stop"],
        conceptDetails: options.conceptDetails,
        storyboardGuide: options.storyboardGuide,
        includeVoiceover,
        speechMode,
        speechLanguage,
        voiceoverScript,
        includeSound,
        soundBrief,
      }),
      model: options.model,
      durationSeconds,
      createdAt: now,
      updatedAt: now,
      statusDetail: options.statusDetail ?? "Queued for storyboard review. Confirm and regenerate when ready.",
      marketplaceProduct,
      storyboardContext: {
        aspectRatio,
        duration: durationSeconds,
        model: options.model,
        referenceImages: [
          {
            url: startImage.url,
            name: startImage.name ?? `Frame ${taskIndex + 1}`,
            marketplaceProduct: startImage.marketplaceProduct ?? marketplaceProduct,
          },
          {
            url: endImage.url,
            name: endImage.name ?? `Frame ${taskIndex + 2}`,
            marketplaceProduct: endImage.marketplaceProduct ?? marketplaceProduct,
          },
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
          marketplaceProduct: input.image.marketplaceProduct ?? referenceImages[frame]?.marketplaceProduct ?? task.marketplaceProduct ?? draft.marketplaceContext ?? null,
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
      prompt: currentTask?.prompt ?? input.importedTask.prompt,
      transition: currentTask?.transition ?? input.importedTask.transition,
      storyboardContext: currentTask?.storyboardContext,
      marketplaceProduct: currentTask?.marketplaceProduct ?? input.importedTask.marketplaceProduct,
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
  const taskById = new Map(draft.tasks.map((task) => [task.id, task]));
  return draft.taskIds
    .map((taskId) => taskById.get(taskId))
    .filter((task): task is StoryboardGenerationTask => Boolean(task))
    .map((task) => {
      const context = task.storyboardContext;
      const extraParams: Record<string, unknown> = context
        ? {
            ...(context.extraParams ?? {}),
            ...(context.resolution ? { resolution: context.resolution } : {}),
            ...(!context.extraParams?.marketplaceContext && (task.marketplaceProduct ?? draft.marketplaceContext)
              ? { marketplaceContext: task.marketplaceProduct ?? draft.marketplaceContext }
              : {}),
          }
        : {};
      return {
        id: task.id,
        index: task.index,
        prompt: task.prompt,
        url: task.url,
        model: task.model,
        durationSeconds: normalizeStoryboardShotDurationSeconds(task.durationSeconds ?? context?.duration),
        mediaType: task.type === "image" ? "image" as StoryboardClipMediaType : "video" as StoryboardClipMediaType,
        transition: task.transition,
        generationModelId: context?.model || task.model,
        referenceUrls: context?.referenceImages?.map((image) => image.url).filter(Boolean),
        generationAspectRatio: context?.aspectRatio ?? task.aspectRatio,
        generationExtraParams: Object.keys(extraParams).length > 0 ? extraParams : undefined,
        referenceFrameRoles: Array.isArray(extraParams.referenceFrameRoles)
          ? extraParams.referenceFrameRoles.filter((role): role is StoryboardReferenceFrameRole => role === "start" || role === "stop" || role === "reference")
          : undefined,
        marketplaceProduct: task.marketplaceProduct ?? draft.marketplaceContext ?? null,
        canRegenerate: Boolean(context),
        isImported: task.source === "imported" || !context,
        status: task.status,
        error: task.error,
      };
    });
}
