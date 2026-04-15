import { z } from "zod";

import { workpackDomainPackValues } from "./workpackDomainPacks";

const jsonRecordSchema = z.record(z.string(), z.unknown());

export const workpackLifecycleStateValues = [
  "draft",
  "clarification_needed",
  "needs_review",
  "ready",
  "simulating",
  "supervised",
  "autonomous",
  "paused",
  "retired",
  "archived",
] as const;

export const autonomyModeValues = ["draft", "supervised", "autonomous"] as const;
export const promotionStateValues = ["unpromoted", "candidate", "approved", "promoted", "reverted", "blocked"] as const;
export const workpackRunStatusValues = ["queued", "running", "awaiting_approval", "succeeded", "failed", "cancelled", "blocked"] as const;
export const simulationStatusValues = ["queued", "running", "passed", "failed", "needs_revision", "blocked", "inconclusive"] as const;
export const exceptionReasonCategoryValues = [
  "operational",
  "transient",
  "connector_auth",
  "policy_boundary",
  "ambiguity",
  "drift",
  "schema_mismatch",
  "irreversible_action",
] as const;
export const sideEffectClassValues = ["read_only", "bounded_write", "external_write", "irreversible", "financial", "privileged"] as const;
export const caseSourceTypeValues = [
  "document",
  "chat_thread",
  "case_study",
  "sop",
  "workflow",
  "workflow_export",
  "local_file",
  "url",
  "screenshot",
  "spreadsheet",
  "browser_trace",
  "screen_recording",
] as const;
export const workpackRuntimePathValues = ["workflow", "skill", "browser", "hybrid", "agency", "desktop_local", "worker_fabric"] as const;
export const connectorValidationStatusValues = ["draft", "validated", "stale", "blocked"] as const;
export const connectorScopePostureValues = ["missing", "narrow", "sufficient", "over_broad"] as const;
export const idempotencyModeValues = ["none", "connector_key", "effect_journal", "single_attempt"] as const;
export const retryDispositionValues = ["safe_retry", "single_attempt", "blocked"] as const;
export const replayModeValues = ["inspection_only", "dry_run", "requires_fresh_run"] as const;
export const artifactSensitivityClassValues = ["internal", "pii", "financial", "restricted"] as const;
export const evidenceAccessScopeValues = ["tenant", "ops", "benchmark_candidate", "benchmark_shared"] as const;
export const evidenceRetentionTierValues = ["ephemeral", "standard", "extended", "regulated"] as const;
export const evidenceRedactionStateValues = ["summary_only", "redacted", "de_identified", "unscrubbed"] as const;
export const workpackLocalityHintValues = ["none", "desktop", "worker_fabric"] as const;
export const runStepStatusValues = ["planned", "queued", "running", "succeeded", "blocked", "failed", "skipped"] as const;
export const workpackRunTriggerValues = ["manual", "scheduled", "event", "role_agent"] as const;
export const workpackScheduleStatusValues = ["draft", "active", "paused", "error", "retired"] as const;
export const workpackSimulationModeValues = ["fixture", "masked_history", "synthetic", "trace_replay"] as const;
export const connectorIntrospectionSourceValues = ["manual", "desktop_host", "managed_runtime"] as const;
export const intakeExtractionFieldKeyValues = [
  "goal",
  "actors",
  "target_systems",
  "trigger_conditions",
  "inputs_outputs",
  "recurring_steps",
  "exceptions_failure_modes",
  "policy_constraints",
  "data_sensitivity",
  "connector_requirements",
  "evaluation_criteria",
] as const;
export const clarificationStatusValues = ["pending", "answered", "dismissed"] as const;
export const exceptionActionValues = [
  "approve",
  "reject",
  "retry",
  "downgrade_autonomy",
  "remap_connector",
  "regenerate_workpack",
  "escalate_admin",
  "mark_false_positive",
] as const;
export const replayDiffCategoryValues = [
  "missing_step",
  "extra_step",
  "step_order_drift",
  "output_drift",
  "approval_drift",
  "connector_auth_mismatch",
  "schema_mismatch",
  "browser_layout_instability",
  "policy_boundary_violation",
  "transient_failure",
  "incident_interrupted",
  "fixture_unavailable",
] as const;

