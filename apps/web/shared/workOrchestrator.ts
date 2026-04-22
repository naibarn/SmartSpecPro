import { z } from "zod";

const jsonRecordSchema = z.record(z.string(), z.unknown());

export const workOrchestratorSurfaceValues = [
  "manual",
  "work_os",
  "skill",
  "agency",
  "browser",
  "document_management",
  "media_studio",
  "video_editor",
  "workflow",
  "skill_studio",
] as const;

export const workOsPersistedAutomationSurfaceValues = [
  "manual",
  "work_os",
  "skill",
  "agency",
  "browser",
  "document_management",
  "media_studio",
  "video_editor",
] as const;

export const skillStudioActionValues = [
  "create_private_or_pending_review",
  "improve_owned_skill",
  "auto_apply_proposal",
  "publish_or_widen_visibility",
] as const;

export const contractCompatibilityStateValues = [
  "compatible",
  "preview_only",
  "blocked_contract_not_migrated",
] as const;

export const surfaceGovernanceGateValues = [
  "manifest_risk_policy",
  "capability_risk_policy",
  "feature_flag_runtime_permission_approval",
  "connector_domain_policy",
  "bounded_write_scope",
  "provider_allowlist_quota",
  "explicit_approval",
  "human_action",
  "skill_studio_action_policy",
] as const;

export const preflightPreviewViewValues = [
  "requester_safe",
  "admin_diagnostic",
] as const;

export const preflightApprovalBundleStateValues = [
  "draft",
  "previewed",
  "approved",
  "stale",
  "launch_blocked",
  "launching",
  "launched",
  "cancelled",
  "superseded",
] as const;

export const workIntakeSourceScopeValues = [
  "case",
  "request",
  "conversation",
  "memory",
  "library_context_pack",
  "workpack_run",
  "role_routine_run",
  "policy",
  "manual",
] as const;

export const workIntakeSourceDiagnosticCodeValues = [
  "source_included",
  "source_not_selected",
  "source_selected",
  "source_invalid",
  "source_scope_not_allowed",
  "source_private_vault_locked",
  "source_budget_exceeded",
  "source_unavailable",
  "source_omitted",
  "source_selected_but_unavailable",
] as const;

export const runtimeDispatchSideEffectClassValues = [
  "read_only",
  "bounded_write",
  "external_side_effect",
  "irreversible",
] as const;

export const runtimeDispatchRetryBackoffValues = [
  "none",
  "fixed",
  "exponential",
] as const;

export const runtimeDispatchCancelBehaviorValues = [
  "best_effort_cancel",
  "wait_for_provider",
  "mark_cancel_requested",
  "cannot_cancel",
] as const;

export const executionBudgetExceededDispositionValues = [
  "pause_for_approval",
  "fail_run",
  "skip_optional_step",
  "cancel_pending",
] as const;

export const learningProposalStateValues = [
  "generated",
  "deduped",
  "triaged",
  "accepted",
  "scheduled",
  "applied",
  "rejected",
  "expired",
  "superseded",
] as const;

export const learningProposalActionTypeValues = [
  "workpack_candidate",
  "workflow_refinement",
  "skill_improvement",
  "skill_studio_auto_apply",
  "publish_or_widen_visibility",
] as const;

export const orchestratorTelemetrySeverityValues = [
  "debug",
  "info",
  "warning",
  "error",
] as const;

export const orchestratorTelemetryActorClassValues = [
  "requester",
  "admin",
  "domain_admin",
  "service",
  "worker",
] as const;

export const orchestratorTelemetryRedactionModeValues = [
  "requester_safe",
  "admin_diagnostic",
  "internal",
] as const;

export const teamResolutionCodeValues = [
  "resolved_plan_override",
  "resolved_case_owner",
  "resolved_request_default_queue",
  "resolved_request_default_owner",
  "resolved_tenant_fallback",
  "missing_team",
  "inactive_team",
  "ambiguous_team",
  "unauthorized_team",
] as const;

