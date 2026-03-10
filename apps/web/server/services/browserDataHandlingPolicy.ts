import type {
  BrowserActionClass,
  BrowserIframeTrustTier,
  BrowserPageSensitivity,
  BrowserPolicyDecision,
  BrowserWorkflowEntitlement,
} from "../../shared/browserPolicy";
import { evaluateBrowserActionRateLimit } from "./browserActionRateLimit";

export interface BrowserDataHandlingInput {
  actionType: string;
  actionClass: BrowserActionClass;
  pageSensitivity: BrowserPageSensitivity;
  currentOrigin?: string | null;
  targetOrigin?: string | null;
  iframeTrustTier?: BrowserIframeTrustTier;
  dataClass?: string | null;
  extractedRecordCount?: number;
  externalSendCount?: number;
  originTransitionCount?: number;
  nonReadActionCount?: number;
  entitlement: BrowserWorkflowEntitlement;
}

export interface BrowserDataHandlingResult {
  decision?: BrowserPolicyDecision;
  reasonCodes: string[];
}

function getSiteKey(hostname: string): string {
  const parts = hostname.toLowerCase().split(".").filter(Boolean);

  if (parts.length <= 2) {
    return hostname.toLowerCase();
  }

  const secondLevelSuffixes = new Set(["co", "com", "org", "net", "gov", "ac"]);
  const tld = parts.at(-1) ?? "";
  const sld = parts.at(-2) ?? "";
  if (tld.length === 2 && secondLevelSuffixes.has(sld) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }

  return parts.slice(-2).join(".");
}

function resolveOriginTrustTier(input: {
  currentOrigin?: string | null;
  targetOrigin?: string | null;
}): BrowserIframeTrustTier {
  if (!input.currentOrigin || !input.targetOrigin) {
    return "cross_site";
  }

  if (input.currentOrigin === input.targetOrigin) {
    return "same_origin";
  }

  try {
    const currentUrl = new URL(input.currentOrigin);
    const targetUrl = new URL(input.targetOrigin);
    if (currentUrl.origin === targetUrl.origin) {
      return "same_origin";
    }
    if (getSiteKey(currentUrl.hostname) === getSiteKey(targetUrl.hostname)) {
      return "same_site";
    }
  } catch {
    return "cross_site";
  }

  return "cross_site";
}

export function resolveIframeTrustTier(input: {
  parentOrigin?: string | null;
  frameOrigin?: string | null;
  sandboxed?: boolean;
}): BrowserIframeTrustTier {
  if (input.sandboxed) {
    return "sandboxed";
  }

  return resolveOriginTrustTier({
    currentOrigin: input.parentOrigin,
    targetOrigin: input.frameOrigin,
  });
}

export function evaluateBrowserDataHandlingPolicy(
  input: BrowserDataHandlingInput,
): BrowserDataHandlingResult {
  const reasonCodes: string[] = [];
  const normalizedActionType = input.actionType.toLowerCase();
  const dataClass = input.dataClass?.toLowerCase() ?? "internal";
  const destinationTrustTier = resolveOriginTrustTier({
    currentOrigin: input.currentOrigin,
    targetOrigin: input.targetOrigin,
  });

  if (input.iframeTrustTier === "cross_site" || input.iframeTrustTier === "sandboxed") {
    reasonCodes.push("cross_site_iframe");
    if (input.actionClass !== "read") {
      return { decision: "deny", reasonCodes };
    }
  }

  if (
    input.iframeTrustTier === "same_site"
    && input.actionClass !== "read"
    && input.actionClass !== "draft"
  ) {
    reasonCodes.push("same_site_iframe_requires_approval");
    return { decision: "require_approval", reasonCodes };
  }

  if (normalizedActionType === "download" && input.pageSensitivity !== "none") {
    const dataClassAllowed = input.entitlement.allowedDataClasses.includes(dataClass);
    const trustedDestination =
      destinationTrustTier === "same_origin" || destinationTrustTier === "same_site";
    if (!dataClassAllowed || !trustedDestination) {
      reasonCodes.push("sensitive_download");
      return { decision: "deny", reasonCodes };
    }
  }

  if (normalizedActionType === "upload") {
    if (!input.entitlement.allowedDataClasses.includes(dataClass)) {
      reasonCodes.push("upload_data_class_not_allowed");
      return { decision: "deny", reasonCodes };
    }
    if (destinationTrustTier === "cross_site") {
      reasonCodes.push("external_upload");
      return { decision: "require_approval", reasonCodes };
    }
  }

  if (normalizedActionType.includes("clipboard")) {
    const restrictedContext =
      input.pageSensitivity === "sensitive_data" || dataClass === "restricted";
    const untrustedDestination = destinationTrustTier === "cross_site";
    if (restrictedContext || untrustedDestination) {
      reasonCodes.push("clipboard_transfer");
      return { decision: "deny", reasonCodes };
    }
  }

  const rateLimitResult = evaluateBrowserActionRateLimit({
    actionClass: input.actionClass,
    extractedRecordCount: input.extractedRecordCount,
    externalSendCount: input.externalSendCount,
    originTransitionCount: input.originTransitionCount,
    nonReadActionCount: input.nonReadActionCount,
    entitlement: input.entitlement,
  });
  if (rateLimitResult.decision) {
    return rateLimitResult;
  }

  return { reasonCodes: [...reasonCodes, ...rateLimitResult.reasonCodes] };
}
