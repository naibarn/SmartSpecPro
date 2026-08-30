import crypto from "crypto";

import type { Message } from "../_core/llm";
import {
  getSkillByIdAsync,
  syncSingleSkillIfChanged,
} from "./skillRegistry";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
import { executeSkillLlmWithFallback } from "./skillModelFallback";
import { settleSkillRun } from "./skillRevenueBilling";

export const CHARACTER_CANDIDATE_PROMPT_SKILL_ID = "character-candidate-prompt";
export const CHARACTER_CANDIDATE_PROMPT_MAX_REFERENCES = 6;
export const CHARACTER_CANDIDATE_PROMPT_MAX_OUTPUT_CHARS = 12_000;
export const CHARACTER_CANDIDATE_SINGLE_IMAGE_RENDER_DIRECTIVE =
  "For this individual image-generation task, create exactly one single image only: no collage, grid, contact sheet, split screen, multi-panel composition, labels, numbers, or text in the image. Show one new fictional casting person, not the person in any reference image.";

export const CHARACTER_CANDIDATE_CAMERA_FRAMINGS = [
  "full_body",
  "three_quarter",
  "half_body",
  "medium_close_up",
  "close_up",
  "extreme_close_up",
  "wide_environmental",
] as const;

export type CharacterCandidateCameraFraming =
  (typeof CHARACTER_CANDIDATE_CAMERA_FRAMINGS)[number];
export type CharacterCandidatePoseMode = "auto_natural" | "lock_reference";

export interface CharacterCandidatePromptInput {
  referenceImages: string[];
  imageCount: 1 | 2 | 3 | 4 | 5;
  genderPresentation: string;
  ethnicity: string;
  ageMin: number;
  ageMax: number;
  lockClothing: boolean;
  poseMode: CharacterCandidatePoseMode;
  cameraFraming: CharacterCandidateCameraFraming;
  additionalInstructions?: string;
}

export interface CharacterCandidatePromptRunParams
  extends CharacterCandidatePromptInput {
  userId: number;
  tenantId: string;
  runId?: string;
  model?: string | null;
}

export interface CharacterCandidatePromptRunResult {
  prompt: string;
  modelId: string | null;
  creditsUsed: number;
  runId: string;
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueReferences(referenceImages: readonly string[]): string[] {
  return Array.from(
    new Set(
      referenceImages
        .map(cleanString)
        .filter(Boolean)
        .slice(0, CHARACTER_CANDIDATE_PROMPT_MAX_REFERENCES),
    ),
  );
}

export function buildCharacterCandidatePromptInput(
  input: CharacterCandidatePromptInput,
): Record<string, unknown> {
  const additionalInstructions = cleanString(input.additionalInstructions);
  return {
    reference_images: uniqueReferences(input.referenceImages),
    image_count: input.imageCount,
    gender_presentation: cleanString(input.genderPresentation),
    ethnicity: cleanString(input.ethnicity),
    age_min: input.ageMin,
    age_max: input.ageMax,
    lock_clothing: input.lockClothing,
    pose_mode: input.poseMode,
    camera_framing: input.cameraFraming,
    ...(additionalInstructions
      ? { additional_instructions: additionalInstructions }
      : {}),
  };
}

export function buildCharacterCandidatePromptUserPrompt(
  input: CharacterCandidatePromptInput,
): string {
  return [
    "Create the character casting prompt from this schema-compatible input.",
    "The result must be a new fictional person, not the person in any reference image.",
    "Use the references only within the selected locks and as a visual guideline.",
    `Keep every requested candidate within the same apparent age band: ${input.ageMin}-${input.ageMax} years. Do not age later candidates up or down. If the band includes anyone under 18, keep the result age-appropriate and non-sexualized.`,
    "Return one plain-text prompt for independent single-image outputs; never return JSON, markdown, headings, or commentary.",
    JSON.stringify(buildCharacterCandidatePromptInput(input), null, 2),
  ].join("\n\n");
}

export function buildCharacterCandidatePromptMessages(
  systemPrompt: string,
  input: CharacterCandidatePromptInput,
): Message[] {
  const userContent: Message["content"] = [
    { type: "text", text: buildCharacterCandidatePromptUserPrompt(input) },
    ...uniqueReferences(input.referenceImages).map(url => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    })),
  ];
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
}

