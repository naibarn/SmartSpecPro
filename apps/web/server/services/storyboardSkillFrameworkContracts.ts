import crypto from "node:crypto";
import { z } from "zod";

export const STORYBOARD_MIN_SHOTS = 2;
export const STORYBOARD_MAX_SHOTS = 12;
export const STORYBOARD_DEFAULT_SHOTS = 9;
export const STORYBOARD_SHOT_DURATION_SEC = 10;
export const STORYBOARD_ASPECT_RATIO = "9:16" as const;

export const storyboardIdeaExpansionSchema = z
  .object({
    projectTitle: z.string().trim().min(1).max(256),
    videoIdea: z.string().trim().min(1).max(12000),
    sceneDetail: z.string().trim().min(1).max(12000),
    customActivity: z.string().trim().min(1).max(12000),
    customNotes: z.string().trim().min(1).max(16000),
  })
  .strict();
export type StoryboardIdeaExpansion = z.infer<
  typeof storyboardIdeaExpansionSchema
>;

export const STORYBOARD_IDEA_EXPANSION_FIELD_MAP = {
  sceneDetail: "scene_detail",
  customActivity: "custom_activity",
  customNotes: "custom_notes",
} as const;

export function mapStoryboardIdeaExpansionToSkillInputs(
  expansion: StoryboardIdeaExpansion,
  skillProperties: Record<string, unknown>,
  currentSkillInputs: Record<string, unknown> = {},
): Record<string, unknown> {
  const next = { ...currentSkillInputs };
  for (const [sourceKey, skillKey] of Object.entries(
    STORYBOARD_IDEA_EXPANSION_FIELD_MAP,
  ) as Array<
    [keyof typeof STORYBOARD_IDEA_EXPANSION_FIELD_MAP, string]
  >) {
    if (skillProperties[skillKey] !== undefined) {
      next[skillKey] = expansion[sourceKey];
    }
  }
  return next;
}

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
/** Terminal runs that must not be presented as resumable/unfinished work. */
export const STORYBOARD_RECOVERY_INDEX_EXCLUDED_STATUSES = [
  "succeeded",
  "cancelled",
] as const;
export type StoryboardRunStatus =
  | "awaiting_confirmation"
  | "queued"
  | "running"
  | "partial"
  | "succeeded"
  | "failed"
  | "paused"
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

export function isStoryboardExecutionStopped(status: string): boolean {
  return status === "paused" || status === "cancel_requested" || status === "cancelled";
}

/** A successful durable image is reusable and must never be submitted again. */
export function isReusableStoryboardImage(input: {
  status: string;
  imageAssetId?: unknown;
  suppressedResult?: unknown;
}): boolean {
  const assetId = Number(input.imageAssetId);
  return input.status === "succeeded"
    && Number.isSafeInteger(assetId)
    && assetId > 0
    && input.suppressedResult !== true;
}

export function isRetryableStoryboardShotStatus(status: string): boolean {
  return status === "failed" || status === "partial";
}

export function isRepairableStoryboardShot(
  status: string,
  _error: unknown,
): boolean {
  if (!isRetryableStoryboardShotStatus(status)) return false;
  // This predicate is for an explicit user repair action. Unknown provider
  // outcomes are not safe for automatic retry, but they must remain
  // recoverable instead of becoming an unrepairable dead end.
  return true;
}

export type StoryboardGenerationFailureClass = "policy" | "transient" | "permanent" | "unknown";

