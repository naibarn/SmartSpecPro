import { z } from "zod";

import type { AIPresentationSlide } from "./aiTypes";

export const PRESENTATION_AI_LAYOUT_MODES = [
  "structured_block",
  "long_form_block",
  "llm_layout_dsl",
  "full_slide_media",
] as const;

export const presentationAILayoutModeSchema = z.enum(PRESENTATION_AI_LAYOUT_MODES);

export const PRESENTATION_AI_LAYOUT_MODE_BLOCKERS = [
  "feature_flag",
  "provider_capability",
  "cost",
  "safety",
  "lock_conflict",
] as const;

export const presentationAILayoutModeBlockedBySchema = z.enum(
  PRESENTATION_AI_LAYOUT_MODE_BLOCKERS,
);

export const presentationAIContentParagraphSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().min(1).max(2_000),
  chars: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  isBullet: z.boolean(),
}).strict();

export const presentationAIContentSectionSchema = z.object({
  id: z.string().min(1).max(64),
  heading: z.string().min(1).max(260),
  detailIds: z.array(z.string().min(1).max(64)).max(16),
}).strict();

export const presentationAIContentSignalsSchema = z.object({
  process: z.number().int().min(0).max(20),
  timeline: z.number().int().min(0).max(20),
  profile: z.number().int().min(0).max(20),
  quote: z.number().int().min(0).max(20),
  metric: z.number().int().min(0).max(20),
  contact: z.number().int().min(0).max(20),
}).strict();

export const presentationAIContentProfileSchema = z.object({
  headingCount: z.number().int().nonnegative(),
  subheadingCount: z.number().int().nonnegative(),
  paragraphCount: z.number().int().nonnegative(),
  bulletCount: z.number().int().nonnegative(),
  sectionCount: z.number().int().nonnegative(),
  totalChars: z.number().int().nonnegative(),
  totalWords: z.number().int().nonnegative(),
  avgParagraphChars: z.number().nonnegative(),
  maxParagraphChars: z.number().int().nonnegative(),
  longParagraphCount: z.number().int().nonnegative(),
  denseTextCandidate: z.boolean(),
  visualFirstCandidate: z.boolean(),
  paragraphs: z.array(presentationAIContentParagraphSchema).max(64),
  sections: z.array(presentationAIContentSectionSchema).max(16),
  signals: presentationAIContentSignalsSchema,
}).strict();

export const presentationAILayoutModeCandidateSchema = z.object({
  mode: presentationAILayoutModeSchema,
  score: z.number().finite().min(-100).max(100),
  fitStatus: z.enum(["fits", "cramped", "unsafe"]),
  reason: z.string().min(1).max(512),
  blockedBy: presentationAILayoutModeBlockedBySchema.optional(),
}).strict();

export type PresentationAILayoutMode = z.infer<typeof presentationAILayoutModeSchema>;
export type PresentationAIContentParagraph = z.infer<typeof presentationAIContentParagraphSchema>;
export type PresentationAIContentSection = z.infer<typeof presentationAIContentSectionSchema>;
export type PresentationAIContentProfile = z.infer<typeof presentationAIContentProfileSchema>;
export type PresentationAILayoutModeCandidate = z.infer<typeof presentationAILayoutModeCandidateSchema>;

interface ResolvePresentationLayoutModeInput {
  slide: Pick<AIPresentationSlide, "title" | "body" | "notes" | "sections" | "markdownHierarchy" | "templateId">;
  slideIndex: number;
  enabledModes?: Partial<Record<PresentationAILayoutMode, boolean>>;
  previousModes?: PresentationAILayoutMode[];
}

interface ResolvePresentationLayoutModeResult {
  mode: PresentationAILayoutMode;
  recommendedMode: PresentationAILayoutMode;
  candidateModes: PresentationAILayoutModeCandidate[];
  profile: PresentationAIContentProfile;
}

