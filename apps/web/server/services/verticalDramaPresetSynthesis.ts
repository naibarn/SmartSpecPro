/**
 * Vertical Drama Series — AI-assisted Mix and Match preset synthesis.
 *
 * Takes several selected preset/category "flavors" and returns one coherent
 * editable draft in the same shape the Create Series wizard already applies.
 * No database writes happen here; callers decide whether to apply the draft.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import {
  genrePresetCategoryLabel,
  verticalDramaLocaleEnglishName,
  clampToCreateSeriesLimit,
  CREATE_SERIES_FIELD_LIMITS,
  type VerticalDramaSeriesLocale,
} from "@shared/verticalDramaSeries";
import {
  hasEnoughCredits,
  deductCredits,
  calculateCreditsForLLM,
} from "./creditService";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import {
  executeJsonPlanningCallWithRetry,
  InsufficientCreditsError,
  resolveStoryBibleModel,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";

const SKILL_FOLDER_PATH = path.join("skills", "vertical-drama-preset-synthesizer");
const MIN_SELECTIONS = 2;
const MAX_SELECTIONS = 5;

let cachedSystemPrompt: string | null = null;

function loadSkillSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;

  for (const dir of resolveSkillDirCandidates(SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) {
        cachedSystemPrompt = content;
        return cachedSystemPrompt;
      }
    }
  }

  throw new Error(
    `Could not locate skill.md for "vertical-drama-preset-synthesizer" under any known skills directory`,
  );
}

const synthesizedCharacterSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  description: z.string().min(1),
});

const synthesizedWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

const synthesizedPresetDraftSchema = z.object({
  contract_version: z.literal(1),
  title: z.string().min(1).max(150),
  category: z.string().min(1).max(60),
  logline: z.string().min(1),
  mainPlot: z.string().min(1),
  seasonArc: z.string().min(1),
  tone: z.string().min(1).max(160),
  cliffhangerStyle: z.string().min(1).max(200),
  characters: z.array(synthesizedCharacterSchema).min(3).max(8),
  visualBible: z.string().min(1),
  mixRecipe: z
    .object({
      primaryFlavor: z.string().min(1),
      supportingFlavors: z.array(z.string().min(1)).min(1),
      rationale: z.string().min(1),
    })
    .passthrough(),
  warnings: z.array(synthesizedWarningSchema),
});

export type SynthesizedGenrePresetDraft = z.infer<typeof synthesizedPresetDraftSchema>;

export interface PresetSynthesisPresetInput {
  id: string;
  title: string;
  category: string;
  logline: string;
  mainPlot: string;
  seasonArc: string;
  tone: string;
  cliffhangerStyle: string;
  characters: Array<{ name: string; role: string; description: string }>;
  visualBible: string;
}

export interface SynthesizeVerticalDramaPresetParams {
  userId: number;
  tenantId?: string;
  locale: VerticalDramaSeriesLocale;
  selectedPresets: PresetSynthesisPresetInput[];
  selectedCategories: string[];
  primarySelectionId?: string;
  businessContext?: string;
  productContext?: string;
  targetEpisodeCount?: number;
  toneHint?: string;
}

export class PresetSynthesisInputError extends Error {
  code = "PRESET_SYNTHESIS_INPUT_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "PresetSynthesisInputError";
  }
}

function clampText(value: string | undefined, maxLength: number): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

/**
 * The Create Series wizard maps `draft.title` -> `genre` and `draft.tone` ->
 * `tone` verbatim (see CreateSeriesWizard.tsx `applyPresetDraft`). Those two
 * create-series input fields have stricter length limits than this schema's
 * own `title`/`tone` bounds, so an LLM output that is valid here can still be
 * too long for `verticalDramaSeriesRouter.create`. Clamp to the shared
 * create-series limits (belt) in addition to the skill prompt guidance
 * (suspenders) so the wizard never receives an unusable draft.
 */
export function clampDraftForCreateSeries(
  draft: SynthesizedGenrePresetDraft,
): { draft: SynthesizedGenrePresetDraft; clamped: boolean } {
  const clampedTitle = clampToCreateSeriesLimit(draft.title, "genre") ?? draft.title;
  const clampedTone = clampToCreateSeriesLimit(draft.tone, "tone") ?? draft.tone;
  const clamped = clampedTitle !== draft.title || clampedTone !== draft.tone;

  if (!clamped) {
    return { draft, clamped: false };
  }

  return {
    draft: {
      ...draft,
      title: clampedTitle,
      tone: clampedTone,
      warnings: [
        ...draft.warnings,
        {
          code: "preset_field_length_clamped",
          message:
            "AI output exceeded the Create Series field limits and was automatically shortened.",
        },
      ],
    },
    clamped: true,
  };
}

