import { z } from "zod";

import {
  evidenceRedactionStateSchema,
  evidenceRedactionStateValues,
  evidenceRetentionTierSchema,
  evidenceRetentionTierValues,
  sanitizeSensitiveRecord,
  sideEffectClassSchema,
  sideEffectClassValues,
} from "./workpackContracts";

const jsonRecordSchema = z.record(z.string(), z.unknown());

export const roleAgentLifecycleStateValues = [
  "draft",
  "active",
  "paused",
  "degraded",
  "quarantined",
  "retired",
  "archived",
] as const;

export const roleContractStatusValues = [
  "draft",
  "pending_review",
  "active",
  "superseded",
  "blocked",
] as const;

export const roleRoutineStatusValues = [
  "active",
  "paused",
  "blocked",
  "retired",
] as const;

export const roleRoutineRunStatusValues = [
  "queued",
  "running",
  "awaiting_approval",
  "succeeded",
  "failed",
  "blocked",
  "quarantined",
  "cancelled",
] as const;

export const roleAutonomyTierValues = [
  "manual",
  "guided",
  "supervised",
  "autonomous",
] as const;

export const roleHealthStateValues = [
  "healthy",
  "degraded",
  "blocked",
  "stale",
  "quarantined",
] as const;

export const workpackResolutionPolicyValues = [
  "pinned_version",
  "follow_benchmark_track",
  "follow_latest_ready_in_family",
] as const;

export const roleDelegationIntentTypeValues = [
  "request",
  "handoff",
  "escalate",
  "dependency_block",
  "status_summary",
  "approval_request",
  "shared_finding",
] as const;

export const checkpointRecoveryStateValues = [
  "fresh",
  "stale",
  "needs_resume_review",
  "recovered",
  "quarantined",
] as const;

export const rolePromotionDecisionValues = [
  "unchanged",
  "promote",
  "downgrade",
  "freeze",
  "revert",
] as const;

export const roleRoutineTriggerTypeValues = [
  "schedule",
  "inbox_poll",
  "queue_threshold",
  "connector_event",
  "exception_follow_up",
  "kpi_breach",
  "manual",
] as const;

export const roleRoutineConcurrencyPolicyValues = [
  "singleton",
  "allow_overlap",
  "partitioned_by_key",
] as const;

export const roleQueueItemStatusValues = [
  "queued",
  "claimed",
  "completed",
  "cancelled",
  "expired",
  "quarantined",
] as const;

export const roleQueueClaimStateValues = [
  "available",
  "claimed",
  "expired",
  "released",
] as const;

export const roleMessagePriorityValues = [
  "low",
  "normal",
  "high",
  "critical",
] as const;

export const roleMessageActionabilityStateValues = [
  "informational",
  "pending",
  "accepted",
  "blocked",
  "completed",
  "expired",
] as const;

export const roleVisibilityClassValues = [
  "owner_full",
  "delegated_minimum",
  "shared_reference",
  "operator_review",
  "redacted_summary",
] as const;

export const roleTrustClassValues = [
  "internal",
  "sensitive",
  "regulated",
] as const;

export const roleMemoryClassValues = [
  "role_memory",
  "operational_memory",
  "shared_org_memory",
  "archived_context",
] as const;

export const roleImprovementTargetValues = [
  "workpack_selection_rule",
  "workpack_version_preference",
  "prompt_refinement",
  "browser_pack",
  "connector_map",
  "skill_update",
  "operator_guidance",
  "policy_threshold",
] as const;

export const roleRiskClassValues = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

export const roleHandoffStatusValues = [
  "pending",
  "accepted",
  "blocked",
  "completed",
  "rejected",
] as const;

export const roleApprovalTypeValues = [
  "contract_expansion_review",
  "safe_resume_review",
  "promotion_review",
  "delegated_approval_request",
  "high_risk_exception_review",
] as const;

export const roleApprovalStatusValues = [
  "pending",
  "approved",
  "rejected",
  "expired",
  "cancelled",
] as const;

export const roleAuthorityImpactValues = [
  "none",
  "configuration_only",
  "envelope_change",
  "connector_scope_change",
  "budget_change",
  "regulated_boundary_change",
] as const;