export const workOrchestratorSurfaceSchema = z.enum(workOrchestratorSurfaceValues);
export const workOsPersistedAutomationSurfaceSchema = z.enum(workOsPersistedAutomationSurfaceValues);
export const skillStudioActionSchema = z.enum(skillStudioActionValues);
export const contractCompatibilityStateSchema = z.enum(contractCompatibilityStateValues);
export const surfaceGovernanceGateSchema = z.enum(surfaceGovernanceGateValues);
export const preflightPreviewViewSchema = z.enum(preflightPreviewViewValues);
export const preflightApprovalBundleStateSchema = z.enum(preflightApprovalBundleStateValues);
export const workIntakeSourceScopeSchema = z.enum(workIntakeSourceScopeValues);
export const workIntakeSourceDiagnosticCodeSchema = z.enum(workIntakeSourceDiagnosticCodeValues);
export const runtimeDispatchSideEffectClassSchema = z.enum(runtimeDispatchSideEffectClassValues);
export const runtimeDispatchRetryBackoffSchema = z.enum(runtimeDispatchRetryBackoffValues);
export const runtimeDispatchCancelBehaviorSchema = z.enum(runtimeDispatchCancelBehaviorValues);
export const executionBudgetExceededDispositionSchema = z.enum(executionBudgetExceededDispositionValues);
export const learningProposalStateSchema = z.enum(learningProposalStateValues);
export const learningProposalActionTypeSchema = z.enum(learningProposalActionTypeValues);
export const teamResolutionCodeSchema = z.enum(teamResolutionCodeValues);
export const orchestratorTelemetrySeveritySchema = z.enum(orchestratorTelemetrySeverityValues);
export const orchestratorTelemetryActorClassSchema = z.enum(orchestratorTelemetryActorClassValues);
export const orchestratorTelemetryRedactionModeSchema = z.enum(orchestratorTelemetryRedactionModeValues);

export type WorkOrchestratorSurface = z.infer<typeof workOrchestratorSurfaceSchema>;
export type WorkOsPersistedAutomationSurface = z.infer<typeof workOsPersistedAutomationSurfaceSchema>;
export type SkillStudioAction = z.infer<typeof skillStudioActionSchema>;
export type ContractCompatibilityState = z.infer<typeof contractCompatibilityStateSchema>;
export type PreflightPreviewView = z.infer<typeof preflightPreviewViewSchema>;
export type PreflightApprovalBundleState = z.infer<typeof preflightApprovalBundleStateSchema>;
export type TeamResolutionCode = z.infer<typeof teamResolutionCodeSchema>;
export type WorkIntakeSourceScope = z.infer<typeof workIntakeSourceScopeSchema>;
export type OrchestratorTelemetrySeverity = z.infer<typeof orchestratorTelemetrySeveritySchema>;
export type OrchestratorTelemetryActorClass = z.infer<typeof orchestratorTelemetryActorClassSchema>;
export type OrchestratorTelemetryRedactionMode = z.infer<typeof orchestratorTelemetryRedactionModeSchema>;

export const preflightSourceRefSchema = z.object({
  sourceType: z.enum([
    "request",
    "case",
    "conversation",
    "memory",
    "library_context_pack",
    "workpack_run",
    "role_routine_run",
    "policy",
    "manual",
  ]),
  sourceId: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().default(true),
  trust: z.enum(["trusted", "derived", "untrusted"]).default("derived"),
  freshness: z.enum(["current", "recent", "stale", "unknown"]).default("unknown"),
});

export const workIntakeActorContextSchema = z.object({
  tenantId: z.string().min(1),
  actorUserId: z.number().int().nullable().optional(),
  requesterUserId: z.string().min(1).nullable().optional(),
  roles: z.array(z.string().min(1)).default([]),
  domainId: z.string().min(1).nullable().optional(),
  privateVaultUnlocked: z.boolean().default(false),
  allowedSourceScopes: z.array(workIntakeSourceScopeSchema).default([]),
  allowedSurfacePermissions: z.array(z.string().min(1)).default([]),
  previewAccessLevel: preflightPreviewViewSchema.default("requester_safe"),
});

