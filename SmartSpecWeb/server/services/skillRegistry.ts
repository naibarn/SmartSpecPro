/**
 * Skill Registry - Defines available skills and their configurations
 */

import { getModelIdsByType, getDefaultModel } from "./modelRegistry";

export type SkillType =
  | "image-generation"
  | "video-generation"
  | "audio-generation"
  | "code-assistant"
  | "document-analysis"
  | "web-search";

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: SkillType;

  /** Regex patterns that trigger this skill */
  triggers: RegExp[];

  /** Whether this skill requires explicit invocation */
  requiresExplicit: boolean;

  /** Credit cost multiplier */
  creditMultiplier: number;

  /** Available models for this skill */
  models?: string[];

  /** Default model if multiple available */
  defaultModel?: string;

  /** Whether skill is enabled by default */
  enabledByDefault: boolean;

  /** Priority for detection (higher = checked first) */
  priority: number;
}

/**
 * Base skill definitions (without models - models are added dynamically)
 */
const BASE_SKILL_DEFINITIONS: Omit<SkillDefinition, "models" | "defaultModel">[] = [
  // Image Generation
  {
    id: "image-generation",
    name: "Image Generation",
    description: "Generate images using AI models",
    icon: "image",
    type: "image-generation",
    triggers: [
      /สร้าง(รูป|ภาพ|image)/i,
      /generate\s+(an?\s+)?image/i,
      /create\s+(an?\s+)?(picture|image|photo)/i,
      /draw\s+(me\s+)?/i,
      /paint\s+(me\s+)?/i,
      /ขอรูป/i,
      /วาด(รูป|ภาพ)?/i,
    ],
    requiresExplicit: false,
    creditMultiplier: 2.0,
    enabledByDefault: true,
    priority: 90,
  },

  // Video Generation
  {
    id: "video-generation",
    name: "Video Generation",
    description: "Generate videos using AI models",
    icon: "video",
    type: "video-generation",
    triggers: [
      /สร้าง(วีดีโอ|วิดีโอ|คลิป|video)/i,
      /generate\s+(a\s+)?video/i,
      /create\s+(a\s+)?(video|clip|animation)/i,
      /ทำวีดีโอ/i,
      /make\s+(a\s+)?video/i,
    ],
    requiresExplicit: false,
    creditMultiplier: 10.0,
    enabledByDefault: true,
    priority: 85,
  },

  // Audio Generation
  {
    id: "audio-generation",
    name: "Audio Generation",
    description: "Generate speech and sound effects",
    icon: "music",
    type: "audio-generation",
    triggers: [
      /สร้าง(เสียง|audio|sound)/i,
      /generate\s+(a\s+)?(audio|sound|speech)/i,
      /create\s+(a\s+)?(voice|speech|audio)/i,
      /text\s+to\s+speech/i,
      /tts/i,
      /speak\s+(this|the)/i,
      /read\s+(this\s+)?(text\s+)?aloud/i,
      /อ่านออกเสียง/i,
      /พูดให้ฟัง/i,
      /แปลงเป็นเสียง/i,
    ],
    requiresExplicit: false,
    creditMultiplier: 1.0,
    enabledByDefault: true,
    priority: 80,
  },

];

/**
 * Non-media skills (don't need dynamic model loading)
 */
const NON_MEDIA_SKILLS: SkillDefinition[] = [
  // Code Assistant
  {
    id: "code-assistant",
    name: "Code Assistant",
    description: "Help with code review, refactoring, and generation",
    icon: "code",
    type: "code-assistant",
    triggers: [
      /review\s+(this\s+)?code/i,
      /refactor\s+(this\s+)?/i,
      /write\s+(me\s+)?(a\s+)?code/i,
      /debug\s+(this)?/i,
      /fix\s+(this\s+)?(bug|error|issue)/i,
      /explain\s+(this\s+)?code/i,
      /เขียนโค้ด/i,
      /แก้โค้ด/i,
      /รีวิวโค้ด/i,
    ],
    requiresExplicit: false,
    creditMultiplier: 1.0,
    enabledByDefault: true,
    priority: 70,
  },

  // Document Analysis
  {
    id: "document-analysis",
    name: "Document Analysis",
    description: "Analyze PDFs, documents, and extract information",
    icon: "file-text",
    type: "document-analysis",
    triggers: [
      /analyze\s+(this\s+)?(document|file|pdf)/i,
      /summarize\s+(this\s+)?(document|file|pdf|text)/i,
      /extract\s+(from|info|data)/i,
      /read\s+(this\s+)?(document|file|pdf)/i,
      /วิเคราะห์(เอกสาร|ไฟล์)/i,
      /สรุป(เอกสาร|ไฟล์|ข้อความ)/i,
    ],
    requiresExplicit: false,
    creditMultiplier: 1.5,
    enabledByDefault: true,
    priority: 60,
  },

  // Web Search
  {
    id: "web-search",
    name: "Web Search",
    description: "Search the web for information",
    icon: "search",
    type: "web-search",
    triggers: [
      /search\s+(the\s+)?(web|internet|online)/i,
      /find\s+(info|information)\s+(about|on)/i,
      /look\s+up/i,
      /ค้นหา(ข้อมูล)?/i,
      /หาข้อมูล/i,
      /search\s+for/i,
    ],
    requiresExplicit: false,
    creditMultiplier: 0.5,
    enabledByDefault: false, // Disabled by default
    priority: 50,
  },
];

/**
 * Map skill type to media type for model lookup
 */
const SKILL_TO_MEDIA_TYPE: Record<string, "image" | "video" | "audio"> = {
  "image-generation": "image",
  "video-generation": "video",
  "audio-generation": "audio",
};

/**
 * Build complete skill registry with dynamic model data
 */
function buildSkillRegistry(): SkillDefinition[] {
  // Enrich media skills with dynamic model data
  const mediaSkills = BASE_SKILL_DEFINITIONS.map((baseSkill) => {
    const mediaType = SKILL_TO_MEDIA_TYPE[baseSkill.type];

    if (mediaType) {
      const modelIds = getModelIdsByType(mediaType);
      const defaultModelDef = getDefaultModel(mediaType);

      return {
        ...baseSkill,
        models: modelIds,
        defaultModel: defaultModelDef?.id,
      } as SkillDefinition;
    }

    return baseSkill as SkillDefinition;
  });

  return [...mediaSkills, ...NON_MEDIA_SKILLS];
}

/**
 * Cached skill registry (rebuilt when needed)
 */
let _skillRegistryCache: SkillDefinition[] | null = null;

/**
 * Get the complete skill registry (with caching)
 */
export function getSkillRegistry(): SkillDefinition[] {
  if (!_skillRegistryCache) {
    _skillRegistryCache = buildSkillRegistry();
  }
  return _skillRegistryCache;
}

/**
 * Clear skill registry cache (call when models are updated)
 */
export function clearSkillRegistryCache(): void {
  _skillRegistryCache = null;
}

/**
 * Get all available skills
 */
export function getAvailableSkills(): SkillDefinition[] {
  return [...getSkillRegistry()].sort((a, b) => b.priority - a.priority);
}

/**
 * Get skill by ID
 */
export function getSkillById(id: string): SkillDefinition | undefined {
  return getSkillRegistry().find((s) => s.id === id);
}

/**
 * Get skills by type
 */
export function getSkillsByType(type: SkillType): SkillDefinition[] {
  return getSkillRegistry().filter((s) => s.type === type);
}

/**
 * Get default enabled skills
 */
export function getDefaultEnabledSkills(): string[] {
  return getSkillRegistry()
    .filter((s) => s.enabledByDefault)
    .map((s) => s.id);
}
