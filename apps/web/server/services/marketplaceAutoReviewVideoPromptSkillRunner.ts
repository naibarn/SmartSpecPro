import { createHash } from "node:crypto";

import type {
  VisionAwareImageInput,
  VisionAwareCallResponse,
} from "./verticalDramaStoryBible";
import { detectVerticalDramaShotPeopleDirect } from "./verticalDramaSpeakerVisualDetection";
import { generateVerticalDramaShotVideoPromptDirect } from "./verticalDramaVideoMotionPromptGeneration";
import {
  calculateCreditsForLLMDynamic,
  deductCredits,
  hasEnoughCredits,
} from "./creditService";
import { getSkillRunCreditCost } from "./skillRevenueBilling";
import { getSkillByIdAsync } from "./skillRegistry";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
import { loadEnabledLlmModelRows } from "./enabledLlmModels";
import { isCompleteStagedVideoPrompt } from "./marketplaceAutoReviewStagedPromptCompiler";
import type { SequentialReferenceManifestEntry } from "./productReviewSequentialStoryboardSkillRunner";
import type {
  StagedCastMember,
  StagedStoryArcShot,
} from "./marketplaceAutoReviewStoryArcPlanner";
import type { VerticalDramaDetectedShotPerson } from "@shared/verticalDramaSeries/speakerVisualBinding";

export const MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL =
  "vertical-drama-speaker-visual-detection";
export const MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL =
  "vertical-drama-shot-video-prompt";

type Usage = {
  promptTokens: number;
  completionTokens: number;
  providerName: string;
};
type DirectUsageObserver = (
  response: VisionAwareCallResponse,
  requestedModel: string,
  providerName: string
) => void;

export type MarketplaceVideoPromptProgress = {
  progress: number;
  stage: string;
  message: string;
};

export type MarketplaceVideoPromptSkillRun = {
  skill: string;
  model: string;
  provider: string;
  estimatedCredits: number;
};

export type GenerateMarketplaceAutoReviewVideoPromptInput = {
  userId: number;
  tenantId: string;
  publicUrl?: string | null;
  runId: string;
  shotId: number;
  approvedImageUrl: string;
  promptModel?: string | null;
  requestIdempotencyKey: string;
  shot: StagedStoryArcShot;
  cast: readonly StagedCastMember[];
  productName: string;
  productFacts: string[];
  referenceManifest: readonly SequentialReferenceManifestEntry[];
  instruction?: string | null;
  onProgress?: (progress: MarketplaceVideoPromptProgress) => Promise<void>;
};

function clean(value: unknown, max = 1200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function absoluteUrl(value: string, publicUrl?: string | null): string {
  if (/^https?:\/\//i.test(value)) return value;
  const base = publicUrl?.trim();
  if (!base) throw new Error("MARKETPLACE_PUBLIC_BASE_URL_REQUIRED");
  return new URL(value, `${base.replace(/\/+$/, "")}/`).toString();
}

function parseDialogue(
  dialogue: string
): Array<{ speaker: string; line: string }> {
  const lines = dialogue
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^([^:\n]{1,100}):\s*(.+)$/);
      return match ? { speaker: match[1].trim(), line: match[2].trim() } : null;
    });
  if (lines.some(line => line === null)) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_APPROVED_DIALOGUE_INVALID");
  }
  return lines as Array<{ speaker: string; line: string }>;
}

