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
  "media_production",
] as const;

export const AGENT_RUNTIME_ORIGIN_SURFACES = [
  "chat",
  "team",
  "responses",
  "media_studio",
  "media_production",
  "marketplace_capture",
  "media_studio_production",
  "media_studio_video_shot",
  "storyboard_review",
  "video_edit",
  "workflow",
  "unknown",
] as const;

export const AGENT_RUNTIME_ENTRY_POINTS = [
  "chat_turn",
  "team_step",
  "responses_call",
  "enhance_prompt",
  "execute_custom_skill",
  "marketplace_auto_review_stage",
  "system",
] as const;

export const AGENT_RUNTIME_ENGINES = ["legacy", "openai_agents"] as const;
export const AGENT_RUNTIME_MODES = ["legacy", "shadow", "active"] as const;
export const AGENT_RUNTIME_STATUSES = [
  "completed",
  "paused",
  "cancelled",
  "failed",
  "running",
] as const;

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

export const MEDIA_PRODUCTION_ORIGIN_SURFACES = [
  "marketplace_capture",
  "media_studio_production",
  "media_studio_video_shot",
  "storyboard_review",
  "video_edit",
] as const;

export const MEDIA_PRODUCTION_CREDIT_CATEGORIES = [
  "llm_planning",
  "llm_verification",
  "llm_visual_qa",
  "llm_audio_qa",
  "llm_repair",
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
export const AgentRuntimeEntryPointSchema = z.enum(AGENT_RUNTIME_ENTRY_POINTS);
export const AgentRuntimeEngineSchema = z.enum(AGENT_RUNTIME_ENGINES);
export const AgentRuntimeModeSchema = z.enum(AGENT_RUNTIME_MODES);
export const AgentRuntimeStatusSchema = z.enum(AGENT_RUNTIME_STATUSES);
export const ReviewVerdictStatusSchema = z.enum(REVIEW_VERDICT_STATUSES);
export const RuntimeTerminalReasonSchema = z.enum(RUNTIME_TERMINAL_REASONS);
export const AgentContextTrustLevelSchema = z.enum(AGENT_CONTEXT_TRUST_LEVELS);
export const MediaProductionOriginSurfaceSchema = z.enum(
  MEDIA_PRODUCTION_ORIGIN_SURFACES
);
export const MediaProductionCreditCategorySchema = z.enum(
  MEDIA_PRODUCTION_CREDIT_CATEGORIES
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
  return (
    Number.isInteger(version) &&
    version >= minimumCompatible &&
    version <= current
  );
}

function planContextValue(
  planContext: Record<string, unknown> | null | undefined,
  key: string
): unknown {
  if (!planContext || typeof planContext !== "object") return undefined;
  const rawInput = planContext.input;
  if (rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)) {
    const inputValue = (rawInput as Record<string, unknown>)[key];
    if (inputValue !== undefined) return inputValue;
  }
  return planContext[key];
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every(item => rightSet.has(item));
}

function allStringsInSet(values: string[], allowed: Set<string>): boolean {
  return values.every(value => allowed.has(value));
}

function outputSchemaRef(candidate: AgentCapabilityManifest): string | null {
  const schema = candidate.outputSchema;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return null;
  }
  const record = schema as Record<string, unknown>;
  const ref = record.schemaRef ?? record.artifactKind;
  return typeof ref === "string" && ref.length > 0 ? ref : null;
}

const RuntimeContractVersionFieldSchema = z
  .number()
  .int()
  .refine(
    value =>
      isSupportedVersion(
        value,
        CURRENT_RUNTIME_CONTRACT_VERSION,
        MINIMUM_COMPATIBLE_RUNTIME_CONTRACT_VERSION
      ),
    "unsupported_contract_version"
  );

const TraceSchemaVersionFieldSchema = z
  .number()
  .int()
  .refine(
    value =>
      isSupportedVersion(
        value,
        CURRENT_TRACE_SCHEMA_VERSION,
        MINIMUM_COMPATIBLE_TRACE_SCHEMA_VERSION
      ),
    "unsupported_trace_schema_version"
  );

