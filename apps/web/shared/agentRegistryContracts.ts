import { z } from "zod";

import { evidenceRedactionStateSchema, evidenceRedactionStateValues, evidenceRetentionTierSchema, evidenceRetentionTierValues, sanitizeSensitiveRecord, sideEffectClassSchema, sideEffectClassValues } from "./workpackContracts";

const jsonRecordSchema = z.record(z.string(), z.unknown());

export const agentRegistryKindValues = [
  "planner",
  "specialist",
  "reviewer",
  "approver",
  "analyst",
  "connector_operator",
  "knowledge_agent",
  "supervisor",
  "role_agent",
] as const;

export const agentRegistryRolloutStateValues = [
  "draft",
  "shadow",
  "canary",
  "supervised",
  "general",
  "frozen",
] as const;

export const agentRegistryVersionStatusValues = [
  "draft",
  "published",
  "review_required",
  "frozen",
  "retired",
] as const;

export const agentRegistryPromotionDecisionValues = [
  "promote",
  "freeze",
  "revert",
  "hold",
] as const;

export const agentRegistryMemoryOutcomeValues = [
  "success",
  "partial_success",
  "failure",
  "blocked",
] as const;

export const agentRegistryKindSchema = z.enum(agentRegistryKindValues);
export const agentRegistryRolloutStateSchema = z.enum(agentRegistryRolloutStateValues);
export const agentRegistryVersionStatusSchema = z.enum(agentRegistryVersionStatusValues);
export const agentRegistryPromotionDecisionSchema = z.enum(agentRegistryPromotionDecisionValues);
export const agentRegistryMemoryOutcomeSchema = z.enum(agentRegistryMemoryOutcomeValues);

