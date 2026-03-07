/**
 * Seed UVoice Media Models
 * Run with: npx tsx scripts/seed-media-models-uvoice.ts
 *
 * Pricing reference:
 * - UVoice docs: character-based charging by voice tier
 * - This script stores platform credits per 1,000 characters.
 *   Adjust per your active UVoice billing plan if needed.
 */

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec123@localhost:5432/smartspec";

interface InputField {
  key: string;
  label: string;
  type: "select" | "text" | "number" | "boolean" | "image_urls" | "video_urls" | "audio_urls" | "array";
  options?: { value: string; label: string; previewUrl?: string }[];
  searchable?: boolean;
  optionsSource?: {
    type: "provider_api" | "public_api";
    endpoint: string;
    method?: "GET" | "POST";
    itemsPath?: string;
    valueField?: string;
    labelField?: string;
    previewField?: string;
    previewBaseUrl?: string;
    valueTransform?: "none" | "before_dash";
    queryParam?: string;
    cacheTtlSeconds?: number;
  };
  default?: string | number | boolean;
  required?: boolean;
  affectsPricing?: boolean;
  syncWith?: "none" | "reference_images" | "prompt" | "aspect_ratio";
  itemTemplate?: Record<string, unknown>;
}

interface ModelDefinition {
  apiEndpoint: string;
  apiPayloadFormat: "uvoice" | "custom";
  generateType: string;
  maxPromptLength: number;
  apiConfig?: Record<string, string | number | boolean>;
  inputFields: InputField[];
  pricingTiers: Record<string, number>;
  pricingFormula: "flat" | "per_duration" | "matrix" | "per_unit";
  pricingUnitMetric?: "characters" | "items";
  pricingUnitField?: string;
  pricingUnitSize?: number;
  pricingUnitRounding?: "ceil" | "floor" | "round";
  pricingMinUnits?: number;
  pricingIgnoreWhitespace?: boolean;
}

interface UVoiceModelEntry {
  modelId: string;
  name: string;
  description: string;
  modelType: "audio";
  provider: "uvoice";
  aliases: string[];
  voices: string[];
  voiceTier: "standard" | "natural" | "premium";
  creditCost: number;
  priority: number;
  sortOrder: number;
  configJson: ModelDefinition;
}

type UVoiceTier = "standard" | "natural" | "premium";

const UVOICE_VOICE_LIST_URLS_BY_TIER: Record<UVoiceTier, readonly string[]> = {
  standard: [
    "https://uvoice.app/?getVoice=true&lang_selected=en&filter=Standard&source=API-DOCS",
    "https://uvoice.app/?getVoice=true&lang_selected=th&filter=Standard&source=API-DOCS",
  ],
  natural: [
    "https://uvoice.app/?getVoice=true&lang_selected=en&filter=Natural&source=API-DOCS",
    "https://uvoice.app/?getVoice=true&lang_selected=th&filter=Natural&source=API-DOCS",
  ],
  premium: [
    "https://uvoice.app/?getVoice=true&lang_selected=en&filter=Premium&source=API-DOCS",
    "https://uvoice.app/?getVoice=true&lang_selected=th&filter=Premium&source=API-DOCS",
  ],
};

const FALLBACK_VOICE_OPTIONS_BY_TIER: Record<UVoiceTier, { value: string; label: string }[]> = {
  standard: [],
  natural: [],
  premium: [
    { value: "TH-KantapongPremiumHD", label: "Kantapong Premium HD" },
    { value: "TH-BowkyPremiumHD", label: "Bowky Premium HD" },
  ],
};

type PublicVoiceRecord = {
  voiceID?: unknown;
  displayName?: unknown;
  name?: unknown;
  age?: unknown;
  type?: unknown;
  langCode?: unknown;
  path?: unknown;
};

function buildVoiceLabel(record: PublicVoiceRecord): string {
  const displayName = typeof record.displayName === "string" && record.displayName.trim().length > 0
    ? record.displayName.trim()
    : typeof record.name === "string" && record.name.trim().length > 0
      ? record.name.trim()
      : "Unnamed Voice";
  const ageRaw = typeof record.age === "string" || typeof record.age === "number"
    ? String(record.age).trim().toUpperCase()
    : "";
  const age = ageRaw === "A" ? "Adult" : ageRaw === "YA" ? "Young Adult" : ageRaw === "C" ? "Child" : ageRaw;
  if (age) return `${displayName} (${age})`;
  return displayName;
}

