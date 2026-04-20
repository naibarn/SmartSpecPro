import { z } from "zod";

export const CURRENT_RUNTIME_CONTRACT_VERSION = 2;
export const CURRENT_TRACE_SCHEMA_VERSION = 2;
export const CURRENT_CHECKPOINT_SCHEMA_VERSION = 2;
export const MINIMUM_COMPATIBLE_RUNTIME_CONTRACT_VERSION = 1;
export const MINIMUM_COMPATIBLE_TRACE_SCHEMA_VERSION = 1;
export const MINIMUM_COMPATIBLE_CHECKPOINT_SCHEMA_VERSION = 1;

export const AGENT_RUNTIME_SURFACES = [
  "chat",
  "team",
  "responses",
  "skill",
] as const;

export const AGENT_RUNTIME_ORIGIN_SURFACES = [
  "chat",
  "team",
  "responses",
  "media_studio",
  "workflow",
  "unknown",
] as const;

export const AGENT_RUNTIME_ENTRY_POINTS = [
  "chat_turn",
  "team_step",
  "responses_call",
  "enhance_prompt",
  "execute_custom_skill",
  "system",
] as const;

export const AGENT_RUNTIME_ENGINES = ["legacy", "openai_agents"] as const;
export const AGENT_RUNTIME_MODES = ["legacy", "shadow", "active"] as const;

export const REVIEW_VERDICT_STATUSES = [
  "pass",
  "fail",
  "needs_repair",
  "blocked",
] as const;

export const RUNTIME_TERMINAL_REASONS = [
  "plan_completed",
  "step_failed_retry_exhausted",
  "review_failed_retry_exhausted",
  "approval_required",
  "approval_rejected",
  "budget_exhausted",
  "timeout_step",
  "timeout_run",
  "tool_denied",
  "permission_mismatch",
  "gateway_unavailable",
  "runtime_error",
  "rollback_forced",
  "plan_incomplete_cap_reached",
] as const;

export const AGENT_CONTEXT_TRUST_LEVELS = [
  "trusted_platform",
  "tenant_authored",
  "retrieved_untrusted",
  "tool_generated_untrusted",
  "connector_generated_untrusted",
] as const;

export const AGENT_RUNTIME_STEP_LINK_TYPES = [
  "plan_summary",
  "plan_step",
  "owner_result",
  "review_result",
  "repair_result",
  "checkpoint",
  "terminal_result",
  "execution_trace",
] as const;

export const AGENT_RUNTIME_STEP_LINK_STATUSES = [
  "available",
  "pending",
] as const;

export const PERSONA_PROVENANCE_KINDS = [
  "conversation_override",
  "user_default",
  "tenant_default",
  "platform_default",
  "room_member_roster",
  "direct_request",
] as const;

export const TEAM_MEMBER_KINDS = [
  "assistant",
  "human",
  "external_connector",
  "system",
] as const;

export const AgentRuntimeSurfaceSchema = z.enum(AGENT_RUNTIME_SURFACES);
export const AgentRuntimeOriginSurfaceSchema = z.enum(
  AGENT_RUNTIME_ORIGIN_SURFACES
);
export const AgentRuntimeEntryPointSchema = z.enum(
  AGENT_RUNTIME_ENTRY_POINTS
);
export const AgentRuntimeEngineSchema = z.enum(AGENT_RUNTIME_ENGINES);
export const AgentRuntimeModeSchema = z.enum(AGENT_RUNTIME_MODES);
export const ReviewVerdictStatusSchema = z.enum(REVIEW_VERDICT_STATUSES);
export const RuntimeTerminalReasonSchema = z.enum(RUNTIME_TERMINAL_REASONS);
export const AgentContextTrustLevelSchema = z.enum(
  AGENT_CONTEXT_TRUST_LEVELS
);
export const AgentRuntimeStepLinkTypeSchema = z.enum(
  AGENT_RUNTIME_STEP_LINK_TYPES
);
export const AgentRuntimeStepLinkStatusSchema = z.enum(
  AGENT_RUNTIME_STEP_LINK_STATUSES
);
export const PersonaProvenanceKindSchema = z.enum(PERSONA_PROVENANCE_KINDS);
export const TeamMemberKindSchema = z.enum(TEAM_MEMBER_KINDS);

function isSupportedVersion(
  version: number,
  current: number,
  minimumCompatible: number
): boolean {
  return Number.isInteger(version) && version >= minimumCompatible && version <= current;
}

const RuntimeContractVersionFieldSchema = z.number().int().refine(
  value =>
    isSupportedVersion(
      value,
      CURRENT_RUNTIME_CONTRACT_VERSION,
      MINIMUM_COMPATIBLE_RUNTIME_CONTRACT_VERSION
    ),
  "unsupported_contract_version"
);

