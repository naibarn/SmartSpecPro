/**
 * Skill File Parser
 *
 * Parses skill.md files with YAML frontmatter into structured data.
 * Pure function — no DB or platform dependencies.
 */

import yaml from "js-yaml";
import type { SkillMetadata, TriggerRule, PatternRule, SkillExecutionPolicyConfig, SkillContentQuality } from "./types";

/**
 * Parse a skill.md file — extract YAML frontmatter and markdown content
 */
export function parseSkillFile(content: string): { metadata: SkillMetadata; content: string; warnings?: string[] } {
  if (content.startsWith("---")) {
    const parts = content.split("---");
    if (parts.length >= 3) {
      try {
        const frontmatter = yaml.load(parts[1], { schema: yaml.JSON_SCHEMA }) as SkillMetadata;
        const body = parts.slice(2).join("---").trim();
        const metadata = frontmatter || {} as SkillMetadata;
        const warnings: string[] = [];

        // Validate and merge Spec 038 execution_policy content fields
        const execPolicy = metadata.execution_policy ?? metadata.executionPolicy;
        if (execPolicy && typeof execPolicy === "object") {
          const { fields: validatedFields, warnings: epWarnings } = parseExecutionPolicyContentFields(execPolicy as Record<string, unknown>);
          warnings.push(...epWarnings);
          // Write validated fields back, stripping invalid enum values
          if (validatedFields) {
            Object.assign(execPolicy, validatedFields);
          }
          // Remove invalid enum values that weren't in validatedFields
          if (epWarnings.length > 0) {
            for (const w of epWarnings) {
              if (w.includes("thinking_level_hint")) delete (execPolicy as any).thinking_level_hint;
              if (w.includes("output_format")) delete (execPolicy as any).output_format;
            }
          }
        }

        // Validate content_quality
        const rawCQ = metadata.content_quality ?? metadata.contentQuality;
        if (rawCQ && typeof rawCQ === "object") {
          const { quality, warnings: cqWarnings } = parseContentQuality(rawCQ as Record<string, unknown>);
          warnings.push(...cqWarnings);
          // Replace raw YAML with validated version (or clear if invalid)
          metadata.content_quality = quality;
          metadata.contentQuality = quality;
        }

        return { metadata, content: body, warnings: warnings.length > 0 ? warnings : undefined };
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
    "image_prompt_generation": "image_prompt_generation",
    "image-prompt-generation": "image_prompt_generation",
    "video_generation": "video_generation",
    "video-generation": "video_generation",
    "video_prompt_generation": "video_prompt_generation",
    "video-prompt-generation": "video_prompt_generation",
    "audio_prompt_generation": "audio_prompt_generation",
    "audio-prompt-generation": "audio_prompt_generation",
    "image_video_generation": "image_video_generation",
    "image-video-generation": "image_video_generation",
    "audio_generation": "audio_generation",
    "audio-generation": "audio_generation",
    "article_generation": "article_generation",
    "article-generation": "article_generation",
    "slide_generation": "slide_generation",
    "slide-generation": "slide_generation",
    "product_review": "product_review",
    "product-review": "product_review",
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
  return categoryMap[category || ""] || "other";
}

/**
 * Map database category (snake_case) to SkillType (kebab-case)
 */
export function categoryToSkillType(category: string): string {
  const categoryMap: Record<string, string> = {
    "image_generation": "image-generation",
    "image_prompt_generation": "prompt-enhancement",
    "video_generation": "video-generation",
    "video_prompt_generation": "prompt-enhancement",
    "audio_prompt_generation": "prompt-enhancement",
    "image_video_generation": "image-video-generation",
    "audio_generation": "audio-generation",
    "article_generation": "chat-assistant",
    "slide_generation": "chat-assistant",
    "product_review": "chat-assistant",
    "sound_effects": "audio-generation",
    "code_assistant": "code-assistant",
    "document_analysis": "document-analysis",
    "web_search": "web-search",
    "prompt_enhancement": "prompt-enhancement",
    "automation": "automation",
    "chat_assistant": "chat-assistant",
    "translation": "translation",
    "data_analysis": "chat-assistant",
    "summarization": "chat-assistant",
    "other": "chat-assistant",
  };
  return categoryMap[category] || "chat-assistant";
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

/**
 * Parse trigger patterns from database format to TriggerRule[]
 * Supports both legacy string[] format and new PatternRule[] format
 */
export function parseTriggerPatterns(patterns: Array<string | PatternRule> | null | undefined): TriggerRule[] {
  if (!patterns || !Array.isArray(patterns)) return [];
  return patterns
    .map((p): TriggerRule | null => {
      try {
        // Handle both string and PatternRule formats
        const patternStr = typeof p === "string" ? p : p.pattern;
        const chainTo = typeof p === "string" ? undefined : p.chainTo;
        const label = typeof p === "string" ? undefined : p.label;

        if (!patternStr || !isSafeRegex(patternStr)) return null;

        return {
          regex: new RegExp(patternStr, "i"),
          pattern: patternStr,
          chainTo: chainTo ?? undefined,
          label: label ?? undefined,
        };
      } catch {
        return null;
      }
    })
    .filter((r): r is TriggerRule => r !== null);
}

/**
 * Legacy function for backward compatibility - returns just RegExp[]
 * @deprecated Use parseTriggerPatterns instead which returns TriggerRule[]
 */
export function parseTriggerPatternsLegacy(patterns: string[] | null | undefined): RegExp[] {
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

const VALID_THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const;
const VALID_OUTPUT_FORMATS = ["cms_article", "cms_review", "markdown", "json"] as const;
const VALID_CITATION_LEVELS = ["critical", "major", "minor"] as const;

type Spec038PolicyFields = Pick<SkillExecutionPolicyConfig, "requires_web_search" | "requires_citations" | "requires_structured_output" | "thinking_level_hint" | "output_format" | "max_tokens_hint">;

/**
 * Parse and validate execution_policy fields from Spec 038 (content quality).
 * Invalid enum values are stripped and reported as warnings.
 */
export function parseExecutionPolicyContentFields(
  raw: Record<string, unknown> | undefined
): { fields: Spec038PolicyFields | undefined; warnings: string[] } {
  if (!raw || typeof raw !== "object") return { fields: undefined, warnings: [] };

  const result: Record<string, unknown> = {};
  const warnings: string[] = [];

  if ("requires_web_search" in raw) result.requires_web_search = Boolean(raw.requires_web_search);
  if ("requires_citations" in raw) result.requires_citations = Boolean(raw.requires_citations);
  if ("requires_structured_output" in raw) result.requires_structured_output = Boolean(raw.requires_structured_output);

  if ("thinking_level_hint" in raw) {
    const val = String(raw.thinking_level_hint);
    if ((VALID_THINKING_LEVELS as readonly string[]).includes(val)) {
      result.thinking_level_hint = val;
    } else {
      warnings.push(`Invalid thinking_level_hint: "${val}"`);
    }
  }

  if ("output_format" in raw) {
    const val = String(raw.output_format);
    if ((VALID_OUTPUT_FORMATS as readonly string[]).includes(val)) {
      result.output_format = val;
    } else {
      warnings.push(`Invalid output_format: "${val}"`);
    }
  }

  if ("max_tokens_hint" in raw) {
    const num = Number(raw.max_tokens_hint);
    if (!isNaN(num) && num > 0) result.max_tokens_hint = num;
  }

  return {
    fields: Object.keys(result).length > 0 ? result as Spec038PolicyFields : undefined,
    warnings,
  };
}

/**
 * Parse and validate content_quality fields from Spec 038.
 */
export function parseContentQuality(
  raw: Record<string, unknown> | undefined
): { quality: SkillContentQuality | undefined; warnings: string[] } {
  if (!raw || typeof raw !== "object") return { quality: undefined, warnings: [] };

  const result: SkillContentQuality = {};
  const warnings: string[] = [];

  if ("citation_required_for" in raw && Array.isArray(raw.citation_required_for)) {
    const valid = raw.citation_required_for.filter((v: unknown) =>
      (VALID_CITATION_LEVELS as readonly string[]).includes(String(v))
    );
    const invalid = raw.citation_required_for.filter((v: unknown) =>
      !(VALID_CITATION_LEVELS as readonly string[]).includes(String(v))
    );
    if (invalid.length > 0) {
      warnings.push(`Invalid citation_required_for values: ${invalid.join(", ")}`);
    }
    if (valid.length > 0) result.citation_required_for = valid as ("critical" | "major" | "minor")[];
  }

  if ("min_citation_coverage" in raw) {
    const num = Number(raw.min_citation_coverage);
    if (!isNaN(num) && num >= 0 && num <= 1) {
      result.min_citation_coverage = num;
    } else {
      warnings.push(`Invalid min_citation_coverage: "${raw.min_citation_coverage}" (must be 0.0-1.0)`);
    }
  }

  if ("disclosure_required" in raw) result.disclosure_required = Boolean(raw.disclosure_required);
  if ("refresh_cadence_days" in raw) {
    const num = Number(raw.refresh_cadence_days);
    if (!isNaN(num) && num > 0) result.refresh_cadence_days = num;
  }

  return {
    quality: Object.keys(result).length > 0 ? result : undefined,
    warnings,
  };
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
  chainTo?: string;
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
    chainTo: (raw.chainTo ?? raw.chain_to ?? undefined) as string | undefined,
  };
}
