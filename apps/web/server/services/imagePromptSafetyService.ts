import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeSkillLlmWithFallback } from "./skillModelFallback";
import {
  analyzeVerticalDramaStorySafety,
  isBlockingVerticalDramaStorySafety,
} from "./verticalDramaStorySafety";

const STANDARD_SKILL_ID = "image-prompt-safety-rewriter";
const VERTICAL_DRAMA_COVER_SKILL_ID =
  "vertical-drama-episode-cover-safety-rewriter";
const SKILL_VERSION = "1.0.0";
const MAX_PROMPT_LENGTH = 20_000;
const MAX_SAFETY_REVIEW_ATTEMPTS = 2;
const SAFETY_REVIEW_RETRY_DELAY_MS = process.env.NODE_ENV === "test" ? 0 : 750;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export const IMAGE_PROMPT_SAFETY_UNAVAILABLE_MESSAGE =
  "Image prompt safety review was unavailable for a sensitive prompt.";

export type ImagePromptSafetyMode =
  | "standard"
  | "vertical_drama_managed"
  | "vertical_drama_cover";
export type ImagePromptRiskLevel = "low" | "medium" | "high";

export interface ImagePromptSafetyMetadata {
  checked: true;
  mode: ImagePromptSafetyMode;
  skillId: string;
  skillVersion: string;
  riskLevel: ImagePromptRiskLevel | "managed";
  rewritten: boolean;
  fallback: boolean;
  blocked: boolean;
  originalPromptHash: string;
  safePromptHash: string;
  changes: string[];
  preservedIntent: string[];
}

export interface ImagePromptSafetyInput {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  aspectRatio?: string;
  referenceImageCount?: number;
  userId?: number;
  mode?: ImagePromptSafetyMode;
}

export interface ImagePromptSafetyResult {
  prompt: string;
  metadata: ImagePromptSafetyMetadata;
}

export class ImagePromptSafetyError extends Error {
  readonly code: "blocked" | "unavailable" | "invalid_output";

  constructor(code: ImagePromptSafetyError["code"], message: string) {
    super(message);
    this.name = "ImagePromptSafetyError";
    this.code = code;
  }
}

export function hashImagePrompt(prompt: string): string {
  return crypto.createHash("sha256").update(prompt, "utf8").digest("hex");
}

function loadSafetySkill(skillId: string): string {
  const candidates = [
    path.resolve(process.cwd(), "skills", skillId, "skill.md"),
    path.resolve(process.cwd(), "apps", "web", "skills", skillId, "skill.md"),
    path.resolve(process.cwd(), "..", "skills", skillId, "skill.md"),
    path.resolve(moduleDir, "..", "..", "skills", skillId, "skill.md"),
  ];
  for (const skillPath of candidates) {
    try {
      return fs.readFileSync(skillPath, "utf8");
    } catch {
      // Try the next known workspace/runtime location.
    }
  }
  return "";
}

function detectPromptRisk(
  prompt: string,
  mode: ImagePromptSafetyMode = "standard",
): ImagePromptRiskLevel {
  const normalized = prompt.toLocaleLowerCase();
  const highRiskMarkers = [
    "porn",
    "explicit sex",
    "sexual intercourse",
    "genitals",
    "nude child",
    "naked child",
    "เด็กเปลือย",
    "ภาพโป๊",
    "อวัยวะเพศ",
  ];
  if (highRiskMarkers.some(marker => normalized.includes(marker))) {
    return "high";
  }

  if (mode === "vertical_drama_cover") {
    const graphicMarkers = [
      "blood",
      "bleeding",
      "gore",
      "graphic injury",
      "stabbed",
      "shooting",
      "ยิง",
      "เลือด",
      "ศพ",
      "แทง",
    ];
    if (graphicMarkers.some(marker => normalized.includes(marker))) {
      return "high";
    }
    const sensitiveDramaMarkers = [
      "weapon",
      "gun",
      "knife",
      "threat",
      "threatening",
      "forced",
      "restrained",
      "hostage",
      "kidnap",
      "assault",
      "ข่มขู่",
      "บังคับ",
      "จับตัว",
      "อาวุธ",
      "มีด",
    ];
    if (sensitiveDramaMarkers.some(marker => normalized.includes(marker))) {
      return "medium";
    }
  }

  const minorMarkers = [
    "child",
    "children",
    "kid",
    "infant",
    "newborn",
    "baby",
    "toddler",
    "minor",
    "ทารก",
    "เด็ก",
    "ลูกน้อย",
  ];
  const sensitiveContextMarkers = [
    "anatom",
    "medical",
    "umbilical",
    "navel",
    "skin",
    "body",
    "close-up",
    "close up",
    "กายวิภาค",
    "การแพทย์",
    "สะดือ",
    "ผิวหนัง",
    "ร่างกาย",
    "ระยะใกล้",
  ];
  if (
    minorMarkers.some(marker => normalized.includes(marker)) &&
    sensitiveContextMarkers.some(marker => normalized.includes(marker))
  ) {
    return "medium";
  }

  return "low";
}

function stripCodeFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseSafetyResponse(content: string): {
  safePrompt: string;
  riskLevel: ImagePromptRiskLevel;
  blocked: boolean;
  changes: string[];
  preservedIntent: string[];
} | null {
  const normalized = stripCodeFence(content);
  const candidates = [normalized];
  const firstBrace = normalized.indexOf("{");
  const lastBrace = normalized.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(normalized.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const safePrompt =
        typeof parsed.safePrompt === "string" ? parsed.safePrompt.trim() : "";
      const riskLevel = parsed.riskLevel;
      if (
        (riskLevel !== "low" &&
          riskLevel !== "medium" &&
          riskLevel !== "high") ||
        (!safePrompt && parsed.blocked !== true)
      ) {
        continue;
      }
      return {
        safePrompt,
        riskLevel,
        blocked: parsed.blocked === true,
        changes: Array.isArray(parsed.changes)
          ? parsed.changes
              .filter((value): value is string => typeof value === "string")
              .slice(0, 12)
          : [],
        preservedIntent: Array.isArray(parsed.preservedIntent)
          ? parsed.preservedIntent
              .filter((value): value is string => typeof value === "string")
              .slice(0, 12)
          : [],
      };
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function buildFallbackSystemPrompt(skillId: string): string {
  return [
    "You are the image prompt safety rewriter skill.",
    loadSafetySkill(skillId),
    "Return only the required JSON object. Never return markdown or explanations.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildUserMessage(input: ImagePromptSafetyInput): string {
  return [
    "Review this original provider-ready image prompt and minimally rewrite it when needed.",
    "Preserve all allowed visual intent and text exactly where possible.",
    `Model: ${input.model || "unspecified"}`,
    `Aspect ratio: ${input.aspectRatio || "unspecified"}`,
    `Reference image count: ${input.referenceImageCount ?? 0}`,
    input.negativePrompt?.trim()
      ? `Existing negative prompt (do not intensify it): ${input.negativePrompt.trim()}`
      : "Existing negative prompt: none",
    "",
    "Original prompt:",
    input.prompt,
  ].join("\n");
}

function waitForSafetyReviewRetry(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, SAFETY_REVIEW_RETRY_DELAY_MS);
  });
}

function managedResult(input: ImagePromptSafetyInput): ImagePromptSafetyResult {
  const safePrompt = input.prompt.trim();
  const storySafety = analyzeVerticalDramaStorySafety(safePrompt);
  if (isBlockingVerticalDramaStorySafety(storySafety)) {
    throw new ImagePromptSafetyError(
      "blocked",
      "Vertical Drama image prompt contains a high-risk story context; repair the episode before generating media.",
    );
  }
  return {
    prompt: safePrompt,
    metadata: {
      checked: true,
      mode: "vertical_drama_managed",
      skillId: STANDARD_SKILL_ID,
      skillVersion: SKILL_VERSION,
      riskLevel: "managed",
      rewritten: false,
      fallback: false,
      blocked: false,
      originalPromptHash: hashImagePrompt(safePrompt),
      safePromptHash: hashImagePrompt(safePrompt),
      changes: [],
      preservedIntent: ["Vertical Drama prompt pipeline owns safety review"],
    },
  };
}