export const workpackLifecycleStateSchema = z.enum(workpackLifecycleStateValues);
export const autonomyModeSchema = z.enum(autonomyModeValues);
export const promotionStateSchema = z.enum(promotionStateValues);
export const workpackRunStatusSchema = z.enum(workpackRunStatusValues);
export const simulationStatusSchema = z.enum(simulationStatusValues);
export const exceptionReasonCategorySchema = z.enum(exceptionReasonCategoryValues);
export const sideEffectClassSchema = z.enum(sideEffectClassValues);
export const caseSourceTypeSchema = z.enum(caseSourceTypeValues);
export const workpackRuntimePathSchema = z.enum(workpackRuntimePathValues);
export const connectorValidationStatusSchema = z.enum(connectorValidationStatusValues);
export const connectorScopePostureSchema = z.enum(connectorScopePostureValues);
export const idempotencyModeSchema = z.enum(idempotencyModeValues);
export const retryDispositionSchema = z.enum(retryDispositionValues);
export const replayModeSchema = z.enum(replayModeValues);
export const artifactSensitivityClassSchema = z.enum(artifactSensitivityClassValues);
export const evidenceAccessScopeSchema = z.enum(evidenceAccessScopeValues);
export const evidenceRetentionTierSchema = z.enum(evidenceRetentionTierValues);
export const evidenceRedactionStateSchema = z.enum(evidenceRedactionStateValues);
export const workpackDomainPackSchema = z.enum(workpackDomainPackValues);
export const workpackLocalityHintSchema = z.enum(workpackLocalityHintValues);
export const runStepStatusSchema = z.enum(runStepStatusValues);
export const workpackRunTriggerSchema = z.enum(workpackRunTriggerValues);
export const workpackScheduleStatusSchema = z.enum(workpackScheduleStatusValues);
export const workpackSimulationModeSchema = z.enum(workpackSimulationModeValues);
export const connectorIntrospectionSourceSchema = z.enum(connectorIntrospectionSourceValues);
export const intakeExtractionFieldKeySchema = z.enum(intakeExtractionFieldKeyValues);
export const clarificationStatusSchema = z.enum(clarificationStatusValues);
export const exceptionActionSchema = z.enum(exceptionActionValues);
export const replayDiffCategorySchema = z.enum(replayDiffCategoryValues);

export const evidenceGovernanceSchema = z.object({
  sensitivityClass: artifactSensitivityClassSchema,
  accessScope: evidenceAccessScopeSchema,
  retentionTier: evidenceRetentionTierSchema,
  redactionState: evidenceRedactionStateSchema,
  expiresAt: z.string().datetime().nullable().optional(),
});

export const sourceTraceSchema = z.object({
  sourceId: z.string().min(1),
  sourceType: caseSourceTypeSchema,
  originSurface: z.string().min(1),
  label: z.string().min(1),
  referenceId: z.string().nullable().optional(),
});

export const localFileReferenceSchema = z.object({
  deviceId: z.string().nullable().optional(),
  rootLabel: z.string().nullable().optional(),
  rootPath: z.string().nullable().optional(),
  path: z.string().min(1),
  metadataSummary: z.string().default(""),
  previewAvailable: z.boolean().default(false),
  snippetAvailable: z.boolean().default(false),
});

export const caseSourceSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  type: caseSourceTypeSchema,
  title: z.string().min(1),
  referenceId: z.string().nullable().optional(),
  sourceText: z.string().default(""),
  summary: z.string().default(""),
  trace: z.array(sourceTraceSchema).default([]),
  localFileRef: localFileReferenceSchema.nullable().optional(),
  governance: evidenceGovernanceSchema,
  createdAt: z.string().datetime(),
});

