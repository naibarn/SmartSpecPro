import { buildCuteChildPrompt } from "../../skills/cute-child-image-generator/imported/runtime-example";
import {
  assertCanonicalGenerationRequest,
  type StoryboardCanonicalSkillResponse,
  type StoryboardGlobalInput,
  type StoryboardPlannedShot,
  storyboardCanonicalSkillResponseSchema,
} from "./storyboardSkillFrameworkContracts";

export const STORYBOARD_SINGLE_IMAGE_PROMPT_LOCK =
  "Create exactly one single vertical 9:16 image of one continuous scene. No collage, no grid, no contact sheet, no split screen, no multiple panels, no storyboard frames, no borders.";

export function ensureStoryboardSingleImagePrompt(prompt: string): string {
  const normalized = prompt.trim();
  if (!normalized) return normalized;
  return normalized.includes(STORYBOARD_SINGLE_IMAGE_PROMPT_LOCK)
    ? normalized
    : `${normalized}\n\n${STORYBOARD_SINGLE_IMAGE_PROMPT_LOCK}`;
}

function lockStoryboardImageResponse(
  response: StoryboardCanonicalSkillResponse
): StoryboardCanonicalSkillResponse {
  const prompt = ensureStoryboardSingleImagePrompt(
    response.result.generation_request.prompt
  );
  return assertCanonicalGenerationRequest({
    ...response,
    result: {
      ...response.result,
      generation_prompt: prompt,
      generation_request: {
        ...response.result.generation_request,
        prompt,
      },
    },
  });
}

const STORY_BEAT_DESCRIPTIONS: Record<string, string> = {
  setup: "Introduce the child character, setting, and the normal desire.",
  problem:
    "A clear, age-appropriate problem appears and changes the situation.",
  reaction: "Show the character's emotional reaction and make the goal clear.",
  detail: "Move closer to the problem and reveal an important visual clue.",
  attempt: "The character tries a plausible solution or discovers a new idea.",
  turning_point: "A visual turning point changes the direction of the story.",
  solution:
    "The solution is actively used while keeping character identity consistent.",
  result: "Show the warm payoff and the effect on the character or world.",
  ending: "Close emotionally with a memorable pose, lesson, or optional CTA.",
  resolution:
    "Resolve the central problem and close with a memorable emotional beat.",
  aftermath: "Show the consequence of the solution and let the story breathe.",
  secondary_payoff:
    "Add a coherent secondary payoff without changing the character identity.",
  final_cta:
    "Close with an emotional loop or an optional, story-appropriate CTA.",
};

const NARRATIVE_PATTERNS: Record<number, string[]> = {
  2: ["setup", "resolution"],
  3: ["setup", "problem", "resolution"],
  4: ["setup", "problem", "turning_point", "result"],
  5: ["setup", "problem", "reaction", "solution", "ending"],
  6: ["setup", "problem", "reaction", "detail", "turning_point", "resolution"],
  7: [
    "setup",
    "problem",
    "reaction",
    "detail",
    "attempt",
    "solution",
    "ending",
  ],
  8: [
    "setup",
    "problem",
    "reaction",
    "detail",
    "attempt",
    "turning_point",
    "solution",
    "result",
  ],
  9: [
    "setup",
    "problem",
    "reaction",
    "detail",
    "attempt",
    "turning_point",
    "solution",
    "result",
    "ending",
  ],
  10: [
    "setup",
    "problem",
    "reaction",
    "detail",
    "attempt",
    "turning_point",
    "solution",
    "result",
    "ending",
    "aftermath",
  ],
  11: [
    "setup",
    "problem",
    "reaction",
    "detail",
    "attempt",
    "turning_point",
    "solution",
    "result",
    "ending",
    "aftermath",
    "secondary_payoff",
  ],
  12: [
    "setup",
    "problem",
    "reaction",
    "detail",
    "attempt",
    "turning_point",
    "solution",
    "result",
    "ending",
    "aftermath",
    "secondary_payoff",
    "final_cta",
  ],
};

const SHOT_VARIATION_DIRECTIONS: Record<string, string> = {
  setup: "establish the stated activity and the characters' initial intention",
  problem:
    "introduce a small visible obstacle or change that affects the stated activity",
  reaction:
    "show a distinct emotional reaction while keeping the same story situation",
  detail:
    "focus on a concrete hand, object, food, or environmental detail involved in the activity",
  attempt:
    "show the characters trying a new step or a different part of the stated activity",
  turning_point: "make a clear action change the direction of the story",
  solution: "show the stated activity succeeding through an observable action",
  result: "show the immediate visual result and a warm interaction",
  ending:
    "close with a memorable, calm emotional interaction that completes the story",
  resolution:
    "resolve the stated activity with an observable successful action",
  aftermath:
    "show the consequence of the completed activity without changing the setting",
  secondary_payoff:
    "add one small coherent payoff that grows from the completed activity",
  final_cta:
    "end with a simple story-appropriate visual close rather than a text overlay",
};

