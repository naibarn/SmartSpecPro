export const GEMINI_3_1_FLASH_TTS_MODEL_ID = "fal-ai/gemini-3.1-flash-tts";
export const GEMINI_3_1_FLASH_TTS_CREDIT_COST = 150;
export const GEMINI_3_1_FLASH_TTS_MAX_SPEAKERS = 32;
export const GEMINI_3_1_FLASH_TTS_OUTPUT_FORMATS = ["mp3", "wav", "ogg_opus"] as const;
export const GEMINI_3_1_FLASH_TTS_LANGUAGE_AUTO_VALUE = "__auto__";
const GEMINI_3_1_FLASH_TTS_ALLOWED_EXTRA_PARAM_KEYS = new Set([
  "language_code",
  "output_format",
  "speakers",
  "style_instructions",
  "temperature",
  "voice",
]);

export const GEMINI_3_1_FLASH_TTS_VOICES = [
  "Achernar",
  "Achird",
  "Algenib",
  "Algieba",
  "Alnilam",
  "Aoede",
  "Autonoe",
  "Callirrhoe",
  "Charon",
  "Despina",
  "Enceladus",
  "Erinome",
  "Fenrir",
  "Gacrux",
  "Iapetus",
  "Kore",
  "Laomedeia",
  "Leda",
  "Orus",
  "Pulcherrima",
  "Puck",
  "Rasalgethi",
  "Sadachbia",
  "Sadaltager",
  "Schedar",
  "Sulafat",
  "Umbriel",
  "Vindemiatrix",
  "Zephyr",
  "Zubenelgenubi",
] as const;

export const GEMINI_3_1_FLASH_TTS_LANGUAGE_CODES = [
  "Arabic (Egypt)",
  "Bangla (Bangladesh)",
  "Dutch (Netherlands)",
  "English (India)",
  "English (US)",
  "French (France)",
  "German (Germany)",
  "Hindi (India)",
  "Indonesian (Indonesia)",
  "Italian (Italy)",
  "Japanese (Japan)",
  "Korean (South Korea)",
  "Marathi (India)",
  "Polish (Poland)",
  "Portuguese (Brazil)",
  "Romanian (Romania)",
  "Russian (Russia)",
  "Spanish (Spain)",
  "Tamil (India)",
  "Telugu (India)",
  "Thai (Thailand)",
  "Turkish (Turkey)",
  "Ukrainian (Ukraine)",
  "Vietnamese (Vietnam)",
  "Afrikaans (South Africa)",
  "Albanian (Albania)",
  "Amharic (Ethiopia)",
  "Arabic (World)",
  "Armenian (Armenia)",
  "Azerbaijani (Azerbaijan)",
  "Basque (Spain)",
  "Belarusian (Belarus)",
  "Bulgarian (Bulgaria)",
  "Burmese (Myanmar)",
  "Catalan (Spain)",
  "Cebuano (Philippines)",
  "Chinese Mandarin (China)",
  "Chinese Mandarin (Taiwan)",
  "Croatian (Croatia)",
  "Czech (Czech Republic)",
  "Danish (Denmark)",
  "English (Australia)",
  "English (UK)",
  "Estonian (Estonia)",
  "Filipino (Philippines)",
  "Finnish (Finland)",
  "French (Canada)",
  "Galician (Spain)",
  "Georgian (Georgia)",
  "Greek (Greece)",
  "Gujarati (India)",
  "Haitian Creole (Haiti)",
  "Hebrew (Israel)",
  "Hungarian (Hungary)",
  "Icelandic (Iceland)",
  "Javanese (Java)",
  "Kannada (India)",
  "Konkani (India)",
  "Lao (Laos)",
  "Latin (Vatican City)",
  "Latvian (Latvia)",
  "Lithuanian (Lithuania)",
  "Luxembourgish (Luxembourg)",
  "Macedonian (North Macedonia)",
  "Maithili (India)",
  "Malagasy (Madagascar)",
  "Malay (Malaysia)",
  "Malayalam (India)",
  "Mongolian (Mongolia)",
  "Nepali (Nepal)",
  "Norwegian Bokmal (Norway)",
  "Norwegian Nynorsk (Norway)",
  "Odia (India)",
  "Pashto (Afghanistan)",
  "Persian (Iran)",
  "Portuguese (Portugal)",
  "Punjabi (India)",
  "Serbian (Serbia)",
  "Sindhi (India)",
  "Sinhala (Sri Lanka)",
  "Slovak (Slovakia)",
  "Slovenian (Slovenia)",
  "Spanish (Latin America)",
  "Spanish (Mexico)",
  "Swahili (Kenya)",
  "Swedish (Sweden)",
  "Urdu (Pakistan)",
] as const;