const TraceSchemaVersionFieldSchema = z.number().int().refine(
  value =>
    isSupportedVersion(
      value,
      CURRENT_TRACE_SCHEMA_VERSION,
      MINIMUM_COMPATIBLE_TRACE_SCHEMA_VERSION
    ),
  "unsupported_trace_schema_version"
);

const CheckpointSchemaVersionFieldSchema = z.number().int().refine(
  value =>
    isSupportedVersion(
      value,
      CURRENT_CHECKPOINT_SCHEMA_VERSION,
      MINIMUM_COMPATIBLE_CHECKPOINT_SCHEMA_VERSION
    ),
  "unsupported_checkpoint_schema_version"
);

export const AgentRuntimeContractVersionsSchema = z.object({
  runtimeContractVersion: RuntimeContractVersionFieldSchema,
  traceSchemaVersion: TraceSchemaVersionFieldSchema,
  checkpointSchemaVersion: CheckpointSchemaVersionFieldSchema,
});

export const AgentRuntimePersonaSnapshotSchema = z.object({
  personaId: z.string().min(1),
  displayLabel: z.string().min(1),
  nickname: z.string().min(1).nullable().optional(),
  provenance: PersonaProvenanceKindSchema,
  promptSegmentRef: z.string().min(1).nullable().optional(),
  guidanceSummary: z.string().min(1).nullable().optional(),
});

export const AgentRuntimeTeamMemberSnapshotSchema = z.object({
  memberId: z.string().min(1),
  memberKind: TeamMemberKindSchema,
  memberRole: z.string().min(1),
  personaId: z.string().min(1).nullable().optional(),
  displayLabel: z.string().min(1),
  personaDisplayLabel: z.string().min(1).nullable().optional(),
  isLead: z.boolean().default(false),
  preferredLanguage: z.string().min(1).nullable().optional(),
  personaGuidanceSummary: z.string().min(1).nullable().optional(),
});

export const AgentRuntimeStepAssignmentSchema = z.object({
  ownerMemberId: z.string().min(1),
  ownerPersonaId: z.string().min(1).nullable().optional(),
  ownerDisplayLabel: z.string().min(1).nullable().optional(),
  reviewerMemberId: z.string().min(1),
  reviewerPersonaId: z.string().min(1).nullable().optional(),
  reviewerDisplayLabel: z.string().min(1).nullable().optional(),
});

export const AgentExecutionEnvelopeSchema = z.object({
  envelopeId: z.string().min(1),
  tenantId: z.string().min(1),
  issuedAt: z.string().min(1),
  expiresAt: z.string().min(1),
  allowedTools: z.array(z.string().min(1)).default([]),
  allowedSkills: z.array(z.string().min(1)).default([]),
  allowedAgents: z.array(z.string().min(1)).default([]),
  sideEffectPolicy: z.enum([
    "read_only",
    "approval_required",
    "mutating_allowed",
  ]),
});

export const RuntimeModelConfigSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  gatewayRouteId: z.string().min(1).nullable().optional(),
  resolvedGatewayModelId: z.string().min(1).nullable().optional(),
});

export const AgentContextEvidenceItemSchema = z.object({
  artifactId: z.string().min(1),
  sourceType: z.string().min(1),
  origin: z.string().min(1),
  trustLevel: AgentContextTrustLevelSchema,
  sanitizationLevel: z.string().min(1),
  contentRef: z.string().min(1),
  tokenEstimate: z.number().int().nonnegative(),
  contextPackSlot: z.string().min(1).nullable().optional(),
  sourceRef: z.string().min(1).nullable().optional(),
  retrievalRecipeMetadata: z.record(z.unknown()).nullable().optional(),
});

export const AgentCapabilityManifestSchema = z.object({
  slug: z.string().min(1),
  manifestSchemaVersion: z.number().int().positive(),
  name: z.string().min(1),
  purpose: z.string().min(1),
  supportedSurfaces: z.array(AgentRuntimeSurfaceSchema).min(1),
  supportedOriginSurfaces: z
    .array(AgentRuntimeOriginSurfaceSchema)
    .default([]),
  supportedEntryPoints: z.array(AgentRuntimeEntryPointSchema).default([]),
  taskTypes: z.array(z.string().min(1)).min(1),
  requiredContext: z.array(z.string().min(1)).default([]),
  preferredContext: z.array(z.string().min(1)).default([]),
  inputSchema: z.record(z.unknown()).optional(),
  outputSchema: z.record(z.unknown()).optional(),
  supportedArtifactTypes: z.array(z.string().min(1)).default([]),
  requiredEvidenceKinds: z.array(z.string().min(1)).default([]),
  reviewChecklist: z.array(z.string().min(1)).default([]),
  failureModes: z.array(z.string().min(1)).default([]),
  doNotUseWhen: z.array(z.string().min(1)).default([]),
});