function modelMatches(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

async function resolveDirectVisionModel(
  skillSlug: string,
  requestedModel?: string | null
) {
  const skill = await getSkillByIdAsync(skillSlug);
  if (!skill) throw new Error(`MARKETPLACE_SKILL_NOT_FOUND:${skillSlug}`);
  const policy = await resolveSkillExecutionPolicy({
    skill,
    conversationModel: requestedModel?.trim() || null,
  });
  const modelId = policy.modelId?.trim();
  if (!modelId)
    throw new Error(`MARKETPLACE_SKILL_MODEL_NOT_CONFIGURED:${skillSlug}`);
  if (/^wllm_[A-Za-z0-9_-]{8,128}$/.test(modelId)) {
    throw new Error(
      `MARKETPLACE_SKILL_DIRECT_EXECUTION_REQUIRES_PROVIDER_MODEL:${skillSlug}`
    );
  }

  const rows = await loadEnabledLlmModelRows();
  const model = rows.find(row =>
    [row.modelId, row.providerModelId, ...(row.legacyModelAliases ?? [])]
      .filter((value): value is string => typeof value === "string")
      .some(value => modelMatches(value, modelId))
  );
  if (!model || model.supportsVision !== true) {
    throw new Error(
      `MARKETPLACE_SKILL_REQUIRES_VISION_MODEL:${skillSlug}:${modelId}`
    );
  }
  return { modelId, allowFreeModels: policy.allowFreeModels };
}

function makeChargeKey(input: {
  runId: string;
  shotId: number;
  requestIdempotencyKey: string;
  skillSlug: string;
}): string {
  const digest = createHash("sha256")
    .update(
      `${input.runId}\n${input.shotId}\n${input.requestIdempotencyKey}\n${input.skillSlug}`
    )
    .digest("hex");
  return `marketplace-auto-review-skill:${digest}`;
}

async function assertCreditPreflight(input: {
  userId: number;
  tenantId: string;
  skillSlug: string;
}) {
  const credits = await getSkillRunCreditCost({
    skillSlug: input.skillSlug,
    tenantId: input.tenantId,
  });
  if (!(await hasEnoughCredits(input.userId, credits))) {
    throw new Error(
      `MARKETPLACE_SKILL_INSUFFICIENT_CREDITS:${input.skillSlug}`
    );
  }
}

async function chargeActualUsage(input: {
  userId: number;
  tenantId: string;
  runId: string;
  shotId: number;
  skillSlug: string;
  modelId: string;
  providerName?: string;
  requestIdempotencyKey: string;
  usage: Usage | null;
}): Promise<number> {
  if (!input.usage) {
    throw new Error(`MARKETPLACE_SKILL_USAGE_REQUIRED:${input.skillSlug}`);
  }
  const providerName = input.usage.providerName.trim();
  if (!providerName) {
    throw new Error(`MARKETPLACE_SKILL_PROVIDER_REQUIRED:${input.skillSlug}`);
  }
  if (input.providerName && input.providerName.trim() !== providerName) {
    throw new Error(`MARKETPLACE_SKILL_PROVIDER_MISMATCH:${input.skillSlug}`);
  }
  const amount = await calculateCreditsForLLMDynamic(
    input.usage.promptTokens,
    input.usage.completionTokens,
    input.modelId
  );
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`MARKETPLACE_SKILL_USAGE_COST_INVALID:${input.skillSlug}`);
  }
  if (amount > 0) {
    await deductCredits({
      userId: input.userId,
      tenantId: input.tenantId,
      amount,
      description: `Marketplace Auto Review · ${input.skillSlug} · Shot ${input.shotId}`,
      idempotencyKey: makeChargeKey(input),
      skillSlug: input.skillSlug,
      sourceType: "skill",
      metadata: {
        feature: "marketplace_auto_review",
        runId: input.runId,
        shotId: input.shotId,
        operation: input.skillSlug,
        model: input.modelId,
        provider: providerName,
      },
    });
  }
  return amount;
}

function collectUsageObserver(target: {
  current: Usage | null;
}): DirectUsageObserver {
  return (response, _requestedModel, providerName) => {
    const promptTokens = Number(response.usage?.prompt_tokens);
    const completionTokens = Number(response.usage?.completion_tokens);
    if (
      !Number.isFinite(promptTokens) ||
      promptTokens < 0 ||
      !Number.isFinite(completionTokens) ||
      completionTokens < 0
    ) {
      target.current = null;
      return;
    }
    target.current = {
      promptTokens,
      completionTokens,
      providerName,
    };
  };
}

function formatDetectedPeople(
  people: readonly VerticalDramaDetectedShotPerson[]
): string {
  if (!people.length)
    return "No visible people were detected in the approved image.";
  return people
    .map(person => {
      const box = person.boundingBox;
      const centerX = box.x + box.width / 2;
      const position =
        centerX < 0.34
          ? "viewer-left"
          : centerX > 0.66
            ? "viewer-right"
            : "viewer-center";
      return `- ${person.id}: ${person.appearance}; ${position}; normalized region x=${box.x.toFixed(3)}, y=${box.y.toFixed(3)}, width=${box.width.toFixed(3)}, height=${box.height.toFixed(3)}; confidence=${person.confidence.toFixed(2)}`;
    })
    .join("\n");
}