export const roleCheckpointFreshnessTierValues = [
  "fresh",
  "warning",
  "critical",
] as const;

export const roleAgentLifecycleStateSchema = z.enum(roleAgentLifecycleStateValues);
export const roleContractStatusSchema = z.enum(roleContractStatusValues);
export const roleRoutineStatusSchema = z.enum(roleRoutineStatusValues);
export const roleRoutineRunStatusSchema = z.enum(roleRoutineRunStatusValues);
export const roleAutonomyTierSchema = z.enum(roleAutonomyTierValues);
export const roleHealthStateSchema = z.enum(roleHealthStateValues);
export const workpackResolutionPolicySchema = z.enum(workpackResolutionPolicyValues);
export const roleDelegationIntentTypeSchema = z.enum(roleDelegationIntentTypeValues);
export const checkpointRecoveryStateSchema = z.enum(checkpointRecoveryStateValues);
export const rolePromotionDecisionSchema = z.enum(rolePromotionDecisionValues);
export const roleRoutineTriggerTypeSchema = z.enum(roleRoutineTriggerTypeValues);
export const roleRoutineConcurrencyPolicySchema = z.enum(roleRoutineConcurrencyPolicyValues);
export const roleQueueItemStatusSchema = z.enum(roleQueueItemStatusValues);
export const roleQueueClaimStateSchema = z.enum(roleQueueClaimStateValues);
export const roleMessagePrioritySchema = z.enum(roleMessagePriorityValues);
export const roleMessageActionabilityStateSchema = z.enum(roleMessageActionabilityStateValues);
export const roleVisibilityClassSchema = z.enum(roleVisibilityClassValues);
export const roleTrustClassSchema = z.enum(roleTrustClassValues);
export const roleMemoryClassSchema = z.enum(roleMemoryClassValues);
export const roleImprovementTargetSchema = z.enum(roleImprovementTargetValues);
export const roleRiskClassSchema = z.enum(roleRiskClassValues);
export const roleHandoffStatusSchema = z.enum(roleHandoffStatusValues);
export const roleApprovalTypeSchema = z.enum(roleApprovalTypeValues);
export const roleApprovalStatusSchema = z.enum(roleApprovalStatusValues);
export const roleAuthorityImpactSchema = z.enum(roleAuthorityImpactValues);
export const roleCheckpointFreshnessTierSchema = z.enum(roleCheckpointFreshnessTierValues);

export const roleContextGovernanceSchema = z.object({
  trustClass: roleTrustClassSchema.default("internal"),
  retentionTier: evidenceRetentionTierSchema.default("standard"),
  redactionState: z.enum(evidenceRedactionStateValues).default("redacted"),
  visibilityClass: roleVisibilityClassSchema.default("owner_full"),
  legalHold: z.boolean().default(false),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const roleKpiTargetSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().default("count"),
  targetValue: z.number(),
  warningFloor: z.number().nullable().optional(),
  criticalFloor: z.number().nullable().optional(),
});

export const roleAuthorityEnvelopeSchema = z.object({
  autonomyTier: roleAutonomyTierSchema.default("guided"),
  connectorFamilies: z.array(z.string()).default([]),
  sideEffectCeiling: z.enum(sideEffectClassValues).default("bounded_write"),
  monthlyBudgetLimit: z.number().nonnegative().default(0),
  regulatedActionLabels: z.array(z.string()).default([]),
  requiresApprovalFor: z.array(z.string()).default([]),
  visibilityDefaults: z.array(roleVisibilityClassSchema).default(["owner_full"]),
});

export const roleBlueprintRoutineStarterSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  triggerType: roleRoutineTriggerTypeSchema,
  suggestedWorkpackFamilies: z.array(z.string()).default([]),
  recommendedAutonomyTier: roleAutonomyTierSchema.default("guided"),
});

