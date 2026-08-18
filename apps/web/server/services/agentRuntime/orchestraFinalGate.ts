import {
  validateProviderPromptLength,
  validateSideEffectAuthorization,
  type OrchestraAssuranceResult,
  type OrchestraProviderCapabilityProfile,
  type OrchestraSideEffectAuthorization,
} from "../../../shared/agentRuntime/orchestraSchemas";

export interface OrchestraFinalGateInput {
  tenantId: string;
  contractHash: string;
  outputHash: string;
  policyHash: string;
  result: OrchestraAssuranceResult | null | undefined;
  prompt?: string;
  providerProfile?: OrchestraProviderCapabilityProfile | null;
  sideEffectAuthorization?: OrchestraSideEffectAuthorization | null;
  requiresSideEffect: boolean;
}

export function assertOrchestraFinalGate(
  input: OrchestraFinalGateInput
): OrchestraAssuranceResult {
  if (!input.result) throw new Error("assurance_result_missing");
  if (
    input.result.state !== "provider_ready" &&
    input.result.state !== "committed"
  )
    throw new Error(`assurance_state_not_ready:${input.result.state}`);
  if (
    input.result.contractHash &&
    input.result.contractHash !== input.contractHash
  )
    throw new Error("contract_hash_mismatch");
  if (input.result.findings.some(finding => finding.severity === "blocking"))
    throw new Error("blocking_assurance_finding");
  if (input.providerProfile && input.prompt !== undefined) {
    const finding = validateProviderPromptLength(
      input.providerProfile,
      input.prompt
    );
    if (finding) throw new Error(`${finding.code}:${finding.message}`);
  }
  if (input.requiresSideEffect) {
    const finding = validateSideEffectAuthorization(
      input.sideEffectAuthorization,
      {
        tenantId: input.tenantId,
        contractHash: input.contractHash,
        outputHash: input.outputHash,
        policyHash: input.policyHash,
      }
    );
    if (finding) throw new Error(`${finding.code}:${finding.message}`);
  }
  return input.result;
}
