/**
 * Skill Engine Types
 *
 * Core type definitions for the unified skill system.
 * Re-exports base types from @smartspec/shared and adds engine-specific types.
 */

export type { SkillScope, SkillMode, SkillFormat, SkillBase } from '@smartspec/shared';

export type SkillType =
  | "image-generation"
  | "video-generation"
  | "audio-generation"
  | "code-assistant"
  | "document-analysis"
  | "web-search"
  | "prompt-enhancement"
  | "automation"
  | "chat-assistant"
  | "translation";

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

  /** System prompt for LLM-based skills */
  systemPrompt?: string;

  /** Skill content (markdown instructions) */
  skillContent?: string;

  /** Reference to external skill file path */
  skillFilePath?: string;

  /** Database ID if from database */
  dbId?: number;
}

/**
 * Skill metadata from skill.md YAML frontmatter
 */
export interface SkillMetadata {
  name: string;
  version?: string;
  author?: string;
  description?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  // Support both snake_case and camelCase from YAML frontmatter
  auto_trigger?: boolean;
  isAutoTrigger?: boolean;
  trigger_patterns?: string[];
  triggerPatterns?: string[];
  credit_multiplier?: number;
  creditMultiplier?: number;
  priority?: number;
  enabled_by_default?: boolean;
  enabledByDefault?: boolean;
  config?: Record<string, unknown>;
}

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