const PROCESS_KEYWORDS = ["step", "steps", "how to", "workflow", "ขั้นตอน", "วิธี", "เคล็ดลับ", "คู่มือ"];
const TIMELINE_KEYWORDS = ["timeline", "roadmap", "history", "milestone", "phase", "ปี", "ไทม์ไลน์", "ประวัติ"];
const PROFILE_KEYWORDS = ["profile", "bio", "resume", "experience", "skill", "เกี่ยวกับ", "ประวัติ", "ทักษะ", "ติดต่อ"];
const QUOTE_KEYWORDS = ["quote", "testimonial", "คำคม", "เสียงจากลูกค้า"];
const VISUAL_FIRST_KEYWORDS = ["poster", "promo", "campaign", "launch", "hero", "infographic", "โปสเตอร์", "โปรโมชัน", "แคมเปญ"];

function normalizeText(input: string | undefined | null): string {
  return typeof input === "string" ? input.replace(/\s+/g, " ").trim() : "";
}

function isBulletLine(text: string): boolean {
  return /^[-*•]\s+/.test(text) || /^\d+[.)]\s+/.test(text);
}

function countWords(text: string): number {
  const normalized = normalizeText(text);
  if (!normalized) {
    return 0;
  }
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    return tokens.length;
  }
  // Thai text often lacks spaces; use a conservative fallback.
  return Math.max(1, Math.round(normalized.length / 6));
}

