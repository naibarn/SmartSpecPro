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
  scope: z.array(z.string().trim().min(1).max(500)).max(20),
  factualClaims: z.array(z.string().trim().min(1).max(1000)).max(50),
  creativeAssumptions: z.array(z.string().trim().min(1).max(1000)).max(20),
  exclusions: z.array(z.string().trim().min(1).max(500)).max(20),
});
export type PromptExpansionBrief = z.infer<typeof promptExpansionBriefSchema>;

export const promptExpansionPreviewSchema = z.object({
  revision: z.number().int().positive(),
  originalPrompt: z.string().trim().min(1).max(12000),
  originalPromptHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(PROMPT_EXPANSION_STATUSES),
  brief: promptExpansionBriefSchema,
  expandedPrompt: z.string().trim().min(1).max(20000),
  sources: z.array(promptExpansionSourceSchema).max(30),
  warnings: z.array(z.string().trim().min(1).max(1000)).max(30),
  slots: z.array(promptExpansionVisualSlotSchema).max(50),
});
export type PromptExpansionPreview = z.infer<typeof promptExpansionPreviewSchema>;

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
  const locationLike = /หอไอเฟล|สถานที่|ร้าน|อ่างเก็บน้ำ|จังหวัด|อำเภอ|เมือง|ชายหาด|ปะการัง/i.test(prompt);
  const objectLike = /สินค้า|สิ่งของ|ระบบ|software|แอป|เว็บไซต์|smartaihub/i.test(prompt);
  const newsLike = profile === "news_report";
  const slots: PromptExpansionVisualSlot[] = [];
  if (locationLike || newsLike) {
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

export function parsePromptExpansionModelOutput(raw: string, fallbackPrompt: string): {
  brief: PromptExpansionBrief;
  expandedPrompt: string;
  slots: PromptExpansionVisualSlot[];
  sources: PromptExpansionSource[];
  warnings: string[];
} {
  const fallbackProfile = inferPromptExpansionProfile(fallbackPrompt);
  const fallbackBrief: PromptExpansionBrief = {
    title: fallbackPrompt.slice(0, 120),
    oneLineSummary: fallbackPrompt,
    profile: fallbackProfile,
    angle: "อธิบายโจทย์ให้ชัดขึ้นโดยคงเจตนาของผู้ใช้",
    scope: [fallbackPrompt],
    factualClaims: [],
    creativeAssumptions: ["รายละเอียดที่ไม่ได้ระบุจะต้องให้ผู้ใช้ตรวจและแก้ไขก่อนนำไปใช้"],
    exclusions: [],
  };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const brief = promptExpansionBriefSchema.parse(parsed.brief);
    const slots = z.array(promptExpansionVisualSlotSchema).max(50).parse(parsed.slots ?? deriveVisualSlots(fallbackPrompt, brief.profile));
    const expandedPrompt = typeof parsed.expandedPrompt === "string" && parsed.expandedPrompt.trim() ? parsed.expandedPrompt.trim() : fallbackPrompt;
    return {
      brief,
      expandedPrompt,
      slots,
      sources: z.array(promptExpansionSourceSchema).max(30).parse(parsed.sources ?? []),
      warnings: z.array(z.string()).parse(parsed.warnings ?? []),
    };
  } catch {
    return {
      brief: fallbackBrief,
      expandedPrompt: fallbackPrompt,
      slots: deriveVisualSlots(fallbackPrompt, fallbackProfile),
      sources: [],
      warnings: ["AI response ไม่อยู่ในรูปแบบที่ปลอดภัย จึงใช้โครงสร้างตั้งต้นให้ผู้ใช้ตรวจสอบก่อน"],
    };
  }
}