const CheckpointSchemaVersionFieldSchema = z
  .number()
  .int()
  .refine(
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

export const AgentsGatewayInvocationMetadataSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  surface: z.literal("media_production"),
  originSurface: MediaProductionOriginSurfaceSchema,
  productionProjectId: z.string().min(1).nullable().optional(),
  productionRunId: z.string().min(1),
  agentRunId: z.string().min(1),
  agentName: z.string().min(1),
  agentRole: z.string().min(1),
  stageKey: z.string().min(1),
  stepId: z.string().min(1),
  attemptId: z.string().min(1),
  modelPolicyId: z.string().min(1),
  selectedModelId: z.string().min(1),
  creditCategory: MediaProductionCreditCategorySchema,
  idempotencyKey: z.string().min(1),
  creditReservationRef: z.string().min(1),
  creditLedgerRef: z.string().min(1),
  creditPayerRef: z.string().min(1),
  preflightSnapshotRef: z.string().min(1),
  creditAuditRef: z.string().min(1),
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
  supportedOriginSurfaces: z.array(AgentRuntimeOriginSurfaceSchema).default([]),
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

export const ProductionAgentsSdkAllowedHandoffSchema = z.object({
  fromAgent: z.string().min(1),
  toAgent: z.string().min(1),
  reasonCodes: z.array(z.string().min(1)).min(1),
  allowedToolNames: z.array(z.string().min(1)).default([]),
  canWidenReadScope: z.literal(false),
  canWidenWriteScope: z.literal(false),
  canChangeCreditPolicy: z.literal(false),
});

export const ProductionAgentsSdkAllowedToolSchema = z.object({
  name: z.string().min(1),
  category: z.enum([
    "read_state",
    "write_checkpoint",
    "credit_estimate",
    "credit_reservation",
    "schedule_media",
    "attach_artifact_ref",
    "qa_classifier",
    "handoff_projection",
    "render_schedule",
  ]),
  mutating: z.boolean(),
  nodeExecuted: z.boolean(),
  requiresApprovalRef: z.boolean(),
  creditCategory: MediaProductionCreditCategorySchema.nullable().optional(),
  idempotencyKey: z.string().min(1),
  timeoutMs: z.number().int().positive(),
  maxCallsPerAttempt: z.number().int().positive(),
  outputTrust: z.enum(["untrusted", "node_verified_ref"]),
});

export const ProductionAgentsSdkHostedCapabilitiesSchema = z.object({
  webSearch: z.literal(false),
  fileSearch: z.literal(false),
  computerUse: z.literal(false),
  codeInterpreter: z.literal(false),
  imageGeneration: z.literal(false),
  audioGeneration: z.literal(false),
  videoGeneration: z.literal(false),
  remoteMcp: z.literal(false),
  shell: z.literal(false),
});

export const ProductionAgentsSdkOutputSchemaSchema = z.object({
  artifactKind: z.string().min(1),
  schemaVersion: z.string().min(1),
  required: z.boolean(),
});

export const ProductionAgentsSdkSessionPolicySchema = z.object({
  persistRawSdkSession: z.literal(false),
  checkpointRefsOnly: z.literal(true),
  resumeCursorRef: z.string().min(1).nullable().optional(),
  maxSessionEventBytes: z.number().int().positive(),
});

export const ProductionAgentsSdkTracePolicySchema = z.object({
  captureSensitiveInputOutput: z.literal(false),
  externalSdkTraceExport: z.enum(["disabled", "development_only"]),
  redactionProfileId: z.string().min(1),
  maxTraceEventBytes: z.number().int().positive(),
  platformTraceEventRefs: z.array(z.string().min(1)).default([]),
});

export const ProductionAgentsSdkStreamPolicySchema = z.object({
  normalizeEvents: z.literal(true),
  stableEventIds: z.literal(true),
  duplicateEventBehavior: z.literal("idempotent_noop"),
});

export const ProductionAgentsSdkCapabilityManifestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  runId: z.string().min(1),
  stageKey: z.string().min(1),
  attemptId: z.string().min(1),
  manifestHash: z.string().min(1),
  allowedAgents: z.array(z.string().min(1)).min(1),
  allowedHandoffs: z.array(ProductionAgentsSdkAllowedHandoffSchema).default([]),
  allowedTools: z.array(ProductionAgentsSdkAllowedToolSchema).default([]),
  hostedSdkCapabilities: ProductionAgentsSdkHostedCapabilitiesSchema,
  outputSchemas: z.array(ProductionAgentsSdkOutputSchemaSchema).default([]),
  sessionPolicy: ProductionAgentsSdkSessionPolicySchema,
  tracePolicy: ProductionAgentsSdkTracePolicySchema,
  streamPolicy: ProductionAgentsSdkStreamPolicySchema,
  approvedByNodeAt: z.string().min(1),
});