export function buildStoryboardShotActivity(input: {
  baseActivity: string;
  beat: string;
  shotNumber: number;
  totalShots: number;
}): string {
  const baseActivity =
    input.baseActivity.trim() || "a natural child-safe activity";
  const direction =
    SHOT_VARIATION_DIRECTIONS[input.beat] ??
    "continue the stated activity with a new observable action";
  return `${baseActivity}. Shot ${input.shotNumber} of ${input.totalShots}: ${direction}. Do not repeat the previous shot's exact pose or action; preserve the same characters, setting, and story continuity.`;
}

export function buildStoryboardShotVariationInstruction(
  shot: StoryboardPlannedShot,
  language?: string
): string {
  const direction =
    SHOT_VARIATION_DIRECTIONS[shot.beat] ??
    "continue the stated activity with a new observable action";
  const dialogue =
    shot.dialogueLines.length > 0
      ? ` ${language ? `Spoken dialogue in ${language}` : "Spoken dialogue context"}: ${shot.dialogueLines.map(line => `${line.speaker}: ${line.text}`).join(" | ")}. Do not render dialogue as text.`
      : " No spoken dialogue; communicate the change through the visible action and expression.";
  return `Shot ${shot.shotNumber} (${shot.beat}) change: ${direction}.${dialogue}`;
}

export function buildStoryboardContinuationImagePrompt(
  input: StoryboardGlobalInput,
  shot: StoryboardPlannedShot
): string {
  return [
    STORYBOARD_SINGLE_IMAGE_PROMPT_LOCK,
    "Use the attached Shot 1 image as the canonical identity and scene reference.",
    "Keep exactly the same recognizable characters, facial identity, age, hair, clothing, props, setting, lighting, and visual style as Shot 1.",
    "Do not redesign the characters or scene, add or remove accessories, change wardrobe, or introduce new characters or locations.",
    buildStoryboardShotVariationInstruction(shot),
    `Keep a ${input.outputAspectRatio} child-eye-level composition and show one clear continuous moment. No text overlays or watermarks.`,
  ].join("\n");
}

function buildStoryboardContinuationImageResponse(
  input: StoryboardGlobalInput,
  shot: StoryboardPlannedShot
): StoryboardCanonicalSkillResponse {
  const prompt = buildStoryboardContinuationImagePrompt(input, shot);
  return lockStoryboardImageResponse(
    assertCanonicalGenerationRequest({
      success: true,
      result: {
        resolved: {},
        generation_prompt: prompt,
        generation_request: {
          prompt,
          aspect_ratio: input.outputAspectRatio,
          reference_images: [],
        },
        prompt_debug: {
          strategy: "shot_1_reference_continuation",
          referenceShotNumber: 1,
          skillCalled: false,
        },
      },
    })
  );
}

export function planStoryboardShots(
  input: StoryboardGlobalInput
): StoryboardPlannedShot[] {
  const shots: StoryboardPlannedShot[] = [];
  const pattern = NARRATIVE_PATTERNS[input.totalShots];
  for (let index = 0; index < input.totalShots; index += 1) {
    const beat = pattern?.[index] ?? `extended_${index + 1}`;
    const dialogueLines =
      input.storyType === "mime" || input.dialogueLines.length === 0
        ? []
        : [input.dialogueLines[index % input.dialogueLines.length]];
    shots.push({
      shotNumber: index + 1,
      beat,
      context: `${STORY_BEAT_DESCRIPTIONS[beat] ?? "Continue the story with a new coherent beat before the emotional ending."} Story idea: ${input.idea}${input.productContext ? ` Product context: ${input.productContext}` : ""}`,
      continuity:
        "Keep the same recognizable character, age, facial identity, and visual style as prior shots.",
      dialogueLines,
    });
  }
  return shots;
}

