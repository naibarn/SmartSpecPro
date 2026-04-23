import type { SkillDefinition } from "@smartspec/skills";
import { ZodError } from "zod";
import type { AgentCapabilityManifest, AgentRuntimeMode } from "../../shared/agentRuntime/types";
import type {
  SkillCapabilityManifest,
  SkillCapabilityRiskTier,
} from "../../shared/agentRuntime/skillManifest";
import {
  SkillCapabilityManifestSchema,
  toAgentCapabilityManifest,
} from "../../shared/agentRuntime/skillManifest";
import type {
  AgentRuntimeEntryPoint,
  AgentRuntimeOriginSurface,
  AgentRuntimeSurface,
} from "../../shared/agentRuntime/types";
import { getSkillRegistryAsync } from "./skillRegistry";

const RISK_TIER_ORDER: Record<SkillCapabilityRiskTier, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

type SkillCapabilityManifestSeed = Omit<
  SkillCapabilityManifest,
  "skillSlug" | "skillName"
>;

export type SkillCapabilityDiagnosticCode =
  | "manifest_missing"
  | "manifest_incomplete"
  | "approval_required"
  | "risk_tier_blocked"
  | "unsupported_surface"
  | "unsupported_origin_surface"
  | "unsupported_entry_point";

export interface SkillCapabilityDiagnostic {
  code: SkillCapabilityDiagnosticCode;
  severity: "error" | "warning";
  skillSlug: string;
  message: string;
  details?: string[];
}

export interface LoadedSkillCapabilityManifest {
  skillSlug: string;
  skillName: string;
  manifest: SkillCapabilityManifest;
  agentManifest: AgentCapabilityManifest;
  skillDefinition: SkillDefinition;
}

export interface LoadSkillCapabilityManifestsInput {
  surface?: AgentRuntimeSurface;
  originSurface?: AgentRuntimeOriginSurface | null;
  entryPoint?: AgentRuntimeEntryPoint | null;
  skillSlugs?: string[];
  maxRiskTier?: SkillCapabilityRiskTier | null;
  approvalGranted?: boolean;
  skillDefinitions?: SkillDefinition[];
  manifestOverrides?: Record<string, Partial<SkillCapabilityManifest> | null>;
}

export interface LoadSkillCapabilityManifestsResult {
  candidates: LoadedSkillCapabilityManifest[];
  diagnostics: SkillCapabilityDiagnostic[];
}

export interface SkillCapabilitySelectionInput
  extends LoadSkillCapabilityManifestsInput {
  taskType: string;
  availableContext?: string[];
  availableEvidenceKinds?: string[];
  selectionSignals?: string[];
  negativeSignals?: string[];
  avoidConditions?: string[];
}

export interface RejectedSkillCapabilityCandidate {
  skillSlug: string;
  score: number;
  reasons: string[];
}

export interface RankedSkillCapabilityCandidate {
  skillSlug: string;
  score: number;
  matchedTaskTypes: string[];
  matchedSignals: string[];
  missingEvidenceKinds: string[];
}

export interface SkillCapabilitySelectionResult {
  selected: LoadedSkillCapabilityManifest | null;
  rankedCandidates: RankedSkillCapabilityCandidate[];
  rejectedAlternatives: RejectedSkillCapabilityCandidate[];
  diagnostics: SkillCapabilityDiagnostic[];
}

export interface SkillCapabilityActivationGateResult {
  allowed: boolean;
  candidates: LoadedSkillCapabilityManifest[];
  diagnostics: SkillCapabilityDiagnostic[];
}

interface InitialCoverageExpectation {
  coverageKey: string;
  acceptedSkillSlugs: string[];
}

export interface SkillCapabilityCoverageResult {
  covered: Array<{ coverageKey: string; skillSlug: string }>;
  diagnostics: SkillCapabilityDiagnostic[];
}

const COMMON_ALLOWED_MODEL_FAMILIES = [
  "general_reasoning",
  "grounded_reasoning",
  "structured_output",
] as const;

const PROMPT_ALLOWED_MODEL_FAMILIES = [
  "creative_reasoning",
  "multimodal_prompting",
  "prompt_refinement",
] as const;

export const RUNTIME_SKILL_MANIFEST_SEEDS: Record<
  string,
  SkillCapabilityManifestSeed
