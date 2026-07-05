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
  executeJsonPlanningCallWithRetry,
  InsufficientCreditsError,
  VdSchemaValidationError,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";

// Re-exported so callers only need to import from this one module.
export { InsufficientCreditsError, VdSchemaValidationError };

/**
 * Thrown when the per-user `mediaGenerationLimiter` rejects a storyboard
 * generation call. `verticalDramaEpisodePipeline.ts`'s
 * `mapStoryboardGenerationError` does not special-case this (by design — we
 * do not touch that file here); it falls through to that mapper's generic
 * `VD_STORYBOARD_GENERATION_FAILED` / `repairable: true` branch, which is an
 * accurate, safe classification for a transient rate-limit condition (the
 * caller can simply retry the stage later).
 */
export class RateLimitExceededError extends Error {
  code = "VD_RATE_LIMIT_EXCEEDED" as const;
  constructor(retryAfterMs: number) {
    super(
      `Rate limit exceeded for storyboard generation. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`
    );
    this.name = "RateLimitExceededError";
  }
}

const SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-storyboard-shotgrid"
);

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
    `Could not locate skill.md for "vertical-drama-storyboard-shotgrid" under any known skills directory`
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

/**
 * Per-character acting direction (Phase 3B narrative-quality superset) — the
 * skill may emit either an object keyed by `character_id` (multi-character
 * shots) or a plain string (single focal character). Optional so shots
 * generated before this rule existed still validate unchanged.
 */
const storyboardActingDirectionSchema = z.union([
  z.string(),
  z.record(z.string(), z.string()),
]);

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
    /** Optional narrative-quality superset — see skill.md "Emotional & acting direction". */
    facial_expression: storyboardActingDirectionSchema.optional(),
    body_language: storyboardActingDirectionSchema.optional(),
    gaze_direction: storyboardActingDirectionSchema.optional(),
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

export type StoryboardShotgridOutput = z.infer<
  typeof storyboardShotgridOutputSchema
>;

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
  /**
   * The episode's own scene-by-scene breakdown from the `plan_episode_script`
   * stage (`scene_dialogue_summary`) — far more concrete than
   * `storySource.keyBeats` (which is only a handful of one-line season-bible
   * beats shared loosely across the whole episode). Without this, the
   * shotgrid LLM has nothing to ground the 9 shots in beyond a one-line
   * logline, and tends to invent generic mood shots (e.g. "hands and a ring
   * symbol") that don't correspond to anything the episode's actual script
   * says happens. Optional — an episode generated before the script stage
   * existed, or whose script stage hasn't run yet, has none.
   */
  sceneBeats?: Array<{
    scene?: number;
    location?: string;
    summary?: string;
    keyLine?: string;
  }>;
  /**
   * `referenceImageUrl` closes an upstream parity gap: the pinned
   * `storyboard-shotgrid-skill`'s `skill.json` is explicitly
   * `"character_reference_driven": true` ("using character reference images
   * as the primary identity lock"), and its input schema requires
   * `character_assets[].reference_images`. Without this field the LLM has
   * nothing to ground `required_character_refs`/`image_prompt` in beyond a
   * name string. Optional because a character may not have an approved
   * portrait yet — the skill still produces a storyboard, just without a
   * visual anchor for that character.
   */
  characters: Array<{
    characterId: string;
    name: string;
    role: string | null;
    referenceImageUrl?: string | null;
  }>;
}