function sanitizeStoryboardFailureDetail(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/(bearer\s+)[^\s,;]+/gi, "$1[redacted]")
    .replace(/((?:token|secret|authorization|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, "$1[redacted]")
    .slice(0, 500);
}

export function classifyStoryboardGenerationError(error: unknown): {
  class: StoryboardGenerationFailureClass;
  code: string;
  message: string;
  detail: string;
  statusCode?: number;
} {
  const rawMessage = (error instanceof Error ? error.message : String(error ?? "Unknown provider error"))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000) || "Unknown provider error";
  const detail = sanitizeStoryboardFailureDetail(rawMessage);
  const lower = rawMessage.toLowerCase();
  const statusCode = error && typeof error === "object" && !Array.isArray(error)
    ? Number((error as Record<string, unknown>).statusCode)
    : Number.NaN;
  const classified = <T extends { class: StoryboardGenerationFailureClass; code: string; message: string }>(
    result: T,
  ): T & { detail: string; statusCode?: number } => ({
    ...result,
    detail,
    ...(Number.isFinite(statusCode) ? { statusCode } : {}),
  });
  if (statusCode === 429 || (statusCode >= 500 && statusCode <= 599)) {
    return classified({ class: "transient", code: "IMAGE_PROVIDER_TRANSIENT", message: "The image provider is temporarily unavailable." });
  }
  if (statusCode >= 400 && statusCode < 500 && statusCode !== 409) {
    return classified({ class: "permanent", code: "IMAGE_PROVIDER_PERMANENT", message: "The image provider rejected the request." });
  }
  if (/(insufficient|not enough|no enough).*(credit|point)|credit.*(required|balance|exhausted)/.test(lower)) {
    return classified({ class: "permanent", code: "STORYBOARD_INSUFFICIENT_CREDITS", message: "There are not enough credits to generate this image." });
  }
  if (/storyboard_reference|reference (asset|image).*(not found|missing|invalid)|asset.*not found/.test(lower)) {
    return classified({ class: "permanent", code: "STORYBOARD_REFERENCE_INVALID", message: "A storyboard reference image is missing or invalid." });
  }
  if (/(model|image model).*(not found|unavailable|unsupported)|selected model/.test(lower)) {
    return classified({ class: "permanent", code: "STORYBOARD_MODEL_UNAVAILABLE", message: "The selected image model is unavailable." });
  }
  if (/(database unavailable|database not available|credit_ledger_write_failed|deadlock|could not serialize)/.test(lower)) {
    return classified({ class: "transient", code: "STORYBOARD_DEPENDENCY_TRANSIENT", message: "A required service was temporarily unavailable." });
  }
  if (/(content|safety|policy|moderation|prompt|provider).*(invalid|blocked|violation|reject)|invalid prompt|safety filter/.test(lower)) {
    return classified({ class: "policy", code: "IMAGE_PROMPT_CONSTRAINT", message: "The provider rejected the image prompt for a content or safety constraint." });
  }
  if (/(429|rate limit|502|503|504)/.test(lower)) {
    return classified({ class: "transient", code: "IMAGE_PROVIDER_TRANSIENT", message: "The image provider is temporarily unavailable." });
  }
  // A network failure after submission can mean the provider accepted the
  // operation but the response was lost. Keep these cases fail-closed until
  // the deterministic operation key/reference is reconciled.
  if (/(timeout|timed out|deadline|socket hang up|econnreset|connection reset|temporar(?:ily)? unavailable)/.test(lower)) {
    return classified({ class: "unknown", code: "IMAGE_OPERATION_AMBIGUOUS", message: "The provider operation could not be verified and requires review." });
  }
  if (/(400|unsupported|invalid model|bad request|permission|unauthorized|forbidden)/.test(lower)) {
    return classified({ class: "permanent", code: "IMAGE_PROVIDER_PERMANENT", message: "The image provider rejected the request." });
  }
  return classified({ class: "unknown", code: "IMAGE_PROVIDER_UNKNOWN", message: "The image provider returned an unclassified error and requires review." });
}

export function escalateStoryboardProviderFailure(input: {
  failure: ReturnType<typeof classifyStoryboardGenerationError>;
  providerSubmissionStarted: boolean;
  creditSettled: boolean;
}): ReturnType<typeof classifyStoryboardGenerationError> {
  if (
    (input.providerSubmissionStarted || input.creditSettled) &&
    (input.failure.class === "transient" || input.failure.class === "unknown")
  ) {
    return {
      ...input.failure,
      class: "unknown",
      code: "STORYBOARD_PROVIDER_OPERATION_AMBIGUOUS",
      message: "The provider request may have started, so automatic retry is blocked until the operation is reconciled.",
    };
  }
  return input.failure;
}

/**
 * Conservative, deterministic repair used only after a policy/constraint
 * rejection. It preserves the authored story and adds an auditable repair
 * instruction instead of silently rewriting the creative idea.
 */
export function optimizeStoryboardPromptForConstraint(
  prompt: string,
  failureCode: string,
): string {
  const repair = failureCode === "IMAGE_PROMPT_CONSTRAINT"
    ? "Constraint repair: keep the scene family-friendly, non-graphic, non-sexual, and free of logos, copyrighted characters, readable text, and unsafe instructions."
    : "Constraint repair: simplify the visual description while preserving the same character, action, setting, and camera intent."
  const normalized = prompt.trim();
  return `${normalized}\n\n${repair}`.slice(0, 100000);
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

/**
 * Normalize the two reference shapes accepted by the Storyboard UI while
 * keeping raw storage keys scoped to the authenticated owner. Numeric values
 * are media-asset IDs and are resolved against PostgreSQL by the worker.
 */
export function normalizeStoryboardReferenceValue(
  value: string,
  tenantId: string,
  userId: number,
): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (
    normalized.startsWith("/api/storage/files/") ||
    normalized.startsWith("/uploads/") ||
    normalized.startsWith("http://") ||
    normalized.startsWith("https://")
  ) {
    return normalized;
  }
  const ownedPrefixes = [
    "chat/uploads/" + tenantId + "/" + userId + "/",
    "chat/uploads/" + userId + "/",
  ];
  return ownedPrefixes.some(prefix => normalized.startsWith(prefix))
    ? "/api/storage/files/" + encodeURIComponent(normalized)
    : null;
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