const GEMINI_3_1_FLASH_TTS_VOICE_OPTIONS = GEMINI_3_1_FLASH_TTS_VOICES.map((voice) => ({
  value: voice,
  label: voice,
}));

const GEMINI_3_1_FLASH_TTS_LANGUAGE_OPTIONS = [
  { value: GEMINI_3_1_FLASH_TTS_LANGUAGE_AUTO_VALUE, label: "Auto-detect" },
  ...GEMINI_3_1_FLASH_TTS_LANGUAGE_CODES.map((language) => ({
    value: language,
    label: language,
  })),
];

function readGeminiStringField(
  value: unknown,
  fieldName: string,
  errors: string[],
  mode: "optional" | "required",
): string | null {
  if (value === undefined || value === null) {
    if (mode === "required") {
      errors.push(`${fieldName} is required`);
    }
    return null;
  }

  if (typeof value !== "string") {
    errors.push(`${fieldName} must be a string`);
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    if (mode === "required") {
      errors.push(`${fieldName} is required`);
    }
    return null;
  }

  return normalized;
}

type GeminiTtsInputField = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "array";
  placeholder?: string;
  description?: string;
  required?: boolean;
  searchable?: boolean;
  default?: unknown;
  options?: Array<{
    value: string;
    label: string;
  }>;
  itemLabel?: string;
  itemFields?: GeminiTtsInputField[];
  maxItems?: number;
};

function isGeminiVoice(value: string): boolean {
  return GEMINI_3_1_FLASH_TTS_VOICES.includes(value as typeof GEMINI_3_1_FLASH_TTS_VOICES[number]);
}

function isGeminiLanguageCode(value: string): boolean {
  return GEMINI_3_1_FLASH_TTS_LANGUAGE_CODES.includes(value as typeof GEMINI_3_1_FLASH_TTS_LANGUAGE_CODES[number]);
}

function isGeminiOutputFormat(value: string): boolean {
  return GEMINI_3_1_FLASH_TTS_OUTPUT_FORMATS.includes(value as typeof GEMINI_3_1_FLASH_TTS_OUTPUT_FORMATS[number]);
}

function buildGeminiTtsValidationError(message: string): string {
  return `Gemini 3.1 Flash TTS input validation failed: ${message}`;
}

export function validateGemini31FlashTtsAudioRequest(request: { speed?: unknown } | undefined): string[] {
  const errors: string[] = [];
  if (!request) {
    return errors;
  }

  if (request.speed !== undefined && request.speed !== null) {
    errors.push("speed is not supported by Gemini 3.1 Flash TTS");
  }

  return errors;
}

export function assertGemini31FlashTtsAudioRequest(request: { speed?: unknown } | undefined): void {
  const errors = validateGemini31FlashTtsAudioRequest(request);
  if (errors.length > 0) {
    throw new Error(buildGeminiTtsValidationError(errors.join("; ")));
  }
}

