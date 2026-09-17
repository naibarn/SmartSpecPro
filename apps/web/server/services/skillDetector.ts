/**
 * Skill Detector Service
 * Detects and executes skills based on user messages
 */

import {
  getAvailableSkills,
  getSkillById,
} from "./skillRegistry";
import type { SkillDefinition } from "@smartspec/skills";
import { getSkillPreferences } from "./chatService";
import { getUserVisibleSkillsWithAutoTrigger } from "./userSkillService";
import {
  detectModelFromMessage,
  getDefaultModel,
  getAllModelAliases,
  mapToApiModelId,
  MediaType,
} from "./modelRegistry";

import {
  type SkillDetectionResult,
  type SkillSettings,
  calculateConfidence as sharedCalculateConfidence,
  extractPrompt as sharedExtractPrompt,
  isExplicitSkillRequest as sharedIsExplicitSkillRequest,
  extractMediaParams,
  formatSkillDetection as sharedFormatSkillDetection,
} from "@smartspec/skills";

export type { SkillDetectionResult, SkillSettings } from "@smartspec/skills";

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
    patternChainTo: null,
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
      const match = message.match(trigger.regex);
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
          // Include per-pattern chainTo if configured
          patternChainTo: trigger.chainTo ?? null,
        };
      }
    }
  }

  return noMatch;
}

// calculateConfidence and extractPrompt are now imported from @smartspec/skills
const calculateConfidence = sharedCalculateConfidence;
const extractPrompt = (message: string, matchedTrigger: string, _skill: SkillDefinition) =>
  sharedExtractPrompt(message, matchedTrigger);

/**
 * Check if message explicitly requests a skill
 * Delegates to shared logic with current available skills
 */
export function isExplicitSkillRequest(message: string): {
  isExplicit: boolean;
  skillId: string | null;
} {
  return sharedIsExplicitSkillRequest(message, getAvailableSkills());
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
    // Merge shared media params (style, quality, aspectRatio, numImages, duration)
    ...extractMediaParams(message, skill.type),
  };

  // Platform-specific: model detection via modelRegistry
  const mediaTypeMap: Record<string, MediaType> = {
    "image-generation": "image",
    "video-generation": "video",
    "audio-generation": "audio",
  };
  const mediaType = mediaTypeMap[skill.type];

  if (mediaType) {
    const detectedModel = detectModelFromMessage(message, mediaType);
    if (detectedModel) {
      params.model = detectedModel.id;
    } else {
      const defaultModelDef = getDefaultModel(mediaType);
      if (defaultModelDef) {
        params.model = defaultModelDef.id;
      }
    }
  }

  // Clean up prompt - remove model specification phrases
  let cleanPrompt = message;
  cleanPrompt = cleanPrompt.replace(/\s*(using|with)\s+[\w\s.-]+$/i, "").trim();

  const allAliases = getAllModelAliases();
  for (const [alias] of allAliases) {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleanPrompt = cleanPrompt.replace(new RegExp(escapedAlias, "gi"), "").trim();
  }

  cleanPrompt = cleanPrompt.replace(/\s+/g, " ").trim();
  if (cleanPrompt && cleanPrompt.length > 5) {
    params.prompt = cleanPrompt;
  }

  return params;
}

/**
 * Format skill detection result for display
 */
export const formatSkillDetection = sharedFormatSkillDetection;

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
