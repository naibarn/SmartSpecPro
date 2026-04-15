"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.browserPolicyDecisionEnvelopeSchema = exports.browserPolicyIncidentStatusSchema = exports.browserPolicyAuditMetadataSchema = exports.browserPolicyExecutionContextSchema = exports.browserApprovalPayloadSchema = exports.browserWorkflowEntitlementSchema = exports.browserWorkflowEntitlementConfigSchema = exports.browserPolicyRuleSchema = exports.browserPolicyUserProfileSchema = exports.browserPolicyUserCustomizationSchema = exports.browserPolicyConfigSchema = exports.browserPolicyBlockedTransferSchema = exports.browserPolicyEnforcementModeSchema = exports.browserPolicyOutcomeSchema = exports.browserPolicyApprovalStateSchema = exports.browserIframeTrustTierSchema = exports.browserPageSensitivitySchema = exports.browserActionClassSchema = exports.browserPolicyDecisionSchema = exports.browserPolicyBlockedTransferValues = exports.browserPolicyOutcomeValues = exports.browserPolicyApprovalStateValues = exports.browserIframeTrustTierValues = exports.browserPageSensitivityValues = exports.browserActionClassValues = exports.browserPolicyDecisionValues = exports.browserPolicyEnforcementModeValues = exports.BROWSER_APPROVAL_DOM_DRIFT_THRESHOLD = exports.BROWSER_REVIEW_CADENCE_DEFAULT_DAYS = exports.BROWSER_APPROVAL_TTL_MAX_SECONDS = exports.BROWSER_APPROVAL_TTL_MIN_SECONDS = exports.BROWSER_APPROVAL_TTL_DEFAULT_SECONDS = void 0;
exports.normalizeBrowserPolicyConfig = normalizeBrowserPolicyConfig;
exports.normalizeBrowserPolicyUserCustomization = normalizeBrowserPolicyUserCustomization;
exports.normalizeBrowserPolicyUserProfile = normalizeBrowserPolicyUserProfile;
exports.normalizeBrowserWorkflowEntitlement = normalizeBrowserWorkflowEntitlement;
exports.normalizeBrowserPolicyExecutionContext = normalizeBrowserPolicyExecutionContext;
exports.validateBrowserApprovalTtlSeconds = validateBrowserApprovalTtlSeconds;
var zod_1 = require("zod");
exports.BROWSER_APPROVAL_TTL_DEFAULT_SECONDS = 300;
exports.BROWSER_APPROVAL_TTL_MIN_SECONDS = 60;
exports.BROWSER_APPROVAL_TTL_MAX_SECONDS = 900;
exports.BROWSER_REVIEW_CADENCE_DEFAULT_DAYS = 90;
exports.BROWSER_APPROVAL_DOM_DRIFT_THRESHOLD = 0.2;
exports.browserPolicyEnforcementModeValues = [
    "observe",
    "read_only",
    "draft",
    "commit",
    "expanded",
];
exports.browserPolicyDecisionValues = [
    "allow",
    "allow_with_redaction",
    "require_approval",
    "deny",
    "escalate_for_review",
];
exports.browserActionClassValues = [
    "read",
    "draft",
    "commit",
    "restricted",
];
exports.browserPageSensitivityValues = [
    "none",
    "auth",
    "financial",
    "admin",
    "sensitive_data",
    "communication",
    "code",
];
exports.browserIframeTrustTierValues = [
    "same_origin",
    "same_site",
    "cross_site",
    "sandboxed",
];
exports.browserPolicyApprovalStateValues = [
    "not_required",
    "approved",
    "pending",
    "context_changed",
    "revoked",
    "expired",
    "rejected",
];
exports.browserPolicyOutcomeValues = [
    "blocked",
    "executed",
    "failed",
];
exports.browserPolicyBlockedTransferValues = [
    "download",
    "upload",
    "clipboard",
    "external_send",
];
exports.browserPolicyDecisionSchema = zod_1.z.enum(exports.browserPolicyDecisionValues);
exports.browserActionClassSchema = zod_1.z.enum(exports.browserActionClassValues);
exports.browserPageSensitivitySchema = zod_1.z.enum(exports.browserPageSensitivityValues);
exports.browserIframeTrustTierSchema = zod_1.z.enum(exports.browserIframeTrustTierValues);
exports.browserPolicyApprovalStateSchema = zod_1.z.enum(exports.browserPolicyApprovalStateValues);
exports.browserPolicyOutcomeSchema = zod_1.z.enum(exports.browserPolicyOutcomeValues);
exports.browserPolicyEnforcementModeSchema = zod_1.z.enum(exports.browserPolicyEnforcementModeValues);
exports.browserPolicyBlockedTransferSchema = zod_1.z.enum(exports.browserPolicyBlockedTransferValues);
exports.browserPolicyConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(true),
    enforcementMode: exports.browserPolicyEnforcementModeSchema.default("observe"),
    defaultApprovalTtlSeconds: zod_1.z
        .number()
        .int()
        .min(exports.BROWSER_APPROVAL_TTL_MIN_SECONDS)
        .max(exports.BROWSER_APPROVAL_TTL_MAX_SECONDS)
        .default(exports.BROWSER_APPROVAL_TTL_DEFAULT_SECONDS),
    reviewCadenceDays: zod_1.z.number().int().positive().default(exports.BROWSER_REVIEW_CADENCE_DEFAULT_DAYS),
    killSwitchEnabled: zod_1.z.boolean().default(false),
    requireTamperEvidence: zod_1.z.boolean().default(true),
    evidenceRetentionDays: zod_1.z.number().int().positive().default(365),
    allowedDomains: zod_1.z.array(zod_1.z.string()).default([]),
    visionModel: zod_1.z.string().min(1).default("gpt-4o"),
    seededDefault: zod_1.z.boolean().default(false),
});
exports.browserPolicyUserCustomizationSchema = zod_1.z.object({
    allowPersonalDomainSubset: zod_1.z.boolean().default(true),
    allowModeCap: zod_1.z.boolean().default(true),
    allowTransferBlocks: zod_1.z.boolean().default(true),
    allowApprovalTtlCap: zod_1.z.boolean().default(true),
    allowActionApprovalEscalation: zod_1.z.boolean().default(true),
    allowPreferredVisionModel: zod_1.z.boolean().default(false),
});
exports.browserPolicyUserProfileSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(true),
    modeCap: exports.browserPolicyEnforcementModeSchema.nullable().default(null),
    allowedDomainsSubset: zod_1.z.array(zod_1.z.string()).default([]),
    blockedTransfers: zod_1.z.array(exports.browserPolicyBlockedTransferSchema).default([]),
    requireApprovalForActionClasses: zod_1.z.array(exports.browserActionClassSchema).default([]),
    approvalTtlSecondsCap: zod_1.z
        .number()
        .int()
        .min(exports.BROWSER_APPROVAL_TTL_MIN_SECONDS)
        .max(exports.BROWSER_APPROVAL_TTL_MAX_SECONDS)
        .nullable()
        .default(null),
    preferredVisionModel: zod_1.z.string().min(1).nullable().default(null),
    notifyOnApprovalRequests: zod_1.z.boolean().default(true),
    notifyOnPolicyIncidents: zod_1.z.boolean().default(true),
});
exports.browserPolicyRuleSchema = zod_1.z.object({
    id: zod_1.z.number().int().optional(),
    priority: zod_1.z.number().int().default(100),
    enabled: zod_1.z.boolean().default(true),
    description: zod_1.z.string().optional(),
    match: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).default({}),
    decision: exports.browserPolicyDecisionSchema,
    reasonCode: zod_1.z.string().min(1),
    actionClass: exports.browserActionClassSchema.optional(),
});
exports.browserWorkflowEntitlementConfigSchema = zod_1.z.object({
    approvalTtlSeconds: zod_1.z
        .number()
        .int()
        .min(exports.BROWSER_APPROVAL_TTL_MIN_SECONDS)
        .max(exports.BROWSER_APPROVAL_TTL_MAX_SECONDS)
        .default(exports.BROWSER_APPROVAL_TTL_DEFAULT_SECONDS),
    maxExtractedRecords: zod_1.z.number().int().positive().optional(),
    maxExternalSends: zod_1.z.number().int().positive().optional(),
    maxOriginTransitions: zod_1.z.number().int().positive().optional(),
    maxNonReadActions: zod_1.z.number().int().positive().optional(),
});
exports.browserWorkflowEntitlementSchema = zod_1.z.object({
    tenantId: zod_1.z.string().min(1),
    workflowId: zod_1.z.number().int().nonnegative(),
    workflowName: zod_1.z.string().min(1),
    enabled: zod_1.z.boolean().default(true),
    expiresAt: zod_1.z.date().nullable().optional(),
    reviewCadenceDays: zod_1.z.number().int().positive().default(exports.BROWSER_REVIEW_CADENCE_DEFAULT_DAYS),
    allowedCapabilities: zod_1.z.array(zod_1.z.string()).default([]),
    forbiddenCapabilities: zod_1.z.array(zod_1.z.string()).default([]),
    allowedDataClasses: zod_1.z.array(zod_1.z.string()).default(["public", "internal"]),
    config: exports.browserWorkflowEntitlementConfigSchema.default({}),
});
exports.browserApprovalPayloadSchema = zod_1.z.object({
    actionDescription: zod_1.z.string().min(1),
    actionDigest: zod_1.z.string().min(1),
    payloadPreviewHash: zod_1.z.string().min(1),
    domFingerprint: zod_1.z.string().min(1),
    screenshotHash: zod_1.z.string().min(1).optional(),
    targetOrigin: zod_1.z.string().min(1),
    executionId: zod_1.z.string().min(1),
    reasonCodes: zod_1.z.array(zod_1.z.string()).default([]),
    approvalTtlSeconds: zod_1.z
        .number()
        .int()
        .min(exports.BROWSER_APPROVAL_TTL_MIN_SECONDS)
        .max(exports.BROWSER_APPROVAL_TTL_MAX_SECONDS),
});
exports.browserPolicyExecutionContextSchema = zod_1.z.object({
    config: exports.browserPolicyConfigSchema,
    rules: zod_1.z.array(exports.browserPolicyRuleSchema).default([]),
    entitlement: exports.browserWorkflowEntitlementSchema,
    userCustomization: exports.browserPolicyUserCustomizationSchema.optional(),
    userProfile: exports.browserPolicyUserProfileSchema.optional(),
});
exports.browserPolicyAuditMetadataSchema = zod_1.z.object({
    traceId: zod_1.z.string().min(1).optional(),
    eventHash: zod_1.z.string().min(1),
    previousEventHash: zod_1.z.string().min(1).nullable().optional(),
    jsonlPersisted: zod_1.z.boolean(),
    dbPersisted: zod_1.z.boolean(),
    auditWriteFailed: zod_1.z.boolean().default(false),
});
exports.browserPolicyIncidentStatusSchema = zod_1.z.object({
    approvalState: exports.browserPolicyApprovalStateSchema,
    outcome: exports.browserPolicyOutcomeSchema,
    operatorMessage: zod_1.z.string().min(1),
});
exports.browserPolicyDecisionEnvelopeSchema = zod_1.z.object({
    version: zod_1.z.literal("2026-03-10"),
    tenantId: zod_1.z.string().min(1),
    userId: zod_1.z.number().int().nonnegative().optional(),
    workflowId: zod_1.z.number().int().nonnegative().nullable().optional(),
    executionId: zod_1.z.string().min(1).optional(),
    traceId: zod_1.z.string().min(1).optional(),
    actionType: zod_1.z.string().min(1),
    actionClass: exports.browserActionClassSchema,
    pageSensitivity: exports.browserPageSensitivitySchema,
    decision: exports.browserPolicyDecisionSchema,
    reasonCodes: zod_1.z.array(zod_1.z.string()).default([]),
    confidence: zod_1.z.number().min(0).max(1),
    riskScore: zod_1.z.number().min(0).max(100),
    evidence: zod_1.z.object({
        actionDigest: zod_1.z.string().min(1),
        payloadPreviewHash: zod_1.z.string().min(1).optional(),
        domFingerprint: zod_1.z.string().min(1).optional(),
        screenshotHash: zod_1.z.string().min(1).optional(),
    }),
    approval: zod_1.z
        .object({
        required: zod_1.z.boolean(),
        approvalId: zod_1.z.string().min(1).optional(),
        approvalTtlSeconds: zod_1.z.number().int().min(exports.BROWSER_APPROVAL_TTL_MIN_SECONDS).max(exports.BROWSER_APPROVAL_TTL_MAX_SECONDS).optional(),
    })
        .optional(),
});
function normalizeBrowserPolicyConfig(config) {
    return exports.browserPolicyConfigSchema.parse(config !== null && config !== void 0 ? config : {});
}
function normalizeBrowserPolicyUserCustomization(customization) {
    return exports.browserPolicyUserCustomizationSchema.parse(customization !== null && customization !== void 0 ? customization : {});
}
function normalizeBrowserPolicyUserProfile(profile) {
    return exports.browserPolicyUserProfileSchema.parse(profile !== null && profile !== void 0 ? profile : {});
}
function normalizeBrowserWorkflowEntitlement(entitlement) {
    return exports.browserWorkflowEntitlementSchema.parse(entitlement);
}
function normalizeBrowserPolicyExecutionContext(context) {
    return exports.browserPolicyExecutionContextSchema.parse(context);
}
function validateBrowserApprovalTtlSeconds(ttl) {
    return exports.browserWorkflowEntitlementConfigSchema.shape.approvalTtlSeconds.parse(ttl !== null && ttl !== void 0 ? ttl : exports.BROWSER_APPROVAL_TTL_DEFAULT_SECONDS);
}
