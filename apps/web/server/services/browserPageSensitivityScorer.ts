import type { BrowserIframeTrustTier, BrowserPageSensitivity } from "../../shared/browserPolicy";

export interface BrowserPageSensitivityInput {
  dataClasses?: string[];
  isAuthPage?: boolean;
  isFinancialPage?: boolean;
  isAdminPage?: boolean;
  containsSecrets?: boolean;
  iframeTrustTier?: BrowserIframeTrustTier;
}

export interface BrowserPageSensitivityResult {
  pageSensitivity: BrowserPageSensitivity;
  riskScore: number;
  reasonCodes: string[];
}

export function scoreBrowserPageSensitivity(
  input: BrowserPageSensitivityInput,
): BrowserPageSensitivityResult {
  const dataClasses = (input.dataClasses ?? []).map((value) => value.toLowerCase());
  const reasonCodes: string[] = [];

  if (input.iframeTrustTier === "cross_site" || input.iframeTrustTier === "sandboxed") {
    reasonCodes.push("cross_site_iframe");
  }

  if (input.isAdminPage) {
    reasonCodes.push("admin_surface");
    return { pageSensitivity: "admin", riskScore: 95, reasonCodes };
  }

  if (input.isFinancialPage) {
    reasonCodes.push("financial_surface");
    return { pageSensitivity: "financial", riskScore: 90, reasonCodes };
  }

  if (input.isAuthPage) {
    reasonCodes.push("auth_surface");
    return { pageSensitivity: "auth", riskScore: 85, reasonCodes };
  }

  if (input.containsSecrets || dataClasses.includes("restricted") || dataClasses.includes("confidential")) {
    reasonCodes.push("sensitive_data");
    return { pageSensitivity: "sensitive_data", riskScore: 82, reasonCodes };
  }

  if (dataClasses.includes("communication")) {
    reasonCodes.push("communication_surface");
    return { pageSensitivity: "communication", riskScore: 68, reasonCodes };
  }

  if (dataClasses.includes("code")) {
    reasonCodes.push("code_surface");
    return { pageSensitivity: "code", riskScore: 65, reasonCodes };
  }

  return { pageSensitivity: "none", riskScore: 20, reasonCodes };
}