export const ReviewVerdictSchema = z.object({
  status: ReviewVerdictStatusSchema,
  score: z.number().min(0).max(1).nullable().optional(),
  issues: z.array(z.string().min(1)).default([]),
  recommendation: z.string().min(1).nullable().optional(),
  checkpointRequired: z.boolean().optional(),
});

export const RuntimeArtifactSchema = z.object({
  artifactId: z.string().min(1),
  artifactType: z.string().min(1),
  contentRef: z.string().min(1).nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
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

export const AgentRuntimeEventSchema =
  AgentRuntimeContractVersionsSchema.extend({
    eventId: z.string().min(1),
    eventName: z.string().min(1),
    surface: AgentRuntimeSurfaceSchema,
    requestId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    sequence: z.number().int().nonnegative(),
    sourceComponent: z.string().min(1),
    traceId: z.string().min(1).nullable().optional(),
    stepId: z.string().min(1).nullable().optional(),
    stepKey: z.string().min(1).nullable().optional(),
    attemptId: z.string().min(1).nullable().optional(),
    manifestHash: z.string().min(1).nullable().optional(),
    sdkVersion: z.string().min(1),
    adapterVersion: z.string().min(1),
    redactedPayload: z.record(z.unknown()).default({}),
  }).superRefine((value, ctx) => {
    if (value.surface !== "media_production") return;
    const checks: Array<[boolean, (string | number)[], string]> = [
      [
        Boolean(value.stepKey),
        ["stepKey"],
        "media_production_event_stage_key_required",
      ],
      [
        Boolean(value.attemptId),
        ["attemptId"],
        "media_production_event_attempt_id_required",
      ],
      [
        Boolean(value.manifestHash),
        ["manifestHash"],
        "media_production_event_manifest_hash_required",
      ],
    ];
    for (const [passes, path, message] of checks) {
      if (!passes) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
      }
    }
  });

export const AgentRuntimeTraceEventSchema = AgentRuntimeEventSchema;

export const AgentRuntimeCheckpointSchema =
  AgentRuntimeContractVersionsSchema.extend({
    checkpointId: z.string().min(1),
    surface: AgentRuntimeSurfaceSchema,
    requestId: z.string().min(1),
    tenantId: z.string().min(1),
    resumeCursor: z.string().min(1).nullable().optional(),
    stepKey: z.string().min(1).nullable().optional(),
    attemptId: z.string().min(1).nullable().optional(),
    manifestHash: z.string().min(1).nullable().optional(),
    status: z.enum(["pending", "resumed", "cancelled"]),
    originalAttemptId: z.string().min(1).nullable().optional(),
    linkedAttemptId: z.string().min(1).nullable().optional(),
    checkpointPayload: z.record(z.unknown()).default({}),
  }).superRefine((value, ctx) => {
    if (value.surface !== "media_production") return;
    const checks: Array<[boolean, (string | number)[], string]> = [
      [
        Boolean(value.stepKey),
        ["stepKey"],
        "media_production_checkpoint_stage_key_required",
      ],
      [
        Boolean(value.attemptId),
        ["attemptId"],
        "media_production_checkpoint_attempt_id_required",
      ],
      [
        Boolean(value.manifestHash),
        ["manifestHash"],
        "media_production_checkpoint_manifest_hash_required",
      ],
    ];
    for (const [passes, path, message] of checks) {
      if (!passes) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
      }
    }
  });

