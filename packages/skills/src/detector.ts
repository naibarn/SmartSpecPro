/**
 * Skill Detector — Pure Detection Logic
 *
 * Platform-independent skill detection from user messages.
 * Does NOT depend on database, model registry, or user preferences.
 * Each platform wires up its own skill source and filtering.
 */

import type {
  SkillDefinition,
  SkillDetectionResult,
  AgencyTriggerDefinition,
  AgencyDetectionResult,
} from "./types";

/**
 * Detect if a message triggers any skill from a given skill list.
 * The caller is responsible for filtering enabled/visible skills before calling.
 */
export function detectSkillFromList(
  message: string,
  skills: SkillDefinition[]
): SkillDetectionResult {
  const noMatch: SkillDetectionResult = {
    detected: false,
    skill: null,
    confidence: 0,
    matchedTrigger: null,
    suggestedPrompt: null,
    patternChainTo: null,
  };

  for (const skill of skills) {
    for (const trigger of skill.triggers) {
      const match = message.match(trigger.regex);
      if (match) {
        const confidence = calculateConfidence(message, match[0], skill);
        const suggestedPrompt = extractPrompt(message, match[0]);

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

/**
 * Calculate detection confidence score
 */
export function calculateConfidence(
  message: string,
  matchedText: string,
  skill: SkillDefinition
): number {
  let confidence = 0.7;

  // Higher confidence if match is at the start
  if (message.toLowerCase().startsWith(matchedText.toLowerCase())) {
    confidence += 0.15;
  }

  // Higher confidence for explicit media keywords
  if (skill.type === "image-generation" && /\b(image|picture|photo|illustration)\b/i.test(matchedText)) {
    confidence += 0.1;
  }
  if (skill.type === "video-generation" && /\b(video|clip|animation)\b/i.test(matchedText)) {
    confidence += 0.1;
  }

  return Math.min(Math.max(confidence, 0), 1);
}

/**
 * Extract the actual prompt from a message after the trigger match
 */
export function extractPrompt(message: string, matchedTrigger: string): string {
  const triggerIndex = message.toLowerCase().indexOf(matchedTrigger.toLowerCase());
  let prompt = message.slice(triggerIndex + matchedTrigger.length).trim();

  prompt = prompt
    .replace(/^(of|about|for|with|showing)\s+/i, "")
    .replace(/^(of|about|showing)\s*/i, "")
    .trim();

  if (!prompt) {
    prompt = message;
  }

  return prompt;
}

/**
 * Check if message is an explicit slash-command skill request.
 * Matches against a provided skill list (no hardcoded registry).
 */
export function isExplicitSkillRequest(
  message: string,
  skills: SkillDefinition[]
): { isExplicit: boolean; skillId: string | null } {
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

  // Dynamic: match /<slug> against provided skills
  const command = message.split(/\s+/)[0].slice(1).toLowerCase();
  if (command) {
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
 * Extract style/quality/aspect-ratio params from a message (media skills)
 */
export function extractMediaParams(
  message: string,
  skillType: string
): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  // Style for image generation
  if (skillType === "image-generation") {
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

  // Quality
  if (/\b(high\s*quality|hd|4k|detailed)\b/i.test(message)) {
    params.quality = "high";
  } else if (/\b(low\s*quality|fast|quick)\b/i.test(message)) {
    params.quality = "low";
  }

  // Aspect ratio
  const aspectMatch = message.match(/\b(16:9|9:16|1:1|4:3|3:4|landscape|portrait|square)\b/i);
  if (aspectMatch) {
    const ratioMap: Record<string, string> = { landscape: "16:9", portrait: "9:16", square: "1:1" };
    params.aspectRatio = ratioMap[aspectMatch[1].toLowerCase()] || aspectMatch[1];
  }

  // Number of images
  const numMatch = message.match(/\b(\d+)\s*(images?|pictures?|photos?)\b/i);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    if (num >= 1 && num <= 4) params.numImages = num;
  }

  // Video duration
  const durMatch = message.match(/\b(\d+)\s*(seconds?|sec|s)\b/i);
  if (durMatch) {
    const dur = parseInt(durMatch[1], 10);
    if (dur >= 1 && dur <= 60) params.duration = dur;
  }

  return params;
}

/**
 * Format detection result for display
 */
export function formatSkillDetection(result: SkillDetectionResult): string {
  if (!result.detected || !result.skill) return "";
  const pct = Math.round(result.confidence * 100);
  return `[Detected: ${result.skill.name} (${pct}% confidence)]`;
}

// ---- Agency Detection ----

/**
 * Detect if a message triggers any agency from a given list.
 * Structurally identical to detectSkillFromList but for agencies.
 * Agencies are sorted by priority (higher first) before matching.
 */
export function detectAgencyFromList(
  message: string,
  agencies: AgencyTriggerDefinition[]
): AgencyDetectionResult {
  const noMatch: AgencyDetectionResult = {
    detected: false,
    agency: null,
    confidence: 0,
    matchedTrigger: null,
    suggestedPrompt: null,
  };

  // Sort by priority descending (higher priority checked first)
  const sorted = [...agencies].sort((a, b) => b.priority - a.priority);

  for (const agency of sorted) {
    for (const trigger of agency.triggers) {
      const match = message.match(trigger.regex);
      if (match) {
        const confidence = calculateAgencyConfidence(message, match[0]);
        const suggestedPrompt = extractPrompt(message, match[0]);

        return {
          detected: true,
          agency,
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
 * Calculate detection confidence for agency triggers.
 */
function calculateAgencyConfidence(message: string, matchedText: string): number {
  let confidence = 0.7;

  // Higher confidence if match is at the start
  if (message.toLowerCase().startsWith(matchedText.toLowerCase())) {
    confidence += 0.15;
  }

  // Higher confidence for longer, more specific matches
  if (matchedText.length > 10) {
    confidence += 0.05;
  }

  return Math.min(Math.max(confidence, 0), 1);
}
