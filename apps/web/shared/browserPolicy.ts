import { z } from "zod";

export const BROWSER_APPROVAL_TTL_DEFAULT_SECONDS = 300;
export const BROWSER_APPROVAL_TTL_MIN_SECONDS = 60;
export const BROWSER_APPROVAL_TTL_MAX_SECONDS = 900;
export const BROWSER_REVIEW_CADENCE_DEFAULT_DAYS = 90;
export const BROWSER_APPROVAL_DOM_DRIFT_THRESHOLD = 0.2;
export const browserPolicyEnforcementModeValues = [
  "observe",
  "read_only",
  "draft",
  "commit",
  "expanded",
] as const;

export const browserPolicyDecisionValues = [
  "allow",
  "allow_with_redaction",
  "require_approval",
  "deny",
  "escalate_for_review",
] as const;

export const browserActionClassValues = [
  "read",
  "draft",
  "commit",
  "restricted",
] as const;

export const browserPageSensitivityValues = [
  "none",
  "auth",
  "financial",
  "admin",
  "sensitive_data",
  "communication",
  "code",
] as const;

export const browserIframeTrustTierValues = [
  "same_origin",
  "same_site",
  "cross_site",
  "sandboxed",
] as const;

export const browserPolicyApprovalStateValues = [
  "not_required",
  "approved",
  "pending",
  "context_changed",
  "revoked",
  "expired",
  "rejected",
] as const;

export const browserPolicyOutcomeValues = [
  "blocked",
  "executed",
  "failed",
] as const;
export const browserPolicyBlockedTransferValues = [
  "download",
  "upload",
  "clipboard",
  "external_send",
] as const;

export const browserPolicyDecisionSchema = z.enum(browserPolicyDecisionValues);
export const browserActionClassSchema = z.enum(browserActionClassValues);
export const browserPageSensitivitySchema = z.enum(browserPageSensitivityValues);
export const browserIframeTrustTierSchema = z.enum(browserIframeTrustTierValues);
export const browserPolicyApprovalStateSchema = z.enum(browserPolicyApprovalStateValues);
export const browserPolicyOutcomeSchema = z.enum(browserPolicyOutcomeValues);
export const browserPolicyEnforcementModeSchema = z.enum(browserPolicyEnforcementModeValues);
export const browserPolicyBlockedTransferSchema = z.enum(browserPolicyBlockedTransferValues);

export const browserPolicyConfigSchema = z.object({
  enabled: z.boolean().default(true),
  enforcementMode: browserPolicyEnforcementModeSchema.default("observe"),
  defaultApprovalTtlSeconds: z
    .number()
    .int()
    .min(BROWSER_APPROVAL_TTL_MIN_SECONDS)
    .max(BROWSER_APPROVAL_TTL_MAX_SECONDS)
    .default(BROWSER_APPROVAL_TTL_DEFAULT_SECONDS),
  reviewCadenceDays: z.number().int().positive().default(BROWSER_REVIEW_CADENCE_DEFAULT_DAYS),
  killSwitchEnabled: z.boolean().default(false),
  requireTamperEvidence: z.boolean().default(true),
  evidenceRetentionDays: z.number().int().positive().default(365),
  allowedDomains: z.array(z.string()).default([]),
  visionModel: z.string().min(1).default("gpt-4o"),
  seededDefault: z.boolean().default(false),
});

export const browserPolicyUserCustomizationSchema = z.object({
  allowPersonalDomainSubset: z.boolean().default(true),
  allowModeCap: z.boolean().default(true),
  allowTransferBlocks: z.boolean().default(true),
  allowApprovalTtlCap: z.boolean().default(true),
  allowActionApprovalEscalation: z.boolean().default(true),
  allowPreferredVisionModel: z.boolean().default(false),
});

