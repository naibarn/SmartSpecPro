import fs from "fs";
import path from "path";

import type { Message } from "../_core/llm";
import { calculateCreditsForLLM, deductCredits } from "./creditService";
import { executeWithFallback, getProviderForModel } from "./llmRouter";
import {
  getSkillByIdAsync,
  syncSingleSkillIfChanged,
  type SkillDefinition,
} from "./skillRegistry";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
import { loadEnabledLlmModelRows } from "./enabledLlmModels";
import { selectLlmModelCandidates } from "./intelligentModelSelector";
import {
  runProductReferenceStoryboardVisionLlmCallWithFallback,
  type ProductReferenceStoryboardVisionModelAttempt,
} from "./productReferenceStoryboardSkillRunner";

export const PRODUCT_VIDEO_MOTION_PROMPT_SKILL_ID =
  "product-video-motion-prompt";
/**
 * The submitted video prompt (base motion prompt + optional user motion line +
 * optional repair line) is downstream of this skill's output. Bound the skill
 * output well under a typical video-model prompt limit so the assembled
 * submitted prompt stays comfortable.
 */
export const PRODUCT_VIDEO_MOTION_PROMPT_MAX_CHARS = 2400;
const PRODUCT_VIDEO_MOTION_PROMPT_MIN_COMPLETION_TOKENS = 1200;
const PRODUCT_VIDEO_MOTION_PROMPT_OUTPUT_AUDIT_PREVIEW_CHARS = 500;
/**
 * Vision requirement only — this skill needs to SEE the keyframe, not a huge
 * context window. Deliberately do NOT require a 1M-token context (per plan 2A).
 */
const PRODUCT_VIDEO_MOTION_PROMPT_VISION_MODEL_MAX_ATTEMPTS = 3;

export type ProductVideoMotionPromptSkillRunResult = {
  prompt: string;
  rawOutput: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  creditsUsed: number;
  modelId: string | null;
  providerName: string | null;
  visionFallback: "next_model" | "text_only" | null;
  visionModelAttempts: ProductReferenceStoryboardVisionModelAttempt[];
  skillAudit: Record<string, unknown>;
};

function cleanInputString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function skillFolderCandidates(skill: SkillDefinition): string[] {
  const candidates: string[] = [];
  if (skill.nativeBundlePath) {
    candidates.push(
      path.resolve(process.cwd(), skill.nativeBundlePath),
      path.resolve(process.cwd(), "..", skill.nativeBundlePath),
      path.resolve(process.cwd(), "apps", "web", skill.nativeBundlePath)
    );
  }
  if (skill.skillFilePath) {
    candidates.push(
      path.dirname(path.resolve(process.cwd(), skill.skillFilePath))
    );
  }
  candidates.push(
    path.resolve(process.cwd(), "skills", PRODUCT_VIDEO_MOTION_PROMPT_SKILL_ID),
    path.resolve(
      process.cwd(),
      "..",
      "skills",
      PRODUCT_VIDEO_MOTION_PROMPT_SKILL_ID
    ),
    path.resolve(
      process.cwd(),
      "apps",
      "web",
      "skills",
      PRODUCT_VIDEO_MOTION_PROMPT_SKILL_ID
    )
  );
  return Array.from(new Set(candidates));
}

function loadPromptTemplate(skill: SkillDefinition): string {
  return skill.skillContent || skill.systemPrompt || "";
}

export type ProductVideoMotionPromptFacts = {
  productName?: string | null;
  productBrand?: string | null;
  productCategory?: string | null;
  productFacts?: string | null;
  shotTitle?: string | null;
  shotVisual?: string | null;
  shotMovement?: string | null;
  voiceoverExcerpt?: string | null;
  aspectRatio?: string | null;
  durationSeconds?: number | null;
  shotOrder?: number | null;
  shotCount?: number | null;
  isLastShot?: boolean | null;
  startFrameUrl?: string | null;
  stopFrameUrl?: string | null;
  motionDirection?: string | null;
  voiceProfile?: string | null;
};