export const ReviewVerdictSchema = z.object({
  status: ReviewVerdictStatusSchema,
  score: z.number().min(0).max(1).nullable().optional(),
  issues: z.array(z.string().min(1)).default([]),
  recommendation: z.string().min(1).nullable().optional(),
  checkpointRequired: z.boolean().optional(),
});

export const AgentRuntimeStepLinkSchema = z.object({
  linkType: AgentRuntimeStepLinkTypeSchema,
  stepKey: z.string().min(1),
  attemptId: z.string().min(1).nullable().optional(),
  traceId: z.string().min(1).nullable().optional(),
  checkpointId: z.string().min(1).nullable().optional(),
  messageId: z.string().min(1).nullable().optional(),
  anchorId: z.string().min(1).nullable().optional(),
  label: z.string().min(1),
  isPrimary: z.boolean(),
  status: AgentRuntimeStepLinkStatusSchema,
});

export const StepExecutionRecordSchema = z.object({
  stepId: z.string().min(1),
  stepKey: z.string().min(1),
  attemptId: z.string().min(1),
  actorMemberId: z.string().min(1).nullable().optional(),
  actorPersonaId: z.string().min(1).nullable().optional(),
  status: z.string().min(1),
  traceId: z.string().min(1).nullable().optional(),
});

export const AgentRuntimeEventSchema = AgentRuntimeContractVersionsSchema.extend({
  eventId: z.string().min(1),
  eventType: z.string().min(1),
  surface: AgentRuntimeSurfaceSchema,
  requestId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  traceId: z.string().min(1).nullable().optional(),
  stepKey: z.string().min(1).nullable().optional(),
  attemptId: z.string().min(1).nullable().optional(),
});

export const AgentRuntimeTraceEventSchema = AgentRuntimeEventSchema.extend({
  redactedPayload: z.record(z.unknown()).default({}),
});

export const AgentRuntimeCheckpointSchema =
  AgentRuntimeContractVersionsSchema.extend({
    checkpointId: z.string().min(1),
    surface: AgentRuntimeSurfaceSchema,
    requestId: z.string().min(1),
    tenantId: z.string().min(1),
    resumeCursor: z.string().min(1).nullable().optional(),
    status: z.enum(["pending", "resumed", "cancelled"]),
  });

export const AgentRuntimeRequestSchema = AgentRuntimeContractVersionsSchema.extend(
  {
    surface: AgentRuntimeSurfaceSchema,
    originSurface: AgentRuntimeOriginSurfaceSchema.optional(),
    entryPoint: AgentRuntimeEntryPointSchema,
    tenantId: z.string().min(1),
    roomId: z.string().min(1).nullable().optional(),
    runId: z.string().min(1).nullable().optional(),
    messageId: z.string().min(1).nullable().optional(),
    requestId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    objective: z.string().min(1),
    planContext: z.record(z.unknown()).nullable().optional(),
    stepContext: z
      .object({
        stepId: z.string().min(1).nullable().optional(),
        stepKey: z.string().min(1).nullable().optional(),
        attemptId: z.string().min(1).nullable().optional(),
      })
      .nullable()
      .optional(),
    activePersonaId: z.string().min(1).nullable().optional(),
    personaSnapshot: AgentRuntimePersonaSnapshotSchema.nullable().optional(),
    teamMembers: z.array(AgentRuntimeTeamMemberSnapshotSchema).default([]),
    stepAssignment: AgentRuntimeStepAssignmentSchema.nullable().optional(),
    approvalCheckpointId: z.string().min(1).nullable().optional(),
    resumeCursor: z.string().min(1).nullable().optional(),
    structuredContextPackRef: z.string().min(1).nullable().optional(),
    contextEvidenceItems: z.array(AgentContextEvidenceItemSchema).default([]),
    candidateSkillManifests: z.array(AgentCapabilityManifestSchema).default([]),
    allowedTools: z.array(z.string().min(1)).default([]),
    allowedSkills: z.array(z.string().min(1)).default([]),
    allowedAgents: z.array(z.string().min(1)).default([]),
    completionPolicy: z.record(z.unknown()).default({}),
    reviewPolicy: z.record(z.unknown()).default({}),
    retryPolicy: z.record(z.unknown()).default({}),
    traceCorrelationIds: z
      .object({
        traceId: z.string().min(1).nullable().optional(),
        parentTraceId: z.string().min(1).nullable().optional(),
      })
      .default({}),
    sdkVersionConstraint: z.string().min(1).nullable().optional(),
    modelConfig: RuntimeModelConfigSchema,
    executionEnvelope: AgentExecutionEnvelopeSchema,
  }
);

