import { z } from "zod";
import { sha256Hex } from "./artifacts";

export const PROMPT_EXPANSION_STATUSES = [
  "preview",
  "applied",
  "cancelled",
  "stale",
  "failed",
] as const;
export type PromptExpansionStatus = (typeof PROMPT_EXPANSION_STATUSES)[number];

export const PROMPT_EXPANSION_PROFILES = [
  "review",
  "documentary",
  "news_report",
  "software_review",
  "story",
] as const;
export type PromptExpansionProfile = (typeof PROMPT_EXPANSION_PROFILES)[number];

/** Maximum length for one scope item returned by the prompt expansion model. */
export const PROMPT_EXPANSION_SCOPE_ITEM_MAX_LENGTH = 2000;

/** Prompt length supported by the optional AI expansion action in the wizard. */
export const PROMPT_EXPANSION_PREMISE_LIMIT = 5_000;

export const promptExpansionSourceSchema = z.object({
  url: z.string().url().max(2048),
  title: z.string().trim().min(1).max(240),
  publisher: z.string().trim().max(180).optional(),
  publishedAt: z.string().datetime().optional(),
  accessedAt: z.string().datetime(),
  supports: z.array(z.string().trim().min(1).max(128)).max(20).default([]),
});
export type PromptExpansionSource = z.infer<typeof promptExpansionSourceSchema>;

export const promptExpansionVisualSlotSchema = z.object({
  slotKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,127}$/),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().min(1).max(2000),
  semanticRole: z.enum(["scene_anchor", "reference", "b_roll_still", "b_roll_footage"]),
  mediaType: z.enum(["image", "video", "mixed"]),
  required: z.boolean(),
  evidenceStatus: z.enum(["not_applicable", "illustrative", "needs_verification", "verified"]),
  rationale: z.string().trim().max(1000).optional(),
});
export type PromptExpansionVisualSlot = z.infer<typeof promptExpansionVisualSlotSchema>;

export const promptExpansionBriefSchema = z.object({
  title: z.string().trim().min(1).max(240),
  oneLineSummary: z.string().trim().min(1).max(1000),
  profile: z.enum(PROMPT_EXPANSION_PROFILES),
  angle: z.string().trim().min(1).max(2000),
  audience: z.string().trim().max(500).optional(),
  scope: z.array(z.string().trim().min(1).max(PROMPT_EXPANSION_SCOPE_ITEM_MAX_LENGTH)).max(20),
  factualClaims: z.array(z.string().trim().min(1).max(1000)).max(50),
  creativeAssumptions: z.array(z.string().trim().min(1).max(1000)).max(20),
  exclusions: z.array(z.string().trim().min(1).max(500)).max(20),
  storyTreatment: z.lazy(() => promptExpansionStoryTreatmentSchema).optional(),
});
export type PromptExpansionBrief = z.infer<typeof promptExpansionBriefSchema>;

/**
 * Story-specific treatment fields are deliberately separate from the editable
 * premise.  They make the expansion useful as a compact story treatment
 * without silently turning it into the later episode/scene draft.
 */
export const promptExpansionStoryTreatmentSchema = z.object({
  protagonists: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    role: z.string().trim().min(1).max(300),
    background: z.string().trim().min(1).max(800),
    goal: z.string().trim().min(1).max(600),
    need: z.string().trim().min(1).max(600),
  })).min(2).max(6),
  setting: z.string().trim().min(1).max(1200),
  meetingAndIncitingEvent: z.string().trim().min(1).max(1600),
  relationshipProgression: z.array(z.string().trim().min(1).max(800)).min(2).max(8),
  obstacles: z.array(z.string().trim().min(1).max(800)).min(2).max(10),
  opposingForces: z.array(z.string().trim().min(1).max(800)).min(1).max(8),
  centralQuestion: z.string().trim().min(1).max(800),
  majorConflict: z.string().trim().min(1).max(1200),
  turningPoints: z.array(z.string().trim().min(1).max(800)).min(2).max(8),
  climax: z.string().trim().min(1).max(1200),
  endingDirection: z.string().trim().min(1).max(1200),
  unresolvedHooks: z.array(z.string().trim().min(1).max(600)).max(8),
  tone: z.string().trim().min(1).max(500),
  audience: z.string().trim().min(1).max(500),
  assumptions: z.array(z.string().trim().min(1).max(600)).max(20),
  exclusions: z.array(z.string().trim().min(1).max(600)).max(20),
});
export type PromptExpansionStoryTreatment = z.infer<typeof promptExpansionStoryTreatmentSchema>;