export const roleBlueprintSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  key: z.string().min(1),
  title: z.string().min(1),
  departmentLabel: z.string().min(1),
  purpose: z.string().min(1),
  defaultMission: z.string().min(1),
  kpiCategories: z.array(z.string()).default([]),
  defaultAuthorityEnvelope: roleAuthorityEnvelopeSchema,
  typicalConnectorFamilies: z.array(z.string()).default([]),
  recommendedRoutineStarters: z.array(roleBlueprintRoutineStarterSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const roleAgentSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  blueprintId: z.string().nullable().optional(),
  name: z.string().min(1),
  departmentLabel: z.string().min(1),
  lifecycleState: roleAgentLifecycleStateSchema,
  healthState: roleHealthStateSchema.default("healthy"),
  currentAutonomyTier: roleAutonomyTierSchema.default("guided"),
  activeContractId: z.string().nullable().optional(),
  bridgeTeamId: z.string().nullable().optional(),
  roomId: z.string().nullable().optional(),
  ownerUserId: z.number().int().nullable().optional(),
  ownershipContext: jsonRecordSchema.default({}),
  tags: z.array(z.string()).default([]),
  lastCheckpointAt: z.string().datetime().nullable().optional(),
  lastRoutineRunId: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const roleContractSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  roleId: z.string().min(1),
  versionNumber: z.number().int().positive(),
  status: roleContractStatusSchema,
  missionStatement: z.string().min(1),
  kpiTargets: z.array(roleKpiTargetSchema).default([]),
  authorityEnvelope: roleAuthorityEnvelopeSchema,
  workpackBindingIds: z.array(z.string()).default([]),
  visibilityMatrix: z.record(z.string(), z.array(roleVisibilityClassSchema)).default({}),
  notes: z.string().default(""),
  activatedAt: z.string().datetime().nullable().optional(),
  supersededByContractId: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});

export const roleWorkpackBindingSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  roleId: z.string().min(1),
  contractId: z.string().min(1),
  label: z.string().min(1),
  workpackFamily: z.string().min(1),
  benchmarkTrack: z.string().nullable().optional(),
  pinnedVersionId: z.string().nullable().optional(),
  resolutionPolicy: workpackResolutionPolicySchema,
  rollbackBaselineVersionId: z.string().nullable().optional(),
  connectorCeilingFamilies: z.array(z.string()).default([]),
  sideEffectCeiling: z.enum(sideEffectClassValues).default("bounded_write"),
  budgetCeiling: z.number().nonnegative().default(0),
  regulatedBoundaryLabel: z.string().nullable().optional(),
  active: z.boolean().default(true),
  createdAt: z.string().datetime(),
});

export const roleRoutineScheduleSchema = z.object({
  triggerType: roleRoutineTriggerTypeSchema,
  cron: z.string().nullable().optional(),
  intervalMinutes: z.number().int().positive().nullable().optional(),
  queueThreshold: z.number().int().positive().nullable().optional(),
  connectorEventKey: z.string().nullable().optional(),
  kpiKey: z.string().nullable().optional(),
  followUpDelayMinutes: z.number().int().positive().nullable().optional(),
  activeWindow: z
    .object({
      timezone: z.string().default("UTC"),
      startsAt: z.string().default("00:00"),
      endsAt: z.string().default("23:59"),
    })
    .nullable()
    .optional(),
});

