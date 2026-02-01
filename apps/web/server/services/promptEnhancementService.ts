/**
 * Prompt Enhancement Service
 * Executes prompt-enhancement skills to generate professional AI image prompts
 */

import { getSkillById } from "./skillRegistry";
import fs from "fs";
import path from "path";

export interface PromptEnhancementRequest {
  /** User's basic idea or description */
  userInput: string;
  /** Reference image URLs (1-5) */
  referenceImages?: string[];
  /** Reference image roles and notes */
  referenceImageRoles?: Array<{
    role?: string;
    notes?: string;
  }>;
  /** Selected style category (A-M) */
  styleCategory?: string;
  /** Selected style within category */
  styleName?: string;
  /** Custom style description */
  styleCustom?: string;
  /** VFX category (P/L/W/M/A/T) */
  vfxCategory?: string;
  /** Selected VFX effect */
  vfxEffect?: string;
  /** VFX effects array */
  vfxEffects?: string[];
  /** Custom VFX effects */
  vfxCustom?: string[];
  /** Enable realistic skin (Option R) */
  realisticSkin?: boolean;
  /** Enable face lock (Option F) / Identity lock mode */
  faceLock?: boolean;
  identityLock?: "none" | "soft_lock_person" | "strict_lock_product";
  /** Target aspect ratio */
  aspectRatio?: string;
  aspectRatioCustom?: string;
  /** Language preference */
  language?: "en" | "th" | "both";

  // === NEW: Full Schema Support ===
  /** Generation mode */
  generationMode?: "text_to_image" | "image_to_image" | "inpaint" | "outpaint" | "variation";
  /** Task type */
  task?: "final_prompt" | "ideas_10" | "angles_10" | "storyboard_6" | "infographic_layout" | "style_catalog" | "vfx_catalog" | "typography_catalog";
  /** Detail level */
  detailLevel?: "compact" | "standard" | "full";
  /** Text on image */
  textOnImage?: boolean;
  headline?: string;
  bodyText?: string;
  /** Typography options */
  typography?: {
    fontPersonality?: string[];
    compositionStyle?: string[];
    moodTone?: string[];
    colorDirection?: string[];
    textEffects?: string[];
    useCaseTemplates?: string[];
    modernTrendPacks?: string[];
    layoutAddOns?: string[];
    typographyCustom?: string;
  };
  /** Edit mask for inpaint mode */
  editMask?: {
    type?: string;
    segmentPrompt?: string;
    preserveAreas?: string[];
    feather?: number;
    invert?: boolean;
  };
  /** Outpaint configuration */
  outpaintConfig?: {
    expandLeft?: number;
    expandRight?: number;
    expandTop?: number;
    expandBottom?: number;
    blendWidth?: number;
    matchStyle?: boolean;
  };
  /** Advanced generation parameters */
  advancedParams?: {
    denoisingStrength?: number;
    guidanceScale?: number;
    steps?: number;
    seed?: number;
    sampler?: string;
    clipSkip?: number;
  };
  /** ControlNet configuration */
  controlnet?: {
    enabled?: boolean;
    type?: string;
    weight?: number;
    guidanceStart?: number;
    guidanceEnd?: number;
  };
  /** IP-Adapter configuration */
  ipAdapter?: {
    enabled?: boolean;
    mode?: string;
    weight?: number;
    startStep?: number;
    endStep?: number;
  };
  /** Target platform */
  targetPlatform?: "generic" | "stable_diffusion" | "midjourney" | "dall_e_3" | "gemini_imagen" | "flux" | "firefly";
  /** Persistent preferences */
  preferences?: string[];
}

export interface PromptEnhancementResult {
  success: boolean;
  /** Generated prompt in English */
  promptEn?: string;
  /** Generated prompt in Thai */
  promptTh?: string;
  /** Error message if failed */
  error?: string;
  /** Skill ID used */
  skillId: string;
  /** Available options for refinement */
  options?: PromptOptions;
}

export interface PromptOptions {
  styles: StyleCategory[];
  vfx: VFXCategory[];
  features: {
    realisticSkin: boolean;
    faceLock: boolean;
  };
}

export interface StyleCategory {
  id: string;
  name: string;
  nameEn: string;
  styles: StyleOption[];
}

export interface StyleOption {
  id: string;
  name: string;
  nameEn: string;
  description: string;
}

export interface VFXCategory {
  id: string;
  name: string;
  nameEn: string;
  effects: VFXEffect[];
}

export interface VFXEffect {
  id: string;
  name: string;
  nameEn: string;
  promptText: string;
}

