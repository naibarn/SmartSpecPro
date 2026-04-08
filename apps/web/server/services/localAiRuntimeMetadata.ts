import { z } from "zod";
import type { MessageRuntimeMetadata } from "../../../../packages/local-ai-core/src/index";
import {
  LOCAL_AI_TASK_CLASSES,
  LOCAL_AI_VOICE_INPUT_MODES,
} from "../../../../packages/local-ai-core/src/index";

const MAX_RUNTIME_METADATA_STRING_LENGTH = 160;

function normalizeShortString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.slice(0, MAX_RUNTIME_METADATA_STRING_LENGTH);
}

function isKnownTaskClass(value: unknown): value is NonNullable<
  MessageRuntimeMetadata["taskClass"]
> {
  return (
    typeof value === "string" &&
    LOCAL_AI_TASK_CLASSES.includes(
      value as (typeof LOCAL_AI_TASK_CLASSES)[number],
    )
  );
}

function isKnownVoiceInputMode(
  value: unknown,
): value is NonNullable<MessageRuntimeMetadata["voiceInputMode"]> {
  return (
    typeof value === "string" &&
    LOCAL_AI_VOICE_INPUT_MODES.includes(
      value as (typeof LOCAL_AI_VOICE_INPUT_MODES)[number],
    )
  );
}

export const clientMessageRuntimeMetadataInputSchema = z
  .object({
    source: z.enum(["cloud", "hybrid"]).optional(),
    taskClass: z.enum(LOCAL_AI_TASK_CLASSES).optional(),
    profileId: z.string().trim().min(1).max(MAX_RUNTIME_METADATA_STRING_LENGTH).optional(),
    provider: z
      .string()
      .trim()
      .min(1)
      .max(MAX_RUNTIME_METADATA_STRING_LENGTH)
      .optional(),
    model: z
      .string()
      .trim()
      .min(1)
      .max(MAX_RUNTIME_METADATA_STRING_LENGTH)
      .optional(),
    fallbackReason: z
      .string()
      .trim()
      .min(1)
      .max(MAX_RUNTIME_METADATA_STRING_LENGTH)
      .optional(),
    tokenSavedEstimate: z.number().int().min(0).max(1_000_000).optional(),
    voiceInputMode: z.enum(LOCAL_AI_VOICE_INPUT_MODES).optional(),
  })
  .strict();

export function sanitizeMessageRuntimeMetadata(
  input: Partial<MessageRuntimeMetadata> | null | undefined,
): MessageRuntimeMetadata {
  return {
    source: input?.source === "hybrid" ? "hybrid" : "cloud",
    taskClass: isKnownTaskClass(input?.taskClass) ? input?.taskClass : null,
    profileId: normalizeShortString(input?.profileId),
    provider: normalizeShortString(input?.provider),
    model: normalizeShortString(input?.model),
    fallbackReason: normalizeShortString(input?.fallbackReason),
    tokenSavedEstimate:
      typeof input?.tokenSavedEstimate === "number" &&
      Number.isFinite(input.tokenSavedEstimate) &&
      input.tokenSavedEstimate >= 0
        ? Math.trunc(input.tokenSavedEstimate)
        : null,
    voiceInputMode: isKnownVoiceInputMode(input?.voiceInputMode)
      ? input?.voiceInputMode
      : null,
  };
}
