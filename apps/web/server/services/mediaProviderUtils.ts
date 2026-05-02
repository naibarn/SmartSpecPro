export const WAVESPEED_PROVIDER = "wavespeed_ai";
export const WAVESPEED_LAUNCH_MODEL_ID = "wavespeed-ai/cinematic-video-generator";
export const WAVESPEED_LAUNCH_MODEL_NAME = "Seedance 2.0 Grade Cinematic Video Generator";
export const WAVESPEED_LAUNCH_MODEL_DESCRIPTION =
  "WaveSpeed Seedance 2.0 cinematic video generation with optional image guidance and native audio.";
export const WAVESPEED_ALLOWED_DURATIONS = [5, 10, 15] as const;
export const WAVESPEED_ALLOWED_ASPECT_RATIOS = ["16:9", "9:16", "4:3", "3:4"] as const;
export const WAVESPEED_SEEDANCE_ALLOWED_ASPECT_RATIOS = ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"] as const;
export const WAVESPEED_MAX_REFERENCE_IMAGES = 4;
export const WAVESPEED_PRICING_TIERS = {
  "5s": 800,
  "10s": 1600,
  "15s": 2400,
} as const;
export const WAVESPEED_SEEDANCE_STANDARD_PRICING_TIERS = {
  "5s": 900,
  "10s": 1800,
  "15s": 2700,
} as const;
export const WAVESPEED_SEEDANCE_FAST_PRICING_TIERS = {
  "5s": 600,
  "10s": 1200,
  "15s": 1800,
} as const;
export const WAVESPEED_SEEDANCE_2_FAST_TEXT_TO_VIDEO_MODEL_ID = "bytedance/seedance-2.0-fast/text-to-video";
export const WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID = "bytedance/seedance-2.0-fast/image-to-video";
export const WAVESPEED_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID = "bytedance/seedance-2.0/text-to-video";
export const WAVESPEED_SEEDANCE_2_IMAGE_TO_VIDEO_MODEL_ID = "bytedance/seedance-2.0/image-to-video";
export const WAVESPEED_QWEN3_TTS_FLASH_MODEL_ID = "alibaba/qwen3-tts-flash";
export const WAVESPEED_GEMINI_25_FLASH_TTS_MODEL_ID = "google/gemini-2.5-flash/text-to-speech";
export const WAVESPEED_GEMINI_25_PRO_TTS_MODEL_ID = "google/gemini-2.5-pro/text-to-speech";
export const WAVESPEED_LYRIA_3_CLIP_MUSIC_MODEL_ID = "google/lyria-3-clip/music";
export const WAVESPEED_LYRIA_3_PRO_MUSIC_MODEL_ID = "google/lyria-3-pro/music";
export const WAVESPEED_ELEVENLABS_VOICE_CHANGER_MODEL_ID = "wavespeed-ai/elevenlabs/voice-changer";
export const ELEVENLABS_PROVIDER = "elevenlabs";
export const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io";
export const ELEVENLABS_TEXT_TO_SPEECH_MODEL_ID = "elevenlabs/text-to-speech";
export const ELEVENLABS_VOICE_CHANGER_MODEL_ID = "elevenlabs/voice-changer";
export const ELEVENLABS_SPEECH_TO_TEXT_MODEL_ID = "elevenlabs/speech-to-text";
export const ELEVENLABS_SOUND_EFFECTS_MODEL_ID = "elevenlabs/sound-effects";
export const ELEVENLABS_VOICE_ISOLATOR_MODEL_ID = "elevenlabs/voice-isolator";

const ALLOWED_RELATIVE_MEDIA_REFERENCE_PREFIXES = [
  "/uploads/",
  "/api/storage/files/",
] as const;

export type WaveSpeedLaunchModelSeed = {
  modelId: string;
  name: string;
  description: string;
  modelType: "video" | "audio";
  provider: string;
  aliases: string[];
  creditCost: number;
  aspectRatios: string[];
  durations: number[];
  priority: number;
  sortOrder: number;
  isEnabled: boolean;
  configJson: Record<string, unknown>;
};

export type WaveSpeedModelSeed = WaveSpeedLaunchModelSeed;
export type ElevenLabsModelSeed = WaveSpeedLaunchModelSeed;

type WaveSpeedGenerateType = "text-to-video" | "image-to-video";
type WaveSpeedModelDefinition = {
  modelId: string;
  name: string;
  description: string;
  aliases: string[];
  submitEndpoint: string;
  generateType: WaveSpeedGenerateType;
  pricingTiers: Record<string, number>;
  aspectRatios: readonly string[];
  durations: readonly number[];
  maxReferenceImages: number;
  referenceImagesRequired: boolean;
  nativeAudio: boolean;
  priority: number;
  sortOrder: number;
};

type WaveSpeedAudioModelDefinition = {
  modelId: string;
  name: string;
  description: string;
  aliases: string[];
  submitEndpoint: string;
  generateType: "text-to-speech" | "music" | "audio-to-audio";
  pricingFormula: "flat" | "per_unit";
  pricingTiers: Record<string, number>;
  pricingUnitMetric?: "characters" | "items";
  pricingUnitField?: string;
  pricingUnitSize?: number;
  pricingUnitRounding?: "ceil" | "floor" | "round";
  pricingMinUnits?: number;
  maxPromptLength?: number;
  textInputKey: "text" | "prompt";
  inputFields: ModelInputFieldRecord[];
  priority: number;
  sortOrder: number;
};

type ModelInputFieldRecord = Record<string, unknown>;
type PublicUrlValidationOptions = {
  requireHttps?: boolean;
};
type ElevenLabsCapability =
  | "text_to_speech"
  | "voice_changer"
  | "speech_to_text"
  | "sound_effects"
  | "voice_isolator";
type ElevenLabsModelDefinition = {
  modelId: string;
  name: string;
  description: string;
  aliases: string[];
  apiEndpoint: string;
  capability: ElevenLabsCapability;
  requestContentType: "json" | "multipart";
  responseType: "audio" | "json";
  pricingFormula: "flat" | "per_unit";
  pricingTiers: Record<string, number>;
  pricingUnitMetric?: "characters" | "seconds" | "minutes";
  pricingUnitField?: string;
  pricingUnitSize?: number;
  pricingUnitRounding?: "ceil" | "floor" | "round";
  pricingMinUnits?: number;
  creditCost: number;
  inputFields: ModelInputFieldRecord[];
  priority: number;
  sortOrder: number;
};

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^\[::1?\]$/,
  /^::1$/,
  /^::ffff:127\./i,
  /^fe80:/i,
  /^fd[0-9a-f]{2}:/i,
  /^host\.docker\.internal$/i,
  /\.internal$/i,
  /\.local$/i,
];

