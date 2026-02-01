/**
 * Skill Detector Service
 * Detects and executes skills based on user messages
 */

import {
  getAvailableSkills,
  getSkillById,
  SkillDefinition,
} from "./skillRegistry";
import { getSkillPreferences } from "./chatService";
import { getUserVisibleSkillsWithAutoTrigger } from "./userSkillService";
import {
  detectModelFromMessage,
  getDefaultModel,
  getAllModelAliases,
  mapToApiModelId,
  MediaType,
} from "./modelRegistry";

export interface SkillDetectionResult {
  detected: boolean;
  skill: SkillDefinition | null;
  confidence: number;
  matchedTrigger: string | null;
  suggestedPrompt: string | null;
}

export interface SkillSettings {
  autoDetect: boolean;
  enabledSkills: string[];
  detectionMode: "ask" | "auto" | "explicit";
}

interface SkillPreference {
  skillId: string;
  enabled: boolean;
  priority: number;
  customSettings?: Record<string, unknown>;
}

/**
 * Detect if a message triggers any skill
 */
export async function detectSkill(
  message: string,
  conversationId?: number,
  skillSettings?: SkillSettings | null,
  userId?: number
): Promise<SkillDetectionResult> {
  const noMatch: SkillDetectionResult = {
    detected: false,
    skill: null,
    confidence: 0,
    matchedTrigger: null,
    suggestedPrompt: null,
  };

  // If auto-detect is disabled, return no match
  if (skillSettings && !skillSettings.autoDetect) {
    return noMatch;
  }

  // Get all available skills sorted by priority
  const skills = getAvailableSkills();

  // Get conversation-specific preferences if available
  let enabledSkillIds: Set<string>;

  // If userId provided, filter by user's visible skills with auto-trigger enabled
  let userVisibleDbIds: Set<number> | null = null;
  if (userId) {
    try {
      const visibleSkills = await getUserVisibleSkillsWithAutoTrigger(userId);
      userVisibleDbIds = new Set(
        visibleSkills.filter((s) => s.autoTriggerEnabled).map((s) => s.skillId)
      );
    } catch {
      // Fall back to default behavior if service fails
    }
  }

  if (skillSettings?.enabledSkills && skillSettings.enabledSkills.length > 0) {
    enabledSkillIds = new Set(skillSettings.enabledSkills);
  } else if (conversationId) {
    const preferences = await getSkillPreferences(conversationId);
    enabledSkillIds = new Set(
      preferences.filter((p) => p.enabled).map((p) => p.skillId)
    );

    // If no preferences set, use default enabled skills
    if (enabledSkillIds.size === 0) {
      enabledSkillIds = new Set(
        skills.filter((s) => s.enabledByDefault).map((s) => s.id)
      );
    }
  } else {
    // Use default enabled skills
    enabledSkillIds = new Set(
      skills.filter((s) => s.enabledByDefault).map((s) => s.id)
    );
  }

  // Check each skill's triggers
  for (const skill of skills) {
    // Skip if skill is not enabled in conversation
    if (!enabledSkillIds.has(skill.id)) {
      continue;
    }

    // Skip if user has this skill not visible or auto-trigger disabled
    if (userVisibleDbIds && skill.dbId != null && !userVisibleDbIds.has(skill.dbId)) {
      continue;
    }

    for (const trigger of skill.triggers) {
      const match = message.match(trigger);
      if (match) {
        // Calculate confidence based on match quality
        const confidence = calculateConfidence(message, match[0], skill);

        // Extract the prompt (content after the trigger)
        const suggestedPrompt = extractPrompt(message, match[0], skill);

        return {
          detected: true,
          skill,
          confidence,
          matchedTrigger: match[0],
          suggestedPrompt,
        };
      }
    }
  }

  return noMatch;
}

/**
 * Calculate detection confidence score
 */
