/**
 * Shared types for the Hybrid Skill Orchestrator (Feature 045).
 *
 * These types are used across classifier, extractor, pipeline engine,
 * agent loop, result merger, and frontend components.
 */

/** How complex the user's request is */
export type OrchestrationLevel = "simple" | "compound" | "complex";

/** How multiple skills should be executed */
export type OrchestrationStrategy = "single" | "parallel" | "sequential" | "agent";

/** Per-step error handling in COMPOUND pipelines */
export type ErrorStrategy = "fail-fast" | "continue" | "retry";

/** One skill matched by the intent classifier */
export interface ClassifiedSkill {
  skillId: string;
  confidence: number;
  reason: string;
  extractedParams: Record<string, unknown>;
  missingRequiredParams: string[];
}

/** Output of the intent classifier (Section 3) */
export interface ClassificationResult {
  level: OrchestrationLevel;
  skills: ClassifiedSkill[];
  strategy: OrchestrationStrategy;
  reasoning: string;
}

/** One step in a COMPOUND pipeline (Section 6) */
export interface PipelineStep {
  id: string;
  skillId: string;
  params: Record<string, unknown>;
  dependsOn: string[];
  inputMapping: Record<string, string>;
  errorStrategy: ErrorStrategy;
}

/** One action chosen by the LLM in the COMPLEX agent loop (Section 7) */
export interface AgentAction {
  type: "execute_skill" | "execute_parallel" | "quality_check" | "revise_plan" | "done";
  skillId?: string;
  skills?: Array<{ skillId: string; params: Record<string, unknown> }>;
  params?: Record<string, unknown>;
  reasoning: string;
}

/** One section within a multi-skill orchestration result */
export interface OrchestrationResultSection {
  skillId: string;
  type: "text" | "image" | "video" | "audio" | "error";
  content?: string;
  urls?: string[];
  metadata: { creditsUsed: number; durationMs: number };
}

/** UI-safe projection of a skill's input schema field */
export interface OrchestrationFieldProjection {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  options?: string[];
  required: boolean;
  default?: unknown;
}

/** Data sent to frontend when parameter confirmation is needed */
export interface OrchestrationConfirmationData {
  skillId: string;
  prefilledParams: Record<string, unknown>;
  missingFields: string[];
  schema: OrchestrationFieldProjection[];
}

/** Structured error codes for orchestration failures */
export type OrchestrationErrorCode =
  | "insufficient_credits"
  | "classifier_timeout"
  | "skill_not_found"
  | "pipeline_failed"
  | "agent_budget_exceeded"
  | "agent_timeout"
  | "partial_failure";

/** Unified result returned by the orchestrator */
export interface OrchestrationResult {
  sections: OrchestrationResultSection[];
  summary?: string;
  totalCreditsUsed: number;
  totalDurationMs: number;
  traceId: string;
  orchestrationLevel: OrchestrationLevel;
  classificationLatencyMs: number;
  needsConfirmation?: boolean;
  confirmationData?: OrchestrationConfirmationData;
  error?: {
    code: OrchestrationErrorCode;
    message: string;
    affectedSkills?: string[];
  };
}

/** Output of the parameter extractor (Section 4) */
export interface ParamExtractionResult {
  params: Record<string, unknown>;
  missingRequired: string[];
  confidence: number;
  needsConfirmation: boolean;
}

/** Compact skill info for the LLM classifier catalog */
export interface SkillCatalogEntry {
  id: string;
  name: string;
  category: string;
  description: string;
  inputTypes: string[];
  outputTypes: string[];
  hasInputSchema: boolean;
  requiredFields: string[];
}

/** Parsed metadata from a skill's input.schema.json */
export interface SkillInputSchemaInfo {
  schema: Record<string, unknown>;
  requiredFields: string[];
  fieldsWithDefaults: string[];
  enumFields: string[];
}

/** Max orchestration level setting for tenant configuration */
export type SkillOrchestratorMaxLevel = "disabled" | "simple" | "compound" | "complex";

/** Options passed to the main orchestrateSkill() entry point */
export interface OrchestrateOptions {
  userId: number;
  tenantId: string;
  conversationId?: number;
  skillSettings?: unknown;
  userToken: string;
  budget?: number;
  maxLevel?: OrchestrationLevel;
  fallbackToRegex?: boolean;
}
