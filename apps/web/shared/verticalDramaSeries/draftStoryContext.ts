import { z } from "zod";
import {
  buildVerticalDramaDialogueLanguageProfilePrompt,
  readVerticalDramaDialogueLanguageProfile,
  resolveVerticalDramaSpokenLocale,
  type VerticalDramaDialogueLanguageProfile,
} from "./dialogueLanguageProfile";
import type { VerticalDramaSeriesLocale } from "./contracts";

/**
 * Story identity is intentionally separate from spoken language and from the
 * visual/casting region. English dialogue can be used in an American setting,
 * an international campus, or by an Asian international student in the US.
 * None of those facts should be inferred from the other one.
 */
export const VERTICAL_DRAMA_DRAFT_FACT_SOURCES = [
  "user_provided",
  "ai_inferred",
  "needs_creator_decision",
  "legacy_default",
] as const;

export const VERTICAL_DRAMA_DRAFT_FACT_CONFIDENCE = [
  "high",
  "medium",
  "low",
] as const;

export const verticalDramaDraftFactSchema = z
  .object({
    value: z.string().trim().min(1).max(300).optional(),
    source: z.enum(VERTICAL_DRAMA_DRAFT_FACT_SOURCES).optional(),
    confidence: z.enum(VERTICAL_DRAMA_DRAFT_FACT_CONFIDENCE).optional(),
    rationale: z.string().trim().max(500).optional(),
    alternatives: z.array(z.string().trim().min(1).max(160)).max(5).optional(),
  })
  .passthrough();

export type VerticalDramaDraftFact = z.infer<
  typeof verticalDramaDraftFactSchema
>;

export const verticalDramaDraftStoryContextSchema = z
  .object({
    contractVersion: z.literal(1).optional(),
    targetMarket: verticalDramaDraftFactSchema.optional(),
    storySetting: verticalDramaDraftFactSchema.optional(),
    leadBackground: verticalDramaDraftFactSchema.optional(),
    leadOrigin: verticalDramaDraftFactSchema.optional(),
    spokenDialogue: verticalDramaDraftFactSchema.optional(),
    namingPolicy: verticalDramaDraftFactSchema.optional(),
  })
  .passthrough();

export type VerticalDramaDraftStoryContext = z.infer<
  typeof verticalDramaDraftStoryContextSchema
>;

export const verticalDramaDraftDiagnosticSchema = z
  .object({
    code: z.string().trim().min(1).max(100),
    severity: z.enum(["info", "warning", "error", "blocking"]),
    message: z.string().trim().min(1).max(500),
    messageEn: z.string().trim().min(1).max(500).optional(),
    paths: z.array(z.string().trim().min(1).max(200)).max(12).optional(),
    repairable: z.boolean().optional(),
  })
  .passthrough();

export type VerticalDramaDraftDiagnostic = z.infer<
  typeof verticalDramaDraftDiagnosticSchema
>;

export function readVerticalDramaDraftStoryContext(
  value: unknown
): VerticalDramaDraftStoryContext | null {
  const parsed = verticalDramaDraftStoryContextSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readVerticalDramaDraftDiagnostics(
  value: unknown
): VerticalDramaDraftDiagnostic[] {
  const parsed = z
    .array(verticalDramaDraftDiagnosticSchema)
    .max(32)
    .safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function hasBlockingVerticalDramaDraftDiagnostics(
  diagnostics: readonly VerticalDramaDraftDiagnostic[] | null | undefined
): boolean {
  return (diagnostics ?? []).some(
    diagnostic =>
      diagnostic.severity === "blocking" || diagnostic.severity === "error"
  );
}

export function getVerticalDramaDraftFactValue(
  fact: VerticalDramaDraftFact | null | undefined
): string {
  return fact?.value?.trim() ?? "";
}

export function buildVerticalDramaDraftStoryContextPrompt(params: {
  locale: VerticalDramaSeriesLocale;
  dialogueLanguageProfile?: VerticalDramaDialogueLanguageProfile | null;
}): string {
  const profile = readVerticalDramaDialogueLanguageProfile(
    params.dialogueLanguageProfile
  );
  return [
    "STORY IDENTITY CONTEXT CONTRACT (ADDITIVE, HARD SEPARATION)",
    "Return a storyContext object that keeps target market, story setting, lead background, lead origin, spoken dialogue, and character naming policy as separate facts.",
    "Never infer character nationality, ethnicity, or origin from the narrative UI language, spoken language, title language, or target market alone.",
    "Target market means the intended audience/distribution market; storySetting means where the story takes place; leadBackground means the character's identity/background in the story; leadOrigin means the specific country/region only when the premise supports it.",
    "If the premise is broad or silent, keep the fact broad and set source to needs_creator_decision. Do not invent a country merely to make names look coherent.",
    "When a creator explicitly provides a setting, heritage, origin, name, or diaspora identity, preserve it with source user_provided and priority over all inferred defaults.",
    "Use this exact additive shape: storyContext:{contractVersion:1,targetMarket:{value,source,confidence,rationale},storySetting:{value,source,confidence,rationale},leadBackground:{value,source,confidence,rationale},leadOrigin:{value,source,confidence,rationale},spokenDialogue:{value,source,confidence,rationale},namingPolicy:{value,source,confidence,rationale}}.",
    buildVerticalDramaDialogueLanguageProfilePrompt({
      locale: params.locale,
      profile,
    }),
    "The dialogue profile governs spoken dialogue, subtitles, and TTS only. Narrative fields (title explanation, logline, mainPlot, seasonArc, creatorSummary, and character descriptions) must use the narrative/content language selected by the UI.",
  ].join(" ");
}

export function renderVerticalDramaDraftStoryContextBlock(
  value: unknown
): string | null {
  const context = readVerticalDramaDraftStoryContext(value);
  if (!context) return null;
  return [
    "APPROVED STORY IDENTITY CONTEXT (FACTS, DO NOT REINTERPRET)",
    "These facts are additive and independent: target market is not character nationality; spoken language is not narrative language.",
    JSON.stringify(context),
  ].join("\n");
}

export function getVerticalDramaDraftStoryContextDefaults(params: {
  locale: VerticalDramaSeriesLocale;
  dialogueLanguageProfile?: VerticalDramaDialogueLanguageProfile | null;
}): VerticalDramaDraftStoryContext {
  const profile = readVerticalDramaDialogueLanguageProfile(
    params.dialogueLanguageProfile
  );
  const spokenLocale = resolveVerticalDramaSpokenLocale({
    locale: params.locale,
    profile,
  });
  const spokenFact: VerticalDramaDraftFact = {
    value: spokenLocale,
    source:
      profile.spokenLocale && profile.spokenLocale !== "auto"
        ? "user_provided"
        : "ai_inferred",
    confidence:
      profile.spokenLocale && profile.spokenLocale !== "auto"
        ? "high"
        : "medium",
  };
  return {
    contractVersion: 1,
    spokenDialogue: spokenFact,
    targetMarket: {
      value: spokenLocale.startsWith("en-")
        ? "English-speaking market"
        : undefined,
      source: "ai_inferred",
      confidence: "low",
    },
    storySetting: { source: "needs_creator_decision", confidence: "low" },
    leadBackground: { source: "needs_creator_decision", confidence: "low" },
    leadOrigin: { source: "needs_creator_decision", confidence: "low" },
    namingPolicy: {
      value:
        "Use the established setting, heritage, and creator-supplied names; never infer nationality from language alone.",
      source: "ai_inferred",
      confidence: "high",
    },
  };
}