// Style Categories (A-M)
const STYLE_CATEGORIES: StyleCategory[] = [
  {
    id: "A",
    name: "Photorealism / Real-World",
    nameEn: "Photorealism / Real-World",
    styles: [
      { id: "A1", name: "Photorealistic", nameEn: "Photorealistic", description: "Like a real photograph" },
      { id: "A2", name: "Ultra-realistic", nameEn: "Ultra-realistic", description: "High detail, sharp everywhere" },
      { id: "A3", name: "RAW realism", nameEn: "RAW realism", description: "Raw file tone, unedited colors" },
      { id: "A4", name: "Street photography", nameEn: "Street photography", description: "Daily life documentary style" },
      { id: "A5", name: "Film photography", nameEn: "Film photography", description: "Authentic film look" },
    ],
  },
  {
    id: "B",
    name: "Cinematic / Film",
    nameEn: "Cinematic / Film",
    styles: [
      { id: "B1", name: "Hollywood cinematic", nameEn: "Hollywood cinematic", description: "Hollywood movie tone" },
      { id: "B2", name: "Teal & Orange", nameEn: "Teal & Orange", description: "Popular film color grading" },
      { id: "B3", name: "Dark cinematic", nameEn: "Dark cinematic", description: "Dark, dramatic tone" },
      { id: "B4", name: "Film noir", nameEn: "Film noir", description: "Mysterious black and white" },
      { id: "B5", name: "Golden hour cinematic", nameEn: "Golden hour cinematic", description: "Beautiful sunset light" },
    ],
  },
  {
    id: "C",
    name: "Illustration & Art",
    nameEn: "Illustration & Art",
    styles: [
      { id: "C1", name: "Watercolor", nameEn: "Watercolor", description: "Watercolor painting" },
      { id: "C2", name: "Oil painting", nameEn: "Oil painting", description: "Oil paint" },
      { id: "C3", name: "Digital illustration", nameEn: "Digital illustration", description: "Clean digital art" },
      { id: "C4", name: "Sketch / Pencil", nameEn: "Sketch / Pencil", description: "Pencil line art" },
      { id: "C5", name: "Children-book style", nameEn: "Children-book style", description: "Cute children's book style" },
    ],
  },
  {
    id: "D",
    name: "Fantasy & Mythical",
    nameEn: "Fantasy & Mythical",
    styles: [
      { id: "D1", name: "Medieval fantasy", nameEn: "Medieval fantasy", description: "Medieval world" },
      { id: "D2", name: "Gothic fantasy", nameEn: "Gothic fantasy", description: "Dark, mysterious" },
      { id: "D3", name: "Fairycore", nameEn: "Fairycore", description: "Fairy, bright, light" },
      { id: "D4", name: "Magic forest", nameEn: "Magic forest", description: "Enchanted forest" },
      { id: "D5", name: "Dreamy fantasy", nameEn: "Dreamy fantasy", description: "Sweet dream, floating" },
    ],
  },
  {
    id: "E",
    name: "Surreal / Abstract",
    nameEn: "Surreal / Abstract",
    styles: [
      { id: "E1", name: "Dreamlike", nameEn: "Dreamlike", description: "Dream-like" },
      { id: "E2", name: "Vaporwave", nameEn: "Vaporwave", description: "Pink-blue retro 80s" },
      { id: "E3", name: "Synthwave", nameEn: "Synthwave", description: "Neon sci-fi" },
      { id: "E4", name: "Psychedelic art", nameEn: "Psychedelic art", description: "Swirling, vivid colors" },
      { id: "E5", name: "Glitch art", nameEn: "Glitch art", description: "Digital interference" },
    ],
  },
  {
    id: "F",
    name: "Anime / Manga",
    nameEn: "Anime / Manga",
    styles: [
      { id: "F1", name: "Modern anime", nameEn: "Modern anime", description: "Modern anime style" },
      { id: "F2", name: "Chibi", nameEn: "Chibi", description: "Small cute characters" },
      { id: "F3", name: "Ghibli-style", nameEn: "Ghibli-style", description: "Studio Ghibli warmth" },
      { id: "F4", name: "Shonen", nameEn: "Shonen", description: "Teen action" },
      { id: "F5", name: "Cel-shaded", nameEn: "Cel-shaded", description: "Clear cartoon shadows" },
    ],
  },
  {
    id: "G",
    name: "Sci-Fi / Futuristic",
    nameEn: "Sci-Fi / Futuristic",
    styles: [
      { id: "G1", name: "Cyberpunk", nameEn: "Cyberpunk", description: "Neon dark city" },
      { id: "G2", name: "Post-apocalyptic", nameEn: "Post-apocalyptic", description: "After collapse" },
      { id: "G3", name: "Space opera", nameEn: "Space opera", description: "Space epic" },
      { id: "G4", name: "Tech-noir", nameEn: "Tech-noir", description: "Dark sci-fi" },
      { id: "G5", name: "Hologram UI", nameEn: "Hologram UI", description: "Holographic interface" },
    ],
  },
  {
    id: "H",
    name: "3D / CGI / Game",
    nameEn: "3D / CGI / Game",
    styles: [
      { id: "H1", name: "Unreal Engine", nameEn: "Unreal Engine", description: "Sharp, highly realistic" },
      { id: "H2", name: "PBR realistic", nameEn: "PBR realistic", description: "Physics-based materials" },
      { id: "H3", name: "RPG concept art", nameEn: "RPG concept art", description: "RPG world/character design" },
      { id: "H4", name: "JRPG illustration", nameEn: "JRPG illustration", description: "Japanese RPG fantasy style" },
      { id: "H5", name: "Creature concept", nameEn: "Creature concept", description: "Monster/creature design" },
    ],
  },
  {
    id: "I",
    name: "Minimal / Modern",
    nameEn: "Minimal / Modern",
    styles: [
      { id: "I1", name: "Clean minimal", nameEn: "Clean minimal", description: "Simple, low detail" },
      { id: "I2", name: "Scandinavian style", nameEn: "Scandinavian style", description: "Warm, simple, wood and light colors" },
      { id: "I3", name: "Bauhaus", nameEn: "Bauhaus", description: "Geometric, bold colors, clear structure" },
      { id: "I4", name: "Swiss design", nameEn: "Swiss design", description: "Simple, cool, symmetric, clear grid" },
      { id: "I5", name: "Magazine editorial", nameEn: "Magazine editorial", description: "Fashion magazine layout" },
    ],
  },
  {
    id: "J",
    name: "Vintage / Retro",
    nameEn: "Vintage / Retro",
    styles: [
      { id: "J1", name: "80s neon", nameEn: "80s neon", description: "Bold 80s neon" },
      { id: "J2", name: "90s grunge", nameEn: "90s grunge", description: "Raw, dirty 90s tone" },
      { id: "J3", name: "Y2K aesthetic", nameEn: "Y2K aesthetic", description: "Early 2000s, shiny, graphic" },
      { id: "J4", name: "Art Deco", nameEn: "Art Deco", description: "Straight lines, angular, luxurious tone" },
      { id: "J5", name: "Victorian", nameEn: "Victorian", description: "Detailed, luxurious antique" },
    ],
  },
  {
    id: "K",
    name: "Nature / Botanical",
    nameEn: "Nature / Botanical",
    styles: [
      { id: "K1", name: "Botanical illustration", nameEn: "Botanical illustration", description: "Detailed, realistic botanical drawings" },
      { id: "K2", name: "Misty forest", nameEn: "Misty forest", description: "Foggy forest, mysterious atmosphere" },
      { id: "K3", name: "Mountain cinematic", nameEn: "Mountain cinematic", description: "Cinematic mountains, deep dimension" },
      { id: "K4", name: "Ocean realism", nameEn: "Ocean realism", description: "Realistic sea, waves, light reflection" },
      { id: "K5", name: "Underwater", nameEn: "Underwater", description: "Underwater with bubbles, light through surface" },
    ],
  },
  {
    id: "L",
    name: "Character & Fashion",
    nameEn: "Character & Fashion",
    styles: [
      { id: "L1", name: "Editorial fashion", nameEn: "Editorial fashion", description: "Magazine fashion, posed, beautiful lighting" },
      { id: "L2", name: "Street fashion", nameEn: "Street fashion", description: "Real city street fashion" },
      { id: "L3", name: "Korean soft fashion", nameEn: "Korean soft fashion", description: "Soft Korean style" },
      { id: "L4", name: "Beauty portrait", nameEn: "Beauty portrait", description: "Focus on face, eyes, lips, makeup" },
      { id: "L5", name: "High-fashion", nameEn: "High-fashion avant-garde", description: "Unconventional, unusual design" },
    ],
  },
  {
    id: "M",
    name: "Experimental / Hybrid",
    nameEn: "Experimental / Hybrid",
    styles: [
      { id: "M1", name: "Mixed-media", nameEn: "Mixed-media", description: "Mix of painting and photography techniques" },
      { id: "M2", name: "Collage", nameEn: "Collage", description: "Cut and paste multiple images together" },
      { id: "M3", name: "Double exposure", nameEn: "Double exposure", description: "Two scenes overlaid as one image" },
      { id: "M4", name: "Photo-bashing", nameEn: "Photo-bashing", description: "Multiple photo sources combined" },
      { id: "M5", name: "Texture overload", nameEn: "Texture overload", description: "Emphasis on multiple dense textures" },
    ],
  },
];