function includesKeyword(haystack: string, keywords: string[]): boolean {
  const lower = haystack.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function countMatches(haystack: string, regex: RegExp): number {
  return Array.from(haystack.matchAll(regex)).length;
}

function buildSignalScores(textLines: string[]): z.infer<typeof presentationAIContentSignalsSchema> {
  const haystack = textLines.join("\n");
  return {
    process: Number(includesKeyword(haystack, PROCESS_KEYWORDS)) * 4
      + countMatches(haystack, /\b(?:step|phase)\b/gi)
      + countMatches(haystack, /(?:ขั้นตอน|วิธี|เคล็ดลับ)/g),
    timeline: Number(includesKeyword(haystack, TIMELINE_KEYWORDS)) * 4
      + countMatches(haystack, /\b(?:q[1-4]|20\d{2})\b/gi),
    profile: Number(includesKeyword(haystack, PROFILE_KEYWORDS)) * 4,
    quote: Number(includesKeyword(haystack, QUOTE_KEYWORDS)) * 4
      + countMatches(haystack, /["“”]/g),
    metric: countMatches(haystack, /\b\d+(?:[.,]\d+)?(?:%|x|บาท|฿|\$|คน|ปี)?\b/g),
    contact: countMatches(haystack, /(?:@|https?:\/\/|www\.|\+?\d[\d\s-]{6,}|\bline\b|\bโทร\b)/gi),
  };
}

export function buildPresentationContentProfile(
  slide: Pick<AIPresentationSlide, "title" | "body" | "notes" | "sections" | "markdownHierarchy">,
): PresentationAIContentProfile {
  const bodyParagraphs: PresentationAIContentParagraph[] = slide.body
    .map((line, index) => normalizeText(line))
    .filter((line) => line.length > 0)
    .map((text, index) => ({
      id: `body-${index}`,
      text,
      chars: text.length,
      wordCount: countWords(text),
      isBullet: isBulletLine(text),
    }));

  const sections: PresentationAIContentSection[] = [];
  const sectionParagraphs: PresentationAIContentParagraph[] = [];
  for (const [sectionIndex, section] of (slide.sections ?? []).entries()) {
    const heading = normalizeText(section.heading);
    const detailIds: string[] = [];
    for (const [detailIndex, detail] of section.details.entries()) {
      const text = normalizeText(detail);
      if (!text) {
        continue;
      }
      const id = `section-${sectionIndex}-detail-${detailIndex}`;
      detailIds.push(id);
      sectionParagraphs.push({
        id,
        text,
        chars: text.length,
        wordCount: countWords(text),
        isBullet: isBulletLine(text),
      });
    }
    if (heading.length > 0) {
      sections.push({
        id: `section-${sectionIndex}`,
        heading,
        detailIds,
      });
    }
  }

  const paragraphs = [...bodyParagraphs, ...sectionParagraphs];
  const totalChars = paragraphs.reduce((sum, paragraph) => sum + paragraph.chars, 0);
  const totalWords = paragraphs.reduce((sum, paragraph) => sum + paragraph.wordCount, 0);
  const paragraphCount = paragraphs.length;
  const avgParagraphChars = paragraphCount > 0 ? totalChars / paragraphCount : 0;
  const maxParagraphChars = paragraphs.reduce((max, paragraph) => Math.max(max, paragraph.chars), 0);
  const longParagraphCount = paragraphs.filter((paragraph) => paragraph.chars >= 90).length;
  const headingCount = slide.markdownHierarchy?.filter((entry) => entry.level === "h2").length ?? 0;
  const subheadingCount = slide.markdownHierarchy?.filter((entry) => entry.level === "h3").length ?? 0;
  const bulletCount = paragraphs.filter((paragraph) => paragraph.isBullet).length;
  const sectionCount = sections.length;
  const notes = normalizeText(slide.notes);
  const textLines = [
    normalizeText(slide.title),
    notes,
    ...paragraphs.map((paragraph) => paragraph.text),
    ...sections.map((section) => section.heading),
  ].filter((line) => line.length > 0);
  const signals = buildSignalScores(textLines);
  const denseTextCandidate = totalChars >= 360
    || paragraphCount >= 6
    || longParagraphCount >= 1
    || (sectionCount >= 2 && totalChars >= 260);
  const visualFirstCandidate = totalChars <= 160
    && paragraphCount <= 3
    && sectionCount <= 1
    && signals.contact === 0
    && signals.profile === 0
    && (includesKeyword(textLines.join("\n"), VISUAL_FIRST_KEYWORDS) || notes.toLowerCase().includes("poster"));

  return {
    headingCount,
    subheadingCount,
    paragraphCount,
    bulletCount,
    sectionCount,
    totalChars,
    totalWords,
    avgParagraphChars,
    maxParagraphChars,
    longParagraphCount,
    denseTextCandidate,
    visualFirstCandidate,
    paragraphs,
    sections,
    signals,
  };
}

function evaluateFitStatus(
  mode: PresentationAILayoutMode,
  profile: PresentationAIContentProfile,
): "fits" | "cramped" | "unsafe" {
  switch (mode) {
    case "structured_block":
      if (profile.totalChars >= 520 || profile.paragraphCount >= 6) {
        return "unsafe";
      }
      if (profile.totalChars >= 340 || profile.longParagraphCount >= 1 || profile.sectionCount >= 2) {
        return "cramped";
      }
      return "fits";
    case "long_form_block":
      if (profile.totalChars >= 1_600 || profile.paragraphCount >= 14) {
        return "unsafe";
      }
      if (profile.totalChars >= 900 || profile.sectionCount >= 5) {
        return "cramped";
      }
      return "fits";
    case "llm_layout_dsl":
      return profile.sectionCount >= 4 || (profile.sectionCount >= 2 && profile.bulletCount >= 2) ? "fits" : "cramped";
    case "full_slide_media":
      if (profile.denseTextCandidate || profile.signals.contact > 0 || profile.signals.profile > 0) {
        return "unsafe";
      }
      return profile.visualFirstCandidate ? "fits" : "cramped";
  }
}

export function resolvePresentationLayoutMode(
  input: ResolvePresentationLayoutModeInput,
): ResolvePresentationLayoutModeResult {
  const profile = buildPresentationContentProfile(input.slide);
  const recentModes = input.previousModes?.slice(-3) ?? [];
  const fullSlideInRecentWindow = recentModes.filter((mode) => mode === "full_slide_media").length;
  const enabledModes: Record<PresentationAILayoutMode, boolean> = {
    structured_block: input.enabledModes?.structured_block ?? true,
    long_form_block: input.enabledModes?.long_form_block ?? false,
    llm_layout_dsl: input.enabledModes?.llm_layout_dsl ?? false,
    full_slide_media: input.enabledModes?.full_slide_media ?? false,
  };

  const scoreMap: Record<PresentationAILayoutMode, number> = {
    structured_block: 0,
    long_form_block: 0,
    llm_layout_dsl: 0,
    full_slide_media: 0,
  };
  const reasonMap: Record<PresentationAILayoutMode, string[]> = {
    structured_block: [],
    long_form_block: [],
    llm_layout_dsl: [],
    full_slide_media: [],
  };

  if (input.slideIndex === 0) {
    scoreMap.structured_block += 6;
    reasonMap.structured_block.push("Intro slides stay in structured mode for deck consistency.");
  }

  if (!profile.denseTextCandidate) {
    scoreMap.structured_block += 7;
    reasonMap.structured_block.push("Copy density fits compact structured layouts.");
  } else {
    scoreMap.structured_block -= 4;
    reasonMap.structured_block.push("Copy density is too high for compact blocks.");
  }

  if (profile.denseTextCandidate) {
    scoreMap.long_form_block += 10;
    reasonMap.long_form_block.push("Dense paragraphs and sections favor a long-form editable layout.");
  }
  if (profile.sectionCount >= 2) {
    scoreMap.long_form_block += 4;
    reasonMap.long_form_block.push("Multiple sections benefit from a text-heavy multi-section layout.");
  }
  if (profile.signals.profile > 0 || profile.signals.contact > 0) {
    scoreMap.long_form_block += 5;
    reasonMap.long_form_block.push("Profile/contact signals fit long-form boards better than compact cards.");
  }

  if (profile.sectionCount >= 4 || (profile.sectionCount >= 2 && profile.bulletCount >= 2 && profile.paragraphCount >= 5)) {
    scoreMap.llm_layout_dsl += 6;
    reasonMap.llm_layout_dsl.push("Mixed dense structure suggests a custom bounded layout may fit better.");
  }
  if (
    enabledModes.llm_layout_dsl
    && profile.sectionCount >= 4
    && profile.signals.metric < 2
    && profile.signals.timeline < 2
    && profile.signals.process < 2
  ) {
    scoreMap.llm_layout_dsl += 3;
    reasonMap.llm_layout_dsl.push("DSL mode gets an extra lift because multiple balanced sections do not map cleanly to the compact recipe set.");
  }

  if (profile.visualFirstCandidate) {
    scoreMap.full_slide_media += 8;
    reasonMap.full_slide_media.push("Short visual-first copy can support a poster or infographic treatment.");
  }
  if (profile.denseTextCandidate || profile.signals.contact > 0 || profile.signals.profile > 0) {
    scoreMap.full_slide_media -= 6;
    reasonMap.full_slide_media.push("Dense informational text should remain editable instead of image-first.");
  }
  if (fullSlideInRecentWindow >= 2) {
    scoreMap.full_slide_media -= 7;
    reasonMap.full_slide_media.push("Penalized by deck consistency because recent slides already used full-slide media.");
  }

  const candidates = PRESENTATION_AI_LAYOUT_MODES
    .map((mode): PresentationAILayoutModeCandidate => ({
      mode,
      score: Math.round(scoreMap[mode] * 100) / 100,
      fitStatus: evaluateFitStatus(mode, profile),
      reason: reasonMap[mode].length > 0 ? reasonMap[mode].join(" ") : "No strong signal.",
      ...(enabledModes[mode] ? {} : { blockedBy: "feature_flag" as const }),
    }))
    .sort((a, b) => b.score - a.score);

  const recommendedMode = candidates[0]?.mode ?? "structured_block";
  const availableCandidate = candidates.find((candidate) => enabledModes[candidate.mode]);

  return {
    mode: availableCandidate?.mode ?? "structured_block",
    recommendedMode,
    candidateModes: candidates,
    profile,
  };
}