const WAVESPEED_MODEL_DEFINITIONS: readonly WaveSpeedModelDefinition[] = [
  {
    modelId: WAVESPEED_LAUNCH_MODEL_ID,
    name: WAVESPEED_LAUNCH_MODEL_NAME,
    description: WAVESPEED_LAUNCH_MODEL_DESCRIPTION,
    aliases: [
      "wavespeed cinematic video generator",
      "wavespeed-ai cinematic video generator",
      "wavespeedai cinematic video generator",
      "seedance 2.0 grade cinematic video generator",
      "wavespeed_ai/cinematic-video-generator",
    ],
    submitEndpoint: "/wavespeed-ai/cinematic-video-generator",
    generateType: "text-to-video",
    pricingTiers: { ...WAVESPEED_PRICING_TIERS },
    aspectRatios: WAVESPEED_ALLOWED_ASPECT_RATIOS,
    durations: WAVESPEED_ALLOWED_DURATIONS,
    maxReferenceImages: WAVESPEED_MAX_REFERENCE_IMAGES,
    referenceImagesRequired: false,
    nativeAudio: true,
    priority: 6,
    sortOrder: 60,
  },
  {
    modelId: WAVESPEED_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID,
    name: "Seedance 2.0 Text-to-Video",
    description: "WaveSpeed ByteDance Seedance 2.0 text-to-video generation with native audio and optional reference-image guidance.",
    aliases: [
      "seedance 2.0 text to video",
      "seedance 2 text to video",
      "seedance 2.0 t2v",
      "bytedance seedance 2.0 text to video",
      "bytedance/seedance-2.0/text-to-video",
    ],
    submitEndpoint: "/bytedance/seedance-2.0/text-to-video",
    generateType: "text-to-video",
    pricingTiers: { ...WAVESPEED_SEEDANCE_STANDARD_PRICING_TIERS },
    aspectRatios: WAVESPEED_SEEDANCE_ALLOWED_ASPECT_RATIOS,
    durations: WAVESPEED_ALLOWED_DURATIONS,
    maxReferenceImages: WAVESPEED_MAX_REFERENCE_IMAGES,
    referenceImagesRequired: false,
    nativeAudio: true,
    priority: 7,
    sortOrder: 61,
  },
  {
    modelId: WAVESPEED_SEEDANCE_2_IMAGE_TO_VIDEO_MODEL_ID,
    name: "Seedance 2.0 Image-to-Video",
    description: "WaveSpeed ByteDance Seedance 2.0 image-to-video generation with required reference images and native audio.",
    aliases: [
      "seedance 2.0 image to video",
      "seedance 2 image to video",
      "seedance 2.0 i2v",
      "bytedance seedance 2.0 image to video",
      "bytedance/seedance-2.0/image-to-video",
    ],
    submitEndpoint: "/bytedance/seedance-2.0/image-to-video",
    generateType: "image-to-video",
    pricingTiers: { ...WAVESPEED_SEEDANCE_STANDARD_PRICING_TIERS },
    aspectRatios: WAVESPEED_SEEDANCE_ALLOWED_ASPECT_RATIOS,
    durations: WAVESPEED_ALLOWED_DURATIONS,
    maxReferenceImages: WAVESPEED_MAX_REFERENCE_IMAGES,
    referenceImagesRequired: true,
    nativeAudio: true,
    priority: 8,
    sortOrder: 62,
  },
  {
    modelId: WAVESPEED_SEEDANCE_2_FAST_TEXT_TO_VIDEO_MODEL_ID,
    name: "Seedance 2.0 Fast Text-to-Video",
    description: "WaveSpeed ByteDance Seedance 2.0 Fast text-to-video generation optimized for faster turnaround and lower cost.",
    aliases: [
      "seedance 2.0 fast text to video",
      "seedance 2 fast text to video",
      "seedance 2.0 fast t2v",
      "bytedance seedance 2.0 fast text to video",
      "bytedance/seedance-2.0-fast/text-to-video",
    ],
    submitEndpoint: "/bytedance/seedance-2.0-fast/text-to-video",
    generateType: "text-to-video",
    pricingTiers: { ...WAVESPEED_SEEDANCE_FAST_PRICING_TIERS },
    aspectRatios: WAVESPEED_SEEDANCE_ALLOWED_ASPECT_RATIOS,
    durations: WAVESPEED_ALLOWED_DURATIONS,
    maxReferenceImages: WAVESPEED_MAX_REFERENCE_IMAGES,
    referenceImagesRequired: false,
    nativeAudio: true,
    priority: 9,
    sortOrder: 63,
  },
  {
    modelId: WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID,
    name: "Seedance 2.0 Fast Image-to-Video",
    description: "WaveSpeed ByteDance Seedance 2.0 Fast image-to-video generation with required reference images, native audio, and faster turnaround.",
    aliases: [
      "seedance 2.0 fast image to video",
      "seedance 2 fast image to video",
      "seedance 2.0 fast i2v",
      "bytedance seedance 2.0 fast image to video",
      "bytedance/seedance-2.0-fast/image-to-video",
    ],
    submitEndpoint: "/bytedance/seedance-2.0-fast/image-to-video",
    generateType: "image-to-video",
    pricingTiers: { ...WAVESPEED_SEEDANCE_FAST_PRICING_TIERS },
    aspectRatios: WAVESPEED_SEEDANCE_ALLOWED_ASPECT_RATIOS,
    durations: WAVESPEED_ALLOWED_DURATIONS,
    maxReferenceImages: WAVESPEED_MAX_REFERENCE_IMAGES,
    referenceImagesRequired: true,
    nativeAudio: true,
    priority: 10,
    sortOrder: 64,
  },
] as const;