export const workpackExtractedFieldSchema = z.object({
  key: intakeExtractionFieldKeySchema,
  label: z.string().min(1),
  valueSummary: z.string().default(""),
  structuredValue: z.unknown().optional(),
  confidence: z.number().min(0).max(1).default(0),
  inferred: z.boolean().default(true),
  sourceIds: z.array(z.string()).default([]),
  requiresClarification: z.boolean().default(false),
});

export const workpackClarificationQuestionSchema = z.object({
  id: z.string().min(1),
  fieldKey: intakeExtractionFieldKeySchema,
  prompt: z.string().min(1),
  reason: z.string().min(1),
  suggestedAnswer: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0),
  status: clarificationStatusSchema.default("pending"),
  answer: z.string().nullable().optional(),
  sourceIds: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const workpackLocalFileIntelligenceSchema = z.object({
  available: z.boolean().default(false),
  sourceDeviceId: z.string().nullable().optional(),
  parserStatus: z.enum(["ready", "degraded", "unavailable", "unknown"]).default("unknown"),
  capabilities: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});

export const workpackIdempotencySchema = z.object({
  mode: idempotencyModeSchema,
  effectKey: z.string().nullable().optional(),
  retryDisposition: retryDispositionSchema,
  replayMode: replayModeSchema,
});

export const workpackStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  objective: z.string().min(1),
  expectedOutcome: z.string().min(1),
  preferredRuntimePath: workpackRuntimePathSchema,
  allowedFallbackPaths: z.array(workpackRuntimePathSchema).default([]),
  requiredConnectorFamilies: z.array(z.string()).default([]),
  sideEffectClass: sideEffectClassSchema,
  requiresReplay: z.boolean().default(true),
  requiresApproval: z.boolean().default(false),
  localityHint: workpackLocalityHintSchema.default("none"),
  idempotency: workpackIdempotencySchema,
  metadata: jsonRecordSchema.default({}),
});

export const playbookSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  description: z.string().default(""),
  domainPack: workpackDomainPackSchema,
  sourceIds: z.array(z.string()).default([]),
  extractedFields: z.array(workpackExtractedFieldSchema).default([]),
  clarificationQueue: z.array(workpackClarificationQuestionSchema).default([]),
  localFileIntelligence: workpackLocalFileIntelligenceSchema.default({}),
  steps: z.array(workpackStepSchema).min(1),
  createdAt: z.string().datetime(),
});

export const connectorFieldMappingSchema = z.object({
  sourceField: z.string().min(1),
  targetField: z.string().min(1),
  required: z.boolean().default(true),
  sideEffectClass: sideEffectClassSchema.default("read_only"),
});

export const connectorMapSchema = z.object({
  id: z.string().min(1),
  workpackId: z.string().min(1),
  versionId: z.string().min(1),
  connectorKey: z.string().min(1),
  connectorFamily: z.string().min(1),
  introspectionId: z.string().nullable().optional(),
  requiredScopes: z.array(z.string()).default([]),
  optionalScopes: z.array(z.string()).default([]),
  grantedScopes: z.array(z.string()).default([]),
  fieldMappings: z.array(connectorFieldMappingSchema).default([]),
  validationStatus: connectorValidationStatusSchema.default("draft"),
  scopePosture: connectorScopePostureSchema.default("missing"),
  idempotencySupported: z.boolean().default(false),
  writeMode: retryDispositionSchema.default("blocked"),
  missingFields: z.array(z.string()).default([]),
  driftedFields: z.array(z.string()).default([]),
  samplePayload: jsonRecordSchema.default({}),
  lastValidatedAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const connectorIntrospectionSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  connectorKey: z.string().min(1),
  connectorFamily: z.string().min(1),
  availableFields: z.array(z.string()).default([]),
  fieldTypes: z.record(z.string(), z.string()).default({}),
  grantedScopes: z.array(z.string()).default([]),
  expiresAt: z.string().datetime().nullable().optional(),
  schemaVersion: z.string().nullable().optional(),
  supportsIdempotency: z.boolean().default(false),
  status: z.enum(["healthy", "stale", "unavailable"]).default("unavailable"),
  source: connectorIntrospectionSourceSchema,
  collectedAt: z.string().datetime(),
  sourceDeviceId: z.string().nullable().optional(),
});