> = {
  brainstorm: {
    manifestSchemaVersion: 1,
    purpose:
      "Break a request into plan options, tradeoffs, and next-step structure before execution begins.",
    surfaceSupport: ["chat", "team"],
    supportedOriginSurfaces: [],
    supportedEntryPoints: [],
    taskTypes: ["planning_decomposition", "plan_brief", "ideation"],
    requiredContext: ["objective_brief"],
    preferredContext: ["constraints", "persona_roster", "existing_plan"],
    inputs: {
      request: "text",
      constraints: "optional string[]",
    },
    outputs: {
      planDraft: "markdown_or_json",
      openQuestions: "string[]",
    },
    supportedArtifactTypes: ["plan_brief", "plan_outline"],
    evidenceRequired: ["objective", "constraints"],
    reviewChecklist: [
      "Plan covers the user objective end to end.",
      "Every step has a clear success condition.",
    ],
    failureModes: [
      "generic_plan_without_deliverables",
      "missing_owner_or_reviewer_handoff",
    ],
    doNotUseWhen: ["finalized_plan_already_locked", "direct_media_job_submission"],
    requiredConnectors: [],
    writeScope: [],
    sideEffectClass: "read_only",
    dataSensitivity: "internal",
    executionMode: "llm_only",
    isReadOnly: true,
    riskTier: "low",
    latencyBudget: "interactive",
    tokenBudget: "medium",
    defaultToolBudget: 1,
    humanApprovalRequired: false,
    allowedModelFamilies: [...COMMON_ALLOWED_MODEL_FAMILIES],
    completionSignals: ["plan_steps_defined", "tradeoffs_recorded"],
    selectionSignals: ["plan", "decompose", "strategy", "workflow"],
    negativeSignals: ["final_copy_only", "direct_generation_required"],
    requiredEvidenceKinds: ["objective"],
    reviewerProfile: "orchestrator_or_lead_reviewer",
    repairStrategy:
      "Clarify missing deliverables, missing owners, or missing quality gates before execution.",
    supportsRepairLoop: true,
    ownerTeam: "platform-orchestration",
    ownerCodeownersPath: "apps/web/server/services/runEngine.ts",
    ownerReviewCadence: "monthly",
  },
  "general-article-writer": {
    manifestSchemaVersion: 1,
    purpose:
      "Produce general-purpose grounded writing when the requested deliverable is narrative or explanatory text.",
    surfaceSupport: ["chat", "team"],
    supportedOriginSurfaces: [],
    supportedEntryPoints: [],
    taskTypes: ["research_summary", "writing_copy", "article_brief"],
    requiredContext: ["objective_brief"],
    preferredContext: ["retrieved_sources", "style_guidance", "audience_brief"],
    inputs: {
      topic: "text",
      language: "text",
      sourceNotes: "optional string[]",
    },
    outputs: {
      articleDraft: "markdown",
    },
    supportedArtifactTypes: ["article_draft", "research_summary"],
    evidenceRequired: ["objective", "sources"],
    reviewChecklist: [
      "Writing matches the requested language and audience.",
      "Claims remain grounded in the supplied evidence.",
    ],
    failureModes: [
      "hallucinated_claims",
      "too_generic_for_requested_deliverable",
    ],
    doNotUseWhen: [
      "storyboard_required",
      "video_prompt_required",
      "structured_json_required",
    ],
    requiredConnectors: [],
    writeScope: [],
    sideEffectClass: "read_only",
    dataSensitivity: "internal",
    executionMode: "llm_only",
    isReadOnly: true,
    riskTier: "low",
    latencyBudget: "interactive",
    tokenBudget: "large",
    defaultToolBudget: 2,
    humanApprovalRequired: false,
    allowedModelFamilies: [...COMMON_ALLOWED_MODEL_FAMILIES],
    completionSignals: ["grounded_draft_ready", "citations_or_source_notes_present"],
    selectionSignals: ["article", "write", "summary", "presentation_copy"],
    negativeSignals: ["scene_by_scene", "prompt_package", "code_fix"],
    requiredEvidenceKinds: ["objective", "source_note"],
    reviewerProfile: "editorial_reviewer",
    repairStrategy:
      "Request missing sources, tighten the structure, and separate facts from assumptions.",
    supportsRepairLoop: true,
    ownerTeam: "content-platform",
    ownerCodeownersPath: "apps/web/skills/general-article-writer/skill.md",
    ownerReviewCadence: "monthly",
  },
  "documentary-script-writer": {
    manifestSchemaVersion: 1,
    purpose:
      "Convert grounded research into documentary-style narration or scripted story beats.",
    surfaceSupport: ["chat", "team"],
    supportedOriginSurfaces: [],
    supportedEntryPoints: [],
    taskTypes: ["research_summary", "script_outline", "voiceover_script"],
    requiredContext: ["objective_brief", "retrieved_sources"],
    preferredContext: ["cultural_notes", "fact_sheet", "scene_constraints"],
    inputs: {
      topic: "text",
      evidencePack: "string[]",
    },
    outputs: {
      documentaryScript: "markdown",
    },
    supportedArtifactTypes: ["script_outline", "voiceover_script"],
    evidenceRequired: ["sources", "fact_sheet"],
    reviewChecklist: [
      "Narrative arc stays grounded in supplied evidence.",
      "Voiceover timing remains practical for the requested length.",
    ],
    failureModes: ["ungrounded_narrative", "timing_not_viable"],
    doNotUseWhen: ["visual_prompt_only", "json_schema_required"],
    requiredConnectors: [],
    writeScope: [],
    sideEffectClass: "read_only",
    dataSensitivity: "internal",
    executionMode: "llm_only",
    isReadOnly: true,
    riskTier: "medium",
    latencyBudget: "extended",
    tokenBudget: "large",
    defaultToolBudget: 3,
    humanApprovalRequired: false,
    allowedModelFamilies: [...COMMON_ALLOWED_MODEL_FAMILIES],
    completionSignals: ["script_outline_ready", "facts_cross_checked"],
    selectionSignals: ["documentary", "research", "narration", "history"],
    negativeSignals: ["visual_only", "prompt_only"],
    requiredEvidenceKinds: ["source_note", "fact_sheet"],
    reviewerProfile: "content_director",
    repairStrategy:
      "Add missing sources, simplify the narrative arc, and tighten spoken timing before handoff.",
    supportsRepairLoop: true,
    ownerTeam: "content-platform",
    ownerCodeownersPath: "apps/web/skills/documentary-script-writer/skill.md",
    ownerReviewCadence: "monthly",
  },
  "storyboard-writer": {
    manifestSchemaVersion: 1,
    purpose:
      "Produce scene-by-scene storyboard structure with clear action, shot, and pacing notes.",
    surfaceSupport: ["chat", "team"],
    supportedOriginSurfaces: [],
    supportedEntryPoints: [],
    taskTypes: ["storyboard_script", "scene_breakdown", "shot_list"],
    requiredContext: ["objective_brief"],
    preferredContext: ["script_outline", "style_guidance", "reference_notes"],
    inputs: {
      storyGoal: "text",
      pacingNotes: "optional string[]",
    },
    outputs: {
      storyboard: "markdown",
      shotList: "string[]",
    },
    supportedArtifactTypes: ["storyboard", "shot_list"],
    evidenceRequired: ["objective", "story_constraints"],
    reviewChecklist: [
      "Scene progression matches the objective and requested duration.",
      "Every scene contains enough visual direction for a downstream prompt step.",
    ],
    failureModes: ["scene_order_confusion", "insufficient_visual_direction"],
    doNotUseWhen: ["research_only", "final_publish_ready"],
    requiredConnectors: [],
    writeScope: [],
    sideEffectClass: "read_only",
    dataSensitivity: "internal",
    executionMode: "llm_only",
    isReadOnly: true,
    riskTier: "low",
    latencyBudget: "interactive",
    tokenBudget: "large",
    defaultToolBudget: 1,
    humanApprovalRequired: false,
    allowedModelFamilies: [...COMMON_ALLOWED_MODEL_FAMILIES],
    completionSignals: ["storyboard_ready", "scene_sequence_locked"],
    selectionSignals: ["storyboard", "scene_by_scene", "visual_narrative"],
    negativeSignals: ["pure_research", "final_publish"],
    requiredEvidenceKinds: ["objective", "reference_note"],
    reviewerProfile: "video_producer",
    repairStrategy:
      "Clarify scene order, tighten pacing, and add missing shot or action details.",
    supportsRepairLoop: true,
    ownerTeam: "media-prompting",
    ownerCodeownersPath: "apps/web/skills/storyboard-writer/skill.md",
    ownerReviewCadence: "monthly",
  },
  "video-storyboard-to-prompts": {
    manifestSchemaVersion: 1,
    purpose:
      "Transform an approved storyboard into per-scene video prompts while preserving continuity constraints.",
    surfaceSupport: ["team", "skill"],
    supportedOriginSurfaces: ["media_studio"],
    supportedEntryPoints: ["execute_custom_skill"],
    taskTypes: [
      "storyboard_to_prompts",
      "video_prompt_generation",
      "shot_prompt_package",
    ],
    requiredContext: ["storyboard"],
    preferredContext: ["reference_notes", "speech_budget", "style_guidance"],
    inputs: {
      storyboard: "markdown",
      references: "optional string[]",
    },
    outputs: {
      promptPackage: "text",
    },
    supportedArtifactTypes: ["prompt_package", "shot_prompt_list"],
    evidenceRequired: ["storyboard"],
    reviewChecklist: [
      "Every prompt can be traced back to an approved storyboard scene.",
      "Continuity notes are preserved across all generated prompts.",
    ],
    failureModes: ["prompt_drift_from_storyboard", "continuity_breaks"],
    doNotUseWhen: ["storyboard_missing", "direct_media_job_submission"],
    requiredConnectors: [],
    writeScope: [],
    sideEffectClass: "read_only",
    dataSensitivity: "internal",
    executionMode: "prompt_only",
    isReadOnly: true,
    riskTier: "medium",
    latencyBudget: "extended",
    tokenBudget: "large",
    defaultToolBudget: 1,
    humanApprovalRequired: false,
    allowedModelFamilies: [...PROMPT_ALLOWED_MODEL_FAMILIES],
    completionSignals: ["prompt_package_ready", "storyboard_links_preserved"],
    selectionSignals: ["storyboard", "shot_prompt", "scene_prompt"],
    negativeSignals: ["direct_media_render", "research_only"],
    requiredEvidenceKinds: ["storyboard"],
    reviewerProfile: "video_producer",
    repairStrategy:
      "Regenerate only the drifting scenes and preserve approved continuity bible notes.",
    supportsRepairLoop: true,
    ownerTeam: "media-prompting",
    ownerCodeownersPath: "apps/web/skills/video-storyboard-to-prompts/skill.md",
    ownerReviewCadence: "monthly",
  },
  "video-prompt-engineer": {
    manifestSchemaVersion: 1,
    purpose:
      "Convert a video concept into a model-ready prompt package tuned for cinematic generation constraints.",
    surfaceSupport: ["chat", "team", "skill"],
    supportedOriginSurfaces: ["media_studio"],
    supportedEntryPoints: ["enhance_prompt", "execute_custom_skill"],
    taskTypes: ["video_prompt_generation", "prompt_refinement", "veo_prompt"],
    requiredContext: ["objective_brief"],
    preferredContext: ["storyboard", "reference_notes", "platform_constraints"],
    inputs: {
      concept: "text",
      references: "optional string[]",
    },
    outputs: {
      prompt: "text",
      promptNotes: "string[]",
    },
    supportedArtifactTypes: ["video_prompt", "prompt_notes"],
    evidenceRequired: ["objective", "reference_note"],
    reviewChecklist: [
      "Prompt stays within platform constraints and preserves the core visual idea.",
      "Platform notes clearly separate visual direction from safety constraints.",
    ],
    failureModes: ["prompt_too_generic", "platform_constraints_ignored"],
    doNotUseWhen: ["direct_media_job_submission", "final_handoff_only"],
    requiredConnectors: [],
    writeScope: [],
    sideEffectClass: "read_only",
    dataSensitivity: "internal",
    executionMode: "prompt_only",
    isReadOnly: true,
    riskTier: "low",
    latencyBudget: "interactive",
    tokenBudget: "medium",
    defaultToolBudget: 1,
    humanApprovalRequired: false,
    allowedModelFamilies: [...PROMPT_ALLOWED_MODEL_FAMILIES],
    completionSignals: ["video_prompt_ready", "platform_constraints_recorded"],
    selectionSignals: ["video_prompt", "veo", "cinematic", "media_studio"],
    negativeSignals: ["submit_generation_job", "needs_long_research_only"],
    requiredEvidenceKinds: ["objective"],
    reviewerProfile: "video_producer",
    repairStrategy:
      "Shorten the prompt, tighten platform notes, and align the visuals with approved storyboard facts.",
    supportsRepairLoop: true,
    ownerTeam: "media-prompting",
    ownerCodeownersPath: "apps/web/skills/video-prompt-engineer/skill.md",
    ownerReviewCadence: "monthly",
  },
  "cinematic-video-createprompt": {
    manifestSchemaVersion: 1,
    purpose:
      "Refine rough cinematic ideas into directorial prompt prose for video generation without submitting jobs.",
    surfaceSupport: ["chat", "skill"],
    supportedOriginSurfaces: ["media_studio"],
    supportedEntryPoints: ["enhance_prompt", "execute_custom_skill"],
    taskTypes: ["video_prompt_generation", "creative_prompt_refinement"],
    requiredContext: ["objective_brief"],
    preferredContext: ["style_guidance", "reference_notes"],
    inputs: {
      topic: "text",
    },
    outputs: {
      prompt: "text",
    },
    supportedArtifactTypes: ["video_prompt"],
    evidenceRequired: ["objective"],
    reviewChecklist: [
      "The prompt reads like a usable creative brief, not a raw keyword list.",
      "The prompt does not promise downstream media execution.",
    ],
    failureModes: ["overwritten_creative_intent", "downstream_execution_assumed"],
    doNotUseWhen: ["direct_media_job_submission", "structured_json_required"],
    requiredConnectors: [],
    writeScope: [],
    sideEffectClass: "read_only",
    dataSensitivity: "internal",
    executionMode: "prompt_only",
    isReadOnly: true,
    riskTier: "low",
    latencyBudget: "interactive",
    tokenBudget: "medium",
    defaultToolBudget: 1,
    humanApprovalRequired: false,
    allowedModelFamilies: [...PROMPT_ALLOWED_MODEL_FAMILIES],
    completionSignals: ["creative_prompt_ready"],
    selectionSignals: ["cinematic", "creative_video_prompt", "director_brief"],
    negativeSignals: ["structured_json_required", "job_submission"],
    requiredEvidenceKinds: ["objective"],
    reviewerProfile: "creative_director",
    repairStrategy:
      "Restore the user's creative intent and remove any provider-specific overreach.",
    supportsRepairLoop: true,
    ownerTeam: "media-prompting",
    ownerCodeownersPath: "apps/web/skills/cinematic-video-createprompt/skill.md",
    ownerReviewCadence: "monthly",
  },
  image_prompt_engineer: {
    manifestSchemaVersion: 1,
    purpose:
      "Turn image requests into explicit prompt packages with reference handling and editing constraints.",
    surfaceSupport: ["chat", "skill"],
    supportedOriginSurfaces: ["media_studio"],
    supportedEntryPoints: ["enhance_prompt", "execute_custom_skill"],
    taskTypes: ["image_prompt_generation", "prompt_refinement", "reference_guided_prompt"],
    requiredContext: ["objective_brief"],
    preferredContext: ["reference_images", "style_guidance", "edit_constraints"],
    inputs: {
      request: "text",
      referenceImages: "optional string[]",
    },
    outputs: {
      prompt: "text",
      promptControls: "record",
    },
    supportedArtifactTypes: ["image_prompt", "prompt_controls"],
    evidenceRequired: ["objective"],
    reviewChecklist: [
      "Reference-image guidance is preserved when present.",
      "The prompt clearly separates editing constraints from creative direction.",
    ],
    failureModes: ["hallucinated_reference_details", "edit_scope_not_respected"],
    doNotUseWhen: ["direct_media_job_submission", "final_publish_only"],
    requiredConnectors: [],
    writeScope: [],
    sideEffectClass: "read_only",
    dataSensitivity: "internal",
    executionMode: "prompt_only",
    isReadOnly: true,
    riskTier: "low",
    latencyBudget: "interactive",
    tokenBudget: "medium",
    defaultToolBudget: 1,
    humanApprovalRequired: false,
    allowedModelFamilies: [...PROMPT_ALLOWED_MODEL_FAMILIES],
    completionSignals: ["image_prompt_ready", "reference_constraints_preserved"],
    selectionSignals: ["image_prompt", "reference_image", "media_studio", "edit_prompt"],
    negativeSignals: ["submit_generation_job", "longform_article"],
    requiredEvidenceKinds: ["objective"],
    reviewerProfile: "image_prompt_reviewer",
    repairStrategy:
      "Regenerate the prompt with tighter reference locking and explicit edit scope boundaries.",
    supportsRepairLoop: true,
    ownerTeam: "media-prompting",
    ownerCodeownersPath: "apps/web/skills/image_prompt_engineer/skill.md",
    ownerReviewCadence: "monthly",
  },
  "editorial-layout-planner": {
    manifestSchemaVersion: 1,
    purpose:
      "Produce schema-backed structured layout plans and manifests for downstream rendering workflows.",
    surfaceSupport: ["responses", "skill"],
    supportedOriginSurfaces: ["media_studio"],
    supportedEntryPoints: ["responses_call", "execute_custom_skill"],
    taskTypes: ["structured_layout_plan", "schema_enforced_output", "render_manifest"],
    requiredContext: ["article_draft"],
    preferredContext: ["layout_constraints", "asset_inventory"],
    inputs: {
      article: "text",
      assets: "optional string[]",
    },
    outputs: {
      renderManifest: "json",
      layoutPlan: "json",
    },
    supportedArtifactTypes: ["render_manifest", "layout_plan"],
    evidenceRequired: ["article_draft", "layout_constraints"],
    reviewChecklist: [
      "Structured output validates against the declared schema.",
      "The manifest remains render-safe and free of empty placeholder sections.",
    ],
    failureModes: ["schema_drift", "render_unsafe_layout"],
    doNotUseWhen: ["freeform_article_only", "direct_media_job_submission"],
    requiredConnectors: [],
    writeScope: [],
    sideEffectClass: "read_only",
    dataSensitivity: "internal",
    executionMode: "structured_output",
    isReadOnly: true,
    riskTier: "medium",
    latencyBudget: "extended",
    tokenBudget: "large",
    defaultToolBudget: 1,
    humanApprovalRequired: false,
    allowedModelFamilies: ["structured_output", "layout_reasoning"],
    completionSignals: ["schema_valid_output", "render_manifest_ready"],
    selectionSignals: ["structured_output", "layout_plan", "render_manifest"],
    negativeSignals: ["freeform_prose_only", "submit_render_job"],
    requiredEvidenceKinds: ["article_draft"],
    reviewerProfile: "layout_reviewer",
    repairStrategy:
      "Regenerate only the invalid schema sections and keep the validated manifest fragments intact.",
    supportsRepairLoop: true,
    ownerTeam: "presentations-platform",
    ownerCodeownersPath: "apps/web/skills/editorial-layout-planner/skill.md",
    ownerReviewCadence: "monthly",
  },
  "workflow-ai-editor": {
    manifestSchemaVersion: 1,
    purpose:
      "Review and repair workflow graphs while producing a fully structured replacement payload.",
    surfaceSupport: ["responses", "skill"],
    supportedOriginSurfaces: ["workflow"],
    supportedEntryPoints: ["responses_call", "execute_custom_skill"],
    taskTypes: ["review_qa", "workflow_repair", "structured_patch"],
    requiredContext: ["workflow_graph", "validation_errors"],
    preferredContext: ["warning_list", "user_fix_request"],
    inputs: {
      workflow: "json",
      validationErrors: "string[]",
    },
    outputs: {
      workflow: "json",
      fixesApplied: "string[]",
    },
    supportedArtifactTypes: ["workflow_json", "repair_report"],
    evidenceRequired: ["workflow_graph", "validation_errors"],
    reviewChecklist: [
      "All blocking validation errors are addressed.",
      "Working portions of the workflow remain intact.",
    ],
    failureModes: ["invalid_patch", "regression_on_existing_nodes"],
    doNotUseWhen: ["no_workflow_payload", "read_only_brainstorm_only"],
    requiredConnectors: [],
    writeScope: ["workflow_graph"],
    sideEffectClass: "sandbox_write",
    dataSensitivity: "sensitive",
    executionMode: "automation_write",
    isReadOnly: false,
    riskTier: "high",
    latencyBudget: "extended",
    tokenBudget: "large",
    defaultToolBudget: 3,
    humanApprovalRequired: true,
    allowedModelFamilies: ["structured_output", "workflow_reasoning"],
    completionSignals: ["workflow_patch_ready", "validation_errors_addressed"],
    selectionSignals: ["workflow_fix", "repair", "structured_patch"],
    negativeSignals: ["final_publish_only", "simple_translation"],
    requiredEvidenceKinds: ["workflow_graph", "validation_errors"],
    reviewerProfile: "workflow_reviewer",
    repairStrategy:
      "Request approval, then regenerate only the invalid nodes and edges while preserving stable ids.",
    supportsRepairLoop: true,
    ownerTeam: "workflow-platform",
    ownerCodeownersPath: "apps/web/skills/workflow-ai-editor/skill.md",
    ownerReviewCadence: "monthly",
  },
  "help-content-writer": {
    manifestSchemaVersion: 1,
    purpose:
      "Package final help or handoff content into a user-facing deliverable when the task is documentation-first.",
    surfaceSupport: ["chat", "team"],
    supportedOriginSurfaces: [],
    supportedEntryPoints: [],
    taskTypes: ["final_handoff_publishing", "documentation_publish", "handoff_summary"],
    requiredContext: ["objective_brief"],
    preferredContext: ["approved_artifacts", "audience_brief", "style_guidance"],
    inputs: {
      brief: "text",
      approvedArtifacts: "optional string[]",
    },
    outputs: {
      helpDocument: "markdown",
      publicationNotes: "string[]",
    },
    supportedArtifactTypes: ["handoff_package", "help_document"],
    evidenceRequired: ["objective"],
    reviewChecklist: [
      "The handoff package references only approved artifacts.",
      "Operator-facing next steps are explicit and concise.",
    ],
    failureModes: ["missing_approved_artifact_refs", "unclear_handoff_instructions"],
    doNotUseWhen: ["storyboard_required", "workflow_patch_required"],
    requiredConnectors: [],
    writeScope: [],
    sideEffectClass: "read_only",
    dataSensitivity: "internal",
    executionMode: "llm_only",
    isReadOnly: true,
    riskTier: "low",
    latencyBudget: "interactive",
    tokenBudget: "medium",
    defaultToolBudget: 1,
    humanApprovalRequired: false,
    allowedModelFamilies: [...COMMON_ALLOWED_MODEL_FAMILIES],
    completionSignals: ["handoff_package_ready", "approved_artifacts_referenced"],
    selectionSignals: ["handoff", "publish", "final_package", "documentation"],
    negativeSignals: ["needs_visual_prompting", "workflow_fix"],
    requiredEvidenceKinds: ["objective"],
    reviewerProfile: "publishing_reviewer",
    repairStrategy:
      "Restore missing artifact references and make next-step instructions explicit for the operator.",
    supportsRepairLoop: true,
    ownerTeam: "knowledge-platform",
    ownerCodeownersPath: "apps/web/skills/help-content-writer/skill.md",
    ownerReviewCadence: "monthly",
  },
};