const GEMINI_TTS_VOICE_OPTIONS = [
  { value: "Zephyr", gender: "female", tone: "bright", useCase: "friendly explainers, product demos" },
  { value: "Puck", gender: "male", tone: "upbeat", useCase: "energetic hosts, creator content" },
  { value: "Charon", gender: "male", tone: "informative", useCase: "news reads, technical explainers" },
  { value: "Kore", gender: "female", tone: "firm", useCase: "announcements, confident narration" },
  { value: "Fenrir", gender: "male", tone: "excitable", useCase: "trailers, upbeat ads, gaming" },
  { value: "Leda", gender: "female", tone: "youthful", useCase: "education, social shorts, light stories" },
  { value: "Orus", gender: "male", tone: "firm", useCase: "corporate, authority, training" },
  { value: "Aoede", gender: "female", tone: "breezy", useCase: "lifestyle, beauty, casual explainers" },
  { value: "Callirrhoe", gender: "female", tone: "easy-going", useCase: "podcasts, soft brand narration" },
  { value: "Autonoe", gender: "female", tone: "bright", useCase: "assistant voice, friendly updates" },
  { value: "Enceladus", gender: "male", tone: "breathy", useCase: "intimate narration, tired or dramatic scenes" },
  { value: "Iapetus", gender: "male", tone: "clear", useCase: "tutorials, e-learning, documentation" },
  { value: "Umbriel", gender: "male", tone: "easy-going", useCase: "casual podcasts, conversational reads" },
  { value: "Algieba", gender: "male", tone: "smooth", useCase: "premium brand, polished narration" },
  { value: "Despina", gender: "female", tone: "smooth", useCase: "luxury, beauty, calm commercials" },
  { value: "Erinome", gender: "female", tone: "clear", useCase: "support, instructions, neutral narration" },
  { value: "Algenib", gender: "male", tone: "gravelly", useCase: "documentary, cinematic, character voice" },
  { value: "Rasalgethi", gender: "male", tone: "informative", useCase: "documentary, news analysis" },
  { value: "Laomedeia", gender: "female", tone: "upbeat", useCase: "ads, social content, promos" },
  { value: "Achernar", gender: "female", tone: "soft", useCase: "wellness, empathy, emotional reads" },
  { value: "Alnilam", gender: "male", tone: "firm", useCase: "executive, corporate, command voice" },
  { value: "Schedar", gender: "male", tone: "even", useCase: "balanced narration, long-form reads" },
  { value: "Gacrux", gender: "female", tone: "mature", useCase: "history, documentary, serious narration" },
  { value: "Pulcherrima", gender: "female", tone: "forward", useCase: "confident promos, calls to action" },
  { value: "Achird", gender: "male", tone: "friendly", useCase: "support, podcast host, explainer" },
  { value: "Zubenelgenubi", gender: "male", tone: "casual", useCase: "vlogs, conversational social clips" },
  { value: "Vindemiatrix", gender: "female", tone: "gentle", useCase: "meditation, guidance, soft narration" },
  { value: "Sadachbia", gender: "male", tone: "lively", useCase: "kids, playful ads, upbeat social" },
  { value: "Sadaltager", gender: "male", tone: "knowledgeable", useCase: "expert commentary, education" },
  { value: "Sulafat", gender: "female", tone: "warm", useCase: "e-learning, family, welcoming narration" },
].map((voice) => ({
  value: voice.value,
  label: `${voice.value} (${voice.gender}, ${voice.tone}) - ${voice.useCase}`,
}));

const GEMINI_TTS_LANGUAGE_OPTIONS = [
  "English (United States)",
  "English (India)",
  "French (France)",
  "German (Germany)",
  "Hindi (India)",
  "Indonesian (Indonesia)",
  "Thai (Thailand)",
  "Arabic (Egypt)",
  "Bangla (Bangladesh)",
  "Dutch (Netherlands)",
].map((language) => ({ value: language, label: language }));

