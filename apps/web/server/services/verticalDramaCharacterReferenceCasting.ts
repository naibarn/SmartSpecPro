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
  /** One prompt per independently rendered candidate. */
  prompts: string[];
  /** Backward-compatible alias for the first prompt. */
  prompt: string;
  modelId: string | null;
  creditsUsed: number;
  runId: string;
  repairCount: number;
  duplicatePairs: Array<[number, number]>;
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
    candidate_count: input.imageCount,
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
  options: { repairContext?: string } = {},
): string {
  const batchContract = input.imageCount > 1
    ? [
        `Return exactly ${input.imageCount} materially different prompts using these markers:`,
        ...Array.from({ length: input.imageCount }, (_, index) =>
          `CANDIDATE ${index + 1}:\n<one plain-text prompt>\nEND CANDIDATE ${index + 1}`,
        ),
        "Do not reuse or lightly paraphrase a prompt. Vary facial identity axes (face geometry, eyes, nose, mouth, hair, and one distinctive marker) while preserving the requested age, ethnicity/region, reference locks, clothing lock, pose mode, and camera framing.",
      ].join("\n")
    : "Return one plain-text prompt for an independent single-image output; never return JSON, markdown, headings, or commentary.";
  return [
    "Create the character casting prompt from this schema-compatible input.",
    "The result must be a new fictional person, not the person in any reference image.",
    "Use the references only within the selected locks and as a visual guideline.",
    `Keep every requested candidate within the same apparent age band: ${input.ageMin}-${input.ageMax} years. Do not age later candidates up or down. If the band includes anyone under 18, keep the result age-appropriate and non-sexualized.`,
    batchContract,
    ...(options.repairContext ? [options.repairContext] : []),
    JSON.stringify(buildCharacterCandidatePromptInput(input), null, 2),
  ].join("\n\n");
}