export const INITIAL_SKILL_CAPABILITY_EXPECTATIONS: InitialCoverageExpectation[] = [
  {
    coverageKey: "planning_decomposition",
    acceptedSkillSlugs: ["brainstorm"],
  },
  {
    coverageKey: "research_and_writing",
    acceptedSkillSlugs: ["general-article-writer", "documentary-script-writer"],
  },
  {
    coverageKey: "storyboard_and_script",
    acceptedSkillSlugs: ["storyboard-writer", "video-storyboard-to-prompts"],
  },
  {
    coverageKey: "video_prompt_generation",
    acceptedSkillSlugs: ["video-prompt-engineer", "cinematic-video-createprompt"],
  },
  {
    coverageKey: "image_prompt_generation",
    acceptedSkillSlugs: ["image_prompt_engineer"],
  },
  {
    coverageKey: "review_qa",
    acceptedSkillSlugs: ["workflow-ai-editor"],
  },
  {
    coverageKey: "final_handoff_publishing",
    acceptedSkillSlugs: ["help-content-writer"],
  },
  {
    coverageKey: "structured_output",
    acceptedSkillSlugs: ["editorial-layout-planner"],
  },
];

function includesValue(values: readonly string[], candidate: string | null | undefined): boolean {
  return typeof candidate === "string" && values.includes(candidate);
}