function buildUserPrompt(params: GenerateStoryboardShotgridParams): string {
  const langInstruction =
    params.locale === "th"
      ? "Write all human-readable string values (summaries, narrative_purpose, visual_description, dialogue_excerpt, subtitle_text, plain_text_storyboard) in natural Thai."
      : "Write all human-readable string values in English.";

  const { storySource } = params;
  const charactersWithRef = params.characters.filter(c => c.referenceImageUrl);
  const characterLines = params.characters.length
    ? params.characters
        .map(c => {
          const refNote = c.referenceImageUrl
            ? " [has an approved reference image — identity lock applies]"
            : "";
          return `- ${c.characterId}: ${c.name}${c.role ? ` (${c.role})` : ""}${refNote}`;
        })
        .join("\n")
    : "(no characters registered yet — invent minimal placeholder character ids consistent with the story context)";
  const identityLockInstruction = charactersWithRef.length
    ? `Identity lock: ${charactersWithRef.map(c => c.characterId).join(", ")} ${
        charactersWithRef.length === 1 ? "has" : "have"
      } an approved reference image attached below. List them in "required_character_refs" for every shot they appear in, and write each "image_prompt" so a downstream image model can keep face, hair, and wardrobe consistent with that reference — do not invent a different appearance for these characters.`
    : null;

  const sceneBeatLines = params.sceneBeats?.length
    ? params.sceneBeats
        .map(s => {
          const parts = [
            s.scene != null ? `Scene ${s.scene}` : null,
            s.location ? `@ ${s.location}` : null,
          ]
            .filter(Boolean)
            .join(" ");
          const line = s.keyLine ? ` | line: "${s.keyLine}"` : "";
          return `- ${parts}: ${s.summary}${line}`;
        })
        .join("\n")
    : null;
  const sceneBeatInstruction = sceneBeatLines
    ? `Episode scenes (this is what ACTUALLY happens in this episode's script — ground every shot in these, in order; do not invent generic mood shots disconnected from this list):\n${sceneBeatLines}\nDistribute the 9 shots across these scenes in order (multiple shots may cover the same scene). For any shot depicting a scene that has a "line", use that exact line (translated/adapted only if needed for length) as the shot's "dialogue_excerpt" and a short version as "subtitle_text" — do not invent unrelated dialogue.`
    : null;

  return [
    `Episode title: ${params.episodeTitle}`,
    `Episode number: ${params.episodeNumber}`,
    `Episode duration: ${params.durationSeconds} seconds`,
    langInstruction,
    storySource.logline ? `Logline: ${storySource.logline}` : null,
    storySource.mainPlot ? `Main plot: ${storySource.mainPlot}` : null,
    storySource.seasonArc ? `Season arc: ${storySource.seasonArc}` : null,
    storySource.tone ? `Tone: ${storySource.tone}` : null,
    storySource.keyBeats?.length
      ? `Key beats:\n${storySource.keyBeats.map(b => `- ${b}`).join("\n")}`
      : null,
    sceneBeatInstruction,
    `Characters (reference these ids in "characters" and "required_character_refs"):\n${characterLines}`,
    `Produce exactly 9 shots with duration_seconds summing to ${params.durationSeconds}.`,
    VD_COMPACT_JSON_INSTRUCTION,
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
  params: GenerateStoryboardShotgridParams
): Promise<{
  storyboard: StoryboardShotgridOutput;
  creditsUsed: number;
  model: string;
}> {
  // Rate limiting — reuses the shared `mediaGenerationLimiter` (this is a
  // paid LLM call, same per-user cap as `media.ts`'s generation mutations).
  // Checked first, before the credit check / LLM call.
  const rateLimitKey = `user:${params.userId}`;
  if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
    throw new RateLimitExceededError(
      mediaGenerationLimiter.getResetTime(rateLimitKey)
    );
  }

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveStoryBibleModel();
  const systemPrompt = loadSkillSystemPrompt();
  const userPrompt = buildUserPrompt(params);

  // Higher than sibling skills' 3500-4000 (see verticalDramaStoryBible.ts,
  // verticalDramaStartFrameGeneration.ts) — this schema is the largest of
  // the four imported skills: 9 fully-detailed shots (camera object,
  // dialogue, image_prompt, negative_prompt, per-character
  // facial_expression/body_language/gaze_direction, etc.) PLUS a second,
  // near-duplicate `shots` array inside `storyboard_handoff_json`. Raised
  // from 8000 to 16000 after a live failure post-Phase-3B (per-character
  // acting-direction fields added ~22k+ chars of output): a 8000-token cap
  // truncated the JSON mid-array (`LLM response was not valid JSON:
  // Expected ',' or ']' after array element ... position 22166`). Shares the
  // same one-retry-on-truncated/invalid-JSON safety net as the sibling
  // start-frame/motion-prompt/script generators — see
  // `executeJsonPlanningCallWithRetry`'s doc comment.
  const { data: storyboardData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.8,
    userId: params.userId,
    maxTokens: 16000,
    schema: storyboardShotgridOutputSchema,
    label: "Storyboard shotgrid",
  });

  // Normalize `characters` / `required_character_refs` per shot — the LLM is
  // told to reference the exact `characterId`s listed in the prompt (see
  // `buildUserPrompt`'s "reference these ids" instruction), but in practice
  // it sometimes invents its own slug instead (observed live: emitting
  // "character-pimpwipa" / "pimpwipa_primary_portrait.png" for a character
  // whose real `characterId` was just "character"). Any value that isn't
  // one of the real ids is useless downstream — it can never match a
  // `verticalDramaCharacterAssets` row or the UI's character-chip lookup, so
  // the reference image feature silently does nothing for that shot. Fix by
  // (a) keeping only LLM-emitted values that ARE real ids, and (b) adding
  // any real character whose actual name is mentioned directly in the
  // shot's Thai/English narrative text, which the model reliably writes
  // even when it gets the id field wrong.
  const validCharacterIds = new Set(params.characters.map(c => c.characterId));
  for (const shot of storyboardData.shots) {
    const shotRecord = shot as unknown as Record<string, unknown>;
    const narrativeText = [
      shotRecord.action,
      shot.narrative_purpose,
      shot.visual_description,
      shotRecord.dialogue_excerpt,
      shotRecord.subtitle_text,
    ]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join(" ");
    const nameMatches = params.characters
      .filter(c => narrativeText.includes(c.name))
      .map(c => c.characterId);
    const validLlmIds = [...shot.characters, ...shot.required_character_refs].filter(
      id => validCharacterIds.has(id),
    );
    const resolvedIds = Array.from(new Set([...nameMatches, ...validLlmIds]));
    shot.characters = resolvedIds;
    shot.required_character_refs = resolvedIds;
  }

  // Identity-lock plumbing (upstream parity — see the `referenceImageUrl` doc
  // comment on `GenerateStoryboardShotgridParams` above): the LLM has no way
  // to know real media-asset URLs, so `character_attachment_manifest` is
  // rebuilt here from ground truth rather than trusting whatever the model
  // guessed. This is what a downstream image-render stage would read to
  // attach the right reference image per shot.
  const charactersWithRef = params.characters.filter(
    (c): c is typeof c & { referenceImageUrl: string } =>
      Boolean(c.referenceImageUrl)
  );
  if (charactersWithRef.length > 0) {
    const existingHandoff = (storyboardData.storyboard_handoff_json ??
      {}) as Record<string, unknown>;
    storyboardData.storyboard_handoff_json = {
      ...existingHandoff,
      character_attachment_manifest: charactersWithRef.map(c => ({
        character_id: c.characterId,
        name: c.name,
        reference_image_url: c.referenceImageUrl,
      })),
    };
  }

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model
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

  return { storyboard: storyboardData, creditsUsed, model };
}
