import crypto from "node:crypto";
import { z } from "zod";

export const STORYBOARD_MIN_SHOTS = 2;
export const STORYBOARD_MAX_SHOTS = 12;
export const STORYBOARD_DEFAULT_SHOTS = 9;
export const STORYBOARD_SHOT_DURATION_SEC = 10;
export const STORYBOARD_ASPECT_RATIO = "9:16" as const;

export const storyboardStoryTypeSchema = z.enum(["mime", "dialogue", "hybrid"]);
export type StoryboardStoryType = z.infer<typeof storyboardStoryTypeSchema>;

export const storyboardReferenceSchema = z
  .object({
    assetId: z.string().trim().min(1).max(160),
    name: z.string().trim().max(255).optional(),
    role: z.string().trim().max(80).optional(),
  })
  .strict();
export type StoryboardReference = z.infer<typeof storyboardReferenceSchema>;

export const storyboardDialogueLineSchema = z
  .object({
    speaker: z.string().trim().min(1).max(120),
    text: z.string().trim().min(1).max(4000),
    language: z.string().trim().min(2).max(16),
  })
  .strict();

export const storyboardModelSelectionSchema = z
  .object({
    modelId: z.string().trim().min(1).max(160),
    quality: z.string().trim().min(1).max(64).optional(),
    providerId: z.string().trim().min(1).max(160).optional(),
  })
  .strict();
export type StoryboardModelSelection = z.infer<
  typeof storyboardModelSelectionSchema
>;

const boundedOptionalText = (max: number) =>
  z.string().trim().max(max).optional().default("");

export const storyboardGlobalInputSchema = z
  .object({
    title: z.string().trim().min(1).max(256),
    idea: z.string().trim().min(1).max(12000),
    storyType: storyboardStoryTypeSchema,
    targetPlatform: z.string().trim().min(1).max(64).default("short_video"),
    totalShots: z
      .number()
      .int()
      .min(STORYBOARD_MIN_SHOTS)
      .max(STORYBOARD_MAX_SHOTS)
      .default(STORYBOARD_DEFAULT_SHOTS),
    shotDurationSec: z
      .literal(STORYBOARD_SHOT_DURATION_SEC)
      .default(STORYBOARD_SHOT_DURATION_SEC),
    outputAspectRatio: z
      .literal(STORYBOARD_ASPECT_RATIO)
      .default(STORYBOARD_ASPECT_RATIO),
    selectedSkillId: z.string().trim().min(1).max(160),
    selectedSkillVersion: z.string().trim().min(1).max(64),
    imageModelSelection: storyboardModelSelectionSchema,
    videoModelSelection: storyboardModelSelectionSchema,
    language: z.string().trim().min(2).max(16).default("th"),
    productContext: boundedOptionalText(12000),
    dialogueLines: z.array(storyboardDialogueLineSchema).max(200).default([]),
    skillInputs: z.record(z.string(), z.unknown()).default({}),
    characterIds: z
      .array(z.string().trim().min(1).max(160))
      .max(50)
      .default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.storyType === "mime" && value.dialogueLines.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dialogueLines"],
        message: "Mime story cannot contain dialogue lines",
      });
    }
    if (value.storyType === "dialogue" && value.dialogueLines.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dialogueLines"],
        message: "Dialogue story requires at least one dialogue line",
      });
    }
  });
export type StoryboardGlobalInput = z.infer<typeof storyboardGlobalInputSchema>;

export function parseStoryboardDialogueDraft(
  value: string,
  language: string
): Array<{ speaker: string; text: string; language: string }> {
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const separator = line.indexOf(":");
      if (separator <= 0) return { speaker: "Narrator", text: line, language };
      return {
        speaker: line.slice(0, separator).trim(),
        text: line.slice(separator + 1).trim(),
        language,
      };
    })
    .filter(line => line.speaker.length > 0 && line.text.length > 0);
}

export const storyboardSkillSnapshotSchema = z
  .object({
    skillId: z.string().trim().min(1).max(160),
    version: z.string().trim().min(1).max(64),
    displayName: z.string().trim().min(1).max(256),
    category: z.string().trim().min(1).max(100),
    schemaHash: z.string().regex(/^[a-f0-9]{64}$/),
    inputSchema: z.record(z.string(), z.unknown()),
    uiSchema: z.record(z.string(), z.unknown()),
    parentOwnedFields: z.array(z.string()).max(100),
  })
  .strict();
