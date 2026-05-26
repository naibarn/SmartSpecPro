export type ProductionGateStatus = "pass" | "warning" | "revise" | "human_review" | "block";
export type ProductionOutputSurface = "storyboard_review" | "video_edit";
export type ProductionNodeKind =
  | "goal_brief"
  | "context_summary"
  | "story_strategy"
  | "script_generation"
  | "script_revision"
  | "storyboard_planning"
  | "planning"
  | "script"
  | "shot_breakdown"
  | "prompt_packaging"
  | "character_reference"
  | "product_reference"
  | "scene_reference"
  | "brand_reference"
  | "audio_reference"
  | "source_video_reference"
  | "character_create"
  | "image"
  | "image_generate"
  | "image_edit"
  | "image_upscale_enhance"
  | "video"
  | "video_generate"
  | "image_to_video"
  | "video_to_video"
  | "lip_sync"
  | "tts"
  | "text_to_speech"
  | "music"
  | "music_generate"
  | "sound_effect"
  | "sound_effect_generate"
  | "voice"
  | "voice_change"
  | "speech_to_text"
  | "caption"
  | "caption_subtitle"
  | "voice_isolate_cleanup"
  | "video_shot"
  | "qa"
  | "human_review"
  | "storyboard_review"
  | "video_edit"
  | "handoff"
  | "voice_asset_create"
  | "lip_sync_video"
  | "multi_shot_video"
  | "product_truth_qa"
  | "prompt_qa"
  | "visual_consistency_qa"
  | "audio_qa"
  | "video_qa"
  | "budget_credit_gate"
  | "revision_loop"
  | "continuity_check"
  | "storyboard_review_handoff"
  | "video_edit_handoff"
  | "timeline_assembly"
  | "transition_edit"
  | "final_render"
  | "delivery_variant"
  | "publish_export";
export type ProductionFlowEdgeKind =
  | "dependency"
  | "reference"
  | "handoff"
  | "qa"
  | "uses_asset"
  | "requires_before"
  | "generates_for"
  | "qa_of"
  | "approval_gate"
  | "handoff_to"
  | "fallback_to";
export type ProductionNodeStatus =
  | "draft"
  | "needs_config"
  | "ready"
  | "queued"
  | "reserving_credits"
  | "warning"
  | "blocked"
  | "approved"
  | "running"
  | "completed"
  | "qa_running"
  | "qa_passed"
  | "qa_warning"
  | "needs_revision"
  | "failed"
  | "cancelled"
  | "disabled";
export type ProductionEvidenceStatus = "approved" | "needs_review" | "blocked";
export type ProductionExecutionScope = "node" | "shot" | "batch";
export type ProductionActionAttemptKind = "configure" | "generate" | "qa" | "handoff" | "render_export" | "product_evidence" | "lifecycle";
export type ProductionActionAttemptStatus = "queued" | "reserving_credits" | "running" | "completed" | "failed" | "cancelled" | "skipped";
export type ProductionAccessLevel = "read" | "write" | "approve" | "execute" | "owner";
export type ProductionRunStatus =
  | "goal_draft"
  | "goal_ready"
  | "plan_generating"
  | "plan_ready_for_review"
  | "plan_verifying"
  | "plan_verification_failed"
  | "plan_needs_revision"
  | "plan_approved"
  | "production_bible_ready"
  | "asset_plan_ready"
  | "asset_generation_running"
  | "asset_qa_failed"
  | "asset_qa_passed"
  | "storyboard_ready"
  | "quality_gate_running"
  | "quality_gate_passed"
  | "quality_gate_needs_revision"
  | "human_review_required"
  | "final_provider_selected"
  | "final_preflight_passed"
  | "final_generating"
  | "final_qa_failed"
  | "final_qa_passed"
  | "revision_running"
  | "completed"
  | "cancelled"
  | "failed";

export interface ProductionGoal {
  title?: string;
  summary: string;
  goalType?: string;
  audience?: string;
  platform?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  language?: string;
  brandTruth?: string;
  creativeDirection?: string;
  constraintsText?: string;
  productContext?: Record<string, unknown>;
  characterContext?: Record<string, unknown>;
  voiceAudioStrategy?: Record<string, unknown>;
  visualStyle?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  tabSnapshots?: Record<string, unknown>;
  generationDefaults?: ProductionGenerationDefaults;
  contractVersion?: string;
}

export interface ProductionGenerationDefaults {
  imageModelId?: string;
  videoModelId?: string;
  imageModelSource?: "project_default" | "media_tab" | "system_default";
  videoModelSource?: "project_default" | "media_tab" | "system_default";
}

export interface ProductionReferenceInput {
  id: string;
  kind: "reference_image" | "product_image" | "character_asset" | "audio_asset" | "source_video" | "generated_media" | "marketplace_product";
  title: string;
  url?: string;
  thumbnailUrl?: string;
  assetId?: string;
  outputRefId?: string;
  source: string;
  provenance?: Record<string, unknown>;
  providerPayloadKey?: string;
  referenceUnitWeight?: number;
  zone?: ProductionContextAssetZone;
  role?: string;
  locked?: boolean;
  warnings?: string[];
  approvalState?: ProductionEvidenceStatus;
  sku?: string;
  variantId?: string;
}

export type ProductionContextAssetZone = "cast" | "products" | "scene_mood" | "audio" | "generated" | "targets";

export interface ProductClaimEvidenceMap {
  claimId: string;
  evidenceIds: string[];
  status: ProductionEvidenceStatus;
  riskLevel?: "low" | "medium" | "high";
}

export interface ProductStoryboardAsset {
  id: string;
  productId: string;
  title: string;
  imageUrl?: string;
  sku?: string;
  variantId?: string;
  approvalState?: ProductionEvidenceStatus;
  role?: "hero" | "detail" | "use_case" | "review" | "comparison" | "background" | "packshot" | "label_close_up" | "texture_detail" | "before_after" | "cta_end_card";
  frameStrategy?: "image_reference" | "start_frame" | "stop_frame" | "start_and_stop" | "packshot_insert";
  requiredVisualAccuracy?: "standard" | "high" | "strict";
  reviewNotes?: string[];
  claimEvidence: ProductClaimEvidenceMap[];
  provenance?: Record<string, unknown>;
  productTruth?: Record<string, unknown>;
}

export interface ProductionShotProductUse {
  shotId: string;
  productStoryboardAssetIds: string[];
  claimIds: string[];
  evidenceIds: string[];
  customerJourneyStage?: string;
  frameStrategy?: ProductStoryboardAsset["frameStrategy"];
  requiredVisualAccuracy?: ProductStoryboardAsset["requiredVisualAccuracy"];
  mustShow?: string[];
  mustAvoid?: string[];
  qaStatus?: "pending" | "pass" | "warning" | "blocked";
  warnings?: string[];
}