// VFX Categories
const VFX_CATEGORIES: VFXCategory[] = [
  {
    id: "P",
    name: "Particles",
    nameEn: "Particles",
    effects: [
      { id: "P1", name: "Dust", nameEn: "Dust particles", promptText: "with floating dust particles catching the light, creating an atmospheric and dreamy quality" },
      { id: "P2", name: "Smoke", nameEn: "Smoke", promptText: "with gentle smoke wisps drifting through the scene, adding depth and mystery" },
      { id: "P3", name: "Fire", nameEn: "Fire particles", promptText: "with glowing fire particles and embers floating in the air, creating warmth" },
      { id: "P4", name: "Water", nameEn: "Water droplets", promptText: "with fine water droplets suspended in air, creating freshness and clarity" },
      { id: "P5", name: "Sparks", nameEn: "Sparks", promptText: "with bright sparks and electrical particles creating energy and dynamism" },
      { id: "P6", name: "Pollen", nameEn: "Pollen", promptText: "with pollen particles visible in sunbeams, creating natural organic feel" },
    ],
  },
  {
    id: "L",
    name: "Lighting",
    nameEn: "Lighting",
    effects: [
      { id: "L1", name: "Glow", nameEn: "Glow effect", promptText: "with soft ethereal glow emanating from subject, creating magical atmosphere" },
      { id: "L2", name: "Lens flare", nameEn: "Lens flare", promptText: "with artistic lens flare catching the light source, adding cinematic quality" },
      { id: "L3", name: "God rays", nameEn: "God rays", promptText: "with dramatic god rays streaming through atmosphere, creating divine lighting" },
      { id: "L4", name: "Neon", nameEn: "Neon glow", promptText: "with vibrant neon glow casting colorful reflections, cyberpunk aesthetic" },
      { id: "L5", name: "Bioluminescence", nameEn: "Bio light", promptText: "with bioluminescent glow creating fantasy underwater or forest feel" },
    ],
  },
  {
    id: "W",
    name: "Weather",
    nameEn: "Weather",
    effects: [
      { id: "W1", name: "Rain", nameEn: "Rain", promptText: "with gentle rain creating reflective surfaces and romantic atmosphere" },
      { id: "W2", name: "Heavy rain", nameEn: "Heavy rain", promptText: "with heavy rain pouring dramatically, creating intense mood" },
      { id: "W3", name: "Snow", nameEn: "Snow", promptText: "with snow falling gently, creating peaceful winter scene" },
      { id: "W4", name: "Lightning", nameEn: "Lightning", promptText: "with dramatic lightning illuminating the scene, creating tension" },
      { id: "W5", name: "Wind", nameEn: "Wind effects", promptText: "with visible wind effects on hair and fabric, creating movement" },
    ],
  },
  {
    id: "M",
    name: "Magic",
    nameEn: "Magic",
    effects: [
      { id: "M1", name: "Aura", nameEn: "Energy aura", promptText: "with glowing energy aura surrounding subject, magical power visible" },
      { id: "M2", name: "Magic circle", nameEn: "Magic circle", promptText: "with intricate magic circle glowing beneath or around subject" },
      { id: "M3", name: "Portal", nameEn: "Portal", promptText: "with swirling portal opening nearby, dimensional gateway" },
      { id: "M4", name: "Runes", nameEn: "Glowing runes", promptText: "with ancient glowing runes floating in air, mystical symbols" },
      { id: "M5", name: "Force field", nameEn: "Force field", promptText: "with visible force field or protective barrier surrounding subject" },
    ],
  },
  {
    id: "A",
    name: "Atmospheric",
    nameEn: "Atmospheric",
    effects: [
      { id: "A1", name: "Mist", nameEn: "Mist", promptText: "with light mist creating soft atmosphere and mystery" },
      { id: "A2", name: "Fog", nameEn: "Fog", promptText: "with thick fog obscuring background, creating isolation" },
      { id: "A3", name: "Haze", nameEn: "Haze", promptText: "with atmospheric haze adding depth and distance" },
      { id: "A4", name: "Steam", nameEn: "Steam", promptText: "with visible steam rising, creating warmth and humidity" },
      { id: "A5", name: "Volumetric fog", nameEn: "Volumetric fog", promptText: "with volumetric fog creating dramatic 3D atmosphere" },
    ],
  },
  {
    id: "T",
    name: "Motion",
    nameEn: "Motion",
    effects: [
      { id: "T1", name: "Motion blur", nameEn: "Motion blur", promptText: "with gentle motion blur creating sense of movement while keeping subject sharp" },
      { id: "T2", name: "Speed lines", nameEn: "Speed lines", promptText: "with dynamic speed lines radiating from motion, creating energy and velocity" },
      { id: "T3", name: "Trailing", nameEn: "Trailing effects", promptText: "with soft motion trails following movement, creating fluid dynamic atmosphere" },
      { id: "T4", name: "Impact", nameEn: "Impact waves", promptText: "with impact waves radiating outward, showing force and energy" },
      { id: "T5", name: "Shockwave", nameEn: "Shockwave", promptText: "with visible shockwave distortion spreading through air, dramatic power" },
    ],
  },
];

