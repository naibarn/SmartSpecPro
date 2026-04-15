"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_LOCAL_AI_SYNCED_PREFERENCES = exports.LOCAL_AI_TASK_CLASSES = exports.LOCAL_AI_HANDS_FREE_MODES = exports.LOCAL_AI_VOICE_READBACK_MODES = exports.LOCAL_AI_VOICE_INPUT_MODES = exports.LOCAL_AI_EXECUTION_MODES = void 0;
exports.LOCAL_AI_EXECUTION_MODES = [
    "off",
    "auto",
    "prefer_local",
    "local_only",
    "cloud_only",
];
exports.LOCAL_AI_VOICE_INPUT_MODES = [
    "legacy_stt",
    "gemma4_local",
    "auto",
];
exports.LOCAL_AI_VOICE_READBACK_MODES = [
    "off",
    "important_only",
    "all_responses",
];
exports.LOCAL_AI_HANDS_FREE_MODES = [
    "off",
    "wake_phrase",
];
exports.LOCAL_AI_TASK_CLASSES = [
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
];
exports.DEFAULT_LOCAL_AI_SYNCED_PREFERENCES = {
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