export interface ProductionProductEvidenceManifest {
  manifestId: string;
  products: ProductStoryboardAsset[];
  requiredClaimIds: string[];
  status: "ready" | "warning" | "blocked";
  warnings: string[];
}

export interface ProductionNodeConfigSnapshot {
  snapshotId: string;
  version: number;
  toolSurface: "production" | "image" | "video" | "audio" | "storyboard_review" | "video_edit";
  adapter: "image" | "video" | "tts" | "preview_only" | "disabled";
  config: Record<string, unknown>;
  configHash: string;
  manuallyEdited?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type ProductionNodeAdapterStatus = "mvp_enabled" | "preview_only" | "deferred";

export interface ProductionNodeCatalogEntry {
  kind: ProductionNodeKind;
  label: string;
  group: "Plan" | "Reference" | "Image" | "Video" | "Audio" | "QA" | "Handoff" | "Delivery";
  mvp: boolean;
  adapterStatus: ProductionNodeAdapterStatus;
  toolSurface?: ProductionNodeConfigSnapshot["toolSurface"];
  adapter?: ProductionNodeConfigSnapshot["adapter"];
  deferredReason?: string;
}

export interface ProductionNodeToolBinding {
  bindingId: string;
  nodeKind: ProductionNodeKind;
  toolSurface: ProductionNodeConfigSnapshot["toolSurface"];
  adapter: ProductionNodeConfigSnapshot["adapter"];
  adapterStatus: ProductionNodeAdapterStatus;
  requiresConfirmation: boolean;
  generationCreditRisk: "none" | "requires_explicit_confirmation";
  supportedInMvp: boolean;
}

export interface ProductionNodeOutputRef {
  outputRefId: string;
  nodeId: string;
  kind: "image" | "video" | "audio" | "caption" | "manifest" | "project";
  url?: string;
  thumbnailUrl?: string;
  storageKey?: string;
  libraryItemId?: string;
  mediaTaskId?: string;
  mediaId?: string;
  providerTaskId?: string;
  configHash?: string;
  generatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ProductionFlowNode {
  id: string;
  kind: ProductionNodeKind;
  title: string;
  status: ProductionNodeStatus;
  shotId?: string;
  toolBindingId?: string;
  toolBinding?: ProductionNodeToolBinding;
  configSnapshot?: ProductionNodeConfigSnapshot;
  referenceInputs?: ProductionReferenceInput[];
  outputRefs?: ProductionNodeOutputRef[];
  readinessIssues?: string[];
  estimatedCredits?: number;
  position?: { x: number; y: number };
  locked?: boolean;
  approvedAt?: string;
  metadata?: Record<string, unknown>;
  collapsed?: boolean;
}

export interface ProductionFlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind?: ProductionFlowEdgeKind;
}

export interface ProductionShot {
  id: string;
  title: string;
  order: number;
  durationSeconds?: number;
  version?: number;
  storyBeat?: string;
  shotType?: "hook" | "problem" | "proof" | "demo" | "transition" | "cta" | "broll" | "interview" | "custom";
  cameraIntent?: string;
  sourceVideoControl?: {
    sourceVideoAssetId?: string;
    mode?: "reference_only" | "first_frame" | "last_frame" | "clip_segment" | "video_to_video";
    startSeconds?: number;
    endSeconds?: number;
  };
  characterAssetIds?: string[];
  customerJourneyStage?: string;
  mustShow?: string[];
  mustAvoid?: string[];
  script?: string;
  visualIntent?: string;
  audioIntent?: string;
  productAssetIds?: string[];
  nodeIds: string[];
  locked?: boolean;
  status?: "draft" | "ready" | "blocked" | "approved" | "completed";
}

export interface ProductionCue {
  id: string;
  shotId: string;
  startSeconds: number;
  endSeconds: number;
  kind: "shot" | "caption" | "audio" | "transition" | "product";
  label: string;
  metadata?: Record<string, unknown>;
}

export interface ProductionActionAttempt {
  attemptId: string;
  kind: ProductionActionAttemptKind;
  scope: ProductionExecutionScope;
  status: ProductionActionAttemptStatus;
  actorUserId?: number;
  creditOwnerUserId?: number;
  nodeIds: string[];
  shotIds: string[];
  idempotencyKey: string;
  expectedSpaceVersion: number;
  creditEstimate: number;
  creditReserved: number;
  creditSpent: number;
  creditRefunded: number;
  mediaTaskIds: string[];
  providerTaskIds: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  cancelledAt?: string;
  errorCode?: string;
  errorMessage?: string;
  retryOfAttemptId?: string;
}

export interface ProductionCollaboratorAccess {
  userId: number;
  level: ProductionAccessLevel;
  canApprove?: boolean;
  canExecute?: boolean;
}

export interface ProductionAccessPolicy {
  ownerUserId?: number;
  collaborators?: ProductionCollaboratorAccess[];
  approvalRequired?: boolean;
  approvedByUserIds?: number[];
}

export interface ProductionAuditEvent {
  eventId: string;
  action: string;
  actorUserId?: number;
  at: string;
  redactedPayload: Record<string, unknown>;
}

export interface ProductionMetricsSnapshot {
  plannerFailures: number;
  verifierBlocks: number;
  saveConflicts: number;
  providerFailures: number;
  creditMismatches: number;
  handoffFailures: number;
  staleOutputRefs: number;
  storageGrowthWarnings: number;
  pendingExecutionAttempts: number;
  reconciledExecutionAttempts: number;
  providerCallbackMisses: number;
  creditReconciliationRuns: number;
  creditAlertCount: number;
  plannerEvents: number;
  verifierEvents: number;
  handoffEvents: number;
  approvalInvalidations: number;
}

export interface ProductionLayerVersions {
  spaceVersion: number;
  briefVersion: number;
  canvasLayoutVersion: number;
  planVersion: number;
  verifierVersion: number;
  approvalVersion: number;
  shotVersions: Record<string, number>;
  nodeVersions: Record<string, number>;
}

export interface ProductionApprovalState {
  status: "not_requested" | "approved" | "invalidated" | "revoked";
  approvalVersion: number;
  approvedAt?: string;
  approvedByUserId?: number;
  invalidatedAt?: string;
  invalidatedByUserId?: number;
  invalidationReason?: string;
  invalidatedChangedFields?: string[];
  sourcePlanVersion?: number;
  sourceVerifierVersion?: number;
}

export interface ProductionConflictPayload {
  schemaVersion: "production_conflict_v1";
  reason:
    | "space_version_stale"
    | "brief_version_stale"
    | "shot_version_stale"
    | "node_version_stale"
    | "node_snapshot_changed"
    | "layout_version_stale"
    | "plan_version_stale"
    | "verifier_version_stale"
    | "approval_version_stale"
    | "downstream_source_version_stale";
  productionRunId: string;
  expected: Record<string, number | string | undefined>;
  current: Record<string, number | string | undefined>;
  changedFields: string[];
  safePreview: {
    status: ProductionRunStatus;
    title?: string;
    updatedAt?: string;
    source?: "space" | "legacy";
    archived?: boolean;
    deleted?: boolean;
    canReloadLatest: boolean;
    canSaveAsNewVersion: boolean;
    canAutoMergeLayout: boolean;
  };
}

export interface ProductionDownstreamResultRecord {
  recordId: string;
  sourceSpaceVersion: number;
  target: ProductionOutputSurface;
  status: "pending" | "imported" | "conflict" | "failed";
  selectedTakeRefs?: ProductionNodeOutputRef[];
  timelineCueUpdates?: ProductionCue[];
  captionUpdates?: ProductionCue[];
  productWarningResolutions?: Array<{
    productAssetId: string;
    claimId?: string;
    status: ProductionEvidenceStatus;
    warning?: string;
  }>;
  manualApprovals?: Array<{
    targetId: string;
    targetKind: "shot" | "node" | "product" | "cue";
    approved: boolean;
    note?: string;
  }>;
  warnings?: string[];
  importedAt?: string;
}

export interface ProductionDownstreamResultImport {
  recordId: string;
  sourceSpaceVersion: number;
  target: ProductionOutputSurface;
  selectedTakeRefs?: ProductionNodeOutputRef[];
  timelineCueUpdates?: ProductionCue[];
  captionUpdates?: ProductionCue[];
  productWarningResolutions?: ProductionDownstreamResultRecord["productWarningResolutions"];
  manualApprovals?: ProductionDownstreamResultRecord["manualApprovals"];
  warnings?: string[];
  allowLockedUpdates?: boolean;
}

export interface ProductionPlanningContextPack {
  packId: string;
  goalHash: string;
  assetCount: number;
  productEvidenceStatus?: ProductionProductEvidenceManifest["status"];
  shotCount: number;
  desiredTargets: ProductionOutputSurface[];
  capabilityIds: string[];
  budgetNotes?: string;
  generationDefaults?: ProductionGenerationDefaults;
  updatedAt?: string;
}

export interface ProductionPlanningSelection {
  skillId: string;
  skillSlug: string;
  skillTitle: string;
  tags: string[];
  modelMode: "auto" | "manual";
  selectedModel?: string;
  compatibility: "compatible" | "warning" | "blocked";
  contextPack?: ProductionPlanningContextPack;
}

export interface ProductionFeatureGateState {
  emergencyKill: boolean;
  productionSpaceUi: boolean;
  reactFlowPreview: boolean;
  videoShotTab: boolean;
  nodeConfigMode: boolean;
  livePlanner: boolean;
  liveVerifier: boolean;
  storyboardReviewHandoff: boolean;
  videoEditHandoff: boolean;
  runOneNode: boolean;
  runOneShot: boolean;
  batchExecution: boolean;
}

export interface ProductionSpace {
  schemaVersion: "1.0.0";
  productionRunId: string;
  version: number;
  status: ProductionRunStatus;
  brief: ProductionGoal;
  shots: ProductionShot[];
  flowNodes: ProductionFlowNode[];
  flowEdges: ProductionFlowEdge[];
  contextAssets: ProductionReferenceInput[];
  productEvidenceManifest?: ProductionProductEvidenceManifest;
  shotProductUsage?: ProductionShotProductUse[];
  layerVersions?: ProductionLayerVersions;
  approvalState?: ProductionApprovalState;
  actionAttempts?: ProductionActionAttempt[];
  auditEvents?: ProductionAuditEvent[];
  metrics?: ProductionMetricsSnapshot;
  planningSelection?: ProductionPlanningSelection;
  generationDefaults?: ProductionGenerationDefaults;
  storyConceptWizard?: Record<string, unknown>;
  downstreamResultRecords?: ProductionDownstreamResultRecord[];
  cues?: ProductionCue[];
  warnings?: string[];
  featureFlags?: Record<string, boolean>;
  accessPolicy?: ProductionAccessPolicy;
  updatedAt?: string;
}

export interface ProductionSpaceValidationIssue {
  code:
    | "missing_space"
    | "missing_brief"
    | "duplicate_node_id"
    | "duplicate_shot_id"
    | "unsupported_node_kind"
    | "production_node_adapter_mvp_enabled"
    | "production_node_adapter_preview_only"
    | "production_node_adapter_deferred"
    | "production_node_adapter_disabled"
    | "production_node_tool_surface_mismatch"
    | "production_node_adapter_mismatch"
    | "production_node_missing_config_snapshot"
    | "duplicate_edge_id"
    | "edge_missing_source"
    | "edge_missing_target"
    | "cycle_detected"
    | "shot_missing_node"
    | "product_evidence_mismatch"
    | "blocked_product_evidence";
  message: string;
  path?: string;
}

export interface ProductionSpaceValidationResult {
  ok: boolean;
  issues: ProductionSpaceValidationIssue[];
  warnings: ProductionSpaceValidationIssue[];
}

export interface ProductionSpaceReadiness {
  status: "ready" | "warning" | "blocked";
  readyNodeIds: string[];
  blockedNodeIds: string[];
  warningNodeIds: string[];
  estimatedCredits: number;
}

const DEFAULT_PRODUCTION_METRICS: ProductionMetricsSnapshot = {
  plannerFailures: 0,
  verifierBlocks: 0,
  saveConflicts: 0,
  providerFailures: 0,
  creditMismatches: 0,
  handoffFailures: 0,
  staleOutputRefs: 0,
  storageGrowthWarnings: 0,
  pendingExecutionAttempts: 0,
  reconciledExecutionAttempts: 0,
  providerCallbackMisses: 0,
  creditReconciliationRuns: 0,
  creditAlertCount: 0,
  plannerEvents: 0,
  verifierEvents: 0,
  handoffEvents: 0,
  approvalInvalidations: 0,
};

export const PRODUCTION_NODE_CATALOG: ProductionNodeCatalogEntry[] = [
  { kind: "goal_brief", label: "Goal Brief", group: "Plan", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "context_summary", label: "Context Summary", group: "Plan", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "story_strategy", label: "Story Strategy", group: "Plan", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "script_generation", label: "Script Generation", group: "Plan", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "script_revision", label: "Script Revision", group: "Plan", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "storyboard_planning", label: "Storyboard Planning", group: "Plan", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "planning", label: "Planning", group: "Plan", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "script", label: "Script", group: "Plan", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "shot_breakdown", label: "Shot Breakdown", group: "Plan", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "prompt_packaging", label: "Prompt Packaging", group: "Plan", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "character_reference", label: "Character Reference", group: "Reference", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "product_reference", label: "Product Reference", group: "Reference", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "scene_reference", label: "Scene Reference", group: "Reference", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "brand_reference", label: "Brand Reference", group: "Reference", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "audio_reference", label: "Audio Reference", group: "Reference", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "source_video_reference", label: "Source Video Reference", group: "Reference", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "character_create", label: "Character Create", group: "Image", mvp: true, adapterStatus: "preview_only", toolSurface: "image", adapter: "preview_only" },
  { kind: "image", label: "Image", group: "Image", mvp: true, adapterStatus: "mvp_enabled", toolSurface: "image", adapter: "image" },
  { kind: "image_generate", label: "Image Generate", group: "Image", mvp: true, adapterStatus: "mvp_enabled", toolSurface: "image", adapter: "image" },
  { kind: "image_edit", label: "Image Edit", group: "Image", mvp: true, adapterStatus: "mvp_enabled", toolSurface: "image", adapter: "image" },
  { kind: "image_upscale_enhance", label: "Image Upscale / Enhance", group: "Image", mvp: true, adapterStatus: "mvp_enabled", toolSurface: "image", adapter: "image" },
  { kind: "video", label: "Video", group: "Video", mvp: true, adapterStatus: "mvp_enabled", toolSurface: "video", adapter: "video" },
  { kind: "video_generate", label: "Video Generate", group: "Video", mvp: true, adapterStatus: "mvp_enabled", toolSurface: "video", adapter: "video" },
  { kind: "image_to_video", label: "Image to Video", group: "Video", mvp: true, adapterStatus: "mvp_enabled", toolSurface: "video", adapter: "video" },
  { kind: "video_to_video", label: "Video to Video", group: "Video", mvp: true, adapterStatus: "mvp_enabled", toolSurface: "video", adapter: "video" },
  { kind: "lip_sync", label: "Lip Sync", group: "Video", mvp: true, adapterStatus: "preview_only", toolSurface: "video", adapter: "preview_only" },
  { kind: "tts", label: "TTS", group: "Audio", mvp: true, adapterStatus: "mvp_enabled", toolSurface: "audio", adapter: "tts" },
  { kind: "text_to_speech", label: "Text to Speech", group: "Audio", mvp: true, adapterStatus: "mvp_enabled", toolSurface: "audio", adapter: "tts" },
  { kind: "video_shot", label: "Video Shot Group", group: "Video", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "qa", label: "QA", group: "QA", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "human_review", label: "Human Review", group: "QA", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "storyboard_review", label: "Storyboard Review", group: "Handoff", mvp: true, adapterStatus: "preview_only", toolSurface: "storyboard_review", adapter: "preview_only" },
  { kind: "video_edit", label: "Video Edit", group: "Handoff", mvp: true, adapterStatus: "preview_only", toolSurface: "video_edit", adapter: "preview_only" },
  { kind: "handoff", label: "Handoff", group: "Handoff", mvp: true, adapterStatus: "preview_only", toolSurface: "production", adapter: "preview_only" },
  { kind: "music", label: "Music", group: "Audio", mvp: false, adapterStatus: "deferred", toolSurface: "audio", adapter: "disabled", deferredReason: "After MVP audio adapter." },
  { kind: "music_generate", label: "Music Generate", group: "Audio", mvp: false, adapterStatus: "deferred", toolSurface: "audio", adapter: "disabled", deferredReason: "After MVP audio adapter." },
  { kind: "sound_effect", label: "Sound Effect", group: "Audio", mvp: false, adapterStatus: "deferred", toolSurface: "audio", adapter: "disabled", deferredReason: "After MVP audio adapter." },
  { kind: "sound_effect_generate", label: "Sound Effect Generate", group: "Audio", mvp: false, adapterStatus: "deferred", toolSurface: "audio", adapter: "disabled", deferredReason: "After MVP audio adapter." },
  { kind: "voice", label: "Voice", group: "Audio", mvp: false, adapterStatus: "deferred", toolSurface: "audio", adapter: "disabled", deferredReason: "After MVP voice adapter." },
  { kind: "voice_change", label: "Voice Change", group: "Audio", mvp: false, adapterStatus: "deferred", toolSurface: "audio", adapter: "disabled", deferredReason: "After MVP voice adapter." },
  { kind: "speech_to_text", label: "Speech to Text", group: "Audio", mvp: false, adapterStatus: "deferred", toolSurface: "audio", adapter: "disabled", deferredReason: "After MVP transcription adapter." },
  { kind: "caption", label: "Caption", group: "Audio", mvp: false, adapterStatus: "deferred", toolSurface: "audio", adapter: "disabled", deferredReason: "Caption editor belongs to a later release gate." },
  { kind: "caption_subtitle", label: "Caption / Subtitle", group: "Audio", mvp: false, adapterStatus: "deferred", toolSurface: "audio", adapter: "disabled", deferredReason: "Caption editor belongs to a later release gate." },
  { kind: "voice_isolate_cleanup", label: "Voice Isolate Cleanup", group: "Audio", mvp: false, adapterStatus: "deferred", toolSurface: "audio", adapter: "disabled", deferredReason: "After MVP cleanup adapter." },
  { kind: "voice_asset_create", label: "Voice Asset Create", group: "Audio", mvp: false, adapterStatus: "deferred", toolSurface: "audio", adapter: "disabled", deferredReason: "After MVP voice asset workflow." },
  { kind: "lip_sync_video", label: "Lip Sync Video", group: "Video", mvp: false, adapterStatus: "deferred", toolSurface: "video", adapter: "disabled", deferredReason: "Full video matrix gate." },
  { kind: "multi_shot_video", label: "Multi-shot Video", group: "Video", mvp: false, adapterStatus: "deferred", toolSurface: "video", adapter: "disabled", deferredReason: "Batch/multi-shot execution gate." },
  { kind: "product_truth_qa", label: "Product Truth QA", group: "QA", mvp: false, adapterStatus: "deferred", toolSurface: "production", adapter: "disabled", deferredReason: "Advanced QA gate." },
  { kind: "prompt_qa", label: "Prompt QA", group: "QA", mvp: false, adapterStatus: "deferred", toolSurface: "production", adapter: "disabled", deferredReason: "Advanced QA gate." },
  { kind: "visual_consistency_qa", label: "Visual Consistency QA", group: "QA", mvp: false, adapterStatus: "deferred", toolSurface: "production", adapter: "disabled", deferredReason: "Continuity/QA release gate." },
  { kind: "audio_qa", label: "Audio QA", group: "QA", mvp: false, adapterStatus: "deferred", toolSurface: "audio", adapter: "disabled", deferredReason: "Advanced audio QA gate." },
  { kind: "video_qa", label: "Video QA", group: "QA", mvp: false, adapterStatus: "deferred", toolSurface: "video", adapter: "disabled", deferredReason: "Advanced video QA gate." },
  { kind: "budget_credit_gate", label: "Budget / Credit Gate", group: "QA", mvp: false, adapterStatus: "deferred", toolSurface: "production", adapter: "disabled", deferredReason: "Advanced execution governance." },
  { kind: "revision_loop", label: "Revision Loop", group: "Plan", mvp: false, adapterStatus: "deferred", toolSurface: "production", adapter: "disabled", deferredReason: "Targeted replanning release gate." },
  { kind: "continuity_check", label: "Continuity Check", group: "QA", mvp: false, adapterStatus: "deferred", toolSurface: "production", adapter: "disabled", deferredReason: "After MVP continuity gate." },
  { kind: "storyboard_review_handoff", label: "Storyboard Review Handoff", group: "Handoff", mvp: false, adapterStatus: "deferred", toolSurface: "storyboard_review", adapter: "disabled", deferredReason: "Live handoff waits for downstream sync-back." },
  { kind: "video_edit_handoff", label: "Video Edit Handoff", group: "Handoff", mvp: false, adapterStatus: "deferred", toolSurface: "video_edit", adapter: "disabled", deferredReason: "Live handoff waits for downstream sync-back." },
  { kind: "timeline_assembly", label: "Timeline Assembly", group: "Delivery", mvp: false, adapterStatus: "deferred", toolSurface: "video_edit", adapter: "disabled", deferredReason: "Video Edit result sync gate." },
  { kind: "transition_edit", label: "Transition Edit", group: "Delivery", mvp: false, adapterStatus: "deferred", toolSurface: "video_edit", adapter: "disabled", deferredReason: "Video Edit result sync gate." },
  { kind: "final_render", label: "Final Render", group: "Delivery", mvp: false, adapterStatus: "deferred", toolSurface: "video_edit", adapter: "disabled", deferredReason: "Final render release gate." },
  { kind: "delivery_variant", label: "Delivery Variant", group: "Delivery", mvp: false, adapterStatus: "deferred", toolSurface: "video_edit", adapter: "disabled", deferredReason: "After MVP delivery variant gate." },
  { kind: "publish_export", label: "Publish / Export", group: "Delivery", mvp: false, adapterStatus: "deferred", toolSurface: "video_edit", adapter: "disabled", deferredReason: "Publishing/export social integrations are explicitly deferred." },
];

export function getProductionNodeCatalogEntry(kind: ProductionNodeKind): ProductionNodeCatalogEntry | undefined {
  return PRODUCTION_NODE_CATALOG.find((entry) => entry.kind === kind);
}

export function isProductionNodeKind(value: unknown): value is ProductionNodeKind {
  return typeof value === "string" && Boolean(getProductionNodeCatalogEntry(value as ProductionNodeKind));
}

export function validateProductionNodeConfigSnapshotAgainstCatalog(
  node: Pick<ProductionFlowNode, "id" | "kind">,
  configSnapshot: ProductionNodeConfigSnapshot,
  options: { allowPreviewOnly?: boolean } = {},
): { ok: true } | { ok: false; reason: string; catalogEntry?: ProductionNodeCatalogEntry } {
  const catalogEntry = getProductionNodeCatalogEntry(node.kind);
  if (!catalogEntry) {
    return { ok: false, reason: "production_node_kind_unsupported" };
  }
  if (catalogEntry.adapterStatus === "preview_only" && options.allowPreviewOnly) {
    if (configSnapshot.adapter !== "preview_only" || configSnapshot.toolSurface !== catalogEntry.toolSurface) {
      return { ok: false, reason: "production_node_adapter_mismatch", catalogEntry };
    }
    return { ok: true };
  }
  if (catalogEntry.adapterStatus !== "mvp_enabled") {
    return { ok: false, reason: `production_node_adapter_${catalogEntry.adapterStatus}`, catalogEntry };
  }
  if (catalogEntry.adapter === "disabled" || configSnapshot.adapter === "disabled") {
    return { ok: false, reason: "production_node_adapter_disabled", catalogEntry };
  }
  if (catalogEntry.toolSurface && catalogEntry.toolSurface !== configSnapshot.toolSurface) {
    return { ok: false, reason: "production_node_tool_surface_mismatch", catalogEntry };
  }
  if (catalogEntry.adapter && catalogEntry.adapter !== configSnapshot.adapter) {
    return { ok: false, reason: "production_node_adapter_mismatch", catalogEntry };
  }
  return { ok: true };
}

export function validateProductionExecutableNodeAgainstCatalog(
  node: ProductionFlowNode,
): { ok: true } | { ok: false; reason: string; catalogEntry?: ProductionNodeCatalogEntry } {
  const catalogEntry = getProductionNodeCatalogEntry(node.kind);
  if (!catalogEntry) {
    return { ok: false, reason: "production_node_kind_unsupported" };
  }
  if (catalogEntry.adapterStatus !== "mvp_enabled") {
    return { ok: false, reason: `production_node_adapter_${catalogEntry.adapterStatus}`, catalogEntry };
  }
  if (!node.configSnapshot) {
    return { ok: false, reason: "production_node_missing_config_snapshot", catalogEntry };
  }
  return validateProductionNodeConfigSnapshotAgainstCatalog(node, node.configSnapshot);
}

export function getDefaultProductionMetrics(): ProductionMetricsSnapshot {
  return { ...DEFAULT_PRODUCTION_METRICS };
}

const MATERIAL_APPROVAL_CHANGE_KINDS = new Set([
  "space",
  "brief",
  "shot",
  "node_config",
  "product_evidence",
  "plan",
  "verification",
  "execution_reconcile",
  "repair_outputs",
  "downstream_import",
]);

export function getProductionLayerVersions(space: ProductionSpace | null | undefined): ProductionLayerVersions {
  const version = Math.max(0, Number(space?.version ?? 0));
  return {
    spaceVersion: Number(space?.layerVersions?.spaceVersion ?? version),
    briefVersion: Number(space?.layerVersions?.briefVersion ?? version),
    canvasLayoutVersion: Number(space?.layerVersions?.canvasLayoutVersion ?? version),
    planVersion: Number(space?.layerVersions?.planVersion ?? version),
    verifierVersion: Number(space?.layerVersions?.verifierVersion ?? version),
    approvalVersion: Number(space?.layerVersions?.approvalVersion ?? space?.approvalState?.approvalVersion ?? version),
    shotVersions: {
      ...Object.fromEntries((space?.shots ?? []).map((shot) => [shot.id, Number(shot.version ?? version)])),
      ...(space?.layerVersions?.shotVersions ?? {}),
    },
    nodeVersions: {
      ...Object.fromEntries((space?.flowNodes ?? []).map((node) => [node.id, Number(node.configSnapshot?.version ?? version)])),
      ...(space?.layerVersions?.nodeVersions ?? {}),
    },
  };
}

export function applyProductionLayerVersionChange(
  previous: ProductionSpace | null | undefined,
  nextVersion: number,
  changeKind = "space",
  changedFields: string[] = [],
): ProductionLayerVersions {
  const layers = getProductionLayerVersions(previous);
  const next: ProductionLayerVersions = {
    ...layers,
    spaceVersion: nextVersion,
    shotVersions: { ...layers.shotVersions },
    nodeVersions: { ...layers.nodeVersions },
  };
  const bump = (key: keyof Omit<ProductionLayerVersions, "shotVersions" | "nodeVersions">) => {
    next[key] = nextVersion;
  };
  if (changeKind === "brief") bump("briefVersion");
  if (changeKind === "layout") bump("canvasLayoutVersion");
  if (changeKind === "plan") bump("planVersion");
  if (changeKind === "verification") bump("verifierVersion");
  if (changeKind === "approval" || changeKind === "approval_invalidation") bump("approvalVersion");
  if (changeKind === "shot" || changedFields.some((field) => field.startsWith("shots."))) {
    for (const field of changedFields) {
      const shotId = field.startsWith("shots.") ? field.split(".")[1] : undefined;
      if (shotId) next.shotVersions[shotId] = nextVersion;
    }
  }
  if (changeKind === "node_config" || changedFields.some((field) => field.startsWith("flowNodes."))) {
    for (const field of changedFields) {
      const nodeId = field.startsWith("flowNodes.") ? field.split(".")[1] : undefined;
      if (nodeId) next.nodeVersions[nodeId] = nextVersion;
    }
  }
  return next;
}

export function doesProductionChangeInvalidateApproval(changeKind = "space", changedFields: string[] = []): boolean {
  if (changeKind === "layout" || changedFields.every((field) => field === "flowNodes.position" || field.endsWith(".position"))) {
    return false;
  }
  return MATERIAL_APPROVAL_CHANGE_KINDS.has(changeKind);
}

export function applyProductionApprovalInvalidation(
  space: ProductionSpace,
  actorUserId: number | undefined,
  changeKind: string | undefined,
  changedFields: string[],
): ProductionApprovalState | undefined {
  const current = space.approvalState;
  if (current?.status !== "approved" || !doesProductionChangeInvalidateApproval(changeKind, changedFields)) return current;
  return {
    ...current,
    status: "invalidated",
    approvalVersion: (current.approvalVersion ?? getProductionLayerVersions(space).approvalVersion) + 1,
    invalidatedAt: new Date().toISOString(),
    invalidatedByUserId: actorUserId,
    invalidationReason: changeKind ?? "space",
    invalidatedChangedFields: changedFields,
  };
}

export function resolveProductionFeatureGates(flags: Record<string, boolean> | null | undefined): ProductionFeatureGateState {
  const emergencyKill = Boolean(flags?.feature116EmergencyKill);
  const enabled = (key: string, fallback = true) => !emergencyKill && (flags?.[key] ?? fallback);
  const runOneNode = enabled("feature116RunOneNode", false);
  const runOneShot = runOneNode && enabled("feature116RunOneShot", false);
  return {
    emergencyKill,
    productionSpaceUi: enabled("feature116ProductionSpaceUi", true),
    reactFlowPreview: enabled("feature116ReactFlowPreview", true),
    videoShotTab: enabled("feature116VideoShotTab", true),
    nodeConfigMode: enabled("feature116NodeConfigMode", true),
    livePlanner: enabled("feature116LivePlanner", false),
    liveVerifier: enabled("feature116LiveVerifier", false),
    storyboardReviewHandoff: enabled("feature116StoryboardReviewHandoff", false),
    videoEditHandoff: enabled("feature116VideoEditHandoff", false),
    runOneNode,
    runOneShot,
    batchExecution: runOneShot && enabled("feature116BatchExecution", false),
  };
}

export function buildProductionActionAttemptId(input: {
  productionRunId: string;
  scope: ProductionExecutionScope;
  targetId?: string;
  attemptNumber: number;
}): string {
  return [
    "prod-attempt",
    input.productionRunId,
    input.scope,
    input.targetId ?? "batch",
    String(input.attemptNumber),
  ].join("-");
}

export interface ProductionHandoffPayload {
  schemaVersion: "1.0.0";
  target: ProductionOutputSurface;
  productionRunId: string;
  sourceSpaceVersion: number;
  idempotencyKey: string;
  orderedShots: Array<{
    shotId: string;
    title: string;
    order: number;
    durationSeconds?: number;
    nodeOutputRefs: ProductionNodeOutputRef[];
  }>;
  cues: ProductionCue[];
  productEvidenceManifest?: ProductionProductEvidenceManifest;
  warnings: string[];
}

export interface ProductionAssetNode {
  id: string;
  kind: string;
  role: string;
  source?: string;
  required?: boolean;
  status: "missing" | "planned" | "ready" | "warning" | "blocked" | "skipped";
  providerCandidates?: string[];
  selectedProvider?: string;
  dependencies?: string[];
  estimatedCredits?: number;
  provenanceIds?: string[];
  qualityIssues?: string[];
}

export interface ProductionAssetPlan {
  assetPlanId: string;
  productionRunId: string;
  nodes: ProductionAssetNode[];
  contractVersion: string;
}

export interface ProductionAssetPlanReadiness {
  status: "ready" | "warning" | "blocked";
  requiredTotal: number;
  requiredReady: number;
  blockingNodeIds: string[];
  warningNodeIds: string[];
  estimatedCredits: number;
}

export interface ProductionQualityGate {
  gateStatus: ProductionGateStatus;
  confidenceScore: number;
  expectedQualityScore: number;
  creditRiskScore: number;
  providerFitScore: number;
  storyAlignmentScore: number;
  productTruthScore: number;
  assetReadinessScore: number;
  blockingIssues: Array<Record<string, unknown>>;
  revisionInstructions: string[];
  reviewerVerdicts: Array<Record<string, unknown>>;
  allowedNextActions: string[];
  attemptCount: number;
  maxAttemptsReached: boolean;
  contractVersion: string;
}

export interface ProductionOutputProjectionKeyInput {
  tenantId: string;
  productionRunId: string;
  surface: ProductionOutputSurface;
  sourceOutput: unknown;
}

const PRODUCTION_TERMINAL_STATES = new Set<ProductionRunStatus>(["completed", "cancelled", "failed"]);

const PRODUCTION_ALLOWED_TRANSITIONS: Record<ProductionRunStatus, ProductionRunStatus[]> = {
  goal_draft: ["goal_ready", "cancelled", "failed"],
  goal_ready: ["plan_generating", "goal_draft", "cancelled", "failed"],
  plan_generating: ["plan_ready_for_review", "plan_verification_failed", "plan_needs_revision", "failed", "cancelled"],
  plan_ready_for_review: ["plan_verifying", "plan_needs_revision", "plan_approved", "cancelled", "failed"],
  plan_verifying: ["plan_ready_for_review", "plan_approved", "plan_needs_revision", "plan_verification_failed", "human_review_required", "failed", "cancelled"],
  plan_verification_failed: ["plan_generating", "plan_needs_revision", "human_review_required", "failed", "cancelled"],
  plan_needs_revision: ["plan_generating", "human_review_required", "cancelled", "failed"],
  plan_approved: ["production_bible_ready", "asset_plan_ready", "quality_gate_running", "cancelled", "failed"],
  production_bible_ready: ["asset_plan_ready", "quality_gate_running", "cancelled", "failed"],
  asset_plan_ready: ["asset_generation_running", "asset_qa_passed", "quality_gate_running", "cancelled", "failed"],
  asset_generation_running: ["asset_qa_passed", "asset_qa_failed", "failed", "cancelled"],
  asset_qa_failed: ["asset_generation_running", "plan_needs_revision", "human_review_required", "failed", "cancelled"],
  asset_qa_passed: ["storyboard_ready", "quality_gate_running", "cancelled", "failed"],
  storyboard_ready: ["quality_gate_running", "plan_needs_revision", "cancelled", "failed"],
  quality_gate_running: ["quality_gate_passed", "quality_gate_needs_revision", "human_review_required", "failed", "cancelled"],
  quality_gate_passed: ["final_provider_selected", "final_preflight_passed", "cancelled", "failed"],
  quality_gate_needs_revision: ["revision_running", "plan_needs_revision", "human_review_required", "failed", "cancelled"],
  human_review_required: ["plan_approved", "revision_running", "cancelled", "failed"],
  final_provider_selected: ["final_preflight_passed", "quality_gate_running", "cancelled", "failed"],
  final_preflight_passed: ["final_generating", "cancelled", "failed"],
  final_generating: ["final_qa_passed", "final_qa_failed", "failed", "cancelled"],
  final_qa_failed: ["revision_running", "human_review_required", "failed", "cancelled"],
  final_qa_passed: ["completed", "revision_running", "cancelled", "failed"],
  revision_running: ["plan_ready_for_review", "quality_gate_running", "final_generating", "failed", "cancelled"],
  completed: [],
  cancelled: [],
  failed: [],
};

export function validateProductionRunTransition(current: ProductionRunStatus, next: ProductionRunStatus): {
  ok: boolean;
  reasonCode?: "production_state_terminal" | "production_state_noop" | "production_state_invalid_transition";
} {
  if (current === next) {
    return { ok: true, reasonCode: "production_state_noop" };
  }
  if (PRODUCTION_TERMINAL_STATES.has(current)) {
    return { ok: false, reasonCode: "production_state_terminal" };
  }
  if (!PRODUCTION_ALLOWED_TRANSITIONS[current]?.includes(next)) {
    return { ok: false, reasonCode: "production_state_invalid_transition" };
  }
  return { ok: true };
}

export function evaluateProductionAssetPlanReadiness(plan: ProductionAssetPlan): ProductionAssetPlanReadiness {
  const requiredNodes = plan.nodes.filter((node) => node.required !== false);
  const blockingNodeIds = requiredNodes
    .filter((node) => node.status !== "ready" && node.status !== "warning")
    .map((node) => node.id);
  const warningNodeIds = plan.nodes
    .filter((node) => node.status === "warning" || (node.qualityIssues?.length ?? 0) > 0)
    .map((node) => node.id);
  const estimatedCredits = plan.nodes.reduce((sum, node) => sum + Math.max(0, Number(node.estimatedCredits ?? 0)), 0);

  return {
    status: blockingNodeIds.length > 0 ? "blocked" : warningNodeIds.length > 0 ? "warning" : "ready",
    requiredTotal: requiredNodes.length,
    requiredReady: requiredNodes.filter((node) => node.status === "ready" || node.status === "warning").length,
    blockingNodeIds,
    warningNodeIds,
    estimatedCredits,
  };
}

export function canSubmitProductionFinalRender(gate: ProductionQualityGate, readiness: ProductionAssetPlanReadiness): boolean {
  if (readiness.status === "blocked") return false;
  if (gate.maxAttemptsReached && gate.gateStatus !== "pass" && gate.gateStatus !== "warning") return false;
  return gate.gateStatus === "pass" || gate.gateStatus === "warning";
}

export function buildProductionOutputProjectionIdentity(input: ProductionOutputProjectionKeyInput): {
  sourceOutputHash: string;
  idempotencyKey: string;
} {
  const stableJson = stableStringify(input.sourceOutput);
  const sourceOutputHash = stableHash(stableJson);
  return {
    sourceOutputHash,
    idempotencyKey: [
      input.tenantId,
      input.productionRunId,
      input.surface,
      sourceOutputHash,
    ].join(":"),
  };
}

export function buildProductionStableHash(value: unknown): string {
  return stableHash(stableStringify(value));
}

export function validateProductionSpace(space: ProductionSpace | null | undefined): ProductionSpaceValidationResult {
  const issues: ProductionSpaceValidationIssue[] = [];
  const warnings: ProductionSpaceValidationIssue[] = [];
  if (!space) {
    return { ok: false, issues: [{ code: "missing_space", message: "ProductionSpace is required." }], warnings };
  }
  if (!String(space.brief?.summary ?? "").trim()) {
    issues.push({ code: "missing_brief", path: "brief.summary", message: "Production brief summary is required." });
  }

  const nodeIds = new Set<string>();
  const duplicateNodeIds = new Set<string>();
  for (const node of space.flowNodes) {
    if (nodeIds.has(node.id)) duplicateNodeIds.add(node.id);
    nodeIds.add(node.id);
    if (!isProductionNodeKind(node.kind)) {
      issues.push({ code: "unsupported_node_kind", path: `flowNodes.${node.id}.kind`, message: `Unsupported production node kind: ${String(node.kind)}` });
    }
    if (node.configSnapshot) {
      const catalogValidation = validateProductionNodeConfigSnapshotAgainstCatalog(node, node.configSnapshot, { allowPreviewOnly: true });
      if (!catalogValidation.ok) {
        issues.push({
          code: catalogValidation.reason as ProductionSpaceValidationIssue["code"],
          path: `flowNodes.${node.id}.configSnapshot`,
          message: `Node ${node.id} config does not match the production node catalog.`,
        });
      }
    }
  }
  for (const id of duplicateNodeIds) {
    issues.push({ code: "duplicate_node_id", path: `flowNodes.${id}`, message: `Duplicate production node id: ${id}` });
  }

  const edgeIds = new Set<string>();
  for (const edge of space.flowEdges) {
    if (edgeIds.has(edge.id)) {
      issues.push({ code: "duplicate_edge_id", path: `flowEdges.${edge.id}`, message: `Duplicate production edge id: ${edge.id}` });
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source)) {
      issues.push({ code: "edge_missing_source", path: `flowEdges.${edge.id}.source`, message: `Edge ${edge.id} references missing source node.` });
    }
    if (!nodeIds.has(edge.target)) {
      issues.push({ code: "edge_missing_target", path: `flowEdges.${edge.id}.target`, message: `Edge ${edge.id} references missing target node.` });
    }
  }

