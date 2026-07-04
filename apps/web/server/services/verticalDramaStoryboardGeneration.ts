/**
 * Vertical Drama Series — real storyboard-shotgrid generation for the
 * `storyboard_shotgrid` pipeline stage (spec feature 131 §11.5).
 *
 * Invokes the already-installed `vertical-drama-storyboard-shotgrid` skill
 * (imported from the external "storyboard-shotgrid-skill" package,
 * `apps/web/skills/vertical-drama-storyboard-shotgrid/`) via a direct
 * `executeWithFallback` LLM call — mirrors `verticalDramaStoryBible.ts`'s and
 * `verticalDramaEpisodeContinuation.ts`'s check-credits -> resolve-model ->
 * call -> validate -> deduct-credits convention exactly. This file does NOT
 * go through `skillExecutor.ts` (its `llm-only` branch does not itself call
 * an LLM for a headless/backend context — it only echoes a placeholder for
 * the chat-flow surface).
 *
 * `verticalDramaEpisodePipeline.ts`'s `runStage` is the only caller, and only
 * invokes this for non-dry-run/non-plan-only runner modes.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import { executeWithFallback } from "./llmRouter";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "./creditService";
import {
  resolveStoryBibleModel,
  extractJson,
  InsufficientCreditsError,
  VdSchemaValidationError,
} from "./verticalDramaStoryBible";

// Re-exported so callers only need to import from this one module.
export { InsufficientCreditsError, VdSchemaValidationError };

const SKILL_FOLDER_PATH = path.join("skills", "vertical-drama-storyboard-shotgrid");

let cachedSystemPrompt: string | null = null;

/**
 * Read the `vertical-drama-storyboard-shotgrid` skill's markdown body
 * (everything after the YAML frontmatter) verbatim, to use as the LLM system
 * prompt. Resolves the skill folder the same way `skillRegistry.ts` does
 * (`resolveSkillDirCandidates` / `resolveSkillManifestPath` from
 * `./skillFiles`), so it works regardless of the process's cwd.
 */
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
    `Could not locate skill.md for "vertical-drama-storyboard-shotgrid" under any known skills directory`,
  );
}

/* -------------------------------------------------------------------------- */
/* Output schema — mirrors schemas/output.schema.json's REQUIRED fields        */
/* -------------------------------------------------------------------------- */

/**
 * Preserve upstream snake_case fields exactly (no camelCase translation) —
 * the skill's own instructions require this. `.passthrough()` everywhere so
 * optional upstream fields (e.g. `emotion`, `location`, `lighting`,
 * `negative_prompt`) survive even though only the required subset is
 * strictly validated here.
 */
const storyboardCameraSchema = z
  .object({
    shot_type: z.string(),
    angle: z.string(),
    lens_feel: z.string(),
    movement: z.string(),
    composition: z.string(),
  })
  .passthrough();

const storyboardShotSchema = z
  .object({
    shot_number: z.number().int(),
    timecode: z.string().min(1),
    duration_seconds: z.number(),
    narrative_purpose: z.string().min(1),
    characters: z.array(z.string()),
    required_character_refs: z.array(z.string()),
    camera: storyboardCameraSchema,
    visual_description: z.string().min(1),
    image_prompt: z.string().min(1),
  })
  .passthrough();

export const storyboardShotgridOutputSchema = z
  .object({
    contract_version: z.literal(1).optional(),
    storyboard_summary: z.object({}).passthrough(),
    canonical_style_bible: z.object({}).passthrough(),
    shot_grid_plan: z.object({}).passthrough(),
    shots: z.array(storyboardShotSchema).length(9),
    plain_text_storyboard: z.string().min(1),
    storyboard_handoff_json: z.object({}).passthrough(),
  })
  .passthrough();

export type StoryboardShotgridOutput = z.infer<typeof storyboardShotgridOutputSchema>;

/* -------------------------------------------------------------------------- */
/* Prompt building                                                            */
/* -------------------------------------------------------------------------- */

export interface GenerateStoryboardShotgridParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  episodeId: number;
  episodeTitle: string;
  episodeNumber: number;
  locale: "th" | "en";
  durationSeconds: number;
  storySource: {
    logline?: string;
    keyBeats?: string[];
    mainPlot?: string;
    seasonArc?: string;
    tone?: string;
  };
  characters: Array<{ characterId: string; name: string; role: string | null }>;
}

function buildUserPrompt(params: GenerateStoryboardShotgridParams): string {
  const langInstruction =
    params.locale === "th"
      ? "Write all human-readable string values (summaries, narrative_purpose, visual_description, dialogue_excerpt, subtitle_text, plain_text_storyboard) in natural Thai."
      : "Write all human-readable string values in English.";

  const { storySource } = params;
  const characterLines = params.characters.length
    ? params.characters
        .map((c) => `- ${c.characterId}: ${c.name}${c.role ? ` (${c.role})` : ""}`)
        .join("\n")
    : "(no characters registered yet — invent minimal placeholder character ids consistent with the story context)";

  return [
    `Episode title: ${params.episodeTitle}`,
    `Episode number: ${params.episodeNumber}`,
    `Episode duration: ${params.durationSeconds} seconds`,
    langInstruction,
    storySource.logline ? `Logline: ${storySource.logline}` : null,
    storySource.mainPlot ? `Main plot: ${storySource.mainPlot}` : null,
    storySource.seasonArc ? `Season arc: ${storySource.seasonArc}` : null,
    storySource.tone ? `Tone: ${storySource.tone}` : null,
    storySource.keyBeats?.length ? `Key beats:\n${storySource.keyBeats.map((b) => `- ${b}`).join("\n")}` : null,
    `Characters (reference these ids in "characters" and "required_character_refs"):\n${characterLines}`,
    `Produce exactly 9 shots with duration_seconds summing to ${params.durationSeconds}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/* Generation entry point                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Generate the `storyboard_shotgrid` stage's real content via the
 * `vertical-drama-storyboard-shotgrid` skill, using a direct
 * `executeWithFallback` LLM call. Credit-gated (throws
 * `InsufficientCreditsError` before calling out) and schema-validated
 * (throws `VdSchemaValidationError` on a malformed LLM response) — mirrors
 * `generateStoryBible`'s check-credits -> call -> deduct-credits convention.
 */
export async function generateStoryboardShotgrid(
  params: GenerateStoryboardShotgridParams,
): Promise<{ storyboard: StoryboardShotgridOutput; creditsUsed: number; model: string }> {
  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveStoryBibleModel();
  const systemPrompt = loadSkillSystemPrompt();
  const userPrompt = buildUserPrompt(params);

  const result = await executeWithFallback({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: false,
    userId: params.userId,
    maxTokens: 4000,
    temperature: 0.8,
  });

  if (result.type !== "success") {
    throw new Error(
      result.type === "error"
        ? `LLM request failed: ${result.error}`
        : "LLM request did not reach a successful provider response",
    );
  }

  const content = result.response.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content);
  const validation = storyboardShotgridOutputSchema.safeParse(parsed);
  if (!validation.success) {
    throw new VdSchemaValidationError(
      "Storyboard shotgrid response failed schema validation",
      validation.error.issues,
    );
  }

  const usage = result.response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model,
  );

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: `Vertical Drama — generate storyboard (episode #${params.episodeId})`,
    sourceType: "skill",
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_series",
      seriesId: params.seriesId,
      episodeId: params.episodeId,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  return { storyboard: validation.data, creditsUsed, model };
}