export const workpackFixtureSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  payload: jsonRecordSchema.default({}),
  governance: evidenceGovernanceSchema,
});

export const workpackExecutionPlanSchema = z.object({
  workpackId: z.string().min(1),
  versionId: z.string().min(1),
  generatedAt: z.string().datetime(),
  routeReason: z.string().min(1),
  fixtureRequirements: z.object({
    requiresFixtures: z.boolean().default(true),
    requiresMaskedInputs: z.boolean().default(false),
  }),
  evidenceRequirements: z.object({
    requiredTraceDetail: z.enum(["standard", "full"]).default("standard"),
    promotionNeedsReplay: z.boolean().default(true),
  }),
  steps: z.array(workpackStepSchema).min(1),
});

export const workpackVersionSchema = z.object({
  id: z.string().min(1),
  workpackId: z.string().min(1),
  versionNumber: z.number().int().positive(),
  playbook: playbookSchema,
  executionPlan: workpackExecutionPlanSchema.nullable().optional(),
  connectorMaps: z.array(connectorMapSchema).default([]),
  connectorIntrospections: z.array(connectorIntrospectionSchema).default([]),
  fixtureCatalog: z.array(workpackFixtureSchema).default([]),
  compilerMetadata: jsonRecordSchema.default({}),
  publishedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});