  const shotIds = new Set<string>();
  const duplicateShotIds = new Set<string>();
  for (const shot of space.shots) {
    if (shotIds.has(shot.id)) duplicateShotIds.add(shot.id);
    shotIds.add(shot.id);
    for (const nodeId of shot.nodeIds) {
      if (!nodeIds.has(nodeId)) {
        issues.push({ code: "shot_missing_node", path: `shots.${shot.id}.nodeIds`, message: `Shot ${shot.id} references missing node ${nodeId}.` });
      }
    }
  }
  for (const id of duplicateShotIds) {
    issues.push({ code: "duplicate_shot_id", path: `shots.${id}`, message: `Duplicate production shot id: ${id}` });
  }

  if (hasProductionGraphCycle(space.flowNodes.map((node) => node.id), space.flowEdges)) {
    issues.push({ code: "cycle_detected", path: "flowEdges", message: "Production canvas contains a dependency cycle." });
  }

  const manifest = space.productEvidenceManifest;
  if (manifest) {
    const evidenceIds = new Set(manifest.products.flatMap((product) => product.claimEvidence.flatMap((claim) => claim.evidenceIds)));
    for (const claimId of manifest.requiredClaimIds) {
      const hasClaim = manifest.products.some((product) => product.claimEvidence.some((claim) => claim.claimId === claimId));
      if (!hasClaim || evidenceIds.has(claimId)) {
        issues.push({
          code: "product_evidence_mismatch",
          path: "productEvidenceManifest.requiredClaimIds",
          message: `Product claim ${claimId} is missing linked evidence or was used as its own evidence id.`,
        });
      }
    }
    const blocked = manifest.products.some((product) =>
      product.approvalState === "blocked"
      || product.claimEvidence.some((claim) => claim.status === "blocked")
    );
    if (blocked || manifest.status === "blocked") {
      issues.push({ code: "blocked_product_evidence", path: "productEvidenceManifest", message: "Blocked product evidence prevents product-related generation or handoff." });
    } else if (manifest.status === "warning") {
      warnings.push({ code: "blocked_product_evidence", path: "productEvidenceManifest", message: "Product evidence has warnings that require review before handoff." });
    }
  }