function buildUserPrompt(params: SynthesizeVerticalDramaPresetParams): string {
  const langInstruction =
    params.locale === "th"
      ? "Write ALL user-facing string values in natural Thai."
      : `Write all user-facing string values in ${verticalDramaLocaleEnglishName(params.locale)}.`;

  const selectedPresetSummaries = params.selectedPresets.map((preset) => ({
    id: preset.id,
    title: preset.title,
    category: preset.category,
    categoryLabel: genrePresetCategoryLabel(preset.category, params.locale === "th" ? "th" : "en"),
    logline: preset.logline,
    tone: preset.tone,
    cliffhangerStyle: preset.cliffhangerStyle,
    mainPlot: preset.mainPlot.slice(0, 1200),
    seasonArc: preset.seasonArc.slice(0, 900),
    visualBible: preset.visualBible.slice(0, 700),
    characterSeeds: preset.characters.slice(0, 5),
  }));

  const selectedCategories = params.selectedCategories.map((category) => ({
    category,
    label: genrePresetCategoryLabel(category, params.locale === "th" ? "th" : "en"),
  }));

  const primarySelectionId =
    params.primarySelectionId ||
    params.selectedPresets[0]?.id ||
    params.selectedCategories[0] ||
    "auto";

  const payload = {
    language: params.locale,
    selectedPresets: selectedPresetSummaries,
    selectedCategories,
    primarySelectionId,
    businessContext: clampText(params.businessContext, 600),
    productContext: clampText(params.productContext, 600),
    targetEpisodeCount: params.targetEpisodeCount ?? 10,
    toneHint: clampText(params.toneHint, 180),
    rules: [
      "Create one coherent preset draft, not a collage.",
      "Use one primary story spine and supporting flavors for situations, tone, and scene texture.",
      "Keep the result easy for a non-technical creator to edit.",
      "Product or service tie-in may help a scene, but must not magically solve the main conflict.",
      "Use compact JSON only.",
      `"title" MUST be at most ${CREATE_SERIES_FIELD_LIMITS.genre} characters (it fills the series genre field) — keep it short and punchy.`,
      `"tone" MUST be at most ${CREATE_SERIES_FIELD_LIMITS.tone} characters — a brief phrase, not a sentence.`,
    ],
  };

  return [
    langInstruction,
    "Synthesize a new Vertical Drama Series genre preset from this payload:",
    JSON.stringify(payload),
    "Return exactly this JSON shape:",
    '{"contract_version":1,"title":string,"category":string,"logline":string,"mainPlot":string,"seasonArc":string,"tone":string,"cliffhangerStyle":string,"characters":[{"name":string,"role":string,"description":string}],"visualBible":string,"mixRecipe":{"primaryFlavor":string,"supportingFlavors":[string],"rationale":string},"warnings":[{"code":string,"message":string}]}',
    VD_COMPACT_JSON_INSTRUCTION,
  ].join("\n");
}

export function validatePresetSynthesisSelection(params: {
  selectedPresets: unknown[];
  selectedCategories: string[];
}) {
  const total = params.selectedPresets.length + uniqueStrings(params.selectedCategories).length;
  if (total < MIN_SELECTIONS) {
    throw new PresetSynthesisInputError("Select at least 2 story flavors for Mix and Match");
  }
  if (total > MAX_SELECTIONS) {
    throw new PresetSynthesisInputError("Select up to 5 story flavors for Mix and Match");
  }
}

export async function synthesizeVerticalDramaPreset(
  params: SynthesizeVerticalDramaPresetParams,
): Promise<{ draft: SynthesizedGenrePresetDraft; creditsUsed: number; model: string }> {
  const selectedCategories = uniqueStrings(params.selectedCategories);
  validatePresetSynthesisSelection({
    selectedPresets: params.selectedPresets,
    selectedCategories,
  });

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveStoryBibleModel();
  const systemPrompt = loadSkillSystemPrompt();
  const userPrompt = buildUserPrompt({ ...params, selectedCategories });

  const { data: synthesizedDraft, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.75,
    userId: params.userId,
    maxTokens: 4500,
    schema: synthesizedPresetDraftSchema,
    label: "Preset synthesis",
  });

  const { draft } = clampDraftForCreateSeries(synthesizedDraft);

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model,
  );

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: "Vertical Drama — synthesize mix-and-match preset",
    sourceType: "skill",
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_preset_synthesis",
      selectedPresetIds: params.selectedPresets.map((preset) => preset.id),
      selectedCategories,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  return { draft, creditsUsed, model };
}