const WAVESPEED_AUDIO_MODEL_DEFINITIONS: readonly WaveSpeedAudioModelDefinition[] = [
  {
    modelId: WAVESPEED_QWEN3_TTS_FLASH_MODEL_ID,
    name: "Qwen3 TTS Flash",
    description: "WaveSpeed Alibaba Qwen3 low-latency text-to-speech for English and Chinese.",
    aliases: ["qwen3 tts flash", "qwen tts", "alibaba qwen3 tts", "qwen3-tts-flash", "wavespeed qwen3 tts"],
    submitEndpoint: "/alibaba/qwen3-tts-flash",
    generateType: "text-to-speech",
    pricingFormula: "per_unit",
    pricingTiers: { default: 20 },
    pricingUnitMetric: "characters",
    pricingUnitField: "text",
    pricingUnitSize: 1000,
    pricingUnitRounding: "ceil",
    pricingMinUnits: 1,
    maxPromptLength: 600,
    textInputKey: "text",
    inputFields: [
      { key: "text", label: "Text", type: "text", required: true, syncWith: "prompt", maxLength: 600 },
      {
        key: "voice",
        label: "Voice",
        type: "select",
        required: true,
        default: "Cherry",
        options: [
          { value: "Cherry", label: "Cherry" },
          { value: "Serena", label: "Serena" },
          { value: "Ethan", label: "Ethan" },
          { value: "Chelsie", label: "Chelsie" },
          { value: "Dylan", label: "Dylan" },
        ],
      },
      {
        key: "language_type",
        label: "Language",
        type: "select",
        default: "English",
        options: [
          { value: "English", label: "English" },
          { value: "Chinese", label: "Chinese" },
        ],
      },
      { key: "speed", label: "Speed", type: "number", default: 1 },
      {
        key: "format",
        label: "Format",
        type: "select",
        default: "mp3",
        options: [{ value: "mp3", label: "MP3" }, { value: "wav", label: "WAV" }, { value: "ogg", label: "OGG" }],
      },
    ],
    priority: 11,
    sortOrder: 110,
  },
  {
    modelId: WAVESPEED_GEMINI_25_FLASH_TTS_MODEL_ID,
    name: "Gemini 2.5 Flash Text-to-Speech",
    description: "WaveSpeed Google Gemini 2.5 Flash multi-speaker text-to-speech.",
    aliases: [
      "gemini 2.5 flash tts",
      "gemini flash tts",
      "google gemini flash text to speech",
      "wavespeed/gemini-2.5-flash/text-to-speech",
      "wavespeed gemini 2.5 flash text to speech",
    ],
    submitEndpoint: "/google/gemini-2.5-flash/text-to-speech",
    generateType: "text-to-speech",
    pricingFormula: "per_unit",
    pricingTiers: { default: 40 },
    pricingUnitMetric: "characters",
    pricingUnitField: "text",
    pricingUnitSize: 1000,
    pricingUnitRounding: "ceil",
    pricingMinUnits: 1,
    textInputKey: "text",
    inputFields: [
      {
        key: "text",
        label: "Text",
        type: "text",
        required: true,
        syncWith: "prompt",
        description: "Gemini TTS has a 32k-token context window; split scripts longer than a few minutes for steadier voice quality.",
      },
      { key: "language", label: "Language", type: "select", required: true, default: "English (United States)", options: GEMINI_TTS_LANGUAGE_OPTIONS },
      {
        key: "speakers",
        label: "Speakers",
        type: "array",
        required: true,
        default: [{ speaker: "Speaker 1", voice: "Zephyr" }],
        itemTemplate: { speaker: "Speaker 1", voice: "Zephyr" },
        itemFields: [
          { key: "speaker", label: "Speaker", type: "text", required: true },
          { key: "voice", label: "Voice", type: "select", required: true, default: "Zephyr", options: GEMINI_TTS_VOICE_OPTIONS },
        ],
      },
    ],
    priority: 12,
    sortOrder: 111,
  },
  {
    modelId: WAVESPEED_GEMINI_25_PRO_TTS_MODEL_ID,
    name: "Gemini 2.5 Pro Text-to-Speech",
    description: "WaveSpeed Google Gemini 2.5 Pro premium multi-speaker text-to-speech.",
    aliases: [
      "gemini 2.5 pro tts",
      "gemini pro tts",
      "google gemini pro text to speech",
      "wavespeed/gemini-2.5-pro/text-to-speech",
      "wavespeed gemini 2.5 pro text to speech",
    ],
    submitEndpoint: "/google/gemini-2.5-pro/text-to-speech",
    generateType: "text-to-speech",
    pricingFormula: "per_unit",
    pricingTiers: { default: 80 },
    pricingUnitMetric: "characters",
    pricingUnitField: "text",
    pricingUnitSize: 1000,
    pricingUnitRounding: "ceil",
    pricingMinUnits: 1,
    textInputKey: "text",
    inputFields: [
      {
        key: "text",
        label: "Text",
        type: "text",
        required: true,
        syncWith: "prompt",
        description: "Gemini TTS has a 32k-token context window; split scripts longer than a few minutes for steadier voice quality.",
      },
      { key: "language", label: "Language", type: "select", required: true, default: "English (United States)", options: GEMINI_TTS_LANGUAGE_OPTIONS },
      {
        key: "speakers",
        label: "Speakers",
        type: "array",
        required: true,
        default: [{ speaker: "Speaker 1", voice: "Zephyr" }],
        itemTemplate: { speaker: "Speaker 1", voice: "Zephyr" },
        itemFields: [
          { key: "speaker", label: "Speaker", type: "text", required: true },
          { key: "voice", label: "Voice", type: "select", required: true, default: "Zephyr", options: GEMINI_TTS_VOICE_OPTIONS },
        ],
      },
    ],
    priority: 13,
    sortOrder: 112,
  },
  {
    modelId: WAVESPEED_LYRIA_3_CLIP_MUSIC_MODEL_ID,
    name: "Google Lyria 3 Clip",
    description: "WaveSpeed Google Lyria 3 Clip text-to-music generation with optional image guidance.",
    aliases: [
      "lyria 3 clip",
      "google lyria clip",
      "lyria music",
      "lyria-3-clip",
      "wavespeed/lyria-3-clip/music",
      "wavespeed lyria 3 clip music",
    ],
    submitEndpoint: "/google/lyria-3-clip/music",
    generateType: "music",
    pricingFormula: "flat",
    pricingTiers: { default: 40 },
    textInputKey: "prompt",
    inputFields: [
      { key: "prompt", label: "Prompt", type: "text", required: true, syncWith: "prompt" },
      { key: "image", label: "Reference Image", type: "image_urls", required: false, syncWith: "reference_images", maxItems: 1 },
      { key: "negative_prompt", label: "Negative Prompt", type: "text" },
      { key: "seed", label: "Seed", type: "number" },
    ],
    priority: 14,
    sortOrder: 113,
  },
  {
    modelId: WAVESPEED_LYRIA_3_PRO_MUSIC_MODEL_ID,
    name: "Google Lyria 3 Pro",
    description: "WaveSpeed Google Lyria 3 Pro premium text-to-music generation with optional image guidance.",
    aliases: [
      "lyria 3 pro",
      "google lyria pro",
      "lyria pro music",
      "lyria-3-pro",
      "wavespeed/lyria-3-pro/music",
      "wavespeed lyria 3 pro music",
    ],
    submitEndpoint: "/google/lyria-3-pro/music",
    generateType: "music",
    pricingFormula: "flat",
    pricingTiers: { default: 80 },
    textInputKey: "prompt",
    inputFields: [
      { key: "prompt", label: "Prompt", type: "text", required: true, syncWith: "prompt" },
      { key: "image", label: "Reference Image", type: "image_urls", required: false, syncWith: "reference_images", maxItems: 1 },
      { key: "negative_prompt", label: "Negative Prompt", type: "text" },
      { key: "seed", label: "Seed", type: "number" },
    ],
    priority: 15,
    sortOrder: 114,
  },
  {
    modelId: WAVESPEED_ELEVENLABS_VOICE_CHANGER_MODEL_ID,
    name: "ElevenLabs Voice Changer",
    description: "WaveSpeed ElevenLabs audio-to-audio voice transformation that preserves timing, emotion, and delivery.",
    aliases: [
      "elevenlabs voice changer",
      "voice changer",
      "voice conversion",
      "voice transformation",
      "audio to audio",
      "wavespeed elevenlabs voice changer",
      "elevenlabs/voice-changer",
    ],
    submitEndpoint: "/elevenlabs/voice-changer",
    generateType: "audio-to-audio",
    pricingFormula: "flat",
    pricingTiers: { default: 50 },
    maxPromptLength: 200,
    textInputKey: "text",
    inputFields: [
      {
        key: "audio",
        label: "Source Audio",
        type: "audio_urls",
        required: true,
        maxItems: 1,
        allowedExtensions: "mp3,wav,m4a,ogg,flac,aac",
        description: "Upload or choose the speech audio to transform. Maximum duration is 10 minutes.",
      },
      {
        key: "voice_id",
        label: "Target Voice",
        type: "select",
        default: "Alice",
        options: [
          { value: "Alice", label: "Alice" },
          { value: "Aria", label: "Aria" },
          { value: "Roger", label: "Roger" },
          { value: "Sarah", label: "Sarah" },
          { value: "Laura", label: "Laura" },
          { value: "Charlie", label: "Charlie" },
          { value: "George", label: "George" },
          { value: "Callum", label: "Callum" },
          { value: "River", label: "River" },
        ],
      },
      {
        key: "remove_background_noise",
        label: "Remove Background Noise",
        type: "boolean",
        default: false,
        description: "Clean background noise before applying the target voice.",
      },
    ],
    priority: 16,
    sortOrder: 115,
  },
] as const;

const ELEVENLABS_VOICE_OPTIONS = [
  { value: "Rachel", label: "Rachel" },
  { value: "Domi", label: "Domi" },
  { value: "Bella", label: "Bella" },
  { value: "Antoni", label: "Antoni" },
  { value: "Elli", label: "Elli" },
  { value: "Josh", label: "Josh" },
  { value: "Arnold", label: "Arnold" },
  { value: "Adam", label: "Adam" },
  { value: "Sam", label: "Sam" },
];

const ELEVENLABS_OUTPUT_FORMAT_OPTIONS = [
  { value: "mp3_44100_128", label: "MP3 44.1kHz 128kbps" },
  { value: "mp3_44100_192", label: "MP3 44.1kHz 192kbps" },
  { value: "pcm_44100", label: "PCM 44.1kHz" },
  { value: "ulaw_8000", label: "u-law 8kHz" },
];

