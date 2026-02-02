/**
 * Skill File Parser
 *
 * Parses skill.md files with YAML frontmatter into structured data.
 * Pure function — no DB or platform dependencies.
 */

import yaml from "js-yaml";
import type { SkillMetadata } from "./types";

/**
 * Parse a skill.md file — extract YAML frontmatter and markdown content
 */
export function parseSkillFile(content: string): { metadata: SkillMetadata; content: string } {
  if (content.startsWith("---")) {
    const parts = content.split("---");
    if (parts.length >= 3) {
      try {
        const frontmatter = yaml.load(parts[1], { schema: yaml.JSON_SCHEMA }) as SkillMetadata;
        const body = parts.slice(2).join("---").trim();
        return { metadata: frontmatter || {}, content: body };
      } catch {
        return { metadata: {} as SkillMetadata, content };
      }
    }
  }
  return { metadata: {} as SkillMetadata, content };
}

/**
 * Map category string (from frontmatter or DB) to normalized enum value
 */
export function mapCategoryToEnum(category?: string): string {
  const categoryMap: Record<string, string> = {
    "prompt_enhancement": "prompt_enhancement",
    "prompt-enhancement": "prompt_enhancement",
    "image_generation": "image_generation",
    "image-generation": "image_generation",
    "video_generation": "video_generation",
    "video-generation": "video_generation",
    "audio_generation": "audio_generation",
    "audio-generation": "audio_generation",
    "sound_effects": "sound_effects",
    "sound-effects": "sound_effects",
    "code_assistant": "code_assistant",
    "code-assistant": "code_assistant",
    "document_analysis": "document_analysis",
    "document-analysis": "document_analysis",
    "web_search": "web_search",
    "web-search": "web_search",
    "automation": "automation",
    "chat_assistant": "chat_assistant",
    "chat-assistant": "chat_assistant",
    "translation": "translation",
    "summarization": "summarization",
    "data_analysis": "data_analysis",
    "data-analysis": "data_analysis",
    "other": "other",
  };
  return categoryMap[category || ""] || "prompt_enhancement";
}

/**
 * Map database category (snake_case) to SkillType (kebab-case)
 */
export function categoryToSkillType(category: string): string {
  const categoryMap: Record<string, string> = {
    "image_generation": "image-generation",
    "video_generation": "video-generation",
    "audio_generation": "audio-generation",
    "sound_effects": "audio-generation",
    "code_assistant": "code-assistant",
    "document_analysis": "document-analysis",
    "web_search": "web-search",
    "prompt_enhancement": "prompt-enhancement",
    "automation": "automation",
    "chat_assistant": "chat-assistant",
    "translation": "translation",
  };
  return categoryMap[category] || "prompt-enhancement";
}

/**
 * Parse trigger patterns (JSON array of regex strings) into RegExp[]
 */
/**
 * Check if a regex pattern is potentially vulnerable to ReDoS.
 * Rejects patterns with nested quantifiers like (a+)+, (a*)*,  (a+)*, etc.
 */
function isSafeRegex(pattern: string): boolean {
  // Reject extremely long patterns
  if (pattern.length > 200) return false;

  // Reject nested quantifiers — common ReDoS source: (a+)+, (a*)+, (a+)*, etc.
  if (/[+*}\?]\s*\)[+*?]/.test(pattern)) return false;

  // Reject overlapping alternations with quantifiers: (a|a)+, (.*|.*)+
  if (/\([^)]*\|[^)]*\)[+*]/.test(pattern)) return false;

  // Reject .* or .+ repeated in groups: (.*)+, (.+)+
  if (/\(\.\s*[+*]\s*\)[+*]/.test(pattern)) return false;

  // Reject deeply nested groups (more than 3 levels)
  let depth = 0;
  for (const ch of pattern) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth > 3) return false;
  }

  return true;
}

export function parseTriggerPatterns(patterns: string[] | null | undefined): RegExp[] {
  if (!patterns || !Array.isArray(patterns)) return [];
  return patterns
    .map((p) => {
      try {
        if (!isSafeRegex(p)) return null;
        return new RegExp(p, "i");
      } catch {
        return null;
      }
    })
    .filter((r): r is RegExp => r !== null);
}

/**
 * Normalize skill metadata from frontmatter (handles snake_case / camelCase variants)
 */
export function normalizeMetadata(raw: SkillMetadata, slug: string): {
  name: string;
  description: string;
  isAutoTrigger: boolean;
  triggerPatterns: string[];
  creditMultiplier: number;
  enabledByDefault: boolean;
  priority: number;
  executionMode: string;
} {
  return {
    name: raw.name || slug,
    description: raw.description || `Skill: ${slug}`,
    isAutoTrigger: raw.isAutoTrigger ?? raw.auto_trigger ?? false,
    triggerPatterns: raw.triggerPatterns ?? raw.trigger_patterns ?? [],
    creditMultiplier: raw.creditMultiplier ?? raw.credit_multiplier ?? 1.0,
    enabledByDefault: raw.enabledByDefault ?? raw.enabled_by_default ?? true,
    priority: raw.priority ?? 50,
    executionMode: (raw.executionMode ?? raw.execution_mode ?? "llm-only") as string,
  };
}