/** Build the facts-only user prompt. Absent fields contribute zero bytes. */
export function buildProductVideoMotionPromptUserPrompt(
  facts: ProductVideoMotionPromptFacts
): string {
  const durationSeconds =
    typeof facts.durationSeconds === "number" &&
    Number.isFinite(facts.durationSeconds) &&
    facts.durationSeconds > 0
      ? facts.durationSeconds
      : null;
  const shotOrder =
    typeof facts.shotOrder === "number" && facts.shotOrder > 0
      ? facts.shotOrder
      : null;
  const shotCount =
    typeof facts.shotCount === "number" && facts.shotCount > 0
      ? facts.shotCount
      : null;
  const motionDirection = cleanInputString(facts.motionDirection);
  const voiceProfile = cleanInputString(facts.voiceProfile);

  const lines: Array<string | false | null> = [
    "Write the video motion prompt for this one shot.",
    cleanInputString(facts.productName) &&
      `Product: ${cleanInputString(facts.productName)}`,
    cleanInputString(facts.productBrand) &&
      `Brand: ${cleanInputString(facts.productBrand)}`,
    cleanInputString(facts.productCategory) &&
      `Product category: ${cleanInputString(facts.productCategory)}`,
    cleanInputString(facts.productFacts) &&
      `Product facts: ${cleanInputString(facts.productFacts)}`,
    cleanInputString(facts.shotTitle) &&
      `Shot title: ${cleanInputString(facts.shotTitle)}`,
    cleanInputString(facts.shotVisual) &&
      `Shot visual: ${cleanInputString(facts.shotVisual)}`,
    cleanInputString(facts.shotMovement) &&
      `Planned shot movement: ${cleanInputString(facts.shotMovement)}`,
    cleanInputString(facts.voiceoverExcerpt) &&
      `Voiceover meaning (do not render as text): ${cleanInputString(
        facts.voiceoverExcerpt
      )}`,
    cleanInputString(facts.aspectRatio) &&
      `Aspect ratio: ${cleanInputString(facts.aspectRatio)}`,
    durationSeconds !== null && `Duration seconds: ${durationSeconds}`,
    shotOrder !== null && shotCount !== null
      ? `Shot position: ${shotOrder} of ${shotCount}`
      : shotOrder !== null
        ? `Shot position: ${shotOrder}`
        : null,
    facts.isLastShot === true
      ? "This is the final shot; honor the ending beat of any user motion direction here."
      : null,
    cleanInputString(facts.startFrameUrl) &&
      "The first attached image is this shot's start keyframe; ground all motion in it.",
    cleanInputString(facts.stopFrameUrl) &&
      "A stop keyframe is also attached; motion must end on that frame with no cut or identity change.",
    motionDirection &&
      `User motion direction (MANDATORY additional directive; map only this shot's slice of the sequence): ${motionDirection}`,
    voiceProfile &&
      `Voice profile (same across every clip): ${voiceProfile}. The written prompt must state that this shot uses the same single narrator voice, timbre, tone, pacing, and language as every other clip; never switch narrator between clips.`,
  ];
  return lines.filter(Boolean).join("\n");
}

function buildSystemPrompt(input: {
  skill: SkillDefinition;
  maxOutputChars: number;
}): string {
  return [
    loadPromptTemplate(input.skill),
    "## Marketplace Auto Review Runtime Contract",
    `Return only the final plain-text video motion prompt for this one shot. The output must be <= ${input.maxOutputChars} characters and written in English.`,
    "Do not return JSON, YAML, Markdown fences, headings, bullet lists, frame labels, timecodes, quoted voiceover lines, QA notes, or implementation notes. Do not echo the input field names.",
    "Ground all motion in the attached start keyframe image, keep the product physically true and continuous, and never invent product claims.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildVisionMessages(input: {
  systemPrompt: string;
  userPrompt: string;
  referenceImages: string[];
}): Message[] {
  const userContent: Message["content"] = [
    { type: "text", text: input.userPrompt },
    ...input.referenceImages.map(url => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    })),
  ];
  return [
    { role: "system", content: input.systemPrompt },
    { role: "user", content: userContent },
  ];
}

function buildTextOnlyMessages(input: {
  systemPrompt: string;
  userPrompt: string;
  referenceImageCount: number;
}): Message[] {
  const note =
    `Reference/keyframe images unavailable to the model; ` +
    `${input.referenceImageCount} image(s) exist — write the motion prompt from ` +
    `the shot facts while preserving product fidelity and continuity.`;
  return [
    { role: "system", content: input.systemPrompt },
    { role: "user", content: `${input.userPrompt}\n\n${note}` },
  ];
}

async function resolveVisionCandidateModelIds(
  primaryModelId: string
): Promise<string[]> {
  const rows = await loadEnabledLlmModelRows();
  const ranked = selectLlmModelCandidates(
    { supportsVision: true },
    rows,
    PRODUCT_VIDEO_MOTION_PROMPT_VISION_MODEL_MAX_ATTEMPTS + 1
  );
  const deduped: string[] = [];
  for (const modelId of [primaryModelId, ...ranked]) {
    if (!deduped.includes(modelId)) deduped.push(modelId);
    if (deduped.length >= PRODUCT_VIDEO_MOTION_PROMPT_VISION_MODEL_MAX_ATTEMPTS) {
      break;
    }
  }
  return deduped;
}