const ELEVENLABS_MODEL_DEFINITIONS: readonly ElevenLabsModelDefinition[] = [
  {
    modelId: ELEVENLABS_VOICE_CHANGER_MODEL_ID,
    name: "ElevenLabs Voice Changer",
    description: "Direct ElevenLabs speech-to-speech voice conversion from source audio to a target voice.",
    aliases: ["elevenlabs voice changer", "voice changer", "speech to speech", "voice conversion"],
    apiEndpoint: "/v1/speech-to-speech/{voice_id}",
    capability: "voice_changer",
    requestContentType: "multipart",
    responseType: "audio",
    pricingFormula: "per_unit",
    pricingTiers: { default: 60 },
    pricingUnitMetric: "minutes",
    pricingUnitField: "estimated_duration_minutes",
    pricingUnitSize: 1,
    pricingUnitRounding: "ceil",
    pricingMinUnits: 1,
    creditCost: 60,
    priority: 20,
    sortOrder: 200,
    inputFields: [
      { key: "audio", label: "Source Audio", type: "audio_urls", required: true, maxItems: 1, allowedExtensions: "mp3,wav,m4a,ogg,flac,aac" },
      { key: "voice_id", label: "Target Voice ID", type: "select", required: true, searchable: true, default: "Rachel", options: ELEVENLABS_VOICE_OPTIONS },
      { key: "model_id", label: "Model", type: "select", default: "eleven_multilingual_sts_v2", options: [
        { value: "eleven_multilingual_sts_v2", label: "Eleven Multilingual STS v2" },
        { value: "eleven_english_sts_v2", label: "Eleven English STS v2" },
      ] },
      { key: "remove_background_noise", label: "Remove Background Noise", type: "boolean", default: false },
      { key: "output_format", label: "Output Format", type: "select", default: "mp3_44100_128", options: ELEVENLABS_OUTPUT_FORMAT_OPTIONS },
    ],
  },
  {
    modelId: ELEVENLABS_TEXT_TO_SPEECH_MODEL_ID,
    name: "ElevenLabs Text to Speech",
    description: "Direct ElevenLabs text-to-speech with voice settings and multilingual model support.",
    aliases: ["elevenlabs text to speech", "elevenlabs tts", "text to speech", "tts"],
    apiEndpoint: "/v1/text-to-speech/{voice_id}",
    capability: "text_to_speech",
    requestContentType: "json",
    responseType: "audio",
    pricingFormula: "per_unit",
    pricingTiers: { default: 30 },
    pricingUnitMetric: "characters",
    pricingUnitField: "text",
    pricingUnitSize: 1000,
    pricingUnitRounding: "ceil",
    pricingMinUnits: 1,
    creditCost: 30,
    priority: 21,
    sortOrder: 201,
    inputFields: [
      { key: "text", label: "Text", type: "text", required: true, syncWith: "prompt" },
      { key: "voice_id", label: "Voice ID", type: "select", required: true, searchable: true, default: "Rachel", options: ELEVENLABS_VOICE_OPTIONS },
      { key: "model_id", label: "Model", type: "select", default: "eleven_multilingual_v2", options: [
        { value: "eleven_multilingual_v2", label: "Eleven Multilingual v2" },
        { value: "eleven_v3", label: "Eleven v3" },
        { value: "eleven_flash_v2_5", label: "Eleven Flash v2.5" },
        { value: "eleven_turbo_v2_5", label: "Eleven Turbo v2.5" },
      ] },
      { key: "output_format", label: "Output Format", type: "select", default: "mp3_44100_128", options: ELEVENLABS_OUTPUT_FORMAT_OPTIONS },
      { key: "language_code", label: "Language Code", type: "text", placeholder: "en, th, ja..." },
      { key: "stability", label: "Stability", type: "number", default: 0.5 },
      { key: "similarity_boost", label: "Similarity Boost", type: "number", default: 0.75 },
      { key: "style", label: "Style", type: "number", default: 0 },
      { key: "use_speaker_boost", label: "Speaker Boost", type: "boolean", default: true },
    ],
  },
  {
    modelId: ELEVENLABS_SPEECH_TO_TEXT_MODEL_ID,
    name: "ElevenLabs Speech to Text",
    description: "Direct ElevenLabs Scribe speech-to-text transcription with diarization and timestamps.",
    aliases: ["elevenlabs speech to text", "elevenlabs stt", "scribe", "transcribe audio"],
    apiEndpoint: "/v1/speech-to-text",
    capability: "speech_to_text",
    requestContentType: "multipart",
    responseType: "json",
    pricingFormula: "per_unit",
    pricingTiers: { default: 40 },
    pricingUnitMetric: "minutes",
    pricingUnitField: "estimated_duration_minutes",
    pricingUnitSize: 1,
    pricingUnitRounding: "ceil",
    pricingMinUnits: 1,
    creditCost: 40,
    priority: 22,
    sortOrder: 202,
    inputFields: [
      { key: "file", label: "Source Audio or Video", type: "audio_urls", required: true, maxItems: 1, allowedExtensions: "mp3,wav,m4a,ogg,flac,aac,mp4,mov,webm" },
      { key: "model_id", label: "Model", type: "select", required: true, default: "scribe_v2", options: [{ value: "scribe_v2", label: "Scribe v2" }] },
      { key: "language_code", label: "Language Code", type: "text", placeholder: "en, th, ja..." },
      { key: "diarize", label: "Speaker Diarization", type: "boolean", default: false },
      { key: "timestamps_granularity", label: "Timestamps", type: "select", default: "word", options: [
        { value: "none", label: "None" },
        { value: "word", label: "Word" },
        { value: "character", label: "Character" },
      ] },
      { key: "tag_audio_events", label: "Tag Audio Events", type: "boolean", default: true },
      { key: "keyterms", label: "Key Terms", type: "array", itemTemplate: "", description: "Optional terms to bias recognition." },
    ],
  },
  {
    modelId: ELEVENLABS_SOUND_EFFECTS_MODEL_ID,
    name: "ElevenLabs Sound Effects",
    description: "Direct ElevenLabs prompt-to-sound-effects generation.",
    aliases: ["elevenlabs sound effects", "sound effects", "sfx", "sound generation"],
    apiEndpoint: "/v1/sound-generation",
    capability: "sound_effects",
    requestContentType: "json",
    responseType: "audio",
    pricingFormula: "per_unit",
    pricingTiers: { default: 20 },
    pricingUnitMetric: "seconds",
    pricingUnitField: "duration_seconds",
    pricingUnitSize: 1,
    pricingUnitRounding: "ceil",
    pricingMinUnits: 1,
    creditCost: 20,
    priority: 23,
    sortOrder: 203,
    inputFields: [
      { key: "text", label: "Prompt", type: "text", required: true, syncWith: "prompt" },
      { key: "duration_seconds", label: "Duration", type: "number", default: 5, min: 0.5, max: 30, affectsPricing: true },
      { key: "loop", label: "Loop", type: "boolean", default: false },
      { key: "prompt_influence", label: "Prompt Influence", type: "number", default: 0.3 },
      { key: "output_format", label: "Output Format", type: "select", default: "mp3_44100_128", options: ELEVENLABS_OUTPUT_FORMAT_OPTIONS },
    ],
  },
  {
    modelId: ELEVENLABS_VOICE_ISOLATOR_MODEL_ID,
    name: "ElevenLabs Voice Isolator",
    description: "Direct ElevenLabs audio isolation to clean speech from noisy audio or video.",
    aliases: ["elevenlabs voice isolator", "voice isolator", "audio isolation", "clean noisy audio"],
    apiEndpoint: "/v1/audio-isolation",
    capability: "voice_isolator",
    requestContentType: "multipart",
    responseType: "audio",
    pricingFormula: "per_unit",
    pricingTiers: { default: 40 },
    pricingUnitMetric: "minutes",
    pricingUnitField: "estimated_duration_minutes",
    pricingUnitSize: 1,
    pricingUnitRounding: "ceil",
    pricingMinUnits: 1,
    creditCost: 40,
    priority: 24,
    sortOrder: 204,
    inputFields: [
      { key: "audio", label: "Source Audio or Video", type: "audio_urls", required: true, maxItems: 1, allowedExtensions: "mp3,wav,m4a,ogg,flac,aac,mp4,mov,webm" },
      { key: "output_format", label: "Output Format", type: "select", default: "mp3_44100_128", options: ELEVENLABS_OUTPUT_FORMAT_OPTIONS },
    ],
  },
] as const;