/**
 * Get all available style categories
 */
export function getStyleCategories(): StyleCategory[] {
  return STYLE_CATEGORIES;
}

/**
 * Get all available VFX categories
 */
export function getVFXCategories(): VFXCategory[] {
  return VFX_CATEGORIES;
}

/**
 * Get available options for prompt enhancement
 */
export function getPromptOptions(): PromptOptions {
  return {
    styles: STYLE_CATEGORIES,
    vfx: VFX_CATEGORIES,
    features: {
      realisticSkin: true,
      faceLock: true,
    },
  };
}

/**
 * Load skill content from file or database
 */
function loadSkillContent(skillId: string): string | null {
  const skill = getSkillById(skillId);
  if (!skill) return null;

  // Try to load from skillFilePath
  if (skill.skillFilePath) {
    try {
      const possiblePaths = [
        path.resolve(process.cwd(), "..", skill.skillFilePath),
        path.resolve(process.cwd(), skill.skillFilePath),
      ];

      for (const filePath of possiblePaths) {
        if (fs.existsSync(filePath)) {
          return fs.readFileSync(filePath, "utf-8");
        }
      }
    } catch (error) {
      console.error(`[PromptEnhancement] Error loading skill file:`, error);
    }
  }

  return null;
}

/**
 * Load skill knowledgebase files (references)
 */
