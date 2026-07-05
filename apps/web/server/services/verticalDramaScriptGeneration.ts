/**
 * Vertical Drama Series — real episode-script generation for the
 * `plan_episode_script` pipeline stage (spec feature 131 §11.5).
 *
 * Invokes the already-installed `vertical-drama-script-builder` skill
 * (`apps/web/skills/vertical-drama-script-builder/`) via a direct
 * `executeWithFallback` LLM call — mirrors
 * `verticalDramaStoryboardGeneration.ts`'s check-credits -> resolve-model ->
 * call -> validate -> deduct-credits convention exactly (same skill-loading
 * helper shape, same error classes reused from `verticalDramaStoryBible.ts`).
 *
 * Before this file existed, `plan_episode_script` had NO real-generation path
 * at all — `buildStagePayload`'s placeholder ("Dry-run hook" / camelCase
 * `episodeTitle`/`sceneDialogueSummary`/etc., not even matching the skill's
 * real snake_case output shape) was returned unconditionally for every
 * runner mode. `verticalDramaEpisodePipeline.ts`'s `runStage` is the only
 * caller, and only invokes this for non-dry-run/non-plan-only modes.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import { executeWithFallback } from "./llmRouter";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "./skillFiles";
import {
  hasEnoughCredits,
  deductCredits,
  calculateCreditsForLLM,
} from "./creditService";
import { mediaGenerationLimiter } from "./rateLimiter";
import {
  resolveStoryBibleModel,
  extractJson,
  InsufficientCreditsError,
  VdSchemaValidationError,
} from "./verticalDramaStoryBible";

export { InsufficientCreditsError, VdSchemaValidationError };

const SKILL_FOLDER_PATH = path.join("skills", "vertical-drama-script-builder");

let cachedSystemPrompt: string | null = null;

/** Mirrors `verticalDramaStoryboardGeneration.ts`'s `loadSkillSystemPrompt`. */
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
    `Could not locate skill.md for "vertical-drama-script-builder" under any known skills directory`
  );
}

/* -------------------------------------------------------------------------- */
/* Output schema — mirrors schemas/output.schema.json's REQUIRED fields        */
/* -------------------------------------------------------------------------- */

export const scriptBuilderOutputSchema = z
  .object({
    contract_version: z.literal(1),
    episode_title: z.string().min(1),
    hook: z.string().min(1),
    structure: z.object({}).passthrough(),
    scene_dialogue_summary: z.array(z.object({}).passthrough()),
    cliffhanger: z.string(),
    character_state_deltas: z.array(z.object({}).passthrough()),
    product_tie_in_plan: z.object({}).passthrough(),
    continuity_notes: z.array(z.string()),
    warnings: z.array(z.object({}).passthrough()),
    repair_queue: z.array(z.object({}).passthrough()),
  })
  .passthrough();

export type ScriptBuilderOutput = z.infer<typeof scriptBuilderOutputSchema>;

/* -------------------------------------------------------------------------- */
/* Prompt building                                                            */
/* -------------------------------------------------------------------------- */

export interface GenerateEpisodeScriptParams {
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
  characters: Array<{
    characterId: string;
    name: string;
    role: string | null;
  }>;
}

function buildUserPrompt(params: GenerateEpisodeScriptParams): string {
  const langInstruction =
    params.locale === "th"
      ? "Write all human-readable string values (hook, scene summaries, dialogue lines, cliffhanger, continuity_notes) in natural Thai."
      : "Write all human-readable string values in English.";

  const { storySource } = params;
  const characterLines = params.characters.length
    ? params.characters
        .map(c => `- ${c.characterId}: ${c.name}${c.role ? ` (${c.role})` : ""}`)
        .join("\n")
    : "(no characters registered yet — invent minimal placeholder character ids consistent with the story context)";

  const storyBrief = [
    storySource.logline ? `Logline: ${storySource.logline}` : null,
    storySource.mainPlot ? `Main plot: ${storySource.mainPlot}` : null,
    storySource.seasonArc ? `Season arc: ${storySource.seasonArc}` : null,
    storySource.tone ? `Tone: ${storySource.tone}` : null,
    storySource.keyBeats?.length
      ? `Key beats:\n${storySource.keyBeats.map(b => `- ${b}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    `story_title: ${params.episodeTitle}`,
    `story_brief:\n${storyBrief || "(no series bible detail available yet — invent a reasonable brief consistent with the episode title)"}`,
    `episode_number: ${params.episodeNumber}`,
    `duration_seconds: ${params.durationSeconds}`,
    langInstruction,
    `characters:\n${characterLines}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Generation entry point                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Generate the `plan_episode_script` stage's real content via the
 * `vertical-drama-script-builder` skill, using a direct `executeWithFallback`
 * LLM call. Credit-gated and schema-validated — mirrors
 * `generateStoryboardShotgrid`'s convention exactly.
 */
export async function generateEpisodeScript(
  params: GenerateEpisodeScriptParams
): Promise<{
  script: ScriptBuilderOutput;
  creditsUsed: number;
  model: string;
}> {
  const rateLimitKey = `user:${params.userId}`;
  if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
    throw new Error(
      `Rate limit exceeded for script generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`
    );
  }

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
        : "LLM request did not reach a successful provider response"
    );
  }

  const content = result.response.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content);
  const validation = scriptBuilderOutputSchema.safeParse(parsed);
  if (!validation.success) {
    throw new VdSchemaValidationError(
      "Episode script response failed schema validation",
      validation.error.issues
    );
  }

  const usage = result.response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model
  );

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: `Vertical Drama — generate episode script (episode #${params.episodeId})`,
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

  return { script: validation.data, creditsUsed, model };
}