export const browserPolicyUserProfileSchema = z.object({
  enabled: z.boolean().default(true),
  modeCap: browserPolicyEnforcementModeSchema.nullable().default(null),
  allowedDomainsSubset: z.array(z.string()).default([]),
  blockedTransfers: z.array(browserPolicyBlockedTransferSchema).default([]),
  requireApprovalForActionClasses: z.array(browserActionClassSchema).default([]),
  approvalTtlSecondsCap: z
    .number()
    .int()
    .min(BROWSER_APPROVAL_TTL_MIN_SECONDS)
    .max(BROWSER_APPROVAL_TTL_MAX_SECONDS)
    .nullable()
    .default(null),
  preferredVisionModel: z.string().min(1).nullable().default(null),
  notifyOnApprovalRequests: z.boolean().default(true),
  notifyOnPolicyIncidents: z.boolean().default(true),
});

export const browserPolicyRuleSchema = z.object({
  id: z.number().int().optional(),
  priority: z.number().int().default(100),
  enabled: z.boolean().default(true),
  description: z.string().optional(),
  match: z.record(z.string(), z.unknown()).default({}),
  decision: browserPolicyDecisionSchema,
  reasonCode: z.string().min(1),
  actionClass: browserActionClassSchema.optional(),
});

export const browserWorkflowEntitlementConfigSchema = z.object({
  approvalTtlSeconds: z
    .number()
    .int()
    .min(BROWSER_APPROVAL_TTL_MIN_SECONDS)
    .max(BROWSER_APPROVAL_TTL_MAX_SECONDS)
    .default(BROWSER_APPROVAL_TTL_DEFAULT_SECONDS),
  maxExtractedRecords: z.number().int().positive().optional(),
  maxExternalSends: z.number().int().positive().optional(),
  maxOriginTransitions: z.number().int().positive().optional(),
  maxNonReadActions: z.number().int().positive().optional(),
});

export const browserWorkflowEntitlementSchema = z.object({
  tenantId: z.string().min(1),
  workflowId: z.number().int().nonnegative(),
  workflowName: z.string().min(1),
  enabled: z.boolean().default(true),
  expiresAt: z.date().nullable().optional(),
  reviewCadenceDays: z.number().int().positive().default(BROWSER_REVIEW_CADENCE_DEFAULT_DAYS),
  allowedCapabilities: z.array(z.string()).default([]),
  forbiddenCapabilities: z.array(z.string()).default([]),
  allowedDataClasses: z.array(z.string()).default(["public", "internal"]),
  config: browserWorkflowEntitlementConfigSchema.default({}),
});

export const browserApprovalPayloadSchema = z.object({
  actionDescription: z.string().min(1),
  actionDigest: z.string().min(1),
  payloadPreviewHash: z.string().min(1),
  domFingerprint: z.string().min(1),
  screenshotHash: z.string().min(1).optional(),
  targetOrigin: z.string().min(1),
  executionId: z.string().min(1),
  reasonCodes: z.array(z.string()).default([]),
  approvalTtlSeconds: z
    .number()
    .int()
    .min(BROWSER_APPROVAL_TTL_MIN_SECONDS)
    .max(BROWSER_APPROVAL_TTL_MAX_SECONDS),
});

export const browserPolicyExecutionContextSchema = z.object({
  config: browserPolicyConfigSchema,
  rules: z.array(browserPolicyRuleSchema).default([]),
  entitlement: browserWorkflowEntitlementSchema,
  userCustomization: browserPolicyUserCustomizationSchema.optional(),
  userProfile: browserPolicyUserProfileSchema.optional(),
});

export const browserPolicyAuditMetadataSchema = z.object({
  traceId: z.string().min(1).optional(),
  eventHash: z.string().min(1),
  previousEventHash: z.string().min(1).nullable().optional(),
  jsonlPersisted: z.boolean(),
  dbPersisted: z.boolean(),
  auditWriteFailed: z.boolean().default(false),
});

export const browserPolicyIncidentStatusSchema = z.object({
  approvalState: browserPolicyApprovalStateSchema,
  outcome: browserPolicyOutcomeSchema,
  operatorMessage: z.string().min(1),
});