export function buildCuteChildPromptOnlyRequest(
  input: StoryboardGlobalInput,
  shot: StoryboardPlannedShot
): StoryboardCanonicalSkillResponse {
  const skillInputs = { ...input.skillInputs } as Record<string, unknown>;
  const references = Array.isArray(skillInputs.character_reference_images)
    ? skillInputs.character_reference_images
    : [];
  // Library character IDs are identity bindings, not media asset IDs. Only
  // managed reference assets may cross into the skill/provider boundary.
  const normalizedReferences = references;
  const result = buildCuteChildPrompt({
    ...skillInputs,
    idea: `${input.idea}\nShot ${shot.shotNumber} (${shot.beat}): ${shot.context}`,
    custom_activity: buildStoryboardShotActivity({
      baseActivity: String(skillInputs.custom_activity ?? ""),
      beat: shot.beat,
      shotNumber: shot.shotNumber,
      totalShots: input.totalShots,
    }),
    custom_notes:
      `${String(skillInputs.custom_notes ?? "")} ${shot.continuity} Shot variation: ${SHOT_VARIATION_DIRECTIONS[shot.beat] ?? "continue with a new observable action"}. ${shot.dialogueLines.length > 0 ? `Dialogue: ${shot.dialogueLines.map(line => `${line.speaker}: ${line.text}`).join(" | ")}` : "Mime/no spoken dialogue."}`.trim(),
    character_reference_images: normalizedReferences,
    aspect_ratio: input.outputAspectRatio,
  });
  return lockStoryboardImageResponse(
    assertCanonicalGenerationRequest(
      storyboardCanonicalSkillResponseSchema.parse({ success: true, result })
    )
  );
}

export function buildStoryboardVideoPrompt(input: {
  shot: StoryboardPlannedShot;
  imageAssetId: string;
  videoModelId: string;
  language: string;
}): string {
  return `Create a ${10}-second vertical 9:16 video using storyboard image asset ${input.imageAssetId} as the exact start frame. Preserve everything visible in that image, including character identity, age, hair, clothing, props, setting, lighting, and composition. Animate only this shot change: ${buildStoryboardShotVariationInstruction(input.shot, input.language)} Use natural child-safe motion with a clear beginning, middle, and end. Camera and motion should suit ${input.videoModelId}. Do not add text overlays or watermarks.`;
}

export type StoryboardPipelineDependencies = {
  promptOnly?: (
    input: StoryboardGlobalInput,
    shot: StoryboardPlannedShot
  ) => Promise<StoryboardCanonicalSkillResponse>;
  generateImage?: (request: {
    prompt: string;
    aspectRatio: string;
    modelId: string;
    quality?: string;
    referenceAssetIds: string[];
  }) => Promise<{ assetId: string }>;
};

export async function runStoryboardPromptPipeline(
  input: StoryboardGlobalInput,
  dependencies: StoryboardPipelineDependencies = {}
): Promise<
  Array<{
    shot: StoryboardPlannedShot;
    response: StoryboardCanonicalSkillResponse;
    imageAssetId?: string;
    videoPrompt?: string;
  }>
> {
  const promptOnly = dependencies.promptOnly ?? buildCuteChildPromptOnlyRequest;
  const output: Array<{
    shot: StoryboardPlannedShot;
    response: StoryboardCanonicalSkillResponse;
    imageAssetId?: string;
    videoPrompt?: string;
  }> = [];
  let anchorImageAssetId: string | undefined;
  for (const shot of planStoryboardShots(input)) {
    const response =
      shot.shotNumber === 1
        ? lockStoryboardImageResponse(
            assertCanonicalGenerationRequest(await promptOnly(input, shot))
          )
        : buildStoryboardContinuationImageResponse(input, shot);
    const item: (typeof output)[number] = { shot, response };
    if (dependencies.generateImage) {
      const referenceInputs = Array.isArray(
        input.skillInputs.character_reference_images
      )
        ? input.skillInputs.character_reference_images
        : [];
      const image = await dependencies.generateImage({
        prompt: response.result.generation_request.prompt,
        aspectRatio: response.result.generation_request.aspect_ratio,
        modelId: input.imageModelSelection.modelId,
        quality: input.imageModelSelection.quality,
        referenceAssetIds: [
          ...(anchorImageAssetId ? [anchorImageAssetId] : []),
          ...referenceInputs
            .filter((value): value is Record<string, unknown> =>
              Boolean(value && typeof value === "object")
            )
            .map(value => String(value.asset_id ?? ""))
            .filter(Boolean),
        ]
          .filter((value, index, all) => all.indexOf(value) === index)
          .slice(0, 5),
      });
      item.imageAssetId = image.assetId;
      if (shot.shotNumber === 1) anchorImageAssetId = image.assetId;
      item.videoPrompt = buildStoryboardVideoPrompt({
        shot,
        imageAssetId: image.assetId,
        videoModelId: input.videoModelSelection.modelId,
        language: input.language,
      });
    }
    output.push(item);
  }
  return output;
}