export const roleRoutineSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  roleId: z.string().min(1),
  contractId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  status: roleRoutineStatusSchema,
  autonomyTier: roleAutonomyTierSchema.default("guided"),
  workpackBindingIds: z.array(z.string()).min(1),
  schedule: roleRoutineScheduleSchema,
  concurrencyPolicy: roleRoutineConcurrencyPolicySchema.default("singleton"),
  slaMinutes: z.number().int().positive().default(60),
  partitionKeyField: z.string().nullable().optional(),
  nextWakeAt: z.string().datetime().nullable().optional(),
  lastWakeAt: z.string().datetime().nullable().optional(),
  rollbackBaselineVersionId: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const roleRoutineRunSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  roleId: z.string().min(1),
  routineId: z.string().min(1),
  contractId: z.string().min(1),
  status: roleRoutineRunStatusSchema,
  triggerSource: roleRoutineTriggerTypeSchema,
  idempotencyKey: z.string().min(1),
  selectedWorkpackFamily: z.string().nullable().optional(),
  resolvedWorkpackVersionId: z.string().nullable().optional(),
  linkedWorkpackRunIds: z.array(z.string()).default([]),
  checkpointId: z.string().nullable().optional(),
  recoveryState: checkpointRecoveryStateSchema.default("fresh"),
  resolutionPolicy: workpackResolutionPolicySchema.nullable().optional(),
  previousResolvedVersionId: z.string().nullable().optional(),
  rollbackBaselineVersionId: z.string().nullable().optional(),
  partitionKey: z.string().nullable().optional(),
  blockerCodes: z.array(z.string()).default([]),
  currentObjectiveSummary: z.string().default(""),
  approvalRequestIds: z.array(z.string()).default([]),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const roleCheckpointSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  roleId: z.string().min(1),
  routineId: z.string().nullable().optional(),
  routineRunId: z.string().nullable().optional(),
  recoveryState: checkpointRecoveryStateSchema,
  objectiveSummary: z.string().default(""),
  activeQueueSummary: z.array(z.string()).default([]),
  recentDecisions: z.array(z.string()).default([]),
  pendingApprovalIds: z.array(z.string()).default([]),
  nextWakeConditions: z.array(z.string()).default([]),
  progressCursor: jsonRecordSchema.default({}),
  healthState: roleHealthStateSchema,
  lastSuccessfulOutcomeSummary: z.string().nullable().optional(),
  memorySummaryIds: z.array(z.string()).default([]),
  governance: roleContextGovernanceSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const roleMessageProvenanceSchema = z.object({
  source: z.enum(["role_monitor", "team_room", "scheduler", "system"]),
  actorId: z.string().nullable().optional(),
  actorType: z.enum(["role", "user", "system"]).default("role"),
  traceId: z.string().nullable().optional(),
});

export const roleMessageSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  roomId: z.string().nullable().optional(),
  senderRoleId: z.string().min(1),
  recipientRoleId: z.string().nullable().optional(),
  recipientGroup: z.string().nullable().optional(),
  relatedRoutineId: z.string().nullable().optional(),
  relatedRoutineRunId: z.string().nullable().optional(),
  relatedWorkpackFamily: z.string().nullable().optional(),
  relatedWorkpackRunId: z.string().nullable().optional(),
  intentType: roleDelegationIntentTypeSchema,
  priority: roleMessagePrioritySchema.default("normal"),
  dueState: z.enum(["none", "pending", "due_soon", "overdue"]).default("none"),
  actionabilityState: roleMessageActionabilityStateSchema.default("informational"),
  provenance: roleMessageProvenanceSchema,
  visibilityClass: roleVisibilityClassSchema.default("owner_full"),
  contentSummary: z.string().min(1),
  metadata: jsonRecordSchema.default({}),
  createdAt: z.string().datetime(),
  acknowledgedAt: z.string().datetime().nullable().optional(),
});

export const roleHandoffSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  senderRoleId: z.string().min(1),
  recipientRoleId: z.string().min(1),
  sourceMessageId: z.string().min(1),
  relatedRoutineId: z.string().nullable().optional(),
  relatedRoutineRunId: z.string().nullable().optional(),
  purpose: z.string().min(1),
  expectedReviewState: z.string().default("pending"),
  status: roleHandoffStatusSchema.default("pending"),
  linkedExceptionId: z.string().nullable().optional(),
  linkedWorkpackRunId: z.string().nullable().optional(),
  outcomeSummary: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const roleMetricSnapshotSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  roleId: z.string().min(1),
  routineId: z.string().nullable().optional(),
  autonomyTier: roleAutonomyTierSchema,
  healthState: roleHealthStateSchema,
  backlogDepth: z.number().int().nonnegative().default(0),
  backlogAgeMinutes: z.number().nonnegative().default(0),
  throughput: z.number().nonnegative().default(0),
  interventionRate: z.number().min(0).max(1).default(0),
  exceptionRate: z.number().min(0).max(1).default(0),
  slaHitRate: z.number().min(0).max(1).default(0),
  qualityScore: z.number().min(0).max(1).default(0),
  replayPassRate: z.number().min(0).max(1).default(0),
  improvementVelocity: z.number().nonnegative().default(0),
  checkpointFreshnessMinutes: z.number().nonnegative().default(0),
  checkpointFreshnessTier: roleCheckpointFreshnessTierSchema.default("fresh"),
  recoveryChurn: z.number().int().nonnegative().default(0),
  budgetBurn: z.number().nonnegative().default(0),
  blockerCodes: z.array(z.string()).default([]),
  generatedAt: z.string().datetime(),
});