export const promptExpansionExecutionSchema = z.object({
  skillId: z.literal("vertical-drama-prompt-expansion"),
  skillVersion: z.string().trim().min(1).max(40),
  executionMode: z.literal("llm-only"),
  provider: z.string().trim().min(1).max(160),
  providerCallId: z.string().trim().min(1).max(200),
  model: z.string().trim().min(1).max(200),
  attemptCount: z.number().int().positive().max(3),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  mocked: z.literal(false),
});
export type PromptExpansionExecution = z.infer<typeof promptExpansionExecutionSchema>;

export const promptExpansionPreviewSchema = z.object({
  revision: z.number().int().positive(),
  originalPrompt: z.string().trim().min(1).max(PROMPT_EXPANSION_PREMISE_LIMIT),
  originalPromptHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(PROMPT_EXPANSION_STATUSES),
  brief: promptExpansionBriefSchema,
  expandedPrompt: z.string().trim().min(1).max(20000),
  sources: z.array(promptExpansionSourceSchema).max(30),
  warnings: z.array(z.string().trim().min(1).max(1000)).max(30),
  slots: z.array(promptExpansionVisualSlotSchema).min(1).max(50),
  execution: promptExpansionExecutionSchema.optional(),
});
export type PromptExpansionPreview = z.infer<typeof promptExpansionPreviewSchema>;

export const promptExpansionModelOutputSchema = z.object({
  brief: promptExpansionBriefSchema.extend({
    storyTreatment: promptExpansionStoryTreatmentSchema.optional(),
  }).strict(),
  expandedPrompt: z.string().trim().min(1).max(20000),
  sources: z.array(promptExpansionSourceSchema).max(30),
  warnings: z.array(z.string().trim().min(1).max(1000)).max(30),
  slots: z.array(promptExpansionVisualSlotSchema).min(1).max(50),
}).strict();
export type PromptExpansionModelOutput = z.infer<typeof promptExpansionModelOutputSchema>;

export type PromptExpansionQualityResult = {
  ok: boolean;
  checks: string[];
  failureReasons: string[];
};