  return { ok: issues.length === 0, issues, warnings };
}

export function computeProductionSpaceReadiness(space: ProductionSpace): ProductionSpaceReadiness {
  const readyNodeIds: string[] = [];
  const blockedNodeIds: string[] = [];
  const warningNodeIds: string[] = [];
  let estimatedCredits = 0;
  for (const node of space.flowNodes) {
    estimatedCredits += Math.max(0, Number(node.estimatedCredits ?? 0));
    if (node.status === "blocked" || node.status === "failed" || (node.readinessIssues?.length ?? 0) > 0) {
      blockedNodeIds.push(node.id);
    } else if (node.status === "warning" || node.status === "disabled") {
      warningNodeIds.push(node.id);
    } else {
      readyNodeIds.push(node.id);
    }
  }
  return {
    status: blockedNodeIds.length > 0 ? "blocked" : warningNodeIds.length > 0 ? "warning" : "ready",
    readyNodeIds,
    blockedNodeIds,
    warningNodeIds,
    estimatedCredits,
  };
}

export function doesProductionNodeConfigChangeInvalidateApproval(
  before: ProductionNodeConfigSnapshot | null | undefined,
  after: ProductionNodeConfigSnapshot | null | undefined,
): boolean {
  if (!before || !after) return Boolean(before || after);
  return before.configHash !== after.configHash || before.toolSurface !== after.toolSurface || before.adapter !== after.adapter;
}

