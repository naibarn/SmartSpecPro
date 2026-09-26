import { describe, expect, it } from "vitest";

import { assertIntegratedAdmission } from "../integrationHardeningContracts";

const baseInput = {
  tenantId: "tenant-acme",
  productId: "product-acme",
  environment: "staging" as const,
  contextPackHash: "a".repeat(64),
  sourceRevision: "git:head123",
  skill: {
    skillId: "skill-research",
    tenantId: "tenant-acme",
    productId: "product-acme",
    version: "1.0.0",
    contextPackHash: "a".repeat(64),
    sourceRevision: "git:head123",
    admitted: true,
  },
  gateway: { allowed: true, tenantId: "tenant-acme", productId: "product-acme", environment: "staging" as const },
  releaseCandidate: {
    releaseCandidateId: "rc-001",
    tenantId: "tenant-acme",
    productId: "product-acme",
    artifactDigest: "d".repeat(64),
    contextPackHash: "a".repeat(64),
    sourceRevision: "git:head123",
    evidenceComplete: true,
    immutableVerified: true,
  },
  runtime: { tenantId: "tenant-acme", productId: "product-acme", environment: "staging" as const, artifactDigest: "d".repeat(64), releaseCandidateId: "rc-001" },
  untrustedAuthorityWidened: false,
};

describe("W9 integration hardening contracts", () => {
  it("accepts a fully aligned identity-gateway-context-skill-RC-runtime path", () => {
    expect(assertIntegratedAdmission(baseInput)).toBe(true);
  });

  it("rejects cross-tenant/product identity recombination", () => {
    expect(() => assertIntegratedAdmission({ ...baseInput, runtime: { ...baseInput.runtime, tenantId: "tenant-other" } })).toThrow("INTEGRATION_SCOPE_MISMATCH");
    expect(() => assertIntegratedAdmission({ ...baseInput, releaseCandidate: { ...baseInput.releaseCandidate, productId: "product-other" } })).toThrow("INTEGRATION_SCOPE_MISMATCH");
  });

  it("rejects gateway denial, trust escalation and stale context/Skill evidence", () => {
    expect(() => assertIntegratedAdmission({ ...baseInput, gateway: { ...baseInput.gateway, allowed: false } })).toThrow("INTEGRATION_GATEWAY_DENIED");
    expect(() => assertIntegratedAdmission({ ...baseInput, untrustedAuthorityWidened: true })).toThrow("INTEGRATION_TRUST_DENIED");
    expect(() => assertIntegratedAdmission({ ...baseInput, skill: { ...baseInput.skill, sourceRevision: "git:old" } })).toThrow("INTEGRATION_EVIDENCE_STALE");
  });

  it("rejects incomplete or mutable RCs and runtime artifact/environment drift", () => {
    expect(() => assertIntegratedAdmission({ ...baseInput, releaseCandidate: { ...baseInput.releaseCandidate, evidenceComplete: false } })).toThrow("INTEGRATION_RC_DENIED");
    expect(() => assertIntegratedAdmission({ ...baseInput, releaseCandidate: { ...baseInput.releaseCandidate, immutableVerified: false } })).toThrow("INTEGRATION_RC_DENIED");
    expect(() => assertIntegratedAdmission({ ...baseInput, runtime: { ...baseInput.runtime, artifactDigest: "c".repeat(64) } })).toThrow("INTEGRATION_RUNTIME_MISMATCH");
    expect(() => assertIntegratedAdmission({ ...baseInput, runtime: { ...baseInput.runtime, environment: "production" } })).toThrow("INTEGRATION_RUNTIME_MISMATCH");
  });
});