export const workIntakeSourceDiagnosticSchema = z.object({
  sourceId: z.string().min(1),
  sourceType: preflightSourceRefSchema.shape.sourceType,
  included: z.boolean(),
  selected: z.boolean().default(false),
  code: workIntakeSourceDiagnosticCodeSchema,
  message: z.string().min(1),
  trust: preflightSourceRefSchema.shape.trust.default("derived"),
  freshness: preflightSourceRefSchema.shape.freshness.default("unknown"),
  requesterMessage: z.string().nullable().optional(),
  adminDetail: z.string().nullable().optional(),
});

export const governedContextSnapshotSchema = z.object({
  actorContext: workIntakeActorContextSchema,
  sourceRefs: z.array(preflightSourceRefSchema).default([]),
  selectedSourceIds: z.array(z.string().min(1)).default([]),
  diagnostics: z.array(workIntakeSourceDiagnosticSchema).default([]),
  trustSummary: z.object({
    trustedCount: z.number().int().nonnegative().default(0),
    derivedCount: z.number().int().nonnegative().default(0),
    untrustedCount: z.number().int().nonnegative().default(0),
  }).default({}),
  freshnessSummary: z.object({
    currentCount: z.number().int().nonnegative().default(0),
    recentCount: z.number().int().nonnegative().default(0),
    staleCount: z.number().int().nonnegative().default(0),
    unknownCount: z.number().int().nonnegative().default(0),
  }).default({}),
  generatedAt: z.string().datetime(),
});

export const approvalSourceSnapshotSchema = z.object({
  source: preflightSourceRefSchema,
  approvedExcerpt: z.string().max(12000).default(""),
  summary: z.string().max(4000).default(""),
  contentHash: z.string().min(1).nullable().optional(),
  versionMarker: z.string().min(1).nullable().optional(),
  privateVaultUnlocked: z.boolean().default(false),
  sanitizationState: z.enum(["redacted", "summary_only", "hash_only"]).default("redacted"),
  capturedAt: z.string().datetime(),
});

export const preflightIdempotencyRecordSchema = z.object({
  operation: z.string().min(1),
  idempotencyKey: z.string().min(1),
  inputFingerprint: z.string().min(1),
  createdAt: z.string().datetime(),
  result: jsonRecordSchema.default({}),
});

export const preflightStateTransitionSchema = z.object({
  event: z.string().min(1),
  fromState: preflightApprovalBundleStateSchema.nullable(),
  toState: preflightApprovalBundleStateSchema,
  actorUserId: z.number().int().nullable().optional(),
  reasonCode: z.string().min(1),
  correlationId: z.string().min(1),
  occurredAt: z.string().datetime(),
});

export const preflightRevisionFingerprintSchema = z.object({
  algorithm: z.literal("sha256-json-v1"),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  inputs: z.object({
    requestTitle: z.string(),
    requestObjective: z.string().nullable(),
    linkedConversationIds: z.array(z.string()),
    linkedWorkpackRunIds: z.array(z.string()),
    linkedRoleRoutineRunIds: z.array(z.string()),
    selectedSourceIds: z.array(z.string()),
    policyDigest: z.string().nullable(),
    explicitTeamId: z.string().nullable(),
  }),
  generatedAt: z.string().datetime(),
});

export const surfaceGovernancePolicySchema = z.object({
  surface: workOrchestratorSurfaceSchema,
  action: skillStudioActionSchema.nullable().optional(),
  plannerVisible: z.boolean(),
  autoExecutableByDefault: z.boolean(),
  approvalRequired: z.boolean(),
  minimumGate: surfaceGovernanceGateSchema,
  requiredFeatureFlags: z.array(z.string()).default([]),
  requiredPermissions: z.array(z.string()).default([]),
});