export function buildMarketplaceVerticalDramaVideoPromptInput(input: {
  shotId: number;
  shot: StagedStoryArcShot;
  cast: readonly StagedCastMember[];
  productName: string;
  productFacts: string[];
  detectedPeople: readonly VerticalDramaDetectedShotPerson[];
  characterPortraits: ReadonlyArray<{
    imageNumber: number;
    characterName: string;
    role?: string;
    descriptor?: string;
  }>;
  instruction?: string | null;
}): string {
  if (!clean(input.productName, 200)) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_PRODUCT_NAME_REQUIRED");
  }
  const dialogue = parseDialogue(input.shot.dialogue);
  const castByName = new Map(
    input.cast.map(member => [
      member.name.normalize("NFKC").trim().toLowerCase(),
      member,
    ])
  );
  const portraitsByName = new Map(
    input.characterPortraits.map(member => [
      member.characterName.normalize("NFKC").trim().toLowerCase(),
      member,
    ])
  );
  const unknownSpeaker = dialogue.find(
    line => !castByName.has(line.speaker.normalize("NFKC").trim().toLowerCase())
  );
  if (unknownSpeaker) {
    throw new Error(
      `MARKETPLACE_VIDEO_PROMPT_SPEAKER_NOT_IN_CAST:${unknownSpeaker.speaker}`
    );
  }
  const missingPortrait = dialogue.find(line => {
    const key = line.speaker.normalize("NFKC").trim().toLowerCase();
    return castByName.has(key) && !portraitsByName.has(key);
  });
  if (missingPortrait) {
    throw new Error(
      `MARKETPLACE_VIDEO_PROMPT_SPEAKER_PORTRAIT_MISSING:${missingPortrait.speaker}`
    );
  }

  const portraitManifest = input.characterPortraits.length
    ? input.characterPortraits
        .map(
          person =>
            `- Image ${person.imageNumber} = ${person.characterName}${person.role ? ` (${person.role})` : ""}${person.descriptor ? `; reference description: ${clean(person.descriptor, 240)}` : ""}`
        )
        .join("\n")
    : "(No character portrait references are attached.)";
  const approvedDialogue = dialogue.length
    ? dialogue
        .map((line, index) => `${index + 1}. ${line.speaker}: "${line.line}"`)
        .join("\n")
    : "(No spoken dialogue is approved for this shot.)";
  const facts = input.productFacts
    .map(fact => clean(fact, 240))
    .filter(Boolean);

  return [
    `Create one video motion prompt for Marketplace Auto Review shot ${input.shotId}. This action creates prompt text only; do not render or generate a video.`,
    "Use Image 1 as the exact approved start frame and the source of truth for the people, product, blocking, and scene.",
    `Format: vertical 9:16, ${input.shot.durationSeconds} seconds.`,
    `Product: ${clean(input.productName, 200)}`,
    facts.length
      ? `Verified product facts:\n${facts.map(fact => `- ${fact}`).join("\n")}`
      : null,
    `Shot title: ${clean(input.shot.title, 200)}`,
    `Approved story beat: ${clean(input.shot.storySummary, 900)}`,
    `Approved visual direction: ${clean(input.shot.visualSummary, 900)}`,
    `Character portrait identity map (images after Image 1):\n${portraitManifest}`,
    `People detected from Image 1 by ${MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL}:\n${formatDetectedPeople(input.detectedPeople)}`,
    `Approved dialogue (use each line exactly once, in this order; do not rewrite, duplicate, or add dialogue):\n${approvedDialogue}`,
    "Before writing the prompt, compare each attached portrait with the detected people in Image 1. In SPEAKER VISUAL MAP FOR THIS SHOT, give every dialogue speaker a concrete observed appearance, viewer-relative position, and exact detected person ID from the supplied detection results. Do not use cast IDs or image labels as the video's identity cues. If any dialogue speaker cannot be matched confidently to one detected person ID, do not guess, assign voice-over, or substitute another person; return an invalid result so the request fails visibly.",
    "Only the named, detected person moves their mouth during that exact line; all other visible people remain silent with mouths closed. Keep the product and scene consistent with Image 1. Include one clear, physically plausible action and camera movement. Do not add on-screen text, subtitles, captions, logos, watermarks, or unsupported product claims.",
    clean(input.instruction, 1200)
      ? `User instruction for this shot:\n${clean(input.instruction, 1200)}`
      : null,
    "Return exactly the JSON object required by this skill. The prompt field must contain the complete video prompt. Do not return commentary.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n\n");
}

