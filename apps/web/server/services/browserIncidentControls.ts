import type { BrowserPageSensitivity } from "../../shared/browserPolicy";

export interface BrowserIncidentControlsInput {
  targetOrigin: string;
  pageSensitivity: BrowserPageSensitivity;
  workflowEnabled: boolean;
  globalKillSwitchEnabled?: boolean;
  tenantKillSwitchEnabled?: boolean;
  approvalRevoked?: boolean;
  emergencyDeniedDomains?: string[];
  emergencyDeniedPageSensitivities?: BrowserPageSensitivity[];
}

export type BrowserIncidentControlResult =
  | { allowed: true }
  | {
      allowed: false;
      reasonCode:
        | "global_kill_switch"
        | "tenant_kill_switch"
        | "workflow_disabled"
        | "approval_revoked"
        | "emergency_domain_override"
        | "emergency_category_override";
    };

function extractHostname(targetOrigin: string): string {
  try {
    return new URL(targetOrigin).hostname.toLowerCase();
  } catch {
    return targetOrigin.toLowerCase();
  }
}

export function evaluateBrowserIncidentControls(
  input: BrowserIncidentControlsInput,
): BrowserIncidentControlResult {
  if (input.globalKillSwitchEnabled) {
    return { allowed: false, reasonCode: "global_kill_switch" };
  }

  if (input.tenantKillSwitchEnabled) {
    return { allowed: false, reasonCode: "tenant_kill_switch" };
  }

  if (!input.workflowEnabled) {
    return { allowed: false, reasonCode: "workflow_disabled" };
  }

  if (input.approvalRevoked) {
    return { allowed: false, reasonCode: "approval_revoked" };
  }

  const hostname = extractHostname(input.targetOrigin);
  if ((input.emergencyDeniedDomains ?? []).map((domain) => domain.toLowerCase()).includes(hostname)) {
    return { allowed: false, reasonCode: "emergency_domain_override" };
  }

  if ((input.emergencyDeniedPageSensitivities ?? []).includes(input.pageSensitivity)) {
    return { allowed: false, reasonCode: "emergency_category_override" };
  }

  return { allowed: true };
}