export const contractCompatibilitySchema = z.object({
  state: contractCompatibilityStateSchema,
  reasonCode: z.string().min(1).nullable().optional(),
  migrationRequired: z.boolean().default(false),
});

export const capabilityCatalogEntrySchema = z.object({
  id: z.string().min(1),
  surface: workOrchestratorSurfaceSchema,
  action: skillStudioActionSchema.nullable().optional(),
  title: z.string().min(1),
  description: z.string().default(""),
  governance: surfaceGovernancePolicySchema,
  contractCompatibility: contractCompatibilitySchema,
  blockedReason: z.string().nullable().optional(),
  metadata: jsonRecordSchema.default({}),
});

export const executionBudgetEnvelopeSchema = z.object({
  maxRounds: z.number().int().positive().nullable().optional(),
  maxTokens: z.number().int().nonnegative().nullable().optional(),
  maxToolCalls: z.number().int().nonnegative().nullable().optional(),
  maxMediaJobs: z.number().int().nonnegative().nullable().optional(),
  maxWorkflowRuns: z.number().int().nonnegative().nullable().optional(),
  maxAgencyRuns: z.number().int().nonnegative().nullable().optional(),
  maxDurationMinutes: z.number().int().positive().nullable().optional(),
  maxBudgetCredits: z.number().positive().nullable().optional(),
  maxRetries: z.number().int().nonnegative().nullable().optional(),
  perSurfaceMaxAttempts: z.record(workOrchestratorSurfaceSchema, z.number().int().nonnegative()).default({}),
  mediaRenderQuota: z.number().int().nonnegative().nullable().optional(),
  retryDisposition: z.enum(["safe_retry", "single_attempt", "blocked"]).default("single_attempt"),
  sideEffectRetryPolicy: z.enum(["automatic", "verify_then_retry", "manual_only", "forbidden"]).default("verify_then_retry"),
  onExceeded: executionBudgetExceededDispositionSchema.default("pause_for_approval"),
});

export const teamResolutionDecisionSchema = z.object({
  status: z.enum(["resolved", "blocked"]),
  code: teamResolutionCodeSchema,
  teamId: z.string().min(1).nullable(),
  source: z.enum([
    "plan_override",
    "case_owner",
    "request_default_queue",
    "request_default_owner",
    "tenant_fallback",
    "none",
  ]),
  reason: z.string().min(1),
  diagnostics: jsonRecordSchema.default({}),
});

export const compiledWorkBriefSchema = z.object({
  title: z.string().min(1),
  objective: z.string().nullable(),
  summary: z.string().default(""),
  sourceRefs: z.array(preflightSourceRefSchema).default([]),
  approvalSnapshots: z.array(approvalSourceSnapshotSchema).default([]),
  generatedAt: z.string().datetime(),
});

export const teamExecutionPlanStepSchema = z.object({
  id: z.string().min(1),
  stepKey: z.string().min(1).optional(),
  title: z.string().min(1),
  objective: z.string().default(""),
  surface: workOrchestratorSurfaceSchema,
  action: skillStudioActionSchema.nullable().optional(),
  capabilityId: z.string().nullable().optional(),
  governance: surfaceGovernancePolicySchema,
  contractCompatibility: contractCompatibilitySchema,
  expectedArtifacts: z.array(z.string()).default([]),
  optional: z.boolean().default(false),
  metadata: jsonRecordSchema.default({}),
});

export const capabilityPlanStepSchema = z.object({
  stepId: z.string().min(1),
  title: z.string().min(1),
  selectedCapabilityId: z.string().nullable().optional(),
  selectedSurface: workOrchestratorSurfaceSchema,
  blockedReasonCodes: z.array(z.string().min(1)).default([]),
  alternativeCapabilityIds: z.array(z.string().min(1)).default([]),
});

export const capabilityPlanSchema = z.object({
  id: z.string().min(1),
  version: z.literal("capability-plan.v1"),
  selectedCapabilityIds: z.array(z.string().min(1)).default([]),
  summary: z.string().default(""),
  steps: z.array(capabilityPlanStepSchema).default([]),
  createdAt: z.string().datetime(),
});