function normalizeSkillSlugs(skillSlugs?: string[]): Set<string> | null {
  if (!skillSlugs || skillSlugs.length === 0) {
    return null;
  }
  return new Set(skillSlugs);
}

function getManifestSeed(
  skillSlug: string,
  manifestOverrides?: Record<string, Partial<SkillCapabilityManifest> | null>
): Partial<SkillCapabilityManifest> | null {
  if (manifestOverrides && Object.prototype.hasOwnProperty.call(manifestOverrides, skillSlug)) {
    return manifestOverrides[skillSlug] ?? null;
  }

  return RUNTIME_SKILL_MANIFEST_SEEDS[skillSlug] ?? null;
}

function buildDiagnostic(
  skillSlug: string,
  code: SkillCapabilityDiagnosticCode,
  severity: SkillCapabilityDiagnostic["severity"],
  message: string,
  details?: string[]
): SkillCapabilityDiagnostic {
  return {
    skillSlug,
    code,
    severity,
    message,
    details,
  };
}

function buildManifestFromSkill(
  skill: SkillDefinition,
  manifestOverrides?: Record<string, Partial<SkillCapabilityManifest> | null>
): SkillCapabilityManifest {
  const rawSeed = getManifestSeed(skill.id, manifestOverrides);
  if (!rawSeed) {
    throw new Error("manifest_missing");
  }

  return SkillCapabilityManifestSchema.parse({
    ...rawSeed,
    skillSlug: skill.id,
    skillName: skill.name,
  });
}