async function resolveTextOnlyFallbackModelId(
  fallbackModelId: string
): Promise<string> {
  const rows = await loadEnabledLlmModelRows();
  const ranked = selectLlmModelCandidates({}, rows, 1);
  return ranked[0] ?? fallbackModelId;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";
        const record = part as Record<string, unknown>;
        if (record.type === "text" && typeof record.text === "string") {
          return record.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function extractLlmContent(response: unknown): string {
  const record = response as Record<string, unknown>;
  if (typeof record?.output_text === "string") return record.output_text.trim();
  const choices = Array.isArray(record?.choices) ? record.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  return extractTextFromContent(message?.content).trim();
}

function boundOutput(text: string, maxOutputChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxOutputChars) return trimmed;
  return trimmed.slice(0, maxOutputChars).trim();
}

/**
 * Generate a single-shot product video motion prompt via the
 * product-video-motion-prompt skill. This is an ENHANCER, not a gate: the
 * caller (Marketplace Auto Review scheduleVideoAttempt) falls back to the
 * deterministic Phase-1 prompt on ANY throw. Vision resilience is reused from
 * productReferenceStoryboardSkillRunner
 * (`runProductReferenceStoryboardVisionLlmCallWithFallback`).
 */
export async function runProductVideoMotionPromptSkill(input: {
  tenantId: string;
  userId: number;
  facts: ProductVideoMotionPromptFacts;
  referenceImages: string[];
  runId?: string | null;
  unitId?: string | null;
  attempt?: number | null;
  model?: string | null;
  maxOutputChars?: number | null;
}): Promise<ProductVideoMotionPromptSkillRunResult> {
  const maxOutputChars =
    input.maxOutputChars && input.maxOutputChars > 0
      ? Math.min(
          Math.floor(input.maxOutputChars),
          PRODUCT_VIDEO_MOTION_PROMPT_MAX_CHARS
        )
      : PRODUCT_VIDEO_MOTION_PROMPT_MAX_CHARS;

  const synced = await syncSingleSkillIfChanged(
    PRODUCT_VIDEO_MOTION_PROMPT_SKILL_ID
  );
  if (synced.error) {
    throw new Error(
      `product-video-motion-prompt skill sync failed: ${synced.error}`
    );
  }
  const skill = await getSkillByIdAsync(PRODUCT_VIDEO_MOTION_PROMPT_SKILL_ID);
  if (!skill) {
    throw new Error(
      "product-video-motion-prompt skill not found or not enabled"
    );
  }

  const referenceImages = Array.from(
    new Set(input.referenceImages.map(url => cleanInputString(url)).filter(Boolean))
  );

  const systemPrompt = buildSystemPrompt({ skill, maxOutputChars });
  if (!systemPrompt.trim()) {
    throw new Error(
      "product-video-motion-prompt skill has no executable prompt content"
    );
  }
  const userPrompt = buildProductVideoMotionPromptUserPrompt(input.facts);

  const policy = await resolveSkillExecutionPolicy({
    skill,
    conversationModel: input.model ?? null,
  });
  if (!policy.modelId) {
    throw new Error(
      "product-video-motion-prompt skill has no enabled vision-capable LLM model"
    );
  }
  const provider = await getProviderForModel(policy.modelId, {
    preferredProviderId: policy.preferredProviderId,
    strictProviderPin: policy.strictProviderPin,
    allowFreeModels: policy.allowFreeModels,
  });
  if (!provider) {
    throw new Error(
      `No provider available for product-video-motion-prompt model ${policy.modelId}`
    );
  }

  const llmMaxTokens = Math.max(
    PRODUCT_VIDEO_MOTION_PROMPT_MIN_COMPLETION_TOKENS,
    Math.ceil(maxOutputChars / 2)
  );

  const visionCandidateModelIds = await resolveVisionCandidateModelIds(
    policy.modelId
  );
  const textOnlyModelId = await resolveTextOnlyFallbackModelId(policy.modelId);

  const { llmResult, usedModelId, visionFallback, visionModelAttempts } =
    await runProductReferenceStoryboardVisionLlmCallWithFallback({
      primaryModelId: policy.modelId,
      candidateModelIds: visionCandidateModelIds,
      textOnlyModelId,
      visionMessages: buildVisionMessages({
        systemPrompt,
        userPrompt,
        referenceImages,
      }),
      buildTextOnlyMessages: () =>
        buildTextOnlyMessages({
          systemPrompt,
          userPrompt,
          referenceImageCount: referenceImages.length,
        }),
      callModel: (modelId, messages) =>
        executeWithFallback({
          model: modelId,
          messages,
          stream: false,
          userId: input.userId,
          preferredProvider:
            modelId === policy.modelId ? policy.preferredProviderId : undefined,
          strictProviderPin:
            modelId === policy.modelId ? policy.strictProviderPin : undefined,
          maxTokens: llmMaxTokens,
          temperature: 0.5,
          disableProviderFallbacks: true,
          allowFreeModels: policy.allowFreeModels,
        }),
      onHop: hop => {
        console.warn(
          "[productVideoMotionPromptSkillRunner] vision_model_retry",
          {
            skillId: PRODUCT_VIDEO_MOTION_PROMPT_SKILL_ID,
            runId: input.runId ?? null,
            unitId: input.unitId ?? null,
            attempt: input.attempt ?? null,
            failedModelId: hop.modelId,
            error: hop.error,
            mode: hop.mode,
          }
        );
      },
    });

  const rawContent = extractLlmContent(llmResult.response);
  if (!rawContent) {
    throw new Error("product-video-motion-prompt returned empty output");
  }
  if (/^ERROR:/i.test(rawContent)) {
    throw new Error(rawContent);
  }
  const prompt = boundOutput(rawContent, maxOutputChars);
  if (!prompt) {
    throw new Error("product-video-motion-prompt produced empty prompt");
  }

  const usage = {
    promptTokens: Number(llmResult.response?.usage?.prompt_tokens ?? 0),
    completionTokens: Number(llmResult.response?.usage?.completion_tokens ?? 0),
  };
  const creditsUsed = calculateCreditsForLLM(
    usage.promptTokens,
    usage.completionTokens,
    usedModelId
  );
  await deductCredits({
    userId: input.userId,
    tenantId: input.tenantId,
    amount: creditsUsed,
    description:
      "Marketplace Auto Review prompt skill: product-video-motion-prompt",
    idempotencyKey: [
      "marketplace-auto-review",
      "prompt-skill",
      PRODUCT_VIDEO_MOTION_PROMPT_SKILL_ID,
      input.runId ?? "no-run",
      input.unitId ?? "no-unit",
      input.attempt ?? "no-attempt",
    ].join(":"),
    skillSlug: PRODUCT_VIDEO_MOTION_PROMPT_SKILL_ID,
    sourceType: "skill",
    metadata: {
      skill: PRODUCT_VIDEO_MOTION_PROMPT_SKILL_ID,
      skillName: skill.name,
      runtimeKind: "llm",
      originSurface: "marketplace_capture",
      entryPoint: "marketplace_auto_review_video_stage",
      model: usedModelId ?? undefined,
      provider: llmResult.providerName,
      tokensUsed: usage.promptTokens + usage.completionTokens,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      referenceImageCount: referenceImages.length,
      maxOutputChars,
      runId: input.runId ?? null,
      unitId: input.unitId ?? null,
      attempt: input.attempt ?? null,
      visionFallback,
      visionModelAttempts,
    },
  }).catch(error => {
    // Credit accounting must never turn this enhancer into a run-killing gate.
    console.warn("[productVideoMotionPromptSkillRunner] credit_deduct_failed", {
      skillId: PRODUCT_VIDEO_MOTION_PROMPT_SKILL_ID,
      runId: input.runId ?? null,
      unitId: input.unitId ?? null,
      attempt: input.attempt ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const skillAudit: Record<string, unknown> = {
    selectedSkill: PRODUCT_VIDEO_MOTION_PROMPT_SKILL_ID,
    skillName: skill.name,
    modelId: usedModelId,
    providerName: llmResult.providerName,
    maxOutputChars,
    outputLengthChars: prompt.length,
    originalOutputLengthChars: rawContent.length,
    outputPreview: prompt.slice(
      0,
      PRODUCT_VIDEO_MOTION_PROMPT_OUTPUT_AUDIT_PREVIEW_CHARS
    ),
    referenceImageCount: referenceImages.length,
    hasMotionDirection: cleanInputString(input.facts.motionDirection).length > 0,
    hasStopFrame: cleanInputString(input.facts.stopFrameUrl).length > 0,
    visionFallback,
    visionModelAttempts,
  };

  console.info("[productVideoMotionPromptSkillRunner] completed", {
    skillId: PRODUCT_VIDEO_MOTION_PROMPT_SKILL_ID,
    runId: input.runId ?? null,
    unitId: input.unitId ?? null,
    attempt: input.attempt ?? null,
    modelId: usedModelId,
    providerName: llmResult.providerName,
    outputLengthChars: prompt.length,
    maxOutputChars,
    visionFallback,
    visionModelAttempts,
  });

  return {
    prompt,
    rawOutput: rawContent,
    usage,
    creditsUsed,
    modelId: usedModelId,
    providerName: llmResult.providerName,
    visionFallback,
    visionModelAttempts,
    skillAudit,
  };
}

/**
 * Test seam for the skill loader: expose the resolved skill folder + input
 * schema path without invoking the LLM.
 */
export function resolveProductVideoMotionPromptSkillInputSchemaPathForTest(
  skill: SkillDefinition
): string | null {
  for (const skillDir of skillFolderCandidates(skill)) {
    const schemaPath = path.join(skillDir, "schemas", "input.schema.json");
    if (fs.existsSync(schemaPath)) return schemaPath;
  }
  return null;
}