export function deriveProductionHandoffPayload(
  space: ProductionSpace,
  target: ProductionOutputSurface,
  options: { tenantId?: string } = {},
): ProductionHandoffPayload {
  const orderedShots = [...space.shots]
    .sort((a, b) => a.order - b.order)
    .map((shot) => {
      const nodeOutputRefs = shot.nodeIds
        .map((nodeId) => space.flowNodes.find((node) => node.id === nodeId))
        .filter((node): node is ProductionFlowNode => Boolean(node))
        .flatMap((node) => node.outputRefs ?? []);
      return {
        shotId: shot.id,
        title: shot.title,
        order: shot.order,
        durationSeconds: shot.durationSeconds,
        nodeOutputRefs,
      };
    });
  return {
    schemaVersion: "1.0.0",
    target,
    productionRunId: space.productionRunId,
    sourceSpaceVersion: space.version,
    idempotencyKey: buildProductionOutputProjectionIdentity({
      tenantId: options.tenantId ?? "unscoped-preview",
      productionRunId: space.productionRunId,
      surface: target,
      sourceOutput: { version: space.version, target, orderedShots },
    }).idempotencyKey,
    orderedShots,
    cues: [...(space.cues ?? [])].sort((a, b) => a.startSeconds - b.startSeconds),
    productEvidenceManifest: space.productEvidenceManifest,
    warnings: space.warnings ?? [],
  };
}

function hasProductionGraphCycle(nodeIds: string[], edges: ProductionFlowEdge[]): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const outgoing = new Map<string, string[]>();
  for (const id of nodeIds) outgoing.set(id, []);
  for (const edge of edges) {
    if (!outgoing.has(edge.source)) continue;
    outgoing.get(edge.source)?.push(edge.target);
  }
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const target of outgoing.get(nodeId) ?? []) {
      if (visit(target)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  return nodeIds.some((id) => visit(id));
}

function stableHash(value: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  let hashC = 0x85ebca6b;
  let hashD = 0xc2b2ae35;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193) >>> 0;
    hashB ^= code + index;
    hashB = Math.imul(hashB, 0x85ebca6b) >>> 0;
    hashC ^= code ^ (index << 8);
    hashC = Math.imul(hashC, 0xc2b2ae35) >>> 0;
    hashD ^= code + hashA;
    hashD = Math.imul(hashD, 0x27d4eb2f) >>> 0;
  }

  return [hashA, hashB, hashC, hashD]
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`);
  return `{${entries.join(",")}}`;
}