function loadSkillKnowledgebase(skillId: string): string {
  const skill = getSkillById(skillId);
  if (!skill || !skill.skillFilePath) return "";

  const skillDir = path.dirname(skill.skillFilePath);
  const refsDir = path.join(skillDir, "references");
  let knowledgebase = "";

  const possiblePaths = [
    path.resolve(process.cwd(), "..", refsDir),
    path.resolve(process.cwd(), refsDir),
  ];

  for (const fullPath of possiblePaths) {
    if (fs.existsSync(fullPath)) {
      try {
        const files = fs.readdirSync(fullPath).filter(f => f.endsWith(".md"));
        for (const file of files) {
          const content = fs.readFileSync(path.join(fullPath, file), "utf-8");
          knowledgebase += `\n\n--- ${file} ---\n${content}`;
        }
        break;
      } catch (error) {
        console.error(`[PromptEnhancement] Error loading references:`, error);
      }
    }
  }

  return knowledgebase;
}

/**
 * Build the system prompt for the CreateImagePrompt skill
 * Now dynamically loads skill content and builds comprehensive context
 */
export function buildSystemPrompt(request: PromptEnhancementRequest): string {
  const skillId = "image_prompt_engineer"; // Use underscore version
  const skill = getSkillById(skillId) || getSkillById("create-image-prompt");

  if (!skill) {
    throw new Error("Image Prompt Engineer skill not found");
  }

  // Try to load actual skill content
  const skillContent = loadSkillContent(skillId) || loadSkillContent("create-image-prompt");
  const knowledgebase = loadSkillKnowledgebase(skillId) || loadSkillKnowledgebase("create-image-prompt");

  // Build system prompt with actual skill content or enhanced default
  const language = request.language || "en";

  let systemPrompt = `You are PromptDepth Pro v2.1, an expert AI image prompt generator.

Your task is to transform the user's idea into a professional, detailed prompt for AI image generation.
IMPORTANT: The user may write their idea in any language (e.g., Thai, Japanese, Chinese). You MUST always generate the prompt in English, regardless of the input language. Translate and expand the user's idea into a rich English prompt.

## Output Format
`;

  if (language === "en") {
    systemPrompt += `Output ONLY the English prompt. Do NOT include any Thai or other non-English text.
Format:
**[English Prompt]**
<your detailed English prompt here>
`;
  } else if (language === "both") {
    systemPrompt += `Output in this format:
1. **[English Prompt]** - Full prompt in English
2. **[Translated Prompt]** - Full prompt translated to the user's language
`;
  } else {
    systemPrompt += `Output the prompt in Thai.
Format:
**[Thai Prompt]**
<your detailed Thai prompt here>
`;
  }

  systemPrompt += `
## Prompt Structure Rules
- Write semantic narratives (not keyword stacking)
- Include 3-5 realistic imperfections for photorealism
- Specify physics (scale, lighting, placement)
- Use natural, flowing descriptions
- NEVER hallucinate nationality/ethnicity unless explicitly specified

`;

  // Add generation mode context
  const genMode = request.generationMode || "text_to_image";
  systemPrompt += `\n## Generation Mode: ${genMode.toUpperCase().replace(/_/g, " ")}\n`;

  if (genMode === "text_to_image") {
    systemPrompt += `Create a new image from scratch based on the description.\n`;
  } else if (genMode === "image_to_image") {
    systemPrompt += `Transform the reference image(s) while preserving key elements.\n`;
  } else if (genMode === "inpaint") {
    systemPrompt += `Edit only the specified region while keeping everything else intact.\n`;
    if (request.editMask?.segmentPrompt) {
      systemPrompt += `Target area to edit: "${request.editMask.segmentPrompt}"\n`;
    }
    if (request.editMask?.preserveAreas?.length) {
      systemPrompt += `Areas to preserve: ${request.editMask.preserveAreas.join(", ")}\n`;
    }
  } else if (genMode === "outpaint") {
    systemPrompt += `Expand the image beyond its original boundaries.\n`;
    if (request.outpaintConfig) {
      const { expandLeft, expandRight, expandTop, expandBottom } = request.outpaintConfig;
      systemPrompt += `Expansion: L:${expandLeft || 0}px R:${expandRight || 0}px T:${expandTop || 0}px B:${expandBottom || 0}px\n`;
    }
  } else if (genMode === "variation") {
    systemPrompt += `Create variations of the reference image while maintaining its essence.\n`;
  }

  // Add task type context
  const taskType = request.task || "final_prompt";
  if (taskType !== "final_prompt") {
    systemPrompt += `\n## Task Type: ${taskType.toUpperCase().replace(/_/g, " ")}\n`;
    if (taskType === "ideas_10") {
      systemPrompt += `Generate 10 creative concept ideas based on the request.\n`;
    } else if (taskType === "angles_10") {
      systemPrompt += `Generate 10 different camera angles/compositions for the scene.\n`;
    } else if (taskType === "storyboard_6") {
      systemPrompt += `Create a 6-frame storyboard showing sequential scenes.\n`;
    } else if (taskType === "infographic_layout") {
      systemPrompt += `Design an infographic-style layout structure.\n`;
    }
  }

  // Add style context
  if (request.styleName || request.styleCustom) {
    const styleName = request.styleName || request.styleCustom;
    systemPrompt += `\n## Selected Style: ${styleName}\n`;

    // Find style description from categories
    if (request.styleCategory && request.styleName) {
      const category = STYLE_CATEGORIES.find(c => c.id === request.styleCategory);
      const style = category?.styles.find(s => s.name === request.styleName || s.id === request.styleName);
      if (style) {
        systemPrompt += `Apply: ${style.name} (${style.description})\n`;
      }
    }
  }

  // Add VFX effects
  const vfxEffects = request.vfxEffects || [];
  if (request.vfxCategory && request.vfxEffect) {
    const category = VFX_CATEGORIES.find(c => c.id === request.vfxCategory);
    const effect = category?.effects.find(e => e.name === request.vfxEffect || e.id === request.vfxEffect);
    if (effect) {
      vfxEffects.push(effect.promptText);
    }
  }
  if (vfxEffects.length > 0 || request.vfxCustom?.length) {
    systemPrompt += `\n## VFX Effects\n`;
    for (const effect of vfxEffects) {
      systemPrompt += `- ${effect}\n`;
    }
    for (const custom of request.vfxCustom || []) {
      systemPrompt += `- (Custom) ${custom}\n`;
    }
  }

  // Add typography context
  if (request.textOnImage && request.headline) {
    systemPrompt += `\n## Text on Image: YES\n`;
    systemPrompt += `Headline: "${request.headline}"\n`;
    if (request.bodyText) {
      systemPrompt += `Body text: "${request.bodyText}"\n`;
    }
    if (request.typography) {
      const t = request.typography;
      if (t.fontPersonality?.length) systemPrompt += `Font: ${t.fontPersonality.join(", ")}\n`;
      if (t.compositionStyle?.length) systemPrompt += `Composition: ${t.compositionStyle.join(", ")}\n`;
      if (t.moodTone?.length) systemPrompt += `Mood: ${t.moodTone.join(", ")}\n`;
      if (t.colorDirection?.length) systemPrompt += `Colors: ${t.colorDirection.join(", ")}\n`;
      if (t.textEffects?.length) systemPrompt += `Effects: ${t.textEffects.join(", ")}\n`;
    }
  }

  // Add realistic skin option
  if (request.realisticSkin) {
    systemPrompt += `\n## Realistic Skin (Enabled)
Add realistic skin texture with visible pores, micro-texture, natural color variations, and subtle imperfections.
Include: "Realistic Skin: Keep pores, micro-texture, natural tone variation, and authentic skin character."
`;
  }

  // Add identity lock context
  const identityLock = request.identityLock || (request.faceLock ? "soft_lock_person" : "none");
  if (identityLock !== "none") {
    systemPrompt += `\n## Identity Lock: ${identityLock.toUpperCase()}\n`;
    if (identityLock === "soft_lock_person") {
      systemPrompt += `Preserve 90-95% facial identity. Allow lighting/shadow adjustments. NO geometry changes.\n`;
    } else if (identityLock === "strict_lock_product") {
      systemPrompt += `Preserve 100% product identity. Exact colors, logos, details. ZERO changes to product.\n`;
    }
  }

  // Add reference images context
  if (request.referenceImages && request.referenceImages.length > 0) {
    systemPrompt += `\n## Reference Images: ${request.referenceImages.length} image(s)\n`;
    systemPrompt += `Start prompt with: "Using image(s) as reference, generate..."\n`;

    if (request.referenceImageRoles?.length) {
      for (let i = 0; i < request.referenceImageRoles.length; i++) {
        const role = request.referenceImageRoles[i];
        if (role.role && role.role !== "na") {
          systemPrompt += `- Image ${i + 1}: ${role.role}`;
          if (role.notes) systemPrompt += ` (${role.notes})`;
          systemPrompt += `\n`;
        }
      }
    }
  }

  // Add aspect ratio
  const aspectRatio = request.aspectRatioCustom || request.aspectRatio || "9:16";
  systemPrompt += `\n## Aspect Ratio: ${aspectRatio}\n`;

  // Add advanced parameters if provided
  if (request.advancedParams) {
    const params = request.advancedParams;
    systemPrompt += `\n## Advanced Parameters (for reference)\n`;
    if (params.denoisingStrength !== undefined) systemPrompt += `- Denoising: ${params.denoisingStrength}\n`;
    if (params.guidanceScale !== undefined) systemPrompt += `- CFG Scale: ${params.guidanceScale}\n`;
    if (params.steps !== undefined) systemPrompt += `- Steps: ${params.steps}\n`;
    if (params.sampler) systemPrompt += `- Sampler: ${params.sampler}\n`;
  }

  // Add ControlNet context
  if (request.controlnet?.enabled) {
    systemPrompt += `\n## ControlNet: ${request.controlnet.type || "canny"} (weight: ${request.controlnet.weight || 1.0})\n`;
    systemPrompt += `The image structure will be guided by ControlNet. Focus on creative content within the structure.\n`;
  }

  // Add IP-Adapter context
  if (request.ipAdapter?.enabled) {
    systemPrompt += `\n## IP-Adapter: ${request.ipAdapter.mode || "style"} mode (weight: ${request.ipAdapter.weight || 0.6})\n`;
  }

  // Add target platform optimization
  const platform = request.targetPlatform || "generic";
  if (platform !== "generic") {
    systemPrompt += `\n## Target Platform: ${platform.toUpperCase()}\n`;
    if (platform === "midjourney") {
      systemPrompt += `Optimize for Midjourney: Use descriptive narrative style, include --ar and --v parameters.\n`;
    } else if (platform === "stable_diffusion") {
      systemPrompt += `Optimize for Stable Diffusion: Use tag-based keywords, quality markers (masterpiece, best quality).\n`;
    } else if (platform === "dall_e_3") {
      systemPrompt += `Optimize for DALL-E 3: Natural language descriptions, avoid explicit tags.\n`;
    } else if (platform === "flux") {
      systemPrompt += `Optimize for Flux: Balanced style between natural and technical descriptions.\n`;
    }
  }

  // Add persistent preferences
  if (request.preferences?.length) {
    systemPrompt += `\n## User Preferences (Always Apply)\n`;
    for (const pref of request.preferences) {
      systemPrompt += `- ${pref}\n`;
    }
  }

  // Add detail level instruction
  const detailLevel = request.detailLevel || "standard";
  systemPrompt += `\n## Output Detail Level: ${detailLevel.toUpperCase()}\n`;
  if (detailLevel === "compact") {
    systemPrompt += `Provide concise prompt only. No explanations.\n`;
  } else if (detailLevel === "standard") {
    systemPrompt += `Provide prompt + negative/avoid list + recommended parameters.\n`;
  } else if (detailLevel === "full") {
    systemPrompt += `Provide full prompt + negative + parameters + breakdown (subject/scene/light/camera/style/vfx).\n`;
  }

  // Append skill content if loaded (for advanced instructions)
  if (skillContent && skillContent.length > 500) {
    // Extract only the key instructions, not the full documentation
    const instructionMatch = skillContent.match(/## Best Practices[\s\S]*?(?=##|$)/i);
    if (instructionMatch) {
      systemPrompt += `\n${instructionMatch[0]}`;
    }
  }

  return systemPrompt;
}

/**
 * Build the user prompt for the LLM - includes all structured inputs
 */
export function buildUserPrompt(request: PromptEnhancementRequest): string {
  let userPrompt = "";

  // Main request/idea
  if (request.userInput?.trim()) {
    userPrompt = `User's Request: ${request.userInput.trim()}`;
  }

  // Build structured input summary for the LLM
  const inputSummary: string[] = [];

  // Generation mode
  if (request.generationMode && request.generationMode !== "text_to_image") {
    inputSummary.push(`Mode: ${request.generationMode.replace(/_/g, " ")}`);
  }

  // Style
  if (request.styleName && request.styleName !== "na") {
    inputSummary.push(`Style: ${request.styleName.replace(/_/g, " ")}`);
  }
  if (request.styleCustom) {
    inputSummary.push(`Custom style: ${request.styleCustom}`);
  }

  // VFX
  if (request.vfxEffects?.length) {
    inputSummary.push(`VFX: ${request.vfxEffects.map(e => e.replace(/_/g, " ")).join(", ")}`);
  }
  if (request.vfxCustom?.length) {
    inputSummary.push(`Custom VFX: ${request.vfxCustom.join(", ")}`);
  }

  // Text on image
  if (request.textOnImage && request.headline) {
    inputSummary.push(`Text on image: "${request.headline}"${request.bodyText ? ` / "${request.bodyText}"` : ""}`);
  }

  // Aspect ratio
  const aspectRatio = request.aspectRatioCustom || request.aspectRatio;
  if (aspectRatio && aspectRatio !== "9:16") {
    inputSummary.push(`Aspect ratio: ${aspectRatio}`);
  }

  // Identity lock
  if (request.identityLock && request.identityLock !== "none") {
    inputSummary.push(`Identity: ${request.identityLock.replace(/_/g, " ")}`);
  }

  // Realistic skin
  if (request.realisticSkin) {
    inputSummary.push("Realistic skin: enabled");
  }

  // Target platform
  if (request.targetPlatform && request.targetPlatform !== "generic") {
    inputSummary.push(`Platform: ${request.targetPlatform.replace(/_/g, " ")}`);
  }

  // Inpaint mask
  if (request.generationMode === "inpaint" && request.editMask?.segmentPrompt) {
    inputSummary.push(`Edit area: "${request.editMask.segmentPrompt}"`);
  }

  // Append structured summary
  if (inputSummary.length > 0) {
    userPrompt += `\n\nSelected Options:\n- ${inputSummary.join("\n- ")}`;
  }

  // Reference images context
  if (request.referenceImages && request.referenceImages.length > 0) {
    userPrompt += `\n\n[${request.referenceImages.length} reference image(s) provided - analyze them for visual details]`;

    // Add role descriptions
    if (request.referenceImageRoles?.length) {
      const rolesDesc = request.referenceImageRoles
        .map((r, i) => r.role && r.role !== "na" ? `Image ${i + 1}: ${r.role}${r.notes ? ` (${r.notes})` : ""}` : null)
        .filter(Boolean);

      if (rolesDesc.length > 0) {
        userPrompt += `\nImage roles: ${rolesDesc.join(", ")}`;
      }
    }
  }

  // Handle empty text with images
  if (!request.userInput?.trim() && request.referenceImages?.length) {
    userPrompt = `Please analyze the provided reference image(s) and create a detailed prompt that describes what you see. The prompt should be suitable for AI image generation that recreates or reimagines the scene/subject.`;

    if (inputSummary.length > 0) {
      userPrompt += `\n\nApply these options:\n- ${inputSummary.join("\n- ")}`;
    }
  }

  return userPrompt;
}

/**
 * Clean up prompt text by removing markdown formatting, bullets, and numbered lists
 */
function cleanPromptText(text: string): string {
  if (!text) return "";

  let cleaned = text.trim();

  // Remove markdown bold/italic
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, "$1");
  cleaned = cleaned.replace(/\*([^*]+)\*/g, "$1");

  // Remove leading numbered list (1., 2., etc.)
  cleaned = cleaned.replace(/^\d+\.\s*/gm, "");

  // Remove leading bullets/dashes (-, *, •)
  cleaned = cleaned.replace(/^[-*•]\s*/gm, "");

  // Remove trailing numbered list items that are incomplete
  cleaned = cleaned.replace(/\n\d+\.\s*$/g, "");

  // Remove "English Prompt:" or "Thai Prompt:" labels
  cleaned = cleaned.replace(/^(English|Thai|Translated)\s*(Prompt)?\s*:?\s*/gi, "");

  // Remove section headers like "[English Prompt]" or "[Thai]"
  cleaned = cleaned.replace(/^\[.*?\]\s*/gm, "");

  // Collapse multiple newlines into single space (for continuous prompt)
  cleaned = cleaned.replace(/\n+/g, " ");

  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s+/g, " ");

  return cleaned.trim();
}