function calculateConfidence(
  message: string,
  matchedText: string,
  skill: SkillDefinition
): number {
  let confidence = 0.7; // Base confidence

  // Higher confidence if match is at the start
  if (message.toLowerCase().startsWith(matchedText.toLowerCase())) {
    confidence += 0.15;
  }

  // Higher confidence for explicit skill keywords
  if (skill.type === "image-generation" && /\b(image|picture|photo|illustration)\b/i.test(matchedText)) {
    confidence += 0.1;
  }

  if (skill.type === "video-generation" && /\b(video|clip|animation)\b/i.test(matchedText)) {
    confidence += 0.1;
  }

  // Ensure confidence is between 0 and 1
  return Math.min(Math.max(confidence, 0), 1);
}

/**
 * Extract the actual prompt from the message
 */
function extractPrompt(
  message: string,
  matchedTrigger: string,
  skill: SkillDefinition
): string {
  // Get the part after the trigger
  const triggerIndex = message.toLowerCase().indexOf(matchedTrigger.toLowerCase());
  let prompt = message.slice(triggerIndex + matchedTrigger.length).trim();

  // Clean up common prefixes
  prompt = prompt
    .replace(/^(of|about|for|with|showing)\s+/i, "")
    .replace(/^(of|about|showing)\s*/i, "")
    .trim();

  // If prompt is empty, use the whole message
  if (!prompt) {
    prompt = message;
  }

  return prompt;
}

/**
 * Check if message explicitly requests a skill
 * Used for "explicit" detection mode
 */
export function isExplicitSkillRequest(message: string): {
  isExplicit: boolean;
  skillId: string | null;
} {
  if (!message.startsWith("/")) {
    return { isExplicit: false, skillId: null };
  }

  // Legacy hardcoded patterns for backward compatibility
  const explicitPatterns = [
    { pattern: /^\/image\s+/i, skillId: "image-generation" },
    { pattern: /^\/video\s+/i, skillId: "video-generation" },
    { pattern: /^\/code\s+/i, skillId: "code-assistant" },
    { pattern: /^\/analyze\s+/i, skillId: "document-analysis" },
    { pattern: /^\/search\s+/i, skillId: "web-search" },
  ];

  for (const { pattern, skillId } of explicitPatterns) {
    if (pattern.test(message)) {
      return { isExplicit: true, skillId };
    }
  }

  // Dynamic: match /<slug> against all available skills
  const command = message.split(/\s+/)[0].slice(1).toLowerCase();
  if (command) {
    const skills = getAvailableSkills();
    const matched = skills.find(
      (s) => s.id === command || s.id.replace(/-/g, "") === command
    );
    if (matched) {
      return { isExplicit: true, skillId: matched.id };
    }
  }

  return { isExplicit: false, skillId: null };
}

/**
 * Get skill execution parameters from message
 * Uses centralized modelRegistry for model detection
 */