export function buildCharacterCandidatePromptMessages(
  systemPrompt: string,
  input: CharacterCandidatePromptInput,
  options: { repairContext?: string } = {},
): Message[] {
  const userContent: Message["content"] = [
    { type: "text", text: buildCharacterCandidatePromptUserPrompt(input, options) },
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

function normalizePromptForComparison(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/```(?:text|plain)?/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function promptTokenSet(value: string): Set<string> {
  return new Set(normalizePromptForComparison(value).split(" ").filter(Boolean));
}

/** Detect exact and near-identical candidate prompts while ignoring whitespace/case. */
export function findCharacterCandidatePromptDuplicatePairs(
  prompts: readonly string[],
): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  const normalized = prompts.map(normalizePromptForComparison);
  const tokenSets = prompts.map(promptTokenSet);
  for (let left = 0; left < prompts.length; left += 1) {
    for (let right = left + 1; right < prompts.length; right += 1) {
      if (!normalized[left] || !normalized[right] || normalized[left] === normalized[right]) {
        pairs.push([left, right]);
        continue;
      }
      const a = tokenSets[left]!;
      const b = tokenSets[right]!;
      const smaller = Math.min(a.size, b.size);
      if (smaller < 12) continue;
      let intersection = 0;
      for (const token of a) if (b.has(token)) intersection += 1;
      const union = new Set([...a, ...b]).size;
      if (union > 0 && intersection / union >= 0.86) pairs.push([left, right]);
    }
  }
  return pairs;
}

export function parseCharacterCandidatePromptOutput(
  value: string,
  count: number,
): string[] {
  const bounded = boundPlainTextOutput(value);
  if (count === 1) return [bounded];

  const blocks: string[] = [];
  const marker = /(?:^|\n)\s*CANDIDATE\s+(\d+)\s*:\s*\n([\s\S]*?)(?:\n\s*END\s+CANDIDATE\s+\1\s*(?=\n|$)|(?=\n\s*CANDIDATE\s+\d+\s*:)|$)/gi;
  for (const match of bounded.matchAll(marker)) {
    const prompt = match[2]?.trim();
    if (prompt) blocks[Number(match[1]) - 1] = prompt;
  }
  if (blocks.length === count && blocks.every(Boolean)) return blocks as string[];

  const jsonCandidate = (() => {
    try {
      const parsed: unknown = JSON.parse(bounded);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object" && "candidates" in parsed) {
        return (parsed as { candidates?: unknown }).candidates;
      }
    } catch {
      // Plain-text contract is preferred; fall through to delimiter parsing.
    }
    return null;
  })();
  if (Array.isArray(jsonCandidate)) {
    const prompts = jsonCandidate.map(item =>
      typeof item === "string"
        ? item.trim()
        : item && typeof item === "object" && "prompt" in item
          ? String((item as { prompt?: unknown }).prompt ?? "").trim()
          : "",
    );
    if (prompts.length === count && prompts.every(Boolean)) return prompts;
  }

  const delimiterParts = bounded.split(/\n\s*---+\s*\n/).map(part => part.trim()).filter(Boolean);
  if (delimiterParts.length === count) return delimiterParts;
  return [bounded];
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
  const maxRepairRounds = params.imageCount > 1 ? 2 : 0;
  let prompts: string[] = [];
  let modelId: string | null = policy.modelId;
  let repairCount = 0;
  let duplicatePairs: Array<[number, number]> = [];
  let lastError = "";

  for (let round = 0; round <= maxRepairRounds; round += 1) {
    const repairContext = round > 0
      ? [
          "REPAIR REQUIRED: the previous candidate set was incomplete or contained duplicate/near-duplicate prompts.",
          `Previous prompts:\n${prompts.map((prompt, index) => `CANDIDATE ${index + 1}: ${prompt}`).join("\n")}`,
          duplicatePairs.length > 0
            ? `Duplicate pairs to replace: ${duplicatePairs.map(([left, right]) => `${left + 1} vs ${right + 1}`).join(", ")}`
            : "The previous response did not contain the required number of candidate blocks.",
          "Return the full requested candidate set again. Preserve age, ethnicity/region, reference-image locks, clothing lock, pose mode, camera framing, and all user instructions. Change only identity-bearing facial and hair details needed to make every candidate distinct.",
        ].join("\n")
      : undefined;
    const result = await executeSkillLlmWithFallback({
      messages: buildCharacterCandidatePromptMessages(
        skillPrompt,
        { ...params, referenceImages },
        { repairContext },
      ) as unknown as Array<{ role: string; content: string | unknown[] }>,
      skillSlug: CHARACTER_CANDIDATE_PROMPT_SKILL_ID,
      userId: params.userId,
      executionPolicy: policy,
      maxTokens: params.imageCount > 1 ? 4_800 : 2_400,
      temperature: 0.55,
      maxModelAttempts: 3,
      verticalDramaContext: {
        taskClass: "character_design",
        settings: { llm: { qualityProfile: "high" } },
      },
    });
    if (!result.success || !result.content) {
      lastError = result.error || "character-candidate-prompt failed to generate a prompt";
      continue;
    }
    modelId = result.modelId ?? policy.modelId;
    try {
      const parsedPrompts = parseCharacterCandidatePromptOutput(
        result.content,
        params.imageCount,
      );
      prompts = parsedPrompts.length < params.imageCount && prompts.length > 0
        ? [...prompts, ...parsedPrompts]
        : parsedPrompts;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      prompts = [];
      continue;
    }
    duplicatePairs = findCharacterCandidatePromptDuplicatePairs(prompts);
    const complete = prompts.length === params.imageCount && prompts.every(Boolean);
    if (complete && duplicatePairs.length === 0) break;
    repairCount = round + 1;
  }

  if (prompts.length === 0) {
    throw new Error(lastError || "character-candidate-prompt returned empty output");
  }

  // If a batch-capable skill still omitted blocks, fill only the missing
  // candidates with single-prompt repair calls. This prevents the router from
  // ever copying one prompt into several image tasks. A duplicate after the
  // bounded repair remains a warning, never a reason to block the workflow.
  while (prompts.length < params.imageCount) {
    const candidateIndex = prompts.length;
    let repairedPrompt = "";
    for (let attempt = 0; attempt < 2 && !repairedPrompt; attempt += 1) {
      const result = await executeSkillLlmWithFallback({
        messages: buildCharacterCandidatePromptMessages(
          skillPrompt,
          { ...params, referenceImages, imageCount: 1 },
          {
            repairContext: [
              `Generate the missing candidate ${candidateIndex + 1} as one standalone prompt.`,
              `Existing candidate prompts:\n${prompts.map((prompt, index) => `CANDIDATE ${index + 1}: ${prompt}`).join("\n")}`,
              "Make the face and hair identity materially different from every existing candidate while preserving age, ethnicity/region, references, clothing lock, pose mode, camera framing, and user instructions.",
            ].join("\n"),
          },
        ) as unknown as Array<{ role: string; content: string | unknown[] }>,
        skillSlug: CHARACTER_CANDIDATE_PROMPT_SKILL_ID,
        userId: params.userId,
        executionPolicy: policy,
        maxTokens: 2_400,
        temperature: 0.55,
        maxModelAttempts: 3,
        verticalDramaContext: {
          taskClass: "character_design",
          settings: { llm: { qualityProfile: "high" } },
        },
      });
      repairCount += 1;
      if (!result.success || !result.content) continue;
      modelId = result.modelId ?? policy.modelId;
      try {
        const parsed = parseCharacterCandidatePromptOutput(result.content, 1)[0];
        if (!parsed) continue;
        const candidatePairs = findCharacterCandidatePromptDuplicatePairs([
          ...prompts,
          parsed,
        ]);
        if (candidatePairs.some(([, right]) => right === candidateIndex) && attempt === 0) {
          continue;
        }
        repairedPrompt = parsed;
        duplicatePairs.push(
          ...candidatePairs.filter(([, right]) => right === candidateIndex),
        );
      } catch {
        // Retry this missing block once, then continue with the best output.
      }
    }
    if (!repairedPrompt) {
      throw new Error(
        lastError || `character-candidate-prompt could not generate candidate ${candidateIndex + 1}`,
      );
    }
    prompts.push(repairedPrompt);
  }
  duplicatePairs = findCharacterCandidatePromptDuplicatePairs(prompts);
  const prompt = prompts[0]!;
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
      candidateCount: prompts.length,
      repairCount,
      duplicatePairs,
      lockClothing: params.lockClothing,
      poseMode: params.poseMode,
      cameraFraming: params.cameraFraming,
    },
  });

  return {
    prompts,
    prompt,
    modelId,
    creditsUsed: settlement.totalCredits,
    runId,
    repairCount,
    duplicatePairs,
  };
}