export const AgentRuntimeRequestSchema =
  AgentRuntimeContractVersionsSchema.extend({
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
    gatewayInvocationMetadata:
      AgentsGatewayInvocationMetadataSchema.nullable().optional(),
    productionAgentsSdkCapabilityManifest:
      ProductionAgentsSdkCapabilityManifestSchema.nullable().optional(),
  }).superRefine((value, ctx) => {
    if (value.executionEnvelope.tenantId !== value.tenantId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["executionEnvelope", "tenantId"],
        message: "execution_envelope_tenant_mismatch",
      });
    }
    if (value.surface === "media_production") {
      if (!value.gatewayInvocationMetadata) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["gatewayInvocationMetadata"],
          message: "media_production_gateway_metadata_required",
        });
      }
      if (!value.productionAgentsSdkCapabilityManifest) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["productionAgentsSdkCapabilityManifest"],
          message: "media_production_capability_manifest_required",
        });
      }
      if (!value.stepContext?.stepKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stepContext", "stepKey"],
          message: "media_production_stage_key_required",
        });
      }
      if (!value.stepContext?.attemptId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stepContext", "attemptId"],
          message: "media_production_attempt_id_required",
        });
      }
      const metadata = value.gatewayInvocationMetadata;
      const manifest = value.productionAgentsSdkCapabilityManifest;
      if (metadata) {
        const expectedModelId =
          value.modelConfig.resolvedGatewayModelId ?? value.modelConfig.modelId;
        const checks: Array<[boolean, (string | number)[], string]> = [
          [
            metadata.tenantId === value.tenantId,
            ["gatewayInvocationMetadata", "tenantId"],
            "gateway_metadata_tenant_mismatch",
          ],
          [
            metadata.idempotencyKey === value.idempotencyKey,
            ["gatewayInvocationMetadata", "idempotencyKey"],
            "gateway_metadata_idempotency_mismatch",
          ],
          [
            metadata.originSurface === value.originSurface,
            ["gatewayInvocationMetadata", "originSurface"],
            "gateway_metadata_origin_mismatch",
          ],
          [
            !value.runId || metadata.agentRunId === value.runId,
            ["gatewayInvocationMetadata", "agentRunId"],
            "gateway_metadata_run_mismatch",
          ],
          [
            metadata.selectedModelId === expectedModelId,
            ["gatewayInvocationMetadata", "selectedModelId"],
            "gateway_metadata_model_mismatch",
          ],
        ];
        if (value.stepContext?.stepId) {
          checks.push([
            metadata.stepId === value.stepContext.stepId,
            ["gatewayInvocationMetadata", "stepId"],
            "gateway_metadata_step_mismatch",
          ]);
        }
        if (value.stepContext?.stepKey) {
          checks.push([
            metadata.stageKey === value.stepContext.stepKey,
            ["gatewayInvocationMetadata", "stageKey"],
            "gateway_metadata_stage_mismatch",
          ]);
        }
        if (value.stepContext?.attemptId) {
          checks.push([
            metadata.attemptId === value.stepContext.attemptId,
            ["gatewayInvocationMetadata", "attemptId"],
            "gateway_metadata_attempt_mismatch",
          ]);
        }
        for (const [passes, path, message] of checks) {
          if (!passes) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path,
              message,
            });
          }
        }
      }
      if (metadata && manifest) {
        const planContext =
          value.planContext &&
          typeof value.planContext === "object" &&
          !Array.isArray(value.planContext)
            ? (value.planContext as Record<string, unknown>)
            : undefined;
        const expectedManifestHashValue =
          planContextValue(planContext, "capabilityManifestHash") ??
          planContextValue(planContext, "manifestHash");
        const expectedManifestHash =
          typeof expectedManifestHashValue === "string"
            ? expectedManifestHashValue
            : undefined;
        const requestAgentSet = new Set(value.allowedAgents);
        const envelopeAgentSet = new Set(value.executionEnvelope.allowedAgents);
        const manifestAgentSet = new Set(manifest.allowedAgents);
        const requestToolSet = new Set(value.allowedTools);
        const envelopeToolSet = new Set(value.executionEnvelope.allowedTools);
        const manifestToolNames = new Set(
          manifest.allowedTools.map(tool => tool.name)
        );
        const candidateOutputSchemaRefs = new Set(
          value.candidateSkillManifests
            .map(candidate => outputSchemaRef(candidate))
            .filter((ref): ref is string => Boolean(ref))
        );
        const checks: Array<[boolean, (string | number)[], string]> = [
          [
            manifest.tenantId === value.tenantId,
            ["productionAgentsSdkCapabilityManifest", "tenantId"],
            "production_manifest_tenant_mismatch",
          ],
          [
            manifest.userId === metadata.userId,
            ["productionAgentsSdkCapabilityManifest", "userId"],
            "production_manifest_user_mismatch",
          ],
          [
            manifest.runId === metadata.agentRunId,
            ["productionAgentsSdkCapabilityManifest", "runId"],
            "production_manifest_run_mismatch",
          ],
          [
            manifest.stageKey === metadata.stageKey,
            ["productionAgentsSdkCapabilityManifest", "stageKey"],
            "production_manifest_stage_mismatch",
          ],
          [
            manifest.attemptId === metadata.attemptId,
            ["productionAgentsSdkCapabilityManifest", "attemptId"],
            "production_manifest_attempt_mismatch",
          ],
          [
            !expectedManifestHash ||
              manifest.manifestHash === expectedManifestHash,
            ["productionAgentsSdkCapabilityManifest", "manifestHash"],
            "production_manifest_hash_mismatch",
          ],
          [
            manifest.tracePolicy.externalSdkTraceExport === "disabled",
            ["productionAgentsSdkCapabilityManifest", "tracePolicy"],
            "production_manifest_external_trace_export_disabled_required",
          ],
          [
            sameStringSet(
              value.allowedAgents,
              value.executionEnvelope.allowedAgents
            ),
            ["executionEnvelope", "allowedAgents"],
            "media_production_allowed_agents_envelope_mismatch",
          ],
          [
            sameStringSet(value.allowedAgents, manifest.allowedAgents),
            ["productionAgentsSdkCapabilityManifest", "allowedAgents"],
            "production_manifest_extra_agent_authority",
          ],
          [
            Boolean(metadata.agentRole) &&
              requestAgentSet.has(metadata.agentRole) &&
              envelopeAgentSet.has(metadata.agentRole) &&
              manifestAgentSet.has(metadata.agentRole),
            ["gatewayInvocationMetadata", "agentRole"],
            "gateway_metadata_agent_role_not_allowed",
          ],
          [
            sameStringSet(
              value.allowedTools,
              value.executionEnvelope.allowedTools
            ),
            ["executionEnvelope", "allowedTools"],
            "media_production_allowed_tools_envelope_mismatch",
          ],
          [
            sameStringSet(value.allowedTools, Array.from(manifestToolNames)),
            ["productionAgentsSdkCapabilityManifest", "allowedTools"],
            "production_manifest_extra_tool_authority",
          ],
          [
            allStringsInSet(
              manifest.outputSchemas.map(schema => schema.artifactKind),
              candidateOutputSchemaRefs
            ),
            ["productionAgentsSdkCapabilityManifest", "outputSchemas"],
            "production_manifest_extra_output_schema_authority",
          ],
        ];
        for (const [passes, path, message] of checks) {
          if (!passes) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path,
              message,
            });
          }
        }
        const missingManifestTools = value.allowedTools.filter(
          toolName => !manifestToolNames.has(toolName)
        );
        if (missingManifestTools.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["productionAgentsSdkCapabilityManifest", "allowedTools"],
            message: `production_manifest_allowed_tools_missing_limits: ${missingManifestTools.join(", ")}`,
          });
        }
      }
    }
  });