/**
 * Parse LLM response to extract English and Thai prompts
 */
export function parsePromptResponse(response: string): { promptEn: string; promptTh: string } {
  let promptEn = "";
  let promptTh = "";

  // Try various formats for English prompt extraction

  // Format 1: **[English Prompt]** or **[English]**
  const englishMatch1 = response.match(/\*\*\[English(?:\s+Prompt)?\]\*\*\s*([\s\S]*?)(?=\*\*\[Thai|---|\n\n\*\*|$)/i);
  if (englishMatch1) {
    promptEn = englishMatch1[1];
  }

  // Format 2: 1. **English Prompt:** or **1. English Prompt**
  if (!promptEn) {
    const englishMatch2 = response.match(/(?:1\.\s*)?\*?\*?English(?:\s+Prompt)?\*?\*?:?\s*([\s\S]*?)(?=(?:2\.\s*)?\*?\*?Thai|---|\n\n\d|$)/i);
    if (englishMatch2) {
      promptEn = englishMatch2[1];
    }
  }

  // Format 3: Just look for content between "English" marker and "Thai" marker
  if (!promptEn) {
    const englishMatch3 = response.match(/English[:\s]*([\s\S]*?)(?=Thai|$)/i);
    if (englishMatch3) {
      promptEn = englishMatch3[1];
    }
  }

  // Try various formats for Thai prompt extraction

  // Format 1: **[Thai Prompt]** or **[Translated Prompt]**
  const thaiMatch1 = response.match(/\*\*\[(?:Thai|Translated)(?:\s+Prompt)?\]\*\*\s*([\s\S]*?)(?=\*\*\[|---|\n\nOptions|$)/i);
  if (thaiMatch1) {
    promptTh = thaiMatch1[1];
  }

  // Format 2: 2. **Thai Prompt:** or **2. Thai Prompt**
  if (!promptTh) {
    const thaiMatch2 = response.match(/(?:2\.\s*)?\*?\*?(?:Thai|Translated)(?:\s+Prompt)?\*?\*?:?\s*([\s\S]*?)(?=---|\n\n\d|\n\nOptions|$)/i);
    if (thaiMatch2) {
      promptTh = thaiMatch2[1];
    }
  }

  // Fallback: if no structured format found, use the whole response as English
  if (!promptEn && !promptTh) {
    promptEn = response;
  }

  // Clean up both prompts
  promptEn = cleanPromptText(promptEn);
  promptTh = cleanPromptText(promptTh);

  return { promptEn, promptTh };
}

/**
 * Load skill file content
 */
export async function loadSkillFile(skillId: string): Promise<string | null> {
  const skill = getSkillById(skillId);
  if (!skill || !skill.skillFilePath) {
    return null;
  }

  try {
    const filePath = path.resolve(process.cwd(), "..", skill.skillFilePath);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }

    // Try alternative path
    const altPath = path.resolve(process.cwd(), skill.skillFilePath);
    if (fs.existsSync(altPath)) {
      return fs.readFileSync(altPath, "utf-8");
    }

    return null;
  } catch (error) {
    console.error(`Error loading skill file for ${skillId}:`, error);
    return null;
  }
}