export function validateGemini31FlashTtsExtraParams(extraParams: Record<string, unknown> | undefined): string[] {
  const errors: string[] = [];
  if (!extraParams) {
    return errors;
  }
  if (typeof extraParams !== "object" || Array.isArray(extraParams)) {
    errors.push("extraParams must be an object");
    return errors;
  }

  for (const key of Object.keys(extraParams).sort()) {
    if (!GEMINI_3_1_FLASH_TTS_ALLOWED_EXTRA_PARAM_KEYS.has(key)) {
      errors.push(`${key} is not supported by Gemini 3.1 Flash TTS`);
    }
  }

  readGeminiStringField(extraParams.style_instructions, "style_instructions", errors, "optional");
  const languageCode = readGeminiStringField(extraParams.language_code, "language_code", errors, "optional");
  if (languageCode !== null && languageCode !== GEMINI_3_1_FLASH_TTS_LANGUAGE_AUTO_VALUE) {
    if (!isGeminiLanguageCode(languageCode)) {
      errors.push(`language_code must be one of the supported Gemini TTS languages (${GEMINI_3_1_FLASH_TTS_LANGUAGE_CODES.join(", ")})`);
    }
  }

  const temperature = extraParams.temperature;
  if (temperature !== undefined && (typeof temperature !== "number" || !Number.isFinite(temperature))) {
    errors.push("temperature must be a finite number");
  }

  const voice = readGeminiStringField(extraParams.voice, "voice", errors, "optional");
  if (voice !== null && !isGeminiVoice(voice)) {
    errors.push(`voice must be one of the supported Gemini TTS voices (${GEMINI_3_1_FLASH_TTS_VOICES.join(", ")})`);
  }

  const outputFormat = readGeminiStringField(extraParams.output_format, "output_format", errors, "optional");
  if (outputFormat !== null && !isGeminiOutputFormat(outputFormat)) {
    errors.push(`output_format must be one of ${GEMINI_3_1_FLASH_TTS_OUTPUT_FORMATS.join(", ")}`);
  }

  const speakers = extraParams.speakers;
  if (speakers !== undefined) {
    if (!Array.isArray(speakers)) {
      errors.push("speakers must be an array of speaker objects");
    } else {
      if (speakers.length > GEMINI_3_1_FLASH_TTS_MAX_SPEAKERS) {
        errors.push(`speakers must not exceed ${GEMINI_3_1_FLASH_TTS_MAX_SPEAKERS} rows`);
      }

      const seenSpeakerIds = new Map<string, number>();
      speakers.forEach((speaker, index) => {
        if (!speaker || typeof speaker !== "object" || Array.isArray(speaker)) {
          errors.push(`speakers[${index}] must be an object`);
          return;
        }

        const record = speaker as Record<string, unknown>;
        for (const key of Object.keys(record).sort()) {
          if (key !== "speaker_id" && key !== "voice") {
            errors.push(`speakers[${index}].${key} is not supported`);
          }
        }

        const speakerId = readGeminiStringField(record.speaker_id, `speakers[${index}].speaker_id`, errors, "required");
        if (speakerId !== null && !/^[A-Za-z0-9]+$/.test(speakerId)) {
          errors.push(`speakers[${index}].speaker_id must be alphanumeric with no whitespace`);
        } else if (speakerId !== null) {
          const duplicateIndex = seenSpeakerIds.get(speakerId);
          if (duplicateIndex !== undefined) {
            errors.push(`speakers[${index}].speaker_id duplicates speakers[${duplicateIndex}].speaker_id`);
          } else {
            seenSpeakerIds.set(speakerId, index);
          }
        }

        const speakerVoice = readGeminiStringField(record.voice, `speakers[${index}].voice`, errors, "required");
        if (speakerVoice !== null && !isGeminiVoice(speakerVoice)) {
          errors.push(`speakers[${index}].voice must be one of the supported Gemini TTS voices`);
        }
      });
    }
  }

  return errors;
}

export function assertGemini31FlashTtsExtraParams(extraParams: Record<string, unknown> | undefined): void {
  const errors = validateGemini31FlashTtsExtraParams(extraParams);
  if (errors.length > 0) {
    throw new Error(buildGeminiTtsValidationError(errors.join("; ")));
  }
}