export const AgentRuntimeResponseSchema =
  AgentRuntimeContractVersionsSchema.extend({
    status: AgentRuntimeStatusSchema,
    selectedAgentName: z.string().min(1).nullable().optional(),
    selectedSkillSlug: z.string().min(1).nullable().optional(),
    providerId: z.string().min(1).nullable().optional(),
    modelId: z.string().min(1).nullable().optional(),
    gatewayRouteId: z.string().min(1).nullable().optional(),
    resolvedGatewayModelId: z.string().min(1).nullable().optional(),
    finalOutput: z.unknown().nullable().optional(),
    artifacts: z.array(RuntimeArtifactSchema).default([]),
    actingPersona: AgentRuntimePersonaSnapshotSchema.nullable().optional(),
    stepAssignment: AgentRuntimeStepAssignmentSchema.nullable().optional(),
    toolCallsMade: z.array(z.string().min(1)).default([]),
    handoffsExecuted: z.array(z.string().min(1)).default([]),
    reviewVerdict: ReviewVerdictSchema.nullable().optional(),
    repairInstructions: z.array(z.string().min(1)).default([]),
    evidenceRefs: z.array(z.string().min(1)).default([]),
    events: z.array(AgentRuntimeEventSchema).default([]),
    traceId: z.string().min(1).nullable().optional(),
    traceMetadata: z.record(z.unknown()).default({}),
    adapterVersion: z.string().min(1),
    sdkVersion: z.string().min(1),
    checkpoint: AgentRuntimeCheckpointSchema.nullable().optional(),
    terminalReason: RuntimeTerminalReasonSchema.nullable().optional(),
    nextAction: z.string().min(1).nullable().optional(),
    stepId: z.string().min(1).nullable().optional(),
    attemptId: z.string().min(1).nullable().optional(),
    checkpointMetadata: z.record(z.unknown()).nullable().optional(),
    eventSequenceMetadata: z.record(z.unknown()).default({}),
    stepLinks: z.array(AgentRuntimeStepLinkSchema).default([]),
  });