function exceedsRiskTier(
  manifest: SkillCapabilityManifest,
  maxRiskTier?: SkillCapabilityRiskTier | null
): boolean {
  if (!maxRiskTier) {
    return false;
  }

  return RISK_TIER_ORDER[manifest.riskTier] > RISK_TIER_ORDER[maxRiskTier];
}

function supportsCaller(
  manifest: SkillCapabilityManifest,
  surface?: AgentRuntimeSurface,
  originSurface?: AgentRuntimeOriginSurface | null,
  entryPoint?: AgentRuntimeEntryPoint | null
): SkillCapabilityDiagnosticCode | null {
  if (surface && !manifest.surfaceSupport.includes(surface)) {
    return "unsupported_surface";
  }

  if (
    originSurface &&
    manifest.supportedOriginSurfaces.length > 0 &&
    !manifest.supportedOriginSurfaces.includes(originSurface)
  ) {
    return "unsupported_origin_surface";
  }

  if (
    entryPoint &&
    manifest.supportedEntryPoints.length > 0 &&
    !manifest.supportedEntryPoints.includes(entryPoint)
  ) {
    return "unsupported_entry_point";
  }

  return null;
}

async function resolveSkillDefinitions(
  skillDefinitions?: SkillDefinition[]
): Promise<SkillDefinition[]> {
  if (skillDefinitions) {
    return skillDefinitions;
  }

  return getSkillRegistryAsync();
}

