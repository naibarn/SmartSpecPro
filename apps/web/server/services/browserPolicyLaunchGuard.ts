export interface BrowserPolicyLaunchGuardInput {
  browserToolEnabled: boolean;
  browserPolicyContractWired: boolean;
}

export interface BrowserPolicyLaunchGuardError {
  status: number;
  code: string;
  message: string;
}

export function getBrowserToolLaunchGuardError(
  input: BrowserPolicyLaunchGuardInput,
): BrowserPolicyLaunchGuardError | null {
  if (!input.browserToolEnabled) {
    return null;
  }

  if (!input.browserPolicyContractWired) {
    return {
      status: 503,
      code: "POLICY_NOT_READY",
      message: "Browser automation policy enforcement is not wired for the raw browser tool.",
    };
  }

  return null;
}

export function isBrowserPolicyContractWired(): boolean {
  return process.env.BROWSER_POLICY_CONTRACT_WIRED === "true";
}