export const AgentRuntimeResponseSchema = AgentRuntimeContractVersionsSchema.extend(
  {
    selectedAgentName: z.string().min(1),
    selectedSkillSlug: z.string().min(1).nullable().optional(),
    providerId: z.string().min(1),
    modelId: z.string().min(1),
    gatewayRouteId: z.string().min(1).nullable().optional(),
    resolvedGatewayModelId: z.string().min(1).nullable().optional(),
    actingPersona: AgentRuntimePersonaSnapshotSchema.nullable().optional(),
    stepAssignment: AgentRuntimeStepAssignmentSchema.nullable().optional(),
    toolCallsMade: z.array(z.string().min(1)).default([]),
    handoffsExecuted: z.array(z.string().min(1)).default([]),
    reviewVerdict: ReviewVerdictSchema.nullable().optional(),
    repairInstructions: z.array(z.string().min(1)).default([]),
    evidenceRefs: z.array(z.string().min(1)).default([]),
    traceId: z.string().min(1).nullable().optional(),
    adapterVersion: z.string().min(1),
    terminalReason: RuntimeTerminalReasonSchema.nullable().optional(),
    nextAction: z.string().min(1).nullable().optional(),
    stepId: z.string().min(1).nullable().optional(),
    attemptId: z.string().min(1).nullable().optional(),
    checkpointMetadata: z.record(z.unknown()).nullable().optional(),
    eventSequenceMetadata: z.record(z.unknown()).default({}),
    stepLinks: z.array(AgentRuntimeStepLinkSchema).default([]),
  }
);

export type AgentRuntimeSurface = z.infer<typeof AgentRuntimeSurfaceSchema>;
export type AgentRuntimeOriginSurface = z.infer<
  typeof AgentRuntimeOriginSurfaceSchema
>;
export type AgentRuntimeEntryPoint = z.infer<
  typeof AgentRuntimeEntryPointSchema
>;
export type AgentRuntimeEngine = z.infer<typeof AgentRuntimeEngineSchema>;
export type AgentRuntimeMode = z.infer<typeof AgentRuntimeModeSchema>;
export type AgentRuntimeContractVersions = z.infer<
  typeof AgentRuntimeContractVersionsSchema
>;
export type AgentRuntimePersonaSnapshot = z.infer<
  typeof AgentRuntimePersonaSnapshotSchema
>;
export type AgentRuntimeTeamMemberSnapshot = z.infer<
  typeof AgentRuntimeTeamMemberSnapshotSchema
>;
export type AgentRuntimeStepAssignment = z.infer<
  typeof AgentRuntimeStepAssignmentSchema
>;
export type AgentExecutionEnvelope = z.infer<
  typeof AgentExecutionEnvelopeSchema
>;
export type RuntimeModelConfig = z.infer<typeof RuntimeModelConfigSchema>;
export type AgentContextEvidenceItem = z.infer<
  typeof AgentContextEvidenceItemSchema
>;
export type AgentCapabilityManifest = z.infer<
  typeof AgentCapabilityManifestSchema
>;
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;
export type RuntimeTerminalReason = z.infer<
  typeof RuntimeTerminalReasonSchema
>;
export type AgentRuntimeStepLink = z.infer<
  typeof AgentRuntimeStepLinkSchema
>;
export type StepExecutionRecord = z.infer<typeof StepExecutionRecordSchema>;
export type AgentRuntimeEvent = z.infer<typeof AgentRuntimeEventSchema>;
export type AgentRuntimeTraceEvent = z.infer<
  typeof AgentRuntimeTraceEventSchema
>;
export type AgentRuntimeCheckpoint = z.infer<
  typeof AgentRuntimeCheckpointSchema
>;
export type AgentRuntimeRequest = z.infer<typeof AgentRuntimeRequestSchema>;
export type AgentRuntimeResponse = z.infer<typeof AgentRuntimeResponseSchema>;

export function isSupportedRuntimeContractVersion(version: number): boolean {
  return isSupportedVersion(
    version,
    CURRENT_RUNTIME_CONTRACT_VERSION,
    MINIMUM_COMPATIBLE_RUNTIME_CONTRACT_VERSION
  );
}

export function isSupportedTraceSchemaVersion(version: number): boolean {
  return isSupportedVersion(
    version,
    CURRENT_TRACE_SCHEMA_VERSION,
    MINIMUM_COMPATIBLE_TRACE_SCHEMA_VERSION
  );
}

export function isSupportedCheckpointSchemaVersion(version: number): boolean {
  return isSupportedVersion(
    version,
    CURRENT_CHECKPOINT_SCHEMA_VERSION,
    MINIMUM_COMPATIBLE_CHECKPOINT_SCHEMA_VERSION
  );
}

