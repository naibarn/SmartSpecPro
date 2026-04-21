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
export const teamResolutionCodeSchema = z.enum(teamResolutionCodeValues);

export type WorkOrchestratorSurface = z.infer<typeof workOrchestratorSurfaceSchema>;
export type WorkOsPersistedAutomationSurface = z.infer<typeof workOsPersistedAutomationSurfaceSchema>;
export type SkillStudioAction = z.infer<typeof skillStudioActionSchema>;
export type ContractCompatibilityState = z.infer<typeof contractCompatibilityStateSchema>;
export type PreflightPreviewView = z.infer<typeof preflightPreviewViewSchema>;
export type TeamResolutionCode = z.infer<typeof teamResolutionCodeSchema>;

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
  maxDurationMinutes: z.number().int().positive().nullable().optional(),
  maxBudgetCredits: z.number().positive().nullable().optional(),
  perSurfaceMaxAttempts: z.record(workOrchestratorSurfaceSchema, z.number().int().nonnegative()).default({}),
  mediaRenderQuota: z.number().int().nonnegative().nullable().optional(),
  retryDisposition: z.enum(["safe_retry", "single_attempt", "blocked"]).default("single_attempt"),
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
  title: z.string().min(1),
  objective: z.string().default(""),
  surface: workOrchestratorSurfaceSchema,
  action: skillStudioActionSchema.nullable().optional(),
  capabilityId: z.string().nullable().optional(),
  governance: surfaceGovernancePolicySchema,
  contractCompatibility: contractCompatibilitySchema,
  expectedArtifacts: z.array(z.string()).default([]),
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

export const preflightApprovalBundleSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1).nullable(),
  caseId: z.string().min(1),
  previewView: preflightPreviewViewSchema,
  brief: compiledWorkBriefSchema,
  capabilityCatalog: z.array(capabilityCatalogEntrySchema),
  executionPlan: teamExecutionPlanSchema.nullable().optional(),
  preflightRevision: preflightRevisionFingerprintSchema,
  approvedAt: z.string().datetime().nullable().optional(),
  approvedByUserId: z.number().int().nullable().optional(),
  metadata: jsonRecordSchema.default({}),
});

export type PreflightSourceRef = z.infer<typeof preflightSourceRefSchema>;
export type ApprovalSourceSnapshot = z.infer<typeof approvalSourceSnapshotSchema>;
export type PreflightRevisionFingerprint = z.infer<typeof preflightRevisionFingerprintSchema>;
export type SurfaceGovernancePolicy = z.infer<typeof surfaceGovernancePolicySchema>;
export type CapabilityCatalogEntry = z.infer<typeof capabilityCatalogEntrySchema>;
export type ExecutionBudgetEnvelope = z.infer<typeof executionBudgetEnvelopeSchema>;
export type TeamResolutionDecision = z.infer<typeof teamResolutionDecisionSchema>;
export type CompiledWorkBrief = z.infer<typeof compiledWorkBriefSchema>;
export type TeamExecutionPlan = z.infer<typeof teamExecutionPlanSchema>;
export type PreflightApprovalBundle = z.infer<typeof preflightApprovalBundleSchema>;

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