function decodeUrlPathForValidation(value: string, label: string): string {
  let decoded = value;

  for (let idx = 0; idx < 2; idx += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        break;
      }
      decoded = next;
    } catch {
      throw new Error(`${label} contains invalid percent-encoding`);
    }
  }

  return decoded;
}

function getWaveSpeedModelDefinition(modelId: string): WaveSpeedModelDefinition | undefined {
  return WAVESPEED_MODEL_DEFINITIONS.find((definition) => definition.modelId === modelId);
}

function getWaveSpeedAudioModelDefinition(modelId: string): WaveSpeedAudioModelDefinition | undefined {
  return WAVESPEED_AUDIO_MODEL_DEFINITIONS.find((definition) => definition.modelId === modelId);
}

function requireWaveSpeedModelDefinition(modelId: string): WaveSpeedModelDefinition {
  return getWaveSpeedModelDefinition(modelId)
    ?? getWaveSpeedModelDefinition(WAVESPEED_LAUNCH_MODEL_ID)
    ?? WAVESPEED_MODEL_DEFINITIONS[0]!;
}

function requireWaveSpeedAnyModelDefinition(modelId: string): WaveSpeedModelDefinition | WaveSpeedAudioModelDefinition {
  return getWaveSpeedModelDefinition(modelId)
    ?? getWaveSpeedAudioModelDefinition(modelId)
    ?? requireWaveSpeedModelDefinition(modelId);
}

function getElevenLabsModelDefinition(modelId: string): ElevenLabsModelDefinition | undefined {
  return ELEVENLABS_MODEL_DEFINITIONS.find((definition) => definition.modelId === modelId);
}

function requireElevenLabsModelDefinition(modelId: string): ElevenLabsModelDefinition {
  return getElevenLabsModelDefinition(modelId)
    ?? getElevenLabsModelDefinition(ELEVENLABS_TEXT_TO_SPEECH_MODEL_ID)
    ?? ELEVENLABS_MODEL_DEFINITIONS[0]!;
}

function buildWaveSpeedInputFields(definition: WaveSpeedModelDefinition): ModelInputFieldRecord[] {
  return [
    {
      key: "prompt",
      label: "Prompt",
      type: "text",
      required: true,
      syncWith: "prompt",
    },
    {
      key: "image_urls",
      label: definition.referenceImagesRequired ? "Start / Reference Images" : "Reference Images",
      type: "image_urls",
      required: definition.referenceImagesRequired,
      syncWith: "reference_images",
      maxItems: definition.maxReferenceImages,
    },
    {
      key: "aspect_ratio",
      label: "Aspect Ratio",
      type: "select",
      required: true,
      syncWith: "aspect_ratio",
      default: definition.aspectRatios[0],
      options: definition.aspectRatios.map((value) => ({ value, label: value })),
    },
    {
      key: "duration",
      label: "Duration",
      type: "select",
      required: true,
      default: String(definition.durations[0]),
      affectsPricing: true,
      options: definition.durations.map((value) => ({ value: String(value), label: `${value}s` })),
    },
  ];
}

export function normalizeMediaProviderName(providerName: string | null | undefined): string {
  const normalized = String(providerName ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_");

  if (!normalized) {
    return "";
  }
  if (normalized === "kie" || normalized === "kie_ai" || normalized === "kieai") {
    return "kie_ai";
  }
  if (normalized === "uvoice" || normalized === "u_voice" || normalized === "uvoice_ai" || normalized === "uvoiceapp") {
    return "uvoice";
  }
  if (
    normalized === "byteplus"
    || normalized === "modelark"
    || normalized === "byteplus_modelark"
    || normalized === "byteplus_model_ark"
  ) {
    return "byteplus_modelark";
  }
  if (normalized === "knplabs" || normalized === "knplabai" || normalized === "knplabs_ai" || normalized === "knplabsai") {
    return "knplabai";
  }
  if (normalized === "wavespeed_ai" || normalized === "wavespeedai") {
    return WAVESPEED_PROVIDER;
  }
  if (
    normalized === "elevenlabs"
    || normalized === "eleven_labs"
    || normalized === "elevenlabs_ai"
    || normalized === "eleven_labs_ai"
  ) {
    return ELEVENLABS_PROVIDER;
  }
  return normalized;
}

export function isPublicSafeHttpUrl(value: string, options?: PublicUrlValidationOptions): boolean {
  try {
    assertPublicSafeHttpUrl(value, "URL", options);
    return true;
  } catch {
    return false;
  }
}

export function assertPublicSafeHttpUrl(
  value: string,
  label = "URL",
  options?: PublicUrlValidationOptions,
): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid http(s) URL`);
  }

  if (options?.requireHttps) {
    if (parsed.protocol !== "https:") {
      throw new Error(`${label} must use https`);
    }
  } else if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${label} must use http or https`);
  }

  const hostname = parsed.hostname.trim().toLowerCase();
  if (!hostname || PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    throw new Error(`${label} must point to a public host`);
  }
}

export function normalizePersistedMediaProviderBaseUrl(
  providerName: string,
  baseUrl: string | null | undefined,
): string | null | undefined {
  if (baseUrl == null) {
    return baseUrl;
  }

  const trimmed = String(baseUrl).trim();
  if (!trimmed) {
    return trimmed;
  }

  const normalizedProviderName = normalizeMediaProviderName(providerName);
  const normalizedUrl = normalizedProviderName === WAVESPEED_PROVIDER
    ? normalizeWaveSpeedBaseUrl(trimmed)
    : new URL(trimmed).toString().replace(/\/$/, "");

  assertPublicSafeHttpUrl(normalizedUrl, "Provider base URL", { requireHttps: true });
  return normalizedUrl;
}