export const browserPolicyDecisionEnvelopeSchema = z.object({
  version: z.literal("2026-03-10"),
  tenantId: z.string().min(1),
  userId: z.number().int().nonnegative().optional(),
  workflowId: z.number().int().nonnegative().nullable().optional(),
  executionId: z.string().min(1).optional(),
  traceId: z.string().min(1).optional(),
  actionType: z.string().min(1),
  actionClass: browserActionClassSchema,
  pageSensitivity: browserPageSensitivitySchema,
  decision: browserPolicyDecisionSchema,
  reasonCodes: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  riskScore: z.number().min(0).max(100),
  evidence: z.object({
    actionDigest: z.string().min(1),
    payloadPreviewHash: z.string().min(1).optional(),
    domFingerprint: z.string().min(1).optional(),
    screenshotHash: z.string().min(1).optional(),
  }),
  approval: z
    .object({
      required: z.boolean(),
      approvalId: z.string().min(1).optional(),
      approvalTtlSeconds: z.number().int().min(BROWSER_APPROVAL_TTL_MIN_SECONDS).max(BROWSER_APPROVAL_TTL_MAX_SECONDS).optional(),
    })
    .optional(),
});

export type BrowserPolicyConfig = z.infer<typeof browserPolicyConfigSchema>;
export type BrowserPolicyRule = z.infer<typeof browserPolicyRuleSchema>;
export type BrowserWorkflowEntitlement = z.infer<typeof browserWorkflowEntitlementSchema>;
export type BrowserWorkflowEntitlementConfig = z.infer<typeof browserWorkflowEntitlementConfigSchema>;
export type BrowserPolicyEnforcementMode = z.infer<typeof browserPolicyEnforcementModeSchema>;
export type BrowserPolicyBlockedTransfer = z.infer<typeof browserPolicyBlockedTransferSchema>;
export type BrowserPolicyUserCustomization = z.infer<typeof browserPolicyUserCustomizationSchema>;
export type BrowserPolicyUserProfile = z.infer<typeof browserPolicyUserProfileSchema>;
export type BrowserApprovalPayload = z.infer<typeof browserApprovalPayloadSchema>;
export type BrowserPolicyExecutionContext = z.infer<typeof browserPolicyExecutionContextSchema>;
export type BrowserPolicyDecision = z.infer<typeof browserPolicyDecisionSchema>;
export type BrowserActionClass = z.infer<typeof browserActionClassSchema>;
export type BrowserPageSensitivity = z.infer<typeof browserPageSensitivitySchema>;
export type BrowserIframeTrustTier = z.infer<typeof browserIframeTrustTierSchema>;
export type BrowserPolicyApprovalState = z.infer<typeof browserPolicyApprovalStateSchema>;
export type BrowserPolicyOutcome = z.infer<typeof browserPolicyOutcomeSchema>;
export type BrowserPolicyAuditMetadata = z.infer<typeof browserPolicyAuditMetadataSchema>;
export type BrowserPolicyIncidentStatus = z.infer<typeof browserPolicyIncidentStatusSchema>;
export type BrowserPolicyDecisionEnvelope = z.infer<typeof browserPolicyDecisionEnvelopeSchema>;

export function normalizeBrowserPolicyConfig(
  config: Partial<BrowserPolicyConfig> | null | undefined,
): BrowserPolicyConfig {
  return browserPolicyConfigSchema.parse(config ?? {});
}

export function normalizeBrowserPolicyUserCustomization(
  customization: Partial<BrowserPolicyUserCustomization> | null | undefined,
): BrowserPolicyUserCustomization {
  return browserPolicyUserCustomizationSchema.parse(customization ?? {});
}

export function normalizeBrowserPolicyUserProfile(
  profile: Partial<BrowserPolicyUserProfile> | null | undefined,
): BrowserPolicyUserProfile {
  return browserPolicyUserProfileSchema.parse(profile ?? {});
}

export function normalizeBrowserWorkflowEntitlement(
  entitlement: Partial<BrowserWorkflowEntitlement>,
): BrowserWorkflowEntitlement {
  return browserWorkflowEntitlementSchema.parse(entitlement);
}

export function normalizeBrowserPolicyExecutionContext(
  context: Partial<BrowserPolicyExecutionContext>,
): BrowserPolicyExecutionContext {
  return browserPolicyExecutionContextSchema.parse(context);
}

export function validateBrowserApprovalTtlSeconds(ttl: number | null | undefined): number {
  return browserWorkflowEntitlementConfigSchema.shape.approvalTtlSeconds.parse(
    ttl ?? BROWSER_APPROVAL_TTL_DEFAULT_SECONDS,
  );
}