export async function generateMarketplaceAutoReviewVideoPrompt(
  input: GenerateMarketplaceAutoReviewVideoPromptInput
): Promise<{
  prompt: string;
  detectedPeople: VerticalDramaDetectedShotPerson[];
  model: string;
  provider: string;
  estimatedCredits: number;
  skillRuns: MarketplaceVideoPromptSkillRun[];
}> {
  if (!input.approvedImageUrl.trim()) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_APPROVED_IMAGE_REQUIRED");
  }
  if (!clean(input.productName, 200)) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_PRODUCT_NAME_REQUIRED");
  }
  const approvedFrame = absoluteUrl(input.approvedImageUrl, input.publicUrl);
  if (!approvedFrame) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_APPROVED_IMAGE_URL_INVALID");
  }
  const dialogue = parseDialogue(input.shot.dialogue);
  const castNames = new Set(
    input.cast.map(member => member.name.normalize("NFKC").trim().toLowerCase())
  );
  const portraitNames = new Set(
    input.referenceManifest
      .filter(
        entry => entry.role === "character" && entry.characterName?.trim()
      )
      .map(entry => entry.characterName!.normalize("NFKC").trim().toLowerCase())
  );
  for (const line of dialogue) {
    const speaker = line.speaker.normalize("NFKC").trim().toLowerCase();
    if (!castNames.has(speaker)) {
      throw new Error(
        `MARKETPLACE_VIDEO_PROMPT_SPEAKER_NOT_IN_CAST:${line.speaker}`
      );
    }
    if (!portraitNames.has(speaker)) {
      throw new Error(
        `MARKETPLACE_VIDEO_PROMPT_SPEAKER_PORTRAIT_MISSING:${line.speaker}`
      );
    }
  }
  const characterPortraits = input.referenceManifest
    .filter(entry => entry.role === "character" && entry.characterName?.trim())
    .map(entry => {
      const url = absoluteUrl(entry.url, input.publicUrl);
      if (!url) {
        throw new Error(
          `MARKETPLACE_VIDEO_PROMPT_CHARACTER_REFERENCE_URL_INVALID:${entry.characterName}`
        );
      }
      return { entry, url };
    });
  const detectionModel = await resolveDirectVisionModel(
    MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
    input.promptModel
  );
  const videoPromptModel = await resolveDirectVisionModel(
    MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
    input.promptModel
  );
  await assertCreditPreflight({
    userId: input.userId,
    tenantId: input.tenantId,
    skillSlug: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
  });
  await assertCreditPreflight({
    userId: input.userId,
    tenantId: input.tenantId,
    skillSlug: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
  });
  await input.onProgress?.({
    progress: 15,
    stage: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
    message: `กำลังตรวจจับบุคคลจากภาพที่อนุมัติ · ${MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL} · Shot ${input.shotId}`,
  });

  const detectionUsage = { current: null as Usage | null };
  let detection: Awaited<
    ReturnType<typeof detectVerticalDramaShotPeopleDirect>
  >;
  try {
    detection = await detectVerticalDramaShotPeopleDirect({
      userId: input.userId,
      tenantId: input.tenantId,
      shotNumber: input.shotId,
      imageUrl: approvedFrame,
      model: detectionModel.modelId,
      publicUrl: input.publicUrl,
      onUsage: collectUsageObserver(detectionUsage),
    });
  } catch (error) {
    if (detectionUsage.current) {
      await chargeActualUsage({
        userId: input.userId,
        tenantId: input.tenantId,
        runId: input.runId,
        shotId: input.shotId,
        skillSlug: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
        modelId: detectionModel.modelId,
        requestIdempotencyKey: input.requestIdempotencyKey,
        usage: detectionUsage.current,
      });
    }
    throw error;
  }
  const detectionCredits = await chargeActualUsage({
    userId: input.userId,
    tenantId: input.tenantId,
    runId: input.runId,
    shotId: input.shotId,
    skillSlug: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
    modelId: detectionModel.modelId,
    providerName: detection.providerName,
    requestIdempotencyKey: input.requestIdempotencyKey,
    usage: detectionUsage.current,
  });
  if (dialogue.length > 0 && detection.people.length === 0) {
    throw new Error(
      `MARKETPLACE_VIDEO_PROMPT_NO_PEOPLE_DETECTED:shot-${input.shotId}`
    );
  }

  await input.onProgress?.({
    progress: 50,
    stage: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
    message: `ตรวจจับบุคคลแล้ว ${detection.people.length} คน · กำลังสร้าง Prompt วิดีโอ · ${MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL} · Shot ${input.shotId}`,
  });
  const imageInputs: VisionAwareImageInput[] = [
    {
      url: approvedFrame,
      label:
        "Image 1 — exact approved start frame. This image defines actual shot composition and visible people.",
    },
    ...characterPortraits.map((item, index) => ({
      url: item.url,
      label: `Image ${index + 2} — character portrait for ${item.entry.characterName}${item.entry.characterRole ? ` (${item.entry.characterRole})` : ""}. Use only to match identity to a person visible in Image 1.`,
    })),
  ];
  const promptInput = buildMarketplaceVerticalDramaVideoPromptInput({
    shotId: input.shotId,
    shot: input.shot,
    cast: input.cast,
    productName: input.productName,
    productFacts: input.productFacts,
    detectedPeople: detection.people,
    characterPortraits: characterPortraits.map((item, index) => ({
      imageNumber: index + 2,
      characterName: item.entry.characterName!,
      role: item.entry.characterRole,
      descriptor: input.cast.find(
        cast => cast.name === item.entry.characterName
      )?.descriptor,
    })),
    instruction: input.instruction,
  });

  const promptUsage = { current: null as Usage | null };
  let generated: Awaited<
    ReturnType<typeof generateVerticalDramaShotVideoPromptDirect>
  >;
  try {
    generated = await generateVerticalDramaShotVideoPromptDirect({
      model: videoPromptModel.modelId,
      userId: input.userId,
      tenantId: input.tenantId,
      publicUrl: input.publicUrl,
      userPromptText: promptInput,
      images: imageInputs,
      onUsage: collectUsageObserver(promptUsage),
    });
  } catch (error) {
    if (promptUsage.current) {
      await chargeActualUsage({
        userId: input.userId,
        tenantId: input.tenantId,
        runId: input.runId,
        shotId: input.shotId,
        skillSlug: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
        modelId: videoPromptModel.modelId,
        requestIdempotencyKey: input.requestIdempotencyKey,
        usage: promptUsage.current,
      });
    }
    throw error;
  }
  const promptCredits = await chargeActualUsage({
    userId: input.userId,
    tenantId: input.tenantId,
    runId: input.runId,
    shotId: input.shotId,
    skillSlug: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
    modelId: videoPromptModel.modelId,
    providerName: generated.providerName,
    requestIdempotencyKey: input.requestIdempotencyKey,
    usage: promptUsage.current,
  });

  const prompt = generated.data.prompt.trim();
  if (
    !isCompleteStagedVideoPrompt(
      prompt,
      input.shot.dialogue,
      detection.people.map(person => person.id),
      input.shot.dialogueTurns,
      input.cast
    )
  ) {
    throw new Error(
      `MARKETPLACE_VIDEO_PROMPT_SKILL_OUTPUT_INCOMPLETE:shot-${input.shotId}`
    );
  }
  return {
    prompt,
    detectedPeople: detection.people,
    model: videoPromptModel.modelId,
    provider: generated.providerName,
    estimatedCredits: detectionCredits + promptCredits,
    skillRuns: [
      {
        skill: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
        model: detectionModel.modelId,
        provider: detection.providerName,
        estimatedCredits: detectionCredits,
      },
      {
        skill: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
        model: videoPromptModel.modelId,
        provider: generated.providerName,
        estimatedCredits: promptCredits,
      },
    ],
  };
}