export async function loadSkillCapabilityManifests(
  input: LoadSkillCapabilityManifestsInput = {}
): Promise<LoadSkillCapabilityManifestsResult> {
  const registry = await resolveSkillDefinitions(input.skillDefinitions);
  const slugFilter = normalizeSkillSlugs(input.skillSlugs);
  const candidates: LoadedSkillCapabilityManifest[] = [];
  const diagnostics: SkillCapabilityDiagnostic[] = [];

  for (const skill of registry) {
    const trackedBySeed =
      Object.prototype.hasOwnProperty.call(RUNTIME_SKILL_MANIFEST_SEEDS, skill.id) ||
      Boolean(input.manifestOverrides && Object.prototype.hasOwnProperty.call(input.manifestOverrides, skill.id));
    if (!trackedBySeed && !slugFilter?.has(skill.id)) {
      continue;
    }
    if (slugFilter && !slugFilter.has(skill.id)) {
      continue;
    }

    let manifest: SkillCapabilityManifest;
    try {
      manifest = buildManifestFromSkill(skill, input.manifestOverrides);
    } catch (error) {
      if (error instanceof ZodError) {
        diagnostics.push(
          buildDiagnostic(
            skill.id,
            "manifest_incomplete",
            "error",
            "Skill manifest exists but does not satisfy the runtime capability schema.",
            error.issues.map(issue => `${issue.path.join(".") || "root"}: ${issue.message}`)
          )
        );
        continue;
      }

      diagnostics.push(
        buildDiagnostic(
          skill.id,
          "manifest_missing",
          "warning",
          "No runtime capability manifest is registered for this skill."
        )
      );
      continue;
    }

    const supportError = supportsCaller(
      manifest,
      input.surface,
      input.originSurface,
      input.entryPoint
    );
    if (supportError) {
      diagnostics.push(
        buildDiagnostic(
          skill.id,
          supportError,
          "warning",
          `Skill does not support this runtime caller path (${supportError}).`
        )
      );
      continue;
    }

    if (exceedsRiskTier(manifest, input.maxRiskTier)) {
      diagnostics.push(
        buildDiagnostic(
          skill.id,
          "risk_tier_blocked",
          "warning",
          `Skill risk tier ${manifest.riskTier} exceeds the allowed maximum for this caller.`
        )
      );
      continue;
    }

    if (input.approvalGranted === false && manifest.humanApprovalRequired) {
      diagnostics.push(
        buildDiagnostic(
          skill.id,
          "approval_required",
          "warning",
          "Skill requires explicit approval before it can be used in this runtime path."
        )
      );
      continue;
    }

    candidates.push({
      skillSlug: manifest.skillSlug,
      skillName: manifest.skillName,
      manifest,
      agentManifest: toAgentCapabilityManifest(manifest),
      skillDefinition: skill,
    });
  }

  return {
    candidates,
    diagnostics,
  };
}