async function fetchUVoiceOptionsFromPublicPage(
  urls: readonly string[],
): Promise<{ value: string; label: string; previewUrl?: string }[]> {
  const dedupe = new Map<string, { value: string; label: string; previewUrl?: string }>();
  for (const listUrl of urls) {
    const res = await fetch(listUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const payload = await res.json();
    if (!Array.isArray(payload)) {
      throw new Error("Voice list payload is not an array");
    }
    for (const entry of payload as PublicVoiceRecord[]) {
      const voiceID = typeof entry?.voiceID === "string" ? entry.voiceID.trim() : "";
      if (!voiceID) continue;
      if (dedupe.has(voiceID)) continue;
      const path = typeof entry?.path === "string" ? entry.path.trim() : "";
      const previewUrl = path ? new URL(path.replace(/^\//, ""), "https://uvoice.app/").toString() : undefined;
      dedupe.set(voiceID, {
        value: voiceID,
        label: buildVoiceLabel(entry),
        ...(previewUrl ? { previewUrl } : {}),
      });
    }
  }
  return [...dedupe.values()].sort((a, b) => a.label.localeCompare(b.label));
}

async function loadVoiceOptionsByTier(): Promise<Record<UVoiceTier, { value: string; label: string; previewUrl?: string }[]>> {
  const results: Record<UVoiceTier, { value: string; label: string; previewUrl?: string }[]> = {
    standard: [],
    natural: [],
    premium: [],
  };

  for (const tier of Object.keys(UVOICE_VOICE_LIST_URLS_BY_TIER) as UVoiceTier[]) {
    const urls = UVOICE_VOICE_LIST_URLS_BY_TIER[tier];
    try {
      const options = await fetchUVoiceOptionsFromPublicPage(urls);
      if (options.length > 0) {
        console.log(`Fetched ${options.length} ${tier} voices from UVoice public list.`);
        results[tier] = options;
        continue;
      }
      console.warn(`UVoice public ${tier} list returned 0 voices. Falling back to built-in list.`);
    } catch (error) {
      console.warn(`Failed to fetch UVoice public ${tier} voice list. Falling back to built-in list.`, error);
    }
    results[tier] = FALLBACK_VOICE_OPTIONS_BY_TIER[tier];
  }

  return results;
}

function buildTierOptionsSource(tier: UVoiceTier): InputField["optionsSource"] {
  const firstEndpoint = UVOICE_VOICE_LIST_URLS_BY_TIER[tier][0];
  return {
    type: "public_api",
    endpoint: firstEndpoint,
    method: "GET",
    itemsPath: "",
    valueField: "voiceID",
    labelField: "displayName",
    previewField: "path",
    previewBaseUrl: "https://uvoice.app/",
    cacheTtlSeconds: 86400,
  };
}

function buildCommonInputFields(
  voiceOptions: { value: string; label: string; previewUrl?: string }[],
  tier: UVoiceTier,
): InputField[] {
  try {
    return [
  {
    key: "voiceID",
    label: "Voice ID",
    type: "text",
    searchable: true,
    options: voiceOptions,
    optionsSource: buildTierOptionsSource(tier),
    required: true,
  },
  {
    key: "speed",
    label: "Speed",
    type: "number",
    default: 1,
  },
  {
    key: "volume",
    label: "Volume",
    type: "number",
    default: 1,
  },
  {
    key: "pitch",
    label: "Pitch",
    type: "number",
    default: 1,
  },
  {
    key: "key",
    label: "Key",
    type: "number",
    default: 0,
  },
  {
    key: "autoBreak",
    label: "Auto Break (Thai punctuation)",
    type: "boolean",
    default: true,
  },
  {
    key: "outputFormat",
    label: "Output Format",
    type: "select",
    options: [
      { value: "mp3", label: "MP3" },
      { value: "wav", label: "WAV" },
    ],
    default: "mp3",
  },
  {
    key: "outputType",
    label: "Output Type",
    type: "select",
    options: [
      { value: "url", label: "URL" },
      { value: "base64", label: "Base64" },
    ],
    default: "url",
  },
  ];
  } catch {
    return [];
  }
}

const AUDIO_MODELS: UVoiceModelEntry[] = [
  {
    modelId: "uvoice/tts-standard",
    name: "UVoice TTS Standard",
    description: "UVoice Standard tier text-to-speech. Character-based billing; spaces excluded.",
    modelType: "audio",
    provider: "uvoice",
    aliases: ["uvoice-standard", "uvoice-tts", "thai-tts"],
    voices: [],
    voiceTier: "standard",
    creditCost: 150,
    priority: 210,
    sortOrder: 210,
    configJson: {
      apiEndpoint: "/generate",
      apiPayloadFormat: "uvoice",
      generateType: "text-to-speech",
      maxPromptLength: 5000,
      apiConfig: {
        outputType: "url",
        prepend_newline: true,
      },
      inputFields: [],
      pricingTiers: { default: 150 },
      pricingFormula: "per_unit",
      pricingUnitMetric: "characters",
      pricingUnitField: "text",
      pricingUnitSize: 1000,
      pricingUnitRounding: "ceil",
      pricingMinUnits: 1,
      pricingIgnoreWhitespace: true,
    },
  },
  {
    modelId: "uvoice/tts-natural",
    name: "UVoice TTS Natural",
    description: "UVoice Natural tier text-to-speech with natural prosody. Character-based billing; spaces excluded.",
    modelType: "audio",
    provider: "uvoice",
    aliases: ["uvoice-natural", "thai-natural-tts"],
    voices: [],
    voiceTier: "natural",
    creditCost: 150,
    priority: 211,
    sortOrder: 211,
    configJson: {
      apiEndpoint: "/generate",
      apiPayloadFormat: "uvoice",
      generateType: "text-to-speech",
      maxPromptLength: 1500,
      apiConfig: {
        outputType: "url",
        prepend_newline: true,
      },
      inputFields: [],
      pricingTiers: { default: 150 },
      pricingFormula: "per_unit",
      pricingUnitMetric: "characters",
      pricingUnitField: "text",
      pricingUnitSize: 1000,
      pricingUnitRounding: "ceil",
      pricingMinUnits: 1,
      pricingIgnoreWhitespace: true,
    },
  },
  {
    modelId: "uvoice/tts-premium",
    name: "UVoice TTS Premium",
    description: "UVoice Premium tier text-to-speech with expressive voice quality. Character-based billing; spaces excluded.",
    modelType: "audio",
    provider: "uvoice",
    aliases: ["uvoice-premium", "thai-premium-tts"],
    voices: ["TH-KantapongPremiumHD", "TH-BowkyPremiumHD"],
    voiceTier: "premium",
    creditCost: 300,
    priority: 212,
    sortOrder: 212,
    configJson: {
      apiEndpoint: "/generate",
      apiPayloadFormat: "uvoice",
      generateType: "text-to-speech",
      maxPromptLength: 1500,
      apiConfig: {
        outputType: "url",
        prepend_newline: true,
      },
      inputFields: [],
      pricingTiers: { default: 300 },
      pricingFormula: "per_unit",
      pricingUnitMetric: "characters",
      pricingUnitField: "text",
      pricingUnitSize: 1000,
      pricingUnitRounding: "ceil",
      pricingMinUnits: 1,
      pricingIgnoreWhitespace: true,
    },
  },
];

async function seed() {
  console.log("Seeding UVoice Media Models...\n");
  const sql = postgres(DATABASE_URL);

  try {
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'media_models'
      )
    `;

    if (!tableExists[0].exists) {
      console.log("ERROR: media_models table does not exist. Please run migrations first.");
      await sql.end();
      return;
    }

    const voiceOptionsByTier = await loadVoiceOptionsByTier();

    for (const model of AUDIO_MODELS) {
      const tierVoiceOptions = voiceOptionsByTier[model.voiceTier] ?? [];
      const modelWithVoices: UVoiceModelEntry = {
        ...model,
        voices: tierVoiceOptions.map((option) => option.value),
        configJson: {
          ...model.configJson,
          inputFields: buildCommonInputFields(tierVoiceOptions, model.voiceTier),
        },
      };
      await sql`
        INSERT INTO media_models (
          "modelId", name, description, "modelType", provider,
          aliases, voices, "creditCost", priority, "sortOrder", "configJson", "isEnabled"
        ) VALUES (
          ${modelWithVoices.modelId},
          ${modelWithVoices.name},
          ${modelWithVoices.description},
          ${modelWithVoices.modelType},
          ${modelWithVoices.provider},
          ${JSON.stringify(modelWithVoices.aliases)},
          ${JSON.stringify(modelWithVoices.voices)},
          ${modelWithVoices.creditCost},
          ${modelWithVoices.priority},
          ${modelWithVoices.sortOrder},
          ${JSON.stringify(modelWithVoices.configJson)},
          true
        )
        ON CONFLICT ("modelId") DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          "modelType" = EXCLUDED."modelType",
          provider = EXCLUDED.provider,
          aliases = EXCLUDED.aliases,
          voices = EXCLUDED.voices,
          "creditCost" = EXCLUDED."creditCost",
          priority = EXCLUDED.priority,
          "sortOrder" = EXCLUDED."sortOrder",
          "configJson" = EXCLUDED."configJson",
          "isEnabled" = media_models."isEnabled"
      `;
      console.log(`  upsert ${modelWithVoices.name} (${modelWithVoices.creditCost} credits / 1,000 chars)`);
    }

    console.log(`\nUpserted ${AUDIO_MODELS.length} UVoice audio models.`);
    console.log("Next step: Add UVoice API key in Admin > Media Providers and enable provider.\n");
  } catch (error) {
    console.error("Error seeding UVoice models:", error);
  } finally {
    await sql.end();
  }
}

seed();
