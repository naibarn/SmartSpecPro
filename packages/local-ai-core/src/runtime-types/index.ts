export const LOCAL_AI_EXECUTION_MODES = [
  "off",
  "auto",
  "prefer_local",
  "local_only",
  "cloud_only",
] as const;

export type LocalAiExecutionMode =
  (typeof LOCAL_AI_EXECUTION_MODES)[number];

export const LOCAL_AI_VOICE_INPUT_MODES = [
  "legacy_stt",
  "gemma4_local",
  "auto",
] as const;

export type LocalAiVoiceInputMode =
  (typeof LOCAL_AI_VOICE_INPUT_MODES)[number];

export const LOCAL_AI_VOICE_READBACK_MODES = [
  "off",
  "important_only",
  "all_responses",
] as const;

export type LocalAiVoiceReadbackMode =
  (typeof LOCAL_AI_VOICE_READBACK_MODES)[number];

export const LOCAL_AI_HANDS_FREE_MODES = [
  "off",
  "wake_phrase",
] as const;

export type LocalAiHandsFreeMode =
  (typeof LOCAL_AI_HANDS_FREE_MODES)[number];

export const LOCAL_AI_TASK_CLASSES = [
  "general_chat",
  "summarization",
  "context_compaction",
  "json_extraction",
  "voice_command",
  "voice_dictation",
  "ocr_cleanup",
  "image_understanding",
  "document_ocr",
  "heavy_reasoning",
] as const;

export type LocalAiTaskClass = (typeof LOCAL_AI_TASK_CLASSES)[number];

export type LocalAiRuntimeSource = "hybrid" | "cloud";

export interface LocalAiSyncedPreferences {
  enabled: boolean;
  mode: LocalAiExecutionMode;
  defaultModelId: string | null;
  useForGeneralChat: boolean;
  useForSummaries: boolean;
  useForImageTasks: boolean;
  enableVoiceCommands: boolean;
  voiceInputMode: LocalAiVoiceInputMode;
  voiceReadbackMode: LocalAiVoiceReadbackMode;
  voiceReadbackLanguage: string | null;
  voiceReadbackRate: number;
  voiceReadbackOnlyForVoiceCommands: boolean;
  voiceSearchUsesLocation: boolean;
  handsFreeMode: LocalAiHandsFreeMode;
  wakePhrase: string | null;
}

export const DEFAULT_LOCAL_AI_SYNCED_PREFERENCES: Readonly<LocalAiSyncedPreferences> = {
  enabled: false,
  mode: "off",
  defaultModelId: null,
  useForGeneralChat: false,
  useForSummaries: true,
  useForImageTasks: false,
  enableVoiceCommands: false,
  voiceInputMode: "legacy_stt",
  voiceReadbackMode: "off",
  voiceReadbackLanguage: null,
  voiceReadbackRate: 1,
  voiceReadbackOnlyForVoiceCommands: false,
  voiceSearchUsesLocation: false,
  handsFreeMode: "off",
  wakePhrase: "hey smartspec",
};

export interface LocalAiConversationOverride {
  enabled?: boolean;
  mode?: LocalAiExecutionMode;
  preferredProfileId?: string | null;
  disableForConversation?: boolean;
  voiceInputMode?: LocalAiVoiceInputMode;
  updatedAt?: string | null;
}

export interface MessageRuntimeMetadata {
  source: LocalAiRuntimeSource;
  taskClass?: LocalAiTaskClass | null;
  profileId?: string | null;
  provider?: string | null;
  model?: string | null;
  fallbackReason?: string | null;
  tokenSavedEstimate?: number | null;
  voiceInputMode?: LocalAiVoiceInputMode | null;
}

export interface TeamRoomRuntimeDisclosure {
  source: LocalAiRuntimeSource;
  taskClass?: LocalAiTaskClass | null;
  profileId?: string | null;
  fallbackReason?: string | null;
  voiceInputMode?: LocalAiVoiceInputMode | null;
}

export interface TeamRoomMessageMetadata {
  runtimeDisclosure?: TeamRoomRuntimeDisclosure;
  runtimeMetadata?: Record<string, unknown>;
  [key: string]: unknown;
}