function evaluateCandidateForSelection(
  candidate: LoadedSkillCapabilityManifest,
  input: SkillCapabilitySelectionInput
): {
  eligible: boolean;
  score: number;
  reasons: string[];
  missingEvidenceKinds: string[];
  matchedTaskTypes: string[];
  matchedSignals: string[];
} {
  const availableContext = new Set(input.availableContext ?? []);
  const availableEvidenceKinds = new Set(input.availableEvidenceKinds ?? []);
  const matchedSignalsInput = new Set(input.selectionSignals ?? []);
  const negativeSignalsInput = new Set(input.negativeSignals ?? []);
  const avoidConditions = new Set(input.avoidConditions ?? []);
  const reasons: string[] = [];
  let score = 0;

  const matchedTaskTypes = candidate.manifest.taskTypes.filter(
    taskType => taskType === input.taskType
  );
  if (matchedTaskTypes.length > 0) {
    score += 100;
    reasons.push(`matched task type ${matchedTaskTypes.join(", ")}`);
  } else {
    score += 5;
    reasons.push("no exact task type match");
  }

  const missingRequiredContext = candidate.manifest.requiredContext.filter(
    contextKey => !availableContext.has(contextKey)
  );
  if (missingRequiredContext.length > 0) {
    return {
      eligible: false,
      score,
      reasons: [
        `missing required context: ${missingRequiredContext.join(", ")}`,
      ],
      missingEvidenceKinds: [],
      matchedTaskTypes,
      matchedSignals: [],
    };
  }

  const blockedConditions = candidate.manifest.doNotUseWhen.filter(
    condition => avoidConditions.has(condition)
  );
  if (blockedConditions.length > 0) {
    return {
      eligible: false,
      score,
      reasons: [`blocked by doNotUseWhen: ${blockedConditions.join(", ")}`],
      missingEvidenceKinds: [],
      matchedTaskTypes,
      matchedSignals: [],
    };
  }

  const matchedSignals = candidate.manifest.selectionSignals.filter(signal =>
    matchedSignalsInput.has(signal)
  );
  score += matchedSignals.length * 12;
  if (matchedSignals.length > 0) {
    reasons.push(`matched signals: ${matchedSignals.join(", ")}`);
  }

  const preferredContextMatches = candidate.manifest.preferredContext.filter(
    contextKey => availableContext.has(contextKey)
  );
  score += preferredContextMatches.length * 4;
  if (preferredContextMatches.length > 0) {
    reasons.push(`preferred context present: ${preferredContextMatches.join(", ")}`);
  }

  const missingEvidenceKinds = candidate.manifest.requiredEvidenceKinds.filter(
    evidenceKind => !availableEvidenceKinds.has(evidenceKind)
  );
  if (missingEvidenceKinds.length === 0) {
    score += Math.max(candidate.manifest.requiredEvidenceKinds.length, 1) * 6;
    reasons.push("required evidence available");
  } else {
    score -= missingEvidenceKinds.length * 8;
    reasons.push(`missing evidence: ${missingEvidenceKinds.join(", ")}`);
  }

  const negativeSignalHits = candidate.manifest.negativeSignals.filter(signal =>
    negativeSignalsInput.has(signal)
  );
  if (negativeSignalHits.length > 0) {
    score -= negativeSignalHits.length * 15;
    reasons.push(`negative signals matched: ${negativeSignalHits.join(", ")}`);
  }

  return {
    eligible: true,
    score,
    reasons,
    missingEvidenceKinds,
    matchedTaskTypes,
    matchedSignals,
  };
}

