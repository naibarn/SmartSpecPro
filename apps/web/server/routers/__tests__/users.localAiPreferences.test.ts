import { describe, expect, it } from "vitest";
import { z } from "zod";

import { SUPPORTED_LANGUAGES } from "@shared/i18n";
import {
  LOCAL_AI_EXECUTION_MODES,
  LOCAL_AI_VOICE_INPUT_MODES,
  LOCAL_AI_VOICE_READBACK_MODES,
} from "../../../../../packages/local-ai-core/src/index";

const updatePreferencesSchema = z.object({
  translationLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
  translationModel: z.string().max(100).optional(),
  displayLocale: z.enum(SUPPORTED_LANGUAGES).optional(),
  localAi: z
    .object({
      enabled: z.boolean().optional(),
      mode: z.enum(LOCAL_AI_EXECUTION_MODES).optional(),
      defaultModelId: z.string().trim().max(120).nullable().optional(),
      useForGeneralChat: z.boolean().optional(),
      useForSummaries: z.boolean().optional(),
      useForImageTasks: z.boolean().optional(),
      enableVoiceCommands: z.boolean().optional(),
      voiceInputMode: z.enum(LOCAL_AI_VOICE_INPUT_MODES).optional(),
      voiceReadbackMode: z
        .enum(LOCAL_AI_VOICE_READBACK_MODES)
        .optional(),
    })
    .strict()
    .partial()
    .optional(),
});

describe("updatePreferences schema — localAi", () => {
  it("accepts partial localAi updates", () => {
    expect(
      updatePreferencesSchema.safeParse({
        localAi: {
          enabled: true,
          voiceInputMode: "legacy_stt",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects invalid localAi mode values", () => {
    expect(
      updatePreferencesSchema.safeParse({
        localAi: {
          mode: "shell_exec",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects invalid localAi voiceInputMode values", () => {
    expect(
      updatePreferencesSchema.safeParse({
        localAi: {
          voiceInputMode: "custom_provider",
        },
      }).success,
    ).toBe(false);
  });
});
