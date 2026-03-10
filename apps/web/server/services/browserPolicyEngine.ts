import {
  type BrowserPolicyDecisionEnvelope,
  type BrowserWorkflowEntitlement,
  browserPolicyDecisionEnvelopeSchema,
} from "../../shared/browserPolicy";
import { classifyBrowserAction } from "./browserActionClassifier";
import { evaluateBrowserDataHandlingPolicy } from "./browserDataHandlingPolicy";
import { scoreBrowserPageSensitivity } from "./browserPageSensitivityScorer";

export interface BrowserPolicyEvaluationInput {
  tenantId: string;
  userId?: number;
  workflowId?: number | null;
  executionId?: string;
  traceId?: string;
  actionType: string;
  requiredCapabilities?: string[];
  dataClasses?: string[];
  targetOrigin?: string | null;
  currentOrigin?: string | null;
  iframeTrustTier?: "same_origin" | "same_site" | "cross_site" | "sandboxed";
  writesData?: boolean;
  touchesClipboard?: boolean;
  transfersExternally?: boolean;
  classifierConfidenceOverride?: number;
  isAuthPage?: boolean;
  isFinancialPage?: boolean;
  isAdminPage?: boolean;
  containsSecrets?: boolean;
  extractedRecordCount?: number;
  externalSendCount?: number;
  originTransitionCount?: number;
  evidence: {
    actionDigest: string;
    payloadPreviewHash?: string;
    domFingerprint?: string;
    screenshotHash?: string;
  };
}

export interface BrowserPolicyEngineContext {
  entitlement: BrowserWorkflowEntitlement;
}

export function evaluateBrowserPolicy(
  input: BrowserPolicyEvaluationInput,
  context: BrowserPolicyEngineContext,
): BrowserPolicyDecisionEnvelope {
  const classification = classifyBrowserAction({
    actionType: input.actionType,
    currentOrigin: input.currentOrigin,
    targetOrigin: input.targetOrigin,
    writesData: input.writesData,
    touchesClipboard: input.touchesClipboard,
    transfersExternally: input.transfersExternally,
  });
  const classifierConfidence = input.classifierConfidenceOverride ?? classification.confidence;
  const sensitivity = scoreBrowserPageSensitivity({
    dataClasses: input.dataClasses,
    isAuthPage: input.isAuthPage,
    isFinancialPage: input.isFinancialPage,
    isAdminPage: input.isAdminPage,
    containsSecrets: input.containsSecrets,
    iframeTrustTier: input.iframeTrustTier,
  });
  const reasonCodes = new Set<string>([
    ...classification.reasonCodes,
    ...sensitivity.reasonCodes,
  ]);

  let decision: BrowserPolicyDecisionEnvelope["decision"] = "allow";

  const forbiddenCapabilities = new Set(context.entitlement.forbiddenCapabilities);
  if ((input.requiredCapabilities ?? []).some((capability) => forbiddenCapabilities.has(capability))) {
    decision = "deny";
    reasonCodes.add("forbidden_capability");
  } else if (
    (input.requiredCapabilities ?? []).some(
      (capability) => !context.entitlement.allowedCapabilities.includes(capability),
    )
  ) {
    decision = "deny";
    reasonCodes.add("missing_capability");
  }

  const dataHandling = evaluateBrowserDataHandlingPolicy({
    actionType: input.actionType,
    actionClass: classification.actionClass,
    pageSensitivity: sensitivity.pageSensitivity,
    currentOrigin: input.currentOrigin,
    targetOrigin: input.targetOrigin,
    iframeTrustTier: input.iframeTrustTier,
    extractedRecordCount: input.extractedRecordCount,
    externalSendCount: input.externalSendCount,
    originTransitionCount: input.originTransitionCount,
    entitlement: context.entitlement,
  });
  dataHandling.reasonCodes.forEach((code) => reasonCodes.add(code));
  if (dataHandling.decision) {
    decision = dataHandling.decision;
  }

  if (decision === "allow" && sensitivity.pageSensitivity === "sensitive_data" && input.transfersExternally) {
    decision = "deny";
    reasonCodes.add("restricted_transfer");
  }

  if (decision === "allow" && classifierConfidence < 0.7 && classification.actionClass !== "read") {
    decision = classification.actionClass === "restricted" ? "deny" : "require_approval";
    reasonCodes.add("low_classifier_confidence");
  }

  if (decision === "allow" && classification.actionClass === "restricted") {
    decision = "require_approval";
  }

  if (decision === "allow" && input.iframeTrustTier === "same_site" && classification.actionClass === "commit") {
    decision = "require_approval";
    reasonCodes.add("same_site_commit");
  }

  const envelope = browserPolicyDecisionEnvelopeSchema.parse({
    version: "2026-03-10",
    tenantId: input.tenantId,
    userId: input.userId,
    workflowId: input.workflowId ?? null,
    executionId: input.executionId,
    traceId: input.traceId,
    actionType: input.actionType,
    actionClass: classification.actionClass,
    pageSensitivity: sensitivity.pageSensitivity,
    decision,
    reasonCodes: Array.from(reasonCodes),
    confidence: Number(classifierConfidence.toFixed(2)),
    riskScore: Math.max(
      sensitivity.riskScore,
      decision === "deny" ? 90 : decision === "require_approval" ? 70 : sensitivity.riskScore,
    ),
    evidence: input.evidence,
    approval: decision === "require_approval"
      ? {
          required: true,
          approvalTtlSeconds:
            context.entitlement.config.approvalTtlSeconds,
        }
      : { required: false },
  });

  return envelope;
}
