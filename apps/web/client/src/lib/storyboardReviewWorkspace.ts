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
  return "Soft ecommerce room tone with subtle product movement accents.";
}

function pickOrderedStoryboardLine(lines: string[], taskIndex: number, totalTasks: number): string {
  if (lines.length === 0) return "";
  const lastSlotIndex = Math.max(0, totalTasks - 1);
  if (taskIndex <= 0) return lines[0]!;
  if (taskIndex >= lastSlotIndex) return lines[lines.length - 1]!;
  if (lines.length <= 2) return lines[0]!;

  const middleLines = lines.slice(1, -1);
  const middleSlotCount = Math.max(1, lastSlotIndex - 1);
  const middlePosition = Math.max(0, taskIndex - 1);
  const lineIndex = Math.min(
    middleLines.length - 1,
    Math.round((middlePosition / Math.max(1, middleSlotCount - 1)) * (middleLines.length - 1)),
  );
  return middleLines[lineIndex]!;
}

function buildNaturalThaiSplitStoryboardVoiceover(
  options: BuildFirstLastFrameStoryboardTasksOptions,
  taskIndex: number,
  totalTasks: number,
  productName: string,
): string {
  const context = [
    productName,
    options.conceptDetails,
    options.storyboardGuide,
  ].map(compactPromptPlannerOption).join(" ").toLowerCase();
  const isChildDining = /(เก้าอี้.*เด็ก|กินข้าวเด็ก|โต๊ะกินข้าวเด็ก|เด็ก\s*6\s*เดือน|high chair|baby)/i.test(context);
  const isBedsideTable = /(โต๊ะข้างเตียง|ข้างเตียง|ชั้นวาง|bedside|nightstand|side table)/i.test(context);

  if (isChildDining) {
    return pickOrderedStoryboardLine([
      "มื้ออาหารจะง่ายขึ้นมาก แค่เริ่มจากที่นั่งที่ปรับพอดีกับโต๊ะ แล้วรัดเข็มขัดให้ลูกนั่งนิ่งสบายตั้งแต่มื้อแรกค่ะ",
      "พอปรับระดับให้ใกล้โต๊ะ ลูกก็นั่งร่วมมื้ออาหารกับบ้านได้เป็นจังหวะขึ้น ผู้ปกครองป้อนข้าวได้ถนัดกว่าเดิมค่ะ",
      "เข็มขัดนิรภัยช่วยจัดท่านั่งให้อยู่ตำแหน่งเดิม ไม่ต้องคอยขยับซ้ำบ่อย ๆ ระหว่างมื้อก็รู้สึกมั่นใจขึ้นค่ะ",
      "ช็อตนี้ให้เห็นว่าพื้นที่กินข้าวไม่ต้องใหญ่ แค่จัดมุมให้พร้อมใช้ทุกมื้อ ของรอบตัวก็ดูเป็นระเบียบขึ้นค่ะ",
      "พอลูกเริ่มชินกับที่นั่งเดิม มื้ออาหารก็ไหลลื่นกว่าเดิม ผู้ปกครองมีเวลาสนใจกับการกินมากกว่าการจัดท่าค่ะ",
      "ของใช้รอบตัวถูกจัดไว้ใกล้มือ จะหยิบผ้า ช้อน หรือของจำเป็นระหว่างมื้อก็ไม่ต้องลุกไปหาให้วุ่นวายค่ะ",
      "พอมุมกินข้าวเป็นระเบียบ บ้านก็ดูพร้อมสำหรับมื้อต่อไป ไม่ต้องเก็บตั้งต้นใหม่ทุกครั้งหลังใช้งานค่ะ",
      "ทำซ้ำไม่กี่มื้อ มุมกินข้าวก็เป็นระเบียบและพร้อมใช้ทุกวัน ลูกนั่งคุ้นที่เดิม ส่วนผู้ปกครองก็จัดการง่ายขึ้นค่ะ",
    ], taskIndex, totalTasks);
  }

  if (isBedsideTable) {
    return pickOrderedStoryboardLine([
      "มุมข้างเตียงรก ๆ แบบนี้ แค่มีที่วางของเป็นสัดส่วน ห้องก็ดูโล่งขึ้นทันที และหยิบของก่อนนอนได้ง่ายขึ้นค่ะ",
      "เริ่มจากวางโต๊ะให้พอดีกับข้างเตียง ของที่ใช้บ่อยจะอยู่ใกล้มือขึ้น ไม่ต้องวางกองไว้บนพื้นหรือหัวเตียงค่ะ",
      "โคมไฟกับนาฬิกามีที่วางชัดเจน ก่อนนอนก็ไม่ต้องย้ายของไปมา แถมตอนตื่นเช้ายังหยิบใช้งานได้ทันทีค่ะ",
      "หนังสือหรือสมุดเล่มเล็ก ๆ เก็บไว้ชั้นล่างได้ มุมนี้เลยดูไม่แน่นเกินไป แต่ยังมีของจำเป็นอยู่ครบค่ะ",
      "ของใช้ประจำวันอย่างแก้วน้ำหรือรีโมตมีตำแหน่งประจำ จะหยิบตอนเช้าหรือวางคืนก่อนนอนก็เป็นจังหวะเดิมค่ะ",
      "พอจัดของแยกชั้น บนโต๊ะยังดูโล่ง แต่ของจำเป็นก็ยังอยู่ครบ ช่วยให้ห้องดูสะอาดขึ้นโดยไม่ต้องจัดใหญ่ค่ะ",
      "ช็อตนี้ช่วยให้เห็นสเกลจริง ว่ามุมเล็ก ๆ ก็ใช้ประโยชน์ได้โดยไม่เกะกะ และยังเข้ากับห้องนอนได้ง่ายค่ะ",
      "มองรวมแล้วห้องดูสะอาดขึ้น โดยไม่ต้องเปลี่ยนเฟอร์นิเจอร์ชิ้นใหญ่ แค่เพิ่มที่เก็บของให้เข้าที่มากขึ้นค่ะ",
      "ถ้าอยากให้มุมเล็ก ๆ ดูพร้อมใช้ทุกวัน ตัวนี้ช่วยจัดของให้เข้าที่ได้ดี ทั้งโคมไฟ หนังสือ และของหยิบใช้บ่อยค่ะ",
    ], taskIndex, totalTasks);
  }

  return pickOrderedStoryboardLine([
    productName
      ? `ถ้าใช้งานจริงแล้วยังไม่ค่อยลงตัว ลองดูว่า${productName}ช่วยให้ขั้นตอนนี้ง่ายขึ้นยังไง ตั้งแต่เริ่มจัดพื้นที่จนถึงตอนใช้ทุกวันค่ะ`
      : "ถ้าใช้งานจริงแล้วยังไม่ค่อยลงตัว ลองดูวิธีทำให้มุมนี้ใช้ง่ายขึ้น ตั้งแต่การจัดพื้นที่จนถึงตอนหยิบใช้ทุกวันค่ะ",
    "เริ่มจากมุมที่ยังจัดไม่เข้าที่ แล้วค่อย ๆ เห็นตำแหน่งใช้งานที่ชัดขึ้น ของที่ต้องใช้ก็ไม่กระจายเหมือนเดิมค่ะ",
    "พอดูรายละเอียดใกล้ขึ้น จะเห็นว่าของแต่ละชิ้นมีหน้าที่ชัด ไม่ต้องเดาเวลาใช้ และไม่ต้องเสียเวลาหาซ้ำค่ะ",
    "จุดที่น่าสนใจคือมันช่วยลดขั้นตอนเล็ก ๆ ที่ทำให้การใช้งานประจำวันสะดุด พอทุกอย่างอยู่ถูกที่ก็ไหลลื่นขึ้นค่ะ",
    "พอจัดเข้ากับพื้นที่จริง มุมนี้จะดูเป็นระเบียบขึ้นโดยไม่ต้องทำอะไรซับซ้อน แค่มีตำแหน่งให้ของแต่ละอย่างค่ะ",
    "ช็อตนี้ช่วยให้เห็นภาพการใช้จริง ว่าไม่ได้มีแค่สวย แต่ต้องหยิบใช้ได้สะดวก และเข้ากับจังหวะในบ้านได้จริงค่ะ",
    "ช่วงท้ายจะเห็นผลลัพธ์รวม ว่าพื้นที่เล็ก ๆ ก็ดูพร้อมใช้และดูแลง่ายขึ้น โดยไม่ต้องเปลี่ยนอะไรเยอะค่ะ",
    "พอทุกอย่างเข้าที่แล้ว มุมนี้ก็ดูพร้อมใช้ขึ้น ใช้งานจริงได้ง่ายขึ้น และช่วยให้ตัดสินใจได้ชัดกว่าเดิมค่ะ",
  ], taskIndex, totalTasks);
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
    return buildNaturalThaiSplitStoryboardVoiceover(options, taskIndex, totalTasks, productName);
  }

  if (isEnglish) {
    if (isFirst) return productName
      ? `If this setup still feels messy, see how ${productName} gives the essentials one clear place, so the space feels calmer and easier to use every day.`
      : "If this setup still feels messy, start by giving the essentials one clear place, so the space feels calmer and easier to use every day.";
    if (isMiddle) return productName
      ? `${productName} keeps the daily items close, easy to reach, and off the floor, while the shot shows how the setup works in real use.`
      : "The closer details show how the daily items stay easier to reach, while the setup still looks tidy and practical in real use.";
    return productName
      ? `Once everything has its place, ${productName} makes this corner feel ready for every day, without needing a bigger change to the room.`
      : "Once everything has its place, this corner feels ready for every day, without needing a bigger change to the room.";
  }

  if (productName) return `Show this ${productName} moment clearly and naturally, with enough spoken detail to fill the clip without a silent ending.`;
  return "Show this storyboard moment clearly and naturally, with enough spoken detail to fill the clip without a silent ending.";
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
      `Shot ${taskIndex + 1}: transition from @Image1 exact start frame to @Image2 exact end frame.`,
      "Preserve visible product, people or hands, room, props, colors, composition, and continuity.",
      "No new products, text, labels, UI, logos, or characters.",
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
