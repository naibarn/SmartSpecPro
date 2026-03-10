import type {
  BrowserActionClass,
  BrowserIframeTrustTier,
  BrowserPageSensitivity,
  BrowserPolicyDecision,
  BrowserWorkflowEntitlement,
} from "../../shared/browserPolicy";

export interface BrowserDataHandlingInput {
  actionType: string;
  actionClass: BrowserActionClass;
  pageSensitivity: BrowserPageSensitivity;
  currentOrigin?: string | null;
  targetOrigin?: string | null;
  iframeTrustTier?: BrowserIframeTrustTier;
  extractedRecordCount?: number;
  externalSendCount?: number;
  originTransitionCount?: number;
  entitlement: BrowserWorkflowEntitlement;
}

export interface BrowserDataHandlingResult {
  decision?: BrowserPolicyDecision;
  reasonCodes: string[];
}

export function resolveIframeTrustTier(input: {
  parentOrigin?: string | null;
  frameOrigin?: string | null;
  sandboxed?: boolean;
}): BrowserIframeTrustTier {
  if (input.sandboxed) {
    return "sandboxed";
  }

  if (!input.parentOrigin || !input.frameOrigin) {
    return "cross_site";
  }

  if (input.parentOrigin === input.frameOrigin) {
    return "same_origin";
  }

  try {
    const parentUrl = new URL(input.parentOrigin);
    const frameUrl = new URL(input.frameOrigin);
    if (parentUrl.hostname === frameUrl.hostname) {
      return "same_site";
    }
  } catch {
    return "cross_site";
  }

  return "cross_site";
}

export function evaluateBrowserDataHandlingPolicy(
  input: BrowserDataHandlingInput,
): BrowserDataHandlingResult {
  const reasonCodes: string[] = [];
  const normalizedActionType = input.actionType.toLowerCase();
  const config = input.entitlement.config;

  if (input.iframeTrustTier === "cross_site" || input.iframeTrustTier === "sandboxed") {
    reasonCodes.push("cross_site_iframe");
    if (input.actionClass !== "read") {
      return { decision: "deny", reasonCodes };
    }
  }

  if (input.iframeTrustTier === "same_site" && input.actionClass === "commit") {
    reasonCodes.push("same_site_iframe_requires_approval");
    return { decision: "require_approval", reasonCodes };
  }

  if (normalizedActionType === "download" && input.pageSensitivity !== "none") {
    reasonCodes.push("sensitive_download");
    return { decision: "deny", reasonCodes };
  }

  if (normalizedActionType === "upload") {
    reasonCodes.push("external_upload");
    return { decision: "require_approval", reasonCodes };
  }

  if (normalizedActionType.includes("clipboard")) {
    reasonCodes.push("clipboard_transfer");
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