export type StoryboardSkillSnapshot = z.infer<
  typeof storyboardSkillSnapshotSchema
>;

export const STORYBOARD_TERMINAL_RUN_STATUSES = [
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type StoryboardRunStatus =
  | "awaiting_confirmation"
  | "queued"
  | "running"
  | "partial"
  | "succeeded"
  | "failed"
  | "cancel_requested"
  | "cancelled";

export function buildStoryboardConfirmationFingerprint(
  normalized: StoryboardGlobalInput,
  skill: Pick<StoryboardSkillSnapshot, "skillId" | "version" | "schemaHash">
): string {
  return fingerprintStoryboardSnapshot({
    normalized,
    skillId: skill.skillId,
    skillVersion: skill.version,
    schemaHash: skill.schemaHash,
  });
}

export function isTerminalStoryboardRunStatus(
  status: string
): status is (typeof STORYBOARD_TERMINAL_RUN_STATUSES)[number] {
  return (STORYBOARD_TERMINAL_RUN_STATUSES as readonly string[]).includes(
    status
  );
}

export function isRetryableStoryboardShotStatus(status: string): boolean {
  return status === "failed" || status === "partial";
}

export const storyboardGenerationRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(100000),
    aspect_ratio: z.literal(STORYBOARD_ASPECT_RATIO),
    reference_images: z
      .array(z.record(z.string(), z.unknown()))
      .max(5)
      .default([]),
  })
  .passthrough();
export type StoryboardGenerationRequest = z.infer<
  typeof storyboardGenerationRequestSchema
>;

export const storyboardCanonicalSkillResponseSchema = z
  .object({
    success: z.literal(true),
    result: z
      .object({
        resolved: z.record(z.string(), z.unknown()).default({}),
        generation_prompt: z.string().trim().min(1).max(100000),
        generation_request: storyboardGenerationRequestSchema,
        prompt_debug: z.record(z.string(), z.unknown()).default({}),
      })
      .passthrough(),
  })
  .passthrough();
export type StoryboardCanonicalSkillResponse = z.infer<
  typeof storyboardCanonicalSkillResponseSchema
>;

export const storyboardPlannedShotSchema = z
  .object({
    shotNumber: z.number().int().min(1).max(STORYBOARD_MAX_SHOTS),
    beat: z.string().trim().min(1).max(80),
    context: z.string().trim().min(1).max(12000),
    continuity: z.string().trim().max(4000).default(""),
    dialogueLines: z.array(storyboardDialogueLineSchema).max(50).default([]),
  })
  .strict();
export type StoryboardPlannedShot = z.infer<typeof storyboardPlannedShotSchema>;

export function normalizeStoryboardGlobalInput(
  input: unknown
): StoryboardGlobalInput {
  const parsed = storyboardGlobalInputSchema.parse(input);
  return {
    ...parsed,
    title: parsed.title.trim(),
    idea: parsed.idea.trim(),
    productContext: parsed.productContext?.trim() ?? "",
    characterIds: [...new Set(parsed.characterIds.map(value => value.trim()))],
    skillInputs: Object.fromEntries(
      Object.entries(parsed.skillInputs).sort(([a], [b]) => a.localeCompare(b))
    ),
  };
}

export function fingerprintStoryboardSnapshot(snapshot: unknown): string {
  const normalized = JSON.stringify(snapshot, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      );
    }
    return value;
  });
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export function redactStoryboardValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (Array.isArray(value))
    return value
      .slice(0, 100)
      .map(item => redactStoryboardValue(item, depth + 1));
  if (!value || typeof value !== "object")
    return typeof value === "string" && value.length > 100000
      ? `${value.slice(0, 100000)}…`
      : value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (
      /token|secret|authorization|api[_-]?key|signed[_-]?url|provider[_-]?url/i.test(
        key
      )
    ) {
      output[key] = "[redacted]";
    } else {
      output[key] = redactStoryboardValue(child, depth + 1);
    }
  }
  return output;
}

export function assertCanonicalGenerationRequest(
  response: StoryboardCanonicalSkillResponse
): StoryboardCanonicalSkillResponse {
  if (
    response.result.generation_prompt !==
    response.result.generation_request.prompt
  ) {
    throw new Error("Canonical generation prompt mismatch");
  }
  return response;
}