export function normalizeGemini31FlashTtsExtraParams(
  extraParams: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!extraParams) {
    return extraParams;
  }
  const normalized = { ...extraParams };
  if (typeof normalized.style_instructions === "string") {
    const styleInstructions = normalized.style_instructions.trim();
    if (styleInstructions.length === 0) {
      delete normalized.style_instructions;
    } else {
      normalized.style_instructions = styleInstructions;
    }
  }
  if (typeof normalized.voice === "string") {
    const voice = normalized.voice.trim();
    if (voice.length === 0) {
      delete normalized.voice;
    } else {
      normalized.voice = voice;
    }
  }
  if (typeof normalized.language_code === "string") {
    const languageCode = normalized.language_code.trim();
    if (languageCode.length === 0 || languageCode === GEMINI_3_1_FLASH_TTS_LANGUAGE_AUTO_VALUE) {
      delete normalized.language_code;
    } else {
      normalized.language_code = languageCode;
    }
  }
  if (typeof normalized.output_format === "string") {
    const outputFormat = normalized.output_format.trim();
    if (outputFormat.length === 0) {
      delete normalized.output_format;
    } else {
      normalized.output_format = outputFormat;
    }
  }
  if (Array.isArray(normalized.speakers) && normalized.speakers.length === 0) {
    delete normalized.speakers;
  } else if (Array.isArray(normalized.speakers)) {
    normalized.speakers = normalized.speakers.map((speaker) => {
      if (!speaker || typeof speaker !== "object" || Array.isArray(speaker)) {
        return speaker;
      }

      const normalizedSpeaker = { ...(speaker as Record<string, unknown>) };
      if (typeof normalizedSpeaker.speaker_id === "string") {
        const speakerId = normalizedSpeaker.speaker_id.trim();
        if (speakerId.length === 0) {
          delete normalizedSpeaker.speaker_id;
        } else {
          normalizedSpeaker.speaker_id = speakerId;
        }
      }
      if (typeof normalizedSpeaker.voice === "string") {
        const speakerVoice = normalizedSpeaker.voice.trim();
        if (speakerVoice.length === 0) {
          delete normalizedSpeaker.voice;
        } else {
          normalizedSpeaker.voice = speakerVoice;
        }
      }

      return normalizedSpeaker;
    });
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function buildGemini31FlashTtsInputFields(): GeminiTtsInputField[] {
  return [
    {
      key: "prompt",
      label: "Prompt",
      type: "text",
      required: true,
      placeholder: "Host: Welcome back to the show!",
    },
    {
      key: "style_instructions",
      label: "Style Instructions",
      type: "text",
      placeholder: "Speak warmly and slowly",
    },
    {
      key: "voice",
      label: "Voice",
      type: "select",
      required: false,
      searchable: true,
      default: "Kore",
      description: "Single-speaker voice preset. Ignored when speakers is set.",
      options: [...GEMINI_3_1_FLASH_TTS_VOICE_OPTIONS],
    },
    {
      key: "language_code",
      label: "Language Code",
      type: "select",
      required: false,
      searchable: true,
      description: "Optional language hint. Leave Auto-detect to let Gemini infer the spoken language.",
      options: [...GEMINI_3_1_FLASH_TTS_LANGUAGE_OPTIONS],
    },
    {
      key: "speakers",
      label: "Speakers",
      type: "array",
      itemLabel: "Speaker",
      default: [],
      maxItems: GEMINI_3_1_FLASH_TTS_MAX_SPEAKERS,
      description: "Add one row per speaker and prefix each prompt line with the matching speaker_id alias. speaker_id must be alphanumeric with no whitespace.",
      itemFields: [
        {
          key: "speaker_id",
          label: "Speaker ID",
          type: "text",
          required: true,
          placeholder: "Host",
        },
        {
          key: "voice",
          label: "Voice",
          type: "select",
          required: true,
          searchable: true,
          default: "Kore",
          options: [...GEMINI_3_1_FLASH_TTS_VOICE_OPTIONS],
        },
      ],
    },
    {
      key: "temperature",
      label: "Temperature",
      type: "number",
      default: 1,
    },
    {
      key: "output_format",
      label: "Output Format",
      type: "select",
      required: false,
      default: "mp3",
      options: [
        { value: "mp3", label: "MP3" },
        { value: "wav", label: "WAV" },
        { value: "ogg_opus", label: "OGG Opus" },
      ],
    },
  ];
}