export function assertRelativeUploadMediaReferencePath(value: string, label = "Reference URL"): void {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }

  const decoded = decodeUrlPathForValidation(trimmed, label);
  if (decoded.includes("..")) {
    throw new Error(`${label} may not contain '..'`);
  }

  const normalized = decoded.startsWith("/") ? decoded : `/${decoded}`;
  if (!ALLOWED_RELATIVE_MEDIA_REFERENCE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    throw new Error(
      `${label} must reference a file under /uploads/ or /api/storage/files/`,
    );
  }
}

export function normalizeWaveSpeedBaseUrl(baseUrl: string | null | undefined): string {
  const rawValue = String(baseUrl ?? "").trim() || "https://api.wavespeed.ai";
  const parsed = new URL(rawValue);
  const pathname = parsed.pathname.replace(/\/+$/, "");

  if (!pathname || pathname === "/") {
    parsed.pathname = "/api/v3";
  } else if (pathname.endsWith("/api/v3")) {
    parsed.pathname = pathname;
  } else {
    parsed.pathname = `${pathname}/api/v3`;
  }

  return parsed.toString().replace(/\/$/, "");
}

export function normalizeRelativeMediaEndpointPath(
  rawValue: string,
  options?: { allowRequestIdPlaceholder?: boolean; allowedPlaceholders?: string[] },
): string {
  const trimmed = String(rawValue ?? "").trim();
  if (!trimmed) {
    throw new Error("Endpoint path is required");
  }
  const decoded = decodeUrlPathForValidation(trimmed, "Endpoint path");

  if (/^https?:\/\//i.test(decoded) || decoded.startsWith("//")) {
    throw new Error("Endpoint paths must be relative URLs");
  }
  if (decoded.includes("..")) {
    throw new Error("Endpoint paths may not contain '..'");
  }

  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalizedDecoded = decoded.startsWith("/") ? decoded : `/${decoded}`;
  const placeholders = Array.from(normalizedDecoded.matchAll(/\{([^{}]+)\}/g), (match) => match[1]?.trim()).filter(Boolean);
  const allowedPlaceholders = new Set<string>([
    ...(options?.allowRequestIdPlaceholder ? ["requestId"] : []),
    ...(options?.allowedPlaceholders ?? []),
  ]);

  for (const placeholder of placeholders) {
    if (!allowedPlaceholders.has(placeholder)) {
      throw new Error(`Unsupported endpoint placeholder {${placeholder}}`);
    }
  }

  return normalized;
}