export const teamExecutionPlanSchema = z.object({
  id: z.string().min(1),
  version: z.literal("team-execution-plan.v1"),
  brief: compiledWorkBriefSchema,
  steps: z.array(teamExecutionPlanStepSchema),
  budget: executionBudgetEnvelopeSchema,
  teamResolution: teamResolutionDecisionSchema,
  preflightRevision: preflightRevisionFingerprintSchema,
  createdAt: z.string().datetime(),
});

export const runtimeDispatchPolicySchema = z.object({
  stepId: z.string().min(1),
  surface: workOrchestratorSurfaceSchema,
  selectedCapabilityId: z.string().nullable().optional(),
  authorityDecision: z.enum(["allowed", "approval_required", "blocked"]).default("allowed"),
  contractCompatibilityState: contractCompatibilityStateSchema,
  sideEffectClass: runtimeDispatchSideEffectClassSchema,
  idempotencyKey: z.string().min(1),
  inputHash: z.string().min(1),
  budgetReservation: z.object({
    tokens: z.number().int().nonnegative().default(0),
    toolCalls: z.number().int().nonnegative().default(0),
    mediaJobs: z.number().int().nonnegative().default(0),
    workflowRuns: z.number().int().nonnegative().default(0),
    agencyRuns: z.number().int().nonnegative().default(0),
    costCredits: z.number().nonnegative().default(0),
  }).default({}),
  maxAttempts: z.number().int().positive(),
  timeoutSeconds: z.number().int().positive(),
  retryBackoff: runtimeDispatchRetryBackoffSchema.default("fixed"),
  resumeCursor: z.string().nullable().optional(),
  cancelBehavior: runtimeDispatchCancelBehaviorSchema.default("mark_cancel_requested"),
  deadLetterPolicy: z.object({
    reasonCode: z.string().min(1),
    recoveryHint: z.string().min(1),
  }),
});

export const orchestratorLearningProposalSchema = z.object({
  id: z.string().min(1),
  state: learningProposalStateSchema,
  actionType: learningProposalActionTypeSchema,
  title: z.string().min(1),
  summary: z.string().default(""),
  confidence: z.number().min(0).max(1),
  dedupeKey: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  recommendedApprovalPath: z.string().min(1),
  relatedRunId: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  metadata: jsonRecordSchema.default({}),
});

export const orchestratorTelemetryEventSchema = z.object({
  eventName: z.string().min(1),
  eventVersion: z.string().min(1),
  occurredAt: z.string().datetime(),
  severity: orchestratorTelemetrySeveritySchema,
  primaryReasonCode: z.string().min(1).nullable().optional(),
  actorClass: orchestratorTelemetryActorClassSchema,
  redactionMode: orchestratorTelemetryRedactionModeSchema,
  tenantId: z.string().min(1).nullable().optional(),
  actorUserId: z.number().int().nullable().optional(),
  requestId: z.string().min(1).nullable().optional(),
  caseId: z.string().min(1).nullable().optional(),
  preflightBundleId: z.string().min(1).nullable().optional(),
  preflightRevisionHash: z.string().min(1).nullable().optional(),
  automationRunId: z.string().min(1).nullable().optional(),
  teamId: z.string().min(1).nullable().optional(),
  roomId: z.string().min(1).nullable().optional(),
  teamRunId: z.string().min(1).nullable().optional(),
  workItemId: z.string().min(1).nullable().optional(),
  planStepId: z.string().min(1).nullable().optional(),
  surface: workOrchestratorSurfaceSchema.nullable().optional(),
  capabilityId: z.string().min(1).nullable().optional(),
  correlationId: z.string().min(1).nullable().optional(),
  idempotencyKey: z.string().min(1).nullable().optional(),
  payload: jsonRecordSchema.default({}),
});

