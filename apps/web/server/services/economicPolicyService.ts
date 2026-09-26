export type PolicyDecision = "approved" | "denied" | "approval_required";

export type EconomicPolicyResult = {
  decision: PolicyDecision;
  reasonCode: string;
  policyVersion: string;
  explanation: string;
  provider?: string;
};

type PolicyGate = {
  allowed: boolean;
  approvalRequired?: boolean;
  reason?: string;
};

export type EconomicPolicyInput = {
  policyVersion: string;
  tenant: PolicyGate;
  project: PolicyGate;
  user: PolicyGate;
  agent: PolicyGate;
  workflow: PolicyGate;
  provider: PolicyGate & { name?: string };
};

const precedence: Array<[keyof EconomicPolicyInput, string]> = [
  ["tenant", "TENANT_POLICY_DENIED"],
  ["project", "PROJECT_POLICY_DENIED"],
  ["user", "USER_POLICY_DENIED"],
  ["agent", "AGENT_POLICY_DENIED"],
  ["workflow", "WORKFLOW_POLICY_DENIED"],
  ["provider", "PROVIDER_POLICY_DENIED"],
];

export function evaluateEconomicPolicy(
  input: EconomicPolicyInput
): EconomicPolicyResult {
  for (const [scope, denialCode] of precedence) {
    const gate = input[scope] as PolicyGate & { name?: string };
    if (!gate.allowed) {
      return {
        decision: "denied",
        reasonCode: denialCode,
        policyVersion: input.policyVersion,
        explanation: `${scope} policy denied this economic effect`,
        ...(scope === "provider" && gate.name ? { provider: gate.name } : {}),
      };
    }
  }
  for (const [scope] of precedence) {
    const gate = input[scope] as PolicyGate & { name?: string };
    if (gate.approvalRequired) {
      return {
        decision: "approval_required",
        reasonCode: `${String(scope).toUpperCase()}_APPROVAL_REQUIRED`,
        policyVersion: input.policyVersion,
        explanation: `${scope} policy requires approval before execution`,
        ...(scope === "provider" && gate.name ? { provider: gate.name } : {}),
      };
    }
  }
  return {
    decision: "approved",
    reasonCode: "POLICY_APPROVED",
    policyVersion: input.policyVersion,
    explanation: "all applicable economic policy gates passed",
    ...(input.provider.name ? { provider: input.provider.name } : {}),
  };
}

export function allocateRevenue(input: {
  grossMinorUnits: number;
  currency: string;
  publisherShareBps: number;
  platformShareBps: number;
}): {
  currency: string;
  publisherMinorUnits: number;
  platformMinorUnits: number;
  eligible: true;
} {
  const currency = input.currency.trim().toUpperCase();
  if (
    !/^[A-Z]{3}$/.test(currency) ||
    !Number.isSafeInteger(input.grossMinorUnits) ||
    input.grossMinorUnits < 0
  ) {
    throw new Error("REVENUE_AMOUNT_INVALID");
  }
  if (
    !Number.isInteger(input.publisherShareBps) ||
    !Number.isInteger(input.platformShareBps) ||
    input.publisherShareBps < 0 ||
    input.platformShareBps < 0 ||
    input.publisherShareBps + input.platformShareBps !== 10_000
  ) {
    throw new Error("REVENUE_SPLIT_INVALID");
  }
  const publisherMinorUnits = Math.floor(
    (input.grossMinorUnits * input.publisherShareBps) / 10_000
  );
  return {
    currency,
    publisherMinorUnits,
    platformMinorUnits: input.grossMinorUnits - publisherMinorUnits,
    eligible: true,
  };
}
