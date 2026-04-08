import {
  LOCAL_AI_EXECUTION_MODES,
  LOCAL_AI_VOICE_INPUT_MODES,
  type LocalAiExecutionMode,
  type LocalAiConversationOverride,
  type LocalAiVoiceInputMode,
} from "@smartspec/local-ai-core";

export type ConversationDetectionMode = "ask" | "auto" | "explicit";

export interface ClientConversationSkillSettings {
  autoDetect: boolean;
  enabledSkills: string[];
  detectionMode: ConversationDetectionMode;
  localAiConversation?: LocalAiConversationOverride | null;
}

export const DEFAULT_CLIENT_CONVERSATION_SKILL_SETTINGS: Readonly<ClientConversationSkillSettings> = {
  autoDetect: true,
  enabledSkills: [],
  detectionMode: "auto",
  localAiConversation: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function readLocalAiConversationOverride(
  raw: unknown,
): LocalAiConversationOverride | null {
  if (!isRecord(raw)) {
    return null;
  }

  const mode: LocalAiExecutionMode | undefined =
    typeof raw.mode === "string" &&
    (LOCAL_AI_EXECUTION_MODES as readonly string[]).includes(raw.mode)
      ? (raw.mode as LocalAiExecutionMode)
      : undefined;
  const preferredProfileId =
    raw.preferredProfileId == null
      ? null
      : typeof raw.preferredProfileId === "string" &&
          raw.preferredProfileId.trim().length > 0
        ? raw.preferredProfileId.trim()
        : null;
  const voiceInputMode: LocalAiVoiceInputMode | undefined =
    typeof raw.voiceInputMode === "string" &&
    (LOCAL_AI_VOICE_INPUT_MODES as readonly string[]).includes(
      raw.voiceInputMode,
    )
      ? (raw.voiceInputMode as LocalAiVoiceInputMode)
      : undefined;
  const updatedAt =
    typeof raw.updatedAt === "string" && raw.updatedAt.trim().length > 0
      ? raw.updatedAt
      : null;
  const enabled =
    typeof raw.enabled === "boolean" ? raw.enabled : undefined;
  const disableForConversation =
    raw.disableForConversation === true ? true : undefined;

  if (
    enabled === undefined &&
    disableForConversation === undefined &&
    mode === undefined &&
    preferredProfileId === null &&
    voiceInputMode === undefined &&
    updatedAt === null
  ) {
    return null;
  }

  return {
    ...(enabled !== undefined ? { enabled } : {}),
    ...(disableForConversation !== undefined ? { disableForConversation } : {}),
    ...(mode !== undefined ? { mode } : {}),
    ...(preferredProfileId !== null ? { preferredProfileId } : {}),
    ...(voiceInputMode !== undefined ? { voiceInputMode } : {}),
    ...(updatedAt !== null ? { updatedAt } : {}),
  };
}

export function readClientConversationSkillSettings(
  raw: unknown,
): ClientConversationSkillSettings {
  if (!isRecord(raw)) {
    return {
      ...DEFAULT_CLIENT_CONVERSATION_SKILL_SETTINGS,
    };
  }

  const detectionMode: ConversationDetectionMode =
    raw.detectionMode === "ask" ||
    raw.detectionMode === "auto" ||
    raw.detectionMode === "explicit"
      ? raw.detectionMode
      : "auto";

  return {
    autoDetect: raw.autoDetect !== false,
    enabledSkills: Array.isArray(raw.enabledSkills)
      ? raw.enabledSkills.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
      : [],
    detectionMode,
    localAiConversation: readLocalAiConversationOverride(raw.localAiConversation),
  };
}

export function mergeClientConversationSkillSettings(
  current: unknown,
  patch: Partial<ClientConversationSkillSettings>,
): ClientConversationSkillSettings {
  const base = readClientConversationSkillSettings(current);

  return {
    autoDetect: patch.autoDetect ?? base.autoDetect,
    enabledSkills: patch.enabledSkills ?? base.enabledSkills,
    detectionMode: patch.detectionMode ?? base.detectionMode,
    localAiConversation:
      patch.localAiConversation === undefined
        ? base.localAiConversation ?? null
        : patch.localAiConversation,
  };
}
