export type IntegratedAdmissionInput = {
  tenantId: string;
  productId: string;
  environment: "preview" | "staging" | "production";
  contextPackHash: string;
  sourceRevision: string;
  skill: {
    skillId: string;
    tenantId: string;
    productId: string;
    version: string;
    contextPackHash: string;
    sourceRevision: string;
    admitted: boolean;
  };
  gateway: {
    allowed: boolean;
    tenantId: string;
    productId: string;
    environment: "preview" | "staging" | "production";
  };
  releaseCandidate: {
    releaseCandidateId: string;
    tenantId: string;
    productId: string;
    artifactDigest: string;
    contextPackHash: string;
    sourceRevision: string;
    evidenceComplete: boolean;
    immutableVerified: boolean;
  };
  runtime: {
    tenantId: string;
    productId: string;
    environment: "preview" | "staging" | "production";
    artifactDigest: string;
    releaseCandidateId: string;
  };
  untrustedAuthorityWidened: boolean;
};

export class IntegrationHardeningError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "IntegrationHardeningError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function sameScope(input: IntegratedAdmissionInput): boolean {
  return [
    input.skill,
    input.gateway,
    input.releaseCandidate,
    input.runtime,
  ].every(value => value.tenantId === input.tenantId && value.productId === input.productId);
}

export function assertIntegratedAdmission(input: IntegratedAdmissionInput): true {
  if (input.untrustedAuthorityWidened) throw new IntegrationHardeningError("INTEGRATION_TRUST_DENIED");
  if (!sameScope(input)) throw new IntegrationHardeningError("INTEGRATION_SCOPE_MISMATCH");
  if (!input.gateway.allowed) throw new IntegrationHardeningError("INTEGRATION_GATEWAY_DENIED");
  if (input.gateway.environment !== input.environment || input.runtime.environment !== input.environment) {
    throw new IntegrationHardeningError("INTEGRATION_RUNTIME_MISMATCH");
  }
  if (!input.skill.admitted) throw new IntegrationHardeningError("INTEGRATION_SKILL_DENIED");
  if (input.skill.contextPackHash !== input.contextPackHash || input.skill.sourceRevision !== input.sourceRevision) {
    throw new IntegrationHardeningError("INTEGRATION_EVIDENCE_STALE");
  }
  if (!input.releaseCandidate.evidenceComplete || !input.releaseCandidate.immutableVerified) {
    throw new IntegrationHardeningError("INTEGRATION_RC_DENIED");
  }
  if (input.releaseCandidate.contextPackHash !== input.contextPackHash || input.releaseCandidate.sourceRevision !== input.sourceRevision) {
    throw new IntegrationHardeningError("INTEGRATION_EVIDENCE_STALE");
  }
  if (input.runtime.releaseCandidateId !== input.releaseCandidate.releaseCandidateId || input.runtime.artifactDigest !== input.releaseCandidate.artifactDigest) {
    throw new IntegrationHardeningError("INTEGRATION_RUNTIME_MISMATCH");
  }
  return true;
}