export const roleExceptionBindingSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  roleId: z.string().min(1),
  routineId: z.string().nullable().optional(),
  routineRunId: z.string().nullable().optional(),
  messageId: z.string().nullable().optional(),
  handoffId: z.string().nullable().optional(),
  workpackExceptionId: z.string().min(1),
  triageOwnerRoleId: z.string().nullable().optional(),
  escalationTargetRoleId: z.string().nullable().optional(),
  nextAction: z.enum([
    "retry",
    "remap",
    "review",
    "escalate",
    "downgrade",
    "approve",
  ]).default("review"),
  operatorActionState: z.enum(["pending", "in_progress", "completed", "review_required"]).default("pending"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const roleImprovementProposalSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  roleId: z.string().min(1),
  routineId: z.string().nullable().optional(),
  targetType: roleImprovementTargetSchema,
  riskClass: roleRiskClassSchema,
  authorityImpact: roleAuthorityImpactSchema.default("none"),
  expectedBenefit: z.string().min(1),
  evidenceRefs: z.array(z.string()).default([]),
  suggestedChange: jsonRecordSchema.default({}),
  autoApplyEligible: z.boolean().default(false),
  status: z.enum(["pending", "approved", "rejected", "auto_applied", "blocked"]).default("pending"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const rolePromotionGateSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  roleId: z.string().min(1),
  routineId: z.string().nullable().optional(),
  currentAutonomyTier: roleAutonomyTierSchema,
  recommendedDecision: rolePromotionDecisionSchema,
  reasonCodes: z.array(z.string()).default([]),
  replayPassRate: z.number().min(0).max(1).default(0),
  exceptionRate: z.number().min(0).max(1).default(0),
  kpiMissStreak: z.number().int().nonnegative().default(0),
  checkpointFreshnessMinutes: z.number().nonnegative().default(0),
  workpackIncidentBlocked: z.boolean().default(false),
  workpackReadinessOk: z.boolean().default(false),
  authorityDeltaDetected: z.boolean().default(false),
  requiresReview: z.boolean().default(false),
  evaluatedAt: z.string().datetime(),
});

export const roleRoutineQueueItemSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  roleId: z.string().min(1),
  routineId: z.string().min(1),
  triggerSource: roleRoutineTriggerTypeSchema,
  workpackFamily: z.string().nullable().optional(),
  triggerWindowKey: z.string().nullable().optional(),
  eventKey: z.string().nullable().optional(),
  partitionKey: z.string().nullable().optional(),
  idempotencyKey: z.string().min(1),
  concurrencyPolicy: roleRoutineConcurrencyPolicySchema,
  status: roleQueueItemStatusSchema.default("queued"),
  claimState: roleQueueClaimStateSchema.default("available"),
  claimantId: z.string().nullable().optional(),
  claimedAt: z.string().datetime().nullable().optional(),
  heartbeatAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const roleApprovalRequestSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  roleId: z.string().min(1),
  routineId: z.string().nullable().optional(),
  routineRunId: z.string().nullable().optional(),
  subjectId: z.string().min(1),
  approvalType: roleApprovalTypeSchema,
  requesterRoleId: z.string().nullable().optional(),
  requesterUserId: z.number().int().nullable().optional(),
  approverScope: z.enum(["tenant_admin", "role_owner", "ops_console"]).default("tenant_admin"),
  quorum: z.number().int().positive().default(1),
  status: roleApprovalStatusSchema.default("pending"),
  allowedDecisions: z.array(z.enum(["approve", "reject", "downgrade", "freeze"])).default(["approve", "reject"]),
  expiresAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable().optional(),
});