export async function selectSkillCapabilityCandidate(
  input: SkillCapabilitySelectionInput
): Promise<SkillCapabilitySelectionResult> {
  const loaded = await loadSkillCapabilityManifests(input);
  const rankedCandidates: RankedSkillCapabilityCandidate[] = [];
  const rejectedAlternatives: RejectedSkillCapabilityCandidate[] = [];

  for (const candidate of loaded.candidates) {
    const evaluation = evaluateCandidateForSelection(candidate, input);
    if (!evaluation.eligible) {
      rejectedAlternatives.push({
        skillSlug: candidate.skillSlug,
        score: evaluation.score,
        reasons: evaluation.reasons,
      });
      continue;
    }

    rankedCandidates.push({
      skillSlug: candidate.skillSlug,
      score: evaluation.score,
      matchedTaskTypes: evaluation.matchedTaskTypes,
      matchedSignals: evaluation.matchedSignals,
      missingEvidenceKinds: evaluation.missingEvidenceKinds,
    });
  }

  rankedCandidates.sort((left, right) => right.score - left.score);

  const rankedBySlug = new Map(
    rankedCandidates.map(candidate => [candidate.skillSlug, candidate])
  );

  for (const candidate of loaded.candidates) {
    if (!rankedBySlug.has(candidate.skillSlug)) {
      continue;
    }
    if (candidate.skillSlug === rankedCandidates[0]?.skillSlug) {
      continue;
    }
    rejectedAlternatives.push({
      skillSlug: candidate.skillSlug,
      score: rankedBySlug.get(candidate.skillSlug)?.score ?? 0,
      reasons: ["lower suitability score than the selected skill"],
    });
  }

  const selected = rankedCandidates[0]
    ? loaded.candidates.find(
        candidate => candidate.skillSlug === rankedCandidates[0]?.skillSlug
      ) ?? null
    : null;

  return {
    selected,
    rankedCandidates,
    rejectedAlternatives,
    diagnostics: loaded.diagnostics,
  };
}

export async function evaluateSkillCapabilityActivationGate(input: {
  mode: AgentRuntimeMode;
  surface?: AgentRuntimeSurface;
  originSurface?: AgentRuntimeOriginSurface | null;
  entryPoint?: AgentRuntimeEntryPoint | null;
  skillSlugs: string[];
  approvalGranted?: boolean;
  skillDefinitions?: SkillDefinition[];
  manifestOverrides?: Record<string, Partial<SkillCapabilityManifest> | null>;
}): Promise<SkillCapabilityActivationGateResult> {
  const loaded = await loadSkillCapabilityManifests({
    surface: input.surface,
    originSurface: input.originSurface,
    entryPoint: input.entryPoint,
    skillSlugs: input.skillSlugs,
    approvalGranted: input.approvalGranted,
    skillDefinitions: input.skillDefinitions,
    manifestOverrides: input.manifestOverrides,
  });

  const missingOrInvalid = input.skillSlugs.filter(skillSlug => {
    const present = loaded.candidates.some(candidate => candidate.skillSlug === skillSlug);
    if (present) {
      return false;
    }
    return loaded.diagnostics.some(diagnostic => diagnostic.skillSlug === skillSlug);
  });

  return {
    allowed: input.mode === "shadow" || missingOrInvalid.length === 0,
    candidates: loaded.candidates,
    diagnostics: loaded.diagnostics,
  };
}

export function buildAgentRuntimeCandidateBundle(
  manifests: LoadedSkillCapabilityManifest[]
): AgentCapabilityManifest[] {
  return manifests.map(candidate => candidate.agentManifest);
}

export async function getInitialSkillCapabilityCoverage(
  input: {
    skillDefinitions?: SkillDefinition[];
    manifestOverrides?: Record<string, Partial<SkillCapabilityManifest> | null>;
  } = {}
): Promise<SkillCapabilityCoverageResult> {
  const diagnostics: SkillCapabilityDiagnostic[] = [];
  const covered: Array<{ coverageKey: string; skillSlug: string }> = [];
  const registry = await resolveSkillDefinitions(input.skillDefinitions);

  for (const expectation of INITIAL_SKILL_CAPABILITY_EXPECTATIONS) {
    const gate = await evaluateSkillCapabilityActivationGate({
      mode: "active",
      skillSlugs: expectation.acceptedSkillSlugs,
      skillDefinitions: registry,
      manifestOverrides: input.manifestOverrides,
    });

    const matched = gate.candidates[0];
    if (matched) {
      covered.push({
        coverageKey: expectation.coverageKey,
        skillSlug: matched.skillSlug,
      });
      continue;
    }

    diagnostics.push(
      buildDiagnostic(
        expectation.acceptedSkillSlugs[0] ?? expectation.coverageKey,
        "manifest_missing",
        "error",
        `No active-ready manifest covers the ${expectation.coverageKey} runtime path.`,
        expectation.acceptedSkillSlugs
      )
    );
  }

  return {
    covered,
    diagnostics,
  };
}