export const workpackSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  goal: z.string().min(1),
  domainPack: workpackDomainPackSchema,
  lifecycleState: workpackLifecycleStateSchema,
  autonomyMode: autonomyModeSchema,
  promotionState: promotionStateSchema,
  currentVersionId: z.string().min(1),
  caseSourceIds: z.array(z.string()).default([]),
  policyProfile: jsonRecordSchema.default({}),
  runtimePreferenceHints: z.array(workpackRuntimePathSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const workpackRunStepSchema = z.object({
  stepId: z.string().min(1),
  title: z.string().min(1),
  runtimePath: workpackRuntimePathSchema,
  status: runStepStatusSchema,
  sideEffectClass: sideEffectClassSchema,
  effectKey: z.string().nullable().optional(),
  outputSummary: z.string().default(""),
  executionRef: z.object({
    provider: z.enum(["worker_job", "automation_job"]),
    executionId: z.string().min(1),
    runtimeType: z.string().nullable().optional(),
    jobType: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    queuedAt: z.string().datetime(),
  }).nullable().optional(),
});

export const workpackApprovalCheckpointSchema = z.object({
  stepId: z.string().min(1),
  reason: z.string().min(1),
  approved: z.boolean().default(false),
});

export const workpackArtifactReferenceSchema = z.object({
  artifactId: z.string().min(1),
  label: z.string().min(1),
  governance: evidenceGovernanceSchema,
  summary: z.string().default(""),
});

export const workpackConnectorSummarySchema = z.object({
  connectorFamily: z.string().min(1),
  status: connectorValidationStatusSchema,
  summary: z.string().default(""),
});

export const workpackRunSchema = z.object({
  id: z.string().min(1),
  workpackId: z.string().min(1),
  versionId: z.string().min(1),
  tenantId: z.string().min(1),
  trigger: workpackRunTriggerSchema.default("manual"),
  triggerSource: z.string().default("control_plane"),
  scheduleId: z.string().nullable().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable().optional(),
  status: workpackRunStatusSchema,
  autonomyMode: autonomyModeSchema,
  plannedSteps: z.array(workpackStepSchema).default([]),
  actualSteps: z.array(workpackRunStepSchema).default([]),
  approvalCheckpoints: z.array(workpackApprovalCheckpointSchema).default([]),
  artifactReferences: z.array(workpackArtifactReferenceSchema).default([]),
  connectorSummaries: z.array(workpackConnectorSummarySchema).default([]),
  notes: z.string().default(""),
});

export const simulationRunSchema = z.object({
  id: z.string().min(1),
  workpackId: z.string().min(1),
  versionId: z.string().min(1),
  tenantId: z.string().min(1),
  runId: z.string().nullable().optional(),
  mode: workpackSimulationModeSchema.default("fixture"),
  fixtureId: z.string().nullable().optional(),
  status: simulationStatusSchema,
  expectedSteps: z.array(workpackStepSchema).default([]),
  simulatedSteps: z.array(workpackRunStepSchema).default([]),
  diffSummary: z.array(z.string()).default([]),
  mismatchCategories: z.array(replayDiffCategorySchema).default([]),
  remediationPointers: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
});

export const workpackExceptionSchema = z.object({
  id: z.string().min(1),
  workpackId: z.string().min(1),
  versionId: z.string().min(1),
  runId: z.string().nullable().optional(),
  simulationRunId: z.string().nullable().optional(),
  reasonCategory: exceptionReasonCategorySchema,
  riskClass: z.enum(["low", "medium", "high", "critical"]),
  mismatchCategory: replayDiffCategorySchema.nullable().optional(),
  reasonCode: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  remediationPointer: z.string().min(1),
  nextAction: z.string().min(1),
  allowedActions: z.array(exceptionActionSchema).default([]),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable().optional(),
});

export const workpackScheduleSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workpackId: z.string().min(1),
  versionId: z.string().min(1),
  title: z.string().min(1),
  triggerType: z.enum(["cron", "interval", "event"]).default("interval"),
  cronExpression: z.string().nullable().optional(),
  intervalMinutes: z.number().int().positive().nullable().optional(),
  eventKey: z.string().nullable().optional(),
  targetAutonomyMode: autonomyModeSchema.default("supervised"),
  status: workpackScheduleStatusSchema.default("draft"),
  nextRunAt: z.string().datetime().nullable().optional(),
  lastRunAt: z.string().datetime().nullable().optional(),
  lastError: z.string().nullable().optional(),
  createdBy: z.number().int().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const metricSnapshotSchema = z.object({
  id: z.string().min(1),
  workpackId: z.string().min(1),
  versionId: z.string().min(1),
  generatedAt: z.string().datetime(),
  completionRate: z.number().min(0),
  successRate: z.number().min(0),
  interventionRate: z.number().min(0),
  exceptionRate: z.number().min(0),
  rollbackRate: z.number().min(0),
  throughputPerDay: z.number().min(0),
  averageCostPerRun: z.number().min(0),
  estimatedTimeSavedMinutes: z.number().min(0),
  policyBlockFrequency: z.number().min(0),
  promotionVelocity: z.number().min(0),
  slices: z.array(z.object({
    dimension: z.enum(["workpack", "team", "profession", "connector", "runtime", "risk_tier", "policy_profile"]),
    value: z.string().min(1),
    completionRate: z.number().min(0),
    interventionRate: z.number().min(0),
    exceptionRate: z.number().min(0),
    throughputPerDay: z.number().min(0),
    averageCostPerRun: z.number().min(0),
  })).default([]),
  recommendations: z.array(z.object({
    kind: z.enum(["new_workpack_candidate", "promotion_ready", "reduce_manual_handoff", "connector_hotspot"]),
    summary: z.string().min(1),
    workpackId: z.string().nullable().optional(),
  })).default([]),
});

export type EvidenceGovernance = z.infer<typeof evidenceGovernanceSchema>;
export type CaseSource = z.infer<typeof caseSourceSchema>;
export type SourceTrace = z.infer<typeof sourceTraceSchema>;
export type LocalFileReference = z.infer<typeof localFileReferenceSchema>;
export type Playbook = z.infer<typeof playbookSchema>;
export type WorkpackExtractedField = z.infer<typeof workpackExtractedFieldSchema>;
export type WorkpackClarificationQuestion = z.infer<typeof workpackClarificationQuestionSchema>;
export type WorkpackLocalFileIntelligence = z.infer<typeof workpackLocalFileIntelligenceSchema>;
export type WorkpackStep = z.infer<typeof workpackStepSchema>;
export type ConnectorMap = z.infer<typeof connectorMapSchema>;
export type ConnectorIntrospection = z.infer<typeof connectorIntrospectionSchema>;
export type WorkpackFixture = z.infer<typeof workpackFixtureSchema>;
export type WorkpackExecutionPlan = z.infer<typeof workpackExecutionPlanSchema>;
export type WorkpackVersion = z.infer<typeof workpackVersionSchema>;
export type Workpack = z.infer<typeof workpackSchema>;
export type WorkpackRun = z.infer<typeof workpackRunSchema>;
export type WorkpackRunStep = z.infer<typeof workpackRunStepSchema>;
export type WorkpackApprovalCheckpoint = z.infer<typeof workpackApprovalCheckpointSchema>;
export type WorkpackArtifactReference = z.infer<typeof workpackArtifactReferenceSchema>;
export type WorkpackConnectorSummary = z.infer<typeof workpackConnectorSummarySchema>;
export type WorkpackException = z.infer<typeof workpackExceptionSchema>;
export type SimulationRun = z.infer<typeof simulationRunSchema>;
export type WorkpackSchedule = z.infer<typeof workpackScheduleSchema>;
export type MetricSnapshot = z.infer<typeof metricSnapshotSchema>;
export type AutonomyMode = z.infer<typeof autonomyModeSchema>;
export type PromotionState = z.infer<typeof promotionStateSchema>;
export type WorkpackLifecycleState = z.infer<typeof workpackLifecycleStateSchema>;
export type WorkpackRunStatus = z.infer<typeof workpackRunStatusSchema>;
export type SimulationStatus = z.infer<typeof simulationStatusSchema>;
export type ExceptionReasonCategory = z.infer<typeof exceptionReasonCategorySchema>;
export type ReplayDiffCategory = z.infer<typeof replayDiffCategorySchema>;
export type SideEffectClass = z.infer<typeof sideEffectClassSchema>;
export type CaseSourceType = z.infer<typeof caseSourceTypeSchema>;
export type WorkpackRuntimePath = z.infer<typeof workpackRuntimePathSchema>;
export type ConnectorValidationStatus = z.infer<typeof connectorValidationStatusSchema>;
export type ConnectorScopePosture = z.infer<typeof connectorScopePostureSchema>;

export function buildDefaultEvidenceGovernance(
  overrides: Partial<EvidenceGovernance> = {},
): EvidenceGovernance {
  return {
    sensitivityClass: "internal",
    accessScope: "tenant",
    retentionTier: "standard",
    redactionState: "summary_only",
    ...overrides,
  };
}

const SECRET_KEY_PATTERN = /(password|token|secret|apikey|api_key)/i;

export function sanitizeSensitiveRecord(value: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      next[key] = "[REDACTED]";
      continue;
    }
    if (Array.isArray(entry)) {
      next[key] = entry.map((item) => (
        item && typeof item === "object" && !Array.isArray(item)
          ? sanitizeSensitiveRecord(item as Record<string, unknown>)
          : item
      ));
      continue;
    }
    if (entry && typeof entry === "object") {
      next[key] = sanitizeSensitiveRecord(entry as Record<string, unknown>);
      continue;
    }
    next[key] = entry;
  }
  return next;
}

export function isEvidenceShareableBeyondTenant(governance: EvidenceGovernance): boolean {
  return governance.redactionState === "de_identified" && governance.accessScope !== "tenant";
}
