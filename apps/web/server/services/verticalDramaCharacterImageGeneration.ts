/**
 * Vertical Drama Series — character reference-image PROMPT generation
 * (spec feature 131, section-05/section-11 follow-up).
 *
 * Wraps the already-installed, already-adapted
 * `apps/web/skills/vertical-drama-character-visual-bible` skill (an
 * `execution_mode: llm-only` skill whose markdown body is a system prompt,
 * not a chat-flow skill) into a direct, credit-gated LLM call — mirroring
 * `verticalDramaStoryBible.ts`'s check-credits -> call -> deduct-credits
 * convention exactly (that file is the canonical pattern for a real backend
 * LLM call in this codebase; `skillExecutor.ts`'s `llm-only` branch is
 * chat-flow-only and does NOT actually call an LLM here).
 *
 * This module only produces IMAGE-GENERATION PROMPTS (a portrait prompt +
 * negative prompt, plus the full validated visual-bible payload for
 * storage/audit). It does NOT call the image-rendering pipeline — that is
 * a separate, separately-credited call the caller (the tRPC router) makes
 * against `mediaGenerationService`.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import { executeWithFallback } from "./llmRouter";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "./creditService";
import {
  extractJson,
  InsufficientCreditsError,
  VdSchemaValidationError,
  resolveStoryBibleModel,
} from "./verticalDramaStoryBible";

export { InsufficientCreditsError, VdSchemaValidationError };

const SKILL_SLUG = "vertical-drama-character-visual-bible";

/* -------------------------------------------------------------------------- */
/* System prompt loading — the skill.md body (after frontmatter), verbatim.   */
/* -------------------------------------------------------------------------- */

let cachedSystemPrompt: string | null = null;

/**
 * Load the `vertical-drama-character-visual-bible` skill's markdown body
 * (everything after the YAML frontmatter) to use verbatim as the system
 * prompt. Tries both possible working-directory roots (repo root vs
 * `apps/web`), matching the fallback-path convention already used in
 * `server/routers/skills.ts` for disk-sourced skill content. Cached after
 * first successful read.
 */
function loadCharacterVisualBibleSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;

  const candidates = [
    path.resolve(process.cwd(), "skills", SKILL_SLUG, "skill.md"),
    path.resolve(process.cwd(), "apps/web/skills", SKILL_SLUG, "skill.md"),
  ];
  const sourcePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!sourcePath) {
    throw new Error(
      `Vertical Drama character visual bible skill.md not found (checked: ${candidates.join(", ")})`,
    );
  }

  const raw = fs.readFileSync(sourcePath, "utf-8");
  const { content } = parseSkillFile(raw);
  if (!content || !content.trim()) {
    throw new Error(`Vertical Drama character visual bible skill.md at ${sourcePath} has no content body`);
  }
  cachedSystemPrompt = content;
  return cachedSystemPrompt;
}

/* -------------------------------------------------------------------------- */
/* Output schema — minimum viable validation (required fields only).         */
/* -------------------------------------------------------------------------- */

const characterVisualBibleCharacterSchema = z
  .object({
    character_id: z.string().min(1),
    name: z.string().min(1),
    visual_identity_summary: z.string().min(1),
    primary_portrait_prompt: z.string().min(1),
    negative_prompt: z.string().optional(),
    attachment_package: z.array(z.record(z.string(), z.unknown())).min(1),
  })
  .passthrough();

