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
  | "image-video-generation"
  | "audio-generation"
  | "code-assistant"
  | "document-analysis"
  | "web-search"
  | "prompt-enhancement"
  | "automation"
  | "chat-assistant"
  | "translation";

/**
 * A parsed trigger rule with regex and optional chainTo
 */
export interface TriggerRule {
  /** The compiled regex pattern */
  regex: RegExp;
  /** Original pattern string for display/logging */
  pattern: string;
  /** Optional skill slug to chain to when this pattern matches */
  chainTo?: string | null;
  /** Optional label for admin UI display */
  label?: string;
}

/**
 * Raw pattern rule from database (JSON format)
 */
export interface PatternRule {
  /** Regex pattern string */
  pattern: string;
  /** Optional skill slug to chain to */
  chainTo?: string | null;
  /** Optional label for admin UI */
  label?: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: SkillType;
  category?: string;

  /** Trigger rules (regex + optional per-pattern chainTo) */
  triggers: TriggerRule[];

  /** Whether this skill requires explicit invocation */
  requiresExplicit: boolean;

  /** Credit cost multiplier */
  creditMultiplier: number;

  /** Available models for this skill */
  models?: string[];

  /** Default model if multiple available */
  defaultModel?: string;

  /** Canonical routed LLM model id for text generation */
  llmModelId?: string;

  /** Optional pinned provider for this skill (llm_providers.id) */
  preferredProviderId?: number;

  /** If true, enforce preferredProviderId with no provider fallback */
  strictProviderPin?: boolean;

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

  /** Execution mode for skill dispatch routing */
  executionMode?:
    | "llm-only"         // Legacy: LLM-only text processing
    | "core-text"        // Canonical: LLM-only text processing
    | "media-generate"   // Legacy: media generation (sandbox-media when enabled)
    | "python"           // Legacy: subprocess execution
    | "sandbox-code"     // Python/Node code execution in sandbox
    | "sandbox-command"  // Shell command execution in sandbox
    | "sandbox-browser"  // Browser automation in sandbox
    | "sandbox-file"     // File processing in sandbox
    | "sandbox-media";   // Media generation in sandbox

  /** Sandbox profile slug from sandbox_profiles table */
  sandboxProfileSlug?: string;

  /** Whether this skill requires network access in sandbox */
  requiresNetwork?: boolean;

  /** Whether this skill requires browser access in sandbox */
  requiresBrowser?: boolean;

  /** Max runtime in seconds for sandbox execution */
  maxRuntimeSeconds?: number;

  /** Max input size in MB for sandbox execution */
  maxInputMb?: number;

  /** Chain to another skill after this skill completes (skill slug) */
  chainTo?: string;

  /** Database ID if from database */
  dbId?: number;

  /**
   * Capability-first execution policy for planner-based model selection.
   * When present, the planner uses this to resolve allowed models
   * instead of relying solely on llmModelId/defaultModel.
   */
  executionPolicy?: SkillExecutionPolicyConfig;

  /** Content quality constraints for citation-gated publishing */
  contentQuality?: SkillContentQuality;
}

/**
 * Skill execution policy configuration from skill.md frontmatter.
 *
 * Modes:
 * - `requirements`: resolve from capability requirements (default)
 * - `fixed`: use a specific model only
 * - `hybrid`: prefer fixed model, fall back to requirements-based
 */
export interface SkillExecutionPolicyConfig {
  mode?: "requirements" | "fixed" | "hybrid";

  /** Capability requirements for model selection */
  requirements?: {
    supportsResponses?: boolean;
    supportsStructuredOutputs?: boolean;
    supportsWebSearch?: boolean;
    supportsFunctionTools?: boolean;
    supportsCodeExecution?: boolean;
    supportsComputerUse?: boolean;
    supportsBackground?: boolean;
    contextLength?: number;
  };

  /** Fixed model ID (for fixed/hybrid modes) */
  fixedModel?: string;

  /** Whether conversation model can override this policy */
  allowConversationOverride?: boolean;