export async function prepareImagePromptSafety(
  input: ImagePromptSafetyInput
): Promise<ImagePromptSafetyResult> {
  const originalPrompt = input.prompt.trim();
  if (!originalPrompt) {
    throw new ImagePromptSafetyError(
      "invalid_output",
      "Image prompt cannot be empty."
    );
  }
  if (input.mode === "vertical_drama_managed") {
    return managedResult({ ...input, prompt: originalPrompt });
  }

  const skillId =
    input.mode === "vertical_drama_cover"
      ? VERTICAL_DRAMA_COVER_SKILL_ID
      : STANDARD_SKILL_ID;
  const reviewMode: ImagePromptSafetyMode =
    input.mode === "vertical_drama_cover" ? "vertical_drama_cover" : "standard";
  const detectedRisk = detectPromptRisk(originalPrompt, input.mode);
  let parsed: ReturnType<typeof parseSafetyResponse> = null;
  for (let attempt = 0; attempt < MAX_SAFETY_REVIEW_ATTEMPTS; attempt++) {
    const result = await executeSkillLlmWithFallback({
      skillSlug: skillId,
      userId: input.userId ?? 0,
      executionPolicy: {
        modelId: null,
        allowFreeModels: true,
        modelSource: "system_default",
      },
      maxModelAttempts: 2,
      maxTokens: 1400,
      temperature: 0.1,
      messages: [
        { role: "system", content: buildFallbackSystemPrompt(skillId) },
        {
          role: "user",
          content: buildUserMessage({ ...input, prompt: originalPrompt }),
        },
      ],
    });

    parsed =
      result.success && result.content
        ? parseSafetyResponse(result.content)
        : null;
    if (
      parsed ||
      detectedRisk === "low" ||
      attempt === MAX_SAFETY_REVIEW_ATTEMPTS - 1
    ) {
      break;
    }
    await waitForSafetyReviewRetry();
  }

  if (!parsed) {
    if (detectedRisk === "high" || detectedRisk === "medium") {
      throw new ImagePromptSafetyError(
        "unavailable",
        IMAGE_PROMPT_SAFETY_UNAVAILABLE_MESSAGE
      );
    }
    return {
      prompt: originalPrompt,
      metadata: {
        checked: true,
        mode: reviewMode,
        skillId,
        skillVersion: SKILL_VERSION,
        riskLevel: detectedRisk,
        rewritten: false,
        fallback: true,
        blocked: false,
        originalPromptHash: hashImagePrompt(originalPrompt),
        safePromptHash: hashImagePrompt(originalPrompt),
        changes: [],
        preservedIntent: [],
      },
    };
  }

  if (parsed.blocked) {
    throw new ImagePromptSafetyError(
      "blocked",
      "Image prompt was blocked by the image safety skill."
    );
  }
  if (parsed.safePrompt.length > MAX_PROMPT_LENGTH) {
    throw new ImagePromptSafetyError(
      "invalid_output",
      `Image safety skill output exceeds ${MAX_PROMPT_LENGTH} characters.`
    );
  }

  const safePrompt = parsed.safePrompt || originalPrompt;
  return {
    prompt: safePrompt,
    metadata: {
      checked: true,
      mode: reviewMode,
      skillId,
      skillVersion: SKILL_VERSION,
      riskLevel: parsed.riskLevel,
      rewritten: safePrompt !== originalPrompt,
      fallback: false,
      blocked: false,
      originalPromptHash: hashImagePrompt(originalPrompt),
      safePromptHash: hashImagePrompt(safePrompt),
      changes: parsed.changes,
      preservedIntent: parsed.preservedIntent,
    },
  };
}

/**
 * An episode-cover request is prepared in the router because Hermes bypasses
 * the normal media service. The normal media path may see that same request
 * again; reuse is allowed only for the dedicated cover marker and an exact
 * safe-prompt hash match.
 */
export function isReusablePreparedEpisodeCoverSafety(input: {
  prompt: string;
  extraParams?: Record<string, unknown>;
}): boolean {
  const marker = input.extraParams?.__prompt_safety;
  if (!marker || typeof marker !== "object") return false;
  const value = marker as Record<string, unknown>;
  return (
    input.extraParams?.__vd_purpose === "episode_cover" &&
    value.checked === true &&
    value.mode === "vertical_drama_cover" &&
    value.skillId === VERTICAL_DRAMA_COVER_SKILL_ID &&
    typeof value.safePromptHash === "string" &&
    value.safePromptHash === hashImagePrompt(input.prompt)
  );
}

export function isVerticalDramaImageRequest(input: {
  auditContext?: { source?: string; [key: string]: unknown };
  characterPromptContext?: unknown;
  extraParams?: Record<string, unknown>;
}): boolean {
  const source =
    typeof input.auditContext?.source === "string"
      ? input.auditContext.source
      : "";
  const normalizedSource = source.toLocaleLowerCase().replace(/[_-]/g, "");
  if (normalizedSource.includes("verticaldrama")) return true;
  if (
    input.extraParams &&
    Object.keys(input.extraParams).some(key => key.startsWith("__vd_"))
  ) {
    return true;
  }
  const context = input.characterPromptContext as
    | Record<string, unknown>
    | undefined;
  return context?.marker === "vertical_drama_character_v1";
}
