import {
  type BrowserApprovalPayload,
  type BrowserPolicyDecisionEnvelope,
  type BrowserPolicyExecutionContext,
  normalizeBrowserPolicyExecutionContext,
  normalizeBrowserWorkflowEntitlement,
} from "../../shared/browserPolicy";
import {
  buildBrowserApprovalPayload,
  getBrowserApprovalCorrelationKey,
} from "./browserApprovalPayload";
import { evaluateBrowserIncidentControls } from "./browserIncidentControls";
import { evaluateBrowserPolicy, type BrowserPolicyEvaluationInput } from "./browserPolicyEngine";
import {
  buildSeededBrowserPolicyConfig,
  loadTenantBrowserPolicyConfig,
} from "./browserPolicyStore";

const DEFAULT_AUTOMATION_COPILOT_CAPABILITIES = [
  "navigate",
  "click",
  "fill",
  "select",
  "hover",
  "extract_data",
];

function matchesAllowedDomain(targetOrigin: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) {
    return false;
  }

  let hostname: string;
  try {
    hostname = new URL(targetOrigin).hostname.toLowerCase();
  } catch {
    return false;
  }

  return allowedDomains.some((domain) => {
    const normalized = domain.toLowerCase().trim();
    if (normalized.startsWith("*.")) {
      return hostname === normalized.slice(2) || hostname.endsWith(normalized.slice(1));
    }
    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  });
}

function mergeAllowedDomains(...domainLists: string[][]): string[] {
  return Array.from(
    new Set(
      domainLists
        .flat()
        .map((domain) => domain.trim())
        .filter(Boolean),
    ),
  );
}

export async function buildAutomationCopilotBrowserPolicyContext(input: {
  tenantId: string;
  executionId: string;
  allowedDomains: string[];
}): Promise<BrowserPolicyExecutionContext> {
  const tenantPolicy = await loadTenantBrowserPolicyConfig({
    tenantId: input.tenantId,
    seededConfig: { allowedDomains: input.allowedDomains },
  });

  const config = tenantPolicy.config
    ? {
        ...tenantPolicy.config,
        allowedDomains: mergeAllowedDomains(
          tenantPolicy.config.allowedDomains,
          input.allowedDomains,
        ),
      }
    : buildSeededBrowserPolicyConfig({ allowedDomains: input.allowedDomains });

  return normalizeBrowserPolicyExecutionContext({
    config,
    rules: tenantPolicy.rules,
    entitlement: normalizeBrowserWorkflowEntitlement({
      tenantId: input.tenantId,
      workflowId: 0,
      workflowName: `Automation Copilot ${input.executionId}`,
      allowedCapabilities: DEFAULT_AUTOMATION_COPILOT_CAPABILITIES,
      config: {
        approvalTtlSeconds: config.defaultApprovalTtlSeconds,
      },
    }),
  });
}

export interface BrowserPolicyRuntimeInput
  extends BrowserPolicyEvaluationInput {
  actionDescription: string;
  normalizedAction: Record<string, unknown>;
  payloadPreview: Record<string, unknown>;
  policyContext: BrowserPolicyExecutionContext;
  approvalRevoked?: boolean;
  emergencyDeniedDomains?: string[];
}

export interface BrowserPolicyRuntimeResult {
  decision: BrowserPolicyDecisionEnvelope;
  approvalPayload?: BrowserApprovalPayload;
  correlationKey?: string;
}

export function evaluateBrowserPolicyRuntime(
  input: BrowserPolicyRuntimeInput,
): BrowserPolicyRuntimeResult {
  const policyContext = normalizeBrowserPolicyExecutionContext(input.policyContext);
  let decision = evaluateBrowserPolicy(input, {
    entitlement: policyContext.entitlement,
  });

  const targetOrigin = input.targetOrigin ?? input.currentOrigin ?? "";
  if (targetOrigin && !matchesAllowedDomain(targetOrigin, policyContext.config.allowedDomains)) {
    decision = {
      ...decision,
      decision: "deny",
      reasonCodes: Array.from(new Set([...decision.reasonCodes, "domain_not_allowed"])),
    };
  }

  const reasonCodes = new Set(decision.reasonCodes);
  const incidentControl = evaluateBrowserIncidentControls({
    targetOrigin,
    pageSensitivity: decision.pageSensitivity,
    workflowEnabled: policyContext.entitlement.enabled,
    tenantKillSwitchEnabled: policyContext.config.killSwitchEnabled,
    approvalRevoked: input.approvalRevoked,
    emergencyDeniedDomains: input.emergencyDeniedDomains,
  });

  if (!incidentControl.allowed) {
    reasonCodes.add(incidentControl.reasonCode);
    decision = {
      ...decision,
      decision: "deny",
      reasonCodes: Array.from(reasonCodes),
    };
  }

  if (decision.decision !== "require_approval") {
    return { decision };
  }

  const approvalPayload = buildBrowserApprovalPayload({
    actionDescription: input.actionDescription,
    executionId: input.executionId ?? "",
    targetOrigin,
    reasonCodes: decision.reasonCodes,
    normalizedAction: input.normalizedAction,
    payloadPreview: input.payloadPreview,
    domFingerprint: input.evidence.domFingerprint ?? input.evidence.actionDigest,
    screenshotHash: input.evidence.screenshotHash,
    approvalTtlSeconds:
      decision.approval?.approvalTtlSeconds
      ?? policyContext.entitlement.config.approvalTtlSeconds,
  });

  return {
    decision,
    approvalPayload,
    correlationKey: getBrowserApprovalCorrelationKey(approvalPayload),
  };
}
