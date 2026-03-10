import { z } from "zod";

export const BROWSER_APPROVAL_TTL_DEFAULT_SECONDS = 300;
export const BROWSER_APPROVAL_TTL_MIN_SECONDS = 60;
export const BROWSER_APPROVAL_TTL_MAX_SECONDS = 900;
export const BROWSER_REVIEW_CADENCE_DEFAULT_DAYS = 90;
export const BROWSER_APPROVAL_DOM_DRIFT_THRESHOLD = 0.2;

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

export const browserPolicyDecisionSchema = z.enum(browserPolicyDecisionValues);
export const browserActionClassSchema = z.enum(browserActionClassValues);
export const browserPageSensitivitySchema = z.enum(browserPageSensitivityValues);
export const browserIframeTrustTierSchema = z.enum(browserIframeTrustTierValues);

export const browserPolicyConfigSchema = z.object({
  enabled: z.boolean().default(true),
  enforcementMode: z.enum(["observe", "read_only", "draft", "commit", "expanded"]).default("observe"),
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
export type BrowserApprovalPayload = z.infer<typeof browserApprovalPayloadSchema>;
export type BrowserPolicyDecision = z.infer<typeof browserPolicyDecisionSchema>;
export type BrowserActionClass = z.infer<typeof browserActionClassSchema>;
export type BrowserPageSensitivity = z.infer<typeof browserPageSensitivitySchema>;
export type BrowserIframeTrustTier = z.infer<typeof browserIframeTrustTierSchema>;
export type BrowserPolicyDecisionEnvelope = z.infer<typeof browserPolicyDecisionEnvelopeSchema>;

export function normalizeBrowserPolicyConfig(
  config: Partial<BrowserPolicyConfig> | null | undefined,
): BrowserPolicyConfig {
  return browserPolicyConfigSchema.parse(config ?? {});
}

export function normalizeBrowserWorkflowEntitlement(
  entitlement: Partial<BrowserWorkflowEntitlement>,
): BrowserWorkflowEntitlement {
  return browserWorkflowEntitlementSchema.parse(entitlement);
}

export function validateBrowserApprovalTtlSeconds(ttl: number | null | undefined): number {
  return browserWorkflowEntitlementConfigSchema.shape.approvalTtlSeconds.parse(
    ttl ?? BROWSER_APPROVAL_TTL_DEFAULT_SECONDS,
  );
}