export type AgentRuntimeSurface = z.infer<typeof AgentRuntimeSurfaceSchema>;
export type AgentRuntimeOriginSurface = z.infer<
  typeof AgentRuntimeOriginSurfaceSchema
>;
export type AgentRuntimeEntryPoint = z.infer<
  typeof AgentRuntimeEntryPointSchema
>;
export type AgentRuntimeEngine = z.infer<typeof AgentRuntimeEngineSchema>;
export type AgentRuntimeMode = z.infer<typeof AgentRuntimeModeSchema>;
export type AgentRuntimeStatus = z.infer<typeof AgentRuntimeStatusSchema>;
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
export type AgentsGatewayInvocationMetadata = z.infer<
  typeof AgentsGatewayInvocationMetadataSchema
>;
export type AgentCapabilityManifest = z.infer<
  typeof AgentCapabilityManifestSchema
>;
export type ProductionAgentsSdkCapabilityManifest = z.infer<
  typeof ProductionAgentsSdkCapabilityManifestSchema
>;
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;
export type RuntimeArtifact = z.infer<typeof RuntimeArtifactSchema>;
export type RuntimeTerminalReason = z.infer<typeof RuntimeTerminalReasonSchema>;
export type AgentRuntimeStepLink = z.infer<typeof AgentRuntimeStepLinkSchema>;
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