export const roleMemoryItemSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  roleId: z.string().min(1),
  routineId: z.string().nullable().optional(),
  routineRunId: z.string().nullable().optional(),
  memoryClass: roleMemoryClassSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  relatedRefs: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(1),
  governance: roleContextGovernanceSchema,
  archivedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const roleRecordTypeValues = [
  "role_blueprint",
  "role_agent",
  "role_contract",
  "role_workpack_binding",
  "role_routine",
  "role_routine_run",
  "role_checkpoint",
  "role_message",
  "role_handoff",
  "role_metric_snapshot",
  "role_exception_binding",
  "role_improvement_proposal",
  "role_promotion_gate",
  "role_telemetry_event",
  "role_incident_record",
  "role_routine_queue_item",
  "role_approval_request",
  "role_memory_item",
] as const;

export const roleRecordTypeSchema = z.enum(roleRecordTypeValues);

export type RoleBlueprint = z.infer<typeof roleBlueprintSchema>;
export type RoleAgent = z.infer<typeof roleAgentSchema>;
export type RoleContract = z.infer<typeof roleContractSchema>;
export type RoleWorkpackBinding = z.infer<typeof roleWorkpackBindingSchema>;
export type RoleRoutine = z.infer<typeof roleRoutineSchema>;
export type RoleRoutineRun = z.infer<typeof roleRoutineRunSchema>;
export type RoleRoutineRunStatus = z.infer<typeof roleRoutineRunStatusSchema>;
export type RoleCheckpoint = z.infer<typeof roleCheckpointSchema>;
export type CheckpointRecoveryState = z.infer<typeof checkpointRecoveryStateSchema>;
export type RoleMessage = z.infer<typeof roleMessageSchema>;
export type RoleHandoff = z.infer<typeof roleHandoffSchema>;
export type RoleMetricSnapshot = z.infer<typeof roleMetricSnapshotSchema>;
export type RoleExceptionBinding = z.infer<typeof roleExceptionBindingSchema>;
export type RoleImprovementProposal = z.infer<typeof roleImprovementProposalSchema>;
export type RolePromotionGate = z.infer<typeof rolePromotionGateSchema>;
export type RoleRoutineQueueItem = z.infer<typeof roleRoutineQueueItemSchema>;
export type RoleApprovalRequest = z.infer<typeof roleApprovalRequestSchema>;
export type RoleMemoryItem = z.infer<typeof roleMemoryItemSchema>;
export type RoleRecordType = z.infer<typeof roleRecordTypeSchema>;
export type RoleAutonomyTier = z.infer<typeof roleAutonomyTierSchema>;
export type RolePromotionDecision = z.infer<typeof rolePromotionDecisionSchema>;
export type RoleVisibilityClass = z.infer<typeof roleVisibilityClassSchema>;
export type RoleHealthState = z.infer<typeof roleHealthStateSchema>;
export type RoleApprovalStatus = z.infer<typeof roleApprovalStatusSchema>;

export function buildDefaultRoleContextGovernance(
  overrides: Partial<z.infer<typeof roleContextGovernanceSchema>> = {},
): z.infer<typeof roleContextGovernanceSchema> {
  return roleContextGovernanceSchema.parse({
    trustClass: "internal",
    retentionTier: "standard",
    redactionState: "redacted",
    visibilityClass: "owner_full",
    legalHold: false,
    expiresAt: null,
    ...overrides,
  });
}

export function requiresNewRoleContractVersion(current: RoleContract, next: RoleContract): boolean {
  if (current.status !== "active") {
    return false;
  }

  const currentMaterial = {
    missionStatement: current.missionStatement,
    kpiTargets: current.kpiTargets,
    authorityEnvelope: current.authorityEnvelope,
    workpackBindingIds: current.workpackBindingIds,
    visibilityMatrix: current.visibilityMatrix,
  };
  const nextMaterial = {
    missionStatement: next.missionStatement,
    kpiTargets: next.kpiTargets,
    authorityEnvelope: next.authorityEnvelope,
    workpackBindingIds: next.workpackBindingIds,
    visibilityMatrix: next.visibilityMatrix,
  };

  return JSON.stringify(currentMaterial) !== JSON.stringify(nextMaterial);
}

export function sanitizeRoleSensitivePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return sanitizeSensitiveRecord(payload);
}