function normalizePromptForComparison(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** Rejects copied/generic output before anything is persisted or charged. */
export function evaluatePromptExpansionQuality(input: {
  originalPrompt: string;
  output: PromptExpansionModelOutput;
}): PromptExpansionQualityResult {
  const original = input.originalPrompt.trim();
  const expanded = input.output.expandedPrompt.trim();
  const failures: string[] = [];
  const checks: string[] = [];
  if (!expanded || normalizePromptForComparison(expanded) === normalizePromptForComparison(original)) {
    failures.push("expandedPrompt must add meaningful content beyond the original premise");
  } else {
    checks.push("expandedPrompt differs from original");
  }
  const minimumAddedCharacters = Math.max(120, Math.ceil(original.length * 0.2));
  if (expanded.length - original.length < minimumAddedCharacters) {
    failures.push(`expandedPrompt must add at least ${minimumAddedCharacters} characters`);
  } else {
    checks.push("expandedPrompt has meaningful additional detail");
  }
  if (input.output.brief.profile === "story") {
    const treatment = input.output.brief.storyTreatment;
    if (!treatment) {
      failures.push("storyTreatment is required for story expansion");
    } else {
      checks.push("storyTreatment contains characters, relationship, conflict, climax, and ending");
    }
  }
  return { ok: failures.length === 0, checks, failureReasons: failures };
}

export function hashPrompt(prompt: string): string {
  return sha256Hex(prompt.trim());
}

export function isSpecificResearchCandidate(prompt: string): boolean {
  return /(หอไอเฟล|น่าน|smartaihub\.app|เว็บไซต์|ระบบ|software|app|สถานี|อำเภอ|จังหวัด|น้ำท่วม|ดินสไลด์|ปี\s*\d{4}|19[-–]21\s*ส\.ค\.)/i.test(prompt);
}

export function inferPromptExpansionProfile(prompt: string): PromptExpansionProfile {
  if (/ข่าว|สถานการณ์|ยอด|ผู้เสียชีวิต|เตือนภัย|ล่าสุด|วันนี้|รายงาน/i.test(prompt)) return "news_report";
  if (/รีวิว.*(ระบบ|software|แอป|เว็บ)|smartaihub|การใช้งาน/i.test(prompt)) return "software_review";
  if (/สารคดี|พาท่องเที่ยว|ประวัติ|การอนุรักษ์/i.test(prompt)) return "documentary";
  if (/รีวิว|ร้าน|สินค้า|บริการ/i.test(prompt)) return "review";
  return "story";
}

export function deriveVisualSlots(prompt: string, profile = inferPromptExpansionProfile(prompt)): PromptExpansionVisualSlot[] {
  const cafeLike = /ร้านกาแฟ|คาเฟ่|coffee\s*shop|cafe|คอฟฟี่/i.test(prompt);
  const restaurantLike = /ร้านอาหาร|ร้าน|restaurant|เมนู|อาหาร|จาน/i.test(prompt);
  const locationLike = /หอไอเฟล|สถานที่|ร้าน|อ่างเก็บน้ำ|จังหวัด|อำเภอ|เมือง|ชายหาด|ปะการัง/i.test(prompt);
  const objectLike = /สินค้า|สิ่งของ|ระบบ|software|แอป|เว็บไซต์|smartaihub/i.test(prompt);
  const newsLike = profile === "news_report";
  const slots: PromptExpansionVisualSlot[] = [];
  if (cafeLike) {
    slots.push(
      {
        slotKey: "venue_exterior",
        title: "หน้าร้านกาแฟ",
        description: "ภาพภายนอกร้าน ป้าย และบรรยากาศรอบหน้าร้านในสถานที่จริง เพื่อใช้เป็นภาพฉากหลัก",
        semanticRole: "scene_anchor",
        mediaType: "mixed",
        required: true,
        evidenceStatus: "needs_verification",
        rationale: "ร้านและทำเลเป็นบริบทของรีวิว จึงต้องเห็นตัวตนของสถานที่ก่อนใช้เป็นฉาก",
      },
      {
        slotKey: "venue_surroundings",
        title: "บรรยากาศรอบร้าน",
        description: "ภาพพื้นที่โดยรอบ ทางเข้า วิว หรือจุดเด่นใกล้ร้านที่ช่วยบอกทำเลและประสบการณ์ก่อนเข้าร้าน",
        semanticRole: "scene_anchor",
        mediaType: "mixed",
        required: true,
        evidenceStatus: "needs_verification",
        rationale: "ทำเลรอบร้านมีผลต่อคำรีวิวและควรแยกจากภาพภายในร้าน",
      },
      {
        slotKey: "coffee_counter",
        title: "เคาน์เตอร์ชงกาแฟ",
        description: "ภาพเคาน์เตอร์ เครื่องชง และขั้นตอนเตรียมกาแฟที่ร้านอนุญาตให้บันทึกได้",
        semanticRole: "scene_anchor",
        mediaType: "mixed",
        required: true,
        evidenceStatus: "needs_verification",
        rationale: "เป็นฉากการใช้งานจริงของร้าน ไม่ใช่ reference สินค้าแยกชิ้น",
      },
      {
        slotKey: "cafe_seating",
        title: "พื้นที่นั่งดื่มกาแฟ",
        description: "ภาพโต๊ะนั่ง แสง บรรยากาศ และพื้นที่ใช้งานจริงภายในร้าน โดยหลีกเลี่ยงใบหน้าที่ไม่ได้รับอนุญาต",
        semanticRole: "scene_anchor",
        mediaType: "mixed",
        required: true,
        evidenceStatus: "needs_verification",
        rationale: "ประสบการณ์นั่งดื่มเป็นส่วนหนึ่งของรีวิวร้าน จึงต้องเป็นภาพฉากที่ผูกกับสถานที่",
      },
      {
        slotKey: "coffee_menu_detail",
        title: "เมนูและแก้วกาแฟ",
        description: "ภาพเมนู ราคา และเครื่องดื่มที่รีวิว ใช้เป็นภาพรายละเอียดหรือ B-roll โดยยืนยันข้อมูลจากร้านก่อนเผยแพร่",
        semanticRole: "reference",
        mediaType: "mixed",
        required: true,
        evidenceStatus: "needs_verification",
        rationale: "เมนูและราคาเป็นข้อมูลอ้างอิง ไม่ควรถูกตีความเป็นฉากเต็มโดยอัตโนมัติ",
      },
    );
  } else if (locationLike || newsLike) {
    slots.push({
      slotKey: "primary_location",
      title: newsLike ? "ภาพสถานการณ์หลัก" : "ภาพสถานที่/บรรยากาศหลัก",
      description: newsLike ? "ภาพสถานการณ์จริงในพื้นที่ที่ยืนยันแหล่งที่มาและช่วงเวลาได้" : "ภาพกว้างที่ทำหน้าที่แทนฉากและทำให้ผู้ชมเข้าใจสถานที่ทันที",
      semanticRole: "scene_anchor",
      mediaType: newsLike ? "mixed" : "image",
      required: true,
      evidenceStatus: newsLike ? "needs_verification" : "illustrative",
      rationale: "สถานที่หรือเหตุการณ์เป็นบริบทหลัก จึงต้องถูกพิจารณาเป็น scene anchor ก่อน reference",
    });
  }
  if (objectLike) {
    slots.push({
      slotKey: "subject_detail",
      title: "ภาพรายละเอียดสิ่งที่รีวิว",
      description: "ภาพระยะใกล้หรือภาพหน้าจอที่ใช้เป็น reference ของสิ่งของ ระบบ หรือบริการ ไม่เลื่อนความหมายไปเป็นฉากโดยอัตโนมัติ",
      semanticRole: "reference",
      mediaType: "image",
      required: true,
      evidenceStatus: profile === "news_report" ? "needs_verification" : "not_applicable",
      rationale: "สิ่งที่ถูกรีวิวเป็นตัวแบบ/ข้อมูลอ้างอิง ไม่ใช่สภาพแวดล้อมของฉาก",
    });
  }
  if (newsLike || profile === "documentary" || profile === "review") {
    slots.push({
      slotKey: "supporting_broll",
      title: "ภาพหรือวิดีโอ B-roll สนับสนุน",
      description: "ภาพถ่ายจริงหรือ footage ที่ช่วยเล่ารายละเอียด โดยรักษาป้ายแหล่งที่มา วันที่ และสิทธิ์การใช้งาน",
      semanticRole: "b_roll_footage",
      mediaType: "mixed",
      required: newsLike,
      evidenceStatus: newsLike ? "needs_verification" : "illustrative",
      rationale: "แยก B-roll ออกจากภาพฉากและ reference เพื่อไม่ให้ start frame เลือกผิด semantic role",
    });
  }
  if (!slots.length) {
    slots.push({
      slotKey: "concept_visual",
      title: "ภาพประกอบแนวคิด",
      description: "ภาพเชิงจินตนาการเพื่ออธิบายแนวคิด โดยติดป้ายว่าเป็นภาพประกอบ ไม่ใช่หลักฐานข้อเท็จจริง",
      semanticRole: "b_roll_still",
      mediaType: "image",
      required: false,
      evidenceStatus: "illustrative",
      rationale: "โจทย์ยังไม่ระบุสถานที่หรือวัตถุเฉพาะ จึงเสนอเป็นภาพประกอบเท่านั้น",
    });
  }
  return slots;
}

export function buildSlotPrompt(slot: PromptExpansionVisualSlot, brief: PromptExpansionBrief, locale: "th" | "en" = "en"): string {
  const language = locale === "th" ? "Thai" : "English";
  const evidence = slot.evidenceStatus === "illustrative" ? "Clearly illustrative, not documentary evidence." : "Respect the supplied source and do not invent factual details.";
  return [
    `Create a ${slot.mediaType} visual for the slot '${slot.title}'.`,
    `Role: ${slot.semanticRole}.`,
    `Brief: ${brief.oneLineSummary}.`,
    `Visual direction: ${slot.description}.`,
    evidence,
    `Output language for any visible labels: ${language}.`,
    "Vertical 9:16 composition, readable subject, no fabricated logos or unsupported factual text.",
  ].join(" ");
}

export class PromptExpansionOutputError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "PromptExpansionOutputError";
  }
}

/** Parse only a real skill response. Invalid/empty/plain-text output is fatal. */
export function parsePromptExpansionModelOutput(raw: string): PromptExpansionModelOutput {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new PromptExpansionOutputError("Prompt expansion LLM returned an empty response");
  }
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(withoutFence);
  } catch (error) {
    throw new PromptExpansionOutputError("Prompt expansion LLM returned non-JSON output", error);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PromptExpansionOutputError("Prompt expansion LLM returned an invalid JSON object");
  }
  let candidate = parsed as Record<string, unknown>;
  for (const key of ["promptExpansion", "prompt_expansion", "data", "result"]) {
    const nested = candidate[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      candidate = nested as Record<string, unknown>;
      break;
    }
  }
  const validation = promptExpansionModelOutputSchema.safeParse(candidate);
  if (!validation.success) {
    throw new PromptExpansionOutputError(
      "Prompt expansion LLM response failed the skill output schema",
      validation.error,
    );
  }
  return validation.data;
}