export const preflightApprovalBundleSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1).nullable().optional(),
  requestId: z.string().min(1).nullable(),
  caseId: z.string().min(1),
  state: preflightApprovalBundleStateSchema.default("previewed"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  previewView: preflightPreviewViewSchema,
  brief: compiledWorkBriefSchema,
  capabilityCatalog: z.array(capabilityCatalogEntrySchema),
  capabilityPlan: capabilityPlanSchema.nullable().optional(),
  executionPlan: teamExecutionPlanSchema.nullable().optional(),
  teamResolution: teamResolutionDecisionSchema.nullable().optional(),
  budget: executionBudgetEnvelopeSchema.nullable().optional(),
  approvalSnapshots: z.array(approvalSourceSnapshotSchema).default([]),
  preflightRevision: preflightRevisionFingerprintSchema,
  createdByUserId: z.number().int().nullable().optional(),
  launchedAt: z.string().datetime().nullable().optional(),
  supersededByBundleId: z.string().nullable().optional(),
  approvedAt: z.string().datetime().nullable().optional(),
  approvedByUserId: z.number().int().nullable().optional(),
  idempotencyRecords: z.array(preflightIdempotencyRecordSchema).default([]),
  stateTransitions: z.array(preflightStateTransitionSchema).default([]),
  requesterSafeDiagnostics: jsonRecordSchema.optional(),
  adminDiagnostics: jsonRecordSchema.optional(),
  metadata: jsonRecordSchema.default({}),
});

export type PreflightSourceRef = z.infer<typeof preflightSourceRefSchema>;
export type WorkIntakeActorContext = z.infer<typeof workIntakeActorContextSchema>;
export type WorkIntakeSourceDiagnostic = z.infer<typeof workIntakeSourceDiagnosticSchema>;
export type GovernedContextSnapshot = z.infer<typeof governedContextSnapshotSchema>;
export type ApprovalSourceSnapshot = z.infer<typeof approvalSourceSnapshotSchema>;
export type PreflightIdempotencyRecord = z.infer<typeof preflightIdempotencyRecordSchema>;
export type PreflightStateTransition = z.infer<typeof preflightStateTransitionSchema>;
export type PreflightRevisionFingerprint = z.infer<typeof preflightRevisionFingerprintSchema>;
export type SurfaceGovernancePolicy = z.infer<typeof surfaceGovernancePolicySchema>;
export type CapabilityCatalogEntry = z.infer<typeof capabilityCatalogEntrySchema>;
export type ExecutionBudgetEnvelope = z.infer<typeof executionBudgetEnvelopeSchema>;
export type TeamResolutionDecision = z.infer<typeof teamResolutionDecisionSchema>;
export type CompiledWorkBrief = z.infer<typeof compiledWorkBriefSchema>;
export type CapabilityPlan = z.infer<typeof capabilityPlanSchema>;
export type TeamExecutionPlan = z.infer<typeof teamExecutionPlanSchema>;
export type RuntimeDispatchPolicy = z.infer<typeof runtimeDispatchPolicySchema>;
export type PreflightApprovalBundle = z.infer<typeof preflightApprovalBundleSchema>;
export type OrchestratorLearningProposal = z.infer<typeof orchestratorLearningProposalSchema>;
export type OrchestratorTelemetryEvent = z.infer<typeof orchestratorTelemetryEventSchema>;

const persistedSurfaceSet = new Set<string>(workOsPersistedAutomationSurfaceValues);

export function isWorkOsSurfaceContractMigrated(surface: WorkOrchestratorSurface): surface is WorkOsPersistedAutomationSurface {
  return persistedSurfaceSet.has(surface);
}

export function getDefaultContractCompatibility(surface: WorkOrchestratorSurface) {
  if (isWorkOsSurfaceContractMigrated(surface)) {
    return {
      state: "compatible" as const,
      reasonCode: null,
      migrationRequired: false,
    };
  }
  return {
    state: "blocked_contract_not_migrated" as const,
    reasonCode: "surface_contract_not_migrated",
    migrationRequired: true,
  };
}