export function extractSkillParams(
  message: string,
  skill: SkillDefinition
): Record<string, unknown> {
  // Sanitize and limit prompt length to prevent abuse
  const sanitizedMessage = message.slice(0, 4000).trim();
  const params: Record<string, unknown> = {
    prompt: sanitizedMessage,
  };

  // Determine media type from skill type
  const mediaTypeMap: Record<string, MediaType> = {
    "image-generation": "image",
    "video-generation": "video",
    "audio-generation": "audio",
  };
  const mediaType = mediaTypeMap[skill.type];

  // Extract model preference using modelRegistry
  if (mediaType) {
    const detectedModel = detectModelFromMessage(message, mediaType);

    if (detectedModel) {
      // Store the API model ID
      params.model = detectedModel.id;
    } else {
      // Use default model for this media type
      const defaultModel = getDefaultModel(mediaType);
      if (defaultModel) {
        params.model = defaultModel.id;
      }
    }
  }

  // Extract style preferences for image generation
  if (skill.type === "image-generation") {
    const stylePatterns: Record<string, RegExp> = {
      realistic: /\b(realistic|photo|photograph|photorealistic)\b/i,
      artistic: /\b(artistic|art|painting|painted)\b/i,
      cartoon: /\b(cartoon|anime|animated|illustration)\b/i,
      "3d": /\b(3d|three-dimensional|rendered)\b/i,
    };

    for (const [style, pattern] of Object.entries(stylePatterns)) {
      if (pattern.test(message)) {
        params.style = style;
        break;
      }
    }
  }

  // Extract quality preferences
  if (/\b(high\s*quality|hd|4k|detailed)\b/i.test(message)) {
    params.quality = "high";
  } else if (/\b(low\s*quality|fast|quick)\b/i.test(message)) {
    params.quality = "low";
  }

  // Extract aspect ratio for media generation
  const aspectRatioMatch = message.match(/\b(16:9|9:16|1:1|4:3|3:4|landscape|portrait|square)\b/i);
  if (aspectRatioMatch) {
    const ratioMap: Record<string, string> = {
      "landscape": "16:9",
      "portrait": "9:16",
      "square": "1:1",
    };
    params.aspectRatio = ratioMap[aspectRatioMatch[1].toLowerCase()] || aspectRatioMatch[1];
  }

  // Extract number of images (e.g., "2 images", "3 pictures")
  const numImagesMatch = message.match(/\b(\d+)\s*(images?|pictures?|photos?)\b/i);
  if (numImagesMatch) {
    const num = parseInt(numImagesMatch[1], 10);
    if (num >= 1 && num <= 4) {
      params.numImages = num;
    }
  }

  // Extract video duration (e.g., "5 seconds", "10 sec")
  const durationMatch = message.match(/\b(\d+)\s*(seconds?|sec|s)\b/i);
  if (durationMatch) {
    const duration = parseInt(durationMatch[1], 10);
    if (duration >= 1 && duration <= 60) {
      params.duration = duration;
    }
  }

  // Clean up prompt - remove model specification phrases
  let cleanPrompt = message;
  // Remove "using <model>", "with <model>"
  cleanPrompt = cleanPrompt.replace(/\s*(using|with)\s+[\w\s.-]+$/i, "").trim();

  // Remove model names from prompt using centralized registry
  const allAliases = getAllModelAliases();
  for (const [alias] of allAliases) {
    // Escape special regex characters and create pattern
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleanPrompt = cleanPrompt.replace(new RegExp(escapedAlias, "gi"), "").trim();
  }

  // Clean up extra spaces
  cleanPrompt = cleanPrompt.replace(/\s+/g, " ").trim();

  if (cleanPrompt && cleanPrompt.length > 5) {
    params.prompt = cleanPrompt;
  }

  return params;
}

/**
 * Format skill detection result for display
 */
export function formatSkillDetection(result: SkillDetectionResult): string {
  if (!result.detected || !result.skill) {
    return "";
  }

  const confidencePercent = Math.round(result.confidence * 100);
  return `[Detected: ${result.skill.name} (${confidencePercent}% confidence)]`;
}

/**
 * Get skill detection summary for a conversation
 */
export async function getSkillDetectionSummary(
  conversationId: number,
  userId?: number
): Promise<{
  enabledSkills: SkillDefinition[];
  disabledSkills: SkillDefinition[];
}> {
  let allSkills = getAvailableSkills();

  // Filter by user visibility if userId provided
  if (userId) {
    try {
      const { getUserVisibleSkillIds } = await import("./userSkillService");
      const visibleIds = await getUserVisibleSkillIds(userId);
      const visibleSet = new Set(visibleIds);
      allSkills = allSkills.filter((s) => s.dbId != null && visibleSet.has(s.dbId));
    } catch {
      // Fall back to all skills
    }
  }
  const preferences = await getSkillPreferences(conversationId);

  const preferenceMap = new Map(
    preferences.map((p) => [p.skillId, p])
  );

  const enabledSkills: SkillDefinition[] = [];
  const disabledSkills: SkillDefinition[] = [];

  for (const skill of allSkills) {
    const pref = preferenceMap.get(skill.id);

    if (pref) {
      if (pref.enabled) {
        enabledSkills.push(skill);
      } else {
        disabledSkills.push(skill);
      }
    } else {
      // Use default
      if (skill.enabledByDefault) {
        enabledSkills.push(skill);
      } else {
        disabledSkills.push(skill);
      }
    }
  }

  return { enabledSkills, disabledSkills };
}