const characterVisualBibleOutputSchema = z
  .object({
    visual_bible_summary: z.record(z.string(), z.unknown()),
    characters: z.array(characterVisualBibleCharacterSchema).min(1),
    plain_text_summary: z.string().min(1),
    storyboard_attachment_manifest: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export type CharacterVisualBibleOutput = z.infer<typeof characterVisualBibleOutputSchema>;
export type CharacterVisualBibleCharacter = z.infer<typeof characterVisualBibleCharacterSchema>;

/* -------------------------------------------------------------------------- */
/* User-prompt construction — matches schemas/input.schema.json's shape       */
/* (`story_context` is a STRING per that schema, not an object).              */
/* -------------------------------------------------------------------------- */

interface StoryContextFields {
  title?: string;
  genre?: string;
  tone?: string;
}

function buildStoryContextString(ctx?: StoryContextFields): string {
  if (!ctx) return "No additional story context provided.";
  const parts = [
    ctx.title ? `Series title: ${ctx.title}` : null,
    ctx.genre ? `Genre: ${ctx.genre}` : null,
    ctx.tone ? `Tone: ${ctx.tone}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" | ") : "No additional story context provided.";
}

export interface GenerateCharacterVisualPromptsParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  /** Numeric `verticalDramaCharacters.id` row id (credit-transaction / audit metadata only). */
  characterId: number;
  /** Stable app-level character key (`verticalDramaCharacters.characterKey`) — sent as the
   *  skill's `character_id` so the returned character can be correlated back. */
  characterKey: string;
  name: string;
  role: string | null;
  description?: string | null;
  storyContext?: StoryContextFields;
}

function buildUserPrompt(params: GenerateCharacterVisualPromptsParams): string {
  const inputPayload = {
    characters: [
      {
        character_id: params.characterKey,
        name: params.name,
        role: params.role ?? "supporting",
        ...(params.description ? { description: params.description } : {}),
      },
    ],
    story_context: buildStoryContextString(params.storyContext),
    output_options: {
      include_image_generation_prompts: true,
      include_plain_text_summary: true,
      include_storyboard_attachment_manifest: true,
      generate_primary_portrait_prompt: true,
    },
  };

  return [
    "Generate the character visual bible for exactly ONE character using the following input",
    "(matches this skill's schemas/input.schema.json shape):",
    JSON.stringify(inputPayload, null, 2),
    "Return ONLY the JSON object described in your instructions — no markdown fences, no commentary.",
  ].join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Model resolution — reuse the story-bible resolver (generic "best model     */
/* with structured-output support" selection, not story-bible-specific).     */
/* -------------------------------------------------------------------------- */

export const resolveCharacterVisualBibleModel = resolveStoryBibleModel;

/* -------------------------------------------------------------------------- */
/* Main entry point                                                           */
/* -------------------------------------------------------------------------- */

export interface GenerateCharacterVisualPromptsResult {
  portraitPrompt: string;
  negativePrompt: string | undefined;
  raw: CharacterVisualBibleOutput;
  creditsUsed: number;
  model: string;
}

/**
 * Generate a character's image-generation prompt pack (primary portrait
 * prompt + negative prompt, plus the full validated visual-bible payload)
 * via a real LLM call using the `vertical-drama-character-visual-bible`
 * skill's markdown body as the system prompt. Credit-gated (throws
 * `InsufficientCreditsError` before calling out) and schema-validated
 * (throws `VdSchemaValidationError` on a malformed LLM response) — mirrors
 * `generateStoryBible`'s check-credits -> call -> deduct-credits convention.
 *
 * This does NOT render an image — it only produces the prompt. Image
 * rendering (and its own separate credit charge) is the caller's
 * responsibility via `mediaGenerationService`.
 */
export async function generateCharacterVisualPrompts(
  params: GenerateCharacterVisualPromptsParams,
): Promise<GenerateCharacterVisualPromptsResult> {
  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveCharacterVisualBibleModel();
  const systemPrompt = loadCharacterVisualBibleSystemPrompt();
  const userPrompt = buildUserPrompt(params);

  const result = await executeWithFallback({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: false,
    userId: params.userId,
    maxTokens: 3500,
    temperature: 0.7,
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
  const validation = characterVisualBibleOutputSchema.safeParse(parsed);
  if (!validation.success) {
    throw new VdSchemaValidationError(
      "Character visual bible response failed schema validation",
      validation.error.issues,
    );
  }

  const characters = validation.data.characters;
  const matched =
    characters.find((c) => c.character_id === params.characterKey) ?? characters[0];

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
    description: `Vertical Drama — generate character visual prompts (character #${params.characterId})`,
    sourceType: "skill",
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_character_visual_bible",
      seriesId: params.seriesId,
      characterId: params.characterId,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  return {
    portraitPrompt: matched.primary_portrait_prompt,
    negativePrompt: matched.negative_prompt,
    raw: validation.data,
    creditsUsed,
    model,
  };
}