function boundPlainTextOutput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("character-candidate-prompt returned empty output");
  if (trimmed.length > CHARACTER_CANDIDATE_PROMPT_MAX_OUTPUT_CHARS) {
    throw new Error(
      `character-candidate-prompt output exceeds ${CHARACTER_CANDIDATE_PROMPT_MAX_OUTPUT_CHARS} characters`,
    );
  }
  return trimmed.replace(/^```(?:text|plain)?\s*/i, "").replace(/\s*```$/, "").trim();
}

/**
 * The skill receives the requested batch count so it can enforce candidate
 * consistency. Rendering is submitted as one independent provider task per
 * candidate, however, so each task needs an explicit one-image directive.
 */
export function buildCharacterCandidateSingleImageRenderPrompt(
  prompt: string,
): string {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Character candidate render prompt is empty");
  return `${trimmed}\n\n${CHARACTER_CANDIDATE_SINGLE_IMAGE_RENDER_DIRECTIVE}`;
}

export async function generateCharacterReferenceCastingPrompt(
  params: CharacterCandidatePromptRunParams,
): Promise<CharacterCandidatePromptRunResult> {
  if (
    !Number.isInteger(params.imageCount) ||
    params.imageCount < 1 ||
    params.imageCount > 5 ||
    !Number.isInteger(params.ageMin) ||
    !Number.isInteger(params.ageMax) ||
    params.ageMin < 1 ||
    params.ageMax > 100 ||
    params.ageMin > params.ageMax
  ) {
    throw new Error("Character casting image count and age range are invalid");
  }
  const referenceImages = uniqueReferences(params.referenceImages);
  if (referenceImages.length === 0) {
    throw new Error("Reference-guided character casting requires at least one reference image");
  }
  if (!params.tenantId.trim()) {
    throw new Error("Tenant context is required for character casting skill execution");
  }

  const syncResult = await syncSingleSkillIfChanged(
    CHARACTER_CANDIDATE_PROMPT_SKILL_ID,
  );
  if (syncResult.error) {
    throw new Error(
      `character-candidate-prompt skill sync failed: ${syncResult.error}`,
    );
  }
  const skill = await getSkillByIdAsync(CHARACTER_CANDIDATE_PROMPT_SKILL_ID);
  if (!skill) {
    throw new Error("character-candidate-prompt skill not found or not enabled");
  }
  const skillPrompt = (skill.skillContent || skill.systemPrompt || "").trim();
  if (!skillPrompt) {
    throw new Error("character-candidate-prompt skill has no prompt content");
  }

  const policy = await resolveSkillExecutionPolicy({
    skill,
    conversationModel: params.model ?? null,
  });
  if (!policy.modelId) {
    throw new Error("character-candidate-prompt has no enabled LLM model");
  }

  const runId = params.runId?.trim() || crypto.randomUUID();
  const result = await executeSkillLlmWithFallback({
    messages: buildCharacterCandidatePromptMessages(skillPrompt, {
      ...params,
      referenceImages,
    }) as unknown as Array<{ role: string; content: string | unknown[] }>,
    skillSlug: CHARACTER_CANDIDATE_PROMPT_SKILL_ID,
    userId: params.userId,
    executionPolicy: policy,
    maxTokens: 2_400,
    temperature: 0.55,
    maxModelAttempts: 3,
  });
  if (!result.success || !result.content) {
    throw new Error(
      result.error || "character-candidate-prompt failed to generate a prompt",
    );
  }
  const prompt = boundPlainTextOutput(result.content);
  const settlement = await settleSkillRun({
    runId,
    userId: params.userId,
    tenantId: params.tenantId,
    skillSlug: CHARACTER_CANDIDATE_PROMPT_SKILL_ID,
    description: "Vertical Drama reference-guided character casting prompt",
    metadata: {
      originSurface: "vertical_drama_character_casting",
      referenceImageCount: referenceImages.length,
      imageCount: params.imageCount,
      lockClothing: params.lockClothing,
      poseMode: params.poseMode,
      cameraFraming: params.cameraFraming,
    },
  });

  return {
    prompt,
    modelId: result.modelId ?? policy.modelId,
    creditsUsed: settlement.totalCredits,
    runId,
  };
}
