import { z } from "zod";
import type {
  LocalAiSyncedPreferences,
  LocalAiVoiceInputMode,
} from "../../../../packages/local-ai-core/src/index";
import {
  DEFAULT_LOCAL_AI_SYNCED_PREFERENCES,
  LOCAL_AI_EXECUTION_MODES,
  LOCAL_AI_HANDS_FREE_MODES,
  LOCAL_AI_VOICE_INPUT_MODES,
  LOCAL_AI_VOICE_READBACK_MODES,
} from "../../../../packages/local-ai-core/src/index";
import { isKnownLocalAiProfileId } from "./localAiCatalog";

const nullableShortString = z
  .string()
  .trim()
  .max(120)
  .nullable();

const nullableVoiceLanguage = z
  .string()
  .trim()
  .max(24)
  .nullable();

export const localAiPreferencesSchema = z
  .object({
    enabled: z.boolean().optional(),
    mode: z.enum(LOCAL_AI_EXECUTION_MODES).optional(),
    defaultModelId: nullableShortString.optional(),
    useForGeneralChat: z.boolean().optional(),
    useForSummaries: z.boolean().optional(),
    useForImageTasks: z.boolean().optional(),
    enableVoiceCommands: z.boolean().optional(),
    voiceInputMode: z.enum(LOCAL_AI_VOICE_INPUT_MODES).optional(),
    voiceReadbackMode: z.enum(LOCAL_AI_VOICE_READBACK_MODES).optional(),
    voiceReadbackLanguage: nullableVoiceLanguage.optional(),
    voiceReadbackRate: z.number().min(0.5).max(1.5).optional(),
    voiceReadbackOnlyForVoiceCommands: z.boolean().optional(),
    voiceSearchUsesLocation: z.boolean().optional(),
    handsFreeMode: z.enum(LOCAL_AI_HANDS_FREE_MODES).optional(),
    wakePhrase: nullableShortString.optional(),
  })
  .strict();

export type LocalAiPreferencesInput = z.infer<
  typeof localAiPreferencesSchema
>;

export function resolveLocalAiPreferences(
  input: unknown,
): LocalAiSyncedPreferences {
  const parsed = localAiPreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { ...DEFAULT_LOCAL_AI_SYNCED_PREFERENCES };
  }

  return {
    ...DEFAULT_LOCAL_AI_SYNCED_PREFERENCES,
    ...parsed.data,
    defaultModelId:
      typeof parsed.data.defaultModelId === "string" &&
      parsed.data.defaultModelId.trim().length > 0 &&
      isKnownLocalAiProfileId(parsed.data.defaultModelId)
        ? parsed.data.defaultModelId.trim()
        : null,
  };
}

export function mergeLocalAiPreferences(
  current: unknown,
  patch: LocalAiPreferencesInput | undefined,
): LocalAiSyncedPreferences {
  if (!patch) {
    return resolveLocalAiPreferences(current);
  }

  return resolveLocalAiPreferences({
    ...resolveLocalAiPreferences(current),
    ...patch,
  });
}

export function sanitizeUserPreferencesWithLocalAi<
  T extends Record<string, unknown>,
>(prefs: T): T & { localAi: LocalAiSyncedPreferences } {
  return {
    ...prefs,
    localAi: resolveLocalAiPreferences(prefs.localAi),
  };
}

export function getLocalAiVoiceConsentSummary(
  mode: LocalAiVoiceInputMode,
): "server_or_provider" | "local_device" | "mixed_auto" {
  if (mode === "legacy_stt") {
    return "server_or_provider";
  }
  if (mode === "gemma4_local") {
    return "local_device";
  }
  return "mixed_auto";
}
