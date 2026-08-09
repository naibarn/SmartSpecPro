import type { VideoProjectDocument } from "./projectSchemas";

export const CONTENT_DRAFT_DURATION_OPTIONS_SECONDS = [30, 60, 90, 180, 300] as const;
export type ContentDraftDurationSeconds = (typeof CONTENT_DRAFT_DURATION_OPTIONS_SECONDS)[number];
export const DEFAULT_CONTENT_DRAFT_DURATION_SECONDS: ContentDraftDurationSeconds = 60;

export const CONTENT_DRAFT_VOICE_TONES = [
  { id: "friendly_conversational", th: "เป็นกันเอง ฟังง่าย", en: "Friendly and conversational" },
  { id: "energetic_social", th: "กระชับ เร้าใจ แบบโซเชียล", en: "Energetic and social" },
  { id: "professional_explanatory", th: "มืออาชีพ อธิบายชัดเจน", en: "Professional and explanatory" },
  { id: "documentary_analytical", th: "สารคดี วิเคราะห์เป็นระบบ", en: "Documentary and analytical" },
  { id: "storytelling_warm", th: "เล่าเรื่อง อบอุ่น ชวนติดตาม", en: "Warm storytelling" },
] as const;
export type ContentDraftVoiceTone = (typeof CONTENT_DRAFT_VOICE_TONES)[number]["id"];
export const DEFAULT_CONTENT_DRAFT_VOICE_TONE: ContentDraftVoiceTone = "friendly_conversational";

export const CONTENT_DRAFT_MOTION_STYLES = [
  { id: "auto", th: "ให้ระบบเลือกตามเนื้อหา", en: "Choose based on the content" },
  { id: "text_graphics", th: "ข้อความ + graphic animation", en: "Text and graphic animation" },
  { id: "data_story", th: "อินโฟกราฟิก / ข้อมูล", en: "Infographic and data story" },
  { id: "image_story", th: "ภาพและวิดีโอเป็นหลัก", en: "Image and video led" },
  { id: "minimal", th: "เรียบง่าย ไม่รบกวนบทพูด", en: "Minimal and narration-led" },
] as const;
export type ContentDraftMotionStyle = (typeof CONTENT_DRAFT_MOTION_STYLES)[number]["id"];
export const DEFAULT_CONTENT_DRAFT_MOTION_STYLE: ContentDraftMotionStyle = "auto";

export type VideoContentDraftState = {
  status: "generating" | "ready" | "failed";
  attempt: number;
  feedback: string | null;
  document: VideoProjectDocument | null;
  summary: string | null;
  totalNarrationCharacters: number;
  durationLimitSeconds: ContentDraftDurationSeconds;
  voiceTone: ContentDraftVoiceTone;
  motionStyle: ContentDraftMotionStyle;
  modelId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

const DRAFT_KEY = "__videoStudioDraft";

export function readVideoContentDraft(brief: unknown): VideoContentDraftState | null {
  if (!brief || typeof brief !== "object") return null;
  const value = (brief as Record<string, unknown>)[DRAFT_KEY];
  if (!value || typeof value !== "object") return null;
  return value as VideoContentDraftState;
}

export function writeVideoContentDraft(
  brief: unknown,
  draft: VideoContentDraftState | null,
): Record<string, unknown> {
  const next = brief && typeof brief === "object" ? { ...(brief as Record<string, unknown>) } : {};
  if (draft) next[DRAFT_KEY] = draft;
  else delete next[DRAFT_KEY];
  return next;
}