export function sanitizeMediaModelConfigJson(
  configJson: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null | undefined {
  if (!configJson || typeof configJson !== "object" || Array.isArray(configJson)) {
    return configJson;
  }

  const next: Record<string, unknown> = { ...configJson };
  if (typeof next.apiEndpoint === "string") {
    next.apiEndpoint = normalizeRelativeMediaEndpointPath(next.apiEndpoint, {
      allowedPlaceholders: ["voice_id"],
    });
  }
  if (typeof next.apiQueryEndpoint === "string") {
    next.apiQueryEndpoint = normalizeRelativeMediaEndpointPath(next.apiQueryEndpoint, {
      allowRequestIdPlaceholder: true,
    });
  }

  const apiConfig = next.apiConfig;
  if (apiConfig && typeof apiConfig === "object" && !Array.isArray(apiConfig)) {
    const apiConfigRecord = { ...(apiConfig as Record<string, unknown>) };
    if (typeof apiConfigRecord.provider === "string") {
      apiConfigRecord.provider = normalizeMediaProviderName(apiConfigRecord.provider);
    }
    next.apiConfig = apiConfigRecord;
  }

  return next;
}

function getConfigInputFields(configJson: unknown): ModelInputFieldRecord[] {
  return Array.isArray((configJson as { inputFields?: unknown } | null | undefined)?.inputFields)
    ? (((configJson as { inputFields?: unknown }).inputFields as unknown[]) as ModelInputFieldRecord[])
    : [];
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}

function getReferenceImageField(configJson: unknown): ModelInputFieldRecord | undefined {
  return getConfigInputFields(configJson).find((field) => {
    const rawType = String(field.type ?? "").trim().toLowerCase();
    const rawSyncWith = String(field.syncWith ?? "").trim().toLowerCase();
    if (rawSyncWith === "reference_images") {
      return true;
    }
    if (rawType !== "image_urls") {
      return false;
    }
    const normalizedKey = String(field.key ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    return normalizedKey.includes("image");
  });
}

export function isReferenceImageRequiredFromConfig(configJson: unknown): boolean {
  const field = getReferenceImageField(configJson);
  return Boolean(field?.required)
    || Boolean((configJson as Record<string, unknown> | null | undefined)?.requiresReferenceImages);
}

export function getReferenceImageLimitFromConfig(configJson: unknown): number | null {
  const field = getReferenceImageField(configJson);
  if (!field) {
    return null;
  }

  return (
    parsePositiveInteger(field.maxItems)
    ?? parsePositiveInteger(field.maxImages)
    ?? parsePositiveInteger(field.maxCount)
    ?? parsePositiveInteger((configJson as Record<string, unknown> | null | undefined)?.maxReferenceImages)
  );
}

export function getAllowedAspectRatiosFromConfig(
  configJson: unknown,
  fallback: readonly string[] = [],
): string[] {
  const field = getConfigInputFields(configJson).find((entry) => String(entry.key ?? "").trim() === "aspect_ratio");
  if (field && Array.isArray(field.options)) {
    const values = field.options
      .map((option) => {
        if (!option || typeof option !== "object") {
          return null;
        }
        const value = String((option as Record<string, unknown>).value ?? "").trim();
        return value || null;
      })
      .filter((value): value is string => Boolean(value));
    if (values.length > 0) {
      return values;
    }
  }
  return [...fallback];
}

export function getAllowedDurationsFromConfig(
  configJson: unknown,
  fallback: readonly number[] = [],
): number[] {
  const field = getConfigInputFields(configJson).find((entry) => String(entry.key ?? "").trim() === "duration");
  if (field && Array.isArray(field.options)) {
    const values = field.options
      .map((option) => {
        if (!option || typeof option !== "object") {
          return null;
        }
        return parsePositiveInteger((option as Record<string, unknown>).value);
      })
      .filter((value): value is number => value !== null);
    if (values.length > 0) {
      return values;
    }
  }
  return [...fallback];
}

export function buildWaveSpeedModelConfigJson(modelId: string): Record<string, unknown> {
  const definition = requireWaveSpeedAnyModelDefinition(modelId);
  if ("textInputKey" in definition) {
    return sanitizeMediaModelConfigJson({
      apiPayloadFormat: "wavespeed",
      generateType: definition.generateType,
      providerModelId: definition.modelId,
      apiEndpoint: definition.submitEndpoint,
      apiQueryEndpoint: "/predictions/{requestId}/result",
      pricingFormula: definition.pricingFormula,
      pricingTiers: { ...definition.pricingTiers },
      pricingUnitMetric: definition.pricingUnitMetric,
      pricingUnitField: definition.pricingUnitField,
      pricingUnitSize: definition.pricingUnitSize,
      pricingUnitRounding: definition.pricingUnitRounding,
      pricingMinUnits: definition.pricingMinUnits,
      maxPromptLength: definition.maxPromptLength,
      textInputKey: definition.textInputKey,
      omitTextInput: definition.generateType === "audio-to-audio",
      useSyncMode: false,
      supportsReferenceImages: definition.inputFields.some((field) => field.type === "image_urls"),
      maxReferenceImages: definition.inputFields.some((field) => field.type === "image_urls") ? 1 : 0,
      inputFields: definition.inputFields,
      apiConfig: {
        provider: WAVESPEED_PROVIDER,
        provider_model_id: definition.modelId,
        generate_type: definition.generateType,
        text_input_key: definition.textInputKey,
        omit_text_input: definition.generateType === "audio-to-audio",
        use_sync_mode: false,
      },
    }) as Record<string, unknown>;
  }

  return sanitizeMediaModelConfigJson({
    apiPayloadFormat: "wavespeed",
    generateType: definition.generateType,
    providerModelId: definition.modelId,
    apiEndpoint: definition.submitEndpoint,
    apiQueryEndpoint: "/predictions/{requestId}/result",
    pricingFormula: "per_duration",
    pricingTiers: { ...definition.pricingTiers },
    nativeAudio: definition.nativeAudio,
    useSyncMode: false,
    supportsReferenceImages: definition.maxReferenceImages > 0,
    requiresReferenceImages: definition.referenceImagesRequired,
    maxReferenceImages: definition.maxReferenceImages,
    inputFields: buildWaveSpeedInputFields(definition),
    apiConfig: {
      provider: WAVESPEED_PROVIDER,
      provider_model_id: definition.modelId,
      generate_type: definition.generateType,
      use_sync_mode: false,
    },
  }) as Record<string, unknown>;
}

export function buildWaveSpeedLaunchModelConfigJson(): Record<string, unknown> {
  return buildWaveSpeedModelConfigJson(WAVESPEED_LAUNCH_MODEL_ID);
}

export function buildWaveSpeedModelSeed(modelId: string): WaveSpeedModelSeed {
  const definition = requireWaveSpeedAnyModelDefinition(modelId);
  if ("textInputKey" in definition) {
    return {
      modelId: definition.modelId,
      name: definition.name,
      description: definition.description,
      modelType: "audio",
      provider: WAVESPEED_PROVIDER,
      aliases: [...definition.aliases],
      creditCost: definition.pricingTiers.default,
      aspectRatios: [],
      durations: [],
      priority: definition.priority,
      sortOrder: definition.sortOrder,
      isEnabled: true,
      configJson: buildWaveSpeedModelConfigJson(definition.modelId),
    };
  }

  return {
    modelId: definition.modelId,
    name: definition.name,
    description: definition.description,
    modelType: "video",
    provider: WAVESPEED_PROVIDER,
    aliases: [...definition.aliases],
    creditCost: definition.pricingTiers["5s"] ?? WAVESPEED_PRICING_TIERS["5s"],
    aspectRatios: [...definition.aspectRatios],
    durations: [...definition.durations],
    priority: definition.priority,
    sortOrder: definition.sortOrder,
    isEnabled: true,
    configJson: buildWaveSpeedModelConfigJson(definition.modelId),
  };
}

export function buildWaveSpeedLaunchModelSeed(): WaveSpeedLaunchModelSeed {
  return buildWaveSpeedModelSeed(WAVESPEED_LAUNCH_MODEL_ID);
}

export function buildWaveSpeedModelSeeds(): WaveSpeedModelSeed[] {
  return [
    ...WAVESPEED_MODEL_DEFINITIONS.map((definition) => buildWaveSpeedModelSeed(definition.modelId)),
    ...WAVESPEED_AUDIO_MODEL_DEFINITIONS.map((definition) => buildWaveSpeedModelSeed(definition.modelId)),
  ];
}

export function getWaveSpeedProviderAvailableModels(): Array<{
  id: string;
  name: string;
  type: "video" | "audio";
  description: string;
}> {
  return [...WAVESPEED_MODEL_DEFINITIONS, ...WAVESPEED_AUDIO_MODEL_DEFINITIONS].map((definition) => ({
    id: definition.modelId,
    name: definition.name,
    type: "textInputKey" in definition ? "audio" : "video",
    description: definition.description,
  }));
}

export function buildElevenLabsModelConfigJson(modelId: string): Record<string, unknown> {
  const definition = requireElevenLabsModelDefinition(modelId);
  return sanitizeMediaModelConfigJson({
    apiPayloadFormat: "elevenlabs",
    providerModelId: definition.modelId,
    elevenlabsCapability: definition.capability,
    apiEndpoint: definition.apiEndpoint,
    apiMethod: "POST",
    requestContentType: definition.requestContentType,
    responseType: definition.responseType,
    pricingFormula: definition.pricingFormula,
    pricingTiers: { ...definition.pricingTiers },
    pricingUnitMetric: definition.pricingUnitMetric,
    pricingUnitField: definition.pricingUnitField,
    pricingUnitSize: definition.pricingUnitSize,
    pricingUnitRounding: definition.pricingUnitRounding,
    pricingMinUnits: definition.pricingMinUnits,
    useSyncMode: true,
    inputFields: definition.inputFields,
    apiConfig: {
      provider: ELEVENLABS_PROVIDER,
      provider_model_id: definition.modelId,
      elevenlabs_capability: definition.capability,
      request_content_type: definition.requestContentType,
      response_type: definition.responseType,
      use_sync_mode: true,
    },
  }) as Record<string, unknown>;
}

export function buildElevenLabsModelSeed(modelId: string): ElevenLabsModelSeed {
  const definition = requireElevenLabsModelDefinition(modelId);
  return {
    modelId: definition.modelId,
    name: definition.name,
    description: definition.description,
    modelType: "audio",
    provider: ELEVENLABS_PROVIDER,
    aliases: [...definition.aliases],
    creditCost: definition.creditCost,
    aspectRatios: [],
    durations: [],
    priority: definition.priority,
    sortOrder: definition.sortOrder,
    isEnabled: true,
    configJson: buildElevenLabsModelConfigJson(definition.modelId),
  };
}

export function buildElevenLabsModelSeeds(): ElevenLabsModelSeed[] {
  return ELEVENLABS_MODEL_DEFINITIONS.map((definition) => buildElevenLabsModelSeed(definition.modelId));
}

export function getElevenLabsProviderAvailableModels(): Array<{
  id: string;
  name: string;
  type: "audio";
  description: string;
}> {
  return ELEVENLABS_MODEL_DEFINITIONS.map((definition) => ({
    id: definition.modelId,
    name: definition.name,
    type: "audio",
    description: definition.description,
  }));
}