export const agentRegistryMemoryScopeSchema = z.object({
  accessScope: z.enum(["tenant", "team", "queue", "registry", "version"]).default("registry"),
  visibility: z.enum(["owner_full", "delegated_minimum", "shared_reference", "operator_review", "redacted_summary"]).default("operator_review"),
  retentionTier: evidenceRetentionTierSchema.default("standard"),
  redactionState: evidenceRedactionStateSchema.default("redacted"),
  legalHold: z.boolean().default(false),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const agentRegistryBudgetPolicySchema = z.object({
  perRunCredits: z.number().nonnegative().optional(),
  perHourCredits: z.number().nonnegative().optional(),
  perQueueCredits: z.number().nonnegative().optional(),
  perTenantCredits: z.number().nonnegative().optional(),
  maxConcurrentRuns: z.number().int().positive().optional(),
  sideEffectCeiling: sideEffectClassSchema.default("bounded_write"),
});

export const agentRegistryEscalationPolicySchema = z.object({
  failClosed: z.boolean().default(true),
  approvalRequiredFor: z.array(z.string()).default([]),
  escalationTriggers: z.array(z.string()).default([]),
  escalationTargets: z.array(z.string()).default([]),
});

export const agentRegistryManifestSchema = z.object({
  registryKey: z.string().min(1),
  agentKind: agentRegistryKindSchema,
  title: z.string().min(1),
  description: z.string().default(""),
  owningTeamId: z.string().nullable().optional(),
  owningUserId: z.number().int().positive().nullable().optional(),
  modelFamilies: z.array(z.string()).default([]),
  metadata: jsonRecordSchema.default({}),
});

export const agentRegistryPolicyBundleSchema = z.object({
  purpose: z.string().min(1),
  supportedWorkDomains: z.array(z.string()).default([]),
  supportedToolClasses: z.array(z.string()).default([]),
  disallowedActionClasses: z.array(z.string()).default([]),
  memoryScope: agentRegistryMemoryScopeSchema,
  budgetPolicy: agentRegistryBudgetPolicySchema,
  escalationPolicy: agentRegistryEscalationPolicySchema,
  approvalRequirements: z.array(z.string()).default([]),
  modelCompatibility: z.array(z.string()).default([]),
  evaluationTargets: z.array(z.string()).default([]),
  outcomeMemoryHook: z.string().min(1),
  metadata: jsonRecordSchema.default({}),
});

export const agentRegistryVersionCreateSchema = z.object({
  tenantId: z.string().min(1),
  registryId: z.string().min(1),
  versionNumber: z.number().int().positive(),
  versionStatus: agentRegistryVersionStatusSchema.default("draft"),
  rolloutState: agentRegistryRolloutStateSchema.default("draft"),
  previousVersionId: z.string().nullable().optional(),
  isStable: z.boolean().default(false),
  reviewRequired: z.boolean().default(false),
  publishedAt: z.string().datetime().nullable().optional(),
  frozenAt: z.string().datetime().nullable().optional(),
  manifest: agentRegistryManifestSchema,
  policies: agentRegistryPolicyBundleSchema,
  rolloutBindings: z.array(z.object({
    tenantTargetId: z.string().nullable().optional(),
    teamTargetId: z.string().nullable().optional(),
    queueTargetId: z.string().nullable().optional(),
    workpackFamily: z.string().nullable().optional(),
    environment: z.string().nullable().optional(),
    shadowPercent: z.number().int().min(0).max(100).default(0),
    canaryPercent: z.number().int().min(0).max(100).default(0),
  })).default([]),
});

export const agentRegistryCreateSchema = z.object({
  tenantId: z.string().min(1),
  registryKey: z.string().min(1),
  agentKind: agentRegistryKindSchema,
  title: z.string().min(1),
  description: z.string().default(""),
  owningTeamId: z.string().nullable().optional(),
  owningUserId: z.number().int().positive().nullable().optional(),
  modelFamilies: z.array(z.string()).default([]),
  metadata: jsonRecordSchema.default({}),
});

export const agentRegistryResolutionRequestSchema = z.object({
  tenantId: z.string().min(1),
  registryId: z.string().min(1).optional(),
  registryKey: z.string().min(1).optional(),
  teamId: z.string().nullable().optional(),
  queueId: z.string().nullable().optional(),
  workpackFamily: z.string().nullable().optional(),
  environment: z.string().nullable().optional(),
  requestedToolClasses: z.array(z.string()).default([]),
  requestedActionClasses: z.array(z.string()).default([]),
  requestedModelFamily: z.string().nullable().optional(),
  workloadClass: z.string().nullable().optional(),
  requireApproval: z.boolean().default(false),
  allowDraftVersions: z.boolean().default(false),
  allowEvidencePreference: z.boolean().default(false),
});

export const agentRegistryResolutionCandidateSchema = z.object({
  versionId: z.string().min(1),
  versionNumber: z.number().int().positive(),
  versionStatus: agentRegistryVersionStatusSchema,
  rolloutState: agentRegistryRolloutStateSchema,
  selected: z.boolean().default(false),
  reasons: z.array(z.string()).default([]),
  evidenceSummary: z.object({
    runs: z.number().int().nonnegative().default(0),
    successRate: z.number().min(0).max(1).default(0),
  }).optional(),
});

export const agentRegistryResolutionResultSchema = z.object({
  registryId: z.string().min(1),
  registryKey: z.string().min(1),
  selectedVersionId: z.string().nullable(),
  selectedVersionNumber: z.number().int().nullable(),
  selectedVersionStatus: agentRegistryVersionStatusSchema.nullable(),
  selectedRolloutState: agentRegistryRolloutStateSchema.nullable(),
  stableVersionId: z.string().nullable(),
  eligibleVersionIds: z.array(z.string()).default([]),
  rejectedVersions: z.array(agentRegistryResolutionCandidateSchema).default([]),
  usedEvidencePreference: z.boolean().default(false),
  reason: z.string().default(""),
});

export const agentRegistryMemoryRecordSchema = z.object({
  tenantId: z.string().min(1),
  registryId: z.string().min(1),
  versionId: z.string().min(1),
  workloadClass: z.string().min(1),
  selectedModelFamily: z.string().nullable().optional(),
  outcome: agentRegistryMemoryOutcomeSchema,
  failureMode: z.string().nullable().optional(),
  operatorEdits: z.array(z.string()).default([]),
  improvementNotes: z.string().default(""),
  redactionState: evidenceRedactionStateSchema.default("redacted"),
  retentionTier: evidenceRetentionTierSchema.default("standard"),
  metadata: jsonRecordSchema.default({}),
});

export function sanitizeAgentRegistryMemoryRecord(input: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeSensitiveRecord(input);
  if (typeof sanitized.improvementNotes === "string") {
    sanitized.improvementNotes = sanitized.improvementNotes
      .replace(/api[_-]?key/gi, "[redacted]")
      .replace(/token/gi, "[redacted]")
      .replace(/secret/gi, "[redacted]")
      .replace(/password/gi, "[redacted]");
  }
  return sanitized;
}

export type AgentRegistryKind = z.infer<typeof agentRegistryKindSchema>;
export type AgentRegistryRolloutState = z.infer<typeof agentRegistryRolloutStateSchema>;
export type AgentRegistryVersionStatus = z.infer<typeof agentRegistryVersionStatusSchema>;
export type AgentRegistryPromotionDecision = z.infer<typeof agentRegistryPromotionDecisionSchema>;
export type AgentRegistryMemoryOutcome = z.infer<typeof agentRegistryMemoryOutcomeSchema>;
export type AgentRegistryManifest = z.infer<typeof agentRegistryManifestSchema>;
export type AgentRegistryPolicyBundle = z.infer<typeof agentRegistryPolicyBundleSchema>;
export type AgentRegistryCreateInput = z.infer<typeof agentRegistryCreateSchema>;
export type AgentRegistryVersionCreateInput = z.infer<typeof agentRegistryVersionCreateSchema>;
export type AgentRegistryResolutionRequest = z.infer<typeof agentRegistryResolutionRequestSchema>;
export type AgentRegistryResolutionResult = z.infer<typeof agentRegistryResolutionResultSchema>;
export type AgentRegistryMemoryRecord = z.infer<typeof agentRegistryMemoryRecordSchema>;