  /** Preferred strategy: "cheapest", "fastest", "best" */
  preferredStrategy?: "cheapest" | "fastest" | "best";

  /** Ordered preferred model IDs */
  preferredProfiles?: string[];

  /** Fallback model IDs */
  allowedFallbackProfiles?: string[];

  /** Models that must NOT be used */
  disallowedModels?: string[];

  /** Budget class: "economy", "standard", "premium" */
  budgetClass?: "economy" | "standard" | "premium";

  /** Whether tenant admin can override */
  overrideableByTenant?: boolean;

  /** Fallback behavior: "error" | "use_default" */
  fallbackPolicy?: "error" | "use_default";

  // --- Spec 038: Citation-gated content quality fields ---

  /** Whether this skill requires web search grounding for citations */
  requires_web_search?: boolean;

  /** Whether this skill requires citations on claims */
  requires_citations?: boolean;

  /** Whether this skill requires structured (JSON) output */
  requires_structured_output?: boolean;

  /** Hint for provider thinking/reasoning level */
  thinking_level_hint?: "minimal" | "low" | "medium" | "high";

  /** Output format hint for CMS integration */
  output_format?: "cms_article" | "cms_review" | "markdown" | "json";

  /** Hint for max tokens to request from the model */
  max_tokens_hint?: number;
}

/**
 * Content quality constraints for citation-gated publishing.
 * Declared in skill.md frontmatter under `content_quality:`.
 */
export interface SkillContentQuality {
  /** Claim severity levels that require citations */
  citation_required_for?: ("critical" | "major" | "minor")[];

  /** Minimum fraction of claims that must have citations (0.0 - 1.0) */
  min_citation_coverage?: number;

  /** Whether the output must include a disclosure statement */
  disclosure_required?: boolean;

  /** How often (days) this content should be refreshed. null = never */
  refresh_cadence_days?: number;
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
  chainTo?: string;
  chain_to?: string;
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
  execution_mode?: string;
  executionMode?: string;
  default_model?: string;
  defaultModel?: string;
  llm_model_id?: string;
  llmModelId?: string;
  preferred_provider_id?: number;
  preferredProviderId?: number;
  strict_provider_pin?: boolean;
  strictProviderPin?: boolean;
  config?: Record<string, unknown>;
  // Execution policy (capability-first model selection)
  execution_policy?: SkillExecutionPolicyConfig;
  executionPolicy?: SkillExecutionPolicyConfig;
  // Sandbox-related frontmatter fields
  sandbox_profile?: string;
  requires_network?: boolean;
  requires_browser?: boolean;
  max_runtime_seconds?: number;
  max_input_mb?: number;
  // Content quality constraints (Spec 038)
  content_quality?: SkillContentQuality;
  contentQuality?: SkillContentQuality;
}

export interface SkillDetectionResult {
  detected: boolean;
  skill: SkillDefinition | null;
  confidence: number;
  matchedTrigger: string | null;
  suggestedPrompt: string | null;
  /** chainTo target from the matched trigger pattern (per-pattern configuration) */
  patternChainTo?: string | null;
}

export interface SkillSettings {
  autoDetect: boolean;
  enabledSkills: string[];
  detectionMode: "ask" | "auto" | "explicit";
}

/**
 * Minimal agency definition for trigger detection.
 * Not the full agency config -- just enough for matching.
 */
export interface AgencyTriggerDefinition {
  /** Agency ID (UUID) */
  agencyId: string;
  /** Agency display name */
  name: string;
  /** Agency description */
  description: string;
  /** Trigger rules (same format as skill triggers) */
  triggers: TriggerRule[];
  /** Priority for detection ordering */
  priority: number;
}

/**
 * Result of agency trigger detection.
 */
export interface AgencyDetectionResult {
  detected: boolean;
  agency: AgencyTriggerDefinition | null;
  confidence: number;
  matchedTrigger: string | null;
  suggestedPrompt: string | null;
}
