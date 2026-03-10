import type {
  BrowserActionClass,
  BrowserPolicyDecision,
  BrowserWorkflowEntitlement,
} from "../../shared/browserPolicy";

export interface BrowserActionRateLimitInput {
  actionClass: BrowserActionClass;
  extractedRecordCount?: number;
  externalSendCount?: number;
  originTransitionCount?: number;
  nonReadActionCount?: number;
  entitlement: BrowserWorkflowEntitlement;
}

export interface BrowserActionRateLimitResult {
  decision?: BrowserPolicyDecision;
  reasonCodes: string[];
}

export function evaluateBrowserActionRateLimit(
  input: BrowserActionRateLimitInput,
): BrowserActionRateLimitResult {
  const reasonCodes: string[] = [];
  const config = input.entitlement.config;

  if (
    input.actionClass !== "read"
    && typeof config.maxNonReadActions === "number"
    && typeof input.nonReadActionCount === "number"
    && input.nonReadActionCount > config.maxNonReadActions
  ) {
    reasonCodes.push("non_read_action_limit_exceeded");
    return { decision: "deny", reasonCodes };
  }

  if (
    typeof config.maxExtractedRecords === "number"
    && typeof input.extractedRecordCount === "number"
    && input.extractedRecordCount > config.maxExtractedRecords
  ) {
    reasonCodes.push("record_limit_exceeded");
    return { decision: "deny", reasonCodes };
  }

  if (
    typeof config.maxExternalSends === "number"
    && typeof input.externalSendCount === "number"
    && input.externalSendCount > config.maxExternalSends
  ) {
    reasonCodes.push("external_send_limit_exceeded");
    return { decision: "deny", reasonCodes };
  }

  if (
    typeof config.maxOriginTransitions === "number"
    && typeof input.originTransitionCount === "number"
    && input.originTransitionCount > config.maxOriginTransitions
  ) {
    reasonCodes.push("origin_transition_limit_exceeded");
    return { decision: "deny", reasonCodes };
  }

  return { reasonCodes };
}
